# Privacy & Fingerprint Diagnostics Design

## Goal

Extend the GitHub Pages-only VPN/privacy checker with the strongest additional diagnostics that can be implemented without a project-owned backend: TLS fingerprint observation through a third-party reflector, local browser fingerprint exposure checks, browser/environment consistency analysis, richer STUN/NAT mapping hints, and smarter Kill Switch enrichment after real IP changes.

## Scope

This iteration adds five Advanced-only diagnostic groups:

1. TLS/HTTP fingerprint observation
2. Local fingerprint exposure (Canvas/WebGL/WebGPU/Audio)
3. Browser consistency analysis
4. STUN port/NAT mapping comparison
5. Kill Switch change enrichment

No new permission prompts run automatically. No persistent fingerprint identifiers are stored. No fingerprint hash is transmitted to the project or to analytics infrastructure.

## UX

The existing compact core screen remains unchanged.

All new diagnostics live under `Advanced details`. Opening Advanced starts best-effort checks once for the current core run. `Run advanced again` reruns them.

New Advanced cards:

- `TLS fingerprint`
- `Fingerprint exposure`
- `Environment consistency`
- `STUN mapping`

The Kill Switch section keeps its existing controls, but each real address change may asynchronously gain metadata such as ASN, organization, country, and a likely transition label.

## 1. TLS fingerprint observation

Use a configurable HTTPS/CORS reflector endpoint from `assets/config.js`. Initial endpoint: `https://tls.peet.ws/api/all`.

Normalize only fields needed by the UI:

- observed remote IP, when present
- HTTP protocol/version
- TLS version
- ALPN
- JA3 string/hash when present
- JA4 when present
- TLS cipher/extension summary when present
- HTTP/2 fingerprint summary when present

The reflector is best-effort. Failure, CORS changes, rate limiting, or schema drift must render `Unavailable` and must not affect the VPN leak status.

The UI must state that this data is observed by a third-party TLS reflector.

## 2. Local fingerprint exposure

Create a browser-only collector that does not send generated fingerprint values anywhere.

### Canvas

Render a deterministic tiny canvas and compute a local SHA-256 digest using `crypto.subtle.digest` when available. Store the digest only in the in-memory report. The UI primarily shows `Available / Blocked / Unsupported`; the hash is shown only in Advanced technical details.

If canvas pixel readback throws or returns an obviously sanitized result, classify as `Blocked or modified` instead of erroring.

### WebGL

Collect without permissions:

- WebGL availability
- version (`WebGL 1` / `WebGL 2`)
- unmasked vendor and renderer only when `WEBGL_debug_renderer_info` is exposed
- max texture size
- max renderbuffer size
- supported extension count

Absence of debug renderer info is a privacy-positive limitation, not an error.

### WebGPU

Only report support state and adapter metadata that the browser exposes without prompting. If `navigator.gpu` exists but adapter acquisition fails, report `Unavailable`.

Do not request high-performance preference solely to increase entropy.

### AudioContext

Create an offline audio context where supported, render a short deterministic graph, and compute a local digest of a bounded sample window. Close/release resources. If unsupported or blocked, report that state.

### Fingerprint exposure assessment

This module never produces `leak` severity. It may produce informational findings such as:

- Canvas fingerprint surface exposed
- WebGL renderer exposed
- Audio fingerprint surface exposed

No numerical privacy score is added in this iteration because arbitrary scores create false precision.

## 3. Environment consistency

Compare browser-reported metadata for obvious contradictions only.

Inputs:

- User-Agent
- `navigator.userAgentData` where present
- platform
- touch points
- screen size
- device memory
- hardware concurrency
- WebGL renderer/vendor
- browser timezone
- IP timezone/country metadata

Examples of review-level inconsistencies:

- UA indicates Windows while `navigator.platform` clearly indicates Linux/macOS
- UA indicates mobile Android/iOS while zero touch support and desktop-only platform metadata strongly contradict it
- User-Agent Client Hints platform conflicts with legacy platform/UA platform
- browser timezone differs from all available IP timezones (existing privacy finding can be reused instead of duplicated)

