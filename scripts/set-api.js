const fs = require("fs");
const path = require("path");

const apiBase = (process.env.API_BASE || "").replace(/\/+$/, "");
const pkg = require("../package.json");
const appVersion = pkg.version || "0.0.0";
const file = path.join(__dirname, "..", "public", "config.js");

fs.writeFileSync(
  file,
  `window.API_BASE = ${JSON.stringify(apiBase)};\n` +
    `window.APP_VERSION = ${JSON.stringify(appVersion)};\n`
);

console.log(`API_BASE set to: ${apiBase || "(relative / same-origin)"}`);
console.log(`APP_VERSION set to: ${appVersion}`);