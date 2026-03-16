const $ = id => document.getElementById(id);
const on = (id, evt, fn) => { const el = $(id); if (el) el.addEventListener(evt, fn); };
const click = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
const key = 'pullbackPlaybookV3';
const APP_VERSION = 'v4.4.0';
const defaultAiEndpoint = '/api/analyse-setup';
const defaultMarketDataEndpoint = '/api/market-data';
const marketCacheKey = 'pullbackPlaybookMarketCacheV1';
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

const state = {
  accountSize:4000,
  maxRisk:40,
  marketStatus:'S&P above 50 MA',
  listName:"Today's Scan",
  universeMode:'core8',
  tickers:[],
  recentTickers:[],
  scannerResults:[],
  cards:[],
  tradeDiary:[],
  lastImportRaw:'',
  apiKey:'',
  dataProvider:'fmp',
  apiPlan:'free',
  aiEndpoint:defaultAiEndpoint,
  marketDataEndpoint:defaultMarketDataEndpoint,
  symbolMeta:{},
  scannerPresetName:'Quality Pullback Scanner Core',
  scannerDebug:[]
};

const uiState = {promptOpen:{},responseOpen:{},loadingTicker:'',selectedScanner:{}};
const MAX_CHART_BYTES = 4 * 1024 * 1024;
const ANALYSIS_TIMEOUT_MS = 45000;
const MARKET_CACHE_TTL_MS = 15 * 60 * 1000;
const SEARCH_DEBOUNCE_MS = 250;
const DEFAULT_WATCH_TRADING_DAYS = 3;
const EXTENDED_WATCH_TRADING_DAYS = 5;
const APP_FETCH_TIMEOUT_MS = 12000;
const MARKET_CACHE_SCHEMA_VERSION = 2;
const MAX_SCAN_TICKERS = 10;
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
let scannerPresetPromise = null;
let suggestionTimer = null;
let suggestionRequestToken = 0;
let tesseractLoaderPromise = null;

