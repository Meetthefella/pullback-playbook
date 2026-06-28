const {getProviderConfig, normalizePlanId, normalizeProviderId} = require('../netlify/functions/lib/scan-config');
const fmpProvider = require('../netlify/functions/lib/providers/fmp');
const marketDataProvider = require('../netlify/functions/lib/providers/marketdata');
const {spawnSync} = require('child_process');
const path = require('path');
const {classifyShortlistCandidate} = require('./lib/shortlist-classifier');

const PROVIDERS = {
  fmp:fmpProvider,
  marketdata:marketDataProvider
};
const root = path.resolve(__dirname, '..');

function usage(){
  console.log('Usage: node scripts/debug-near-entry-shortlist.js <TICKER...> [--provider=fmp] [--top=5] [--tickers-only]');
  console.log('Example: node scripts/debug-near-entry-shortlist.js LSCC CDNS MOD BWA ANET --provider=fmp --top=3');
}

function providerApiKey(providerId){
  if(providerId === 'fmp') return process.env.FMP_API_KEY;
  if(providerId === 'marketdata') return process.env.MARKETDATA_API_KEY || process.env.MARKETDATA_TOKEN;
  return '';
}

function normalizeTicker(value){
  return String(value || '').trim().toUpperCase();
}

function parseJsonPrefix(output){
  const trimmed = String(output || '').trim();
  if(!trimmed) return null;
  const start = trimmed.indexOf('{');
  if(start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for(let index = start; index < trimmed.length; index += 1){
    const char = trimmed[index];
    if(inString){
      if(escaped){
        escaped = false;
        continue;
      }
      if(char === '\\'){
        escaped = true;
        continue;
      }
      if(char === '"') inString = false;
      continue;
    }
    if(char === '"'){
      inString = true;
      continue;
    }
    if(char === '{'){
      depth += 1;
      continue;
    }
    if(char === '}'){
      depth -= 1;
      if(depth === 0){
        try{
          return JSON.parse(trimmed.slice(start, index + 1));
        }catch(_error){
          return null;
        }
      }
    }
  }
  return null;
}

function resolverVerdictLabel(value){
  const safe = String(value || '').trim().toLowerCase();
  if(safe === 'entry') return 'Entry';
  if(safe === 'near_entry' || safe === 'near entry' || safe === 'nearentry') return 'Near Entry';
  if(safe === 'avoid') return 'Avoid';
  return 'Watch';
}

function runReplayForTickers(tickers, providerArg){
  const replayScript = path.join(root, 'scripts', 'replay-resolver-snapshot.js');
  const args = [replayScript].concat(tickers);
  if(providerArg) args.push(providerArg);
  const result = spawnSync(process.execPath, args, {
    cwd:root,
    env:process.env,
    encoding:'utf8'
  });
  if(result.status !== 0){
    throw new Error(String(result.stderr || result.stdout || 'Resolver replay failed.'));
  }
  const parsed = parseJsonPrefix(result.stdout);
  if(!parsed || !Array.isArray(parsed.results)){
    throw new Error('Unable to parse replay results.');
  }
  return parsed.results;
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
    const resolverLabel = result.verdict || 'Watch';
    const bucketLabel = result.visualBucket || 'unknown';
    const setupScore = Number.isFinite(Number(result.score)) ? Number(result.score) : 'n/a';
    const activeBlockers = Array.isArray(result.topBlockers) && result.topBlockers.length
      ? result.topBlockers.join(', ')
      : 'none';
    const proxyReasons = Array.isArray(result.proxyReasons) && result.proxyReasons.length
      ? result.proxyReasons.join(', ')
      : 'none';
    const proxyBlockers = Array.isArray(result.proxyBlockers) && result.proxyBlockers.length
      ? result.proxyBlockers.join(', ')
      : 'none';
    lines.push(`${index + 1}. ${result.ticker}: ${resolverLabel} | bucket ${bucketLabel} | score ${setupScore}`);
    lines.push(
      `   app: 20MA ${metrics.distance20Pct ?? 'n/a'}% | 50MA ${metrics.distance50Pct ?? 'n/a'}% | ` +
      `RSI ${metrics.rsi14 ?? 'n/a'} | structure ${result.structureState || 'n/a'}/${result.structureEligibility || 'n/a'} | ` +
      `bounce ${result.bounceState || 'n/a'} | stabilisation ${result.stabilisationState || 'n/a'} | ` +
      `priceability ${result.priceabilityState || 'n/a'} | RR ${Number.isFinite(Number(result.realisticRr)) ? Number(result.realisticRr).toFixed(2) : 'n/a'}R`
    );
    if(Array.isArray(result.topBlockers) && result.topBlockers.length){
      lines.push(`   app blockers: ${activeBlockers}`);
    }else if(result.promotionDiagnostics){
      lines.push(`   app diagnostics: ${result.promotionDiagnostics.promotionBlocker || 'n/a'}${result.promotionDiagnostics.failingGate ? ` | gate ${result.promotionDiagnostics.failingGate}` : ''}`);
    }
    lines.push(`   raw proxy context: verdict ${result.proxyVerdict || 'n/a'} | reasons ${proxyReasons} | blockers ${proxyBlockers}`);
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
  const topArg = args.find(arg => arg.startsWith('--top='));
  const tickersOnly = args.includes('--tickers-only');
  const requestedProvider = normalizeProviderId((providerArg && providerArg.split('=')[1]) || 'fmp');
  const topCount = Math.max(1, Number.parseInt((topArg && topArg.split('=')[1]) || '', 10) || 0);
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
      const ranked = classifyShortlistCandidate(snapshot);
      results.push({
        ticker,
        ok:true,
        verdict:ranked.verdict,
        score:ranked.score,
        proxyVerdict:ranked.verdict,
        proxyReasons:ranked.reasons,
        proxyBlockers:ranked.blockers,
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

  const replayResults = runReplayForTickers(
    results.filter(result => result.ok === true).map(result => result.ticker),
    providerArg
  );
  const replayByTicker = new Map(replayResults.map(result => [String(result.ticker || '').trim().toUpperCase(), result]));
  results.forEach(result => {
    if(result.ok !== true) return;
    const replay = replayByTicker.get(result.ticker);
    if(!replay) return;
    const replayVerdict = resolverVerdictLabel(replay.reviewCanonicalVerdict);
    result.verdict = replayVerdict;
    result.score = Number.isFinite(Number(replay.setupScore)) ? Number(replay.setupScore) : result.score;
    result.resolverVerdict = replay.reviewCanonicalVerdict;
    result.visualBucket = replay.reviewVisualBucket;
    result.structureState = replay.structureState;
    result.structureEligibility = replay.structureEligibility;
    result.bounceState = replay.bounceState;
    result.stabilisationState = replay.stabilisationState;
    result.priceabilityState = replay.priceabilityState;
    result.realisticRr = replay.realisticRr;
    result.blockerCopy = String(replay.blockerCopy || '');
    result.promotionDiagnostics = replay.promotionDiagnostics || null;
    result.topBlockers = Array.isArray(replay.blockers) ? replay.blockers.slice() : [];
    if(result.blockerCopy && !['Entry', 'Near Entry'].includes(result.verdict) && !result.topBlockers.includes(result.blockerCopy)){
      result.topBlockers.unshift(result.blockerCopy);
    }
    if(['Entry', 'Near Entry'].includes(result.verdict)){
      result.topBlockers = [];
    }
  });

  const rankedResults = results.slice().sort((left, right) => {
    const leftOk = left.ok === true ? 1 : 0;
    const rightOk = right.ok === true ? 1 : 0;
    if(rightOk !== leftOk) return rightOk - leftOk;
    const verdictRank = value => ({
      'Entry':4,
      'Near Entry':3,
      'Watch':2,
      'Avoid':1
    })[String(value || '')] || 0;
    const verdictDelta = verdictRank(right.verdict) - verdictRank(left.verdict);
    if(verdictDelta !== 0) return verdictDelta;
    return Number(right.score || 0) - Number(left.score || 0);
  });

  const selectedResults = topArg
    ? rankedResults
      .filter(result => result.ok === true && ['Entry', 'Near Entry'].includes(result.verdict))
      .slice(0, topCount)
    : rankedResults.filter(result => result.ok === true && ['Entry', 'Near Entry'].includes(result.verdict));
  const selectedTickers = selectedResults
    .filter(result => result.ok === true)
    .map(result => result.ticker);

  if(tickersOnly){
    console.log(selectedTickers.join(' '));
    return;
  }

  console.log(JSON.stringify({
    ok:true,
    requestedAt:new Date().toISOString(),
    provider:providerConfig.id,
    tickers,
    rankedResults:rankedResults.map(result => result.ok === true ? ({
      ticker:result.ticker,
      ok:true,
      verdict:result.verdict,
      visualBucket:result.visualBucket,
      score:result.score,
      structureState:result.structureState,
      structureEligibility:result.structureEligibility,
      bounceState:result.bounceState,
      stabilisationState:result.stabilisationState,
      priceabilityState:result.priceabilityState,
      realisticRr:result.realisticRr,
      blockerCopy:['Entry', 'Near Entry'].includes(result.verdict) ? '' : (result.blockerCopy || ''),
      topBlockers:['Entry', 'Near Entry'].includes(result.verdict) ? [] : (result.topBlockers || []),
      promotionDiagnostics:['Entry', 'Near Entry'].includes(result.verdict) ? null : (result.promotionDiagnostics || null),
      metrics:result.metrics,
      providerTrace:result.providerTrace,
      rawProxyContext:{
        verdict:result.proxyVerdict,
        reasons:result.proxyReasons,
        blockers:result.proxyBlockers
      }
    }) : result),
    selectedTickers
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
