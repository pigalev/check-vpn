# Check VPN GitHub Pages MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a minimal English-language static VPN leak checker for GitHub Pages that detects public IPv4, public IPv6, WebRTC candidates, browser/network metadata, and produces a qualified assessment plus copyable JSON.

**Architecture:** Use plain ES modules, HTML, and CSS with no framework and no runtime dependencies. Network checks are isolated from presentation code, return normalized result objects, and are covered by Node's built-in test runner. A build script copies only deployable assets into `_site`, and GitHub Actions validates and deploys that directory.

**Tech Stack:** HTML5, CSS, JavaScript ES modules, Node.js 22 built-in `node:test`, GitHub Actions, GitHub Pages.

## Global Constraints

- The visible interface is English only.
- Use plain HTML, CSS, and JavaScript without React or a build framework.
- Keep the design restrained and responsive; no decorative widgets or unnecessary controls.
- Display only enabled checks; DNS, torrent, and email checks are hidden completely.
- Do not show placeholders such as “Backend required”, “Coming soon”, or disabled cards.
- Do not claim that a VPN is definitely safe.
- Do not treat request failures as leaks or successful results.
- Do not persist test results, use analytics, or set cookies.
- Isolate public IP endpoints and STUN server configuration so they can later be replaced by the user's VPS.
- Use request timeouts and allow independent checks to complete even if another check fails.

---

## File map

- `index.html` — semantic page shell and stable DOM hooks.
- `assets/styles.css` — minimal responsive styling and status states.
- `assets/config.js` — feature flags, endpoint URLs, STUN servers, and timeout constants.
- `assets/network.js` — IP family detection, candidate address classification, and common timeout helpers.
- `assets/ip-tests.js` — IPv4 and IPv6 HTTP checks.
- `assets/webrtc-test.js` — ICE candidate collection and normalization.
- `assets/browser-info.js` — browser-exposed environment and connection metadata.
- `assets/assessment.js` — qualified cross-check assessment rules.
- `assets/app.js` — orchestration, rendering, button handling, and JSON copy action.
- `tests/network.test.js` — address classification tests.
- `tests/ip-tests.test.js` — IP response, timeout, and error normalization tests.
- `tests/webrtc-test.test.js` — ICE parsing and collection tests.
- `tests/assessment.test.js` — result qualification tests.
- `tests/config.test.js` — feature visibility configuration tests.
- `scripts/validate-static.mjs` — static file and import validation.
- `scripts/build-site.mjs` — deterministic `_site` creation.
- `package.json` — Node scripts and ES module mode.
- `.github/workflows/test.yml` — validation on pushes and pull requests.
- `.github/workflows/pages.yml` — Pages deployment from `main` after tests pass.
- `README.md` — scope, local usage, privacy, external dependencies, and future VPS integration.

---

### Task 1: Project foundation and feature configuration

**Files:**
- Create: `package.json`
- Create: `assets/config.js`
- Create: `tests/config.test.js`

**Interfaces:**
- Produces: `features: Readonly<Record<string, boolean>>`
- Produces: `networkConfig: Readonly<{ ipv4Endpoint: string, ipv6Endpoint: string, stunUrls: string[], requestTimeoutMs: number, webrtcTimeoutMs: number }>`
- Produces: `getEnabledChecks(featuresConfig): string[]`

- [ ] **Step 1: Write the failing configuration tests**

```js
// tests/config.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { features, getEnabledChecks, networkConfig } from '../assets/config.js';

test('only GitHub Pages-capable checks are enabled', () => {
  assert.deepEqual(getEnabledChecks(features), ['ipv4', 'ipv6', 'webrtc']);
  assert.equal(features.dns, false);
  assert.equal(features.torrent, false);
  assert.equal(features.email, false);
});

test('network endpoints and timeouts are configured', () => {
  assert.match(networkConfig.ipv4Endpoint, /^https:\/\//);
  assert.match(networkConfig.ipv6Endpoint, /^https:\/\//);
  assert.ok(networkConfig.stunUrls.every((url) => url.startsWith('stun:')));
  assert.ok(networkConfig.requestTimeoutMs >= 3000);
  assert.ok(networkConfig.webrtcTimeoutMs >= 3000);
});
```

