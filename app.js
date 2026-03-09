const $ = id => document.getElementById(id);
const on = (id, evt, fn) => { const el = $(id); if (el) el.addEventListener(evt, fn); };
const click = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
const key = 'pullbackPlaybookV3';
const defaultAiEndpoint = '/api/analyse-setup';
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
  tickers:[],
  cards:[],
  lastImportRaw:'',
  apiKey:'',
  dataProvider:'alphavantage',
  apiPlan:'free',
  aiEndpoint:defaultAiEndpoint
};

const uiState = {promptOpen:{},responseOpen:{},loadingTicker:''};
const MAX_CHART_BYTES = 4 * 1024 * 1024;
const ANALYSIS_TIMEOUT_MS = 45000;

function formatGbp(value){
  return `GBP ${Number(value || 0).toLocaleString()}`;
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
    analysis:null
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
  return normalized;
}

function getCard(ticker){
  return state.cards.find(card => card.ticker === normalizeTicker(ticker));
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
  state.apiKey = $('apiKey').value.trim();
  state.dataProvider = $('dataProvider').value;
  state.apiPlan = $('apiPlan').value;
  state.aiEndpoint = $('aiEndpoint').value.trim() || defaultAiEndpoint;
  localStorage.setItem(key, JSON.stringify(state));
  renderStats();
}

function loadState(){
  try{
    Object.assign(state, JSON.parse(localStorage.getItem(key) || '{}') || {});
  }catch(e){}
  state.aiEndpoint = state.aiEndpoint || defaultAiEndpoint;
  state.tickers = parseTickers((state.tickers || []).join('\n'));
  state.cards = (state.cards || []).map(normalizeCard).filter(card => card.ticker);
  $('accountSize').value = state.accountSize;
  $('maxRisk').value = state.maxRisk;
  $('marketStatus').value = state.marketStatus || 'S&P above 50 MA';
  $('listName').value = state.listName || "Today's Scan";
  $('tickerInput').value = (state.tickers || []).join('\n');
  $('importResultsInput').value = state.lastImportRaw || '';
  $('apiKey').value = state.apiKey || '';
  $('dataProvider').value = state.dataProvider || 'alphavantage';
  $('apiPlan').value = state.apiPlan || 'free';
  $('aiEndpoint').value = state.aiEndpoint || defaultAiEndpoint;
  renderStats();
  renderCards();
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

function setStatus(id, html){
  const el = $(id);
  if(el) el.innerHTML = html;
}

function buildCards(){
  saveState();
  const parsed = parseTickersDetailed($('tickerInput').value);
  state.tickers = parsed.valid;
  state.cards = parsed.valid.map(ticker => normalizeCard(getCard(ticker) || baseCard(ticker)));
  updateTickerInputFromState();
  localStorage.setItem(key, JSON.stringify(state));
  renderCards();
  generateWatchPrompt();
  const messages = [];
  if(parsed.valid.length) messages.push(`<span class="ok">${parsed.valid.length} ticker${parsed.valid.length === 1 ? '' : 's'} loaded.</span>`);
  if(parsed.invalid.length) messages.push(`<span class="badtext">Invalid: ${escapeHtml(parsed.invalid.join(', '))}</span>`);
  if(parsed.duplicates.length) messages.push(`<span class="warntext">Duplicates skipped: ${escapeHtml([...new Set(parsed.duplicates)].join(', '))}</span>`);
  setStatus('inputStatus', messages.join(' ') || 'No valid tickers yet.');
}

function addTickerFromSearch(){
  const input = $('tickerSearch');
  const ticker = normalizeTicker(input.value);
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
    input.select();
    return;
  }
  state.tickers.push(ticker);
  state.cards.push(baseCard(ticker));
  updateTickerInputFromState();
  localStorage.setItem(key, JSON.stringify(state));
  renderCards();
  generateWatchPrompt();
  input.value = '';
  setStatus('tickerSearchStatus', `<span class="ok">${escapeHtml(ticker)} added to the watchlist.</span>`);
}

