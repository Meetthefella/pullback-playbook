const $ = id => document.getElementById(id);
const on = (id, evt, fn) => { const el = $(id); if (el) el.addEventListener(evt, fn); };
const click = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
const key = 'pullbackPlaybookV3';
const APP_VERSION = 'v4.4.0';
const defaultAiEndpoint = '/api/analyse-setup';
const defaultMarketDataEndpoint = '/api/market-data';
const marketCacheKey = 'pullbackPlaybookMarketCacheV1';
const savedScannerUniverseKey = 'pp_scanner_universe_saved';
const savedScannerUniverseMetaKey = 'pp_scanner_universe_saved_meta';
const DEFAULT_PROVIDER = 'fmp';
const DEFAULT_API_PLAN = 'scanner';
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
  riskPercent:0.01,
  maxLossOverride:'',
  wholeSharesOnly:true,
  marketStatus:'S&P above 50 MA',
  setupType:'',
  listName:"Today's Scan",
  universeMode:'core8',
  tickers:[],
  recentTickers:[],
  tickerRecords:{},
  lastAlertsSeenAt:'',
  dismissedAlertIds:[],
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

const state = createDefaultState();

const uiState = {promptOpen:{},responseOpen:{},loadingTicker:'',selectedScanner:{}};
const MAX_CHART_BYTES = 4 * 1024 * 1024;
const ANALYSIS_TIMEOUT_MS = 45000;
const MARKET_CACHE_TTL_MS = 15 * 60 * 1000;
const SEARCH_DEBOUNCE_MS = 250;
const DEFAULT_WATCH_TRADING_DAYS = 3;
const EXTENDED_WATCH_TRADING_DAYS = 5;
const WATCHLIST_EXPIRY_TRADING_DAYS = 5;
const REVIEW_EXPIRY_TRADING_DAYS = 5;
const PLAN_EXPIRY_TRADING_DAYS = 3;
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
const MARKET_CACHE_SCHEMA_VERSION = 3;
const SCAN_BATCH_SIZE = 4;
const TESSERACT_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
const OCR_STOPWORDS = new Set(['OPEN','HIGH','LOW','CLOSE','VOLUME','VOL','CHANGE','PRICE','PERCENT','PCT','CHG','DATE','TIME','WATCH','LIST','SCREEN','SCREENER','TRADINGVIEW','SYMBOL','STOCK','STOCKS','NAME','LAST','USD','USDT','BUY','SELL','LONG','SHORT','NYSE','NASDAQ','AMEX','LSE','TOTAL','AVG','RSI','SMA','EMA']);
const marketDataCache = new Map();
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

function formatGbp(value){
  return `GBP ${Number(value || 0).toLocaleString()}`;
}

function currentSetupType(){
  return normalizeScanType(state.setupType) || 'unknown';
}

function currentMaxLoss(){
  const override = numericOrNull(state.maxLossOverride);
  if(Number.isFinite(override) && override > 0) return override;
  const accountSize = numericOrNull(state.accountSize);
  const riskPercent = numericOrNull(state.riskPercent);
  if(Number.isFinite(accountSize) && Number.isFinite(riskPercent) && accountSize > 0 && riskPercent > 0){
    return accountSize * riskPercent;
  }
  return numericOrNull(state.maxRisk) || 0;
}

function currentRiskSettings(){
  return {
    account_size:numericOrNull(state.accountSize) || 0,
    risk_percent:numericOrNull(state.riskPercent) || 0,
    max_loss_override:numericOrNull(state.maxLossOverride),
    whole_shares_only:state.wholeSharesOnly !== false
  };
}

function evaluateRiskFit({entry, stop, account_size, risk_percent, max_loss_override, whole_shares_only}){
  const numericEntry = numericOrNull(entry);
  const numericStop = numericOrNull(stop);
  const accountSize = numericOrNull(account_size) || 0;
  const riskPercent = numericOrNull(risk_percent) || 0;
  const override = numericOrNull(max_loss_override);
  const max_loss = Number.isFinite(override) && override > 0 ? override : (accountSize > 0 && riskPercent > 0 ? accountSize * riskPercent : 0);
  if(!Number.isFinite(numericEntry) || !Number.isFinite(numericStop)) return {max_loss, risk_per_share:null, position_size:0, risk_status:'plan_missing'};
  const risk_per_share = numericEntry - numericStop;
  if(!Number.isFinite(risk_per_share) || risk_per_share <= 0) return {max_loss, risk_per_share, position_size:0, risk_status:'invalid_plan'};
  let position_size = max_loss > 0 ? (whole_shares_only === false ? (max_loss / risk_per_share) : Math.floor(max_loss / risk_per_share)) : 0;
  if(!Number.isFinite(position_size)) position_size = 0;
  if(position_size < 1) return {max_loss, risk_per_share, position_size:whole_shares_only === false ? Number(position_size.toFixed(2)) : 0, risk_status:'too_wide'};
  return {max_loss, risk_per_share, position_size:whole_shares_only === false ? Number(position_size.toFixed(2)) : position_size, risk_status:'fits_risk'};
}

function evaluateRewardRisk(entry, stop, firstTarget){
  const numericEntry = numericOrNull(entry);
  const numericStop = numericOrNull(stop);
  const numericFirstTarget = numericOrNull(firstTarget);
  if(!Number.isFinite(numericEntry) || !Number.isFinite(numericStop) || !Number.isFinite(numericFirstTarget)){
    return {valid:false, riskPerShare:null, rewardPerShare:null, rrRatio:null, rrState:'invalid'};
  }
  const riskPerShare = numericEntry - numericStop;
  const rewardPerShare = numericFirstTarget - numericEntry;
  if(!Number.isFinite(riskPerShare) || !Number.isFinite(rewardPerShare) || riskPerShare <= 0 || rewardPerShare <= 0){
    return {valid:false, riskPerShare, rewardPerShare, rrRatio:null, rrState:'invalid'};
  }
  const rrRatio = rewardPerShare / riskPerShare;
  if(rrRatio >= 2) return {valid:true, riskPerShare, rewardPerShare, rrRatio, rrState:'strong'};
  if(rrRatio >= 1.5) return {valid:true, riskPerShare, rewardPerShare, rrRatio, rrState:'acceptable'};
  return {valid:true, riskPerShare, rewardPerShare, rrRatio, rrState:'weak'};
}

