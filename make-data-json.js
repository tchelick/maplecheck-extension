// make-data-json.js
//
//   node make-data-json.js
//
// Converts data.js into ownership-data.json in the site repo, which the
// extension fetches so that corrections reach people without a store release.
//
// Why a separate JSON file rather than pointing the extension at
// extension-data.js: that file is JavaScript, and evaluating remotely-fetched
// JavaScript inside an extension is both a security problem and a Chrome Web
// Store policy violation (remotely hosted code). JSON.parse cannot execute
// anything, which is the entire point.

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const SITE = path.join(ROOT, "..", "..", "maplecheck-site", "maplecheck-site");
const OUT = path.join(SITE, "ownership-data.json");

if (!fs.existsSync(SITE)) {
  console.error(`Error: site repo not found at ${SITE}`);
  process.exit(1);
}

const src = fs.readFileSync(path.join(ROOT, "data.js"), "utf8");
const OWNERSHIP_DATA = new Function(`${src}\nreturn OWNERSHIP_DATA;`)();
const DOMAIN_ALIASES = new Function(
  `${src}\nreturn typeof DOMAIN_ALIASES !== "undefined" ? DOMAIN_ALIASES : {};`
)();

const payload = {
  // Bumped only for a breaking shape change. The extension refuses a payload
  // whose schema it does not recognise and keeps using what it already has,
  // so an old extension can never be broken by a new field being added.
  schema: 1,
  generatedAt: new Date().toISOString(),
  count: Object.keys(OWNERSHIP_DATA).length,
  data: OWNERSHIP_DATA,
  aliases: DOMAIN_ALIASES,
};

fs.writeFileSync(OUT, `${JSON.stringify(payload)}\n`);
const kb = Math.round(fs.statSync(OUT).size / 1024);
console.log(`ownership-data.json written: ${payload.count} companies, ${Object.keys(DOMAIN_ALIASES).length} aliases, ${kb} KB`);
