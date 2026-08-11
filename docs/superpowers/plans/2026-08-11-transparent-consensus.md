# Transparent Consensus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Public IP, GeoIP, reserve, and PTR consensus mathematically consistent and maximally transparent, while preserving the existing fast Core behavior and concise main-screen UX.

**Architecture:** Unify Public IP final and early-termination logic around one Strong predicate; introduce explicit vote summaries for GeoIP country/location/timezone instead of field-by-field first-winner plurality; split reserve lifecycle into attempted/contributed/not-needed; and give reverse-DNS an explicit record-state model. The main dashboard consumes short quantitative summaries, while Advanced exposes full per-provider evidence and vote distributions.

**Tech Stack:** Static ES modules, Node.js >=22, `node:test`, DOM rendering in browser JavaScript, GitHub Actions, GitHub Pages.

## Global Constraints

- Public IP `Strong` requires both: at least 3 votes for one address and winner share >= 2/3 of all successful votes.
- Early-finish and final Public IP evaluation must use the same Strong predicate.
- `2:1` is not Strong; `3:0`, `3:1`, and `4:2` are Strong; `3:2` is not Strong.
- `ident.me` and `tnedi.me` remain one provider-group vote.
- Keep the existing Core provider list, `3200 ms` Core timeout, `900 ms` ident hedge, concurrent race, and cancellation behavior unchanged unless a correctness test proves a required semantic fix.
- Reserve status must distinguish `attempted`, `contributed`, and `not-needed`; a failed reserve request must never be described as `used` or `contributed`.
- GeoIP country/location/timezone winners require a strict majority (>50%) among usable field values; ties or fragmented pluralities are `unresolved` and must not select the first response.
- Any GeoIP country outlier keeps the overall verdict at `Review`, even when a country majority exists.
- GeoIP location-only disagreement is informational and does not by itself change `Protected` to `Review`.
- Main UI stays concise and quantitative; Advanced contains full provider-level evidence, vote distributions, usability, and latency.
- Reverse DNS must distinguish resolver reachability from PTR-record availability; `0 records` is never `agree`.
- Full repository verification command is `npm run check`.

---

## File Structure

- Modify `assets/ip-consensus-race.js` — export one canonical `isStrongVote()` predicate and reuse it for early finish.
- Modify `assets/ip-consensus.js` — use canonical Strong predicate, expose reserve lifecycle fields.
- Modify `tests/ip-consensus-race.test.js` — truth table for Strong predicate and early-finish equivalence.
- Modify `tests/ip-consensus-groups.test.js` — final consensus matrix, reserve lifecycle semantics, regression for hedged group vote.
- Create `assets/geoip-votes.js` — pure field-vote aggregation and strict-majority selection.
- Modify `assets/geoip.js` — produce per-field vote summaries and avoid arbitrary winners.
- Modify `tests/geoip.test.js` — majority/tie/fragmentation/outlier matrix.
- Modify `assets/geoip-evidence.js` — expose reached/usable counts and vote distributions.
- Modify `assets/geoip-evidence-render.js` — render field summaries and outliers in Advanced.
- Modify `tests/geoip-evidence.test.js` and `tests/geoip-evidence-render.test.js` — transparent counts and unresolved states.
- Modify `assets/provider-evidence.js` — replace `reserve used` with attempted/contributed/not-needed semantics.
- Modify `tests/provider-evidence.test.js` — reserve summary contracts.
- Modify `assets/reverse-dns.js` — explicit resolver/record agreement state.
- Create or modify `tests/reverse-dns.test.js` — PTR state matrix.
- Modify `assets/dashboard-view.js` — concise quantitative hero copy for GeoIP majority/outliers.
- Modify `tests/dashboard-view.test.js` — main-screen wording contracts.
- Modify `assets/app.js` — Advanced PTR labels and any new evidence fields.
- Modify `scripts/validate-static.mjs` — ban obsolete ambiguous copy and guard new semantics.
- Modify `README.md` — document consensus definitions and evidence semantics.

---

### Task 1: Canonical Public IP Strong predicate

