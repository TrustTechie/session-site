const express = require('express');
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    makeCacheableSignalKeyStore, 
    Browsers,
    fetchLatestBaileysVersion,
    DisconnectReason
} = require("@whiskeysockets/baileys");
const pino = require('pino');
const fs = require('fs-extra');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 3000;

// Path to store temporary session folders
const sessionPath = path.join(__dirname, 'sessions');

// Ensure the session directory is wiped on every server restart (Crucial for Railway)
fs.emptyDirSync(sessionPath);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/pair', async (req, res) => {
    let phone = req.query.number;
    if (!phone) return res.json({ error: 'Please provide a phone number' });

    phone = phone.replace(/[^0-9]/g, '');
    const id = `Leesha_${phone}_${Math.random().toString(36).substring(7)}`;
    const folder = path.join(sessionPath, id);

    try {
        const { state, saveCreds } = await useMultiFileAuthState(folder);
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            printQRInTerminal: false,
            logger: pino({ level: "fatal" }),
            browser: ["Ubuntu", "Chrome", "20.0.04"], // The most compatible identity
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
            },
            // --- HIGH STABILITY SETTINGS ---
            syncFullHistory: false,
            shouldSyncHistoryMessage: () => false,
            generateHighQualityLinkPreview: false,
            getMessage: async (key) => { return { conversation: 'Queen Leesha' } }
        });

        // Request Code
        if (!sock.authState.creds.registered) {
            await delay(1500); // Wait for socket boot
            const code = await sock.requestPairingCode(phone);
            if (!res.headersSent) {
                res.json({ code });
            }
        }

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === 'open') {
                console.log(`[${phone}] Connected Successfully`);
                await delay(10000); // Important: Give it 10 seconds to finish "Logging in"

                const credsFile = path.join(folder, 'creds.json');
                const creds = await fs.readJSON(credsFile);
                
                // turn to base64
                const sessionID = Buffer.from(JSON.stringify(creds)).toString('base64');
                const finalStr = `QueenLeesha~${sessionID}`;

                const successMsg = `*SUCCESS - QUEEN LEESHA MD V1*\n\n` +
                                   `📦 *Your Session ID:* \n\n\`\`\`${finalStr}\`\`\`\n\n` +
                                   `⚠️ *Instructions:* Copy the code above and paste it into your bot variables. Do not share this with anyone!\n\n` +
                                   `🚀 *Powered by devtrust*`;

                await sock.sendMessage(sock.user.id, { text: successMsg });
                
                // Cleanup
                await delay(3000);
                sock.logout(); 
                await fs.remove(folder);
            }

            if (connection === 'close') {
                const reason = lastDisconnect?.error?.output?.statusCode;
                if (reason !== DisconnectReason.loggedOut) {
                    // If it closes due to an error, we wipe the folder so user can retry
                    await fs.remove(folder).catch(() => {});
                }
            }
        });

    } catch (err) {
        console.error(err);
        if (!res.headersSent) res.status(500).send("Internal Server Error");
    }
});

app.listen(PORT, () => console.log(`Queen Leesha API live on ${PORT}`));
