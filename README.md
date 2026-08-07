# VPN Leak Check

Minimal static VPN address checker for GitHub Pages.

## Current checks

The page starts the available checks automatically when opened. Use **Run again** to repeat them.

- Public IPv4 over HTTP
- Public IPv6 over an IPv6 request
- GeoIP enrichment for detected public addresses
- WebRTC ICE candidates, including public, private, local, relay, and mDNS-protected candidates when the browser exposes them
- Browser and connection metadata exposed without extra permissions
- Conservative comparison of HTTP and WebRTC results

DNS, torrent, and email tests are intentionally absent until private backend services are available. They are disabled in `assets/config.js` and are not rendered as placeholders.

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

## Privacy and external services

The site uses no analytics, cookies, or persistent history. Results remain in browser memory unless copied by the user.

The GitHub Pages-only configuration uses:

- ipify for IPv4 and IPv6 discovery
- ipapi.co for country, city/region, ASN, organization/provider, and timezone metadata
- Cloudflare STUN and Google STUN for WebRTC discovery

GeoIP does not determine the address used by the test. The site first detects the public IPv4/IPv6 address through the configured IP endpoint, then sends that already-detected address to the configured GeoIP provider for metadata lookup. If GeoIP is unavailable, the IP result remains valid and only the location details are omitted.

Modern browsers may replace a numeric local WebRTC address such as `192.168.x.x` with an mDNS hostname ending in `.local`. When this happens, the page reports that the local address is hidden by the browser instead of pretending the numeric address is known.

All external endpoints are configured in `assets/config.js` and can later be replaced with private VPS services.

## GitHub Pages

The repository includes a Pages deployment workflow. In repository **Settings → Pages**, select **GitHub Actions** as the source if GitHub does not select it automatically.
