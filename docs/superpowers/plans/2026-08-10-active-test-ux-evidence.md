# Active Test UX + Provider Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every interactive VPN/privacy test self-explanatory, visibly timed, and explicit about its final result, while exposing per-provider public-IP consensus evidence in Advanced diagnostics.

**Architecture:** Add a small pure presentation-model layer for Active test status/timing/result copy plus an injectable presentation ticker that updates clocks without launching network work. Keep Aggressive/Guided/Kill Switch diagnostic engines unchanged except for additive monitor timing/sample metadata; move the media-permission WebRTC UI into its own Active-test disclosure while continuing to use the existing Guided profile/session baseline internally. Add a separate pure provider-evidence helper that renders already-collected `ipv4.sources` / `ipv6.sources` without extra requests.

**Tech Stack:** Static HTML/CSS, browser ES modules, native `details/summary`, existing diagnostic modules, Node.js >=22 `node:test`, GitHub Pages CI.

## Global Constraints

- Product UI copy remains concise English.
- Conversation/docs may explain behavior in Russian, but shipped UI stays English.
- Existing leak-classification rules and verdict hierarchy remain unchanged.
- Guided verdict precedence remains `REAL IP LEAK DETECTED` > `UNEXPECTED PUBLIC IP DETECTED` > `REVIEW` > `TEST INCONCLUSIVE` > `NO KNOWN REAL IP OBSERVED`.
- Aggressive final results remain exactly `Leak detected`, `No unexpected IP observed`, or `Inconclusive`.
- Presentation timers never schedule or accelerate network diagnostics.
- Guided/Aggressive 60-second countdown starts from the existing underlying `startedAt`/`endsAt`; while the baseline phase is still running and `endsAt` is null, UI says `Preparing baseline…` instead of inventing a countdown.
- Kill Switch has elapsed time, not a fixed ETA.
- WebRTC Permission Check has elapsed time, not a fake ETA.
- Collapsing any Active-test disclosure never starts or stops the test.
- WebRTC Permission Check becomes a separate fourth Active-test row but continues to share the current Guided `sessionStorage` profile internally.
- If no Guided baseline exists, WebRTC Permission Check must explicitly say it cannot prove a public address is the user's known pre-VPN IP.
- `guidedLeak.media` remains in Copy JSON for schema compatibility.
- Public-IP provider evidence uses the already-collected consensus `sources`; it performs zero additional IP-discovery requests.
- A timed-out/failed/wrong-family provider is `Unavailable`, never `differs`.
- A successful provider that returns a valid different address is `differs`.
- Provider disagreement is evidence/diagnostic detail and does not independently change leak severity.
- No frontend framework or dependency is added.
- Full `npm run check` must pass on the exact final feature HEAD before merge.

---

## File Structure

**Create**
- `assets/active-test-view.js` — pure status/timing/result view models for Guided, Aggressive, Kill Switch and WebRTC Permission Check.
- `assets/presentation-ticker.js` — one injectable UI-only interval controller.
- `assets/provider-evidence.js` — pure mapping from IP consensus result to provider evidence rows.
- `assets/webrtc-media-render.js` — rendering for the now-separate WebRTC Permission Check.
- `tests/active-test-view.test.js`
- `tests/presentation-ticker.test.js`
- `tests/provider-evidence.test.js`
- `tests/active-test-ux.test.js` — static DOM/wiring regressions.

**Modify**
- `index.html` — clearer Active-test purpose copy, live summary statuses, timer/progress/result containers, separate WebRTC row.
- `assets/app.js` — presentation ticker orchestration, Kill Switch/Aggressive live summary state, provider evidence render.
- `assets/aggressive-leak-render.js` — prominent result panel + timer-only renderer.
- `assets/guided-app-runtime.js` — expose Guided stress state to presentation and separate media operation state/rendering while keeping the same report/profile store.
- `assets/guided-leak-render.js` — Guided result panel, summary status, stress timer/progress; remove media rendering responsibility.
- `assets/monitor.js` — additive `successfulSampleCount` and `stoppedAt` so a stopped monitor can distinguish usable clean observation from no usable samples and freeze elapsed time.
- `assets/dashboard.css` — Active-test hierarchy, timers/progress/result panels, provider source rows, mobile stacking.
- `assets/guided-leak.css` — only Guided-specific result/timer spacing that cannot live generically in dashboard CSS.
- `scripts/validate-static.mjs` — require the fourth WebRTC test row/new module files/new status elements.
- `README.md` — explain test differences, WebRTC relationship and provider disagreement evidence.
- Existing targeted tests where source-level assumptions change.

---

### Task 1: Shared Active-Test View Models and Presentation Ticker

**Files:**
- Create: `assets/active-test-view.js`
- Create: `assets/presentation-ticker.js`
- Create: `tests/active-test-view.test.js`
- Create: `tests/presentation-ticker.test.js`

**Interfaces:**

`assets/active-test-view.js` exports:

```js
formatClock(ms) -> string
buildAggressiveTestView(state, nowMs) -> object
buildGuidedTestView({ profile, stressState, stressIsGuided, verdict }, nowMs) -> object
buildMonitorTestView(state, nowMs) -> object
buildMediaWebRtcTestView({ profile, media, mediaRun, mediaExposures }, nowMs) -> object
```

All functions are pure and do not classify addresses beyond consuming existing `relation` values from `mediaExposures`.

`assets/presentation-ticker.js` exports:

```js
createPresentationTicker({ onTick, intervalMs = 250, now = Date.now, setIntervalImpl = setInterval, clearIntervalImpl = clearInterval })
```

returning:

```js
{ sync(activeBoolean), stop(), isRunning() }
```

- [ ] **Step 1: Write failing timing/view-model tests**

