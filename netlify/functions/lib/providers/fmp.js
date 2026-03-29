const {
  baseNormalizedSnapshot,
  buildNormalizedSnapshot,
  normalizeFmpHistory,
  normalizeFmpProfile,
  normalizeFmpSearchResults
} = require('../market-normalizers');

const FMP_BASE_URL = 'https://financialmodelingprep.com/stable';
const REQUEST_TIMEOUT_MS = 12000;
const MAX_ATTEMPTS = 2;
const MIN_SCANNER_HISTORY_POINTS = 200;
const SEARCH_LIMIT = 8;

function safeErrorMessage(error, fallback){
  return String(error && error.message || fallback || 'Unknown error');
}

function isEndpointAccessErrorMessage(message){
  return /premium query parameter|special endpoint|premium-only|free tier|endpoint not available/i.test(String(message || ''))
    && !/value set for 'symbol' is not available|symbol coverage|not available under your current subscription/i.test(String(message || ''));
}

function isMissingSymbolMessage(message){
  return /not found|missing symbol|invalid symbol|no data|limited symbol coverage|not available for this symbol|value set for 'symbol' is not available|not available under your current subscription/i.test(String(message || ''));
}

async function fetchJson(url, apiKey, logger){
  const fullUrl = `${url}${url.includes('?') ? '&' : '?'}apikey=${encodeURIComponent(apiKey)}`;
  for(let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1){
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try{
      const response = await fetch(fullUrl, {signal:controller.signal});
      if(response.status === 429) throw new Error('FMP rate limit reached. Try again shortly.');
      if(!response.ok){
        const text = await response.text().catch(() => '');
        if(logger) logger('error', {endpoint:url, source:'raw_fmp', outcome:'http_error', status:response.status, reason:text});
        const error = new Error(text || `FMP request failed with ${response.status}.`);
        error.status = response.status;
        throw error;
      }
      const payload = await response.json().catch(() => null);
      if(payload == null) throw new Error('FMP returned an empty or invalid JSON response.');
      return payload;
    }catch(error){
      if(attempt === MAX_ATTEMPTS - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 350));
    }finally{
      clearTimeout(timeout);
    }
  }
  throw new Error('FMP request failed.');
}

async function fetchJsonWithContext(url, apiKey, source, symbol, logger){
  try{
    const payload = await fetchJson(url, apiKey, (level, details) => logger(level, {...details, symbol}));
    logger('info', {endpoint:url, symbol, source, outcome:'success'});
    return payload;
  }catch(error){
    logger(isEndpointAccessErrorMessage(error && error.message) ? 'error' : 'info', {
      endpoint:url,
      symbol,
      source,
      outcome:isEndpointAccessErrorMessage(error && error.message) ? 'endpoint_access_failure' : (isMissingSymbolMessage(error && error.message) ? 'missing_symbol' : 'request_failure'),
      status:error && error.status,
      reason:safeErrorMessage(error, 'FMP request failed.')
    });
    throw error;
  }
}

function classifyError(error, providerLabel){
  const message = safeErrorMessage(error, `${providerLabel} request failed.`);
  if(isEndpointAccessErrorMessage(message)){
    return {
      clientMessage:'Market data endpoint not available on current provider plan',
      logMessage:`provider endpoint access failure: ${message}`
    };
  }
  if(isMissingSymbolMessage(message)){
    return {
      clientMessage:'Ticker not covered by current provider',
      logMessage:`provider symbol coverage failure: ${message}`
    };
  }
  return {
    clientMessage:message,
    logMessage:`provider request failure: ${message}`
  };
}

async function searchSymbols(query, config){
  const endpoint = `${FMP_BASE_URL}/search-symbol?query=${encodeURIComponent(query)}`;
  const results = await fetchJsonWithContext(endpoint, config.apiKey, 'search_symbols', query, config.log);
  return normalizeFmpSearchResults(results).slice(0, SEARCH_LIMIT);
}

async function getFxRate(baseCurrency, quoteCurrency, config){
  const base = String(baseCurrency || '').trim().toUpperCase();
  const quote = String(quoteCurrency || '').trim().toUpperCase();
  if(!base || !quote) throw new Error('Missing FX pair.');
  const pair = `${base}${quote}`;
  const endpoint = `${FMP_BASE_URL}/quote?symbol=${encodeURIComponent(pair)}`;
  const payload = await fetchJsonWithContext(endpoint, config.apiKey, 'fx_quote', pair, config.log);
  const quoteRow = Array.isArray(payload) ? payload[0] : payload;
  const rate = Number(quoteRow && quoteRow.price);
  if(!Number.isFinite(rate) || rate <= 0){
    throw new Error(`FMP FX quote unavailable for ${pair}.`);
  }
  return {
    base,
    quote,
    pair,
    rate
  };
}

async function getSnapshot(symbol, config){
  const profileEndpoint = `${FMP_BASE_URL}/profile?symbol=${encodeURIComponent(symbol)}`;
  const historyEndpoint = `${FMP_BASE_URL}/historical-price-eod/light?symbol=${encodeURIComponent(symbol)}`;
  const profilePayload = await fetchJsonWithContext(profileEndpoint, config.apiKey, 'profile', symbol, config.log);
  const historyPayload = await fetchJsonWithContext(historyEndpoint, config.apiKey, 'historical_eod_light', symbol, config.log);
  const profile = normalizeFmpProfile(profilePayload);
  const history = normalizeFmpHistory(historyPayload);
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
  return buildNormalizedSnapshot(symbol, 'fmp', profile, history, warnings);
}

module.exports = {
  classifyError,
  getFxRate,
  getSnapshot,
  searchSymbols
};
