# Fast Progressive IP + RU-Friendly GeoIP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make IPv4/IPv6 and location appear as soon as the fastest valid provider responds, while preserving final consensus accuracy and expanding GeoIP coverage for Russian mobile/network ranges.

**Architecture:** Add progressive wrappers around the existing IP and GeoIP provider runners. The wrappers emit one early callback (`onFirstValid` / `onFirstUsable`) while still resolving to the same final consensus shape; `app.js` consumes those callbacks to render provisional address/location immediately and stores only final consensus in `currentReport`. RU-friendly GeoIP is added through `ipapi.is`, while Sypex is enabled only after real browser CORS verification.

**Tech Stack:** Static browser ES modules, Fetch/AbortController, Node.js >=22 `node:test`, existing GitHub Pages workflows and static validator.

## Global Constraints

- Product UI remains concise English.
- First visible public IP must not wait for all IP providers, WebRTC, or their timeouts.
- First visible location must not wait for all GeoIP providers or their timeouts.
- Final IPv4/IPv6 and GeoIP consensus semantics remain backward compatible.
- Provisional values are UI-only; final `currentReport`/Copy JSON uses completed consensus.
- Wrong-family/malformed IP responses never become provisional addresses.
- GeoIP ASN/org-only responses do not satisfy `onFirstUsable`; location means country/countryCode, region, or city.
- Slow/failed providers remain isolated and do not cancel successful providers.
- Stale callbacks from older `runId` or an old provisional address cannot mutate the current UI.
- Do not flash `Location unavailable` while another active GeoIP provider is still pending.
- `ipapi.is` is added to the normal parallel GeoIP race.
- Sypex `https://ru.sxgeo.city/json/{ip}` is enabled only if real browser/deployed CORS verification succeeds; otherwise omit it without JSONP/proxy workarounds.
- No API keys or project backend are added.
- Monitor/Aggressive/Guided callers using existing `runIpConsensus()` / `runGeoIpConsensus()` APIs remain regression-compatible.
- Existing once-per-address enrichment caching in Aggressive/Monitor must not be changed into per-sample GeoIP calls.
- Full `npm run check` must pass on the exact feature HEAD before merge.

---

## File Structure

**Modify**
- `assets/ip-consensus.js` — progressive first-valid callback while retaining `runIpConsensus()` compatibility.
- `assets/geoip.js` — progressive first-usable callback plus `ipapi.is` and optional Sypex payload normalization.
- `assets/config.js` — RU-friendly GeoIP provider definitions.
- `assets/app.js` — progressive non-blocking core orchestration and stale-result guards.
- `tests/max-diagnostics.test.js` — IP progressive behavior/regression.
- `tests/geoip.test.js` — GeoIP progressive behavior and new normalizers.
- Create `tests/progressive-core.test.js` — app/core orchestration invariants and stale-callback regression.
- `scripts/validate-static.mjs` — require new progressive imports/config where useful.
- `README.md` — active GeoIP providers, progressive behavior and third-party request disclosure.

No new runtime module is required unless `app.js` progressive orchestration becomes difficult to test without extracting one focused helper; if extraction is needed during Task 4, create `assets/core-progress.js` and `tests/core-progress.test.js` together in that task only.

---

### Task 1: Progressive Public-IP Consensus

**Files:**
- Modify: `assets/ip-consensus.js`
- Modify: `tests/max-diagnostics.test.js`

**Interfaces:**
- Existing: `runIpProvider({ provider, family, timeoutMs, fetchImpl = fetch })` unchanged.
- Produces: `runIpConsensusProgressive({ family, providers, timeoutMs, fetchImpl = fetch, onFirstValid = null })` -> Promise of the exact existing final consensus shape.
- Existing `runIpConsensus(args)` becomes a compatibility wrapper around `runIpConsensusProgressive(args)` with no callback.
- `onFirstValid(source)` fires at most once with one successful provider result `{ id, label, status:'complete', address, family, latencyMs, error:null }`.

- [ ] **Step 1: Write failing first-valid timing tests**

