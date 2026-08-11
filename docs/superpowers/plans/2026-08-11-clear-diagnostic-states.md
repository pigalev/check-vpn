# Clear Diagnostic States Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make public-IP and GeoIP diagnostics unambiguous, expose provider-level GeoIP evidence, and make long diagnostic rows safe on mobile without changing provider lists, consensus thresholds, or Core performance behavior.

**Architecture:** Keep state derivation in model modules and presentation text in one reason catalog. `geoip.js` remains the source of normalized GeoIP agreement states; `diagnostic-reasons.js` maps those states to stable machine-readable reason objects; assessment and dashboard views consume those objects instead of inventing wording. A focused `geoip-evidence.js` + renderer pair exposes provider-by-provider GeoIP data in Advanced, while CSS changes stack long summary rows on narrow screens.

**Tech Stack:** Static ES modules, Node.js >=22, `node:test`, DOM rendering in browser JavaScript, GitHub Actions, GitHub Pages.

## Global Constraints

- Public-IP consensus and GeoIP agreement are separate diagnostic domains.
- A provider outage is not disagreement.
- GeoIP country states are exactly `agree`, `single-source`, `disagree`, `unavailable`.
- GeoIP location states are exactly `agree`, `single-source`, `disagree`, `unavailable`.
- GeoIP location disagreement alone must not turn `protected` into `review`.
- GeoIP country disagreement must produce `review`.
- User-facing wording for diagnostic conditions must come from stable reason codes.
- Advanced must answer which GeoIP providers disagreed and on which fields.
- No content may overlap or overflow horizontally at supported mobile widths.
- Do not change provider lists, consensus thresholds, or the existing Core performance improvements.
- Full verification command is `npm run check`.

---

## File Structure

- Create `assets/diagnostic-reasons.js` — canonical reason-code catalog and builders.
- Create `tests/diagnostic-reasons.test.js` — reason-code and wording contract tests.
- Modify `assets/assessment.js` — consume reason builders for IP/GeoIP review findings.
- Modify `tests/assessment.test.js` — verdict matrix and reason-code assertions.
- Modify `assets/geoip.js` — keep explicit country/location states and add per-source timing needed by evidence.
- Modify `tests/geoip.test.js` — state matrix and latency/evidence-source expectations.
- Create `assets/geoip-evidence.js` — pure GeoIP evidence view model.
- Create `tests/geoip-evidence.test.js` — provider breakdown and field-difference tests.
- Create `assets/geoip-evidence-render.js` — DOM renderer for GeoIP evidence.
- Modify `assets/dashboard-view.js` — expose a single GeoIP presentation state for connection card.
- Modify `tests/dashboard-view.test.js` — exact connection-card copy/state behavior.
- Modify `assets/app.js` — use reason-derived connection copy and render GeoIP evidence in Advanced.
- Modify `assets/dashboard.css` — stacked mobile summary rows and GeoIP evidence layout.
- Modify `scripts/validate-static.mjs` — static assertions for new modules/copy and responsive rule.
- Modify `README.md` — explain the new state/reason semantics and Advanced evidence.

---

### Task 1: Canonical diagnostic reason catalog

**Files:**
- Create: `assets/diagnostic-reasons.js`
- Create: `tests/diagnostic-reasons.test.js`
- Modify: `assets/assessment.js`
- Modify: `tests/assessment.test.js`

**Interfaces:**
- Produces: `reason(code, context = {}) -> { code, id, severity, category, summary, details, sources, evidence? }`
- Produces: `reasonForGeoState({ family, countryState, locationState, countries = [], locations = [] }) -> reason[]`
- Produces: `reasonForIpConsensus({ family, confidence }) -> reason[]`
- `assessment.js` consumes these reason builders and retains existing overall precedence `leak > review > incomplete > protected`.

- [ ] **Step 1: Write failing reason-catalog tests**

Create `tests/diagnostic-reasons.test.js` with explicit contracts:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { reason, reasonForGeoState, reasonForIpConsensus } from '../assets/diagnostic-reasons.js';

