# VPN Leak Check

Static browser-based VPN leak and privacy diagnostics for GitHub Pages.

## Core dashboard

Core diagnostics start automatically when the page opens. **Run again** repeats the core run and clears cached Advanced results.

The default UI is intentionally compact and grouped by what the user needs to know rather than by internal diagnostic modules:

- **Your connection** — the primary authoritative public IP is the dominant result, with approximate GeoIP/network metadata and source confidence.
- **Leak checks** — WebRTC/public-IP consistency is summarized first. Raw ICE candidates and transport details stay under **WebRTC details**.
- **Privacy** — meaningful browser/IP consistency signals such as a timezone mismatch stay visible; routine browser metadata lives under **Privacy details**.
- **Advanced diagnostics** — lazy third-party checks are compact expandable rows rather than equal-height cards.
- Structured result severity remains `Protected`, `Review`, `Leak detected`, or `Incomplete`.

The underlying core checks include progressive multi-source IPv4/IPv6 consensus, multi-provider GeoIP, WebRTC ICE candidates, HTTP-vs-WebRTC comparison, IPv4/IPv6 network-metadata comparison and browser-timezone consistency.

Public IP and location use progressive rendering. The first valid address returned by a Core provider group is shown immediately while the remaining independent groups continue in the background. GeoIP starts as soon as that provisional address is known. The final report and **Copy JSON** use only the completed consensus result; if the final authoritative address differs from the provisional value, stale GeoIP is ignored and location is resolved for the final address.

The active GeoIP race uses `ipapi.co`, `ipwho.is`, `FreeIPAPI`, and `ipapi.is`. Public-IP voting and GeoIP voting are separate concerns: `ipwho.is` is retained for GeoIP metadata but is no longer consumed as an IP-only Core vote.

A third-party outage never erases successful data from other providers. Provider failures and provider disagreement are diagnostic evidence, not VPN-leak evidence by themselves.

### Wide public-IP consensus

Core IPv4 and IPv6 use independent **provider groups** rather than counting every URL as a separate vote. The current primary groups are:

1. `ipify`
2. `ident.me`
3. `SeeIP`
4. `icanhazip`
5. `IP.SB`

`ident.me` has `tnedi.me` as an endpoint fallback inside the same group. If the preferred endpoint fails and the mirror succeeds, the group still contributes exactly **one** vote.

A successful Core result has one of four confidence states:

- **Strong consensus** — at least 3 independent groups succeeded and the winning address has at least two-thirds of all successful group votes.
- **Partial** — only 1–2 independent groups succeeded and they agree. The address remains usable, but evidence is limited.
- **No consensus** — successful groups returned addresses but no address met the two-thirds threshold. The final authoritative `address` is `null`; the first provisional IP is not silently promoted to the final result.
- **Unavailable** — no independent group produced a valid address.

Examples:

- `5-0`, `4-1`, `3-0`, `2-1` → Strong.
- `3-2` among five primary groups is **not** Strong because 60% is below the two-thirds threshold.
- `2-0` → Partial if no usable reserve can strengthen it.
- `2-2`, `3-2` after all applicable evidence, or `1-1-1` → No consensus.

Provider-group failures, malformed responses, CORS failures and wrong-family responses do not vote and do not count as `differs`.

### Reserve provider

`IPPubblico` remains configured as a reserve candidate, but is currently marked `enabled: false`. A live provider smoke from the project origin showed that its IPv4 endpoint returned HTTP 200 and a valid address but did not return a readable CORS permission for the GitHub Pages origin; repeatedly trying it from browser JavaScript would therefore only create predictable failures. It can be re-enabled without changing consensus semantics if browser CORS becomes available again.

A disabled reserve is excluded from vote totals. Advanced evidence can still explain that the reserve exists but is unavailable/disabled; it never creates a fake disagreement or leak.

### Core versus repeated-test provider profiles

The broad Core race and repeated Active-test sampling have different load profiles and therefore use separate provider lists.

