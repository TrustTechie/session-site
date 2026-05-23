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
const tempDir = path.resolve(__dirname, 'temp');
fs.ensureDirSync(tempDir);

app.get('/pair', async (req, res) => {
    let num = req.query.number;
    if (!num) return res.status(400).json({ error: "Number required" });

    num = num.replace(/[^0-9]/g, '');
    const sessionID = `session_${Date.now()}`;
    const sessionFolder = path.join(tempDir, sessionID);

    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
        const { version } = await fetchLatestBaileysVersion(); // Sync with latest WA version

        const conn = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
            },
            printQRInTerminal: false,
            logger: pino({ level: "fatal" }),
            browser: Browsers.macOS("Desktop"), // Changed to macOS Desktop for better stability
            syncFullHistory: false, // Speeds up the login process significantly
            markOnlineOnConnect: true
        });

        if (!conn.authState.creds.registered) {
            await delay(2000); // Give it time to stabilize
            const code = await conn.requestPairingCode(num);
            if (!res.headersSent) {
                res.json({ code: code });
            }
        }

        conn.ev.on('creds.update', saveCreds);

        conn.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === 'open') {
                console.log(`[${num}] Successfully Logged In!`);
                await delay(5000);
                
                // --- GENERATING THE SESSION ID ---
                const credsFile = path.join(sessionFolder, 'creds.json');
                const creds = await fs.readJSON(credsFile);
                const sessionStr = Buffer.from(JSON.stringify(creds)).toString('base64');
                const finalID = `QueenLeesha~${sessionStr}`;
                
                const msg = `👑 *QUEEN LEESHA MD V1* 👑\n\n` +
                            `📦 *Your Session ID:* \n\n\`\`\`${finalID}\`\`\`\n\n` +
                            `🚀 *Copy this string and use it for hosting.*`;

                await conn.sendMessage(conn.user.id, { text: msg });
                
                // Auto-cleanup
                await delay(3000);
                conn.end();
                await fs.remove(sessionFolder);
            }

            if (connection === 'close') {
                const reason = lastDisconnect?.error?.output?.statusCode;
                // If it closes due to an error, we clear the temp folder
                if (reason !== 408) { 
                    await fs.remove(sessionFolder).catch(() => {});
                }
            }
        });

    } catch (err) {
        console.error("Critical Error:", err);
        if (!res.headersSent) res.status(500).json({ error: "Server busy. Try again." });
    }
});

app.listen(PORT, () => console.log(`Stable Server on Port ${PORT}`));
