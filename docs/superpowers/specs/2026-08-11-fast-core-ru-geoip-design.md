# Fast Core Consensus + RU-Friendly IP/GeoIP Design

**Date:** 2026-08-11

## Goal

Make the default Core VPN/IP check finish as quickly as possible on both normal and degraded/Russian-network paths, without weakening consensus honesty, while fixing GeoIP/flag behavior when location providers fail or disagree.

The feature must optimize for **time to trustworthy result**, not for minimizing request count.

## User-visible problems being fixed

1. On some networks several public-IP providers hang until the current ~6 second timeout, even though enough other providers have already agreed on the same IP.
2. IPPubblico is currently globally disabled after a runner-based CORS smoke, so the browser never tries it on the user's actual network.
3. RU-network runs can degrade to `Partial · 2 sources agree` because several foreign endpoints time out simultaneously.
4. GeoIP with zero usable country results is currently surfaced as `GeoIP country disagreement`, even though no disagreement actually occurred.
5. When GeoIP providers disagree, the chosen location/flag may disappear even when a usable country/location winner exists.
6. Flag rendering depends on an external image CDN and has no visible fallback.

## Non-goals

- Do not weaken Strong consensus to "first N responses agree".
- Do not turn provider failures into leak findings.
- Do not add API tokens/secrets to GitHub Pages.
- Do not scrape Yandex Internetometer or other undocumented HTML pages.
- Do not change Guided/Aggressive leak verdict hierarchy, STUN behavior, DNS/torrent/email feature flags, or sessionStorage semantics.
- Do not make Advanced diagnostics responsible for Core completion.

---

# 1. Speed-first Core architecture

## 1.1 Start all enabled Core groups immediately

The current two-phase `primary -> reserve if needed` flow is replaced for the default Core check with a single concurrent race across every **enabled Core-capable independent group**.

Each independent group still has exactly one vote.

Example groups:

- ipify
- ident.me / tnedi.me mirror group
- SeeIP
- icanhazip
- IP.SB
- IPPubblico
- RU-friendly candidate groups that pass activation checks

A mirror inside a group never receives its own vote.

## 1.2 Early mathematically-safe completion

Core must not wait for every provider once the final Strong result is mathematically guaranteed.

Approved Strong rule remains:

- at least 3 successful independent groups;
- winning share >= 2/3 of successful votes.

For early completion, the engine must be stricter: it may finish before pending groups settle only when **even if every still-pending enabled group returned a competing address, the current winner would still satisfy the final Strong rule**.

For a current winner with `W` votes, `S` successful votes, and `P` pending groups, early Strong is safe only when:

```text
W >= 3
and
W / (S + P) >= 2/3
```

This prevents a misleading early `3/3` result when three other groups are still pending, while allowing an honest early `4/6` or `5/7` result.

Examples:

```text
4 equal responses, 2 pending -> 4/6 = 66.7% -> finish Strong now
3 equal responses, 2 pending -> 3/5 = 60% -> keep waiting
5 equal responses, 2 pending -> 5/7 = 71.4% -> finish Strong now
```

Pending groups that are aborted after a mathematically-safe early finish are not `unavailable`. They are recorded as:

```text
status: not-needed
reason: Consensus already guaranteed
```

## 1.3 Do not make first-valid authoritative

The first valid response is still allowed to render immediately as provisional UI for perceived speed.

It does not become authoritative until consensus reaches one of the final confidence states.

If the final state is `no-consensus`, the provisional address must be removed as authoritative exactly as in the current wide-consensus implementation.

---

# 2. Timing policy

## 2.1 Shorter Core deadline

Reduce the default Core public-IP deadline from 6000 ms to a speed-oriented budget in the **3000–3500 ms range**.

The exact value will be selected during implementation using regression/smoke evidence, with a target of approximately 3200 ms unless real provider behavior justifies a nearby value.

Repeated Active-test sampling keeps its own profile/cadence and does not inherit extra RU/slow providers solely because Core does.

## 2.2 Hedged mirror fallback for ident

The ident group remains one vote but should stop waiting serially for a slow preferred endpoint.

Behavior:

1. Start `ident.me` immediately.
2. If no valid answer appears after a short hedge delay (~800–1000 ms), start `tnedi.me` concurrently.
3. First valid family-correct result wins the group.
4. Abort the losing mirror request when possible.
5. Record both attempts in Advanced evidence.
6. The group still casts only one vote.

The implementation must make hedge delay configurable/testable rather than hard-coding timing into DOM code.

---

# 3. IPPubblico policy

## 3.1 Remove global runtime quarantine

IPPubblico must no longer be permanently skipped by `enabled:false` solely because one GitHub-runner smoke lacked usable browser CORS evidence.

The real user browser should attempt IPPubblico during Core.