function removeTicker(ticker){
  state.tickers = state.tickers.filter(item => item !== ticker);
  state.cards = state.cards.filter(card => card.ticker !== ticker);
  delete uiState.promptOpen[ticker];
  delete uiState.responseOpen[ticker];
  if($('selectedTicker').value === ticker) resetReview();
  updateTickerInputFromState();
  localStorage.setItem(key, JSON.stringify(state));
  renderCards();
  generateWatchPrompt();
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
  if(status === 'Entry' || status === 'Ready') return 'ready';
  if(status === 'Near Entry' || status === 'Near Pullback') return 'near';
  if(status === 'Avoid') return 'avoid';
  return 'watch';
}

function scoreClass(score){
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

function sma(values, period, index){
  if(index + period > values.length) return null;
  let sum = 0;
  for(let i = index; i < index + period; i += 1) sum += values[i].close;
  return sum / period;
}

function maxHigh(values, start, end){
  let max = -Infinity;
  for(let i = start; i < end; i += 1){
    if(values[i] && values[i].high > max) max = values[i].high;
  }
  return Number.isFinite(max) ? max : null;
}

function analyseSeries(ticker, rows){
  if(!rows || rows.length < 60) throw new Error(`Not enough daily history returned for ${ticker}`);
  const latest = rows[0];
  const prev = rows[1];
  const prev2 = rows[2];
  const close = latest.close;
  const ma20 = sma(rows, 20, 0);
  const ma50 = sma(rows, 50, 0);
  const ma50Prev10 = sma(rows, 50, 10);
  const avgVol20 = rows.slice(1, 21).reduce((sum, row) => sum + row.volume, 0) / 20;
  if(!Number.isFinite(ma20) || !Number.isFinite(ma50)) throw new Error(`Could not calculate the 20 MA and 50 MA for ${ticker}`);
  const uptrend = close > ma50 && ma20 > ma50 && ma50 > ma50Prev10;
  const near20 = Math.abs(close - ma20) / ma20 <= 0.02;
  const near50 = Math.abs(close - ma50) / ma50 <= 0.03;
  const recent5 = rows.slice(0, 5);
  const recentLow = Math.min(...recent5.map(row => row.low));
  const recentRangeAvg = recent5.reduce((sum, row) => sum + (row.high - row.low), 0) / recent5.length;
  const priorRangeAvg = rows.slice(5, 10).reduce((sum, row) => sum + (row.high - row.low), 0) / 5;
  const stabilising = close >= recentLow * 1.005 && recentRangeAvg <= priorRangeAvg * 1.12 && latest.low >= Math.min(prev.low, prev2.low) * 0.985;
  const bounce = close > prev.close && close >= latest.open && latest.low >= prev.low * 0.985;
  const volume = latest.volume >= avgVol20 * 0.9 || latest.volume > prev.volume;
  const swingHigh = maxHigh(rows, 5, 35);
  const roomPct = swingHigh ? ((swingHigh - close) / close) * 100 : 0;
  const checks = {trendStrong:uptrend, above50:close > ma50, above200:false, ma50gt200:false, near20, near50, stabilising, bounce, volume, entryDefined:true, stopDefined:true, targetDefined:!!swingHigh};
  let score = 0;
  if(uptrend) score += 3;
  if(near20 || near50) score += 2;
  if(stabilising) score += 2;
  if(bounce) score += 2;
  if(swingHigh && roomPct >= 4) score += 1;
  if(state.marketStatus === 'S&P below 50 MA') score = Math.max(0, score - 1);
  let status = 'Watch';
  if(!uptrend) status = 'Avoid';
  else if((near20 || near50) && stabilising && bounce) status = score >= 8 ? 'Entry' : 'Near Entry';
  else if((near20 || near50) && (stabilising || bounce)) status = 'Near Entry';
  if(score <= 3) status = 'Avoid';
  const support = near20 ? ma20 : ma50;
  const stop = Math.min(recentLow, support * 0.985);
  let entry = bounce ? latest.high + 0.05 : Math.max(close, support);
  if(entry <= stop) entry = close;
  const target = swingHigh || maxHigh(rows, 35, 60) || close;
  return {ticker, checks, result:{score, status}, entry, stop, target, summary:buildAutoSummary({checks, result:{status}, target}), close, ma20, ma50, ma200:null, swingHigh, roomPct};
}

function buildAutoSummary(data){
  const loc = data.checks.near20 ? '20 MA' : (data.checks.near50 ? '50 MA' : 'moving averages');
  if(data.result.status === 'Avoid') return 'Trend is not strong enough for a quality pullback right now.';
  if(data.result.status === 'Entry') return `Strong uptrend, pullback is near the ${loc}, and price is starting to bounce. First target is near ${fmtPrice(data.target)}.`;
  if(data.result.status === 'Near Entry') return `The trend still looks healthy and price is close to the ${loc}, but it needs more proof that the pullback has finished.`;
  return 'The stock is worth watching, but the pullback is not settled enough yet for a clean entry.';
}

async function fetchAlphaSeries(symbol){
  const apiKey = (state.apiKey || '').trim();
  if(!apiKey) throw new Error('Add your Alpha Vantage API key first.');
  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&outputsize=compact&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url);
  if(!response.ok) throw new Error(`Request failed for ${symbol}`);
  const data = await response.json();
  if(data['Error Message']) throw new Error(`Alpha Vantage could not find ${symbol}.`);
  if(data.Note) throw new Error('Alpha Vantage rate limit hit. Wait a minute and try again, or scan fewer tickers.');
  const series = data['Time Series (Daily)'];
  if(!series) throw new Error(`No daily series returned for ${symbol}.`);
  const rows = Object.entries(series).map(([date, row]) => ({date, open:Number(row['1. open']), high:Number(row['2. high']), low:Number(row['3. low']), close:Number(row['4. close']), volume:Number(row['6. volume'] || row['5. volume'] || 0)})).filter(row => Number.isFinite(row.close)).sort((a, b) => a.date < b.date ? 1 : -1);
  if(rows.length < 60) throw new Error(`Not enough daily history returned for ${symbol}`);
  return rows;
}

