# Aggressive IP Leak Test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a manual 60-second high-frequency browser-only leak test that catches short-lived unexpected public IPv4/IPv6 exposure across independent HTTP, STUN, echo, and TLS observation paths while accurately reporting coverage gaps.

**Architecture:** Keep the existing automatic core checks lightweight. Build the aggressive test as a separate state machine/controller with pure IP classification and leak-correlation helpers, then wire it into the current page through a focused renderer. Unexpected public-address observations are the only new hard leak evidence; CGNAT/local addresses, metadata changes, and sampling gaps never become leaks by themselves.

**Tech Stack:** Vanilla JavaScript ES modules, WebRTC ICE/STUN, browser online/offline/visibility/Network Information events, existing public IP consensus/HTTP echo/TLS reflector/GeoIP modules, Node.js 22 `node:test`, existing `npm run check` GitHub Actions pipeline.

## Global Constraints

- Aggressive test duration defaults to exactly `60_000 ms`.
- Aggressive test starts only after explicit user action.
- Fast forced-family HTTP sampling targets approximately `2_000 ms` cadence.
- Isolated STUN sampling targets approximately `5_000 ms` cadence.
- HTTP echo targets approximately `10_000 ms` cadence.
- TLS reflector targets approximately `15_000 ms` cadence.
- Network-event burst cooldown defaults to `1_500 ms`.
- Coverage-gap threshold defaults to `2.5 ×` the fast HTTP interval.
- Final aggressive result labels are exactly `No unexpected IP observed`, `Leak detected`, or `Inconclusive`.
- `Leak detected` requires successfully observed unexpected public IPv4/IPv6 evidence; enrichment is never required.
- `Leak detected` outranks coverage problems if a real unexpected public address was captured.
- A clean result is forbidden when minimum coverage is not met.
- CGNAT `100.64.0.0/10`, RFC1918 IPv4, IPv6 ULA/link-local, mDNS, and other non-public candidates never count as public-IP leak evidence.
- Baseline STUN addresses are trusted only when they match trusted HTTP baseline addresses of the same family.
- Request failures and unavailable samples never create exposures.
- Stale async callbacks from a previous run must not mutate the current run.
- No persistent storage or analytics are added.
- The same third-party providers may receive more requests during the explicit 60-second test; README/UI must disclose this.
- The existing automatic core screen and existing Kill Switch monitor remain available and independent.
- Exact feature-branch HEAD must pass the full `npm run check` GitHub Actions job before merge is offered.

---

### Task 1: Deep IP classification for public, CGNAT, and IPv6 transition ranges

**Files:**
- Create: `assets/ip-classification.js`
- Modify: `assets/network.js`
- Modify: `assets/webrtc-test.js`
- Create: `tests/ip-classification.test.js`
- Modify: `tests/webrtc-test.test.js`

**Interfaces:**
- Produces: `classifyIpAddress(address) -> { family, scope, public, transition, label }`
- Produces: `isPublicInternetAddress(address) -> boolean`
- Existing `network.js` continues exporting `getIpFamily(address)` and `classifyAddress(address)` for compatibility.
- `classifyAddress(address)` maps the richer classifier into existing string classes plus new `cgnat`, `ula`, `multicast`, `documentation`, `unspecified` values.
- `parseIceCandidate()` continues returning `{ address, port, family, protocol, type, classification }` and additionally returns `ipDetails`.

- [ ] **Step 1: Write failing IPv4 classification tests.**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyIpAddress, isPublicInternetAddress } from '../assets/ip-classification.js';

test('classifies CGNAT as shared non-public space', () => {
  assert.deepEqual(classifyIpAddress('100.64.0.1'), {
    family: 4, scope: 'cgnat', public: false, transition: null, label: 'CGNAT/shared'
  });
  assert.equal(isPublicInternetAddress('100.127.255.254'), false);
  assert.equal(isPublicInternetAddress('100.128.0.1'), true);
});