function numericOrNull(value){
  if(value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function safeJsonParse(value, fallback){
  try{
    const parsed = JSON.parse(value);
    return parsed == null ? fallback : parsed;
  }catch(error){
    return fallback;
  }
}

function safeStorageGet(storageKey, fallback){
  try{
    const raw = localStorage.getItem(storageKey);
    if(raw == null) return fallback;
    return safeJsonParse(raw, fallback);
  }catch(error){
    return fallback;
  }
}

function safeStorageSet(storageKey, value){
  try{
    localStorage.setItem(storageKey, JSON.stringify(value));
    return true;
  }catch(error){
    return false;
  }
}

function safeStorageRemove(storageKey){
  try{
    localStorage.removeItem(storageKey);
    return true;
  }catch(error){
    return false;
  }
}

function persistState(){
  safeStorageSet(key, state);
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

function escapeHtml(value){
  return String(value || '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

function validateTickerSymbol(value){
  return /^[A-Z][A-Z0-9.-]{0,9}$/.test(String(value || '').trim().toUpperCase());
}

function normalizeTicker(value){
  return String(value || '').trim().toUpperCase();
}

function normalizeScanType(value){
  const text = String(value || '').trim().toUpperCase();
  if(text === '20MA' || text === '50MA') return text;
  return '';
}

function selectedQuickScanType(){
  return normalizeScanType($('scannerSetupType') && $('scannerSetupType').value);
}

function parseImportedTickerEntries(text){
  const rawText = String(text || '').trim();
  if(!rawText) return [];
  const entries = [];
  rawText.split(/\n+/).map(line => line.trim()).filter(Boolean).forEach(line => {
    const explicit = line.match(/^([A-Z][A-Z0-9.-]{0,9})\s*(?:\||,|:|\s)\s*(20MA|50MA)$/i);
    if(explicit){
      entries.push({ticker:normalizeTicker(explicit[1]), scanType:normalizeScanType(explicit[2])});
      return;
    }
    line.split(/[\s,]+/).map(token => token.trim()).filter(Boolean).forEach(token => {
      const pair = token.match(/^([A-Z][A-Z0-9.-]{0,9})[:|](20MA|50MA)$/i);
      if(pair){
        entries.push({ticker:normalizeTicker(pair[1]), scanType:normalizeScanType(pair[2])});
        return;
      }
      entries.push({ticker:normalizeTicker(token), scanType:''});
    });
  });
  return entries;
}

function parseTickersDetailed(text){
  const rawItems = parseImportedTickerEntries(text).map(item => item.ticker).filter(Boolean);
  const valid = [];
  const invalid = [];
  const duplicates = [];
  const seen = new Set();
  rawItems.forEach(item => {
    if(!validateTickerSymbol(item)){
      invalid.push(item);
      return;
    }
    if(seen.has(item)){
      duplicates.push(item);
      return;
    }
    seen.add(item);
    valid.push(item);
  });
  return {valid, invalid, duplicates};
}

function parseTickers(text){
  return parseTickersDetailed(text).valid;
}

function renderTickerListWithScanTypes(tickers){
  return uniqueTickers(tickers || []).map(ticker => {
    const meta = getStoredTickerMeta(ticker);
    const scanType = normalizeScanType(meta && meta.scanType);
    return scanType ? `${ticker} | ${scanType}` : ticker;
  }).join('\n');
}

function uniqueTickers(values){
  const out = [];
  const seen = new Set();
  (values || []).forEach(value => {
    const ticker = normalizeTicker(value);
    if(!ticker || seen.has(ticker) || !validateTickerSymbol(ticker)) return;
    seen.add(ticker);
    out.push(ticker);
  });
  return out;
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
      return;
    }
    if($('ocrReviewInput')) $('ocrReviewInput').value = tickers.join('\n');
    setOcrImportStatus(`<span class="ok">${tickers.length} likely ticker${tickers.length === 1 ? '' : 's'} detected. Review and confirm before scanning.</span>`);
  }catch(error){
    if($('ocrReviewInput')) $('ocrReviewInput').value = '';
    setOcrImportStatus(`<span class="badtext">${escapeHtml(String(error && error.message || 'No ticker symbols detected. Try a clearer screenshot.'))}</span>`);
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
  normalized.scanType = normalizeScanType(normalized.scanType);
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
  const createdAt = new Date().toISOString();
  return {
    ticker:normalizeTicker(ticker),
    marketData:{
      price:null,
      asOf:'',
      source:'',
      ma20:null,
      ma50:null,
      ma200:null,
      rsi:null,
      avgVolume:null,
      volume:null,
      perf1w:null,
      perf1m:null,
      perf3m:null,
      perf6m:null,
      perfYtd:null,
      marketCap:null,
      history:[]
    },
    scan:{
      scanType:'',
      estimatedEntryZone:null,
      estimatedStopArea:null,
      estimatedTargetArea:null,
      estimatedRR:null,
      score:null,
      verdict:'',
      reasons:[],
      flags:{},
      summary:'',
      riskStatus:'plan_missing',
      trendStatus:'',
      pullbackStatus:'',
      pullbackType:'',
      analysisProjection:null,
      lastScannedAt:''
    },
    review:{
      chartAvailable:false,
      chartRef:null,
      importedFromScreenshot:false,
      notes:'',
      aiAnalysisRaw:'',
      normalizedAnalysis:null,
      lastReviewedAt:'',
      lastPrompt:'',
      lastError:'',
      manualReview:null,
      cardOpen:false,
      source:'manual'
    },
    plan:{
      hasValidPlan:false,
      entry:null,
      stop:null,
      firstTarget:null,
      riskPerShare:null,
      rewardPerShare:null,
      plannedRR:null,
      positionSize:null,
      maxLoss:null,
      riskStatus:'plan_missing',
      firstTargetTooClose:false,
      lastPlannedAt:'',
      source:''
    },
    watchlist:{
      inWatchlist:false,
      addedAt:'',
      addedScore:null,
      expiryAt:'',
      status:'',
      expiryAfterTradingDays:5
    },
    diary:{
      hasDiary:false,
      diaryIds:[],
      lastOutcomeAt:'',
      records:[],
      tradeOutcome:baseTradeOutcome()
    },
    lifecycle:{
      stage:'',
      status:'inactive',
      stageUpdatedAt:'',
      expiresAt:'',
      expiryReason:'',
      history:[]
    },
    meta:{
      createdAt,
      updatedAt:createdAt,
      tags:[],
      dataVersion:2,
      companyName:'',
      exchange:'',
      tradingViewSymbol:'',
      marketStatus:'',
      pinned:false
    }
  };
}

function normalizeTickerRecord(record){
  const normalized = record && typeof record === 'object' ? record : {};
  const base = baseTickerRecord(normalizeTicker(normalized.ticker));
  const merged = {
    ...base,
    ...normalized,
    ticker:normalizeTicker(normalized.ticker || base.ticker),
    marketData:{...base.marketData, ...(normalized.marketData || {})},
    scan:{...base.scan, ...(normalized.scan || {})},
    review:{...base.review, ...(normalized.review || {})},
    plan:{...base.plan, ...(normalized.plan || {})},
    watchlist:{...base.watchlist, ...(normalized.watchlist || {})},
    diary:{...base.diary, ...(normalized.diary || {})},
    lifecycle:{...base.lifecycle, ...(normalized.lifecycle || {})},
    meta:{...base.meta, ...(normalized.meta || {})}
  };
  merged.marketData.price = numericOrNull(merged.marketData.price);
  merged.marketData.ma20 = numericOrNull(merged.marketData.ma20);
  merged.marketData.ma50 = numericOrNull(merged.marketData.ma50);
  merged.marketData.ma200 = numericOrNull(merged.marketData.ma200);
  merged.marketData.rsi = numericOrNull(merged.marketData.rsi);
  merged.marketData.avgVolume = numericOrNull(merged.marketData.avgVolume);
  merged.marketData.volume = numericOrNull(merged.marketData.volume);
  merged.marketData.perf1w = numericOrNull(merged.marketData.perf1w);
  merged.marketData.perf1m = numericOrNull(merged.marketData.perf1m);
  merged.marketData.perf3m = numericOrNull(merged.marketData.perf3m);
  merged.marketData.perf6m = numericOrNull(merged.marketData.perf6m);
  merged.marketData.perfYtd = numericOrNull(merged.marketData.perfYtd);
  merged.marketData.marketCap = numericOrNull(merged.marketData.marketCap);
  merged.marketData.history = Array.isArray(merged.marketData.history) ? merged.marketData.history : [];
  merged.scan.scanType = normalizeScanType(merged.scan.scanType);
  merged.scan.estimatedEntryZone = numericOrNull(merged.scan.estimatedEntryZone);
  merged.scan.estimatedStopArea = numericOrNull(merged.scan.estimatedStopArea);
  merged.scan.estimatedTargetArea = numericOrNull(merged.scan.estimatedTargetArea);
  merged.scan.estimatedRR = numericOrNull(merged.scan.estimatedRR);
  merged.scan.score = numericOrNull(merged.scan.score);
  merged.scan.reasons = Array.isArray(merged.scan.reasons) ? merged.scan.reasons.map(item => String(item || '')).filter(Boolean) : [];
  merged.scan.flags = merged.scan.flags && typeof merged.scan.flags === 'object' ? merged.scan.flags : {};
  merged.review.notes = String(merged.review.notes || '');
  merged.review.aiAnalysisRaw = String(merged.review.aiAnalysisRaw || '');
  merged.review.lastPrompt = String(merged.review.lastPrompt || '');
  merged.review.lastError = String(merged.review.lastError || '');
  merged.review.cardOpen = !!merged.review.cardOpen;
  merged.review.chartAvailable = !!(merged.review.chartAvailable || (merged.review.chartRef && merged.review.chartRef.dataUrl));
  merged.review.importedFromScreenshot = !!merged.review.importedFromScreenshot;
  merged.review.manualReview = merged.review.manualReview && typeof merged.review.manualReview === 'object' ? merged.review.manualReview : null;
  merged.plan.hasValidPlan = !!merged.plan.hasValidPlan;
  merged.plan.entry = numericOrNull(merged.plan.entry);
  merged.plan.stop = numericOrNull(merged.plan.stop);
  merged.plan.firstTarget = numericOrNull(merged.plan.firstTarget);
  merged.plan.riskPerShare = numericOrNull(merged.plan.riskPerShare);
  merged.plan.rewardPerShare = numericOrNull(merged.plan.rewardPerShare);
  merged.plan.plannedRR = numericOrNull(merged.plan.plannedRR);
  merged.plan.positionSize = numericOrNull(merged.plan.positionSize);
  merged.plan.maxLoss = numericOrNull(merged.plan.maxLoss);
  merged.plan.firstTargetTooClose = !!merged.plan.firstTargetTooClose;
  merged.watchlist.inWatchlist = !!merged.watchlist.inWatchlist;
  merged.watchlist.addedScore = numericOrNull(merged.watchlist.addedScore);
  merged.watchlist.expiryAfterTradingDays = Number.isFinite(Number(merged.watchlist.expiryAfterTradingDays)) ? Math.max(1, Number(merged.watchlist.expiryAfterTradingDays)) : 5;
  merged.diary.records = Array.isArray(merged.diary.records) ? merged.diary.records.map(normalizeTradeRecord) : [];
  merged.diary.diaryIds = uniqueStrings(merged.diary.diaryIds && merged.diary.diaryIds.length ? merged.diary.diaryIds : merged.diary.records.map(item => item.id));
  merged.diary.hasDiary = !!(merged.diary.hasDiary || merged.diary.records.length);
  merged.diary.tradeOutcome = normalizeStoredTradeOutcome(merged.diary.tradeOutcome);
  merged.lifecycle.stage = String(merged.lifecycle.stage || '');
  merged.lifecycle.status = String(merged.lifecycle.status || 'inactive');
  merged.lifecycle.stageUpdatedAt = String(merged.lifecycle.stageUpdatedAt || '');
  merged.lifecycle.expiresAt = String(merged.lifecycle.expiresAt || '');
  merged.lifecycle.expiryReason = String(merged.lifecycle.expiryReason || '');
  merged.lifecycle.history = Array.isArray(merged.lifecycle.history) ? merged.lifecycle.history.map(entry => ({
    stage:String(entry && entry.stage || ''),
    status:String(entry && entry.status || ''),
    changedAt:String(entry && entry.changedAt || ''),
    reason:String(entry && entry.reason || ''),
    source:String(entry && entry.source || '')
  })).filter(entry => entry.stage || entry.status) : [];
  merged.meta.tags = Array.isArray(merged.meta.tags) ? merged.meta.tags.map(item => String(item || '')).filter(Boolean) : [];
  merged.meta.dataVersion = 2;
  merged.meta.updatedAt = String(merged.meta.updatedAt || merged.meta.createdAt || new Date().toISOString());
  merged.meta.createdAt = String(merged.meta.createdAt || merged.meta.updatedAt || new Date().toISOString());
  return merged;
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

function setLifecycleStage(record, {stage, status, changedAt, expiresAt, expiryReason, reason, source, forceHistory = false}){
  if(!record) return;
  const nextStage = String(stage || record.lifecycle.stage || '');
  const nextStatus = String(status || record.lifecycle.status || 'inactive');
  const nextChangedAt = String(changedAt || new Date().toISOString());
  const stageChanged = record.lifecycle.stage !== nextStage || record.lifecycle.status !== nextStatus;
  record.lifecycle.stage = nextStage;
  record.lifecycle.status = nextStatus;
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
  setLifecycleStage(record, {
    stage,
    status:'active',
    changedAt:new Date().toISOString(),
    expiresAt:tradingDays > 0 ? businessDaysFromNow(tradingDays) : '',
    expiryReason:'',
    reason,
    source,
    forceHistory:true
  });
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
  const stage = item.lifecycle.stage || 'untracked';
  const status = item.lifecycle.status || 'inactive';
  const expiry = item.lifecycle.expiresAt ? ` • Expires ${item.lifecycle.expiresAt}` : '';
  return `${stage} • ${status}${expiry}`;
}

function getTickerRecord(ticker){
  const symbol = normalizeTicker(ticker);
  return symbol ? state.tickerRecords[symbol] || null : null;
}

function upsertTickerRecord(ticker){
  const symbol = normalizeTicker(ticker);
  if(!symbol) return null;
  if(!state.tickerRecords[symbol]) state.tickerRecords[symbol] = normalizeTickerRecord(baseTickerRecord(symbol));
  return state.tickerRecords[symbol];
}

function formatPlanFieldValue(value, fallback = ''){
  const numeric = numericOrNull(value);
  if(Number.isFinite(numeric)) return numeric.toFixed(2);
  return String(fallback || '');
}

function applyPlanCandidateToRecord(record, planCandidate = {}, context = {}){
  if(!record) return;
  const entry = numericOrNull(planCandidate.entry);
  const stop = numericOrNull(planCandidate.stop);
  const firstTarget = numericOrNull(planCandidate.firstTarget);
  const rewardRisk = evaluateRewardRisk(entry, stop, firstTarget);
  const riskFit = evaluateRiskFit({entry, stop, ...currentRiskSettings()});
  record.plan.hasValidPlan = rewardRisk.valid;
  record.plan.entry = entry;
  record.plan.stop = stop;
  record.plan.firstTarget = firstTarget;
  record.plan.riskPerShare = rewardRisk.valid ? rewardRisk.riskPerShare : null;
  record.plan.rewardPerShare = rewardRisk.valid ? rewardRisk.rewardPerShare : null;
  record.plan.plannedRR = rewardRisk.valid ? rewardRisk.rrRatio : null;
  record.plan.positionSize = rewardRisk.valid ? riskFit.position_size : null;
  record.plan.maxLoss = rewardRisk.valid ? riskFit.max_loss : currentMaxLoss();
  record.plan.riskStatus = rewardRisk.valid ? riskFit.risk_status : 'plan_missing';
  record.plan.firstTargetTooClose = rewardRisk.valid ? rewardRisk.rewardPerShare < (1.5 * rewardRisk.riskPerShare) : false;
  record.plan.lastPlannedAt = String(context.lastPlannedAt || context.updatedAt || record.plan.lastPlannedAt || '');
  record.plan.source = String(context.source || record.plan.source || '');
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
  record.scan.scanType = normalizeScanType(card.scanType || card.setupType || record.scan.scanType);
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
  record.review.aiAnalysisRaw = String(card.lastResponse || record.review.aiAnalysisRaw || '');
  record.review.normalizedAnalysis = cloneData(card.lastAnalysis || record.review.normalizedAnalysis, null);
  record.review.lastReviewedAt = String(card.updatedAt || record.review.lastReviewedAt || '');
  record.review.lastPrompt = String(card.lastPrompt || record.review.lastPrompt || '');
  record.review.lastError = String(card.lastError || record.review.lastError || '');
  record.review.manualReview = card.manualReview && typeof card.manualReview === 'object' ? cloneData(card.manualReview, null) : record.review.manualReview;
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
  const card = normalizeCard({
    ticker:item.ticker,
    status:item.scan.verdict || item.watchlist.status || 'Watch',
    chartVerdict:item.scan.verdict || item.watchlist.status || 'Watch',
    riskStatus:item.plan.riskStatus || item.scan.riskStatus || 'plan_missing',
    score:Number.isFinite(item.scan.score) ? item.scan.score : 0,
    summary:item.scan.summary || item.scan.reasons[0] || 'No review saved yet.',
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
    setupType:item.scan.scanType || '',
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
  records.forEach(maybeExpireTickerRecord);
  state.tickerRecords = Object.fromEntries(records.map(record => [record.ticker, record]));
  return records;
}

function watchlistTickerRecords(){
  return allTickerRecords()
    .filter(record => record.watchlist && record.watchlist.inWatchlist)
    .sort((a, b) => String(b.watchlist.addedAt || '').localeCompare(String(a.watchlist.addedAt || '')) || a.ticker.localeCompare(b.ticker));
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
  const verdict = item.scan.verdict || item.watchlist.status || 'Watch';
  const riskStatus = item.plan.riskStatus || item.scan.riskStatus || 'plan_missing';
  return statusRank(bucketStatusForCard({chartVerdict:verdict, riskStatus}));
}

function resultSortScoreFromRecord(record){
  const item = normalizeTickerRecord(record);
  const verdict = String(item.scan.verdict || item.watchlist.status || 'Watch');
  const riskStatus = String(item.plan.riskStatus || item.scan.riskStatus || '');
  const rrRatio = numericOrNull(recordRrValue(item));
  const verdictRank = verdict === 'Entry' ? 4 : (verdict === 'Near Entry' ? 3 : (verdict === 'Watch' ? 2 : (verdict === 'Manual Review' ? 1 : 0)));
  const riskRank = riskStatus === 'fits_risk' ? 2 : (riskStatus === 'too_wide' ? 1 : 0);
  return (verdictRank * 1000) + (riskRank * 100) + (Number.isFinite(rrRatio) ? rrRatio : 0);
}

function rankedTickerRecords(){
  return allTickerRecords()
    .filter(record => record.scan && (record.scan.lastScannedAt || record.scan.verdict || Number.isFinite(record.scan.score)))
    .sort((a, b) => resultSortScoreFromRecord(b) - resultSortScoreFromRecord(a) || (numericOrNull(b.scan.score) || 0) - (numericOrNull(a.scan.score) || 0) || a.ticker.localeCompare(b.ticker));
}

function openCardTickerRecords(){
  return allTickerRecords()
    .filter(record => record.review && record.review.cardOpen)
    .sort((a, b) => statusRankFromRecord(a) - statusRankFromRecord(b) || resultSortScoreFromRecord(b) - resultSortScoreFromRecord(a) || (numericOrNull(b.scan.score) || 0) - (numericOrNull(a.scan.score) || 0) || a.ticker.localeCompare(b.ticker));
}

function syncTickerRecordsFromLegacyCollections(){
  // Compatibility-only migration helper for older localStorage snapshots.
  // Normal runtime logic should not depend on legacy arrays as sources of truth.
  const records = normalizeTickerRecordsMap(state.tickerRecords || {});
  Object.values(records).forEach(record => {
    record.watchlist = {
      ...record.watchlist,
      inWatchlist:false,
      addedAt:'',
      addedScore:null,
      expiryAt:'',
      status:''
    };
    record.diary = {
      ...record.diary,
      hasDiary:false,
      diaryIds:[],
      lastOutcomeAt:'',
      records:[]
    };
  });
  (state.tickers || []).forEach(ticker => {
    const record = records[normalizeTicker(ticker)] || normalizeTickerRecord(baseTickerRecord(ticker));
    records[record.ticker] = record;
  });
  (state.scannerResults || []).map(normalizeCard).forEach(card => {
    const record = records[card.ticker] || normalizeTickerRecord(baseTickerRecord(card.ticker));
    mergeLegacyCardIntoRecord(record, card, {fromScanner:true, fromCards:false});
    records[card.ticker] = record;
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
      record.watchlist.inWatchlist = false;
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
  state.scannerResults = records
    .filter(record => record.scan.lastScannedAt || record.scan.verdict || Number.isFinite(record.scan.score))
    .map(tickerRecordToLegacyCard)
    .sort((a, b) => resultSortScore(b) - resultSortScore(a) || b.score - a.score || a.ticker.localeCompare(b.ticker));
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

function saveState(){
  syncCardDraftsFromDom();
  state.accountSize = Number($('accountSize').value || 0);
  state.riskPercent = Number($('riskPercent').value || 0);
  state.maxLossOverride = $('maxLossOverride') ? $('maxLossOverride').value.trim() : '';
  state.wholeSharesOnly = $('wholeSharesOnly') ? !!$('wholeSharesOnly').checked : true;
  state.maxRisk = currentMaxLoss();
  state.marketStatus = $('marketStatus').value;
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
  commitTickerState();
  renderStats();
  renderFinalUniversePreview();
}

function loadState(){
  Object.assign(state, createDefaultState(), safeStorageGet(key, {}) || {});
  delete state.lastImportRaw;
  state.aiEndpoint = state.aiEndpoint || defaultAiEndpoint;
  state.marketDataEndpoint = defaultMarketDataEndpoint;
  state.dataProvider = normalizeDataProvider(state.dataProvider);
  state.apiPlan = String(state.apiPlan || DEFAULT_API_PLAN);
  state.riskPercent = Number.isFinite(Number(state.riskPercent)) && Number(state.riskPercent) > 0
    ? Number(state.riskPercent)
    : ((Number(state.accountSize) > 0 && Number(state.maxRisk) > 0) ? Number(state.maxRisk) / Number(state.accountSize) : 0.01);
  state.maxLossOverride = state.maxLossOverride == null ? '' : String(state.maxLossOverride);
  state.wholeSharesOnly = state.wholeSharesOnly !== false;
  state.setupType = normalizeScanType(state.setupType);
  state.maxRisk = currentMaxLoss();
  state.tickers = parseTickers((state.tickers || []).join('\n'));
  state.universeMode = normalizeUniverseMode(state.universeMode) || defaultUniverseModeForTickers(state.tickers);
  state.recentTickers = uniqueTickers(state.recentTickers || []);
  state.tickerRecords = normalizeTickerRecordsMap(state.tickerRecords);
  state.lastAlertsSeenAt = String(state.lastAlertsSeenAt || '');
  state.dismissedAlertIds = Array.isArray(state.dismissedAlertIds) ? state.dismissedAlertIds.slice(-200) : [];
  state.watchlist = (state.watchlist || []).map(normalizeWatchlistEntry).filter(Boolean);
  state.scannerResults = (state.scannerResults || []).map(normalizeCard).filter(card => card.ticker);
  state.cards = (state.cards || []).map(normalizeCard).filter(card => card.ticker);
  state.tradeDiary = (state.tradeDiary || []).map(normalizeTradeRecord);
  state.symbolMeta = state.symbolMeta && typeof state.symbolMeta === 'object' ? state.symbolMeta : {};
  state.scannerDebug = Array.isArray(state.scannerDebug) ? state.scannerDebug : [];
  state.showExpiredWatchlist = !!state.showExpiredWatchlist;
  syncTickerRecordsFromLegacyCollections();
  syncLegacyCollectionsFromTickerRecords();
  persistState();
  $('accountSize').value = state.accountSize;
  if($('riskPercent')) $('riskPercent').value = state.riskPercent;
  if($('maxLossOverride')) $('maxLossOverride').value = state.maxLossOverride;
  if($('wholeSharesOnly')) $('wholeSharesOnly').checked = state.wholeSharesOnly !== false;
  $('marketStatus').value = state.marketStatus || 'S&P above 50 MA';
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
  updateProviderStatusNote();
  renderStats();
  renderTickerQuickLists();
  renderTvImportPreview(state.tickers && state.tickers.length ? state.tickers : [], state.tickers && state.tickers.length ? 'manual' : 'default');
  renderFinalUniversePreview();
  renderSavedScannerUniverseSnapshot();
  clearOcrReview();
  renderScannerResults();
  renderCards();
  renderScannerRulesPanel();
  renderWatchlist();
  renderWorkflowAlerts();
  renderTradeDiary();
  renderPatternAnalytics();
  renderPlannerPlanSummary();
  refreshRiskContextForActiveSetups();
}

function renderStats(){
  state.maxRisk = currentMaxLoss();
  const pct = state.accountSize ? ((state.maxRisk / state.accountSize) * 100).toFixed(1) : '0.0';
  $('accountStat').textContent = formatGbp(state.accountSize);
  $('riskStat').textContent = formatGbp(state.maxRisk);
  $('riskPctStat').textContent = `${pct}%`;
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

function addToWatchlist(tickerData){
  const entry = normalizeWatchlistEntry(tickerData);
  if(!entry) return null;
  const record = upsertTickerRecord(entry.ticker);
  mergeWatchlistIntoRecord(record, entry);
  commitTickerState();
  renderWatchlist();
  return entry;
}

function removeFromWatchlist(ticker){
  const symbol = normalizeTicker(ticker);
  const record = getTickerRecord(symbol);
  if(record){
    record.watchlist.inWatchlist = false;
    record.watchlist.addedAt = '';
    record.watchlist.addedScore = null;
    record.watchlist.expiryAt = '';
    record.watchlist.status = '';
  }
  commitTickerState();
  renderWatchlist();
}

function countTradingDaysBetween(startDate, endDate){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(startDate || '') || !/^\d{4}-\d{2}-\d{2}$/.test(endDate || '')) return 0;
  const start = new Date(`${startDate}T12:00:00Z`);
  const end = new Date(`${endDate}T12:00:00Z`);
  if(end <= start) return 0;
  let count = 0;
  const cursor = new Date(start);
  while(cursor < end){
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const day = cursor.getUTCDay();
    if(day !== 0 && day !== 6 && cursor <= end) count += 1;
  }
  return count;
}

function getTradingDaysRemaining(entry){
  const normalized = normalizeWatchlistEntry(entry);
  if(!normalized) return 0;
  const expiryDate = tradingDaysFrom(normalized.dateAdded, normalized.expiryAfterTradingDays);
  return countTradingDaysBetween(todayIsoDate(), expiryDate);
}

function purgeExpiredWatchlistEntries(){
  let changed = false;
  allTickerRecords().forEach(record => {
    if(!record.watchlist.inWatchlist || !record.watchlist.expiryAt) return;
    if(countTradingDaysBetween(todayIsoDate(), record.watchlist.expiryAt) <= 0){
      record.watchlist.inWatchlist = false;
      record.watchlist.status = '';
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
  box.innerHTML = `<div class="saved-universe-row"><div><strong>Saved scanner universe</strong><div class="tiny">${escapeHtml(String(snapshot.count))} symbol${snapshot.count === 1 ? '' : 's'} saved${savedAt ? ` • Last saved ${escapeHtml(savedAt)}` : ''}</div>${message ? `<div class="tiny">${message}</div>` : ''}</div><button class="ghost compactbutton" id="clearSavedUniverseBtn" type="button">Clear Saved</button></div>`;
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
  purgeExpiredWatchlistEntries();
  const box = $('watchlistList');
  if(!box) return;
  const showExpired = !!state.showExpiredWatchlist;
  const records = watchlistTickerRecords().filter(record => showExpired || record.lifecycle.stage !== 'expired');
  console.debug('RENDER_FROM_TICKER_RECORD', 'watchlist', records.length);
  if(!records.length){
    box.innerHTML = showExpired
      ? '<div class="summary">No watchlist entries match this filter right now.</div>'
      : '<div class="summary">No active watchlist entries yet. Add one from a ticker card after you review a setup.</div>';
    renderWorkflowAlerts();
    return;
  }
  box.innerHTML = '';
  records.forEach(record => {
    const entry = tickerRecordToWatchlistEntry(record);
    if(!entry) return;
    const remaining = getTradingDaysRemaining(entry);
    const lifecycleText = lifecycleLabel(record);
    const expired = record.lifecycle.stage === 'expired' || record.lifecycle.status === 'stale';
    const div = document.createElement('div');
    div.className = 'resultcompact';
    div.innerHTML = `<div class="resulthead rankedgrid"><div class="ticker">${escapeHtml(entry.ticker)}</div><div class="resultsummary"><div><strong>${escapeHtml(entry.verdictWhenAdded || 'Watchlist')}</strong></div><div class="tiny">Added ${escapeHtml(entry.dateAdded)}</div><div class="tiny">Score when added: ${escapeHtml(entry.scoreWhenAdded == null ? '-' : String(entry.scoreWhenAdded))}</div><div class="tiny">Trading days remaining: ${escapeHtml(String(remaining))}</div><div class="tiny">Lifecycle: ${escapeHtml(lifecycleText)}</div></div><div class="score ${expired ? 's-low' : scoreClass(Number.isFinite(entry.scoreWhenAdded) ? entry.scoreWhenAdded : 0)}">${escapeHtml(expired ? 'Expired' : (entry.scoreWhenAdded == null ? '-' : `${entry.scoreWhenAdded}/10`))}</div><div class="resultreview inline-status"><button class="primary" data-act="review">Review</button><button class="secondary" data-act="refresh-life">Refresh</button><button class="ghost" data-act="expire-life">${expired ? 'Reactivate' : 'Expire Now'}</button><button class="danger" data-act="remove-watch">Remove</button></div></div>`;
    div.querySelector('[data-act="review"]').title = 'Send back to scanner for re-shortlisting';
    div.querySelector('[data-act="review"]').onclick = () => { reviewWatchlistTicker(entry.ticker).catch(() => {}); };
    div.querySelector('[data-act="refresh-life"]').onclick = () => {
      refreshLifecycleStage(record, 'watchlist', WATCHLIST_EXPIRY_TRADING_DAYS, 'Watchlist refreshed manually.', 'system');
      commitTickerState();
      renderWatchlist();
    };
    div.querySelector('[data-act="expire-life"]').onclick = () => {
      if(expired){
        refreshLifecycleStage(record, 'watchlist', WATCHLIST_EXPIRY_TRADING_DAYS, 'Watchlist reactivated manually.', 'system');
      }else{
        setLifecycleStage(record, {
          stage:'expired',
          status:'stale',
          changedAt:new Date().toISOString(),
          expiresAt:todayIsoDate(),
          expiryReason:'Expired manually from watchlist.',
          reason:'Expired manually from watchlist.',
          source:'system'
        });
      }
      commitTickerState();
      renderWatchlist();
    };
    div.querySelector('[data-act="remove-watch"]').onclick = () => removeFromWatchlist(entry.ticker);
    box.appendChild(div);
  });
  renderWorkflowAlerts();
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
  commitTickerState();
  renderTickerQuickLists();
  renderScannerResults();
  renderCards();
  renderScannerRulesPanel();
  setStatus('apiStatus', message || 'Add tickers to the scanner universe first.');
}

async function runScannerWorkflow(options = {}){
  saveState();
  const {parsed, universe, blocked} = prepareScannerUniverse(options);
  if(blocked) return {done:0, failed:0, rejected:0};
  if(!options.syncInput) updateTickerInputFromState();
  updateRecentTickers(universe);
  renderTickerQuickLists();
  renderScannerRulesPanel();
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
  const result = await refreshMarketDataForTickers(universe, options);
  setStatus('apiStatus', `<span class="ok">Quality Pullback Scanner finished.</span> ${result.done} ranked, ${result.rejected} avoid, ${result.failed} failed.`);
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
    const entry = Number.isFinite(record.plan.entry) ? String(Number(record.plan.entry.toFixed(2))) : '';
    const stop = Number.isFinite(record.plan.stop) ? String(Number(record.plan.stop.toFixed(2))) : '';
    const firstTarget = Number.isFinite(record.plan.firstTarget) ? String(Number(record.plan.firstTarget.toFixed(2))) : '';
    const riskFit = evaluateRiskFit({entry, stop, ...currentRiskSettings()});
    const rewardRisk = evaluateRewardRisk(entry, stop, firstTarget);
    return {
      ticker:record.ticker,
      chartVerdict:record.scan.verdict || record.watchlist.status || 'Watch',
      verdict:record.scan.verdict || record.watchlist.status || 'Watch',
      qualityScore:Number.isFinite(record.scan.score) ? record.scan.score : '',
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
      notes:record.review.notes || record.scan.summary || '',
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

function plannerSummaryText(entry, stop, target){
  const rewardRisk = evaluateRewardRisk(entry, stop, target);
  return [
    `Entry: ${Number.isFinite(numericOrNull(entry)) ? fmtPrice(Number(entry)) : 'Not given'}`,
    `Stop: ${Number.isFinite(numericOrNull(stop)) ? fmtPrice(Number(stop)) : 'Not given'}`,
    `First Target: ${Number.isFinite(numericOrNull(target)) ? fmtPrice(Number(target)) : 'Not given'}`,
    `Planned R:R: ${rewardRisk.valid && Number.isFinite(rewardRisk.rrRatio) ? `${rewardRisk.rrRatio.toFixed(2)}R` : 'N/A'}`
  ].join(' • ');
}

function renderPlannerPlanSummary(entry = $('entryPrice') && $('entryPrice').value, stop = $('stopPrice') && $('stopPrice').value, target = $('targetPrice') && $('targetPrice').value){
  const box = $('plannerPlanSummary');
  if(!box) return;
  box.textContent = plannerSummaryText(entry, stop, target);
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
  const expiry = item.lifecycle.expiresAt ? ` • Expires ${item.lifecycle.expiresAt}` : '';
  const reason = item.lifecycle.expiryReason ? ` • ${item.lifecycle.expiryReason}` : '';
  box.textContent = `Lifecycle: ${item.lifecycle.stage || 'untracked'} • ${item.lifecycle.status || 'inactive'}${expiry}${reason}`;
}

function syncPlannerFromTicker(ticker){
  const snapshot = getCanonicalTradeSnapshot(ticker);
  if(!snapshot) return;
  if($('selectedTicker')) $('selectedTicker').value = snapshot.ticker;
  if($('entryPrice')) $('entryPrice').value = snapshot.entry || '';
  if($('stopPrice')) $('stopPrice').value = snapshot.stop || '';
  if($('targetPrice')) $('targetPrice').value = snapshot.firstTarget || '';
  renderPlannerPlanSummary(snapshot.entry, snapshot.stop, snapshot.firstTarget);
  calculate();
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
  if(!items.length) return '<div class="summary">No alerts in this group.</div>';
  return `<div class="alertgroup">${items.map(alert => `<div class="alertcard"><div class="alerthead"><div><div class="alertmeta"><span class="badge severity-${escapeHtml(alert.severity)}">${escapeHtml(alert.alertType.replaceAll('_', ' '))}</span><strong>${escapeHtml(alert.ticker)}</strong>${isAlertNew(alert) ? '<span class="pill">New</span>' : ''}</div><div class="tiny">${escapeHtml(alert.message)}</div><div class="tiny">Stage ${escapeHtml(alert.stage || 'untracked')} • ${escapeHtml(alert.status || 'inactive')}${alert.createdAt ? ` • ${escapeHtml(formatLocalTimestamp(alert.createdAt) || alert.createdAt)}` : ''}</div></div><div class="actions" style="margin-top:0"><button class="secondary compactbutton" type="button" data-act="alert-review" data-ticker="${escapeHtml(alert.ticker)}">Open Review</button>${allowDismiss && alert.severity !== 'action' ? `<button class="ghost compactbutton" type="button" data-act="alert-dismiss" data-id="${escapeHtml(alert.id)}">Dismiss</button>` : ''}</div></div></div>`).join('')}</div>`;
}

function renderWorkflowAlerts(){
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

function renderPatternAnalytics(){
  const box = $('patternAnalytics');
  if(!box) return;
  const analytics = computePatternAnalytics();
  const overview = analytics.overview;
  box.innerHTML = `<div class="analyticsgrid"><div class="analyticcard"><div><strong>Overview</strong></div><div class="analyticstats"><div class="analyticstat"><div class="tiny">Closed Trades</div><div class="big">${escapeHtml(String(overview.totalClosed))}</div></div><div class="analyticstat"><div class="tiny">Win Rate</div><div class="big">${escapeHtml(formatPercent(overview.winRate))}</div></div><div class="analyticstat"><div class="tiny">Average R</div><div class="big">${escapeHtml(formatDecimal(overview.averageR, 2, 'R'))}</div></div><div class="analyticstat"><div class="tiny">Median R</div><div class="big">${escapeHtml(formatDecimal(overview.medianR, 2, 'R'))}</div></div><div class="analyticstat"><div class="tiny">Wins / Losses</div><div class="big">${escapeHtml(`${overview.wins}/${overview.losses}`)}</div></div><div class="analyticstat"><div class="tiny">Net PnL</div><div class="big">${escapeHtml(Number.isFinite(overview.totalNetPnL) ? formatGbp(overview.totalNetPnL) : 'n/a')}</div></div></div><div class="tiny">Scratches ${escapeHtml(String(overview.scratches))} • Cancelled ${escapeHtml(String(overview.cancelled))}. Win rate excludes cancelled trades and open trades.</div></div><div class="analyticcard"><div><strong>Insight Callouts</strong></div>${analytics.insights.length ? `<div class="insightlist">${analytics.insights.map(item => `<div class="insightitem">${escapeHtml(item)}</div>`).join('')}</div>` : '<div class="summary">Need more closed-trade samples before the app can surface meaningful pattern callouts.</div>'}</div><div class="analyticcard"><div><strong>Setup Tags</strong></div>${renderAnalyticRows(analytics.setupTags.slice(0, 6), item => `<div class="analyticrow"><div class="analyticrowhead"><strong>${escapeHtml(item.key)}</strong><span class="tiny">n=${escapeHtml(String(item.count))}</span></div><div class="tiny">Win rate ${escapeHtml(formatPercent(item.winRate))} • Avg R ${escapeHtml(formatDecimal(item.averageR, 2, 'R'))} • Closed sample ${escapeHtml(String(item.sample))}</div></div>`)}</div><div class="analyticcard"><div><strong>Mistakes</strong></div>${renderAnalyticRows(analytics.mistakeTags.slice(0, 6), item => `<div class="analyticrow"><div class="analyticrowhead"><strong>${escapeHtml(item.key)}</strong><span class="tiny">n=${escapeHtml(String(item.count))}</span></div><div class="tiny">Avg R ${escapeHtml(formatDecimal(item.averageR, 2, 'R'))} • Loser rate ${escapeHtml(formatPercent(item.loserPct))} • Closed sample ${escapeHtml(String(item.sample))}</div></div>`)}</div><div class="analyticcard"><div><strong>Market Regime</strong></div>${renderAnalyticRows(analytics.marketRegime.slice(0, 6), item => `<div class="analyticrow"><div class="analyticrowhead"><strong>${escapeHtml(item.key)}</strong><span class="tiny">n=${escapeHtml(String(item.count))}</span></div><div class="tiny">Win rate ${escapeHtml(formatPercent(item.winRate))} • Avg R ${escapeHtml(formatDecimal(item.averageR, 2, 'R'))} • Closed sample ${escapeHtml(String(item.sample))}</div></div>`)}</div><div class="analyticcard"><div><strong>Process / Lifecycle</strong></div>${renderAnalyticRows(analytics.lifecycle, item => `<div class="analyticrow"><div class="analyticrowhead"><strong>${escapeHtml(item.path)}</strong><span class="tiny">count ${escapeHtml(String(item.count))}</span></div></div>`)}</div></div>`;
}

function currentRrThreshold(){
  return 1.5;
}

function resultReasonForRecord(record){
  const item = normalizeTickerRecord(record);
  const rrValue = numericOrNull(recordRrValue(item));
  if(Number.isFinite(item.marketData.price) && Number.isFinite(item.marketData.ma200) && item.marketData.price < item.marketData.ma200) return 'Trend broken';
  if(Number.isFinite(item.marketData.ma50) && Number.isFinite(item.marketData.ma200) && item.marketData.ma50 < item.marketData.ma200) return 'Trend broken';
  if(item.plan.firstTargetTooClose) return 'First target too close';
  if(Number.isFinite(rrValue) && rrValue < currentRrThreshold()) return 'Insufficient reward';
  if(item.scan.verdict === 'Avoid') return item.scan.pullbackType && /broken/i.test(item.scan.pullbackType) ? 'Trend broken' : 'Weak structure';
  if(item.plan.riskStatus === 'plan_missing') return 'Plan missing';
  if(item.scan.verdict === 'Entry' || item.scan.verdict === 'Near Entry'){
    return `Near ${escapeHtml(item.scan.scanType || '20MA')} with ${item.scan.pullbackStatus || 'acceptable structure'}`.replace(/&amp;/g, '&');
  }
  return item.scan.summary || 'Needs review';
}

function resultSupportLineForRecord(record){
  const item = normalizeTickerRecord(record);
  const rrValue = numericOrNull(recordRrValue(item));
  if(item.scan.verdict === 'Avoid') return item.meta.companyName || item.meta.exchange || 'Filtered from the main review queue.';
  const marketCaution = /below 50 ma/i.test(String(state.marketStatus || '')) ? 'Weak market caution' : '';
  const pieces = [
    item.plan.hasValidPlan ? riskStatusLabel(item.plan.riskStatus) : '',
    Number.isFinite(rrValue) ? `Est R:R ${rrValue.toFixed(2)}` : '',
    marketCaution
  ].filter(Boolean);
  return pieces.join(' • ') || (item.meta.companyName || 'Review in Setup Review for full detail.');
}

function isFilteredResultRecord(record){
  const item = normalizeTickerRecord(record);
  const rrValue = numericOrNull(recordRrValue(item));
  return item.scan.verdict === 'Avoid'
    || item.lifecycle.stage === 'avoided'
    || item.lifecycle.stage === 'expired'
    || (Number.isFinite(rrValue) && rrValue < currentRrThreshold());
}

function renderCompactResultCard(record){
  const item = normalizeTickerRecord(record);
  const combinedStatus = combinedStatusLabel(item.scan.verdict || item.watchlist.status || 'Watch', item.plan.riskStatus || item.scan.riskStatus || 'plan_missing');
  const scoreLabel = `${item.scan.score || 0}/10`;
  const rrValue = numericOrNull(recordRrValue(item));
  const detailMeta = [
    item.meta.companyName ? `${item.meta.companyName}${item.meta.exchange ? ` • ${item.meta.exchange}` : ''}` : '',
    Number.isFinite(item.marketData.price) ? `Price ${fmtPrice(Number(item.marketData.price))}` : '',
    Number.isFinite(item.marketData.ma20) ? `20 ${fmtPrice(Number(item.marketData.ma20))}` : '',
    Number.isFinite(item.marketData.ma50) ? `50 ${fmtPrice(Number(item.marketData.ma50))}` : '',
    Number.isFinite(item.marketData.ma200) ? `200 ${fmtPrice(Number(item.marketData.ma200))}` : '',
    Number.isFinite(item.marketData.rsi) ? `RSI ${fmtPrice(Number(item.marketData.rsi))}` : '',
    Number.isFinite(rrValue) ? `Est R:R ${rrValue.toFixed(2)}` : '',
    item.lifecycle.stage ? `Status: ${item.lifecycle.stage}` : ''
  ].filter(Boolean).join(' • ');
  return `<div class="resultcompact"><div class="resulthead rankedgrid"><div class="ticker">${escapeHtml(item.ticker)}</div><div class="resultmeta"><div class="resultreason">Reason: ${escapeHtml(resultReasonForRecord(item))}</div><div class="resultsupport">${escapeHtml(resultSupportLineForRecord(item))}</div></div><div class="score ${scoreClass(item.scan.score || 0)}">${escapeHtml(scoreLabel)}</div><div class="resultreview"><button class="primary" data-act="review">Review</button></div></div><div class="inline-status"><span class="badge ${statusClass(item.scan.verdict || item.watchlist.status || 'Watch')}">${escapeHtml(combinedStatus)}</span></div><details><summary>Details</summary><div class="tiny">${escapeHtml(detailMeta || 'No extra detail yet.')}</div>${renderEstimatedScannerPlanFromRecord(item)}</details></div>`;
}

function focusQueueAlerts(alerts){
  return alerts.filter(alert => ['became_ready','plan_near_expiry','needs_review'].includes(alert.alertType)).slice(0, 4);
}

function renderFocusQueue(alerts){
  const box = $('focusQueue');
  const count = $('focusCount');
  if(!box) return;
  const items = focusQueueAlerts(alerts);
  if(count) count.textContent = `${items.length} focus`;
  if(!items.length){
    box.innerHTML = '<div class="summary">No immediate focus items right now. Refresh the scanner or review the watchlist when the market changes.</div>';
    return;
  }
  box.innerHTML = items.map(alert => `<div class="focuscard"><div class="focushead"><div><strong>${escapeHtml(alert.ticker)}</strong><div class="tiny">${escapeHtml(alert.message)}</div></div><button class="primary compactbutton" type="button" data-act="focus-review" data-ticker="${escapeHtml(alert.ticker)}">Open Review</button></div></div>`).join('');
  box.querySelectorAll('[data-act="focus-review"]').forEach(button => {
    button.onclick = () => openRankedResultInReview(button.getAttribute('data-ticker') || '');
  });
}

function deriveWorkflowAlerts(){
  const rawAlerts = [];
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
    if(stage === 'planned' && hasValidPlan) rawAlerts.push({id:alertIdForRecord(item, 'became_ready', changedAt, stage), ticker:item.ticker, alertType:'became_ready', severity:'action', createdAt:changedAt, message:'Ready for review.', stage, status});
    if(needsReview) rawAlerts.push({id:alertIdForRecord(item, 'needs_review', changedAt, stage), ticker:item.ticker, alertType:'needs_review', severity:stage === 'reviewed' ? 'warning' : 'info', createdAt:changedAt, message:stage === 'reviewed' ? 'Reviewed setup still needs a plan.' : 'Still needs review.', stage, status});
    if(stage === 'planned' && hasValidPlan && Number.isFinite(remainingTradingDays) && remainingTradingDays <= 1 && remainingTradingDays >= 0) rawAlerts.push({id:alertIdForRecord(item, 'plan_near_expiry', expiresAt, remainingTradingDays), ticker:item.ticker, alertType:'plan_near_expiry', severity:'warning', createdAt:expiresAt || changedAt, message:remainingTradingDays === 0 ? 'Plan expires today.' : 'Plan expires within 1 trading day.', stage, status});
    const lifecycleStages = compressLifecycleStages(item);
    if(item.watchlist.inWatchlist && ['shortlisted','reviewed','planned'].includes(stage) && lifecycleStages.includes('watchlist')) rawAlerts.push({id:alertIdForRecord(item, 'watchlist_progressed', changedAt, stage), ticker:item.ticker, alertType:'watchlist_progressed', severity:'info', createdAt:changedAt, message:`Watchlist progressed to ${stage}.`, stage, status});
    if(stage === 'expired') rawAlerts.push({id:alertIdForRecord(item, 'expired', changedAt, stage), ticker:item.ticker, alertType:'expired', severity:'warning', createdAt:changedAt, message:'Setup expired.', stage, status});
    if(stage === 'entered') rawAlerts.push({id:alertIdForRecord(item, 'entered', changedAt, stage), ticker:item.ticker, alertType:'entered', severity:'action', createdAt:changedAt, message:'Trade entered.', stage, status});
    if(['exited','cancelled'].includes(stage) || (status === 'closed' && !isActionableAlertStage(stage))) rawAlerts.push({id:alertIdForRecord(item, 'closed', changedAt, stage), ticker:item.ticker, alertType:'closed', severity:'info', createdAt:changedAt, message:stage === 'cancelled' ? 'Trade cancelled.' : 'Trade closed.', stage, status});
    if(hostileMarket && ['planned','reviewed'].includes(stage) && (item.scan.verdict === 'Entry' || item.scan.verdict === 'Near Entry')) rawAlerts.push({id:alertIdForRecord(item, 'regime_warning', String(state.marketStatus), `${stage}-${item.scan.verdict}`), ticker:item.ticker, alertType:'regime_warning', severity:'warning', createdAt:changedAt || new Date().toISOString(), message:'Hostile market.', stage, status});
  });
  const dismissed = new Set(Array.isArray(state.dismissedAlertIds) ? state.dismissedAlertIds : []);
  const filtered = rawAlerts.filter(alert => !dismissed.has(alert.id));
  const byTicker = new Map();
  filtered.forEach(alert => {
    if(!byTicker.has(alert.ticker)) byTicker.set(alert.ticker, []);
    byTicker.get(alert.ticker).push(alert);
  });
  return [...byTicker.values()].map(items => {
    const sorted = items.slice().sort((a, b) => (ALERT_PRIORITY[a.alertType] || 999) - (ALERT_PRIORITY[b.alertType] || 999) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    const dominant = {...sorted[0]};
    const regime = items.find(item => item.alertType === 'regime_warning');
    if(regime && dominant.alertType !== 'regime_warning') dominant.message = `${dominant.message} Caution: hostile market.`;
    return dominant;
  }).sort((a, b) => (ALERT_PRIORITY[a.alertType] || 999) - (ALERT_PRIORITY[b.alertType] || 999) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')) || a.ticker.localeCompare(b.ticker));
}

function renderWorkflowAlerts(){
  const box = $('alertsList');
  const badge = $('newAlertsCount');
  if(!box) return;
  const alerts = deriveWorkflowAlerts();
  const groups = alertGroups(alerts);
  const newCount = alerts.filter(isAlertNew).length;
  if(badge) badge.textContent = `${newCount} new`;
  renderFocusQueue(alerts);
  box.innerHTML = `<div class="alertsection"><strong>Action now</strong>${renderAlertRows(groups.actionNow, false)}</div><div class="alertsection"><strong>Needs review</strong>${renderAlertRows(groups.needsReview)}</div><div class="alertsection"><strong>Expiring soon</strong>${renderAlertRows(groups.expiringSoon)}</div><div class="alertsection"><strong>Recently changed</strong>${renderAlertRows(groups.recent)}</div>`;
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
  box.innerHTML = `${lowSample ? '<div class="summary">Need at least 5 closed trades for meaningful pattern review. Counts are visible, but treat early stats cautiously.</div>' : ''}<div class="analyticsgrid"><div class="analyticcard"><div><strong>Overview</strong></div><div class="analyticstats"><div class="analyticstat"><div class="tiny">Closed Trades</div><div class="big">${escapeHtml(String(overview.totalClosed))}</div></div><div class="analyticstat"><div class="tiny">Win Rate</div><div class="big">${escapeHtml(formatPercent(overview.winRate))}</div></div><div class="analyticstat"><div class="tiny">Average R</div><div class="big">${escapeHtml(formatDecimal(overview.averageR, 2, 'R'))}</div></div><div class="analyticstat"><div class="tiny">Median R</div><div class="big">${escapeHtml(formatDecimal(overview.medianR, 2, 'R'))}</div></div><div class="analyticstat"><div class="tiny">Wins / Losses</div><div class="big">${escapeHtml(`${overview.wins}/${overview.losses}`)}</div></div><div class="analyticstat"><div class="tiny">Net PnL</div><div class="big">${escapeHtml(Number.isFinite(overview.totalNetPnL) ? formatGbp(overview.totalNetPnL) : 'n/a')}</div></div></div><div class="tiny">Scratches ${escapeHtml(String(overview.scratches))} • Cancelled ${escapeHtml(String(overview.cancelled))}. Win rate excludes cancelled trades and open trades.</div></div><div class="analyticcard ${lowSample ? 'mutedsection' : ''}"><div><strong>Insight Callouts</strong></div>${analytics.insights.length ? `<div class="insightlist">${analytics.insights.map(item => `<div class="insightitem">${escapeHtml(item)}</div>`).join('')}</div>` : '<div class="summary">Need more closed-trade samples before the app can surface meaningful pattern callouts.</div>'}</div><div class="analyticcard ${lowSample ? 'mutedsection' : ''}"><div><strong>Setup Tags</strong></div>${renderAnalyticRows(analytics.setupTags.slice(0, 6), item => `<div class="analyticrow"><div class="analyticrowhead"><strong>${escapeHtml(item.key)}</strong><span class="tiny">n=${escapeHtml(String(item.count))}</span></div><div class="tiny">Win rate ${escapeHtml(formatPercent(item.winRate))} • Avg R ${escapeHtml(formatDecimal(item.averageR, 2, 'R'))} • Closed sample ${escapeHtml(String(item.sample))}</div></div>`)}</div><div class="analyticcard ${lowSample ? 'mutedsection' : ''}"><div><strong>Mistakes</strong></div>${renderAnalyticRows(analytics.mistakeTags.slice(0, 6), item => `<div class="analyticrow"><div class="analyticrowhead"><strong>${escapeHtml(item.key)}</strong><span class="tiny">n=${escapeHtml(String(item.count))}</span></div><div class="tiny">Avg R ${escapeHtml(formatDecimal(item.averageR, 2, 'R'))} • Loser rate ${escapeHtml(formatPercent(item.loserPct))} • Closed sample ${escapeHtml(String(item.sample))}</div></div>`)}</div><div class="analyticcard ${lowSample ? 'mutedsection' : ''}"><div><strong>Market Regime</strong></div>${renderAnalyticRows(analytics.marketRegime.slice(0, 6), item => `<div class="analyticrow"><div class="analyticrowhead"><strong>${escapeHtml(item.key)}</strong><span class="tiny">n=${escapeHtml(String(item.count))}</span></div><div class="tiny">Win rate ${escapeHtml(formatPercent(item.winRate))} • Avg R ${escapeHtml(formatDecimal(item.averageR, 2, 'R'))} • Closed sample ${escapeHtml(String(item.sample))}</div></div>`)}</div><div class="analyticcard ${lowSample ? 'mutedsection' : ''}"><div><strong>Process / Lifecycle</strong></div>${renderAnalyticRows(analytics.lifecycle, item => `<div class="analyticrow"><div class="analyticrowhead"><strong>${escapeHtml(item.path)}</strong><span class="tiny">count ${escapeHtml(String(item.count))}</span></div></div>`)}</div></div>`;
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
    const tagSummary = [formatTagList(record.setupTags), formatTagList(record.mistakeTags), formatTagList(record.lessonTags)].filter(Boolean).join(' • ') || 'No tags yet';
    const div = document.createElement('div');
    div.className = 'diarycard';
    div.innerHTML = `<div class="diaryhead"><div class="diarymeta"><span class="badge ${statusClass(record.chartVerdict || record.verdict)}">${escapeHtml(record.chartVerdict || record.verdict)}</span><strong>${escapeHtml(record.ticker || 'Ticker')}</strong><span class="tiny">${escapeHtml(record.date || '')}</span><span class="tiny">${escapeHtml(statusLabel)}</span><span class="tiny">${escapeHtml(tickerRecord.lifecycle.stage || '')}</span></div><button class="danger" data-act="delete-trade">Delete</button></div><div class="tiny">Outcome ${escapeHtml(outcomeLabel)} • ${escapeHtml(resultRText)} • Gross ${escapeHtml(record.grossPnL || 'n/a')} • Net ${escapeHtml(record.netPnL || 'n/a')} • Held ${escapeHtml(record.heldDays || 'n/a')} day(s)</div><div class="tiny">Planned ${escapeHtml(plannedSummary)} • Actual ${escapeHtml(actualSummary)}</div><div class="tiny">Tags: ${escapeHtml(tagSummary)}</div><div><strong>Planned Snapshot</strong></div><div class="diarygrid"><div><label>Planned Entry</label><input data-field="plannedEntry" value="${escapeHtml(record.plannedEntry)}" placeholder="123.45" /></div><div><label>Planned Stop</label><input data-field="plannedStop" value="${escapeHtml(record.plannedStop)}" placeholder="119.80" /></div><div><label>Planned Target</label><input data-field="plannedFirstTarget" value="${escapeHtml(record.plannedFirstTarget)}" placeholder="130.00" /></div><div><label>Planned Risk/Share</label><input data-field="plannedRiskPerShare" value="${escapeHtml(record.plannedRiskPerShare)}" placeholder="3.65" /></div></div><div class="diarygrid"><div><label>Planned Reward/Share</label><input data-field="plannedRewardPerShare" value="${escapeHtml(record.plannedRewardPerShare)}" placeholder="7.30" /></div><div><label>Planned R:R</label><input data-field="plannedRR" value="${escapeHtml(record.plannedRR)}" placeholder="2.00" /></div><div><label>Planned Size</label><input data-field="plannedPositionSize" value="${escapeHtml(record.plannedPositionSize)}" placeholder="10" /></div><div><label>Planned Max Loss</label><input data-field="plannedMaxLoss" value="${escapeHtml(record.plannedMaxLoss)}" placeholder="40.00" /></div></div><div><strong>Actual Trade</strong></div><div class="diarygrid"><div><label>Opened</label><input data-field="openedAt" type="date" value="${escapeHtml(record.openedAt)}" /></div><div><label>Closed</label><input data-field="closedAt" type="date" value="${escapeHtml(record.closedAt)}" /></div><div><label>Actual Entry</label><input data-field="actualEntry" value="${escapeHtml(record.actualEntry)}" placeholder="123.60" /></div><div><label>Actual Exit</label><input data-field="actualExit" value="${escapeHtml(record.actualExit)}" placeholder="129.90" /></div></div><div class="diarygrid"><div><label>Actual Stop</label><input data-field="actualStop" value="${escapeHtml(record.actualStop)}" placeholder="119.80" /></div><div><label>Quantity</label><input data-field="actualQuantity" value="${escapeHtml(record.actualQuantity)}" placeholder="10" /></div><div><label>Gross PnL</label><input value="${escapeHtml(record.grossPnL || '')}" readonly /></div><div><label>Net PnL</label><input data-field="netPnL" value="${escapeHtml(record.netPnL)}" placeholder="Use to account for fees" /></div></div><div><strong>Outcome Review</strong></div><div class="diarygrid"><div><label>Verdict</label><select data-field="verdict"><option ${record.verdict === 'Watch' ? 'selected' : ''}>Watch</option><option ${record.verdict === 'Near Entry' ? 'selected' : ''}>Near Entry</option><option ${record.verdict === 'Entry' ? 'selected' : ''}>Entry</option><option ${record.verdict === 'Avoid' ? 'selected' : ''}>Avoid</option></select></div><div><label>Outcome</label><select data-field="outcome"><option value="" ${record.outcome === '' ? 'selected' : ''}>Not set</option><option ${record.outcome === 'Open' ? 'selected' : ''}>Open</option><option ${record.outcome === 'Win' ? 'selected' : ''}>Win</option><option ${record.outcome === 'Loss' ? 'selected' : ''}>Loss</option><option ${record.outcome === 'Scratch' ? 'selected' : ''}>Scratch</option><option ${record.outcome === 'Cancelled' ? 'selected' : ''}>Cancelled</option></select></div><div><label>Outcome Reason</label><select data-field="outcomeReason"><option value="" ${record.outcomeReason === '' ? 'selected' : ''}>Not set</option><option ${record.outcomeReason === 'target hit' ? 'selected' : ''}>target hit</option><option ${record.outcomeReason === 'stop hit' ? 'selected' : ''}>stop hit</option><option ${record.outcomeReason === 'manual exit' ? 'selected' : ''}>manual exit</option><option ${record.outcomeReason === 'invalidation' ? 'selected' : ''}>invalidation</option><option ${record.outcomeReason === 'expired' ? 'selected' : ''}>expired</option><option ${record.outcomeReason === 'never triggered' ? 'selected' : ''}>never triggered</option></select></div><div><label>Result in R</label><input value="${escapeHtml(record.resultR || '')}" readonly /></div></div><div class="diarygrid"><div><label>Execution Quality</label><select data-field="executionQuality"><option value="" ${record.executionQuality === '' ? 'selected' : ''}>Not set</option><option ${record.executionQuality === 'followed_plan' ? 'selected' : ''}>followed_plan</option><option ${record.executionQuality === 'early_entry' ? 'selected' : ''}>early_entry</option><option ${record.executionQuality === 'late_entry' ? 'selected' : ''}>late_entry</option><option ${record.executionQuality === 'early_exit' ? 'selected' : ''}>early_exit</option><option ${record.executionQuality === 'late_exit' ? 'selected' : ''}>late_exit</option><option ${record.executionQuality === 'partial' ? 'selected' : ''}>partial</option></select></div><div><label>Setup Quality</label><select data-field="setupQuality"><option value="" ${record.setupQuality === '' ? 'selected' : ''}>Not set</option><option ${record.setupQuality === 'A' ? 'selected' : ''}>A</option><option ${record.setupQuality === 'B' ? 'selected' : ''}>B</option><option ${record.setupQuality === 'C' ? 'selected' : ''}>C</option></select></div><div><label>Reviewed</label><input data-field="reviewedAt" type="date" value="${escapeHtml(record.reviewedAt)}" /></div><div><label>Lesson Learned</label><input data-field="lesson" value="${escapeHtml(record.lesson)}" placeholder="Wait for cleaner bounce" /></div></div><div class="diarygrid"><div><label>Setup Tags</label><input data-field="setupTags" value="${escapeHtml(formatTagList(record.setupTags))}" placeholder="20MA bounce, first pullback" />${renderDiaryTagButtons(record.id, 'setupTags', DIARY_SETUP_TAG_OPTIONS)}</div><div><label>Mistake Tags</label><input data-field="mistakeTags" value="${escapeHtml(formatTagList(record.mistakeTags))}" placeholder="early entry, stop moved" />${renderDiaryTagButtons(record.id, 'mistakeTags', DIARY_MISTAKE_TAG_OPTIONS)}</div><div><label>Lesson Tags</label><input data-field="lessonTags" value="${escapeHtml(formatTagList(record.lessonTags))}" placeholder="wait for bounce confirmation" />${renderDiaryTagButtons(record.id, 'lessonTags', DIARY_LESSON_TAG_OPTIONS)}</div><div><label>Before / After Evidence</label><input data-field="beforeImage" value="${escapeHtml(record.beforeImage)}" placeholder="before screenshot / ref" style="margin-bottom:6px" /><input data-field="afterImage" value="${escapeHtml(record.afterImage)}" placeholder="after screenshot / ref" /></div></div><div><label>Notes</label><textarea data-field="notes" placeholder="What happened, what to repeat, what to avoid next time.">${escapeHtml(record.notes)}</textarea></div>`;
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

function renderTradeDiary(){
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
    const tagSummary = [formatTagList(record.setupTags), formatTagList(record.mistakeTags), formatTagList(record.lessonTags)].filter(Boolean).join(' • ') || 'No tags yet';
    const div = document.createElement('div');
    div.className = 'diarycard';
    div.innerHTML = `<div class="diaryhead"><div class="diarymeta"><span class="badge ${statusClass(record.chartVerdict || record.verdict)}">${escapeHtml(record.chartVerdict || record.verdict)}</span><strong>${escapeHtml(record.ticker || 'Ticker')}</strong><span class="tiny">${escapeHtml(record.date || '')}</span><span class="tiny">${escapeHtml(tickerRecord.lifecycle.stage || '')}</span></div><button class="danger" data-act="delete-trade">Delete</button></div><div class="tiny">Outcome ${escapeHtml(outcomeLabel)} • ${escapeHtml(resultRText)} • Gross ${escapeHtml(record.grossPnL || 'n/a')} • Net ${escapeHtml(record.netPnL || 'n/a')} • Held ${escapeHtml(record.heldDays || 'n/a')} day(s)</div><div class="tiny">Planned ${escapeHtml(plannedSummary)} • Actual ${escapeHtml(actualSummary)}</div><div class="tiny">Tags: ${escapeHtml(tagSummary)}</div><div class="diarygrid"><div><label>Opened</label><input data-field="openedAt" type="date" value="${escapeHtml(record.openedAt)}" /></div><div><label>Closed</label><input data-field="closedAt" type="date" value="${escapeHtml(record.closedAt)}" /></div><div><label>Verdict</label><select data-field="verdict"><option ${record.verdict === 'Watch' ? 'selected' : ''}>Watch</option><option ${record.verdict === 'Near Entry' ? 'selected' : ''}>Near Entry</option><option ${record.verdict === 'Entry' ? 'selected' : ''}>Entry</option><option ${record.verdict === 'Avoid' ? 'selected' : ''}>Avoid</option></select></div><div><label>Outcome</label><select data-field="outcome"><option value="" ${record.outcome === '' ? 'selected' : ''}>Not set</option><option ${record.outcome === 'Open' ? 'selected' : ''}>Open</option><option ${record.outcome === 'Win' ? 'selected' : ''}>Win</option><option ${record.outcome === 'Loss' ? 'selected' : ''}>Loss</option><option ${record.outcome === 'Scratch' ? 'selected' : ''}>Scratch</option><option ${record.outcome === 'Cancelled' ? 'selected' : ''}>Cancelled</option></select></div></div><div class="diarygrid"><div><label>Planned Entry</label><input data-field="plannedEntry" value="${escapeHtml(record.plannedEntry)}" placeholder="123.45" /></div><div><label>Planned Stop</label><input data-field="plannedStop" value="${escapeHtml(record.plannedStop)}" placeholder="119.80" /></div><div><label>Planned Target</label><input data-field="plannedFirstTarget" value="${escapeHtml(record.plannedFirstTarget)}" placeholder="130.00" /></div><div><label>Planned Risk/Share</label><input data-field="plannedRiskPerShare" value="${escapeHtml(record.plannedRiskPerShare)}" placeholder="3.65" /></div></div><div class="diarygrid"><div><label>Actual Entry</label><input data-field="actualEntry" value="${escapeHtml(record.actualEntry)}" placeholder="123.60" /></div><div><label>Actual Exit</label><input data-field="actualExit" value="${escapeHtml(record.actualExit)}" placeholder="129.90" /></div><div><label>Actual Stop</label><input data-field="actualStop" value="${escapeHtml(record.actualStop)}" placeholder="119.80" /></div><div><label>Quantity</label><input data-field="actualQuantity" value="${escapeHtml(record.actualQuantity)}" placeholder="10" /></div></div><div class="diarygrid"><div><label>Outcome Reason</label><select data-field="outcomeReason"><option value="" ${record.outcomeReason === '' ? 'selected' : ''}>Not set</option><option ${record.outcomeReason === 'target hit' ? 'selected' : ''}>target hit</option><option ${record.outcomeReason === 'stop hit' ? 'selected' : ''}>stop hit</option><option ${record.outcomeReason === 'manual exit' ? 'selected' : ''}>manual exit</option><option ${record.outcomeReason === 'invalidation' ? 'selected' : ''}>invalidation</option><option ${record.outcomeReason === 'expired' ? 'selected' : ''}>expired</option></select></div><div><label>Execution Quality</label><select data-field="executionQuality"><option value="" ${record.executionQuality === '' ? 'selected' : ''}>Not set</option><option ${record.executionQuality === 'followed_plan' ? 'selected' : ''}>followed_plan</option><option ${record.executionQuality === 'early_entry' ? 'selected' : ''}>early_entry</option><option ${record.executionQuality === 'late_entry' ? 'selected' : ''}>late_entry</option><option ${record.executionQuality === 'early_exit' ? 'selected' : ''}>early_exit</option><option ${record.executionQuality === 'late_exit' ? 'selected' : ''}>late_exit</option><option ${record.executionQuality === 'partial' ? 'selected' : ''}>partial</option></select></div><div><label>Setup Quality</label><select data-field="setupQuality"><option value="" ${record.setupQuality === '' ? 'selected' : ''}>Not set</option><option ${record.setupQuality === 'A' ? 'selected' : ''}>A</option><option ${record.setupQuality === 'B' ? 'selected' : ''}>B</option><option ${record.setupQuality === 'C' ? 'selected' : ''}>C</option></select></div><div><label>Reviewed</label><input data-field="reviewedAt" type="date" value="${escapeHtml(record.reviewedAt)}" /></div></div><div class="diarygrid"><div><label>Setup Tags</label><input data-field="setupTags" value="${escapeHtml(formatTagList(record.setupTags))}" placeholder="20MA bounce, first pullback" /></div><div><label>Mistake Tags</label><input data-field="mistakeTags" value="${escapeHtml(formatTagList(record.mistakeTags))}" placeholder="early entry, stop moved" /></div><div><label>Lesson Tags</label><input data-field="lessonTags" value="${escapeHtml(formatTagList(record.lessonTags))}" placeholder="wait for bounce confirmation" /></div><div><label>Lesson Learned</label><input data-field="lesson" value="${escapeHtml(record.lesson)}" placeholder="Wait for cleaner bounce" /></div></div><div class="diarygrid"><div><label>Before Image Ref</label><input data-field="beforeImage" value="${escapeHtml(record.beforeImage)}" placeholder="stored chart / ref" /></div><div><label>After Image Ref</label><input data-field="afterImage" value="${escapeHtml(record.afterImage)}" placeholder="exit screenshot / ref" /></div><div><label>Gross PnL</label><input value="${escapeHtml(record.grossPnL || '')}" readonly /></div><div><label>Result in R</label><input value="${escapeHtml(record.resultR || '')}" readonly /></div></div><div><label>Notes</label><textarea data-field="notes" placeholder="Why this setup was worth tracking.">${escapeHtml(record.notes)}</textarea></div>`;
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
  return runScannerWorkflow({force:true, syncInput:true}).catch(err => {
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
  if($('selectedTicker').value === ticker) resetReview();
  updateTickerInputFromState();
  commitTickerState();
  renderTickerQuickLists();
  renderScannerResults();
  renderCards();
  updateTickerSearchStatus();
}

function removeCard(ticker){
  state.cards = state.cards.filter(card => card.ticker !== ticker);
  const record = getTickerRecord(ticker);
  if(record) record.review.cardOpen = false;
  delete uiState.promptOpen[ticker];
  delete uiState.responseOpen[ticker];
  if($('selectedTicker').value === ticker) resetReview();
  commitTickerState();
  renderCards();
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
  if(status === 'Strong Fit' || status === 'Entry' || status === 'Ready') return 'ready';
  if(status === 'Possible Fit' || status === 'Near Entry' || status === 'Near Pullback' || status === 'Near Setup') return 'near';
  if(status === 'Avoid') return 'avoid';
  return 'watch';
}

function riskStatusLabel(riskStatus){
  if(riskStatus === 'fits_risk') return 'Fits Risk';
  if(riskStatus === 'too_wide') return 'Too Wide';
  if(riskStatus === 'invalid_plan') return 'Invalid Plan';
  return 'Plan Missing';
}

function rrStateLabel(rrState){
  if(rrState === 'strong') return 'Strong R:R';
  if(rrState === 'acceptable') return 'Acceptable R:R';
  if(rrState === 'weak') return 'Weak R:R';
  return 'Invalid R:R';
}

function rrStateClass(rrState){
  if(rrState === 'strong') return 's-hi';
  if(rrState === 'acceptable') return 's-mid';
  return 's-low';
}

function combinedStatusLabel(chartVerdict, riskStatus){
  const verdict = String(chartVerdict || 'Watch');
  if(!riskStatus) return verdict;
  return `${verdict} • ${riskStatusLabel(riskStatus)}`;
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

function fmtPrice(value){
  return Number.isFinite(value) ? Number(value).toFixed(2) : '-';
}

function sleep(ms){
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatPercent(value){
  return Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)}%` : '-';
}

function todayIsoDate(){
  return new Date().toISOString().slice(0, 10);
}

function formatLocalTimestamp(timestamp){
  const time = Date.parse(timestamp || '');
  if(!Number.isFinite(time)) return '';
  return new Date(time).toLocaleString();
}

function businessDaysFromNow(days){
  return tradingDaysFrom(todayIsoDate(), days);
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

function readMarketCache(){
  const parsed = safeStorageGet(marketCacheKey, {});
  if(!parsed || typeof parsed !== 'object') return {};
  if(parsed.__schemaVersion !== MARKET_CACHE_SCHEMA_VERSION) return {};
  return parsed.entries && typeof parsed.entries === 'object' ? parsed.entries : {};
}

function writeMarketCache(cache){
  safeStorageSet(marketCacheKey, {
    __schemaVersion:MARKET_CACHE_SCHEMA_VERSION,
    updatedAt:new Date().toISOString(),
    entries:cache || {}
  });
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
    state.aiEndpoint,
    defaultAiEndpoint,
    '/.netlify/functions/analyse-setup'
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

function tradingDaysFrom(startDate, count){
  // Weekday-based trading-day approximation for lifecycle expiry. This excludes
  // weekends but does not model exchange holidays in this pass.
  const base = new Date(`${startDate}T12:00:00Z`);
  let added = 0;
  while(added < count){
    base.setUTCDate(base.getUTCDate() + 1);
    const day = base.getUTCDay();
    if(day !== 0 && day !== 6) added += 1;
  }
  return base.toISOString().slice(0, 10);
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
  const lookback = scanType === '50MA' ? 84 : 42;
  const windowRows = rows.slice(1, lookback);
  const highs = windowRows.map(row => numericOrNull(row.high ?? row.close)).filter(Number.isFinite).filter(value => value > price);
  if(!highs.length) return null;
  return Math.max(...highs);
}

function deriveTradePlan(data, scanType = '20MA'){
  const price = numericOrNull(data.price);
  const sma20 = numericOrNull(data.sma20);
  const sma50 = numericOrNull(data.sma50);
  if(!Number.isFinite(price) || !Number.isFinite(sma20) || !Number.isFinite(sma50)) return {entry:null, stop:null, target:null, riskPerShare:null, rewardPerShare:null, rr:null, rrState:'invalid', rrValid:false, firstTargetTooClose:false, positionSize:0};
  const support = scanType === '50MA' ? sma50 : sma20;
  const backupSupport = scanType === '50MA' ? sma20 : sma50;
  const entry = Math.max(price, support);
  const stop = Math.min(price, Math.min(support, backupSupport) * 0.99);
  const riskFit = evaluateRiskFit({
    entry,
    stop,
    ...currentRiskSettings()
  });
  const riskPerShare = Number.isFinite(riskFit.risk_per_share) ? riskFit.risk_per_share : null;
  const priorHigh = priorHighTarget(data, scanType);
  const target = Number.isFinite(priorHigh) ? priorHigh : (Number.isFinite(riskPerShare) ? Math.max(entry + (riskPerShare * 2), entry * 1.05) : null);
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
  const estimate = deriveTradePlan(card.marketData, scanType === 'unknown' ? '20MA' : scanType);
  if(!Number.isFinite(estimate.entry) && !Number.isFinite(estimate.stop) && !Number.isFinite(estimate.target) && !Number.isFinite(estimate.rr)) return null;
  return estimate;
}

function renderEstimatedScannerPlan(card){
  const estimate = scannerEstimateForCard(card);
  if(!estimate) return '<div class="tiny">Estimated entry zone: Not available • Estimated stop area: Not available • Estimated target area: Not available • Estimated R:R: N/A</div>';
  return `<div class="tiny">Estimated entry zone: ${escapeHtml(Number.isFinite(estimate.entry) ? fmtPrice(estimate.entry) : 'Not available')} • Estimated stop area: ${escapeHtml(Number.isFinite(estimate.stop) ? fmtPrice(estimate.stop) : 'Not available')} • Estimated target area: ${escapeHtml(Number.isFinite(estimate.target) ? fmtPrice(estimate.target) : 'Not available')} • Estimated R:R: ${escapeHtml(estimate.rrValid && Number.isFinite(estimate.rr) ? `${estimate.rr.toFixed(2)}R` : 'N/A')}</div>`;
}

function renderEstimatedScannerPlanFromRecord(record){
  const item = normalizeTickerRecord(record);
  return `<div class="tiny">Estimated entry zone: ${escapeHtml(Number.isFinite(item.scan.estimatedEntryZone) ? fmtPrice(item.scan.estimatedEntryZone) : 'Not available')} • Estimated stop area: ${escapeHtml(Number.isFinite(item.scan.estimatedStopArea) ? fmtPrice(item.scan.estimatedStopArea) : 'Not available')} • Estimated target area: ${escapeHtml(Number.isFinite(item.scan.estimatedTargetArea) ? fmtPrice(item.scan.estimatedTargetArea) : 'Not available')} • Estimated R:R: ${escapeHtml(Number.isFinite(item.scan.estimatedRR) ? `${item.scan.estimatedRR.toFixed(2)}R` : 'N/A')}</div>`;
}

function buildSuitabilitySummary(parts){
  const reasons = [];
  if(parts.trend >= 3) reasons.push('trend structure is intact');
  if(parts.pullback >= 2) reasons.push('pullback is close to support');
  if(parts.tradeQuality >= 2) reasons.push('trade plan is mostly defined');
  if(parts.scanType === '50MA') reasons.push('deeper 50 MA setup');
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
  const item = normalizeTickerRecord(record);
  if(loading) return '<span class="warntext">Sending setup to the AI endpoint...</span>';
  if(item.review.lastError){
    if(isAnalysisErrorMessage(item.review.lastError)){
      return `<span class="badtext">${escapeHtml(item.review.lastError)}</span>`;
    }
    return `<span class="badtext">${escapeHtml(marketDataManualReviewSummary(item.review.lastError))}</span>`;
  }
  if(item.review.aiAnalysisRaw) return 'Latest prompt and response saved to this ticker.';
  if(analysisBusy) return 'Another setup is being analysed right now.';
  return 'No AI analysis saved yet.';
}

function buildTickerPromptFromRecord(record){
  const item = normalizeTickerRecord(record);
  const projected = item.scan.analysisProjection || {};
  const manualReview = item.review.manualReview || {};
  const checks = (manualReview && manualReview.checks) || (item.scan.flags && item.scan.flags.checks) || {};
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
    entry:formatPlanFieldValue(item.plan.entry),
    stop:formatPlanFieldValue(item.plan.stop),
    target:formatPlanFieldValue(item.plan.firstTarget),
    marketData
  };
  return [
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
    '- Entry should be logical (reclaim, bounce, or breakout)',
    '- Stop should sit below support',
    '- First target should be prior swing high',
    '- Must respect GBP 40 max loss',
    '',
    'Output keys:',
    'setup_type',
    'plain_english_chart_read',
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
    '- quality_score = integer 1-10',
    '- confidence_score = integer 1-100',
    '- If unknown -> null',
    '- Keep explanations short and practical',
    '',
    payload.notes ? `Notes:\n${payload.notes}` : 'Notes: none',
    payload.chartAttached === 'yes' ? `Chart attached: ${payload.chartFileName || 'yes'}` : 'Chart attached: no',
    payload.marketData ? `Market data: ${JSON.stringify(payload.marketData)}` : 'Market data: none',
    '',
    'Return valid JSON only.'
  ].join('\n');
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
  const verdictRank = verdict === 'Entry' ? 4 : (verdict === 'Near Entry' ? 3 : (verdict === 'Watch' ? 2 : (verdict === 'Manual Review' ? 1 : 0)));
  const riskRank = riskStatus === 'fits_risk' ? 2 : (riskStatus === 'too_wide' ? 1 : 0);
  return (verdictRank * 1000) + (riskRank * 100) + (Number.isFinite(rrRatio) ? rrRatio : 0);
}

function buildVerdictReason({suitability, scan, riskFit, rewardRisk, checks}){
  if(scan.status === 'Avoid') return scan.summary || 'Technical structure is invalid for this setup.';
  if(riskFit.risk_status === 'plan_missing') return 'Trade plan is incomplete. Define entry, stop, and first target.';
  if(riskFit.risk_status === 'invalid_plan') return 'Trade plan is invalid. Entry must sit above stop.';
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
  const tradePlan = deriveTradePlan(data, scanType);
  const pullbackType = classifyPullbackType(data);
  const distance20 = Number.isFinite(price) && Number.isFinite(sma20) && sma20 > 0 ? Math.abs(price - sma20) / sma20 : null;
  const distance50 = Number.isFinite(price) && Number.isFinite(sma50) && sma50 > 0 ? Math.abs(price - sma50) / sma50 : null;
  const mediumTermStrength = Number.isFinite(perf3m) && perf3m > 0;
  const trend =
    (checks.above50 ? 1 : 0) +
    (checks.above200 ? 1 : 0) +
    (checks.ma50gt200 ? 1 : 0) +
    (mediumTermStrength ? 1 : 0);
  const controlledPullback = scanType === '50MA'
    ? (checks.near50 || (Number.isFinite(distance50) && distance50 <= 0.05))
    : (scanType === '20MA'
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
  let total = trend + pullback + tradeQuality;
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
  const volume = numericOrNull(data.volume);
  const avgVolume30d = numericOrNull(data.avgVolume30d);
  const near20 = isNearLevel(price, sma20, 0.025);
  const near50 = isNearLevel(price, sma50, 0.035);
  const trendStrong = Number.isFinite(price) && Number.isFinite(sma50) && Number.isFinite(sma200) && Number.isFinite(sma20) && price > sma50 && price > sma200 && sma20 > sma50 && sma50 > sma200;
  const structureBroken = Number.isFinite(price) && Number.isFinite(sma50) && Number.isFinite(sma20) && price < sma50 && sma20 < sma50;
  return {
    trendStrong,
    above50:Number.isFinite(price) && Number.isFinite(sma50) && price > sma50,
    above200:Number.isFinite(price) && Number.isFinite(sma200) && price > sma200,
    ma50gt200:Number.isFinite(sma50) && Number.isFinite(sma200) && sma50 > sma200,
    near20,
    near50,
    stabilising:near20 || near50,
    bounce:Number.isFinite(data.perf1w) && data.perf1w > 0,
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
  const tradePlan = deriveTradePlan(safeData, scanType);
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
  const tradePlan = suitability ? suitability.tradePlan : deriveTradePlan(sourceData, scanType === 'unknown' ? '20MA' : scanType);
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

function refreshRiskContextForActiveSetups(){
  state.maxRisk = currentMaxLoss();
  allTickerRecords().forEach(recomputeRiskContextForRecord);
  commitTickerState();
  renderStats();
  renderScannerResults();
  renderCards();
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

function resolveScanType(card, data, checks){
  const globalType = currentSetupType();
  if(globalType !== 'unknown') return globalType;
  const explicit = normalizeScanType((card && card.scanType) || (data && data.scanType));
  if(explicit) return explicit;
  if(checks && checks.near20 && !checks.near50) return '20MA';
  if(checks && checks.near50 && !checks.near20) return '50MA';
  return 'unknown';
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
  const initialScanType = resolveScanType(safeCard, safeData, preflightChecks);
  const plan = tradePlan || deriveTradePlan(safeData, initialScanType === 'unknown' ? '20MA' : initialScanType);
  const safeChecks = mergeDerivedChecks((safeCard && safeCard.checks) || {}, checks || baseChecks, plan);
  const scanType = resolveScanType(safeCard, safeData, safeChecks);
  const price = numericOrNull(safeData.price ?? safeCard.price);
  const sma20 = numericOrNull(safeData.sma20 ?? safeCard.sma20);
  const sma50 = numericOrNull(safeData.sma50 ?? safeCard.sma50);
  const sma200 = numericOrNull(safeData.sma200 ?? safeCard.sma200);
  const perf1w = numericOrNull(safeData.perf1w ?? safeCard.perf1w);
  const perf3m = numericOrNull(safeData.perf3m ?? safeCard.perf3m);
  const volume = numericOrNull(safeData.volume ?? safeCard.volume);
  const avgVolume30d = numericOrNull(safeData.avgVolume30d ?? safeCard.avgVolume30d);
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
  }else if((scanType === '20MA' && Number.isFinite(dist20) && dist20 < -0.06) || (scanType === '50MA' && Number.isFinite(dist50) && dist50 < -0.07) || safeChecks.structureBroken){
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

  let stabilisationState = 'none';
  if((pullbackZone === 'near_20ma' || pullbackZone === 'near_50ma') && safeChecks.stabilising && safeChecks.bounce){
    stabilisationState = 'clear';
  }else if((pullbackZone === 'near_20ma' || pullbackZone === 'near_50ma') && (safeChecks.stabilising || (Number.isFinite(perf1w) && perf1w > -2))){
    stabilisationState = 'early';
  }

  let bounceState = 'none';
  if(safeChecks.bounce && ((Number.isFinite(perf1w) && perf1w > 0) || (Number.isFinite(price) && Number.isFinite(sma20) && price > sma20))){
    bounceState = 'confirmed';
  }else if(safeChecks.bounce || (Number.isFinite(perf1w) && perf1w >= -0.5)){
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
  const tradePlan = deriveTradePlan(marketData, scanType === 'unknown' ? '20MA' : scanType);
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
    maxRisk:state.maxRisk,
    chartAttached:!!(safeCard.chartRef && safeCard.chartRef.dataUrl),
    chartFileName:safeCard.chartRef ? safeCard.chartRef.name : '',
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
  return [
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
    '- Entry should be logical (reclaim, bounce, or breakout)',
    '- Stop should sit below support',
    '- First target should be prior swing high',
    '- Must respect GBP 40 max loss',
    '',
    'Output keys:',
    'setup_type',
    'plain_english_chart_read',
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
    '- quality_score = integer 1-10',
    '- confidence_score = integer 1-100',
    '- If unknown -> null',
    '- Keep explanations short and practical',
    '',
    'Return valid JSON only.'
  ].join('\n');
}

function normalizeImportedStatus(value){
  const v = String(value || '').trim().toLowerCase();
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
    entry:String(raw.entry || '').trim(),
    stop:String(raw.stop || '').trim(),
    first_target:String(raw.first_target || raw.target || '').trim(),
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

function normalizeAnalysisReasons(rawReasons, planValid, rewardRisk, previousState, rawChartRead){
  const reasons = [];
  const previousAnalysis = previousState && previousState.analysis && typeof previousState.analysis === 'object' ? previousState.analysis : null;
  if(previousAnalysis && previousAnalysis.trend_status) reasons.push(`Trend: ${previousAnalysis.trend_status}`);
  if(previousAnalysis && previousAnalysis.pullback_status) reasons.push(`Pullback: ${previousAnalysis.pullback_status}`);
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
  const entry = normalizeAnalysisPlanField(parsed.entry);
  const stop = normalizeAnalysisPlanField(parsed.stop);
  const firstTarget = normalizeAnalysisPlanField(parsed.first_target);
  const numericEntry = numericOrNull(entry);
  const numericStop = numericOrNull(stop);
  const numericFirstTarget = numericOrNull(firstTarget);
  const rewardRisk = evaluateRewardRisk(numericEntry, numericStop, numericFirstTarget);
  const planValid = rewardRisk.valid;
  const riskFit = planValid ? evaluateRiskFit({entry:numericEntry, stop:numericStop, ...currentRiskSettings()}) : {
    max_loss:currentMaxLoss(),
    risk_per_share:null,
    position_size:0,
    risk_status:'plan_missing'
  };
  const keyReasons = normalizeAnalysisReasons(parsed.key_reasons, planValid, rewardRisk, previousState, parsed.plain_english_chart_read);
  const safeRisks = (Array.isArray(parsed.risks) ? parsed.risks : []).map(item => String(item || '').trim()).filter(Boolean).filter(item => {
    const lower = item.toLowerCase();
    return planValid || !(lower.includes('entry') || lower.includes('stop') || lower.includes('reward:risk') || lower.includes('r:r'));
  });
  return {
    setup_type:parsed.setup_type || previousState.setupType || '',
    verdict:parsed.verdict,
    plain_english_chart_read:parsed.plain_english_chart_read,
    entry:planValid ? entry : '',
    stop:planValid ? stop : '',
    first_target:planValid ? firstTarget : '',
    entryDefined:planValid,
    stopDefined:planValid,
    targetDefined:planValid,
    risk_per_share:planValid && Number.isFinite(rewardRisk.riskPerShare) ? rewardRisk.riskPerShare.toFixed(2) : '',
    reward_per_share:planValid && Number.isFinite(rewardRisk.rewardPerShare) ? rewardRisk.rewardPerShare.toFixed(2) : '',
    reward_risk:planValid && Number.isFinite(rewardRisk.rrRatio) ? rewardRisk.rrRatio.toFixed(2) : '',
    rr_state:planValid ? rewardRisk.rrState : '',
    rr_badge:planValid ? rrStateLabel(rewardRisk.rrState) : '',
    position_size:planValid && Number.isFinite(riskFit.position_size) && riskFit.position_size > 0 ? String(riskFit.position_size) : '',
    risk_status:planValid ? riskFit.risk_status : 'plan_missing',
    max_loss:planValid && Number.isFinite(riskFit.max_loss) ? riskFit.max_loss.toFixed(2) : '',
    quality_score:parsed.quality_score,
    confidence_score:parsed.confidence_score,
    key_reasons:keyReasons,
    risks:safeRisks,
    final_verdict:parsed.final_verdict,
    plan_metrics_valid:planValid,
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
  saveState();
  const record = upsertTickerRecord(ticker);
  record.review.cardOpen = true;
  let card = tickerRecordToLegacyCard(record);
  const previousTickerState = normalizeCard(card);
  const notesEl = $(`notes-${ticker}`);
  if(notesEl){
    record.review.notes = notesEl.value;
    card.notes = notesEl.value;
  }
  card.lastPrompt = buildTickerPrompt(card);
  record.review.lastPrompt = card.lastPrompt;
  card.lastError = '';
  record.review.lastError = '';
  uiState.loadingTicker = ticker;
  uiState.responseOpen[ticker] = true;
  commitTickerState();
  renderCards();
  const endpoints = analysisEndpoints();
  if(!endpoints.length){
    card.lastError = 'AI analysis failed: add an AI endpoint URL first.';
    uiState.loadingTicker = '';
    renderCards();
    return;
  }
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
        if(!response.ok) throw new Error(buildAnalysisErrorMessage(response.status, data, 'Analysis request failed.'));
        lastError = '';
        break;
      }catch(err){
        lastError = err && err.name === 'AbortError'
          ? 'The analysis request timed out. Retry the setup.'
          : String(err.message || 'Analysis request failed.');
        response = null;
      }finally{
        clearTimeout(timer);
      }
    }
    if(!response) throw new Error(lastError);
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
    mergeLegacyCardIntoRecord(record, card, {fromCards:true, cardOpen:true});
    if(($('selectedTicker') && normalizeTicker($('selectedTicker').value) === card.ticker) || !normalizeTicker(($('selectedTicker') && $('selectedTicker').value) || '')){
      syncPlannerFromTicker(card.ticker);
    }
    commitTickerState();
  }catch(err){
    const baseMessage = err && err.name === 'AbortError'
      ? 'The analysis request timed out. Retry the setup.'
      : String(err.message || 'Analysis request failed.');
    card.lastError = isAnalysisErrorMessage(baseMessage) ? baseMessage : `AI analysis failed: ${baseMessage}`;
    mergeLegacyCardIntoRecord(record, card, {fromCards:true, cardOpen:true});
    commitTickerState();
  }finally{
    uiState.loadingTicker = '';
    renderCards();
  }
}

function renderAnalysisPanel(card){
  if(!card.lastResponse) return '<div class="tiny">No AI response saved yet.</div>';
  if(card.lastAnalysis){
    const analysis = normalizeAnalysisResult(card.lastAnalysis, card);
    const reasons = analysis.key_reasons.length ? analysis.key_reasons.map(item => `<li>${escapeHtml(item)}</li>`).join('') : '<li>No key reasons returned.</li>';
    const risks = analysis.risks.length ? analysis.risks.map(item => `<li>${escapeHtml(item)}</li>`).join('') : '<li>No risks returned.</li>';
    const quality = Number.isFinite(analysis.quality_score) ? `${analysis.quality_score}/10` : 'n/a';
    const confidence = Number.isFinite(analysis.confidence_score) ? `${analysis.confidence_score}/100` : 'n/a';
    const renderModel = {
      verdict:analysis.verdict,
      setup_type:analysis.setup_type || 'Not given',
      entry:analysis.plan_metrics_valid ? (analysis.entry || 'Not given') : 'Not given',
      stop:analysis.plan_metrics_valid ? (analysis.stop || 'Not given') : 'Not given',
      first_target:analysis.plan_metrics_valid ? (analysis.first_target || 'Not given') : 'Not given',
      risk_per_share:analysis.plan_metrics_valid ? analysis.risk_per_share : 'N/A',
      reward_per_share:analysis.plan_metrics_valid ? analysis.reward_per_share : 'N/A',
      reward_risk:analysis.plan_metrics_valid ? analysis.reward_risk : 'N/A',
      position_size:analysis.plan_metrics_valid ? analysis.position_size : 'N/A',
      risk_status:analysis.plan_metrics_valid ? riskStatusLabel(analysis.risk_status) : 'N/A',
      rr_badge:analysis.plan_metrics_valid ? analysis.rr_badge : '',
      key_reasons:analysis.key_reasons,
      risks:analysis.risks
    };
    console.log('FINAL_RENDERED_ANALYSIS_CARD', renderModel);
    return `<div class="responsegrid"><div class="responsechips"><span class="badge ${statusClass(analysis.verdict)}">${escapeHtml(analysis.verdict)}</span><span class="score ${scoreClass(Number.isFinite(analysis.quality_score) ? analysis.quality_score : 0)}">${escapeHtml(quality)}</span>${analysis.plan_metrics_valid ? `<span class="badge ${statusClass(analysis.risk_status || 'Watch')}">${escapeHtml(riskStatusLabel(analysis.risk_status || 'plan_missing'))}</span>` : ''}${analysis.plan_metrics_valid && analysis.rr_state ? `<span class="badge ${rrStateClass(analysis.rr_state)}">${escapeHtml(analysis.rr_badge)}</span>` : ''}</div><div><strong>Setup Type</strong><div class="tiny">${escapeHtml(renderModel.setup_type)}</div></div><div><strong>Chart Read</strong><div class="tiny">${escapeHtml(analysis.plain_english_chart_read || 'No chart read returned.')}</div></div><div class="row3"><div><strong>Planned Entry</strong><div class="tiny">${escapeHtml(renderModel.entry)}</div></div><div><strong>Planned Stop</strong><div class="tiny">${escapeHtml(renderModel.stop)}</div></div><div><strong>Planned First Target</strong><div class="tiny">${escapeHtml(renderModel.first_target)}</div></div></div><div class="row3"><div><strong>Max Loss</strong><div class="tiny">${escapeHtml(analysis.plan_metrics_valid ? (analysis.max_loss || 'Not given') : 'N/A')}</div></div><div><strong>Planned Risk / Share</strong><div class="tiny">${escapeHtml(renderModel.risk_per_share)}</div></div><div><strong>Planned Reward / Share</strong><div class="tiny">${escapeHtml(renderModel.reward_per_share)}</div></div></div><div class="row3"><div><strong>Risk Status</strong><div class="tiny">${escapeHtml(renderModel.risk_status)}</div></div><div><strong>Planned R:R</strong><div class="tiny">${escapeHtml(renderModel.reward_risk)}</div></div><div><strong>Planned Position Size</strong><div class="tiny">${escapeHtml(renderModel.position_size)}</div></div></div><div class="row3"><div><strong>Confidence</strong><div class="tiny">${escapeHtml(confidence)}</div></div><div><strong>Final Verdict</strong><div class="tiny">${escapeHtml(analysis.final_verdict || 'No final verdict returned.')}</div></div><div></div></div><div><strong>Key Reasons</strong><ul class="tiny">${reasons}</ul></div><div><strong>Risks</strong><ul class="tiny">${risks}</ul></div><details><summary>Raw Response</summary><div class="mutebox">${escapeHtml(card.lastResponse)}</div></details></div>`;
  }
  return `<div class="mutebox">${escapeHtml(card.lastResponse)}</div>`;
}

function renderAnalysisPanelFromRecord(record){
  const item = normalizeTickerRecord(record);
  if(!item.review.aiAnalysisRaw) return '<div class="tiny">No AI response saved yet.</div>';
  if(item.review.normalizedAnalysis){
    const analysis = normalizeAnalysisResult(item.review.normalizedAnalysis, tickerRecordToLegacyCard(item));
    const reasons = analysis.key_reasons.length ? analysis.key_reasons.map(entry => `<li>${escapeHtml(entry)}</li>`).join('') : '<li>No key reasons returned.</li>';
    const risks = analysis.risks.length ? analysis.risks.map(entry => `<li>${escapeHtml(entry)}</li>`).join('') : '<li>No risks returned.</li>';
    const quality = Number.isFinite(analysis.quality_score) ? `${analysis.quality_score}/10` : 'n/a';
    const confidence = Number.isFinite(analysis.confidence_score) ? `${analysis.confidence_score}/100` : 'n/a';
    const renderModel = {
      verdict:analysis.verdict,
      setup_type:analysis.setup_type || 'Not given',
      entry:analysis.plan_metrics_valid ? (analysis.entry || 'Not given') : 'Not given',
      stop:analysis.plan_metrics_valid ? (analysis.stop || 'Not given') : 'Not given',
      first_target:analysis.plan_metrics_valid ? (analysis.first_target || 'Not given') : 'Not given',
      risk_per_share:analysis.plan_metrics_valid ? analysis.risk_per_share : 'N/A',
      reward_per_share:analysis.plan_metrics_valid ? analysis.reward_per_share : 'N/A',
      reward_risk:analysis.plan_metrics_valid ? analysis.reward_risk : 'N/A',
      position_size:analysis.plan_metrics_valid ? analysis.position_size : 'N/A',
      risk_status:analysis.plan_metrics_valid ? riskStatusLabel(analysis.risk_status) : 'N/A',
      rr_badge:analysis.plan_metrics_valid ? analysis.rr_badge : ''
    };
    return `<div class="responsegrid"><div class="responsechips"><span class="badge ${statusClass(analysis.verdict)}">${escapeHtml(analysis.verdict)}</span><span class="score ${scoreClass(Number.isFinite(analysis.quality_score) ? analysis.quality_score : 0)}">${escapeHtml(quality)}</span>${analysis.plan_metrics_valid ? `<span class="badge ${statusClass(analysis.risk_status || 'Watch')}">${escapeHtml(riskStatusLabel(analysis.risk_status || 'plan_missing'))}</span>` : ''}${analysis.plan_metrics_valid && analysis.rr_state ? `<span class="badge ${rrStateClass(analysis.rr_state)}">${escapeHtml(analysis.rr_badge)}</span>` : ''}</div><div><strong>Setup Type</strong><div class="tiny">${escapeHtml(renderModel.setup_type)}</div></div><div><strong>Chart Read</strong><div class="tiny">${escapeHtml(analysis.plain_english_chart_read || 'No chart read returned.')}</div></div><div class="row3"><div><strong>Planned Entry</strong><div class="tiny">${escapeHtml(renderModel.entry)}</div></div><div><strong>Planned Stop</strong><div class="tiny">${escapeHtml(renderModel.stop)}</div></div><div><strong>Planned First Target</strong><div class="tiny">${escapeHtml(renderModel.first_target)}</div></div></div><div class="row3"><div><strong>Max Loss</strong><div class="tiny">${escapeHtml(analysis.plan_metrics_valid ? (analysis.max_loss || 'Not given') : 'N/A')}</div></div><div><strong>Planned Risk / Share</strong><div class="tiny">${escapeHtml(renderModel.risk_per_share)}</div></div><div><strong>Planned Reward / Share</strong><div class="tiny">${escapeHtml(renderModel.reward_per_share)}</div></div></div><div class="row3"><div><strong>Risk Status</strong><div class="tiny">${escapeHtml(renderModel.risk_status)}</div></div><div><strong>Planned R:R</strong><div class="tiny">${escapeHtml(renderModel.reward_risk)}</div></div><div><strong>Planned Position Size</strong><div class="tiny">${escapeHtml(renderModel.position_size)}</div></div></div><div class="row3"><div><strong>Confidence</strong><div class="tiny">${escapeHtml(confidence)}</div></div><div><strong>Final Verdict</strong><div class="tiny">${escapeHtml(analysis.final_verdict || 'No final verdict returned.')}</div></div><div></div></div><div><strong>Key Reasons</strong><ul class="tiny">${reasons}</ul></div><div><strong>Risks</strong><ul class="tiny">${risks}</ul></div><details><summary>Raw Response</summary><div class="mutebox">${escapeHtml(item.review.aiAnalysisRaw)}</div></details></div>`;
  }
  console.debug('LEGACY_PATH_STILL_IN_USE', 'renderAnalysisPanelFromRecord-fallback', item.ticker);
  return `<div class="mutebox">${escapeHtml(item.review.aiAnalysisRaw)}</div>`;
}

function statusRank(status){
  if(status === 'Strong Fit' || status === 'Ready' || status === 'Entry') return 0;
  if(status === 'Too Wide') return 1;
  if(status === 'Possible Fit' || status === 'Near Setup' || status === 'Near Entry') return 2;
  if(status === 'Manual Review' || status === 'Watch') return 2;
  return 3;
}

function openRankedResultInReview(ticker){
  const symbol = normalizeTicker(ticker);
  const record = upsertTickerRecord(symbol);
  record.review.cardOpen = true;
  if(!state.tickers.includes(symbol)) state.tickers.push(symbol);
  delete uiState.selectedScanner[symbol];
  updateTickerInputFromState();
  commitTickerState();
  renderTickerQuickLists();
  renderScannerResults();
  renderCards();
  loadCard(symbol);
}

async function reviewWatchlistTicker(ticker){
  const symbol = normalizeTicker(ticker);
  if(!symbol) return;
  if(!state.tickers.includes(symbol)){
    state.tickers.push(symbol);
    updateTickerInputFromState();
  }
  setStatus('scannerSelectionStatus', `Re-shortlisting ${escapeHtml(symbol)}...`);
  try{
    const {card} = await refreshCardMarketData(symbol, {force:true});
    const record = upsertTickerRecord(symbol);
    mergeLegacyCardIntoRecord(record, card, {fromScanner:true, fromCards:record.review.cardOpen, cardOpen:record.review.cardOpen});
    commitTickerState();
    renderScannerResults();
    renderCards();
    openRankedResultInReview(symbol);
    const resultsSection = $('resultsSection');
    if(resultsSection) resultsSection.scrollIntoView({behavior:'smooth', block:'start'});
  }catch(error){
    openRankedResultInReview(symbol);
    const reviewSection = $('reviewSection');
    if(reviewSection) reviewSection.scrollIntoView({behavior:'smooth', block:'start'});
  }
}

function selectedScannerTickers(){
  return uniqueTickers(Object.keys(uiState.selectedScanner || {}).filter(ticker => uiState.selectedScanner[ticker]));
}

function updateScannerSelectionStatus(){
  const resultCount = rankedTickerRecords().length;
  if(!$('scannerSelectionStatus')) return;
  if(!resultCount){
    setStatus('scannerSelectionStatus', (state.tickers || []).length
      ? 'Refresh the scanner to rank your imported TradingView tickers.'
      : 'Running the scanner will populate ranked results from the Curated Core 8 fallback universe.');
    return;
  }
  setStatus('scannerSelectionStatus', 'Open any ranked setup to jump straight into review.');
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

function renderScannerResults(){
  const box = $('results');
  if(!box) return;
  box.innerHTML = '';
  const records = rankedTickerRecords();
  console.debug('RENDER_FROM_TICKER_RECORD', 'rankedResults', records.length);
  if(!records.length){
    updateScannerSelectionStatus();
    box.innerHTML = !(state.tickers || []).length
      ? '<div class="summary">Scanning the Curated Core 8 fallback universe. Add your own tickers any time to switch into manual mode.</div>'
      : (state.scannerDebug && state.scannerDebug.length
      ? '<div class="summary">No ranked setups yet, but your imported tickers can still be opened in cards for manual review.</div><button class="secondary" data-act="seed-from-universe">Open Universe In Cards</button>'
      : '<div class="summary">Running the scanner will populate ranked results here.</div>');
    const seedBtn = box.querySelector('[data-act="seed-from-universe"]');
    if(seedBtn){
      seedBtn.onclick = () => {
        seedCardsFromUniverse(6);
        const reviewSection = $('reviewSection');
        if(reviewSection) reviewSection.scrollIntoView({behavior:'smooth', block:'start'});
      };
    }
    renderWorkflowAlerts();
    return;
  }
  const tradeable = [];
  const filtered = [];
  records.forEach(record => {
    if(isFilteredResultRecord(record)){
      filtered.push(record);
    }else{
      tradeable.push(record);
    }
  });
  const sections = [
    {
      title:'Tradeable / Review-worthy',
      summary: tradeable.length
        ? `${tradeable.length} setup${tradeable.length === 1 ? '' : 's'} worth reviewing now.`
        : 'No strong review candidates right now.',
      items:tradeable,
      collapsed:false,
      empty:'No tradeable setups right now. Try refreshing the scanner or reviewing the watchlist.'
    },
    {
      title:'Filtered Out',
      summary: filtered.length
        ? `${filtered.length} filtered setup${filtered.length === 1 ? '' : 's'} hidden by default.`
        : 'No filtered setups right now.',
      items:filtered,
      collapsed:true,
      empty:'No filtered setups.'
    }
  ];
  sections.forEach(section => {
    const wrap = document.createElement(section.collapsed ? 'details' : 'div');
    if(section.collapsed){
      wrap.className = 'resultsgroup';
      wrap.innerHTML = `<summary class="summary"><strong>${escapeHtml(section.title)}</strong><div class="tiny">${escapeHtml(section.summary)}</div></summary><div class="list"></div>`;
    }else{
      wrap.className = 'resultsgroup';
      wrap.innerHTML = `<div class="summary"><strong>${escapeHtml(section.title)}</strong><div class="tiny">${escapeHtml(section.summary)}</div></div><div class="list"></div>`;
    }
    const list = wrap.querySelector('.list');
    if(section.items.length){
      section.items.forEach(record => {
        const card = document.createElement('div');
        card.innerHTML = renderCompactResultCard(record);
        const node = card.firstElementChild;
        if(!node) return;
        const reviewBtn = node.querySelector('[data-act="review"]');
        if(reviewBtn){
          const ticker = normalizeTickerRecord(record).ticker;
          reviewBtn.onclick = () => openRankedResultInReview(ticker);
        }
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

function renderCards(){
  const box = $('cardsList');
  if(!box) return;
  box.innerHTML = '';
  const records = openCardTickerRecords();
  console.debug('RENDER_FROM_TICKER_RECORD', 'cards', records.length);
  if(!records.length){
    box.innerHTML = (state.tickers || []).length
      ? '<div class="summary">No review cards yet. Open a ranked setup, or open the saved universe here when you want chart-by-chart supporting review.</div><div class="actions"><a class="helperbutton" href="#resultsSection">Go To Ranked Results</a><button class="secondary" data-act="seed-cards">Open Universe In Cards</button></div>'
      : '<div class="summary">No review cards yet. Start in Ranked Results, then open the best setups into Setup Review when you are ready.</div><a class="helperbutton" href="#resultsSection">Go To Ranked Results</a>';
    const seedBtn = box.querySelector('[data-act="seed-cards"]');
    if(seedBtn){
      seedBtn.onclick = () => {
        seedCardsFromUniverse(6);
        const reviewSection = $('reviewSection');
        if(reviewSection) reviewSection.scrollIntoView({behavior:'smooth', block:'start'});
      };
    }
    return;
  }
  const ordered = records.map(normalizeTickerRecord);
  const groups = ['Entry', 'Too Wide', 'Near Entry', 'Watch', 'Manual Review', 'Avoid'];
  groups.forEach(group => {
    const items = ordered.filter(record => {
      const bucket = bucketStatusForCard({
        chartVerdict:record.scan.verdict || record.watchlist.status || 'Watch',
        riskStatus:record.plan.riskStatus || record.scan.riskStatus || 'plan_missing'
      });
      return group === 'Near Entry'
        ? (bucket === 'Near Entry' || bucket === 'Near Setup')
        : bucket === group;
    });
    if(!items.length) return;
    const header = document.createElement('div');
    header.className = 'summary';
    header.innerHTML = `<strong>${escapeHtml(group)}</strong><div class="tiny">${items.length} candidate${items.length === 1 ? '' : 's'} in this scanner bucket.</div>`;
    box.appendChild(header);
    items.forEach(record => {
    const promptText = record.review.lastPrompt || buildTickerPromptFromRecord(record);
    const sourceLabel = record.review.source === 'openai' ? 'OpenAI' : (record.review.source === 'scanner' ? 'Scanner' : (record.review.source === 'ai' ? 'Imported AI' : 'Checklist'));
    const marketLabel = record.meta.marketStatus || state.marketStatus;
    const updatedLabel = record.meta.updatedAt ? new Date(record.meta.updatedAt).toLocaleString() : '';
    const loading = uiState.loadingTicker === record.ticker;
    const analysisBusy = !!uiState.loadingTicker;
    const analyseLabel = loading ? 'Analysing...' : (record.review.lastError ? 'Retry Analysis' : 'Analyse Setup');
    const companyLine = record.meta.companyName ? `<div class="tiny">${escapeHtml(record.meta.companyName)}${record.meta.exchange ? ` • ${escapeHtml(record.meta.exchange)}` : ''}</div>` : '';
    const hasMarketData = Number.isFinite(record.marketData.price) || Number.isFinite(record.marketData.ma20) || Number.isFinite(record.marketData.ma50) || Number.isFinite(record.marketData.ma200);
    const marketDataLine = hasMarketData ? `<div class="tiny">Price ${escapeHtml(fmtPrice(Number(record.marketData.price)))} • 20 ${escapeHtml(fmtPrice(Number(record.marketData.ma20)))} • 50 ${escapeHtml(fmtPrice(Number(record.marketData.ma50)))} • 200 ${escapeHtml(fmtPrice(Number(record.marketData.ma200)))} • Vol ${escapeHtml(formatPercent(record.marketData.volume && record.marketData.avgVolume ? ((record.marketData.volume / record.marketData.avgVolume) - 1) * 100 : null))} vs avg • RSI ${escapeHtml(fmtPrice(Number(record.marketData.rsi)))}</div>` : '<div class="tiny">Market data pending...</div>';
    const performanceLine = hasMarketData ? `<div class="tiny">1W ${escapeHtml(formatPercent(record.marketData.perf1w))} • 1M ${escapeHtml(formatPercent(record.marketData.perf1m))} • 3M ${escapeHtml(formatPercent(record.marketData.perf3m))} • 6M ${escapeHtml(formatPercent(record.marketData.perf6m))} • YTD ${escapeHtml(formatPercent(record.marketData.perfYtd))}</div>` : '';
    const suitability = record.scan.analysisProjection && record.scan.analysisProjection.suitability ? record.scan.analysisProjection.suitability : null;
    const suitabilityLine = record.review.source === 'scanner' && suitability ? `<div class="tiny">Trend ${suitability.trend}/4 • Pullback ${suitability.pullback}/3 • Trade ${suitability.tradeQuality}/3</div>` : '';
    const freshnessAge = relativeAgeLabel(record.scan.lastScannedAt);
    const freshnessBadge = record.scan.lastScannedAt ? `<span class="badge ${isFreshScanTimestamp(record.scan.lastScannedAt) ? 'freshness-fresh' : 'freshness-stale'}">${isFreshScanTimestamp(record.scan.lastScannedAt) ? 'Fresh' : 'Stale'}${freshnessAge ? ` • ${escapeHtml(freshnessAge)}` : ''}</span>` : '';
    const lifecycleLine = `<div class="tiny">Lifecycle ${escapeHtml(record.lifecycle.stage || 'untracked')} • ${escapeHtml(record.lifecycle.status || 'inactive')}${record.lifecycle.expiresAt ? ` • Expires ${escapeHtml(record.lifecycle.expiresAt)}` : ''}</div>`;
    const meta = `<div class="tiny">${escapeHtml(sourceLabel)} - ${escapeHtml(marketLabel)}${updatedLabel ? ` - ${escapeHtml(updatedLabel)}` : ''}</div>${freshnessBadge ? `<div class="inline-status">${freshnessBadge}</div>` : ''}${companyLine}${marketDataLine}${performanceLine}${suitabilityLine}${lifecycleLine}`;
    const scoreLabel = `${record.scan.score || 0}/10`;
    const combinedStatus = combinedStatusLabel(record.scan.verdict || record.watchlist.status || 'Watch', record.plan.riskStatus || record.scan.riskStatus || 'plan_missing');
    const rrRatio = numericOrNull(record.plan.plannedRR);
    const rewardPerShare = numericOrNull(record.plan.rewardPerShare);
    const rrState = Number.isFinite(rrRatio) ? (rrRatio >= 2 ? 'strong' : (rrRatio >= 1.5 ? 'acceptable' : 'weak')) : 'invalid';
    const targetWarning = !!record.plan.firstTargetTooClose;
    const normalizedAnalysis = record.review.normalizedAnalysis;
    const riskMeta = normalizedAnalysis
      ? `<div class="tiny">Planned Entry: ${escapeHtml(normalizedAnalysis.entry || 'Not given')} • Planned Stop: ${escapeHtml(normalizedAnalysis.stop || 'Not given')} • Planned First Target: ${escapeHtml(normalizedAnalysis.first_target || 'Not given')}</div><div class="tiny">Risk ${escapeHtml(riskStatusLabel(record.plan.riskStatus || 'plan_missing'))} • Max Loss ${escapeHtml(Number.isFinite(record.plan.maxLoss) ? record.plan.maxLoss.toFixed(2) : String(currentMaxLoss()))} • Planned Risk/Share ${escapeHtml(Number.isFinite(record.plan.riskPerShare) ? record.plan.riskPerShare.toFixed(2) : 'N/A')} • Planned Reward/Share ${escapeHtml(Number.isFinite(rewardPerShare) ? rewardPerShare.toFixed(2) : 'N/A')} • Planned Position ${escapeHtml(Number.isFinite(record.plan.positionSize) ? String(record.plan.positionSize) : 'N/A')}</div><div class="inline-status"><span class="badge ${rrStateClass(rrState)}">${escapeHtml(rrStateLabel(rrState))}</span><span class="tiny">Planned R:R ${escapeHtml(Number.isFinite(rrRatio) ? rrRatio.toFixed(2) : 'N/A')}</span>${targetWarning ? '<span class="badge avoid">Target Too Close</span>' : ''}</div>`
      : `<div class="inline-status"><span class="badge watch">Scan Estimate</span><span class="tiny">Use this card to review charts and define a real plan before acting on scanner estimates.</span></div>${renderEstimatedScannerPlanFromRecord(record)}`;
    const div = document.createElement('div');
    div.className = 'result';
    div.innerHTML = `<div class="resulthead"><div class="ticker">${escapeHtml(record.ticker)}</div><div><div>${escapeHtml(record.scan.summary || 'No review saved yet.')}</div>${meta}${riskMeta}</div><div class="score ${scoreClass(record.scan.score || 0)}">${escapeHtml(scoreLabel)}</div><div class="inline-status resultactions" style="justify-content:flex-end"><span class="badge ${statusClass(record.scan.verdict || record.watchlist.status || 'Watch')}">${escapeHtml(combinedStatus)}</span><button class="danger" data-act="remove">Remove</button></div></div><div class="resultbody"><div class="panelbox"><label>Chart Workflow</label><details class="chartworkflow"><summary class="secondary">Chart Workflow</summary><div class="workflowmenu"><button class="secondary" type="button" data-act="open-chart">Open Chart</button><button class="secondary" type="button" data-act="choose-chart">Choose Screenshot</button><button class="secondary" type="button" data-act="import-latest">Import Latest</button><button class="ghost" type="button" data-act="clear-chart">Remove Chart</button></div></details><input id="chart-${record.ticker}" data-act="file" type="file" accept="image/png,image/jpeg,image/*" hidden />${record.review.chartRef && record.review.chartRef.dataUrl ? `<div class="thumbwrap"><img class="thumb" src="${escapeHtml(record.review.chartRef.dataUrl)}" alt="Chart preview for ${escapeHtml(record.ticker)}" /><div><div class="tiny">${escapeHtml(record.review.chartRef.name || 'chart image')}</div><div class="tiny">Stored locally on this device.</div></div></div>` : '<div class="tiny" style="margin-top:10px">No chart attached yet.</div>'}</div><div class="panelbox"><label for="notes-${record.ticker}">Notes</label><textarea id="notes-${record.ticker}" data-act="notes" placeholder="Add ticker-specific notes here.">${escapeHtml(record.review.notes || '')}</textarea><div class="actions"><button class="primary" data-act="analyse" ${analysisBusy && !loading ? 'disabled' : ''}>${analyseLabel}</button></div><details class="responsepanel" id="response-${record.ticker}" ${(((uiState.responseOpen[record.ticker] ?? !!record.review.aiAnalysisRaw) || !!record.review.lastError)) ? 'open' : ''}><summary>Analysis Result</summary>${renderAnalysisPanelFromRecord(record)}</details><div class="actions"><button class="secondary" data-act="save-trade">Save Trade</button><button class="secondary" data-act="add-watchlist">Add to Watchlist</button></div><details class="promptdetails" id="prompt-${record.ticker}" ${(uiState.promptOpen[record.ticker] ?? !!record.review.lastPrompt) ? 'open' : ''}><summary>Prompt Preview</summary><div class="mutebox">${escapeHtml(promptText)}</div></details><div class="statusline tiny" id="cardStatus-${record.ticker}">${renderCardStatusLineFromRecord(record, loading, analysisBusy)}</div></div></div>`;
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
      const entry = addToWatchlist({
        ticker:liveRecord.ticker,
        dateAdded:todayIsoDate(),
        scoreWhenAdded:liveRecord.scan.score,
        verdictWhenAdded:liveRecord.scan.verdict || '',
        expiryAfterTradingDays:5
      });
      const statusBox = $(`cardStatus-${record.ticker}`);
      if(statusBox && entry) statusBox.innerHTML = '<span class="ok">Ticker saved to the watchlist for 5 trading days.</span>';
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
  });
}

function handleChartSelection(ticker, file){
  const statusBox = $(`cardStatus-${ticker}`);
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
    record.review.lastError = '';
    record.review.lastReviewedAt = new Date().toISOString();
    record.meta.updatedAt = record.review.lastReviewedAt;
    commitTickerState();
    renderCards();
    const liveStatus = $(`cardStatus-${ticker}`);
    if(liveStatus) liveStatus.innerHTML = '<span class="ok">Chart saved on this device for this ticker.</span>';
  };
  reader.onerror = () => {
    if(statusBox) statusBox.innerHTML = '<span class="badtext">Could not read that chart file.</span>';
  };
  reader.readAsDataURL(file);
}

async function importLatestChart(ticker){
  const statusBox = $(`cardStatus-${ticker}`);
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

function loadCard(ticker){
  const record = getTickerRecord(ticker);
  if(!record) return;
  console.debug('RENDER_FROM_TICKER_RECORD', 'setupReview', ticker);
  refreshLifecycleStage(record, 'reviewed', REVIEW_EXPIRY_TRADING_DAYS, 'Ticker opened in Setup Review.', 'review');
  commitTickerState();
  $('selectedTicker').value = record.ticker;
  const review = record.review && record.review.manualReview && typeof record.review.manualReview === 'object' ? record.review.manualReview : null;
  const reviewChecks = review && review.checks ? review.checks : ((record.scan.flags && record.scan.flags.checks) || {});
  checklistIds.forEach(id => { $(id).checked = !!reviewChecks[id]; });
  refreshReview();
  syncPlannerFromTicker(record.ticker);
  renderReviewLifecycleSummary(record.ticker);
  const reviewSection = $('reviewSection');
  if(reviewSection) reviewSection.scrollIntoView({behavior:'smooth', block:'start'});
}

function refreshReview(){
  const checks = currentChecks();
  const result = scoreAndStatusFromChecks(checks);
  $('scoreBox').value = `${result.score}/10`;
  $('statusBox').value = result.status;
  $('summaryBox').textContent = buildSummary(checks, result.status);
  $('progressText').textContent = `${result.score} / 10`;
  $('progressFill').style.width = `${result.score * 10}%`;
}

function saveReview(){
  const ticker = normalizeTicker($('selectedTicker').value);
  if(!ticker){
    $('selectedTicker').focus();
    return;
  }
  const checks = currentChecks();
  const result = scoreAndStatusFromChecks(checks);
  const record = upsertTickerRecord(ticker);
  record.review.cardOpen = true;
  if(!state.tickers.includes(ticker)) state.tickers.push(ticker);
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
  refreshLifecycleStage(record, 'reviewed', REVIEW_EXPIRY_TRADING_DAYS, 'Manual review saved.', 'review');
  applyPlanCandidateToRecord(record, {
    entry:manualReview.entry,
    stop:manualReview.stop,
    firstTarget:manualReview.target
  }, {
    source:'review',
    lastPlannedAt:manualReview.savedAt
  });
  updateTickerInputFromState();
  commitTickerState();
  renderCards();
  renderReviewLifecycleSummary(ticker);
  setStatus('inputStatus', '<span class="ok">Manual review saved as optional notes only. Scanner ranking stays unchanged.</span>');
}

function resetReview(){
  ['selectedTicker','statusBox','scoreBox','entryPrice','stopPrice','targetPrice'].forEach(id => { $(id).value = ''; });
  checklistIds.forEach(id => { $(id).checked = false; });
  $('summaryBox').textContent = 'No setup reviewed yet.';
  $('progressText').textContent = '0 / 10';
  $('progressFill').style.width = '0%';
  $('calcNote').textContent = 'Enter planned entry, stop, and first target to calculate size.';
  ['riskPerShare','positionSize','rrValue'].forEach(id => { $(id).textContent = '-'; });
  renderPlannerPlanSummary('', '', '');
  renderReviewLifecycleSummary('');
}

function refreshSelectedTickerLifecycle(){
  const ticker = normalizeTicker(($('selectedTicker') && $('selectedTicker').value) || '');
  if(!ticker) return;
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
  const ticker = normalizeTicker(($('selectedTicker') && $('selectedTicker').value) || '');
  if(!ticker) return;
  const record = getTickerRecord(ticker);
  if(!record) return;
  setLifecycleStage(record, {
    stage:'expired',
    status:'stale',
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
  const ticker = normalizeTicker(($('selectedTicker') && $('selectedTicker').value) || '');
  if(!ticker) return;
  const record = getTickerRecord(ticker);
  if(!record) return;
  const stage = record.plan.hasValidPlan ? 'planned' : ((record.review.manualReview || record.review.cardOpen) ? 'reviewed' : (record.watchlist.inWatchlist ? 'watchlist' : 'shortlisted'));
  const days = stage === 'planned' ? PLAN_EXPIRY_TRADING_DAYS : (stage === 'reviewed' ? REVIEW_EXPIRY_TRADING_DAYS : WATCHLIST_EXPIRY_TRADING_DAYS);
  refreshLifecycleStage(record, stage, days, 'Lifecycle reactivated manually.', 'system');
  commitTickerState();
  renderReviewLifecycleSummary(ticker);
  renderWatchlist();
  renderCards();
}

function calculate(){
  saveState();
  const ticker = normalizeTicker(($('selectedTicker') && $('selectedTicker').value) || '');
  const entry = numericOrNull($('entryPrice').value);
  const stop = numericOrNull($('stopPrice').value);
  const target = numericOrNull($('targetPrice').value);
  renderPlannerPlanSummary($('entryPrice').value, $('stopPrice').value, $('targetPrice').value);
  if(ticker){
    const record = upsertTickerRecord(ticker);
    applyPlanCandidateToRecord(record, {entry, stop, firstTarget:target}, {
      source:'planner',
      lastPlannedAt:new Date().toISOString()
    });
    commitTickerState();
    renderReviewLifecycleSummary(ticker);
  }
  const riskFit = evaluateRiskFit({
    entry,
    stop,
    ...currentRiskSettings()
  });
  if(!Number.isFinite(entry) || !Number.isFinite(stop)){
    $('riskPerShare').textContent = '-';
    $('positionSize').textContent = '-';
    $('rrValue').textContent = '-';
    $('calcNote').textContent = 'Add planned entry and stop to calculate current risk fit.';
    return;
  }
  if(riskFit.risk_status === 'invalid_plan'){
    $('riskPerShare').textContent = '-';
    $('positionSize').textContent = '-';
    $('rrValue').textContent = '-';
    $('calcNote').textContent = 'Planned entry must be above stop for a valid long plan.';
    return;
  }
  const rewardRisk = evaluateRewardRisk(entry, stop, target);
  $('riskPerShare').textContent = Number.isFinite(riskFit.risk_per_share) ? riskFit.risk_per_share.toFixed(2) : '-';
  $('positionSize').textContent = riskFit.position_size > 0 ? `${riskFit.position_size} shares` : '0 shares';
  $('rrValue').textContent = rewardRisk.valid && Number.isFinite(rewardRisk.rrRatio) ? `${rewardRisk.rrRatio.toFixed(2)}R` : '-';
  $('calcNote').textContent = riskFit.risk_status === 'too_wide'
    ? `Current max loss is ${formatGbp(riskFit.max_loss)}. This setup is too wide right now.`
    : `Current max loss is ${formatGbp(riskFit.max_loss)}. Planned trade status: ${riskStatusLabel(riskFit.risk_status)}.`;
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

function registerPwa(){
  if(!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    const buildVersion = String(window.__BUILD_VERSION__ || APP_VERSION || Date.now());
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if(refreshing) return;
      refreshing = true;
      window.location.reload();
    });
    navigator.serviceWorker.register(`./service-worker.js?v=${encodeURIComponent(buildVersion)}`, {updateViaCache:'none'}).then(registration => {
      const activateWaitingWorker = worker => {
        if(worker) worker.postMessage({type:'SKIP_WAITING'});
      };
      if(registration.waiting) activateWaitingWorker(registration.waiting);
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if(!worker) return;
        worker.addEventListener('statechange', () => {
          if(worker.state === 'installed' && navigator.serviceWorker.controller){
            activateWaitingWorker(registration.waiting || worker);
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
click('importTvBtn', importTradingViewTickers);
click('importScreenshotBtn', () => { if($('ocrImportFile')) $('ocrImportFile').click(); });
click('applyOcrBtn', applyOcrTickers);
click('clearOcrBtn', () => clearOcrReview('OCR review cleared.'));
click('clearBtn', () => {
  $('tickerInput').value = '';
  if($('tvImportInput')) $('tvImportInput').value = '';
  if($('ocrReviewInput')) $('ocrReviewInput').value = '';
  $('tickerSearch').value = '';
  state.tickers = [];
  state.scannerResults = [];
  state.cards = [];
  state.listName = "Today's Scan";
  uiState.promptOpen = {};
  uiState.responseOpen = {};
  uiState.selectedScanner = {};
  renderTickerSuggestions([]);
  state.tickerRecords = {};
  commitTickerState();
  renderTickerQuickLists();
  renderTvImportPreview([], 'default');
  clearOcrReview();
  renderScannerResults();
  renderCards();
  renderWatchlist();
  resetReview();
  setStatus('inputStatus', 'Scanner universe cleared.');
  updateTickerSearchStatus();
});
click('resetAllBtn', resetAllData);
click('saveApiBtn', () => { saveState(); setStatus('apiStatus', '<span class="ok">API settings saved on this device.</span>'); });
click('testApiBtn', testApiConnection);
click('jumpToDiaryBtn', () => {
  const diarySection = $('diarySection');
  if(diarySection) diarySection.scrollIntoView({behavior:'smooth', block:'start'});
});
click('markAlertsSeenBtn', markAlertsSeen);
click('exportDiaryBtn', exportTradeDiary);
click('saveReviewBtn', saveReview);
click('resetReviewBtn', resetReview);
click('refreshLifecycleBtn', refreshSelectedTickerLifecycle);
click('expireLifecycleBtn', expireSelectedTickerLifecycle);
click('reactivateLifecycleBtn', reactivateSelectedTickerLifecycle);
click('calcBtn', calculate);

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

['accountSize','riskPercent','maxLossOverride','marketStatus','scannerSetupType'].forEach(id => on(id, 'change', () => {
  saveState();
  refreshRiskContextForActiveSetups();
}));
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
document.querySelectorAll('.logic').forEach(el => el.addEventListener('change', refreshReview));
['entryPrice','stopPrice','targetPrice'].forEach(id => on(id, 'input', calculate));

registerPwa();
loadState();
updateTickerSearchStatus();
updateProviderStatusNote();
