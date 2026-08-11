# Fast Core Consensus + RU-Friendly IP/GeoIP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the default Core VPN/IP check finish at the fastest mathematically-safe quorum on both healthy and degraded/Russian-network paths, while fixing GeoIP disagreement/flag behavior without changing leak verdict semantics.

**Architecture:** Replace the current `primary -> reserve` wait-all Core orchestration with one cancellable concurrent race across every enabled Core-capable provider group. The race returns early only when the current winner remains Strong even if every pending group disagrees; pending work is aborted and recorded as `not-needed`. Independently, GeoIP gains explicit evidence states (`unavailable | single-source | agree | disagree`) and resilient location/flag rendering. Active stress tests keep their current small provider profile and cadence.

**Tech Stack:** Static browser ES modules, Fetch API + AbortController, Node.js >=22 `node:test`, existing GitHub Pages/GitHub Actions workflows.

## Global Constraints

- Product UI copy remains concise English.
- Core optimizes for time to trustworthy result, not minimum request count.
- Strong consensus remains: at least 3 successful independent groups and winning share >= 2/3.
- Early completion is allowed only when the winner is mathematically guaranteed Strong even if all pending enabled groups disagree.
- One independent provider group casts at most one vote.
- ident.me + tnedi.me remain one group and one vote.
- First-valid IP remains provisional only.
- A final `no-consensus` result has `address: null`.
- Provider errors/timeouts/CORS failures never become leak findings by themselves.
- Requests aborted because consensus is already guaranteed are `not-needed`, not `unavailable`.
- IPPubblico is attempted by the real browser again; it is no longer globally skipped because of one runner smoke.
- Core public-IP deadline target is 3200 ms; changing away from 3200 ms requires measured evidence and a spec note.
- ident hedge delay target is 900 ms.
- Repeated Kill Switch/Aggressive/Guided stress keeps `stressIpProviderGroups` and existing cadence/duration.
- New RU IP/GeoIP providers require browser-readable CORS/payload/rate-limit activation evidence; failure to activate them does not block the rest of the feature.
- No token, API key, JSONP injection, `no-cors`, or HTML scraping is added.
- GeoIP country evidence states are exactly `unavailable | single-source | agree | disagree`.
- `countryAgree` is `true` only for `agree`, `false` only for `disagree`, and `null` otherwise.
- A usable selected country/location is rendered even when GeoIP providers disagree.
- Flag fallback order is FlagCDN image -> Unicode emoji -> country text.
- Existing WebRTC/Guided/Aggressive leak verdict hierarchy remains unchanged.
- Full `npm run check` must pass on the exact final feature HEAD before integration.

---

## File Structure

**Create**
- `assets/ip-consensus-race.js` — pure vote/race decision helpers for mathematically-safe early completion.
- `tests/ip-consensus-race.test.js` — quorum guarantee matrix and pending-count tests.
- `scripts/check-ru-provider-cors.mjs` — one-shot activation smoke for RU public-IP and GeoIP candidates.
- `tests/fast-core-config.test.js` — timing/provider-profile invariants.

**Modify**
- `assets/ip-provider-group.js` — caller cancellation and hedged mirror execution.
- `assets/ip-consensus.js` — concurrent enabled-group race, early abort, `not-needed` evidence, live IPPubblico.
- `assets/config.js` — 3200 ms Core timeout, 900 ms hedge delay, enabled Core group list, RU candidates if activated.
- `assets/provider-evidence.js` — early-abort/not-needed explanation.
- `assets/provider-evidence-render.js` — concise `Consensus already guaranteed` rendering.
- `assets/geoip.js` — explicit country/location evidence states and optional RU normalizer/provider.
- `assets/assessment.js` — disagreement finding only for actual `countryState === 'disagree'`.
- `assets/country.js` — flag presentation helper with emoji fallback data.
- `assets/app.js` — resilient location/flag rendering and disagreement hint while keeping provisional GeoIP race protection.
- `assets/dashboard-view.js` — location state distinguishes unavailable vs usable disputed GeoIP.
- `assets/styles.css` / `assets/dashboard.css` — emoji/image flag alignment and location warning.
- `tests/ip-provider-group.test.js`
- `tests/ip-consensus-groups.test.js`
- `tests/ip-progressive.test.js`
- `tests/config.test.js`
- `tests/provider-evidence.test.js`
- `tests/geoip.test.js`
- `tests/assessment.test.js`
- `tests/country.test.js`
- `tests/dashboard-view.test.js`
- `tests/progressive-core.test.js`
- `scripts/validate-static.mjs`
- `README.md`

---

### Task 1: Pure Early-Strong Quorum Decision

**Files:**
- Create: `assets/ip-consensus-race.js`
- Create: `tests/ip-consensus-race.test.js`

**Interfaces:**

`assets/ip-consensus-race.js` exports:

