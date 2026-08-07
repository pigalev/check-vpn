# Auto-run, GeoIP, and Detailed WebRTC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically run the GitHub Pages checks on load, enrich detected public IPs with location/ASN/provider metadata, and make WebRTC output explicit enough to understand each ICE candidate and HTTP-vs-WebRTC comparison directly in the UI.

**Architecture:** Keep the existing dependency-free ES module architecture. Add a dedicated GeoIP module that enriches an already-detected address, extend WebRTC helpers with candidate presentation/grouping data, then update `app.js` and CSS to render detailed diagnostics while preserving the existing conservative assessment rules. The current GitHub Pages workflows stay intact except static validation/build must include the new module.

**Tech Stack:** HTML5, CSS, JavaScript ES modules, Node.js 22 built-in `node:test`, GitHub Actions, GitHub Pages.

## Global Constraints

- The visible interface is English only.
- Use plain HTML, CSS, and JavaScript without React or a build framework.
- Automatically start IPv4, IPv6, WebRTC, and GeoIP enrichment when the page opens.
- Keep `Run again` as the manual rerun action.
- GeoIP enriches an IP already detected by the IPv4/IPv6 check; it must never replace the authoritative detected address.
- GeoIP failure must not invalidate a successful IP lookup.
- Display country, city/region when available, ASN, and organization/provider in the UI.
- Display each WebRTC ICE candidate with address, candidate type, IP family when known, protocol, and classification.
- For mDNS host candidates, explicitly state that the local address is hidden by the browser.
- Keep HTTP-vs-WebRTC mismatch assessment conservative; matching addresses are not proof that the VPN is fully safe.
- DNS, torrent, and email remain disabled and must not be rendered.
- No analytics, cookies, or persistent history.

---

## File map

- Modify: `assets/config.js` — auto-run and GeoIP endpoint/timeout configuration.
- Create: `assets/geoip.js` — GeoIP URL construction, response normalization, and failure isolation.
- Modify: `assets/webrtc-test.js` — candidate labels/grouping helpers in addition to collection.
- Modify: `assets/app.js` — auto-run, GeoIP orchestration, detailed IP/WebRTC rendering, richer JSON report.
- Modify: `assets/styles.css` — compact structured diagnostic rows and candidate list styling.
- Modify: `index.html` — button text/initial copy only if required by the new flow.
- Modify: `scripts/validate-static.mjs` — require/import-check `assets/geoip.js`.
- Modify: `README.md` — auto-run behavior and third-party GeoIP disclosure.
- Modify: `tests/config.test.js` — auto-run/GeoIP configuration coverage.
- Create: `tests/geoip.test.js` — normalization and failure behavior.
- Modify: `tests/webrtc-test.test.js` — grouping/labels/mDNS coverage.
- Modify: `tests/assessment.test.js` only if comparison regression coverage needs expansion.

---

### Task 1: Add auto-run and GeoIP configuration

**Files:**
- Modify: `assets/config.js`
- Modify: `tests/config.test.js`

**Interfaces:**
- Existing: `features`, `networkConfig`, `getEnabledChecks()`.
- Produces: `appConfig.autoRun: boolean`.
- Produces: `networkConfig.geoIpUrlTemplate: string` containing `{ip}`.
- Produces: `networkConfig.geoIpTimeoutMs: number`.

- [ ] **Step 1: Extend the failing configuration test**

Add assertions to `tests/config.test.js`:

```js
import { appConfig, features, getEnabledChecks, networkConfig } from '../assets/config.js';

test('automatic checks and GeoIP enrichment are configured', () => {
  assert.equal(appConfig.autoRun, true);
  assert.equal(features.geoip, true);
  assert.match(networkConfig.geoIpUrlTemplate, /\{ip\}/);
  assert.ok(networkConfig.geoIpTimeoutMs >= 3000);
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `node --test tests/config.test.js`

Expected: FAIL because `appConfig`, `features.geoip`, and GeoIP network settings do not exist.

- [ ] **Step 3: Implement configuration**

Update `assets/config.js` to include:

```js
export const appConfig = Object.freeze({
  autoRun: true
});

export const features = Object.freeze({
  ipv4: true,
  ipv6: true,
  webrtc: true,
  geoip: true,
  dns: false,
  torrent: false,
  email: false
});

