# VPN Leak Check

Minimal static VPN address checker for GitHub Pages.

## Current checks

- Public IPv4 over HTTP
- Public IPv6 over an IPv6 request
- Public WebRTC ICE addresses
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

The GitHub Pages-only configuration sends requests to ipify for IPv4 and IPv6 discovery, Cloudflare STUN, and Google STUN. These endpoints are configured in `assets/config.js` and can later be replaced with private VPS endpoints.

## GitHub Pages

The repository includes a Pages deployment workflow. In repository **Settings → Pages**, select **GitHub Actions** as the source if GitHub does not select it automatically.