```js
countVotes(sources) -> {
  successful: Source[],
  counts: Record<string, number>,
  winner: string|null,
  selectedVotes: number,
  winningShare: number,
  allAgree: boolean
}

canGuaranteeStrong({ sources, pendingCount }) -> boolean
```

`Source` is the existing group result shape with `status` and `address`.

- [ ] **Step 1: Write RED quorum matrix**

Create `tests/ip-consensus-race.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { countVotes, canGuaranteeStrong } from '../assets/ip-consensus-race.js';

const ok = (id, address) => ({ id, status:'complete', address });
const fail = (id) => ({ id, status:'unavailable', address:null });


test('4 equal responses with 2 pending are mathematically guaranteed Strong', () => {
  const sources = [1,2,3,4].map((n) => ok(`p${n}`, '31.76.17.233'));
  assert.equal(canGuaranteeStrong({ sources, pendingCount:2 }), true);
});

test('3 equal responses with 2 pending are not yet guaranteed', () => {
  const sources = [1,2,3].map((n) => ok(`p${n}`, '31.76.17.233'));
  assert.equal(canGuaranteeStrong({ sources, pendingCount:2 }), false);
});

test('5 equal responses with 2 pending are guaranteed', () => {
  const sources = [1,2,3,4,5].map((n) => ok(`p${n}`, '31.76.17.233'));
  assert.equal(canGuaranteeStrong({ sources, pendingCount:2 }), true);
});

test('4-1 with 1 pending is still guaranteed at exactly 4/6', () => {
  const sources = [
    ok('a','31.76.17.233'), ok('b','31.76.17.233'), ok('c','31.76.17.233'), ok('d','31.76.17.233'),
    ok('e','203.0.113.8')
  ];
  assert.equal(canGuaranteeStrong({ sources, pendingCount:1 }), true);
});

test('3-1 with 2 pending is not guaranteed', () => {
  const sources = [ok('a','31.76.17.233'), ok('b','31.76.17.233'), ok('c','31.76.17.233'), ok('d','203.0.113.8')];
  assert.equal(canGuaranteeStrong({ sources, pendingCount:2 }), false);
});

test('failed settled sources do not increase worst-case denominator', () => {
  const sources = [ok('a','31.76.17.233'), ok('b','31.76.17.233'), ok('c','31.76.17.233'), fail('x')];
  assert.equal(canGuaranteeStrong({ sources, pendingCount:1 }), true); // 3 / (3 + 1) = 75%
});

test('three votes minimum still applies with zero pending', () => {
  assert.equal(canGuaranteeStrong({ sources:[ok('a','1.1.1.1'),ok('b','1.1.1.1')], pendingCount:0 }), false);
});
```

- [ ] **Step 2: Run RED**

```bash
node --test tests/ip-consensus-race.test.js
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement the pure helper**

```js
export function countVotes(sources = []) {
  const successful = sources.filter((source) => source?.status === 'complete' && source.address);
  const counts = {};
  for (const source of successful) counts[source.address] = (counts[source.address] ?? 0) + 1;
  const ranked = Object.entries(counts).sort((a,b) => b[1] - a[1]);
  const winner = ranked[0]?.[0] ?? null;
  const selectedVotes = ranked[0]?.[1] ?? 0;
  const winningShare = successful.length ? selectedVotes / successful.length : 0;
  return { successful, counts, winner, selectedVotes, winningShare, allAgree:ranked.length <= 1 };
}

export function canGuaranteeStrong({ sources = [], pendingCount = 0 }) {
  const vote = countVotes(sources);
  if (vote.selectedVotes < 3) return false;
  const worstCaseSuccessful = vote.successful.length + Math.max(0, pendingCount);
  return worstCaseSuccessful > 0 && (vote.selectedVotes / worstCaseSuccessful) >= (2 / 3);
}
```

- [ ] **Step 4: Run GREEN**

```bash
node --test tests/ip-consensus-race.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add assets/ip-consensus-race.js tests/ip-consensus-race.test.js
git commit -m "feat: define early Strong quorum guarantee"
```

---

### Task 2: Cancellable Concurrent Core Consensus Race

**Files:**
- Modify: `assets/ip-provider-group.js`
- Modify: `assets/ip-consensus.js`
- Modify: `tests/ip-consensus-groups.test.js`
- Modify: `tests/ip-progressive.test.js`
- Modify: `tests/provider-evidence.test.js`

**Interfaces:**

Extend provider runners:

```js
runIpEndpoint({ endpoint, family, timeoutMs, fetchImpl, now, signal = null })
runIpProviderGroup({ group, family, timeoutMs, fetchImpl, now, signal = null, hedgeDelayMs = null, setTimeoutImpl = setTimeout, clearTimeoutImpl = clearTimeout })
```

`runIpConsensusProgressive` keeps its public signature but Core orchestration treats all enabled `primaryGroups + reserveGroups` as one concurrent set. Disabled groups remain evidence-only `disabled` until Task 4 removes IPPubblico quarantine.

Add terminal group status:

```text
not-needed
```

with:

```js
error: 'Consensus already guaranteed'
```

- [ ] **Step 1: Write RED early-abort integration tests**

Add to `tests/ip-consensus-groups.test.js` using controllable promises/fake fetches:

```js
test('4 equal of 6 finishes before two pending groups settle and marks them not-needed', async () => {
  // a-d resolve same IP; e-f never resolve until their AbortSignal fires.
  const result = await runIpConsensusProgressive({ family:4, primaryGroups:groups6, reserveGroups:[], timeoutMs:3200, fetchImpl });
  assert.equal(result.confidence, 'strong');
  assert.equal(result.address, '31.76.17.233');
  assert.equal(result.agreement.available, 4);
  assert.equal(result.sources.filter((s) => s.status === 'not-needed').length, 2);
  assert.ok(result.sources.filter((s) => s.status === 'not-needed').every((s) => /guaranteed/i.test(s.error)));
});

