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

// Serve the index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/pair', async (req, res) => {
    let num = req.query.number;
    if (!num) return res.json({ error: "Number is required" });
    num = num.replace(/[^0-9]/g, '');

    // Every attempt gets a clean, unique folder
    const sessionID = `Auth_${num}_${Date.now()}`;
    const sessionFolder = path.join(__dirname, 'auth_sessions', sessionID);
    
    // Ensure parent directory exists
    await fs.ensureDir(path.join(__dirname, 'auth_sessions'));

    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
        
        const sock = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
            },
            printQRInTerminal: false,
            logger: pino({ level: "fatal" }),
            // --- THE BYPASS IDENTITY ---
            browser: [ 'Ubuntu', 'Chrome', '20.0.04' ], 
            // ---------------------------
            syncFullHistory: false,
            shouldSyncHistoryMessage: () => false,
            connectTimeoutMs: 120000, // 2 minutes patience
            defaultQueryTimeoutMs: 0,
            keepAliveIntervalMs: 30000,
        });

        if (!sock.authState.creds.registered) {
            await delay(2500); 
            console.log(`[LOG] Requesting code for: ${num}`);
            const code = await sock.requestPairingCode(num);
            if (!res.headersSent) res.json({ code: code });
        }

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === 'open') {
                console.log(`[SUCCESS] ${num} Linked! Generating String...`);
                await delay(10000); // Wait for the phone to clear the "Logging in" screen

                try {
                    const credsFile = path.join(sessionFolder, 'creds.json');
                    const creds = await fs.readJSON(credsFile);
                    const sessionStr = Buffer.from(JSON.stringify(creds)).toString('base64');
                    const finalID = `QueenLeesha~${sessionStr}`;

                    const successText = `👑 *QUEEN LEESHA MD V1* 👑\n\n` +
                                       `✅ *LINK SUCCESSFUL!*\n\n` +
                                       `📦 *YOUR SESSION ID:* \n\n\`\`\`${finalID}\`\`\`\n\n` +
                                       `🚀 *Instructions:* Copy the long string above and use it as your SESSION_ID.\n\n` +
                                       `© _devtrust_`;

                    await sock.sendMessage(sock.user.id, { text: successText });
                    console.log(`[DONE] Session ID sent to DM of ${num}`);
                    
                    // Kill connection and delete folder after 5 seconds
                    await delay(5000);
                    sock.end();
                    await fs.remove(sessionFolder);
                } catch (readError) {
                    console.error("[ERROR] Failed to read creds.json:", readError);
                }
            }

            if (connection === 'close') {
                const reason = lastDisconnect?.error?.output?.statusCode;
                console.log(`[CLOSE] Connection closed. Reason: ${reason}`);
                if (reason !== DisconnectReason.loggedOut) {
                    // Cleanup folder if it failed to link
                    await fs.remove(sessionFolder).catch(() => {});
                }
            }
        });

    } catch (err) {
        console.error("[CRASH]", err);
        if (!res.headersSent) res.status(500).json({ error: "Server error. Try again." });
    }
});

app.listen(PORT, () => console.log(`Queen Leesha V9 online on port ${PORT}`));
