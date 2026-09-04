// Determine data for the ACTUAL currently active tab, not whatever page
// was last loaded anywhere (that was the bug: a content script running on
// any page, including one opened from a link in this popup, would silently
// overwrite a single shared "last seen" value — so the popup could show
// data for the wrong tab entirely if you'd recently opened a link).
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const container = document.getElementById("content");
  const reportSection = document.getElementById("report-toggle");
  const researchSection = document.getElementById("research-toggle");

  let hostname = null;
  try {
    hostname = tabs[0] && tabs[0].url ? new URL(tabs[0].url).hostname : null;
  } catch (e) {
    hostname = null;
  }

  const found = hostname ? lookupDomain(hostname) : null;
  const data = found ? { hostname, ...found } : (hostname ? { hostname, unknown: true } : null);

  // Overwrite the shared storage value with the CORRECT current-tab data,
  // so the report/research-request handlers below (which still read from
  // storage) act on the right site rather than a stale cross-tab value.
  chrome.storage.local.set({ lastLookup: data });

  if (!data || data.unknown) {
    container.innerHTML = `
      <div class="status none">
        <div class="brand">❓ We don't have data on this site yet</div>
        <div class="meta">${data ? data.hostname : ""}</div>
      </div>
    `;
    // Unknown site: show "request research" instead of "report incorrect data"
    reportSection.style.display = "none";
    researchSection.style.display = "block";

    // Also offer the free, unverified Wikidata guess — hidden behind a
    // click so it's never seen with the same weight as verified data.
    const wdToggle = document.getElementById("wikidata-toggle");
    const wdResult = document.getElementById("wikidata-result");
    if (data && data.hostname) {
      wdToggle.style.display = "block";
      wdToggle.addEventListener("click", async () => {
        wdToggle.disabled = true;
        wdToggle.textContent = "Looking up…";
        const guess = await lookupWikidata(data.hostname);
        wdToggle.style.display = "none";

        if (!guess.found) {
          const explanation = guess.reason === "too-short"
            ? `The domain name is too short/generic to search reliably (e.g. "ns" matches unrelated things like "Nova Scotia" rather than the actual company). Refusing to guess rather than showing something misleading.`
            : `Nothing usable found. This is expected for small or private companies — Wikidata mostly covers companies notable enough to have a Wikipedia page.`;
          wdResult.innerHTML = `<span class="wd-label">⚠️ Unverified — no reliable Wikidata match</span>${explanation}`;
        } else {
          const countryLine = guess.country
            ? `Country: <strong>${guess.country}</strong>${guess.country === "Canada" ? " 🍁" : ""}`
            : "Country: not found";
          const ownerLine = guess.ownedByLabel ? `<br>Listed owner: ${guess.ownedByLabel}` : "";
          wdResult.innerHTML = `
            <span class="wd-label">⚠️ Unverified guess — not human-checked by MapleCheck</span>
            ${guess.label ? `Wikidata match: <strong>${guess.label}</strong><br>` : ""}
            ${countryLine}${ownerLine}<br>
            <a href="${guess.wikidataUrl}" target="_blank" rel="noopener">View on Wikidata ↗</a><br>
            <span style="font-style:italic;">If this looks right, use "Request we look into this site" above so we can verify it properly.</span>
          `;
        }
        wdResult.style.display = "block";
      });
    }
    return;
  }

  researchSection.style.display = "none";
  reportSection.style.display = "block";

  const isUS = data.ownership === "US";
  const isCA = data.ownership === "Canada";
  const statusClass = isUS ? "us" : isCA ? "ca" : "none";
  const label = isUS ? "🇺🇸 US-owned" : isCA ? "🍁 Canadian-owned" : "❓ Ownership unclear";

  let html = `
    <div class="status ${statusClass}">
      <div class="brand">${data.brand}</div>
      <div class="meta">${label}${data.hq ? " · " + data.hq : ""}</div>
      ${data.note ? `<div class="meta" style="margin-top:4px;">${data.note}</div>` : ""}
    </div>
  `;

  if (data.alternatives && data.alternatives.length > 0) {
    html += `<div class="alt-title">Canadian alternatives:</div>`;
    html += `<ul class="alt-list">${data.alternatives.map((a) => `<li>${a}</li>`).join("")}</ul>`;
  }

  if (data.otherAlternatives && data.otherAlternatives.length > 0) {
    html += `<div class="alt-title" style="color:#555;">Not Canadian, but not US-owned:</div>`;
    html += `<ul class="alt-list">${data.otherAlternatives.map((a) => `<li>${a}</li>`).join("")}</ul>`;
  }

  if (data.alternativesNote) {
    html += `<div class="meta" style="margin-top:6px; font-style:italic;">${data.alternativesNote}</div>`;
  }

  container.innerHTML = html;
});

// ---- Request research on an unknown site ----
document.getElementById("research-toggle").addEventListener("click", () => {
  chrome.storage.local.get(["lastLookup", "researchRequests"], (result) => {
    const lookup = result.lastLookup;
    const req = {
      domain: lookup ? lookup.hostname : "unknown",
      timestamp: new Date().toISOString(),
    };

    // Save locally so the queue of "what people actually want covered" builds
    // up even with no backend yet — this is the demand signal for what to
    // research next, instead of guessing.
    // TODO Phase 2: POST this to the hosted API so requests aggregate across
    // all users instead of staying local to one browser.
    const requests = result.researchRequests || [];
    requests.push(req);
    chrome.storage.local.set({ researchRequests: requests }, () => {
      document.getElementById("research-toggle").textContent = "✓ Requested — thanks!";
      document.getElementById("research-toggle").disabled = true;
    });
  });
});

// ---- Report incorrect data ----
const REPORT_EMAIL = "maplecheck@northmail.ca";

document.getElementById("report-toggle").addEventListener("click", () => {
  const form = document.getElementById("report-form");
  form.style.display = form.style.display === "block" ? "none" : "block";
});

document.getElementById("report-submit").addEventListener("click", () => {
  chrome.storage.local.get(["lastLookup", "reports"], (result) => {
    const lookup = result.lastLookup;
    const reason = document.getElementById("report-reason").value;
    const details = document.getElementById("report-details").value;

    const report = {
      domain: lookup ? lookup.hostname : "unknown",
      brand: lookup ? lookup.brand : "unknown",
      currentData: lookup ? { ownership: lookup.ownership, note: lookup.note } : null,
      reason,
      details,
      timestamp: new Date().toISOString(),
    };

    // Save locally so nothing is lost even without a backend yet.
    // TODO Phase 2: POST this to the hosted API instead of (or in addition to) local storage.
    const reports = result.reports || [];
    reports.push(report);
    chrome.storage.local.set({ reports }, () => {
      // Also offer an immediate, zero-infra path: pre-filled email.
      const subject = encodeURIComponent(`MapleCheck data report: ${report.brand}`);
      const body = encodeURIComponent(
        `Domain: ${report.domain}\nBrand: ${report.brand}\nCurrent listing: ${JSON.stringify(report.currentData)}\nReason: ${report.reason}\nDetails: ${report.details}\n`
      );
      window.open(`mailto:${REPORT_EMAIL}?subject=${subject}&body=${body}`);

      document.getElementById("report-form").style.display = "none";
      document.getElementById("report-confirm").style.display = "block";
      document.getElementById("report-details").value = "";
    });
  });
});
