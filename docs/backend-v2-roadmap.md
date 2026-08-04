# Backend v2 roadmap

## 0. Hold consumer cutover — active

V2 stays shadow-only. No changes to Scan, Review, Track, Chart Guru, persistence, or Paper Trade authority.

## 1. Input evidence path — active

- Capture each uploaded original chart's identity, dimensions, type, and provenance.
- Capture the paired provider snapshot, timestamp, currency, moving averages, volume, and daily-history coverage.
- Run the browser contract test with an actual PNG upload and a 200-bar data packet.
- Run the deployed-only paired journey against a current `PP_BASE_URL`. It must prove the rendered Review publication, retrieved canonical publication, and `shadowSourcePublicationId` agree, while treating the Review PNG as a separately retained attachment.
- Exercise both controls: alternate PNG with unchanged bars, then changed bars with a new snapshot/publication/shadow identity.
- Add a small set of real, user-approved chart/snapshot captures before rule design begins.

## 2. Playbook reassessment — next

Write the agreed definitions for trend health, support, stabilisation, buyer control, confirmation, extension, invalidation, and the exact distinction between Watch, Near Entry, Entry, and Avoid. Include conservative treatment for unavailable evidence.

The working [playbook reassessment](backend-v2-playbook-reassessment.md) records the open definitions and the evidence protocol. It remains deliberately non-executable.

## 3. Revise the v2 model — blocked on step 2

Address the review findings: explicit market-data failure gates, bounce requirements, evidence references, shadow-report depth, and FX-aware risk sizing. Add golden input-capture fixtures for each rule.

## 4. Shadow evaluation — later

Compare v2 against legacy by snapshot, phase, gates, plan, risk settings, and reason codes. Review disagreements manually; parity alone is not a target.

## 5. Consumer cutover — explicitly paused

Requires a separate approval after the reassessed rules, fixture suite, and risk model are accepted.
