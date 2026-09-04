// MapleCheck Wikidata lookup — free, no API key, no backend of ours required.
// This is an UNVERIFIED auto-guess source, not a replacement for the manual
// research process in RESEARCH-PROCESS.md. Results from this must always be
// shown with a clear "not human-verified" label, never with the same visual
// weight as a confirmed data.js entry.
//
// Coverage limitation (expected, not a bug): Wikidata only has entries for
// companies notable enough to have a Wikipedia page. Most small/private
// Canadian brands — exactly what this app is often most useful for — will
// come back empty. That's fine; an empty result here should still count as
// a "request research" signal, same as before.

// Small lookup table for the country Q-IDs we actually care about, so we
// don't need a second network round-trip just to resolve "Q16" -> "Canada".
const COUNTRY_QID_MAP = {
  Q16: "Canada",
  Q30: "United States",
  Q145: "United Kingdom",
  Q183: "Germany",
  Q142: "France",
  Q55: "Netherlands",
  Q34: "Sweden",
  Q39: "Switzerland",
  Q38: "Italy",
  Q17: "Japan",
  Q29: "Spain",
  Q159: "Russia",
  Q148: "China",
};

// Turn a hostname like "kickinghorsecoffee.com" into a search term like
// "kicking horse coffee".
//
// KNOWN LIMITATION (found in testing, not fully solved): short or acronym
// domains produce unreliable matches even above the length threshold below —
// "ns.com" (Network School) matching "Nova Scotia" is the case that surfaced
// this. The length check below catches the worst (shortest) cases, but this
// remains a fundamentally unreliable technique for short/ambiguous names.
// This is inherent to guessing from a bare hostname string with no other
// context — a real fix would need actual page-content signals, not just the
// domain name, which is out of scope for this free/no-backend approach.
function hostnameToSearchTerm(hostname) {
  const withoutTld = hostname.replace(/^www\./, "").replace(/\.(com|ca|store|net|org|io|co)$/i, "");
  return withoutTld.replace(/[-_.]/g, " ").trim();
}

// Main lookup. Returns a promise resolving to either:
//   { found: false }
// or
//   { found: true, label: "...", country: "...", ownedByLabel: "...", wikidataUrl: "..." }
// ownedByLabel is a raw Wikidata label for the "owned by" entity, if present
// — NOT resolved to a country, since the owner is often itself a company,
// not a country. Country resolution only happens for the country/HQ fields.
async function lookupWikidata(hostname) {
  try {
    const term = hostnameToSearchTerm(hostname);
    if (!term) return { found: false };

    // Short/acronym search terms are unreliable — "ns" matches Nova Scotia's
    // abbreviation on Wikidata, not "Network School" (the actual ns.com).
    // Rather than return a confident-looking wrong guess, refuse to guess
    // at all below a length threshold and say why.
    if (term.length < 4) {
      return { found: false, reason: "too-short" };
    }

    const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(term)}&language=en&format=json&origin=*&type=item&limit=1`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();

    if (!searchData.search || searchData.search.length === 0) {
      return { found: false };
    }

    const entity = searchData.search[0];
    const qid = entity.id;
    const label = entity.label || term;

    // Fetch claims for country (P17) and owned by (P127).
    const claimsUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&format=json&origin=*&props=claims|labels&languages=en`;
    const claimsRes = await fetch(claimsUrl);
    const claimsData = await claimsRes.json();
    const claims = claimsData.entities?.[qid]?.claims || {};

    let country = null;
    if (claims.P17 && claims.P17.length > 0) {
      const countryQid = claims.P17[0]?.mainsnak?.datavalue?.value?.id;
      country = COUNTRY_QID_MAP[countryQid] || null; // unknown country Q-ID: leave null rather than guess
    }

    let ownedByQid = null;
    let ownedByLabel = null;
    if (claims.P127 && claims.P127.length > 0) {
      ownedByQid = claims.P127[0]?.mainsnak?.datavalue?.value?.id || null;
    }

    // If there's an owner, fetch its label and country separately —
    // ownership chains matter more than the entity's own registration country.
    if (ownedByQid) {
      const ownerUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ownedByQid}&format=json&origin=*&props=labels|claims&languages=en`;
      const ownerRes = await fetch(ownerUrl);
      const ownerData = await ownerRes.json();
      const ownerEntity = ownerData.entities?.[ownedByQid];
      ownedByLabel = ownerEntity?.labels?.en?.value || null;
      const ownerClaims = ownerEntity?.claims || {};
      if (ownerClaims.P17 && ownerClaims.P17.length > 0) {
        const ownerCountryQid = ownerClaims.P17[0]?.mainsnak?.datavalue?.value?.id;
        const ownerCountry = COUNTRY_QID_MAP[ownerCountryQid] || null;
        if (ownerCountry) country = ownerCountry; // owner's country is more relevant than the brand's own
      }
    }

    if (!country && !ownedByLabel) {
      // We found a Wikidata entity but no usable ownership/country signal —
      // treat as not found rather than showing an empty guess.
      return { found: false };
    }

    return {
      found: true,
      label,
      country,
      ownedByLabel,
      wikidataUrl: `https://www.wikidata.org/wiki/${qid}`,
    };
  } catch (err) {
    // Network failure, rate limit, etc. — fail silently to "not found".
    // This is a best-effort free fallback, not a critical path.
    console.warn("MapleCheck Wikidata lookup failed:", err);
    return { found: false };
  }
}
