# Active Test UX + Provider Evidence — Design

Date: 2026-08-10
Branch: `feature/test-ux-evidence`
Base: `main`

## Goal

Make every interactive diagnostic understandable without requiring the user to already know the project architecture.

The UI must answer four things clearly:

1. What does this test actually check?
2. How is it different from the other tests?
3. How long is it going to run / how long has it been running?
4. What was the result, in a visually obvious form?

Additionally, public-IP consensus disagreement must become inspectable: if sources disagree, the user should be able to see which provider returned which IP rather than only seeing `2/3 sources · differ`.

This design does not change leak-classification rules. It changes test presentation, timer presentation, WebRTC test placement/context, and provider evidence visibility.

---

## 1. Active tests: explain the conceptual difference in the UI

The `Active tests` section remains the home for interactive workflows, but every row gets a short purpose line that explains what question it answers.

### Guided VPN Leak Test

Purpose shown in UI:

> Checks whether your known pre-VPN public IP appears again while the VPN is connected.

Short differentiation:

> Best when you want to know whether **your actual real IP** leaked.

Concept:

- Step 1 captures Known Real IP(s) with VPN off.
- Step 2 captures Known VPN IP(s) with VPN on.
- Step 3 performs the 60-second stress run and classifies observations against those known addresses.
- An exact Known Real observation remains the strongest evidence.

Idle metadata in collapsed row:

`Recommended · identifies your real IP`

### Aggressive Leak Test

Purpose shown in UI:

> Watches multiple browser-visible network paths for 60 seconds and catches any unexpected public IP during VPN transitions.

Short differentiation:

> Best for catching brief IP changes, even without a pre-VPN baseline.

Concept:

- fixed 60-second duration;
- frequent HTTP IPv4/IPv6 observations;
- STUN, HTTP echo and TLS observations;
- network-change bursts;
- detects unexpected public addresses relative to that run's trusted baseline;
- unlike Guided, an unexpected address is not automatically proven to be the user's real/home IP.

Idle metadata:

`60 seconds · catches transient IP changes`

### Kill Switch test

Purpose shown in UI:

> Monitors your public IP while you manually disconnect or reconnect the VPN.

Short differentiation:

> Best for checking whether the VPN Kill Switch keeps the real network path hidden during a transition.

Concept:

- user explicitly starts monitoring;
- no fixed duration;
- lightweight repeated public-IP checks;
- records real successful address changes;
- user stops monitoring explicitly.

Idle metadata:

`Manual · monitor a disconnect/reconnect`

### WebRTC Permission Check

Move this out of the Guided panel into its own fourth `Active tests` row.

Purpose shown in UI:

> Checks whether granting camera/microphone permission makes additional WebRTC/ICE addresses visible to the page.

Short differentiation:

> This is a **WebRTC privacy path check**, not the 60-second VPN stress test.

Idle metadata:

`WebRTC · permission-based address exposure`

The relationship to Guided must be explicit in the UI.

#### With Guided baseline available

If Known Real and/or Known VPN addresses have already been captured in the current tab/session:

```text
Baseline: Guided VPN Leak Test
Real IP captured   ✓
VPN IP captured    ✓

Any public WebRTC address found here will be compared with those captured addresses.
```

Classification can therefore say:

- `Known Real IP exposed`;
- `Known VPN IP`;
- `Unexpected public IP`;
- no additional public address.

#### Without Guided baseline

If Guided has not captured a baseline:

```text
Standalone mode
No Guided baseline captured.

This test can detect additional public WebRTC addresses, but cannot prove that an address is your known pre-VPN IP.
Run Guided VPN Leak Test first for stronger classification.
```

The test still runs without Guided. Guided is an enhancement, not a prerequisite.

### Why WebRTC is separate

The current implementation visually nests the media-permission check under Guided even though it is a distinct diagnostic mechanism. That makes users reasonably assume it is part of Guided Step 3.

The new structure separates the workflows visually while preserving baseline sharing internally.

---

