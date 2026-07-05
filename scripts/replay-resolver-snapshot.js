const fs = require('fs');
const path = require('path');
const vm = require('vm');

const {getProviderConfig, normalizePlanId, normalizeProviderId} = require('../netlify/functions/lib/scan-config');
const fmpProvider = require('../netlify/functions/lib/providers/fmp');
const marketDataProvider = require('../netlify/functions/lib/providers/marketdata');
const {classifyShortlistCandidate} = require('./lib/shortlist-classifier');

const root = path.resolve(__dirname, '..');
const PROVIDERS = {
  fmp:fmpProvider,
  marketdata:marketDataProvider
};

function usage(){
  console.log('Usage:');
  console.log('  node scripts/replay-resolver-snapshot.js EMR ANET MOD');
  console.log('  node scripts/replay-resolver-snapshot.js EMR ANET MOD --provider=fmp');
  console.log('  node scripts/replay-resolver-snapshot.js --snapshot snapshots/phase1-anet-old.json');
  console.log('  node scripts/replay-resolver-snapshot.js EMR ANET MOD --save-snapshot snapshots/phase1-live.json');
  console.log('  node scripts/replay-resolver-snapshot.js EMR ANET MOD --canonical-input-diagnostics');
}

function normalizeTicker(value){
  return String(value || '').trim().toUpperCase();
}