**Files:**
- Modify: `assets/ip-consensus-race.js`
- Modify: `assets/ip-consensus.js`
- Modify: `tests/ip-consensus-race.test.js`
- Modify: `tests/ip-consensus-groups.test.js`

**Interfaces:**
- Produces: `isStrongVote(vote) -> boolean`, where `vote` is the object returned by `countVotes()`.
- `canGuaranteeStrong({sources, pendingCount})` remains public and must call the same rule under a worst-case denominator.
- `runIpConsensusProgressive()` keeps its existing result shape, except reserve fields added in Task 2.

- [ ] **Step 1: Write RED truth-table tests for final Strong**

Add to `tests/ip-consensus-race.test.js`:

```js
import { countVotes, isStrongVote, canGuaranteeStrong } from '../assets/ip-consensus-race.js';

test('Strong requires at least three votes for one address', () => {
  assert.equal(isStrongVote(countVotes([
    ok('a','1.1.1.1'), ok('b','1.1.1.1'), ok('c','2.2.2.2')
  ])), false);
  assert.equal(isStrongVote(countVotes([
    ok('a','1.1.1.1'), ok('b','1.1.1.1'), ok('c','1.1.1.1')
  ])), true);
});

test('Strong uses a two-thirds winner share after the minimum-vote gate', () => {
  const matrix = [
    { votes:['A','A','A','B'], expected:true },
    { votes:['A','A','A','B','B'], expected:false },
    { votes:['A','A','A','A','B','B'], expected:true }
  ];
  for (const [index, row] of matrix.entries()) {
    const vote = countVotes(row.votes.map((address, i) => ok(`${index}-${i}`, address)));
    assert.equal(isStrongVote(vote), row.expected);
  }
});
```

- [ ] **Step 2: Write RED final-consensus regression**

Change the existing test `2-1 with exactly three successful groups is Strong under two-thirds rule` in `tests/ip-consensus-groups.test.js` to:

```js
test('2-1 with exactly three successful groups is not Strong', async () => {
  const result = await runIpConsensus({
    family:4,
    primaryGroups:['a','b','c'].map((id) => group(id)),
    reserveGroups:[], timeoutMs:100,
    fetchImpl:fixtureFetch({ a:'203.0.113.1', b:'203.0.113.1', c:'203.0.113.2' })
  });
  assert.equal(result.confidence, 'no-consensus');
  assert.equal(result.address, null);
  assert.equal(result.agreement.selectedVotes, 2);
  assert.equal(result.agreement.winningShare, 2 / 3);
});
```

- [ ] **Step 3: Run RED**

Run:

```bash
node --test tests/ip-consensus-race.test.js tests/ip-consensus-groups.test.js
```

Expected: FAIL because `isStrongVote` does not exist and the old final evaluator still marks `2:1` Strong.

- [ ] **Step 4: Implement the canonical predicate**

In `assets/ip-consensus-race.js` add:

```js
export function isStrongVote(vote) {
  return vote.selectedVotes >= 3 && vote.winningShare >= (2 / 3);
}
```

Refactor `canGuaranteeStrong()` so it applies the same rule to the current leader with a worst-case denominator:

```js
export function canGuaranteeStrong({ sources = [], pendingCount = 0 }) {
  const vote = countVotes(sources);
  if (vote.selectedVotes < 3) return false;
  const worstCaseSuccessful = vote.successful.length + Math.max(0, pendingCount);
  const worstCaseVote = {
    ...vote,
    winningShare: worstCaseSuccessful ? vote.selectedVotes / worstCaseSuccessful : 0
  };
  return isStrongVote(worstCaseVote);
}
```

- [ ] **Step 5: Make final evaluation reuse it**

In `assets/ip-consensus.js` import `isStrongVote` and replace:

```js
const strong = vote.successful.length >= 3 && vote.winningShare >= (2 / 3);
```

with:

```js
const strong = isStrongVote(vote);
```

Do not change `partial` in this step.

- [ ] **Step 6: Run GREEN**

```bash
node --test tests/ip-consensus-race.test.js tests/ip-consensus-groups.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add assets/ip-consensus-race.js assets/ip-consensus.js tests/ip-consensus-race.test.js tests/ip-consensus-groups.test.js
git commit -m "fix: unify public IP strong consensus rule"
```

