# MapleCheck v0.1 — local test build

Zero-cost, zero-backend v1. Ownership data is embedded directly in `data.js`,
no server, no hosting, no API calls. Good enough to test the concept and
show people today.

## Load it locally (2 minutes)

1. Open Chrome (or Edge/Brave) and go to `chrome://extensions`
2. Turn on **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select this folder (`maplecheck-extension`)
5. Visit walmart.ca, amazon.ca, or loblaws.ca — you should see a badge appear
   bottom-right of the page
6. Click the extension icon in your toolbar for the popup detail view

## What's real vs. placeholder right now

- **Real:** the extension mechanics — domain detection, badge injection,
  popup detail view, all working end to end. Also real: a report-incorrect-
  data flow, and a request-research flow for sites with no data yet (see
  below).
- **Placeholder:** the icons (plain red circles), and most importantly —
  **the ownership data itself has NOT been verified.** See the warning at
  the top of `data.js`. Do not publish this publicly or make claims to
  users from this dataset yet.

## How unknown sites are handled

For any site not in `data.js`, MapleCheck stays silent on the page itself
(no badge — a badge on every single site would be clutter, not a feature).
Opening the popup on an unknown site shows "we don't have data on this
site yet" with a **Request we look into this site** button. Clicking it
saves the domain to local storage (`researchRequests` key) — this becomes
your real, demand-driven queue of what to research next, instead of
guessing which companies to add.

**Important limitation:** these requests currently only save in the
individual user's own browser storage. They do NOT aggregate across users
yet — that requires a real backend (see Phase 2 below). Right now, if you
want to see what's been requested, you'd need to inspect a tester's local
`chrome.storage.local` via the extension's dev tools console:
`chrome.storage.local.get("researchRequests", console.log)`

## Moving to a hosted backend (Phase 2)

Right now all data lives in `data.js`, bundled inside the extension. This
was the right call for a zero-cost v1, but it has two real limits:
1. Every data fix/addition requires republishing to the Chrome Web Store
2. Research requests and reports only live in each individual user's
   browser, they don't aggregate anywhere you can see them

When you're ready to move past this (e.g. once you have real users and
need to update data without a store review cycle each time), the
migration path is contained:
- Stand up a small hosted API (Node/Express or similar) with the same
  `lookupDomain()` logic, backed by a real database instead of the
  `OWNERSHIP_DATA` object
- Host it on Canadian infrastructure (OVHcloud Canada, iWeb are the
  easiest to get running fast)
- In `background.js`, replace the local lookup with a `fetch()` call to
  your API
- In `popup.js`, POST report/research-request submissions to that same
  API instead of (or in addition to) local storage

I can't provision that hosting or deploy a live backend from this
session — signing up for a host and pointing a domain at it are account-
level steps you'd do yourself (or hand to a developer) — but the code is
structured so this is a contained swap, not a rebuild.

## Next steps to actually launch

1. Verify each entry in `data.js` with a real source (company investor
   relations page, SEDAR/SEC filing, or direct company statement) —
   this is the part that actually takes time
2. Expand the list — this starter batch is ~17 companies, you'll want
   50-100+ for it to be genuinely useful
3. Replace the placeholder icons with real branding
4. Once the dataset is large enough that shipping updates via extension
   store review is too slow, move `data.js` to a hosted API
   (see `background.js` comment — that's where the API call will go)
5. Submit to Chrome Web Store ($5 one-time developer fee)

## Known limitations (by design, for v0.1)

- Domain-only lookup — doesn't work on marketplace sites like Amazon
  where the actual seller/brand varies per product page. That's a v2
  feature (page-content scanning).
- No payment/subscription tier yet — this is purely the free tier
  mechanics.

## Unverified auto-guess (Wikidata, free, opt-in)

For unknown sites, the popup now also offers an optional "Show an
unverified guess" button. This queries Wikidata's free public API
(no key, no cost, no backend of ours) for a country/ownership match.

**This is deliberately NOT shown by default** — it's hidden behind a
click, styled with a dashed border and muted colour instead of the
solid red/blue used for verified data, and every result is labeled
"unverified — not human-checked." This was a specific design decision
to avoid the failure mode where a fast, unverified guess gets acted on
with the same trust as a properly researched entry — exactly the kind
of thing RESEARCH-PROCESS.md exists to prevent.

**Expected coverage gap:** Wikidata only has entries for companies
notable enough to have a Wikipedia page. Most of what makes MapleCheck
useful — small/private Canadian brands, recent ownership changes — will
come back "no match." That's expected, not a bug. An empty Wikidata
result still routes the person to the "Request we look into this site"
button, so the demand signal isn't lost.

**Not yet built:** a feedback loop that takes a Wikidata guess someone
found accurate and promotes it into `data.js` as a verified entry. Right
now a good guess still requires the same manual RESEARCH-PROCESS.md
check before it's added — this feature surfaces a lead, it doesn't skip
verification.
