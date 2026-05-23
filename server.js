const express = require("express");
const fs = require("fs");
const path = require("path");
const pino = require("pino");
const axios = require("axios");

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

// ==============================
// ACTIVE SOCKETS
// ==============================

const activeSockets = {};

// ==============================
// HOME
// ==============================

app.get("/", (req, res) => {
res.send("QUEEN LEESHA SESSION GENERATOR ACTIVE");
});

// ==============================
// PAIR ROUTE
// ==============================

app.post("/pair", async (req, res) => {

try {

const num = req.body.number;

if (!num) {
return res.json({
status: false,
msg: "Enter WhatsApp number"
});
}

const cleanedNum =
num.replace(/[^0-9]/g, "");

if (cleanedNum.startsWith("0")) {
return res.json({
status: false,
msg: "Use country code example 234..."
});
}

// ==============================
// CREATE SESSION ID
// ==============================

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

// ==============================
// AUTH
// ==============================

const { state, saveCreds } =
await useMultiFileAuthState(sessionPath);

const { version } =
await fetchLatestBaileysVersion();

// ==============================
// SOCKET
// ==============================

const sock = makeWASocket({
version,
logger: pino({ level: "silent" }),
printQRInTerminal: false,
auth: state,
browser: Browsers.ubuntu("Chrome"),

markOnlineOnConnect: false,
syncFullHistory: false,
defaultQueryTimeoutMs: 60000,
connectTimeoutMs: 60000,
keepAliveIntervalMs: 10000
});

// SAVE SOCKET
activeSockets[sessionId] = sock;

// SAVE CREDS
sock.ev.on("creds.update", saveCreds);

// ==============================
// GENERATE PAIR CODE
// ==============================

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

console.log("PAIR ERROR:", err);

return res.json({
status: false,
msg: "Failed to generate pair code"
});

}

}, 3000);

}

// ==============================
// CONNECTION UPDATE
// ==============================

sock.ev.on("connection.update", async (update) => {

const {
connection,
lastDisconnect
} = update;

console.log(update);

// ==============================
// OPEN
// ==============================

if (connection === "open") {

console.log("CONNECTED");

// WAIT FOR FULL AUTH SAVE
await new Promise(resolve =>
setTimeout(resolve, 15000)
);

try {

sock.ev.flush();

const credsPath =
path.join(sessionPath, "creds.json");

// CHECK CREDS
if (!fs.existsSync(credsPath)) {
console.log("CREDS NOT FOUND");
return;
}

// READ CREDS
const creds =
fs.readFileSync(credsPath, "utf8");

if (!creds || creds.length < 50) {
console.log("INVALID CREDS");
return;
}

// ENCODE
const encoded =
Buffer.from(
JSON.stringify(JSON.parse(creds))
).toString("base64");

// SEND ENCODED
await sock.sendMessage(
sock.user.id,
{
text:
`✅ QUEEN LEESHA SESSION CONNECTED

🔐 ENCODED SESSION:

${encoded}`
}
);

// SEND CREDS.JSON
await sock.sendMessage(
sock.user.id,
{
document: Buffer.from(creds),
mimetype: "application/json",
fileName: "creds.json"
}
);

console.log("SESSION SENT");

// OPTIONAL CLEANUP
setTimeout(() => {

delete activeSockets[sessionId];

}, 60000);

} catch (err) {

console.log("SEND ERROR:", err);

}

}

// ==============================
// CLOSE
// ==============================

if (connection === "close") {

let reason =
new Boom(lastDisconnect?.error)
?.output?.statusCode;

console.log("CLOSED:", reason);

if (reason !== DisconnectReason.loggedOut) {

console.log("Socket disconnected");

}

}

});

} catch (err) {

console.log("MAIN ERROR:", err);

return res.json({
status: false,
msg: "Server Error"
});

}

});

// ==============================
// SELF PING
// ==============================


// ================================

setInterval(async () => {

try {

await axios.get("https://session-site-production-f0cb.up.railway.app");

console.log("SELF PING");

} catch (err) {

console.log("PING FAILED");

}

}, 840000);

// ==============================
// START SERVER
// ==============================

const PORT =
process.env.PORT || 3000;

app.listen(PORT, () => {

console.log(`Server running on ${PORT}`);

});