- [ ] **Step 2: Run the tests and verify failure**

Run: `node --test tests/config.test.js`

Expected: FAIL because `assets/config.js` does not exist.

- [ ] **Step 3: Add package metadata and scripts**

```json
{
  "name": "check-vpn",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test",
    "validate": "node scripts/validate-static.mjs",
    "build": "node scripts/build-site.mjs",
    "check": "npm run test && npm run validate && npm run build"
  },
  "engines": {
    "node": ">=22"
  }
}
```

- [ ] **Step 4: Implement immutable feature and network configuration**

```js
// assets/config.js
export const features = Object.freeze({
  ipv4: true,
  ipv6: true,
  webrtc: true,
  dns: false,
  torrent: false,
  email: false
});

export const networkConfig = Object.freeze({
  ipv4Endpoint: 'https://api4.ipify.org?format=json',
  ipv6Endpoint: 'https://api6.ipify.org?format=json',
  stunUrls: Object.freeze([
    'stun:stun.cloudflare.com:3478',
    'stun:stun.l.google.com:19302'
  ]),
  requestTimeoutMs: 6000,
  webrtcTimeoutMs: 7000
});

export function getEnabledChecks(config = features) {
  return ['ipv4', 'ipv6', 'webrtc'].filter((name) => config[name] === true);
}
```

- [ ] **Step 5: Run the tests and verify success**

Run: `npm test -- tests/config.test.js`

Expected: 2 tests pass.

- [ ] **Step 6: Commit the foundation**

```bash
git add package.json assets/config.js tests/config.test.js
git commit -m "chore: initialize static VPN checker"
```

---

### Task 2: Address classification and HTTP IP checks

**Files:**
- Create: `assets/network.js`
- Create: `assets/ip-tests.js`
- Create: `tests/network.test.js`
- Create: `tests/ip-tests.test.js`

**Interfaces:**
- Produces: `getIpFamily(address: string): 4 | 6 | null`
- Produces: `classifyAddress(address: string): 'public' | 'private' | 'loopback' | 'link-local' | 'mdns' | 'invalid'`
- Produces: `fetchJsonWithTimeout(url: string, options?: { timeoutMs?: number, fetchImpl?: typeof fetch }): Promise<unknown>`
- Produces: `runIpTest({ family: 4 | 6, endpoint: string, timeoutMs: number, fetchImpl?: typeof fetch }): Promise<IpResult>`
- Produces result shape: `{ status: 'complete' | 'unavailable' | 'error', address: string | null, family: 4 | 6, error: string | null }`

- [ ] **Step 1: Write failing address classification tests**

```js
// tests/network.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyAddress, getIpFamily } from '../assets/network.js';

test('detects IPv4 and IPv6 families', () => {
  assert.equal(getIpFamily('203.0.113.10'), 4);
  assert.equal(getIpFamily('2001:db8::10'), 6);
  assert.equal(getIpFamily('device.local'), null);
});

test('classifies non-public candidates', () => {
  assert.equal(classifyAddress('127.0.0.1'), 'loopback');
  assert.equal(classifyAddress('192.168.1.20'), 'private');
  assert.equal(classifyAddress('169.254.5.1'), 'link-local');
  assert.equal(classifyAddress('fe80::1'), 'link-local');
  assert.equal(classifyAddress('host-123.local'), 'mdns');
});

test('classifies valid public addresses', () => {
  assert.equal(classifyAddress('8.8.8.8'), 'public');
  assert.equal(classifyAddress('2606:4700:4700::1111'), 'public');
});
```

- [ ] **Step 2: Write failing HTTP IP tests**

