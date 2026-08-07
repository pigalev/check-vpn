# VPN Leak Check

Static browser-based VPN leak and privacy diagnostics for GitHub Pages.

## Core checks

Core diagnostics start automatically when the page opens. **Run again** repeats the core run and clears cached Advanced results.

- Multi-source public IPv4 consensus
- Multi-source public IPv6 consensus
- Multi-provider GeoIP for detected public addresses
- WebRTC ICE candidates, including public, private, CGNAT/shared, IPv6 local, relay, and mDNS-protected candidates
- HTTP public-address vs WebRTC comparison
- IPv4 vs IPv6 network-metadata comparison
- Browser timezone vs IP timezone comparison
- Compact browser privacy summary
- Structured result severity: `Protected`, `Review`, `Leak detected`, or `Incomplete`

A third-party outage does not erase data returned by other providers. If only one public-IP or GeoIP source works, its result remains visible with reduced source coverage.

## Guided VPN Leak Test

The **Guided VPN Leak Test** is the strongest static-browser check in this project for detecting whether a public address that was visible before the VPN later appears while the VPN is connected.

It is an explicit three-step workflow:

1. Turn the VPN **off** and press **Capture real IP**. The page captures trusted public IPv4/IPv6 addresses from the current non-VPN connection.
2. Turn the VPN **on**, wait for it to connect, and press **Capture VPN IP**. If a captured VPN address still exactly matches a captured real address, the wizard does not silently accept it; it asks for retry or explicit **Continue anyway**.
3. Keep the VPN connected and press **Start 60s stress test**. The stress phase does not start automatically after capture.

Captured addresses are stored only in `sessionStorage` for the current browser tab/session. They are not written to `localStorage` or uploaded to project storage. **Clear captured IPs** removes the guided captures and guided in-memory results without erasing the normal core report or Kill Switch history.

### Known Real semantics

`Known Real` means an **exact public IPv4 or IPv6 address captured in Step 1**. ASN, GeoIP, ISP name, network similarity, VPN/proxy database labels, or a merely similar prefix never turn an address into Known Real.

During Step 3:

- one successful observation of an exact Known Real address is conclusive evidence and produces `REAL IP LEAK DETECTED`;
- a captured VPN address is `Known VPN` and is not a leak;
- a different public address is `Unknown public`, not automatically the real/home IP;
- one unknown-public observation produces `Review`;
- a repeated unknown-public address or confirmation through another transport path can become `UNEXPECTED PUBLIC IP DETECTED`;
- private IPv4, CGNAT `100.64.0.0/10`, IPv6 ULA/link-local, mDNS names, and other non-public ranges never become public-IP leak findings.

A Known Real finding outranks poor sampling coverage: if the exact captured pre-VPN address was observed, the result remains a leak even if other probes were throttled or unavailable.

### Per-provider evidence and reconnect bursts

Guided stress keeps provider-level HTTP observations instead of looking only at the majority consensus. For example, if two public-IP providers return the VPN address but one provider returns an exact Known Real address, that minority observation is preserved and counts as leak evidence rather than being hidden by the consensus winner.

The normal high-frequency HTTP schedule remains anchored to fixed launch times. Slow requests do not push the next intended 2-second launch later.

When the browser reports an online or connection-change event, the guided stress test starts one coalesced reconnect burst with HTTP launch offsets:

`0 / 250 / 500 / 1000 / 2000 / 4000 ms`

and WebRTC stress offsets:

`0 / 500 / 2000 / 4000 ms`

Repeated network events during the same active burst are coalesced instead of multiplying an entire second burst schedule.

### WebRTC stress

The guided stress configuration currently uses four STUN destinations across three operator groups:

- Cloudflare;
- Google primary;
- Google backup — a second destination but the same Google operator group;
- Twilio.

Destination failures are isolated. Successful WebRTC sessions remain usable if another destination fails. The report records the actual candidate protocol. It says TCP was observed only when a real ICE candidate reports `tcp`; configuring or attempting STUN does not itself prove TCP use.

### Optional media-permission WebRTC test