Add imports:

```js
import { runIpConsensus, runIpConsensusProgressive } from '../assets/ip-consensus.js';
```

Add a deferred helper and tests:

```js
function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

test('progressive IP emits first valid address before slower providers finish', async () => {
  const slow = deferred();
  const providers = [
    { id:'fast', label:'Fast', kind:'ipify', url:'https://fast.test' },
    { id:'slow', label:'Slow', kind:'ipify', url:'https://slow.test' }
  ];
  const seen = [];
  const promise = runIpConsensusProgressive({
    family: 4, providers, timeoutMs: 1000,
    fetchImpl: async (url) => url.includes('fast.test')
      ? responseJson({ ip: '203.0.113.10' })
      : slow.promise,
    onFirstValid: (source) => seen.push(source.address)
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(seen, ['203.0.113.10']);
  slow.resolve(responseJson({ ip: '203.0.113.10' }));
  const final = await promise;
  assert.equal(final.address, '203.0.113.10');
  assert.equal(final.agreement.available, 2);
});

test('failed and wrong-family providers never block or win first-valid', async () => {
  const providers = [
    { id:'fail', label:'Fail', kind:'ipify', url:'https://fail.test' },
    { id:'wrong', label:'Wrong', kind:'ipify', url:'https://wrong.test' },
    { id:'good', label:'Good', kind:'ipify', url:'https://good.test' }
  ];
  const seen = [];
  const final = await runIpConsensusProgressive({
    family: 4, providers, timeoutMs: 100,
    fetchImpl: async (url) => {
      if (url.includes('fail.test')) throw new TypeError('offline');
      if (url.includes('wrong.test')) return responseJson({ ip: '2001:db8::10' });
      return responseJson({ ip: '203.0.113.10' });
    },
    onFirstValid: (source) => seen.push(source.address)
  });
  assert.deepEqual(seen, ['203.0.113.10']);
  assert.equal(final.address, '203.0.113.10');
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/max-diagnostics.test.js`

Expected: FAIL because `runIpConsensusProgressive` is not exported.

- [ ] **Step 3: Implement progressive provider settlement**

Implement one shared finalizer so final semantics do not drift:

```js
function buildConsensusResult(family, providers, sources) {
  const successful = sources.filter((source) => source.status === 'complete');
  const counts = {};
  for (const source of successful) counts[source.address] = (counts[source.address] ?? 0) + 1;
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const winner = ranked[0]?.[0] ?? null;
  const topCount = ranked[0]?.[1] ?? 0;
  const tied = ranked.length > 1 && ranked[1][1] === topCount;
  return {
    status: successful.length ? 'complete' : 'unavailable',
    family,
    address: tied ? successful[0]?.address ?? null : winner,
    agreement: { available: successful.length, total: providers.length, agree: ranked.length <= 1, counts },
    sources,
    error: successful.length ? null : `IPv${family} unavailable`
  };
}

export async function runIpConsensusProgressive({ family, providers, timeoutMs, fetchImpl = fetch, onFirstValid = null }) {
  let emitted = false;
  const promises = providers.map(async (provider) => {
    const source = await runIpProvider({ provider, family, timeoutMs, fetchImpl });
    if (!emitted && source.status === 'complete') {
      emitted = true;
      onFirstValid?.(source);
    }
    return source;
  });
  return buildConsensusResult(family, providers, await Promise.all(promises));
}

export function runIpConsensus(args) {
  return runIpConsensusProgressive(args);
}
```

- [ ] **Step 4: Verify GREEN and legacy final semantics**

Run: `node --test tests/max-diagnostics.test.js tests/provider-observations.test.js`

Expected: PASS, including existing majority and single-success tests.

- [ ] **Step 5: Commit**

```bash
git add assets/ip-consensus.js tests/max-diagnostics.test.js
git commit -m "feat: emit public IP before consensus completes"
```

---

### Task 2: Progressive GeoIP and RU-Friendly Payload Normalization

**Files:**
- Modify: `assets/geoip.js`
- Modify: `tests/geoip.test.js`

