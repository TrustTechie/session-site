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
const tempDir = path.resolve(__dirname, 'leesha_v7');

// Railway Wipe Logic
async function clearSessions() {
    try {
        if (fs.existsSync(tempDir)) {
            await fs.emptyDir(tempDir);
            console.log("♻️ System Wiped - Fresh IP Handshake Ready");
        } else {
            await fs.ensureDir(tempDir);
        }
    } catch (err) {}
}
clearSessions();

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/pair', async (req, res) => {
    let num = req.query.number;
    if (!num) return res.status(400).json({ error: "Number required" });

    num = num.replace(/[^0-9]/g, '');
    const sessionID = `V7_${num}_${Math.floor(Math.random() * 500)}`;
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
            browser: ["Mac OS", "Chrome", "121.0.6167.184"], // High success version
            
            // --- THE V7 HANDSHAKE BYPASS ---
            syncFullHistory: false,
            shouldSyncHistoryMessage: () => false,
            patchMessageBeforeSending: (message) => { return message; },
            linkPreviewHighQuality: false,
            markOnlineOnConnect: false, // Don't try to go online until finished
            connectTimeoutMs: 120000, // Wait 2 minutes for slow Railway handshake
            defaultQueryTimeoutMs: 0,
            retryRequestDelayMs: 5000,
            // -------------------------------
        });

        if (!conn.authState.creds.registered) {
            await delay(4000); 
            const code = await conn.requestPairingCode(num);
            if (!res.headersSent) {
                res.json({ code: code });
            }
        }

        conn.ev.on('creds.update', saveCreds);

        conn.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === 'open') {
                console.log(`[${num}] V7 BYPASS SUCCESS!`);
                await delay(10000); // Important: Wait longer for keys to finish writing
                
                const credsFile = path.join(sessionFolder, 'creds.json');
                if (fs.existsSync(credsFile)) {
                    const creds = await fs.readJSON(credsFile);
                    const sessionStr = Buffer.from(JSON.stringify(creds)).toString('base64');
                    const finalID = `QueenLeesha~${sessionStr}`;
                    
                    const msg = `👑 *QUEEN LEESHA MD V1* 👑\n\n` +
                                `✅ *Session Linked Successfully!*\n\n` +
                                `📦 *Your Session ID:* \n\n\`\`\`${finalID}\`\`\`\n\n` +
                                `🚀 *Copy and Paste this ID into your bot variables.*`;

                    await conn.sendMessage(conn.user.id, { text: msg });
                }
                
                await delay(3000);
                conn.end();
                await fs.remove(sessionFolder).catch(() => {});
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
        if (!res.headersSent) res.status(500).json({ error: "API Timeout. Try again." });
    }
});

app.listen(PORT, () => console.log(`Queen Leesha V7 Ready`));
