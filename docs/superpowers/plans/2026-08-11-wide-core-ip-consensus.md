# Wide Core IP Consensus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Core public-IP detection resilient across a broad set of independent services, use IPPubblico only when primary evidence is weak, count one vote per provider group, and keep repeated Active-test sampling on a smaller high-frequency-safe profile.

**Architecture:** Introduce an endpoint-fallback provider-group runner, then make `ip-consensus.js` vote over successful independent groups rather than raw endpoints. Core runs broad primary groups in parallel and conditionally runs reserve groups only when the primary result does not meet the approved confidence threshold; repeated Kill Switch/Aggressive/Guided stress uses a separate smaller provider profile. Existing progressive first-IP rendering is retained, while no-consensus results become explicitly non-authoritative and Advanced diagnostics expose group/tier/endpoint evidence.

**Tech Stack:** Static browser ES modules, Fetch API, Node.js >=22 `node:test`, existing GitHub Pages/GitHub Actions workflows.

## Global Constraints

- Product UI copy remains concise English.
- Conversation/docs may be Russian, but shipped UI remains English.
- Core primary target groups are `ipify`, `ident.me`, `SeeIP`, `icanhazip`, and `MyIP` when browser-CORS/family behavior is verified.
- `IPPubblico` remains configured only as a conditional reserve group.
- `ipwho.is` is removed from public-IP-only Core voting; its existing GeoIP use remains unchanged.
- One independent provider group can cast at most one vote, regardless of mirrors/endpoints.
- `ident.me` and `tnedi.me` are one group; the mirror is fallback availability, never an extra vote.
- Strong consensus requires at least 3 successful independent groups and a winning share >= 2/3 of successful group votes.
- A `3-2` five-source result is not Strong; reserve is attempted.
- A final result with >=3 successful groups but winning share < 2/3 is `no-consensus` and has `address: null`.
- One or two successful agreeing groups are `partial`; reserve is attempted first.
- Zero successful groups is `unavailable`.
- Provider disagreement alone is not leak evidence.
- A Strong result with one differing provider does not become Review merely because one provider differed.
- Failed/unavailable/wrong-family endpoints never vote and never count as `differs`.
- Reserve usage itself is not Review.
- Existing fast-first progressive display remains: first valid primary address is rendered before the final consensus completes.
- A provisional address is never left as authoritative if the final result is `no-consensus`.
- GeoIP stale-address race protection remains intact.
- Guided Known Real minority-provider evidence semantics remain intact.
- Broad Core provider groups are not used every 2–5 seconds by Kill Switch/Aggressive/Guided stress.
- No API key, JSONP, `no-cors`, HTML scraping, or public secret is added.
- New providers are enabled in production config only after CORS/payload/family smoke evidence is acceptable; if a candidate cannot be verified, it stays disabled and the rest of the feature still ships.
- Full `npm run check` must pass on the exact final feature HEAD before integration.

---

## File Structure

**Create**
- `assets/ip-provider-group.js` — endpoint execution and bounded sequential fallback inside one independent provider group.
- `tests/ip-provider-group.test.js` — fallback, family validation, timeout-budget and one-vote semantics.
- `tests/ip-consensus-groups.test.js` — confidence/reserve/group-aware consensus cases.
- `scripts/check-ip-provider-cors.mjs` — non-production smoke utility that checks response readability headers/payload for candidate endpoints from a declared origin; activation still requires human review of family reachability results.
- `tests/ip-provider-profile.test.js` — config separation and repeated-test profile regression.

**Modify**
- `assets/config.js` — `coreIpProviderGroups`, `reserveIpProviderGroups`, `stressIpProviderGroups`; remove Core `ipwho.is`/routine IPPubblico vote.
- `assets/ip-consensus.js` — group-aware confidence model, conditional reserve orchestration, progressive callback.
- `assets/provider-observations.js` — collect one observation per independent group while preserving endpoint attempts.
- `assets/provider-evidence.js` — confidence/tier/group-aware evidence model.
- `assets/provider-evidence-render.js` — Primary/Reserve sections and fallback-attempt details.
- `assets/dashboard-view.js` — compact Core confidence labels and explicit no-consensus/unavailable states.
- `assets/app.js` — Core uses broad+reserve profile; Monitor/Aggressive/Guided stress use stress profile; Guided capture keeps broad Core profile.
- `assets/guided-app-runtime.js` — Guided Step 1/2 captures use broad Core groups instead of removed flat `ipProviders`.
- `assets/network-assessment.js` if any address comparison assumes a complete HTTP address for a no-consensus family.
- `assets/assessment.js` — strong minority disagreement is informational; no-consensus cannot create fake WebRTC leak evidence.
- `tests/config.test.js`
- `tests/ip-progressive.test.js`
- `tests/provider-evidence.test.js`
- `tests/progressive-core.test.js`
- Guided/Aggressive/monitor integration tests affected by provider injection.
- `scripts/validate-static.mjs`
- `README.md`

