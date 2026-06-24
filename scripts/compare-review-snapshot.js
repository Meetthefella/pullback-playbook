const fs = require('fs');
const path = require('path');
const {getProviderConfig, normalizePlanId, normalizeProviderId} = require('../netlify/functions/lib/scan-config');
const fmpProvider = require('../netlify/functions/lib/providers/fmp');
const marketDataProvider = require('../netlify/functions/lib/providers/marketdata');

const PROVIDERS = {
  fmp:fmpProvider,
  marketdata:marketDataProvider
};

function usage(){
  console.log('Usage: node scripts/compare-review-snapshot.js <snapshot-json-path> [provider]');
  console.log('Example: node scripts/compare-review-snapshot.js C:\\temp\\pullback-playbook-review-snapshot-GEV-state-health-2026-06-24.json fmp');
}

function providerApiKey(providerId){
  if(providerId === 'fmp') return process.env.FMP_API_KEY;
  if(providerId === 'marketdata') return process.env.MARKETDATA_API_KEY || process.env.MARKETDATA_TOKEN;
  return '';
}

function safeNumber(value, digits = 4){
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(digits)) : null;
}

function readJson(filePath){
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function summarizeComparison(snapshot, live){
  const scan = snapshot && snapshot.resolverTrace && snapshot.resolverTrace.scan || {};
  const setup = snapshot && snapshot.resolverTrace && snapshot.resolverTrace.setup || {};
  const plan = snapshot && snapshot.resolverTrace && snapshot.resolverTrace.plan || {};
  const derived = scan.analysisProjection && scan.analysisProjection.derived_states || {};
  const trusted = {
    price:safeNumber(live.price),
    sma20:safeNumber(live.sma20),
    sma50:safeNumber(live.sma50),
    sma200:safeNumber(live.sma200)
  };
  const blockers = [];

  if(plan.hasValidPlan !== true) blockers.push('No valid review plan is currently stored.');
  if(String(plan.tradeability || '').trim().toLowerCase() !== 'valid') blockers.push(`Tradeability is ${String(plan.tradeability || 'unknown')}.`);
  if(String(plan.status || '').trim().toLowerCase() !== 'valid') blockers.push(`Plan status is ${String(plan.status || 'unknown')}.`);

  const positionSize = Number(scan.analysisProjection && scan.analysisProjection.position_size);
  if(!Number.isFinite(positionSize) || positionSize < 1){
    blockers.push(`Position size is ${Number.isFinite(positionSize) ? positionSize : 'n/a'}, so the risk rule does not allow even 1 share.`);
  }

  const rr = Number(scan.analysisProjection && scan.analysisProjection.rr_ratio);
  if(Number.isFinite(rr) && rr < 1){
    blockers.push(`Reward:risk is only ${rr.toFixed(2)}R.`);
  }

  if(scan.analysisProjection && scan.analysisProjection.first_target_too_close === true){
    blockers.push('First target is too close relative to the stop distance.');
  }

  if(String(derived.stabilisation_state || '').trim().toLowerCase() === 'early'){
    blockers.push('Stabilisation is still early.');
  }
  if(String(derived.bounce_state || '').trim().toLowerCase() === 'attempt'){
    blockers.push('Bounce is only an attempt, not a confirmed entry-quality bounce.');
  }
  if(String(derived.priceability_state || '').trim().toLowerCase() === 'unpriceable'){
    blockers.push('Priceability is marked unpriceable in the simplified state.');
  }
  if(String(derived.unpriceable_block_reason || '').trim()){
    blockers.push(String(derived.unpriceable_block_reason).trim());
  }

  const liveChecks = [];
  if(Number.isFinite(live.price) && Number.isFinite(live.sma50) && live.sma50 > 0){
    const near50 = live.price >= live.sma50 * 0.985 && live.price <= live.sma50 * 1.07;
    liveChecks.push(`Live price vs 50MA: ${safeNumber(live.price)} vs ${safeNumber(live.sma50)} (${near50 ? 'still near 50MA' : 'not near 50MA'}).`);
  }
  if(Number.isFinite(live.price) && Number.isFinite(live.sma20) && live.sma20 > 0){
    const near20 = live.price >= live.sma20 * 0.97 && live.price <= live.sma20 * 1.06;
    liveChecks.push(`Live price vs 20MA: ${safeNumber(live.price)} vs ${safeNumber(live.sma20)} (${near20 ? 'near 20MA' : 'not near 20MA'}).`);
  }
  if(Number.isFinite(live.price) && Number.isFinite(live.sma200)){
    liveChecks.push(`Live price is ${live.price > live.sma200 ? 'above' : 'below'} the 200MA.`);
  }

  return {
    summary:{
      ticker:String(snapshot.ticker || live.ticker || ''),
      snapshotVerdict:String(setup.verdict || scan.resolvedVerdict || scan.verdict || ''),
      snapshotReviewStatus:String(snapshot.review && snapshot.review.visibleReviewStatus || ''),
      liveProvider:String(live.sourceProvider || ''),
      liveTrustedFields:trusted
    },
    whyNotNearEntry:blockers,
    liveChecks
  };
}

async function fetchLiveSnapshot(ticker, providerId){
  const planId = normalizePlanId(providerId, 'scanner');
  const providerConfig = getProviderConfig(providerId, planId);
  const adapter = PROVIDERS[providerConfig.id] || PROVIDERS.fmp;
  const apiKey = providerApiKey(providerConfig.id);
  if(!apiKey){
    throw new Error(providerConfig.id === 'fmp'
      ? 'Missing FMP_API_KEY.'
      : 'Missing MARKETDATA_API_KEY or MARKETDATA_TOKEN.');
  }
  const logs = [];
  const snapshot = await adapter.getSnapshot(ticker, {
    apiKey,
    providerConfig,
    log:(level, details = {}) => {
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
  snapshot.__providerTrace = logs;
  return snapshot;
}

async function main(){
  const inputPath = process.argv[2];
  const providerId = normalizeProviderId(process.argv[3] || 'fmp');
  if(!inputPath){
    usage();
    process.exitCode = 1;
    return;
  }
  const resolvedPath = path.resolve(process.cwd(), inputPath);
  const snapshot = readJson(resolvedPath);
  const ticker = String(snapshot && snapshot.ticker || '').trim().toUpperCase();
  if(!ticker){
    console.error('Snapshot file does not contain a ticker.');
    process.exitCode = 1;
    return;
  }

  try{
    const live = await fetchLiveSnapshot(ticker, providerId);
    const comparison = summarizeComparison(snapshot, live);
    console.log(JSON.stringify({
      ok:true,
      snapshotFile:resolvedPath,
      provider:providerId,
      comparison,
      liveProviderTrace:live.__providerTrace || []
    }, null, 2));
  }catch(error){
    console.error(JSON.stringify({
      ok:false,
      snapshotFile:resolvedPath,
      provider:providerId,
      error:String(error && error.message || 'Comparison failed.')
    }, null, 2));
    process.exitCode = 1;
  }
}

main();
