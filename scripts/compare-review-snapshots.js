const fs = require('fs');
const path = require('path');
const {getProviderConfig, normalizePlanId, normalizeProviderId} = require('../netlify/functions/lib/scan-config');
const fmpProvider = require('../netlify/functions/lib/providers/fmp');
const marketDataProvider = require('../netlify/functions/lib/providers/marketdata');

const PROVIDERS = {
  fmp:fmpProvider,
  marketdata:marketDataProvider
};

const STATE_FIELDS = [
  'canonicalVerdict',
  'visualBucket',
  'tone',
  'structureEligibility',
  'structureState',
  'setupLocationState',
  'priceabilityState',
  'bounceState',
  'planStatus',
  'resolvedRR',
  'entryGatePass',
  'nearEntryGatePass',
  'primaryBlockerReason',
  'avoidTriggerSource',
  'terminalAvoidApplied',
  'divergenceDetected',
  'lastReviewedAt'
];

function usage(){
  console.log('Usage: node scripts/compare-review-snapshots.js <snapshot-a.json> <snapshot-b.json> [provider]');
  console.log('Example: node scripts/compare-review-snapshots.js snap-a.json snap-b.json fmp');
}

function providerApiKey(providerId){
  if(providerId === 'fmp') return process.env.FMP_API_KEY;
  if(providerId === 'marketdata') return process.env.MARKETDATA_API_KEY || process.env.MARKETDATA_TOKEN;
  return '';
}

function readJson(filePath){
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeBoolish(value){
  const text = String(value == null ? '' : value).trim().toLowerCase();
  if(text === 'true') return true;
  if(text === 'false') return false;
  return null;
}

function safeNumber(value, digits = 4){
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(digits)) : null;
}

function parseStateHealthPanelText(text){
  const source = String(text || '');
  const result = {};
  for(let index = 0; index < STATE_FIELDS.length; index += 1){
    const field = STATE_FIELDS[index];
    const nextField = STATE_FIELDS[index + 1] || '';
    const pattern = nextField
      ? new RegExp(`${field}([\\s\\S]*?)${nextField}`)
      : new RegExp(`${field}([\\s\\S]*)$`);
    const match = source.match(pattern);
    if(!match) continue;
    result[field] = String(match[1] || '').trim();
  }
  return result;
}

function snapshotStateLayer(snapshot = {}){
  const structured = snapshot.stateHealth && typeof snapshot.stateHealth === 'object' ? snapshot.stateHealth : null;
  const parsedText = parseStateHealthPanelText(snapshot.panelText || '');
  const resolverScan = snapshot.resolverTrace && snapshot.resolverTrace.scan || {};
  const resolverSetup = snapshot.resolverTrace && snapshot.resolverTrace.setup || {};
  const resolverPlan = snapshot.resolverTrace && snapshot.resolverTrace.plan || {};
  const projection = resolverScan.analysisProjection || {};
  const derived = projection.derived_states || {};

  const canonicalVerdict = String((structured && structured.canonicalVerdict) || parsedText.canonicalVerdict || resolverSetup.verdict || resolverScan.resolvedVerdict || resolverScan.verdict || '').trim().toLowerCase();
  const visualBucket = String((structured && structured.visualBucket) || parsedText.visualBucket || '').trim().toLowerCase();
  const tone = String((structured && structured.tone) || parsedText.tone || '').trim().toLowerCase();
  const structureEligibility = String((structured && structured.structureEligibility) || parsedText.structureEligibility || derived.structure_eligibility || '').trim().toLowerCase();
  const structureState = String((structured && structured.structureState) || parsedText.structureState || projection.structure_state || '').trim().toLowerCase();
  const setupLocationState = String((structured && structured.setupLocationState) || parsedText.setupLocationState || projection.pullback_zone || '').trim().toLowerCase();
  const priceabilityState = String((structured && structured.priceabilityState) || parsedText.priceabilityState || derived.priceability_state || '').trim().toLowerCase();
  const bounceState = String((structured && structured.bounceState) || parsedText.bounceState || projection.bounce_state || '').trim().toLowerCase();
  const planStatus = String((structured && structured.planStatus) || parsedText.planStatus || resolverPlan.status || resolverPlan.tradeability || '').trim().toLowerCase();
  const resolvedRR = safeNumber((structured && structured.resolvedRR) || parsedText.resolvedRR || projection.rr_ratio || resolverPlan.plannedRR, 2);
  const entryGatePass = structured ? structured.entryGatePass === true : normalizeBoolish(parsedText.entryGatePass);
  const nearEntryGatePass = structured ? structured.nearEntryGatePass === true : normalizeBoolish(parsedText.nearEntryGatePass);
  const primaryBlockerReason = String((structured && structured.primaryBlockerReason) || parsedText.primaryBlockerReason || resolverPlan.blockedReason || derived.unpriceable_block_reason || '').trim();
  const avoidTriggerSource = String((structured && structured.avoidTriggerSource) || parsedText.avoidTriggerSource || '').trim();
  const terminalAvoidApplied = structured ? structured.terminalAvoidApplied === true : normalizeBoolish(parsedText.terminalAvoidApplied);
  const divergenceDetected = structured ? structured.divergenceDetected === true : normalizeBoolish(parsedText.divergenceDetected);

  return {
    canonicalVerdict,
    visualBucket,
    tone,
    structureEligibility,
    structureState,
    setupLocationState,
    priceabilityState,
    bounceState,
    planStatus,
    resolvedRR,
    entryGatePass,
    nearEntryGatePass,
    primaryBlockerReason,
    avoidTriggerSource,
    terminalAvoidApplied,
    divergenceDetected,
    reasons:[]
      .concat(Array.isArray(resolverScan.reasons) ? resolverScan.reasons : [])
      .concat(Array.isArray(resolverSetup.reasons) ? resolverSetup.reasons : []),
    scanVerdict:String(resolverScan.resolvedVerdict || resolverScan.verdict || '').trim(),
    reviewStatus:String(snapshot.review && snapshot.review.visibleReviewStatus || '').trim(),
    quoteCurrency:String(resolverPlan.quoteCurrency || projection.currency || ''),
    liveComparisonFields:{
      price:safeNumber(projection.price),
      sma20:safeNumber(projection.sma20),
      sma50:safeNumber(projection.sma50),
      sma200:safeNumber(projection.sma200)
    }
  };
}

