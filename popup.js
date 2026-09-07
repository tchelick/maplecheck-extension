// Build an element with its text set as text, never as markup.
//
// Everything rendered here is built through this helper rather than by
// interpolating into innerHTML. That matters most for the Wikidata block
// below: Wikidata labels are editable by anyone, so interpolating one into
// innerHTML let a third party inject markup into this popup (a spoofed
// ownership badge, a phishing link, a remote image that leaks the user's
// IP). Manifest V3's default CSP blocks injected <script> and inline
// handlers, so it was never arbitrary code execution — but markup
// injection into a trusted-looking popup is bad enough on its own.
// The same rule protects the data.js fields once those come from a hosted
// API (see README Phase 2) instead of the bundled file.
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function br() {
  return document.createElement("br");
}

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
    const unknownBox = el("div", "status none");
    unknownBox.appendChild(el("div", "brand", "❓ We don't have data on this site yet"));
    unknownBox.appendChild(el("div", "meta", data ? data.hostname : ""));
    container.replaceChildren(unknownBox);
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
          wdResult.replaceChildren(
            el("span", "wd-label", "⚠️ Unverified — no reliable Wikidata match"),
            document.createTextNode(explanation)
          );
        } else {
          // Every value below originates from the Wikidata API, i.e. from a
          // page any member of the public can edit — so all of it goes in as
          // text nodes, never as markup.
          wdResult.replaceChildren(
            el("span", "wd-label", "⚠️ Unverified guess — not human-checked by MapleCheck")
          );

          if (guess.label) {
            wdResult.append(document.createTextNode("Wikidata match: "), el("strong", null, guess.label), br());
          }

          if (guess.country) {
            wdResult.append(
              document.createTextNode("Country: "),
              el("strong", null, guess.country),
              document.createTextNode(guess.country === "Canada" ? " 🍁" : "")
            );
          } else {
            wdResult.append(document.createTextNode("Country: not found"));
          }

          if (guess.ownedByLabel) {
            wdResult.append(br(), document.createTextNode(`Listed owner: ${guess.ownedByLabel}`));
          }
          wdResult.append(br());

          // Only link out to a real Wikidata URL. Refusing anything else keeps
          // a remote value from ever becoming a javascript: or data: href.
          if (/^https:\/\/www\.wikidata\.org\/wiki\/[\w-]+$/.test(guess.wikidataUrl || "")) {
            const link = el("a", null, "View on Wikidata ↗");
            link.href = guess.wikidataUrl;
            link.target = "_blank";
            link.rel = "noopener";
            wdResult.append(link, br());
          }

          wdResult.append(
            el("span", "wd-hint", 'If this looks right, use "Request we look into this site" above so we can verify it properly.')
          );
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

  const statusBox = el("div", `status ${statusClass}`);
  statusBox.appendChild(el("div", "brand", data.brand));
  statusBox.appendChild(el("div", "meta", `${label}${data.hq ? ` · ${data.hq}` : ""}`));
  if (data.note) statusBox.appendChild(el("div", "meta meta-note", data.note));
  container.replaceChildren(statusBox);

  function appendAlternatives(titleText, titleClass, items) {
    container.appendChild(el("div", titleClass, titleText));
    const list = el("ul", "alt-list");
    for (const item of items) list.appendChild(el("li", null, item));
    container.appendChild(list);
  }

  if (data.alternatives && data.alternatives.length > 0) {
    appendAlternatives("Canadian alternatives:", "alt-title", data.alternatives);
  }

  if (data.otherAlternatives && data.otherAlternatives.length > 0) {
    appendAlternatives("Not Canadian, but not US-owned:", "alt-title alt-title-muted", data.otherAlternatives);
  }

  if (data.alternativesNote) {
    container.appendChild(el("div", "meta alt-note", data.alternativesNote));
  }

  // Shown only when alternatives were actually listed — a disclosure on a
  // panel with nothing to click would be noise.
  const showedAlternatives =
    (data.alternatives && data.alternatives.length > 0) ||
    (data.otherAlternatives && data.otherAlternatives.length > 0);
  if (showedAlternatives) {
    container.appendChild(
      el(
        "div",
        "affiliate-note",
        "Some links may be affiliate links — MapleCheck may earn a small commission. This never affects which companies are listed as Canadian-owned."
      )
    );
  }
});

// ---- Where submissions go ----
//
// Both the research request and the correction POST straight to one Google
// Form. Nothing opens a second tab and asks the person to retype what they
// already typed.
//
// That bounce is why this changed: the old correction flow collected a
// reason and details here, then handed the person a Tally form asking for
// the same thing again. Most people close that tab, and the correction they
// had already written is lost. A report you have to file twice is a report
// you mostly do not get.
//
// The form's fields, in the order they appear on it. To find an entry id:
// open the live form, view source, and search for "entry." — each question
// carries one, like entry.123456789.
const FORM = {
  formId: "1FAIpQLSctsyB5-m7NlwsqWefc3B-WhvAKqmjSoT1zfHn9rsoA4Niu5g",
  domain: "entry.180211344",
  brand: "entry.573150811",
  reason: "entry.660409413",
  details: "entry.2072649866",
  email: "entry.1001107241",
};