---

### Task 1: Provider-Group Endpoint Fallback

**Files:**
- Create: `assets/ip-provider-group.js`
- Create: `tests/ip-provider-group.test.js`
- Modify: `assets/ip-consensus.js` only to re-export/consume endpoint execution helpers after GREEN.

**Interfaces:**

`assets/ip-provider-group.js` exports:

```js
runIpEndpoint({ endpoint, family, timeoutMs, fetchImpl = fetch, now = performance.now })
runIpProviderGroup({ group, family, timeoutMs, fetchImpl = fetch, now = performance.now })
```

Endpoint config:

```js
{ id, kind: 'text'|'json'|'ipify'|'ipwhois', url }
```

Group config:

```js
{
  id,
  group,
  label,
  family,
  tier: 'primary'|'reserve'|'stress',
  endpoints: [{ id, kind, url }, ...]
}
```

Group result:

```js
{
  id, group, label, family, tier,
  status: 'complete'|'unavailable'|'not-needed',
  address: string|null,
  latencyMs: number,
  endpointId: string|null,
  attempts: [{ endpointId, status, address, latencyMs, error }],
  error: string|null
}
```

- [ ] **Step 1: Write failing endpoint/group tests**

Create `tests/ip-provider-group.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { runIpProviderGroup } from '../assets/ip-provider-group.js';

function json(payload) { return { ok:true, status:200, json:async()=>payload, text:async()=>JSON.stringify(payload) }; }
function text(value) { return { ok:true, status:200, text:async()=>value, json:async()=>({ ip:value.trim() }) }; }

const ident = {
  id:'ident4', group:'ident', label:'ident.me', family:4, tier:'primary',
  endpoints:[
    { id:'ident-primary-4', kind:'text', url:'https://4.ident.me/' },
    { id:'ident-mirror-4', kind:'text', url:'https://4.tnedi.me/' }
  ]
};

test('provider group falls back to mirror and returns one vote', async () => {
  const result = await runIpProviderGroup({
    group:ident, family:4, timeoutMs:1000,
    fetchImpl:async (url) => {
      if (url.includes('ident.me')) throw new TypeError('offline');
      return text('203.0.113.7\n');
    }
  });
  assert.equal(result.status, 'complete');
  assert.equal(result.address, '203.0.113.7');
  assert.equal(result.endpointId, 'ident-mirror-4');
  assert.equal(result.attempts.length, 2);
  assert.equal(result.attempts[0].status, 'unavailable');
  assert.equal(result.attempts[1].status, 'complete');
});

test('wrong-family endpoint falls through and never votes', async () => {
  const result = await runIpProviderGroup({
    group:ident, family:4, timeoutMs:1000,
    fetchImpl:async (url) => url.includes('ident.me')
      ? text('2001:db8::5')
      : text('203.0.113.8')
  });
  assert.equal(result.address, '203.0.113.8');
  assert.match(result.attempts[0].error, /family/i);
});

test('successful preferred endpoint prevents mirror request', async () => {
  const urls = [];
  const result = await runIpProviderGroup({
    group:ident, family:4, timeoutMs:1000,
    fetchImpl:async (url) => { urls.push(url); return text('203.0.113.9'); }
  });
  assert.equal(result.address, '203.0.113.9');
  assert.equal(urls.length, 1);
  assert.equal(result.attempts.length, 1);
});

test('all failed endpoints produce one unavailable group result', async () => {
  const result = await runIpProviderGroup({
    group:ident, family:4, timeoutMs:1000,
    fetchImpl:async () => { throw new TypeError('offline'); }
  });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.address, null);
  assert.equal(result.attempts.length, 2);
});
```

- [ ] **Step 2: Run RED**

