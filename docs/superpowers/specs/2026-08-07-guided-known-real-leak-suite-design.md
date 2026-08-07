# Guided Known-Real Leak Suite — Design

Date: 2026-08-07
Branch: `feature/guided-known-real-leak-suite`
Base: `main` at `250d4dc0579fc54ff5b5f2954676e1de814122d9`

## Goal

Extend the current static VPN diagnostics into a stronger real-IP leak tester by teaching the browser the user's known pre-VPN public addresses, then aggressively checking whether those exact addresses reappear while the VPN is active.

The design prioritizes true public-address exposure detection over generic privacy scoring. It remains compatible with GitHub Pages and third-party public endpoints; authoritative DNS/torrent/SMTP checks still require project-owned backend infrastructure.

## Product principles

- The strongest result is an exact match to a public IPv4/IPv6 captured while the VPN was intentionally off.
- A single successful observation of a known real public address is enough for `REAL IP LEAK DETECTED`.
- Unknown public-address changes are handled conservatively to avoid calling normal VPN egress rotation a real-IP leak.
- Private IPv4, CGNAT, ULA/link-local IPv6 and mDNS exposure remain privacy/network diagnostics, not public VPN leaks.
- Provider failures never fabricate address changes and never erase successful observations from other sources.
- Media permission is always explicit opt-in. The site never auto-prompts for camera or microphone access.
- No captured IP data is persisted beyond the current tab session.
- Clean results must be phrased as `not observed`, never as a guarantee that the VPN is safe.

## High-level flow

Add a dedicated `Guided VPN Leak Test` above or beside the current Aggressive Leak Test.

### Step 1 — Capture real connection

UI instruction: `Turn VPN off, then capture your real connection.`

The user presses `Capture real IP`.

The capture performs a short best-effort burst using:

- individual forced-family HTTP public-IP providers;
- normal HTTP consensus for IPv4 and IPv6;
- configured STUN destinations;
- HTTP echo if available;
- TLS reflector if available.

Trusted known-real IPv4/IPv6 values are chosen only from reliable HTTP evidence. STUN/echo/TLS observations are retained for diagnostics but do not silently override a conflicting HTTP real baseline.

If HTTP sources strongly disagree and no trustworthy family baseline can be chosen, that family is not saved as known real and the UI asks the user to retry.

Expected result example:

- `Real IPv4: 95.x.x.x`
- `Real IPv6: 2a00:...` or `Not detected`
- `Saved for this tab only`

### Step 2 — Capture VPN connection

UI instruction: `Turn VPN on, wait for it to connect, then capture the VPN connection.`

The same capture stack runs again.

The result is compared with the known-real profile.

If the current public IPv4/IPv6 still exactly matches a corresponding known-real address, the UI reports `VPN connection not confirmed` for that family. The user may retry or explicitly `Continue anyway` because proxy/split configurations can intentionally preserve an address.

Expected result example:

- `Real IPv4: 95.x.x.x`
- `VPN IPv4: 77.x.x.x`
- `Changed: Yes`
- `Real IPv6: 2a00:...`
- `VPN IPv6: Not detected`

### Step 3 — Run stress test

Once the VPN baseline is captured, the existing 60-second Aggressive Leak Test runs with the guided profile attached.

The test compares every successful public-address observation against:

1. `knownReal` addresses;
2. `knownVpn` addresses;
3. all other addresses (`unknown`).

The current manual Aggressive Test remains usable without the wizard, but it cannot emit `REAL IP LEAK DETECTED` unless a known-real profile exists.

## Current-tab-only storage

Use `sessionStorage`, not `localStorage`.

Store only the minimum guided profile:

```text
schemaVersion
step
knownReal.ipv4[]
knownReal.ipv6[]
knownVpn.ipv4[]
knownVpn.ipv6[]
capturedAt timestamps
explicitContinue flags when VPN change was not confirmed
```

Do not store the full 60-second observation timeline in `sessionStorage`; timeline and exposure detail stay in RAM.

Requirements:

- reload in the same tab restores the guided profile;
- closing the tab removes the profile under normal browser session semantics;
- a different tab gets no shared guided profile;
- `Clear captured IPs` removes all guided profile data immediately;
- invalid or unknown schema versions are discarded safely;
- never write captured IP data to `localStorage`.

## Provider-level HTTP observations

The current HTTP consensus remains useful for the main IPv4/IPv6 cards, but the aggressive leak engine must no longer treat the consensus winner as the only observation.

Introduce a raw provider observation model:

```text
timestampMs
family
providerId
providerGroup
address
latencyMs
status
trigger
```

Each successful provider response is evaluated individually.

Example:

```text
ipify            -> VPN IP
IPPubblico       -> VPN IP
provider C       -> KNOWN REAL IP
```

