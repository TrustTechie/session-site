const express = require('express');
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    makeCacheableSignalKeyStore, 
    Browsers 
} = require("@whiskeysockets/baileys");
const pino = require('pino');
const fs = require('fs-extra');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 3000;

// Ensure temp directory exists and is writable
const tempDir = path.resolve(__dirname, 'temp');
fs.ensureDirSync(tempDir);

app.get('/pair', async (req, res) => {
    let num = req.query.number;
    if (!num) return res.status(400).json({ error: "Number is required" });

    // Clean number format
    num = num.replace(/[^0-9]/g, '');
    const sessionID = `session_${Date.now()}`;
    const sessionFolder = path.join(tempDir, sessionID);

    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);

        const conn = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
            },
            printQRInTerminal: false,
            logger: pino({ level: "fatal" }),
            browser: Browsers.ubuntu("Chrome") // Important for Railway
        });

        // Generate Pairing Code
        if (!conn.authState.creds.registered) {
            await delay(1500); // Wait for socket to init
            const code = await conn.requestPairingCode(num);
            if (!res.headersSent) {
                res.json({ code: code });
            }
        }

        conn.ev.on('creds.update', saveCreds);

        conn.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === 'open') {
                await delay(5000);
                
                // --- GETTING THE STRING (Session ID) ---
                const credsFile = path.join(sessionFolder, 'creds.json');
                const creds = await fs.readJSON(credsFile);
                
                // Turn JSON into Base64 string
                const sessionStr = Buffer.from(JSON.stringify(creds)).toString('base64');
                const finalID = `QueenLeesha~${sessionStr}`;
                
                const msg = `👑 *QUEEN LEESHA MD V1 SESSION* 👑\n\n` +
                            `📦 *Your Session ID:* \n\n\`\`\`${finalID}\`\`\`\n\n` +
                            `⚠️ *Keep this safe!* Copy and paste this ID into your bot's CONFIG.\n\n` +
                            `🚀 *Powered by devtrust*`;

                await conn.sendMessage(conn.user.id, { text: msg });
                
                // Close socket and delete temp files to keep Railway clean
                await delay(2000);
                conn.end();
                await fs.remove(sessionFolder);
            }

            if (connection === 'close') {
                const reason = lastDisconnect?.error?.output?.statusCode;
                if (reason === 401) {
                    console.log(`[${num}] Connection unauthorized, folder deleted.`);
                    await fs.remove(sessionFolder);
                }
            }
        });

    } catch (err) {
        console.error("Pairing Error:", err);
        if (!res.headersSent) {
            res.status(500).json({ error: "Failed to generate code. Check server logs." });
        }
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
