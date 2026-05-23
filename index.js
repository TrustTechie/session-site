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
const tempDir = path.resolve(__dirname, 'leesha_tmp'); // Changed name to avoid permission issues
fs.ensureDirSync(tempDir);

// --- 1. SERVE THE WEBSITE ---
// This part fixes the "Cannot GET /" error
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- 2. PAIRING LOGIC ---
app.get('/pair', async (req, res) => {
    let num = req.query.number;
    if (!num) return res.status(400).json({ error: "Number required" });

    num = num.replace(/[^0-9]/g, '');
    const sessionID = `session_${Date.now()}`;
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
            browser: Browsers.macOS("Desktop"),
            syncFullHistory: false,
            markOnlineOnConnect: true
        });

        if (!conn.authState.creds.registered) {
            await delay(2000);
            const code = await conn.requestPairingCode(num);
            if (!res.headersSent) {
                res.json({ code: code });
            }
        }

        conn.ev.on('creds.update', saveCreds);

        conn.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === 'open') {
                console.log(`[${num}] Linked!`);
                await delay(5000);
                
                const credsFile = path.join(sessionFolder, 'creds.json');
                const creds = await fs.readJSON(credsFile);
                const sessionStr = Buffer.from(JSON.stringify(creds)).toString('base64');
                const finalID = `QueenLeesha~${sessionStr}`;
                
                const msg = `👑 *QUEEN LEESHA MD V1* 👑\n\n` +
                            `📦 *Your Session ID:* \n\n\`\`\`${finalID}\`\`\`\n\n` +
                            `🚀 *Powered by devtrust*`;

                await conn.sendMessage(conn.user.id, { text: msg });
                
                await delay(3000);
                conn.end();
                await fs.remove(sessionFolder);
            }

            if (connection === 'close') {
                const reason = lastDisconnect?.error?.output?.statusCode;
                if (reason !== 408) { 
                    await fs.remove(sessionFolder).catch(() => {});
                }
            }
        });

    } catch (err) {
        console.error(err);
        if (!res.headersSent) res.status(500).json({ error: "Try again later" });
    }
});

app.listen(PORT, () => console.log(`Server live on ${PORT}`));