This must produce a known-real leak even though the HTTP majority still agrees on the VPN address.

Provider independence matters for confidence. Several endpoints operated by the same organization may be separate destinations but should not automatically count as several independent organizations.

## Address classification and leak severity

Every public observation is classified relative to the guided profile.

### Known real

Exact match to captured pre-VPN IPv4/IPv6.

One successful observation is sufficient:

`REAL IP LEAK DETECTED`

For IPv6, use explicit explanation: `Known real IPv6 appeared during VPN test.`

### Known VPN

Exact match to any trusted captured VPN baseline address.

Normal/expected.

### Unknown public IP

A public IP matching neither known real nor known VPN.

False-positive protection:

- one isolated observation from one path: `Review · Unconfirmed unexpected IP`;
- repeated observation of the same IP, or confirmation through a second independent transport path: `Unexpected public IP detected`;
- metadata consistent with the user's ISP/mobile network may add `Possible ISP exposure`, but it never upgrades to `Known real` without an exact known-real match.

A VPN server rotation may therefore produce review/unexpected-path evidence but must not be mislabeled `REAL IP LEAK`.

### Non-public candidates

Never public VPN leaks by themselves:

- RFC1918 private IPv4;
- `100.64.0.0/10` CGNAT/shared;
- IPv6 ULA;
- IPv6 link-local;
- IPv6 multicast/documentation/unspecified;
- mDNS `.local` candidates.

These remain informational privacy exposure signals.

### STUN ports

Public-port changes never influence IP leak severity. They remain NAT mapping hints only.

## Independent transport paths

The report should distinguish transport/path classes rather than flatten all observations into one count.

Primary path classes:

- HTTP public-IP providers;
- HTTP echo;
- TLS reflector;
- WebRTC/STUN normal sessions;
- WebRTC stress sessions;
- WebRTC media-permission sessions.

Multiple public-IP providers within the HTTP class are valuable destinations but do not automatically count as independent transport classes.

## Reconnect Burst

The existing fixed 2-second HTTP scheduler remains active for the full 60-second observation window.

When a meaningful network transition occurs, run a higher-resolution reconnect burst at approximately:

- T+0 ms
- T+250 ms
- T+500 ms
- T+1000 ms
- T+2000 ms
- T+4000 ms

HTTP checks run at every burst point.

WebRTC/STUN checks run at:

- T+0 ms
- T+500 ms
- T+2000 ms
- T+4000 ms

Triggers include:

- browser `online`;
- Network Information API `change` where available;
- transition from failed/unavailable HTTP connectivity back to successful connectivity;
- meaningful public-address transition observed during the running test.

`offline` is context only and never fabricates a leak event.

Repeated network events while a burst is already active are coalesced rather than spawning unlimited overlapping bursts.

The burst orchestrator is a separate module so the regular aggressive scheduler remains understandable.

## WebRTC Stress Test

Keep the existing single-session `webrtc-test.js` as the basic primitive.

Add a stress orchestrator that repeatedly creates independent `RTCPeerConnection` instances and collects every ICE candidate from each run.

For each candidate retain:

```text
sessionId
serverId/serverGroup
address
port
family
protocol
candidate type
classification
timestampMs
trigger
```

Only successfully observed public candidates can become public leak evidence.

The stress test should favor multiple independent ICE sessions over one long-lived PeerConnection because transient VPN failures may only be visible during fresh ICE gathering.

All PeerConnections must close after completion/timeout.

## Media-permission WebRTC Test

Add a separate explicit opt-in advanced test.

The UI must state before the click:

- the browser may show a camera/microphone permission prompt;
- media is not recorded;
- media is not uploaded by this project;
- tracks are stopped immediately after the diagnostic capture.

Execution:

1. capture a fresh WebRTC baseline without media permission;
2. from the direct user click handler call `navigator.mediaDevices.getUserMedia(...)`;
3. with the granted stream active, run fresh independent WebRTC/STUN sessions;
4. compare before/after candidate sets;
5. stop every returned media track in `finally`, including failure/partial-result paths.

Permission denial does not make the entire VPN test incomplete. It only marks the media-permission subtest `Denied/Unavailable`.

Interpretation:

- newly visible private/CGNAT/ULA address -> privacy exposure only;
- newly visible known-real public IPv4/IPv6 -> `REAL IP LEAK DETECTED`;
- newly visible unknown public IP -> normal unknown-public classification rules.

The test must never claim that camera/microphone permission itself reveals the IP; only actual ICE/address observations are evidence.

## STUN destinations

Support up to four configured STUN destinations for stress testing.

Only add destinations that are verified to work reliably enough in the supported browsers. Do not hardcode four merely to reach a number.

Each destination has runtime health/coverage:

- available;
- timeout;
- unsupported/failed.

