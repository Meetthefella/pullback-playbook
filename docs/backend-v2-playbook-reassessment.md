# Quality Pullback playbook reassessment

Status: working specification, not executable policy. This document records what must be agreed from real chart-and-market captures before `BackendV2` is revised.

## What remains clear

- Prefer stocks in a healthy uptrend.
- Prefer pullbacks at, or close to, the 20MA or 50MA.
- Do not enter without observable stabilisation and a buyer response.
- Use the prior swing high as the first target when it yields acceptable reward-to-risk.
- Missing evidence must reduce certainty; it must not create an actionable setup.

## Definitions that need a signed-off rule

| Topic | Current ambiguity | Required evidence in an input capture |
| --- | --- | --- |
| Trend health | Price above moving averages is not enough to define an uptrend. | 200 daily bars, 20/50/200MA values, close history. |
| Support relevance | A fixed percentage from an MA may not fit every ticker's volatility. | Chart image, MA values, recent low, daily range/ATR if adopted. |
| Stabilisation | “Clear” needs observable criteria, not a presentation label. | Chart image plus dated bars around support. |
| Buyer control | A bounce and buyer control are related but not interchangeable. | Recovery bars, volume relationship, and chart evidence. |
| Confirmation | Follow-through needs an explicit trigger and invalidation point. | Trigger level, close/volume evidence, and exact timestamp. |
| Extension/chase | The maximum distance from support or trigger is not yet agreed. | Entry, support, latest price, and recent swing high. |
| Risk | A £40 limit cannot be divided by a USD/GBX risk per share without FX. | Quote currency, FX quote/rate timestamp, entry, stop, and account-risk version. |

## Current v2 observations

The provisional model is intentionally not authoritative. The review found that it currently lets unknown market context pass, does not require a bounce for Entry, has empty evidence references, and cannot size non-GBP shares safely. These are design inputs for the next model revision, not issues to patch in isolation.

## Evidence-gathering protocol

For each candidate, collect one original chart import and the matching market-data snapshot at the same review moment. Keep the input capture only when it has:

1. ticker, timestamp, current price, provider, currency, and at least 200 daily bars;
2. original PNG/JPEG provenance, dimensions, and image identity;
3. a human-labelled outcome: Avoid, Watch, Near Entry, or Entry, with a short explanation; and
4. where a plan is present, entry, stop, target, and FX evidence when the quote currency is not GBP.

Use a varied set: confirmed entries, early rebounds, failed support, extended setups, weak-market setups, and unavailable-data cases. Only then turn these definitions into v2 gates and golden fixtures.
