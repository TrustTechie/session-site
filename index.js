const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const pino = require('pino');
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    makeCacheableSignalKeyStore, 
    Browsers 
} = require("@whiskeysockets/baileys");

const app = express();
const PORT = process.env.PORT || 3000;

// Serve the index.html file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/pair', async (req, res) => {
    let phone = req.query.number;
    if (!phone) return res.json({ error: "Please enter a number" });
    phone = phone.replace(/[^0-9]/g, '');

    const sessionID = `Session_${Date.now()}`;
    const folder = path.join(__dirname, 'auth', sessionID);

    try {
        const { state, saveCreds } = await useMultiFileAuthState(folder);
        
        const sock = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
            },
            printQRInTerminal: false,
            logger: pino({ level: "fatal" }),
            browser: Browsers.macOS("Safari"),
            // --- CRITICAL FIX FOR INFINITE LOADING ---
            syncFullHistory: false, 
            shouldSyncHistoryMessage: () => false, 
            // ------------------------------------------
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 0,
            keepAliveIntervalMs: 10000,
            emitOwnEvents: true,
            fireInitQueries: false,
            generateHighQualityLinkPreview: false
        });

        if (!sock.authState.creds.registered) {
            await delay(1500);
            const code = await sock.requestPairingCode(phone);
            if (!res.headersSent) res.json({ code: code });
        }

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === 'open') {
                console.log(`[${phone}] Connected!`);
                await delay(5000); // Wait for the handshake to finish

                const credsFile = path.join(folder, 'creds.json');
                const creds = await fs.readJSON(credsFile);
                const sessionStr = Buffer.from(JSON.stringify(creds)).toString('base64');
                const finalID = `QueenLeesha~${sessionStr}`;

                const text = `👑 *QUEEN LEESHA MD V1* 👑\n\n` +
                             `✅ *LINK SUCCESSFUL!*\n\n` +
                             `📦 *YOUR SESSION ID:* \n\n\`\`\`${finalID}\`\`\`\n\n` +
                             `🚀 *Instructions:* Copy the long string above and use it to host your bot. Keep it private!`;

                await sock.sendMessage(sock.user.id, { text });
                
                // Cleanup to save Railway memory
                await delay(2000);
                sock.end();
                await fs.remove(folder).catch(() => {});
            }

            if (connection === 'close') {
                // If the link fails, wipe the folder so we can try fresh next time
                const reason = lastDisconnect?.error?.output?.statusCode;
                if (reason !== 408) {
                    await fs.remove(folder).catch(() => {});
                }
            }
        });

    } catch (err) {
        console.error(err);
        if (!res.headersSent) res.status(500).json({ error: "Server Error. Refresh." });
    }
});

app.listen(PORT, () => console.log(`Queen Leesha running on port ${PORT}`));