---

### Task 2: Explicit reserve lifecycle

**Files:**
- Modify: `assets/ip-consensus.js`
- Modify: `assets/provider-evidence.js`
- Modify: `tests/ip-consensus-groups.test.js`
- Modify: `tests/provider-evidence.test.js`

**Interfaces:**
- `result.reserve` becomes `{ attempted:boolean, contributed:boolean, notNeeded:boolean, sources:Source[] }`.
- For compatibility during this branch, `used` may remain only as a deprecated alias for `attempted`; production copy must not render `used`.
- `buildIpProviderEvidence()` produces reserve summary text from these explicit fields.

- [ ] **Step 1: Write RED reserve-state tests**

Add to `tests/ip-consensus-groups.test.js`:

```js
test('failed reserve is attempted but does not contribute', async () => {
  const result = await runIpConsensus({
    family:4,
    primaryGroups:['a','b','c'].map((id) => group(id)),
    reserveGroups:[group('reserve','reserve')], timeoutMs:100,
    fetchImpl:fixtureFetch({ a:'203.0.113.1', b:'203.0.113.1' })
  });
  assert.equal(result.reserve.attempted, true);
  assert.equal(result.reserve.contributed, false);
  assert.equal(result.reserve.notNeeded, false);
});

test('reserve response that participates in final vote is contributed', async () => {
  const result = await runIpConsensus({
    family:4,
    primaryGroups:['a','b','c','d','e'].map((id) => group(id)),
    reserveGroups:[group('reserve','reserve')], timeoutMs:100,
    fetchImpl:fixtureFetch({
      a:'203.0.113.1', b:'203.0.113.1', c:'203.0.113.1',
      d:'203.0.113.2', e:'203.0.113.2', reserve:'203.0.113.1'
    })
  });
  assert.equal(result.reserve.attempted, true);
  assert.equal(result.reserve.contributed, true);
});

test('reserve aborted after guaranteed consensus is not needed', async () => {
  const result = await runIpConsensusProgressive({
    family:4,
    primaryGroups:['a','b','c','d'].map((id) => group(id)),
    reserveGroups:[group('reserve','reserve')], timeoutMs:500,
    fetchImpl:hangingFetch({ a:'31.76.17.233', b:'31.76.17.233', c:'31.76.17.233', d:'31.76.17.233', reserve:'hang' })
  });
  assert.equal(result.reserve.notNeeded, true);
  assert.equal(result.reserve.contributed, false);
});
```

- [ ] **Step 2: Write RED presentation tests**

Add to `tests/provider-evidence.test.js` exact expectations:

```js
test('failed reserve says attempted, not used', () => {
  const view = buildIpProviderEvidence({
    address:'1.1.1.1', confidence:'partial',
    agreement:{available:2,total:3,selectedVotes:2,winningShare:1,counts:{'1.1.1.1':2}},
    primary:{available:2,total:2,sources:[]},
    reserve:{attempted:true,contributed:false,notNeeded:false,sources:[{id:'r',tier:'reserve',status:'unavailable',error:'Load failed'}]},
    sources:[]
  });
  assert.match(view.summary, /reserve attempted/i);
  assert.doesNotMatch(view.summary, /reserve used/i);
});
```

- [ ] **Step 3: Run RED**

```bash
node --test tests/ip-consensus-groups.test.js tests/provider-evidence.test.js
```

Expected: FAIL because explicit reserve lifecycle fields do not exist.

- [ ] **Step 4: Implement lifecycle derivation**

In `buildFinalResult()` derive:

```js
const reserveAttempted = reserveSources.some((source) => ['complete','unavailable'].includes(source.status));
const reserveContributed = reserveSources.some((source) => source.status === 'complete' && Boolean(source.address));
const reserveNotNeeded = reserveSources.length > 0 && reserveSources.every((source) => ['not-needed','disabled'].includes(source.status));
```

Return:

```js
reserve: {
  attempted: reserveAttempted,
  contributed: reserveContributed,
  notNeeded: reserveNotNeeded,
  used: reserveAttempted,
  sources: reserveSources
}
```