Possible outcomes:

- readable valid IP -> one normal independent vote;
- CORS/network failure -> `unavailable`;
- timeout -> `unavailable`;
- early Strong achieved before it finishes -> `not-needed`.

IPPubblico failure is never a Review/Leak finding by itself.

## 3.2 Keep request budget short

Because IPPubblico has been unstable in observed runs, it must not extend the Core wall-clock budget beyond the global Core deadline.

No dedicated 6-second grace period is allowed.

---

# 4. RU-friendly public-IP sources

## 4.1 Activation rule

RU-friendly sources may join Core only when all of the following are true:

- endpoint can determine the caller's public IP without a secret;
- payload contract is simple and parseable without HTML scraping;
- browser-readable CORS behavior is verified or clearly documented;
- family behavior is known enough to avoid IPv4 results voting in IPv6 and vice versa;
- request does not create an unacceptable per-domain/global rate-limit risk for a public GitHub Pages site.

Candidates that fail the gate stay out of production Core config.

## 4.2 RU candidates under review

Candidate evaluation should include Russian/RU-friendly services such as IP-API.RU and Sypex Geo where technically appropriate, but a candidate is not considered active until a real endpoint/CORS/payload smoke supports it.

Yandex Internetometer may be mentioned as a manual external verification option but is not used as a Core source without a documented browser API contract.

2IP remains unsuitable for direct public GitHub Pages use while it requires a secret/token.

## 4.3 Parallel participation for speed

Once a RU-friendly IP source passes activation, it participates in the initial Core race immediately rather than waiting in a second reserve phase.

The goal is specifically to help networks where several foreign providers hang simultaneously.

---

# 5. Final public-IP confidence states

The existing confidence vocabulary remains:

- `strong`
- `partial`
- `no-consensus`
- `unavailable`

## Strong

At least 3 successful independent groups and winning share >= 2/3.

## Partial

Only 1–2 successful agreeing groups after the global Core deadline, with no conflicting successful address.

Partial remains usable as an authoritative address for existing comparison behavior, but the UI clearly says `Partial`.

## No consensus

At least 3 successful votes exist but no address reaches the Strong threshold, or successful responses conflict without a defensible winner.

`address` is null.

## Unavailable

No usable successful public-IP group exists for the family.

`address` is null.

Provider timeout/failure alone does not create Review. Only actual no-consensus creates the existing IP-consensus Review finding.

---

# 6. Advanced source evidence

Advanced -> IPv4/IPv6 network continues to show source-level evidence.

For each independent group show:

- provider/group label;
- returned address when available;
- relation to final selected address (`agrees`, `differs`, `observed`);
- timing;
- terminal state (`unavailable`, `not-needed`);
- concise error when relevant;
- nested mirror/endpoint attempts when a group uses fallback/hedging.

New early-finish example:

```text
ipify       31.76.17.233   agrees       260 ms
ident.me    31.76.17.233   agrees       410 ms
SeeIP       31.76.17.233   agrees       720 ms
RU source   31.76.17.233   agrees       580 ms
icanhazip   Not needed     consensus guaranteed
IP.SB       Not needed     consensus guaranteed
```

`not-needed` is visually distinct from `unavailable`.

---

# 7. GeoIP state-model fix

The current GeoIP model incorrectly collapses "no country data" into `countryAgree:false`.

Replace this with an explicit state model.

For country evidence:

```text
0 usable country values -> unavailable
1 usable country value  -> single-source
2+ all same             -> agree
2+ different            -> disagree
```

The consensus result should expose a value such as:

```js
countryState: 'unavailable' | 'single-source' | 'agree' | 'disagree'
```

For backward compatibility, `countryAgree` may remain, but:

- `true` only for `agree`;
- `false` only for `disagree`;
- `null` for `unavailable` / `single-source`.

The same principle should be applied to location agreement if the current code has the same ambiguity.

## Assessment behavior

- `countryState === 'disagree'` -> Review finding `GeoIP country disagreement`.
- `unavailable` -> no disagreement finding.
- `single-source` -> no disagreement finding.
- `agree` -> no disagreement finding.

A lack of GeoIP coverage is not a leak and not a country disagreement.

---

# 8. Location rendering and flag fallback

## 8.1 Do not hide a usable location because providers disagree

If GeoIP consensus produced a selected country/location, `Your connection` shows it even when country/location evidence is disputed.

Example:

```text
🇷🇺 Russia · Moscow
GeoIP providers disagree
```

The disagreement remains a Review chip/finding, while Advanced shows provider-level evidence.

## 8.2 Flag fallback chain

Country flag rendering becomes resilient:

```text
FlagCDN image -> Unicode regional-indicator emoji -> country text only
```

Implementation must always have the country text available; the image is purely decorative/enhancement.

