# UI Test Suite

The Playwright suite is organized by test intent instead of by implementation date.

## Categories

- `smoke/`
  - Basic app boot and simple scan sanity checks.
- `contracts/`
  - Canonical authority, replay snapshot, presentation, and persistence invariants.
- `regressions/`
  - Previously fixed bugs and parity cases that should not regress.
- `journeys/`
  - End-to-end flows for specified live or fixture-backed tickers.
- `rendering/`
  - Rendered Review and Track copy/assertion coverage, especially where UI output must match diagnostic authority.
- `helpers/`
  - Shared Playwright drivers, state extraction, parity helpers, and report writers.
- `fixtures/`
  - Shared ticker inputs for scan-style tests.

## Scripts

- `npm run test:ui:all`
- `npm run test:ui:ci`
- `npm run test:ui:smoke`
- `npm run test:ui:contracts`
- `npm run test:ui:regressions`
- `npm run test:ui:journeys`
- `npm run test:ui:rendering`
- `npm run test:ui:parity`

## Unit vs UI

Non-UI assertions now have a first-class home under `tests/unit/`.

- `npm run test:unit`
- `npm run test:unit:resolver`
- `npm run test:unit:contracts`
- `npm run test:unit:persistence`
- `npm run test:unit:execution`