test('3 equal of 5 does not early-finish while two groups are pending', async () => {
  // Resolve first 3, assert consensus promise still pending, then resolve fourth/fifth.
});

test('an apparent 3-0 lead may become 3-2 and is not returned early', async () => {
  // first 3 winner, final 2 competing -> final strong? 3/5=.6 => no-consensus
  assert.equal(result.confidence, 'no-consensus');
  assert.equal(result.address, null);
});

test('one provider failure plus 3 matching and one pending can early finish', async () => {
  // settled denominator is only successful + pending; failed source does not count as possible future vote.
});

test('provider aborted by global quorum is not unavailable', async () => {
  assert.equal(aborted.status, 'not-needed');
});
```

In `tests/ip-progressive.test.js`, preserve first-valid emission and add:

```js
test('first valid still renders before early Strong finalizes', async () => {
  assert.equal(events[0].type, 'first-valid');
  assert.equal(final.confidence, 'strong');
});
```

- [ ] **Step 2: Run RED**

```bash
node --test tests/ip-consensus-race.test.js tests/ip-consensus-groups.test.js tests/ip-progressive.test.js
```

Expected: current implementation waits `Promise.all(primary)` and cannot abort pending work.

- [ ] **Step 3: Add caller cancellation to `runIpEndpoint`**

Use a local timeout controller plus optional caller signal. When either aborts, abort the actual request. Distinguish caller quorum abort from ordinary timeout by passing a caller-controlled reason object or checking `signal.reason`.

Minimal pattern:

```js
const controller = new AbortController();
const abortFromCaller = () => controller.abort(signal?.reason ?? new DOMException('Aborted','AbortError'));
if (signal?.aborted) abortFromCaller();
else signal?.addEventListener('abort', abortFromCaller, { once:true });
const timer = setTimeout(() => controller.abort(new DOMException('Timed out','AbortError')), Math.max(1, timeoutMs));
```

Always remove the caller listener in `finally`.

Return ordinary endpoint status `unavailable` for local timeout/network errors; group-level consensus orchestration converts quorum-aborted pending groups to `not-needed`.

- [ ] **Step 4: Refactor `runIpConsensusProgressive` to settle incrementally**

Import `canGuaranteeStrong` and `countVotes`.

Create one `AbortController` per enabled group and start all groups immediately:

```js
const configured = [...normalizedPrimary, ...reserveGroups];
const enabled = configured.filter((group) => group.enabled !== false);
const settled = new Map();
let pending = enabled.length;
```

Each group promise writes its final source into `settled`, decrements `pending`, emits first-valid once, then calls `maybeFinish()`.

`maybeFinish()`:

```js
if (canGuaranteeStrong({ sources:[...settled.values()], pendingCount:pending })) {
  finishReason = 'strong-guaranteed';
  for (const item of enabled) {
    if (!settled.has(item.id)) controllers.get(item.id)?.abort('consensus-guaranteed');
  }
  resolveRace();
  return;
}
if (pending === 0) resolveRace();
```

After race completion, synthesize every still-unsettled quorum-aborted group as:

```js
sourceShell(group, family, 'not-needed', 'Consensus already guaranteed')
```

Do not await those network promises before returning. Attach rejection-safe `.catch()` handlers at creation so late abort completion cannot become unhandled rejection.

- [ ] **Step 5: Preserve Primary/Reserve evidence compatibility**

Even though Core execution is now one race, `result.primary.sources` and `result.reserve.sources` remain separated by configured tier for Copy JSON/Advanced compatibility.

`reserve.used` becomes:

```js
reserve.sources.some((source) => source.status === 'complete' || source.status === 'unavailable')
```

A reserve source finishing before quorum counts normally. A reserve source aborted after quorum is `not-needed`.

`agreement.total` counts only settled attempted vote-capable sources (`complete`/`unavailable`), excluding `not-needed` and `disabled`; `available` counts only successful complete votes.

- [ ] **Step 6: Run GREEN**

```bash
node --test tests/ip-consensus-race.test.js tests/ip-consensus-groups.test.js tests/ip-progressive.test.js tests/provider-evidence.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add assets/ip-provider-group.js assets/ip-consensus.js tests/ip-consensus-groups.test.js tests/ip-progressive.test.js tests/provider-evidence.test.js
git commit -m "feat: finish Core IP consensus at guaranteed quorum"
```

---

### Task 3: Hedged ident.me Mirror Without a Second Vote

**Files:**
- Modify: `assets/ip-provider-group.js`
- Modify: `tests/ip-provider-group.test.js`
- Modify: `assets/config.js`
- Create: `tests/fast-core-config.test.js`

**Interfaces:**

Provider group optional config:

```js
hedgeDelayMs: number|null
```

For ident groups set:

```js
hedgeDelayMs: 900
```

- [ ] **Step 1: Write RED hedge tests**

Extend `tests/ip-provider-group.test.js` with fake timers/injected `setTimeoutImpl`:

```js
test('preferred ident response before hedge means mirror never starts', async () => {
  assert.deepEqual(urls, ['https://4.ident.me/']);
});