Several hostnames from one provider are separate destinations but not fully independent provider organizations for confidence scoring.

No result assumes a precise NAT type.

## UDP/TCP WebRTC transport reporting

Record the actual candidate `protocol` exposed by the browser (`udp` or `tcp`) when present.

Do not display a fake `TCP tested` state unless a TCP candidate was actually observed.

UI example:

```text
UDP  Observed
TCP  Not observed
```

The design does not require forced STUN-over-TCP unless a verified endpoint/browser combination later supports it reliably.

## Exposure aggregation and persistence

Aggregate every unexpected public address into one exposure record.

Required fields:

```text
key
address
family
classification: known-real | known-vpn | unknown
firstSeenAtMs
lastSeenAtMs
observationCount
channels
sources
providerGroups
perChannelCounts
firstDetector
baselineRestoredAtMs
approxExposureMs or unknown
enrichment
confirmationLevel
```

For a single isolated sample, duration is unknown/shorter than polling resolution; do not invent a numeric duration.

If a baseline address is later observed again, record approximate baseline restoration time.

Enrichment is best-effort, cached once per unique public address, and never creates a leak finding on its own.

## Split-routing matrix

The final report includes a path matrix showing what each destination observed.

Example:

```text
ipify IPv4          77.x.x.x   Known VPN
IPPubblico IPv4     77.x.x.x   Known VPN
Provider C          95.x.x.x   KNOWN REAL LEAK
HTTP echo           77.x.x.x   Known VPN
TLS reflector       77.x.x.x   Known VPN
Cloudflare STUN     77.x.x.x   Known VPN
Google STUN         95.x.x.x   KNOWN REAL LEAK
Media WebRTC        95.x.x.x   KNOWN REAL LEAK
```

The matrix should make split-routing/bypass behavior understandable without forcing the user to inspect raw JSON.

## Final verdict hierarchy

Guided/aggressive results use the following precedence:

1. `REAL IP LEAK DETECTED`
   - any exact known-real public IPv4/IPv6 observed during the VPN test.
2. `UNEXPECTED PUBLIC IP DETECTED`
   - an unknown public IP confirmed strongly enough under the unknown-IP rules.
3. `REVIEW`
   - only isolated/unconfirmed unknown address evidence or meaningful inconsistencies.
4. `TEST INCONCLUSIVE`
   - no leak evidence, but coverage is too poor to make a clean observation statement.
5. `NO KNOWN REAL IP OBSERVED`
   - sufficient coverage and no known-real/confirmed unexpected public address observed.

Leak evidence outranks coverage weakness. A known-real address seen once remains a leak even if later coverage is poor.

The overall page assessment may still map these into the existing top-level severity system, but the Guided Test section keeps its more explicit wording.

## Coverage model

Coverage should report both scheduling quality and source availability.

Track at minimum:

- expected scheduled HTTP cycles;
- attempted scheduled HTTP cycles;
- successful provider observations;
- successful family observations;
- largest scheduler launch gap;
- reconnect-burst attempts/completions;
- WebRTC sessions attempted/completed;
- STUN destination availability;
- independent transport classes reached.

A slow or failed provider may reduce availability but must not delay the fixed scheduler cadence.

Browser timer throttling is only reported when launch-time evidence supports it; network request duration must not be misreported as timer throttling.

## UI structure

Add a dedicated guided section before or near Aggressive Leak Test.

### Wizard states

- Step 1: `Capture real connection`
- Step 2: `Capture VPN connection`
- Step 3: `Run 60s stress test`

Display only concise actionable English text in the product UI.

Provide:

- `Retry capture`;
- `Continue anyway` only where VPN baseline is not confirmed;
- `Clear captured IPs`;
- clear `Saved for this tab only` privacy note.

### Stress result detail

Show:

- known real vs VPN baseline;
- leak exposures;
- path matrix;
- WebRTC normal/stress/media results;
- reconnect events;
- coverage summary.

Avoid layout that depends on fixed desktop widths; mobile layout remains first-class.

## JSON report

`Copy JSON` includes a `guidedLeak` section with:

- current in-memory guided profile values;
- capture summaries;
- stress result;
- exposures;
- path matrix observations;
- WebRTC stress/media summaries;
- reconnect bursts;
- coverage.

The JSON report is generated on demand and not persisted by the project.

## Module boundaries

Add focused modules instead of expanding `app.js` and `aggressive-leak-test.js` indefinitely.

Planned modules:

- `guided-leak-profile.js`
  - sessionStorage schema/read/write/clear only.
- `guided-leak-capture.js`
  - trusted real/VPN capture and capture confidence.
- `provider-observations.js`
  - raw per-provider HTTP observation collection/normalization.
- `leak-classifier.js`
  - pure known-real/known-vpn/unknown classification and severity rules.