**Interfaces:**
- Produces: `hasUsableGeoLocation(result)` -> boolean; true when normalized complete result contains country/countryCode, region, or city.
- Produces: `runGeoIpConsensusProgressive({ ip, providers, timeoutMs, fetchImpl = fetch, onFirstUsable = null })` -> Promise of the exact existing final GeoIP consensus shape.
- Existing `runGeoIpConsensus(args)` becomes compatibility wrapper.
- `normalizeGeoIp(payload, expectedIp, kind, source)` gains `kind === 'ipapiis'` and `kind === 'sypex'` branches.

- [ ] **Step 1: Write failing normalization tests for `ipapi.is` and Sypex**

Add to `tests/geoip.test.js`:

```js
test('normalizes ipapi.is location and network metadata', () => {
  const result = normalizeGeoIp({
    ip: '128.71.33.91',
    location: {
      country_code: 'RU', country: 'Russia', state: 'Krasnodar Krai',
      city: 'Krasnodar', timezone: 'Europe/Moscow'
    },
    asn: { asn: 3216, org: 'PJSC VimpelCom' }
  }, '128.71.33.91', 'ipapiis', { id:'ipapiis', label:'ipapi.is' });
  assert.equal(result.countryCode, 'RU');
  assert.equal(result.city, 'Krasnodar');
  assert.equal(result.region, 'Krasnodar Krai');
  assert.equal(result.timezone, 'Europe/Moscow');
  assert.equal(result.asn, 'AS3216');
  assert.equal(result.org, 'PJSC VimpelCom');
});

test('normalizes Sypex Geo payload', () => {
  const result = normalizeGeoIp({
    country: { iso: 'RU', name_en: 'Russia' },
    region: { name_en: 'Moscow' },
    city: { name_en: 'Moscow' }
  }, '128.71.33.91', 'sypex', { id:'sypex-ru', label:'Sypex Geo RU' });
  assert.equal(result.countryCode, 'RU');
  assert.equal(result.country, 'Russia');
  assert.equal(result.region, 'Moscow');
  assert.equal(result.city, 'Moscow');
});
```

- [ ] **Step 2: Write failing first-usable GeoIP timing tests**

```js
test('progressive GeoIP emits first usable location before slower provider finishes', async () => {
  const slow = deferred();
  const providers = [
    { id:'fast', label:'Fast', kind:'ipwhois', urlTemplate:'https://fast.test/{ip}' },
    { id:'slow', label:'Slow', kind:'ipwhois', urlTemplate:'https://slow.test/{ip}' }
  ];
  const seen = [];
  const promise = runGeoIpConsensusProgressive({
    ip: '128.71.33.91', providers, timeoutMs: 1000,
    fetchImpl: async (url) => url.includes('fast.test')
      ? responseJson({ success:true, country_code:'RU', country:'Russia', region:'Krasnodar Krai', city:'Krasnodar' })
      : slow.promise,
    onFirstUsable: (geo) => seen.push(geo.city)
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(seen, ['Krasnodar']);
  slow.resolve(responseJson({ success:true, country_code:'RU', country:'Russia', region:'Krasnodar Krai', city:'Krasnodar' }));
  const final = await promise;
  assert.equal(final.agreement.available, 2);
});

test('ASN-only result does not satisfy first usable location', async () => {
  const seen = [];
  await runGeoIpConsensusProgressive({
    ip:'128.71.33.91',
    providers:[
      { id:'asn', label:'ASN only', kind:'ipapiis', urlTemplate:'https://asn.test/{ip}' },
      { id:'geo', label:'Geo', kind:'ipwhois', urlTemplate:'https://geo.test/{ip}' }
    ], timeoutMs:100,
    fetchImpl: async (url) => url.includes('asn.test')
      ? responseJson({ asn:{ asn:3216, org:'VimpelCom' } })
      : responseJson({ success:true, country_code:'RU', country:'Russia', city:'Krasnodar' }),
    onFirstUsable: (geo) => seen.push(geo.source.id)
  });
  assert.deepEqual(seen, ['geo']);
});
```

