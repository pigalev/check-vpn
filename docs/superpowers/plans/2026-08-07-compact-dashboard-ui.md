# Compact Dashboard UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current equal-weight IPv4/IPv6/WebRTC/Privacy card grid with a compact consumer-facing dashboard that prioritizes the current public IP, summarizes leak/privacy results, collapses technical detail, and keeps all existing diagnostics/report data intact.

**Architecture:** Introduce a pure `assets/dashboard-view.js` view-model layer that converts existing diagnostic results into presentation states without changing classification/severity. `assets/app.js` renders those view models into a new fixed dashboard skeleton in `index.html`; Advanced diagnostics become compact native disclosures, while Guided/Kill Switch/Aggressive keep all existing IDs and runtime logic inside a grouped `Active tests` disclosure area. Progressive IP/GeoIP callbacks continue updating the shared connection panel immediately.

**Tech Stack:** Static HTML/CSS, browser ES modules, native `details/summary`, existing diagnostic modules, Node.js >=22 `node:test`, GitHub Pages CI.

## Global Constraints

- Product UI copy remains concise English.
- `Your connection` is the visually dominant static result.
- IPv6 never owns a separate large primary card; unavailable IPv6 is one compact `Not detected` row.
- If IPv4 is unavailable and IPv6 exists, IPv6 becomes the primary connection address.
- Existing fast-first progressive IPv4/IPv6 and GeoIP behavior must remain intact.
- Existing `Protected`, `Review`, `Leak detected`, `Incomplete` assessment rules remain authoritative and unchanged.
- Healthy WebRTC is compact; a public mismatch must expose the mismatching address without requiring Details.
- Privacy shows meaningful consistency signals by default and routine metadata under Details.
- Timezone mismatch appears once; do not duplicate it with a second warning sentence.
- Advanced diagnostics remain lazy and start only when the top-level Advanced disclosure opens or `Run advanced again` is pressed.
- Advanced unavailable/empty results must not render repeated empty `Unavailable` fields.
- TLS failure must not be labeled specifically as CORS unless the browser can prove that cause; generic fetch `TypeError` remains `Unavailable`/unreachable wording.
- Guided VPN Leak Test, Kill Switch test and Aggressive Leak Test algorithms/state/reporting remain unchanged.
- Collapsing an Active test disclosure must never stop an active test.
- Existing DOM IDs required by Guided/Kill Switch/Aggressive runtime are preserved.
- `currentReport` and Copy JSON remain schema-compatible and keep all existing diagnostic fields.
- No frontend framework or dependency is added.
- Mobile must have no horizontal overflow for IPv6, candidate addresses, JA3/JA4 or timelines.
- Full `npm run check` must pass on the exact final feature HEAD.

---

## File Structure

**Create**
- `assets/dashboard-view.js` — pure presentation/view-model helpers; no DOM access and no network/classification side effects.
- `tests/dashboard-view.test.js` — deterministic tests for connection, leak, privacy and compact advanced view states.
- `tests/compact-dashboard-ui.test.js` — static structure/wiring regression for `index.html`, `app.js` and CSS.

**Modify**
- `index.html` — fixed dashboard skeleton, grouped Advanced and Active tests disclosures while preserving runtime IDs.
- `assets/app.js` — render grouped panels instead of dynamically creating four equal result cards; keep progressive orchestration/report logic.
- `assets/styles.css` — hero connection panel, compact rows, details, dashboard layout, Advanced list, Active tests, responsive/mobile rules.
- `assets/guided-leak.css` — remove/adjust only redundant outer-shell spacing when Guided lives inside Active tests.
- `scripts/validate-static.mjs` — validate new dashboard/active-test containers and existing single module entry.
- `README.md` — describe compact dashboard hierarchy and progressive disclosure.

`assets/tls-fingerprint.js` does not need to change for the first implementation: its existing `status` and `error` already distinguish successful data from generic unavailable/error states sufficiently for concise UI wording. Only change it later if a failing test demonstrates a presentation requirement cannot be met from the current result shape.

---

### Task 1: Pure Dashboard View Models

**Files:**
- Create: `assets/dashboard-view.js`
- Create: `tests/dashboard-view.test.js`

**Interfaces:**
- Consumes existing normalized result objects from `app.js`.
- Produces:

```js
buildConnectionView({ ipv4, ipv6, assessment = null })
buildLeakView({ ipv4, ipv6, webrtc })
buildPrivacyView({ browser, privacy })
buildAdvancedRowView({ id, title, result, summary = null })
```

View-model functions return plain serializable objects only. They do not call assessment helpers or create new leak findings.

- [ ] **Step 1: Write failing connection hierarchy tests**

Create `tests/dashboard-view.test.js` with:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildConnectionView,
  buildLeakView,
  buildPrivacyView,
  buildAdvancedRowView
} from '../assets/dashboard-view.js';

const ip4 = {
  family: 4,
  status: 'complete',
  address: '128.71.33.91',
  ipFinal: true,
  geoFinal: true,
  agreement: { available: 3, total: 3, agree: true },
  geo: {
    status: 'complete', countryCode: 'RU', country: 'Russia', city: 'Krasnodar',
    asn: 'AS3216', org: 'VimpelCom', agreement: { available: 3, total: 4 }, differences: []
  }
};

const noIp6 = {
  family: 6,
  status: 'unavailable',
  address: null,
  ipFinal: true,
  geoFinal: true
};

test('connection view makes IPv4 primary and unavailable IPv6 one compact row', () => {
  const view = buildConnectionView({ ipv4: ip4, ipv6: noIp6, assessment: { status: 'protected' } });
  assert.equal(view.primary.family, 4);
  assert.equal(view.primary.address, '128.71.33.91');
  assert.equal(view.secondary.family, 6);
  assert.equal(view.secondary.state, 'not-detected');
  assert.equal(view.secondary.address, null);
});

