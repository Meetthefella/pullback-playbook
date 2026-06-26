# Fetch Tester Bundle For Codex

Use the admin-only fetch function to download a stored tester bundle into the local workspace for Codex analysis.

## Environment

Set:

- `TESTER_REPORT_ADMIN_TOKEN`
- either `TESTER_BUNDLE_ADMIN_URL`
- or `NETLIFY_SITE_URL`

Examples:

```powershell
$env:TESTER_REPORT_ADMIN_TOKEN="your-admin-token"
$env:NETLIFY_SITE_URL="https://your-site.netlify.app"
node scripts/fetch-tester-bundle.js BUG-20260626102014-AAPL
```

If you want to point directly at a custom endpoint:

```powershell
$env:TESTER_REPORT_ADMIN_TOKEN="your-admin-token"
$env:TESTER_BUNDLE_ADMIN_URL="https://your-site.netlify.app/.netlify/functions/tester-bundle-admin"
node scripts/fetch-tester-bundle.js BUG-20260626102014-AAPL
```

## Output

The script saves the bundle to:

`debug-bundles/BUG-20260626102014-AAPL.json`

and prints the saved path.
