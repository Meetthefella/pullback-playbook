const {getProviderConfig, normalizePlanId, normalizeProviderId} = require('../netlify/functions/lib/scan-config');
const fmpProvider = require('../netlify/functions/lib/providers/fmp');
const marketDataProvider = require('../netlify/functions/lib/providers/marketdata');

const PROVIDERS = {
  fmp:fmpProvider,
  marketdata:marketDataProvider
};

function usage(){
  console.log('Usage: node scripts/debug-near-entry-shortlist.js <TICKER...> [--provider=fmp]');
  console.log('Example: node scripts/debug-near-entry-shortlist.js LSCC CDNS MOD BWA ANET --provider=fmp');
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

function pctDistance(price, average){
  const safePrice = Number(price);
  const safeAverage = Number(average);
  if(!Number.isFinite(safePrice) || !Number.isFinite(safeAverage) || safeAverage === 0) return null;
  return (safePrice - safeAverage) / safeAverage;
}

function roundPct(value){
  return Number.isFinite(value) ? Number((value * 100).toFixed(2)) : null;
}

function classifyCandidate(snapshot){
  const price = Number(snapshot.price);
  const sma20 = Number(snapshot.sma20);
  const sma50 = Number(snapshot.sma50);
  const sma200 = Number(snapshot.sma200);
  const rsi14 = Number(snapshot.rsi14);
  const volume = Number(snapshot.volume);
  const avgVolume30 = Number(snapshot.avgVolume30);

  const above50 = Number.isFinite(price) && Number.isFinite(sma50) ? price >= sma50 : false;
  const above200 = Number.isFinite(price) && Number.isFinite(sma200) ? price >= sma200 : false;
  const ma50gt200 = Number.isFinite(sma50) && Number.isFinite(sma200) ? sma50 >= sma200 : false;
  const distance20 = pctDistance(price, sma20);
  const distance50 = pctDistance(price, sma50);
  const near20 = Number.isFinite(distance20) && Math.abs(distance20) <= 0.03;
  const near50 = Number.isFinite(distance50) && Math.abs(distance50) <= 0.04;
  const extended = Number.isFinite(distance20) && distance20 > 0.08;
  const volumeSupportive = Number.isFinite(volume) && Number.isFinite(avgVolume30) && avgVolume30 > 0
    ? volume >= avgVolume30 * 0.9
    : null;
  const rsiHealthy = Number.isFinite(rsi14) ? rsi14 >= 45 && rsi14 <= 68 : null;

  let score = 0;
  const reasons = [];
  const blockers = [];

  if(above200){
    score += 2;
    reasons.push('price above 200MA');
  }else{
    blockers.push('price below 200MA');
  }
  if(ma50gt200){
    score += 2;
    reasons.push('50MA above 200MA');
  }else{
    blockers.push('50MA below 200MA');
  }
  if(above50){
    score += 1;
    reasons.push('price above 50MA');
  }else{
    blockers.push('price below 50MA');
  }
  if(near20){
    score += 3;
    reasons.push('pullback near 20MA');
  }
  if(near50){
    score += 2;
    reasons.push('pullback near 50MA');
  }
  if(extended){
    score -= 3;
    blockers.push('too extended above 20MA');
  }
  if(volumeSupportive === true){
    score += 1;
    reasons.push('volume roughly supportive');
  }
  if(rsiHealthy === true){
    score += 1;
    reasons.push('RSI in a workable range');
  }else if(rsiHealthy === false){
    blockers.push('RSI not in a clean pullback range');
  }

  let verdict = 'Watch';
  if(blockers.includes('price below 200MA') || blockers.includes('50MA below 200MA')){
    verdict = 'Avoid';
  }else if((near20 || near50) && score >= 7){
    verdict = 'Near Entry';
  }

  return {
    verdict,
    score,
    reasons,
    blockers,
    metrics:{
      price:safeNumber(price),
      sma20:safeNumber(sma20),
      sma50:safeNumber(sma50),
      sma200:safeNumber(sma200),
      distance20Pct:roundPct(distance20),
      distance50Pct:roundPct(distance50),
      rsi14:safeNumber(rsi14, 2),
      volumeRatio:Number.isFinite(volume) && Number.isFinite(avgVolume30) && avgVolume30 > 0
        ? Number((volume / avgVolume30).toFixed(2))
        : null
    }
  };
}

function printRankedSummary(results = []){
  const lines = [''];
  lines.push('Near-entry shortlist summary');
  lines.push('--------------------------');
  if(!results.length){
    lines.push('No results.');
    console.log(lines.join('\n'));
    return;
  }
  results.forEach((result, index) => {
    if(result.ok !== true){
      lines.push(`${index + 1}. ${result.ticker}: ERROR - ${result.error}`);
      return;
    }
    const metrics = result.metrics || {};
    const reasons = Array.isArray(result.reasons) && result.reasons.length
      ? result.reasons.join(', ')
      : 'no positive signals';
    const blockers = Array.isArray(result.blockers) && result.blockers.length
      ? result.blockers.join(', ')
      : 'none';
    lines.push(
      `${index + 1}. ${result.ticker}: ${result.verdict} | score ${result.score} | ` +
      `20MA ${metrics.distance20Pct ?? 'n/a'}% | 50MA ${metrics.distance50Pct ?? 'n/a'}% | ` +
      `RSI ${metrics.rsi14 ?? 'n/a'} | reasons: ${reasons} | blockers: ${blockers}`
    );
  });
  console.log(lines.join('\n'));
}

async function fetchSnapshot(adapter, providerConfig, ticker){
  const logs = [];
  const snapshot = await adapter.getSnapshot(ticker, {
    apiKey:providerApiKey(providerConfig.id),
    providerConfig,
    log(level, details = {}){
      logs.push({
        level:String(level || 'info'),
        endpoint:String(details.endpoint || ''),
        source:String(details.source || ''),
        outcome:String(details.outcome || ''),
        status:details.status ?? null,
        reason:String(details.reason || '')
      });
    }
  });
  return {snapshot, logs};
}

async function main(){
  const args = process.argv.slice(2);
  const providerArg = args.find(arg => arg.startsWith('--provider='));
  const requestedProvider = normalizeProviderId((providerArg && providerArg.split('=')[1]) || 'fmp');
  const tickers = args
    .filter(arg => !arg.startsWith('--'))
    .map(normalizeTicker)
    .filter(Boolean);

  if(!tickers.length){
    usage();
    process.exitCode = 1;
    return;
  }

  const invalidTicker = tickers.find(ticker => !/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker));
  if(invalidTicker){
    console.error(`Invalid ticker format: ${invalidTicker}`);
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
      ? 'Set FMP_API_KEY in your current shell session.'
      : 'Set MARKETDATA_API_KEY or MARKETDATA_TOKEN in your current shell session.');
    process.exitCode = 1;
    return;
  }

  const results = [];
  for(const ticker of tickers){
    try{
      const {snapshot, logs} = await fetchSnapshot(adapter, providerConfig, ticker);
      const ranked = classifyCandidate(snapshot);
      results.push({
        ticker,
        ok:true,
        verdict:ranked.verdict,
        score:ranked.score,
        reasons:ranked.reasons,
        blockers:ranked.blockers,
        metrics:ranked.metrics,
        providerTrace:logs
      });
    }catch(error){
      results.push({
        ticker,
        ok:false,
        error:String(error && error.message || 'Snapshot request failed.')
      });
    }
  }

  const rankedResults = results.slice().sort((left, right) => {
    const leftOk = left.ok === true ? 1 : 0;
    const rightOk = right.ok === true ? 1 : 0;
    if(rightOk !== leftOk) return rightOk - leftOk;
    const verdictRank = value => ({
      'Near Entry':3,
      'Watch':2,
      'Avoid':1
    })[String(value || '')] || 0;
    const verdictDelta = verdictRank(right.verdict) - verdictRank(left.verdict);
    if(verdictDelta !== 0) return verdictDelta;
    return Number(right.score || 0) - Number(left.score || 0);
  });

  console.log(JSON.stringify({
    ok:true,
    requestedAt:new Date().toISOString(),
    provider:providerConfig.id,
    tickers,
    rankedResults
  }, null, 2));
  printRankedSummary(rankedResults);
}

main().catch(error => {
  console.error(JSON.stringify({
    ok:false,
    error:String(error && error.message || 'Shortlist evaluation failed.')
  }, null, 2));
  process.exitCode = 1;
});