- **Core / Guided Step 1–2 capture:** broad five-group primary set above, plus conditional reserve configuration.
- **Kill Switch / Aggressive / Guided stress:** `ipify + ident.me + SeeIP` only.

This keeps the normal user-facing IP result resilient without sending five-provider consensus requests every two seconds during a 60-second stress run.

### Public-IP evidence in Advanced

Open **Advanced diagnostics → IPv4 network** or **IPv6 network** to inspect **Public IP sources**. The subsection reuses data already collected by Core and performs no additional public-IP lookup.

It shows:

- selected authoritative IP, if one exists;
- confidence state;
- primary group response count and vote summary;
- every primary group result;
- reserve state;
- `agrees`, `differs`, `unavailable`, `not needed`, or neutral `observed` relation;
- latency/error information;
- endpoint attempts when a provider group used a fallback mirror.

If final confidence is `No consensus`, successful addresses are shown as `observed` instead of arbitrarily labeling one address as the winner.

## Active tests

The stronger interactive workflows are grouped under **Active tests** and remain collapsed while idle. Each row explains its purpose, keeps a live status visible while collapsed, and shows a prominent result panel after completion.

The four tests answer different questions:

- **Guided VPN Leak Test** — captures your pre-VPN public IP first, so an exact reappearance during the VPN-on stress phase can be identified as your **Known Real** address rather than merely an unexpected IP.
- **Aggressive Leak Test** — watches several browser-visible paths for 60 seconds and catches transient unexpected public addresses without requiring a pre-VPN capture.
- **Kill Switch test** — an open-ended public-IP monitor for a deliberate manual VPN disconnect/reconnect.
- **WebRTC Permission Check** — compares WebRTC/ICE visibility before and after camera/microphone permission. It is a separate specialized WebRTC privacy-path test, not another 60-second stress test. If Guided captures exist, it uses that profile as a baseline; otherwise it runs in Standalone mode.

Guided and Aggressive show `Preparing baseline…` while their initial baseline work is running, then display the countdown from the diagnostic engine's real 60-second observation deadline. The UI clock is presentation-only and does not schedule extra probes. Kill Switch and WebRTC Permission Check show elapsed time.

Opening or collapsing an Active-test disclosure never starts or stops the diagnostic. Lifecycle remains controlled by explicit action buttons.

## Guided VPN Leak Test

The **Guided VPN Leak Test** is the strongest static-browser check in this project for detecting whether a public address visible before the VPN later appears while the VPN is connected.

It is an explicit three-step workflow:

1. Turn the VPN **off** and press **Capture real IP**. The capture uses the broad Core provider groups plus the other Guided capture paths.
2. Turn the VPN **on** and press **Capture VPN IP**. If a VPN capture still exactly matches a Known Real address, the wizard asks for retry or explicit **Continue anyway**.
3. Keep the VPN connected and press **Start 60s stress test**. The stress phase uses the smaller repeated-test provider profile and does not start automatically.

Captured addresses are stored in `sessionStorage` for the current browser tab/session. They are not written to `localStorage` or project storage. **Clear captured IPs** removes Guided captures and Guided in-memory results without erasing the normal Core report or Kill Switch history.

### Known Real semantics

`Known Real` means an **exact public IPv4 or IPv6 address captured in Step 1**. ASN, GeoIP, ISP name, network similarity, VPN/proxy labels or a similar prefix never turn an address into Known Real.

During Step 3:

- one exact Known Real observation is conclusive and produces `REAL IP LEAK DETECTED`;
- a captured VPN address is `Known VPN` and is expected;
- a different public address is `Unknown public`, not automatically the home/mobile IP;
- one unknown-public observation produces `Review`;
- repeated or independently confirmed unknown-public evidence can become `UNEXPECTED PUBLIC IP DETECTED`;
- private IPv4, CGNAT `100.64.0.0/10`, IPv6 ULA/link-local, mDNS names and other non-public ranges never become public-IP leak findings.

Known Real evidence outranks poor sampling coverage. Provider-level HTTP observations are preserved, so a minority provider group returning an exact Known Real address is not hidden by a majority VPN-address consensus.

