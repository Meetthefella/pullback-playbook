# Backend v2 rebuild boundary

The current browser UI remains the product skin. `app.js`, `resolver-core.js`, and the existing canonical modules are frozen as the legacy compatibility path; new decision rules must not be added there. See the controlling [charter](backend-v2-charter.md) and [roadmap](backend-v2-roadmap.md): v2 is shadow-only and its assessment rules are provisional.

`js/backend-v2/canonical-assessment.js` is the replacement authority core. It has no imports from the UI or legacy resolver and accepts only an explicit request:

```js
BackendV2.publish({
  ticker,
  snapshotId,
  market: {asOf, price, sma20, sma50, sma200, volume, averageVolume, marketStatus, currency},
  setup: {stabilising, bounce, buyerControl, confirmation},
  plan: {entry, stop, firstTarget},
  risk: {version, maxLossGbp}
});
```

It publishes one frozen assessment containing its snapshot identity, factual features (including availability), ordered gate results, state, lifecycle phase, plan, and versioned risk authority. Missing inputs are not inferred; they fail their relevant gate conservatively.

## Current boundary

The one-way adapter and publication shadow wiring are active. A second shadow-only capture records the original chart import and paired market facts. Consumer cutover is paused; the next work is collecting evidence and agreeing the playbook rules, not revising or promoting the v2 assessment.

`/.netlify/functions/live-input-journey` supplies a deterministic 200-bar OHLCV packet and a matching PNG with independent SHA-256 hashes and a shared run identity. The deployed-only Playwright journey imports the packet through the public Settings control, then uploads those PNG bytes through Review's actual `#reviewChartFile` input. It exposes public runtime diagnostics for the bar-derived canonical publication, the subsequently retained Review image, and the naturally attached shadow assessment. The image is evidence linked to the publication; it is not publication authority and must not create a replacement publication unless a normal production lifecycle explicitly does so.

This deployment supports the journey through configured FMP data only. If MarketData.app is selected, the UI and endpoint reject the request with an explicit configuration message rather than producing an unpaired packet with an unknown currency.

This path is not accepted merely because its endpoint or static test exists. It must be run against an explicitly supplied `PP_BASE_URL` that serves these changes; the test deliberately refuses to start or reuse a local server.

The first v2 invariant suite is `npm run test:backend-v2`.
