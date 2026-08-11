# Wide Core IP Consensus Design

## Goal

Make normal/core public-IP detection substantially more resilient to one or more broken third-party services while keeping the visible IP fast, the final result honest, and high-frequency stress tests isolated from slow/rate-limited providers.

This change is specifically motivated by repeated `IPPubblico` failures observed across multiple networks. `IPPubblico` remains available as a reserve source, but no longer participates in every normal primary vote.

## Non-goals

- Do not change VPN leak severity rules.
- Do not change GeoIP consensus or location semantics.
- Do not add a backend/VPS dependency.
- Do not make Yandex Internetometer or other undocumented web pages into scraped APIs.
- Do not expose API keys in GitHub Pages.
- Do not increase Aggressive/Guided stress frequency or duration.
- Do not treat provider disagreement by itself as VPN-leak evidence.

## Provider Strategy

### Core primary tier

Normal IPv4/IPv6 detection should use a broad set of independent provider groups in parallel.

Target primary groups:

1. `ipify`
2. `ident.me`
3. `SeeIP`
4. `icanhazip`
5. `MyIP`

A provider is active in the deployed static application only after a real browser cross-origin request from the GitHub Pages origin has been verified to return a readable response for the intended family. Documentation claiming an API exists is not enough; browser CORS compatibility is a hard activation gate.

`MyIP` and any other newly introduced provider therefore remain config candidates until this browser-CORS smoke test succeeds. If one candidate fails the browser test, the design still ships with the remaining verified independent groups rather than adding JSONP, `no-cors`, an embedded token, or HTML scraping.

### Core reserve tier

`IPPubblico` remains configured as a reserve independent provider group.

It is not called during every healthy Core run. It is attempted only when the primary tier cannot establish a sufficiently trustworthy result, specifically when either:

- fewer than 3 independent primary groups return a valid address for that family; or
- the successful primary groups do not produce a strict majority address.

A reserve result participates as one additional independent group vote. If it fails, its failure is preserved as provider evidence but does not erase successful primary data.

### ident.me redundancy

`ident.me` may use `tnedi.me` as an endpoint fallback because the service explicitly documents it as a safe mirror/fallback.

Both endpoints belong to the same provider group and together contribute at most one vote. The mirror improves availability, not voting weight.

### ipwho.is

`ipwho.is` should stop being used as a public-IP-only Core vote. Its limited browser quota is more valuable for GeoIP/metadata work and should not be consumed simply to answer the address-discovery question.

Existing GeoIP use remains unchanged by this feature.

## Separate Core and Stress Provider Profiles

The current architecture reuses the same public-IP provider list for lightweight Core detection and high-frequency stress sampling. These workloads have different requirements and must be separated.

Configuration becomes conceptually:

```js
networkConfig.coreIpProviderGroups[4]
networkConfig.coreIpProviderGroups[6]
networkConfig.reserveIpProviderGroups[4]
networkConfig.reserveIpProviderGroups[6]
networkConfig.stressIpProviderGroups[4]
networkConfig.stressIpProviderGroups[6]
```

Core favors breadth and resilience.

Stress favors providers that tolerate repeated requests and have predictable latency. The intended stress set is a smaller verified subset, initially:

- `ipify`
- `ident.me`
- `SeeIP`

`IPPubblico`, `MyIP`, and other rate-limited/reserve providers are excluded from repeated two-second stress polling even if they are enabled for Core.

Guided and Aggressive continue using the same stress-provider profile so provider-level evidence semantics remain consistent between them.

## Provider Group Data Model

The authoritative voting unit is a provider group, not an endpoint.

Recommended config shape:

```js
{
  id: 'ident4',
  group: 'ident',
  label: 'ident.me',
  family: 4,
  endpoints: [
    { id: 'ident-primary-4', kind: 'text', url: 'https://4.ident.me/' },
    { id: 'ident-mirror-4', kind: 'text', url: 'https://4.tnedi.me/' }
  ]
}
```

