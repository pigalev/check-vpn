# Clear diagnostic states and GeoIP evidence design

## Goal

Make diagnostics reliable and understandable across desktop and mobile by separating public-IP consensus from GeoIP metadata agreement, centralizing user-facing reason codes, exposing per-provider GeoIP evidence, and preventing long status rows from overlapping on narrow screens.

## Current problems

1. Mobile summary rows can overlap because long values such as timezone mismatches are rendered beside a fixed label column.
2. The connection card can show a generic `GeoIP providers disagree` message while the overall finding says `IPv4 GeoIP country disagreement`, making it unclear whether IP addresses or location metadata disagree.
3. GeoIP provider-level data already exists in the runtime result but is not exposed in Advanced diagnostics.
4. A country disagreement and a city/region disagreement currently share the same generic hero warning even though only the former should normally elevate the overall verdict to Review.
5. UI text is assembled in multiple places, so semantically equivalent states can produce inconsistent wording.

## Principles

- Public-IP consensus and GeoIP agreement are separate diagnostic domains.
- A provider outage is not the same state as provider disagreement.
- Country disagreement is more important than city/region disagreement.
- City/region disagreement is informational when country is consistent.
- One provider response is not agreement; it is `single-source`.
- No provider response is `unavailable`, never `disagree`.
- User-facing wording comes from stable reason codes rather than ad-hoc strings in individual views.
- Advanced diagnostics must expose enough evidence to explain every Review/Info state.

## State model

### Public IP consensus

Per address family:

- `strong` — authoritative winner, mathematically strong consensus.
- `partial` — usable authoritative address from limited agreeing evidence.
- `no-consensus` — multiple usable IP votes but no sufficiently strong winner.
- `unavailable` — no provider group confirmed an address.

### GeoIP country state

- `agree` — at least two usable providers report the same country.
- `single-source` — exactly one usable provider reports a country.
- `disagree` — at least two usable providers report different countries.
- `unavailable` — no usable provider reports a country.

### GeoIP location state

Location means region/city metadata after country selection.

- `agree` — at least two usable providers report the same normalized region/city tuple.
- `single-source` — exactly one usable provider reports location metadata.
- `disagree` — at least two usable providers report different normalized region/city tuples.
- `unavailable` — no usable provider reports region/city metadata.

Country and location states are independent. For example, `country=agree` and `location=disagree` is a normal, non-leak scenario.

### Overall verdict

Existing verdicts remain:

- `protected`
- `review`
- `incomplete`
- `leak`

GeoIP location disagreement alone does not change `protected` to `review`. GeoIP country disagreement does.

## Reason codes

Introduce stable machine-readable reason codes with a single catalog that defines severity, short title, and explanation.

Required initial codes:

- `IP_NO_CONSENSUS`
- `IP_UNAVAILABLE`
- `IP_PROVIDER_UNAVAILABLE`
- `GEO_COUNTRY_DISAGREEMENT`
- `GEO_LOCATION_DISAGREEMENT`
- `GEO_COUNTRY_SINGLE_SOURCE`
- `GEO_LOCATION_SINGLE_SOURCE`
- `GEO_UNAVAILABLE`
- `BROWSER_TIMEZONE_MISMATCH`
- existing leak/review reasons should migrate to the same catalog when touched by this change.

Each reason object should contain at least:

- `code`
- `severity` (`info`, `review`, `leak`)
- `category`
- `summary`
- `details`
- `sources`
- optional structured `evidence`

Views must display catalog-derived text instead of inventing their own wording for the same condition.

## User-facing wording

### Country disagreement

Short status:

`GeoIP country disagreement`

Explanation:

`Providers reported different countries for the same public IP.`

Overall effect: `Review`.

### Location disagreement with country agreement

Short status:

`GeoIP location differs between providers`

Explanation:

`Country is consistent, but city/region data differs between GeoIP providers.`

Overall effect: informational only; `Protected` can remain `Protected`.

### Single source

Short status:

`GeoIP based on one provider`

Overall effect: informational unless another independent condition requires Review.

### Unavailable

Short status:

`GeoIP unavailable`

Overall effect: does not imply disagreement. It may contribute to `Incomplete` only where location data is required by the affected view; it must not create a false leak/review by itself.

### IP consensus disagreement

Short status:

`Public IP consensus failed`

