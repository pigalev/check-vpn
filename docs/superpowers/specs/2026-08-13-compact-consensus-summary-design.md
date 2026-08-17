# Compact Consensus Summary Design

## Goal

Keep the main connection card concise and outcome-focused while preserving full provider lifecycle transparency in Advanced diagnostics.

## Main-screen behavior

For a Strong public-IP result, show only the observed consensus among providers that actually contributed usable IP votes:

- `Strong consensus · 4/4 agree`
- `Strong consensus · 3/3 agree`
- etc.

Do not show `4/5 primary responded` on the main card because the denominator includes configured providers that may have been cancelled as no longer necessary after consensus was mathematically guaranteed.

Reserve lifecycle details are hidden from the main card unless the reserve provider actually contributed a usable IP vote to the final result.

If reserve contributed, append:

- `Strong consensus · 4/4 agree · reserve contributed`

Do not show these main-card suffixes:

- `reserve not needed`
- `reserve attempted`

## Advanced behavior

Advanced diagnostics remain the source of full mechanics and must preserve enough information to distinguish:

- configured primary providers
- primary providers that responded with usable IP data
- providers stopped/cancelled because consensus was already guaranteed
- reserve not needed
- reserve attempted but unavailable/failed
- reserve contributed

Existing provider rows and statuses remain unchanged unless a wording fix is required to express those states accurately.

## Consensus semantics

This is a presentation-only change. Do not change:

- Strong consensus predicate
- quorum thresholds
- early-finish logic
- provider lists
- Core timeout or hedge timing
- reserve execution behavior

The displayed `4/4 agree` denominator is the number of successful usable public-IP votes, not the number of configured primary providers.

## Tests

Add regression tests for the main-card summary:

1. Strong result with 4 usable agreeing votes, 5 configured primaries, and reserve not needed -> `Strong consensus · 4/4 agree`.
2. Strong result with reserve attempted but failed -> no reserve suffix on the main card.
3. Strong result where reserve contributed -> append `reserve contributed`.
4. Advanced provider evidence continues to expose configured/responded/not-needed/attempted/contributed states.
5. Existing consensus math tests remain unchanged and green.

## Scope

Only compact public-IP summary presentation and its tests are in scope. No consensus or network behavior changes are allowed.