test('IPv6 becomes primary when IPv4 is unavailable', () => {
  const ipv6 = {
    family: 6, status: 'complete', address: '2a00:1450::1', ipFinal: true, geoFinal: true,
    agreement: { available: 2, total: 3, agree: true },
    geo: { status: 'complete', country: 'Germany', city: 'Frankfurt' }
  };
  const view = buildConnectionView({ ipv4: { family:4, address:null, ipFinal:true }, ipv6 });
  assert.equal(view.primary.family, 6);
  assert.equal(view.primary.address, '2a00:1450::1');
});

test('provisional address stays visible with checking states', () => {
  const view = buildConnectionView({
    ipv4: { family:4, address:'128.71.33.91', ipFinal:false, geoPending:true, geo:null },
    ipv6: { family:6, address:null, ipFinal:false }
  });
  assert.equal(view.primary.state, 'detected');
  assert.equal(view.primary.sourceText, 'Checking…');
  assert.equal(view.primary.locationState, 'locating');
});
```

- [ ] **Step 2: Write failing leak/privacy/advanced compact-state tests**

Append:

```js
test('healthy WebRTC creates compact no-mismatch leak view', () => {
  const view = buildLeakView({
    ipv4: ip4,
    ipv6: noIp6,
    webrtc: {
      status:'complete',
      publicAddresses:['128.71.33.91'],
      candidates:[{ address:'host.local', classification:'mdns', type:'host', protocol:'udp' }],
      summary:{ host:1, srflx:0, relay:0, ipv4:0, ipv6:0, udp:1, tcp:0 }
    }
  });
  assert.equal(view.publicMismatch, false);
  assert.equal(view.status, 'clear');
});

test('WebRTC public mismatch exposes the mismatching address in summary', () => {
  const view = buildLeakView({
    ipv4: ip4,
    ipv6: noIp6,
    webrtc: {
      status:'complete',
      publicAddresses:['203.0.113.8'],
      candidates:[{ address:'203.0.113.8', classification:'public', type:'srflx', protocol:'udp' }],
      summary:{ host:0, srflx:1, relay:0, ipv4:1, ipv6:0, udp:1, tcp:0 }
    }
  });
  assert.equal(view.publicMismatch, true);
  assert.deepEqual(view.mismatchAddresses, ['203.0.113.8']);
});

test('privacy view represents timezone mismatch once and moves routine fields to details', () => {
  const view = buildPrivacyView({
    browser:{ timezone:'Europe/Moscow', languages:['en-US','en','ru'], platform:'Win32', secureContext:true, gpc:null, doNotTrack:null },
    privacy:{ ipTimezones:['Europe/Berlin'], timezoneMatch:false }
  });
  assert.equal(view.status, 'review');
  assert.equal(view.summaryRows.filter((row) => row.id === 'timezone').length, 1);
  assert.ok(view.detailRows.some((row) => row.id === 'platform'));
  assert.ok(!view.summaryRows.some((row) => row.id === 'platform'));
});

test('unavailable advanced row is one concise state', () => {
  const view = buildAdvancedRowView({
    id:'tls', title:'TLS fingerprint',
    result:{ status:'unavailable', error:'TLS reflector unavailable.' }
  });
  assert.equal(view.statusLabel, 'Unavailable');
  assert.equal(view.expandable, false);
  assert.equal(view.fields.length, 0);
});
```

- [ ] **Step 3: Run tests to verify RED**

Run:

```bash
node --test tests/dashboard-view.test.js
```

Expected: FAIL because `assets/dashboard-view.js` does not exist.

- [ ] **Step 4: Implement minimal pure view helpers**

Create `assets/dashboard-view.js`. Use existing IP/WebRTC fields only; do not import `assessment.js` or mutate inputs.

Required shape:

```js
function usableGeo(geo) {
  return geo && ['complete', 'partial'].includes(geo.status);
}

function sourceText(ip) {
  if (!ip?.agreement) return ip?.address ? 'Checking…' : null;
  return `${ip.agreement.available}/${ip.agreement.total} sources${ip.agreement.agree ? ' · agree' : ' · differ'}`;
}

function ipEntry(ip, fallbackFamily) {
  const family = ip?.family ?? fallbackFamily;
  if (!ip?.address) {
    return {
      family,
      address: null,
      state: ip?.ipFinal ? 'not-detected' : 'checking',
      sourceText: null,
      locationState: 'none',
      location: null,
      network: null
    };
  }
  const geo = usableGeo(ip.geo) ? ip.geo : null;
  return {
    family,
    address: ip.address,
    state: ip.ipFinal === false ? 'detected' : 'complete',
    sourceText: sourceText(ip),
    locationState: geo ? 'available' : ip.geoPending ? 'locating' : 'unavailable',
    location: geo ? { countryCode:geo.countryCode, country:geo.country, city:geo.city, region:geo.region } : null,
    network: geo ? [geo.asn, geo.org].filter(Boolean).join(' · ') || null : null
  };
}

