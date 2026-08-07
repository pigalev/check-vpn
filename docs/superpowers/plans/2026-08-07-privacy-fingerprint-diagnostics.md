# Privacy & Fingerprint Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add TLS JA3/JA4 observation, local browser fingerprint exposure diagnostics, environment-consistency checks, richer STUN/NAT mapping hints, and smart Kill Switch event enrichment to the existing GitHub Pages-only privacy checker.

**Architecture:** Keep all new checks Advanced-only and isolated in focused ES modules. Browser-only fingerprint data is computed locally and kept in memory; only the TLS reflector and already-configured GeoIP/intelligence services receive network requests. The existing core VPN leak assessment remains authoritative, while new modules emit only informational or review-level findings unless the Kill Switch has already recorded a hard public-IP change.

**Tech Stack:** Vanilla JavaScript ES modules, browser Canvas/WebGL/WebGPU/OfflineAudioContext APIs, Web Crypto SHA-256, WebRTC ICE/STUN, public HTTPS/CORS reflector APIs, Node.js 22 `node:test`, existing GitHub Actions `npm run check` pipeline.

## Global Constraints

- The compact core screen remains unchanged; all new diagnostics render under `Advanced details`.
- No new permission prompts.
- Canvas/audio digests are computed locally and never transmitted by project code.
- No persistent storage, analytics, fingerprint IDs, or numerical privacy score.
- TLS/fingerprint/environment/STUN-port metadata alone can never produce `Leak detected`.
- Environment contradictions may produce `review`, never `leak`.
- Kill Switch enrichment only explains an address change that the monitor already recorded; enrichment itself never creates a change event.
- Failed third-party calls remain isolated and render `Unavailable` without deleting existing data.
- Transient monitor fetch failures never create IP-change events.
- All external endpoints/timeouts stay configurable in `assets/config.js`.
- Final branch verification requires GitHub Actions `npm run check` success on the exact feature-branch HEAD.

---

### Task 1: TLS reflector normalization

**Files:**
- Create: `assets/tls-fingerprint.js`
- Modify: `assets/config.js`
- Create: `tests/tls-fingerprint.test.js`

**Interfaces:**
- `normalizeTlsFingerprint(payload) -> { status, observedIp, httpVersion, tlsVersion, alpn, ja3, ja3Hash, ja4, cipherSummary, extensionSummary, http2Fingerprint, error }`
- `runTlsFingerprint({ endpoint, timeoutMs, fetchImpl = fetch }) -> normalized result`

- [ ] **Step 1: Write failing tests** for representative `tls.peet.ws/api/all` payloads, missing JA4, missing TLS object, malformed payload, HTTP error, timeout/fetch failure.
- [ ] **Step 2: Run `npm run check` and confirm failure because `tls-fingerprint.js` does not exist.**
- [ ] **Step 3: Add `tlsReflectorEndpoint: 'https://tls.peet.ws/api/all'` and `fingerprintTimeoutMs: 7000` to `networkConfig`.**
- [ ] **Step 4: Implement tolerant schema normalization.** Read nested TLS/HTTP fields defensively; return `partial` when useful TLS data exists but optional fingerprint fields are absent; return `unavailable` for network/CORS failures.
- [ ] **Step 5: Run `npm run check`; commit `feat: add TLS fingerprint diagnostics`.**

### Task 2: Local fingerprint exposure collector

**Files:**
- Create: `assets/fingerprint-exposure.js`
- Create: `tests/fingerprint-exposure.test.js`

**Interfaces:**
- `digestBytes(bytes, subtleCrypto) -> Promise<string|null>`
- `collectCanvasFingerprint(env) -> Promise<{ status, digest, modified, error }>`
- `collectWebGlFingerprint(env) -> { status, version, vendor, renderer, debugRendererExposed, maxTextureSize, maxRenderbufferSize, extensionCount, error }`
- `collectWebGpuFingerprint(env) -> Promise<{ status, supported, adapter, error }>`
- `collectAudioFingerprint(env) -> Promise<{ status, digest, error }>`
- `collectFingerprintExposure(env, { timeoutMs }) -> Promise<{ status, canvas, webgl, webgpu, audio, findings }>`