Create `tests/active-test-view.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatClock,
  buildAggressiveTestView,
  buildGuidedTestView,
  buildMonitorTestView,
  buildMediaWebRtcTestView
} from '../assets/active-test-view.js';

test('formatClock renders whole-second mm:ss', () => {
  assert.equal(formatClock(0), '00:00');
  assert.equal(formatClock(42_100), '00:42');
  assert.equal(formatClock(61_000), '01:01');
});

test('Aggressive shows baseline preparation before the real 60-second window starts', () => {
  const view = buildAggressiveTestView({ status:'running', startedAt:0, endsAt:null, result:null }, 10_000);
  assert.equal(view.phase, 'preparing');
  assert.equal(view.summaryStatus, 'Preparing baseline…');
  assert.equal(view.remainingText, null);
});

test('Aggressive countdown derives from underlying endsAt', () => {
  const view = buildAggressiveTestView({ status:'running', startedAt:10_000, endsAt:70_000, result:null }, 28_000);
  assert.equal(view.phase, 'running');
  assert.equal(view.remainingText, '00:42 remaining');
  assert.equal(view.progress, 0.3);
});

test('Guided stress uses the same stress deadline and never starts a second timer', () => {
  const view = buildGuidedTestView({
    profile:{ step:'stress' }, stressIsGuided:true,
    stressState:{ status:'running', startedAt:1000, endsAt:61_000 }, verdict:null
  }, 21_000);
  assert.equal(view.summaryStatus, 'Running · 00:40 remaining');
  assert.equal(view.remainingText, '00:40 remaining');
});

test('monitor elapsed time freezes at stoppedAt', () => {
  const state = { running:false, startedAt:'2026-08-10T12:00:00.000Z', stoppedAt:'2026-08-10T12:01:24.000Z', successfulSampleCount:4, sampleCount:4, events:[] };
  const view = buildMonitorTestView(state, Date.parse('2026-08-10T12:10:00.000Z'));
  assert.equal(view.elapsedText, '01:24 elapsed');
  assert.equal(view.resultTone, 'clean');
  assert.equal(view.resultLabel, 'NO IP CHANGE OBSERVED');
});

test('monitor with no usable samples is inconclusive instead of clean', () => {
  const view = buildMonitorTestView({ running:false, startedAt:'2026-08-10T12:00:00.000Z', stoppedAt:'2026-08-10T12:00:15.000Z', successfulSampleCount:0, sampleCount:3, events:[] }, Date.now());
  assert.equal(view.resultTone, 'review');
  assert.equal(view.resultLabel, 'MONITORING INCONCLUSIVE');
});

test('media WebRTC explains standalone classification limits', () => {
  const view = buildMediaWebRtcTestView({
    profile:{ knownReal:{4:[],6:[]}, knownVpn:{4:[],6:[]} },
    media:{ status:'complete', newlyVisible:[{address:'203.0.113.9',classification:'public'}] },
    mediaRun:{ running:false, startedAtMs:1000, completedAtMs:5000 },
    mediaExposures:[{ address:'203.0.113.9', relation:'unknown-public' }]
  }, 5000);
  assert.equal(view.baselineMode, 'standalone');
  assert.equal(view.resultLabel, 'ADDITIONAL PUBLIC WEBRTC IP OBSERVED');
  assert.match(view.resultMessage, /cannot prove/i);
});

test('media WebRTC can identify known real exposure when Guided baseline exists', () => {
  const view = buildMediaWebRtcTestView({
    profile:{ knownReal:{4:['128.71.33.91'],6:[]}, knownVpn:{4:['203.0.113.2'],6:[]} },
    media:{ status:'complete', newlyVisible:[{address:'128.71.33.91',classification:'public'}] },
    mediaRun:{ running:false, startedAtMs:1000, completedAtMs:5000 },
    mediaExposures:[{ address:'128.71.33.91', relation:'known-real' }]
  }, 5000);
  assert.equal(view.baselineMode, 'guided');
  assert.equal(view.resultTone, 'leak');
  assert.equal(view.resultLabel, 'KNOWN REAL IP EXPOSED THROUGH WEBRTC');
});
```

- [ ] **Step 2: Write failing ticker lifecycle test**

Create `tests/presentation-ticker.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPresentationTicker } from '../assets/presentation-ticker.js';

test('presentation ticker starts once, ticks without network semantics, and stops when inactive', () => {
  let callback = null;
  let clearCount = 0;
  const ticks = [];
  const ticker = createPresentationTicker({
    onTick:(nowMs) => ticks.push(nowMs),
    intervalMs:250,
    now:() => 1234,
    setIntervalImpl:(fn, ms) => { assert.equal(ms, 250); callback = fn; return 9; },
    clearIntervalImpl:(id) => { assert.equal(id, 9); clearCount += 1; }
  });

  ticker.sync(true);
  ticker.sync(true);
  assert.equal(ticker.isRunning(), true);
  callback();
  assert.deepEqual(ticks, [1234]);
  ticker.sync(false);
  assert.equal(clearCount, 1);
  assert.equal(ticker.isRunning(), false);
});
```

- [ ] **Step 3: Run tests to verify RED**

Run:

```bash
node --test tests/active-test-view.test.js tests/presentation-ticker.test.js
```

Expected: FAIL because both modules do not exist.

- [ ] **Step 4: Implement `active-test-view.js`**

Core helpers:

```js
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function arraysHaveValues(bucket) { return [4,6].some((family) => (bucket?.[family] ?? []).length > 0); }

export function formatClock(ms) {
  const seconds = Math.max(0, Math.ceil((Number.isFinite(ms) ? ms : 0) / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2,'0')}:${String(rest).padStart(2,'0')}`;
}