## 2. Test row state visible while collapsed

Each Active test `<summary>` shows current state on the right.

Examples:

```text
Guided VPN Leak Test          Ready
Guided VPN Leak Test          Step 2/3
Guided VPN Leak Test          Running · 00:42 remaining
Guided VPN Leak Test          ✓ No known real IP observed

Aggressive Leak Test          Ready · 60 seconds
Aggressive Leak Test          Running · 00:37 remaining
Aggressive Leak Test          ⚠ Inconclusive

Kill Switch test              Not running
Kill Switch test              Monitoring · 01:24 elapsed
Kill Switch test              ✓ No IP change observed

WebRTC Permission Check       Standalone
WebRTC Permission Check       Running · 00:04
WebRTC Permission Check       ✓ No additional public IP
```

Status text must be understandable without relying on color.

Collapsing a running test does not stop it. Its timer/state continues updating in the summary.

---

## 3. Timers

### Common rule

UI timers must not depend on when the next network sample finishes. A slow HTTP/STUN request must not make the countdown appear frozen.

Use a lightweight presentation ticker while a test is running. The ticker only updates DOM/view state; it does not launch additional diagnostics.

Recommended update frequency: 250–500 ms internally, displayed at whole-second precision.

### Guided stress timer

During Step 3 stress:

```text
Running stress test
00:42 remaining
[progress bar]
```

Use the underlying stress state's start/end timestamps, not a second independent 60-second deadline.

When finished, timer freezes at `00:00` and is replaced/emphasized by the result panel.

### Aggressive timer

The current renderer already derives remaining time from `state.endsAt`, but it only refreshes when state is rendered. Add a UI ticker so the countdown visibly updates every second even between network samples.

Presentation:

```text
Running
00:37 remaining
[progress bar]
```

Progress is `(duration - remaining) / duration`, clamped to 0–100%.

### Kill Switch timer

No countdown because the user controls stop time.

Presentation:

```text
Monitoring
01:24 elapsed
```

Start timestamp is fixed when monitoring begins. Elapsed UI updates independently from network samples.

### WebRTC Permission timer

This test has no promised fixed duration. Show elapsed time while running:

```text
Running WebRTC permission check
00:04 elapsed
```

Do not invent an ETA.

### Guided capture steps

`Capture real IP` and `Capture VPN IP` are variable-duration captures. Keep `Running…` / spinner-style busy state; an ETA is not useful. Optional elapsed seconds may be shown if the operation exceeds ~2 seconds, but no countdown is required.

---

## 4. Strong result panels

A test result must not be represented only by one small text line below the controls.

Every completed Active test gets a visually distinct result panel at the top of its expanded content.

Common structure:

```text
RESULT
✓ NO KNOWN REAL IP OBSERVED
Your captured pre-VPN address was not observed during the 60-second stress test.

Coverage: sufficient
Observed public IPs: 1
```

or:

```text
RESULT
⚠ TEST INCONCLUSIVE
No unexpected public IP was captured, but sampling coverage was insufficient.

Largest gap: 8.4 s
HTTP observations: 4/10
```

or:

```text
RESULT
✕ REAL IP LEAK DETECTED
128.71.33.91 matched the public IPv4 captured before the VPN was enabled.

First detected by: ipwho.is
Paths: HTTP, STUN
```

### Visual semantics

- clean: success treatment;
- review/inconclusive: warning treatment;
- leak: danger treatment;
- still include explicit words/icons/text so color is not the only signal.

### Guided result

Keep existing verdict hierarchy exactly:

`REAL IP LEAK DETECTED` > `UNEXPECTED PUBLIC IP DETECTED` > `REVIEW` > `TEST INCONCLUSIVE` > `NO KNOWN REAL IP OBSERVED`.

The panel should summarize the most important reason and then leave full exposures/path/coverage below.

### Aggressive result

Exactly:

- `Leak detected`;
- `No unexpected IP observed`;
- `Inconclusive`.

Show coverage beneath the verdict rather than making coverage the primary result text.

