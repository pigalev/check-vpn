# Multi-provider GeoIP Consensus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make public-IP metadata resilient to individual GeoIP provider failures by querying several browser-compatible providers in parallel, choosing a consensus result, and surfacing meaningful disagreements without affecting VPN leak status.

**Architecture:** Keep IP detection authoritative and unchanged. For each detected IPv4/IPv6 address, query three GeoIP providers in parallel (`ipapi.co`, `ipwho.is`, `FreeIPAPI`), normalize their different payloads into one internal shape, then build a consensus object. Country disagreement is treated as important GeoIP uncertainty, while city/region disagreement is informational only; neither changes the HTTP/WebRTC leak assessment.

**Tech Stack:** Plain JavaScript ES modules, Fetch API, DOM APIs, Node.js 22 built-in tests, GitHub Actions, GitHub Pages.

## Global Constraints

- Never use a GeoIP provider to determine the public IP; enrich only the IP already returned by the IPv4/IPv6 endpoint.
- Query all configured providers in parallel so one slow or broken provider does not block the others beyond the shared timeout window.
- A successful provider result must still be shown even if every other provider fails.
- Preserve source-level results in the JSON report.
- Show provider disagreement in the UI only when useful; do not clutter the normal all-agree path.
- Country disagreement is visually notable; city/region disagreement is informational.
- GeoIP disagreement must never change the top-level VPN leak assessment.
- Keep mobile layout responsive with no horizontal page overflow.
- No API keys, cookies, analytics, or persistent storage.

---

### Task 1: Configure three browser-compatible GeoIP providers

**Files:**
- Modify: `assets/config.js`
- Modify: `tests/config.test.js`

**Interfaces:**
- Replace single `networkConfig.geoIpUrlTemplate` with immutable `networkConfig.geoIpProviders` array entries shaped as `{ id, label, urlTemplate, kind }`.
- Keep `networkConfig.geoIpTimeoutMs`.

- [ ] Write failing config tests asserting exactly three enabled providers and `{ip}` in every URL.
- [ ] Run focused config tests and confirm failure.
- [ ] Configure `ipapi`, `ipwhois`, and `freeipapi` provider definitions.
- [ ] Re-run focused tests and confirm pass.

### Task 2: Normalize each provider and build consensus

**Files:**
- Modify: `assets/geoip.js`
- Modify: `tests/geoip.test.js`

**Interfaces:**
- `normalizeGeoIp(payload, expectedIp, kind, source)` returns common metadata plus `source`.
- `runGeoIpProviderLookup({ ip, provider, timeoutMs, fetchImpl? })` returns one source result.
- `runGeoIpConsensus({ ip, providers, timeoutMs, fetchImpl? })` returns:
  - `status`: `complete | partial | unavailable`
  - `ip`
  - consensus fields `countryCode`, `country`, `region`, `city`, `asn`, `org`, `timezone`
  - `agreement`: `{ available, total, countryAgree, locationAgree }`
  - `sources`: normalized per-provider results
  - `differences`: source summaries when successful providers disagree

Consensus rules:
- Ignore failed/unavailable providers when selecting values.
- Choose the most frequent non-empty value per field; ties use configured provider order.
- `countryAgree` is true when all successful providers with country data report the same country code.
- `locationAgree` is true when successful providers with city/region data agree on normalized country/city/region tuple.
- If at least one provider succeeds, the aggregate must not be `unavailable`.

- [ ] Add failing tests for ipapi, ipwho.is, and FreeIPAPI normalization.
- [ ] Add failing tests for one-success/two-fail fallback, full agreement, city disagreement, and country disagreement.
- [ ] Implement minimal normalization/provider runner/consensus helpers.
- [ ] Re-run GeoIP tests and confirm pass.

### Task 3: Use consensus enrichment in app orchestration

**Files:**
- Modify: `assets/app.js`

**Interfaces:**
- Replace `runGeoIpLookup` usage with `runGeoIpConsensus`.
- `result.geo` becomes the aggregate consensus object and preserves `sources`.

- [ ] Update imports and `enrichIp()` to pass `networkConfig.geoIpProviders`.
- [ ] Preserve existing IP success when consensus is unavailable.
- [ ] Keep JSON report richer with consensus and source-level data.

### Task 4: Render availability and disagreements without clutter

**Files:**
- Modify: `assets/app.js`
- Modify: `assets/styles.css`

**Normal agreement UI:**

```text
Location    [flag] Germany · Frankfurt am Main, Hesse
Network     AS210644 · AEZA INTERNATIONAL LTD
Timezone    Europe/Berlin
Sources     3/3 available · agree
```

**Partial provider availability:**

```text
Sources     2/3 available · agree
```

**Location disagreement:**

Show the consensus rows normally, then a compact expandable-looking detail block (always visible but concise) only when successful sources differ:

```text
GeoIP providers differ
ipapi.co      Germany · Frankfurt am Main
ipwho.is      Germany · Frankfurt am Main
FreeIPAPI     Germany · Eschborn
```

Country disagreement gets a warning-class heading such as `Country disagreement`; city/region-only mismatch gets neutral `Location estimates differ`.

If every provider fails, use one concise row:

```text
Location    Unavailable
Sources     0/3 available
```

- [ ] Extend IP-card rendering for source availability and consensus.
- [ ] Add a source-difference block only when necessary.
- [ ] Keep country flags on consensus and per-source country entries where code exists.
- [ ] Add responsive CSS for source rows and long organization/city text.

### Task 5: Documentation and regression verification

**Files:**
- Modify: `README.md`
- Verify: all tests/build.

- [ ] Document the three-provider GeoIP approach and that location metadata is approximate.
- [ ] Document that providers receive the already-detected public IP.
- [ ] Run `npm test`.
- [ ] Run `npm run check`.
- [ ] Confirm final branch `Test` workflow has `conclusion: success`.
- [ ] Present integration choices; do not merge into `main` without user choice.