export function buildAggressiveTestView(state = {}, nowMs = Date.now()) {
  if (state.status === 'running' && state.endsAt == null) return {
    phase:'preparing', summaryStatus:'Preparing baseline…', remainingText:null, progress:0,
    resultTone:null, resultLabel:null, resultMessage:null
  };
  if (state.status === 'running') {
    const remainingMs = Math.max(0, state.endsAt - nowMs);
    const durationMs = Math.max(1, state.durationMs ?? (state.endsAt - state.startedAt));
    return {
      phase:'running', summaryStatus:`Running · ${formatClock(remainingMs)} remaining`,
      remainingText:`${formatClock(remainingMs)} remaining`,
      progress:clamp((durationMs - remainingMs) / durationMs, 0, 1),
      resultTone:null, resultLabel:null, resultMessage:null
    };
  }
  const result = state.result;
  if (result === 'leak') return { phase:'complete', summaryStatus:'✕ Leak detected', resultTone:'leak', resultLabel:'LEAK DETECTED', resultMessage:state.reasons?.[0] ?? 'An unexpected public IP was observed.' };
  if (result === 'clean') return { phase:'complete', summaryStatus:'✓ No unexpected IP observed', resultTone:'clean', resultLabel:'NO UNEXPECTED IP OBSERVED', resultMessage:state.reasons?.[0] ?? 'No unexpected public IP was observed with sufficient coverage.' };
  if (result === 'inconclusive') return { phase:'complete', summaryStatus:'⚠ Inconclusive', resultTone:'review', resultLabel:'TEST INCONCLUSIVE', resultMessage:state.reasons?.[0] ?? 'Sampling coverage was insufficient for a clean result.' };
  return { phase:'idle', summaryStatus:'Ready · 60 seconds', resultTone:null, resultLabel:null, resultMessage:null };
}
```

Implement Guided using `stressState.endsAt`, profile step and passed verdict only; do not recompute verdict precedence.

Implement Monitor using parsed `startedAt`/`stoppedAt`. Final mapping:

```text
events.length > 0 -> review/danger presentation `IP CHANGE DETECTED`
successfulSampleCount > 0 && no events -> clean `NO IP CHANGE OBSERVED`
sampleCount > 0 && successfulSampleCount === 0 -> review `MONITORING INCONCLUSIVE`
otherwise -> idle `Not running`
```

This presentation does not replace `monitorFindings()`.

Implement media baseline mode from presence of Known Real/Known VPN arrays. Media result order:

```text
status denied -> review `PERMISSION DENIED`
status unavailable -> neutral `UNSUPPORTED`
status error -> review `TEST COULD NOT COMPLETE`
known-real exposure -> leak
Guided baseline + only known-vpn public exposure -> clean `ONLY KNOWN VPN IP OBSERVED`
Guided baseline + unknown-public exposure -> review `UNEXPECTED PUBLIC WEBRTC IP OBSERVED`
Standalone + public newly visible -> review `ADDITIONAL PUBLIC WEBRTC IP OBSERVED`
complete with no new public exposure -> clean `NO ADDITIONAL PUBLIC WEBRTC IP`
```

- [ ] **Step 5: Implement `presentation-ticker.js`**

```js
export function createPresentationTicker({
  onTick,
  intervalMs = 250,
  now = () => Date.now(),
  setIntervalImpl = setInterval,
  clearIntervalImpl = clearInterval
}) {
  let timer = null;
  function stop() {
    if (timer != null) clearIntervalImpl(timer);
    timer = null;
  }
  function sync(active) {
    if (!active) { stop(); return; }
    if (timer != null) return;
    timer = setIntervalImpl(() => onTick?.(now()), intervalMs);
  }
  return { sync, stop, isRunning:() => timer != null };
}
```

- [ ] **Step 6: Run tests to verify GREEN**

Run:

```bash
node --test tests/active-test-view.test.js tests/presentation-ticker.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add assets/active-test-view.js assets/presentation-ticker.js tests/active-test-view.test.js tests/presentation-ticker.test.js
git commit -m "feat: add active test timing view models"
```

---

### Task 2: Aggressive + Kill Switch Live Timers, Summary Status and Result Panels

**Files:**
- Modify: `assets/monitor.js`
- Modify: `assets/aggressive-leak-render.js`
- Modify: `assets/app.js`
- Modify: `index.html`
- Modify: `assets/dashboard.css`
- Modify/Test: existing monitor/aggressive tests
- Create/Modify: `tests/active-test-ux.test.js`

**Interfaces:**
- Consumes Task 1 `buildAggressiveTestView`, `buildMonitorTestView`, `createPresentationTicker`.
- `monitor.js` state gains additive fields:

```js
successfulSampleCount: number
stoppedAt: string|null
```

- `aggressive-leak-render.js` exports:

```js
renderAggressiveLeakTest(elements, state, nowMs = Date.now())
renderAggressiveTimer(elements, state, nowMs = Date.now())
```

- [ ] **Step 1: Add RED monitor-state tests**

In the existing monitor test file add assertions equivalent to:

```js
const state0 = createMonitorState();
assert.equal(state0.successfulSampleCount, 0);
assert.equal(state0.stoppedAt, null);

const successful = reduceMonitorState(state0, {
  type:'sample', timestamp:'2026-08-10T12:00:05.000Z',
  sample:{ ipv4:{status:'complete',address:'203.0.113.2'}, ipv6:{status:'unavailable'} }
});
assert.equal(successful.successfulSampleCount, 1);

const failed = reduceMonitorState(successful, {
  type:'sample', timestamp:'2026-08-10T12:00:10.000Z',
  sample:{ ipv4:{status:'unavailable'}, ipv6:{status:'unavailable'} }
});
assert.equal(failed.successfulSampleCount, 1);

const stopped = reduceMonitorState(failed, { type:'stop', timestamp:'2026-08-10T12:00:15.000Z' });
assert.equal(stopped.stoppedAt, '2026-08-10T12:00:15.000Z');
```

- [ ] **Step 2: Add RED DOM/wiring tests**

Create `tests/active-test-ux.test.js` and require:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../assets/app.js', import.meta.url), 'utf8');
const aggressiveRender = await readFile(new URL('../assets/aggressive-leak-render.js', import.meta.url), 'utf8');

test('Aggressive and Kill Switch expose live summary status and result/timer containers', () => {
  for (const id of [
    'aggressive-test-summary-status','aggressive-timer','aggressive-result-panel',
    'monitor-test-summary-status','monitor-timer','monitor-result-panel'
  ]) assert.match(html, new RegExp(`id=["']${id}["']`));
});

