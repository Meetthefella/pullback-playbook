# Modularization Status

Current branch checkpoint:
- `modularize-appjs-attempt`
- stable checkpoint tag: `modularization-checkpoint-20260406-phase10-stable`

## Extracted bridge modules

These files are now loaded before `app.js` and expose globals consumed by the existing app bootstrap.

### `js/utils.js`
- `numericOrNull`
- `escapeHtml`
- `validateTickerSymbol`
- `normalizeTicker`
- `countTradingDaysBetween`
- `fmtPrice`
- `todayIsoDate`
- `businessDaysFromNow`

### `js/date-utils.js`
- `isoDateAddDays`
- `isoDateMonthBounds`
- `isHoliday`
- `isTradingDay`
- `formatLocalTimestamp`
- `tradingDaysFrom`

### `js/ticker-utils.js`
- `normalizeScanType`
- `parseImportedTickerEntries`
- `parseTickersDetailed`
- `parseTickers`
- `uniqueTickers`

### `js/storage.js`
- `safeJsonParse`
- `safeStorageGet`
- `safeStorageSet`
- `safeStorageRemove`
- `readMarketCache`
- `writeMarketCache`

### `js/state.js`
- `createAppState`

### `js/records.js`
- `createBaseTickerRecord`
- `normalizeTickerRecord`
- `getTickerRecord`
- `upsertTickerRecord`

### `js/plan-math.js`
- `normalizeQuoteCurrency`
- `convertQuoteValueToGbp`
- `evaluateRiskFit`
- `evaluateCapitalFit`
- `evaluateRewardRisk`
- `deriveAffordability`

### `js/tradeability.js`
- `riskStatusLabel`
- `rrBandForValue`
- `rrStateLabel`
- `rrStateShortLabel`
- `rrStateClass`
- `planQualityForRr`
- `tradeabilityLabel`
- `deriveTradeability`

### `js/watchlist-utils.js`
- `watchlistActionSummary`
- `watchlistReasonSummary`
- `normalizeStoredPlanSnapshot`
- `storedPlanState`
- `planSnapshotFromDisplayedPlan`
- `planSnapshotSummary`
- `planSnapshotsEqual`
- `recomputeAttemptedForSource`
- `determineRecomputeResult`

## What still lives in `app.js`

The following remain in `app.js` and should stay there until a later phase:
- resolver logic
- lifecycle logic
- watchlist logic
- scanner/review/watchlist rendering
- event binding
- bootstrap/init
- most plan/domain mutation helpers

## Current strategy

The project is using a bridge-first modularization approach:
- extract one narrow seam at a time
- keep `app.js` as the orchestration layer
- avoid switching to `type="module"` until much later, if at all
- push and deploy after every stable phase

## Recommended next steps

If modularization continues, prefer this order:
1. Review wrapper functions in `app.js` and trim any dead legacy bodies that remain after bridge returns.
2. Keep resolver, lifecycle, and render logic in `app.js` until there is stronger regression coverage.
3. Prefer cleanup and seam review over another extraction pass right away.

## Do not do next

These are higher-risk jumps and should not be the next step:
- moving resolver + lifecycle together
- moving renderers before domain seams are stable
- changing event binding during the same phase as domain extraction
- switching boot order and module system at the same time
