# Pullback Playbook Testing Guide

## 1. Testing Philosophy

Pullback Playbook uses a defence-in-depth testing strategy. Different layers exist because different failures happen in different places: resolver logic, persistence, replay parity, lifecycle transitions, and rendered UI can all drift independently.

The highest priority is protecting the canonical authority model:

- one canonical verdict
- one canonical trade plan
- one canonical lifecycle
- one source of truth shared by Review, Track, Paper Trade, Replay, and Diagnostics

Most tests in this repository exist to stop presentation-only state, stale persistence, projections, or replay output from becoming authority.

## 2. Test Pyramid

### Unit tests

Purpose:
- Validate resolver, normalization, persistence, contract, and execution behavior quickly without full browser setup.
- Catch authority drift before UI rendering is involved.

Typical files:
- `tests/unit/run-unit-suite.js`
- `scripts/run-resolver-gate-assertions.js`
- `scripts/run-canonical-resolver-input-assertions.js`
- `scripts/run-normalization-read-write-assertions.js`

Examples:
- resolver gate assertions
- canonical resolver input assertions
- normalization read/write assertions
- storage persistence assertions
- trade-plan authority assertions

### Contract tests

Purpose:
- Protect public invariants between canonical data, replay snapshots, diagnostics, and rendered state.

What invariants they protect:
- canonical authority survives formatting
- replay consumes canonical contracts rather than stale presentation
- Track and Review expose the same authority root
- read-only paths do not stamp plan authority

Examples:
- `tests/ui/contracts/canonical-resolver-snapshot-contract.spec.js`
- `tests/ui/contracts/replay-snapshot-contract.spec.js`
- `tests/ui/contracts/track-state-presentation-contract.spec.js`
- `tests/ui/contracts/entry-presentation-contract.spec.js`
- `scripts/run-plan-verdict-contract-assertions.js`
- `scripts/run-review-draft-authority-assertions.js`
- `scripts/run-trade-plan-authority-assertions.js`

### Regression tests

Purpose:
- Lock in fixes for production bugs and parity failures.

Rule:
- Every production bug should receive a regression test before it is considered fixed.

Examples:
- `tests/ui/regressions/amzn-scan-regression.spec.js`
- `tests/ui/regressions/watchlist-lifecycle-regression.spec.js`
- `tests/ui/regressions/replay-authority-regression.spec.js`
- `tests/ui/regressions/live-scan-parity-regression.spec.js`

There are also standalone regression-oriented scripts in `scripts/`, but not all of them are currently exposed through `package.json`.

### End-to-end journey tests

Purpose:
- Exercise full user workflows across Scan, Review, Track, optional Paper Trade, reload, replay, and diagnostics.

Examples:
- `tests/ui/journeys/specified-ticker-journey.spec.js`
- `tests/ui/journeys/ticker-visual-journey-parity.spec.js`
- `tests/ui/journeys/deployed-authority-journey.spec.js`

Specified ticker journey tests are the strongest browser-level regressions because they verify real user flows and cross-surface authority agreement.

## 3. Repository Layout

Current test folders:

- `tests/unit/`
  Grouped non-UI assertion runner.
- `tests/ui/smoke/`
  Basic app boot and scan sanity checks.
- `tests/ui/contracts/`
  Browser-level authority, replay, and presentation contracts.
- `tests/ui/regressions/`
  Fixed-bug coverage.
- `tests/ui/journeys/`
  Complete ticker workflows.
- `tests/ui/rendering/`
  Rendered Review/Track parity and authority-facing UI checks.
- `tests/ui/helpers/`
  Shared Playwright drivers, state extraction, parity, and reporting helpers.
- `tests/ui/fixtures/`
  Shared ticker inputs.

Related script-based suites live in `scripts/`. Some are wired into `tests/unit/run-unit-suite.js`; some are standalone.

## 4. Running Tests

Documented package commands currently present in `package.json`:

### Run everything

- `npm run test:ui:all`
- `npm run test:unit`

Note:
- There is currently no single package command that runs both all unit and all UI suites together.

### Individual unit groups

- `npm run test:unit:resolver`
- `npm run test:unit:contracts`
- `npm run test:unit:persistence`
- `npm run test:unit:execution`

### Playwright

- `npm run test:ui:parity`
- `npm run test:ui:ci`
- `npm run test:ui:smoke`
- `npm run test:ui:contracts`
- `npm run test:ui:regressions`
- `npm run test:ui:journeys`
- `npm run test:ui:rendering`

Notes:
- `test:ui:all` runs `scripts/run-ui-suite.js all`, which includes smoke, contracts, regressions, rendering, local journeys, and the live deployed journey.
- `test:ui:ci` runs `scripts/run-ui-suite.js ci`, which excludes the live deployed journey.

### Regression and handler scripts

- `npm run test:trade-execution`
- `npm run test:tester-bundle-admin`
- `npm run test:tester-bundle`
- `npm run test:tester-bundle-fetch`
- `npm run test:tester-bundle-receipts`
- `npm run test:tester-bundle-status`