test('stalled preferred endpoint starts mirror after hedge delay', async () => {
  assert.equal(delaySeen, 900);
  assert.ok(urls.includes('https://4.tnedi.me/'));
});

test('mirror can win but group still returns one result and one vote', async () => {
  assert.equal(result.endpointId, 'ident4-mirror');
  assert.equal(result.address, '31.76.17.233');
  assert.equal(result.attempts.filter((x) => x.status === 'complete').length, 1);
});

test('losing mirror request is aborted after preferred succeeds', async () => {
  assert.equal(mirrorSignal.aborted, true);
});

test('group deadline still bounds both hedged requests', async () => {
  assert.ok(result.latencyMs <= 3200);
});
```

- [ ] **Step 2: Run RED**

```bash
node --test tests/ip-provider-group.test.js
```

Expected: current runner is serial and has no hedge.

- [ ] **Step 3: Implement hedge only for multi-endpoint groups with `hedgeDelayMs`**

Keep existing serial path for groups without a hedge.

For hedged two-endpoint groups:

1. create child controller for each endpoint linked to group caller signal;
2. start endpoint 0 immediately;
3. start endpoint 1 after `hedgeDelayMs` unless endpoint 0 has already returned valid;
4. resolve group on first `complete` endpoint;
5. abort other child request;
6. if one fails, wait for the other until the shared group deadline;
7. if both fail, return unavailable with both attempts.

Do not allow a losing aborted mirror attempt to replace the winning endpoint's group result.

- [ ] **Step 4: Configure ident hedge and Core timing constants**

In `assets/config.js` add exact constants:

```js
coreIpTimeoutMs: 3200,
ipProviderHedgeDelayMs: 900,
```

Set both ident groups' `hedgeDelayMs: 900`.

Keep `requestTimeoutMs` for repeated stress at its existing value if other callers rely on it; Core `runCore()` will switch to `coreIpTimeoutMs` in Task 4.

- [ ] **Step 5: Add config regression**

Create `tests/fast-core-config.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { networkConfig } from '../assets/config.js';

test('Core uses speed-oriented deadline and ident hedge', () => {
  assert.equal(networkConfig.coreIpTimeoutMs, 3200);
  assert.equal(networkConfig.ipProviderHedgeDelayMs, 900);
  for (const family of [4,6]) {
    const ident = networkConfig.coreIpProviderGroups[family].find((group) => group.group === 'ident');
    assert.equal(ident.hedgeDelayMs, 900);
    assert.equal(ident.endpoints.length, 2);
  }
});