export const networkConfig = Object.freeze({
  ipv4Endpoint: 'https://api4.ipify.org?format=json',
  ipv6Endpoint: 'https://api6.ipify.org?format=json',
  geoIpUrlTemplate: 'https://ipapi.co/{ip}/json/',
  stunUrls: Object.freeze([
    'stun:stun.cloudflare.com:3478',
    'stun:stun.l.google.com:19302'
  ]),
  requestTimeoutMs: 6000,
  geoIpTimeoutMs: 6000,
  webrtcTimeoutMs: 7000
});
```

Keep `getEnabledChecks()` returning only the independently runnable check names `['ipv4', 'ipv6', 'webrtc']`; GeoIP is enrichment, not a standalone card.

- [ ] **Step 4: Run the focused test and verify success**

Run: `node --test tests/config.test.js`

Expected: all config tests pass.

- [ ] **Step 5: Commit configuration**

```bash
git add assets/config.js tests/config.test.js
git commit -m "feat: configure auto-run and GeoIP enrichment"
```

---

### Task 2: Implement GeoIP enrichment without affecting IP validity

**Files:**
- Create: `assets/geoip.js`
- Create: `tests/geoip.test.js`

**Interfaces:**
- Consumes: `fetchJsonWithTimeout(url, options)` from `assets/network.js`.
- Produces: `buildGeoIpUrl(template: string, ip: string): string`.
- Produces: `normalizeGeoIp(payload: unknown, expectedIp: string): GeoIpResult`.
- Produces: `runGeoIpLookup({ ip, urlTemplate, timeoutMs, fetchImpl? }): Promise<GeoIpResult>`.
- `GeoIpResult`: `{ status: 'complete' | 'unavailable' | 'error', ip: string, countryCode: string | null, country: string | null, region: string | null, city: string | null, asn: string | null, org: string | null, timezone: string | null, error: string | null }`.

- [ ] **Step 1: Write failing GeoIP tests**

Create `tests/geoip.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGeoIpUrl, normalizeGeoIp, runGeoIpLookup } from '../assets/geoip.js';

test('builds lookup URL from the already detected address', () => {
  assert.equal(
    buildGeoIpUrl('https://geo.example/{ip}/json/', '2001:db8::10'),
    'https://geo.example/2001%3Adb8%3A%3A10/json/'
  );
});

test('normalizes ipapi-style metadata', () => {
  assert.deepEqual(normalizeGeoIp({
    ip: '203.0.113.10',
    country_code: 'DE',
    country_name: 'Germany',
    region: 'Hesse',
    city: 'Frankfurt am Main',
    asn: 'AS64500',
    org: 'Example Network',
    timezone: 'Europe/Berlin'
  }, '203.0.113.10'), {
    status: 'complete',
    ip: '203.0.113.10',
    countryCode: 'DE',
    country: 'Germany',
    region: 'Hesse',
    city: 'Frankfurt am Main',
    asn: 'AS64500',
    org: 'Example Network',
    timezone: 'Europe/Berlin',
    error: null
  });
});

test('keeps expected IP and reports metadata unavailable when lookup fails', async () => {
  const fetchImpl = async () => { throw new TypeError('Failed to fetch'); };
  const result = await runGeoIpLookup({
    ip: '203.0.113.10',
    urlTemplate: 'https://geo.example/{ip}/json/',
    timeoutMs: 100,
    fetchImpl
  });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.ip, '203.0.113.10');
  assert.equal(result.country, null);
});
```

- [ ] **Step 2: Run GeoIP tests and verify failure**

Run: `node --test tests/geoip.test.js`

Expected: FAIL because `assets/geoip.js` does not exist.

- [ ] **Step 3: Implement the GeoIP module**

Create `assets/geoip.js`:

```js
import { fetchJsonWithTimeout } from './network.js';

function emptyResult(ip, status, error) {
  return {
    status,
    ip,
    countryCode: null,
    country: null,
    region: null,
    city: null,
    asn: null,
    org: null,
    timezone: null,
    error
  };
}

export function buildGeoIpUrl(template, ip) {
  return template.replace('{ip}', encodeURIComponent(ip));
}