### Kill Switch result

While running, there is no final verdict yet.

After stop:

- if a real public address transition was observed: prominent `IP change detected` with old/new addresses;
- if sufficient successful samples occurred and no change: `No IP change observed during monitoring`;
- if essentially no usable samples were collected: `Monitoring inconclusive`.

Do not reinterpret existing monitor address-change events as a new global leak classification. This is presentation of monitor evidence.

### WebRTC Permission result

Result panel examples:

With Guided baseline:

- `Known Real IP exposed through WebRTC`;
- `Only Known VPN IP observed`;
- `Unexpected public WebRTC IP observed`;
- `No additional public WebRTC IP`.

Standalone:

- `Additional public WebRTC IP observed`;
- `No additional public WebRTC IP`;
- `Permission unavailable / test could not run`.

If standalone sees a public IP, text must explicitly say that without a Guided baseline the page cannot claim it is the user's pre-VPN real IP.

---

## 5. Provider consensus evidence

### Current behavior

Public-IP consensus stores every provider result in `ipv4.sources` / `ipv6.sources`.

A provider counts as disagreement only when it successfully returns a valid address that differs from another successful provider's address.

A provider that times out/errors is `unavailable` and reduces `available/total`; it does **not** itself create `differ`.

Example:

```text
ipify       128.71.33.91
IPPubblico  128.71.33.91
ipwho.is    128.71.35.12
```

Result:

```text
2/3? No: all 3 are available.
3/3 sources · differ
winner: 128.71.33.91 (2 votes)
```

If instead ipwho.is times out:

```text
ipify       128.71.33.91
IPPubblico  128.71.33.91
ipwho.is    Unavailable
```

Result:

```text
2/3 sources · agree
```

### Advanced UI

Inside `Advanced diagnostics → IPv4 network` and `IPv6 network`, add a `Public IP sources` subsection before/after network intelligence.

Example:

```text
Public IP sources

ipify        128.71.33.91    ✓ consensus     182 ms
IPPubblico   128.71.33.91    ✓ consensus     241 ms
ipwho.is     128.71.35.12    differs         390 ms
```

Unavailable example:

```text
icanhazip    Unavailable      timeout         6001 ms
```

Fields per source:

- provider label;
- returned address, if any;
- relation to final consensus address: `consensus` / `differs` / `unavailable`;
- latency;
- concise error for unavailable source.

### Consensus summary

At the top of the subsection:

```text
Consensus IP       128.71.33.91
Agreement          2 of 3 successful sources returned this address
Different values   1
```

Use `agreement.counts` for vote counts.

In ties, preserve the current consensus algorithm and explicitly label the chosen display address as the selected result rather than claiming majority.

Example:

```text
No majority — selected first successful result
```

Do not silently hide the tied alternative.

### Main `Your connection` UI

Keep it compact:

- `3/3 sources · agree`;
- `3/3 sources · differ`.

Do not dump provider rows into the hero. The hero stays consumer-friendly; Advanced owns raw evidence.

---

## 6. Active test layout

Recommended order:

1. Guided VPN Leak Test — strongest answer for known real-IP leakage.
2. Aggressive Leak Test — transient/unknown public IP catcher.
3. Kill Switch test — manual transition monitor.
4. WebRTC Permission Check — specialized browser/WebRTC exposure test.

This order teaches the conceptual hierarchy naturally.

Each collapsed row contains:

- test name;
- one-line purpose on desktop / available after expansion on narrow mobile if space is tight;
- duration/mode metadata;
- current/live/final status.

Expanded content begins with:

1. `What this test checks` short paragraph;
2. current timer/progress when running;
3. result panel when completed;
4. controls;
5. technical evidence/details.

Guided keeps its three-step workflow UI after the explanation/result area.

---

## 7. Data and architecture

### No diagnostic duplication

Timers are presentation-only. They must use existing state timestamps (`startedAt`, `endsAt`, monitor start time) and must not schedule network probes.

### WebRTC baseline sharing

