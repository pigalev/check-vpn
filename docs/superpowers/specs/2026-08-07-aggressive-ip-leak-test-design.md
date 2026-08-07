# Aggressive IP Leak Test Design

## Goal

Add the strongest browser-only IP leak diagnostics that can be implemented on GitHub Pages without project-owned infrastructure, with primary emphasis on catching short-lived public IPv4/IPv6 exposure while a VPN disconnects, reconnects, changes networks, or fails its Kill Switch.

The iteration adds a manual 60-second `Aggressive Leak Test`, deeper IPv6 and CGNAT classification, richer WebRTC local-address privacy reporting, multi-origin public-IP agreement, and coverage-gap detection so the UI never claims a clean result when the browser stopped sampling reliably.

## Scope

This iteration adds five related capabilities:

1. 60-second Aggressive Leak Test
2. Multi-origin public-IP observation and leak correlation
3. IPv6 deep classification and IPv6 bypass detection
4. CGNAT / WebRTC local-address exposure classification
5. Coverage / browser-throttling diagnostics

The existing automatic core checks remain lightweight. The aggressive test starts only after an explicit user action.

## UX

Add a dedicated section near the existing Kill Switch monitor:

- title: `Aggressive Leak Test`
- primary action: `Start 60s test`
- active action: `Stop test`
- elapsed / remaining time
- current sampling coverage
- observed IPv4/IPv6 addresses
- live event timeline
- final result

Final result states are exactly:

- `No unexpected IP observed`
- `Leak detected`
- `Inconclusive`

The UI must never display `No unexpected IP observed` if coverage quality is insufficient.

The user should be able to start the test, disconnect/reconnect the VPN, switch Wi-Fi/mobile connectivity, or otherwise reproduce a Kill Switch scenario during the 60-second window.

## 1. Test lifecycle

### Start

When `Start 60s test` is pressed:

1. Capture the current core report as the initial expected state.
2. Run an immediate baseline burst before starting the repeating schedule.
3. Record baseline public IPv4 and IPv6 addresses.
4. Record baseline STUN public addresses.
5. If a public WebRTC/STUN address already differs from HTTP public addresses, retain the existing leak finding and mark the aggressive test as starting with a pre-existing mismatch rather than accepting the mismatched address as trusted baseline.
6. Start the 60-second observation window.

### Duration

Default duration: exactly `60_000 ms`.

The duration is configurable in `assets/config.js`, but the UI copy remains `Start 60s test` while the configured default is 60 seconds.

### Finish

At the end of 60 seconds, stop all test-owned timers/listeners, finish pending bounded requests without scheduling new ones, calculate coverage, aggregate observations, and produce the final result.

Manual `Stop test` produces a result from collected data. If too little data was collected, the result is `Inconclusive`.

Starting a new aggressive test clears only the previous aggressive-test state; it does not clear the normal core report or Kill Switch monitor history.

## 2. Sampling strategy

Use a hybrid schedule to maximize short-leak detection without hammering rate-limited providers.

### Fast HTTP public-IP sampling

Every approximately 2 seconds:

- forced IPv4 consensus using the existing IPv4 providers
- forced IPv6 consensus using the existing IPv6 providers

Do not wait for IPv4 before starting IPv6; sample families in parallel.

Each successful sample records:

- timestamp
- family
- chosen public address
- provider coverage
- provider disagreement if any
- trigger: `scheduled`, `baseline`, or `network-burst`

Unavailable provider results do not create an address observation and do not imply an address change.

### STUN sampling

Every approximately 5 seconds, run isolated STUN sessions against each configured STUN server.

For each successful server-reflexive candidate record:

- timestamp
- STUN server
- public address
- public port
- transport protocol
- address family

A STUN public address not present in the trusted HTTP baseline is unexpected public-address evidence.

### HTTP echo sampling

Run the configured HTTP echo endpoint at baseline and periodically at approximately 10-second intervals.

Record only the actually observed origin IP and returned forwarding metadata. The echo endpoint is an independent observation source, not authoritative truth.

### TLS reflector sampling

Run the configured TLS reflector at baseline and periodically at approximately 15-second intervals.