test('presentation ticker is UI-only wiring and Aggressive has timer-only renderer', () => {
  assert.match(app, /createPresentationTicker/);
  assert.match(aggressiveRender, /renderAggressiveTimer/);
});
```

- [ ] **Step 3: Run focused tests to verify RED**

Run the monitor test plus:

```bash
node --test tests/active-test-ux.test.js
```

Expected: FAIL on missing fields/IDs/render export.

- [ ] **Step 4: Extend monitor state safely**

In `createMonitorState()` return:

```js
{
  running:false, startedAt:null, stoppedAt:null,
  sampleCount:0, successfulSampleCount:0,
  baseline:{4:null,6:null}, current:{4:null,6:null}, events:[]
}
```

For `sample`, increment `successfulSampleCount` only if at least one family produced `observedAddress(...) !== undefined` and the observed address is non-null. Keep failed requests from creating a false successful sample.

For stop:

```js
if (action.type === 'stop') return { ...state, running:false, stoppedAt:action.timestamp ?? state.stoppedAt };
```

Update `createIpMonitor.stop()` to pass `timestamp: now()`.

- [ ] **Step 5: Update Active-test HTML for Aggressive/Kill Switch purpose/status/result**

Use summary wrappers instead of bare metadata:

```html
<summary>
  <span class="active-test-summary-copy">
    <span class="active-test-name">Aggressive Leak Test</span>
    <span class="active-test-purpose">Catches brief unexpected public IP changes, even without a pre-VPN capture.</span>
  </span>
  <span id="aggressive-test-summary-status" class="active-test-meta">Ready · 60 seconds</span>
</summary>
```

Aggressive expanded content starts with:

```html
<p class="test-explainer"><strong>What this test checks:</strong> Watches HTTP, STUN, echo and TLS paths for 60 seconds while you reproduce a VPN transition.</p>
<div id="aggressive-timer" class="test-timer" aria-live="polite"></div>
<div class="test-progress-track" aria-hidden="true"><div id="aggressive-progress-bar" class="test-progress-bar"></div></div>
<div id="aggressive-result-panel" class="test-result-slot"></div>
```

Keep existing `aggressive-status`, `aggressive-summary`, exposures and timeline for technical details/backward test compatibility; the prominent result slot is additional UI.

Kill Switch summary purpose:

```text
Monitors public IP while you manually disconnect or reconnect the VPN.
```

Expanded content gets `#monitor-timer` and `#monitor-result-panel` before the timeline.

- [ ] **Step 6: Refactor Aggressive renderer**

Import `buildAggressiveTestView`. `renderAggressiveTimer()` updates only:

- summary status;
- timer text;
- progress-bar width;
- no exposures/timeline/network calls.

`renderAggressiveLeakTest()` calls the timer renderer, then renders the full prominent panel when `view.resultLabel` exists:

```html
<div class="test-result-panel test-result-clean|review|leak">
  <span class="test-result-kicker">RESULT</span>
  <strong class="test-result-title">...</strong>
  <p class="test-result-message">...</p>
</div>
```

Coverage remains below as secondary evidence.

- [ ] **Step 7: Add monitor presentation renderer in `app.js`**

`renderMonitor(state, nowMs = Date.now(), { evidence = true } = {})` uses `buildMonitorTestView` to update summary status/timer/result panel every call. Only when `evidence === true` should it rebuild timeline, update report, queue enrichment and reassess.

Ticker calls:

```js
renderMonitor(monitor.getState(), nowMs, { evidence:false });
```

- [ ] **Step 8: Instantiate one presentation ticker in `app.js`**

```js
const presentationTicker = createPresentationTicker({
  onTick:(nowMs) => {
    const aggressiveState = aggressive?.getState?.();
    if (aggressiveMode === 'unguided' && aggressiveState?.status === 'running') renderAggressiveTimer(aggressiveElements, aggressiveState, nowMs);
    const monitorState = monitor?.getState?.();
    if (monitorState?.running) renderMonitor(monitorState, nowMs, { evidence:false });
    guidedRuntime?.renderTimer?.(nowMs);
  }
});

function syncPresentationTicker() {
  const active = Boolean(
    monitor?.getState?.().running ||
    (aggressiveMode === 'unguided' && aggressive?.getState?.().status === 'running') ||
    guidedRuntime?.hasPresentationTimer?.()
  );
  presentationTicker.sync(active);
}
```

Call `syncPresentationTicker()` after monitor/aggressive state updates and later from Guided changes.

- [ ] **Step 9: Add generic timer/result CSS**

In `dashboard.css` add readable multi-line summary copy, tabular timer digits, progress track/bar, and result tones. Minimum rules:

```css
.active-test-summary-copy{display:grid;gap:3px;min-width:0}
.active-test-purpose{color:var(--muted);font-size:.78rem;font-weight:500;line-height:1.35}
.test-timer{margin-top:12px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-variant-numeric:tabular-nums;font-size:1.15rem;font-weight:800}
.test-progress-track{height:6px;margin-top:8px;overflow:hidden;border-radius:999px;background:var(--surface-alt)}
.test-progress-bar{height:100%;width:0;background:currentColor;transition:width .25s linear}
.test-result-slot:empty{display:none}
.test-result-panel{display:grid;gap:7px;margin:14px 0;padding:16px;border:1px solid var(--border);border-radius:12px}
.test-result-title{font-size:1.05rem;overflow-wrap:anywhere}
.test-result-message{margin:0;color:var(--muted);line-height:1.45}
.test-result-clean{border-color:color-mix(in srgb,var(--success) 45%,var(--border))}
.test-result-review{border-color:color-mix(in srgb,var(--warning) 45%,var(--border))}
.test-result-leak{border-color:color-mix(in srgb,var(--danger) 50%,var(--border))}
```

If `color-mix` is not already acceptable for the project's supported browsers, use existing semantic border variables/classes instead; do not introduce a compatibility regression solely for styling.