- [ ] **Step 5: Replace provider-evidence copy**

In `assets/provider-evidence.js` replace the `reserve used` branch with explicit suffix construction:

```js
function reserveSummary(result) {
  if (result.reserve?.contributed) return 'reserve contributed';
  if (result.reserve?.attempted) return 'reserve attempted';
  if (result.reserve?.notNeeded) return 'reserve not needed';
  return null;
}
```

For Strong/Partial summaries append this phrase only when non-null. Remove `reserveUnavailable()` once no longer referenced.

- [ ] **Step 6: Run GREEN**

```bash
node --test tests/ip-consensus-groups.test.js tests/provider-evidence.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add assets/ip-consensus.js assets/provider-evidence.js tests/ip-consensus-groups.test.js tests/provider-evidence.test.js
git commit -m "fix: expose reserve lifecycle explicitly"
```

---

### Task 3: Strict-majority GeoIP field voting

**Files:**
- Create: `assets/geoip-votes.js`
- Modify: `assets/geoip.js`
- Modify: `tests/geoip.test.js`
- Create: `tests/geoip-votes.test.js`

**Interfaces:**
- Produces: `summarizeFieldVotes(values, { keyOf, labelOf } = {}) -> { state, usable, counts, winnerKey, winnerLabel, winnerVotes, winnerShare, outliers }`.
- States: `unavailable | single-source | agree | majority | unresolved`.
- GeoIP result adds `votes: { country, location, timezone }`.
- `result.country/countryCode`, `result.city/region`, and `result.timezone` are populated only when the respective vote state has a selected winner (`single-source`, `agree`, `majority`).

- [ ] **Step 1: Write RED pure vote tests**

Create `tests/geoip-votes.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeFieldVotes } from '../assets/geoip-votes.js';

const identity = (value) => value;

test('3-1 produces a majority winner with an outlier', () => {
  const result = summarizeFieldVotes(['DE','DE','DE','GB'], { keyOf:identity, labelOf:identity });
  assert.equal(result.state, 'majority');
  assert.equal(result.winnerKey, 'DE');
  assert.equal(result.winnerVotes, 3);
  assert.equal(result.usable, 4);
  assert.deepEqual(result.outliers, [{ key:'GB', label:'GB', votes:1 }]);
});

test('2-2 is unresolved and selects nothing', () => {
  const result = summarizeFieldVotes(['DE','DE','GB','GB'], { keyOf:identity, labelOf:identity });
  assert.equal(result.state, 'unresolved');
  assert.equal(result.winnerKey, null);
});

test('2-1-1 is unresolved because plurality is not a strict majority', () => {
  const result = summarizeFieldVotes(['DE','DE','GB','FR'], { keyOf:identity, labelOf:identity });
  assert.equal(result.state, 'unresolved');
  assert.equal(result.winnerShare, 0.5);
});
```

- [ ] **Step 2: Write RED GeoIP integration tests**

Add to `tests/geoip.test.js` fixtures asserting:

```js
assert.equal(result.votes.country.state, 'majority');
assert.equal(result.countryCode, 'DE');
assert.equal(result.votes.country.winnerVotes, 3);
assert.equal(result.votes.country.usable, 4);
```

for `DE,DE,DE,GB`, and:

```js
assert.equal(result.votes.location.state, 'unresolved');
assert.equal(result.city, null);
assert.equal(result.region, null);
```

when every usable provider reports a different city/region tuple.

- [ ] **Step 3: Run RED**

```bash
node --test tests/geoip-votes.test.js tests/geoip.test.js
```

Expected: FAIL because the vote module/result fields do not exist and `voteValue()` still selects first plurality/tie winners.

- [ ] **Step 4: Implement the pure vote aggregator**

Create `assets/geoip-votes.js` with deterministic normalization, stable count ordering, and strict-majority selection:

```js
export function summarizeFieldVotes(values = [], { keyOf = (value) => value, labelOf = (value) => String(value) } = {}) {
  const buckets = new Map();
  for (const value of values) {
    if (value == null) continue;
    const key = keyOf(value);
    if (key == null || key === '') continue;
    const label = labelOf(value);
    const bucket = buckets.get(key) ?? { key, label, votes:0 };
    bucket.votes += 1;
    buckets.set(key, bucket);
  }
  const ranked = [...buckets.values()].sort((a,b) => b.votes - a.votes || String(a.key).localeCompare(String(b.key)));
  const usable = ranked.reduce((sum, item) => sum + item.votes, 0);
  const leader = ranked[0] ?? null;
  const winnerShare = usable && leader ? leader.votes / usable : 0;
  const state = usable === 0 ? 'unavailable'
    : usable === 1 ? 'single-source'
      : ranked.length === 1 ? 'agree'
        : winnerShare > 0.5 ? 'majority'
          : 'unresolved';
  const selected = ['single-source','agree','majority'].includes(state) ? leader : null;
  return {
    state,
    usable,
    counts: ranked,
    winnerKey: selected?.key ?? null,
    winnerLabel: selected?.label ?? null,
    winnerVotes: selected?.votes ?? 0,
    winnerShare,
    outliers: selected ? ranked.filter((item) => item.key !== selected.key) : ranked
  };
}
```

- [ ] **Step 5: Integrate country votes with existing alias normalization**

In `assets/geoip.js`, build country vote inputs from complete sources that contain usable country evidence and use `countryEvidenceKey(result, aliases)` as `keyOf`. Preserve a representative complete source for selected country fields rather than independently voting `country` and `countryCode`.

For location, vote on canonical `(city,region)` tuples only when at least one of those fields exists. For timezone, vote normalized timezone strings.

Return:

```js
votes: {
  country: countryVote,
  location: locationVote,
  timezone: timezoneVote
}
```

and derive `agreement.countryState/locationState` compatibly:

- `agree` -> `agree`
- `single-source` -> `single-source`
- `majority` -> `disagree` (there is at least one outlier)
- `unresolved` -> `disagree`
- `unavailable` -> `unavailable`

- [ ] **Step 6: Prevent arbitrary field selection**

Remove `voteValue()` use for country/city/region/timezone. Select values from the representative source matching the winning key only when vote state is selectable. If location is `unresolved`, return `city:null, region:null`; if timezone is `unresolved`, return `timezone:null`.

ASN/org may retain existing plurality behavior because this task's verdict semantics do not depend on them; document that in code with a one-line comment.

- [ ] **Step 7: Run GREEN**

