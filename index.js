const express = require('express');
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    makeCacheableSignalKeyStore, 
    Browsers,
    fetchLatestBaileysVersion 
} = require("@whiskeysockets/baileys");
const pino = require('pino');
const fs = require('fs-extra');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 3000;
const tempDir = path.resolve(__dirname, 'leesha_v4');
fs.ensureDirSync(tempDir);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/pair', async (req, res) => {
    let num = req.query.number;
    if (!num) return res.status(400).json({ error: "Number required" });

    num = num.replace(/[^0-9]/g, '');
    
    // Create a totally unique ID to avoid conflicts
    const sessionID = `ID_${num}_${Math.floor(Math.random() * 10000)}`;
    const sessionFolder = path.join(tempDir, sessionID);

    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
        const { version } = await fetchLatestBaileysVersion();

        const conn = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
            },
            printQRInTerminal: false,
            logger: pino({ level: "fatal" }),
            // --- THE BYPASS IDENTITY ---
            browser: ["Chrome (Linux)", "", ""], 
            syncFullHistory: false,
            // ---------------------------
            getMessage: async () => { return { conversation: 'hi' } }
        });

        if (!conn.authState.creds.registered) {
            await delay(3000); 
            const code = await conn.requestPairingCode(num);
            if (!res.headersSent) {
                res.json({ code: code });
            }
        }

        conn.ev.on('creds.update', saveCreds);

        conn.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === 'open') {
                console.log(`[${num}] SUCCESS!`);
                await delay(7000); // Wait for internal sync
                
                const credsFile = path.join(sessionFolder, 'creds.json');
                if (fs.existsSync(credsFile)) {
                    const creds = await fs.readJSON(credsFile);
                    const sessionStr = Buffer.from(JSON.stringify(creds)).toString('base64');
                    const finalID = `QueenLeesha~${sessionStr}`;
                    
                    const msg = `👑 *QUEEN LEESHA MD V1* 👑\n\n` +
                                `📦 *Your Session ID:* \n\n\`\`\`${finalID}\`\`\`\n\n` +
                                `🚀 *Copy and Paste this ID into your SESSION_ID variable.*`;

                    await conn.sendMessage(conn.user.id, { text: msg });
                }
                
                // End connection and wipe temp files to prevent Railway errors
                await delay(2000);
                conn.end();
                await fs.remove(sessionFolder).catch(() => {});
            }

            if (connection === 'close') {
                const reason = lastDisconnect?.error?.output?.statusCode;
                // If it wasn't a normal logout, clean the folder to allow retry
                if (reason !== 408) {
                    await fs.remove(sessionFolder).catch(() => {});
                }
            }
        });

    } catch (err) {
        console.error("Pairing Error:", err);
        if (!res.headersSent) res.status(500).json({ error: "Server error. Refresh." });
    }
});

app.listen(PORT, () => console.log(`Queen Leesha V4 on ${PORT}`));