```js
// tests/ip-tests.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { runIpTest } from '../assets/ip-tests.js';

test('normalizes a valid IPv4 response', async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ ip: '203.0.113.10' })
  });

  assert.deepEqual(await runIpTest({
    family: 4,
    endpoint: 'https://example.test/v4',
    timeoutMs: 100,
    fetchImpl
  }), {
    status: 'complete',
    address: '203.0.113.10',
    family: 4,
    error: null
  });
});

test('rejects an address from the wrong family', async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ ip: '2001:db8::10' })
  });

  const result = await runIpTest({
    family: 4,
    endpoint: 'https://example.test/v4',
    timeoutMs: 100,
    fetchImpl
  });

  assert.equal(result.status, 'error');
  assert.equal(result.address, null);
});

test('reports an unreachable family as unavailable', async () => {
  const fetchImpl = async () => {
    throw new TypeError('Failed to fetch');
  };

  const result = await runIpTest({
    family: 6,
    endpoint: 'https://example.test/v6',
    timeoutMs: 100,
    fetchImpl
  });

  assert.equal(result.status, 'unavailable');
  assert.equal(result.address, null);
});
```

- [ ] **Step 3: Run tests and verify failure**

Run: `node --test tests/network.test.js tests/ip-tests.test.js`

Expected: FAIL because both implementation modules are missing.

- [ ] **Step 4: Implement address parsing and classification**

Implement `assets/network.js` with these rules:

```js
export function getIpFamily(address) {
  if (typeof address !== 'string' || address.length === 0) return null;
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(address)) {
    const octets = address.split('.').map(Number);
    return octets.every((part) => part >= 0 && part <= 255) ? 4 : null;
  }
  return address.includes(':') && /^[0-9a-f:]+$/i.test(address) ? 6 : null;
}

export function classifyAddress(address) {
  if (typeof address !== 'string' || address.length === 0) return 'invalid';
  const value = address.toLowerCase();
  if (value.endsWith('.local')) return 'mdns';

  const family = getIpFamily(value);
  if (family === 4) {
    const [a, b] = value.split('.').map(Number);
    if (a === 127) return 'loopback';
    if (a === 169 && b === 254) return 'link-local';
    if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return 'private';
    return 'public';
  }

  if (family === 6) {
    if (value === '::1') return 'loopback';
    if (value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb')) return 'link-local';
    if (value.startsWith('fc') || value.startsWith('fd')) return 'private';
    return 'public';
  }

  return 'invalid';
}
```

Add `fetchJsonWithTimeout` using `AbortController`, clearing the timer in `finally`.

- [ ] **Step 5: Implement normalized IPv4 and IPv6 checks**

```js
// assets/ip-tests.js
import { fetchJsonWithTimeout, getIpFamily } from './network.js';

export async function runIpTest({ family, endpoint, timeoutMs, fetchImpl = fetch }) {
  try {
    const payload = await fetchJsonWithTimeout(endpoint, { timeoutMs, fetchImpl });
    const address = typeof payload?.ip === 'string' ? payload.ip.trim() : '';
    if (getIpFamily(address) !== family) {
      return { status: 'error', address: null, family, error: `Invalid IPv${family} response` };
    }
    return { status: 'complete', address, family, error: null };
  } catch (error) {
    const unavailable = error?.name === 'AbortError' || error instanceof TypeError;
    return {
      status: unavailable ? 'unavailable' : 'error',
      address: null,
      family,
      error: unavailable ? `IPv${family} connectivity was not detected` : 'IP check failed'
    };
  }
}
```

- [ ] **Step 6: Run tests and verify success**

Run: `node --test tests/network.test.js tests/ip-tests.test.js`

Expected: all tests pass.

- [ ] **Step 7: Commit the network checks**

```bash
git add assets/network.js assets/ip-tests.js tests/network.test.js tests/ip-tests.test.js
git commit -m "feat: add IPv4 and IPv6 checks"
```

---

### Task 3: WebRTC ICE candidate collection

**Files:**
- Create: `assets/webrtc-test.js`
- Create: `tests/webrtc-test.test.js`

**Interfaces:**
- Consumes: `classifyAddress(address)` and `getIpFamily(address)` from `assets/network.js`
- Produces: `parseIceCandidate(candidateLine: string): IceCandidateRecord | null`
- Produces: `runWebRtcTest({ stunUrls: string[], timeoutMs: number, RTCPeerConnectionImpl?: typeof RTCPeerConnection }): Promise<WebRtcResult>`
- `IceCandidateRecord`: `{ address: string, family: 4 | 6 | null, protocol: string, type: string, classification: string }`
- `WebRtcResult`: `{ status: 'complete' | 'unavailable' | 'error', candidates: IceCandidateRecord[], publicAddresses: string[], error: string | null }`