```bash
node --test tests/geoip-votes.test.js tests/geoip.test.js tests/geoip-country-normalization.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit Task 3**

```bash
git add assets/geoip-votes.js assets/geoip.js tests/geoip-votes.test.js tests/geoip.test.js
git commit -m "fix: use strict majority for GeoIP metadata"
```

---

### Task 4: Transparent GeoIP evidence and concise hero summary

**Files:**
- Modify: `assets/geoip-evidence.js`
- Modify: `assets/geoip-evidence-render.js`
- Modify: `assets/dashboard-view.js`
- Modify: `tests/geoip-evidence.test.js`
- Modify: `tests/geoip-evidence-render.test.js`
- Modify: `tests/dashboard-view.test.js`

**Interfaces:**
- `buildGeoIpEvidence()` adds `reached`, `usableCountry`, `usableLocation`, `countryVote`, `locationVote`, `timezoneVote`.
- `geoNotice.details` may include quantitative majority/outlier context, but reason code/severity remains canonical.
- Main hero copy for country majority/outlier must be concise: `GeoIP majority: Germany 3/4 · 1 provider differs`.

- [ ] **Step 1: Write RED evidence-count tests**

Add to `tests/geoip-evidence.test.js`:

```js
test('evidence separates reached providers from usable country and location data', () => {
  const view = buildGeoIpEvidence({
    ip:'31.76.17.233',
    votes:{
      country:{state:'majority',usable:4,winnerLabel:'Germany',winnerVotes:3,winnerShare:0.75,outliers:[{key:'code:gb',label:'United Kingdom',votes:1}]},
      location:{state:'unresolved',usable:4,winnerLabel:null,winnerVotes:0,winnerShare:0.25,outliers:[]},
      timezone:{state:'majority',usable:4,winnerLabel:'Europe/Berlin',winnerVotes:3,winnerShare:0.75,outliers:[{key:'europe/london',label:'Europe/London',votes:1}]}
    },
    sources:[
      {status:'complete',country:'Germany',city:'Neu-Isenburg',region:'Hesse'},
      {status:'complete',country:'Germany',city:'Frankfurt',region:'Hessen'},
      {status:'complete',country:'Germany',city:'Frankfurt',region:'Hesse'},
      {status:'complete'},
      {status:'complete',country:'United Kingdom',city:'Whitehaven',region:'Cumbria'}
    ]
  });
  assert.equal(view.reached, 5);
  assert.equal(view.usableCountry, 4);
  assert.equal(view.usableLocation, 4);
  assert.equal(view.countryVote.state, 'majority');
  assert.equal(view.locationVote.state, 'unresolved');
});
```

Note: build the fixture so exactly four sources contain usable country/location values; the fifth represents a reached-but-unusable provider.

- [ ] **Step 2: Write RED renderer tests**

Assert Advanced contains:

```text
Providers reached 5/5
Usable country data 4/5
Country vote Germany 3/4 · United Kingdom 1/4
Location state Unresolved
```

and individual provider rows still show exact normalized values/latency.

- [ ] **Step 3: Write RED hero tests**

In `tests/dashboard-view.test.js`, for 3 Germany / 1 UK:

```js
assert.equal(view.primary.geoNotice.code, 'GEO_COUNTRY_DISAGREEMENT');
assert.equal(view.primary.geoNotice.severity, 'review');
assert.equal(view.primary.geoNotice.shortSummary, 'GeoIP majority: Germany 3/4 · 1 provider differs');
```

For unresolved location only:

```js
assert.equal(view.primary.geoNotice.shortSummary, 'GeoIP location unresolved');
assert.equal(view.primary.geoNotice.severity, 'info');
```

- [ ] **Step 4: Run RED**

```bash
node --test tests/geoip-evidence.test.js tests/geoip-evidence-render.test.js tests/dashboard-view.test.js
```

Expected: FAIL because reached/usable/vote summaries and `shortSummary` do not exist.

- [ ] **Step 5: Extend evidence model**

In `assets/geoip-evidence.js` calculate:

```js
const reached = rows.filter((row) => row.status === 'complete').length;
const usableCountry = rows.filter((row) => row.status === 'complete' && row.countryRelation !== 'missing').length;
const usableLocation = rows.filter((row) => row.status === 'complete' && row.locationRelation !== 'missing').length;
```

Prefer `result.votes.*` as the authoritative field-vote objects. Return configured `total` separately from `reached`.

- [ ] **Step 6: Render vote distributions**

In `assets/geoip-evidence-render.js` add overview rows:

```text
Providers reached
Usable country data
Usable location data
Country state
Country vote
Location state
Location vote
Timezone state
Timezone vote
```

Use a helper that formats `counts` deterministically as `Label N/usable` and uses `Unresolved` when there is no winner.

- [ ] **Step 7: Add concise hero summaries**

In `assets/dashboard-view.js`, when country vote state is `majority` and outliers exist, attach:

```js
shortSummary: `GeoIP majority: ${winnerLabel} ${winnerVotes}/${usable} · ${outlierVotes} provider${outlierVotes === 1 ? '' : 's'} differ${outlierVotes === 1 ? 's' : ''}`
```

For country `unresolved`, use `GeoIP country unresolved`; for location-only unresolved/disagreement use `GeoIP location unresolved` or existing specific informational wording.

Keep `Review` for any country outlier/unresolved state through `GEO_COUNTRY_DISAGREEMENT`.

- [ ] **Step 8: Run GREEN**

```bash
node --test tests/geoip-evidence.test.js tests/geoip-evidence-render.test.js tests/dashboard-view.test.js tests/assessment.test.js
```

Expected: PASS.

- [ ] **Step 9: Commit Task 4**

```bash
git add assets/geoip-evidence.js assets/geoip-evidence-render.js assets/dashboard-view.js tests/geoip-evidence.test.js tests/geoip-evidence-render.test.js tests/dashboard-view.test.js
git commit -m "feat: expose quantitative GeoIP vote evidence"
```

---

### Task 5: Reverse-DNS record-state semantics

**Files:**
- Modify: `assets/reverse-dns.js`
- Test: `tests/reverse-dns.test.js`
- Modify: `assets/app.js`

**Interfaces:**
- `runReverseDns()` returns `agreement: { reached, total, recordsAvailable, recordSources, state }`.
- `state` is `unavailable | no-record | single-source | agree | disagree`.
- Legacy `agreement.available` may remain as alias for `reached`; legacy `agreement.agree` is `true/false/null` only for `agree/disagree` states.

- [ ] **Step 1: Write RED PTR state tests**

Create/extend `tests/reverse-dns.test.js`:

```js
test('two reachable resolvers with no PTR record are no-record, not agree', async () => {
  const result = await runReverseDns({
    ip:'203.0.113.10',
    resolvers:[resolver('a'), resolver('b')],
    timeoutMs:100,
    fetchImpl:fixtureDns({ a:{Status:0,Answer:[]}, b:{Status:0,Answer:[]} })
  });
  assert.equal(result.agreement.reached, 2);
  assert.equal(result.agreement.recordsAvailable, 0);
  assert.equal(result.agreement.state, 'no-record');
  assert.equal(result.agreement.agree, null);
});