test('keeps normal global IPv4 public', () => {
  const result = classifyIpAddress('8.8.8.8');
  assert.equal(result.family, 4);
  assert.equal(result.scope, 'global');
  assert.equal(result.public, true);
});
```

- [ ] **Step 2: Write failing IPv6 classification tests.**

```js
test('classifies IPv6 special and transition ranges', () => {
  assert.equal(classifyIpAddress('fd00::1').scope, 'ula');
  assert.equal(classifyIpAddress('fe80::1').scope, 'link-local');
  assert.equal(classifyIpAddress('ff02::1').scope, 'multicast');
  assert.equal(classifyIpAddress('2001:db8::1').scope, 'documentation');
  assert.equal(classifyIpAddress('2002:c000:0204::1').transition, '6to4');
  assert.equal(classifyIpAddress('2001:0000:4136:e378::1').transition, 'teredo');
  assert.equal(classifyIpAddress('::ffff:192.0.2.1').transition, 'ipv4-mapped');
  assert.equal(classifyIpAddress('::').scope, 'unspecified');
  assert.equal(classifyIpAddress('2606:4700:4700::1111').public, true);
});
```

- [ ] **Step 3: Run the targeted test and verify RED.**

Run: `node --test tests/ip-classification.test.js`
Expected: FAIL because `assets/ip-classification.js` does not exist.

- [ ] **Step 4: Implement `assets/ip-classification.js`.** Use numeric IPv4 range checks and normalized 128-bit IPv6 prefix checks; do not classify documentation or transition ranges as stronger evidence than the spec allows.

Core shape:

```js
export function classifyIpAddress(address) {
  // return { family, scope, public, transition, label }
}

export function isPublicInternetAddress(address) {
  return classifyIpAddress(address).public === true;
}
```

- [ ] **Step 5: Make `network.js` delegate address classification without breaking callers.**

```js
import { classifyIpAddress } from './ip-classification.js';

export function classifyAddress(address) {
  if (typeof address === 'string' && address.trim().toLowerCase().endsWith('.local')) return 'mdns';
  return classifyIpAddress(address).scope;
}
```

Map global/public results to the existing `'public'` string so current assessment logic remains compatible.

- [ ] **Step 6: Extend WebRTC candidate tests and parser.**

```js
test('CGNAT ICE candidate is local/shared rather than public leak evidence', () => {
  const result = parseIceCandidate('candidate:1 1 udp 1 100.64.10.20 5000 typ host');
  assert.equal(result.classification, 'cgnat');
  assert.equal(result.ipDetails.public, false);
  assert.equal(getCandidateGroup(result), 'local');
});
```

Update `getCandidateGroup()` local scopes to include `cgnat`, `ula`, `link-local`, `private`, `loopback`, and `mdns`.

- [ ] **Step 7: Run tests and full check.**

Run: `node --test tests/ip-classification.test.js tests/webrtc-test.test.js && npm run check`
Expected: PASS.

- [ ] **Step 8: Commit.**

```bash
git add assets/ip-classification.js assets/network.js assets/webrtc-test.js tests/ip-classification.test.js tests/webrtc-test.test.js
git commit -m "feat: add deep IP address classification"
```

### Task 2: Pure leak observation and exposure correlation engine

**Files:**
- Create: `assets/leak-observation.js`
- Create: `tests/leak-observation.test.js`

**Interfaces:**
- Consumes: `isPublicInternetAddress(address)` and `classifyIpAddress(address)` from Task 1.
- Produces: `createLeakState({ baseline, startedAt, durationMs })`.
- Produces: `applyObservation(state, observation) -> newState`.
- Produces: `applyNetworkEvent(state, event) -> newState`.
- Produces: `calculateCoverage(state, config) -> coverage`.
- Produces: `finalizeLeakResult(state, config, nowMs) -> { result, label, reasons, exposures, coverage }`.
- Observation contract:

```js
{
  timestampMs,
  family: 4 | 6,
  address: string | null,
  channel: 'http' | 'stun' | 'echo' | 'tls',
  source: string,
  trigger: 'baseline' | 'scheduled' | 'network-burst',
  successful: boolean,
  providerCoverage?: { available, total, agree }
}
```

- [ ] **Step 1: Write failing baseline/no-exposure tests.**

```js
const baseline = { 4: new Set(['77.110.99.186']), 6: new Set() };
const state = createLeakState({ baseline, startedAt: 0, durationMs: 60000 });
const next = applyObservation(state, {
  timestampMs: 2000, family: 4, address: '77.110.99.186',
  channel: 'http', source: 'HTTP consensus', trigger: 'scheduled', successful: true
});
assert.equal(next.exposures.length, 0);
```

- [ ] **Step 2: Write failing unexpected IPv4 and IPv6-appearance tests.**

```js
test('unexpected IPv4 creates one exposure', () => {
  const next = applyObservation(state, {
    timestampMs: 4000, family: 4, address: '95.25.44.18',
    channel: 'http', source: 'HTTP consensus', trigger: 'scheduled', successful: true
  });
  assert.equal(next.exposures[0].address, '95.25.44.18');
});

