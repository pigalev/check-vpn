# Guided Known-Real Leak Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a guided VPN-off/VPN-on capture flow and make every aggressive HTTP/WebRTC/reconnect observation capable of detecting an exact known-real IPv4/IPv6 leak without consensus masking or false-positive VPN-rotation claims.

**Architecture:** Keep the existing core diagnostics and 60-second aggressive scheduler, but add focused pure modules for tab-scoped profile storage, provider observations, trusted capture, relative address classification, reconnect bursts, WebRTC stress/media tests, and report aggregation. `app.js` only wires those modules to the DOM and existing assessment; all leak rules stay testable outside the browser.

**Tech Stack:** Static HTML/CSS, browser ES modules, Fetch/AbortController, WebRTC `RTCPeerConnection`, optional `getUserMedia`, `sessionStorage`, Node.js >=22 `node:test`, existing GitHub Pages build/validation scripts.

## Global Constraints

- UI copy remains concise English; conversation/documentation may be Russian but product UI is not localized.
- Guided captured addresses use `sessionStorage` only; never `localStorage` or project-owned persistence.
- Full stress timeline remains RAM-only.
- One exact known-real public IPv4/IPv6 observation is sufficient for `REAL IP LEAK DETECTED`.
- A single unknown public IP observation is review-only; it needs repetition or a second independent transport class for confirmed unexpected-public-IP severity.
- Private IPv4, CGNAT `100.64.0.0/10`, IPv6 ULA/link-local/non-public ranges and mDNS never become public leak evidence.
- STUN port changes never affect leak severity.
- Media permission is explicit opt-in only; all acquired tracks are stopped in `finally`; denial is isolated to that subtest.
- Existing 60-second duration stays `60000 ms`; regular HTTP launch cadence stays `2000 ms` and must not wait for previous requests.
- Reconnect burst offsets are `0, 250, 500, 1000, 2000, 4000 ms`; WebRTC burst points are `0, 500, 2000, 4000 ms`.
- Leak evidence outranks weak coverage; clean wording is `NO KNOWN REAL IP OBSERVED`, never a security guarantee.
- Existing core, advanced, Kill Switch and unguided Aggressive Test behavior must remain available.
- Run `npm run check` on the exact feature HEAD before merge.

---

## File Structure

**Create**
- `assets/guided-leak-profile.js` — versioned current-tab profile persistence.
- `assets/provider-observations.js` — raw per-provider HTTP observations without majority masking.
- `assets/guided-leak-capture.js` — trusted real/VPN capture from HTTP evidence plus diagnostic side channels.
- `assets/leak-classifier.js` — pure known-real/known-vpn/unknown/non-public classification and confirmation rules.
- `assets/reconnect-burst.js` — coalesced high-resolution burst scheduler.
- `assets/webrtc-stress.js` — repeated isolated ICE sessions with session/server metadata.
- `assets/webrtc-media-test.js` — before/after media-permission WebRTC comparison with guaranteed cleanup.
- `assets/leak-report.js` — path matrix, exposure aggregation helpers and guided verdict summary.
- `assets/guided-leak-render.js` — wizard and final result renderer.
- Tests matching each module.

**Modify**
- `assets/config.js` — guided/burst settings and structured STUN destination metadata.
- `assets/ip-consensus.js` — reuse/export provider execution result shape where needed without changing existing consensus behavior.
- `assets/aggressive-leak-test.js` — accept guided profile and raw observations; integrate burst/stress hooks while preserving fixed cadence.
- `assets/leak-observation.js` — carry classification/confirmation/channel aggregation without changing non-public filtering.
- `assets/assessment.js` — accept guided findings alongside existing aggressive findings.
- `assets/app.js` — orchestration, user gestures, report wiring.
- `index.html` — guided wizard and media test controls.
- `assets/styles.css` — responsive guided/path-matrix/exposure UI.
- `scripts/validate-static.mjs` — require new modules/controls.
- `README.md` — privacy, media-permission, known-real and request-volume documentation.

---

### Task 1: Current-tab Guided Profile

**Files:**
- Create: `assets/guided-leak-profile.js`
- Create: `tests/guided-leak-profile.test.js`

**Interfaces:**
- Produces: `GUIDED_PROFILE_SCHEMA_VERSION = 1`
- Produces: `createEmptyGuidedProfile()` -> `{ schemaVersion, step, knownReal, knownVpn, capturedAt, explicitContinue }`
- Produces: `createGuidedLeakProfileStore({ storage, key = 'check-vpn:guided-leak:v1' })`
- Store methods: `load()`, `save(profile)`, `update(patchOrUpdater)`, `clear()`.
- Later tasks consume the normalized profile shape with `knownReal: {4: string[], 6: string[]}` and `knownVpn: {4: string[], 6: string[]}`.

- [ ] **Step 1: Write failing storage tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyGuidedProfile, createGuidedLeakProfileStore } from '../assets/guided-leak-profile.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    values
  };
}

test('profile round-trips only through the provided session storage', () => {
  const storage = memoryStorage();
  const store = createGuidedLeakProfileStore({ storage });
  const profile = createEmptyGuidedProfile();
  profile.knownReal[4] = ['95.25.1.2'];
  store.save(profile);
  assert.deepEqual(store.load().knownReal[4], ['95.25.1.2']);
});