function formatGbp(value){
  return `GBP ${Number(value || 0).toLocaleString()}`;
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

function parseTickersDetailed(text){
  const rawItems = String(text || '').split(/[\n, ]+/).map(item => normalizeTicker(item)).filter(Boolean);
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

function effectiveUniverseMode(){
  return normalizeUniverseMode(state.universeMode) || defaultUniverseModeForTickers(state.tickers);
}

function finalScanUniverse(){
  const imported = uniqueTickers(state.tickers || []);
  const mode = effectiveUniverseMode();
  if(mode === 'tradingview_only') return imported;
  if(mode === 'combined') return uniqueTickers([...imported, ...DEFAULT_AUTO_UNIVERSE]).slice(0, MAX_SCAN_TICKERS);
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
  if(mode === 'tradingview_only' && imported.length > MAX_SCAN_TICKERS){
    box.textContent = `Final scan universe (${modeLabel}) is blocked.\n\nFree tier scans are limited to 10 tickers.\nImported tickers detected: ${imported.length}`;
    return;
  }
  const note = mode === 'combined'
    ? `\n\nCombined mode prioritises TradingView tickers first and caps the final unique list at ${MAX_SCAN_TICKERS}.`
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
  box.textContent = `Cleaned ticker list (${list.length}):\n\n${list.join(', ')}`;
}

function applyManualUniverseTickers(tickers){
  const clean = uniqueTickers(tickers || []);
  state.tickers = clean;
  state.universeMode = defaultUniverseModeForTickers(clean);
  updateRecentTickers(clean);
  updateTickerInputFromState();
  if($('universeMode')) $('universeMode').value = effectiveUniverseMode();
  persistState();
  renderTickerQuickLists();
  renderTvImportPreview(clean, clean.length ? 'manual' : 'default');
  renderFinalUniversePreview();
  return clean;
}

function importTradingViewTickers(){
  const input = $('tvImportInput');
  const raw = input ? input.value : '';
  const parsed = parseTickersDetailed(raw);
  if(!String(raw || '').trim()){
    applyManualUniverseTickers([]);
    setStatus('inputStatus', '<span class="ok">No import provided. The next scan will use the Curated Core 8 fallback universe.</span>');
    return;
  }
  applyManualUniverseTickers(parsed.valid);
  const messages = [];
  if(parsed.valid.length) messages.push(`<span class="ok">${parsed.valid.length} ticker${parsed.valid.length === 1 ? '' : 's'} imported into the manual scanner universe.</span>`);
  if(parsed.invalid.length) messages.push(`<span class="badtext">Invalid: ${escapeHtml(parsed.invalid.join(', '))}</span>`);
  if(parsed.duplicates.length) messages.push(`<span class="warntext">Duplicates removed: ${escapeHtml([...new Set(parsed.duplicates)].join(', '))}</span>`);
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
    entry:'',
    stop:'',
    firstTarget:'',
    notes:'',
    outcome:'',
    lesson:'',
    ...values
  };
}

function normalizeTradeRecord(record){
  const normalized = createTradeRecord(record || {});
  normalized.ticker = normalizeTicker(normalized.ticker);
  normalized.date = String(normalized.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
  normalized.verdict = normalizeImportedStatus(normalized.verdict);
  normalized.entry = String(normalized.entry || '');
  normalized.stop = String(normalized.stop || '');
  normalized.firstTarget = String(normalized.firstTarget || '');
  normalized.notes = String(normalized.notes || '');
  normalized.outcome = String(normalized.outcome || '');
  normalized.lesson = String(normalized.lesson || '');
  return normalized;
}

function baseCard(ticker){
  return {
    ticker,
    status:'Watch',
    score:0,
    summary:'No review saved yet.',
    checks:{},
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
    pullbackType:'',
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
  normalized.pullbackType = String(normalized.pullbackType || '');
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

function getCard(ticker){
  return state.cards.find(card => card.ticker === normalizeTicker(ticker));
}

function getScannerResult(ticker){
  return state.scannerResults.find(card => card.ticker === normalizeTicker(ticker));
}

function upsertCard(ticker){
  const symbol = normalizeTicker(ticker);
  let card = getCard(symbol);
  if(!card){
    card = baseCard(symbol);
    state.cards.push(card);
  }
  return card;
}

function syncCardDraftsFromDom(){
  (state.cards || []).forEach(card => {
    const notesEl = $(`notes-${card.ticker}`);
    if(notesEl) card.notes = notesEl.value;
    const promptEl = $(`prompt-${card.ticker}`);
    if(promptEl) uiState.promptOpen[card.ticker] = promptEl.open;
    const responseEl = $(`response-${card.ticker}`);
    if(responseEl) uiState.responseOpen[card.ticker] = responseEl.open;
  });
}

function saveState(){
  syncCardDraftsFromDom();
  state.accountSize = Number($('accountSize').value || 0);
  state.maxRisk = Number($('maxRisk').value || 0);
  state.marketStatus = $('marketStatus').value;
  state.listName = $('listName').value || "Today's Scan";
  if($('universeMode')) state.universeMode = normalizeUniverseMode($('universeMode').value) || defaultUniverseModeForTickers(state.tickers);
  if($('apiKey')) state.apiKey = $('apiKey').readOnly ? '' : $('apiKey').value.trim();
  if($('dataProvider')) state.dataProvider = $('dataProvider').value;
  if($('apiPlan')) state.apiPlan = $('apiPlan').value;
  state.aiEndpoint = $('aiEndpoint').value.trim() || defaultAiEndpoint;
  state.marketDataEndpoint = defaultMarketDataEndpoint;
  persistState();
  renderStats();
  renderFinalUniversePreview();
}

function loadState(){
  Object.assign(state, safeStorageGet(key, {}) || {});
  state.aiEndpoint = state.aiEndpoint || defaultAiEndpoint;
  state.marketDataEndpoint = defaultMarketDataEndpoint;
  state.tickers = parseTickers((state.tickers || []).join('\n'));
  state.universeMode = normalizeUniverseMode(state.universeMode) || defaultUniverseModeForTickers(state.tickers);
  state.recentTickers = uniqueTickers(state.recentTickers || []);
  state.scannerResults = (state.scannerResults || []).map(normalizeCard).filter(card => card.ticker);
  state.cards = (state.cards || []).map(normalizeCard).filter(card => card.ticker);
  state.tradeDiary = (state.tradeDiary || []).map(normalizeTradeRecord);
  state.symbolMeta = state.symbolMeta && typeof state.symbolMeta === 'object' ? state.symbolMeta : {};
  state.scannerDebug = Array.isArray(state.scannerDebug) ? state.scannerDebug : [];
  $('accountSize').value = state.accountSize;
  $('maxRisk').value = state.maxRisk;
  $('marketStatus').value = state.marketStatus || 'S&P above 50 MA';
  $('listName').value = state.listName || "Today's Scan";
  if($('universeMode')) $('universeMode').value = effectiveUniverseMode();
  $('tickerInput').value = (state.tickers || []).join('\n');
  if($('tvImportInput')) $('tvImportInput').value = '';
  if($('ocrReviewInput')) $('ocrReviewInput').value = '';
  if($('importResultsInput')) $('importResultsInput').value = state.lastImportRaw || '';
  if($('apiKey') && !$('apiKey').readOnly) $('apiKey').value = state.apiKey || '';
  if($('dataProvider')) $('dataProvider').value = state.dataProvider || 'fmp';
  if($('apiPlan')) $('apiPlan').value = state.apiPlan || 'free';
  $('aiEndpoint').value = state.aiEndpoint || defaultAiEndpoint;
  if($('appVersion')) $('appVersion').textContent = APP_VERSION;
  renderStats();
  renderTickerQuickLists();
  renderTvImportPreview(state.tickers && state.tickers.length ? state.tickers : [], state.tickers && state.tickers.length ? 'manual' : 'default');
  renderFinalUniversePreview();
  clearOcrReview();
  renderScannerResults();
  renderCards();
  renderScannerRulesPanel();
  renderTradeDiary();
}

function renderStats(){
  const pct = state.accountSize ? ((state.maxRisk / state.accountSize) * 100).toFixed(1) : '0.0';
  $('accountStat').textContent = formatGbp(state.accountSize);
  $('riskStat').textContent = formatGbp(state.maxRisk);
  $('riskPctStat').textContent = `${pct}%`;
}

function updateTickerInputFromState(){
  $('tickerInput').value = (state.tickers || []).join('\n');
}

function updateRecentTickers(tickers){
  const fresh = uniqueTickers(tickers);
  if(!fresh.length) return;
  state.recentTickers = uniqueTickers([...fresh, ...(state.recentTickers || [])]).slice(0, 12);
}

function tickerSearchState(){
  const query = normalizeTicker(($('tickerSearch') && $('tickerSearch').value) || '');
  if(!query) return {query:'', valid:false, inWatchlist:false, inRecent:false};
  return {
    query,
    valid:validateTickerSymbol(query),
    inWatchlist:state.tickers.includes(query),
    inRecent:(state.recentTickers || []).includes(query)
  };
}

function renderTickerQuickLists(){
  const watchlistBox = $('watchlistQuickList');
  const recentBox = $('recentTickerList');
  if(!watchlistBox || !recentBox) return;
  if(!state.tickers.length){
    watchlistBox.innerHTML = '<div class="quickchip empty">Using the Curated Core 8 fallback universe. Add a ticker above to switch into watchlist/manual mode.</div>';
  }else{
    watchlistBox.innerHTML = state.tickers.map(ticker => (
      `<div class="quickchip active"><span class="chiplabel">${escapeHtml(ticker)}</span><button class="danger" data-act="quick-remove" data-ticker="${escapeHtml(ticker)}">Remove</button></div>`
    )).join('');
  }
  const search = tickerSearchState();
  const recent = uniqueTickers([search.valid && !search.inWatchlist ? search.query : '', ...(state.recentTickers || [])]).slice(0, 12);
  if(!recent.length){
    recentBox.innerHTML = '<div class="quickchip empty">Recent tickers will appear here after you add them.</div>';
  }else{
    recentBox.innerHTML = recent.map(ticker => {
      const inWatchlist = state.tickers.includes(ticker);
      const isSearchMatch = search.query === ticker;
      const label = isSearchMatch && !inWatchlist ? 'Add now' : (inWatchlist ? 'In watchlist' : 'Add');
      return `<div class="quickchip ${inWatchlist ? 'active' : ''}"><span class="chiplabel">${escapeHtml(ticker)}</span><button class="${inWatchlist ? 'secondary' : 'primary'}" data-act="quick-add" data-ticker="${escapeHtml(ticker)}" ${inWatchlist ? 'disabled' : ''}>${label}</button></div>`;
    }).join('');
  }
  watchlistBox.querySelectorAll('[data-act="quick-remove"]').forEach(button => {
    button.onclick = () => removeTicker(button.getAttribute('data-ticker') || '');
  });
  recentBox.querySelectorAll('[data-act="quick-add"]').forEach(button => {
    button.onclick = () => addTicker(button.getAttribute('data-ticker') || '');
  });
}

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
  if(mode === 'tradingview_only' && imported.length > MAX_SCAN_TICKERS){
    setStatus('inputStatus', '<span class="badtext">Free tier scans are limited to 10 tickers.</span>');
    setStatus('apiStatus', '<span class="badtext">Free tier scans are limited to 10 tickers.</span>');
    return {parsed, universe, blocked:true};
  }
  return {parsed, universe, blocked:false};
}

function scannerEmptyState(message){
  state.scannerResults = [];
  state.scannerDebug = [];
  uiState.selectedScanner = {};
  persistState();
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
  persistState();
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
  return (state.tradeDiary || []).find(record => record.id === recordId);
}

function saveTradeFromCard(ticker){
  const card = getCard(ticker);
  if(!card) return;
  const record = normalizeTradeRecord(createTradeRecord({
    ticker:card.ticker,
    verdict:card.lastAnalysis ? card.lastAnalysis.verdict : card.status,
    entry:card.lastAnalysis && card.lastAnalysis.entry ? card.lastAnalysis.entry : (card.entry || ''),
    stop:card.lastAnalysis && card.lastAnalysis.stop ? card.lastAnalysis.stop : (card.stop || ''),
    firstTarget:card.lastAnalysis && card.lastAnalysis.first_target ? card.lastAnalysis.first_target : (card.target || ''),
    notes:card.notes || card.summary || ''
  }));
  state.tradeDiary.unshift(record);
  state.tradeDiary = state.tradeDiary.slice(0, 100);
  persistState();
  renderTradeDiary();
  const diarySection = $('diarySection');
  if(diarySection) diarySection.scrollIntoView({behavior:'smooth', block:'start'});
}

function updateTradeRecord(recordId, field, value){
  const record = getTradeRecord(recordId);
  if(!record) return;
  if(field === 'ticker') record.ticker = normalizeTicker(value);
  else if(field === 'verdict') record.verdict = normalizeImportedStatus(value);
  else record[field] = value;
  persistState();
}

function deleteTradeRecord(recordId){
  state.tradeDiary = (state.tradeDiary || []).filter(record => record.id !== recordId);
  persistState();
  renderTradeDiary();
}

function renderTradeDiary(){
  const box = $('tradeDiary');
  if(!box) return;
  if(!state.tradeDiary || !state.tradeDiary.length){
    box.innerHTML = '<div class="summary">No trade records yet. Save an analysed setup from a ticker card.</div>';
    return;
  }
  box.innerHTML = '';
  state.tradeDiary.forEach(record => {
    const div = document.createElement('div');
    div.className = 'diarycard';
    div.innerHTML = `<div class="diaryhead"><div class="diarymeta"><span class="badge ${statusClass(record.verdict)}">${escapeHtml(record.verdict)}</span><strong>${escapeHtml(record.ticker || 'Ticker')}</strong><span class="tiny">${escapeHtml(record.date || '')}</span></div><button class="danger" data-act="delete-trade">Delete</button></div><div class="diarygrid"><div><label>Date</label><input data-field="date" type="date" value="${escapeHtml(record.date)}" /></div><div><label>Ticker</label><input data-field="ticker" value="${escapeHtml(record.ticker)}" placeholder="AAPL" /></div><div><label>Verdict</label><select data-field="verdict"><option ${record.verdict === 'Watch' ? 'selected' : ''}>Watch</option><option ${record.verdict === 'Near Setup' ? 'selected' : ''}>Near Setup</option><option ${record.verdict === 'Ready' ? 'selected' : ''}>Ready</option><option ${record.verdict === 'Entry' ? 'selected' : ''}>Entry</option><option ${record.verdict === 'Avoid' ? 'selected' : ''}>Avoid</option></select></div><div><label>Outcome</label><select data-field="outcome"><option value="" ${record.outcome === '' ? 'selected' : ''}>Not set</option><option ${record.outcome === 'Open' ? 'selected' : ''}>Open</option><option ${record.outcome === 'Win' ? 'selected' : ''}>Win</option><option ${record.outcome === 'Loss' ? 'selected' : ''}>Loss</option><option ${record.outcome === 'Scratch' ? 'selected' : ''}>Scratch</option><option ${record.outcome === 'Cancelled' ? 'selected' : ''}>Cancelled</option></select></div></div><div class="diarygrid"><div><label>Entry</label><input data-field="entry" value="${escapeHtml(record.entry)}" placeholder="123.45" /></div><div><label>Stop</label><input data-field="stop" value="${escapeHtml(record.stop)}" placeholder="119.80" /></div><div><label>First Target</label><input data-field="firstTarget" value="${escapeHtml(record.firstTarget)}" placeholder="130.00" /></div><div><label>Lesson Learned</label><input data-field="lesson" value="${escapeHtml(record.lesson)}" placeholder="Wait for cleaner bounce" /></div></div><div><label>Notes</label><textarea data-field="notes" placeholder="Why this setup was worth tracking.">${escapeHtml(record.notes)}</textarea></div>`;
    div.querySelector('[data-act="delete-trade"]').onclick = () => deleteTradeRecord(record.id);
    div.querySelectorAll('[data-field]').forEach(field => {
      field.addEventListener('change', event => updateTradeRecord(record.id, event.target.getAttribute('data-field'), event.target.value));
      field.addEventListener('input', event => {
        if(event.target.tagName === 'TEXTAREA' || event.target.getAttribute('data-field') === 'lesson'){
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
  const ok = downloadJsonFile(`pullback-playbook-trade-diary-${todayIsoDate()}.json`, state.tradeDiary || []);
  setStatus('inputStatus', ok
    ? '<span class="ok">Trade diary exported as JSON.</span>'
    : '<span class="warntext">Direct file access is browser-limited here. Use your browser download prompt to save the diary export.</span>');
}

function updateTickerSearchStatus(){
  const search = tickerSearchState();
  if(!search.query){
    setStatus('tickerSearchStatus', '<span class="tiny">Add one ticker quickly, or tap a recent symbol below.</span>');
  }else if(!search.valid){
    setStatus('tickerSearchStatus', `<span class="badtext">${escapeHtml(search.query)} is not a valid ticker format.</span>`);
  }else if(search.inWatchlist){
    setStatus('tickerSearchStatus', `<span class="warntext">${escapeHtml(search.query)} is already in the watchlist.</span>`);
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
    setStatus('tickerSearchStatus', `<span class="warntext">${escapeHtml(ticker)} is already in the watchlist.</span>`);
    if(input) input.select();
    return;
  }
  if(meta) rememberTickerMeta(meta);
  state.tickers.push(ticker);
  updateRecentTickers([ticker]);
  updateTickerInputFromState();
  if(input) input.value = '';
  renderTickerSuggestions([]);
  persistState();
  renderTickerQuickLists();
  renderScannerResults();
  renderCards();
  generateWatchPrompt();
  setStatus('tickerSearchStatus', `<span class="ok">${escapeHtml(ticker)} added to the watchlist.</span>`);
}

function addTickerFromSearch(){
  addTicker();
}

function removeTicker(ticker){
  state.tickers = state.tickers.filter(item => item !== ticker);
  state.scannerResults = state.scannerResults.filter(card => card.ticker !== ticker);
  state.cards = state.cards.filter(card => card.ticker !== ticker);
  delete uiState.selectedScanner[ticker];
  delete uiState.promptOpen[ticker];
  delete uiState.responseOpen[ticker];
  if($('selectedTicker').value === ticker) resetReview();
  updateTickerInputFromState();
  persistState();
  renderTickerQuickLists();
  renderScannerResults();
  renderCards();
  generateWatchPrompt();
  updateTickerSearchStatus();
}

function removeCard(ticker){
  state.cards = state.cards.filter(card => card.ticker !== ticker);
  delete uiState.promptOpen[ticker];
  delete uiState.responseOpen[ticker];
  if($('selectedTicker').value === ticker) resetReview();
  persistState();
  renderCards();
}

function saveCardReviewFromElement(ticker, container){
  const card = upsertCard(ticker);
  const checks = {};
  container.querySelectorAll('[data-card-check]').forEach(input => {
    checks[input.getAttribute('data-card-check')] = !!input.checked;
  });
  container.querySelectorAll('[data-card-field]').forEach(input => {
    const field = input.getAttribute('data-card-field');
    card[field] = input.value || '';
  });
  const result = scoreAndStatusFromChecks(checks);
  card.checks = checks;
  card.score = result.score;
  card.status = result.status === 'Entry' ? 'Ready' : (result.status === 'Near Entry' ? 'Near Setup' : result.status);
  card.summary = buildSummary(checks, result.status);
  card.marketStatus = state.marketStatus;
  card.updatedAt = new Date().toISOString();
  card.source = 'manual';
  updateWatchTracking(card);
  persistState();
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

function renderCardChecklist(card){
  const checks = card && card.checks ? card.checks : {};
  return `
    <div class="cardreviewgrid">
      <div class="checkgroup">
        <h3>Trend</h3>
        ${['trendStrong','above50','above200','ma50gt200'].map(id => `<label class="checkitem"><input type="checkbox" data-card-check="${id}" ${checks[id] ? 'checked' : ''}> ${escapeHtml(checklistLabels[id])}</label>`).join('')}
      </div>
      <div class="checkgroup">
        <h3>Pullback</h3>
        ${['near20','near50','stabilising','bounce','volume'].map(id => `<label class="checkitem"><input type="checkbox" data-card-check="${id}" ${checks[id] ? 'checked' : ''}> ${escapeHtml(checklistLabels[id])}</label>`).join('')}
      </div>
      <div class="checkgroup">
        <h3>Trade Plan</h3>
        ${['entryDefined','stopDefined','targetDefined'].map(id => `<label class="checkitem"><input type="checkbox" data-card-check="${id}" ${checks[id] ? 'checked' : ''}> ${escapeHtml(checklistLabels[id])}</label>`).join('')}
        <div class="row3" style="margin-top:10px">
          <div><label>Entry</label><input data-card-field="entry" type="number" step="0.01" value="${escapeHtml(card.entry || '')}" /></div>
          <div><label>Stop</label><input data-card-field="stop" type="number" step="0.01" value="${escapeHtml(card.stop || '')}" /></div>
          <div><label>Target</label><input data-card-field="target" type="number" step="0.01" value="${escapeHtml(card.target || '')}" /></div>
        </div>
      </div>
    </div>
  `;
}

function statusClass(status){
  if(status === 'Strong Fit' || status === 'Entry' || status === 'Ready') return 'ready';
  if(status === 'Possible Fit' || status === 'Near Entry' || status === 'Near Pullback' || status === 'Near Setup') return 'near';
  if(status === 'Avoid') return 'avoid';
  return 'watch';
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
    tradingViewSymbol:String(meta.tradingViewSymbol || '')
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
  const memoryHit = marketDataCache.get(ticker);
  if(memoryHit && memoryHit.ticker === ticker && isFreshTimestamp(memoryHit.fetchedAt, ttlMs)) return memoryHit;
  const diskCache = readMarketCache();
  const item = diskCache[ticker];
  if(item && typeof item === 'object' && item.ticker === ticker && isFreshTimestamp(item.fetchedAt, ttlMs)){
    marketDataCache.set(ticker, item);
    return item;
  }
  return null;
}

function setCachedMarketData(symbol, data){
  const ticker = normalizeTicker(symbol);
  if(!ticker || !data) return;
  const payload = {...data, ticker, fetchedAt:data.fetchedAt || new Date().toISOString(), cacheVersion:MARKET_CACHE_SCHEMA_VERSION};
  marketDataCache.set(ticker, payload);
  const diskCache = readMarketCache();
  diskCache[ticker] = payload;
  writeMarketCache(diskCache);
}

async function fetchMarketData(symbol, options = {}){
  const ticker = normalizeTicker(symbol);
  if(!ticker) throw new Error('Missing ticker.');
  if(!options.force){
    const cached = getCachedMarketData(ticker);
    if(cached) return cached;
  }
  let lastError = '';
  for(const endpoint of marketDataEndpoints()){
    try{
      const response = await fetchJsonWithTimeout(`${endpoint}?symbol=${encodeURIComponent(ticker)}`);
      const payload = await response.json().catch(() => ({}));
      if(!response.ok){
        throw new Error(payload && payload.error ? payload.error : `Market data request failed for ${ticker}.`);
      }
      const safeData = payload && payload.data && typeof payload.data === 'object' ? payload.data : null;
      if(!safeData){
        throw new Error(payload && payload.error ? payload.error : `Market data request returned no usable data for ${ticker}.`);
      }
      if(payload && payload.ok !== false) setCachedMarketData(ticker, safeData);
      rememberTickerMeta(safeData);
      if(payload && payload.ok === false){
        safeData.__error = String(payload.error || `Market data is incomplete for ${ticker}.`);
      }
      return safeData;
    }catch(error){
      lastError = String(error && error.message || 'Market data request failed.');
    }
  }
  throw new Error(lastError || `Market data request failed for ${ticker}.`);
}

async function fetchTickerSuggestions(query){
  let lastError = '';
  for(const endpoint of marketDataEndpoints()){
    try{
      const response = await fetchJsonWithTimeout(`${endpoint}?mode=search&query=${encodeURIComponent(query)}`);
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
      '',
      '<strong>Soft ranking signals</strong>',
      '- 20 MA touch or bounce',
      '- Rising 50 MA structure',
      '- Room for a clean swing target',
      '- Pullback quality and stabilisation',
      '- Risk fit for GBP 40 max loss'
    ].join('\n');
  }
  if(debugBox){
    if(!state.scannerDebug.length){
      debugBox.innerHTML = scannerUniverse().length
        ? 'No scan debug data yet. Refresh the scanner to rank the current universe.'
        : 'No scan debug data yet. Add tickers to the scanner universe or use the curated default list.';
    }else{
      debugBox.innerHTML = state.scannerDebug.map(item => (
        `${escapeHtml(item.ticker)} | ${escapeHtml(item.status || 'Manual Review')} | ${escapeHtml((item.breakdown || []).map(entry => entry.label).join(' | '))}`
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
  if(result.status === 'Manual Review') return result.reason || 'Keep this ticker reviewable and confirm the chart manually.';
  return result.reason || 'Trend structure looks broken for this workflow.';
}

function clamp(value, min, max){
  return Math.max(min, Math.min(max, value));
}

function scoreRange(value, min, max, points){
  if(!Number.isFinite(value)) return 0;
  if(max <= min) return 0;
  return clamp(((value - min) / (max - min)) * points, 0, points);
}

function deriveTradePlan(data){
  const price = numericOrNull(data.price);
  const sma20 = numericOrNull(data.sma20);
  const sma50 = numericOrNull(data.sma50);
  if(!Number.isFinite(price) || !Number.isFinite(sma20) || !Number.isFinite(sma50)) return {entry:null, stop:null, target:null, riskPerShare:null, rr:null, positionSize:0};
  const entry = Math.max(price, sma20);
  const stop = Math.min(price, sma50 * 0.99);
  const riskPerShare = entry > stop ? entry - stop : null;
  const target = Number.isFinite(riskPerShare) ? Math.max(entry + (riskPerShare * 2), entry * 1.05) : null;
  const rr = Number.isFinite(riskPerShare) && target > entry ? (target - entry) / riskPerShare : null;
  const positionSize = Number.isFinite(riskPerShare) && riskPerShare > 0 ? Math.floor(state.maxRisk / riskPerShare) : 0;
  return {entry, stop, target, riskPerShare, rr, positionSize};
}

function buildSuitabilitySummary(parts){
  const reasons = [];
  if(parts.trend >= 22) reasons.push('strong trend');
  if(parts.pullback >= 22) reasons.push('20 MA pullback is lining up well');
  if(parts.readiness >= 14) reasons.push('setup looks actionable');
  if(parts.liquidity >= 7) reasons.push('high liquidity');
  if(parts.risk >= 7) reasons.push('risk fits the GBP 40 max loss');
  if(!reasons.length) reasons.push('meets screener but needs more work');
  return reasons.slice(0, 3).join(', ') + '.';
}

function scannerHardFailReasons(data){
  const price = numericOrNull(data.price);
  const sma20 = numericOrNull(data.sma20);
  const sma50 = numericOrNull(data.sma50);
  const sma200 = numericOrNull(data.sma200);
  const reasons = [];
  if(Number.isFinite(price) && Number.isFinite(sma200) && price < sma200) reasons.push('Price is below the 200 MA.');
  if(Number.isFinite(sma50) && Number.isFinite(sma200) && sma50 < sma200) reasons.push('50 MA is below the 200 MA.');
  if(Number.isFinite(price) && Number.isFinite(sma20) && Number.isFinite(sma50) && price < sma50 && sma20 < sma50) reasons.push('Structure looks broken below the moving averages.');
  return reasons;
}

function rankedStatusFromScore(score){
  if(score >= 72) return 'Strong Fit';
  if(score >= 48) return 'Possible Fit';
  return 'Manual Review';
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
  const perf6m = numericOrNull(data.perf6m);
  const perfYtd = numericOrNull(data.perfYtd);
  const perf1w = numericOrNull(data.perf1w);
  const rsi14 = numericOrNull(data.rsi14);
  const avgVolume30d = numericOrNull(data.avgVolume30d);
  const marketCap = numericOrNull(data.marketCap);
  const price = numericOrNull(data.price);
  const sma20 = numericOrNull(data.sma20);
  const sma50 = numericOrNull(data.sma50);
  const sma200 = numericOrNull(data.sma200);
  const tradePlan = deriveTradePlan(data);
  const pullbackType = classifyPullbackType(data);
  const trend =
    (checks.above200 ? 10 : 0) +
    (checks.ma50gt200 ? 10 : 0) +
    (checks.above50 ? 6 : 0) +
    scoreRange(perf3m, 5, 25, 2) +
    scoreRange(perf6m, 10, 40, 1) +
    scoreRange(perfYtd, 5, 30, 1);
  const pullbackDepth = Number.isFinite(price) && Number.isFinite(sma20) && sma20 > 0 ? ((sma20 - price) / sma20) * 100 : null;
  const roomToPriorHigh = Number.isFinite(tradePlan.rr) ? clamp((tradePlan.rr - 1.2) * 4, 0, 6) : 0;
  const pullback =
    (pullbackType.type === '20MA Touch' ? 18 : 0) +
    (pullbackType.type === '20MA Bounce' ? 15 : 0) +
    (pullbackType.type === '50MA Pullback' ? 6 : 0) +
    (Number.isFinite(pullbackDepth) ? clamp(10 - Math.abs(pullbackDepth - 2.5) * 3, 0, 10) : 0) +
    (Number.isFinite(rsi14) ? clamp(4 - Math.abs(rsi14 - 50) * 0.2, 0, 4) : 0) +
    (Number.isFinite(perf1w) ? clamp(4 - Math.abs(perf1w + 1.5) * 1.1, 0, 4) : 0) +
    (pullbackType.scoreAdjustment * 4);
  const entryDefined = !!(card.entry || Number.isFinite(tradePlan.entry));
  const stopDefined = !!(card.stop || Number.isFinite(tradePlan.stop));
  const targetDefined = !!(card.target || Number.isFinite(tradePlan.target));
  const readiness =
    (checks.stabilising ? 6 : 0) +
    (checks.bounce ? 6 : 0) +
    (entryDefined ? 3 : 0) +
    (stopDefined ? 3 : 0) +
    (targetDefined ? 2 : 0) +
    roomToPriorHigh;
  const liquidity =
    scoreRange(avgVolume30d, 1000000, 10000000, 5) +
    scoreRange(marketCap, 10000000000, 200000000000, 5);
  const risk =
    (tradePlan.positionSize >= 1 ? 4 : 0) +
    (tradePlan.positionSize >= 10 ? 2 : 0) +
    (Number.isFinite(tradePlan.riskPerShare) && tradePlan.riskPerShare > 0 ? clamp((state.maxRisk / tradePlan.riskPerShare) / 20, 0, 2) : 0) +
    (Number.isFinite(tradePlan.rr) ? clamp((tradePlan.rr - 1.5) * 3, 0, 2) : 0);
  const total = Math.round(clamp(trend, 0, 30) + clamp(pullback, 0, 30) + clamp(readiness, 0, 20) + clamp(liquidity, 0, 10) + clamp(risk, 0, 10));
  return {
    total,
    breakdown:{
      trend:Math.round(clamp(trend, 0, 30)),
      pullback:Math.round(clamp(pullback, 0, 30)),
      readiness:Math.round(clamp(readiness, 0, 20)),
      liquidity:Math.round(clamp(liquidity, 0, 10)),
      risk:Math.round(clamp(risk, 0, 10)),
      pullbackType:pullbackType.type,
      pullbackAdjustment:pullbackType.scoreAdjustment,
      distance20:pullbackType.distance20,
      distance50:pullbackType.distance50,
      extended:pullbackType.extended
    },
    tradePlan,
    summary:buildSuitabilitySummary({
      trend:clamp(trend, 0, 30),
      pullback:clamp(pullback, 0, 30),
      readiness:clamp(readiness, 0, 20),
      liquidity:clamp(liquidity, 0, 10),
      risk:clamp(risk, 0, 10)
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
  return {
    trendStrong,
    above50:Number.isFinite(price) && Number.isFinite(sma50) && price > sma50,
    above200:Number.isFinite(price) && Number.isFinite(sma200) && price > sma200,
    ma50gt200:Number.isFinite(sma50) && Number.isFinite(sma200) && sma50 > sma200,
    near20,
    near50,
    stabilising:near20 || near50,
    bounce:Number.isFinite(data.perf1w) && data.perf1w < 0,
    volume:Number.isFinite(volume) && Number.isFinite(avgVolume30d) && volume >= avgVolume30d,
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
      summary:'Keep this ticker reviewable and confirm the chart manually.',
      passedRules:0,
      totalRules:1,
      passed:true,
      failedRule:reason,
      reason,
      breakdown
    };
  }
  const checks = buildScannerChecks(safeData);
  const hardReasons = scannerHardFailReasons(safeData);
  const breakdown = [
    {passed:isUsExchange(safeData.exchange), label:`Exchange: ${String(safeData.exchange || 'missing')}`},
    {passed:checks.above200, label:checks.above200 ? 'Price is above the 200 MA.' : 'Price is below the 200 MA.'},
    {passed:checks.ma50gt200, label:checks.ma50gt200 ? '50 MA is above the 200 MA.' : '50 MA is below the 200 MA.'},
    {passed:checks.near20 || checks.near50, label:checks.near20 ? 'Near the 20 MA.' : (checks.near50 ? 'Near the 50 MA.' : 'Not near the 20 MA or 50 MA.')},
    {passed:Number.isFinite(safeData.perf1w), label:Number.isFinite(safeData.perf1w) ? `1W pullback ${formatPercent(safeData.perf1w)}.` : '1W pullback is unavailable.'},
    {passed:Number.isFinite(safeData.rsi14), label:Number.isFinite(safeData.rsi14) ? `RSI 14 ${fmtPrice(Number(safeData.rsi14))}.` : 'RSI is unavailable.'}
  ];
  const passedRules = breakdown.filter(item => item.passed).length;
  const hardFail = hardReasons.length > 0;
  const failedRule = hardReasons[0] || '';
  const status = hardFail ? 'Avoid' : 'Possible Fit';
  const score = hardFail ? 18 : 45;
  const result = {
    status,
    score,
    checks,
    summary:buildScannerSummary({status, failedRule, reason:hardFail ? hardReasons.join(' ') : 'Imported TradingView ticker kept reviewable for softer ranking.'}),
    passedRules,
    totalRules:breakdown.length,
    passed:!hardFail,
    failedRule,
    reason:hardFail ? hardReasons.join(' ') : 'Imported TradingView ticker kept reviewable for softer ranking.',
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

function ensureWatchTracking(card, days = DEFAULT_WATCH_TRADING_DAYS){
  if(!card) return;
  const safeDays = days === EXTENDED_WATCH_TRADING_DAYS ? EXTENDED_WATCH_TRADING_DAYS : DEFAULT_WATCH_TRADING_DAYS;
  const firstFlaggedAt = card.watchTracking && /^\d{4}-\d{2}-\d{2}$/.test(card.watchTracking.firstFlaggedAt || '') ? card.watchTracking.firstFlaggedAt : todayIsoDate();
  card.watchTracking = {
    firstFlaggedAt,
    expiryDate:tradingDaysFrom(firstFlaggedAt, safeDays),
    extensionDays:safeDays,
    pinned:!!(card.watchTracking && card.watchTracking.pinned),
    manualRetain:!!(card.watchTracking && card.watchTracking.manualRetain),
    dailyChecks:Array.isArray(card.watchTracking && card.watchTracking.dailyChecks) ? card.watchTracking.dailyChecks : [],
    lastCheckedDate:String(card.watchTracking && card.watchTracking.lastCheckedDate || '')
  };
}

function recordDailyWatchCheck(card){
  if(!card || !card.watchTracking) return;
  const date = todayIsoDate();
  card.watchTracking.lastCheckedDate = date;
  card.watchTracking.dailyChecks = (card.watchTracking.dailyChecks || []).filter(item => item && item.date !== date);
  card.watchTracking.dailyChecks.unshift({date, status:card.status, score:card.score});
  card.watchTracking.dailyChecks = card.watchTracking.dailyChecks.slice(0, EXTENDED_WATCH_TRADING_DAYS);
}

function updateWatchTracking(card){
  if(!card) return;
  if(card.status === 'Watch'){
    ensureWatchTracking(card, card.watchTracking && card.watchTracking.extensionDays === EXTENDED_WATCH_TRADING_DAYS ? EXTENDED_WATCH_TRADING_DAYS : DEFAULT_WATCH_TRADING_DAYS);
    recordDailyWatchCheck(card);
  }else if(card.watchTracking){
    recordDailyWatchCheck(card);
  }
}

function pruneExpiredWatches(){
  const today = todayIsoDate();
  state.cards = state.cards.filter(card => {
    if(!card.watchTracking || !card.watchTracking.expiryDate) return true;
    if(card.status !== 'Watch') return true;
    if(card.watchTracking.pinned || card.watchTracking.manualRetain) return true;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(card.watchTracking.expiryDate)) return true;
    if(card.watchTracking.expiryDate >= today) return true;
    return false;
  });
}

async function refreshCardMarketData(ticker, options = {}){
  const existingCard = getCard(ticker);
  const existingResult = getScannerResult(ticker);
  const card = normalizeCard(existingCard || existingResult || baseCard(ticker));
  const meta = getStoredTickerMeta(ticker);
  if(meta) applyTickerMetaToCard(card, meta);
  const data = await fetchMarketData(ticker, options);
  applyMarketDataToCard(card, data);
  const scan = await evaluateScannerForData(data);
  card.checks = scan.checks;
<<<<<<< HEAD
  const suitability = !data.__error && hasUsableScannerData(data) ? scoreSuitability(card, data, scan.checks) : null;
  card.score = suitability ? suitability.total : scan.score;
  card.status = suitability && scan.status !== 'Avoid' ? rankedStatusFromScore(suitability.total) : scan.status;
  card.summary = suitability && scan.status !== 'Avoid' ? buildScannerSummary({status:card.status, reason:suitability.summary}) : scan.summary;
  card.pullbackType = suitability ? suitability.pullbackType : '';
=======
  const suitability = scan.passed ? scoreSuitability(card, data, scan.checks) : null;
  const manualReviewOnly = !!data.__error;
  card.score = suitability ? suitability.total : (manualReviewOnly ? Math.max(scan.score, 1) : scan.score);
  card.status = manualReviewOnly ? 'Watch' : scan.status;
  card.summary = suitability ? suitability.summary : (manualReviewOnly ? 'Market data unavailable — manual chart review still allowed.' : scan.summary);
  card.pullbackType = suitability ? suitability.pullbackType : (manualReviewOnly ? 'Manual Review' : '');
>>>>>>> 72b8f19ccdf5f8fb63abe30ba3197d53d8e21b99
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
    pullbackType:suitability ? suitability.pullbackType : ''
  };
  if(suitability){
    if(!card.entry && Number.isFinite(suitability.tradePlan.entry)) card.entry = suitability.tradePlan.entry.toFixed(2);
    if(!card.stop && Number.isFinite(suitability.tradePlan.stop)) card.stop = suitability.tradePlan.stop.toFixed(2);
    if(!card.target && Number.isFinite(suitability.tradePlan.target)) card.target = suitability.tradePlan.target.toFixed(2);
  }
  if(existingCard) updateWatchTracking(card);
  return {card, scan};
}

async function refreshMarketDataForTickers(tickers, options = {}){
  const unique = uniqueTickers(tickers);
  if(!unique.length) return {done:0, failed:0, rejected:0};
  state.scannerDebug = [];
  let done = 0;
  let failed = 0;
  let rejected = 0;
  const nextResults = [];
  const scannerDebug = [];
  for(const ticker of unique){
    try{
      const {card, scan} = await refreshCardMarketData(ticker, options);
      const existingCard = getCard(card.ticker);
      const debugEntry = {
        ticker:card.ticker,
        passed:card.status !== 'Avoid',
        status:card.status,
        failedRule:scan.failedRule || '',
        breakdown:scan.breakdown || []
      };
      scannerDebug.push(debugEntry);
      if(existingCard){
        const preserved = {
          notes:existingCard.notes,
          chartRef:existingCard.chartRef,
          lastPrompt:existingCard.lastPrompt,
          lastResponse:existingCard.lastResponse,
          lastError:card.lastError || existingCard.lastError,
          lastAnalysis:existingCard.lastAnalysis,
          source:existingCard.source === 'manual' ? 'manual' : card.source
        };
        Object.assign(existingCard, cloneCardData(card), preserved);
      }
<<<<<<< HEAD
      nextResults.push(card);
      if(card.status === 'Avoid') rejected += 1;
      else done += 1;
=======
      if(scan.passed || (card.marketData && card.marketData.__error)){
        nextResults.push(card);
        done += 1;
      }else{
        rejected += 1;
      }
>>>>>>> 72b8f19ccdf5f8fb63abe30ba3197d53d8e21b99
      persistState();
      renderScannerResults();
      renderCards();
    }catch(err){
      const tickerSymbol = normalizeTicker(ticker);
      const fallbackCard = normalizeCard(getCard(tickerSymbol) || getScannerResult(tickerSymbol) || baseCard(tickerSymbol));
      fallbackCard.status = 'Manual Review';
      fallbackCard.score = 35;
      fallbackCard.summary = 'Market data failed. Keep this ticker reviewable and confirm the chart manually.';
      fallbackCard.source = 'scanner';
      fallbackCard.marketStatus = state.marketStatus;
      fallbackCard.updatedAt = new Date().toISOString();
      fallbackCard.scannerUpdatedAt = fallbackCard.updatedAt;
      fallbackCard.lastError = String(err && err.message || 'Market data request failed.');
      fallbackCard.analysis = {
        passedRules:0,
        totalRules:1,
        breakdown:[{passed:false, label:`Manual Review: ${fallbackCard.lastError}`}],
        failedRule:fallbackCard.lastError,
        passed:true,
        suitability:null,
        pullbackType:''
      };
      nextResults.push(fallbackCard);
      scannerDebug.push({
        ticker:tickerSymbol,
        passed:true,
        status:'Manual Review',
        failedRule:String(err && err.message || 'Market-data scan failed.'),
        breakdown:[{passed:false, label:`Manual Review: ${String(err && err.message || 'Market-data scan failed.')}`}]
      });
      done += 1;
    }
  }
  state.scannerResults = nextResults.sort((a, b) => b.score - a.score || a.ticker.localeCompare(b.ticker));
  state.scannerDebug = scannerDebug;
  const failedMarketData = scannerDebug.filter(item => (item.breakdown || []).some(entry => /market data unavailable|market data request|no historical market data|free tier|manual review/i.test(String(entry.label || '')))).length;
  if(failedMarketData){
    setStatus('apiStatus', `<span class="warntext">Market data is unavailable for ${failedMarketData} ticker${failedMarketData === 1 ? '' : 's'}. You can still open them for manual chart review.</span>`);
  }else if(unique.length){
    setStatus('apiStatus', `<span class="ok">Scanner refreshed ${unique.length} ticker${unique.length === 1 ? '' : 's'}.</span>`);
  }
  pruneExpiredWatches();
  persistState();
  renderTickerQuickLists();
  renderScannerResults();
  renderCards();
  renderScannerRulesPanel();
  return {done, failed, rejected};
}

async function testApiConnection(){
  saveState();
  setStatus('apiStatus', '<span class="warntext">Testing Financial Modeling Prep market data...</span>');
  try{
    const data = await fetchMarketData('AAPL', {force:true});
    setStatus('apiStatus', `<span class="ok">Connected.</span> Loaded ${escapeHtml(data.ticker)} with price ${escapeHtml(fmtPrice(Number(data.price)))} and SMA 50 ${escapeHtml(fmtPrice(Number(data.sma50)))}.`);
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

function buildAnalysisPayload(card){
  const safeCard = normalizeCard(card);
  return {
    ticker:safeCard.ticker,
    marketStatus:state.marketStatus,
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
  const chartValue = payload.chartAttached ? `Y:${payload.chartFileName || 'chart'}` : 'N';
  const notes = payload.notes ? payload.notes : 'none';
  return [
    'Quality Pullback setup. Return JSON only.',
    'Rules: prefer strong uptrends; pullback near 20MA/50MA; need stabilising or bounce before entry; first target near prior swing high; avoid weak, broken, or extended setups.',
    `ticker=${payload.ticker}`,
    `market=${payload.marketStatus}`,
    `checks=${compactChecklistText(payload.checklist)}`,
    `notes=${notes}`,
    `risk=account ${formatGbp(payload.accountSize)}; max_loss ${formatGbp(payload.maxRisk)}`,
    `chart=${chartValue}`,
    `plan=entry:${payload.entry || 'na'}; stop:${payload.stop || 'na'}; target:${payload.target || 'na'}`,
    'keys=verdict, plain_english_chart_read, entry, stop, first_target, risk_per_share, position_size, quality_score, key_reasons, risks, final_verdict',
    'verdict must be one of Watch, Near Entry, Entry, Avoid.'
  ].join('\n');
}

function normalizeImportedStatus(value){
  const v = String(value || '').trim().toLowerCase();
  if(v === 'ready') return 'Ready';
  if(v === 'entry') return 'Entry';
  if(v === 'near pullback' || v === 'near entry' || v === 'near setup') return 'Near Setup';
  if(v === 'avoid') return 'Avoid';
  return 'Watch';
}

function normalizeAnalysisResponse(raw){
  if(!raw || typeof raw !== 'object') return null;
  return {
    verdict:normalizeImportedStatus(raw.verdict),
    plain_english_chart_read:String(raw.plain_english_chart_read || raw.chart_read || '').trim(),
    entry:String(raw.entry || '').trim(),
    stop:String(raw.stop || '').trim(),
    first_target:String(raw.first_target || raw.target || '').trim(),
    risk_per_share:String(raw.risk_per_share || '').trim(),
    position_size:String(raw.position_size || '').trim(),
    quality_score:Math.max(0, Math.min(10, Number(raw.quality_score) || 0)),
    key_reasons:Array.isArray(raw.key_reasons) ? raw.key_reasons.map(item => String(item).trim()).filter(Boolean) : [],
    risks:Array.isArray(raw.risks) ? raw.risks.map(item => String(item).trim()).filter(Boolean) : [],
    final_verdict:String(raw.final_verdict || raw.summary || '').trim()
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
  const card = getCard(symbol);
  if(card && card.exchange && isValidTvSymbol(card.tradingViewSymbol)) return card.tradingViewSymbol;
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
  const card = upsertCard(ticker);
  const notesEl = $(`notes-${ticker}`);
  if(notesEl) card.notes = notesEl.value;
  card.lastPrompt = buildTickerPrompt(card);
  card.lastError = '';
  uiState.loadingTicker = ticker;
  uiState.promptOpen[ticker] = true;
  uiState.responseOpen[ticker] = true;
  persistState();
  renderCards();
  const endpoints = analysisEndpoints();
  if(!endpoints.length){
    card.lastError = 'Add an AI endpoint URL first.';
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
    const analysis = normalizeAnalysisResponse(data.analysis);
    card.lastResponse = JSON.stringify(data.analysis || {}, null, 2);
    card.lastAnalysis = analysis;
    card.lastError = '';
    card.source = 'openai';
    card.marketStatus = state.marketStatus;
    card.updatedAt = new Date().toISOString();
    if(analysis){
      card.status = analysis.verdict;
      card.score = analysis.quality_score;
      card.summary = analysis.final_verdict || analysis.plain_english_chart_read || 'AI analysis saved.';
      if(analysis.entry) card.entry = analysis.entry;
      if(analysis.stop) card.stop = analysis.stop;
      if(analysis.first_target) card.target = analysis.first_target;
    }
    persistState();
  }catch(err){
    card.lastError = err && err.name === 'AbortError' ? 'The analysis request timed out. Retry the setup.' : String(err.message || 'Analysis request failed.');
    persistState();
  }finally{
    uiState.loadingTicker = '';
    renderCards();
  }
}

function renderAnalysisPanel(card){
  if(!card.lastResponse) return '<div class="tiny">No AI response saved yet.</div>';
  if(card.lastAnalysis){
    const reasons = card.lastAnalysis.key_reasons.length ? card.lastAnalysis.key_reasons.map(item => `<li>${escapeHtml(item)}</li>`).join('') : '<li>No key reasons returned.</li>';
    const risks = card.lastAnalysis.risks.length ? card.lastAnalysis.risks.map(item => `<li>${escapeHtml(item)}</li>`).join('') : '<li>No risks returned.</li>';
    return `<div class="responsegrid"><div class="responsechips"><span class="badge ${statusClass(card.lastAnalysis.verdict)}">${escapeHtml(card.lastAnalysis.verdict)}</span><span class="score ${scoreClass(card.lastAnalysis.quality_score)}">${card.lastAnalysis.quality_score}/10</span></div><div><strong>Chart Read</strong><div class="tiny">${escapeHtml(card.lastAnalysis.plain_english_chart_read || 'No chart read returned.')}</div></div><div class="row3"><div><strong>Entry</strong><div class="tiny">${escapeHtml(card.lastAnalysis.entry || 'Not given')}</div></div><div><strong>Stop</strong><div class="tiny">${escapeHtml(card.lastAnalysis.stop || 'Not given')}</div></div><div><strong>First Target</strong><div class="tiny">${escapeHtml(card.lastAnalysis.first_target || 'Not given')}</div></div></div><div class="row"><div><strong>Risk / Share</strong><div class="tiny">${escapeHtml(card.lastAnalysis.risk_per_share || 'Not given')}</div></div><div><strong>Position Size</strong><div class="tiny">${escapeHtml(card.lastAnalysis.position_size || 'Not given')}</div></div></div><div><strong>Key Reasons</strong><ul class="tiny">${reasons}</ul></div><div><strong>Risks</strong><ul class="tiny">${risks}</ul></div><div><strong>Final Verdict</strong><div class="tiny">${escapeHtml(card.lastAnalysis.final_verdict || 'No final verdict returned.')}</div></div><details><summary>Raw Response</summary><div class="mutebox">${escapeHtml(card.lastResponse)}</div></details></div>`;
  }
  return `<div class="mutebox">${escapeHtml(card.lastResponse)}</div>`;
}

function statusRank(status){
  if(status === 'Strong Fit' || status === 'Ready' || status === 'Entry') return 0;
  if(status === 'Possible Fit' || status === 'Near Setup' || status === 'Near Entry') return 1;
  if(status === 'Manual Review' || status === 'Watch') return 2;
  return 3;
}

function watchTrackingText(card){
  if(!card.watchTracking) return '';
  const checks = Array.isArray(card.watchTracking.dailyChecks) ? card.watchTracking.dailyChecks.length : 0;
  return `Watching from ${escapeHtml(card.watchTracking.firstFlaggedAt || '-')}, expires ${escapeHtml(card.watchTracking.expiryDate || '-')} (${checks} daily checks logged).`;
}

function openRankedResultInReview(ticker){
  const result = getScannerResult(ticker);
  if(!result){
    loadCard(ticker);
    return;
  }
  let card = getCard(ticker);
  if(card){
    Object.assign(card, cloneCardData(result), {
      notes:card.notes,
      chartRef:card.chartRef,
      lastPrompt:card.lastPrompt,
      lastResponse:card.lastResponse,
      lastError:card.lastError,
      lastAnalysis:card.lastAnalysis,
      source:card.source || 'scanner'
    });
  }else{
    card = cloneCardData(result);
    state.cards.push(card);
  }
  if(!state.tickers.includes(card.ticker)) state.tickers.push(card.ticker);
  delete uiState.selectedScanner[card.ticker];
  updateTickerInputFromState();
  persistState();
  renderTickerQuickLists();
  renderScannerResults();
  renderCards();
  loadCard(card.ticker);
}

function selectedScannerTickers(){
  return uniqueTickers(Object.keys(uiState.selectedScanner || {}).filter(ticker => uiState.selectedScanner[ticker]));
}

function updateScannerSelectionStatus(){
  const resultCount = (state.scannerResults || []).length;
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
    const result = getScannerResult(ticker);
    if(result){
      let card = getCard(ticker);
      if(card){
        Object.assign(card, cloneCardData(result), {
          notes:card.notes,
          chartRef:card.chartRef,
          lastPrompt:card.lastPrompt,
          lastResponse:card.lastResponse,
          lastError:card.lastError,
          lastAnalysis:card.lastAnalysis,
          source:card.source || 'scanner'
        });
      }else{
        card = cloneCardData(result);
        state.cards.push(card);
      }
      return;
    }
    let card = getCard(ticker);
    if(!card){
      card = baseCard(ticker);
      const meta = getStoredTickerMeta(ticker);
      if(meta) applyTickerMetaToCard(card, meta);
      state.cards.push(card);
    }
  });
  persistState();
  renderCards();
}

function renderScannerResults(){
  const box = $('results');
  if(!box) return;
  box.innerHTML = '';
  if(!state.scannerResults || !state.scannerResults.length){
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
    return;
  }
  state.scannerResults.forEach(card => {
    const div = document.createElement('div');
    const companyLine = card.companyName ? `<div class="tiny">${escapeHtml(card.companyName)}${card.exchange ? ` • ${escapeHtml(card.exchange)}` : ''}</div>` : '';
<<<<<<< HEAD
    const marketDataLine = card.marketData ? `<div class="tiny">Price ${escapeHtml(fmtPrice(Number(card.price)))} - 20 ${escapeHtml(fmtPrice(Number(card.sma20)))} - 50 ${escapeHtml(fmtPrice(Number(card.sma50)))} - 200 ${escapeHtml(fmtPrice(Number(card.sma200)))} - RSI ${escapeHtml(fmtPrice(Number(card.rsi14)))}</div>` : '<div class="tiny">Market data unavailable. Keep this ticker reviewable in the card workflow.</div>';
=======
    const marketDataLine = card.marketData && !card.marketData.__error ? `<div class="tiny">Price ${escapeHtml(fmtPrice(Number(card.price)))} • 20 ${escapeHtml(fmtPrice(Number(card.sma20)))} • 50 ${escapeHtml(fmtPrice(Number(card.sma50)))} • 200 ${escapeHtml(fmtPrice(Number(card.sma200)))} • RSI ${escapeHtml(fmtPrice(Number(card.rsi14)))}</div>` : `<div class="tiny">${escapeHtml(card.marketData && card.marketData.__error ? card.marketData.__error : 'Market data pending...')}</div>`;
>>>>>>> 72b8f19ccdf5f8fb63abe30ba3197d53d8e21b99
    const pullbackLine = `<div class="tiny">Pullback Type: ${escapeHtml(card.pullbackType || (card.analysis && card.analysis.pullbackType) || 'Unclassified')} • Quality Score: ${escapeHtml(String(card.score || 0))}</div>`;
    const suitabilityLine = `<div class="tiny">${escapeHtml(card.summary || 'Review this setup manually.')}</div>`;
    div.className = 'resultcompact';
<<<<<<< HEAD
    div.innerHTML = `<div class="resulthead"><div class="ticker">${escapeHtml(card.ticker)}</div><div class="resultsummary"><div><strong>${escapeHtml(card.status)}</strong></div>${suitabilityLine}${companyLine}${marketDataLine}${pullbackLine}</div><div class="inline-status" style="justify-content:flex-end"><div class="score ${scoreClass(card.score)}">${escapeHtml(`${card.score}/100`)}</div><button class="primary" data-act="review">Review</button></div></div>`;
    div.querySelector('[data-act="review"]').onclick = () => {
      openRankedResultInReview(card.ticker);
=======
    div.innerHTML = `<div class="resulthead"><label class="resultselect" aria-label="Select ${escapeHtml(card.ticker)}"><input type="checkbox" data-act="select" ${selected ? 'checked' : ''} /></label><div class="ticker">${escapeHtml(card.ticker)}</div><div class="resultsummary"><div>${escapeHtml(card.summary)}</div>${companyLine}${marketDataLine}${pullbackLine}${suitabilityLine}</div><div class="inline-status" style="justify-content:flex-end"><div class="score ${scoreClass(card.score)}">${escapeHtml(`${card.score}/100`)}</div><button class="${inCards ? 'secondary' : 'primary'}" data-act="migrate">Review</button></div></div>`;
    div.querySelector('[data-act="select"]').onchange = event => {
      uiState.selectedScanner[card.ticker] = !!event.target.checked;
      updateScannerSelectionStatus();
    };
    div.querySelector('[data-act="migrate"]').onclick = () => {
      migrateScannerResultToCard(card.ticker);
      loadCard(card.ticker);
>>>>>>> 72b8f19ccdf5f8fb63abe30ba3197d53d8e21b99
    };
    box.appendChild(div);
  });
  updateScannerSelectionStatus();
}

function renderCards(){
  const box = $('cardsList');
  if(!box) return;
  box.innerHTML = '';
  if(!state.cards || !state.cards.length){
    box.innerHTML = (state.tickers || []).length
<<<<<<< HEAD
      ? '<div class="summary">No ticker cards yet. Open any ranked setup, or open your saved universe directly in cards when you want to review charts manually.</div><div class="actions"><a class="helperbutton" href="#resultsSection">Go To Ranked Results</a><button class="secondary" data-act="seed-cards">Open Universe In Cards</button></div>'
      : '<div class="summary">No ticker cards yet. Start in Ranked Results, then open the best setups directly into review when you are ready.</div><a class="helperbutton" href="#resultsSection">Go To Ranked Results</a>';
=======
      ? '<div class="summary">No ticker cards yet. Start in Ranked Results, or open your saved universe directly in cards when you want to review charts manually.</div><div class="actions"><a class="helperbutton" href="#resultsSection">Go To Ranked Results</a><button class="secondary" data-act="seed-cards">Open Universe In Cards</button></div>'
      : '<div class="summary">No reviewed setups yet. Start in Ranked Setups and tap Review on the names you want to analyse.</div><a class="helperbutton" href="#resultsSection">Go To Ranked Results</a>';
>>>>>>> 72b8f19ccdf5f8fb63abe30ba3197d53d8e21b99
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
  const ordered = [...state.cards].sort((a, b) => statusRank(a.status) - statusRank(b.status) || b.score - a.score || a.ticker.localeCompare(b.ticker));
  const groups = ['Strong Fit', 'Possible Fit', 'Manual Review', 'Ready', 'Near Setup', 'Watch', 'Avoid'];
  groups.forEach(group => {
    const items = ordered.filter(card => (group === 'Near Setup' ? (card.status === 'Near Setup' || card.status === 'Near Entry') : card.status === group));
    if(!items.length) return;
    const header = document.createElement('div');
    header.className = 'summary';
    header.innerHTML = `<strong>${escapeHtml(group)}</strong><div class="tiny">${items.length} candidate${items.length === 1 ? '' : 's'} in this scanner bucket.</div>`;
    box.appendChild(header);
    items.forEach(card => {
    const promptText = card.lastPrompt || buildTickerPrompt(card);
    const sourceLabel = card.source === 'openai' ? 'OpenAI' : (card.source === 'scanner' ? 'Scanner' : (card.source === 'ai' ? 'Imported AI' : 'Checklist'));
    const marketLabel = card.marketStatus || state.marketStatus;
    const updatedLabel = card.updatedAt ? new Date(card.updatedAt).toLocaleString() : '';
    const loading = uiState.loadingTicker === card.ticker;
    const analysisBusy = !!uiState.loadingTicker;
    const analyseLabel = loading ? 'Analysing...' : (card.lastError ? 'Retry Analysis' : 'Analyse Setup');
    const companyLine = card.companyName ? `<div class="tiny">${escapeHtml(card.companyName)}${card.exchange ? ` • ${escapeHtml(card.exchange)}` : ''}</div>` : '';
    const marketDataLine = card.marketData ? `<div class="tiny">Price ${escapeHtml(fmtPrice(Number(card.price)))} • 20 ${escapeHtml(fmtPrice(Number(card.sma20)))} • 50 ${escapeHtml(fmtPrice(Number(card.sma50)))} • 200 ${escapeHtml(fmtPrice(Number(card.sma200)))} • Vol ${escapeHtml(formatPercent(card.volume && card.avgVolume30d ? ((card.volume / card.avgVolume30d) - 1) * 100 : null))} vs avg • RSI ${escapeHtml(fmtPrice(Number(card.rsi14)))}</div>` : '<div class="tiny">Market data pending...</div>';
    const performanceLine = card.marketData ? `<div class="tiny">1W ${escapeHtml(formatPercent(card.perf1w))} • 1M ${escapeHtml(formatPercent(card.perf1m))} • 3M ${escapeHtml(formatPercent(card.perf3m))} • 6M ${escapeHtml(formatPercent(card.perf6m))} • YTD ${escapeHtml(formatPercent(card.perfYtd))}</div>` : '';
    const watchLine = card.watchTracking ? `<div class="tiny">${watchTrackingText(card)}</div>` : '';
    const suitabilityLine = card.source === 'scanner' && card.analysis && card.analysis.suitability
      ? `<div class="tiny">Trend ${card.analysis.suitability.trend}/30 • Pullback ${card.analysis.suitability.pullback}/30 • Readiness ${card.analysis.suitability.readiness}/20 • Liquidity ${card.analysis.suitability.liquidity}/10 • Risk ${card.analysis.suitability.risk}/10</div>`
      : '';
    const freshnessAge = relativeAgeLabel(card.scannerUpdatedAt);
    const freshnessBadge = card.scannerUpdatedAt ? `<span class="badge ${isFreshScanTimestamp(card.scannerUpdatedAt) ? 'freshness-fresh' : 'freshness-stale'}">${isFreshScanTimestamp(card.scannerUpdatedAt) ? 'Fresh' : 'Stale'}${freshnessAge ? ` • ${escapeHtml(freshnessAge)}` : ''}</span>` : '';
    const meta = `<div class="tiny">${escapeHtml(sourceLabel)} - ${escapeHtml(marketLabel)}${updatedLabel ? ` - ${escapeHtml(updatedLabel)}` : ''}</div>${freshnessBadge ? `<div class="inline-status">${freshnessBadge}</div>` : ''}${companyLine}${marketDataLine}${performanceLine}${suitabilityLine}${watchLine}`;
    const scoreLabel = card.source === 'scanner' ? `${card.score}/100` : `${card.score}/10`;
    const div = document.createElement('div');
    div.className = 'result';
    div.innerHTML = `<div class="resulthead"><div class="ticker">${escapeHtml(card.ticker)}</div><div><div>${escapeHtml(card.summary)}</div>${meta}</div><div class="score ${scoreClass(card.score)}">${escapeHtml(scoreLabel)}</div><div class="inline-status" style="justify-content:flex-end"><span class="badge ${statusClass(card.status)}">${escapeHtml(card.status)}</span><button class="secondary" data-act="open-chart">Open Chart</button><button class="secondary" data-act="load">Load Review</button><button class="danger" data-act="remove">Remove</button></div></div><div class="resultbody"><div class="panelbox"><label for="notes-${card.ticker}">Notes</label><textarea id="notes-${card.ticker}" data-act="notes" placeholder="Add ticker-specific notes here.">${escapeHtml(card.notes || '')}</textarea><details style="margin-top:10px"><summary>Review And Plan In Card</summary>${renderCardChecklist(card)}<div class="actions"><button class="secondary" data-act="save-card-review">Save Card Review</button><button class="secondary" data-act="use-in-planner">Use In Planner</button></div></details><div class="actions"><button class="primary" data-act="analyse" ${analysisBusy && !loading ? 'disabled' : ''}>${analyseLabel}</button><button class="secondary" data-act="copy-prompt">Copy Prompt</button><button class="secondary" data-act="save-trade">Save Trade</button>${card.status === 'Watch' && card.watchTracking && card.watchTracking.extensionDays < EXTENDED_WATCH_TRADING_DAYS ? '<button class="secondary" data-act="extend-watch">Extend to 5D</button>' : ''}${card.watchTracking ? `<button class="secondary" data-act="toggle-pin">${card.watchTracking.pinned ? 'Unpin' : 'Pin'}</button><button class="secondary" data-act="toggle-retain">${card.watchTracking.manualRetain ? 'Auto Drop On' : 'Keep Watch'}</button>` : ''}</div><details class="promptdetails" id="prompt-${card.ticker}" ${(uiState.promptOpen[card.ticker] ?? !!card.lastPrompt) ? 'open' : ''}><summary>Prompt Preview</summary><div class="mutebox">${escapeHtml(promptText)}</div></details><details class="responsepanel" id="response-${card.ticker}" ${(((uiState.responseOpen[card.ticker] ?? !!card.lastResponse) || !!card.lastError)) ? 'open' : ''}><summary>Analysis Result</summary>${renderAnalysisPanel(card)}</details><div class="statusline tiny" id="cardStatus-${card.ticker}">${loading ? '<span class="warntext">Sending setup to the AI endpoint...</span>' : (card.lastError ? `<span class="badtext">${escapeHtml(card.lastError)}</span>` : (card.lastResponse ? 'Latest prompt and response saved to this ticker.' : (analysisBusy ? 'Another setup is being analysed right now.' : 'No AI analysis saved yet.')))}</div></div><div class="panelbox"><label>Chart Upload</label><div class="dropzone" data-act="dropzone"><div class="tiny">Drag a PNG or JPG here, or tap to choose a chart screenshot.</div><label class="primary" for="chart-${card.ticker}">Choose Chart</label><input id="chart-${card.ticker}" data-act="file" type="file" accept="image/png,image/jpeg" /><div class="tiny">Stored locally on this device with this ticker. Max file size: ${formatApproxBytes(MAX_CHART_BYTES)}.</div></div>${card.chartRef && card.chartRef.dataUrl ? `<div class="thumbwrap"><img class="thumb" src="${escapeHtml(card.chartRef.dataUrl)}" alt="Chart preview for ${escapeHtml(card.ticker)}" /><div><div class="tiny">${escapeHtml(card.chartRef.name || 'chart image')}</div><button class="ghost" data-act="clear-chart">Remove Chart</button></div></div>` : '<div class="tiny" style="margin-top:10px">No chart attached yet.</div>'}</div></div>`;
    div.querySelector('[data-act="open-chart"]').onclick = () => openTickerChart(card.ticker);
    div.querySelector('[data-act="load"]').onclick = () => loadCard(card.ticker);
    div.querySelector('[data-act="remove"]').onclick = () => removeCard(card.ticker);
    div.querySelector('[data-act="analyse"]').onclick = () => { if(!uiState.loadingTicker) analyseSetup(card.ticker); };
    div.querySelector('[data-act="save-card-review"]').onclick = () => {
      saveCardReviewFromElement(card.ticker, div);
      const statusBox = $(`cardStatus-${card.ticker}`);
      if(statusBox) statusBox.innerHTML = '<span class="ok">Card review saved.</span>';
    };
    div.querySelector('[data-act="use-in-planner"]').onclick = () => loadCard(card.ticker);
    div.querySelector('[data-act="save-trade"]').onclick = () => {
      const liveCard = upsertCard(card.ticker);
      const notesEl = $(`notes-${card.ticker}`);
      if(notesEl) liveCard.notes = notesEl.value;
      persistState();
      saveTradeFromCard(card.ticker);
      const statusBox = $(`cardStatus-${card.ticker}`);
      if(statusBox) statusBox.innerHTML = '<span class="ok">Trade record saved to the diary.</span>';
    };
    div.querySelector('[data-act="copy-prompt"]').onclick = async () => {
      const liveCard = upsertCard(card.ticker);
      const notesEl = $(`notes-${card.ticker}`);
      if(notesEl) liveCard.notes = notesEl.value;
      liveCard.lastPrompt = buildTickerPrompt(liveCard);
      persistState();
      renderCards();
      const copied = await copyText(liveCard.lastPrompt);
      const statusBox = $(`cardStatus-${card.ticker}`);
      if(statusBox) statusBox.innerHTML = copied ? '<span class="ok">Prompt copied to clipboard.</span>' : '<span class="warntext">Clipboard copy was blocked. Use the prompt preview in this card.</span>';
    };
    const extendWatchBtn = div.querySelector('[data-act="extend-watch"]');
    if(extendWatchBtn){
      extendWatchBtn.onclick = () => {
        const liveCard = upsertCard(card.ticker);
        ensureWatchTracking(liveCard, EXTENDED_WATCH_TRADING_DAYS);
        persistState();
        renderCards();
      };
    }
    const pinBtn = div.querySelector('[data-act="toggle-pin"]');
    if(pinBtn){
      pinBtn.onclick = () => {
        const liveCard = upsertCard(card.ticker);
        ensureWatchTracking(liveCard, liveCard.watchTracking && liveCard.watchTracking.extensionDays || DEFAULT_WATCH_TRADING_DAYS);
        liveCard.watchTracking.pinned = !liveCard.watchTracking.pinned;
        persistState();
        renderCards();
      };
    }
    const retainBtn = div.querySelector('[data-act="toggle-retain"]');
    if(retainBtn){
      retainBtn.onclick = () => {
        const liveCard = upsertCard(card.ticker);
        ensureWatchTracking(liveCard, liveCard.watchTracking && liveCard.watchTracking.extensionDays || DEFAULT_WATCH_TRADING_DAYS);
        liveCard.watchTracking.manualRetain = !liveCard.watchTracking.manualRetain;
        persistState();
        renderCards();
      };
    }
    const notesField = div.querySelector('[data-act="notes"]');
    notesField.addEventListener('input', event => {
      const liveCard = upsertCard(card.ticker);
      liveCard.notes = event.target.value;
      persistState();
    });
    notesField.addEventListener('change', event => {
      const liveCard = upsertCard(card.ticker);
      liveCard.notes = event.target.value;
      persistState();
    });
    const promptDetails = div.querySelector(`#prompt-${card.ticker}`);
    const responseDetails = div.querySelector(`#response-${card.ticker}`);
    promptDetails.addEventListener('toggle', () => { uiState.promptOpen[card.ticker] = promptDetails.open; });
    responseDetails.addEventListener('toggle', () => { uiState.responseOpen[card.ticker] = responseDetails.open; });
    div.querySelector('[data-act="file"]').addEventListener('change', event => handleChartSelection(card.ticker, event.target.files && event.target.files[0]));
    const dropzone = div.querySelector('[data-act="dropzone"]');
    ['dragenter','dragover'].forEach(evt => dropzone.addEventListener(evt, event => {
      event.preventDefault();
      dropzone.classList.add('dragover');
    }));
    ['dragleave','dragend','drop'].forEach(evt => dropzone.addEventListener(evt, event => {
      event.preventDefault();
      dropzone.classList.remove('dragover');
    }));
    dropzone.addEventListener('drop', event => {
      const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      handleChartSelection(card.ticker, file);
    });
    const clearChartBtn = div.querySelector('[data-act="clear-chart"]');
    if(clearChartBtn){
      clearChartBtn.onclick = () => {
        const liveCard = upsertCard(card.ticker);
        liveCard.chartRef = null;
        persistState();
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
    const card = upsertCard(ticker);
    card.chartRef = {name:file.name, type:file.type, dataUrl:String(reader.result || '')};
    card.lastError = '';
    card.updatedAt = new Date().toISOString();
    persistState();
    renderCards();
    const liveStatus = $(`cardStatus-${ticker}`);
    if(liveStatus) liveStatus.innerHTML = '<span class="ok">Chart saved on this device for this ticker.</span>';
  };
  reader.onerror = () => {
    if(statusBox) statusBox.innerHTML = '<span class="badtext">Could not read that chart file.</span>';
  };
  reader.readAsDataURL(file);
}

function loadCard(ticker){
  const card = getCard(ticker);
  if(!card) return;
  $('selectedTicker').value = card.ticker;
  checklistIds.forEach(id => { $(id).checked = !!card.checks[id]; });
  $('entryPrice').value = card.entry || '';
  $('stopPrice').value = card.stop || '';
  $('targetPrice').value = card.target || '';
  refreshReview();
  generateChartPrompt();
  calculate();
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
  const card = upsertCard(ticker);
  if(!state.tickers.includes(ticker)) state.tickers.push(ticker);
  card.checks = checks;
  card.score = result.score;
  card.status = result.status;
  card.summary = buildSummary(checks, result.status);
  card.entry = $('entryPrice').value || '';
  card.stop = $('stopPrice').value || '';
  card.target = $('targetPrice').value || '';
  card.marketStatus = state.marketStatus;
  card.updatedAt = new Date().toISOString();
  card.source = 'manual';
  updateWatchTracking(card);
  updateTickerInputFromState();
  persistState();
  renderCards();
}

function resetReview(){
  ['selectedTicker','statusBox','scoreBox','entryPrice','stopPrice','targetPrice'].forEach(id => { $(id).value = ''; });
  checklistIds.forEach(id => { $(id).checked = false; });
  $('summaryBox').textContent = 'No setup reviewed yet.';
  $('progressText').textContent = '0 / 10';
  $('progressFill').style.width = '0%';
  $('chartPromptBox').textContent = 'Your chart prompt will appear here.';
  $('calcNote').textContent = 'Enter entry, stop, and target to calculate size.';
  ['riskPerShare','positionSize','rrValue'].forEach(id => { $(id).textContent = '-'; });
}

function calculate(){
  saveState();
  const entry = Number($('entryPrice').value);
  const stop = Number($('stopPrice').value);
  const target = Number($('targetPrice').value);
  if(!entry || !stop || entry <= stop){
    $('riskPerShare').textContent = '-';
    $('positionSize').textContent = '-';
    $('rrValue').textContent = '-';
    $('calcNote').textContent = 'Entry must be above stop for a long setup.';
    return;
  }
  const risk = entry - stop;
  const shares = Math.floor(state.maxRisk / risk);
  const rr = target && target > entry ? (target - entry) / risk : null;
  $('riskPerShare').textContent = risk.toFixed(2);
  $('positionSize').textContent = shares > 0 ? `${shares} shares` : '0 shares';
  $('rrValue').textContent = rr ? `${rr.toFixed(2)}R` : '-';
  $('calcNote').textContent = shares < 1 ? 'This stop is too wide for your GBP 40 max risk.' : 'Size is based on your GBP 40 max risk. Check the chart before trading.';
}

function generateWatchPrompt(){
  saveState();
  const sourceCards = state.cards && state.cards.length ? state.cards : state.scannerResults;
  const ranked = [...(sourceCards || [])].sort((a, b) => statusRank(a.status) - statusRank(b.status) || b.score - a.score || a.ticker.localeCompare(b.ticker));
  const watch = ranked.length ? ranked.map(card => `${card.ticker} | ${card.status} | ${card.score}${card.score > 10 ? '/100' : '/10'}`).join('\n') : ((state.tickers || []).join('\n') || '(add tickers here)');
  const prompt = `Analyse these stocks for my Quality Pullback strategy.\n\nRules:\n- Prefer strong stocks in an uptrend\n- Pullback near 20MA or 50MA\n- Must stabilise or bounce\n- Previous swing high = first target\n\nAccount:\n${formatGbp(state.accountSize)} account\n${formatGbp(state.maxRisk)} max risk\n\nMarket status:\n${state.marketStatus}\n\nWatchlist:\n${watch}\n\nReturn ONLY valid JSON in this format:\n[\n  {"ticker":"GNRC","status":"Watch | Near Entry | Entry | Avoid","score":7,"reason":"One plain-English line."}\n]`;
  if($('watchPromptBox')) $('watchPromptBox').textContent = prompt;
  return prompt;
}

function generateChartPrompt(){
  saveState();
  const ticker = normalizeTicker($('selectedTicker').value) || '[TICKER]';
  const prompt = `Analyse this uploaded chart for my Quality Pullback strategy.\n\nUse these rules:\n- Prefer strong stocks in an uptrend\n- Use the 20 MA, 50 MA, and volume if visible\n- I want a pullback near the 20 MA or 50 MA\n- Do not count it as valid unless price is stabilising or bouncing\n- Use previous swing high as the first target area\n- If the setup is unclear, tell me not to trade\n- Explain in plain English and avoid jargon\n\nMy account and risk rules:\n- Account size: ${formatGbp(state.accountSize)}\n- Max risk per trade: ${formatGbp(state.maxRisk)}\n\nContext:\n- Ticker: ${ticker}\n- Market status: ${state.marketStatus}\n- Chart file: A chart image is attached if one is saved on the ticker.\n\nPlease give me:\n1. Plain-English chart read\n2. Verdict: Watch / Near Entry / Entry / Avoid\n3. Suggested entry\n4. Suggested stop\n5. First target\n6. Position size based on my account and max risk\n7. One-sentence final verdict`;
  $('chartPromptBox').textContent = prompt;
  return prompt;
}

function parseImportedResults(raw){
  const text = String(raw || '').trim();
  if(!text) return [];
  try{
    const parsed = JSON.parse(text);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list.map(item => ({
      ticker:normalizeTicker(item.ticker),
      status:normalizeImportedStatus(item.status),
      score:Math.max(0, Math.min(10, Number(item.score) || 0)),
      reason:String(item.reason || item.summary || '').trim()
    })).filter(item => item.ticker);
  }catch(e){}
  return text.split(/\n+/).map(line => line.trim()).filter(Boolean).map(line => {
    const parts = line.split(/\s*\|\s*/);
    if(parts.length < 4) return null;
    return {
      ticker:normalizeTicker(parts[0]),
      status:normalizeImportedStatus(parts[1]),
      score:Math.max(0, Math.min(10, Number((parts[2].match(/(\d+(?:\.\d+)?)/) || [])[1]) || 0)),
      reason:parts.slice(3).join(' | ').trim()
    };
  }).filter(Boolean);
}

function importResults(){
  syncScannerUniverseDraft({updateInputStatus:false});
  if(!$('importResultsInput')){
    setStatus('importStatus', 'Bulk import is no longer shown in the main UI.');
    return;
  }
  const raw = $('importResultsInput').value;
  const parsed = parseImportedResults(raw);
  if(!parsed.length){
    setStatus('importStatus', '<span class="badtext">Nothing usable found.</span> Paste JSON or lines in the format TICKER | Status | 7/10 | Reason.');
    return;
  }
  let updated = 0;
  parsed.forEach(item => {
    const card = upsertCard(item.ticker);
    if(!state.tickers.includes(item.ticker)) state.tickers.push(item.ticker);
    card.status = item.status;
    card.score = item.score;
    card.summary = item.reason || 'Imported from AI result.';
    card.source = 'ai';
    card.marketStatus = state.marketStatus;
    card.updatedAt = new Date().toISOString();
    updated += 1;
  });
  updateRecentTickers(parsed.map(item => item.ticker));
  state.lastImportRaw = raw;
  updateTickerInputFromState();
  persistState();
  renderTickerQuickLists();
  renderCards();
  setStatus('importStatus', `<span class="ok">Imported ${updated} result${updated === 1 ? '' : 's'} to cards.</span>`);
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
  state.accountSize = 4000;
  state.maxRisk = 40;
  state.marketStatus = 'S&P above 50 MA';
  state.listName = "Today's Scan";
  state.tickers = [];
  state.recentTickers = [];
  state.scannerResults = [];
  state.cards = [];
  state.tradeDiary = [];
  state.lastImportRaw = '';
  state.apiKey = '';
  state.dataProvider = 'fmp';
  state.apiPlan = 'scanner';
  state.aiEndpoint = defaultAiEndpoint;
  state.marketDataEndpoint = defaultMarketDataEndpoint;
  state.symbolMeta = {};
  state.scannerDebug = [];
  uiState.promptOpen = {};
  uiState.responseOpen = {};
  uiState.loadingTicker = '';
  uiState.selectedScanner = {};
  $('tickerInput').value = '';
  $('tickerSearch').value = '';
  if($('importResultsInput')) $('importResultsInput').value = '';
  renderTickerSuggestions([]);
  loadState();
  resetReview();
  generateWatchPrompt();
  generateChartPrompt();
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
click('saveBtn', () => { syncScannerUniverseDraft(); saveState(); });
click('loadBtn', loadState);
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
  persistState();
  renderTickerQuickLists();
  renderTvImportPreview([], 'default');
  clearOcrReview();
  renderScannerResults();
  renderCards();
  resetReview();
  generateWatchPrompt();
  setStatus('inputStatus', 'Watchlist cleared.');
  updateTickerSearchStatus();
});
click('resetAllBtn', resetAllData);
click('genWatchPromptBtn', async () => { syncScannerUniverseDraft({updateInputStatus:false}); await copyText(generateWatchPrompt()); });
click('copyWatchPromptBtn', () => copyText(($('watchPromptBox') && $('watchPromptBox').textContent) || generateWatchPrompt()));
click('importResultsBtn', importResults);
click('clearImportBtn', () => {
  if($('importResultsInput')) $('importResultsInput').value = '';
  state.lastImportRaw = '';
  persistState();
  setStatus('importStatus', 'Pasted AI result cleared.');
});
click('saveApiBtn', () => { saveState(); setStatus('apiStatus', '<span class="ok">API settings saved on this device.</span>'); });
click('testApiBtn', testApiConnection);
click('autoAnalyseBtn', () => buildCards());
click('jumpToDiaryBtn', () => {
  const diarySection = $('diarySection');
  if(diarySection) diarySection.scrollIntoView({behavior:'smooth', block:'start'});
});
click('exportDiaryBtn', exportTradeDiary);
click('saveReviewBtn', saveReview);
click('resetReviewBtn', resetReview);
click('calcBtn', calculate);
click('genChartPromptBtn', async () => { calculate(); await copyText(generateChartPrompt()); });
click('copyChartPromptBtn', () => copyText(generateChartPrompt()));

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
  persistState();
  renderTickerQuickLists();
  renderTvImportPreview(state.tickers && state.tickers.length ? state.tickers : [], state.tickers && state.tickers.length ? 'manual' : 'default');
  renderFinalUniversePreview();
});
on('universeMode', 'change', () => {
  saveState();
  renderFinalUniversePreview();
});

['accountSize','maxRisk','marketStatus'].forEach(id => on(id, 'change', () => {
  saveState();
}));
['listName','apiKey','dataProvider','apiPlan','aiEndpoint'].forEach(id => on(id, 'change', saveState));
document.querySelectorAll('.logic').forEach(el => el.addEventListener('change', refreshReview));
['entryPrice','stopPrice','targetPrice'].forEach(id => on(id, 'input', calculate));

registerPwa();
loadState();
updateTickerSearchStatus();
generateWatchPrompt();
generateChartPrompt();