- [ ] **Step 1: Write failing ICE parsing tests**

```js
// tests/webrtc-test.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIceCandidate } from '../assets/webrtc-test.js';

test('parses a server-reflexive public candidate', () => {
  assert.deepEqual(
    parseIceCandidate('candidate:1 1 udp 2122260223 203.0.113.10 54400 typ srflx raddr 192.168.1.5 rport 54400'),
    {
      address: '203.0.113.10',
      family: 4,
      protocol: 'udp',
      type: 'srflx',
      classification: 'public'
    }
  );
});

test('parses an mDNS host candidate without treating it as public', () => {
  const result = parseIceCandidate('candidate:2 1 udp 2122194687 host-123.local 53544 typ host');
  assert.equal(result.address, 'host-123.local');
  assert.equal(result.classification, 'mdns');
  assert.equal(result.family, null);
});

test('returns null for malformed candidates', () => {
  assert.equal(parseIceCandidate('not-a-candidate'), null);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `node --test tests/webrtc-test.test.js`

Expected: FAIL because `assets/webrtc-test.js` does not exist.

- [ ] **Step 3: Implement candidate parsing**

```js
export function parseIceCandidate(candidateLine) {
  if (typeof candidateLine !== 'string' || !candidateLine.startsWith('candidate:')) return null;
  const parts = candidateLine.trim().split(/\s+/);
  if (parts.length < 8) return null;
  const typeIndex = parts.indexOf('typ');
  if (typeIndex < 0 || !parts[typeIndex + 1]) return null;

  const address = parts[4];
  return {
    address,
    family: getIpFamily(address),
    protocol: parts[2].toLowerCase(),
    type: parts[typeIndex + 1].toLowerCase(),
    classification: classifyAddress(address)
  };
}
```

- [ ] **Step 4: Add a fake peer connection collection test**

Create a minimal fake class in `tests/webrtc-test.test.js` that emits one public candidate and then a null candidate after `setLocalDescription`. Assert that `runWebRtcTest` deduplicates addresses and closes the connection.

```js
class FakePeerConnection {
  static closed = false;
  constructor() { this.onicecandidate = null; }
  createDataChannel() {}
  async createOffer() { return { type: 'offer', sdp: 'fake' }; }
  async setLocalDescription() {
    queueMicrotask(() => {
      this.onicecandidate?.({ candidate: { candidate: 'candidate:1 1 udp 1 203.0.113.10 5000 typ srflx' } });
      this.onicecandidate?.({ candidate: null });
    });
  }
  close() { FakePeerConnection.closed = true; }
}
```

- [ ] **Step 5: Implement WebRTC collection with timeout and cleanup**

`runWebRtcTest` must:

1. Return `unavailable` when no peer connection implementation exists.
2. Construct `new RTCPeerConnectionImpl({ iceServers: [{ urls: stunUrls }] })`.
3. Create an empty data channel, offer, and local description.
4. Parse each emitted candidate.
5. Deduplicate candidate records by `address|protocol|type`.
6. Resolve when the null candidate arrives or the timeout expires.
7. Always call `close()`.
8. Return only candidates classified as `public` in `publicAddresses`.

- [ ] **Step 6: Run WebRTC tests and verify success**

Run: `node --test tests/webrtc-test.test.js`

Expected: all WebRTC tests pass.

- [ ] **Step 7: Commit WebRTC support**

```bash
git add assets/webrtc-test.js tests/webrtc-test.test.js
git commit -m "feat: add WebRTC candidate detection"
```

---

### Task 4: Browser metadata and qualified assessment

**Files:**
- Create: `assets/browser-info.js`
- Create: `assets/assessment.js`
- Create: `tests/assessment.test.js`

**Interfaces:**
- Produces: `collectBrowserInfo(environment?: Window & typeof globalThis): BrowserInfo`
- Produces: `assessResults({ ipv4, ipv6, webrtc }): Assessment`
- `BrowserInfo`: `{ userAgent: string, language: string, platform: string, online: boolean, connection: null | { effectiveType: string | null, downlinkMbps: number | null, rttMs: number | null, saveData: boolean | null } }`
- `Assessment`: `{ status: 'ok' | 'warning' | 'incomplete', message: string, mismatchedAddresses: string[] }`

- [ ] **Step 1: Write failing assessment tests**

```js
// tests/assessment.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { assessResults } from '../assets/assessment.js';

