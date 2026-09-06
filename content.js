// MapleCheck content script
// Runs on every page load. Checks the current domain against the local
// ownership database (data.js) and injects a small badge if there's a match.
// v0.1: domain-only lookup, no page-content scanning yet.
//
// Design note: we only inject the on-page floating badge when we have real
// data. For unknown sites (the vast majority of the web), we deliberately
// stay silent on the page itself — a badge on every single site would be
// clutter, not a feature. The popup (toolbar icon) always shows the current
// site's status, known or unknown, since opening the popup is a deliberate
// user action rather than something forced onto every page.

(function () {
  const hostname = window.location.hostname;
  const result = typeof lookupDomain === "function" ? lookupDomain(hostname) : null;

  // Always record the current site so the popup can respond, even when
  // there's no data — this is what powers the "we don't know yet, request
  // research" flow.
  chrome.storage.local.set({ lastLookup: result ? { hostname, ...result } : { hostname, unknown: true } });

  if (!result) return; // no data for this domain — stay silent on the page

  injectBadge(result);

  function injectBadge(data) {
    const badge = document.createElement("div");
    badge.id = "maplecheck-badge";

    const isUS = data.ownership === "US";
    const isCA = data.ownership === "Canada";
    // Maple leaf instead of the flag emoji for Canadian-owned — the 🇨🇦
    // flag emoji renders as literal text "CA" on Windows Chrome in many
    // fonts (inconsistent regional-indicator support), so a single
    // standard emoji character is both more reliable and more on-theme.
    const flagEmoji = isUS ? "🇺🇸" : isCA ? "🍁" : "❓";
    const label = isUS ? "US-owned" : isCA ? "Canadian-owned" : "Ownership unclear";

    // Built as DOM nodes rather than an innerHTML string so dataset values
    // enter as text and can never be parsed as markup. Today data.js ships
    // inside the extension, so this is defence in depth — but the badge is
    // injected into every page the user visits, and the same fields are
    // meant to come from a hosted API in Phase 2 (see README), at which
    // point string interpolation here would be a real injection point.
    const el = (tag, className, text) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text != null) node.textContent = text;
      return node;
    };

    const panel = el("div", "mc-panel");
    panel.appendChild(el("div", "mc-panel-brand", data.brand));
    if (data.hq) panel.appendChild(el("div", "mc-panel-meta", data.hq));
    if (data.note) panel.appendChild(el("div", "mc-panel-meta", data.note));

    const appendAlternatives = (titleText, items) => {
      panel.appendChild(el("div", "mc-panel-alt-title", titleText));
      const list = el("ul", "mc-panel-alt-list");
      for (const item of items) list.appendChild(el("li", null, item));
      panel.appendChild(list);
    };

    if (data.alternatives && data.alternatives.length > 0) {
      appendAlternatives("Canadian alternatives:", data.alternatives);
    }
    if (data.otherAlternatives && data.otherAlternatives.length > 0) {
      appendAlternatives("Not Canadian, but not US-owned:", data.otherAlternatives);
    }
    if (data.alternativesNote) {
      panel.appendChild(el("div", "mc-panel-meta mc-panel-italic", data.alternativesNote));
    }
    if (!data.alternatives?.length && !data.otherAlternatives?.length && !data.alternativesNote) {
      panel.appendChild(el("div", "mc-panel-meta mc-panel-italic", "No alternative listed yet."));
    }

    const inner = el("div", `mc-badge-inner mc-${isUS ? "us" : isCA ? "ca" : "unknown"}`);
    const dragHandle = el("span", "mc-drag-handle", "⠿");
    dragHandle.title = "Drag to move";
    const minimizeSpan = el("span", "mc-minimize-btn", "−");
    minimizeSpan.title = "Minimize";
    inner.append(dragHandle, el("span", "mc-flag", flagEmoji), el("span", "mc-label", label), minimizeSpan);

    badge.replaceChildren(inner, panel);

    document.body.appendChild(badge);

    // ---- Restore saved position and minimized state ----
    // Position and minimized state persist across page loads (site to
    // site) via chrome.storage.local, so the person doesn't have to redo
    // this every time they visit a new page.
    chrome.storage.local.get(["badgePosition", "badgeMinimized"], (saved) => {
      if (saved.badgePosition) {
        badge.style.left = saved.badgePosition.left;
        badge.style.top = saved.badgePosition.top;
        badge.style.bottom = "auto";
        badge.style.right = "auto";
      }
      if (saved.badgeMinimized) {
        badge.classList.add("mc-minimized");
      }
    });

    // ---- Minimize / restore ----
    const minimizeBtn = badge.querySelector(".mc-minimize-btn");
    minimizeBtn.addEventListener("click", (e) => {
      e.stopPropagation(); // don't also trigger the expand-panel toggle below
      const nowMinimized = badge.classList.toggle("mc-minimized");
      badge.classList.remove("mc-expanded"); // collapse the panel too if it was open
      chrome.storage.local.set({ badgeMinimized: nowMinimized });
    });

    // ---- Drag to reposition (whole badge is draggable, in both full and
    // minimized states — not just a small handle, so it never gets stuck
    // wherever it happened to land when minimized) ----
    let dragging = false;
    let didDrag = false;
    let offsetX = 0;
    let offsetY = 0;

    badge.addEventListener("mousedown", (e) => {
      if (e.target === minimizeBtn) return; // don't start a drag from the minimize button
      dragging = true;
      didDrag = false;
      const rect = badge.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      badge.style.bottom = "auto";
      badge.style.right = "auto";
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      didDrag = true;
      let left = e.clientX - offsetX;
      let top = e.clientY - offsetY;
      // Keep it on-screen
      left = Math.max(0, Math.min(left, window.innerWidth - badge.offsetWidth));
      top = Math.max(0, Math.min(top, window.innerHeight - badge.offsetHeight));
      badge.style.left = `${left}px`;
      badge.style.top = `${top}px`;
    });

    document.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      chrome.storage.local.set({
        badgePosition: { left: badge.style.left, top: badge.style.top },
      });
    });

    // ---- Click to expand panel / restore from minimized (but not right
    // after a drag — dragging shouldn't also trigger a click action) ----
    badge.addEventListener("click", (e) => {
      if (e.target === minimizeBtn) return;
      if (didDrag) { didDrag = false; return; } // suppress the click that follows a drag
      if (badge.classList.contains("mc-minimized")) {
        // Clicking the minimized icon restores it to full size instead of
        // expanding the panel — one click to get back, not two.
        badge.classList.remove("mc-minimized");
        chrome.storage.local.set({ badgeMinimized: false });
        return;
      }
      badge.classList.toggle("mc-expanded");
    });
  }
})();
