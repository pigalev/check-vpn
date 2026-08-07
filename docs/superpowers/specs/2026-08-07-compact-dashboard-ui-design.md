# Compact Dashboard UI Redesign — Design

Date: 2026-08-07
Branch: `feature/compact-dashboard-ui`
Base: `main`

## Goal

Make the page feel calm, compact and immediately understandable without removing diagnostic depth.

The first screen should answer, in this order:

1. What is my current public IP/network?
2. Is there a likely leak or mismatch?
3. Is there anything worth reviewing?
4. Where can I open technical details or run stronger interactive tests?

The current design gives IPv4, IPv6, WebRTC and Privacy equal visual weight. That wastes vertical space when IPv6 is unavailable, privacy metadata is routine, or an advanced service returns no data. The redesign changes the information hierarchy so importance controls visual weight.

This is a UI/UX restructuring only. Existing leak-severity rules, capture logic, provider consensus, Guided/Aggressive/Kill Switch behavior and final JSON semantics remain unchanged unless explicitly noted below for presentation/error wording.

## Design principles

### 1. Important result = large; routine/unavailable result = compact

A successful primary public IP, a real leak finding, or a meaningful warning gets prominent space.

`IPv6 not detected`, `GPC unavailable`, `TLS unavailable`, ordinary browser metadata and similar low-value states must never occupy a large empty card.

### 2. Group by user question, not by implementation module

The page should no longer expose the internal diagnostic architecture as four equal cards.

Static information is grouped into:

- `Your connection`
- `Leak checks`
- `Privacy`
- `Advanced diagnostics`

Interactive workflows are grouped separately under:

- `Active tests`

### 3. Progressive disclosure

The first view shows conclusions and the few values that help a normal user.

Technical evidence remains available through native disclosure controls (`details/summary`) or compact row expansion. No diagnostic data is deleted from the application/report merely because it is not visible by default.

### 4. Problems expand; healthy states contract

A mismatch/leak should become visually more obvious than a normal result.

Examples:

- WebRTC mismatch: show offending public IP immediately and use danger styling.
- Timezone mismatch: show the mismatch directly in the compact Privacy surface.
- TLS service unavailable: one compact unavailable row, not six empty technical fields.

## Page hierarchy

The main page order becomes:

1. Header + `Run again`
2. `Your connection` hero
3. Overall verdict / important findings integrated with the upper dashboard region
4. `Leak checks`
5. `Privacy`
6. `Advanced diagnostics` disclosure
7. `Active tests`
8. Copy JSON

The exact order of hero vs overall verdict can be implemented as one visual dashboard region, but the current public IP must be the most visually dominant value after the page title.

## 1. Your connection

Replace separate IPv4 and IPv6 cards with one `Your connection` card.

### Primary address

Prefer IPv4 as the main presentation when IPv4 exists, because it is the overwhelmingly common browser-visible address for the target audience and is usually easier to read/copy.

The primary address presentation contains:

- large public address;
- country/location when available;
- ASN + organization/network when available;
- source coverage/agreement;
- current provisional/final state while progressive IP/GeoIP lookup is running.

Example:

```text
Your connection                         Protected

128.71.33.91
Russia · Krasnodar
AS3216 · VimpelCom

IPv4   3/3 sources · agree
IPv6   Not detected
```

No label should imply that GeoIP city data is exact physical location.

### IPv6 behavior

IPv6 is never a separate large card.

If unavailable:

```text
IPv6   Not detected
```

If detected, show a second address row inside `Your connection`:

```text
IPv6   2a00:....
       Germany · Frankfurt
       2/3 sources
```

If IPv4 is unavailable but IPv6 exists, IPv6 becomes the primary large address rather than leaving the hero empty.

If both are unavailable, the hero shows a concise `Public IP unavailable` state with retry guidance rather than two empty cards.

### Progressive lookup

The fast-first implementation remains visible:

- first valid public address can appear before final consensus;
- location can appear before all GeoIP providers finish;
- provisional source text uses `Checking…`;
- `Unavailable` is shown only after final failure for that field.

The redesign must not regress progressive rendering speed.

## Overall verdict

The current global assessment (`Protected`, `Review`, `Leak detected`, `Incomplete`) remains authoritative.

Instead of consuming a separate large strip plus four large cards, its pill and short message should visually attach to the dashboard top region.

Recommended presentation:

- verdict pill in the `Your connection` header on wide layouts;
- important finding chips immediately below the connection summary when findings exist;
- no extra large empty summary box when there are no findings.

For accessibility, verdict text remains explicit; color is supplementary only.

## 2. Leak checks

Replace the large default WebRTC card with one compact `Leak checks` surface.

The default surface summarizes outcomes, not raw ICE diagnostics.

Recommended rows:

```text
WebRTC public IP       No mismatch
IP consistency         Passed
Local address exposure mDNS protected
IPv6 path              Not detected
```

Rows are conditionally chosen; do not mechanically show all four if they add no information.

### Priority rules

A healthy/no-mismatch result stays compact.

A public WebRTC mismatch becomes prominent:

```text
WebRTC public IP       LEAK / mismatch
203.0.113.8
Public WebRTC address differs from HTTP public IP.
```

The exposed address must be directly visible without opening details.

### WebRTC technical details

Raw data moves under `WebRTC details` disclosure:

- candidate count;
- host/srflx/relay counts;
- IPv4/IPv6 counts;
- UDP/TCP counts;
- private IPv4/CGNAT/ULA exposure;
- mDNS protection;
- full candidate list with address, type, protocol, port and notes.

No WebRTC evidence is removed from the report.

## 3. Privacy

Privacy becomes a compact summary with only meaningful browser/network consistency signals visible by default.

Default rows should prioritize:

- browser timezone vs IP timezone;
- language only when useful;
- environment contradiction/review state when present.

For the user's observed case:

```text
Privacy                                  Review
Timezone   Europe/Moscow ↔ Europe/Berlin   Mismatch
Language   en-US, en, ru
Show details
```

Do not repeat a second sentence like `Browser timezone differs from IP timezone.` when the mismatch row already states the same fact.

### Privacy details

Move routine metadata under `Privacy details`:

- platform;
- secure context;
- GPC;
- DNT;
- browser/UA data already collected by the project;
- other non-critical privacy metadata currently rendered elsewhere in static diagnostics.

Missing optional browser APIs are neutral unavailable metadata, not warnings.

## 4. Advanced diagnostics

Keep the existing top-level `Advanced diagnostics` disclosure closed by default.

Inside it, replace the current equal-height card grid with a compact list of diagnostic rows.

Example:

```text
TLS fingerprint       Unavailable       ›
Reverse DNS           Complete          ›
VPN intelligence      Complete          ›
HTTP request path     Complete          ›
Fingerprint exposure  Available         ›
STUN mapping          Complete          ›
Environment           No contradiction  ›
```

Each row opens its own details only when useful.

### Advanced row behavior

- complete result: show one meaningful short summary;
- partial result: `Partial` plus available high-value field(s);
- unavailable result: one row plus concise reason;
- error: one row plus concise failure text;
- do not render empty detail fields as repeated `Unavailable` values.

### TLS fingerprint specifically

Current behavior maps a timeout or browser fetch `TypeError` into generic `Unavailable` and then the UI renders every field as unavailable.

New UI behavior:

```text
TLS fingerprint   Unavailable
External reflector could not be reached.   Retry
```

When TLS returns data, only then show fields that actually exist:

- observed IP;
- HTTP version;
- TLS version;
- ALPN;
- JA3 hash;
- JA4;
- optional cipher/extensions/HTTP2 fingerprint where available.