Use its normalized observed remote IP only when available. JA3/JA4/TLS metadata remains informational and is not part of leak severity.

The reflector may be unavailable because of CORS, rate limiting, or schema changes. Failure must not fail the aggressive test if other observation channels remain healthy.

## 3. Network-event bursts

Listen during the running aggressive test for:

- browser `online`
- browser `offline`
- `navigator.connection` change when the API exists
- `visibilitychange`

Record these events in the timeline.

On `online` or connection-change events, schedule one debounced immediate burst containing:

- IPv4 sample
- IPv6 sample
- isolated STUN samples

The burst must not create overlapping duplicate bursts when several browser events fire together. Use a short debounce/cooldown.

`offline` itself is not a leak. It is contextual timing data.

## 4. Trusted baseline and unexpected addresses

The aggressive test stores baseline expected addresses by family.

### HTTP baseline

A successful current-core HTTP public address is trusted baseline evidence.

The immediate baseline burst may fill a missing family if the core report lacked it.

### STUN baseline

A STUN address is considered baseline-consistent only when it matches a trusted HTTP address of the same family.

A STUN public address that differs from all trusted HTTP addresses is never silently added to the trusted baseline. It remains mismatch evidence.

### Unexpected public IP

An observed public address is unexpected when:

- it is a valid public IPv4/IPv6 address; and
- it is not in the trusted baseline set for that family.

For IPv6, a public address appearing when baseline IPv6 was absent is unexpected and specifically classified as `IPv6 appeared during VPN test`.

A provider disagreement inside one HTTP consensus sample is not automatically an unexpected IP unless the alternative address is independently surfaced as a valid successful observation. Provider disagreement remains review/context data.

## 5. Leak evidence and correlation

The aggressive test maintains one exposure record per unexpected public address.

Each exposure record contains:

- address
- family
- first seen timestamp
- last seen timestamp
- observation count
- observing channels/sources
- approximate exposure duration
- whether the trusted baseline later returned
- enrichment metadata when available

Possible observing channels:

- `HTTP IPv4`
- `HTTP IPv6`
- specific IP providers
- `STUN Cloudflare`
- `STUN Google`
- `HTTP echo`
- `TLS reflector`

### Leak severity

`Leak detected` is produced when at least one unexpected public address is successfully observed during the explicit test.

This is hard address evidence. Enrichment is not required for the leak classification.

Correlation strengthens explanation but not the basic severity. For example:

- observed by HTTP + STUN: strong multi-path exposure
- observed by forced IPv6 after baseline IPv6 absence: strong IPv6-bypass exposure
- observed by one successful forced-family HTTP consensus: still real address-change evidence, but display the available source coverage

### Baseline restoration

If an unexpected address disappears and the original baseline address is later observed again, mark the exposure as `Baseline restored`.

Approximate exposure duration is measured from first unexpected observation until the first later baseline restoration observation for that family. Because polling is discrete, UI wording must use `~` / `approximately` rather than claiming exact packet-level duration.

If no restoration is observed before test end, duration is from first seen until last successful observation/test end as appropriate, labeled as an observed window rather than exact network duration.

## 6. Multi-origin agreement

Add a normalized observation summary for each family:

Example:

```text
IPv4 observations
HTTP consensus     77.110.99.186
HTTP echo          77.110.99.186
TLS reflector      77.110.99.186
Cloudflare STUN    77.110.99.186
Google STUN        77.110.99.186

5 independent paths agree
```

If a new address appears:

```text
HTTP consensus     95.25.44.18
Google STUN        95.25.44.18
Baseline           77.110.99.186

Unexpected public IP observed by 2 paths
```

Do not count multiple providers inside the same HTTP consensus as fully independent transport paths in the high-level agreement count. They may be shown as provider coverage underneath.

## 7. IPv6 deep classification

Create a pure IPv6 classifier used by core, Advanced, WebRTC, and aggressive-test reporting.

Classify at minimum:

- public/global unicast
- loopback
- link-local (`fe80::/10`)
- unique local (`fc00::/7`)
- multicast (`ff00::/8`)
- documentation (`2001:db8::/32`)
- 6to4 (`2002::/16`)
- Teredo (`2001:0000::/32`)
- IPv4-mapped IPv6 (`::ffff:0:0/96`)
- unspecified (`::`)