If the image fails to load, replace it/show the emoji rather than silently removing the flag.

## 8.3 Location unavailable

If there is no usable selected GeoIP location:

```text
Location unavailable
```

No flag is invented, and no false disagreement warning is shown.

---

# 9. RU-friendly GeoIP

A RU-friendly GeoIP provider may be added in the same feature if live browser-compatible smoke evidence supports one.

Requirements:

- no public secret/token;
- explicit/queryable IP input so the current VPN public IP is enriched rather than the service's interpretation of some unrelated request path;
- browser-readable response from GitHub Pages;
- usable country code/country at minimum;
- failure does not block existing GeoIP consensus.

Sypex/IP-API.RU are candidates to investigate, not guaranteed production additions.

If none pass the activation gate, the state-model/flag fixes still ship independently.

---

# 10. Progressive UI behavior

Default Core sequence should feel fast:

1. First valid public IP appears immediately as provisional.
2. GeoIP for that provisional address may start immediately as today.
3. Public-IP groups continue concurrently.
4. If mathematically-safe Strong is reached, pending Core requests are aborted immediately.
5. Final address replaces/locks the provisional result.
6. GeoIP result renders selected location/flag independently of agreement state.
7. If final IP differs from provisional, stale GeoIP remains discarded by the existing race protection.

The UI must not delay the first visible IP while waiting for source evidence.

---

# 11. Error semantics

Provider request failures are evidence states, not product verdicts.

Examples:

- `Fetch is aborted` -> source unavailable/timeout.
- CORS block -> source unavailable.
- wrong-family payload -> source unavailable.
- early aborted because winner is guaranteed -> source not-needed.

Only successful conflicting valid public addresses participate in disagreement/no-consensus decisions.

---

# 12. Testing requirements

## Public-IP race tests

Must cover:

- 4 equal + 2 pending -> early Strong, pending aborted/not-needed;
- 3 equal + 2 pending -> must continue waiting;
- early apparent winner later becomes 3-2 -> no premature finish;
- two fast agreeing responses + remaining timeout -> Partial at deadline;
- no responses -> Unavailable;
- competing successful values below threshold -> No consensus;
- first provisional address differs from final -> stale provisional/GeoIP not retained;
- aborted not-needed source excluded from `available` vote count but preserved in evidence;
- provider error never votes;
- IPPubblico success can contribute a normal vote;
- IPPubblico failure does not create Review.

## Ident hedge tests

Must cover:

- primary responds before hedge -> mirror never starts;
- primary stalls -> mirror starts after hedge;
- mirror wins -> group returns mirror address, one vote;
- primary and mirror race with same IP -> one vote;
- primary/mirror return different IPs -> first valid group result wins but attempts are preserved for diagnostics; the group still contributes one vote only;
- global group deadline bounds both requests.

## GeoIP tests

Must cover:

- zero usable countries -> `countryState: unavailable`, no Review;
- one usable country -> `single-source`, selected country shown;
- all usable countries same -> `agree`;
- conflicting countries -> `disagree`, Review finding;
- disagreement with selected country still renders location;
- failed flag image falls back to emoji;
- country text remains visible if image and emoji rendering path is unavailable.

## Regression tests

Must confirm unchanged:

- WebRTC leak mismatch logic;
- Guided Known Real verdict precedence;
- Aggressive/Kill Switch stress provider profile/cadence;
- Copy JSON compatibility except additive GeoIP state/evidence fields;
- mobile layout does not horizontally overflow;
- Advanced remains lazy and opening it performs no additional Core IP discovery requests.

---

# 13. Success criteria

The feature is successful when:

1. A Core run can finish before slow providers reach timeout when Strong consensus is mathematically guaranteed.
2. Common healthy runs remain Strong and usually finish around the fastest quorum rather than the slowest provider.
3. Degraded/RU-network runs get a fair chance from additional browser-compatible RU-friendly sources and live IPPubblico attempts.
4. A hanging provider cannot alone force a ~6 second Core wait after consensus is already guaranteed.
5. `GeoIP country disagreement` appears only for actual conflicting country evidence.
6. A usable selected country/location and flag remain visible even when GeoIP providers disagree.
7. Flag rendering has a Unicode fallback and never depends solely on FlagCDN.
8. Existing leak classifications and Active-test semantics remain unchanged.

---

# External-provider notes

- IPPubblico documentation currently advertises browser/CORS support, so the product should prefer a real per-user browser attempt over a permanent global quarantine based on one external runner observation.
- IP.SB documents a public API intended for direct requests and remains a Core candidate; observed per-network timeouts are handled by early completion/global deadlines rather than by treating one failure as globally fatal.
- RU provider additions remain activation-gated by real browser-readable evidence rather than documentation assumptions alone.