Explanation:

`Independent public-IP providers returned conflicting addresses and no authoritative winner was established.`

This wording must never use `GeoIP`.

## Connection card behavior

The hero location line shows the selected country/location as today.

A secondary message is shown only when useful:

- country disagreement: warning tone — `GeoIP country disagreement`
- location disagreement with country agreement: neutral/info tone — `GeoIP location differs between providers`
- single source: subtle info tone — `GeoIP based on one provider`
- unavailable: `Location unavailable`

The generic `GeoIP providers disagree` text is removed.

The overall verdict chip remains authoritative. Informational GeoIP location differences must not visually look like a contradiction to `Protected`.

## Advanced GeoIP evidence

Add a dedicated `GeoIP sources` section for each authoritative IP family.

Overview fields:

- Selected IP
- Responded providers: `N/M`
- Country state
- Location state
- Selected country
- Selected region/city

Per provider row:

- provider label
- response status
- country
- region
- city
- timezone
- ASN / organization when available
- latency/error if available from the lookup result

Rows should make conflicting values visually distinguishable, but disagreement severity is determined by the normalized state model, not by color alone.

The Advanced section must make it possible to answer: "Which providers disagreed, and on which fields?" without inspecting copied JSON.

## Mobile layout

For narrow screens, summary rows with potentially long values use a stacked layout:

- label on the first line
- value on the next line
- left aligned
- unrestricted wrapping

This applies at minimum to Privacy summary rows and any other two-column summary component that can receive long diagnostic text.

Desktop retains the current two-column presentation where it fits.

No content may overlap another label or overflow the card horizontally at supported mobile widths.

## State derivation

GeoIP consensus should derive normalized field states once in the data/model layer. Views consume those states directly.

Do not recompute "does GeoIP disagree?" independently in `app.js`, `dashboard-view.js`, and `assessment.js`.

Recommended model output:

```js
geo.agreement = {
  available,
  total,
  countryState,
  locationState
}
```

Compatibility aliases such as `countryAgree` may remain temporarily if needed by untouched code, but new logic must use the explicit states.

A presentation/reason mapper converts state transitions into reason codes and user-facing messages.

## Assessment rules

- `GEO_COUNTRY_DISAGREEMENT` => `review`
- `GEO_LOCATION_DISAGREEMENT` with country `agree` => `info`
- `GEO_*_SINGLE_SOURCE` => `info`
- `GEO_UNAVAILABLE` => no false disagreement; only affects completeness where explicitly required
- `IP_NO_CONSENSUS` => `review`
- confirmed WebRTC/public-IP mismatch and other existing leak signals retain `leak`
- overall precedence remains `leak > review > incomplete > protected`

Informational findings are visible in relevant detail/Advanced views but do not force Review.

## Tests

Add a table-driven state matrix covering at least:

1. 2+ GeoIP providers, same country and location => country `agree`, location `agree`, no warning.
2. same country, different city/region => country `agree`, location `disagree`, overall may remain `protected`, info reason present.
3. different countries => country `disagree`, overall `review`, `GEO_COUNTRY_DISAGREEMENT`.
4. one usable GeoIP provider => `single-source`, not `agree`, no false Review.
5. zero usable GeoIP providers => `unavailable`, not `disagree`.
6. public-IP sources disagree => `IP_NO_CONSENSUS`; wording contains Public IP and not GeoIP.
7. mobile Privacy timezone mismatch renders in stacked layout without overlap.
8. Advanced GeoIP evidence renders provider-by-provider country/region/city/timezone values.
9. country agreement plus location disagreement uses informational styling and does not contradict `Protected`.
10. existing Strong/Partial IP consensus and leak-detection tests continue to pass.

## CI/CD and rollout

Implementation happens on `feature/clear-diagnostic-states`.

Before merge:

- run full `npm run check`
- verify static validator/build
- create PR to `main`
- require green PR Test workflow

After merge:

- verify Test workflow on merged `main` commit
- verify Deploy Pages build and deploy jobs succeed
- confirm GitHub Pages is serving the merged `main` artifact

No temporary network-smoke workflow is required for this UI/state-model change.

## Non-goals

- changing provider lists or consensus thresholds
- adding a backend
- treating normal GeoIP city disagreement as a VPN leak
- changing the existing Core performance improvements