Where safely derivable, add informational transition hints such as `6to4` or `Teredo`.

Do not claim `Native IPv6` solely because none of the known transition prefixes matched. Use wording `Global IPv6` unless stronger evidence exists.

### IPv6 bypass rules

Strong aggressive-test leak evidence:

- baseline IPv6 absent, then a public/global IPv6 address appears during the test;
- a new public IPv6 address appears that is not in the trusted IPv6 baseline;
- WebRTC/STUN exposes a public IPv6 address absent from HTTP trusted baseline.

IPv4/IPv6 ASN/country differences alone remain `review`, not `leak`.

## 8. CGNAT and local-address classification

Extend IPv4 classification with:

- CGNAT/shared address space: `100.64.0.0/10`

CGNAT is not public Internet address evidence and must not be treated as a public-IP leak.

WebRTC local-address reporting distinguishes:

- private IPv4
- CGNAT/shared IPv4
- IPv6 ULA
- IPv6 link-local
- mDNS-protected local candidate
- numeric local address exposed

Add a compact WebRTC privacy summary such as:

```text
Numeric private IPv4 exposed   No
CGNAT candidate exposed        No
Private/ULA IPv6 exposed       No
mDNS protection                Active
Public mismatch                No
```

Numeric local-address exposure is informational/privacy metadata, not a confirmed VPN leak.

## 9. Coverage and browser throttling

The aggressive test must track scheduler quality.

For every scheduled fast sample, record intended timestamp and actual start timestamp.

Compute:

- expected fast-sample count
- attempted fast-sample count
- successful family observations
- largest scheduling gap
- request availability ratio

A `coverage gap` occurs when the actual time between fast sampling opportunities materially exceeds the configured interval. Default warning threshold: greater than 2.5× the fast interval.

Examples:

```text
Expected interval    2 s
Largest gap          23.8 s
Browser throttling   Detected
```

Visibility changes should be stored so a background-tab gap can be explained when possible.

### Final result gating

`Leak detected` always outranks coverage problems if unexpected public-address evidence was actually captured.

`No unexpected IP observed` is allowed only when minimum coverage requirements are met.

Otherwise return `Inconclusive` with specific reasons such as:

- browser timer throttling / large coverage gap
- too few successful HTTP samples
- both families repeatedly unavailable
- test stopped too early

Initial thresholds are configurable and tested; they must be conservative enough to avoid claiming a clean test from only one or two samples.

## 10. Enrichment

Reuse the existing GeoIP consensus and network-intelligence modules.

Enrich each unique unexpected public address at most once per aggressive run.

Possible fields:

- country / country code
- ASN
- organization
- VPN / proxy / datacenter / mobile classification

Example explanatory labels:

- `Possible ISP exposure`
- `Different VPN/network path`
- `Address changed within same network`
- `Unexpected public IP`

Enrichment never creates or removes leak evidence. The public-address observation is authoritative for test severity.

## 11. State model

Create a dedicated aggressive-test state separate from the existing Kill Switch monitor.

Suggested normalized structure:

```js
{
  status: 'idle' | 'running' | 'complete' | 'stopped',
  startedAt,
  endsAt,
  durationMs,
  baseline: { ipv4: [], ipv6: [] },
  samples: [],
  networkEvents: [],
  exposures: [],
  sourceHealth: {},
  coverage: {},
  result: 'clean' | 'leak' | 'inconclusive' | null,
  reasons: []
}
```

Do not store aggressive-test data persistently. It remains in browser memory and is included in `Copy JSON`.

## 12. Module boundaries

Create focused modules rather than expanding `assets/app.js` with test logic.

New modules:

- `assets/aggressive-leak-test.js` — lifecycle, scheduler, sampling orchestration, event reducer
- `assets/leak-observation.js` — baseline comparison, observation correlation, exposure records, result calculation
- `assets/ip-classification.js` — CGNAT + deep IPv4/IPv6 classification helpers
- `assets/aggressive-leak-render.js` — aggressive-test UI rendering helpers

Modify existing modules only where needed:

- `assets/config.js` — duration, intervals, gap threshold, minimum coverage
- `assets/network.js` — consume shared IP classification helper if appropriate
- `assets/webrtc-test.js` — richer local/CGNAT/IPv6 candidate classification
- `assets/network-assessment.js` — consume deeper IPv6 public/bypass evidence without weakening existing rules
- `assets/app.js` — wire UI/controller only
- `assets/styles.css` — responsive timeline/result presentation
- `index.html` — aggressive-test controls/section

## 13. Configuration defaults

Add configurable defaults:

```text
aggressiveDurationMs        60000
aggressiveHttpIntervalMs     2000
aggressiveStunIntervalMs     5000
aggressiveEchoIntervalMs    10000
aggressiveTlsIntervalMs     15000
aggressiveGapMultiplier       2.5
aggressiveBurstCooldownMs    1500
```

Minimum coverage thresholds should be defined explicitly in config rather than hidden magic numbers.

## 14. Error handling

All sampling channels are isolated.

Rules:

- one provider failing does not stop a consensus sample;
- one observation channel failing does not stop the test;
- request failures do not become address-change events;
- stale async results from a previous aggressive run are ignored using a run ID/token;
- stopping the test prevents future scheduled work;
- browser API absence is represented as unavailable, not error spam;
- no unhandled promise rejection may terminate the test controller.

## 15. Severity rules

`Leak detected` remains reserved for strong network-address evidence.

Aggressive-test leak evidence includes:

- unexpected public IPv4 observed during the test;
- unexpected public/global IPv6 observed during the test;
- public IPv6 appearing when trusted baseline had no IPv6;
- WebRTC/STUN public address not in trusted HTTP baseline;
- existing public-IP change evidence from the explicit Kill Switch/aggressive monitor.

The following cannot independently produce `Leak detected`:

- CGNAT/local numeric address exposure;
- mDNS behavior;
- STUN public-port changes;
- GeoIP/ASN/classification changes without a new public address;
- BGP/RPKI/TLS/fingerprint metadata;
- browser timer throttling.

Timer throttling or insufficient source availability may force `Inconclusive`.

## 16. Testing

Use Node.js `node:test` for pure reducers/classifiers/result calculation and static-source tests for UI contracts.

Required regression coverage:

- default duration is 60 seconds;
- HTTP sampling schedule targets ~2-second cadence;
- STUN schedule targets ~5-second cadence;
- network event burst is debounced;
- request failure never creates an exposure;
- baseline address does not create an exposure;
- unexpected IPv4 creates leak evidence;
- IPv6 appearing after an absent baseline creates leak evidence;
- unexpected address observed by multiple channels merges into one exposure with multiple sources;
- baseline restoration is detected;
- approximate exposure window is calculated correctly;
- large scheduler gap makes otherwise-clean result inconclusive;
- leak result outranks coverage-gap inconclusive state;
- early manual stop with insufficient samples becomes inconclusive;
- CGNAT `100.64.0.0/10` is classified as CGNAT and never public;
- IPv6 ULA/link-local/6to4/Teredo/documentation/global classification;
- WebRTC CGNAT/private/ULA candidates are not public leak evidence;
- public WebRTC mismatch remains leak evidence;
- stale callbacks from a prior run cannot mutate a newer run;
- each unexpected IP is enriched at most once per run;
- external enrichment failure preserves the raw exposure;
- responsive UI contains dedicated source/address/timing nodes that cannot overlap;
- `npm run check` passes on the exact feature-branch HEAD before merge.

## Privacy

The aggressive test intentionally generates more outbound requests than the normal page, but only after explicit user action.

No analytics or persistent storage is added.

The same configured third-party IP, STUN, echo, TLS, GeoIP, and intelligence providers may observe requests during the 60-second test. The UI/README must disclose that the aggressive mode increases request frequency for the duration of the test.

## Out of scope for this iteration

Without project-owned infrastructure, do not pretend to add authoritative:

- DNS leak testing;
- torrent tracker leak testing;
- SMTP/email leak testing;
- project-owned STUN observation;
- packet-level tunnel inspection;
- authoritative knowledge of the user's pre-VPN/home IP.

Those remain the next major infrastructure-backed phase after a VPS/backend is introduced.