The media-permission WebRTC diagnostic remains backed by the current Guided profile store/session data.

Refactor UI/runtime boundaries so the test can live outside the Guided DOM container while still receiving:

- current Guided profile;
- Known Real addresses;
- Known VPN addresses;
- classification helper;
- media result reporting.

Do not duplicate baseline data into another storage key.

### Report compatibility

`guidedLeak.media` should remain available in Copy JSON for compatibility unless a deliberate schema migration is separately approved.

The new standalone-looking WebRTC row is a UI reorganization; underlying media result may remain nested in `guidedLeak` in the report for this iteration.

If no Guided profile exists, the media result is still reportable, with classification reflecting the lack of baseline.

### Provider evidence

No new public-IP requests are needed. Render `currentReport.ipv4.sources` and `currentReport.ipv6.sources` already collected during core consensus.

---

## 8. Error handling

- Timer continues even while a provider request is slow.
- Timer stops immediately when the actual underlying test state stops/completes.
- UI ticker is disposed when test completes, page reruns, or runtime is reset.
- WebRTC permission denied: show a clear test result (`Permission denied / test not completed`) rather than leaving `Running…`.
- WebRTC API unavailable: show `Unsupported`.
- A provider timeout appears as `Unavailable`, not `differs`.
- A wrong-family provider response remains unavailable/error evidence, not a competing consensus IP.
- Provider evidence never changes leak classification by itself; it explains the IP-consensus result.

---

## 9. Mobile behavior

- Active test summary status can wrap below the title rather than overflow.
- Timer uses tabular/monospace digits and remains visible near the top of the running test.
- Progress bar spans available width.
- Result panel IP addresses use `overflow-wrap:anywhere`.
- Provider evidence becomes stacked rows on narrow screens:

```text
ipwho.is
128.71.35.12
Differs · 390 ms
```

No horizontal table scrolling is required.

---

## 10. Testing requirements

Implementation must cover at least:

1. Aggressive countdown updates independently of network sample renders.
2. Guided stress exposes a running countdown based on the same underlying stress end timestamp.
3. Kill Switch displays elapsed time while running.
4. WebRTC Permission Check displays elapsed time without fake ETA.
5. timers stop when underlying test stops/completes.
6. collapsed Active test summaries expose running/final status.
7. clean/warning/leak results render as prominent result panels.
8. Guided verdict hierarchy is unchanged.
9. Aggressive verdict semantics are unchanged.
10. WebRTC Permission Check is no longer nested inside Guided DOM UI.
11. WebRTC UI explains standalone mode when no Guided baseline exists.
12. WebRTC UI explains and uses Known Real/Known VPN classification when Guided baseline exists.
13. media permission denial/unsupported states terminate running UI cleanly.
14. provider source rows render address, latency and relation to consensus winner.
15. unavailable provider is not labeled `differs`.
16. successful provider returning a different IP is labeled `differs`.
17. majority/tie consensus evidence reflects `agreement.counts` and current algorithm.
18. no extra IP-provider network requests are introduced for evidence rendering.
19. Copy JSON retains existing core sources and `guidedLeak.media` compatibility.
20. full existing leak/assessment/aggressive/guided/monitor regression suite remains green.

---

## Out of scope

- Changing public-IP consensus winner algorithm.
- Changing leak severity rules.
- Changing Guided Known Real semantics.
- Replacing the Aggressive scheduler.
- Making WebRTC Permission Check mandatory.
- Adding DNS/torrent/email tests.
- Adding backend/VPS endpoints.
- Redesigning the whole dashboard again.

---

## Success criteria

The feature is successful when a first-time user can open `Active tests` and understand, from the UI alone:

- which test to choose for a known real-IP leak;
- which test catches transient unexpected IPs;
- which test verifies a Kill Switch transition;
- what the WebRTC Permission Check does and exactly how Guided makes its result stronger;
- how much longer a timed test will run;
- what the final test result is without hunting for a small text line;
- and, when public-IP providers disagree, exactly which provider returned which address.
