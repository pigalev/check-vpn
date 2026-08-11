# Wide Core IP Consensus Design

## Goal

Make normal/Core public-IP detection resilient when one or more third-party services fail, while preserving fast progressive display, honest final confidence, and isolation between low-frequency Core checks and high-frequency Active-test sampling.

This work was motivated by repeated `IPPubblico` failures observed across multiple networks.

## Non-goals

- Do not change VPN leak verdict hierarchy.
- Do not change GeoIP consensus/location semantics.
- Do not add a backend/VPS requirement.
- Do not scrape Yandex Internetometer or other human-facing pages.
- Do not expose API keys or use JSONP/`no-cors` workarounds.
- Do not increase Aggressive/Guided durations or probe cadence.
- Do not treat provider disagreement as leak evidence by itself.

## Final Provider Strategy

### Core primary groups

Core IPv4 and IPv6 use five independent provider groups in parallel:

1. `ipify`
2. `ident.me`
3. `SeeIP`
4. `icanhazip`
5. `IP.SB`

Each group gets at most one vote.

`ident.me` has `tnedi.me` as a sequential fallback endpoint inside the same group. A mirror improves availability but never adds voting weight.

`ipwho.is` is not an IP-only Core voter. Its existing GeoIP role remains unchanged.

### Reserve group

`IPPubblico` remains configured as the reserve provider group for both families, matching the product decision to keep it available as a reserve candidate.

Runtime state is currently:

```js
enabled: false
disabledReason: 'Browser CORS unavailable'
```

A disabled reserve remains visible in diagnostic/config evidence but:

- is never fetched by runtime consensus;
- contributes no vote;
- is excluded from `agreement.total`;
- cannot create disagreement, Review, or Leak.

If browser CORS becomes available again, the group can be re-enabled without changing consensus semantics.

### Provider verification result

During implementation, a one-off GitHub-hosted smoke sent requests with the project Pages origin and inspected status, CORS headers, payload, and observed family.

For IPv4, all five final Core primary groups returned the same IPv4 address and supplied readable CORS:

- ipify;
- ident.me;
- tnedi.me mirror;
- SeeIP;
- icanhazip;
- IP.SB.

The earlier `MyIP` candidate failed the network smoke and was removed from production Core configuration.

`IPPubblico` IPv4 returned HTTP 200 and a valid address but did not return a CORS permission readable from the GitHub Pages origin. This explains why a browser `fetch()` can fail even though the URL appears operational when opened directly.

The GitHub-hosted runner had no usable IPv6 route during the smoke: every IPv6-only endpoint failed, including pre-existing ipify/icanhazip endpoints. Therefore those failures cannot distinguish a broken provider from runner network limitations. IPv6 providers remain independently failure-isolated at runtime.

The network smoke is intentionally not part of permanent CI because third-party reachability would make repository tests flaky.

## Separate Core and Repeated-Test Profiles

Configuration is split into:

```js
networkConfig.coreIpProviderGroups[4]
networkConfig.coreIpProviderGroups[6]
networkConfig.reserveIpProviderGroups[4]
networkConfig.reserveIpProviderGroups[6]
networkConfig.stressIpProviderGroups[4]
networkConfig.stressIpProviderGroups[6]
```

Core favors breadth and resilience.

Repeated sampling uses only:

- `ipify`
- `ident.me`
- `SeeIP`

This smaller profile is used by:

- Kill Switch monitoring;
- Aggressive HTTP stress samples;
- Guided Step 3 HTTP stress samples;
- Guided raw provider observations during stress.

Guided Step 1/2 Real/VPN capture uses the broad Core provider groups because those captures are low-frequency and establish important Known Real/Known VPN baselines.

Neither IP.SB nor the disabled IPPubblico reserve is called every two seconds by stress tests.

## Provider Group Model

A provider group contains one or more endpoints:

```js
{
  id,
  group,
  label,
  family,
  tier,
  enabled,
  disabledReason,
  endpoints: [
    { id, kind, url }
  ]
}
```

A completed group result contains:

```js
{
  id,
  group,
  label,
  family,
  tier,
  status,
  address,
  latencyMs,
  endpointId,
  attempts,
  error
}
```

Endpoint attempts are diagnostic evidence. Only the final successful group result may cast one vote.

### Endpoint fallback

Within one group:

1. try the preferred endpoint;
2. if it fails, returns the wrong family, or times out, try the next endpoint;
3. stop on the first valid same-family address;
4. return one group result.

All fallback endpoints share one bounded group timeout budget. A two-endpoint mirror group cannot double the configured timeout.

## Consensus Rules

Voting uses successful independent group results only.

For one address family:

- `successfulGroups` = groups with a valid same-family address;
- `counts[address]` = successful group votes for an address;
- `winner` = address with the highest vote count;
- `winnerShare` = winner votes / all successful votes.

### Strong consensus

Requirements after applicable reserve handling:

- at least 3 successful independent groups; and
- `winnerShare >= 2/3`.

Examples:

- `5-0`, `4-1` -> Strong;
- `4-0`, `3-1` -> Strong;
- `3-0`, `2-1` -> Strong;
- `3-2` -> not Strong because 60% is below two-thirds.

A Strong result has an authoritative non-null `address`.

### Partial

One or two successful groups agree, but there is insufficient independent evidence for Strong consensus.

Partial keeps a usable non-null `address` with explicitly reduced confidence.

### No consensus

Successful evidence exists but no address satisfies Strong consensus and the result is not the limited-evidence Partial case.

Examples include:

- `1-1`;
- `2-2`;
- `1-1-1`;
- unresolved `3-2`.

Final `address` is `null`. Raw observed addresses remain in provider evidence.

The first provisional response must never become the final authoritative address merely because it arrived first.

### Unavailable

No independent group returned a valid address.

Final `address` is `null`.

## Reserve Trigger

Reserve handling is considered when primary evidence is not Strong, including:

- fewer than 3 successful primary groups;
- a tie/no majority;
- a weak majority below two-thirds such as `3-2`.

When an enabled reserve exists, it may contribute one additional independent vote.

When the configured reserve is disabled, runtime emits a disabled evidence row instead of issuing a doomed request. That row is excluded from attempted-vote totals.

Healthy primary Strong consensus never calls the reserve and represents it as `not-needed`.

## Progressive Rendering

Fast-first behavior remains:

1. first valid primary address renders provisionally;
2. provisional GeoIP may start immediately;
3. remaining groups continue in parallel;
4. final consensus replaces the provisional state.

If final consensus selects another address, stale provisional GeoIP is discarded for display and GeoIP is resolved/reused for the final address.

If final confidence is No consensus or Unavailable, the provisional address is removed from authoritative UI/report state and no final GeoIP lookup runs for that family.

## UI Semantics

Examples:

```text
IPv4   Strong consensus · 5/5 primary responded · 5 agree
IPv4   Strong consensus · 4/5 primary responded · 4 agree
IPv4   Partial · 2 sources agree · reserve unavailable
IPv4   No consensus · review source details
IPv4   Unavailable · no source confirmed this family
```

Provider errors are not collapsed into `differ`.

`Not detected` remains a compact legacy/absence presentation only where appropriate; explicit `No consensus` and `Unavailable` must not be presented as successful absence.

## Advanced Provider Evidence

`Advanced -> IPv4 network` and `Advanced -> IPv6 network` show already-collected group evidence without making another public-IP request.

The section contains:

- selected authoritative IP or `No authoritative address`;
- confidence;
- primary response/vote summary;
- Primary group rows;
- Reserve group state;
- group relation;
- latency/error;
- nested endpoint attempts when a fallback was used.

Relations are:

- `agrees` — successful group matches selected authoritative address;
- `differs` — successful group returned another valid address;
- `unavailable` — group produced no valid address or is disabled;
- `not-needed` — reserve was intentionally skipped because primary evidence was already Strong;
- `observed` — successful address exists but there is no authoritative selected address to compare with.

An unavailable/disabled provider never counts as disagreement.

## Report Compatibility

Public-IP family result adds/uses:

```js
{
  status,
  confidence: 'strong' | 'partial' | 'no-consensus' | 'unavailable',
  family,
  address,
  observedAddresses,
  agreement: {
    available,
    total,
    agree,
    counts,
    selectedVotes,
    winningShare
  },
  sources,
  primary,
  reserve
}
```

Compatibility rules:

- `sources` remains available;
- source rows now represent independent groups, not endpoint votes;
- `agreement.available` counts successful voting groups;
- `agreement.total` counts attempted voting groups only;
- disabled and not-needed reserves do not inflate `agreement.total`;
- `agreement.counts` remains address -> vote count;
- mirrors never inflate counts.

## Leak and Assessment Safety

Provider disagreement remains diagnostic evidence, not leak evidence.

Only authoritative Core addresses participate in HTTP-vs-WebRTC mismatch detection:

- Strong -> trusted;
- Partial -> trusted with reduced confidence;
- No consensus -> not trusted as a single address;
- Unavailable -> no trusted address.

A No-consensus family cannot generate a fake WebRTC leak merely because HTTP providers returned multiple alternatives.

A Strong `4-1` result is usable and does not become Review solely because one provider differed.

No consensus may create a Review/Incomplete condition because trustworthy HTTP identity was not established, but never a fake leak.

GeoIP disagreement, reserve usage, disabled reserve state and one provider failure remain non-leak metadata.

## Guided and Stress Safety

Guided provider-level observations remain preserved.

If a minority stress provider group returns an exact Known Real address while other providers return Known VPN, that exact Known Real observation remains leak evidence. Group-aware consensus must not mask it.

Kill Switch/Aggressive/Guided stress do not invoke the broad Core reserve flow on every repeated sample.

## Testing Requirements

Regression coverage includes:

1. 5 same-address groups -> Strong;
2. `4-1`, `3-1`, `2-1` -> Strong where >=3 groups succeeded;
3. `3-2` primary -> reserve handling requested;
4. `3-2` + reserve winner -> `4-2` Strong;
5. `3-2` + reserve minority -> `3-3` No consensus;
6. two agreeing groups + unavailable/disabled reserve -> Partial;
7. `2-2` + one reserve vote -> still No consensus under two-thirds rule;
8. zero successes -> Unavailable;
9. ident primary fails, tnedi succeeds -> one group vote;
10. mirror endpoints can never cast two votes;
11. wrong-family result never votes;
12. disabled reserve never fetches and never inflates totals;
13. first valid primary still renders progressively;
14. No consensus clears provisional authoritative state;
15. stale GeoIP race protection remains intact;
16. Core and stress configs are separate;
17. Guided capture uses broad Core groups;
18. repeated tests use stress groups;
19. Guided minority Known Real behavior remains unchanged;
20. Advanced evidence counts groups and shows endpoint attempts;
21. Strong disagreement is not automatically Review;
22. No consensus cannot create fake WebRTC mismatch;
23. full existing leak-severity and static-validation suites remain green.

## Final Provider Rationale

- **ipify** — Core + stress; established dedicated family APIs.
- **ident.me** — Core + stress; dedicated family endpoints, with `tnedi.me` inside the same group as fallback.
- **SeeIP** — Core + stress; passed IPv4 CORS/payload smoke.
- **icanhazip** — Core; existing independent family-specific service.
- **IP.SB** — Core; replaced failed MyIP candidate and passed IPv4 CORS/payload smoke. Dedicated family endpoints are configured.
- **IPPubblico** — configured reserve candidate but currently disabled because the implementation smoke confirmed missing browser-readable CORS; retained for easy reactivation if that changes.
- **ipwho.is** — not an IP-only voter; retained for GeoIP metadata.
- **MyIP** — rejected implementation candidate; not present in active production IP configuration.

## Success Criteria

A normal Core run should establish an authoritative address even when one or two providers fail, without mirrors inflating confidence. Repeated tests must avoid the broad provider set. Weak or conflicting evidence must produce Partial/No consensus rather than fabricated certainty, and broken third-party services must remain visible as diagnostics without becoming leaks.
