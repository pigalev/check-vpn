# Max Static Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the static GitHub Pages VPN checker into a resilient browser-only diagnostics suite with multi-source IP consensus, cross-family leak analysis, privacy mismatch checks, lazy advanced network diagnostics, and an interactive Kill Switch/IP-change monitor.

**Architecture:** Split data collection and assessment into focused modules. Core checks run automatically and feed a structured findings engine; heavy third-party calls are started once when `Advanced details` opens. The UI renders compact primary cards plus a lazy advanced section, while every network provider fails independently and successful results are retained.

**Tech Stack:** Vanilla ES modules, browser Web APIs, WebRTC ICE/STUN, public HTTPS/CORS APIs, DNS-over-HTTPS JSON APIs, Node.js 22 `node:test`, existing static build/validation scripts.

## Global Constraints

- Static GitHub Pages only; no project-owned backend in this iteration.
- Do not label reverse DNS, third-party DoH, HTTP echo, or STUN observations as authoritative DNS/torrent/email leak tests.
- Core automatic checks: public IPv4/IPv6 consensus, GeoIP consensus, aggregate WebRTC, browser/timezone privacy summary, IPv4/IPv6 cross-family assessment.
- Lazy Advanced checks: network intelligence, reverse DNS, extra STUN diagnostics, HTTP path inspection, full browser privacy surface.
- One failing provider must never erase successful data from another provider.
- `Leak detected` is reserved for strong address exposure/bypass evidence; weak privacy/network inconsistencies produce `Review`.
- Advanced network calls run once per core run unless the user explicitly chooses `Run advanced again`.
- Kill Switch monitoring never starts automatically, samples lightweight IP endpoints at a configurable 5-second target interval, keeps history in memory only, and records every address change.
- No analytics, persistent history, tracking IDs, fingerprint hashes, canvas/audio/WebGL uniqueness probes, or hidden fingerprint collection.
- Phone layouts must remain single-column and horizontally scroll-free; controls must remain at least 44px high.
- All external endpoints and timeouts live in `assets/config.js`.
- Final feature-branch CI must pass `npm run check`.

---

### Task 1: Multi-provider public IP consensus

**Files:**
- Create: `assets/ip-consensus.js`
- Modify: `assets/config.js`
- Modify: `assets/ip-tests.js` only if compatibility wrappers are required
- Create: `tests/ip-consensus.test.js`
- Modify: `tests/config.test.js`

**Interfaces:**
- Produces `runIpConsensus({ family, providers, timeoutMs, fetchImpl }) -> { status, family, address, agreement, sources, error }`.
- Each source result has `{ id, label, status, address, family, latencyMs, error }`.
- `agreement` contains `{ available, total, agree, counts }`.

- [ ] **Step 1: Write failing consensus tests** covering three-provider agreement, one-provider fallback, disagreement majority, tie/no-consensus behavior, family validation, and independent provider timeout/error.
- [ ] **Step 2: Run `npm run check` and confirm the new tests fail because `ip-consensus.js` does not exist.**
- [ ] **Step 3: Add configured IPv4 and IPv6 provider arrays.** Each provider declares `id`, `label`, `url`, and response `kind`; use HTTPS endpoints only and keep the current ipify endpoints as one provider per family.
- [ ] **Step 4: Implement response normalizers and `runIpConsensus`.** Use `Promise.all`, per-provider timing, address-family validation, majority counting, and preserve source errors without throwing the whole consensus.
- [ ] **Step 5: Run `npm run check` and confirm consensus/config tests pass.**
- [ ] **Step 6: Commit `feat: add public IP consensus`.**

### Task 2: Browser privacy surface and timezone comparison

**Files:**
- Modify: `assets/browser-info.js`
- Create: `assets/privacy-assessment.js`
- Modify: `tests/browser-info.test.js`
- Create: `tests/privacy-assessment.test.js`