- [ ] **Step 3: Verify RED**

Run: `node --test tests/geoip.test.js`

Expected: FAIL because progressive export and new kinds are missing.

- [ ] **Step 4: Implement new normalizers**

Add branches equivalent to:

```js
if (kind === 'ipapiis') {
  const location = payload.location ?? {};
  const network = typeof payload.asn === 'object' ? payload.asn : {};
  data = {
    countryCode: location.country_code,
    country: location.country,
    region: location.state ?? location.region,
    city: location.city,
    asn: network.asn ?? payload.asn,
    org: network.org ?? payload.company?.name,
    timezone: location.timezone
  };
} else if (kind === 'sypex') {
  data = {
    countryCode: payload.country?.iso,
    country: payload.country?.name_en ?? payload.country?.name_ru,
    region: payload.region?.name_en ?? payload.region?.name_ru,
    city: payload.city?.name_en ?? payload.city?.name_ru,
    asn: payload.asn,
    org: payload.org,
    timezone: payload.city?.timezone ?? payload.region?.timezone
  };
}
```

- [ ] **Step 5: Implement progressive GeoIP settlement**

Extract current consensus aggregation into `buildGeoIpConsensusResult(ip, providers, sources)`. Implement:

```js
export function hasUsableGeoLocation(result) {
  return result?.status === 'complete' && Boolean(result.countryCode || result.country || result.region || result.city);
}

export async function runGeoIpConsensusProgressive({ ip, providers, timeoutMs, fetchImpl = fetch, onFirstUsable = null }) {
  let emitted = false;
  const promises = providers.map(async (provider) => {
    const result = await runGeoIpProviderLookup({ ip, provider, timeoutMs, fetchImpl });
    if (!emitted && hasUsableGeoLocation(result)) {
      emitted = true;
      onFirstUsable?.(result);
    }
    return result;
  });
  return buildGeoIpConsensusResult(ip, providers, await Promise.all(promises));
}

export function runGeoIpConsensus(args) {
  return runGeoIpConsensusProgressive(args);
}
```

- [ ] **Step 6: Verify GREEN and existing GeoIP semantics**

Run: `node --test tests/geoip.test.js`

Expected: PASS including existing one-success, agreement and disagreement cases.

- [ ] **Step 7: Commit**

```bash
git add assets/geoip.js tests/geoip.test.js
git commit -m "feat: emit GeoIP location before consensus completes"
```

---

### Task 3: Configure RU-Friendly Providers and Gate Sypex on Browser CORS

**Files:**
- Modify: `assets/config.js`
- Modify: `tests/config.test.js`
- Modify: `README.md` only for a one-line temporary provider note if Sypex verification is performed manually in this task; full docs remain Task 6.

**Interfaces:**
- `networkConfig.geoIpProviders` always includes:

```js
{ id:'ipapiis', label:'ipapi.is', kind:'ipapiis', urlTemplate:'https://api.ipapi.is/?q={ip}' }
```

- Sypex is added only if verified:

```js
{ id:'sypex-ru', label:'Sypex Geo RU', kind:'sypex', urlTemplate:'https://ru.sxgeo.city/json/{ip}' }
```

- [ ] **Step 1: Write failing config test for `ipapi.is`**

```js
test('GeoIP providers include browser-compatible ipapi.is', () => {
  const provider = networkConfig.geoIpProviders.find((item) => item.id === 'ipapiis');
  assert.equal(provider?.kind, 'ipapiis');
  assert.equal(provider?.urlTemplate, 'https://api.ipapi.is/?q={ip}');
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/config.test.js`

Expected: FAIL because `ipapiis` is not in `geoIpProviders`.

- [ ] **Step 3: Add `ipapi.is` to parallel GeoIP providers**

Append it after the current three providers; do not remove current providers.

- [ ] **Step 4: Verify GREEN**

Run: `node --test tests/config.test.js tests/geoip.test.js`

Expected: PASS.