async function testApiConnection(){
  saveState();
  setStatus('apiStatus', '<span class="warntext">Testing Alpha Vantage connection...</span>');
  try{
    const rows = await fetchAlphaSeries('IBM');
    setStatus('apiStatus', `<span class="ok">Connected.</span> Pulled ${rows.length} daily bars from Alpha Vantage.`);
  }catch(err){
    setStatus('apiStatus', `<span class="badtext">${escapeHtml(err.message)}</span>`);
  }
}

async function autoAnalyseWatchlist(){
  buildCards();
  saveState();
  const tickers = state.tickers || [];
  if(!tickers.length){
    setStatus('apiStatus', '<span class="badtext">Add at least one ticker first.</span>');
    return;
  }
  if(!(state.apiKey || '').trim()){
    setStatus('apiStatus', '<span class="badtext">Add and save your Alpha Vantage API key first.</span>');
    return;
  }
  const delay = state.apiPlan === 'free' ? 15000 : 1000;
  let done = 0;
  let failed = 0;
  for(let index = 0; index < tickers.length; index += 1){
    const ticker = tickers[index];
    setStatus('apiStatus', `<span class="warntext">Analysing ${escapeHtml(ticker)} (${index + 1}/${tickers.length})...</span> ${done} done, ${failed} failed.`);
    try{
      const rows = await fetchAlphaSeries(ticker);
      const analysis = analyseSeries(ticker, rows);
      const card = upsertCard(ticker);
      card.checks = analysis.checks;
      card.score = analysis.result.score;
      card.status = analysis.result.status;
      card.summary = analysis.summary;
      card.entry = fmtPrice(analysis.entry);
      card.stop = fmtPrice(analysis.stop);
      card.target = fmtPrice(analysis.target);
      card.source = 'alpha';
      card.marketStatus = state.marketStatus;
      card.updatedAt = new Date().toISOString();
      card.analysis = {close:analysis.close, ma20:analysis.ma20, ma50:analysis.ma50, ma200:analysis.ma200, swingHigh:analysis.swingHigh, roomPct:analysis.roomPct};
      done += 1;
      localStorage.setItem(key, JSON.stringify(state));
      renderCards();
    }catch(err){
      const card = upsertCard(ticker);
      card.status = 'Avoid';
      card.score = 0;
      card.summary = err.message;
      card.source = 'alpha';
      card.marketStatus = state.marketStatus;
      card.updatedAt = new Date().toISOString();
      failed += 1;
      localStorage.setItem(key, JSON.stringify(state));
      renderCards();
      if(String(err.message).includes('rate limit')) break;
    }
    if(index < tickers.length - 1) await sleep(delay);
  }
  setStatus('apiStatus', `<span class="ok">Auto analysis finished.</span> ${done} updated, ${failed} failed.`);
}