test('public IPv6 appearing after absent baseline is leak evidence', () => {
  const next = applyObservation(state, {
    timestampMs: 5000, family: 6, address: '2a00:1450:4001::1',
    channel: 'http', source: 'HTTP IPv6', trigger: 'scheduled', successful: true
  });
  assert.equal(next.exposures[0].reason, 'IPv6 appeared during VPN test');
});
```

- [ ] **Step 3: Write failing merge/restoration tests.** Same unexpected address seen through HTTP and STUN must remain one exposure with two sources; a later trusted baseline observation sets `baselineRestoredAtMs` and an approximate exposure duration.

- [ ] **Step 4: Write failing non-public/failure tests.** `100.64.1.1`, `192.168.1.1`, `fd00::1`, and `successful:false` observations must never create exposures.

- [ ] **Step 5: Write failing coverage/result tests.** A clean 60-second run with adequate samples returns `No unexpected IP observed`; a 24-second scheduling gap forces `Inconclusive`; any exposure returns `Leak detected` even with the same gap; an early manual stop with too few samples is `Inconclusive`.

- [ ] **Step 6: Run RED.**

Run: `node --test tests/leak-observation.test.js`
Expected: FAIL because the module does not exist.

- [ ] **Step 7: Implement immutable reducer helpers.** Exposure identity is `${family}|${address}`. Keep source names in a deduplicated array and observation timestamps in bounded/simple arrays sufficient for the 60-second run.

- [ ] **Step 8: Implement coverage calculation.** Minimum-clean thresholds come from config; calculate `expectedFastSamples`, `attemptedFastSamples`, `successfulHttpSamples`, `largestGapMs`, `throttled`, and `sufficient`.

- [ ] **Step 9: Implement final result precedence.**

```js
if (state.exposures.length) return { result: 'leak', label: 'Leak detected', ... };
if (!coverage.sufficient) return { result: 'inconclusive', label: 'Inconclusive', ... };
return { result: 'clean', label: 'No unexpected IP observed', ... };
```

- [ ] **Step 10: Run test/full check and commit.**

Run: `node --test tests/leak-observation.test.js && npm run check`
Expected: PASS.

```bash
git add assets/leak-observation.js tests/leak-observation.test.js
git commit -m "feat: correlate aggressive leak observations"
```

### Task 3: Aggressive scheduler, sampling channels, run IDs, and network bursts

**Files:**
- Create: `assets/aggressive-leak-test.js`
- Modify: `assets/config.js`
- Create: `tests/aggressive-leak-test.test.js`

**Interfaces:**
- Consumes existing injected sampling functions rather than importing UI code.
- Produces:

```js
createAggressiveLeakTest({
  config,
  initialBaseline,
  sampleHttp,
  sampleStun,
  sampleEcho,
  sampleTls,
  now,
  setTimeoutImpl,
  clearTimeoutImpl,
  environment,
  onUpdate
}) -> {
  start(), stop(), getState(), handleNetworkEvent(type)
}
```

- State includes `runId`, lifecycle status, baseline, observations, network events, exposures, scheduler attempts, coverage, result, reasons.

- [ ] **Step 1: Add exact configuration defaults and failing config assertions.**

```js
aggressiveDurationMs: 60000,
aggressiveHttpIntervalMs: 2000,
aggressiveStunIntervalMs: 5000,
aggressiveEchoIntervalMs: 10000,
aggressiveTlsIntervalMs: 15000,
aggressiveGapMultiplier: 2.5,
aggressiveBurstCooldownMs: 1500,
aggressiveMinHttpAttempts: 10,
aggressiveMinSuccessfulHttpSamples: 6
```

- [ ] **Step 2: Write a fake-clock scheduler test.** Assert baseline burst occurs immediately, HTTP reschedules at ~2000ms, STUN at ~5000ms, echo at ~10000ms, TLS at ~15000ms, and the controller finalizes at 60000ms.

- [ ] **Step 3: Write a stale-run test.** Start run A, start/replace with run B, resolve an old run-A async sample, and assert run B state is unchanged.

- [ ] **Step 4: Write network-burst debounce tests.** Multiple `online`/`connection-change` calls inside 1500ms schedule only one HTTP+STUN burst; `offline` records context but does not sample until connectivity returns.

- [ ] **Step 5: Write listener-cleanup test.** Starting registers `online`, `offline`, `visibilitychange`, and `navigator.connection.change` when available; stop/finalize removes them.

- [ ] **Step 6: Run RED.**

Run: `node --test tests/aggressive-leak-test.test.js`
Expected: FAIL because controller does not exist/config is absent.

- [ ] **Step 7: Implement controller with one-shot recursive `setTimeout` scheduling rather than `setInterval`.** Recursive scheduling makes intended/actual timestamps explicit and avoids overlapping requests when one sample runs long.

- [ ] **Step 8: Normalize channel results into Task-2 observations.** HTTP consensus contributes the selected address only when successful; STUN contributes each valid public srflx candidate; echo/TLS contribute only normalized observed remote IPs.

- [ ] **Step 9: Ensure async channel isolation.** Wrap each channel in `Promise.allSettled`/local try-catch and ignore a result if captured `runId !== currentRunId`.

- [ ] **Step 10: Run tests/full check and commit.**

Run: `node --test tests/aggressive-leak-test.test.js && npm run check`
Expected: PASS.

```bash
git add assets/aggressive-leak-test.js assets/config.js tests/aggressive-leak-test.test.js
git commit -m "feat: add 60 second aggressive leak scheduler"
```

### Task 4: WebRTC privacy summary and IPv6 bypass assessment hardening

**Files:**
- Modify: `assets/webrtc-test.js`
- Modify: `assets/network-assessment.js`
- Create: `tests/webrtc-privacy.test.js`
- Modify: `tests/assessment.test.js`

**Interfaces:**
- Produces: `summarizeWebRtcPrivacy(candidates, trustedHttpAddresses) -> { numericPrivateIpv4Exposed, cgnatExposed, privateIpv6Exposed, mdnsProtection, publicMismatches }`.
- `assessAddressFamilies()` uses `ipDetails.public`/rich classification when supplied but preserves current fallback behavior.

- [ ] **Step 1: Write failing WebRTC privacy-summary tests.**

```js
test('summarizes numeric local address exposure without calling it a leak', () => {
  const summary = summarizeWebRtcPrivacy([
    parseIceCandidate('candidate:1 1 udp 1 192.168.1.10 5000 typ host'),
    parseIceCandidate('candidate:2 1 udp 1 host-a.local 5001 typ host'),
    parseIceCandidate('candidate:3 1 udp 1 100.64.10.10 5002 typ host')
  ], new Set());
  assert.equal(summary.numericPrivateIpv4Exposed, true);
  assert.equal(summary.cgnatExposed, true);
  assert.equal(summary.mdnsProtection, true);
  assert.deepEqual(summary.publicMismatches, []);
});
```

- [ ] **Step 2: Add public IPv6 mismatch regression.** A public/global IPv6 srflx candidate absent from HTTP trusted baseline remains hard leak evidence; ULA/link-local IPv6 does not.

- [ ] **Step 3: Run RED, implement helper, run GREEN.**

Run: `node --test tests/webrtc-privacy.test.js tests/assessment.test.js`
Expected before implementation: FAIL; after implementation: PASS.

- [ ] **Step 4: Keep ASN/country IPv4-vs-IPv6 differences at `review`.** Do not promote metadata-only differences to `leak`.

- [ ] **Step 5: Run `npm run check` and commit.**

```bash
git add assets/webrtc-test.js assets/network-assessment.js tests/webrtc-privacy.test.js tests/assessment.test.js
git commit -m "feat: deepen WebRTC and IPv6 leak assessment"
```

### Task 5: Unexpected-IP enrichment cache for aggressive exposures

**Files:**
- Create: `assets/aggressive-leak-enrichment.js`
- Create: `tests/aggressive-leak-enrichment.test.js`

**Interfaces:**
- Consumes existing `runGeoIpConsensus` and `runNetworkIntelligence` through dependency injection.
- Produces:

```js
createAggressiveLeakEnricher({ geoLookup, intelligenceLookup }) -> {
  enrichExposure(exposure, baselineMetadata),
  cache
}
```

- Enriched exposure adds `{ enrichmentStatus, geo, intelligence, explanation }`.

- [ ] **Step 1: Write failing cache test.** Two exposure updates for `95.25.44.18` must invoke GeoIP/intelligence once each.

- [ ] **Step 2: Write failing explanation tests.** Datacenter/VPN baseline to non-datacenter/non-VPN new address -> `Possible ISP exposure`; otherwise use `Different VPN/network path`, `Address changed within same network`, or `Unexpected public IP` only when supported by available metadata.

- [ ] **Step 3: Write failure-preservation test.** Both enrichment calls rejecting must return the raw exposure with `enrichmentStatus:'unavailable'`, not remove or downgrade it.

- [ ] **Step 4: Implement, run targeted test, then full check.**

Run: `node --test tests/aggressive-leak-enrichment.test.js && npm run check`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add assets/aggressive-leak-enrichment.js tests/aggressive-leak-enrichment.test.js
git commit -m "feat: enrich aggressive leak exposures"
```