The guided section also contains a separate **optional** media-permission WebRTC comparison. It never runs on page load, during core/advanced checks, or automatically during the 60-second stress test. The browser permission prompt can only be entered from the explicit media-test button.

The test compares WebRTC visibility before and after `getUserMedia({ audio: true, video: true })`. The project does not record or upload audio/video. Any tracks returned by the browser are stopped immediately in a `finally` cleanup path, including when the post-permission WebRTC probe fails.

A newly visible private/local candidate is privacy information only. A newly visible public candidate is classified against the same Guided profile; an exact Known Real address can therefore become real-leak evidence.

The JSON produced by **Copy JSON** includes the `guidedLeak` report with captures, verdict, exposures, path matrix, coverage, reconnect-burst state, and optional media result.

## Aggressive Leak Test

The original **Aggressive Leak Test** remains available as an unguided/manual high-frequency test focused on catching short-lived public-IP exposure while a VPN disconnects, reconnects, changes networks, or fails its Kill Switch.

It never starts automatically. Press **Start 60s test** and reproduce the network transition during the 60-second observation window.

During the explicit test the page repeatedly compares several independent browser-visible paths:

- forced IPv4 and IPv6 HTTP consensus approximately every 2 seconds;
- isolated STUN observations approximately every 5 seconds;
- HTTP echo observations approximately every 10 seconds;
- TLS-reflector remote-IP observation approximately every 15 seconds;
- immediate debounced network-change probes.

Every successfully observed public IPv4/IPv6 address is compared with the trusted baseline for that unguided run. The test merges repeated observations of the same unexpected address into one exposure record showing first/last observation, approximate exposure window, observing paths, whether the original baseline returned, and optional GeoIP/ASN/network enrichment.

The final unguided result is exactly one of:

- `Leak detected` — at least one unexpected public address was actually observed;
- `No unexpected IP observed` — no unexpected public address was captured and sampling coverage was sufficient;
- `Inconclusive` — no leak was captured, but browser throttling, an early stop, or insufficient successful sampling means the page cannot honestly call the run clean.

Browser timer gaps are measured. If a background tab is heavily throttled, the test reports the largest coverage gap instead of silently treating the missed interval as protected.

Aggressive mode intentionally sends more requests to configured third-party services for 60 seconds. It remains opt-in, uses no analytics, and stores its timeline only in browser memory unless **Copy JSON** is used.

## Advanced details

Advanced checks are intentionally lazy. They run when **Advanced details** is opened and are cached for the current core run. **Run advanced again** explicitly retries them.

Advanced diagnostics include:

- VPN / proxy / Tor / datacenter and related IP-database classifications
- ASN, organization, prefix, RIR, and network type where available
- Reverse DNS (PTR) through independent public DNS-over-HTTPS resolvers
- Separate STUN/WebRTC observations using the configured STUN servers
- STUN public-port comparison and NAT mapping hints without pretending to identify an exact NAT type
- TLS/HTTP fingerprint observation through a third-party TLS reflector, including JA3/JA4 when exposed by the reflector
- Local Canvas, WebGL, WebGPU, and Audio fingerprint exposure checks
- High-confidence environment consistency checks across User-Agent, Client Hints, legacy platform metadata, touch support, and related browser signals
- Best-effort HTTP request-path inspection through an echo service
- Expanded browser-visible privacy information such as screen/viewport, CPU threads, device memory where exposed, touch points, cookies, connection hints, GPC, and DNT

Canvas and audio digests are computed locally with Web Crypto and remain only in the in-memory report unless the user copies the JSON. They are not sent to the project or to analytics infrastructure.

Reverse DNS is **not** a DNS leak test. Third-party VPN/proxy/Tor labels are database classifications and are not treated as proof of a leak. STUN port differences are NAT-behavior hints only.

## Kill Switch test

The Kill Switch/IP-change monitor never starts automatically. Press **Start monitoring** while intentionally disconnecting/reconnecting the VPN or changing networks.

While enabled it samples lightweight public-IP endpoints at a configurable interval (5 seconds by default), keeps a timeline in browser memory, and records actual successfully observed address changes. Temporary failed/unavailable samples are ignored instead of being reported as an IP change.

