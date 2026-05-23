const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, delay, jidDecode, makeCacheableSignalKeyStore, Browsers } = require("@whiskeysockets/baileys");
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

app.get('/pair', async (req, res) => {
    let num = req.query.number;
    if (!num) return res.status(400).json({ error: "Number is required" });

    // Clean number
    num = num.replace(/[^0-9]/g, '');

    const sessionID = `session_${Math.floor(Math.random() * 10000)}`;
    const { state, saveCreds } = await useMultiFileAuthState(`./temp/${sessionID}`);

    try {
        const conn = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
            },
            printQRInTerminal: false,
            logger: pino({ level: "fatal" }),
            browser: Browsers.ubuntu("Chrome")
        });

        if (!conn.authState.creds.registered) {
            let code = await conn.requestPairingCode(num);
            res.json({ code: code });
        }

        conn.ev.on('creds.update', saveCreds);
        conn.ev.on('connection.update', async (update) => {
            const { connection } = update;
            if (connection === 'open') {
                await delay(5000);
                
                // Convert creds to Base64 (Session ID)
                const creds = JSON.parse(fs.readFileSync(`./temp/${sessionID}/creds.json`));
                const sessionStr = Buffer.from(JSON.stringify(creds)).toString('base64');
                
                const msg = `👑 *QUEEN LEESHA MD V1 SESSION* 👑\n\n` +
                            `📦 *Your Session ID:* \n\n\`\`\`${sessionStr}\`\`\`\n\n` +
                            `⚠️ *Keep this safe!* Paste this into your bot's CONFIG or Environment Variables.\n\n` +
                            `🚀 *Powered by devtrust*`;

                await conn.sendMessage(conn.user.id, { text: msg });
                
                // Cleanup files after sending
                console.log(`Session ${sessionID} paired and sent to DM.`);
                conn.logout();
                setTimeout(() => { fs.rmSync(`./temp/${sessionID}`, { recursive: true, force: true }); }, 10000);
            }
        });

    } catch (err) {
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