### Task 6: Dedicated aggressive leak UI and responsive renderer

**Files:**
- Modify: `index.html`
- Create: `assets/aggressive-leak-render.js`
- Modify: `assets/styles.css`
- Create: `tests/aggressive-leak-ui.test.js`

**Interfaces:**
- HTML IDs:
  - `#aggressive-section`
  - `#aggressive-toggle`
  - `#aggressive-status`
  - `#aggressive-progress`
  - `#aggressive-summary`
  - `#aggressive-timeline`
  - `#aggressive-exposures`
- Produces: `renderAggressiveLeakTest(elements, state)`.

- [ ] **Step 1: Write failing static UI tests.** Require `Aggressive Leak Test`, `Start 60s test`, the IDs above, and explicit copy saying the mode sends frequent requests for 60 seconds.

- [ ] **Step 2: Require dedicated non-overlapping exposure/source/timing layout classes.** Tests should assert `.aggressive-exposure`, `.aggressive-address`, `.aggressive-sources`, `.aggressive-timing` each have `min-width:0` and wrapping; mobile media query stacks rows.

- [ ] **Step 3: Run RED.**

Run: `node --test tests/aggressive-leak-ui.test.js`
Expected: FAIL.

- [ ] **Step 4: Add the section after Kill Switch.** Keep English concise UI copy.

