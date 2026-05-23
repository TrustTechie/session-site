const express = require("express");
const fs = require("fs");
const path = require("path");
const pino = require("pino");

const {
default: makeWASocket,
useMultiFileAuthState,
Browsers,
fetchLatestBaileysVersion,
DisconnectReason
} = require("@whiskeysockets/baileys");

const { Boom } = require("@hapi/boom");

const app = express();

app.use(express.json());
app.use(express.static("public"));

// ================================
// PAIR ROUTE
// ================================

app.post("/pair", async (req, res) => {

const num = req.body.number;

if (!num) {
return res.json({
status: false,
msg: "Enter WhatsApp number"
});
}

const cleanedNum =
num.replace(/[^0-9]/g, "");

const sessionId =
Date.now().toString();

const sessionPath =
`./temp/${sessionId}`;

// CREATE TEMP
if (!fs.existsSync("./temp")) {
fs.mkdirSync("./temp");
}

if (!fs.existsSync(sessionPath)) {
fs.mkdirSync(sessionPath);
}

// START SOCKET
const { state, saveCreds } =
await useMultiFileAuthState(sessionPath);

const { version } =
await fetchLatestBaileysVersion();

const sock = makeWASocket({
version,
logger: pino({ level: "silent" }),
printQRInTerminal: false,
auth: state,
browser: Browsers.ubuntu("Chrome"),

markOnlineOnConnect: false,
syncFullHistory: false
});

// SAVE CREDS
sock.ev.on("creds.update", saveCreds);

// ================================
// GENERATE CODE
// ================================

if (!sock.authState.creds.registered) {

setTimeout(async () => {

try {

let code =
await sock.requestPairingCode(cleanedNum);

code =
code?.match(/.{1,4}/g)?.join("-") || code;

console.log("PAIR CODE:", code);

return res.json({
status: true,
code
});

} catch (err) {

console.log(err);

return res.json({
status: false,
msg: "Failed to generate code"
});

}

}, 3000);

}

// ================================
// CONNECTION UPDATE
// ================================

sock.ev.on("connection.update", async (update) => {

const {
connection,
lastDisconnect
} = update;

console.log(update);

if (connection === "open") {

console.log("CONNECTED SUCCESSFULLY");

// WAIT SMALL
await new Promise(resolve =>
setTimeout(resolve, 5000)
);

try {

const credsPath =
path.join(sessionPath, "creds.json");

if (!fs.existsSync(credsPath)) {
console.log("creds.json missing");
return;
}

// READ CREDS
const creds =
fs.readFileSync(credsPath);

const encoded =
Buffer.from(creds).toString("base64");

// SEND MESSAGE
await sock.sendMessage(
sock.user.id,
{
text:
`✅ Session Generated Successfully

🔐 Encoded Session:

${encoded}`
}
);

// SEND FILE
await sock.sendMessage(
sock.user.id,
{
document: fs.readFileSync(credsPath),
mimetype: "application/json",
fileName: "creds.json"
}
);

console.log("SESSION SENT");

} catch (err) {

console.log("SEND ERROR:", err);

}

}

// ================================
// CLOSE
// ================================

if (connection === "close") {

let reason =
new Boom(lastDisconnect?.error)
?.output.statusCode;

console.log("CLOSED:", reason);

if (reason !== DisconnectReason.loggedOut) {

console.log("Reconnecting...");

}

}

});

});

// ================================
// HOME
// ================================

app.get("/", (req, res) => {
res.send("QUEEN LEESHA SESSION GENERATOR ACTIVE");
});

// ================================
// START SERVER
// ================================

const PORT =
process.env.PORT || 3000;

app.listen(PORT, () => {
console.log(`Server running on ${PORT}`);
});
