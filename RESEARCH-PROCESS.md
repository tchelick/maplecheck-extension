# MapleCheck data research pipeline (free public sources only)

This is the repeatable process for adding or verifying a company entry.
No paid data API — everything here is free or has a usable free tier.
The goal: a consistent, checkable process instead of ad-hoc searching,
so quality doesn't depend on remembering to check the right things.

## Step 1 — Is it a public company?

Check the stock ticker/exchange first — this is the fastest, most
authoritative free path when it applies.

- **Canadian-listed**: search SEDAR+ (sedarplus.ca) for the company's
  filings — annual information form (AIF) or prospectus will state parent
  company structure and major shareholders.
- **US-listed**: search SEC EDGAR (sec.gov/edgar) — 10-K filings have an
  "Item 1" business description that states HQ, incorporation, and
  ownership structure. Proxy statements (DEF 14A) show major shareholders.
- Dual-listed (like RBI/Tim Hortons, Canada Goose): check both, and note
  it — dual listing alone doesn't tell you who controls the company,
  check the shareholder breakdown.

If public, this alone often answers ownership with a real citation.
Confidence: high, if the filing is recent (check the date).

## Step 2 — Is it private? Check the registry, then the deal history

Public filings don't exist for private companies. Two-part check:

1. **Confirm the company is real and where it's registered**: Corporations
   Canada federal registry (corporationscanada.ic.gc.ca) or the relevant
   provincial registry (Ontario, BC, Quebec's Registraire des entreprises).
   This confirms incorporation, registered address — rarely shows the
   actual ownership chain for private companies.
2. **Find the ownership chain via deal history**: search news for
   "[company] acquired", "[company] sold to", "[company] owner". This is
   where most of the real answer comes from for private/PE-owned
   companies — Rona, Well.ca/Rexall, and Petro-Canada's near-sale were
   all found this way, not through a registry.

Confidence: only "high" if you find the deal confirmed by 2+ independent
sources (a press release plus a news report, ideally with a date).
Otherwise mark "verify".

## Step 3 — OpenCorporates as a cross-reference (free tier)

OpenCorporates (opencorporates.com) aggregates global company registries
into one searchable index. Free tier is rate-limited (a handful of API
calls per day without a key; more with a free registered key) — use it
to cross-check a registration you're unsure about, not as a first stop.
Good for confirming a company exists and its registered jurisdiction;
still weak on private ownership chains, same limitation as the registries
above.

## Step 4 — Wikipedia/Wikidata as a lead, never a citation

Useful for a fast overview and to find the *names* of the real sources
(the news article, the SEC filing) it's citing. Never the final source
in the data.js note field — always trace to what Wikipedia itself cites.

## Step 5 — Write the entry

- `confidence: "high"` only if Step 1 (public filing) or Step 2 with 2+
  independent sources confirmed it
- `confidence: "verify"` if the picture is genuinely mixed (Tim Hortons,
  Lululemon) or you only found one weak source
- Always name what you checked in the `note` field — a filing, a deal
  announcement, a date — so a future check knows what's already been
  verified and what's still owed a better source

## What this pipeline does NOT solve

- It's still manual, per-company research. It doesn't scale to "all
  sites" any more than the ad-hoc version did — it's the same amount of
  work, just organized so quality doesn't slip.
- Recency: ownership changes (see Petro-Canada, Well.ca/Rexall flipping
  twice in a decade). Nothing here alerts you when an entry goes stale —
  that still needs a periodic re-check pass or the crowdsourced report
  flow to catch it.
- Paid data APIs (OpenCorporates paid tiers, Bloomberg/Orbis) would
  reduce the manual load, but at real ongoing cost — worth revisiting
  once there's revenue to justify it, not before.