export function normalizeGeoIp(payload, expectedIp) {
  if (!payload || typeof payload !== 'object' || payload.error === true) {
    return emptyResult(expectedIp, 'error', 'Location lookup failed.');
  }
  return {
    status: 'complete',
    ip: expectedIp,
    countryCode: typeof payload.country_code === 'string' ? payload.country_code : null,
    country: typeof payload.country_name === 'string' ? payload.country_name : null,
    region: typeof payload.region === 'string' ? payload.region : null,
    city: typeof payload.city === 'string' ? payload.city : null,
    asn: typeof payload.asn === 'string' ? payload.asn : null,
    org: typeof payload.org === 'string' ? payload.org : null,
    timezone: typeof payload.timezone === 'string' ? payload.timezone : null,
    error: null
  };
}

export async function runGeoIpLookup({ ip, urlTemplate, timeoutMs, fetchImpl = fetch }) {
  try {
    const payload = await fetchJsonWithTimeout(buildGeoIpUrl(urlTemplate, ip), { timeoutMs, fetchImpl });
    return normalizeGeoIp(payload, ip);
  } catch (error) {
    const unavailable = error?.name === 'AbortError' || error instanceof TypeError;
    return emptyResult(ip, unavailable ? 'unavailable' : 'error', unavailable ? 'Location unavailable.' : 'Location lookup failed.');
  }
}
```

- [ ] **Step 4: Run GeoIP tests and verify success**

Run: `node --test tests/geoip.test.js`

Expected: all GeoIP tests pass.

- [ ] **Step 5: Commit GeoIP module**

```bash
git add assets/geoip.js tests/geoip.test.js
git commit -m "feat: add GeoIP enrichment"
```

---

### Task 3: Make WebRTC candidates understandable and groupable

**Files:**
- Modify: `assets/webrtc-test.js`
- Modify: `tests/webrtc-test.test.js`

**Interfaces:**
- Existing: `parseIceCandidate()`, `runWebRtcTest()`.
- Produces: `getCandidateGroup(candidate): 'public' | 'local' | 'relay' | 'other'`.
- Produces: `getCandidateLabel(candidate): string`.
- Produces: `describeCandidate(candidate): { group, heading, meta, note }`.

- [ ] **Step 1: Add failing grouping and mDNS tests**

Append to `tests/webrtc-test.test.js`:

```js
import { describeCandidate, getCandidateGroup } from '../assets/webrtc-test.js';

test('groups public srflx candidates as public addresses', () => {
  const candidate = parseIceCandidate('candidate:1 1 udp 1 203.0.113.10 5000 typ srflx');
  assert.equal(getCandidateGroup(candidate), 'public');
  assert.deepEqual(describeCandidate(candidate), {
    group: 'public',
    heading: 'Public address',
    meta: 'srflx · IPv4 · UDP · Public',
    note: 'Address discovered through STUN.'
  });
});

test('explains mDNS host candidates as hidden local addresses', () => {
  const candidate = parseIceCandidate('candidate:2 1 udp 1 host-123.local 5001 typ host');
  assert.equal(getCandidateGroup(candidate), 'local');
  assert.equal(describeCandidate(candidate).heading, 'Local interface');
  assert.equal(describeCandidate(candidate).note, 'Local address hidden by browser (mDNS).');
});

test('groups private host candidates as local interfaces', () => {
  const candidate = parseIceCandidate('candidate:3 1 udp 1 192.168.1.20 5002 typ host');
  assert.equal(getCandidateGroup(candidate), 'local');
  assert.match(describeCandidate(candidate).meta, /Private/);
});
```

- [ ] **Step 2: Run focused WebRTC tests and verify failure**

Run: `node --test tests/webrtc-test.test.js`

Expected: FAIL because presentation helpers do not exist.

- [ ] **Step 3: Implement candidate presentation helpers**

Add to `assets/webrtc-test.js`:

```js
export function getCandidateGroup(candidate) {
  if (candidate?.type === 'relay') return 'relay';
  if (candidate?.classification === 'public') return 'public';
  if (['private', 'link-local', 'loopback', 'mdns'].includes(candidate?.classification)) return 'local';
  return 'other';
}

export function getCandidateLabel(candidate) {
  const map = {
    public: 'Public',
    private: 'Private',
    'link-local': 'Link-local',
    loopback: 'Loopback',
    mdns: 'mDNS protected',
    invalid: 'Unknown'
  };
  return map[candidate?.classification] ?? 'Unknown';
}

