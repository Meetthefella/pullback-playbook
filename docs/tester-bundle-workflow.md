# Tester Bundle Workflow

This document describes the implemented tester bug workflow status system for operators and Codex/admin users.

## Scope

- Tester submissions go to `/.netlify/functions/tester-bundle` through `/api/tester-bundle`.
- Admin bundle reads go to `/.netlify/functions/tester-bundle-admin` through `/api/tester-bundle-admin`.
- Admin workflow status updates go to `/.netlify/functions/tester-bundle-status` through `/api/tester-bundle-status`.
- Tester browser receipts remain local-first and local-only for `Closed`.

## Status Lifecycle

Canonical status order:

1. `submitted`
2. `under_investigation`
3. `analysis_complete`
4. `fixed`
5. `closed`

Operational meaning:

- `submitted`: set automatically by the app when a tester submits a diagnostics bundle.
- `under_investigation`: set by admin/Codex when triage starts.
- `analysis_complete`: set by admin/Codex when investigation is complete and findings are recorded.
- `fixed`: set by admin/Codex when a fix exists. `fixedInBuild` is required.
- `closed`: supported in the shared model, but currently local-only in the tester app workflow. The server status endpoint rejects `closed` during this rollout, and testers mark `Closed` only in their local receipt list.

## Who Sets Each Status

- Tester app:
  - creates `submitted` automatically on bundle submission
  - allows local receipt `Closed` via `Mark Closed`
- Admin/Codex:
  - fetches private bundles
  - sets `under_investigation`
  - sets `analysis_complete`
  - sets `fixed`
  - can force an out-of-order correction with `override: true`

Default `statusUpdatedBy` values:

- `app` for the initial `submitted` workflow state
- `codex` for script-driven or direct admin status updates unless explicitly overridden in the request body

## Security Model

Public tester access:

- `tester-bundle.js` is submit-only
- only `POST` and `OPTIONS` are accepted
- trusted origin guard still applies
- there is no browser read, list, or admin token path

Admin access:

- `tester-bundle-admin.js` is read-only for a single issue
- only `GET` and `OPTIONS` are accepted
- requires `TESTER_REPORT_ADMIN_TOKEN`
- direct key reads are not supported
- `mode=list` and similar read/list modes are rejected

Admin status mutation:

- `tester-bundle-status.js` is update-only
- only `POST` and `OPTIONS` are accepted
- requires `TESTER_REPORT_ADMIN_TOKEN`
- no read/list behavior exists on this endpoint

## Required Environment Variables

Required for admin fetch and status operations:

- `TESTER_REPORT_ADMIN_TOKEN`
- `TESTER_BUNDLE_ADMIN_URL` or `NETLIFY_SITE_URL`

Optional convenience variable:

- `TESTER_BUNDLE_STATUS_URL`
  - if omitted, the helper script derives the status endpoint from `NETLIFY_SITE_URL`

Examples:

```powershell
$env:TESTER_REPORT_ADMIN_TOKEN="your-admin-token"
$env:NETLIFY_SITE_URL="https://your-site.netlify.app"
```

Direct endpoint form:

```powershell
$env:TESTER_REPORT_ADMIN_TOKEN="your-admin-token"
$env:TESTER_BUNDLE_ADMIN_URL="https://your-site.netlify.app/.netlify/functions/tester-bundle-admin"
$env:TESTER_BUNDLE_STATUS_URL="https://your-site.netlify.app/.netlify/functions/tester-bundle-status"
```

## CLI Usage

The helper script is:

```powershell
node scripts/fetch-tester-bundle.js BUG-YYYYMMDDHHMMSS-TICKER
```

It always downloads the full bundle to `debug-bundles/{issueId}.json`.

### Semi-Automatic Progression

The helper script now supports opt-in semi-automatic server status progression:

```powershell
node scripts/fetch-tester-bundle.js BUG-20260626102014-AAPL --auto-progress
```

It only advances one safe server-side step at a time:

- `submitted -> under_investigation`
  - advances automatically when the bundle is fetched for investigation
- `under_investigation -> analysis_complete`
  - only advances if `--reason` is supplied
- `analysis_complete -> fixed`
  - only advances if `--reason` is supplied
  - only advances if `--fixed-in-build` is supplied
  - only advances if the local git working tree is clean apart from `debug-bundles/`

It does not auto-advance:

- backward transitions
- skip-ahead transitions
- `closed`

### Fetch Only

```powershell
node scripts/fetch-tester-bundle.js BUG-20260626102014-AAPL
```

