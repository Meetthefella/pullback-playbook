# Phase 1 Threshold Audit

Safe checkpoint after `d0e153f`:
- lifecycle hygiene fix is complete, committed, pushed
- no threshold changes implemented yet
- no FMP expansion implemented yet

## Current conclusion

The app does not mainly look wrong because of active verdict divergence.

The harsher outcomes for names like `ANET` and `MOD` are more likely caused by core logic thresholds and shallow scanner proxies, especially around:
- `structureState = weak / weakening`
- `structureEligibility = damaged`
- `watch -> diminishing`
- bounce / stabilising detection

`EMR` looked strict but mostly justified.
`ANET` and `MOD` looked more plausibly over-punished.

## Branch map

### 1. Structure state assignment

Main branch: [app.js](/abs/path/C:/Users/a_daveg/Documents/pullback-playbook/app.js:25810)

Current flow:
- `broken` if scanner structure is broken or trend is broken
- `strong` if trend is strong and `checks.trendStrong`
- `intact` if trend is `strong` or `acceptable` and `perf1w > -4`
- `weakening` if `trendState === 'weak'`
- later overwritten to `weak` if any of these are true:
  - `trendState === 'weak'`
  - `worseningHighs`
  - `worseningCloses`
  - `perf1w < -2`
  - unless `resolveAlivePullbackReboundGuard(...)` applies

Why this is blunt:
- one-week performance is doing too much work
- three-bar worsening highs/closes can push a setup to `weak`
- the scanner can call something weak before it has enough rebound/stabilisation evidence

### 2. Structure eligibility mapping

Main branch: [js/resolver-core.js](/abs/path/C:/Users/a_daveg/Documents/pullback-playbook/js/resolver-core.js:582)

Current flow:
- `broken` if broken-below-stop or structure/trend state is `broken|invalid|failed`
- `damaged` if `structureState` is `weak|weakening|developing_loose`
- otherwise `alive`

Why this is blunt:
- `weak` and `weakening` collapse immediately into `damaged`
- there is no middle layer between "alive but messy" and "damaged"
- this pushes later presentation and viability logic toward harsher copy

### 3. Watchlist viability branches

Main branch: [js/resolver-core.js](/abs/path/C:/Users/a_daveg/Documents/pullback-playbook/js/resolver-core.js:699)

Most relevant punitive branches:
- `damaged_no_bounce_no_plan_low_score_reject`
- `damaged_tradeability_rr_fail_softened_low_priority`
- `damaged_tradeability_rr_fail_reject`
- `damaged_invalid_plan_no_bounce_low_priority`
- `damaged_with_early_bounce_low_priority`
- `mid_score_context_low_priority`

Important detail:
- even when `damaged` is softened from reject to `low_priority`, the main blocker still stays:
  - `Trend is weakening - no reliable stop level yet.`

This is coherent, but it makes weakening setups feel more terminal than they really are.

### 4. Watch to diminishing demotion

Main branches:
- [js/resolver-presentation.js](/abs/path/C:/Users/a_daveg/Documents/pullback-playbook/js/resolver-presentation.js:57)
- [js/resolver-presentation.js](/abs/path/C:/Users/a_daveg/Documents/pullback-playbook/js/resolver-presentation.js:164)

Current demotion paths:
- any deterioration evidence sends `watch` to `diminishing`
- explicit `damaged` or `weakening` sends `watch` to `diminishing`
- `weakWatchDiminishingTraceForState(...)` also demotes when:
  - verdict is `watch`
  - structure is still technically alive
  - `priceabilityState === 'unpriceable'`
  - plus enough weakness tokens such as:
    - missing plan
    - invalid RR
    - no valid invalidation
    - below 50 with no reclaim
    - no reclaim signals
    - bounce only `attempt` or `early`
    - promotion blocked

Why this is blunt:
- it mixes "not ready yet" with "actively deteriorating"
- `unpriceable + alive + bounce_attempt_only` can already be enough to create a harsher visual tone

## Scanner proxy weaknesses

Main branches:
- [app.js](/abs/path/C:/Users/a_daveg/Documents/pullback-playbook/app.js:24758)
- [app.js](/abs/path/C:/Users/a_daveg/Documents/pullback-playbook/app.js:25865)

Current scanner proxies:
- `stabilising` is basically:
  - near 20MA or 50MA
  - and `perf1w > -1.5` or missing
- `bounce` is basically:
  - `perf1w >= 2`
  - reclaimed MA support
  - not structure-broken
- `bounceStrength` comes only from `perf1w`

