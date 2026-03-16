const {
  baseNormalizedSnapshot,
  buildNormalizedSnapshot,
  buildTradingViewSymbol,
  normalizeNumber
} = require('../market-normalizers');

const MARKETDATA_BASE_URL = 'https://api.marketdata.app/v1';
const REQUEST_TIMEOUT_MS = 12000;
const MAX_ATTEMPTS = 2;
const HISTORY_COUNTBACK = 260;
const MIN_SCANNER_HISTORY_POINTS = 200;

function safeErrorMessage(error, fallback){
  return String(error && error.message || fallback || 'Unknown error');
}

async function fetchJson(url, token, logger){
  for(let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1){
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try{
      const response = await fetch(url, {
        signal:controller.signal,
        headers:{
          Accept:'application/json',
          Authorization:`Bearer ${token}`
        }
      });
      if(!response.ok){
        const text = await response.text().catch(() => '');
        if(logger) logger('error', {endpoint:url, source:'raw_marketdata', outcome:'http_error', status:response.status, reason:text});
        const error = new Error(text || `MarketData.app request failed with ${response.status}.`);
        error.status = response.status;
        throw error;
      }
      const payload = await response.json().catch(() => null);
      if(payload == null) throw new Error('MarketData.app returned an empty or invalid JSON response.');
      return payload;
    }catch(error){
      if(attempt === MAX_ATTEMPTS - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 350));
    }finally{
      clearTimeout(timeout);
    }
  }
  throw new Error('MarketData.app request failed.');
}

async function fetchJsonWithContext(url, token, source, symbol, logger){
  try{
    const payload = await fetchJson(url, token, (level, details) => logger(level, {...details, symbol}));
    logger('info', {endpoint:url, symbol, source, outcome:'success'});
    return payload;
  }catch(error){
    logger('error', {
      endpoint:url,
      symbol,
      source,
      outcome:'request_failure',
      status:error && error.status,
      reason:safeErrorMessage(error, 'MarketData.app request failed.')
    });
    throw error;
  }
}

function extractMarketDataError(payload, fallback){
  if(payload && typeof payload === 'object'){
    if(String(payload.s || '').toLowerCase() === 'error' && payload.errmsg) return String(payload.errmsg);
    if(payload.error) return String(payload.error);
  }
  return fallback;
}

function ensurePayloadOk(payload, fallback){
  const status = String(payload && payload.s || '').toLowerCase();
  if(status === 'ok') return;
  if(status === 'no_data') throw new Error(extractMarketDataError(payload, 'Ticker not covered by current provider'));
  throw new Error(extractMarketDataError(payload, fallback));
}

function quoteValue(payload, field, fallback = null){
  const value = payload && payload[field];
  if(Array.isArray(value) && value.length) return normalizeNumber(value[0]);
  return fallback;
}

function normalizeMarketDataHistory(payload){
  const status = String(payload && payload.s || '').toLowerCase();
  if(status === 'no_data') return [];
  const times = Array.isArray(payload && payload.t) ? payload.t : [];
  const opens = Array.isArray(payload && payload.o) ? payload.o : [];
  const highs = Array.isArray(payload && payload.h) ? payload.h : [];
  const lows = Array.isArray(payload && payload.l) ? payload.l : [];
  const closes = Array.isArray(payload && payload.c) ? payload.c : [];
  const volumes = Array.isArray(payload && payload.v) ? payload.v : [];
  const rows = [];
  for(let index = 0; index < times.length; index += 1){
    const timestamp = Number(times[index]);
    const close = normalizeNumber(closes[index]);
    if(!Number.isFinite(timestamp) || !Number.isFinite(close)) continue;
    rows.push({
      date:new Date(timestamp * 1000).toISOString().slice(0, 10),
      open:normalizeNumber(opens[index]),
      high:normalizeNumber(highs[index]),
      low:normalizeNumber(lows[index]),
      close,
      volume:normalizeNumber(volumes[index])
    });
  }
  return rows.sort((a, b) => a.date < b.date ? 1 : -1);
}

async function searchSymbols(){
  return [];
}

async function getSnapshot(symbol, config){
  const quoteEndpoint = `${MARKETDATA_BASE_URL}/stocks/quotes/${encodeURIComponent(symbol)}/`;
  const historyEndpoint = `${MARKETDATA_BASE_URL}/stocks/candles/D/${encodeURIComponent(symbol)}/?countback=${HISTORY_COUNTBACK}`;
  const quotePayload = await fetchJsonWithContext(quoteEndpoint, config.apiKey, 'quote', symbol, config.log);
  const historyPayload = await fetchJsonWithContext(historyEndpoint, config.apiKey, 'candles_daily', symbol, config.log);
  ensurePayloadOk(quotePayload, 'MarketData.app quote request failed.');
  ensurePayloadOk(historyPayload, 'MarketData.app candles request failed.');
  const history = normalizeMarketDataHistory(historyPayload);
  config.log(history.length >= MIN_SCANNER_HISTORY_POINTS ? 'info' : 'error', {
    endpoint:historyEndpoint,
    symbol,
    source:'historical_coverage',
    outcome:history.length >= MIN_SCANNER_HISTORY_POINTS ? 'sufficient_history' : 'insufficient_history',
    reason:`rows=${history.length}`
  });
  const warnings = [];
  if(history.length < MIN_SCANNER_HISTORY_POINTS){
    warnings.push(`Insufficient daily history for full scanner metrics (${history.length}/${MIN_SCANNER_HISTORY_POINTS}).`);
  }
  const snapshot = buildNormalizedSnapshot(symbol, 'marketdata', {}, history, warnings);
  const lastPrice = quoteValue(quotePayload, 'last', snapshot.price);
  const midPrice = quoteValue(quotePayload, 'mid', lastPrice);
  const sessionVolume = quoteValue(quotePayload, 'volume', snapshot.volume);
  const change = quoteValue(quotePayload, 'change', null);
  const previousClose = Number.isFinite(lastPrice) && Number.isFinite(change) ? (lastPrice - change) : snapshot.previousClose;
  return {
    ...baseNormalizedSnapshot(symbol, 'marketdata'),
    ...snapshot,
    price:Number.isFinite(lastPrice) ? lastPrice : snapshot.price,
    previousClose:Number.isFinite(previousClose) ? previousClose : snapshot.previousClose,
    volume:Number.isFinite(sessionVolume) ? sessionVolume : snapshot.volume,
    exchange:'',
    currency:null,
    tradingViewSymbol:buildTradingViewSymbol(symbol, ''),
    warnings
  };
}

function classifyError(error){
  const message = safeErrorMessage(error, 'MarketData.app request failed.');
  if(/401|403|unauthorized|forbidden|token/i.test(message)){
    return {
      clientMessage:'MarketData.app authentication failed on the server.',
      logMessage:`marketdata auth error: ${message}`
    };
  }
  if(/429|rate limit/i.test(message)){
    return {
      clientMessage:'MarketData.app rate limit reached. Try again shortly.',
      logMessage:`marketdata rate limit: ${message}`
    };
  }
  if(/no_data|not covered by current provider|symbol/i.test(message)){
    return {
      clientMessage:'Ticker not covered by current provider',
      logMessage:`marketdata symbol coverage failure: ${message}`
    };
  }
  return {
    clientMessage:message,
    logMessage:`marketdata provider error: ${message}`
  };
}

module.exports = {
  classifyError,
  getSnapshot,
  searchSymbols
};