- [ ] **Step 5: Perform Sypex CORS verification before editing config**

From a real browser or deployed static-page console, execute:

```js
fetch('https://ru.sxgeo.city/json/128.71.33.91', { cache: 'no-store' })
  .then(async (response) => ({ ok: response.ok, status: response.status, json: await response.json() }))
  .then(console.log)
  .catch(console.error)
```

Success criterion: browser JavaScript receives a successful JSON response without a CORS exception. A server-side `curl`/search result alone is not sufficient evidence.

- [ ] **Step 6A: If browser CORS succeeds, add Sypex provider and config test**

```js
test('verified Sypex regional endpoint is configured as a separate GeoIP provider', () => {
  const provider = networkConfig.geoIpProviders.find((item) => item.id === 'sypex-ru');
  assert.equal(provider?.urlTemplate, 'https://ru.sxgeo.city/json/{ip}');
});
```

Then add the provider object to `geoIpProviders`.

- [ ] **Step 6B: If browser CORS fails or cannot be verified reliably, do not add Sypex**

Record the decision in the implementation commit message/body or execution notes. Do not add JSONP, `no-cors`, external proxy, or a fake provider status.

- [ ] **Step 7: Commit**

```bash
git add assets/config.js tests/config.test.js
git commit -m "feat: add RU-friendly GeoIP provider"
```

---

### Task 4: Progressive Core Orchestration

**Files:**
- Modify: `assets/app.js`
- Create: `tests/progressive-core.test.js`
- Optionally create only if needed for testability: `assets/core-progress.js`

**Interfaces:**
- `app.js` imports `runIpConsensusProgressive` and `runGeoIpConsensusProgressive`.
- One GeoIP promise/cache per `runCore()` keyed by exact public address.
- Early callback rendering is guarded by both `runId` and the family address currently displayed.
- Final `currentReport.ipv4` / `.ipv6` contain final consensus with final `geo` consensus.

- [ ] **Step 1: Write failing source-level orchestration tests**

Create `tests/progressive-core.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../assets/app.js', import.meta.url), 'utf8');

test('core imports progressive IP and GeoIP runners', () => {
  assert.match(app, /runIpConsensusProgressive/);
  assert.match(app, /runGeoIpConsensusProgressive/);
});

test('core no longer waits for one Promise.all of IP4 IP6 and WebRTC before rendering', () => {
  assert.doesNotMatch(app, /const \[r4, r6, webrtc\] = await Promise\.all\(\[/);
});

test('early callbacks are guarded by current run id', () => {
  assert.match(app, /expectedRunId/);
  assert.match(app, /currentRunId\s*!==\s*expectedRunId/);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/progressive-core.test.js`

Expected: FAIL because app still imports blocking consensus only and contains the blocking `Promise.all` flow.

- [ ] **Step 3: Add a progressive IP-card rendering shape**

Adjust `renderIp(name, result)` to tolerate provisional fields without inventing final counts. Use fields such as:

```js
{
  family: 4,
  address: '128.71.33.91',
  agreement: null,
  geo: null,
  ipFinal: false,
  geoPending: true
}
```

Rendering rules:

```text
address present + !ipFinal -> card status `Detected`
geoPending && !geo -> Location `Locating…`
!geoPending && no usable geo -> Location `Unavailable`
no final agreement -> IP sources `Checking…`
geo present but !geoFinal -> GeoIP `Checking…`
```

Never access `result.agreement.available` without null guards.

- [ ] **Step 4: Implement one-address GeoIP in-flight cache inside `runCore()`**

Use a local map per run:

```js
const geoPromises = new Map();
function locate(address, family, expectedRunId, onEarly) {
  if (!address) return Promise.resolve(null);
  if (!geoPromises.has(address)) {
    geoPromises.set(address, runGeoIpConsensusProgressive({
      ip: address,
      providers: networkConfig.geoIpProviders,
      timeoutMs: networkConfig.geoIpTimeoutMs,
      onFirstUsable: (geo) => {
        if (currentRunId !== expectedRunId) return;
        onEarly?.(geo, address, family);
      }
    }));
  }
  return geoPromises.get(address);
}
```

