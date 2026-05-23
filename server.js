const express = require("express");
const fs = require("fs");
const path = require("path");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  Browsers,
  fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");

const P = require("pino");

const app = express();

app.use(express.json());
app.use(express.static("public"));

const sessions = {};

app.post("/pair", async (req, res) => {
  const number = req.body.number;

  if (!number) {
    return res.json({
      status: false,
      msg: "Enter phone number"
    });
  }

  try {
    const sessionId = Date.now().toString();

    const sessionPath = `./temp/${sessionId}`;

    const { state, saveCreds } =
      await useMultiFileAuthState(sessionPath);

    const { version } =
      await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      auth: state,
      version,
      logger: P({ level: "silent" }),
      browser: Browsers.macOS("Chrome")
    });

    sessions[sessionId] = sock;

    sock.ev.on("creds.update", saveCreds);

    if (!sock.authState.creds.registered) {
      setTimeout(async () => {
        try {
          let code =
            await sock.requestPairingCode(number);

          code =
            code.match(/.{1,4}/g)?.join("-") || code;

          res.json({
            status: true,
            code,
            sessionId
          });

        } catch (e) {
          console.log(e);
        }
      }, 3000);
    }

    sock.ev.on("connection.update", async (update) => {
      const { connection } = update;

      if (connection === "open") {

        const credsPath =
          path.join(sessionPath, "creds.json");

        const creds = fs.readFileSync(credsPath);

        const encoded =
          Buffer.from(creds).toString("base64");

        // SEND SESSION TO USER
        await sock.sendMessage(
          sock.user.id,
          {
            text:
`✅ Session Generated Successfully

🔐 Encoded Session:
${encoded}`
          }
        );

        // SEND creds.json FILE
        await sock.sendMessage(
          sock.user.id,
          {
            document: credsPath,
            mimetype: "application/json",
            fileName: "creds.json"
          }
        );

        console.log("SESSION SENT");
      }
    });

  } catch (err) {
    console.log(err);

    res.json({
      status: false,
      msg: "Error generating code"
    });
  }
});

app.listen(3000, () => {
  console.log("Server running");
});