test('country disagreement has stable Review wording', () => {
  const item = reason('GEO_COUNTRY_DISAGREEMENT', { family:4, countries:['Germany','Russia'] });
  assert.equal(item.code, 'GEO_COUNTRY_DISAGREEMENT');
  assert.equal(item.severity, 'review');
  assert.equal(item.summary, 'IPv4 GeoIP country disagreement');
  assert.match(item.details, /Germany/);
  assert.match(item.details, /Russia/);
});

test('location disagreement is informational when country agrees', () => {
  const items = reasonForGeoState({
    family:4,
    countryState:'agree',
    locationState:'disagree',
    countries:['Germany'],
    locations:['Neu-Isenburg, Hesse','Frankfurt am Main, Hesse']
  });
  assert.deepEqual(items.map((item) => item.code), ['GEO_LOCATION_DISAGREEMENT']);
  assert.equal(items[0].severity, 'info');
  assert.equal(items[0].summary, 'IPv4 GeoIP location differs between providers');
});

test('public IP no-consensus wording never says GeoIP', () => {
  const [item] = reasonForIpConsensus({ family:4, confidence:'no-consensus' });
  assert.equal(item.code, 'IP_NO_CONSENSUS');
  assert.match(item.summary, /Public IP/);
  assert.doesNotMatch(`${item.summary} ${item.details}`, /GeoIP/i);
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
node --test tests/diagnostic-reasons.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `assets/diagnostic-reasons.js`.

- [ ] **Step 3: Implement the minimal catalog**

Create `assets/diagnostic-reasons.js` with a frozen catalog for at least:

```js
const definitions = Object.freeze({
  IP_NO_CONSENSUS: {
    severity:'review', category:'ip',
    summary:({ family }) => `IPv${family} Public IP consensus failed`,
    details:() => 'Independent public-IP providers returned conflicting addresses and no authoritative winner was established.',
    sources:['http-ip']
  },
  IP_UNAVAILABLE: {
    severity:'info', category:'ip',
    summary:({ family }) => `IPv${family} Public IP unavailable`,
    details:() => 'No public-IP provider group confirmed an address for this family.',
    sources:['http-ip']
  },
  GEO_COUNTRY_DISAGREEMENT: {
    severity:'review', category:'geoip',
    summary:({ family }) => `IPv${family} GeoIP country disagreement`,
    details:({ countries = [] }) => countries.length
      ? `Providers reported different countries for the same public IP: ${countries.join(' / ')}.`
      : 'Providers reported different countries for the same public IP.',
    sources:['geoip']
  },
  GEO_LOCATION_DISAGREEMENT: {
    severity:'info', category:'geoip',
    summary:({ family }) => `IPv${family} GeoIP location differs between providers`,
    details:({ locations = [] }) => locations.length
      ? `Country is consistent, but city/region data differs: ${locations.join(' / ')}.`
      : 'Country is consistent, but city/region data differs between GeoIP providers.',
    sources:['geoip']
  },
  GEO_COUNTRY_SINGLE_SOURCE: {
    severity:'info', category:'geoip',
    summary:({ family }) => `IPv${family} GeoIP country based on one provider`,
    details:() => 'Only one GeoIP provider returned usable country data.',
    sources:['geoip']
  },
  GEO_LOCATION_SINGLE_SOURCE: {
    severity:'info', category:'geoip',
    summary:({ family }) => `IPv${family} GeoIP location based on one provider`,
    details:() => 'Only one GeoIP provider returned usable city/region data.',
    sources:['geoip']
  },
  GEO_UNAVAILABLE: {
    severity:'info', category:'geoip',
    summary:({ family }) => `IPv${family} GeoIP unavailable`,
    details:() => 'No GeoIP provider returned usable location data.',
    sources:['geoip']
  },
  BROWSER_TIMEZONE_MISMATCH: {
    severity:'review', category:'privacy',
    summary:() => 'Browser timezone differs from IP timezone',
    details:({ browserTimezone, ipTimezones = [] }) => `${browserTimezone ?? 'Browser timezone'} differs from ${ipTimezones.join(', ') || 'IP timezone'}.`,
    sources:['browser','geoip']
  }
});
```

`reason()` must add a stable `id` derived from `code` and family, for example `geo-country-disagreement-v4`, without using the display text as an identifier.

- [ ] **Step 4: Make assessment consume the catalog**

Replace ad-hoc `ipv${family}-no-consensus` and GeoIP country finding construction in `assets/assessment.js` with `reasonForIpConsensus()` and `reasonForGeoState()`. Preserve incoming privacy/network findings for compatibility; do not duplicate a reason if an existing finding already has the same `code` or `id`.

For GeoIP state context, collect distinct readable values from `result.geo.sources`:

```js
const countries = [...new Set((result.geo?.sources ?? [])
  .filter((source) => source.status === 'complete')
  .map((source) => source.country ?? source.countryCode)
  .filter(Boolean))];
```

Do the same for normalized `city, region` labels.

- [ ] **Step 5: Extend assessment matrix tests**

Add assertions to `tests/assessment.test.js`:

```js
test('same country but different location stays Protected with info reason', () => {
  const ipv4 = {
    ...completeIp(4,'203.0.113.10'),
    geo:{
      status:'complete', countryCode:'DE', country:'Germany',
      agreement:{countryState:'agree',locationState:'disagree'},
      sources:[
        {status:'complete',country:'Germany',city:'Neu-Isenburg',region:'Hesse'},
        {status:'complete',country:'Germany',city:'Frankfurt am Main',region:'Hesse'}
      ]
    }
  };
  const result = assessResults({ ipv4, ipv6:unavailable6, webrtc:rtc('203.0.113.10') });
  assert.equal(result.status, 'protected');
  const info = result.findings.find((item) => item.code === 'GEO_LOCATION_DISAGREEMENT');
  assert.equal(info?.severity, 'info');
});

test('country disagreement is Review with a stable reason code', () => {
  const ipv4 = {
    ...completeIp(4,'203.0.113.10'),
    geo:{
      status:'complete', countryCode:'DE', country:'Germany',
      agreement:{countryState:'disagree',locationState:'disagree'},
      sources:[
        {status:'complete',country:'Germany',city:'Neu-Isenburg',region:'Hesse'},
        {status:'complete',country:'Russia',city:'Moscow',region:'Moscow'}
      ]
    }
  };
  const result = assessResults({ ipv4, ipv6:unavailable6, webrtc:rtc('203.0.113.10') });
  assert.equal(result.status, 'review');
  assert.equal(result.findings.some((item) => item.code === 'GEO_COUNTRY_DISAGREEMENT'), true);
});
```

Update older assertions that rely only on legacy IDs to assert the reason code as the primary contract.

- [ ] **Step 6: Run GREEN**

Run:

```bash
node --test tests/diagnostic-reasons.test.js tests/assessment.test.js
```

Expected: all tests PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add assets/diagnostic-reasons.js assets/assessment.js tests/diagnostic-reasons.test.js tests/assessment.test.js
git commit -m "feat: centralize diagnostic reason states"
```

---

### Task 2: GeoIP evidence model and state matrix

**Files:**
- Modify: `assets/geoip.js`
- Modify: `tests/geoip.test.js`
- Create: `assets/geoip-evidence.js`
- Create: `tests/geoip-evidence.test.js`

**Interfaces:**
- `geoip.js` continues producing `agreement: { available, total, countryState, locationState, countryAgree, locationAgree }`.
- GeoIP source objects additionally expose `latencyMs` when a request settles.
- Produces: `buildGeoIpEvidence(result) -> { selected, responded, total, countryState, locationState, rows }`.
- Each evidence row: `{ id, label, status, country, region, city, timezone, asn, org, latencyMs, error, countryRelation, locationRelation }`.

- [ ] **Step 1: Write failing evidence-model tests**

Create `tests/geoip-evidence.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGeoIpEvidence } from '../assets/geoip-evidence.js';

test('provider evidence shows which field differs', () => {
  const view = buildGeoIpEvidence({
    ip:'31.76.17.233', countryCode:'DE', country:'Germany', region:'Hesse', city:'Neu-Isenburg',
    agreement:{available:3,total:3,countryState:'disagree',locationState:'disagree'},
    sources:[
      {status:'complete',source:{id:'a',label:'A'},countryCode:'DE',country:'Germany',region:'Hesse',city:'Neu-Isenburg',timezone:'Europe/Berlin',latencyMs:100},
      {status:'complete',source:{id:'b',label:'B'},countryCode:'DE',country:'Germany',region:'Hesse',city:'Frankfurt am Main',timezone:'Europe/Berlin',latencyMs:120},
      {status:'complete',source:{id:'c',label:'C'},countryCode:'RU',country:'Russia',region:'Moscow',city:'Moscow',timezone:'Europe/Moscow',latencyMs:140}
    ]
  });
  assert.equal(view.responded, 3);
  assert.equal(view.rows[0].countryRelation, 'selected');
  assert.equal(view.rows[1].locationRelation, 'differs');
  assert.equal(view.rows[2].countryRelation, 'differs');
});

test('unavailable provider is unavailable, not disagreement', () => {
  const view = buildGeoIpEvidence({
    ip:'203.0.113.10',countryCode:'DE',country:'Germany',region:'Hesse',city:'Frankfurt',
    agreement:{available:1,total:2,countryState:'single-source',locationState:'single-source'},
    sources:[
      {status:'complete',source:{id:'a',label:'A'},countryCode:'DE',country:'Germany',region:'Hesse',city:'Frankfurt'},
      {status:'unavailable',source:{id:'b',label:'B'},error:'Location unavailable.'}
    ]
  });
  assert.equal(view.rows[1].status, 'unavailable');
  assert.equal(view.rows[1].countryRelation, 'unavailable');
});
```

- [ ] **Step 2: Run RED**

```bash
node --test tests/geoip-evidence.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Preserve GeoIP request latency**

In `runGeoIpProviderLookup()` capture elapsed time with an injectable `now` defaulting to `performance.now?.() ?? Date.now()` and attach `latencyMs` to both complete and unavailable/error results. Do not change timeout behavior.

Add to `tests/geoip.test.js` a deterministic test using an injectable `now` sequence and assert that `latencyMs` is present and non-negative.

- [ ] **Step 4: Implement `buildGeoIpEvidence()`**

Create `assets/geoip-evidence.js` as a pure mapper. Normalize comparisons case-insensitively. Compare country by `countryCode ?? country`; compare location by `(city, region)` tuple. Successful provider values matching the selected consensus value get relation `selected`, differing values get `differs`, missing field data gets `missing`, failed lookups get `unavailable`.

The returned overview must include:

```js
{
  selectedIp: result.ip ?? null,
  selectedCountry: result.country ?? result.countryCode ?? null,
  selectedLocation: [result.city, result.region].filter(Boolean).join(', ') || null,
  responded: result.agreement?.available ?? completeRows,
  total: result.agreement?.total ?? rows.length,
  countryState: result.agreement?.countryState ?? 'unavailable',
  locationState: result.agreement?.locationState ?? 'unavailable',
  rows
}
```

- [ ] **Step 5: Complete table-driven GeoIP state tests**

Refactor/add tests in `tests/geoip.test.js` so these cases are explicit and independent:

```js
[
  ['agree/agree', ['DE','DE'], ['Frankfurt|Hesse','Frankfurt|Hesse'], 'agree', 'agree'],
  ['agree/disagree', ['DE','DE'], ['Frankfurt|Hesse','Neu-Isenburg|Hesse'], 'agree', 'disagree'],
  ['disagree/disagree', ['DE','RU'], ['Frankfurt|Hesse','Moscow|Moscow'], 'disagree', 'disagree']
]
```

Keep existing zero-response and one-response tests and assert they remain `unavailable` and `single-source` respectively.

- [ ] **Step 6: Run GREEN**

```bash
node --test tests/geoip.test.js tests/geoip-evidence.test.js
```

Expected: all tests PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add assets/geoip.js assets/geoip-evidence.js tests/geoip.test.js tests/geoip-evidence.test.js
git commit -m "feat: expose GeoIP agreement evidence"
```

---

### Task 3: Connection-card state and copy

**Files:**
- Modify: `assets/dashboard-view.js`
- Modify: `tests/dashboard-view.test.js`
- Modify: `assets/app.js`

**Interfaces:**
- `ipEntry()` / `buildConnectionView()` must expose `geoNotice` as either `null` or `{ code, severity, summary, details }`.
- The connection card must never recompute disagreement by boolean helper; it consumes explicit country/location states and the reason catalog.

- [ ] **Step 1: Write failing connection-view tests**

Replace the generic `locationDisagreement` test with exact notices:

```js
test('country disagreement is an explicit Review notice', () => {
  const disputed = {
    ...ip4,
    geo:{...ip4.geo,agreement:{available:3,total:3,countryState:'disagree',locationState:'disagree'}}
  };
  const view = buildConnectionView({ ipv4:disputed, ipv6:noIp6 });
  assert.equal(view.primary.geoNotice.code, 'GEO_COUNTRY_DISAGREEMENT');
  assert.equal(view.primary.geoNotice.severity, 'review');
  assert.match(view.primary.geoNotice.summary, /country disagreement/i);
});

test('location-only disagreement is informational and specific', () => {
  const disputed = {
    ...ip4,
    geo:{...ip4.geo,agreement:{available:3,total:3,countryState:'agree',locationState:'disagree'}}
  };
  const view = buildConnectionView({ ipv4:disputed, ipv6:noIp6, assessment:{status:'protected'} });
  assert.equal(view.primary.geoNotice.code, 'GEO_LOCATION_DISAGREEMENT');
  assert.equal(view.primary.geoNotice.severity, 'info');
  assert.match(view.primary.geoNotice.summary, /location differs/i);
  assert.equal(view.verdict, 'protected');
});
```

Also add single-source and unavailable cases with exact codes/messages.

- [ ] **Step 2: Run RED**

```bash
node --test tests/dashboard-view.test.js
```

Expected: FAIL because `geoNotice` does not exist.

- [ ] **Step 3: Implement `geoNotice` in the view model**

Import `reasonForGeoState` into `dashboard-view.js`. For a usable GeoIP result, choose the highest-signal notice in this order:

1. `GEO_COUNTRY_DISAGREEMENT`
2. `GEO_LOCATION_DISAGREEMENT`
3. `GEO_COUNTRY_SINGLE_SOURCE` / `GEO_LOCATION_SINGLE_SOURCE`
4. none when both agree

For unavailable GeoIP, expose `GEO_UNAVAILABLE` only when the final GeoIP lookup is complete and no usable location exists; keep provisional `Locating…` unchanged.

Remove the generic `geoDisagrees()` and `locationDisagreement` boolean from new code paths.

- [ ] **Step 4: Render notice consistently in `app.js`**

Replace:

```js
if (primary.locationDisagreement) text(connectionBody, 'GeoIP providers disagree', 'connection-location-warning');
```

with rendering from `primary.geoNotice.summary` and tone class derived from severity:

```js
const toneClass = primary.geoNotice?.severity === 'review'
  ? 'connection-location-warning'
  : 'connection-location-info';
if (primary.geoNotice) text(connectionBody, primary.geoNotice.summary.replace(/^IPv\d+\s+/, ''), toneClass);
```

The hero must therefore show `GeoIP country disagreement` or `GeoIP location differs between providers`, never generic `GeoIP providers disagree`.

- [ ] **Step 5: Run GREEN**

```bash
node --test tests/dashboard-view.test.js tests/diagnostic-reasons.test.js
```

Expected: all tests PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add assets/dashboard-view.js assets/app.js tests/dashboard-view.test.js
git commit -m "fix: clarify GeoIP connection notices"
```

---

### Task 4: Advanced GeoIP provider breakdown

**Files:**
- Create: `assets/geoip-evidence-render.js`
- Modify: `assets/app.js`
- Modify: `assets/dashboard.css`
- Create: `tests/geoip-evidence-render.test.js`

**Interfaces:**
- Consumes: `buildGeoIpEvidence(result)` from Task 2.
- Produces: `renderGeoIpEvidence(parent, geoResult) -> HTMLElement|null`.
- Advanced network row must render Public IP evidence first and GeoIP evidence immediately after it when an authoritative IP has a GeoIP result.

- [ ] **Step 1: Write failing renderer test**

Use the project's existing minimal DOM-test pattern (same document stubbing approach used by renderer tests) and assert the rendered text contains all provider values:

```js
const section = renderGeoIpEvidence(parent, geo);
assert.match(section.textContent, /GeoIP sources/);
assert.match(section.textContent, /Country state.*Disagree/i);
assert.match(section.textContent, /A.*Germany.*Neu-Isenburg.*Europe\/Berlin/s);
assert.match(section.textContent, /C.*Russia.*Moscow.*Europe\/Moscow/s);
```

The test must also assert an unavailable provider is labeled `unavailable`, not `differs`.

- [ ] **Step 2: Run RED**

```bash
node --test tests/geoip-evidence-render.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement renderer**

Create a section with:

- title `GeoIP sources`
- overview rows: `Selected IP`, `Responded providers`, `Country state`, `Location state`, `Selected country`, `Selected location`
- provider rows containing label, status, country, city/region, timezone, ASN/org, latency/error

Use human labels exactly:

```js
const stateLabel = {
  agree:'Agree',
  'single-source':'Single source',
  disagree:'Disagree',
  unavailable:'Unavailable'
};
```

Provider rows with differing country/location get a modifier class such as `geoip-source-differs`; unavailable rows get `geoip-source-unavailable`. Do not infer overall severity from CSS.

- [ ] **Step 4: Wire Advanced**

In `runAdvanced()` after:

```js
renderIpProviderEvidence(row.body, entry);
```

append:

```js
if (ip && entry.geo) renderGeoIpEvidence(row.body, entry.geo);
```

Import the renderer at the top of `assets/app.js`.

- [ ] **Step 5: Add responsive evidence CSS**

Add focused classes for `.geoip-evidence`, `.geoip-source-row`, `.geoip-source-meta`, and modifiers. Desktop may use two columns for provider/value; ≤620px must use one column and wrap every text field.

- [ ] **Step 6: Run GREEN**

```bash
node --test tests/geoip-evidence.test.js tests/geoip-evidence-render.test.js
```

Expected: all tests PASS.

- [ ] **Step 7: Commit Task 4**

```bash
git add assets/geoip-evidence-render.js assets/app.js assets/dashboard.css tests/geoip-evidence-render.test.js
git commit -m "feat: show GeoIP provider evidence in Advanced"
```

---

### Task 5: Mobile summary-row overflow fix

**Files:**
- Modify: `assets/dashboard.css`
- Modify: `scripts/validate-static.mjs`
- Modify: `tests/dashboard-view.test.js`

**Interfaces:**
- Existing `.summary-row` markup remains unchanged.
- At `max-width:620px`, `.summary-row` becomes a stacked one-column layout and `.summary-row-value` becomes left-aligned with unrestricted wrapping.

- [ ] **Step 1: Add RED static-validation expectation**

In `scripts/validate-static.mjs`, add a validation rule that fails unless `assets/dashboard.css` contains the mobile contract:

```js
assertContains(dashboardCss, '@media(max-width:620px)');
assertContains(dashboardCss, '.summary-row{grid-template-columns:1fr');
assertContains(dashboardCss, '.summary-row-value{text-align:left');
```

Use the validator's existing assertion helper names rather than introducing a second mechanism.

- [ ] **Step 2: Run RED validator**

```bash
npm run validate
```

Expected: FAIL because current mobile `.summary-row` still uses `minmax(0,1fr) auto` and right alignment.

- [ ] **Step 3: Implement mobile CSS fix**

Inside the existing `@media(max-width:620px)` block, set:

```css
.summary-row{grid-template-columns:1fr;gap:4px}
.summary-row-value{text-align:left;min-width:0;overflow-wrap:anywhere;word-break:break-word}
.summary-row-label{min-width:0}
```

Do not change desktop `.summary-row` layout.

- [ ] **Step 4: Add semantic regression assertion**

Keep the existing timezone mismatch dashboard-view test and add:

```js
assert.equal(view.summaryRows.find((row) => row.id === 'timezone')?.value,
  'Europe/Moscow ↔ Europe/Berlin · Mismatch');
```

This ensures the CSS fix does not hide or abbreviate the useful diagnostic value.

- [ ] **Step 5: Run GREEN**

```bash
node --test tests/dashboard-view.test.js
npm run validate
```

Expected: both PASS.

- [ ] **Step 6: Commit Task 5**

```bash
git add assets/dashboard.css scripts/validate-static.mjs tests/dashboard-view.test.js
git commit -m "fix: stack long diagnostic rows on mobile"
```

---

### Task 6: Documentation, full regression, PR and deployment verification

**Files:**
- Modify: `README.md`
- Modify: `scripts/validate-static.mjs` if final static contracts need exact module-import checks

**Interfaces:**
- No new runtime interface; this task proves the integrated behavior and documents it.

- [ ] **Step 1: Update README terminology**

Document these exact distinctions:

```text
Public IP consensus = whether independent IP providers agree on the public address.
GeoIP country agreement = whether GeoIP databases agree on country metadata for that selected address.
GeoIP location agreement = whether they agree on city/region metadata.
```

Document that country disagreement is Review, location-only disagreement is informational, one response is single-source, zero responses is unavailable, and Advanced shows provider-by-provider GeoIP evidence.

- [ ] **Step 2: Add static copy guards**

Make validator fail if production `assets/app.js` still contains the obsolete generic text:

```js
assertNotContains(appJs, "'GeoIP providers disagree'");
```

Also assert the new evidence renderer import and canonical reason module are present.

- [ ] **Step 3: Run focused regression suite**

```bash
node --test \
  tests/diagnostic-reasons.test.js \
  tests/assessment.test.js \
  tests/geoip.test.js \
  tests/geoip-evidence.test.js \
  tests/geoip-evidence-render.test.js \
  tests/dashboard-view.test.js
```

Expected: all PASS.

- [ ] **Step 4: Run complete repository verification**

```bash
npm run check
```

Expected: all tests pass, static validation passes, `_site` build succeeds.

- [ ] **Step 5: Review branch diff against spec**

Compare branch against `main` and verify:

- no provider list changes
- no consensus threshold changes
- no Core timeout/hedge changes
- generic `GeoIP providers disagree` removed from production UI
- reason-code catalog is the source of new diagnostic copy
- Advanced GeoIP evidence exists
- mobile summary rows stack at ≤620px

Any Critical/Important review finding must be fixed and `npm run check` rerun before PR.

- [ ] **Step 6: Create PR to `main`**

PR title:

```text
Clarify diagnostic states and GeoIP evidence
```

PR body must summarize reason codes, state semantics, Advanced GeoIP breakdown, mobile layout fix, and exact verification result.

- [ ] **Step 7: Require green PR CI**

Verify the PR-triggered `Test` workflow runs on the exact branch HEAD and completes with conclusion `success`. Do not merge while queued/in-progress or failed.

- [ ] **Step 8: Merge to `main`**

Use squash merge after green CI and clean review.

- [ ] **Step 9: Verify post-merge CI/CD**

On the exact merged `main` SHA verify:

- `Test` workflow: `success`
- `Deploy Pages` workflow build job: `success`
- `Deploy Pages` workflow deploy job: `success`
- GitHub Pages source remains workflow-based from `main`

- [ ] **Step 10: Final production-state report**

Report merged SHA, test/deploy workflow conclusions, and the user-visible behavior now expected for:

- country disagreement
- location-only disagreement
- single-source GeoIP
- unavailable GeoIP
- mobile timezone mismatch row
- Advanced GeoIP evidence

---

## Plan Self-Review

- Spec coverage: all state-model, reason-code, copy, Advanced evidence, mobile layout, test-matrix, and CI/CD requirements map to Tasks 1–6.
- Placeholder scan: no TBD/TODO/fill-later steps remain.
- Interface consistency: `reasonForGeoState`, `reasonForIpConsensus`, `buildGeoIpEvidence`, `renderGeoIpEvidence`, and `geoNotice` names are used consistently across producer/consumer tasks.
- Scope check: provider selection, quorum thresholds, Core timeout/hedging, and backend work remain explicitly out of scope.