- [ ] **Step 10: Run Task 2 regressions**

Run:

```bash
node --test tests/active-test-view.test.js tests/presentation-ticker.test.js tests/active-test-ux.test.js tests/aggressive-leak-render.test.js tests/aggressive-leak-test.test.js tests/monitor.test.js
```

Use the exact existing monitor/aggressive test filenames discovered in the repo if they differ.

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add index.html assets/app.js assets/monitor.js assets/aggressive-leak-render.js assets/dashboard.css tests
git commit -m "feat: add live timers and results to active tests"
```

---

### Task 3: Guided Stress Countdown, Collapsed Status and Prominent Verdict

**Files:**
- Modify: `index.html`
- Modify: `assets/guided-app-runtime.js`
- Modify: `assets/guided-leak-render.js`
- Modify: `assets/guided-leak.css`
- Modify: `assets/app.js`
- Modify/Test: Guided UI/integration tests
- Modify: `tests/active-test-ux.test.js`

**Interfaces:**
- Consumes `buildGuidedTestView`.
- `createGuidedAppRuntime()` gains methods:

```js
renderTimer(nowMs = Date.now())
hasPresentationTimer() -> boolean
```

- Guided view model gains `stressState` when `stressIsGuided`.

- [ ] **Step 1: Add RED Guided UI assertions**

Require IDs:

```text
guided-test-summary-status
guided-timer
guided-progress-bar
```

and assert source contains `buildGuidedTestView` plus an exported/defined timer-only render function.

Add behavior test where `stressState={status:'running',startedAt:1000,endsAt:61_000}` and `nowMs=21_000` renders/returns `00:40 remaining` without changing the stress state.

- [ ] **Step 2: Run Guided tests to verify RED**

Run existing Guided renderer/integration tests plus `tests/active-test-ux.test.js`.

Expected: FAIL on missing Guided timer/status wiring.

- [ ] **Step 3: Update Guided summary and explainer copy**

Collapsed row purpose:

```text
Checks whether your known pre-VPN public IP appears again while the VPN is connected.
```

Metadata/status defaults to:

```text
Step 1/3 · identify your real IP
```

Expanded panel begins with:

```text
What this test checks: Capture your public IP with VPN off, capture it again with VPN on, then run a 60-second stress test. An exact pre-VPN address seen during Step 3 is strong real-IP leak evidence.
```

Add `#guided-timer` and progress bar near `#guided-step`.

- [ ] **Step 4: Extend Guided runtime view state**

In `viewModel()` add:

```js
stressState: stressIsGuided ? (getStressState?.() ?? null) : null
```

Do not copy or create a new 60-second deadline.

`hasPresentationTimer()` returns true only when current Guided stress state is `running` (media is added in Task 4).

`renderTimer(nowMs)` calls the timer-only Guided renderer with current view model.

- [ ] **Step 5: Refactor Guided renderer**

Import `buildGuidedTestView`. Add:

```js
export function renderGuidedTimer(elements, viewModel = {}, nowMs = Date.now()) { ... }
```

It updates summary status, timer and progress only. While stress `status === running` but `endsAt === null`, show `Preparing baseline…` and 0% progress.

`renderGuidedLeak()` calls `renderGuidedTimer()` then renders workflow/evidence.

Replace the small verdict line with the same generic result-panel structure while preserving `getGuidedResultLabel()` and existing reasons/exposures/path/coverage data.

Do not change `getGuidedResultLabel()` mapping.

- [ ] **Step 6: Sync global presentation ticker from Guided changes**

In `handleGuidedChange()`, after state/report handling call `syncPresentationTicker()`.

When stress completes/stops, the next change must stop the ticker if no other Active test is running.

- [ ] **Step 7: Run Guided + Aggressive regression suite**

Run:

```bash
node --test tests/active-test-view.test.js tests/active-test-ux.test.js tests/guided-leak-ui.test.js tests/guided-app-integration.test.js tests/guided-clear-state.test.js tests/aggressive-leak-test.test.js
```

Expected: PASS and Guided verdict precedence tests unchanged.

- [ ] **Step 8: Commit**

```bash
git add index.html assets/app.js assets/guided-app-runtime.js assets/guided-leak-render.js assets/guided-leak.css tests
git commit -m "feat: clarify and time Guided leak test"
```

---

### Task 4: Separate WebRTC Permission Check with Explicit Guided Baseline Relationship

**Files:**
- Create: `assets/webrtc-media-render.js`
- Modify: `index.html`
- Modify: `assets/guided-app-runtime.js`
- Modify: `assets/guided-leak-render.js`
- Modify: `assets/dashboard.css`
- Modify/Test: `tests/guided-leak-ui.test.js`
- Modify/Test: `tests/guided-app-integration.test.js`
- Create/Modify: `tests/active-test-ux.test.js`

**Interfaces:**
- The media diagnostic remains executed by existing `runWebRtcMediaPermissionTest`.
- Existing report field remains `guidedLeak.media`.
- `webrtc-media-render.js` exports:

```js
renderMediaWebRtc(elements, viewModel, nowMs = Date.now())
renderMediaWebRtcTimer(elements, viewModel, nowMs = Date.now())
```

- Guided runtime internal state adds:

```js
busyOperation: null|'guided-capture'|'media'
mediaRun: { running:boolean, startedAtMs:number|null, completedAtMs:number|null }
```

- [ ] **Step 1: Add RED DOM separation test**

In `tests/active-test-ux.test.js`:

```js
test('WebRTC Permission Check is a separate fourth Active test and not nested inside Guided content', () => {
  for (const id of ['webrtc-test-disclosure','webrtc-test-summary-status','media-webrtc-baseline','media-webrtc-timer','media-webrtc-result']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  const guidedStart = html.indexOf('id="guided-test-disclosure"');
  const guidedEnd = html.indexOf('id="aggressive-test-disclosure"');
  const webrtcStart = html.indexOf('id="webrtc-test-disclosure"');
  assert.ok(webrtcStart > guidedEnd);
  const guidedSlice = html.slice(guidedStart, guidedEnd);
  assert.doesNotMatch(guidedSlice, /media-webrtc-button/);
});
```