function deriveCanonicalOutcome(layer = {}){
  const reasons = [];
  const verdict = String(layer.canonicalVerdict || '').trim().toLowerCase();
  const structureEligibility = String(layer.structureEligibility || '').trim().toLowerCase();
  const structureState = String(layer.structureState || '').trim().toLowerCase();
  const priceabilityState = String(layer.priceabilityState || '').trim().toLowerCase();
  const planStatus = String(layer.planStatus || '').trim().toLowerCase();
  const bounceState = String(layer.bounceState || '').trim().toLowerCase();
  const nearEntryGatePass = layer.nearEntryGatePass === true;
  const entryGatePass = layer.entryGatePass === true;
  const rr = Number(layer.resolvedRR);
  const blocker = String(layer.primaryBlockerReason || '').trim();
  const terminalAvoidApplied = layer.terminalAvoidApplied === true;

  if(terminalAvoidApplied || verdict === 'avoid'){
    reasons.push(blocker || 'Terminal avoid state is applied.');
    return {canonicalOutcome:'avoid', confidence:'high', reasons};
  }
  if(['broken','weakening','weak'].includes(structureState) || structureEligibility === 'dead'){
    reasons.push(`Structure is ${structureState || structureEligibility || 'not viable'}.`);
    return {canonicalOutcome:'avoid', confidence:'high', reasons};
  }
  if(entryGatePass && ['valid','tradable'].includes(planStatus) && priceabilityState !== 'unpriceable' && bounceState === 'confirmed' && (!Number.isFinite(rr) || rr >= 2)){
    reasons.push('Entry gate passes with valid plan, confirmed bounce, and no priceability block.');
    return {canonicalOutcome:'entry', confidence:'high', reasons};
  }
  if(nearEntryGatePass && ['valid','needs_adjustment','tradable'].includes(planStatus) && priceabilityState !== 'unpriceable' && ['confirmed','attempt'].includes(bounceState)){
    reasons.push('Near-entry gate passes and the setup is close, but not yet an active entry.');
    return {canonicalOutcome:'near_entry', confidence:'medium', reasons};
  }
  if(priceabilityState === 'unpriceable'){
    reasons.push(blocker || 'Priceability is unpriceable.');
  }
  if(['missing','invalid','blocked','unknown'].includes(planStatus) || !planStatus){
    reasons.push(`Plan status is ${planStatus || 'missing'}.`);
  }
  if(bounceState && bounceState !== 'confirmed'){
    reasons.push(`Bounce state is ${bounceState}.`);
  }
  if(Number.isFinite(rr) && rr < 2){
    reasons.push(`Resolved RR is only ${rr.toFixed(2)}.`);
  }
  if(blocker){
    reasons.push(blocker);
  }
  return {canonicalOutcome:'watch', confidence:'high', reasons:[...new Set(reasons)].filter(Boolean)};
}

function compareLayers(layerA, layerB){
  return STATE_FIELDS.map(field => {
    const a = field in layerA ? layerA[field] : '';
    const b = field in layerB ? layerB[field] : '';
    return {
      field,
      a,
      b,
      same:JSON.stringify(a) === JSON.stringify(b)
    };
  }).filter(item => item.same !== true);
}

