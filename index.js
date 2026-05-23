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
const sessionPath = path.join(__dirname, 'leesha_v11');

// Hard wipe on start to clear the "Couldn't Link" state
fs.emptyDirSync(sessionPath);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/pair', async (req, res) => {
    let num = req.query.number;
    if (!num) return res.json({ error: "Number is required" });
    num = num.replace(/[^0-9]/g, '');

    const id = `V11_${num}_${Date.now()}`;
    const folder = path.join(sessionPath, id);

    try {
        const { state, saveCreds } = await useMultiFileAuthState(folder);
        
        const sock = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
            },
            printQRInTerminal: false,
            logger: pino({ level: "fatal" }),
            // --- THE DESKTOP APP BYPASS ---
            browser: Browsers.macOS("Desktop"), 
            // ------------------------------
            syncFullHistory: false,
            shouldSyncHistoryMessage: () => false,
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 0,
            maxCachedMessages: 0,
        });

        if (!sock.authState.creds.registered) {
            await delay(3000); 
            console.log(`[PAIRING] Generating for: ${num}`);
            try {
                const code = await sock.requestPairingCode(num);
                if (!res.headersSent) res.json({ code: code });
            } catch (err) {
                console.error("Pairing Error:", err);
                if (!res.headersSent) res.json({ error: "Service busy. Refresh in 1 min." });
            }
        }

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === 'open') {
                console.log(`[SUCCESS] ${num} Connected!`);
                await delay(8000); 

                const creds = await fs.readJSON(path.join(folder, 'creds.json'));
                const sessionStr = Buffer.from(JSON.stringify(creds)).toString('base64');
                const finalID = `QueenLeesha~${sessionStr}`;

                const successText = `👑 *QUEEN LEESHA MD V1* 👑\n\n` +
                                   `✅ *LINK SUCCESSFUL!*\n\n` +
                                   `📦 *SESSION ID:* \n\n\`\`\`${finalID}\`\`\`\n\n` +
                                   `🚀 *Instructions:* Copy this long code and use it to host your bot.`;

                await sock.sendMessage(sock.user.id, { text: successText });
                
                await delay(3000);
                sock.end();
                await fs.remove(folder);
            }

            if (connection === 'close') {
                const reason = lastDisconnect?.error?.output?.statusCode;
                console.log(`[CLOSED] Reason: ${reason}`);
                if (reason !== 408) await fs.remove(folder).catch(() => {});
            }
        });

    } catch (err) {
        console.error("[CRASH]", err);
        if (!res.headersSent) res.status(500).json({ error: "System error." });
    }
});

app.listen(PORT, () => console.log(`Queen Leesha V11 on ${PORT}`));