```bash
node --test tests/ip-provider-group.test.js
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement bounded sequential group fallback**

Create `assets/ip-provider-group.js` with current family validation/extraction logic moved from `ip-consensus.js`.

Use one deadline for the whole group:

```js
const startedAt = now();
const deadline = startedAt + timeoutMs;
for (const endpoint of group.endpoints ?? []) {
  const remainingMs = Math.max(1, deadline - now());
  if (remainingMs <= 1 && now() >= deadline) break;
  const attempt = await runIpEndpoint({ endpoint, family, timeoutMs:remainingMs, fetchImpl, now });
  attempts.push(attempt);
  if (attempt.status === 'complete') return {
    id:group.id, group:group.group, label:group.label, family, tier:group.tier,
    status:'complete', address:attempt.address,
    latencyMs:Math.max(0, Math.round(now() - startedAt)), endpointId:endpoint.id,
    attempts, error:null
  };
}
```

A two-endpoint group must not get `2 * timeoutMs` total wall-clock budget.

- [ ] **Step 4: Run GREEN**

```bash
node --test tests/ip-provider-group.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add assets/ip-provider-group.js tests/ip-provider-group.test.js
git commit -m "feat: add resilient IP provider groups"
```

---

### Task 2: Group-Aware Confidence + Conditional Reserve Consensus

**Files:**
- Modify: `assets/ip-consensus.js`
- Create: `tests/ip-consensus-groups.test.js`
- Modify: `tests/ip-progressive.test.js`

**Interfaces:**

Replace production consensus arguments with:

```js
runIpConsensusProgressive({
  family,
  primaryGroups,
  reserveGroups = [],
  timeoutMs,
  fetchImpl = fetch,
  onFirstValid = null
})
```

`runIpConsensus(args)` remains a wrapper.

Final result:

```js
{
  status: 'complete'|'partial'|'unavailable',
  confidence: 'strong'|'partial'|'no-consensus'|'unavailable',
  family,
  address: string|null,
  observedAddresses: string[],
  agreement: {
    available:number,
    total:number,
    agree:boolean,
    counts:Record<string,number>,
    selectedVotes:number,
    winningShare:number
  },
  sources: GroupResult[],
  primary: { available, total, sources },
  reserve: { used:boolean, sources },
  error:string|null
}
```

Result invariant:

```text
confidence strong  -> status complete, address non-null
confidence partial -> status complete, address non-null
confidence no-consensus -> status partial, address null
confidence unavailable -> status unavailable, address null
```

- [ ] **Step 1: Write RED confidence/reserve matrix**

Create `tests/ip-consensus-groups.test.js` using one-endpoint fake groups and URL->IP fixtures. Required tests:

```js
test('5-0 primary is strong and reserve is not called', ...)
test('4-1 primary is strong and reserve is not called', ...)
test('3-2 primary is not strong and calls reserve', ...)
test('2-1 with three successful groups is strong', ...)
test('two agreeing primary groups call reserve and remain partial if reserve fails', ...)
test('2-2 primary tie plus agreeing reserve creates strong 3-2 result', ...)
test('2-2 plus reserve returning third value remains no-consensus with null address', ...)
test('one successful group plus failed reserve is partial', ...)
test('zero successful primary and reserve groups is unavailable', ...)
test('ident mirror success contributes exactly one vote', ...)
```

For `3-2`, reserve returning winner yields `4-2` => Strong (`4/6 = 2/3`). Reserve returning minority yields `3-3` => No consensus.

- [ ] **Step 2: Run RED**

```bash
node --test tests/ip-consensus-groups.test.js tests/ip-progressive.test.js
```

Expected: new API/confidence tests fail against flat-provider implementation.

- [ ] **Step 3: Implement pure vote evaluation inside `ip-consensus.js`**

Add:

```js
function evaluateGroupVotes(family, sources) {
  const successful = sources.filter((source) => source.status === 'complete' && source.address);
  const counts = {};
  for (const source of successful) counts[source.address] = (counts[source.address] ?? 0) + 1;
  const ranked = Object.entries(counts).sort((a,b) => b[1] - a[1]);
  const winner = ranked[0]?.[0] ?? null;
  const selectedVotes = ranked[0]?.[1] ?? 0;
  const winningShare = successful.length ? selectedVotes / successful.length : 0;
  const strong = successful.length >= 3 && winningShare >= (2 / 3);
  const allAgree = ranked.length <= 1;
  const partial = successful.length > 0 && successful.length <= 2 && allAgree;
  return { successful, counts, winner, selectedVotes, winningShare, strong, partial, allAgree };
}
```

Do not classify `3-2` as partial: after reserve, if still below 2/3 it is No consensus.

- [ ] **Step 4: Implement conditional reserve orchestration**

Primary groups run in parallel. Emit the first successful primary group exactly once through `onFirstValid`.

After primary settles:

```js
const primaryVote = evaluateGroupVotes(family, primarySources);
if (primaryVote.strong) {
  reserveSources = reserveGroups.map((group) => ({
    id:group.id, group:group.group, label:group.label, family, tier:'reserve',
    status:'not-needed', address:null, latencyMs:0, endpointId:null, attempts:[], error:null
  }));
} else {
  reserveSources = await Promise.all(reserveGroups.map((group) => runIpProviderGroup(...)));
}
```

If no primary callback fired and reserve produces the first valid address, allow one provisional callback so a total primary outage does not hide a usable reserve result until the end.

`agreement.total` counts only attempted groups (`not-needed` excluded). `sources` contains primary results plus reserve results/placeholders so Advanced can display `Not needed`.

- [ ] **Step 5: Update progressive tests**

Convert existing flat providers to group fixtures and preserve the important assertion: first valid primary is emitted before slower groups finish.

Add:

```js
test('final no-consensus never returns first provisional address as authoritative', async () => {
  // first returns .1, second .2, reserve .3 => all one vote
  assert.deepEqual(seen, ['203.0.113.1']);
  assert.equal(final.confidence, 'no-consensus');
  assert.equal(final.address, null);
  assert.deepEqual(new Set(final.observedAddresses), new Set(['203.0.113.1','203.0.113.2','203.0.113.3']));
});
```

- [ ] **Step 6: Run GREEN**

```bash
node --test tests/ip-provider-group.test.js tests/ip-consensus-groups.test.js tests/ip-progressive.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add assets/ip-consensus.js tests/ip-consensus-groups.test.js tests/ip-progressive.test.js
git commit -m "feat: add confidence and reserve IP consensus"
```

---

### Task 3: Provider Profiles + Activation Smoke Gate

**Files:**
- Modify: `assets/config.js`
- Modify: `tests/config.test.js`
- Create: `scripts/check-ip-provider-cors.mjs`
- Create: `tests/ip-provider-profile.test.js`

**Interfaces:**

`networkConfig` exposes:

```js
coreIpProviderGroups: { 4: Group[], 6: Group[] }
reserveIpProviderGroups: { 4: Group[], 6: Group[] }
stressIpProviderGroups: { 4: Group[], 6: Group[] }
```

Approved endpoint candidates:

```text
ipify v4: https://api4.ipify.org?format=json
ipify v6: https://api6.ipify.org?format=json
ident v4: https://4.ident.me/ -> https://4.tnedi.me/
ident v6: https://6.ident.me/ -> https://6.tnedi.me/
SeeIP v4: https://ipv4.seeip.org/jsonip
SeeIP v6: https://ipv6.seeip.org/jsonip
icanhazip v4: https://ipv4.icanhazip.com/
icanhazip v6: https://ipv6.icanhazip.com/
MyIP v4: https://api4.my-ip.io/v2/ip.json
MyIP v6: https://api6.my-ip.io/v2/ip.json
IPPubblico reserve v4: https://ipv4.ippubblico.org/
IPPubblico reserve v6: https://ipv6.ippubblico.org/
```

- [ ] **Step 1: Write RED config-profile tests**

Add tests requiring:

```js
assert.ok(networkConfig.coreIpProviderGroups[4].length >= 4);
assert.ok(networkConfig.coreIpProviderGroups[6].length >= 4);
assert.deepEqual(networkConfig.reserveIpProviderGroups[4].map(g => g.group), ['ippubblico']);
assert.deepEqual(networkConfig.reserveIpProviderGroups[6].map(g => g.group), ['ippubblico']);
assert.ok(networkConfig.stressIpProviderGroups[4].length <= networkConfig.coreIpProviderGroups[4].length);
assert.ok(!networkConfig.stressIpProviderGroups[4].some(g => ['ippubblico','myip'].includes(g.group)));
assert.ok(!networkConfig.coreIpProviderGroups[4].some(g => g.group === 'ipwhois'));
```

Add exact test that ident primary+mirror live under one group object with two endpoints.

- [ ] **Step 2: Run RED**

```bash
node --test tests/config.test.js tests/ip-provider-profile.test.js
```

Expected: missing new profile fields.

- [ ] **Step 3: Implement provider group config**

Use a helper to freeze nested group/endpoints. Keep legacy `ipv4Endpoint`/`ipv6Endpoint` only if another module still requires them; remove flat `ipProviders` once Task 5 wiring no longer references it.

Production Core should include every candidate that passes the activation gate during execution. At minimum retain already-working `ipify` and `icanhazip` family coverage; add `ident.me` based on its browser-fetch-capable API contract. SeeIP/MyIP are enabled only after Step 5 smoke evidence is acceptable.

Stress target is the verified subset of:

```text
ipify + ident.me + SeeIP
```

If SeeIP fails the gate, stress remains `ipify + ident.me`; do not substitute IPPubblico/MyIP merely to keep three names.

- [ ] **Step 4: Add CORS/payload smoke utility**

Create `scripts/check-ip-provider-cors.mjs` that:

- accepts `--origin=https://pigalev.github.io`;
- reads candidate endpoint constants from `assets/config.js` or a small exported candidate list;
- sends a simple GET with `Origin` header;
- checks HTTP success;
- checks `access-control-allow-origin` equals `*` or the supplied origin;
- parses response using endpoint `kind`;
- validates returned address family when the execution environment has that family connectivity;
- prints one JSON row per endpoint and exits non-zero only for explicitly required/active endpoints.

