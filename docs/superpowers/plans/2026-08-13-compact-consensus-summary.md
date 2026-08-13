# Compact Consensus Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the main Public IP summary show only the consensus that actually formed, while keeping reserve/configured-provider mechanics in Advanced diagnostics.

**Architecture:** Change only the presentation logic in `assets/dashboard-view.js`. The main card will format Strong consensus from `agreement.selectedVotes` and `agreement.available`, and append reserve text only when `reserve.contributed === true`. Advanced provider evidence remains unchanged and continues to expose configured/responded/not-needed/attempted/contributed states.

**Tech Stack:** Static ES modules, Node.js >=22, `node:test`, GitHub Actions, GitHub Pages.

## Global Constraints

- This is presentation-only; do not modify consensus math, provider lists, timeouts, hedging, early-finish, or reserve execution.
- Strong main copy is `Strong consensus · N/N agree` using successful usable votes as the denominator.
- Do not show configured-primary denominator on the main card.
- Do not show `reserve attempted` or `reserve not needed` on the main card.
- Show `reserve contributed` on the main card only when `reserve.contributed === true`.
- Advanced diagnostics must retain full reserve/provider lifecycle transparency.
- Full verification command is `npm run check`.

---

## File Structure

- Modify `assets/dashboard-view.js` — compact main-card Public IP consensus text.
- Modify `tests/dashboard-view.test.js` — exact main-card copy contracts.
- Modify `tests/provider-evidence.test.js` only if needed to pin Advanced lifecycle transparency; no production Advanced change is expected.

---

### Task 1: Compact main-card consensus text

**Files:**
- Modify: `tests/dashboard-view.test.js`
- Modify: `assets/dashboard-view.js`

**Interfaces:**
- Consumes existing IP result shape: `agreement.available`, `agreement.selectedVotes`, `reserve.contributed`.
- Produces unchanged `buildConnectionView(...).primary.sourceText` string.

- [ ] **Step 1: Write failing main-card tests**

Add these tests to `tests/dashboard-view.test.js`:

```js
test('Strong main summary shows only successful vote consensus', () => {
  const view = buildConnectionView({
    ipv4:{
      ...ip4,
      agreement:{...ip4.agreement,available:4,total:5,selectedVotes:4},
      primary:{available:4,total:5,sources:[]},
      reserve:{attempted:false,contributed:false,notNeeded:true,used:false,sources:[]}
    },
    ipv6:noIp6
  });
  assert.equal(view.primary.sourceText, 'Strong consensus · 4/4 agree');
});

test('Strong main summary hides failed reserve attempt', () => {
  const view = buildConnectionView({
    ipv4:{
      ...ip4,
      agreement:{...ip4.agreement,available:4,total:6,selectedVotes:4},
      reserve:{attempted:true,contributed:false,notNeeded:false,used:true,sources:[{status:'unavailable'}]}
    },
    ipv6:noIp6
  });
  assert.equal(view.primary.sourceText, 'Strong consensus · 4/4 agree');
});

test('Strong main summary mentions reserve only when it contributed', () => {
  const view = buildConnectionView({
    ipv4:{
      ...ip4,
      agreement:{...ip4.agreement,available:4,total:6,selectedVotes:4},
      reserve:{attempted:true,contributed:true,notNeeded:false,used:true,sources:[{status:'complete',address:ip4.address}]}
    },
    ipv6:noIp6
  });
  assert.equal(view.primary.sourceText, 'Strong consensus · 4/4 agree · reserve contributed');
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
node --test tests/dashboard-view.test.js
```

Expected: the new tests FAIL because current `sourceText()` still emits `4/5 primary responded` and reserve lifecycle suffixes.

- [ ] **Step 3: Implement minimal presentation fix**

In `assets/dashboard-view.js`, replace main-card reserve formatting with a contribution-only helper:

```js
function mainReserveText(ip) {
  return ip?.reserve?.contributed ? 'reserve contributed' : null;
}
```