Example copy:

```html
<h2>Aggressive Leak Test</h2>
<p>For 60 seconds, repeatedly compare HTTP, IPv4/IPv6 and STUN paths while you disconnect or reconnect the VPN.</p>
<button id="aggressive-toggle">Start 60s test</button>
```

- [ ] **Step 5: Implement renderer.** Running state shows seconds remaining, sample coverage, current observed addresses, event timeline. Completed exposure cards show address, family, first/last seen, approximate duration, sources, baseline-restored state, and enrichment.

- [ ] **Step 6: Render final labels exactly.** `Leak detected`, `Inconclusive`, `No unexpected IP observed`.

- [ ] **Step 7: Add WebRTC privacy summary rows to the existing WebRTC card renderer contract.** Display `Numeric private IPv4`, `CGNAT candidate`, `Private/ULA IPv6`, `mDNS protection`, `Public mismatch`; local exposure remains informational.

- [ ] **Step 8: Run UI tests and full check; commit.**

Run: `node --test tests/aggressive-leak-ui.test.js && npm run check`
Expected: PASS.

```bash
git add index.html assets/aggressive-leak-render.js assets/styles.css tests/aggressive-leak-ui.test.js
git commit -m "feat: add aggressive leak test UI"
```

### Task 7: App wiring, enrichment, Copy JSON, and global severity propagation

