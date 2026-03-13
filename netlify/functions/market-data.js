const corsHeaders = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

const FMP_BASE_URL = 'https://financialmodelingprep.com/stable';
const DEFAULT_HISTORY_LENGTH = 260;
const MIN_SCANNER_HISTORY_POINTS = 200;
const SEARCH_LIMIT = 8;
const MAX_SCAN_TICKERS = 10;
const REQUEST_TIMEOUT_MS = 12000;
const MAX_ATTEMPTS = 2;
const EXCHANGE_MAP = {
  NASDAQ:'NASDAQ',
  NASDAQGLOBALSELECT:'NASDAQ',
  NASDAQGLOBALMARKET:'NASDAQ',
  NASDAQCAPITALMARKET:'NASDAQ',
  NASDAQGS:'NASDAQ',
  NASDAQGM:'NASDAQ',
  NASDAQCM:'NASDAQ',
  NYSE:'NYSE',
  NEWYORKSTOCKEXCHANGE:'NYSE',
  NYSEARCA:'AMEX',
  NYSEAMERICAN:'AMEX',
  NYSEAMERICANLLC:'AMEX',
  AMEX:'AMEX',
  ARCA:'AMEX',
  LSE:'LSE',
  TSX:'TSX',
  TSXV:'TSXV',
  ASX:'ASX',
  XETRA:'XETR',
  ETR:'XETR',
  EURONEXT:'EURONEXT',
  PAR:'EURONEXT',
  BRU:'EURONEXT',
  AMS:'EURONEXT'
};

function jsonResponse(statusCode, body){
  return {
    statusCode,
    headers:corsHeaders,
    body:JSON.stringify(body)
  };
}

function requestedTickerCount(params){
  const raw = [
    params.symbol,
    params.ticker,
    params.symbols,
    params.tickers
  ].map(value => String(value || '').trim()).filter(Boolean).join(',');
  if(!raw) return 0;
  return [...new Set(raw.split(/[\s,]+/).map(item => String(item || '').trim().toUpperCase()).filter(Boolean))].length;
}

function safeErrorMessage(error, fallback){
  return String(error && error.message || fallback || 'Unknown error');
}

function isEndpointAccessErrorMessage(message){
  return /premium query parameter|special endpoint|premium-only|free tier|endpoint not available/i.test(String(message || ''));
}

function isMissingSymbolMessage(message){
  return /not found|missing symbol|invalid symbol|no data/i.test(String(message || ''));
}

function logEndpointEvent(level, details){
  const payload = {
    endpoint:details.endpoint,
    symbol:details.symbol,
    source:details.source,
    outcome:details.outcome,
    status:details.status || null,
    reason:details.reason || ''
  };
  const line = `[market-data] ${JSON.stringify(payload)}`;
  if(level === 'error') console.error(line);
  else console.log(line);
}

function logHistoryCoverage(symbol, endpoint, rowsLength){
  logEndpointEvent(rowsLength >= MIN_SCANNER_HISTORY_POINTS ? 'info' : 'error', {
    endpoint,
    symbol,
    source:'historical_coverage',
    outcome:rowsLength >= MIN_SCANNER_HISTORY_POINTS ? 'sufficient_history' : 'insufficient_history',
    reason:`rows=${rowsLength}`
  });
}

function baseMarketPayload(symbol){
  return {
    ticker:String(symbol || '').trim().toUpperCase(),
    fetchedAt:new Date().toISOString(),
    companyName:'',
    exchange:'',
    tradingViewSymbol:buildTradingViewSymbol(symbol, ''),
    marketCap:null,
    price:null,
    volume:null,
    avgVolume30d:null,
    sma20:null,
    sma50:null,
    sma200:null,
    perf1w:null,
    perf1m:null,
    perf3m:null,
    perf6m:null,
    perfYtd:null,
    rsi14:null,
    historyPoints:0
  };
}