This is the biggest evidence gap. It is too easy for:
- a legitimate pullback to look weak
- a noisy one-week move to dominate the state
- weak rebound evidence to be treated the same as no real rebound evidence

## Example read

### EMR

Observed outcome:
- `watch / monitor`
- `alive`
- `intact`
- `bounceState = attempt`
- `priceabilityState = unpriceable`

Assessment:
- strict, but reasonable
- weak RR and unconfirmed bounce justify staying off `Near Entry`

### ANET

Observed outcome:
- `watch / diminishing`
- `damaged`
- `weak`
- `bounceState = none`
- blocker: `Trend is weakening - no reliable stop level yet.`

Assessment:
- coherent, but likely harsher than necessary
- the main issue is the fast jump from modest weakness into `damaged -> diminishing`

### MOD

Observed outcome:
- same broad pattern as `ANET`

Assessment:
- same issue
- looks more like a threshold-design problem than a contradiction problem

## Phase 1 subsection: threshold direction

### Thresholds that likely stay

- `broken` remains terminal
- extended setups should still stay out of `Near Entry`
- no-bounce / no-stabilisation should still block `Entry`
- weak RR should still block promotion

### Thresholds that likely need relaxing

- `perf1w < -2` should not by itself be strong enough to help force `weak`
- `worseningHighs` / `worseningCloses` over only three rows looks too sensitive
- `structureState = weak -> structureEligibility = damaged` is too immediate
- `alive + unpriceable + attempt bounce` should not so easily become `diminishing`
- `resolvedRR < 2` inside visual downgrade logic may be too punitive for watchlist-stage monitoring

### Thresholds that likely need richer evidence rather than a simple numeric tweak

- bounce confirmation
- stabilisation quality
- pullback control quality
- target realism
- reclaim quality

## Phase 1 subsection: FMP data expansion

To improve decisions, the scanner should pull or derive more context from recent daily candles.

### Extra inputs needed

- recent daily OHLC bars, ideally 10 to 20 sessions
- recent daily volume by bar
- recent true range or enough OHLC to derive ATR
- recent pivot highs and lows
- prior swing high candidate
- recent close-to-close and low-to-close rebound behaviour

### Derived signals to add

#### Bounce quality
- count of up-closes after the pullback low
- whether price reclaimed the prior day high
- whether price reclaimed the MA cluster decisively
- whether rebound happened on improving volume
- whether the rebound candle range is meaningful versus recent ATR

#### Stabilisation quality
- two to three bars of tightening or less downside expansion
- hold above local pivot low
- smaller real-body candles after the drop
- loss of downside momentum before reclaim

#### Pullback control
- pullback depth versus ATR
- pullback depth versus distance from 20MA and 50MA
- whether lows are undercutting aggressively or holding a base
- whether price is below 20MA but still behaving constructively above 50MA

#### Target realism
- first target should reference recent swing high or pivot resistance
- projected target should not be so close that RR becomes artificially trivial
- target should be validated against recent local highs, not just a generic projection

## Recommended next implementation order

1. Introduce richer bounce/stabilisation derived signals from recent candles.
2. Separate `alive but messy` from `damaged` before changing final verdict thresholds.
3. Narrow `watch -> diminishing` so it reflects genuine deterioration, not just missing priceability.
4. Revisit target logic so first-target RR is not artificially cramped on otherwise valid pullbacks.

## Phase 1 implementation addendum

The audit above remains the reasoning checkpoint. Phase 1 code work is now implemented on top of it.

### Implemented

1. Richer bounce and stabilisation evidence now comes from recent daily candles rather than relying mainly on one-week performance.
2. `weak` and `weakening` no longer collapse straight into `damaged` when there is constructive repair evidence; they can stay `messy`.
3. `watch -> diminishing` is now narrower and focuses on actual deterioration rather than punishing early repair states, missing plan alone, or bounce-attempt labels by themselves.
4. Scanner first-target estimation and plan realism now use recent local resistance more explicitly:
   - nearest pivot resistance
   - recent pre-pullback swing high
   - prior high context
   - realistic RR clipping when a displayed target stretches beyond local resistance on an early or weak repair

### Net Phase 1 outcome

- `broken` still stays terminal.
- genuinely damaged or deteriorating setups can still fall into `diminishing` or worse.
- alive or messy repair attempts near support can remain monitor/watch while they stabilise.
- target realism is less likely to be distorted by a generic cap or by a target that ignores nearby resistance.

## Safe point for context compaction

This document is now the audit record plus the Phase 1 completion addendum.
