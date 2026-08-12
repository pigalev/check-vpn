# Transparent Consensus Semantics Design

**Status:** approved concept, pending implementation plan

## Goal

Make every diagnostic state numerically and semantically transparent. The UI must distinguish public-IP consensus from GeoIP metadata disagreement, expose exactly how evidence was counted, and never present an arbitrary winner when evidence is tied or insufficient.

## 1. Public IP consensus

### Strong rule

A public IP is `strong` only when both conditions hold:

1. at least **3 independent provider groups** returned the selected IP; and
2. selected votes are **>= 2/3 of all successful group votes**.

This same rule applies both during progressive early-finish and after all attempted groups settle.

Examples:

- `3:0` -> Strong
- `3:1` -> Strong
- `4:2` -> Strong
- `2:1` -> **No consensus** (not Strong)
- `3:2` -> No consensus
- `2:2:1` -> No consensus

Failed/unavailable groups do not vote and do not increase the successful-vote denominator. Hedged endpoints inside one provider group still cast exactly one group vote.

### Partial

`partial` is reserved for weak-but-consistent evidence with one or two successful groups and no conflicting successful address. It must never be labeled Strong.

### No consensus

When successful groups conflict and the Strong rule is not met, no authoritative public IP is selected. Observed addresses remain available in Advanced evidence.

## 2. Reserve semantics

Replace the ambiguous boolean `reserve.used` presentation with three explicit facts:

- `attempted`: at least one reserve group was actually requested and settled as complete/unavailable/error.
- `contributed`: at least one reserve group returned a successful address that participated in the final vote.
- `notNeeded`: reserve groups were skipped/aborted because consensus was already guaranteed before their vote was needed.

UI copy examples:

- `Strong consensus · reserve contributed · 4/6 agree`
- `Strong consensus · reserve attempted, no usable response · 4/4 agree`
- `Strong consensus · reserve not needed · 4/4 agree`

Advanced must show the exact status for every reserve group.

## 3. GeoIP evidence accounting

GeoIP must report field-specific counts rather than one generic provider count.

For each field family expose:

- `reached`: providers whose HTTP/API request returned a parseable response/result object.
- `usableCountry`: providers with usable country evidence.
- `usableLocation`: providers with usable city and/or region evidence.
- `usableTimezone`: providers with usable timezone evidence.

A provider that responds but has no country/location values is `reached` but not usable for those fields.

Example:

- Providers reached: `5/5`
- Usable country data: `4/5`
- Usable location data: `4/5`

## 4. GeoIP country selection

Country evidence is normalized by canonical country identity (country code/name aliases).

A selected country exists only if one country has a **strict majority (>50%) of usable country votes**.

Examples:

- Germany `3/4`, UK `1/4` -> selected country Germany; state `disagree`; overall verdict `Review` because at least one usable provider reported a different country.
- Germany `2/4`, UK `2/4` -> no selected country; state `unresolved`.
- Germany `2/4`, UK `1/4`, France `1/4` -> no strict majority; state `unresolved`.
- Germany `1/1` -> selected country Germany; state `single-source`.
- no usable country values -> state `unavailable`.

Country disagreement remains conservative: any usable country outlier while a majority country exists produces a Review reason. The UI must explicitly state that this is **GeoIP metadata disagreement, not a public-IP leak**.

## 5. GeoIP location selection

Location is the normalized `(city, region)` pair, independent from country voting.

A selected location exists only with a strict majority (>50%) among usable location votes.

If there is no location majority, location is `unresolved` and the hero must not display an arbitrary first provider's city/region as authoritative.

Examples:

- Neu-Isenburg 1, Frankfurt 1, Frankfurt Innenstadt 1, Whitehaven 1 -> `Location unresolved`.
- Frankfurt 3, Neu-Isenburg 1 -> selected Frankfurt, state `disagree`.
- Frankfurt 1/1 -> `single-source`.

Location-only disagreement remains informational and does not by itself change `Protected` to `Review`.

## 6. GeoIP timezone

Timezone uses the same strict-majority model as country/location and is reported independently.

Browser timezone comparison must compare against the selected/majority GeoIP timezone only when one exists. If GeoIP timezone is unresolved, the browser-timezone check becomes `incomplete/unresolved`, not a mismatch against an arbitrary provider.

## 7. Main-card UX

The main card stays compact but quantitative.

Examples:

### Public IP

`Strong consensus · 4/4 successful groups agree`

If reserve participated:

`Strong consensus · reserve contributed · 4/6 agree`

### GeoIP majority with outlier

`GeoIP country majority: Germany 3/4 · 1 provider differs`