Use actual final ordering Guided → Aggressive → Kill Switch → WebRTC; calculate slices using the neighboring disclosure IDs, not arbitrary tag counting.

- [ ] **Step 2: Add RED WebRTC renderer tests**

Test `buildMediaWebRtcTestView` integration with DOM stubs or source-level renderer assertions:

- no Guided baseline -> text contains `Standalone mode` and `cannot prove`;
- Known Real captured -> text contains `Baseline: Guided VPN Leak Test`;
- permission denied -> final result is visible and running timer stops;
- Known Real media exposure -> danger result title exactly `KNOWN REAL IP EXPOSED THROUGH WEBRTC`.

- [ ] **Step 3: Run focused tests to verify RED**

Expected: FAIL because media UI is still nested in Guided and renderer module does not exist.

- [ ] **Step 4: Move media markup into fourth Active-test disclosure**

After Kill Switch add:

```html
<details id="webrtc-test-disclosure" class="active-test-row">
  <summary>
    <span class="active-test-summary-copy">
      <span class="active-test-name">WebRTC Permission Check</span>
      <span class="active-test-purpose">Checks whether camera/microphone permission reveals additional WebRTC/ICE addresses.</span>
    </span>
    <span id="webrtc-test-summary-status" class="active-test-meta">Standalone</span>
  </summary>
  <section class="active-test-content" aria-labelledby="webrtc-test-heading">
    <h2 id="webrtc-test-heading">WebRTC Permission Check</h2>
    <p class="test-explainer"><strong>What this test checks:</strong> Compares WebRTC address visibility before and after media permission. This is a specialized WebRTC privacy path check, not the 60-second VPN stress test.</p>
    <div id="media-webrtc-baseline" class="test-baseline-note"></div>
    <div id="media-webrtc-timer" class="test-timer" aria-live="polite"></div>
    <button id="media-webrtc-button" class="secondary-button" type="button">Run WebRTC permission check</button>
    <div id="media-webrtc-status" class="monitor-status">Not run</div>
    <div id="media-webrtc-result" class="test-result-slot"></div>
  </section>
</details>
```

Remove the old `.guided-media` block from inside `#guided-section`.

- [ ] **Step 5: Separate Guided renderer from media renderer**

Remove `mediaStatus/mediaResult` handling from `renderGuidedLeak`.

Create `webrtc-media-render.js` consuming `buildMediaWebRtcTestView`. It renders:

- summary status;
- baseline relationship;
- elapsed timer while `mediaRun.running`;
- result panel;
- newly-visible candidates below result as evidence.

Baseline copy is exact:

Guided mode:

```text
Baseline: Guided VPN Leak Test
Captured real/VPN public addresses are used to classify any public WebRTC address found here.
```

Standalone:

```text
Standalone mode
No Guided baseline captured. This test can detect additional public WebRTC addresses, but cannot prove that an address is your known pre-VPN IP. Run Guided first for stronger classification.
```

- [ ] **Step 6: Refactor Guided runtime operation state without changing storage/report schema**

Replace the ambiguous media use of `busy` with internal `busyOperation` while preserving button-disable semantics.

For Guided capture:

```js
busyOperation = 'guided-capture';
...
busyOperation = null;
```

For media:

```js
busyOperation = 'media';
mediaRun = { running:true, startedAtMs:Date.now(), completedAtMs:null };
notify();
try { media = await runWebRtcMediaPermissionTest(...); }
finally {
  mediaRun = { running:false, startedAtMs:mediaRun.startedAtMs, completedAtMs:Date.now() };
  busyOperation = null;
  notify();
}
```

`viewModel()` for Guided exposes `busy: busyOperation != null` as before so old Guided behavior remains compatible.

Add `mediaViewModel()` returning:

```js
{
  profile,
  media,
  mediaRun,
  mediaExposures: mediaExposures()
}
```

`notify()` renders Guided and media separately.

`renderTimer(nowMs)` calls both Guided timer and media timer.

`hasPresentationTimer()` returns true when Guided stress is running OR `mediaRun.running`.

- [ ] **Step 7: Preserve media report/findings semantics**

Do not move `media` out of `getReport()`; keep:

```js
return buildGuidedLeakReport({ profile, captures, aggressive, media, observations });
```

Keep media observations under transport class `webrtc-media` and existing `mediaExposures()` classification.

- [ ] **Step 8: Run WebRTC/Guided regression suite**

Run:

```bash
node --test tests/active-test-view.test.js tests/active-test-ux.test.js tests/webrtc-media-test.test.js tests/guided-leak-ui.test.js tests/guided-app-integration.test.js tests/guided-clear-state.test.js tests/leak-report.test.js
```

Expected: PASS; `guidedLeak.media` still serializes.

- [ ] **Step 9: Commit**

```bash
git add index.html assets/guided-app-runtime.js assets/guided-leak-render.js assets/webrtc-media-render.js assets/dashboard.css tests
git commit -m "feat: separate WebRTC permission check from Guided flow"
```

---

### Task 5: Public-IP Provider Consensus Evidence in Advanced Diagnostics

**Files:**
- Create: `assets/provider-evidence.js`
- Create: `tests/provider-evidence.test.js`
- Modify: `assets/app.js`
- Modify: `assets/dashboard.css`
- Modify: `tests/active-test-ux.test.js` or existing Advanced UI test

**Interfaces:**

`provider-evidence.js` exports:

```js
buildIpProviderEvidence(result) -> {
  selectedAddress,
  successful,
  total,
  selectedVotes,
  differentValues,
  majority:boolean,
  tied:boolean,
  summary:string,
  sources:Array<{ id,label,address,relation,latencyMs,error }>
}
```

`relation` is exactly one of `consensus`, `differs`, `unavailable`.

- [ ] **Step 1: Write RED provider-evidence tests**