test('stress profile is not widened by Core speed work', () => {
  for (const family of [4,6]) {
    assert.ok(networkConfig.stressIpProviderGroups[family].every((group) => ['ipify','ident','seeip'].includes(group.group)));
  }
});
```

- [ ] **Step 6: Run GREEN**

```bash
node --test tests/ip-provider-group.test.js tests/fast-core-config.test.js tests/config.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add assets/ip-provider-group.js assets/config.js tests/ip-provider-group.test.js tests/fast-core-config.test.js tests/config.test.js
git commit -m "feat: hedge ident mirror for faster Core"
```

---

### Task 4: Core Provider Set, Live IPPubblico, RU IP Activation Smoke

**Files:**
- Modify: `assets/config.js`
- Modify: `assets/app.js`
- Create: `scripts/check-ru-provider-cors.mjs`
- Modify: `tests/fast-core-config.test.js`
- Modify: `tests/progressive-core.test.js`

**Interfaces:**

Core must call:

```js
runIpConsensusProgressive({
  family,
  primaryGroups: networkConfig.coreIpProviderGroups[family],
  reserveGroups: networkConfig.reserveIpProviderGroups[family],
  timeoutMs: networkConfig.coreIpTimeoutMs,
  onFirstValid
})
```

The consensus implementation from Task 2 launches enabled primary and reserve groups concurrently, so keeping IPPubblico under the `reserve` tier is presentation-only compatibility, not a second-phase delay.

- [ ] **Step 1: Write RED config/wiring tests**

Add:

```js
test('IPPubblico is enabled for live browser Core attempts', () => {
  for (const family of [4,6]) {
    const source = networkConfig.reserveIpProviderGroups[family].find((group) => group.group === 'ippubblico');
    assert.notEqual(source.enabled, false);
  }
});
```

In `tests/progressive-core.test.js` require `networkConfig.coreIpTimeoutMs` in both Core family calls and ensure stress code still references `requestTimeoutMs`/stress groups.

- [ ] **Step 2: Run RED**

```bash
node --test tests/fast-core-config.test.js tests/progressive-core.test.js
```

Expected: IPPubblico is currently disabled and Core still uses `requestTimeoutMs`.

- [ ] **Step 3: Enable IPPubblico and wire Core deadline**

Remove `enabled:false` / `disabledReason` from IPPubblico groups. Keep them tier=`reserve` so Advanced continues grouping them under Reserve.

Change only `runCore()` family calls to `timeoutMs: networkConfig.coreIpTimeoutMs`.

Do not change `runStressIpConsensus()`.

- [ ] **Step 4: Add RU activation smoke utility**

Create `scripts/check-ru-provider-cors.mjs` with candidate descriptors:

```js
const candidates = [
  { id:'ip-api-ru-self', purpose:'ip+geo', url:'https://prod.ip-api.ru/checkIP/', parser:'ip-api-ru', rateNote:'demo 1 request / 10 seconds' },
  { id:'sypex-moscow', purpose:'geo', url:'https://ru.sxgeo.city/json/1.1.1.1', parser:'sypex', rateNote:'10000 free requests/month by IP+REFERER' }
];
```

The script accepts:

```bash
node scripts/check-ru-provider-cors.mjs --origin=https://pigalev.github.io
```

For each candidate it must print JSON containing:

```js
{ id, httpStatus, acao, contentType, parseOk, ip, countryCode, latencyMs, activation }
```

Activation rules:

- `acao` is `*` or exactly supplied origin;
- HTTP is 2xx;
- payload parser succeeds;
- for IP discovery, response contains a valid caller IP field;
- a demo/global rate limit that is unsuitable for a public always-on Core means `activation:'reject-rate-limit'` even if CORS works;
- missing CORS means `activation:'reject-cors'`;
- successful Sypex CORS/payload may qualify only for GeoIP, not IPv6 IP discovery because its documented REST IP input is IPv4-focused.

Do not use JSONP as fallback.

- [ ] **Step 5: Execute smoke and apply exact activation rule**

Run in a networked runner/environment:

```bash
node scripts/check-ru-provider-cors.mjs --origin=https://pigalev.github.io
```

Apply results as follows:

- IP-API.RU: because official demo access is limited to 1 request / 10 seconds, do **not** add it to always-on public Core unless smoke/documentation exposes a separate keyless endpoint without that public-site risk. It may remain documented as rejected candidate.
- Sypex Moscow: add to `geoIpProviders` only if CORS+JSON are browser-readable; never add it as IPv6 public-IP vote.
- If neither passes, do not add a new RU production provider. The feature still ships with live IPPubblico + early quorum.

Record activation decision in README in Task 8.

- [ ] **Step 6: Run GREEN**

```bash
node --test tests/fast-core-config.test.js tests/progressive-core.test.js tests/config.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add assets/config.js assets/app.js scripts/check-ru-provider-cors.mjs tests/fast-core-config.test.js tests/progressive-core.test.js tests/config.test.js
git commit -m "feat: enable live IPPubblico and fast Core deadline"
```

---

### Task 5: GeoIP Evidence State Model

**Files:**
- Modify: `assets/geoip.js`
- Modify: `tests/geoip.test.js`
- Modify: `assets/assessment.js`
- Modify: `tests/assessment.test.js`

**Interfaces:**

GeoIP consensus agreement becomes additive:

```js
agreement: {
  available:number,
  total:number,
  countryState:'unavailable'|'single-source'|'agree'|'disagree',
  locationState:'unavailable'|'single-source'|'agree'|'disagree',
  countryAgree:true|false|null,
  locationAgree:true|false|null
}
```

- [ ] **Step 1: Write RED GeoIP state tests**

Add to `tests/geoip.test.js`:

```js
test('zero usable countries is unavailable, not disagreement', async () => {
  const result = await runGeoIpConsensus({ ip:'94.25.174.96', providers, fetchImpl:allFail, timeoutMs:50 });
  assert.equal(result.agreement.countryState, 'unavailable');
  assert.equal(result.agreement.countryAgree, null);
});

test('one usable country is single-source', async () => {
  assert.equal(result.agreement.countryState, 'single-source');
  assert.equal(result.agreement.countryAgree, null);
  assert.equal(result.countryCode, 'RU');
});