This script is evidence collection, not browser emulation. Because Node does not enforce browser CORS, a candidate is enabled only when the returned ACAO header plus real payload are compatible and the family result is believable. If IPv6 cannot be exercised from the execution environment, leave an unverified new IPv6 candidate disabled rather than guessing.

- [ ] **Step 5: Execute and record activation decision**

Run from a networked environment:

```bash
node scripts/check-ip-provider-cors.mjs --origin=https://pigalev.github.io
```

Expected output includes provider/endpoint/status/ACAO/address/family. Update config so only verified candidates are active. Do not add any workaround for failures.

- [ ] **Step 6: Run GREEN**

```bash
node --test tests/config.test.js tests/ip-provider-profile.test.js
```

Expected: PASS for the actually enabled profile.

- [ ] **Step 7: Commit**

```bash
git add assets/config.js scripts/check-ip-provider-cors.mjs tests/config.test.js tests/ip-provider-profile.test.js
git commit -m "feat: separate core and stress IP provider profiles"
```

---

### Task 4: Core Progressive UI + Confidence Semantics

**Files:**
- Modify: `assets/app.js`
- Modify: `assets/dashboard-view.js`
- Modify: `tests/progressive-core.test.js`
- Modify: `tests/dashboard-view.test.js`

**Interfaces:**