export function describeCandidate(candidate) {
  const group = getCandidateGroup(candidate);
  const family = candidate?.family ? `IPv${candidate.family}` : 'Address hidden';
  const heading = group === 'public' ? 'Public address' : group === 'local' ? 'Local interface' : group === 'relay' ? 'Relay' : 'ICE candidate';
  const note = candidate?.classification === 'mdns'
    ? 'Local address hidden by browser (mDNS).'
    : candidate?.type === 'srflx'
      ? 'Address discovered through STUN.'
      : candidate?.type === 'relay'
        ? 'Address provided by a TURN relay.'
        : candidate?.type === 'host'
          ? 'Address exposed by a local browser interface.'
          : '';
  return {
    group,
    heading,
    meta: `${candidate.type} · ${family} · ${candidate.protocol.toUpperCase()} · ${getCandidateLabel(candidate)}`,
    note
  };
}
```

- [ ] **Step 4: Run WebRTC tests and verify success**

Run: `node --test tests/webrtc-test.test.js`

Expected: all WebRTC tests pass.

- [ ] **Step 5: Commit detailed WebRTC helpers**

```bash
git add assets/webrtc-test.js tests/webrtc-test.test.js
git commit -m "feat: describe WebRTC ICE candidates"
```

---

### Task 4: Render GeoIP, detailed WebRTC, and HTTP comparison in the UI

**Files:**
- Modify: `assets/app.js`
- Modify: `assets/styles.css`
- Modify: `index.html`

**Interfaces:**
- Consumes: `appConfig`, GeoIP helpers, WebRTC presentation helpers, existing IP/WebRTC/assessment functions.
- Produces report shape containing `ipv4.geo`, `ipv6.geo`, and detailed `webrtc.candidates` already available to the UI.

- [ ] **Step 1: Update IP card rendering to support structured details**

Replace the single plain detail string for completed IP results with DOM rows equivalent to:

```text
203.0.113.10
Germany · Frankfurt am Main, Hesse
AS64500 · Example Network
```

When GeoIP is unavailable, show:

```text
203.0.113.10
Location unavailable
```

Never change a successful IP result to error because GeoIP failed.

- [ ] **Step 2: Add GeoIP enrichment after each successful IP lookup**

In `runAllTests()`, after the primary IPv4/IPv6 promises settle, run GeoIP in parallel only for successful address results:

```js
const enrichIp = async (result) => {
  if (result?.status !== 'complete' || !result.address || !features.geoip) {
    return { ...result, geo: null };
  }
  const geo = await runGeoIpLookup({
    ip: result.address,
    urlTemplate: networkConfig.geoIpUrlTemplate,
    timeoutMs: networkConfig.geoIpTimeoutMs
  });
  return { ...result, geo };
};

const [ipv4, ipv6] = await Promise.all([
  enrichIp(results.ipv4),
  enrichIp(results.ipv6)
]);
```

Use enriched IPv4/IPv6 objects for rendering and `currentReport`.

- [ ] **Step 3: Replace the flat WebRTC value with a candidate list**

Render every `result.candidates` item as a compact candidate block containing:

```text
Public address
203.0.113.10
srflx · IPv4 · UDP · Public
Address discovered through STUN.
```

For an mDNS candidate:

```text
Local interface
host-123.local
host · Address hidden · UDP · mDNS protected
Local address hidden by browser (mDNS).
```

If no candidates are visible, show a neutral message rather than an empty label.

- [ ] **Step 4: Add HTTP-vs-WebRTC comparison inside the WebRTC card**

Under the candidate list render:

```text
HTTP IPv4        203.0.113.10
HTTP IPv6        Not detected
WebRTC public    203.0.113.10
```

Then render the same qualified assessment message already returned by `assessResults()`.

- [ ] **Step 5: Enable automatic execution**

At the end of `assets/app.js`:

```js
runButton.textContent = 'Run again';
runButton.addEventListener('click', runAllTests);
copyButton.addEventListener('click', copyReport);

