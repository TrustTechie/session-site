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

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/pair', async (req, res) => {
    let num = req.query.number;
    if (!num) return res.json({ error: "Number is required" });
    num = num.replace(/[^0-9]/g, '');

    const sessionID = `Final_${num}_${Math.floor(Math.random() * 1000)}`;
    const sessionFolder = path.join(__dirname, 'session_store', sessionID);
    await fs.ensureDir(sessionFolder);

    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
        
        const sock = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
            },
            printQRInTerminal: false,
            logger: pino({ level: "fatal" }),
            // --- THE 'DEVAFFEEZ' STYLE BROWSER BYPASS ---
            browser: ["Chrome (Windows)", "Chrome", "121.0.6167.184"], 
            // --------------------------------------------
            syncFullHistory: false,
            shouldSyncHistoryMessage: () => false,
            connectTimeoutMs: 120000,
            defaultQueryTimeoutMs: 0,
            keepAliveIntervalMs: 30000,
        });

        if (!sock.authState.creds.registered) {
            // WAIT 5 SECONDS before requesting to avoid 405 error
            await delay(5000); 
            console.log(`[LOG] Generating code for: ${num}`);
            try {
                const code = await sock.requestPairingCode(num);
                if (!res.headersSent) res.json({ code: code });
            } catch (pairingError) {
                console.error("[PAIR ERROR]", pairingError);
                if (!res.headersSent) res.json({ error: "WhatsApp rejected the request (405). Try again in 5 mins." });
            }
        }

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === 'open') {
                console.log(`[SUCCESS] ${num} Linked!`);
                await delay(10000); // Give the phone time to stop loading

                const creds = await fs.readJSON(path.join(sessionFolder, 'creds.json'));
                const sessionStr = Buffer.from(JSON.stringify(creds)).toString('base64');
                const finalID = `QueenLeesha~${sessionStr}`;

                const successText = `👑 *QUEEN LEESHA MD V1* 👑\n\n` +
                                   `✅ *LINK SUCCESSFUL!*\n\n` +
                                   `📦 *SESSION ID:* \n\n\`\`\`${finalID}\`\`\`\n\n` +
                                   `🚀 *Use this ID to host your bot now!*`;

                await sock.sendMessage(sock.user.id, { text: successText });
                
                await delay(5000);
                sock.end();
                await fs.remove(sessionFolder);
            }

            if (connection === 'close') {
                const reason = lastDisconnect?.error?.output?.statusCode;
                console.log(`[CLOSE] ${num} closed with status: ${reason}`);
                // Only wipe if it's not a temporary logout
                if (reason !== 408) await fs.remove(sessionFolder).catch(() => {});
            }
        });

    } catch (err) {
        console.error("[CRASH]", err);
        if (!res.headersSent) res.status(500).json({ error: "Server error." });
    }
});

app.listen(PORT, () => console.log(`Queen Leesha V10 online on ${PORT}`));
