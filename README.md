# VPN Leak Check

Static browser-based VPN leak and privacy diagnostics for GitHub Pages.

## Core checks

Core diagnostics start automatically when the page opens. **Run again** repeats the core run and clears cached Advanced results.

- Multi-source public IPv4 consensus
- Multi-source public IPv6 consensus
- Multi-provider GeoIP for detected public addresses
- WebRTC ICE candidates, including public, local, relay, and mDNS-protected candidates
- HTTP public-address vs WebRTC comparison
- IPv4 vs IPv6 network-metadata comparison
- Browser timezone vs IP timezone comparison
- Compact browser privacy summary
- Structured result severity: `Protected`, `Review`, `Leak detected`, or `Incomplete`

A third-party outage does not erase data returned by other providers. If only one public-IP or GeoIP source works, its result remains visible with reduced source coverage.

## Advanced details

Advanced checks are intentionally lazy. They run when **Advanced details** is opened and are cached for the current core run. **Run advanced again** explicitly retries them.

Advanced diagnostics include:

- VPN / proxy / Tor / datacenter and related IP-database classifications
- ASN, organization, prefix, RIR, and network type where available
- Reverse DNS (PTR) through independent public DNS-over-HTTPS resolvers
- Separate STUN/WebRTC observations using the configured STUN servers
- Best-effort HTTP request-path inspection through an echo service
- Expanded browser-visible privacy information such as screen/viewport, CPU threads, device memory where exposed, touch points, cookies, connection hints, GPC, and DNT

Reverse DNS is **not** a DNS leak test. Third-party VPN/proxy/Tor labels are database classifications and are not treated as proof of a leak.

## Kill Switch test

The Kill Switch/IP-change monitor never starts automatically. Press **Start monitoring** while intentionally disconnecting/reconnecting the VPN or changing networks.

While enabled it samples lightweight public-IP endpoints at a configurable interval (5 seconds by default), keeps a timeline in browser memory, and records actual successfully observed address changes. Temporary failed/unavailable samples are ignored instead of being reported as an IP change.

An observed address change is highlighted strongly as `Public IP changed during monitoring`; the page does not claim that the new address is necessarily the user's home/pre-VPN address.

## What counts as a leak

`Leak detected` is reserved for strong address evidence such as a public WebRTC address that differs from the HTTP public addresses, or a public-address change captured during an explicitly running Kill Switch test.

GeoIP disagreement, timezone mismatch, IPv4/IPv6 ownership differences, and VPN/proxy/datacenter classification are review or informational signals rather than confirmed leaks by themselves.

## Not available without a project-owned backend

The static page intentionally does not pretend to provide:

- authoritative per-session DNS leak testing;
- torrent tracker leak testing;
- email/SMTP leak testing;
- project-owned STUN/TURN observations;
- project-owned IPv4/IPv6 echo endpoints;
- authoritative determination of the user's pre-VPN/home IP.

Those checks require infrastructure controlled by this project and can be added later when a VPS/backend is available.

## Privacy and external services

The project itself uses no analytics and stores no persistent result history. Diagnostic results remain in browser memory unless the user copies them.

The current GitHub Pages configuration may contact multiple third-party services, including:

- ipify, IPPubblico, ipwho.is, and icanhazip for public-address discovery/fallbacks;
- ipapi.co, ipwho.is, and FreeIPAPI for GeoIP metadata;
- ipapi.is for optional Advanced network-intelligence metadata;
- Cloudflare and Google DNS-over-HTTPS for optional PTR lookups;
- Cloudflare STUN and Google STUN for WebRTC observations;
- httpbin for optional HTTP path inspection;
- FlagCDN for country flag images.

GeoIP/intelligence lookups receive the public IP address already detected by the page. Kill Switch monitoring repeatedly contacts lightweight IP endpoints only while the user has explicitly enabled monitoring. Third-party services may have their own logging and privacy policies.

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
