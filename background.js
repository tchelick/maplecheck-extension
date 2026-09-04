// MapleCheck background service worker
// v0.1: no backend calls yet — all lookups happen locally via data.js.
// This file is a placeholder for when the extension moves to a hosted
// API (Phase 2), so the extension architecture doesn't need a rebuild,
// just this file needs to start calling out to the Canadian-hosted API.

chrome.runtime.onInstalled.addListener(() => {
  console.log("MapleCheck installed — v0.1 (local data, no backend yet)");
});