The implementation may improve presentation-level failure categorization (`Timed out`, `Request blocked/unreachable`, `Invalid response`) if this can be done reliably from existing error objects. It must not claim CORS specifically when browser `fetch` only exposes a generic `TypeError`.

`Run advanced again` remains available at the section level. A per-row retry control is optional only if it can reuse the current advanced-run architecture without duplicating request orchestration; otherwise the row copy may direct the user to `Run advanced again`.

## 5. Active tests

Group the three interactive workflows under one `Active tests` section below static diagnostics.

The section contains:

- Guided VPN Leak Test;
- Kill Switch test;
- Aggressive Leak Test.

### Default idle state

Idle tests should be compact summaries, not full-height shells.

Suggested collapsed rows/cards:

```text
Guided VPN Leak Test     Recommended   Start ›
Kill Switch test         Manual        Start ›
Aggressive Leak Test     60 seconds    Start ›
```

### Expansion behavior

When a test is selected/started, its full current controls/results become visible.

Guided must still support its 3-step capture workflow, Clear captured IPs, result/exposure/path/coverage UI and optional media-permission test.

Kill Switch timeline appears only when there are events/running state worth showing.

Aggressive progress/timeline/exposures appear while running or when the user has a completed result.

Collapsing an active/running test must not stop the test unless the user explicitly presses Stop where supported. UI collapse and diagnostic lifecycle remain separate concepts.

## Visual language

Keep the current dark/light theme, typography and restrained visual identity.

The redesign should reduce visual noise by:

- fewer outer borders;
- fewer nested cards;
- smaller vertical gaps;
- compact rows with subtle separators;
- large typography reserved primarily for the public IP and important leak addresses;
- status colors used only for meaningful semantic states;
- routine `Complete` labels de-emphasized.

Avoid a dense admin-panel look. The page should feel like a consumer privacy checker with technical depth available on demand.

## Desktop layout

Target page width can remain around the current 1040 px.

Recommended desktop composition:

- `Your connection`: full-width hero;
- below it, `Leak checks` and `Privacy`: two-column grid where content height follows content rather than forced matching blank space;
- `Advanced diagnostics`: full-width disclosure;
- `Active tests`: full-width grouped section.

Do not use fixed/minimum card heights that create large blank surfaces.

## Mobile layout

Mobile is a single column.

Requirements:

- public address may wrap/break safely;
- hero remains first and most visible;
- status/value rows use label/value alignment when space allows and stack only when necessary;
- `IPv6 Not detected` remains one compact row;
- disclosures have at least 44 px touch targets;
- interactive test buttons remain full-width when useful;
- no horizontal scrolling for IPv6, candidates, JA3/JA4 or timeline data.

## DOM/architecture direction

The current code dynamically creates four cards (`ipv4`, `ipv6`, `webrtc`, `privacy`) in `app.js`. The redesign should stop treating those as the primary layout abstraction.

Preferred structure:

```text
#dashboard
  #connection-panel
  #dashboard-secondary
    #leak-panel
    #privacy-panel

#advanced-details
  #advanced-results

#active-tests
  guided disclosure
  monitor disclosure
  aggressive disclosure
```

Rendering should use small focused functions:

- render connection summary from IPv4/IPv6;
- render leak summary from WebRTC + address-family assessment;
- render privacy summary/details;
- render advanced list rows/details;
- render active-test collapsed/expanded state.

Do not perform diagnostic classification inside CSS/DOM rendering when an existing assessment helper already owns that decision.

## Data/report compatibility

The redesign is presentational.

`currentReport` and Copy JSON must keep all currently available fields:

- IPv4/IPv6 consensus + GeoIP;
- WebRTC candidates;
- browser/privacy;
- advanced diagnostics;
- monitor;
- aggressive;
- guidedLeak;
- assessment/findings.

Hidden/collapsed UI does not imply deleted data.

## Error and unavailable semantics

Use consistent compact labels:

- `Checking…` — request in progress;
- `Not detected` — a valid completed check found no address/evidence;
- `Unavailable` — the check could not produce a usable result;
- `Partial` — usable but incomplete third-party result;
- `Review` — a meaningful non-leak inconsistency;
- `Leak detected` — strong address evidence under existing severity rules.

Do not use `Unavailable` for a normal absence when `Not detected` is clearer (for example no IPv6 connectivity).

Do not convert third-party service failures into leak/review findings solely to make them visible.

## Accessibility

- Native `details/summary` preferred for disclosure where practical.
- All disclosure controls keyboard accessible.
- Maintain focus-visible styling.
- Status meaning cannot rely on color alone.
- `aria-live` remains on changing overall/guided/aggressive results where currently useful.
- Collapsed technical content must remain reachable without a pointer device.

## Testing requirements

Implementation must include regression coverage for at least:

1. no separate large IPv6 card exists in the primary dashboard;
2. unavailable IPv6 renders as a compact `Not detected` connection row;
3. IPv6 becomes visible in the connection panel when detected;
4. IPv6 can become the primary connection when IPv4 is unavailable;
5. progressive first-IP/first-GeoIP rendering still works;
6. WebRTC healthy state is compact;
7. public WebRTC mismatch visibly exposes the mismatching address without opening details;
8. raw ICE candidates remain accessible under details;
9. timezone mismatch appears once, not as duplicated warning copy;
10. GPC/DNT/platform/secure-context data exists under Privacy details rather than default top-level rows;
11. TLS unavailable renders one concise unavailable summary and no repeated empty JA3/JA4/etc rows;
12. TLS successful result shows only populated technical fields;
13. advanced results use compact expandable rows rather than equal-height blank cards;
14. active tests are compact while idle;
15. starting/continuing Guided, Kill Switch or Aggressive does not lose existing controls/results/state;
16. collapsing an active test does not implicitly stop it;
17. Copy JSON data remains schema-compatible with pre-redesign report output;
18. existing assessment/leak severity regression tests remain green;
19. mobile layout has no horizontal overflow with long IPv6/JA3/candidate values;
20. static validator confirms the new dashboard/active-test containers and single app module entry.

## Files expected to change

Likely:

- `index.html` — dashboard and Active tests grouping/disclosures.
- `assets/styles.css` — compact dashboard, hero, summary rows, disclosures and responsive rules.
- `assets/guided-leak.css` — only where necessary to support collapsed Active tests without duplicating styles.
- `assets/app.js` — replace four-primary-card rendering with grouped dashboard renderers.
- `assets/aggressive-leak-render.js` and/or `assets/guided-leak-render.js` only if their rendering assumes always-expanded shells.
- `assets/tls-fingerprint.js` only if reliable presentation-level unavailable reason classification needs a small structured error field.
- focused UI helper module(s) if `app.js` would otherwise become harder to understand/test.
- UI/static/regression tests.
- `scripts/validate-static.mjs`.
- `README.md` if screenshots/textual feature structure references the old layout.

## Out of scope

- Changing leak severity definitions.
- Adding new network providers/tests.
- Replacing current progressive IP/GeoIP logic.
- Adding a frontend framework.
- Rebuilding the design as a separate application.
- Changing Guided/Aggressive/Kill Switch diagnostic algorithms.
- Adding authoritative DNS/torrent/email tests.
- Adding project backend infrastructure.

## Success criteria

The redesign succeeds when:

- the public IP/network is the obvious first result;
- absent IPv6 uses roughly one row instead of one large card;
- normal WebRTC/privacy states are quickly scannable without technical clutter;
- technical evidence remains one interaction away;
- Advanced unavailable checks consume minimal vertical space;
- idle interactive tests do not dominate the page;
- a real leak or meaningful mismatch remains more visible than healthy routine data;
- the page is materially shorter in a normal IPv4-only/no-leak run;
- no diagnostic/report capability is lost;
- the complete test/static-validation suite passes on the final feature HEAD.
