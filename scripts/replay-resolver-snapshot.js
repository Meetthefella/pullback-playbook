const fs = require('fs');
const path = require('path');
const vm = require('vm');

const {getProviderConfig, normalizePlanId, normalizeProviderId} = require('../netlify/functions/lib/scan-config');
const fmpProvider = require('../netlify/functions/lib/providers/fmp');
const marketDataProvider = require('../netlify/functions/lib/providers/marketdata');

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
    'evaluateBouncePriceabilityGuard'
  ].forEach(functionName => {
    vm.runInContext(extractFunctionSource(appSource, functionName), sandbox, {filename:`app.js#${functionName}`});
  });

  return sandbox;
}

function classifyShortlistCandidate(snapshot){
  const price = numericOrNull(snapshot.price);
  const sma20 = numericOrNull(snapshot.sma20);
  const sma50 = numericOrNull(snapshot.sma50);
  const sma200 = numericOrNull(snapshot.sma200);
  const rsi14 = numericOrNull(snapshot.rsi14);
  const volume = numericOrNull(snapshot.volume);
  const avgVolume30 = numericOrNull(snapshot.avgVolume30d ?? snapshot.avgVolume30);

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

  return {verdict, score, reasons, blockers};
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
    }))
  };
}

function loadSnapshotsFromFile(snapshotPath){
  const filePath = path.resolve(process.cwd(), snapshotPath);
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if(Array.isArray(parsed)){
    return parsed.map((entry, index) => normalizeSnapshotInput(entry, `SNAPSHOT_${index + 1}`));
  }
  if(Array.isArray(parsed.snapshots)){
    return parsed.snapshots.map((entry, index) => normalizeSnapshotInput(entry, `SNAPSHOT_${index + 1}`));
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

function buildReplayRecord(snapshot, sandbox){
  const marketData = {
    ticker:snapshot.ticker,
    tradingViewSymbol:snapshot.tradingViewSymbol,
    exchange:snapshot.exchange,
    currency:snapshot.currency,
    price:snapshot.price,
    previousClose:snapshot.previousClose,
    sma20:snapshot.sma20,
    sma50:snapshot.sma50,
    sma200:snapshot.sma200,
    ma20:snapshot.sma20,
    ma50:snapshot.sma50,
    ma200:snapshot.sma200,
    rsi14:snapshot.rsi14,
    rsi:snapshot.rsi14,
    volume:snapshot.volume,
    avgVolume30d:snapshot.avgVolume30d,
    avgVolume30:snapshot.avgVolume30d,
    perf1w:snapshot.perf1w,
    perf1m:snapshot.perf1m,
    perf3m:snapshot.perf3m,
    perf6m:snapshot.perf6m,
    perfYtd:snapshot.perfYtd,
    history:Array.isArray(snapshot.history) ? snapshot.history : [],
    warnings:Array.isArray(snapshot.warnings) ? snapshot.warnings : []
  };
  const card = {
    ticker:snapshot.ticker,
    marketData,
    checks:{}
  };
  const checks = sandbox.buildScannerChecks(marketData);
  card.checks = checks;
  const suitability = sandbox.scoreSuitability(card, marketData, checks);
  const tradePlan = suitability && suitability.tradePlan ? suitability.tradePlan : sandbox.deriveTradePlan(marketData, '20MA');
  const derivedStates = sandbox.deriveSetupStates(card, marketData, checks, tradePlan);
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
  const setupStateHint = String(chartVerdict || '').toLowerCase() === 'entry' ? 'entry' : 'developing';
  const planRealism = sandbox.evaluatePlanRealism({
    ticker:snapshot.ticker,
    meta:{marketStatus:sandbox.state.marketStatus},
    marketData,
    review:{},
    plan:{entry:tradePlan.entry, stop:tradePlan.stop, firstTarget:tradePlan.target, source:'scanner'},
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
      companyName:snapshot.companyName,
      exchange:snapshot.exchange,
      marketStatus:sandbox.state.marketStatus
    },
    marketData,
    setup:{marketCaution:false},
    review:{},
    plan:{
      entry:tradePlan.entry,
      stop:tradePlan.stop,
      firstTarget:tradePlan.target,
      hasValidPlan:displayedPlan.status === 'valid',
      plannedRR:displayedPlan.rewardRisk && displayedPlan.rewardRisk.rrRatio
    },
    scan:{
      estimatedRR:tradePlan.rr,
      flags:{checks},
      analysisProjection:{
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
    effectivePlan:{entry:tradePlan.entry, stop:tradePlan.stop, firstTarget:tradePlan.target},
    displayedPlan,
    planRealism,
    resolvedContract,
    setupScore
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
  if(globalVerdict.entry_gate_pass !== true){
    (globalVerdict.entry_gate_reasons || []).forEach(push);
  }
  if(globalVerdict.near_entry_gate_pass !== true){
    (globalVerdict.near_entry_gate_reasons || []).forEach(push);
  }
  push(globalVerdict.downgrade_reason);
  push(globalVerdict.main_blocker);
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

function derivedStateValue(derivedStates, camelKey, snakeKey){
  const source = derivedStates && typeof derivedStates === 'object' ? derivedStates : {};
  const camelValue = source[camelKey];
  if(camelValue !== undefined && camelValue !== null && String(camelValue).trim() !== '') return camelValue;
  const snakeValue = source[snakeKey];
  if(snakeValue !== undefined && snakeValue !== null && String(snakeValue).trim() !== '') return snakeValue;
  return '';
}

function printTickerReport(result){
  const {ticker, snapshot, shortlist, replay} = result;
  const mismatch = shortlist.verdict !== replay.canonicalVerdictLabel;
  const mismatchLabel = mismatch ? `MISMATCH shortlist=${shortlist.verdict} resolver=${replay.canonicalVerdictLabel}/${replay.visualBucket}` : 'MATCH';
  const lines = [
    '',
    `${ticker} | ${mismatchLabel}`,
    `  price/ma: price ${fmtPrice(snapshot.price)} | 20MA ${fmtPrice(snapshot.sma20)} | 50MA ${fmtPrice(snapshot.sma50)} | 200MA ${fmtPrice(snapshot.sma200)}`,
    `  distances: 20MA ${fmtPct(pctDistance(snapshot.price, snapshot.sma20))} | 50MA ${fmtPct(pctDistance(snapshot.price, snapshot.sma50))}`,
    `  tape: RSI ${safeNumber(snapshot.rsi14, 2) ?? 'n/a'} | volume ratio ${safeNumber((numericOrNull(snapshot.volume) && numericOrNull(snapshot.avgVolume30d)) ? numericOrNull(snapshot.volume) / numericOrNull(snapshot.avgVolume30d) : null, 2) ?? 'n/a'}`,
    `  shortlist: ${shortlist.verdict} | score ${shortlist.score}`,
    `  resolver: canonical ${replay.canonicalVerdictLabel} | bucket ${replay.visualBucket} | setup score ${replay.setupScore}`,
    `  states: structure ${replay.structureState} | eligibility ${replay.structureEligibility} | bounce ${replay.bounceState} | stabilisation ${replay.stabilisationState} | priceability ${replay.priceabilityState}`,
    `  target profile: first ${fmtPrice(replay.realisticTarget)} | extended ${Number.isFinite(numericOrNull(replay.extendedTarget)) ? `${fmtPrice(replay.extendedTarget)} (context only)` : 'n/a'} | firstRR ${fmtRatio(replay.realisticRr)} | stretch ${fmtPct(replay.targetStretchPct, 1)}`,
    `  target cap: ${replay.targetCapReason || 'n/a'}`,
    `  blockers: ${(replay.blockers.length ? replay.blockers.join(' | ') : 'none')}`,
    `  diminishing: ${replay.watchToDiminishingReason || 'n/a'}`
  ];
  console.log(lines.join('\n'));
}

async function main(){
  const args = process.argv.slice(2);
  const snapshotFlagIndex = args.findIndex(arg => arg === '--snapshot');
  const snapshotPath = snapshotFlagIndex >= 0 ? args[snapshotFlagIndex + 1] : '';
  const providerArg = args.find(arg => arg.startsWith('--provider='));
  const requestedProvider = normalizeProviderId((providerArg && providerArg.split('=')[1]) || 'fmp');
  const tickerArgs = args.filter((arg, index) => {
    if(arg.startsWith('--provider=')) return false;
    if(arg === '--snapshot') return false;
    if(snapshotFlagIndex >= 0 && index === snapshotFlagIndex + 1) return false;
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
      const {snapshot} = await fetchSnapshot(adapter, providerConfig, ticker);
      snapshots.push(normalizeSnapshotInput(snapshot, ticker));
    }
  }

  const results = snapshots.map(snapshot => {
    const shortlist = classifyShortlistCandidate(snapshot);
    const replayBase = buildReplayRecord(snapshot, sandbox);
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
    const visualState = sandbox.window.ResolverPresentation.resolveVisualState(replayBase.record, 'scanner', {
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
    return {
      ticker:snapshot.ticker,
      snapshot,
      shortlist,
      replay:{
        canonicalVerdict:globalVerdict.final_verdict,
        canonicalVerdictLabel:sandbox.window.ResolverCore.globalVerdictLabel(globalVerdict.final_verdict),
        visualBucket:visualState.visualBucket,
        structureState:derivedStateValue(replayBase.record.derivedStates, 'structureState', 'structure_state'),
        structureEligibility:globalVerdict.structure_eligibility || visualState.structureEligibility || 'unknown',
        bounceState:derivedStateValue(replayBase.record.derivedStates, 'bounceState', 'bounce_state'),
        stabilisationState:derivedStateValue(replayBase.record.derivedStates, 'stabilisationState', 'stabilisation_state'),
        priceabilityState:derivedStateValue(replayBase.record.derivedStates, 'priceabilityState', 'priceability_state'),
        setupScore:replayBase.record.setupScore,
        realisticTarget:replayBase.record.planRealism.realistic_target,
        extendedTarget:replayBase.record.planRealism.extended_target,
        realisticRr:replayBase.record.planRealism.realistic_rr,
        targetStretchPct:replayBase.record.planRealism.target_stretch_pct,
        targetCapReason:replayBase.record.planRealism.target_cap_reason,
        blockers:promotionBlockers(globalVerdict, replayBase.record.derivedStates),
        watchToDiminishingReason:visualState.weakWatchDiminishingReason || scannerResolution.remapReason || ''
      }
    };
  });

  console.log(JSON.stringify({
    ok:true,
    requestedAt:new Date().toISOString(),
    source:snapshotPath ? 'snapshot_file' : 'live_provider',
    provider:snapshotPath ? null : requestedProvider,
    tickers:results.map(result => result.ticker),
    results:results.map(result => ({
      ticker:result.ticker,
      shortlistVerdict:result.shortlist.verdict,
      resolverVerdict:result.replay.canonicalVerdict,
      visualBucket:result.replay.visualBucket,
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
      watchToDiminishingReason:result.replay.watchToDiminishingReason
    }))
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