The actual implementation may use a small helper object, but must preserve one promise per exact address and run.

- [ ] **Step 5: Launch IPv4, IPv6 and WebRTC independently**

For each family call `runIpConsensusProgressive()` immediately with `onFirstValid`. In callback:

1. reject when `currentRunId !== expectedRunId`;
2. set family provisional view state to first address;
3. render the family card immediately;
4. call `locate(firstAddress, family, expectedRunId, ...)` without awaiting it before returning from callback.

Start WebRTC at the same time but attach `.then()` rendering independently; it must not gate address-card rendering.

- [ ] **Step 6: Reconcile final IP and final GeoIP**

When final family consensus resolves:

1. ignore if stale run;
2. use the final `result.address` as authoritative family address;
3. if different from provisional address, render final address with `Locating…` and start/reuse GeoIP for the final address;
4. await final GeoIP for the final address;
5. store `{ ...finalIp, geo: finalGeo }` as the family final result.

After both family final promises and WebRTC final promise resolve, build browser/privacy/network assessment and assign `currentReport` exactly once for the current `expectedRunId`.

- [ ] **Step 7: Keep overall status Running until final assessment**

Early callbacks may render cards only. They must not call `assessResults()` or declare `Protected/Review/Leak`. Final assessment happens after final core results.

- [ ] **Step 8: Verify GREEN and static orchestration assertions**

