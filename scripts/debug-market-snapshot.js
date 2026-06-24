const {getProviderConfig, normalizePlanId, normalizeProviderId} = require('../netlify/functions/lib/scan-config');
const fmpProvider = require('../netlify/functions/lib/providers/fmp');
const marketDataProvider = require('../netlify/functions/lib/providers/marketdata');

const PROVIDERS = {
  fmp:fmpProvider,
  marketdata:marketDataProvider
};

function usage(){
  console.log('Usage: node scripts/debug-market-snapshot.js <TICKER> [provider]');
  console.log('Example: node scripts/debug-market-snapshot.js NVDA fmp');
  console.log('Providers: fmp, marketdata');
}

function providerApiKey(providerId){
  if(providerId === 'fmp') return process.env.FMP_API_KEY;
  if(providerId === 'marketdata') return process.env.MARKETDATA_API_KEY || process.env.MARKETDATA_TOKEN;
  return '';
}

function normalizeTicker(value){
  return String(value || '').trim().toUpperCase();
}

function safeNumber(value, digits = 4){
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(digits)) : null;
}

function summarizeHistory(rows = []){
  return rows.slice(0, 5).map(row => ({
    date:String(row.date || ''),
    open:safeNumber(row.open),
    high:safeNumber(row.high),
    low:safeNumber(row.low),
    close:safeNumber(row.close),
    volume:Number.isFinite(Number(row.volume)) ? Number(row.volume) : null
  }));
}

async function main(){
  const ticker = normalizeTicker(process.argv[2]);
  const requestedProvider = normalizeProviderId(process.argv[3] || 'fmp');
  if(!ticker){
    usage();
    process.exitCode = 1;
    return;
  }
  if(!/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)){
    console.error(`Invalid ticker format: ${ticker}`);
    process.exitCode = 1;
    return;
  }

  const planId = normalizePlanId(requestedProvider, 'scanner');
  const providerConfig = getProviderConfig(requestedProvider, planId);
  const adapter = PROVIDERS[providerConfig.id] || PROVIDERS.fmp;
  const apiKey = providerApiKey(providerConfig.id);
  if(!apiKey){
    console.error(`Missing API key for provider ${providerConfig.id}.`);
    console.error(providerConfig.id === 'fmp'
      ? 'Set FMP_API_KEY in your environment.'
      : 'Set MARKETDATA_API_KEY or MARKETDATA_TOKEN in your environment.');
    process.exitCode = 1;
    return;
  }

  const logs = [];
  const log = (level, details = {}) => {
    logs.push({
      level:String(level || 'info'),
      endpoint:String(details.endpoint || ''),
      source:String(details.source || ''),
      outcome:String(details.outcome || ''),
      status:details.status ?? null,
      reason:String(details.reason || '')
    });
  };

  try{
    const snapshot = await adapter.getSnapshot(ticker, {
      apiKey,
      providerConfig,
      log
    });
    const output = {
      ok:true,
      requestedAt:new Date().toISOString(),
      provider:providerConfig.id,
      providerLabel:providerConfig.label,
      ticker,
      trustedComparisonFields:{
        ticker:String(snapshot.ticker || ''),
        tradingViewSymbol:String(snapshot.tradingViewSymbol || ''),
        exchange:String(snapshot.exchange || ''),
        currency:String(snapshot.currency || ''),
        price:safeNumber(snapshot.price),
        sma20:safeNumber(snapshot.sma20),
        sma50:safeNumber(snapshot.sma50),
        sma200:safeNumber(snapshot.sma200),
        previousClose:safeNumber(snapshot.previousClose),
        rsi14:safeNumber(snapshot.rsi14),
        volume:Number.isFinite(Number(snapshot.volume)) ? Number(snapshot.volume) : null,
        avgVolume30:Number.isFinite(Number(snapshot.avgVolume30)) ? Number(snapshot.avgVolume30) : null,
        fetchedAt:String(snapshot.fetchedAt || ''),
        historyPoints:Number.isFinite(Number(snapshot.historyPoints)) ? Number(snapshot.historyPoints) : 0,
        warnings:Array.isArray(snapshot.warnings) ? snapshot.warnings : []
      },
      recentDailyHistory:summarizeHistory(Array.isArray(snapshot.history) ? snapshot.history : []),
      providerTrace:logs
    };
    console.log(JSON.stringify(output, null, 2));
  }catch(error){
    console.error(JSON.stringify({
      ok:false,
      ticker,
      provider:providerConfig.id,
      error:String(error && error.message || 'Snapshot request failed.'),
      providerTrace:logs
    }, null, 2));
    process.exitCode = 1;
  }
}

main();