Core invocation becomes:

```js
runIpConsensusProgressive({
  family,
  primaryGroups: networkConfig.coreIpProviderGroups[family],
  reserveGroups: networkConfig.reserveIpProviderGroups[family],
  timeoutMs: networkConfig.requestTimeoutMs,
  onFirstValid
})
```

Connection view displays:

```text
Strong consensus · 4/5 primary responded · 4 agree
Strong consensus · reserve used
Partial · 2 sources agree · reserve unavailable
No consensus · review source details
Unavailable · no source confirmed this family
```

- [ ] **Step 1: Write RED dashboard confidence tests**

Add view-model tests for:

```js
confidence:'strong' + agreement counts -> sourceText starts 'Strong consensus'
confidence:'partial' -> 'Partial'
confidence:'no-consensus', address:null -> state 'no-consensus'
confidence:'unavailable', address:null -> state 'unavailable'
```

Ensure `no-consensus` is not rendered as `Not detected`.

- [ ] **Step 2: Write RED progressive-core source assertions**

Update `tests/progressive-core.test.js` to require `coreIpProviderGroups` + `reserveIpProviderGroups` in `runCore()`, while still proving first-valid callback triggers render/GeoIP before final consensus.

Add a source/race regression that final `address:null, confidence:'no-consensus'` clears the provisional authoritative display path and does not reuse stale provisional GeoIP as final.

- [ ] **Step 3: Run RED**

```bash
node --test tests/dashboard-view.test.js tests/progressive-core.test.js
```

- [ ] **Step 4: Wire Core profiles in `app.js`**

Change only the Core calls in `runCore()` to broad primary/reserve profiles.

`finalizeFamily()` must preserve `observedAddresses`, `confidence`, `primary`, `reserve`, and `sources` when adding GeoIP fields.

If final result has no authoritative address:

```js
const finalResult = { ...result, geo:null, ipFinal:true, geoPending:false, geoFinal:true };
liveIp[family] = finalResult;
displayedAddress[family] = null;
renderLiveConnection();
return finalResult;
```

No GeoIP lookup runs for a final No-consensus family.

- [ ] **Step 5: Update dashboard view model**

Use `confidence` before legacy status. Keep `Not detected` only for an explicitly known absent state; generic all-provider failure is `Unavailable`.

For no-consensus, primary hero must not display the provisional IP as confirmed. If the other family has a strong/partial authoritative address, it may become primary.

- [ ] **Step 6: Run GREEN**