test('unknown schema is discarded safely', () => {
  const storage = memoryStorage();
  storage.setItem('check-vpn:guided-leak:v1', JSON.stringify({ schemaVersion: 999, knownReal: { 4: ['1.1.1.1'] } }));
  const store = createGuidedLeakProfileStore({ storage });
  assert.deepEqual(store.load(), createEmptyGuidedProfile());
});

test('clear removes captured addresses', () => {
  const storage = memoryStorage();
  const store = createGuidedLeakProfileStore({ storage });
  store.update((profile) => ({ ...profile, knownReal: { ...profile.knownReal, 4: ['95.25.1.2'] } }));
  store.clear();
  assert.deepEqual(store.load().knownReal[4], []);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/guided-leak-profile.test.js`

Expected: FAIL because `assets/guided-leak-profile.js` does not exist.

- [ ] **Step 3: Implement the versioned store**

```js
export const GUIDED_PROFILE_SCHEMA_VERSION = 1;
const DEFAULT_KEY = 'check-vpn:guided-leak:v1';

export function createEmptyGuidedProfile() {
  return {
    schemaVersion: GUIDED_PROFILE_SCHEMA_VERSION,
    step: 'real',
    knownReal: { 4: [], 6: [] },
    knownVpn: { 4: [], 6: [] },
    capturedAt: { real: null, vpn: null },
    explicitContinue: { 4: false, 6: false }
  };
}

function normalize(profile) {
  if (!profile || profile.schemaVersion !== GUIDED_PROFILE_SCHEMA_VERSION) return createEmptyGuidedProfile();
  const clean = createEmptyGuidedProfile();
  clean.step = ['real', 'vpn', 'stress'].includes(profile.step) ? profile.step : 'real';
  for (const family of [4, 6]) {
    clean.knownReal[family] = [...new Set((profile.knownReal?.[family] ?? []).filter((x) => typeof x === 'string'))];
    clean.knownVpn[family] = [...new Set((profile.knownVpn?.[family] ?? []).filter((x) => typeof x === 'string'))];
    clean.explicitContinue[family] = profile.explicitContinue?.[family] === true;
  }
  clean.capturedAt.real = typeof profile.capturedAt?.real === 'number' ? profile.capturedAt.real : null;
  clean.capturedAt.vpn = typeof profile.capturedAt?.vpn === 'number' ? profile.capturedAt.vpn : null;
  return clean;
}

export function createGuidedLeakProfileStore({ storage, key = DEFAULT_KEY } = {}) {
  let fallback = createEmptyGuidedProfile();
  const read = () => {
    try { return storage ? normalize(JSON.parse(storage.getItem(key) || 'null')) : normalize(fallback); }
    catch { return createEmptyGuidedProfile(); }
  };
  const write = (profile) => {
    const clean = normalize(profile);
    fallback = clean;
    try { storage?.setItem(key, JSON.stringify(clean)); } catch {}
    return clean;
  };
  return {
    load: read,
    save: write,
    update(value) { const current = read(); return write(typeof value === 'function' ? value(current) : { ...current, ...value }); },
    clear() { fallback = createEmptyGuidedProfile(); try { storage?.removeItem(key); } catch {} return createEmptyGuidedProfile(); }
  };
}
```

- [ ] **Step 4: Verify GREEN and no localStorage reference**

Run: `node --test tests/guided-leak-profile.test.js && ! grep -R "localStorage" assets/guided-leak-profile.js`

Expected: PASS and grep command exits successfully because there is no match.

- [ ] **Step 5: Commit**

```bash
git add assets/guided-leak-profile.js tests/guided-leak-profile.test.js
git commit -m "feat: add tab-scoped guided leak profile"
```

---

### Task 2: Raw Provider Observations and Trusted Capture

**Files:**
- Create: `assets/provider-observations.js`
- Create: `assets/guided-leak-capture.js`
- Create: `tests/provider-observations.test.js`
- Create: `tests/guided-leak-capture.test.js`
- Modify: `assets/ip-consensus.js`

**Interfaces:**
- Produces: `collectProviderObservations({ family, providers, timeoutMs, fetchImpl, now })` -> raw normalized observation array.
- Observation: `{ timestampMs, family, providerId, providerLabel, providerGroup, address, latencyMs, status, error, trigger }`.
- Produces: `captureGuidedConnection({ collectFamily, sampleStun, sampleEcho, sampleTls, now })` -> `{ status, trusted: {4:[],6:[]}, families, diagnostics, capturedAt }`.
- Existing `runIpConsensus(...)` must preserve its current return contract.

- [ ] **Step 1: Add failing raw-provider tests**

```js
test('minority provider address is preserved instead of hidden by consensus', async () => {
  const observations = await collectProviderObservations({
    family: 4,
    providers: [
      { id: 'a', label: 'A', group: 'a', kind: 'text', url: 'https://a.test' },
      { id: 'b', label: 'B', group: 'b', kind: 'text', url: 'https://b.test' },
      { id: 'c', label: 'C', group: 'c', kind: 'text', url: 'https://c.test' }
    ],
    timeoutMs: 100,
    fetchImpl: async (url) => ({ ok: true, text: async () => url.includes('c.test') ? '95.25.1.2' : '77.110.1.1' }),
    now: () => 1234
  });
  assert.deepEqual(observations.filter((x) => x.status === 'complete').map((x) => x.address), ['77.110.1.1', '77.110.1.1', '95.25.1.2']);
});
```

Add a capture test:

```js
test('trusted capture uses the HTTP winner but retains conflicting diagnostics', async () => {
  const result = await captureGuidedConnection({
    collectFamily: async (family) => family === 4 ? [
      { status: 'complete', family: 4, address: '95.25.1.2', providerId: 'a', providerGroup: 'a' },
      { status: 'complete', family: 4, address: '95.25.1.2', providerId: 'b', providerGroup: 'b' },
      { status: 'complete', family: 4, address: '8.8.8.8', providerId: 'c', providerGroup: 'c' }
    ] : [],
    sampleStun: async () => [], sampleEcho: async () => null, sampleTls: async () => null, now: () => 5000
  });
  assert.deepEqual(result.trusted[4], ['95.25.1.2']);
  assert.equal(result.families[4].agree, false);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/provider-observations.test.js tests/guided-leak-capture.test.js`

Expected: FAIL because the new modules do not exist.

- [ ] **Step 3: Extract reusable provider execution from consensus and implement raw collection**

In `assets/ip-consensus.js`, export the existing provider runner as:

```js
export async function runIpProvider({ provider, family, timeoutMs, fetchImpl = fetch }) { /* existing runProvider body */ }
```

Keep `runIpConsensus()` calling `runIpProvider()` exactly as before.

Implement `collectProviderObservations()` by calling all providers in parallel and mapping each source to:

```js
{
  timestampMs: now(), family,
  providerId: source.id,
  providerLabel: source.label,
  providerGroup: provider.group ?? provider.id,
  address: source.address,
  latencyMs: source.latencyMs,
  status: source.status,
  error: source.error,
  trigger
}
```

- [ ] **Step 4: Implement trusted capture rules**

For each family, count complete public HTTP addresses. Select a trusted address only when there is a unique highest count; accept a single successful address when it is the only complete HTTP observation. Return `trusted[family] = []` when top counts tie. Preserve all raw HTTP/STUN/echo/TLS results under `diagnostics`.

- [ ] **Step 5: Verify GREEN and existing consensus regression**

Run: `node --test tests/provider-observations.test.js tests/guided-leak-capture.test.js tests/ip-consensus.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add assets/ip-consensus.js assets/provider-observations.js assets/guided-leak-capture.js tests/provider-observations.test.js tests/guided-leak-capture.test.js
git commit -m "feat: preserve provider-level IP observations"
```

---

### Task 3: Relative Leak Classification and Exposure Confirmation

**Files:**
- Create: `assets/leak-classifier.js`
- Create: `tests/leak-classifier.test.js`
- Modify: `assets/leak-observation.js`
- Modify: `tests/leak-observation.test.js`

**Interfaces:**
- Produces: `classifyLeakAddress(address, guidedProfile)` -> `{ family, scope, relation }`, where `relation` is `known-real`, `known-vpn`, `unknown-public`, or `non-public`.
- Produces: `confirmationForExposure(exposure)` -> `known-real | confirmed-unknown | unconfirmed-unknown`.
- `applyObservation(state, observation)` accepts optional `relation`, `transportClass`, `providerGroup` and stores them in exposure aggregation.

- [ ] **Step 1: Write failing classifier tests**

```js
test('one exact known-real observation is conclusive leak evidence', () => {
  const profile = { knownReal: { 4: ['95.25.1.2'], 6: [] }, knownVpn: { 4: ['77.110.1.1'], 6: [] } };
  assert.equal(classifyLeakAddress('95.25.1.2', profile).relation, 'known-real');
});

test('vpn rotation is unknown public, never known-real without exact match', () => {
  const profile = { knownReal: { 4: ['95.25.1.2'], 6: [] }, knownVpn: { 4: ['77.110.1.1'], 6: [] } };
  assert.equal(classifyLeakAddress('77.110.1.99', profile).relation, 'unknown-public');
});

test('private and CGNAT candidates are non-public', () => {
  const profile = { knownReal: { 4: [], 6: [] }, knownVpn: { 4: [], 6: [] } };
  assert.equal(classifyLeakAddress('192.168.1.10', profile).relation, 'non-public');
  assert.equal(classifyLeakAddress('100.64.1.2', profile).relation, 'non-public');
});
```

Add confirmation tests:

```js
test('unknown needs repetition or independent transport confirmation', () => {
  assert.equal(confirmationForExposure({ relation: 'unknown-public', observationCount: 1, transportClasses: ['http'] }), 'unconfirmed-unknown');
  assert.equal(confirmationForExposure({ relation: 'unknown-public', observationCount: 2, transportClasses: ['http'] }), 'confirmed-unknown');
  assert.equal(confirmationForExposure({ relation: 'unknown-public', observationCount: 2, transportClasses: ['http', 'stun'] }), 'confirmed-unknown');
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/leak-classifier.test.js`

Expected: FAIL because classifier module does not exist.

- [ ] **Step 3: Implement pure classification**

Use `classifyIpAddress(address)` for family/public scope. Exact address membership decides known-real/known-vpn. Never use ASN/GeoIP to create `known-real`.

`confirmationForExposure()` rules:

```js
if (exposure.relation === 'known-real') return 'known-real';
if (exposure.relation !== 'unknown-public') return null;
const independent = new Set(exposure.transportClasses ?? []).size >= 2;
return exposure.observationCount >= 2 || independent ? 'confirmed-unknown' : 'unconfirmed-unknown';
```

- [ ] **Step 4: Extend exposure aggregation**

For public unexpected addresses, add:

```js
relation
transportClasses: []
providerGroups: []
perChannelCounts: {}
firstDetector
confirmationLevel
```

When merging observations, increment `perChannelCounts[channel]`, dedupe `transportClass` and `providerGroup`, then recalculate confirmation. Known VPN observations should restore an open exposure for the same family but should not create an exposure record themselves.

Single-sample exposures must expose `approxExposureMs: null`; only calculate a numeric window after at least two sightings or after baseline restoration provides a later bound.

- [ ] **Step 5: Verify GREEN**

Run: `node --test tests/leak-classifier.test.js tests/leak-observation.test.js`

Expected: PASS, including CGNAT/non-public regressions and null single-sample duration.

- [ ] **Step 6: Commit**

```bash
git add assets/leak-classifier.js assets/leak-observation.js tests/leak-classifier.test.js tests/leak-observation.test.js
git commit -m "feat: classify known real and unknown leak evidence"
```

---

### Task 4: Coalesced Reconnect Burst Scheduler

**Files:**
- Create: `assets/reconnect-burst.js`
- Create: `tests/reconnect-burst.test.js`
- Modify: `assets/config.js`

**Interfaces:**
- Config adds `reconnectBurstOffsetsMs: [0,250,500,1000,2000,4000]` and `reconnectWebRtcOffsetsMs: [0,500,2000,4000]`.
- Produces: `createReconnectBurst({ offsetsMs, webRtcOffsetsMs, now, setTimeoutImpl, clearTimeoutImpl, onHttp, onWebRtc, onEvent })`.
- Methods: `trigger(reason)`, `stop()`, `getState()`.

- [ ] **Step 1: Write failing burst tests**

Use a fake timer harness and assert HTTP fires at exactly `[0,250,500,1000,2000,4000]`, WebRTC at `[0,500,2000,4000]`, and a second trigger during an active burst increments a coalesced-event counter without scheduling a second set.

```js
test('burst keeps the approved sub-two-second schedule and coalesces repeats', async () => {
  const http = [], rtc = [];
  const burst = createReconnectBurst({
    offsetsMs: [0,250,500,1000,2000,4000], webRtcOffsetsMs: [0,500,2000,4000],
    now: clock.now, setTimeoutImpl: clock.setTimeoutImpl, clearTimeoutImpl: clock.clearTimeoutImpl,
    onHttp: ({ offsetMs }) => http.push(offsetMs), onWebRtc: ({ offsetMs }) => rtc.push(offsetMs)
  });
  burst.trigger('online');
  burst.trigger('connection-change');
  await clock.advanceTo(4000);
  assert.deepEqual(http, [0,250,500,1000,2000,4000]);
  assert.deepEqual(rtc, [0,500,2000,4000]);
  assert.equal(burst.getState().coalescedTriggers, 1);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/reconnect-burst.test.js`

Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement burst state machine**

Use one active burst id, record `{ startedAt, reasons, coalescedTriggers, completedOffsets }`, schedule every offset relative to the same start time, and ignore late callbacks after `stop()` by generation token.

- [ ] **Step 4: Verify GREEN**

Run: `node --test tests/reconnect-burst.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add assets/reconnect-burst.js assets/config.js tests/reconnect-burst.test.js
git commit -m "feat: add high-resolution reconnect burst"
```

---

### Task 5: Structured STUN Destinations and WebRTC Stress

**Files:**
- Create: `assets/webrtc-stress.js`
- Create: `tests/webrtc-stress.test.js`
- Modify: `assets/config.js`
- Modify: `assets/webrtc-test.js`
- Modify: `tests/webrtc-test.test.js`

**Interfaces:**
- `networkConfig.stunDestinations` becomes structured metadata:

```js
[
  { id: 'cloudflare', group: 'cloudflare', label: 'Cloudflare', urls: ['stun:stun.cloudflare.com:3478'] },
  { id: 'google-0', group: 'google', label: 'Google', urls: ['stun:stun.l.google.com:19302'] },
  { id: 'google-1', group: 'google', label: 'Google backup', urls: ['stun:stun1.l.google.com:19302'] },
  { id: 'twilio', group: 'twilio', label: 'Twilio', urls: ['stun:global.stun.twilio.com:3478'] }
]
```

Keep `networkConfig.stunUrls` derived from the first two destinations during migration so existing callers remain green until Task 8.

- Produces: `runWebRtcStress({ destinations, timeoutMs, sessionsPerDestination = 1, runSession = runWebRtcTest, now, trigger })`.
- Result: `{ status, sessions, candidates, destinationHealth, transports }`.

- [ ] **Step 1: Write failing stress tests**

```js
test('one dead STUN destination does not hide successful sessions', async () => {
  const result = await runWebRtcStress({
    destinations: [{ id:'a', group:'a', urls:['stun:a'] }, { id:'b', group:'b', urls:['stun:b'] }],
    timeoutMs: 100,
    runSession: async ({ stunUrls }) => stunUrls[0] === 'stun:a'
      ? { status:'error', candidates:[], error:'failed' }
      : { status:'complete', candidates:[{ address:'77.110.1.1', family:4, port:50000, protocol:'udp', type:'srflx', classification:'public' }], error:null },
    now: () => 1000
  });
  assert.equal(result.status, 'partial');
  assert.equal(result.candidates[0].serverId, 'b');
  assert.deepEqual(result.transports, { udp: true, tcp: false });
});
```

Add a `runWebRtcTest()` regression confirming parsed TCP candidates remain `protocol: 'tcp'` and the peer closes on error/success.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/webrtc-stress.test.js tests/webrtc-test.test.js`

Expected: FAIL on missing stress module.

- [ ] **Step 3: Implement stress orchestration**

Run destination/session combinations independently with `Promise.allSettled`. Decorate every candidate with:

```js
sessionId
serverId\serverGroup
serverLabel
timestampMs
trigger
```

Aggregate health per destination as `complete`, `unavailable`, or `error`; `transports.tcp` is true only if an actual candidate reports TCP.

- [ ] **Step 4: Verify candidate-server config in supported browsers before keeping all four endpoints**

Use the existing page or a minimal browser console call to `runWebRtcTest()` for each configured destination. If one endpoint consistently fails across supported browsers, remove that destination rather than marking an unverified path as tested. Preserve `group: 'google'` for both Google hostnames so confidence logic does not count them as separate organizations.

- [ ] **Step 5: Verify GREEN**

Run: `node --test tests/webrtc-stress.test.js tests/webrtc-test.test.js tests/config.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add assets/config.js assets/webrtc-test.js assets/webrtc-stress.js tests/webrtc-test.test.js tests/webrtc-stress.test.js tests/config.test.js
git commit -m "feat: add multi-destination WebRTC stress"
```

---

### Task 6: Opt-in Media-Permission WebRTC Comparison

**Files:**
- Create: `assets/webrtc-media-test.js`
- Create: `tests/webrtc-media-test.test.js`

**Interfaces:**
- Produces: `runWebRtcMediaPermissionTest({ getUserMedia, runBefore, runAfter })`.
- Result: `{ status: 'complete'|'denied'|'unavailable'|'error', before, after, newlyVisible, error }`.
- `newlyVisible` contains address-level candidate differences, not permission assumptions.

- [ ] **Step 1: Write failing tests for cleanup, denial, and new address comparison**

```js
test('all media tracks stop even when after-permission WebRTC fails', async () => {
  let stopped = 0;
  const stream = { getTracks: () => [{ stop: () => stopped++ }, { stop: () => stopped++ }] };
  const result = await runWebRtcMediaPermissionTest({
    getUserMedia: async () => stream,
    runBefore: async () => ({ status:'complete', candidates:[] }),
    runAfter: async () => { throw new Error('ICE failed'); }
  });
  assert.equal(stopped, 2);
  assert.equal(result.status, 'error');
});

test('permission denial is isolated', async () => {
  const denied = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
  const result = await runWebRtcMediaPermissionTest({
    getUserMedia: async () => { throw denied; },
    runBefore: async () => ({ status:'complete', candidates:[] }), runAfter: async () => ({})
  });
  assert.equal(result.status, 'denied');
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/webrtc-media-test.test.js`

Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement exact before/after address diff**

Call `runBefore()` first. Acquire `{ audio: true, video: true }` via the injected `getUserMedia`. Run `runAfter(stream)` while tracks are active. In `finally`, execute `stream?.getTracks?.().forEach(track => track.stop())`. Compute `newlyVisible` by stable candidate key `${address}|${family}|${classification}|${type}|${protocol}`.

- [ ] **Step 4: Verify GREEN**

Run: `node --test tests/webrtc-media-test.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add assets/webrtc-media-test.js tests/webrtc-media-test.test.js
git commit -m "feat: add opt-in media WebRTC leak comparison"
```

---

### Task 7: Guided-Aware Aggressive Engine

**Files:**
- Modify: `assets/aggressive-leak-test.js`
- Modify: `assets/leak-observation.js`
- Create: `tests/guided-aggressive-integration.test.js`
- Modify: `tests/aggressive-leak-test.test.js`

**Interfaces:**
- Extend `createAggressiveLeakTest()` options with:

```js
guidedProfile = null
sampleHttpObservations = null
sampleWebRtcStress = null
createBurst = null
onLeakObservation = null
```

- Existing callers using only `sampleHttp/sampleStun/sampleEcho/sampleTls` continue to work.
- Raw provider observations are converted to normal observation objects with `transportClass: 'http'` and `providerGroup`.
- STUN normal/stress uses `transportClass: 'stun'` / `'webrtc-stress'`.

- [ ] **Step 1: Write failing known-real minority-provider integration test**

```js
test('known real from one minority HTTP provider immediately wins over consensus', async () => {
  const controller = createAggressiveLeakTest({
    config: { ...appConfig, aggressiveDurationMs: 10000 },
    initialBaseline: { 4: ['77.110.1.1'], 6: [] },
    guidedProfile: { knownReal:{4:['95.25.1.2'],6:[]}, knownVpn:{4:['77.110.1.1'],6:[]} },
    sampleHttp: async () => [{ family:4, address:'77.110.1.1', agreement:{ available:3,total:3,agree:false } }],
    sampleHttpObservations: async () => [
      { status:'complete', family:4, address:'77.110.1.1', providerId:'a', providerGroup:'a' },
      { status:'complete', family:4, address:'77.110.1.1', providerId:'b', providerGroup:'b' },
      { status:'complete', family:4, address:'95.25.1.2', providerId:'c', providerGroup:'c' }
    ],
    sampleStun: async () => [], sampleEcho: async () => null, sampleTls: async () => null,
    environment: fakeEnvironment()
  });
  await controller.start();
  const exposure = controller.getState().exposures.find((x) => x.address === '95.25.1.2');
  assert.equal(exposure.relation, 'known-real');
  controller.stop();
});
```

Add a transient burst test where normal scheduled HTTP sees VPN IP at T=0 and T=2000 but a burst observation at T=500 returns known real; assert exposure survives.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/guided-aggressive-integration.test.js tests/aggressive-leak-test.test.js`

Expected: FAIL because guided options are ignored.

- [ ] **Step 3: Integrate raw observations without changing fixed scheduler**

At each HTTP scheduled/burst trigger:

1. record scheduler launch immediately;
2. start consensus request and raw-provider request independently;
3. never await one before scheduling the next interval;
4. classify each raw successful public address using `classifyLeakAddress()`;
5. feed it to `applyObservation()` with provider/source metadata.

Do not double-count the consensus winner as a second independent provider observation; consensus remains useful for baseline/restoration but raw provider results are the granular evidence.

- [ ] **Step 4: Integrate reconnect burst**

Create one burst controller per aggressive run. Browser `online`, connection-change, connectivity recovery and meaningful address transition call `burst.trigger(reason)`. `onHttp` runs raw HTTP observations; `onWebRtc` runs stress samples. `cleanup()` must stop the burst and invalidate late callbacks.

- [ ] **Step 5: Integrate WebRTC stress observations**

For each public candidate, record source/server/session metadata and actual UDP/TCP protocol. Never create a public leak from local/CGNAT/ULA/mDNS candidates.

- [ ] **Step 6: Update final result mapping**

Result precedence inside guided runs:

```text
known-real exposure -> real-leak
confirmed unknown exposure -> unexpected-leak
only unconfirmed unknown -> review
no exposure + poor coverage -> inconclusive
no exposure + sufficient coverage -> clean
```

Unguided aggressive behavior remains compatible with its existing `leak/inconclusive/clean` result fields; add `guidedResult`/`guidedResultLabel` rather than breaking renderer consumers during migration.

- [ ] **Step 7: Verify GREEN plus cadence regression**

Run: `node --test tests/guided-aggressive-integration.test.js tests/aggressive-leak-test.test.js tests/leak-observation.test.js`

Expected: PASS, including the existing slow-request fixed-cadence test.

- [ ] **Step 8: Commit**

```bash
git add assets/aggressive-leak-test.js assets/leak-observation.js tests/guided-aggressive-integration.test.js tests/aggressive-leak-test.test.js tests/leak-observation.test.js
git commit -m "feat: detect known real IPs during aggressive testing"
```

---

### Task 8: Guided Verdict and Path Matrix Report

**Files:**
- Create: `assets/leak-report.js`
- Create: `tests/leak-report.test.js`

**Interfaces:**
- Produces: `buildPathMatrix(observations, profile)` -> rows `{ pathId, label, transportClass, address, family, relation, status }`.
- Produces: `buildGuidedVerdict({ exposures, coverage, profile })` -> `{ result, label, reasons }`.
- Produces: `buildGuidedLeakReport({ profile, captures, aggressive, media })` -> serializable report object.

- [ ] **Step 1: Write failing verdict/path tests**

```js
test('known-real leak outranks poor coverage', () => {
  const verdict = buildGuidedVerdict({
    exposures: [{ address:'95.25.1.2', relation:'known-real', confirmationLevel:'known-real' }],
    coverage: { sufficient:false }, profile: {}
  });
  assert.equal(verdict.result, 'real-leak');
  assert.equal(verdict.label, 'REAL IP LEAK DETECTED');
});

test('single unknown address remains review', () => {
  const verdict = buildGuidedVerdict({
    exposures: [{ address:'8.8.8.8', relation:'unknown-public', confirmationLevel:'unconfirmed-unknown' }],
    coverage: { sufficient:true }, profile: {}
  });
  assert.equal(verdict.result, 'review');
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/leak-report.test.js`

Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement verdict hierarchy and matrix grouping**

Matrix should retain individual destinations, but render same destination's latest/current observation plus history count. Known-real relation always labels `KNOWN REAL LEAK`; known VPN labels `Known VPN`; confirmed unknown labels `Unexpected`; unconfirmed unknown labels `Review`.

- [ ] **Step 4: Add clean coverage wording**

When sufficient and no confirmed exposure, report:

`NO KNOWN REAL IP OBSERVED`

with count fields such as scheduled HTTP attempts, reconnect probes, WebRTC sessions and reached transport classes. Do not return `Protected` or `Safe` from this module.

- [ ] **Step 5: Verify GREEN**

Run: `node --test tests/leak-report.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add assets/leak-report.js tests/leak-report.test.js
git commit -m "feat: build guided leak verdict and path matrix"
```

---

### Task 9: Guided Wizard and Media-Test UI

**Files:**
- Create: `assets/guided-leak-render.js`
- Create: `tests/guided-leak-ui.test.js`
- Modify: `index.html`
- Modify: `assets/styles.css`

**Interfaces:**
- `renderGuidedLeak(elements, viewModel)` updates wizard without owning network logic.
- Required DOM ids:

```text
guided-section
guided-step
guided-instructions
guided-real
guided-vpn
guided-primary
guided-secondary
guided-clear
guided-result
guided-exposures
guided-paths
guided-coverage
media-webrtc-button
media-webrtc-status
media-webrtc-result
```

- [ ] **Step 1: Write failing static/UI tests**

Assert `index.html` contains the three-step section, exact privacy text `Saved for this tab only`, a `Clear captured IPs` control, and media copy stating permission may be requested and media is not recorded/uploaded by the project.

Add renderer tests using the project's existing minimal DOM strategy to verify:

- step `real` -> button `Capture real IP`;
- step `vpn` -> button `Capture VPN IP`;
- unconfirmed VPN -> secondary `Continue anyway` appears;
- step `stress` -> button `Start 60s stress test`;
- result `real-leak` renders `REAL IP LEAK DETECTED`;
- clean renders `NO KNOWN REAL IP OBSERVED`.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/guided-leak-ui.test.js`

Expected: FAIL because section/module does not exist.

- [ ] **Step 3: Add the HTML wizard before Aggressive Leak Test**

Use one compact card/section with the privacy warning before Step 1. Keep the existing Aggressive section available below it for unguided/manual use.

- [ ] **Step 4: Implement renderer and responsive styles**

Use DOM `textContent`, not raw untrusted HTML for addresses. Path rows must use `min-width: 0` and `overflow-wrap: anywhere`; on narrow screens switch label/value columns to stacked rows. Known-real exposure uses the existing danger visual vocabulary rather than a new unrelated color scheme.

- [ ] **Step 5: Verify GREEN**

Run: `node --test tests/guided-leak-ui.test.js && npm run validate`

Expected: PASS after validator is temporarily updated in Task 11; until then the UI test itself must pass.

- [ ] **Step 6: Commit**

```bash
git add index.html assets/styles.css assets/guided-leak-render.js tests/guided-leak-ui.test.js
git commit -m "feat: add guided VPN leak test wizard"
```

---

### Task 10: App Orchestration, User Gesture, Overall Assessment and JSON

**Files:**
- Modify: `assets/app.js`
- Modify: `assets/assessment.js`
- Create: `tests/guided-app-integration.test.js`
- Modify: existing assessment tests if required.

**Interfaces:**
- App owns one `guidedStore`, current capture summaries, current media result and the active aggressive controller.
- `currentReport.guidedLeak` is set to `buildGuidedLeakReport(...)`.
- `assessResults()` gains optional `guidedFindings = []`; existing callers remain valid.

- [ ] **Step 1: Write failing app-level integration assertions**

Static/import test should assert `app.js` imports and wires:

```text
createGuidedLeakProfileStore
captureGuidedConnection
collectProviderObservations
classifyLeakAddress
runWebRtcStress
runWebRtcMediaPermissionTest
buildGuidedLeakReport
renderGuidedLeak
```

Add assessment test:

```js
test('guided known-real finding forces top-level leak', () => {
  const result = assessResults({
    ipv4:{status:'complete'}, ipv6:{status:'unavailable'}, webrtc:{status:'complete'}, privacy:{},
    networkFindings:[], monitorFindings:[], aggressiveFindings:[],
    guidedFindings:[{ id:'guided-real-ip', severity:'leak', category:'guided', summary:'Known real IP exposed', details:'95.25.1.2', sources:['guided-test'] }]
  });
  assert.equal(result.status, 'leak');
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/guided-app-integration.test.js tests/assessment.test.js`

Expected: FAIL because app/assessment do not support guided findings yet.

- [ ] **Step 3: Wire Step 1 and Step 2 capture**

On `Capture real IP`, call `captureGuidedConnection()` and save trusted addresses into `knownReal`; only advance to `vpn` when at least one family has a trusted real address.

On `Capture VPN IP`, save trusted addresses into `knownVpn`; if any captured family exactly matches known real, keep the wizard on VPN confirmation with `Continue anyway`. Retry replaces VPN capture. Explicit continue sets `explicitContinue[family]` and advances to stress.

- [ ] **Step 4: Wire Step 3 stress**

Build aggressive dependencies from `networkConfig`:

- consensus sampler: existing `runIpConsensus`;
- raw sampler: `collectProviderObservations` for both families in parallel;
- STUN/basic sampler: existing `runWebRtcTest`/advanced primitives;
- stress sampler: `runWebRtcStress`;
- reconnect burst factory: `createReconnectBurst`;
- guided profile: store's current profile.

Do not auto-start the 60-second stress test merely because VPN capture succeeded; require the explicit Step 3 user click.

- [ ] **Step 5: Wire media permission only from direct click handler**

The `media-webrtc-button` click handler must synchronously enter `runWebRtcMediaPermissionTest()` with `getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints)`. Disable the button while running. Never call this function from `runCore()`, `runAdvanced()`, page load, or automatic stress scheduling.

After completion, classify `newlyVisible` candidates against the current guided profile and merge any public evidence into the guided report/assessment. Private-only media differences render privacy exposure but no leak finding.

- [ ] **Step 6: Map guided results into overall findings**

Create findings:

- known-real exposure -> severity `leak`, summary `Known real IPv4/IPv6 exposed`;
- confirmed unknown -> severity `leak`, summary `Unexpected public IP confirmed`;
- unconfirmed unknown -> severity `review`;
- guided inconclusive -> severity `review`;
- clean -> no negative finding.

Keep Kill Switch and unguided aggressive findings independent.

- [ ] **Step 7: Add JSON report and clear behavior**

`Copy JSON` includes `guidedLeak`. `Clear captured IPs` clears store, capture/media in-memory state and guided report only; it must not erase the normal core report or Kill Switch history.

- [ ] **Step 8: Verify GREEN**

Run: `node --test tests/guided-app-integration.test.js tests/assessment.test.js tests/aggressive-leak-test.test.js`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add assets/app.js assets/assessment.js tests/guided-app-integration.test.js tests/assessment.test.js
git commit -m "feat: wire guided known-real leak workflow"
```

---

### Task 11: Validation, Documentation and Full Regression

**Files:**
- Modify: `scripts/validate-static.mjs`
- Modify: `README.md`
- Create: `tests/guided-leak-regression.test.js`
- Modify: `tests/aggressive-leak-regression.test.js` if shared expectations change.

**Interfaces:**
- No new runtime interface. This task proves the integrated feature and documents privacy/external-service behavior.

- [ ] **Step 1: Add final regression tests**

Cover in one regression file:

```text
known real IPv4 once via HTTP -> real leak
known real IPv6 via stress WebRTC -> real leak
2 VPN provider votes + 1 known-real vote -> real leak
one unknown public observation -> review
repeated unknown or second transport -> confirmed unexpected
private/CGNAT/ULA/mDNS -> no public leak
media private-only difference -> no public leak
media known-real public difference -> real leak
known-real leak outranks poor coverage
STUN port-only change -> no severity change
single sample -> null/unknown duration
TCP not observed unless candidate protocol is tcp
```

- [ ] **Step 2: Verify targeted RED if any integration requirement is still missing**

Run: `node --test tests/guided-leak-regression.test.js`

Expected before final fixes: any remaining uncovered integration requirement should fail for its specific assertion; do not weaken assertions to make the suite green.

- [ ] **Step 3: Update static validator**

Require all new asset files and required guided/media DOM ids. Assert `index.html` still loads only `./assets/app.js` as the module entry. Add a source check that guided profile implementation does not contain `localStorage`.

- [ ] **Step 4: Update README**

Document:

- the three-step VPN-off/VPN-on/60s flow;
- exact known-real semantics;
- `sessionStorage` current-tab lifetime and `Clear captured IPs`;
- per-provider observations and why consensus cannot mask a known-real address;
- reconnect burst request cadence;
- WebRTC stress and actual UDP/TCP observation wording;
- optional media-permission test, no recording/upload by the project, immediate track stop;
- external third-party IP/STUN/echo/TLS services necessarily observe requests;
- static limitations: no authoritative DNS/torrent/SMTP leak test yet.

- [ ] **Step 5: Run full verification**

Run:

```bash
npm run check
```

Expected: all Node tests pass, static validator passes, site build passes.

- [ ] **Step 6: Inspect exact diff for accidental scope creep**

Run:

```bash
git diff main...HEAD --stat
git diff main...HEAD -- assets/config.js assets/aggressive-leak-test.js assets/app.js index.html README.md
```

Expected: only guided leak suite, WebRTC stress/media, reconnect burst, related tests/docs/validation. No DNS/torrent/SMTP backend implementation and no unrelated UI rewrite.

- [ ] **Step 7: Commit final verification/docs**

```bash
git add scripts/validate-static.mjs README.md tests/guided-leak-regression.test.js tests/aggressive-leak-regression.test.js
git commit -m "docs: document guided known-real leak diagnostics"
```

- [ ] **Step 8: Verify the exact final HEAD in CI**

Push/update the feature branch, wait for the `Test` workflow on the exact final commit SHA, and verify its `npm run check` step is `success`. Do not merge based only on an older green commit.

---

## Spec Coverage Self-Review

- Guided VPN-off/VPN-on wizard: Tasks 1, 2, 9, 10.
- `sessionStorage` only / clear / reload behavior: Tasks 1, 10, 11.
- Provider-level observations and consensus masking protection: Tasks 2, 7, 11.
- Known-real / known-VPN / unknown rules and false-positive protection: Tasks 3, 7, 8, 11.
- Reconnect millisecond bursts: Tasks 4, 7, 11.
- WebRTC stress + up-to-four structured STUN destinations: Task 5, integrated Task 7.
- Media permission before/after + track cleanup: Task 6, UI/app Task 9/10, regression Task 11.
- UDP/TCP actual-observation semantics: Tasks 5, 9, 11.
- Exposure persistence/channel counts/single-sample duration: Tasks 3, 8, 11.
- Split-routing matrix and guided verdict: Tasks 8, 9, 10.
- Coverage and timer-throttling correctness: existing fixed-cadence tests retained in Task 7; final regression Task 11.
- JSON report, overall severity, Kill Switch independence: Task 10.
- README/privacy/static limitations: Task 11.

No implementation of authoritative DNS, torrent, SMTP or project-owned STUN/TURN is included in this plan.