function normaliseNumber(value){
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function average(values){
  if(!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sma(rows, period){
  if(!rows || rows.length < period) return null;
  const closes = rows.slice(0, period).map(row => normaliseNumber(row.close)).filter(Number.isFinite);
  if(closes.length < period) return null;
  return average(closes);
}

function rsi(rows, period){
  if(!rows || rows.length <= period) return null;
  const closes = rows.map(row => normaliseNumber(row.close)).filter(Number.isFinite).reverse();
  if(closes.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for(let index = 1; index <= period; index += 1){
    const change = closes[index] - closes[index - 1];
    if(change >= 0) gains += change;
    else losses += Math.abs(change);
  }
  let averageGain = gains / period;
  let averageLoss = losses / period;
  for(let index = period + 1; index < closes.length; index += 1){
    const change = closes[index] - closes[index - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    averageGain = ((averageGain * (period - 1)) + gain) / period;
    averageLoss = ((averageLoss * (period - 1)) + loss) / period;
  }
  if(averageLoss === 0) return averageGain === 0 ? 50 : 100;
  const strength = averageGain / averageLoss;
  return 100 - (100 / (1 + strength));
}

function percentageChange(latest, prior){
  if(!Number.isFinite(latest) || !Number.isFinite(prior) || prior === 0) return null;
  return ((latest - prior) / prior) * 100;
}

function yearStartRow(rows){
  if(!rows || !rows.length) return null;
  const currentYear = String(rows[0].date || '').slice(0, 4);
  let candidate = null;
  rows.forEach(row => {
    if(String(row.date || '').slice(0, 4) === currentYear) candidate = row;
  });
  return candidate;
}

function normaliseHistoricalRows(payload){
  const list = Array.isArray(payload) ? payload : (Array.isArray(payload && payload.historical) ? payload.historical : []);
  return list.map(row => ({
    date:String(row.date || ''),
    close:normaliseNumber(row.close ?? row.price ?? row.adjClose),
    open:normaliseNumber(row.open ?? row.price ?? row.close ?? row.adjClose),
    high:normaliseNumber(row.high ?? row.price ?? row.close ?? row.adjClose),
    low:normaliseNumber(row.low ?? row.price ?? row.close ?? row.adjClose),
    volume:normaliseNumber(row.volume)
  })).filter(row => row.date && Number.isFinite(row.close)).sort((a, b) => a.date < b.date ? 1 : -1).slice(0, DEFAULT_HISTORY_LENGTH);
}

function normaliseQuotePayload(payload){
  const item = Array.isArray(payload) ? payload[0] : payload;
  return item && typeof item === 'object' ? item : {};
}

function normaliseProfilePayload(payload){
  const item = Array.isArray(payload) ? payload[0] : payload;
  return item && typeof item === 'object' ? item : {};
}

function normaliseExchange(value){
  const raw = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  return EXCHANGE_MAP[raw] || raw || '';
}

function buildTradingViewSymbol(symbol, exchange){
  const cleanSymbol = String(symbol || '').trim().toUpperCase();
  const tvExchange = normaliseExchange(exchange);
  if(!cleanSymbol) return '';
  if(tvExchange === 'LSE' && cleanSymbol.endsWith('.L')) return `LSE:${cleanSymbol.slice(0, -2)}`;
  if(tvExchange) return `${tvExchange}:${cleanSymbol}`;
  if(cleanSymbol.endsWith('.L')) return `LSE:${cleanSymbol.slice(0, -2)}`;
  return `NASDAQ:${cleanSymbol}`;
}

async function fetchJson(url, apiKey){
  const fullUrl = `${url}${url.includes('?') ? '&' : '?'}apikey=${encodeURIComponent(apiKey)}`;
  for(let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1){
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try{
      const response = await fetch(fullUrl, {signal:controller.signal});
      if(response.status === 429) throw new Error('FMP rate limit reached. Try again shortly.');
      if(!response.ok){
        const text = await response.text().catch(() => '');
        throw new Error(text || `FMP request failed with ${response.status}.`);
      }
      const payload = await response.json().catch(() => null);
      if(payload == null) throw new Error('FMP returned an empty or invalid JSON response.');
      return payload;
    }catch(error){
      const isFinalAttempt = attempt === MAX_ATTEMPTS - 1;
      if(isFinalAttempt) throw error;
      await new Promise(resolve => setTimeout(resolve, 350));
    }finally{
      clearTimeout(timeout);
    }
  }
  throw new Error('FMP request failed.');
}

async function fetchJsonWithContext(url, apiKey, source, symbol){
  try{
    const payload = await fetchJson(url, apiKey);
    logEndpointEvent('info', {
      endpoint:url,
      symbol,
      source,
      outcome:'success'
    });
    return payload;
  }catch(error){
    logEndpointEvent('error', {
      endpoint:url,
      symbol,
      source,
      outcome:isEndpointAccessErrorMessage(error && error.message) ? 'endpoint_access_failure' : (isMissingSymbolMessage(error && error.message) ? 'missing_symbol' : 'request_failure'),
      reason:safeErrorMessage(error, 'FMP request failed.')
    });
    throw error;
  }
}

function classifyMarketDataFailure(source, error){
  const message = safeErrorMessage(error, 'FMP request failed.');
  if(isEndpointAccessErrorMessage(message)){
    return {
      clientMessage:`Market data endpoint not available on free tier (${source})`,
      logMessage:`${source} endpoint not available on free tier: ${message}`
    };
  }
  if(isMissingSymbolMessage(message)){
    return {
      clientMessage:message,
      logMessage:`${source} missing symbol or data: ${message}`
    };
  }
  return {
    clientMessage:message,
    logMessage:`${source} request failed: ${message}`
  };
}

function normaliseSearchResults(results){
  return (Array.isArray(results) ? results : []).slice(0, SEARCH_LIMIT).map(item => {
    const ticker = String(item.symbol || item.ticker || '').trim().toUpperCase();
    const exchange = item.exchangeShortName || item.exchange || '';
    return {
      ticker,
      companyName:String(item.name || item.companyName || '').trim(),
      exchange:String(exchange || '').trim(),
      tradingViewSymbol:buildTradingViewSymbol(ticker, exchange)
    };
  }).filter(item => item.ticker);
}

function buildMarketPayload(symbol, quote, profile, rows){
  const latest = rows[0] || {};
  const latestClose = normaliseNumber(latest.close);
  const quotePrice = normaliseNumber(quote && (quote.price || quote.previousClose));
  const price = Number.isFinite(quotePrice) ? quotePrice : latestClose;
  const volume = normaliseNumber(quote && quote.volume) || normaliseNumber(latest.volume) || normaliseNumber(quote && quote.avgVolume);
  const avgVolume30d = average(rows.slice(0, 30).map(row => normaliseNumber(row.volume)).filter(Number.isFinite)) || normaliseNumber(quote && quote.avgVolume);
  const ytdRow = yearStartRow(rows);
  const exchangeSource = profile && (profile.exchangeShortName || profile.exchange)
    ? (profile.exchangeShortName || profile.exchange)
    : (quote && (quote.exchangeShortName || quote.exchange) ? (quote.exchangeShortName || quote.exchange) : '');
  const exchange = normaliseExchange(exchangeSource);
  return {
    ticker:String(symbol || '').trim().toUpperCase(),
    fetchedAt:new Date().toISOString(),
    companyName:String((profile && (profile.companyName || profile.name)) || (quote && quote.name) || '').trim(),
    exchange,
    tradingViewSymbol:buildTradingViewSymbol(symbol, exchange),
    marketCap:normaliseNumber((quote && quote.marketCap) || (profile && profile.mktCap)),
    price,
    volume,
    avgVolume30d,
    sma20:sma(rows, 20),
    sma50:sma(rows, 50),
    sma200:sma(rows, 200),
    perf1w:percentageChange(price, normaliseNumber(rows[5] && rows[5].close)),
    perf1m:percentageChange(price, normaliseNumber(rows[21] && rows[21].close)),
    perf3m:percentageChange(price, normaliseNumber(rows[63] && rows[63].close)),
    perf6m:percentageChange(price, normaliseNumber(rows[126] && rows[126].close)),
    perfYtd:percentageChange(price, normaliseNumber(ytdRow && ytdRow.close)),
    rsi14:rsi(rows, 14),
    historyPoints:rows.length
  };
}

exports.handler = async function handler(event){
  if(event.httpMethod === 'OPTIONS') return jsonResponse(200, {ok:true});
  if(event.httpMethod !== 'GET') return jsonResponse(405, {error:'Method not allowed'});

  const apiKey = process.env.FMP_API_KEY;
  if(!apiKey) return jsonResponse(500, {error:'FMP_API_KEY is not configured on the server.'});

  const params = event.queryStringParameters || {};
  if(requestedTickerCount(params) > MAX_SCAN_TICKERS){
    return jsonResponse(400, {error:'Maximum 10 tickers per scan in free tier mode'});
  }
  const mode = String(params.mode || '').trim().toLowerCase();
  const symbol = String(params.symbol || params.ticker || '').trim().toUpperCase();
  const query = String(params.query || params.q || '').trim();

  try{
    if(mode === 'search' || query){
      if(query.length < 1) return jsonResponse(400, {error:'Missing search query.'});
      const results = await fetchJson(`${FMP_BASE_URL}/search-symbol?query=${encodeURIComponent(query)}`, apiKey);
      return jsonResponse(200, {ok:true, error:null, results:normaliseSearchResults(results)});
    }

    if(!symbol) return jsonResponse(400, {error:'Missing symbol.'});
    if(!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)){
      return jsonResponse(400, {
        ok:false,
        error:'Invalid ticker symbol format.',
        data:baseMarketPayload(symbol)
      });
    }

    const quoteEndpoint = `${FMP_BASE_URL}/quote-short?symbol=${encodeURIComponent(symbol)}`;
    const profileEndpoint = `${FMP_BASE_URL}/profile?symbol=${encodeURIComponent(symbol)}`;
    const historyEndpoint = `${FMP_BASE_URL}/historical-price-eod/light?symbol=${encodeURIComponent(symbol)}`;

    const quotePayload = await fetchJsonWithContext(quoteEndpoint, apiKey, 'quote_short', symbol).catch(error => ({__error:error}));
    if(quotePayload && quotePayload.__error){
      const failure = classifyMarketDataFailure('quote_short', quotePayload.__error);
      console.error(`[market-data] ${failure.logMessage}`);
      return jsonResponse(200, {
        ok:false,
        error:failure.clientMessage,
        data:baseMarketPayload(symbol)
      });
    }

    const profilePayload = await fetchJsonWithContext(profileEndpoint, apiKey, 'profile', symbol).catch(error => ({__error:error}));
    if(profilePayload && profilePayload.__error){
      const failure = classifyMarketDataFailure('profile', profilePayload.__error);
      console.error(`[market-data] ${failure.logMessage}`);
      return jsonResponse(200, {
        ok:false,
        error:failure.clientMessage,
        data:baseMarketPayload(symbol)
      });
    }

    const historyPayload = await fetchJsonWithContext(historyEndpoint, apiKey, 'historical_light', symbol).catch(error => ({__error:error}));
    if(historyPayload && historyPayload.__error){
      const failure = classifyMarketDataFailure('historical_light', historyPayload.__error);
      console.error(`[market-data] ${failure.logMessage}`);
      return jsonResponse(200, {
        ok:false,
        error:failure.clientMessage,
        data:baseMarketPayload(symbol)
      });
    }

    const quote = normaliseQuotePayload(quotePayload);
    const profile = normaliseProfilePayload(profilePayload);
    const rows = normaliseHistoricalRows(historyPayload);
    logHistoryCoverage(symbol, historyEndpoint, rows.length);
    if(!rows.length){
      return jsonResponse(200, {
        ok:false,
        error:`No historical market data returned for ${symbol}.`,
        data:baseMarketPayload(symbol)
      });
    }
    if(rows.length < MIN_SCANNER_HISTORY_POINTS){
      return jsonResponse(200, {
        ok:false,
        error:`Insufficient free-tier history for scanner metrics (${rows.length}/${MIN_SCANNER_HISTORY_POINTS} sessions returned).`,
        data:baseMarketPayload(symbol)
      });
    }

    return jsonResponse(200, {
      ok:true,
      error:null,
      data:buildMarketPayload(symbol, quote || {}, profile || {}, rows)
    });
  }catch(err){
    const message = safeErrorMessage(err, 'FMP market-data request failed.');
    const safeMessage = isEndpointAccessErrorMessage(message)
      ? 'Market data endpoint not available on free tier'
      : message;
    if(mode === 'search' || query){
      return jsonResponse(200, {
        ok:false,
        error:safeMessage,
        results:[]
      });
    }
    return jsonResponse(200, {
      ok:false,
      error:safeMessage,
      data:baseMarketPayload(symbol)
    });
  }
};
