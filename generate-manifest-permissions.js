// generate-manifest-permissions.js
//
//   node generate-manifest-permissions.js          # rewrite manifest.json
//   node generate-manifest-permissions.js --check  # exit 1 if out of date
//
// Rebuilds the manifest's content_scripts match list and host_permissions
// from the domains in data.js, replacing the blanket <all_urls> grant.
//
// Why this is worth doing: <all_urls> makes the browser tell users the
// extension "can read and change all your data on all websites", which is
// both alarming and more access than MapleCheck actually needs. Listing the
// domains we have data for is an honest description of what it does, and it
// is materially easier to get through store review.
//
// What it does NOT change: the badge already stayed silent on unknown sites
// (content.js returns early when lookupDomain finds nothing), so narrowing
// the match list removes an unnecessary grant rather than a behaviour. The
// popup still works everywhere, because it reads the current tab through
// the activeTab permission, which the user grants by clicking the icon —
// so the "we don't have data on this site yet" and "request research"
// flows are unaffected.
//
// TRADE-OFF TO KNOW: with a fixed match list, a newly added company does
// not get an on-page badge until the manifest is regenerated AND a new
// version is published to the stores. Under <all_urls> a data-only update
// was enough. This is the cost of the smaller permission.

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const MANIFEST = path.join(ROOT, "manifest.json");

// The Wikidata API is fetched from the popup for the opt-in "unverified
// guess". Without this entry that feature breaks the moment <all_urls>
// goes away — it is the one host we need beyond the dataset itself.
const WIKIDATA_HOST = "https://www.wikidata.org/*";

const dataSrc = fs.readFileSync(path.join(ROOT, "data.js"), "utf8");
const OWNERSHIP_DATA = new Function(`${dataSrc}\nreturn OWNERSHIP_DATA;`)();

// "*://*.walmart.ca/*" matches walmart.ca, www.walmart.ca and any other
// subdomain, which covers the www-stripping that lookupDomain already does.
const domains = Object.keys(OWNERSHIP_DATA).sort();
const matches = domains.map((d) => `*://*.${d}/*`);

const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
const next = structuredClone(manifest);
next.host_permissions = [...matches, WIKIDATA_HOST];
next.content_scripts[0].matches = matches;

const nextText = `${JSON.stringify(next, null, 2)}\n`;
const currentText = fs.readFileSync(MANIFEST, "utf8");

if (process.argv.includes("--check")) {
  if (nextText === currentText) {
    console.log(`manifest.json is up to date (${domains.length} domains).`);
    process.exit(0);
  }
  console.error("manifest.json is OUT OF DATE with data.js.");
  console.error("Run: node generate-manifest-permissions.js");
  process.exit(1);
}

fs.writeFileSync(MANIFEST, nextText);
console.log(`manifest.json updated from data.js:`);
console.log(`  ${domains.length} domains -> content_scripts[0].matches`);
console.log(`  ${domains.length} domains + Wikidata -> host_permissions`);
console.log("");
console.log("Reminder: new domains only get an on-page badge after this");
console.log("manifest change ships in a new store release — a data-only");
console.log("sync is no longer enough for the badge (the popup still works).");