test('two or more same countries agree', async () => {
  assert.equal(result.agreement.countryState, 'agree');
  assert.equal(result.agreement.countryAgree, true);
});

test('two different countries disagree', async () => {
  assert.equal(result.agreement.countryState, 'disagree');
  assert.equal(result.agreement.countryAgree, false);
});
```

Mirror the same 0/1/2+ state logic for `locationState` using `locationTuple` values.

- [ ] **Step 2: Run RED**

```bash
node --test tests/geoip.test.js tests/assessment.test.js
```

Expected: current zero-source branch returns `countryAgree:false` and assessment produces a false Review.

- [ ] **Step 3: Implement evidence-state helper**

Inside `geoip.js`:

```js
function evidenceState(values) {
  const normalized = values.filter(Boolean).map((value) => String(value).trim().toLowerCase());
  if (normalized.length === 0) return 'unavailable';
  if (normalized.length === 1) return 'single-source';
  return new Set(normalized).size === 1 ? 'agree' : 'disagree';
}

function legacyAgree(state) {
  return state === 'agree' ? true : state === 'disagree' ? false : null;
}
```

Use this both in the no-provider branch and successful branch.

Do not change the existing selected value voting (`voteValue`) in this task.

- [ ] **Step 4: Make assessment disagreement explicit**

Replace:

```js
result?.geo?.agreement?.countryAgree === false
```

with:

```js
const countryDisagrees = result?.geo?.agreement?.countryState
  ? result.geo.agreement.countryState === 'disagree'
  : result?.geo?.agreement?.countryAgree === false;
```

The legacy fallback keeps old serialized report compatibility.

- [ ] **Step 5: Add assessment regressions**

```js
test('GeoIP unavailable does not create country disagreement Review', () => {
  assert.ok(!result.findings.some((f) => f.id.includes('geo-country-disagreement')));
});

test('single GeoIP country does not create disagreement Review', () => { ... });

test('actual country disagreement still creates Review', () => { ... });
```

- [ ] **Step 6: Run GREEN**

```bash
node --test tests/geoip.test.js tests/assessment.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add assets/geoip.js assets/assessment.js tests/geoip.test.js tests/assessment.test.js
git commit -m "fix: distinguish unavailable GeoIP from disagreement"
```

---

### Task 6: Always Render Usable Location + Resilient Flag Fallback

**Files:**
- Modify: `assets/country.js`
- Modify: `tests/country.test.js`
- Modify: `assets/app.js`
- Modify: `assets/dashboard-view.js`
- Modify: `tests/dashboard-view.test.js`
- Modify: `assets/styles.css`
- Modify: `assets/dashboard.css`

**Interfaces:**

`assets/country.js` exports existing functions plus:

```js
countryCodeToFlag(code) -> string
buildCountryFlagPresentation(code) -> {
  code:string|null,
  imageUrl:string|null,
  emoji:string
}
```

`countryCodeToFlag` already exists and remains the emoji implementation.

- [ ] **Step 1: Write RED flag tests**

Extend `tests/country.test.js`:

```js
import { buildCountryFlagPresentation } from '../assets/country.js';

test('flag presentation provides both image and emoji fallback', () => {
  assert.deepEqual(buildCountryFlagPresentation('ru'), {
    code:'RU', imageUrl:'https://flagcdn.com/24x18/ru.png', emoji:'🇷🇺'
  });
});

test('invalid country has no invented flag', () => {
  assert.deepEqual(buildCountryFlagPresentation(''), { code:null, imageUrl:null, emoji:'' });
});
```

- [ ] **Step 2: Write RED dashboard/location tests**

In `tests/dashboard-view.test.js`:

```js
test('usable GeoIP remains available when country evidence disagrees', () => {
  const view = buildConnectionView({
    ipv4:{ family:4,address:'94.25.174.96',confidence:'strong',ipFinal:true,geo:{ status:'partial',countryCode:'RU',country:'Russia',city:'Moscow',agreement:{countryState:'disagree'} } },
    ipv6:null
  });
  assert.equal(view.primary.locationState, 'available');
  assert.equal(view.primary.locationDisagreement, true);
  assert.equal(view.primary.location.countryCode, 'RU');
});

test('GeoIP unavailable is explicit location unavailable', () => {
  assert.equal(view.primary.locationState, 'unavailable');
});
```

- [ ] **Step 3: Run RED**

```bash
node --test tests/country.test.js tests/dashboard-view.test.js
```

- [ ] **Step 4: Implement flag presentation helper**

```js
export function buildCountryFlagPresentation(code) {
  const normalized = typeof code === 'string' ? code.trim().toUpperCase() : '';
  if (!/^[A-Z]{2}$/.test(normalized)) return { code:null, imageUrl:null, emoji:'' };
  return {
    code: normalized,
    imageUrl: countryCodeToFlagUrl(normalized),
    emoji: countryCodeToFlag(normalized)
  };
}
```

- [ ] **Step 5: Extend dashboard connection VM**

`ipEntry()` must treat `geo.status` `complete` **or `partial`** as usable when at least a country/region/city exists. Add:

```js
locationDisagreement: geo?.agreement?.countryState === 'disagree' || geo?.agreement?.locationState === 'disagree'
```

Do not hide `location` because disagreement exists.

- [ ] **Step 6: Refactor `locationNode()` in `app.js`**

Use `buildCountryFlagPresentation`.

DOM structure:

```text
.location-value
  .country-flag-slot
    img.country-flag
    span.country-flag-emoji (initially hidden when image exists)
  span country/location text