export function buildConnectionView({ ipv4, ipv6, assessment = null }) {
  const v4 = ipEntry(ipv4, 4);
  const v6 = ipEntry(ipv6, 6);
  const primary = v4.address ? v4 : v6.address ? v6 : v4;
  const secondary = primary.family === 4 ? v6 : v4;
  return { primary, secondary, verdict: assessment?.status ?? null };
}
```

For `buildLeakView`, compare WebRTC public addresses with trusted HTTP addresses and preserve the candidates/summary in `details`:

```js
export function buildLeakView({ ipv4, ipv6, webrtc }) {
  const trusted = new Set([ipv4?.address, ipv6?.address].filter(Boolean));
  const publicAddresses = [...new Set(webrtc?.publicAddresses ?? [])];
  const mismatchAddresses = publicAddresses.filter((address) => !trusted.has(address));
  const candidates = webrtc?.candidates ?? [];
  const mdns = candidates.some((candidate) => candidate.classification === 'mdns');
  return {
    status: webrtc?.status === 'complete' ? (mismatchAddresses.length ? 'leak' : 'clear') : 'unavailable',
    publicMismatch: mismatchAddresses.length > 0,
    mismatchAddresses,
    publicAddresses,
    mdnsProtection: mdns,
    details: { candidates, summary: webrtc?.summary ?? {} }
  };
}
```

For Privacy, keep timezone/language summary only; routine fields in details:

```js
export function buildPrivacyView({ browser, privacy }) {
  const timezoneValue = privacy?.timezoneMatch == null
    ? `${browser?.timezone ?? 'Unavailable'} · IP timezone unavailable`
    : privacy.timezoneMatch
      ? `${browser?.timezone ?? 'Unavailable'} · Match`
      : `${browser?.timezone ?? 'Unavailable'} ↔ ${(privacy.ipTimezones ?? []).join(', ') || 'Unavailable'} · Mismatch`;
  return {
    status: privacy?.timezoneMatch === false ? 'review' : 'clear',
    summaryRows: [
      { id:'timezone', label:'Timezone', value:timezoneValue, tone:privacy?.timezoneMatch === false ? 'review' : 'normal' },
      { id:'language', label:'Language', value:browser?.languages?.join(', ') || browser?.language || 'Unknown', tone:'normal' }
    ],
    detailRows: [
      { id:'platform', label:'Platform', value:browser?.platform || 'Unknown' },
      { id:'secure-context', label:'Secure context', value:browser?.secureContext == null ? 'Unknown' : browser.secureContext ? 'Yes' : 'No' },
      { id:'gpc', label:'GPC', value:browser?.gpc == null ? 'Unavailable' : browser.gpc ? 'Enabled' : 'Disabled' },
      { id:'dnt', label:'DNT', value:browser?.doNotTrack ?? 'Unavailable' }
    ]
  };
}
```

For `buildAdvancedRowView`, unavailable/error results have no fields. Complete/partial callers may pass `summary` and later DOM code supplies populated fields.

- [ ] **Step 5: Run tests to verify GREEN**

Run:

```bash
node --test tests/dashboard-view.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add assets/dashboard-view.js tests/dashboard-view.test.js
git commit -m "feat: add compact dashboard view models"
```

---

### Task 2: Connection Hero + Leak/Privacy Dashboard Skeleton

**Files:**
- Modify: `index.html`
- Modify: `assets/app.js`
- Modify: `assets/styles.css`
- Create: `tests/compact-dashboard-ui.test.js`
- Test: existing `tests/progressive-core.test.js`

**Interfaces:**
- Consumes Task 1 helpers: `buildConnectionView`, `buildLeakView`, `buildPrivacyView`.
- Produces fixed DOM containers:
  - `#dashboard`
  - `#connection-panel`
  - `#connection-body`
  - `#connection-verdict`
  - `#dashboard-findings`
  - `#leak-panel`
  - `#leak-body`
  - `#privacy-panel`
  - `#privacy-body`
- Existing `#overall-status`, `#overall-message`, `#top-findings` may be retained inside the connection/dashboard region to minimize assessment wiring changes, but the old standalone `.summary` shell must be removed.

- [ ] **Step 1: Write failing static dashboard structure tests**

Create `tests/compact-dashboard-ui.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../assets/app.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../assets/styles.css', import.meta.url), 'utf8');

test('primary dashboard uses one connection panel instead of separate IPv4 IPv6 cards', () => {
  for (const id of ['dashboard','connection-panel','connection-body','leak-panel','leak-body','privacy-panel','privacy-body']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.doesNotMatch(app, /createCard\(['"]ipv4['"]/);
  assert.doesNotMatch(app, /createCard\(['"]ipv6['"]/);
});

test('dashboard imports pure view-model helpers', () => {
  assert.match(app, /buildConnectionView/);
  assert.match(app, /buildLeakView/);
  assert.match(app, /buildPrivacyView/);
});

test('dashboard CSS includes connection hero and compact rows', () => {
  assert.match(css, /\.connection-hero/);
  assert.match(css, /\.summary-row/);
});
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
node --test tests/compact-dashboard-ui.test.js
```

Expected: FAIL because the new dashboard containers/classes do not exist and `app.js` still creates four cards dynamically.

- [ ] **Step 3: Replace old summary/results-grid HTML with fixed dashboard skeleton**

In `index.html`, replace the standalone summary + `#results-grid` with:

```html
<section id="dashboard" class="dashboard" aria-label="Connection and leak summary">
  <article id="connection-panel" class="dashboard-panel connection-hero">
    <div class="panel-heading">
      <div>
        <p class="eyebrow">Your connection</p>
        <h2>Public IP</h2>
      </div>
      <span id="overall-status" class="status-pill" data-status="idle">Starting</span>
    </div>
    <div id="connection-body" aria-live="polite"></div>
    <p id="overall-message" class="connection-message">The available checks start automatically.</p>
    <div id="top-findings" class="top-findings"></div>
  </article>

  <div class="dashboard-secondary">
    <article id="leak-panel" class="dashboard-panel">
      <div class="panel-heading"><h2>Leak checks</h2><span id="leak-status" class="compact-status">Running</span></div>
      <div id="leak-body"></div>
    </article>
    <article id="privacy-panel" class="dashboard-panel">
      <div class="panel-heading"><h2>Privacy</h2><span id="privacy-status" class="compact-status">Running</span></div>
      <div id="privacy-body"></div>
    </article>
  </div>
</section>
```

Do not create separate IPv4/IPv6/WebRTC/Privacy articles elsewhere.