Inside `sourceText(ip)`, remove `primaryAvailable` / `primaryTotal` from the Strong path and format it as:

```js
const reserve = mainReserveText(ip);

if (confidence === 'strong') {
  return `Strong consensus · ${selectedVotes}/${available} agree${reserve ? ` · ${reserve}` : ''}`;
}
```

For `partial` and fallback/no-consensus presentation, do not append `reserve attempted` or `reserve not needed`; append `reserve contributed` only if it is actually useful and already represented by `mainReserveText(ip)`. Do not change confidence calculation or authoritative-address logic.

- [ ] **Step 4: Run GREEN**

Run:

```bash
node --test tests/dashboard-view.test.js
```

Expected: all dashboard-view tests PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add assets/dashboard-view.js tests/dashboard-view.test.js
git commit -m "fix: simplify main consensus summary"
```

---

### Task 2: Preserve Advanced transparency and ship

**Files:**
- Test: `tests/provider-evidence.test.js`
- No production Advanced file changes expected.

**Interfaces:**
- `buildIpProviderEvidence(result)` must continue exposing reserve lifecycle and configured/responded provider detail independently of the main-card summary.

- [ ] **Step 1: Add/confirm Advanced regression assertions**

Ensure `tests/provider-evidence.test.js` covers all three reserve lifecycle states with exact evidence semantics:

```js
assert.match(attemptedView.summary, /reserve attempted/i);
assert.match(contributedView.summary, /reserve contributed/i);
assert.equal(notNeededView.reserve.notNeeded, true);
```

Also keep existing primary `available/total` evidence assertions so Advanced can still explain cases such as 4 responses from 5 configured primary groups.

- [ ] **Step 2: Run focused regression**

Run:

```bash
node --test tests/dashboard-view.test.js tests/provider-evidence.test.js tests/ip-consensus-race.test.js tests/ip-consensus-groups.test.js
```

Expected: all PASS. Public IP consensus math tests must remain unchanged.

- [ ] **Step 3: Run complete repository verification**

Run:

```bash
npm run check
```

Expected: all tests PASS, static validation PASS, `_site` build succeeds.

- [ ] **Step 4: Review diff against `main`**

Verify explicitly:

- production change is limited to presentation code in `assets/dashboard-view.js`;
- no changes to `assets/ip-consensus.js`, `assets/ip-consensus-race.js`, `assets/config.js`, `assets/ip-provider-group.js`, or workflows;
- main Strong copy is exactly `Strong consensus · N/N agree`;
- main does not contain `primary responded`, `reserve attempted`, or `reserve not needed`;
- `reserve contributed` remains possible on main;
- Advanced provider evidence still contains lifecycle detail.

- [ ] **Step 5: Create PR to `main`**

Use title:

```text
Simplify main consensus summary
```

PR body must state that this is presentation-only and that full provider lifecycle remains in Advanced.

- [ ] **Step 6: Require exact-head PR CI success**

Confirm the PR-triggered `Test` workflow is `success` on the exact branch HEAD.

- [ ] **Step 7: Squash merge**

Merge only after clean review and green exact-head CI.

- [ ] **Step 8: Verify post-merge `main` CI/CD**

On the exact merge SHA confirm:

- `Test` workflow: `success`;
- `Deploy Pages` build: `success`, including `npm run check`;
- `Deploy Pages` deploy: `success`.

---

## Plan Self-Review

- Spec coverage: main 4/4 copy, reserve-contribution-only main suffix, Advanced lifecycle preservation, presentation-only scope, tests, and rollout are covered.
- Placeholder scan: no TBD/TODO/incomplete implementation steps remain.
- Type consistency: all fields (`agreement.available`, `agreement.selectedVotes`, `reserve.contributed`) already exist in current production result/view contracts.
- Scope check: no consensus/network implementation file is scheduled for modification.
