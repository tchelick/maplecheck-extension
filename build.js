// build.js — packages the extension for each browser store.
//
//   node build.js
//
// Produces, under dist/:
//   chromium/  + maplecheck-chromium-<version>.zip   -> Chrome, Edge, Brave, Opera, Vivaldi
//   firefox/   + maplecheck-firefox-<version>.zip    -> Firefox (AMO)
//
// Why two builds instead of one: Chrome's Manifest V3 only accepts
// background.service_worker, and Firefox's only runs background.scripts.
// Chrome 121+ and Firefox 121+ each ignore the other's key, so a single
// combined manifest does technically run on current versions — but store
// review tooling is stricter than the runtime, and Firefox additionally
// requires browser_specific_settings.gecko.id, which is meaningless to
// Chrome. Emitting one clean manifest per store avoids relying on either
// reviewer being lenient.
//
// All source files stay shared and single-sourced — this script only
// rewrites the manifest. data.js remains the one source of truth (see
// sync-data.sh, which copies it to the website).

const fs = require("fs");
const path = require("path");
const { zipDirectory } = require("./zip");

const ROOT = __dirname;
const DIST = path.join(ROOT, "dist");

const SHARED_FILES = [
  "background.js",
  "content.js",
  "data.js",
  "popup.html",
  "popup.js",
  "styles.css",
  "wikidata.js",
];
const SHARED_DIRS = ["icons"];

const baseManifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
const version = baseManifest.version;

function copyInto(targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  for (const f of SHARED_FILES) {
    const src = path.join(ROOT, f);
    if (!fs.existsSync(src)) throw new Error(`Missing source file: ${f}`);
    fs.copyFileSync(src, path.join(targetDir, f));
  }
  for (const d of SHARED_DIRS) {
    const src = path.join(ROOT, d);
    if (!fs.existsSync(src)) throw new Error(`Missing source directory: ${d}`);
    fs.cpSync(src, path.join(targetDir, d), { recursive: true });
  }
}

function chromiumManifest() {
  // The checked-in manifest.json is already the Chromium one.
  return structuredClone(baseManifest);
}

function firefoxManifest() {
  const m = structuredClone(baseManifest);
  // Firefox MV3 runs an event page, not a service worker.
  m.background = { scripts: ["background.js"] };
  // AMO requires a stable extension id for a listed add-on.
  //
  // This block lives here rather than in manifest.json on purpose:
  // browser_specific_settings is Firefox-only, and manifest.json is the
  // Chromium source manifest, so putting it there would ship a Gecko key
  // inside the Chrome Web Store package.
  m.browser_specific_settings = {
    gecko: {
      id: "maplecheck@maplecheck.store",
      // 142 is the floor for data_collection_permissions below (desktop
      // gained it in 140, Firefox for Android in 142). Firefox auto-updates
      // on a 4-week cycle, so this excludes almost no active users.
      strict_min_version: "142.0",
      // Mozilla requires an explicit data-collection declaration.
      // required "none": the ownership check runs entirely locally against
      // the bundled dataset and nothing is transmitted to us.
      // optional "browsingActivity": the opt-in "show an unverified guess"
      // button sends the current hostname to Wikidata's public API. It only
      // fires when the user clicks it, which is exactly what an optional
      // collection permission is for — declaring it means Firefox asks the
      // user rather than us deciding on their behalf.
      data_collection_permissions: {
        required: ["none"],
        optional: ["browsingActivity"],
      },
    },
  };
  return m;
}

function zip(sourceDir, zipPath) {
  if (fs.existsSync(zipPath)) fs.rmSync(zipPath);
  zipDirectory(sourceDir, zipPath);
}

function build(name, manifest) {
  const outDir = path.join(DIST, name);
  fs.rmSync(outDir, { recursive: true, force: true });
  copyInto(outDir);
  fs.writeFileSync(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  const zipPath = path.join(DIST, `maplecheck-${name}-${version}.zip`);
  zip(outDir, zipPath);

  const kb = (fs.statSync(zipPath).size / 1024).toFixed(0);
  console.log(`  ${name.padEnd(9)} -> dist/${path.basename(zipPath)} (${kb} KB)`);
  return outDir;
}

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

console.log(`Building MapleCheck v${version}...`);
build("chromium", chromiumManifest());
build("firefox", firefoxManifest());

console.log("");
console.log("Upload targets:");
console.log("  Chrome Web Store, Edge Add-ons, Opera  ->  the chromium zip");
console.log("  Firefox (addons.mozilla.org)           ->  the firefox zip");
console.log("");
console.log("Load unpacked for testing:");
console.log("  Chrome/Edge  chrome://extensions -> Developer mode -> Load unpacked -> dist/chromium");
console.log("  Firefox      about:debugging -> This Firefox -> Load Temporary Add-on -> dist/firefox/manifest.json");