### Reconnect bursts and WebRTC stress

The normal high-frequency HTTP schedule remains anchored to fixed launch times. On online/connection-change events the Guided stress test starts one coalesced reconnect burst with HTTP launch offsets:

`0 / 250 / 500 / 1000 / 2000 / 4000 ms`

and WebRTC stress offsets:

`0 / 500 / 2000 / 4000 ms`

The Guided stress phase also uses four STUN destinations across three operator groups:

- Cloudflare;
- Google primary;
- Google backup — separate destination, same Google group;
- Twilio.

Destination failures are isolated. Actual candidate protocol is recorded; configuring STUN does not itself prove TCP use.

## WebRTC Permission Check

**WebRTC Permission Check** is a separate fourth row under **Active tests**. It never runs on page load or automatically during Guided/Aggressive stress.

The test compares WebRTC visibility before and after `getUserMedia({ audio: true, video: true })`. The project does not record or upload audio/video, and returned tracks are stopped immediately in cleanup.

Its relationship to Guided is explicit:

- **Baseline: Guided VPN Leak Test** — existing Known Real/Known VPN captures are used to classify newly visible public WebRTC addresses.
- **Standalone mode** — without a Guided baseline, the check can show that an additional public WebRTC address became visible but cannot prove that it is the user's pre-VPN real IP.

A newly visible private/local candidate is privacy information only. The media result remains stored under `guidedLeak.media` in **Copy JSON** for report compatibility.

## Aggressive Leak Test

The **Aggressive Leak Test** is an opt-in 60-second high-frequency test for short-lived public-IP exposure while a VPN disconnects, reconnects, changes networks or fails its Kill Switch.

It repeatedly compares:

- IPv4/IPv6 HTTP stress consensus approximately every 2 seconds;
- isolated STUN observations approximately every 5 seconds;
- HTTP echo approximately every 10 seconds;
- TLS reflector approximately every 15 seconds;
- immediate debounced network-change probes.

The HTTP stress path uses only `ipify`, `ident.me`, and `SeeIP`; it does not call the broad five-provider Core set or the disabled IPPubblico reserve every two seconds.

The final unguided result is exactly one of:

- `Leak detected` — an unexpected public address was observed;
- `No unexpected IP observed` — no unexpected public address was captured and coverage was sufficient;
- `Inconclusive` — no leak was captured, but coverage was insufficient for a clean result.

Browser timer gaps are measured. Aggressive mode stores its timeline only in browser memory unless **Copy JSON** is used.

## Kill Switch test

The Kill Switch/IP-change monitor never starts automatically. Press **Start monitoring**, reproduce a VPN disconnect/reconnect or network transition, then stop it.

While enabled it samples the smaller repeated-test public-IP profile at a configurable interval (5 seconds by default), keeps a timeline in browser memory and records actual successfully observed address changes. Temporary failed/unavailable samples are ignored instead of being reported as an IP change.

A stopped run with usable samples and no address change is `NO IP CHANGE OBSERVED`; a run with no usable public-IP samples is `MONITORING INCONCLUSIVE`.

Observed transitions can be enriched asynchronously with GeoIP/network intelligence. Enrichment explains an already-observed hard IP change; it never creates a leak event by itself.

## Advanced diagnostics

Advanced checks are lazy. They run when **Advanced diagnostics** is opened and are cached for the current Core run. **Run advanced again** explicitly retries them.

Advanced diagnostics include:

- IPv4/IPv6 network details and already-collected public-IP group evidence;
- VPN/proxy/Tor/datacenter IP-database classifications;
- ASN, organization, prefix, RIR and network type where available;
- reverse DNS through independent public DoH resolvers;
- separate STUN/WebRTC observations;
- STUN public-port comparison and NAT mapping hints;
- TLS/HTTP fingerprint observation, including JA3/JA4 when exposed by the reflector;
- local Canvas, WebGL, WebGPU and Audio fingerprint exposure checks;
- high-confidence browser-environment consistency checks;
- best-effort HTTP request-path inspection;
- expanded browser-visible privacy information.

