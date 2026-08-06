# Check VPN — GitHub Pages MVP Design

## Goal

Build a minimal English-language VPN leak check page that runs entirely on GitHub Pages and exposes only tests that can produce meaningful results without a private backend.

## Scope

The first release will include:

- Public IPv4 detection through a browser-accessible third-party endpoint.
- Public IPv6 detection through an IPv6-only browser-accessible endpoint.
- WebRTC ICE candidate collection through a public STUN server.
- Comparison of HTTP-discovered addresses with WebRTC-discovered public addresses.
- Browser and network metadata that the browser exposes without extra permissions.
- A concise overall result.
- Manual re-run.
- Copyable JSON report.

The first release will not display DNS, torrent, or email checks. Those checks remain disabled in configuration until the private VPS services exist. No placeholders, unavailable cards, “coming soon” labels, or backend-required notices will be visible.

## Technical approach

Use plain HTML, CSS, and JavaScript without a framework or build step.

Repository structure:

```text
index.html
assets/styles.css
assets/config.js
assets/tests.js
assets/app.js
tests/
.github/workflows/pages.yml
.github/workflows/test.yml
README.md
```

`config.js` contains feature switches and endpoint configuration. Disabled features are not rendered.

```js
export const features = {
  ipv4: true,
  ipv6: true,
  webrtc: true,
  dns: false,
  torrent: false,
  email: false
};
```

## Interface

The site is a single responsive page with restrained styling and no decorative complexity.

Visible elements:

1. Product title and one-sentence description.
2. `Run tests` button.
3. IPv4 result.
4. IPv6 result.
5. WebRTC result.
6. Browser and network information.
7. Overall assessment.
8. `Copy JSON` action.

Each test uses the same states:

- Idle
- Running
- Complete
- Unavailable
- Error

Technical failures are shown in plain language. The site never converts a failed request into a leak or a successful result.

## Data flow

1. The user starts the test.
2. IPv4, IPv6, and WebRTC checks run independently and concurrently.
3. Each check returns a normalized result object.
4. The assessment module compares discovered addresses.
5. The UI renders only enabled features.
6. The final normalized result can be copied as JSON.

Example normalized result:

```json
{
  "startedAt": "2026-08-06T19:00:00.000Z",
  "ipv4": {
    "status": "complete",
    "address": "203.0.113.10"
  },
  "ipv6": {
    "status": "unavailable",
    "address": null
  },
  "webrtc": {
    "status": "complete",
    "addresses": ["203.0.113.10"]
  },
  "assessment": {
    "status": "ok",
    "message": "No address mismatch detected."
  }
}
```

## Assessment rules

The MVP avoids claiming that a VPN is definitely safe.

- Matching HTTP and WebRTC public addresses: no address mismatch detected.
- A WebRTC public address differs from the detected HTTP address: possible WebRTC route mismatch.
- IPv6 is unavailable: report only that IPv6 connectivity was not detected.
- IPv6 is available: display it without assuming it is a leak because the service does not know the user’s expected VPN addresses.
- Any incomplete test: mark that test unavailable or failed and keep the overall result qualified.

Local, mDNS, loopback, and private ICE candidates are displayed separately or omitted from the leak assessment.

## External dependencies

The GitHub Pages version may use configurable public endpoints for IP discovery and a configurable public STUN server. Endpoints are isolated in `config.js` so they can later be replaced with the user’s VPS without changing the interface.

Requests use timeouts. A failed third-party service must not prevent other tests from completing.

## Privacy

- No analytics.
- No cookies.
- No persistent test history.
- Results remain in browser memory unless the user copies them.
- The README explains that third-party IP and STUN endpoints receive network requests in the GitHub Pages-only version.

## Testing

Automated checks will cover:

- Feature-flag rendering.
- IPv4 and IPv6 response normalization.
- WebRTC candidate parsing and address classification.
- Assessment rules.
- Timeout and failure handling.
- Basic static validation in GitHub Actions.

A GitHub Actions workflow will deploy the static files to GitHub Pages after successful checks on the main branch.

## Future VPS integration

The later VPS phase will replace third-party endpoints and enable additional feature flags:

- Private IPv4 and IPv6 HTTP endpoints.
- Private STUN service.
- Authoritative DNS leak test.
- Private torrent tracker test.
- SMTP email metadata test.

The frontend structure and normalized result model remain compatible with those additions.