**Files:**
- Modify: `assets/app.js`
- Modify: `assets/assessment.js`
- Create: `tests/aggressive-leak-integration.test.js`
- Modify: `tests/assessment.test.js`

**Interfaces:**
- `assessResults()` gains optional `aggressiveFindings = []` alongside `monitorFindings`.
- `currentReport` gains `aggressive` state/result.
- App owns one aggressive controller and one aggressive enricher.

- [ ] **Step 1: Write failing assessment test.**

```js
test('aggressive unexpected public IP elevates overall result to leak', () => {
  const result = assessResults({
    ipv4: { address: '77.110.99.186' }, ipv6: {},
    webrtc: { status: 'complete', publicAddresses: [] }, privacy: { findings: [] },
    aggressiveFindings: [{
      id: 'aggressive-public-ip', severity: 'leak', category: 'aggressive',
      summary: 'Unexpected public IP observed', details: '95.25.44.18', sources: ['aggressive-test']
    }]
  });
  assert.equal(result.status, 'leak');
});
```

- [ ] **Step 2: Write static integration tests requiring imports/wiring for `createAggressiveLeakTest`, `renderAggressiveLeakTest`, and `createAggressiveLeakEnricher`.**

- [ ] **Step 3: Run RED.**

Run: `node --test tests/aggressive-leak-integration.test.js tests/assessment.test.js`
Expected: FAIL.

- [ ] **Step 4: Build baseline from current report.** Trusted baseline contains current HTTP IPv4/IPv6 only; perform the controller baseline burst to fill missing families; do not trust mismatching STUN addresses.

- [ ] **Step 5: Inject existing samplers.**

```js
sampleHttp: async () => Promise.all([
  runIpConsensus({ family: 4, providers: networkConfig.ipProviders[4], timeoutMs: networkConfig.requestTimeoutMs }),
  runIpConsensus({ family: 6, providers: networkConfig.ipProviders[6], timeoutMs: networkConfig.requestTimeoutMs })
]),
sampleStun: () => Promise.all(networkConfig.stunUrls.map((server) =>
  runWebRtcTest({ stunUrls: [server], timeoutMs: networkConfig.webrtcTimeoutMs })
)),
sampleEcho: () => runHttpInspection({ endpoint: networkConfig.httpEchoEndpoint, timeoutMs: networkConfig.advancedTimeoutMs }),
sampleTls: () => runTlsFingerprint({ endpoint: networkConfig.tlsReflectorEndpoint, timeoutMs: networkConfig.fingerprintTimeoutMs })
```