// Kept only as the offline fallback below. Nothing in the popup routes a
// person here on the normal path any more.
const SUBMIT_FORM = "https://tally.so/r/1AeroQ";

function openSubmitForm(params) {
  const qs = new URLSearchParams(params).toString();
  chrome.tabs.create({ url: `${SUBMIT_FORM}?${qs}` });
}

// Google does not send CORS headers on form submissions, so the response is
// opaque and cannot be read. The POST still lands. That means success cannot
// be confirmed from here — the button reports that it sent, not that it
// arrived, which is the honest thing it can claim. In practice this only
// rejects when the network is genuinely unavailable, which is what makes it
// a usable signal for the fallback.
function postToForm(fields) {
  if (FORM.formId.startsWith("PASTE_")) {
    console.warn("MapleCheck: form not configured; nothing sent.");
    return Promise.resolve(false);
  }
  const body = new URLSearchParams();
  for (const [field, value] of Object.entries(fields)) {
    if (value) body.append(field, value);
  }
  return fetch(`https://docs.google.com/forms/d/e/${FORM.formId}/formResponse`, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  })
    .then(() => true)
    .catch(() => false);
}

// ---- Request research on an unknown site ----
document.getElementById("research-toggle").addEventListener("click", () => {
  chrome.storage.local.get(["lastLookup", "researchRequests"], (result) => {
    const lookup = result.lastLookup;
    const domain = lookup ? lookup.hostname : "";

    // Still kept locally, so the person can see what they've asked about.
    const requests = result.researchRequests || [];
    requests.push({ domain: domain || "unknown", timestamp: new Date().toISOString() });
    chrome.storage.local.set({ researchRequests: requests });

    const btn = document.getElementById("research-toggle");
    btn.disabled = true;
    btn.textContent = "Sending…";
    postToForm({ [FORM.domain]: domain }).then((sent) => {
      btn.textContent = sent ? "✓ Sent — thanks!" : "Couldn't send — try the form";
      if (!sent) {
        btn.disabled = false;
        btn.addEventListener("click", () => openSubmitForm({ company: domain, domain, request: "New company" }), { once: true });
      }
    });
  });
});

// ---- Report incorrect data ----
document.getElementById("report-toggle").addEventListener("click", () => {
  const form = document.getElementById("report-form");
  form.style.display = form.style.display === "block" ? "none" : "block";
});

document.getElementById("report-submit").addEventListener("click", () => {
  chrome.storage.local.get(["lastLookup", "reports"], (result) => {
    const lookup = result.lastLookup;
    const reasonSelect = document.getElementById("report-reason");
    // The visible label, not the option's slug — these land in a spreadsheet
    // a person reads, where "Ownership is wrong" beats "wrong-ownership".
    const reason = reasonSelect.options[reasonSelect.selectedIndex].text;
    const details = document.getElementById("report-details").value;
    const email = document.getElementById("report-email").value.trim();

    const report = {
      domain: lookup ? lookup.hostname : "unknown",
      brand: lookup ? lookup.brand : "unknown",
      currentData: lookup ? { ownership: lookup.ownership, note: lookup.note } : null,
      reason,
      details,
      timestamp: new Date().toISOString(),
    };

    // Kept locally too, so the person has their own record of what they sent.
    // The email is deliberately not stored here — there is no reason to keep
    // a second copy of it on the device once it has been sent.
    const reports = result.reports || [];
    reports.push(report);
    chrome.storage.local.set({ reports });

    const btn = document.getElementById("report-submit");
    btn.disabled = true;
    btn.textContent = "Sending…";

    postToForm({
      [FORM.domain]: report.domain,
      [FORM.brand]: report.brand,
      [FORM.reason]: reason,
      [FORM.details]: details,
      [FORM.email]: email,
    }).then((sent) => {
      if (sent) {
        document.getElementById("report-form").style.display = "none";
        document.getElementById("report-confirm").style.display = "block";
        document.getElementById("report-details").value = "";
        document.getElementById("report-email").value = "";
        return;
      }
      // Offline. Rather than lose what they wrote, hand it to the hosted form
      // with the fields carried across so nothing has to be retyped.
      btn.disabled = false;
      btn.textContent = "Couldn't send — open the form instead";
      btn.addEventListener(
        "click",
        () =>
          openSubmitForm({
            company: report.brand,
            domain: report.domain,
            request: "Correction to an existing entry",
            details: `${reason}${details ? ` — ${details}` : ""}`,
          }),
        { once: true }
      );
    });
  });
});
