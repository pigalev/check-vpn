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

## Aggressive Leak Test

The **Aggressive Leak Test** is a manual high-frequency test focused specifically on catching short-lived public-IP exposure while a VPN disconnects, reconnects, changes networks, or fails its Kill Switch.

It never starts automatically. Press **Start 60s test** and reproduce the network transition during the 60-second observation window.

During the explicit test the page repeatedly compares several independent browser-visible paths:

- forced IPv4 and IPv6 HTTP consensus approximately every 2 seconds;
- isolated Cloudflare and Google STUN observations approximately every 5 seconds;
- HTTP echo observations approximately every 10 seconds;
- TLS-reflector remote-IP observation approximately every 15 seconds;
- immediate debounced HTTP/STUN bursts after browser online or connection-change events.

Every successfully observed public IPv4/IPv6 address is compared with the trusted HTTP baseline. A new public IPv4, a new global IPv6, IPv6 appearing when the baseline had no IPv6, or a public STUN/WebRTC address outside the trusted HTTP baseline is hard leak evidence.

The test merges repeated observations of the same unexpected address into one exposure record showing first/last observation, approximate exposure window, observing paths, whether the original baseline returned, and optional GeoIP/ASN/network enrichment.

The final result is exactly one of:

- `Leak detected` — at least one unexpected public address was actually observed;
- `No unexpected IP observed` — no unexpected public address was captured and sampling coverage was sufficient;
- `Inconclusive` — no leak was captured, but browser throttling, an early stop, or insufficient successful sampling means the page cannot honestly call the run clean.

Browser timer gaps are measured. If a background tab is heavily throttled, the test reports the largest coverage gap instead of silently treating the missed interval as protected.

Aggressive mode intentionally sends more requests to the configured third-party services for 60 seconds. It remains opt-in, uses no analytics, and stores its timeline only in browser memory unless **Copy JSON** is used.

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

- a public WebRTC/STUN address that differs from trusted HTTP public addresses;
- a public-address change captured during an explicitly running Kill Switch test;
- an unexpected public IPv4 observed by the Aggressive Leak Test;
- an unexpected global IPv6 observed by the Aggressive Leak Test;
- public IPv6 appearing during the aggressive test when the trusted baseline had no IPv6.

TLS fingerprints, Canvas/WebGL/WebGPU/Audio exposure, STUN port variation, CGNAT/local-address exposure, GeoIP disagreement, timezone mismatch, and VPN/proxy/datacenter classification do not become leaks by themselves. Strong browser-environment contradictions may produce `Review` only.

## Not available without a project-owned backend

The static page intentionally does not pretend to provide:

- authoritative per-session DNS leak testing;
- torrent tracker leak testing;
- email/SMTP leak testing;
- project-owned STUN/TURN observations;
- project-owned IPv4/IPv6 echo endpoints;
- packet-level tunnel inspection;
- authoritative determination of the user's pre-VPN/home IP.

Those checks require infrastructure controlled by this project and can be added later when a VPS/backend is available.

## Privacy and external services

The project itself uses no analytics and stores no persistent result history. Diagnostic results remain in browser memory unless the user copies them.

The current GitHub Pages configuration may contact multiple third-party services, including:

- ipify, IPPubblico, ipwho.is, and icanhazip for public-address discovery/fallbacks;
- ipapi.co, ipwho.is, and FreeIPAPI for GeoIP metadata;
- ipapi.is for optional network-intelligence metadata;
- Cloudflare and Google DNS-over-HTTPS for optional PTR lookups;
- Cloudflare STUN and Google STUN for WebRTC observations;
- tls.peet.ws for optional TLS/HTTP fingerprint and remote-IP observation;
- httpbin for optional HTTP path/echo inspection;
- FlagCDN for country flag images.

Opening Advanced sends one best-effort request to the configured TLS reflector. The reflector can observe that HTTPS connection and may apply its own logging/privacy policy. Canvas/audio hashes are not included in that request.

Aggressive mode repeatedly contacts the configured IP/STUN services and periodically contacts the configured echo/TLS endpoints for the 60-second run. GeoIP/intelligence enrichment receives only public addresses that the page has already detected and is cached once per unexpected address within the run.

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
