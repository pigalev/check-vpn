# Check VPN — Auto-run, GeoIP, and Detailed WebRTC Design

## Goal

Improve the GitHub Pages MVP so useful diagnostics start automatically and the visible UI contains the important details currently present only in the JSON report.

## User flow

- Opening the page automatically starts all checks that are available on GitHub Pages.
- The primary button remains visible and reads `Run again` after the automatic run begins.
- IPv4, IPv6, GeoIP enrichment, and WebRTC run without requiring browser permissions.
- Failures are isolated: GeoIP failure does not invalidate a successful IP lookup, and one failed network family does not block the remaining checks.

## IP cards

Each successful IPv4/IPv6 card displays:

- Public IP address.
- Country.
- City and region when available.
- ASN.
- Organization/provider.
- A concise status/detail line.

GeoIP is enrichment only. The address is first detected by the configured IPv4/IPv6 endpoint, then that exact address is sent to a configured GeoIP endpoint. The GeoIP provider is never used as the authoritative source of the detected client IP.

The initial GitHub Pages implementation uses ipapi.co through a configurable URL template because its API supports client-side integration and IPv4/IPv6 lookup. The configuration is isolated so it can later be replaced by the private VPS.

GeoIP result shape:

```json
{
  "status": "complete",
  "ip": "203.0.113.10",
  "countryCode": "DE",
  "country": "Germany",
  "region": "Hesse",
  "city": "Frankfurt am Main",
  "asn": "AS64500",
  "org": "Example Network",
  "timezone": "Europe/Berlin",
  "error": null
}
```

If GeoIP fails, the IP card still displays the detected address and a neutral `Location unavailable` line.

## WebRTC card

The WebRTC section must explain what was discovered rather than show only the word `WebRTC` and one address.

For every ICE candidate, display:

- Address or mDNS hostname.
- Candidate type (`host`, `srflx`, `relay`, etc.).
- IPv4/IPv6 when known.
- UDP/TCP protocol.
- Classification (`public`, `private`, `link-local`, `loopback`, `mDNS protected`).

Candidates are grouped conceptually in the UI:

- `Public address` for public candidates, especially server-reflexive (`srflx`) addresses learned through STUN.
- `Local interface` for private, link-local, loopback, or mDNS host candidates.
- `Relay` for TURN relay candidates if present.

Modern browsers may replace a local address such as `192.168.x.x` with an mDNS hostname. In that case the UI explicitly says `Local address hidden by browser (mDNS)` and does not pretend the numeric local IP is known.

The WebRTC card also contains an HTTP-vs-WebRTC comparison showing the HTTP IPv4/IPv6 addresses and WebRTC public addresses. A mismatch remains a warning; matching addresses are described as `No public address mismatch detected`, not as proof that the VPN is fully safe.

## UI detail parity

The visible interface should contain all important diagnostic information from the JSON report. JSON remains available for QA/debugging but is not the only place where candidate type, address classification, location, ASN, and provider information can be understood.

Browser/network metadata remains visible and concise.

## Configuration

Extend `assets/config.js` with:

- `autoRun: true`.
- GeoIP feature flag enabled for the GitHub Pages release.
- GeoIP URL template such as `https://ipapi.co/{ip}/json/`.
- GeoIP timeout independent of the primary IP lookup timeout.

DNS, torrent, and email flags remain disabled and are not rendered.

## Privacy and external dependencies

The GitHub Pages version sends the already-detected public IP address to the configured GeoIP provider for metadata lookup. The UI/README must state this external dependency. No analytics, cookies, or persistent history are added.

## Testing

Add automated coverage for:

- GeoIP response normalization.
- GeoIP failure preserving the underlying IP result.
- Auto-run configuration.
- ICE candidate grouping/classification and human-readable labels.
- mDNS local-address behavior.
- HTTP-vs-WebRTC comparison data.
- Existing mismatch assessment behavior.

Static validation and Pages deployment remain unchanged except for the newly deployed GeoIP module.