**Interfaces:**
- `collectBrowserInfo(environment)` expands with `languages`, `timezone`, `secureContext`, `gpc`, `doNotTrack`, `screen`, `viewport`, `devicePixelRatio`, `hardwareConcurrency`, `deviceMemoryGb`, `maxTouchPoints`, `cookieEnabled`, `userAgentData` while preserving existing fields.
- `assessPrivacy({ browser, ipv4, ipv6 }) -> { browserTimezone, ipTimezones, timezoneMatch, findings }`.

- [ ] **Step 1: Add failing browser-info tests** for full support and unsupported APIs using fake environments.
- [ ] **Step 2: Add failing timezone-assessment tests** for matching timezone, mismatch, missing GeoIP timezone, and IPv4/IPv6 conflicting timezones.
- [ ] **Step 3: Implement browser surface normalization without permission prompts or fingerprint hashes.**
- [ ] **Step 4: Implement timezone findings with severity `review` only for real browser-vs-IP mismatch and `info` for insufficient data.**
- [ ] **Step 5: Run `npm run check` and commit `feat: add browser privacy assessment`.**

### Task 3: WebRTC summary helpers and cross-family network analysis

**Files:**
- Modify: `assets/webrtc-test.js`
- Create: `assets/network-assessment.js`
- Modify: `tests/webrtc-test.test.js`
- Create: `tests/network-assessment.test.js`

**Interfaces:**
- `summarizeCandidates(candidates) -> { host, srflx, relay, ipv4, ipv6, udp, tcp, publicAddresses }`.
- `assessAddressFamilies({ ipv4, ipv6, webrtc }) -> findings[]` evaluates WebRTC mismatch and IPv4/IPv6 network differences using HTTP addresses plus GeoIP ASN/org/country evidence.

- [ ] **Step 1: Add failing candidate-summary tests** for candidate type, family, transport and unique public-address counts.
- [ ] **Step 2: Add failing cross-family tests** for same network, ASN-only difference, country+organization difference, absent IPv6, and public WebRTC mismatch.
- [ ] **Step 3: Implement pure summary and assessment functions.** Do not call network APIs from these functions.
- [ ] **Step 4: Use `leak` only when a WebRTC public address does not match any HTTP address or when IPv6 evidence combines materially different ownership/location with tunnel-bypass evidence; otherwise emit `review` or `info`.**
- [ ] **Step 5: Run `npm run check` and commit `feat: add address path assessment`.**

### Task 4: Structured top-level finding aggregation

**Files:**
- Refactor: `assets/assessment.js`
- Modify/Create: `tests/assessment.test.js`

**Interfaces:**
- Every finding: `{ id, severity: 'info'|'review'|'leak', category, summary, details, sources }`.
- `assessResults({ ipv4, ipv6, webrtc, privacy, network, monitorFindings }) -> { status: 'protected'|'review'|'leak'|'incomplete', message, findings }`.

- [ ] **Step 1: Add failing tests** proving severity precedence `leak > review > protected`, `incomplete` for insufficient core address data, and informational findings do not downgrade `protected`.
- [ ] **Step 2: Refactor current assessment into the structured model while retaining a concise human-readable message.**
- [ ] **Step 3: Run `npm run check` and commit `refactor: structure diagnostic findings`.**

### Task 5: Network intelligence

**Files:**
- Create: `assets/network-intelligence.js`
- Modify: `assets/config.js`
- Create: `tests/network-intelligence.test.js`

**Interfaces:**
- `runNetworkIntelligence({ ip, endpointTemplate, timeoutMs, fetchImpl })` returns normalized `{ status, ip, rir, isMobile, isSatellite, isCrawler, isDatacenter, isTor, isProxy, isVpn, isAbuser, asn, organization, prefix, networkType, rawProvider, error }`.

- [ ] **Step 1: Add failing tests** using representative `ipapi.is` payloads for security flags, `company`/`asn` fields, missing optional objects, API errors, and fetch failures.
- [ ] **Step 2: Configure the HTTPS endpoint `https://api.ipapi.is/?q={ip}` and a separate advanced timeout.**
- [ ] **Step 3: Implement normalization so false means an actual negative database classification and fetch/API failure remains `Unavailable`.**
- [ ] **Step 4: Run `npm run check` and commit `feat: add IP network intelligence`.**