```bash
node --test tests/dashboard-view.test.js tests/progressive-core.test.js tests/ip-progressive.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add assets/app.js assets/dashboard-view.js tests/dashboard-view.test.js tests/progressive-core.test.js
git commit -m "feat: surface honest core IP confidence"
```

---

### Task 5: Repeated Tests Use Stress Profile; Guided Captures Use Core Profile

**Files:**
- Modify: `assets/app.js`
- Modify: `assets/guided-app-runtime.js`
- Modify: `assets/provider-observations.js`
- Modify: affected Guided/Aggressive/Monitor tests
- Modify: `tests/ip-provider-profile.test.js`

**Interfaces:**

`collectProviderObservations` changes from `providers` to `groups`:

```js
collectProviderObservations({ family, groups, timeoutMs, fetchImpl, now, trigger })
```

Observation remains compatible but adds attempts:

```js
{
  timestampMs, family,
  providerId, providerLabel, providerGroup,
  address, latencyMs, status, error, trigger,
  attempts
}
```

- [ ] **Step 1: Write RED provider-profile wiring tests**

Source/integration assertions must prove:

```text
runCore -> core + reserve groups
Guided Step 1/2 capture -> core groups
Kill Switch repeated sample -> stress groups
Aggressive sampleHttp -> stress groups
Guided stress sampleHttp -> stress groups
Guided raw provider observations -> stress groups
```

Also assert no repeated path references `reserveIpProviderGroups`.

- [ ] **Step 2: Write RED observation fallback test**

Test an ident group whose primary endpoint fails and mirror succeeds. `collectProviderObservations` returns exactly one successful observation with `providerGroup:'ident'`, mirror address, and two attempts.

- [ ] **Step 3: Run RED**

Run provider profile plus existing Guided/Aggressive integration tests.

- [ ] **Step 4: Update `provider-observations.js`**

Replace raw endpoint `runIpProvider` fan-out with one `runIpProviderGroup` per independent group.

Do not flatten attempts into extra voting observations. Endpoint attempts are nested diagnostic evidence only.

- [ ] **Step 5: Update `app.js` repeated sampling**

Use `networkConfig.stressIpProviderGroups[family]` in:

- `createMonitor().sample`;
- unguided Aggressive `sampleHttp`;
- Guided stress `sampleHttp`;
- `sampleGuidedRawHttp`.

Repeated tests do not run Core reserve orchestration. Call `runIpConsensus({ primaryGroups: stressGroups, reserveGroups: [] })`.

- [ ] **Step 6: Update Guided Step 1/2 capture**

In `guided-app-runtime.js`:

```js
collectProviderObservations({
  family,
  groups: networkConfig.coreIpProviderGroups[family],
  timeoutMs: networkConfig.requestTimeoutMs,
  trigger
})
```

Guided capture intentionally gets broad evidence because it is low-frequency and determines Known Real/Known VPN baselines.

- [ ] **Step 7: Preserve minority Known Real behavior**

Run existing Guided regression where one provider group returns Known Real while majority stress consensus returns Known VPN. It must still classify the group-level Known Real observation as leak evidence.

- [ ] **Step 8: Run GREEN**

```bash
node --test tests/ip-provider-profile.test.js tests/provider-observations.test.js tests/guided-app-integration.test.js tests/aggressive-leak-test.test.js tests/monitor.test.js
```

Use exact existing filenames when repository naming differs.

- [ ] **Step 9: Commit**

```bash
git add assets/app.js assets/guided-app-runtime.js assets/provider-observations.js tests
git commit -m "feat: isolate repeated IP sampling profile"
```

---

### Task 6: Advanced Evidence Shows Primary, Reserve and Endpoint Fallbacks

**Files:**
- Modify: `assets/provider-evidence.js`
- Modify: `assets/provider-evidence-render.js`
- Modify: `tests/provider-evidence.test.js`
- Modify: `assets/dashboard.css` only if nested attempts need wrapping styles.

**Interfaces:**

`buildIpProviderEvidence(result)` returns:

```js
{
  selectedAddress,
  confidence,
  summary,
  primary: { available, total, rows },
  reserve: { used, rows },
  rows: [{
    id,label,tier,address,relation,latencyMs,error,endpointId,attempts
  }]
}
```

Relations:

```text
agrees | differs | unavailable | not-needed
```

- [ ] **Step 1: Write RED evidence tests**

Required cases:

```js
test('strong majority reports one differing group without counting it unavailable', ...)
test('reserve not needed is rendered as not-needed and excluded from vote totals', ...)
test('reserve used shows reserve address and relation', ...)
test('ident fallback preserves primary failure and mirror success attempts', ...)
test('no-consensus has no selected address and successful rows have neutral observed relation rather than fake agrees/differs', ...)
```