Supporting explanation:

`Public IP consensus is Strong. Review is caused by GeoIP metadata disagreement, not an IP leak.`

### Location unresolved

`GeoIP location unresolved · 4 different locations from 4 usable providers`

Do not display a selected city/region when there is no strict location majority.

## 8. Advanced GeoIP evidence

Advanced must expose:

- providers configured / reached;
- usable counts for country/location/timezone;
- selected value or `Unresolved` for each field;
- vote distribution for each field;
- provider-by-provider normalized values;
- whether each provider agreed with majority, differed, was missing, or unavailable;
- latency/error.

Example country distribution:

`Germany: 3 votes`
`United Kingdom: 1 vote`

Provider rows remain visible even when they did not contribute usable evidence.

## 9. PTR transparency

Reverse DNS distinguishes transport success from actual PTR evidence.

Expose:

- resolvers reached (DNS query completed successfully);
- resolvers with PTR records;
- normalized PTR names;
- agreement only when at least one PTR value exists.

Examples:

- two resolvers reached, neither returned PTR -> `Resolvers reached 2/2 · PTR record not found`
- one resolver returns name, second returns same -> `PTR agree · 2/2 values agree`
- conflicting PTR values -> `PTR differs · 2 different values`
- resolver requests fail -> `PTR unavailable · 0/2 resolvers reached`

Two empty successful answer sets must never be labeled `agree`.

## 10. State/reason codes

Extend canonical diagnostic states/reasons so UI text is derived from machine states, not ad-hoc strings.

At minimum add/clarify:

- `IP_STRONG_CONSENSUS`
- `IP_PARTIAL_CONSENSUS`
- `IP_NO_CONSENSUS`
- `IP_UNAVAILABLE`
- reserve state: `attempted`, `contributed`, `not-needed`
- `GEO_COUNTRY_AGREE`
- `GEO_COUNTRY_SINGLE_SOURCE`
- `GEO_COUNTRY_DISAGREEMENT`
- `GEO_COUNTRY_UNRESOLVED`
- `GEO_COUNTRY_UNAVAILABLE`
- `GEO_LOCATION_AGREE`
- `GEO_LOCATION_SINGLE_SOURCE`
- `GEO_LOCATION_DISAGREEMENT`
- `GEO_LOCATION_UNRESOLVED`
- `GEO_LOCATION_UNAVAILABLE`
- timezone equivalents where needed
- `PTR_NOT_FOUND`
- `PTR_AGREE`
- `PTR_DISAGREE`
- `PTR_UNAVAILABLE`

## 11. Testing requirements

### Public IP matrix

Table-driven tests must include at least:

- 3:0 Strong
- 3:1 Strong
- 4:2 Strong
- 2:1 No consensus
- 3:2 No consensus
- 2:2 + reserve agrees with one side -> still No consensus at 3/5
- failed sources excluded from denominator
- hedged ident mirror casts one group vote
- early and final classifiers return the same result for equivalent settled evidence

### GeoIP country matrix

- 4/4 same -> agree
- 3/4 same + 1 outlier -> selected majority + disagree + Review
- 2/2 tie -> unresolved
- 2/1/1 -> unresolved
- 1 usable -> single-source
- 0 usable -> unavailable
- mixed code/name (`DE` / `Germany`) -> one country

### Location matrix

- majority location -> selected
- all different -> unresolved
- tie -> unresolved
- one usable -> single-source
- zero usable -> unavailable

### PTR matrix

- 2 reached / 0 PTR -> not found, not agree
- same PTR values -> agree
- different PTR values -> disagree
- no resolvers reached -> unavailable

### Integration/UX

Tests must assert exact quantitative summaries and that Review from GeoIP explicitly does not claim a public-IP leak.

## 12. Scope constraints

Do not change:

- public-IP provider list;
- provider grouping;
- `ident.me -> tnedi.me` hedge behavior;
- Core timeout `3200 ms`;
- hedge delay `900 ms`;
- stress provider profile;
- GitHub workflow structure except static/test assertions required by this change.

## Expected result for the observed iPhone case

For `31.76.17.233` with three Germany providers, one UK provider, and one provider missing country data:

- Public IP: `Strong consensus`
- GeoIP providers reached: `5/5`
- Usable country data: `4/5`
- Country majority: `Germany 3/4`
- Country outlier: `United Kingdom 1/4`
- Verdict: `Review`
- Explanation: `Public IP consensus is Strong. Review is caused by GeoIP metadata disagreement, not an IP leak.`
- Location: no selected location if no location value has >50% of usable location votes
- Advanced: exact provider rows and vote distributions