const completeIp = (family, address) => ({ status: 'complete', family, address, error: null });

test('reports no mismatch when WebRTC matches HTTP addresses', () => {
  const result = assessResults({
    ipv4: completeIp(4, '203.0.113.10'),
    ipv6: { status: 'unavailable', family: 6, address: null, error: null },
    webrtc: { status: 'complete', publicAddresses: ['203.0.113.10'], candidates: [], error: null }
  });
  assert.deepEqual(result, {
    status: 'ok',
    message: 'No public address mismatch detected.',
    mismatchedAddresses: []
  });
});

test('warns when WebRTC exposes a different public address', () => {
  const result = assessResults({
    ipv4: completeIp(4, '203.0.113.10'),
    ipv6: { status: 'unavailable', family: 6, address: null, error: null },
    webrtc: { status: 'complete', publicAddresses: ['198.51.100.25'], candidates: [], error: null }
  });
  assert.equal(result.status, 'warning');
  assert.deepEqual(result.mismatchedAddresses, ['198.51.100.25']);
});

test('qualifies the result when a core check is incomplete', () => {
  const result = assessResults({
    ipv4: { status: 'unavailable', family: 4, address: null, error: null },
    ipv6: { status: 'unavailable', family: 6, address: null, error: null },
    webrtc: { status: 'unavailable', publicAddresses: [], candidates: [], error: null }
  });
  assert.equal(result.status, 'incomplete');
});
```

- [ ] **Step 2: Run assessment tests and verify failure**

Run: `node --test tests/assessment.test.js`

Expected: FAIL because `assets/assessment.js` does not exist.

- [ ] **Step 3: Implement conservative assessment rules**

```js
// assets/assessment.js
export function assessResults({ ipv4, ipv6, webrtc }) {
  const observed = new Set(
    [ipv4?.address, ipv6?.address].filter(Boolean)
  );
  const webRtcPublic = Array.isArray(webrtc?.publicAddresses) ? webrtc.publicAddresses : [];
  const mismatchedAddresses = webRtcPublic.filter((address) => !observed.has(address));

  if (mismatchedAddresses.length > 0) {
    return {
      status: 'warning',
      message: 'WebRTC exposed a public address that differs from the HTTP results.',
      mismatchedAddresses
    };
  }

  const httpComplete = ipv4?.status === 'complete' || ipv6?.status === 'complete';
  const webRtcComplete = webrtc?.status === 'complete';
  if (!httpComplete || !webRtcComplete) {
    return {
      status: 'incomplete',
      message: 'The available checks completed without a confirmed mismatch, but the result is incomplete.',
      mismatchedAddresses: []
    };
  }

  return {
    status: 'ok',
    message: 'No public address mismatch detected.',
    mismatchedAddresses: []
  };
}
```

- [ ] **Step 4: Implement browser and connection metadata collection**

`collectBrowserInfo` reads only browser-exposed fields and never requests extra permissions. Use optional chaining for `navigator.connection`, `navigator.mozConnection`, and `navigator.webkitConnection`. Normalize absent numeric values to `null`.

- [ ] **Step 5: Run all tests and verify success**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 6: Commit assessment and metadata logic**

```bash
git add assets/browser-info.js assets/assessment.js tests/assessment.test.js
git commit -m "feat: add result assessment and browser metadata"
```

---

### Task 5: Minimal responsive interface and application orchestration

**Files:**
- Create: `index.html`
- Create: `assets/styles.css`
- Create: `assets/app.js`

**Interfaces:**
- Consumes all previous modules.
- Produces DOM IDs: `run-tests`, `copy-json`, `overall-status`, `overall-message`, `ipv4-card`, `ipv6-card`, `webrtc-card`, `browser-card`, and child `[data-field]` hooks.
- Produces in-memory `currentReport` with ISO timestamps and normalized test results.

- [ ] **Step 1: Create semantic page structure**

`index.html` must contain:

```html
<header class="site-header">
  <div>
    <p class="eyebrow">Network diagnostics</p>
    <h1>VPN Leak Check</h1>
    <p class="intro">Compare the public addresses exposed by HTTP and WebRTC.</p>
  </div>
  <button id="run-tests" type="button">Run tests</button>
