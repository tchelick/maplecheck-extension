// MapleCheck background service worker
//
// Keeps a fresh copy of the ownership dataset in local storage, fetched from
// maplecheck.store, so a correction reaches people within hours instead of
// waiting on a store review.
//
// WHAT THIS DOES NOT DO: it does not tell us where anyone browses. The whole
// dataset is downloaded at once and every lookup then happens locally, exactly
// as before — the extension never asks "who owns X?" over the network, because
// that question is what would leak the answer. The cost is that our server
// sees an IP on a refresh schedule, which is disclosed in the privacy policy.
//
// The bundled data.js remains the fallback. If the fetch fails, is malformed,
// or the site is unreachable, the extension keeps working on the copy it
// shipped with — it just stops getting updates.

const DATA_URL = "https://www.maplecheck.store/ownership-data.json";
const REFRESH_ALARM = "maplecheck-refresh";
const REFRESH_MINUTES = 360; // 6 hours

// A payload smaller than this is treated as corrupt rather than as a dataset
// that shrank. Losing entries silently would be worse than serving slightly
// stale ones, and a truncated download is a far likelier explanation than us
// actually deleting most of the directory.
const MIN_PLAUSIBLE_COUNT = 50;

// Only the shape is checked here, not the contents. Everything rendered from
// this data already goes through textContent rather than innerHTML, so a
// hostile value cannot become markup — but a wrong shape would throw at
// lookup time on every page load, which is worth refusing up front.
function isUsablePayload(payload) {
  return (
    payload &&
    payload.schema === 1 &&
    payload.data &&
    typeof payload.data === "object" &&
    !Array.isArray(payload.data) &&
    Object.keys(payload.data).length >= MIN_PLAUSIBLE_COUNT &&
    (payload.aliases == null || typeof payload.aliases === "object")
  );
}

async function refreshData(reason) {
  try {
    const stored = await chrome.storage.local.get(["remoteEtag"]);
    const headers = {};
    // Revalidate rather than re-download. The dataset is ~157 KB and usually
    // unchanged, so most refreshes should cost a 304 and nothing else.
    if (stored.remoteEtag) headers["If-None-Match"] = stored.remoteEtag;

    const res = await fetch(DATA_URL, { headers, cache: "no-cache" });

    if (res.status === 304) {
      await chrome.storage.local.set({ remoteCheckedAt: Date.now() });
      return;
    }
    if (!res.ok) {
      console.warn(`MapleCheck: dataset refresh failed (${res.status}); keeping existing data.`);
      return;
    }

    const payload = await res.json();
    if (!isUsablePayload(payload)) {
      console.warn("MapleCheck: dataset refresh returned an unusable payload; keeping existing data.");
      return;
    }

    await chrome.storage.local.set({
      remoteData: payload,
      remoteEtag: res.headers.get("ETag") || null,
      remoteFetchedAt: Date.now(),
      remoteCheckedAt: Date.now(),
    });
    console.log(
      `MapleCheck: dataset updated (${payload.count} companies, generated ${payload.generatedAt}, via ${reason}).`
    );
  } catch (err) {
    // Offline, DNS failure, site down. Not an error worth surfacing to the
    // user — the bundled data still answers every lookup.
    console.warn("MapleCheck: dataset refresh could not complete; keeping existing data.", err);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: REFRESH_MINUTES });
  refreshData("install");
  syncAllSitesScript();
});

// Service workers are torn down aggressively, so the alarm is what actually
// keeps this running rather than any timer held in memory.
chrome.runtime.onStartup.addListener(() => {
  refreshData("browser startup");
  syncAllSitesScript();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REFRESH_ALARM) refreshData("scheduled refresh");
});


// ---- Full coverage, if the user asks for it ----
//
// The manifest lists the domains we had data for at build time, so a company
// added to the dataset today gets no on-page badge until a new version clears
// store review — which can take weeks. That is a bad fit for a directory that
// updates daily.
//
// The fix is an OPTIONAL all-sites permission. It is not requested at install,
// so the scary "read and change all your data on all websites" warning never
// appears just for installing. Someone who wants new companies covered
// automatically grants it from the popup, and from then on the badge follows
// the website with no release at all.
//
// Granting it changes nothing about what leaves the browser: lookups stay
// local against the downloaded dataset, exactly as before.

const ALL_SITES_SCRIPT_ID = "maplecheck-all-sites";

async function hasAllSites() {
  try {
    return await chrome.permissions.contains({ origins: ["<all_urls>"] });
  } catch (e) {
    return false;
  }
}

// Registration survives service-worker teardown but not always an update or a
// revoked permission, so this reconciles what is registered against what is
// actually permitted rather than assuming.
async function syncAllSitesScript() {
  const granted = await hasAllSites();
  let registered = [];
  try {
    registered = await chrome.scripting.getRegisteredContentScripts({ ids: [ALL_SITES_SCRIPT_ID] });
  } catch (e) {
    registered = [];
  }

  if (granted && registered.length === 0) {
    try {
      await chrome.scripting.registerContentScripts([
        {
          id: ALL_SITES_SCRIPT_ID,
          matches: ["<all_urls>"],
          js: ["data.js", "content.js"],
          css: ["styles.css"],
          runAt: "document_idle",
          allFrames: false,
        },
      ]);
      console.log("MapleCheck: full-coverage badge enabled.");
    } catch (err) {
      console.warn("MapleCheck: could not register the all-sites script.", err);
    }
  } else if (!granted && registered.length > 0) {
    try {
      await chrome.scripting.unregisterContentScripts({ ids: [ALL_SITES_SCRIPT_ID] });
      console.log("MapleCheck: full-coverage badge disabled.");
    } catch (err) {
      console.warn("MapleCheck: could not unregister the all-sites script.", err);
    }
  }
}

chrome.permissions.onAdded.addListener(syncAllSitesScript);
chrome.permissions.onRemoved.addListener(syncAllSitesScript);