Run: `node --test tests/progressive-core.test.js tests/max-diagnostics.test.js tests/geoip.test.js`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add assets/app.js tests/progressive-core.test.js assets/core-progress.js
git commit -m "feat: render IP and location progressively"
```

If `assets/core-progress.js` was not created, omit it from `git add`.

---

### Task 5: Stale-Result and Visual-State Regression Coverage

**Files:**
- Modify: `tests/progressive-core.test.js`
- Modify: `assets/app.js` only if tests reveal missing guards.

**Interfaces:**
- No new public API.
- Required UI copy/state: `Detected`, `Locating…`, `Checking…`, `Unavailable` only after all relevant lookups fail.

- [ ] **Step 1: Add regression test that pending GeoIP never renders unavailable**

Use source-level/render-helper test depending on Task 4 extraction. If `renderIp()` remains private in `app.js`, export a pure helper from `assets/core-progress.js`:

```js
export function buildIpCardState({ result, geoPending }) {
  return {
    status: result?.address ? (result.ipFinal ? 'Complete' : 'Detected') : 'Running',
    locationStatus: result?.geo ? 'available' : geoPending ? 'locating' : 'unavailable'
  };
}
```

Then test:

```js
test('location stays locating while GeoIP providers are still pending', () => {
  const state = buildIpCardState({ result:{ family:4, address:'128.71.33.91', ipFinal:false, geo:null }, geoPending:true });
  assert.equal(state.locationStatus, 'locating');
});
```

- [ ] **Step 2: Add stale-run guard regression**

Test the extracted guard/helper or source invariant so an early callback for run 1 is ignored after `currentRunId` advances to 2. The behavior must be explicit, not inferred from final Promise resolution.

- [ ] **Step 3: Add old-provisional-address GeoIP regression**

Test the address guard:

```text
first IP callback -> 128.71.33.91
first GeoIP request remains pending
final IP consensus -> 77.88.8.8
old 128.71.33.91 GeoIP resolves later
UI/final result must still refer to 77.88.8.8 and never attach old location
```

If needed, extract a pure function:

```js
export function canApplyGeoUpdate({ currentRunId, expectedRunId, displayedAddress, expectedAddress }) {
  return currentRunId === expectedRunId && displayedAddress === expectedAddress;
}
```

- [ ] **Step 4: Add WebRTC non-blocking regression assertion**

Use deferred promises in the extracted orchestration helper if available, or retain a source-level invariant asserting IP callback rendering occurs in `onFirstValid` and not inside WebRTC completion.

- [ ] **Step 5: Run full targeted regression**

Run:

```bash
node --test tests/progressive-core.test.js tests/max-diagnostics.test.js tests/geoip.test.js tests/aggressive-leak-test.test.js tests/guided-aggressive-integration.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add assets/app.js assets/core-progress.js tests/progressive-core.test.js
git commit -m "test: protect progressive core from stale results"
```

Omit non-existent files from `git add`.

---

### Task 6: Validation, Documentation and Exact-HEAD Verification

**Files:**
- Modify: `scripts/validate-static.mjs`
- Modify: `README.md`
- Modify: `tests/config.test.js` only if final provider list changes after Sypex CORS verification.

**Interfaces:**
- No new runtime interface.

- [ ] **Step 1: Extend static validation**

Require that:

```text
assets/app.js references runIpConsensusProgressive
assets/app.js references runGeoIpConsensusProgressive
assets/config.js contains ipapiis GeoIP provider
index.html still has exactly the existing app module entry
```

If Sypex was verified and enabled, additionally require `sypex-ru`; otherwise do not assert it.

- [ ] **Step 2: Update README provider/privacy section**

Document concisely:

- IP cards use first-valid progressive rendering while background consensus continues;
- GeoIP uses first-usable progressive rendering;
- active providers include `ipapi.co`, `ipwho.is`, `FreeIPAPI`, `ipapi.is`, and Sypex only if it passed browser CORS verification;
- external GeoIP providers see the queried public IP under their own policies;
- final report uses completed consensus rather than provisional UI data;
- city/region disagreement is informational, not VPN leak evidence.

- [ ] **Step 3: Run exact full verification**

Run:

```bash
npm run check
```

Expected: all Node tests, static validation and build pass.

- [ ] **Step 4: Inspect scope diff**

Run:

```bash
git diff main...HEAD --stat
git diff main...HEAD -- assets/ip-consensus.js assets/geoip.js assets/config.js assets/app.js README.md
```

Expected: only progressive core/GeoIP/provider/test/docs changes. No changes to DNS/torrent/SMTP, leak severity, Kill Switch behavior, or unrelated UI redesign.

- [ ] **Step 5: Commit final docs/validator changes**

```bash
git add scripts/validate-static.mjs README.md tests/config.test.js
git commit -m "docs: describe progressive RU-friendly GeoIP"
```

- [ ] **Step 6: Verify exact feature HEAD in GitHub Actions**

Push/update the feature branch and wait for the `Test` workflow for the exact final SHA. Verify its `npm run check` step is `success`. Do not merge based on an earlier green commit.

---

## Spec Coverage Self-Review

- First valid public IP rendered immediately: Task 1 + Task 4.
- First usable location rendered immediately: Task 2 + Task 4.
- Background final consensus preserved: Tasks 1, 2, 4.
- Existing consensus API compatibility: Tasks 1 and 2 regression runs.
- `ipapi.is` RU-friendly coverage: Tasks 2 and 3.
- Sypex regional endpoint with real-browser CORS gate: Task 3.
- No sequential fallback / all providers parallel: Tasks 1–4.
- No duplicate GeoIP race for same address/run: Task 4.
- Provisional IP changing to final IP safely: Tasks 4 and 5.
- Stale run/address callbacks ignored: Tasks 4 and 5.
- No premature `Location unavailable`: Tasks 4 and 5.
- WebRTC no longer holds IP cards hostage: Tasks 4 and 5.
- Final `currentReport` contains completed consensus: Task 4 and final regression.
- Aggressive/Guided/Monitor compatibility and request-volume constraints: Tasks 1, 2, 5 and full `npm run check`.
- README/privacy disclosure and exact-HEAD CI: Task 6.

Placeholder scan complete: no TBD/TODO/undefined interfaces. Function names are consistent across tasks: `runIpConsensusProgressive`, `runGeoIpConsensusProgressive`, `hasUsableGeoLocation`; optional `core-progress.js` extraction is explicitly scoped to Tasks 4–5 and only required if `app.js` cannot be tested cleanly without it.
