const $ = id => document.getElementById(id);
const on = (id, evt, fn) => { const el = $(id); if (el) el.addEventListener(evt, fn); };
const click = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
const key = 'pullbackPlaybookV3';
const liteKey = 'pullbackPlaybookV3Lite';
const settingsKey = 'pullbackPlaybookSettingsV1';
const recordsLiteKey = 'pullbackPlaybookRecordsLiteV1';
const startupTraceKey = 'pullbackPlaybookStartupTraceV1';
const APP_VERSION = 'v4.4.8';
const defaultAiEndpoint = '/api/analyse-setup';
const defaultMarketDataEndpoint = '/api/market-data';
const defaultTrackedStateEndpoint = '/api/tracked-state';
const defaultPushConfigEndpoint = '/api/push-config';
const defaultPushSubscribeEndpoint = '/api/push-subscribe';
const marketCacheKey = 'pullbackPlaybookMarketCacheV1';
const savedScannerUniverseKey = 'pp_scanner_universe_saved';
const savedScannerUniverseMetaKey = 'pp_scanner_universe_saved_meta';
const DEFAULT_PROVIDER = 'fmp';
const DEFAULT_API_PLAN = 'scanner';

// ---------------------------------------------------------------------------
// Bridge modules extracted from app.js.
// Keep these grouped here so later modularization phases have one clear seam.
// ---------------------------------------------------------------------------
if(!window.AppUtils) throw new Error('AppUtils failed to load.');
if(!window.AppDateUtils) throw new Error('AppDateUtils failed to load.');
if(!window.AppTickerUtils) throw new Error('AppTickerUtils failed to load.');
if(!window.AppStorage) throw new Error('AppStorage failed to load.');
if(!window.AppStateBridge) throw new Error('AppStateBridge failed to load.');
if(!window.AppRecords) throw new Error('AppRecords failed to load.');
if(!window.PlanMath) throw new Error('PlanMath failed to load.');
if(!window.Tradeability) throw new Error('Tradeability failed to load.');
if(!window.WatchlistUtils) throw new Error('WatchlistUtils failed to load.');
if(!window.WatchlistGuidance) throw new Error('WatchlistGuidance failed to load.');
if(!window.ResolverSupport) throw new Error('ResolverSupport failed to load.');
if(!window.ResolverCore) throw new Error('ResolverCore failed to load.');
if(!window.ResolverPresentation) throw new Error('ResolverPresentation failed to load.');
if(!window.ScannerView) throw new Error('ScannerView failed to load.');
if(!window.ScannerDebug) throw new Error('ScannerDebug failed to load.');
if(!window.ScannerCardShell) throw new Error('ScannerCardShell failed to load.');
if(!window.ScannerInteractionState) throw new Error('ScannerInteractionState failed to load.');
if(!window.ScannerResultsSupport) throw new Error('ScannerResultsSupport failed to load.');
if(!window.ReviewPresentation) throw new Error('ReviewPresentation failed to load.');
const {
  numericOrNull,
  escapeHtml,
  validateTickerSymbol,
  normalizeTicker,
  countTradingDaysBetween,
  fmtPrice,
  todayIsoDate,
  businessDaysFromNow
} = window.AppUtils;
const {
  isoDateAddDays,
  isoDateMonthBounds,
  isHoliday,
  isTradingDay,
  formatLocalTimestamp,
  tradingDaysFrom
} = window.AppDateUtils;
const {
  normalizeScanType,
  parseImportedTickerEntries,
  parseTickersDetailed,
  parseTickers,
  uniqueTickers
} = window.AppTickerUtils;
const {
  safeJsonParse,
  safeStorageGet,
  safeStorageSet,
  safeStorageRemove,
  readMarketCache,
  writeMarketCache
} = window.AppStorage;
const {createAppState} = window.AppStateBridge;
const {
  createBaseTickerRecord,
  normalizeTickerRecord: normalizeTickerRecordImpl,
  getTickerRecord: getTickerRecordImpl,
  upsertTickerRecord: upsertTickerRecordImpl
} = window.AppRecords;
const {
  normalizeQuoteCurrency: normalizeQuoteCurrencyImpl,
  convertQuoteValueToGbp: convertQuoteValueToGbpImpl,
  evaluateRiskFit: evaluateRiskFitImpl,
  classifyCapitalUsage: classifyCapitalUsageImpl,
  evaluateCapitalFit: evaluateCapitalFitImpl,
  evaluateRewardRisk: evaluateRewardRiskImpl,
  deriveAffordability: deriveAffordabilityImpl
} = window.PlanMath;
const {
  riskStatusLabel: riskStatusLabelImpl,
  rrBandForValue: rrBandForValueImpl,
  rrStateLabel: rrStateLabelImpl,
  rrStateShortLabel: rrStateShortLabelImpl,
  rrStateClass: rrStateClassImpl,
  planQualityForRr: planQualityForRrImpl,
  tradeabilityLabel: tradeabilityLabelImpl,
  deriveTradeability: deriveTradeabilityImpl
} = window.Tradeability;
const {
  watchlistActionSummary: watchlistActionSummaryImpl,
  watchlistReasonSummary: watchlistReasonSummaryImpl,
  normalizeStoredPlanSnapshot: normalizeStoredPlanSnapshotImpl,
  storedPlanState: storedPlanStateImpl,
  planSnapshotFromDisplayedPlan: planSnapshotFromDisplayedPlanImpl,
  planSnapshotSummary: planSnapshotSummaryImpl,
  planSnapshotsEqual: planSnapshotsEqualImpl,
  recomputeAttemptedForSource: recomputeAttemptedForSourceImpl,
  determineRecomputeResult: determineRecomputeResultImpl
} = window.WatchlistUtils;
const {
  watchlistLifecycleChangeType: watchlistLifecycleChangeTypeImpl,
  watchlistNextStateGuidance: watchlistNextStateGuidanceImpl
} = window.WatchlistGuidance;
const {
  baseVerdictFromResolvedContract: baseVerdictFromResolvedContractImpl,
  resolverSeedVerdictForRecord: resolverSeedVerdictForRecordImpl,
  finalVerdictForRecord: finalVerdictForRecordImpl,
  displayStageForRecord: displayStageForRecordImpl,
  reviewHeaderVerdictForRecord: reviewHeaderVerdictForRecordImpl
} = window.ResolverSupport;
const {
  normalizeGlobalVerdictKey: normalizeGlobalVerdictKeyImpl,
  normalizeVerdict: normalizeVerdictImpl,
  globalVerdictLabel: globalVerdictLabelImpl,
  getTone: getToneImpl,
  getBucket: getBucketImpl,
  getBadge: getBadgeImpl,
  getActions: getActionsImpl,
  resolveGlobalVerdict: resolveGlobalVerdictImpl
} = window.ResolverCore;
const {
  primaryShortlistStatusChip: primaryShortlistStatusChipImpl,
  resolveVisualState: resolveVisualStateImpl,
  resolveGlobalVisualState: resolveGlobalVisualStateImpl,
  resolveEmojiPresentation: resolveEmojiPresentationImpl
} = window.ResolverPresentation;
const {
  currentRrThreshold: currentRrThresholdImpl,
  getRankedDisplayBucket: getRankedDisplayBucketImpl,
  getFinalBucketFromView: getFinalBucketFromViewImpl,
  rrCategoryForView: rrCategoryForViewImpl,
  finalStructureQualityForView: finalStructureQualityForViewImpl,
  getFinalClassification: getFinalClassificationImpl,
  buildFinalSetupView: buildFinalSetupViewImpl,
  classifyRankedRecord: classifyRankedRecordImpl,
  classifyRankedView: classifyRankedViewImpl,
  buildRankedBuckets: buildRankedBucketsImpl,
  buildRankedBucketsFromViews: buildRankedBucketsFromViewsImpl,
  rankedDecisionBucketForView: rankedDecisionBucketForViewImpl,
  rankedVisibleSectionForView: rankedVisibleSectionForViewImpl,
  resultReasonForRecord: resultReasonForRecordImpl,
  resultReasonForView: resultReasonForViewImpl,
  resultSupportLineForRecord: resultSupportLineForRecordImpl,
  resultSupportLineForView: resultSupportLineForViewImpl,
  isFilteredResultRecord: isFilteredResultRecordImpl,
  shortlistStructureBadgeForView: shortlistStructureBadgeForViewImpl,
  readinessLabelForView: readinessLabelForViewImpl
} = window.ScannerView;
const {
  resolveScannerStateWithTrace: resolveScannerStateWithTraceImpl,
  resolveScannerState: resolveScannerStateImpl,
  renderScannerDecisionTraceContent: renderScannerDecisionTraceContentImpl,
  renderScannerDetailsContent: renderScannerDetailsContentImpl,
  renderDebugKeyValueGrid: renderDebugKeyValueGridImpl,
  renderDebugSectionMarkup: renderDebugSectionMarkupImpl,
  renderAdvancedDebugMarkup: renderAdvancedDebugMarkupImpl,
  renderScannerVisualDebugContent: renderScannerVisualDebugContentImpl
} = window.ScannerDebug;
const {
  renderScanCardSecondaryUi: renderScanCardSecondaryUiImpl,
  getScannerSubmenuContent: getScannerSubmenuContentImpl,
  renderCompactResultCardFromView: renderCompactResultCardFromViewImpl,
  scanCardSummaryForView: scanCardSummaryForViewImpl,
  scanCardPrimaryActionLabel: scanCardPrimaryActionLabelImpl
} = window.ScannerCardShell;
const {
  suppressNextScannerActivation: suppressNextScannerActivationImpl,
  allowScannerActivation: allowScannerActivationImpl,
  setScannerCardClickTrace: setScannerCardClickTraceImpl,
  scannerCardClickTraceForTicker: scannerCardClickTraceForTickerImpl,
  scannerCardClickTraceHistoryForTicker: scannerCardClickTraceHistoryForTickerImpl,
  setSwipeFeedback: setSwipeFeedbackImpl,
  getSwipeFeedback: getSwipeFeedbackImpl,
  recordGestureDebug: recordGestureDebugImpl
} = window.ScannerInteractionState;
const {
  groupScannerViewsBySection: groupScannerViewsBySectionImpl,
  contextualResultEmptyState: contextualResultEmptyStateImpl,
  scannerResultSections: scannerResultSectionsImpl,
  buildScannerSectionShell: buildScannerSectionShellImpl
} = window.ScannerResultsSupport;
const {
  plannerToneClass: plannerToneClassImpl,
  capitalFitMetricText: capitalFitMetricTextImpl,
  renderTradeStatusMarkup: renderTradeStatusMarkupImpl,
  tradeStatusMetricText: tradeStatusMetricTextImpl
} = window.ReviewPresentation;

// ---------------------------------------------------------------------------
// End extracted bridge bindings. App.js remains the orchestrator for now.
// ---------------------------------------------------------------------------

const checklistIds = ['trendStrong','above50','above200','ma50gt200','near20','near50','stabilising','bounce','volume','entryDefined','stopDefined','targetDefined'];
const checklistLabels = {
  trendStrong:'Strong uptrend',
  above50:'Above 50 MA',
  above200:'Above 200 MA',
  ma50gt200:'50 MA above 200 MA',
  near20:'Near 20 MA',
  near50:'Near 50 MA',
  stabilising:'Stabilising',
  bounce:'Bounce candle',
  volume:'Volume supportive',
  entryDefined:'Entry defined',
  stopDefined:'Stop defined',
  targetDefined:'Target defined'
};

const DEFAULT_STATE = {
  accountSize:4000,
  maxRisk:40,
  userRiskPerTrade:40,
  riskPercent:0.01,
  maxLossOverride:'',
  wholeSharesOnly:true,
  marketStatus:'S&P above 50 MA',
  marketStatusMode:'auto',
  marketStatusAutoUpdatedAt:'',
  setupType:'',
  listName:"Today's Scan",
  universeMode:'core8',
  tickers:[],
  recentTickers:[],
  tickerRecords:{},
  backendTrackedVersions:{},
  backendLocalTrackedTickers:[],
  lastAlertsSeenAt:'',
  dismissedAlertIds:[],
  dismissedFocusTickers:[],
  dismissedFocusCycle:'',
  activeQueueClearedCycle:'',
  activeQueueClearedTickers:[],
  activeQueueManualTickers:[],
  activeQueueLastRebuiltCycle:'',
  showExpiredWatchlist:false,
  watchlist:[],
  scannerResults:[],
  cards:[],
  tradeDiary:[],
  apiKey:'',
  dataProvider:DEFAULT_PROVIDER,
  apiPlan:DEFAULT_API_PLAN,
  aiEndpoint:defaultAiEndpoint,
  marketDataEndpoint:defaultMarketDataEndpoint,
  symbolMeta:{},
  scannerPresetName:'Quality Pullback Scanner Core',
  scannerDebug:[]
};

function createDefaultState(){
  return safeJsonParse(JSON.stringify(DEFAULT_STATE), DEFAULT_STATE);
}

const {state, uiState} = createAppState({
  defaultState:DEFAULT_STATE,
  safeJsonParse
});
uiState.scanCardMenu = {ticker:'', menuOpen:false, activeSubmenu:null};
uiState.scanCardMenuGuard = {};
uiState.scannerCardClickTrace = uiState.scannerCardClickTrace && typeof uiState.scannerCardClickTrace === 'object'
  ? uiState.scannerCardClickTrace
  : {};
uiState.scannerCardClickTraceHistory = uiState.scannerCardClickTraceHistory && typeof uiState.scannerCardClickTraceHistory === 'object'
  ? uiState.scannerCardClickTraceHistory
  : {};
uiState.watchlistLiveRefreshPending = uiState.watchlistLiveRefreshPending && typeof uiState.watchlistLiveRefreshPending === 'object'
  ? uiState.watchlistLiveRefreshPending
  : {};
uiState.reviewCapitalSimulation = uiState.reviewCapitalSimulation && typeof uiState.reviewCapitalSimulation === 'object'
  ? uiState.reviewCapitalSimulation
  : {ticker:'', usagePercent:null};
uiState.riskQuickOpen = !!uiState.riskQuickOpen;
const marketDataCache = new Map();
const fxRateCache = new Map();
const fxRatePending = new Map();
const MAX_CHART_BYTES = 4 * 1024 * 1024;
const ANALYSIS_TIMEOUT_MS = 45000;
const MARKET_CACHE_TTL_MS = 15 * 60 * 1000;
const MARKET_STATUS_STALE_MS = MARKET_CACHE_TTL_MS;
const FX_RATE_CACHE_TTL_MS = 30 * 60 * 1000;
const SEARCH_DEBOUNCE_MS = 250;
const DEFAULT_WATCH_TRADING_DAYS = 3;
const EXTENDED_WATCH_TRADING_DAYS = 5;
const WATCHLIST_EXPIRY_TRADING_DAYS = 5;
const REVIEW_EXPIRY_TRADING_DAYS = 5;
const PLAN_EXPIRY_TRADING_DAYS = 3;
const WATCHLIST_LIFECYCLE_INTERVAL_MS = 5 * 60 * 1000;
const WATCHLIST_LIFECYCLE_FRESHNESS_MS = 24 * 60 * 60 * 1000;
const MARKET_STATUS_REFRESH_MS = 60 * 1000;
const MARKET_TIMEZONE = 'America/New_York';
const US_MARKET_CALENDAR_CONFIG = {
  2026:{
    holidays:[
      '2026-01-01',
      '2026-01-19',
      '2026-02-16',
      '2026-04-03',
      '2026-05-25',
      '2026-06-19',
      '2026-07-03',
      '2026-09-07',
      '2026-11-26',
      '2026-12-25'
    ],
    earlyCloseDays:{
      '2026-11-27':'13:00',
      '2026-12-24':'13:00'
    }
  }
};
const DIARY_SETUP_TAG_OPTIONS = ['20MA bounce', '50MA reclaim', 'first pullback', 'post-earnings continuation', 'weak-market exception', 'countertrend avoid'];
const DIARY_MISTAKE_TAG_OPTIONS = ['early entry', 'chased breakout', 'ignored weak market', 'stop too tight', 'stop moved', 'oversize position', 'took subpar setup', 'sold too early', 'held too long'];
const DIARY_LESSON_TAG_OPTIONS = ['wait for bounce confirmation', '50MA setups need extra patience', 'weak tape needs stricter filtering', 'best setups come from strong RS names', 'avoid loose structure under 20MA'];
const ALERT_PRIORITY = {
  closed:1,
  entered:2,
  became_ready:3,
  plan_near_expiry:4,
  needs_review:5,
  regime_warning:6,
  watchlist_progressed:7,
  expired:8
};
const APP_FETCH_TIMEOUT_MS = 12000;
const BACKEND_REVIEW_POLL_MS = 10 * 60 * 1000;
const MARKET_CACHE_SCHEMA_VERSION = 3;
const SCAN_BATCH_SIZE = 4;
const TESSERACT_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
const OCR_STOPWORDS = new Set(['OPEN','HIGH','LOW','CLOSE','VOLUME','VOL','CHANGE','PRICE','PERCENT','PCT','CHG','DATE','TIME','WATCH','LIST','SCREEN','SCREENER','TRADINGVIEW','SYMBOL','STOCK','STOCKS','NAME','LAST','USD','USDT','BUY','SELL','LONG','SHORT','NYSE','NASDAQ','AMEX','LSE','TOTAL','AVG','RSI','SMA','EMA']);
const DEFAULT_AUTO_UNIVERSE = [
  'NVDA','MSFT','AMZN','AMAT','CAT','HWM','TSLA','UNP'
];
const scannerPresetFallback = [{
  name:'Quality Pullback Scanner Core',
  universe:['Curated Core 8 fallback universe', 'TradingView Only when user tickers are present', 'Combined mode merges TradingView tickers with Core 8'],
  rules:[]
}];
const tradingViewConfig = {
  defaultExchange:'NASDAQ',
  suffixMap:{
    '.L':'LSE'
  },
  symbolOverrides:{
    // Example:
    // 'TSCO':'LSE:TSCO',
    // 'VOD.L':'LSE:VOD'
  }
};
const providerConfigs = {
  fmp:{
    id:'fmp',
    label:'Financial Modeling Prep',
    plan:'scanner',
    maxScanTickers:null,
    supportsSearch:true,
    supportsDailyHistory:true,
    supportsIntraday:false,
    notes:'Default free-tier profile.'
  },
  marketdata:{
    id:'marketdata',
    label:'MarketData.app',
    plan:'scanner',
    maxScanTickers:null,
    supportsSearch:false,
    supportsDailyHistory:true,
    supportsIntraday:true,
    notes:'TODO: wire MarketData.app credentials and endpoints.'
  }
};
let scannerPresetPromise = null;
let suggestionTimer = null;
let suggestionRequestToken = 0;
let tesseractLoaderPromise = null;
let backendSyncTimer = null;
let backendRefreshTimer = null;
let pushConfigPromise = null;
let watchlistLifecycleTimer = null;
let watchlistLifecycleListenersBound = false;
let marketStatusTimer = null;
let riskQuickRefreshRaf = 0;

function formatGbp(value){
  return `GBP ${Number(value || 0).toLocaleString()}`;
}

function formatPound(value){
  const amount = Number(value || 0);
  if(!Number.isFinite(amount)) return '£0';
  return `£${amount.toLocaleString(undefined, {maximumFractionDigits:2})}`;
}

function currentSetupType(){
  return normalizeScanType(state.setupType) || 'unknown';
}

function activeReviewTicker(){
  const selected = normalizeTicker(($('selectedTicker') && $('selectedTicker').value) || '');
  return selected || normalizeTicker(uiState.activeReviewTicker || '');
}

function setActiveReviewTicker(ticker){
  const symbol = normalizeTicker(ticker);
  uiState.activeReviewTicker = symbol;
  if($('selectedTicker')) $('selectedTicker').value = symbol;
  Object.values(state.tickerRecords || {}).forEach(record => {
    if(record && record.review) record.review.cardOpen = record.ticker === symbol;
  });
}

function currentMaxLoss(){
  const accountSize = numericOrNull(state.accountSize);
  const riskPercent = numericOrNull(state.riskPercent);
  const override = numericOrNull(state.maxLossOverride);
  const persisted = numericOrNull(state.userRiskPerTrade);
  let resolvedRisk = 0;
  if(Number.isFinite(override) && override > 0){
    resolvedRisk = override;
  }else if(Number.isFinite(accountSize) && Number.isFinite(riskPercent) && accountSize > 0 && riskPercent > 0){
    resolvedRisk = accountSize * riskPercent;
  }else if(Number.isFinite(persisted) && persisted > 0){
    resolvedRisk = persisted;
  }else{
    resolvedRisk = numericOrNull(state.maxRisk) || 0;
  }
  state.userRiskPerTrade = resolvedRisk > 0 ? resolvedRisk : 0;
  return state.userRiskPerTrade;
}

function riskSettingsValid(){
  return currentMaxLoss() > 0;
}

function currentRiskSettings(){
  return {
    account_size:numericOrNull(state.accountSize) || 0,
    risk_percent:numericOrNull(state.riskPercent) || 0,
    max_loss_override:numericOrNull(state.userRiskPerTrade || currentMaxLoss()),
    whole_shares_only:state.wholeSharesOnly !== false
  };
}

function currentAccountSizeGbp(){
  return numericOrNull(state.accountSize) || 0;
}

function normalizeQuoteCurrency(value){
  return normalizeQuoteCurrencyImpl(value);
}

function convertQuoteValueToGbp(value, quoteCurrency){
  return convertQuoteValueToGbpImpl(value, quoteCurrency, {
    numericOrNull,
    fxRateCache,
    isFreshTimestamp,
    fxRateCacheTtlMs:FX_RATE_CACHE_TTL_MS
  });
}

function evaluateRiskFit({entry, stop, account_size, risk_percent, max_loss_override, whole_shares_only}){
  return evaluateRiskFitImpl({entry, stop, account_size, risk_percent, max_loss_override, whole_shares_only}, {
    numericOrNull
  });
}

function evaluateCapitalFit({entry, position_size, account_size_gbp, quote_currency}){
  return evaluateCapitalFitImpl({entry, position_size, account_size_gbp, quote_currency}, {
    numericOrNull,
    convertQuoteValueToGbp,
    classifyCapitalUsage: ({position_cost_gbp, account_size_gbp}) => classifyCapitalUsage({position_cost_gbp, account_size_gbp})
  });
}

function evaluateRewardRisk(entry, stop, firstTarget){
  return evaluateRewardRiskImpl(entry, stop, firstTarget, { numericOrNull });
}

function classifyCapitalUsage({position_cost_gbp, account_size_gbp}){
  return classifyCapitalUsageImpl({position_cost_gbp, account_size_gbp}, { numericOrNull });
}

function persistState(){
  const fullSaved = safeStorageSet(key, state);
  if(fullSaved) return;

  const settingsSaved = safeStorageSet(settingsKey, buildSettingsPersistedState(state));
  const recordsSaved = safeStorageSet(recordsLiteKey, buildRecordsLitePersistedState(state));
  const liteSaved = safeStorageSet(liteKey, buildLitePersistedState(state));

  if(!liteSaved && !settingsSaved && !recordsSaved){
    console.warn('STATE_PERSIST_FAILED', {key, liteKey, settingsKey, recordsLiteKey});
  }else{
    console.warn('STATE_PERSIST_FALLBACK_ONLY', {
      key,
      liteKey,
      settingsKey,
      recordsLiteKey,
      liteSaved,
      settingsSaved,
      recordsSaved
    });
  }
}

function inspectStorageKey(storageKey){
  try{
    const raw = localStorage.getItem(storageKey);
    return {
      present:raw != null,
      bytes:raw == null ? 0 : String(raw).length,
      error:''
    };
  }catch(error){
    return {
      present:false,
      bytes:0,
      error:error && error.message ? String(error.message) : 'read_failed'
    };
  }
}

function countCanonicalWatchlistRecords(recordsMap){
  return Object.values(normalizeTickerRecordsMap(recordsMap || {}))
    .filter(record => record && record.watchlist && record.watchlist.inWatchlist)
    .length;
}

function summarizeStartupTrace(trace){
  const info = trace && typeof trace === 'object' ? trace : {};
  const watchlist = Number.isFinite(Number(info.postSyncWatchlistCount)) ? Number(info.postSyncWatchlistCount) : 0;
  const market = String(info.restoredMarketStatus || 'n/a');
  const mode = String(info.restoredUniverseMode || 'n/a');
  const setup = String(info.restoredSetupType || 'Unknown');
  return `Startup restore: watchlist ${watchlist} | market ${market} | mode ${mode} | setup ${setup}`;
}

function buildSettingsPersistedState(sourceState){
  const baseState = sourceState && typeof sourceState === 'object' ? sourceState : {};
  return {
    accountSize:baseState.accountSize,
    maxRisk:baseState.maxRisk,
    userRiskPerTrade:baseState.userRiskPerTrade,
    riskPercent:baseState.riskPercent,
    maxLossOverride:baseState.maxLossOverride,
    wholeSharesOnly:baseState.wholeSharesOnly,
    marketStatus:baseState.marketStatus,
    marketStatusMode:baseState.marketStatusMode,
    setupType:baseState.setupType,
    listName:baseState.listName,
    universeMode:baseState.universeMode,
    tickers:Array.isArray(baseState.tickers) ? [...baseState.tickers] : [],
    recentTickers:Array.isArray(baseState.recentTickers) ? [...baseState.recentTickers] : [],
    dataProvider:baseState.dataProvider,
    apiPlan:baseState.apiPlan,
    aiEndpoint:baseState.aiEndpoint,
    marketDataEndpoint:baseState.marketDataEndpoint,
    showExpiredWatchlist:!!baseState.showExpiredWatchlist
  };
}

function buildRecordsLitePersistedState(sourceState){
  const baseState = sourceState && typeof sourceState === 'object' ? sourceState : {};
  const liteTickerRecords = Object.fromEntries(
    Object.entries(normalizeTickerRecordsMap(baseState.tickerRecords || {})).map(([ticker, record]) => {
      const item = normalizeTickerRecord(record);
      return [ticker, {
        ticker:item.ticker,
        marketData:{
          price:item.marketData.price,
          asOf:item.marketData.asOf,
          source:item.marketData.source,
          ma20:item.marketData.ma20,
          ma50:item.marketData.ma50,
          ma200:item.marketData.ma200,
          rsi:item.marketData.rsi,
          avgVolume:item.marketData.avgVolume,
          volume:item.marketData.volume,
          perf1w:item.marketData.perf1w,
          perf1m:item.marketData.perf1m,
          perf3m:item.marketData.perf3m,
          perf6m:item.marketData.perf6m,
          perfYtd:item.marketData.perfYtd,
          currency:item.marketData.currency
        },
        scan:{
          scanType:item.scan.scanType,
          scanSetupType:item.scan.scanSetupType,
          setupOrigin:item.scan.setupOrigin,
          score:item.scan.score,
          verdict:item.scan.verdict,
          reasons:Array.isArray(item.scan.reasons) ? [...item.scan.reasons] : [],
          flags:item.scan.flags && typeof item.scan.flags === 'object' ? cloneData(item.scan.flags, {}) : {},
          summary:item.scan.summary,
          riskStatus:item.scan.riskStatus,
          trendStatus:item.scan.trendStatus,
          pullbackStatus:item.scan.pullbackStatus,
          pullbackType:item.scan.pullbackType,
          lastScannedAt:item.scan.lastScannedAt,
          updatedAt:item.scan.updatedAt
        },
        review:{
          notes:item.review.notes,
          savedVerdict:item.review.savedVerdict,
          savedSummary:item.review.savedSummary,
          savedScore:item.review.savedScore,
          lastReviewedAt:item.review.lastReviewedAt,
          manualReview:item.review.manualReview && typeof item.review.manualReview === 'object' ? cloneData(item.review.manualReview, null) : null,
          cardOpen:!!item.review.cardOpen,
          source:item.review.source
        },
        plan:{
          hasValidPlan:item.plan.hasValidPlan,
          entry:item.plan.entry,
          stop:item.plan.stop,
          firstTarget:item.plan.firstTarget,
          exitMode:item.plan.exitMode,
          targetReviewState:item.plan.targetReviewState,
          targetActionRecommendation:item.plan.targetActionRecommendation,
          targetAlert:item.plan.targetAlert && typeof item.plan.targetAlert === 'object' ? cloneData(item.plan.targetAlert, {}) : {},
          riskPerShare:item.plan.riskPerShare,
          rewardPerShare:item.plan.rewardPerShare,
          plannedRR:item.plan.plannedRR,
          positionSize:item.plan.positionSize,
          positionCost:item.plan.positionCost,
          positionCostGbp:item.plan.positionCostGbp,
          quoteCurrency:item.plan.quoteCurrency,
          maxLoss:item.plan.maxLoss,
          riskStatus:item.plan.riskStatus,
          capitalFit:item.plan.capitalFit,
          tradeability:item.plan.tradeability,
          capitalNote:item.plan.capitalNote,
          affordability:item.plan.affordability,
          status:item.plan.status,
          triggerState:item.plan.triggerState,
          planValidationState:item.plan.planValidationState,
          needsReplan:item.plan.needsReplan,
          missedState:item.plan.missedState,
          invalidatedState:item.plan.invalidatedState,
          firstTargetTooClose:item.plan.firstTargetTooClose,
          lastPlannedAt:item.plan.lastPlannedAt,
          source:item.plan.source
        },
        setup:{
          rawScore:item.setup.rawScore,
          score:item.setup.score,
          convictionTier:item.setup.convictionTier,
          practicalSizeFlag:item.setup.practicalSizeFlag,
          verdict:item.setup.verdict,
          reasons:Array.isArray(item.setup.reasons) ? [...item.setup.reasons] : [],
          marketCaution:item.setup.marketCaution
        },
        watchlist:item.watchlist && typeof item.watchlist === 'object' ? cloneData(item.watchlist, {}) : {},
        lifecycle:item.lifecycle && typeof item.lifecycle === 'object' ? cloneData(item.lifecycle, {}) : {},
        diary:item.diary && typeof item.diary === 'object' ? cloneData(item.diary, {}) : {},
        meta:item.meta && typeof item.meta === 'object' ? cloneData(item.meta, {}) : {}
      }];
    })
  );
  return {
    tickerRecords:liteTickerRecords,
    watchlist:Array.isArray(baseState.watchlist) ? cloneData(baseState.watchlist, []) : [],
    tradeDiary:Array.isArray(baseState.tradeDiary) ? cloneData(baseState.tradeDiary, []) : [],
    symbolMeta:baseState.symbolMeta && typeof baseState.symbolMeta === 'object' ? cloneData(baseState.symbolMeta, {}) : {}
  };
}

function buildLitePersistedState(sourceState){
  const baseState = sourceState && typeof sourceState === 'object' ? sourceState : {};
  const liteTickerRecords = Object.fromEntries(
    Object.entries(normalizeTickerRecordsMap(baseState.tickerRecords || {})).map(([ticker, record]) => {
      const item = normalizeTickerRecord(record);
      return [ticker, {
        ...item,
        review:{
          ...item.review,
          chartAvailable:false,
          chartRef:null,
          analysisState:{
            ...item.review.analysisState,
            raw:'',
            normalized:null,
            prompt:'',
            error:''
          },
          aiAnalysisRaw:'',
          normalizedAnalysis:null,
          lastPrompt:'',
          lastError:''
        }
      }];
    })
  );
  return {
    accountSize:baseState.accountSize,
    maxRisk:baseState.maxRisk,
    userRiskPerTrade:baseState.userRiskPerTrade,
    riskPercent:baseState.riskPercent,
    maxLossOverride:baseState.maxLossOverride,
    wholeSharesOnly:baseState.wholeSharesOnly,
    marketStatus:baseState.marketStatus,
    setupType:baseState.setupType,
    listName:baseState.listName,
    universeMode:baseState.universeMode,
    tickers:Array.isArray(baseState.tickers) ? [...baseState.tickers] : [],
    recentTickers:Array.isArray(baseState.recentTickers) ? [...baseState.recentTickers] : [],
    tickerRecords:liteTickerRecords,
    backendTrackedVersions:baseState.backendTrackedVersions && typeof baseState.backendTrackedVersions === 'object' ? {...baseState.backendTrackedVersions} : {},
    backendLocalTrackedTickers:Array.isArray(baseState.backendLocalTrackedTickers) ? [...baseState.backendLocalTrackedTickers] : [],
    lastAlertsSeenAt:baseState.lastAlertsSeenAt,
    dismissedAlertIds:Array.isArray(baseState.dismissedAlertIds) ? [...baseState.dismissedAlertIds] : [],
    dismissedFocusTickers:Array.isArray(baseState.dismissedFocusTickers) ? [...baseState.dismissedFocusTickers] : [],
    dismissedFocusCycle:baseState.dismissedFocusCycle,
    activeQueueClearedCycle:baseState.activeQueueClearedCycle,
    activeQueueClearedTickers:Array.isArray(baseState.activeQueueClearedTickers) ? [...baseState.activeQueueClearedTickers] : [],
    activeQueueManualTickers:Array.isArray(baseState.activeQueueManualTickers) ? [...baseState.activeQueueManualTickers] : [],
    activeQueueLastRebuiltCycle:baseState.activeQueueLastRebuiltCycle,
    watchlist:Array.isArray(baseState.watchlist) ? cloneData(baseState.watchlist, []) : [],
    tradeDiary:Array.isArray(baseState.tradeDiary) ? cloneData(baseState.tradeDiary, []) : [],
    symbolMeta:baseState.symbolMeta && typeof baseState.symbolMeta === 'object' ? cloneData(baseState.symbolMeta, {}) : {},
    showExpiredWatchlist:!!baseState.showExpiredWatchlist,
    dataProvider:baseState.dataProvider,
    apiPlan:baseState.apiPlan,
    aiEndpoint:baseState.aiEndpoint,
    marketDataEndpoint:baseState.marketDataEndpoint
  };
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = APP_FETCH_TIMEOUT_MS, maxAttempts = 2){
  for(let attempt = 0; attempt < maxAttempts; attempt += 1){
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try{
      const response = await fetch(url, {...options, signal:controller.signal});
      return response;
    }catch(error){
      const isFinalAttempt = attempt === maxAttempts - 1;
      if(isFinalAttempt) throw error;
      await sleep(300);
    }finally{
      clearTimeout(timeout);
    }
  }
  throw new Error('Request failed.');
}

function trackedStateEndpoint(){
  return defaultTrackedStateEndpoint;
}

function pushConfigEndpoint(){
  return defaultPushConfigEndpoint;
}

function pushSubscribeEndpoint(){
  return defaultPushSubscribeEndpoint;
}

function shouldSyncTickerRecordToBackend(record){
  const item = normalizeTickerRecord(record || {});
  return !!(
    item.watchlist.inWatchlist
    || item.review.manualReview
    || item.plan.hasValidPlan
    || ['watchlist','reviewed','planned','shortlisted'].includes(String(item.lifecycle.stage || ''))
  );
}

function trackedTickerRecordsPayload(){
  const records = {};
  Object.values(normalizeTickerRecordsMap(state.tickerRecords || {})).forEach(record => {
    if(shouldSyncTickerRecordToBackend(record)) records[record.ticker] = record;
  });
  const removedRecords = {};
  const currentTickers = new Set(Object.keys(records));
  const localTrackedTickers = uniqueTickers(state.backendLocalTrackedTickers || []);
  const knownVersions = state.backendTrackedVersions && typeof state.backendTrackedVersions === 'object' ? state.backendTrackedVersions : {};
  localTrackedTickers.forEach(ticker => {
    if(!currentTickers.has(ticker)) removedRecords[ticker] = String(knownVersions[ticker] || '');
  });
  return {
    settings:{
      accountSize:currentAccountSizeGbp(),
      riskPercent:numericOrNull(state.riskPercent) || 0.01,
      maxLossOverride:numericOrNull(state.maxLossOverride),
      wholeSharesOnly:state.wholeSharesOnly !== false,
      marketStatus:String(state.marketStatus || ''),
      dataProvider:normalizeDataProvider(state.dataProvider),
      apiPlan:String(state.apiPlan || DEFAULT_API_PLAN)
    },
    records,
    removedRecords
  };
}

function updateBackendTrackedVersions(records){
  const next = {};
  Object.entries(records && typeof records === 'object' ? records : {}).forEach(([ticker, record]) => {
    next[normalizeTicker(ticker)] = String(record && record.meta && record.meta.updatedAt || '');
  });
  state.backendTrackedVersions = next;
}

function syncBackendTrackedOwnership(remoteRecords){
  const remoteTickers = uniqueTickers(Object.keys(remoteRecords && typeof remoteRecords === 'object' ? remoteRecords : {}));
  const backendOwned = new Set(uniqueTickers(state.backendLocalTrackedTickers || []));
  const remoteTickerSet = new Set(remoteTickers);
  let changed = false;
  backendOwned.forEach(ticker => {
    if(remoteTickerSet.has(ticker)) return;
    const localRecord = state.tickerRecords && state.tickerRecords[ticker] ? normalizeTickerRecord(state.tickerRecords[ticker]) : null;
    const syncedUpdatedAt = String((state.backendTrackedVersions && state.backendTrackedVersions[ticker]) || '');
    const localUpdatedAt = String(localRecord && localRecord.meta && localRecord.meta.updatedAt || '');
    const hasNewerLocalWork = !!(localRecord && localUpdatedAt && syncedUpdatedAt && localUpdatedAt > syncedUpdatedAt);
    if(localRecord && !hasNewerLocalWork){
      delete state.tickerRecords[ticker];
      changed = true;
      backendOwned.delete(ticker);
      return;
    }
    if(!localRecord){
      backendOwned.delete(ticker);
    }
  });
  remoteTickers.forEach(ticker => backendOwned.add(ticker));
  state.backendLocalTrackedTickers = [...backendOwned];
  return changed;
}

async function pushTrackedRecordsToBackend(){
  const payload = trackedTickerRecordsPayload();
  const localTrackedTickers = Object.keys(payload.records).map(normalizeTicker);
  try{
    const response = await fetchJsonWithTimeout(trackedStateEndpoint(), {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload)
    });
    const body = await response.json().catch(() => ({}));
    if(response.ok && body && body.trackedState){
      updateBackendTrackedVersions(body.trackedState.records);
      state.backendLocalTrackedTickers = localTrackedTickers;
      persistState();
    }
  }catch(error){}
}

function scheduleTrackedRecordsSync(delayMs = 800){
  clearTimeout(backendSyncTimer);
  backendSyncTimer = setTimeout(() => {
    pushTrackedRecordsToBackend();
  }, delayMs);
}

async function pullTrackedRecordsFromBackend(options = {}){
  try{
    const response = await fetchJsonWithTimeout(trackedStateEndpoint(), {method:'GET'});
    const payload = await response.json().catch(() => ({}));
    if(!response.ok || !payload || payload.ok === false || !payload.trackedState) return false;
    const trackedState = payload.trackedState;
    let changed = syncBackendTrackedOwnership(trackedState.records);
    Object.entries((trackedState.records && typeof trackedState.records === 'object') ? trackedState.records : {}).forEach(([ticker, incoming]) => {
      const symbol = normalizeTicker(ticker);
      if(!symbol || !incoming || typeof incoming !== 'object') return;
      const local = getTickerRecord(symbol);
      const incomingUpdatedAt = String(incoming.meta && incoming.meta.updatedAt || '');
      const localUpdatedAt = String(local && local.meta && local.meta.updatedAt || '');
      if(!local || !localUpdatedAt || (incomingUpdatedAt && incomingUpdatedAt >= localUpdatedAt)){
        state.tickerRecords[symbol] = normalizeTickerRecord({...incoming, ticker:symbol});
        changed = true;
      }
    });
    if(changed){
      syncLegacyCollectionsFromTickerRecords();
      if(options.render !== false){
        renderScannerResults();
        renderWatchlist();
        renderFocusQueue();
        renderReviewWorkspace();
        renderWorkflowAlerts();
      }
    }
    updateBackendTrackedVersions(trackedState.records);
    persistState();
    return changed;
  }catch(error){
    return false;
  }
}

function urlBase64ToUint8Array(base64String){
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for(let i = 0; i < rawData.length; i += 1){
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function fetchPushConfig(){
  if(pushConfigPromise) return pushConfigPromise;
  pushConfigPromise = fetchJsonWithTimeout(pushConfigEndpoint(), {method:'GET'})
    .then(response => response.json().catch(() => ({})))
    .then(payload => {
      if(!payload || payload.ok === false) throw new Error('push_config_unavailable');
      return payload;
    })
    .catch(error => {
      pushConfigPromise = null;
      throw error;
    });
  return pushConfigPromise;
}

function pushPermissionSummary(){
  if(!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)){
    return 'Alerts unavailable on this browser';
  }
  if(Notification.permission === 'granted') return 'Entry alerts enabled';
  if(Notification.permission === 'denied') return 'Alerts blocked in browser settings';
  return 'Entry alerts off';
}

async function ensurePushSubscription(registration, options = {}){
  if(!registration || !('PushManager' in window) || !('Notification' in window)) return;
  let config;
  try{
    config = await fetchPushConfig();
  }catch(error){
    return;
  }
  if(!config || !config.enabled || !config.publicKey) return;
  let permission = Notification.permission;
  if(permission === 'default' && options.allowPermissionRequest){
    try{
      permission = await Notification.requestPermission();
    }catch(error){
      permission = 'denied';
    }
  }
  if(permission !== 'granted') return;
  try{
    let subscription = await registration.pushManager.getSubscription();
    if(!subscription){
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly:true,
        applicationServerKey:urlBase64ToUint8Array(config.publicKey)
      });
    }
    await fetchJsonWithTimeout(pushSubscribeEndpoint(), {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({subscription})
    });
  }catch(error){}
}

async function enableEntryAlerts(){
  if(!('serviceWorker' in navigator) || !('Notification' in window)){
    setStatus('apiStatus', '<span class="warntext">Entry alerts are not available in this browser.</span>');
    renderWorkflowAlerts();
    return false;
  }
  try{
    const registration = await navigator.serviceWorker.ready;
    await ensurePushSubscription(registration, {allowPermissionRequest:true});
  }catch(error){
    setStatus('apiStatus', '<span class="warntext">Could not enable entry alerts right now. Please retry.</span>');
  }
  renderWorkflowAlerts();
  return Notification.permission === 'granted';
}

function bootstrapBackgroundMonitoring(){
  pullTrackedRecordsFromBackend();
  clearInterval(backendRefreshTimer);
  backendRefreshTimer = setInterval(() => {
    pullTrackedRecordsFromBackend();
  }, BACKEND_REVIEW_POLL_MS);
}

function bootstrapMarketStatusClock(){
  refreshMarketContextWidgets();
  refreshAutomaticMarketStatus().catch(() => {});
  clearInterval(marketStatusTimer);
  marketStatusTimer = setInterval(() => {
    refreshMarketContextWidgets();
    refreshAutomaticMarketStatus().catch(() => {});
  }, MARKET_STATUS_REFRESH_MS);
}

function selectedQuickScanType(){
  return normalizeScanType($('scannerSetupType') && $('scannerSetupType').value);
}

function renderTickerListWithScanTypes(tickers){
  return uniqueTickers(tickers || []).map(ticker => {
    const meta = getStoredTickerMeta(ticker);
    const scanType = normalizeScanType(meta && meta.scanType);
    return scanType ? `${ticker} | ${scanType}` : ticker;
  }).join('\n');
}


function syncUniverseFromInputs(preferExisting = false){
  const rawInput = $('tickerInput') ? $('tickerInput').value : '';
  const parsed = parseTickersDetailed(rawInput);
  const fallback = preferExisting ? uniqueTickers(state.tickers || []) : [];
  const nextTickers = parsed.valid.length ? parsed.valid : fallback;
  state.tickers = nextTickers;
  if($('tickerInput')) $('tickerInput').value = nextTickers.join('\n');
  return {...parsed, valid:nextTickers};
}

function defaultUniverseModeForTickers(tickers){
  return uniqueTickers(tickers || []).length ? 'tradingview_only' : 'core8';
}

function normalizeUniverseMode(value){
  return ['tradingview_only','core8','combined'].includes(String(value || '')) ? String(value) : '';
}

function normalizeDataProvider(value){
  const provider = String(value || '').trim().toLowerCase();
  return providerConfigs[provider] ? provider : DEFAULT_PROVIDER;
}

function currentProviderConfig(){
  return providerConfigs[normalizeDataProvider(state.dataProvider)] || providerConfigs[DEFAULT_PROVIDER];
}

function currentProviderLabel(){
  return currentProviderConfig().label;
}

function currentMaxScanTickers(){
  const limit = Number(currentProviderConfig().maxScanTickers);
  return Number.isFinite(limit) && limit > 0 ? limit : null;
}

function updateProviderStatusNote(){
  const note = $('providerStatusNote');
  if(!note) return;
  note.textContent = 'FMP: search + snapshot. MarketData.app: snapshot only for now.';
}

function effectiveUniverseMode(){
  return normalizeUniverseMode(state.universeMode) || defaultUniverseModeForTickers(state.tickers);
}

function finalScanUniverse(){
  const imported = uniqueTickers(state.tickers || []);
  const mode = effectiveUniverseMode();
  const limit = currentMaxScanTickers();
  if(mode === 'tradingview_only') return imported;
  if(mode === 'combined'){
    const merged = uniqueTickers([...imported, ...DEFAULT_AUTO_UNIVERSE]);
    return Number.isFinite(limit) ? merged.slice(0, limit) : merged;
  }
  return DEFAULT_AUTO_UNIVERSE.slice();
}

function renderFinalUniversePreview(){
  const box = $('finalUniversePreview');
  if(!box) return;
  const mode = effectiveUniverseMode();
  const universe = finalScanUniverse();
  const imported = uniqueTickers(state.tickers || []);
  const modeLabel = mode === 'tradingview_only'
    ? 'TradingView Only'
    : (mode === 'combined' ? 'Combined' : 'Curated Core 8');
  if(!universe.length){
    box.textContent = 'Final scan universe is empty. Add or import tickers, or switch to Curated Core 8.';
    return;
  }
  if(Number.isFinite(currentMaxScanTickers()) && mode === 'tradingview_only' && imported.length > currentMaxScanTickers()){
    box.textContent = `Final scan universe (${modeLabel}) is blocked.\n\n${currentProviderLabel()} scans are limited to ${currentMaxScanTickers()} tickers in the current plan.\nImported tickers detected: ${imported.length}`;
    return;
  }
  const note = mode === 'combined' && Number.isFinite(currentMaxScanTickers())
    ? `\n\nCombined mode prioritises TradingView tickers first and caps the final unique list at ${currentMaxScanTickers()}.`
    : '';
  box.textContent = `Final scan universe (${modeLabel}, ${universe.length}):\n\n${universe.join(', ')}${note}`;
}

function setOcrImportStatus(html){
  setStatus('ocrImportStatus', html);
}

function syncOcrReviewVisibility(){
  const reviewBlock = $('ocrReviewBlock');
  const reviewInput = $('ocrReviewInput');
  const applyBtn = $('applyOcrBtn');
  const clearBtn = $('clearOcrBtn');
  const hasReviewText = !!String(reviewInput && reviewInput.value || '').trim();
  if(reviewBlock) reviewBlock.hidden = !hasReviewText;
  if(applyBtn) applyBtn.disabled = !hasReviewText;
  if(clearBtn) clearBtn.disabled = !hasReviewText;
}

function renderTvImportPreview(tickers, mode = 'manual'){
  const box = $('tvImportPreview');
  if(!box) return;
  const list = uniqueTickers(tickers || []);
  if(mode === 'default'){
    box.textContent = `No manual import saved. The next scan will use the Curated Core 8 fallback universe:\n\n${DEFAULT_AUTO_UNIVERSE.join(', ')}`;
    return;
  }
  if(!list.length){
    box.textContent = 'No imported ticker list yet.';
    return;
  }
  const lines = list.map(ticker => {
    const meta = getStoredTickerMeta(ticker);
    const scanType = normalizeScanType(meta && meta.scanType);
    return scanType ? `${ticker} (${scanType})` : ticker;
  });
  box.textContent = `Cleaned ticker list (${list.length}):\n\n${lines.join(', ')}`;
}

function applyManualUniverseTickers(tickers, metaMap = {}){
  const clean = uniqueTickers(tickers || []);
  state.tickers = clean;
  clean.forEach(ticker => {
    const entry = metaMap[ticker];
    if(entry && normalizeScanType(entry.scanType)){
      const existing = getStoredTickerMeta(ticker) || {};
      state.symbolMeta[ticker] = {
        ...existing,
        scanType:normalizeScanType(entry.scanType)
      };
    }
  });
  state.universeMode = defaultUniverseModeForTickers(clean);
  updateRecentTickers(clean);
  updateTickerInputFromState();
  if($('universeMode')) $('universeMode').value = effectiveUniverseMode();
  commitTickerState();
  renderTickerQuickLists();
  renderTvImportPreview(clean, clean.length ? 'manual' : 'default');
  renderFinalUniversePreview();
  return clean;
}

function importTradingViewTickers(){
  const input = $('tvImportInput');
  const raw = input ? input.value : '';
  const importedEntries = parseImportedTickerEntries(raw);
  const parsed = parseTickersDetailed(raw);
  if(!String(raw || '').trim()){
    applyManualUniverseTickers([]);
    setStatus('inputStatus', '<span class="ok">No import provided. The next scan will use the Curated Core 8 fallback universe.</span>');
    return;
  }
  const metaMap = {};
  importedEntries.forEach(entry => {
    if(normalizeScanType(entry.scanType) && validateTickerSymbol(entry.ticker)){
      metaMap[entry.ticker] = {scanType:normalizeScanType(entry.scanType)};
    }
  });
  applyManualUniverseTickers(parsed.valid, metaMap);
  const messages = [];
  if(parsed.valid.length) messages.push(`<span class="ok">${parsed.valid.length} ticker${parsed.valid.length === 1 ? '' : 's'} imported into the manual scanner universe.</span>`);
  if(parsed.invalid.length) messages.push(`<span class="badtext">Invalid: ${escapeHtml(parsed.invalid.join(', '))}</span>`);
  if(parsed.duplicates.length) messages.push(`<span class="warntext">Duplicates removed: ${escapeHtml([...new Set(parsed.duplicates)].join(', '))}</span>`);
  const typedCount = Object.keys(metaMap).length;
  if(typedCount) messages.push(`<span class="ok">${typedCount} explicit scan type${typedCount === 1 ? '' : 's'} saved.</span>`);
  if(!parsed.valid.length) messages.push('<span class="warntext">No valid tickers found. The next scan will use the Curated Core 8 fallback universe.</span>');
  setStatus('inputStatus', messages.join(' '));
}

function clearOcrReview(message){
  if($('ocrReviewInput')) $('ocrReviewInput').value = '';
  setOcrImportStatus(message || 'OCR import is optional and runs fully in your browser.');
  syncOcrReviewVisibility();
}

function extractTickersFromOcrText(text){
  const tokens = String(text || '').toUpperCase().split(/[^A-Z]+/).map(token => token.trim()).filter(Boolean);
  return uniqueTickers(tokens.filter(token => /^[A-Z]{1,5}$/.test(token) && !OCR_STOPWORDS.has(token)));
}

function ensureTesseractLoaded(){
  if(window.Tesseract) return Promise.resolve(window.Tesseract);
  if(tesseractLoaderPromise) return tesseractLoaderPromise;
  tesseractLoaderPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TESSERACT_SCRIPT_URL;
    script.async = true;
    script.onload = () => window.Tesseract ? resolve(window.Tesseract) : reject(new Error('Tesseract.js did not load correctly.'));
    script.onerror = () => reject(new Error('Could not load Tesseract.js in the browser.'));
    document.head.appendChild(script);
  }).catch(error => {
    tesseractLoaderPromise = null;
    throw error;
  });
  return tesseractLoaderPromise;
}

async function runOcrImport(file){
  if(!file){
    setOcrImportStatus('<span class="warntext">Choose a screenshot first.</span>');
    return;
  }
  if(!(file.type || '').startsWith('image/')){
    setOcrImportStatus('<span class="badtext">Use an image screenshot for OCR import.</span>');
    return;
  }
  try{
    setOcrImportStatus('<span class="warntext">Loading OCR engine...</span>');
    const Tesseract = await ensureTesseractLoaded();
    const {data} = await Tesseract.recognize(file, 'eng', {
      logger: message => {
        if(message && message.status === 'recognizing text' && typeof message.progress === 'number'){
          setOcrImportStatus(`<span class="warntext">Reading screenshot... ${Math.round(message.progress * 100)}%</span>`);
        }
      }
    });
    const tickers = extractTickersFromOcrText(data && data.text);
    if(!tickers.length){
      if($('ocrReviewInput')) $('ocrReviewInput').value = '';
      setOcrImportStatus('<span class="badtext">No ticker symbols detected. Try a clearer screenshot.</span>');
      syncOcrReviewVisibility();
      return;
    }
    if($('ocrReviewInput')) $('ocrReviewInput').value = tickers.join('\n');
    setOcrImportStatus(`<span class="ok">${tickers.length} likely ticker${tickers.length === 1 ? '' : 's'} detected. Review and confirm before scanning.</span>`);
    syncOcrReviewVisibility();
  }catch(error){
    if($('ocrReviewInput')) $('ocrReviewInput').value = '';
    setOcrImportStatus(`<span class="badtext">${escapeHtml(String(error && error.message || 'No ticker symbols detected. Try a clearer screenshot.'))}</span>`);
    syncOcrReviewVisibility();
  }
}

function applyOcrTickers(){
  const reviewText = $('ocrReviewInput') ? $('ocrReviewInput').value : '';
  const parsed = parseTickersDetailed(reviewText);
  if(!String(reviewText || '').trim() || !parsed.valid.length){
    setOcrImportStatus('<span class="badtext">No ticker symbols detected. Try a clearer screenshot.</span>');
    return;
  }
  applyManualUniverseTickers(parsed.valid);
  const messages = [];
  messages.push(`<span class="ok">${parsed.valid.length} ticker${parsed.valid.length === 1 ? '' : 's'} imported from OCR into the manual scanner universe.</span>`);
  if(parsed.invalid.length) messages.push(`<span class="badtext">Ignored: ${escapeHtml(parsed.invalid.join(', '))}</span>`);
  if(parsed.duplicates.length) messages.push(`<span class="warntext">Duplicates removed: ${escapeHtml([...new Set(parsed.duplicates)].join(', '))}</span>`);
  setStatus('inputStatus', messages.join(' '));
  setOcrImportStatus('<span class="ok">OCR tickers confirmed. Press Refresh Scanner Now when you are ready.</span>');
}

function createTradeRecord(values){
  return {
    id:`trade-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ticker:'',
    date:new Date().toISOString().slice(0, 10),
    verdict:'Watch',
    chartVerdict:'Watch',
    qualityScore:'',
    entry:'',
    stop:'',
    firstTarget:'',
    maxLoss:'',
    riskPerShare:'',
    rewardPerShare:'',
    rrRatio:'',
    rrState:'',
    firstTargetTooClose:false,
    positionSize:'',
    riskStatus:'',
    accountSize:'',
    marketStatus:'',
    scanType:'',
    notes:'',
    outcome:'',
    lesson:'',
    plannedEntry:'',
    plannedStop:'',
    plannedFirstTarget:'',
    plannedRiskPerShare:'',
    plannedRewardPerShare:'',
    plannedRR:'',
    plannedPositionSize:'',
    plannedMaxLoss:'',
    plannedAt:'',
    actualEntry:'',
    actualExit:'',
    actualStop:'',
    actualQuantity:'',
    grossPnL:'',
    netPnL:'',
    resultR:'',
    outcomeReason:'',
    heldDays:'',
    executionQuality:'',
    setupQuality:'',
    mistakeTags:[],
    lessonTags:[],
    setupTags:[],
    beforeImage:'',
    afterImage:'',
    openedAt:'',
    closedAt:'',
    reviewedAt:'',
    ...values
  };
}

function baseTradeOutcome(){
  return {
    hasTrade:false,
    entryPlanned:null,
    stopPlanned:null,
    targetPlanned:null,
    entryActual:null,
    exitActual:null,
    stopActual:null,
    quantity:null,
    grossPnL:null,
    netPnL:null,
    resultR:null,
    outcome:null,
    outcomeReason:null,
    heldDays:null,
    executionQuality:null,
    setupQuality:null,
    mistakes:[],
    lessons:[],
    tags:[],
    beforeImage:null,
    afterImage:null,
    openedAt:null,
    closedAt:null,
    reviewedAt:null
  };
}

function normalizeTradeOutcomeValue(value){
  const text = String(value || '').trim().toLowerCase();
  if(text === 'open') return 'Open';
  if(text === 'win') return 'Win';
  if(text === 'loss') return 'Loss';
  if(text === 'scratch') return 'Scratch';
  if(text === 'cancelled' || text === 'canceled') return 'Cancelled';
  return '';
}

function parseTagList(value){
  if(Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean);
  return String(value || '').split(',').map(item => item.trim()).filter(Boolean);
}

function formatTagList(value){
  return parseTagList(value).join(', ');
}

function computeTradeOutcomeMetrics(record){
  const actualEntry = numericOrNull(record.actualEntry);
  const actualExit = numericOrNull(record.actualExit);
  const actualQuantity = numericOrNull(record.actualQuantity);
  const plannedRiskPerShare = numericOrNull(record.plannedRiskPerShare || record.riskPerShare);
  const grossPnL = Number.isFinite(actualEntry) && Number.isFinite(actualExit) && Number.isFinite(actualQuantity)
    ? (actualExit - actualEntry) * actualQuantity
    : null;
  const netPnL = Number.isFinite(numericOrNull(record.netPnL)) ? numericOrNull(record.netPnL) : grossPnL;
  const resultR = Number.isFinite(plannedRiskPerShare) && plannedRiskPerShare > 0 && Number.isFinite(actualQuantity) && actualQuantity > 0 && Number.isFinite(netPnL)
    ? netPnL / (plannedRiskPerShare * actualQuantity)
    : null;
  let heldDays = null;
  if(/^\d{4}-\d{2}-\d{2}$/.test(String(record.openedAt || '')) && /^\d{4}-\d{2}-\d{2}$/.test(String(record.closedAt || ''))){
    heldDays = countTradingDaysBetween(String(record.openedAt), String(record.closedAt));
  }
  return {grossPnL, netPnL, resultR, heldDays};
}

function tradeRecordHasExecutedTrade(record){
  const actualEntry = numericOrNull(record && record.actualEntry);
  const actualExit = numericOrNull(record && record.actualExit);
  const actualStop = numericOrNull(record && record.actualStop);
  const actualQuantity = numericOrNull(record && record.actualQuantity);
  return Number.isFinite(actualEntry)
    || Number.isFinite(actualExit)
    || Number.isFinite(actualStop)
    || (Number.isFinite(actualQuantity) && actualQuantity > 0);
}

function buildTradeOutcomeSnapshot(record){
  const normalized = normalizeTradeRecord(record);
  const executed = tradeRecordHasExecutedTrade(normalized);
  const outcome = normalizeTradeOutcomeValue(normalized.outcome);
  const base = baseTradeOutcome();
  return {
    ...base,
    hasTrade:executed,
    entryPlanned:numericOrNull(normalized.plannedEntry),
    stopPlanned:numericOrNull(normalized.plannedStop),
    targetPlanned:numericOrNull(normalized.plannedFirstTarget),
    entryActual:numericOrNull(normalized.actualEntry),
    exitActual:numericOrNull(normalized.actualExit),
    stopActual:numericOrNull(normalized.actualStop),
    quantity:numericOrNull(normalized.actualQuantity),
    grossPnL:numericOrNull(normalized.grossPnL),
    netPnL:numericOrNull(normalized.netPnL),
    resultR:numericOrNull(normalized.resultR),
    outcome:outcome || null,
    outcomeReason:String(normalized.outcomeReason || '').trim() || null,
    heldDays:numericOrNull(normalized.heldDays),
    executionQuality:String(normalized.executionQuality || '').trim() || null,
    setupQuality:String(normalized.setupQuality || '').trim() || null,
    mistakes:parseTagList(normalized.mistakeTags),
    lessons:parseTagList(normalized.lessonTags),
    tags:parseTagList(normalized.setupTags),
    beforeImage:String(normalized.beforeImage || '').trim() || null,
    afterImage:String(normalized.afterImage || '').trim() || null,
    openedAt:String(normalized.openedAt || '').trim() || null,
    closedAt:String(normalized.closedAt || '').trim() || null,
    reviewedAt:String(normalized.reviewedAt || '').trim() || null
  };
}

function normalizeStoredTradeOutcome(outcome){
  const base = baseTradeOutcome();
  if(!outcome || typeof outcome !== 'object') return base;
  return {
    ...base,
    ...outcome,
    hasTrade:!!outcome.hasTrade,
    entryPlanned:numericOrNull(outcome.entryPlanned),
    stopPlanned:numericOrNull(outcome.stopPlanned),
    targetPlanned:numericOrNull(outcome.targetPlanned),
    entryActual:numericOrNull(outcome.entryActual),
    exitActual:numericOrNull(outcome.exitActual),
    stopActual:numericOrNull(outcome.stopActual),
    quantity:numericOrNull(outcome.quantity),
    grossPnL:numericOrNull(outcome.grossPnL),
    netPnL:numericOrNull(outcome.netPnL),
    resultR:numericOrNull(outcome.resultR),
    outcome:normalizeTradeOutcomeValue(outcome.outcome) || null,
    outcomeReason:String(outcome.outcomeReason || '').trim() || null,
    heldDays:numericOrNull(outcome.heldDays),
    executionQuality:String(outcome.executionQuality || '').trim() || null,
    setupQuality:String(outcome.setupQuality || '').trim() || null,
    mistakes:parseTagList(outcome.mistakes),
    lessons:parseTagList(outcome.lessons),
    tags:parseTagList(outcome.tags),
    beforeImage:String(outcome.beforeImage || '').trim() || null,
    afterImage:String(outcome.afterImage || '').trim() || null,
    openedAt:String(outcome.openedAt || '').trim() || null,
    closedAt:String(outcome.closedAt || '').trim() || null,
    reviewedAt:String(outcome.reviewedAt || '').trim() || null
  };
}

function deriveDiaryLifecycleState(record){
  const normalized = normalizeTradeRecord(record);
  const outcome = normalizeTradeOutcomeValue(normalized.outcome);
  const executed = tradeRecordHasExecutedTrade(normalized);
  if(outcome === 'Cancelled' && !executed){
    return {
      stage:'cancelled',
      status:'closed',
      changedAt:`${(normalized.closedAt || normalized.reviewedAt || normalized.date || todayIsoDate())}T12:00:00.000Z`,
      reason:'Planned trade was cancelled before entry.',
      source:'diary'
    };
  }
  if(isClosedOutcome(outcome)){
    return {
      stage:'exited',
      status:'closed',
      changedAt:`${(normalized.closedAt || normalized.date || todayIsoDate())}T12:00:00.000Z`,
      reason:`Trade outcome set to ${outcome}.`,
      source:'diary'
    };
  }
  if(executed || outcome === 'Open'){
    return {
      stage:'entered',
      status:'active',
      changedAt:`${(normalized.openedAt || normalized.date || todayIsoDate())}T12:00:00.000Z`,
      reason:'Trade has actual execution details recorded.',
      source:'diary'
    };
  }
  return {
    stage:'planned',
    status:'active',
    changedAt:`${(normalized.plannedAt || normalized.date || todayIsoDate())}T12:00:00.000Z`,
    reason:'Planned trade snapshot saved for later review.',
    source:'diary'
  };
}

function normalizeTradeRecord(record){
  const normalized = createTradeRecord(record || {});
  normalized.ticker = normalizeTicker(normalized.ticker);
  normalized.date = String(normalized.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
  normalized.verdict = normalizeImportedStatus(normalized.verdict);
  normalized.chartVerdict = normalizeImportedStatus(normalized.chartVerdict || normalized.verdict);
  normalized.qualityScore = String(normalized.qualityScore || '');
  normalized.entry = String(normalized.entry || '');
  normalized.stop = String(normalized.stop || '');
  normalized.firstTarget = String(normalized.firstTarget || '');
  normalized.maxLoss = String(normalized.maxLoss || '');
  normalized.riskPerShare = String(normalized.riskPerShare || '');
  normalized.rewardPerShare = String(normalized.rewardPerShare || '');
  normalized.rrRatio = String(normalized.rrRatio || '');
  normalized.rrState = String(normalized.rrState || '');
  normalized.firstTargetTooClose = !!normalized.firstTargetTooClose;
  normalized.positionSize = String(normalized.positionSize || '');
  normalized.riskStatus = String(normalized.riskStatus || '');
  normalized.accountSize = String(normalized.accountSize || '');
  normalized.marketStatus = String(normalized.marketStatus || '');
  normalized.scanType = normalizeScanType(normalized.scanType);
  normalized.notes = String(normalized.notes || '');
  normalized.outcome = normalizeTradeOutcomeValue(normalized.outcome);
  normalized.lesson = String(normalized.lesson || '');
  normalized.plannedEntry = String(normalized.plannedEntry || normalized.entry || '');
  normalized.plannedStop = String(normalized.plannedStop || normalized.stop || '');
  normalized.plannedFirstTarget = String(normalized.plannedFirstTarget || normalized.firstTarget || '');
  normalized.plannedRiskPerShare = String(normalized.plannedRiskPerShare || normalized.riskPerShare || '');
  normalized.plannedRewardPerShare = String(normalized.plannedRewardPerShare || normalized.rewardPerShare || '');
  normalized.plannedRR = String(normalized.plannedRR || normalized.rrRatio || '');
  normalized.plannedPositionSize = String(normalized.plannedPositionSize || normalized.positionSize || '');
  normalized.plannedMaxLoss = String(normalized.plannedMaxLoss || normalized.maxLoss || '');
  normalized.plannedAt = String(normalized.plannedAt || normalized.date || '');
  normalized.actualEntry = String(normalized.actualEntry || '');
  normalized.actualExit = String(normalized.actualExit || '');
  normalized.actualStop = String(normalized.actualStop || '');
  normalized.actualQuantity = String(normalized.actualQuantity || normalized.quantity || '');
  normalized.outcomeReason = String(normalized.outcomeReason || '');
  normalized.executionQuality = String(normalized.executionQuality || '');
  normalized.setupQuality = String(normalized.setupQuality || '');
  normalized.beforeImage = String(normalized.beforeImage || '');
  normalized.afterImage = String(normalized.afterImage || '');
  normalized.openedAt = String(normalized.openedAt || '').slice(0, 10);
  normalized.closedAt = String(normalized.closedAt || '').slice(0, 10);
  normalized.reviewedAt = String(normalized.reviewedAt || '').slice(0, 10);
  if(!normalized.openedAt && (normalized.outcome === 'Open' || tradeRecordHasExecutedTrade(normalized))){
    normalized.openedAt = String(normalized.date || todayIsoDate()).slice(0, 10);
  }
  normalized.mistakeTags = parseTagList(normalized.mistakeTags);
  normalized.lessonTags = parseTagList(normalized.lessonTags);
  normalized.setupTags = parseTagList(normalized.setupTags);
  const metrics = computeTradeOutcomeMetrics(normalized);
  normalized.grossPnL = Number.isFinite(metrics.grossPnL) ? String(Number(metrics.grossPnL.toFixed(2))) : '';
  normalized.netPnL = Number.isFinite(metrics.netPnL) ? String(Number(metrics.netPnL.toFixed(2))) : '';
  normalized.resultR = Number.isFinite(metrics.resultR) ? String(Number(metrics.resultR.toFixed(2))) : '';
  normalized.heldDays = Number.isFinite(metrics.heldDays) ? String(metrics.heldDays) : '';
  return normalized;
}

function baseCard(ticker){
  return {
    ticker,
    status:'Watch',
    chartVerdict:'Watch',
    riskStatus:'plan_missing',
    score:0,
    summary:'No review saved yet.',
    checks:{},
    manualReview:null,
    notes:'',
    chartRef:null,
    lastPrompt:'',
    lastResponse:'',
    lastError:'',
    lastAnalysis:null,
    entry:'',
    stop:'',
    target:'',
    source:'manual',
    updatedAt:'',
    marketStatus:'',
    analysis:null,
    companyName:'',
    exchange:'',
    tradingViewSymbol:'',
    marketCap:null,
    marketData:null,
    marketDataUpdatedAt:'',
    scannerUpdatedAt:'',
    scanType:'',
    scanSetupType:'',
    setupType:'',
    trendStatus:'',
    pullbackStatus:'',
    pullbackType:'',
    rewardPerShare:null,
    rrRatio:null,
    rrState:'',
    firstTargetTooClose:false,
    perf1w:null,
    perf1m:null,
    perf3m:null,
    perf6m:null,
    perfYtd:null,
    rsi14:null,
    price:null,
    sma20:null,
    sma50:null,
    sma200:null,
    volume:null,
    avgVolume30d:null,
    watchTracking:null,
    pinned:false
  };
}

// ============================================================================
// Canonical ticker records and migration
// ============================================================================
function normalizeCard(card){
  const normalized = {...baseCard(normalizeTicker(card && card.ticker)), ...(card || {})};
  normalized.ticker = normalizeTicker(normalized.ticker);
  normalized.checks = {...(normalized.checks || {})};
  if(!normalized.chartRef && normalized.chartDataUrl){
    normalized.chartRef = {name:'chart.png', type:'image/png', dataUrl:normalized.chartDataUrl};
  }
  normalized.lastPrompt = String(normalized.lastPrompt || '');
  normalized.lastResponse = String(normalized.lastResponse || '');
  normalized.lastError = String(normalized.lastError || '');
  normalized.lastAnalysis = normalized.lastAnalysis || null;
  normalized.companyName = String(normalized.companyName || '');
  normalized.exchange = String(normalized.exchange || '');
  normalized.tradingViewSymbol = String(normalized.tradingViewSymbol || '');
  normalized.marketDataUpdatedAt = String(normalized.marketDataUpdatedAt || '');
  normalized.scannerUpdatedAt = String(normalized.scannerUpdatedAt || '');
  normalized.scanType = normalizeScanType(
    normalized.scanType
    || (normalized.analysis && typeof normalized.analysis === 'object' ? (normalized.analysis.scan_type || normalized.analysis.setup_type || '') : '')
  );
  normalized.scanSetupType = normalizeScanType(normalized.scanSetupType || normalized.scanType || normalized.setupType);
  if(!normalized.scanType) normalized.scanType = normalized.scanSetupType;
  normalized.setupType = String(normalized.setupType || '');
  normalized.trendStatus = String(normalized.trendStatus || '');
  normalized.pullbackStatus = String(normalized.pullbackStatus || '');
  normalized.chartVerdict = String(normalized.chartVerdict || normalized.status || 'Watch');
  normalized.riskStatus = String(normalized.riskStatus || 'plan_missing');
  normalized.manualReview = normalized.manualReview && typeof normalized.manualReview === 'object' ? normalized.manualReview : null;
  normalized.pullbackType = String(normalized.pullbackType || '');
  normalized.rewardPerShare = numericOrNull(normalized.rewardPerShare);
  normalized.rrRatio = numericOrNull(normalized.rrRatio);
  normalized.rrState = String(normalized.rrState || '');
  normalized.firstTargetTooClose = !!normalized.firstTargetTooClose;
  normalized.marketData = normalized.marketData && typeof normalized.marketData === 'object' ? normalized.marketData : null;
  normalized.watchTracking = normalized.watchTracking && typeof normalized.watchTracking === 'object' ? {
    firstFlaggedAt:String(normalized.watchTracking.firstFlaggedAt || ''),
    expiryDate:String(normalized.watchTracking.expiryDate || ''),
    extensionDays:Number(normalized.watchTracking.extensionDays || DEFAULT_WATCH_TRADING_DAYS),
    pinned:!!normalized.watchTracking.pinned,
    manualRetain:!!normalized.watchTracking.manualRetain,
    dailyChecks:Array.isArray(normalized.watchTracking.dailyChecks) ? normalized.watchTracking.dailyChecks : [],
    lastCheckedDate:String(normalized.watchTracking.lastCheckedDate || '')
  } : null;
  return normalized;
}

function baseTickerRecord(ticker){
  return createBaseTickerRecord(ticker, { normalizeTicker, baseTradeOutcome });
}

function analysisDerivedStatesFromRecord(record){
  const rawRecord = record && typeof record === 'object' ? record : {};
  const analysisProjection = rawRecord.scan && rawRecord.scan.analysisProjection && typeof rawRecord.scan.analysisProjection === 'object'
    ? rawRecord.scan.analysisProjection
    : {};
  const normalizedAnalysis = rawRecord.review
    && rawRecord.review.analysisState
    && rawRecord.review.analysisState.normalized
    && typeof rawRecord.review.analysisState.normalized === 'object'
      ? rawRecord.review.analysisState.normalized
      : (rawRecord.review && rawRecord.review.normalizedAnalysis && typeof rawRecord.review.normalizedAnalysis === 'object'
      ? rawRecord.review.normalizedAnalysis
      : {});
  const pullback = resolvePullbackInterpretation({
    pullbackZone:analysisProjection.pullback_zone || normalizedAnalysis.pullback_zone,
    pullbackStatus:analysisProjection.pullback_status || normalizedAnalysis.pullback_status,
    chartRead:normalizedAnalysis.plain_english_chart_read || normalizedAnalysis.chart_read,
    keyReasons:normalizedAnalysis.key_reasons,
    risks:normalizedAnalysis.risks
  });
  return {
    trendState:String(analysisProjection.trend_state || analysisProjection.trend_status || normalizedAnalysis.trend_state || '').trim().toLowerCase(),
    pullbackZone:pullback.pullbackZone,
    pullbackState:pullback.pullbackState,
    pullbackQuality:pullback.pullbackQuality,
    structureState:String(analysisProjection.structure_state || normalizedAnalysis.structure_state || '').trim().toLowerCase(),
    stabilisationState:String(analysisProjection.stabilisation_state || normalizedAnalysis.stabilisation_state || '').trim().toLowerCase(),
    bounceState:String(analysisProjection.bounce_state || normalizedAnalysis.bounce_state || '').trim().toLowerCase(),
    volumeState:String(analysisProjection.volume_state || normalizedAnalysis.volume_state || '').trim().toLowerCase(),
    scanType:String(analysisProjection.scan_type || normalizedAnalysis.scan_type || '').trim(),
    evaluationScanType:String(analysisProjection.evaluation_scan_type || normalizedAnalysis.evaluation_scan_type || '').trim(),
    importedScanType:String(analysisProjection.imported_scan_type || normalizedAnalysis.imported_scan_type || '').trim(),
    globalSetupType:String(analysisProjection.global_setup_type || normalizedAnalysis.global_setup_type || '').trim(),
    setupTypeOverlapDetected:String(analysisProjection.setup_type_overlap_detected || normalizedAnalysis.setup_type_overlap_detected || '').trim().toLowerCase(),
    setupTypeReason:String(analysisProjection.setup_type_reason || normalizedAnalysis.setup_type_reason || '').trim()
  };
}

function normalizeTickerRecord(record){
  return normalizeTickerRecordImpl(record, {
    normalizeTicker,
    createBaseTickerRecord: symbol => baseTickerRecord(symbol),
    normalizeScanType,
    numericOrNull,
    normalizeImportedStatus,
    normalizeExitMode,
    normalizeTargetReviewState,
    normalizeStoredPlanSnapshot,
    normalizeTradeRecord,
    uniqueStrings,
    normalizeStoredTradeOutcome,
    hasAnyPlanFields,
    deriveExecutionPlanState,
    analysisDerivedStatesFromRecord,
    computeBaseSetupScoreForRecord,
    deriveCurrentPlanState,
    evaluateSetupQualityAdjustments,
    warningStateFromInputs,
    deriveDisplaySetupScore,
    convictionTierForRecord,
    practicalSizeFlagForPlan,
    evaluateEntryTrigger,
    validateCurrentPlan,
    hasLockedLifecycle,
    deriveActionStateForRecord,
    state
  });
}

function normalizeTickerRecordsMap(records){
  const out = {};
  if(!records || typeof records !== 'object') return out;
  Object.entries(records).forEach(([ticker, record]) => {
    const normalized = normalizeTickerRecord({...record, ticker});
    if(normalized.ticker) out[normalized.ticker] = normalized;
  });
  return out;
}

function cloneData(value, fallback = null){
  return safeJsonParse(JSON.stringify(value == null ? fallback : value), fallback);
}

function appendLifecycleHistory(record, entry){
  if(!record || !entry) return;
  record.lifecycle.history = [
    ...(record.lifecycle.history || []),
    {
      stage:String(entry.stage || record.lifecycle.stage || ''),
      status:String(entry.status || record.lifecycle.status || ''),
      changedAt:String(entry.changedAt || new Date().toISOString()),
      reason:String(entry.reason || ''),
      source:String(entry.source || 'system')
    }
  ].slice(-24);
}

function setLifecycleStage(record, {stage, status, changedAt, expiresAt, expiryReason, reason, source, forceHistory = false, lockReason}){
  if(!record) return;
  const nextStage = String(stage || record.lifecycle.stage || '');
  const nextStatus = String(status || record.lifecycle.status || 'inactive');
  const nextChangedAt = String(changedAt || new Date().toISOString());
  const stageChanged = record.lifecycle.stage !== nextStage || record.lifecycle.status !== nextStatus;
  record.lifecycle.stage = nextStage;
  record.lifecycle.status = nextStatus;
  record.lifecycle.lockReason = lockReason == null ? String(record.lifecycle.lockReason || '') : String(lockReason || '');
  record.lifecycle.stageUpdatedAt = nextChangedAt;
  record.lifecycle.expiresAt = expiresAt == null ? String(record.lifecycle.expiresAt || '') : String(expiresAt || '');
  record.lifecycle.expiryReason = expiryReason == null ? String(record.lifecycle.expiryReason || '') : String(expiryReason || '');
  if(stageChanged || forceHistory){
    appendLifecycleHistory(record, {
      stage:nextStage,
      status:nextStatus,
      changedAt:nextChangedAt,
      reason:String(reason || expiryReason || ''),
      source:String(source || 'system')
    });
  }
}

function refreshLifecycleStage(record, stage, tradingDays, reason, source){
  if(!record) return;
  const expiresAt = (record.lifecycle.stage === String(stage || '') && record.lifecycle.status === 'active' && record.lifecycle.expiresAt)
    ? record.lifecycle.expiresAt
    : (tradingDays > 0 ? businessDaysFromNow(tradingDays) : '');
  setLifecycleStage(record, {
    stage,
    status:'active',
    changedAt:new Date().toISOString(),
    expiresAt,
    expiryReason:'',
    reason,
    source,
    forceHistory:true
  });
}

function hasLockedLifecycle(record){
  return !!(record && record.lifecycle && record.lifecycle.lockReason === 'manual_expired');
}

function maybeExpireTickerRecord(record){
  if(!record || !record.lifecycle || !record.lifecycle.expiresAt) return false;
  if(['entered','exited'].includes(String(record.lifecycle.stage || ''))) return false;
  if(String(record.lifecycle.status || '') === 'closed') return false;
  const remaining = countTradingDaysBetween(todayIsoDate(), record.lifecycle.expiresAt);
  if(remaining > 0) return false;
  setLifecycleStage(record, {
    stage:'expired',
    status:'stale',
    changedAt:new Date().toISOString(),
    expiresAt:record.lifecycle.expiresAt,
    expiryReason:record.lifecycle.expiryReason || 'Aged out without progressing.',
    reason:record.lifecycle.expiryReason || 'Aged out without progressing.',
    source:'system'
  });
  return true;
}

function applyLifecycleStageFromPlan(record, source = 'plan'){
  if(!record) return;
  if(record.plan.hasValidPlan){
    refreshLifecycleStage(record, 'planned', PLAN_EXPIRY_TRADING_DAYS, 'Valid explicit trade plan saved.', source);
    return;
  }
  if(record.review.manualReview){
    refreshLifecycleStage(record, 'reviewed', REVIEW_EXPIRY_TRADING_DAYS, 'Review saved without a valid plan yet.', 'review');
  }
}

function lifecycleLabel(record){
  const item = normalizeTickerRecord(record);
  const globalVerdict = resolveGlobalVerdict(item);
  const lifecycleState = (globalVerdict.allow_watchlist || globalVerdict.allow_plan) ? 'active' : 'dropped';
  const expiry = item.watchlist && item.watchlist.expiryAt ? ` | Expires ${item.watchlist.expiryAt}` : '';
  return `${globalVerdict.final_verdict || 'watch'} | ${lifecycleState}${expiry}`;
}

function reevaluateTickerProgress(record){
  if(!record || typeof record !== 'object') return null;
  if(hasLockedLifecycle(record)){
    record.plan.triggerState = 'stale';
    if(!['invalidated','missed'].includes(String(record.plan.planValidationState || ''))){
      record.plan.planValidationState = 'stale';
    }
    record.action = {stage:'watch', priority:actionPriority('watch')};
    return record;
  }
  const evaluated = normalizeTickerRecord(record);
  record.plan.triggerState = String(evaluated.plan.triggerState || 'waiting_for_trigger');
  record.plan.planValidationState = String(evaluated.plan.planValidationState || '');
  record.plan.needsReplan = !!evaluated.plan.needsReplan;
  record.plan.missedState = String(evaluated.plan.missedState || '');
  record.plan.invalidatedState = String(evaluated.plan.invalidatedState || '');
  if(String(record.lifecycle.status || '') === 'stale' && !record.plan.invalidatedState && !record.plan.missedState && record.plan.triggerState !== 'triggered'){
    record.plan.triggerState = 'stale';
    if(!['missed','invalidated'].includes(record.plan.planValidationState)){
      record.plan.planValidationState = 'stale';
    }
  }
  if(record.plan.invalidatedState){
    setLifecycleStage(record, {
      stage:'avoided',
      status:'inactive',
      changedAt:new Date().toISOString(),
      expiresAt:'',
      expiryReason:'',
      reason:'Setup invalidated during trigger reevaluation.',
      source:'trigger'
    });
  }else if(record.plan.missedState){
    setLifecycleStage(record, {
      stage:'expired',
      status:'stale',
      changedAt:new Date().toISOString(),
      expiresAt:todayIsoDate(),
      expiryReason:'Setup missed after trigger progression.',
      reason:'Setup missed after trigger progression.',
      source:'trigger'
    });
  }else if(record.plan.triggerState === 'triggered' && record.plan.planValidationState === 'valid' && record.plan.status === 'valid' && !(record.lifecycle.stage === 'planned' && record.lifecycle.status === 'active' && record.lifecycle.expiresAt)){
    setLifecycleStage(record, {
      stage:'planned',
      status:'active',
      changedAt:new Date().toISOString(),
      expiresAt:businessDaysFromNow(PLAN_EXPIRY_TRADING_DAYS),
      expiryReason:'',
      reason:'Trigger confirmed and reviewed plan still validates.',
      source:'trigger'
    });
  }
  record.action = cloneData(evaluated.action, {stage:'watch', priority:3});
  return record;
}

function getTickerRecord(ticker){
  return getTickerRecordImpl(ticker, { normalizeTicker, state });
}

function upsertTickerRecord(ticker){
  return upsertTickerRecordImpl(ticker, {
    normalizeTicker,
    state,
    normalizeTickerRecord,
    createBaseTickerRecord: symbol => baseTickerRecord(symbol)
  });
}

function formatPlanFieldValue(value, fallback = ''){
  const numeric = numericOrNull(value);
  if(Number.isFinite(numeric)) return numeric.toFixed(2);
  return String(fallback || '');
}

function planValuesEqual(left, right){
  const fields = ['entry','stop','firstTarget'];
  return fields.every(field => {
    const l = numericOrNull(left && left[field]);
    const r = numericOrNull(right && right[field]);
    if(!Number.isFinite(l) && !Number.isFinite(r)) return true;
    if(Number.isFinite(l) !== Number.isFinite(r)) return false;
    return Math.abs(l - r) < 0.000001;
  });
}

function aiPlanCandidateForRecord(record){
  const analysisState = getReviewAnalysisState(record || {});
  const analysis = analysisState.normalizedAnalysis;
  if(!(analysis && analysis.plan_metrics_valid)) return null;
  return {
    entry:numericOrNull(analysis.entry),
    stop:numericOrNull(analysis.stop),
    firstTarget:numericOrNull(analysis.first_target)
  };
}

function resolvePlanSource(record, planCandidate = {}, requestedSource = ''){
  const source = String(requestedSource || '').trim().toLowerCase();
  if(source === 'analysis') return 'ai';
  if(source === 'scanner') return 'scanner';
  const normalizedCandidate = {
    entry:numericOrNull(planCandidate.entry),
    stop:numericOrNull(planCandidate.stop),
    firstTarget:numericOrNull(planCandidate.firstTarget)
  };
  const currentPlan = {
    entry:record && record.plan ? record.plan.entry : null,
    stop:record && record.plan ? record.plan.stop : null,
    firstTarget:record && record.plan ? record.plan.firstTarget : null
  };
  if(planValuesEqual(normalizedCandidate, currentPlan) && record && record.plan && record.plan.source){
    return String(record.plan.source);
  }
  const aiPlan = aiPlanCandidateForRecord(record);
  if(aiPlan && planValuesEqual(normalizedCandidate, aiPlan)) return 'ai';
  if(aiPlan) return 'mixed';
  if(source === 'review' || source === 'planner') return 'manual';
  return source || String(record && record.plan && record.plan.source || '');
}

function applyPlanCandidateToRecord(record, planCandidate = {}, context = {}){
  if(!record) return;
  const previousFirstTarget = numericOrNull(record.plan && record.plan.firstTarget);
  const previousAlertLevel = numericOrNull(record.plan && record.plan.targetAlert && record.plan.targetAlert.level);
  const entry = numericOrNull(planCandidate.entry);
  const stop = numericOrNull(planCandidate.stop);
  const firstTarget = numericOrNull(planCandidate.firstTarget);
  const rewardRisk = evaluateRewardRisk(entry, stop, firstTarget);
  const riskFit = evaluateRiskFit({entry, stop, ...currentRiskSettings()});
  const quoteCurrency = normalizeQuoteCurrency(record.marketData && record.marketData.currency);
  const capitalFit = evaluateCapitalFit({
    entry,
    position_size:riskFit.position_size,
    account_size_gbp:currentAccountSizeGbp(),
    quote_currency:quoteCurrency
  });
  const hasAnyFields = [entry, stop, firstTarget].some(Number.isFinite);
  record.plan.hasValidPlan = rewardRisk.valid;
  record.plan.entry = entry;
  record.plan.stop = stop;
  record.plan.firstTarget = firstTarget;
  record.plan.riskPerShare = rewardRisk.valid ? rewardRisk.riskPerShare : null;
  record.plan.rewardPerShare = rewardRisk.valid ? rewardRisk.rewardPerShare : null;
  record.plan.plannedRR = rewardRisk.valid ? rewardRisk.rrRatio : null;
  record.plan.positionSize = rewardRisk.valid ? riskFit.position_size : null;
  record.plan.positionCost = rewardRisk.valid ? capitalFit.position_cost : null;
  record.plan.positionCostGbp = rewardRisk.valid ? capitalFit.position_cost_gbp : null;
  record.plan.quoteCurrency = quoteCurrency || '';
  record.plan.exitMode = normalizeExitMode(context.exitMode || record.plan.exitMode);
  record.plan.maxLoss = rewardRisk.valid ? riskFit.max_loss : currentMaxLoss();
  record.plan.riskStatus = rewardRisk.valid ? riskFit.risk_status : (hasAnyFields ? 'invalid_plan' : 'plan_missing');
  record.plan.capitalFit = rewardRisk.valid ? capitalFit.capital_fit : 'unknown';
  record.plan.tradeability = rewardRisk.valid ? deriveTradeability('valid', riskFit.risk_status, capitalFit.capital_fit) : 'invalid';
  record.plan.capitalNote = rewardRisk.valid ? String(capitalFit.capital_note || '') : '';
  record.plan.affordability = rewardRisk.valid ? deriveAffordability({
    ...capitalFit,
    account_size_gbp:currentAccountSizeGbp()
  }) : '';
  record.plan.status = !hasAnyFields ? 'missing' : (rewardRisk.valid ? 'valid' : 'invalid');
  record.plan.firstTargetTooClose = rewardRisk.valid ? rewardRisk.rewardPerShare < (1.5 * rewardRisk.riskPerShare) : false;
  record.plan.lastPlannedAt = String(context.lastPlannedAt || context.updatedAt || record.plan.lastPlannedAt || '');
  record.plan.source = String(resolvePlanSource(record, {entry, stop, firstTarget}, context.source) || record.plan.source || '');
  const targetAlertLevel = Number.isFinite(firstTarget)
    ? firstTarget
    : (Number.isFinite(previousAlertLevel) && previousAlertLevel !== previousFirstTarget ? previousAlertLevel : null);
  const executionState = deriveExecutionPlanState(record, {
    exitMode:record.plan.exitMode,
    targetLevel:targetAlertLevel,
    currentPrice:record.marketData && record.marketData.price
  });
  record.plan.targetReviewState = executionState.targetReviewState;
  record.plan.targetActionRecommendation = executionState.targetActionRecommendation;
  record.plan.targetAlert = {
    enabled:record.plan.exitMode === 'dynamic_exit' && (record.plan.targetAlert && typeof record.plan.targetAlert === 'object'
      ? record.plan.targetAlert.enabled !== false
      : true),
    level:executionState.targetAlertLevel,
    lastState:executionState.targetReviewState
  };
  if(context.source && context.source !== 'scanner'){
    applyLifecycleStageFromPlan(record, context.source);
  }
}

function mergeMarketDataIntoRecord(record, card){
  if(!record || !card) return;
  const source = card.marketData && typeof card.marketData === 'object' ? card.marketData : card;
  const history = Array.isArray(source.history) ? source.history : (Array.isArray(record.marketData.history) ? record.marketData.history : []);
  record.marketData = {
    ...record.marketData,
    price:numericOrNull(source.price),
    asOf:String(source.fetchedAt || card.marketDataUpdatedAt || card.updatedAt || record.marketData.asOf || ''),
    source:String(source.sourceProvider || source.dataProvider || record.marketData.source || ''),
    ma20:numericOrNull(source.sma20),
    ma50:numericOrNull(source.sma50),
    ma200:numericOrNull(source.sma200),
    rsi:numericOrNull(source.rsi14),
    avgVolume:numericOrNull(source.avgVolume30d ?? source.avgVolume30),
    volume:numericOrNull(source.volume),
    currency:String(source.currency || record.marketData.currency || ''),
    perf1w:numericOrNull(source.perf1w),
    perf1m:numericOrNull(source.perf1m),
    perf3m:numericOrNull(source.perf3m),
    perf6m:numericOrNull(source.perf6m),
    perfYtd:numericOrNull(source.perfYtd),
    marketCap:numericOrNull(source.marketCap),
    history
  };
  record.meta.companyName = String(card.companyName || record.meta.companyName || '');
  record.meta.exchange = String(card.exchange || record.meta.exchange || '');
  record.meta.tradingViewSymbol = String(card.tradingViewSymbol || record.meta.tradingViewSymbol || '');
}

function mergeLegacyCardIntoRecord(record, legacyCard, options = {}){
  if(!record || !legacyCard) return;
  const card = normalizeCard(legacyCard);
  mergeMarketDataIntoRecord(record, card);
  const estimate = hasUsableScannerData(card.marketData || card) ? scannerEstimateForCard(card) : null;
  const resolvedScanType = normalizeScanType(card.scanType || card.scanSetupType || card.setupType || record.scan.scanSetupType || record.scan.scanType);
  record.scan.scanType = resolvedScanType;
  record.scan.scanSetupType = resolvedScanType;
  record.scan.setupOrigin = String(card.source || (options.fromScanner ? 'scanner' : (options.fromCards ? 'cards' : record.scan.setupOrigin || 'manual')));
  if(estimate){
    record.scan.estimatedEntryZone = numericOrNull(estimate.entry);
    record.scan.estimatedStopArea = numericOrNull(estimate.stop);
    record.scan.estimatedTargetArea = numericOrNull(estimate.target);
    record.scan.estimatedRR = numericOrNull(estimate.rr);
  }
  record.scan.score = Number.isFinite(card.score) ? card.score : record.scan.score;
  record.scan.verdict = String(card.chartVerdict || card.status || record.scan.verdict || '');
  record.scan.reasons = uniqueStrings([card.summary, ...(record.scan.reasons || [])]);
  record.scan.summary = String(card.summary || record.scan.summary || '');
  record.scan.flags = {
    ...(record.scan.flags || {}),
    checks:cloneData(card.checks || {}, {}),
    watchTracking:cloneData(card.watchTracking || null, null)
  };
  record.scan.riskStatus = String(card.riskStatus || record.scan.riskStatus || 'plan_missing');
  record.scan.trendStatus = String(card.trendStatus || record.scan.trendStatus || '');
  record.scan.pullbackStatus = String(card.pullbackStatus || record.scan.pullbackStatus || '');
  record.scan.pullbackType = String(card.pullbackType || record.scan.pullbackType || '');
  record.scan.analysisProjection = cloneData(card.analysis || record.scan.analysisProjection, null);
  record.scan.lastScannedAt = String(card.scannerUpdatedAt || record.scan.lastScannedAt || '');
  record.scan.updatedAt = String(card.scannerUpdatedAt || card.updatedAt || record.scan.updatedAt || '');
  if(options.fromScanner && record.scan.verdict){
    if(record.scan.verdict === 'Avoid'){
      setLifecycleStage(record, {
        stage:'avoided',
        status:'inactive',
        changedAt:card.scannerUpdatedAt || new Date().toISOString(),
        expiresAt:'',
        expiryReason:'',
        reason:'Scanner or market-data review marked this setup as avoid.',
        source:'scan'
      });
    }else{
      refreshLifecycleStage(record, 'shortlisted', WATCHLIST_EXPIRY_TRADING_DAYS, 'Scanner shortlisted this setup.', 'scan');
    }
  }
  record.review.notes = String(card.notes || record.review.notes || '');
  record.review.chartRef = cloneData(card.chartRef || record.review.chartRef, null);
  record.review.chartAvailable = !!(record.review.chartRef && record.review.chartRef.dataUrl);
  record.review.importedFromScreenshot = !!(record.review.importedFromScreenshot || (record.review.chartRef && /latest-chart/i.test(String(record.review.chartRef.name || ''))));
  record.review.analysisState = {
    raw:String(card.lastResponse || (record.review.analysisState && record.review.analysisState.raw) || record.review.aiAnalysisRaw || ''),
    normalized:cloneData(card.lastAnalysis || (record.review.analysisState && record.review.analysisState.normalized) || record.review.normalizedAnalysis, null),
    prompt:String(card.lastPrompt || (record.review.analysisState && record.review.analysisState.prompt) || record.review.lastPrompt || ''),
    error:String(card.lastError || (record.review.analysisState && record.review.analysisState.error) || record.review.lastError || ''),
    reviewedAt:String(card.updatedAt || (record.review.analysisState && record.review.analysisState.reviewedAt) || record.review.lastReviewedAt || '')
  };
  record.review.aiAnalysisRaw = String(card.lastResponse || record.review.aiAnalysisRaw || '');
  record.review.normalizedAnalysis = cloneData(card.lastAnalysis || record.review.normalizedAnalysis, null);
  record.review.lastReviewedAt = String(card.updatedAt || record.review.lastReviewedAt || '');
  record.review.lastPrompt = String(card.lastPrompt || record.review.lastPrompt || '');
  record.review.lastError = String(card.lastError || record.review.lastError || '');
  record.review.manualReview = card.manualReview && typeof card.manualReview === 'object' ? cloneData(card.manualReview, null) : record.review.manualReview;
  if(card.manualReview && typeof card.manualReview === 'object'){
    const savedVerdict = String(card.manualReview.status || record.review.savedVerdict || '').trim();
    record.review.savedVerdict = savedVerdict ? normalizeImportedStatus(savedVerdict) : '';
    record.review.savedSummary = String(card.manualReview.summary || record.review.savedSummary || '');
    record.review.savedScore = numericOrNull(card.manualReview.score ?? record.review.savedScore);
  }
  record.review.source = String(card.source || record.review.source || 'manual');
  record.review.cardOpen = options.cardOpen === true ? true : (options.cardOpen === false ? false : !!(record.review.cardOpen || options.fromCards));
  if(options.fromCards && record.review.cardOpen){
    refreshLifecycleStage(record, 'reviewed', REVIEW_EXPIRY_TRADING_DAYS, 'Ticker opened in Setup Review.', 'review');
  }
  record.meta.marketStatus = String(card.marketStatus || record.meta.marketStatus || state.marketStatus || '');
  record.meta.updatedAt = String(card.updatedAt || record.meta.updatedAt || new Date().toISOString());
  record.meta.pinned = !!(card.pinned || record.meta.pinned);
  if(card.lastAnalysis && card.lastAnalysis.plan_metrics_valid){
    applyPlanCandidateToRecord(record, {
      entry:card.lastAnalysis.entry,
      stop:card.lastAnalysis.stop,
      firstTarget:card.lastAnalysis.first_target
    }, {
      source:'analysis',
      lastPlannedAt:card.updatedAt || new Date().toISOString()
    });
  }else if(card.manualReview && typeof card.manualReview === 'object'){
    applyPlanCandidateToRecord(record, {
      entry:card.manualReview.entry,
      stop:card.manualReview.stop,
      firstTarget:card.manualReview.target
    }, {
      source:'review',
      lastPlannedAt:card.manualReview.savedAt || card.updatedAt || new Date().toISOString()
    });
  }else if(options.fromCards && (card.entry || card.stop || card.target)){
    applyPlanCandidateToRecord(record, {
      entry:card.entry,
      stop:card.stop,
      firstTarget:card.target
    }, {
      source:'card',
      lastPlannedAt:card.updatedAt || new Date().toISOString()
    });
  }
  if(card.lastAnalysis && String(card.lastAnalysis.verdict || '').toLowerCase() === 'avoid'){
    setLifecycleStage(record, {
      stage:'avoided',
      status:'inactive',
      changedAt:card.updatedAt || new Date().toISOString(),
      expiresAt:'',
      expiryReason:'',
      reason:'AI analysis marked the setup as avoid.',
      source:'review'
    });
  }
}

function mergeWatchlistIntoRecord(record, entry){
  if(!record || !entry) return;
  const normalized = normalizeWatchlistEntry(entry);
  if(!normalized) return;
  record.watchlist.inWatchlist = true;
  record.watchlist.addedAt = normalized.dateAdded;
  record.watchlist.addedScore = normalized.scoreWhenAdded;
  record.watchlist.status = normalized.verdictWhenAdded || '';
  record.watchlist.expiryAfterTradingDays = normalized.expiryAfterTradingDays;
  record.watchlist.expiryAt = tradingDaysFrom(normalized.dateAdded, normalized.expiryAfterTradingDays);
  record.watchlist.updatedAt = `${normalized.dateAdded}T12:00:00.000Z`;
  setLifecycleStage(record, {
    stage:'watchlist',
    status:'active',
    changedAt:`${normalized.dateAdded}T12:00:00.000Z`,
    expiresAt:record.watchlist.expiryAt,
    expiryReason:'Watchlist aged beyond the default 5 trading-day window.',
    reason:'Added to watchlist.',
    source:'review'
  });
}

function mergeDiaryRecordIntoRecord(record, tradeRecord){
  if(!record || !tradeRecord) return;
  const normalized = normalizeTradeRecord(tradeRecord);
  const existingIndex = record.diary.records.findIndex(item => item.id === normalized.id);
  if(existingIndex >= 0) record.diary.records.splice(existingIndex, 1, normalized);
  else record.diary.records.push(normalized);
  record.diary.records = record.diary.records
    .map(normalizeTradeRecord)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.id).localeCompare(String(a.id)));
  record.diary.records = record.diary.records.slice(0, 100);
  record.diary.diaryIds = record.diary.records.map(item => item.id);
  record.diary.hasDiary = !!record.diary.records.length;
  record.diary.lastOutcomeAt = String(normalized.date || record.diary.lastOutcomeAt || '');
  const lifecycle = deriveDiaryLifecycleState(normalized);
  setLifecycleStage(record, {
    stage:lifecycle.stage,
    status:lifecycle.status,
    changedAt:lifecycle.changedAt,
    expiresAt:'',
    expiryReason:'',
    reason:lifecycle.reason,
    source:lifecycle.source
  });
  record.diary.tradeOutcome = buildTradeOutcomeSnapshot(normalized);
}

function tickerRecordToLegacyCard(record){
  // Compatibility adapter retained because several current render/helpers still
  // consume the older card-shaped object. Canonical runtime state remains
  // tickerRecords; this function is a read-only projection layer.
  const item = normalizeTickerRecord(record);
  const fallbackReview = item.review.manualReview && typeof item.review.manualReview === 'object' ? item.review.manualReview : null;
  const reviewVerdict = savedReviewVerdictForRecord(item);
  const reviewSummary = String(item.review.savedSummary || (fallbackReview && fallbackReview.summary) || '').trim();
  const reviewScore = numericOrNull(item.review.savedScore ?? (fallbackReview && fallbackReview.score));
  const currentVerdict = preferredVerdictForRecord(item);
  const currentSummary = preferredSummaryForRecord(item);
  const currentScore = preferredScoreForRecord(item);
  const card = normalizeCard({
    ticker:item.ticker,
    status:currentVerdict || reviewVerdict || 'Watch',
    chartVerdict:currentVerdict || reviewVerdict || 'Watch',
    riskStatus:item.plan.riskStatus || item.scan.riskStatus || 'plan_missing',
    score:Number.isFinite(currentScore) ? currentScore : (Number.isFinite(reviewScore) ? reviewScore : 0),
    summary:currentSummary || reviewSummary || item.scan.reasons[0] || 'No review saved yet.',
    checks:cloneData((fallbackReview && fallbackReview.checks) || (item.scan.flags && item.scan.flags.checks) || {}, {}),
    manualReview:cloneData(item.review.manualReview, null),
    notes:item.review.notes || '',
    chartRef:cloneData(item.review.chartRef, null),
    lastPrompt:item.review.lastPrompt || '',
    lastResponse:item.review.aiAnalysisRaw || '',
    lastError:item.review.lastError || '',
    lastAnalysis:cloneData(item.review.normalizedAnalysis, null),
    entry:formatPlanFieldValue(item.plan.entry, fallbackReview && fallbackReview.entry),
    stop:formatPlanFieldValue(item.plan.stop, fallbackReview && fallbackReview.stop),
    target:formatPlanFieldValue(item.plan.firstTarget, fallbackReview && fallbackReview.target),
    source:item.review.source || 'manual',
    updatedAt:item.meta.updatedAt || item.review.lastReviewedAt || '',
    marketStatus:item.meta.marketStatus || state.marketStatus,
    analysis:cloneData(item.scan.analysisProjection, null),
    companyName:item.meta.companyName || '',
    exchange:item.meta.exchange || '',
    tradingViewSymbol:item.meta.tradingViewSymbol || '',
    marketCap:item.marketData.marketCap,
    marketData:item.marketData.price != null || item.marketData.ma20 != null || item.marketData.ma50 != null || item.marketData.ma200 != null ? {
      price:item.marketData.price,
      sma20:item.marketData.ma20,
      sma50:item.marketData.ma50,
      sma200:item.marketData.ma200,
      rsi14:item.marketData.rsi,
      avgVolume30d:item.marketData.avgVolume,
      volume:item.marketData.volume,
      perf1w:item.marketData.perf1w,
      perf1m:item.marketData.perf1m,
      perf3m:item.marketData.perf3m,
      perf6m:item.marketData.perf6m,
      perfYtd:item.marketData.perfYtd,
      marketCap:item.marketData.marketCap,
      history:item.marketData.history,
      fetchedAt:item.marketData.asOf,
      sourceProvider:item.marketData.source,
      exchange:item.meta.exchange,
      companyName:item.meta.companyName,
      tradingViewSymbol:item.meta.tradingViewSymbol
    } : null,
    marketDataUpdatedAt:item.marketData.asOf || '',
    scannerUpdatedAt:item.scan.lastScannedAt || '',
    scanType:item.scan.scanType || '',
    scanSetupType:item.scan.scanSetupType || item.scan.scanType || '',
    setupType:item.scan.scanType || '',
    setupOrigin:item.scan.setupOrigin || '',
    trendStatus:item.scan.trendStatus || '',
    pullbackStatus:item.scan.pullbackStatus || '',
    pullbackType:item.scan.pullbackType || '',
    rewardPerShare:item.plan.rewardPerShare,
    rrRatio:item.plan.hasValidPlan ? item.plan.plannedRR : item.scan.estimatedRR,
    rrState:item.plan.hasValidPlan && Number.isFinite(item.plan.plannedRR) ? (item.plan.plannedRR >= 2 ? 'strong' : (item.plan.plannedRR >= 1.5 ? 'acceptable' : 'weak')) : '',
    firstTargetTooClose:item.plan.firstTargetTooClose,
    perf1w:item.marketData.perf1w,
    perf1m:item.marketData.perf1m,
    perf3m:item.marketData.perf3m,
    perf6m:item.marketData.perf6m,
    perfYtd:item.marketData.perfYtd,
    rsi14:item.marketData.rsi,
    price:item.marketData.price,
    sma20:item.marketData.ma20,
    sma50:item.marketData.ma50,
    sma200:item.marketData.ma200,
    volume:item.marketData.volume,
    avgVolume30d:item.marketData.avgVolume,
    pinned:item.meta.pinned
  });
  return card;
}

function tickerRecordToWatchlistEntry(record){
  const item = normalizeTickerRecord(record);
  if(!item.watchlist.inWatchlist) return null;
  const expiryAfterTradingDays = item.watchlist.expiryAfterTradingDays || 5;
  return normalizeWatchlistEntry({
    ticker:item.ticker,
    dateAdded:item.watchlist.addedAt || todayIsoDate(),
    scoreWhenAdded:item.watchlist.addedScore,
    verdictWhenAdded:item.watchlist.status || item.scan.verdict || '',
    expiryAfterTradingDays
  });
}

function allTickerRecords(){
  const records = Object.values(normalizeTickerRecordsMap(state.tickerRecords || {}));
  records.forEach(record => {
    reevaluateTickerProgress(record);
    syncWatchlistLifecycle(record);
    maybeExpireTickerRecord(record);
  });
  state.tickerRecords = Object.fromEntries(records.map(record => [record.ticker, record]));
  return records;
}

function watchlistTickerRecords(){
  return allTickerRecords()
    .filter(record => record.watchlist && record.watchlist.inWatchlist)
    .sort((a, b) => {
      const lifecycleA = syncWatchlistLifecycle(a) || watchlistLifecycleSnapshot(a);
      const lifecycleB = syncWatchlistLifecycle(b) || watchlistLifecycleSnapshot(b);
      return lifecycleA.rank - lifecycleB.rank
        || watchlistPriorityForRecord(b).score - watchlistPriorityForRecord(a).score
        || String(b.watchlist.addedAt || '').localeCompare(String(a.watchlist.addedAt || ''))
        || a.ticker.localeCompare(b.ticker);
    });
}

function watchlistPriorityForRecord(record){
  const item = normalizeTickerRecord(record);
  const lifecycle = syncWatchlistLifecycle(record) || watchlistLifecycleSnapshot(item);
  const derivedStates = analysisDerivedStatesFromRecord(item);
  const rrResolution = resolveScannerStateWithTrace(item);
  const setupScore = setupScoreForRecord(item);
  let score = Number.isFinite(setupScore) ? setupScore : 0;
  const bounceState = String(derivedStates.bounceState || '').toLowerCase();
  const volumeState = String(derivedStates.volumeState || '').toLowerCase();
  const pullbackZone = String(derivedStates.pullbackZone || '').toLowerCase();
  const hostileMarket = isHostileMarketStatus((item.meta && item.meta.marketStatus) || state.marketStatus);
  if(bounceState === 'confirmed') score += 2;
  else if(bounceState === 'early' || bounceState === 'attempt') score += 1;
  else if(bounceState === 'none') score -= 2;
  if(volumeState === 'supportive' || volumeState === 'strong') score += 1;
  else if(volumeState === 'weak') score -= 1;
  if(rrResolution.rr_reliability === 'low') score -= 2;
  if(hostileMarket && pullbackZone === 'near_50ma') score -= 1;
  if(lifecycle.state === 'entry') score += 3;
  else if(lifecycle.state === 'near_entry') score += 2;
  else if(lifecycle.state === 'watch') score += 1;
  else if(lifecycle.state === 'monitor') score -= 1;
  else if(lifecycle.state === 'avoid') score -= 4;
  else if(lifecycle.state === 'dead') score -= 5;
  score = Math.max(0, Math.min(10, Math.round(score)));
  const bucket = lifecycle.bucket || ({
    entry:'tradeable_entry',
    near_entry:'tradeable_entry',
    watch:'monitor_watch',
    monitor:'monitor_watch',
    avoid:'low_priority_avoid',
    dead:'low_priority_avoid'
  })[String(lifecycle.state || '').toLowerCase()] || 'monitor_watch';
  if(record && record.watchlist && typeof record.watchlist === 'object'){
    record.watchlist.watchlist_priority_score = score;
    record.watchlist.watchlist_priority_bucket = bucket;
  }
  return {score, bucket};
}

function setWatchlistLiveRefreshPending(tickers, pending = true){
  const normalizedTickers = uniqueTickers((Array.isArray(tickers) ? tickers : [tickers]).map(normalizeTicker).filter(Boolean));
  if(!normalizedTickers.length) return;
  uiState.watchlistLiveRefreshPending = uiState.watchlistLiveRefreshPending && typeof uiState.watchlistLiveRefreshPending === 'object'
    ? uiState.watchlistLiveRefreshPending
    : {};
  normalizedTickers.forEach(symbol => {
    if(pending) uiState.watchlistLiveRefreshPending[symbol] = true;
    else delete uiState.watchlistLiveRefreshPending[symbol];
  });
}

function clearWatchlistLiveRefreshPending(ticker){
  setWatchlistLiveRefreshPending(ticker, false);
}

function isWatchlistLiveRefreshPending(ticker){
  const symbol = normalizeTicker(ticker);
  if(!symbol) return false;
  return !!(uiState.watchlistLiveRefreshPending && uiState.watchlistLiveRefreshPending[symbol]);
}

function diaryTradeRecords(){
  return allTickerRecords()
    .flatMap(record => (record.diary && Array.isArray(record.diary.records) ? record.diary.records.map(item => ({record, trade:normalizeTradeRecord(item)})) : []))
    .sort((a, b) => String(b.trade.date || '').localeCompare(String(a.trade.date || '')) || String(b.trade.id).localeCompare(String(a.trade.id)));
}

function recordRrValue(record){
  const item = normalizeTickerRecord(record);
  return item.plan.hasValidPlan ? item.plan.plannedRR : item.scan.estimatedRR;
}

function statusRankFromRecord(record){
  const item = normalizeTickerRecord(record);
  return item.action.priority;
}

function focusQueuePriorityForRecord(record){
  const item = normalizeTickerRecord(record);
  const targetReviewLabel = item.plan.status === 'valid' ? targetReviewQueueLabel(item.plan.targetReviewState) : '';
  if(targetReviewLabel === 'At Target' || targetReviewLabel === 'Review Target') return -1;
  if(targetReviewLabel === 'Near Target') return 0;
  return statusRankFromRecord(item);
}

function resultSortScoreFromRecord(record){
  const item = normalizeTickerRecord(record);
  const rrRatio = numericOrNull(recordRrValue(item));
  const score = Number.isFinite(item.setup.score) ? item.setup.score : 0;
  const cautionPenalty = item.setup.marketCaution ? 0.01 : 0;
  return ((5 - item.action.priority) * 1000) + (score * 100) + (Number.isFinite(rrRatio) ? rrRatio : 0) - cautionPenalty;
}

function rankedTickerRecords(){
  if(uiState.scannerShortlistSuppressed) return [];
  const sessionTickers = new Set(uniqueTickers(uiState.scannerSessionTickers || []));
  if(!sessionTickers.size) return [];
  return allTickerRecords()
    .filter(record => sessionTickers.has(normalizeTickerRecord(record).ticker))
    .filter(record => record.scan && (record.scan.lastScannedAt || record.scan.verdict || Number.isFinite(record.scan.score)))
    .sort((a, b) =>
      statusRankFromRecord(a) - statusRankFromRecord(b)
      || (Number.isFinite(b.setup.score) ? b.setup.score : setupScoreForRecord(b)) - (Number.isFinite(a.setup.score) ? a.setup.score : setupScoreForRecord(a))
      || (numericOrNull(recordRrValue(b)) || -999) - (numericOrNull(recordRrValue(a)) || -999)
      || ((a.setup && a.setup.marketCaution) ? 1 : 0) - ((b.setup && b.setup.marketCaution) ? 1 : 0)
      || a.ticker.localeCompare(b.ticker)
    );
}

function openCardTickerRecords(){
  return allTickerRecords()
    .filter(record => record.review && record.review.cardOpen)
    .sort((a, b) => statusRankFromRecord(a) - statusRankFromRecord(b) || resultSortScoreFromRecord(b) - resultSortScoreFromRecord(a) || a.ticker.localeCompare(b.ticker));
}

function syncTickerRecordsFromLegacyCollections(){
  // Compatibility-only migration helper for older localStorage snapshots.
  // Normal runtime logic should not depend on legacy arrays as sources of truth.
  const records = normalizeTickerRecordsMap(state.tickerRecords || {});
  (state.tickers || []).forEach(ticker => {
    const record = records[normalizeTicker(ticker)] || normalizeTickerRecord(baseTickerRecord(ticker));
    records[record.ticker] = record;
  });
  (state.cards || []).map(normalizeCard).forEach(card => {
    const record = records[card.ticker] || normalizeTickerRecord(baseTickerRecord(card.ticker));
    mergeLegacyCardIntoRecord(record, card, {fromScanner:false, fromCards:true, cardOpen:true});
    records[card.ticker] = record;
  });
  (state.watchlist || []).map(normalizeWatchlistEntry).filter(Boolean).forEach(entry => {
    const record = records[entry.ticker] || normalizeTickerRecord(baseTickerRecord(entry.ticker));
    mergeWatchlistIntoRecord(record, entry);
    records[entry.ticker] = record;
  });
  (state.tradeDiary || []).map(normalizeTradeRecord).forEach(entry => {
    const record = records[entry.ticker] || normalizeTickerRecord(baseTickerRecord(entry.ticker));
    mergeDiaryRecordIntoRecord(record, entry);
    records[entry.ticker] = record;
  });
  Object.values(records).forEach(record => {
    record.diary.hasDiary = !!record.diary.records.length;
    record.diary.diaryIds = record.diary.records.map(item => item.id);
    if(record.watchlist.inWatchlist && record.watchlist.expiryAt && countTradingDaysBetween(todayIsoDate(), record.watchlist.expiryAt) <= 0){
      record.watchlist.debug = record.watchlist.debug && typeof record.watchlist.debug === 'object' ? record.watchlist.debug : {};
      record.watchlist.debug.watchlist_removed_by = '';
      record.watchlist.debug.removal_global_verdict = '';
      record.watchlist.debug.removal_allow_watchlist = '';
      record.watchlist.debug.removal_source = 'normalizeTickerRecordsMap';
      const warnings = new Set(Array.isArray(record.watchlist.debug.warnings) ? record.watchlist.debug.warnings : []);
      warnings.add('Legacy expiry normalization preserved this watchlist entry on page load.');
      record.watchlist.debug.warnings = [...warnings].slice(0, 5);
    }
    maybeExpireTickerRecord(record);
    record.meta.updatedAt = String(record.meta.updatedAt || new Date().toISOString());
  });
  state.tickerRecords = records;
}

function syncLegacyCollectionsFromTickerRecords(){
  // Compatibility projection layer for older UI/helper paths. These arrays are
  // generated from tickerRecords only and are not authoritative sources.
  const records = Object.values(normalizeTickerRecordsMap(state.tickerRecords || {}));
  state.cards = records.filter(record => record.review.cardOpen).map(tickerRecordToLegacyCard);
  state.scannerResults = [];
  state.watchlist = records
    .map(tickerRecordToWatchlistEntry)
    .filter(Boolean)
    .sort((a, b) => b.dateAdded.localeCompare(a.dateAdded) || a.ticker.localeCompare(b.ticker));
  state.tradeDiary = records
    .flatMap(record => record.diary.records.map(normalizeTradeRecord))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.id).localeCompare(String(a.id)))
    .slice(0, 100);
}

function commitTickerState(){
  console.debug('PROJECTION_FROM_TICKER_RECORD', 'syncLegacyCollections');
  syncLegacyCollectionsFromTickerRecords();
  persistState();
  scheduleTrackedRecordsSync();
}

function syncCardDraftsFromDom(){
  openCardTickerRecords().forEach(record => {
    const notesEl = $(`notes-${record.ticker}`);
    if(notesEl) record.review.notes = notesEl.value;
    const promptEl = $(`prompt-${record.ticker}`);
    if(promptEl) uiState.promptOpen[record.ticker] = promptEl.open;
    const responseEl = $(`response-${record.ticker}`);
    if(responseEl) uiState.responseOpen[record.ticker] = responseEl.open;
  });
}

function syncStateFromDom(){
  syncCardDraftsFromDom();
  state.accountSize = Number($('accountSize').value || 0);
  state.riskPercent = Number($('riskPercent').value || 0);
  state.maxLossOverride = $('maxLossOverride') ? $('maxLossOverride').value.trim() : '';
  state.wholeSharesOnly = $('wholeSharesOnly') ? !!$('wholeSharesOnly').checked : true;
  state.userRiskPerTrade = currentMaxLoss();
  state.maxRisk = state.userRiskPerTrade;
  state.marketStatus = $('marketStatus').value;
  state.marketStatusMode = normalizeMarketStatusMode($('marketStatusMode') ? $('marketStatusMode').value : state.marketStatusMode);
  state.setupType = $('scannerSetupType') ? normalizeScanType($('scannerSetupType').value) : '';
  state.listName = $('listName').value || "Today's Scan";
  if($('universeMode')) state.universeMode = normalizeUniverseMode($('universeMode').value) || defaultUniverseModeForTickers(state.tickers);
  if($('apiKey')) state.apiKey = $('apiKey').readOnly ? '' : $('apiKey').value.trim();
  if($('dataProvider')) state.dataProvider = normalizeDataProvider($('dataProvider').value);
  if($('apiPlan')) state.apiPlan = String($('apiPlan').value || DEFAULT_API_PLAN);
  state.aiEndpoint = $('aiEndpoint').value.trim() || defaultAiEndpoint;
  state.marketDataEndpoint = defaultMarketDataEndpoint;
  state.showExpiredWatchlist = $('showExpiredWatchlist') ? !!$('showExpiredWatchlist').checked : !!state.showExpiredWatchlist;
  state.dismissedAlertIds = Array.isArray(state.dismissedAlertIds) ? state.dismissedAlertIds.slice(-200) : [];
}

function saveState(){
  syncStateFromDom();
  commitTickerState();
  scheduleTrackedRecordsSync();
  renderStats();
  renderFinalUniversePreview();
}

function clearScannerSessionState(options = {}){
  uiState.scannerSessionTickers = [];
  uiState.scannerLastScanAt = '';
  uiState.scannerSessionId = '';
  if(options.suppressed === true) uiState.scannerShortlistSuppressed = true;
  else if(options.suppressed === false) uiState.scannerShortlistSuppressed = false;
  clearScanCardSecondaryUi();
}

function setScannerSessionResults(tickers, scannedAt){
  uiState.scannerSessionTickers = uniqueTickers(tickers || []);
  uiState.scannerLastScanAt = String(scannedAt || new Date().toISOString());
  uiState.scannerSessionId = `scan-${Date.now()}`;
  uiState.scannerShortlistSuppressed = false;
}

function loadState(){
  const fullStorageInfo = inspectStorageKey(key);
  const liteStorageInfo = inspectStorageKey(liteKey);
  const settingsStorageInfo = inspectStorageKey(settingsKey);
  const recordsLiteStorageInfo = inspectStorageKey(recordsLiteKey);
  const settingsState = safeStorageGet(settingsKey, {}) || {};
  const recordsLiteState = safeStorageGet(recordsLiteKey, {}) || {};
  const liteState = safeStorageGet(liteKey, {}) || {};
  const fullState = safeStorageGet(key, {}) || {};
  Object.assign(state, createDefaultState(), settingsState, recordsLiteState, liteState, fullState);
  uiState.activeReviewAddsToScannerUniverse = true;
  uiState.activeReviewVerdictOverride = '';
  clearScannerSessionState({suppressed:false});
  delete state.lastImportRaw;
  state.aiEndpoint = state.aiEndpoint || defaultAiEndpoint;
  state.marketDataEndpoint = defaultMarketDataEndpoint;
  state.dataProvider = normalizeDataProvider(state.dataProvider);
  state.apiPlan = String(state.apiPlan || DEFAULT_API_PLAN);
  state.riskPercent = Number.isFinite(Number(state.riskPercent)) && Number(state.riskPercent) > 0
    ? Number(state.riskPercent)
    : ((Number(state.accountSize) > 0 && Number(state.maxRisk) > 0) ? Number(state.maxRisk) / Number(state.accountSize) : 0.01);
  state.maxLossOverride = state.maxLossOverride == null ? '' : String(state.maxLossOverride);
  state.userRiskPerTrade = Number.isFinite(Number(state.userRiskPerTrade)) && Number(state.userRiskPerTrade) > 0
    ? Number(state.userRiskPerTrade)
    : 0;
  state.wholeSharesOnly = state.wholeSharesOnly !== false;
  state.marketStatusMode = normalizeMarketStatusMode(state.marketStatusMode);
  state.setupType = normalizeScanType(state.setupType);
  state.userRiskPerTrade = currentMaxLoss();
  state.maxRisk = state.userRiskPerTrade;
  state.tickers = parseTickers((state.tickers || []).join('\n'));
  state.universeMode = normalizeUniverseMode(state.universeMode) || defaultUniverseModeForTickers(state.tickers);
  state.recentTickers = uniqueTickers(state.recentTickers || []);
  state.tickerRecords = normalizeTickerRecordsMap(state.tickerRecords);
  state.lastAlertsSeenAt = String(state.lastAlertsSeenAt || '');
  state.backendTrackedVersions = state.backendTrackedVersions && typeof state.backendTrackedVersions === 'object' ? state.backendTrackedVersions : {};
  state.backendLocalTrackedTickers = uniqueTickers(state.backendLocalTrackedTickers || []);
  state.dismissedAlertIds = Array.isArray(state.dismissedAlertIds) ? state.dismissedAlertIds.slice(-200) : [];
  state.dismissedFocusTickers = uniqueTickers(state.dismissedFocusTickers || []);
  state.dismissedFocusCycle = String(state.dismissedFocusCycle || '');
  state.activeQueueClearedCycle = String(state.activeQueueClearedCycle || '');
  state.activeQueueClearedTickers = uniqueTickers(state.activeQueueClearedTickers || []);
  state.activeQueueManualTickers = uniqueTickers(state.activeQueueManualTickers || []);
  state.activeQueueLastRebuiltCycle = String(state.activeQueueLastRebuiltCycle || '');
  state.watchlist = (state.watchlist || []).map(normalizeWatchlistEntry).filter(Boolean);
  state.scannerResults = [];
  state.cards = (state.cards || []).map(normalizeCard).filter(card => card.ticker);
  state.tradeDiary = (state.tradeDiary || []).map(normalizeTradeRecord);
  state.symbolMeta = state.symbolMeta && typeof state.symbolMeta === 'object' ? state.symbolMeta : {};
  state.scannerDebug = [];
  state.showExpiredWatchlist = !!state.showExpiredWatchlist;
  const preSyncTrace = {
    timestamp:new Date().toISOString(),
    appVersion:APP_VERSION,
    storage:{
      full:fullStorageInfo,
      lite:liteStorageInfo,
      settings:settingsStorageInfo,
      recordsLite:recordsLiteStorageInfo
    },
    restoredMarketStatus:String(state.marketStatus || ''),
    restoredUniverseMode:String(state.universeMode || ''),
    restoredSetupType:String(state.setupType || ''),
    restoredTickerCount:Array.isArray(state.tickers) ? state.tickers.length : 0,
    restoredLegacyWatchlistCount:Array.isArray(state.watchlist) ? state.watchlist.length : 0,
    preSyncCanonicalWatchlistCount:countCanonicalWatchlistRecords(state.tickerRecords)
  };
  syncTickerRecordsFromLegacyCollections();
  syncLegacyCollectionsFromTickerRecords();
  const startupTrace = {
    ...preSyncTrace,
    postSyncCanonicalWatchlistCount:countCanonicalWatchlistRecords(state.tickerRecords),
    postSyncLegacyWatchlistCount:Array.isArray(state.watchlist) ? state.watchlist.length : 0
  };
  safeStorageSet(startupTraceKey, startupTrace);
  Object.values(state.tickerRecords || {}).forEach(record => {
    if(!record || !record.watchlist || !record.watchlist.inWatchlist) return;
    appendWatchlistDebugEvent(record, {
      at:startupTrace.timestamp,
      source:'startup_restore',
      result:`restored: watchlist=${startupTrace.postSyncLegacyWatchlistCount} | market=${startupTrace.restoredMarketStatus || '(none)'} | mode=${startupTrace.restoredUniverseMode || '(none)'} | setup=${startupTrace.restoredSetupType || '(none)'}`
    });
  });
  ensureActiveQueueCycle();
  scheduleTrackedRecordsSync(200);
  persistState();
  $('accountSize').value = state.accountSize;
  if($('riskPercent')) $('riskPercent').value = state.riskPercent;
  if($('maxLossOverride')) $('maxLossOverride').value = state.maxLossOverride;
  if($('wholeSharesOnly')) $('wholeSharesOnly').checked = state.wholeSharesOnly !== false;
  $('marketStatus').value = state.marketStatus || 'S&P above 50 MA';
  if($('marketStatusMode')) $('marketStatusMode').value = normalizeMarketStatusMode(state.marketStatusMode);
  if($('scannerSetupType')) $('scannerSetupType').value = state.setupType || '';
  $('listName').value = state.listName || "Today's Scan";
  if($('universeMode')) $('universeMode').value = effectiveUniverseMode();
  $('tickerInput').value = (state.tickers || []).join('\n');
  if($('tvImportInput')) $('tvImportInput').value = '';
  if($('ocrReviewInput')) $('ocrReviewInput').value = '';
  if($('apiKey') && !$('apiKey').readOnly) $('apiKey').value = state.apiKey || '';
  if($('dataProvider')) $('dataProvider').value = state.dataProvider || DEFAULT_PROVIDER;
  if($('apiPlan')) $('apiPlan').value = state.apiPlan || DEFAULT_API_PLAN;
  $('aiEndpoint').value = state.aiEndpoint || defaultAiEndpoint;
  if($('showExpiredWatchlist')) $('showExpiredWatchlist').checked = !!state.showExpiredWatchlist;
  if($('appVersion')) $('appVersion').textContent = APP_VERSION;
  setResetStatus(summarizeStartupTrace(startupTrace), startupTrace.postSyncCanonicalWatchlistCount < startupTrace.preSyncCanonicalWatchlistCount ? 'warntext' : 'ok');
  uiState.runtimeDebugContext = 'startup';
  uiState.runtimeDebugEntries = [{
    source:'startup_restore',
    message:summarizeStartupTrace(startupTrace),
    context:'startup',
    details:startupTrace
  }, ...(uiState.runtimeDebugEntries || [])].slice(0, 12);
  updateProviderStatusNote();
  renderStats();
  renderTickerQuickLists();
  renderTvImportPreview(state.tickers && state.tickers.length ? state.tickers : [], state.tickers && state.tickers.length ? 'manual' : 'default');
  renderFinalUniversePreview();
  renderSavedScannerUniverseSnapshot();
  clearOcrReview();
  syncOcrReviewVisibility();
  renderScannerResults();
  renderCards();
  renderScannerRulesPanel();
  uiState.watchlistLiveRefreshPending = {};
  const startupRefreshTickers = watchlistTickerRecords().map(record => normalizeTickerRecord(record).ticker).filter(Boolean);
  setWatchlistLiveRefreshPending(startupRefreshTickers, true);
  renderWatchlist();
  renderWorkflowAlerts();
  renderTradeDiary();
  renderPatternAnalytics();
  renderPlannerPlanSummary();
  refreshRiskContextForActiveSetups();
  if(startupRefreshTickers.length){
    setStatus('scannerSelectionStatus', `<span class="ok">Refreshing ${escapeHtml(String(startupRefreshTickers.length))} watchlist ticker${startupRefreshTickers.length === 1 ? '' : 's'} from live data...</span>`);
  }
  refreshWatchlistRecordsFromSourceOfTruth({
    source:'startup_restore',
    persist:true,
    render:true,
    renderProgress:true,
    clearReviewOverride:false
  }).then(summary => {
    if(!summary || !summary.attempted) return;
    const message = summary.failed
      ? `Startup refresh checked ${summary.refreshed}/${summary.attempted} watchlist ticker${summary.attempted === 1 ? '' : 's'} from live data.`
      : `Startup refresh checked ${summary.refreshed} watchlist ticker${summary.refreshed === 1 ? '' : 's'} from live data.`;
    setStatus('scannerSelectionStatus', `<span class="${summary.failed ? 'warntext' : 'ok'}">${escapeHtml(message)}</span>`);
  }).catch(() => {
    setStatus('scannerSelectionStatus', '<span class="warntext">Startup watchlist refresh could not complete. Kept saved watchlist state active locally.</span>');
  });
}

function renderStats(){
  state.userRiskPerTrade = currentMaxLoss();
  state.maxRisk = state.userRiskPerTrade;
  const pct = state.accountSize ? ((state.maxRisk / state.accountSize) * 100).toFixed(1) : '0.0';
  if($('accountStat')) $('accountStat').textContent = formatGbp(state.accountSize);
  if($('riskStat')) $('riskStat').textContent = formatGbp(state.maxRisk);
  if($('riskPctStat')) $('riskPctStat').textContent = `${pct}%`;
  if($('accountRiskStrip')) $('accountRiskStrip').textContent = `${formatGbp(state.accountSize)}`;
  if($('marketStatusStrip')) $('marketStatusStrip').textContent = marketStatusDisplayValue();
  if($('scannerModeStrip')) $('scannerModeStrip').textContent = scannerModeChipLabel(effectiveUniverseMode());
  if($('setupTypeStrip')) $('setupTypeStrip').textContent = setupTypeChipLabel(state.setupType);
  renderRiskQuickPanel();
  renderControlStripSelector();
  refreshMarketContextWidgets();
}

function normalizedRiskQuickValue(value){
  const numeric = Number(value);
  const maxConfigured = numericOrNull(state.riskQuickMax);
  const maxValue = Number.isFinite(maxConfigured) && maxConfigured >= 100
    ? Math.round(maxConfigured / 10) * 10
    : 100;
  if(!Number.isFinite(numeric) || numeric <= 0) return Math.max(10, Math.min(maxValue, 40));
  const snapped = Math.round(numeric / 10) * 10;
  return Math.max(10, Math.min(maxValue, snapped));
}

function renderRiskQuickPreview(rawValue){
  const toggle = $('riskQuickToggle');
  const valueLabel = $('riskQuickValue');
  if(!toggle && !valueLabel) return;
  const numeric = Number(rawValue);
  const snapped = normalizedRiskQuickValue(numeric);
  if(toggle) toggle.textContent = `Risk ${formatPound(snapped)}`;
  if(valueLabel) valueLabel.textContent = formatPound(snapped);
}

function queueRiskContextRefresh(source = 'risk_quick'){
  if(riskQuickRefreshRaf){
    cancelAnimationFrame(riskQuickRefreshRaf);
    riskQuickRefreshRaf = 0;
  }
  riskQuickRefreshRaf = requestAnimationFrame(() => {
    riskQuickRefreshRaf = 0;
    refreshRiskContextForActiveSetups({source, force:true});
  });
}

function applyUserRiskPerTrade(value, options = {}){
  const nextRisk = normalizedRiskQuickValue(value);
  const previous = Number(state.userRiskPerTrade || currentMaxLoss() || 0);
  state.userRiskPerTrade = nextRisk;
  state.maxRisk = nextRisk;
  state.maxLossOverride = String(nextRisk);
  if(Number.isFinite(Number(state.accountSize)) && Number(state.accountSize) > 0){
    state.riskPercent = nextRisk / Number(state.accountSize);
  }
  if($('maxLossOverride')) $('maxLossOverride').value = String(nextRisk);
  if($('riskPercent')) $('riskPercent').value = String(state.riskPercent || '');
  renderRiskQuickPanel();
  if(options.skipRefresh === true) return;
  if(Math.abs(previous - nextRisk) < 0.01 && options.force !== true) return;
  queueRiskContextRefresh(String(options.source || 'risk_quick'));
}

function openRiskQuickPanel(){
  uiState.riskQuickOpen = true;
  renderRiskQuickPanel();
}

function closeRiskQuickPanel(){
  uiState.riskQuickOpen = false;
  renderRiskQuickPanel();
}

function renderRiskQuickPanel(){
  const toggle = $('riskQuickToggle');
  const panel = $('riskQuickPanel');
  const slider = $('riskQuickSlider');
  const valueLabel = $('riskQuickValue');
  if(!toggle || !panel) return;
  const riskValue = normalizedRiskQuickValue(state.userRiskPerTrade || currentMaxLoss() || 40);
  toggle.textContent = `Risk ${formatPound(riskValue)}`;
  toggle.setAttribute('aria-expanded', uiState.riskQuickOpen ? 'true' : 'false');
  if(valueLabel) valueLabel.textContent = formatPound(riskValue);
  if(slider){
    const maxConfigured = numericOrNull(state.riskQuickMax);
    const maxValue = Number.isFinite(maxConfigured) && maxConfigured >= 100
      ? Math.round(maxConfigured / 10) * 10
      : 100;
    slider.min = '10';
    slider.max = String(maxValue);
    slider.step = '1';
    slider.value = String(riskValue);
  }
  panel.hidden = !uiState.riskQuickOpen;
  panel.classList.toggle('is-open', !!uiState.riskQuickOpen);
}

function bindRiskQuickControls(){
  const anchor = $('riskQuickAnchor');
  const toggle = $('riskQuickToggle');
  const panel = $('riskQuickPanel');
  const slider = $('riskQuickSlider');
  if(!anchor || !toggle || !panel || !slider) return;
  if(anchor.dataset.boundRiskQuick === '1'){
    renderRiskQuickPanel();
    return;
  }
  anchor.dataset.boundRiskQuick = '1';
  toggle.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    if(uiState.riskQuickOpen) closeRiskQuickPanel();
    else openRiskQuickPanel();
  });
  slider.addEventListener('input', event => {
    const snapped = normalizedRiskQuickValue(event.target.value);
    applyUserRiskPerTrade(snapped, {source:'risk_slider_preview', force:true, skipRefresh:true});
    renderRiskQuickPreview(snapped);
  });
  slider.addEventListener('change', event => {
    const snapped = normalizedRiskQuickValue(event.target.value);
    applyUserRiskPerTrade(snapped, {source:'risk_slider_commit', force:true});
  });
  document.addEventListener('pointerdown', event => {
    if(!uiState.riskQuickOpen) return;
    if(event.target && event.target.closest && event.target.closest('#riskQuickAnchor')) return;
    closeRiskQuickPanel();
  }, true);
  renderRiskQuickPanel();
}

function scannerModeChipLabel(mode){
  if(mode === 'tradingview_only') return 'TradingView';
  if(mode === 'combined') return 'Combined';
  return 'Curated Core';
}

function normalizeMarketStatusMode(value){
  return String(value || '').trim().toLowerCase() === 'manual' ? 'manual' : 'auto';
}

function marketStatusDisplayValue(){
  const mode = normalizeMarketStatusMode(state.marketStatusMode);
  const label = String(state.marketStatus || '').trim();
  if(mode !== 'auto') return label || 'Market state not confirmed';
  const updatedAt = String(state.marketStatusAutoUpdatedAt || '').trim();
  if(!updatedAt) return 'Market state not confirmed';
  if(!isFreshTimestamp(updatedAt, MARKET_STATUS_STALE_MS)) return 'Auto market state stale';
  const age = relativeAgeLabel(updatedAt);
  if(!label) return 'Market state not confirmed';
  return age ? `Auto (${label}) · updated ${age}` : `Auto (${label})`;
}

function deriveAutomaticMarketStatus(snapshot){
  const price = numericOrNull(snapshot && snapshot.price);
  const sma50 = numericOrNull(snapshot && snapshot.sma50);
  if(!Number.isFinite(price) || !Number.isFinite(sma50) || sma50 <= 0) return '';
  const distance = (price - sma50) / sma50;
  if(Math.abs(distance) <= 0.01) return 'S&P near 50 MA';
  return distance > 0 ? 'S&P above 50 MA' : 'S&P below 50 MA';
}

async function refreshAutomaticMarketStatus(options = {}){
  if(normalizeMarketStatusMode(state.marketStatusMode) !== 'auto') return false;
  try{
    const snapshot = await fetchMarketData('SPY', {force:options.force === true});
    const nextStatus = deriveAutomaticMarketStatus(snapshot);
    if(!nextStatus) return false;
    const changed = nextStatus !== String(state.marketStatus || '');
    const nowIso = new Date().toISOString();
    const previousAutoUpdatedAt = String(state.marketStatusAutoUpdatedAt || '').trim();
    state.marketStatus = nextStatus;
    state.marketStatusAutoUpdatedAt = nowIso;
    if($('marketStatus')) $('marketStatus').value = nextStatus;
    if($('marketStatusMode')) $('marketStatusMode').value = 'auto';
    if(changed){
      commitTickerState();
      renderStats();
      refreshRiskContextForActiveSetups({
        source:'market_status',
        force:true
      });
    }else{
      if(previousAutoUpdatedAt !== nowIso) commitTickerState();
      renderStats();
    }
    return changed;
  }catch(_error){
    return false;
  }
}

function setupTypeChipLabel(type){
  return normalizeScanType(type) || 'Unknown';
}

function controlFocusConfig(focusKey){
  if(focusKey === 'market'){
    const mode = normalizeMarketStatusMode(state.marketStatusMode);
    return {
      label:'Market',
      selected:mode === 'auto' ? 'auto' : String(state.marketStatus || 'S&P above 50 MA'),
      options:[
        {value:'auto', label:marketStatusDisplayValue()},
        {value:'S&P above 50 MA', label:'S&P above 50 MA'},
        {value:'S&P near 50 MA', label:'S&P near 50 MA'},
        {value:'S&P below 50 MA', label:'S&P below 50 MA'}
      ]
    };
  }
  if(focusKey === 'mode'){
    return {
      label:'Scanner Mode',
      selected:effectiveUniverseMode(),
      options:[
        {value:'tradingview_only', label:'TradingView'},
        {value:'core8', label:'Curated Core'},
        {value:'combined', label:'Combined'}
      ]
    };
  }
  if(focusKey === 'setup'){
    return {
      label:'Setup Type',
      selected:normalizeScanType(state.setupType),
      options:[
        {value:'', label:'Unknown'},
        {value:'20MA', label:'20MA'},
        {value:'50MA', label:'50MA'}
      ]
    };
  }
  return {
    label:'Account',
    selected:'',
    options:[]
  };
}

function setControlFocusSelection(focusKey, value){
  if(uiState.riskQuickOpen) closeRiskQuickPanel();
  if(focusKey === 'market'){
    if(String(value || '') === 'auto'){
      if($('marketStatusMode')) $('marketStatusMode').value = 'auto';
      state.marketStatusMode = 'auto';
      saveState();
      refreshAutomaticMarketStatus({force:true});
    }else{
      if($('marketStatusMode')) $('marketStatusMode').value = 'manual';
      state.marketStatusMode = 'manual';
      state.marketStatusAutoUpdatedAt = '';
      if($('marketStatus')) $('marketStatus').value = value;
      saveState();
      refreshRiskContextForActiveSetups({
        source:'market_status',
        force:true
      });
    }
    return;
  }
  if(focusKey === 'mode'){
    if($('universeMode')) $('universeMode').value = value;
    saveState();
    renderFinalUniversePreview();
    return;
  }
  if(focusKey === 'setup'){
    if($('scannerSetupType')) $('scannerSetupType').value = value;
    saveState();
    renderFinalUniversePreview();
    setStatus('inputStatus', 'Setup mode updated for future scans only. Existing results keep their stored scan context until rescanned.');
  }
}

function ensureControlFocusDefault(){
  if(!['market','account','mode','setup'].includes(String(uiState.controlStripPanel || ''))){
    uiState.controlStripPanel = 'market';
  }
  if(!Number.isFinite(uiState.controlRailActiveIndex)){
    uiState.controlRailActiveIndex = 0;
  }
}

function focusRailButtonForKey(focusKey){
  if(focusKey === 'market') return $('marketStatusPill');
  if(focusKey === 'account') return $('accountRiskPill');
  if(focusKey === 'mode') return $('scannerModePill');
  if(focusKey === 'setup') return $('setupTypePill');
  return null;
}

function controlFocusRailItems(container){
  if(!container) return [];
  return [...container.querySelectorAll('.focus-rail-item[data-control-strip]')];
}

function controlFocusKeyForIndex(index, container){
  const rail = container || $('controlFocusRail');
  const items = controlFocusRailItems(rail);
  if(!items.length) return 'market';
  const clamped = Math.max(0, Math.min(items.length - 1, Number.isFinite(index) ? index : 0));
  return items[clamped].getAttribute('data-control-strip') || 'market';
}

function controlFocusIndexForKey(focusKey, container){
  const rail = container || $('controlFocusRail');
  const items = controlFocusRailItems(rail);
  if(!items.length) return 0;
  const match = items.findIndex(item => String(item.getAttribute('data-control-strip') || '') === String(focusKey || ''));
  return match >= 0 ? match : 0;
}

function centeredScrollLeftForRailItem(container, item){
  if(!container || !item) return 0;
  const maxLeft = Math.max(0, container.scrollWidth - container.clientWidth);
  const target = item.offsetLeft - ((container.clientWidth - item.offsetWidth) / 2);
  return Math.max(0, Math.min(maxLeft, target));
}

function currentControlFocusRailIndex(container){
  const rail = container || $('controlFocusRail');
  if(!rail) return 0;
  const items = controlFocusRailItems(rail);
  if(!items.length) return 0;
  const center = rail.scrollLeft + (rail.clientWidth / 2);
  let bestIndex = 0;
  let bestDistance = Infinity;
  items.forEach((item, index) => {
    const itemCenter = item.offsetLeft + (item.offsetWidth / 2);
    const distance = Math.abs(center - itemCenter);
    if(distance < bestDistance){
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function updateControlFocusRailVisuals(container){
  const rail = container || $('controlFocusRail');
  if(!rail) return;
  const items = controlFocusRailItems(rail);
  if(!items.length) return;
  const center = rail.scrollLeft + (rail.clientWidth / 2);
  const maxDist = Math.max(rail.clientWidth / 2, 1);
  items.forEach(item => {
    const itemCenter = item.offsetLeft + (item.offsetWidth / 2);
    const dist = Math.abs(center - itemCenter);
    const ratio = Math.max(0, 1 - (dist / maxDist));
    const scale = 0.9 + (ratio * 0.2);
    const opacity = 0.5 + (ratio * 0.5);
    item.style.transform = `scale(${scale.toFixed(3)})`;
    item.style.opacity = opacity.toFixed(3);
  });
}

function applyRailFocus(index, options = {}){
  const rail = $('controlFocusRail');
  if(!rail) return;
  const items = controlFocusRailItems(rail);
  if(!items.length) return;
  const clamped = Math.max(0, Math.min(items.length - 1, Number.isFinite(index) ? index : 0));
  const item = items[clamped];
  if(!item) return;
  uiState.controlRailActiveIndex = clamped;
  uiState.controlStripPanel = item.getAttribute('data-control-strip') || 'market';
  if(options.resetGesture !== false){
    uiState.controlRailGestureStartIndex = null;
    uiState.controlRailGestureStartLeft = null;
  }
  if(options.scroll !== false){
    rail.scrollTo({
      left:centeredScrollLeftForRailItem(rail, item),
      behavior:options.instant ? 'auto' : 'smooth'
    });
  }
  renderControlStripSelector();
  updateControlFocusRailVisuals(rail);
}

function snapControlFocusRail(container, options = {}){
  const rail = container || $('controlFocusRail');
  if(!rail) return;
  const items = controlFocusRailItems(rail);
  if(!items.length) return;
  const hasGestureStart = Number.isFinite(uiState.controlRailGestureStartIndex);
  const currentIndex = Number.isFinite(uiState.controlRailActiveIndex)
    ? uiState.controlRailActiveIndex
    : currentControlFocusRailIndex(rail);
  const startIndex = hasGestureStart ? uiState.controlRailGestureStartIndex : currentIndex;
  const startLeft = Number.isFinite(uiState.controlRailGestureStartLeft) ? uiState.controlRailGestureStartLeft : rail.scrollLeft;
  const delta = rail.scrollLeft - startLeft;
  const direction = delta > 6 ? 1 : (delta < -6 ? -1 : 0);
  const targetIndex = hasGestureStart && direction !== 0
    ? Math.max(0, Math.min(items.length - 1, startIndex + direction))
    : currentIndex;
  applyRailFocus(targetIndex, {scroll:true, instant:options.instant});
}

function setControlFocus(focusKey, options = {}){
  if(uiState.riskQuickOpen) closeRiskQuickPanel();
  const nextFocus = ['market','account','mode','setup'].includes(String(focusKey || '')) ? String(focusKey) : 'market';
  applyRailFocus(controlFocusIndexForKey(nextFocus), options);
}

function detectFocusedRailItem(){
  const rail = $('controlFocusRail');
  if(!rail) return;
  applyRailFocus(currentControlFocusRailIndex(rail), {scroll:false, resetGesture:false});
}

function renderControlStripSelector(){
  ensureControlFocusDefault();
  const focusKey = controlFocusKeyForIndex(uiState.controlRailActiveIndex);
  uiState.controlStripPanel = focusKey;
  const selector = $('controlStripSelector');
  const label = $('controlStripSelectorLabel');
  const optionsBox = $('controlStripSelectorOptions');
  const rail = $('controlFocusRail');
  ['marketStatusPill','accountRiskPill','scannerModePill','setupTypePill'].forEach(id => {
    const button = $(id);
    if(button) button.classList.remove('is-active');
  });
  const activeButton = focusRailButtonForKey(focusKey);
  if(activeButton) activeButton.classList.add('is-active');
  if(!selector || !label || !optionsBox) return;
  const config = controlFocusConfig(focusKey);
  label.textContent = config.label;
  if(focusKey === 'account'){
    optionsBox.innerHTML = `<div class="control-focus-account"><div class="control-focus-account__summary"><strong>${escapeHtml(formatGbp(state.accountSize))}</strong><span>Risk per trade: ${escapeHtml(formatPound(state.userRiskPerTrade || currentMaxLoss()))}</span></div><button class="secondary compactbutton" type="button" id="controlFocusAccountAction">Edit Risk Settings</button></div>`;
    const button = $('controlFocusAccountAction');
    if(button){
      button.onclick = event => {
        event.preventDefault();
        event.stopPropagation();
        const settings = $('headerRiskSettings');
        if(!settings) return;
        settings.open = true;
        settings.scrollIntoView({behavior:'smooth', block:'nearest'});
      };
    }
  }else{
    optionsBox.innerHTML = config.options.map(option => (
      `<button class="controlstrip-option ${String(option.value) === String(config.selected) ? 'is-selected' : ''}" type="button" data-control-option="${escapeHtml(focusKey)}" data-value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</button>`
    )).join('');
    optionsBox.querySelectorAll('[data-control-option]').forEach(button => {
      button.onclick = event => {
        event.preventDefault();
        event.stopPropagation();
        setControlFocusSelection(focusKey, button.getAttribute('data-value') || '');
        renderControlStripSelector();
      };
    });
  }
  if(rail) rail.querySelectorAll('[data-control-strip]').forEach(button => button.setAttribute('aria-current', button.classList.contains('is-active') ? 'true' : 'false'));
}

function updateTickerInputFromState(){
  const text = renderTickerListWithScanTypes(state.tickers || []);
  if($('tickerInput')) $('tickerInput').value = text;
  if($('tvImportInput')) $('tvImportInput').value = text;
  renderTvImportPreview(state.tickers && state.tickers.length ? state.tickers : [], state.tickers && state.tickers.length ? 'manual' : 'default');
  renderFinalUniversePreview();
}

function updateRecentTickers(tickers){
  const fresh = uniqueTickers(tickers);
  if(!fresh.length) return;
  state.recentTickers = uniqueTickers([...fresh, ...(state.recentTickers || [])]).slice(0, 12);
}

function tickerSearchState(){
  const query = normalizeTicker(($('tickerSearch') && $('tickerSearch').value) || '');
  if(!query) return {query:'', valid:false, inUniverse:false};
  return {
    query,
    valid:validateTickerSymbol(query),
    inUniverse:state.tickers.includes(query)
  };
}

function renderTickerQuickLists(){
  const scannerUniverseBox = $('scannerUniverseQuickList');
  if(!scannerUniverseBox) return;
  if(!state.tickers.length){
    scannerUniverseBox.innerHTML = '<div class="quickchip empty">Using the Curated Core 8 fallback universe. Add a ticker above to switch into manual scanner mode.</div>';
  }else{
    scannerUniverseBox.innerHTML = state.tickers.map(ticker => (
      `<div class="quickchip active"><span class="chiplabel">${escapeHtml(ticker)}</span><button class="danger" data-act="quick-remove" data-ticker="${escapeHtml(ticker)}">Remove</button></div>`
    )).join('');
  }
  scannerUniverseBox.querySelectorAll('[data-act="quick-remove"]').forEach(button => {
    button.onclick = () => removeTicker(button.getAttribute('data-ticker') || '');
  });
}

function queueDebugSnapshot(options = {}){
  const includeFocus = options.includeFocus !== false;
  const currentCycle = currentQueueCycleKey();
  let focusTickers = [];
  if(includeFocus && state.activeQueueLastRebuiltCycle === currentCycle){
    try{
      focusTickers = focusQueueRecords({limit:null}).map(item => item.ticker);
    }catch(error){
      focusTickers = ['<focus_unavailable>'];
    }
  }
  return {
    tickers:[...(state.tickers || [])],
    activeQueueClearedCycle:String(state.activeQueueClearedCycle || ''),
    activeQueueClearedTickers:uniqueTickers(state.activeQueueClearedTickers || []),
    activeQueueManualTickers:uniqueTickers(state.activeQueueManualTickers || []),
    dismissedFocusTickers:uniqueTickers(state.dismissedFocusTickers || []),
    focusTickers
  };
}

function logQueueMutation(action, beforeSnapshot, options = {}){
  console.debug(action, {
    before:beforeSnapshot,
    after:queueDebugSnapshot(options)
  });
}

function clearScannerProjectionState(record){
  if(!record) return;
  // Scanner-universe clear should drop scanner/card projections without wiping
  // saved watchlist, review, plan, or diary data.
  record.scan.lastScannedAt = '';
  record.scan.updatedAt = '';
  record.scan.scoreRaw = null;
  record.scan.scoreDisplay = null;
  record.scan.score = null;
  record.scan.verdict = '';
  record.scan.summary = '';
  record.scan.reasons = [];
  record.scan.reason = '';
  record.scan.riskStatus = '';
  record.scan.estimatedRR = null;
  record.scan.checksMet = null;
  record.scan.pullbackType = '';
  record.scan.pullbackStatus = '';
  record.scan.trendStatus = '';
  record.scan.analysisProjection = null;
  record.review.cardOpen = false;
}

function normalizeWatchlistEntry(entry){
  const normalized = {
    ticker:normalizeTicker(entry && entry.ticker),
    dateAdded:String(entry && entry.dateAdded || todayIsoDate()).slice(0, 10),
    scoreWhenAdded:Number.isFinite(Number(entry && entry.scoreWhenAdded)) ? Number(entry.scoreWhenAdded) : null,
    verdictWhenAdded:entry && entry.verdictWhenAdded ? normalizeImportedStatus(entry.verdictWhenAdded) : '',
    expiryAfterTradingDays:Number.isFinite(Number(entry && entry.expiryAfterTradingDays)) ? Math.max(1, Number(entry.expiryAfterTradingDays)) : 5
  };
  return normalized.ticker ? normalized : null;
}

function watchlistEntryExistsForRecord(record){
  const item = normalizeTickerRecord(record);
  if(item.watchlist && item.watchlist.inWatchlist) return true;
  return (state.watchlist || []).some(entry => normalizeTicker(entry && entry.ticker) === item.ticker);
}

function watchlistEligibilityForRecord(record){
  const item = normalizeTickerRecord(record);
  const globalVerdict = resolveGlobalVerdict(item);
  const finalVerdict = normalizeGlobalVerdictKey(globalVerdict.final_verdict);
  const inWatchlist = !!(item.watchlist && item.watchlist.inWatchlist);
  const watchlistEntryExists = watchlistEntryExistsForRecord(item);
  const reviewExists = !!(
    (item.review && item.review.manualReview && typeof item.review.manualReview === 'object')
    || String(item.review && item.review.lastReviewedAt || '').trim()
    || String(item.review && item.review.lastPrompt || '').trim()
    || String(item.review && item.review.aiAnalysisRaw || '').trim()
  );
  const allowWatchlist = !!(globalVerdict.allow_watchlist || ['near_entry','entry'].includes(finalVerdict));
  const eligibleVerdict = ['watch','monitor','near_entry','entry'].includes(finalVerdict);
  return {
    recordExists:!!item.ticker,
    reviewExists,
    inWatchlist,
    watchlistEntryExists,
    allowWatchlist,
    eligibleVerdict,
    finalVerdict,
    canAdd:allowWatchlist && eligibleVerdict && !inWatchlist,
    globalVerdict
  };
}

function addToWatchlist(tickerData){
  const entry = normalizeWatchlistEntry(tickerData);
  if(!entry) return {entry:null, record:null, added:false, updated:false, error:'invalid_ticker'};
  const record = upsertTickerRecord(entry.ticker);
  const eligibility = watchlistEligibilityForRecord(record);
  const gated = applyGlobalVerdictGates(record, {source:'watchlist_add'});
  if(gated.changed) commitTickerState();
  record.watchlist.debug = record.watchlist.debug && typeof record.watchlist.debug === 'object' ? record.watchlist.debug : {};
  if(!eligibility.allowWatchlist || !eligibility.eligibleVerdict){
    record.watchlist.debug.lastAddResult = 'blocked';
    record.watchlist.debug.lastAddMessage = 'Watchlist blocked by current verdict.';
    return {entry:null, record, added:false, updated:false, error:'watchlist_blocked', message:'Watchlist blocked by current verdict.'};
  }
  const wasInWatchlist = !!(record.watchlist && record.watchlist.inWatchlist);
  const entryToPersist = wasInWatchlist
    ? {
      ...entry,
      dateAdded:String(record.watchlist.addedAt || entry.dateAdded || todayIsoDate()).slice(0, 10),
      expiryAfterTradingDays:Number.isFinite(Number(record.watchlist.expiryAfterTradingDays))
        ? Math.max(1, Number(record.watchlist.expiryAfterTradingDays))
        : entry.expiryAfterTradingDays
    }
    : entry;
  mergeWatchlistIntoRecord(record, entryToPersist);
  record.watchlist.updatedAt = new Date().toISOString();
  runWatchlistLifecycleEvaluation({
    source:'watchlist_add',
    tickers:[entry.ticker],
    persist:false,
    render:false,
    force:true
  });
  commitTickerState();
  requeueTickerForToday(entry.ticker);
  renderWatchlist();
  renderFocusQueue();
  record.watchlist.debug.lastAddResult = wasInWatchlist ? 'already_present' : 'added';
  record.watchlist.debug.lastAddMessage = wasInWatchlist
    ? 'Already in watchlist.'
    : 'Added to watchlist.';
  return {
    entry:entryToPersist,
    record,
    added:!wasInWatchlist,
    updated:wasInWatchlist,
    error:'',
    message:wasInWatchlist ? 'Already in watchlist.' : 'Added to watchlist.'
  };
}

function removeFromWatchlist(ticker){
  const symbol = normalizeTicker(ticker);
  const record = getTickerRecord(symbol);
  if(record){
    record.watchlist.debug = record.watchlist.debug && typeof record.watchlist.debug === 'object' ? record.watchlist.debug : {};
    record.watchlist.debug.watchlist_removed_by = 'explicit_remove';
    record.watchlist.debug.removal_global_verdict = '';
    record.watchlist.debug.removal_allow_watchlist = '';
    record.watchlist.debug.removal_source = 'removeFromWatchlist';
    record.watchlist.inWatchlist = false;
    record.watchlist.addedAt = '';
    record.watchlist.addedScore = null;
    record.watchlist.expiryAt = '';
    record.watchlist.status = '';
  }
  state.activeQueueManualTickers = uniqueTickers((state.activeQueueManualTickers || []).filter(tickerItem => normalizeTicker(tickerItem) !== symbol));
  commitTickerState();
  renderWatchlist();
  renderFocusQueue();
}

function getTradingDaysRemaining(entry){
  const normalized = normalizeWatchlistEntry(entry);
  if(!normalized) return 0;
  const expiryDate = tradingDaysFrom(normalized.dateAdded, normalized.expiryAfterTradingDays);
  return countTradingDaysBetween(todayIsoDate(), expiryDate);
}

function watchlistLifecycleStateRank(state){
  if(state === 'entry') return 0;
  if(state === 'near_entry') return 1;
  if(state === 'watch') return 2;
  if(state === 'monitor') return 3;
  if(state === 'avoid') return 4;
  if(state === 'dead') return 5;
  return 6;
}

function canonicalLifecycleState(state){
  const value = String(state || '').trim().toLowerCase();
  if(value === 'developing') return 'monitor';
  if(value === 'early') return 'watch';
  if(value === 'filtered' || value === 'inactive' || value === 'avoided') return 'avoid';
  if(['entry','near_entry','watch','monitor','avoid','dead'].includes(value)) return value;
  return '';
}

function resolveLifecycleTransition(currentState, inputs = {}){
  const rawState = String(currentState || '').trim().toLowerCase();
  const lifecycleState = canonicalLifecycleState(currentState);
  const structureState = String(inputs.structure_state || '').trim().toLowerCase();
  const bounceState = String(inputs.bounce_state || '').trim().toLowerCase();
  const planStatus = String(inputs.plan_status || '').trim().toLowerCase();
  const rrConfidence = String(inputs.rr_confidence || '').trim().toLowerCase();
  const marketRegime = String(inputs.market_regime || '').trim().toLowerCase();
  const finalVerdict = canonicalLifecycleState(inputs.final_verdict);
  let nextState = lifecycleState || canonicalLifecycleState(inputs.final_state) || '';

  if(structureState === 'broken') nextState = 'avoid';

  if(
    ['watch','monitor'].includes(lifecycleState)
    && finalVerdict === 'near_entry'
    && structureState === 'intact'
    && bounceState === 'confirmed'
    && planStatus === 'valid'
    && rrConfidence !== 'invalid'
    && marketRegime !== 'weak'
  ){
    nextState = 'near_entry';
  }

  if(
    lifecycleState === 'monitor'
    && structureState === 'broken'
  ){
    nextState = 'avoid';
  }

  if(
    lifecycleState === 'monitor'
    && planStatus === 'invalid'
  ){
    nextState = 'monitor';
  }

  if(
    ['watch','developing'].includes(rawState)
    && finalVerdict === 'monitor'
    && structureState === 'intact'
  ){
    nextState = 'monitor';
  }

  const nextRank = watchlistLifecycleStateRank(nextState);
  const finalRank = watchlistLifecycleStateRank(finalVerdict);
  if(
    finalVerdict
    && Number.isFinite(nextRank)
    && Number.isFinite(finalRank)
    && nextRank > finalRank
  ){
    nextState = finalVerdict;
  }

  const clampedNextRank = watchlistLifecycleStateRank(nextState);
  if(
    finalVerdict
    && Number.isFinite(clampedNextRank)
    && Number.isFinite(finalRank)
    && clampedNextRank < finalRank
  ){
    nextState = finalVerdict;
  }

  if(
    nextState === 'avoid'
    && finalVerdict
    && finalVerdict !== 'avoid'
  ){
    return lifecycleState || currentState;
  }

  if(
    nextState === 'near_entry'
    && finalVerdict
    && finalVerdict !== 'near_entry'
  ){
    return lifecycleState || currentState;
  }

  return nextState;
}

function applyLifecycleStatePresentation(snapshot, nextState, context = {}){
  const state = canonicalLifecycleState(nextState) || canonicalLifecycleState(snapshot && snapshot.state);
  const globalVerdict = context.globalVerdict || {};
  const resolved = context.resolved || {};
  const activeExpiryAt = context.activeExpiryAt || '';
  const planExpiryAt = context.planExpiryAt || '';
  const expiryAt = context.expiryAt || '';
  const reason = context.reason || snapshot.reason || globalVerdict.reason || '';
  const badge = getBadge(state || 'monitor');
  const nextSnapshot = {
    ...snapshot,
    state:state || snapshot.state,
    label:badge.text,
    badgeClass:badge.className,
    reason
  };

  if(state === 'dead'){
    nextSnapshot.bucket = 'low_priority_avoid';
    nextSnapshot.stage = 'avoided';
    nextSnapshot.status = 'inactive';
    nextSnapshot.expiresAt = '';
    nextSnapshot.reason = reason || globalVerdict.reason || resolved.blockerReason || 'Setup failed technically and is no longer actionable.';
  }else if(state === 'avoid'){
    nextSnapshot.bucket = 'low_priority_avoid';
    nextSnapshot.stage = 'avoided';
    nextSnapshot.status = 'inactive';
    nextSnapshot.expiresAt = '';
    nextSnapshot.reason = reason || globalVerdict.reason || 'Setup is no longer watchlist-eligible.';
  }else if(state === 'entry'){
    nextSnapshot.bucket = 'tradeable_entry';
    nextSnapshot.stage = 'planned';
    nextSnapshot.status = 'active';
    nextSnapshot.expiresAt = planExpiryAt || nextSnapshot.expiresAt;
    nextSnapshot.reason = reason || 'Entry setup is actionable now.';
  }else if(state === 'near_entry'){
    nextSnapshot.bucket = 'tradeable_entry';
    nextSnapshot.stage = 'watchlist';
    nextSnapshot.status = 'active';
    nextSnapshot.expiresAt = activeExpiryAt || nextSnapshot.expiresAt;
    nextSnapshot.reason = reason || 'Near entry - monitor for trigger.';
  }else if(state === 'watch'){
    nextSnapshot.bucket = 'monitor_watch';
    nextSnapshot.stage = 'watchlist';
    nextSnapshot.status = 'active';
    nextSnapshot.expiresAt = activeExpiryAt || expiryAt || nextSnapshot.expiresAt;
    nextSnapshot.reason = reason || globalVerdict.reason || 'Watch setup - keep tracking.';
  }else{
    nextSnapshot.bucket = 'monitor_watch';
    nextSnapshot.stage = 'watchlist';
    nextSnapshot.status = 'active';
    nextSnapshot.expiresAt = activeExpiryAt || expiryAt || nextSnapshot.expiresAt;
    nextSnapshot.reason = reason || globalVerdict.reason || 'Needs confirmation before it can be acted on.';
  }

  nextSnapshot.rank = watchlistLifecycleStateRank(nextSnapshot.state);
  return nextSnapshot;
}

function watchlistLifecycleSnapshot(record){
  const item = normalizeTickerRecord(record);
  const gating = applyGlobalVerdictGates(item, {source:'auto_recompute'});
  const globalVerdict = gating.globalVerdict;
  const structureGate = watchlistRefreshStructureGate(item);
  const derivedStates = analysisDerivedStatesFromRecord(item);
  const displayedPlan = deriveCurrentPlanState(
    item.plan && item.plan.entry,
    item.plan && item.plan.stop,
    item.plan && item.plan.firstTarget,
    item.marketData && item.marketData.currency
  );
  const qualityAdjustments = evaluateSetupQualityAdjustments(item, {displayedPlan, derivedStates});
  const avoidSubtype = avoidSubtypeForRecord(item, {
    derivedStates,
    displayedPlan,
    qualityAdjustments,
    finalVerdict:displayStageForRecord(item)
  });
  const deadCheck = isTerminalDeadSetup(item, {derivedStates, displayedPlan});
  const emojiPresentation = resolveEmojiPresentation(item, {
    context:'watchlist',
    finalVerdict:displayStageForRecord(item),
    derivedStates,
    displayedPlan,
    qualityAdjustments,
    avoidSubtype,
    deadCheck
  });
  const resolved = resolveFinalStateContract(item, {
    context:'watchlist',
    finalVerdict:displayStageForRecord(item),
    derivedStates,
    displayedPlan,
    qualityAdjustments,
    avoidSubtype,
    deadCheck,
    emojiPresentation
  });
  const canonicalVerdict = normalizeGlobalVerdictKey(globalVerdict.final_verdict);
  const actionState = deriveActionStateForRecord(item).stage;
  const bounceState = String(derivedStates.bounceState || '').toLowerCase();
  const expiryTradingDays = item.watchlist.expiryAfterTradingDays || WATCHLIST_EXPIRY_TRADING_DAYS;
  const addedAt = item.watchlist.addedAt || todayIsoDate();
  const expiryAt = item.watchlist.expiryAt || tradingDaysFrom(addedAt, expiryTradingDays);
  const remainingTradingDays = expiryAt ? countTradingDaysBetween(todayIsoDate(), expiryAt) : expiryTradingDays;
  const activeExpiryAt = remainingTradingDays <= 0 ? businessDaysFromNow(expiryTradingDays) : expiryAt;
  const hasMeaningfulImprovement = ['entry','near_entry'].includes(canonicalVerdict)
    || actionState === 'action_now'
    || (bounceState === 'confirmed' && String(derivedStates.volumeState || '').toLowerCase() !== 'weak' && !qualityAdjustments.weakRegimePenalty && !qualityAdjustments.lowControlSetup);
  let state = canonicalVerdict;
  let bucket = ({
    entry:'tradeable_entry',
    near_entry:'tradeable_entry',
    watch:'monitor_watch',
    monitor:'monitor_watch',
    avoid:'low_priority_avoid',
    dead:'low_priority_avoid'
  })[canonicalVerdict] || 'monitor_watch';
  let stage = 'watchlist';
  let status = 'active';
  let nextExpiryAt = expiryAt;
  let expiryReason = '';
  let reason = globalVerdict.reason || 'Still progressing on the watchlist.';

  if((canonicalVerdict === 'dead' || canonicalVerdict === 'avoid' || !globalVerdict.allow_watchlist) && structureGate.avoid_allowed_by_structure_gate){
    state = canonicalVerdict === 'dead' ? 'dead' : 'avoid';
    bucket = 'low_priority_avoid';
    stage = 'avoided';
    status = 'inactive';
    nextExpiryAt = '';
    reason = globalVerdict.reason || structureGate.refresh_demote_reason || resolved.blockerReason || 'Setup is no longer structurally alive.';
  }else if(remainingTradingDays <= 0 && !hasMeaningfulImprovement){
    state = 'monitor';
    bucket = 'monitor_watch';
    stage = 'watchlist';
    status = 'active';
    nextExpiryAt = businessDaysFromNow(expiryTradingDays);
    expiryReason = 'Extended because setup is still structurally alive.';
    reason = 'Still structurally alive. Keep monitoring.';
  }else if(canonicalVerdict === 'entry' || resolved.actionStateKey === 'ready_to_act' || actionState === 'action_now'){
    state = 'entry';
    bucket = 'tradeable_entry';
    stage = 'planned';
    status = 'active';
    nextExpiryAt = businessDaysFromNow(PLAN_EXPIRY_TRADING_DAYS);
    reason = 'Entry setup is actionable now.';
  }else if(canonicalVerdict === 'near_entry' || actionState === 'near_entry'){
    state = 'near_entry';
    bucket = 'tradeable_entry';
    stage = 'watchlist';
    status = 'active';
    nextExpiryAt = activeExpiryAt;
    reason = 'Near entry - monitor for trigger.';
  }else if(canonicalVerdict === 'watch' || canonicalVerdict === 'monitor'){
    state = 'monitor';
    bucket = 'monitor_watch';
    stage = 'watchlist';
    status = 'active';
    nextExpiryAt = activeExpiryAt;
    reason = globalVerdict.reason || 'Monitor setup - keep tracking.';
  }else{
    state = 'monitor';
    bucket = 'monitor_watch';
    stage = 'watchlist';
    status = 'active';
    nextExpiryAt = activeExpiryAt;
    reason = globalVerdict.reason || 'Needs confirmation before it can be acted on.';
  }

  let snapshot = {
    state,
    label:getBadge(state).text,
    badgeClass:getBadge(state).className,
    bucket,
    stage,
    status,
    expiresAt:nextExpiryAt,
    expiryReason,
    reason,
    baseVerdict:globalVerdict.base_verdict || canonicalVerdict,
    downgradeApplied:!!globalVerdict.downgrade_applied,
    downgradeReason:globalVerdict.downgrade_reason || globalVerdict.reason || '',
    refresh_demote_attempted:gating && gating.suppressed ? 'true' : (globalVerdict.allow_watchlist ? 'false' : 'true'),
    refresh_demote_reason:structureGate.refresh_demote_reason || '',
    structural_alive_at_refresh:structureGate.structural_alive_at_refresh ? 'true' : 'false',
    avoid_allowed_by_structure_gate:structureGate.avoid_allowed_by_structure_gate ? 'true' : 'false',
    explicit_invalidation_reason:structureGate.explicit_invalidation_reason || globalVerdict.explicit_invalidation_reason || '(none)',
    lifecycle_drop_reason:structureGate.lifecycle_drop_reason || globalVerdict.lifecycle_drop_reason || '(none)',
    avoid_allowed_by_structure_consistency_guard:globalVerdict.avoid_allowed_by_structure_consistency_guard ? 'true' : 'false',
    remainingTradingDays,
    rank:watchlistLifecycleStateRank(state),
    hasMeaningfulImprovement
  };

  const currentState = canonicalLifecycleState(item.watchlist && item.watchlist.lifecycleState);
  const planUiState = getPlanUiState(item, {displayedPlan});
  const transitionedState = resolveLifecycleTransition(currentState || snapshot.state, {
    structure_state:derivedStates.structureState,
    bounce_state:derivedStates.bounceState,
    plan_status:planUiState.state,
    rr_confidence:resolved.rrConfidenceLabel || resolved.rrConfidence || '',
    market_regime:qualityAdjustments.weakRegimePenalty ? 'weak' : 'normal',
    final_verdict:globalVerdict.final_verdict,
    final_state:snapshot.state
  });
  if(transitionedState && transitionedState !== snapshot.state){
    snapshot = applyLifecycleStatePresentation(snapshot, transitionedState, {
      globalVerdict,
      resolved,
      activeExpiryAt,
      planExpiryAt:businessDaysFromNow(PLAN_EXPIRY_TRADING_DAYS),
      expiryAt,
      reason:snapshot.reason
    });
  }

  return snapshot;
}

function syncWatchlistLifecycle(record){
  if(!record || !record.watchlist || !record.watchlist.inWatchlist) return null;
  if(hasLockedLifecycle(record)) return watchlistLifecycleSnapshot(record);
  const snapshot = watchlistLifecycleSnapshot(record);
  record.watchlist.lifecycleState = snapshot.state;
  record.watchlist.lifecycleLabel = snapshot.label;
  record.watchlist.watchlist_priority_bucket = snapshot.bucket;
  if(snapshot.expiresAt) record.watchlist.expiryAt = snapshot.expiresAt;
  const lifecycleNeedsUpdate = String(record.lifecycle.stage || '') !== String(snapshot.stage || '')
    || String(record.lifecycle.status || '') !== String(snapshot.status || '')
    || String(record.lifecycle.expiresAt || '') !== String(snapshot.expiresAt || '')
    || String(record.lifecycle.expiryReason || '') !== String(snapshot.expiryReason || '');
  if(lifecycleNeedsUpdate){
    setLifecycleStage(record, {
      stage:snapshot.stage,
      status:snapshot.status,
      changedAt:new Date().toISOString(),
      expiresAt:snapshot.expiresAt,
      expiryReason:snapshot.expiryReason,
      reason:snapshot.reason,
      source:'watchlist'
    });
  }
  return snapshot;
}

function watchlistLifecycleStateSignature(record){
  const item = normalizeTickerRecord(record);
  return JSON.stringify({
    stage:item.lifecycle.stage || '',
    status:item.lifecycle.status || '',
    expiresAt:item.lifecycle.expiresAt || '',
    expiryReason:item.lifecycle.expiryReason || '',
    watchlistState:item.watchlist.lifecycleState || '',
    watchlistLabel:item.watchlist.lifecycleLabel || '',
    watchlistBucket:item.watchlist.watchlist_priority_bucket || '',
    watchlistPriority:item.watchlist.watchlist_priority_score
  });
}

function hasFreshLifecycleInputs(record){
  const item = normalizeTickerRecord(record);
  const timestamps = [
    item.watchlist.updatedAt,
    item.scan.updatedAt,
    item.scan.lastScannedAt,
    item.review.lastReviewedAt,
    item.meta.updatedAt
  ].map(value => String(value || '').trim()).filter(Boolean);
  if(!timestamps.length){
    return !!(
      Number.isFinite(numericOrNull(item.scan.score))
      || String(item.scan.verdict || '').trim()
      || String(item.review.savedVerdict || '').trim()
      || item.review.manualReview
    );
  }
  const newest = timestamps
    .map(value => Date.parse(value))
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];
  if(!Number.isFinite(newest)) return true;
  return (Date.now() - newest) <= WATCHLIST_LIFECYCLE_FRESHNESS_MS;
}

function shouldEvaluateWatchlistLifecycleRecord(record, options = {}){
  const source = String(options.source || 'system');
  if(!record || !record.watchlist || !record.watchlist.inWatchlist) return false;
  if(options.force === true) return true;
  if(['manual_refresh','review','review_save','analyse_setup','scan','watchlist_add','market_status','plan_update','auto_recompute'].includes(source)) return true;
  return hasFreshLifecycleInputs(record);
}

function runWatchlistLifecycleEvaluation(options = {}){
  const source = String(options.source || 'system');
  const logUnchanged = options.logUnchanged !== false;
  if(uiState.watchlistLifecycleRunning){
    const requestedTickers = Array.isArray(options.tickers)
      ? new Set(options.tickers.map(normalizeTicker).filter(Boolean))
      : null;
    allTickerRecords().forEach(record => {
      if(!record.watchlist || !record.watchlist.inWatchlist) return;
      if(requestedTickers && !requestedTickers.has(record.ticker)) return;
      record.watchlist.debug = record.watchlist.debug && typeof record.watchlist.debug === 'object' ? record.watchlist.debug : {};
      const warnings = new Set(Array.isArray(record.watchlist.debug.warnings) ? record.watchlist.debug.warnings : []);
      warnings.add('Duplicate evaluation suppressed');
      record.watchlist.debug.warnings = [...warnings].slice(0, 4);
      appendWatchlistDebugEvent(record, {
        at:new Date().toISOString(),
        source,
        result:'suppressed'
      });
    });
    uiState.watchlistLifecyclePendingSource = source;
    return {changed:false, skipped:true, source};
  }
  uiState.watchlistLifecycleRunning = true;
  uiState.watchlistLifecycleLastSource = source;
  uiState.watchlistLifecycleLastRunAt = new Date().toISOString();
  const requestedTickers = Array.isArray(options.tickers)
    ? new Set(options.tickers.map(normalizeTicker).filter(Boolean))
    : null;
  let changed = false;
  try{
    allTickerRecords().forEach(record => {
      if(!record.watchlist || !record.watchlist.inWatchlist) return;
      if(requestedTickers && !requestedTickers.has(record.ticker)) return;
      const hadFreshInputs = hasFreshLifecycleInputs(record);
      const before = watchlistLifecycleStateSignature(record);
      const previousState = String(record.watchlist.lifecycleState || '');
      const previousLabel = String(record.watchlist.lifecycleLabel || '');
      if(shouldEvaluateWatchlistLifecycleRecord(record, options)){
        reevaluateTickerProgress(record);
        const snapshot = syncWatchlistLifecycle(record);
        const settledGlobalVerdict = resolveGlobalVerdict(record);
        maybeTriggerEntryAlert(record, settledGlobalVerdict, {source});
        const derivedStates = analysisDerivedStatesFromRecord(record);
        const displayedPlan = deriveCurrentPlanState(
          record.plan && record.plan.entry,
          record.plan && record.plan.stop,
          record.plan && record.plan.firstTarget,
          record.marketData && record.marketData.currency
        );
        const qualityAdjustments = evaluateSetupQualityAdjustments(record, {displayedPlan, derivedStates});
        const rrResolution = resolveScannerStateWithTrace(record);
        const nextStep = watchlistNextStateGuidance(record, snapshot, {
          derivedStates,
          displayedPlan,
          qualityAdjustments,
          rrResolution,
          planUiState:getPlanUiState(record, {displayedPlan})
        });
        const actionPresentation = actionPresentationForRecord(record);
        const changeType = watchlistLifecycleChangeType(previousState, snapshot.state);
        const warnings = watchlistDebugWarnings(record, snapshot, actionPresentation, {
          hadFreshInputs,
          duplicateSuppressed:false
        });
        const attemptedRecompute = recomputeAttemptedForSource(source);
        const previousPlan = normalizeStoredPlanSnapshot(record.watchlist.debug && record.watchlist.debug.newPlan);
        const newPlan = planSnapshotFromDisplayedPlan(displayedPlan);
        const displayedPlanHasValues = !!(
          Number.isFinite(numericOrNull(displayedPlan && displayedPlan.entry))
          || Number.isFinite(numericOrNull(displayedPlan && displayedPlan.stop))
          || Number.isFinite(numericOrNull(displayedPlan && displayedPlan.target))
        );
        record.watchlist.debug = record.watchlist.debug && typeof record.watchlist.debug === 'object' ? record.watchlist.debug : {};
        record.watchlist.debug.lastEvaluatedAt = new Date().toISOString();
        record.watchlist.debug.lastSource = source;
        record.watchlist.debug.hadFreshInputs = hadFreshInputs;
        record.watchlist.debug.previousState = previousState || '(none)';
        record.watchlist.debug.currentState = snapshot.state || '(none)';
        record.watchlist.debug.transition = `${previousState || '(none)'} -> ${snapshot.state || '(none)'}`;
        record.watchlist.debug.changeType = changeType;
        record.watchlist.debug.reason = snapshot.reason || '';
        record.watchlist.debug.baseVerdict = snapshot.baseVerdict || '(none)';
        record.watchlist.debug.finalVerdict = snapshot.state || '(none)';
        record.watchlist.debug.downgradeApplied = !!snapshot.downgradeApplied;
        record.watchlist.debug.downgradeReason = snapshot.downgradeReason || '';
        record.watchlist.debug.lastAlertedState = String(record.meta && record.meta.lastAlertedState || '').trim().toLowerCase() || '(none)';
        record.watchlist.debug.alertTriggeredThisCycle = String(record.watchlist.debug.alertTriggeredThisCycle || 'false');
        record.watchlist.debug.nextPossibleState = nextStep.nextPossibleState || '';
        record.watchlist.debug.mainBlocker = nextStep.mainBlocker || '';
        record.watchlist.debug.planRecomputed = attemptedRecompute;
        record.watchlist.debug.previousPlan = previousPlan;
        record.watchlist.debug.newPlan = newPlan;
        record.watchlist.debug.recomputeResult = determineRecomputeResult(previousPlan, newPlan, attemptedRecompute);
        record.watchlist.debug.planSnapshotMismatch = displayedPlanHasValues && storedPlanState(newPlan) === 'NO_PLAN'
          ? 'Displayed Trade Plan has values, but recompute snapshot resolved to no plan.'
          : '';
        record.watchlist.debug.warnings = warnings;
        if(logUnchanged || changeType !== 'unchanged'){
          appendWatchlistDebugEvent(record, {
            at:record.watchlist.debug.lastEvaluatedAt,
            source,
            result:`${changeType}: ${snapshot.state}`
          });
        }
      }
      maybeExpireTickerRecord(record);
      const after = watchlistLifecycleStateSignature(record);
      if(before !== after) changed = true;
    });
    if(changed && options.persist !== false) commitTickerState();
    if(options.render !== false && (changed || options.forceRender === true)){
      renderWatchlist();
      renderWorkflowAlerts();
      renderFocusQueue();
      if(activeReviewTicker()) renderReviewLifecycleSummary(activeReviewTicker());
    }
    return {changed, skipped:false, source};
  }finally{
    uiState.watchlistLifecycleRunning = false;
    const pendingSource = String(uiState.watchlistLifecyclePendingSource || '').trim();
    uiState.watchlistLifecyclePendingSource = '';
    if(pendingSource && pendingSource !== source){
      runWatchlistLifecycleEvaluation({
        source:pendingSource,
        persist:options.persist,
        render:options.render
      });
    }
  }
}

function syncWatchlistLifecycleBeforeRender(source = 'auto_recompute'){
  if(uiState.watchlistLifecycleRunning) return false;
  const result = runWatchlistLifecycleEvaluation({
    source,
    persist:true,
    render:false,
    logUnchanged:false
  });
  return !!(result && result.changed);
}

function appendWatchlistDebugEvent(record, event){
  if(!record || !record.watchlist || typeof record.watchlist !== 'object') return;
  record.watchlist.debug = record.watchlist.debug && typeof record.watchlist.debug === 'object' ? record.watchlist.debug : {};
  const nextEvent = {
    at:String(event && event.at || new Date().toISOString()),
    source:String(event && event.source || ''),
    result:String(event && event.result || '')
  };
  const trail = Array.isArray(record.watchlist.debug.auditTrail) ? record.watchlist.debug.auditTrail : [];
  const latest = trail[0];
  const timestampDeltaMs = Math.abs(Date.parse(nextEvent.at) - Date.parse(String(latest && latest.at || '')));
  const dedupeUnchanged = latest
    && latest.source === nextEvent.source
    && latest.result === nextEvent.result
    && /^unchanged:/i.test(nextEvent.result)
    && ['auto_recompute','manual_refresh'].includes(nextEvent.source)
    && Number.isFinite(timestampDeltaMs)
    && timestampDeltaMs < 60000;
  if(dedupeUnchanged) return;
  record.watchlist.debug.auditTrail = [nextEvent, ...trail].slice(0, 5);
}

function triggerEntryAlert(record, globalVerdict){
  const item = normalizeTickerRecord(record);
  const displayedPlan = deriveCurrentPlanState(
    item.plan && item.plan.entry,
    item.plan && item.plan.stop,
    item.plan && item.plan.firstTarget,
    item.marketData && item.marketData.currency
  );
  const positionSize = numericOrNull(item.plan && item.plan.positionSize)
    ?? numericOrNull(displayedPlan && displayedPlan.riskFit && displayedPlan.riskFit.position_size);
  const entryPrice = numericOrNull(item.plan && item.plan.entry)
    ?? numericOrNull(displayedPlan && displayedPlan.entry);
  const url = 'https://maker.ifttt.com/trigger/entry_signal/with/key/e_kh7NJw5iFDStUtRFNq52DiJj6T-ToBrHPDR2oqvTM';
  const payload = {
    value1:item.ticker,
    value2:Number.isFinite(positionSize) && positionSize > 0 ? String(Math.round(positionSize)) : 'n/a',
    value3:Number.isFinite(entryPrice) ? Number(entryPrice).toFixed(2) : 'n/a'
  };
  fetch(url, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(payload)
  }).catch(() => {});
}

function maybeTriggerEntryAlert(record, globalVerdict, options = {}){
  const item = normalizeTickerRecord(record);
  const verdict = globalVerdict && typeof globalVerdict === 'object' ? globalVerdict : resolveGlobalVerdict(item);
  const finalVerdict = normalizeGlobalVerdictKey(verdict.final_verdict);
  const previousFinalVerdict = normalizeGlobalVerdictKey(item.meta && item.meta.previousFinalVerdict);
  const lastAlertedState = String(item.meta && item.meta.lastAlertedState || '').trim().toLowerCase();
  const shouldTrigger = previousFinalVerdict !== 'entry'
    && finalVerdict === 'entry'
    && lastAlertedState !== 'entry';

  item.meta = item.meta && typeof item.meta === 'object' ? item.meta : {};
  item.watchlist = item.watchlist && typeof item.watchlist === 'object' ? item.watchlist : {};
  item.watchlist.debug = item.watchlist.debug && typeof item.watchlist.debug === 'object' ? item.watchlist.debug : {};
  item.watchlist.debug.alertTriggeredThisCycle = shouldTrigger ? 'true' : 'false';

  if(shouldTrigger){
    triggerEntryAlert(item, verdict);
    item.meta.lastAlertedState = 'entry';
    appendWatchlistDebugEvent(item, {
      at:new Date().toISOString(),
      source:String(options.source || 'entry_alert'),
      result:'alert: entry_webhook_sent'
    });
  }else if(finalVerdict !== 'entry' && lastAlertedState === 'entry'){
    item.meta.lastAlertedState = finalVerdict || '';
  }

  item.meta.previousFinalVerdict = finalVerdict || '';
  return shouldTrigger;
}

function watchlistLifecycleChangeType(previousState, currentState){
  return watchlistLifecycleChangeTypeImpl(previousState, currentState, {
    watchlistLifecycleStateRank
  });
}

// LEGACY WATCHLIST GUIDANCE BLOCK DISABLED
// Shadowed by the canonical watchlist guidance block later in app.js.
function legacyWatchlistNextStateGuidance(record, lifecycleSnapshot, context = {}){
  const derivedStates = context.derivedStates || analysisDerivedStatesFromRecord(record);
  const displayedPlan = context.displayedPlan || deriveCurrentPlanState(
    record.plan && record.plan.entry,
    record.plan && record.plan.stop,
    record.plan && record.plan.firstTarget,
    record.marketData && record.marketData.currency
  );
  const qualityAdjustments = context.qualityAdjustments || evaluateSetupQualityAdjustments(record, {displayedPlan, derivedStates});
  const rrResolution = context.rrResolution || resolveScannerStateWithTrace(record);
  const resolved = context.resolvedContract || resolveFinalStateContract(record, {
    context:'watchlist',
    derivedStates,
    displayedPlan,
    qualityAdjustments,
    rrResolution,
    planUiState:context.planUiState
  });
  if(['dead','expired','inactive'].includes(String(lifecycleSnapshot && lifecycleSnapshot.state || ''))){
    return {nextPossibleState:'None', mainBlocker:'Setup is no longer active'};
  }
  return {
    nextPossibleState:resolved.nextPossibleState || '🧐 Monitor',
    mainBlocker:resolved.blockerReason || 'Needs better confirmation'
  };
  const bounceState = String(derivedStates.bounceState || '').toLowerCase();
  const volumeState = String(derivedStates.volumeState || '').toLowerCase();
  const structureState = String(derivedStates.structureState || '').toLowerCase();
  const hostileMarket = !!qualityAdjustments.weakRegimePenalty;
  const lowControl = !!(qualityAdjustments.lowControlSetup || qualityAdjustments.tooWideForQualityPullback);
  const planValidity = String((context.planUiState && context.planUiState.state) || getPlanUiState(record, {displayedPlan}).state || '');

  if(['dead','expired'].includes(String(lifecycleSnapshot && lifecycleSnapshot.state || ''))){
    return {nextPossibleState:'None', mainBlocker:'Setup is no longer active'};
  }
  if(['broken','weak'].includes(structureState)) return {nextPossibleState:'💀 Dead', mainBlocker:'Structure is broken'};
  if(['none','unconfirmed','early','attempt'].includes(bounceState)) return {nextPossibleState:'🎯 Near Entry', mainBlocker:'Needs stronger bounce'};
  if(volumeState === 'weak') return {nextPossibleState:'🎯 Near Entry', mainBlocker:'Needs stronger volume'};
  if(hostileMarket) return {nextPossibleState:'🎯 Near Entry', mainBlocker:'Needs better market conditions'};
  if(lowControl) return {nextPossibleState:'🎯 Near Entry', mainBlocker:'Needs tighter structure'};
  if(['needs_adjustment','too_wide','invalid'].includes(planValidity)) return {nextPossibleState:'🎯 Near Entry', mainBlocker:'Needs a cleaner plan'};
  if(rrResolution && rrResolution.rr_reliability === 'low') return {nextPossibleState:'🎯 Near Entry', mainBlocker:'RR is low confidence'};
  if(String(lifecycleSnapshot && lifecycleSnapshot.state || '') === 'near_entry') return {nextPossibleState:'🚀 Entry', mainBlocker:'Needs trigger confirmation'};
  if(String(lifecycleSnapshot && lifecycleSnapshot.state || '') === 'entry') return {nextPossibleState:'🚀 Entry', mainBlocker:'Ready if trigger is met'};
  return {nextPossibleState:'🧐 Monitor', mainBlocker:'Needs better confirmation'};
}

function watchlistDebugWarnings(record, lifecycleSnapshot, actionPresentation, options = {}){
  const warnings = [];
  const state = String(lifecycleSnapshot && lifecycleSnapshot.state || '');
  const actionLabel = String(actionPresentation && actionPresentation.label || '');
  const freshInputs = options.hadFreshInputs !== false;
  if(['monitor','watch'].includes(state) && /ignore|dead|drop/i.test(actionLabel)){
    warnings.push('Monitor/watch state produced terminal action');
  }
  if(state === 'expired' && String(record.lifecycle.status || '') === 'active'){
    warnings.push('Expired setup still marked active');
  }
  if(options.duplicateSuppressed) warnings.push('Duplicate evaluation suppressed');
  if(!freshInputs) warnings.push('Stale data used');
  return warnings.slice(0, 4);
}

function renderWatchlistDebugPane(record, lifecycleSnapshot, priority, options = {}){
  const item = normalizeTickerRecord(record);
  const globalVerdict = resolveGlobalVerdict(item);
  const setupScoreTrace = setupScoreTraceForRecord(item);
  const debug = item.watchlist.debug && typeof item.watchlist.debug === 'object' ? item.watchlist.debug : {};
  const derivedStates = options.derivedStates || analysisDerivedStatesFromRecord(item);
  const displayedPlan = options.displayedPlan || deriveCurrentPlanState(
    item.plan && item.plan.entry,
    item.plan && item.plan.stop,
    item.plan && item.plan.firstTarget,
    item.marketData && item.marketData.currency
  );
  const qualityAdjustments = options.qualityAdjustments || evaluateSetupQualityAdjustments(item, {displayedPlan, derivedStates});
  const rrResolution = options.rrResolution || resolveScannerStateWithTrace(item);
  const resolved = options.resolvedContract || resolveFinalStateContract(item, {
    context:'watchlist',
    derivedStates,
    displayedPlan,
    qualityAdjustments,
    rrResolution
  });
  const globalVisual = options.globalVisual || resolveGlobalVisualState(item, 'watchlist', {
    structuralState:resolved.structuralState,
    actionStateKey:resolved.actionStateKey,
    tradeability:resolved.tradeabilityVerdict,
    structure:item && item.setup && item.setup.structureState,
    bounce:item && item.setup && item.setup.bounceState
  });
  const capitalComfort = capitalComfortSummary({
    capitalFit:displayedPlan.capitalFit.capital_fit,
    capitalNote:displayedPlan.capitalFit.capital_note,
    affordability:displayedPlan.affordability,
    capitalUsage:capitalUsageAdvisory({
      positionCostGbp:displayedPlan.capitalFit.position_cost_gbp,
      positionCost:displayedPlan.capitalFit.position_cost,
      quoteCurrency:displayedPlan.capitalFit.quote_currency,
      accountSizeGbp:currentAccountSizeGbp(),
      fxStatus:displayedPlan.capitalFit.fx_status
    }),
    controlQuality:qualityAdjustments.controlQuality,
    capitalEfficiency:qualityAdjustments.capitalEfficiency
  });
  const age = countTradingDaysBetween(item.watchlist.addedAt || todayIsoDate(), todayIsoDate());
  const auditTrail = Array.isArray(debug.auditTrail) ? debug.auditTrail : [];
  const warnings = Array.isArray(debug.warnings) ? debug.warnings : [];
  const holdTraceHistory = Array.isArray(debug.holdTraceHistory) ? debug.holdTraceHistory : [];
  const debugPlanUI = resolvePlanVisibility({
    state:globalVisual.finalVerdict || globalVisual.final_verdict,
    bounce_state:globalVerdict.bounce_state || (record && record.setup && record.setup.bounceState),
    structure:globalVerdict.structure_state || (record && record.setup && record.setup.structureState)
  });
  return `<details class="compact-details watchlist-debug-pane"><summary>Watchlist Debug</summary>${renderDebugSectionMarkup('Final Decision', [
    {label:'UI State Source', value:globalVisual.ui_state_source || 'n/a'},
    {label:'Watchlist Presentation Source', value:globalVisual.watchlist_presentation_source || 'n/a'},
    {label:'Final Verdict Rendered', value:globalVisual.final_verdict_rendered || globalVisual.finalVerdict || 'n/a'},
    {label:'Bucket Rendered', value:globalVisual.bucket_rendered || globalVisual.bucket || 'n/a'},
    {label:'Dead Guard Applied', value:globalVisual.dead_guard_applied ? 'true' : 'false'},
    {label:'Dead Trigger Source', value:globalVisual.dead_trigger_source || '(none)'},
    {label:'Explicit Invalidation Reason', value:globalVisual.explicit_invalidation_reason || globalVerdict.explicit_invalidation_reason || '(none)'},
    {label:'Structure->Label Source', value:globalVisual.structure_to_label_mapping_source || globalVerdict.structure_to_label_mapping_source || '(none)'},
    {label:'Lifecycle Drop Reason', value:globalVisual.lifecycle_drop_reason || globalVerdict.lifecycle_drop_reason || '(none)'},
    {label:'Avoid Allowed By Structure Guard', value:(typeof globalVisual.avoid_allowed_by_structure_consistency_guard === 'boolean'
      ? (globalVisual.avoid_allowed_by_structure_consistency_guard ? 'true' : 'false')
      : (globalVerdict.avoid_allowed_by_structure_consistency_guard ? 'true' : 'false'))},
    {label:'Conflicting Legacy State Detected', value:globalVisual.conflicting_legacy_state_detected ? 'true' : 'false'},
    {label:'Final Verdict', value:globalVerdict.final_verdict || 'n/a'},
    {label:'Tone', value:globalVerdict.tone || 'n/a'},
    {label:'Bucket', value:lifecycleSnapshot.bucket || globalVerdict.bucket || 'n/a'},
    {label:'Badge', value:(globalVerdict.badge && globalVerdict.badge.text) || 'n/a'},
    {label:'Final State Reason', value:globalVerdict.final_state_reason || '(none)'},
    {label:'Avoid Trigger Source', value:globalVerdict.avoid_trigger_source || '(none)'},
    {label:'Tracked', value:globalVerdict.tracked ? 'true' : 'false'},
    {label:'Downgrade Applied', value:globalVerdict.downgrade_applied ? 'true' : 'false'},
    {label:'Downgrade Reason', value:globalVerdict.downgrade_reason || 'n/a'},
    {label:'Refresh Demote Attempted', value:lifecycleSnapshot.refresh_demote_attempted || 'false'},
    {label:'Refresh Demote Reason', value:lifecycleSnapshot.refresh_demote_reason || '(none)'},
    {label:'Structural Alive At Refresh', value:lifecycleSnapshot.structural_alive_at_refresh || 'n/a'},
    {label:'Avoid Allowed By Structure Gate', value:lifecycleSnapshot.avoid_allowed_by_structure_gate || 'n/a'},
    {label:'Explicit Invalidation Reason', value:lifecycleSnapshot.explicit_invalidation_reason || globalVerdict.explicit_invalidation_reason || '(none)'},
    {label:'Lifecycle Drop Reason', value:lifecycleSnapshot.lifecycle_drop_reason || globalVerdict.lifecycle_drop_reason || '(none)'},
    {label:'Avoid Allowed By Structure Consistency Guard', value:lifecycleSnapshot.avoid_allowed_by_structure_consistency_guard || (globalVerdict.avoid_allowed_by_structure_consistency_guard ? 'true' : 'false')},
    {label:'Entry Gate Pass', value:globalVerdict.entry_gate_pass ? 'true' : 'false'},
    {label:'Near Entry Gate Pass', value:globalVerdict.near_entry_gate_pass ? 'true' : 'false'}
  ])}${renderDebugSectionMarkup('Base Assessment', [
    {label:'Base Verdict', value:globalVerdict.base_verdict || 'n/a'},
    {label:'Setup Score', value:Number.isFinite(globalVerdict.setup_score) ? `${globalVerdict.setup_score}/10` : 'n/a'},
    {label:'Setup Score Source', value:setupScoreTrace.source || 'n/a'},
    {label:'Previous Stored Score', value:Number.isFinite(debug.score_previous_stored) ? `${debug.score_previous_stored}/10` : '(none)'},
    {label:'Recomputed Score', value:Number.isFinite(debug.score_recomputed) ? `${debug.score_recomputed}/10` : '(none)'},
    {label:'Penalty-Adjusted Score', value:Number.isFinite(debug.score_recomputed_penalty_adjusted) ? `${debug.score_recomputed_penalty_adjusted}/10` : '(none)'},
    {label:'Fallback Applied', value:debug.score_fallback_applied ? 'true' : 'false'},
    {label:'Score Change Reason', value:debug.score_change_reason || '(none)'},
    {label:'Refresh Replaced Reviewed State', value:debug.refresh_replaced_reviewed_state ? 'true' : 'false'},
    {label:'Structure', value:globalVerdict.structure_state || 'n/a'},
    {label:'Bounce', value:globalVerdict.bounce_state || 'n/a'},
    {label:'Market', value:globalVerdict.market_regime || 'n/a'},
    {label:'Volume', value:String(derivedStates.volumeState || 'n/a')}
  ])}${renderDebugSectionMarkup('Execution State', [
    {label:'Lifecycle State', value:lifecycleSnapshot.state || globalVerdict.lifecycle || 'n/a'},
    {label:'Action State', value:resolved.actionStateLabel || resolved.actionLabel || 'n/a'},
    {label:'Plan Status', value:debugPlanUI.showPlan ? (resolved.planStatusLabel || 'n/a') : (debugPlanUI.diagnosticsMessage || 'Bounce is too weak to price cleanly.')},
    {label:'Plan Visible', value:debugPlanUI.showPlan ? 'true' : 'false'},
    {label:'RR Confidence', value:resolved.rrConfidenceLabel || 'n/a'},
    {label:'Capital Fit', value:capitalComfort.label || 'n/a'},
    {label:'Capital Usage', value:capitalUsageDebugText(displayedPlan)},
    {label:'Next Possible', value:debug.nextPossibleState || resolved.nextPossibleState || 'n/a'}
  ])}${renderAdvancedDebugMarkup([
    {label:'Entry Gate Reasons', value:(globalVerdict.entry_gate_reasons || []).join(' | ') || '(none)'},
    {label:'Near Entry Gate Reasons', value:(globalVerdict.near_entry_gate_reasons || []).join(' | ') || '(none)'},
    {label:'Entry Gate Checks', value:JSON.stringify(globalVerdict.entry_gate_checks || {}) || '(none)'},
    {label:'Allow Plan', value:globalVerdict.allow_plan ? 'true' : 'false'},
    {label:'Allow Watchlist', value:globalVerdict.allow_watchlist ? 'true' : 'false'},
    {label:'Source', value:globalVerdict.source || 'resolver'},
    {label:'Capital Affordability', value:displayedPlan.affordability || '(none)'},
    {label:'Capital OK', value:displayedPlan.capitalFit && displayedPlan.capitalFit.capital_ok === true ? 'true' : (displayedPlan.capitalFit && displayedPlan.capitalFit.capital_ok === false ? 'false' : '(none)')},
    {label:'Setup Score Trace', value:`${setupScoreTrace.detail} setup=${Number.isFinite(setupScoreTrace.inputs.setup_score) ? setupScoreTrace.inputs.setup_score : 'n/a'} | base=${Number.isFinite(setupScoreTrace.inputs.base_score) ? setupScoreTrace.inputs.base_score : 'n/a'} | scan=${Number.isFinite(setupScoreTrace.inputs.scan_score) ? setupScoreTrace.inputs.scan_score : 'n/a'}`},
    {label:'Base Action Label', value:resolved.actionStateLabel || resolved.actionLabel || 'n/a'},
    {label:'Base Tradeability', value:resolved.tradeabilityVerdictLabel || resolved.tradeabilityLabel || 'n/a'},
    {label:'Previous', value:debug.previousState || '(none)'},
    {label:'Priority', value:String(priority.score)},
    {label:'Age', value:`${String(Math.max(age, 0))} trading days`},
    {label:'Expiry', value:item.watchlist.expiryAt || 'Not set'},
    {label:'Evaluated', value:formatLocalTimestamp(debug.lastEvaluatedAt) || debug.lastEvaluatedAt || 'n/a'},
    {label:'Trigger', value:debug.lastSource || 'n/a'},
    {label:'Fresh Inputs', value:debug.hadFreshInputs ? 'Yes' : 'No'},
    {label:'Transition', value:(debug.previousState || '(none)') + ' -> ' + (debug.currentState || lifecycleSnapshot.state || '(none)')},
    {label:'Change Type', value:debug.changeType || 'unchanged'},
    {label:'Removed By', value:debug.watchlist_removed_by || '(none)'},
    {label:'Removal Source', value:debug.removal_source || '(none)'},
    {label:'Removal Verdict', value:debug.removal_global_verdict || '(none)'},
    {label:'Last Alerted State', value:debug.lastAlertedState || '(none)'},
    {label:'Alert Triggered This Cycle', value:debug.alertTriggeredThisCycle || 'false'},
    {label:'Base Resolver Verdict', value:resolved.rawResolverVerdict || rrResolution.rawResolverVerdict || rrResolution.status || 'n/a'},
    {label:'Reason', value:globalVerdict.reason || debug.reason || resolved.reasonSummary || lifecycleSnapshot.reason || 'n/a'},
    {label:'Control', value:qualityAdjustments.controlQuality || 'n/a'},
    {label:'Main Blocker', value:debug.mainBlocker || resolved.blockerReason || 'n/a'}
  ])}<div class="watchlist-debug-block tiny"><strong>Watchlist Hold Trace</strong><div data-watchlist-hold-trace="${escapeHtml(item.ticker)}">${escapeHtml(debug.holdTrace || '(none)')}</div><div data-watchlist-hold-trace-history="${escapeHtml(item.ticker)}">${escapeHtml(holdTraceHistory.length ? holdTraceHistory.join(' || ') : '(none)')}</div></div>${renderRecomputeDiagnostics(debug)}${warnings.length ? `<div class="watchlist-debug-block tiny"><strong>Warnings</strong><div>${warnings.map(warning => escapeHtml(warning)).join(' | ')}</div></div>` : ''}${auditTrail.length ? `<div class="watchlist-debug-block tiny"><strong>Recent events</strong>${auditTrail.map(entry => `<div>${escapeHtml(formatLocalTimestamp(entry.at) || entry.at || 'n/a')} | ${escapeHtml(entry.source || 'n/a')} | ${escapeHtml(entry.result || 'n/a')}</div>`).join('')}</div>` : ''}</details>`;
  return `<details class="compact-details watchlist-debug-pane"><summary>Watchlist Debug</summary><div class="watchlist-debug-grid tiny"><div><strong>Final display state</strong><div>${escapeHtml(lifecycleSnapshot.label || lifecycleSnapshot.state || 'n/a')}</div></div><div><strong>Previous</strong><div>${escapeHtml(debug.previousState || '(none)')}</div></div><div><strong>Bucket</strong><div>${escapeHtml(lifecycleSnapshot.bucket || 'n/a')}</div></div><div><strong>Priority</strong><div>${escapeHtml(String(priority.score))}</div></div><div><strong>Age</strong><div>${escapeHtml(String(Math.max(age, 0)))} trading days</div></div><div><strong>Expiry</strong><div>${escapeHtml(item.watchlist.expiryAt || 'Not set')}</div></div><div><strong>Evaluated</strong><div>${escapeHtml(formatLocalTimestamp(debug.lastEvaluatedAt) || debug.lastEvaluatedAt || 'n/a')}</div></div><div><strong>Trigger</strong><div>${escapeHtml(debug.lastSource || 'n/a')}</div></div><div><strong>Fresh inputs</strong><div>${escapeHtml(debug.hadFreshInputs ? 'Yes' : 'No')}</div></div><div><strong>Transition</strong><div>${escapeHtml((debug.previousState || '(none)') + ' -> ' + (debug.currentState || lifecycleSnapshot.state || '(none)'))}</div></div><div><strong>Change type</strong><div>${escapeHtml(debug.changeType || 'unchanged')}</div></div><div><strong>Raw resolver verdict</strong><div>${escapeHtml(rrResolution.rawResolverVerdict || rrResolution.status || displayStageForRecord(item) || 'n/a')}</div></div><div><strong>Remap reason</strong><div>${escapeHtml(rrResolution.remapReason || 'n/a')}</div></div><div><strong>Reason</strong><div>${escapeHtml(debug.reason || lifecycleSnapshot.reason || 'n/a')}</div></div><div><strong>Structure</strong><div>${escapeHtml(String(derivedStates.structureState || 'n/a'))}</div></div><div><strong>Bounce</strong><div>${escapeHtml(String(derivedStates.bounceState || 'n/a'))}</div></div><div><strong>Volume</strong><div>${escapeHtml(String(derivedStates.volumeState || 'n/a'))}</div></div><div><strong>Market regime</strong><div>${escapeHtml(qualityAdjustments.weakRegimePenalty ? 'Weak market' : 'Supportive')}</div></div><div><strong>Control</strong><div>${escapeHtml(qualityAdjustments.controlQuality || 'n/a')}</div></div><div><strong>Plan</strong><div>${escapeHtml(getPlanUiState(item, {displayedPlan}).label || 'n/a')}</div></div><div><strong>RR confidence</strong><div>${escapeHtml(rrResolution.rr_label || 'n/a')}</div></div><div><strong>Capital fit</strong><div>${escapeHtml(capitalComfort.label || 'n/a')}</div></div><div><strong>Tradeability</strong><div>${escapeHtml(rrResolution.status || displayStageForRecord(item) || 'n/a')}</div></div><div><strong>Next possible</strong><div>${escapeHtml(debug.nextPossibleState || 'n/a')}</div></div><div><strong>Main blocker</strong><div>${escapeHtml(debug.mainBlocker || 'n/a')}</div></div></div>${warnings.length ? `<div class="watchlist-debug-block tiny"><strong>Warnings</strong><div>${warnings.map(warning => escapeHtml(warning)).join(' | ')}</div></div>` : ''}${auditTrail.length ? `<div class="watchlist-debug-block tiny"><strong>Recent events</strong>${auditTrail.map(entry => `<div>${escapeHtml(formatLocalTimestamp(entry.at) || entry.at || 'n/a')} | ${escapeHtml(entry.source || 'n/a')} | ${escapeHtml(entry.result || 'n/a')}</div>`).join('')}</div>` : ''}</details>`;
}

function stopWatchlistLifecycleAutomation(){
  clearInterval(watchlistLifecycleTimer);
  watchlistLifecycleTimer = null;
}

function startWatchlistLifecycleAutomation(){
  stopWatchlistLifecycleAutomation();
  if(typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
  watchlistLifecycleTimer = setInterval(() => {
    if(document.visibilityState !== 'visible') return;
    runWatchlistLifecycleEvaluation({source:'interval'});
  }, WATCHLIST_LIFECYCLE_INTERVAL_MS);
}

function handleWatchlistLifecycleVisibility(){
  if(document.visibilityState === 'visible'){
    runWatchlistLifecycleEvaluation({source:'focus'});
    startWatchlistLifecycleAutomation();
    return;
  }
  stopWatchlistLifecycleAutomation();
}

function bootstrapWatchlistLifecycleAutomation(){
  if(!watchlistLifecycleListenersBound){
    document.addEventListener('visibilitychange', handleWatchlistLifecycleVisibility);
    window.addEventListener('focus', () => {
      if(document.visibilityState !== 'visible') return;
      runWatchlistLifecycleEvaluation({source:'focus'});
      startWatchlistLifecycleAutomation();
    });
    watchlistLifecycleListenersBound = true;
  }
  handleWatchlistLifecycleVisibility();
}

function purgeExpiredWatchlistEntries(){
  let changed = false;
  allTickerRecords().forEach(record => {
    if(!record.watchlist.inWatchlist) return;
    const beforeStage = String(record.lifecycle.stage || '');
    const beforeStatus = String(record.lifecycle.status || '');
    syncWatchlistLifecycle(record);
    if(beforeStage !== String(record.lifecycle.stage || '') || beforeStatus !== String(record.lifecycle.status || '')){
      changed = true;
    }
  });
  if(changed) commitTickerState();
}

function getSavedScannerUniverseSnapshot(){
  const saved = safeStorageGet(savedScannerUniverseKey, null);
  const meta = safeStorageGet(savedScannerUniverseMetaKey, null);
  if(!Array.isArray(saved) || !saved.length) return null;
  return {
    count:Number.isFinite(Number(meta && meta.count)) ? Number(meta.count) : saved.length,
    savedAt:String(meta && meta.savedAt || '')
  };
}

function renderSavedScannerUniverseSnapshot(message = ''){
  const box = $('savedUniverseSummary');
  if(!box) return;
  const snapshot = getSavedScannerUniverseSnapshot();
  if(!snapshot){
    box.innerHTML = `${message ? `<div class="tiny">${message}</div>` : ''}<div><strong>Saved scanner universe</strong></div><div class="tiny">No saved scanner universe snapshot on this device.</div>`;
    return;
  }
  const savedAt = formatLocalTimestamp(snapshot.savedAt);
  box.innerHTML = `<div class="saved-universe-row"><div><strong>Saved scanner universe</strong><div class="tiny">${escapeHtml(String(snapshot.count))} symbol${snapshot.count === 1 ? '' : 's'} saved${savedAt ? ` | Last saved ${escapeHtml(savedAt)}` : ''}</div>${message ? `<div class="tiny">${message}</div>` : ''}</div><button class="ghost compactbutton" id="clearSavedUniverseBtn" type="button">Clear Saved</button></div>`;
  const clearBtn = $('clearSavedUniverseBtn');
  if(clearBtn) clearBtn.onclick = clearSavedScannerUniverseList;
}

function clearSavedScannerUniverseList(){
  if(!getSavedScannerUniverseSnapshot()){
    setStatus('inputStatus', '<span class="warntext">No saved scanner universe snapshot was found.</span>');
    renderSavedScannerUniverseSnapshot();
    return;
  }
  if(!window.confirm('Clear the saved scanner universe snapshot from this device?')) return;
  safeStorageRemove(savedScannerUniverseKey);
  safeStorageRemove(savedScannerUniverseMetaKey);
  renderSavedScannerUniverseSnapshot('Saved scanner universe snapshot cleared.');
  setStatus('inputStatus', '<span class="ok">Saved scanner universe snapshot cleared from this device.</span>');
}

function renderWatchlist(){
  syncWatchlistLifecycleBeforeRender('auto_recompute');
  purgeExpiredWatchlistEntries();
  const box = $('watchlistList');
  if(!box) return;
  let gatingChanged = false;
  watchlistTickerRecords().forEach(record => {
    const gated = applyGlobalVerdictGates(record, {source:'auto_recompute'});
    if(gated.changed) gatingChanged = true;
  });
  if(gatingChanged) commitTickerState();
  const showExpired = !!state.showExpiredWatchlist;
  const records = watchlistTickerRecords().filter(record => {
    const lifecycle = syncWatchlistLifecycle(record) || watchlistLifecycleSnapshot(record);
    if(showExpired) return true;
    return !['dead','expired'].includes(lifecycle.state);
  });
  console.debug('RENDER_FROM_TICKER_RECORD', 'watchlist', records.length);
  if(!records.length){
    box.innerHTML = showExpired
      ? '<div class="summary">No watchlist entries match this filter right now.</div>'
      : '<div class="summary">No active watchlist entries yet. Add one from a ticker card after you review a setup.</div>';
    renderWorkflowAlerts();
    return;
  }
  box.innerHTML = '';
  const groups = [
    {key:'tradeable_entry', title:'Tradeable / Entry', hint:'Near-entry and entry-grade watchlist records.'},
    {key:'monitor_watch', title:'Monitor / Watch', hint:'Structurally alive setups worth keeping on the watchlist.'},
    {key:'low_priority_avoid', title:'Low Priority / Avoid', hint:'Downgraded or failed watchlist records.'}
  ];
  if(showExpired){
    groups.push({key:'inactive', title:'Dead / Expired', hint:'Technically failed or aged-out watchlist records.'});
  }
  groups.forEach(group => {
    const groupRecords = records.filter(record => watchlistPresentationBucketForRecord(record) === group.key);
    if(!groupRecords.length) return;
    const section = document.createElement('div');
    section.className = 'watchlistgroup';
    section.innerHTML = `<div class="summary" style="margin:12px 0 8px"><strong>${escapeHtml(group.title)}</strong> <span class="tiny">${escapeHtml(group.hint)}</span></div>`;
    groupRecords.forEach(record => {
      const entry = tickerRecordToWatchlistEntry(record);
      if(!entry) return;
      const view = buildFinalSetupView(record);
      const liveRefreshPending = isWatchlistLiveRefreshPending(record.ticker);
      const remaining = getTradingDaysRemaining(entry);
      const lifecycleText = lifecycleLabel(record);
      const lifecycleSnapshot = syncWatchlistLifecycle(record) || watchlistLifecycleSnapshot(record);
      const expired = lifecycleSnapshot.state === 'expired' || record.lifecycle.stage === 'expired' || record.lifecycle.status === 'stale';
      const expiryDate = record.lifecycle.expiresAt || 'Not set';
      const priority = watchlistPriorityForRecord(record);
      const avoidSubtype = avoidSubtypeForRecord(record);
      const derivedStates = analysisDerivedStatesFromRecord(record);
      const displayedPlan = applySetupConfirmationPlanGate(record, deriveCurrentPlanState(
        record.plan && record.plan.entry,
        record.plan && record.plan.stop,
        record.plan && record.plan.firstTarget,
        record.marketData && record.marketData.currency
      ), derivedStates);
      const qualityAdjustments = evaluateSetupQualityAdjustments(record, {displayedPlan, derivedStates});
      const rrResolution = resolveScannerStateWithTrace(record);
      const resolvedContract = resolveFinalStateContract(record, {
        context:'watchlist',
        finalVerdict:view.displayStage,
        derivedStates,
        displayedPlan,
        qualityAdjustments,
        rrResolution
      });
      const watchlistPresentation = resolveEmojiPresentation(record, {
        context:'watchlist',
        finalVerdict:view.displayStage,
        setupUiState:view.setupUiState,
        displayedPlan:view.displayedPlan,
        derivedStates:view.setupStates,
        warningState:view.warningState,
        avoidSubtype
      });
      watchlistPresentation.primaryText = resolvedContract.badgeText;
      watchlistPresentation.badgeClass = resolvedContract.badgeClass;
      watchlistPresentation.modifiers = resolvedContract.modifiers || watchlistPresentation.modifiers;
      const watchlistBadgeClass = ['expired','dead'].includes(lifecycleSnapshot.state) ? 'avoid' : resolvedContract.badgeClass;
      const watchlistBadgeLabel = lifecycleSnapshot.state === 'expired'
        ? 'Expired'
        : (lifecycleSnapshot.state === 'dead' ? '💀 Dead' : watchlistPresentation.primaryText);
      const watchlistSignalMarkup = emojiModifierMarkup({
        ...watchlistPresentation,
        modifiers:prioritizedSignalModifiers(watchlistPresentation, 2)
      });
      const reviewPresentation = resolveEmojiPresentation(record, {context:'review'});
      if(reviewPresentation.primaryText !== watchlistPresentation.primaryText){
        console.warn('EMOJI_SURFACE_DISAGREEMENT', {ticker:record.ticker, watchlist:watchlistPresentation.primaryText, review:reviewPresentation.primaryText});
      }
      const reasoning = decisionReasoningForRecord(record, {
        reviewVerdict:view.displayStage,
        avoidSubtype
      });
      const shortAction = watchlistActionSummary({
        label:resolvedContract.actionLabel,
        shortLabel:resolvedContract.actionShortLabel
      });
      const decisionCopy = watchlistDecisionPresentation(resolvedContract, lifecycleSnapshot, reasoning, shortAction);
      const visualState = resolveVisualState(record, 'watchlist', {
        resolvedContract,
        derivedStates,
        displayedPlan,
        setupScore:view && view.setupScore
      });
      const globalVerdict = resolveGlobalVerdict(record);
      const watchlistVisualState = reconcileWatchlistPresentation({
        record,
        visualState,
        globalVerdict,
        lifecycleSnapshot,
        resolvedContract,
        derivedStates,
        displayedPlan
      });
      const shortReason = decisionCopy.reason;
      const watchlistSignalRowMarkup = watchlistVisualState.watchlist_presentation_source === 'strict_reconciled'
        ? ''
        : watchlistSignalMarkup;
      record.watchlist.debug = record.watchlist.debug && typeof record.watchlist.debug === 'object' ? record.watchlist.debug : {};
      if(!record.watchlist.debug.holdTrace){
        const seededAt = new Date().toISOString();
        record.watchlist.debug.holdTrace = `hold_helper.rendered | ${seededAt}`;
        const history = Array.isArray(record.watchlist.debug.holdTraceHistory) ? record.watchlist.debug.holdTraceHistory : [];
        record.watchlist.debug.holdTraceHistory = [`hold_helper.rendered | ${seededAt}`, ...history].slice(0, 8);
      }
      const debugPane = renderWatchlistDebugPane(record, lifecycleSnapshot, priority, {
        derivedStates,
        displayedPlan,
        qualityAdjustments,
        rrResolution,
        resolvedContract,
        globalVisual:watchlistVisualState
      });
      const div = document.createElement('div');
      const watchlistState = String(lifecycleSnapshot.state || '').toLowerCase();
      const primaryState = String(watchlistPresentation.primaryState || '').toLowerCase();
      const finalDisplayState = String(resolvedContract.finalDisplayState || '').toLowerCase();
      const planState = String(resolvedContract.planStatusKey || '').toLowerCase();
      const watchlistScoreText = liveRefreshPending
        ? 'Refreshing...'
        : (expired ? 'Expired' : view.setupScoreDisplay.replace('Setup ', ''));
      const watchlistScoreClass = liveRefreshPending ? 's-neutral' : 'visual-score';
      const liveRefreshNote = liveRefreshPending
        ? '<div class="tiny watchlist-card__refresh">Refreshing from live data. Saved setup score is provisional.</div>'
        : '';
      const decisionSummary = watchlistVisualState.decision_summary;
      const planUI = resolvePlanVisibility({
        state:watchlistVisualState.finalVerdict,
        bounce_state:derivedStates.bounceState || (record && record.setup && record.setup.bounceState),
        structure:derivedStates.structureState || (record && record.setup && record.setup.structureState)
      });
      const entryConditionsSummary = buildEntryConditionsSummary({
        ticker:entry.ticker,
        finalVerdict:watchlistVisualState.finalVerdict || watchlistVisualState.final_verdict,
        resolvedContract,
        globalVerdict,
        derivedStates,
        displayedPlan
      });
      const watchlistPanelId = entryConditionsPanelId('watchlist', entry.ticker);
      const watchlistEntryConditionsHelper = renderEntryConditionsHoldHelper(entryConditionsSummary, 'watchlist', entry.ticker, {mode:'card'});
      div.className = `resultcompact watchlist-card ${escapeHtml(watchlistVisualState.className || watchlistVisualState.toneClass || '')}`.trim();
      div.style.cssText = watchlistVisualState.styleAttr || '';
      div.dataset.visualTone = watchlistVisualState.visual_tone || '';
      div.dataset.visualState = watchlistVisualState.state || '';
      div.innerHTML = `<div class="watchlist-card__header"><div class="watchlist-card__header-row"><div class="ticker watchlist-card__ticker">${escapeHtml(entry.ticker)}</div></div><div class="watchlist-card__status badge-score-row"><span class="badge state-pill ${escapeHtml((watchlistVisualState.badge && watchlistVisualState.badge.className) || 'near')}">${escapeHtml((watchlistVisualState.badge && watchlistVisualState.badge.text) || '🟡 Monitor')}</span><span class="score watchlistscore ${escapeHtml(watchlistScoreClass)}">${escapeHtml(watchlistScoreText)}</span><span class="tiny watchlist-card__priority">Priority ${escapeHtml(String(priority.score))}</span></div><div class="tiny watchlist-card__company">${escapeHtml(record.meta.companyName || '')}${record.meta.exchange ? ` | ${escapeHtml(record.meta.exchange)}` : ''}</div>${liveRefreshNote}</div><div class="watchlist-signal-row">${watchlistSignalRowMarkup}</div>${decisionSummary ? `<div class="tiny watchlist-card__reason decision-summary">${escapeHtml(decisionSummary)}</div>` : ''}<div class="watchlist-actions"><button class="primary" data-act="review">Review</button><button class="secondary" data-act="remove-watch">Remove</button></div><details class="compact-details watchlist-card__details"><summary>More</summary><div class="tiny watchlist-plan-meta">${escapeHtml(planUI.showPlan ? resolvedContract.planStatusLabel : (planUI.diagnosticsMessage || 'Bounce is too weak to price cleanly.'))}</div>${reasoning.detail ? `<div class="tiny watchlist-card__detail">${escapeHtml(reasoning.detail)}</div>` : ''}<div class="tiny">Added ${escapeHtml(entry.dateAdded)} | Expires ${escapeHtml(expiryDate)} | ${escapeHtml(String(remaining))} day${remaining === 1 ? '' : 's'} left</div><div class="tiny">Lifecycle: ${escapeHtml(lifecycleText)}</div>${debugPane}<div class="watchlist-actions watchlist-actions--detail"><button class="secondary" data-act="save-diary">Save</button><button class="secondary" data-act="refresh-life">Refresh</button></div></details>`;
      div.querySelector('[data-act="review"]').title = 'Load the saved setup into Setup Review';
      div.querySelector('[data-act="review"]').onclick = () => { reviewWatchlistTicker(entry.ticker); };
      div.querySelector('[data-act="save-diary"]').onclick = () => saveTradeFromCard(entry.ticker);
      div.querySelector('[data-act="refresh-life"]').onclick = () => { refreshWatchlistTicker(entry.ticker).catch(() => {}); };
      div.querySelector('[data-act="remove-watch"]').onclick = () => removeFromWatchlist(entry.ticker);
      if(watchlistEntryConditionsHelper){
        div.setAttribute('data-entry-hold-helper', '1');
        div.setAttribute('data-hold-card-trigger', '1');
        div.setAttribute('data-hold-ticker', entry.ticker);
        div.setAttribute('data-panel-id', watchlistPanelId);
        div.setAttribute('data-hold-ms', '550');
        const holdWrapper = document.createElement('div');
        holdWrapper.innerHTML = watchlistEntryConditionsHelper;
        if(holdWrapper.firstElementChild) div.appendChild(holdWrapper.firstElementChild);
      }
      section.appendChild(div);
      bindEntryConditionsHoldInteractions(div);
    });
    box.appendChild(section);
  });
  renderWorkflowAlerts();
  return;
  records.forEach(record => {
    const entry = tickerRecordToWatchlistEntry(record);
    if(!entry) return;
    const view = buildFinalSetupView(record);
    const warningState = evaluateWarningState(record, getReviewAnalysisState(record).normalizedAnalysis);
    const remaining = getTradingDaysRemaining(entry);
    const lifecycleText = lifecycleLabel(record);
    const expired = record.lifecycle.stage === 'expired' || record.lifecycle.status === 'stale';
    const cautionChip = warningState.showWarning
      ? '⚠️ Weak market'
      : (record.setup.marketCaution ? '⚠️ Weak market' : view.convictionTier);
    const expiryDate = record.lifecycle.expiresAt || 'Not set';
    const div = document.createElement('div');
    div.className = 'resultcompact';
    div.innerHTML = `<div class="resulthead" style="${escapeHtml(cardVisualStyleAttr(view && view.setupScore, view && view.setupUiState && view.setupUiState.state))}"><div class="watchlistidentity inline-status" style="justify-content:space-between;align-items:flex-start"><div class="ticker">${escapeHtml(entry.ticker)}</div><div class="inline-status"><span class="badge ${statusClass(view.displayStage)}">${escapeHtml(view.setupUiState.label)}</span><span class="score watchlistscore ${expired ? 's-low' : scoreClass(view.setupScore || 0)}">${escapeHtml(expired ? 'Expired' : view.setupScoreDisplay.replace('Setup ', ''))}</span></div></div><div class="tiny">${escapeHtml(record.meta.companyName || '')}${record.meta.exchange ? ` | ${escapeHtml(record.meta.exchange)}` : ''}</div><div class="inline-status" style="margin-top:8px"><span class="pill">${escapeHtml(cautionChip)}</span><span class="pill">${escapeHtml(view.planStateLabel)}</span></div><div class="tiny" style="margin-top:8px">Added ${escapeHtml(entry.dateAdded)} | Expires ${escapeHtml(expiryDate)} | ${escapeHtml(String(remaining))} day${remaining === 1 ? '' : 's'} left</div><div class="tiny">Lifecycle: ${escapeHtml(lifecycleText)}</div><div class="resultreview inline-status" style="margin-top:10px"><button class="primary" data-act="review">Review</button><button class="secondary" data-act="save-diary">Save to Diary</button><button class="secondary" data-act="refresh-life">Refresh</button><button class="danger" data-act="remove-watch">Remove</button></div></div>`;
    div.querySelector('[data-act="review"]').title = 'Load the saved setup into Setup Review';
    div.querySelector('[data-act="review"]').onclick = () => { reviewWatchlistTicker(entry.ticker); };
    div.querySelector('[data-act="save-diary"]').onclick = () => saveTradeFromCard(entry.ticker);
    div.querySelector('[data-act="refresh-life"]').onclick = () => { refreshWatchlistTicker(entry.ticker).catch(() => {}); };
    div.querySelector('[data-act="remove-watch"]').onclick = () => removeFromWatchlist(entry.ticker);
    box.appendChild(div);
  });
  renderWorkflowAlerts();
}

function reviewHeaderContextChip(record, warningState){
  if(warningState && warningState.showWarning){
    return {
      label:'⚠️ Weak market',
      className:'near',
      title:warningState.reasons.join(' | ')
    };
  }
  if(record && (record.setup.marketCaution || isHostileMarketStatus(record.meta && record.meta.marketStatus || state.marketStatus))){
    return {
      label:'⚠️ Weak market',
      className:'near',
      title:'Market regime is weaker than ideal.'
    };
  }
  return null;
}

// Save/load the scanner universe separately from the rest of app state so the
// buttons operate on the list itself, not the whole app snapshot.
function saveScannerUniverseList(){
  const parsed = syncScannerUniverseDraft({updateInputStatus:false});
  const tickers = uniqueTickers(parsed.valid || state.tickers || []);
  if(!tickers.length){
    setStatus('inputStatus', '<span class="warntext">There is no scanner universe to save yet.</span>');
    return;
  }
  const saved = tickers.map(ticker => {
    const meta = getStoredTickerMeta(ticker);
    return {
      ticker,
      scanType:normalizeScanType(meta && meta.scanType)
    };
  });
  const meta = {
    savedAt:new Date().toISOString(),
    count:saved.length
  };
  safeStorageSet(savedScannerUniverseKey, saved);
  safeStorageSet(savedScannerUniverseMetaKey, meta);
  saveState();
  setStatus('inputStatus', `<span class="ok">Saved ${saved.length} ticker${saved.length === 1 ? '' : 's'} to the scanner universe list.</span>`);
  renderSavedScannerUniverseSnapshot('Snapshot updated on this device.');
}

function loadSavedScannerUniverseList(){
  const raw = safeStorageGet(savedScannerUniverseKey, null);
  const meta = safeStorageGet(savedScannerUniverseMetaKey, null);
  if(!Array.isArray(raw) || !raw.length){
    setStatus('inputStatus', '<span class="warntext">No saved scanner universe list was found on this device.</span>');
    return;
  }
  const tickers = [];
  const metaMap = {};
  raw.forEach(item => {
    const ticker = normalizeTicker(typeof item === 'string' ? item : item && item.ticker);
    if(!validateTickerSymbol(ticker) || tickers.includes(ticker)) return;
    tickers.push(ticker);
    const scanType = normalizeScanType(item && item.scanType);
    if(scanType) metaMap[ticker] = {scanType};
  });
  if(!tickers.length){
    setStatus('inputStatus', '<span class="warntext">Saved scanner universe data is empty or invalid.</span>');
    return;
  }
  applyManualUniverseTickers(tickers, metaMap);
  const savedAt = meta && meta.savedAt ? new Date(meta.savedAt).toLocaleString() : '';
  setStatus('inputStatus', `<span class="ok">Loaded ${tickers.length} saved ticker${tickers.length === 1 ? '' : 's'}${savedAt ? ` from ${escapeHtml(savedAt)}` : ''}.</span>`);
  renderSavedScannerUniverseSnapshot();
}

// ============================================================================
// Diary, outcome engine, analytics, and alerts
// ============================================================================
function scannerUniverse(){
  return finalScanUniverse();
}

function scannerUniverseMode(){
  return effectiveUniverseMode();
}

function prepareScannerUniverse(options = {}){
  const parsed = options.syncInput ? syncUniverseFromInputs(true) : {valid:scannerUniverse(), invalid:[], duplicates:[]};
  const universe = scannerUniverse();
  const imported = uniqueTickers(state.tickers || []);
  const mode = scannerUniverseMode();
  if(!universe.length){
    return {parsed, universe, blocked:false};
  }
  if(Number.isFinite(currentMaxScanTickers()) && mode === 'tradingview_only' && imported.length > currentMaxScanTickers()){
    const message = `${currentProviderLabel()} scans are limited to ${currentMaxScanTickers()} tickers in the current plan.`;
    setStatus('inputStatus', `<span class="badtext">${escapeHtml(message)}</span>`);
    setStatus('apiStatus', `<span class="badtext">${escapeHtml(message)}</span>`);
    return {parsed, universe, blocked:true};
  }
  return {parsed, universe, blocked:false};
}

function scannerEmptyState(message){
  state.scannerResults = [];
  state.scannerDebug = [];
  uiState.selectedScanner = {};
  clearScannerSessionState({suppressed:false});
  commitTickerState();
  renderTickerQuickLists();
  renderScannerResults();
  renderCards();
  renderScannerRulesPanel();
  setStatus('apiStatus', message || 'Add tickers to the scanner universe first.');
}

async function runScannerWorkflow(options = {}){
  setRuntimeDebugContext(`scan:${new Date().toISOString()}`);
  pushRuntimeDebugEntry('scanner.start', {
    message:'Run Scan started',
    extra:{
      force:!!options.force,
      syncInput:!!options.syncInput
    }
  });
  clearScannerSessionState({suppressed:false});
  saveState();
  const {parsed, universe, blocked} = prepareScannerUniverse(options);
  if(blocked) return {done:0, failed:0, rejected:0};
  if(!options.syncInput) updateTickerInputFromState();
  updateRecentTickers(universe);
  renderTickerQuickLists();
  renderScannerRulesPanel();
  renderScannerResults();
  if(!universe.length){
    const messages = [];
    if(parsed.invalid.length) messages.push(`Invalid: ${escapeHtml(parsed.invalid.join(', '))}`);
    setStatus('inputStatus', messages.length ? `<span class="badtext">${messages.join(' ')}</span>` : 'Add at least one valid ticker to the scanner universe first.');
    scannerEmptyState('Waiting for a scanner universe.');
    return {done:0, failed:0, rejected:0};
  }
  const mode = scannerUniverseMode();
  const modeLabel = mode === 'tradingview_only'
    ? 'TradingView Only universe'
    : (mode === 'combined' ? 'Combined universe' : 'Curated Core 8 fallback universe');
  setStatus('inputStatus', `<span class="ok">${universe.length} ticker${universe.length === 1 ? '' : 's'} ready in the ${modeLabel}.</span>`);
  setStatus('apiStatus', `<span class="warntext">Running Quality Pullback Scanner on ${universe.length} ticker${universe.length === 1 ? '' : 's'}...</span>`);
  let result;
  try{
    result = await refreshMarketDataForTickers(universe, options);
  }catch(err){
    pushRuntimeDebugEntry('scanner.error', {
      message:err && err.message ? err.message : 'Scanner workflow failed',
      stack:err && err.stack ? err.stack : '',
      extra:{
        universe,
        options
      }
    });
    throw err;
  }
  state.dismissedFocusTickers = [];
  state.dismissedFocusCycle = '';
  state.activeQueueClearedCycle = '';
  state.activeQueueClearedTickers = [];
  persistState();
  if($('advancedScannerTools')) $('advancedScannerTools').open = false;
  if($('resultsToggle')){
    $('resultsToggle').open = true;
    syncResultsToggleLabel();
  }
  setScannerSessionResults(universe, new Date().toISOString());
  renderScannerResults();
  renderFocusQueue();
  setStatus('apiStatus', `<span class="ok">Quality Pullback Scanner finished.</span> ${result.done} ranked, ${result.rejected} avoid, ${result.failed} failed.`);
  pushRuntimeDebugEntry('scanner.complete', {
    message:'Run Scan finished',
    extra:result
  });
  return result;
}

function syncScannerUniverseDraft(options = {}){
  saveState();
  const parsed = syncUniverseFromInputs(true);
  updateRecentTickers(parsed.valid);
  updateTickerInputFromState();
  commitTickerState();
  renderTickerQuickLists();
  if(options.updateInputStatus !== false){
    const messages = [];
    if(parsed.valid.length) messages.push(`<span class="ok">${parsed.valid.length} ticker${parsed.valid.length === 1 ? '' : 's'} saved in the scanner universe.</span>`);
    if(parsed.invalid.length) messages.push(`<span class="badtext">Invalid: ${escapeHtml(parsed.invalid.join(', '))}</span>`);
    if(parsed.duplicates.length) messages.push(`<span class="warntext">Duplicates skipped: ${escapeHtml([...new Set(parsed.duplicates)].join(', '))}</span>`);
    setStatus('inputStatus', messages.join(' ') || 'No valid tickers in the scanner universe yet.');
  }
  return parsed;
}

function setStatus(id, html){
  const el = $(id);
  if(el) el.innerHTML = html;
}

function formatRuntimeDebugValue(value, depth = 0){
  if(value == null) return String(value);
  if(typeof value === 'string') return value;
  if(typeof value === 'number' || typeof value === 'boolean') return String(value);
  if(value instanceof Error){
    return [value.name || 'Error', value.message || '', value.stack || ''].filter(Boolean).join('\n');
  }
  if(depth > 1) return '[object]';
  try{
    return JSON.stringify(value, (key, innerValue) => {
      if(innerValue instanceof Error){
        return {
          name:innerValue.name,
          message:innerValue.message,
          stack:innerValue.stack
        };
      }
      return innerValue;
    }, 2);
  }catch(err){
    return `[unserializable: ${err.message}]`;
  }
}

function renderRuntimeDebugPanel(){
  const statusEl = $('runtimeDebugStatus');
  const outputEl = $('runtimeDebugOutput');
  if(!statusEl || !outputEl) return;
  const entries = Array.isArray(uiState.runtimeDebugEntries) ? uiState.runtimeDebugEntries : [];
  if(!entries.length){
    statusEl.textContent = 'No runtime errors captured yet.';
    outputEl.textContent = 'No runtime debug output yet.';
    return;
  }
  const latest = entries[0];
  statusEl.textContent = `${latest.type || 'runtime'} | ${latest.at || 'n/a'}${latest.context ? ` | ${latest.context}` : ''}`;
  outputEl.textContent = entries.map(entry => {
    return [
      `[${entry.at || 'n/a'}] ${entry.type || 'runtime'}`,
      entry.context ? `Context: ${entry.context}` : '',
      entry.message ? `Message: ${entry.message}` : '',
      entry.stack ? `Stack:\n${entry.stack}` : '',
      entry.extra ? `Extra:\n${entry.extra}` : ''
    ].filter(Boolean).join('\n');
  }).join('\n\n---\n\n');
}

function pushRuntimeDebugEntry(type, payload = {}){
  const entry = {
    at:new Date().toISOString(),
    type:String(type || 'runtime'),
    context:String(payload.context || uiState.runtimeDebugContext || '').trim(),
    message:String(payload.message || '').trim(),
    stack:String(payload.stack || '').trim(),
    extra:payload.extra ? formatRuntimeDebugValue(payload.extra) : ''
  };
  uiState.runtimeDebugEntries = [entry, ...(uiState.runtimeDebugEntries || [])].slice(0, 12);
  renderRuntimeDebugPanel();
}

function setRuntimeDebugContext(context){
  uiState.runtimeDebugContext = String(context || '').trim();
  renderRuntimeDebugPanel();
}

function clearRuntimeDebugLog(){
  uiState.runtimeDebugEntries = [];
  uiState.runtimeDebugContext = '';
  renderRuntimeDebugPanel();
}

function installRuntimeDebugHooks(){
  if(typeof window === 'undefined' || window.__ppRuntimeDebugInstalled) return;
  window.__ppRuntimeDebugInstalled = true;
  window.addEventListener('error', event => {
    const error = event && event.error;
    pushRuntimeDebugEntry('window.error', {
      message:(error && error.message) || event.message || 'Unknown runtime error',
      stack:(error && error.stack) || '',
      extra:{
        filename:event.filename || '',
        lineno:event.lineno || '',
        colno:event.colno || ''
      }
    });
  });
  window.addEventListener('unhandledrejection', event => {
    const reason = event && event.reason;
    pushRuntimeDebugEntry('unhandledrejection', {
      message:(reason && reason.message) || String(reason || 'Unhandled promise rejection'),
      stack:(reason && reason.stack) || '',
      extra:reason
    });
  });
}

function getTradeRecord(recordId){
  const found = diaryTradeRecords().find(item => item.trade.id === recordId);
  return found ? found.trade : null;
}

function getCanonicalTradeSnapshot(cardOrTicker){
  const ticker = typeof cardOrTicker === 'string'
    ? normalizeTicker(cardOrTicker)
    : normalizeTicker(cardOrTicker && cardOrTicker.ticker);
  const record = getTickerRecord(ticker);
  const card = typeof cardOrTicker === 'string' ? null : cardOrTicker;
  if(record){
    const effectivePlan = effectivePlanForRecord(record, {allowScannerFallback:true});
    const entry = String(effectivePlan.entry || '');
    const stop = String(effectivePlan.stop || '');
    const firstTarget = String(effectivePlan.firstTarget || '');
    const riskFit = evaluateRiskFit({entry, stop, ...currentRiskSettings()});
    const rewardRisk = evaluateRewardRisk(entry, stop, firstTarget);
    return {
      ticker:record.ticker,
      chartVerdict:preferredVerdictForRecord(record),
      verdict:preferredVerdictForRecord(record),
      qualityScore:Number.isFinite(preferredScoreForRecord(record)) ? preferredScoreForRecord(record) : '',
      exitMode:normalizeExitMode(record.plan.exitMode),
      entry,
      stop,
      firstTarget,
      maxLoss:Number.isFinite(riskFit.max_loss) ? String(Number(riskFit.max_loss.toFixed(2))) : '',
      riskPerShare:Number.isFinite(riskFit.risk_per_share) ? String(Number(riskFit.risk_per_share.toFixed(2))) : '',
      rewardPerShare:Number.isFinite(rewardRisk.rewardPerShare) ? String(Number(rewardRisk.rewardPerShare.toFixed(2))) : '',
      rrRatio:Number.isFinite(rewardRisk.rrRatio) ? String(Number(rewardRisk.rrRatio.toFixed(2))) : '',
      rrState:rewardRisk.rrState,
      firstTargetTooClose:rewardRisk.valid ? rewardRisk.rewardPerShare < (1.5 * rewardRisk.riskPerShare) : false,
      positionSize:String(riskFit.position_size || ''),
      riskStatus:riskFit.risk_status,
      accountSize:String(state.accountSize || ''),
      marketStatus:record.meta.marketStatus || state.marketStatus || '',
      scanType:record.scan.scanType || '',
      notes:record.review.notes || preferredSummaryForRecord(record) || '',
      plannedEntry:entry,
      plannedStop:stop,
      plannedFirstTarget:firstTarget,
      plannedRiskPerShare:Number.isFinite(riskFit.risk_per_share) ? String(Number(riskFit.risk_per_share.toFixed(2))) : '',
      plannedRewardPerShare:Number.isFinite(rewardRisk.rewardPerShare) ? String(Number(rewardRisk.rewardPerShare.toFixed(2))) : '',
      plannedRR:Number.isFinite(rewardRisk.rrRatio) ? String(Number(rewardRisk.rrRatio.toFixed(2))) : '',
      plannedPositionSize:String(riskFit.position_size || ''),
      plannedMaxLoss:Number.isFinite(riskFit.max_loss) ? String(Number(riskFit.max_loss.toFixed(2))) : '',
      plannedAt:todayIsoDate(),
      setupTags:[record.scan.scanType || '', record.scan.pullbackType || ''].filter(Boolean),
      beforeImage:record.review.chartRef && record.review.chartRef.dataUrl ? String(record.review.chartRef.dataUrl) : ''
    };
  }
  if(!card) return null;
  const normalized = normalizeCard(card);
  const manualReview = normalized.manualReview && typeof normalized.manualReview === 'object' ? normalized.manualReview : null;
  const analysisOwnsPlan = !!(normalized.lastAnalysis && typeof normalized.lastAnalysis === 'object' && normalized.lastAnalysis.plan_metrics_valid);
  const entry = analysisOwnsPlan ? String(normalized.lastAnalysis.entry || '') : String(normalized.entry || (manualReview && manualReview.entry) || '');
  const stop = analysisOwnsPlan ? String(normalized.lastAnalysis.stop || '') : String(normalized.stop || (manualReview && manualReview.stop) || '');
  const firstTarget = analysisOwnsPlan ? String(normalized.lastAnalysis.first_target || '') : String(normalized.target || (manualReview && manualReview.target) || '');
  const riskFit = evaluateRiskFit({entry, stop, ...currentRiskSettings()});
  const rewardRisk = evaluateRewardRisk(entry, stop, firstTarget);
  return {
    ticker:normalized.ticker,
    chartVerdict:normalized.chartVerdict || normalized.status || 'Watch',
    verdict:normalized.chartVerdict || normalized.status || 'Watch',
    qualityScore:Number.isFinite(normalized.score) ? normalized.score : '',
    entry:String(entry || ''),
    stop:String(stop || ''),
    firstTarget:String(firstTarget || ''),
    maxLoss:Number.isFinite(riskFit.max_loss) ? String(Number(riskFit.max_loss.toFixed(2))) : '',
    riskPerShare:Number.isFinite(riskFit.risk_per_share) ? String(Number(riskFit.risk_per_share.toFixed(2))) : '',
    rewardPerShare:Number.isFinite(rewardRisk.rewardPerShare) ? String(Number(rewardRisk.rewardPerShare.toFixed(2))) : '',
    rrRatio:Number.isFinite(rewardRisk.rrRatio) ? String(Number(rewardRisk.rrRatio.toFixed(2))) : '',
    rrState:rewardRisk.rrState,
    firstTargetTooClose:rewardRisk.valid ? rewardRisk.rewardPerShare < (1.5 * rewardRisk.riskPerShare) : false,
    positionSize:String(riskFit.position_size || ''),
    riskStatus:riskFit.risk_status,
    accountSize:String(state.accountSize || ''),
    marketStatus:normalized.marketStatus || state.marketStatus || '',
    scanType:normalized.scanType || normalized.setupType || '',
    notes:normalized.notes || normalized.summary || '',
    plannedEntry:String(entry || ''),
    plannedStop:String(stop || ''),
    plannedFirstTarget:String(firstTarget || ''),
    plannedRiskPerShare:Number.isFinite(riskFit.risk_per_share) ? String(Number(riskFit.risk_per_share.toFixed(2))) : '',
    plannedRewardPerShare:Number.isFinite(rewardRisk.rewardPerShare) ? String(Number(rewardRisk.rewardPerShare.toFixed(2))) : '',
    plannedRR:Number.isFinite(rewardRisk.rrRatio) ? String(Number(rewardRisk.rrRatio.toFixed(2))) : '',
    plannedPositionSize:String(riskFit.position_size || ''),
    plannedMaxLoss:Number.isFinite(riskFit.max_loss) ? String(Number(riskFit.max_loss.toFixed(2))) : '',
    plannedAt:todayIsoDate(),
    setupTags:[normalized.scanType || normalized.setupType || '', normalized.pullbackType || ''].filter(Boolean),
    beforeImage:normalized.chartRef && normalized.chartRef.dataUrl ? String(normalized.chartRef.dataUrl) : ''
  };
}

function plannerSummaryText(entry, stop, target, exitMode = 'fixed_target'){
  const rewardRisk = evaluateRewardRisk(entry, stop, target);
  const targetLabel = normalizeExitMode(exitMode) === 'dynamic_exit' ? 'Target Review Level' : 'First Target';
  return [
    `Entry: ${Number.isFinite(numericOrNull(entry)) ? fmtPrice(Number(entry)) : 'Not given'}`,
    `Stop: ${Number.isFinite(numericOrNull(stop)) ? fmtPrice(Number(stop)) : 'Not given'}`,
    `${targetLabel}: ${Number.isFinite(numericOrNull(target)) ? fmtPrice(Number(target)) : 'Not given'}`,
    `Raw R:R: ${rewardRisk.valid && Number.isFinite(rewardRisk.rrRatio) ? `${rewardRisk.rrRatio.toFixed(2)}R` : 'N/A'}`
  ].join(' | ');
}

function renderPlannerPlanSummary(entry = $('entryPrice') && $('entryPrice').value, stop = $('stopPrice') && $('stopPrice').value, target = $('targetPrice') && $('targetPrice').value, exitMode = 'fixed_target'){
  const box = $('plannerPlanSummary');
  if(!box) return;
  box.textContent = plannerSummaryText(entry, stop, target, exitMode);
}

function renderReviewLifecycleSummary(ticker){
  const box = $('reviewLifecycleSummary');
  if(!box) return;
  const record = getTickerRecord(ticker);
  if(!record){
    box.textContent = 'Lifecycle: Not tracked yet.';
    return;
  }
  maybeExpireTickerRecord(record);
  const item = normalizeTickerRecord(record);
  const globalVerdict = resolveGlobalVerdict(item);
  const lifecycleState = (globalVerdict.allow_watchlist || globalVerdict.allow_plan) ? 'active' : 'dropped';
  const planState = globalVerdict.allow_plan ? 'allowed' : 'blocked';
  const expiry = item.watchlist && item.watchlist.expiryAt ? ` | Expires ${item.watchlist.expiryAt}` : '';
  const reason = globalVerdict.reason ? ` | ${globalVerdict.reason}` : '';
  box.textContent = `Lifecycle: ${lifecycleState} | ${globalVerdict.final_verdict || 'watch'} | Plan ${planState}${expiry}${reason}`;
}

function syncPlannerFromTicker(ticker){
  const snapshot = getCanonicalTradeSnapshot(ticker);
  if(!snapshot) return;
  if($('selectedTicker')) $('selectedTicker').value = snapshot.ticker;
  if($('entryPrice')) $('entryPrice').value = snapshot.entry || '';
  if($('stopPrice')) $('stopPrice').value = snapshot.stop || '';
  if($('targetPrice')) $('targetPrice').value = snapshot.firstTarget || '';
  renderPlannerPlanSummary(snapshot.entry, snapshot.stop, snapshot.firstTarget, snapshot.exitMode || 'fixed_target');
  calculate({persist:false});
}

function tradeOutcomeStatusLabel(record){
  const normalized = normalizeTradeRecord(record);
  const lifecycle = deriveDiaryLifecycleState(normalized);
  if(lifecycle.stage === 'planned') return 'Planned';
  if(lifecycle.stage === 'entered') return normalized.outcome || 'Open';
  if(lifecycle.stage === 'cancelled') return 'Cancelled';
  return normalized.outcome || 'Closed';
}

function diarySummaryValue(value, fallback = 'n/a'){
  const text = String(value || '').trim();
  return text || fallback;
}

function renderDiaryTagButtons(recordId, field, options){
  return `<div class="actions" style="margin-top:6px">${options.map(tag => `<button class="ghost compactbutton" type="button" data-act="tag-pick" data-id="${escapeHtml(recordId)}" data-field="${escapeHtml(field)}" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`).join('')}</div>`;
}

// ============================================================================
// Analytics
// ============================================================================
function formatPercent(value){
  return Number.isFinite(value) ? `${value.toFixed(0)}%` : 'n/a';
}

function formatDecimal(value, digits = 2, suffix = ''){
  return Number.isFinite(value) ? `${Number(value.toFixed(digits))}${suffix}` : 'n/a';
}

function median(numbers){
  const values = numbers.filter(Number.isFinite).sort((a, b) => a - b);
  if(!values.length) return null;
  const mid = Math.floor(values.length / 2);
  return values.length % 2 ? values[mid] : ((values[mid - 1] + values[mid]) / 2);
}

function compressLifecycleStages(record){
  const item = normalizeTickerRecord(record);
  const stages = [
    ...(item.lifecycle.history || []).map(entry => String(entry.stage || '').trim()).filter(Boolean),
    String(item.lifecycle.stage || '').trim()
  ];
  const compressed = [];
  stages.forEach(stage => {
    if(!compressed.length || compressed[compressed.length - 1] !== stage) compressed.push(stage);
  });
  return compressed;
}

function buildLifecyclePathLabel(record){
  const stages = compressLifecycleStages(record);
  return stages.length ? stages.join(' -> ') : 'untracked';
}

function computePatternAnalytics(){
  const diaryItems = diaryTradeRecords();
  const allRecords = allTickerRecords();
  const closedTrades = diaryItems.filter(({trade}) => isClosedOutcome(trade.outcome));
  const executedClosedTrades = closedTrades.filter(({trade}) => trade.outcome !== 'Cancelled');
  const winTrades = executedClosedTrades.filter(({trade}) => trade.outcome === 'Win');
  const lossTrades = executedClosedTrades.filter(({trade}) => trade.outcome === 'Loss');
  const scratchTrades = executedClosedTrades.filter(({trade}) => trade.outcome === 'Scratch');
  const cancelledTrades = closedTrades.filter(({trade}) => trade.outcome === 'Cancelled');
  const validRClosedTrades = executedClosedTrades.filter(({trade}) => Number.isFinite(numericOrNull(trade.resultR)));
  const validNetClosedTrades = closedTrades.filter(({trade}) => Number.isFinite(numericOrNull(trade.netPnL)));
  const winRate = executedClosedTrades.length ? (winTrades.length / executedClosedTrades.length) * 100 : null;
  const avgR = validRClosedTrades.length ? validRClosedTrades.reduce((sum, item) => sum + Number(item.trade.resultR), 0) / validRClosedTrades.length : null;
  const medianR = validRClosedTrades.length ? median(validRClosedTrades.map(item => Number(item.trade.resultR))) : null;
  const totalNetPnL = validNetClosedTrades.length ? validNetClosedTrades.reduce((sum, item) => sum + Number(item.trade.netPnL), 0) : null;

  const aggregateTaggedTrades = (field, mapper) => {
    const buckets = new Map();
    diaryItems.forEach(({record, trade}) => {
      const tags = mapper(record, trade).filter(Boolean);
      tags.forEach(tag => {
        if(!buckets.has(tag)) buckets.set(tag, []);
        buckets.get(tag).push({record, trade});
      });
    });
    return [...buckets.entries()].map(([tag, items]) => {
      const executedClosed = items.filter(item => isClosedOutcome(item.trade.outcome) && item.trade.outcome !== 'Cancelled');
      const validR = executedClosed.filter(item => Number.isFinite(numericOrNull(item.trade.resultR)));
      const wins = executedClosed.filter(item => item.trade.outcome === 'Win').length;
      const losses = executedClosed.filter(item => item.trade.outcome === 'Loss').length;
      return {
        key:tag,
        count:items.length,
        winRate:executedClosed.length ? (wins / executedClosed.length) * 100 : null,
        averageR:validR.length ? validR.reduce((sum, item) => sum + Number(item.trade.resultR), 0) / validR.length : null,
        loserPct:executedClosed.length ? (losses / executedClosed.length) * 100 : null,
        sample:executedClosed.length,
        rSample:validR.length
      };
    }).sort((a, b) => b.count - a.count || (b.averageR || -999) - (a.averageR || -999) || a.key.localeCompare(b.key));
  };

  const setupTagStats = aggregateTaggedTrades('setupTags', (record, trade) => parseTagList(trade.setupTags).length ? parseTagList(trade.setupTags) : parseTagList([trade.scanType, record.scan.scanType]));
  const mistakeTagStats = aggregateTaggedTrades('mistakeTags', (_record, trade) => parseTagList(trade.mistakeTags));

  const marketBuckets = new Map();
  diaryItems.forEach(({record, trade}) => {
    const regime = String(trade.marketStatus || record.meta.marketStatus || state.marketStatus || '').trim();
    if(!regime) return;
    if(!marketBuckets.has(regime)) marketBuckets.set(regime, []);
    marketBuckets.get(regime).push({record, trade});
  });
  const marketStats = [...marketBuckets.entries()].map(([regime, items]) => {
    const executedClosed = items.filter(item => isClosedOutcome(item.trade.outcome) && item.trade.outcome !== 'Cancelled');
    const validR = executedClosed.filter(item => Number.isFinite(numericOrNull(item.trade.resultR)));
    const wins = executedClosed.filter(item => item.trade.outcome === 'Win').length;
    return {
      key:regime,
      count:items.length,
      winRate:executedClosed.length ? (wins / executedClosed.length) * 100 : null,
      averageR:validR.length ? validR.reduce((sum, item) => sum + Number(item.trade.resultR), 0) / validR.length : null,
      sample:executedClosed.length
    };
  }).sort((a, b) => b.count - a.count || (b.averageR || -999) - (a.averageR || -999));

  const lifecycleBuckets = new Map();
  allRecords.forEach(record => {
    const path = buildLifecyclePathLabel(record);
    if(!path || path === 'untracked') return;
    lifecycleBuckets.set(path, (lifecycleBuckets.get(path) || 0) + 1);
  });
  const lifecycleStats = [...lifecycleBuckets.entries()]
    .map(([path, count]) => ({path, count}))
    .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path))
    .slice(0, 8);

  const insights = [];
  const bestSetup = setupTagStats.filter(item => item.rSample >= 2).sort((a, b) => (b.averageR || -999) - (a.averageR || -999))[0];
  if(bestSetup) insights.push(`Best average R so far: ${bestSetup.key} (${formatDecimal(bestSetup.averageR, 2, 'R')} across ${bestSetup.rSample} closed trades).`);
  const commonMistake = mistakeTagStats.filter(item => item.count >= 2).sort((a, b) => b.count - a.count || (b.loserPct || -999) - (a.loserPct || -999))[0];
  if(commonMistake) insights.push(`Most common losing mistake: ${commonMistake.key} (${commonMistake.count} trades, ${formatPercent(commonMistake.loserPct)} losers).`);
  const bestRegime = marketStats.filter(item => item.sample >= 2).sort((a, b) => (b.averageR || -999) - (a.averageR || -999))[0];
  const weakRegime = marketStats.filter(item => item.sample >= 2).sort((a, b) => (a.averageR || 999) - (b.averageR || 999))[0];
  if(bestRegime && weakRegime && bestRegime.key !== weakRegime.key) insights.push(`${bestRegime.key} is outperforming ${weakRegime.key} on closed-trade average R so far.`);
  const stalledPath = lifecycleStats.find(item => /reviewed -> expired|watchlist -> expired|shortlisted -> expired/.test(item.path));
  if(stalledPath && stalledPath.count >= 2) insights.push(`Most frequent stalled path: ${stalledPath.path} (${stalledPath.count}).`);

  return {
    overview:{
      totalClosed:closedTrades.length,
      wins:winTrades.length,
      losses:lossTrades.length,
      scratches:scratchTrades.length,
      cancelled:cancelledTrades.length,
      winRate,
      averageR:avgR,
      medianR,
      totalNetPnL
    },
    setupTags:setupTagStats,
    mistakeTags:mistakeTagStats,
    marketRegime:marketStats,
    lifecycle:lifecycleStats,
    insights
  };
}

function renderAnalyticRows(items, renderer){
  if(!items.length) return '<div class="summary">No data yet.</div>';
  return `<div class="analyticrows">${items.map(renderer).join('')}</div>`;
}

// ============================================================================
// Alerts / attention
// ============================================================================
function isActionableAlertStage(stage){
  return ['planned','entered'].includes(String(stage || ''));
}

function alertIdForRecord(record, type, createdAt, extra = ''){
  return [normalizeTicker(record.ticker), type, String(createdAt || ''), String(extra || '')].join('|');
}

function deriveWorkflowAlerts(){
  const alerts = [];
  const hostileMarket = /below 50 ma/i.test(String(state.marketStatus || ''));
  allTickerRecords().forEach(record => {
    const item = normalizeTickerRecord(record);
    const stage = String(item.lifecycle.stage || '');
    const status = String(item.lifecycle.status || '');
    const changedAt = String(item.lifecycle.stageUpdatedAt || item.meta.updatedAt || '');
    const expiresAt = String(item.lifecycle.expiresAt || '');
    const remainingTradingDays = expiresAt ? countTradingDaysBetween(todayIsoDate(), expiresAt) : null;
    const hasValidPlan = !!item.plan.hasValidPlan;
    const needsReview = ['watchlist','shortlisted','reviewed'].includes(stage) && !hasValidPlan && status !== 'closed' && stage !== 'expired';

    if(stage === 'planned' && hasValidPlan){
      alerts.push({
        id:alertIdForRecord(item, 'became_ready', changedAt, stage),
        ticker:item.ticker,
        alertType:'became_ready',
        severity:'action',
        createdAt:changedAt,
        message:'Valid plan saved. This setup is ready for focused review.',
        stage,
        status
      });
    }

    if(needsReview){
      alerts.push({
        id:alertIdForRecord(item, 'needs_review', changedAt, stage),
        ticker:item.ticker,
        alertType:'needs_review',
        severity:stage === 'reviewed' ? 'warning' : 'info',
        createdAt:changedAt,
        message:stage === 'reviewed'
          ? 'Reviewed setup still needs a valid plan or decision.'
          : 'This name is still active in the workflow and needs review.',
        stage,
        status
      });
    }

    if(stage === 'planned' && hasValidPlan && Number.isFinite(remainingTradingDays) && remainingTradingDays <= 1 && remainingTradingDays >= 0){
      alerts.push({
        id:alertIdForRecord(item, 'plan_near_expiry', expiresAt, remainingTradingDays),
        ticker:item.ticker,
        alertType:'plan_near_expiry',
        severity:'warning',
        createdAt:expiresAt || changedAt,
        message:remainingTradingDays === 0 ? 'Planned setup expires today.' : 'Planned setup expires within 1 trading day.',
        stage,
        status
      });
    }

    const lifecycleStages = compressLifecycleStages(item);
    if(item.watchlist.inWatchlist && ['shortlisted','reviewed','planned'].includes(stage) && lifecycleStages.includes('watchlist')){
      alerts.push({
        id:alertIdForRecord(item, 'watchlist_progressed', changedAt, stage),
        ticker:item.ticker,
        alertType:'watchlist_progressed',
        severity:stage === 'planned' ? 'action' : 'info',
        createdAt:changedAt,
        message:`Watchlist setup progressed to ${stage}.`,
        stage,
        status
      });
    }

    if(stage === 'expired'){
      alerts.push({
        id:alertIdForRecord(item, 'expired', changedAt, stage),
        ticker:item.ticker,
        alertType:'expired',
        severity:'warning',
        createdAt:changedAt,
        message:'This setup expired and left the active workflow.',
        stage,
        status
      });
    }

    if(stage === 'entered'){
      alerts.push({
        id:alertIdForRecord(item, 'entered', changedAt, stage),
        ticker:item.ticker,
        alertType:'entered',
        severity:'action',
        createdAt:changedAt,
        message:'Trade has actual execution details recorded.',
        stage,
        status
      });
    }

    if(['exited','cancelled'].includes(stage) || (status === 'closed' && !isActionableAlertStage(stage))){
      alerts.push({
        id:alertIdForRecord(item, 'closed', changedAt, stage),
        ticker:item.ticker,
        alertType:stage === 'cancelled' ? 'closed' : 'closed',
        severity:'info',
        createdAt:changedAt,
        message:stage === 'cancelled' ? 'Planned trade was cancelled.' : 'Trade is now closed.',
        stage,
        status
      });
    }

    if(hostileMarket && ['planned','reviewed'].includes(stage) && (item.scan.verdict === 'Entry' || item.scan.verdict === 'Near Entry')){
      alerts.push({
        id:alertIdForRecord(item, 'regime_warning', String(state.marketStatus), `${stage}-${item.scan.verdict}`),
        ticker:item.ticker,
        alertType:'regime_warning',
        severity:'warning',
        createdAt:changedAt || new Date().toISOString(),
        message:'Market regime is hostile. Treat action-stage setups with extra caution.',
        stage,
        status
      });
    }
  });
  const dismissed = new Set(Array.isArray(state.dismissedAlertIds) ? state.dismissedAlertIds : []);
  return alerts
    .filter(alert => !dismissed.has(alert.id))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')) || a.ticker.localeCompare(b.ticker));
}

function isAlertNew(alert){
  const lastSeen = String(state.lastAlertsSeenAt || '');
  if(!lastSeen) return false;
  return String(alert.createdAt || '') > lastSeen;
}

function markAlertsSeen(){
  state.lastAlertsSeenAt = new Date().toISOString();
  commitTickerState();
  renderWorkflowAlerts();
}

function dismissAlert(alertId){
  if(!alertId) return;
  const set = new Set(Array.isArray(state.dismissedAlertIds) ? state.dismissedAlertIds : []);
  set.add(alertId);
  state.dismissedAlertIds = [...set].slice(-200);
  commitTickerState();
  renderWorkflowAlerts();
}

function alertGroups(alerts){
  return {
    actionNow:alerts.filter(alert => ['became_ready','entered'].includes(alert.alertType)),
    needsReview:alerts.filter(alert => ['needs_review','watchlist_progressed','regime_warning'].includes(alert.alertType)),
    expiringSoon:alerts.filter(alert => ['plan_near_expiry','expired'].includes(alert.alertType)),
    recent:alerts.filter(isAlertNew)
  };
}

function renderAlertRows(items, allowDismiss = true){
  if(!items.length) return '<div class="summary">Nothing here right now.</div>';
  return `<div class="alertgroup">${items.map(alert => `<div class="alertcard"><div class="alerthead"><div><div class="alertmeta"><span class="badge severity-${escapeHtml(alert.severity)}">${escapeHtml(alert.alertType.replaceAll('_', ' '))}</span><strong>${escapeHtml(alert.ticker)}</strong><span class="badge ${escapeHtml(alert.stateClass || 'watch')}">${escapeHtml(alert.stateLabel || '🧐 Monitor')}</span>${isAlertNew(alert) ? '<span class="pill">New</span>' : ''}</div><div class="tiny">${escapeHtml(alert.message)}</div><div class="tiny">Stage ${escapeHtml(alert.stage || 'untracked')} | ${escapeHtml(alert.status || 'inactive')}${alert.createdAt ? ` | ${escapeHtml(formatLocalTimestamp(alert.createdAt) || alert.createdAt)}` : ''}</div></div><div class="actions" style="margin-top:0"><button class="secondary compactbutton" type="button" data-act="alert-review" data-ticker="${escapeHtml(alert.ticker)}">Open Review</button>${allowDismiss && alert.severity !== 'action' ? `<button class="ghost compactbutton" type="button" data-act="alert-dismiss" data-id="${escapeHtml(alert.id)}">Dismiss</button>` : ''}</div></div></div>`).join('')}</div>`;
}

function legacyRenderWorkflowAlertsPrePriority(){
  const box = $('alertsList');
  const badge = $('newAlertsCount');
  if(!box) return;
  const alerts = deriveWorkflowAlerts();
  const groups = alertGroups(alerts);
  const newCount = alerts.filter(isAlertNew).length;
  if(badge) badge.textContent = `${newCount} new`;
  box.innerHTML = `<div class="alertsection"><strong>Action now</strong>${renderAlertRows(groups.actionNow, false)}</div><div class="alertsection"><strong>Needs review</strong>${renderAlertRows(groups.needsReview)}</div><div class="alertsection"><strong>Expiring soon</strong>${renderAlertRows(groups.expiringSoon)}</div><div class="alertsection"><strong>Recently changed</strong>${renderAlertRows(groups.recent)}</div>`;
  box.querySelectorAll('[data-act="alert-review"]').forEach(button => {
    button.onclick = () => openRankedResultInReview(button.getAttribute('data-ticker') || '');
  });
  box.querySelectorAll('[data-act="alert-dismiss"]').forEach(button => {
    button.onclick = () => dismissAlert(button.getAttribute('data-id') || '');
  });
}

function legacyRenderPatternAnalyticsPreLowSample(){
  const box = $('patternAnalytics');
  if(!box) return;
  const analytics = computePatternAnalytics();
  const overview = analytics.overview;
  box.innerHTML = `<div class="analyticsgrid"><div class="analyticcard"><div><strong>Overview</strong></div><div class="analyticstats"><div class="analyticstat"><div class="tiny">Closed Trades</div><div class="big">${escapeHtml(String(overview.totalClosed))}</div></div><div class="analyticstat"><div class="tiny">Win Rate</div><div class="big">${escapeHtml(formatPercent(overview.winRate))}</div></div><div class="analyticstat"><div class="tiny">Average R</div><div class="big">${escapeHtml(formatDecimal(overview.averageR, 2, 'R'))}</div></div><div class="analyticstat"><div class="tiny">Median R</div><div class="big">${escapeHtml(formatDecimal(overview.medianR, 2, 'R'))}</div></div><div class="analyticstat"><div class="tiny">Wins / Losses</div><div class="big">${escapeHtml(`${overview.wins}/${overview.losses}`)}</div></div><div class="analyticstat"><div class="tiny">Net PnL</div><div class="big">${escapeHtml(Number.isFinite(overview.totalNetPnL) ? formatGbp(overview.totalNetPnL) : 'n/a')}</div></div></div><div class="tiny">Scratches ${escapeHtml(String(overview.scratches))} | Cancelled ${escapeHtml(String(overview.cancelled))}. Win rate excludes cancelled trades and open trades.</div></div><div class="analyticcard"><div><strong>Insight Callouts</strong></div>${analytics.insights.length ? `<div class="insightlist">${analytics.insights.map(item => `<div class="insightitem">${escapeHtml(item)}</div>`).join('')}</div>` : '<div class="summary">Need more closed-trade samples before the app can surface meaningful pattern callouts.</div>'}</div><div class="analyticcard"><div><strong>Setup Tags</strong></div>${renderAnalyticRows(analytics.setupTags.slice(0, 6), item => `<div class="analyticrow"><div class="analyticrowhead"><strong>${escapeHtml(item.key)}</strong><span class="tiny">n=${escapeHtml(String(item.count))}</span></div><div class="tiny">Win rate ${escapeHtml(formatPercent(item.winRate))} | Avg R ${escapeHtml(formatDecimal(item.averageR, 2, 'R'))} | Closed sample ${escapeHtml(String(item.sample))}</div></div>`)}</div><div class="analyticcard"><div><strong>Mistakes</strong></div>${renderAnalyticRows(analytics.mistakeTags.slice(0, 6), item => `<div class="analyticrow"><div class="analyticrowhead"><strong>${escapeHtml(item.key)}</strong><span class="tiny">n=${escapeHtml(String(item.count))}</span></div><div class="tiny">Avg R ${escapeHtml(formatDecimal(item.averageR, 2, 'R'))} | Loser rate ${escapeHtml(formatPercent(item.loserPct))} | Closed sample ${escapeHtml(String(item.sample))}</div></div>`)}</div><div class="analyticcard"><div><strong>Market Regime</strong></div>${renderAnalyticRows(analytics.marketRegime.slice(0, 6), item => `<div class="analyticrow"><div class="analyticrowhead"><strong>${escapeHtml(item.key)}</strong><span class="tiny">n=${escapeHtml(String(item.count))}</span></div><div class="tiny">Win rate ${escapeHtml(formatPercent(item.winRate))} | Avg R ${escapeHtml(formatDecimal(item.averageR, 2, 'R'))} | Closed sample ${escapeHtml(String(item.sample))}</div></div>`)}</div><div class="analyticcard"><div><strong>Process / Lifecycle</strong></div>${renderAnalyticRows(analytics.lifecycle, item => `<div class="analyticrow"><div class="analyticrowhead"><strong>${escapeHtml(item.path)}</strong><span class="tiny">count ${escapeHtml(String(item.count))}</span></div></div>`)}</div></div>`;
}

function scannerViewBridgeDeps(){
  return {
    numericOrNull,
    normalizeTicker,
    normalizeTickerRecord,
    targetReviewQueueLabel,
    analysisDerivedStatesFromRecord,
    currentSetupType,
    resolveEmojiPresentation,
    evaluatePlanRealism,
    fmtPrice,
    normalizeScanType,
    globalVerdictLabel,
    getBucket,
    getBadge,
    resolveGlobalVerdict,
    resolveVisualState,
    normalizeGlobalVerdictKey,
    normalizeVerdict,
    primaryVerdictBadge,
    setupUiLabel,
    setupUiClass,
    shouldShowActionableRR,
    structureLabelForRecord,
    resultSortScoreFromRecord,
    projectTickerForCard,
    resolveScannerStateWithTrace,
    escapeHtml,
    primaryShortlistStatusChip,
    normalizeAnalysisVerdict,
    getActions
  };
}

function scannerDebugBridgeDeps(){
  return {
    normalizeTickerRecord,
    projectTickerForCard,
    analysisDerivedStatesFromRecord,
    rrCategoryForView,
    finalStructureQualityForView,
    evaluatePlanRealism,
    numericOrNull,
    resolveEmojiPresentation,
    normalizeScanType,
    currentSetupType,
    fmtPrice,
    resolveGlobalVerdict,
    resolveVisualState,
    globalVerdictLabel,
    getBucket,
    normalizeVerdict,
    normalizeGlobalVerdictKey,
    normalizeAnalysisVerdict,
    getActions,
    escapeHtml,
    primaryShortlistStatusChip,
    emojiModifierMarkup,
    scannerCardClickTraceForTicker,
    scannerCardClickTraceHistoryForTicker,
    reviewAnalysisUiStateForRecord,
    uiState,
    getSwipeFeedback
  };
}

function scannerCardShellBridgeDeps(){
  return {
    currentScanCardMenuState,
    getScannerSubmenuContent,
    renderScannerDecisionTraceContent,
    renderScannerVisualDebugContent,
    renderScannerDetailsContent,
    resolveGlobalVerdict,
    primaryShortlistStatusChip,
    globalVerdictLabel,
    normalizeVerdict,
    normalizeAnalysisVerdict,
    resolveVisualState,
    resolveGlobalVisualState,
    scanCardSummaryForView,
    scanCardPrimaryActionLabel,
    renderScanCardSecondaryUi,
    analysisDerivedStatesFromRecord,
    shortlistStructureBadgeForView,
    getActions,
    escapeHtml,
    scoreClass
  };
}

function scannerInteractionStateBridgeDeps(){
  return {
    normalizeTicker,
    uiState,
    activeReviewTicker,
    scannerCardClickTraceHistoryForTicker: ticker => scannerCardClickTraceHistoryForTickerImpl(ticker, {
      normalizeTicker,
      uiState
    })
  };
}

function scannerResultsSupportBridgeDeps(){
  return {
    rankedVisibleSectionForView,
    state,
    escapeHtml,
    documentRef:document
  };
}

function reviewPresentationBridgeDeps(){
  return {
    rrDisplayClass,
    escapeHtml,
    normalizeGlobalVerdictKey,
    buildValidityConditionSummary,
    blockedTradeStatusFromPrimaryBlocker
  };
}

function currentRrThreshold(){
  return currentRrThresholdImpl();
}

function getRankedDisplayBucket(record){
  return getRankedDisplayBucketImpl(record, scannerViewBridgeDeps());
}

function getFinalBucketFromView(view){
  return getFinalBucketFromViewImpl(view, scannerViewBridgeDeps());
}

function rrCategoryForView(view){
  return rrCategoryForViewImpl(view, scannerViewBridgeDeps());
}

function finalStructureQualityForView(view){
  return finalStructureQualityForViewImpl(view, scannerViewBridgeDeps());
}

function resolveScannerStateWithTrace(record, options = {}){
  return resolveScannerStateWithTraceImpl(record, options, scannerDebugBridgeDeps());
}

function resolveScannerState(record, options = {}){
  return resolveScannerStateImpl(record, options, scannerDebugBridgeDeps());
}

function getFinalClassification(view){
  return getFinalClassificationImpl(view, scannerViewBridgeDeps());
}

function buildFinalSetupView(record, options = {}){
  return buildFinalSetupViewImpl(record, options, scannerViewBridgeDeps());
}

function classifyRankedRecord(record){
  return classifyRankedRecordImpl(record, scannerViewBridgeDeps());
}

function classifyRankedView(view){
  return classifyRankedViewImpl(view, scannerViewBridgeDeps());
}

function buildRankedBuckets(records){
  return buildRankedBucketsImpl(records, scannerViewBridgeDeps());
}

function buildRankedBucketsFromViews(views){
  return buildRankedBucketsFromViewsImpl(views, scannerViewBridgeDeps());
}

function rankedDecisionBucketForView(view){
  return rankedDecisionBucketForViewImpl(view, scannerViewBridgeDeps());
}

function rankedVisibleSectionForView(view){
  return rankedVisibleSectionForViewImpl(view, scannerViewBridgeDeps());
}

function resultReasonForRecord(record){
  return resultReasonForRecordImpl(record, scannerViewBridgeDeps());
}

function resultReasonForView(view){
  return resultReasonForViewImpl(view, scannerViewBridgeDeps());
}

function resultSupportLineForRecord(record){
  return resultSupportLineForRecordImpl(record, scannerViewBridgeDeps());
}

function resultSupportLineForView(view){
  return resultSupportLineForViewImpl(view, scannerViewBridgeDeps());
}

function isFilteredResultRecord(record){
  return isFilteredResultRecordImpl(record, scannerViewBridgeDeps());
}

function shortlistStructureBadgeForView(view){
  return shortlistStructureBadgeForViewImpl(view, scannerViewBridgeDeps());
}

function primaryShortlistStatusChip(view){
  return primaryShortlistStatusChipImpl(view, {
    resolveVisualState,
    getBadge,
    normalizeGlobalVerdictKey,
    normalizeVerdict
  });
}

function resolveGlobalVisualState(record, context = 'scanner', options = {}){
  return resolveGlobalVisualStateImpl(record, context, options, {
    resolveVisualState,
    resolveGlobalVerdict,
    resolveFinalStateContract,
    analysisDerivedStatesFromRecord,
    effectivePlanForRecord,
    deriveCurrentPlanState,
    setupScoreForRecord,
    getBadge,
    getBucket,
    normalizeGlobalVerdictKey,
    normalizeVerdict
  });
}

function resolveVisualState(record, context = 'scanner', options = {}){
  return resolveVisualStateImpl(record, context, options, {
    resolveGlobalVerdict,
    resolveFinalStateContract,
    analysisDerivedStatesFromRecord,
    effectivePlanForRecord,
    deriveCurrentPlanState,
    setupScoreForRecord,
    getBadge,
    getBucket,
    normalizeGlobalVerdictKey,
    normalizeVerdict
  });
}

function rrDisplayClass(rrValue){
  const rr = numericOrNull(rrValue);
  if(!Number.isFinite(rr)) return '';
  if(rr < 1) return 'rr-low';
  if(rr <= 2) return 'rr-mid';
  return 'rr-high';
}

function readinessLabelForView(view){
  return readinessLabelForViewImpl(view, scannerViewBridgeDeps());
}

function reviewVerdictOverrideFromView(view){
  return normalizeAnalysisVerdict(view && (view.displayStage || view.finalVerdict || (view.item && displayStageForRecord(view.item))) || '');
}

function reviewVerdictOverrideFromLabel(label){
  const text = String(label || '');
  if(/Near Entry/i.test(text)) return 'Near Entry';
  if(/Entry/i.test(text)) return 'Entry';
  if(/Broken/i.test(text) || /Avoid/i.test(text) || /Dead/i.test(text)) return 'Avoid';
  if(/Watch/i.test(text) || /Developing/i.test(text) || /Weak/i.test(text) || /Monitor/i.test(text)) return 'Watch';
  return '';
}

function shortlistStatusPills(view, maxPills = 3){
  if(view.bucket === 'filtered' || view.finalClassification === 'filtered'){
    const pills = [];
    if(view.warningState && view.warningState.showWarning) pills.push('Weak market');
    if(view.item && view.item.setup && view.item.setup.marketCaution && !pills.includes('Weak market')) pills.push('Weak market');
    return pills.slice(0, maxPills);
  }
  return scanCardStatusPills(view, maxPills);
}

function renderCompactResultCard(record){
  const view = projectTickerForCard(record);
  return renderCompactResultCardFromView(view);
}

/* LEGACY COLOUR LOGIC DISABLED
   Replaced by resolveGlobalVisualState(...)
   Left in place temporarily for later review

function scanCardToneForView(view){
  const verdict = view && view.displayStage ? String(view.displayStage) : '';
  const setupScore = Number.isFinite(Number(view && view.setupScore)) ? Number(view.setupScore) : null;
  const nextAction = view && view.nextAction
    ? String(view.nextAction)
    : (view && view.item ? String(actionPresentationForRecord(view.item).label || '') : '');

  if(verdict === 'Avoid') return 'danger';
  if(verdict === 'Entry') return 'success';
  if(verdict === 'Near Entry') return 'near-entry';
  if(verdict === 'Watch'){
    if(setupScore !== null && setupScore <= 4) return 'watch-caution';
    if(/caution|cautious|low quality|lower quality|needs stronger confirmation/i.test(nextAction || '')) return 'watch-caution';
    return 'watch';
  }
  return 'watch';
}

function scanCardIntensityForView(view){
  const score = Number.isFinite(Number(view && view.setupScore)) ? Number(view.setupScore) : 0;
  if(score >= 8) return 'high';
  if(score >= 7) return 'med-high';
  if(score >= 6) return 'medium';
  if(score >= 5) return 'med-low';
  return 'low';
}
*/

function renderScannerDecisionTraceContent(view){
  return renderScannerDecisionTraceContentImpl(view, scannerDebugBridgeDeps());
}

function currentScanCardMenuState(ticker){
  const symbol = normalizeTicker(ticker);
  const menu = uiState.scanCardMenu || {ticker:'', menuOpen:false, activeSubmenu:null};
  if(!symbol || menu.ticker !== symbol) return {ticker:'', menuOpen:false, activeSubmenu:null};
  return {...menu};
}

function currentScanCardSecondaryUi(ticker){
  const menuState = currentScanCardMenuState(ticker);
  if(!menuState.menuOpen) return null;
  return menuState.activeSubmenu || 'menu';
}

function setScanCardSecondaryUi(ticker, mode){
  if(mode === 'menu'){
    toggleScanCardMenu(ticker);
  }else if(['details','trace','visual-debug'].includes(mode)){
    setScanCardActiveSubmenu(ticker, mode);
  }
}

function clearScanCardSecondaryUi(){
  closeScanCardMenu();
}

function toggleScanCardMenu(ticker){
  const symbol = normalizeTicker(ticker);
  if(!symbol) return;
  const state = currentScanCardMenuState(symbol);
  if(state.menuOpen){
    if(state.activeSubmenu){
      closeScanCardSubmenu();
    }else{
      closeScanCardMenu();
    }
    return;
  }
  openScanCardMenu(symbol);
}

function openScanCardMenu(ticker){
  const symbol = normalizeTicker(ticker);
  if(!symbol) return;
  uiState.scanCardMenu = {ticker:symbol, menuOpen:true, activeSubmenu:null};
}

function setScanCardActiveSubmenu(ticker, submenu){
  const symbol = normalizeTicker(ticker);
  if(!symbol) return;
  uiState.scanCardMenu = {ticker:symbol, menuOpen:true, activeSubmenu:submenu};
}

function closeScanCardSubmenu(){
  const menu = uiState.scanCardMenu || {ticker:'', menuOpen:false, activeSubmenu:null};
  if(!menu.menuOpen) return;
  uiState.scanCardMenu = {ticker:menu.ticker, menuOpen:true, activeSubmenu:null};
}

function closeScanCardMenu(){
  uiState.scanCardMenu = {ticker:'', menuOpen:false, activeSubmenu:null};
}

function suppressNextScannerActivation(ticker){
  return suppressNextScannerActivationImpl(ticker, scannerInteractionStateBridgeDeps());
}

function allowScannerActivation(ticker){
  return allowScannerActivationImpl(ticker, scannerInteractionStateBridgeDeps());
}

function renderScannerDetailsContent(view){
  return renderScannerDetailsContentImpl(view, scannerDebugBridgeDeps());
}

function scoreToneLabelFromScore(score){
  const safeScore = numericOrNull(score);
  if(!Number.isFinite(safeScore)) return 'red';
  if(safeScore >= 8) return 'green';
  if(safeScore >= 6) return 'blue';
  if(safeScore >= 4) return 'indigo';
  if(safeScore >= 2) return 'orange';
  return 'red';
}

function setScannerCardClickTrace(ticker, stage, detail = ''){
  return setScannerCardClickTraceImpl(ticker, stage, detail, scannerInteractionStateBridgeDeps());
}

function scannerCardClickTraceForTicker(ticker){
  return scannerCardClickTraceForTickerImpl(ticker, scannerInteractionStateBridgeDeps());
}

function scannerCardClickTraceHistoryForTicker(ticker){
  return scannerCardClickTraceHistoryForTickerImpl(ticker, scannerInteractionStateBridgeDeps());
}

function renderDebugKeyValueGrid(rows){
  return renderDebugKeyValueGridImpl(rows, scannerDebugBridgeDeps());
}

function renderDebugSectionMarkup(title, rows){
  return renderDebugSectionMarkupImpl(title, rows, scannerDebugBridgeDeps());
}

function renderAdvancedDebugMarkup(rows, title = 'Advanced Debug (Internal)'){
  return renderAdvancedDebugMarkupImpl(rows, title, scannerDebugBridgeDeps());
}

function renderScannerVisualDebugContent(view){
  return renderScannerVisualDebugContentImpl(view, scannerDebugBridgeDeps());
}

function renderScanCardSecondaryUi(view){
  return renderScanCardSecondaryUiImpl(view, scannerCardShellBridgeDeps());
}

function getScannerSubmenuContent(key, view){
  return getScannerSubmenuContentImpl(key, view, scannerCardShellBridgeDeps());
}

function rrReliabilityClass(rrReliability){
  if(rrReliability === 'high') return 'ready';
  if(rrReliability === 'conditional') return 'near';
  return 'avoid';
}

function scannerScoreGradientClass(score){
  const safeScore = numericOrNull(score);
  if(!Number.isFinite(safeScore)) return 'score-broken';
  if(safeScore >= 8) return 'score-strong';
  if(safeScore >= 6) return 'score-good';
  if(safeScore >= 4) return 'score-developing';
  if(safeScore >= 2) return 'score-weak';
  return 'score-broken';
}

/* LEGACY COLOUR LOGIC DISABLED
   Replaced by resolveGlobalVisualState(...)
   Left in place temporarily for later review

function getCardVisualStyle(setupScore, structureState){
  const safeScore = numericOrNull(setupScore);
  const safeStructureState = String(structureState || '').trim().toLowerCase();

  if(safeStructureState === 'broken' || (Number.isFinite(safeScore) && safeScore <= 1)){
    return {
      background:'linear-gradient(135deg, rgba(127,29,29,0.6), rgba(0,0,0,0.9))',
      border:'1px solid rgba(239,68,68,0.8)'
    };
  }
  if(Number.isFinite(safeScore) && safeScore <= 3){
    return {
      background:'linear-gradient(135deg, rgba(120,53,15,0.6), rgba(0,0,0,0.9))',
      border:'1px solid rgba(245,158,11,0.8)'
    };
  }
  if(Number.isFinite(safeScore) && safeScore <= 5){
    return {
      background:'linear-gradient(135deg, rgba(67,56,202,0.6), rgba(0,0,0,0.9))',
      border:'1px solid rgba(99,102,241,0.8)'
    };
  }
  if(Number.isFinite(safeScore) && safeScore <= 7){
    return {
      background:'linear-gradient(135deg, rgba(37,99,235,0.6), rgba(0,0,0,0.9))',
      border:'1px solid rgba(59,130,246,0.8)'
    };
  }
  return {
    background:'linear-gradient(135deg, rgba(22,163,74,0.6), rgba(0,0,0,0.9))',
    border:'1px solid rgba(34,197,94,0.8)'
  };
}

function cardVisualStyleAttr(setupScore, structureState){
  const visual = getCardVisualStyle(setupScore, structureState);
  return `background:${visual.background};border:${visual.border};backdrop-filter:blur(6px);`;
}
*/

function renderCompactResultCardFromView(view){
  return renderCompactResultCardFromViewImpl(view, scannerCardShellBridgeDeps());
}

function scanCardSummaryForView(view){
  return scanCardSummaryForViewImpl(view, scannerCardShellBridgeDeps());
}

function scanCardPrimaryActionLabel(view){
  return scanCardPrimaryActionLabelImpl(view, scannerCardShellBridgeDeps());
}

function scanDecisionLineForView(view){
  const item = view && view.item ? view.item : view;
  return getActions(resolveGlobalVerdict(item).final_verdict).detail;
}

function plannerToneClass(rrValue){
  return plannerToneClassImpl(rrValue, reviewPresentationBridgeDeps());
}

function compactReasonLineForView(view, maxParts = 3){
  const item = view.item;
  const derived = view.setupStates || analysisDerivedStatesFromRecord(item);
  const estimatedRrValue = item.plan && item.plan.hasValidPlan ? numericOrNull(item.plan.plannedRR) : numericOrNull(item.scan.estimatedRR);
  const warningState = view.warningState || item.setup.warning || warningStateFromInputs(item, null, derived);
  const parts = [];
  const pushPart = value => {
    if(value && !parts.includes(value) && parts.length < maxParts) parts.push(value);
  };
  const structureLabel = `${shortlistStructureBadgeForView(view).label} structure`;
  if(structureLabel) pushPart(structureLabel);
  else if(derived.trendState === 'strong') pushPart('Strong trend');
  else if(derived.trendState === 'acceptable') pushPart('Acceptable trend');
  if(derived.pullbackState && derived.pullbackState !== 'none') pushPart(pullbackStateLabel(derived.pullbackState));
  if(derived.bounceState === 'confirmed') pushPart('Bounce confirmed');
  else if(derived.bounceState === 'attempt') pushPart('Bounce tentative');
  else if(derived.bounceState === 'none') pushPart('No bounce');
  if(!item.plan.hasValidPlan && Number.isFinite(estimatedRrValue) && estimatedRrValue < currentRrThreshold()) pushPart('Low est reward');
  if(derived.stabilisationState === 'early') pushPart('Early stabilisation');
  if(derived.volumeState === 'weak') pushPart('Weak volume');
  if(item.setup.marketCaution) pushPart('Weak market');
  warningState.reasons.forEach(pushPart);
  if(!parts.length) pushPart(resultReasonForView(view));
  return parts.slice(0, maxParts).join(' | ');
}

function hasAiStageForRecord(record){
  const rawRecord = record && typeof record === 'object' ? record : {};
  const review = rawRecord.review && typeof rawRecord.review === 'object' ? rawRecord.review : {};
  const analysisState = review.analysisState && typeof review.analysisState === 'object' ? review.analysisState : {};
  const normalized = (analysisState.normalized && typeof analysisState.normalized === 'object')
    ? analysisState.normalized
    : (review.normalizedAnalysis && typeof review.normalizedAnalysis === 'object' ? review.normalizedAnalysis : null);
  const finalVerdict = String(normalized && normalized.final_verdict || '').trim();
  return ['Entry','Near Entry','Watch','Avoid'].includes(finalVerdict);
}

function focusQueueRecords(options = {}){
  if(uiState.scannerShortlistSuppressed) return [];
  const limit = options.limit == null ? 5 : options.limit;
  const queueClearedForCycle = state.activeQueueClearedCycle === currentQueueCycleKey();
  const clearedTickers = new Set(queueClearedForCycle ? uniqueTickers(state.activeQueueClearedTickers || []) : []);
  const manualTickers = uniqueTickers(state.activeQueueManualTickers || []);
  const dismissedTickers = new Set(state.dismissedFocusCycle === currentQueueCycleKey() ? uniqueTickers(state.dismissedFocusTickers || []) : []);
  if(queueClearedForCycle && !manualTickers.length && !clearedTickers.size){
    return [];
  }
  const ranked = buildRankedBuckets(rankedTickerRecords()).focus
    .filter(record => !dismissedTickers.has(normalizeTickerRecord(record).ticker))
    .sort((a, b) => rankTickerForFocus(b) - rankTickerForFocus(a) || resultSortScoreFromRecord(b) - resultSortScoreFromRecord(a) || a.ticker.localeCompare(b.ticker));
  const recordsByTicker = new Map();
  ranked.forEach(record => recordsByTicker.set(normalizeTickerRecord(record).ticker, record));
  manualTickers.forEach(ticker => {
    if(dismissedTickers.has(normalizeTicker(ticker))) return;
    const record = getTickerRecord(ticker);
    if(record && normalizeTickerRecord(record).watchlist.inWatchlist && classifyRankedRecord(record) === 'focus'){
      recordsByTicker.set(normalizeTicker(ticker), record);
    }
  });
  let records = Array.from(recordsByTicker.values())
    .filter(record => {
      const ticker = normalizeTickerRecord(record).ticker;
      if(dismissedTickers.has(ticker)) return false;
      if(!queueClearedForCycle) return true;
      if(manualTickers.includes(ticker)) return true;
      return !clearedTickers.has(ticker);
    })
    .sort((a, b) => rankTickerForFocus(b) - rankTickerForFocus(a) || resultSortScoreFromRecord(b) - resultSortScoreFromRecord(a) || a.ticker.localeCompare(b.ticker));
  if(Number.isFinite(limit) && limit >= 0){
    records = records.slice(0, limit);
  }
  return records.map(record => {
    const item = normalizeTickerRecord(record);
    const view = projectTickerForCard(item);
    const focusPresentation = resolveEmojiPresentation(record, {
      context:'focus',
      finalVerdict:view.displayStage,
      setupUiState:view.setupUiState,
      displayedPlan:view.displayedPlan,
      derivedStates:view.setupStates,
      warningState:view.warningState
    });
    return {
      ticker:item.ticker,
      label:view.actionLabel,
      score:Number(view.setupScore || 0),
      verdict:focusPresentation.combinedShortLabel,
      hasValidPlan:view.planUiState.state === 'valid'
    };
  });
}

function renderFocusQueue(){
  const box = $('focusQueue');
  const count = $('focusCount');
  const clearBtn = $('clearFocusBtn');
  if(!box) return;
  const items = focusQueueRecords();
  if(count) count.textContent = `${items.length} focus`;
  if(clearBtn) clearBtn.disabled = !items.length;
  if(!items.length){
    box.innerHTML = '<div class="summary">No focus names right now. Run a scan to seed today&apos;s working queue.</div>';
    return;
  }
  box.innerHTML = `<div class="focusstrip">${items.map(item => {
    const record = normalizeTickerRecord(getTickerRecord(item.ticker) || item);
    const view = projectTickerForCard(record);
    const focusPresentation = resolveEmojiPresentation(record, {
      context:'focus',
      finalVerdict:view.displayStage,
      setupUiState:view.setupUiState,
      displayedPlan:view.displayedPlan,
      derivedStates:view.setupStates,
      warningState:view.warningState
    });
    const displayStage = focusPresentation.combinedShortLabel || item.verdict || '🧐 Monitor';
    const setupScore = view.setupScoreDisplay;
    const reasonLine = compactReasonLineForRecord(record, 3);
    const keepLabel = record.watchlist.inWatchlist ? 'Keep' : 'Add to Watchlist';
    return `<div class="focuscard compactfocus"><div><strong>${escapeHtml(item.ticker)}</strong><div class="tiny">${escapeHtml(displayStage)} | ${escapeHtml(setupScore)}</div><div class="tiny">${escapeHtml(reasonLine)}</div></div><div class="resultactionsbar"><button class="primary compactbutton" type="button" data-act="focus-review" data-ticker="${escapeHtml(item.ticker)}">Open Review</button><button class="secondary compactbutton" type="button" data-act="focus-keep" data-ticker="${escapeHtml(item.ticker)}">${escapeHtml(keepLabel)}</button><button class="ghost compactbutton" type="button" data-act="focus-dismiss" data-ticker="${escapeHtml(item.ticker)}">Dismiss</button></div></div>`;
  }).join('')}</div>`;
  box.querySelectorAll('[data-act="focus-review"]').forEach(button => {
    button.onclick = () => openRankedResultInReview(button.getAttribute('data-ticker') || '');
  });
  box.querySelectorAll('[data-act="focus-keep"]').forEach(button => {
    button.onclick = () => {
      const ticker = normalizeTicker(button.getAttribute('data-ticker') || '');
      if(!ticker) return;
      const record = upsertTickerRecord(ticker);
      addToWatchlist({
        ticker:record.ticker,
        dateAdded:todayIsoDate(),
        scoreWhenAdded:preferredScoreForRecord(record),
        verdictWhenAdded:preferredVerdictForRecord(record)
      });
      renderFocusQueue();
    };
  });
  box.querySelectorAll('[data-act="focus-dismiss"]').forEach(button => {
    button.onclick = () => {
      const ticker = normalizeTicker(button.getAttribute('data-ticker') || '');
      if(!ticker) return;
      state.dismissedFocusCycle = currentQueueCycleKey();
      state.dismissedFocusTickers = uniqueTickers([ticker, ...(state.dismissedFocusTickers || [])]);
      persistState();
      renderFocusQueue();
    };
  });
}

function syncResultsToggleLabel(){
  const resultsToggle = $('resultsToggle');
  const resultsToggleText = $('resultsToggleText');
  if(!resultsToggle || !resultsToggleText) return;
  resultsToggleText.textContent = resultsToggle.open ? '- Hide Ranked Results' : '- Show Ranked Results';
}

function deriveWorkflowAlerts(){
  const dismissed = new Set(Array.isArray(state.dismissedAlertIds) ? state.dismissedAlertIds : []);
  return allTickerRecords()
    .map(record => normalizeTickerRecord(record))
    .filter(item => item.action.stage !== 'avoid')
    .map(item => {
      const stage = String(item.lifecycle.stage || '');
      const status = String(item.lifecycle.status || '');
      const createdAt = String(item.lifecycle.stageUpdatedAt || item.meta.updatedAt || new Date().toISOString());
      const hostileMarket = item.setup.marketCaution ? ' Weak market conditions.' : '';
      let alertType = item.action.stage;
      let severity = 'info';
      let message = 'Watchlist or review candidate.';
      if(item.action.stage === 'action_now'){
        alertType = 'action_now';
        severity = 'action';
        message = `Ready to act.${hostileMarket}`;
      }else if(item.action.stage === 'near_entry'){
        alertType = 'near_entry';
        severity = 'warning';
        message = `Near entry.${hostileMarket}`;
      }else if(item.action.stage === 'needs_plan'){
        alertType = 'needs_plan';
        severity = 'info';
        message = `Needs a valid trade plan.${hostileMarket}`;
      }else{
        alertType = 'watch';
        severity = 'info';
        message = `Worth watching.${hostileMarket}`;
      }
      const alertPresentation = resolveEmojiPresentation(item, {context:'alert'});
      return {
        id:alertIdForRecord(item, alertType, createdAt, item.action.stage),
        ticker:item.ticker,
        alertType,
        severity,
        createdAt,
        message:message.trim(),
        stateLabel:alertPresentation.primaryText,
        stateModifiers:alertPresentation.modifiers,
        stateClass:alertPresentation.badgeClass,
        stage,
        status
      };
    })
    .filter(alert => !dismissed.has(alert.id))
    .sort((a, b) => actionPriority(a.alertType) - actionPriority(b.alertType) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')) || a.ticker.localeCompare(b.ticker));
}

function renderWorkflowAlerts(){
  const box = $('alertsList');
  const badge = $('newAlertsCount');
  if(!box) return;
  const alerts = deriveWorkflowAlerts();
  const groups = {
    actionNow:alerts.filter(alert => alert.alertType === 'action_now'),
    nearEntry:alerts.filter(alert => alert.alertType === 'near_entry'),
    needsPlan:alerts.filter(alert => alert.alertType === 'needs_plan'),
    watch:alerts.filter(alert => alert.alertType === 'watch')
  };
  const newCount = alerts.filter(isAlertNew).length;
  if(badge) badge.textContent = `${newCount} new`;
  box.innerHTML = `<div class="summary"><button class="secondary compactbutton" type="button" data-act="enable-alerts">Enable Entry Alerts</button> <span class="tiny">${escapeHtml(pushPermissionSummary())}</span></div><div class="alertsection"><strong>Action now</strong>${renderAlertRows(groups.actionNow, false)}</div><div class="alertsection"><strong>Near entry</strong>${renderAlertRows(groups.nearEntry)}</div><div class="alertsection"><strong>Needs plan</strong>${renderAlertRows(groups.needsPlan)}</div><div class="alertsection"><strong>Watch</strong>${renderAlertRows(groups.watch)}</div>`;
  box.querySelectorAll('[data-act="enable-alerts"]').forEach(button => {
    button.onclick = () => enableEntryAlerts();
  });
  box.querySelectorAll('[data-act="alert-review"]').forEach(button => {
    button.onclick = () => openRankedResultInReview(button.getAttribute('data-ticker') || '');
  });
  box.querySelectorAll('[data-act="alert-dismiss"]').forEach(button => {
    button.onclick = () => dismissAlert(button.getAttribute('data-id') || '');
  });
}

function renderPatternAnalytics(){
  const box = $('patternAnalytics');
  if(!box) return;
  const analytics = computePatternAnalytics();
  const overview = analytics.overview;
  const lowSample = overview.totalClosed < 5;
  box.innerHTML = `${lowSample ? '<div class="summary">Need at least 5 closed trades for meaningful pattern review. Counts are visible, but treat early stats cautiously.</div>' : ''}<div class="analyticsgrid"><div class="analyticcard"><div><strong>Overview</strong></div><div class="analyticstats"><div class="analyticstat"><div class="tiny">Closed Trades</div><div class="big">${escapeHtml(String(overview.totalClosed))}</div></div><div class="analyticstat"><div class="tiny">Win Rate</div><div class="big">${escapeHtml(formatPercent(overview.winRate))}</div></div><div class="analyticstat"><div class="tiny">Average R</div><div class="big">${escapeHtml(formatDecimal(overview.averageR, 2, 'R'))}</div></div><div class="analyticstat"><div class="tiny">Median R</div><div class="big">${escapeHtml(formatDecimal(overview.medianR, 2, 'R'))}</div></div><div class="analyticstat"><div class="tiny">Wins / Losses</div><div class="big">${escapeHtml(`${overview.wins}/${overview.losses}`)}</div></div><div class="analyticstat"><div class="tiny">Net PnL</div><div class="big">${escapeHtml(Number.isFinite(overview.totalNetPnL) ? formatGbp(overview.totalNetPnL) : 'n/a')}</div></div></div><div class="tiny">Scratches ${escapeHtml(String(overview.scratches))} | Cancelled ${escapeHtml(String(overview.cancelled))}. Win rate excludes cancelled trades and open trades.</div></div><div class="analyticcard ${lowSample ? 'mutedsection' : ''}"><div><strong>Insight Callouts</strong></div>${analytics.insights.length ? `<div class="insightlist">${analytics.insights.map(item => `<div class="insightitem">${escapeHtml(item)}</div>`).join('')}</div>` : '<div class="summary">Need more closed-trade samples before the app can surface meaningful pattern callouts.</div>'}</div><div class="analyticcard ${lowSample ? 'mutedsection' : ''}"><div><strong>Setup Tags</strong></div>${renderAnalyticRows(analytics.setupTags.slice(0, 6), item => `<div class="analyticrow"><div class="analyticrowhead"><strong>${escapeHtml(item.key)}</strong><span class="tiny">n=${escapeHtml(String(item.count))}</span></div><div class="tiny">Win rate ${escapeHtml(formatPercent(item.winRate))} | Avg R ${escapeHtml(formatDecimal(item.averageR, 2, 'R'))} | Closed sample ${escapeHtml(String(item.sample))}</div></div>`)}</div><div class="analyticcard ${lowSample ? 'mutedsection' : ''}"><div><strong>Mistakes</strong></div>${renderAnalyticRows(analytics.mistakeTags.slice(0, 6), item => `<div class="analyticrow"><div class="analyticrowhead"><strong>${escapeHtml(item.key)}</strong><span class="tiny">n=${escapeHtml(String(item.count))}</span></div><div class="tiny">Avg R ${escapeHtml(formatDecimal(item.averageR, 2, 'R'))} | Loser rate ${escapeHtml(formatPercent(item.loserPct))} | Closed sample ${escapeHtml(String(item.sample))}</div></div>`)}</div><div class="analyticcard ${lowSample ? 'mutedsection' : ''}"><div><strong>Market Regime</strong></div>${renderAnalyticRows(analytics.marketRegime.slice(0, 6), item => `<div class="analyticrow"><div class="analyticrowhead"><strong>${escapeHtml(item.key)}</strong><span class="tiny">n=${escapeHtml(String(item.count))}</span></div><div class="tiny">Win rate ${escapeHtml(formatPercent(item.winRate))} | Avg R ${escapeHtml(formatDecimal(item.averageR, 2, 'R'))} | Closed sample ${escapeHtml(String(item.sample))}</div></div>`)}</div><div class="analyticcard ${lowSample ? 'mutedsection' : ''}"><div><strong>Process / Lifecycle</strong></div>${renderAnalyticRows(analytics.lifecycle, item => `<div class="analyticrow"><div class="analyticrowhead"><strong>${escapeHtml(item.path)}</strong><span class="tiny">count ${escapeHtml(String(item.count))}</span></div></div>`)}</div></div>`;
}

function saveTradeFromCard(ticker){
  const tickerRecord = getTickerRecord(ticker);
  if(!tickerRecord) return;
  const snapshot = getCanonicalTradeSnapshot(ticker);
  const tradeRecord = normalizeTradeRecord(createTradeRecord({
    ...snapshot,
    reviewedAt:todayIsoDate()
  }));
  mergeDiaryRecordIntoRecord(upsertTickerRecord(ticker), tradeRecord);
  commitTickerState();
  renderTradeDiary();
  renderPatternAnalytics();
  const diarySection = $('diarySection');
  if(diarySection) diarySection.scrollIntoView({behavior:'smooth', block:'start'});
}

// Legacy diary handlers kept temporarily for comparison during refactor cleanup.
// They are no longer wired into runtime behavior.
function legacyUpdateTradeRecordPreOutcomeEngine(recordId, field, value){
  const found = diaryTradeRecords().find(item => item.trade.id === recordId);
  if(!found) return;
  const tradeRecord = normalizeTradeRecord(found.trade);
  const currentRecord = upsertTickerRecord(found.record.ticker);
  currentRecord.diary.records = currentRecord.diary.records.filter(item => item.id !== recordId);
  if(field === 'ticker') tradeRecord.ticker = normalizeTicker(value);
  else if(field === 'verdict') tradeRecord.verdict = normalizeImportedStatus(value);
  else if(['mistakeTags','lessonTags','setupTags'].includes(field)) tradeRecord[field] = parseTagList(value);
  else tradeRecord[field] = value;
  if(field === 'outcome' && isClosedOutcome(value) && !tradeRecord.closedAt) tradeRecord.closedAt = todayIsoDate();
  if(field === 'outcome' && String(value) === 'Open' && !tradeRecord.openedAt) tradeRecord.openedAt = todayIsoDate();
  if(['mistakeTags','lessonTags','setupTags','lesson','notes','outcomeReason','executionQuality'].includes(field)) tradeRecord.reviewedAt = todayIsoDate();
  mergeDiaryRecordIntoRecord(upsertTickerRecord(tradeRecord.ticker), tradeRecord);
  commitTickerState();
}

function deleteTradeRecord(recordId){
  allTickerRecords().forEach(record => {
    record.diary.records = record.diary.records.filter(item => item.id !== recordId);
    record.diary.diaryIds = record.diary.records.map(item => item.id);
    record.diary.hasDiary = !!record.diary.records.length;
  });
  commitTickerState();
  renderTradeDiary();
  renderPatternAnalytics();
}

// Active structured diary handlers.
function updateTradeRecord(recordId, field, value){
  const found = diaryTradeRecords().find(item => item.trade.id === recordId);
  if(!found) return;
  const tradeRecord = normalizeTradeRecord(found.trade);
  const currentRecord = upsertTickerRecord(found.record.ticker);
  currentRecord.diary.records = currentRecord.diary.records.filter(item => item.id !== recordId);
  if(field === 'ticker') tradeRecord.ticker = normalizeTicker(value);
  else if(field === 'verdict') tradeRecord.verdict = normalizeImportedStatus(value);
  else if(['mistakeTags','lessonTags','setupTags'].includes(field)) tradeRecord[field] = parseTagList(value);
  else tradeRecord[field] = value;
  if(field === 'outcome' && isClosedOutcome(value) && !tradeRecord.closedAt) tradeRecord.closedAt = todayIsoDate();
  if((field === 'outcome' && String(value) === 'Open') || (['actualEntry','actualExit','actualStop','actualQuantity'].includes(field) && String(value || '').trim())){
    if(!tradeRecord.openedAt) tradeRecord.openedAt = todayIsoDate();
  }
  if(['mistakeTags','lessonTags','setupTags','lesson','notes','outcomeReason','executionQuality','setupQuality','beforeImage','afterImage','outcome'].includes(field)){
    tradeRecord.reviewedAt = todayIsoDate();
  }
  mergeDiaryRecordIntoRecord(upsertTickerRecord(tradeRecord.ticker), tradeRecord);
  commitTickerState();
  renderTradeDiary();
}

function legacyRenderTradeDiaryPreOutcomeEngine(){
  const box = $('tradeDiary');
  if(!box) return;
  const diaryItems = diaryTradeRecords();
  console.debug('RENDER_FROM_TICKER_RECORD', 'tradeDiary', diaryItems.length);
  if(!diaryItems.length){
    box.innerHTML = '<div class="summary">No trade records yet. Save an analysed setup from a ticker card.</div>';
    renderPatternAnalytics();
    return;
  }
  box.innerHTML = '';
  diaryItems.forEach(({record: tickerRecord, trade: record}) => {
    const statusLabel = tradeOutcomeStatusLabel(record);
    const outcomeLabel = record.outcome || 'Not set';
    const resultRText = record.resultR ? `${record.resultR}R` : 'R n/a';
    const plannedSummary = `${diarySummaryValue(record.plannedEntry)} / ${diarySummaryValue(record.plannedStop)} / ${diarySummaryValue(record.plannedFirstTarget)}`;
    const actualSummary = `${diarySummaryValue(record.actualEntry)} / ${diarySummaryValue(record.actualExit)} / ${diarySummaryValue(record.actualQuantity)}`;
    const tagSummary = [formatTagList(record.setupTags), formatTagList(record.mistakeTags), formatTagList(record.lessonTags)].filter(Boolean).join(' | ') || 'No tags yet';
    const div = document.createElement('div');
    div.className = 'diarycard';
    div.innerHTML = `<div class="diaryhead"><div class="diarymeta"><span class="badge ${statusClass(record.chartVerdict || record.verdict)}">${escapeHtml(record.chartVerdict || record.verdict)}</span><strong>${escapeHtml(record.ticker || 'Ticker')}</strong><span class="tiny">${escapeHtml(record.date || '')}</span><span class="tiny">${escapeHtml(statusLabel)}</span><span class="tiny">${escapeHtml(tickerRecord.lifecycle.stage || '')}</span></div><button class="danger" data-act="delete-trade">Delete</button></div><div class="tiny">Outcome ${escapeHtml(outcomeLabel)} | ${escapeHtml(resultRText)} | Gross ${escapeHtml(record.grossPnL || 'n/a')} | Net ${escapeHtml(record.netPnL || 'n/a')} | Held ${escapeHtml(record.heldDays || 'n/a')} day(s)</div><div class="tiny">Planned ${escapeHtml(plannedSummary)} | Actual ${escapeHtml(actualSummary)}</div><div class="tiny">Tags: ${escapeHtml(tagSummary)}</div><div><strong>Planned Snapshot</strong></div><div class="diarygrid"><div><label>Planned Entry</label><input data-field="plannedEntry" value="${escapeHtml(record.plannedEntry)}" placeholder="123.45" /></div><div><label>Planned Stop</label><input data-field="plannedStop" value="${escapeHtml(record.plannedStop)}" placeholder="119.80" /></div><div><label>Planned Target</label><input data-field="plannedFirstTarget" value="${escapeHtml(record.plannedFirstTarget)}" placeholder="130.00" /></div><div><label>Planned Risk/Share</label><input data-field="plannedRiskPerShare" value="${escapeHtml(record.plannedRiskPerShare)}" placeholder="3.65" /></div></div><div class="diarygrid"><div><label>Planned Reward/Share</label><input data-field="plannedRewardPerShare" value="${escapeHtml(record.plannedRewardPerShare)}" placeholder="7.30" /></div><div><label>Planned R:R</label><input data-field="plannedRR" value="${escapeHtml(record.plannedRR)}" placeholder="2.00" /></div><div><label>Planned Size</label><input data-field="plannedPositionSize" value="${escapeHtml(record.plannedPositionSize)}" placeholder="10" /></div><div><label>Planned Max Loss</label><input data-field="plannedMaxLoss" value="${escapeHtml(record.plannedMaxLoss)}" placeholder="40.00" /></div></div><div><strong>Actual Trade</strong></div><div class="diarygrid"><div><label>Opened</label><input data-field="openedAt" type="date" value="${escapeHtml(record.openedAt)}" /></div><div><label>Closed</label><input data-field="closedAt" type="date" value="${escapeHtml(record.closedAt)}" /></div><div><label>Actual Entry</label><input data-field="actualEntry" value="${escapeHtml(record.actualEntry)}" placeholder="123.60" /></div><div><label>Actual Exit</label><input data-field="actualExit" value="${escapeHtml(record.actualExit)}" placeholder="129.90" /></div></div><div class="diarygrid"><div><label>Actual Stop</label><input data-field="actualStop" value="${escapeHtml(record.actualStop)}" placeholder="119.80" /></div><div><label>Quantity</label><input data-field="actualQuantity" value="${escapeHtml(record.actualQuantity)}" placeholder="10" /></div><div><label>Gross PnL</label><input value="${escapeHtml(record.grossPnL || '')}" readonly /></div><div><label>Net PnL</label><input data-field="netPnL" value="${escapeHtml(record.netPnL)}" placeholder="Use to account for fees" /></div></div><div><strong>Outcome Review</strong></div><div class="diarygrid"><div><label>Verdict</label><select data-field="verdict"><option ${record.verdict === 'Watch' ? 'selected' : ''}>Watch</option><option ${record.verdict === 'Near Entry' ? 'selected' : ''}>Near Entry</option><option ${record.verdict === 'Entry' ? 'selected' : ''}>Entry</option><option ${record.verdict === 'Avoid' ? 'selected' : ''}>Avoid</option></select></div><div><label>Outcome</label><select data-field="outcome"><option value="" ${record.outcome === '' ? 'selected' : ''}>Not set</option><option ${record.outcome === 'Open' ? 'selected' : ''}>Open</option><option ${record.outcome === 'Win' ? 'selected' : ''}>Win</option><option ${record.outcome === 'Loss' ? 'selected' : ''}>Loss</option><option ${record.outcome === 'Scratch' ? 'selected' : ''}>Scratch</option><option ${record.outcome === 'Cancelled' ? 'selected' : ''}>Cancelled</option></select></div><div><label>Outcome Reason</label><select data-field="outcomeReason"><option value="" ${record.outcomeReason === '' ? 'selected' : ''}>Not set</option><option ${record.outcomeReason === 'target hit' ? 'selected' : ''}>target hit</option><option ${record.outcomeReason === 'stop hit' ? 'selected' : ''}>stop hit</option><option ${record.outcomeReason === 'manual exit' ? 'selected' : ''}>manual exit</option><option ${record.outcomeReason === 'invalidation' ? 'selected' : ''}>invalidation</option><option ${record.outcomeReason === 'expired' ? 'selected' : ''}>expired</option><option ${record.outcomeReason === 'never triggered' ? 'selected' : ''}>never triggered</option></select></div><div><label>Result in R</label><input value="${escapeHtml(record.resultR || '')}" readonly /></div></div><div class="diarygrid"><div><label>Execution Quality</label><select data-field="executionQuality"><option value="" ${record.executionQuality === '' ? 'selected' : ''}>Not set</option><option ${record.executionQuality === 'followed_plan' ? 'selected' : ''}>followed_plan</option><option ${record.executionQuality === 'early_entry' ? 'selected' : ''}>early_entry</option><option ${record.executionQuality === 'late_entry' ? 'selected' : ''}>late_entry</option><option ${record.executionQuality === 'early_exit' ? 'selected' : ''}>early_exit</option><option ${record.executionQuality === 'late_exit' ? 'selected' : ''}>late_exit</option><option ${record.executionQuality === 'partial' ? 'selected' : ''}>partial</option></select></div><div><label>Setup Quality</label><select data-field="setupQuality"><option value="" ${record.setupQuality === '' ? 'selected' : ''}>Not set</option><option ${record.setupQuality === 'A' ? 'selected' : ''}>A</option><option ${record.setupQuality === 'B' ? 'selected' : ''}>B</option><option ${record.setupQuality === 'C' ? 'selected' : ''}>C</option></select></div><div><label>Reviewed</label><input data-field="reviewedAt" type="date" value="${escapeHtml(record.reviewedAt)}" /></div><div><label>Lesson Learned</label><input data-field="lesson" value="${escapeHtml(record.lesson)}" placeholder="Wait for cleaner bounce" /></div></div><div class="diarygrid"><div><label>Setup Tags</label><input data-field="setupTags" value="${escapeHtml(formatTagList(record.setupTags))}" placeholder="20MA bounce, first pullback" />${renderDiaryTagButtons(record.id, 'setupTags', DIARY_SETUP_TAG_OPTIONS)}</div><div><label>Mistake Tags</label><input data-field="mistakeTags" value="${escapeHtml(formatTagList(record.mistakeTags))}" placeholder="early entry, stop moved" />${renderDiaryTagButtons(record.id, 'mistakeTags', DIARY_MISTAKE_TAG_OPTIONS)}</div><div><label>Lesson Tags</label><input data-field="lessonTags" value="${escapeHtml(formatTagList(record.lessonTags))}" placeholder="wait for bounce confirmation" />${renderDiaryTagButtons(record.id, 'lessonTags', DIARY_LESSON_TAG_OPTIONS)}</div><div><label>Before / After Evidence</label><input data-field="beforeImage" value="${escapeHtml(record.beforeImage)}" placeholder="before screenshot / ref" style="margin-bottom:6px" /><input data-field="afterImage" value="${escapeHtml(record.afterImage)}" placeholder="after screenshot / ref" /></div></div><div><label>Notes</label><textarea data-field="notes" placeholder="What happened, what to repeat, what to avoid next time.">${escapeHtml(record.notes)}</textarea></div>`;
    div.querySelector('[data-act="delete-trade"]').onclick = () => deleteTradeRecord(record.id);
    div.querySelectorAll('[data-act="tag-pick"]').forEach(button => {
      button.onclick = () => {
        const fieldName = button.getAttribute('data-field') || '';
        const tag = String(button.getAttribute('data-tag') || '').trim();
        const input = div.querySelector(`[data-field="${fieldName}"]`);
        if(!input || !tag) return;
        const next = parseTagList(input.value);
        input.value = next.includes(tag)
          ? next.filter(item => item !== tag).join(', ')
          : [...next, tag].join(', ');
        updateTradeRecord(record.id, fieldName, input.value);
      };
    });
    div.querySelectorAll('[data-field]').forEach(field => {
      field.addEventListener('change', event => updateTradeRecord(record.id, event.target.getAttribute('data-field'), event.target.value));
      field.addEventListener('input', event => {
        if(event.target.tagName === 'TEXTAREA' || ['lesson','setupTags','mistakeTags','lessonTags','notes','beforeImage','afterImage','netPnL'].includes(event.target.getAttribute('data-field'))){
          updateTradeRecord(record.id, event.target.getAttribute('data-field'), event.target.value);
        }
      });
    });
    box.appendChild(div);
  });
  renderPatternAnalytics();
}

function legacyRenderTradeDiaryExpanded(){
  const box = $('tradeDiary');
  if(!box) return;
  const diaryItems = diaryTradeRecords();
  console.debug('RENDER_FROM_TICKER_RECORD', 'tradeDiary', diaryItems.length);
  if(!diaryItems.length){
    box.innerHTML = '<div class="summary">No trade records yet. Save an analysed setup from a ticker card.</div>';
    return;
  }
  box.innerHTML = '';
  diaryItems.forEach(({record: tickerRecord, trade: record}) => {
    const outcomeLabel = record.outcome || 'Not set';
    const resultRText = record.resultR ? `${record.resultR}R` : 'R n/a';
    const plannedSummary = `${record.plannedEntry || 'n/a'} / ${record.plannedStop || 'n/a'} / ${record.plannedFirstTarget || 'n/a'}`;
    const actualSummary = `${record.actualEntry || 'n/a'} / ${record.actualExit || 'n/a'} / ${record.actualQuantity || 'n/a'}`;
    const tagSummary = [formatTagList(record.setupTags), formatTagList(record.mistakeTags), formatTagList(record.lessonTags)].filter(Boolean).join(' | ') || 'No tags yet';
    const div = document.createElement('div');
    div.className = 'diarycard';
    div.innerHTML = `<div class="diaryhead"><div class="diarymeta"><span class="badge ${statusClass(record.chartVerdict || record.verdict)}">${escapeHtml(record.chartVerdict || record.verdict)}</span><strong>${escapeHtml(record.ticker || 'Ticker')}</strong><span class="tiny">${escapeHtml(record.date || '')}</span><span class="tiny">${escapeHtml(tickerRecord.lifecycle.stage || '')}</span></div><button class="danger" data-act="delete-trade">Delete</button></div><div class="tiny">Outcome ${escapeHtml(outcomeLabel)} | ${escapeHtml(resultRText)} | Gross ${escapeHtml(record.grossPnL || 'n/a')} | Net ${escapeHtml(record.netPnL || 'n/a')} | Held ${escapeHtml(record.heldDays || 'n/a')} day(s)</div><div class="tiny">Planned ${escapeHtml(plannedSummary)} | Actual ${escapeHtml(actualSummary)}</div><div class="tiny">Tags: ${escapeHtml(tagSummary)}</div><div class="diarygrid"><div><label>Opened</label><input data-field="openedAt" type="date" value="${escapeHtml(record.openedAt)}" /></div><div><label>Closed</label><input data-field="closedAt" type="date" value="${escapeHtml(record.closedAt)}" /></div><div><label>Verdict</label><select data-field="verdict"><option ${record.verdict === 'Watch' ? 'selected' : ''}>Watch</option><option ${record.verdict === 'Near Entry' ? 'selected' : ''}>Near Entry</option><option ${record.verdict === 'Entry' ? 'selected' : ''}>Entry</option><option ${record.verdict === 'Avoid' ? 'selected' : ''}>Avoid</option></select></div><div><label>Outcome</label><select data-field="outcome"><option value="" ${record.outcome === '' ? 'selected' : ''}>Not set</option><option ${record.outcome === 'Open' ? 'selected' : ''}>Open</option><option ${record.outcome === 'Win' ? 'selected' : ''}>Win</option><option ${record.outcome === 'Loss' ? 'selected' : ''}>Loss</option><option ${record.outcome === 'Scratch' ? 'selected' : ''}>Scratch</option><option ${record.outcome === 'Cancelled' ? 'selected' : ''}>Cancelled</option></select></div></div><div class="diarygrid"><div><label>Planned Entry</label><input data-field="plannedEntry" value="${escapeHtml(record.plannedEntry)}" placeholder="123.45" /></div><div><label>Planned Stop</label><input data-field="plannedStop" value="${escapeHtml(record.plannedStop)}" placeholder="119.80" /></div><div><label>Planned Target</label><input data-field="plannedFirstTarget" value="${escapeHtml(record.plannedFirstTarget)}" placeholder="130.00" /></div><div><label>Planned Risk/Share</label><input data-field="plannedRiskPerShare" value="${escapeHtml(record.plannedRiskPerShare)}" placeholder="3.65" /></div></div><div class="diarygrid"><div><label>Actual Entry</label><input data-field="actualEntry" value="${escapeHtml(record.actualEntry)}" placeholder="123.60" /></div><div><label>Actual Exit</label><input data-field="actualExit" value="${escapeHtml(record.actualExit)}" placeholder="129.90" /></div><div><label>Actual Stop</label><input data-field="actualStop" value="${escapeHtml(record.actualStop)}" placeholder="119.80" /></div><div><label>Quantity</label><input data-field="actualQuantity" value="${escapeHtml(record.actualQuantity)}" placeholder="10" /></div></div><div class="diarygrid"><div><label>Outcome Reason</label><select data-field="outcomeReason"><option value="" ${record.outcomeReason === '' ? 'selected' : ''}>Not set</option><option ${record.outcomeReason === 'target hit' ? 'selected' : ''}>target hit</option><option ${record.outcomeReason === 'stop hit' ? 'selected' : ''}>stop hit</option><option ${record.outcomeReason === 'manual exit' ? 'selected' : ''}>manual exit</option><option ${record.outcomeReason === 'invalidation' ? 'selected' : ''}>invalidation</option><option ${record.outcomeReason === 'expired' ? 'selected' : ''}>expired</option></select></div><div><label>Execution Quality</label><select data-field="executionQuality"><option value="" ${record.executionQuality === '' ? 'selected' : ''}>Not set</option><option ${record.executionQuality === 'followed_plan' ? 'selected' : ''}>followed_plan</option><option ${record.executionQuality === 'early_entry' ? 'selected' : ''}>early_entry</option><option ${record.executionQuality === 'late_entry' ? 'selected' : ''}>late_entry</option><option ${record.executionQuality === 'early_exit' ? 'selected' : ''}>early_exit</option><option ${record.executionQuality === 'late_exit' ? 'selected' : ''}>late_exit</option><option ${record.executionQuality === 'partial' ? 'selected' : ''}>partial</option></select></div><div><label>Setup Quality</label><select data-field="setupQuality"><option value="" ${record.setupQuality === '' ? 'selected' : ''}>Not set</option><option ${record.setupQuality === 'A' ? 'selected' : ''}>A</option><option ${record.setupQuality === 'B' ? 'selected' : ''}>B</option><option ${record.setupQuality === 'C' ? 'selected' : ''}>C</option></select></div><div><label>Reviewed</label><input data-field="reviewedAt" type="date" value="${escapeHtml(record.reviewedAt)}" /></div></div><div class="diarygrid"><div><label>Setup Tags</label><input data-field="setupTags" value="${escapeHtml(formatTagList(record.setupTags))}" placeholder="20MA bounce, first pullback" /></div><div><label>Mistake Tags</label><input data-field="mistakeTags" value="${escapeHtml(formatTagList(record.mistakeTags))}" placeholder="early entry, stop moved" /></div><div><label>Lesson Tags</label><input data-field="lessonTags" value="${escapeHtml(formatTagList(record.lessonTags))}" placeholder="wait for bounce confirmation" /></div><div><label>Lesson Learned</label><input data-field="lesson" value="${escapeHtml(record.lesson)}" placeholder="Wait for cleaner bounce" /></div></div><div class="diarygrid"><div><label>Before Image Ref</label><input data-field="beforeImage" value="${escapeHtml(record.beforeImage)}" placeholder="stored chart / ref" /></div><div><label>After Image Ref</label><input data-field="afterImage" value="${escapeHtml(record.afterImage)}" placeholder="exit screenshot / ref" /></div><div><label>Gross PnL</label><input value="${escapeHtml(record.grossPnL || '')}" readonly /></div><div><label>Result in R</label><input value="${escapeHtml(record.resultR || '')}" readonly /></div></div><div><label>Notes</label><textarea data-field="notes" placeholder="Why this setup was worth tracking.">${escapeHtml(record.notes)}</textarea></div>`;
    div.querySelector('[data-act="delete-trade"]').onclick = () => deleteTradeRecord(record.id);
    div.querySelectorAll('[data-field]').forEach(field => {
      field.addEventListener('change', event => updateTradeRecord(record.id, event.target.getAttribute('data-field'), event.target.value));
      field.addEventListener('input', event => {
        if(event.target.tagName === 'TEXTAREA' || ['lesson','setupTags','mistakeTags','lessonTags','notes','beforeImage','afterImage'].includes(event.target.getAttribute('data-field'))){
          updateTradeRecord(record.id, event.target.getAttribute('data-field'), event.target.value);
        }
      });
    });
    box.appendChild(div);
  });
}

function renderTradeDiary(){
  const box = $('tradeDiary');
  if(!box) return;
  const diaryItems = diaryTradeRecords();
  console.debug('RENDER_FROM_TICKER_RECORD', 'tradeDiary', diaryItems.length);
  if(!diaryItems.length){
    box.innerHTML = '<div class="summary">No trade records yet. Save an analysed setup from the review workspace.</div>';
    return;
  }
  box.innerHTML = '';
  diaryItems.forEach(({record: tickerRecord, trade: record}) => {
    const outcomeLabel = record.outcome || 'Not set';
    const resultRText = record.resultR ? `${record.resultR}R` : 'R n/a';
    const plannedSummary = `${record.plannedEntry || 'n/a'} / ${record.plannedStop || 'n/a'} / ${record.plannedFirstTarget || 'n/a'}`;
    const actualSummary = `${record.actualEntry || 'n/a'} / ${record.actualExit || 'n/a'} / ${record.actualQuantity || 'n/a'}`;
    const tagSummary = [formatTagList(record.setupTags), formatTagList(record.mistakeTags), formatTagList(record.lessonTags)].filter(Boolean).join(' | ') || 'No tags yet';
    const div = document.createElement('details');
    div.className = 'diarycard';
    div.innerHTML = `<summary class="diaryhead"><div class="diarymeta"><span class="badge ${statusClass(record.chartVerdict || record.verdict)}">${escapeHtml(record.chartVerdict || record.verdict)}</span><strong>${escapeHtml(record.ticker || 'Ticker')}</strong><span class="tiny">${escapeHtml(record.date || '')}</span><span class="tiny">${escapeHtml(tickerRecord.lifecycle.stage || '')}</span></div><div class="tiny">Outcome ${escapeHtml(outcomeLabel)} | ${escapeHtml(resultRText)}</div></summary><div class="tiny">Outcome ${escapeHtml(outcomeLabel)} | ${escapeHtml(resultRText)} | Gross ${escapeHtml(record.grossPnL || 'n/a')} | Net ${escapeHtml(record.netPnL || 'n/a')} | Held ${escapeHtml(record.heldDays || 'n/a')} day(s)</div><div class="tiny">Planned ${escapeHtml(plannedSummary)} | Actual ${escapeHtml(actualSummary)}</div><div class="tiny">Tags: ${escapeHtml(tagSummary)}</div><div class="actions"><button class="danger compactbutton" data-act="delete-trade" type="button">Delete</button></div><div class="diarygrid"><div><label>Opened</label><input data-field="openedAt" type="date" value="${escapeHtml(record.openedAt)}" /></div><div><label>Closed</label><input data-field="closedAt" type="date" value="${escapeHtml(record.closedAt)}" /></div><div><label>Verdict</label><select data-field="verdict"><option ${record.verdict === 'Watch' ? 'selected' : ''}>Watch</option><option ${record.verdict === 'Near Entry' ? 'selected' : ''}>Near Entry</option><option ${record.verdict === 'Entry' ? 'selected' : ''}>Entry</option><option ${record.verdict === 'Avoid' ? 'selected' : ''}>Avoid</option></select></div><div><label>Outcome</label><select data-field="outcome"><option value="" ${record.outcome === '' ? 'selected' : ''}>Not set</option><option ${record.outcome === 'Open' ? 'selected' : ''}>Open</option><option ${record.outcome === 'Win' ? 'selected' : ''}>Win</option><option ${record.outcome === 'Loss' ? 'selected' : ''}>Loss</option><option ${record.outcome === 'Scratch' ? 'selected' : ''}>Scratch</option><option ${record.outcome === 'Cancelled' ? 'selected' : ''}>Cancelled</option></select></div></div><div class="diarygrid"><div><label>Planned Entry</label><input data-field="plannedEntry" value="${escapeHtml(record.plannedEntry)}" placeholder="123.45" /></div><div><label>Planned Stop</label><input data-field="plannedStop" value="${escapeHtml(record.plannedStop)}" placeholder="119.80" /></div><div><label>Planned Target</label><input data-field="plannedFirstTarget" value="${escapeHtml(record.plannedFirstTarget)}" placeholder="130.00" /></div><div><label>Planned Risk/Share</label><input data-field="plannedRiskPerShare" value="${escapeHtml(record.plannedRiskPerShare)}" placeholder="3.65" /></div></div><div class="diarygrid"><div><label>Actual Entry</label><input data-field="actualEntry" value="${escapeHtml(record.actualEntry)}" placeholder="123.60" /></div><div><label>Actual Exit</label><input data-field="actualExit" value="${escapeHtml(record.actualExit)}" placeholder="129.90" /></div><div><label>Actual Stop</label><input data-field="actualStop" value="${escapeHtml(record.actualStop)}" placeholder="119.80" /></div><div><label>Quantity</label><input data-field="actualQuantity" value="${escapeHtml(record.actualQuantity)}" placeholder="10" /></div></div><div class="diarygrid"><div><label>Outcome Reason</label><select data-field="outcomeReason"><option value="" ${record.outcomeReason === '' ? 'selected' : ''}>Not set</option><option ${record.outcomeReason === 'target hit' ? 'selected' : ''}>target hit</option><option ${record.outcomeReason === 'stop hit' ? 'selected' : ''}>stop hit</option><option ${record.outcomeReason === 'manual exit' ? 'selected' : ''}>manual exit</option><option ${record.outcomeReason === 'invalidation' ? 'selected' : ''}>invalidation</option><option ${record.outcomeReason === 'expired' ? 'selected' : ''}>expired</option></select></div><div><label>Execution Quality</label><select data-field="executionQuality"><option value="" ${record.executionQuality === '' ? 'selected' : ''}>Not set</option><option ${record.executionQuality === 'followed_plan' ? 'selected' : ''}>followed_plan</option><option ${record.executionQuality === 'early_entry' ? 'selected' : ''}>early_entry</option><option ${record.executionQuality === 'late_entry' ? 'selected' : ''}>late_entry</option><option ${record.executionQuality === 'early_exit' ? 'selected' : ''}>early_exit</option><option ${record.executionQuality === 'late_exit' ? 'selected' : ''}>late_exit</option><option ${record.executionQuality === 'partial' ? 'selected' : ''}>partial</option></select></div><div><label>Setup Quality</label><select data-field="setupQuality"><option value="" ${record.setupQuality === '' ? 'selected' : ''}>Not set</option><option ${record.setupQuality === 'A' ? 'selected' : ''}>A</option><option ${record.setupQuality === 'B' ? 'selected' : ''}>B</option><option ${record.setupQuality === 'C' ? 'selected' : ''}>C</option></select></div><div><label>Reviewed</label><input data-field="reviewedAt" type="date" value="${escapeHtml(record.reviewedAt)}" /></div></div><div class="diarygrid"><div><label>Setup Tags</label><input data-field="setupTags" value="${escapeHtml(formatTagList(record.setupTags))}" placeholder="20MA bounce, first pullback" /></div><div><label>Mistake Tags</label><input data-field="mistakeTags" value="${escapeHtml(formatTagList(record.mistakeTags))}" placeholder="early entry, stop moved" /></div><div><label>Lesson Tags</label><input data-field="lessonTags" value="${escapeHtml(formatTagList(record.lessonTags))}" placeholder="wait for bounce confirmation" /></div><div><label>Lesson Learned</label><input data-field="lesson" value="${escapeHtml(record.lesson)}" placeholder="Wait for cleaner bounce" /></div></div><div class="diarygrid"><div><label>Before Image Ref</label><input data-field="beforeImage" value="${escapeHtml(record.beforeImage)}" placeholder="stored chart / ref" /></div><div><label>After Image Ref</label><input data-field="afterImage" value="${escapeHtml(record.afterImage)}" placeholder="exit screenshot / ref" /></div><div><label>Gross PnL</label><input value="${escapeHtml(record.grossPnL || '')}" readonly /></div><div><label>Result in R</label><input value="${escapeHtml(record.resultR || '')}" readonly /></div></div><div><label>Notes</label><textarea data-field="notes" placeholder="Why this setup was worth tracking.">${escapeHtml(record.notes)}</textarea></div>`;
    div.querySelector('[data-act="delete-trade"]').onclick = () => deleteTradeRecord(record.id);
    div.querySelectorAll('[data-field]').forEach(field => {
      field.addEventListener('change', event => updateTradeRecord(record.id, event.target.getAttribute('data-field'), event.target.value));
      field.addEventListener('input', event => {
        if(event.target.tagName === 'TEXTAREA' || ['lesson','setupTags','mistakeTags','lessonTags','notes','beforeImage','afterImage'].includes(event.target.getAttribute('data-field'))){
          updateTradeRecord(record.id, event.target.getAttribute('data-field'), event.target.value);
        }
      });
    });
    box.appendChild(div);
  });
}

function downloadJsonFile(filename, data){
  try{
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }catch(error){
    return false;
  }
}

function exportTradeDiary(){
  const ok = downloadJsonFile(`pullback-playbook-trade-diary-${todayIsoDate()}.json`, diaryTradeRecords().map(item => item.trade));
  setStatus('inputStatus', ok
    ? '<span class="ok">Trade diary exported as JSON.</span>'
    : '<span class="warntext">Direct file access is browser-limited here. Use your browser download prompt to save the diary export.</span>');
}

function updateTickerSearchStatus(){
  const search = tickerSearchState();
  if(!currentProviderConfig().supportsSearch){
    setStatus('tickerSearchStatus', `<span class="tiny">${escapeHtml(currentProviderLabel())} search is not wired yet. Add tickers manually or from TradingView import.</span>`);
  }else if(!search.query){
    setStatus('tickerSearchStatus', `<span class="tiny">Add one ticker quickly, or search ${escapeHtml(currentProviderLabel())} symbols below.</span>`);
  }else if(!search.valid){
    setStatus('tickerSearchStatus', `<span class="badtext">${escapeHtml(search.query)} is not a valid ticker format.</span>`);
  }else if(search.inUniverse){
    setStatus('tickerSearchStatus', `<span class="warntext">${escapeHtml(search.query)} is already in the scanner universe.</span>`);
  }else{
    setStatus('tickerSearchStatus', `<span class="ok">${escapeHtml(search.query)} is ready to add.</span>`);
  }
  renderTickerQuickLists();
}

function renderTickerSuggestions(results){
  const box = $('tickerSuggestions');
  if(!box) return;
  const list = Array.isArray(results) ? results : [];
  if(!list.length){
    box.innerHTML = '';
    box.hidden = true;
    return;
  }
  box.hidden = false;
  box.innerHTML = list.map(item => (
    `<button class="suggestionitem" type="button" data-act="suggestion" data-ticker="${escapeHtml(item.ticker)}">
      <span><strong>${escapeHtml(item.ticker)}</strong> ${escapeHtml(item.companyName || '')}</span>
      <span class="tiny">${escapeHtml(item.exchange || '')}</span>
    </button>`
  )).join('');
  box.querySelectorAll('[data-act="suggestion"]').forEach(button => {
    button.onclick = () => {
      const ticker = button.getAttribute('data-ticker') || '';
      const selected = list.find(item => item.ticker === ticker);
      if(selected){
        rememberTickerMeta(selected);
        $('tickerSearch').value = selected.ticker;
        renderTickerSuggestions([]);
        updateTickerSearchStatus();
      }
    };
  });
}

async function updateTickerSuggestions(){
  const search = tickerSearchState();
  if(!currentProviderConfig().supportsSearch){
    renderTickerSuggestions([]);
    return;
  }
  if(!search.query || search.query.length < 1){
    renderTickerSuggestions([]);
    return;
  }
  const token = ++suggestionRequestToken;
  try{
    const results = await fetchTickerSuggestions(search.query);
    if(token !== suggestionRequestToken) return;
    renderTickerSuggestions(results);
  }catch(err){
    if(token !== suggestionRequestToken) return;
    renderTickerSuggestions([]);
  }
}

function queueTickerSuggestions(){
  clearTimeout(suggestionTimer);
  suggestionTimer = setTimeout(() => {
    updateTickerSuggestions().catch(() => {});
  }, SEARCH_DEBOUNCE_MS);
}

function buildCards(){
  uiState.selectedScanner = {};
  return runScannerWorkflow({force:true, syncInput:true})
    .then(() => {
      const resultsToggle = $('resultsToggle');
      const resultsSection = $('resultsSection');
      if(resultsToggle) resultsToggle.open = true;
      if(resultsSection) resultsSection.scrollIntoView({behavior:'smooth', block:'start'});
    })
    .catch(err => {
      pushRuntimeDebugEntry('buildCards.catch', {
        message:err && err.message ? err.message : 'buildCards failed',
        stack:err && err.stack ? err.stack : ''
      });
      setStatus('apiStatus', `<span class="badtext">${escapeHtml(err.message || 'Scanner failed.')}</span>`);
    });
}

function addTicker(rawTicker, meta){
  const input = $('tickerSearch');
  const ticker = normalizeTicker(rawTicker || (input && input.value));
  if(!ticker){
    setStatus('tickerSearchStatus', '<span class="warntext">Enter a ticker first.</span>');
    return;
  }
  if(!validateTickerSymbol(ticker)){
    setStatus('tickerSearchStatus', `<span class="badtext">${escapeHtml(ticker)} is not a valid ticker format.</span>`);
    return;
  }
  if(state.tickers.includes(ticker)){
    setStatus('tickerSearchStatus', `<span class="warntext">${escapeHtml(ticker)} is already in the scanner universe.</span>`);
    if(input) input.select();
    return;
  }
  const scanType = normalizeScanType((meta && meta.scanType) || selectedQuickScanType());
  if(meta || scanType) rememberTickerMeta({...meta, ticker, scanType});
  state.tickers.push(ticker);
  upsertTickerRecord(ticker);
  updateRecentTickers([ticker]);
  updateTickerInputFromState();
  if(input) input.value = '';
  renderTickerSuggestions([]);
  commitTickerState();
  renderTickerQuickLists();
  renderScannerResults();
  renderCards();
  setStatus('tickerSearchStatus', `<span class="ok">${escapeHtml(ticker)} added to the scanner universe.</span>`);
}

function addTickerFromSearch(){
  addTicker();
}

function removeTicker(ticker){
  state.tickers = state.tickers.filter(item => item !== ticker);
  state.scannerResults = state.scannerResults.filter(card => card.ticker !== ticker);
  state.cards = state.cards.filter(card => card.ticker !== ticker);
  state.watchlist = state.watchlist.filter(entry => entry.ticker !== ticker);
  state.tradeDiary = state.tradeDiary.filter(entry => entry.ticker !== ticker);
  delete state.tickerRecords[normalizeTicker(ticker)];
  delete uiState.selectedScanner[ticker];
  delete uiState.promptOpen[ticker];
  delete uiState.responseOpen[ticker];
  if(activeReviewTicker() === ticker) resetReview();
  updateTickerInputFromState();
  commitTickerState();
  renderTickerQuickLists();
  renderScannerResults();
  renderCards();
  updateTickerSearchStatus();
  scrollToScannerResults();
}

function scrollToScannerResults(){
  const target = $('resultsSection') || $('results');
  if(!target) return;
  target.scrollIntoView({behavior:'smooth', block:'start'});
}

function removeCard(ticker){
  state.cards = state.cards.filter(card => card.ticker !== ticker);
  const record = getTickerRecord(ticker);
  if(record) record.review.cardOpen = false;
  delete uiState.promptOpen[ticker];
  delete uiState.responseOpen[ticker];
  if(activeReviewTicker() === ticker) resetReview();
  const normalized = normalizeTicker(ticker);
  if(normalized){
    uiState.scannerSessionTickers = uniqueTickers((uiState.scannerSessionTickers || []).filter(item => normalizeTicker(item) !== normalized));
  }
  commitTickerState();
  renderCards();
  renderScannerResults();
  renderFocusQueue();
  renderWorkflowAlerts();
}

function scoreAndStatusFromChecks(checks){
  const nearMA = !!(checks.near20 || checks.near50);
  const trendStrong = !!checks.trendStrong;
  const above50 = !!checks.above50;
  const above200 = !!checks.above200;
  const ma50gt200 = !!checks.ma50gt200;
  const stabilising = !!checks.stabilising;
  const bounce = !!checks.bounce;
  const volume = !!checks.volume;
  const tradePlan = !!(checks.entryDefined && checks.stopDefined && checks.targetDefined);
  let score = 0;
  if(trendStrong) score += 2;
  if(above50) score += 1;
  if(above200) score += 1;
  if(ma50gt200) score += 1;
  if(nearMA) score += 2;
  if(stabilising) score += 1;
  if(bounce) score += 1;
  if(volume) score += 1;
  if(tradePlan) score += 1;
  let status = 'Watch';
  const hardFail = !above50 || !above200 || !nearMA || !trendStrong;
  if(hardFail) status = 'Avoid';
  else if(stabilising && bounce && tradePlan) status = 'Entry';
  else if(stabilising) status = 'Near Entry';
  return {score, status};
}

function buildSummary(checks, status){
  const nearMA = checks.near20 || checks.near50;
  const stabilising = !!checks.stabilising;
  const bounce = !!checks.bounce;
  const trendStrong = !!checks.trendStrong;
  const above50 = !!checks.above50;
  const above200 = !!checks.above200;
  if(!trendStrong || !above50 || !above200 || !nearMA){
    let reason = 'The stock does not meet the basic Quality Pullback rules.';
    if(!trendStrong) reason += ' Trend quality is not strong enough.';
    else if(!nearMA) reason += ' Pullback location is not close enough to the 20 MA or 50 MA.';
    else reason += ' The broader trend structure is not strong enough.';
    return reason;
  }
  let text = 'Strong uptrend.';
  text += checks.near20 ? ' Pullback is near the 20 MA.' : ' Pullback is near the 50 MA.';
  if(stabilising && bounce && status === 'Entry') return `${text} Price is stabilising and a bounce is forming. Setup is close to actionable if risk stays controlled.`;
  if(stabilising) return `${text} Price is stabilising, but the bounce still needs confirmation.`;
  return `${text} There is no clear stabilisation or bounce yet.`;
}

function statusClass(status){
  if(status === 'Too Wide') return 'near';
  if(status === '💀 Dead' || status === '⛔ Broken') return 'avoid';
  if(status === '🌱 Developing' || status === '🟠 Developing') return 'near';
  if(status === '🧐 Monitor' || status === '👀 Watch') return 'watch';
  if(status === '🚀 Entry') return 'ready';
  if(status === '✅ Plan valid') return 'ready';
  if(status === '🟠 Needs adjustment') return 'near';
  if(status === '❌ Invalid plan') return 'avoid';
  if(status === '🚫 Unrealistic R:R') return 'avoid';
  if(status === 'Strong Fit' || status === 'Entry' || status === 'Ready') return 'ready';
  if(status === 'Possible Fit' || status === 'Near Entry' || status === 'Near Pullback' || status === 'Near Setup') return 'near';
  if(status === 'Avoid') return 'avoid';
  return 'watch';
}

function riskStatusLabel(riskStatus){
  return riskStatusLabelImpl(riskStatus);
}

function rrBandForValue(rrValue){
  return rrBandForValueImpl(rrValue);
}

function rrStateLabel(rrValue){
  return rrStateLabelImpl(rrValue, { numericOrNull });
}

function rrStateShortLabel(rrValue){
  return rrStateShortLabelImpl(rrValue, { numericOrNull });
}

function rrStateClass(rrValue){
  return rrStateClassImpl(rrValue, { numericOrNull });
}

function setupUiLabel(setupState){
  if(setupState === 'broken') return '💀 Dead';
  if(setupState === 'developing') return '🌱 Developing';
  if(setupState === 'entry') return '🚀 Entry';
  return '🧐 Monitor';
}

function setupUiClass(setupState){
  if(setupState === 'broken') return 'avoid';
  if(setupState === 'developing') return 'near';
  if(setupState === 'entry') return 'ready';
  return 'watch';
}

function planUiLabel(planValidity){
  if(planValidity === 'valid') return '✅ Plan valid';
  if(planValidity === 'needs_adjustment') return '🟠 Needs adjustment';
  if(planValidity === 'unrealistic_rr') return '🚫 Unrealistic R:R';
  return '❌ Invalid plan';
}

function planUiClass(planValidity){
  if(planValidity === 'valid') return 'ready';
  if(planValidity === 'needs_adjustment') return 'near';
  if(planValidity === 'unrealistic_rr') return 'avoid';
  return 'avoid';
}

// Re-declare the UI label helpers with explicit Unicode escapes so visible
// labels stay exact even if the source file previously picked up mojibake.
function setupUiLabel(setupState){
  if(setupState === 'broken') return '\uD83D\uDC80 Dead';
  if(setupState === 'developing') return '\uD83C\uDF31 Developing';
  if(setupState === 'entry') return '\uD83D\uDE80 Entry';
  return '\uD83E\uDDD0 Monitor';
}

function planUiLabel(planValidity){
  if(planValidity === 'valid') return '\u2705 Plan valid';
  if(planValidity === 'needs_adjustment') return '\uD83D\uDEE0\uFE0F Needs adjustment';
  if(planValidity === 'unrealistic_rr') return '\uD83D\uDEAB Unrealistic R:R';
  return '\u274C Invalid plan';
}

function getPlanUiState(record, options = {}){
  const item = record && typeof record === 'object' ? record : {};
  const displayedPlan = options.displayedPlan || deriveCurrentPlanState(
    item.plan && item.plan.entry,
    item.plan && item.plan.stop,
    item.plan && item.plan.firstTarget,
    item.marketData && item.marketData.currency
  );
  const effectivePlan = options.effectivePlan || {
    entry:displayedPlan.entry,
    stop:displayedPlan.stop,
    firstTarget:displayedPlan.target
  };
  // Default to the persisted plan-check state here so normalization and action
  // derivation do not recurse back through planCheckStateForRecord().
  const planCheckState = String(
    options.planCheckState != null
      ? options.planCheckState
      : (item.plan && item.plan.planValidationState || '')
  ).trim();
  const rewardRisk = displayedPlan.rewardRisk && typeof displayedPlan.rewardRisk === 'object' ? displayedPlan.rewardRisk : {};
  const rrRatio = actionableRrValueForPlan(displayedPlan);
  const setupState = options.setupState || '';
  const derivedStates = options.derivedStates || analysisDerivedStatesFromRecord(item);
  const positionSize = numericOrNull(displayedPlan.riskFit && displayedPlan.riskFit.position_size);
  const firstTargetTooClose = rewardRisk.valid
    && Number.isFinite(rewardRisk.rewardPerShare)
    && Number.isFinite(rewardRisk.riskPerShare)
    && rewardRisk.rewardPerShare < (1.5 * rewardRisk.riskPerShare);
  const planRealism = evaluatePlanRealism(item, {
    displayedPlan,
    derivedStates,
    displayStage:options.displayStage || 'Watch',
    setupState
  });
  let stateKey = 'invalid';

  if(setupState === 'broken'){
    stateKey = 'invalid';
  }else if(displayedPlan.status !== 'valid'){
    stateKey = 'invalid';
  }else if(!Number.isFinite(positionSize) || positionSize <= 0){
    stateKey = 'invalid';
  }else if(!Number.isFinite(rrRatio)){
    stateKey = 'invalid';
  }else if(rrRatio > 12){
    stateKey = 'unrealistic_rr';
  }else if(
    rrRatio > 8
    || firstTargetTooClose
    || ['needs_replan','pending_validation'].includes(planCheckState)
    || planRealism.optimistic_target_flag
    || planRealism.rr_realism === 'low'
  ){
    stateKey = 'needs_adjustment';
  }else{
    stateKey = 'valid';
  }

  return {
    state:stateKey,
    label:planUiLabel(stateKey),
    className:planUiClass(stateKey),
    rrRatio
  };
}

function getSetupUiState(record, options = {}){
  const item = record && typeof record === 'object' ? record : {};
  const derived = options.derivedStates || analysisDerivedStatesFromRecord(item);
  const displayStage = normalizeAnalysisVerdict(options.displayStage || displayStageForRecord(item));
  const planUiState = options.planUiState || null;
  const trendState = String(derived.trendState || '').toLowerCase();
  const pullbackZone = String(derived.pullbackZone || '').toLowerCase();
  const structureState = String(derived.structureState || '').toLowerCase();
  const stabilisationState = String(derived.stabilisationState || '').toLowerCase();
  const bounceState = String(derived.bounceState || '').toLowerCase();
  const price = numericOrNull(item.marketData && item.marketData.price);
  const ma50 = numericOrNull(item.marketData && item.marketData.ma50);
  const ma200 = numericOrNull(item.marketData && item.marketData.ma200);
  const brokenTrend = trendState === 'broken'
    || (Number.isFinite(price) && Number.isFinite(ma200) && price < ma200)
    || (Number.isFinite(ma50) && Number.isFinite(ma200) && ma50 < ma200);
  const validPullback = ['near_20ma','near_50ma'].includes(pullbackZone);
  const confirmedBounce = bounceState === 'confirmed';
  const improving = confirmedBounce || bounceState === 'attempt' || stabilisationState === 'clear' || stabilisationState === 'early';
  let stateKey = 'developing';

  if(brokenTrend || structureState === 'broken' || (!validPullback && displayStage === 'Avoid')){
    stateKey = 'broken';
  }else if(validPullback && confirmedBounce && (displayStage === 'Entry' || displayStage === 'Near Entry') && (!planUiState || planUiState.state === 'valid')){
    stateKey = 'entry';
  }else if(validPullback && (confirmedBounce || stabilisationState === 'clear' || displayStage === 'Near Entry' || displayStage === 'Watch')){
    stateKey = 'watch';
  }else if(validPullback && improving){
    stateKey = 'developing';
  }else if(displayStage === 'Avoid'){
    stateKey = 'broken';
  }

  const verdictBadge = primaryVerdictBadge(displayStage);

  return {
    state:stateKey,
    label:verdictBadge.label,
    className:verdictBadge.className,
    setupLabel:setupUiLabel(stateKey),
    setupClassName:setupUiClass(stateKey)
  };
}

function combinedStatusLabel(chartVerdict, riskStatus){
  const verdict = String(chartVerdict || 'Watch');
  if(!riskStatus) return verdict;
  return `${verdict} | ${riskStatusLabel(riskStatus)}`;
}

function bucketStatusForCard(card){
  const verdict = String(card && (card.chartVerdict || card.status) || 'Watch');
  const riskStatus = String(card && card.riskStatus || '');
  if(verdict === 'Entry' && riskStatus === 'too_wide') return 'Too Wide';
  return verdict;
}

function scoreClass(score){
  if(score > 10){
    if(score >= 75) return 's-hi';
    if(score >= 55) return 's-mid';
    return 's-low';
  }
  if(score >= 8) return 's-hi';
  if(score >= 5) return 's-mid';
  return 's-low';
}

function derivedStatesBaseScore(record, derivedStates = null){
  const item = record && typeof record === 'object' ? record : {};
  const derived = derivedStates || analysisDerivedStatesFromRecord(item);
  const trendState = String(derived.trendState || '').toLowerCase();
  const pullbackZone = String(derived.pullbackZone || '').toLowerCase();
  const structureState = String(derived.structureState || '').toLowerCase();
  const stabilisationState = String(derived.stabilisationState || '').toLowerCase();
  const bounceState = String(derived.bounceState || '').toLowerCase();
  const volumeState = String(derived.volumeState || '').toLowerCase();
  if(trendState === 'broken' || structureState === 'broken') return 0;
  let score = 0;
  if(trendState === 'strong') score += 3;
  else if(trendState === 'acceptable') score += 2;
  else if(trendState === 'weak') score += 1;
  if(pullbackZone === 'near_20ma' || pullbackZone === 'near_50ma') score += 2;
  if(structureState === 'intact') score += 2;
  else if(structureState && !['weakening','weak','broken'].includes(structureState)) score += 1;
  if(stabilisationState === 'clear') score += 1;
  else if(stabilisationState === 'early') score += 1;
  if(bounceState === 'confirmed') score += 1;
  else if(bounceState === 'attempt') score += 1;
  if(volumeState === 'supportive') score += 1;
  return clamp(Math.round(score), 0, 10);
}

function isTrueHardFailForRecord(record, derivedStates = null, options = {}){
  const item = record && typeof record === 'object' ? record : {};
  const derived = derivedStates || analysisDerivedStatesFromRecord(item);
  const marketData = item.marketData && typeof item.marketData === 'object' ? item.marketData : {};
  const price = numericOrNull(marketData.price);
  const ma50 = numericOrNull(marketData.ma50);
  const ma200 = numericOrNull(marketData.ma200);
  const displayedPlan = options.displayedPlan || deriveCurrentPlanState(
    item.plan && item.plan.entry,
    item.plan && item.plan.stop,
    item.plan && item.plan.firstTarget,
    marketData.currency
  );
  const trendBroken = String(derived.trendState || '').toLowerCase() === 'broken'
    || (Number.isFinite(price) && Number.isFinite(ma200) && price < ma200)
    || (Number.isFinite(ma50) && Number.isFinite(ma200) && ma50 < ma200);
  const brokenStructure = String(derived.structureState || '').toLowerCase() === 'broken';
  const invalidPlan = hasAnyPlanFields(item) && displayedPlan.status === 'invalid';
  const tooWidePlan = displayedPlan.status === 'valid'
    && (
      displayedPlan.riskFit.risk_status === 'too_wide'
      || numericOrNull(displayedPlan.riskFit.position_size) < 1
    );
  return trendBroken || brokenStructure || invalidPlan || tooWidePlan;
}

function computeBaseSetupScoreForRecord(record, options = {}){
  const safeRecord = record && typeof record === 'object' ? record : {};
  const manualChecks = safeRecord.review && safeRecord.review.manualReview && safeRecord.review.manualReview.checks && typeof safeRecord.review.manualReview.checks === 'object'
    ? safeRecord.review.manualReview.checks
    : null;
  if(manualChecks && Object.keys(manualChecks).length){
    return scoreAndStatusFromChecks(manualChecks).score;
  }
  const scanChecks = safeRecord.scan && safeRecord.scan.flags && safeRecord.scan.flags.checks && typeof safeRecord.scan.flags.checks === 'object'
    ? safeRecord.scan.flags.checks
    : null;
  if(scanChecks && Object.keys(scanChecks).length){
    return scoreAndStatusFromChecks(scanChecks).score;
  }
  const marketData = safeRecord.marketData && typeof safeRecord.marketData === 'object' ? safeRecord.marketData : null;
  if(marketData && [marketData.price, marketData.ma20, marketData.ma50, marketData.ma200].some(Number.isFinite)){
    return scoreMarketData({
      price:marketData.price,
      sma20:marketData.ma20,
      sma50:marketData.ma50,
      sma200:marketData.ma200,
      volume:marketData.volume,
      avgVolume30d:marketData.avgVolume,
      perf1m:marketData.perf1m,
      perf3m:marketData.perf3m,
      perf6m:marketData.perf6m,
      perfYtd:marketData.perfYtd,
      rsi14:marketData.rsi
    }).score;
  }
  const derivedStates = options.derivedStates || analysisDerivedStatesFromRecord(safeRecord);
  return derivedStatesBaseScore(safeRecord, derivedStates);
}

function fallbackBaseScoreForRecord(record, options = {}){
  const score = computeBaseSetupScoreForRecord(record, options);
  return Number.isFinite(score) ? score : null;
}

function canonicalBaseSetupScore(record, options = {}){
  const storedBaseScore = numericOrNull(record && record.setup && record.setup.baseScore);
  const storedRawScore = numericOrNull(record && record.setup && record.setup.rawScore);
  const fallbackScore = numericOrNull(fallbackBaseScoreForRecord(record, options));
  if(Number.isFinite(storedBaseScore)){
    if(storedBaseScore === 0 && Number.isFinite(fallbackScore) && fallbackScore > 0) return Math.max(0, Math.min(10, Math.round(fallbackScore)));
    return Math.max(0, Math.min(10, Math.round(storedBaseScore)));
  }
  if(Number.isFinite(storedRawScore)){
    if(storedRawScore === 0 && Number.isFinite(fallbackScore) && fallbackScore > 0) return Math.max(0, Math.min(10, Math.round(fallbackScore)));
    return Math.max(0, Math.min(10, Math.round(storedRawScore)));
  }
  if(Number.isFinite(fallbackScore)) return Math.max(0, Math.min(10, Math.round(fallbackScore)));
  return null;
}

function setupScoreTraceForRecord(record){
  const displayScore = numericOrNull(record && record.setup && record.setup.score);
  const setupScoreSource = String(record && record.setup && record.setup.scoreSource || '').trim();
  const setupScorePrevious = numericOrNull(record && record.setup && record.setup.scorePrevious);
  const setupScoreRecomputed = numericOrNull(record && record.setup && record.setup.scoreRecomputed);
  const setupScoreFallbackApplied = !!(record && record.setup && record.setup.scoreFallbackApplied);
  const setupScoreChangeReason = String(record && record.setup && record.setup.scoreChangeReason || '').trim();
  const reviewedScorePreserved = !!(record && record.setup && record.setup.reviewedScorePreserved);
  const refreshReplacedReviewedScore = !!(record && record.setup && record.setup.refreshReplacedReviewedScore);
  const canonicalBase = canonicalBaseSetupScore(record);
  const scanScore = numericOrNull(record && record.scan && record.scan.score);
  if(Number.isFinite(displayScore)){
    return {
      score:Math.max(0, Math.min(10, Math.round(displayScore))),
      source:setupScoreSource || 'setup.score',
      detail:setupScoreChangeReason || 'Displayed setup score from normalized setup state.',
      inputs:{
        setup_score:displayScore,
        base_score:canonicalBase,
        scan_score:scanScore,
        previous_score:setupScorePrevious,
        recomputed_score:setupScoreRecomputed,
        fallback_applied:setupScoreFallbackApplied ? 1 : 0,
        reviewed_score_preserved:reviewedScorePreserved ? 1 : 0,
        refresh_replaced_reviewed:refreshReplacedReviewedScore ? 1 : 0
      },
      sourceMeta:{
        score_source_used:setupScoreSource || 'setup.score',
        previous_stored_score:setupScorePrevious,
        recomputed_score:setupScoreRecomputed,
        fallback_applied:setupScoreFallbackApplied,
        score_change_reason:setupScoreChangeReason || 'No score change.',
        refresh_replaced_reviewed_state:refreshReplacedReviewedScore
      }
    };
  }
  if(Number.isFinite(canonicalBase)){
    return {
      score:Math.max(0, Math.min(10, Math.round(canonicalBase))),
      source:'setup.baseScore',
      detail:'Canonical base setup score used because no display score was stored.',
      inputs:{
        setup_score:displayScore,
        base_score:canonicalBase,
        scan_score:scanScore
      }
    };
  }
  if(Number.isFinite(scanScore)){
    return {
      score:Math.max(0, Math.min(10, Math.round(scanScore))),
      source:'scan.score',
      detail:'Scanner score fallback used because setup scores were unavailable.',
      inputs:{
        setup_score:displayScore,
        base_score:canonicalBase,
        scan_score:scanScore
      }
    };
  }
  return {
    score:0,
    source:'default_zero',
    detail:'No setup or scanner score available; defaulted to zero.',
    inputs:{
      setup_score:displayScore,
      base_score:canonicalBase,
      scan_score:scanScore
    }
  };
}

function setupScoreForRecord(record){
  return setupScoreTraceForRecord(record).score;
}

function setupScoreDisplayForRecord(record){
  return `Setup ${setupScoreForRecord(record)}/10`;
}

function rawSetupScoreForRecord(record){
  const baseScore = canonicalBaseSetupScore(record);
  if(Number.isFinite(baseScore)) return Math.max(0, Math.min(10, Math.round(baseScore)));
  const scanScore = numericOrNull(record && record.scan && record.scan.score);
  if(Number.isFinite(scanScore)) return Math.max(0, Math.min(10, Math.round(scanScore)));
  return 0;
}

function practicalSizeFlagForPlan(plan){
  const safePlan = plan && typeof plan === 'object' ? plan : {};
  const positionSize = numericOrNull(safePlan.positionSize);
  const riskPerShare = numericOrNull(safePlan.riskPerShare);
  const maxLoss = numericOrNull(safePlan.maxLoss) || currentMaxLoss();
  if(Number.isFinite(positionSize) && positionSize <= 1) return 'tiny_size';
  if(Number.isFinite(positionSize) && Number.isFinite(riskPerShare) && Number.isFinite(maxLoss) && maxLoss > 0){
    const deployedRisk = positionSize * riskPerShare;
    if(deployedRisk > 0 && deployedRisk < (maxLoss * 0.4)) return 'low_impact';
  }
  return '';
}

function downgradeVerdict(verdict, steps = 1){
  const ladder = ['Entry','Near Entry','Watch','Avoid'];
  const start = ladder.indexOf(normalizeAnalysisVerdict(verdict));
  if(start === -1) return 'Watch';
  return ladder[Math.min(ladder.length - 1, start + Math.max(0, steps))];
}

function evaluateSetupQualityAdjustments(record, options = {}){
  const rawRecord = record && typeof record === 'object' ? record : {};
  const derived = options.derivedStates || analysisDerivedStatesFromRecord(rawRecord);
  const displayedPlan = options.displayedPlan || deriveCurrentPlanState(
    rawRecord.plan && rawRecord.plan.entry,
    rawRecord.plan && rawRecord.plan.stop,
    rawRecord.plan && rawRecord.plan.firstTarget,
    rawRecord.marketData && rawRecord.marketData.currency
  );
  const baseVerdict = normalizeAnalysisVerdict(
    options.baseVerdict
    || options.displayStage
    || options.rawVerdict
    || baseVerdictForRecord(rawRecord, {includeRuntimeFallback:false})
  );
  const entry = numericOrNull(displayedPlan.entry);
  const stop = numericOrNull(displayedPlan.stop);
  const rrRatio = numericOrNull(displayedPlan.rewardRisk && displayedPlan.rewardRisk.rrRatio);
  const positionSize = numericOrNull(displayedPlan.riskFit && displayedPlan.riskFit.position_size);
  const stopPercent = Number.isFinite(entry) && Number.isFinite(stop) && entry > 0
    ? Math.abs(entry - stop) / entry
    : null;
  const trendState = String(derived.trendState || '').toLowerCase();
  const pullbackZone = String(derived.pullbackZone || '').toLowerCase();
  const structureState = String(derived.structureState || '').toLowerCase();
  const bounceState = String(derived.bounceState || '').toLowerCase();
  const stabilisationState = String(derived.stabilisationState || '').toLowerCase();
  const hostileMarket = isHostileMarketStatus((rawRecord.meta && rawRecord.meta.marketStatus) || state.marketStatus);
  const is50maSetup = pullbackZone === 'near_50ma';
  const lowControlSetup = Number.isFinite(stopPercent) && stopPercent > 0.045
    || (Number.isFinite(positionSize) && positionSize <= 2)
    || (is50maSetup && Number.isFinite(rrRatio) && rrRatio < 1.75);
  const tooWideForQualityPullback = Number.isFinite(stopPercent) && stopPercent > 0.05
    || (Number.isFinite(positionSize) && positionSize < 2)
    || (is50maSetup && Number.isFinite(rrRatio) && rrRatio < 1.6 && bounceState !== 'confirmed');
  const strongBounceConfirmation = bounceState === 'confirmed';
  const strongStabilisation = stabilisationState === 'clear' && bounceState === 'confirmed';
  const structureClearlyStrong = trendState === 'strong' && !['weak','weakening','broken'].includes(structureState);
  const strongEnoughToSurviveWeakRegime = is50maSetup
    && structureClearlyStrong
    && strongBounceConfirmation
    && strongStabilisation
    && Number.isFinite(stopPercent) && stopPercent < 0.02
    && Number.isFinite(positionSize) && positionSize > 2
    && Number.isFinite(rrRatio) && rrRatio >= 1.75
    && !lowControlSetup
    && !tooWideForQualityPullback;
  const borderlineWeakMarketConfirmation = bounceState === 'attempt'
    || bounceState === 'none'
    || stabilisationState !== 'clear'
    || (stabilisationState === 'clear' && bounceState !== 'confirmed');
  const weakRegimePenalty = hostileMarket
    && is50maSetup
    && (
      tooWideForQualityPullback
      || lowControlSetup
      || borderlineWeakMarketConfirmation
      || (baseVerdict === 'Entry' && !strongEnoughToSurviveWeakRegime)
    );
  const widthPenalty = tooWideForQualityPullback ? 2 : (lowControlSetup ? 1 : 0);
  const controlQuality = tooWideForQualityPullback ? 'Loose' : (lowControlSetup ? 'Moderate' : 'Tight');
  const capitalEfficiency = tooWideForQualityPullback || (Number.isFinite(positionSize) && positionSize <= 2) || (Number.isFinite(rrRatio) && rrRatio < 1.75)
    ? 'Inefficient'
    : (lowControlSetup ? 'Acceptable' : 'Efficient');
  const planTechnicallyValid = displayedPlan.status === 'valid' && Number.isFinite(positionSize) && positionSize > 0;
  const adjustmentReasons = [];
  if(Number.isFinite(stopPercent) && stopPercent > 0.045) adjustmentReasons.push('Wide stop for account size');
  if(Number.isFinite(positionSize) && positionSize <= 2) adjustmentReasons.push(`${positionSize} shares at max risk`);
  if(weakRegimePenalty) adjustmentReasons.push('50MA setup in weak market needs stronger confirmation');
  if(lowControlSetup && planTechnicallyValid && !adjustmentReasons.includes('Technically valid plan, but lower control than ideal')) adjustmentReasons.push('Technically valid plan, but lower control than ideal');
  return {
    stopPercent,
    lowControlSetup:!!lowControlSetup,
    tooWideForQualityPullback:!!tooWideForQualityPullback,
    weakRegimePenalty:!!weakRegimePenalty,
    widthPenalty,
    capitalEfficiency,
    controlQuality,
    verdictAdjustment:widthPenalty + (weakRegimePenalty ? 1 : 0),
    adjustmentReasons:[...new Set(adjustmentReasons)].slice(0, 4)
  };
}

// LEGACY RESOLVER BLOCK DISABLED
// Shadowed by the canonical resolver block later in app.js.
function legacyResolveFinalStateContract(record, options = {}){
  const item = normalizeTickerRecord(record);
  const derivedStates = options.derivedStates || analysisDerivedStatesFromRecord(item);
  const effectivePlan = options.effectivePlan || effectivePlanForRecord(item, {allowScannerFallback:true});
  const displayedPlan = applySetupConfirmationPlanGate(item, options.displayedPlan || deriveCurrentPlanState(
    effectivePlan.entry,
    effectivePlan.stop,
    effectivePlan.firstTarget,
    item.marketData && item.marketData.currency
  ), derivedStates);
  const planCheckState = options.planCheckState || planCheckStateForRecord(item, {effectivePlan, displayedPlan});
  const finalVerdict = normalizeAnalysisVerdict(options.finalVerdict || displayStageForRecord(item));
  const rrResolution = options.rrResolution || resolveScannerStateWithTrace(item, {derivedStates});
  const qualityAdjustments = options.qualityAdjustments || evaluateSetupQualityAdjustments(item, {
    displayedPlan,
    derivedStates,
    displayStage:finalVerdict,
    baseVerdict:finalVerdict
  });
  const warningState = options.warningState || warningStateFromInputs(item, null, derivedStates);
  const planUiState = options.planUiState || getPlanUiState(item, {displayedPlan, effectivePlan, planCheckState, derivedStates, displayStage:finalVerdict});
  const setupUiState = options.setupUiState || getSetupUiState(item, {displayStage:finalVerdict, derivedStates, planUiState});
  const avoidSubtype = options.avoidSubtype || avoidSubtypeForRecord(item, {derivedStates, displayedPlan, qualityAdjustments, finalVerdict});
  const deadCheck = options.deadCheck || isTerminalDeadSetup(item, {derivedStates, displayedPlan});
  const baseEmoji = options.emojiPresentation || resolveEmojiPresentation(item, {
    context:options.context || 'generic',
    finalVerdict,
    derivedStates,
    displayedPlan,
    qualityAdjustments,
    warningState,
    planUiState,
    setupUiState,
    avoidSubtype,
    deadCheck
  });
  const structureState = String(derivedStates.structureState || '').toLowerCase();
  const trendState = String(derivedStates.trendState || '').toLowerCase();
  const bounceState = String(derivedStates.bounceState || '').toLowerCase();
  const volumeState = String(derivedStates.volumeState || '').toLowerCase();
  const marketWeak = !!(
    qualityAdjustments.weakRegimePenalty
    || item.setup.marketCaution
    || isHostileMarketStatus((item.meta && item.meta.marketStatus) || state.marketStatus)
  );
  const positionSize = numericOrNull(displayedPlan.riskFit && displayedPlan.riskFit.position_size);
  const riskStatus = String(displayedPlan.riskFit && displayedPlan.riskFit.risk_status || '').toLowerCase();
  const affordability = String(displayedPlan.affordability || '').toLowerCase();
  const tradeability = String(displayedPlan.tradeability || '').toLowerCase();
  const lowControl = !!(qualityAdjustments.lowControlSetup || qualityAdjustments.tooWideForQualityPullback);
  const hardStructureBroken = deadCheck.dead || structureState === 'broken' || trendState === 'broken';
  const planInvalid = planUiState.state === 'invalid';
  const planMissing = planUiState.state === 'missing';
  const planNeedsAdjustment = planUiState.state === 'needs_adjustment';
  const planUnrealistic = planUiState.state === 'unrealistic_rr';
  const zeroShares = !Number.isFinite(positionSize) || positionSize < 1;
  const riskTooWide = riskStatus === 'too_wide' || (zeroShares && displayedPlan.status === 'valid');
  const capitalBlocked = executionCapitalBlocked(displayedPlan);
  const capitalHeavy = executionCapitalHeavy(displayedPlan);
  const bounceUnconfirmed = ['none','unconfirmed','attempt','early'].includes(bounceState);
  const weakVolume = volumeState === 'weak';
  const rrConfidenceLabel = planInvalid || planMissing || planUnrealistic
    ? 'Invalid plan'
    : (rrResolution.rr_label || 'Low confidence');
  const planStatusLabel = planUiState.label || 'Invalid plan';
  let primaryState = String(baseEmoji.primaryState || 'monitor').toLowerCase();
  let primaryEmoji = String(baseEmoji.primaryEmoji || '🧐');
  let primaryLabel = String(baseEmoji.primaryLabel || 'Monitor');
  let badgeClass = String(baseEmoji.badgeClass || 'watch');
  if(hardStructureBroken && primaryState !== 'dead'){
    primaryState = 'dead';
    primaryEmoji = '💀';
    primaryLabel = 'Dead';
    badgeClass = 'avoid';
  }
  const invalidAvoidGuard = !hardStructureBroken
    && (planUiState.state === 'invalid' || planUiState.state === 'missing')
    && (tradeability === 'avoid' || finalVerdict === 'Avoid' || String(rrResolution.rawResolverVerdict || '').toLowerCase() === 'avoid');
  if(invalidAvoidGuard && primaryState !== 'inactive'){
    primaryState = 'inactive';
    primaryEmoji = '⛔';
    primaryLabel = 'Needs rebuild';
    badgeClass = 'avoid';
  }
  const effectivePlanStatusKey = ['dead','inactive'].includes(primaryState) ? 'rebuild_required' : planUiState.state;
  const effectivePlanStatusLabel = ['dead','inactive'].includes(primaryState) ? 'Rebuild required' : planStatusLabel;
  const weakeningButAlive = ['weak','weakening','developing_loose'].includes(structureState)
    || ['none','unconfirmed','attempt','early'].includes(bounceState);
  const structuralPresentation = (() => {
    if(hardStructureBroken) return {state:'dead', emoji:'ðŸ’€', label:'Dead', badgeClass:'avoid'};
    if(finalVerdict === 'Entry') return {state:'entry', emoji:'ðŸš€', label:'Entry', badgeClass:'ready'};
    if(finalVerdict === 'Near Entry') return {state:'near_entry', emoji:'ðŸŽ¯', label:'Near Entry', badgeClass:'near'};
    if(setupUiState.state === 'developing' || weakeningButAlive || finalVerdict === 'Avoid'){
      return {state:'developing', emoji:'ðŸŒ±', label:'Developing', badgeClass:'near'};
    }
    return {state:'monitor', emoji:'ðŸ§', label:'Monitor', badgeClass:'watch'};
  })();
  primaryState = structuralPresentation.state;
  primaryEmoji = structuralPresentation.emoji;
  primaryLabel = structuralPresentation.label;
  badgeClass = structuralPresentation.badgeClass;
  if(primaryState === 'dead') primaryEmoji = '\uD83D\uDC80';
  else if(primaryState === 'entry') primaryEmoji = '\uD83D\uDE80';
  else if(primaryState === 'near_entry') primaryEmoji = '\uD83C\uDFAF';
  else if(primaryState === 'developing') primaryEmoji = '\uD83C\uDF31';
  else if(primaryState === 'monitor') primaryEmoji = '\uD83E\uDDD0';
  const contractPlanStatusKey = primaryState === 'dead' ? 'rebuild_required' : planUiState.state;
  const contractPlanStatusLabel = primaryState === 'dead' ? 'Rebuild required' : planStatusLabel;

  const reasonParts = [];
  const addReason = value => {
    const text = String(value || '').trim();
    if(text && !reasonParts.includes(text)) reasonParts.push(text);
  };
  let blockerCode = '';
  let blockerReason = '';
  let actionStateKey = 'hold_confirmation';
  let actionLabel = 'Hold for confirmation';
  let actionShortLabel = 'Hold for confirmation';
  let actionTone = 'watch';
  let nextPossibleState = primaryState === 'entry' ? '🚀 Entry' : '🧰 Rebuild';
  let remapReason = rrResolution.remapReason || '';

  if(hardStructureBroken){
    actionStateKey = 'rebuild_setup';
    blockerCode = deadCheck.reasonCode || (trendState === 'broken' ? 'broken_trend' : 'broken_structure');
    blockerReason = structureState === 'broken' ? 'Structure is broken' : 'Trend is invalidated';
    actionLabel = 'Rebuild setup';
    actionShortLabel = 'Rebuild setup';
    actionTone = 'danger';
    nextPossibleState = 'None';
    addReason(blockerReason);
  }else if(item.plan && item.plan.invalidatedState){
    actionStateKey = 'hold_confirmation';
    blockerCode = 'setup_invalidated';
    blockerReason = 'Previous trigger invalidated; wait for a fresh setup';
    actionLabel = 'Wait for a fresh setup';
    actionShortLabel = 'Wait for reset';
    actionTone = 'warning';
    nextPossibleState = '🧐 Monitor';
    addReason(blockerReason);
  }else if(item.plan && item.plan.missedState){
    actionStateKey = 'hold_confirmation';
    blockerCode = 'missed_setup';
    blockerReason = 'Missed entry window';
    actionLabel = 'Missed move - wait for a new setup';
    actionShortLabel = actionLabel;
    actionTone = 'warning';
    nextPossibleState = '🧐 Monitor';
    addReason(blockerReason);
  }else if(planInvalid){
    actionStateKey = 'recalculate_plan';
    blockerCode = 'plan_invalid';
    blockerReason = 'Invalid plan';
    actionLabel = 'Hold for entry conditions';
    actionShortLabel = 'Hold for entry conditions';
    actionTone = 'warning';
    nextPossibleState = invalidAvoidGuard ? '🧰 Rebuild' : '🧐 Monitor';
    addReason(blockerReason);
  }else if(planMissing){
    actionStateKey = 'recalculate_plan';
    blockerCode = 'plan_missing';
    blockerReason = 'Plan not defined';
    actionLabel = 'Hold for entry conditions';
    actionShortLabel = 'Hold for entry conditions';
    actionTone = 'warning';
    nextPossibleState = invalidAvoidGuard ? '🧰 Rebuild' : '🧐 Monitor';
    addReason(blockerReason);
  }else if(riskTooWide){
    actionStateKey = 'recalculate_plan';
    blockerCode = 'risk_too_wide';
    blockerReason = 'Risk too wide for account size';
    actionLabel = 'Hold for entry conditions';
    actionShortLabel = 'Hold for entry conditions';
    actionTone = 'warning';
    nextPossibleState = '🧐 Monitor';
    addReason(blockerReason);
  }else if(capitalBlocked || capitalHeavy){
    actionStateKey = 'recalculate_plan';
    blockerCode = capitalBlocked ? 'capital_blocked' : 'capital_heavy';
    blockerReason = capitalConstraintReasonForPlan(displayedPlan) || 'Capital usage is heavy for this account size.';
    actionLabel = 'Hold for entry conditions';
    actionShortLabel = 'Hold for entry conditions';
    actionTone = 'warning';
    nextPossibleState = '🧐 Monitor';
    addReason(blockerReason);
  }else if(planUnrealistic){
    actionStateKey = 'recalculate_plan';
    blockerCode = 'rr_unrealistic';
    blockerReason = 'Target is too optimistic for current structure';
    actionLabel = 'Hold for entry conditions';
    actionShortLabel = 'Hold for entry conditions';
    actionTone = 'warning';
    nextPossibleState = '🧐 Monitor';
    addReason(blockerReason);
  }else if(planNeedsAdjustment){
    actionStateKey = 'recalculate_plan';
    blockerCode = 'plan_adjustment';
    blockerReason = 'Plan needs adjustment';
    actionLabel = 'Hold for entry conditions';
    actionShortLabel = 'Hold for entry conditions';
    actionTone = 'warning';
    nextPossibleState = '🧐 Monitor';
    addReason(blockerReason);
  }else if(bounceUnconfirmed){
    actionStateKey = 'hold_confirmation';
    blockerCode = 'bounce_not_confirmed';
    blockerReason = 'Bounce not confirmed';
    actionLabel = 'Hold for confirmation';
    actionShortLabel = 'Hold for confirmation';
    actionTone = 'warning';
    nextPossibleState = '🎯 Near Entry';
    addReason(blockerReason);
  }else if(weakVolume){
    actionStateKey = 'hold_confirmation';
    blockerCode = 'weak_volume';
    blockerReason = 'Weak volume';
    actionLabel = 'Hold for confirmation';
    actionShortLabel = 'Hold for confirmation';
    actionTone = 'warning-soft';
    nextPossibleState = '🎯 Near Entry';
    addReason(blockerReason);
  }else if(marketWeak){
    actionStateKey = 'hold_confirmation';
    blockerCode = 'weak_market';
    blockerReason = 'Weak market';
    actionLabel = 'Hold for confirmation';
    actionShortLabel = 'Hold for confirmation';
    actionTone = 'warning';
    nextPossibleState = '🎯 Near Entry';
    addReason(blockerReason);
  }else if(lowControl){
    actionStateKey = 'hold_confirmation';
    blockerCode = 'weak_control';
    blockerReason = 'Weak control';
    actionLabel = 'Hold for confirmation';
    actionShortLabel = 'Hold for confirmation';
    actionTone = 'warning-soft';
    nextPossibleState = '🎯 Near Entry';
    addReason(blockerReason);
  }else if(finalVerdict === 'Entry'){
    actionStateKey = 'ready_to_act';
    blockerCode = 'ready';
    blockerReason = 'Trigger conditions are met';
    actionLabel = 'Ready to act';
    actionShortLabel = 'Ready to act';
    actionTone = 'success';
    nextPossibleState = '🚀 Entry';
  }else if(finalVerdict === 'Near Entry'){
    actionStateKey = 'hold_confirmation';
    blockerCode = 'near_trigger';
    blockerReason = 'Close to trigger';
    actionLabel = 'Hold for confirmation';
    actionShortLabel = 'Hold for confirmation';
    actionTone = 'warning';
    nextPossibleState = '🚀 Entry';
  }

  if(actionStateKey === 'rebuild_setup'){
    nextPossibleState = 'None';
  }else if(actionStateKey === 'recalculate_plan'){
    nextPossibleState = '🟡 Monitor';
  }else if(actionStateKey === 'ready_to_act'){
    nextPossibleState = 'ðŸš€ Entry';
  }else if(actionStateKey === 'hold_confirmation' && blockerCode !== 'missed_setup'){
    nextPossibleState = 'ðŸŽ¯ Near Entry';
  }

  if(['weak','weakening'].includes(structureState) && !hardStructureBroken) addReason('Weak structure');
  if(marketWeak) addReason('Weak market');
  if(weakVolume) addReason('Weak volume');
  if(lowControl && !planInvalid) addReason('Weak control');
  if(planNeedsAdjustment && !planInvalid) addReason('Plan needs adjustment');
  if(planUnrealistic && !planInvalid) addReason('Target is too optimistic');
  if(rrConfidenceLabel === 'Low confidence' && !planInvalid && !planUnrealistic) addReason('Low-confidence RR');

  const reasonSummary = reasonParts.slice(0, 2).join(' + ');
  const nonActionableButAlive = !hardStructureBroken
    && ['recalculate_plan','hold_confirmation'].includes(actionStateKey);

  if(!remapReason && rrResolution.rawResolverVerdict === 'Avoid' && ['developing','monitor'].includes(primaryState)){
    remapReason = hardStructureBroken ? '' : 'weak but still technically alive';
  }

  return {
    finalVerdict,
    rawResolverVerdict:rrResolution.rawResolverVerdict || rrResolution.status || finalVerdict,
    finalDisplayState:primaryLabel,
    primaryState,
    structuralState:primaryState,
    structuralStateLabel:primaryLabel,
    badgeText:`${primaryEmoji} ${primaryLabel}`,
    badgeClass,
    modifiers:baseEmoji.modifiers || [],
    marketRegimeLabel:marketWeak ? 'Weak market' : 'Supportive',
    marketRegimeWeak:marketWeak,
    planStatusLabel:contractPlanStatusLabel,
    planStatusKey:contractPlanStatusKey,
    rrConfidenceLabel,
    tradeabilityLabel:finalVerdict || 'Watch',
    tradeabilityVerdict:finalVerdict || 'Watch',
    tradeabilityVerdictLabel:finalVerdict || 'Watch',
    actionStateKey,
    actionStateLabel:actionLabel,
    actionLabel,
    actionShortLabel,
    actionTone,
    blockerCode,
    blockerReason:blockerReason || reasonParts[0] || '',
    reasonParts,
    reasonSummary,
    nextPossibleState,
    remapReason,
    terminal:primaryState === 'dead',
    nonActionableButAlive
  };
}

function evaluatePlanRealism(record, options = {}){
  const item = record && typeof record === 'object' ? record : {};
  const derivedStates = options.derivedStates || analysisDerivedStatesFromRecord(item);
  const displayedPlan = options.displayedPlan || deriveCurrentPlanState(
    item.plan && item.plan.entry,
    item.plan && item.plan.stop,
    item.plan && item.plan.firstTarget,
    item.marketData && item.marketData.currency
  );
  const displayStage = normalizeAnalysisVerdict(options.displayStage || item.scan && item.scan.verdict || item.review && item.review.savedVerdict || 'Watch');
  const qualityAdjustments = options.qualityAdjustments || evaluateSetupQualityAdjustments(item, {
    displayedPlan,
    derivedStates,
    displayStage,
    baseVerdict:displayStage
  });
  const setupUiState = options.setupUiState || (options.setupState ? {state:options.setupState} : getSetupUiState(item, {displayStage}));
  const rawRr = actionableRrValueForPlan(displayedPlan);
  const structureState = String(derivedStates.structureState || '').toLowerCase();
  const bounceState = String(derivedStates.bounceState || '').toLowerCase();
  const volumeState = String(derivedStates.volumeState || '').toLowerCase();
  const pullbackZone = String(derivedStates.pullbackZone || '').toLowerCase();
  const trendState = String(derivedStates.trendState || '').toLowerCase();
  const setupState = String(setupUiState && setupUiState.state || '').toLowerCase();
  const hostileMarket = !!(qualityAdjustments.weakRegimePenalty || isHostileMarketStatus((item.meta && item.meta.marketStatus) || state.marketStatus));
  const weakStructure = ['weak','weakening','broken'].includes(structureState);
  const looseStructure = ['developing_loose'].includes(String(options.structureQuality || ''));
  const developingSetup = setupState === 'developing' || pullbackZone === 'unknown' || trendState === 'mixed';
  const bounceUnclear = ['none','unconfirmed','attempt','early'].includes(bounceState);
  const weakVolume = volumeState === 'weak';
  const lowControl = !!(qualityAdjustments.lowControlSetup || qualityAdjustments.tooWideForQualityPullback);
  const optimisticTargetFlag = Number.isFinite(rawRr) && rawRr > 3 && (weakStructure || looseStructure || developingSetup || bounceUnclear || weakVolume || hostileMarket || lowControl);
  const reasons = [];
  const pushReason = value => {
    if(value && !reasons.includes(value)) reasons.push(value);
  };

  let rrRealism = 'invalid';
  let rrRealismLabel = 'Unavailable';
  let credibleTargetAssessment = 'No usable plan yet';
  let credibleRr = null;

  if(!Number.isFinite(rawRr)){
    pushReason('Plan is mathematically incomplete or invalid.');
  }else{
    credibleRr = rawRr;
    if(weakStructure || (optimisticTargetFlag && (bounceUnclear || hostileMarket || lowControl || weakVolume || developingSetup))){
      rrRealism = 'low';
      rrRealismLabel = 'Low confidence';
      credibleRr = Math.min(rawRr, 2.5);
      credibleTargetAssessment = optimisticTargetFlag ? 'Optimistic target for current structure' : 'Low-confidence target';
    }else if(looseStructure || developingSetup || bounceUnclear || weakVolume || hostileMarket || lowControl){
      rrRealism = 'conditional';
      rrRealismLabel = 'Conditional';
      credibleRr = Math.min(rawRr, 3);
      credibleTargetAssessment = 'Needs better confirmation before trusting full target';
    }else{
      rrRealism = 'high';
      rrRealismLabel = 'High confidence';
      credibleTargetAssessment = 'Target is realistic for current structure';
    }
  }

  if(optimisticTargetFlag) pushReason('Raw RR is high, but target is optimistic for current structure.');
  if(weakStructure || looseStructure) pushReason('Weak structure reduces confidence in distant target.');
  if(developingSetup && !weakStructure) pushReason('Developing structure does not yet justify a full recovery target.');
  if(bounceUnclear) pushReason('Wait for better confirmation before trusting full target.');
  if(weakVolume) pushReason('Weak volume lowers confidence in target follow-through.');
  if(hostileMarket) pushReason('Weak market conditions reduce target credibility.');
  if(lowControl) pushReason('Lower control reduces confidence in the full target.');

  const summary = reasons[0]
    || (rrRealism === 'high'
      ? 'Target realism is aligned with current structure.'
      : 'Plan is mathematically valid but lower confidence.');

  return {
    raw_rr:rawRr,
    rr_realism:rrRealism,
    rr_realism_label:rrRealismLabel,
    optimistic_target_flag:!!optimisticTargetFlag,
    plan_realism_reason:summary,
    credible_target_assessment:credibleTargetAssessment,
    credible_rr:credibleRr,
    reasons:reasons.slice(0, 4)
  };
}

function structureLabelForRecord(record, derivedStates = null, options = {}){
  const rawRecord = record && typeof record === 'object' ? record : {};
  const derived = derivedStates || analysisDerivedStatesFromRecord(rawRecord);
  const displayStage = normalizeAnalysisVerdict(options.displayStage || '');
  const trendState = String(derived.trendState || '').toLowerCase();
  const pullbackZone = String(derived.pullbackZone || '').toLowerCase();
  const structureState = String(derived.structureState || '').toLowerCase();
  const stabilisationState = String(derived.stabilisationState || '').toLowerCase();
  const bounceState = String(derived.bounceState || '').toLowerCase();
  const price = numericOrNull(rawRecord.marketData && rawRecord.marketData.price);
  const ma50 = numericOrNull(rawRecord.marketData && rawRecord.marketData.ma50);
  const ma200 = numericOrNull(rawRecord.marketData && rawRecord.marketData.ma200);
  const brokenTrend = trendState === 'broken'
    || (Number.isFinite(price) && Number.isFinite(ma200) && price < ma200)
    || (Number.isFinite(ma50) && Number.isFinite(ma200) && ma50 < ma200);
  const brokenStructure = structureState === 'broken';
  const constructiveDeveloping = ['near_20ma','near_50ma'].includes(pullbackZone)
    && !brokenTrend
    && !brokenStructure
    && (bounceState === 'confirmed' || stabilisationState === 'clear' || stabilisationState === 'early');

  if(brokenTrend || brokenStructure) return 'Broken structure';
  if(displayStage !== 'Avoid' && ['weak','weakening'].includes(structureState) && constructiveDeveloping) return 'Developing structure';
  if(['weak','weakening'].includes(structureState)) return 'Weak structure';
  return '';
}

function warningStateFromInputs(record, analysis = null, derivedStates = null){
  const rawRecord = record && typeof record === 'object' ? record : {};
  const safeAnalysis = analysis && typeof analysis === 'object' ? analysis : null;
  const derived = derivedStates || analysisDerivedStatesFromRecord(rawRecord);
  const plan = rawRecord.plan && typeof rawRecord.plan === 'object' ? rawRecord.plan : {};
  const seedVerdict = resolverSeedVerdictForRecord(rawRecord);
  const qualityAdjustments = evaluateSetupQualityAdjustments(rawRecord, {
    derivedStates:derived,
    baseVerdict:seedVerdict,
    displayStage:seedVerdict
  });
  const rrRatio = numericOrNull(plan.plannedRR);
  const structureState = String(derived.structureState || '').toLowerCase();
  const stabilisationState = String(derived.stabilisationState || '').toLowerCase();
  const bounceState = String(derived.bounceState || '').toLowerCase();
  const volumeState = String(derived.volumeState || '').toLowerCase();
  const hostileMarket = isHostileMarketStatus((rawRecord.meta && rawRecord.meta.marketStatus) || state.marketStatus);
  const practicalSizeFlag = practicalSizeFlagForPlan(plan);
  const cautionReasons = [];
  const pushReason = reason => {
    if(reason && !cautionReasons.includes(reason)) cautionReasons.push(reason);
  };

  const displayStage = seedVerdict;
  const structureLabel = structureLabelForRecord(rawRecord, derived, {displayStage});
  if(structureLabel) pushReason(structureLabel);
  if(bounceState !== 'confirmed') pushReason(bounceState === 'none' ? 'No bounce' : 'Bounce unconfirmed');
  if(stabilisationState === 'early') pushReason('Early stabilisation only');
  if(volumeState === 'weak') pushReason('Weak volume');
  if(hostileMarket) pushReason('Hostile market');
  if(practicalSizeFlag === 'tiny_size') pushReason('Tiny size');
  if(practicalSizeFlag === 'low_impact') pushReason('Low impact');
  if(qualityAdjustments.lowControlSetup) pushReason('Lower control setup');
  if(qualityAdjustments.weakRegimePenalty) pushReason('Weak market needs stronger confirmation');
  if(Number.isFinite(rrRatio) && rrRatio >= 3 && (bounceState !== 'confirmed' || ['weak','weakening','broken'].includes(structureState))){
    pushReason('Paper R:R looks better than confirmation');
  }
  if(safeAnalysis && normalizeAnalysisVerdict(safeAnalysis.final_verdict || safeAnalysis.verdict) !== 'Avoid' && hostileMarket && stabilisationState === 'early'){
    pushReason('Borderline setup in weak market');
  }

  const majorCaution = ['weak','weakening','broken'].includes(structureState) || practicalSizeFlag === 'tiny_size';
  return {
    showWarning:majorCaution || cautionReasons.length >= 2,
    reasons:cautionReasons.slice(0, 4)
  };
}

function deriveDisplaySetupScore(record, options = {}){
  const rawRecord = record && typeof record === 'object' ? record : {};
  const derived = options.derivedStates || analysisDerivedStatesFromRecord(rawRecord);
  const warningState = options.warningState || warningStateFromInputs(rawRecord, options.analysis || null, derived);
  const rawScore = rawSetupScoreForRecord(rawRecord);
  const displayStage = normalizeAnalysisVerdict(options.displayStage || resolverSeedVerdictForRecord(rawRecord));
  const qualityAdjustments = options.qualityAdjustments || evaluateSetupQualityAdjustments(rawRecord, {
    derivedStates:derived,
    baseVerdict:displayStage,
    displayStage
  });
  const hardFail = isTrueHardFailForRecord(rawRecord, derived, {displayedPlan:options.displayedPlan});
  const structureState = String(derived.structureState || '').toLowerCase();
  const stabilisationState = String(derived.stabilisationState || '').toLowerCase();
  const bounceState = String(derived.bounceState || '').toLowerCase();
  const volumeState = String(derived.volumeState || '').toLowerCase();
  const hostileMarket = isHostileMarketStatus((rawRecord.meta && rawRecord.meta.marketStatus) || state.marketStatus);
  const practicalSizeFlag = practicalSizeFlagForPlan(rawRecord.plan);
  const noBounce = bounceState === 'none';
  const confirmedBounce = bounceState === 'confirmed';
  let adjusted = rawScore;

  if(warningState.showWarning) adjusted -= 1;
  if(volumeState === 'weak') adjusted -= 1;
  if(hostileMarket) adjusted -= 0.5;
  if(structureState === 'broken') adjusted -= 4;
  if(!confirmedBounce && stabilisationState === 'early') adjusted -= 1;
  if(confirmedBounce) adjusted += 1;
  if(practicalSizeFlag === 'tiny_size') adjusted -= 2;
  if(practicalSizeFlag === 'low_impact') adjusted -= 1;
  if(qualityAdjustments.widthPenalty > 0) adjusted -= qualityAdjustments.widthPenalty;
  if(qualityAdjustments.weakRegimePenalty) adjusted -= 1;

  if(warningState.showWarning) adjusted = Math.min(adjusted, 9);
  if(volumeState === 'weak') adjusted = Math.min(adjusted, 8);
  if(hostileMarket) adjusted = Math.min(adjusted, 8);
  if(volumeState === 'weak' && hostileMarket) adjusted = Math.min(adjusted, 7);
  if(practicalSizeFlag === 'tiny_size') adjusted = Math.min(adjusted, 7);
  if(qualityAdjustments.widthPenalty >= 1) adjusted = Math.min(adjusted, 7);
  if(qualityAdjustments.widthPenalty >= 2) adjusted = Math.min(adjusted, 6);
  if(qualityAdjustments.weakRegimePenalty) adjusted = Math.min(adjusted, 6);
  if(noBounce && !confirmedBounce) adjusted = Math.min(adjusted, 4);
  if(confirmedBounce){
    adjusted = Math.max(adjusted, 5);
  }

  const rounded = Math.max(0, Math.min(10, Math.round(adjusted)));
  if(displayStage === 'Entry') return Math.max(8, Math.min(10, rounded));
  if(displayStage === 'Near Entry') return Math.max(6, Math.min(7, rounded));
  if(displayStage === 'Watch') return Math.max(4, Math.min(5, rounded));
  if(displayStage === 'Avoid') return hardFail ? Math.max(0, Math.min(3, rounded)) : Math.max(2, Math.min(4, rounded));
  return rounded;
}

function convictionTierForRecord(record, options = {}){
  const rawRecord = record && typeof record === 'object' ? record : {};
  const derived = options.derivedStates || analysisDerivedStatesFromRecord(rawRecord);
  const warningState = options.warningState || warningStateFromInputs(rawRecord, options.analysis || null, derived);
  const displayStage = normalizeAnalysisVerdict(options.displayStage || resolverSeedVerdictForRecord(rawRecord));
  const qualityAdjustments = options.qualityAdjustments || evaluateSetupQualityAdjustments(rawRecord, {
    derivedStates:derived,
    displayStage,
    baseVerdict:displayStage
  });
  const displayScore = Number.isFinite(options.displayScore) ? options.displayScore : deriveDisplaySetupScore(rawRecord, {derivedStates:derived, warningState, analysis:options.analysis || null});
  const structureState = String(derived.structureState || '').toLowerCase();
  const volumeState = String(derived.volumeState || '').toLowerCase();
  const hostileMarket = isHostileMarketStatus((rawRecord.meta && rawRecord.meta.marketStatus) || state.marketStatus);
  const practicalSizeFlag = practicalSizeFlagForPlan(rawRecord.plan);

  if(displayStage === 'Avoid' || structureState === 'broken') return 'low_conviction';
  if(
    displayScore >= 8
    && !warningState.showWarning
    && volumeState !== 'weak'
    && !hostileMarket
    && !practicalSizeFlag
    && !qualityAdjustments.lowControlSetup
    && !qualityAdjustments.tooWideForQualityPullback
    && !qualityAdjustments.weakRegimePenalty
  ) return 'premium';
  if(
    displayScore >= 6
    && practicalSizeFlag !== 'tiny_size'
    && structureState !== 'weak'
    && structureState !== 'weakening'
    && !qualityAdjustments.tooWideForQualityPullback
    && qualityAdjustments.controlQuality !== 'Loose'
  ) return 'good';
  if(displayScore >= 4) return 'cautious';
  return 'low_conviction';
}

function convictionTierLabel(tier){
  if(tier === 'premium') return 'Premium';
  if(tier === 'good') return 'Good';
  if(tier === 'cautious') return 'Cautious';
  return 'Low Conviction';
}

function savedReviewVerdictForRecord(record){
  const item = record && typeof record === 'object' ? record : {};
  const review = item.review && typeof item.review === 'object' ? item.review : {};
  const manualReview = review.manualReview && typeof review.manualReview === 'object' ? review.manualReview : null;
  const rawVerdict = String(review.savedVerdict || (manualReview && manualReview.status) || '').trim();
  return rawVerdict ? normalizeImportedStatus(rawVerdict, {preserveEmpty:true}) : '';
}

function savedReviewSummaryForRecord(record){
  const item = record && typeof record === 'object' ? record : {};
  const review = item.review && typeof item.review === 'object' ? item.review : {};
  const manualReview = review.manualReview && typeof review.manualReview === 'object' ? review.manualReview : null;
  return String(review.savedSummary || (manualReview && manualReview.summary) || '').trim();
}

function savedReviewScoreForRecord(record){
  const item = record && typeof record === 'object' ? record : {};
  const review = item.review && typeof item.review === 'object' ? item.review : {};
  const manualReview = review.manualReview && typeof review.manualReview === 'object' ? review.manualReview : null;
  return numericOrNull(review.savedScore ?? (manualReview && manualReview.score));
}

function currentRuntimeVerdictForRecord(record){
  const item = record && typeof record === 'object' ? record : {};
  const scan = item.scan && typeof item.scan === 'object' ? item.scan : {};
  const scanVerdict = String(scan.resolvedVerdict || scan.verdict || '').trim();
  return scanVerdict ? normalizeImportedStatus(scanVerdict, {preserveEmpty:true}) : '';
}

function runtimeFallbackVerdictForRecord(record){
  const item = record && typeof record === 'object' ? record : {};
  const scan = item.scan && typeof item.scan === 'object' ? item.scan : {};
  const scanVerdict = String(scan.resolvedVerdict || scan.verdict || '').trim();
  const rawVerdict = scanVerdict;
  return rawVerdict ? normalizeImportedStatus(rawVerdict, {preserveEmpty:true}) : '';
}

function currentRuntimeSummaryForRecord(record){
  const item = record && typeof record === 'object' ? record : {};
  const scan = item.scan && typeof item.scan === 'object' ? item.scan : {};
  const reasons = Array.isArray(scan.reasons) ? scan.reasons : [];
  return String(scan.summary || reasons[0] || '').trim();
}

function currentRuntimeScoreForRecord(record){
  const item = record && typeof record === 'object' ? record : {};
  const scan = item.scan && typeof item.scan === 'object' ? item.scan : {};
  return numericOrNull(scan.score);
}

function preferredVerdictForRecord(record){
  return displayStageForRecord(record);
}

function preferredScoreForRecord(record){
  const setupScore = setupScoreForRecord(record);
  if(Number.isFinite(setupScore)) return setupScore;
  const currentScore = currentRuntimeScoreForRecord(record);
  if(Number.isFinite(currentScore)) return currentScore;
  const savedScore = savedReviewScoreForRecord(record);
  if(Number.isFinite(savedScore)) return savedScore;
  return null;
}

function preferredSummaryForRecord(record){
  return currentRuntimeSummaryForRecord(record) || savedReviewSummaryForRecord(record) || '';
}

function reviewSnapshotTimestampForRecord(record){
  const item = record && typeof record === 'object' ? record : {};
  const review = item.review && typeof item.review === 'object' ? item.review : {};
  const manualReview = review.manualReview && typeof review.manualReview === 'object' ? review.manualReview : null;
  const savedAt = String((manualReview && manualReview.savedAt) || review.lastReviewedAt || '').trim();
  return savedAt || '';
}

function currentRuntimeTimestampForRecord(record){
  const item = record && typeof record === 'object' ? record : {};
  const scan = item.scan && typeof item.scan === 'object' ? item.scan : {};
  const watchlist = item.watchlist && typeof item.watchlist === 'object' ? item.watchlist : {};
  const candidates = [
    scan.updatedAt,
    watchlist.updatedAt
  ].map(value => String(value || '').trim()).filter(Boolean);
  return candidates.sort().slice(-1)[0] || '';
}

function analysisVerdictForRecord(record, options = {}){
  const rawRecord = record && typeof record === 'object' ? record : {};
  const ticker = normalizeTicker(rawRecord.ticker || '');
  const review = rawRecord.review && typeof rawRecord.review === 'object' ? rawRecord.review : {};
  const analysisState = review.analysisState && typeof review.analysisState === 'object' ? review.analysisState : {};
  const cachedState = ticker && uiState.reviewAnalysisCache && typeof uiState.reviewAnalysisCache === 'object'
    ? uiState.reviewAnalysisCache[ticker]
    : null;
  const normalizedAnalysis = (
    analysisState.normalized && typeof analysisState.normalized === 'object'
      ? analysisState.normalized
      : (review.normalizedAnalysis && typeof review.normalizedAnalysis === 'object' ? review.normalizedAnalysis : null)
  ) || (
    cachedState && cachedState.normalized && typeof cachedState.normalized === 'object'
      ? cachedState.normalized
      : null
  );
  const baseVerdict = baseVerdictForRecord(rawRecord, options);

  const aiVerdict = normalizeAnalysisVerdict(
    normalizedAnalysis && (normalizedAnalysis.final_verdict || normalizedAnalysis.verdict) || ''
  );
  const fallbackVerdict = options.includeRuntimeFallback === false
    ? ''
    : normalizeAnalysisVerdict(runtimeFallbackVerdictForRecord(rawRecord) || '');

  const candidates = [];
  if(['Entry','Near Entry','Watch','Avoid'].includes(aiVerdict)){
    candidates.push(mostConservativeVerdict(baseVerdict, aiVerdict));
  }
  if(['Entry','Near Entry','Watch','Avoid'].includes(fallbackVerdict)){
    candidates.push(mostConservativeVerdict(baseVerdict, fallbackVerdict));
  }

  if(!candidates.length) return '';
  return mostConservativeVerdict(...candidates);
}

function verdictRank(verdict){
  const safeVerdict = normalizeAnalysisVerdict(verdict || '');
  if(safeVerdict === 'Avoid') return 0;
  if(safeVerdict === 'Watch') return 1;
  if(safeVerdict === 'Near Entry') return 2;
  if(safeVerdict === 'Entry') return 3;
  return null;
}

function verdictFromScore(score){
  const roundedScore = Number.isFinite(Number(score)) ? Math.max(0, Math.min(10, Math.round(Number(score)))) : null;
  if(!Number.isFinite(roundedScore)) return 'Watch';
  if(roundedScore <= 3) return 'Avoid';
  if(roundedScore <= 5) return 'Watch';
  if(roundedScore <= 7) return 'Near Entry';
  return 'Entry';
}

function mostConservativeVerdict(...verdicts){
  const normalized = verdicts
    .map(value => normalizeAnalysisVerdict(value || ''))
    .filter(value => verdictRank(value) != null);
  if(!normalized.length) return 'Watch';
  return normalized.reduce((lowest, current) => verdictRank(current) < verdictRank(lowest) ? current : lowest);
}

function currentHardFailVerdictForRecord(record){
  const item = record && typeof record === 'object' ? record : {};
  const derivedStates = analysisDerivedStatesFromRecord(item);
  const trendState = String(derivedStates.trendState || '').toLowerCase();
  const structureState = String(derivedStates.structureState || '').toLowerCase();
  const price = numericOrNull(item.marketData && item.marketData.price);
  const ma50 = numericOrNull(item.marketData && item.marketData.ma50);
  const ma200 = numericOrNull(item.marketData && item.marketData.ma200);
  const brokenTrend = trendState === 'broken'
    || structureState === 'broken'
    || (Number.isFinite(price) && Number.isFinite(ma200) && price < ma200)
    || (Number.isFinite(ma50) && Number.isFinite(ma200) && ma50 < ma200);
  if(brokenTrend) return 'Avoid';
  return '';
}

function baseVerdictForRecord(record, options = {}){
  const item = record && typeof record === 'object' ? record : {};
  const scoreVerdict = verdictFromScore(setupScoreForRecord(item));
  const hardFailVerdict = currentHardFailVerdictForRecord(item);
  const candidates = [scoreVerdict];
  if(hardFailVerdict) candidates.push(hardFailVerdict);
  if(options.includeRuntimeFallback !== false){
    const runtimeVerdict = normalizeAnalysisVerdict(runtimeFallbackVerdictForRecord(item) || '');
    if(runtimeVerdict) candidates.push(runtimeVerdict);
  }
  return mostConservativeVerdict(...candidates);
}

function executionDowngradeVerdictForRecord(record, options = {}){
  const item = record && typeof record === 'object' ? record : {};
  const displayedPlan = options.displayedPlan || deriveCurrentPlanState(
    item.plan && item.plan.entry,
    item.plan && item.plan.stop,
    item.plan && item.plan.firstTarget,
    item.marketData && item.marketData.currency
  );
  const planUiState = options.planUiState || getPlanUiState(item, {displayedPlan});
  const positionSize = numericOrNull(displayedPlan.riskFit && displayedPlan.riskFit.position_size);
  const riskStatus = String(displayedPlan.riskFit && displayedPlan.riskFit.risk_status || '');
  const planValidationState = String(item.plan && item.plan.planValidationState || '');
  const provisionalVerdict = normalizeAnalysisVerdict(
    options.provisionalVerdict
    || mostConservativeVerdict(
      baseVerdictForRecord(item, {includeRuntimeFallback:false}),
      analysisVerdictForRecord(item, {includeRuntimeFallback:false}) || ''
    )
  );

  if(item.plan && item.plan.invalidatedState) return 'Watch';
  if(executionCapitalBlocked(displayedPlan)) return provisionalVerdict === 'Entry' ? 'Near Entry' : 'Watch';
  if(executionCapitalHeavy(displayedPlan)){
    if(provisionalVerdict === 'Entry') return 'Near Entry';
    if(provisionalVerdict === 'Near Entry') return 'Watch';
    return provisionalVerdict || 'Watch';
  }
  if(['too_wide','settings_missing'].includes(riskStatus)) return 'Watch';
  if(planUiState.state === 'invalid' || planUiState.state === 'unrealistic_rr') return 'Watch';
  if(!Number.isFinite(positionSize) || positionSize < 1) return 'Watch';
  if(displayedPlan.tradeability === 'too_expensive' || displayedPlan.affordability === 'not_affordable') return 'Watch';
  if(planUiState.state === 'needs_adjustment' || displayedPlan.status !== 'valid' || planValidationState === 'needs_replan') return 'Watch';
  return '';
}

// LEGACY RESOLVER SUPPORT BLOCK DISABLED
// Shadowed by the canonical resolver-support block later in app.js.
function legacyFinalVerdictForRecord(record, options = {}){
  const item = record && typeof record === 'object' ? record : {};
  const displayedPlan = options.displayedPlan || deriveCurrentPlanState(
    item.plan && item.plan.entry,
    item.plan && item.plan.stop,
    item.plan && item.plan.firstTarget,
    item.marketData && item.marketData.currency
  );
  const planUiState = options.planUiState || getPlanUiState(item, {displayedPlan});
  const baseVerdict = baseVerdictForRecord(item, options);
  const advisoryVerdict = analysisVerdictForRecord(item, options);
  const includeExecutionDowngrade = options.includeExecutionDowngrade !== false;
  const executionVerdict = includeExecutionDowngrade
    ? executionDowngradeVerdictForRecord(item, {displayedPlan, planUiState})
    : '';
  const finalVerdict = mostConservativeVerdict(baseVerdict, advisoryVerdict, executionVerdict);
  console.debug('FINAL_VERDICT_TRACE', {
    ticker:item.ticker,
    baseVerdict,
    advisoryVerdict,
    executionVerdict,
    finalVerdict
  });
  return finalVerdict;
}

function primaryVerdictBadge(verdict){
  const safeVerdict = normalizeAnalysisVerdict(verdict || '');
  if(safeVerdict === 'Entry') return {label:'🚀 Entry', className:'ready'};
  if(safeVerdict === 'Near Entry') return {label:'🎯 Near Entry', className:'near'};
  if(safeVerdict === 'Avoid') return {label:'⛔ Avoid', className:'avoid'};
  return {label:'🧐 Monitor', className:'watch'};
}

// LEGACY RESOLVER BLOCK DISABLED
// Shadowed by the canonical resolver block later in app.js.
function legacyResolveEmojiPresentation(record, options = {}){
  const item = normalizeTickerRecord(record);
  const finalVerdict = normalizeAnalysisVerdict(options.finalVerdict || displayStageForRecord(item));
  const derivedStates = options.derivedStates || analysisDerivedStatesFromRecord(item);
  const effectivePlan = options.effectivePlan || effectivePlanForRecord(item, {allowScannerFallback:true});
  const displayedPlan = options.displayedPlan || deriveCurrentPlanState(
    effectivePlan.entry,
    effectivePlan.stop,
    effectivePlan.firstTarget,
    item.marketData && item.marketData.currency
  );
  const qualityAdjustments = options.qualityAdjustments || evaluateSetupQualityAdjustments(item, {displayedPlan, derivedStates});
  const warningState = options.warningState || evaluateWarningState(item, getReviewAnalysisState(item).normalizedAnalysis);
  const planCheckState = options.planCheckState || planCheckStateForRecord(item, {effectivePlan, displayedPlan});
  const planUiState = options.planUiState || getPlanUiState(item, {displayedPlan, effectivePlan, planCheckState});
  const setupUiState = options.setupUiState || getSetupUiState(item, {displayStage:finalVerdict, derivedStates, planUiState});
  const avoidSubtype = options.avoidSubtype || avoidSubtypeForRecord(item, {
    derivedStates,
    displayedPlan,
    qualityAdjustments,
    finalVerdict
  });
  const deadCheck = options.deadCheck || isTerminalDeadSetup(item, {derivedStates, displayedPlan});
  const context = String(options.context || 'generic').toLowerCase();
  const invalidated = !!(item.plan && (item.plan.invalidatedState || item.plan.missedState));
  const currentPrice = numericOrNull(item.marketData && item.marketData.price);
  const stop = numericOrNull(item.plan && item.plan.stop);
  const brokenBelowStop = Number.isFinite(currentPrice) && Number.isFinite(stop) && currentPrice <= stop;
  const volumeState = String(derivedStates.volumeState || '').toLowerCase();
  const warningReasons = warningState && Array.isArray(warningState.reasons) ? warningState.reasons : [];
  const weakConditionsPresent = !!(
    qualityAdjustments.weakRegimePenalty
    || item.setup.marketCaution
    || warningReasons.some(reason => /hostile market|weak market|borderline setup in weak market/i.test(String(reason || '')))
  );
  const weakVolumePresent = volumeState === 'weak'
    || warningReasons.some(reason => /weak volume/i.test(String(reason || '')));
  const tradeability = String(displayedPlan.tradeability || '').toLowerCase();
  const invalidAvoidGuard = !deadCheck.dead
    && (planUiState.state === 'invalid' || planUiState.state === 'missing')
    && (tradeability === 'avoid' || finalVerdict === 'Avoid');
  const hasReviewState = !!(
    hasAiStageForRecord(item)
    || String(item.review && item.review.savedVerdict || '').trim()
    || String(item.review && item.review.lastReviewedAt || '').trim()
    || (item.review && item.review.manualReview && Object.keys(item.review.manualReview).length)
    || (item.watchlist && item.watchlist.inWatchlist)
  );
  let primaryState = 'monitor';
  let primaryEmoji = '🧐';
  let primaryLabel = 'Monitor';
  let badgeClass = 'watch';

  if(finalVerdict === 'Entry'){
    primaryState = 'entry';
    primaryEmoji = '🚀';
    primaryLabel = 'Entry';
    badgeClass = 'ready';
  }else if(finalVerdict === 'Near Entry'){
    primaryState = 'near_entry';
    primaryEmoji = '🎯';
    primaryLabel = 'Near Entry';
    badgeClass = 'near';
  }else if(finalVerdict === 'Avoid' && deadCheck.dead){
    primaryState = 'dead';
    primaryEmoji = '💀';
    primaryLabel = 'Dead';
    badgeClass = 'avoid';
  }else if(invalidAvoidGuard){
    primaryState = 'inactive';
    primaryEmoji = '⛔';
    primaryLabel = 'Needs rebuild';
    badgeClass = 'avoid';
  }else if(finalVerdict === 'Avoid'){
    const structureState = String(derivedStates.structureState || '').toLowerCase();
    const bounceState = String(derivedStates.bounceState || '').toLowerCase();
    const developingSoftState = setupUiState.state === 'developing'
      || ['weak','weakening','developing_loose'].includes(structureState)
      || ['none','attempt','early'].includes(bounceState);
    primaryState = developingSoftState ? 'developing' : 'monitor';
    primaryEmoji = developingSoftState ? '🌱' : '🧐';
    primaryLabel = developingSoftState ? 'Developing' : 'Monitor';
    badgeClass = developingSoftState ? 'near' : 'watch';
  }else if(setupUiState.state === 'developing'){
    primaryState = 'developing';
    primaryEmoji = '🌱';
    primaryLabel = 'Developing';
    badgeClass = 'near';
  }

  const modifiers = [];
  const addModifier = (emoji, label, code, className = 'near') => {
    if(!emoji || !label || modifiers.some(item => item.code === code) || modifiers.length >= 2) return;
    modifiers.push({emoji, label, code, className});
  };
  if(context === 'scanner' && !hasReviewState){
    addModifier('👀', 'Scan candidate', 'scan_candidate', 'watch');
  }
  if(
    qualityAdjustments.lowControlSetup
    || qualityAdjustments.tooWideForQualityPullback
    || ['weakening','developing_loose'].includes(String(derivedStates.structureState || '').toLowerCase())
  ){
    addModifier('🔋', 'Weak control', 'low_control', 'near');
  }
  if(weakVolumePresent){
    addModifier('🫗', 'Weak volume', 'weak_volume', 'near');
  }
  if(weakConditionsPresent){
    addModifier('⚠️', 'Weak market', 'weak_conditions', 'near');
  }

  const primaryText = `${primaryEmoji} ${primaryLabel}`;

  if(['monitor','developing'].includes(primaryState) && primaryEmoji === '💀'){
    console.warn('EMOJI_STATE_MISMATCH', {ticker:item.ticker, finalVerdict, primaryState, primaryEmoji});
  }
  if(finalVerdict === 'Avoid' && deadCheck.dead && primaryEmoji !== '💀'){
    console.warn('EMOJI_STATE_MISMATCH', {ticker:item.ticker, finalVerdict, avoidSubtype, primaryEmoji, deadReasonCode:deadCheck.reasonCode});
  }
  if(primaryState === 'dead' && !deadCheck.dead){
    console.warn('DEAD_CLASSIFICATION_SOFT_BLOCKER', {
      ticker:item.ticker,
      finalVerdict,
      avoidSubtype,
      deadReasonCode:deadCheck.reasonCode,
      terminalTriggerUsed:deadCheck.terminalTriggerUsed,
      fallbackStateIfNotDead:deadCheck.fallbackStateIfNotDead || 'monitor',
      weakVolumePresent,
      weakConditionsPresent,
      lowControl:!!qualityAdjustments.lowControlSetup,
      tooWide:!!qualityAdjustments.tooWideForQualityPullback,
      invalidated,
      brokenBelowStop
    });
  }

  const seenModifierCodes = new Set();
  const seenModifierKeys = new Set();
  const uniqueModifiers = [];
  modifiers.forEach(modifier => {
    const code = String(modifier && modifier.code || '').trim();
    const key = `${String(modifier && modifier.emoji || '').trim()}|${String(modifier && modifier.label || '').trim()}`;
    if((code && seenModifierCodes.has(code)) || seenModifierKeys.has(key)){
      console.warn('EMOJI_MODIFIER_DUPLICATE', {ticker:item.ticker, code, key});
      return;
    }
    if(code) seenModifierCodes.add(code);
    seenModifierKeys.add(key);
    uniqueModifiers.push(modifier);
  });
  const combinedShortLabel = [primaryText].concat(uniqueModifiers.slice(0, 2).map(modifier => `${modifier.emoji} ${modifier.label}`)).join(' | ');

  return {
    primaryState,
    primaryEmoji,
    primaryLabel,
    primaryText,
    badgeClass,
    modifiers:uniqueModifiers.slice(0, 2),
    combinedShortLabel
  };
}

function emojiModifierMarkup(presentation){
  const sourceModifiers = presentation && Array.isArray(presentation.modifiers) ? presentation.modifiers : [];
  const seenCodes = new Set();
  const seenKeys = new Set();
  const modifiers = [];
  sourceModifiers.forEach(modifier => {
    const code = String(modifier && modifier.code || '').trim();
    const key = `${String(modifier && modifier.emoji || '').trim()}|${String(modifier && modifier.label || '').trim()}`;
    if((code && seenCodes.has(code)) || seenKeys.has(key)){
      console.warn('EMOJI_RENDER_DUPLICATE', {code, key});
      return;
    }
    if(code) seenCodes.add(code);
    seenKeys.add(key);
    modifiers.push(modifier);
  });
  const limitedModifiers = modifiers.slice(0, 2);
  const duplicateCodes = limitedModifiers.map(modifier => modifier.code).filter(Boolean);
  if(new Set(duplicateCodes).size !== duplicateCodes.length){
    console.warn('EMOJI_RENDER_DUPLICATE', {duplicateCodes});
  }
  if(!limitedModifiers.length) return '';
  return limitedModifiers.map(modifier => `<span class="pill ${escapeHtml(modifier.className || 'near')}">${escapeHtml(`${modifier.emoji} ${modifier.label}`)}</span>`).join('');
}

function prioritizedSignalModifiers(presentation, maxModifiers = 2){
  const sourceModifiers = presentation && Array.isArray(presentation.modifiers) ? presentation.modifiers : [];
  const allowedCodes = new Set(['weak_conditions', 'weak_volume', 'low_control']);
  const priorityOrder = {weak_conditions:0, weak_volume:1, low_control:2};
  const seenCodes = new Set();
  const seenKeys = new Set();
  const uniqueModifiers = [];
  sourceModifiers.forEach(modifier => {
    const code = String(modifier && modifier.code || '').trim();
    const key = `${String(modifier && modifier.emoji || '').trim()}|${String(modifier && modifier.label || '').trim()}`;
    if(!allowedCodes.has(code)) return;
    if(seenCodes.has(code) || seenKeys.has(key)) return;
    seenCodes.add(code);
    seenKeys.add(key);
    uniqueModifiers.push(modifier);
  });
  return uniqueModifiers
    .sort((a, b) => (priorityOrder[String(a && a.code || '').trim()] ?? 99) - (priorityOrder[String(b && b.code || '').trim()] ?? 99))
    .slice(0, Math.min(Math.max(maxModifiers, 0), 3));
}

function watchlistActionSummary(actionPresentation){
  return watchlistActionSummaryImpl(actionPresentation);
  const label = String(actionPresentation && (actionPresentation.shortLabel || actionPresentation.label) || '').trim();
  if(!label) return 'Monitor';
  if(/stronger volume/i.test(label)) return '🫗 Volume weak - monitor for expansion';
  if(/bounce confirmation/i.test(label)) return 'Wait for bounce confirmation';
  if(/better conditions/i.test(label)) return 'Weak market - wait for better conditions';
  if(/tighter structure|control is not good enough/i.test(label)) return '🔋 Weak control - wait for tighter structure';
  return label;
}

function watchlistReasonSummary(reasoning, actionText){
  return watchlistReasonSummaryImpl(reasoning, actionText);
  const actionLower = String(actionText || '').toLowerCase();
  const detailParts = String(reasoning && reasoning.detail || '')
    .split('|')
    .map(part => String(part || '').trim())
    .filter(Boolean);
  const filteredParts = detailParts.filter(part => {
    const text = part.toLowerCase();
    if(!text) return false;
    if(actionLower.includes(text)) return false;
    if(text.includes('volume') && actionLower.includes('volume')) return false;
    if(text.includes('bounce') && actionLower.includes('bounce')) return false;
    if(text.includes('market') && actionLower.includes('market')) return false;
    if(text.includes('control') && actionLower.includes('control')) return false;
    return true;
  });
  if(filteredParts.length) return filteredParts.slice(0, 2).join(' + ');
  return String(reasoning && reasoning.headline || '')
    .replace(/^(Monitor|Downgraded|Avoid|Ready|Prepare):\s*/i, '')
    .trim();
}

function normalizeStoredPlanSnapshot(snapshot){
  return normalizeStoredPlanSnapshotImpl(snapshot);
}

function storedPlanState(snapshot){
  return storedPlanStateImpl(snapshot);
}

function planSnapshotFromDisplayedPlan(displayedPlan){
  return planSnapshotFromDisplayedPlanImpl(displayedPlan, { numericOrNull });
}

function planSnapshotSummary(snapshot, options = {}){
  return planSnapshotSummaryImpl(snapshot, options);
}

function planSnapshotsEqual(a, b){
  return planSnapshotsEqualImpl(a, b);
}

function recomputeAttemptedForSource(source){
  return recomputeAttemptedForSourceImpl(source);
}

function tradeabilityRank(value){
  const ranks = {
    avoid:0,
    risk_only:1,
    too_expensive:1,
    watch:2,
    monitor:2,
    near_entry:3,
    action_now:4,
    entry:4
  };
  return ranks[String(value || '').trim().toLowerCase()] ?? 0;
}

function determineRecomputeResult(previousPlan, newPlan, attempted){
  return determineRecomputeResultImpl(previousPlan, newPlan, attempted, {
    numericOrNull,
    tradeabilityRank
  });
}

function renderRecomputeDiagnostics(debug, options = {}){
  const info = debug && typeof debug === 'object' ? debug : {};
  const previousPlan = normalizeStoredPlanSnapshot(info.previousPlan);
  const newPlan = normalizeStoredPlanSnapshot(info.newPlan);
  const identical = planSnapshotsEqual(previousPlan, newPlan);
  const previousSummary = planSnapshotSummary(previousPlan, {emptyLabel:'None'});
  const newSummary = identical
    ? `Same as previous | ${planSnapshotSummary(newPlan, {emptyLabel:'None'})}`
    : planSnapshotSummary(newPlan, {emptyLabel:'None'});
  const wrapperClass = String(options.wrapperClass || '').trim();
  return `<div class="${escapeHtml(wrapperClass || 'watchlist-debug-block tiny')}"><strong>Plan Recompute</strong><div>Plan recomputed: ${escapeHtml(info.planRecomputed ? 'Yes' : 'No')}</div><div>Recompute result: ${escapeHtml(info.recomputeResult || 'Skipped')}</div><div>Previous plan: ${escapeHtml(previousSummary)}</div><div>New plan: ${escapeHtml(newSummary)}</div>${info.planSnapshotMismatch ? `<div>Snapshot warning: ${escapeHtml(info.planSnapshotMismatch)}</div>` : ''}</div>`;
}

function watchlistDecisionPresentation(resolvedContract, lifecycleSnapshot, reasoning, fallbackAction){
  const blockerReason = String(resolvedContract && resolvedContract.blockerReason || '').trim();
  const reasonSummary = String(resolvedContract && resolvedContract.reasonSummary || '').trim();

  const actionStateKey = String(resolvedContract && resolvedContract.actionStateKey || '').trim().toLowerCase();
  const rebuildState = actionStateKey === 'rebuild_setup';
  const recalculateState = actionStateKey === 'recalculate_plan';
  let badgeText = String(resolvedContract && (resolvedContract.actionStateLabel || resolvedContract.actionLabel) || '').trim() || 'Hold for confirmation';
  let badgeClass = actionStateKey === 'rebuild_setup'
    ? 'avoid'
    : (actionStateKey === 'recalculate_plan' ? 'near' : (String(resolvedContract && resolvedContract.badgeClass || '').trim() || 'watch'));
  let headline = String(resolvedContract && (resolvedContract.actionStateLabel || resolvedContract.actionLabel) || fallbackAction || '').trim() || 'Hold for confirmation';
  const conciseReason = reasonSummary || watchlistReasonSummary(reasoning, headline) || blockerReason;
  const tradeability = String(resolvedContract && (resolvedContract.tradeabilityVerdictLabel || resolvedContract.tradeabilityLabel) || 'Watch').trim();
  let reason = conciseReason ? `Tradeability: ${tradeability} | ${conciseReason}` : `Tradeability: ${tradeability}`;
  if(actionStateKey === 'rebuild_setup') badgeText = '\uD83D\uDC80 Rebuild setup';
  else if(actionStateKey === 'recalculate_plan') badgeText = '🟡 Hold for entry conditions';
  else if(actionStateKey === 'ready_to_act') badgeText = 'Ready to act';
  else if(actionStateKey === 'hold_confirmation') badgeText = 'Hold for confirmation';

  if(String(lifecycleSnapshot && lifecycleSnapshot.state || '').toLowerCase() === 'expired'){
    badgeText = 'Expired';
    badgeClass = 'avoid';
    headline = 'Rebuild setup';
    reason = 'Tradeability: Avoid | Watchlist window expired without a usable improvement';
  }else if(rebuildState){
    badgeText = '💀 Rebuild setup';
    badgeClass = 'avoid';
    headline = 'Rebuild setup before reconsidering entry';
    reason = reason || 'Invalid plan + weak structure';
  }else if(recalculateState){
    badgeText = '🟡 Hold for entry conditions';
    badgeClass = 'near';
    headline = 'Hold for entry conditions';
    reason = reason || 'Structure intact, but current plan is invalid.';
  }

  return {
    badgeText,
    badgeClass,
    headline,
    reason: String(reason || '').replace(/\.$/, '').trim()
  };
}

function reviewReasonSummary(reasoning, actionText){
  const shortReason = watchlistReasonSummary(reasoning, actionText);
  if(shortReason) return shortReason;
  return String(reasoning && reasoning.detail || '').trim();
}

function evaluateEntryTrigger(record, options = {}){
  const rawRecord = record && typeof record === 'object' ? record : {};
  const derived = options.derivedStates || analysisDerivedStatesFromRecord(rawRecord);
  const displayedPlan = options.displayedPlan || deriveCurrentPlanState(
    rawRecord.plan && rawRecord.plan.entry,
    rawRecord.plan && rawRecord.plan.stop,
    rawRecord.plan && rawRecord.plan.firstTarget,
    rawRecord.marketData && rawRecord.marketData.currency
  );
  const trendState = String(derived.trendState || '').toLowerCase();
  const pullbackZone = String(derived.pullbackZone || '').toLowerCase();
  const structureState = String(derived.structureState || '').toLowerCase();
  const stabilisationState = String(derived.stabilisationState || '').toLowerCase();
  const bounceState = String(derived.bounceState || '').toLowerCase();
  const hostileMarket = isHostileMarketStatus((rawRecord.meta && rawRecord.meta.marketStatus) || state.marketStatus);
  const currentPrice = numericOrNull(rawRecord.marketData && rawRecord.marketData.price);
  const entry = displayedPlan.entry;
  const stop = displayedPlan.stop;
  const target = displayedPlan.target;
  const trendValid = trendState !== 'broken' && trendState !== 'weak';
  const pullbackValid = ['near_20ma','near_50ma'].includes(pullbackZone);
  const structureIntact = !['weak','weakening','broken'].includes(structureState);
  const noBounce = bounceState === 'none';
  const confirmedBounce = bounceState === 'confirmed';
  const clearStabilisation = stabilisationState === 'clear';
  const hardFail = trendState === 'broken'
    || structureState === 'broken'
    || (['weak','weakening'].includes(structureState) && noBounce && hostileMarket)
    || (Number.isFinite(currentPrice) && Number.isFinite(stop) && currentPrice <= (stop * 0.995));
  const hasReviewedPlan = displayedPlan.status === 'valid';
  const breakAboveTrigger = hasReviewedPlan && Number.isFinite(currentPrice) && Number.isFinite(entry) && currentPrice >= entry;
  const strongReversal = pullbackValid && structureIntact && confirmedBounce && clearStabilisation;
  const reclaimFollowThrough = pullbackValid && structureIntact && confirmedBounce && clearStabilisation && breakAboveTrigger;
  const triggerReady = trendValid && pullbackValid && structureIntact && !hardFail && hasReviewedPlan
    && confirmedBounce
    && clearStabilisation
    && !hostileMarket
    && (breakAboveTrigger || strongReversal || reclaimFollowThrough);
  const nearReady = !hardFail && pullbackValid && trendState !== 'broken' && structureIntact
    && (confirmedBounce || (bounceState === 'attempt' && clearStabilisation));
  const extendedFromEntry = hasReviewedPlan && Number.isFinite(currentPrice) && Number.isFinite(entry) && currentPrice > (entry * 1.03);
  const clearlyMissed = hasReviewedPlan && Number.isFinite(currentPrice) && Number.isFinite(entry) && currentPrice > (entry * 1.06);
  return {
    triggerState:hardFail ? 'invalidated' : (clearlyMissed ? 'missed' : (triggerReady ? 'triggered' : (nearReady ? 'near_ready' : 'waiting_for_trigger'))),
    entryTriggerReady:triggerReady,
    nearReady,
    hardFail,
    trendValid,
    pullbackValid,
    structureIntact,
    confirmedBounce,
    clearStabilisation,
    hasReviewedPlan,
    hostileMarket,
    extendedFromEntry,
    clearlyMissed
  };
}

function validateCurrentPlan(record, options = {}){
  const rawRecord = record && typeof record === 'object' ? record : {};
  const displayedPlan = options.displayedPlan || deriveCurrentPlanState(
    rawRecord.plan && rawRecord.plan.entry,
    rawRecord.plan && rawRecord.plan.stop,
    rawRecord.plan && rawRecord.plan.firstTarget,
    rawRecord.marketData && rawRecord.marketData.currency
  );
  const trigger = options.triggerState || evaluateEntryTrigger(rawRecord, {displayedPlan, derivedStates:options.derivedStates});
  const entry = displayedPlan.entry;
  const stop = displayedPlan.stop;
  const target = displayedPlan.target;
  const currentPrice = numericOrNull(rawRecord.marketData && rawRecord.marketData.price);
  const structurePremature = !trigger.trendValid || !trigger.structureIntact;
  const confirmationPremature = !trigger.confirmedBounce || !trigger.clearStabilisation;
  if(displayedPlan.status !== 'valid'){
    return {
      state:displayedPlan.status === 'missing' ? 'not_reviewed' : 'needs_replan',
      valid:false,
      needsReplan:displayedPlan.status !== 'missing',
      missed:false,
      invalidated:false,
      capitalConstraint:'',
      reasonCode:displayedPlan.status === 'missing' ? 'plan_missing' : 'plan_incomplete'
    };
  }
  if(trigger.hardFail){
    return {state:'invalidated', valid:false, needsReplan:false, missed:false, invalidated:true, capitalConstraint:'', reasonCode:'technical_invalidation'};
  }
  if(trigger.clearlyMissed || (Number.isFinite(currentPrice) && Number.isFinite(target) && currentPrice >= (target * 0.98))){
    return {state:'missed', valid:false, needsReplan:false, missed:true, invalidated:false, capitalConstraint:'', reasonCode:'missed_setup'};
  }
  if(structurePremature || confirmationPremature){
    return {
      state:'pending_validation',
      valid:false,
      needsReplan:true,
      missed:false,
      invalidated:false,
      capitalConstraint:'',
      reasonCode:structurePremature ? 'weak_structure' : 'bounce_not_confirmed'
    };
  }
  const prospectiveRisk = (Number.isFinite(currentPrice) && Number.isFinite(stop) && Number.isFinite(target) && currentPrice > entry)
    ? evaluateRewardRisk(currentPrice, stop, target)
    : displayedPlan.rewardRisk;
  const prospectiveRiskFit = (Number.isFinite(currentPrice) && Number.isFinite(stop) && currentPrice > entry)
    ? evaluateRiskFit({entry:currentPrice, stop, ...currentRiskSettings()})
    : displayedPlan.riskFit;
  const sizeShift = Number.isFinite(displayedPlan.riskFit.position_size) && displayedPlan.riskFit.position_size > 0 && Number.isFinite(prospectiveRiskFit.position_size)
    ? Math.abs(prospectiveRiskFit.position_size - displayedPlan.riskFit.position_size) / displayedPlan.riskFit.position_size
    : 0;
  const staleMove = trigger.extendedFromEntry
    || (prospectiveRisk.valid && prospectiveRisk.rrRatio < 1.5)
    || sizeShift > 0.35;
  return {
    state:staleMove ? 'needs_replan' : 'valid',
    valid:!staleMove,
    needsReplan:staleMove,
    missed:false,
    invalidated:false,
    capitalConstraint:capitalConstraintCodeForPlan(displayedPlan),
    reasonCode:staleMove ? 'plan_premature_or_stale' : 'valid'
  };
}

function displayStageForRecord(record, options = {}){
  return displayStageForRecordImpl(record, options, {
    deriveCurrentPlanState,
    analysisDerivedStatesFromRecord,
    getPlanUiState,
    baseVerdictForRecord,
    analysisVerdictForRecord,
    executionDowngradeVerdictForRecord,
    mostConservativeVerdict,
    isTerminalDeadSetup,
    resolveFinalStateContract
  });
}

// LEGACY RESOLVER BLOCK DISABLED
// Shadowed by the canonical resolver block later in app.js.
function legacyReviewHeaderVerdictForRecord(record){
  return finalVerdictForRecord(record, {
    includeExecutionDowngrade:false,
    includeRuntimeFallback:false
  });
}

function reviewDowngradeSummaryForRecord(record, options = {}){
  const item = normalizeTickerRecord(record);
  const scannerStatus = normalizeAnalysisVerdict(options.scannerStatus || '');
  const reviewStatus = normalizeAnalysisVerdict(options.reviewStatus || '');
  if(!scannerStatus || !reviewStatus) return null;
  if(verdictRank(reviewStatus) == null || verdictRank(scannerStatus) == null) return null;
  if(verdictRank(reviewStatus) >= verdictRank(scannerStatus)) return null;

  const displayedPlan = options.displayedPlan || deriveCurrentPlanState(
    item.plan && item.plan.entry,
    item.plan && item.plan.stop,
    item.plan && item.plan.firstTarget,
    item.marketData && item.marketData.currency
  );
  const derivedStates = options.derivedStates || analysisDerivedStatesFromRecord(item);
  const qualityAdjustments = options.qualityAdjustments || evaluateSetupQualityAdjustments(item, {displayedPlan, derivedStates});
  const warningState = options.warningState || warningStateFromInputs(item, null, derivedStates);
  const reasons = [];
  const pushReason = value => {
    if(value && !reasons.includes(value)) reasons.push(value);
  };

  if(item.plan && item.plan.invalidatedState) pushReason('Setup invalidated');
  if(item.plan && item.plan.missedState) pushReason('Missed entry window');
  if(executionCapitalBlocked(displayedPlan) || executionCapitalHeavy(displayedPlan)) pushReason(capitalConstraintReasonForPlan(displayedPlan) || 'Capital usage is heavy for this account size.');
  if(displayedPlan.riskFit && displayedPlan.riskFit.risk_status === 'too_wide') pushReason(`Stop would be too wide for ${formatPound(currentMaxLoss())} risk`);
  if(displayedPlan.riskFit && displayedPlan.riskFit.risk_status === 'settings_missing') pushReason('Risk settings need checking');
  (qualityAdjustments.adjustmentReasons || []).forEach(pushReason);
  (warningState.reasons || []).forEach(pushReason);
  if(!reasons.length && item.scan && item.scan.reasons) item.scan.reasons.forEach(pushReason);

  return {
    scanner_status:scannerStatus,
    review_status:reviewStatus,
    label:'Downgraded after review',
    transition:`Scanner ${scannerStatus} -> Review ${reviewStatus}`,
    summary:reasons.slice(0, 2).join(' | ')
  };
}

function aiVerdictCeilingForRecord(record){
  return resolverSeedVerdictForRecord(record);
}

function isTerminalDeadSetup(record, options = {}){
  const item = record && typeof record === 'object' ? record : {};
  const derivedStates = options.derivedStates || analysisDerivedStatesFromRecord(item);
  const structureState = String(derivedStates.structureState || '').toLowerCase();
  const trendState = String(derivedStates.trendState || '').toLowerCase();
  const currentPrice = numericOrNull(item.marketData && item.marketData.price);
  const stopPrice = numericOrNull(item.plan && item.plan.stop);
  const brokenBelowStop = Number.isFinite(currentPrice) && Number.isFinite(stopPrice) && currentPrice <= stopPrice;

  if(structureState === 'broken') return {dead:true, reasonCode:'broken_structure', terminalTriggerUsed:'structure_state'};
  if(trendState === 'broken') return {dead:true, reasonCode:'broken_trend', terminalTriggerUsed:'trend_state'};
  if(brokenBelowStop) return {dead:true, reasonCode:'stop_breach', terminalTriggerUsed:'price_below_stop'};

  return {dead:false, reasonCode:'', terminalTriggerUsed:'', fallbackStateIfNotDead:'monitor'};
}

function scoreStageForRecord(record){
  if(record && record.review && record.review.manualReview && typeof record.review.manualReview === 'object') return 'final';
  const analysisState = getReviewAnalysisState(record || {});
  if((record && record.review && record.review.lastReviewedAt) || analysisState.normalizedAnalysis || analysisState.rawAnalysis) return 'reviewed';
  return 'preliminary';
}

function hasAnyPlanFields(record){
  const review = record && record.review && record.review.manualReview && typeof record.review.manualReview === 'object' ? record.review.manualReview : null;
  const candidates = [
    record && record.plan && record.plan.entry,
    record && record.plan && record.plan.stop,
    record && record.plan && record.plan.firstTarget,
    review && review.entry,
    review && review.stop,
    review && review.target
  ];
  return candidates.some(value => {
    if(Number.isFinite(value)) return true;
    return !!String(value || '').trim();
  });
}

function planStateForRecord(record){
  if(record && record.plan && typeof record.plan.status === 'string' && record.plan.status) return record.plan.status;
  if(record && record.plan && record.plan.hasValidPlan) return 'valid';
  return hasAnyPlanFields(record) ? 'invalid' : 'missing';
}

function actionStateForRecord(record){
  const item = normalizeTickerRecord(record);
  return String(item.action && item.action.stage || deriveActionStateForRecord(item).stage);
}

function avoidSubtypeForRecord(record, options = {}){
  const item = normalizeTickerRecord(record);
  const finalVerdict = normalizeAnalysisVerdict(options.finalVerdict || reviewHeaderVerdictForRecord(item));
  if(finalVerdict !== 'Avoid') return '';
  const derivedStates = options.derivedStates || analysisDerivedStatesFromRecord(item);
  const displayedPlan = options.displayedPlan || deriveCurrentPlanState(
    item.plan && item.plan.entry,
    item.plan && item.plan.stop,
    item.plan && item.plan.firstTarget,
    item.marketData && item.marketData.currency
  );
  const qualityAdjustments = options.qualityAdjustments || evaluateSetupQualityAdjustments(item, {displayedPlan, derivedStates});
  const planUiState = options.planUiState || getPlanUiState(item, {displayedPlan});
  const structureState = String(derivedStates.structureState || '').toLowerCase();
  const trendState = String(derivedStates.trendState || '').toLowerCase();
  const bounceState = String(derivedStates.bounceState || '').toLowerCase();
  const volumeState = String(derivedStates.volumeState || '').toLowerCase();
  const rrValue = numericOrNull(displayedPlan.rewardRisk && displayedPlan.rewardRisk.rrRatio);
  const setupScore = setupScoreForRecord(item);
  const structureAlive = !['broken','weak'].includes(structureState) && trendState !== 'broken';
  const deadCheck = isTerminalDeadSetup(item, {derivedStates, displayedPlan});

  if(
    deadCheck.dead
    || (setupScore <= 3 && !structureAlive)
  ) return 'terminal';

  if(
    (structureAlive || structureState === 'weak')
    && (
      ['none','attempt','early'].includes(bounceState)
      || volumeState === 'weak'
      || qualityAdjustments.weakRegimePenalty
      || qualityAdjustments.lowControlSetup
      || qualityAdjustments.tooWideForQualityPullback
      || planUiState.state === 'invalid'
      || planUiState.state === 'unrealistic_rr'
      || (Number.isFinite(rrValue) && rrValue < currentRrThreshold())
      || executionCapitalHeavy(displayedPlan)
      || executionCapitalBlocked(displayedPlan)
    )
  ) return 'conditional';

  return '';
}

function decisionReasoningForRecord(record, options = {}){
  const item = normalizeTickerRecord(record);
  const scannerStatus = normalizeAnalysisVerdict(options.scannerStatus || '');
  const resolved = resolveFinalStateContract(item, {
    context:'review',
    finalVerdict:options.reviewVerdict || displayStageForRecord(item),
    derivedStates:options.derivedStates,
    displayedPlan:options.displayedPlan,
    qualityAdjustments:options.qualityAdjustments,
    warningState:options.warningState
  });
  let headline = resolved.actionLabel;
  if(scannerStatus && verdictRank(resolved.finalVerdict) != null && verdictRank(scannerStatus) != null && verdictRank(resolved.finalVerdict) < verdictRank(scannerStatus)){
    headline = `Downgraded: ${String(resolved.actionLabel || '').toLowerCase()}`;
  }
  return {
    headline:String(headline || '').slice(0, 80),
    detail:resolved.reasonParts.slice(0, 3).join(' | '),
    avoidSubtype:options.avoidSubtype || avoidSubtypeForRecord(item, {
      derivedStates:options.derivedStates,
      displayedPlan:options.displayedPlan,
      qualityAdjustments:options.qualityAdjustments,
      finalVerdict:resolved.finalVerdict
    })
  };
}

function actionPresentationForRecord(record, options = {}){
  const item = normalizeTickerRecord(record);
  const resolved = resolveFinalStateContract(item, {
    context:'review',
    finalVerdict:options.finalVerdict || reviewHeaderVerdictForRecord(item)
  });
  if(['monitor','developing'].includes(resolved.primaryState) && /ignore|dead|💀|💩/i.test(String(resolved.actionLabel || ''))){
    console.warn('REVIEW_ACTION_TERMINAL_LEAK', {
      ticker:item.ticker,
      finalVerdict:resolved.finalVerdict,
      primaryState:resolved.primaryState,
      actionLabel:resolved.actionLabel
    });
    return {label:'Monitor for confirmation', tone:'watch', shortLabel:'Monitor for confirmation'};
  }
  return {
    label:resolved.actionLabel,
    tone:resolved.actionTone,
    shortLabel:resolved.actionShortLabel
  };
}

function planQualityForRecord(record){
  if(!(record && record.plan && record.plan.hasValidPlan)) return null;
  const rrRatio = numericOrNull(record.plan.plannedRR);
  const band = rrBandForValue(rrRatio);
  if(band === 'strong') return 'Strong';
  if(band === 'good') return 'Good';
  if(band === 'acceptable') return 'Acceptable';
  if(band === 'weak') return 'Weak';
  return null;
}

function planQualityForRr(rrRatio){
  return planQualityForRrImpl(rrRatio);
}

function capitalFitLabel(capitalFit){
  if(capitalFit === 'ideal') return 'Ideal';
  if(capitalFit === 'acceptable') return 'Acceptable';
  if(capitalFit === 'borderline') return 'Borderline';
  if(capitalFit === 'heavy') return 'Heavy';
  if(capitalFit === 'too_heavy') return 'Too heavy';
  if(capitalFit === 'fits_capital') return 'Acceptable';
  if(capitalFit === 'too_expensive') return 'Too expensive';
  return 'Needs Check';
}

function capitalFitDisplayText(capitalFit, capitalNote){
  const baseLabel = capitalFitLabel(capitalFit);
  if(capitalFit !== 'unknown') return baseLabel;
  return /FX estimated/i.test(String(capitalNote || ''))
    ? 'Capital Check Estimated'
    : baseLabel;
}

function deriveAffordability(positionCost){
  return deriveAffordabilityImpl(positionCost, {
    numericOrNull,
    classifyCapitalUsage: ({position_cost_gbp, account_size_gbp}) => classifyCapitalUsage({position_cost_gbp, account_size_gbp})
  });
}

function affordabilityLabel(affordability){
  if(affordability === 'not_affordable') return 'Too Expensive';
  if(affordability === 'heavy_capital') return 'Heavy';
  if(affordability === 'affordable') return 'Affordable';
  return 'N/A';
}

function capitalFitForPlan(displayedPlan){
  const plan = displayedPlan && typeof displayedPlan === 'object' ? displayedPlan : {};
  const capitalFitValue = plan.capitalFit && typeof plan.capitalFit === 'object'
    ? plan.capitalFit.capital_fit
    : plan.capitalFit;
  return String(capitalFitValue || '').trim().toLowerCase();
}

function executionCapitalHeavy(displayedPlan){
  const plan = displayedPlan && typeof displayedPlan === 'object' ? displayedPlan : {};
  return capitalFitForPlan(plan) === 'heavy'
    || plan.affordability === 'heavy_capital'
    || plan.tradeability === 'capital_heavy';
}

function executionCapitalBlocked(displayedPlan){
  const plan = displayedPlan && typeof displayedPlan === 'object' ? displayedPlan : {};
  const capitalFit = capitalFitForPlan(plan);
  return capitalFit === 'too_heavy'
    || capitalFit === 'too_expensive'
    || plan.affordability === 'not_affordable'
    || plan.tradeability === 'too_expensive';
}

function capitalConstraintCodeForPlan(displayedPlan){
  if(executionCapitalBlocked(displayedPlan)) return 'not_affordable';
  if(executionCapitalHeavy(displayedPlan)) return 'heavy_capital';
  return '';
}

function capitalConstraintReasonForPlan(displayedPlan){
  const capitalFit = capitalFitForPlan(displayedPlan);
  if(capitalFit === 'too_expensive') return 'Position would use too much account capital.';
  if(capitalFit === 'too_heavy') return 'Capital concentration blocks entry readiness.';
  if(executionCapitalBlocked(displayedPlan)) return 'Trade is risk-valid but too capital-heavy.';
  if(executionCapitalHeavy(displayedPlan)) return 'Capital usage is heavy for this account size.';
  return '';
}

function capitalUsageDebugText(displayedPlan){
  const usagePct = numericOrNull(displayedPlan && displayedPlan.capitalFit && displayedPlan.capitalFit.capital_usage_pct);
  if(!Number.isFinite(usagePct)) return '(none)';
  return `${(usagePct * 100).toFixed(0)}%`;
}

function currentReviewCapitalSimulation(ticker){
  const symbol = normalizeTicker(ticker);
  const stateValue = uiState.reviewCapitalSimulation && typeof uiState.reviewCapitalSimulation === 'object'
    ? uiState.reviewCapitalSimulation
    : {ticker:'', usagePercent:null};
  if(!symbol || normalizeTicker(stateValue.ticker) !== symbol) return null;
  const usagePercent = numericOrNull(stateValue.usagePercent);
  if(!Number.isFinite(usagePercent) || usagePercent <= 0) return null;
  return {ticker:symbol, usagePercent};
}

function setReviewCapitalSimulation(ticker, usagePercent = null){
  const symbol = normalizeTicker(ticker);
  const usage = numericOrNull(usagePercent);
  if(!symbol || !Number.isFinite(usage) || usage <= 0){
    uiState.reviewCapitalSimulation = {ticker:'', usagePercent:null};
    return;
  }
  uiState.reviewCapitalSimulation = {ticker:symbol, usagePercent:usage};
}

function clearReviewCapitalSimulation(ticker){
  const symbol = normalizeTicker(ticker);
  if(symbol && normalizeTicker(uiState.reviewCapitalSimulation && uiState.reviewCapitalSimulation.ticker) !== symbol) return;
  uiState.reviewCapitalSimulation = {ticker:'', usagePercent:null};
}

function applyReviewCapitalSimulation(displayedPlan, ticker){
  const simulation = currentReviewCapitalSimulation(ticker);
  if(!simulation) return {displayedPlan, simulation:null};
  const plan = displayedPlan && typeof displayedPlan === 'object' ? displayedPlan : {};
  const accountSizeGbp = currentAccountSizeGbp();
  if(!Number.isFinite(accountSizeGbp) || accountSizeGbp <= 0) return {displayedPlan:plan, simulation:null};
  const simulatedCostGbp = accountSizeGbp * simulation.usagePercent;
  const capitalFit = {
    ...(plan.capitalFit && typeof plan.capitalFit === 'object' ? plan.capitalFit : {}),
    capital_fit:classifyCapitalUsage({position_cost_gbp:simulatedCostGbp, account_size_gbp:accountSizeGbp}).usage_bucket,
    capital_usage_pct:simulation.usagePercent,
    capital_usage_bucket:classifyCapitalUsage({position_cost_gbp:simulatedCostGbp, account_size_gbp:accountSizeGbp}).usage_bucket,
    capital_ok:classifyCapitalUsage({position_cost_gbp:simulatedCostGbp, account_size_gbp:accountSizeGbp}).capital_ok,
    position_cost_gbp:simulatedCostGbp,
    position_cost:Number.isFinite(numericOrNull(plan.capitalFit && plan.capitalFit.position_cost)) ? numericOrNull(plan.capitalFit.position_cost) : simulatedCostGbp,
    quote_currency:String(plan.capitalFit && plan.capitalFit.quote_currency || 'GBP'),
    fx_status:String(plan.capitalFit && plan.capitalFit.fx_status || 'native'),
    capital_note:`Debug simulation at ${(simulation.usagePercent * 100).toFixed(0)}% of account size.`
  };
  const simulatedPlan = {
    ...plan,
    capitalFit,
    affordability:deriveAffordability({
      ...capitalFit,
      account_size_gbp:accountSizeGbp
    }),
    tradeability:deriveTradeability(
      plan.status,
      plan.riskFit && plan.riskFit.risk_status,
      capitalFit.capital_fit
    )
  };
  const capitalOnlyTradeability = capitalSimulationTradeability(capitalFit.capital_fit);
  return {
    displayedPlan:simulatedPlan,
    simulation:{
      usagePercent:simulation.usagePercent,
      label:`${Math.round(simulation.usagePercent * 100)}%`,
      capitalFit:capitalFit.capital_fit,
      affordability:simulatedPlan.affordability,
      capitalOk:capitalFit.capital_ok,
      tradeability:capitalOnlyTradeability
    }
  };
}

function capitalSimulationTradeability(capitalFit){
  const fit = String(capitalFit || '').trim().toLowerCase();
  if(['too_heavy','too_expensive'].includes(fit)) return 'too_expensive';
  if(fit === 'heavy') return 'capital_heavy';
  if(['ideal','acceptable','borderline','fits_capital'].includes(fit)) return 'tradable';
  return 'risk_only';
}

function capitalSimulationVerdictImpact(baseVerdict, capitalFit){
  const tradeability = capitalSimulationTradeability(capitalFit);
  const verdict = normalizeAnalysisVerdict(baseVerdict || 'Watch');
  if(tradeability === 'too_expensive') return 'Avoid';
  if(tradeability === 'capital_heavy'){
    if(verdict === 'Entry') return 'Near Entry';
    if(verdict === 'Near Entry') return 'Watch';
    return verdict || 'Watch';
  }
  return verdict || 'Watch';
}

function capitalUsageAdvisory({positionCostGbp, positionCost, quoteCurrency, accountSizeGbp, fxStatus = ''}){
  const accountSize = numericOrNull(accountSizeGbp) || currentAccountSizeGbp();
  if(!Number.isFinite(accountSize) || accountSize <= 0){
    return {ratio:null, label:'', bucket:'unknown', visible:false, estimated:false, conversionStatus:''};
  }
  let reliableCostGbp = numericOrNull(positionCostGbp);
  let estimated = false;
  let conversionStatus = fxStatus || '';
  if(!Number.isFinite(reliableCostGbp)){
    const converted = convertQuoteValueToGbp(positionCost, quoteCurrency);
    reliableCostGbp = converted.gbpValue;
    conversionStatus = converted.conversion === 'live_fx' ? 'converted' : conversionStatus;
    if(!Number.isFinite(reliableCostGbp)){
      reliableCostGbp = numericOrNull(positionCost);
      estimated = Number.isFinite(reliableCostGbp);
      if(estimated) conversionStatus = 'estimated';
    }
  }
  if(!Number.isFinite(reliableCostGbp) || reliableCostGbp < 0){
    return {ratio:null, label:'', bucket:'unknown', visible:false, estimated:false, conversionStatus:conversionStatus || 'unavailable'};
  }
  const classified = classifyCapitalUsage({
    position_cost_gbp:reliableCostGbp,
    account_size_gbp:accountSize
  });
  const ratio = classified.usage_percent;
  const bucket = classified.usage_bucket || 'unknown';
  const labelBase = capitalFitLabel(bucket);
  const label = estimated && labelBase && bucket !== 'unknown' ? `${labelBase} (est.)` : labelBase;
  return {
    ratio,
    label,
    bucket,
    visible:['borderline','heavy','too_heavy','too_expensive'].includes(bucket),
    estimated,
    conversionStatus
  };
}

function capitalComfortSummary({capitalFit, capitalNote, affordability, capitalUsage, planStatus = '', controlQuality = '', capitalEfficiency = ''}){
  const fit = String(capitalFit || '').trim().toLowerCase();
  const bucket = fit || String(capitalUsage && capitalUsage.bucket || '').trim().toLowerCase();
  const conversionStatus = String(capitalUsage && capitalUsage.conversionStatus || '').trim();
  const normalizedPlanStatus = String(planStatus || '').trim().toLowerCase();
  const convertedFx = conversionStatus === 'converted' || /FX converted/i.test(String(capitalNote || ''));
  const estimatedFx = conversionStatus === 'estimated' || !!(capitalUsage && capitalUsage.estimated) || /FX estimated/i.test(String(capitalNote || ''));
  const statusNote = convertedFx ? 'Capital check: FX converted' : (estimatedFx ? 'Capital check: FX estimated' : '');
  if(affordability === 'not_affordable' || ['too_heavy','too_expensive'].includes(bucket)){
    return {label:bucket === 'too_heavy' ? 'Too heavy' : 'Too expensive', note:statusNote || (bucket === 'too_heavy' ? 'Position would use too much account capital.' : 'Over account size')};
  }
  if(affordability === 'heavy_capital' || bucket === 'heavy'){
    return {label:'Heavy', note:statusNote || 'Capital usage is heavy for this account size.'};
  }
  if(bucket === 'borderline') return {label:'Borderline', note:statusNote};
  if(bucket === 'acceptable' || bucket === 'fits_capital') return {label:'Acceptable', note:statusNote};
  if(bucket === 'ideal') return {label:'Ideal', note:statusNote};
  if(statusNote) return {label:'Not available', note:statusNote};
  if(normalizedPlanStatus && normalizedPlanStatus !== 'valid'){
    return {label:'Not available', note:'Shown when no valid plan is defined'};
  }
  if(conversionStatus === 'unavailable' || /fx unavailable|fx missing|conversion unavailable|capital fit cannot be confirmed|affordability could not be verified/i.test(String(capitalNote || ''))){
    return {label:'Not available', note:'Capital check unresolved due to unavailable FX conversion.'};
  }
  return {label:'Not available', note:'Plan is defined, but capital fit cannot be confirmed.'};
}

function capitalFitPresentation({capitalFit, affordability, comfortLabel}){
  const fit = String(capitalFit || '').trim().toLowerCase();
  const afford = String(affordability || '').trim().toLowerCase();
  const comfort = String(comfortLabel || '').trim().toLowerCase();
  if(afford === 'not_affordable' || fit === 'too_expensive') return {className:'capital-fit--too-expensive', icon:'⛔', text:'TOO EXPENSIVE'};
  if(fit === 'too_heavy' || comfort.includes('too heavy')) return {className:'capital-fit--stretch', icon:'⚠', text:'TOO HEAVY'};
  if(comfort.includes('heavy')) return {className:'capital-fit--heavy', icon:'⚠', text:'HEAVY'};
  if(comfort.includes('ideal')) return {className:'capital-fit--comfortable', icon:'✓', text:'IDEAL'};
  if(comfort.includes('acceptable')) return {className:'capital-fit--manageable', icon:'•', text:'ACCEPTABLE'};
  if(comfort.includes('borderline')) return {className:'capital-fit--manageable', icon:'•', text:'BORDERLINE'};
  return {className:'capital-fit--unknown', icon:'•', text:String(comfortLabel || 'UNKNOWN').toUpperCase()};
}

function tradeabilityLabel(tradeability){
  return tradeabilityLabelImpl(tradeability);
}

function capitalFitMetricText(capitalComfortLabel){
  return capitalFitMetricTextImpl(capitalComfortLabel, reviewPresentationBridgeDeps());
}

function joinNaturalLanguageConditions(conditions){
  const parts = Array.isArray(conditions) ? conditions.filter(Boolean).slice(0, 2) : [];
  if(!parts.length) return '';
  if(parts.length === 1) return parts[0];
  if(parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts[0]} and ${parts[1]}`;
}

function buildValidityConditionSummary({
  finalVerdict,
  entryGateChecks,
  nearEntryGateChecks,
  structureState,
  bounceState,
  rrConfidence,
  pullbackState
}){
  const verdict = normalizeGlobalVerdictKey(finalVerdict || '');
  const base = verdict === 'near_entry'
    ? 'Almost valid - watch for confirmation'
    : 'Only valid if the stock proves strength';
  const checks = verdict === 'near_entry' && nearEntryGateChecks && typeof nearEntryGateChecks === 'object'
    ? nearEntryGateChecks
    : (entryGateChecks && typeof entryGateChecks === 'object' && Object.keys(entryGateChecks).length
      ? entryGateChecks
      : (nearEntryGateChecks && typeof nearEntryGateChecks === 'object' ? nearEntryGateChecks : {}));
  const unmet = [];
  const pushCondition = value => {
    if(value && !unmet.includes(value) && unmet.length < 2) unmet.push(value);
  };
  const bounce = String(bounceState || '').trim().toLowerCase();
  const structure = String(structureState || '').trim().toLowerCase();
  const rr = String(rrConfidence || '').trim().toLowerCase();
  const pullback = String(pullbackState || '').trim().toLowerCase();

  if(checks.bounce_ok === false){
    if(bounce === 'none') pushCondition('a bounce');
    else pushCondition('a confirmed bounce');
  }
  if(checks.structure_ok === false){
    pushCondition(structure === 'broken' ? 'stabilising structure' : 'stabilising structure');
  }
  if(checks.pullback_ok === false){
    pushCondition(pullback === 'none' ? 'a cleaner pullback' : 'a cleaner pullback');
  }
  if(checks.rr_ok === false){
    pushCondition(rr === 'low confidence' || rr === 'low' || rr === 'invalid plan' || rr === 'invalid'
      ? 'a more realistic target'
      : 'a more realistic target');
  }

  return {
    line1:base,
    line2:unmet.length ? `Needs ${joinNaturalLanguageConditions(unmet)}` : ''
  };
}

function renderTradeStatusMarkup(status){
  return renderTradeStatusMarkupImpl(status, reviewPresentationBridgeDeps());
}

function blockedTradeStatusFromPrimaryBlocker(resolvedContract){
  const weakBounceHeadline = 'Bounce is too weak to price cleanly.';
  const weakBounceSubline = 'Buyers have not taken control yet.';
  const blockerCode = String(resolvedContract && resolvedContract.blockerCode || '').trim().toLowerCase();
  const blockerReason = String(resolvedContract && resolvedContract.blockerReason || '').trim().toLowerCase();
  if(['plan_invalid','plan_missing','plan_adjustment'].includes(blockerCode) || blockerReason.includes('invalid plan') || blockerReason.includes('plan not defined') || blockerReason.includes('plan needs adjustment')){
    return {
      line1:'No valid trade',
      line2:'Entry, stop, and target do not form a usable setup'
    };
  }
  if(['rr_unrealistic'].includes(blockerCode) || blockerReason.includes('target is too optimistic') || blockerReason.includes('low-confidence rr')){
    return {
      line1:'Reward too small for the risk',
      line2:'Target is too close relative to the stop'
    };
  }
  if(['bounce_not_confirmed','near_trigger','weak_volume','weak_market','weak_control','early_confirmation'].includes(blockerCode) || blockerReason.includes('bounce not confirmed') || blockerReason.includes('needs better confirmation')){
    return {
      line1:weakBounceHeadline,
      line2:weakBounceSubline
    };
  }
  if(['broken_trend','broken_structure','setup_invalidated','weak_structure'].includes(blockerCode) || blockerReason.includes('structure is broken') || blockerReason.includes('trend is invalidated') || blockerReason.includes('structure is weak')){
    return {
      line1:'No valid trade',
      line2:'Price action is no longer holding up cleanly'
    };
  }
  if(['risk_too_wide'].includes(blockerCode) || blockerReason.includes('risk too wide')){
    return {
      line1:'Risk too high',
      line2:`Stop would be too wide for ${formatPound(currentMaxLoss())} risk`
    };
  }
  return {
    line1:weakBounceHeadline,
    line2:weakBounceSubline
  };
}

function blockedTradeStatusText(resolvedContract){
  const status = blockedTradeStatusFromPrimaryBlocker(resolvedContract);
  return status.line2 ? `${status.line1} | ${status.line2}` : status.line1;
}

function stateLabelForDecisionSummary(finalVerdict){
  const verdict = normalizeVerdict(finalVerdict || '');
  if(verdict === 'entry') return 'Entry';
  if(verdict === 'near_entry') return 'Near Entry';
  if(verdict === 'avoid') return 'Avoid';
  return 'Monitor';
}

function buildDecisionSummary({finalVerdict, displayedPlan, resolvedContract, derivedStates}){
  const verdict = normalizeVerdict(finalVerdict || '');
  if(verdict === 'entry') return 'Entry - your plan fits.';
  if(verdict === 'near_entry') return 'Near Entry - almost ready. Watch for confirmation.';
  if(verdict === 'avoid') return 'Avoid - too weak or broken. Leave it alone.';
  const structureState = String(derivedStates && derivedStates.structureState || '').toLowerCase();
  const structuralState = String(resolvedContract && resolvedContract.structuralState || '').toLowerCase();
  const developingState = structuralState === 'developing' || ['developing','developing_loose','developing_clean'].includes(structureState);
  return developingState
    ? 'Developing - still forming. Buyers have not taken control yet.'
    : 'Monitor - still forming. Buyers have not taken control yet.';
}

function isWatchlistAvoidBucket(bucket){
  const value = String(bucket || '').trim().toLowerCase();
  return value === 'low_priority_avoid' || value === 'lower_priority' || value === 'avoid' || value === 'dead' || value === 'inactive';
}

function watchlistStrictAvoidTruth(record, globalVerdict, lifecycleSnapshot){
  const item = normalizeTickerRecord(record || {});
  const debug = item.watchlist && item.watchlist.debug && typeof item.watchlist.debug === 'object' ? item.watchlist.debug : {};
  const strictFinalVerdict = normalizeVerdict(globalVerdict && globalVerdict.final_verdict || '');
  const lifecycleVerdict = normalizeVerdict(lifecycleSnapshot && lifecycleSnapshot.state || '');
  const removalVerdict = normalizeVerdict(debug.removal_global_verdict || '');
  const removedByGate = String(debug.watchlist_removed_by || '').trim().toLowerCase() === 'global_verdict_gate';
  const allowWatchlist = !!(globalVerdict && globalVerdict.allow_watchlist);
  const strictBucketAvoid = isWatchlistAvoidBucket(globalVerdict && globalVerdict.bucket)
    || isWatchlistAvoidBucket(lifecycleSnapshot && lifecycleSnapshot.bucket);
  return strictFinalVerdict === 'avoid'
    || lifecycleVerdict === 'avoid'
    || removalVerdict === 'avoid'
    || removedByGate
    || !allowWatchlist
    || strictBucketAvoid;
}

function watchlistPresentationBucketForRecord(record){
  const item = normalizeTickerRecord(record || {});
  const strictVerdict = resolveGlobalVerdict(item);
  const lifecycleSnapshot = watchlistLifecycleSnapshot(item);
  const priority = watchlistPriorityForRecord(item);
  if(['dead','expired'].includes(String(lifecycleSnapshot && lifecycleSnapshot.state || '').toLowerCase())){
    return priority.bucket || 'inactive';
  }
  if(watchlistStrictAvoidTruth(item, strictVerdict, lifecycleSnapshot)) return 'low_priority_avoid';
  return priority.bucket || 'monitor_watch';
}

function reconcileWatchlistPresentation({
  record,
  visualState,
  globalVerdict,
  lifecycleSnapshot,
  resolvedContract,
  derivedStates,
  displayedPlan
} = {}){
  const item = normalizeTickerRecord(record || {});
  const base = visualState && typeof visualState === 'object' ? {...visualState} : {};
  const softVerdict = normalizeVerdict(base.finalVerdict || base.final_verdict || '');
  const strictAvoidTruth = watchlistStrictAvoidTruth(item, globalVerdict, lifecycleSnapshot);
  if(!(strictAvoidTruth && softVerdict !== 'avoid')){
    return {
      ...base,
      watchlist_presentation_source:base.watchlist_presentation_source || 'soft_display'
    };
  }
  const summary = buildDecisionSummary({
    finalVerdict:'avoid',
    displayedPlan,
    resolvedContract,
    derivedStates
  });
  return {
    ...base,
    state:'avoid',
    finalVerdict:'avoid',
    final_verdict:'avoid',
    final_verdict_rendered:'avoid',
    bucket:'low_priority_avoid',
    bucket_rendered:'low_priority_avoid',
    badge:getBadge('avoid'),
    tone:getTone('avoid'),
    className:'tone-red',
    toneClass:'tone-red',
    visual_tone:'danger',
    decision_summary:summary,
    conflicting_legacy_state_detected:true,
    watchlist_presentation_source:'strict_reconciled',
    ui_state_source:`${base.ui_state_source || 'resolveFinalStateContract'}|strict_reconciled`
  };
}

function resolveSetupPatternUi({
  setupScore,
  verdict,
  structureState,
  trendState,
  bounceState,
  stabilisationState,
  pullbackState,
  volumeState,
  planStatus,
  rrConfidence,
  entryChecks
} = {}){
  const numericSetupScore = Number.isFinite(Number(setupScore)) ? Number(setupScore) : null;
  const structureWeak = ['weak','weakening','developing_loose'].includes(structureState);
  const structureBroken = structureState === 'broken';
  const bounceNone = ['none','unconfirmed','early'].includes(bounceState);
  const bounceAttempt = bounceState === 'attempt';
  const bounceConfirmed = bounceState === 'confirmed';
  const pullbackValid = ['near_20ma','near_50ma','at_20ma','at_50ma'].includes(pullbackState);
  const planUnclear = ['missing','invalid','needs_adjustment','unrealistic_rr'].includes(planStatus) || entryChecks.plan_ok === false;
  const volumeWeak = volumeState === 'weak' || entryChecks.volume_ok === false;
  const trendWeak = ['weak','weakening','down'].includes(trendState);
  const rrWeak = entryChecks.rr_ok === false || /low|invalid/.test(rrConfidence || '');
  const stabilising = ['clear','early'].includes(stabilisationState);
  const nearReady = verdict === 'near_entry' || (entryChecks.bounce_ok === true && entryChecks.structure_ok === true && pullbackValid);
  const damagePoints = [
    structureWeak,
    trendWeak,
    volumeWeak,
    planUnclear,
    !pullbackValid,
    rrWeak
  ].filter(Boolean).length;
  const constructiveStabilisation = stabilisationState === 'clear' && pullbackValid && !trendWeak;

  const developingStructure = ['developing','developing_clean','developing_loose'].includes(structureState);
  const developingBounce = ['attempt','early','unconfirmed'].includes(bounceState);
  const readyStructureStates = ['strong','intact','developing_clean'];

  // 1) High risk / breaking structure
  if(
    (Number.isFinite(numericSetupScore) && numericSetupScore <= 3)
    || structureState === 'broken'
    || (structureState === 'weak' && bounceState === 'none')
  ){
    return {id:'falling_knife', label:'Falling knife', explanation:'no clear bottom yet', footer:'Wait for price to stabilise and bounce before entry.'};
  }

  // 2) Weak / deteriorating structure
  if(
    (Number.isFinite(numericSetupScore) && numericSetupScore >= 4 && numericSetupScore <= 6)
    || structureState === 'weakening'
    || bounceState === 'none'
  ){
    return {id:'weak_pullback', label:'Weak pullback', explanation:'low buying interest', footer:'Wait for a reclaim and stronger close before entry.'};
  }

  // 3) Developing structure primary case (exact required sentence)
  if(developingStructure && developingBounce){
    return {id:'developing_primary', label:'Developing', explanation:'Buyers have not taken control yet.', footer:'Wait for a reclaim and stronger close before entry.'};
  }

  // 5) Near confirmation (requires strong structure quality)
  if(
    Number.isFinite(numericSetupScore)
    && numericSetupScore >= 8
    && bounceState === 'confirmed'
    && readyStructureStates.includes(structureState)
  ){
    return {id:'near_confirmation', label:'Pullback ready', explanation:'confirmation forming', footer:'Watch for entry trigger to remain valid on close.'};
  }

  // 4) Stronger / healthy pullback
  if(
    Number.isFinite(numericSetupScore)
    && numericSetupScore >= 7
    && readyStructureStates.includes(structureState)
    && bounceState !== 'none'
  ){
    return {id:'healthy_pullback', label:'Pullback developing', explanation:'needs confirmation', footer:'Watch for entry trigger to remain valid on close.'};
  }

  // Keep existing granular fallback cues for internal secondary hints.
  if(!structureBroken && bounceAttempt && (structureWeak || volumeWeak || planUnclear || rrWeak) && damagePoints >= 2){
    return {id:'weak_bounce', label:'Weak bounce', explanation:'buyers have not taken control yet', footer:'Wait for a reclaim and stronger close before entry.'};
  }
  if(!structureBroken && !pullbackValid && bounceNone && structureWeak){
    return {id:'no_clean_setup', label:'No clean setup', explanation:'price action is too messy', footer:'Wait for cleaner structure before entry can be assessed.'};
  }
  if(!structureBroken && nearReady && (bounceConfirmed || bounceAttempt)){
    return {id:'bounce_confirming', label:'Bounce confirming', explanation:'entry is getting closer', footer:'If this follows through, the app can price entry, stop, and size.'};
  }
  if(!structureBroken && stabilising && bounceAttempt){
    return {id:'higher_low_forming', label:'Higher low forming', explanation:'early support may be building', footer:'If support holds, a valid entry may develop.'};
  }
  if(!structureBroken && pullbackValid && !structureWeak){
    return {id:'constructive_pullback', label:'Constructive pullback', explanation:'support is holding so far', footer:'Watch for bounce confirmation from support.'};
  }
  return {id:'no_clean_setup', label:'No clean setup', explanation:'price action is too messy', footer:'Wait for clearer structure and bounce before entry.'};
}

function entryTriggerConditionForSummary({bounceState, pullbackState, volumeState, structureState} = {}){
  const bounce = String(bounceState || '').trim().toLowerCase();
  const structure = String(structureState || '').trim().toLowerCase();
  const pullback = String(pullbackState || '').trim().toLowerCase();
  const volume = String(volumeState || '').trim().toLowerCase();

  // 1) No bounce: always prioritize structure formation.
  if(bounce === 'none'){
    return 'Higher low & breaks prior high';
  }

  // 4) Weak-structure override for safer confirmation wording.
  if(['weakening','developing_loose'].includes(structure)){
    if(pullback === 'near_20ma') return 'Strong close above prior high & holds 20MA';
    if(pullback === 'near_50ma') return 'Reclaims 50MA & strong close with volume';
  }

  // 2) Early/attempt bounce.
  if(bounce === 'attempt'){
    if(pullback === 'near_20ma') return 'Strong close above prior high & holds 20MA';
    if(pullback === 'near_50ma') return 'Reclaims 50MA & strong close with volume';
    return 'Strong close above prior high & holds level';
  }

  // 3) Confirmed bounce.
  if(bounce === 'confirmed'){
    if(volume === 'weak') return 'Breaks prior high & volume expands';
    if(['strong','intact'].includes(structure)) return 'Breaks prior high & holds above level';
  }

  // 5) Fallback.
  return 'Breaks prior high & holds above level';
}

function nextUpgradeStateForSummary(verdict){
  const safe = normalizeVerdict(verdict || '');
  if(safe === 'developing') return '🟡 Monitor';
  if(safe === 'near_entry') return '🚀 Entry';
  if(safe === 'monitor') return '🎯 Near Entry';
  return '🎯 Near Entry';
}

function nextUpgradeStateForSummaryLabel(verdict){
  const safe = normalizeVerdict(verdict || '');
  if(safe === 'developing') return '\uD83D\uDFE1 Monitor';
  if(safe === 'near_entry') return '\uD83D\uDE80 Entry';
  if(safe === 'monitor') return '\uD83C\uDFAF Near Entry';
  return '\uD83C\uDFAF Near Entry';
}

function buildEntryConditionsSummary({
  ticker,
  finalVerdict,
  resolvedContract,
  globalVerdict,
  derivedStates,
  displayedPlan
} = {}){
  const verdict = normalizeVerdict(finalVerdict || (globalVerdict && globalVerdict.final_verdict) || '');
  const structureState = String((derivedStates && derivedStates.structureState) || (globalVerdict && globalVerdict.structure_state) || '').toLowerCase();
  const bounceState = String((derivedStates && derivedStates.bounceState) || (globalVerdict && globalVerdict.bounce_state) || '').toLowerCase();
  const stabilisationState = String((derivedStates && derivedStates.stabilisationState) || '').toLowerCase();
  const volumeState = String((derivedStates && derivedStates.volumeState) || (globalVerdict && globalVerdict.volume_state) || '').toLowerCase();
  const pullbackState = String((derivedStates && derivedStates.pullbackZone) || (globalVerdict && globalVerdict.pullback_zone) || '').toLowerCase();
  const planStatus = String((resolvedContract && resolvedContract.planStatusKey) || '').toLowerCase();
  const rrConfidence = String((resolvedContract && resolvedContract.rrConfidenceLabel) || '').toLowerCase();
  const structuralState = String((resolvedContract && resolvedContract.structuralState) || '').toLowerCase();
  const entryChecks = globalVerdict && typeof globalVerdict.entry_gate_checks === 'object'
    ? globalVerdict.entry_gate_checks
    : {};
  const entryGatePass = !!(globalVerdict && globalVerdict.entry_gate_pass);
  const capitalFit = String(displayedPlan && displayedPlan.capitalFit && displayedPlan.capitalFit.capital_fit || '').toLowerCase();
  const affordability = String(displayedPlan && displayedPlan.affordability || '').toLowerCase();
  const pattern = resolveSetupPatternUi({
    setupScore:Number.isFinite(globalVerdict && globalVerdict.setup_score) ? globalVerdict.setup_score : null,
    verdict,
    structureState,
    trendState:String((derivedStates && derivedStates.trendState) || '').toLowerCase(),
    bounceState,
    stabilisationState,
    pullbackState,
    volumeState,
    planStatus,
    rrConfidence,
    entryChecks
  });

  if(['avoid'].includes(verdict)) return {show:false};
  if(verdict === 'entry' && entryGatePass){
    return {
      show:false,
      ready:true,
      header:'🚀 Entry - Ready',
      primary:'Entry conditions are satisfied.',
      secondary:[],
      triggerLine:'Becomes actionable IF: entry trigger stays valid on close.',
      futureStateLine:'Upgrades to: \uD83D\uDE80 Entry.',
      footer:'Becomes actionable IF: entry trigger stays valid on close. Upgrades to: \uD83D\uDE80 Entry.'
    };
  }

  const blockers = [];
  const addBlocker = (id, priority, primary, secondary) => {
    if(blockers.some(entry => entry.id === id)) return;
    blockers.push({id, priority, primary, secondary});
  };

  if(entryChecks.structure_ok === false || ['weak','weakening','developing_loose','broken'].includes(structureState)){
    addBlocker('structure', 1, 'Trend needs to stabilise', 'Structure still weakening');
  }
  if(entryChecks.bounce_ok === false || ['none','attempt','early','unconfirmed'].includes(bounceState)){
    addBlocker('bounce', 2, 'Bounce is still tentative', bounceState === 'none' ? 'Bounce has not formed yet' : 'Buyers have not taken control yet');
  }
  if(entryChecks.plan_ok === false || ['missing','invalid','needs_adjustment','unrealistic_rr'].includes(planStatus)){
    addBlocker('plan', 3, 'A valid entry and stop are not available yet', 'Trade structure is not clear enough to price safely');
  }
  if(entryChecks.volume_ok === false || volumeState === 'weak'){
    addBlocker('volume', 4, 'Volume needs to improve', 'Buyers need to show stronger participation');
  }
  if(entryChecks.pullback_ok === false || ['none','off_level','extended','deep'].includes(pullbackState)){
    addBlocker('pullback', 5, 'Price must move into a cleaner pullback area', 'Price is not in a valid pullback zone yet');
  }
  if(entryChecks.rr_ok === false || /low|invalid/.test(rrConfidence)){
    addBlocker('reward', 6, 'Target needs more upside versus the stop', 'Target remains too close compared with risk');
  }
  if((capitalFit === 'too_heavy' || capitalFit === 'too_expensive') || affordability === 'not_affordable'){
    addBlocker('capital', 7, 'This setup does not currently fit the saved risk limit', 'Risk cannot be sized safely with current account settings');
  }
  if(!blockers.length){
    addBlocker('confirmation', 8, 'Bounce is too weak to price cleanly.', 'No trustworthy entry yet.');
  }

  blockers.sort((a, b) => a.priority - b.priority);
  const secondary = [];
  const addSecondary = text => {
    const line = String(text || '').trim();
    if(!line || secondary.includes(line) || secondary.length >= 3) return;
    secondary.push(line);
  };
  if(pattern.id === 'falling_knife'){
    if(['none','unconfirmed','early'].includes(bounceState)) addSecondary('No clear bounce yet');
    if(['weak','weakening','developing_loose'].includes(structureState)) addSecondary('Structure still weakening');
    if(volumeState === 'weak') addSecondary('Volume still weak');
  }else if(pattern.id === 'weak_bounce'){
    addSecondary('Bounce is still tentative');
    if(['weak','weakening','developing_loose'].includes(structureState)) addSecondary('Structure remains loose');
    if(entryChecks.rr_ok === false || /low|invalid/.test(rrConfidence)) addSecondary('Target is still too close for the stop');
  }else if(pattern.id === 'constructive_pullback'){
    addSecondary('Price is near a valid pullback area');
    addSecondary('Structure is still intact');
    if(entryChecks.bounce_ok === false) addSecondary('Bounce trigger candle has not printed yet');
  }else if(pattern.id === 'higher_low_forming'){
    addSecondary('Support is trying to hold');
    addSecondary('Bounce quality is improving');
    if(entryChecks.bounce_ok === false) addSecondary('Bounce trigger candle has not printed yet');
  }else if(pattern.id === 'bounce_confirming'){
    addSecondary('Support is holding');
    addSecondary('Bounce quality is improving');
    if(volumeState === 'weak' || entryChecks.volume_ok === false) addSecondary('Volume could still improve');
  }
  if(!secondary.length){
    blockers.slice(0, 3).forEach(entry => addSecondary(entry.secondary));
  }
  if((capitalFit === 'too_heavy' || capitalFit === 'too_expensive' || affordability === 'not_affordable') && secondary.length < 3){
    addSecondary('Current risk limit is too tight for this setup');
  }
  const header = (structuralState === 'developing' || structureState === 'developing_loose')
    ? '🌱 Developing - still forming'
    : (verdict === 'near_entry' ? '🎯 Near Entry - Almost there' : '🟡 Monitor - Not ready');
  const triggerCondition = entryTriggerConditionForSummary({
    bounceState,
    pullbackState,
    volumeState,
    structureState
  });
  const nextUpgrade = nextUpgradeStateForSummaryLabel(
    (structuralState === 'developing' || structureState === 'developing_loose')
      ? 'developing'
      : (verdict || 'monitor')
  );
  const triggerLine = `Becomes actionable IF: ${triggerCondition}.`;
  const futureStateLine = `Upgrades to: ${nextUpgrade}.`;
  const footer = `${triggerLine} ${futureStateLine}`;
  const normalizedHeader = (structuralState === 'developing' || structureState === 'developing_loose')
    ? '\uD83C\uDF31 Developing - still forming'
    : (verdict === 'near_entry' ? '\uD83C\uDFAF Near Entry - Almost there' : '\uD83D\uDFE1 Monitor - Not ready');

  return {
    show:true,
    ready:false,
    ticker:normalizeTicker(ticker || ''),
    header:normalizedHeader,
    primary:`${pattern.label} - ${pattern.explanation}`,
    pattern_label:pattern.label,
    pattern_explanation:pattern.explanation,
    secondary,
    triggerLine,
    futureStateLine,
    footer
  };
}

function entryConditionsPanelId(scope, ticker){
  const safeScope = String(scope || 'review').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  const safeTicker = String(ticker || '').toUpperCase().replace(/[^A-Z0-9_-]/g, '_') || 'TICKER';
  return `entry-conditions-${safeScope}-${safeTicker}`;
}

function renderEntryConditionsHoldHelper(summary, scope, ticker, options = {}){
  const details = summary && typeof summary === 'object' ? summary : null;
  if(!details || !details.show) return '';
  const panelId = entryConditionsPanelId(scope, ticker || details.ticker || '');
  const secondaryMarkup = (details.secondary || [])
    .slice(0, 3)
    .map(line => `<li>${escapeHtml(String(line || ''))}</li>`)
    .join('');
  const triggerLine = String(details.triggerLine || '').trim();
  const futureStateLine = String(details.futureStateLine || '').trim();
  const fallbackFooter = String(details.footer || 'When these conditions improve, the app can price entry, stop, and risk.').trim();
  if(options.mode === 'card'){
    return `<div class="entry-conditions-panel entry-conditions-panel--card no-card-click" id="${escapeHtml(panelId)}" hidden>
      <div class="entry-conditions-header"><strong>Status:</strong> ${escapeHtml(details.header || 'Monitor - Not ready')}</div>
      <div class="entry-conditions-pattern"><strong>Core Problem:</strong> ${escapeHtml(details.primary || 'No clean setup - price action is too messy')}</div>
      ${secondaryMarkup ? `<div class="entry-conditions-footer"><strong>Holding it back:</strong></div>` : ''}
      ${secondaryMarkup ? `<ul class="entry-conditions-list">${secondaryMarkup}</ul>` : ''}
      ${triggerLine ? `<div class="entry-conditions-footer">${escapeHtml(triggerLine)}</div>` : ''}
      ${futureStateLine ? `<div class="entry-conditions-footer">${escapeHtml(futureStateLine)}</div>` : (!triggerLine ? `<div class="entry-conditions-footer">${escapeHtml(fallbackFooter)}</div>` : '')}
    </div>`;
  }
  return `<div class="entry-conditions-helper no-card-click" data-entry-hold-helper>
    <button class="secondary compactbutton entry-conditions-trigger no-card-click" type="button" data-hold-entry-helper data-panel-id="${escapeHtml(panelId)}" data-hold-ms="650">Hold for Entry Conditions</button>
    <div class="entry-conditions-panel no-card-click" id="${escapeHtml(panelId)}" hidden>
      <div class="entry-conditions-header"><strong>Status:</strong> ${escapeHtml(details.header || 'Monitor - Not ready')}</div>
      <div class="entry-conditions-pattern"><strong>Core Problem:</strong> ${escapeHtml(details.primary || 'No clean setup - price action is too messy')}</div>
      ${secondaryMarkup ? `<div class="entry-conditions-footer"><strong>Holding it back:</strong></div>` : ''}
      ${secondaryMarkup ? `<ul class="entry-conditions-list">${secondaryMarkup}</ul>` : ''}
      ${triggerLine ? `<div class="entry-conditions-footer">${escapeHtml(triggerLine)}</div>` : ''}
      ${futureStateLine ? `<div class="entry-conditions-footer">${escapeHtml(futureStateLine)}</div>` : (!triggerLine ? `<div class="entry-conditions-footer">${escapeHtml(fallbackFooter)}</div>` : '')}
    </div>
  </div>`;
}

let entryConditionsOutsideCloseBound = false;
function closeEntryConditionsPanels(exceptId = ''){
  document.querySelectorAll('.entry-conditions-panel.is-open').forEach(panel => {
    if(exceptId && panel.id === exceptId) return;
    panel.classList.remove('is-open');
    panel.hidden = true;
    if(panel.id){
      document.querySelectorAll(`[data-panel-id="${panel.id}"]`).forEach(node => {
        if(node && node.classList){
          node.classList.remove('hold-open');
          node.classList.remove('hold-armed');
        }
      });
    }
  });
}

function setWatchlistHoldTrace(ticker, message){
  const symbol = normalizeTicker(ticker);
  if(!symbol) return;
  const record = upsertTickerRecord(symbol);
  if(!record || !record.watchlist) return;
  record.watchlist.debug = record.watchlist.debug && typeof record.watchlist.debug === 'object' ? record.watchlist.debug : {};
  const stamp = new Date().toISOString();
  record.watchlist.debug.holdTrace = `${message} | ${stamp}`;
  const trail = Array.isArray(record.watchlist.debug.holdTraceHistory) ? record.watchlist.debug.holdTraceHistory : [];
  record.watchlist.debug.holdTraceHistory = [`${message} | ${stamp}`, ...trail].slice(0, 8);
  if(typeof document !== 'undefined'){
    const latest = record.watchlist.debug.holdTrace || '(none)';
    const historyText = Array.isArray(record.watchlist.debug.holdTraceHistory) && record.watchlist.debug.holdTraceHistory.length
      ? record.watchlist.debug.holdTraceHistory.join(' || ')
      : '(none)';
    document.querySelectorAll(`[data-watchlist-hold-trace="${symbol}"]`).forEach(node => {
      node.textContent = latest;
    });
    document.querySelectorAll(`[data-watchlist-hold-trace-history="${symbol}"]`).forEach(node => {
      node.textContent = historyText;
    });
  }
}

function holdTargetDescriptor(target){
  if(!target || typeof target !== 'object') return 'unknown';
  const tag = String(target.tagName || 'node').toLowerCase();
  const id = target.id ? `#${target.id}` : '';
  const cls = target.classList && target.classList.length ? `.${Array.from(target.classList).slice(0, 2).join('.')}` : '';
  return `${tag}${id}${cls}`;
}

function bindEntryConditionsHoldInteractions(root){
  const scopeRoot = root && typeof root.querySelectorAll === 'function' ? root : document;
  if(!entryConditionsOutsideCloseBound){
    document.addEventListener('pointerdown', event => {
      if(event.target && event.target.closest && event.target.closest('[data-entry-hold-helper]')) return;
      closeEntryConditionsPanels();
    }, true);
    entryConditionsOutsideCloseBound = true;
  }
  const helperNodes = [];
  if(scopeRoot && scopeRoot.nodeType === 1 && scopeRoot.matches && scopeRoot.matches('[data-entry-hold-helper]')){
    helperNodes.push(scopeRoot);
  }
  scopeRoot.querySelectorAll('[data-entry-hold-helper]').forEach(node => helperNodes.push(node));
  helperNodes.forEach(helper => {
    if(helper.dataset.boundHoldHelper === '1') return;
    const cardMode = helper.getAttribute('data-hold-card-trigger') === '1';
    const holdTicker = normalizeTicker(helper.getAttribute('data-hold-ticker') || '');
    const trigger = helper.querySelector('[data-hold-entry-helper]') || (cardMode ? helper : null);
    if(!trigger) return;
    const panelId = String(trigger.getAttribute('data-panel-id') || helper.getAttribute('data-panel-id') || '');
    const panel = panelId
      ? (document.getElementById(panelId) || helper.querySelector('.entry-conditions-panel'))
      : helper.querySelector('.entry-conditions-panel');
    if(!panel){
      if(holdTicker) setWatchlistHoldTrace(holdTicker, 'hold_helper.bind_skipped_panel_not_found');
      return;
    }
    helper.dataset.boundHoldHelper = '1';
    if(holdTicker) setWatchlistHoldTrace(holdTicker, 'hold_helper.bound');
    const holdMs = Number.parseInt(String(trigger.getAttribute('data-hold-ms') || helper.getAttribute('data-hold-ms') || '550'), 10);
    const state = {
      timer:0,
      pointerId:null,
      startX:0,
      startY:0,
      holdOpened:false,
      suppressClick:false
    };
    const clearTimer = () => {
      if(state.timer){
        clearTimeout(state.timer);
        state.timer = 0;
      }
    };
    const openPanel = () => {
      closeEntryConditionsPanels(panel.id);
      panel.hidden = false;
      panel.classList.add('is-open');
      helper.classList.add('hold-open');
      state.holdOpened = true;
      state.suppressClick = true;
      if(holdTicker) setWatchlistHoldTrace(holdTicker, 'hold_panel.opened');
    };
    const closePanel = () => {
      panel.classList.remove('is-open');
      panel.hidden = true;
      helper.classList.remove('hold-open');
      state.holdOpened = false;
      if(holdTicker) setWatchlistHoldTrace(holdTicker, 'hold_panel.closed');
    };
    const resetPointer = () => {
      clearTimer();
      state.pointerId = null;
      state.startX = 0;
      state.startY = 0;
      helper.classList.remove('hold-armed');
    };
    const ignoreSelector = 'button,a,input,textarea,select,.entry-conditions-panel';
    trigger.addEventListener('pointerdown', event => {
      if(event.pointerType === 'mouse' && event.button !== 0) return;
      if(cardMode && event.target && event.target.closest && event.target.closest(ignoreSelector)){
        if(holdTicker) setWatchlistHoldTrace(holdTicker, `hold_start.ignored_interactive_target target=${holdTargetDescriptor(event.target)}`);
        return;
      }
      state.pointerId = event.pointerId;
      if(typeof trigger.setPointerCapture === 'function'){
        try{ trigger.setPointerCapture(event.pointerId); }catch(_){}
      }
      state.startX = Number(event.clientX || 0);
      state.startY = Number(event.clientY || 0);
      state.holdOpened = false;
      clearTimer();
      helper.classList.add('hold-armed');
      if(holdTicker) setWatchlistHoldTrace(holdTicker, `hold_start.pointerdown (${event.pointerType || 'unknown'})`);
      state.timer = setTimeout(openPanel, Number.isFinite(holdMs) ? holdMs : 650);
      if(holdTicker) setWatchlistHoldTrace(holdTicker, `hold_timer.started (${Number.isFinite(holdMs) ? holdMs : 650}ms)`);
    });
    trigger.addEventListener('pointermove', event => {
      if(state.pointerId == null || event.pointerId !== state.pointerId) return;
      const dx = Math.abs(Number(event.clientX || 0) - state.startX);
      const dy = Math.abs(Number(event.clientY || 0) - state.startY);
      const cancelThreshold = cardMode ? 22 : 12;
      if(dx > cancelThreshold || dy > cancelThreshold){
        clearTimer();
        helper.classList.remove('hold-armed');
        if(holdTicker) setWatchlistHoldTrace(holdTicker, `hold_move.cancelled dx=${Math.round(dx)} dy=${Math.round(dy)} threshold=${cancelThreshold}`);
      }
    });
    const closeOnRelease = event => {
      if(state.pointerId == null || event.pointerId !== state.pointerId) return;
      const didHoldOpen = state.holdOpened;
      if(typeof trigger.releasePointerCapture === 'function'){
        try{ trigger.releasePointerCapture(event.pointerId); }catch(_){}
      }
      resetPointer();
      if(holdTicker) setWatchlistHoldTrace(holdTicker, didHoldOpen ? 'hold_release.close_panel' : 'hold_release.before_threshold');
      if(didHoldOpen) closePanel();
    };
    trigger.addEventListener('pointerup', closeOnRelease);
    trigger.addEventListener('pointercancel', closeOnRelease);
    trigger.addEventListener('pointerleave', closeOnRelease);
    if(typeof window !== 'undefined' && !('PointerEvent' in window)){
      trigger.addEventListener('touchstart', event => {
        if(cardMode && event.target && event.target.closest && event.target.closest(ignoreSelector)){
          if(holdTicker) setWatchlistHoldTrace(holdTicker, `hold_start.touch_ignored_interactive_target target=${holdTargetDescriptor(event.target)}`);
          return;
        }
        const touch = event.touches && event.touches[0];
        if(!touch) return;
        state.startX = Number(touch.clientX || 0);
        state.startY = Number(touch.clientY || 0);
        state.holdOpened = false;
        clearTimer();
        helper.classList.add('hold-armed');
        if(holdTicker) setWatchlistHoldTrace(holdTicker, 'hold_start.touchstart');
        state.timer = setTimeout(openPanel, Number.isFinite(holdMs) ? holdMs : 550);
        if(holdTicker) setWatchlistHoldTrace(holdTicker, `hold_timer.started (${Number.isFinite(holdMs) ? holdMs : 550}ms touch)`);
      }, {passive:true});
      trigger.addEventListener('touchmove', event => {
        const touch = event.touches && event.touches[0];
        if(!touch) return;
        const dx = Math.abs(Number(touch.clientX || 0) - state.startX);
        const dy = Math.abs(Number(touch.clientY || 0) - state.startY);
        if(dx > 20 || dy > 20){
          clearTimer();
          helper.classList.remove('hold-armed');
          if(holdTicker) setWatchlistHoldTrace(holdTicker, `hold_move.touch_cancelled dx=${Math.round(dx)} dy=${Math.round(dy)} threshold=20`);
        }
      }, {passive:true});
      const touchRelease = () => {
        const didHoldOpen = state.holdOpened;
        clearTimer();
        helper.classList.remove('hold-armed');
        if(holdTicker) setWatchlistHoldTrace(holdTicker, didHoldOpen ? 'hold_release.touch_close_panel' : 'hold_release.touch_before_threshold');
        if(didHoldOpen) closePanel();
      };
      trigger.addEventListener('touchend', touchRelease, {passive:true});
      trigger.addEventListener('touchcancel', touchRelease, {passive:true});
    }
    trigger.addEventListener('contextmenu', event => event.preventDefault());
    trigger.addEventListener('click', event => {
      if(state.suppressClick){
        state.suppressClick = false;
        if(holdTicker) setWatchlistHoldTrace(holdTicker, 'hold_click.suppressed_after_hold');
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if(holdTicker) setWatchlistHoldTrace(holdTicker, 'hold_click.no_hold');
      if(!cardMode) event.preventDefault();
    });
  });
}

function resolvePlanVisibility(setup){
  const state = normalizeGlobalVerdictKey(setup && (setup.state || setup.finalVerdict || '') || '');
  const bounceState = String(setup && setup.bounce_state || '').trim().toLowerCase();
  const structure = String(setup && setup.structure || '').trim().toLowerCase();
  const noConfirmation = bounceState === 'none' || bounceState === 'attempt';
  const weakStructure = structure === 'weakening' || structure === 'broken';

  if(state === 'monitor' || state === 'watch' || state === 'developing'){
    return {
      showPlan:false,
      showPositionSize:false,
      showCapital:false,
      showRR:false,
      diagnosticsMessage:'Bounce is too weak to price cleanly.',
      diagnosticsTone:'neutral'
    };
  }

  if(state === 'avoid' || state === 'dead' || weakStructure){
    return {
      showPlan:false,
      showPositionSize:false,
      showCapital:false,
      showRR:false,
      diagnosticsMessage:'Avoid - too weak or broken. Leave it alone.',
      diagnosticsTone:'danger'
    };
  }

  if(!noConfirmation && !weakStructure){
    return {
      showPlan:true,
      showPositionSize:true,
      showCapital:true,
      showRR:true,
      diagnosticsMessage:null,
      diagnosticsTone:null
    };
  }

  return {
    showPlan:false,
    showPositionSize:false,
    showCapital:false,
    showRR:false,
    diagnosticsMessage:'Bounce is too weak to price cleanly.',
    diagnosticsTone:'neutral'
  };
}

function normalizeUiCopy(text){
  return String(text || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function isDuplicatedStatusCopy(message, decisionSummary){
  if(!message || !decisionSummary) return false;
  return normalizeUiCopy(message) === normalizeUiCopy(decisionSummary);
}

function nonPlanCalcNoteText(message, decisionSummary){
  if(isDuplicatedStatusCopy(message, decisionSummary)) return 'No actionable plan yet.';
  return message || 'No actionable plan yet.';
}

function nonPlanRealismSummaryText(message, decisionSummary){
  if(isDuplicatedStatusCopy(message, decisionSummary)) return 'Bounce is too weak to price cleanly.';
  return message || 'Bounce is too weak to price cleanly.';
}

function nonPlanDiagnosticsSummaryMarkup(message, decisionSummary){
  if(!message) return '';
  if(isDuplicatedStatusCopy(message, decisionSummary)){
    return '<div class="tiny">Bounce is too weak to price cleanly. Waiting for a reclaim and stronger close.</div>';
  }
  return `<div class="summary">${escapeHtml(message)}</div>`;
}

function tradeStatusMetricText({globalVerdict, displayedPlan, resolvedContract}){
  return tradeStatusMetricTextImpl({globalVerdict, displayedPlan, resolvedContract}, reviewPresentationBridgeDeps());
}

function normalizeExitMode(exitMode){
  return String(exitMode || '').trim().toLowerCase() === 'dynamic_exit' ? 'dynamic_exit' : 'fixed_target';
}

function executionModeLabel(exitMode){
  return normalizeExitMode(exitMode) === 'fixed_target' ? 'Fixed Target' : 'Dynamic Exit';
}

function triggerStateLabel(triggerState){
  if(triggerState === 'waiting_for_trigger') return 'Waiting';
  if(triggerState === 'triggered') return 'Triggered';
  if(triggerState === 'near_ready') return 'Near Ready';
  if(triggerState === 'missed') return 'Missed';
  if(triggerState === 'invalidated') return 'Invalidated';
  if(triggerState === 'stale') return 'Stale';
  return 'Waiting';
}

function planValidationStateLabel(planValidationState){
  if(planValidationState === 'valid') return 'Valid';
  if(planValidationState === 'pending_validation') return 'Pending Validation';
  if(planValidationState === 'unsaved') return 'Unsaved';
  if(planValidationState === 'needs_replan') return 'Needs Replan';
  if(planValidationState === 'stale') return 'Stale';
  if(planValidationState === 'missed') return 'Missed';
  if(planValidationState === 'invalidated') return 'Invalidated';
  if(planValidationState === 'not_reviewed') return 'Missing';
  return 'Missing';
}

function savedPlanSnapshotForRecord(record){
  const item = normalizeTickerRecord(record || {});
  if([item.plan.entry, item.plan.stop, item.plan.firstTarget].some(Number.isFinite)){
    return {
      entry:item.plan.entry,
      stop:item.plan.stop,
      firstTarget:item.plan.firstTarget
    };
  }
  const manualReview = item.review && item.review.manualReview && typeof item.review.manualReview === 'object'
    ? item.review.manualReview
    : null;
  if(manualReview){
    return {
      entry:numericOrNull(manualReview.entry),
      stop:numericOrNull(manualReview.stop),
      firstTarget:numericOrNull(manualReview.target)
    };
  }
  return null;
}

function hasUnsavedPlanEdits(record, currentPlan){
  const savedPlan = savedPlanSnapshotForRecord(record);
  if(!savedPlan) return false;
  const currentSnapshot = {
    entry:numericOrNull(currentPlan && currentPlan.entry),
    stop:numericOrNull(currentPlan && currentPlan.stop),
    firstTarget:numericOrNull(currentPlan && currentPlan.firstTarget)
  };
  return !planValuesEqual(savedPlan, currentSnapshot);
}

function planCheckStateForRecord(record, options = {}){
  const item = record && typeof record === 'object' ? record : {};
  const effectivePlan = options.effectivePlan || effectivePlanForRecord(item, {allowScannerFallback:true});
  const displayedPlan = options.displayedPlan || deriveCurrentPlanState(
    effectivePlan.entry,
    effectivePlan.stop,
    effectivePlan.firstTarget,
    item.marketData && item.marketData.currency
  );
  const currentPlan = {
    entry:effectivePlan.entry,
    stop:effectivePlan.stop,
    firstTarget:effectivePlan.firstTarget
  };
  const hasCompleteDisplayedPlan = [currentPlan.entry, currentPlan.stop, currentPlan.firstTarget].every(value => Number.isFinite(numericOrNull(value)));
  const explicitState = String(item.plan && item.plan.planValidationState || '').trim();
  if(['invalidated','missed','stale','needs_replan'].includes(explicitState)){
    return explicitState;
  }
  if(displayedPlan.status === 'valid' && hasUnsavedPlanEdits(item, currentPlan)){
    return 'unsaved';
  }
  if(displayedPlan.status === 'valid'){
    return savedPlanSnapshotForRecord(item) ? 'valid' : 'pending_validation';
  }
  if(hasCompleteDisplayedPlan){
    return savedPlanSnapshotForRecord(item) ? 'pending_validation' : 'pending_validation';
  }
  return 'missing';
}

function normalizeTargetReviewState(targetReviewState){
  const value = String(targetReviewState || '').trim().toLowerCase();
  if(['near_target','at_target','beyond_target'].includes(value)) return value;
  return 'not_near_target';
}

function targetReviewStateLabel(targetReviewState){
  if(targetReviewState === 'near_target') return 'Near Target';
  if(targetReviewState === 'at_target') return 'At Target';
  if(targetReviewState === 'beyond_target') return 'Beyond Target';
  return 'Not Near Target';
}

function deriveTargetReviewState(currentPrice, firstTarget){
  const price = numericOrNull(currentPrice);
  const target = numericOrNull(firstTarget);
  if(!Number.isFinite(price) || !Number.isFinite(target) || target <= 0) return 'not_near_target';
  if(price >= target * 1.01) return 'beyond_target';
  if(price >= target * 0.995) return 'at_target';
  if(price >= target * 0.98) return 'near_target';
  return 'not_near_target';
}

function dynamicExitRecommendation(targetReviewState, displayStage, setupScore){
  if(targetReviewState === 'beyond_target') return 'Consider trailing stop';
  if(targetReviewState === 'at_target'){
    return (displayStage === 'Entry' || (Number.isFinite(setupScore) && setupScore >= 8))
      ? 'Consider trailing stop'
      : 'Consider taking profit';
  }
  if(targetReviewState === 'near_target') return 'Review now';
  return 'Hold / monitor';
}

function dynamicExitGuidance(exitMode){
  if(normalizeExitMode(exitMode) !== 'dynamic_exit') return '';
  return 'Hard stop active | Target by alert | Review at target';
}

function targetReviewQueueLabel(targetReviewState){
  if(targetReviewState === 'near_target') return 'Near Target';
  if(targetReviewState === 'at_target') return 'At Target';
  if(targetReviewState === 'beyond_target') return 'Review Target';
  return '';
}

function deriveExecutionPlanState(record, options = {}){
  const item = record && typeof record === 'object' ? record : {};
  const plan = item.plan && typeof item.plan === 'object' ? item.plan : {};
  const marketData = item.marketData && typeof item.marketData === 'object' ? item.marketData : {};
  const exitMode = normalizeExitMode(options.exitMode ?? plan.exitMode);
  const targetLevel = numericOrNull(options.targetLevel ?? (plan.targetAlert && plan.targetAlert.level) ?? plan.firstTarget);
  const currentPrice = numericOrNull(options.currentPrice ?? marketData.price);
  const targetReviewState = exitMode === 'dynamic_exit'
    ? deriveTargetReviewState(currentPrice, targetLevel)
    : 'not_near_target';
  const targetActionRecommendation = exitMode === 'dynamic_exit'
    ? dynamicExitRecommendation(targetReviewState, displayStageForRecord(item), setupScoreForRecord(item))
    : '';
  return {
    exitMode,
    targetReviewState,
    targetActionRecommendation,
    targetAlertLevel:targetLevel
  };
}

function deriveTradeability(planStatus, riskStatus, capitalFit){
  return deriveTradeabilityImpl(planStatus, riskStatus, capitalFit);
}

function deriveCurrentPlanState(entryValue, stopValue, targetValue, quoteCurrency = ''){
  const entry = numericOrNull(entryValue);
  const stop = numericOrNull(stopValue);
  const target = numericOrNull(targetValue);
  const hasEntry = Number.isFinite(entry);
  const hasStop = Number.isFinite(stop);
  const hasTarget = Number.isFinite(target);
  const allPresent = hasEntry && hasStop && hasTarget;
  const rewardRisk = evaluateRewardRisk(entry, stop, target);
  const riskFit = (hasEntry && hasStop)
    ? evaluateRiskFit({entry, stop, ...currentRiskSettings()})
    : {
      max_loss:currentMaxLoss(),
      risk_per_share:null,
      position_size:0,
      risk_status:'plan_missing'
    };
  const capitalFit = evaluateCapitalFit({
    entry,
    position_size:riskFit.position_size,
    account_size_gbp:currentAccountSizeGbp(),
    quote_currency:quoteCurrency
  });
  const rewardPerShare = hasEntry && hasTarget && target > entry ? target - entry : null;
  const status = !allPresent ? 'missing' : (rewardRisk.valid ? 'valid' : 'invalid');
  const tradeability = deriveTradeability(status, riskFit.risk_status, capitalFit.capital_fit);
  const affordability = status === 'valid' ? deriveAffordability({
    ...capitalFit,
    account_size_gbp:currentAccountSizeGbp()
  }) : '';
  return {
    entry,
    stop,
    target,
    status,
    rewardRisk,
    rewardPerShare,
    riskFit,
    capitalFit,
    tradeability,
    affordability
  };
}

function applySetupConfirmationPlanGate(record, displayedPlan, derivedStates = null){
  const item = record && typeof record === 'object' ? record : {};
  const plan = displayedPlan && typeof displayedPlan === 'object' ? displayedPlan : {};
  const states = derivedStates || analysisDerivedStatesFromRecord(item);
  const bounceState = String(states && states.bounceState || '').trim().toLowerCase();
  const structureState = String(states && states.structureState || '').trim().toLowerCase();
  const mustInvalidate = bounceState === 'none' || ['weakening','broken'].includes(structureState);
  if(!mustInvalidate) return plan;
  return {
    ...plan,
    status:'invalid',
    tradeability:'invalid',
    affordability:'',
    rewardPerShare:null,
    rewardRisk:{
      ...(plan.rewardRisk && typeof plan.rewardRisk === 'object' ? plan.rewardRisk : {}),
      valid:false,
      rrRatio:null,
      rrState:'invalid',
      rewardPerShare:null
    }
  };
}

function actionableRrValueForPlan(displayedPlan){
  const plan = displayedPlan && typeof displayedPlan === 'object' ? displayedPlan : {};
  if(plan.status !== 'valid') return null;
  if(!Number.isFinite(plan.entry) || !Number.isFinite(plan.stop) || !Number.isFinite(plan.target)) return null;
  if(!(plan.target > plan.entry) || !(plan.entry > plan.stop)) return null;
  if(!(plan.rewardRisk && plan.rewardRisk.valid) || !Number.isFinite(plan.rewardRisk.rrRatio)) return null;
  if(!Number.isFinite(plan.rewardRisk.riskPerShare) || plan.rewardRisk.riskPerShare <= 0) return null;
  if(!Number.isFinite(plan.rewardPerShare) || plan.rewardPerShare <= 0) return null;
  return plan.rewardRisk.rrRatio;
}

function canDisplayActionableRR(view){
  return Number.isFinite(actionableRrValueForPlan(view && view.displayedPlan));
}

function shouldShowActionableRR(view){
  const safeView = view && typeof view === 'object' ? view : {};
  return canDisplayActionableRR(safeView)
    && safeView.displayStage !== 'Avoid'
    && safeView.planUiState
    && safeView.planUiState.state === 'valid'
    && safeView.setupUiState
    && ['watch','entry'].includes(safeView.setupUiState.state);
}

function projectTickerForCard(record, options = {}){
  const item = normalizeTickerRecord(record);
  const allowScannerFallback = options.allowScannerFallback !== false;
  const analysisState = getReviewAnalysisState(item);
  const warningState = (analysisState.normalizedAnalysis && analysisState.normalizedAnalysis.warning_state)
    ? analysisState.normalizedAnalysis.warning_state
    : (item.setup.warning || evaluateWarningState(item, analysisState.normalizedAnalysis));
  const effectivePlan = effectivePlanForRecord(item, {allowScannerFallback});
  const derivedStates = analysisDerivedStatesFromRecord(item);
  const displayedPlan = applySetupConfirmationPlanGate(
    item,
    deriveCurrentPlanState(effectivePlan.entry, effectivePlan.stop, effectivePlan.firstTarget, item.marketData.currency),
    derivedStates
  );
  const displayStage = displayStageForRecord(item, {
    includeExecutionDowngrade:options.includeExecutionDowngrade !== false,
    includeRuntimeFallback:options.includeRuntimeFallback !== false
  });
  const provisionalSetupUiState = getSetupUiState(item, {displayStage, derivedStates});
  const planCheckState = planCheckStateForRecord(item, {effectivePlan, displayedPlan});
  const planUiState = getPlanUiState(item, {displayedPlan, effectivePlan, planCheckState, setupState:provisionalSetupUiState.state});
  const setupUiState = getSetupUiState(item, {displayStage, derivedStates, planUiState});
  const rrValue = displayedPlan.status === 'valid'
    ? displayedPlan.rewardRisk.rrRatio
    : numericOrNull(item.scan.estimatedRR);
  const actionableRrValue = actionableRrValueForPlan(displayedPlan);
  const derivedActionState = deriveActionStateForRecord(item);
  const actionLabel = displayedPlan.affordability === 'not_affordable'
    ? 'Too Expensive'
    : (displayedPlan.affordability === 'heavy_capital' || displayedPlan.tradeability === 'capital_heavy'
      ? 'Capital Heavy'
    : (displayedPlan.tradeability === 'too_expensive'
      ? 'Too Expensive'
      : (displayedPlan.tradeability === 'risk_only'
        ? 'Risk OK | Capital Check Estimated'
        : formatActionState(derivedActionState.stage))));
  return {
    item,
    analysisState,
    warningState,
    effectivePlan,
    displayedPlan,
    displayStage,
    finalVerdict:displayStage,
    setupUiState,
    planUiState,
    setupScore:setupScoreForRecord(item),
    setupScoreDisplay:setupScoreDisplayForRecord(item),
    convictionTier:convictionTierLabel(item.setup.convictionTier || ''),
    planState:displayedPlan.status,
    planStateLabel:planUiState.label,
    rrValue,
    actionableRrValue,
    positionSize:displayedPlan.status === 'valid' ? displayedPlan.riskFit.position_size : null,
    capitalFit:displayedPlan.status === 'valid' ? displayedPlan.capitalFit.capital_fit : 'unknown',
    capitalFitText:displayedPlan.status === 'valid'
      ? capitalFitDisplayText(displayedPlan.capitalFit.capital_fit, displayedPlan.capitalFit.capital_note)
      : 'Capital Unknown',
    affordability:displayedPlan.status === 'valid' ? displayedPlan.affordability : '',
    actionLabel
  };
}

function focusStageForRecord(record){
  return displayStageForRecord(record);
}

function compactReasonLineForRecord(record, maxParts = 3){
  const item = normalizeTickerRecord(record);
  const derived = analysisDerivedStatesFromRecord(item);
  const estimatedRrValue = item.plan && item.plan.hasValidPlan ? numericOrNull(item.plan.plannedRR) : numericOrNull(item.scan.estimatedRR);
  const warningState = item.setup.warning || warningStateFromInputs(item, null, derived);
  const parts = [];
  const pushPart = value => {
    if(value && !parts.includes(value) && parts.length < maxParts) parts.push(value);
  };
  const structureLabel = structureLabelForRecord(item, derived, {displayStage:displayStageForRecord(item)});
  if(structureLabel) pushPart(structureLabel);
  else if(derived.trendState === 'strong') pushPart('Strong trend');
  else if(derived.trendState === 'acceptable') pushPart('Acceptable trend');
  if(derived.pullbackState && derived.pullbackState !== 'none') pushPart(pullbackStateLabel(derived.pullbackState));
  if(derived.bounceState === 'confirmed') pushPart('Bounce confirmed');
  else if(derived.bounceState === 'attempt') pushPart('Bounce tentative');
  else if(derived.bounceState === 'none') pushPart('No bounce');
  if(!item.plan.hasValidPlan && Number.isFinite(estimatedRrValue) && estimatedRrValue < currentRrThreshold()) pushPart('Low est reward');
  if(derived.stabilisationState === 'early') pushPart('Early stabilisation');
  if(derived.volumeState === 'weak') pushPart('Weak volume');
  if(item.setup.marketCaution) pushPart('Weak market');
  warningState.reasons.forEach(pushPart);
  if(!parts.length) pushPart(resultReasonForRecord(item));
  return parts.slice(0, maxParts).join(' | ');
}

function scanCardStatusPills(view, maxPills = 3){
  const pills = [];
  const pushPill = value => {
    if(value && !pills.includes(value) && pills.length < maxPills) pills.push(value);
  };
    if(view.warningState && view.warningState.showWarning) pushPill('Weak market');
  pushPill(view.planUiState.label);
  if(shouldShowActionableRR(view) && Number.isFinite(view.actionableRrValue)) pushPill(`R:R ${view.actionableRrValue.toFixed(2)}`);
  if(Number.isFinite(view.positionSize)) pushPill(`Size ${view.positionSize}`);
  if(view.displayedPlan.tradeability === 'risk_only') pushPill('Capital check estimated');
  if(view.affordability === 'heavy_capital' || view.affordability === 'not_affordable' || view.displayedPlan.tradeability === 'capital_heavy') pushPill(affordabilityLabel(view.affordability === 'affordable' && view.displayedPlan.tradeability === 'capital_heavy' ? 'heavy_capital' : view.affordability));
  return pills.slice(0, maxPills);
}

function rankTickerForFocus(record){
  const item = normalizeTickerRecord(record);
  const view = projectTickerForCard(item);
  const setupState = view.setupUiState.state;
  const targetReviewLabel = view.planUiState.state === 'valid' ? targetReviewQueueLabel(item.plan.targetReviewState) : '';
  if(setupState === 'broken' || item.lifecycle.stage === 'expired') return -9999;
  let score = 0;
  if(targetReviewLabel === 'At Target' || targetReviewLabel === 'Review Target') score += 1000;
  else if(targetReviewLabel === 'Near Target') score += 900;
  if(setupState === 'entry') score += 400;
  else if(view.displayStage === 'Near Entry' || setupState === 'watch') score += 280;
  else if(setupState === 'developing') score += 180;
  score += (view.setupScore || 0) * 10;
  if(view.convictionTier === 'Premium') score += 30;
  else if(view.convictionTier === 'Good') score += 20;
  else if(view.convictionTier === 'Cautious') score += 10;
  if(view.warningState && view.warningState.showWarning) score -= 10;
  if(view.planUiState.state === 'valid') score += 8;
  else if(view.planUiState.state === 'needs_adjustment') score -= 4;
  else if(view.planUiState.state === 'unrealistic_rr') score -= 20;
  if(item.plan.planValidationState === 'stale' || item.plan.triggerState === 'stale') score -= 80;
  if(Number.isFinite(view.rrValue)) score += Math.min(view.rrValue, 5);
  if(item.setup.marketCaution) score -= 5;
  if(item.setup.practicalSizeFlag === 'tiny_size') score -= 8;
  else if(item.setup.practicalSizeFlag === 'low_impact') score -= 4;
  if(view.affordability === 'not_affordable') score -= 4;
  else if(view.affordability === 'heavy_capital' || view.displayedPlan.tradeability === 'capital_heavy') score -= 2;
  if(item.scan.lastScannedAt && !isFreshScanTimestamp(item.scan.lastScannedAt)) score -= 6;
  return score;
}

function renderPlanProjectionFromRecord(record, options = {}){
  const view = projectTickerForCard(record, options);
  if(view.displayedPlan.status === 'valid'){
    const targetWarning = !!view.item.plan.firstTargetTooClose;
    return `<div class="tiny">Planned Entry: ${escapeHtml(fmtPrice(view.displayedPlan.entry))} | Planned Stop: ${escapeHtml(fmtPrice(view.displayedPlan.stop))} | Planned First Target: ${escapeHtml(fmtPrice(view.displayedPlan.target))}</div><div class="tiny">Risk: ${escapeHtml(formatPound(state.userRiskPerTrade || currentMaxLoss()))} | Risk ${escapeHtml(riskStatusLabel(view.displayedPlan.riskFit.risk_status || 'plan_missing'))} | Max Loss ${escapeHtml(Number.isFinite(view.displayedPlan.riskFit.max_loss) ? formatPound(view.displayedPlan.riskFit.max_loss) : formatPound(currentMaxLoss()))} | Planned Risk/Share ${escapeHtml(Number.isFinite(view.displayedPlan.rewardRisk.riskPerShare) ? view.displayedPlan.rewardRisk.riskPerShare.toFixed(2) : 'N/A')} | Planned Reward/Share ${escapeHtml(Number.isFinite(view.displayedPlan.rewardPerShare) ? view.displayedPlan.rewardPerShare.toFixed(2) : 'N/A')} | Planned Position ${escapeHtml(Number.isFinite(view.displayedPlan.riskFit.position_size) ? String(view.displayedPlan.riskFit.position_size) : 'N/A')}</div><div class="inline-status"><span class="badge ${view.planUiState.className}">${escapeHtml(view.planUiState.label)}</span><span class="tiny">Planned R:R ${escapeHtml(Number.isFinite(view.planUiState.rrRatio) ? view.planUiState.rrRatio.toFixed(2) : 'N/A')}</span>${targetWarning ? '<span class="badge avoid">Target Too Close</span>' : ''}</div>`;
  }
  return `<div class="inline-status"><span class="badge watch">Scan Estimate</span><span class="tiny">Use this card to review charts and define a real plan before acting on scanner estimates.</span></div>${renderEstimatedScannerPlanFromRecord(view.item)}`;
}

function formatScoreStage(scoreStage){
  if(scoreStage === 'final') return 'Final';
  if(scoreStage === 'reviewed') return 'Reviewed';
  return 'Preliminary';
}

function formatPlanState(planState, record = null){
  if(record){
    const displayedPlan = deriveCurrentPlanState(
      record.plan && record.plan.entry,
      record.plan && record.plan.stop,
      record.plan && record.plan.firstTarget,
      record.marketData && record.marketData.currency
    );
    const effectivePlan = {
      entry:record.plan && record.plan.entry,
      stop:record.plan && record.plan.stop,
      firstTarget:record.plan && record.plan.firstTarget
    };
    const planCheckState = planCheckStateForRecord(record, {effectivePlan, displayedPlan});
    return getPlanUiState(record, {displayedPlan, effectivePlan, planCheckState}).label;
  }
  return planUiLabel(planState === 'valid' ? 'valid' : 'invalid');
}

function formatActionState(actionState){
  if(actionState === 'action_now') return 'Action Now';
  if(actionState === 'near_entry') return 'Near Entry';
  if(actionState === 'needs_plan') return 'Needs Plan';
  if(actionState === 'watch') return 'Watch';
  if(actionState === 'avoid') return 'Avoid';
  return 'Watch';
}

function actionDisplayLabelForRecord(record){
  const item = normalizeTickerRecord(record);
  if(item.plan && item.plan.affordability === 'not_affordable') return 'Too Expensive';
  if(item.plan && (item.plan.affordability === 'heavy_capital' || item.plan.tradeability === 'capital_heavy')) return 'Capital Heavy';
  if(item.plan && item.plan.tradeability === 'too_expensive') return 'Too Expensive';
  if(item.plan && item.plan.tradeability === 'risk_only') return 'Risk OK | Capital Check Estimated';
  return formatActionState(item.action && item.action.stage);
}

function actionPriority(stage){
  if(stage === 'action_now') return 0;
  if(stage === 'near_entry') return 1;
  if(stage === 'needs_plan') return 2;
  if(stage === 'watch') return 3;
  return 4;
}

function deriveActionStateForRecord(record){
  const item = record && typeof record === 'object' ? record : {};
  const verdict = resolverSeedVerdictForRecord(item);
  const displayedPlan = deriveCurrentPlanState(
    item.plan && item.plan.entry,
    item.plan && item.plan.stop,
    item.plan && item.plan.firstTarget,
    item.marketData && item.marketData.currency
  );
  const planUiState = getPlanUiState(item, {displayedPlan});
  const planValidationState = String(item.plan && item.plan.planValidationState || '');
  let stage = 'watch';
  if(item.plan && item.plan.invalidatedState){
    stage = 'avoid';
  }else if(verdict === 'Avoid'){
    stage = 'avoid';
  }else if(executionCapitalBlocked(displayedPlan)){
    stage = 'avoid';
  }else if(executionCapitalHeavy(displayedPlan)){
    stage = 'needs_plan';
  }else if(planUiState.state === 'unrealistic_rr' || planUiState.state === 'needs_adjustment'){
    stage = 'needs_plan';
  }else if(planValidationState === 'needs_replan'){
    stage = 'needs_plan';
  }else if(planValidationState === 'missed'){
    stage = 'watch';
  }else if(verdict === 'Entry' && planUiState.state === 'valid'){
    stage = 'action_now';
  }else if(verdict === 'Entry' && planUiState.state !== 'valid'){
    stage = 'needs_plan';
  }else if(verdict === 'Near Entry'){
    stage = 'near_entry';
  }else{
    stage = verdict === 'Watch' ? 'watch' : 'watch';
  }
  return {stage, priority:actionPriority(stage)};
}

function nextActionTextForRecord(record){
  const item = normalizeTickerRecord(record);
  if(item.plan && item.plan.invalidatedState) return 'Setup invalidated';
  if(item.plan && item.plan.missedState) return 'Missed - do not chase';
  if(item.plan && item.plan.planValidationState === 'needs_replan') return 'Replan before entry';
  if(item.plan && item.plan.exitMode === 'dynamic_exit' && item.plan.status === 'valid'){
    if(item.plan.targetReviewState === 'beyond_target' || item.plan.targetReviewState === 'at_target'){
      return item.plan.targetActionRecommendation || 'Review target';
    }
    if(item.plan.targetReviewState === 'near_target'){
      return item.plan.targetActionRecommendation || 'Review now';
    }
  }
  if(item.plan && item.plan.affordability === 'not_affordable') return 'Ignore - position would use too much account capital';
  if(item.plan && (item.plan.affordability === 'heavy_capital' || item.plan.tradeability === 'capital_heavy')) return 'Pass - capital usage is heavy for this account';
  const derivedStates = analysisDerivedStatesFromRecord(item);
  const displayedPlan = deriveCurrentPlanState(
    item.plan && item.plan.entry,
    item.plan && item.plan.stop,
    item.plan && item.plan.firstTarget,
    item.marketData && item.marketData.currency
  );
  const qualityAdjustments = evaluateSetupQualityAdjustments(item, {displayedPlan, derivedStates});
  const avoidSubtype = avoidSubtypeForRecord(item, {derivedStates, displayedPlan, qualityAdjustments});
  const actionStage = actionStateForRecord(record);
  if(actionStage === 'action_now') return 'Act';
  if(actionStage === 'needs_plan') return avoidSubtype === 'conditional' ? 'Add to watchlist and wait for confirmation' : 'Define trade plan';
  if(actionStage === 'near_entry') return 'Prepare';
  if(actionStage === 'avoid') return avoidSubtype === 'conditional' ? 'Add to watchlist and wait for confirmation' : 'Ignore';
  return 'Monitor';
}

function sleep(ms){
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatPercent(value){
  return Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)}%` : '-';
}

function weekdayIndexFromIsoDate(isoDate){
  return new Date(`${String(isoDate).slice(0, 10)}T12:00:00Z`).getUTCDay();
}

function formatIsoDateLabel(isoDate, options = {}){
  const date = new Date(`${String(isoDate).slice(0, 10)}T12:00:00Z`);
  return new Intl.DateTimeFormat('en-US', {
    weekday:options.weekday ? 'short' : undefined,
    month:options.month || 'short',
    day:'numeric',
    year:options.year ? 'numeric' : undefined
  }).format(date);
}

function formatMonthYearLabel(isoDate){
  const date = new Date(`${String(isoDate).slice(0, 10)}T12:00:00Z`);
  return new Intl.DateTimeFormat('en-US', {
    month:'long',
    year:'numeric'
  }).format(date);
}

function timezoneOffsetMinutes(date, timeZone){
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName:'shortOffset'
  });
  const part = formatter.formatToParts(date).find(item => item.type === 'timeZoneName');
  const raw = String(part && part.value || 'GMT+0');
  const match = raw.match(/GMT([+-]\d{1,2})(?::?(\d{2}))?/i);
  if(!match) return 0;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  return (hours * 60) + (hours >= 0 ? minutes : -minutes);
}

function marketDateTimeToUtc(dateET, time24){
  const [year, month, day] = String(dateET || todayIsoDate()).slice(0, 10).split('-').map(Number);
  const [hour, minute] = String(time24 || '09:30').split(':').map(value => Number(value));
  const utcGuess = new Date(Date.UTC(year, Math.max(0, (month || 1) - 1), day || 1, hour || 0, minute || 0, 0));
  const offsetMinutes = timezoneOffsetMinutes(utcGuess, MARKET_TIMEZONE);
  return new Date(utcGuess.getTime() - (offsetMinutes * 60000));
}

function formatDualTime(value){
  const dateValue = value instanceof Date ? value : new Date(value);
  const et = new Intl.DateTimeFormat('en-US', {
    hour:'numeric',
    minute:'2-digit',
    hour12:true,
    timeZone:MARKET_TIMEZONE
  }).format(dateValue);
  const uk = new Intl.DateTimeFormat('en-GB', {
    hour:'2-digit',
    minute:'2-digit',
    hour12:false,
    timeZone:'Europe/London'
  }).format(dateValue);
  return {et, uk};
}

function formatEtTimeText(time24){
  const dual = formatDualTime(marketDateTimeToUtc(todayIsoDate(), time24));
  return `${dual.uk} UK (${dual.et} ET)`;
}

function formatMarketTimeForDate(dateET, time24){
  const dual = formatDualTime(marketDateTimeToUtc(dateET, time24));
  return `${dual.uk} UK (${dual.et} ET)`;
}

function etDateTimeParts(now = new Date()){
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone:MARKET_TIMEZONE,
    year:'numeric',
    month:'2-digit',
    day:'2-digit',
    weekday:'short',
    hour:'2-digit',
    minute:'2-digit',
    hour12:false
  });
  const parts = Object.fromEntries(formatter.formatToParts(now).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  const year = Number(parts.year || 0);
  const month = Number(parts.month || 0);
  const day = Number(parts.day || 0);
  const hour = Number(parts.hour || 0);
  const minute = Number(parts.minute || 0);
  return {
    year,
    month,
    day,
    hour,
    minute,
    weekdayShort:String(parts.weekday || ''),
    isoDate:`${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    minutesOfDay:(hour * 60) + minute
  };
}

function marketCalendarYearConfig(year){
  return US_MARKET_CALENDAR_CONFIG[Number(year)] || {holidays:[], earlyCloseDays:{}};
}

function isEarlyClose(dateET){
  const isoDate = String(dateET || '').slice(0, 10);
  const year = Number(isoDate.slice(0, 4));
  return marketCalendarYearConfig(year).earlyCloseDays[isoDate] || '';
}

function regularSessionHoursLabel(dateET){
  return `Regular ${formatMarketTimeForDate(dateET, '09:30')} - ${formatMarketTimeForDate(dateET, isEarlyClose(dateET) || '16:00')}`;
}

function nextTradingDayFrom(dateET, startOffset = 0){
  let offset = Number(startOffset || 0);
  let candidate = isoDateAddDays(dateET, offset);
  while(!isTradingDay(candidate)){
    offset += 1;
    candidate = isoDateAddDays(dateET, offset);
  }
  return candidate;
}

function getNextMarketOpen(now = new Date()){
  const etNow = etDateTimeParts(now);
  const today = etNow.isoDate;
  const openMinute = (9 * 60) + 30;
  const closeMinute = isEarlyClose(today) ? (13 * 60) : (16 * 60);
  let nextDate = today;
  if(!isTradingDay(today) || etNow.minutesOfDay >= closeMinute){
    nextDate = nextTradingDayFrom(today, 1);
  }else if(etNow.minutesOfDay < openMinute){
    nextDate = today;
  }
  return {
    date:nextDate,
    time:'09:30',
    label:`${formatIsoDateLabel(nextDate, {weekday:true})} ${formatMarketTimeForDate(nextDate, '09:30')}`
  };
}

function getNextMarketClose(now = new Date()){
  const etNow = etDateTimeParts(now);
  const today = etNow.isoDate;
  const closeTime = isEarlyClose(today) || '16:00';
  if(isTradingDay(today) && etNow.minutesOfDay < (Number(closeTime.slice(0, 2)) * 60 + Number(closeTime.slice(3, 5)))){
    return {
      date:today,
      time:closeTime,
      label:formatMarketTimeForDate(today, closeTime)
    };
  }
  const nextOpenDate = nextTradingDayFrom(today, isTradingDay(today) ? 1 : 0);
  const nextCloseTime = isEarlyClose(nextOpenDate) || '16:00';
  return {
    date:nextOpenDate,
    time:nextCloseTime,
    label:`${formatIsoDateLabel(nextOpenDate, {weekday:true})} ${formatMarketTimeForDate(nextOpenDate, nextCloseTime)}`
  };
}

function getMarketSessionStatus(now = new Date()){
  const etNow = etDateTimeParts(now);
  const today = etNow.isoDate;
  const openMinute = (9 * 60) + 30;
  const earlyCloseTime = isEarlyClose(today);
  const closeTime = earlyCloseTime || '16:00';
  const closeMinute = (Number(closeTime.slice(0, 2)) * 60) + Number(closeTime.slice(3, 5));
  if(!isTradingDay(today)){
    const nextOpen = getNextMarketOpen(now);
    return {
      key:'closed',
      label:'Market Closed',
      hours:regularSessionHoursLabel(today),
      detail:`Next open ${nextOpen.label}`
    };
  }
  if(etNow.minutesOfDay < openMinute){
    return earlyCloseTime
      ? {
          key:'early-close',
          label:'Early close today',
          hours:regularSessionHoursLabel(today),
          detail:`Opens ${formatMarketTimeForDate(today, '09:30')} · Closes ${formatMarketTimeForDate(today, closeTime)}`
        }
      : {
          key:'pre-market',
          label:'Pre-market',
          hours:regularSessionHoursLabel(today),
          detail:`Opens ${formatMarketTimeForDate(today, '09:30')}`
        };
  }
  if(etNow.minutesOfDay < closeMinute){
    return earlyCloseTime
      ? {
          key:'early-close',
          label:'Early close today',
          hours:regularSessionHoursLabel(today),
          detail:`Closes ${formatMarketTimeForDate(today, closeTime)}`
        }
      : {
          key:'open',
          label:'Market Open',
          hours:regularSessionHoursLabel(today),
          detail:`Closes ${formatMarketTimeForDate(today, closeTime)}`
        };
  }
  const nextOpen = getNextMarketOpen(now);
  return {
    key:'after-hours',
    label:'After-hours',
    hours:regularSessionHoursLabel(today),
    detail:`Next open ${nextOpen.label}`
  };
}

function buildMarketCalendarDays(isoDate){
  const bounds = isoDateMonthBounds(isoDate);
  const startOffset = weekdayIndexFromIsoDate(bounds.first);
  const startDate = isoDateAddDays(bounds.first, -startOffset);
  return Array.from({length:42}, (_, index) => {
    const date = isoDateAddDays(startDate, index);
    return {
      date,
      day:Number(date.slice(-2)),
      isCurrentMonth:date.slice(0, 7) === bounds.first.slice(0, 7),
      isToday:date === String(isoDate).slice(0, 10),
      weekend:[0, 6].includes(weekdayIndexFromIsoDate(date)),
      holiday:isHoliday(date),
      earlyClose:!!isEarlyClose(date)
    };
  });
}

function renderMarketSessionStatus(){
  const badge = $('marketSessionBadge');
  const hours = $('marketSessionHours');
  const detail = $('marketSessionDetail');
  if(!badge || !hours || !detail) return;
  const session = getMarketSessionStatus(new Date());
  badge.textContent = session.label;
  badge.setAttribute('data-session-state', session.key);
  hours.textContent = session.hours;
  detail.textContent = session.detail;
}

function renderMarketCalendarWidget(){
  const summary = $('marketCalendarSummary');
  const grid = $('marketCalendarGrid');
  if(!summary || !grid) return;
  const etNow = etDateTimeParts(new Date());
  const bounds = isoDateMonthBounds(etNow.isoDate);
  summary.textContent = `${formatMonthYearLabel(bounds.first)} · ${getMarketSessionStatus(new Date()).label}`;
  const headers = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
    .map(label => `<div class="market-calendar-head">${label}</div>`)
    .join('');
  const days = buildMarketCalendarDays(etNow.isoDate).map(day => {
    const classes = [
      'market-calendar-cell',
      day.weekend ? 'market-calendar-cell--weekend' : '',
      day.holiday ? 'market-calendar-cell--holiday' : '',
      day.earlyClose ? 'market-calendar-cell--early-close' : '',
      day.isToday ? 'market-calendar-cell--today' : '',
      day.isCurrentMonth ? '' : 'market-calendar-cell--outside'
    ].filter(Boolean).join(' ');
    return `<div class="${classes}" aria-label="${escapeHtml(formatIsoDateLabel(day.date, {weekday:true, month:'short'}))}${day.holiday ? ' holiday' : ''}${day.earlyClose ? ' early close' : ''}">${day.day}${day.earlyClose ? '<span class="market-calendar-cell__dot"></span>' : ''}</div>`;
  }).join('');
  grid.innerHTML = headers + days;
}

function refreshMarketContextWidgets(){
  renderMarketSessionStatus();
  renderMarketCalendarWidget();
}

function currentQueueCycleKey(now = new Date()){
  const utc = new Date(now);
  if(utc.getUTCHours() < 7){
    utc.setUTCDate(utc.getUTCDate() - 1);
  }
  return utc.toISOString().slice(0, 10);
}

function rebuildActiveQueueFromWatchlist(options = {}){
  const before = queueDebugSnapshot({includeFocus:false});
  const cycleKey = currentQueueCycleKey();
  const preserveDismissedState = options.preserveDismissedState !== false;
  const preserveClearedState = options.preserveClearedState !== false;
  state.activeQueueManualTickers = watchlistTickerRecords().map(record => record.ticker);
  // Queue clears/dismissals are intentional user actions for the current cycle
  // and should survive routine rebuilds and render-time maintenance.
  if(!preserveDismissedState){
    state.dismissedFocusTickers = [];
    state.dismissedFocusCycle = '';
  }
  if(!preserveClearedState){
    state.activeQueueClearedCycle = '';
    state.activeQueueClearedTickers = [];
  }
  state.activeQueueLastRebuiltCycle = cycleKey;
  if(options.persist !== false) persistState();
  logQueueMutation('REBUILD_ACTIVE_QUEUE_FROM_WATCHLIST', before);
  return cycleKey;
}

function ensureActiveQueueCycle(){
  const cycleKey = currentQueueCycleKey();
  if(state.activeQueueLastRebuiltCycle === cycleKey) return cycleKey;
  return rebuildActiveQueueFromWatchlist({
    preserveDismissedState:true,
    preserveClearedState:true
  });
}

function clearActiveQueueForToday(){
  const before = queueDebugSnapshot();
  state.activeQueueClearedTickers = uniqueTickers(focusQueueRecords({limit:null}).map(item => item.ticker));
  state.activeQueueClearedCycle = currentQueueCycleKey();
  state.activeQueueManualTickers = [];
  persistState();
  logQueueMutation('CLEAR_ACTIVE_QUEUE_FOR_TODAY', before);
}

function requeueTickerForToday(ticker, options = {}){
  const before = queueDebugSnapshot({includeFocus:false});
  const symbol = normalizeTicker(ticker);
  if(!symbol) return;
  if(state.activeQueueLastRebuiltCycle !== currentQueueCycleKey()){
    rebuildActiveQueueFromWatchlist({
      persist:false,
      preserveDismissedState:true,
      preserveClearedState:true
    });
  }
  // Requeueing one ticker should not restore the whole cleared queue.
  if(state.activeQueueClearedCycle === currentQueueCycleKey()){
    state.activeQueueClearedTickers = uniqueTickers((state.activeQueueClearedTickers || []).filter(item => normalizeTicker(item) !== symbol));
    if(!state.activeQueueClearedTickers.length) state.activeQueueClearedCycle = '';
  }
  state.activeQueueManualTickers = uniqueTickers([symbol, ...(state.activeQueueManualTickers || [])]);
  if(options.persist !== false) persistState();
  logQueueMutation('REQUEUE_TICKER_FOR_TODAY', before);
}

function isClosedOutcome(outcome){
  return ['Win','Loss','Scratch','Cancelled'].includes(String(outcome || ''));
}

function relativeAgeLabel(timestamp){
  const time = Date.parse(timestamp || '');
  if(!Number.isFinite(time)) return '';
  const diffMs = Math.max(0, Date.now() - time);
  const diffMinutes = Math.round(diffMs / 60000);
  if(diffMinutes < 1) return 'just now';
  if(diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if(diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

function isFreshScanTimestamp(timestamp){
  const time = Date.parse(timestamp || '');
  return Number.isFinite(time) && (Date.now() - time) <= MARKET_CACHE_TTL_MS;
}

function uniqueStrings(values){
  return [...new Set((values || []).map(value => String(value || '').trim()).filter(Boolean))];
}

function marketDataEndpoints(){
  return uniqueStrings([
    state.marketDataEndpoint,
    defaultMarketDataEndpoint,
    '/.netlify/functions/market-data'
  ]);
}

function analysisEndpoints(){
  return uniqueStrings([
    '/.netlify/functions/analyse-setup',
    state.aiEndpoint,
    defaultAiEndpoint
  ]);
}

function isFreshTimestamp(value, ttlMs = MARKET_CACHE_TTL_MS){
  if(!value) return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && (Date.now() - timestamp) < ttlMs;
}

function rememberTickerMeta(meta){
  if(!meta || !meta.ticker) return;
  const symbol = normalizeTicker(meta.ticker);
  state.symbolMeta[symbol] = {
    companyName:String(meta.companyName || ''),
    exchange:String(meta.exchange || ''),
    tradingViewSymbol:String(meta.tradingViewSymbol || ''),
    scanType:normalizeScanType(meta.scanType || '')
  };
}

function getStoredTickerMeta(ticker){
  return state.symbolMeta[normalizeTicker(ticker)] || null;
}

function applyTickerMetaToCard(card, meta){
  if(!card || !meta) return;
  if(meta.companyName) card.companyName = String(meta.companyName);
  if(meta.exchange) card.exchange = String(meta.exchange);
  if(meta.tradingViewSymbol) card.tradingViewSymbol = String(meta.tradingViewSymbol);
  if(normalizeScanType(meta.scanType)) card.scanType = normalizeScanType(meta.scanType);
}

function hasUsableScannerData(data){
  if(!data || typeof data !== 'object') return false;
  return [
    data.exchange,
    data.price,
    data.sma20,
    data.sma50,
    data.sma200,
    data.avgVolume30d,
    data.marketCap,
    data.perf1w,
    data.perf1m,
    data.perf3m,
    data.perf6m,
    data.perfYtd,
    data.rsi14
  ].some(value => value !== null && value !== undefined && value !== '');
}

function cloneCardData(card){
  return normalizeCard({
    ...card,
    checks:{...(card && card.checks || {})},
    marketData:card && card.marketData ? {...card.marketData} : null,
    analysis:card && card.analysis ? safeJsonParse(JSON.stringify(card.analysis), null) : null,
    chartRef:card && card.chartRef ? {...card.chartRef} : null,
    watchTracking:card && card.watchTracking ? safeJsonParse(JSON.stringify(card.watchTracking), null) : null
  });
}

function getCachedMarketData(symbol, ttlMs = MARKET_CACHE_TTL_MS){
  const ticker = normalizeTicker(symbol);
  if(!ticker) return null;
  const cacheKey = `${normalizeDataProvider(state.dataProvider)}:${ticker}`;
  const memoryHit = marketDataCache.get(cacheKey);
  if(memoryHit && memoryHit.ticker === ticker && isFreshTimestamp(memoryHit.fetchedAt, ttlMs)) return memoryHit;
  const diskCache = readMarketCache();
  const item = diskCache[cacheKey];
  if(item && typeof item === 'object' && item.ticker === ticker && isFreshTimestamp(item.fetchedAt, ttlMs)){
    marketDataCache.set(cacheKey, item);
    return item;
  }
  return null;
}

function setCachedMarketData(symbol, data){
  const ticker = normalizeTicker(symbol);
  if(!ticker || !data) return;
  const provider = normalizeDataProvider(data.sourceProvider || data.dataProvider || state.dataProvider);
  const cacheKey = `${provider}:${ticker}`;
  const payload = {
    ...data,
    ticker,
    dataProvider:provider,
    sourceProvider:provider,
    fetchedAt:data.fetchedAt || new Date().toISOString(),
    cacheVersion:MARKET_CACHE_SCHEMA_VERSION
  };
  marketDataCache.set(cacheKey, payload);
  const diskCache = readMarketCache();
  diskCache[cacheKey] = payload;
  writeMarketCache(diskCache);
}

function normalizeMarketSnapshot(snapshot, providerId = state.dataProvider){
  const data = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const symbol = normalizeTicker(data.symbol || data.ticker || '');
  return {
    symbol,
    ticker:symbol,
    name:String(data.name || data.companyName || '').trim(),
    companyName:String(data.companyName || data.name || '').trim(),
    exchange:String(data.exchange || '').trim(),
    currency:data.currency == null ? null : String(data.currency).trim(),
    price:numericOrNull(data.price),
    previousClose:numericOrNull(data.previousClose),
    sma20:numericOrNull(data.sma20),
    sma50:numericOrNull(data.sma50),
    sma200:numericOrNull(data.sma200),
    rsi14:numericOrNull(data.rsi14),
    volume:numericOrNull(data.volume),
    avgVolume30:numericOrNull(data.avgVolume30 ?? data.avgVolume30d),
    avgVolume30d:numericOrNull(data.avgVolume30d ?? data.avgVolume30),
    perf1w:numericOrNull(data.perf1w),
    perf1m:numericOrNull(data.perf1m),
    perf3m:numericOrNull(data.perf3m),
    perf6m:numericOrNull(data.perf6m),
    perfYtd:numericOrNull(data.perfYtd),
    marketCap:numericOrNull(data.marketCap),
    history:Array.isArray(data.history) ? data.history : [],
    historyPoints:Number(data.historyPoints || (Array.isArray(data.history) ? data.history.length : 0) || 0),
    fetchedAt:String(data.fetchedAt || new Date().toISOString()),
    sourceProvider:normalizeDataProvider(data.sourceProvider || data.dataProvider || providerId),
    dataProvider:normalizeDataProvider(data.dataProvider || data.sourceProvider || providerId),
    warnings:Array.isArray(data.warnings) ? data.warnings.map(item => String(item)) : [],
    tradingViewSymbol:String(data.tradingViewSymbol || '').trim()
  };
}

async function fetchLiveFxRateToGbp(quoteCurrency){
  const currency = normalizeQuoteCurrency(quoteCurrency);
  if(!currency || currency === 'GBP' || currency === 'GBX') return null;
  const cached = fxRateCache.get(currency);
  if(cached && Number.isFinite(cached.gbpPerUnit) && isFreshTimestamp(cached.fetchedAt, FX_RATE_CACHE_TTL_MS)) return cached;
  if(fxRatePending.has(currency)) return fxRatePending.get(currency);
  const request = (async () => {
    try{
      for(const endpoint of marketDataEndpoints()){
        const params = new URLSearchParams({
          mode:'fx',
          base:currency,
          quote:'GBP',
          provider:'fmp',
          plan:String(state.apiPlan || DEFAULT_API_PLAN)
        });
        const response = await fetchJsonWithTimeout(`${endpoint}?${params.toString()}`);
        const payload = await response.json().catch(() => ({}));
        if(!response.ok || payload.ok === false) continue;
        const rate = numericOrNull(payload && payload.data && payload.data.rate);
        if(Number.isFinite(rate) && rate > 0){
          const entry = {
            base:currency,
            quote:'GBP',
            gbpPerUnit:rate,
            fetchedAt:new Date().toISOString(),
            source:'live_fx'
          };
          fxRateCache.set(currency, entry);
          return entry;
        }
      }
      const failed = {
        base:currency,
        quote:'GBP',
        gbpPerUnit:null,
        fetchedAt:new Date().toISOString(),
        source:'failed'
      };
      return failed;
    }finally{
      fxRatePending.delete(currency);
    }
  })();
  fxRatePending.set(currency, request);
  return request;
}

function ensureLiveFxRateForCurrency(quoteCurrency, onResolved = null){
  const currency = normalizeQuoteCurrency(quoteCurrency);
  if(!currency || ['GBP','GBX'].includes(currency)) return;
  const cached = fxRateCache.get(currency);
  if(cached && Number.isFinite(cached.gbpPerUnit) && isFreshTimestamp(cached.fetchedAt, FX_RATE_CACHE_TTL_MS)) return;
  fetchLiveFxRateToGbp(currency)
    .then(() => {
      if(typeof onResolved === 'function') onResolved();
    })
    .catch(() => {
      if(typeof onResolved === 'function') onResolved();
    });
}

async function fetchMarketData(symbol, options = {}){
  const ticker = normalizeTicker(symbol);
  if(!ticker) throw new Error('Missing ticker.');
  const provider = normalizeDataProvider(state.dataProvider);
  const plan = String(state.apiPlan || DEFAULT_API_PLAN);
  if(!options.force){
    const cached = getCachedMarketData(ticker);
    if(cached) return cached;
  }
  let lastError = '';
  for(const endpoint of marketDataEndpoints()){
    try{
      const params = new URLSearchParams({
        symbol:ticker,
        provider,
        plan
      });
      const response = await fetchJsonWithTimeout(`${endpoint}?${params.toString()}`);
      const payload = await response.json().catch(() => ({}));
      if(!response.ok){
        throw new Error(payload && payload.error ? payload.error : `Market data request failed for ${ticker}.`);
      }
      const safeData = payload && payload.data && typeof payload.data === 'object' ? payload.data : null;
      if(!safeData){
        throw new Error(payload && payload.error ? payload.error : `Market data request returned no usable data for ${ticker}.`);
      }
      const normalized = normalizeMarketSnapshot(safeData, payload && payload.provider || provider);
      if(payload && payload.ok !== false) setCachedMarketData(ticker, normalized);
      rememberTickerMeta(normalized);
      if(payload && payload.ok === false){
        normalized.__error = String(payload.error || `Market data is incomplete for ${ticker}.`);
      }
      return normalized;
    }catch(error){
      lastError = String(error && error.message || 'Market data request failed.');
    }
  }
  throw new Error(lastError || `Market data request failed for ${ticker}.`);
}

async function fetchTickerSuggestions(query){
  const provider = normalizeDataProvider(state.dataProvider);
  const plan = String(state.apiPlan || DEFAULT_API_PLAN);
  let lastError = '';
  for(const endpoint of marketDataEndpoints()){
    try{
      const params = new URLSearchParams({
        mode:'search',
        query,
        provider,
        plan
      });
      const response = await fetchJsonWithTimeout(`${endpoint}?${params.toString()}`);
      const payload = await response.json().catch(() => ({}));
      if(!response.ok) throw new Error(payload && payload.error ? payload.error : 'Search request failed.');
      return Array.isArray(payload.results) ? payload.results : [];
    }catch(error){
      lastError = String(error && error.message || 'Search request failed.');
    }
  }
  throw new Error(lastError || 'Search request failed.');
}

async function loadScannerPresets(){
  if(!scannerPresetPromise){
    scannerPresetPromise = fetch('./scanner-presets.json', {cache:'no-store'})
      .then(response => response.ok ? response.json() : scannerPresetFallback)
      .catch(() => scannerPresetFallback);
  }
  return scannerPresetPromise;
}

async function getActiveScannerPreset(){
  const presets = await loadScannerPresets();
  const list = Array.isArray(presets) && presets.length ? presets : scannerPresetFallback;
  return list.find(item => item.name === state.scannerPresetName) || list[0];
}

function scannerFieldLabel(field){
  return {
    exchange:'Exchange',
    perf1w:'Perf 1W',
    price:'Price',
    sma20:'SMA 20',
    sma50:'SMA 50',
    sma200:'SMA 200',
    avgVolume30d:'Avg Volume 30D',
    marketCap:'Market Cap',
    rsi14:'RSI 14',
    perf1m:'Perf 1M',
    perf3m:'Perf 3M',
    perf6m:'Perf 6M',
    perfYtd:'Perf YTD'
  }[field] || field;
}

function formatRuleNumber(value){
  if(!Number.isFinite(value)) return 'missing';
  if(Math.abs(value) >= 1000000) return Number(value).toLocaleString(undefined, {maximumFractionDigits:0});
  return Number(value).toLocaleString(undefined, {maximumFractionDigits:2});
}

function formatScannerRule(rule){
  if(!rule || typeof rule !== 'object') return 'Unknown rule';
  if(rule.label) return rule.label;
  const right = rule.valueField ? scannerFieldLabel(rule.valueField) : Number(rule.value || 0).toLocaleString();
  return `${scannerFieldLabel(rule.field)} ${rule.operator} ${right}`;
}

async function renderScannerRulesPanel(){
  const rulesBox = $('scannerRulesList');
  const debugBox = $('scannerDebugList');
  if(!rulesBox && !debugBox) return;
  if(rulesBox){
    const universe = ['Curated Core 8 fallback universe', 'TradingView Only when imported tickers are present', 'Combined mode keeps TradingView tickers first'];
    rulesBox.innerHTML = [
      '<strong>Universe</strong>',
      ...universe.map(item => `- ${escapeHtml(item)}`),
      '',
      '<strong>Hard fails</strong>',
      '- Price below 200 MA',
      '- 50 MA below 200 MA',
      '- Structure clearly broken',
      '- Plan missing or invalid',
      '- Risk does not fit the current account rule',
      '- Reward:risk to first target below 1.5R',
      '',
      '<strong>Soft ranking signals</strong>',
      '- 20 MA touch or bounce',
      '- Rising 50 MA structure',
      '- Room for a clean swing target',
      '- Pullback quality and stabilisation',
      '- Stronger reward:risk gets ranked higher'
    ].join('\n');
  }
  if(debugBox){
    if(!state.scannerDebug.length){
      debugBox.innerHTML = scannerUniverse().length
        ? 'No scan debug data yet. Refresh the scanner to rank the current universe.'
        : 'No scan debug data yet. Add tickers to the scanner universe or use the curated default list.';
    }else{
      debugBox.innerHTML = state.scannerDebug.map(item => (
        `${escapeHtml(item.ticker)} | ${escapeHtml(item.status || 'Manual Review')} | ${escapeHtml((item.breakdown || []).map(entry => entry.label).join(' | '))}${item.derivedStates ? ` | states=${escapeHtml(Object.entries(item.derivedStates).map(([key, value]) => `${key}:${value}`).join(', '))}` : ''}`
      )).join('\n\n');
    }
  }
}

function compareValues(left, operator, right){
  if(!Number.isFinite(left) || !Number.isFinite(right)) return false;
  if(operator === '>') return left > right;
  if(operator === '>=') return left >= right;
  if(operator === '<') return left < right;
  if(operator === '<=') return left <= right;
  if(operator === '===') return left === right;
  return false;
}

function isUsExchange(exchange){
  return ['NASDAQ', 'NYSE', 'AMEX'].includes(String(exchange || '').trim().toUpperCase());
}

function evaluateScannerRuleDetailed(rule, data){
  if(!rule || typeof rule !== 'object') return {passed:false, label:'Invalid rule'};
  if(rule.rules && Array.isArray(rule.rules)){
    const details = rule.rules.map(item => evaluateScannerRuleDetailed(item, data));
    const mode = rule.mode === 'any' ? 'any' : 'all';
    const passed = mode === 'any' ? details.some(item => item.passed) : details.every(item => item.passed);
    return {passed, label:rule.label || 'Rule group', details};
  }
  const left = numericOrNull(data && data[rule.field]);
  const right = rule.valueField ? numericOrNull(data && data[rule.valueField]) : numericOrNull(rule.value);
  const passed = compareValues(left, rule.operator, right);
  const leftLabel = `${scannerFieldLabel(rule.field)} ${formatRuleNumber(left)}`;
  const rightLabel = rule.valueField
    ? `${scannerFieldLabel(rule.valueField)} ${formatRuleNumber(right)}`
    : formatRuleNumber(right);
  return {
    passed,
    label:`${leftLabel} ${rule.operator} ${rightLabel} = ${passed ? 'PASS' : 'FAIL'}`,
    left,
    right
  };
}

function evaluateScannerRule(rule, data){
  if(!rule || typeof rule !== 'object') return false;
  if(rule.rules && Array.isArray(rule.rules)){
    const mode = rule.mode === 'any' ? 'any' : 'all';
    const results = rule.rules.map(item => evaluateScannerRule(item, data));
    return mode === 'any' ? results.some(Boolean) : results.every(Boolean);
  }
  if(!data || typeof data !== 'object' || !rule.field || !rule.operator) return false;
  const left = numericOrNull(data && data[rule.field]);
  const right = rule.valueField ? numericOrNull(data && data[rule.valueField]) : numericOrNull(rule.value);
  return compareValues(left, rule.operator, right);
}

function isNearLevel(price, level, tolerance){
  if(!Number.isFinite(price) || !Number.isFinite(level) || level === 0) return false;
  return Math.abs(price - level) / level <= tolerance;
}

function buildScannerSummary(result){
  if(result.status === 'Strong Fit') return result.reason || 'High-quality pullback with trend support and workable risk.';
  if(result.status === 'Possible Fit') return result.reason || 'Worth reviewing, but the setup is not fully aligned yet.';
  if(result.status === 'Entry') return result.reason || 'Trend, pullback, and trade plan are aligned for an actionable setup.';
  if(result.status === 'Near Entry') return result.reason || 'The setup is developing and needs one more confirmation step.';
  if(result.status === 'Manual Review') return result.reason || 'Keep this ticker reviewable and confirm the chart manually.';
  if(result.status === 'Watch') return result.reason || 'This is an early setup worth keeping on watch.';
  return result.reason || 'Trend structure looks broken for this workflow.';
}

function scanTypeForEvaluation(scanType){
  const normalized = normalizeScanType(scanType);
  if(normalized === '50MA' || normalized === 'ambiguous') return '50MA';
  if(normalized === '20MA') return '20MA';
  return '20MA';
}

function hardListFromScan(scan){
  const failed = Array.isArray(scan && scan.breakdown)
    ? scan.breakdown.filter(item => item && item.passed === false).map(item => String(item.label || '')).filter(Boolean)
    : [];
  return failed;
}

function clamp(value, min, max){
  return Math.max(min, Math.min(max, value));
}

function scoreRange(value, min, max, points){
  if(!Number.isFinite(value)) return 0;
  if(max <= min) return 0;
  return clamp(((value - min) / (max - min)) * points, 0, points);
}

function priorHighTarget(data, scanType){
  const rows = Array.isArray(data && data.history) ? data.history : [];
  const price = numericOrNull(data && data.price);
  if(!rows.length || !Number.isFinite(price)) return null;
  const evaluationScanType = scanTypeForEvaluation(scanType);
  const lookback = evaluationScanType === '50MA' ? 84 : 42;
  const windowRows = rows.slice(1, lookback);
  const highs = windowRows.map(row => numericOrNull(row.high ?? row.close)).filter(Number.isFinite).filter(value => value > price);
  if(!highs.length) return null;
  return Math.max(...highs);
}

function nearestPivotTargets(data, price, lookback = 42){
  const rows = Array.isArray(data && data.history) ? data.history : [];
  if(!rows.length || !Number.isFinite(price)) return [];
  const windowRows = rows.slice(1, Math.max(lookback, 6));
  const pivots = [];
  for(let index = 1; index < windowRows.length - 1; index += 1){
    const prevHigh = numericOrNull(windowRows[index - 1] && (windowRows[index - 1].high ?? windowRows[index - 1].close));
    const currentHigh = numericOrNull(windowRows[index] && (windowRows[index].high ?? windowRows[index].close));
    const nextHigh = numericOrNull(windowRows[index + 1] && (windowRows[index + 1].high ?? windowRows[index + 1].close));
    if(!Number.isFinite(prevHigh) || !Number.isFinite(currentHigh) || !Number.isFinite(nextHigh)) continue;
    if(currentHigh >= prevHigh && currentHigh > nextHigh && currentHigh > price){
      pivots.push(currentHigh);
    }
  }
  return [...new Set(pivots.map(value => Number(value.toFixed(2))))].sort((a, b) => a - b);
}

function realisticFirstTarget(data, scanType, options = {}){
  const price = numericOrNull(data && data.price);
  const entry = numericOrNull(options.entry);
  const riskPerShare = numericOrNull(options.riskPerShare);
  const sma20 = numericOrNull(data && data.sma20);
  const sma50 = numericOrNull(data && data.sma50);
  const checks = options.checks || buildScannerChecks(data || {});
  const perf1w = numericOrNull(data && data.perf1w);
  if(!Number.isFinite(price) || !Number.isFinite(entry)) return null;
  const scanStyle = scanTypeForEvaluation(scanType);
  const pivots = nearestPivotTargets(data, price, scanStyle === '50MA' ? 84 : 42);
  const nearestPivot = pivots.find(level => level > entry);
  const priorHigh = priorHighTarget(data, scanStyle);
  const above20 = Number.isFinite(price) && Number.isFinite(sma20) && price >= sma20;
  const above50 = Number.isFinite(price) && Number.isFinite(sma50) && price >= sma50;
  const strongStructure = !!(checks.trendStrong && above20 && above50 && Number.isFinite(perf1w) && perf1w >= 2);
  const confirmationStrong = !!(checks.bounce && above20 && Number.isFinite(perf1w) && perf1w >= 2);
  const weakOrEarly = !strongStructure || !confirmationStrong || !!checks.structureBroken;
  const conservativeCap = Number.isFinite(riskPerShare) ? entry + (riskPerShare * (weakOrEarly ? 2 : 3)) : null;
  const modestRecovery = Number.isFinite(riskPerShare) ? entry + (riskPerShare * 2) : (entry * (weakOrEarly ? 1.03 : 1.05));
  if(weakOrEarly){
    if(Number.isFinite(nearestPivot)) return nearestPivot;
    if(Number.isFinite(conservativeCap)) return conservativeCap;
    if(Number.isFinite(priorHigh)) return Math.min(priorHigh, Number.isFinite(modestRecovery) ? modestRecovery : priorHigh);
    return modestRecovery;
  }
  if(Number.isFinite(nearestPivot)) return nearestPivot;
  if(Number.isFinite(priorHigh)) return priorHigh;
  if(Number.isFinite(conservativeCap)) return conservativeCap;
  return modestRecovery;
}

function deriveTradePlan(data, scanType = '20MA'){
  const price = numericOrNull(data.price);
  const sma20 = numericOrNull(data.sma20);
  const sma50 = numericOrNull(data.sma50);
  if(!Number.isFinite(price) || !Number.isFinite(sma20) || !Number.isFinite(sma50)) return {entry:null, stop:null, target:null, riskPerShare:null, rewardPerShare:null, rr:null, rrState:'invalid', rrValid:false, firstTargetTooClose:false, positionSize:0, stopBufferPct:null};
  const evaluationScanType = scanTypeForEvaluation(scanType);
  const support = evaluationScanType === '50MA' ? sma50 : sma20;
  const backupSupport = evaluationScanType === '50MA' ? sma20 : sma50;
  const entry = Math.max(price, support);
  const stopBufferPct = price < 50 ? 0.02 : (price <= 200 ? 0.015 : 0.01);
  const stop = Math.min(price, Math.min(support, backupSupport) * (1 - stopBufferPct));
  const riskFit = evaluateRiskFit({
    entry,
    stop,
    ...currentRiskSettings()
  });
  const riskPerShare = Number.isFinite(riskFit.risk_per_share) ? riskFit.risk_per_share : null;
  const checks = buildScannerChecks(data);
  const target = realisticFirstTarget(data, scanType, {
    entry,
    riskPerShare,
    checks
  });
  const rewardRisk = evaluateRewardRisk(entry, stop, target);
  return {
    entry,
    stop,
    target,
    riskPerShare,
    rewardPerShare:rewardRisk.rewardPerShare,
    rr:rewardRisk.rrRatio,
    rrRatio:rewardRisk.rrRatio,
    rrState:rewardRisk.rrState,
    rrValid:rewardRisk.valid,
    stopBufferPct,
    firstTargetTooClose:rewardRisk.valid ? rewardRisk.rewardPerShare < (1.5 * rewardRisk.riskPerShare) : false,
    positionSize:riskFit.position_size,
    maxLoss:riskFit.max_loss,
    riskStatus:riskFit.risk_status
  };
}

function scannerEstimateForCard(card){
  if(!card || !card.marketData || card.marketData.__error) return null;
  const checks = buildScannerChecks(card.marketData);
  const scanType = resolveScanType(card, card.marketData, card.checks && Object.keys(card.checks).length ? card.checks : checks);
  const estimate = deriveTradePlan(card.marketData, scanTypeForEvaluation(scanType));
  if(!Number.isFinite(estimate.entry) && !Number.isFinite(estimate.stop) && !Number.isFinite(estimate.target) && !Number.isFinite(estimate.rr)) return null;
  return estimate;
}

function renderEstimatedScannerPlan(card){
  const estimate = scannerEstimateForCard(card);
  if(!estimate) return '<div class="tiny">Estimated entry zone: Not available | Estimated stop area: Not available | Estimated target area: Not available | Estimated R:R: N/A</div>';
  return `<div class="tiny">Estimated entry zone: ${escapeHtml(Number.isFinite(estimate.entry) ? fmtPrice(estimate.entry) : 'Not available')} | Estimated stop area: ${escapeHtml(Number.isFinite(estimate.stop) ? fmtPrice(estimate.stop) : 'Not available')} | Estimated target area: ${escapeHtml(Number.isFinite(estimate.target) ? fmtPrice(estimate.target) : 'Not available')} | Estimated R:R: ${escapeHtml(estimate.rrValid && Number.isFinite(estimate.rr) ? `${estimate.rr.toFixed(2)}R` : 'N/A')}</div>`;
}

function renderEstimatedScannerPlanFromRecord(record){
  const item = normalizeTickerRecord(record);
  return `<div class="tiny">Estimated entry zone: ${escapeHtml(Number.isFinite(item.scan.estimatedEntryZone) ? fmtPrice(item.scan.estimatedEntryZone) : 'Not available')} | Estimated stop area: ${escapeHtml(Number.isFinite(item.scan.estimatedStopArea) ? fmtPrice(item.scan.estimatedStopArea) : 'Not available')} | Estimated target area: ${escapeHtml(Number.isFinite(item.scan.estimatedTargetArea) ? fmtPrice(item.scan.estimatedTargetArea) : 'Not available')}</div>`;
}

function buildSuitabilitySummary(parts){
  const reasons = [];
  if(parts.trend >= 3) reasons.push('trend structure is intact');
  if(parts.pullback >= 2) reasons.push('pullback is close to support');
  if(parts.tradeQuality >= 2) reasons.push('trade plan is mostly defined');
  if(parts.scanType === '50MA') reasons.push('deeper 50 MA setup');
  if(parts.scanType === 'ambiguous') reasons.push('overlap setup treated conservatively like a 50 MA pullback');
  if(parts.controlledPullback) reasons.push('pullback remains controlled');
  if(parts.bounceReady) reasons.push('stabilisation or bounce is improving');
  if(!reasons.length) reasons.push('candidate is early and needs more chart confirmation');
  return reasons.slice(0, 3).join(', ') + '.';
}

function marketDataIssueType(message){
  const text = String(message || '').toLowerCase();
  if(!text) return '';
  if(text.includes('free-tier symbol coverage') || text.includes('free tier symbol coverage') || text.includes('limited symbol coverage') || text.includes('ticker not covered by current provider')){
    return 'coverage';
  }
  if(text.includes('endpoint not available on free tier') || text.includes('premium') || text.includes('current provider plan')){
    return 'tier';
  }
  if(text.includes('rate limit') || text.includes('timed out') || text.includes('request failed') || text.includes('temporary')){
    return 'temporary';
  }
  return 'general';
}

function marketDataManualReviewSummary(message){
  const kind = marketDataIssueType(message);
  if(kind === 'coverage') return `Manual Review: ticker not covered by ${currentProviderLabel()}.`;
  if(kind === 'tier') return `Manual Review: ${currentProviderLabel()} cannot supply this market-data route on the current plan, but the chart can still be reviewed manually.`;
  if(kind === 'temporary') return `Manual Review: ${currentProviderLabel()} request failed temporarily.`;
  return 'Manual Review: market data is unavailable, but the chart can still be reviewed manually.';
}

function isAnalysisErrorMessage(message){
  return /^AI analysis failed:/i.test(String(message || ''));
}

function renderCardStatusLine(card, loading, analysisBusy){
  if(loading) return '<span class="warntext">Sending setup to the AI endpoint...</span>';
  if(card.lastError){
    if(isAnalysisErrorMessage(card.lastError)){
      return `<span class="badtext">${escapeHtml(card.lastError)}</span>`;
    }
    return `<span class="badtext">${escapeHtml(marketDataManualReviewSummary(card.lastError))}</span>`;
  }
  if(card.lastResponse) return 'Latest prompt and response saved to this ticker.';
  if(analysisBusy) return 'Another setup is being analysed right now.';
  return 'No AI analysis saved yet.';
}

function renderCardStatusLineFromRecord(record, loading, analysisBusy){
  const analysisState = getReviewAnalysisState(record);
  if(loading) return '<span class="warntext">Sending setup to the AI endpoint...</span>';
  if(analysisState.error){
    if(isAnalysisErrorMessage(analysisState.error)){
      return `<span class="badtext">${escapeHtml(analysisState.error)}</span>`;
    }
    return `<span class="badtext">${escapeHtml(marketDataManualReviewSummary(analysisState.error))}</span>`;
  }
  if(analysisState.hasSavedAnalysis) return 'Latest prompt and response saved to this ticker.';
  if(analysisBusy) return 'Another setup is being analysed right now.';
  return 'No AI analysis saved yet.';
}

function setReviewAnalysisState(record, nextState = {}){
  if(!record) return;
  const current = record.review && record.review.analysisState && typeof record.review.analysisState === 'object'
    ? record.review.analysisState
    : {raw:'', normalized:null, prompt:'', error:'', reviewedAt:''};
  const merged = {
    raw: nextState.raw == null ? current.raw : String(nextState.raw || ''),
    normalized: nextState.normalized === undefined ? current.normalized : cloneData(nextState.normalized, null),
    prompt: nextState.prompt == null ? current.prompt : String(nextState.prompt || ''),
    error: nextState.error == null ? current.error : String(nextState.error || ''),
    reviewedAt: nextState.reviewedAt == null ? current.reviewedAt : String(nextState.reviewedAt || '')
  };
  record.review.analysisState = merged;
  record.review.aiAnalysisRaw = merged.raw;
  record.review.normalizedAnalysis = merged.normalized;
  record.review.lastPrompt = merged.prompt;
  record.review.lastError = merged.error;
  record.review.lastReviewedAt = merged.reviewedAt;
  uiState.reviewAnalysisCache = uiState.reviewAnalysisCache && typeof uiState.reviewAnalysisCache === 'object' ? uiState.reviewAnalysisCache : {};
  uiState.reviewAnalysisCache[record.ticker] = cloneData(merged, {raw:'', normalized:null, prompt:'', error:'', reviewedAt:''});
}

function getReviewAnalysisState(record){
  const item = record && typeof record === 'object' ? record : {};
  const cachedState = uiState.reviewAnalysisCache && typeof uiState.reviewAnalysisCache === 'object'
    ? uiState.reviewAnalysisCache[item.ticker]
    : null;
  const baseState = item.review.analysisState && typeof item.review.analysisState === 'object'
    ? item.review.analysisState
    : {};
  const hasPersistedAnalysisPayload = !!(baseState.raw || baseState.normalized || baseState.error);
  const sourceState = hasPersistedAnalysisPayload ? baseState : (cachedState || baseState);
  const normalizedSource = sourceState.normalized || item.review.normalizedAnalysis || null;
  const normalizedAnalysis = normalizedSource ? cloneData(normalizedSource, null) : null;
  const rawAnalysis = String(sourceState.raw || item.review.aiAnalysisRaw || (normalizedAnalysis ? JSON.stringify(sourceState.normalized || {}, null, 2) : ''));
  const promptPreview = String(sourceState.prompt || item.review.lastPrompt || '');
  const error = String(sourceState.error || item.review.lastError || '');
  const analysisState = {
    normalizedAnalysis,
    rawAnalysis,
    promptPreview,
    error,
    reviewedAt: String(sourceState.reviewedAt || item.review.lastReviewedAt || ''),
    hasSavedAnalysis: !!(normalizedAnalysis || rawAnalysis)
  };
  console.log('REVIEW_WORKSPACE_READ', {
    ticker:item.ticker,
        reviewFields:{
      aiAnalysisRawLength:analysisState.rawAnalysis.length,
      normalizedAnalysisExists:!!analysisState.normalizedAnalysis,
      lastError:analysisState.error,
      lastReviewedAt:analysisState.reviewedAt,
      lastPromptLength:analysisState.promptPreview.length
    },
    hasSavedAnalysis:analysisState.hasSavedAnalysis,
    hasNormalizedAnalysis:!!analysisState.normalizedAnalysis,
    rawAnalysisLength:analysisState.rawAnalysis.length,
    promptLength:analysisState.promptPreview.length,
    error:analysisState.error
  });
  return analysisState;
}

function reviewAnalysisUiStateForRecord(record){
  const item = normalizeTickerRecord(record);
  const analysisState = getReviewAnalysisState(item);
  const chartAttached = !!(item.review && item.review.chartRef && item.review.chartRef.dataUrl);
  if(!chartAttached) return 'idle';
  if(uiState.loadingTicker === item.ticker) return 'running';
  if(analysisState.error) return 'error';
  if(analysisState.hasSavedAnalysis) return 'complete';
  return 'ready';
}

function queueAutoAnalysisForTicker(ticker){
  const symbol = normalizeTicker(ticker);
  if(!symbol) return;
  setScannerCardClickTrace(symbol, 'queueAutoAnalysisForTicker.scheduled', 'queued');
  window.setTimeout(() => {
    if(activeReviewTicker() !== symbol){
      setScannerCardClickTrace(symbol, 'queueAutoAnalysisForTicker.skipped', 'inactive_review_ticker');
      return;
    }
    if(uiState.loadingTicker){
      setScannerCardClickTrace(symbol, 'queueAutoAnalysisForTicker.skipped', `loadingTicker=${uiState.loadingTicker}`);
      return;
    }
    const record = getTickerRecord(symbol);
    if(!record){
      setScannerCardClickTrace(symbol, 'queueAutoAnalysisForTicker.skipped', 'record_missing');
      return;
    }
    const analysisUiState = reviewAnalysisUiStateForRecord(record);
    if(analysisUiState !== 'ready'){
      setScannerCardClickTrace(symbol, 'queueAutoAnalysisForTicker.skipped', `analysis_state=${analysisUiState}`);
      return;
    }
    setScannerCardClickTrace(symbol, 'queueAutoAnalysisForTicker.run', 'analyseSetup');
    analyseSetup(symbol);
  }, 0);
}

function buildTickerPromptFromRecord(record){
  const item = record && typeof record === 'object' ? record : {};
  const projected = item.scan.analysisProjection || {};
  const manualReview = item.review.manualReview || {};
  const checks = (manualReview && manualReview.checks) || (item.scan.flags && item.scan.flags.checks) || {};
  const appVerdictCeiling = aiVerdictCeilingForRecord(item);
  const marketData = Number.isFinite(item.marketData.price) || Number.isFinite(item.marketData.ma20) || Number.isFinite(item.marketData.ma50) || Number.isFinite(item.marketData.ma200)
    ? {
      price:item.marketData.price,
      sma20:item.marketData.ma20,
      sma50:item.marketData.ma50,
      sma200:item.marketData.ma200,
      volume:item.marketData.volume,
      avgVolume30d:item.marketData.avgVolume,
      perf1w:item.marketData.perf1w,
      perf1m:item.marketData.perf1m,
      perf3m:item.marketData.perf3m,
      perf6m:item.marketData.perf6m,
      perfYtd:item.marketData.perfYtd,
      rsi14:item.marketData.rsi,
      companyName:item.meta.companyName,
      exchange:item.meta.exchange
    }
    : null;
  const payload = {
    ticker:item.ticker,
    marketStatus:item.meta.marketStatus || state.marketStatus,
    scanType:item.scan.scanType || projected.scan_type || 'unknown',
    accountSize:state.accountSize,
    maxRisk:currentMaxLoss(),
    trendState:projected.trend_state || item.scan.trendStatus || 'review',
    pullbackZone:projected.pullback_zone || item.scan.pullbackStatus || 'review',
    structureState:projected.structure_state || (checks.structureBroken ? 'broken' : 'intact'),
    stabilisationState:projected.stabilisation_state || (checks.stabilising ? 'clear' : 'none'),
    bounceState:projected.bounce_state || (checks.bounce ? 'attempt' : 'none'),
    volumeState:projected.volume_state || (checks.volume ? 'supportive' : 'neutral'),
    entryDefined:item.plan.hasValidPlan ? 'yes' : 'no',
    stopDefined:item.plan.hasValidPlan ? 'yes' : 'no',
    targetDefined:item.plan.hasValidPlan ? 'yes' : 'no',
    notes:item.review.notes || '',
    checklist:checklistText(checks),
    compactChecklist:compactChecklistText(checks),
    chartAttached:item.review.chartAvailable ? 'yes' : 'no',
    chartFileName:item.review.chartRef ? item.review.chartRef.name : '',
    appVerdictCeiling,
    chartMatchStatus:'unclear',
    chartMatchWarning:'',
    entry:formatPlanFieldValue(item.plan.entry),
    stop:formatPlanFieldValue(item.plan.stop),
    target:formatPlanFieldValue(item.plan.firstTarget),
    marketData
  };
  return buildPromptBody(payload).join('\n');
}

function scannerHardFailReasons(data, checks, tradePlan){
  const price = numericOrNull(data.price);
  const sma50 = numericOrNull(data.sma50);
  const sma200 = numericOrNull(data.sma200);
  const reasons = [];
  if(Number.isFinite(price) && Number.isFinite(sma200) && price < sma200) reasons.push('Price is below the 200 MA.');
  if(Number.isFinite(sma50) && Number.isFinite(sma200) && sma50 < sma200) reasons.push('50 MA is below the 200 MA.');
  if(checks.structureBroken) reasons.push('Structure looks broken.');
  if(!Number.isFinite(tradePlan.stop) || !Number.isFinite(tradePlan.riskPerShare) || tradePlan.riskPerShare <= 0) reasons.push('No valid stop.');
  if(!Number.isFinite(tradePlan.target) || tradePlan.target <= tradePlan.entry) reasons.push('No valid target.');
  return reasons;
}

function rankedStatusFromScore(score){
  if(score >= 8) return 'Entry';
  if(score >= 6) return 'Near Entry';
  if(score >= 4) return 'Watch';
  return 'Avoid';
}

function determineScannerVerdict({technicalValid, score, checks, riskFit, rewardRisk}){
  if(!technicalValid || !Number.isFinite(score) || score < 4) return 'Avoid';
  if(riskFit.risk_status !== 'fits_risk') return 'Avoid';
  if(!rewardRisk.valid || rewardRisk.rrState === 'invalid' || rewardRisk.rrState === 'weak') return 'Avoid';
  if(!(checks.stabilising || checks.bounce)) return 'Watch';
  if(rewardRisk.rrState === 'strong') return 'Entry';
  return 'Near Entry';
}

function resultSortScore(card){
  const verdict = String(card && (card.chartVerdict || card.status) || 'Watch');
  const riskStatus = String(card && card.riskStatus || '');
  const rrRatio = numericOrNull(card && (card.rrRatio ?? (card.analysis && card.analysis.rr_ratio) ?? (card.analysis && card.analysis.reward_risk)));
  const actionStage = verdict === 'Avoid'
    ? 'avoid'
    : (verdict === 'Entry' && riskStatus === 'fits_risk'
      ? 'action_now'
      : (verdict === 'Near Entry' && riskStatus === 'fits_risk'
        ? 'near_entry'
        : ((riskStatus === 'plan_missing' || riskStatus === 'invalid_plan') ? 'needs_plan' : 'watch')));
  const score = Number.isFinite(Number(card && card.score)) ? Number(card.score) : 0;
  return ((5 - actionPriority(actionStage)) * 1000) + (score * 100) + (Number.isFinite(rrRatio) ? rrRatio : 0);
}

function buildVerdictReason({suitability, scan, riskFit, rewardRisk, checks}){
  if(scan.status === 'Avoid') return scan.summary || 'Technical structure is invalid for this setup.';
  if(riskFit.risk_status === 'plan_missing') return 'Trade plan is incomplete. Define entry, stop, and first target.';
  if(riskFit.risk_status === 'invalid_plan') return 'Trade plan is invalid. Entry must sit above stop.';
  if(riskFit.risk_status === 'settings_missing') return 'Account size or risk % is not configured. Check Settings before sizing any trade.';
  if(riskFit.risk_status === 'too_wide') return 'Risk does not fit the current account rule.';
  if(!rewardRisk.valid) return 'Reward:risk is invalid because the first target is not usable.';
  if(rewardRisk.rrState === 'weak') return `First target is too close at ${rewardRisk.rrRatio.toFixed(2)}R.`;
  if(!(checks.stabilising || checks.bounce)) return 'Technicals are promising, but stabilisation or bounce is not confirmed yet.';
  return suitability ? suitability.summary : 'Candidate remains reviewable.';
}

function classifyPullbackType(data){
  const price = numericOrNull(data.price);
  const sma20 = numericOrNull(data.sma20);
  const sma50 = numericOrNull(data.sma50);
  if(!Number.isFinite(price) || !Number.isFinite(sma20) || !Number.isFinite(sma50) || sma20 <= 0 || sma50 <= 0){
    return {type:'Unclassified', scoreAdjustment:0, distance20:null, distance50:null, extended:false};
  }
  const distance20 = Math.abs(price - sma20) / sma20;
  const distance50 = Math.abs(price - sma50) / sma50;
  if(price > sma20 * 1.06){
    return {type:'Extended', scoreAdjustment:-2, distance20, distance50, extended:true};
  }
  if(price < sma50){
    return {type:'Broken Trend', scoreAdjustment:-2, distance20, distance50, extended:false};
  }
  if(distance20 <= 0.03){
    return {type:'20MA Touch', scoreAdjustment:2, distance20, distance50, extended:false};
  }
  if(distance20 <= 0.06){
    return {type:'20MA Bounce', scoreAdjustment:1, distance20, distance50, extended:false};
  }
  if(distance20 > 0.06 && price > sma20){
    return {type:'Shallow Pullback', scoreAdjustment:0, distance20, distance50, extended:false};
  }
  if(distance50 <= 0.03){
    return {type:'50MA Pullback', scoreAdjustment:-1, distance20, distance50, extended:false};
  }
  return {type:'Unclassified', scoreAdjustment:0, distance20, distance50, extended:false};
}

function scoreSuitability(card, data, checks){
  const perf3m = numericOrNull(data.perf3m);
  const price = numericOrNull(data.price);
  const sma20 = numericOrNull(data.sma20);
  const sma50 = numericOrNull(data.sma50);
  const scanType = resolveScanType(card, data, checks);
  const evaluationScanType = scanTypeForEvaluation(scanType);
  const tradePlan = deriveTradePlan(data, evaluationScanType);
  const pullbackType = classifyPullbackType(data);
  const distance20 = Number.isFinite(price) && Number.isFinite(sma20) && sma20 > 0 ? Math.abs(price - sma20) / sma20 : null;
  const distance50 = Number.isFinite(price) && Number.isFinite(sma50) && sma50 > 0 ? Math.abs(price - sma50) / sma50 : null;
  const mediumTermStrength = Number.isFinite(perf3m) && perf3m > 0;
  const trend =
    (checks.above50 ? 1 : 0) +
    (checks.above200 ? 1 : 0) +
    (checks.ma50gt200 ? 1 : 0) +
    (mediumTermStrength ? 1 : 0);
  const controlledPullback = evaluationScanType === '50MA'
    ? (checks.near50 || (Number.isFinite(distance50) && distance50 <= 0.05))
    : (evaluationScanType === '20MA'
      ? (checks.near20 || (Number.isFinite(distance20) && distance20 <= 0.04))
      : ((checks.near20 || checks.near50) && ((Number.isFinite(distance20) && distance20 <= 0.04) || (Number.isFinite(distance50) && distance50 <= 0.05))));
  const pullback =
    ((checks.near20 || checks.near50) ? 1 : 0) +
    (controlledPullback ? 1 : 0) +
    ((checks.stabilising || checks.bounce) ? 1 : 0);
  const entryDefined = !!(card.entry || Number.isFinite(tradePlan.entry));
  const stopDefined = !!(card.stop || Number.isFinite(tradePlan.stop));
  const targetDefined = !!(card.target || Number.isFinite(tradePlan.target));
  const tradeQuality =
    (entryDefined ? 1 : 0) +
    (stopDefined ? 1 : 0) +
    (targetDefined ? 1 : 0);
  let total = trend + pullback + tradeQuality + (Number.isFinite(pullbackType.scoreAdjustment) ? pullbackType.scoreAdjustment : 0);
  const marketBelow50 = /below 50 ma/i.test(String(state.marketStatus || ''));
  if(marketBelow50){
    if(total >= 8 && !checks.bounce) total = 7;
    if(total >= 6 && !checks.stabilising && !checks.bounce) total = 5;
  }
  if(scanType === 'unknown'){
    if(total >= 8 && !(checks.bounce && checks.stabilising)) total = 7;
    if(total >= 6 && !checks.bounce) total = 5;
  }
  total = clamp(total, 0, 10);
  const trendStatus = checks.above200 && checks.ma50gt200 ? (checks.above50 ? 'strong' : 'acceptable') : 'weak';
  const pullbackStatus = checks.near20 ? 'near 20MA' : (checks.near50 ? 'near 50MA' : (pullbackType.extended ? 'extended' : 'not at support'));
  return {
    total:Math.round(total),
    breakdown:{
      trend,
      pullback,
      tradeQuality,
      trendStatus,
      pullbackStatus,
      scanType,
      pullbackType:pullbackType.type,
      scoreAdjustment:pullbackType.scoreAdjustment,
      distance20:pullbackType.distance20,
      distance50:pullbackType.distance50,
      extended:pullbackType.extended,
      controlledPullback,
      bounceReady:checks.stabilising || checks.bounce
    },
    tradePlan,
    summary:buildSuitabilitySummary({
      trend,
      pullback,
      tradeQuality,
      scanType,
      controlledPullback,
      bounceReady:checks.stabilising || checks.bounce
    }),
    pullbackType:pullbackType.type
  };
}

function buildScannerChecks(data){
  const price = numericOrNull(data.price);
  const sma20 = numericOrNull(data.sma20);
  const sma50 = numericOrNull(data.sma50);
  const sma200 = numericOrNull(data.sma200);
  const perf1w = numericOrNull(data.perf1w);
  const volume = numericOrNull(data.volume);
  const avgVolume30d = numericOrNull(data.avgVolume30d);
  const near20 = isNearLevel(price, sma20, 0.025);
  const near50 = isNearLevel(price, sma50, 0.035);
  const trendStrong = Number.isFinite(price) && Number.isFinite(sma50) && Number.isFinite(sma200) && Number.isFinite(sma20) && price > sma50 && price > sma200 && sma20 > sma50 && sma50 > sma200;
  const structureBroken = Number.isFinite(price) && Number.isFinite(sma50) && Number.isFinite(sma20) && price < sma50 && sma20 < sma50;
  const relevantReclaim = near50 && Number.isFinite(sma50) ? sma50 : sma20;
  const reclaimedSupport = Number.isFinite(price) && Number.isFinite(relevantReclaim) && price >= relevantReclaim * 0.998;
  const bounceReady = Number.isFinite(perf1w) && perf1w >= 2 && reclaimedSupport && !structureBroken;
  return {
    trendStrong,
    above50:Number.isFinite(price) && Number.isFinite(sma50) && price > sma50,
    above200:Number.isFinite(price) && Number.isFinite(sma200) && price > sma200,
    ma50gt200:Number.isFinite(sma50) && Number.isFinite(sma200) && sma50 > sma200,
    near20,
    near50,
    stabilising:(near20 || near50) && (!Number.isFinite(perf1w) || perf1w > -1.5),
    bounce:bounceReady,
    bounceStrength:Number.isFinite(perf1w)
      ? (perf1w >= 3 ? 'strong' : (perf1w >= 1 ? 'moderate' : (perf1w > 0 ? 'weak' : 'none')))
      : 'none',
    volume:Number.isFinite(volume) && Number.isFinite(avgVolume30d) && volume >= avgVolume30d,
    mediumTermStrength:Number.isFinite(numericOrNull(data.perf3m)) && numericOrNull(data.perf3m) > 0,
    structureBroken,
    entryDefined:false,
    stopDefined:false,
    targetDefined:false
  };
}

function scoreMarketData(data){
  let score = 0;
  const checks = buildScannerChecks(data);
  if(checks.above50) score += 1;
  if(checks.above200) score += 1;
  if(checks.ma50gt200) score += 1;
  if(checks.volume) score += 1;
  if(checks.near20 || checks.near50) score += 2;
  if(Number.isFinite(data.perf1m) && data.perf1m > 0) score += 1;
  if(Number.isFinite(data.perf3m) && data.perf3m > 5) score += 1;
  if(Number.isFinite(data.perf6m) && data.perf6m > 10) score += 1;
  if(Number.isFinite(data.perfYtd) && data.perfYtd > 5) score += 1;
  if(Number.isFinite(data.rsi14) && data.rsi14 >= 40 && data.rsi14 <= 60) score += 1;
  return {score:Math.max(0, Math.min(10, score)), checks};
}

async function evaluateScannerForData(data){
  const safeData = data && typeof data === 'object' ? data : {};
  if(safeData.__error || !hasUsableScannerData(safeData)){
    const reason = String(safeData.__error || 'Market data is unavailable for this ticker right now.');
    const breakdown = [{passed:false, label:`Manual Review: ${reason}`}];
    return {
      status:'Manual Review',
      score:35,
      checks:buildScannerChecks({}),
      summary:marketDataManualReviewSummary(reason),
      passedRules:0,
      totalRules:1,
      passed:true,
      failedRule:reason,
      reason,
      breakdown
    };
  }
  const checks = buildScannerChecks(safeData);
  const scanType = resolveScanType(null, safeData, checks);
  const tradePlan = deriveTradePlan(safeData, scanTypeForEvaluation(scanType));
  const hardReasons = scannerHardFailReasons(safeData, checks, tradePlan);
  const breakdown = [
    {passed:checks.above200, label:checks.above200 ? 'Above the 200 MA.' : 'Below the 200 MA.'},
    {passed:checks.ma50gt200, label:checks.ma50gt200 ? '50 MA is above the 200 MA.' : '50 MA is below the 200 MA.'},
    {passed:checks.near20 || checks.near50, label:checks.near20 ? 'Pullback is near the 20 MA.' : (checks.near50 ? 'Pullback is near the 50 MA.' : 'Pullback is not near the main support zone.')},
    {passed:checks.stabilising, label:checks.stabilising ? 'Setup is stabilising.' : 'Setup is still early.'},
    {passed:checks.bounce, label:checks.bounce ? 'Bounce is developing.' : 'Bounce is not confirmed yet.'},
    {passed:tradePlan.positionSize >= 1, label:tradePlan.positionSize >= 1 ? `Risk fits at ${tradePlan.positionSize} share(s).` : 'Risk rule does not allow 1 share.'},
    {passed:tradePlan.rrValid && tradePlan.rr >= 1.5, label:tradePlan.rrValid ? `Reward:risk is ${tradePlan.rr.toFixed(2)}R.` : 'Reward:risk is invalid.'}
  ];
  const passedRules = breakdown.filter(item => item.passed).length;
  const hardFail = hardReasons.length > 0;
  const failedRule = hardReasons[0] || '';
  const status = hardFail ? 'Avoid' : 'Watch';
  const score = hardFail ? 0 : 4;
  const result = {
    status,
    score,
    checks,
    summary:buildScannerSummary({status, failedRule, reason:hardFail ? hardReasons.join(' ') : 'Imported TradingView ticker kept reviewable for softer ranking.'}),
    passedRules,
    totalRules:breakdown.length,
    passed:!hardFail,
    failedRule,
    reason:hardFail ? hardReasons.join(' ') : 'TradingView candidate kept reviewable for stage-two evaluation.',
    breakdown
  };
  return result;
}

function applyMarketDataToCard(card, data){
  if(!card || !data) return;
  card.marketData = {...data};
  card.marketDataUpdatedAt = data.fetchedAt || new Date().toISOString();
  card.companyName = String(data.companyName || card.companyName || '');
  card.exchange = String(data.exchange || card.exchange || '');
  card.tradingViewSymbol = String(data.tradingViewSymbol || card.tradingViewSymbol || '');
  card.marketCap = numericOrNull(data.marketCap);
  card.price = numericOrNull(data.price);
  card.sma20 = numericOrNull(data.sma20);
  card.sma50 = numericOrNull(data.sma50);
  card.sma200 = numericOrNull(data.sma200);
  card.volume = numericOrNull(data.volume);
  card.avgVolume30d = numericOrNull(data.avgVolume30d);
  card.perf1w = numericOrNull(data.perf1w);
  card.perf1m = numericOrNull(data.perf1m);
  card.perf3m = numericOrNull(data.perf3m);
  card.perf6m = numericOrNull(data.perf6m);
  card.perfYtd = numericOrNull(data.perfYtd);
  card.rsi14 = numericOrNull(data.rsi14);
}

async function refreshCardMarketData(ticker, options = {}){
  const record = getTickerRecord(ticker);
  const card = normalizeCard(record ? tickerRecordToLegacyCard(record) : baseCard(ticker));
  const meta = getStoredTickerMeta(ticker);
  if(meta) applyTickerMetaToCard(card, meta);
  const data = await fetchMarketData(ticker, options);
  applyMarketDataToCard(card, data);
  const scan = await evaluateScannerForData(data);
  card.checks = scan.checks;
  const suitability = !data.__error && hasUsableScannerData(data) ? scoreSuitability(card, data, scan.checks) : null;
  const derivedStates = deriveSetupStates(card, data, scan.checks, suitability ? suitability.tradePlan : null);
  const tradePlan = suitability ? suitability.tradePlan : deriveTradePlan(data, derivedStates.scan_type === 'unknown' ? '20MA' : derivedStates.scan_type);
  const riskFit = evaluateRiskFit({
    entry:tradePlan.entry,
    stop:tradePlan.stop,
    ...currentRiskSettings()
  });
  const rewardRisk = evaluateRewardRisk(tradePlan.entry, tradePlan.stop, tradePlan.target);
  const technicalValid = scan.status !== 'Avoid';
  const chartVerdict = suitability
    ? determineScannerVerdict({
      technicalValid,
      score:suitability.total,
      checks:scan.checks,
      riskFit,
      rewardRisk
    })
    : scan.status;
  const verdictReason = buildVerdictReason({
    suitability,
    scan,
    riskFit,
    rewardRisk,
    checks:scan.checks
  });
  card.score = suitability ? suitability.total : scan.score;
  card.chartVerdict = chartVerdict;
  card.riskStatus = riskFit.risk_status;
  card.rewardPerShare = rewardRisk.rewardPerShare;
  card.rrRatio = rewardRisk.rrRatio;
  card.rrState = rewardRisk.rrState;
  card.firstTargetTooClose = rewardRisk.valid ? rewardRisk.rewardPerShare < (1.5 * rewardRisk.riskPerShare) : false;
  card.status = bucketStatusForCard({chartVerdict, riskStatus:riskFit.risk_status});
  card.summary = buildScannerSummary({status:chartVerdict, reason:verdictReason});
  card.pullbackType = suitability ? suitability.pullbackType : '';
  card.setupType = derivedStates.scan_type;
  card.scanSetupType = derivedStates.scan_type;
  card.trendStatus = derivedStates.trend_state;
  card.pullbackStatus = derivedStates.pullback_zone;
  card.source = 'scanner';
  card.marketStatus = state.marketStatus;
  card.updatedAt = new Date().toISOString();
  card.scannerUpdatedAt = card.updatedAt;
  if(data.__error){
    card.lastError = data.__error;
  }
  card.analysis = {
    price:data.price,
    sma20:data.sma20,
    sma50:data.sma50,
    sma200:data.sma200,
    avgVolume30d:data.avgVolume30d,
    perf1w:data.perf1w,
    perf1m:data.perf1m,
    perf3m:data.perf3m,
    perf6m:data.perf6m,
    perfYtd:data.perfYtd,
    rsi14:data.rsi14,
    passedRules:scan.passedRules,
    totalRules:scan.totalRules,
    breakdown:scan.breakdown,
    failedRule:scan.failedRule,
    passed:scan.passed,
    suitability:suitability ? suitability.breakdown : null,
    pullbackType:suitability ? suitability.pullbackType : '',
    derived_states:derivedStates,
    scan_type:derivedStates.scan_type,
    setup_type:derivedStates.scan_type,
    trend_state:derivedStates.trend_state,
    trend_status:derivedStates.trend_state,
    pullback_zone:derivedStates.pullback_zone,
    pullback_status:derivedStates.pullback_zone,
    structure_state:derivedStates.structure_state,
    stabilisation_state:derivedStates.stabilisation_state,
    bounce_state:derivedStates.bounce_state,
    volume_state:derivedStates.volume_state,
    entry_defined:derivedStates.entry_defined,
    stop_defined:derivedStates.stop_defined,
    target_defined:derivedStates.target_defined,
    chart_verdict:chartVerdict,
    risk_status:riskFit.risk_status,
    max_loss:Number.isFinite(riskFit.max_loss) ? riskFit.max_loss.toFixed(2) : '',
    entry:Number.isFinite(tradePlan.entry) ? tradePlan.entry.toFixed(2) : '',
    stop:Number.isFinite(tradePlan.stop) ? tradePlan.stop.toFixed(2) : '',
    first_target:Number.isFinite(tradePlan.target) ? tradePlan.target.toFixed(2) : '',
    risk_per_share:Number.isFinite(riskFit.risk_per_share) ? riskFit.risk_per_share.toFixed(2) : '',
    reward_per_share:Number.isFinite(rewardRisk.rewardPerShare) ? rewardRisk.rewardPerShare.toFixed(2) : '',
    rr_ratio:Number.isFinite(rewardRisk.rrRatio) ? rewardRisk.rrRatio.toFixed(2) : '',
    rr_state:rewardRisk.rrState,
    first_target_too_close:rewardRisk.valid ? rewardRisk.rewardPerShare < (1.5 * rewardRisk.riskPerShare) : false,
    position_size:Number.isFinite(riskFit.position_size) ? riskFit.position_size : 0,
    reward_risk:Number.isFinite(rewardRisk.rrRatio) ? rewardRisk.rrRatio.toFixed(2) : '',
    quality_score:suitability ? suitability.total : scan.score,
    confidence_score:suitability ? clamp((suitability.total * 10) + (scan.checks.bounce ? 10 : 0) + (scan.checks.stabilising ? 5 : 0), 10, 100) : 35,
    key_reasons:suitability ? [suitability.summary] : [],
    risks:[
      ...hardListFromScan(scan),
      ...(riskFit.risk_status !== 'fits_risk' ? [riskStatusLabel(riskFit.risk_status)] : []),
      ...(rewardRisk.valid && rewardRisk.rrState === 'weak' ? [`Reward:risk is only ${rewardRisk.rrRatio.toFixed(2)}R.`] : []),
      ...(!rewardRisk.valid ? ['Reward:risk is invalid.'] : [])
    ]
  };
  if(suitability){
    if(!card.entry && Number.isFinite(tradePlan.entry)) card.entry = tradePlan.entry.toFixed(2);
    if(!card.stop && Number.isFinite(tradePlan.stop)) card.stop = tradePlan.stop.toFixed(2);
    if(!card.target && Number.isFinite(tradePlan.target)) card.target = tradePlan.target.toFixed(2);
  }
  console.log('FINAL_ANALYSIS', {
    ticker:card.ticker,
    quality_score:card.score,
    chart_verdict:card.chartVerdict,
    risk_status:card.riskStatus,
    max_loss:riskFit.max_loss,
    risk_per_share:riskFit.risk_per_share,
    reward_per_share:rewardRisk.rewardPerShare,
    rr_ratio:rewardRisk.rrRatio,
    rr_state:rewardRisk.rrState,
    position_size:riskFit.position_size
  });
  return {card, scan};
}

async function refreshMarketDataForTickers(tickers, options = {}){
  const unique = uniqueTickers(tickers);
  if(!unique.length) return {done:0, failed:0, rejected:0};
  state.scannerDebug = [];
  let done = 0;
  let failed = 0;
  let rejected = 0;
  const scannerDebug = [];
  // Fetch in coarse batches so scans do not re-render and persist on every ticker.
  for(let index = 0; index < unique.length; index += SCAN_BATCH_SIZE){
    const batch = unique.slice(index, index + SCAN_BATCH_SIZE);
    const outcomes = await Promise.all(batch.map(async ticker => {
      try{
        const result = await refreshCardMarketData(ticker, options);
        return {ok:true, ticker, ...result};
      }catch(err){
        return {ok:false, ticker, error:err};
      }
    }));
    outcomes.forEach(outcome => {
      if(outcome.ok){
        const {card, scan} = outcome;
        const record = upsertTickerRecord(card.ticker);
        mergeLegacyCardIntoRecord(record, card, {fromScanner:true, fromCards:record.review.cardOpen, cardOpen:record.review.cardOpen});
        const debugEntry = {
          ticker:card.ticker,
          passed:card.status !== 'Avoid',
          status:card.status,
          failedRule:scan.failedRule || '',
          breakdown:scan.breakdown || [],
          derivedStates:card.analysis && card.analysis.derived_states ? card.analysis.derived_states : null
        };
        scannerDebug.push(debugEntry);
        if(card.status === 'Avoid') rejected += 1;
        else done += 1;
        return;
      }
      const tickerSymbol = normalizeTicker(outcome.ticker);
      const fallbackRecord = getTickerRecord(tickerSymbol);
      const fallbackCard = normalizeCard(fallbackRecord ? tickerRecordToLegacyCard(fallbackRecord) : baseCard(tickerSymbol));
      fallbackCard.status = 'Manual Review';
      fallbackCard.score = 35;
      fallbackCard.summary = marketDataManualReviewSummary(outcome.error && outcome.error.message);
      fallbackCard.source = 'scanner';
      fallbackCard.marketStatus = state.marketStatus;
      fallbackCard.updatedAt = new Date().toISOString();
      fallbackCard.scannerUpdatedAt = fallbackCard.updatedAt;
      fallbackCard.lastError = String(outcome.error && outcome.error.message || 'Market data request failed.');
      fallbackCard.analysis = {
        passedRules:0,
        totalRules:1,
        breakdown:[{passed:false, label:`Manual Review: ${fallbackCard.lastError}`}],
        failedRule:fallbackCard.lastError,
        passed:true,
        suitability:null,
        pullbackType:''
      };
      mergeLegacyCardIntoRecord(upsertTickerRecord(tickerSymbol), fallbackCard, {fromScanner:true, fromCards:false});
      scannerDebug.push({
        ticker:tickerSymbol,
        passed:true,
        status:'Manual Review',
        failedRule:String(outcome.error && outcome.error.message || 'Market-data scan failed.'),
        breakdown:[{passed:false, label:`Manual Review: ${String(outcome.error && outcome.error.message || 'Market-data scan failed.')}`}]
      });
      failed += 1;
      done += 1;
    });
    setStatus('apiStatus', `<span class="warntext">Running Quality Pullback Scanner... ${Math.min(index + batch.length, unique.length)} / ${unique.length} complete.</span>`);
  }
  state.scannerDebug = scannerDebug;
  const failedMarketData = scannerDebug.filter(item => (item.breakdown || []).some(entry => /market data unavailable|market data request|no historical market data|free tier|manual review|current provider|not covered/i.test(String(entry.label || '')))).length;
  if(failedMarketData){
    setStatus('apiStatus', `<span class="warntext">Market data is unavailable for ${failedMarketData} ticker${failedMarketData === 1 ? '' : 's'}. You can still open them for manual chart review.</span>`);
  }else if(unique.length){
    setStatus('apiStatus', `<span class="ok">Scanner refreshed ${unique.length} ticker${unique.length === 1 ? '' : 's'}.</span>`);
  }
  runWatchlistLifecycleEvaluation({
    source:'scan',
    persist:false,
    render:false,
    force:true
  });
  commitTickerState();
  renderTickerQuickLists();
  renderScannerResults();
  renderCards();
  renderWatchlist();
  renderScannerRulesPanel();
  return {done, failed, rejected};
}

function recomputeRiskContextForCard(card){
  const normalized = normalizeCard(card);
  const sourceData = normalized.marketData || normalized;
  const checks = normalized.checks || buildScannerChecks(sourceData);
  const scanType = resolveScanType(normalized, sourceData, checks);
  const suitability = hasUsableScannerData(sourceData) ? scoreSuitability(normalized, sourceData, checks) : null;
  const tradePlan = suitability ? suitability.tradePlan : deriveTradePlan(sourceData, scanTypeForEvaluation(scanType));
  const hardReasons = hasUsableScannerData(sourceData) ? scannerHardFailReasons(sourceData, checks, tradePlan) : [];
  const riskFit = evaluateRiskFit({
    entry:tradePlan.entry || normalized.entry,
    stop:tradePlan.stop || normalized.stop,
    ...currentRiskSettings()
  });
  const rewardRisk = evaluateRewardRisk(tradePlan.entry || normalized.entry, tradePlan.stop || normalized.stop, tradePlan.target || normalized.target);
  const chartVerdict = hasUsableScannerData(sourceData)
    ? determineScannerVerdict({
      technicalValid:hardReasons.length === 0,
      score:suitability ? suitability.total : normalized.score,
      checks,
      riskFit,
      rewardRisk
    })
    : (normalized.chartVerdict || normalized.status || 'Watch');
  normalized.chartVerdict = chartVerdict;
  if(suitability) normalized.score = suitability.total;
  normalized.riskStatus = riskFit.risk_status;
  normalized.rewardPerShare = rewardRisk.rewardPerShare;
  normalized.rrRatio = rewardRisk.rrRatio;
  normalized.rrState = rewardRisk.rrState;
  normalized.firstTargetTooClose = rewardRisk.valid ? rewardRisk.rewardPerShare < (1.5 * rewardRisk.riskPerShare) : false;
  normalized.status = bucketStatusForCard({chartVerdict, riskStatus:riskFit.risk_status});
  normalized.summary = buildScannerSummary({
    status:chartVerdict,
    reason:buildVerdictReason({
      suitability,
      scan:{
        status:hardReasons.length ? 'Avoid' : chartVerdict,
        summary:normalized.summary
      },
      riskFit,
      rewardRisk,
      checks
    })
  });
  if(normalized.analysis && typeof normalized.analysis === 'object'){
    normalized.analysis.chart_verdict = chartVerdict;
    normalized.analysis.quality_score = suitability ? suitability.total : normalized.analysis.quality_score;
    normalized.analysis.risk_status = riskFit.risk_status;
    normalized.analysis.max_loss = Number.isFinite(riskFit.max_loss) ? riskFit.max_loss.toFixed(2) : '';
    normalized.analysis.risk_per_share = Number.isFinite(riskFit.risk_per_share) ? riskFit.risk_per_share.toFixed(2) : '';
    normalized.analysis.reward_per_share = Number.isFinite(rewardRisk.rewardPerShare) ? rewardRisk.rewardPerShare.toFixed(2) : '';
    normalized.analysis.rr_ratio = Number.isFinite(rewardRisk.rrRatio) ? rewardRisk.rrRatio.toFixed(2) : '';
    normalized.analysis.rr_state = rewardRisk.rrState;
    normalized.analysis.first_target_too_close = rewardRisk.valid ? rewardRisk.rewardPerShare < (1.5 * rewardRisk.riskPerShare) : false;
    normalized.analysis.reward_risk = Number.isFinite(rewardRisk.rrRatio) ? rewardRisk.rrRatio.toFixed(2) : '';
    normalized.analysis.position_size = Number.isFinite(riskFit.position_size) ? riskFit.position_size : 0;
  }
  return normalized;
}

function recomputeRiskContextForRecord(record){
  const updatedCard = recomputeRiskContextForCard(tickerRecordToLegacyCard(record));
  mergeLegacyCardIntoRecord(record, updatedCard, {
    fromScanner:true,
    fromCards:record.review.cardOpen,
    cardOpen:record.review.cardOpen
  });
  return record;
}

function refreshRiskContextForActiveSetups(options = {}){
  state.userRiskPerTrade = currentMaxLoss();
  state.maxRisk = state.userRiskPerTrade;
  allTickerRecords().forEach(recomputeRiskContextForRecord);
  runWatchlistLifecycleEvaluation({
    source:String(options.source || 'risk_context'),
    persist:false,
    render:false,
    force:options.force === true
  });
  commitTickerState();
  renderStats();
  renderScannerResults();
  renderCards();
  renderWatchlist();
  renderFocusQueue();
}

async function testApiConnection(){
  saveState();
  setStatus('apiStatus', `<span class="warntext">Testing ${escapeHtml(currentProviderLabel())} market data...</span>`);
  try{
    const data = await fetchMarketData('AAPL', {force:true});
    setStatus('apiStatus', `<span class="ok">Connected.</span> Loaded ${escapeHtml(data.ticker)} from ${escapeHtml(currentProviderLabel())} with price ${escapeHtml(fmtPrice(Number(data.price)))} and SMA 50 ${escapeHtml(fmtPrice(Number(data.sma50)))}.`);
  }catch(err){
    setStatus('apiStatus', `<span class="badtext">${escapeHtml(err.message)}</span>`);
  }
}

async function autoAnalyseWatchlist(options = {}){
  return runScannerWorkflow(options);
}

function currentChecks(){
  const out = {};
  checklistIds.forEach(id => { out[id] = $(id).checked; });
  return out;
}

function checklistText(checks){
  return checklistIds.map(id => `- ${checklistLabels[id]}: ${checks && checks[id] ? 'Yes' : 'No'}`).join('\n');
}

function compactChecklistText(checks){
  return [
    `uptrend=${checks && checks.trendStrong ? 'Y' : 'N'}`,
    `above50=${checks && checks.above50 ? 'Y' : 'N'}`,
    `above200=${checks && checks.above200 ? 'Y' : 'N'}`,
    `ma50gt200=${checks && checks.ma50gt200 ? 'Y' : 'N'}`,
    `near20=${checks && checks.near20 ? 'Y' : 'N'}`,
    `near50=${checks && checks.near50 ? 'Y' : 'N'}`,
    `stabilising=${checks && checks.stabilising ? 'Y' : 'N'}`,
    `bounce=${checks && checks.bounce ? 'Y' : 'N'}`,
    `volume=${checks && checks.volume ? 'Y' : 'N'}`,
    `entryDefined=${checks && checks.entryDefined ? 'Y' : 'N'}`,
    `stopDefined=${checks && checks.stopDefined ? 'Y' : 'N'}`,
    `targetDefined=${checks && checks.targetDefined ? 'Y' : 'N'}`
  ].join(', ');
}

function resolveSetupTypeWithOverlap(card, data, checks){
  const explicit = normalizeScanType(
    (card && (card.scanSetupType || card.scanType || card.setupType))
    || (data && (data.scanSetupType || data.scanType || data.setupType))
  );
  const globalType = currentSetupType();
  const price = numericOrNull(data && (data.price ?? (card && card.price)));
  const sma20 = numericOrNull(data && (data.sma20 ?? (card && card.sma20)));
  const sma50 = numericOrNull(data && (data.sma50 ?? (card && card.sma50)));
  const perf1w = numericOrNull(data && (data.perf1w ?? (card && card.perf1w)));
  const near20 = !!(checks && checks.near20);
  const near50 = !!(checks && checks.near50);
  const overlapDetected = near20 && near50;
  const marketWeak = /below 50 ma|weak|hostile/i.test(String(state.marketStatus || ''));
  const distance20 = Number.isFinite(price) && Number.isFinite(sma20) && sma20 > 0 ? Math.abs(price - sma20) / sma20 : null;
  const distance50 = Number.isFinite(price) && Number.isFinite(sma50) && sma50 > 0 ? Math.abs(price - sma50) / sma50 : null;
  const below20 = Number.isFinite(price) && Number.isFinite(sma20) ? price < sma20 * 0.998 : false;
  const below50 = Number.isFinite(price) && Number.isFinite(sma50) ? price < sma50 * 0.998 : false;
  const structureBroken = !!(checks && checks.structureBroken);
  const constructiveBounce = !!(checks && (checks.bounce || checks.stabilising));
  const strongTrend = !!(checks && checks.trendStrong);
  const explicitSupported = explicit && (
    !overlapDetected
    || (explicit === '20MA' && near20 && !near50)
    || (explicit === '50MA' && near50 && !near20)
  );

  if(explicit && !overlapDetected) return {
    importedScanType:explicit,
    globalSetupType:globalType,
    overlapDetected:false,
    resolvedScanType:explicit,
    reason:'Explicit setup type kept because the chart does not show a true 20MA/50MA overlap.'
  };
  if(!explicit && globalType !== 'unknown' && !overlapDetected) return {
    importedScanType:'unknown',
    globalSetupType:globalType,
    overlapDetected:false,
    resolvedScanType:globalType,
    reason:'Global setup toggle applied because the chart does not show a true overlap.'
  };
  if(explicitSupported && explicit) return {
    importedScanType:explicit,
    globalSetupType:globalType,
    overlapDetected:false,
    resolvedScanType:explicit,
    reason:'Explicit setup type stayed in force because the chart still clearly fits it.'
  };
  if(near20 && !near50) return {
    importedScanType:explicit || 'unknown',
    globalSetupType:globalType,
    overlapDetected:false,
    resolvedScanType:'20MA',
    reason:'Price is only near the 20MA, so the setup resolves as 20MA.'
  };
  if(near50 && !near20) return {
    importedScanType:explicit || 'unknown',
    globalSetupType:globalType,
    overlapDetected:false,
    resolvedScanType:'50MA',
    reason:'Price is only near the 50MA, so the setup resolves as 50MA.'
  };
  if(!overlapDetected) return {
    importedScanType:explicit || 'unknown',
    globalSetupType:globalType,
    overlapDetected:false,
    resolvedScanType:'unknown',
    reason:'Neither moving average is clearly in play, so setup type remains unknown.'
  };

  let score20 = 0;
  let score50 = 0;
  const reasons = [];
  if(Number.isFinite(distance20) && Number.isFinite(distance50)){
    if(distance20 + 0.0025 < distance50){
      score20 += 2;
      reasons.push('price is clearly closer to the 20MA');
    }else if(distance50 + 0.0025 < distance20){
      score50 += 2;
      reasons.push('price is clearly closer to the 50MA');
    }else{
      reasons.push('price is genuinely near both moving averages');
    }
  }else{
    reasons.push('price is genuinely near both moving averages');
  }
  if(strongTrend && !structureBroken){
    score20 += 1;
    reasons.push('trend structure still supports a continuation-style pullback');
  }
  if(constructiveBounce){
    score20 += 1;
    reasons.push('stabilisation or bounce still looks constructive');
  }
  if(below20){
    score50 += 2;
    reasons.push('price has meaningfully lost the 20MA');
  }
  if(structureBroken){
    score50 += 2;
    reasons.push('structure damage makes this behave more like a deeper 50MA setup');
  }else if(!strongTrend){
    score50 += 1;
    reasons.push('trend quality is not strong enough for a clean 20MA continuation');
  }
  if(marketWeak){
    score50 += 1;
    reasons.push('weak market biases overlap cases toward the more conservative 50MA treatment');
  }
  if(Number.isFinite(perf1w) && perf1w < 0){
    score50 += 1;
    reasons.push('recent price action still looks heavy rather than cleanly constructive');
  }
  if(below50){
    score50 += 2;
    reasons.push('price is under the 50MA, which rules out optimistic 20MA treatment');
  }

  let resolvedScanType = 'ambiguous';
  if(score50 >= score20 + 2){
    resolvedScanType = '50MA';
  }else if(score20 >= score50 + 2){
    resolvedScanType = '20MA';
  }
  const reason = resolvedScanType === '20MA'
    ? `Overlap resolved to 20MA because ${reasons.join(', ')}.`
    : (resolvedScanType === '50MA'
      ? `Overlap resolved to 50MA because ${reasons.join(', ')}.`
      : `Overlap remains ambiguous because ${reasons.join(', ')}.`);

  return {
    importedScanType:explicit || 'unknown',
    globalSetupType:globalType,
    overlapDetected:true,
    resolvedScanType,
    reason
  };
}

function resolveScanType(card, data, checks){
  return resolveSetupTypeWithOverlap(card, data, checks).resolvedScanType;
}

function resolveSetupTypeDebug(card, data, checks){
  return resolveSetupTypeWithOverlap(
    card,
    data,
    checks
  );
}

function mergeDerivedChecks(cardChecks, dataChecks, tradePlan){
  const merged = {};
  checklistIds.forEach(id => {
    merged[id] = false;
  });
  [dataChecks || {}, cardChecks || {}].forEach(source => {
    checklistIds.forEach(id => {
      if(source[id] === true) merged[id] = true;
      else if(source[id] === false && merged[id] !== true) merged[id] = false;
    });
  });
  if(tradePlan){
    if(Number.isFinite(tradePlan.entry)) merged.entryDefined = true;
    if(Number.isFinite(tradePlan.stop) && Number.isFinite(tradePlan.riskPerShare) && tradePlan.riskPerShare > 0) merged.stopDefined = true;
    if(Number.isFinite(tradePlan.target) && Number.isFinite(tradePlan.rr) && tradePlan.rr > 0) merged.targetDefined = true;
  }
  return merged;
}

// Derive richer setup states from market data and current card context.
function deriveSetupStates(card, data, checks, tradePlan){
  const safeCard = card || {};
  const safeData = data || {};
  const baseChecks = buildScannerChecks(safeData);
  const preflightChecks = mergeDerivedChecks((safeCard && safeCard.checks) || {}, checks || baseChecks, null);
  const initialSetupType = resolveSetupTypeDebug(safeCard, safeData, preflightChecks);
  const initialScanType = initialSetupType.resolvedScanType;
  const plan = tradePlan || deriveTradePlan(safeData, scanTypeForEvaluation(initialScanType));
  const safeChecks = mergeDerivedChecks((safeCard && safeCard.checks) || {}, checks || baseChecks, plan);
  const setupTypeDecision = resolveSetupTypeDebug(safeCard, safeData, safeChecks);
  const scanType = setupTypeDecision.resolvedScanType;
  const evaluationScanType = scanTypeForEvaluation(scanType);
  const price = numericOrNull(safeData.price ?? safeCard.price);
  const sma20 = numericOrNull(safeData.sma20 ?? safeCard.sma20);
  const sma50 = numericOrNull(safeData.sma50 ?? safeCard.sma50);
  const sma200 = numericOrNull(safeData.sma200 ?? safeCard.sma200);
  const perf1w = numericOrNull(safeData.perf1w ?? safeCard.perf1w);
  const perf3m = numericOrNull(safeData.perf3m ?? safeCard.perf3m);
  const volume = numericOrNull(safeData.volume ?? safeCard.volume);
  const avgVolume30d = numericOrNull(safeData.avgVolume30d ?? safeCard.avgVolume30d);
  const rows = Array.isArray(safeData.history) ? safeData.history : [];
  const recentRows = rows.slice(0, 5);
  const dist20 = Number.isFinite(price) && Number.isFinite(sma20) && sma20 > 0 ? (price - sma20) / sma20 : null;
  const dist50 = Number.isFinite(price) && Number.isFinite(sma50) && sma50 > 0 ? (price - sma50) / sma50 : null;
  const entryDefined = !!(safeCard.entry || safeChecks.entryDefined || Number.isFinite(plan.entry));
  const stopDefined = !!(safeCard.stop || safeChecks.stopDefined || Number.isFinite(plan.stop)) && Number.isFinite(plan.riskPerShare) && plan.riskPerShare > 0;
  const targetDefined = !!(safeCard.target || safeChecks.targetDefined || Number.isFinite(plan.target)) && Number.isFinite(plan.rr) && plan.rr > 0;

  let trendState = 'weak';
  if((Number.isFinite(price) && Number.isFinite(sma200) && price < sma200) || (Number.isFinite(sma50) && Number.isFinite(sma200) && sma50 < sma200)){
    trendState = 'broken';
  }else if(Number.isFinite(price) && Number.isFinite(sma50) && Number.isFinite(sma200) && price > sma50 && price > sma200 && sma50 > sma200){
    trendState = 'strong';
  }else if(Number.isFinite(price) && Number.isFinite(sma200) && Number.isFinite(sma50) && price > sma200 && sma50 > sma200){
    trendState = 'acceptable';
  }else if(Number.isFinite(price) && Number.isFinite(sma200) && price > sma200){
    trendState = 'weak';
  }
  if(trendState === 'acceptable' && Number.isFinite(perf3m) && perf3m < 2) trendState = 'weak';

  let pullbackZone = 'none';
  if(Number.isFinite(dist20) && dist20 >= -0.03 && dist20 <= 0.02 && (!Number.isFinite(dist50) || Math.abs(dist20) <= Math.abs(dist50))){
    pullbackZone = 'near_20ma';
  }else if(Number.isFinite(dist50) && dist50 >= -0.05 && dist50 <= 0.02){
    pullbackZone = 'near_50ma';
  }else if((evaluationScanType === '20MA' && Number.isFinite(dist20) && dist20 < -0.06) || (evaluationScanType === '50MA' && Number.isFinite(dist50) && dist50 < -0.07) || safeChecks.structureBroken){
    pullbackZone = 'extended';
  }

  let structureState = 'weakening';
  if(safeChecks.structureBroken || trendState === 'broken'){
    structureState = 'broken';
  }else if(safeChecks.trendStrong && (pullbackZone === 'near_20ma' || pullbackZone === 'near_50ma') && Number.isFinite(perf1w) && perf1w > -4){
    structureState = 'intact';
  }else{
    structureState = 'weakening';
  }

  const recentHighs = recentRows.map(row => numericOrNull(row && (row.high ?? row.close))).filter(Number.isFinite);
  const recentLows = recentRows.map(row => numericOrNull(row && (row.low ?? row.close))).filter(Number.isFinite);
  const recentCloses = recentRows.map(row => numericOrNull(row && row.close)).filter(Number.isFinite);
  const reclaimArea = evaluationScanType === '50MA'
    ? Math.max(...[sma50, sma20].filter(Number.isFinite))
    : Math.max(...[sma20, sma50].filter(Number.isFinite));
  const localPivotHigh = recentHighs.length >= 3 ? Math.max(...recentHighs.slice(1, 3)) : null;
  const localPivotLow = recentLows.length >= 3 ? Math.min(...recentLows.slice(1, 3)) : null;
  const reclaimConfirmed = Number.isFinite(price)
    && (
      (Number.isFinite(reclaimArea) && price >= reclaimArea * 0.998)
      || (Number.isFinite(localPivotHigh) && price >= localPivotHigh * 0.998)
    );
  const worseningHighs = recentHighs.length >= 3 && recentHighs[0] < recentHighs[1] && recentHighs[1] < recentHighs[2];
  const worseningCloses = recentCloses.length >= 3 && recentCloses[0] < recentCloses[1] && recentCloses[1] < recentCloses[2];
  const pullbackStoppedWorsening = (recentCloses.length >= 2 && recentCloses[0] >= recentCloses[1] * 0.995)
    || (Number.isFinite(localPivotLow) && Number.isFinite(price) && price >= localPivotLow);
  const strongStructureContext = structureState === 'intact' && trendState !== 'broken';
  const supportiveVolume = safeChecks.volume || (Number.isFinite(volume) && Number.isFinite(avgVolume30d) && volume >= avgVolume30d * 0.95);
  if(structureState !== 'broken' && (trendState === 'weak' || worseningHighs || worseningCloses || (Number.isFinite(perf1w) && perf1w < -2))){
    structureState = 'weak';
  }

  let stabilisationState = 'none';
  if((pullbackZone === 'near_20ma' || pullbackZone === 'near_50ma') && pullbackStoppedWorsening && !worseningCloses && !worseningHighs && reclaimConfirmed){
    stabilisationState = 'clear';
  }else if((pullbackZone === 'near_20ma' || pullbackZone === 'near_50ma') && (pullbackStoppedWorsening || safeChecks.stabilising || (Number.isFinite(perf1w) && perf1w > -1.5))){
    stabilisationState = 'early';
  }

  let bounceState = 'none';
  if(
    strongStructureContext
    && safeChecks.bounce
    && reclaimConfirmed
    && pullbackStoppedWorsening
    && !worseningHighs
    && stabilisationState === 'clear'
    && supportiveVolume
    && Number.isFinite(perf1w) && perf1w >= 2
  ){
    bounceState = 'confirmed';
  }else if(
    (safeChecks.bounce || stabilisationState === 'early' || (Number.isFinite(perf1w) && perf1w >= 0))
    && !safeChecks.structureBroken
  ){
    bounceState = 'attempt';
  }

  let volumeState = 'normal';
  if(safeChecks.volume && bounceState !== 'none'){
    volumeState = 'supportive';
  }else if(Number.isFinite(volume) && Number.isFinite(avgVolume30d) && avgVolume30d > 0){
    if(volume >= avgVolume30d * 1.1 && bounceState !== 'none') volumeState = 'supportive';
    else if(volume < avgVolume30d * 0.8) volumeState = 'weak';
  }

  return {
    trend_state:trendState,
    pullback_zone:pullbackZone,
    structure_state:structureState,
    stabilisation_state:stabilisationState,
    bounce_state:bounceState,
    volume_state:volumeState,
    scan_type:scanType,
    evaluation_scan_type:evaluationScanType,
    setup_type_overlap_detected:setupTypeDecision.overlapDetected ? 'yes' : 'no',
    setup_type_reason:setupTypeDecision.reason,
    imported_scan_type:setupTypeDecision.importedScanType || 'unknown',
    global_setup_type:setupTypeDecision.globalSetupType || 'unknown',
    entry_defined:entryDefined ? 'yes' : 'no',
    stop_defined:stopDefined ? 'yes' : 'no',
    target_defined:targetDefined ? 'yes' : 'no'
  };
}

function buildAnalysisPayload(card){
  const safeCard = normalizeCard(card);
  const marketData = safeCard.marketData || safeCard;
  const baseChecks = buildScannerChecks(marketData);
  const scanType = resolveScanType(safeCard, marketData, mergeDerivedChecks(safeCard.checks || {}, baseChecks));
  const tradePlan = deriveTradePlan(marketData, scanTypeForEvaluation(scanType));
  const derivedStates = deriveSetupStates(safeCard, marketData, safeCard.checks || baseChecks, tradePlan);
  return {
    ticker:safeCard.ticker,
    marketStatus:state.marketStatus,
    scanType:derivedStates.scan_type,
    trendState:derivedStates.trend_state,
    pullbackZone:derivedStates.pullback_zone,
    structureState:derivedStates.structure_state,
    stabilisationState:derivedStates.stabilisation_state,
    bounceState:derivedStates.bounce_state,
    volumeState:derivedStates.volume_state,
    entryDefined:derivedStates.entry_defined,
    stopDefined:derivedStates.stop_defined,
    targetDefined:derivedStates.target_defined,
    derivedStates,
    checklist:checklistIds.reduce((out, id) => { out[id] = !!safeCard.checks[id]; return out; }, {}),
    checklistLabels,
    notes:safeCard.notes || '',
    accountSize:state.accountSize,
    maxRisk:state.userRiskPerTrade || currentMaxLoss(),
    chartAttached:!!(safeCard.chartRef && safeCard.chartRef.dataUrl),
    chartFileName:safeCard.chartRef ? safeCard.chartRef.name : '',
    chartMatchStatus:'unclear',
    chartMatchWarning:'',
    entry:safeCard.entry || '',
    stop:safeCard.stop || '',
    target:safeCard.target || '',
    marketData:safeCard.marketData ? {
      price:safeCard.price,
      sma20:safeCard.sma20,
      sma50:safeCard.sma50,
      sma200:safeCard.sma200,
      volume:safeCard.volume,
      avgVolume30d:safeCard.avgVolume30d,
      perf1w:safeCard.perf1w,
      perf1m:safeCard.perf1m,
      perf3m:safeCard.perf3m,
      perf6m:safeCard.perf6m,
      perfYtd:safeCard.perfYtd,
      rsi14:safeCard.rsi14,
      companyName:safeCard.companyName,
      exchange:safeCard.exchange
    } : null
  };
}

function buildTickerPrompt(card){
  const payload = buildAnalysisPayload(card);
  return buildPromptBody(payload).join('\n');
}

function normalizeImportedStatus(value, options = {}){
  const v = String(value || '').trim().toLowerCase();
  if(!v) return options.preserveEmpty ? '' : 'Watch';
  if(v === 'ready') return 'Ready';
  if(v === 'entry') return 'Entry';
  if(v === 'near pullback' || v === 'near setup') return 'Near Setup';
  if(v === 'near entry') return 'Near Entry';
  if(v === 'avoid') return 'Avoid';
  return 'Watch';
}

function normalizeAnalysisVerdict(value){
  const v = String(value || '').trim().toLowerCase();
  if(v === 'entry') return 'Entry';
  if(v === 'near entry') return 'Near Entry';
  if(v === 'avoid') return 'Avoid';
  return 'Watch';
}

function normalizeAnalysisResponse(raw){
  if(!raw || typeof raw !== 'object') return null;
  return {
    setup_type:String(raw.setup_type || '').trim(),
    verdict:normalizeAnalysisVerdict(raw.verdict),
    plain_english_chart_read:String(raw.plain_english_chart_read || raw.chart_read || '').trim(),
    chart_match_status:String(raw.chart_match_status || '').trim().toLowerCase(),
    chart_match_warning:String(raw.chart_match_warning || '').trim(),
    entry:String(raw.entry || raw.proposed_entry || '').trim(),
    stop:String(raw.stop || raw.proposed_stop || '').trim(),
    first_target:String(raw.first_target || raw.target || raw.proposed_first_target || '').trim(),
    risk_per_share:String(raw.risk_per_share || '').trim(),
    position_size:String(raw.position_size || '').trim(),
    reward_risk:raw.reward_risk == null || raw.reward_risk === '' ? null : String(raw.reward_risk).trim(),
    quality_score:Number.isFinite(Number(raw.quality_score)) ? Math.max(1, Math.min(10, Number(raw.quality_score))) : null,
    confidence_score:Number.isFinite(Number(raw.confidence_score)) ? Math.max(1, Math.min(100, Number(raw.confidence_score))) : null,
    key_reasons:Array.isArray(raw.key_reasons) ? raw.key_reasons.map(item => String(item).trim()).filter(Boolean) : [],
    risks:Array.isArray(raw.risks) ? raw.risks.map(item => String(item).trim()).filter(Boolean) : [],
    final_verdict:String(raw.final_verdict || raw.summary || '').trim()
  };
}

function isMissingAnalysisValue(value){
  const text = String(value == null ? '' : value).trim().toLowerCase();
  return !text || ['na', 'n/a', 'not given', 'null', 'undefined', 'none', '-'].includes(text);
}

function normalizeAnalysisPlanField(value){
  return isMissingAnalysisValue(value) ? '' : String(value).trim();
}

function resolvePullbackInterpretation({pullbackZone = '', pullbackStatus = '', chartRead = '', keyReasons = [], risks = []} = {}){
  const normalizedZone = String(pullbackZone || pullbackStatus || '').trim().toLowerCase();
  const prose = [
    chartRead,
    ...(Array.isArray(keyReasons) ? keyReasons : []),
    ...(Array.isArray(risks) ? risks : [])
  ].map(part => String(part || '').trim().toLowerCase()).filter(Boolean).join(' | ');
  const mentionsPullback = /showing a pullback|in a pullback|pullback depth|deeper than preferred|attempt at a bounce|bounce attempt|stabilis|not at preferred pullback level|off level|not at support|reclaim candidate|deeper pullback/.test(prose);
  const near20Text = /near[_\s-]?20ma|near the 20ma|20 ma pullback|20ma pullback|shallow pullback/.test(prose);
  const near50Text = /near[_\s-]?50ma|near the 50ma|50 ma pullback|50ma pullback|50ma reclaim/.test(prose);
  const extendedText = /extended|overextended|too extended/.test(prose);
  const offLevelText = /not at preferred pullback level|off[\s-]?level|not at support|away from support|not near (the )?(20|50)/.test(prose);
  const deepText = /deeper than preferred|deep pullback|deeper pullback|needs a deeper reclaim/.test(prose);

  let pullbackState = 'none';
  if(normalizedZone === 'near_20ma' || near20Text){
    pullbackState = 'near_20ma';
  }else if(normalizedZone === 'near_50ma' || near50Text){
    pullbackState = 'near_50ma';
  }else if(normalizedZone === 'extended' || extendedText){
    pullbackState = 'extended';
  }else if(offLevelText){
    pullbackState = 'off_level';
  }else if(deepText){
    pullbackState = 'deep';
  }else if(mentionsPullback){
    pullbackState = 'shallow';
  }

  let pullbackQuality = 'invalid';
  if(['near_20ma','near_50ma'].includes(pullbackState)) pullbackQuality = pullbackState === 'near_20ma' ? 'ideal' : 'acceptable';
  else if(pullbackState === 'shallow') pullbackQuality = 'acceptable';
  else if(['deep','off_level'].includes(pullbackState)) pullbackQuality = 'weak';

  const compatibilityZone = ['near_20ma','near_50ma','extended'].includes(pullbackState)
    ? pullbackState
    : normalizedZone;

  return {
    pullbackState,
    pullbackQuality,
    pullbackZone:compatibilityZone || 'none'
  };
}

function pullbackStateLabel(pullbackState){
  const state = String(pullbackState || '').trim().toLowerCase();
  if(state === 'near_20ma') return 'Near 20MA';
  if(state === 'near_50ma') return 'Near 50MA';
  if(state === 'shallow') return 'Shallow';
  if(state === 'deep') return 'Deep';
  if(state === 'extended') return 'Extended';
  if(state === 'off_level') return 'Off level';
  return 'None';
}

function normalizeAnalysisReasons(rawReasons, planValid, rewardRisk, previousState, rawChartRead){
  const reasons = [];
  const previousAnalysis = previousState && previousState.analysis && typeof previousState.analysis === 'object' ? previousState.analysis : null;
  if(previousAnalysis && previousAnalysis.trend_status) reasons.push(`Trend: ${previousAnalysis.trend_status}`);
  if(previousAnalysis){
    const pullback = resolvePullbackInterpretation({
      pullbackZone:previousAnalysis.pullback_zone,
      pullbackStatus:previousAnalysis.pullback_status,
      chartRead:rawChartRead,
      keyReasons:rawReasons,
      risks:previousAnalysis.risks
    });
    if(pullback.pullbackState && pullback.pullbackState !== 'none'){
      reasons.push(`Pullback: ${pullbackStateLabel(pullback.pullbackState)}`);
    }
  }
  if(rawChartRead) reasons.push(rawChartRead);
  if(planValid && rewardRisk.valid && Number.isFinite(rewardRisk.rrRatio)){
    reasons.push(`Planned reward:risk is ${rewardRisk.rrRatio.toFixed(2)}R.`);
  }
  const safeRawReasons = Array.isArray(rawReasons) ? rawReasons.map(item => String(item || '').trim()).filter(Boolean) : [];
  safeRawReasons.forEach(reason => {
    const lower = reason.toLowerCase();
    if(!planValid && (lower.includes('defined entry') || lower.includes('entry and stop') || lower.includes('reward:risk') || lower.includes('r:r'))) return;
    if(planValid && rewardRisk.valid === false && (lower.includes('reward:risk') || lower.includes('r:r'))) return;
    reasons.push(reason);
  });
  return [...new Set(reasons)].slice(0, 4);
}

function analysisDerivedStates(previousState){
  const analysis = previousState && previousState.analysis && typeof previousState.analysis === 'object'
    ? previousState.analysis
    : {};
  const pullback = resolvePullbackInterpretation({
    pullbackZone:analysis.pullback_zone,
    pullbackStatus:analysis.pullback_status,
    chartRead:analysis.plain_english_chart_read || analysis.chart_read,
    keyReasons:analysis.key_reasons,
    risks:analysis.risks
  });
  return {
    trendState:String(analysis.trend_state || analysis.trend_status || '').trim().toLowerCase(),
    pullbackZone:pullback.pullbackZone,
    pullbackState:pullback.pullbackState,
    pullbackQuality:pullback.pullbackQuality,
    structureState:String(analysis.structure_state || '').trim().toLowerCase(),
    stabilisationState:String(analysis.stabilisation_state || '').trim().toLowerCase(),
    bounceState:String(analysis.bounce_state || '').trim().toLowerCase(),
    volumeState:String(analysis.volume_state || '').trim().toLowerCase()
  };
}

function isHostileMarketStatus(marketStatus){
  return /below 50 ma/i.test(String(marketStatus || ''));
}

function tightenPlaybookVerdict(rawVerdict, derivedStates, marketStatus){
  const verdict = normalizeAnalysisVerdict(rawVerdict);
  const derived = derivedStates || {};
  const hostileMarket = isHostileMarketStatus(marketStatus);
  const trendState = String(derived.trendState || '').toLowerCase();
  const pullbackZone = String(derived.pullbackZone || '').toLowerCase();
  const structureState = String(derived.structureState || '').toLowerCase();
  const stabilisationState = String(derived.stabilisationState || '').toLowerCase();
  const bounceState = String(derived.bounceState || '').toLowerCase();
  const volumeState = String(derived.volumeState || '').toLowerCase();
  const brokenTrend = trendState === 'broken';
  const weakTrend = trendState === 'weak';
  const weakStructure = ['weak','weakening','broken'].includes(structureState);
  const brokenStructure = structureState === 'broken';
  const noBounce = bounceState === 'none';
  const tentativeBounce = bounceState === 'attempt';
  const earlyOnly = stabilisationState === 'early' && bounceState !== 'confirmed';
  const clearStabilisation = stabilisationState === 'clear';
  const weakVolume = volumeState === 'weak';
  const validPullback = ['near_20ma','near_50ma'].includes(pullbackZone);
  const strongConfirmation = bounceState === 'confirmed' || clearStabilisation;
  const constructiveDeveloping = validPullback && !brokenTrend && (bounceState === 'confirmed' || clearStabilisation || stabilisationState === 'early');

  if(brokenTrend || brokenStructure) return 'Avoid';
  if(weakStructure && noBounce && hostileMarket && !constructiveDeveloping) return 'Avoid';
  if(weakStructure && noBounce && (weakVolume || weakTrend) && !constructiveDeveloping) return 'Avoid';
  if(!validPullback && verdict !== 'Avoid') return 'Watch';

  if(verdict === 'Entry'){
    if(noBounce && !clearStabilisation) return 'Watch';
    if(earlyOnly) return 'Watch';
    if(tentativeBounce && hostileMarket) return 'Watch';
    if(hostileMarket && (!strongConfirmation || weakVolume || weakTrend)) return 'Watch';
    return 'Entry';
  }

  if(verdict === 'Near Entry'){
    if(weakStructure && noBounce) return hostileMarket && !constructiveDeveloping ? 'Avoid' : 'Watch';
    if(earlyOnly && weakVolume) return 'Watch';
    if(hostileMarket && (noBounce || earlyOnly || weakTrend || tentativeBounce)) return 'Watch';
    if(noBounce && !clearStabilisation) return 'Watch';
    return 'Near Entry';
  }

  if(verdict === 'Watch'){
    if(weakStructure && noBounce && hostileMarket && !constructiveDeveloping) return 'Avoid';
    if(weakStructure && noBounce && weakVolume && !constructiveDeveloping) return 'Avoid';
  }

  return verdict;
}

function evaluateWarningState(record, analysis = null, derivedStates = null){
  const item = record && typeof record === 'object' ? record : {};
  return warningStateFromInputs(item, analysis, derivedStates);
}

function fallbackPlanProposalForCard(cardLike){
  const legacyCard = normalizeCard(cardLike || {});
  const estimate = scannerEstimateForCard(legacyCard);
  if(!(estimate && [estimate.entry, estimate.stop, estimate.target].some(Number.isFinite))) return null;
  return {
    entry:Number.isFinite(estimate.entry) ? String(Number(estimate.entry.toFixed(2))) : '',
    stop:Number.isFinite(estimate.stop) ? String(Number(estimate.stop.toFixed(2))) : '',
    first_target:Number.isFinite(estimate.target) ? String(Number(estimate.target.toFixed(2))) : ''
  };
}

function effectivePlanForRecord(record, options = {}){
  const allowScannerFallback = options.allowScannerFallback === true;
  const item = record && typeof record === 'object' ? record : {};
  const manualReview = item.review && item.review.manualReview && typeof item.review.manualReview === 'object'
    ? item.review.manualReview
    : null;
  const hasCanonicalPlan = [item.plan.entry, item.plan.stop, item.plan.firstTarget].some(Number.isFinite);
  if(hasCanonicalPlan){
    return {
      entry:Number.isFinite(item.plan.entry) ? String(Number(item.plan.entry.toFixed(2))) : '',
      stop:Number.isFinite(item.plan.stop) ? String(Number(item.plan.stop.toFixed(2))) : '',
      firstTarget:Number.isFinite(item.plan.firstTarget) ? String(Number(item.plan.firstTarget.toFixed(2))) : '',
      source:String(item.plan.source || '')
    };
  }
  if(manualReview && (manualReview.entry || manualReview.stop || manualReview.target)){
    return {
      entry:String(manualReview.entry || ''),
      stop:String(manualReview.stop || ''),
      firstTarget:String(manualReview.target || ''),
      source:'manual'
    };
  }
  const analysisState = getReviewAnalysisState(item);
  const analysis = analysisState.normalizedAnalysis;
  if(analysis && analysis.plan_metrics_valid && (analysis.entry || analysis.stop || analysis.first_target)){
    return {
      entry:String(analysis.entry || ''),
      stop:String(analysis.stop || ''),
      firstTarget:String(analysis.first_target || ''),
      source:'ai'
    };
  }
  const fallbackPlan = allowScannerFallback
    ? fallbackPlanProposalForCard({
      ticker:item.ticker,
      status:resolverSeedVerdictForRecord(item),
      chartVerdict:resolverSeedVerdictForRecord(item),
      riskStatus:(item.plan && item.plan.riskStatus) || (item.scan && item.scan.riskStatus) || 'plan_missing',
      score:Number.isFinite(numericOrNull(item.scan && item.scan.score)) ? Number(item.scan.score) : 0,
      summary:(item.scan && item.scan.summary) || ((item.scan && item.scan.reasons && item.scan.reasons[0]) || ''),
      checks:cloneData((item.scan && item.scan.flags && item.scan.flags.checks) || {}, {}),
      marketData:cloneData(item.marketData || {}, {})
    })
    : null;
  if(fallbackPlan){
    return {
      entry:String(fallbackPlan.entry || ''),
      stop:String(fallbackPlan.stop || ''),
      firstTarget:String(fallbackPlan.first_target || ''),
      source:'ai'
    };
  }
  return {
    entry:'',
    stop:'',
    firstTarget:'',
    source:String(item.plan.source || '')
  };
}

function recordPlanHasConcreteValues(record){
  const item = record && typeof record === 'object' ? record : {};
  return Number.isFinite(numericOrNull(item.plan && item.plan.entry))
    && Number.isFinite(numericOrNull(item.plan && item.plan.stop))
    && Number.isFinite(numericOrNull(item.plan && item.plan.firstTarget));
}

function ensureCanonicalPlanForRecord(record, options = {}){
  if(!(record && typeof record === 'object')) return false;
  const gated = applyGlobalVerdictGates(record, {source:'review'});
  if(!gated.globalVerdict.allow_plan) return gated.changed;
  if(recordPlanHasConcreteValues(record)) return false;
  const derivedPlan = effectivePlanForRecord(record, {allowScannerFallback:options.allowScannerFallback === true});
  const hasDerivedValues = [derivedPlan.entry, derivedPlan.stop, derivedPlan.firstTarget].every(value => Number.isFinite(numericOrNull(value)));
  if(!hasDerivedValues) return false;
  record.watchlist = record.watchlist && typeof record.watchlist === 'object' ? record.watchlist : {};
  record.watchlist.debug = record.watchlist.debug && typeof record.watchlist.debug === 'object' ? record.watchlist.debug : {};
  record.watchlist.debug.planSnapshotMismatch = 'Plan source mismatch: UI vs record.plan';
  applyPlanCandidateToRecord(record, {
    entry:derivedPlan.entry,
    stop:derivedPlan.stop,
    firstTarget:derivedPlan.firstTarget
  }, {
    source:String(derivedPlan.source || options.source || 'review'),
    updatedAt:new Date().toISOString()
  });
  return true;
}

// Normalize server AI output into one render-safe object so cards never mix stale
// planner/scanner fields with a fresh analysis response.
function normalizeAnalysisResult(rawAnalysis, existingTickerState){
  const previousState = normalizeCard(existingTickerState || {});
  const parsed = normalizeAnalysisResponse(rawAnalysis) || {
    setup_type:'',
    verdict:'Watch',
    plain_english_chart_read:'',
    entry:'',
    stop:'',
    first_target:'',
    risk_per_share:'',
    position_size:'',
    reward_risk:null,
    quality_score:null,
    confidence_score:null,
    key_reasons:[],
    risks:[],
    final_verdict:''
  };
  const fallbackProposal = fallbackPlanProposalForCard(previousState);
  const entry = normalizeAnalysisPlanField(parsed.entry || (fallbackProposal && fallbackProposal.entry) || '');
  const stop = normalizeAnalysisPlanField(parsed.stop || (fallbackProposal && fallbackProposal.stop) || '');
  const firstTarget = normalizeAnalysisPlanField(parsed.first_target || (fallbackProposal && fallbackProposal.first_target) || '');
  const hasPlanFields = !!(entry || stop || firstTarget);
  const numericEntry = numericOrNull(entry);
  const numericStop = numericOrNull(stop);
  const numericFirstTarget = numericOrNull(firstTarget);
  const rewardRisk = evaluateRewardRisk(numericEntry, numericStop, numericFirstTarget);
  const planValid = rewardRisk.valid;
  const derivedStates = analysisDerivedStates(previousState);
  const marketStatus = previousState.marketStatus || state.marketStatus || '';
  const tightenedVerdict = tightenPlaybookVerdict(parsed.final_verdict || parsed.verdict, derivedStates, marketStatus);
  const riskFit = planValid ? evaluateRiskFit({entry:numericEntry, stop:numericStop, ...currentRiskSettings()}) : {
    max_loss:currentMaxLoss(),
    risk_per_share:null,
    position_size:0,
    risk_status:hasPlanFields ? 'invalid_plan' : 'plan_missing'
  };
  const keyReasons = normalizeAnalysisReasons(parsed.key_reasons, hasPlanFields, rewardRisk, previousState, parsed.plain_english_chart_read);
  const mismatchStatus = ['match','mismatch','unclear'].includes(parsed.chart_match_status) ? parsed.chart_match_status : '';
  const mismatchWarning = String(parsed.chart_match_warning || '').trim();
  const safeRisks = (Array.isArray(parsed.risks) ? parsed.risks : []).map(item => String(item || '').trim()).filter(Boolean).filter(item => {
    const lower = item.toLowerCase();
    return hasPlanFields || !(lower.includes('entry') || lower.includes('stop') || lower.includes('reward:risk') || lower.includes('r:r'));
  });
  if(mismatchStatus === 'mismatch' && mismatchWarning && !safeRisks.includes(mismatchWarning)) safeRisks.unshift(mismatchWarning);
  if(mismatchStatus === 'unclear' && mismatchWarning && !safeRisks.includes(mismatchWarning)) safeRisks.unshift(mismatchWarning);
  const inferredRisks = safeRisks.length ? [] : inferRisksFromAnalysisText(parsed.plain_english_chart_read, keyReasons);
  const finalRisks = safeRisks.length ? safeRisks : inferredRisks;
  return {
    setup_type:parsed.setup_type || previousState.setupType || '',
    verdict:parsed.verdict,
    plain_english_chart_read:parsed.plain_english_chart_read,
    chart_match_status:mismatchStatus,
    chart_match_warning:mismatchWarning,
    entry,
    stop,
    first_target:firstTarget,
    entryDefined:!!entry,
    stopDefined:!!stop,
    targetDefined:!!firstTarget,
    risk_per_share:planValid && Number.isFinite(rewardRisk.riskPerShare) ? rewardRisk.riskPerShare.toFixed(2) : '',
    reward_per_share:planValid && Number.isFinite(rewardRisk.rewardPerShare) ? rewardRisk.rewardPerShare.toFixed(2) : '',
    reward_risk:planValid && Number.isFinite(rewardRisk.rrRatio) ? rewardRisk.rrRatio.toFixed(2) : '',
    rr_state:planValid ? rrBandForValue(rewardRisk.rrRatio) : '',
    rr_badge:planValid ? rrStateLabel(rewardRisk.rrRatio) : '',
    position_size:planValid && Number.isFinite(riskFit.position_size) && riskFit.position_size > 0 ? String(riskFit.position_size) : '',
    risk_status:planValid ? riskFit.risk_status : (hasPlanFields ? 'invalid_plan' : 'plan_missing'),
    max_loss:planValid && Number.isFinite(riskFit.max_loss) ? riskFit.max_loss.toFixed(2) : '',
    quality_score:parsed.quality_score,
    confidence_score:parsed.confidence_score,
    key_reasons:keyReasons,
    risks:finalRisks,
    final_verdict:tightenedVerdict,
    warning_state:evaluateWarningState({
      ...existingTickerState,
      meta:{
        ...(existingTickerState && existingTickerState.meta ? existingTickerState.meta : {}),
        marketStatus
      },
      plan:{
        ...(existingTickerState && existingTickerState.plan ? existingTickerState.plan : {}),
        plannedRR:planValid ? rewardRisk.rrRatio : null
      }
    }, {final_verdict:tightenedVerdict, verdict:parsed.verdict}, derivedStates),
    plan_metrics_valid:planValid,
    plan_fields_present:hasPlanFields,
    estimated_reward_risk:previousState.analysis && previousState.analysis.reward_risk ? String(previousState.analysis.reward_risk) : ''
  };
}

function buildAnalysisErrorMessage(status, data, fallback){
  const message = data && typeof data.error === 'string' ? data.error : fallback;
  if(status === 400) return message || 'The analysis request was invalid.';
  if(status === 401 || status === 403) return 'The AI endpoint rejected the request. Check the server-side configuration.';
  if(status === 404) return 'The AI endpoint URL is not reachable from this frontend.';
  if(status === 429) return 'The AI service is rate limited right now. Retry in a moment.';
  if(status >= 500) return message || 'The AI endpoint failed while analysing this setup.';
  return message || 'Analysis request failed.';
}

function formatApproxBytes(bytes){
  if(bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.ceil(bytes / 1024)} KB`;
}

function tradingViewSymbolForTicker(ticker){
  const symbol = normalizeTicker(ticker);
  if(!symbol) return '';
  const isValidTvSymbol = value => /^[A-Z0-9_]+:[A-Z0-9.-]+$/.test(String(value || '').trim().toUpperCase());
  const record = getTickerRecord(symbol);
  if(record && record.meta.exchange && isValidTvSymbol(record.meta.tradingViewSymbol)) return record.meta.tradingViewSymbol;
  const meta = getStoredTickerMeta(symbol);
  if(meta && meta.exchange && isValidTvSymbol(meta.tradingViewSymbol)) return meta.tradingViewSymbol;
  if(tradingViewConfig.symbolOverrides[symbol]) return tradingViewConfig.symbolOverrides[symbol];
  for(const [suffix, exchange] of Object.entries(tradingViewConfig.suffixMap)){
    if(symbol.endsWith(suffix)){
      const baseSymbol = symbol.slice(0, -suffix.length) || symbol;
      return `${exchange}:${baseSymbol}`;
    }
  }
  return symbol;
}

function openTickerChart(ticker){
  const tvSymbol = tradingViewSymbolForTicker(ticker);
  if(!tvSymbol) return;
  const url = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol)}`;
  try{
    window.open(url, '_blank', 'noopener');
  }catch(error){}
}

async function analyseSetup(ticker){
  if(uiState.loadingTicker) return;
  setScannerCardClickTrace(ticker, 'analyseSetup.enter', 'starting');
  syncStateFromDom();
  const record = upsertTickerRecord(ticker);
  record.review.cardOpen = true;
  let card = tickerRecordToLegacyCard(record);
  const previousTickerState = normalizeCard(card);
  const notesEl = $('reviewNotes') || $(`notes-${ticker}`);
  if(notesEl){
    record.review.notes = notesEl.value;
    card.notes = notesEl.value;
  }
  card.lastPrompt = buildTickerPrompt(card);
  setReviewAnalysisState(record, {prompt:card.lastPrompt});
  card.lastError = '';
  card.lastResponse = '';
  card.lastAnalysis = null;
  setReviewAnalysisState(record, {raw:'', normalized:null, error:''});
  uiState.loadingTicker = ticker;
  setScannerCardClickTrace(ticker, 'analyseSetup.loading', 'loadingTicker_set');
  uiState.responseOpen[ticker] = true;
  renderCards();
  const endpoints = analysisEndpoints();
  if(!endpoints.length){
    card.lastError = 'AI analysis failed: add an AI endpoint URL first.';
    setReviewAnalysisState(record, {
      raw:'',
      normalized:null,
      error:card.lastError,
      prompt:card.lastPrompt,
      reviewedAt:new Date().toISOString()
    });
    uiState.loadingTicker = '';
    setScannerCardClickTrace(ticker, 'analyseSetup.no_endpoint', 'loadingTicker_cleared');
    renderCards();
    return;
  }
  let lastFailureData = null;
  try{
    let response = null;
    let data = {};
    let lastError = 'Analysis request failed.';
    for(const endpoint of endpoints){
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), ANALYSIS_TIMEOUT_MS);
      try{
        response = await fetch(endpoint, {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          signal:controller.signal,
          body:JSON.stringify({
            payload:buildAnalysisPayload(card),
            prompt:card.lastPrompt,
            chartRef:card.chartRef ? {name:card.chartRef.name, type:card.chartRef.type, dataUrl:card.chartRef.dataUrl} : null
          })
        });
        data = await response.json().catch(() => ({}));
        console.log('ANALYSIS_API_RESPONSE', { endpoint, ok:response.ok, status:response.status, data });
        if(!response.ok) throw new Error(buildAnalysisErrorMessage(response.status, data, 'Analysis request failed.'));
        lastError = '';
        lastFailureData = null;
        break;
      }catch(err){
        lastFailureData = data && typeof data === 'object' ? data : null;
        lastError = err && err.name === 'AbortError'
          ? 'The analysis request timed out. Retry the setup.'
          : String(err.message || 'Analysis request failed.');
        response = null;
      }finally{
        clearTimeout(timer);
      }
    }
    if(!response) throw new Error(lastError);
    if(!data || !data.analysis || typeof data.analysis !== 'object'){
      throw new Error('The AI endpoint returned no analysis payload.');
    }
    setScannerCardClickTrace(ticker, 'analyseSetup.success', 'analysis_received');
    console.log('RAW_ANALYSIS_RESULT', data.analysis || null);
    console.log('PREVIOUS_TICKER_STATE', previousTickerState);
    const analysis = normalizeAnalysisResult(data.analysis, previousTickerState);
    console.log('NORMALIZED_ANALYSIS_OBJECT', analysis);
    card.lastResponse = JSON.stringify(data.analysis || {}, null, 2);
    card.lastAnalysis = analysis;
    card.lastError = '';
    card.marketStatus = state.marketStatus;
    card.updatedAt = new Date().toISOString();
    if(analysis){
      card.entry = analysis.entry || '';
      card.stop = analysis.stop || '';
      card.target = analysis.first_target || '';
    }
    setReviewAnalysisState(record, {
      prompt:card.lastPrompt,
      raw:card.lastResponse,
      normalized:analysis,
      error:'',
      reviewedAt:card.updatedAt
    });
    record.review.cardOpen = true;
    record.meta.marketStatus = state.marketStatus;
    record.meta.updatedAt = card.updatedAt;
    const existingPlanPresent = [record.plan.entry, record.plan.stop, record.plan.firstTarget].some(Number.isFinite);
    const proposedPlan = analysis && analysis.plan_fields_present
      ? {
        entry:analysis.entry,
        stop:analysis.stop,
        firstTarget:analysis.first_target
      }
      : (!existingPlanPresent ? (() => {
        const fallbackPlan = fallbackPlanProposalForCard(card);
        return fallbackPlan ? {
          entry:fallbackPlan.entry,
          stop:fallbackPlan.stop,
          firstTarget:fallbackPlan.first_target
        } : null;
      })() : null);
    if(proposedPlan){
      applyPlanCandidateToRecord(record, proposedPlan, {
        source:'analysis',
        updatedAt:card.updatedAt,
        lastPlannedAt:card.updatedAt
      });
      card.entry = String(proposedPlan.entry || '');
      card.stop = String(proposedPlan.stop || '');
      card.target = String(proposedPlan.firstTarget || '');
    }
    refreshLifecycleStage(record, 'reviewed', REVIEW_EXPIRY_TRADING_DAYS, 'Ticker opened in Setup Review.', 'review');
    console.log('ANALYSIS_STATE_WRITE', {
      ticker:record.ticker,
      apiResponse:data,
      lastPrompt:record.review.analysisState.prompt,
      aiAnalysisRaw:record.review.analysisState.raw,
      normalizedAnalysis:record.review.analysisState.normalized,
      lastError:record.review.analysisState.error,
      lastReviewedAt:record.review.analysisState.reviewedAt
    });
    runWatchlistLifecycleEvaluation({
      source:'analyse_setup',
      tickers:[record.ticker],
      persist:false,
      render:false,
      force:true
    });
    commitTickerState();
    if(($('selectedTicker') && normalizeTicker($('selectedTicker').value) === card.ticker) || !normalizeTicker(($('selectedTicker') && $('selectedTicker').value) || '')){
      syncPlannerFromTicker(card.ticker);
    }
  }catch(err){
    setScannerCardClickTrace(ticker, 'analyseSetup.error', err && err.message ? err.message : 'unknown_error');
    const baseMessage = err && err.name === 'AbortError'
      ? 'The analysis request timed out. Retry the setup.'
      : String(err.message || 'Analysis request failed.');
    card.lastError = isAnalysisErrorMessage(baseMessage) ? baseMessage : `AI analysis failed: ${baseMessage}`;
    card.lastResponse = lastFailureData && typeof lastFailureData.raw === 'string' && lastFailureData.raw.trim()
      ? lastFailureData.raw.trim()
      : '';
    card.lastAnalysis = null;
    setReviewAnalysisState(record, {
      raw:card.lastResponse,
      normalized:null,
      error:card.lastError,
      prompt:card.lastPrompt,
      reviewedAt:new Date().toISOString()
    });
    record.review.cardOpen = true;
    record.meta.updatedAt = record.review.analysisState.reviewedAt;
    refreshLifecycleStage(record, 'reviewed', REVIEW_EXPIRY_TRADING_DAYS, 'Ticker opened in Setup Review.', 'review');
    console.log('ANALYSIS_STATE_WRITE', {
      ticker:record.ticker,
      lastPrompt:record.review.analysisState.prompt,
      aiAnalysisRaw:record.review.analysisState.raw,
      normalizedAnalysis:record.review.analysisState.normalized,
      lastError:record.review.analysisState.error,
      lastReviewedAt:record.review.analysisState.reviewedAt
    });
    runWatchlistLifecycleEvaluation({
      source:'analyse_setup',
      tickers:[record.ticker],
      persist:false,
      render:false,
      force:true
    });
    commitTickerState();
  }finally{
    if(activeReviewTicker() === ticker) uiState.activeReviewVerdictOverride = '';
    uiState.loadingTicker = '';
    setScannerCardClickTrace(ticker, 'analyseSetup.finally', 'loadingTicker_cleared');
    renderWatchlist();
    renderFocusQueue();
    renderCards();
  }
}

function renderAnalysisPanel(card){
  if(!card.lastResponse) return '<div class="tiny">No AI response saved yet.</div>';
  if(card.lastAnalysis){
    const analysis = normalizeAnalysisResult(card.lastAnalysis, card);
    const chartMismatch = analysis.chart_match_status === 'mismatch';
    const chartUnclear = analysis.chart_match_status === 'unclear';
    const chartWarning = analysis.chart_match_warning || '';
    const staleAnalysis = isAnalysisStaleForRecord(card);
    const reasons = analysis.key_reasons.length ? analysis.key_reasons.map(item => `<li>${escapeHtml(item)}</li>`).join('') : '<li>No key reasons returned.</li>';
    const risks = analysis.risks.length ? analysis.risks.map(item => `<li>${escapeHtml(item)}</li>`).join('') : '<li>No risks returned.</li>';
    const confidence = Number.isFinite(analysis.confidence_score) ? `${analysis.confidence_score}/100` : 'n/a';
    const renderModel = {
      verdict:analysis.verdict,
      setup_type:analysis.setup_type || 'Not given',
      entry:analysis.entry || 'Not given',
      stop:analysis.stop || 'Not given',
      first_target:analysis.first_target || 'Not given',
      key_reasons:analysis.key_reasons,
      risks:analysis.risks
    };
    const showPlanNumbers = savedAiPlanNumbersAllowed(card);
    const planMarkup = showPlanNumbers
      ? `<div class="analysisplanmini"><div class="tiny"><strong>Plan:</strong> ${escapeHtml(renderModel.entry)} / ${escapeHtml(renderModel.stop)} / ${escapeHtml(renderModel.first_target)}</div></div>`
      : '<div class="analysisplanmini"><div class="tiny"><strong>Plan:</strong> No actionable plan yet.</div><div class="tiny">Bounce is too weak to price cleanly.</div><div class="tiny">Waiting for a reclaim and stronger close.</div></div>';
    console.log('FINAL_RENDERED_ANALYSIS_CARD', renderModel);
    return `<div class="responsegrid">${staleAnalysis ? '<div class="mutebox warntext"><strong>Saved analysis from before invalidation</strong></div>' : ''}${chartMismatch ? `<div class="mutebox badtext"><strong>Chart mismatch warning:</strong> ${escapeHtml(chartWarning || 'The uploaded chart may not match this ticker. Re-check the screenshot before acting.')}</div>` : ''}${!chartMismatch && chartUnclear ? `<div class="mutebox warntext"><strong>Chart check warning:</strong> ${escapeHtml(chartWarning || 'The AI could not confidently verify that this chart matches the ticker.')}</div>` : ''}<div class="tiny">AI confidence: ${escapeHtml(confidence)}${Number.isFinite(analysis.quality_score) ? ` | AI raw score: ${escapeHtml(`${analysis.quality_score}/10`)}` : ''}</div><div><strong>Setup Type</strong><div class="tiny">${escapeHtml(renderModel.setup_type)}</div></div><div><strong>Chart Read</strong><div class="tiny">${escapeHtml(analysis.plain_english_chart_read || 'No chart read returned.')}</div></div>${planMarkup}<div><strong>Key Reasons</strong><ul class="tiny">${reasons}</ul></div><div><strong>Risks</strong><ul class="tiny">${risks}</ul></div><details><summary>Raw Response</summary><div class="mutebox">${escapeHtml(card.lastResponse)}</div></details></div>`;
  }
  return `<div class="mutebox">${escapeHtml(card.lastResponse)}</div>`;
}

function analysisAdvisoryContextForRecord(record, analysis){
  const item = normalizeTickerRecord(record);
  const finalReviewVerdict = normalizeAnalysisVerdict(reviewHeaderVerdictForRecord(item) || displayStageForRecord(item) || '');
  const savedAiVerdict = normalizeAnalysisVerdict(
    analysis && (analysis.final_verdict || analysis.verdict) || ''
  );
  const finalRank = verdictRank(finalReviewVerdict);
  const aiRank = verdictRank(savedAiVerdict);
  const reviewMoreConservative = finalRank != null && aiRank != null && finalRank < aiRank;
  return {
    finalReviewVerdict,
    savedAiVerdict,
    reviewMoreConservative,
    advisoryNote:'This is the saved AI read, not the final app decision.'
  };
}

function savedAiPlanNumbersAllowed(record){
  const item = normalizeTickerRecord(record || {});
  const derivedStates = analysisDerivedStatesFromRecord(item);
  const visualState = resolveVisualState(item, 'review', {derivedStates});
  const planUI = resolvePlanVisibility({
    state:visualState.finalVerdict || visualState.final_verdict,
    bounce_state:derivedStates.bounceState || (item.setup && item.setup.bounceState),
    structure:derivedStates.structureState || (item.setup && item.setup.structureState)
  });
  const verdict = normalizeGlobalVerdictKey(visualState.finalVerdict || visualState.final_verdict);
  return planUI.showPlan && ['entry','near_entry'].includes(verdict);
}

function renderAnalysisPanelFromRecord(record){
  const item = normalizeTickerRecord(record);
  const analysisState = getReviewAnalysisState(item);
  console.log('ANALYSIS_PANEL_RENDER_FIELDS', {
    ticker:item.ticker,
    analysisResult:{
      aiAnalysisRawLength:analysisState.rawAnalysis.length,
      normalizedAnalysisExists:!!analysisState.normalizedAnalysis,
      lastError:analysisState.error,
      lastReviewedAt:item.review.lastReviewedAt
    },
    promptPreview:{
      promptLength:analysisState.promptPreview.length,
      lastPrompt:item.review.lastPrompt
    }
  });
  if(analysisState.error){
    return `<div class="responsegrid"><div class="mutebox badtext">${escapeHtml(analysisState.error)}</div>${analysisState.rawAnalysis ? `<details class="compact-details"><summary>Raw Response</summary><div class="mutebox scrollbox">${escapeHtml(analysisState.rawAnalysis)}</div></details>` : ''}</div>`;
  }
  if(analysisState.normalizedAnalysis){
    const analysis = analysisState.normalizedAnalysis;
    const advisory = analysisAdvisoryContextForRecord(item, analysis);
    const chartMismatch = analysis.chart_match_status === 'mismatch';
    const chartUnclear = analysis.chart_match_status === 'unclear';
    const chartWarning = analysis.chart_match_warning || '';
    const staleAnalysis = isAnalysisStaleForRecord(item);
    const reasons = analysis.key_reasons.length ? analysis.key_reasons.map(entry => `<li>${escapeHtml(entry)}</li>`).join('') : '<li>No key reasons returned.</li>';
    const risks = analysis.risks.length ? analysis.risks.map(entry => `<li>${escapeHtml(entry)}</li>`).join('') : '<li>No risks returned.</li>';
    const confidence = Number.isFinite(analysis.confidence_score) ? `${analysis.confidence_score}/100` : 'n/a';
    const renderModel = {
      verdict:analysis.verdict,
      setup_type:analysis.setup_type || 'Not given',
      entry:analysis.entry || 'Not given',
      stop:analysis.stop || 'Not given',
      first_target:analysis.first_target || 'Not given',
    };
    const showPlanNumbers = savedAiPlanNumbersAllowed(item);
    const planMarkup = showPlanNumbers
      ? `<div class="tiny"><strong>Plan:</strong> ${escapeHtml(renderModel.entry)} / ${escapeHtml(renderModel.stop)} / ${escapeHtml(renderModel.first_target)}</div>`
      : '<div class="tiny"><strong>Plan:</strong> No actionable plan yet.</div><div class="tiny">Bounce is too weak to price cleanly.</div><div class="tiny">Waiting for a reclaim and stronger close.</div>';
    return `<div class="responsegrid"><div class="mutebox tiny">${escapeHtml(advisory.advisoryNote)}</div>${advisory.reviewMoreConservative ? '<div class="mutebox warntext"><strong>Final review is more conservative than the saved AI read.</strong></div>' : ''}${staleAnalysis ? '<div class="mutebox warntext"><strong>Saved analysis from before invalidation</strong></div>' : ''}${chartMismatch ? `<div class="mutebox badtext"><strong>Chart mismatch warning:</strong> ${escapeHtml(chartWarning || 'The uploaded chart may not match this ticker. Re-check the screenshot before acting.')}</div>` : ''}${!chartMismatch && chartUnclear ? `<div class="mutebox warntext"><strong>Chart check warning:</strong> ${escapeHtml(chartWarning || 'The AI could not confidently verify that this chart matches the ticker.')}</div>` : ''}<details class="compact-details"><summary>Saved AI Metrics</summary><div class="tiny">AI confidence: ${escapeHtml(confidence)}${Number.isFinite(analysis.quality_score) ? ` | AI raw score: ${escapeHtml(`${analysis.quality_score}/10`)}` : ''}</div></details><div class="analysislead"><strong>Chart Read</strong><div class="tiny">${escapeHtml(analysis.plain_english_chart_read || 'No chart read returned.')}</div></div><div class="analysisplanmini"><div class="tiny"><strong>Setup:</strong> ${escapeHtml(renderModel.setup_type)}</div>${planMarkup}</div><details class="compact-details"><summary>Reasons And Risks</summary><div><strong>Key Reasons</strong><ul class="tiny">${reasons}</ul></div><div><strong>Risks</strong><ul class="tiny">${risks}</ul></div></details><details class="compact-details"><summary>Raw Response</summary><div class="mutebox scrollbox">${escapeHtml(analysisState.rawAnalysis)}</div></details></div>`;
  }
  if(!analysisState.rawAnalysis) return '<div class="tiny">No AI analysis saved yet.</div>';
  console.debug('LEGACY_PATH_STILL_IN_USE', 'renderAnalysisPanelFromRecord-fallback', item.ticker);
  return `<div class="mutebox scrollbox">${escapeHtml(analysisState.rawAnalysis)}</div>`;
}

function isAnalysisStaleForRecord(record){
  const item = normalizeTickerRecord(record);
  if(item.plan && item.plan.invalidatedState) return true;
  if(item.plan && item.plan.missedState) return true;

  const currentPrice = numericOrNull(item.marketData && item.marketData.price);
  const stop = numericOrNull(item.plan && item.plan.stop);

  if(Number.isFinite(currentPrice) && Number.isFinite(stop) && currentPrice <= stop){
    return true;
  }

  return false;
}

function statusRank(status){
  if(status === 'Strong Fit' || status === 'Ready' || status === 'Entry') return 0;
  if(status === 'Too Wide') return 1;
  if(status === 'Possible Fit' || status === 'Near Setup' || status === 'Near Entry') return 2;
  if(status === 'Manual Review' || status === 'Watch') return 2;
  return 3;
}

function loadTickerIntoReview(ticker, options = {}){
  const symbol = normalizeTicker(ticker);
  if(!symbol) return;
  setScannerCardClickTrace(symbol, 'loadTickerIntoReview.enter', `includeInScannerUniverse=${options.includeInScannerUniverse === true} recompute=${options.recompute === true}`);
  const record = upsertTickerRecord(symbol);
  uiState.activeReviewAddsToScannerUniverse = options.includeInScannerUniverse !== false;
  uiState.activeReviewVerdictOverride = options.useSourceVerdict !== false
    ? reviewVerdictOverrideFromLabel(options.sourceVerdict || '')
    : '';
  setActiveReviewTicker(symbol);
  record.review.cardOpen = true;
  if(options.includeInScannerUniverse === true && !state.tickers.includes(symbol)) state.tickers.push(symbol);
  delete uiState.selectedScanner[symbol];
  updateTickerInputFromState();
  commitTickerState();
  try{
    renderTickerQuickLists();
    renderScannerResults();
    setScannerCardClickTrace(symbol, 'loadTickerIntoReview.before_loadCard', `activeReviewTicker=${uiState.activeReviewTicker || '(none)'} scanner_rendered`);
    loadCard(symbol, {touchLifecycle:options.recompute === true, recompute:options.recompute === true});
    setScannerCardClickTrace(symbol, 'loadTickerIntoReview.post_loadCard', 'review_loaded');
  }catch(error){
    setScannerCardClickTrace(symbol, 'loadTickerIntoReview.post_render_error', error && error.message ? error.message : 'unknown_error');
    throw error;
  }
}

function openRankedResultInReview(ticker, options = {}){
  setScannerCardClickTrace(ticker, 'openRankedResultInReview.enter', `sourceVerdict=${options.sourceVerdict || '(none)'}`);
  loadTickerIntoReview(ticker, {
    includeInScannerUniverse:options.includeInScannerUniverse === true,
    recompute:options.recompute === true,
    sourceVerdict:options.sourceVerdict || ''
  });
}

function reviewWatchlistTicker(ticker){
  const symbol = normalizeTicker(ticker);
  if(!symbol) return;
  const record = getTickerRecord(symbol) || upsertTickerRecord(symbol);
  const sourceVerdict = reviewVerdictOverrideFromView(projectTickerForCard(record));
  loadTickerIntoReview(symbol, {includeInScannerUniverse:false, recompute:false, sourceVerdict});
  setStatus('scannerSelectionStatus', `<span class="ok">Loaded saved ${escapeHtml(symbol)} review state.</span>`);
}

async function refreshWatchlistRecordFromSourceOfTruth(ticker, options = {}){
  const symbol = normalizeTicker(ticker);
  if(!symbol) return {symbol:'', ok:false, skipped:true, reason:'invalid_ticker', record:null, snapshot:null, verdict:null};
  const record = upsertTickerRecord(symbol);
  const source = String(options.source || 'manual_refresh');
  if(options.clearReviewOverride !== false && activeReviewTicker() === symbol) uiState.activeReviewVerdictOverride = '';
  if(options.markPending) setWatchlistLiveRefreshPending(symbol, true);
  try{
    const {card} = await refreshCardMarketData(symbol, {force:true});
    mergeLegacyCardIntoRecord(record, card, {fromScanner:true, fromCards:record.review.cardOpen, cardOpen:record.review.cardOpen});
    const normalizedRecord = normalizeTickerRecord(record);
    state.tickerRecords[symbol] = normalizedRecord;
    normalizedRecord.watchlist.updatedAt = String(card.scannerUpdatedAt || card.updatedAt || new Date().toISOString());
    runWatchlistLifecycleEvaluation({
      source,
      tickers:[symbol],
      persist:false,
      render:false,
      force:true
    });
    const refreshedVerdict = resolveGlobalVerdict(normalizedRecord);
    const refreshedSnapshot = syncWatchlistLifecycle(normalizedRecord) || watchlistLifecycleSnapshot(normalizedRecord);
    appendWatchlistDebugEvent(normalizedRecord, {
      at:new Date().toISOString(),
      source:`${source}_result`,
      result:`settled: ${refreshedVerdict.final_verdict || 'unknown'} | allow_watchlist=${refreshedVerdict.allow_watchlist ? 'true' : 'false'} | lifecycle=${refreshedSnapshot && refreshedSnapshot.state ? refreshedSnapshot.state : 'n/a'}`
    });
    return {
      symbol,
      ok:true,
      skipped:false,
      reason:'',
      record:normalizedRecord,
      snapshot:refreshedSnapshot,
      verdict:refreshedVerdict
    };
  }catch(error){
    runWatchlistLifecycleEvaluation({
      source,
      tickers:[symbol],
      persist:false,
      render:false
    });
    return {
      symbol,
      ok:false,
      skipped:false,
      reason:error && error.message ? String(error.message) : 'refresh_failed',
      record,
      snapshot:syncWatchlistLifecycle(record) || watchlistLifecycleSnapshot(record),
      verdict:resolveGlobalVerdict(record)
    };
  }finally{
    if(options.markPending) clearWatchlistLiveRefreshPending(symbol);
  }
}

async function refreshWatchlistRecordsFromSourceOfTruth(options = {}){
  const source = String(options.source || 'startup_restore');
  const tickers = uniqueTickers(
    (options.tickers || watchlistTickerRecords().map(record => normalizeTickerRecord(record).ticker))
      .filter(Boolean)
  );
  if(!tickers.length) return {source, attempted:0, refreshed:0, failed:0, results:[]};
  const markPending = options.markPending !== false && source === 'startup_restore';
  if(markPending) setWatchlistLiveRefreshPending(tickers, true);
  const results = [];
  for(const symbol of tickers){
    const result = await refreshWatchlistRecordFromSourceOfTruth(symbol, {
      source,
      clearReviewOverride:options.clearReviewOverride,
      markPending
    });
    results.push(result);
    if(options.renderProgress){
      renderWatchlist();
      if(activeReviewTicker()) renderReviewWorkspace();
    }
  }
  if(options.persist !== false) commitTickerState();
  if(options.render !== false){
    renderWatchlist();
    renderFocusQueue();
    renderScannerResults();
    renderCards();
    if(activeReviewTicker()) renderReviewWorkspace();
  }
  return {
    source,
    attempted:tickers.length,
    refreshed:results.filter(result => result.ok).length,
    failed:results.filter(result => !result.ok).length,
    results
  };
}

async function refreshWatchlistTicker(ticker){
  const symbol = normalizeTicker(ticker);
  if(!symbol) return;
  setStatus('scannerSelectionStatus', `Refreshing ${escapeHtml(symbol)}...`);
  const result = await refreshWatchlistRecordFromSourceOfTruth(symbol, {
    source:'manual_refresh',
    clearReviewOverride:true
  });
  if(result.ok){
    setStatus('scannerSelectionStatus', `<span class="ok">${escapeHtml(symbol)} refreshed from saved market data.</span>`);
  }else{
    setStatus('scannerSelectionStatus', `<span class="warntext">Could not refresh ${escapeHtml(symbol)} right now. Kept the watchlist entry active locally.</span>`);
  }
  commitTickerState();
  requeueTickerForToday(symbol);
  renderWatchlist();
  renderFocusQueue();
  renderScannerResults();
  renderCards();
  if(activeReviewTicker() === symbol) renderReviewWorkspace();
}

function analyseActiveReviewTicker(){
  const ticker = activeReviewTicker();
  if(!ticker || uiState.loadingTicker) return;
  if(!String(uiState.activeReviewVerdictOverride || '').trim()){
    uiState.activeReviewVerdictOverride = displayStageForRecord(getTickerRecord(ticker) || upsertTickerRecord(ticker), {includeExecutionDowngrade:false});
  }
  analyseSetup(ticker);
}

function addActiveReviewTickerToWatchlist(){
  const ticker = activeReviewTicker();
  if(!ticker){
    setStatus('reviewWorkspaceStatus', '<span class="warntext">Select a ticker in the review workspace first.</span>');
    return;
  }
  const liveRecord = upsertTickerRecord(ticker);
  const eligibility = watchlistEligibilityForRecord(liveRecord);
  const reviewNotes = $('reviewNotes');
  if(reviewNotes) liveRecord.review.notes = reviewNotes.value;
  const reviewChecks = currentChecks();
  if(reviewChecks && typeof reviewChecks === 'object') liveRecord.review.checks = cloneData(reviewChecks, {});
  liveRecord.watchlist.debug = liveRecord.watchlist.debug && typeof liveRecord.watchlist.debug === 'object' ? liveRecord.watchlist.debug : {};
  if(eligibility.inWatchlist){
    liveRecord.watchlist.debug.lastAddResult = 'already_present';
    liveRecord.watchlist.debug.lastAddMessage = 'Already in watchlist.';
    const message = `<span class="ok">${escapeHtml(ticker)} is already in the watchlist.</span>`;
    setStatus('reviewWorkspaceStatus', message);
    setStatus('inputStatus', message);
    renderReviewWorkspace();
    return;
  }
  const entry = addToWatchlist({
    ticker:liveRecord.ticker,
    dateAdded:todayIsoDate(),
    scoreWhenAdded:preferredScoreForRecord(liveRecord),
    verdictWhenAdded:preferredVerdictForRecord(liveRecord),
    expiryAfterTradingDays:5
  });
  renderReviewLifecycleSummary(ticker);
  if(entry && entry.error){
    liveRecord.watchlist.debug.lastAddResult = entry.error || 'blocked';
    liveRecord.watchlist.debug.lastAddMessage = entry.message || 'Could not add to watchlist.';
    setStatus('reviewWorkspaceStatus', `<span class="warntext">${escapeHtml(entry.message || `Could not add ${ticker} to the watchlist.`)}</span>`);
    renderReviewWorkspace();
    return;
  }
  const statusMarkup = entry && entry.updated
    ? `<span class="ok">${escapeHtml(ticker)} is already in the watchlist.</span>`
    : `<span class="ok">${escapeHtml(ticker)} added to the watchlist.</span>`;
  setStatus('reviewWorkspaceStatus', statusMarkup);
  setStatus('inputStatus', statusMarkup);
  renderReviewWorkspace();
}

function saveActiveReviewTickerTrade(){
  const ticker = activeReviewTicker();
  if(!ticker) return;
  saveTradeFromCard(ticker);
}

function selectedScannerTickers(){
  return uniqueTickers(Object.keys(uiState.selectedScanner || {}).filter(ticker => uiState.selectedScanner[ticker]));
}

function updateScannerSelectionStatus(){
  const resultCount = rankedTickerRecords().length;
  if(!$('scannerSelectionStatus')) return;
  const lastScanLabel = uiState.scannerLastScanAt ? ` Last scanned: ${formatLocalTimestamp(uiState.scannerLastScanAt)}.` : '';
  if(uiState.scannerShortlistSuppressed){
    setStatus('scannerSelectionStatus', `Shortlist cleared.${lastScanLabel}`);
    return;
  }
  if(!resultCount){
    setStatus('scannerSelectionStatus', uiState.scannerLastScanAt
      ? `No scan results.${lastScanLabel}`
      : 'No scan results yet.');
    return;
  }
  setStatus('scannerSelectionStatus', `${resultCount} scan result${resultCount === 1 ? '' : 's'} ready.${lastScanLabel}`);
}

function renderReviewRecomputeDiagnostics(record){
  const debug = record && record.watchlist && record.watchlist.debug && typeof record.watchlist.debug === 'object'
    ? record.watchlist.debug
    : null;
  if(!debug || (!debug.lastSource && !debug.lastEvaluatedAt && !debug.recomputeResult)) return '';
  return `<details class="compact-details"><summary>Recompute Diagnostics</summary>${renderRecomputeDiagnostics(debug, {wrapperClass:'tiny'})}</details>`;
}

function seedCardsFromUniverse(limit){
  const universe = scannerUniverse().slice(0, limit || scannerUniverse().length);
  if(!universe.length) return;
  universe.forEach(ticker => {
    const record = upsertTickerRecord(ticker);
    record.review.cardOpen = true;
  });
  commitTickerState();
  renderCards();
}

function setSwipeFeedback(ticker, info){
  return setSwipeFeedbackImpl(ticker, info, scannerInteractionStateBridgeDeps());
}

function getSwipeFeedback(ticker){
  return getSwipeFeedbackImpl(ticker, scannerInteractionStateBridgeDeps());
}

function recordGestureDebug(ticker, note){
  return recordGestureDebugImpl(ticker, note, scannerInteractionStateBridgeDeps());
}

function attachScannerCardSwipeHandler(node, ticker){
  if(!node || !ticker) return;
  const threshold = 65;
  const assistDistance = 45;
  const cancelSelectors = ['button', 'summary', 'input', 'textarea'];
  const gestureState = {
    startX:0,
    startY:0,
    deltaX:0,
    deltaY:0,
    intent:null,
    suppressClick:false,
    swiped:false,
    maxDistance:0
  };
  node.__gestureState = gestureState;
  node.style.touchAction = 'pan-y';
  let pointerId = null;
  let startTime = 0;
  let removing = false;
  const reset = () => {
    node.style.transition = 'transform .2s ease, opacity .2s ease';
    node.style.transform = '';
    node.style.opacity = '';
    gestureState.maxDistance = 0;
  };
  const shouldIgnore = target => cancelSelectors.some(selector => target && target.closest(selector));
  const updateIntent = () => {
    if(gestureState.intent) return;
    const absX = Math.abs(gestureState.deltaX);
    const absY = Math.abs(gestureState.deltaY);
    if(absX > absY * 1.5 && absX > 15){
      gestureState.intent = 'horizontal-swipe';
      gestureState.suppressClick = true;
      recordGestureDebug(ticker, 'horizontal swipe detected; click suppressed');
    }else if(absY > absX * 1.5 && absY > 10){
      gestureState.intent = 'vertical-scroll';
      gestureState.suppressClick = true;
      recordGestureDebug(ticker, 'vertical scroll detected; click suppressed');
    }
  };
  const recordFailure = (reasonSuffix = '') => {
    const distance = Math.round(Math.max(gestureState.maxDistance, Math.abs(gestureState.deltaX)));
    setSwipeFeedback(ticker, {
      attempted:true,
      distance,
      threshold,
      reason:`Swiped ${distance}px${reasonSuffix ? ` (${reasonSuffix})` : ''}; need ${threshold}px to delete.`
    });
  };
  const removeWithAnimation = (distance) => {
    if(removing) return;
    removing = true;
    node.style.transition = 'transform .2s ease, opacity .2s ease';
    node.style.transform = 'translateX(-150%)';
    node.style.opacity = '0';
    setSwipeFeedback(ticker, {
      removed:true,
      distance,
      threshold,
      reason:'Removed by swipe'
    });
    gestureState.swiped = true;
    gestureState.suppressClick = true;
    recordGestureDebug(ticker, 'card removed by horizontal swipe; review blocked');
    closeScanCardMenu();
    setTimeout(() => removeCard(ticker), 220);
  };
  const finalize = event => {
    if(pointerId === null) return;
    if(event && typeof event.pointerId === 'number' && event.pointerId !== pointerId) return;
    if(node.hasPointerCapture(pointerId)) node.releasePointerCapture(pointerId);
    pointerId = null;
    const duration = Math.max(1, Date.now() - startTime);
    const velocity = gestureState.deltaX / duration;
    const distance = Math.round(Math.max(gestureState.maxDistance, Math.abs(gestureState.deltaX)));
    const nearAssist = distance >= assistDistance;
    const fastEnough = nearAssist && velocity <= -0.35;
    if(gestureState.intent === 'horizontal-swipe' && (gestureState.deltaX <= -threshold || fastEnough)){
      removeWithAnimation(distance);
      uiState.lastSwipeRemoved = {ticker, at:Date.now()};
      if(event && typeof event.preventDefault === 'function'){
        event.preventDefault();
      }
      return;
    }
    const reason = nearAssist ? 'stop short of assist mark' : 'drag too short';
    recordFailure(reason);
    gestureState.intent = gestureState.intent || 'tap';
    gestureState.suppressClick = gestureState.intent !== 'tap';
    if(!gestureState.suppressClick){
      recordGestureDebug(ticker, 'tap detected; review open allowed');
    }
    reset();
    gestureState.deltaX = 0;
    gestureState.deltaY = 0;
  };
  node.addEventListener('pointerdown', event => {
    if(pointerId !== null) return;
    if(event.button && event.button !== 0) return;
    if(shouldIgnore(event.target)) return;
    pointerId = event.pointerId;
    gestureState.startX = event.clientX;
    gestureState.startY = event.clientY;
    startTime = Date.now();
    gestureState.deltaX = 0;
    gestureState.deltaY = 0;
    gestureState.intent = null;
    gestureState.suppressClick = false;
    gestureState.swiped = false;
    gestureState.maxDistance = 0;
    node.style.transition = '';
    node.setPointerCapture(pointerId);
    setSwipeFeedback(ticker, null);
    recordGestureDebug(ticker, 'interaction started');
  });
  node.addEventListener('pointermove', event => {
    if(pointerId === null || event.pointerId !== pointerId) return;
    gestureState.deltaX = event.clientX - gestureState.startX;
    gestureState.deltaY = event.clientY - gestureState.startY;
    updateIntent();
    const moveX = Math.min(0, gestureState.deltaX);
    const absX = Math.abs(gestureState.deltaX);
    gestureState.maxDistance = Math.max(gestureState.maxDistance, absX);
    if(gestureState.intent === 'horizontal-swipe'){
      event.preventDefault();
      node.style.transform = `translateX(${moveX}px)`;
      node.style.opacity = `${Math.max(0.4, 1 + moveX / 300)}`;
    }else if(!gestureState.intent){
      node.style.transform = `translateX(${moveX}px)`;
      node.style.opacity = `${Math.max(0.4, 1 + moveX / 300)}`;
    }
  });
  node.addEventListener('pointerup', finalize);
  node.addEventListener('pointerleave', finalize);
  node.addEventListener('pointercancel', finalize);
}

function renderScannerResults(){
  const box = $('results');
  const resultsToggle = $('resultsToggle');
  if(!box) return;
  box.innerHTML = '';
  const records = rankedTickerRecords();
  const finalViews = records.map(record => buildFinalSetupView(record));
  if(resultsToggle){
    syncResultsToggleLabel();
  }
  console.debug('RENDER_FROM_TICKER_RECORD', 'rankedResults', records.length);
  if(!records.length){
    updateScannerSelectionStatus();
    if(uiState.scannerShortlistSuppressed){
      box.innerHTML = '<div class="summary"><strong>Shortlist Cleared</strong><div class="tiny" style="margin-top:8px">Run a fresh scan.</div></div>';
      return;
    }
    box.innerHTML = '<div class="summary"><strong>No scan results yet</strong><div class="tiny" style="margin-top:8px">Run a fresh scan or import tickers to generate new opportunities for review.</div></div>';
    renderWorkflowAlerts();
    return;
  }
  const sections = scannerResultSectionsImpl(finalViews, scannerResultsSupportBridgeDeps());
  sections.forEach(section => {
    const wrap = buildScannerSectionShellImpl(section, scannerResultsSupportBridgeDeps());
    const list = wrap.querySelector('.list');
    if(section.items.length){
      section.items.forEach(view => {
        const card = document.createElement('div');
        card.innerHTML = renderCompactResultCardFromView(view);
        const node = card.firstElementChild;
        if(!node) return;
        const ticker = view.ticker;
        const sourceVerdict = node.getAttribute('data-source-verdict') || '';
        const overflowToggle = node.querySelector('[data-act="overflow-toggle"]');
        const overflowMenu = node.querySelector('[data-role="overflow-menu"]');
        const secondaryPanel = node.querySelector('[data-role="secondary-panel"]');
        const detailsAction = node.querySelector('[data-act="open-details"]');
        const traceAction = node.querySelector('[data-act="open-trace"]');
        const visualDebugAction = node.querySelector('[data-act="open-visual-debug"]');
        if(overflowMenu){
          overflowMenu.onclick = event => {
            event.stopPropagation();
          };
        }
        if(overflowToggle){
          overflowToggle.onclick = event => {
            event.preventDefault();
            event.stopPropagation();
            toggleScanCardMenu(ticker);
            renderScannerResults();
          };
        }
        if(detailsAction){
          detailsAction.onclick = event => {
            event.preventDefault();
            event.stopPropagation();
            setScanCardActiveSubmenu(ticker, 'details');
            renderScannerResults();
          };
        }
        if(traceAction){
          traceAction.onclick = event => {
            event.preventDefault();
            event.stopPropagation();
            setScanCardActiveSubmenu(ticker, 'trace');
            renderScannerResults();
          };
        }
        if(visualDebugAction){
          visualDebugAction.onclick = event => {
            event.preventDefault();
            event.stopPropagation();
            setScanCardActiveSubmenu(ticker, 'visual-debug');
            renderScannerResults();
          };
        }
        if(secondaryPanel){
          secondaryPanel.onclick = event => {
            event.preventDefault();
            event.stopPropagation();
            // Keep interaction within the submenu; background/back handling occurs separately.
          };
        }
        const submenuPanel = node.querySelector('[data-submenu-panel]');
        if(submenuPanel){
          submenuPanel.onclick = event => {
            if(event.target === submenuPanel || event.target.closest('[data-act="submenu-back"]')){
              event.stopPropagation();
              event.preventDefault();
              closeScanCardSubmenu();
              renderScannerResults();
            }
          };
        }
        attachScannerCardSwipeHandler(node, ticker);
        node.querySelectorAll('.compact-details summary').forEach(summary => {
          summary.onclick = event => {
            event.stopPropagation();
          };
        });
        const scannerCardActivationBlocked = event => !!(event && (event.target.closest('.no-card-click') || event.target.closest('summary') || event.target.closest('.compact-details')));
        node.tabIndex = 0;
        node.setAttribute('role', 'button');
        node.onclick = null;
        node.onpointerup = null;
        node.onkeydown = event => {
          if(event.key !== 'Enter' && event.key !== ' ') return;
          if(scannerCardActivationBlocked(event)) return;
          event.preventDefault();
          const menuState = currentScanCardMenuState(ticker);
          if(menuState.menuOpen){
            closeScanCardMenu();
            renderScannerResults();
            suppressNextScannerActivation(ticker);
            return;
          }
          if(currentScanCardSecondaryUi(ticker)){
            clearScanCardSecondaryUi();
            renderScannerResults();
            return;
          }
          attemptScanCardActivation(ticker, sourceVerdict);
        };
        list.appendChild(node);
      });
    }else{
      list.innerHTML = `<div class="summary">${escapeHtml(section.empty)}</div>`;
    }
    box.appendChild(wrap);
  });
  updateScannerSelectionStatus();
  renderWorkflowAlerts();
}

function contextualResultEmptyState(bucket){
  return contextualResultEmptyStateImpl(bucket, scannerResultsSupportBridgeDeps());
}

function legacyRenderCardsFromCardList(){
  const box = $('cardsList');
  if(!box) return;
  box.innerHTML = '';
  const records = activeReviewTicker() ? [getTickerRecord(activeReviewTicker())].filter(Boolean) : [];
  console.debug('RENDER_FROM_TICKER_RECORD', 'cards', records.length);
  if(!records.length){
    box.innerHTML = (state.tickers || []).length
      ? '<div class="summary">Open one ranked result to load it into the review workspace.</div><a class="helperbutton" href="#resultsSection">Go To Ranked Results</a>'
      : '<div class="summary">Run a scan first, then open a shortlisted ticker here for review.</div><a class="helperbutton" href="#dailyInput">Go To Scan List</a>';
    return;
  }
  records.map(normalizeTickerRecord).forEach(record => {
    const view = projectTickerForCard(record);
    const promptText = record.review.lastPrompt || buildTickerPromptFromRecord(record);
    const sourceLabel = record.review.source === 'openai' ? 'OpenAI' : (record.review.source === 'scanner' ? 'Scanner' : (record.review.source === 'ai' ? 'Imported AI' : 'Checklist'));
    const marketLabel = record.meta.marketStatus || state.marketStatus;
    const updatedLabel = record.meta.updatedAt ? new Date(record.meta.updatedAt).toLocaleString() : '';
    const loading = uiState.loadingTicker === record.ticker;
    const analysisBusy = !!uiState.loadingTicker;
    const analyseLabel = loading ? 'Analysing...' : (record.review.lastError ? 'Retry Analysis' : 'Analyse Setup');
    const companyLine = record.meta.companyName ? `<div class="tiny">${escapeHtml(record.meta.companyName)}${record.meta.exchange ? ` | ${escapeHtml(record.meta.exchange)}` : ''}</div>` : '';
    const hasMarketData = Number.isFinite(record.marketData.price) || Number.isFinite(record.marketData.ma20) || Number.isFinite(record.marketData.ma50) || Number.isFinite(record.marketData.ma200);
    const marketDataLine = hasMarketData ? `<div class="tiny">Price ${escapeHtml(fmtPrice(Number(record.marketData.price)))} | 20 ${escapeHtml(fmtPrice(Number(record.marketData.ma20)))} | 50 ${escapeHtml(fmtPrice(Number(record.marketData.ma50)))} | 200 ${escapeHtml(fmtPrice(Number(record.marketData.ma200)))} | Vol ${escapeHtml(formatPercent(record.marketData.volume && record.marketData.avgVolume ? ((record.marketData.volume / record.marketData.avgVolume) - 1) * 100 : null))} vs avg | RSI ${escapeHtml(fmtPrice(Number(record.marketData.rsi)))}</div>` : '<div class="tiny">Market data pending...</div>';
    const performanceLine = hasMarketData ? `<div class="tiny">1W ${escapeHtml(formatPercent(record.marketData.perf1w))} | 1M ${escapeHtml(formatPercent(record.marketData.perf1m))} | 3M ${escapeHtml(formatPercent(record.marketData.perf3m))} | 6M ${escapeHtml(formatPercent(record.marketData.perf6m))} | YTD ${escapeHtml(formatPercent(record.marketData.perfYtd))}</div>` : '';
    const suitability = record.scan.analysisProjection && record.scan.analysisProjection.suitability ? record.scan.analysisProjection.suitability : null;
    const suitabilityLine = record.review.source === 'scanner' && suitability ? `<div class="tiny">Trend ${suitability.trend}/4 | Pullback ${suitability.pullback}/3 | Trade ${suitability.tradeQuality}/3</div>` : '';
    const freshnessAge = relativeAgeLabel(record.scan.lastScannedAt);
    const freshnessBadge = record.scan.lastScannedAt ? `<span class="badge ${isFreshScanTimestamp(record.scan.lastScannedAt) ? 'freshness-fresh' : 'freshness-stale'}">${isFreshScanTimestamp(record.scan.lastScannedAt) ? 'Fresh' : 'Stale'}${freshnessAge ? ` | ${escapeHtml(freshnessAge)}` : ''}</span>` : '';
    const lifecycleLine = `<div class="tiny">Lifecycle ${escapeHtml(record.lifecycle.stage || 'untracked')} | ${escapeHtml(record.lifecycle.status || 'inactive')}${record.lifecycle.expiresAt ? ` | Expires ${escapeHtml(record.lifecycle.expiresAt)}` : ''}</div>`;
    const meta = `<div class="tiny">${escapeHtml(sourceLabel)} - ${escapeHtml(marketLabel)}${updatedLabel ? ` - ${escapeHtml(updatedLabel)}` : ''}</div>${freshnessBadge ? `<div class="inline-status">${freshnessBadge}</div>` : ''}${companyLine}${marketDataLine}${performanceLine}${suitabilityLine}${lifecycleLine}`;
    const scoreLabel = view.setupScoreDisplay.replace('Setup ', '');
    const combinedStatus = combinedStatusLabel(view.displayStage, view.displayedPlan.riskFit.risk_status || record.scan.riskStatus || 'plan_missing');
    const riskMeta = renderPlanProjectionFromRecord(record);
    const div = document.createElement('div');
    div.className = 'result';
    div.innerHTML = `<div class="resulthead" style="${escapeHtml(cardVisualStyleAttr(view && view.setupScore, view && view.setupUiState && view.setupUiState.state))}"><div class="ticker">${escapeHtml(record.ticker)}</div><div><div>${escapeHtml(currentRuntimeSummaryForRecord(record) || savedReviewSummaryForRecord(record) || 'No review saved yet.')}</div>${meta}${riskMeta}</div><div class="score ${scoreClass(view.setupScore || 0)}">${escapeHtml(scoreLabel)}</div><div class="inline-status resultactions" style="justify-content:flex-end"><span class="badge ${statusClass(view.displayStage)}">${escapeHtml(combinedStatus)}</span><button class="danger" data-act="remove">Remove</button></div></div><div class="resultbody"><div class="panelbox"><label>Chart Workflow</label><details class="chartworkflow"><summary class="secondary">Chart Workflow</summary><div class="workflowmenu"><button class="secondary" type="button" data-act="open-chart">Open Chart</button><button class="secondary" type="button" data-act="choose-chart">Choose Screenshot</button><button class="secondary" type="button" data-act="import-latest">Import Latest</button><button class="ghost" type="button" data-act="clear-chart">Remove Chart</button></div></details><input id="chart-${record.ticker}" data-act="file" type="file" accept="image/png,image/jpeg,image/*" hidden />${record.review.chartRef && record.review.chartRef.dataUrl ? `<div class="thumbwrap"><img class="thumb" src="${escapeHtml(record.review.chartRef.dataUrl)}" alt="Chart preview for ${escapeHtml(record.ticker)}" /><div><div class="tiny">${escapeHtml(record.review.chartRef.name || 'chart image')}</div><div class="tiny">Stored locally on this device.</div></div></div>` : '<div class="tiny" style="margin-top:10px">No chart attached yet.</div>'}</div><div class="panelbox"><label for="notes-${record.ticker}">Notes</label><textarea id="notes-${record.ticker}" data-act="notes" placeholder="Add ticker-specific notes here.">${escapeHtml(record.review.notes || '')}</textarea><div class="actions"><button class="primary" data-act="analyse" ${analysisBusy && !loading ? 'disabled' : ''}>${analyseLabel}</button></div><details class="responsepanel" id="response-${record.ticker}" ${(((uiState.responseOpen[record.ticker] ?? !!record.review.aiAnalysisRaw) || !!record.review.lastError)) ? 'open' : ''}><summary>Analysis Result</summary>${renderAnalysisPanelFromRecord(record)}</details><div class="actions"><button class="secondary" data-act="save-trade">Save Trade</button><button class="secondary" data-act="add-watchlist">Add to Watchlist</button></div><details class="promptdetails" id="prompt-${record.ticker}" ${(uiState.promptOpen[record.ticker] ?? !!record.review.lastPrompt) ? 'open' : ''}><summary>Prompt Preview</summary><div class="mutebox">${escapeHtml(promptText)}</div></details><div class="statusline tiny" id="cardStatus-${record.ticker}">${renderCardStatusLineFromRecord(record, loading, analysisBusy)}</div></div></div>`;
    div.querySelector('[data-act="open-chart"]').onclick = () => openTickerChart(record.ticker);
    div.querySelector('[data-act="remove"]').onclick = () => removeCard(record.ticker);
    div.querySelector('[data-act="analyse"]').onclick = () => { if(!uiState.loadingTicker) analyseSetup(record.ticker); };
    div.querySelector('[data-act="save-trade"]').onclick = () => {
      const liveRecord = upsertTickerRecord(record.ticker);
      const notesEl = $(`notes-${record.ticker}`);
      if(notesEl) liveRecord.review.notes = notesEl.value;
      commitTickerState();
      saveTradeFromCard(record.ticker);
      const statusBox = $(`cardStatus-${record.ticker}`);
      if(statusBox) statusBox.innerHTML = '<span class="ok">Trade record saved to the diary.</span>';
    };
    div.querySelector('[data-act="add-watchlist"]').onclick = () => {
      const liveRecord = upsertTickerRecord(record.ticker);
      const notesEl = $(`notes-${record.ticker}`);
      if(notesEl) liveRecord.review.notes = notesEl.value;
      const result = addToWatchlist({
        ticker:liveRecord.ticker,
        dateAdded:todayIsoDate(),
        scoreWhenAdded:preferredScoreForRecord(liveRecord),
        verdictWhenAdded:preferredVerdictForRecord(liveRecord),
        expiryAfterTradingDays:5
      });
      const statusBox = $(`cardStatus-${record.ticker}`);
      if(statusBox && result && !result.error){
        statusBox.innerHTML = result.updated
          ? '<span class="ok">Ticker already in the watchlist. Review metadata updated.</span>'
          : '<span class="ok">Ticker saved to the watchlist for 5 trading days.</span>';
      }
    };
    const notesField = div.querySelector('[data-act="notes"]');
    notesField.addEventListener('input', event => {
      const liveRecord = upsertTickerRecord(record.ticker);
      liveRecord.review.notes = event.target.value;
      commitTickerState();
    });
    notesField.addEventListener('change', event => {
      const liveRecord = upsertTickerRecord(record.ticker);
      liveRecord.review.notes = event.target.value;
      commitTickerState();
    });
    const promptDetails = div.querySelector(`#prompt-${record.ticker}`);
    const responseDetails = div.querySelector(`#response-${record.ticker}`);
    promptDetails.addEventListener('toggle', () => { uiState.promptOpen[record.ticker] = promptDetails.open; });
    responseDetails.addEventListener('toggle', () => { uiState.responseOpen[record.ticker] = responseDetails.open; });
    div.querySelector('[data-act="file"]').addEventListener('change', event => handleChartSelection(record.ticker, event.target.files && event.target.files[0]));
    const workflowChooseBtn = div.querySelector('[data-act="choose-chart"]');
    if(workflowChooseBtn) workflowChooseBtn.onclick = () => div.querySelector('[data-act="file"]').click();
    const workflowImportBtn = div.querySelector('[data-act="import-latest"]');
    if(workflowImportBtn) workflowImportBtn.onclick = () => { importLatestChart(record.ticker).catch(() => {}); };
    const clearChartBtn = div.querySelector('[data-act="clear-chart"]');
    if(clearChartBtn){
      clearChartBtn.onclick = () => {
        const liveRecord = upsertTickerRecord(record.ticker);
        liveRecord.review.chartRef = null;
        liveRecord.review.chartAvailable = false;
        commitTickerState();
        renderCards();
      };
    }
    box.appendChild(div);
  });
}

function bindReviewWorkspaceActions(record){
  const box = $('reviewWorkspace');
  if(!box) return;
  const notesField = $('reviewNotes');
  if(notesField){
    notesField.addEventListener('input', event => {
      const liveRecord = upsertTickerRecord(record.ticker);
      liveRecord.review.notes = event.target.value;
      commitTickerState();
    });
    notesField.addEventListener('change', event => {
      const liveRecord = upsertTickerRecord(record.ticker);
      liveRecord.review.notes = event.target.value;
      commitTickerState();
    });
  }
  const promptDetails = $('reviewPrompt');
  const responseDetails = $('reviewResponse');
  if(promptDetails) promptDetails.addEventListener('toggle', () => { uiState.promptOpen[record.ticker] = promptDetails.open; });
  if(responseDetails) responseDetails.addEventListener('toggle', () => { uiState.responseOpen[record.ticker] = responseDetails.open; });
  const fileInput = $('reviewChartFile');
  if(fileInput) fileInput.addEventListener('change', event => handleChartSelection(record.ticker, event.target.files && event.target.files[0]));
  const chooseBtn = box.querySelector('[data-act="choose-chart"]');
  if(chooseBtn && fileInput) chooseBtn.onclick = () => fileInput.click();
  const importBtn = box.querySelector('[data-act="import-latest"]');
  if(importBtn) importBtn.onclick = () => { importLatestChart(record.ticker).catch(() => {}); };
  const openBtn = box.querySelector('[data-act="open-chart"]');
  if(openBtn) openBtn.onclick = () => openTickerChart(record.ticker);
  const clearBtn = box.querySelector('[data-act="clear-chart"]');
  if(clearBtn){
    clearBtn.onclick = () => {
      const liveRecord = upsertTickerRecord(record.ticker);
      liveRecord.review.chartRef = null;
      liveRecord.review.chartAvailable = false;
      commitTickerState();
      renderReviewWorkspace();
    };
  }
  click('analyseActiveBtn', analyseActiveReviewTicker);
  click('saveReviewBtn', saveReview);
  click('addWatchlistActiveBtn', addActiveReviewTickerToWatchlist);
  click('resetReviewBtn', resetReview);
  click('removeTickerActiveBtn', () => removeTicker(record.ticker));
  click('expireLifecycleBtn', expireSelectedTickerLifecycle);
  box.querySelectorAll('[data-act="capital-sim-50"]').forEach(button => {
    button.onclick = () => {
      setReviewCapitalSimulation(record.ticker, 0.50);
      renderReviewWorkspace();
    };
  });
  box.querySelectorAll('[data-act="capital-sim-65"]').forEach(button => {
    button.onclick = () => {
      setReviewCapitalSimulation(record.ticker, 0.65);
      renderReviewWorkspace();
    };
  });
  box.querySelectorAll('[data-act="capital-sim-85"]').forEach(button => {
    button.onclick = () => {
      setReviewCapitalSimulation(record.ticker, 0.85);
      renderReviewWorkspace();
    };
  });
  box.querySelectorAll('[data-act="capital-sim-clear"]').forEach(button => {
    button.onclick = () => {
      clearReviewCapitalSimulation(record.ticker);
      renderReviewWorkspace();
    };
  });
  document.querySelectorAll('#reviewWorkspace .logic').forEach(el => el.addEventListener('change', refreshReview));
  ['entryPrice','stopPrice','targetPrice'].forEach(id => on(id, 'input', calculate));
}

function renderReviewWorkspace(options = {}){
  const box = $('reviewWorkspace');
  if(!box) return;
  box.className = 'list reviewworkspace-shell';
  box.innerHTML = '';
  const ticker = activeReviewTicker();
  if(!ticker){
    const savedReviewRecords = openCardTickerRecords();
    if(savedReviewRecords.length){
      box.innerHTML = `<div class="summary">Resume a saved review or open a ranked result.</div><div class="actions">${savedReviewRecords.map(record => `<button class="secondary compactbutton" type="button" data-act="resume-review" data-ticker="${escapeHtml(record.ticker)}">${escapeHtml(record.ticker)}</button>`).join('')}</div>${(state.tickers || []).length ? '<a class="helperbutton" href="#resultsSection">Go To Ranked Results</a>' : '<a class="helperbutton" href="#dailyInput">Go To Scan List</a>'}`;
      box.querySelectorAll('[data-act="resume-review"]').forEach(button => {
        button.onclick = () => openRankedResultInReview(button.getAttribute('data-ticker') || '', {includeInScannerUniverse:false});
      });
      return;
    }
    box.innerHTML = (state.tickers || []).length
      ? '<div class="summary">Open one ranked result to load it into the review workspace.</div><a class="helperbutton" href="#resultsSection">Go To Ranked Results</a>'
      : '<div class="summary">Run a scan first, then open a shortlisted ticker here for focused review.</div><a class="helperbutton" href="#dailyInput">Go To Scan List</a>';
    return;
  }
  const liveRecord = getTickerRecord(ticker) || upsertTickerRecord(ticker);
  const canonicalPlanSynced = ensureCanonicalPlanForRecord(liveRecord, {allowScannerFallback:true, source:'review'});
  if(options.recompute === true){
    maybeExpireTickerRecord(liveRecord);
    reevaluateTickerProgress(liveRecord);
  }
  if(canonicalPlanSynced) commitTickerState();
  const record = normalizeTickerRecord(liveRecord);
  const analysisState = getReviewAnalysisState(record);
  const warningState = (analysisState.normalizedAnalysis && analysisState.normalizedAnalysis.warning_state)
    ? analysisState.normalizedAnalysis.warning_state
    : evaluateWarningState(record, analysisState.normalizedAnalysis);
  const effectivePlan = effectivePlanForRecord(record, {allowScannerFallback:true});
  const baseDisplayedPlan = applySetupConfirmationPlanGate(
    record,
    deriveCurrentPlanState(effectivePlan.entry, effectivePlan.stop, effectivePlan.firstTarget, record.marketData.currency)
  );
  const capitalSimulationState = applyReviewCapitalSimulation(baseDisplayedPlan, record.ticker);
  const displayedPlan = capitalSimulationState.displayedPlan;
  const planCheckState = planCheckStateForRecord(record, {effectivePlan, displayedPlan});
  const executionState = deriveExecutionPlanState(record, {
    exitMode:record.plan.exitMode,
    targetLevel:displayedPlan.target
  });
  const promptText = analysisState.promptPreview;
  const review = record.review && record.review.manualReview && typeof record.review.manualReview === 'object' ? record.review.manualReview : null;
  const reviewChecks = review && review.checks ? review.checks : ((record.scan.flags && record.scan.flags.checks) || {});
  const rrRatio = displayedPlan.rewardRisk.valid ? displayedPlan.rewardRisk.rrRatio : null;
  const rewardPerShare = displayedPlan.rewardPerShare;
  const setupScore = setupScoreForRecord(record);
  const setupScoreDisplay = setupScoreDisplayForRecord(record);
  const derivedStates = analysisDerivedStatesFromRecord(record);
  const convictionTier = convictionTierLabel(record.setup.convictionTier || '');
  const qualityAdjustments = evaluateSetupQualityAdjustments(record, {
    displayedPlan,
    derivedStates
  });
  const adjustmentSummary = qualityAdjustments.adjustmentReasons.join(' | ');
  const initialVerdictOverride = activeReviewTicker() === record.ticker ? String(uiState.activeReviewVerdictOverride || '').trim() : '';
  const reviewHeaderVerdict = reviewHeaderVerdictForRecord(record);
  const displayStage = initialVerdictOverride || reviewHeaderVerdict;
  const scannerView = buildFinalSetupView(record);
  const scannerStatus = normalizeAnalysisVerdict(scannerView && scannerView.scannerResolution && scannerView.scannerResolution.status || scannerView && scannerView.displayStage || '');
  const effectivePlanSnapshot = {
    entry:effectivePlan.entry,
    stop:effectivePlan.stop,
    firstTarget:effectivePlan.firstTarget
  };
  const currentPlanCheckState = planCheckStateForRecord(record, {
    effectivePlan:effectivePlanSnapshot,
    displayedPlan
  });
  const planUiState = getPlanUiState(record, {
    displayedPlan,
    effectivePlan:effectivePlanSnapshot,
    planCheckState:currentPlanCheckState
  });
  const setupUiState = getSetupUiState(record, {displayStage, planUiState});
  const planRealism = evaluatePlanRealism(record, {
    displayedPlan,
    derivedStates:analysisDerivedStatesFromRecord(record),
    qualityAdjustments,
    displayStage,
    setupUiState
  });
  const avoidSubtype = avoidSubtypeForRecord(record, {
    derivedStates:analysisDerivedStatesFromRecord(record),
    displayedPlan,
    qualityAdjustments,
    finalVerdict:displayStage
  });
  const emojiPresentation = resolveEmojiPresentation(record, {
    context:'review',
    finalVerdict:displayStage,
    derivedStates:analysisDerivedStatesFromRecord(record),
    displayedPlan,
    qualityAdjustments,
    warningState,
    planUiState,
    setupUiState,
    avoidSubtype
  });
  const resolvedContract = resolveFinalStateContract(record, {
    context:'review',
    finalVerdict:displayStage,
    derivedStates:analysisDerivedStatesFromRecord(record),
    displayedPlan,
    qualityAdjustments,
    warningState,
    planUiState,
    setupUiState,
    avoidSubtype,
    emojiPresentation
  });
  const simulatedExecutionVerdict = capitalSimulationState.simulation
    ? capitalSimulationVerdictImpact(displayStage, capitalSimulationState.simulation.capitalFit)
    : '';
  const simulatedFinalVerdict = capitalSimulationState.simulation
    ? (simulatedExecutionVerdict || displayStage)
    : '';
  const globalVerdict = resolveGlobalVerdict(record);
  const watchlistEligibility = watchlistEligibilityForRecord(record);
  const decisionReasoning = decisionReasoningForRecord(record, {
    scannerStatus,
    reviewVerdict:displayStage,
    derivedStates:analysisDerivedStatesFromRecord(record),
    displayedPlan,
    qualityAdjustments,
    warningState,
    avoidSubtype
  });
  const planState = planUiState.label;
  const executionModeText = executionModeLabel(executionState.exitMode);
  const targetReviewText = targetReviewStateLabel(executionState.targetReviewState);
  const targetActionText = executionState.targetActionRecommendation || 'Hold / monitor';
  const targetGuidance = dynamicExitGuidance(executionState.exitMode);
  const targetAlertText = record.plan.targetAlert && record.plan.targetAlert.enabled
    ? `On @ ${Number.isFinite(executionState.targetAlertLevel) ? fmtPrice(Number(executionState.targetAlertLevel)) : 'n/a'}`
    : 'Off';
  const positionCostText = Number.isFinite(displayedPlan.capitalFit.position_cost)
    ? `${Number(displayedPlan.capitalFit.position_cost.toFixed(2))}${displayedPlan.capitalFit.quote_currency ? ` ${displayedPlan.capitalFit.quote_currency}` : ''}`
    : 'N/A';
  const capitalUsage = capitalUsageAdvisory({
    positionCostGbp:displayedPlan.capitalFit.position_cost_gbp,
    positionCost:displayedPlan.capitalFit.position_cost,
    quoteCurrency:displayedPlan.capitalFit.quote_currency,
    accountSizeGbp:currentAccountSizeGbp(),
    fxStatus:displayedPlan.capitalFit.fx_status
  });
  const capitalComfort = capitalComfortSummary({
    capitalFit:displayedPlan.capitalFit.capital_fit,
    capitalNote:displayedPlan.capitalFit.capital_note,
    affordability:displayedPlan.affordability,
    capitalUsage,
    planStatus:displayedPlan.status,
    controlQuality:qualityAdjustments.controlQuality,
    capitalEfficiency:qualityAdjustments.capitalEfficiency
  });
  const visualState = resolveVisualState(record, 'review', {
    resolvedContract,
    derivedStates:analysisDerivedStatesFromRecord(record),
    displayedPlan,
    setupScore
  });
  const decisionSummary = visualState.decision_summary;
  const reviewBadge = visualState.badge || getBadge(visualState.finalVerdict || visualState.final_verdict);
  const reviewAction = getActions(visualState.finalVerdict || visualState.final_verdict);
  const reviewBadgeLabel = reviewBadge.text;
  const planUI = resolvePlanVisibility({
    state:visualState.finalVerdict,
    bounce_state:derivedStates.bounceState || (record && record.setup && record.setup.bounceState),
    structure:derivedStates.structureState || (record && record.setup && record.setup.structureState)
  });
  const tradeStatusText = planUI.showPlan
    ? tradeStatusMetricText({globalVerdict:visualState, displayedPlan, resolvedContract})
    : {line1:planUI.diagnosticsMessage || 'Bounce is too weak to price cleanly.', line2:''};
  const modifierMarkup = emojiModifierMarkup(resolvedContract);
  const scannerPresentation = resolveEmojiPresentation(record, {
    context:'scanner',
    finalVerdict:scannerStatus,
    setupUiState:scannerView && scannerView.setupUiState,
    displayedPlan:scannerView && scannerView.displayedPlan,
    derivedStates:scannerView && scannerView.setupStates,
    warningState:scannerView && scannerView.warningState
  });
  if(scannerPresentation.primaryText !== reviewBadgeLabel){
    console.warn('EMOJI_SURFACE_DISAGREEMENT', {ticker:record.ticker, scanner:scannerPresentation.primaryText, review:reviewBadgeLabel});
  }
  const downgradeSummary = reviewDowngradeSummaryForRecord(record, {
    scannerStatus,
    reviewStatus:displayStage,
    displayedPlan,
    derivedStates:analysisDerivedStatesFromRecord(record),
    qualityAdjustments,
    warningState
  });
  if(displayStage === 'Watch' && /ignore/i.test(String(reviewAction.label || ''))){
    console.warn('REVIEW_STATE_MISMATCH', {ticker:record.ticker, finalVerdict:displayStage, nextAction:reviewAction.label});
  }
  if(displayStage === 'Watch' && avoidSubtype === 'terminal'){
    console.warn('REVIEW_STATE_MISMATCH', {ticker:record.ticker, finalVerdict:displayStage, avoidSubtype});
  }
  if((displayStage !== 'Avoid' && resolvedContract.primaryState === 'dead') || (displayStage === 'Avoid' && resolvedContract.primaryState !== 'dead' && avoidSubtype === 'terminal')){
    console.warn('REVIEW_HEADER_DISAGREEMENT', {ticker:record.ticker, finalVerdict:displayStage, reviewBadgeLabel, headline:decisionReasoning.headline, nextAction:reviewAction.label});
  }
  const loading = uiState.loadingTicker === record.ticker;
  const analysisBusy = !!uiState.loadingTicker;
  const notesPlaceholder = loading ? '🤖 AI analysis in progress...' : 'Add ticker-specific notes here.';
  const analysisUiState = reviewAnalysisUiStateForRecord(record);
  const analyseLabel = analysisUiState === 'complete'
    ? 'Re-run analysis'
    : (analysisUiState === 'error' ? 'Analyse Setup' : 'Analyse Setup');
  const showAnalyseButton = analysisUiState !== 'running';
  const analyseDisabled = analysisUiState === 'idle' || (analysisBusy && !loading);
  const diagnosticsToneClass = planUI.diagnosticsTone === 'danger'
    ? 'avoid'
    : (planUI.diagnosticsTone === 'neutral' ? 'watch' : `analysis-state-${analysisUiState}`);
  const analysisPanelClass = `reviewanalysispanel ${diagnosticsToneClass}`;
  const analysisPanelBody = analysisUiState === 'idle'
    ? '<div class="tiny">Add a screenshot to run AI analysis.</div>'
    : (analysisUiState === 'ready'
      ? '<div class="tiny">Screenshot attached. AI analysis will start automatically.</div>'
      : (analysisUiState === 'running'
        ? '<div class="summary ai-progress-text">🤖 AI analysis in progress<span class="ai-loading-dots"><span>.</span><span>.</span><span>.</span></span></div><div class="tiny ai-progress-subtext">Reading chart and building trade plan.</div>'
        : (analysisUiState === 'complete'
          ? '<div class="summary">Analysis complete</div><div class="tiny">Review AI read and trade plan below.</div>'
          : '<div class="summary">Analysis failed</div><div class="tiny">Try again.</div>')));
  const diagnosticsPanelBody = planUI.diagnosticsMessage
    ? nonPlanDiagnosticsSummaryMarkup(planUI.diagnosticsMessage, decisionSummary)
    : analysisPanelBody;
  const companyLine = [record.meta.companyName || 'Unknown company', record.meta.exchange || ''].filter(Boolean).join(' | ');
  const marketLine = [record.meta.marketStatus || state.marketStatus].filter(Boolean).join(' | ');
  const rawRrDisplay = planUI.showRR && displayedPlan.status === 'valid' && Number.isFinite(planRealism.raw_rr) ? `${planRealism.raw_rr.toFixed(2)}R` : 'No actionable plan yet.';
  const credibleRrDisplay = Number.isFinite(planRealism.credible_rr) ? `${planRealism.credible_rr.toFixed(2)}R` : 'N/A';
  const planRealismSummary = planRealism.plan_realism_reason || 'Planner realism will appear after a complete plan is entered.';
  const planRealismReasons = planUI.showPlan && planRealism.reasons && planRealism.reasons.length ? planRealism.reasons.slice(0, 2).join(' | ') : '';
  const chartPreview = record.review.chartRef && record.review.chartRef.dataUrl
    ? `<div class="thumbwrap"><img class="thumb reviewthumb" src="${escapeHtml(record.review.chartRef.dataUrl)}" alt="Chart preview for ${escapeHtml(record.ticker)}" /><div><div class="tiny">${escapeHtml(record.review.chartRef.name || 'chart image')}</div><div class="tiny">Stored locally on this device.</div></div></div>`
    : '<div class="tiny">No chart attached yet.</div>';
  const chartGuidance = record.review.chartRef && record.review.chartRef.dataUrl
    ? ''
    : '<div class="summary" style="margin-bottom:12px"><strong>📸 Add screenshot for analysis</strong><div class="tiny" style="margin-top:6px">Open the live chart, capture a fresh screenshot, then import it to continue review.</div></div>';
  const capitalSimulationControls = `<div class="actions" style="margin-top:8px"><button class="secondary compactbutton" type="button" data-act="capital-sim-50">Simulate 50%</button><button class="secondary compactbutton" type="button" data-act="capital-sim-65">Simulate 65%</button><button class="secondary compactbutton" type="button" data-act="capital-sim-85">Simulate 85%</button><button class="ghost compactbutton" type="button" data-act="capital-sim-clear">Clear simulation</button></div>`;
  const reviewDebug = `<details class="compact-details"><summary>Debug State</summary>${renderDebugSectionMarkup('Final Decision', [
    {label:'UI State Source', value:visualState.ui_state_source || '(none)'},
    {label:'Final Verdict Rendered', value:visualState.final_verdict_rendered || visualState.finalVerdict || '(none)'},
    {label:'Bucket Rendered', value:visualState.bucket_rendered || visualState.bucket || '(none)'},
    {label:'Dead Guard Applied', value:visualState.dead_guard_applied ? 'true' : 'false'},
    {label:'Dead Trigger Source', value:visualState.dead_trigger_source || '(none)'},
    {label:'Explicit Invalidation Reason', value:visualState.explicit_invalidation_reason || globalVerdict.explicit_invalidation_reason || '(none)'},
    {label:'Structure->Label Source', value:visualState.structure_to_label_mapping_source || globalVerdict.structure_to_label_mapping_source || '(none)'},
    {label:'Lifecycle Drop Reason', value:visualState.lifecycle_drop_reason || globalVerdict.lifecycle_drop_reason || '(none)'},
    {label:'Avoid Allowed By Structure Guard', value:(typeof visualState.avoid_allowed_by_structure_consistency_guard === 'boolean'
      ? (visualState.avoid_allowed_by_structure_consistency_guard ? 'true' : 'false')
      : (globalVerdict.avoid_allowed_by_structure_consistency_guard ? 'true' : 'false'))},
    {label:'Conflicting Legacy State Detected', value:visualState.conflicting_legacy_state_detected ? 'true' : 'false'},
    {label:'Final Verdict', value:globalVerdict.final_verdict || '(none)'},
    {label:'Tone', value:globalVerdict.tone || '(none)'},
    {label:'Bucket', value:globalVerdict.bucket || '(none)'},
    {label:'Badge', value:(globalVerdict.badge && globalVerdict.badge.text) || '(none)'},
    {label:'Final State Reason', value:globalVerdict.final_state_reason || '(none)'},
    {label:'Avoid Trigger Source', value:globalVerdict.avoid_trigger_source || '(none)'},
    {label:'Tracked', value:globalVerdict.tracked ? 'true' : 'false'},
    {label:'Downgrade Applied', value:globalVerdict.downgrade_applied ? 'true' : 'false'},
    {label:'Downgrade Reason', value:globalVerdict.downgrade_reason || '(none)'},
    {label:'Entry Gate Pass', value:globalVerdict.entry_gate_pass ? 'true' : 'false'},
    {label:'Near Entry Gate Pass', value:globalVerdict.near_entry_gate_pass ? 'true' : 'false'}
  ])}${renderDebugSectionMarkup('Base Assessment', [
    {label:'Base Verdict', value:globalVerdict.base_verdict || '(none)'},
    {label:'Setup Score', value:Number.isFinite(globalVerdict.setup_score) ? `${globalVerdict.setup_score}/10` : '(none)'},
    {label:'Structure', value:globalVerdict.structure_state || '(none)'},
    {label:'Bounce', value:globalVerdict.bounce_state || '(none)'},
    {label:'Market', value:globalVerdict.market_regime || '(none)'},
    {label:'Volume', value:(record && record.setup && record.setup.volumeState) || '(none)'}
  ])}${renderDebugSectionMarkup('Execution State', [
    {label:'Lifecycle State', value:globalVerdict.lifecycle || '(none)'},
    {label:'Action State', value:resolvedContract.actionStateLabel || resolvedContract.actionLabel || '(none)'},
    {label:'Plan Status', value:planUI.showPlan ? (resolvedContract.planStatusLabel || '(none)') : (planUI.diagnosticsMessage || '(none)')},
    {label:'Plan Visible', value:planUI.showPlan ? 'true' : 'false'},
    {label:'RR Confidence', value:resolvedContract.rrConfidenceLabel || '(none)'},
    {label:'Capital Fit', value:(capitalComfort.label || 'Unknown') || '(none)'},
    {label:'Capital Usage', value:capitalUsageDebugText(displayedPlan)},
    {label:'Next Possible', value:(globalVerdict.action && globalVerdict.action.label) || '(none)'},
    {label:'In Watchlist', value:watchlistEligibility.inWatchlist ? 'true' : 'false'},
    {label:'Watchlist Entry Exists', value:watchlistEligibility.watchlistEntryExists ? 'true' : 'false'},
    {label:'Allow Watchlist', value:watchlistEligibility.allowWatchlist ? 'true' : 'false'},
    {label:'Last Add Result', value:(record.watchlist && record.watchlist.debug && record.watchlist.debug.lastAddResult) || '(none)'},
    {label:'Last Add Message', value:(record.watchlist && record.watchlist.debug && record.watchlist.debug.lastAddMessage) || '(none)'}
  ])}${renderAdvancedDebugMarkup([
    {label:'Entry Gate Reasons', value:(globalVerdict.entry_gate_reasons || []).join(' | ') || '(none)'},
    {label:'Near Entry Gate Reasons', value:(globalVerdict.near_entry_gate_reasons || []).join(' | ') || '(none)'},
    {label:'Entry Gate Checks', value:JSON.stringify(globalVerdict.entry_gate_checks || {}) || '(none)'},
    {label:'Base Status Label', value:scannerStatus || '(none)'},
    {label:'Base Review Label', value:displayStage || '(none)'},
    {label:'Structure Label', value:resolvedContract.structuralStateLabel || resolvedContract.finalDisplayState || '(none)'},
    {label:'Base Tradeability', value:resolvedContract.tradeabilityVerdictLabel || resolvedContract.tradeabilityLabel || '(none)'},
    {label:'Visual Tone', value:visualState.visual_tone || '(none)'},
    {label:'Plan Label', value:resolvedContract.planStatusLabel || '(none)'},
    {label:'Capital Affordability', value:displayedPlan.affordability || '(none)'},
    {label:'Capital OK', value:displayedPlan.capitalFit && displayedPlan.capitalFit.capital_ok === true ? 'true' : (displayedPlan.capitalFit && displayedPlan.capitalFit.capital_ok === false ? 'false' : '(none)')},
    {label:'Main Blocker', value:resolvedContract.blockerReason || '(none)'},
    {label:'Base Resolver Verdict', value:resolvedContract.rawResolverVerdict || '(none)'},
    {label:'Remap Reason', value:resolvedContract.remapReason || '(none)'},
    {label:'Resolver Reason', value:globalVerdict.reason || '(none)'},
    {label:'AI Analysis Raw Length', value:String(analysisState.rawAnalysis.length)},
    {label:'Normalized Analysis Exists', value:String(!!analysisState.normalizedAnalysis)},
    {label:'Last Error', value:analysisState.error || '(none)'},
    {label:'Last Reviewed At', value:record.review.lastReviewedAt || '(none)'}
  ])}${renderDebugSectionMarkup('Capital Simulation (Debug Only)', [
    {label:'Simulated Capital Usage', value:capitalSimulationState.simulation ? capitalSimulationState.simulation.label : '(none)'},
    {label:'Simulated Capital Fit', value:capitalSimulationState.simulation ? capitalSimulationState.simulation.capitalFit : '(none)'},
    {label:'Simulated Affordability', value:capitalSimulationState.simulation ? capitalSimulationState.simulation.affordability : '(none)'},
    {label:'Simulated Capital OK', value:capitalSimulationState.simulation ? String(capitalSimulationState.simulation.capitalOk) : '(none)'},
    {label:'Simulated Tradeability', value:capitalSimulationState.simulation ? capitalSimulationState.simulation.tradeability : '(none)'},
    {label:'Simulated Final Verdict Impact', value:capitalSimulationState.simulation ? (simulatedFinalVerdict || displayStage) : '(none)'}
  ])}${capitalSimulationControls}</details>`;
  const headerContextChip = resolvedContract.marketRegimeWeak
    ? {
      label:'⚠️ Weak market',
      className:'near',
      title:resolvedContract.reasonSummary || 'Market regime is weaker than ideal.'
    }
    : null;
  const hasWeakConditionsModifier = !!(resolvedContract.modifiers || []).some(modifier => modifier.code === 'weak_conditions');
  const headerContextMarkup = headerContextChip
    && !(hasWeakConditionsModifier && /weak conditions|caution|weak market/i.test(String(headerContextChip.label || '')))
    ? `<span class="pill ${headerContextChip.className}" title="${escapeHtml(headerContextChip.title || '')}">${escapeHtml(headerContextChip.label)}</span>`
    : '';
  const marketMetaLine = headerContextChip ? '' : `<div class="tiny">${escapeHtml(marketLine)}</div>`;
  const snapshotWarningsMarkup = [modifierMarkup, headerContextMarkup].filter(Boolean).join('');
  const snapshotVerdictLine = decisionSummary;
  const analysisResponseOpen = (((uiState.responseOpen[record.ticker] ?? false) || !!analysisState.error)) ? 'open' : '';
  const promptPreviewOpen = (uiState.promptOpen[record.ticker] ?? false) ? 'open' : '';
  const capitalFitLabel = capitalComfort.label || 'Unknown';
  const fxBasisNote = capitalComfort.note || 'No FX conversion note.';
  const capitalFitVisual = capitalFitPresentation({
    capitalFit:displayedPlan.capitalFit.capital_fit,
    affordability:displayedPlan.affordability,
    comfortLabel:capitalFitLabel
  });
  box.className = `list reviewworkspace-shell ${visualState.className || visualState.toneClass || ''}`;
  box.style.cssText = visualState.styleAttr || '';
  box.dataset.visualTone = visualState.visual_tone || '';
  box.dataset.visualState = visualState.state || '';
  ensureLiveFxRateForCurrency(displayedPlan.capitalFit.quote_currency, () => {
    if(activeReviewTicker() === record.ticker) calculate();
  });
  box.innerHTML = `<div class="reviewworkspace ready" data-tone-source="${escapeHtml(visualState.debugToneSource)}" data-visual-tone="${escapeHtml(visualState.visual_tone || '')}" data-visual-state="${escapeHtml(visualState.state || '')}">
    <div class="panelbox review-section review-section--snapshot">
      <div class="reviewsectionhead"><strong>Snapshot</strong></div>
      <div class="reviewhero reviewhero-compact">
        <div class="reviewherohead">
          <div class="reviewheadline">
            <div class="inline-status">
              <strong>${escapeHtml(record.ticker)}</strong>
              <span class="badge ${reviewBadge.className}">${escapeHtml(reviewBadgeLabel)}</span>
              <span class="score visual-score">${escapeHtml(setupScoreDisplay)}</span>
            </div>
            <div class="tiny">${escapeHtml(companyLine)}</div>
            ${marketMetaLine}
            ${snapshotWarningsMarkup ? `<div class="inline-status review-warning-row">${snapshotWarningsMarkup}</div>` : ''}
            ${downgradeSummary ? `<div class="tiny review-downgrade-badge"><span class="badge avoid">${escapeHtml(downgradeSummary.label)}</span> ${escapeHtml(downgradeSummary.transition)}</div>` : ''}
            <div class="review-decision-detail decision-summary">${escapeHtml(snapshotVerdictLine)}</div>
          </div>
        </div>
      </div>
      <div class="reviewchartpanel reviewchartpanel--compact">
        ${chartGuidance}
        <div class="reviewsectionhead">
          <strong>Chart</strong>
          <div class="workflowmenu workflowmenu-inline">
            <button class="secondary compactbutton" type="button" data-act="open-chart">Open Chart</button>
            <button class="secondary compactbutton" type="button" data-act="choose-chart">Choose Screenshot</button>
            <button class="secondary compactbutton" type="button" data-act="import-latest">Import Latest</button>
            <button class="ghost compactbutton" type="button" data-act="clear-chart">Remove Chart</button>
          </div>
        </div>
        <input id="reviewChartFile" type="file" accept="image/png,image/jpeg,image/*" hidden />
        ${chartPreview}
      </div>
    </div>
    <div class="panelbox review-section review-section--trade plannerbox ${escapeHtml(planUI.showRR ? plannerToneClass(planRealism.raw_rr) : 'plannerbox--rr-mid')}" id="plannerBox">
      <div class="reviewsectionhead"><strong id="plannerSection">Trade Plan</strong></div>
      <div class="summary review-hidden" id="plannerPlanSummary">Entry: Not given | Stop: Not given | First Target: Not given | Planned R:R: N/A</div>
      <input id="selectedTicker" value="${escapeHtml(record.ticker)}" readonly hidden />
      <div class="plan-grid plan-grid-inputs ${planUI.showPlan ? '' : 'review-hidden'}" id="tradePlanInputs">
        <div><label>Planned Entry</label><input id="entryPrice" type="number" step="0.01" value="${escapeHtml(effectivePlan.entry || '')}" /></div>
        <div><label>Planned Stop</label><input id="stopPrice" type="number" step="0.01" value="${escapeHtml(effectivePlan.stop || '')}" /></div>
        <div><label>${escapeHtml(executionState.exitMode === 'dynamic_exit' ? 'Target Review Level' : 'Planned First Target')}</label><input id="targetPrice" type="number" step="0.01" value="${escapeHtml(effectivePlan.firstTarget || '')}" /></div>
      </div>
      <div class="reviewstats plan-grid plan-grid-stats reviewstats--compact">
        <div class="stat stat--trade-status"><div>Trade Status</div><div class="big" id="tradeStatusBox">${renderTradeStatusMarkup(tradeStatusText)}</div></div>
        <div class="stat stat--primary"><div>R:R</div><div class="big ${escapeHtml(rrDisplayClass(planRealism.raw_rr))}" id="rrValue">${escapeHtml(rawRrDisplay)}</div></div>
        <div class="stat stat--capital-fit ${escapeHtml(capitalFitVisual.className)} ${planUI.showCapital ? '' : 'review-hidden'}" id="capitalFitMetric"><div>Capital Fit</div><div class="big" id="capitalFitBox">${escapeHtml(capitalFitMetricText(capitalComfort.label))}</div></div>
        <div class="stat ${planUI.showPositionSize ? '' : 'review-hidden'}" id="positionSizeStat"><div>Position Size</div><div class="big" id="positionSize">-</div></div>
        <div class="stat ${planUI.showPlan ? '' : 'review-hidden'}" id="positionCostStat"><div>Position Cost</div><div class="big" id="positionCostBox">${escapeHtml(positionCostText)}</div></div>
        <div class="stat review-hidden"><div>Risk / Share</div><div class="big" id="riskPerShare">-</div></div>
        <div class="stat review-hidden"><div>Reward / Share</div><div class="big" id="rewardPerShareBox">${escapeHtml(Number.isFinite(rewardPerShare) ? rewardPerShare.toFixed(2) : '-')}</div></div>
        <div class="stat review-hidden"><div>Max Loss</div><div class="big">${escapeHtml(formatGbp(currentMaxLoss()))}</div></div>
        <div class="stat review-hidden"><div>Risk / Capital</div><div class="big" id="riskFitBox">${escapeHtml(`${riskStatusLabel(record.plan.riskStatus || 'plan_missing')} / ${capitalComfort.label}`)}</div></div>
        <div class="stat review-hidden"><div>Capital Check</div><div class="big" id="capitalCheckBox">${escapeHtml(capitalComfort.note || 'Clear')}</div></div>
      </div>
      <div class="statnote trade-plan-fx-note ${planUI.showCapital ? '' : 'review-hidden'}" id="fxBasisBox">${escapeHtml(fxBasisNote)}</div>
      <div class="tiny" id="calcNote">${escapeHtml(planUI.showPlan ? 'Enter planned entry, stop, and first target to calculate size.' : nonPlanCalcNoteText(planUI.diagnosticsMessage, decisionSummary))}</div>
    </div>
    <div class="panelbox review-section review-section--confidence ${escapeHtml(analysisPanelClass)}">
      <div class="reviewsectionhead"><strong>Confidence / Diagnostics</strong></div>
      ${diagnosticsPanelBody}
      ${showAnalyseButton ? `<div class="reviewactions reviewactions-top"><button class="primary" id="analyseActiveBtn" ${analyseDisabled ? 'disabled' : ''}>${escapeHtml(analyseLabel)}</button><button class="ghost" id="resetReviewBtn">Remove</button></div>` : '<div class="reviewactions reviewactions-top"><button class="ghost" id="resetReviewBtn">Remove</button></div>'}
      <textarea id="reviewNotes" class="${loading ? 'review-notes--ai' : ''}" placeholder="${escapeHtml(notesPlaceholder)}">${escapeHtml(record.review.notes || '')}</textarea>
      ${renderReviewRecomputeDiagnostics(record)}
      <details class="responsepanel compact-open-on-demand" id="reviewResponse" ${analysisResponseOpen}>
        <summary>AI Summary</summary>
        ${renderAnalysisPanelFromRecord(record)}
      </details>
      <div class="summary" id="planRealismSummary">${escapeHtml(planUI.showPlan ? planRealismSummary : nonPlanRealismSummaryText(planUI.diagnosticsMessage, decisionSummary))}</div>
      <div class="tiny" id="planRealismReasons">${escapeHtml(planRealismReasons)}</div>
      <details class="compact-details">
        <summary>Plan Diagnostics</summary>
        <div class="reviewmeta-grid">
          <div><label>Plan State</label><input id="planStateBox" readonly value="${escapeHtml(planState)}" /></div>
          <div><label>Plan Math</label><input id="planQualityBox" readonly value="${escapeHtml(planQualityForRr(rrRatio) || 'N/A')}" /></div>
          <div><label>RR Realism</label><input id="rrRealismBox" readonly value="${escapeHtml(planRealism.rr_realism_label)}" /></div>
          <div><label>Credible RR</label><input id="credibleRrBox" readonly value="${escapeHtml(credibleRrDisplay)}" /></div>
          <div><label>Optimistic Target</label><input id="optimisticTargetBox" readonly value="${escapeHtml(planRealism.optimistic_target_flag ? 'Yes' : 'No')}" /></div>
          <div><label>Target Assessment</label><input id="targetAssessmentBox" readonly value="${escapeHtml(planRealism.credible_target_assessment)}" /></div>
          <div><label>Plan Source</label><input id="planSourceBox" readonly value="${escapeHtml(String(record.plan.source || effectivePlan.source || ''))}" /></div>
          <div><label>Trigger State</label><input id="triggerStateBox" readonly value="${escapeHtml(triggerStateLabel(record.plan.triggerState))}" /></div>
          <div><label>Plan Check</label><input id="planValidationBox" readonly value="${escapeHtml(planValidationStateLabel(planCheckState))}" /></div>
          <div><label>Execution Mode</label><input id="exitModeBox" readonly value="${escapeHtml(executionModeText)}" /></div>
          <div><label>Target Review</label><input id="targetReviewStateBox" readonly value="${escapeHtml(targetReviewText)}" /></div>
          <div><label>Target Alert</label><input id="targetAlertBox" readonly value="${escapeHtml(targetAlertText)}" /></div>
          <div><label>Capital Comfort</label><input id="capitalComfortBox" readonly value="${escapeHtml(capitalComfort.label)}" /></div>
        </div>
      </details>
      <details class="promptdetails compact-open-on-demand" id="reviewPrompt" ${promptPreviewOpen}>
        <summary>Prompt Preview</summary>
        <div class="mutebox scrollbox">${escapeHtml(promptText)}</div>
      </details>
      <details class="panelbox reviewchecklist">
        <summary><strong>Checklist</strong> <span id="progressText">Checks met: 0 / 10</span></summary>
        <div class="prog"><div class="fill" id="progressFill"></div></div>
        <div class="checks">
          <div class="checkgroup"><h3>Trend</h3><label class="checkitem"><input type="checkbox" class="logic" id="trendStrong" ${reviewChecks.trendStrong ? 'checked' : ''}> Strong uptrend</label><label class="checkitem"><input type="checkbox" class="logic" id="above50" ${reviewChecks.above50 ? 'checked' : ''}> Above 50 MA</label><label class="checkitem"><input type="checkbox" class="logic" id="above200" ${reviewChecks.above200 ? 'checked' : ''}> Above 200 MA</label><label class="checkitem"><input type="checkbox" class="logic" id="ma50gt200" ${reviewChecks.ma50gt200 ? 'checked' : ''}> 50 MA above 200 MA</label></div>
          <div class="checkgroup"><h3>Pullback + Confirmation</h3><label class="checkitem"><input type="checkbox" class="logic" id="near20" ${reviewChecks.near20 ? 'checked' : ''}> Near 20 MA</label><label class="checkitem"><input type="checkbox" class="logic" id="near50" ${reviewChecks.near50 ? 'checked' : ''}> Near 50 MA</label><label class="checkitem"><input type="checkbox" class="logic" id="stabilising" ${reviewChecks.stabilising ? 'checked' : ''}> Stabilising</label><label class="checkitem"><input type="checkbox" class="logic" id="bounce" ${reviewChecks.bounce ? 'checked' : ''}> Bounce candle</label><label class="checkitem"><input type="checkbox" class="logic" id="volume" ${reviewChecks.volume ? 'checked' : ''}> Volume supportive</label></div>
          <div class="checkgroup"><h3>Trade Plan</h3><label class="checkitem"><input type="checkbox" class="logic" id="entryDefined" ${reviewChecks.entryDefined ? 'checked' : ''}> Entry defined</label><label class="checkitem"><input type="checkbox" class="logic" id="stopDefined" ${reviewChecks.stopDefined ? 'checked' : ''}> Stop defined</label><label class="checkitem"><input type="checkbox" class="logic" id="targetDefined" ${reviewChecks.targetDefined ? 'checked' : ''}> Target defined</label></div>
        </div>
        <div class="summary" id="summaryBox">No setup reviewed yet.</div>
      </details>
      <div class="reviewactions">
        <button class="secondary" id="saveReviewBtn">Save Review</button>
        <button class="secondary" id="addWatchlistActiveBtn" ${watchlistEligibility.canAdd ? '' : 'disabled'}>${watchlistEligibility.inWatchlist ? 'Already In Watchlist' : 'Add to Watchlist'}</button>
      </div>
      <details class="compact-details">
        <summary>Workspace Status</summary>
        <div class="summary" id="reviewLifecycleSummary">Lifecycle: Not tracked yet.</div>
        <div class="reviewactions reviewactions-secondary"><button class="ghost" id="expireLifecycleBtn" type="button">Expire Now</button></div>
        ${reviewDebug}
        <div class="statusline tiny" id="reviewWorkspaceStatus">${renderCardStatusLineFromRecord(record, loading, analysisBusy)}</div>
      </details>
      <div class="reviewactions reviewactions-secondary">
        <button class="danger" id="removeTickerActiveBtn" type="button">Remove Ticker</button>
      </div>
    </div>
  </div>`;
  bindReviewWorkspaceActions(record);
  refreshReview();
  renderReviewLifecycleSummary(record.ticker);
  calculate({persist:false});
}

function renderCards(){
  renderReviewWorkspace();
}

function handleChartSelection(ticker, file){
  const statusBox = $('reviewWorkspaceStatus') || $(`cardStatus-${ticker}`);
  if(!file){
    if(statusBox) statusBox.innerHTML = '<span class="warntext">No chart selected.</span>';
    return;
  }
  if(!['image/png','image/jpeg'].includes(file.type)){
    if(statusBox) statusBox.innerHTML = '<span class="badtext">Use a PNG or JPG chart screenshot.</span>';
    return;
  }
  if(file.size > MAX_CHART_BYTES){
    if(statusBox) statusBox.innerHTML = `<span class="badtext">That image is ${escapeHtml(formatApproxBytes(file.size))}. Keep chart uploads under ${escapeHtml(formatApproxBytes(MAX_CHART_BYTES))}.</span>`;
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const record = upsertTickerRecord(ticker);
    record.review.cardOpen = true;
    record.review.chartRef = {name:file.name, type:file.type, dataUrl:String(reader.result || '')};
    record.review.chartAvailable = true;
    record.review.importedFromScreenshot = true;
    setReviewAnalysisState(record, {raw:'', normalized:null, error:'', reviewedAt:''});
    record.review.lastReviewedAt = new Date().toISOString();
    record.meta.updatedAt = record.review.lastReviewedAt;
    commitTickerState();
    renderReviewWorkspace();
    queueAutoAnalysisForTicker(record.ticker);
    const liveStatus = $('reviewWorkspaceStatus') || $(`cardStatus-${ticker}`);
    if(liveStatus) liveStatus.innerHTML = '<span class="ok">Chart saved on this device for this ticker. Starting AI analysis...</span>';
  };
  reader.onerror = () => {
    if(statusBox) statusBox.innerHTML = '<span class="badtext">Could not read that chart file.</span>';
  };
  reader.readAsDataURL(file);
}

async function importLatestChart(ticker){
  const statusBox = $('reviewWorkspaceStatus') || $(`cardStatus-${ticker}`);
  try{
    if(navigator.clipboard && navigator.clipboard.read){
      const items = await navigator.clipboard.read();
      for(const item of items){
        const imageType = item.types.find(type => /^image\//i.test(type));
        if(!imageType) continue;
        const blob = await item.getType(imageType);
        const ext = imageType.includes('png') ? 'png' : 'jpg';
        const file = new File([blob], `latest-chart.${ext}`, {type:imageType});
        handleChartSelection(ticker, file);
        return;
      }
    }
    const input = $(`chart-${ticker}`);
    if(input) input.click();
    if(statusBox) statusBox.innerHTML = '<span class="warntext">Clipboard image import is not available here. Choose the latest screenshot manually.</span>';
  }catch(error){
    const input = $(`chart-${ticker}`);
    if(input) input.click();
    if(statusBox) statusBox.innerHTML = '<span class="warntext">Could not read the latest screenshot automatically. Choose it manually instead.</span>';
  }
}

function scrollReviewSectionIntoView(ticker, context = 'review_open'){
  const symbol = normalizeTicker(ticker);
  const runScroll = attempt => {
    const scrollTarget = $('reviewWorkspace') || $('reviewSection');
    if(!scrollTarget){
      setScannerCardClickTrace(symbol, `${context}.scroll_missing`, `attempt=${attempt}`);
      return;
    }
    scrollTarget.scrollIntoView({behavior:'smooth', block:'start'});
    setScannerCardClickTrace(symbol, `${context}.scrolled`, `${scrollTarget.id || 'reviewWorkspace'} attempt=${attempt}`);
  };
  if(typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'){
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => runScroll('raf')));
    setTimeout(() => runScroll('timeout'), 80);
    return;
  }
  setTimeout(() => runScroll('timeout'), 0);
}

function loadCard(ticker, options = {}){
  const record = getTickerRecord(ticker);
  if(!record) return;
  setScannerCardClickTrace(ticker, 'loadCard.enter', `touchLifecycle=${options.touchLifecycle === true} recompute=${options.recompute === true}`);
  console.debug('RENDER_FROM_TICKER_RECORD', 'setupReview', ticker);
  setActiveReviewTicker(record.ticker);
  if(options.touchLifecycle === true){
    refreshLifecycleStage(record, 'reviewed', REVIEW_EXPIRY_TRADING_DAYS, 'Ticker opened in Setup Review.', 'review');
    commitTickerState();
  }
  renderReviewWorkspace({recompute:options.recompute === true});
  setScannerCardClickTrace(ticker, 'loadCard.after_renderReviewWorkspace', 'workspace_rendered');
  const review = record.review && record.review.manualReview && typeof record.review.manualReview === 'object' ? record.review.manualReview : null;
  const reviewChecks = review && review.checks ? review.checks : ((record.scan.flags && record.scan.flags.checks) || {});
  checklistIds.forEach(id => {
    const input = $(id);
    if(input) input.checked = !!reviewChecks[id];
  });
  setScannerCardClickTrace(ticker, 'loadCard.after_syncChecks', 'checks_synced');
  refreshReview();
  setScannerCardClickTrace(ticker, 'loadCard.after_refreshReview', 'review_refreshed');
  syncPlannerFromTicker(record.ticker);
  const hydratedPlan = getCanonicalTradeSnapshot(record.ticker);
  setScannerCardClickTrace(ticker, 'loadCard.after_syncPlanner', `planner_synced source=${(hydratedPlan && hydratedPlan.source) || String(record.plan && record.plan.source || 'none')} entry=${(hydratedPlan && hydratedPlan.entry) || '(blank)'}`);
  renderReviewLifecycleSummary(record.ticker);
  scrollReviewSectionIntoView(record.ticker, 'loadCard');
  setScannerCardClickTrace(ticker, 'loadCard.complete', `selectedTicker=${(($('selectedTicker') && $('selectedTicker').value) || '(none)')}`);
}

function refreshReview(){
  const checks = currentChecks();
  const result = scoreAndStatusFromChecks(checks);
  $('summaryBox').textContent = buildSummary(checks, result.status);
  $('progressText').textContent = `Checks met: ${result.score} / 10`;
  $('progressFill').style.width = `${result.score * 10}%`;
  syncPlanDisplayMeta();
  const ticker = activeReviewTicker();
  const record = ticker ? getTickerRecord(ticker) : null;
  const reviewNotes = $('reviewNotes');
  if(reviewNotes){
    const aiBusy = !!(ticker && uiState.loadingTicker === ticker);
    reviewNotes.classList.toggle('review-notes--ai', aiBusy);
    reviewNotes.placeholder = aiBusy ? '🤖 AI analysis in progress...' : 'Add ticker-specific notes here.';
  }
  if(record && record.watchlist && record.watchlist.inWatchlist){
    runWatchlistLifecycleEvaluation({
      source:'auto_recompute',
      tickers:[ticker],
      persist:false,
      render:false,
      force:true
    });
    renderWatchlist();
    renderFocusQueue();
  }
}

function saveReview(){
  const ticker = activeReviewTicker();
  if(!ticker){
    $('selectedTicker').focus();
    return;
  }
  const checks = currentChecks();
  const result = scoreAndStatusFromChecks(checks);
  const record = upsertTickerRecord(ticker);
  setActiveReviewTicker(ticker);
  record.review.cardOpen = true;
  if(uiState.activeReviewAddsToScannerUniverse !== false && !state.tickers.includes(ticker)) state.tickers.push(ticker);
  const manualReview = {
    checks,
    entry:$('entryPrice').value || '',
    stop:$('stopPrice').value || '',
    target:$('targetPrice').value || '',
    score:result.score,
    status:result.status,
    summary:buildSummary(checks, result.status),
    savedAt:new Date().toISOString()
  };
  record.review.manualReview = manualReview;
  record.review.lastReviewedAt = manualReview.savedAt;
  record.review.savedVerdict = result.status;
  record.review.savedSummary = manualReview.summary;
  record.review.savedScore = result.score;
  refreshLifecycleStage(record, 'reviewed', REVIEW_EXPIRY_TRADING_DAYS, 'Manual review saved.', 'review');
  applyPlanCandidateToRecord(record, {
    entry:manualReview.entry,
    stop:manualReview.stop,
    firstTarget:manualReview.target
  }, {
    source:'review',
    lastPlannedAt:manualReview.savedAt
  });
  runWatchlistLifecycleEvaluation({
    source:'review_save',
    tickers:[ticker],
    persist:false,
    render:false,
    force:true
  });
  updateTickerInputFromState();
  commitTickerState();
  renderWatchlist();
  renderFocusQueue();
  renderCards();
  renderReviewLifecycleSummary(ticker);
  setStatus('inputStatus', '<span class="ok">Manual review saved as optional notes only. Scanner ranking stays unchanged.</span>');
}

function resetReview(){
  uiState.activeReviewTicker = '';
  uiState.activeReviewAddsToScannerUniverse = true;
  uiState.activeReviewVerdictOverride = '';
  ['selectedTicker','planStateBox','planQualityBox','planSourceBox','exitModeBox','targetReviewStateBox','targetAlertBox','rrRealismBox','credibleRrBox','optimisticTargetBox','targetAssessmentBox','entryPrice','stopPrice','targetPrice'].forEach(id => { if($(id)) $(id).value = ''; });
  checklistIds.forEach(id => { $(id).checked = false; });
  $('summaryBox').textContent = 'No setup reviewed yet.';
  $('progressText').textContent = 'Checks met: 0 / 10';
  $('progressFill').style.width = '0%';
  $('calcNote').textContent = 'Enter planned entry, stop, and first target to calculate size.';
  ['riskPerShare','positionSize','rrValue'].forEach(id => { $(id).textContent = '-'; });
  renderPlannerPlanSummary('', '', '', 'fixed_target');
  renderReviewLifecycleSummary('');
  renderCards();
}

function syncPlanDisplayMeta(){
  const ticker = activeReviewTicker();
  const planStateBox = $('planStateBox');
  const planQualityBox = $('planQualityBox');
  const planSourceBox = $('planSourceBox');
  const exitModeBox = $('exitModeBox');
  const triggerStateBox = $('triggerStateBox');
  const planValidationBox = $('planValidationBox');
  const targetReviewStateBox = $('targetReviewStateBox');
  const targetAlertBox = $('targetAlertBox');
  if(!ticker){
    if(planStateBox) planStateBox.value = '';
    if(planQualityBox) planQualityBox.value = '';
    if(planSourceBox) planSourceBox.value = '';
    if(exitModeBox) exitModeBox.value = '';
    if(triggerStateBox) triggerStateBox.value = '';
    if(planValidationBox) planValidationBox.value = '';
    if(targetReviewStateBox) targetReviewStateBox.value = '';
    if(targetAlertBox) targetAlertBox.value = '';
    return;
  }
  const liveRecord = getTickerRecord(ticker) || upsertTickerRecord(ticker);
  const canonicalPlanSynced = ensureCanonicalPlanForRecord(liveRecord, {allowScannerFallback:true, source:'review'});
  if(canonicalPlanSynced) commitTickerState();
  const record = normalizeTickerRecord(liveRecord);
  const effectivePlan = effectivePlanForRecord(record, {allowScannerFallback:true});
  const entryValue = $('entryPrice') ? $('entryPrice').value : effectivePlan.entry;
  const stopValue = $('stopPrice') ? $('stopPrice').value : effectivePlan.stop;
  const targetValue = $('targetPrice') ? $('targetPrice').value : effectivePlan.firstTarget;
  const displayedPlan = applySetupConfirmationPlanGate(
    record,
    deriveCurrentPlanState(entryValue, stopValue, targetValue, record.marketData.currency)
  );
  const derivedStates = analysisDerivedStatesFromRecord(record);
  const qualityAdjustments = evaluateSetupQualityAdjustments(record, {displayedPlan, derivedStates});
  const planCheckState = planCheckStateForRecord(record, {
    effectivePlan:{
      entry:entryValue,
      stop:stopValue,
      firstTarget:targetValue
    },
    displayedPlan
  });
  const executionState = deriveExecutionPlanState(record, {
    exitMode:record.plan.exitMode,
    targetLevel:targetValue
  });
  const displayStage = displayStageForRecord(record);
  const liveEffectivePlan = {
    entry:entryValue,
    stop:stopValue,
    firstTarget:targetValue
  };
  const planUiState = getPlanUiState(record, {
    displayedPlan,
    effectivePlan:liveEffectivePlan,
    planCheckState:planCheckState
  });
  const setupUiState = getSetupUiState(record, {displayStage, planUiState});
  const planRealism = evaluatePlanRealism(record, {
    displayedPlan,
    derivedStates,
    qualityAdjustments,
    displayStage,
    setupUiState
  });
  const warningState = warningStateFromInputs(record, null, derivedStates);
  const avoidSubtype = avoidSubtypeForRecord(record, {
    derivedStates,
    displayedPlan,
    qualityAdjustments,
    finalVerdict:displayStage
  });
  const emojiPresentation = resolveEmojiPresentation(record, {
    context:'review',
    finalVerdict:displayStage,
    derivedStates,
    displayedPlan,
    qualityAdjustments,
    warningState,
    planUiState,
    setupUiState,
    avoidSubtype
  });
  const resolvedContract = resolveFinalStateContract(record, {
    context:'review',
    finalVerdict:displayStage,
    derivedStates,
    displayedPlan,
    qualityAdjustments,
    warningState,
    planUiState,
    setupUiState,
    avoidSubtype,
    emojiPresentation
  });
  const globalVerdict = resolveGlobalVerdict(record);
  const visualState = resolveVisualState(record, 'review', {
    resolvedContract,
    derivedStates,
    displayedPlan,
    setupScore:setupScoreForRecord(record)
  });
  const decisionSummary = visualState.decision_summary || '';
  const planUI = resolvePlanVisibility({
    state:visualState.finalVerdict,
    bounce_state:derivedStates.bounceState || (record && record.setup && record.setup.bounceState),
    structure:derivedStates.structureState || (record && record.setup && record.setup.structureState)
  });
  if(planStateBox) planStateBox.value = planUiState.label;
  const planQuality = planQualityForRr(displayedPlan.rewardRisk.valid ? displayedPlan.rewardRisk.rrRatio : null);
  if(planQualityBox) planQualityBox.value = planQuality || 'N/A';
  if($('rrRealismBox')) $('rrRealismBox').value = planRealism.rr_realism_label || 'Unavailable';
  if($('credibleRrBox')) $('credibleRrBox').value = Number.isFinite(planRealism.credible_rr) ? `${planRealism.credible_rr.toFixed(2)}R` : 'N/A';
  if($('optimisticTargetBox')) $('optimisticTargetBox').value = planRealism.optimistic_target_flag ? 'Yes' : 'No';
  if($('targetAssessmentBox')) $('targetAssessmentBox').value = planRealism.credible_target_assessment || 'N/A';
  if(planSourceBox) planSourceBox.value = String(record.plan.source || effectivePlan.source || '').trim() || 'manual';
  if(exitModeBox) exitModeBox.value = executionModeLabel(executionState.exitMode);
  if(triggerStateBox) triggerStateBox.value = triggerStateLabel(record.plan.triggerState);
  if(planValidationBox) planValidationBox.value = planValidationStateLabel(planCheckState);
  if(targetReviewStateBox) targetReviewStateBox.value = targetReviewStateLabel(executionState.targetReviewState);
  if(targetAlertBox){
    targetAlertBox.value = record.plan.targetAlert && record.plan.targetAlert.enabled
      ? `On @ ${Number.isFinite(executionState.targetAlertLevel) ? fmtPrice(Number(executionState.targetAlertLevel)) : 'n/a'}`
      : 'Off';
  }
  if($('tradeStatusBox')){
    const tradeStatusText = planUI.showPlan
      ? tradeStatusMetricText({globalVerdict:visualState, displayedPlan, resolvedContract})
      : {line1:planUI.diagnosticsMessage || 'Bounce is too weak to price cleanly.', line2:''};
    $('tradeStatusBox').innerHTML = renderTradeStatusMarkup(tradeStatusText);
  }
  if($('tradePlanInputs')) $('tradePlanInputs').classList.toggle('review-hidden', !planUI.showPlan);
  if($('capitalFitMetric')) $('capitalFitMetric').classList.toggle('review-hidden', !planUI.showCapital);
  if($('positionSizeStat')) $('positionSizeStat').classList.toggle('review-hidden', !planUI.showPositionSize);
  if($('positionCostStat')) $('positionCostStat').classList.toggle('review-hidden', !planUI.showPlan);
  if($('fxBasisBox')) $('fxBasisBox').classList.toggle('review-hidden', !planUI.showCapital);
  if($('planRealismSummary')) $('planRealismSummary').textContent = planUI.showPlan
    ? (planRealism.plan_realism_reason || 'Planner realism will appear after a complete plan is entered.')
    : nonPlanRealismSummaryText(planUI.diagnosticsMessage, decisionSummary);
  if($('planRealismReasons')) $('planRealismReasons').textContent = planUI.showPlan && planRealism.reasons && planRealism.reasons.length ? planRealism.reasons.slice(0, 2).join(' | ') : '';
}

function refreshSelectedTickerLifecycle(){
  const ticker = activeReviewTicker();
  if(!ticker) return;
  uiState.activeReviewVerdictOverride = '';
  const record = getTickerRecord(ticker);
  if(!record) return;
  const stage = record.plan.hasValidPlan ? 'planned' : ((record.review.manualReview || record.review.cardOpen) ? 'reviewed' : (record.watchlist.inWatchlist ? 'watchlist' : (record.scan.verdict && record.scan.verdict !== 'Avoid' ? 'shortlisted' : 'reviewed')));
  const days = stage === 'planned' ? PLAN_EXPIRY_TRADING_DAYS : (stage === 'reviewed' ? REVIEW_EXPIRY_TRADING_DAYS : WATCHLIST_EXPIRY_TRADING_DAYS);
  refreshLifecycleStage(record, stage, days, 'Lifecycle refreshed manually.', 'system');
  commitTickerState();
  renderReviewLifecycleSummary(ticker);
  renderWatchlist();
  renderCards();
}

function expireSelectedTickerLifecycle(){
  const ticker = activeReviewTicker();
  if(!ticker) return;
  const record = getTickerRecord(ticker);
  if(!record) return;
  setLifecycleStage(record, {
    stage:'expired',
    status:'stale',
    lockReason:'manual_expired',
    changedAt:new Date().toISOString(),
    expiresAt:todayIsoDate(),
    expiryReason:'Expired manually.',
    reason:'Expired manually.',
    source:'system'
  });
  commitTickerState();
  renderReviewLifecycleSummary(ticker);
  renderWatchlist();
  renderCards();
}

function reactivateSelectedTickerLifecycle(){
  const ticker = activeReviewTicker();
  if(!ticker) return;
  const record = getTickerRecord(ticker);
  if(!record) return;
  const stage = record.plan.hasValidPlan ? 'planned' : ((record.review.manualReview || record.review.cardOpen) ? 'reviewed' : (record.watchlist.inWatchlist ? 'watchlist' : 'shortlisted'));
  const days = stage === 'planned' ? PLAN_EXPIRY_TRADING_DAYS : (stage === 'reviewed' ? REVIEW_EXPIRY_TRADING_DAYS : WATCHLIST_EXPIRY_TRADING_DAYS);
  record.lifecycle.lockReason = '';
  refreshLifecycleStage(record, stage, days, 'Lifecycle reactivated manually.', 'system');
  commitTickerState();
  renderReviewLifecycleSummary(ticker);
  renderWatchlist();
  renderCards();
}

function calculate(options = {}){
  const persist = options.persist !== false;
  saveState();
  const ticker = activeReviewTicker();
  const entry = numericOrNull($('entryPrice').value);
  const stop = numericOrNull($('stopPrice').value);
  const target = numericOrNull($('targetPrice').value);
  const activeRecord = ticker ? normalizeTickerRecord(getTickerRecord(ticker) || upsertTickerRecord(ticker)) : null;
  const displayedPlan = applySetupConfirmationPlanGate(
    activeRecord || {},
    deriveCurrentPlanState($('entryPrice').value, $('stopPrice').value, $('targetPrice').value, activeRecord && activeRecord.marketData ? activeRecord.marketData.currency : '')
  );
  const plannerDerivedStates = analysisDerivedStatesFromRecord(activeRecord || {});
  const qualityAdjustments = evaluateSetupQualityAdjustments(activeRecord || {}, {
    displayedPlan,
    derivedStates:plannerDerivedStates
  });
  const executionState = deriveExecutionPlanState(activeRecord || {}, {
    exitMode:activeRecord && activeRecord.plan ? activeRecord.plan.exitMode : 'fixed_target',
    targetLevel:$('targetPrice').value
  });
  renderPlannerPlanSummary($('entryPrice').value, $('stopPrice').value, $('targetPrice').value, executionState.exitMode);
  if(ticker && persist){
    const record = upsertTickerRecord(ticker);
    applyPlanCandidateToRecord(record, {entry, stop, firstTarget:target}, {
      source:'planner',
      lastPlannedAt:new Date().toISOString()
    });
    if(record.watchlist && record.watchlist.inWatchlist){
      runWatchlistLifecycleEvaluation({
        source:'plan_update',
        tickers:[ticker],
        persist:false,
        render:false,
        force:true
      });
    }
    commitTickerState();
    if(record.watchlist && record.watchlist.inWatchlist){
      renderWatchlist();
      renderFocusQueue();
    }
    renderReviewLifecycleSummary(ticker);
  }
  syncPlanDisplayMeta();
  const displayStage = activeRecord ? displayStageForRecord(activeRecord) : 'Watch';
  const plannerPlanUiState = getPlanUiState(activeRecord || {}, {displayedPlan});
  const plannerSetupUiState = getSetupUiState(activeRecord || {}, {displayStage, planUiState:plannerPlanUiState});
  const planRealism = evaluatePlanRealism(activeRecord || {}, {
    displayedPlan,
    derivedStates:plannerDerivedStates,
    qualityAdjustments,
    displayStage,
    setupUiState:plannerSetupUiState
  });
  const warningState = warningStateFromInputs(activeRecord || {}, null, plannerDerivedStates);
  const avoidSubtype = avoidSubtypeForRecord(activeRecord || {}, {
    derivedStates:plannerDerivedStates,
    displayedPlan,
    qualityAdjustments,
    finalVerdict:displayStage
  });
  const emojiPresentation = resolveEmojiPresentation(activeRecord || {}, {
    context:'review',
    finalVerdict:displayStage,
    derivedStates:plannerDerivedStates,
    displayedPlan,
    qualityAdjustments,
    warningState,
    planUiState:plannerPlanUiState,
    setupUiState:plannerSetupUiState,
    avoidSubtype
  });
  const resolvedContract = resolveFinalStateContract(activeRecord || {}, {
    context:'review',
    finalVerdict:displayStage,
    derivedStates:plannerDerivedStates,
    displayedPlan,
    qualityAdjustments,
    warningState,
    planUiState:plannerPlanUiState,
    setupUiState:plannerSetupUiState,
    avoidSubtype,
    emojiPresentation
  });
  const globalVerdict = activeRecord ? resolveGlobalVerdict(activeRecord) : {allow_plan:false};
  const plannerVisualState = activeRecord ? resolveVisualState(activeRecord, 'review', {
    resolvedContract,
    derivedStates:plannerDerivedStates,
    displayedPlan,
    setupScore:setupScoreForRecord(activeRecord)
  }) : {finalVerdict:'monitor'};
  const plannerDecisionSummary = plannerVisualState && plannerVisualState.decision_summary ? plannerVisualState.decision_summary : '';
  const planUI = resolvePlanVisibility({
    state:plannerVisualState.finalVerdict,
    bounce_state:plannerDerivedStates.bounceState || (activeRecord && activeRecord.setup && activeRecord.setup.bounceState),
    structure:plannerDerivedStates.structureState || (activeRecord && activeRecord.setup && activeRecord.setup.structureState)
  });
  $('rewardPerShareBox').textContent = Number.isFinite(displayedPlan.rewardPerShare) ? displayedPlan.rewardPerShare.toFixed(2) : '-';
  const riskFitLabel = riskStatusLabel(displayedPlan.status === 'valid' ? displayedPlan.riskFit.risk_status : (displayedPlan.status === 'invalid' ? 'invalid_plan' : 'plan_missing'));
  const capitalUsage = capitalUsageAdvisory({
    positionCostGbp:displayedPlan.capitalFit.position_cost_gbp,
    positionCost:displayedPlan.capitalFit.position_cost,
    quoteCurrency:displayedPlan.capitalFit.quote_currency,
    accountSizeGbp:currentAccountSizeGbp()
  });
  const capitalComfort = capitalComfortSummary({
    capitalFit:displayedPlan.status === 'valid' ? displayedPlan.capitalFit.capital_fit : 'unknown',
    capitalNote:displayedPlan.capitalFit.capital_note,
    affordability:displayedPlan.status === 'valid' ? displayedPlan.affordability : '',
    capitalUsage,
    planStatus:displayedPlan.status,
    controlQuality:qualityAdjustments.controlQuality,
    capitalEfficiency:qualityAdjustments.capitalEfficiency
  });
  $('riskFitBox').textContent = `${riskFitLabel} / ${capitalComfort.label}`;
  if($('capitalComfortBox')) $('capitalComfortBox').textContent = capitalComfort.label;
  const capitalFitVisual = capitalFitPresentation({
    capitalFit:displayedPlan.capitalFit.capital_fit,
    affordability:displayedPlan.affordability,
    comfortLabel:capitalComfort.label
  });
  const tradeStatusText = planUI.showPlan
    ? tradeStatusMetricText({globalVerdict:plannerVisualState, displayedPlan, resolvedContract})
    : {line1:planUI.diagnosticsMessage || 'Bounce is too weak to price cleanly.', line2:''};
  if($('tradeStatusBox')) $('tradeStatusBox').innerHTML = renderTradeStatusMarkup(tradeStatusText);
  if($('tradePlanInputs')) $('tradePlanInputs').classList.toggle('review-hidden', !planUI.showPlan);
  if($('capitalFitMetric')){
    $('capitalFitMetric').className = `stat stat--capital-fit ${capitalFitVisual.className}${planUI.showCapital ? '' : ' review-hidden'}`.trim();
  }
  if($('positionSizeStat')) $('positionSizeStat').classList.toggle('review-hidden', !planUI.showPositionSize);
  if($('positionCostStat')) $('positionCostStat').classList.toggle('review-hidden', !planUI.showPlan);
  if($('fxBasisBox')) $('fxBasisBox').classList.toggle('review-hidden', !planUI.showCapital);
  if($('capitalFitBox')) $('capitalFitBox').textContent = capitalFitMetricText(capitalComfort.label);
  if($('fxBasisBox')) $('fxBasisBox').textContent = capitalComfort.note || 'No FX conversion note.';
  if($('capitalCheckBox')) $('capitalCheckBox').textContent = capitalComfort.note || 'Clear';
  if($('positionCostBox')){
    $('positionCostBox').textContent = Number.isFinite(displayedPlan.capitalFit.position_cost)
      ? `${Number(displayedPlan.capitalFit.position_cost.toFixed(2))}${displayedPlan.capitalFit.quote_currency ? ` ${displayedPlan.capitalFit.quote_currency}` : ''}`
      : '-';
  }
  if($('targetReviewStateBox')) $('targetReviewStateBox').value = targetReviewStateLabel(executionState.targetReviewState);
  if($('targetAlertBox')){
    $('targetAlertBox').value = executionState.exitMode === 'dynamic_exit'
      ? `On @ ${Number.isFinite(executionState.targetAlertLevel) ? fmtPrice(Number(executionState.targetAlertLevel)) : 'n/a'}`
      : 'Off';
  }
  if($('rrRealismBox')) $('rrRealismBox').value = planRealism.rr_realism_label || 'Unavailable';
  if($('credibleRrBox')) $('credibleRrBox').value = Number.isFinite(planRealism.credible_rr) ? `${planRealism.credible_rr.toFixed(2)}R` : 'N/A';
  if($('optimisticTargetBox')) $('optimisticTargetBox').value = planRealism.optimistic_target_flag ? 'Yes' : 'No';
  if($('targetAssessmentBox')) $('targetAssessmentBox').value = planRealism.credible_target_assessment || 'N/A';
  if($('planRealismSummary')) $('planRealismSummary').textContent = planUI.showPlan
    ? (planRealism.plan_realism_reason || 'Planner realism will appear after a complete plan is entered.')
    : nonPlanRealismSummaryText(planUI.diagnosticsMessage, plannerDecisionSummary);
  if($('planRealismReasons')) $('planRealismReasons').textContent = planUI.showPlan && planRealism.reasons && planRealism.reasons.length ? planRealism.reasons.slice(0, 2).join(' | ') : '';
  if(!planUI.showPlan){
    $('riskPerShare').textContent = '-';
    $('positionSize').textContent = '-';
    $('rrValue').textContent = 'No actionable plan yet.';
    $('rrValue').className = 'big';
    if($('plannerBox')) $('plannerBox').className = 'panelbox plannerbox plannerbox--rr-mid';
    $('calcNote').textContent = nonPlanCalcNoteText(planUI.diagnosticsMessage, plannerDecisionSummary);
    return;
  }
  if(displayedPlan.status === 'missing'){
    $('riskPerShare').textContent = '-';
    $('positionSize').textContent = '-';
    $('rrValue').textContent = 'No actionable plan yet.';
    $('rrValue').className = 'big';
    if($('plannerBox')) $('plannerBox').className = 'panelbox plannerbox plannerbox--rr-mid';
    $('calcNote').textContent = 'Add planned entry, stop, and first target to complete the trade plan.';
    return;
  }
  if(displayedPlan.status === 'invalid'){
    $('riskPerShare').textContent = '-';
    $('positionSize').textContent = '-';
    $('rrValue').textContent = 'No actionable plan yet.';
    $('rrValue').className = 'big';
    if($('plannerBox')) $('plannerBox').className = 'panelbox plannerbox plannerbox--rr-mid';
    $('calcNote').textContent = 'Planned entry, stop, and first target must form a valid long plan.';
    return;
  }
  $('riskPerShare').textContent = Number.isFinite(displayedPlan.riskFit.risk_per_share) ? displayedPlan.riskFit.risk_per_share.toFixed(2) : '-';
  $('positionSize').textContent = displayedPlan.riskFit.position_size > 0 ? `${displayedPlan.riskFit.position_size} shares` : '0 shares';
  $('rrValue').textContent = displayedPlan.rewardRisk.valid && Number.isFinite(displayedPlan.rewardRisk.rrRatio) ? `${displayedPlan.rewardRisk.rrRatio.toFixed(2)}R` : '-';
  $('rrValue').className = `big ${rrDisplayClass(displayedPlan.rewardRisk.rrRatio)}`.trim();
  if($('plannerBox')) $('plannerBox').className = `panelbox plannerbox ${plannerToneClass(displayedPlan.rewardRisk.rrRatio)}`.trim();
  $('calcNote').textContent = planRealism.plan_realism_reason || (displayedPlan.riskFit.risk_status === 'too_wide'
    ? `Stop would be too wide for ${formatPound(state.userRiskPerTrade || currentMaxLoss())} risk.`
    : (displayedPlan.capitalFit.capital_fit === 'too_expensive'
      ? `Risk fits ${formatGbp(displayedPlan.riskFit.max_loss)}, but the position cost is above the current account size.`
      : (displayedPlan.capitalFit.capital_fit === 'too_heavy'
        ? `Risk fits ${formatGbp(displayedPlan.riskFit.max_loss)}, but capital concentration is too high for this account size.`
        : (displayedPlan.capitalFit.capital_fit === 'heavy'
          ? `Risk fits ${formatGbp(displayedPlan.riskFit.max_loss)}, but capital usage is heavy for this account size.`
          : (displayedPlan.capitalFit.capital_fit === 'unknown'
            ? `Risk fits ${formatGbp(displayedPlan.riskFit.max_loss)}, but capital affordability is unavailable. ${displayedPlan.capitalFit.capital_note}`
            : `Current max loss is ${formatGbp(displayedPlan.riskFit.max_loss)}. Capital usage is ${capitalFitLabel(displayedPlan.capitalFit.capital_fit).toLowerCase()}.`)))));
}

async function copyText(text){
  try{
    if(navigator.clipboard && window.isSecureContext){
      await navigator.clipboard.writeText(text);
      return true;
    }
  }catch(e){}
  try{
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  }catch(e){
    return false;
  }
}

function resetAllData(){
  safeStorageRemove(key);
  safeStorageRemove(marketCacheKey);
  marketDataCache.clear();
  Object.assign(state, createDefaultState());
  uiState.activeReviewAddsToScannerUniverse = true;
  uiState.activeReviewVerdictOverride = '';
  clearScannerSessionState({suppressed:false});
  uiState.promptOpen = {};
  uiState.responseOpen = {};
  uiState.loadingTicker = '';
  uiState.selectedScanner = {};
  $('tickerInput').value = '';
  $('tickerSearch').value = '';
  renderTickerSuggestions([]);
  loadState();
  resetReview();
  setStatus('inputStatus', '<span class="ok">All local app data and cached market data were reset.</span>');
  setStatus('apiStatus', 'API settings were reset to defaults.');
}

const resetNoticeKey = 'pullbackPlaybookResetNotice';

function setResetStatus(message, className = 'ok'){
  const markup = `<span class="${className}">${escapeHtml(message)}</span>`;
  setStatus('resetStatus', markup);
  setStatus('inputStatus', markup);
}

function renderAppFromState(options = {}){
  const resetReviewSelection = options.resetReviewSelection !== false;
  if(resetReviewSelection) uiState.activeReviewTicker = '';
  renderStats();
  updateTickerInputFromState();
  renderTickerSuggestions([]);
  renderTickerQuickLists();
  renderFinalUniversePreview();
  renderSavedScannerUniverseSnapshot();
  renderScannerDebug();
  renderScannerResults();
  renderFocusQueue();
  renderCards();
  renderWatchlist();
  renderWorkflowAlerts();
  renderTradeDiary();
  renderPatternAnalytics();
  renderPlannerPlanSummary();
  renderReviewWorkspace();
  renderReviewLifecycleSummary(activeReviewTicker());
  updateTickerSearchStatus();
}

function clearTransientSessionState(options = {}){
  const persist = options.persist !== false;
  const clearScannerCache = options.clearScannerCache !== false;
  const suppressScannerShortlist = options.suppressScannerShortlist === true;
  const clearPersistedShortlistState = options.clearPersistedShortlistState !== false;
  const preserveSavedReviewCards = options.preserveSavedReviewCards === true;
  uiState.activeReviewTicker = '';
  uiState.activeReviewAddsToScannerUniverse = true;
  uiState.activeReviewVerdictOverride = '';
  uiState.loadingTicker = '';
  uiState.selectedScanner = {};
  uiState.promptOpen = {};
  uiState.responseOpen = {};
  uiState.reviewAnalysisCache = {};
  clearScannerSessionState({suppressed:suppressScannerShortlist});
  if(clearPersistedShortlistState){
    state.tickers = [];
    state.scannerResults = [];
    state.cards = [];
    state.scannerDebug = [];
  }
  state.dismissedFocusTickers = [];
  state.dismissedFocusCycle = '';
  state.activeQueueClearedCycle = '';
  state.activeQueueClearedTickers = [];
  state.activeQueueManualTickers = [];
  state.activeQueueLastRebuiltCycle = '';
  if($('selectedTicker')) $('selectedTicker').value = '';
  if(clearScannerCache){
    Object.values(state.tickerRecords || {}).forEach(record => {
      clearScannerProjectionState(record);
      if(record && record.review){
        const hasSavedReview = !!(
          (record.review.manualReview && typeof record.review.manualReview === 'object')
          || String(record.review.savedVerdict || '').trim()
          || String(record.review.savedSummary || '').trim()
          || Number.isFinite(numericOrNull(record.review.savedScore))
        );
        record.review.cardOpen = preserveSavedReviewCards && hasSavedReview;
      }
    });
  }else{
    Object.values(state.tickerRecords || {}).forEach(record => {
      if(record && record.review){
        record.review.cardOpen = false;
      }
    });
  }
  if($('tickerSearch')) $('tickerSearch').value = '';
  if($('tvImportInput')) $('tvImportInput').value = '';
  clearOcrReview('OCR review cleared.');
  if(persist){
    commitTickerState();
  }
  renderAppFromState({resetReviewSelection:true});
}

async function clearPlaybookCaches(){
  marketDataCache.clear();
  fxRateCache.clear();
  fxRatePending.clear();
  safeStorageRemove(marketCacheKey);
  safeStorageRemove(savedScannerUniverseKey);
  safeStorageRemove(savedScannerUniverseMetaKey);
  try{
    const localKeys = [];
    for(let i = 0; i < localStorage.length; i += 1){
      const storageKey = localStorage.key(i);
      if(/^pp_/i.test(String(storageKey || '')) || /pullbackplaybook/i.test(String(storageKey || ''))){
        localKeys.push(storageKey);
      }
    }
    localKeys
      .filter(storageKey => ![key, resetNoticeKey].includes(storageKey))
      .forEach(storageKey => safeStorageRemove(storageKey));
  }catch(error){}
  try{
    const sessionKeys = [];
    for(let i = 0; i < sessionStorage.length; i += 1){
      const storageKey = sessionStorage.key(i);
      if(/^pp_/i.test(String(storageKey || '')) || /pullbackplaybook/i.test(String(storageKey || ''))){
        sessionKeys.push(storageKey);
      }
    }
    sessionKeys.forEach(storageKey => {
      try{ sessionStorage.removeItem(storageKey); }catch(error){}
    });
  }catch(error){}
  if('caches' in window){
    try{
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys
        .filter(cacheName => /pullback-playbook/i.test(String(cacheName || '')))
        .map(cacheName => caches.delete(cacheName)));
    }catch(error){}
  }
}

function captureActiveReviewWorkspaceDraft(){
  const ticker = activeReviewTicker();
  if(!ticker || !$('reviewWorkspace') || !$('selectedTicker')) return null;
  return {
    ticker,
    notes:$('reviewNotes') ? $('reviewNotes').value : '',
    checks:currentChecks(),
    entry:$('entryPrice') ? $('entryPrice').value : '',
    stop:$('stopPrice') ? $('stopPrice').value : '',
    target:$('targetPrice') ? $('targetPrice').value : ''
  };
}

function inferRisksFromAnalysisText(chartRead, reasons = []){
  const text = `${chartRead || ''} ${(reasons || []).join(' ')}`.toLowerCase();
  const risks = [];
  if(text.includes('weakening structure')) risks.push('Structure is weakening');
  if(text.includes('low volume') || text.includes('volume is low') || text.includes('weak volume')) risks.push('Weak volume may indicate lack of conviction');
  if(text.includes('market below 50ma') || text.includes('hostile market')) risks.push('Overall market below 50MA');
  if(text.includes('deeper than preferred')) risks.push('Pullback is deeper than preferred');
  if(text.includes('cautious')) risks.push('Setup requires caution');
  return [...new Set(risks)].slice(0, 3);
}

function buildPromptBody(payload){
  const chartAttached = payload.chartAttached === true || payload.chartAttached === 'yes';
  const chartStatus = ['match','mismatch','unclear'].includes(String(payload.chartMatchStatus || '').trim().toLowerCase())
    ? String(payload.chartMatchStatus || '').trim().toLowerCase()
    : 'unclear';
  const chartWarning = String(payload.chartMatchWarning || '').trim();
  const lines = [
    'Quality Pullback setup. Return JSON only.',
    '',
    'You are analysing a stock for a swing-trading Quality Pullback strategy.',
    '',
    'Goal:',
    'Identify strong stocks in uptrends that are pulling back toward support (20MA or 50MA) and assess whether they are Watch, Near Entry, Entry, or Avoid.',
    '',
    'Context:',
    `ticker=${payload.ticker}`,
    `market_status=${payload.marketStatus}`,
    `scan_type=${payload.scanType}`,
    `account_size_gbp=${payload.accountSize}`,
    `max_loss_gbp=${payload.maxRisk}`,
    `chart_attached=${chartAttached ? 'yes' : 'no'}`,
    `chart_filename=${payload.chartFileName || 'none'}`,
    `app_verdict_ceiling=${payload.appVerdictCeiling || 'Watch'}`,
    '',
    'Inputs:',
    `trend_state=${payload.trendState}`,
    `pullback_zone=${payload.pullbackZone}`,
    `structure_state=${payload.structureState}`,
    `stabilisation_state=${payload.stabilisationState}`,
    `bounce_state=${payload.bounceState}`,
    `volume_state=${payload.volumeState}`,
    `entry_defined=${payload.entryDefined}`,
    `stop_defined=${payload.stopDefined}`,
    `target_defined=${payload.targetDefined}`,
    '',
    'Guidance:',
    '',
    'Trend:',
    '- Prefer strong or acceptable trends',
    '- Avoid weak or broken trends',
    '',
    'Pullback:',
    '- Prefer price near 20MA (shallow) or 50MA (deeper)',
    '- Avoid extended or broken pullbacks',
    '',
    'Stabilisation:',
    '- none = still falling / volatile',
    '- early = momentum slowing, smaller candles',
    '- clear = base forming / higher lows',
    '',
    'Bounce:',
    '- attempt = first reaction / wick / green candle',
    '- confirmed = follow-through move',
    '',
    'Scan-type rules:',
    '',
    'If scan_type=20MA:',
    '- Expect shallow pullbacks near 20MA',
    '- Require stabilisation or bounce for Near Entry',
    '- Require bounce or confirmation for Entry',
    '',
    'If scan_type=50MA:',
    '- Expect deeper pullbacks near 50MA',
    '- Allow Watch without stabilisation',
    '- Require stabilisation for Near Entry',
    '- Require bounce or confirmation for Entry',
    '',
    'Hard fail -> Avoid if:',
    '- structure_state = broken',
    '- trend_state = broken',
    '- stop_defined = no',
    '- target_defined = no',
    '',
    'Do NOT automatically mark Avoid just because stabilisation is missing.',
    '',
    'Trade plan:',
    '- Always propose entry, stop, and first_target for any analyzable setup, even for Watch or Near Entry',
    '- Use conditional trigger levels when the setup is early rather than leaving plan fields blank',
    '- Entry should be logical (reclaim, bounce, breakout, or continuation trigger)',
    '- Stop should sit below support, the pullback low, or the invalidation level',
    '- First target should be prior swing high or logical resistance',
    `- Must respect ${formatPound(payload.maxRisk)} max loss`,
    '- Respect entry / stop / target values as constraints',
    '- If plan is invalid, too wide, heavy, or unaffordable, do NOT promote setup',
    '- High reward:risk does NOT justify upgrading a weak setup',
    '- Structure and confirmation take priority over reward',
    '',
    'Structured output discipline:',
    '- If your chart read contains cautionary language, you must include corresponding bullet items in risks',
    '- Do not return an empty risks array when you have described meaningful concerns in the chart read',
    '- weakening structure -> include a risk about weakening structure',
    '- low volume -> include a risk about weak volume / low conviction',
    '- market below 50MA -> include a risk about hostile market regime',
    '- pullback deeper than preferred -> include a risk about setup quality / depth of pullback',
    '- key_reasons explains what is constructive',
    '- risks explains what could go wrong or why caution is warranted',
    '- If the setup is cautious overall, at least one item should appear in risks',
    '- High reward:risk does not erase risks; meaningful concerns must still appear in risks',
    '- Keep risks concise, factual, and non-duplicative',
    '',
    'Chart verification:',
    '- If a chart image is attached, first check whether it plausibly matches the supplied ticker',
    '- If the uploaded chart looks like a different ticker/symbol, flag that strongly',
    '- A likely ticker/chart mismatch should be treated as Avoid until corrected',
    `- Current chart_match_status context: ${chartStatus}`,
    `- Current chart_match_warning context: ${chartWarning || 'none'}`,
    '',
    'Output keys:',
    'setup_type',
    'plain_english_chart_read',
    'chart_match_status',
    'chart_match_warning',
    'entry',
    'stop',
    'first_target',
    'risk_per_share',
    'position_size',
    'reward_risk',
    'quality_score',
    'confidence_score',
    'key_reasons',
    'risks',
    'verdict',
    'final_verdict',
    '',
    'Rules:',
    '- verdict must be: Watch | Near Entry | Entry | Avoid',
    '- Do NOT return a verdict above app_verdict_ceiling',
    '- If app_verdict_ceiling = Watch, only Watch or Avoid are allowed',
    '- If app_verdict_ceiling = Near Entry, only Near Entry, Watch, or Avoid are allowed',
    '- If app_verdict_ceiling = Entry, downgrade if needed but do not exceed Entry',
    '- quality_score = integer 1-10',
    '- confidence_score = integer 1-100',
    '- chart_match_status must be: match | mismatch | unclear',
    '- if chart_match_status = mismatch, final_verdict should be Avoid',
    '- risks must always be present as an array',
    '- risks: array of concise risk items that match the cautionary content in the chart read',
    '- Do not output an empty risks array if you mention caution, weak structure, weak volume, hostile market, deeper-than-preferred pullback, incomplete confirmation, or similar concerns anywhere else in the response',
    '- Only use an empty risks array if the setup is genuinely clean and low-risk relative to the strategy',
    '- If unknown -> null',
    '- Keep explanations short and practical'
  ];
  if(payload.notes !== undefined){
    lines.push('', payload.notes ? `Notes:\n${payload.notes}` : 'Notes: none');
  }
  if(payload.marketData !== undefined){
    lines.push(payload.marketData ? `Market data: ${JSON.stringify(payload.marketData)}` : 'Market data: none');
  }
  lines.push('', 'Return valid JSON only.');
  return lines;
}

function executionCapitalBlocked(displayedPlan){
  const plan = displayedPlan && typeof displayedPlan === 'object' ? displayedPlan : {};
  const capitalFit = capitalFitForPlan(plan);
  return capitalFit === 'too_heavy'
    || capitalFit === 'too_expensive'
    || plan.affordability === 'not_affordable'
    || plan.tradeability === 'too_expensive';
}

function restoreActiveReviewWorkspaceDraft(draft){
  if(!draft || !draft.ticker || activeReviewTicker() !== draft.ticker) return;
  if($('reviewNotes')) $('reviewNotes').value = draft.notes || '';
  checklistIds.forEach(id => {
    if($(id)) $(id).checked = !!(draft.checks && draft.checks[id]);
  });
  if($('entryPrice')) $('entryPrice').value = draft.entry || '';
  if($('stopPrice')) $('stopPrice').value = draft.stop || '';
  if($('targetPrice')) $('targetPrice').value = draft.target || '';
  refreshReview();
  calculate({persist:false});
}

function refreshViewFromMemory(){
  syncCardDraftsFromDom();
  const reviewDraft = captureActiveReviewWorkspaceDraft();
  renderAppFromState({resetReviewSelection:false});
  restoreActiveReviewWorkspaceDraft(reviewDraft);
  setResetStatus('View refreshed from current in-memory state.');
}

function clearSessionState(){
  clearTransientSessionState({
    persist:false,
    clearScannerCache:false,
    suppressScannerShortlist:true,
    clearPersistedShortlistState:false
  });
  setResetStatus('Cleared session-only shortlist, queue, OCR, debug, and active review state.');
}

async function hardResetCachedAppState(){
  if(!window.confirm('Hard reset cached shortlist/review state on this device? Watchlist, diary, saved reviews, and settings will be kept.')) return;
  clearTransientSessionState({persist:true, clearScannerCache:true, preserveSavedReviewCards:true});
  safeStorageSet(resetNoticeKey, {
    message:'Hard reset complete. Cleared cached shortlist, review workspace, scanner snapshots, and app caches.',
    createdAt:new Date().toISOString()
  });
  await clearPlaybookCaches();
  window.location.reload();
}

function consumeResetNotice(){
  const notice = safeStorageGet(resetNoticeKey, null);
  if(!notice || !notice.message) return;
  safeStorageRemove(resetNoticeKey);
  setResetStatus(String(notice.message), 'ok');
}

function registerPwa(){
  if(!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    const buildVersion = String(window.__BUILD_VERSION__ || APP_VERSION || 'v4');
    const reloadGuardKey = `pp_sw_reload_once_${buildVersion}`;
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if(refreshing) return;
      if(sessionStorage.getItem(reloadGuardKey)) return;
      refreshing = true;
      sessionStorage.setItem(reloadGuardKey, '1');
      window.location.reload();
    });
    navigator.serviceWorker.register(`./service-worker.js?v=${encodeURIComponent(buildVersion)}`, {updateViaCache:'none'}).then(registration => {
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if(!worker) return;
        worker.addEventListener('statechange', () => {
          if(worker.state === 'installed' && navigator.serviceWorker.controller){
            console.info('PWA update installed and will apply on the next load.', {buildVersion});
          }
        });
      });
      registration.update().catch(() => {});
    }).catch(() => {});
  });
}

click('addTickerBtn', addTickerFromSearch);
click('buildBtn', buildCards);
click('saveBtn', saveScannerUniverseList);
click('loadBtn', loadSavedScannerUniverseList);
click('clearFocusBtn', () => {
  clearActiveQueueForToday();
  renderFocusQueue();
});
click('importTvBtn', importTradingViewTickers);
click('importScreenshotBtn', () => { if($('ocrImportFile')) $('ocrImportFile').click(); });
click('applyOcrBtn', applyOcrTickers);
click('clearOcrBtn', () => clearOcrReview('OCR review cleared.'));
click('clearBtn', () => {
  const before = queueDebugSnapshot();
  $('tickerInput').value = '';
  if($('tvImportInput')) $('tvImportInput').value = '';
  $('tickerSearch').value = '';
  state.tickers = [];
  state.scannerResults = [];
  state.cards = [];
  state.scannerDebug = [];
  state.listName = "Today's Scan";
  uiState.promptOpen = {};
  uiState.responseOpen = {};
  uiState.selectedScanner = {};
  clearScannerSessionState({suppressed:false});
  Object.values(state.tickerRecords || {}).forEach(clearScannerProjectionState);
  renderTickerSuggestions([]);
  // Scanner clear should remain isolated from canonical watchlist/review records.
  // Clear the canonical scanner/card projections first, then persist.
  commitTickerState();
  renderTickerQuickLists();
  renderTvImportPreview([], 'default');
  renderFinalUniversePreview();
  renderSavedScannerUniverseSnapshot();
  renderScannerDebug();
  clearOcrReview('OCR review cleared. Scanner universe is ready for repopulation.');
  renderScannerResults();
  renderCards();
  resetReview();
  setStatus('inputStatus', 'Scanner universe cleared.');
  updateTickerSearchStatus();
  logQueueMutation('CLEAR_SCANNER_UNIVERSE', before);
});
click('refreshViewBtn', refreshViewFromMemory);
click('clearSessionBtn', clearSessionState);
click('hardResetAppBtn', () => { hardResetCachedAppState().catch(() => setResetStatus('Hard reset could not complete cleanly.', 'warntext')); });
click('resetAllBtn', () => {
  if(!window.confirm('Are you sure? This resets the app and clears locally saved data on this device.')) return;
  resetAllData();
});
click('saveApiBtn', () => { saveState(); setStatus('apiStatus', '<span class="ok">API settings saved on this device.</span>'); });
click('testApiBtn', testApiConnection);
click('clearRuntimeDebugBtn', clearRuntimeDebugLog);
click('marketStatusPill', () => setControlFocus('market'));
click('accountRiskPill', () => setControlFocus('account'));
click('scannerModePill', () => setControlFocus('mode'));
click('setupTypePill', () => setControlFocus('setup'));
click('jumpToDiaryBtn', () => {
  const diarySection = $('diarySection');
  if(diarySection) diarySection.scrollIntoView({behavior:'smooth', block:'start'});
});
click('markAlertsSeenBtn', markAlertsSeen);
click('exportDiaryBtn', exportTradeDiary);
on('resultsToggle', 'toggle', syncResultsToggleLabel);
click('saveReviewBtn', saveReview);
click('analyseActiveBtn', analyseActiveReviewTicker);
click('addWatchlistActiveBtn', addActiveReviewTickerToWatchlist);
click('saveTradeActiveBtn', saveActiveReviewTickerTrade);
click('resetReviewBtn', resetReview);
click('refreshLifecycleBtn', refreshSelectedTickerLifecycle);
click('expireLifecycleBtn', expireSelectedTickerLifecycle);
click('reactivateLifecycleBtn', reactivateSelectedTickerLifecycle);
click('calcBtn', calculate);
function attemptScanCardActivation(ticker, sourceVerdict){
  const menuState = currentScanCardMenuState(ticker);
  if(menuState.menuOpen){
    closeScanCardMenu();
    renderScannerResults();
    suppressNextScannerActivation(ticker);
    return false;
  }
  if(!allowScannerActivation(ticker)) return false;
  openRankedResultInReview(ticker, {sourceVerdict});
  return true;
}

on('results', 'click', event => {
  if(event.defaultPrevented) return;
  if(event.target.closest('.card-overflow-menu') || event.target.closest('[data-act="overflow-toggle"]') || event.target.closest('.scan-card-secondary-panel') || event.target.closest('.no-card-click') || event.target.closest('summary')) return;
  const card = event.target.closest('.scan-card');
  if(!card) return;
  const ticker = normalizeTicker(card.getAttribute('data-ticker') || '');
  if(!ticker) return;
  const sourceVerdict = card.getAttribute('data-source-verdict') || '';
  setScannerCardClickTrace(ticker, 'results.click', `sourceVerdict=${sourceVerdict || '(none)'}`);
  const menuState = currentScanCardMenuState(ticker);
  if(menuState.menuOpen){
    closeScanCardMenu();
    renderScannerResults();
    suppressNextScannerActivation(ticker);
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if(currentScanCardSecondaryUi(ticker)){
    setScannerCardClickTrace(ticker, 'results.click.cleared_secondary_ui', `mode=${currentScanCardSecondaryUi(ticker) || '(none)'}`);
    clearScanCardSecondaryUi();
    renderScannerResults();
    return;
  }
  if(!attemptScanCardActivation(ticker, sourceVerdict)){
    event.preventDefault();
    event.stopPropagation();
    return;
  }
});
on('results', 'keydown', event => {
  if(event.defaultPrevented) return;
  if(event.key !== 'Enter' && event.key !== ' ') return;
  if(event.target.closest('.card-overflow-menu') || event.target.closest('[data-act="overflow-toggle"]') || event.target.closest('.scan-card-secondary-panel') || event.target.closest('.no-card-click') || event.target.closest('summary')) return;
  const card = event.target.closest('.scan-card');
  if(!card) return;
  const ticker = normalizeTicker(card.getAttribute('data-ticker') || '');
  if(!ticker) return;
  const sourceVerdict = card.getAttribute('data-source-verdict') || '';
  event.preventDefault();
  setScannerCardClickTrace(ticker, 'results.keydown', `key=${event.key} sourceVerdict=${sourceVerdict || '(none)'}`);
  if(currentScanCardSecondaryUi(ticker)){
    setScannerCardClickTrace(ticker, 'results.keydown.cleared_secondary_ui', `mode=${currentScanCardSecondaryUi(ticker) || '(none)'}`);
    clearScanCardSecondaryUi();
    renderScannerResults();
    return;
  }
  openRankedResultInReview(ticker, {sourceVerdict});
});
document.addEventListener('click', event => {
  if(event.target.closest('.card-overflow-menu') || event.target.closest('[data-act="overflow-toggle"]') || event.target.closest('.scan-card-secondary-panel')) return;
  if(event.target.closest('.scan-card')){
    if(uiState.scanCardMenu && uiState.scanCardMenu.menuOpen){
      closeScanCardMenu();
      renderScannerResults();
    }
    return;
  }
  if(uiState.scanCardMenu && uiState.scanCardMenu.menuOpen){
    closeScanCardMenu();
    renderScannerResults();
  }
});

on('tickerSearch', 'keydown', event => {
  if(event.key === 'Enter'){
    event.preventDefault();
    addTickerFromSearch();
  }
});
on('tickerSearch', 'input', () => {
  updateTickerSearchStatus();
  queueTickerSuggestions();
});
on('tickerSearch', 'blur', () => setTimeout(() => renderTickerSuggestions([]), 150));
on('ocrImportFile', 'change', event => {
  const file = event.target.files && event.target.files[0];
  runOcrImport(file).catch(() => {});
  event.target.value = '';
});
on('ocrReviewInput', 'input', syncOcrReviewVisibility);
{
  const rail = $('controlFocusRail');
  if(rail){
    let focusRailTimer = 0;
    const markGestureStart = () => {
      uiState.controlRailGestureStartIndex = currentControlFocusRailIndex(rail);
      uiState.controlRailGestureStartLeft = rail.scrollLeft;
      uiState.controlRailActiveIndex = uiState.controlRailGestureStartIndex;
    };
    rail.addEventListener('touchstart', markGestureStart, {passive:true});
    rail.addEventListener('pointerdown', markGestureStart, {passive:true});
    rail.addEventListener('mousedown', markGestureStart, {passive:true});
    rail.addEventListener('scroll', () => {
      updateControlFocusRailVisuals(rail);
      clearTimeout(focusRailTimer);
      focusRailTimer = setTimeout(() => {
        detectFocusedRailItem();
        snapControlFocusRail(rail);
      }, 90);
    }, {passive:true});
    updateControlFocusRailVisuals(rail);
  }
}
bindRiskQuickControls();
on('tickerInput', 'input', () => {
  syncUniverseFromInputs();
  if(!uniqueTickers(state.tickers || []).length){
    state.universeMode = 'core8';
    if($('universeMode')) $('universeMode').value = 'core8';
  }
  commitTickerState();
  renderTickerQuickLists();
  renderTvImportPreview(state.tickers && state.tickers.length ? state.tickers : [], state.tickers && state.tickers.length ? 'manual' : 'default');
  renderFinalUniversePreview();
});
on('showExpiredWatchlist', 'change', () => {
  saveState();
  renderWatchlist();
});
on('universeMode', 'change', () => {
  saveState();
  renderFinalUniversePreview();
});

['accountSize','riskPercent','maxLossOverride'].forEach(id => on(id, 'change', () => {
  saveState();
  refreshRiskContextForActiveSetups();
}));
on('marketStatus', 'change', () => {
  state.marketStatusMode = 'manual';
  state.marketStatusAutoUpdatedAt = '';
  if($('marketStatusMode')) $('marketStatusMode').value = 'manual';
  saveState();
  refreshRiskContextForActiveSetups({
    source:'market_status',
    force:true
  });
});
on('marketStatusMode', 'change', () => {
  state.marketStatusMode = normalizeMarketStatusMode($('marketStatusMode').value);
  if(state.marketStatusMode !== 'auto') state.marketStatusAutoUpdatedAt = '';
  saveState();
  if(state.marketStatusMode === 'auto'){
    refreshAutomaticMarketStatus({force:true});
  }else{
    refreshRiskContextForActiveSetups({
      source:'market_status',
      force:true
    });
  }
});
on('scannerSetupType', 'change', () => {
  saveState();
  renderFinalUniversePreview();
  setStatus('inputStatus', 'Setup mode updated for future scans only. Existing results keep their stored scan context until rescanned.');
});
on('wholeSharesOnly', 'change', () => {
  saveState();
  refreshRiskContextForActiveSetups();
});
['listName','apiKey','dataProvider','apiPlan','aiEndpoint'].forEach(id => on(id, 'change', saveState));
on('dataProvider', 'change', () => {
  renderTickerSuggestions([]);
  renderFinalUniversePreview();
  updateTickerSearchStatus();
  updateProviderStatusNote();
});
on('selectedTicker', 'change', () => {
  const ticker = activeReviewTicker();
  if(ticker && getTickerRecord(ticker)) loadCard(ticker);
});
document.querySelectorAll('.logic').forEach(el => el.addEventListener('change', refreshReview));
['entryPrice','stopPrice','targetPrice'].forEach(id => on(id, 'input', calculate));

function primaryVerdictBadge(verdict){
  const safeVerdict = normalizeAnalysisVerdict(verdict || '');
  if(safeVerdict === 'Entry') return {label:'\uD83D\uDE80 Entry', className:'ready'};
  if(safeVerdict === 'Near Entry') return {label:'\uD83C\uDFAF Near Entry', className:'near'};
  if(safeVerdict === 'Avoid') return {label:'\u26D4 Avoid', className:'avoid'};
  return {label:'\uD83E\uDDD0 Monitor', className:'watch'};
}

function normalizeGlobalVerdictKey(verdict){
  return normalizeGlobalVerdictKeyImpl(verdict);
}

function normalizeVerdict(verdict){
  return normalizeVerdictImpl(verdict);
}

function globalVerdictLabel(finalVerdict){
  return globalVerdictLabelImpl(finalVerdict);
}

function getTone(finalVerdict){
  return getToneImpl(finalVerdict);
}

function getBucket(finalVerdict){
  return getBucketImpl(finalVerdict);
}

function getBadge(finalVerdict){
  return getBadgeImpl(finalVerdict);
}

function getActions(finalVerdict){
  return getActionsImpl(finalVerdict);
}

function baseVerdictFromResolvedContract(resolved){
  return baseVerdictFromResolvedContractImpl(resolved, {
    normalizeAnalysisVerdict
  });
}

function resolverSeedVerdictForRecord(record){
  return resolverSeedVerdictForRecordImpl(record, {
    normalizeAnalysisVerdict,
    baseVerdictForRecord
  });
}

function resolveFinalStateContract(record, options = {}){
  const item = record && typeof record === 'object' ? record : {};
  const finalVerdict = normalizeAnalysisVerdict(options.finalVerdict || resolverSeedVerdictForRecord(item));
  const derivedStates = options.derivedStates || analysisDerivedStatesFromRecord(item);
  const effectivePlan = options.effectivePlan || effectivePlanForRecord(item, {allowScannerFallback:true});
  const displayedPlan = options.displayedPlan || deriveCurrentPlanState(
    effectivePlan.entry,
    effectivePlan.stop,
    effectivePlan.firstTarget,
    item.marketData && item.marketData.currency
  );
  const planCheckState = options.planCheckState || planCheckStateForRecord(item, {effectivePlan, displayedPlan});
  const qualityAdjustments = options.qualityAdjustments || evaluateSetupQualityAdjustments(item, {
    displayedPlan,
    derivedStates,
    displayStage:finalVerdict,
    baseVerdict:finalVerdict
  });
  const warningState = options.warningState || evaluateWarningState(item, getReviewAnalysisState(item).normalizedAnalysis);
  const planUiState = options.planUiState || getPlanUiState(item, {displayedPlan, effectivePlan, planCheckState, derivedStates, displayStage:finalVerdict});
  const setupUiState = options.setupUiState || getSetupUiState(item, {displayStage:finalVerdict, derivedStates, planUiState});
  const avoidSubtype = options.avoidSubtype || avoidSubtypeForRecord(item, {derivedStates, displayedPlan, qualityAdjustments, finalVerdict});
  const deadCheck = options.deadCheck || isTerminalDeadSetup(item, {derivedStates, displayedPlan});
  const structureState = String(derivedStates.structureState || '').toLowerCase();
  const trendState = String(derivedStates.trendState || '').toLowerCase();
  const bounceState = String(derivedStates.bounceState || '').toLowerCase();
  const volumeState = String(derivedStates.volumeState || '').toLowerCase();
  const currentPrice = numericOrNull(item.marketData && item.marketData.price);
  const stop = numericOrNull(item.plan && item.plan.stop);
  const brokenBelowStop = Number.isFinite(currentPrice) && Number.isFinite(stop) && currentPrice <= stop;
  const marketWeak = !!(
    qualityAdjustments.weakRegimePenalty
    || item.setup.marketCaution
    || isHostileMarketStatus((item.meta && item.meta.marketStatus) || state.marketStatus)
  );
  const positionSize = numericOrNull(displayedPlan.riskFit && displayedPlan.riskFit.position_size);
  const riskStatus = String(displayedPlan.riskFit && displayedPlan.riskFit.risk_status || '').toLowerCase();
  const affordability = String(displayedPlan.affordability || '').toLowerCase();
  const tradeability = String(displayedPlan.tradeability || '').toLowerCase();
  const zeroShares = !Number.isFinite(positionSize) || positionSize < 1;
  const riskTooWide = riskStatus === 'too_wide' || (zeroShares && displayedPlan.status === 'valid');
  const capitalBlocked = executionCapitalBlocked(displayedPlan);
  const capitalHeavy = executionCapitalHeavy(displayedPlan);
  const weakVolume = volumeState === 'weak';
  const weakControl = !!(qualityAdjustments.lowControlSetup || qualityAdjustments.tooWideForQualityPullback);
  const bounceUnconfirmed = ['none','unconfirmed','attempt','early'].includes(bounceState);
  const hardStructureBroken = !!(
    deadCheck.dead
    || structureState === 'broken'
    || trendState === 'broken'
    || brokenBelowStop
  );

  const hasPlanValues = !!(
    effectivePlan
    && effectivePlan.entry != null
    && effectivePlan.stop != null
    && effectivePlan.firstTarget != null
  );

  let planStateKey = 'valid';
  if(!hasPlanValues || planUiState.state === 'missing') planStateKey = 'missing';
  else if(planUiState.state === 'invalid') planStateKey = 'invalid';
  else if(planUiState.state === 'needs_adjustment' || riskTooWide || capitalBlocked || capitalHeavy) planStateKey = 'needs_adjustment';
  else if(planUiState.state === 'unrealistic_rr') planStateKey = 'unrealistic_rr';
  const rrResolution = options.rrResolution || {
    rr_label:planStateKey !== 'valid' ? 'Invalid plan' : 'Low confidence',
    rawResolverVerdict:finalVerdict,
    status:finalVerdict,
    remapReason:''
  };

  const planStatusLabel = ({
    missing:'Missing plan',
    invalid:'Invalid plan',
    needs_adjustment:'Needs adjustment',
    unrealistic_rr:'Unrealistic R:R',
    valid:'Valid plan'
  })[planStateKey] || (planUiState.label || 'Valid plan');

  let structuralStateKey = 'developing';
  if(hardStructureBroken){
    structuralStateKey = 'dead';
  }else if(finalVerdict === 'Entry' && !bounceUnconfirmed && !weakVolume && !marketWeak && !weakControl && planStateKey === 'valid'){
    structuralStateKey = 'entry';
  }else if(finalVerdict === 'Near Entry' && !bounceUnconfirmed && !weakVolume){
    structuralStateKey = 'near_entry';
  }

  let actionStateKey = 'wait_for_confirmation';
  let actionLabel = 'Hold for confirmation';
  let actionTone = 'warning';
  let blockerCode = '';
  let blockerReason = '';
  const reasonParts = [];
  const addReason = value => {
    const text = String(value || '').trim();
    if(text && !reasonParts.includes(text)) reasonParts.push(text);
  };

  if(structuralStateKey === 'dead'){
    actionStateKey = 'rebuild_setup';
    actionLabel = 'Rebuild setup';
    actionTone = 'danger';
    blockerCode = deadCheck.reasonCode || avoidSubtype || 'broken_structure';
    blockerReason = structureState === 'broken' ? 'Structure is broken' : 'Setup is no longer technically valid';
    addReason(blockerReason);
  }else if(planStateKey !== 'valid'){
    actionStateKey = 'recalculate_plan';
    actionLabel = 'Hold for entry conditions';
    actionTone = 'warning';
    blockerCode = planStateKey;
    blockerReason = (planStateKey === 'needs_adjustment' && (capitalBlocked || capitalHeavy))
      ? (capitalConstraintReasonForPlan(displayedPlan) || 'Capital usage is heavy for this account size.')
      : (({
        missing:'Plan not defined',
        invalid:'Invalid plan',
        needs_adjustment:'Plan needs adjustment',
        unrealistic_rr:'R:R is not realistic'
      })[planStateKey] || 'Plan needs adjustment');
    addReason(blockerReason);
  }else if(
    finalVerdict === 'Entry'
    && !bounceUnconfirmed
    && !weakVolume
    && !marketWeak
    && !weakControl
  ){
    actionStateKey = 'ready_to_act';
    actionLabel = 'Ready to act';
    actionTone = 'success';
    blockerCode = 'ready';
    blockerReason = 'Trigger conditions are met';
  }else{
    actionStateKey = 'wait_for_confirmation';
    actionLabel = 'Hold for confirmation';
    actionTone = 'warning';
    if(bounceUnconfirmed){
      blockerCode = 'bounce_not_confirmed';
      blockerReason = 'Needs stronger bounce confirmation';
    }else if(weakVolume){
      blockerCode = 'weak_volume';
      blockerReason = 'Needs stronger volume';
    }else if(marketWeak){
      blockerCode = 'hostile_market';
      blockerReason = 'Market not supportive';
    }else if(weakControl){
      blockerCode = 'weak_control';
      blockerReason = 'Structure needs tighter control';
    }else if(finalVerdict === 'Near Entry'){
      blockerCode = 'near_trigger';
      blockerReason = 'Close to trigger';
    }else{
      blockerCode = 'early_confirmation';
      blockerReason = 'Needs better confirmation';
    }
    addReason(blockerReason);
  }

  if(['weak','weakening','developing_loose'].includes(structureState) && structuralStateKey !== 'dead') addReason('Weak structure');
  if(marketWeak && blockerCode !== 'hostile_market') addReason('Weak market');
  if(weakVolume && blockerCode !== 'weak_volume') addReason('Weak volume');
  if(weakControl && blockerCode !== 'weak_control') addReason('Weak control');

  const structuralLabel = ({
    dead:'Dead',
    developing:'Developing',
    near_entry:'Near Entry',
    entry:'Entry'
  })[structuralStateKey] || 'Developing';
  const structuralEmoji = ({
    dead:'\uD83D\uDC80',
    developing:'\uD83C\uDF31',
    near_entry:'\uD83C\uDFAF',
    entry:'\uD83D\uDE80'
  })[structuralStateKey] || '\uD83C\uDF31';
  const badgeClass = ({
    dead:'avoid',
    developing:'near',
    near_entry:'near',
    entry:'ready'
  })[structuralStateKey] || 'watch';

  const nextPossibleState = actionStateKey === 'rebuild_setup'
    ? 'None'
    : (actionStateKey === 'recalculate_plan'
      ? '🟡 Hold for entry conditions'
      : (actionStateKey === 'ready_to_act'
        ? '\uD83D\uDE80 Entry'
        : (structuralStateKey === 'near_entry' ? '\uD83C\uDFAF Near Entry' : '\uD83C\uDF31 Developing')));

  const tradeabilityVerdict = structuralStateKey === 'dead'
    ? 'Avoid'
    : (finalVerdict || 'Watch');
  const rrConfidenceLabel = planStateKey !== 'valid'
    ? 'Invalid plan'
    : (rrResolution.rr_label || 'Low confidence');
  const remapReason = rrResolution.remapReason
    || ((tradeabilityVerdict === 'Avoid' && structuralStateKey !== 'dead') ? 'weak but still technically alive' : '');
  const reasonSummary = reasonParts.slice(0, 2).join(' + ');

  return {
    finalVerdict,
    rawResolverVerdict:rrResolution.rawResolverVerdict || rrResolution.status || finalVerdict,
    finalDisplayState:structuralLabel,
    primaryState:structuralStateKey,
    structuralState:structuralStateKey,
    structuralStateLabel:structuralLabel,
    badgeText:`${structuralEmoji} ${structuralLabel}`,
    badgeClass,
    modifiers:[],
    marketRegimeLabel:marketWeak ? 'Weak market' : 'Supportive',
    marketRegimeWeak:marketWeak,
    planStatusKey:planStateKey,
    planStatusLabel,
    planStateKey,
    rrConfidenceLabel,
    tradeabilityLabel:tradeabilityVerdict,
    tradeabilityVerdict,
    tradeabilityVerdictLabel:tradeabilityVerdict,
    actionStateKey,
    actionStateLabel:actionLabel,
    actionLabel,
    actionShortLabel:actionLabel,
    actionTone,
    blockerCode,
    blockerReason:blockerReason || reasonParts[0] || '',
    reasonParts,
    reasonSummary,
    nextPossibleState,
    remapReason,
    terminal:structuralStateKey === 'dead',
    nonActionableButAlive:structuralStateKey !== 'dead' && actionStateKey !== 'ready_to_act'
  };
}

function resolvePreLifecycleStateContract(record){
  const item = record && typeof record === 'object' ? record : {};
  const derivedStates = analysisDerivedStatesFromRecord(item);
  const effectivePlan = effectivePlanForRecord(item, {allowScannerFallback:true});
  const displayedPlan = deriveCurrentPlanState(
    effectivePlan.entry,
    effectivePlan.stop,
    effectivePlan.firstTarget,
    item.marketData && item.marketData.currency
  );
  const structureState = String(derivedStates.structureState || '').toLowerCase();
  const trendState = String(derivedStates.trendState || '').toLowerCase();
  const bounceState = String(derivedStates.bounceState || '').toLowerCase();
  const volumeState = String(derivedStates.volumeState || '').toLowerCase();
  const marketWeak = !!(
    item.setup.marketCaution
    || isHostileMarketStatus((item.meta && item.meta.marketStatus) || state.marketStatus)
  );
  const weakStructure = ['weak','weakening','developing_loose'].includes(structureState);
  const bounceUnconfirmed = ['none','unconfirmed','attempt','early'].includes(bounceState);
  const hardStructureBroken = !!(
    structureState === 'broken'
    || trendState === 'broken'
  );
  const planStatusKey = String(displayedPlan.status || '').toLowerCase() || 'missing';
  const baseVerdict = hardStructureBroken
    ? 'avoid'
    : (displayedPlan.status === 'valid' && !bounceUnconfirmed && !marketWeak && volumeState !== 'weak'
      ? 'near_entry'
      : 'watch');
  let structuralStateKey = 'developing';
  if(hardStructureBroken){
    structuralStateKey = 'dead';
  }else if(baseVerdict === 'near_entry'){
    structuralStateKey = 'near_entry';
  }else if(weakStructure){
    structuralStateKey = 'developing';
  }
  const actionStateKey = hardStructureBroken
    ? 'rebuild_setup'
    : (displayedPlan.status === 'valid' && !bounceUnconfirmed ? 'wait_for_confirmation' : 'recalculate_plan');
  const tradeabilityVerdict = hardStructureBroken
    ? 'Avoid'
    : (structuralStateKey === 'near_entry' ? 'Near Entry' : 'Watch');
  return {
    finalVerdict:baseVerdict === 'avoid' ? 'Avoid' : (baseVerdict === 'near_entry' ? 'Near Entry' : 'Watch'),
    structuralState:structuralStateKey,
    actionStateKey,
    planStatusKey:planStatusKey || 'missing',
    tradeabilityVerdict,
    blockerReason:hardStructureBroken ? 'Structure is broken' : (displayedPlan.status === 'valid' ? 'Needs stronger confirmation' : 'Plan not ready'),
    reasonSummary:hardStructureBroken ? 'Structure is broken' : (weakStructure ? 'Trend weakening' : 'Pre-watchlist setup'),
    terminal:hardStructureBroken,
    baseVerdict
  };
}

function resolveGlobalVerdict(record){
  const verdict = resolveGlobalVerdictImpl(record, {
    resolveFinalStateContract,
    resolvePreLifecycleStateContract,
    baseVerdictFromResolvedContract,
    analysisDerivedStatesFromRecord,
    deriveCurrentPlanState,
    evaluatePlanRealism,
    setupScoreForRecord,
    isHostileMarketStatus,
    state,
    scannerScoreGradientClass
  });
  const item = record && typeof record === 'object' ? record : {};
  const derivedStates = analysisDerivedStatesFromRecord(item);
  const effectivePlan = effectivePlanForRecord(item, {allowScannerFallback:true});
  const displayedPlan = applySetupConfirmationPlanGate(
    item,
    deriveCurrentPlanState(
      effectivePlan.entry,
      effectivePlan.stop,
      effectivePlan.firstTarget,
      item.marketData && item.marketData.currency
    ),
    derivedStates
  );
  const resolvedContract = resolveFinalStateContract(item, {
    finalVerdict:globalVerdictLabel(verdict.final_verdict || ''),
    derivedStates,
    displayedPlan
  });
  verdict.decision_summary = buildDecisionSummary({
    finalVerdict:verdict.final_verdict,
    displayedPlan,
    resolvedContract,
    derivedStates
  });
  return verdict;
}

function watchlistRefreshStructureGate(record){
  const item = record && typeof record === 'object' ? record : {};
  const derivedStates = analysisDerivedStatesFromRecord(item);
  const displayedPlan = deriveCurrentPlanState(
    item.plan && item.plan.entry,
    item.plan && item.plan.stop,
    item.plan && item.plan.firstTarget,
    item.marketData && item.marketData.currency
  );
  const deadCheck = isTerminalDeadSetup(item, {derivedStates, displayedPlan});
  const structureState = String(derivedStates.structureState || '').toLowerCase();
  const trendState = String(derivedStates.trendState || '').toLowerCase();
  const explicitInvalidation = !!(item.plan && item.plan.invalidatedState);
  const currentPrice = numericOrNull(item.marketData && item.marketData.price);
  const stopPrice = numericOrNull(item.plan && item.plan.stop);
  const brokenBelowStop = Number.isFinite(currentPrice) && Number.isFinite(stopPrice) && currentPrice <= stopPrice;
  const structuralBroken = deadCheck.dead || structureState === 'broken' || trendState === 'broken' || brokenBelowStop;
  const explicitInvalidationAllowed = explicitInvalidation && structuralBroken;
  const structuralAlive = !deadCheck.dead
    && structureState !== 'broken'
    && trendState !== 'broken'
    && !brokenBelowStop;
  return {
    structural_alive_at_refresh:structuralAlive,
    avoid_allowed_by_structure_gate:!structuralAlive,
    refresh_demote_reason:!structuralAlive
      ? (explicitInvalidationAllowed
        ? 'Explicit setup invalidation.'
        : (deadCheck.dead
          ? (deadCheck.reason || deadCheck.reasonCode || 'Dead setup rule triggered.')
          : 'Structure is broken.'))
      : 'Structurally alive; keep on monitor.',
    dead_trigger_source:explicitInvalidationAllowed
      ? 'explicit_invalidation'
      : (structuralBroken ? 'structure_broken' : null),
    explicit_invalidation_reason:explicitInvalidationAllowed ? 'Explicit invalidation with hard structural damage.' : '(none)',
    lifecycle_drop_reason:!structuralAlive ? 'watchlist_refresh_structure_gate' : '(none)'
  };
}

function applyGlobalVerdictGates(record, options = {}){
  const item = record && typeof record === 'object' ? record : null;
  if(!item) return {changed:false, globalVerdict:resolveGlobalVerdict({})};
  const globalVerdict = resolveGlobalVerdict(item);
  const structureGate = watchlistRefreshStructureGate(item);
  const source = String(options.source || '').toLowerCase();
  const deferWatchlistRemoval = options.deferWatchlistRemoval === true
    || ['manual_refresh','auto_recompute','plan_update','review','review_save','analyse_setup','scan','market_status'].includes(source)
    || uiState.watchlistLifecycleRunning;
  let changed = false;
  item.watchlist.debug = item.watchlist.debug && typeof item.watchlist.debug === 'object' ? item.watchlist.debug : {};
  item.watchlist.debug.refresh_demote_attempted = globalVerdict.allow_watchlist ? 'false' : 'true';
  item.watchlist.debug.refresh_demote_reason = structureGate.refresh_demote_reason || (globalVerdict.reason || globalVerdict.downgrade_reason || '(none)');
  item.watchlist.debug.structural_alive_at_refresh = structureGate.structural_alive_at_refresh ? 'true' : 'false';
  item.watchlist.debug.avoid_allowed_by_structure_gate = structureGate.avoid_allowed_by_structure_gate ? 'true' : 'false';
  item.watchlist.debug.explicit_invalidation_reason = structureGate.explicit_invalidation_reason || globalVerdict.explicit_invalidation_reason || '(none)';
  item.watchlist.debug.lifecycle_drop_reason = structureGate.lifecycle_drop_reason || globalVerdict.lifecycle_drop_reason || '(none)';
  item.watchlist.debug.avoid_allowed_by_structure_consistency_guard = globalVerdict.avoid_allowed_by_structure_consistency_guard ? 'true' : 'false';
  if(item.watchlist && item.watchlist.inWatchlist && !globalVerdict.allow_watchlist){
    if(!structureGate.avoid_allowed_by_structure_gate){
      appendWatchlistDebugEvent(item, {
        at:new Date().toISOString(),
        source:source || 'watchlist_gate_suppressed',
        result:`suppressed: structurally_alive | ${structureGate.refresh_demote_reason}`
      });
      return {changed:false, globalVerdict, deferred:false, suppressed:true};
    }
    const removalVerdictLabel = globalVerdictLabel(globalVerdict.final_verdict || 'avoid');
    const removalReason = globalVerdict.reason || globalVerdict.downgrade_reason || 'Setup is no longer watchlist-eligible.';
    item.watchlist.debug.watchlist_removed_by = 'global_verdict_gate';
    item.watchlist.debug.removal_global_verdict = globalVerdict.final_verdict || '';
    item.watchlist.debug.removal_allow_watchlist = globalVerdict.allow_watchlist ? 'true' : 'false';
    item.watchlist.debug.removal_source = source || 'applyGlobalVerdictGates';
    if(deferWatchlistRemoval){
      appendWatchlistDebugEvent(item, {
        at:new Date().toISOString(),
        source:source || 'watchlist_gate_deferred',
        result:`deferred: ${globalVerdict.final_verdict || 'avoid'} | ${removalReason}`
      });
      return {changed:false, globalVerdict, deferred:true};
    }
    item.watchlist.inWatchlist = false;
    item.watchlist.status = globalVerdict.final_verdict;
    item.watchlist.watchlist_priority_bucket = 'inactive';
    appendWatchlistDebugEvent(item, {
      at:new Date().toISOString(),
      source:'watchlist_gate',
      result:`removed: ${globalVerdict.final_verdict || 'avoid'} | ${removalReason}`
    });
    setStatus('inputStatus', `<span class="warntext">${escapeHtml(item.ticker || 'Ticker')} removed from Watchlist: downgraded to ${escapeHtml(removalVerdictLabel)}${removalReason ? ` | ${escapeHtml(removalReason)}` : ''}</span>`);
    if(activeReviewTicker() === item.ticker){
      setStatus('reviewWorkspaceStatus', `<span class="warntext">${escapeHtml(item.ticker || 'Ticker')} removed from Watchlist: downgraded to ${escapeHtml(removalVerdictLabel)}${removalReason ? ` | ${escapeHtml(removalReason)}` : ''}</span>`);
    }
    changed = true;
  }
  if(item.plan && !globalVerdict.allow_plan){
    const hadPlan = !!(item.plan.entry || item.plan.stop || item.plan.firstTarget);
    if(hadPlan){
      item.plan.entry = '';
      item.plan.stop = '';
      item.plan.firstTarget = '';
      item.plan.hasValidPlan = false;
      item.plan.riskStatus = 'plan_blocked';
      changed = true;
    }
    const blockedMessage = globalVerdict.reason || globalVerdict.downgrade_reason || 'Blocked';
    if(item.plan.blockedReason !== blockedMessage){
      item.plan.blockedReason = blockedMessage;
      changed = true;
    }
  }
  return {changed, globalVerdict};
}

function resolveEmojiPresentation(record, options = {}){
  return resolveEmojiPresentationImpl(record, options, {
    normalizeAnalysisVerdict,
    resolverSeedVerdictForRecord,
    analysisDerivedStatesFromRecord,
    effectivePlanForRecord,
    deriveCurrentPlanState,
    evaluateSetupQualityAdjustments,
    evaluateWarningState,
    getReviewAnalysisState,
    planCheckStateForRecord,
    getPlanUiState,
    getSetupUiState,
    avoidSubtypeForRecord,
    isTerminalDeadSetup,
    resolveFinalStateContract
  });
}

function watchlistNextStateGuidance(record, lifecycleSnapshot, context = {}){
  return watchlistNextStateGuidanceImpl(record, lifecycleSnapshot, context, {
    normalizeTickerRecord,
    analysisDerivedStatesFromRecord,
    deriveCurrentPlanState,
    evaluateSetupQualityAdjustments,
    resolveScannerStateWithTrace,
    resolveFinalStateContract
  });
}

function currentHardFailVerdictForRecord(record){
  const item = record && typeof record === 'object' ? record : {};
  const derivedStates = analysisDerivedStatesFromRecord(item);
  const trendState = String(derivedStates.trendState || '').toLowerCase();
  const structureState = String(derivedStates.structureState || '').toLowerCase();
  const currentPrice = numericOrNull(item.marketData && item.marketData.price);
  const stopPrice = numericOrNull(item.plan && item.plan.stop);
  const structurallyDead = !!(
    structureState === 'broken'
    || trendState === 'broken'
    || (item.plan && item.plan.invalidatedState)
    || (item.plan && item.plan.missedState)
    || (Number.isFinite(currentPrice) && Number.isFinite(stopPrice) && currentPrice <= stopPrice)
  );
  return structurallyDead ? 'Avoid' : '';
}

function warningStateFromInputs(record, analysis = null, derivedStates = null){
  const rawRecord = record && typeof record === 'object' ? record : {};
  const safeAnalysis = analysis && typeof analysis === 'object' ? analysis : null;
  const derived = derivedStates || analysisDerivedStatesFromRecord(rawRecord);
  const plan = rawRecord.plan && typeof rawRecord.plan === 'object' ? rawRecord.plan : {};
  const seedVerdict = resolverSeedVerdictForRecord(rawRecord);
  const qualityAdjustments = evaluateSetupQualityAdjustments(rawRecord, {
    derivedStates:derived,
    baseVerdict:seedVerdict,
    displayStage:seedVerdict
  });
  const rrRatio = numericOrNull(plan.plannedRR);
  const structureState = String(derived.structureState || '').toLowerCase();
  const stabilisationState = String(derived.stabilisationState || '').toLowerCase();
  const bounceState = String(derived.bounceState || '').toLowerCase();
  const volumeState = String(derived.volumeState || '').toLowerCase();
  const hostileMarket = isHostileMarketStatus((rawRecord.meta && rawRecord.meta.marketStatus) || state.marketStatus);
  const practicalSizeFlag = practicalSizeFlagForPlan(plan);
  const cautionReasons = [];
  const pushReason = reason => {
    if(reason && !cautionReasons.includes(reason)) cautionReasons.push(reason);
  };

  const structureLabel = structureLabelForRecord(rawRecord, derived, {displayStage:seedVerdict});
  if(structureLabel) pushReason(structureLabel);
  if(bounceState !== 'confirmed') pushReason(bounceState === 'none' ? 'No bounce' : 'Bounce unconfirmed');
  if(stabilisationState === 'early') pushReason('Early stabilisation only');
  if(volumeState === 'weak') pushReason('Weak volume');
  if(hostileMarket) pushReason('Hostile market');
  if(practicalSizeFlag === 'tiny_size') pushReason('Tiny size');
  if(practicalSizeFlag === 'low_impact') pushReason('Low impact');
  if(qualityAdjustments.lowControlSetup) pushReason('Lower control setup');
  if(qualityAdjustments.weakRegimePenalty) pushReason('Weak market needs stronger confirmation');
  if(Number.isFinite(rrRatio) && rrRatio >= 3 && (bounceState !== 'confirmed' || ['weak','weakening','broken'].includes(structureState))){
    pushReason('Paper R:R looks better than confirmation');
  }
  if(safeAnalysis && normalizeAnalysisVerdict(safeAnalysis.final_verdict || safeAnalysis.verdict) !== 'Avoid' && hostileMarket && stabilisationState === 'early'){
    pushReason('Borderline setup in weak market');
  }

  const majorCaution = ['weak','weakening','broken'].includes(structureState) || practicalSizeFlag === 'tiny_size';
  return {
    showWarning:majorCaution || cautionReasons.length >= 2,
    reasons:cautionReasons.slice(0, 4)
  };
}

function deriveDisplaySetupScore(record, options = {}){
  const rawRecord = record && typeof record === 'object' ? record : {};
  const derived = options.derivedStates || analysisDerivedStatesFromRecord(rawRecord);
  const warningState = options.warningState || warningStateFromInputs(rawRecord, options.analysis || null, derived);
  const rawScore = rawSetupScoreForRecord(rawRecord);
  const displayStage = normalizeAnalysisVerdict(options.displayStage || resolverSeedVerdictForRecord(rawRecord));
  const qualityAdjustments = options.qualityAdjustments || evaluateSetupQualityAdjustments(rawRecord, {
    derivedStates:derived,
    displayStage,
    baseVerdict:displayStage
  });
  const hardFail = isTrueHardFailForRecord(rawRecord, derived, {displayedPlan:options.displayedPlan});
  const structureState = String(derived.structureState || '').toLowerCase();
  const stabilisationState = String(derived.stabilisationState || '').toLowerCase();
  const bounceState = String(derived.bounceState || '').toLowerCase();
  const volumeState = String(derived.volumeState || '').toLowerCase();
  const hostileMarket = isHostileMarketStatus((rawRecord.meta && rawRecord.meta.marketStatus) || state.marketStatus);
  const practicalSizeFlag = practicalSizeFlagForPlan(rawRecord.plan);
  const noBounce = bounceState === 'none';
  const confirmedBounce = bounceState === 'confirmed';
  let adjusted = rawScore;

  if(warningState.showWarning) adjusted -= 1;
  if(volumeState === 'weak') adjusted -= 1;
  if(hostileMarket) adjusted -= 0.5;
  if(structureState === 'broken') adjusted -= 4;
  if(!confirmedBounce && stabilisationState === 'early') adjusted -= 1;
  if(confirmedBounce) adjusted += 1;
  if(practicalSizeFlag === 'tiny_size') adjusted -= 2;
  if(practicalSizeFlag === 'low_impact') adjusted -= 1;
  if(qualityAdjustments.widthPenalty > 0) adjusted -= qualityAdjustments.widthPenalty;
  if(qualityAdjustments.weakRegimePenalty) adjusted -= 1;

  if(warningState.showWarning) adjusted = Math.min(adjusted, 9);
  if(volumeState === 'weak') adjusted = Math.min(adjusted, 8);
  if(hostileMarket) adjusted = Math.min(adjusted, 8);
  if(volumeState === 'weak' && hostileMarket) adjusted = Math.min(adjusted, 7);
  if(practicalSizeFlag === 'tiny_size') adjusted = Math.min(adjusted, 7);
  if(qualityAdjustments.widthPenalty >= 1) adjusted = Math.min(adjusted, 7);
  if(qualityAdjustments.widthPenalty >= 2) adjusted = Math.min(adjusted, 6);
  if(qualityAdjustments.weakRegimePenalty) adjusted = Math.min(adjusted, 6);
  if(noBounce && !confirmedBounce) adjusted = Math.min(adjusted, 4);
  if(confirmedBounce) adjusted = Math.max(adjusted, 5);

  const rounded = Math.max(0, Math.min(10, Math.round(adjusted)));
  if(displayStage === 'Entry') return Math.max(8, Math.min(10, rounded));
  if(displayStage === 'Near Entry') return Math.max(6, Math.min(7, rounded));
  if(displayStage === 'Watch') return Math.max(4, Math.min(5, rounded));
  if(displayStage === 'Avoid') return hardFail ? Math.max(0, Math.min(3, rounded)) : Math.max(2, Math.min(4, rounded));
  return rounded;
}

function isTerminalDeadSetup(record, options = {}){
  const item = record && typeof record === 'object' ? record : {};
  const derivedStates = options.derivedStates || analysisDerivedStatesFromRecord(item);
  const structureState = String(derivedStates.structureState || '').toLowerCase();
  const trendState = String(derivedStates.trendState || '').toLowerCase();
  const currentPrice = numericOrNull(item.marketData && item.marketData.price);
  const stopPrice = numericOrNull(item.plan && item.plan.stop);
  const brokenBelowStop = Number.isFinite(currentPrice) && Number.isFinite(stopPrice) && currentPrice <= stopPrice;

  if(structureState === 'broken') return {dead:true, reasonCode:'broken_structure', terminalTriggerUsed:'structure_state'};
  if(trendState === 'broken') return {dead:true, reasonCode:'broken_trend', terminalTriggerUsed:'trend_state'};
  if(brokenBelowStop) return {dead:true, reasonCode:'stop_breach', terminalTriggerUsed:'price_below_stop'};
  return {dead:false, reasonCode:'', terminalTriggerUsed:'', fallbackStateIfNotDead:'monitor'};
}

function validateCurrentPlan(record, options = {}){
  const rawRecord = record && typeof record === 'object' ? record : {};
  const displayedPlan = options.displayedPlan || deriveCurrentPlanState(
    rawRecord.plan && rawRecord.plan.entry,
    rawRecord.plan && rawRecord.plan.stop,
    rawRecord.plan && rawRecord.plan.firstTarget,
    rawRecord.marketData && rawRecord.marketData.currency
  );
  const trigger = options.triggerState || evaluateEntryTrigger(rawRecord, {displayedPlan, derivedStates:options.derivedStates});
  const derivedStates = options.derivedStates || analysisDerivedStatesFromRecord(rawRecord);
  const structureState = String(derivedStates.structureState || '').toLowerCase();
  const trendState = String(derivedStates.trendState || '').toLowerCase();
  const currentPrice = numericOrNull(rawRecord.marketData && rawRecord.marketData.price);
  const entry = displayedPlan.entry;
  const stop = displayedPlan.stop;
  const target = displayedPlan.target;
  const structurallyDead = !!(
    structureState === 'broken'
    || trendState === 'broken'
    || (Number.isFinite(currentPrice) && Number.isFinite(stop) && currentPrice <= (stop * 0.995))
  );
  const structurePremature = !trigger.trendValid || !trigger.structureIntact;
  const confirmationPremature = !trigger.confirmedBounce || !trigger.clearStabilisation;

  if(displayedPlan.status !== 'valid'){
    return {
      state:displayedPlan.status === 'missing' ? 'not_reviewed' : 'needs_replan',
      valid:false,
      needsReplan:displayedPlan.status !== 'missing',
      missed:false,
      invalidated:false,
      capitalConstraint:'',
      reasonCode:displayedPlan.status === 'missing' ? 'plan_missing' : 'plan_incomplete'
    };
  }
  if(structurallyDead){
    return {state:'invalidated', valid:false, needsReplan:false, missed:false, invalidated:true, capitalConstraint:'', reasonCode:'technical_invalidation'};
  }
  if(trigger.clearlyMissed || (Number.isFinite(currentPrice) && Number.isFinite(target) && currentPrice >= (target * 0.98))){
    return {state:'missed', valid:false, needsReplan:false, missed:true, invalidated:false, capitalConstraint:'', reasonCode:'missed_setup'};
  }
  if(structurePremature || confirmationPremature){
    return {
      state:'pending_validation',
      valid:false,
      needsReplan:true,
      missed:false,
      invalidated:false,
      capitalConstraint:'',
      reasonCode:structurePremature ? 'weak_structure' : 'bounce_not_confirmed'
    };
  }
  const prospectiveRisk = (Number.isFinite(currentPrice) && Number.isFinite(stop) && Number.isFinite(target) && currentPrice > entry)
    ? evaluateRewardRisk(currentPrice, stop, target)
    : displayedPlan.rewardRisk;
  const prospectiveRiskFit = (Number.isFinite(currentPrice) && Number.isFinite(stop) && currentPrice > entry)
    ? evaluateRiskFit({entry:currentPrice, stop, ...currentRiskSettings()})
    : displayedPlan.riskFit;
  const sizeShift = Number.isFinite(displayedPlan.riskFit.position_size) && displayedPlan.riskFit.position_size > 0 && Number.isFinite(prospectiveRiskFit.position_size)
    ? Math.abs(prospectiveRiskFit.position_size - displayedPlan.riskFit.position_size) / displayedPlan.riskFit.position_size
    : 0;
  const staleMove = trigger.extendedFromEntry
    || (prospectiveRisk.valid && prospectiveRisk.rrRatio < 1.5)
    || sizeShift > 0.35;
  return {
    state:staleMove ? 'needs_replan' : 'valid',
    valid:!staleMove,
    needsReplan:staleMove,
    missed:false,
    invalidated:false,
    capitalConstraint:capitalConstraintCodeForPlan(displayedPlan),
    reasonCode:staleMove ? 'plan_premature_or_stale' : 'valid'
  };
}

function finalVerdictForRecord(record, options = {}){
  return finalVerdictForRecordImpl(record, options, {
    deriveCurrentPlanState,
    analysisDerivedStatesFromRecord,
    getPlanUiState,
    baseVerdictForRecord,
    analysisVerdictForRecord,
    executionDowngradeVerdictForRecord,
    mostConservativeVerdict,
    isTerminalDeadSetup,
    resolveFinalStateContract
  });
}

function reviewHeaderVerdictForRecord(record){
  return reviewHeaderVerdictForRecordImpl(record, {
    deriveCurrentPlanState,
    analysisDerivedStatesFromRecord,
    isTerminalDeadSetup,
    getPlanUiState,
    baseVerdictForRecord,
    analysisVerdictForRecord,
    executionDowngradeVerdictForRecord,
    mostConservativeVerdict,
    resolveFinalStateContract
  });
}

installRuntimeDebugHooks();
registerPwa();
loadState();
renderRuntimeDebugPanel();
setControlFocus(uiState.controlStripPanel || 'market', {scroll:false, instant:true});
updateControlFocusRailVisuals($('controlFocusRail'));
consumeResetNotice();
bootstrapBackgroundMonitoring();
bootstrapMarketStatusClock();
bootstrapWatchlistLifecycleAutomation();
updateTickerSearchStatus();
updateProviderStatusNote();
