function numericOrNull(value){
  if(value === null || value === undefined) return null;
  if(typeof value === 'string' && value.trim() === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function safeNumber(value, digits = 4){
  const numeric = numericOrNull(value);
  return Number.isFinite(numeric) ? Number(numeric.toFixed(digits)) : null;
}

function pctDistance(price, average){
  const safePrice = numericOrNull(price);
  const safeAverage = numericOrNull(average);
  if(!Number.isFinite(safePrice) || !Number.isFinite(safeAverage) || safeAverage === 0) return null;
  return (safePrice - safeAverage) / safeAverage;
}

function fmtPrice(value){
  const numeric = numericOrNull(value);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : 'n/a';
}

function fmtPct(value, digits = 2){
  const numeric = numericOrNull(value);
  return Number.isFinite(numeric) ? `${(numeric * 100).toFixed(digits)}%` : 'n/a';
}

function fmtRatio(value, digits = 2){
  const numeric = numericOrNull(value);
  return Number.isFinite(numeric) ? `${numeric.toFixed(digits)}R` : 'n/a';
}

function deepClone(value){
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function cloneObject(value){
  return value && typeof value === 'object' ? deepClone(value) : null;
}

function providerApiKey(providerId){
  if(providerId === 'fmp') return process.env.FMP_API_KEY;
  if(providerId === 'marketdata') return process.env.MARKETDATA_API_KEY || process.env.MARKETDATA_TOKEN;
  return '';
}

function extractFunctionSource(source, functionName){
  const start = source.indexOf(`function ${functionName}`);
  if(start < 0) throw new Error(`Unable to find ${functionName} in app.js.`);
  const paramsStart = source.indexOf('(', start);
  let paramsDepth = 0;
  let paramsEnd = -1;
  for(let index = paramsStart; index < source.length; index += 1){
    const char = source[index];
    if(char === '(') paramsDepth += 1;
    else if(char === ')'){
      paramsDepth -= 1;
      if(paramsDepth === 0){
        paramsEnd = index;
        break;
      }
    }
  }
  const bodyStart = source.indexOf('{', paramsEnd > -1 ? paramsEnd : start);
  let depth = 0;
  for(let index = bodyStart; index < source.length; index += 1){
    const char = source[index];
    if(char === '{') depth += 1;
    else if(char === '}'){
      depth -= 1;
      if(depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Unable to extract ${functionName} from app.js.`);
}

function buildSandbox(){
  const sandbox = {
    window:{},
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval
  };
  sandbox.globalThis = sandbox.window;
  sandbox.window.setTimeout = setTimeout;
  sandbox.window.clearTimeout = clearTimeout;
  sandbox.window.setInterval = setInterval;
  sandbox.window.clearInterval = clearInterval;
  return sandbox;
}

function runBrowserModule(relativePath, sandbox){
  const filePath = path.join(root, relativePath);
  const source = fs.readFileSync(filePath, 'utf8');
  vm.runInNewContext(source, sandbox, {filename:filePath});
}

function loadReplayRuntime(){
  const sandbox = buildSandbox();
  runBrowserModule('js/bounce-priceability.js', sandbox);
  runBrowserModule('js/plan-math.js', sandbox);
  runBrowserModule('js/tradeability.js', sandbox);
  runBrowserModule('js/scanner-universe-policy.js', sandbox);
  runBrowserModule('js/setup-basis-policy.js', sandbox);
  runBrowserModule('js/resolver-core.js', sandbox);
  runBrowserModule('js/resolver-presentation.js', sandbox);
  runBrowserModule('js/domain/simplified-plan-state.js', sandbox);
  runBrowserModule('js/presentation/simplified-presentation-model.js', sandbox);
  runBrowserModule('js/domain/simplified-trade-state.js', sandbox);
  runBrowserModule('js/scanner-debug.js', sandbox);
  runBrowserModule('js/domain/canonical-resolver-input.js', sandbox);

  const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  sandbox.numericOrNull = numericOrNull;
  sandbox.state = {
    marketStatus:'S&P above 50 MA',
    setupType:'',
    accountSize:4000,
    riskPercent:1,
    maxLossOverride:'',
    wholeSharesOnly:true
  };
  sandbox.checklistIds = ['trendStrong','above50','above200','ma50gt200','near20','near50','stabilising','bounce','volume','entryDefined','stopDefined','targetDefined'];
  sandbox.average = values => {
    const list = (Array.isArray(values) ? values : []).map(Number).filter(Number.isFinite);
    return list.length ? list.reduce((sum, value) => sum + value, 0) / list.length : null;
  };
  sandbox.clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  sandbox.currentMaxLoss = () => 40;
  sandbox.currentAccountSizeGbp = () => 4000;
  sandbox.normalizeAnalysisVerdict = value => {
    const safe = String(value || '').trim().toLowerCase();
    if(safe === 'entry') return 'Entry';
    if(safe === 'near_entry' || safe === 'near entry' || safe === 'nearentry') return 'Near Entry';
    if(safe === 'avoid') return 'Avoid';
    return 'Watch';
  };
  sandbox.evaluateSetupQualityAdjustments = () => ({
    weakRegimePenalty:false,
    lowControlSetup:false,
    tooWideForQualityPullback:false
  });
  sandbox.isHostileMarketStatus = status => /below 50 ma|weak|hostile/i.test(String(status || ''));
  sandbox.currentRiskSettings = () => ({
    account_size:4000,
    risk_percent:1,
    max_loss_override:'',
    whole_shares_only:true
  });
  sandbox.evaluateRiskFit = (payload) => sandbox.window.PlanMath.evaluateRiskFit(payload, {numericOrNull});
  sandbox.evaluateCapitalFit = (payload) => sandbox.window.PlanMath.evaluateCapitalFit(payload, {
    numericOrNull,
    convertQuoteValueToGbp(value, quoteCurrency){
      if(String(quoteCurrency || '').trim().toUpperCase() === 'USD') return {gbpValue:numericOrNull(value), conversion:'native'};
      return {gbpValue:numericOrNull(value), conversion:'native'};
    },
    classifyCapitalUsage(args){
      return sandbox.window.PlanMath.classifyCapitalUsage(args, {numericOrNull});
    }
  });
  sandbox.evaluateRewardRisk = (entry, stop, target) => sandbox.window.PlanMath.evaluateRewardRisk(entry, stop, target, {numericOrNull});
  sandbox.deriveTradeability = (planStatus, riskStatus, capitalFit) => sandbox.window.Tradeability.deriveTradeability(planStatus, riskStatus, capitalFit);
  sandbox.deriveAffordability = payload => sandbox.window.PlanMath.deriveAffordability(payload, {
    numericOrNull,
    classifyCapitalUsage:sandbox.window.PlanMath.classifyCapitalUsage
  });
  sandbox.normalizeScanType = value => {
    const safe = String(value || '').trim().toUpperCase();
    if(['20MA','50MA','AMBIGUOUS'].includes(safe)) return safe;
    return '';
  };
  sandbox.callSetupBasisPolicy = (methodName, fallbackFn, argsBuilder) => {
    const policy = sandbox.window.SetupBasisPolicy && sandbox.window.SetupBasisPolicy[methodName];
    if(typeof policy !== 'function') return fallbackFn();
    return policy(...(typeof argsBuilder === 'function' ? argsBuilder() : []));
  };
  sandbox.currentSetupType = () => sandbox.window.SetupBasisPolicy.currentSetupType({state:sandbox.state}, {normalizeScanType:sandbox.normalizeScanType});
  sandbox.scanTypeForEvaluation = scanType => sandbox.window.SetupBasisPolicy.scanTypeForEvaluation(scanType, {normalizeScanType:sandbox.normalizeScanType});
  sandbox.resolveScanType = (card, data, checks) => sandbox.window.SetupBasisPolicy.resolveScanType({card, data, checks, state:sandbox.state}, {
    normalizeScanType:sandbox.normalizeScanType,
    numericOrNull
  });
  sandbox.resolveSetupTypeWithOverlap = (card, data, checks) => sandbox.window.SetupBasisPolicy.resolveSetupTypeWithOverlap({card, data, checks, state:sandbox.state}, {
    normalizeScanType:sandbox.normalizeScanType,
    numericOrNull
  });
  sandbox.hasAuthoritativeStopBreach = () => false;

  vm.createContext(sandbox);
  [
    'isNearLevel',
    'deriveRecentCandleEvidence',
    'priorHighTarget',
    'nearestPivotTargets',
    'pullbackSwingHighCandidate',
    'targetResistanceProfile',
    'realisticFirstTarget',
    'deriveTradePlan',
    'legacyResolveSetupTypeWithOverlap',
    'resolveSetupTypeWithOverlap',
    'resolveSetupTypeDebug',
    'mergeDerivedChecks',
    'currentScannerEstimateHardBlockers',
    'resolveAlivePullbackReboundGuard',
    'buildScannerChecks',
    'classifyPullbackType',
    'buildSuitabilitySummary',
    'scoreSuitability',
    'determineScannerVerdict',
    'deriveSetupStates',
    'deriveCurrentPlanState',
    'actionableRrValueForPlan',
    'hasAnyPlanFields',
    'evaluatePlanRealism',
    'evaluateBouncePriceabilityGuard',
    'canonicalLifecycleState',
    'resolveLifecycleTransition',
    'watchlistLifecycleStateRank'
  ].forEach(functionName => {
    vm.runInContext(extractFunctionSource(appSource, functionName), sandbox, {filename:`app.js#${functionName}`});
  });

  return sandbox;
}

function normalizeSnapshotInput(payload, fallbackTicker = ''){
  const source = payload && typeof payload === 'object' ? payload : {};
  const fields = source.trustedComparisonFields && typeof source.trustedComparisonFields === 'object'
    ? source.trustedComparisonFields
    : source;
  const recentHistory = Array.isArray(source.recentDailyHistory)
    ? source.recentDailyHistory
    : (Array.isArray(source.history) ? source.history : []);
  const ticker = normalizeTicker(fields.ticker || source.ticker || fallbackTicker);
  return {
    ticker,
    canonicalContract:cloneObject(source.canonicalContract),
    renderModels:cloneObject(source.renderModels),
    companyName:String(fields.companyName || source.companyName || '').trim(),
    exchange:String(fields.exchange || source.exchange || '').trim(),
    currency:String(fields.currency || source.currency || 'USD').trim() || 'USD',
    price:numericOrNull(fields.price),
    previousClose:numericOrNull(fields.previousClose),
    sma20:numericOrNull(fields.sma20),
    sma50:numericOrNull(fields.sma50),
    sma200:numericOrNull(fields.sma200),
    rsi14:numericOrNull(fields.rsi14),
    volume:numericOrNull(fields.volume),
    avgVolume30d:numericOrNull(fields.avgVolume30 ?? fields.avgVolume30d ?? source.avgVolume30d),
    perf1w:numericOrNull(fields.perf1w),
    perf1m:numericOrNull(fields.perf1m),
    perf3m:numericOrNull(fields.perf3m),
    perf6m:numericOrNull(fields.perf6m),
    perfYtd:numericOrNull(fields.perfYtd),
    tradingViewSymbol:String(fields.tradingViewSymbol || source.tradingViewSymbol || '').trim(),
    fetchedAt:String(fields.fetchedAt || source.fetchedAt || ''),
    warnings:Array.isArray(fields.warnings) ? fields.warnings.slice() : (Array.isArray(source.warnings) ? source.warnings.slice() : []),
    history:recentHistory.map(row => ({
      date:String(row.date || ''),
      open:numericOrNull(row.open),
      high:numericOrNull(row.high),
      low:numericOrNull(row.low),
      close:numericOrNull(row.close),
      volume:numericOrNull(row.volume)
    })),
    meta:cloneObject(source.meta),
    marketData:cloneObject(source.marketData),
    setup:cloneObject(source.setup),
    plan:cloneObject(source.plan),
    scan:cloneObject(source.scan),
    review:cloneObject(source.review),
    reclaimAttempt:source.reclaimAttempt === true,
    reclaimsLevel:source.reclaimsLevel === true,
    breaksLocalHigh:source.breaksLocalHigh === true,
    strongBullishContinuation:source.strongBullishContinuation === true,
    in_watchlist:source.in_watchlist === true,
    watchlist_entry_exists:source.watchlist_entry_exists === true,
    terminal_avoid_applied:source.terminal_avoid_applied === true,
    avoid_trigger_source:String(source.avoid_trigger_source || '').trim()
  };
}

function normalizeReviewProjectionContext(snapshot){
  const review = snapshot && snapshot.review && typeof snapshot.review === 'object' ? snapshot.review : {};
  const projectionSnapshot = review.projectionSnapshot && typeof review.projectionSnapshot === 'object'
    ? cloneObject(review.projectionSnapshot)
    : null;
  const projectionSource = String(review.projectionSource || '').trim().toLowerCase();
  const authoritative = !!projectionSnapshot && (
    projectionSource === 'clicked_card_snapshot'
    || projectionSource === 'track_projection_updated'
  );
  const canonicalVerdict = authoritative
    ? String(
      projectionSnapshot.canonicalVerdict
      || projectionSnapshot.finalVerdict
      || projectionSnapshot.renderedVerdict
      || ''
    ).trim().toLowerCase()
    : '';
  const visualBucket = authoritative
    ? String(
      projectionSnapshot.sourceOfTruthVisualBucket
      || projectionSnapshot.visualBucket
      || projectionSnapshot.renderedBucket
      || ''
    ).trim().toLowerCase()
    : '';
  return {
    authoritative,
    projectionSource,
    projectionSnapshot,
    canonicalVerdict,
    visualBucket
  };
}

function normalizeVerdictKey(value){
  const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
  if(safe === 'near entry') return 'near_entry';
  if(safe === 'near-entry') return 'near_entry';
  if(['watch', 'near_entry', 'entry', 'avoid', 'monitor', 'diminishing'].includes(safe)) return safe;
  if(safe.indexOf('near') >= 0 && safe.indexOf('entry') >= 0) return 'near_entry';
  if(safe.indexOf('entry') >= 0) return 'entry';
  if(safe.indexOf('avoid') >= 0) return 'avoid';
  if(safe.indexOf('watch') >= 0) return 'watch';
  return safe;
}

function normalizeVisualBucketKey(value, canonicalVerdict = ''){
  const safe = normalizeVerdictKey(value);
  if(['entry', 'near_entry', 'monitor', 'diminishing', 'avoid'].includes(safe)) return safe;
  const verdict = normalizeVerdictKey(canonicalVerdict);
  if(verdict === 'entry') return 'entry';
  if(verdict === 'near_entry') return 'near_entry';
  if(verdict === 'avoid') return 'avoid';
  return 'monitor';
}

function extractSnapshotCanonicalAuthority(snapshot){
  const source = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const contract = source.canonicalContract && typeof source.canonicalContract === 'object'
    ? source.canonicalContract
    : null;
  const renderModels = source.renderModels && typeof source.renderModels === 'object'
    ? source.renderModels
    : null;
  const reviewModel = renderModels && renderModels.review && typeof renderModels.review === 'object'
    ? renderModels.review
    : null;
  const trackModel = renderModels && renderModels.track && typeof renderModels.track === 'object'
    ? renderModels.track
    : null;
  const reviewCanonicalVerdict = normalizeVerdictKey(
    reviewModel && reviewModel.canonicalVerdict
    || contract && contract.canonicalVerdict
    || ''
  );
  const scannerCanonicalVerdict = normalizeVerdictKey(
    contract
    && contract.authoritativeInputs
    && contract.authoritativeInputs.scanner
    && contract.authoritativeInputs.scanner.resolvedVerdict
    || source.scan && (source.scan.resolvedVerdict || source.scan.verdict)
    || ''
  );
  const reviewVisualBucket = normalizeVisualBucketKey(
    reviewModel && (reviewModel.visualBucket || reviewModel.visibleBucket)
    || trackModel && (trackModel.visualBucket || trackModel.visibleBucket)
    || contract && contract.canonicalVisualBucket
    || '',
    reviewCanonicalVerdict
  );
  const derivedStates = contract && contract.derivedStates && typeof contract.derivedStates === 'object'
    ? contract.derivedStates
    : null;
  const lifecycleAuthority = contract && contract.lifecycleAuthority && typeof contract.lifecycleAuthority === 'object'
    ? contract.lifecycleAuthority
    : null;
  return {
    contract,
    renderModels,
    scannerCanonicalVerdict,
    scannerVisualBucket:normalizeVisualBucketKey(scannerCanonicalVerdict, scannerCanonicalVerdict),
    reviewCanonicalVerdict,
    reviewVisualBucket,
    reviewNextAction:String(
      reviewModel && (reviewModel.nextAction || reviewModel.actionLabel)
      || trackModel && (trackModel.nextAction || trackModel.actionLabel)
      || ''
    ).trim(),
    reviewPrimaryReason:String(
      reviewModel && (reviewModel.primaryReason || reviewModel.mainBlocker)
      || trackModel && (trackModel.primaryReason || trackModel.mainBlocker)
      || ''
    ).trim(),
    contractFingerprint:String(contract && contract.contractFingerprint || reviewModel && reviewModel.contractFingerprint || trackModel && trackModel.contractFingerprint || '').trim(),
    setupScore:Number.isFinite(Number(derivedStates && derivedStates.setupScore))
      ? Number(derivedStates && derivedStates.setupScore)
      : null,
    structureState:String(derivedStates && derivedStates.structureState || '').trim().toLowerCase(),
    structureEligibility:String(derivedStates && derivedStates.structureEligibility || '').trim().toLowerCase(),
    setupLocationState:String(derivedStates && derivedStates.setupLocationState || '').trim().toLowerCase(),
    priceabilityState:String(derivedStates && derivedStates.priceabilityState || '').trim().toLowerCase(),
    stabilisationState:String(derivedStates && derivedStates.stabilisationState || '').trim().toLowerCase(),
    bounceState:String(derivedStates && derivedStates.bounceState || '').trim().toLowerCase(),
    planStatus:String(
      contract && contract.planAuthority && contract.planAuthority.status
      || reviewModel && reviewModel.planStatus
      || trackModel && trackModel.planStatus
      || ''
    ).trim().toLowerCase(),
    lifecycleState:String(lifecycleAuthority && lifecycleAuthority.state || '').trim().toLowerCase()
  };
}

function extractSnapshotReplayPublicFields(snapshotAuthority, snapshot){
  const authority = snapshotAuthority && typeof snapshotAuthority === 'object' ? snapshotAuthority : {};
  const source = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const contract = authority.contract && typeof authority.contract === 'object' ? authority.contract : {};
  const renderModels = authority.renderModels && typeof authority.renderModels === 'object' ? authority.renderModels : {};
  const reviewModel = renderModels.review && typeof renderModels.review === 'object' ? renderModels.review : {};
  const trackModel = renderModels.track && typeof renderModels.track === 'object' ? renderModels.track : {};
  const targetProfile = extractSnapshotTargetProfile(source);
  return {
    scannerCanonicalVerdict:String(authority.scannerCanonicalVerdict || '').trim().toLowerCase(),
    scannerVisualBucket:String(authority.scannerVisualBucket || '').trim().toLowerCase(),
    reviewCanonicalVerdict:String(authority.reviewCanonicalVerdict || '').trim().toLowerCase(),
    reviewVisualBucket:String(authority.reviewVisualBucket || '').trim().toLowerCase(),
    reviewNextAction:String(authority.reviewNextAction || '').trim(),
    reviewPrimaryReason:String(authority.reviewPrimaryReason || '').trim(),
    planStatus:String(
      authority.planStatus
      || contract.planAuthority && contract.planAuthority.status
      || reviewModel.planStatus
      || trackModel.planStatus
      || ''
    ).trim().toLowerCase(),
    snapshotContractFingerprint:String(authority.contractFingerprint || '').trim(),
    simulatedLifecycleFromWatch:String(authority.lifecycleState || '').trim().toLowerCase(),
    structureState:String(authority.structureState || '').trim().toLowerCase(),
    structureEligibility:String(authority.structureEligibility || '').trim().toLowerCase(),
    bounceState:String(authority.bounceState || '').trim().toLowerCase(),
    stabilisationState:String(authority.stabilisationState || '').trim().toLowerCase(),
    priceabilityState:String(authority.priceabilityState || '').trim().toLowerCase(),
    setupScore:Number.isFinite(Number(authority.setupScore)) ? Number(authority.setupScore) : null,
    realisticTarget:targetProfile ? targetProfile.realistic_target : null,
    extendedTarget:targetProfile ? targetProfile.extended_target : null,
    realisticRr:targetProfile ? targetProfile.realistic_rr : null,
    targetStretchPct:targetProfile ? targetProfile.target_stretch_pct : null,
    targetCapReason:targetProfile ? String(targetProfile.target_cap_reason || '').trim() : ''
  };
}

function ensureDirectoryForFile(filePath){
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, {recursive:true});
}

function loadSnapshotsFromFile(snapshotPath){
  const filePath = path.resolve(process.cwd(), snapshotPath);
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if(Array.isArray(parsed)){
    return parsed.map((entry, index) => normalizeSnapshotInput(entry, `SNAPSHOT_${index + 1}`));
  }
  if(Array.isArray(parsed.snapshots)){
    return parsed.snapshots.map((entry, index) => normalizeSnapshotInput(
      entry && entry.snapshot ? entry.snapshot : entry,
      entry && entry.ticker ? entry.ticker : `SNAPSHOT_${index + 1}`
    ));
  }
  if(parsed.rankedResults && Array.isArray(parsed.rankedResults)){
    return parsed.rankedResults
      .filter(entry => entry && entry.ok === true && entry.snapshot)
      .map(entry => normalizeSnapshotInput(entry.snapshot, entry.ticker));
  }
  return [normalizeSnapshotInput(parsed)];
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

function buildReplayDeps(sandbox){
  let coreDepsCache = null;
  const ensureCoreDeps = () => {
    if(coreDepsCache) return coreDepsCache;
    coreDepsCache = {
      resolveFinalStateContract(item){
        if(item && item.resolvedContract && typeof item.resolvedContract === 'object'){
          return item.resolvedContract;
        }
        return {
          finalVerdict:'Watch',
          final_verdict:'watch',
          structuralState:'developing',
          actionStateKey:'wait_for_confirmation',
          planStatusKey:String(item && item.displayedPlan && item.displayedPlan.status || item && item.plan && item.plan.status || 'valid').trim().toLowerCase(),
          tradeabilityVerdict:'Watch',
          blockerReason:'Needs stronger confirmation',
          reasonSummary:'Needs stronger confirmation',
          terminal:false,
          baseVerdict:'watch'
        };
      },
      resolvePreLifecycleStateContract(item){
        if(item && item.resolvedContract && typeof item.resolvedContract === 'object'){
          return item.resolvedContract;
        }
        return {
          finalVerdict:'Watch',
          final_verdict:'watch',
          structuralState:'developing',
          actionStateKey:'wait_for_confirmation',
          planStatusKey:String(item && item.displayedPlan && item.displayedPlan.status || item && item.plan && item.plan.status || 'valid').trim().toLowerCase(),
          tradeabilityVerdict:'Watch',
          blockerReason:'Needs stronger confirmation',
          reasonSummary:'Needs stronger confirmation',
          terminal:false,
          baseVerdict:'watch'
        };
      },
      baseVerdictFromResolvedContract(resolved){
        return sandbox.window.ResolverCore.normalizeVerdict(resolved && (resolved.baseVerdict || resolved.finalVerdict || resolved.tradeabilityVerdict || 'watch'));
      },
      analysisDerivedStatesFromRecord(item){
        return item && item.derivedStates || {};
      },
      effectivePlanForRecord(item){
        return item && item.effectivePlan || {};
      },
      applySetupConfirmationPlanGate(item, displayedPlan){
        return item && item.displayedPlan || displayedPlan || {};
      },
      deriveCurrentPlanState(entry, stop, target, quoteCurrency){
        return sandbox.deriveCurrentPlanState(entry, stop, target, quoteCurrency);
      },
      evaluatePlanRealism(item){
        return item && item.planRealism || null;
      },
      setupScoreForRecord(item){
        return numericOrNull(item && item.setupScore) ?? 0;
      },
      canonicalSetupScoreForRecord(item){
        return numericOrNull(item && item.setupScore) ?? 0;
      },
      buildCumulativePenaltyTrace(item){
        return item && item.cumulativePenaltyTrace && Array.isArray(item.cumulativePenaltyTrace.sources)
          ? item.cumulativePenaltyTrace
          : {sources:[]};
      },
      isHostileMarketStatus(status){
        const safe = String(status || '').trim().toLowerCase();
        return safe === 'weak' || safe === 'hostile' || safe.includes('below 50');
      },
      state:{marketStatus:sandbox.state.marketStatus},
      scannerScoreGradientClass(){
        return '';
      }
    };
    return coreDepsCache;
  };
  const resolveGlobalVerdict = record => {
    return sandbox.window.ResolverCore.resolveGlobalVerdict(record, ensureCoreDeps());
  };
  return {resolveGlobalVerdict, coreDeps:ensureCoreDeps};
}

function buildResolvedContractSeed(chartVerdict, displayedPlan, verdictReason, globalVerdictKey = 'watch'){
  const normalized = String(globalVerdictKey || '').trim().toLowerCase();
  const verdictLabel = String(chartVerdict || 'Watch');
  const structuralState = normalized === 'entry'
    ? 'entry'
    : (normalized === 'near_entry' ? 'near_entry' : (normalized === 'avoid' ? 'dead' : 'developing'));
  return {
    finalVerdict:verdictLabel,
    final_verdict:normalized || 'watch',
    structuralState,
    actionStateKey:normalized === 'entry' ? 'ready_to_act' : 'wait_for_confirmation',
    planStatusKey:String(displayedPlan && displayedPlan.status || 'missing').trim().toLowerCase(),
    tradeabilityVerdict:verdictLabel,
    blockerReason:String(verdictReason || '').trim(),
    reasonSummary:String(verdictReason || '').trim(),
    terminal:normalized === 'avoid' && structuralState === 'dead',
    baseVerdict:normalized || 'watch'
  };
}

function buildVisualDeps(sandbox, resolveGlobalVerdict){
  return {
    analysisDerivedStatesFromRecord(record){
      return record && record.derivedStates || {};
    },
    resolveGlobalVerdict,
    effectivePlanForRecord(record){
      return record && record.effectivePlan || {};
    },
    deriveCurrentPlanState(entry, stop, target, quoteCurrency){
      return sandbox.deriveCurrentPlanState(entry, stop, target, quoteCurrency);
    },
    resolveFinalStateContract(record){
      return record && record.resolvedContract || {};
    },
    setupScoreForRecord(record){
      return numericOrNull(record && record.setupScore) ?? 0;
    },
    getBadge:verdict => sandbox.window.ResolverCore.getBadge(verdict),
    normalizeGlobalVerdictKey:verdict => sandbox.window.ResolverCore.normalizeGlobalVerdictKey(verdict),
    normalizeVerdict:verdict => sandbox.window.ResolverCore.normalizeVerdict(verdict),
    globalVerdictLabel:verdict => sandbox.window.ResolverCore.globalVerdictLabel(verdict)
  };
}

function deriveStatesFromPreservedProjection(analysisProjection){
  const projection = analysisProjection && typeof analysisProjection === 'object' ? analysisProjection : {};
  const pullbackZone = String(
    projection.pullback_zone
    || projection.pullbackZone
    || projection.pullback_status
    || projection.pullbackStatus
    || ''
  ).trim().toLowerCase();
  return {
    trendState:String(projection.trend_state || projection.trendState || '').trim().toLowerCase(),
    pullbackZone,
    pullbackState:pullbackZone,
    pullbackQuality:'',
    structureState:String(projection.structure_state || projection.structureState || '').trim().toLowerCase(),
    setupLocationState:String(projection.setup_location_state || projection.setupLocationState || '').trim().toLowerCase(),
    priceabilityState:String(projection.priceability_state || projection.priceabilityState || '').trim().toLowerCase(),
    stabilisationState:String(projection.stabilisation_state || projection.stabilisationState || '').trim().toLowerCase(),
    bounceState:String(projection.bounce_state || projection.bounceState || '').trim().toLowerCase(),
    volumeState:String(projection.volume_state || projection.volumeState || '').trim().toLowerCase(),
    scanType:String(projection.scan_type || projection.scanType || '').trim(),
    evaluationScanType:String(projection.evaluation_scan_type || projection.evaluationScanType || '').trim(),
    importedScanType:String(projection.imported_scan_type || projection.importedScanType || '').trim(),
    globalSetupType:String(projection.global_setup_type || projection.globalSetupType || '').trim(),
    setupTypeOverlapDetected:String(projection.setup_type_overlap_detected || projection.setupTypeOverlapDetected || '').trim().toLowerCase(),
    setupTypeReason:String(projection.setup_type_reason || projection.setupTypeReason || '').trim(),
    candleEvidenceUpClosesAfterLow:numericOrNull(projection.candle_evidence_up_closes_after_low ?? projection.candleEvidenceUpClosesAfterLow),
    candleEvidenceReclaimedPriorDayHigh:['true','yes'].includes(String(projection.candle_evidence_reclaimed_prior_day_high || projection.candleEvidenceReclaimedPriorDayHigh || '').trim().toLowerCase()),
    candleEvidenceDownsideMomentumSlowing:['true','yes'].includes(String(projection.candle_evidence_downside_momentum_slowing || projection.candleEvidenceDownsideMomentumSlowing || '').trim().toLowerCase()),
    candleEvidenceTighterRanges:['true','yes'].includes(String(projection.candle_evidence_tighter_ranges || projection.candleEvidenceTighterRanges || '').trim().toLowerCase()),
    candleEvidenceSmallerBodies:['true','yes'].includes(String(projection.candle_evidence_smaller_bodies || projection.candleEvidenceSmallerBodies || '').trim().toLowerCase()),
    candleEvidenceHigherLowHold:['true','yes'].includes(String(projection.candle_evidence_higher_low_hold || projection.candleEvidenceHigherLowHold || '').trim().toLowerCase()),
    candleEvidenceReclaimRangeMeaningful:['true','yes'].includes(String(projection.candle_evidence_reclaim_range_meaningful || projection.candleEvidenceReclaimRangeMeaningful || '').trim().toLowerCase())
  };
}

function mergeDerivedStatesWithSnapshotSetup(derivedStates, setup){
  const base = derivedStates && typeof derivedStates === 'object' ? {...derivedStates} : {};
  const source = setup && typeof setup === 'object' ? setup : {};
  const override = (key, ...fields) => {
    for(const field of fields){
      const value = String(source[field] || '').trim().toLowerCase();
      if(value){
        base[key] = value;
        return value;
      }
    }
    return String(base[key] || '').trim().toLowerCase();
  };
  const pullbackZone = override('pullbackZone', 'pullbackZone', 'pullback_zone');
  override('trendState', 'trendState', 'trend_state');
  override('structureState', 'structureState', 'structure_state');
  override('setupLocationState', 'setupLocationState', 'setup_location_state');
  override('priceabilityState', 'priceabilityState', 'priceability_state');
  override('stabilisationState', 'stabilisationState', 'stabilisation_state');
  override('bounceState', 'bounceState', 'bounce_state');
  override('volumeState', 'volumeState', 'volume_state');
  if(pullbackZone){
    base.pullbackState = pullbackZone;
  }
  const structureEligibility = String(source.structureEligibility || source.structure_eligibility || '').trim().toLowerCase();
  if(structureEligibility){
    base.structureEligibility = structureEligibility;
  }
  return base;
}

function extractSnapshotTargetProfile(snapshot){
  const source = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const scan = source.scan && typeof source.scan === 'object' ? source.scan : {};
  const analysisProjection = scan.analysisProjection && typeof scan.analysisProjection === 'object'
    ? scan.analysisProjection
    : {};
  const targetProfile = analysisProjection.target_profile && typeof analysisProjection.target_profile === 'object'
    ? analysisProjection.target_profile
    : {};
  if(!Object.keys(targetProfile).length) return null;
  return {
    nearest_resistance:numericOrNull(targetProfile.nearestResistance ?? targetProfile.nearest_resistance),
    realistic_target:numericOrNull(targetProfile.realisticTarget ?? targetProfile.realistic_target),
    extended_target:numericOrNull(targetProfile.extendedTarget ?? targetProfile.extended_target),
    realistic_rr:numericOrNull(targetProfile.realisticRr ?? targetProfile.realistic_rr),
    target_stretch_pct:numericOrNull(targetProfile.targetStretchPct ?? targetProfile.target_stretch_pct),
    target_cap_reason:String(targetProfile.targetCapReason ?? targetProfile.target_cap_reason ?? '').trim()
  };
}

function buildReplayRecord(snapshot, sandbox){
  const snapshotAuthority = extractSnapshotCanonicalAuthority(snapshot);
  const authorityContract = snapshotAuthority && snapshotAuthority.contract && typeof snapshotAuthority.contract === 'object'
    ? snapshotAuthority.contract
    : null;
  const authorityDerivedStates = authorityContract && authorityContract.derivedStates && typeof authorityContract.derivedStates === 'object'
    ? authorityContract.derivedStates
    : null;
  const authorityPlan = authorityContract && authorityContract.planAuthority && typeof authorityContract.planAuthority === 'object'
    ? authorityContract.planAuthority
    : null;
  const preservedMarketData = snapshot.marketData && typeof snapshot.marketData === 'object'
    ? deepClone(snapshot.marketData)
    : {};
  const marketData = {
    ...preservedMarketData,
    ticker:snapshot.ticker,
    tradingViewSymbol:snapshot.tradingViewSymbol,
    exchange:snapshot.exchange,
    currency:String(preservedMarketData.currency || snapshot.currency || 'USD').trim() || 'USD',
    price:numericOrNull(preservedMarketData.price ?? snapshot.price),
    currentPrice:numericOrNull(preservedMarketData.currentPrice ?? preservedMarketData.price ?? snapshot.price),
    close:numericOrNull(preservedMarketData.close ?? preservedMarketData.price ?? snapshot.price),
    previousClose:numericOrNull(preservedMarketData.previousClose ?? snapshot.previousClose),
    sma20:numericOrNull(preservedMarketData.sma20 ?? preservedMarketData.ma20 ?? snapshot.sma20),
    sma50:numericOrNull(preservedMarketData.sma50 ?? preservedMarketData.ma50 ?? snapshot.sma50),
    sma200:numericOrNull(preservedMarketData.sma200 ?? preservedMarketData.ma200 ?? snapshot.sma200),
    ma20:numericOrNull(preservedMarketData.ma20 ?? preservedMarketData.sma20 ?? snapshot.sma20),
    ma50:numericOrNull(preservedMarketData.ma50 ?? preservedMarketData.sma50 ?? snapshot.sma50),
    ma200:numericOrNull(preservedMarketData.ma200 ?? preservedMarketData.sma200 ?? snapshot.sma200),
    rsi14:numericOrNull(preservedMarketData.rsi14 ?? preservedMarketData.rsi ?? snapshot.rsi14),
    rsi:numericOrNull(preservedMarketData.rsi ?? preservedMarketData.rsi14 ?? snapshot.rsi14),
    volume:numericOrNull(preservedMarketData.volume ?? snapshot.volume),
    avgVolume30d:numericOrNull(preservedMarketData.avgVolume30d ?? preservedMarketData.avgVolume30 ?? preservedMarketData.avgVolume ?? snapshot.avgVolume30d),
    avgVolume30:numericOrNull(preservedMarketData.avgVolume30 ?? preservedMarketData.avgVolume30d ?? preservedMarketData.avgVolume ?? snapshot.avgVolume30d),
    avgVolume:numericOrNull(preservedMarketData.avgVolume ?? preservedMarketData.avgVolume30d ?? snapshot.avgVolume30d),
    perf1w:numericOrNull(preservedMarketData.perf1w ?? snapshot.perf1w),
    perf1m:numericOrNull(preservedMarketData.perf1m ?? snapshot.perf1m),
    perf3m:numericOrNull(preservedMarketData.perf3m ?? snapshot.perf3m),
    perf6m:numericOrNull(preservedMarketData.perf6m ?? snapshot.perf6m),
    perfYtd:numericOrNull(preservedMarketData.perfYtd ?? snapshot.perfYtd),
    history:Array.isArray(preservedMarketData.history) ? preservedMarketData.history : (Array.isArray(snapshot.history) ? snapshot.history : []),
    warnings:Array.isArray(preservedMarketData.warnings) ? preservedMarketData.warnings : (Array.isArray(snapshot.warnings) ? snapshot.warnings : []),
    asOf:String(preservedMarketData.asOf || snapshot.fetchedAt || '')
  };
  const card = {
    ticker:snapshot.ticker,
    marketData,
    checks:{}
  };
  const checks = sandbox.buildScannerChecks(marketData);
  card.checks = checks;
  const suitability = sandbox.scoreSuitability(card, marketData, checks);
  const preservedPlan = snapshot.plan && typeof snapshot.plan === 'object' ? deepClone(snapshot.plan) : null;
  const preservedScan = snapshot.scan && typeof snapshot.scan === 'object' ? deepClone(snapshot.scan) : {};
  const preservedReview = snapshot.review && typeof snapshot.review === 'object' ? deepClone(snapshot.review) : {};
  const preservedManualReview = preservedReview.manualReview && typeof preservedReview.manualReview === 'object'
    ? preservedReview.manualReview
    : null;
  const reviewProjectionContext = normalizeReviewProjectionContext(snapshot);
  const liveManualReview = reviewProjectionContext.authoritative === true
    ? preservedManualReview
    : null;
  const preservedAnalysisProjection = preservedScan.analysisProjection && typeof preservedScan.analysisProjection === 'object'
    ? deepClone(preservedScan.analysisProjection)
    : null;
  const snapshotTargetProfile = extractSnapshotTargetProfile(snapshot);
  const preservedDerivedStates = preservedAnalysisProjection
    ? deriveStatesFromPreservedProjection(preservedAnalysisProjection)
    : null;
  const derivedTradePlan = suitability && suitability.tradePlan ? suitability.tradePlan : sandbox.deriveTradePlan(marketData, '20MA');
  const preservedPlanStatus = String(preservedPlan && preservedPlan.status || '').trim().toLowerCase();
  const preservedPlanExplicitlyUnavailable = !!(
    preservedPlan
    && (
      ['missing', 'invalid'].includes(preservedPlanStatus)
      || String(preservedPlan.invalidatedState || '').trim()
      || String(preservedPlan.missedState || '').trim()
      || String(preservedPlan.tradeability || '').trim().toLowerCase() === 'invalid'
      || String(preservedPlan.riskStatus || '').trim().toLowerCase() === 'plan_missing'
    )
  );
  const tradePlan = preservedPlanExplicitlyUnavailable
    ? {
      entry:null,
      stop:null,
      target:null,
      rr:null,
      source:String(preservedPlan && preservedPlan.source || 'suppressed_preserved_plan')
    }
    : (preservedPlan
    ? {
      entry:numericOrNull(preservedPlan.entry ?? (liveManualReview && liveManualReview.entry)) ?? derivedTradePlan.entry,
      stop:numericOrNull(preservedPlan.stop ?? (liveManualReview && liveManualReview.stop)) ?? derivedTradePlan.stop,
      target:numericOrNull(preservedPlan.firstTarget ?? preservedPlan.target ?? (liveManualReview && liveManualReview.target)) ?? derivedTradePlan.target,
      rr:numericOrNull(preservedPlan.plannedRR ?? preservedPlan.rr ?? derivedTradePlan.rr),
      source:String(preservedPlan.source || (liveManualReview ? 'manual' : derivedTradePlan.source || 'scanner_estimate'))
    }
    : derivedTradePlan);
  const derivedStates = mergeDerivedStatesWithSnapshotSetup(
    preservedDerivedStates || sandbox.deriveSetupStates(card, marketData, checks, tradePlan),
    snapshot.setup
  );
  if(authorityDerivedStates){
    const overlayState = (targetKey, sourceKeys = []) => {
      for(const sourceKey of sourceKeys){
        const value = authorityDerivedStates[sourceKey];
        if(value !== undefined && value !== null && String(value).trim() !== ''){
          derivedStates[targetKey] = String(value).trim().toLowerCase();
          return;
        }
      }
    };
    overlayState('structureState', ['structureState']);
    overlayState('structureEligibility', ['structureEligibility']);
    overlayState('setupLocationState', ['setupLocationState']);
    overlayState('priceabilityState', ['priceabilityState']);
    overlayState('stabilisationState', ['stabilisationState']);
    overlayState('bounceState', ['bounceState']);
    if(authorityDerivedStates.setupScore !== undefined && authorityDerivedStates.setupScore !== null){
      derivedStates.setupScore = numericOrNull(authorityDerivedStates.setupScore);
    }
  }
  const effectivePlan = {
    entry:Number.isFinite(numericOrNull(authorityPlan && authorityPlan.entry))
      ? numericOrNull(authorityPlan.entry)
      : tradePlan.entry,
    stop:Number.isFinite(numericOrNull(authorityPlan && authorityPlan.stop))
      ? numericOrNull(authorityPlan.stop)
      : tradePlan.stop,
    firstTarget:Number.isFinite(numericOrNull(authorityPlan && authorityPlan.firstTarget))
      ? numericOrNull(authorityPlan.firstTarget)
      : tradePlan.target,
    source:String(
      authorityPlan && authorityPlan.source
      || tradePlan.source
      || ''
    ).trim().toLowerCase()
  };
  const riskFit = sandbox.evaluateRiskFit({
    entry:effectivePlan.entry,
    stop:effectivePlan.stop,
    ...sandbox.currentRiskSettings()
  });
  const rewardRisk = sandbox.evaluateRewardRisk(effectivePlan.entry, effectivePlan.stop, effectivePlan.firstTarget);
  const recomputedChartVerdict = sandbox.determineScannerVerdict({
    technicalValid:true,
    score:suitability ? suitability.total : 0,
    checks,
    riskFit,
    rewardRisk
  });
  const chartVerdict = snapshotAuthority.scannerCanonicalVerdict
    ? sandbox.window.ResolverCore.globalVerdictLabel(snapshotAuthority.scannerCanonicalVerdict)
    : recomputedChartVerdict;
  const displayedPlan = sandbox.deriveCurrentPlanState(
    effectivePlan.entry,
    effectivePlan.stop,
    effectivePlan.firstTarget,
    marketData.currency
  );
  if(preservedPlan){
    displayedPlan.source = String(preservedPlan.source || tradePlan.source || displayedPlan.source || '');
    displayedPlan.status = String(preservedPlan.status || displayedPlan.status || '').trim().toLowerCase() || displayedPlan.status;
    displayedPlan.tradeability = String(preservedPlan.tradeability || displayedPlan.tradeability || '').trim().toLowerCase() || displayedPlan.tradeability;
    displayedPlan.planValidationState = String(preservedPlan.planValidationState || '').trim().toLowerCase();
    displayedPlan.triggerState = String(preservedPlan.triggerState || '').trim().toLowerCase();
    displayedPlan.firstTargetTooClose = preservedPlan.firstTargetTooClose === true;
    displayedPlan.blockedReason = String(preservedPlan.blockedReason || '').trim();
    displayedPlan.blockedReasonCode = String(preservedPlan.blockedReasonCode || '').trim().toLowerCase();
    displayedPlan.invalidatedState = String(preservedPlan.invalidatedState || '').trim().toLowerCase();
    displayedPlan.missedState = String(preservedPlan.missedState || '').trim().toLowerCase();
    displayedPlan.needsReplan = preservedPlan.needsReplan === true;
    displayedPlan.hasValidPlan = preservedPlan.hasValidPlan === true;
    displayedPlan.affordability = String(preservedPlan.affordability || displayedPlan.affordability || '').trim().toLowerCase();
    displayedPlan.positionSize = numericOrNull(preservedPlan.positionSize) ?? displayedPlan.positionSize;
    displayedPlan.positionCost = numericOrNull(preservedPlan.positionCost) ?? displayedPlan.positionCost;
    displayedPlan.positionCostGbp = numericOrNull(preservedPlan.positionCostGbp) ?? displayedPlan.positionCostGbp;
    displayedPlan.maxLoss = numericOrNull(preservedPlan.maxLoss) ?? displayedPlan.maxLoss;
    displayedPlan.quoteCurrency = String(preservedPlan.quoteCurrency || displayedPlan.quoteCurrency || marketData.currency || '').trim().toUpperCase();
    if(displayedPlan.riskFit && typeof displayedPlan.riskFit === 'object'){
      displayedPlan.riskFit.risk_status = String(preservedPlan.riskStatus || displayedPlan.riskFit.risk_status || '').trim().toLowerCase() || displayedPlan.riskFit.risk_status;
    }
    if(displayedPlan.capitalFit && typeof displayedPlan.capitalFit === 'object'){
      displayedPlan.capitalFit.capital_fit = String(preservedPlan.capitalFit || displayedPlan.capitalFit.capital_fit || '').trim().toLowerCase() || displayedPlan.capitalFit.capital_fit;
      displayedPlan.capitalFit.capital_note = String(preservedPlan.capitalNote || displayedPlan.capitalFit.capital_note || '').trim();
      displayedPlan.capitalFit.quote_currency = String(preservedPlan.quoteCurrency || displayedPlan.capitalFit.quote_currency || marketData.currency || '').trim().toUpperCase();
      displayedPlan.capitalFit.position_cost = numericOrNull(preservedPlan.positionCost) ?? displayedPlan.capitalFit.position_cost;
      displayedPlan.capitalFit.position_cost_gbp = numericOrNull(preservedPlan.positionCostGbp) ?? displayedPlan.capitalFit.position_cost_gbp;
      displayedPlan.capitalFit.fx_status = /fx estimated/i.test(String(preservedPlan.capitalNote || '')) ? 'estimated' : String(displayedPlan.capitalFit.fx_status || '').trim().toLowerCase();
    }
  }
  if(authorityPlan){
    displayedPlan.source = String(authorityPlan.source || displayedPlan.source || '').trim().toLowerCase() || displayedPlan.source;
    displayedPlan.status = String(authorityPlan.status || displayedPlan.status || '').trim().toLowerCase() || displayedPlan.status;
    displayedPlan.tradeability = String(authorityPlan.tradeability || displayedPlan.tradeability || '').trim().toLowerCase() || displayedPlan.tradeability;
    if(displayedPlan.riskFit && typeof displayedPlan.riskFit === 'object'){
      displayedPlan.riskFit.risk_status = String(authorityPlan.riskStatus || displayedPlan.riskFit.risk_status || '').trim().toLowerCase() || displayedPlan.riskFit.risk_status;
    }
  }
  const setupStateHint = String(chartVerdict || '').toLowerCase() === 'entry' ? 'entry' : 'developing';
  const recomputedPlanRealism = sandbox.evaluatePlanRealism({
    ticker:snapshot.ticker,
    meta:{marketStatus:sandbox.state.marketStatus},
    marketData,
    review:preservedReview || {},
    plan:{entry:effectivePlan.entry, stop:effectivePlan.stop, firstTarget:effectivePlan.firstTarget, source:effectivePlan.source || 'scanner'},
    scan:{resolvedVerdict:chartVerdict},
    derivedStates
  }, {
    displayedPlan,
    derivedStates,
    displayStage:chartVerdict,
    setupState:setupStateHint
  });
  const planRealism = snapshotTargetProfile
    ? {
      ...recomputedPlanRealism,
      nearest_resistance:snapshotTargetProfile.nearest_resistance,
      realistic_target:snapshotTargetProfile.realistic_target,
      extended_target:snapshotTargetProfile.extended_target,
      realistic_rr:snapshotTargetProfile.realistic_rr,
      target_stretch_pct:snapshotTargetProfile.target_stretch_pct,
      target_cap_reason:snapshotTargetProfile.target_cap_reason
    }
    : recomputedPlanRealism;
  const setupScore = Number.isFinite(Number(snapshotAuthority.setupScore))
    ? Number(snapshotAuthority.setupScore)
    : (suitability ? suitability.total : 0);
  const canonicalSeed = String(
    snapshotAuthority.reviewCanonicalVerdict
    || (chartVerdict === 'Entry'
      ? 'entry'
      : (chartVerdict === 'Near Entry' ? 'near_entry' : (chartVerdict === 'Avoid' ? 'avoid' : 'watch')))
  ).trim().toLowerCase();
  const canonicalSeedLabel = sandbox.window.ResolverCore.globalVerdictLabel(canonicalSeed || 'watch');
  const resolvedContract = buildResolvedContractSeed(
    snapshotAuthority.reviewCanonicalVerdict ? canonicalSeedLabel : chartVerdict,
    {
      ...displayedPlan,
      status:String(snapshotAuthority.planStatus || displayedPlan.status || '').trim().toLowerCase() || displayedPlan.status
    },
    String(snapshotAuthority.reviewPrimaryReason || suitability && suitability.summary || '').trim(),
    canonicalSeed
  );
  const record = {
    ticker:snapshot.ticker,
    meta:{
      ...(snapshot.meta && typeof snapshot.meta === 'object' ? snapshot.meta : {}),
      companyName:snapshot.companyName,
      exchange:snapshot.exchange,
      marketStatus:sandbox.state.marketStatus
    },
    marketData,
    setup:{
      ...(snapshot.setup && typeof snapshot.setup === 'object' ? snapshot.setup : {}),
      marketCaution:!!(snapshot.setup && snapshot.setup.marketCaution)
    },
    review:preservedReview || {},
    plan:preservedPlan || {
      entry:tradePlan.entry,
      stop:tradePlan.stop,
      firstTarget:tradePlan.target,
      hasValidPlan:displayedPlan.status === 'valid',
      plannedRR:displayedPlan.rewardRisk && displayedPlan.rewardRisk.rrRatio
    },
    scan:{
      ...(preservedScan || {}),
      estimatedRR:numericOrNull((preservedScan && preservedScan.estimatedRR) ?? tradePlan.rr),
      flags:preservedScan && preservedScan.flags ? preservedScan.flags : {checks},
      analysisProjection:preservedAnalysisProjection || {
        trend_state:derivedStates.trendState,
        pullback_zone:derivedStates.pullbackZone,
        structure_state:derivedStates.structureState,
        stabilisation_state:derivedStates.stabilisationState,
        bounce_state:derivedStates.bounceState,
        volume_state:derivedStates.volumeState,
        scan_type:derivedStates.scanType || derivedStates.scan_type || '',
        setup_type:derivedStates.scanType || derivedStates.scan_type || '',
        setup_location_state:derivedStates.setupLocationState,
        priceability_state:derivedStates.priceabilityState,
        quality_score:setupScore,
        target_profile:{
          nearestResistance:numericOrNull(planRealism.nearest_resistance),
          realisticTarget:numericOrNull(planRealism.realistic_target),
          extendedTarget:numericOrNull(planRealism.extended_target),
          realisticRr:numericOrNull(planRealism.realistic_rr),
          targetStretchPct:numericOrNull(planRealism.target_stretch_pct),
          targetCapReason:String(planRealism.target_cap_reason || '')
        }
      }
    },
    derivedStates,
    effectivePlan,
    displayedPlan,
    planRealism,
    resolvedContract,
    setupScore,
    reclaimAttempt:snapshot.reclaimAttempt === true,
    reclaimsLevel:snapshot.reclaimsLevel === true,
    breaksLocalHigh:snapshot.breaksLocalHigh === true,
    strongBullishContinuation:snapshot.strongBullishContinuation === true,
    in_watchlist:snapshot.in_watchlist === true,
    watchlist_entry_exists:snapshot.watchlist_entry_exists === true,
    terminal_avoid_applied:snapshot.terminal_avoid_applied === true,
    avoid_trigger_source:String(snapshot.avoid_trigger_source || '').trim()
  };
  return {
    snapshotAuthority,
    record,
    checks,
    suitability,
    tradePlan,
    riskFit,
    rewardRisk,
    chartVerdict
  };
}

function promotionBlockers(recomputedDiagnostics = {}, derivedStates = {}){
  const blockers = [];
  const push = value => {
    const text = String(value || '').trim();
    if(text && !blockers.includes(text)) blockers.push(text);
  };
  push(recomputedDiagnostics.semanticBlockerReason);
  push(recomputedDiagnostics.primaryReason);
  push(recomputedDiagnostics.promotionBlockedReason);
  push(recomputedDiagnostics.downgradeReason);
  if(recomputedDiagnostics.entryGatePass !== true){
    (recomputedDiagnostics.entryGateReasons || []).forEach(push);
  }
  if(recomputedDiagnostics.nearEntryGatePass !== true){
    (recomputedDiagnostics.nearEntryGateReasons || []).forEach(push);
  }
  push(recomputedDiagnostics.viabilityReason);
  const structureState = String(
    derivedStates.structureState
    || derivedStates.structure_state
    || recomputedDiagnostics.structureState
    || ''
  ).trim().toLowerCase();
  const constructiveStructure = ['strong', 'intact', 'developing_clean'].includes(structureState);
  return blockers
    .filter(blocker => !(constructiveStructure && blocker === 'Structure is not strong/intact/developing clean.'))
    .slice(0, 4);
}

function normalizeReplayBlockers({
  finalResolvedVerdict,
  finalVisualBucket,
  rawBlockers,
  promotionBlocker,
  blockerCopy
}){
  const safeBlockers = Array.isArray(rawBlockers) ? rawBlockers.filter(Boolean) : [];
  const safePromotionBlocker = String(promotionBlocker || '').trim();
  const safeBlockerCopy = String(blockerCopy || '').trim();
  const avoidLike = ['avoid', 'dead'].includes(String(finalResolvedVerdict || '').trim().toLowerCase());
  if(avoidLike) return {blockers:safeBlockers, blockerCopy:safeBlockerCopy};
  if(String(finalVisualBucket || '').trim().toLowerCase() !== 'diminishing'){
    return {blockers:safeBlockers, blockerCopy:safeBlockerCopy};
  }
  const filtered = safeBlockers.filter(blocker => !/^Structure is broken\.$/i.test(String(blocker || '').trim()));
  if(safePromotionBlocker && !filtered.includes(safePromotionBlocker)) filtered.unshift(safePromotionBlocker);
  return {
    blockers:filtered,
    blockerCopy:safePromotionBlocker || safeBlockerCopy
  };
}

function structureContradictionForPromotionText(text, structureState, structureEligibility){
  const safeText = String(text || '').trim();
  if(!safeText) return false;
  const safeStructure = String(structureState || '').trim().toLowerCase();
  const safeEligibility = String(structureEligibility || '').trim().toLowerCase();
  const healthyStructure = ['strong', 'intact', 'developing_clean'].includes(safeStructure);
  const aliveEligibility = ['alive', 'messy'].includes(safeEligibility);
  return (healthyStructure || aliveEligibility) && /structure is not strong\/intact\/developing clean/i.test(safeText);
}

function fallbackPromotionDiagnostic({recomputedDiagnostics = {}, replayBase, structureState, structureEligibility}){
  const safeStructure = String(structureState || '').trim().toLowerCase();
  const safeEligibility = String(structureEligibility || '').trim().toLowerCase();
  const healthyStructure = ['strong', 'intact', 'developing_clean'].includes(safeStructure);
  const aliveEligibility = ['alive', 'messy'].includes(safeEligibility);
  const planRealism = replayBase && replayBase.record ? replayBase.record.planRealism || {} : {};
  const derivedStates = replayBase && replayBase.record ? replayBase.record.derivedStates || {} : {};
  const bounceState = String(derivedStates.bounceState || '').trim().toLowerCase();
  const priceabilityState = String(derivedStates.priceabilityState || '').trim().toLowerCase();
  const realisticRr = numericOrNull(planRealism.realistic_rr);
  if((healthyStructure || aliveEligibility) && ['attempt', 'early', 'developing', 'improving'].includes(bounceState) && ['unpriceable', 'provisional'].includes(priceabilityState)){
    return {
      promotionBlocker:'Repair is forming but the setup is not priceable yet.',
      failingGate:'bounce'
    };
  }
  if((healthyStructure || aliveEligibility) && Number.isFinite(realisticRr) && realisticRr < 2){
    return {
      promotionBlocker:'Nearby resistance limits current reward potential.',
      failingGate:'rr'
    };
  }
  return {
    promotionBlocker:String(recomputedDiagnostics.promotionBlockedReason || recomputedDiagnostics.downgradeReason || '').trim(),
    failingGate:String(recomputedDiagnostics.promotionBlockedBy || '').trim()
  };
}

function derivedStateValue(derivedStates, camelKey, snakeKey){
  const source = derivedStates && typeof derivedStates === 'object' ? derivedStates : {};
  const camelValue = source[camelKey];
  if(camelValue !== undefined && camelValue !== null && String(camelValue).trim() !== '') return camelValue;
  const snakeValue = source[snakeKey];
  if(snakeValue !== undefined && snakeValue !== null && String(snakeValue).trim() !== '') return snakeValue;
  return '';
}

function buildPublicReplayView({
  sandbox,
  snapshotAuthority,
  snapshotPublicFields,
  reviewProjectionContext,
  replayBase,
  fallback = {}
}){
  const authority = snapshotAuthority && typeof snapshotAuthority === 'object' ? snapshotAuthority : {};
  const snapshotFields = snapshotPublicFields && typeof snapshotPublicFields === 'object' ? snapshotPublicFields : {};
  const safeFallback = fallback && typeof fallback === 'object' ? fallback : {};
  const planRealism = replayBase && replayBase.record ? replayBase.record.planRealism || {} : {};
  const record = replayBase && replayBase.record ? replayBase.record : {};
  const scannerCanonicalVerdict = String(snapshotFields.scannerCanonicalVerdict || safeFallback.scannerCanonicalVerdict || 'unknown').trim().toLowerCase() || 'unknown';
  const scannerVisualBucket = String(snapshotFields.scannerVisualBucket || safeFallback.scannerVisualBucket || 'monitor').trim().toLowerCase() || 'monitor';
  const reviewCanonicalVerdict = String(snapshotFields.reviewCanonicalVerdict || safeFallback.reviewCanonicalVerdict || 'watch').trim().toLowerCase() || 'watch';
  const reviewVisualBucket = String(snapshotFields.reviewVisualBucket || safeFallback.reviewVisualBucket || 'monitor').trim().toLowerCase() || 'monitor';
  const setupScore = Number.isFinite(Number(snapshotFields.setupScore))
    ? Number(snapshotFields.setupScore)
    : (Number.isFinite(Number(safeFallback.setupScore)) ? Number(safeFallback.setupScore) : null);
  return {
    scannerCanonicalVerdict,
    scannerCanonicalVerdictLabel:scannerCanonicalVerdict === 'unknown'
      ? 'Unknown'
      : sandbox.window.ResolverCore.globalVerdictLabel(scannerCanonicalVerdict),
    scannerSnapshotIncomplete:safeFallback.scannerSnapshotIncomplete === true,
    scannerVisualBucket,
    reviewCanonicalVerdict,
    reviewCanonicalVerdictLabel:sandbox.window.ResolverCore.globalVerdictLabel(reviewCanonicalVerdict),
    reviewVisualBucket,
    reviewNextAction:String(snapshotFields.reviewNextAction || safeFallback.reviewNextAction || '').trim(),
    reviewPrimaryReason:String(snapshotFields.reviewPrimaryReason || safeFallback.reviewPrimaryReason || '').trim(),
    planStatus:String(snapshotFields.planStatus || safeFallback.planStatus || '').trim().toLowerCase(),
    snapshotContractFingerprint:String(snapshotFields.snapshotContractFingerprint || '').trim(),
    replayAuthoritySource:snapshotFields.reviewCanonicalVerdict ? 'canonical_contract' : 'recomputed_fallback',
    reviewProjectionSource:String(reviewProjectionContext && reviewProjectionContext.projectionSource || '').trim().toLowerCase(),
    simulatedLifecycleFromWatch:String(snapshotFields.simulatedLifecycleFromWatch || safeFallback.simulatedLifecycleFromWatch || '').trim().toLowerCase(),
    structureState:String(snapshotFields.structureState || safeFallback.structureState || '').trim().toLowerCase(),
    structureEligibility:String(snapshotFields.structureEligibility || safeFallback.structureEligibility || 'unknown').trim().toLowerCase() || 'unknown',
    bounceState:String(snapshotFields.bounceState || safeFallback.bounceState || '').trim().toLowerCase(),
    stabilisationState:String(snapshotFields.stabilisationState || safeFallback.stabilisationState || '').trim().toLowerCase(),
    priceabilityState:String(snapshotFields.priceabilityState || safeFallback.priceabilityState || '').trim().toLowerCase(),
    setupScore,
    realisticTarget:Number.isFinite(Number(snapshotFields.realisticTarget))
      ? Number(snapshotFields.realisticTarget)
      : planRealism.realistic_target,
    extendedTarget:Number.isFinite(Number(snapshotFields.extendedTarget))
      ? Number(snapshotFields.extendedTarget)
      : planRealism.extended_target,
    realisticRr:Number.isFinite(Number(snapshotFields.realisticRr))
      ? Number(snapshotFields.realisticRr)
      : planRealism.realistic_rr,
    targetStretchPct:Number.isFinite(Number(snapshotFields.targetStretchPct))
      ? Number(snapshotFields.targetStretchPct)
      : planRealism.target_stretch_pct,
      targetCapReason:String(snapshotFields.targetCapReason || planRealism.target_cap_reason || '').trim(),
    blockers:[],
    blockerSource:'',
    promotionDiagnosticsActive:false,
    promotionBlocker:'',
    failingGate:'',
    blockerCopy:'',
    watchToDiminishingReason:'',
    diminishingReasonActive:false,
    canonicalInputDiagnostics:null,
    layerMutationReason:'',
    authorityDrift:null
  };
}

function hasSnapshotReplayAuthority(snapshotAuthority){
  const authority = snapshotAuthority && typeof snapshotAuthority === 'object' ? snapshotAuthority : {};
  return !!(
    authority.contract
    && authority.renderModels
    && authority.reviewCanonicalVerdict
    && authority.reviewVisualBucket
  );
}

function buildRecomputedReplayAuthority({
  snapshotAuthority,
  snapshotReplayAuthorityLocked,
  reviewProjectionContext,
  scannerCanonicalVerdict,
  scannerCanonicalVerdictRaw,
  authoritativeScannerSnapshotVerdict,
  scannerVisualState,
  simplifiedScannerState,
  reviewVisualState,
  simplifiedReviewState,
  globalVerdict
}){
  const scannerVisualBucket = String(
    snapshotAuthority.scannerVisualBucket
    || (authoritativeScannerSnapshotVerdict
      ? (
        scannerCanonicalVerdict === 'entry'
          ? 'entry'
          : (scannerCanonicalVerdict === 'near_entry' ? 'near_entry' : (scannerCanonicalVerdict === 'avoid' ? 'avoid' : 'monitor'))
      )
      : '')
    || (simplifiedScannerState && simplifiedScannerState.visualBucket)
    || scannerVisualState.visualBucket
    || ''
  ).trim().toLowerCase() || 'monitor';
  const recomputedReviewVisualBucket = String(
    (reviewProjectionContext.authoritative && reviewProjectionContext.visualBucket)
    || (simplifiedReviewState && simplifiedReviewState.visualBucket)
    || reviewVisualState.visualBucket
    || ''
  ).trim().toLowerCase() || 'monitor';
  const recomputedReviewCanonicalVerdict = String(
    (reviewProjectionContext.authoritative && reviewProjectionContext.canonicalVerdict)
    || (simplifiedReviewState && simplifiedReviewState.canonicalVerdict)
    || globalVerdict.final_verdict
    || ''
  ).trim().toLowerCase() || 'watch';
  let reviewVisualBucket = snapshotAuthority.reviewVisualBucket || recomputedReviewVisualBucket;
  let reviewCanonicalVerdict = snapshotAuthority.reviewCanonicalVerdict || recomputedReviewCanonicalVerdict;
  if(
    !snapshotReplayAuthorityLocked
    && reviewProjectionContext.authoritative !== true
    && !snapshotAuthority.reviewCanonicalVerdict
    && reviewCanonicalVerdict === 'entry'
    && scannerCanonicalVerdict
    && !['entry', 'unknown'].includes(scannerCanonicalVerdict)
  ){
    reviewCanonicalVerdict = scannerCanonicalVerdict;
    reviewVisualBucket = String(
      (simplifiedReviewState && simplifiedReviewState.visualBucket)
      || reviewVisualState.visualBucket
      || scannerVisualBucket
      || 'monitor'
    ).trim().toLowerCase() || 'monitor';
  }
  if(
    !snapshotReplayAuthorityLocked
    && reviewProjectionContext.authoritative !== true
    && !snapshotAuthority.reviewVisualBucket
    && reviewCanonicalVerdict !== 'entry'
    && reviewVisualBucket === 'entry'
  ){
    const nonEntrySimplifiedBucket = String(simplifiedReviewState && simplifiedReviewState.visualBucket || '').trim().toLowerCase();
    const nonEntryReviewBucket = String(reviewVisualState.visualBucket || '').trim().toLowerCase();
    reviewVisualBucket = nonEntrySimplifiedBucket && nonEntrySimplifiedBucket !== 'entry'
      ? nonEntrySimplifiedBucket
      : (nonEntryReviewBucket && nonEntryReviewBucket !== 'entry'
        ? nonEntryReviewBucket
        : (reviewCanonicalVerdict === 'near_entry' ? 'monitor' : (scannerVisualBucket === 'entry' ? 'monitor' : (scannerVisualBucket || 'monitor'))));
  }
  const finalResolvedVerdict = String(
    (snapshotReplayAuthorityLocked && snapshotAuthority.reviewCanonicalVerdict)
    || globalVerdict.final_verdict
    || ''
  ).trim().toLowerCase();
  const finalVisualBucket = String(
    (snapshotReplayAuthorityLocked && snapshotAuthority.reviewVisualBucket)
    || reviewVisualState.visualBucket
    || ''
  ).trim().toLowerCase();
  const recomputedScannerVisualBucket = String(
    ((simplifiedScannerState && simplifiedScannerState.visualBucket)
    || scannerVisualState.visualBucket
    || '')
  ).trim().toLowerCase() || 'monitor';
  return {
    scannerCanonicalVerdict:String(scannerCanonicalVerdictRaw || '').trim().toLowerCase(),
    scannerVisualBucket,
    recomputedScannerVisualBucket,
    recomputedReviewCanonicalVerdict,
    recomputedReviewVisualBucket,
    reviewCanonicalVerdict,
    reviewVisualBucket,
    finalResolvedVerdict,
    finalVisualBucket
  };
}

function buildReplayVerdictResolution({
  sandbox,
  replayBase,
  resolveGlobalVerdict
}){
  const record = replayBase && replayBase.record ? replayBase.record : {};
  const globalVerdict = resolveGlobalVerdict(record);
  const resolvedContract = {
    ...(record.resolvedContract || {}),
    finalVerdict:sandbox.window.ResolverCore.globalVerdictLabel(globalVerdict.final_verdict),
    final_verdict:globalVerdict.final_verdict,
    baseVerdict:globalVerdict.base_verdict || record.resolvedContract && record.resolvedContract.baseVerdict,
    planStatusKey:globalVerdict.planStateKey || record.resolvedContract && record.resolvedContract.planStatusKey,
    entry_gate_pass:globalVerdict.entry_gate_pass,
    near_entry_gate_pass:globalVerdict.near_entry_gate_pass,
    entry_gate_checks:globalVerdict.entry_gate_checks || {},
    near_entry_gate_checks:globalVerdict.near_entry_gate_checks || {},
    presentationUpgradeBlocked:globalVerdict.downgrade_applied === true,
    promotionBlockedBy:globalVerdict.downgrade_reason || ''
  };
  const lifecycleSeed = {
    structure_state:derivedStateValue(record.derivedStates, 'structureState', 'structure_state'),
    bounce_state:derivedStateValue(record.derivedStates, 'bounceState', 'bounce_state'),
    plan_status:record.displayedPlan && record.displayedPlan.status,
    rr_confidence:record.planRealism && record.planRealism.rr_confidence_label,
    market_regime:globalVerdict.market_regime || '',
    final_verdict:globalVerdict.final_verdict
  };
  const recomputedLifecycleFromWatch = typeof sandbox.resolveLifecycleTransition === 'function'
    ? sandbox.resolveLifecycleTransition('watch', lifecycleSeed)
    : sandbox.window.ResolverCore.normalizeGlobalVerdictKey(globalVerdict.final_verdict);
  return {
    globalVerdict,
    resolvedContract,
    recomputedLifecycleFromWatch
  };
}

function buildRecomputedReplayDiagnostics({
  globalVerdict,
  reviewVisualState,
  replayBase,
  recomputedLifecycleFromWatch,
  recomputedReviewCanonicalVerdict,
  recomputedReviewVisualBucket,
  recomputedScannerVisualBucket,
  scannerCanonicalVerdictRaw
}){
  const safeGlobalVerdict = globalVerdict && typeof globalVerdict === 'object' ? globalVerdict : {};
  const safeReviewVisualState = reviewVisualState && typeof reviewVisualState === 'object' ? reviewVisualState : {};
  const record = replayBase && replayBase.record ? replayBase.record : {};
  return {
    scannerCanonicalVerdict:String(scannerCanonicalVerdictRaw || '').trim().toLowerCase(),
    scannerVisualBucket:String(recomputedScannerVisualBucket || '').trim().toLowerCase(),
    canonicalVerdict:String(recomputedReviewCanonicalVerdict || '').trim().toLowerCase(),
    visualBucket:String(recomputedReviewVisualBucket || '').trim().toLowerCase(),
    lifecycleState:String(recomputedLifecycleFromWatch || '').trim().toLowerCase(),
    structureState:String(
      derivedStateValue(record.derivedStates, 'structureState', 'structure_state') || ''
    ).trim().toLowerCase(),
    structureEligibility:String(
      derivedStateValue(record.derivedStates, 'structureEligibility', 'structure_eligibility')
      || safeGlobalVerdict.structure_eligibility
      || safeReviewVisualState.structureEligibility
      || 'unknown'
    ).trim().toLowerCase() || 'unknown',
    primaryReason:String(
      safeGlobalVerdict.main_blocker
      || safeGlobalVerdict.reason
      || record.resolvedContract && (
        record.resolvedContract.blockerReason
        || record.resolvedContract.reasonSummary
      )
      || ''
    ).trim(),
    blockerSource:String(
      safeGlobalVerdict.primary_blocker_source
      || safeGlobalVerdict.semantic_blocker_code
      || ''
    ).trim(),
    promotionBlockedReason:String(
      safeGlobalVerdict.promotionBlockedReason
      || ''
    ).trim(),
    promotionBlockedBy:String(
      safeGlobalVerdict.promotionBlockedBy
      || ''
    ).trim(),
    downgradeReason:String(
      safeGlobalVerdict.downgrade_reason
      || ''
    ).trim(),
    semanticBlockerReason:String(
      safeGlobalVerdict.semantic_blocker_reason
      || ''
    ).trim(),
    viabilityReason:String(
      safeGlobalVerdict.viabilityReason
      || ''
    ).trim(),
    entryGatePass:safeGlobalVerdict.entry_gate_pass === true,
    nearEntryGatePass:safeGlobalVerdict.near_entry_gate_pass === true,
    entryGateReasons:Array.isArray(safeGlobalVerdict.entry_gate_reasons)
      ? safeGlobalVerdict.entry_gate_reasons.map(reason => String(reason || '').trim()).filter(Boolean)
      : [],
    nearEntryGateReasons:Array.isArray(safeGlobalVerdict.near_entry_gate_reasons)
      ? safeGlobalVerdict.near_entry_gate_reasons.map(reason => String(reason || '').trim()).filter(Boolean)
      : [],
    weakWatchDiminishingReason:String(
      safeReviewVisualState.weakWatchDiminishingReason
      || safeGlobalVerdict.downgrade_reason
      || ''
    ).trim()
  };
}

function snapshotDiagnosticValue(snapshotReplayAuthorityLocked, authorityValue, fallbackValue = ''){
  if(snapshotReplayAuthorityLocked && authorityValue !== undefined && authorityValue !== null && String(authorityValue).trim() !== ''){
    return authorityValue;
  }
  return fallbackValue;
}

function buildReplayDiagnosticSources({
  snapshotReplayAuthorityLocked,
  snapshotAuthority,
  recomputedDiagnostics
}){
  const authority = snapshotAuthority && typeof snapshotAuthority === 'object' ? snapshotAuthority : {};
  const recomputed = recomputedDiagnostics && typeof recomputedDiagnostics === 'object'
    ? recomputedDiagnostics
    : {};
  const snapshot = {
    lifecycleState:String(authority.lifecycleState || '').trim().toLowerCase(),
    structureState:String(authority.structureState || '').trim().toLowerCase(),
    structureEligibility:String(authority.structureEligibility || '').trim().toLowerCase(),
    primaryReason:String(authority.reviewPrimaryReason || '').trim()
  };
  return {
    snapshot,
    recomputed,
    effective:{
      lifecycleState:String(snapshotDiagnosticValue(snapshotReplayAuthorityLocked, snapshot.lifecycleState, recomputed.lifecycleState) || '').trim().toLowerCase(),
      structureState:String(snapshotDiagnosticValue(snapshotReplayAuthorityLocked, snapshot.structureState, recomputed.structureState) || '').trim().toLowerCase(),
      structureEligibility:String(snapshotDiagnosticValue(snapshotReplayAuthorityLocked, snapshot.structureEligibility, recomputed.structureEligibility) || 'unknown').trim().toLowerCase() || 'unknown',
      primaryReason:String(snapshotDiagnosticValue(snapshotReplayAuthorityLocked, snapshot.primaryReason, recomputed.primaryReason) || '').trim()
    }
  };
}

function buildReplayDiagnostics({
  snapshotAuthority,
  scannerCanonicalVerdictRaw,
  recomputedScannerVisualBucket,
  recomputedReviewCanonicalVerdict,
  recomputedReviewVisualBucket,
  recomputedLifecycleFromWatch,
  layerMutationParts,
  normalizedReplayDiagnostics,
  blockerSource,
  promotionDiagnosticsActive,
  promotionBlocker,
  failingGate,
  watchToDiminishingReason,
  diminishingReasonActive,
  canonicalInputDiagnostics
}){
  const authority = snapshotAuthority && typeof snapshotAuthority === 'object' ? snapshotAuthority : {};
  return {
    layerMutationReason:Array.isArray(layerMutationParts) ? layerMutationParts.join(' | ') : '',
    blockers:normalizedReplayDiagnostics && Array.isArray(normalizedReplayDiagnostics.blockers)
      ? normalizedReplayDiagnostics.blockers
      : [],
    blockerSource:String(blockerSource || '').trim(),
    promotionDiagnosticsActive:promotionDiagnosticsActive === true,
    promotionBlocker:String(promotionBlocker || '').trim(),
    failingGate:String(failingGate || '').trim(),
    blockerCopy:String(normalizedReplayDiagnostics && normalizedReplayDiagnostics.blockerCopy || '').trim(),
    watchToDiminishingReason:String(watchToDiminishingReason || '').trim(),
    diminishingReasonActive:diminishingReasonActive === true,
    canonicalInputDiagnostics:canonicalInputDiagnostics || null,
    authorityDrift:{
      scannerCanonicalVerdict:String(scannerCanonicalVerdictRaw || '').trim().toLowerCase(),
      scannerVisualBucket:String(recomputedScannerVisualBucket || '').trim().toLowerCase(),
      canonicalVerdict:String(recomputedReviewCanonicalVerdict || '').trim().toLowerCase(),
      visualBucket:String(recomputedReviewVisualBucket || '').trim().toLowerCase(),
      lifecycleState:String(recomputedLifecycleFromWatch || '').trim().toLowerCase(),
      differsFromSnapshot:!!(
        authority.reviewCanonicalVerdict
        && (
          authority.scannerCanonicalVerdict && authority.scannerCanonicalVerdict !== scannerCanonicalVerdictRaw
          || authority.scannerVisualBucket && authority.scannerVisualBucket !== recomputedScannerVisualBucket
          || authority.lifecycleState && authority.lifecycleState !== String(recomputedLifecycleFromWatch || '').trim().toLowerCase()
          || authority.reviewCanonicalVerdict !== recomputedReviewCanonicalVerdict
          || authority.reviewVisualBucket !== recomputedReviewVisualBucket
        )
      )
    }
  };
}

function buildReplayJsonResult(result){
  return {
    ticker:result.ticker,
    canonicalContract:result.snapshot && result.snapshot.canonicalContract ? deepClone(result.snapshot.canonicalContract) : null,
    renderModels:result.snapshot && result.snapshot.renderModels ? deepClone(result.snapshot.renderModels) : null,
    rawShortlistSignal:{
      verdict:result.proxy.verdict,
      reasons:Array.isArray(result.proxy.reasons) ? result.proxy.reasons.slice() : [],
      blockers:Array.isArray(result.proxy.blockers) ? result.proxy.blockers.slice() : []
    },
    rawShortlistVerdict:result.proxy && result.proxy.verdict ? String(result.proxy.verdict) : '',
    scannerCanonicalVerdict:result.replay.scannerCanonicalVerdict,
    scannerVisualBucket:result.replay.scannerVisualBucket,
    scannerSnapshotIncomplete:result.replay.scannerSnapshotIncomplete,
    reviewCanonicalVerdict:result.replay.reviewCanonicalVerdict,
    reviewVisualBucket:result.replay.reviewVisualBucket,
    reviewNextAction:result.replay.reviewNextAction,
    reviewPrimaryReason:result.replay.reviewPrimaryReason,
    planStatus:result.replay.planStatus,
    replayAuthoritySource:result.replay.replayAuthoritySource,
    snapshotContractFingerprint:result.replay.snapshotContractFingerprint,
    reviewProjectionSource:result.replay.reviewProjectionSource,
    layerMutationReason:result.replay.layerMutationReason,
    simulatedLifecycleFromWatch:result.replay.simulatedLifecycleFromWatch,
    structureState:result.replay.structureState,
    structureEligibility:result.replay.structureEligibility,
    bounceState:result.replay.bounceState,
    stabilisationState:result.replay.stabilisationState,
    priceabilityState:result.replay.priceabilityState,
    setupScore:result.replay.setupScore,
    realisticTarget:result.replay.realisticTarget,
    extendedTarget:result.replay.extendedTarget,
    realisticRr:result.replay.realisticRr,
    targetStretchPct:result.replay.targetStretchPct,
    targetCapReason:result.replay.targetCapReason,
    blockers:result.replay.blockers,
    blockerCopy:result.replay.blockerCopy,
    watchToDiminishingReason:result.replay.watchToDiminishingReason,
    promotionDiagnostics:result.replay.promotionDiagnosticsActive
      ? {
        blockerSource:result.replay.blockerSource,
        promotionBlocker:result.replay.promotionBlocker,
        failingGate:result.replay.failingGate
      }
      : null,
    authorityDrift:result.replay.authorityDrift || null
  };
}

function buildTickerReportLines(result){
  const {ticker, snapshot, proxy, replay} = result;
  const mismatch = proxy.verdict !== replay.reviewCanonicalVerdictLabel;
  const headline = mismatch
    ? `${ticker} | canonical ${replay.reviewCanonicalVerdictLabel}/${replay.reviewVisualBucket} | PROXY/CANONICAL DIVERGENCE proxy=${proxy.verdict}`
    : `${ticker} | canonical ${replay.reviewCanonicalVerdictLabel}/${replay.reviewVisualBucket} | proxy aligned ${proxy.verdict}`;
  const lines = [
    '',
    headline,
    `  price/ma: price ${fmtPrice(snapshot.price)} | 20MA ${fmtPrice(snapshot.sma20)} | 50MA ${fmtPrice(snapshot.sma50)} | 200MA ${fmtPrice(snapshot.sma200)}`,
    `  distances: 20MA ${fmtPct(pctDistance(snapshot.price, snapshot.sma20))} | 50MA ${fmtPct(pctDistance(snapshot.price, snapshot.sma50))}`,
    `  tape: RSI ${safeNumber(snapshot.rsi14, 2) ?? 'n/a'} | volume ratio ${safeNumber((numericOrNull(snapshot.volume) && numericOrNull(snapshot.avgVolume30d)) ? numericOrNull(snapshot.volume) / numericOrNull(snapshot.avgVolume30d) : null, 2) ?? 'n/a'}`,
    `  raw shortlist signal: ${proxy.verdict} | score ${proxy.score}`,
    `  scannerCanonicalVerdict: ${replay.scannerCanonicalVerdictLabel} | scannerVisualBucket: ${replay.scannerVisualBucket} | setup score ${replay.setupScore}${replay.scannerSnapshotIncomplete ? ' | scannerSnapshotIncomplete: true' : ''}`,
    `  reviewCanonicalVerdict: ${replay.reviewCanonicalVerdictLabel} | reviewVisualBucket: ${replay.reviewVisualBucket} | simulated lifecycle ${replay.simulatedLifecycleFromWatch}`,
    `  layer mutation: ${replay.layerMutationReason || 'none'}`,
    `  states: structure ${replay.structureState} | eligibility ${replay.structureEligibility} | bounce ${replay.bounceState} | stabilisation ${replay.stabilisationState} | priceability ${replay.priceabilityState}`,
    `  target profile: first ${fmtPrice(replay.realisticTarget)} | extended ${Number.isFinite(numericOrNull(replay.extendedTarget)) ? `${fmtPrice(replay.extendedTarget)} (context only)` : 'n/a'} | firstRR ${fmtRatio(replay.realisticRr)} | stretch ${fmtPct(replay.targetStretchPct, 1)}`,
    `  target cap: ${replay.targetCapReason || 'n/a'}`
  ];
  if(replay.promotionDiagnosticsActive){
    lines.push(`  blockers: ${(replay.blockers.length ? replay.blockers.join(' | ') : 'none')}`);
    lines.push(`  promotion diagnostics: source ${replay.blockerSource || 'n/a'} | blocker ${replay.promotionBlocker || 'n/a'} | gate ${replay.failingGate || 'n/a'}`);
    lines.push(`  blocker copy: ${replay.blockerCopy || 'n/a'}`);
  }
  if(replay.diminishingReasonActive){
    lines.push(`  diminishing: ${replay.watchToDiminishingReason || 'n/a'}`);
  }
  if(replay.canonicalInputDiagnostics){
    lines.push(`  canonical input: plan ${replay.canonicalInputDiagnostics.selectedPlanAuthority || 'n/a'} | derived ${replay.canonicalInputDiagnostics.selectedDerivedStates || 'n/a'} | audit ${replay.canonicalInputDiagnostics.auditOnlyCount} | presentation ${replay.canonicalInputDiagnostics.presentationOnlyCount} | free-text ${replay.canonicalInputDiagnostics.blockedFreeTextCount}`);
  }
  return lines;
}

function printTickerReport(result){
  console.log(buildTickerReportLines(result).join('\n'));
}

async function main(){
  const args = process.argv.slice(2);
  const canonicalInputDiagnosticsEnabled = args.includes('--canonical-input-diagnostics');
  const snapshotFlagIndex = args.findIndex(arg => arg === '--snapshot');
  const snapshotPath = snapshotFlagIndex >= 0 ? args[snapshotFlagIndex + 1] : '';
  const saveSnapshotFlagIndex = args.findIndex(arg => arg === '--save-snapshot');
  const saveSnapshotPath = saveSnapshotFlagIndex >= 0 ? args[saveSnapshotFlagIndex + 1] : '';
  const providerArg = args.find(arg => arg.startsWith('--provider='));
  const requestedProvider = normalizeProviderId((providerArg && providerArg.split('=')[1]) || 'fmp');
  const tickerArgs = args.filter((arg, index) => {
    if(arg.startsWith('--provider=')) return false;
    if(arg === '--snapshot') return false;
    if(arg === '--save-snapshot') return false;
    if(snapshotFlagIndex >= 0 && index === snapshotFlagIndex + 1) return false;
    if(saveSnapshotFlagIndex >= 0 && index === saveSnapshotFlagIndex + 1) return false;
    return !arg.startsWith('--');
  });

  if(!snapshotPath && !tickerArgs.length){
    usage();
    process.exitCode = 1;
    return;
  }

  const sandbox = loadReplayRuntime();
  const {resolveGlobalVerdict, coreDeps} = buildReplayDeps(sandbox);
  const visualDeps = buildVisualDeps(sandbox, resolveGlobalVerdict);

  let snapshots = [];
  const liveSnapshotPayloads = [];
  if(snapshotPath){
    snapshots = loadSnapshotsFromFile(snapshotPath);
  }else{
    const planId = normalizePlanId(requestedProvider, 'scanner');
    const providerConfig = getProviderConfig(requestedProvider, planId);
    const adapter = PROVIDERS[providerConfig.id] || PROVIDERS.fmp;
    const apiKey = providerApiKey(providerConfig.id);
    if(!apiKey){
      console.error(`Missing API key for provider ${providerConfig.id}.`);
      process.exitCode = 1;
      return;
    }
    for(const rawTicker of tickerArgs){
      const ticker = normalizeTicker(rawTicker);
      const {snapshot, logs} = await fetchSnapshot(adapter, providerConfig, ticker);
      const normalizedSnapshot = normalizeSnapshotInput(snapshot, ticker);
      snapshots.push(normalizedSnapshot);
      liveSnapshotPayloads.push({
        ticker,
        snapshot:normalizedSnapshot,
        providerTrace:logs
      });
    }
  }

  const results = snapshots.map(snapshot => {
    const proxy = classifyShortlistCandidate(snapshot);
    const reviewProjectionContext = normalizeReviewProjectionContext(snapshot);
    const replayBase = buildReplayRecord(snapshot, sandbox);
    const snapshotAuthority = replayBase.snapshotAuthority || extractSnapshotCanonicalAuthority(snapshot);
    const snapshotPublicFields = extractSnapshotReplayPublicFields(snapshotAuthority, snapshot);
    const snapshotReplayAuthorityLocked = hasSnapshotReplayAuthority(snapshotAuthority);
    const scannerRecord = deepClone(replayBase.record);
    const scannerResolvedContract = deepClone(replayBase.record.resolvedContract);
    // Scanner-layer capture must remain immutable. Review/watchlist mutation happens on a cloned record only.
    const scannerVisualState = sandbox.window.ResolverPresentation.resolveVisualState(scannerRecord, 'scanner', {
      derivedStates:scannerRecord.derivedStates,
      effectivePlan:scannerRecord.effectivePlan,
      displayedPlan:scannerRecord.displayedPlan,
      resolvedContract:scannerResolvedContract,
      setupScore:scannerRecord.setupScore
    }, visualDeps);
    const simplifiedScannerState = sandbox.window.SimplifiedTradeState
      && typeof sandbox.window.SimplifiedTradeState.resolveRecordState === 'function'
      ? sandbox.window.SimplifiedTradeState.resolveRecordState(scannerRecord, {
        surface:'scan',
        log:false,
        deps:coreDeps()
      })
      : null;
    const authoritativeScannerSnapshotVerdict = String(
      scannerRecord
      && scannerRecord.scan
      && (
        scannerRecord.scan.resolvedVerdict
        || scannerRecord.scan.verdict
        || ''
      )
    ).trim();
    const scannerCanonicalVerdictRaw = String(
      (authoritativeScannerSnapshotVerdict
        ? sandbox.window.ResolverCore.normalizeGlobalVerdictKey(authoritativeScannerSnapshotVerdict)
        : '')
      || (simplifiedScannerState && simplifiedScannerState.canonicalVerdict)
      || scannerResolvedContract.final_verdict
      || ''
    ).trim().toLowerCase();
    const scannerSnapshotCanonicalVerdict = snapshotAuthority.scannerCanonicalVerdict || '';
    const scannerSnapshotIncomplete = !(scannerSnapshotCanonicalVerdict || scannerCanonicalVerdictRaw);
    const scannerCanonicalVerdict = scannerSnapshotCanonicalVerdict || scannerCanonicalVerdictRaw || 'unknown';
    const replayVerdictResolution = buildReplayVerdictResolution({
      sandbox,
      replayBase,
      resolveGlobalVerdict
    });
    const globalVerdict = replayVerdictResolution.globalVerdict;
    replayBase.record.resolvedContract = replayVerdictResolution.resolvedContract;
    const reviewVisualState = sandbox.window.ResolverPresentation.resolveVisualState(replayBase.record, 'scanner', {
      derivedStates:replayBase.record.derivedStates,
      effectivePlan:replayBase.record.effectivePlan,
      displayedPlan:replayBase.record.displayedPlan,
      resolvedContract:replayBase.record.resolvedContract,
      setupScore:replayBase.record.setupScore
    }, visualDeps);
    const simplifiedReviewState = sandbox.window.SimplifiedTradeState
      && typeof sandbox.window.SimplifiedTradeState.resolveRecordState === 'function'
      ? sandbox.window.SimplifiedTradeState.resolveRecordState(replayBase.record, {
        surface:'review',
        log:false,
        deps:coreDeps()
      })
      : null;
    const recomputedLifecycleFromWatch = replayVerdictResolution.recomputedLifecycleFromWatch;
    const recomputedAuthority = buildRecomputedReplayAuthority({
      snapshotAuthority,
      snapshotReplayAuthorityLocked,
      reviewProjectionContext,
      scannerCanonicalVerdict,
      scannerCanonicalVerdictRaw,
      authoritativeScannerSnapshotVerdict,
      scannerVisualState,
      simplifiedScannerState,
      reviewVisualState,
      simplifiedReviewState,
      globalVerdict
    });
    const recomputedDiagnostics = buildRecomputedReplayDiagnostics({
      globalVerdict,
      reviewVisualState,
      replayBase,
      recomputedLifecycleFromWatch,
      recomputedReviewCanonicalVerdict:recomputedAuthority.recomputedReviewCanonicalVerdict,
      recomputedReviewVisualBucket:recomputedAuthority.recomputedReviewVisualBucket,
      recomputedScannerVisualBucket:recomputedAuthority.recomputedScannerVisualBucket,
      scannerCanonicalVerdictRaw
    });
    const diagnosticSources = buildReplayDiagnosticSources({
      snapshotReplayAuthorityLocked,
      snapshotAuthority,
      recomputedDiagnostics
    });
    const simulatedLifecycleFromWatch = diagnosticSources.effective.lifecycleState;
    const replayStructureState = diagnosticSources.effective.structureState;
    const replayStructureEligibility = diagnosticSources.effective.structureEligibility;
    const rawBlockerCopy = diagnosticSources.effective.primaryReason;
    const blockerSource = String(recomputedDiagnostics.blockerSource || '').trim();
    const finalResolvedVerdict = recomputedAuthority.finalResolvedVerdict;
    const finalVisualBucket = recomputedAuthority.finalVisualBucket;
    const promotionDiagnosticsActive = !['entry', 'near_entry'].includes(finalResolvedVerdict)
      && !['entry', 'near_entry'].includes(finalVisualBucket);
    const rawWatchToDiminishingReason = String(recomputedDiagnostics.weakWatchDiminishingReason || '').trim();
    const diminishingReasonActive = finalResolvedVerdict === 'watch'
      && finalVisualBucket === 'diminishing'
      && !!rawWatchToDiminishingReason;
    let promotionBlocker = '';
    let failingGate = '';
    if(promotionDiagnosticsActive){
      const fallbackDiagnostic = fallbackPromotionDiagnostic({
        recomputedDiagnostics,
        replayBase,
        structureState:replayStructureState,
        structureEligibility:replayStructureEligibility
      });
      promotionBlocker = String(
        recomputedDiagnostics.promotionBlockedReason
        || recomputedDiagnostics.downgradeReason
        || fallbackDiagnostic.promotionBlocker
        || ''
      ).trim();
      failingGate = String(
        recomputedDiagnostics.promotionBlockedBy
        || fallbackDiagnostic.failingGate
        || ''
      ).trim();
      if(structureContradictionForPromotionText(
        promotionBlocker,
        replayStructureState,
        replayStructureEligibility
      )){
        promotionBlocker = fallbackDiagnostic.promotionBlocker;
        failingGate = fallbackDiagnostic.failingGate;
      }
    }
    const blockerCopy = promotionDiagnosticsActive ? rawBlockerCopy : '';
    const blockers = promotionDiagnosticsActive ? promotionBlockers(recomputedDiagnostics, replayBase.record.derivedStates) : [];
    const watchToDiminishingReason = diminishingReasonActive ? rawWatchToDiminishingReason : '';
    const normalizedReplayDiagnostics = normalizeReplayBlockers({
      finalResolvedVerdict,
      finalVisualBucket,
      rawBlockers:blockers,
      promotionBlocker,
      blockerCopy
    });
    const scannerVisualBucket = recomputedAuthority.scannerVisualBucket;
    const reviewVisualBucket = recomputedAuthority.reviewVisualBucket;
    const reviewCanonicalVerdict = recomputedAuthority.reviewCanonicalVerdict;
    const layerMutationParts = [];
    if(snapshotAuthority.reviewCanonicalVerdict && snapshotAuthority.reviewCanonicalVerdict !== recomputedAuthority.recomputedReviewCanonicalVerdict){
      layerMutationParts.push(`snapshot contract ${snapshotAuthority.reviewCanonicalVerdict} != recomputed ${recomputedAuthority.recomputedReviewCanonicalVerdict}`);
    }
    if(snapshotAuthority.reviewVisualBucket && snapshotAuthority.reviewVisualBucket !== recomputedAuthority.recomputedReviewVisualBucket){
      layerMutationParts.push(`snapshot bucket ${snapshotAuthority.reviewVisualBucket} != recomputed ${recomputedAuthority.recomputedReviewVisualBucket}`);
    }
    if(!snapshotReplayAuthorityLocked && scannerCanonicalVerdict !== reviewCanonicalVerdict){
      layerMutationParts.push(`verdict ${scannerCanonicalVerdict} -> ${reviewCanonicalVerdict}`);
    }
    if(!snapshotReplayAuthorityLocked && scannerVisualBucket !== reviewVisualBucket){
      layerMutationParts.push(`bucket ${scannerVisualBucket} -> ${reviewVisualBucket}`);
    }
    if(layerMutationParts.length && recomputedDiagnostics.downgradeReason){
      layerMutationParts.push(`reason ${String(recomputedDiagnostics.downgradeReason).trim()}`);
    }
    const canonicalInputDiagnostics = canonicalInputDiagnosticsEnabled
      && sandbox.window.CanonicalResolverInput
      && typeof sandbox.window.CanonicalResolverInput.buildCanonicalResolverInput === 'function'
      ? sandbox.window.CanonicalResolverInput.buildCanonicalResolverInput(replayBase.record, {
        surface:'replay',
        mode:'diagnostic'
      })
      : null;
    const publicReplay = buildPublicReplayView({
      sandbox,
      snapshotAuthority,
      snapshotPublicFields,
      reviewProjectionContext,
      replayBase,
      fallback:{
        scannerCanonicalVerdict,
        scannerVisualBucket,
        scannerSnapshotIncomplete,
        reviewCanonicalVerdict,
        reviewVisualBucket,
        reviewNextAction:'',
        reviewPrimaryReason:'',
        planStatus:String(replayBase.record.displayedPlan && replayBase.record.displayedPlan.status || '').trim().toLowerCase(),
        simulatedLifecycleFromWatch:String(simulatedLifecycleFromWatch || ''),
        structureState:replayStructureState,
        structureEligibility:replayStructureEligibility,
        bounceState:derivedStateValue(replayBase.record.derivedStates, 'bounceState', 'bounce_state'),
        stabilisationState:derivedStateValue(replayBase.record.derivedStates, 'stabilisationState', 'stabilisation_state'),
        priceabilityState:derivedStateValue(replayBase.record.derivedStates, 'priceabilityState', 'priceability_state'),
        setupScore:replayBase.record.setupScore
      }
    });
    const reducedCanonicalInputDiagnostics = canonicalInputDiagnostics
      ? {
        selectedPlanAuthority:String(canonicalInputDiagnostics.diagnostics && canonicalInputDiagnostics.diagnostics.selectedPlanAuthorityCandidate && canonicalInputDiagnostics.diagnostics.selectedPlanAuthorityCandidate.source || ''),
        selectedDerivedStates:String(canonicalInputDiagnostics.diagnostics && canonicalInputDiagnostics.diagnostics.selectedDerivedStateAuthorityCandidate && canonicalInputDiagnostics.diagnostics.selectedDerivedStateAuthorityCandidate.source || ''),
        auditOnlyCount:Array.isArray(canonicalInputDiagnostics.diagnostics && canonicalInputDiagnostics.diagnostics.auditOnlyFields) ? canonicalInputDiagnostics.diagnostics.auditOnlyFields.length : 0,
        presentationOnlyCount:Array.isArray(canonicalInputDiagnostics.diagnostics && canonicalInputDiagnostics.diagnostics.presentationOnlyFields) ? canonicalInputDiagnostics.diagnostics.presentationOnlyFields.length : 0,
        blockedFreeTextCount:Array.isArray(canonicalInputDiagnostics.diagnostics && canonicalInputDiagnostics.diagnostics.blockedFreeTextAuthorityPaths) ? canonicalInputDiagnostics.diagnostics.blockedFreeTextAuthorityPaths.length : 0,
        ignoredStaleFields:Array.isArray(canonicalInputDiagnostics.diagnostics && canonicalInputDiagnostics.diagnostics.ignoredStaleFields)
          ? canonicalInputDiagnostics.diagnostics.ignoredStaleFields
          : []
      }
      : null;
    const replayDiagnostics = buildReplayDiagnostics({
      snapshotAuthority,
      scannerCanonicalVerdictRaw:recomputedDiagnostics.scannerCanonicalVerdict,
      recomputedScannerVisualBucket:recomputedDiagnostics.scannerVisualBucket,
      recomputedReviewCanonicalVerdict:recomputedDiagnostics.canonicalVerdict,
      recomputedReviewVisualBucket:recomputedDiagnostics.visualBucket,
      recomputedLifecycleFromWatch:recomputedDiagnostics.lifecycleState,
      layerMutationParts,
      normalizedReplayDiagnostics,
      blockerSource,
      promotionDiagnosticsActive,
      promotionBlocker,
      failingGate,
      watchToDiminishingReason,
      diminishingReasonActive,
      canonicalInputDiagnostics:reducedCanonicalInputDiagnostics
    });
    return {
      ticker:snapshot.ticker,
      snapshot,
      proxy,
      replay:{
        ...publicReplay,
        ...replayDiagnostics
      }
    };
  });

  if(saveSnapshotPath && !snapshotPath){
    const outputPath = path.resolve(process.cwd(), saveSnapshotPath);
    ensureDirectoryForFile(outputPath);
    fs.writeFileSync(outputPath, JSON.stringify({
      ok:true,
      requestedAt:new Date().toISOString(),
      source:'live_provider',
      provider:requestedProvider,
      tickers:snapshots.map(snapshot => snapshot.ticker),
      snapshots:liveSnapshotPayloads
    }, null, 2));
  }

  console.log(JSON.stringify({
    ok:true,
    requestedAt:new Date().toISOString(),
    source:snapshotPath ? 'snapshot_file' : 'live_provider',
    provider:snapshotPath ? null : requestedProvider,
    tickers:results.map(result => result.ticker),
    results:results.map(buildReplayJsonResult)
  }, null, 2));

  results.forEach(printTickerReport);
}

main().catch(error => {
  console.error(JSON.stringify({
    ok:false,
    error:String(error && error.message || error || 'Replay failed.'),
    stack:String(error && error.stack || '')
  }, null, 2));
  process.exitCode = 1;
});