### Fetch + Mark Under Investigation

```powershell
node scripts/fetch-tester-bundle.js BUG-20260626102014-AAPL --mark-under-investigation
```

### Mark Analysis Complete

```powershell
node scripts/fetch-tester-bundle.js BUG-20260626102014-AAPL --mark-analysis-complete
```

### Mark Fixed With `fixedInBuild`

```powershell
node scripts/fetch-tester-bundle.js BUG-20260626102014-AAPL --mark-fixed --fixed-in-build v4.4.20
```

### Auto-Progress During Investigation

Start investigation and fetch the latest bundle in one step:

```powershell
node scripts/fetch-tester-bundle.js BUG-20260626102014-AAPL --auto-progress
```

Mark analysis complete once findings are recorded:

```powershell
node scripts/fetch-tester-bundle.js BUG-20260626102014-AAPL --auto-progress --reason "Root cause confirmed in watchlist debug snapshot path"
```

Mark fixed only after code is in place, the working tree is clean, and a build is known:

```powershell
node scripts/fetch-tester-bundle.js BUG-20260626102014-AAPL --auto-progress --fixed-in-build v4.4.20 --reason "Production patch deployed and verified"
```

### Override Transition

Use the helper script with `--override`. Optional `--reason` is passed through to the admin status endpoint audit note.

Examples:

```powershell
node scripts/fetch-tester-bundle.js BUG-20260626102014-AAPL --mark-analysis-complete --override
```

```powershell
node scripts/fetch-tester-bundle.js BUG-20260626102014-AAPL --mark-fixed --fixed-in-build v4.4.20 --override --reason "Manual operator correction"
```

## What Remains Local-Only

These parts remain browser-local and are not server-synced:

- the `Recent Submitted Bugs` panel
- the local receipt status badge rendering
- the tester-side `Mark Closed` action
- local receipt timestamps for `Closed`

The local app uses the same canonical status name `closed` and the same label/color model so later sync work can reuse the naming without a migration rename.

## Local Tests

Run:

```powershell
npm run test:tester-bundle
npm run test:tester-bundle-admin
npm run test:tester-bundle-fetch
npm run test:tester-bundle-status
node --check app.js
```

What these cover:

- submit-only tester bundle behavior
- admin token enforcement for private bundle reads
- no list/read-by-key mode for the admin fetch route
- workflow transition validation
- `fixedInBuild` requirement for `fixed`
- compact index and full bundle updates
- appended history events

## Netlify Preview Smoke Test

Recommended preview smoke test on a deployed preview or local Netlify dev:

1. Submit a tester bundle.

```bash
curl -X POST https://your-preview.netlify.app/api/tester-bundle \
  -H "Content-Type: application/json" \
  -H "X-Pullback-Tester-Id: 11111111-1111-4111-8111-111111111111" \
  --data-binary @sample-diagnostics.json
```

Expected:

- `200 OK`
- response contains `ok`, `issueId`, `indexKey`, `fullKey`, and `receipt`
- `receipt.workflow.status` is `submitted`

2. Fetch the private bundle with admin token.

```powershell
$env:TESTER_REPORT_ADMIN_TOKEN="your-admin-token"
$env:NETLIFY_SITE_URL="https://your-preview.netlify.app"
node scripts/fetch-tester-bundle.js BUG-20260626102014-AAPL
```

Expected:

- bundle writes to `debug-bundles/BUG-20260626102014-AAPL.json`
- file contains `workflow.status`
- file contains `history[0].type = "submission"`

3. Mark the issue under investigation and fetch again.

```powershell
node scripts/fetch-tester-bundle.js BUG-20260626102014-AAPL --mark-under-investigation
```

Expected:

- server accepts the transition
- fetched bundle now shows `workflow.status = "under_investigation"`
- history includes a `status_change` event

4. Confirm no public list/read path was exposed.

- `GET /api/tester-bundle` should return `405`
- `GET /api/tester-bundle-admin?mode=list` should return `400`
- `GET /api/tester-bundle-admin?issueId=...` without admin token should return `403`
- `POST /api/tester-bundle-status` without admin token should return `403`

## Operator Notes

- The compact index and the full bundle are updated together as a logical unit, but the underlying storage writes are still sequential. A partial-write failure is handled as a `502`, but cross-blob atomicity is not guaranteed by the store itself.
- `Closed` is intentionally not part of the server-driven workflow yet, even though the canonical model already includes it for later compatibility.