test('matching PTR records from two resolvers are agree', async () => {
  // both return ptr.example.
  assert.equal(result.agreement.state, 'agree');
});

test('different PTR records are disagree', async () => {
  assert.equal(result.agreement.state, 'disagree');
});
```

Use the existing test helper style in the repository; if no helper exists, define small `resolver()` and `fixtureDns()` functions in the test file.

- [ ] **Step 2: Run RED**

```bash
node --test tests/reverse-dns.test.js
```

Expected: FAIL because current two-empty-answer result has `agree:true`.

- [ ] **Step 3: Implement explicit PTR state**

In `assets/reverse-dns.js` derive:

```js
const reachedSources = sources.filter((source) => source.status === 'complete');
const recordSources = reachedSources.filter((source) => source.names.length > 0);
const distinctRecords = new Set(recordSources.map((source) => source.names.slice().sort().join('|')));
let state;
if (reachedSources.length === 0) state = 'unavailable';
else if (recordSources.length === 0) state = 'no-record';
else if (recordSources.length === 1) state = 'single-source';
else state = distinctRecords.size === 1 ? 'agree' : 'disagree';
```

Return explicit counts and compatibility aliases.

- [ ] **Step 4: Fix Advanced PTR wording**

In `assets/app.js`, replace any `0/2 · agree` construction with a formatter:

```js
function ptrSummary(result) {
  const agreement = result?.agreement;
  if (!agreement) return 'Unavailable';
  if (agreement.state === 'unavailable') return `0/${agreement.total} resolvers reached`;
  if (agreement.state === 'no-record') return `${agreement.reached}/${agreement.total} resolvers reached · PTR record not found`;
  if (agreement.state === 'single-source') return `${agreement.recordSources}/${agreement.total} resolver returned a PTR record`;
  return `${agreement.recordSources}/${agreement.total} PTR sources · ${agreement.state}`;
}
```

- [ ] **Step 5: Run GREEN**

```bash
node --test tests/reverse-dns.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit Task 5**

```bash
git add assets/reverse-dns.js assets/app.js tests/reverse-dns.test.js
git commit -m "fix: distinguish PTR absence from agreement"
```

---

### Task 6: End-to-end copy guards, docs, review, PR, CI/CD

**Files:**
- Modify: `scripts/validate-static.mjs`
- Modify: `README.md`
- Modify tests as needed only to encode already-designed behavior

**Interfaces:**
- No new runtime interfaces. This task proves and documents the integrated behavior.

- [ ] **Step 1: Add static copy/contract guards**

In `scripts/validate-static.mjs` assert production code no longer contains ambiguous phrases:

```js
for (const obsolete of ['reserve used', '0/2 · agree']) {
  if (appSource.includes(obsolete) || providerEvidenceSource.includes(obsolete)) {
    throw new Error(`Obsolete diagnostic wording remains: ${obsolete}`);
  }
}
```