- [ ] **Step 1: Write failing pure/helper tests** for SHA-256 hex formatting, unsupported canvas/WebGL/WebGPU/audio states, WebGL debug renderer absent, WebGL debug renderer exposed, and blocked canvas readback.
- [ ] **Step 2: Run `npm run check` and verify the new tests fail for the missing module.**
- [ ] **Step 3: Implement Canvas collection.** Render a tiny deterministic text/shape pattern, read a bounded pixel buffer, hash locally with `crypto.subtle`, and classify thrown/sanitized readback as `blocked`/`modified` rather than fatal.
- [ ] **Step 4: Implement WebGL collection.** Try WebGL2 then WebGL1; expose unmasked vendor/renderer only when `WEBGL_debug_renderer_info` exists; collect texture/renderbuffer limits and extension count.
- [ ] **Step 5: Implement WebGPU collection.** Report support and only adapter metadata returned by a normal `requestAdapter()` call; no high-performance preference.
- [ ] **Step 6: Implement deterministic OfflineAudioContext collection** with a short bounded render and local digest; always release references after completion/failure.
- [ ] **Step 7: Aggregate informational findings only; run `npm run check`; commit `feat: add local fingerprint exposure checks`.**

### Task 3: Environment consistency assessment

**Files:**
- Create: `assets/environment-consistency.js`
- Modify: `assets/browser-info.js` only if a normalized UA-CH platform field is missing
- Create: `tests/environment-consistency.test.js`

**Interfaces:**
- `detectUaPlatform(userAgent) -> 'windows'|'macos'|'linux'|'android'|'ios'|'unknown'`
- `detectLegacyPlatform(platform) -> same enum`
- `assessEnvironmentConsistency({ browser, fingerprint, privacy }) -> { status, findings, signals }`

- [ ] **Step 1: Write failing tests** for Windows-vs-Linux contradiction, UA-CH platform contradiction, mobile-UA plus strong desktop contradiction, matching Windows metadata, unknown platforms, unusual GPU with no false warning, language mismatch with no warning, and timezone mismatch reuse without duplicate finding.
- [ ] **Step 2: Run `npm run check` and confirm failure.**
- [ ] **Step 3: Implement explicit platform normalizers and only high-confidence contradiction rules.**
- [ ] **Step 4: Ensure all findings use `severity: 'review'` or `info`; never `leak`.**
- [ ] **Step 5: Run `npm run check`; commit `feat: add environment consistency checks`.**

### Task 4: STUN mapping / public-port diagnostics

**Files:**
- Modify: `assets/webrtc-test.js`
- Create: `assets/stun-mapping.js`
- Modify: `tests/max-diagnostics.test.js`
- Create: `tests/stun-mapping.test.js`

**Interfaces:**
- `parseIceCandidate()` additionally returns numeric `port` when present.
- WebRTC candidate dedupe key includes port so different mappings are not collapsed.
- `compareStunMappings(records) -> { status, label, mappings, sameAddress, samePort, finding }`

- [ ] **Step 1: Add failing candidate-parser tests** proving `candidate:... <address> <port> typ srflx ...` returns the port and two candidates with same address but different ports remain distinct.
- [ ] **Step 2: Add failing mapping tests** for same IP+port, same IP/different ports, different public IPs, missing srflx data, and TCP/UDP metadata preservation.
- [ ] **Step 3: Run `npm run check` and verify expected failures.**
- [ ] **Step 4: Extend ICE parsing/dedupe without changing existing public-address semantics.**
- [ ] **Step 5: Implement pure mapping comparison.** Labels are exactly `Same public mapping`, `Same IP, different public ports`, `Different public addresses`, or `Insufficient STUN data`; port variation is informational only.
- [ ] **Step 6: Run `npm run check`; commit `feat: add STUN mapping diagnostics`.**

### Task 5: Smart Kill Switch enrichment

**Files:**
- Create: `assets/monitor-enrichment.js`
- Modify: `assets/monitor.js` only if event IDs or immutable event replacement helpers are required
- Modify: `assets/config.js`
- Create: `tests/monitor-enrichment.test.js`

**Interfaces:**
- Monitor events gain stable `id` and may later gain `{ enrichmentStatus, geo, intelligence, transitionLabel }`.
- `createMonitorEnricher({ geoLookup, intelligenceLookup })` exposes `enrichEvent(event, context)` and caches promises/results per unique non-null address.
- `classifyMonitorTransition({ previous, current }) -> 'Possible ISP exposure'|'Network path changed'|'Address changed within same network'|'Public IP changed'`