- [ ] **Step 4: Replace dynamic card registry with panel refs and focused row utilities**

At top of `assets/app.js` import:

```js
import { buildConnectionView, buildLeakView, buildPrivacyView } from './dashboard-view.js';
```

Replace `grid`, `cards`, `createCard()`, `bodyFor()` with refs:

```js
const connectionBody = document.querySelector('#connection-body');
const leakBody = document.querySelector('#leak-body');
const privacyBody = document.querySelector('#privacy-body');
const leakStatus = document.querySelector('#leak-status');
const privacyStatus = document.querySelector('#privacy-status');
```

Add generic row helper:

```js
function summaryRows(parent, entries) {
  const list = document.createElement('div');
  list.className = 'summary-list';
  for (const entry of entries) {
    if (entry?.value == null || entry.value === '') continue;
    const row = document.createElement('div');
    row.className = `summary-row${entry.tone ? ` summary-row-${entry.tone}` : ''}`;
    const label = document.createElement('span');
    label.className = 'summary-row-label';
    label.textContent = entry.label;
    const value = document.createElement('span');
    value.className = 'summary-row-value';
    if (entry.value instanceof Node) value.append(entry.value); else value.textContent = String(entry.value);
    row.append(label, value);
    list.append(row);
  }
  parent.append(list);
}
```

- [ ] **Step 5: Implement `renderConnection(ipv4, ipv6, assessment)`**

Required behavior:

```js
function renderConnection(ipv4, ipv6, assessment = currentReport?.assessment ?? null) {
  const view = buildConnectionView({ ipv4, ipv6, assessment });
  connectionBody.replaceChildren();
  const primary = view.primary;

  if (!primary.address) {
    text(connectionBody, primary.state === 'checking' ? 'Checking public IP…' : 'Public IP unavailable', 'connection-primary-empty');
  } else {
    text(connectionBody, primary.address, 'connection-address');
    if (primary.locationState === 'available') {
      const geo = primary.family === 4 ? ipv4?.geo : ipv6?.geo;
      const line = document.createElement('div');
      line.className = 'connection-location';
      line.append(locationNode(geo));
      connectionBody.append(line);
    } else if (primary.locationState === 'locating') {
      text(connectionBody, 'Locating…', 'connection-meta');
    }
    if (primary.network) text(connectionBody, primary.network, 'connection-meta');
  }

  const primaryLabel = `IPv${primary.family}`;
  const rows = [{ label:primaryLabel, value:primary.address ? primary.sourceText ?? 'Checking…' : primary.state === 'checking' ? 'Checking…' : 'Not detected' }];
  const secondary = view.secondary;
  rows.push({ label:`IPv${secondary.family}`, value:secondary.address ? secondary.address : secondary.state === 'checking' ? 'Checking…' : 'Not detected' });
  summaryRows(connectionBody, rows);
}
```

If secondary IPv6 exists, append an additional compact location/network/source line under its address; it must not become another large card.

- [ ] **Step 6: Preserve progressive rendering using shared live family state**

Inside `runCore()` replace direct `renderIp(cardName(...))` calls with a per-run state:

```js
const liveIp = {
  4: { family:4, address:null, ipFinal:false, geo:null, geoPending:false, geoFinal:false },
  6: { family:6, address:null, ipFinal:false, geo:null, geoPending:false, geoFinal:false }
};

function renderLiveConnection() {
  if (currentRunId !== expectedRunId) return;
  renderConnection(liveIp[4], liveIp[6], currentReport?.assessment ?? null);
}
```

`handleFirstIp()` updates `liveIp[family]` and immediately calls `renderLiveConnection()`. First GeoIP callback updates only the matching current family/address and calls it again. `finalizeFamily()` writes final consensus into `liveIp[family]` before/after final GeoIP.

Do not wait for WebRTC before calling `renderLiveConnection()`.

- [ ] **Step 7: Implement compact `renderLeakChecks()` with native WebRTC details**

Use Task 1 view:

```js
function renderLeakChecks(webrtc, ipv4, ipv6) {
  const view = buildLeakView({ webrtc, ipv4, ipv6 });
  leakBody.replaceChildren();
  leakStatus.textContent = view.status === 'leak' ? 'Leak detected' : view.status === 'clear' ? 'Clear' : 'Unavailable';

  if (view.publicMismatch) {
    summaryRows(leakBody, [{ label:'WebRTC public IP', value:view.mismatchAddresses.join(', '), tone:'danger' }]);
    text(leakBody, 'Public WebRTC address differs from HTTP public IP.', 'inline-danger');
  } else {
    summaryRows(leakBody, [
      { label:'WebRTC public IP', value:view.publicAddresses.length ? 'No mismatch' : 'Not exposed' },
      { label:'Local address privacy', value:view.mdnsProtection ? 'mDNS protected' : 'Review details' }
    ]);
  }

  const details = document.createElement('details');
  details.className = 'panel-details';
  const summary = document.createElement('summary');
  summary.textContent = 'WebRTC details';
  details.append(summary);
  // append current candidate counts/privacy fields/full candidate list here
  leakBody.append(details);
}
```

Reuse `describeCandidate()` and existing candidate rendering. Do not remove fields from `currentReport.webrtc`.

- [ ] **Step 8: Implement compact `renderPrivacy()`**

Use `buildPrivacyView()`; summary rows visible, routine fields inside a native `details` element. Do not append the old duplicate sentence `Browser timezone differs from IP timezone.`.

- [ ] **Step 9: Update `runCore()` completion rendering**

Final completion must call:

```js
renderConnection(ipv4, ipv6, assessment);
renderLeakChecks(webrtc, ipv4, ipv6);
renderPrivacy(browser, privacy);
renderOverall(assessment);
```

At run start set connection/leak/privacy panels to `Checking…` without relying on the deleted `cards` Map.