### Task 6: Reverse DNS through independent DoH resolvers

**Files:**
- Create: `assets/reverse-dns.js`
- Modify: `assets/config.js`
- Create: `tests/reverse-dns.test.js`

**Interfaces:**
- `toReverseDnsName(ip)` supports IPv4 `in-addr.arpa` and fully expanded/nibble-reversed IPv6 `ip6.arpa`.
- `runReverseDns({ ip, resolvers, timeoutMs, fetchImpl }) -> { status, ip, names, agreement, sources, error }`.

- [ ] **Step 1: Add failing reverse-name tests** for representative IPv4 and compressed IPv6 addresses.
- [ ] **Step 2: Add failing DoH tests** for Cloudflare/Google JSON responses, `NOERROR` with no PTR, resolver disagreement, one-resolver failure, and total failure.
- [ ] **Step 3: Configure Cloudflare JSON DoH and Google JSON DoH resolvers.** Cloudflare requests set `Accept: application/dns-json`; Google uses `https://dns.google/resolve`.
- [ ] **Step 4: Implement PTR normalization where an empty successful answer is `No PTR record`, not `Unavailable`.**
- [ ] **Step 5: Run `npm run check` and commit `feat: add reverse DNS diagnostics`.**

### Task 7: HTTP path inspection

**Files:**
- Create: `assets/http-inspection.js`
- Modify: `assets/config.js`
- Create: `tests/http-inspection.test.js`

**Interfaces:**
- `runHttpInspection({ endpoint, timeoutMs, fetchImpl }) -> { status, observedIp, headers, proxyHeaders, error }`.
- `headers` exposes only useful server-observed fields; `proxyHeaders` contains actually present `Via`, `Forwarded`, `X-Forwarded-For` values.

- [ ] **Step 1: Add failing tests** for echo payload normalization, proxy-header presence, absent headers, CORS/fetch failure, and an endpoint that omits server-observed IP.
- [ ] **Step 2: Configure one CORS request-echo endpoint; treat this check as best-effort and isolated.**
- [ ] **Step 3: Implement normalization that never equates inaccessible/missing echo metadata with proof that a header was not sent.**
- [ ] **Step 4: Run `npm run check` and commit `feat: add HTTP path inspection`.**

### Task 8: Advanced STUN diagnostics

**Files:**
- Modify/Create focused helpers in `assets/webrtc-test.js` or create `assets/stun-diagnostics.js` if isolation keeps the code clearer
- Modify: `assets/config.js`
- Modify/Create corresponding tests

**Interfaces:**
- `runStunDiagnostic({ stunUrl, timeoutMs, peerConnectionFactory }) -> { status, server, candidates, publicAddresses, transports, latencyMs, attribution, error }`.
- Attribution is `isolated` only because each diagnostic creates its own RTCPeerConnection configured with one STUN server.

- [ ] **Step 1: Add failing tests** for isolated srflx collection, timeout, no public candidate, and per-server address comparison.
- [ ] **Step 2: Implement one-peer-connection-per-STUN-server diagnostics using the existing candidate parser.**
- [ ] **Step 3: Do not claim precise NAT type; expose only address/transport consistency hints.**
- [ ] **Step 4: Run `npm run check` and commit `feat: add advanced STUN diagnostics`.**

### Task 9: Kill Switch/IP-change monitor state machine

**Files:**
- Create: `assets/monitor.js`
- Modify: `assets/config.js`
- Create: `tests/monitor.test.js`

**Interfaces:**
- Pure reducer/state helpers manage `{ running, startedAt, sampleCount, current, baseline, events }`.
- `createIpMonitor({ sample, intervalMs, now, setIntervalImpl, clearIntervalImpl, onUpdate })` exposes `start()` and `stop()`.
- Change events: `{ timestamp, family, previousAddress, address }` and generate a `leak` finding labelled `Public IP changed during monitoring`.

