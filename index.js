const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const pino = require('pino');
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    makeCacheableSignalKeyStore, 
    Browsers,
    DisconnectReason 
} = require("@whiskeysockets/baileys");

const app = express();
const PORT = process.env.PORT || 3000;
const sessionDir = path.join(__dirname, 'leesha_v8');

// Wipe Railway junk data on startup
fs.emptyDirSync(sessionDir);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/pair', async (req, res) => {
    let num = req.query.number;
    if (!num) return res.json({ error: "Number required" });
    num = num.replace(/[^0-9]/g, '');

    const id = `LINK_${num}_${Date.now()}`;
    const folder = path.join(sessionDir, id);

    try {
        const { state, saveCreds } = await useMultiFileAuthState(folder);
        
        const sock = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
            },
            printQRInTerminal: false,
            logger: pino({ level: "fatal" }),
            browser: Browsers.macOS("Chrome"), // Stable identity
            
            // --- V8 FORCE-LINK LOGIC ---
            syncFullHistory: false,
            shouldSyncHistoryMessage: () => false,
            connectTimeoutMs: 120000, // Wait 2 minutes for handshake
            defaultQueryTimeoutMs: 0,
            keepAliveIntervalMs: 20000,
            generateHighQualityLinkPreview: false,
            // ---------------------------
        });

        if (!sock.authState.creds.registered) {
            await delay(3000);
            const code = await sock.requestPairingCode(num);
            if (!res.headersSent) res.json({ code: code });
        }

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === 'open') {
                console.log(`[${num}] LOGGED IN!`);
                await delay(10000); // Wait for the phone to stop "Logging in"

                const creds = await fs.readJSON(path.join(folder, 'creds.json'));
                const sessionStr = Buffer.from(JSON.stringify(creds)).toString('base64');
                const finalID = `QueenLeesha~${sessionStr}`;

                const resultText = `👑 *QUEEN LEESHA MD V1* 👑\n\n` +
                                   `✅ *LINK SUCCESSFUL!*\n\n` +
                                   `📦 *SESSION ID:* \n\n\`\`\`${finalID}\`\`\`\n\n` +
                                   `🚀 *Instructions:* Copy the ID above and use it to start your bot. Keep it safe!\n\n` +
                                   `© _devtrust_`;

                // Send to the user's own number
                await sock.sendMessage(sock.user.id, { text: resultText });
                
                // Disconnect gracefully
                await delay(5000);
                sock.end();
                await fs.remove(folder).catch(() => {});
            }

            if (connection === 'close') {
                const reason = lastDisconnect?.error?.output?.statusCode;
                if (reason !== DisconnectReason.loggedOut) {
                    // Cleanup failed folder
                    await fs.remove(folder).catch(() => {});
                }
            }
        });

    } catch (err) {
        console.error(err);
        if (!res.headersSent) res.status(500).json({ error: "Server error. Refresh." });
    }
});

app.listen(PORT, () => console.log(`Queen Leesha V8 live on ${PORT}`));
