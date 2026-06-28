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
  const resolveGlobalVerdict = record => {
    if(!coreDepsCache){
      coreDepsCache = {
        resolveFinalStateContract(item){
          return item && item.resolvedContract || {
            finalVerdict:'Watch',
            final_verdict:'watch',
            structuralState:'developing',
            actionStateKey:'wait_for_confirmation',
            planStatusKey:'valid',
            tradeabilityVerdict:'Watch',
            blockerReason:'Needs stronger confirmation',
            reasonSummary:'Needs stronger confirmation',
            terminal:false,
            baseVerdict:'watch'
          };
        },
        resolvePreLifecycleStateContract(item){
          return item && item.preLifecycleResolved || item && item.resolvedContract || {
            finalVerdict:'Watch',
            final_verdict:'watch',
            structuralState:'developing',
            actionStateKey:'wait_for_confirmation',
            planStatusKey:'valid',
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
    }
    return sandbox.window.ResolverCore.resolveGlobalVerdict(record, coreDepsCache);
  };
  return {resolveGlobalVerdict, coreDeps:() => coreDepsCache};
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

function buildScannerDebugDeps(sandbox, resolveGlobalVerdict, resolveVisualState){
  return {
    normalizeTickerRecord(record){
      return record;
    },
    analysisDerivedStatesFromRecord(record){
      return record && record.derivedStates || {};
    },
    rrCategoryForView(view){
      const rrValue = numericOrNull(view && view.rrValue);
      if(view && view.planUiState && view.planUiState.state === 'unrealistic_rr') return 'unrealistic';
      if(!Number.isFinite(rrValue)) return 'na';
      if(rrValue > 12) return 'unrealistic';
      if(rrValue > 8) return 'stretched';
      if(rrValue < 1.5) return 'low';
      return 'normal';
    },
    finalStructureQualityForView(view){
      const states = view && view.setupStates ? view.setupStates : {};
      const structureState = String(states.structureState || '').toLowerCase();
      const stabilisationState = String(states.stabilisationState || '').toLowerCase();
      const bounceState = String(states.bounceState || '').toLowerCase();
      if(['broken','weak','developing_loose'].includes(structureState)) return 'weak';
      if(['strong','intact'].includes(structureState)) return 'strong';
      if(structureState === 'developing_clean') return 'developing_clean';
      if(['developing','weakening'].includes(structureState)){
        return bounceState === 'confirmed' && ['clear','early'].includes(stabilisationState)
          ? 'developing_clean'
          : 'developing_loose';
      }
      return 'developing_loose';
    },
    evaluatePlanRealism(record){
      return record && record.planRealism || {};
    },
    numericOrNull,
    resolveEmojiPresentation(){
      return {};
    },
    normalizeScanType:value => sandbox.normalizeScanType(value),
    currentSetupType:() => sandbox.currentSetupType(),
    fmtPrice,
    resolveGlobalVerdict,
    resolveVisualState,
    globalVerdictLabel:verdict => sandbox.window.ResolverCore.globalVerdictLabel(verdict),
    getBucket:verdict => sandbox.window.ResolverCore.getBucket(verdict),
    normalizeVerdict:verdict => sandbox.window.ResolverCore.normalizeVerdict(verdict),
    normalizeGlobalVerdictKey:verdict => sandbox.window.ResolverCore.normalizeGlobalVerdictKey(verdict),
    normalizeAnalysisVerdict:value => String(value || 'Watch'),
    getActions:verdict => sandbox.window.ResolverCore.getActions(verdict),
    escapeHtml:value => String(value || ''),
    primaryShortlistStatusChip(){
      return {label:'Watch', primaryState:'monitor'};
    },
    scannerCardClickTraceForTicker(){
      return null;
    },
    scannerCardClickTraceHistoryForTicker(){
      return [];
    },
    reviewAnalysisUiStateForRecord(){
      return '';
    },
    uiState:{},
    getSwipeFeedback(){
      return null;
    }
  };
}

function buildBaseView(record, displayedPlan, chartVerdict, planRealism, setupScore){
  const planState = (() => {
    if(displayedPlan.status === 'missing') return 'missing';
    if(displayedPlan.status !== 'valid') return 'invalid';
    if(planRealism.optimistic_target_flag === true || planRealism.rr_realism === 'low' || displayedPlan.rewardRisk.rrState === 'weak') return 'needs_adjustment';
    return 'valid';
  })();
  const setupState = (() => {
    const derived = record.derivedStates || {};
    if(derived.structureState === 'broken' || derived.trendState === 'broken') return 'broken';
    if(String(chartVerdict || '').toLowerCase() === 'entry' && derived.bounceState === 'confirmed') return 'entry';
    if(['Near Entry','Watch'].includes(String(chartVerdict || '')) && ['near_20ma','near_50ma'].includes(String(derived.pullbackZone || '').toLowerCase())) return 'watch';
    return 'developing';
  })();
  return {
    item:record,
    displayedPlan,
    setupUiState:{state:setupState},
    planUiState:{state:planState, label:planState, capitalFitLabel:String(displayedPlan.capitalFit && displayedPlan.capitalFit.capital_fit || '')},
    displayStage:String(chartVerdict || 'Watch'),
    warningState:null,
    setupScore,
    positionSize:numericOrNull(displayedPlan && displayedPlan.riskFit && displayedPlan.riskFit.position_size),
    rrValue:displayedPlan.status === 'valid' ? numericOrNull(displayedPlan.rewardRisk && displayedPlan.rewardRisk.rrRatio) : numericOrNull(record && record.scan && record.scan.estimatedRR)
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

function buildReplayRecord(snapshot, sandbox){
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
  const preservedAnalysisProjection = preservedScan.analysisProjection && typeof preservedScan.analysisProjection === 'object'
    ? deepClone(preservedScan.analysisProjection)
    : null;
  const preservedDerivedStates = preservedAnalysisProjection
    ? deriveStatesFromPreservedProjection(preservedAnalysisProjection)
    : null;
  const derivedTradePlan = suitability && suitability.tradePlan ? suitability.tradePlan : sandbox.deriveTradePlan(marketData, '20MA');
  const tradePlan = preservedPlan
    ? {
      entry:numericOrNull(preservedPlan.entry ?? (preservedManualReview && preservedManualReview.entry)) ?? derivedTradePlan.entry,
      stop:numericOrNull(preservedPlan.stop ?? (preservedManualReview && preservedManualReview.stop)) ?? derivedTradePlan.stop,
      target:numericOrNull(preservedPlan.firstTarget ?? preservedPlan.target ?? (preservedManualReview && preservedManualReview.target)) ?? derivedTradePlan.target,
      rr:numericOrNull(preservedPlan.plannedRR ?? preservedPlan.rr ?? derivedTradePlan.rr),
      source:String(preservedPlan.source || (preservedManualReview ? 'manual' : derivedTradePlan.source || 'scanner_estimate'))
    }
    : derivedTradePlan;
  const derivedStates = preservedDerivedStates || sandbox.deriveSetupStates(card, marketData, checks, tradePlan);
  const riskFit = sandbox.evaluateRiskFit({
    entry:tradePlan.entry,
    stop:tradePlan.stop,
    ...sandbox.currentRiskSettings()
  });
  const rewardRisk = sandbox.evaluateRewardRisk(tradePlan.entry, tradePlan.stop, tradePlan.target);
  const chartVerdict = sandbox.determineScannerVerdict({
    technicalValid:true,
    score:suitability ? suitability.total : 0,
    checks,
    riskFit,
    rewardRisk
  });
  const displayedPlan = sandbox.deriveCurrentPlanState(tradePlan.entry, tradePlan.stop, tradePlan.target, marketData.currency);
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
  const setupStateHint = String(chartVerdict || '').toLowerCase() === 'entry' ? 'entry' : 'developing';
  const planRealism = sandbox.evaluatePlanRealism({
    ticker:snapshot.ticker,
    meta:{marketStatus:sandbox.state.marketStatus},
    marketData,
    review:preservedReview || {},
    plan:{entry:tradePlan.entry, stop:tradePlan.stop, firstTarget:tradePlan.target, source:tradePlan.source || 'scanner'},
    scan:{resolvedVerdict:chartVerdict},
    derivedStates
  }, {
    displayedPlan,
    derivedStates,
    displayStage:chartVerdict,
    setupState:setupStateHint
  });
  const setupScore = suitability ? suitability.total : 0;
  const canonicalSeed = chartVerdict === 'Entry'
    ? 'entry'
    : (chartVerdict === 'Near Entry' ? 'near_entry' : (chartVerdict === 'Avoid' ? 'avoid' : 'watch'));
  const resolvedContract = buildResolvedContractSeed(chartVerdict, displayedPlan, suitability ? suitability.summary : '', canonicalSeed);
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
    effectivePlan:{entry:tradePlan.entry, stop:tradePlan.stop, firstTarget:tradePlan.target, source:tradePlan.source || ''},
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
    record,
    checks,
    suitability,
    tradePlan,
    riskFit,
    rewardRisk,
    chartVerdict
  };
}

function promotionBlockers(globalVerdict, derivedStates = {}){
  const blockers = [];
  const push = value => {
    const text = String(value || '').trim();
    if(text && !blockers.includes(text)) blockers.push(text);
  };
  push(globalVerdict.semantic_blocker_reason);
  push(globalVerdict.main_blocker);
  push(globalVerdict.promotionBlockedReason);
  push(globalVerdict.downgrade_reason);
  if(globalVerdict.entry_gate_pass !== true){
    (globalVerdict.entry_gate_reasons || []).forEach(push);
  }
  if(globalVerdict.near_entry_gate_pass !== true){
    (globalVerdict.near_entry_gate_reasons || []).forEach(push);
  }
  push(globalVerdict.viabilityReason);
  const structureState = String(
    derivedStates.structureState
    || derivedStates.structure_state
    || globalVerdict.structure_state
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

function fallbackPromotionDiagnostic({globalVerdict, replayBase, structureState, structureEligibility}){
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
    promotionBlocker:String(globalVerdict.promotionBlockedReason || globalVerdict.downgrade_reason || '').trim(),
    failingGate:String(globalVerdict.promotionBlockedBy || '').trim()
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

function buildReplayJsonResult(result){
  return {
    ticker:result.ticker,
    rawShortlistSignal:{
      verdict:result.proxy.verdict,
      reasons:Array.isArray(result.proxy.reasons) ? result.proxy.reasons.slice() : [],
      blockers:Array.isArray(result.proxy.blockers) ? result.proxy.blockers.slice() : []
    },
    scannerCanonicalVerdict:result.replay.scannerCanonicalVerdict,
    scannerVisualBucket:result.replay.scannerVisualBucket,
    scannerSnapshotIncomplete:result.replay.scannerSnapshotIncomplete,
    reviewCanonicalVerdict:result.replay.reviewCanonicalVerdict,
    reviewVisualBucket:result.replay.reviewVisualBucket,
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
      : null
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
  const {resolveGlobalVerdict} = buildReplayDeps(sandbox);
  const visualDeps = buildVisualDeps(sandbox, resolveGlobalVerdict);
  const scannerDebugDeps = buildScannerDebugDeps(
    sandbox,
    resolveGlobalVerdict,
    (record, context, options = {}) => sandbox.window.ResolverPresentation.resolveVisualState(record, context, options, visualDeps)
  );

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
    const replayBase = buildReplayRecord(snapshot, sandbox);
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
    const scannerCanonicalVerdictRaw = String(scannerResolvedContract.final_verdict || '').trim().toLowerCase();
    const scannerSnapshotIncomplete = !scannerCanonicalVerdictRaw;
    const scannerCanonicalVerdict = scannerCanonicalVerdictRaw || 'unknown';
    const globalVerdict = resolveGlobalVerdict(replayBase.record);
    replayBase.record.resolvedContract = {
      ...replayBase.record.resolvedContract,
      finalVerdict:sandbox.window.ResolverCore.globalVerdictLabel(globalVerdict.final_verdict),
      final_verdict:globalVerdict.final_verdict,
      baseVerdict:globalVerdict.base_verdict || replayBase.record.resolvedContract.baseVerdict,
      planStatusKey:globalVerdict.planStateKey || replayBase.record.resolvedContract.planStatusKey,
      entry_gate_pass:globalVerdict.entry_gate_pass,
      near_entry_gate_pass:globalVerdict.near_entry_gate_pass,
      entry_gate_checks:globalVerdict.entry_gate_checks || {},
      near_entry_gate_checks:globalVerdict.near_entry_gate_checks || {},
      presentationUpgradeBlocked:globalVerdict.downgrade_applied === true,
      promotionBlockedBy:globalVerdict.downgrade_reason || ''
    };
    const reviewVisualState = sandbox.window.ResolverPresentation.resolveVisualState(replayBase.record, 'scanner', {
      derivedStates:replayBase.record.derivedStates,
      effectivePlan:replayBase.record.effectivePlan,
      displayedPlan:replayBase.record.displayedPlan,
      resolvedContract:replayBase.record.resolvedContract,
      setupScore:replayBase.record.setupScore
    }, visualDeps);
    const baseView = buildBaseView(
      replayBase.record,
      replayBase.record.displayedPlan,
      sandbox.window.ResolverCore.globalVerdictLabel(globalVerdict.final_verdict),
      replayBase.record.planRealism,
      replayBase.record.setupScore
    );
    const scannerResolution = sandbox.window.ScannerDebug.resolveScannerStateWithTrace(replayBase.record, {
      baseView,
      derivedStates:replayBase.record.derivedStates,
      rrCategory:scannerDebugDeps.rrCategoryForView(baseView),
      structureQuality:scannerDebugDeps.finalStructureQualityForView({...baseView, setupStates:replayBase.record.derivedStates})
    }, scannerDebugDeps);
    const simulatedLifecycleFromWatch = typeof sandbox.resolveLifecycleTransition === 'function'
      ? sandbox.resolveLifecycleTransition('watch', {
        structure_state:derivedStateValue(replayBase.record.derivedStates, 'structureState', 'structure_state'),
        bounce_state:derivedStateValue(replayBase.record.derivedStates, 'bounceState', 'bounce_state'),
        plan_status:replayBase.record.displayedPlan && replayBase.record.displayedPlan.status,
        rr_confidence:replayBase.record.planRealism && replayBase.record.planRealism.rr_confidence_label,
        market_regime:globalVerdict.market_regime || '',
        final_verdict:globalVerdict.final_verdict
      })
      : sandbox.window.ResolverCore.normalizeGlobalVerdictKey(globalVerdict.final_verdict);
    const rawBlockerCopy = String(
      globalVerdict.main_blocker
      || globalVerdict.reason
      || replayBase.record.resolvedContract.blockerReason
      || replayBase.record.resolvedContract.reasonSummary
      || ''
    ).trim();
    const blockerSource = String(
      globalVerdict.primary_blocker_source
      || globalVerdict.semantic_blocker_code
      || ''
    ).trim();
    const finalResolvedVerdict = String(globalVerdict.final_verdict || '').trim().toLowerCase();
    const finalVisualBucket = String(reviewVisualState.visualBucket || '').trim().toLowerCase();
    const promotionDiagnosticsActive = !['entry', 'near_entry'].includes(finalResolvedVerdict)
      && !['entry', 'near_entry'].includes(finalVisualBucket);
    const rawWatchToDiminishingReason = String(
      reviewVisualState.weakWatchDiminishingReason
      || scannerResolution.remapReason
      || ''
    ).trim();
    const diminishingReasonActive = finalResolvedVerdict === 'watch'
      && finalVisualBucket === 'diminishing'
      && !!rawWatchToDiminishingReason;
    let promotionBlocker = '';
    let failingGate = '';
    if(promotionDiagnosticsActive){
      const fallbackDiagnostic = fallbackPromotionDiagnostic({
        globalVerdict,
        replayBase,
        structureState:derivedStateValue(replayBase.record.derivedStates, 'structureState', 'structure_state'),
        structureEligibility:globalVerdict.structure_eligibility || reviewVisualState.structureEligibility || 'unknown'
      });
      promotionBlocker = String(
        globalVerdict.promotionBlockedReason
        || globalVerdict.downgrade_reason
        || fallbackDiagnostic.promotionBlocker
        || ''
      ).trim();
      failingGate = String(
        globalVerdict.promotionBlockedBy
        || fallbackDiagnostic.failingGate
        || ''
      ).trim();
      if(structureContradictionForPromotionText(
        promotionBlocker,
        derivedStateValue(replayBase.record.derivedStates, 'structureState', 'structure_state'),
        globalVerdict.structure_eligibility || reviewVisualState.structureEligibility || 'unknown'
      )){
        promotionBlocker = fallbackDiagnostic.promotionBlocker;
        failingGate = fallbackDiagnostic.failingGate;
      }
    }
    const blockerCopy = promotionDiagnosticsActive ? rawBlockerCopy : '';
    const blockers = promotionDiagnosticsActive ? promotionBlockers(globalVerdict, replayBase.record.derivedStates) : [];
    const watchToDiminishingReason = diminishingReasonActive ? rawWatchToDiminishingReason : '';
    const normalizedReplayDiagnostics = normalizeReplayBlockers({
      finalResolvedVerdict,
      finalVisualBucket,
      rawBlockers:blockers,
      promotionBlocker,
      blockerCopy
    });
    const scannerVisualBucket = String(scannerVisualState.visualBucket || '').trim().toLowerCase() || 'monitor';
    const reviewVisualBucket = String(reviewVisualState.visualBucket || '').trim().toLowerCase() || 'monitor';
    const reviewCanonicalVerdict = String(globalVerdict.final_verdict || '').trim().toLowerCase() || 'watch';
    const layerMutationParts = [];
    if(scannerCanonicalVerdict !== reviewCanonicalVerdict){
      layerMutationParts.push(`verdict ${scannerCanonicalVerdict} -> ${reviewCanonicalVerdict}`);
    }
    if(scannerVisualBucket !== reviewVisualBucket){
      layerMutationParts.push(`bucket ${scannerVisualBucket} -> ${reviewVisualBucket}`);
    }
    if(layerMutationParts.length && globalVerdict.downgrade_reason){
      layerMutationParts.push(`reason ${String(globalVerdict.downgrade_reason).trim()}`);
    }
    const canonicalInputDiagnostics = canonicalInputDiagnosticsEnabled
      && sandbox.window.CanonicalResolverInput
      && typeof sandbox.window.CanonicalResolverInput.buildCanonicalResolverInput === 'function'
      ? sandbox.window.CanonicalResolverInput.buildCanonicalResolverInput(replayBase.record, {
        surface:'replay',
        mode:'diagnostic'
      })
      : null;
    return {
      ticker:snapshot.ticker,
      snapshot,
      proxy,
      replay:{
        scannerCanonicalVerdict,
        scannerCanonicalVerdictLabel:scannerCanonicalVerdict === 'unknown'
          ? 'Unknown'
          : sandbox.window.ResolverCore.globalVerdictLabel(scannerCanonicalVerdict),
        scannerSnapshotIncomplete,
        scannerVisualBucket,
        reviewCanonicalVerdict,
        reviewCanonicalVerdictLabel:sandbox.window.ResolverCore.globalVerdictLabel(globalVerdict.final_verdict),
        reviewVisualBucket,
        layerMutationReason:layerMutationParts.join(' | '),
        simulatedLifecycleFromWatch:String(simulatedLifecycleFromWatch || ''),
        structureState:derivedStateValue(replayBase.record.derivedStates, 'structureState', 'structure_state'),
        structureEligibility:globalVerdict.structure_eligibility || reviewVisualState.structureEligibility || 'unknown',
        bounceState:derivedStateValue(replayBase.record.derivedStates, 'bounceState', 'bounce_state'),
        stabilisationState:derivedStateValue(replayBase.record.derivedStates, 'stabilisationState', 'stabilisation_state'),
        priceabilityState:derivedStateValue(replayBase.record.derivedStates, 'priceabilityState', 'priceability_state'),
        setupScore:replayBase.record.setupScore,
        realisticTarget:replayBase.record.planRealism.realistic_target,
        extendedTarget:replayBase.record.planRealism.extended_target,
        realisticRr:replayBase.record.planRealism.realistic_rr,
        targetStretchPct:replayBase.record.planRealism.target_stretch_pct,
        targetCapReason:replayBase.record.planRealism.target_cap_reason,
        blockers:normalizedReplayDiagnostics.blockers,
        blockerSource,
        promotionDiagnosticsActive,
        promotionBlocker,
        failingGate,
        blockerCopy:normalizedReplayDiagnostics.blockerCopy,
        watchToDiminishingReason,
        diminishingReasonActive,
        canonicalInputDiagnostics:canonicalInputDiagnostics
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
          : null
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
    error:String(error && error.message || error || 'Replay failed.')
  }, null, 2));
  process.exitCode = 1;
});
