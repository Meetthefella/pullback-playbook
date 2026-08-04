# Backend v2 charter

## Status: shadow-only and provisional

Backend v2 is an isolated research path. It must not determine what Scan, Review, Track, Chart Guru, persistence, or Paper Trade shows or executes. The existing canonical publication remains the live authority until an explicit future approval changes this charter.

The current assessment model is provisional. Its output is useful only for shadow comparison and for exposing missing source evidence. Do not tune its thresholds, promote its result, or treat a parity match as proof that the playbook has been modelled correctly.

## Non-negotiable boundaries

- Keep `BackendV2` free of imports from UI and legacy resolver code.
- Preserve one-way legacy-to-v2 input adaptation; no v2 result may write back into a record's live decision fields.
- Keep shadow captures and comparison reports diagnostic-only.
- Require raw, timestamped market data and an original chart image before using a capture to reassess the playbook.
- Do not enable v2 Paper Trade authority. GBP risk sizing needs a verified quote-currency/FX design first.

## Immediate objective

Collect representative real chart imports paired with their market snapshots. Use those captures to write and agree the playbook rules in plain English before altering the v2 assessment model.
