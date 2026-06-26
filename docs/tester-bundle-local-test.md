# Tester Bundle Local Test

Start Netlify local dev, then submit the saved sample payload:

```bash
curl -X POST http://localhost:8888/.netlify/functions/tester-bundle \
  -H "Content-Type: application/json" \
  -H "X-Pullback-Tester-Id: 11111111-1111-4111-8111-111111111111" \
  --data-binary @sample-diagnostics.json
```

Expected result:

- `200 OK`
- JSON response containing `ok`, `issueId`, `indexKey`, and `fullKey`
- `issueId` format `BUG-YYYYMMDDHHMMSS-TICKER`