</header>

<main>
  <section class="summary" aria-live="polite">
    <span id="overall-status" class="status-pill">Not run</span>
    <p id="overall-message">Start the checks to inspect this connection.</p>
  </section>

  <section id="results-grid" class="results-grid" aria-label="Test results">
    <!-- IPv4, IPv6, WebRTC, and browser cards only -->
  </section>

  <footer class="report-actions">
    <button id="copy-json" type="button" disabled>Copy JSON</button>
  </footer>
</main>
```

No HTML for DNS, torrent, or email checks may exist in the deployed page.

- [ ] **Step 2: Add restrained responsive styling**

`assets/styles.css` must include:

- a centered maximum-width layout;
- system font stack;
- CSS custom properties for neutral background, surface, text, border, success, warning, and muted states;
- a one-column grid on narrow screens and two columns from `720px`;
- visible keyboard focus;
- `prefers-reduced-motion` support;
- no animations beyond a subtle running opacity change;
- automatic light/dark adaptation using `prefers-color-scheme` without a theme toggle.

- [ ] **Step 3: Implement feature-aware rendering**

In `assets/app.js`, construct card renderers from `getEnabledChecks(features)`. Browser information is always rendered. Disabled features must not create DOM nodes.

Use a normalized display map:

```js
const labels = {
  idle: 'Not run',
  running: 'Running',
  complete: 'Complete',
  unavailable: 'Unavailable',
  error: 'Error'
};
```

Error details stay concise, such as `IPv6 connectivity was not detected.`

- [ ] **Step 4: Orchestrate independent concurrent checks**

`runAllTests` must:

1. Disable both buttons while a run is active.
2. Record `startedAt` as an ISO timestamp.
3. Set enabled cards to `running`.
4. Call IPv4, IPv6, and WebRTC checks through `Promise.allSettled`.
5. Convert unexpected rejected promises to normalized error results.
6. Collect browser information synchronously.
7. Run `assessResults` after all checks settle.
8. Record `completedAt`.
9. Render each result independently.
10. Enable `Copy JSON` when a report exists.

- [ ] **Step 5: Implement report copying without persistence**

Use `navigator.clipboard.writeText(JSON.stringify(currentReport, null, 2))`. If Clipboard API is unavailable, create a temporary hidden textarea, select its contents, call `document.execCommand('copy')`, then remove it. Change the button text to `Copied` briefly, then restore `Copy JSON`.

- [ ] **Step 6: Perform manual browser verification**

Run a local static server:

```bash
python -m http.server 8080
```

Open `http://localhost:8080` and verify:

- only IPv4, IPv6, WebRTC, browser/network, and summary sections appear;
- the page is usable at 375px and desktop width;
- one failed endpoint does not prevent other cards from completing;
- WebRTC private or mDNS candidates do not trigger a mismatch warning;
- copy produces valid JSON;
- rerunning replaces the report rather than appending history.

- [ ] **Step 7: Commit the interface**

```bash
git add index.html assets/styles.css assets/app.js
git commit -m "feat: add minimal VPN leak checker interface"
```

---

### Task 6: Static validation, build, CI, Pages deployment, and documentation

**Files:**
- Create: `scripts/validate-static.mjs`
- Create: `scripts/build-site.mjs`
- Create: `.github/workflows/test.yml`
- Create: `.github/workflows/pages.yml`
- Create: `README.md`