function currentChecks(){
  const out = {};
  checklistIds.forEach(id => { out[id] = $(id).checked; });
  return out;
}

function checklistText(checks){
  return checklistIds.map(id => `- ${checklistLabels[id]}: ${checks && checks[id] ? 'Yes' : 'No'}`).join('\n');
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
    target:safeCard.target || ''
  };
}

function buildTickerPrompt(card){
  const payload = buildAnalysisPayload(card);
  const chartLine = payload.chartAttached ? `- Chart screenshot attached: Yes (${payload.chartFileName || 'chart image'})` : '- Chart screenshot attached: No';
  return `Analyse this ticker for my Quality Pullback strategy.\n\nTicker:\n- ${payload.ticker}\n\nMarket status:\n- ${payload.marketStatus}\n\nQuality Pullback strategy rules:\n- Prefer strong stocks in an uptrend\n- Prefer pullbacks near the 20 MA or 50 MA\n- Require stabilisation or a bounce before entry\n- Use the previous swing high as the first target\n- Avoid weak or broken trends\n- Avoid chasing extended price\n- Avoid setups without stabilisation or bounce\n\nChecklist:\n${checklistText(payload.checklist)}\n\nUser notes:\n${payload.notes ? payload.notes : '- No notes added.'}\n\nRisk rules:\n- Account size: ${formatGbp(payload.accountSize)}\n- Max risk per trade: ${formatGbp(payload.maxRisk)}\n\nChart context:\n${chartLine}\n\nTrade plan context:\n- Entry: ${payload.entry || 'Not set'}\n- Stop: ${payload.stop || 'Not set'}\n- First target: ${payload.target || 'Not set'}\n\nReturn JSON only with these keys:\n{\n  "verdict": "Watch | Near Entry | Entry | Avoid",\n  "plain_english_chart_read": "short paragraph",\n  "entry": "price or guidance",\n  "stop": "price or guidance",\n  "first_target": "price or guidance",\n  "risk_per_share": "plain English",\n  "position_size": "plain English based on my max risk",\n  "quality_score": 0,\n  "key_reasons": ["reason"],\n  "risks": ["risk"],\n  "final_verdict": "one sentence"\n}`;
}

function normalizeImportedStatus(value){
  const v = String(value || '').trim().toLowerCase();
  if(v === 'ready' || v === 'entry') return 'Entry';
  if(v === 'near pullback' || v === 'near entry') return 'Near Entry';
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

async function analyseSetup(ticker){
  saveState();
  const card = upsertCard(ticker);
  const notesEl = $(`notes-${ticker}`);
  if(notesEl) card.notes = notesEl.value;
  card.lastPrompt = buildTickerPrompt(card);
  card.lastError = '';
  uiState.loadingTicker = ticker;
  uiState.promptOpen[ticker] = true;
  uiState.responseOpen[ticker] = true;
  localStorage.setItem(key, JSON.stringify(state));
  renderCards();
  const endpoint = (state.aiEndpoint || defaultAiEndpoint).trim();
  if(!endpoint){
    card.lastError = 'Add an AI endpoint URL first.';
    uiState.loadingTicker = '';
    renderCards();
    return;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ANALYSIS_TIMEOUT_MS);
  try{
    const response = await fetch(endpoint, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      signal:controller.signal,
      body:JSON.stringify({
        payload:buildAnalysisPayload(card),
        prompt:card.lastPrompt,
        chartRef:card.chartRef ? {name:card.chartRef.name, type:card.chartRef.type, dataUrl:card.chartRef.dataUrl} : null
      })
    });
    const data = await response.json().catch(() => ({}));
    if(!response.ok) throw new Error(buildAnalysisErrorMessage(response.status, data, 'Analysis request failed.'));
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
    localStorage.setItem(key, JSON.stringify(state));
  }catch(err){
    card.lastError = err && err.name === 'AbortError' ? 'The analysis request timed out. Retry the setup.' : String(err.message || 'Analysis request failed.');
    localStorage.setItem(key, JSON.stringify(state));
  }finally{
    clearTimeout(timer);
    uiState.loadingTicker = '';
    renderCards();
  }
}