async function fetchLiveSnapshot(ticker, providerId){
  const planId = normalizePlanId(providerId, 'scanner');
  const providerConfig = getProviderConfig(providerId, planId);
  const adapter = PROVIDERS[providerConfig.id] || PROVIDERS.fmp;
  const apiKey = providerApiKey(providerConfig.id);
  if(!apiKey){
    return null;
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
  return {
    ticker:String(snapshot.ticker || ''),
    provider:providerConfig.id,
    trustedFields:{
      price:safeNumber(snapshot.price),
      sma20:safeNumber(snapshot.sma20),
      sma50:safeNumber(snapshot.sma50),
      sma200:safeNumber(snapshot.sma200)
    },
    trace:logs
  };
}

async function main(){
  const firstPath = process.argv[2];
  const secondPath = process.argv[3];
  const providerId = normalizeProviderId(process.argv[4] || 'fmp');
  if(!firstPath || !secondPath){
    usage();
    process.exitCode = 1;
    return;
  }

  const snapshotA = readJson(path.resolve(process.cwd(), firstPath));
  const snapshotB = readJson(path.resolve(process.cwd(), secondPath));
  const tickerA = String(snapshotA.ticker || '').trim().toUpperCase();
  const tickerB = String(snapshotB.ticker || '').trim().toUpperCase();
  if(!tickerA || tickerA !== tickerB){
    console.error(JSON.stringify({
      ok:false,
      error:'Snapshots must contain the same ticker.',
      tickerA,
      tickerB
    }, null, 2));
    process.exitCode = 1;
    return;
  }

  const layerA = snapshotStateLayer(snapshotA);
  const layerB = snapshotStateLayer(snapshotB);
  const disagreements = compareLayers(layerA, layerB);
  const outcomeA = deriveCanonicalOutcome(layerA);
  const outcomeB = deriveCanonicalOutcome(layerB);
  const finalOutcome = outcomeA.canonicalOutcome === outcomeB.canonicalOutcome
    ? outcomeA
    : deriveCanonicalOutcome({
      ...layerA,
      canonicalVerdict:outcomeA.canonicalOutcome,
      visualBucket:layerB.visualBucket || layerA.visualBucket,
      tone:layerB.tone || layerA.tone,
      structureEligibility:layerA.structureEligibility || layerB.structureEligibility,
      structureState:layerA.structureState || layerB.structureState,
      setupLocationState:layerA.setupLocationState || layerB.setupLocationState,
      priceabilityState:layerA.priceabilityState || layerB.priceabilityState,
      bounceState:layerA.bounceState || layerB.bounceState,
      planStatus:(['missing','invalid','blocked'].includes(layerA.planStatus) || ['missing','invalid','blocked'].includes(layerB.planStatus))
        ? (['missing','invalid','blocked'].includes(layerA.planStatus) ? layerA.planStatus : layerB.planStatus)
        : (layerA.planStatus || layerB.planStatus),
      resolvedRR:Number.isFinite(Number(layerA.resolvedRR)) && Number.isFinite(Number(layerB.resolvedRR))
        ? Math.min(Number(layerA.resolvedRR), Number(layerB.resolvedRR))
        : (layerA.resolvedRR ?? layerB.resolvedRR),
      entryGatePass:layerA.entryGatePass === true && layerB.entryGatePass === true,
      nearEntryGatePass:layerA.nearEntryGatePass === true && layerB.nearEntryGatePass === true,
      terminalAvoidApplied:layerA.terminalAvoidApplied === true || layerB.terminalAvoidApplied === true,
      primaryBlockerReason:layerA.primaryBlockerReason || layerB.primaryBlockerReason
    });

  const live = await fetchLiveSnapshot(tickerA, providerId).catch(() => null);

  console.log(JSON.stringify({
    ok:true,
    ticker:tickerA,
    snapshotA:{
      file:path.resolve(process.cwd(), firstPath),
      panelTitle:String(snapshotA.panelTitle || ''),
      layer:layerA,
      canonicalOutcome:outcomeA
    },
    snapshotB:{
      file:path.resolve(process.cwd(), secondPath),
      panelTitle:String(snapshotB.panelTitle || ''),
      layer:layerB,
      canonicalOutcome:outcomeB
    },
    disagreements,
    resolvedCanonicalOutcome:finalOutcome,
    liveContext:live
  }, null, 2));
}

main().catch(error => {
  console.error(JSON.stringify({
    ok:false,
    error:String(error && error.message || error || 'Comparison failed.')
  }, null, 2));
  process.exit(1);
});
