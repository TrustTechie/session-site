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
const tempDir = path.resolve(__dirname, 'leesha_sessions');
fs.ensureDirSync(tempDir);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/pair', async (req, res) => {
    let num = req.query.number;
    if (!num) return res.status(400).json({ error: "Number required" });

    num = num.replace(/[^0-9]/g, '');
    const sessionID = `session_${num}_${Date.now()}`;
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
            // --- THE STABILITY FIX ---
            browser: ["Ubuntu", "Chrome", "20.0.04"], // Standard identity
            syncFullHistory: false,
            generateHighQualityLinkPreview: true,
            connectTimeoutMs: 60000, // 60 seconds
            keepAliveIntervalMs: 10000
        });

        if (!conn.authState.creds.registered) {
            await delay(3000); // Increased delay for Railway stability
            const code = await conn.requestPairingCode(num);
            if (!res.headersSent) {
                res.json({ code: code });
            }
        }

        conn.ev.on('creds.update', saveCreds);

        conn.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === 'open') {
                console.log(`[${num}] Session Linked Successfully!`);
                await delay(5000);
                
                const credsFile = path.join(sessionFolder, 'creds.json');
                if (fs.existsSync(credsFile)) {
                    const creds = await fs.readJSON(credsFile);
                    const sessionStr = Buffer.from(JSON.stringify(creds)).toString('base64');
                    const finalID = `QueenLeesha~${sessionStr}`;
                    
                    const msg = `👑 *QUEEN LEESHA MD V1* 👑\n\n` +
                                `✅ *Session Linked Successfully!*\n\n` +
                                `📦 *Your Session ID:* \n\n\`\`\`${finalID}\`\`\`\n\n` +
                                `🚀 *Use this ID to host your bot.*`;

                    await conn.sendMessage(conn.user.id, { text: msg });
                }
                
                await delay(2000);
                conn.end();
                await fs.remove(sessionFolder);
            }

            if (connection === 'close') {
                const reason = lastDisconnect?.error?.output?.statusCode;
                // Delete failed sessions to prevent "Phone number mismatch" errors
                if (reason === 401 || reason === 515) {
                    await fs.remove(sessionFolder).catch(() => {});
                }
            }
        });

    } catch (err) {
        console.error("Pairing Crash:", err);
        if (!res.headersSent) res.status(500).json({ error: "Connection error. Refresh and try again." });
    }
});

app.listen(PORT, () => console.log(`Stable Server on ${PORT}`));