- [ ] **Step 1: Add failing state tests** for start, repeated stable samples, IPv4 change, IPv6 appearance/disappearance/change, return to baseline, and stop.
- [ ] **Step 2: Implement monitoring around lightweight IP consensus sampling without GeoIP/intelligence on every interval.**
- [ ] **Step 3: Preserve every change event in memory even when an earlier address returns.**
- [ ] **Step 4: Run `npm run check` and commit `feat: add kill switch IP monitor`.**

### Task 10: Lazy Advanced orchestration and UI rendering

**Files:**
- Refactor: `assets/app.js`
- Create: `assets/render.js` if needed to keep orchestration focused
- Modify: `index.html`
- Modify: `assets/styles.css`
- Modify/Create static validation tests as required

**Interfaces:**
- Core run produces `{ ipv4, ipv6, webrtc, browser, privacy, assessment }`.
- Advanced run cache is tied to the current core-run ID and contains `{ intelligence, reverseDns, stun, httpInspection, browser }`.
- Opening `<details id="advanced-details">` triggers advanced checks only if the current run has no cache.

- [ ] **Step 1: Add static/test expectations** for an `Advanced details` section, `Run advanced again`, Privacy primary card, and Kill Switch controls.
- [ ] **Step 2: Replace single-endpoint core IP calls with `runIpConsensus` and feed consensus addresses into existing GeoIP.**
- [ ] **Step 3: Render compact primary cards:** IPv4, IPv6, WebRTC, Privacy. Show public-IP source agreement and preserve existing GeoIP flags/source count.
- [ ] **Step 4: Render structured top findings below the overall pill without dumping all informational findings on the main screen.**
- [ ] **Step 5: Add native `<details>` Advanced section and lazy orchestration for intelligence, PTR, per-STUN, HTTP inspection, provider/source tables, and full browser surface.**
- [ ] **Step 6: Add Kill Switch controls/timeline and feed monitor change findings into the visible monitor state without mutating the original core diagnosis.**
- [ ] **Step 7: Add `Run advanced again` that invalidates only the advanced cache. `Run again` creates a new core-run ID and invalidates advanced data.**
- [ ] **Step 8: Style all source lists and timelines responsively; below the mobile breakpoint use stacked rows, `overflow-wrap:anywhere`, and 44px minimum control heights.**
- [ ] **Step 9: Run `npm run check` and commit `feat: build max static diagnostics UI`.**

### Task 11: Documentation, privacy copy, and build validation

**Files:**
- Modify: `README.md`
- Modify: static validator/build script if it enumerates modules
- Modify: related validator tests

**Interfaces:**
- Documentation lists automatic vs lazy checks and clearly marks third-party classifications as best-effort.

- [ ] **Step 1: Update README** with public-IP consensus, advanced services, repeated monitor requests, browser-memory-only behavior, external provider privacy caveat, and explicit out-of-scope backend tests.
- [ ] **Step 2: Update static build validation** so every new ES module is copied/validated in `_site` and no hidden placeholder cards for DNS/torrent/email are introduced.
- [ ] **Step 3: Run the full `npm run check`.**
- [ ] **Step 4: Inspect CI for the exact feature-branch head and require the `npm run check` step to complete successfully.**
- [ ] **Step 5: Commit `docs: document max static diagnostics`.**

### Task 12: Final review

**Files:**
- All changed files

- [ ] **Step 1: Compare `main...feature/max-static-diagnostics` and verify the branch is based on current `main` with no unrelated changes.**
- [ ] **Step 2: Review every `leak` path against the spec and confirm no GeoIP/VPN-classification/timezone-only signal can produce a false leak.**
- [ ] **Step 3: Review every external fetch path and confirm partial failure cannot erase a successful core IP result.**
- [ ] **Step 4: Confirm Advanced checks do not run on initial load and Kill Switch monitoring never starts automatically.**
- [ ] **Step 5: Confirm final feature-branch CI is green before offering integration options.**