Do not infer spoofing from weak signals such as a datacenter IP, unusual GPU, language mismatch, or different city.

Environment consistency can produce `review`, never `leak`.

## 4. STUN mapping / NAT hints

Extend ICE candidate normalization with the public server-reflexive port where available.

For each isolated STUN server diagnostic record:

- public address
- public port
- protocol
- candidate type

Compare mappings across configured STUN servers.

Possible result labels:

- `Same public mapping`
- `Same IP, different public ports`
- `Different public addresses`
- `Insufficient STUN data`

Do not claim exact NAT type such as `Symmetric NAT`. Use wording like `Mapping changes between STUN destinations`.

A different STUN public address continues to feed the existing address mismatch logic only when it is genuinely different from known HTTP addresses. Port differences alone are informational.

## 5. Smart Kill Switch enrichment

The lightweight monitor continues to sample only public IP discovery endpoints every configured interval.

When a real address transition is recorded, asynchronously enrich the newly observed non-null IP exactly once per unique address using existing GeoIP consensus and network intelligence modules.

Each event may gain:

- country / country code
- ASN
- organization
- VPN/proxy/datacenter classification when available
- enrichment status

Transition classifier examples:

- `VPN/datacenter → residential/mobile ISP`: `Possible ISP exposure`
- `country/ASN changed`: `Network path changed`
- `same ASN / same organization`: `Address changed within same network`
- enrichment unavailable: keep raw event without guessing

`Possible ISP exposure` can support a Kill Switch leak finding because the monitor already has hard evidence that the public IP changed; enrichment only explains the transition. Enrichment by itself never creates a leak finding.

Transient fetch failures must not create monitor address-change events.

## Data boundaries

New modules:

- `assets/tls-fingerprint.js` — third-party reflector fetch + normalization
- `assets/fingerprint-exposure.js` — Canvas/WebGL/WebGPU/Audio collectors
- `assets/environment-consistency.js` — pure consistency findings
- `assets/stun-mapping.js` — pure mapping comparison helpers
- `assets/monitor-enrichment.js` — enrich/classify existing monitor events

`assets/app.js` remains orchestration/rendering only. If adding these features would make it materially larger, rendering helpers should be extracted instead of adding more dense inline logic.

## Configuration

Add to `assets/config.js`:

- `tlsReflectorEndpoint`
- optional fingerprint timeouts where asynchronous APIs need bounds
- monitor enrichment enabled flag

All third-party endpoints remain replaceable.

## Error handling

Every new check returns a normalized status:

- `complete`
- `partial`
- `unavailable`
- `error`

One Advanced module failing never removes results from another module and never changes already-known core IP/WebRTC results.

## Privacy

- No analytics or persistent storage.
- Canvas/audio hashes are computed locally and remain in browser memory/report JSON only.
- Opening Advanced sends one request to the configured TLS reflector and existing Advanced external providers.
- Kill Switch enrichment sends changed IP addresses to the same GeoIP/network-intelligence providers already used elsewhere, only after an actual transition.
- No permission prompts for location, camera, microphone, Bluetooth, USB, MIDI, or sensors in this iteration.

## Severity rules

`Leak detected` remains reserved for strong network-address evidence:

- WebRTC public address mismatch
- materially different IPv6 path consistent with bypass evidence
- public IP change observed during Kill Switch monitoring

New TLS/fingerprint/environment/NAT metadata alone cannot produce `Leak detected`.

`Review` may be produced by strong browser-environment contradictions. Fingerprint exposure and STUN port variation are informational.

## Testing

Use Node.js `node:test` for pure normalizers/assessments and static-source tests for browser rendering contracts.

Required regression coverage:

- TLS payload normalization and schema absence
- reflector failure does not throw
- WebGL debug info absent
- fingerprint collectors expose unsupported/blocked states cleanly
- consistency rules avoid weak false positives
- STUN same IP/different port classification
- monitor event enrichment cached per unique address
- enrichment failure preserves the raw event
- no new module can elevate top-level severity to leak without network-address evidence
- `npm run check` passes on the exact feature-branch head before merge
