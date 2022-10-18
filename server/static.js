const fs = require("fs");
const https = require("https");
const express = require("express");
const path = require("path");

const root = path.resolve(__dirname + "/..");

const credentials = {};

credentials.key = fs.readFileSync("/etc/letsencrypt/live/inharmonious.floomby.us/privkey.pem", "utf8");
credentials.cert = fs.readFileSync("/etc/letsencrypt/live/inharmonious.floomby.us/cert.pem", "utf8");
credentials.ca = fs.readFileSync("/etc/letsencrypt/live/inharmonious.floomby.us/chain.pem", "utf8");

const app = express();

// app.use(express.static("dist"));
app.use(express.static("resources"));

app.get("/dist/app.js", (req, res) => {
    res.sendFile("dist/app.js", { root });
});

// app.get("/resources/sprites.png", (req, res) => {
//     res.sendFile("resources/sprites.png", { root });
// });

app.get('/', (req, res) => {
    res.sendFile("index.html", { root });
});

const https_port = 8081;

const httpsServer = https.createServer(credentials, app);
httpsServer.listen(https_port, () => {
    console.log(`Running on port ${https_port}`);
});