```

On image error:

```js
img.remove();
emoji.hidden = !presentation.emoji;
```

If no image URL, emoji is visible immediately. Country/location text is always appended independently.

When `locationDisagreement` is true, append below location:

```text
GeoIP providers disagree
```

with muted/warning styling, while the existing overall Review chip remains assessment-owned.

If `locationState === 'unavailable'`, render `Location unavailable` instead of silently omitting the line.

- [ ] **Step 7: Add CSS**

```css
.country-flag-slot{display:inline-flex;align-items:center;justify-content:center;width:20px;min-width:20px}
.country-flag-emoji{font-size:1rem;line-height:1}
.connection-location-warning{margin:4px 0 0;color:var(--warning);font-size:.78rem}
```

Keep mobile wrapping and no horizontal overflow.

- [ ] **Step 8: Run GREEN**

```bash
node --test tests/country.test.js tests/dashboard-view.test.js tests/progressive-core.test.js tests/assessment.test.js
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add assets/country.js assets/app.js assets/dashboard-view.js assets/styles.css assets/dashboard.css tests/country.test.js tests/dashboard-view.test.js
git commit -m "fix: keep GeoIP location and flag visible"
```

---

### Task 7: Advanced Evidence for Early Completion and Optional RU GeoIP Activation

**Files:**
- Modify: `assets/provider-evidence.js`
- Modify: `assets/provider-evidence-render.js`
- Modify: `tests/provider-evidence.test.js`
- Modify: `assets/config.js` only if Sypex passes Task 4 smoke.
- Modify: `assets/geoip.js` only if an activated RU provider needs a normalizer kind.
- Modify: `tests/geoip.test.js` only if activated.

**Interfaces:**

Evidence relation remains:

```text
agrees | differs | observed | unavailable | not-needed | disabled
```

`not-needed` message is exactly:

```text
Consensus already guaranteed
```

- [ ] **Step 1: Write RED evidence test**

```js
test('early-aborted groups are shown as not-needed, not unavailable', () => {
  const view = buildIpProviderEvidence(resultWithEarlyAbort);
  const row = view.rows.find((item) => item.id === 'ipsb4');
  assert.equal(row.relation, 'not-needed');
  assert.equal(row.error, 'Consensus already guaranteed');
});
```

- [ ] **Step 2: Run RED**

```bash
node --test tests/provider-evidence.test.js
```

- [ ] **Step 3: Normalize renderer wording**

For not-needed source render:

```text
IP.SB
Not needed
consensus already guaranteed
—
```

Do not show `0 ms` as though a network attempt completed; latency cell for `not-needed` becomes `—`.

Unavailable still shows actual error + measured latency.

- [ ] **Step 4: If Sypex smoke passed, activate it as GeoIP-only**

Add provider:

```js
{ id:'sypex-ru', label:'Sypex Geo RU', kind:'sypex', urlTemplate:'https://ru.sxgeo.city/json/{ip}' }
```

Only do this if Task 4 smoke returned browser-readable ACAO and parseable JSON. Existing `normalizeGeoIp(..., kind:'sypex')` already supports the documented shape; add tests proving `country.iso`, English/Russian names and timezone normalization.

If smoke failed, make **no production config change** and add no dead provider entry.

- [ ] **Step 5: Run GREEN**

```bash
node --test tests/provider-evidence.test.js tests/geoip.test.js tests/config.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add assets/provider-evidence.js assets/provider-evidence-render.js assets/config.js assets/geoip.js tests/provider-evidence.test.js tests/geoip.test.js tests/config.test.js
git commit -m "feat: explain early Core completion evidence"
```

If `assets/config.js` / `assets/geoip.js` did not change because RU GeoIP failed activation, omit them from `git add`.

---

### Task 8: Full Regression, Validator, README, Exact-HEAD CI

**Files:**
- Modify: `scripts/validate-static.mjs`
- Modify: `README.md`
- Modify: focused tests if final activated provider set differs from candidates.

**Interfaces:**
- No new runtime interface.

- [ ] **Step 1: Extend validator**

Require:

```text
assets/ip-consensus-race.js
networkConfig.coreIpTimeoutMs
networkConfig.ipProviderHedgeDelayMs
```

Reject:

- production Core `enabled:false` on IPPubblico;
- Core `requestTimeoutMs` usage in `runCore()`;
- RU candidates with JSONP/no-cors/token placeholders;
- widening of `stressIpProviderGroups` beyond the approved small profile.

- [ ] **Step 2: Add final race regressions**

Run/ensure tests cover exactly:

```text
4 same + 2 pending -> early Strong
3 same + 2 pending -> keep waiting
3 same + 2 competing -> no-consensus
2 same + all remaining fail/deadline -> Partial
0 successful -> Unavailable
quorum-aborted -> not-needed
IPPubblico valid -> normal vote
IPPubblico failure -> no Review
first provisional != final -> stale GeoIP discarded
```

- [ ] **Step 3: Add final GeoIP regressions**

Ensure exact cases:

```text
0 country -> unavailable / no Review / Location unavailable
1 country -> single-source / location visible
2+ same -> agree / location visible
2+ conflict -> disagree / Review / selected location visible
flag image error -> emoji visible
```

- [ ] **Step 4: Update README**

Document:

- Core launches enabled sources concurrently;
- early Strong formula `W >= 3 && W/(S+P) >= 2/3`;
- pending quorum-aborted sources show `Not needed`;
- 3200 ms Core deadline;
- ident 900 ms mirror hedge / one vote;
- IPPubblico is live browser-attempted again;
- actual activated RU source results from smoke (or explicitly state none passed activation);
- stress profile remains separate;
- GeoIP `unavailable/single-source/agree/disagree` semantics;
- flag image/emoji fallback.

- [ ] **Step 5: Run full test suite**

```bash
npm run check
```

Expected: zero failures.

- [ ] **Step 6: Inspect scope diff against `main`**

```bash
git diff main...HEAD --stat
git diff main...HEAD -- assets tests scripts README.md docs/superpowers/specs/2026-08-11-fast-core-ru-geoip-design.md docs/superpowers/plans/2026-08-11-fast-core-ru-geoip.md
```

Must not include changes to:

- Guided verdict precedence;
- Aggressive duration/cadence;
- Kill Switch interval;
- STUN destinations;
- TLS/HTTP echo behavior;
- DNS/torrent/email flags;
- sessionStorage report profile semantics.

- [ ] **Step 7: Stale-reference scans**

```bash
grep -R "countryAgree === false" assets tests || true
grep -R "coreIpTimeoutMs" assets tests scripts
grep -R "stressIpProviderGroups" assets/config.js assets/app.js tests
grep -R "ippubblico" assets/config.js tests scripts
```

Expected:

- no assessment logic relies solely on `countryAgree === false`;
- Core timeout is wired;
- stress remains separate;
- IPPubblico is enabled and tested, not quarantined.

- [ ] **Step 8: Commit docs/validator/polish**

```bash
git add scripts/validate-static.mjs README.md tests
git commit -m "docs: describe fast Core quorum and GeoIP states"
```

- [ ] **Step 9: Verify exact final feature SHA in GitHub Actions**

Wait for `Test` on exact final `feature/fast-core-ru-geoip` SHA and verify `npm run check` step concludes `success`. Do not rely on an earlier green commit.

- [ ] **Step 10: Integrate only after user choice**

Use `superpowers:finishing-a-development-branch`. If user selects merge, fast-forward `main` with `force:false`, then verify Test and Pages deploy on the same merged SHA before calling the fix live.

---

## Spec Coverage Self-Review

- Speed-first all-enabled concurrent Core: Tasks 2 and 4.
- Mathematically-safe early Strong: Tasks 1–2.
- Pending abort -> not-needed: Tasks 2 and 7.
- First-valid remains provisional: Task 2 regressions.
- 3200 ms Core deadline: Tasks 3–4.
- 900 ms ident hedge, one vote: Task 3.
- Live IPPubblico browser attempt: Task 4.
- RU IP activation gate: Task 4.
- RU GeoIP activation gate: Tasks 4 and 7.
- Stress profiles/cadence unchanged: Tasks 3–4 and validator Task 8.
- GeoIP unavailable != disagreement: Task 5.
- single-source state: Task 5.
- actual disagreement still Review: Task 5.
- usable disputed location remains visible: Task 6.
- FlagCDN -> emoji -> text fallback: Task 6.
- Advanced early-finish evidence: Task 7.
- Stale provisional GeoIP protection: Tasks 2 and 8 regression.
- Full CI/docs/validator/integration gate: Task 8.

Placeholder scan: no TBD/TODO or undefined implementation interfaces remain. RU-provider activation is intentionally evidence-dependent, with exact accept/reject rules and safe behavior when no candidate passes.

Type consistency: `countVotes`, `canGuaranteeStrong`, `runIpEndpoint`, `runIpProviderGroup`, `runIpConsensusProgressive`, `countryState`, `locationState`, `buildCountryFlagPresentation`, `coreIpTimeoutMs`, and `ipProviderHedgeDelayMs` are defined before later tasks consume them.
