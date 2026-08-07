# Max Static Diagnostics Design

## Goal

Turn the GitHub Pages version into the strongest useful VPN/privacy diagnostic page that can be implemented entirely in a browser without a private backend, while keeping the main screen compact, mobile-friendly, and resilient to third-party API failures.

## Scope

This iteration adds only checks that can be performed honestly from a static HTTPS page using browser APIs, WebRTC/STUN, DNS-over-HTTPS, and public CORS-enabled APIs. It must not pretend to provide authoritative DNS leak, torrent leak, SMTP/email leak, or other tests that require a server controlled by this project.

## Product principles

1. The initial result should remain readable in a few seconds.
2. Core checks run automatically; heavy or rate-limited checks live under `Advanced details` and run lazily.
3. One failing provider must never erase useful data from other providers.
4. A warning is not a leak unless the evidence genuinely indicates address exposure or tunnel bypass.
5. Every best-effort external check must clearly distinguish `Unavailable` from a negative result.
6. The page must remain fully usable on phones with no horizontal scrolling.
7. No analytics, persistent history, tracking identifiers, canvas fingerprint hashes, or hidden fingerprint collection.

## Main screen

The first screen contains a compact summary and four primary result areas.

### Overall status

Possible states:

- `Protected` — no address mismatch or bypass signal detected.
- `Review` — no confirmed leak, but one or more privacy/network inconsistencies deserve attention.
- `Leak detected` — strong evidence that a public address bypassed or differed from the expected tunnel path.
- `Incomplete` — insufficient data to make a useful assessment.

The overall result is conservative. GeoIP disagreements, datacenter/VPN classification, browser timezone mismatch, reverse DNS, and browser fingerprint surface do not by themselves produce `Leak detected`.

### IPv4

Show:

- consensus public IPv4;
- country flag and location consensus;
- ASN and organization;
- number of public-IP providers that agree;
- number of GeoIP providers available;
- compact warning if public-IP sources disagree.

### IPv6

Show the same fields when IPv6 is available. If IPv6 is unavailable, display that as a neutral state, not an error.

If IPv4 and IPv6 are both available, compare:

- ASN;
- organization;
- country;
- network classification when available.

A materially different IPv6 network may indicate a VPN bypass. This comparison must be labelled probabilistically when evidence is incomplete. ASN mismatch alone is not automatically a leak; the assessment considers country, ownership/type, and the WebRTC/public-IP evidence together.

### WebRTC

Keep the existing candidate presentation and mDNS handling. Add compact counts and an address comparison summary:

- host candidates;
- server-reflexive (`srflx`) candidates;
- relay candidates;
- IPv4/IPv6 candidate counts;
- UDP/TCP candidate counts;
- unique public candidate addresses;
- whether public WebRTC addresses match HTTP public addresses.

A public WebRTC address that does not match any detected HTTP public address is a high-confidence leak signal.

### Privacy

Show the most useful privacy mismatches rather than raw fingerprint data:

- browser timezone;
- IP timezone consensus;
- timezone match/mismatch;
- browser language(s);
- platform;
- secure-context state;
- Global Privacy Control / Do Not Track where exposed.

Timezone mismatch is `Review`, never `Leak detected` by itself.

## Public IP consensus

### Purpose

Public address discovery must no longer depend on one endpoint.

### Behavior

For each address family, query multiple independent HTTPS/CORS public-IP endpoints in parallel. Normalize their responses into one structure:

```text
source
status
address
family
latencyMs
error
```

Use a simple majority/consensus rule for the displayed address. If only one source succeeds, use it and report reduced confidence. If multiple successful sources disagree, display the disagreement in Advanced details and raise `Review`.

IPv4 and IPv6 providers are configured independently because not every service supports forced address-family routing reliably from browsers.

### Failure handling

- 1+ successful sources: retain the address.
- 0 successful sources: `Unavailable` for that family.
- A provider timeout/error is recorded but does not invalidate other results.

## GeoIP consensus

Keep the existing three-provider implementation and provider-by-provider disagreement block. Extend it so advanced assessment can consume normalized fields without changing the current visible consensus behavior.

City/region differences are informational. Country disagreement raises `Review`. GeoIP alone never creates a leak result.

## Network intelligence

A lazily executed Advanced check enriches each detected public IP with best-effort network intelligence from a CORS-enabled public service.

Normalized fields may include:

- VPN detected/likely;
- proxy detected/likely;
- Tor exit node;
- datacenter/hosting;
- mobile network;
- crawler/bot;
- abuse-related flag when provided;
- ASN;
- organization;
- network prefix/range;
- RIR/registry;
- organization/network type.

These values are labels from third-party datasets, not proof. The UI must explicitly frame them as database classifications.

`VPN`, `Proxy`, `Tor`, or `Hosting` classifications do not change the leak result by themselves.

## Reverse DNS

Advanced details performs PTR lookups for detected IPv4/IPv6 addresses through DNS-over-HTTPS.

Design:

- use two public DoH resolvers with fallback;
- construct the correct reverse name (`in-addr.arpa` / `ip6.arpa`);
- collect PTR answer(s), resolver name, status, and latency;
- if resolvers disagree, show all returned values;
- absence of PTR is a valid result (`No PTR record`), not `Unavailable`.

This is explicitly labelled `Reverse DNS`, not `DNS leak test`.

## STUN/WebRTC advanced diagnostics

The current aggregate WebRTC test remains automatic. Advanced details may perform additional isolated STUN attempts using configured STUN servers so results can be compared by server.

Show:

- STUN server label;
- server-reflexive address(es) observed;
- transport;
- latency/time to candidate if measurable;
- whether all STUN observations agree with HTTP public IP.

If browser behavior prevents attributing a candidate to one server reliably, the UI must state that limitation instead of fabricating attribution.

NAT observations are hints only. Do not claim a precise NAT type unless the available browser/STUN evidence actually supports it.

## HTTP path inspection

Advanced details may call a CORS-enabled request-echo service and show only useful server-observed request metadata.

Candidate fields:

- User-Agent;
- Accept-Language;
- `Via`;
- `Forwarded`;
- `X-Forwarded-For` if returned to the browser;
- server-observed origin IP when the endpoint explicitly returns it.

A forwarded/proxy header is shown as a warning only when it is actually present. Missing access to a header because of CORS is `Unavailable`, not `Not detected`.

## Browser privacy surface

Advanced details can expose browser-visible information that normal websites can obtain without permission:

- browser timezone;
- primary language and language list;
- platform;
- User-Agent / User-Agent Client Hints when exposed;
- screen width/height;
- viewport width/height;
- device pixel ratio;
- hardware concurrency;
- device memory where supported;
- touch-point capability;
- cookie enabled state;
- GPC;
- DNT;
- online state;
- Network Information API values where available;
- secure-context state.

No stable fingerprint hash is generated. No canvas/audio/WebGL fingerprint is collected solely for uniqueness scoring.

## Kill Switch / IP Change Monitor

### Purpose

Provide an interactive, browser-only way to detect a short exposure of another public address while the user intentionally disconnects/reconnects a VPN or changes networks.

### UX

A separate `Kill Switch test` block contains:

- `Start monitoring` / `Stop monitoring`;
- elapsed time;
- current IPv4/IPv6;
- sample count;
- event timeline;
- stable/changed state.

### Behavior

- monitoring does not start automatically;
- sample lightweight public-IP endpoints at a conservative interval (target 5 seconds, configurable);
- keep results only in memory;
- record timestamped address changes;
- do not GeoIP-enrich every sample;
- when an address change occurs, enrich the new address once if practical;
- retain a change event even if the original VPN IP returns on the next sample.

### Assessment

An observed public-IP change during an explicitly running Kill Switch test is highlighted strongly. It is described as `Public IP changed during monitoring` rather than automatically claiming the new IP is the user's real/home address.

## Advanced details loading model

Advanced checks are lazy to reduce API load and preserve rate limits.

Core automatic checks:

- public IPv4/IPv6 consensus;
- GeoIP consensus;
- aggregate WebRTC;
- browser/timezone privacy summary;
- IPv4/IPv6 cross-family assessment.

Lazy Advanced checks:

- network intelligence;
- reverse DNS;
- extra STUN diagnostics;
- HTTP path inspection;
- full browser privacy surface.

Opening `Advanced details` starts the lazy checks once. `Run advanced again` is available for explicit retries. Opening/closing the section repeatedly does not automatically repeat network requests.

## Assessment model

The assessment engine produces both a top-level status and structured findings.

Each finding has:

```text
id
severity: info | review | leak
category
summary
details
sources
```

### Leak-level findings