Create:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIpProviderEvidence } from '../assets/provider-evidence.js';

test('different successful public IP is labeled differs', () => {
  const view = buildIpProviderEvidence({
    address:'128.71.33.91',
    agreement:{ available:3,total:3,agree:false,counts:{'128.71.33.91':2,'128.71.35.12':1} },
    sources:[
      {id:'a',label:'ipify',status:'complete',address:'128.71.33.91',latencyMs:182},
      {id:'b',label:'IPPubblico',status:'complete',address:'128.71.33.91',latencyMs:241},
      {id:'c',label:'ipwho.is',status:'complete',address:'128.71.35.12',latencyMs:390}
    ]
  });
  assert.equal(view.selectedVotes, 2);
  assert.equal(view.majority, true);
  assert.equal(view.sources[2].relation, 'differs');
  assert.equal(view.sources[2].address, '128.71.35.12');
});

test('unavailable provider is not disagreement', () => {
  const view = buildIpProviderEvidence({
    address:'128.71.33.91',
    agreement:{ available:2,total:3,agree:true,counts:{'128.71.33.91':2} },
    sources:[
      {id:'a',label:'ipify',status:'complete',address:'128.71.33.91',latencyMs:182},
      {id:'b',label:'IPPubblico',status:'complete',address:'128.71.33.91',latencyMs:241},
      {id:'c',label:'ipwho.is',status:'unavailable',address:null,latencyMs:6001,error:'Request timed out'}
    ]
  });
  assert.equal(view.sources[2].relation, 'unavailable');
  assert.equal(view.differentValues, 0);
});

test('tie explicitly says there was no majority and retains alternative', () => {
  const view = buildIpProviderEvidence({
    address:'203.0.113.1',
    agreement:{ available:2,total:3,agree:false,counts:{'203.0.113.1':1,'203.0.113.2':1} },
    sources:[
      {id:'a',label:'A',status:'complete',address:'203.0.113.1',latencyMs:100},
      {id:'b',label:'B',status:'complete',address:'203.0.113.2',latencyMs:120},
      {id:'c',label:'C',status:'unavailable',address:null,latencyMs:6000,error:'timeout'}
    ]
  });
  assert.equal(view.tied, true);
  assert.match(view.summary, /No majority/i);
  assert.equal(view.sources.find((row) => row.address === '203.0.113.2').relation, 'differs');
});
```

- [ ] **Step 2: Run test to verify RED**

```bash
node --test tests/provider-evidence.test.js
```

Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement pure provider evidence builder**

Use `result.address` as the currently selected consensus address; do not invent a new winner.

Determine votes from `result.agreement.counts`. `majority` means `selectedVotes > successful / 2`. `tied` means the maximum vote count is shared by more than one address.

Summary rules:

```text
tied -> `No majority — selected first successful result`
majority + differentValues > 0 -> `2 of 3 successful sources returned the selected address`
all successful same -> `3 of 3 successful sources agree`
no successful source -> `No successful public-IP source`
```

Source mapping:

```js
relation = source.status !== 'complete' || !source.address
  ? 'unavailable'
  : source.address === result.address
    ? 'consensus'
    : 'differs';