function renderAnalysisPanel(card){
  if(card.lastError && !card.lastResponse) return `<div class="mutebox">${escapeHtml(card.lastError)}</div>`;
  if(!card.lastResponse) return '<div class="tiny">No AI response saved yet.</div>';
  if(card.lastAnalysis){
    const reasons = card.lastAnalysis.key_reasons.length ? card.lastAnalysis.key_reasons.map(item => `<li>${escapeHtml(item)}</li>`).join('') : '<li>No key reasons returned.</li>';
    const risks = card.lastAnalysis.risks.length ? card.lastAnalysis.risks.map(item => `<li>${escapeHtml(item)}</li>`).join('') : '<li>No risks returned.</li>';
    return `<div class="responsegrid"><div class="responsechips"><span class="badge ${statusClass(card.lastAnalysis.verdict)}">${escapeHtml(card.lastAnalysis.verdict)}</span><span class="score ${scoreClass(card.lastAnalysis.quality_score)}">${card.lastAnalysis.quality_score}/10</span></div><div><strong>Chart Read</strong><div class="tiny">${escapeHtml(card.lastAnalysis.plain_english_chart_read || 'No chart read returned.')}</div></div><div class="row3"><div><strong>Entry</strong><div class="tiny">${escapeHtml(card.lastAnalysis.entry || 'Not given')}</div></div><div><strong>Stop</strong><div class="tiny">${escapeHtml(card.lastAnalysis.stop || 'Not given')}</div></div><div><strong>First Target</strong><div class="tiny">${escapeHtml(card.lastAnalysis.first_target || 'Not given')}</div></div></div><div class="row"><div><strong>Risk / Share</strong><div class="tiny">${escapeHtml(card.lastAnalysis.risk_per_share || 'Not given')}</div></div><div><strong>Position Size</strong><div class="tiny">${escapeHtml(card.lastAnalysis.position_size || 'Not given')}</div></div></div><div><strong>Key Reasons</strong><ul class="tiny">${reasons}</ul></div><div><strong>Risks</strong><ul class="tiny">${risks}</ul></div><div><strong>Final Verdict</strong><div class="tiny">${escapeHtml(card.lastAnalysis.final_verdict || 'No final verdict returned.')}</div></div><details><summary>Raw Response</summary><div class="mutebox">${escapeHtml(card.lastResponse)}</div></details></div>`;
  }
  return `<div class="mutebox">${escapeHtml(card.lastResponse)}</div>`;
}