Simple providers may still have one endpoint.

A group result contains:

```js
{
  id,
  group,
  label,
  family,
  status,
  address,
  latencyMs,
  endpointId,
  attempts,
  error
}
```

`attempts` preserves each endpoint attempt for Advanced diagnostics. Only the final successful group address can cast a vote.

## Endpoint Fallback Behavior

Within a provider group:

1. try the preferred endpoint;
2. if it fails, returns the wrong family, or times out within the group budget, try the next endpoint;
3. stop after the first valid same-family address;
4. return one group result.

Fallback endpoints do not run in parallel by default because they are redundancy for one service, not independent evidence. The per-group timeout budget must be bounded so a broken primary mirror cannot make the entire Core run unreasonably long.

The existing global Core request timeout remains the upper bound for the provider group. Implementation may split that budget across endpoints, but it must not allow a group with two mirrors to double the total Core timeout.

## Consensus Rules

Voting happens over successful independent group results only.

For a family:

- `successfulGroups` = independent groups that returned a valid same-family public address;
- `counts[address]` = number of successful groups that returned that address;
- `winner` = address with the largest count;
- `strictMajority` = winner count is greater than half of all successful group votes;
- `unanimous` = all successful groups returned the same address.

### Confidence states

#### Strong consensus

Requirements:

- at least 3 successful independent groups; and
- a strict majority exists.

Examples:

- 5 successful: `5-0`, `4-1`, `3-2` -> Strong consensus.
- 4 successful: `4-0`, `3-1` -> Strong consensus.
- 3 successful: `3-0`, `2-1` -> Strong consensus.

The winning address is authoritative for the final Core report.

#### Partial

There are one or two successful independent groups and they agree, but there is not enough independent evidence to call the result Strong.

The address remains usable and visible, but UI/report confidence is Partial.

The reserve tier is attempted before finalizing this state.

#### No consensus

Multiple successful independent groups exist but no strict majority exists.

Examples:

- `1-1`
- `2-2`
- `1-1-1`

Reserve groups are attempted before finalizing No consensus.

If reserve creates a strict majority with at least 3 successful independent groups, the result becomes Strong consensus.

If there is still no strict majority after reserves, the final Core family result is `partial/no-consensus` rather than silently choosing the first successful provider as authoritative.

This is an intentional change from the current tie behavior, which falls back to the first successful source. A tied result may still show all observed addresses in Advanced, but it must not pretend that one is the consensus winner.

#### Unavailable

No independent group produced a valid address after applicable primary and reserve attempts.

## Progressive Rendering

The current fast-first UX is preserved.

As soon as the first valid primary group address arrives:

- display it provisionally;
- start GeoIP for that provisional address;
- continue the remaining primary groups in the background.

The top-level status remains in progress until the Core family result is finalized.

If the final winning address differs from the provisional address:

- replace the displayed address with the final winner;
- discard stale provisional GeoIP for display purposes;
- resolve/reuse GeoIP for the final address using existing race protection.

If final result is No consensus, the UI must not silently keep the first provisional value as if it were authoritative. It should show the best-known address state as requiring review/insufficient consensus while Advanced exposes all provider values.

## Reserve Trigger and Latency

Reserve requests are conditional and start only after the primary tier has settled enough to know a Strong consensus was not established.

This means a healthy run pays only for the broad primary race. `IPPubblico` does not delay normal healthy completion and does not create routine errors in the primary source count.

When reserve is needed, the Core run may take one additional bounded request phase. Progressive IP rendering means the user still sees an address while this additional evidence is collected.

## UI Semantics

The compact connection block should emphasize confidence rather than raw implementation details.

Healthy example:

```text
IPv4   Strong consensus · 4/5 primary sources responded · 4 agree
```

Primary disagreement with majority:

```text
IPv4   Strong consensus · 5/5 responded · 4 agree · 1 differs
```

Reserve used:

```text
IPv4   Strong consensus · reserve used
```

Insufficient evidence:

```text
IPv4   Partial · 2 sources agree · reserve unavailable
```

No winner:

```text
IPv4   No consensus · review source details
```

Absence of IPv6 remains `Not detected` only when the family check successfully determines that no IPv6 route/address is available. Provider/service failures should remain distinguishable from normal absence.

## Advanced Provider Evidence

`Advanced -> IPv4 network` and `Advanced -> IPv6 network` already expose provider evidence and should be expanded to show tiers/groups/endpoints clearly.

Example:

```text
Public IP sources
Selected IP      128.71.33.91
Confidence       Strong consensus
Primary groups   4/5 responded
Votes            4 agree · 0 differ

Primary
ipify             128.71.33.91   agrees       124 ms
ident.me          128.71.33.91   agrees       181 ms
SeeIP             128.71.33.91   agrees       203 ms
icanhazip         128.71.33.91   agrees       310 ms
MyIP              Unavailable     HTTP 429      612 ms

Reserve
IPPubblico        Not needed
```

If ident.me used its mirror:

```text
ident.me          128.71.33.91   agrees       420 ms
  primary         unavailable
  tnedi mirror    success
```

If reserve ran:

```text
Reserve
IPPubblico        128.71.33.91   agrees       440 ms
```

A provider relation is calculated against the final selected address only when such an address exists:

- `agrees` — successful group returned selected address;
- `differs` — successful group returned another valid address;
- `unavailable` — no valid group address;
- `not needed` — reserve group was intentionally not called.

`unavailable` never counts as disagreement.

## Report Compatibility

Existing consumers of `ipv4.address`, `ipv6.address`, `agreement`, and `sources` should remain compatible where possible.

The result may add fields such as:

```js
{
  confidence: 'strong' | 'partial' | 'no-consensus' | 'unavailable',
  primary: { ... },
  reserve: { ... },
  groups: [...]
}
```

For backward compatibility:

- `sources` remains available and contains flattened group-level source evidence;
- `agreement.available` remains the number of successful independent voting groups;
- `agreement.total` becomes the number of attempted independent groups, not endpoint count;
- `agreement.counts` remains address -> independent vote count;
- `agreement.agree` means all successful independent groups returned one value;
- mirrors never inflate any of these counters.

On a final No-consensus tie, `address` should be `null` rather than selecting the first provider. Raw successful addresses remain available in `sources/groups`.

This is a deliberate correctness change and requires regression review of downstream logic that currently assumes `status === complete` implies a non-null `address`.

## Leak and Assessment Semantics

Provider disagreement remains diagnostic evidence, not leak evidence.

Core leak checks continue to compare WebRTC public addresses against trusted HTTP public addresses only when an authoritative Core address exists for that family.

A No-consensus Core family must not create a fake WebRTC mismatch simply because HTTP providers disagreed.

Likewise:

- GeoIP disagreement remains metadata only;
- reserve usage is not Review by itself;
- one provider failure is not Review by itself;
- Strong consensus with one differing provider remains usable and does not become a leak.

The overall assessment may become `Incomplete`/`Review` only where existing semantics require trustworthy address evidence and the Core result cannot establish an authoritative address.

## Stress Tests

Aggressive and Guided stress use `stressIpProviderGroups`, not the broad Core list.

Initial target groups:

- ipify
- ident.me
- SeeIP

Stress consensus is still group-aware, so ident.me mirrors remain one vote.

Provider-level observations remain preserved. In Guided mode, a minority successful stress provider returning an exact Known Real address must still count as Known Real leak evidence even if the stress consensus winner is the VPN address.

The broad Core reserve flow is not invoked every two seconds by stress tests.

## Browser Compatibility Gate for New Providers