For no-consensus use relation `observed` as a fifth evidence-only relation, because there is no authoritative address to compare against. Do not label arbitrary first value `agrees`.

- [ ] **Step 2: Run RED**

```bash
node --test tests/provider-evidence.test.js
```

- [ ] **Step 3: Implement confidence/tier-aware builder**

Vote totals come from group-level `agreement`, never endpoint attempts.

Summary examples:

```text
Strong consensus · 4/5 primary groups responded · 4 agree
Strong consensus · reserve used
Partial · 2 sources agree · reserve unavailable
No consensus · 3 different observed values
```

- [ ] **Step 4: Render Primary/Reserve sections**

Advanced network disclosure should show:

```text
Public IP sources
Selected IP / Confidence / Primary groups / Votes
Primary
  group rows
Reserve
  IPPubblico Not needed | agrees | differs | unavailable
```

If a group used endpoint fallback, render a compact nested attempt list under that group:

```text
primary endpoint   unavailable · ...
mirror endpoint    success · ...
```

No extra requests are made by opening Advanced.

- [ ] **Step 5: Run GREEN**

```bash
node --test tests/provider-evidence.test.js tests/max-diagnostics.test.js tests/compact-dashboard-ui.test.js
```

- [ ] **Step 6: Commit**

```bash
git add assets/provider-evidence.js assets/provider-evidence-render.js assets/dashboard.css tests/provider-evidence.test.js
git commit -m "feat: explain core IP consensus evidence"
```

---

### Task 7: No-Consensus Leak/Assessment Safety

**Files:**
- Modify: `assets/assessment.js`
- Modify: `assets/network-assessment.js` if needed
- Modify: assessment/network tests
- Modify: Guided capture/report tests if they assume `status === complete` always has an address.

**Interfaces:**
- No new network API.
- Trust predicate used by comparisons:

```js
function authoritativeAddress(result) {
  return result?.address && ['strong','partial'].includes(result?.confidence)
    ? result.address
    : null;
}
```

- [ ] **Step 1: Write RED assessment tests**

Add cases:

```js
test('strong 4-1 HTTP consensus does not create Review only because agreement is false', ...)
test('no-consensus HTTP family cannot make WebRTC public IP a mismatch leak', ...)
test('no-consensus with no other authoritative HTTP family yields Incomplete/Review but not Protected', ...)
test('reserve use alone does not create finding', ...)
```

- [ ] **Step 2: Run RED**

```bash
node --test tests/assessment.test.js tests/network-assessment.test.js
```

Expected: current `agreement.agree === false` logic wrongly creates Review for strong majority and current mismatch logic may trust any non-null address semantics.

- [ ] **Step 3: Update assessment semantics**

Replace unconditional provider-disagreement Review with confidence-aware logic:

```js
if (result?.confidence === 'no-consensus') findings.push({
  id:`ipv${result.family}-no-consensus`,
  severity:'review',
  category:'ip',
  summary:`IPv${result.family} public IP could not reach consensus`,
  details:'Independent public-IP groups did not establish a sufficiently strong winner.',
  sources:['http-ip']
});
```

Do **not** push Review merely because `agreement.agree === false` when `confidence === 'strong'`.

For WebRTC mismatch, build trusted HTTP set only from authoritative addresses. If the set is empty, there is no mismatch leak classification.

- [ ] **Step 4: Audit network assessment**

Any `new Set([ipv4?.address, ipv6?.address])` comparison must use authoritative addresses only. Metadata comparisons skip a family with no authoritative address.

- [ ] **Step 5: Run Guided/core regression matrix**

Run existing Known Real, WebRTC mismatch, aggressive and overall assessment tests. No leak verdict precedence changes are allowed.

- [ ] **Step 6: Run GREEN**

```bash
node --test tests/assessment.test.js tests/network-assessment.test.js tests/guided-app-integration.test.js tests/leak-report.test.js tests/aggressive-leak-test.test.js
```

- [ ] **Step 7: Commit**

```bash
git add assets/assessment.js assets/network-assessment.js tests
git commit -m "fix: trust only authoritative core IP consensus"
```

---

### Task 8: Validator, README and Exact-HEAD Verification

**Files:**
- Modify: `scripts/validate-static.mjs`
- Modify: `README.md`
- Modify: focused static/config tests if final names change.

**Interfaces:**
- No new runtime API.

- [ ] **Step 1: Extend static validator**

Require:

```text
assets/ip-provider-group.js
coreIpProviderGroups
reserveIpProviderGroups
stressIpProviderGroups
```

Reject stale production references to `networkConfig.ipProviders`.

Validate IPPubblico exists only under reserve config and `ipwho.is` is absent from IP-only Core groups while remaining in `geoIpProviders`.

- [ ] **Step 2: Update README**

Document:

- broad Core provider groups;
- one vote per independent service group;
- ident mirror semantics;
- Strong threshold >=3 groups and >=2/3 winning share;
- conditional IPPubblico reserve;
- `3-2` triggers reserve rather than being called Strong;
- Partial/No consensus/Unavailable meaning;
- broad Core vs repeated Active-test provider profiles;
- Advanced group/endpoint evidence;
- provider failures/disagreement are not leaks by themselves.

List only providers actually enabled after activation smoke; do not document a candidate as active if it stayed disabled.

- [ ] **Step 3: Run full suite**

```bash
npm run check
```

Expected: zero failures.

- [ ] **Step 4: Inspect scope diff against `main`**

```bash
git diff main...HEAD --stat
git diff main...HEAD -- assets tests scripts/validate-static.mjs README.md
```

Expected changes are limited to public-IP provider grouping/profiles, consensus confidence/reserve behavior, evidence/UI wording, downstream trust safety, tests/docs/validator.

Must not change:

- GeoIP provider set except existing `ipwho.is` remains there;
- VPN leak verdict hierarchy;
- Aggressive/Guided durations or request cadence;
- STUN destinations;
- TLS/HTTP echo behavior;
- DNS/torrent/email feature flags;
- Guided sessionStorage semantics.

- [ ] **Step 5: Run stale-reference scan**

```bash
grep -R "networkConfig\.ipProviders" assets tests scripts || true
grep -R "ippubblico" assets/config.js tests/config.test.js
```

Expected: no production flat `ipProviders` usage; IPPubblico appears only in reserve profile/config assertions.

- [ ] **Step 6: Commit final docs/validator**

```bash
git add scripts/validate-static.mjs README.md tests
git commit -m "docs: describe resilient core IP consensus"
```

- [ ] **Step 7: Verify exact final feature SHA in GitHub Actions**

Wait for the `Test` workflow on the exact final `feature/wide-core-ip-consensus` SHA. Verify `npm run check` is `success` for that SHA; an earlier green commit is insufficient.

- [ ] **Step 8: Integrate only after user choice**

Use `superpowers:finishing-a-development-branch`. If the user selects merge, fast-forward `main` only when `main` is still an ancestor (`force:false`), then verify both the Test workflow and Pages deployment for the same merged SHA.

---

## Spec Coverage Self-Review

- Broad Core primary provider set: Tasks 3–4.
- IPPubblico reserve only: Tasks 2–3 and validator Task 8.
- ipwho.is removed only from IP vote, retained GeoIP: Tasks 3 and 8.
- One vote per group / mirror fallback: Tasks 1–2.
- Bounded mirror timeout: Task 1.
- Strong threshold >=3 and >=2/3: Task 2.
- `3-2` reserve behavior: Task 2 tests.
- Partial / No consensus / Unavailable: Tasks 2 and 4.
- No first-provider tie fallback: Tasks 2 and 4.
- Progressive first IP: Tasks 2 and 4.
- Stale GeoIP guard retained: Task 4.
- Core and repeated-test profiles separated: Tasks 3 and 5.
- Kill Switch also uses the repeated/stress profile because it polls every 5 seconds: Task 5.
- Guided Step 1/2 broad capture, Guided stress small profile: Task 5.
- Known Real minority evidence preserved: Task 5 regression.
- Advanced Primary/Reserve/endpoint attempt detail: Task 6.
- Strong minority disagreement not Review: Task 7.
- No-consensus cannot create fake WebRTC leak: Task 7.
- CORS/family activation gate without hacks/secrets: Task 3.
- Report compatibility fields and group-level `sources/agreement`: Tasks 2 and 6.
- Full validator/docs/exact-head verification: Task 8.

Placeholder scan: no TBD/TODO/deferred implementation interfaces remain. Candidate activation is intentionally data-dependent but has an exact gate and safe behavior: unverified candidates remain disabled rather than requiring a workaround.

Type consistency: `runIpEndpoint`, `runIpProviderGroup`, `runIpConsensusProgressive`, `runIpConsensus`, `collectProviderObservations`, and the three provider-profile config names are defined before all consumers use them. `confidence` values are consistently `strong | partial | no-consensus | unavailable` throughout the plan.