- [ ] **Step 10: Add initial dashboard CSS**

Add:

```css
.dashboard{display:grid;gap:14px}
.dashboard-panel{min-width:0;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:18px}
.connection-hero{padding:22px}
.panel-heading{display:flex;align-items:center;justify-content:space-between;gap:14px}
.panel-heading h2{margin:0;font-size:1rem}
.connection-address{margin:18px 0 6px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:clamp(1.65rem,4vw,2.5rem);font-weight:750;letter-spacing:-.035em;overflow-wrap:anywhere}
.connection-location,.connection-meta,.connection-message{margin-top:7px;color:var(--muted);font-size:.9rem;overflow-wrap:anywhere}
.dashboard-secondary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;align-items:start}
.summary-list{display:grid;margin-top:14px}
.summary-row{display:grid;grid-template-columns:minmax(120px,.8fr) minmax(0,1.2fr);gap:14px;padding:9px 0;border-top:1px solid var(--border);font-size:.88rem;line-height:1.4}
.summary-row-label{color:var(--muted)}
.summary-row-value{min-width:0;overflow-wrap:anywhere;text-align:right}
.summary-row-review{color:var(--warning)}
.summary-row-danger{color:var(--danger)}
.compact-status{color:var(--muted);font-size:.78rem;font-weight:700}
.panel-details{margin-top:8px;border-top:1px solid var(--border)}
.panel-details>summary{cursor:pointer;min-height:44px;display:flex;align-items:center;color:var(--muted);font-size:.86rem;font-weight:700}
```

- [ ] **Step 11: Run focused tests**

Run:

```bash
node --test tests/dashboard-view.test.js tests/compact-dashboard-ui.test.js tests/progressive-core.test.js tests/assessment.test.js
```

Expected: PASS. Existing progressive-core test may require updating source-level assertions from `renderIp` to `renderConnection`, but it must still prove first-valid/first-GeoIP callbacks occur before final consensus.

- [ ] **Step 12: Commit**

```bash
git add index.html assets/app.js assets/styles.css tests/compact-dashboard-ui.test.js tests/progressive-core.test.js
git commit -m "feat: replace core cards with compact dashboard"
```

---

### Task 3: Compact Advanced Diagnostics + TLS Unavailable UX

**Files:**
- Modify: `assets/app.js`
- Modify: `assets/styles.css`
- Modify: `tests/dashboard-view.test.js`
- Modify: `tests/compact-dashboard-ui.test.js`

**Interfaces:**
- Consumes `buildAdvancedRowView()` from Task 1.
- Replaces `advancedCard(title)` with:

```js
advancedDisclosure({ id, title, status, summary }) -> { root, body }
```

The returned `root` is a native `<details>` row; `body` contains technical fields only when available.

- [ ] **Step 1: Add failing successful-TLS view test**

Append to `tests/dashboard-view.test.js`:

```js
test('successful advanced row is expandable and keeps only populated fields supplied by renderer', () => {
  const view = buildAdvancedRowView({
    id:'tls', title:'TLS fingerprint',
    result:{ status:'complete', observedIp:'198.51.100.4', tlsVersion:'TLS 1.3', ja3Hash:'abc', ja4:'def' },
    summary:'TLS 1.3 · JA4 available'
  });
  assert.equal(view.statusLabel, 'Complete');
  assert.equal(view.expandable, true);
  assert.equal(view.summary, 'TLS 1.3 · JA4 available');
});
```

- [ ] **Step 2: Add failing static test forbidding old Advanced card grid abstraction**

Append:

```js
test('advanced diagnostics use disclosure rows instead of equal card grid', () => {
  assert.doesNotMatch(app, /function advancedCard\(/);
  assert.match(app, /function advancedDisclosure\(/);
  assert.match(css, /\.advanced-row/);
});
```

- [ ] **Step 3: Run focused tests to verify RED**

Run:

```bash
node --test tests/dashboard-view.test.js tests/compact-dashboard-ui.test.js
```

Expected: FAIL on old `advancedCard` implementation / successful advanced view semantics if not implemented yet.

- [ ] **Step 4: Implement `advancedDisclosure()`**

In `app.js`:

```js
function advancedDisclosure({ id, title, status, summary }) {
  const root = document.createElement('details');
  root.className = `advanced-row advanced-row-${status}`;
  root.dataset.advancedId = id;
  const head = document.createElement('summary');
  head.className = 'advanced-row-summary';
  const label = document.createElement('span'); label.textContent = title;
  const brief = document.createElement('span'); brief.className = 'advanced-row-brief'; brief.textContent = summary || status;
  head.append(label, brief);
  const body = document.createElement('div'); body.className = 'advanced-row-body';
  root.append(head, body); advancedResults.append(root);
  return { root, body };
}
```

For unavailable rows set `root.open = false`; body may contain only one explanatory sentence. Do not append field rows containing synthetic `Unavailable` placeholders.

- [ ] **Step 5: Refactor TLS rendering first**

Replace current TLS block with:

```js
const tlsAvailable = ['complete','partial'].includes(tlsFingerprint.status);
const tls = advancedDisclosure({
  id:'tls',
  title:'TLS fingerprint',
  status:tlsAvailable ? tlsFingerprint.status : 'unavailable',
  summary:tlsAvailable
    ? [tlsFingerprint.tlsVersion, tlsFingerprint.httpVersion, tlsFingerprint.ja4 ? 'JA4 available' : null].filter(Boolean).join(' · ') || 'Available'
    : 'Unavailable'
});
if (!tlsAvailable) {
  text(tls.body, tlsFingerprint.error || 'External reflector could not be reached. Use Run advanced again to retry.', 'card-detail');
} else {
  rows(tls.body, [
    ['Observed IP', tlsFingerprint.observedIp],
    ['HTTP', tlsFingerprint.httpVersion],
    ['TLS', tlsFingerprint.tlsVersion],
    ['ALPN', tlsFingerprint.alpn?.join(', ') || null],
    ['JA3 hash', tlsFingerprint.ja3Hash],
    ['JA4', tlsFingerprint.ja4],
    ['Ciphers', tlsFingerprint.cipherSummary],
    ['Extensions', tlsFingerprint.extensionSummary],
    ['HTTP/2 fingerprint', tlsFingerprint.http2Fingerprint]
  ]);
}
```

