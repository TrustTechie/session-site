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
const tempDir = path.resolve(__dirname, 'leesha_v6');

// Auto-cleanup on start to keep Railway clean
async function clearSessions() {
    try {
        if (fs.existsSync(tempDir)) {
            await fs.emptyDir(tempDir);
            console.log("♻️ Cache Cleared - Fresh Start Ready");
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
    const sessionID = `V6_${num}_${Math.floor(Math.random() * 1000)}`;
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
            browser: Browsers.macOS("Safari"),
            // --- THE INSTANT LINK FIX ---
            syncFullHistory: false, // Don't download history
            shouldSyncHistoryMessage: () => false, // SHUT DOWN history sync completely
            linkPreviewHighQuality: false, 
            markOnlineOnConnect: true,
            connectTimeoutMs: 60000,
            // ----------------------------
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
                console.log(`[${num}] INSTANT LINK SUCCESS!`);
                await delay(5000); // Wait for keys to save
                
                const credsFile = path.join(sessionFolder, 'creds.json');
                if (fs.existsSync(credsFile)) {
                    const creds = await fs.readJSON(credsFile);
                    // Generate the String
                    const sessionStr = Buffer.from(JSON.stringify(creds)).toString('base64');
                    const finalID = `QueenLeesha~${sessionStr}`;
                    
                    const msg = `👑 *QUEEN LEESHA MD V1* 👑\n\n` +
                                `✅ *Session Linked Successfully!*\n\n` +
                                `📦 *Your Session ID:* \n\n\`\`\`${finalID}\`\`\`\n\n` +
                                `🚀 *Powered by devtrust*`;

                    await conn.sendMessage(conn.user.id, { text: msg });
                }
                
                // Cleanup current session to save space
                await delay(2000);
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
        if (!res.headersSent) res.status(500).json({ error: "Server error. Refresh." });
    }
});

app.listen(PORT, () => console.log(`Queen Leesha V6 Active on ${PORT}`));