```

- [ ] **Step 4: Render provider evidence inside IPv4/IPv6 Advanced network disclosures**

In `runAdvanced()`, change `ips` to retain the original family result objects:

```js
const ipEntries = [currentReport.ipv4, currentReport.ipv6].filter((result) => result?.address);
const ips = ipEntries.map((result) => result.address);
```

For each network row call a helper:

```js
renderIpProviderEvidence(row.body, ipEntries[index]);
```

Render subsection:

```text
Public IP sources
Consensus IP       128.71.33.91
Agreement          2 of 3 successful sources returned the selected address
Different values   1
```

then provider rows with label/address/relation/latency/error.

No provider call is made here; only `currentReport.ipv4.sources` / `ipv6.sources` are read.

- [ ] **Step 5: Add provider evidence CSS/mobile stacking**

Desktop row grid:

```css
.provider-evidence{margin-top:14px;padding-top:12px;border-top:1px solid var(--border)}
.provider-evidence-title{margin:0 0 8px;font-size:.86rem}
.provider-source-row{display:grid;grid-template-columns:minmax(100px,.8fr) minmax(0,1.4fr) auto auto;gap:10px;padding:7px 0;border-top:1px solid var(--border);font-size:.82rem}
.provider-source-address{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;overflow-wrap:anywhere}
.provider-source-differs{color:var(--warning)}
.provider-source-unavailable{color:var(--muted)}
```

At `max-width:620px`, stack each row into one column and show relation/latency on the final line; no horizontal scrolling.

- [ ] **Step 6: Add static test proving raw source evidence is wired**

Assert `app.js` imports `buildIpProviderEvidence`, includes `Public IP sources`, and reads `.sources`. Ensure no new provider endpoint/config entry was added by this task.

- [ ] **Step 7: Run provider + core IP regressions**

Run:

```bash
node --test tests/provider-evidence.test.js tests/max-diagnostics.test.js tests/ip-progressive.test.js tests/compact-dashboard-ui.test.js tests/active-test-ux.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add assets/provider-evidence.js assets/app.js assets/dashboard.css tests
git commit -m "feat: show public IP provider consensus evidence"
```

---

### Task 6: Final UX Polish, Validator, README and Exact-HEAD Verification

**Files:**
- Modify: `assets/dashboard.css`
- Modify: `assets/guided-leak.css`
- Modify: `scripts/validate-static.mjs`
- Modify: `README.md`
- Modify: `tests/active-test-ux.test.js`

**Interfaces:**
- No new diagnostic API.

- [ ] **Step 1: Finalize Active-test ordering and mobile summary behavior**

Required order in `index.html`:

1. Guided VPN Leak Test
2. Aggressive Leak Test
3. Kill Switch test
4. WebRTC Permission Check

On mobile, `.active-test-row>summary` may become one column so purpose/status do not collide. Status remains visible without opening the disclosure.

Long IPs/candidates/provider errors/result messages use `overflow-wrap:anywhere`.

- [ ] **Step 2: Add final semantic/static regressions**

`tests/active-test-ux.test.js` must assert:

- all four test summaries have purpose copy and live status IDs;
- Guided/Aggressive have progress bars;
- Kill Switch/WebRTC have elapsed timer containers;
- WebRTC media controls are outside Guided DOM section;
- result panel slots exist for all four tests;
- provider evidence is under Advanced rendering code;
- no `toggle` event on Active-test disclosures invokes start/stop;
- Copy JSON path still reads `guidedRuntime.getReport()`;
- `guidedLeak.media` report test remains green.

- [ ] **Step 3: Extend static validator**

Add required modules:

```text
assets/active-test-view.js
assets/presentation-ticker.js
assets/provider-evidence.js
assets/webrtc-media-render.js
```

Add required IDs:

```text
guided-test-summary-status
guided-timer
guided-progress-bar
aggressive-test-summary-status
aggressive-timer
aggressive-progress-bar
aggressive-result-panel
monitor-test-summary-status
monitor-timer
monitor-result-panel
webrtc-test-disclosure
webrtc-test-summary-status
media-webrtc-baseline
media-webrtc-timer
media-webrtc-button
media-webrtc-result
```

Keep all existing core/dashboard/Guided runtime IDs and single `./assets/app.js` module-entry validation.

- [ ] **Step 4: Update README with conceptual test guide**

Near `Active tests`, add a compact comparison:

```text
Guided VPN Leak Test — captures your pre-VPN IP first, so it can prove that exact known real address reappeared.
Aggressive Leak Test — watches many network paths for 60 seconds and catches transient unexpected public addresses without requiring a pre-VPN capture.
Kill Switch test — open-ended monitor for a manual VPN disconnect/reconnect; it records successful public-address transitions until you stop it.
WebRTC Permission Check — compares WebRTC/ICE visibility before and after media permission. It is a separate test; when Guided captures exist it uses them as a baseline for stronger Known Real/Known VPN classification, otherwise it runs standalone.
```

Document provider disagreement:

```text
`differ` means two or more successful public-IP sources returned different valid addresses. An unavailable/timeout source does not count as disagreement. Advanced → IPv4/IPv6 network shows every provider's returned address, relation to the selected consensus, latency and error.
```

- [ ] **Step 5: Run full verification**

Run:

```bash
npm run check
```

Expected: zero failures in all Node tests/static validation/build checks.

- [ ] **Step 6: Inspect scope diff against `main`**

Run:

```bash
git diff main...HEAD --stat
git diff main...HEAD -- assets index.html scripts/validate-static.mjs README.md tests
```

Expected scope:

- presentation/status/timer/result UI;
- additive Kill Switch successful-sample/stopped timestamp fields;
- WebRTC media DOM/render separation while same Guided report/profile storage is retained;
- provider evidence rendering from existing IP consensus results;
- tests/docs/validator.

Must not include changes to:

- IP consensus winner algorithm;
- GeoIP provider selection;
- core assessment severity rules;
- Guided known-real/unknown-public verdict precedence;
- Aggressive observation/classification rules;
- network probe frequencies/durations;
- DNS/torrent/email feature flags.

- [ ] **Step 7: Commit final docs/validator/polish**

```bash
git add assets/dashboard.css assets/guided-leak.css scripts/validate-static.mjs README.md tests/active-test-ux.test.js
git commit -m "docs: explain active test results and provider evidence"
```

- [ ] **Step 8: Verify exact final feature SHA in GitHub Actions**

Wait for `Test` workflow on exact final `feature/test-ux-evidence` SHA and verify its `npm run check` step concludes `success`. Do not merge based on an earlier green commit.

- [ ] **Step 9: Merge only after green if the user has requested automatic merge**

If the execution instruction for this plan includes automatic merge after success, fast-forward `main` to the exact green feature SHA with `force:false`, then verify the `main` Test workflow succeeds on the same SHA. Treat Pages deploy success separately from Test success and do not call the feature live until the Pages deployment concludes successfully.

---

## Spec Coverage Self-Review

- Timers for 60-second tests: Tasks 1–3.
- Baseline preparation explicitly separated from the real 60-second window: Tasks 1–3.
- Kill Switch elapsed timer: Tasks 1–2.
- WebRTC elapsed timer without fake ETA: Tasks 1 and 4.
- Timer independent from network sample cadence: Task 1 ticker + timer-only renders in Tasks 2–4.
- Prominent result panels: Tasks 2–4.
- Final result visible in collapsed row: Tasks 1–4.
- Guided/Aggressive/Kill Switch conceptual differences explained in UI: Tasks 2–4.
- WebRTC is a separate Active test: Task 4.
- WebRTC ↔ Guided relationship explicitly shown in both modes: Tasks 1 and 4.
- Existing Guided baseline/session storage reused: Task 4.
- `guidedLeak.media` report compatibility: Task 4 regressions.
- Provider `differ` semantics exposed correctly: Task 5.
- Provider timeout is unavailable, not disagreement: Task 5 tests.
- Majority and tie evidence: Task 5 tests/UI.
- No extra IP request for provider evidence: Task 5 architecture/static regression.
- Mobile wrapping/stacked provider rows: Tasks 5–6.
- Existing leak severity/classification untouched: Global constraints + Task 6 scope diff.
- README/validator/exact-head CI: Task 6.

Placeholder scan: no TBD/TODO or deferred interfaces remain. All new exported functions and additive state fields are defined before later tasks consume them.

Type consistency: `buildAggressiveTestView`, `buildGuidedTestView`, `buildMonitorTestView`, `buildMediaWebRtcTestView`, `createPresentationTicker`, `buildIpProviderEvidence`, `renderAggressiveTimer`, `renderMediaWebRtc`, and `renderMediaWebRtcTimer` are named consistently across producer/consumer tasks. WebRTC report storage remains `guidedLeak.media` throughout the plan.