The existing `rows()` helper already skips null/empty values, so successful TLS shows only populated fields.

- [ ] **Step 6: Convert remaining Advanced cards to disclosure rows**

Required row IDs/titles:

```text
network-v4 / IPv4 network
network-v6 / IPv6 network
fingerprint / Fingerprint exposure
environment / Environment consistency
stun / STUN comparison
stun-mapping / STUN mapping
http / HTTP request path
browser / Browser privacy surface
```

Merge network intelligence + reverse DNS for each active family as today, but keep one disclosure per family. Do not create empty IPv6 Advanced row when no IPv6 address exists.

The loading state is one compact `.advanced-loading` line, not a fake Advanced card.

- [ ] **Step 7: Add compact Advanced CSS**

```css
.advanced-grid{display:grid;grid-template-columns:1fr;gap:0;padding:0 18px 18px}
.advanced-row{border-top:1px solid var(--border)}
.advanced-row:first-child{border-top:0}
.advanced-row-summary{list-style:none;cursor:pointer;min-height:50px;display:grid;grid-template-columns:minmax(0,1fr) minmax(120px,.8fr);gap:16px;align-items:center;font-size:.9rem;font-weight:700}
.advanced-row-summary::-webkit-details-marker{display:none}
.advanced-row-brief{color:var(--muted);font-weight:600;text-align:right;overflow-wrap:anywhere}
.advanced-row-unavailable .advanced-row-brief{color:var(--muted)}
.advanced-row-body{padding:0 0 14px}
.advanced-loading{padding:0 18px 18px;color:var(--muted);font-size:.88rem}
```

- [ ] **Step 8: Run Advanced/TLS regressions**

Run:

```bash
node --test tests/dashboard-view.test.js tests/compact-dashboard-ui.test.js tests/tls-fingerprint.test.js tests/max-diagnostics.test.js
```

Expected: PASS. TLS normalization/network behavior remains unchanged; only presentation changes.

- [ ] **Step 9: Commit**

```bash
git add assets/app.js assets/styles.css tests/dashboard-view.test.js tests/compact-dashboard-ui.test.js
git commit -m "feat: compact advanced diagnostics UI"
```

---

### Task 4: Group Interactive Workflows Under Active Tests

**Files:**
- Modify: `index.html`
- Modify: `assets/styles.css`
- Modify: `assets/guided-leak.css`
- Modify: `tests/compact-dashboard-ui.test.js`
- Test: `tests/guided-app-integration.test.js`
- Test: `tests/guided-leak-ui.test.js`

**Interfaces:**
- Existing runtime IDs remain unchanged:
  - Guided: `guided-section`, `guided-primary`, `guided-secondary`, `guided-clear`, `guided-result`, `guided-exposures`, `guided-paths`, `guided-coverage`, `media-webrtc-button`, `media-webrtc-status`, `media-webrtc-result`.
  - Kill Switch: `monitor-section`, `monitor-toggle`, `monitor-status`, `monitor-timeline`.
  - Aggressive: `aggressive-section`, `aggressive-toggle`, `aggressive-status`, `aggressive-progress`, `aggressive-summary`, `aggressive-exposures`, `aggressive-timeline`.
- New containers:
  - `#active-tests`
  - `#guided-test-disclosure`
  - `#monitor-test-disclosure`
  - `#aggressive-test-disclosure`

- [ ] **Step 1: Add failing Active tests structure test**

Append:

```js
test('interactive workflows are grouped as idle-collapsed Active tests disclosures', () => {
  for (const id of ['active-tests','guided-test-disclosure','monitor-test-disclosure','aggressive-test-disclosure']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /Guided VPN Leak Test/);
  assert.match(html, /Kill Switch test/);
  assert.match(html, /Aggressive Leak Test/);
});

test('existing interactive runtime IDs are preserved', () => {
  for (const id of ['guided-primary','guided-clear','monitor-toggle','monitor-status','aggressive-toggle','aggressive-progress']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
});
```

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
node --test tests/compact-dashboard-ui.test.js
```

Expected: FAIL because the Active tests grouping does not exist.

- [ ] **Step 3: Wrap existing test sections in native disclosures without changing inner IDs**

In `index.html` after Advanced:

```html
<section id="active-tests" class="active-tests" aria-labelledby="active-tests-heading">
  <div class="section-heading">
    <div>
      <p class="eyebrow">Optional</p>
      <h2 id="active-tests-heading">Active tests</h2>
    </div>
    <p>Run stronger checks only when you need them.</p>
  </div>

  <details id="guided-test-disclosure" class="active-test-row">
    <summary><span>Guided VPN Leak Test</span><span class="active-test-meta">Recommended</span></summary>
    <!-- existing #guided-section content, same IDs -->
  </details>

  <details id="monitor-test-disclosure" class="active-test-row">
    <summary><span>Kill Switch test</span><span class="active-test-meta">Manual</span></summary>
    <!-- existing #monitor-section content, same IDs -->
  </details>

  <details id="aggressive-test-disclosure" class="active-test-row">
    <summary><span>Aggressive Leak Test</span><span class="active-test-meta">60 seconds</span></summary>
    <!-- existing #aggressive-section content, same IDs -->
  </details>
