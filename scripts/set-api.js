const fs = require("fs");
const path = require("path");

const apiBase = (process.env.API_BASE || "").replace(/\/+$/, "");
const file = path.join(__dirname, "..", "public", "config.js");

fs.writeFileSync(file, `window.API_BASE = ${JSON.stringify(apiBase)};\n`);

console.log(`API_BASE set to: ${apiBase || "(relative / same-origin)"}`);