### Authority and persistence scripts

- `npm run test:resolver-gates`
- `npm run test:storage-persistence`

## 5. Canonical Authority Invariants

The suite is mainly protecting these rules:

- Review never becomes authority by itself.
- Projections never become canonical authority.
- Diagnostics reflect canonical state.
- Track matches Review authority, except where an intentional scouting-only divergence is explicitly modeled and diagnosed.
- Paper Trade derives only from canonical authority.
- Reload restores canonical state.
- Replay never rewrites authority.
- Persistence stores authority rather than presentation.

In practice, tests repeatedly compare:

- canonical verdict
- visual bucket
- tone and badge
- setup score
- trade plan status
- paper-trade readiness
- replay output
- diagnostics output
- rendered Review and Track surfaces

## 6. Regression Policy

- Every user-visible bug fixed in production should gain a regression test.
- Tests should protect behavior rather than implementation detail.
- Regression tests should remain permanently unless stronger coverage replaces them.

For this app, the strongest regressions usually assert cross-surface authority agreement, not just one helper output.

## 7. Specified Ticker Journey Tests

A specified ticker journey should:

- launch the app
- analyse a specified ticker
- wait for analysis to complete
- verify Review
- verify Track
- verify Paper Trade when eligible
- verify Diagnostics
- reload the application
- verify persistence
- ensure all public surfaces agree with canonical authority

Current suites already move in this direction:

- `specified-ticker-journey.spec.js` checks full ticker flow and authority continuity
- `ticker-visual-journey-parity.spec.js` checks bucket and tone alignment across the journey
- `deployed-authority-journey.spec.js` exercises the deployed Netlify app and compares pre/post reload state

These tests provide higher confidence than isolated helper checks and are the preferred regression style for important tickers.

## 8. Writing New Tests

Conventions:

- Name tests by behavior and scenario, not helper names.
- Prefer public behavior assertions over implementation-detail assertions.
- Avoid brittle selectors; reuse `tests/ui/helpers/app-driver.js` and `tests/ui/helpers/app-state.js` where possible.
- Reuse existing helpers before adding one-off page logic.
- Keep tests deterministic with seeded records, replay snapshots, or explicit waits for known state transitions.
- When asserting diagnostics, also assert the matching rendered state.
- When adding a regression, capture both the user-visible symptom and the canonical field that must not drift again.

For script-based assertions, prefer invariant checks over exact source formatting unless the formatting itself is part of the contract.

## 9. Current Coverage

Major suites currently present:

- Resolver/unit assertions: resolver gates, canonical resolver input, normalization, lifecycle, trade-plan authority, review-draft authority, persistence, and execution handling.
- UI contract tests: canonical resolver snapshot parity, replay snapshot contracts, Track presentation contracts, and entry presentation contracts.
- UI regression tests: scan regressions, replay authority regressions, and watchlist lifecycle regressions.
- UI journey tests: specified ticker journeys, visual journey parity, and one deployed authority journey.
- UI rendering tests: Review AI summary authority parity.

Uncertainty:
- Some `scripts/run-*.js` files look like active test assets but are not wired into `package.json` or `tests/unit/run-unit-suite.js`. This guide does not assume all of them are part of normal contributor workflow.

## 10. Future Improvements

- broader specified ticker coverage
- golden ticker datasets
- deterministic replay fixtures
- visual regression testing where appropriate
- lifecycle stress testing
- consolidation of standalone script suites into clearer unit or UI categories

## Audit

### Undocumented test suites

Standalone `scripts/run-*.js` files not currently exposed through `package.json` or `tests/unit/run-unit-suite.js` include:

- `scripts/run-chart-authority-regressions.js`
- `scripts/run-free-text-authority-regressions.js`
- `scripts/run-onboarding-tour-assertions.js`
- `scripts/run-presentation-feedback-regressions.js`
- `scripts/run-trade-plan-authority-smoke.js`
- `scripts/run-trow-plan-regressions.js`

### Duplicated testing responsibilities

- Authority parity is checked in both unit-style scripts and UI contract suites.
- Replay authority is covered in both `tests/ui/contracts/replay-snapshot-contract.spec.js` and `tests/ui/regressions/replay-authority-regression.spec.js`.
- Track/Review authority parity appears in both script assertions and Playwright contracts.

### Gaps in coverage

- No single package command runs the full unit and UI matrix together.
- Live deployed journey coverage is currently one ticker per run.
- Paper Trade coverage exists in journeys, but named regression ticker breadth is still limited.
- Some standalone regression scripts are not clearly part of routine local or CI workflows.

### Opportunities to simplify

- Consolidate more standalone `scripts/run-*.js` suites into `tests/unit/run-unit-suite.js`.
- Decide which authority checks belong at script level versus Playwright contract level to reduce overlap.
- Standardize important regressions around specified ticker journey tests where feasible.
- Add a single top-level contributor command if the project wants a default full-suite entry point.
