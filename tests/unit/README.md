# Unit Test Suite

This tree is the first-class home for non-Playwright Node assertions.

## Purpose

- Pure scoring and resolver logic
- Canonical contract checks
- Persistence and read/write invariants
- Handler-level tests that do not need the browser UI

## Runner

- `npm run test:unit`
- `npm run test:unit:resolver`
- `npm run test:unit:contracts`
- `npm run test:unit:persistence`
- `npm run test:unit:execution`

## Source of truth

The runner currently wraps the existing Node assertion scripts under `scripts/run-*.js` so the suite can be organized immediately without rewriting those tests.

If a new non-UI test is added, prefer registering it through [run-unit-suite.js](/abs/path/C:/Users/a_daveg/Documents/pullback-playbook/tests/unit/run-unit-suite.js:1) instead of adding more ad hoc package scripts.