</section>
```

Remove duplicated outer `.monitor-shell` visual borders from the inner sections by adding `active-test-content` class. Do not mark any disclosure `open` by default.

- [ ] **Step 4: Ensure disclosure toggle has no lifecycle listener**

Do not add `toggle` handlers that call `.start()`, `.stop()`, `runCore()` or clear state. Existing diagnostic lifecycle remains bound only to existing action buttons.

Add static assertion:

```js
test('collapsing Active test disclosures has no stop/start lifecycle wiring', () => {
  assert.doesNotMatch(app, /guided-test-disclosure[^\n]*addEventListener\(['"]toggle/);
  assert.doesNotMatch(app, /monitor-test-disclosure[^\n]*addEventListener\(['"]toggle/);
  assert.doesNotMatch(app, /aggressive-test-disclosure[^\n]*addEventListener\(['"]toggle/);
});
```

- [ ] **Step 5: Add Active tests CSS**

```css
.active-tests{margin-top:14px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden}
.section-heading{display:flex;align-items:end;justify-content:space-between;gap:18px;padding:18px}
.section-heading h2{margin:0;font-size:1.05rem}.section-heading>p{margin:0;color:var(--muted);font-size:.86rem}
.active-test-row{border-top:1px solid var(--border)}
.active-test-row>summary{cursor:pointer;min-height:56px;padding:0 18px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px;align-items:center;font-weight:750;list-style:none}
.active-test-row>summary::-webkit-details-marker{display:none}
.active-test-meta{color:var(--muted);font-size:.8rem;font-weight:650}
.active-test-content{border:0;border-radius:0;margin:0;padding:18px;background:transparent}
.active-test-row[open]>summary{background:var(--surface-alt)}
```

In `guided-leak.css`, change `.guided-shell { margin-top: 1rem; }` to no outer margin when `.active-test-content.guided-shell` and retain internal grids/controls.

- [ ] **Step 6: Run interactive regression suite**

Run:

```bash
node --test tests/compact-dashboard-ui.test.js tests/guided-app-integration.test.js tests/guided-leak-ui.test.js tests/aggressive-leak-render.test.js tests/aggressive-leak-test.test.js tests/monitor.test.js
```

If a named render/monitor test file differs in repository, use the existing corresponding file discovered by `npm run check`; do not add duplicate behavior tests simply for file naming.

Expected: PASS and all existing runtime IDs remain available.

- [ ] **Step 7: Commit**

```bash
git add index.html assets/styles.css assets/guided-leak.css tests/compact-dashboard-ui.test.js
git commit -m "feat: group interactive checks under Active tests"
```

---

### Task 5: Density, Mobile and Semantic-State Polish

**Files:**
- Modify: `assets/styles.css`
- Modify: `assets/app.js`
- Modify: `tests/compact-dashboard-ui.test.js`
- Modify: `tests/dashboard-view.test.js`

**Interfaces:**
- No new network/report API.
- Uses current view models/renderers.

- [ ] **Step 1: Add failing semantic-label tests**

Append to `tests/dashboard-view.test.js`:

```js
test('completed absence is not called unavailable', () => {
  const view = buildConnectionView({
    ipv4: ip4,
    ipv6: { family:6, status:'unavailable', address:null, ipFinal:true, geoFinal:true }
  });
  assert.equal(view.secondary.state, 'not-detected');
});

test('both public families absent produce public-IP unavailable hero', () => {
  const view = buildConnectionView({
    ipv4:{ family:4, address:null, ipFinal:true },
    ipv6:{ family:6, address:null, ipFinal:true }
  });
  assert.equal(view.primary.address, null);
  assert.equal(view.primary.state, 'not-detected');
});
```

- [ ] **Step 2: Add failing CSS/mobile source assertions**

Append:

```js
test('mobile dashboard becomes one column and long technical values can wrap', () => {
  assert.match(css, /@media\(max-width:620px\)/);
  assert.match(css, /\.dashboard-secondary\{grid-template-columns:1fr/);
  assert.match(css, /overflow-wrap:anywhere/);
});
```

- [ ] **Step 3: Run tests to verify RED where polish rules are missing**

Run:

```bash
node --test tests/dashboard-view.test.js tests/compact-dashboard-ui.test.js
```

- [ ] **Step 4: Finish responsive behavior**

Within existing `@media(max-width:620px)` add/ensure:

```css
.dashboard-secondary{grid-template-columns:1fr}
.connection-hero{padding:17px}
.connection-address{font-size:clamp(1.45rem,8vw,2rem)}
.summary-row{grid-template-columns:minmax(0,1fr) auto;gap:10px}
.summary-row-value{text-align:right;overflow-wrap:anywhere;word-break:break-word}
.section-heading{align-items:stretch;flex-direction:column;gap:7px}
.active-test-row>summary{padding:0 14px;min-height:54px}
.active-test-content{padding:14px}
.advanced-row-summary{grid-template-columns:minmax(0,1fr);gap:3px;padding:8px 0}
.advanced-row-brief{text-align:left}
```

All monospace technical classes (`connection-address`, candidate, STUN, JA3/JA4 values inherited through `.detail-value`) must have `overflow-wrap:anywhere` and no fixed width/min-width causing horizontal scroll.

- [ ] **Step 5: Reduce routine visual noise**

Remove obsolete `.results-grid`, `.result-card` styling only after no runtime/test uses it. Keep generic helpers (`.card-detail`, `.detail-list`, `.detail-row`, candidate styles) because expanded technical content still uses them.

Remove forced equal-height assumptions; `.dashboard-secondary` uses `align-items:start`.

De-emphasize successful state labels with muted text; danger/review only use accent colors when semantic.

- [ ] **Step 6: Keep important findings visible near hero**

`renderOverall()` continues populating `#top-findings`. Ensure chips appear in `connection-panel` under the short overall message and only non-info findings are shown as today.

For `Leak detected`, ensure `.status-pill[data-status="leak"]` and mismatch row both include visible text, not color only.

- [ ] **Step 7: Run focused + UI regression**

Run:

```bash
node --test tests/dashboard-view.test.js tests/compact-dashboard-ui.test.js tests/progressive-core.test.js tests/assessment.test.js tests/network-assessment.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add assets/styles.css assets/app.js tests/dashboard-view.test.js tests/compact-dashboard-ui.test.js
git commit -m "style: polish compact dashboard density and mobile layout"
```

---

### Task 6: Static Validation, README and Exact-HEAD Regression

**Files:**
- Modify: `scripts/validate-static.mjs`
- Modify: `README.md`
- Modify: `tests/compact-dashboard-ui.test.js` only if final structure assertions need to match the implemented markup.

**Interfaces:**
- No runtime API changes.

- [ ] **Step 1: Extend static validator for new structure**

Replace old assumptions about `results-grid` if any, and require:

```js
const dashboardIds = [
  'dashboard', 'connection-panel', 'connection-body', 'leak-panel', 'leak-body',
  'privacy-panel', 'privacy-body', 'advanced-details', 'active-tests',
  'guided-test-disclosure', 'monitor-test-disclosure', 'aggressive-test-disclosure'
];
for (const id of dashboardIds) {
  if (!html.includes(`id="${id}"`)) throw new Error(`Compact dashboard control is missing: ${id}`);
}
```

Keep all current Guided IDs validation, single `./assets/app.js` module entry validation and forbidden fake-placeholder checks.

Add `assets/dashboard-view.js` to `required` so import/path validation covers it.

- [ ] **Step 2: Update README core UI description**

Replace wording that implies four equal core cards with concise structure:

```text
Core results are progressively rendered into a compact dashboard:
- Your connection: primary public IP, location/network metadata, source agreement and compact IPv6 state;
- Leak checks: WebRTC/public-IP mismatch summary with raw ICE evidence under Details;
- Privacy: meaningful consistency signals first, routine browser metadata under Details;
- Advanced diagnostics: lazy compact rows that expand only when technical evidence is needed.
```

Document that unavailable Advanced services remain third-party availability issues and do not become leak evidence.

Document Active tests as collapsed optional workflows and explicitly state collapsing their UI does not stop a running test.

- [ ] **Step 3: Run the full suite**

Run:

```bash
npm run check
```

Expected: all Node tests, static validation and build pass with zero failures.

- [ ] **Step 4: Inspect final scope diff against `main`**

Run:

```bash
git diff main...HEAD --stat
git diff main...HEAD -- index.html assets/app.js assets/dashboard-view.js assets/styles.css assets/guided-leak.css scripts/validate-static.mjs README.md
```

Expected: UI/view-model/tests/docs only. No changes to IP provider algorithms, GeoIP consensus, assessment severity, Guided/Aggressive/Monitor algorithms, DNS/torrent/email feature flags or backend scope.

- [ ] **Step 5: Run a final placeholder/obsolete-layout scan**

Run:

```bash
grep -R "createCard('ipv4\|createCard('ipv6\|results-grid\|Backend required\|Coming soon" index.html assets tests scripts || true
```

Expected: no obsolete primary-card creation or forbidden placeholders. If `.results-grid` remains only in an intentional historical test/doc, remove or update that stale reference before completion.

- [ ] **Step 6: Commit final validator/docs changes**

```bash
git add scripts/validate-static.mjs README.md tests/compact-dashboard-ui.test.js
git commit -m "docs: describe compact diagnostics dashboard"
```

- [ ] **Step 7: Verify exact final feature SHA in GitHub Actions**

Wait for the `Test` workflow generated by the final commit. Verify its `npm run check` step is `success` for the exact final `feature/compact-dashboard-ui` SHA. Do not merge based on an earlier green commit.

---

## Spec Coverage Self-Review

- Public IP is the dominant result: Task 2 hero.
- Separate IPv6 card removed; unavailable IPv6 one row: Tasks 1–2.
- IPv6-only primary case: Task 1 tests + Task 2 renderer.
- Progressive IP/GeoIP preserved: Task 2 shared live-family state + existing progressive regression.
- Healthy WebRTC compact; mismatch address visible: Tasks 1–2.
- Raw ICE candidates one interaction away: Task 2 native Details.
- Privacy summary vs routine metadata: Tasks 1–2.
- Duplicate timezone warning removed: Tasks 1–2 tests.
- Advanced compact disclosure list: Task 3.
- TLS unavailable one concise state; populated fields only on success: Task 3.
- No unsupported precise CORS diagnosis: Global constraints + Task 3 copy.
- Active tests grouped/collapsed idle: Task 4.
- Existing runtime IDs/state preserved and collapse does not stop tests: Task 4 tests.
- Consumer-style reduced borders/spacing: Tasks 2, 4, 5.
- Desktop two-column secondary area without forced equal height: Tasks 2 and 5.
- Mobile single-column/no technical overflow: Task 5.
- Current report/Copy JSON unchanged: no report schema changes in any task; full regression Task 6.
- Accessibility/native disclosures/focus: Tasks 2–4 use `details/summary`; existing focus-visible global style remains.
- Semantic `Not detected` vs `Unavailable`: Tasks 1 and 5.
- Validator/docs/exact-head CI: Task 6.

Placeholder scan: no TBD/TODO/future interfaces are required for implementation. The only optional source-file change from the spec (`tls-fingerprint.js`) is explicitly rejected as unnecessary unless a test proves the current structured `status/error` is insufficient, so the plan has one deterministic implementation path.

Type consistency: `buildConnectionView`, `buildLeakView`, `buildPrivacyView`, `buildAdvancedRowView` are defined in Task 1 and consumed with the same names/shapes in later tasks. DOM IDs introduced in Task 2/4 match Task 6 validator names exactly.
