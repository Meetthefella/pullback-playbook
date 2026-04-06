# Modularization Status

Current branch checkpoint:
- `modularize-appjs-attempt`
- stable checkpoint tag: `modularization-checkpoint-20260406-phase7-stable`

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
1. Review nearby record helpers for a narrow follow-up seam.
2. Clean up top-level `app.js` bridge imports further if needed.
3. Avoid resolver/render extraction until record/plan seams are clearer.

## Do not do next

These are higher-risk jumps and should not be the next step:
- moving resolver + lifecycle together
- moving renderers before domain seams are stable
- changing event binding during the same phase as domain extraction
- switching boot order and module system at the same time