Also assert `isStrongVote` is imported/used by `assets/ip-consensus.js`, and `assets/geoip.js` imports the strict-majority vote module.

- [ ] **Step 2: Update README with exact semantics**

Document:

```text
Public IP Strong = at least 3 votes for one address AND at least 2/3 of successful provider groups.
Reserve attempted = a reserve request ran.
Reserve contributed = a reserve provider returned a usable address that entered the final vote set.
Reserve not needed = consensus was guaranteed before reserve completion.
GeoIP majority = >50% of usable values for that field; plurality/ties do not select a value.
Country outlier/unresolved = Review metadata inconsistency, not a confirmed VPN leak.
PTR no-record = resolvers were reachable but no PTR record was published; it is not agreement.
```

- [ ] **Step 3: Run focused regression**

```bash
node --test \
  tests/ip-consensus-race.test.js \
  tests/ip-consensus-groups.test.js \
  tests/provider-evidence.test.js \
  tests/geoip-votes.test.js \
  tests/geoip.test.js \
  tests/geoip-evidence.test.js \
  tests/geoip-evidence-render.test.js \
  tests/dashboard-view.test.js \
  tests/assessment.test.js \
  tests/reverse-dns.test.js
```

Expected: all PASS.

- [ ] **Step 4: Run full repository verification**

```bash
npm run check
```

Expected: all tests PASS, static validation PASS, `_site` build succeeds.

- [ ] **Step 5: Final diff review against `main`**

Verify explicitly:

- Core provider list unchanged.
- `coreIpTimeoutMs` remains `3200`.
- ident hedge remains `900`.
- No workflow changes unless CI itself requires a correction discovered by tests.
- `2:1` Public IP no longer becomes Strong.
- `3:0`, `3:1`, `4:2` remain Strong; `3:2` remains not Strong.
- Reserve copy cannot call a failed request `used`/`contributed`.
- GeoIP tie/plurality cannot select arbitrary first city/country/timezone.
- 3 Germany / 1 UK remains Review and main copy states the majority quantitatively.
- PTR empty answers cannot render `agree`.

Fix any Critical/Important finding and rerun `npm run check` before PR.

- [ ] **Step 6: Create PR to `main`**

Title:

```text
Make consensus and evidence semantics transparent
```

Body must list the Public IP rule correction, GeoIP strict-majority model, reserve lifecycle, PTR states, concise main copy, Advanced evidence, and exact verification HEAD.

- [ ] **Step 7: Require exact-head PR CI success**

Confirm the `Test` workflow on the exact PR HEAD completes with `conclusion: success` and its `npm run check` step is green.

- [ ] **Step 8: Squash merge**

Merge only if PR remains mergeable and exact-head CI is green.

- [ ] **Step 9: Verify post-merge `main` CI/CD**

On the exact merge SHA confirm:

- `Test` workflow: `success`.
- `Deploy Pages` build job: `success`, including `npm run check` and artifact upload.
- `Deploy Pages` deploy job: `success`.
- GitHub Pages source remains workflow-based from `main` with HTTPS enforced.

- [ ] **Step 10: Report expected production behavior**

For the user's observed IP case, report the expected UI explicitly:

```text
Public IP: Strong consensus
GeoIP: Review — majority Germany 3/4 usable country providers; 1 provider differs (United Kingdom)
Location: unresolved if no city/region tuple has >50% of usable location votes
Reserve: attempted/contributed/not-needed according to actual result
PTR: resolver reachability and record availability shown separately
```

---

## Plan Self-Review

- Spec coverage: Public IP rule consistency, reserve semantics, GeoIP strict majority, outlier Review behavior, concise/Advanced transparency split, PTR states, and CI/CD rollout are all mapped to Tasks 1–6.
- Placeholder scan: no TBD/TODO/fill-later steps remain.
- Type consistency: `isStrongVote`, `reserve.attempted/contributed/notNeeded`, `votes.country/location/timezone`, and reverse-DNS `agreement.state` are defined before use.
- Scope check: provider inventories, Core timings, hedging, concurrency, and workflows are preserved unless correctness/CI requires a targeted change.