Before enabling each new provider in production config, implementation must verify from a real browser/deployed-origin context:

1. HTTPS request succeeds from the GitHub Pages origin;
2. response is readable under CORS;
3. IPv4 endpoint cannot silently fall back to IPv6;
4. IPv6 endpoint cannot silently fall back to IPv4;
5. response parser matches the real payload;
6. timeout/error behavior is isolated;
7. no API token/cookie/login is required.

A failed gate means the provider stays disabled. Do not work around the failure with `no-cors`, JSONP, DOM/script injection, a public secret, or scraping a human-facing page.

## Testing

Required regression coverage:

1. five independent same-address groups -> Strong consensus;
2. `4-1`, `3-2`, `3-1`, `2-1` majority cases -> Strong when at least 3 groups succeed;
3. only two agreeing groups -> reserve triggered, then Partial if reserve fails;
4. `2-2` tie -> reserve triggered;
5. reserve breaks tie into majority -> Strong;
6. reserve fails and tie remains -> No consensus with `address:null`;
7. one successful group only -> reserve triggered, final Partial if still insufficient;
8. zero successful groups -> Unavailable;
9. ident primary fails and tnedi succeeds -> one successful ident group vote;
10. ident primary and mirror can never cast two votes;
11. wrong-family response is unavailable, never a vote;
12. unavailable provider does not increment `different`;
13. reserve `not needed` is visible as such in Advanced evidence;
14. reserve invocation happens only when primary result is not Strong;
15. first valid primary still renders progressively before final consensus;
16. final winner replacing provisional address preserves stale-GeoIP race protection;
17. No consensus never promotes the first provisional address to final authoritative report;
18. core config and stress config are separate;
19. Aggressive/Guided do not call IPPubblico/MyIP through the two-second stress loop;
20. Guided minority Known Real provider observation behavior remains unchanged;
21. provider-evidence counts groups, not endpoints;
22. Copy JSON preserves compatible `sources/agreement` fields;
23. WebRTC mismatch logic ignores a family without authoritative HTTP consensus;
24. full existing leak-severity regression suite remains green.

## Files Expected to Change

Likely:

- `assets/config.js`
- `assets/ip-consensus.js`
- `assets/provider-observations.js`
- `assets/provider-evidence.js`
- `assets/provider-evidence-render.js`
- `assets/app.js`
- `assets/aggressive-leak-test.js` only where provider profile injection changes
- `assets/guided-app-runtime.js` or Guided wiring only where stress provider profile is passed
- focused tests for config/consensus/provider evidence/progressive core/aggressive/guided
- `scripts/validate-static.mjs`
- `README.md`

No UI redesign beyond confidence/source wording is required.

## Provider Rationale Snapshot

- **ipify**: primary; dedicated IPv4/IPv6 API and explicitly high-volume-friendly.
- **ident.me**: primary; dedicated family hosts and documented `tnedi.me` redundancy.
- **SeeIP**: primary candidate; dedicated IPv4/IPv6 API and intended for programmatic/web-app use; enable only after deployed browser CORS verification.
- **icanhazip**: existing independent source; retain where real browser behavior remains healthy.
- **MyIP**: primary candidate; official API supports IPv4/IPv6 and separate `api4`/`api6` hosts; shared-service rate limiting means it stays out of high-frequency stress; enable only after browser CORS verification.
- **IPPubblico**: reserve only; retained for extra evidence when primary consensus is weak, but not part of routine high-frequency sampling.
- **ipwho.is**: no longer an IP-only Core voter; retain only for existing metadata/GeoIP roles where appropriate.

## Success Criteria

A healthy Core run should normally end with an authoritative address even if one or two providers fail, without allowing mirrors to inflate the vote. A broken IPPubblico should normally be invisible to Core because it is not called when primary consensus is already Strong. When evidence is weak, the reserve tier is used transparently, and the UI/report must say Partial or No consensus instead of fabricating certainty.