Canvas/audio digests are computed locally and remain in the in-memory report unless copied. Reverse DNS is **not** a DNS leak test. VPN/proxy/Tor database labels are not leak proof. STUN port variation is only a NAT hint. An unavailable Advanced service is not leak evidence.

## IP and WebRTC classification

The page distinguishes public Internet addresses from common non-public ranges such as RFC1918 private IPv4, CGNAT/shared `100.64.0.0/10`, IPv6 ULA/link-local, multicast, documentation, loopback, unspecified and IPv4-mapped IPv6.

CGNAT, private IPv4, IPv6 ULA/link-local or an mDNS hostname visible through WebRTC are privacy/network metadata. They do not independently count as a public-IP VPN leak.

WebRTC mismatch detection trusts only authoritative Core addresses (`Strong consensus` or `Partial`). A family in `No consensus` cannot create a fake WebRTC mismatch merely because HTTP providers disagreed.

## What counts as a leak

`Leak detected` is reserved for strong address evidence, including:

- an exact Known Real public address during Guided;
- a confirmed unexpected public address during Guided;
- a public WebRTC/STUN address differing from authoritative HTTP public addresses;
- a Known Real address exposed by the explicit WebRTC Permission Check;
- a public-address change captured during Kill Switch monitoring;
- an unexpected public address observed by Aggressive.

Provider disagreement by itself, reserve usage, GeoIP disagreement, TLS fingerprints, fingerprint surfaces, STUN port variation, CGNAT/local-address exposure, timezone mismatch and VPN/proxy/datacenter classification do not become leaks by themselves. A Strong `4-1` Core consensus remains usable rather than being turned into `Review` solely because one provider differed.

## Not available without a project-owned backend

The static page intentionally does not pretend to provide:

- authoritative per-session DNS leak testing;
- torrent tracker leak testing;
- email/SMTP leak testing;
- project-owned STUN/TURN observations;
- project-owned IPv4/IPv6 echo endpoints;
- packet-level tunnel inspection;
- automatic authoritative discovery of a pre-VPN/home IP without an explicit pre-VPN capture.

Those checks require project-controlled infrastructure and can be added when the backend/VPS is available.

## Privacy and external services

The project itself uses no analytics and stores no persistent result history. Core, Advanced, Kill Switch, Aggressive and stress timelines remain in browser memory unless copied. Guided Real/VPN captures use current-tab `sessionStorage`.

The current GitHub Pages configuration may contact multiple third-party services, including:

- **Core public-IP discovery:** ipify, ident.me/tnedi.me, SeeIP, icanhazip and IP.SB;
- **Configured but disabled reserve:** IPPubblico;
- **Repeated IP sampling:** ipify, ident.me/tnedi.me and SeeIP;
- **GeoIP:** ipapi.co, ipwho.is, FreeIPAPI and ipapi.is;
- **Network intelligence:** ipapi.is;
- **PTR/DoH:** Cloudflare and Google;
- **STUN:** Cloudflare, Google and Twilio;
- **TLS/HTTP fingerprint:** tls.peet.ws;
- **HTTP path/echo:** httpbin;
- **Flags:** FlagCDN.

Third-party IP/GeoIP/STUN services necessarily observe requests sent to them and may apply their own logging/privacy policies. The project does not control those external logs.

Opening Advanced sends best-effort requests only for its diagnostic modules. Expanding **Public IP sources** does not repeat Core public-IP discovery.

All endpoints and timeouts are configured in `assets/config.js` so they can later be replaced with project-owned services.

## Provider smoke utility

A non-production helper is included for checking response payloads and CORS headers:

```bash
node scripts/check-ip-provider-cors.mjs --origin=https://pigalev.github.io
```

The helper is intentionally **not** part of permanent CI because third-party network reachability would make normal repository tests flaky. GitHub-hosted runners may also lack IPv6 connectivity, so an IPv6 transport failure in this smoke environment is not by itself evidence that an IPv6 provider is broken for end users.

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