**Interfaces:**
- Produces: `_site/index.html` and `_site/assets/*` after `npm run build`.
- Produces CI command: `npm run check`.

- [ ] **Step 1: Implement static validation**

`scripts/validate-static.mjs` must:

1. Assert that `index.html`, `assets/styles.css`, `assets/config.js`, `assets/app.js`, and all imported modules exist.
2. Assert that `index.html` references `./assets/styles.css` and `./assets/app.js`.
3. Assert that the deployed HTML does not contain the strings `Backend required`, `Coming soon`, `DNS leak`, `Torrent leak`, or `Email leak`.
4. Exit with code 1 and a readable message on failure.

- [ ] **Step 2: Implement deterministic site build**

`scripts/build-site.mjs` must delete `_site`, recreate it, copy `index.html`, and recursively copy `assets`. It must not copy `tests`, `docs`, `.github`, or development scripts.

- [ ] **Step 3: Run full local verification**

Run: `npm run check`

Expected:

- all Node tests pass;
- static validation passes;
- `_site/index.html` exists;
- `_site/assets/app.js` exists.

- [ ] **Step 4: Add the test workflow**

```yaml
# .github/workflows/test.yml
name: Test

on:
  push:
  pull_request:

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm install --ignore-scripts
      - run: npm run check
```

Because the project has no dependencies, commit the generated `package-lock.json` after the first `npm install` so Actions cache configuration has a lock file.

- [ ] **Step 5: Add the Pages deployment workflow**

```yaml
# .github/workflows/pages.yml
name: Deploy Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

environment:
  name: github-pages
  url: ${{ steps.deployment.outputs.page_url }}

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm install --ignore-scripts
      - run: npm run check
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: _site

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 6: Document usage and privacy boundaries**

`README.md` must state:

- current visible checks;
- why DNS, torrent, and email are absent;
- how to run locally with `python -m http.server 8080`;
- how to run `npm run check`;
- that the GitHub Pages-only version contacts ipify, Cloudflare STUN, and Google STUN according to configuration;
- that no analytics, cookies, or persistent history are used;
- how future VPS endpoints replace values in `assets/config.js`;
- that GitHub repository Settings → Pages must use `GitHub Actions` as the source if it is not selected automatically.

- [ ] **Step 7: Commit deployment and documentation**

```bash
git add scripts .github README.md package-lock.json
git commit -m "ci: add validation and GitHub Pages deployment"
```

---

### Task 7: Final verification and release readiness

**Files:**
- Verify all created files.
- Modify only files required by failed checks.

**Interfaces:**
- Produces a deployable `main` branch with passing workflows.

- [ ] **Step 1: Run the complete check suite**

Run: `npm run check`

Expected: zero failures and a fresh `_site` directory.

- [ ] **Step 2: Inspect the deploy artifact**

Run:

```bash
find _site -maxdepth 3 -type f | sort
```

Expected deploy files:

```text
_site/assets/app.js
_site/assets/assessment.js
_site/assets/browser-info.js
_site/assets/config.js
_site/assets/ip-tests.js
_site/assets/network.js
_site/assets/styles.css
_site/assets/webrtc-test.js
_site/index.html
```

- [ ] **Step 3: Serve the built artifact, not the source tree**

Run:

```bash
python -m http.server 8080 --directory _site
```

Verify the full run, copy action, mobile layout, and browser console with no uncaught errors.

- [ ] **Step 4: Push and inspect GitHub Actions**

Push the implementation branch, confirm the `Test` workflow passes, merge to `main`, then confirm `Deploy Pages` succeeds.

- [ ] **Step 5: Confirm the public site behavior**

At the Pages URL, verify:

- HTTPS is active;
- tests start only when the user presses `Run tests`;
- disabled backend-only features are absent;
- external endpoint failures are represented as unavailable or error states;
- the overall text remains qualified and never says the VPN is guaranteed safe.

- [ ] **Step 6: Record final release commit if verification fixes were required**

```bash
git add .
git commit -m "fix: finalize GitHub Pages MVP"
```

Skip this commit when no fixes were necessary.