- [ ] **Step 1: Write failing tests** for unique event IDs, one enrichment request per unique address, two events reusing cached enrichment, enrichment failure preserving raw event, VPN/datacenter-to-ISP classification, country/ASN change classification, same-network change classification, and null-address transitions skipping external lookup.
- [ ] **Step 2: Run `npm run check` and verify failures.**
- [ ] **Step 3: Add `monitorEnrichment: true` feature/config flag.**
- [ ] **Step 4: Implement cache keyed by IP address.** Use existing `runGeoIpConsensus` and `runNetworkIntelligence` through injected functions rather than importing app orchestration.
- [ ] **Step 5: Keep raw monitor `leak` finding based solely on the recorded address change.** Enrichment may change explanatory copy but cannot create/remove the hard event.
- [ ] **Step 6: Run `npm run check`; commit `feat: enrich kill switch address changes`.**

### Task 6: Advanced UI integration and rendering

**Files:**
- Modify: `assets/app.js`
- Create: `assets/advanced-render.js` if `app.js` would otherwise grow with dense rendering code
- Modify: `assets/styles.css`
- Modify: `tests/stun-layout.test.js`
- Create: `tests/privacy-diagnostics-ui.test.js`

**Interfaces:**
- Advanced report adds `{ tlsFingerprint, fingerprintExposure, environmentConsistency, stunMapping }`.
- New Advanced cards: `TLS fingerprint`, `Fingerprint exposure`, `Environment consistency`, `STUN mapping`.
- Kill Switch timeline enrichment is rendered asynchronously without resetting monitor history.

- [ ] **Step 1: Write failing static-source/UI tests** requiring the four card titles, third-party TLS reflector disclosure, Canvas/WebGL/WebGPU/Audio rows, mapping label/port rendering, and enriched monitor metadata classes.
- [ ] **Step 2: Run `npm run check` and verify failures.**
- [ ] **Step 3: Add new Advanced fetch/collector calls to the existing lazy `runAdvanced` batch.** All four modules remain independent; one rejected result becomes its own unavailable card rather than rejecting the whole Advanced batch.
- [ ] **Step 4: Render TLS card** with TLS version, HTTP protocol, JA3/JA4, ALPN, observed remote IP and explicit `Third-party TLS reflector` text.
- [ ] **Step 5: Render fingerprint card** with exposure states first and technical local digests/details second; never phrase availability itself as a VPN leak.
- [ ] **Step 6: Render environment card** with `Consistent`, `Review`, or `Insufficient data` plus only high-confidence findings.
- [ ] **Step 7: Upgrade STUN card** to include server, public address, public port and protocol, then add a clear mapping summary below it. Preserve the dedicated non-overlapping layout from the previous STUN fix.
- [ ] **Step 8: Wire monitor enrichment after new events appear.** Update the specific event in memory/UI when metadata arrives; do not block the 5-second sampler.
- [ ] **Step 9: Add responsive styles** with `min-width:0`, `overflow-wrap:anywhere`, separate label/value nodes and single-column stacking on mobile.
- [ ] **Step 10: Run `npm run check`; commit `feat: integrate advanced privacy diagnostics UI`.**

### Task 7: Severity regression, docs, and final verification

**Files:**
- Modify: `tests/assessment.test.js`
- Modify: `README.md`
- Modify: `scripts/validate-static.mjs` if new modules are enumerated

**Interfaces:**
- Existing `assessResults` leak rules remain unchanged except accepting externally supplied review/info findings if required by orchestration.

- [ ] **Step 1: Add regression tests** proving TLS fingerprint, Canvas/WebGL/Audio exposure, STUN port differences, and environment consistency cannot alone produce `leak`.
- [ ] **Step 2: Update static validation** to require all new ES modules and validate imports.
- [ ] **Step 3: Update README** with Advanced-only execution, TLS reflector privacy disclosure, local-only digest behavior, STUN/NAT wording limitations, and Kill Switch enrichment behavior.
- [ ] **Step 4: Run full `npm run check`.**
- [ ] **Step 5: Compare `main...feature/privacy-fingerprint-diagnostics` and confirm no unrelated changes.**
- [ ] **Step 6: Fetch the exact feature-branch HEAD and its GitHub Actions run; require completed `success` with `npm run check` successful before integration is offered.**
- [ ] **Step 7: Commit `docs: document privacy fingerprint diagnostics`.**