- `reconnect-burst.js`
  - high-resolution burst schedule/coalescing.
- `webrtc-stress.js`
  - repeated independent ICE sessions and aggregation.
- `webrtc-media-test.js`
  - explicit getUserMedia before/after comparison and guaranteed track cleanup.
- `guided-leak-render.js`
  - wizard/results rendering.
- `leak-report.js`
  - path matrix and exposure summaries.

Existing modules reused:

- `ip-classification.js`;
- `ip-consensus.js`;
- `webrtc-test.js`;
- `aggressive-leak-test.js`;
- `leak-observation.js`;
- GeoIP/network-intelligence enrichment;
- existing HTTP echo/TLS reflector primitives.

`app.js` remains orchestration and DOM wiring, not the home of new classification logic.

## Error handling

- One HTTP provider timeout does not cancel other providers.
- One STUN destination failure does not cancel other ICE sessions.
- Media permission denial is isolated to the media subtest.
- Stale async results from a previous run are ignored by run token/id.
- Stop cancels future scheduling; late results from the stopped run do not mutate the next run.
- `sessionStorage` parse/quota errors fail safely to an in-memory empty guided profile.
- Unsupported browser APIs are explicitly labeled unavailable rather than simulated.

## Testing requirements

Use TDD for implementation.

Required regression/behavior coverage:

1. Known real IPv4 appears once via one HTTP provider -> `REAL IP LEAK DETECTED`.
2. Known real IPv6 appears via WebRTC -> real IPv6 leak.
3. Two HTTP providers show VPN while a third shows known real -> leak is not hidden by consensus.
4. One new unknown VPN egress appears once -> review/unconfirmed, not real-IP leak.
5. Unknown public IP confirmed by an independent second channel -> confirmed unexpected public IP.
6. VPN server rotation never becomes `Known real` without exact match.
7. Private IPv4/CGNAT/ULA/link-local/mDNS never become public leaks.
8. Media permission only exposes `192.168.x.x` -> privacy exposure, no public leak.
9. Media permission exposes known-real public IP -> real-IP leak.
10. Media permission denial leaves standard diagnostics valid.
11. All returned media tracks are stopped on success and error paths.
12. Reconnect burst can observe a transient known-real result between normal 2-second samples.
13. Burst events are coalesced and do not multiply without bound.
14. Slow/hanging HTTP provider does not delay fixed launch cadence.
15. One dead STUN destination does not break remaining sessions.
16. Guided profile survives reload in the same tab.
17. A separate tab does not inherit the profile under sessionStorage semantics.
18. `Clear captured IPs` removes the profile.
19. No guided code writes to `localStorage`.
20. An invalid stored schema is discarded safely.
21. Exact known-real leak outranks inconclusive coverage.
22. Single-sample exposure duration remains unknown rather than fabricated.
23. STUN port changes never affect leak severity.
24. TCP is reported only when an actual TCP ICE candidate is observed.
25. Existing core/advanced/Kill Switch/Aggressive behavior remains regression-covered.

## Privacy disclosure

The guided flow intentionally handles the user's public IP while the VPN is off. The UI must explain this before capture.

The project itself stores the guided profile only in the tab's sessionStorage and does not send it to project-owned analytics/storage.

However, the external IP/GeoIP/STUN/echo/TLS services contacted during diagnostics necessarily observe requests according to their own service policies. This is already true for the existing static diagnostics and must be documented clearly in README.

The media stream itself is never uploaded by this project. Only normal network/WebRTC signaling behavior is used for IP diagnostics.

## Out of scope for this static iteration

Still requires project-owned backend/VPS:

- authoritative per-session DNS leak testing;
- torrent tracker leak testing;
- SMTP/email leak testing;
- project-owned STUN/TURN;
- project-owned IPv4/IPv6 echo endpoints;
- packet capture/inspection;
- authoritative discovery of a home IP without the user intentionally capturing it with VPN off.

## Success criteria

The iteration is complete when:

- a user can capture known-real IPv4/IPv6 with VPN off, capture VPN baseline after reconnecting, and run the 60-second test without losing the guided profile on same-tab reload;
- any exact known-real address surfaced by an individual HTTP provider, echo, TLS, normal/stress WebRTC/STUN, reconnect burst, or media-permission WebRTC is preserved and produces explicit real-IP leak evidence;
- majority consensus can no longer hide a known-real observation from a minority endpoint;
- transient reconnect exposures have substantially higher temporal sampling than the normal two-second loop;
- WebRTC stress and optional media-permission comparison expose their actual candidate evidence without overstating unsupported transports or NAT types;
- unknown VPN egress rotation is not falsely labeled as the user's real IP;
- result wording, storage behavior and external-service disclosure remain conservative and privacy-safe;
- all tests and static validation pass on the exact feature HEAD before merge.