if (appConfig.autoRun) {
  queueMicrotask(runAllTests);
}
```

`index.html` should use `Run again` as the button copy from the start to avoid text movement after load.

- [ ] **Step 6: Add compact structured styles**

Extend `assets/styles.css` with focused classes such as:

```css
.detail-list { display: grid; gap: 6px; margin-top: 12px; }
.detail-row { display: grid; grid-template-columns: minmax(90px, 130px) 1fr; gap: 12px; font-size: .88rem; }
.detail-label { color: var(--muted); }
.candidate-list { display: grid; gap: 10px; margin-top: 14px; }
.candidate-item { padding-top: 10px; border-top: 1px solid var(--border); }
.candidate-heading { margin: 0 0 4px; font-size: .82rem; font-weight: 700; color: var(--muted); }
.candidate-address { margin: 0; overflow-wrap: anywhere; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.candidate-meta, .candidate-note { margin: 4px 0 0; color: var(--muted); font-size: .82rem; }
```

On narrow screens, `.detail-row` may collapse to one column.

- [ ] **Step 7: Manually verify the user flow**

Run:

```bash
python -m http.server 8080
```

Verify in a browser:

- checks begin without clicking;
- `Run again` reruns all available checks;
- a successful IP remains visible if GeoIP fails;
- location/ASN/provider are visible when GeoIP succeeds;
- every WebRTC candidate is individually understandable;
- mDNS is explained rather than displayed as an unexplained hostname;
- the WebRTC card shows HTTP-vs-WebRTC comparison;
- JSON does not contain important network facts that are impossible to find in the UI.

- [ ] **Step 8: Commit UI changes**

```bash
git add index.html assets/app.js assets/styles.css
git commit -m "feat: show detailed connection diagnostics"
```

---

### Task 5: Update validation, documentation, and full regression coverage

**Files:**
- Modify: `scripts/validate-static.mjs`
- Modify: `README.md`
- Modify: `tests/assessment.test.js` if needed for explicit HTTP/WebRTC comparison regression.

**Interfaces:**
- Existing `npm run check` remains the release gate.

- [ ] **Step 1: Require the new module in static validation**

Add `assets/geoip.js` to the `required` array in `scripts/validate-static.mjs` so import validation and build completeness cover it.

- [ ] **Step 2: Update README behavior and privacy disclosure**

Document that:

- IPv4, IPv6, WebRTC, and GeoIP enrichment start automatically.
- `Run again` repeats the diagnostics.
- IP addresses are detected by the configured IP endpoints first.
- The detected address is then sent to the configured GeoIP provider (`ipapi.co` in the GitHub Pages version) to retrieve country/city/ASN/provider metadata.
- WebRTC may expose a numeric local address or an mDNS hostname depending on browser privacy behavior.
- No analytics, cookies, or persistent history are used.

- [ ] **Step 3: Run all automated tests**

Run: `npm test`

Expected: zero failures.

- [ ] **Step 4: Run static validation and build**

Run: `npm run check`

Expected:

- all tests pass;
- `Static validation passed.`;
- `Built _site.`;
- `_site/assets/geoip.js` exists.

- [ ] **Step 5: Inspect the built artifact**

Run:

```bash
find _site -maxdepth 3 -type f | sort
```

Expected to include the existing deployment files plus:

```text
_site/assets/geoip.js
```

- [ ] **Step 6: Commit documentation and validation**

```bash
git add scripts/validate-static.mjs README.md tests
git commit -m "docs: document automatic enriched diagnostics"
```

---

### Task 6: Final branch verification and integration readiness

**Files:**
- Verify all modified files; change only what failed verification requires.

- [ ] **Step 1: Run a fresh complete verification**

Run: `npm run check`

Expected: exit code 0 and no test failures.

- [ ] **Step 2: Compare the feature branch with main**

Run:

```bash
git diff --stat main...feature/auto-geo-webrtc
git diff --check main...feature/auto-geo-webrtc
```

Expected: intended files only and no whitespace errors.

- [ ] **Step 3: Verify the built site manually once more**

Run:

```bash
python -m http.server 8080 --directory _site
```

Confirm automatic execution, enriched IP display, candidate explanations, rerun behavior, and JSON copy.

- [ ] **Step 4: Present integration options**

After verification, use the finishing-development-branch workflow. Since the base branch is `main`, offer merge, PR, or keeping the feature branch as-is; do not merge without user choice.