const express = require("express");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const {
default: makeWASocket,
useMultiFileAuthState,
Browsers,
fetchLatestBaileysVersion,
DisconnectReason
} = require("@whiskeysockets/baileys");

const P = require("pino");

const app = express();

app.use(express.json());
app.use(express.static("public"));

const sessions = {};

// ================================
// PAIR ROUTE
// ================================

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

// CREATE TEMP FOLDERS
if (!fs.existsSync("./temp")) {
fs.mkdirSync("./temp");
}

if (!fs.existsSync(sessionPath)) {
fs.mkdirSync(sessionPath);
}

// AUTH STATE
const { state, saveCreds } =
await useMultiFileAuthState(sessionPath);

// BAILEYS VERSION
const { version } =
await fetchLatestBaileysVersion();

// SOCKET
const sock = makeWASocket({
auth: state,
version,
logger: P({ level: "silent" }),
browser: Browsers.macOS("Chrome"),

printQRInTerminal: false,
markOnlineOnConnect: false,
syncFullHistory: false
});

sessions[sessionId] = sock;

// SAVE CREDS
sock.ev.on("creds.update", saveCreds);

// ================================
// GENERATE PAIR CODE
// ================================

if (!sock.authState.creds.registered) {

setTimeout(async () => {

try {

let code =
await sock.requestPairingCode(number);

code =
code?.match(/.{1,4}/g)?.join("-") || code;

console.log("PAIR CODE:", code);

res.json({
status: true,
code,
sessionId
});

} catch (err) {

console.log("PAIR ERROR:", err);

res.json({
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

console.log("CONNECTED");

try {

const credsPath =
path.join(sessionPath, "creds.json");

if (!fs.existsSync(credsPath)) {
console.log("creds.json not found");
return;
}

const creds =
fs.readFileSync(credsPath);

const encoded =
Buffer.from(creds).toString("base64");

// SEND ENCODED SESSION
await sock.sendMessage(
sock.user.id,
{
text:
`✅ Session Generated Successfully

🔐 Encoded Session:

${encoded}`
}
);

// SEND CREDS.JSON FILE
await sock.sendMessage(
sock.user.id,
{
document: {
url: credsPath
},
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
// RECONNECT
// ================================

if (connection === "close") {

const reason =
lastDisconnect?.error?.output?.statusCode;

console.log("CLOSED:", reason);

if (reason !== DisconnectReason.loggedOut) {

console.log("Reconnecting...");

}

}

});

} catch (err) {

console.log("MAIN ERROR:", err);

res.json({
status: false,
msg: "Server Error"
});

}

});

// ================================
// HOME ROUTE
// ================================

app.get("/", async (req, res) => {

res.send("SESSION GENERATOR ACTIVE");

});

// ================================
// SELF PING
// ================================

setInterval(async () => {

try {

await axios.get("https://session-site-production-84ed.up.railway.app");

console.log("SELF PING");

} catch (err) {

console.log("PING FAILED");

}

}, 840000);

// ================================
// START SERVER
// ================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {

console.log(`Server running on ${PORT}`);

});