function renderCards(){
  const box = $('results');
  box.innerHTML = '';
  if(!state.cards || !state.cards.length){
    box.innerHTML = '<div class="summary">No cards yet. Add tickers and press Build Cards.</div>';
    return;
  }
  const ordered = [...state.cards].sort((a, b) => b.score - a.score || a.ticker.localeCompare(b.ticker));
  ordered.forEach(card => {
    const promptText = card.lastPrompt || buildTickerPrompt(card);
    const sourceLabel = card.source === 'openai' ? 'OpenAI' : (card.source === 'alpha' ? 'Alpha Vantage' : (card.source === 'ai' ? 'Imported AI' : 'Checklist'));
    const marketLabel = card.marketStatus || state.marketStatus;
    const updatedLabel = card.updatedAt ? new Date(card.updatedAt).toLocaleString() : '';
    const loading = uiState.loadingTicker === card.ticker;
    const analyseLabel = loading ? 'Analysing...' : (card.lastError ? 'Retry Analysis' : 'Analyse Setup');
    const meta = `<div class="tiny">${escapeHtml(sourceLabel)} - ${escapeHtml(marketLabel)}${updatedLabel ? ` - ${escapeHtml(updatedLabel)}` : ''}</div>`;
    const div = document.createElement('div');
    div.className = 'result';
    div.innerHTML = `<div class="resulthead"><div class="ticker">${escapeHtml(card.ticker)}</div><div><div>${escapeHtml(card.summary)}</div>${meta}</div><div class="score ${scoreClass(card.score)}">${card.score}/10</div><div class="inline-status" style="justify-content:flex-end"><span class="badge ${statusClass(card.status)}">${escapeHtml(card.status)}</span><button class="secondary" data-act="load">Load Review</button><button class="danger" data-act="remove">Remove</button></div></div><div class="resultbody"><div class="panelbox"><label for="notes-${card.ticker}">Notes</label><textarea id="notes-${card.ticker}" data-act="notes" placeholder="Add ticker-specific notes here.">${escapeHtml(card.notes || '')}</textarea><div class="actions"><button class="primary" data-act="analyse">${analyseLabel}</button><button class="secondary" data-act="copy-prompt">Copy Prompt</button></div><details class="promptdetails" id="prompt-${card.ticker}" ${(uiState.promptOpen[card.ticker] ?? !!card.lastPrompt) ? 'open' : ''}><summary>Prompt Preview</summary><div class="mutebox">${escapeHtml(promptText)}</div></details><details class="responsepanel" id="response-${card.ticker}" ${(((uiState.responseOpen[card.ticker] ?? !!card.lastResponse) || !!card.lastError)) ? 'open' : ''}><summary>Analysis Result</summary>${renderAnalysisPanel(card)}</details><div class="statusline tiny" id="cardStatus-${card.ticker}">${loading ? '<span class="warntext">Sending setup to the AI endpoint...</span>' : (card.lastError ? `<span class="badtext">${escapeHtml(card.lastError)}</span>` : (card.lastResponse ? 'Latest prompt and response saved to this ticker.' : 'No AI analysis saved yet.'))}</div></div><div class="panelbox"><label>Chart Upload</label><div class="dropzone" data-act="dropzone"><div class="tiny">Drag a PNG or JPG here, or tap to choose a chart screenshot.</div><label class="primary" for="chart-${card.ticker}">Choose Chart</label><input id="chart-${card.ticker}" data-act="file" type="file" accept="image/png,image/jpeg" /><div class="tiny">Stored locally on this device with this ticker. Max file size: ${formatApproxBytes(MAX_CHART_BYTES)}.</div></div>${card.chartRef && card.chartRef.dataUrl ? `<div class="thumbwrap"><img class="thumb" src="${escapeHtml(card.chartRef.dataUrl)}" alt="Chart preview for ${escapeHtml(card.ticker)}" /><div><div class="tiny">${escapeHtml(card.chartRef.name || 'chart image')}</div><button class="ghost" data-act="clear-chart">Remove Chart</button></div></div>` : '<div class="tiny" style="margin-top:10px">No chart attached yet.</div>'}</div></div>`;
    div.querySelector('[data-act="load"]').onclick = () => loadCard(card.ticker);
    div.querySelector('[data-act="remove"]').onclick = () => removeTicker(card.ticker);
    div.querySelector('[data-act="analyse"]').onclick = () => { if(!loading) analyseSetup(card.ticker); };
    div.querySelector('[data-act="copy-prompt"]').onclick = async () => {
      const liveCard = upsertCard(card.ticker);
      const notesEl = $(`notes-${card.ticker}`);
      if(notesEl) liveCard.notes = notesEl.value;
      liveCard.lastPrompt = buildTickerPrompt(liveCard);
      localStorage.setItem(key, JSON.stringify(state));
      renderCards();
      const copied = await copyText(liveCard.lastPrompt);
      const statusBox = $(`cardStatus-${card.ticker}`);
      if(statusBox) statusBox.innerHTML = copied ? '<span class="ok">Prompt copied to clipboard.</span>' : '<span class="warntext">Clipboard copy was blocked. Use the prompt preview in this card.</span>';
    };
    const notesField = div.querySelector('[data-act="notes"]');
    notesField.addEventListener('input', event => {
      const liveCard = upsertCard(card.ticker);
      liveCard.notes = event.target.value;
      localStorage.setItem(key, JSON.stringify(state));
    });
    notesField.addEventListener('change', event => {
      const liveCard = upsertCard(card.ticker);
      liveCard.notes = event.target.value;
      localStorage.setItem(key, JSON.stringify(state));
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
        localStorage.setItem(key, JSON.stringify(state));
        renderCards();
      };
    }
    box.appendChild(div);
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
    localStorage.setItem(key, JSON.stringify(state));
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
  updateTickerInputFromState();
  localStorage.setItem(key, JSON.stringify(state));
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
  const watch = (state.tickers || []).join('\n') || '(add tickers here)';
  const prompt = `Analyse these stocks for my Quality Pullback strategy.\n\nRules:\n- Prefer strong stocks in an uptrend\n- Pullback near 20MA or 50MA\n- Must stabilise or bounce\n- Previous swing high = first target\n\nAccount:\n${formatGbp(state.accountSize)} account\n${formatGbp(state.maxRisk)} max risk\n\nMarket status:\n${state.marketStatus}\n\nWatchlist:\n${watch}\n\nReturn ONLY valid JSON in this format:\n[\n  {"ticker":"GNRC","status":"Watch | Near Entry | Entry | Avoid","score":7,"reason":"One plain-English line."}\n]`;
  $('watchPromptBox').textContent = prompt;
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
  buildCards();
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
  state.lastImportRaw = raw;
  updateTickerInputFromState();
  localStorage.setItem(key, JSON.stringify(state));
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

function registerPwa(){
  if(!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  });
}

click('addTickerBtn', addTickerFromSearch);
click('buildBtn', buildCards);
click('saveBtn', () => { buildCards(); saveState(); });
click('loadBtn', loadState);
click('clearBtn', () => {
  $('tickerInput').value = '';
  $('tickerSearch').value = '';
  state.tickers = [];
  state.cards = [];
  state.listName = "Today's Scan";
  uiState.promptOpen = {};
  uiState.responseOpen = {};
  localStorage.setItem(key, JSON.stringify(state));
  renderCards();
  resetReview();
  generateWatchPrompt();
  setStatus('inputStatus', 'Watchlist cleared.');
});
click('genWatchPromptBtn', async () => { buildCards(); await copyText(generateWatchPrompt()); });
click('copyWatchPromptBtn', () => copyText($('watchPromptBox').textContent));
click('importResultsBtn', importResults);
click('clearImportBtn', () => {
  $('importResultsInput').value = '';
  state.lastImportRaw = '';
  localStorage.setItem(key, JSON.stringify(state));
  setStatus('importStatus', 'Pasted AI result cleared.');
});
click('saveApiBtn', () => { saveState(); setStatus('apiStatus', '<span class="ok">API settings saved on this device.</span>'); });
click('testApiBtn', testApiConnection);
click('autoAnalyseBtn', autoAnalyseWatchlist);
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

['accountSize','maxRisk','marketStatus','listName','apiKey','dataProvider','apiPlan','aiEndpoint'].forEach(id => on(id, 'change', saveState));
document.querySelectorAll('.logic').forEach(el => el.addEventListener('change', refreshReview));
['entryPrice','stopPrice','targetPrice'].forEach(id => on(id, 'input', calculate));

registerPwa();
loadState();
generateWatchPrompt();
generateChartPrompt();
