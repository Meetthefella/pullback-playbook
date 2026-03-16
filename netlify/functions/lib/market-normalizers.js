const DEFAULT_HISTORY_LENGTH = 260;

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

function normalizeNumber(value){
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function average(values){
  if(!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sma(rows, period){
  if(!rows || rows.length < period) return null;
  const closes = rows.slice(0, period).map(row => normalizeNumber(row.close)).filter(Number.isFinite);
  if(closes.length < period) return null;
  return average(closes);
}

function rsi(rows, period){
  if(!rows || rows.length <= period) return null;
  const closes = rows.map(row => normalizeNumber(row.close)).filter(Number.isFinite).reverse();
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

function normalizeExchange(value){
  const raw = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  return EXCHANGE_MAP[raw] || raw || '';
}

function buildTradingViewSymbol(symbol, exchange){
  const cleanSymbol = String(symbol || '').trim().toUpperCase();
  const tvExchange = normalizeExchange(exchange);
  if(!cleanSymbol) return '';
  if(tvExchange === 'LSE' && cleanSymbol.endsWith('.L')) return `LSE:${cleanSymbol.slice(0, -2)}`;
  if(tvExchange) return `${tvExchange}:${cleanSymbol}`;
  if(cleanSymbol.endsWith('.L')) return `LSE:${cleanSymbol.slice(0, -2)}`;
  return cleanSymbol;
}

function normalizeFmpHistory(payload){
  const list = Array.isArray(payload) ? payload : (Array.isArray(payload && payload.historical) ? payload.historical : []);
  return list.map(row => ({
    date:String(row.date || ''),
    close:normalizeNumber(row.close ?? row.price ?? row.adjClose),
    open:normalizeNumber(row.open ?? row.price ?? row.close ?? row.adjClose),
    high:normalizeNumber(row.high ?? row.price ?? row.close ?? row.adjClose),
    low:normalizeNumber(row.low ?? row.price ?? row.close ?? row.adjClose),
    volume:normalizeNumber(row.volume)
  })).filter(row => row.date && Number.isFinite(row.close)).sort((a, b) => a.date < b.date ? 1 : -1).slice(0, DEFAULT_HISTORY_LENGTH);
}

function normalizeFmpProfile(payload){
  const item = Array.isArray(payload) ? payload[0] : payload;
  return item && typeof item === 'object' ? item : {};
}

function normalizeFmpSearchResults(results){
  return (Array.isArray(results) ? results : []).map(item => {
    const symbol = String(item.symbol || item.ticker || '').trim().toUpperCase();
    const exchange = String(item.exchangeShortName || item.exchange || '').trim();
    return {
      symbol,
      ticker:symbol,
      name:String(item.name || item.companyName || '').trim(),
      companyName:String(item.name || item.companyName || '').trim(),
      exchange,
      tradingViewSymbol:buildTradingViewSymbol(symbol, exchange)
    };
  }).filter(item => item.symbol);
}

function baseNormalizedSnapshot(symbol, providerId){
  const cleanSymbol = String(symbol || '').trim().toUpperCase();
  return {
    symbol:cleanSymbol,
    ticker:cleanSymbol,
    name:'',
    companyName:'',
    exchange:'',
    currency:null,
    price:null,
    previousClose:null,
    sma20:null,
    sma50:null,
    sma200:null,
    rsi14:null,
    volume:null,
    avgVolume30:null,
    avgVolume30d:null,
    perf1w:null,
    perf1m:null,
    perf3m:null,
    perf6m:null,
    perfYtd:null,
    marketCap:null,
    history:[],
    historyPoints:0,
    fetchedAt:new Date().toISOString(),
    sourceProvider:providerId,
    warnings:[],
    tradingViewSymbol:buildTradingViewSymbol(cleanSymbol, '')
  };
}

function buildNormalizedSnapshot(symbol, providerId, profile, historyRows, warnings = []){
  const rows = Array.isArray(historyRows) ? historyRows : [];
  const latest = rows[0] || {};
  const price = normalizeNumber(latest.close);
  const avgVolume30 = average(rows.slice(0, 30).map(row => normalizeNumber(row.volume)).filter(Number.isFinite))
    || normalizeNumber(profile && (profile.averageVolume || profile.avgVolume || profile.volAvg));
  const exchangeSource = profile && (profile.exchangeShortName || profile.exchange)
    ? (profile.exchangeShortName || profile.exchange)
    : '';
  const exchange = normalizeExchange(exchangeSource);
  const ytdRow = yearStartRow(rows);
  return {
    ...baseNormalizedSnapshot(symbol, providerId),
    name:String((profile && (profile.companyName || profile.name)) || '').trim(),
    companyName:String((profile && (profile.companyName || profile.name)) || '').trim(),
    exchange,
    currency:String((profile && profile.currency) || '').trim() || null,
    price,
    previousClose:normalizeNumber(rows[1] && rows[1].close),
    sma20:sma(rows, 20),
    sma50:sma(rows, 50),
    sma200:sma(rows, 200),
    rsi14:rsi(rows, 14),
    volume:normalizeNumber(latest.volume),
    avgVolume30,
    avgVolume30d:avgVolume30,
    perf1w:percentageChange(price, normalizeNumber(rows[5] && rows[5].close)),
    perf1m:percentageChange(price, normalizeNumber(rows[21] && rows[21].close)),
    perf3m:percentageChange(price, normalizeNumber(rows[63] && rows[63].close)),
    perf6m:percentageChange(price, normalizeNumber(rows[126] && rows[126].close)),
    perfYtd:percentageChange(price, normalizeNumber(ytdRow && ytdRow.close)),
    marketCap:normalizeNumber(profile && (profile.marketCap || profile.mktCap || profile.marketCapUsd)),
    history:rows,
    historyPoints:rows.length,
    tradingViewSymbol:buildTradingViewSymbol(symbol, exchange),
    warnings:Array.isArray(warnings) ? warnings : []
  };
}

module.exports = {
  DEFAULT_HISTORY_LENGTH,
  EXCHANGE_MAP,
  average,
  baseNormalizedSnapshot,
  buildNormalizedSnapshot,
  buildTradingViewSymbol,
  normalizeExchange,
  normalizeFmpHistory,
  normalizeFmpProfile,
  normalizeFmpSearchResults,
  normalizeNumber,
  percentageChange,
  rsi,
  sma,
  yearStartRow
};
