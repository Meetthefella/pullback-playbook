# Pullback Playbook

Pullback Playbook is a lightweight Quality Pullback workflow app for a UK-based retail trader. It stays focused on one job: move quickly from a ranked shortlist to setup review, chart upload, AI analysis, and trade planning without turning into a generic trading dashboard.

## What It Does

- Provider-backed ticker search suggestions
- Scanner-first shortlist with local ranking
- Persistent local watchlist and per-ticker notes
- Per-ticker chart upload with drag/drop and thumbnail preview
- Per-ticker OpenAI setup analysis through a serverless endpoint
- Prompt preview and saved response panel in each ticker card
- Risk helper based on the default GBP 4,000 account and GBP 40 max risk
- PWA-friendly static frontend

## Architecture

Frontend:
- `index.html`
- `styles.css`
- `app.js`
- `scanner-presets.json`

Serverless:
- `netlify/functions/analyse-setup.js`
- `netlify/functions/market-data.js`

Shared serverless market-data modules:
- `netlify/functions/lib/scan-config.js`
- `netlify/functions/lib/market-normalizers.js`
- `netlify/functions/lib/providers/fmp.js`
- `netlify/functions/lib/providers/marketdata.js`

Important:
- `netlify/functions/market-data.js` is the only active market-data implementation.
- The old root-level `market-data.js` has been removed.
- The frontend remains static and deployable on Netlify without a framework or database.

## Provider Architecture

The client talks only to `/api/market-data`. The Netlify function selects a provider adapter and returns a provider-neutral market snapshot.

Current provider adapters:
- `fmp`
  - active now
  - uses server-side `FMP_API_KEY`
- `marketdata`
  - active for quote + daily candle snapshots
  - uses server-side `MARKETDATA_API_KEY` or `MARKETDATA_TOKEN`
  - client-side symbol search is still disabled because the current adapter does not expose a stock-search route yet

Shared normalized snapshot shape:

```js
{
  symbol,
  name,
  exchange,
  currency,
  price,
  previousClose,
  sma20,
  sma50,
  sma200,
  rsi14,
  volume,
  avgVolume30,
  perf1w,
  perf1m,
  perf3m,
  perf6m,
  perfYtd,
  history,
  sourceProvider,
  warnings
}
```

The client still keeps a few compatibility aliases like `ticker`, `companyName`, and `avgVolume30d` so the existing scanner and card UI can stay simple during the refactor.

## Scan Limits

Scan limits are now provider-config driven instead of hard-coded in multiple places.

Current defaults:
- `fmp`
  - plan: `scanner`
  - max scan tickers: `10`
- `marketdata`
  - plan: `scanner`
  - max scan tickers: `10`
  - placeholder until provider wiring is completed

The config lives in:
- `netlify/functions/lib/scan-config.js`
- `app.js` client-side provider config mirror

If you want to increase the limit later, change the provider config rather than editing scan logic.

## Environment Variables

Set these on the serverless host:

- `OPENAI_API_KEY`
  - required
- `OPENAI_MODEL`
  - optional
  - defaults to the value used by the OpenAI function
- `FMP_API_KEY`
  - required for the active FMP market-data adapter
- `MARKETDATA_API_KEY`
  - optional
  - MarketData.app bearer token
- `MARKETDATA_TOKEN`
  - optional fallback alias
  - supported so you can keep either naming convention server-side

No provider secret or OpenAI secret is exposed in browser code.

## Local Development

### Frontend only

Open `index.html` directly, or serve the folder statically:

```bash
python -m http.server
```

This is enough for general UI work, but market-data scanning and in-app analysis need the Netlify functions.

### Full app with Netlify Functions

1. Set environment variables.

PowerShell:

```bash
set OPENAI_API_KEY=your_key_here
set OPENAI_MODEL=gpt-4o-mini
set FMP_API_KEY=your_fmp_key_here
set MARKETDATA_API_KEY=your_marketdata_app_token_here
```

Bash:

```bash
export OPENAI_API_KEY=your_key_here
export OPENAI_MODEL=gpt-4o-mini
export FMP_API_KEY=your_fmp_key_here
export MARKETDATA_API_KEY=your_marketdata_app_token_here
```

2. Run Netlify dev:

```bash
npx netlify dev
```

3. Open the local URL Netlify prints.

The frontend uses:
- `/api/analyse-setup` for AI analysis
- `/api/market-data` for provider-backed market data

## Deployment

### Single Netlify deployment

Recommended.

1. Deploy this repo to Netlify.
2. Set `OPENAI_API_KEY` and `FMP_API_KEY` in Netlify environment variables.
3. Optionally set `OPENAI_MODEL`.
4. Keep the repo root as the site publish directory and `netlify/functions` as the functions directory.

### GitHub Pages + separate serverless endpoint

If you want the frontend on GitHub Pages:

1. Deploy the static files to GitHub Pages.
2. Deploy the Netlify functions or equivalent serverless handlers separately.
3. Put the full AI endpoint URL into the app settings if needed.
4. Keep provider API keys on the serverless host only.

## Scanner / Client Notes

- The scanner now fetches in small async batches instead of persisting and re-rendering after every ticker.
- Market-data caching is provider-aware.
- Imported TradingView tickers remain reviewable even when provider history is unavailable.
- The app keeps the current UI and workflow intentionally stable while the market-data layer is cleaned up underneath it.

## TODO: MarketData.app

The following hook points are ready for the next step:

- `netlify/functions/lib/providers/marketdata.js`
  - add MarketData.app stock symbol search if you want provider-side search parity with FMP
  - enrich metadata like exchange/name if you want better card labels from this provider
- `netlify/functions/market-data.js`
  - set `MARKETDATA_API_KEY` or `MARKETDATA_TOKEN`
- `app.js`
  - the provider selector is already wired
  - the scanner and cache already pass `provider` and `plan` to the serverless endpoint

## Notes

- Chart screenshots are stored as local data URLs in browser storage. The frontend rejects images over 4 MB.
- Market data remains optional for the review workflow. If a provider cannot supply coverage or history, the ticker stays reviewable as `Manual Review`.
- The OpenAI key remains server-side only.
- The provider API keys remain server-side only.
- MarketData.app currently powers snapshots from delayed quotes plus daily candles. Name, exchange, and search coverage are still stronger on FMP.
- Console logs can be re-enabled at runtime with:
      - window.DEBUG_RENDER = true
      - window.DEBUG_ANALYSIS = true
      - window.DEBUG_LIFECYCLE = true
      - window.DEBUG_AUDIT = true