- public WebRTC address does not match any HTTP public address;
- strong IPv6 bypass evidence: IPv4 and IPv6 simultaneously present with materially different network ownership/path evidence consistent with IPv6 escaping the tunnel;
- Kill Switch monitor observes a public IP change during the test.

### Review findings

- independent HTTP public-IP sources disagree;
- GeoIP providers disagree on country;
- browser timezone differs from IP timezone;
- suspicious proxy-forwarding metadata is server-observed;
- IPv4/IPv6 differ, but evidence is insufficient to classify as a bypass.

### Informational findings

- no IPv6 connectivity;
- mDNS protects local WebRTC address;
- hosting/datacenter/VPN/proxy/Tor dataset classifications;
- city/region GeoIP disagreement;
- missing PTR record;
- unsupported browser APIs.

## UI architecture

The existing card grid remains, but the app is reorganized into clear rendering modules rather than continuing to grow one large `app.js`.

Suggested responsibilities:

- `ip-consensus.js` — multi-source public address discovery;
- `geoip.js` — existing GeoIP normalization/consensus;
- `network-intelligence.js` — VPN/proxy/Tor/datacenter/BGP-like metadata normalization;
- `reverse-dns.js` — PTR/DoH logic;
- `browser-info.js` — expanded privacy surface;
- `privacy-assessment.js` — timezone/browser-vs-IP comparisons;
- `monitor.js` — Kill Switch sampling state machine;
- `assessment.js` — final finding aggregation/severity;
- `app.js` — orchestration only;
- optional focused render helpers if `app.js` remains too large after extraction.

The Advanced section uses native `<details>` where practical for accessibility and minimal JavaScript state.

## Mobile behavior

- single-column layout below existing mobile breakpoint;
- no fixed-width diagnostic tables;
- provider/source lists use stacked key/value rows on narrow screens;
- IP addresses, hostnames, ASN strings, headers, and user agents use `overflow-wrap: anywhere`;
- monitor timeline uses compact rows rather than a wide table;
- primary controls remain at least 44px high;
- Advanced details must not cause horizontal page scrolling.

## Rate limits and external-service resilience

- all public endpoints live in `assets/config.js`;
- timeouts are per provider;
- use `Promise.allSettled`/equivalent isolation;
- lazy advanced checks are cached for the current run;
- no automatic polling except an explicitly started Kill Switch test;
- monitor sampling does not call expensive GeoIP/intelligence APIs every interval;
- provider failure is visible in Advanced details but does not destroy successful data.

## Privacy disclosure

README and page copy explain that:

- public IP checks contact multiple external endpoints;
- GeoIP sends the already-detected IP to configured GeoIP providers;
- Advanced details may contact network-intelligence, DoH, STUN, and echo services;
- Kill Switch monitoring repeatedly contacts lightweight IP endpoints while enabled;
- results remain in browser memory and are not stored by this project;
- third-party services have their own logging/privacy policies.

## Explicitly out of scope until a private backend exists

- authoritative DNS leak test tied to unique per-session DNS names;
- torrent tracker leak test;
- email/SMTP leak test;
- project-owned STUN/TURN observations;
- project-owned IPv4/IPv6 echo endpoints;
- persistent server-side history;
- authoritative determination of the user's pre-VPN/home IP;
- claims that a third-party VPN/proxy database is definitive.

## Testing requirements

Unit tests cover:

- IP provider normalization and consensus;
- partial provider failures;
- IP disagreement;
- IPv4/IPv6 assessment logic;
- timezone assessment;
- reverse-name generation for IPv4 and IPv6;
- DoH response normalization;
- network-intelligence normalization;
- WebRTC summary/count helpers;
- Kill Switch monitor state transitions and address-change events;
- top-level severity aggregation;
- browser-info normalization with unsupported APIs.

Static validation must ensure all new modules are included in the Pages build. Final feature-branch CI must pass `npm run check` before integration.

## Success criteria

1. Initial page remains fast and readable despite the additional capability.
2. Core results survive partial third-party outages.
3. Advanced details expose substantially more network/privacy information without cluttering the main screen.
4. Confirmed address mismatches are visually distinct from weak privacy signals.
5. Kill Switch monitoring can capture transient public-IP changes.
6. Phone layout remains usable without horizontal scrolling.
7. No feature is labelled as a DNS/torrent/email leak test unless the project later owns the required backend infrastructure.