After a real address transition, the new address is enriched asynchronously with the existing GeoIP and network-intelligence providers. This can label transitions such as `Possible ISP exposure`, `Network path changed`, or `Address changed within same network`. Enrichment explains an already-observed hard IP change; it never creates a leak event by itself.

## IP and WebRTC classification

The page distinguishes public Internet addresses from common non-public ranges so local metadata is not promoted into a false leak.

Examples include RFC1918 private IPv4, CGNAT/shared `100.64.0.0/10`, IPv6 ULA, link-local, multicast, documentation, loopback, unspecified, IPv4-mapped IPv6, plus informational 6to4/Teredo transition hints.

CGNAT, private IPv4, IPv6 ULA/link-local, or an mDNS hostname visible through WebRTC are privacy/network metadata. They do not independently count as a public-IP VPN leak.

## What counts as a leak

`Leak detected` is reserved for strong address evidence, including:

- an exact captured Known Real public address observed during the Guided VPN Leak Test;
- a confirmed unexpected public address during the Guided test;
- a public WebRTC/STUN address that differs from trusted HTTP public addresses in core diagnostics;
- a public-address change captured during an explicitly running Kill Switch test;
- an unexpected public IPv4/global IPv6 observed by the unguided Aggressive Leak Test.

TLS fingerprints, Canvas/WebGL/WebGPU/Audio exposure, STUN port variation, CGNAT/local-address exposure, GeoIP disagreement, timezone mismatch, and VPN/proxy/datacenter classification do not become leaks by themselves. Strong browser-environment contradictions may produce `Review` only.

## Not available without a project-owned backend

The static page intentionally does not pretend to provide:

- authoritative per-session DNS leak testing;
- torrent tracker leak testing;
- email/SMTP leak testing;
- project-owned STUN/TURN observations;
- project-owned IPv4/IPv6 echo endpoints;
- packet-level tunnel inspection;
- automatic authoritative discovery of a user's pre-VPN/home IP without an explicit pre-VPN capture.

Those checks require infrastructure controlled by this project and can be added later when a VPS/backend is available.

## Privacy and external services

The project itself uses no analytics and stores no persistent result history. Core, Advanced, Kill Switch, Aggressive, and stress timelines remain in browser memory unless the user copies them. Guided Real/VPN captures are the exception only in lifetime, not destination: they use current-tab `sessionStorage` so the multi-step workflow survives activity within that tab, and **Clear captured IPs** removes them.

The current GitHub Pages configuration may contact multiple third-party services, including:

- ipify, IPPubblico, ipwho.is, and icanhazip for public-address discovery/fallbacks;
- ipapi.co, ipwho.is, and FreeIPAPI for GeoIP metadata;
- ipapi.is for optional network-intelligence metadata;
- Cloudflare and Google DNS-over-HTTPS for optional PTR lookups;
- Cloudflare, Google, and Twilio STUN endpoints for WebRTC observations/stress;
- tls.peet.ws for optional TLS/HTTP fingerprint and remote-IP observation;
- httpbin for optional HTTP path/echo inspection;
- FlagCDN for country flag images.

These third-party services necessarily observe requests sent to them and may apply their own logging/privacy policies. The project does not control those external logs.

Opening Advanced sends one best-effort request to the configured TLS reflector. Canvas/audio hashes are not included in that request.

Guided and unguided 60-second stress modes repeatedly contact configured IP/STUN services and periodically contact configured echo/TLS endpoints. GeoIP/intelligence enrichment receives only public addresses that the page has already detected and is cached per address where applicable.

Kill Switch monitoring repeatedly contacts lightweight IP endpoints only while the user has explicitly enabled monitoring; GeoIP/intelligence enrichment happens only after an actual public-address transition.

All external endpoints and timeouts are configured in `assets/config.js` so they can later be replaced with project-owned services.

## Run locally

```bash
python -m http.server 8080
```

Open `http://localhost:8080`.

## Verify

Requires Node.js 22 or newer.

```bash
npm ci
npm run check
```

## GitHub Pages

The repository includes a Pages deployment workflow. In repository **Settings → Pages**, select **GitHub Actions** as the source if GitHub does not select it automatically.
