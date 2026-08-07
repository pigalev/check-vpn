# Fast Progressive IP + RU-Friendly GeoIP — Design

Date: 2026-08-07
Branch: `feature/fast-geoip-ru`
Base: `main` at `09f753121f423a2d61c0f3cfa95dc323a4493cb4`

## Goal

Make the core page feel substantially faster, especially on Russian mobile networks, by rendering the first trustworthy public IP and first usable GeoIP result immediately instead of waiting for every provider/timeout. Add RU-friendly GeoIP coverage so Russian carrier pools such as `128.71.33.91` do not unnecessarily end as `Location unavailable` when usable geolocation data exists.

## Root cause in the current flow

`runCore()` currently waits for all three core tasks (`IPv4 consensus`, `IPv6 consensus`, `WebRTC`) with `Promise.all`, then waits for both GeoIP enrichments with another `Promise.all`, and only after that renders the IP cards. A single slow/unreachable IP or GeoIP provider can therefore delay visible results by several seconds even when another provider already returned a valid answer.

The optimization must change rendering semantics, not simply lower timeouts.

## Chosen strategy: progressive fast-first + background consensus

All relevant providers start in parallel, but the UI is no longer blocked on full consensus.

For each address family:

1. start all configured public-IP providers in parallel;
2. as soon as the first valid same-family public address arrives, render it immediately as a provisional/current address;
3. immediately start GeoIP lookups for that address;
4. as soon as the first GeoIP provider returns usable location data, render that location immediately;
5. allow remaining IP and GeoIP providers to finish in the background;
6. when consensus is complete, update the card with final source counts/agreement and replace provisional metadata only when the final consensus result is materially better or different.

No failed/slow provider may hold the first visible IP or first visible location until its timeout.

## Progressive result states

The existing cards remain visually simple. Internal state becomes progressive:

- `Running` — no valid address yet;
- `Detected` — first valid address rendered, consensus still running;
- `Complete` — IP consensus finished;
- GeoIP may independently be `Locating…`, `Detected`, `Complete/Partial`, or `Unavailable`.

The product does not need a large new UI. A user should primarily notice that the IP appears much sooner.

During the short provisional period, the card may update if later providers disagree. The UI must not call a provisional address "consensus" until consensus has actually finished.

## Public-IP fast-first API

Refactor the existing IP provider machinery so one execution can provide both:

- `onFirstValid(result)` — fired once for the first valid same-family public address;
- final `runIpConsensus()`-compatible result after all providers settle or individually timeout.

Preferred implementation shape:

```text
runIpConsensusProgressive({ family, providers, timeoutMs, fetchImpl, onFirstValid })
  -> Promise<final consensus result>
```

Reuse the existing provider execution/validation logic. Do not duplicate IPv4/IPv6 validation in `app.js`.

The existing `runIpConsensus()` API remains backward compatible for monitor, aggressive tests and other callers. It may internally call the progressive primitive without a callback.

## GeoIP fast-first API

Create the same progressive pattern for GeoIP:

```text
runGeoIpConsensusProgressive({ ip, providers, timeoutMs, fetchImpl, onFirstUsable })
  -> Promise<final consensus result>
```

`onFirstUsable` fires once when a provider returns a normalized result containing at least one meaningful location field:

- country/countryCode, or
- region, or
- city.

ASN/org-only data is useful diagnostics but is not enough to satisfy the first location callback.

The final consensus keeps the current majority/differences behavior.

## RU-friendly GeoIP provider set

Keep the current providers:

- `ipapi.co`
- `ipwho.is`
- `FreeIPAPI`

Add:

### `ipapi.is`

Use its public browser-compatible endpoint for geolocation as well as the already existing intelligence use. Normalize its location payload into the same GeoIP result shape. It supports browser `fetch` and provides location, ASN and organization information.

This provider is part of the normal parallel GeoIP race because it is already an external dependency in the project and can improve both speed and Russian-network coverage.

### Sypex Geo regional endpoint

Candidate endpoint:

```text
https://ru.sxgeo.city/json/{ip}
```

Sypex documents regional API endpoints specifically to reduce network latency and provides current GeoIP data. It is particularly useful for Russian/Eastern-European address pools.

However, browser CORS behavior must be verified during implementation from the deployed/browser context before enabling it permanently. If CORS is not reliably available, do not add a JSONP workaround and do not block UI waiting for it. Leave Sypex disabled/omitted until a backend proxy exists.

The static project must not embed API keys.

## Provider request optimization

All GeoIP providers launch at the same time for the detected address. Do not implement sequential fallback because that makes the worst case slower on blocked networks.

The first usable result is shown immediately. Background requests continue only to improve consensus/reporting.

The project must not launch duplicate GeoIP races for the same family/address within one core run. Use one in-flight promise per detected address.

If the provisional IP later changes because final IP consensus chooses a different address:

- ignore stale GeoIP completion for the old provisional address via run/address token;
- start/reuse GeoIP for the final address;
- never attach old-address location to the new address.

## Core rendering flow

`runCore()` should no longer be one blocking `Promise.all` followed by one blocking enrichment `Promise.all`.

Recommended orchestration:

1. increment `runId`, set cards to Running;
2. launch IPv4 progressive consensus, IPv6 progressive consensus and WebRTC concurrently;
3. first valid IPv4/IPv6 callback immediately updates that family card with address and `Location · Locating…`;
4. start progressive GeoIP for that address immediately;
5. first usable GeoIP callback immediately updates the same card with location;
6. final IP consensus updates source agreement and may correct address;
7. final GeoIP consensus updates location/source counts/differences;
8. WebRTC renders when ready rather than holding IP cards hostage;
9. overall assessment is finalized when required core results are complete, but cards remain progressively useful before then.

The overall status can remain `Running` until final core assessment is ready. Fast rendering does not require prematurely declaring `Protected`/`Review`/`Leak`.

## Rendering model

Split current `renderIp(name, result)` assumptions so a card can render partial data safely.

A family view model may contain:

```text
family
address
ipFinal
ipAgreement
geo
geoFinal
```

Examples:

Early:

```text
IPv4                 Detected
128.71.33.91
Location              Russia · Krasnodar
IP sources            Checking…
GeoIP                 Checking…
```

Final:

```text
IPv4                 Complete
128.71.33.91
Location              Russia · Krasnodar
Network               AS3216 · VimpelCom
IP sources            3/3 · agree
GeoIP                 4/5 · differ
```

Do not flash `Location unavailable` while other GeoIP providers are still running. Only show unavailable when all active GeoIP providers have finished without usable location.

## Timeout behavior

Keep provider-level timeout isolation. The perceived-speed improvement comes from first-success rendering, not aggressively shortening timeouts and making reliability worse.

Optional later tuning may lower selected provider timeouts after measurements, but it is not required for this iteration.

## Accuracy and consensus

Fast-first is a rendering optimization, not a weakening of final evidence.

Final report/currentReport continues to store the completed consensus result for IPv4/IPv6 and GeoIP. Provisional values are transient UI state and should not be copied into the final JSON after final consensus exists.

If only one provider succeeds, existing partial/single-source semantics remain.

GeoIP city/region disagreement remains informational/review context, never a VPN leak by itself.

## Privacy/request-volume impact

Adding `ipapi.is` means one additional GeoIP request per detected public IP during core lookup. Sypex, if browser-compatible and enabled, adds another.

This is intentionally parallel because the user prioritizes lowest visible latency. README should disclose the active third-party GeoIP services.

Guided/Aggressive tests should not automatically multiply these new GeoIP requests at their high polling cadence. Their existing enrichment cache/once-per-address behavior must remain intact.

## Error handling

- one IP provider failure cannot block first IP from another provider;
- one GeoIP provider failure cannot block first location from another provider;
- a provider returning malformed/wrong-family data is ignored as first-valid evidence;
- stale callbacks from an older `runId` do not mutate the current UI;
- stale GeoIP from an old provisional address does not attach to a corrected address;
- if all providers fail, existing unavailable behavior remains;
- Sypex CORS failure is ordinary provider unavailability, not a page error.

## Files expected to change

- `assets/ip-consensus.js` — progressive first-valid callback while preserving existing API.
- `assets/geoip.js` — `ipapi.is`/Sypex normalizers and progressive first-usable callback.
- `assets/config.js` — RU-friendly provider configuration.
- `assets/app.js` — non-blocking progressive core orchestration.
- possibly a small focused core-progress helper if `app.js` would otherwise gain too much state logic.
- tests for progressive IP, progressive GeoIP, stale-result protection and UI behavior.
- `README.md` — provider/privacy disclosure.

## Testing requirements

TDD implementation must cover at least:

1. first valid IPv4 callback fires before a slower provider finishes;
2. a failed provider does not delay the first-valid callback;
3. wrong-family response never fires first-valid;
4. final IP consensus result remains identical to existing semantics;
5. first usable GeoIP callback fires before slower providers finish;
6. ASN-only GeoIP result does not count as usable location;
7. `ipapi.is` payload normalizes country/region/city/timezone/ASN/org correctly;
8. Sypex payload normalizes correctly if enabled;
9. all-GeoIP-failed result still becomes `Location unavailable`;
10. UI does not show unavailable while providers are still pending;
11. stale run callback cannot mutate a newer run;
12. stale GeoIP for old provisional IP cannot overwrite final-address location;
13. WebRTC completion no longer delays first visible IP card;
14. final `currentReport` contains completed consensus, not provisional metadata;
15. monitor/aggressive/guided callers using existing consensus APIs remain regression-green.

## Browser verification requirement

Before enabling Sypex in `networkConfig.geoIpProviders`, verify from a real browser/deployed static page that `https://ru.sxgeo.city/json/{ip}` accepts cross-origin HTTPS fetch and returns usable JSON. If this cannot be verified or is unreliable, ship the optimization with `ipapi.is` plus the current providers and leave Sypex out rather than using JSONP or introducing a fragile workaround.

## Success criteria

The feature is successful when:

- on a normal successful network, IPv4/IPv6 address text appears as soon as the fastest valid provider responds rather than after all IP providers and WebRTC finish;
- location appears as soon as the fastest usable GeoIP provider responds rather than after all GeoIP providers finish;
- `128.71.33.91` has a materially better chance of receiving usable Russian mobile GeoIP data through the expanded provider set;
- slow/blocked western APIs no longer visually stall a working RU-friendly result;
- final consensus/report accuracy and leak severity rules remain unchanged;
- full `npm run check` passes on the exact feature HEAD.