- [ ] **Step 6: Enrich only unique unexpected public addresses.** Trigger enrichment asynchronously when a new exposure appears; merge metadata back only if run ID still matches.

- [ ] **Step 7: Propagate hard exposure finding to overall assessment.** `Inconclusive` does not change overall status to leak; it may add a review finding if desired, but must not overwrite stronger existing leak findings.

- [ ] **Step 8: Ensure `Copy JSON` includes aggressive state/result/exposures/coverage.** Never persist outside current in-memory report.

- [ ] **Step 9: Disable only conflicting aggressive controls while running.** Do not disable normal Copy JSON or destroy Kill Switch history; prevent a second aggressive run from overlapping the current one.

- [ ] **Step 10: Run targeted tests and full check; commit.**

Run: `node --test tests/aggressive-leak-integration.test.js tests/assessment.test.js && npm run check`
Expected: PASS.

```bash
git add assets/app.js assets/assessment.js tests/aggressive-leak-integration.test.js tests/assessment.test.js
git commit -m "feat: wire aggressive IP leak detection"
```

### Task 8: Validation, documentation, regression safety, and exact-HEAD CI

**Files:**
- Modify: `scripts/validate-static.mjs`
- Modify: `README.md`
- Create: `tests/aggressive-leak-regression.test.js`

**Interfaces:**
- Static validator requires all new modules and checks their relative imports.
- README documents request frequency, interpretation, and static-site limitations.

- [ ] **Step 1: Add regression tests for severity boundaries.** Assert CGNAT, private/ULA/local WebRTC exposure, STUN port change, ASN/Geo changes, and coverage throttling cannot independently create `Leak detected`; unexpected public IPv4/IPv6 can.

- [ ] **Step 2: Add configuration regression assertions.** Default duration must remain `60000`; interval defaults must remain `2000/5000/10000/15000`; clean minimum coverage must be explicit.

- [ ] **Step 3: Update static validation required list.** Add:
  - `assets/ip-classification.js`
  - `assets/leak-observation.js`
  - `assets/aggressive-leak-test.js`
  - `assets/aggressive-leak-enrichment.js`
  - `assets/aggressive-leak-render.js`

- [ ] **Step 4: Update README with a dedicated `Aggressive Leak Test` section.** State that it runs only on explicit start, lasts 60 seconds, uses frequent third-party requests, catches unexpected public IPv4/IPv6/WebRTC/STUN observations, and can return `Inconclusive` when browser throttling/source failures reduce coverage.

- [ ] **Step 5: Preserve infrastructure truthfulness.** README must still state that authoritative DNS leak, torrent tracker leak, SMTP/email leak, and project-owned STUN require controlled backend/VPS infrastructure.

- [ ] **Step 6: Run the full local project verification command.**

Run: `npm run check`
Expected: exit code `0`; all Node tests, static validation, and build pass.

- [ ] **Step 7: Compare branch against `main`.**

Run/inspect equivalent of `main...feature/aggressive-ip-leak-test` and confirm changes are limited to this feature/spec/plan/tests/docs with no unrelated edits.

- [ ] **Step 8: Verify GitHub Actions on the exact feature HEAD.** Fetch `refs/heads/feature/aggressive-ip-leak-test`, then workflow runs for that exact SHA. Require `status: completed`, `conclusion: success`, and the `Run npm run check` step `success`.

- [ ] **Step 9: Commit final docs/validation if needed.**

```bash
git add README.md scripts/validate-static.mjs tests/aggressive-leak-regression.test.js
git commit -m "docs: document aggressive IP leak test"
```

- [ ] **Step 10: Re-run exact-HEAD CI after the final commit.** Do not offer merge until the final commit SHA—not an earlier green SHA—has a successful full check.
