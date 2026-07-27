const fs = require('fs');
const os = require('os');
const path = require('path');
const {spawnSync} = require('child_process');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const sandbox = {
  window: {},
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

function runBrowserModule(relativePath){
  const filePath = path.join(root, relativePath);
  const source = fs.readFileSync(filePath, 'utf8');
  vm.runInNewContext(source, sandbox, {filename:filePath});
}

runBrowserModule('js/bounce-priceability.js');
runBrowserModule('js/plan-math.js');
runBrowserModule('js/tradeability.js');
runBrowserModule('js/scanner-universe-policy.js');
runBrowserModule('js/setup-basis-policy.js');
runBrowserModule('js/resolver-core.js');
runBrowserModule('js/resolver-presentation.js');
runBrowserModule('js/domain/canonical-decision-result.js');
runBrowserModule('js/domain/simplified-plan-state.js');
runBrowserModule('js/presentation/simplified-presentation-model.js');
runBrowserModule('js/domain/simplified-trade-state.js');
runBrowserModule('js/scanner-view.js');
runBrowserModule('js/scanner-card-shell.js');
runBrowserModule('js/scanner-results-support.js');
runBrowserModule('js/scanner-debug.js');
runBrowserModule('js/services/tracked-state-service.js');

const resolverCore = sandbox.window.ResolverCore;
const resolverPresentation = sandbox.window.ResolverPresentation;
if(!resolverCore || typeof resolverCore.runTradeReadinessGateAssertions !== 'function'){
  throw new Error('Resolver gate assertion harness is unavailable.');
}

const results = resolverCore.runTradeReadinessGateAssertions();
const failures = results.filter(result => !result.pass);

if(failures.length){
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
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

function runScanPresentationAssertions(){
  const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const scannerView = sandbox.window.ScannerView;
  const scannerResultsSupport = sandbox.window.ScannerResultsSupport;
  if(!scannerView || typeof scannerView.scanPresentationForView !== 'function'){
    throw new Error('Scanner presentation helper is unavailable.');
  }
  if(!scannerResultsSupport || typeof scannerResultsSupport.scannerResultSections !== 'function'){
    throw new Error('Scanner result section helper is unavailable.');
  }
  const deps = {
    normalizeGlobalVerdictKey(value){
      const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
      if(safe === 'nearentry') return 'near_entry';
      if(['entry','near_entry','watch','avoid'].includes(safe)) return safe;
      return safe || 'watch';
    },
    globalVerdictLabel(value){
      const safe = String(value || '').trim().toLowerCase();
      if(safe === 'entry') return 'Entry';
      if(safe === 'near_entry') return 'Near Entry';
      if(safe === 'avoid') return 'Avoid';
      return 'Watch';
    },
    getBucket(value){
      const safe = String(value || '').trim().toLowerCase();
      if(safe === 'entry') return 'entry';
      if(safe === 'near_entry') return 'near_entry';
      if(safe === 'avoid') return 'avoid';
      return 'monitor';
    },
    analysisDerivedStatesFromRecord(record){
      return record && record.derivedStates || {};
    }
  };
  const makeView = (ticker, simplifiedState, setupStates, extra = {}) => ({
    ticker,
    item:{ticker, derivedStates:setupStates},
    simplifiedState,
    setupStates,
    setupScore:extra.setupScore == null ? 6 : extra.setupScore,
    rrValue:extra.rrValue == null ? 0 : extra.rrValue,
    reasonCodes:extra.reasonCodes || []
  });
  const constructive = makeView('EW', {
    canonicalVerdict:'watch',
    visualBucket:'monitor',
    tone:'monitor',
    mainBlocker:'Needs confirmation before promotion.'
  }, {
    structureState:'strong',
    bounceState:'attempt',
    pullbackState:'near_50ma'
  }, {setupScore:8});
  constructive.scanPresentation = scannerView.scanPresentationForView(constructive, deps);
  if(constructive.scanPresentation.scanSection !== 'monitor_watch' || constructive.scanPresentation.tone !== 'monitor'){
    throw new Error('Constructive Watch with bounce attempt must remain in Monitor / Watch.');
  }

  const weakNoBounce = makeView('QSR', {
    canonicalVerdict:'watch',
    visualBucket:'monitor',
    tone:'monitor',
    mainBlocker:'Trend is weakening - no reliable stop level yet.'
  }, {
    structureState:'weak',
    bounceState:'none',
    pullbackState:'near_50ma',
    priceabilityState:'unpriceable'
  }, {setupScore:4});
  weakNoBounce.scanPresentation = scannerView.scanPresentationForView(weakNoBounce, deps);
  if(weakNoBounce.scanPresentation.scanSection !== 'monitor_diminishing' || weakNoBounce.scanPresentation.tone !== 'diminishing'){
    throw new Error('Weak/no-bounce Watch must render as Monitor / Diminishing, not Monitor / Watch.');
  }
  if(/needs confirmation before promotion/i.test(weakNoBounce.scanPresentation.summary || '')){
    throw new Error('Diminishing scan card must not use generic confirmation-promotion copy.');
  }

  const alive50MaSupportTest = makeView('HWM', {
    canonicalVerdict:'watch',
    visualBucket:'diminishing',
    tone:'diminishing',
    mainBlocker:'Trend is weakening - no reliable stop level yet.'
  }, {
    structureState:'intact',
    structureEligibility:'alive',
    bounceState:'none',
    pullbackZone:'near_50ma',
    priceabilityState:'unpriceable'
  }, {setupScore:6});
  alive50MaSupportTest.item.watchlist = {
    debug:{
      structural_alive_at_refresh:'true',
      refresh_demote_reason:'Structurally alive; keep on monitor.'
    }
  };
  alive50MaSupportTest.simplifiedState.debug = {
    resolvedState:{
      final_verdict:'watch',
      pullback_ok:true,
      structural_alive_at_refresh:'true',
      refresh_demote_reason:'Structurally alive; keep on monitor.'
    }
  };
  alive50MaSupportTest.scanPresentation = scannerView.scanPresentationForView(alive50MaSupportTest, deps);
  if(alive50MaSupportTest.scanPresentation.scanSection !== 'monitor_watch'
    || alive50MaSupportTest.scanPresentation.presentationBucket !== 'monitor'
    || alive50MaSupportTest.scanPresentation.tone !== 'monitor'){
    throw new Error('Accepted alive 50MA support tests must render as Monitor / Watch in Scan, not Monitor / Diminishing.');
  }

  const avoid = makeView('ABNB', {
    canonicalVerdict:'avoid',
    visualBucket:'avoid',
    tone:'avoid',
    mainBlocker:'Structure is broken.'
  }, {
    structureState:'broken',
    bounceState:'none',
    pullbackState:'none'
  }, {setupScore:1});
  avoid.scanPresentation = scannerView.scanPresentationForView(avoid, deps);
  if(avoid.scanPresentation.scanSection !== 'avoid' || avoid.scanPresentation.badgeLabel !== 'Avoid' || avoid.scanPresentation.tone !== 'avoid'){
    throw new Error('Avoid scan card must render as red Avoid in the bottom section.');
  }

  const lowPriorityWatch = makeView('AA', {
    canonicalVerdict:'watch',
    visualBucket:'monitor',
    tone:'monitor',
    mainBlocker:'Needs confirmation before promotion.'
  }, {
    structureState:'developing_loose',
    bounceState:'none',
    pullbackState:'near_20ma',
    priceabilityState:'unpriceable'
  }, {
    setupScore:2,
    rrValue:0.42,
    reasonCodes:['bounce_not_confirmed', 'score_below_watch_floor']
  });
  lowPriorityWatch.simplifiedState.debug = {
    resolvedState:{
      setup_score:2,
      planStateKey:'missing',
      tradeabilityLabel:'not_ready',
      near_entry_gate_checks:{
        below_50_without_reclaim:true,
        reclaim_signal_count:0,
        has_clear_invalidation_level:false,
        resolved_rr:0.42
      }
    }
  };
  lowPriorityWatch.scanPresentation = scannerView.scanPresentationForView(lowPriorityWatch, deps);
  if(lowPriorityWatch.scanPresentation.scanSection !== 'monitor_diminishing'){
    throw new Error('AA-style failed reclaim Watch must not be grouped with constructive Watch candidates.');
  }
  if(/needs confirmation before promotion/i.test(lowPriorityWatch.scanPresentation.summary || '')){
    throw new Error('AA-style failed reclaim Watch must replace generic promotion copy.');
  }
  if(lowPriorityWatch.scanPresentation.presentationBucket !== 'diminishing' || lowPriorityWatch.scanPresentation.tone !== 'diminishing'){
    throw new Error('AA-style failed reclaim Watch must render with diminishing, not yellow constructive Watch, tone.');
  }
  if(lowPriorityWatch.scanPresentation.failedReclaimEvidence !== true || lowPriorityWatch.scanPresentation.blockedByBelow50NoReclaim !== true){
    throw new Error('AA-style failed reclaim evidence must be reflected in scan presentation diagnostics.');
  }

  const zeroEvidenceWatch = makeView('ZERO', {
    canonicalVerdict:'watch',
    visualBucket:'monitor',
    tone:'monitor',
    mainBlocker:'Needs confirmation before promotion.'
  }, {
    structureState:'developing_loose',
    bounceState:'none',
    pullbackState:'near_20ma',
    priceabilityState:'unpriceable'
  }, {
    setupScore:9,
    rrValue:3,
    reasonCodes:['score_below_watch_floor']
  });
  zeroEvidenceWatch.simplifiedState.setupScore = 0;
  zeroEvidenceWatch.simplifiedState.debug = {
    resolvedState:{
      setup_score:9,
      planStateKey:'missing',
      tradeabilityLabel:'not_ready',
      resolvedRR:0,
      near_entry_gate_checks:{
        below_50_without_reclaim:true,
        reclaim_signal_count:0,
        has_clear_invalidation_level:false,
        resolved_rr:1
      },
      entry_gate_checks:{
        reclaim_signal_count:2,
        resolved_rr:2
      }
    }
  };
  zeroEvidenceWatch.scanPresentation = scannerView.scanPresentationForView(zeroEvidenceWatch, deps);
  if(zeroEvidenceWatch.scanPresentation.resolvedRR !== 0){
    throw new Error('Scan presentation must preserve resolved_rr: 0 instead of falling through to stale fallback RR.');
  }
  if(zeroEvidenceWatch.scanPresentation.reclaimSignalCount !== 0){
    throw new Error('Scan presentation must preserve explicit reclaim_signal_count: 0 instead of stale fallback counts.');
  }
  if(zeroEvidenceWatch.scanPresentation.failedReclaimEvidence !== true){
    throw new Error('setupScore: 0 and resolved_rr: 0 must still trigger failed-reclaim presentation evidence.');
  }

  const sections = scannerResultsSupport.scannerResultSections([
    avoid,
    weakNoBounce,
    constructive,
    lowPriorityWatch
  ], {
    rankedVisibleSectionForView(view){
      return view.scanPresentation.scanSection;
    },
    state:{marketStatus:'S&P above 50 MA'},
    escapeHtml(value){ return String(value || ''); }
  });
  const populatedKeys = sections.filter(section => section.items.length).map(section => section.key);
  const expectedOrder = ['monitor-watch','monitor-diminishing','avoid'];
  if(JSON.stringify(populatedKeys) !== JSON.stringify(expectedOrder)){
    throw new Error(`Scan sections must order constructive Watch, diminishing Watch, then Avoid. Got ${populatedKeys.join(', ')}`);
  }
}

runScanPresentationAssertions();

function runScannerTargetObservabilityAssertions(){
  const scannerDebug = sandbox.window.ScannerDebug;
  if(!scannerDebug || typeof scannerDebug.resolveScannerStateWithTrace !== 'function'){
    throw new Error('Scanner debug helper is unavailable.');
  }
  const item = {
    ticker:'OBS',
    marketData:{price:100.9, ma20:100.1, ma50:98.7, ma200:92, rsi:54},
    scan:{setupOrigin:'scanner', scanType:'20MA'},
    setup:{marketCaution:false},
    plan:{firstTargetTooClose:true},
    meta:{companyName:'Observability Inc', exchange:'NASDAQ'}
  };
  const baseView = {
    item,
    displayedPlan:{tradeability:'watch'},
    setupUiState:{state:'developing'},
    planUiState:{state:'needs_adjustment', label:'Needs adjustment', capitalFitLabel:'Acceptable'},
    displayStage:'Watch',
    warningState:null,
    setupScore:5,
    positionSize:10,
    rrValue:1.2
  };
  const derivedStates = {
    structureState:'intact',
    pullbackZone:'near_20ma',
    stabilisationState:'early',
    bounceState:'attempt',
    volumeState:'neutral'
  };
  const deps = {
    normalizeTickerRecord(record){ return record; },
    evaluatePlanRealism(){
      return {
        rr_realism_label:'Optimistic',
        credible_target_assessment:'Target is beyond nearby resistance.',
        optimistic_target_flag:true,
        nearest_resistance:102.4,
        realistic_target:102.4,
        extended_target:105.8,
        realistic_rr:1.2,
        target_stretch_pct:0.074,
        target_cap_reason:'First target capped at nearest real resistance; farther resistance stays context only.'
      };
    },
    numericOrNull(value){
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    },
    fmtPrice(value){ return Number(value).toFixed(2); },
    normalizeScanType(value){ return String(value || 'unknown'); },
    currentSetupType(){ return '20MA'; },
    resolveEmojiPresentation(){ return {}; },
    resolveGlobalVerdict(){
      return {
        base_verdict:'watch',
        final_verdict:'watch',
        bucket:'monitor',
        tone:'monitor',
        badge:{text:'Watch'},
        entry_gate_pass:false,
        near_entry_gate_pass:false,
        rr_known:true,
        resolvedRR:1.2,
        structure_state:'intact',
        bounce_state:'attempt',
        market_regime:'supportive',
        lifecycle:'watchlist',
        allow_plan:true
      };
    },
    normalizeGlobalVerdictKey(value){
      const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
      if(safe === 'nearentry') return 'near_entry';
      return safe || 'watch';
    },
    normalizeVerdict(value){ return String(value || '').trim().toLowerCase(); },
    globalVerdictLabel(value){
      const safe = String(value || '').trim().toLowerCase();
      if(safe === 'near_entry') return 'Near Entry';
      if(safe === 'avoid') return 'Avoid';
      return 'Watch';
    },
    getBucket(value){
      const safe = String(value || '').trim().toLowerCase();
      if(safe === 'avoid') return 'avoid';
      if(safe === 'near_entry') return 'near_entry';
      return 'monitor';
    },
    normalizeAnalysisVerdict(value){ return String(value || 'Watch'); },
    getActions(){ return {label:'Wait', detail:'No promotion'}; },
    escapeHtml(value){ return String(value || ''); }
  };
  const resolution = scannerDebug.resolveScannerStateWithTrace(item, {
    baseView,
    derivedStates,
    rrCategory:'stretched',
    structureQuality:'developing_clean'
  }, deps);
  if(!resolution.targetProfile || Number(resolution.targetProfile.realisticTarget) !== 102.4 || Number(resolution.targetProfile.extendedTarget) !== 105.8){
    throw new Error('Scanner debug resolution must expose first-target and extended-target context separately.');
  }
  if(!(Number(resolution.targetProfile.realisticRr) < 1.5)){
    throw new Error('Scanner debug resolution must preserve weak first-target RR when nearer resistance is too close.');
  }
  const markup = scannerDebug.renderScannerDecisionTraceContent({
    item,
    scannerResolution:resolution,
    planUiState:baseView.planUiState
  }, {
    ...deps,
    resolveVisualState(){ return null; }
  });
  if(!/First Realistic Target/.test(markup) || !/Extended Target/.test(markup) || !/context only/.test(markup) || !/Target Cap Reason/.test(markup)){
    throw new Error('Scanner debug rendering must show first-target vs extended-target context explicitly.');
  }
  const weakFirstTargetPromotion = resolverCore.canPromoteToNearEntry({
    structure_state:'intact',
    trend_state:'uptrend',
    bounce_state:'attempt',
    stabilisation_state:'early',
    pullback_zone:'near_20ma',
    market_regime:'supportive',
    volume_state:'normal',
    plan_visible:true,
    plan_status:'valid',
    plan_blocked:false,
    has_entry:true,
    has_stop:true,
    entry:100,
    stop:98,
    target:102.4,
    rr:1.2,
    credible_rr:1.2,
    tradeability:'watch',
    pullback_valid:true,
    entry_trigger_hit:false,
    stop_distance_too_wide:false,
    capital_fit:'acceptable',
    affordability:'affordable',
    price_above_50ma:true,
    price_above_200ma:true,
    ma50_above_200ma:true,
    reclaims_level:true,
    candle_evidence_reclaim_range_meaningful:true,
    candle_evidence_reclaimed_prior_day_high:true,
    terminal_avoid_applied:false
  });
  if(weakFirstTargetPromotion.pass === true){
    throw new Error('Farther extended target context must not allow Near Entry promotion when first-target RR remains weak.');
  }
}

runScannerTargetObservabilityAssertions();

function extractFunctionSource(source, functionName){
  const start = source.indexOf(`function ${functionName}`);
  if(start < 0) throw new Error(`Unable to find ${functionName} in app.js.`);
  const paramsStart = source.indexOf('(', start);
  let paramDepth = 0;
  let paramsEnd = -1;
  for(let index = paramsStart; index < source.length; index += 1){
    const char = source[index];
    if(char === '(') paramDepth += 1;
    else if(char === ')'){
      paramDepth -= 1;
      if(paramDepth === 0){
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

function runTrackedStateTesterIsolationAssertions(){
  const trackedStorePath = path.join(root, 'netlify/functions/lib/tracked-store.js');
  const trackedStateHandlerPath = path.join(root, 'netlify/functions/tracked-state.js');
  const trackedServiceSource = fs.readFileSync(path.join(root, 'js/services/tracked-state-service.js'), 'utf8');
  const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const Module = require('module');
  const originalLoad = Module._load;
  const storeData = new Map();
  const fakeStore = {
    async getJSON(key){
      return storeData.has(key) ? JSON.parse(JSON.stringify(storeData.get(key))) : null;
    },
    async setJSON(key, value){
      storeData.set(key, JSON.parse(JSON.stringify(value)));
    }
  };
  delete require.cache[trackedStorePath];
  delete require.cache[trackedStateHandlerPath];
  Module._load = function patchedLoad(request, parent, isMain){
    if(request === '@netlify/blobs'){
      return {
        getStore(){
          return fakeStore;
        }
      };
    }
    return originalLoad.apply(this, arguments);
  };
  let trackedStore;
  let trackedStateHandler;
  try{
    trackedStore = require(trackedStorePath);
    trackedStateHandler = require(trackedStateHandlerPath);
  }finally{
    Module._load = originalLoad;
  }

  if(trackedStore.validateTesterId('bad/escape') !== false){
    throw new Error('Tracked-store testerId validation must reject unsafe path characters.');
  }
  if(trackedStore.validateTesterId('1234') !== false){
    throw new Error('Tracked-store testerId validation must reject too-short tester IDs.');
  }
  const testerA = '11111111-1111-4111-8111-111111111111';
  const testerB = '22222222-2222-4222-8222-222222222222';
  if(trackedStore.trackedRecordsKey(testerA) !== `tracked-records/${testerA}`){
    throw new Error('Tracked-store must namespace records by testerId.');
  }

  return (async () => {
    await trackedStore.saveTrackedState(testerA, {
      updatedAt:'',
      settings:{marketStatus:'A'},
      records:{AAPL:{ticker:'AAPL', meta:{updatedAt:'2026-06-23T12:00:00.000Z'}}}
    });
    await trackedStore.saveTrackedState(testerB, {
      updatedAt:'',
      settings:{marketStatus:'B'},
      records:{MSFT:{ticker:'MSFT', meta:{updatedAt:'2026-06-23T12:01:00.000Z'}}}
    });
    const testerAState = await trackedStore.loadTrackedState(testerA);
    const testerBState = await trackedStore.loadTrackedState(testerB);
    if(!testerAState.records.AAPL || testerAState.records.MSFT){
      throw new Error('Different testerIds must not share tracked-state records.');
    }
    if(!testerBState.records.MSFT || testerBState.records.AAPL){
      throw new Error('Tracked-state reload must stay isolated per testerId.');
    }

    const missingTesterResponse = await trackedStateHandler.handler({
      httpMethod:'GET',
      headers:{origin:'http://localhost:8888'}
    });
    if(missingTesterResponse.statusCode !== 400){
      throw new Error('Tracked-state handler must reject missing testerId.');
    }
    const invalidTesterResponse = await trackedStateHandler.handler({
      httpMethod:'GET',
      headers:{
        origin:'http://localhost:8888',
        'x-pullback-tester-id':'../escape'
      }
    });
    if(invalidTesterResponse.statusCode !== 400){
      throw new Error('Tracked-state handler must reject invalid testerId.');
    }

    const createTrackedStateService = sandbox.window.TrackedStateService && sandbox.window.TrackedStateService.createTrackedStateService;
    if(typeof createTrackedStateService !== 'function'){
      throw new Error('Tracked-state service factory is unavailable.');
    }
    const fetchCalls = [];
    const serviceState = {
      tickerRecords:{},
      backendTrackedVersions:{},
      backendLocalTrackedTickers:[],
      riskPercent:1,
      maxLossOverride:'',
      wholeSharesOnly:true,
      marketStatus:'S&P above 50 MA',
      dataProvider:'fmp',
      apiPlan:'free'
    };
    const service = createTrackedStateService({
      state:serviceState,
      defaultTrackedStateEndpoint:'/api/tracked-state',
      DEFAULT_API_PLAN:'free',
      currentTesterId:() => testerA,
      normalizeTicker(value){ return String(value || '').trim().toUpperCase(); },
      normalizeTickerRecord(record){ return record; },
      normalizeTickerRecordsMap(map){ return map && typeof map === 'object' ? map : {}; },
      uniqueTickers(values){ return Array.from(new Set(Array.isArray(values) ? values : [])); },
      currentAccountSizeGbp(){ return 4000; },
      numericOrNull(value){
        if(value === null || value === undefined || value === '') return null;
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : null;
      },
      normalizeDataProvider(value){ return String(value || ''); },
      trackedStatePersistSignature(payload){ return JSON.stringify(payload); },
      async fetchJsonWithTimeout(url, options){
        fetchCalls.push({url, options});
        return {
          ok:true,
          status:200,
          async json(){
            return {
              ok:true,
              trackedState:{
                updatedAt:'',
                settings:{},
                records:{}
              }
            };
          }
        };
      },
      persistState(){},
      logDebug(){},
      logDebugWarn(){},
      getTickerRecord(){ return null; },
      syncLegacyCollectionsFromTickerRecords(){},
      renderScannerResults(){},
      renderWatchlist(){},
      renderFocusQueue(){},
      renderReviewWorkspace(){},
      isTrackRefreshInFlight(){ return false; },
      isPersistBurstActive(){ return false; }
    });
    await service.pullTrackedRecordsFromBackend({force:true});
    const headerValue = fetchCalls[0] && fetchCalls[0].options && fetchCalls[0].options.headers
      ? fetchCalls[0].options.headers['X-Pullback-Tester-Id']
      : '';
    if(headerValue !== testerA){
      throw new Error('Tracked-state service must send testerId on backend calls.');
    }
    service.requestTrackedStatePersist({force:true, reason:'tester_id_consistency_check'});
    await new Promise(resolve => setTimeout(resolve, 20));
    const pushHeaderValue = fetchCalls[1] && fetchCalls[1].options && fetchCalls[1].options.headers
      ? fetchCalls[1].options.headers['X-Pullback-Tester-Id']
      : '';
    if(pushHeaderValue !== testerA || pushHeaderValue !== headerValue){
      throw new Error('Tracked-state pull and push must use the same testerId within a session.');
    }

    if(/paperTradeApiKey\s*:\s*baseState\.paperTradeApiKey/.test(trackedServiceSource) || /paperTradeApiSecret\s*:\s*baseState\.paperTradeApiSecret/.test(trackedServiceSource)){
      throw new Error('Tracked-state service payload must not include Trading 212 paper credentials.');
    }
    if(!/function currentTesterId\(/.test(appSource) || !/pullbackPlaybookTesterIdV1/.test(appSource)){
      throw new Error('App must generate and persist a local anonymous testerId.');
    }

    const testerHelperSandbox = {
      crypto:{randomUUID:() => '33333333-3333-4333-8333-333333333333'},
      Math,
      localStorage:{
        storage:new Map([[ 'pullbackPlaybookTesterIdV1', testerA ]]),
        getItem(key){
          return this.storage.has(key) ? this.storage.get(key) : null;
        },
        setItem(key, value){
          this.storage.set(key, String(value));
        }
      }
    };
    vm.createContext(testerHelperSandbox);
    vm.runInContext(`
      const testerIdStorageKey = 'pullbackPlaybookTesterIdV1';
      const testerIdPattern = /^[a-f0-9-]{16,64}$/;
      let memoizedTesterId = null;
      ${extractFunctionSource(appSource, 'fallbackRandomTesterId')}
      ${extractFunctionSource(appSource, 'generateAnonymousTesterId')}
      ${extractFunctionSource(appSource, 'validTesterId')}
      ${extractFunctionSource(appSource, 'currentTesterId')}
    `, testerHelperSandbox, {filename:'app.js#testerIdHelpers'});
    if(vm.runInContext('currentTesterId()', testerHelperSandbox) !== testerA){
      throw new Error('Valid stored testerId must be reused.');
    }
    testerHelperSandbox.localStorage.storage.set('pullbackPlaybookTesterIdV1', '../tampered');
    vm.runInContext('memoizedTesterId = null;', testerHelperSandbox);
    const replacedTesterId = vm.runInContext('currentTesterId()', testerHelperSandbox);
    if(replacedTesterId === '../tampered' || !/^[a-f0-9-]{16,64}$/.test(replacedTesterId)){
      throw new Error('Invalid stored testerId must be replaced with a new valid testerId.');
    }
    if(testerHelperSandbox.localStorage.storage.get('pullbackPlaybookTesterIdV1') !== replacedTesterId){
      throw new Error('Replacement testerId must be written back to localStorage when available.');
    }

    const storageFailureSandbox = {
      crypto:{randomUUID:() => '44444444-4444-4444-8444-444444444444'},
      Math,
      localStorage:{
        getItem(){
          throw new Error('storage unavailable');
        },
        setItem(){
          throw new Error('storage unavailable');
        }
      }
    };
    vm.createContext(storageFailureSandbox);
    vm.runInContext(`
      const testerIdStorageKey = 'pullbackPlaybookTesterIdV1';
      const testerIdPattern = /^[a-f0-9-]{16,64}$/;
      let memoizedTesterId = null;
      ${extractFunctionSource(appSource, 'fallbackRandomTesterId')}
      ${extractFunctionSource(appSource, 'generateAnonymousTesterId')}
      ${extractFunctionSource(appSource, 'validTesterId')}
      ${extractFunctionSource(appSource, 'currentTesterId')}
    `, storageFailureSandbox, {filename:'app.js#testerIdHelpersStorageFailure'});
    const storageFailureFirst = vm.runInContext('currentTesterId()', storageFailureSandbox);
    const storageFailureSecond = vm.runInContext('currentTesterId()', storageFailureSandbox);
    if(storageFailureFirst !== storageFailureSecond){
      throw new Error('localStorage-unavailable sessions must reuse the same memoized testerId.');
    }
  })();
}

function runTesterReportAssertions(){
  const testerReportPath = path.join(root, 'netlify/functions/tester-report.js');
  const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const scannerDebugSource = fs.readFileSync(path.join(root, 'js/scanner-debug.js'), 'utf8');
  const Module = require('module');
  const originalLoad = Module._load;
  const storeData = new Map();
  delete require.cache[testerReportPath];
  Module._load = function patchedLoad(request, parent, isMain){
    if(request === '@netlify/blobs'){
      return {
        getStore(){
          return {
            async getJSON(key){
              return storeData.has(key) ? JSON.parse(JSON.stringify(storeData.get(key))) : null;
            },
            async setJSON(key, value){
              storeData.set(key, JSON.parse(JSON.stringify(value)));
            },
            async list(options = {}){
              const prefix = String(options.prefix || '');
              const limit = Number(options.limit) || 20;
              return [...storeData.keys()]
                .filter(key => key.startsWith(prefix))
                .slice(0, limit)
                .map(key => ({
                  key,
                  modified:String(storeData.get(key) && storeData.get(key).receivedAt || '')
                }));
            }
          };
        }
      };
    }
    return originalLoad.apply(this, arguments);
  };
  let testerReport;
  try{
    testerReport = require(testerReportPath);
  }finally{
    Module._load = originalLoad;
  }
  if(typeof testerReport.manualBlobsClientOptions !== 'function'){
    throw new Error('Tester report endpoint must expose the manual Netlify Blobs bootstrap helper.');
  }

  return (async () => {
    const testerA = '11111111-1111-4111-8111-111111111111';
    const testerB = '22222222-2222-4222-8222-222222222222';
    const eventFor = (testerId, body) => ({
      httpMethod:'POST',
      headers:{
        origin:'http://localhost:8888',
        'x-pullback-tester-id':testerId
      },
      body:JSON.stringify(body)
    });
    const successA = await testerReport.handler(eventFor(testerA, {
      category:'UI problem',
      notes:'Button did nothing.',
      snapshot:{
        ticker:'AAPL',
        buildVersion:'v-test',
        paperTradeApiKey:'should-not-leak',
        nested:{Authorization:'Basic abc', paperTradeApiSecret:'should-not-leak'}
      }
    }));
    if(successA.statusCode !== 200){
      throw new Error('Tester report endpoint must accept a valid tester-scoped report.');
    }
    const successB = await testerReport.handler(eventFor(testerB, {
      category:'Bad verdict',
      notes:'Resolver demoted a valid setup.',
      snapshot:{ticker:'MSFT', buildVersion:'v-test'}
    }));
    if(successB.statusCode !== 200){
      throw new Error('Tester report endpoint must store reports for a second tester.');
    }
    const storedKeys = [...storeData.keys()];
    if(!storedKeys.some(key => key.startsWith(`tester-reports/${testerA}/`)) || !storedKeys.some(key => key.startsWith(`tester-reports/${testerB}/`))){
      throw new Error('Tester reports must be namespaced by testerId.');
    }
    const storedA = storeData.get(storedKeys.find(key => key.startsWith(`tester-reports/${testerA}/`)));
    if(storedA.snapshot.paperTradeApiKey !== '[REDACTED]' || storedA.snapshot.nested.paperTradeApiSecret !== '[REDACTED]' || storedA.snapshot.nested.Authorization !== '[REDACTED]'){
      throw new Error('Tester report endpoint must redact credential-like fields server-side.');
    }
    const listedForbidden = await testerReport.handler({
      httpMethod:'GET',
      headers:{origin:'http://localhost:8888'},
      queryStringParameters:{mode:'list', limit:'10'}
    });
    if(listedForbidden.statusCode !== 403){
      throw new Error('Tester report endpoint must reject list mode without admin token.');
    }
    process.env.TESTER_REPORT_ADMIN_TOKEN = 'admin-secret';
    const listed = await testerReport.handler({
      httpMethod:'GET',
      headers:{origin:'http://localhost:8888', 'x-admin-token':'admin-secret'},
      queryStringParameters:{mode:'list', limit:'10'}
    });
    const listedBody = JSON.parse(String(listed.body || '{}'));
    if(listed.statusCode !== 200 || !listedBody.ok || !Array.isArray(listedBody.reports) || listedBody.reports.length < 2){
      throw new Error('Tester report endpoint must support admin triage list mode only with admin token.');
    }
    const readKey = storedKeys[0];
    const readForbidden = await testerReport.handler({
      httpMethod:'GET',
      headers:{origin:'http://localhost:8888'},
      queryStringParameters:{mode:'read', key:readKey}
    });
    if(readForbidden.statusCode !== 403){
      throw new Error('Tester report endpoint must reject read mode without admin token.');
    }
    const readResponse = await testerReport.handler({
      httpMethod:'GET',
      headers:{origin:'http://localhost:8888', 'x-admin-token':'admin-secret'},
      queryStringParameters:{mode:'read', key:readKey}
    });
    const readBody = JSON.parse(String(readResponse.body || '{}'));
    if(readResponse.statusCode !== 200 || !readBody.ok || !readBody.report){
      throw new Error('Tester report endpoint must support admin triage read mode only with admin token.');
    }
    const missingTester = await testerReport.handler({
      httpMethod:'POST',
      headers:{origin:'http://localhost:8888'},
      body:JSON.stringify({category:'Other', notes:'Missing tester', snapshot:{}})
    });
    if(missingTester.statusCode !== 400){
      throw new Error('Tester report endpoint must reject missing testerId.');
    }
    const invalidTester = await testerReport.handler(eventFor('../escape', {
      category:'Other',
      notes:'Invalid tester',
      snapshot:{}
    }));
    if(invalidTester.statusCode !== 400){
      throw new Error('Tester report endpoint must reject invalid testerId.');
    }
    const oversized = await testerReport.handler(eventFor(testerA, {
      category:'Other',
      notes:'x'.repeat(1000),
      snapshot:{payload:'y'.repeat(60000)}
    }));
    if(oversized.statusCode !== 413){
      throw new Error('Tester report endpoint must reject oversized payloads.');
    }

    const redactionSandbox = {console};
    vm.createContext(redactionSandbox);
    vm.runInContext(extractFunctionSource(appSource, 'redactDiagnosticPayload'), redactionSandbox, {filename:'app.js#redactDiagnosticPayload'});
    const clientRedacted = vm.runInContext(`redactDiagnosticPayload({
      paperTradeApiKey:'abc',
      paperTradeApiSecret:'def',
      nested:{Authorization:'Basic token', ok:'yes'}
    })`, redactionSandbox);
    if(clientRedacted.paperTradeApiKey !== '[REDACTED]' || clientRedacted.paperTradeApiSecret !== '[REDACTED]' || clientRedacted.nested.Authorization !== '[REDACTED]'){
      throw new Error('Client-side diagnostic snapshots must redact paper credentials and authorization headers.');
    }

    if(!/id="copyRuntimeDebugBtn"/.test(indexSource)
      || !/id="copyTesterSnapshotBtn"/.test(indexSource)
      || !/id="copyScannerPolicyDiagnosticsBtn"/.test(indexSource)
      || !/id="submitTesterReportBtn"/.test(indexSource)
      || !/data-act="copy-review-diagnostics-bundle"/.test(appSource)
      || !/data-act="copy-track-diagnostics-bundle"/.test(appSource)){
      throw new Error('Tester reporting UI must expose top-level diagnostics bundle copy controls and report submission controls.');
    }
    if(/refreshTesterReportsBtn/.test(indexSource) || /testerReportsList/.test(indexSource) || /testerReportDetail/.test(indexSource)){
      throw new Error('Normal app UI must not expose global tester report browsing.');
    }
    if(!/panelTitle:'Resolver Trace'/.test(appSource) || !/copyTesterDiagnosticSnapshot\(\{[\s\S]*panelTitle:'Resolver Trace'/.test(appSource)){
      throw new Error('Resolver trace Copy button must use the sanitized diagnostic snapshot flow.');
    }
    if(/const traceText = traceContent \? \(traceContent\.textContent \|\| traceContent\.innerText \|\| ''\)\.trim\(\) : '';\s*const copied = traceText \? await copyText\(traceText\) : false;/.test(appSource)){
      throw new Error('Resolver trace Copy button must not use raw panel text copying.');
    }
  })();
}

function runTesterProfileResetAssertions(){
  const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  if(!/safeStorageRemove\(savedScannerUniverseKey\)/.test(appSource)
    || !/safeStorageRemove\(savedScannerUniverseMetaKey\)/.test(appSource)){
    throw new Error('Start New Tester Profile must clear saved scanner universe snapshot keys.');
  }
  if(/const preservedSettings = \{[\s\S]*dataProvider[\s\S]*apiPlan[\s\S]*aiEndpoint[\s\S]*marketDataEndpoint[\s\S]*\};/.test(appSource)){
    throw new Error('Start New Tester Profile must not preserve provider/app settings for a full shared-device handoff.');
  }

  const resetSandbox = {
    console,
    window:{confirm:() => true},
    state:{
      dataProvider:'fmp',
      apiPlan:'scanner',
      aiEndpoint:'/api/analyse-setup',
      marketDataEndpoint:'/api/market-data'
    },
    uiState:{},
    key:'pullbackPlaybookV3',
    liteKey:'pullbackPlaybookV3Lite',
    settingsKey:'pullbackPlaybookSettingsV1',
    recordsLiteKey:'pullbackPlaybookRecordsLiteV1',
    savedScannerUniverseKey:'pp_scanner_universe_saved',
    savedScannerUniverseMetaKey:'pp_scanner_universe_saved_meta',
    trackSectionStateKey:'pp_track_section_state_v1',
    testerRecentBugReceiptsStorageKey:'pullbackPlaybookRecentBugReceiptsV1',
    removedKeys:[],
    rotateTesterId(){
      resetSandbox.__testerId = '55555555-5555-4555-8555-555555555555';
      return resetSandbox.__testerId;
    },
    safeStorageRemove(storageKey){
      resetSandbox.removedKeys.push(storageKey);
    },
    createDefaultState(){
      return {
        paperTradeApiKey:'',
        paperTradeApiSecret:'',
        paperTradeTesterSetupCompletedAt:'',
        tickerRecords:{},
        tradeDiary:[],
        watchlist:[]
      };
    },
    clearTransientSessionState(){},
    persistState(){},
    renderAppFromState(){},
    renderTradeGatewayHealth(){},
    renderTesterSetupPanel(){},
    renderTesterIdentityPanel(){},
    renderRecentSubmittedBugs(){},
    setStatus(){},
    escapeHtml(value){ return String(value || ''); },
    currentTesterId(){ return resetSandbox.__testerId || '55555555-5555-4555-8555-555555555555'; }
  };
  vm.createContext(resetSandbox);
  vm.runInContext(extractFunctionSource(appSource, 'resetTesterProfile'), resetSandbox, {filename:'app.js#resetTesterProfile'});
  const result = vm.runInContext('resetTesterProfile()', resetSandbox);
  if(result !== true){
    throw new Error('resetTesterProfile must complete successfully in the happy path.');
  }
  const removed = new Set(resetSandbox.removedKeys);
  ['pullbackPlaybookV3', 'pullbackPlaybookV3Lite', 'pullbackPlaybookSettingsV1', 'pullbackPlaybookRecordsLiteV1', 'pp_scanner_universe_saved', 'pp_scanner_universe_saved_meta', 'pp_track_section_state_v1', 'pullbackPlaybookRecentBugReceiptsV1'].forEach(storageKey => {
    if(!removed.has(storageKey)){
      throw new Error(`resetTesterProfile must clear ${storageKey}.`);
    }
  });
  if(!/^[a-f0-9-]{16,64}$/.test(String(resetSandbox.__testerId || ''))){
    throw new Error('resetTesterProfile must leave a valid testerId in place.');
  }
}

function runCanonicalDecisionInvariantAssertions(){
  const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  if(!/stateHealth:currentReviewStateHealthSnapshot\(record\)/.test(appSource)){
    throw new Error('Diagnostic snapshots must export structured stateHealth for canonical decision comparison.');
  }
  if(!/function currentReviewStateHealthSnapshot\(record\)/.test(appSource)){
    throw new Error('App must expose a structured currentReviewStateHealthSnapshot helper.');
  }

  function normalizeCanonical(value){
    const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
    if(safe === 'monitor') return 'watch';
    return ['entry','near_entry','watch','avoid','dead'].includes(safe) ? safe : 'watch';
  }
  function normalizeBucket(value){
    const safe = String(value || '').trim().toLowerCase();
    return ['entry','near_entry','monitor','diminishing','avoid','dead'].includes(safe) ? safe : 'monitor';
  }
  function isAllowedPair(canonicalVerdict, visualBucket){
    const canonical = normalizeCanonical(canonicalVerdict);
    const bucket = normalizeBucket(visualBucket);
    if(canonical === 'entry') return bucket === 'entry';
    if(canonical === 'near_entry') return ['near_entry', 'monitor'].includes(bucket);
    if(canonical === 'watch') return ['monitor', 'diminishing'].includes(bucket);
    if(canonical === 'avoid') return ['avoid', 'diminishing', 'dead'].includes(bucket);
    return true;
  }
  function assertInvariant(state, message){
    const verdict = normalizeCanonical(state.canonicalVerdict);
    const bucket = normalizeBucket(state.visualBucket);
    const planStatus = String(state.planStatus || '').trim().toLowerCase();
    const priceability = String(state.priceabilityState || '').trim().toLowerCase();
    const structureEligibility = String(state.structureEligibility || '').trim().toLowerCase();

    if(!isAllowedPair(verdict, bucket)){
      throw new Error(`${message}: invalid canonical/bucket pair ${verdict}/${bucket}.`);
    }
    if(verdict === 'entry' && state.entryGatePass !== true){
      throw new Error(`${message}: entry verdict requires entryGatePass=true.`);
    }
    if(verdict === 'near_entry' && state.nearEntryGatePass !== true){
      throw new Error(`${message}: near_entry verdict requires nearEntryGatePass=true.`);
    }
    if(verdict === 'watch' && ['entry','near_entry'].includes(bucket)){
      throw new Error(`${message}: watch verdict cannot render entry-like bucket.`);
    }
    if(['entry','near_entry'].includes(verdict) && ['missing','invalid','blocked'].includes(planStatus)){
      throw new Error(`${message}: actionable verdict cannot coexist with ${planStatus} plan status.`);
    }
    if(['entry','near_entry'].includes(verdict) && priceability === 'unpriceable'){
      throw new Error(`${message}: actionable verdict cannot coexist with unpriceable state.`);
    }
    if(verdict === 'avoid' && structureEligibility === 'alive' && state.terminalAvoidApplied !== true && !String(state.avoidTriggerSource || '').trim()){
      throw new Error(`${message}: avoid verdict on alive structure requires terminal avoid or explicit avoid trigger source.`);
    }
  }

  assertInvariant({
    canonicalVerdict:'entry',
    visualBucket:'entry',
    entryGatePass:true,
    nearEntryGatePass:true,
    planStatus:'valid',
    priceabilityState:'priceable',
    structureEligibility:'alive',
    terminalAvoidApplied:false
  }, 'Valid entry state');
  assertInvariant({
    canonicalVerdict:'near_entry',
    visualBucket:'near_entry',
    entryGatePass:false,
    nearEntryGatePass:true,
    planStatus:'valid',
    priceabilityState:'priceable',
    structureEligibility:'alive',
    terminalAvoidApplied:false
  }, 'Valid near-entry state');
  assertInvariant({
    canonicalVerdict:'watch',
    visualBucket:'monitor',
    entryGatePass:false,
    nearEntryGatePass:false,
    planStatus:'missing',
    priceabilityState:'unpriceable',
    structureEligibility:'alive',
    terminalAvoidApplied:false
  }, 'Valid watch state');
  assertInvariant({
    canonicalVerdict:'avoid',
    visualBucket:'avoid',
    entryGatePass:false,
    nearEntryGatePass:false,
    planStatus:'invalid',
    priceabilityState:'unpriceable',
    structureEligibility:'alive',
    terminalAvoidApplied:true,
    avoidTriggerSource:'terminal_breakdown'
  }, 'Valid avoid state');
}

function runScannerPolicyCompatibilityAssertions(){
  const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const browserWindow = sandbox.window;
  const policySandbox = {
    window:{
      ScannerUniversePolicy:browserWindow.ScannerUniversePolicy,
      SetupBasisPolicy:browserWindow.SetupBasisPolicy
    },
    console,
    state:{
      tickers:[],
      universeMode:'',
      setupType:'',
      marketStatus:'S&P above 50 MA'
    },
    DEFAULT_AUTO_UNIVERSE:['AAPL', 'MSFT', 'NVDA', 'META'],
    currentMaxScanTickers(){
      return null;
    },
    normalizeScanType(value){
      const safe = String(value || '').trim().toUpperCase();
      if(['20MA', '50MA'].includes(safe)) return safe;
      if(safe === 'AMBIGUOUS') return 'ambiguous';
      return '';
    },
    numericOrNull(value){
      if(value === null || value === undefined || value === '') return null;
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    },
    uniqueTickers(values){
      const seen = new Set();
      return (Array.isArray(values) ? values : []).reduce((list, value) => {
        const safe = String(value || '').trim().toUpperCase();
        if(!safe || seen.has(safe)) return list;
        seen.add(safe);
        list.push(safe);
        return list;
      }, []);
    },
    normalizeUniverseMode(value){
      return ['tradingview_only', 'core8', 'combined'].includes(String(value || '')) ? String(value || '') : '';
    },
    $(id){
      if(id === 'scannerSetupType') return {value:policySandbox.state.setupType || ''};
      if(id === 'universeMode') return {value:policySandbox.state.universeMode || ''};
      return null;
    }
  };
  policySandbox.globalThis = policySandbox.window;
  vm.createContext(policySandbox);
  [
    'setupBasisPolicy',
    'scannerUniversePolicy',
    'callSetupBasisPolicy',
    'callScannerUniversePolicy',
    'legacyNormalizeStoredSetupType',
    'normalizedStoredSetupType',
    'legacyCurrentSetupTypeValue',
    'currentSetupType',
    'legacySelectedQuickScanTypeValue',
    'selectedQuickScanType',
    'legacyDefaultUniverseModeForTickers',
    'defaultUniverseModeForTickers',
    'effectiveUniverseMode',
    'legacyEffectiveUniverseModeValue',
    'normalizedStoredUniverseMode',
    'selectedUniverseMode',
    'legacyFinalScanUniverseValue',
    'finalScanUniverse',
    'legacyScanTypeForEvaluationValue',
    'scanTypeForEvaluation',
    'legacyResolveSetupTypeWithOverlap',
    'resolveSetupTypeWithOverlap',
    'legacyResolveScanType',
    'resolveScanType'
  ].forEach(functionName => {
    vm.runInContext(extractFunctionSource(appSource, functionName), policySandbox, {filename:`app.js#${functionName}`});
  });

  const explicit20Args = [
    {},
    {
      price:100,
      sma20:99,
      sma50:95,
      perf1w:3
    },
    {
      near20:true,
      near50:false,
      trendStrong:true,
      bounce:true
    }
  ];
  const explicit50Args = [
    {},
    {
      price:100,
      sma20:102,
      sma50:99.5,
      perf1w:1
    },
    {
      near20:false,
      near50:true,
      trendStrong:true,
      stabilising:true
    }
  ];
  const accepted50Args = [
    {},
    {
      price:248.63,
      sma20:260,
      sma50:250.23,
      perf1w:0.4
    },
    {
      near20:false,
      near50:true,
      trendStrong:false,
      stabilising:false
    }
  ];

  if(policySandbox.selectedQuickScanType() !== ''){
    throw new Error('Blank setup selection must remain blank at the policy read layer.');
  }
  if(policySandbox.scanTypeForEvaluation('') !== '20MA'){
    throw new Error('Blank setup must preserve the current 20MA evaluation baseline.');
  }
  policySandbox.state.setupType = '20MA';
  if(policySandbox.currentSetupType() !== '20MA' || policySandbox.selectedQuickScanType() !== '20MA'){
    throw new Error('Explicit 20MA selection must still read through the wrapper path unchanged.');
  }
  const explicit20 = policySandbox.resolveSetupTypeWithOverlap(...explicit20Args);
  if(explicit20.resolvedScanType !== '20MA'){
    throw new Error('Explicit 20MA setup must still resolve as 20MA.');
  }

  policySandbox.state.setupType = '50MA';
  if(policySandbox.currentSetupType() !== '50MA' || policySandbox.selectedQuickScanType() !== '50MA'){
    throw new Error('Explicit 50MA selection must still read through the wrapper path unchanged.');
  }
  const explicit50 = policySandbox.resolveSetupTypeWithOverlap(...explicit50Args);
  if(explicit50.resolvedScanType !== '50MA'){
    throw new Error('Explicit 50MA setup must still resolve as 50MA.');
  }

  policySandbox.state.setupType = '';
  const inferred50 = policySandbox.resolveSetupTypeWithOverlap({}, {
    price:99.8,
    sma20:103,
    sma50:100,
    perf1w:0.5
  }, {
    near20:false,
    near50:true,
    trendStrong:true,
    stabilising:true
  });
  if(inferred50.resolvedScanType !== '50MA'){
    throw new Error('Blank setup must not silently drift away from a clear 50MA-only context.');
  }
  if(policySandbox.currentSetupType() !== 'unknown'){
    throw new Error('Blank setup must not silently become a fake explicit setup type.');
  }

  policySandbox.state.tickers = ['NVDA', 'AAPL'];
  policySandbox.state.universeMode = '';
  const importedFirst = policySandbox.finalScanUniverse();
  if(JSON.stringify(importedFirst) !== JSON.stringify(['NVDA', 'AAPL']) || policySandbox.effectiveUniverseMode() !== 'tradingview_only'){
    throw new Error('Imported/manual tickers must still take precedence through the universe policy wrapper.');
  }

  policySandbox.state.tickers = [];
  policySandbox.state.universeMode = '';
  const curatedFallback = policySandbox.finalScanUniverse();
  if(JSON.stringify(curatedFallback) !== JSON.stringify(policySandbox.DEFAULT_AUTO_UNIVERSE) || policySandbox.effectiveUniverseMode() !== 'core8'){
    throw new Error('Curated fallback must still work through the universe policy wrapper.');
  }

  policySandbox.state.tickers = ['NVDA', 'AAPL'];
  policySandbox.state.universeMode = 'combined';
  policySandbox.currentMaxScanTickers = () => 3;
  const combined = policySandbox.finalScanUniverse();
  if(JSON.stringify(combined) !== JSON.stringify(['NVDA', 'AAPL', 'MSFT'])){
    throw new Error('Combined universe mode must still preserve imported tickers first and then curated fallback.');
  }

  const missingPolicyLegacy50 = policySandbox.legacyResolveSetupTypeWithOverlap(...accepted50Args);
  policySandbox.window.SetupBasisPolicy = null;
  const missingPolicyWrapped50 = policySandbox.resolveSetupTypeWithOverlap(...accepted50Args);
  if(JSON.stringify(missingPolicyWrapped50) !== JSON.stringify(missingPolicyLegacy50)){
    throw new Error('Missing SetupBasisPolicy must preserve legacy setup-resolution behaviour exactly.');
  }
  if(missingPolicyWrapped50.resolvedScanType !== '50MA'){
    throw new Error('Accepted 50MA support-test path must still resolve as 50MA when SetupBasisPolicy is unavailable.');
  }
  const missingUniverseMode = policySandbox.effectiveUniverseMode();
  const missingUniverseFinal = policySandbox.finalScanUniverse();
  if(missingUniverseMode !== policySandbox.legacyEffectiveUniverseModeValue(policySandbox.state.universeMode, policySandbox.state.tickers)
    || JSON.stringify(missingUniverseFinal) !== JSON.stringify(policySandbox.legacyFinalScanUniverseValue(policySandbox.state, policySandbox.currentMaxScanTickers()))){
    throw new Error('Missing ScannerUniversePolicy must preserve legacy effective/final universe behaviour.');
  }

  policySandbox.window.SetupBasisPolicy = {
    currentSetupType(){ throw new Error('boom'); },
    selectedQuickScanType(){ throw new Error('boom'); },
    normalizeStoredSetupType(){ throw new Error('boom'); },
    scanTypeForEvaluation(){ throw new Error('boom'); },
    resolveSetupTypeWithOverlap(){ throw new Error('boom'); },
    resolveScanType(){ throw new Error('boom'); }
  };
  policySandbox.window.ScannerUniversePolicy = {
    normalizeStoredMode(){ throw new Error('boom'); },
    selectedMode(){ throw new Error('boom'); },
    defaultModeForTickers(){ throw new Error('boom'); },
    effectiveMode(){ throw new Error('boom'); },
    finalUniverse(){ throw new Error('boom'); }
  };
  policySandbox.state.setupType = '50MA';
  const throwingPolicy50 = policySandbox.resolveSetupTypeWithOverlap(...explicit50Args);
  const legacyExplicit50 = policySandbox.legacyResolveSetupTypeWithOverlap(...explicit50Args);
  if(JSON.stringify(throwingPolicy50) !== JSON.stringify(legacyExplicit50)){
    throw new Error('Throwing SetupBasisPolicy must preserve legacy setup-resolution behaviour exactly.');
  }
  if(policySandbox.selectedQuickScanType() !== '50MA' || policySandbox.currentSetupType() !== '50MA' || policySandbox.scanTypeForEvaluation('ambiguous') !== '50MA'){
    throw new Error('Throwing setup-basis wrapper methods must fall back to legacy setup reads and evaluation.');
  }
  const throwingUniverseMode = policySandbox.effectiveUniverseMode();
  const throwingUniverseFinal = policySandbox.finalScanUniverse();
  if(throwingUniverseMode !== policySandbox.legacyEffectiveUniverseModeValue(policySandbox.state.universeMode, policySandbox.state.tickers)
    || JSON.stringify(throwingUniverseFinal) !== JSON.stringify(policySandbox.legacyFinalScanUniverseValue(policySandbox.state, policySandbox.currentMaxScanTickers()))){
    throw new Error('Throwing ScannerUniversePolicy must preserve legacy effective/final universe behaviour.');
  }

  let setupFallbackCalls = 0;
  policySandbox.legacyCurrentSetupTypeValue = function(value){
    setupFallbackCalls += 1;
    return `legacy:${String(value || '') || 'unknown'}`;
  };
  policySandbox.state.setupType = '20MA';
  policySandbox.window.SetupBasisPolicy = {
    currentSetupType(){
      return 'policy:20MA';
    }
  };
  if(policySandbox.currentSetupType() !== 'policy:20MA'){
    throw new Error('Setup policy success path must still use the policy result.');
  }
  if(setupFallbackCalls !== 0){
    throw new Error('Setup policy success path must not evaluate the legacy fallback eagerly.');
  }

  setupFallbackCalls = 0;
  policySandbox.window.SetupBasisPolicy = null;
  if(policySandbox.currentSetupType() !== 'legacy:20MA' || setupFallbackCalls !== 1){
    throw new Error('Setup policy unavailable path must evaluate the legacy fallback exactly once.');
  }

  setupFallbackCalls = 0;
  policySandbox.window.SetupBasisPolicy = {
    currentSetupType(){
      throw new Error('setup policy failed');
    }
  };
  if(policySandbox.currentSetupType() !== 'legacy:20MA' || setupFallbackCalls !== 1){
    throw new Error('Setup policy throw path must evaluate the legacy fallback exactly once.');
  }

  let universeFallbackCalls = 0;
  policySandbox.legacyFinalScanUniverseValue = function(){
    universeFallbackCalls += 1;
    return ['LEGACY'];
  };
  policySandbox.window.ScannerUniversePolicy = {
    finalUniverse(){
      return ['POLICY'];
    }
  };
  if(JSON.stringify(policySandbox.finalScanUniverse()) !== JSON.stringify(['POLICY'])){
    throw new Error('Scanner universe policy success path must still use the policy result.');
  }
  if(universeFallbackCalls !== 0){
    throw new Error('Scanner universe policy success path must not evaluate the legacy fallback eagerly.');
  }

  universeFallbackCalls = 0;
  policySandbox.window.ScannerUniversePolicy = null;
  if(JSON.stringify(policySandbox.finalScanUniverse()) !== JSON.stringify(['LEGACY']) || universeFallbackCalls !== 1){
    throw new Error('Scanner universe policy unavailable path must evaluate the legacy fallback exactly once.');
  }

  universeFallbackCalls = 0;
  policySandbox.window.ScannerUniversePolicy = {
    finalUniverse(){
      throw new Error('universe policy failed');
    }
  };
  if(JSON.stringify(policySandbox.finalScanUniverse()) !== JSON.stringify(['LEGACY']) || universeFallbackCalls !== 1){
    throw new Error('Scanner universe policy throw path must evaluate the legacy fallback exactly once.');
  }

  const scannerVerdictSandbox = {
    Number,
    Math
  };
  vm.createContext(scannerVerdictSandbox);
  vm.runInContext(extractFunctionSource(appSource, 'determineScannerVerdict'), scannerVerdictSandbox, {filename:'app.js#determineScannerVerdict'});
  vm.runInContext(extractFunctionSource(appSource, 'buildVerdictReason'), scannerVerdictSandbox, {filename:'app.js#buildVerdictReason'});
  const tentativeBounceVerdict = vm.runInContext(`
    determineScannerVerdict({
      technicalValid:true,
      score:7,
      checks:{stabilising:true, bounce:false, volume:true},
      riskFit:{risk_status:'fits_risk'},
      rewardRisk:{valid:true, rrState:'strong'}
    })
  `, scannerVerdictSandbox);
  if(tentativeBounceVerdict !== 'Near Entry'){
    throw new Error('Scanner must not promote stabilising-without-bounce setups to Entry.');
  }
  const weakVolumeTentativeBounceVerdict = vm.runInContext(`
    determineScannerVerdict({
      technicalValid:true,
      score:7,
      checks:{stabilising:true, bounce:false, volume:false},
      riskFit:{risk_status:'fits_risk'},
      rewardRisk:{valid:true, rrState:'strong'}
    })
  `, scannerVerdictSandbox);
  if(weakVolumeTentativeBounceVerdict !== 'Watch'){
    throw new Error('Scanner must keep weak-volume tentative-bounce setups at Watch when lifecycle would resolve Watch.');
  }
  const confirmedBounceVerdict = vm.runInContext(`
    determineScannerVerdict({
      technicalValid:true,
      score:7,
      checks:{stabilising:true, bounce:true, volume:false},
      riskFit:{risk_status:'fits_risk'},
      rewardRisk:{valid:true, rrState:'strong'}
    })
  `, scannerVerdictSandbox);
  if(confirmedBounceVerdict !== 'Entry'){
    throw new Error('Scanner must still allow Entry when bounce is confirmed and the plan is strong.');
  }
  const tentativeBounceReason = vm.runInContext(`
    buildVerdictReason({
      suitability:{summary:'Candidate remains reviewable.'},
      scan:{status:'Near Entry', summary:''},
      riskFit:{risk_status:'fits_risk'},
      rewardRisk:{valid:true, rrState:'strong', rrRatio:2.5},
      checks:{stabilising:true, bounce:false, volume:true}
    })
  `, scannerVerdictSandbox);
  if(!/bounce still tentative/i.test(String(tentativeBounceReason || ''))){
    throw new Error('Scanner must surface the tentative-bounce blocker when Entry is not yet allowed.');
  }
  const weakVolumeTentativeBounceReason = vm.runInContext(`
    buildVerdictReason({
      suitability:{summary:'Candidate remains reviewable.'},
      scan:{status:'Watch', summary:''},
      riskFit:{risk_status:'fits_risk'},
      rewardRisk:{valid:true, rrState:'strong', rrRatio:2.5},
      checks:{stabilising:true, bounce:false, volume:false}
    })
  `, scannerVerdictSandbox);
  if(!/weak volume caution/i.test(String(weakVolumeTentativeBounceReason || '')) || !/bounce still tentative/i.test(String(weakVolumeTentativeBounceReason || ''))){
    throw new Error('Scanner must surface weak-volume tentative-bounce blockers when lifecycle would hold the setup at Watch.');
  }
}

function runTesterSetupPersistenceFallbackAssertions(){
  const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const persistSandbox = {
    console:{
      ...console,
      warn(){},
      debug(){},
      info(){},
      log(){}
    },
    Date,
    key:'pullbackPlaybookV3',
    liteKey:'pullbackPlaybookV3Lite',
    settingsKey:'pullbackPlaybookSettingsV1',
    recordsLiteKey:'pullbackPlaybookRecordsLiteV1',
    state:{
      accountSize:4000,
      maxRisk:40,
      userRiskPerTrade:40,
      riskPercent:1,
      maxLossOverride:'',
      wholeSharesOnly:true,
      marketStatus:'S&P above 50 MA',
      marketStatusMode:'manual',
      setupType:'20MA',
      listName:'Focus',
      universeMode:'tradingview_only',
      paperTradeApiKey:'tester-local-key',
      paperTradeApiSecret:'tester-local-secret',
      paperTradeTesterSetupCompletedAt:'2026-06-23T12:34:56.000Z',
      tickers:['AAPL'],
      recentTickers:['AAPL'],
      tickerRecords:{},
      tradeDiary:[],
      watchlist:[],
      symbolMeta:{},
      backendTrackedVersions:{},
      backendLocalTrackedTickers:[]
    },
    stored:new Map(),
    cloneData(value, fallback){
      if(value === undefined) return fallback;
      return JSON.parse(JSON.stringify(value));
    },
    normalizeTickerRecordsMap(value){
      return value && typeof value === 'object' ? value : {};
    },
    normalizeTickerRecord(value){
      return value;
    },
    trading212PaperSupported:true,
    trading212PaperAvailabilityChecked:true,
    trading212PaperEnabled:true,
    trading212PaperAvailabilityMessage:'Trading 212 paper trading is ready.',
    formatLocalTimestamp(value){
      return String(value || '');
    },
    statusCalls:[],
    renderTesterSetupPanelCalls:0,
    setStatus(target, message){
      persistSandbox.statusCalls.push({target, message:String(message || '')});
    },
    renderTesterSetupPanel(){
      persistSandbox.renderTesterSetupPanelCalls += 1;
    },
    logDebugWarn(){},
    safeStorageSet(storageKey, value){
      if(storageKey === 'pullbackPlaybookV3') return false;
      persistSandbox.stored.set(storageKey, value);
      return true;
    }
  };
  persistSandbox.globalThis = persistSandbox;
  vm.createContext(persistSandbox);
  [
    'withPersistMeta',
    'stripPersistMeta',
    'persistedAtMs',
    'persistableWatchlistState',
    'persistableMetaState',
    'buildPersistableTickerRecordsMap',
    'buildFullPersistedState',
    'buildSettingsPersistedState',
    'buildRecordsLitePersistedState',
    'buildLitePersistedState',
    'mergePersistedStateLayers',
    'persistState',
    'storedPaperTradeApiKey',
    'storedPaperTradeApiSecret',
    'storedPaperTradeCredentialsReady',
    'paperTradeGatewayReady',
    'paperTradeCredentialsSourceReady',
    'paperTradeTesterSetupComplete',
    'testerSetupHealthModel',
    'completeTesterSetup'
  ].forEach(functionName => {
    vm.runInContext(extractFunctionSource(appSource, functionName), persistSandbox, {filename:`app.js#${functionName}`});
  });

  persistSandbox.persistState();

  const settingsSnapshot = persistSandbox.stored.get('pullbackPlaybookSettingsV1');
  const recordsLiteSnapshot = persistSandbox.stored.get('pullbackPlaybookRecordsLiteV1');
  const liteSnapshot = persistSandbox.stored.get('pullbackPlaybookV3Lite');

  if(!settingsSnapshot || settingsSnapshot.paperTradeTesterSetupCompletedAt !== '2026-06-23T12:34:56.000Z'){
    throw new Error('Settings fallback persistence must include paperTradeTesterSetupCompletedAt.');
  }
  if(!recordsLiteSnapshot || recordsLiteSnapshot.paperTradeTesterSetupCompletedAt !== '2026-06-23T12:34:56.000Z'){
    throw new Error('Records-lite fallback persistence must include paperTradeTesterSetupCompletedAt.');
  }
  if(!liteSnapshot || liteSnapshot.paperTradeTesterSetupCompletedAt !== '2026-06-23T12:34:56.000Z'){
    throw new Error('Lite fallback persistence must include paperTradeTesterSetupCompletedAt.');
  }

  const mergedPersistedState = persistSandbox.mergePersistedStateLayers([
    {name:'settings', priority:1, data:settingsSnapshot},
    {name:'recordsLite', priority:2, data:recordsLiteSnapshot},
    {name:'lite', priority:3, data:liteSnapshot},
    {name:'full', priority:4, data:{}}
  ]);
  const restoredState = {paperTradeTesterSetupCompletedAt:''};
  Object.assign(restoredState, mergedPersistedState);
  restoredState.paperTradeTesterSetupCompletedAt = String(restoredState.paperTradeTesterSetupCompletedAt || '');
  if(restoredState.paperTradeTesterSetupCompletedAt !== '2026-06-23T12:34:56.000Z'){
    throw new Error('Merged fallback reload must preserve paperTradeTesterSetupCompletedAt.');
  }
  const completedModel = persistSandbox.testerSetupHealthModel();
  if(completedModel.complete !== true){
    throw new Error('Tester setup should remain completed when the local key exists and the gateway is ready.');
  }
  persistSandbox.state.paperTradeApiKey = '';
  persistSandbox.state.paperTradeApiSecret = '';
  if(persistSandbox.paperTradeTesterSetupComplete() !== true){
    throw new Error('Deleting the local API credentials must not clear shared tester setup completion when paper gateway support remains available.');
  }
  const resetModel = persistSandbox.testerSetupHealthModel();
  if(resetModel.complete !== true){
    throw new Error('Deleting the local API credentials must preserve visible tester setup completion when gateway-backed paper trading remains available.');
  }
  persistSandbox.completeTesterSetup();
  if(persistSandbox.state.paperTradeTesterSetupCompletedAt !== '2026-06-23T12:34:56.000Z'){
    throw new Error('completeTesterSetup must not overwrite completion when the local paper credentials are missing.');
  }
  if(persistSandbox.renderTesterSetupPanelCalls < 1){
    throw new Error('completeTesterSetup must re-render tester setup state when the local paper credentials are missing.');
  }
  if(!persistSandbox.statusCalls.some(entry => /local Trading 212 paper API key and API secret/i.test(entry.message))){
    throw new Error('completeTesterSetup must explain that local paper credentials are required.');
  }
  if(!/state\.paperTradeTesterSetupCompletedAt = String\(state\.paperTradeTesterSetupCompletedAt \|\| ''\);/.test(appSource)){
    throw new Error('loadState must continue to normalize paperTradeTesterSetupCompletedAt safely.');
  }
}

function runTesterSetupUiGateAssertions(){
  const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const uiSandbox = {
    window:{},
    console,
    state:{
      paperTradeApiKey:'',
      paperTradeApiSecret:'',
      paperTradeTesterSetupCompletedAt:'',
      marketStatus:'S&P above 50 MA'
    },
    trading212PaperSupported:true,
    trading212PaperAvailabilityChecked:true,
    trading212PaperEnabled:true,
    trading212PaperAvailabilityMessage:'Trading 212 paper trading is ready.',
    formatLocalTimestamp(value){
      return String(value || '');
    },
    elements:{
      testerSetupStatusLabel:{textContent:'', className:''},
      testerSetupStatusDetail:{textContent:''},
      testerSetupConfirmBtn:{disabled:false, textContent:''}
    },
    $(id){
      return uiSandbox.elements[id] || null;
    }
  };
  uiSandbox.globalThis = uiSandbox.window;
  vm.createContext(uiSandbox);
  [
    'storedPaperTradeApiKey',
    'storedPaperTradeApiSecret',
    'storedPaperTradeCredentialsReady',
    'paperTradeTesterSetupComplete',
    'testerSetupHealthModel',
    'renderTesterSetupPanel'
  ].forEach(functionName => {
    vm.runInContext(extractFunctionSource(appSource, functionName), uiSandbox, {filename:`app.js#${functionName}`});
  });

  uiSandbox.renderTesterSetupPanel();
  if(uiSandbox.elements.testerSetupConfirmBtn.disabled !== true){
    throw new Error('Server-side gateway readiness alone must not enable tester setup completion without a local key.');
  }

  uiSandbox.state.paperTradeApiKey = 'tester-local-key';
  uiSandbox.state.paperTradeApiSecret = 'tester-local-secret';
  uiSandbox.renderTesterSetupPanel();
  if(uiSandbox.elements.testerSetupConfirmBtn.disabled !== false){
    throw new Error('Local key plus ready gateway must allow tester setup completion.');
  }
}

function runAdvancedScannerUiConsistencyAssertions(){
  const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const uiSandbox = {
    window:{},
    console,
    state:{
      tickers:['NVDA', 'AAPL'],
      universeMode:'',
      setupType:'',
      marketStatus:'S&P above 50 MA'
    },
    uiState:{},
    elements:{
      advancedUniverseMode:{value:'', focus(){}, scrollIntoView(){}},
      advancedScannerSetupType:{value:'', focus(){}, scrollIntoView(){}},
      universeMode:{value:''},
      scannerSetupType:{value:''},
      scannerSettings:{open:false, id:'scannerSettings', scrollIntoView(){}, focus(){}}
    },
    setActiveWorkspaceTab(){},
    requestAnimationFrame(callback){ callback(); },
    isTrackRestoreOrRevealPending(){ return false; },
    traceScrollEvent(){},
    traceScrollDriver(){},
    suppressScrollMemoryForAppScroll(){},
    uniqueTickers(values){
      const seen = new Set();
      return (Array.isArray(values) ? values : []).reduce((list, value) => {
        const safe = String(value || '').trim().toUpperCase();
        if(!safe || seen.has(safe)) return list;
        seen.add(safe);
        list.push(safe);
        return list;
      }, []);
    },
    normalizeUniverseMode(value){
      return ['tradingview_only', 'core8', 'combined'].includes(String(value || '')) ? String(value || '') : '';
    },
    normalizeScanType(value){
      const safe = String(value || '').trim().toUpperCase();
      if(['20MA', '50MA'].includes(safe)) return safe;
      if(safe === 'AMBIGUOUS') return 'ambiguous';
      return '';
    },
    $(id){
      return uiSandbox.elements[id] || null;
    }
  };
  uiSandbox.globalThis = uiSandbox.window;
  vm.createContext(uiSandbox);
  [
    'setupBasisPolicy',
    'scannerUniversePolicy',
    'callSetupBasisPolicy',
    'callScannerUniversePolicy',
    'legacyNormalizeStoredSetupType',
    'normalizedStoredSetupType',
    'legacyCurrentSetupTypeValue',
    'currentSetupType',
    'legacyDefaultUniverseModeForTickers',
    'defaultUniverseModeForTickers',
    'normalizedStoredUniverseMode',
    'legacyEffectiveUniverseModeValue',
    'effectiveUniverseMode',
    'syncAdvancedScannerOverrideControls',
    'applyAdvancedUniverseModeSelection',
    'applyAdvancedSetupTypeSelection',
    'openAdvancedScannerSettings',
    'openContextSettings'
  ].forEach(functionName => {
    vm.runInContext(extractFunctionSource(appSource, functionName), uiSandbox, {filename:`app.js#${functionName}`});
  });

  uiSandbox.syncAdvancedScannerOverrideControls();
  if(uiSandbox.elements.advancedUniverseMode.value !== 'tradingview_only' || uiSandbox.elements.advancedScannerSetupType.value !== ''){
    throw new Error('Advanced scanner overrides must reflect imported-ticker precedence and blank setup state.');
  }

  uiSandbox.state.tickers = [];
  uiSandbox.state.universeMode = 'core8';
  uiSandbox.state.setupType = '50MA';
  uiSandbox.syncAdvancedScannerOverrideControls();
  if(uiSandbox.elements.advancedUniverseMode.value !== 'core8' || uiSandbox.elements.advancedScannerSetupType.value !== '50MA'){
    throw new Error('Advanced scanner overrides must reflect curated fallback and explicit setup overrides.');
  }

  uiSandbox.openContextSettings('mode');
  if(uiSandbox.elements.scannerSettings.open !== true){
    throw new Error('Deprecated mode context requests must route to Advanced Scanner Settings.');
  }

  if(!/Adjust market, account\/risk, and advanced scanner settings\./.test(indexSource)){
    throw new Error('Context settings copy must no longer advertise scanner mode/setup controls in the header panel.');
  }
  if(/Adjust market, account\/risk, scanner mode, and setup defaults\./.test(indexSource)){
    throw new Error('Stale context settings copy still advertises scanner mode/setup in the header panel.');
  }
}

function runTradeExecutionRoutingAssertions(){
  const netlifyConfig = fs.readFileSync(path.join(root, 'netlify.toml'), 'utf8');
  const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const handlerSource = fs.readFileSync(path.join(root, 'netlify', 'functions', 'lib', 'trade-execution-handler.js'), 'utf8');

  if(!/from = "\/api\/trade-execution"[\s\S]*to = "\/\.netlify\/functions\/trade-execution"/.test(netlifyConfig)){
    throw new Error('Netlify routing must expose /api/trade-execution.');
  }
  if(!/const defaultTradeExecutionEndpoint = '\/api\/trade-execution';/.test(appSource)){
    throw new Error('App must default paper trading to /api/trade-execution.');
  }
  if(!/function refreshTrading212PaperAvailability\(/.test(appSource)){
    throw new Error('App must probe trade gateway availability before enabling paper trading.');
  }
  if(!/function tradeGatewayHealthModel\(/.test(appSource) || !/function renderTradeGatewayHealth\(/.test(appSource)){
    throw new Error('App must expose a shared trade gateway health model for Review and Settings.');
  }
  if(!/function recordTradeGatewayEvent\(/.test(appSource) || !/function renderTradeGatewayHistoryMarkup\(/.test(appSource)){
    throw new Error('App must keep a lightweight trade gateway event trail for diagnostics.');
  }
  if(!/function paperTradeTesterSetupComplete\(/.test(appSource) || !/function renderTesterSetupPanel\(/.test(appSource)){
    throw new Error('Tester onboarding must expose a persistent setup state and render path.');
  }
  if(!/click\('scannerModeLedger', \(\) => openAdvancedScannerSettings\('mode'\)\);/.test(appSource)
    || !/click\('setupTypeLedger', \(\) => openAdvancedScannerSettings\('setup'\)\);/.test(appSource)){
    throw new Error('Advanced scanner shortcuts must remain available from the header ledger.');
  }
  if(!/<button class="ledger-meta-item ledger-meta-button" type="button" id="scannerModeLedger"/.test(indexSource)
    || !/<button class="focus-rail-item" id="scannerModePill" type="button">/.test(indexSource)){
    throw new Error('Scanner mode shortcuts must remain interactive in the header and focus rail.');
  }
  if(!/id="tradeGatewayHealthLabel"/.test(indexSource) || !/id="paperTradeGatewayHealth"/.test(appSource) || !/Trade Gateway Trace/.test(appSource)){
    throw new Error('Trade gateway health and trace must remain visible in Settings and Review diagnostics.');
  }
  if(!/Tester Onboarding/.test(indexSource)
    || !/id="paperTradeApiKey"/.test(indexSource)
    || !/id="paperTradeApiSecret"/.test(indexSource)
    || !/stored only on this device/i.test(indexSource)
    || !/Paper-trading-only status: tester mode supports paper submissions only after this setup is confirmed/.test(indexSource)
    || !/Live-trading lockout: live execution is disabled in this build/.test(indexSource)
    || !/id="testerSetupConfirmBtn"/.test(indexSource)
    || !/Complete tester setup(?: in Context Settings)? to unlock paper-trade actions in Review\./.test(appSource)){
    throw new Error('Tester onboarding copy and paper-trade setup gate must remain visible.');
  }
  if(!/function handleTradeExecution\(event\)/.test(handlerSource) || !/if\(action === 'test_connection'\)/.test(handlerSource)){
    throw new Error('Trade execution handler must support runtime connection tests.');
  }
}

function selectReviewChartSourceIncludesTerminalBlockedChosen(source){
  return source.includes('const preferredTerminalBlocked = terminalBlockedCandidates[0] || null;')
    && source.includes('const chosen = (preferredTerminalBlocked || mergedCandidatesAllowed[0] || nonPendingMatchingCandidates[0] || matchingCandidates[0] || ranked[0] || null);')
    && source.includes("preferredTerminalBlocked && chosen === preferredTerminalBlocked")
    && source.includes("'terminal blocked trace'");
}

function extractRegistryAccessorSource(source){
  const start = source.indexOf('const SCANNER_PROJECTION_FIELD_REGISTRY');
  if(start < 0) throw new Error('Unable to find SCANNER_PROJECTION_FIELD_REGISTRY in app.js.');
  const helperSource = extractFunctionSource(source, 'scannerProjectionFieldRegistry');
  const helperStart = source.indexOf(helperSource, start);
  if(helperStart < 0) throw new Error('Unable to find scannerProjectionFieldRegistry after registry in app.js.');
  return source.slice(start, helperStart + helperSource.length);
}

function runReviewProjectionAssertions(){
  const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const projectionSandbox = {
    console:{
      ...console,
      warn(){}
    },
    normalizeGlobalVerdictKey(value){
      const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
      if(safe === 'near_entry' || safe === 'nearentry') return 'near_entry';
      if(['entry', 'watch', 'avoid'].includes(safe)) return safe;
      if(['dead', 'diminishing'].includes(safe)) return 'avoid';
      return safe || 'watch';
    },
    normalizeVisualBucketForPairing(value){
      const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
      if(['watch', 'monitor', 'near_entry', 'entry', 'avoid', 'diminishing', 'dead'].includes(safe)) return safe;
      if(safe === 'avoid_dead' || safe === 'terminal') return 'avoid';
      return safe;
    },
    normalizeTicker(value){
      return String(value || '').trim().toUpperCase();
    },
    numericOrNull(value){
      if(value === null || value === undefined) return null;
      if(typeof value === 'string' && value.trim() === '') return null;
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    },
    currentRrThreshold(){
      return 2;
    },
    sameVisibleCopy(a, b){
      return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
    },
    verdictPresentationLabelForKey(value){
      return String(value || '').trim();
    },
    checklistIds:['trendStrong','above50','above200','ma50gt200','near20','near50','stabilising','bounce','volume','entryDefined','stopDefined','targetDefined']
  };
  vm.createContext(projectionSandbox);
  [
    'isAllowedCanonicalVisualPair',
    'resolveStructuredExplicitInvalidationAuthorityCode',
    'hasProjectionTerminalAvoidReason',
    'terminalAvoidEvidenceForReviewCopy',
    'reviewCopyEvidence',
    'sanitizeAliveWatchSemanticCopy',
    'buildSharedSetupNarrative',
    'provisionalPlanConfirmationCopy',
    'terminalAvoidCopyPattern',
    'sanitizeNonTerminalPlanCopy',
    'resolvePlanVisibility',
    'hasUnconfirmedPriceablePlanForReviewCopy',
    'normalizeUiCopy',
    'isDuplicatedStatusCopy',
    'nonPlanCalcNoteText',
    'isAccepted50MaSupportTestDisplayState',
    'review50MaSupportTestPresentationCopy',
    'resolveCanonicalTradePlanAuthority',
    'buildReviewSemanticStatus',
    'reviewSetupQualitySummary',
    'clampReviewChecklistScore',
    'setupQualityLabelForScore',
    'resolverAlignedSetupScore',
    'scoreAndStatusFromChecks',
    'buildSummary',
    'resolvedReviewChecksForDisplay',
    'applyProjectionSnapshotToReviewBundle'
  ].forEach(functionName => {
    vm.runInContext(extractFunctionSource(appSource, functionName), projectionSandbox, {filename:`app.js#${functionName}`});
  });

  if(projectionSandbox.isAllowedCanonicalVisualPair('near_entry', 'monitor') !== true){
    throw new Error('near_entry + monitor must be an allowed Review projection pair.');
  }

  const safeProjection = projectionSandbox.applyProjectionSnapshotToReviewBundle({}, {
    ticker:'DINO',
    finalVerdict:'near_entry',
    canonicalVerdict:'near_entry',
    renderedVerdict:'near_entry',
    visualBucket:'monitor',
    sourceOfTruthVisualBucket:'monitor',
    renderedBucket:'monitor',
    terminalAvoidApplied:false,
    avoidTriggerSource:'',
    viability:'watchlist',
    actionGuidance:'Avoid - too weak or broken'
  });
  const safeVisual = safeProjection.bundle.visualState || {};
  const safeGlobal = safeProjection.bundle.globalVerdict || {};
  const safeResolved = safeProjection.bundle.resolvedContract || {};
  if(safeGlobal.final_verdict === 'avoid' || safeVisual.visualBucket === 'avoid'){
    throw new Error('Provisional near_entry + monitor projection must not coerce to avoid.');
  }
  if(safeVisual.visualBucket !== 'monitor' || safeGlobal.final_verdict !== 'near_entry'){
    throw new Error('Provisional near_entry + monitor projection did not preserve safe final/visual state.');
  }
  if(/avoid|too weak|broken/i.test(String(safeResolved.actionLabel || safeResolved.actionShortLabel || ''))){
    throw new Error('Provisional near_entry projection must not retain stale Avoid plan/action wording.');
  }

  const invalidButNonTerminal = projectionSandbox.applyProjectionSnapshotToReviewBundle({}, {
    ticker:'DINO',
    finalVerdict:'near_entry',
    canonicalVerdict:'near_entry',
    visualBucket:'diminishing',
    sourceOfTruthVisualBucket:'diminishing',
    terminalAvoidApplied:false,
    avoidTriggerSource:'',
    viability:'watchlist'
  });
  const fallbackVisual = invalidButNonTerminal.bundle.visualState || {};
  const fallbackGlobal = invalidButNonTerminal.bundle.globalVerdict || {};
  if(fallbackGlobal.final_verdict === 'avoid' || fallbackVisual.visualBucket === 'avoid'){
    throw new Error('Invalid non-terminal projection pair must fall back safely, not avoid.');
  }
  if(invalidButNonTerminal.coerced !== true || !invalidButNonTerminal.sanitizedProjectionSnapshot || invalidButNonTerminal.sanitizedProjectionSnapshot.visualBucket !== fallbackVisual.visualBucket || invalidButNonTerminal.sanitizedProjectionSnapshot.finalVerdict !== fallbackGlobal.final_verdict){
    throw new Error('Coerced Review projection must return a sanitized snapshot so stale Track projection state is not reused.');
  }

  const staleAvoidMonitor = projectionSandbox.applyProjectionSnapshotToReviewBundle({}, {
    ticker:'DINO',
    finalVerdict:'avoid',
    canonicalVerdict:'avoid',
    renderedVerdict:'avoid',
    visualBucket:'monitor',
    sourceOfTruthVisualBucket:'monitor',
    renderedBucket:'monitor',
    terminalAvoidApplied:false,
    avoidTriggerSource:'',
    structureState:'intact',
    lifecycleState:'active',
    viability:'watchlist',
    actionGuidance:'Avoid - too weak or broken',
    planStatusLabel:'Avoid - too weak or broken. Leave it alone.',
    hasProvisionalPriceablePlan:true
  });
  const staleAvoidVisual = staleAvoidMonitor.bundle.visualState || {};
  const staleAvoidGlobal = staleAvoidMonitor.bundle.globalVerdict || {};
  const staleAvoidResolved = staleAvoidMonitor.bundle.resolvedContract || {};
  if(staleAvoidGlobal.final_verdict !== 'watch' || staleAvoidVisual.finalVerdict !== 'watch' || staleAvoidVisual.renderedVerdict !== 'watch'){
    throw new Error('Stale non-terminal avoid + monitor projection must normalize final/rendered/canonical verdict to watch.');
  }
  if(staleAvoidVisual.visualBucket !== 'monitor'){
    throw new Error('Stale non-terminal avoid + monitor projection must preserve monitor visual bucket.');
  }
  if(/avoid|too weak|broken/i.test(String(staleAvoidResolved.actionLabel || staleAvoidResolved.actionShortLabel || ''))){
    throw new Error('Stale non-terminal avoid + monitor projection must not retain stale Avoid wording.');
  }
  if(/avoid|too weak|broken|leave it alone/i.test(String(staleAvoidResolved.planStatusLabel || ''))){
    throw new Error('Stale non-terminal avoid + monitor projection must sanitize stale Avoid plan status wording.');
  }

  const staleAvoidPlanCopy = projectionSandbox.resolvePlanVisibility({
    state:'watch',
    finalVerdict:'watch',
    visualBucket:'monitor',
    structure:'intact',
    bounce_state:'attempt',
    near_entry_gate_pass:true,
    terminal_avoid_applied:false,
    avoid_trigger_source:'',
    lifecycle:'active',
    hasProvisionalPriceablePlan:true,
    stalePlanStatus:'Avoid - too weak or broken. Leave it alone.'
  });
  if(/avoid|too weak|broken|leave it alone/i.test(String(staleAvoidPlanCopy.diagnosticsMessage || ''))){
    throw new Error('Non-terminal watch/monitor provisional plan copy must not display stale Avoid wording.');
  }
  if(!/provisional plan|confirmation/i.test(String(staleAvoidPlanCopy.diagnosticsMessage || ''))){
    throw new Error('Non-terminal provisional plan copy must use confirmation/provisional wording.');
  }
  const diminishingPlanCopy = projectionSandbox.resolvePlanVisibility({
    state:'diminishing',
    finalVerdict:'watch',
    visualBucket:'diminishing',
    structure:'weakening',
    bounce_state:'attempt',
    terminal_avoid_applied:false,
    avoid_trigger_source:'',
    lifecycle:'active',
    viability:'watchlist'
  });
  if(!/weakening|fading|losing momentum/i.test(String(diminishingPlanCopy.diagnosticsMessage || ''))){
    throw new Error('Non-terminal diminishing plan copy must preserve deterioration wording.');
  }
  const missingPlanCopy = projectionSandbox.nonPlanCalcNoteText('', '', {
    bounce_state:'attempt',
    hasPriceablePlan:false,
    hasProvisionalPriceablePlan:false,
    terminal_avoid_applied:false
  });
  if(missingPlanCopy !== 'No actionable plan yet.'){
    throw new Error('Missing/unpriceable plan calc note must remain "No actionable plan yet."');
  }
  const provisionalCalcCopy = projectionSandbox.nonPlanCalcNoteText('', '', {
    bounce_state:'attempt',
    hasPriceablePlan:true,
    hasProvisionalPriceablePlan:false,
    terminal_avoid_applied:false
  });
  if(!/confirmation/i.test(String(provisionalCalcCopy || ''))){
    throw new Error('Unconfirmed priceable plan calc note must use confirmation wording.');
  }

  const explicitTerminalAvoidPlanCopy = projectionSandbox.resolvePlanVisibility({
    state:'avoid',
    finalVerdict:'avoid',
    visualBucket:'avoid',
    structure:'broken',
    bounce_state:'attempt',
    terminal_avoid_applied:true,
    avoid_trigger_source:'structure_broken',
    lifecycle:'dead',
    viability:'reject'
  });
  if(!/avoid|too weak|broken|leave it alone/i.test(String(explicitTerminalAvoidPlanCopy.diagnosticsMessage || ''))){
    throw new Error('Terminal Avoid plan copy must still display Avoid wording.');
  }

  const nearEntryProvisionalPlanVisibility = projectionSandbox.resolvePlanVisibility({
    state:'near_entry',
    finalVerdict:'near_entry',
    visualBucket:'near_entry',
    structure:'intact',
    bounce_state:'attempt',
    terminal_avoid_applied:false,
    avoid_trigger_source:'',
    lifecycle:'active',
    hasProvisionalPriceablePlan:true
  });
  if(nearEntryProvisionalPlanVisibility.showPlan !== true || nearEntryProvisionalPlanVisibility.showRR !== true || nearEntryProvisionalPlanVisibility.showCapital !== true){
    throw new Error('Near Entry provisional plans must remain visible in execution/debug plan visibility state.');
  }
  if(!/provisional plan|confirmation/i.test(String(nearEntryProvisionalPlanVisibility.diagnosticsMessage || ''))){
    throw new Error('Near Entry provisional plan visibility must keep confirmation wording instead of hiding the plan.');
  }

  const terminalAvoid = projectionSandbox.applyProjectionSnapshotToReviewBundle({}, {
    ticker:'DINO',
    finalVerdict:'avoid',
    canonicalVerdict:'avoid',
    renderedVerdict:'avoid',
    visualBucket:'monitor',
    sourceOfTruthVisualBucket:'monitor',
    renderedBucket:'monitor',
    terminalAvoidApplied:true,
    avoidTriggerSource:'terminal_avoid',
    structureState:'broken',
    lifecycleState:'dead',
    viability:'reject',
    actionGuidance:'Avoid - too weak or broken',
    planStatusLabel:'Avoid - too weak or broken. Leave it alone.'
  });
  const terminalVisual = terminalAvoid.bundle.visualState || {};
  const terminalGlobal = terminalAvoid.bundle.globalVerdict || {};
  const terminalResolved = terminalAvoid.bundle.resolvedContract || {};
  if(terminalGlobal.final_verdict !== 'avoid' || terminalVisual.visualBucket !== 'avoid'){
    throw new Error('Terminal avoid projection must remain avoid.');
  }
  if(!/avoid|too weak|broken/i.test(String(terminalResolved.actionLabel || terminalResolved.planStatusLabel || ''))){
    throw new Error('Terminal avoid projection must retain terminal Avoid wording.');
  }

  const suppressedTrackPromotion = projectionSandbox.applyProjectionSnapshotToReviewBundle({
    canonicalContract:{canonicalVerdictKey:'watch'},
    resolvedContract:{finalVerdict:'watch', visualBucket:'monitor', presentationBucket:'monitor'},
    visualState:{canonicalVerdict:'watch', finalVerdict:'watch', visualBucket:'monitor', presentationBucket:'monitor'},
    globalVerdict:{final_verdict:'watch'}
  }, {
    ticker:'DINO',
    canonicalVerdict:'watch',
    finalVerdict:'near_entry',
    renderedVerdict:'near_entry',
    visualBucket:'near_entry',
    sourceOfTruthVisualBucket:'near_entry',
    renderedBucket:'near_entry',
    terminalAvoidApplied:false,
    avoidTriggerSource:'',
    structureState:'intact',
    lifecycleState:'active',
    viability:'watchlist'
  });
  const suppressedVisual = suppressedTrackPromotion.bundle.visualState || {};
  const suppressedGlobal = suppressedTrackPromotion.bundle.globalVerdict || {};
  if(suppressedGlobal.final_verdict !== 'watch' || suppressedVisual.finalVerdict !== 'watch' || suppressedVisual.renderedVerdict !== 'watch'){
    throw new Error('Track projection must not promote fresh watch resolver state to near_entry.');
  }
  if(suppressedVisual.visualBucket !== 'monitor'){
    throw new Error('Suppressed track projection promotion must keep monitor visual bucket.');
  }
  if(suppressedVisual.reviewProjectionPromotionSuppressed !== true || !suppressedVisual.reviewProjectionPromotionSuppressedReason){
    throw new Error('Suppressed track projection promotion must expose debug suppression fields.');
  }

  const authoritativeNearEntry = projectionSandbox.applyProjectionSnapshotToReviewBundle({
    canonicalContract:{canonicalVerdictKey:'near_entry'},
    resolvedContract:{finalVerdict:'near_entry', visualBucket:'near_entry', presentationBucket:'near_entry'},
    visualState:{canonicalVerdict:'near_entry', finalVerdict:'near_entry', visualBucket:'near_entry', presentationBucket:'near_entry'},
    globalVerdict:{final_verdict:'near_entry'}
  }, {
    ticker:'DINO',
    canonicalVerdict:'near_entry',
    finalVerdict:'near_entry',
    renderedVerdict:'near_entry',
    visualBucket:'near_entry',
    sourceOfTruthVisualBucket:'near_entry',
    renderedBucket:'near_entry',
    terminalAvoidApplied:false,
    avoidTriggerSource:'',
    structureState:'intact',
    lifecycleState:'active',
    viability:'watchlist'
  });
  const authoritativeVisual = authoritativeNearEntry.bundle.visualState || {};
  const authoritativeGlobal = authoritativeNearEntry.bundle.globalVerdict || {};
  if(authoritativeGlobal.final_verdict !== 'near_entry' || authoritativeVisual.visualBucket !== 'near_entry'){
    throw new Error('Authoritative fresh near_entry resolver state must remain near_entry.');
  }

  const rawBullishChecklist = {
    trendStrong:true,
    above50:true,
    above200:true,
    ma50gt200:true,
    near20:false,
    near50:true,
    stabilising:true,
    bounce:true,
    volume:true,
    entryDefined:true,
    stopDefined:true,
    targetDefined:true
  };
  const blockedChecklistContext = {
    canonicalVerdict:'avoid',
    visualBucket:'avoid',
    mainBlocker:'Structure is broken.',
    planVisible:false,
    planStatus:'invalid',
    planValid:false,
    entry:100,
    stop:102,
    target:98,
    structureState:'weak',
    bounceState:'none',
    stabilisationState:'none',
    pullbackZone:'near_50ma',
    viability:'reject',
    rejectedByViabilityGate:true
  };
  const displayedChecklist = projectionSandbox.resolvedReviewChecksForDisplay(rawBullishChecklist, blockedChecklistContext);
  const blockedChecklistScore = projectionSandbox.scoreAndStatusFromChecks(displayedChecklist, blockedChecklistContext);
  const blockedChecklistSummary = projectionSandbox.buildSummary(displayedChecklist, blockedChecklistScore.status, blockedChecklistContext);
  if(blockedChecklistScore.score >= 10){
    throw new Error('Blocked Review checklist must not display 10/10 when the effective plan is invalid.');
  }
  if(displayedChecklist.entryDefined !== true || displayedChecklist.stopDefined !== false || displayedChecklist.targetDefined !== false){
    throw new Error('Review checklist plan fields must reflect the effective valid long-plan shape.');
  }
  if(!/^Avoid for now/i.test(String(blockedChecklistSummary || '')) || /Strong uptrend|broken/i.test(String(blockedChecklistSummary || ''))){
    throw new Error('Blocked Review checklist summary must lead with blocked/no-actionable-plan language, not bullish summary copy.');
  }

  const brokenStructureChecklistContext = {
    canonicalVerdict:'avoid',
    visualBucket:'avoid',
    mainBlocker:'',
    planVisible:true,
    planStatus:'valid',
    planValid:true,
    entry:100,
    stop:95,
    target:115,
    structureState:'broken',
    bounceState:'none',
    stabilisationState:'none',
    pullbackZone:'near_50ma',
    viability:'reject',
    rejectedByViabilityGate:true,
    terminalAvoidApplied:true,
    entryGatePass:false,
    nearEntryGatePass:false
  };
  const brokenStructureChecklist = projectionSandbox.resolvedReviewChecksForDisplay(rawBullishChecklist, brokenStructureChecklistContext);
  const brokenStructureScore = projectionSandbox.scoreAndStatusFromChecks(brokenStructureChecklist, brokenStructureChecklistContext);
  const brokenStructureSummary = projectionSandbox.buildSummary(
    brokenStructureChecklist,
    brokenStructureScore.status,
    brokenStructureChecklistContext
  );
  if(brokenStructureScore.score > 2 || brokenStructureScore.qualityLabel !== 'Poor'){
    throw new Error('Terminal broken-structure Review quality must be capped low even when raw checklist fields are bullish.');
  }
  if(/Strong uptrend/i.test(String(brokenStructureSummary || '')) || !/pullback structure is broken|No entry until/i.test(String(brokenStructureSummary || ''))){
    throw new Error('Terminal broken-structure Review summary must not use bullish checklist summary copy.');
  }
  if(/Checks met\s*:/i.test(appSource) || /review-checklist-panel/.test(appSource)){
    throw new Error('Review must not render the legacy visible checklist count/panel.');
  }

  const aliveVolatileSemantic = projectionSandbox.buildReviewSemanticStatus({
    simplifiedState:{
      canonicalVerdict:'watch',
      mainBlocker:'Trend is weakening - no reliable stop level yet.',
      planStatus:'valid',
      planVisible:true,
      entryGatePass:false,
      nearEntryGatePass:false
    },
    globalVerdict:{
      final_verdict:'watch',
      structure_state:'strong',
      structure_eligibility:'alive',
      setup_location_state:'volatile',
      priceability_state:'unpriceable',
      bounce_state:'attempt',
      main_blocker:'Trend is weakening - no reliable stop level yet.'
    },
    derivedStates:{
      structureState:'strong',
      setupLocationState:'volatile',
      priceabilityState:'unpriceable',
      bounceState:'attempt',
      stabilisationState:'none'
    },
    displayedPlan:{
      status:'valid',
      entry:100,
      stop:95,
      target:115,
      rewardRisk:{valid:true, rrRatio:3}
    },
    planRealism:{raw_rr:3}
  });
  const aliveVolatileText = [
    aliveVolatileSemantic.blocker,
    aliveVolatileSemantic.tradeStatus && aliveVolatileSemantic.tradeStatus.line1,
    aliveVolatileSemantic.tradeStatus && aliveVolatileSemantic.tradeStatus.line2,
    aliveVolatileSemantic.rrDisplay
  ].join(' | ');
  if(/Trend is weakening|structure.*(?:broken|weakening)|failed/i.test(aliveVolatileText)){
    throw new Error('Alive volatile/recovery Review semantics must not use structural weakening wording.');
  }
  if(!/Recovery attempt|stabilised|price reliably|Draft plan possible but weak|No actionable trade yet|Valid plan, waiting for confirmation|The app knows the maths, but the trade isn't ready|Long-press the ticker card in Track|Priced/i.test(aliveVolatileText)){
    throw new Error('Alive volatile/recovery Review semantics must use recovery/priceability or priced-but-not-ready wording.');
  }

  const tgtStyleAliveWatchSemantic = projectionSandbox.buildReviewSemanticStatus({
    simplifiedState:{
      canonicalVerdict:'watch',
      mainBlocker:'No valid invalidation level is available.',
      planStatus:'missing',
      planVisible:false,
      entryGatePass:false,
      nearEntryGatePass:false
    },
    globalVerdict:{
      final_verdict:'watch',
      structure_state:'developing_clean',
      structure_eligibility:'alive',
      setup_location_state:'near_50ma',
      priceability_state:'unpriceable',
      bounce_state:'attempt',
      main_blocker:'No valid invalidation level is available.'
    },
    derivedStates:{
      structureState:'developing_clean',
      setupLocationState:'near_50ma',
      priceabilityState:'unpriceable',
      bounceState:'attempt',
      stabilisationState:'early',
      volumeState:'weak'
    },
    displayedPlan:{status:'missing'},
    planRealism:{}
  });
  const tgtStyleText = [
    tgtStyleAliveWatchSemantic.primaryReason,
    tgtStyleAliveWatchSemantic.blocker,
    tgtStyleAliveWatchSemantic.tradeStatus && tgtStyleAliveWatchSemantic.tradeStatus.line1,
    tgtStyleAliveWatchSemantic.tradeStatus && tgtStyleAliveWatchSemantic.tradeStatus.line2,
    tgtStyleAliveWatchSemantic.rrDisplay
  ].join(' | ');
  if(!/support is still being tested|buyer control is only starting to emerge|support is reacting|buyers are starting to step in/i.test(tgtStyleText) || !/clear support level for managing risk|Trade remains unpriceable|No actionable trade yet/i.test(tgtStyleText)){
    throw new Error('TGT-style alive Watch copy must frame the setup as a developing support response with missing support/risk structure and no trade yet.');
  }
  if(/structure (?:looks )?(?:weak|broken)|no signs of stabilisation|no bounce yet|no signs.*bounce/i.test(tgtStyleText)){
    throw new Error('TGT-style alive Watch copy must not imply weak/broken structure or absent bounce.');
  }

  const sanitizedAliveAiCopy = projectionSandbox.sanitizeAliveWatchSemanticCopy(
    'Overall structure looks weak. No signs of stabilisation or a bounce yet.',
    {
      finalVerdict:'watch',
      structureState:'developing_clean',
      structureEligibility:'alive',
      setupLocationState:'near_50ma',
      priceabilityState:'unpriceable',
      bounceState:'attempt',
      stabilisationState:'early'
    }
  );
  if(!/broader uptrend is still intact|bounce attempt|price reliably/i.test(sanitizedAliveAiCopy)){
    throw new Error('AI summary sanitisation must rewrite stale weak/no-bounce copy for alive bounce-attempt Watch setups.');
  }
  if(/structure (?:looks )?(?:weak|broken)|no signs of stabilisation|no bounce yet|no signs.*bounce/i.test(sanitizedAliveAiCopy)){
    throw new Error('AI summary sanitisation must not leave weak/no-bounce wording when bounce attempt exists.');
  }

  const genuineNoBounceCopy = projectionSandbox.sanitizeAliveWatchSemanticCopy(
    'No signs of stabilisation or a bounce yet.',
    {
      finalVerdict:'watch',
      structureState:'strong',
      structureEligibility:'alive',
      priceabilityState:'unpriceable',
      bounceState:'none',
      stabilisationState:'none'
    }
  );
  if(!/No signs of stabilisation or a bounce yet/i.test(genuineNoBounceCopy)){
    throw new Error('Genuine no-bounce setups may still use no-bounce wording.');
  }

  const genuineDamagedCopy = projectionSandbox.sanitizeAliveWatchSemanticCopy(
    'Structure looks weak and no bounce yet.',
    {
      finalVerdict:'watch',
      structureState:'weakening',
      structureEligibility:'damaged',
      priceabilityState:'unpriceable',
      bounceState:'none'
    }
  );
  if(!/Structure looks weak/i.test(genuineDamagedCopy)){
    throw new Error('Genuine damaged/weakening setups may still use weak-structure wording.');
  }

  const fallingKnifeCopyPreserved = projectionSandbox.sanitizeAliveWatchSemanticCopy(
    'Selling pressure is accelerating  wait for the stock to stabilise before reassessing.',
    {
      finalVerdict:'avoid',
      visualBucket:'avoid',
      structureState:'weakening',
      structureEligibility:'damaged',
      priceabilityState:'unpriceable',
      bounceState:'none',
      semantic_blocker_code:'falling_knife'
    }
  );
  if(!/Selling pressure is accelerating/i.test(fallingKnifeCopyPreserved)){
    throw new Error('Falling-knife Avoid copy must be preserved by alive Watch sanitisation.');
  }

  const trueWeakeningSemantic = projectionSandbox.buildReviewSemanticStatus({
    simplifiedState:{canonicalVerdict:'watch', mainBlocker:'Trend is weakening - no reliable stop level yet.', planStatus:'valid', planVisible:true},
    globalVerdict:{final_verdict:'watch', structure_state:'weakening', structure_eligibility:'damaged', main_blocker:'Trend is weakening - no reliable stop level yet.'},
    derivedStates:{structureState:'weakening'},
    displayedPlan:{status:'valid', entry:50, stop:47, target:59, rewardRisk:{valid:true, rrRatio:3}},
    planRealism:{raw_rr:3}
  });
  if(!/Trend is weakening/i.test(String(trueWeakeningSemantic.blocker || ''))){
    throw new Error('True weakening setup may still render trend weakening wording.');
  }

  const recoveryChecklistContext = {
    canonicalVerdict:'watch',
    visualBucket:'diminishing',
    mainBlocker:'Avoid for now — setup is too volatile to price reliably.',
    planVisible:false,
    planStatus:'invalid',
    planValid:false,
    entry:250,
    stop:255,
    target:245,
    structureState:'broken',
    bounceState:'attempt',
    stabilisationState:'none',
    pullbackZone:'extended',
    viability:'low_priority',
    rejectedByViabilityGate:false,
    nonTerminalRecoveryBlocker:true
  };
  const recoveryChecklist = projectionSandbox.resolvedReviewChecksForDisplay(rawBullishChecklist, recoveryChecklistContext);
  const recoverySummary = projectionSandbox.buildSummary(
    recoveryChecklist,
    projectionSandbox.scoreAndStatusFromChecks(recoveryChecklist, recoveryChecklistContext).status,
    recoveryChecklistContext
  );
  if(recoveryChecklist.stabilising === true || recoveryChecklist.targetDefined === true){
    throw new Error('Volatile recovery checklist must not keep stabilising/target checks from raw bullish inputs.');
  }
  if(/Structure is broken|Strong uptrend/i.test(String(recoverySummary || '')) || !/volatile|Entry, stop, and target cannot be priced reliably yet/i.test(String(recoverySummary || ''))){
    throw new Error('Volatile recovery checklist summary must use non-terminal volatility/no-actionable-plan wording.');
  }
}

function runEntryConditionsSummaryAssertions(){
  const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const appShellSource = fs.readFileSync(path.join(root, 'js/shell/app-shell.js'), 'utf8');
  const stylesSource = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
  if(!/entryConditionsHoldBound/.test(appSource) || !/bindEntryConditionsHoldInteractions\(div\)/.test(appSource)){
    throw new Error('Watchlist long-press helper binding diagnostics must be wired to the active card renderer.');
  }
  if(!/cardMode\s*\?\s*localPanel/.test(appSource)){
    throw new Error('Track card long-press binding must prefer the replacement card local panel over stale document panel ids.');
  }
  if(!/existingCard\.remove\(\)/.test(appSource) || !/watchlist_remove/.test(appSource)){
    throw new Error('Track remove must immediately remove the visible card and invalidate watchlist render state.');
  }
  if(/positionWorkspaceViewport|trackFocusedOnce|trackScrollOffsetY/.test(appShellSource)){
    throw new Error('Track tab focus must not use first-focus auto-scroll positioning.');
  }
  if(!/saveActiveWorkspaceScroll/.test(appShellSource) || !/uiState\.trackScrollY/.test(appShellSource) || !/restoreWorkspaceViewportAfterOpen\(appliedTab\)/.test(appShellSource)){
    throw new Error('Track tab focus must save and restore the last Track scroll position.');
  }
  if(!/lastKnownScrollByTab/.test(appShellSource) || !/pendingTrackRestoreY/.test(appShellSource) || !/__ppPendingTrackRestoreY/.test(appShellSource)){
    throw new Error('Track restore must use an immutable per-tab restore target during tab switches and renders.');
  }
  if(!/window\.__ppPendingTrackRestoreY = undefined/.test(appShellSource) || !/lastKnownScrollByTab\.track = uiState\.trackScrollY/.test(appShellSource)){
    throw new Error('Track pending restore targets must clear after restore/user scroll, and scroll-to-top must update per-tab memory.');
  }
  if(!/scheduleTrackRestore/.test(appShellSource) || !/track:scroll-restore-retry/.test(appShellSource) || !/restoreActualAfter/.test(appShellSource)){
    throw new Error('Track restore must run after layout and retry when the first scrollTo is clamped.');
  }
  if(!/track:scroll-restore:verify/.test(appShellSource) || !/track_restore_verify_retry/.test(appShellSource) || !/post_focus_drift/.test(appShellSource)){
    throw new Error('Track restore must verify after post-focus drift and retry without saving drift positions.');
  }
  if(!/no-smooth-scroll/.test(stylesSource) || !/setSmoothScrollDisabled/.test(appShellSource) || !/computedHtmlScrollBehavior/.test(appShellSource) || !/track_restore_aborted/.test(appShellSource)){
    throw new Error('Track restore must temporarily disable CSS smooth scrolling and trace computed scroll behavior.');
  }
  if(!/!\['track','review'\]\.includes\(appliedTab\)/.test(appShellSource)){
    throw new Error('Track and Review tab focus must avoid forcing window scroll to top.');
  }
  if(/scheduleReviewWorkspaceScroll|scheduleReviewScrollAfterLoad|scrollReviewSectionIntoView/.test(appSource)){
    throw new Error('Review focus must not use delayed or post-render auto-scroll helpers.');
  }
  if(!/primeWorkspaceViewportBeforeOpen\(nextTab\);[\s\S]{0,120}applyWorkspace\(nextTab\)/.test(appShellSource)){
    throw new Error('Review tab activation must prime the viewport before showing Review to avoid a visible jump.');
  }
  if(!/reviewInitialTopPositioned/.test(appShellSource) || !/if\(uiState\.reviewInitialTopPositioned === true\)[\s\S]{0,400}return/.test(appShellSource)){
    throw new Error('Review top positioning must run only once per session.');
  }
  if(!/previousTab === 'review' && nextTab !== 'review'/.test(appShellSource) || !/review_initial_positioning_complete/.test(appShellSource)){
    throw new Error('Review top positioning must reset between Review opens and avoid smooth-scroll animation.');
  }
  if(!/suppressScrollMemory/.test(appShellSource) || !/track:scroll-save-suppressed/.test(appShellSource) || !/__ppSuppressScrollMemoryUntil/.test(appShellSource)){
    throw new Error('Programmatic scrolls must suppress Track scroll-memory overwrites.');
  }
  if(!/extendActiveScrollSuppression/.test(appShellSource) || !/_settling/.test(appShellSource)){
    throw new Error('Programmatic scroll suppression must extend until scroll movement settles.');
  }
  if(!/review_initial_positioning/.test(appShellSource) || !/scroll_to_top_button/.test(appShellSource) || !/track_restore/.test(appShellSource)){
    throw new Error('Review positioning, Track restore, and Track scroll-to-top must carry explicit scroll-memory suppression reasons.');
  }
  if(!/isWorkspaceVisiblyActive/.test(appShellSource) || !/blocked_not_active_visible_track/.test(appShellSource)){
    throw new Error('Track scroll memory must only be saved when Track is the active visible workspace.');
  }
  if(/normalized === 'review'[\s\S]{0,160}scrollWindowTo/.test(appShellSource)){
    throw new Error('Review subsequent tab focuses must not force scroll restoration.');
  }
  if(!/__ppPendingTrackRestoreY/.test(appSource) || !/pendingRestoreApplied/.test(appSource) || !/function restoreTrackUiState[\s\S]*?window\.scrollTo\(\{top:Math\.max\(0, targetScrollY\), behavior:'auto'\}\)/.test(appSource)){
    throw new Error('Track render/remove/refresh must preserve the captured Track page scroll position after DOM updates.');
  }
  if(!/trackScrollTopBtn/.test(appShellSource)){
    throw new Error('Track floating scroll-to-top control must be wired in the app shell.');
  }
  if(!/suppressScrollMemoryForAppScroll/.test(appSource) || !/track_dom_update_restore/.test(appSource)){
    throw new Error('App-level programmatic scrolls must suppress Track scroll-memory saves.');
  }
  if(!/actualTrackPageScrollTop/.test(appSource) || /const scrollTop = Number\(trackWorkspace\.scrollTop/.test(appSource) || !/page_not_at_top/.test(appSource)){
    throw new Error('Track pull-to-refresh must use page scroll, not trackWorkspace.scrollTop, for top eligibility.');
  }
  if(!/track:deferred-startup-refresh:start/.test(appSource) || !/startup_refresh_full_user_open/.test(appSource)){
    throw new Error('Deferred Track startup refresh must be traced distinctly from manual refreshes.');
  }
  if(!/isAdvancedDebugVisible/.test(appSource) || !/reviewAdvancedDebugTap/.test(appSource)){
    throw new Error('Review debug panels must be gated behind the advanced debug reveal path.');
  }
  if(!/data-advanced-debug-trigger/.test(appSource) || !/reviewAdvancedDebugFeedbackNode/.test(appSource) || !/document\.body\.addEventListener\('click', handleReviewAdvancedDebugTap, true\)/.test(appSource)){
    throw new Error('Review advanced debug reveal must be delegated from the Review watchlist status button.');
  }
  const summarySandbox = {
    normalizeGlobalVerdictKey(value){
      const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
      if(safe === 'nearentry') return 'near_entry';
      if(['entry','near_entry','watch','avoid'].includes(safe)) return safe;
      return 'watch';
    },
    normalizeVisualBucketForPairing(value){
      const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
      if(['entry','near_entry','monitor','diminishing','avoid'].includes(safe)) return safe;
      return 'monitor';
    },
    sameVisibleCopy(a, b){
      return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
    },
    normalizeVerdict(value){
      const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
      if(safe === 'near_entry' || safe === 'nearentry') return 'near_entry';
      if(['entry','watch','avoid','dead','monitor','developing'].includes(safe)) return safe;
      return safe || 'watch';
    },
    normalizeTicker(value){
      return String(value || '').trim().toUpperCase();
    },
    numericOrNull(value){
      if(value === null || value === undefined) return null;
      if(typeof value === 'string' && value.trim() === '') return null;
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    }
  };
  vm.createContext(summarySandbox);
  [
    'savedReviewSummaryForRecord',
    'currentRuntimeSummaryForRecord',
    'buildSharedSetupNarrative',
    'isAccepted50MaSupportTestDisplayState',
    'review50MaSupportTestPresentationCopy',
    'resolveSetupPatternUi',
    'entryTriggerConditionForSummary',
    'nextUpgradeStateForSummary',
    'nextUpgradeStateForSummaryLabel',
    'buildEntryConditionsSummary',
    'buildTrackLongPressContract',
    'buildTrackTickerSpecificEntryConditionsSummary'
  ].forEach(functionName => {
    vm.runInContext(extractFunctionSource(appSource, functionName), summarySandbox, {filename:`app.js#${functionName}`});
  });

  const healthyMissingPlan = summarySandbox.buildTrackTickerSpecificEntryConditionsSummary({
    ticker:'MAR',
    finalVerdict:'watch',
    presentationState:'monitor',
    resolvedContract:{planStatusKey:'missing', structuralState:'developing', rrConfidenceLabel:'invalid'},
    globalVerdict:{
      final_verdict:'watch',
      setup_score:8,
      entry_gate_pass:false,
      entry_gate_checks:{structure_ok:true, bounce_ok:false, plan_ok:false, pullback_ok:false, rr_ok:false, volume_ok:false}
    },
    derivedStates:{structureState:'strong', trendState:'strong', bounceState:'none', stabilisationState:'none', pullbackZone:'none', volumeState:'weak'},
    displayedPlan:{}
  });
  const healthyText = [healthyMissingPlan.header, healthyMissingPlan.primary, healthyMissingPlan.definitionLine, healthyMissingPlan.footer, healthyMissingPlan.secondary && healthyMissingPlan.secondary.join(' ')].join(' ');
  if(!healthyMissingPlan.show || !/bounce still needs to form|reliable rebound from support|clearer bounce|consolidating near recent highs|no low-risk entry area has formed yet|pullback into support|breakout from the current range/i.test(healthyText)){
    throw new Error('Healthy missing-plan/no-bounce Watch long-press summary must describe confirmation or consolidation, not deterioration.');
  }
  if(/weak pullback|weakening|damaged|deteriorating|losing quality/i.test(healthyText)){
    throw new Error('Healthy Watch long-press summary must not use weak/damaged/deteriorating language.');
  }

  const missingPlanOnly = summarySandbox.buildTrackTickerSpecificEntryConditionsSummary({
    ticker:'BK',
    finalVerdict:'watch',
    presentationState:'monitor',
    resolvedContract:{planStatusKey:'missing', structuralState:'watchlist'},
    globalVerdict:{
      final_verdict:'watch',
      setup_score:9,
      entry_gate_checks:{structure_ok:true, bounce_ok:false, plan_ok:false, pullback_ok:true, rr_ok:false}
    },
    derivedStates:{structureState:'strong', trendState:'strong', bounceState:'attempt', stabilisationState:'early', pullbackZone:'near_20ma', volumeState:'supportive'},
    displayedPlan:{}
  });
  const missingPlanText = [missingPlanOnly.primary, missingPlanOnly.footer].join(' ');
  if(!/stronger confirmation|developing watch|clearer support|considering an entry/i.test(missingPlanText)){
    throw new Error('Missing plan alone must produce plan-pending long-press wording.');
  }
  if(/diminishing|weakening|deteriorating|damaged/i.test(missingPlanText)){
    throw new Error('Missing plan alone must not produce Diminishing long-press wording.');
  }

  const trueDiminishing = summarySandbox.buildTrackTickerSpecificEntryConditionsSummary({
    ticker:'DOW',
    finalVerdict:'watch',
    presentationState:'diminishing',
    resolvedContract:{planStatusKey:'valid', structuralState:'developing'},
    globalVerdict:{
      final_verdict:'watch',
      setup_score:5,
      main_blocker:'Trend is weakening - no reliable stop level yet.',
      viabilityBranchId:'damaged_tradeability_rr_fail_softened_low_priority',
      entry_gate_checks:{structure_ok:false, bounce_ok:false, plan_ok:true, rr_ok:false}
    },
    derivedStates:{structureState:'weakening', trendState:'weak', bounceState:'none', stabilisationState:'none', pullbackZone:'none', volumeState:'normal'},
    displayedPlan:{}
  });
  const diminishingText = [trueDiminishing.header, trueDiminishing.primary, trueDiminishing.definitionLine, trueDiminishing.secondary && trueDiminishing.secondary.join(' ')].join(' ');
  if(!/diminishing|weakening|deteriorating|stabilise|quality/i.test(diminishingText)){
    throw new Error('True Diminishing long-press summary must retain weakening/fading language.');
  }

  const terminalAvoid = summarySandbox.buildTrackTickerSpecificEntryConditionsSummary({
    ticker:'AVD',
    finalVerdict:'avoid',
    presentationState:'avoid',
    resolvedContract:{planStatusKey:'invalid'},
    globalVerdict:{final_verdict:'avoid', terminal_avoid_applied:true},
    derivedStates:{structureState:'broken'},
    displayedPlan:{}
  });
  const terminalAvoidText = [terminalAvoid.header, terminalAvoid.primary, terminalAvoid.definitionLine, terminalAvoid.secondary && terminalAvoid.secondary.join(' ')].join(' ');
  if(terminalAvoid.show !== true || !/avoid|blocked|broken|repair/i.test(terminalAvoidText)){
    throw new Error('Terminal Avoid long-press summary must remain clearly blocked/avoid.');
  }

  const nearEntrySpecific = summarySandbox.buildTrackTickerSpecificEntryConditionsSummary({
    record:{
      entryPromotionAudit:{
        latest:{
          failedEntryChecks:[
            {id:'entry_trigger_hit', label:'Entry trigger hit', classification:'trigger'},
            {id:'bounce_ok', label:'Buyer control confirmed and priceable', classification:'temporary'}
          ],
          nextRequiredAction:'Entry trigger hit'
        }
      }
    },
    ticker:'NVDA',
    finalVerdict:'near_entry',
    presentationState:'near_entry',
    resolvedContract:{planStatusKey:'valid', structuralState:'monitor'},
    globalVerdict:{
      final_verdict:'near_entry',
      entry_gate_pass:false,
      resolved_rr:2,
      cumulativePenaltyTrace:{sources:[{id:'bounce_unconfirmed', present:true, terminal:false, appliedWhere:['warning_state']}]}
    },
    derivedStates:{structureState:'strong', structureEligibility:'alive', bounceState:'improving', pullbackZone:'near_20ma'},
    displayedPlan:{rewardRisk:{rrRatio:2}}
  });
  const nearEntryText = [nearEntrySpecific.primary, nearEntrySpecific.definitionLine, nearEntrySpecific.triggerLine, nearEntrySpecific.futureStateLine].join(' ');
  if(!/Near Entry/i.test(nearEntrySpecific.header || '') || !/structure is strong/i.test(nearEntryText) || !/20MA/i.test(nearEntryText) || !/2\.0R/i.test(nearEntryText) || !/confirmation/i.test(nearEntryText)){
    throw new Error('Near Entry Track long-press must explain the constructive setup, valid plan, and missing confirmation.');
  }
  if(!/Entry trigger hit/i.test(String(nearEntrySpecific.whyNotEntry || ''))){
    throw new Error('Near Entry Track long-press must expose the latest failed Entry checks.');
  }

  const entryReady = summarySandbox.buildTrackTickerSpecificEntryConditionsSummary({
    ticker:'ANET',
    finalVerdict:'entry',
    presentationState:'entry',
    resolvedContract:{planStatusKey:'valid'},
    globalVerdict:{final_verdict:'entry', entry_gate_pass:true, resolved_rr:2.4},
    derivedStates:{structureState:'intact', bounceState:'confirmed', pullbackZone:'near_20ma'},
    displayedPlan:{rewardRisk:{rrRatio:2.4}}
  });
  if(entryReady.show !== true || entryReady.ready !== true || !/entry trigger has passed/i.test(String(entryReady.primary || ''))){
    throw new Error('Entry Track long-press must stay visible and explain why the setup is actionable.');
  }

  const fallbackGeneric = summarySandbox.buildTrackTickerSpecificEntryConditionsSummary({
    record:{review:{savedSummary:'Last review: waiting for fresh chart context.'}},
    ticker:'MSFT',
    finalVerdict:'watch',
    presentationState:'monitor',
    resolvedContract:{},
    globalVerdict:{final_verdict:'watch'},
    derivedStates:{},
    displayedPlan:{}
  });
  if(!/fresh chart context|review data/i.test([fallbackGeneric.primary, fallbackGeneric.definitionLine, fallbackGeneric.triggerLine].join(' '))){
    throw new Error('Track long-press must fall back to record-specific saved summary before generic bucket copy when structured state is missing.');
  }
  if(fallbackGeneric.source !== 'saved_summary_fallback' || fallbackGeneric.fallbackSummary !== 'Last review: waiting for fresh chart context.'){
    throw new Error('Saved-summary fallback must be explicit in the Track long-press contract.');
  }

  const emptyFallback = summarySandbox.buildTrackTickerSpecificEntryConditionsSummary({
    ticker:'SHOP',
    finalVerdict:'watch',
    presentationState:'monitor',
    resolvedContract:{},
    globalVerdict:{final_verdict:'watch'},
    derivedStates:{},
    displayedPlan:{}
  });
  if(emptyFallback.source !== 'generic_fallback' || !emptyFallback.why || !emptyFallback.stillMissing || !emptyFallback.upgrade || !emptyFallback.downgrade){
    throw new Error('Generic Track fallback must populate normalized why/stillMissing/upgrade/downgrade fields.');
  }

  const supportTest = summarySandbox.buildTrackTickerSpecificEntryConditionsSummary({
    ticker:'HWM',
    finalVerdict:'watch',
    presentationState:'monitor',
    resolvedContract:{planStatusKey:'missing'},
    globalVerdict:{final_verdict:'watch', pullback_ok:true},
    derivedStates:{structureState:'weak', structureEligibility:'alive', bounceState:'none', pullbackZone:'near_50ma'},
    displayedPlan:{},
    record:{
      marketData:{price:248.63, sma50:250.23},
      watchlist:{debug:{structural_alive_at_refresh:'true', refresh_demote_reason:'Structurally alive; keep on monitor.'}}
    }
  });
  if(supportTest.specialCase !== 'accepted_50ma_support_test' || supportTest.source !== 'ticker_specific' || !/50MA/.test([supportTest.why, supportTest.stillMissing, supportTest.upgrade].join(' '))){
    throw new Error('Accepted 50MA support tests must be captured explicitly in the Track long-press contract.');
  }
}

runReviewProjectionAssertions();
runEntryConditionsSummaryAssertions();

function runSharedNarrativeConsistencyAssertions(){
  const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const narrativeSandbox = {
    console,
    normalizeGlobalVerdictKey(value){
      const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
      if(safe === 'nearentry') return 'near_entry';
      if(['entry','near_entry','watch','avoid'].includes(safe)) return safe;
      return 'watch';
    },
    normalizeVisualBucketForPairing(value){
      const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
      if(['entry','near_entry','monitor','diminishing','avoid'].includes(safe)) return safe;
      return 'monitor';
    },
    normalizeVerdict(value){
      const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
      if(safe === 'nearentry') return 'near_entry';
      if(['entry','near_entry','watch','avoid','dead','monitor','developing'].includes(safe)) return safe;
      return safe || 'watch';
    },
    normalizeTicker(value){
      return String(value || '').trim().toUpperCase();
    },
    sameVisibleCopy(a, b){
      return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
    },
    currentRrThreshold(){
      return 2;
    },
    numericOrNull(value){
      if(value === null || value === undefined) return null;
      if(typeof value === 'string' && value.trim() === '') return null;
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    },
    globalVerdictLabel(value){
      const safe = String(value || '').trim().toLowerCase();
      if(safe === 'entry') return 'Entry';
      if(safe === 'near_entry') return 'Near Entry';
      if(safe === 'avoid') return 'Avoid';
      return 'Watch';
    },
    getTone(value){
      const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
      if(['entry','near_entry','monitor','diminishing','avoid'].includes(safe)) return safe;
      return 'monitor';
    },
    resolveStructuredExplicitInvalidationAuthorityCode(globalVerdict){
      return String(globalVerdict && globalVerdict.explicit_invalidation_authority_code || '').trim().toLowerCase();
    }
  };
  vm.createContext(narrativeSandbox);
  [
    'savedReviewSummaryForRecord',
    'currentRuntimeSummaryForRecord',
    'normalizeUiCopy',
    'resolvePresentationTone',
    'terminalAvoidEvidenceForReviewCopy',
    'terminalAvoidCopyPattern',
    'sanitizeAliveWatchSemanticCopy',
    'provisionalPlanConfirmationCopy',
    'sanitizeNonTerminalPlanCopy',
    'buildSharedSetupNarrative',
    'isAccepted50MaSupportTestDisplayState',
    'review50MaSupportTestPresentationCopy',
    'resolveTrackCardVisibleModel',
    'resolveCanonicalTradePlanAuthority',
    'buildReviewSemanticStatus',
    'resolveSetupPatternUi',
    'entryTriggerConditionForSummary',
    'nextUpgradeStateForSummary',
    'nextUpgradeStateForSummaryLabel',
    'buildEntryConditionsSummary',
    'buildTrackLongPressContract',
    'buildTrackTickerSpecificEntryConditionsSummary'
  ].forEach(functionName => {
    vm.runInContext(extractFunctionSource(appSource, functionName), narrativeSandbox, {filename:`app.js#${functionName}`});
  });

  const sharedInput = {
    simplifiedState:{
      canonicalVerdict:'watch',
      visualBucket:'monitor',
      planStatus:'missing',
      planVisible:false,
      mainBlocker:'Conditions are not strong enough for active focus.'
    },
    resolvedState:{
      final_verdict:'watch',
      structure_eligibility:'alive',
      structure_state:'strong',
      bounce_state:'attempt',
      priceability_state:'unpriceable',
      hasClearInvalidationLevel:false
    },
    derivedStates:{
      structureState:'strong',
      structureEligibility:'alive',
      bounceState:'attempt',
      volumeState:'supportive',
      pullbackZone:'near_20ma',
      priceabilityState:'unpriceable'
    },
    displayedPlan:{status:'missing'}
  };
  const narrative = narrativeSandbox.buildSharedSetupNarrative(sharedInput);
  if(narrative.stateLabel !== 'Developing Watch'){
    throw new Error('Shared narrative must label the developing-watch state consistently.');
  }
  if(!/support is still being tested|buyer control is only starting to emerge/i.test(String(narrative.primaryReason || ''))){
    throw new Error('Shared narrative must explain that support is still being tested and buyer control is emerging.');
  }
  if(!/support level for managing risk/i.test(String(narrative.blocker || ''))){
    throw new Error('Shared narrative must explain the missing support/risk level.');
  }
  if(!/support to hold more clearly|buyers to take firmer control/i.test(String(narrative.nextAction || ''))){
    throw new Error('Shared narrative must explain the next step in plain-English chart terms.');
  }
  if((narrative.promotionRequirements || []).join(' ').match(/needs structure repair/i)){
    throw new Error('Shared narrative must not emit structure-repair language for alive/strong setups.');
  }

  const trackModel = narrativeSandbox.resolveTrackCardVisibleModel({ticker:'ADI'}, {
    canonicalVerdict:'watch',
    visualBucket:'monitor',
    badgeLabel:'Watch',
    planVisible:false,
    planStatus:'missing',
    mainBlocker:'Conditions are not strong enough for active focus.',
    debug:{
      resolvedState:sharedInput.resolvedState,
      derivedStates:sharedInput.derivedStates
    }
  });
  if(trackModel.headline !== narrative.stateLabel || !/support is still being tested|buyer control is only starting to emerge/i.test(String(trackModel.primaryReason || ''))){
    throw new Error('Track card narrative must align with the shared developing-watch narrative.');
  }
  if(!/support to hold more clearly|buyers to take firmer control/i.test(String(trackModel.planSummary || '')) || /conditions are not strong enough for active focus/i.test(String(trackModel.planSummary || ''))){
    throw new Error('Track More plan summary must prefer the shared next action over legacy generic blocker copy.');
  }

  const reviewModel = narrativeSandbox.buildReviewSemanticStatus({
    simplifiedState:sharedInput.simplifiedState,
    globalVerdict:sharedInput.resolvedState,
    derivedStates:sharedInput.derivedStates,
    displayedPlan:sharedInput.displayedPlan,
    planRealism:{}
  });
  if(reviewModel.stateLabel !== narrative.stateLabel || !/support level for managing risk/i.test(String(reviewModel.blocker || ''))){
    throw new Error('Review narrative must align with the shared developing-watch narrative.');
  }

  const holdModel = narrativeSandbox.buildTrackTickerSpecificEntryConditionsSummary({
    ticker:'ADI',
    finalVerdict:'watch',
    presentationState:'monitor',
    resolvedContract:{planStatusKey:'missing', structuralState:'developing', rrConfidenceLabel:'invalid'},
    globalVerdict:{
      final_verdict:'watch',
      structure_eligibility:'alive',
      structure_state:'strong',
      bounce_state:'attempt',
      priceability_state:'unpriceable',
      hasClearInvalidationLevel:false,
      entry_gate_checks:{structure_ok:true, bounce_ok:false, plan_ok:false, pullback_ok:true, rr_ok:false}
    },
    derivedStates:sharedInput.derivedStates,
    displayedPlan:{}
  });
  const holdText = [holdModel.primary, holdModel.pattern_explanation, holdModel.triggerLine, holdModel.futureStateLine, (holdModel.secondary || []).join(' ')].join(' ');
  if(!/support is still being tested|buyer control is only starting to emerge/i.test(holdText) || !/support level for managing risk/i.test(holdText) || !/support to hold more clearly|buyers to take firmer control|buyers are defending/i.test(holdText)){
    throw new Error('Track long-press narrative must stay consistent with the shared developing-watch narrative while remaining more detailed.');
  }
  if(/\.\./.test(holdText)){
    throw new Error('Track long-press narrative must not emit doubled punctuation.');
  }

  const weakRrConstructiveInput = {
    simplifiedState:{
      canonicalVerdict:'watch',
      visualBucket:'monitor',
      planStatus:'valid',
      planVisible:true,
      resolvedRR:0.74,
      mainBlocker:'Nearby resistance limits current reward potential.'
    },
    resolvedState:{
      final_verdict:'watch',
      structure_eligibility:'alive',
      structure_state:'intact',
      bounce_state:'attempt',
      stabilisation_state:'clear',
      pullback_zone:'near_20ma',
      priceability_state:'provisional',
      plan_status:'valid',
      resolved_rr:0.74,
      main_blocker:'Nearby resistance limits current reward potential.'
    },
    derivedStates:{
      structureState:'intact',
      structureEligibility:'alive',
      bounceState:'attempt',
      stabilisationState:'clear',
      pullbackZone:'near_20ma',
      volumeState:'normal',
      priceabilityState:'provisional'
    },
    displayedPlan:{
      status:'valid',
      entry:216.09,
      stop:201.320658,
      target:227.09,
      firstTarget:227.09,
      rewardRisk:{valid:true, rrRatio:0.7448, riskPerShare:14.769342},
      rewardPerShare:11
    }
  };
  const weakRrNarrative = narrativeSandbox.buildSharedSetupNarrative(weakRrConstructiveInput);
  const weakRrText = [
    weakRrNarrative.stateLabel,
    weakRrNarrative.primaryReason,
    weakRrNarrative.blocker,
    weakRrNarrative.nextAction,
    (weakRrNarrative.evidence || []).join(' '),
    (weakRrNarrative.cautions || []).join(' ')
  ].join(' ');
  if(weakRrNarrative.canonicalVerdict !== 'watch' || weakRrNarrative.stateLabel !== 'Developing Watch'){
    throw new Error('Constructive weak-RR bounce attempts must remain Watch, not Near Entry.');
  }
  if(!/buyers have started to respond|not enough room before resistance|first target close|nearby resistance|reward-to-risk/i.test(weakRrText) || !/stop still needs to sit lower|beneath support|tighter-risk pullback/i.test(weakRrText)){
    throw new Error('Constructive weak-RR Watch copy must explain limited room before resistance versus the lower stop.');
  }
  if(/damaged|weakening|broken|near entry|entry ready/i.test(weakRrText)){
    throw new Error('Constructive weak-RR Watch copy must stay constructive without implying damage or promotion.');
  }

  const weakRrReviewModel = narrativeSandbox.buildReviewSemanticStatus({
    simplifiedState:weakRrConstructiveInput.simplifiedState,
    globalVerdict:weakRrConstructiveInput.resolvedState,
    derivedStates:weakRrConstructiveInput.derivedStates,
    displayedPlan:weakRrConstructiveInput.displayedPlan,
    planRealism:{realistic_rr:0.7448, raw_rr:0.7448}
  });
  const weakRrReviewText = [
    weakRrReviewModel.stateLabel,
    weakRrReviewModel.blocker,
    weakRrReviewModel.tradeStatus && weakRrReviewModel.tradeStatus.line1,
    weakRrReviewModel.tradeStatus && weakRrReviewModel.tradeStatus.line2
  ].join(' ');
  if(weakRrReviewModel.stateLabel !== 'Developing Watch'){
    throw new Error('Review semantics must keep constructive weak-RR bounce attempts at Watch.');
  }
  if(!/reward-to-risk is still too weak|nearby resistance|first target close|stop still needs to sit lower/i.test(weakRrReviewText)){
    throw new Error('Review semantics must explain that nearby resistance and a deeper stop leave weak reward-to-risk.');
  }
  if(/damaged|weakening|broken|near entry|entry ready/i.test(weakRrReviewText)){
    throw new Error('Review semantics must not frame constructive weak-RR watches as damaged or promoted.');
  }

  const diminishingNarrative = narrativeSandbox.buildSharedSetupNarrative({
    simplifiedState:{
      canonicalVerdict:'watch',
      visualBucket:'diminishing',
      planStatus:'missing',
      planVisible:false,
      mainBlocker:'Trend is weakening - no reliable stop level yet.'
    },
    resolvedState:{
      final_verdict:'watch',
      structure_eligibility:'alive',
      structure_state:'intact',
      bounce_state:'attempt',
      priceability_state:'unpriceable',
      viability:'low_priority'
    },
    derivedStates:{
      structureState:'intact',
      structureEligibility:'alive',
      bounceState:'attempt',
      volumeState:'supportive',
      pullbackZone:'near_20ma',
      priceabilityState:'unpriceable'
    },
    displayedPlan:{status:'missing'}
  });
  if(/Developing Watch/i.test(String(diminishingNarrative.stateLabel || '')) || !/Diminishing/i.test(String(diminishingNarrative.stateLabel || ''))){
    throw new Error('Diminishing watch narrative must not be flattened into Developing Watch.');
  }
  if(/support is still being tested|buyer control is only starting to emerge|support is reacting|buyers are starting to step in/i.test(String(diminishingNarrative.primaryReason || ''))){
    throw new Error('Diminishing watch narrative must preserve weaker severity instead of using the healthy support-response narrative.');
  }

  const reviewSemanticBody = extractFunctionSource(appSource, 'buildReviewSemanticStatus');
  const entryConditionsBody = extractFunctionSource(appSource, 'buildEntryConditionsSummary');
  if(!/const sharedNarrative = buildSharedSetupNarrative\(/.test(appSource)
    || !/monitorSafeStateLabel/.test(appSource)
    || !/monitorSafePrimaryReason/.test(appSource)
    || !/const sharedNarrative = buildSharedSetupNarrative\(/.test(reviewSemanticBody)
    || !/const sharedNarrative = buildSharedSetupNarrative\(/.test(entryConditionsBody)){
    throw new Error('Scan, Review, and Track long-press surfaces must consume the shared narrative builder.');
  }
  if(!/(?:const|let) entryConditionsSummary = buildTrackTickerSpecificEntryConditionsSummary\(\{/.test(appSource)){
    throw new Error('Track card render must use the ticker-specific long-press summary wrapper.');
  }
  if(/const decisionSummary = String\(reviewSemanticStatus\.primaryReason[\s\S]{0,120}const reviewSemanticStatus = buildReviewSemanticStatus\(/.test(appSource)){
    throw new Error('Review semantic status must be initialized before any decisionSummary reads to avoid a TDZ runtime error.');
  }
  if(/const plannerDecisionSummary = String\(plannerSemanticStatus\.primaryReason[\s\S]{0,120}const plannerSemanticStatus = buildReviewSemanticStatus\(/.test(appSource)){
    throw new Error('Planner semantic status must be initialized before any plannerDecisionSummary reads to avoid a TDZ runtime error.');
  }
}

runSharedNarrativeConsistencyAssertions();

function runSimplifiedPipelineAssertions(){
  const pipeline = sandbox.window.SimplifiedTradeState;
  const simplifiedPlanState = sandbox.window.SimplifiedPlanState;
  if(!pipeline || typeof pipeline.resolveRecordState !== 'function'){
    throw new Error('SimplifiedTradeState pipeline is unavailable.');
  }
  if(!simplifiedPlanState || typeof simplifiedPlanState.deriveCurrentPlanState !== 'function'){
    throw new Error('SimplifiedPlanState is unavailable.');
  }
  const requiredKeys = [
    'ticker',
    'canonicalVerdict',
    'visualBucket',
    'tone',
    'badgeLabel',
    'actionLabel',
    'planVisible',
    'planStatus',
    'mainBlocker',
    'entryGatePass',
    'nearEntryGatePass',
    'blockers',
    'debug'
  ];
  function depsFor(derivedStates, finalContract, setupScore = 8, extraDeps = {}){
    return {
      riskSettings:{account_size:4000, risk_percent:1, max_loss_override:40, whole_shares_only:true},
      analysisDerivedStatesFromRecord:() => derivedStates,
      resolvePreLifecycleStateContract:() => finalContract,
      resolveFinalStateContract:() => finalContract,
      setupScoreForRecord:() => setupScore,
      isHostileMarketStatus:() => false,
      scannerScoreGradientClass:() => '',
      ...extraDeps
    };
  }

  const stalePersistedInvalidRecord = {
    ticker:'SIMPSTALE',
    in_watchlist:true,
    plan:{
      entry:100,
      stop:95,
      firstTarget:120,
      source:'scanner_estimate',
      status:'invalid',
      tradeability:'invalid',
      riskStatus:'plan_blocked',
      blockedReason:'Blocked'
    },
    marketData:{price:100, ma20:99, ma50:95, ma200:80, currency:'GBP'},
    setup:{structureState:'intact', trendState:'intact', volumeRequired:false}
  };
  const stalePersistedPlanState = simplifiedPlanState.deriveCurrentPlanState(
    stalePersistedInvalidRecord,
    null,
    {account_size:4000, risk_percent:1, max_loss_override:40, whole_shares_only:true},
    {
      PlanMath:sandbox.window.PlanMath,
      deriveTradeability:sandbox.window.Tradeability && sandbox.window.Tradeability.deriveTradeability
    }
  );
  if(stalePersistedPlanState.status !== 'valid' || stalePersistedPlanState.tradeability !== 'tradable' || stalePersistedPlanState.planVisible !== true){
    throw new Error('Fresh valid scanner-estimate plan math must defeat stale persisted invalid status/tradeability/riskStatus/blockedReason metadata.');
  }
  if(stalePersistedPlanState.authoritativeBlockApplied === true){
    throw new Error('Stale persisted scanner-estimate invalid metadata must not apply authoritative plan blocking.');
  }

  const canonicalSoftReadinessPresentation = sandbox.window.SimplifiedPresentationModel.buildPresentationModel({
    surface:'review',
    record:{ticker:'TROWLIKE'},
    planState:{
      status:'valid',
      planVisible:true,
      tradeability:'tradable'
    },
    resolvedState:{
      final_verdict:'watch',
      canonical_final_verdict:'entry',
      canonical_visual_bucket:'entry',
      canonical_priceability_state:'priceable',
      canonical_soft_readiness_alignment_applied:true,
      action:{label:'WATCH'},
      reason:'Repair is forming but the setup is not priceable yet.',
      main_blocker:'Repair is forming but the setup is not priceable yet.',
      entry_gate_pass:false,
      near_entry_gate_pass:false
    },
    visualState:{
      visualBucket:'monitor',
      tone:'monitor',
      priceability_state:'unpriceable',
      bounce_state:'attempt',
      structure_state:'strong'
    }
  });
  if(canonicalSoftReadinessPresentation.canonicalVerdict !== 'entry'
    || canonicalSoftReadinessPresentation.visualBucket !== 'entry'
    || canonicalSoftReadinessPresentation.priceabilityState !== 'priceable'){
    throw new Error('Simplified presentation model must consume canonical non-tracked soft-readiness overrides for Review parity.');
  }

  function makeReviewOverrideTrowLikeRecord(overrides = {}){
    return {
      ticker:'TROWREVIEW',
      watchlist:{inWatchlist:true, debug:{}},
      plan:{
        entry:110.27,
        stop:102.29,
        firstTarget:136.19,
        source:'scanner_estimate'
      },
      marketData:{price:110.27, currency:'USD'},
      setup:{structureState:'strong', trendState:'uptrend', volumeRequired:false},
      ...overrides
    };
  }

  const reviewOverrideDeps = {
    effectivePlanForRecord(){
      return {entry:110.27, stop:102.29, firstTarget:136.19, source:'scanner_estimate'};
    },
    riskSettingsProvider(){
      return {accountSize:4000, riskPercent:1, maxLoss:40, wholeSharesOnly:true};
    },
    analysisDerivedStatesFromRecord(){
      return {
        structureState:'strong',
        trendState:'uptrend',
        bounceState:'attempt',
        stabilisationState:'none',
        volumeState:'supportive',
        pullbackZone:'near_20ma',
        setupLocationState:'off_level',
        priceabilityState:'priceable'
      };
    },
    state:{marketStatus:'S&P above 50 MA'}
  };

  const currentMissedReviewRecord = makeReviewOverrideTrowLikeRecord({
      ticker:'TROWMISSEDREVIEW',
      marketData:{price:134.0, currency:'USD'}
    });
  const currentMissedPlanState = simplifiedPlanState.deriveCurrentPlanState(
    currentMissedReviewRecord,
    reviewOverrideDeps.effectivePlanForRecord(),
    {account_size:4000, risk_percent:1, max_loss_override:40, whole_shares_only:true},
    {
      PlanMath:sandbox.window.PlanMath,
      deriveTradeability:sandbox.window.Tradeability && sandbox.window.Tradeability.deriveTradeability
    }
  );
  if(currentMissedPlanState.authoritativeBlockApplied !== true || currentMissedPlanState.status !== 'invalid'){
    throw new Error('Review-only soft-readiness override missed regression requires current missed to invalidate the current plan state.');
  }
  const currentMissedReviewResult = pipeline.resolveRecordState(
    currentMissedReviewRecord,
    {
      surface:'review',
      log:false,
      deps:reviewOverrideDeps
    }
  );
  if(currentMissedReviewResult.canonicalVerdict === 'entry'){
    throw new Error('Review-only soft-readiness override must not preserve Entry when current missed blocking is active.');
  }
  if(currentMissedReviewResult.planStatus === 'valid'){
    throw new Error('Review-only soft-readiness override missed regression must not restore a valid Review plan after current missed invalidation.');
  }

  const terminalLifecycleReviewRecord = makeReviewOverrideTrowLikeRecord({
    ticker:'TROWTERMINALREVIEW',
    lifecycle:{stage:'exited', status:'closed'}
  });
  const terminalLifecyclePlanState = simplifiedPlanState.deriveCurrentPlanState(
    terminalLifecycleReviewRecord,
    reviewOverrideDeps.effectivePlanForRecord(),
    {account_size:4000, risk_percent:1, max_loss_override:40, whole_shares_only:true},
    {
      PlanMath:sandbox.window.PlanMath,
      deriveTradeability:sandbox.window.Tradeability && sandbox.window.Tradeability.deriveTradeability
    }
  );
  if(terminalLifecyclePlanState.authoritativeBlockApplied !== true || terminalLifecyclePlanState.status !== 'invalid'){
    throw new Error('Review-only soft-readiness override terminal regression requires terminal lifecycle to invalidate the current plan state.');
  }
  const terminalLifecycleReviewResult = pipeline.resolveRecordState(
    terminalLifecycleReviewRecord,
    {
      surface:'review',
      log:false,
      deps:reviewOverrideDeps
    }
  );
  if(terminalLifecycleReviewResult.canonicalVerdict === 'entry'){
    throw new Error('Review-only soft-readiness override must not preserve Entry when terminal lifecycle blocking is active.');
  }
  if(terminalLifecycleReviewResult.planStatus === 'valid'){
    throw new Error('Review-only soft-readiness override terminal regression must not restore a valid Review plan after terminal lifecycle invalidation.');
  }

  const currentBlockedRecord = {
    ticker:'SIMPBLOCK',
    in_watchlist:true,
    plan:{
      entry:100,
      stop:95,
      firstTarget:120,
      source:'scanner_estimate',
      status:'invalid',
      tradeability:'invalid',
      riskStatus:'plan_blocked',
      blockedReason:'Blocked'
    },
    marketData:{price:118, ma20:99, ma50:95, ma200:80, currency:'GBP'},
    setup:{structureState:'intact', trendState:'intact', volumeRequired:false}
  };
  const currentBlockedPlanState = simplifiedPlanState.deriveCurrentPlanState(
    currentBlockedRecord,
    null,
    {account_size:4000, risk_percent:1, max_loss_override:40, whole_shares_only:true},
    {
      PlanMath:sandbox.window.PlanMath,
      deriveTradeability:sandbox.window.Tradeability && sandbox.window.Tradeability.deriveTradeability
    }
  );
  if(currentBlockedPlanState.status !== 'invalid' || currentBlockedPlanState.planVisible !== false || currentBlockedPlanState.authoritativeBlockApplied !== true){
    throw new Error('Current structured blockers must still invalidate/hide scanner-estimate plans in SimplifiedPlanState.');
  }

  const currentInvalidatedFlagRecord = {
    ticker:'SIMPINVALIDATED',
    in_watchlist:true,
    plan:{
      entry:100,
      stop:95,
      firstTarget:120,
      source:'scanner_estimate',
      status:'invalid',
      tradeability:'invalid',
      riskStatus:'plan_blocked',
      blockedReason:'Blocked',
      planValidationState:'invalidated',
      invalidatedState:'invalidated'
    },
    marketData:{price:100, ma20:99, ma50:95, ma200:80, currency:'GBP'},
    setup:{structureState:'intact', trendState:'intact', volumeRequired:false}
  };
  const currentInvalidatedFlagPlanState = simplifiedPlanState.deriveCurrentPlanState(
    currentInvalidatedFlagRecord,
    null,
    {account_size:4000, risk_percent:1, max_loss_override:40, whole_shares_only:true},
    {
      PlanMath:sandbox.window.PlanMath,
      deriveTradeability:sandbox.window.Tradeability && sandbox.window.Tradeability.deriveTradeability
    }
  );
  if(currentInvalidatedFlagPlanState.status !== 'invalid' || currentInvalidatedFlagPlanState.planVisible !== false){
    throw new Error('Current structured invalidated evidence must still invalidate/hide fresh scanner-estimate math.');
  }

  const stalePersistedInvalidatedFlagRecord = {
    ticker:'SIMPSTALEINVALIDATED',
    in_watchlist:true,
    plan:{
      entry:100,
      stop:95,
      firstTarget:120,
      source:'scanner_estimate',
      status:'invalid',
      tradeability:'invalid',
      riskStatus:'plan_blocked',
      blockedReason:'Blocked',
      invalidatedState:'invalidated'
    },
    marketData:{price:100, ma20:99, ma50:95, ma200:80, currency:'GBP'},
    setup:{structureState:'intact', trendState:'intact', volumeRequired:false}
  };
  const stalePersistedInvalidatedFlagPlanState = simplifiedPlanState.deriveCurrentPlanState(
    stalePersistedInvalidatedFlagRecord,
    null,
    {account_size:4000, risk_percent:1, max_loss_override:40, whole_shares_only:true},
    {
      PlanMath:sandbox.window.PlanMath,
      deriveTradeability:sandbox.window.Tradeability && sandbox.window.Tradeability.deriveTradeability
    }
  );
  if(stalePersistedInvalidatedFlagPlanState.status !== 'valid' || stalePersistedInvalidatedFlagPlanState.tradeability !== 'tradable' || stalePersistedInvalidatedFlagPlanState.planVisible !== true){
    throw new Error('Persisted stale plan.invalidatedState must not hide/block fresh valid scanner-estimate math.');
  }

  const currentMissedFlagRecord = {
    ticker:'SIMPMISSED',
    in_watchlist:true,
    plan:{
      entry:100,
      stop:95,
      firstTarget:120,
      source:'scanner_estimate',
      status:'invalid',
      tradeability:'invalid',
      riskStatus:'plan_blocked',
      blockedReason:'Blocked',
      triggerState:'missed',
      missedState:'missed'
    },
    marketData:{price:100, ma20:99, ma50:95, ma200:80, currency:'GBP'},
    setup:{structureState:'intact', trendState:'intact', volumeRequired:false}
  };
  const currentMissedFlagPlanState = simplifiedPlanState.deriveCurrentPlanState(
    currentMissedFlagRecord,
    null,
    {account_size:4000, risk_percent:1, max_loss_override:40, whole_shares_only:true},
    {
      PlanMath:sandbox.window.PlanMath,
      deriveTradeability:sandbox.window.Tradeability && sandbox.window.Tradeability.deriveTradeability
    }
  );
  if(currentMissedFlagPlanState.status !== 'invalid' || currentMissedFlagPlanState.planVisible !== false){
    throw new Error('Current structured missed evidence must still invalidate/hide fresh scanner-estimate math.');
  }

  const stalePersistedMissedFlagRecord = {
    ticker:'SIMPSTALEMISSED',
    in_watchlist:true,
    plan:{
      entry:100,
      stop:95,
      firstTarget:120,
      source:'scanner_estimate',
      status:'invalid',
      tradeability:'invalid',
      riskStatus:'plan_blocked',
      blockedReason:'Blocked',
      missedState:'missed'
    },
    marketData:{price:100, ma20:99, ma50:95, ma200:80, currency:'GBP'},
    setup:{structureState:'intact', trendState:'intact', volumeRequired:false}
  };
  const stalePersistedMissedFlagPlanState = simplifiedPlanState.deriveCurrentPlanState(
    stalePersistedMissedFlagRecord,
    null,
    {account_size:4000, risk_percent:1, max_loss_override:40, whole_shares_only:true},
    {
      PlanMath:sandbox.window.PlanMath,
      deriveTradeability:sandbox.window.Tradeability && sandbox.window.Tradeability.deriveTradeability
    }
  );
  if(stalePersistedMissedFlagPlanState.status !== 'valid' || stalePersistedMissedFlagPlanState.tradeability !== 'tradable' || stalePersistedMissedFlagPlanState.planVisible !== true){
    throw new Error('Persisted stale plan.missedState must not hide/block fresh valid scanner-estimate math.');
  }

  const currentValidationStateBlockRecord = {
    ticker:'SIMPPLANSTATE',
    in_watchlist:true,
    plan:{
      entry:100,
      stop:95,
      firstTarget:120,
      source:'scanner_estimate',
      status:'invalid',
      tradeability:'invalid',
      riskStatus:'plan_blocked',
      blockedReason:'Blocked',
      planValidationState:'invalidated'
    },
    marketData:{price:100, ma20:99, ma50:95, ma200:80, currency:'GBP'},
    setup:{structureState:'intact', trendState:'intact', volumeRequired:false}
  };
  const currentValidationStateBlockPlanState = simplifiedPlanState.deriveCurrentPlanState(
    currentValidationStateBlockRecord,
    null,
    {account_size:4000, risk_percent:1, max_loss_override:40, whole_shares_only:true},
    {
      PlanMath:sandbox.window.PlanMath,
      deriveTradeability:sandbox.window.Tradeability && sandbox.window.Tradeability.deriveTradeability
    }
  );
  if(currentValidationStateBlockPlanState.status !== 'invalid' || currentValidationStateBlockPlanState.planVisible !== false){
    throw new Error('Current blocking plan.planValidationState must still invalidate/hide fresh scanner-estimate math.');
  }

  const currentTriggerStateBlockRecord = {
    ticker:'SIMPTRIGGERSTATE',
    in_watchlist:true,
    plan:{
      entry:100,
      stop:95,
      firstTarget:120,
      source:'scanner_estimate',
      status:'invalid',
      tradeability:'invalid',
      riskStatus:'plan_blocked',
      blockedReason:'Blocked',
      triggerState:'invalidated'
    },
    marketData:{price:100, ma20:99, ma50:95, ma200:80, currency:'GBP'},
    setup:{structureState:'intact', trendState:'intact', volumeRequired:false}
  };
  const currentTriggerStateBlockPlanState = simplifiedPlanState.deriveCurrentPlanState(
    currentTriggerStateBlockRecord,
    null,
    {account_size:4000, risk_percent:1, max_loss_override:40, whole_shares_only:true},
    {
      PlanMath:sandbox.window.PlanMath,
      deriveTradeability:sandbox.window.Tradeability && sandbox.window.Tradeability.deriveTradeability
    }
  );
  if(currentTriggerStateBlockPlanState.status !== 'invalid' || currentTriggerStateBlockPlanState.planVisible !== false){
    throw new Error('Current blocking plan.triggerState must still invalidate/hide fresh scanner-estimate math.');
  }

  const stalePlanValidationStateRecord = {
    ticker:'SIMPSTALEPLANSTATE',
    in_watchlist:true,
    plan:{
      entry:100,
      stop:95,
      firstTarget:120,
      source:'scanner_estimate',
      status:'invalid',
      tradeability:'invalid',
      riskStatus:'plan_blocked',
      blockedReason:'Blocked',
      planValidationState:'stale'
    },
    marketData:{price:100, ma20:99, ma50:95, ma200:80, currency:'GBP'},
    setup:{structureState:'intact', trendState:'intact', volumeRequired:false}
  };
  const stalePlanValidationStatePlanState = simplifiedPlanState.deriveCurrentPlanState(
    stalePlanValidationStateRecord,
    null,
    {account_size:4000, risk_percent:1, max_loss_override:40, whole_shares_only:true},
    {
      PlanMath:sandbox.window.PlanMath,
      deriveTradeability:sandbox.window.Tradeability && sandbox.window.Tradeability.deriveTradeability
    }
  );
  if(stalePlanValidationStatePlanState.status !== 'valid' || stalePlanValidationStatePlanState.tradeability !== 'tradable' || stalePlanValidationStatePlanState.planVisible !== true){
    throw new Error('Persisted stale plan.planValidationState must not hide/block fresh valid scanner-estimate math.');
  }

  const staleTriggerStateRecord = {
    ticker:'SIMPSTALETRIGGER',
    in_watchlist:true,
    plan:{
      entry:100,
      stop:95,
      firstTarget:120,
      source:'scanner_estimate',
      status:'invalid',
      tradeability:'invalid',
      riskStatus:'plan_blocked',
      blockedReason:'Blocked',
      triggerState:'stale'
    },
    marketData:{price:100, ma20:99, ma50:95, ma200:80, currency:'GBP'},
    setup:{structureState:'intact', trendState:'intact', volumeRequired:false}
  };
  const staleTriggerStatePlanState = simplifiedPlanState.deriveCurrentPlanState(
    staleTriggerStateRecord,
    null,
    {account_size:4000, risk_percent:1, max_loss_override:40, whole_shares_only:true},
    {
      PlanMath:sandbox.window.PlanMath,
      deriveTradeability:sandbox.window.Tradeability && sandbox.window.Tradeability.deriveTradeability
    }
  );
  if(staleTriggerStatePlanState.status !== 'valid' || staleTriggerStatePlanState.tradeability !== 'tradable' || staleTriggerStatePlanState.planVisible !== true){
    throw new Error('Persisted stale plan.triggerState must not hide/block fresh valid scanner-estimate math.');
  }

  const harmlessPendingStateRecord = {
    ticker:'SIMPPENDING',
    in_watchlist:true,
    plan:{
      entry:100,
      stop:95,
      firstTarget:120,
      source:'scanner_estimate',
      status:'invalid',
      tradeability:'invalid',
      riskStatus:'plan_blocked',
      blockedReason:'Blocked',
      planValidationState:'pending_validation',
      triggerState:'waiting_for_trigger'
    },
    marketData:{price:100, ma20:99, ma50:95, ma200:80, currency:'GBP'},
    setup:{structureState:'intact', trendState:'intact', volumeRequired:false}
  };
  const harmlessPendingStatePlanState = simplifiedPlanState.deriveCurrentPlanState(
    harmlessPendingStateRecord,
    null,
    {account_size:4000, risk_percent:1, max_loss_override:40, whole_shares_only:true},
    {
      PlanMath:sandbox.window.PlanMath,
      deriveTradeability:sandbox.window.Tradeability && sandbox.window.Tradeability.deriveTradeability
    }
  );
  if(harmlessPendingStatePlanState.status !== 'valid' || harmlessPendingStatePlanState.tradeability !== 'tradable' || harmlessPendingStatePlanState.planVisible !== true){
    throw new Error('Harmless pending plan/trigger states must not hide fresh valid scanner-estimate math.');
  }

  const stalePersistedPipeline = pipeline.resolveRecordState(stalePersistedInvalidRecord, {
    log:false,
    surface:'track',
    deps:depsFor({
      structureState:'intact',
      trendState:'intact',
      stabilisationState:'clear',
      bounceState:'confirmed',
      pullbackZone:'near_20ma',
      volumeState:'normal',
      priceabilityState:'priceable'
    }, {
      finalVerdict:'Entry',
      structuralState:'entry',
      actionStateKey:'ready_to_act',
      planStatusKey:'valid',
      tradeabilityVerdict:'Entry',
      blockerReason:'',
      reasonSummary:'Ready to act.',
      terminal:false,
      baseVerdict:'entry'
    })
  });
  if(stalePersistedPipeline.planStatus !== 'valid' || stalePersistedPipeline.planVisible !== true){
    throw new Error('resolveRecordState(track) must not let stale persisted invalid plan metadata override fresh valid scanner-estimate math.');
  }
  if(stalePersistedPipeline.debug && stalePersistedPipeline.debug.validation && stalePersistedPipeline.debug.validation.state === 'needs_replan'){
    throw new Error('Simplified pipeline validation must not inherit stale persisted invalid metadata as needs_replan when current scanner-estimate math is valid.');
  }

  const entryBlocked = pipeline.resolveRecordState({
    ticker:'STRICT',
    in_watchlist:true,
    plan:{entry:100, stop:97, firstTarget:105},
    marketData:{price:101, ma20:100, ma50:95, ma200:80, currency:'GBP'},
    setup:{volumeRequired:false}
  }, {
    log:false,
    deps:depsFor({
      structureState:'intact',
      trendState:'intact',
      stabilisationState:'clear',
      bounceState:'confirmed',
      pullbackZone:'near_20ma',
      volumeState:'normal'
    }, {
      finalVerdict:'Entry',
      structuralState:'entry',
      actionStateKey:'ready_to_act',
      planStatusKey:'valid',
      tradeabilityVerdict:'Entry',
      blockerReason:'',
      reasonSummary:'Ready to act.',
      terminal:false,
      baseVerdict:'entry'
    })
  });
  requiredKeys.forEach(key => {
    if(!(key in entryBlocked)) throw new Error(`Simplified pipeline result missing key: ${key}`);
  });
  if(entryBlocked.canonicalVerdict === 'entry' || entryBlocked.entryGatePass !== false){
    throw new Error('Simplified pipeline must keep Entry strict when existing entry gates fail.');
  }

  const nearEntry = pipeline.resolveRecordState({
    ticker:'PROV',
    in_watchlist:true,
    reclaimAttempt:true,
    reclaimsLevel:true,
    strongBullishReversal:true,
    plan:{entry:100, stop:97, firstTarget:106},
    marketData:{price:99.5, ma20:100, ma50:94, ma200:80, currency:'GBP'},
    setup:{volumeRequired:false}
  }, {
    log:false,
    deps:depsFor({
      structureState:'developing_clean',
      trendState:'intact',
      stabilisationState:'early',
      bounceState:'attempt',
      pullbackZone:'near_20ma',
      volumeState:'normal'
    }, {
      finalVerdict:'Near Entry',
      structuralState:'near_entry',
      actionStateKey:'wait_for_confirmation',
      planStatusKey:'valid',
      tradeabilityVerdict:'Near Entry',
      blockerReason:'Waiting for confirmation.',
      reasonSummary:'Close to trigger.',
      terminal:false,
      baseVerdict:'near_entry'
    })
  });
  if(nearEntry.nearEntryGatePass !== true || !nearEntry.debug || !nearEntry.debug.nearEntryGateChecks){
    throw new Error('Simplified pipeline must preserve resolver-derived Near Entry gate flags.');
  }
  if(nearEntry.debug.nearEntryGateChecks.rr_priceable !== true){
    throw new Error('Credible provisional RR must remain sufficient for Near Entry gate priceability.');
  }

  const alive50MaSupportState = pipeline.resolveRecordState({
    ticker:'HWM',
    in_watchlist:true,
    watchlist:{
      debug:{
        structural_alive_at_refresh:'true',
        refresh_demote_reason:'Structurally alive; keep on monitor.'
      }
    },
    plan:{entry:260.62, stop:247.09, firstTarget:287.68},
    marketData:{price:255.22, sma50:255.8, currency:'USD'},
    setup:{volumeRequired:false}
  }, {
    log:false,
    deps:depsFor({
      structureState:'intact',
      structureEligibility:'alive',
      trendState:'intact',
      stabilisationState:'none',
      bounceState:'none',
      pullbackZone:'near_50ma',
      priceabilityState:'unpriceable',
      volumeState:'normal'
    }, {
      finalVerdict:'Watch',
      final_verdict:'watch',
      structuralState:'developing',
      actionStateKey:'wait_for_confirmation',
      planStatusKey:'valid',
      tradeabilityVerdict:'Watch',
      blockerReason:'Trend is weakening - no reliable stop level yet.',
      reasonSummary:'Structurally alive; keep on monitor.',
      refresh_demote_reason:'Structurally alive; keep on monitor.',
      structural_alive_at_refresh:'true',
      main_blocker:'Trend is weakening - no reliable stop level yet.',
      pullback_ok:true,
      terminal:false,
      baseVerdict:'watch'
    }, 6)
  });
  if(alive50MaSupportState.visualBucket !== 'monitor' || alive50MaSupportState.tone !== 'monitor'){
    throw new Error('Simplified pipeline must normalize accepted alive 50MA support tests to monitor tone/bucket.');
  }

  const inferredProvisionalPriceability = pipeline.resolveRecordState({
    ticker:'FTIPROV',
    in_watchlist:true,
    reclaimAttempt:true,
    reclaimsLevel:true,
    strongBullishReversal:true,
    plan:{entry:100, stop:97, firstTarget:106},
    marketData:{price:99.5, ma20:100, ma50:94, ma200:80, currency:'GBP'},
    setup:{volumeRequired:false}
  }, {
    log:false,
    deps:depsFor({
      structureState:'intact',
      trendState:'intact',
      setupLocationState:'near_20ma',
      priceabilityState:'',
      stabilisationState:'early',
      bounceState:'attempt',
      pullbackZone:'near_20ma',
      volumeState:'normal'
    }, {
      finalVerdict:'Near Entry',
      structuralState:'near_entry',
      actionStateKey:'wait_for_confirmation',
      planStatusKey:'valid',
      tradeabilityVerdict:'Near Entry',
      blockerReason:'Bounce still tentative.',
      reasonSummary:'Bounce still tentative.',
      terminal:false,
      baseVerdict:'near_entry'
    }, 6, {
      deriveTradeability:() => 'watch'
    })
  });
  const inferredProvisionalResolved = inferredProvisionalPriceability.debug && inferredProvisionalPriceability.debug.resolvedState || {};
  const inferredProvisionalViabilityInputs = inferredProvisionalResolved.viabilityInputs || inferredProvisionalResolved.viability_inputs || {};
  if(inferredProvisionalPriceability.canonicalVerdict !== 'near_entry' || inferredProvisionalResolved.priceability_state === 'unpriceable' || inferredProvisionalViabilityInputs.priceabilityState === 'unpriceable'){
    throw new Error('Blank priceability with valid provisional plan math must infer non-unpriceable resolver priceability.');
  }
  if(inferredProvisionalResolved.priceability_state !== 'provisional' || inferredProvisionalViabilityInputs.priceabilityInferred !== true){
    throw new Error('Valid but confirmation-pending plan should infer provisional priceability with priceabilityInferred true.');
  }

  const reconciledPriceability = pipeline.resolveRecordState({
    ticker:'PRICEFIX',
    in_watchlist:true,
    reclaimAttempt:true,
    reclaimsLevel:true,
    strongBullishReversal:true,
    plan:{entry:100, stop:97, firstTarget:106},
    marketData:{price:99.5, ma20:100, ma50:94, ma200:80, currency:'USD'},
    setup:{volumeRequired:false}
  }, {
    log:false,
    deps:depsFor({
      structureState:'developing_clean',
      trendState:'intact',
      setupLocationState:'near_20ma',
      priceabilityState:'unpriceable',
      stabilisationState:'early',
      bounceState:'attempt',
      pullbackZone:'near_20ma',
      volumeState:'normal'
    }, {
      finalVerdict:'Near Entry',
      structuralState:'near_entry',
      actionStateKey:'wait_for_confirmation',
      planStatusKey:'valid',
      tradeabilityVerdict:'Near Entry',
      blockerReason:'Waiting for confirmation.',
      reasonSummary:'Close to trigger.',
      terminal:false,
      baseVerdict:'near_entry',
      canonical_final_verdict:'entry',
      canonical_visual_bucket:'entry',
      canonical_priceability_state:'priceable',
      canonical_soft_readiness_alignment_applied:true
    })
  });
  const reconciledDerived = reconciledPriceability.debug && reconciledPriceability.debug.derivedStates || {};
  const reconciledPipelineDiagnostics = reconciledPriceability.debug && reconciledPriceability.debug.pipelineDiagnostics || {};
  const reconciledResolved = reconciledPriceability.debug && reconciledPriceability.debug.resolvedState || {};
  const reconciledViabilityInputs = reconciledResolved.viabilityInputs || reconciledResolved.viability_inputs || {};
  if(reconciledPriceability.planStatus !== 'valid' || reconciledDerived.priceabilityState === 'unpriceable' || reconciledViabilityInputs.priceabilityState === 'unpriceable'){
    throw new Error('Valid effective plan must reconcile stale derived unpriceable before resolver viability inputs.');
  }
  if(reconciledDerived.priceabilityReconciledFromPlan !== true || reconciledPipelineDiagnostics.priceabilityReconciledFromPlan !== true){
    throw new Error('Valid effective plan reconciliation must expose positive priceability diagnostics.');
  }
  if(reconciledPriceability.nearEntryGatePass !== true || !['near_entry','entry'].includes(reconciledPriceability.canonicalVerdict)){
    throw new Error('Priceability reconciliation must preserve or advance the canonical actionable state when gates already pass.');
  }
  if(reconciledDerived.priceabilityReconciliationDiagnostics && reconciledDerived.priceabilityReconciliationDiagnostics.checks && reconciledDerived.priceabilityReconciliationDiagnostics.checks.riskOnlyFxEstimated !== true){
    throw new Error('FX-estimated risk_only reconciliation must expose riskOnlyFxEstimated diagnostic flag.');
  }

  const targetTooCloseStillBlocked = pipeline.resolveRecordState({
    ticker:'PRICEFIXBLOCK',
    in_watchlist:true,
    reclaimAttempt:true,
    plan:{entry:100, stop:97, firstTarget:103, source:'scanner_estimate'},
    marketData:{price:99.5, ma20:100, ma50:94, ma200:80, currency:'USD'},
    setup:{volumeRequired:false}
  }, {
    log:false,
    deps:depsFor({
      structureState:'developing_clean',
      trendState:'intact',
      setupLocationState:'near_20ma',
      priceabilityState:'unpriceable',
      stabilisationState:'early',
      bounceState:'attempt',
      pullbackZone:'near_20ma',
      volumeState:'normal'
    }, {
      finalVerdict:'Watch',
      structuralState:'developing',
      actionStateKey:'recalculate_plan',
      planStatusKey:'valid',
      tradeabilityVerdict:'Watch',
      blockerReason:'Target too close.',
      reasonSummary:'Target too close.',
      terminal:false,
      baseVerdict:'watch'
    })
  });
  const targetTooCloseDerived = targetTooCloseStillBlocked.debug && targetTooCloseStillBlocked.debug.derivedStates || {};
  if(targetTooCloseDerived.priceabilityState === 'priceable' || targetTooCloseDerived.priceabilityReconciledFromPlan === true){
    throw new Error('target_too_close authoritative block must still prevent FX-estimated risk_only reconciliation.');
  }
  const lowRrPlan = pipeline.resolveRecordState({
    ticker:'LOWRR',
    in_watchlist:true,
    plan:{entry:100, stop:97, firstTarget:104},
    marketData:{price:99.5, ma20:100, ma50:94, ma200:80, currency:'GBP'},
    setup:{volumeRequired:false}
  }, {
    log:false,
    deps:depsFor({
      structureState:'developing_clean',
      trendState:'intact',
      setupLocationState:'near_20ma',
      priceabilityState:'unpriceable',
      stabilisationState:'early',
      bounceState:'attempt',
      pullbackZone:'near_20ma',
      volumeState:'normal'
    }, {
      finalVerdict:'Watch',
      structuralState:'developing',
      actionStateKey:'recalculate_plan',
      planStatusKey:'valid',
      tradeabilityVerdict:'Watch',
      blockerReason:'RR is not good enough.',
      reasonSummary:'RR is not good enough.',
      terminal:false,
      baseVerdict:'watch'
    })
  });
  const lowRrDerived = lowRrPlan.debug && lowRrPlan.debug.derivedStates || {};
  const lowRrDiagnostics = lowRrDerived.priceabilityReconciliationDiagnostics || {};
  if(lowRrDerived.priceabilityState === 'priceable' || lowRrDerived.priceabilityReconciledFromPlan === true){
    throw new Error('Low-RR valid plan must not reconcile stale unpriceable to priceable.');
  }
  if(!Array.isArray(lowRrDiagnostics.failedChecks) || !lowRrDiagnostics.failedChecks.includes('rrOk')){
    throw new Error('Low-RR failed reconciliation must expose rrOk as the failed diagnostic check.');
  }
  if(lowRrPlan.entryGatePass === true){
    throw new Error('Low-RR valid plan must not force Entry promotion.');
  }
  if(lowRrPlan.nearEntryGatePass === true || lowRrPlan.canonicalVerdict === 'near_entry'){
    throw new Error('Calculable but unusable low RR must not promote to Near Entry.');
  }
  const lowRrNearChecks = lowRrPlan.debug && lowRrPlan.debug.nearEntryGateChecks || {};
  if(lowRrNearChecks.rr_priceable !== false){
    throw new Error('Low-RR Near Entry gate must require usable RR, not merely calculable RR.');
  }
  if(lowRrNearChecks.has_priceable_plan === true || lowRrNearChecks.has_provisional_priceable_plan === true){
    throw new Error('Low-RR plan must not be exposed as priceable or provisionally priceable.');
  }

  const missingPlan = pipeline.resolveRecordState({
    ticker:'NOPLAN',
    in_watchlist:true,
    plan:{},
    marketData:{price:50, currency:'GBP'}
  }, {
    log:false,
    deps:depsFor({
      structureState:'intact',
      trendState:'intact',
      stabilisationState:'early',
      bounceState:'attempt',
      pullbackZone:'near_20ma',
      volumeState:'normal'
    }, {
      finalVerdict:'Watch',
      structuralState:'developing',
      actionStateKey:'recalculate_plan',
      planStatusKey:'missing',
      tradeabilityVerdict:'Watch',
      blockerReason:'Plan not ready.',
      reasonSummary:'Pre-watchlist setup.',
      terminal:false,
      baseVerdict:'watch'
    })
  });
  if(missingPlan.planVisible !== false || missingPlan.planStatus !== 'missing' || missingPlan.canonicalVerdict !== 'watch' || missingPlan.visualBucket !== 'monitor'){
    throw new Error('Missing plan must produce planVisible:false and safe Watch/Monitor output.');
  }
  if((missingPlan.debug && missingPlan.debug.derivedStates && missingPlan.debug.derivedStates.priceabilityState) === 'priceable'){
    throw new Error('Missing plan must not reconcile unpriceable state to priceable.');
  }

  const aaStyleWeakWatch = pipeline.resolveRecordState({
    ticker:'AAX',
    in_watchlist:true,
    plan:{},
    marketData:{price:62.53, ma20:64.88, ma50:65.22, ma200:49.32, currency:'USD'},
    setup:{volumeRequired:false}
  }, {
    log:false,
    deps:depsFor({
      structureState:'developing_clean',
      trendState:'developing_clean',
      setupLocationState:'near_50ma',
      priceabilityState:'unpriceable',
      stabilisationState:'early',
      bounceState:'attempt',
      pullbackZone:'near_50ma',
      volumeState:'normal'
    }, {
      finalVerdict:'Watch',
      structuralState:'developing',
      actionStateKey:'recalculate_plan',
      planStatusKey:'missing',
      tradeabilityVerdict:'Watch',
      blockerReason:'No valid invalidation level is available.',
      reasonSummary:'No valid invalidation level is available.',
      terminal:false,
      baseVerdict:'watch'
    }, 2)
  });
  const aaDiagnostics = aaStyleWeakWatch.debug && aaStyleWeakWatch.debug.pipelineDiagnostics || {};
  if(aaStyleWeakWatch.canonicalVerdict !== 'watch'){
    throw new Error('AA-style failed-reclaim setup must remain canonical Watch, not terminal Avoid.');
  }
  if(aaStyleWeakWatch.visualBucket !== 'diminishing' || aaStyleWeakWatch.tone !== 'diminishing'){
    throw new Error('AA-style failed-reclaim setup must render weak-watch/diminishing nuance outside Scan too.');
  }
  if(!Array.isArray(aaStyleWeakWatch.weakWatchDowngradeReasons) || !aaStyleWeakWatch.weakWatchDowngradeReasons.includes('below_50_without_reclaim') || !aaStyleWeakWatch.weakWatchDowngradeReasons.includes('no_reclaim_signals')){
    throw new Error('AA-style failed-reclaim diagnostics must infer no-reclaim evidence from below50WithoutReclaim even when explicit reclaim counts are absent.');
  }
  if(/needs confirmation before promotion/i.test(String(aaStyleWeakWatch.mainBlocker || ''))){
    throw new Error('AA-style weak-watch output must not use clean Monitor promotion copy.');
  }

  const invalidManualPlan = pipeline.resolveRecordState({
    ticker:'BADMANUAL',
    in_watchlist:true,
    plan:{entry:100, stop:103, firstTarget:110, source:'manual'},
    marketData:{price:99.5, ma20:100, ma50:94, ma200:80, currency:'GBP'},
    setup:{volumeRequired:false}
  }, {
    log:false,
    deps:depsFor({
      structureState:'developing_clean',
      trendState:'intact',
      setupLocationState:'near_20ma',
      priceabilityState:'unpriceable',
      stabilisationState:'early',
      bounceState:'attempt',
      pullbackZone:'near_20ma',
      volumeState:'normal'
    }, {
      finalVerdict:'Watch',
      structuralState:'developing',
      actionStateKey:'recalculate_plan',
      planStatusKey:'invalid',
      tradeabilityVerdict:'Watch',
      blockerReason:'Plan needs adjustment.',
      reasonSummary:'Plan needs adjustment.',
      terminal:false,
      baseVerdict:'watch'
    })
  });
  const invalidManualDerived = invalidManualPlan.debug && invalidManualPlan.debug.derivedStates || {};
  if(invalidManualPlan.planStatus === 'valid' || invalidManualDerived.priceabilityState === 'priceable' || invalidManualPlan.nearEntryGatePass === true || invalidManualPlan.entryGatePass === true){
    throw new Error('Invalid manual/draft plan must not force priceability or promotion.');
  }

  const strongExtendedPriceable = pipeline.resolveRecordState({
    ticker:'DINOX',
    in_watchlist:true,
    plan:{entry:62.73, stop:56.58, firstTarget:81.19},
    marketData:{price:71.08, ma20:61, ma50:57, ma200:45, currency:'GBP'},
    setup:{volumeRequired:false}
  }, {
    log:false,
    deps:depsFor({
      structureState:'strong',
      trendState:'intact',
      setupLocationState:'extended',
      priceabilityState:'priceable',
      stabilisationState:'early',
      bounceState:'attempt',
      pullbackZone:'extended',
      volumeState:'supportive'
    }, {
      finalVerdict:'Watch',
      structuralState:'developing',
      actionStateKey:'wait_for_confirmation',
      planStatusKey:'valid',
      tradeabilityVerdict:'Watch',
      blockerReason:'Target is optimistic for current structure.',
      reasonSummary:'Strong trend, but no clean pullback entry yet.',
      terminal:false,
      baseVerdict:'watch'
    })
  });
  const dinoResolved = strongExtendedPriceable.debug && strongExtendedPriceable.debug.resolvedState || {};
  if(strongExtendedPriceable.canonicalVerdict !== 'watch' || strongExtendedPriceable.planStatus !== 'valid'){
    throw new Error('Strong extended mathematically priceable setup must remain canonical Watch with valid plan status.');
  }
  if(dinoResolved.priceability_state === 'unpriceable'){
    throw new Error('Strong extended setup with valid plan math must not be labelled mathematically unpriceable.');
  }
  if(strongExtendedPriceable.visualBucket !== 'diminishing' || strongExtendedPriceable.tone !== 'diminishing'){
    throw new Error('Strong extended mathematically priceable setup must now render as late/diminishing Watch.');
  }
  if(strongExtendedPriceable.entryGatePass !== false || strongExtendedPriceable.nearEntryGatePass !== false){
    throw new Error('Strong extended mathematically priceable setup must not pass Entry/Near Entry gates.');
  }
  if(dinoResolved.rejected_by_viability_gate === true || dinoResolved.lifecycle === 'drop'){
    throw new Error('Strong extended mathematically priceable setup must not become terminal Avoid/Dead.');
  }
  if(/weakening|broken|missing plan|no actionable plan/i.test(String(strongExtendedPriceable.mainBlocker || dinoResolved.reason || '')) || !/extended|low-risk|pullback|optimistic|safe entry/i.test(String(strongExtendedPriceable.mainBlocker || dinoResolved.reason || ''))){
    throw new Error('Strong extended mathematically priceable setup reason must reference extension/strategy fit, not missing math or weakening structure.');
  }

  const amznDiminishingWatch = pipeline.resolveRecordState({
    ticker:'AMZNX',
    in_watchlist:true,
    plan:{},
    marketData:{price:190, ma20:184, ma50:175, ma200:145, currency:'USD'},
    setup:{volumeRequired:false}
  }, {
    log:false,
    deps:depsFor({
      structureState:'strong',
      trendState:'intact',
      setupLocationState:'none',
      priceabilityState:'unpriceable',
      stabilisationState:'none',
      bounceState:'none',
      pullbackZone:'none',
      volumeState:'normal'
    }, {
      finalVerdict:'Watch',
      structuralState:'developing',
      actionStateKey:'wait_for_confirmation',
      planStatusKey:'missing',
      tradeabilityVerdict:'Watch',
      blockerReason:'No bounce confirmation yet.',
      reasonSummary:'No bounce confirmation yet.',
      terminal:false,
      baseVerdict:'watch'
    }, 3)
  });
  const amznResolved = amznDiminishingWatch.debug && amznDiminishingWatch.debug.resolvedState || {};
  if(amznDiminishingWatch.canonicalVerdict !== 'watch' || amznDiminishingWatch.entryGatePass !== false || amznDiminishingWatch.nearEntryGatePass !== false){
    throw new Error('AMZN-style poor setup must remain canonical Watch and fail Entry/Near Entry gates.');
  }
  if(amznResolved.terminal_avoid_applied === true || amznResolved.rejected_by_viability_gate === true){
    throw new Error('AMZN-style poor setup must not become terminal Avoid.');
  }
  if(amznDiminishingWatch.visualBucket !== 'monitor' || amznDiminishingWatch.tone !== 'monitor' || amznDiminishingWatch.badgeLabel !== 'Watch'){
    throw new Error('Alive but non-actionable poor setup must remain Monitor Watch unless structural deterioration is present.');
  }
  if(/^\s*No bounce confirmation yet\.?\s*$/i.test(String(amznDiminishingWatch.mainBlocker || '')) || !/no usable pullback|too extended|price reliably|cleaner reset|support/i.test(String(amznDiminishingWatch.mainBlocker || ''))){
    throw new Error('AMZN-style poor setup copy must explain pullback/priceability quality, not only bounce confirmation.');
  }
  const amznLifecycleCopy = [
    amznResolved.main_blocker,
    amznResolved.reason,
    amznResolved.downgrade_reason
  ].join(' | ');
  if(/^\s*(No bounce confirmation yet\.?\s*\|?\s*)+$/i.test(amznLifecycleCopy) || !/no usable pullback|too extended|price reliably|cleaner reset|support|not priceable/i.test(amznLifecycleCopy)){
    throw new Error('AMZN-style lifecycle/downgrade copy must prefer setup quality or priceability wording over bounce-only wording.');
  }

  const developingWatch = pipeline.resolveRecordState({
    ticker:'DEVWATCH',
    in_watchlist:true,
    plan:{},
    marketData:{price:99, ma20:100, ma50:94, ma200:80, currency:'USD'},
    setup:{volumeRequired:false}
  }, {
    log:false,
    deps:depsFor({
      structureState:'intact',
      trendState:'intact',
      setupLocationState:'usable_pullback',
      priceabilityState:'provisional',
      stabilisationState:'early',
      bounceState:'attempt',
      pullbackZone:'near_20ma',
      volumeState:'normal'
    }, {
      finalVerdict:'Watch',
      structuralState:'developing',
      actionStateKey:'wait_for_confirmation',
      planStatusKey:'missing',
      tradeabilityVerdict:'Watch',
      blockerReason:'Bounce is developing but not confirmed.',
      reasonSummary:'Waiting for confirmation.',
      terminal:false,
      baseVerdict:'watch'
    }, 6)
  });
  if(developingWatch.canonicalVerdict !== 'watch' || developingWatch.visualBucket !== 'monitor' || developingWatch.tone !== 'monitor' || developingWatch.badgeLabel !== 'Watch'){
    throw new Error('Developing constructive Watch must remain Monitor tone with Watch badge.');
  }
  if(/no usable pullback|too extended|price reliably|cleaner reset|support|not priceable/i.test(String(developingWatch.mainBlocker || ''))){
    throw new Error('Developing constructive Watch must not inherit Diminishing Watch pullback/priceability copy.');
  }

  const constructiveWaitingWatch = pipeline.resolveRecordState({
    ticker:'CTVAX',
    in_watchlist:true,
    plan:{entry:82.17, stop:79.42, firstTarget:90.41},
    marketData:{price:82.1, ma20:80, ma50:76, ma200:65, currency:'USD'},
    setup:{volumeRequired:false}
  }, {
    log:false,
    deps:depsFor({
      structureState:'strong',
      trendState:'intact',
      setupLocationState:'none',
      priceabilityState:'priceable',
      stabilisationState:'none',
      bounceState:'attempt',
      pullbackZone:'none',
      volumeState:'supportive'
    }, {
      finalVerdict:'Watch',
      structuralState:'developing',
      actionStateKey:'wait_for_confirmation',
      planStatusKey:'valid',
      tradeabilityVerdict:'Watch',
      blockerReason:'Needs confirmation before promotion.',
      reasonSummary:'Bounce still tentative.',
      terminal:false,
      baseVerdict:'watch'
    }, 9)
  });
  if(constructiveWaitingWatch.canonicalVerdict !== 'watch' || constructiveWaitingWatch.visualBucket !== 'monitor' || constructiveWaitingWatch.tone !== 'monitor' || constructiveWaitingWatch.badgeLabel !== 'Watch'){
    throw new Error('Constructive waiting Watch with valid plan and bounce attempt must remain Monitor, not Diminishing.');
  }
  if(/diminish|weakening|no usable pullback|too extended|not priceable/i.test(String(constructiveWaitingWatch.mainBlocker || ''))){
    throw new Error('Constructive waiting Watch must not inherit deterioration or unpriceable copy.');
  }

  const constructiveUnpriceableWaitingWatch = pipeline.resolveRecordState({
    ticker:'MARX',
    in_watchlist:true,
    plan:{},
    marketData:{price:260, ma20:255, ma50:245, ma200:220, currency:'USD'},
    setup:{volumeRequired:false}
  }, {
    log:false,
    deps:depsFor({
      structureState:'strong',
      trendState:'intact',
      setupLocationState:'usable_pullback',
      priceabilityState:'unpriceable',
      stabilisationState:'early',
      bounceState:'attempt',
      pullbackZone:'near_20ma',
      volumeState:'supportive'
    }, {
      finalVerdict:'Watch',
      structuralState:'developing',
      actionStateKey:'wait_for_confirmation',
      planStatusKey:'missing',
      tradeabilityVerdict:'Watch',
      blockerReason:'Needs confirmation before promotion.',
      reasonSummary:'Bounce still tentative.',
      terminal:false,
      baseVerdict:'watch'
    }, 9)
  });
  if(constructiveUnpriceableWaitingWatch.canonicalVerdict !== 'watch' || constructiveUnpriceableWaitingWatch.visualBucket !== 'monitor' || constructiveUnpriceableWaitingWatch.tone !== 'monitor' || constructiveUnpriceableWaitingWatch.badgeLabel !== 'Watch'){
    throw new Error('Constructive high-score Watch must not become Diminishing solely because priceability is currently unpriceable.');
  }
  if(constructiveUnpriceableWaitingWatch.entryGatePass !== false || constructiveUnpriceableWaitingWatch.nearEntryGatePass !== false){
    throw new Error('Constructive unpriceable Watch must still fail Entry/Near Entry gates.');
  }
  if((constructiveUnpriceableWaitingWatch.debug && constructiveUnpriceableWaitingWatch.debug.derivedStates && constructiveUnpriceableWaitingWatch.debug.derivedStates.priceabilityState) === 'priceable'){
    throw new Error('Missing effective plan must not reconcile constructive unpriceable Watch to priceable.');
  }

  const weakLowScoreUnpriceableWatchRecord = {
    ticker:'AAW2',
    in_watchlist:true,
    plan:{},
    marketData:{price:62.53, ma20:64.88, ma50:65.22, ma200:49.32, currency:'USD'},
    setup:{volumeRequired:false}
  };
  const weakLowScoreUnpriceableWatchDeps = depsFor({
    structureState:'developing_clean',
    trendState:'intact',
    setupLocationState:'near_50ma',
    priceabilityState:'unpriceable',
    stabilisationState:'early',
    bounceState:'attempt',
    pullbackZone:'near_50ma',
    volumeState:'normal'
  }, {
    finalVerdict:'Watch',
    structuralState:'developing',
    structure_eligibility:'alive',
    structure_state:'developing_clean',
    actionStateKey:'wait_for_confirmation',
    planStatusKey:'missing',
    tradeabilityVerdict:'Watch',
    blockerReason:'No valid invalidation level is available.',
    reasonSummary:'Bounce still tentative.',
    terminal:false,
    baseVerdict:'watch',
    entry_gate_checks:{
      below_50_without_reclaim:true,
      has_clear_invalidation_level:false,
      plan_ok:false,
      tradeability_ok:false,
      rr_ok:false,
      rr_priceable:false,
      resolved_rr:null
    },
    near_entry_gate_checks:{
      below_50_without_reclaim:true,
      has_clear_invalidation_level:false,
      plan_ok:false,
      tradeability_ok:false,
      rr_priceable:false,
      resolved_rr:null
    },
    viabilityInputs:{
      planValid:false,
      tradeabilityOk:false,
      rrOk:false,
      below50WithoutReclaim:true
    },
    viability:'watchlist',
    viabilityBranchId:'alive_watchlist'
  }, 2);
  const weakLowScoreSurfaces = ['scan', 'track', 'review'].map(surface => pipeline.resolveRecordState(
    weakLowScoreUnpriceableWatchRecord,
    {
      surface,
      log:false,
      deps:weakLowScoreUnpriceableWatchDeps
    }
  ));
  if(weakLowScoreSurfaces.some(result => result.canonicalVerdict !== 'watch' || result.visualBucket !== 'diminishing' || result.tone !== 'diminishing')){
    throw new Error('Alive near_50ma low-score unpriceable Watch must render as Diminishing across scan, track, and review.');
  }
  if(weakLowScoreSurfaces.some(result => result.weakWatchDiminishingApplied !== true || !String(result.weakWatchDiminishingReason || '').includes('unpriceable') || !String(result.weakWatchDiminishingReason || '').includes('low_score') || !String(result.weakWatchDiminishingReason || '').includes('missing_plan') || !String(result.weakWatchDiminishingReason || '').includes('below50_no_reclaim') || !String(result.weakWatchDiminishingReason || '').includes('invalid_rr'))){
    throw new Error('Alive near_50ma low-score unpriceable Watch must propagate the derived weak-watch diminishing reason through the simplified pipeline.');
  }
  if(weakLowScoreSurfaces.some(result => !result.weakWatchDiminishingTrace || result.weakWatchDiminishingTrace.applied !== true || result.weakWatchDiminishingTrace.evaluatedBeforeFinalMonitorFallback !== true || !Array.isArray(result.weakWatchDiminishingTrace.triggerTokens))){
    throw new Error('Alive near_50ma low-score unpriceable Watch must expose a structured weak-watch diminishing trace.');
  }
  if(weakLowScoreSurfaces.some(result => result.weakWatchDiminishingTrace.priceabilityState !== 'unpriceable' || result.weakWatchDiminishingTrace.priceabilityUnpriceable !== true || result.weakWatchDiminishingTrace.returnPath !== 'weak_watch_diminishing')){
    throw new Error('Alive near_50ma low-score unpriceable Watch must use the normalized unpriceable priceability source and the weak_watch_diminishing return path.');
  }

  const lngStyleWeakWatchRecord = {
    ticker:'LNGX',
    in_watchlist:true,
    plan:{},
    marketData:{price:52.1, ma20:54.8, ma50:56.4, ma200:45.2, currency:'USD'},
    setup:{volumeRequired:false}
  };
  const lngStyleWeakWatchDeps = depsFor({
    structureState:'intact',
    trendState:'intact',
    setupLocationState:'extended',
    priceabilityState:'unpriceable',
    stabilisationState:'early',
    bounceState:'attempt',
    pullbackZone:'extended',
    volumeState:'normal'
  }, {
    finalVerdict:'Watch',
    structuralState:'developing',
    actionStateKey:'wait_for_confirmation',
    planStatusKey:'missing',
    tradeabilityVerdict:'Watch',
    blockerReason:'Watch - strong trend, but no clean pullback entry yet.',
    reasonSummary:'Watch - strong trend, but no clean pullback entry yet.',
    terminal:false,
    baseVerdict:'watch',
    entry_gate_checks:{
      below_50_without_reclaim:true,
      has_clear_invalidation_level:false,
      plan_ok:false,
      tradeability_ok:false,
      rr_ok:false,
      rr_priceable:false,
      resolved_rr:null,
      reclaim_signal_count:0
    },
    near_entry_gate_checks:{
      below_50_without_reclaim:true,
      has_clear_invalidation_level:false,
      plan_ok:false,
      tradeability_ok:false,
      rr_ok:false,
      rr_priceable:false,
      resolved_rr:null,
      reclaim_signal_count:0
    },
    viabilityInputs:{
      planValid:false,
      tradeabilityOk:false,
      rrOk:false,
      below50WithoutReclaim:true
    },
    viability:'watchlist',
    viabilityBranchId:'alive_watchlist'
  }, 4);
  const lngStyleWeakWatchSurfaces = ['scan', 'track', 'review'].map(surface => pipeline.resolveRecordState(
    lngStyleWeakWatchRecord,
    {
      surface,
      log:false,
      deps:lngStyleWeakWatchDeps
    }
  ));
  if(lngStyleWeakWatchSurfaces.some(result => result.canonicalVerdict !== 'watch' || result.visualBucket !== 'diminishing' || result.tone !== 'diminishing')){
    throw new Error('LNG-style alive extended unpriceable Watch must render as Diminishing across scan, track, and review.');
  }
  if(lngStyleWeakWatchSurfaces.some(result => result.weakWatchDiminishingApplied !== true || !String(result.weakWatchDiminishingReason || '').includes('unpriceable') || !String(result.weakWatchDiminishingReason || '').includes('missing_plan') || !String(result.weakWatchDiminishingReason || '').includes('below50_no_reclaim'))){
    throw new Error('LNG-style alive extended unpriceable Watch must apply the weak-watch diminishing guard with the expected reason tokens.');
  }
  if(lngStyleWeakWatchSurfaces.some(result => !result.mainBlocker || /strong trend, but no clean pullback entry yet/i.test(result.mainBlocker) || /price is too extended/i.test(result.mainBlocker))){
    throw new Error('LNG-style alive extended unpriceable Watch must use reclaim / safe-entry diminishing copy, not constructive strong-trend copy.');
  }
  if(lngStyleWeakWatchSurfaces.some(result => !result.weakWatchDiminishingTrace || result.weakWatchDiminishingTrace.applied !== true || result.weakWatchDiminishingTrace.returnPath !== 'weak_watch_diminishing')){
    throw new Error('LNG-style alive extended unpriceable Watch must commit the weak-watch diminishing trace before monitor fallback.');
  }

  const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const weakWatchReasonDeps = {
    resolveGlobalVerdict(){
      return {
        structure_eligibility:'alive',
        viability:'watchlist',
        viabilityBranchId:'alive_watchlist',
        setup_location_state:'near_50ma',
        priceability_state:'unpriceable',
        entry_gate_pass:false,
        near_entry_gate_pass:false,
        entry_gate_checks:{
          below_50_without_reclaim:false,
          has_clear_invalidation_level:false,
          plan_ok:false,
          tradeability_ok:false,
          rr_ok:false,
          rr_priceable:false,
          resolved_rr:null
        },
        near_entry_gate_checks:{
          below_50_without_reclaim:false,
          has_clear_invalidation_level:false,
          plan_ok:false,
          tradeability_ok:false,
          rr_ok:false,
          rr_priceable:false,
          resolved_rr:null
        },
        final_verdict:'watch',
        main_blocker:'No valid invalidation level is available.'
      };
    },
    getBadge:resolverCore.getBadge,
    normalizeGlobalVerdictKey:resolverCore.normalizeGlobalVerdictKey,
    normalizeVerdict:resolverCore.normalizeVerdict
  };
  const scanSemanticSandbox = {
    console,
    normalizeGlobalVerdictKey:resolverCore.normalizeGlobalVerdictKey,
    resolveGlobalVerdict(record){
      return weakWatchReasonDeps.resolveGlobalVerdict(record);
    },
    rawSetupScoreForRecord(record){
      const raw = Number(record && record.rawScore);
      return Number.isFinite(raw) ? raw : 0;
    }
  };
  vm.createContext(scanSemanticSandbox);
  [
    'canonicalBuyerStatesFromStoryContext',
    'canonicalNonChartBlockerSummary',
    'buildDecisionSemantics',
    'sharedDecisionSummaryFromSemantics'
  ].forEach(functionName => {
    vm.runInContext(extractFunctionSource(appSource, functionName), scanSemanticSandbox, {filename:`app.js#${functionName}`});
  });
  weakWatchReasonDeps.buildDecisionSemantics = scanSemanticSandbox.buildDecisionSemantics;
  weakWatchReasonDeps.sharedDecisionSummaryFromSemantics = scanSemanticSandbox.sharedDecisionSummaryFromSemantics;

  const bounceAttemptOnlyVisual = resolverPresentation.resolveVisualState({
    ticker:'ATMBR',
    plan:{},
    marketData:{price:66.53, ma20:64.88, ma50:65.22, ma200:49.32, currency:'USD'}
  }, 'review', {
    derivedStates:{
      structureState:'developing_clean',
      setupLocationState:'near_50ma',
      priceabilityState:'unpriceable',
      stabilisationState:'early',
      bounceState:'attempt',
      pullbackZone:'near_50ma'
    },
    effectivePlan:{},
    displayedPlan:{status:'missing'},
    resolvedContract:{
      finalVerdict:'watch',
      final_verdict:'watch',
      final_verdict_rendered:'watch',
      planStatusKey:'missing',
      entry_gate_checks:{
        below_50_without_reclaim:false,
        has_clear_invalidation_level:true,
        plan_ok:true,
        tradeability_ok:true,
        rr_ok:true,
        rr_priceable:true,
        resolved_rr:2.2,
        reclaim_signal_count:1
      },
      near_entry_gate_checks:{
        below_50_without_reclaim:false,
        has_clear_invalidation_level:true,
        plan_ok:true,
        tradeability_ok:true,
        rr_ok:true,
        rr_priceable:true,
        resolved_rr:2.2,
        reclaim_signal_count:1
      }
    },
    setupScore:5
  }, weakWatchReasonDeps);
  if(bounceAttemptOnlyVisual.canonicalVerdict !== 'watch' || bounceAttemptOnlyVisual.visualBucket !== 'monitor' || bounceAttemptOnlyVisual.tone !== 'monitor'){
    throw new Error('Bounce-attempt-only alive repairing Watch must remain Monitor.');
  }
  if(bounceAttemptOnlyVisual.weakWatchDiminishingApplied !== false || bounceAttemptOnlyVisual.weakWatchDiminishingTrace.applied !== false){
    throw new Error('Bounce-attempt-only alone must not independently force diminishing.');
  }
  if(!bounceAttemptOnlyVisual.weakWatchDiminishingTrace || !Array.isArray(bounceAttemptOnlyVisual.weakWatchDiminishingTrace.triggerTokens) || !bounceAttemptOnlyVisual.weakWatchDiminishingTrace.triggerTokens.includes('bounce_attempt_only')){
    throw new Error('Bounce-attempt-only monitor case must still expose the trace token for diagnostics.');
  }
  if(bounceAttemptOnlyVisual.weakWatchDiminishingTrace.returnPath !== 'monitor_fallback'){
    throw new Error('Bounce-attempt-only monitor case must exit through monitor_fallback, not weak_watch_diminishing.');
  }
  if(/support is holding|support is being tested|buyers still need to prove control|wait for a real buyer response/i.test(String(bounceAttemptOnlyVisual.decision_summary || ''))){
    throw new Error('Unpriceable Watch card summary must not be replaced by canonical chart-only support copy.');
  }
  if(!/price reliably|usable pullback/i.test(String(bounceAttemptOnlyVisual.decision_summary || ''))){
    throw new Error('Unpriceable Watch card summary must preserve the pricing blocker explanation.');
  }

  const lowScoreSupportStoryVisual = resolverPresentation.resolveVisualState({
    ticker:'LOWQ',
    plan:{},
    marketData:{price:71.2, ma20:70.4, ma50:68.9, ma200:61.5, currency:'USD'}
  }, 'scanner', {
    derivedStates:{
      structureState:'developing_clean',
      setupLocationState:'near_20ma',
      priceabilityState:'priceable',
      stabilisationState:'clear',
      bounceState:'attempt',
      pullbackZone:'near_20ma'
    },
    effectivePlan:{},
    displayedPlan:{status:'valid'},
    resolvedContract:{
      finalVerdict:'watch',
      final_verdict:'watch',
      final_verdict_rendered:'watch',
      planStatusKey:'valid'
    },
    setupScore:4
  }, {
    ...weakWatchReasonDeps,
    resolveGlobalVerdict(){
      return {
        structure_eligibility:'alive',
        viability:'watchlist',
        viabilityBranchId:'alive_watchlist_low_score',
        setup_location_state:'near_20ma',
        priceability_state:'priceable',
        final_verdict:'watch',
        main_blocker:'Setup quality is too low.'
      };
    },
    canonicalDecisionSummaryFromStoryContext(){
      return 'Watch - support is holding, but buyers still need to prove control.';
    },
    buildCanonicalStoryContextForRecord(){
      return {currentPhase:'responding_from_support'};
    }
  });
  if(!/support is holding|buyers still need to prove control/i.test(String(lowScoreSupportStoryVisual.decision_summary || ''))){
    throw new Error('Low-score Watch card summary must now prefer the canonical chart-confirmation copy when no independent blocker exists.');
  }
  if(/setup quality has slipped below useful watchlist quality/i.test(String(lowScoreSupportStoryVisual.decision_summary || ''))){
    throw new Error('Low-score Watch card summary must not let low-score quality copy hide the canonical chart story by itself.');
  }

  const invalidPlanSupportStoryVisual = resolverPresentation.resolveVisualState({
    ticker:'PLANX',
    plan:{},
    marketData:{price:88.4, ma20:87.6, ma50:84.1, ma200:72.3, currency:'USD'}
  }, 'scanner', {
    derivedStates:{
      structureState:'strong',
      setupLocationState:'near_20ma',
      priceabilityState:'priceable',
      stabilisationState:'clear',
      bounceState:'attempt',
      pullbackZone:'near_20ma'
    },
    effectivePlan:{},
    displayedPlan:{status:'invalid'},
    resolvedContract:{
      finalVerdict:'watch',
      final_verdict:'watch',
      final_verdict_rendered:'watch',
      planStatusKey:'invalid'
    },
    setupScore:7
  }, {
    ...weakWatchReasonDeps,
    resolveGlobalVerdict(){
      return {
        structure_eligibility:'alive',
        viability:'watchlist',
        viabilityBranchId:'alive_watchlist',
        setup_location_state:'near_20ma',
        priceability_state:'priceable',
        final_verdict:'watch',
        main_blocker:'Plan needs rebuilding before the setup is actionable.'
      };
    },
    canonicalDecisionSummaryFromStoryContext(){
      return 'Watch - support is holding, but buyers still need to prove control.';
    },
    buildCanonicalStoryContextForRecord(){
      return {currentPhase:'responding_from_support'};
    }
  });
  if(!/plan needs rebuilding/i.test(String(invalidPlanSupportStoryVisual.decision_summary || ''))){
    throw new Error('Invalid-plan Watch card summary must preserve the plan blocker path.');
  }
  if(/buyers still need to prove control|support is holding/i.test(String(invalidPlanSupportStoryVisual.decision_summary || ''))){
    throw new Error('Invalid-plan Watch card summary must not be replaced by canonical chart-confirmation copy.');
  }

  const canonicalConfirmationVisual = resolverPresentation.resolveVisualState({
    ticker:'RESPX',
    plan:{},
    marketData:{price:104.8, ma20:103.9, ma50:100.4, ma200:91.7, currency:'USD'}
  }, 'scanner', {
    derivedStates:{
      structureState:'strong',
      setupLocationState:'near_20ma',
      priceabilityState:'priceable',
      stabilisationState:'clear',
      bounceState:'attempt',
      pullbackZone:'near_20ma'
    },
    effectivePlan:{},
    displayedPlan:{status:'valid'},
    resolvedContract:{
      finalVerdict:'near_entry',
      final_verdict:'near_entry',
      final_verdict_rendered:'near_entry',
      planStatusKey:'valid'
    },
    setupScore:7
  }, {
    ...weakWatchReasonDeps,
    resolveGlobalVerdict(){
      return {
        structure_eligibility:'alive',
        viability:'watchlist',
        viabilityBranchId:'alive_watchlist',
        setup_location_state:'near_20ma',
        priceability_state:'priceable',
        final_verdict:'near_entry',
        main_blocker:'Needs confirmation before promotion.'
      };
    },
    canonicalDecisionSummaryFromStoryContext(){
      return 'Near Entry - support is holding, but the trigger is still missing.';
    },
    buildCanonicalStoryContextForRecord(){
      return {currentPhase:'responding_from_support'};
    }
  });
  const baselineConfirmationVisual = resolverPresentation.resolveVisualState({
    ticker:'RESPX',
    plan:{},
    marketData:{price:104.8, ma20:103.9, ma50:100.4, ma200:91.7, currency:'USD'}
  }, 'scanner', {
    derivedStates:{
      structureState:'strong',
      setupLocationState:'near_20ma',
      priceabilityState:'priceable',
      stabilisationState:'clear',
      bounceState:'attempt',
      pullbackZone:'near_20ma'
    },
    effectivePlan:{},
    displayedPlan:{status:'valid'},
    resolvedContract:{
      finalVerdict:'near_entry',
      final_verdict:'near_entry',
      final_verdict_rendered:'near_entry',
      planStatusKey:'valid'
    },
    setupScore:7
  }, {
    ...weakWatchReasonDeps,
    resolveGlobalVerdict(){
      return {
        structure_eligibility:'alive',
        viability:'watchlist',
        viabilityBranchId:'alive_watchlist',
        setup_location_state:'near_20ma',
        priceability_state:'priceable',
        final_verdict:'near_entry',
        main_blocker:'Needs confirmation before promotion.'
      };
    }
  });
  if(String(canonicalConfirmationVisual.decision_summary || '').trim() !== 'Near Entry - support is holding, but the trigger is still missing.'){
    throw new Error('Ordinary chart-confirmation Near Entry case must use the canonical chart-story summary.');
  }
  if(canonicalConfirmationVisual.canonicalVerdict !== baselineConfirmationVisual.canonicalVerdict
    || canonicalConfirmationVisual.visualBucket !== baselineConfirmationVisual.visualBucket){
    throw new Error('Card summary fixes must not alter verdict or visual bucket.');
  }

  const awayFromSupportVisual = resolverPresentation.resolveVisualState({
    ticker:'AWAYSCAN',
    rawScore:7,
    plan:{},
    marketData:{price:104.8, ma20:103.9, ma50:100.4, ma200:91.7, currency:'USD'}
  }, 'scanner', {
    derivedStates:{
      structureState:'strong',
      setupLocationState:'off_level',
      priceabilityState:'priceable',
      stabilisationState:'clear',
      bounceState:'attempt',
      pullbackZone:'off_level'
    },
    effectivePlan:{},
    displayedPlan:{status:'valid'},
    resolvedContract:{
      finalVerdict:'watch',
      final_verdict:'watch',
      final_verdict_rendered:'watch',
      planStatusKey:'valid'
    },
    setupScore:7
  }, {
    ...weakWatchReasonDeps,
    resolveGlobalVerdict(){
      return {
        structure_eligibility:'alive',
        viability:'watchlist',
        viabilityBranchId:'alive_watchlist',
        setup_location_state:'off_level',
        priceability_state:'priceable',
        final_verdict:'watch',
        main_blocker:''
      };
    },
    buildCanonicalStoryContextForRecord(){
      return {
        currentPhase:'away_from_support',
        support:{label:'20MA'},
        buyerControl:{state:'none'}
      };
    }
  });
  if(String(awayFromSupportVisual.decision_summary || '').trim() !== 'Watch - trend remains constructive, but price is currently away from support.'){
    throw new Error('Scanner Watch summary must use away-from-support caution when canonical phase says price is off support.');
  }
  if(/setup quality fading|chart needs to stabilise|buyers are failing|developing toward entry|no pullback/i.test(String(awayFromSupportVisual.decision_summary || ''))){
    throw new Error('Scanner away-from-support Watch summary must avoid synthetic negative language.');
  }
  if(awayFromSupportVisual.canonicalVerdict !== 'watch' || awayFromSupportVisual.visualBucket !== 'monitor'){
    throw new Error('Scanner away-from-support summary migration must not alter verdict or visual bucket.');
  }

  const missingPlanConstructiveNoneVisual = resolverPresentation.resolveVisualState({
    ticker:'NOPLAN',
    plan:{},
    marketData:{price:96.4, ma20:95.8, ma50:92.1, ma200:84.6, currency:'USD'}
  }, 'scanner', {
    derivedStates:{
      structureState:'strong',
      setupLocationState:'none',
      priceabilityState:'priceable',
      stabilisationState:'clear',
      bounceState:'attempt',
      pullbackZone:'none'
    },
    effectivePlan:{},
    displayedPlan:{status:'missing'},
    resolvedContract:{
      finalVerdict:'watch',
      final_verdict:'watch',
      final_verdict_rendered:'watch',
      planStatusKey:'missing'
    },
    setupScore:7
  }, {
    ...weakWatchReasonDeps,
    resolveGlobalVerdict(){
      return {
        structure_eligibility:'alive',
        viability:'watchlist',
        viabilityBranchId:'alive_watchlist',
        setup_location_state:'none',
        priceability_state:'priceable',
        final_verdict:'watch',
        main_blocker:'No valid invalidation level is available.'
      };
    }
  });
  if(String(missingPlanConstructiveNoneVisual.decision_summary || '').trim() !== 'No valid invalidation level is available.'){
    throw new Error('Constructive scanner Watch with setupLocationState none and missing plan must show the missing-plan blocker.');
  }
  if(/waiting for confirmation/i.test(String(missingPlanConstructiveNoneVisual.decision_summary || ''))){
    throw new Error('Constructive scanner Watch with missing plan must not use generic waiting-for-confirmation copy.');
  }

  const invalidPlanConstructiveNoneVisual = resolverPresentation.resolveVisualState({
    ticker:'BADPLAN',
    plan:{},
    marketData:{price:96.4, ma20:95.8, ma50:92.1, ma200:84.6, currency:'USD'}
  }, 'scanner', {
    derivedStates:{
      structureState:'strong',
      setupLocationState:'none',
      priceabilityState:'priceable',
      stabilisationState:'clear',
      bounceState:'attempt',
      pullbackZone:'none'
    },
    effectivePlan:{},
    displayedPlan:{status:'invalid'},
    resolvedContract:{
      finalVerdict:'watch',
      final_verdict:'watch',
      final_verdict_rendered:'watch',
      planStatusKey:'invalid'
    },
    setupScore:7
  }, {
    ...weakWatchReasonDeps,
    resolveGlobalVerdict(){
      return {
        structure_eligibility:'alive',
        viability:'watchlist',
        viabilityBranchId:'alive_watchlist',
        setup_location_state:'none',
        priceability_state:'priceable',
        final_verdict:'watch',
        main_blocker:'Plan needs rebuilding before the setup is actionable.'
      };
    }
  });
  if(String(invalidPlanConstructiveNoneVisual.decision_summary || '').trim() !== 'Plan needs rebuilding before the setup is actionable.'){
    throw new Error('Constructive scanner Watch with invalid plan must keep the invalid-plan blocker visible.');
  }

  const earlyBounceMessyMonitorDeps = {
    resolveGlobalVerdict(){
      return {
        structure_eligibility:'messy',
        viability:'watchlist',
        viabilityBranchId:'messy_watchlist',
        setup_location_state:'near_50ma',
        priceability_state:'unpriceable',
        entry_gate_pass:false,
        near_entry_gate_pass:false,
        entry_gate_checks:{
          below_50_without_reclaim:false,
          has_clear_invalidation_level:true,
          plan_ok:false,
          tradeability_ok:true,
          rr_ok:true,
          rr_priceable:true,
          resolved_rr:2.1,
          reclaim_signal_count:1
        },
        near_entry_gate_checks:{
          below_50_without_reclaim:false,
          has_clear_invalidation_level:true,
          plan_ok:false,
          tradeability_ok:true,
          rr_ok:true,
          rr_priceable:true,
          resolved_rr:2.1,
          reclaim_signal_count:1
        },
        final_verdict:'watch',
        main_blocker:'Repair is in progress, but the bounce is still early.'
      };
    },
    getBadge:resolverCore.getBadge,
    normalizeGlobalVerdictKey:resolverCore.normalizeGlobalVerdictKey,
    normalizeVerdict:resolverCore.normalizeVerdict
  };

  const aliveMessyRepairMonitor = resolverPresentation.resolveVisualState({
    ticker:'MESSYR',
    plan:{},
    marketData:{price:88.4, ma20:87.9, ma50:87.2, ma200:70.1, currency:'USD'}
  }, 'review', {
    derivedStates:{
      structureState:'weakening',
      setupLocationState:'near_50ma',
      priceabilityState:'unpriceable',
      stabilisationState:'early',
      bounceState:'early',
      pullbackZone:'near_50ma'
    },
    effectivePlan:{},
    displayedPlan:{status:'missing'},
    resolvedContract:{
      finalVerdict:'watch',
      final_verdict:'watch',
      final_verdict_rendered:'watch',
      planStatusKey:'missing',
      entry_gate_checks:{
        below_50_without_reclaim:false,
        has_clear_invalidation_level:true,
        plan_ok:false,
        tradeability_ok:true,
        rr_ok:true,
        rr_priceable:true,
        resolved_rr:2.1,
        reclaim_signal_count:1
      },
      near_entry_gate_checks:{
        below_50_without_reclaim:false,
        has_clear_invalidation_level:true,
        plan_ok:false,
        tradeability_ok:true,
        rr_ok:true,
        rr_priceable:true,
        resolved_rr:2.1,
        reclaim_signal_count:1
      }
    },
    setupScore:5
  }, earlyBounceMessyMonitorDeps);
  if(aliveMessyRepairMonitor.canonicalVerdict !== 'watch' || aliveMessyRepairMonitor.visualBucket !== 'monitor' || aliveMessyRepairMonitor.tone !== 'monitor'){
    throw new Error('Alive/messy + unpriceable + early bounce + stabilising near support must remain Monitor.');
  }
  if(aliveMessyRepairMonitor.weakWatchDiminishingApplied !== false || aliveMessyRepairMonitor.weakWatchDiminishingTrace.applied !== false){
    throw new Error('Alive/messy repairing unpriceable setup must not be visually punished by weak-watch diminishing.');
  }

  const noReclaimSignalsVisual = resolverPresentation.resolveVisualState({
    ticker:'NORECL',
    plan:{entry:100, stop:97, firstTarget:106},
    marketData:{price:99.5, ma20:100, ma50:94, ma200:80, currency:'GBP'}
  }, 'review', {
    derivedStates:{
      structureState:'developing_clean',
      setupLocationState:'near_50ma',
      priceabilityState:'unpriceable',
      stabilisationState:'early',
      bounceState:'attempt',
      pullbackZone:'near_50ma'
    },
    effectivePlan:{entry:100, stop:97, firstTarget:106},
    displayedPlan:{status:'valid'},
    resolvedContract:{
      finalVerdict:'watch',
      final_verdict:'watch',
      final_verdict_rendered:'watch',
      planStatusKey:'missing',
      entry_gate_checks:{
        below_50_without_reclaim:false,
        has_clear_invalidation_level:true,
        plan_ok:false,
        tradeability_ok:true,
        rr_ok:true,
        rr_priceable:true,
        resolved_rr:2.4,
        reclaim_signal_count:0
      },
      near_entry_gate_checks:{
        below_50_without_reclaim:false,
        has_clear_invalidation_level:true,
        plan_ok:false,
        tradeability_ok:true,
        rr_ok:true,
        rr_priceable:true,
        resolved_rr:2.4,
        reclaim_signal_count:0
      }
    },
    setupScore:2
  }, weakWatchReasonDeps);
  if(noReclaimSignalsVisual.canonicalVerdict !== 'watch' || noReclaimSignalsVisual.visualBucket !== 'diminishing' || noReclaimSignalsVisual.tone !== 'diminishing'){
    throw new Error('No-reclaim-signals weak Watch must render as Diminishing.');
  }
  if(!String(noReclaimSignalsVisual.weakWatchDiminishingReason || '').includes('no_reclaim_signals') || /below50_no_reclaim/.test(noReclaimSignalsVisual.weakWatchDiminishingReason || '')){
    throw new Error('No-reclaim-signals weak Watch must use the no_reclaim_signals reason token without claiming below50_no_reclaim.');
  }
  if(!noReclaimSignalsVisual.weakWatchDiminishingTrace || !Array.isArray(noReclaimSignalsVisual.weakWatchDiminishingTrace.triggerTokens) || !noReclaimSignalsVisual.weakWatchDiminishingTrace.triggerTokens.includes('no_reclaim_signals') || noReclaimSignalsVisual.weakWatchDiminishingTrace.returnPath !== 'weak_watch_diminishing'){
    throw new Error('No-reclaim-signals weak Watch must expose the no_reclaim_signals trace token before final monitor fallback.');
  }

  const invalidRrVisual = resolverPresentation.resolveVisualState({
    ticker:'INVRR',
    plan:{entry:100, stop:97, firstTarget:106},
    marketData:{price:99.5, ma20:100, ma50:94, ma200:80, currency:'GBP'}
  }, 'review', {
    derivedStates:{
      structureState:'developing_clean',
      setupLocationState:'near_50ma',
      priceabilityState:'unpriceable',
      stabilisationState:'early',
      bounceState:'confirmed',
      pullbackZone:'near_50ma'
    },
    effectivePlan:{entry:100, stop:97, firstTarget:106},
    displayedPlan:{status:'valid'},
    resolvedContract:{
      finalVerdict:'watch',
      final_verdict:'watch',
      final_verdict_rendered:'watch',
      planStatusKey:'valid',
      entry_gate_checks:{
        below_50_without_reclaim:false,
        has_clear_invalidation_level:true,
        plan_ok:true,
        tradeability_ok:true,
        rr_ok:false,
        rr_priceable:false,
        resolved_rr:1.4
      },
      near_entry_gate_checks:{
        below_50_without_reclaim:false,
        has_clear_invalidation_level:true,
        plan_ok:true,
        tradeability_ok:true,
        rr_ok:false,
        rr_priceable:false,
        resolved_rr:1.4
      }
    },
    setupScore:2
  }, weakWatchReasonDeps);
  if(invalidRrVisual.canonicalVerdict !== 'watch' || invalidRrVisual.visualBucket !== 'diminishing' || invalidRrVisual.tone !== 'diminishing'){
    throw new Error('Invalid-RR weak Watch must render as Diminishing.');
  }
  if(!String(invalidRrVisual.weakWatchDiminishingReason || '').includes('invalid_rr') || /below50_no_reclaim/.test(invalidRrVisual.weakWatchDiminishingReason || '')){
    throw new Error('Invalid-RR weak Watch must include the invalid_rr reason token and must not claim below50_no_reclaim.');
  }
  if(!invalidRrVisual.weakWatchDiminishingTrace || !Array.isArray(invalidRrVisual.weakWatchDiminishingTrace.triggerTokens) || !invalidRrVisual.weakWatchDiminishingTrace.triggerTokens.includes('invalid_rr') || invalidRrVisual.weakWatchDiminishingTrace.evaluatedBeforeFinalMonitorFallback !== true){
    throw new Error('Invalid-RR weak Watch must expose the invalid_rr trace token before final monitor fallback.');
  }
  if(invalidRrVisual.weakWatchDiminishingTrace.priceabilityState !== 'unpriceable' || invalidRrVisual.weakWatchDiminishingTrace.priceabilityUnpriceable !== true || invalidRrVisual.weakWatchDiminishingTrace.returnPath !== 'weak_watch_diminishing'){
    throw new Error('Invalid-RR weak Watch must resolve normalized unpriceable priceability before final monitor fallback.');
  }

  const promotionBlockedConstructiveVisual = resolverPresentation.resolveVisualState({
    ticker:'PBLOCK',
    plan:{},
    marketData:{price:77.2, ma20:76.8, ma50:75.9, ma200:60.3, currency:'USD'}
  }, 'review', {
    derivedStates:{
      structureState:'developing_clean',
      setupLocationState:'near_20ma',
      priceabilityState:'unpriceable',
      stabilisationState:'early',
      bounceState:'attempt',
      pullbackZone:'near_20ma'
    },
    effectivePlan:{},
    displayedPlan:{status:'missing'},
    resolvedContract:{
      finalVerdict:'watch',
      final_verdict:'watch',
      final_verdict_rendered:'watch',
      planStatusKey:'missing',
      presentationUpgradeBlocked:true,
      near_entry_gate_pass:false,
      entry_gate_pass:false,
      entry_gate_checks:{
        below_50_without_reclaim:false,
        has_clear_invalidation_level:true,
        plan_ok:false,
        tradeability_ok:true,
        rr_ok:true,
        rr_priceable:true,
        resolved_rr:2.0,
        reclaim_signal_count:1
      },
      near_entry_gate_checks:{
        below_50_without_reclaim:false,
        has_clear_invalidation_level:true,
        plan_ok:false,
        tradeability_ok:true,
        rr_ok:true,
        rr_priceable:true,
        resolved_rr:2.0,
        reclaim_signal_count:1
      }
    },
    setupScore:6
  }, weakWatchReasonDeps);
  if(promotionBlockedConstructiveVisual.visualBucket !== 'monitor' || promotionBlockedConstructiveVisual.weakWatchDiminishingApplied !== false){
    throw new Error('Promotion-blocked alone must not downgrade a constructive alive repairing Watch to Diminishing.');
  }

  const aliveMessyNoReclaimDiminishing = resolverPresentation.resolveVisualState({
    ticker:'NOREPAIR',
    plan:{},
    marketData:{price:41.2, ma20:43.8, ma50:44.1, ma200:33.4, currency:'USD'}
  }, 'review', {
    derivedStates:{
      structureState:'developing_clean',
      setupLocationState:'near_50ma',
      priceabilityState:'unpriceable',
      stabilisationState:'none',
      bounceState:'none',
      pullbackZone:'near_50ma'
    },
    effectivePlan:{},
    displayedPlan:{status:'missing'},
    resolvedContract:{
      finalVerdict:'watch',
      final_verdict:'watch',
      final_verdict_rendered:'watch',
      planStatusKey:'missing',
      entry_gate_checks:{
        below_50_without_reclaim:true,
        has_clear_invalidation_level:false,
        plan_ok:false,
        tradeability_ok:false,
        rr_ok:false,
        rr_priceable:false,
        resolved_rr:null,
        reclaim_signal_count:0
      },
      near_entry_gate_checks:{
        below_50_without_reclaim:true,
        has_clear_invalidation_level:false,
        plan_ok:false,
        tradeability_ok:false,
        rr_ok:false,
        rr_priceable:false,
        resolved_rr:null,
        reclaim_signal_count:0
      }
    },
    setupScore:5
  }, earlyBounceMessyMonitorDeps);
  if(aliveMessyNoReclaimDiminishing.canonicalVerdict !== 'watch' || aliveMessyNoReclaimDiminishing.visualBucket !== 'diminishing' || aliveMessyNoReclaimDiminishing.tone !== 'diminishing'){
    throw new Error('Alive/messy + unpriceable + no bounce + below50/no reclaim must still downgrade to Diminishing.');
  }

  const damagedMissingPlanDiminishing = resolverPresentation.resolveVisualState({
    ticker:'DMGNP',
    plan:{},
    marketData:{price:29.1, ma20:30.4, ma50:31.3, ma200:24.8, currency:'USD'}
  }, 'review', {
    derivedStates:{
      structureState:'weakening',
      setupLocationState:'off_level',
      priceabilityState:'unpriceable',
      stabilisationState:'none',
      bounceState:'none',
      pullbackZone:'none'
    },
    effectivePlan:{},
    displayedPlan:{status:'missing'},
    resolvedContract:{
      finalVerdict:'watch',
      final_verdict:'watch',
      final_verdict_rendered:'watch',
      planStatusKey:'missing',
      entry_gate_checks:{
        below_50_without_reclaim:true,
        has_clear_invalidation_level:false,
        plan_ok:false,
        tradeability_ok:false,
        rr_ok:false,
        rr_priceable:false,
        resolved_rr:null,
        reclaim_signal_count:0
      },
      near_entry_gate_checks:{
        below_50_without_reclaim:true,
        has_clear_invalidation_level:false,
        plan_ok:false,
        tradeability_ok:false,
        rr_ok:false,
        rr_priceable:false,
        resolved_rr:null,
        reclaim_signal_count:0
      }
    },
    setupScore:4
  }, {
    resolveGlobalVerdict(){
      return {
        structure_eligibility:'damaged',
        viability:'low_priority',
        viabilityBranchId:'damaged_invalid_plan_no_bounce_low_priority',
        setup_location_state:'off_level',
        priceability_state:'unpriceable',
        entry_gate_pass:false,
        near_entry_gate_pass:false,
        entry_gate_checks:{
          below_50_without_reclaim:true,
          has_clear_invalidation_level:false,
          plan_ok:false,
          tradeability_ok:false,
          rr_ok:false,
          rr_priceable:false,
          resolved_rr:null,
          reclaim_signal_count:0
        },
        near_entry_gate_checks:{
          below_50_without_reclaim:true,
          has_clear_invalidation_level:false,
          plan_ok:false,
          tradeability_ok:false,
          rr_ok:false,
          rr_priceable:false,
          resolved_rr:null,
          reclaim_signal_count:0
        },
        final_verdict:'watch',
        main_blocker:'Trend is weakening - no reliable stop level yet.'
      };
    },
    getBadge:resolverCore.getBadge,
    normalizeGlobalVerdictKey:resolverCore.normalizeGlobalVerdictKey,
    normalizeVerdict:resolverCore.normalizeVerdict
  });
  if(damagedMissingPlanDiminishing.canonicalVerdict !== 'watch' || damagedMissingPlanDiminishing.visualBucket !== 'diminishing' || damagedMissingPlanDiminishing.tone !== 'diminishing'){
    throw new Error('Damaged + missing plan + no valid invalidation + no bounce must remain Diminishing.');
  }

  const brokenStructureTerminalVisual = resolverPresentation.resolveVisualState({
    ticker:'BROKENX',
    plan:{},
    marketData:{price:18.2, ma20:21.1, ma50:24.7, ma200:30.5, currency:'USD'}
  }, 'review', {
    derivedStates:{
      structureState:'broken',
      setupLocationState:'off_level',
      priceabilityState:'unpriceable',
      stabilisationState:'none',
      bounceState:'none',
      pullbackZone:'none'
    },
    effectivePlan:{},
    displayedPlan:{status:'missing'},
    resolvedContract:{
      finalVerdict:'avoid',
      final_verdict:'avoid',
      final_verdict_rendered:'avoid',
      planStatusKey:'missing'
    },
    setupScore:1
  }, {
    resolveGlobalVerdict(){
      return {
        structure_eligibility:'broken',
        viability:'reject',
        viabilityBranchId:'broken_structure_reject',
        setup_location_state:'off_level',
        priceability_state:'unpriceable',
        final_verdict:'avoid',
        terminal_avoid_applied:true,
        main_blocker:'Structure is broken.'
      };
    },
    getBadge:resolverCore.getBadge,
    normalizeGlobalVerdictKey:resolverCore.normalizeGlobalVerdictKey,
    normalizeVerdict:resolverCore.normalizeVerdict
  });
  if(brokenStructureTerminalVisual.canonicalVerdict !== 'avoid' || brokenStructureTerminalVisual.visualBucket !== 'avoid' || brokenStructureTerminalVisual.tone !== 'avoid'){
    throw new Error('Broken structure must preserve terminal Avoid behaviour unchanged.');
  }

  const constructiveNoPlanNoBounceWatch = pipeline.resolveRecordState({
    ticker:'MARLIVE',
    in_watchlist:true,
    plan:{},
    marketData:{price:350.83, ma20:340, ma50:325, ma200:290, currency:'USD'},
    setup:{volumeRequired:false}
  }, {
    log:false,
    deps:depsFor({
      structureState:'strong',
      trendState:'strong',
      setupLocationState:'none',
      priceabilityState:'',
      stabilisationState:'none',
      bounceState:'none',
      pullbackZone:'none',
      volumeState:'weak'
    }, {
      finalVerdict:'Watch',
      structuralState:'developing',
      actionStateKey:'recalculate_plan',
      planStatusKey:'missing',
      tradeabilityVerdict:'Watch',
      blockerReason:'No valid invalidation level is available.',
      reasonSummary:'No valid invalidation level is available. + Weak volume',
      terminal:false,
      baseVerdict:'watch'
    }, 8)
  });
  const marLiveResolved = constructiveNoPlanNoBounceWatch.debug && constructiveNoPlanNoBounceWatch.debug.resolvedState || {};
  if(constructiveNoPlanNoBounceWatch.canonicalVerdict !== 'watch' || constructiveNoPlanNoBounceWatch.visualBucket !== 'monitor' || constructiveNoPlanNoBounceWatch.tone !== 'monitor' || constructiveNoPlanNoBounceWatch.badgeLabel !== 'Watch'){
    throw new Error('Strong high-score Watch with missing plan/no bounce must remain Monitor unless deterioration evidence exists.');
  }
  if(marLiveResolved.viability !== 'watchlist' || marLiveResolved.rejected_by_viability_gate === true || marLiveResolved.terminal_avoid_applied === true){
    throw new Error('Strong high-score missing-plan Watch must remain non-terminal watchlist.');
  }
  if(constructiveNoPlanNoBounceWatch.entryGatePass !== false || constructiveNoPlanNoBounceWatch.nearEntryGatePass !== false){
    throw new Error('Strong high-score missing-plan Watch must still fail Entry/Near Entry gates.');
  }

  const intactProvisionalPriceability = pipeline.resolveRecordState({
    ticker:'INTACTP',
    in_watchlist:true,
    plan:{},
    marketData:{price:102, ma20:101, ma50:98, ma200:84, currency:'USD'},
    setup:{volumeRequired:false}
  }, {
    log:false,
    deps:depsFor({
      structureState:'intact',
      trendState:'intact',
      setupLocationState:'near_20ma',
      priceabilityState:'unpriceable',
      stabilisationState:'early',
      bounceState:'attempt',
      pullbackZone:'near_20ma',
      volumeState:'normal'
    }, {
      finalVerdict:'Watch',
      structuralState:'developing',
      actionStateKey:'wait_for_confirmation',
      planStatusKey:'missing',
      tradeabilityVerdict:'Watch',
      blockerReason:'Needs stronger confirmation',
      reasonSummary:'Waiting for confirmation.',
      terminal:false,
      baseVerdict:'watch'
    }, 8)
  });
  if(!/not priceable yet|untradable|price reliably/i.test(String(intactProvisionalPriceability.mainBlocker || '')) || /weakening|broken/i.test(String(intactProvisionalPriceability.mainBlocker || ''))){
    throw new Error('Intact structure + provisional priceability must blame priceability, not structure.');
  }

  const intactWeakRr = pipeline.resolveRecordState({
    ticker:'INTACTRR',
    in_watchlist:true,
    plan:{entry:100, stop:97, firstTarget:103.6},
    marketData:{price:100.2, ma20:99.8, ma50:97.6, ma200:82, currency:'USD'},
    setup:{volumeRequired:false}
  }, {
    log:false,
    deps:depsFor({
      structureState:'intact',
      trendState:'intact',
      setupLocationState:'near_20ma',
      priceabilityState:'priceable',
      stabilisationState:'clear',
      bounceState:'attempt',
      pullbackZone:'near_20ma',
      volumeState:'normal'
    }, {
      finalVerdict:'Watch',
      structuralState:'developing',
      actionStateKey:'wait_for_confirmation',
      planStatusKey:'valid',
      tradeabilityVerdict:'Watch',
      blockerReason:'Needs stronger confirmation',
      reasonSummary:'Waiting for confirmation.',
      terminal:false,
      baseVerdict:'watch'
    }, 8)
  });
  if(!/reward potential|resistance/i.test(String(intactWeakRr.mainBlocker || '')) || /weakening|broken/i.test(String(intactWeakRr.mainBlocker || ''))){
    throw new Error('Intact structure + weak RR must blame nearby resistance/reward potential, not structure.');
  }

  const aliveBounceAttempt = pipeline.resolveRecordState({
    ticker:'ALIVEBA',
    in_watchlist:true,
    plan:{entry:100, stop:97, firstTarget:108},
    marketData:{price:100.4, ma20:99.9, ma50:97.8, ma200:83, currency:'USD'},
    setup:{volumeRequired:false}
  }, {
    log:false,
    deps:depsFor({
      structureState:'strong',
      trendState:'intact',
      setupLocationState:'near_20ma',
      priceabilityState:'provisional',
      stabilisationState:'early',
      bounceState:'attempt',
      pullbackZone:'near_20ma',
      volumeState:'normal'
    }, {
      finalVerdict:'Watch',
      structuralState:'developing',
      actionStateKey:'wait_for_confirmation',
      planStatusKey:'valid',
      tradeabilityVerdict:'Watch',
      blockerReason:'Needs stronger confirmation',
      reasonSummary:'Waiting for confirmation.',
      terminal:false,
      baseVerdict:'watch'
    }, 8)
  });
  if(/weakening|broken|damaged/i.test(String(aliveBounceAttempt.mainBlocker || ''))){
    throw new Error('Alive structure + bounce attempt must not inherit structure-failure wording.');
  }

  const damagedStructure = pipeline.resolveRecordState({
    ticker:'DAMAGEDX',
    in_watchlist:true,
    plan:{},
    marketData:{price:44, ma20:45, ma50:46, ma200:41, currency:'USD'},
    setup:{volumeRequired:false}
  }, {
    log:false,
    deps:depsFor({
      structureState:'weakening',
      trendState:'weak',
      setupLocationState:'off_level',
      priceabilityState:'unpriceable',
      stabilisationState:'none',
      bounceState:'none',
      pullbackZone:'none',
      volumeState:'normal'
    }, {
      finalVerdict:'Watch',
      structuralState:'developing',
      actionStateKey:'recalculate_plan',
      planStatusKey:'missing',
      tradeabilityVerdict:'Watch',
      blockerReason:'Trend is weakening - no reliable stop level yet.',
      reasonSummary:'Weakening setup - wait for recovery.',
      terminal:false,
      baseVerdict:'watch'
    }, 4)
  });
  const damagedStructureReason = String(
    damagedStructure
    && damagedStructure.debug
    && damagedStructure.debug.resolvedState
    && damagedStructure.debug.resolvedState.structure_reason
    || ''
  );
  if(!/weakening|no reliable stop/i.test(damagedStructureReason)){
    throw new Error('Damaged structure diagnostics must retain weakening/no reliable stop wording.');
  }
  if(!/weak and not tradeable yet/i.test(String(damagedStructure.mainBlocker || '')) || /structurally broken/i.test(damagedStructureReason)){
    throw new Error('Damaged but non-terminal structure must keep softened public blocker copy without losing the underlying weakening diagnostic.');
  }

  const brokenStructure = pipeline.resolveRecordState({
    ticker:'BROKENB',
    in_watchlist:true,
    plan:{},
    marketData:{price:18, ma20:21, ma50:24, ma200:30, currency:'USD'},
    setup:{volumeRequired:false}
  }, {
    log:false,
    deps:depsFor({
      structureState:'broken',
      trendState:'broken',
      setupLocationState:'off_level',
      priceabilityState:'unpriceable',
      stabilisationState:'none',
      bounceState:'none',
      pullbackZone:'none',
      volumeState:'normal'
    }, {
      finalVerdict:'Avoid',
      structuralState:'dead',
      actionStateKey:'rebuild_setup',
      planStatusKey:'missing',
      tradeabilityVerdict:'Avoid',
      blockerReason:'Structure is broken.',
      reasonSummary:'Structure is broken.',
      terminal:true,
      baseVerdict:'avoid'
    }, 1)
  });
  if(!/structure is broken/i.test(String(brokenStructure.mainBlocker || ''))){
    throw new Error('Broken structure must retain broken-structure wording.');
  }

  const weakeningWatch = pipeline.resolveRecordState({
    ticker:'DOWX',
    in_watchlist:true,
    plan:{entry:50, stop:47, firstTarget:59},
    marketData:{price:49.5, ma20:51, ma50:53, ma200:45, currency:'USD'},
    setup:{volumeRequired:false}
  }, {
    log:false,
    deps:depsFor({
      structureState:'weakening',
      trendState:'weak',
      setupLocationState:'off_level',
      priceabilityState:'priceable',
      stabilisationState:'none',
      bounceState:'none',
      pullbackZone:'none',
      volumeState:'normal'
    }, {
      finalVerdict:'Watch',
      structuralState:'developing',
      actionStateKey:'recalculate_plan',
      planStatusKey:'valid',
      tradeabilityVerdict:'Watch',
      blockerReason:'Trend is weakening - no reliable stop level yet.',
      reasonSummary:'Weakening setup - wait for recovery.',
      terminal:false,
      baseVerdict:'watch'
    }, 5)
  });
  if(weakeningWatch.canonicalVerdict !== 'watch' || weakeningWatch.visualBucket !== 'diminishing' || weakeningWatch.tone !== 'diminishing'){
    throw new Error('Weakening Watch must remain Diminishing.');
  }

  const fallingKnifeBreakdown = pipeline.resolveRecordState({
    ticker:'WLKX',
    in_watchlist:true,
    plan:{},
    marketData:{price:80, ma20:90, ma50:92, ma200:70, perf1w:-8.2, perf1m:-15.5, currency:'USD'},
    setup:{volumeRequired:false}
  }, {
    log:false,
    deps:depsFor({
      structureState:'weakening',
      trendState:'weak',
      setupLocationState:'volatile',
      priceabilityState:'unpriceable',
      stabilisationState:'none',
      bounceState:'none',
      pullbackZone:'none',
      volumeState:'weak'
    }, {
      finalVerdict:'Watch',
      structuralState:'developing',
      actionStateKey:'recalculate_plan',
      planStatusKey:'missing',
      tradeabilityVerdict:'Watch',
      blockerReason:'Trend is weakening - no reliable stop level yet.',
      reasonSummary:'Weakening setup - wait for recovery.',
      terminal:false,
      baseVerdict:'watch'
    }, 2)
  });
  const fallingKnifeResolved = fallingKnifeBreakdown.debug && fallingKnifeBreakdown.debug.resolvedState || {};
  const fallingKnifeText = [
    fallingKnifeBreakdown.mainBlocker,
    fallingKnifeResolved.main_blocker,
    fallingKnifeResolved.reason,
    fallingKnifeResolved.downgrade_reason
  ].join(' | ');
  if(fallingKnifeBreakdown.canonicalVerdict !== 'watch' || fallingKnifeBreakdown.visualBucket !== 'diminishing' || fallingKnifeBreakdown.tone !== 'diminishing'){
    throw new Error('WLK-style falling-knife breakdown must stay a diminishing Watch in the simplified pipeline.');
  }
  if(fallingKnifeResolved.falling_knife_detected !== true || fallingKnifeResolved.semantic_blocker_code !== 'falling_knife' || !/falling_knife/i.test(String(fallingKnifeResolved.viabilityBranchId || ''))){
    throw new Error('WLK-style falling-knife breakdown must expose falling_knife reason diagnostics.');
  }
  if(!/Selling pressure is accelerating/i.test(fallingKnifeText) || /Trend is weakening - no reliable stop level yet/i.test(String(fallingKnifeBreakdown.mainBlocker || ''))){
    throw new Error('WLK-style falling-knife copy must replace soft weakening copy.');
  }

  const rangeBoundWeakening = pipeline.resolveRecordState({
    ticker:'EIXX',
    in_watchlist:true,
    plan:{},
    marketData:{price:98, ma20:100, ma50:97, ma200:72, perf1w:-1.4, perf1m:-4.2, currency:'USD'},
    setup:{volumeRequired:false}
  }, {
    log:false,
    deps:depsFor({
      structureState:'weakening',
      trendState:'weak',
      setupLocationState:'off_level',
      priceabilityState:'unpriceable',
      stabilisationState:'none',
      bounceState:'attempt',
      pullbackZone:'none',
      volumeState:'normal'
    }, {
      finalVerdict:'Watch',
      structuralState:'developing',
      actionStateKey:'recalculate_plan',
      planStatusKey:'missing',
      tradeabilityVerdict:'Watch',
      blockerReason:'Trend is weakening - no reliable stop level yet.',
      reasonSummary:'Weakening setup - wait for recovery.',
      terminal:false,
      baseVerdict:'watch'
    }, 4)
  });
  const rangeBoundResolved = rangeBoundWeakening.debug && rangeBoundWeakening.debug.resolvedState || {};
  if(rangeBoundWeakening.canonicalVerdict !== 'watch' || rangeBoundWeakening.visualBucket !== 'diminishing' || rangeBoundWeakening.tone !== 'diminishing'){
    throw new Error('EIX-style weak but range-bound setup must remain Diminishing Watch, not Avoid.');
  }
  if(rangeBoundResolved.falling_knife_detected === true || /Selling pressure is accelerating/i.test(String(rangeBoundWeakening.mainBlocker || ''))){
    throw new Error('Range-bound weakening must not trigger falling-knife copy.');
  }

  const brokenStructureAvoid = pipeline.resolveRecordState({
    ticker:'BWXTX',
    in_watchlist:true,
    plan:{},
    marketData:{price:55, ma20:65, ma50:70, ma200:80, perf1w:-7, perf1m:-18, currency:'USD'},
    setup:{volumeRequired:false}
  }, {
    log:false,
    deps:depsFor({
      structureState:'broken',
      trendState:'broken',
      setupLocationState:'volatile',
      priceabilityState:'unpriceable',
      stabilisationState:'none',
      bounceState:'none',
      pullbackZone:'none',
      volumeState:'weak'
    }, {
      finalVerdict:'Avoid',
      structuralState:'dead',
      actionStateKey:'recalculate_plan',
      planStatusKey:'missing',
      tradeabilityVerdict:'Avoid',
      blockerReason:'Structure is broken.',
      reasonSummary:'Structure is broken.',
      terminal:true,
      baseVerdict:'avoid'
    }, 1)
  });
  if(brokenStructureAvoid.canonicalVerdict !== 'avoid' || !/Structure is broken/i.test(String(brokenStructureAvoid.mainBlocker || ''))){
    throw new Error('Broken structural Avoid must retain stronger structure-broken copy.');
  }

  const volatileRecovery = pipeline.resolveRecordState({
    ticker:'TSLAX',
    in_watchlist:true,
    reclaimAttempt:true,
    reclaimsLevel:true,
    plan:{entry:250, stop:255, firstTarget:245},
    marketData:{price:260, ma20:230, ma50:220, ma200:180, currency:'USD'},
    setup:{volumeRequired:false}
  }, {
    log:false,
    deps:depsFor({
      structureState:'broken',
      trendState:'strong',
      setupLocationState:'volatile',
      priceabilityState:'unpriceable',
      stabilisationState:'none',
      bounceState:'attempt',
      pullbackZone:'extended',
      volumeState:'normal'
    }, {
      finalVerdict:'Avoid',
      structuralState:'dead',
      actionStateKey:'recalculate_plan',
      planStatusKey:'invalid',
      tradeabilityVerdict:'Avoid',
      blockerReason:'Structure is broken.',
      reasonSummary:'Structure is broken.',
      terminal:true,
      baseVerdict:'avoid'
    })
  });
  const volatileResolved = volatileRecovery.debug && volatileRecovery.debug.resolvedState || {};
  const volatileReasonText = [
    volatileRecovery.mainBlocker,
    volatileResolved.reason,
    volatileResolved.main_blocker,
    volatileResolved.semantic_blocker_reason
  ].join(' | ');
  if(volatileRecovery.entryGatePass !== false || volatileRecovery.nearEntryGatePass !== false){
    throw new Error('Volatile recovery setup must not pass Entry/Near Entry gates.');
  }
  if(/structure is broken|dead|terminal/i.test(volatileReasonText)){
    throw new Error('Volatile recovery setup must not display terminal broken/dead wording.');
  }
  if(!/volatile|recovery attempt|stabili[sz]e|price reliably|pullback/i.test(volatileReasonText)){
    throw new Error('Volatile recovery setup reason must mention volatility/recovery/stabilisation/priceability.');
  }
  if(volatileResolved.non_terminal_recovery_blocker !== true || !volatileResolved.semantic_blocker_code){
    throw new Error('Volatile recovery setup must expose semantic non-terminal blocker debug fields.');
  }

  const legacyAiSaysReady = pipeline.resolveRecordState({
    ticker:'AILEGACY',
    in_watchlist:true,
    plan:{},
    marketData:{price:50, ma20:52, ma50:55, ma200:40, currency:'GBP'},
    review:{
      analysisState:{
        normalized:{
          ai_observation_only:true,
          verdict:'Entry',
          final_verdict:'Entry',
          coach_summary:'Looks ready for entry from the AI text.'
        }
      }
    }
  }, {
    log:false,
    deps:depsFor({
      structureState:'weak',
      trendState:'weak',
      stabilisationState:'none',
      bounceState:'none',
      pullbackZone:'near_50ma',
      volumeState:'normal'
    }, {
      finalVerdict:'Watch',
      structuralState:'developing',
      actionStateKey:'recalculate_plan',
      planStatusKey:'missing',
      tradeabilityVerdict:'Watch',
      blockerReason:'No actionable plan yet.',
      reasonSummary:'Plan not ready.',
      terminal:false,
      baseVerdict:'watch'
    })
  });
  if(['entry','near_entry'].includes(legacyAiSaysReady.canonicalVerdict) || legacyAiSaysReady.entryGatePass !== false || legacyAiSaysReady.nearEntryGatePass !== false){
    throw new Error('Legacy AI verdict/readiness text must not promote weak/no-plan resolver state.');
  }
}

// Consumer 1 is now a publication-only adapter. Its former local-resolution
// assertions live in run-simplified-publication-adapter-assertions.js; keeping
// them here would re-authorize the retired pipeline contract.

function runAiContractAssertions(){
  const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const promptSource = extractFunctionSource(appSource, 'buildPromptBody');
  if(!/chart coach|observation and explanation only|deterministic resolver/i.test(promptSource)){
    throw new Error('AI prompt must frame the model as an observation-only chart coach.');
  }
  if(/verdict must be|app_verdict_ceiling|quality_score =|confidence_score =|Always propose entry/i.test(promptSource)){
    throw new Error('AI prompt must not request verdicts, app scores, readiness ceilings, or trade-plan authority.');
  }
  if(!/coach_summary|constructive_evidence|risk_evidence|what_needs_to_improve|ai_observation_only/i.test(promptSource)){
    throw new Error('AI prompt must request evidence/narrative fields.');
  }
  const normalizeSource = extractFunctionSource(appSource, 'normalizeAnalysisResponse');
  if(!/aiObservation|rawOpinion|final_verdict:''|ai_observation_only:true/i.test(normalizeSource)){
    throw new Error('AI ingestion must quarantine legacy verdict-like fields as non-authoritative observation data.');
  }
  const chartDecisionClassNameSource = extractFunctionSource(appSource, 'chartDecisionClassName');
  const chartDecisionSource = extractFunctionSource(appSource, 'buildSimplifiedChartPipelineDecision');
  const renderReviewChartStatusLineSource = extractFunctionSource(appSource, 'renderReviewChartStatusLine');
  const chartPipelineAllowsAiGateSource = extractFunctionSource(appSource, 'chartPipelineAllowsAi');
  if(!chartPipelineAllowsAiGateSource.includes("'verified'")
    || !chartPipelineAllowsAiGateSource.includes("'analysis_running'")
    || !chartPipelineAllowsAiGateSource.includes("'analysis_complete'")){
    throw new Error('Simplified chart pipeline must define an explicit AI-allowed phase allowlist.');
  }
  if(!chartDecisionSource.includes("key:'chart_mismatch'")
    || !chartDecisionSource.includes("key:'cant_read'")
    || !chartDecisionSource.includes("key:'chart_context_mismatch'")
    || !chartDecisionSource.includes('Chart looks correct.')){
    throw new Error('Simplified chart decisions must cover match, mismatch, unreadable, and context-mismatch states directly.');
  }
  if(!renderReviewChartStatusLineSource.includes('buildSimplifiedChartPipelineDecision(item, safePipeline)')
    || !renderReviewChartStatusLineSource.includes("phase === 'possible_mismatch'")
    || !renderReviewChartStatusLineSource.includes('chartPipelineHasVerifiedIdentity(safePipeline)')){
    throw new Error('Review chart status line must render directly from the simplified pipeline decision layer.');
  }
  const statusLineSandbox = {
    normalizeChartPipelineForRender(record, pipeline){ return pipeline; },
    buildSimplifiedChartPipelineDecision(record, pipeline){
      return pipeline.__decision || {title:'Chart verification', summary:''};
    },
    chartPipelineHasVerifiedIdentity(pipeline){
      return pipeline && pipeline.__verified === true;
    },
    escapeHtml(value){
      return String(value || '').replace(/[&<>\"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[ch]));
    }
  };
  vm.createContext(statusLineSandbox);
  vm.runInContext(renderReviewChartStatusLineSource, statusLineSandbox, {filename:'app.js#renderReviewChartStatusLine'});
  const statusVerified = statusLineSandbox.renderReviewChartStatusLine({ticker:'CAT'}, {
    phase:'verified',
    __verified:true,
    __decision:{title:'Chart looks correct.', summary:'Ticker detected: CAT.'}
  });
  const statusMismatch = statusLineSandbox.renderReviewChartStatusLine({ticker:'CAT'}, {
    phase:'possible_mismatch',
    __verified:false,
    __decision:{title:'Wrong chart detected', summary:'Expected: CAT | Found: LIN'}
  });
  const statusPending = statusLineSandbox.renderReviewChartStatusLine({ticker:'CAT'}, {
    phase:'verifying',
    __verified:false,
    __decision:{title:'Chart uploaded - checking details', summary:'Quick chart verification is running.'}
  });
  if(!statusVerified.includes('Chart looks correct.') || !statusVerified.includes('Ticker detected: CAT.')){
    throw new Error('Verified Review chart status must render from the simplified pipeline decision.');
  }
  if(!statusMismatch.includes('Wrong chart detected') || !statusMismatch.includes('Expected: CAT | Found: LIN')){
    throw new Error('Mismatch Review chart status must render from the simplified pipeline decision.');
  }
  if(statusPending !== '<span class="warntext">Checking chart details...</span>'){
    throw new Error('Verifying Review chart status must stay on the simplified checking copy.');
  }
  const manualConfirmSource = extractFunctionSource(appSource, 'confirmReviewChartMatchesCurrentTicker');
  if(!manualConfirmSource.includes("phase:'verified'")
    || !manualConfirmSource.includes('manualConfirmed:true')
    || !manualConfirmSource.includes('[REVIEW_CHART_MANUAL_CONFIRM_PIPELINE]')
    || !manualConfirmSource.includes('runSimplifiedChartFullAnalysis(record, {')){
    throw new Error('Manual chart confirmation must promote the simplified pipeline first and then trigger a fresh AI analysis run.');
  }
  const handleChartSelectionSource = extractFunctionSource(appSource, 'handleChartSelection');
  if(!handleChartSelectionSource.includes("setActiveReviewTicker(symbol);")
    || !handleChartSelectionSource.includes("const matchingActiveRequest = activeRequest && normalizeTicker(activeRequest.ticker || '') === normalizeTicker(record.ticker || '')")
    || !handleChartSelectionSource.includes("renderReviewWorkspace({source:'chart_upload', requestedTicker:symbol || record.ticker});")
    || !handleChartSelectionSource.includes('record.review.chartAttachmentContext = {')
    || !handleChartSelectionSource.includes("console.info(previousImageId ? '[CHART_ATTACHMENT_REPLACED]' : '[CHART_ATTACHMENT_CREATED]'")){
    throw new Error('Second chart uploads must rebind Review ownership to the upload ticker and avoid inheriting another ticker request context.');
  }
  const lightboxSource = extractFunctionSource(appSource, 'openReviewChartLightbox');
  if(!lightboxSource.includes('const modalTicker = normalizeTicker(source.ticker || (attachmentContext && attachmentContext.expectedTicker) || item.ticker || \'\');')
    || !lightboxSource.includes('[CHART_MODAL_CONTEXT]')
    || !lightboxSource.includes('[CHART_UPLOAD_METADATA_MISMATCH]')
    || !lightboxSource.includes("ticker:modalTicker")){
    throw new Error('Chart lightbox must render attachment-bound ticker metadata and log mismatches.');
  }
  const displayedChartContextSource = extractFunctionSource(appSource, 'reviewDisplayedChartContext');
  const currentChartContextSource = extractFunctionSource(appSource, 'currentReviewChartContext');
  const sanitizeChartIdentitySource = extractFunctionSource(appSource, 'sanitizeChartAssessorVisibleIdentity');
  const explicitProvenanceVersionSource = extractFunctionSource(appSource, 'hasExplicitChartIdentityProvenanceVersion');
  const strictProvenanceVersionSource = extractFunctionSource(appSource, 'isStrictChartIdentityProvenanceAnalysis');
  if(!displayedChartContextSource.includes('imageId:String(previewRef && previewRef.imageId || chartImageIdForReview(safe) || \'\')')
    || !displayedChartContextSource.includes('filename:String(previewRef && previewRef.name || attachmentContext && attachmentContext.name || safe.chartRef && safe.chartRef.name || \'\')')){
    throw new Error('Displayed chart context must be derived from the same attachment object used by the renderer.');
  }
  if(!currentChartContextSource.includes('attachmentContext && attachmentContext.requestId')
    || !currentChartContextSource.includes('pipeline && pipeline.requestId')
    || !currentChartContextSource.includes("requestId = String(runtime.requestId || '');")){
    throw new Error('Current chart context must unify request ownership from attachment, pipeline, and runtime state.');
  }
  if(!sanitizeChartIdentitySource.includes('[CHART_ASSESSOR_VISIBLE_IDENTITY]')
    || !sanitizeChartIdentitySource.includes('[CHART_ASSESSOR_SANITIZER_MODE]')
    || !sanitizeChartIdentitySource.includes('[CHART_ASSESSOR_SANITIZED_OUTPUT]')
    || !sanitizeChartIdentitySource.includes('[CHART_ASSESSOR_VERSION_DOWNGRADE]')
    || !sanitizeChartIdentitySource.includes('[CHART_ASSESSOR_TRUSTED_CONTEXT]')
    || !sanitizeChartIdentitySource.includes('[CHART_ASSESSOR_FALLBACK_USED]')
    || !sanitizeChartIdentitySource.includes('[CHART_ASSESSOR_EXPECTED_VALUE_LEAK]')
    || !sanitizeChartIdentitySource.includes('[CHART_IDENTITY_EXTRACTION_UNREADABLE]')){
    throw new Error('Chart assessor identity sanitization must log visible identity, trusted context, fallback use, and unreadable cases.');
  }
  if(!extractFunctionSource(appSource, 'buildDeterministicChartVerification').includes('[CHART_IDENTITY_EVIDENCE_INSUFFICIENT]')
    || !extractFunctionSource(appSource, 'buildDeterministicChartVerification').includes('identityEvidenceInsufficient')){
    throw new Error('Deterministic chart verification must explicitly reject strict-sanitized blank identity as insufficient evidence.');
  }
  if(!explicitProvenanceVersionSource.includes('chartIdentityProvenanceVersion')
    || !strictProvenanceVersionSource.includes('>= 1')){
    throw new Error('Chart identity provenance strictness must depend on an explicit schema version, not implicit defaults.');
  }
  const beginReviewAiSource = extractFunctionSource(appSource, 'beginReviewAiAnalysis');
  const completeReviewAiSource = extractFunctionSource(appSource, 'completeReviewAiAnalysis');
  const failReviewAiSource = extractFunctionSource(appSource, 'failReviewAiAnalysis');
  if(!beginReviewAiSource.includes("runtime.source = String(options.source || '');")
    || !beginReviewAiSource.includes("runtime.chartImageId = String(options.chartImageId || '');")
    || !completeReviewAiSource.includes('runtime.lastCompletedRequestId = runtime.requestId;')
    || !failReviewAiSource.includes('runtime.lastCompletedRequestId = runtime.requestId;')){
    throw new Error('Review AI runtime must retain request source and image ownership metadata for duplicate-upload audits.');
  }
  const chartAiSummaryGuardSource = extractFunctionSource(appSource, 'chartAiSummaryRenderGuard');
  if(!chartAiSummaryGuardSource.includes("reason = 'quick_running'")
    || !chartAiSummaryGuardSource.includes("pipelinePhase === 'verifying'")){
    throw new Error('AI summary guard must block current rendering while simplified chart verification is still running for the same chart.');
  }
  const aiCommitGateSource = extractFunctionSource(appSource, 'canCommitAiSummaryForChart');
  if(!aiCommitGateSource.includes('return chartPipelineAllowsAi(phase);')
    || !aiCommitGateSource.includes('requestedImageId === pipelineImageId')
    || !aiCommitGateSource.includes('requestedRequestId === pipelineRequestId')){
    throw new Error('AI summary commit gate must require an AI-allowed simplified pipeline phase for the same ticker/image/request context.');
  }
  const pendingAiStageSource = extractFunctionSource(appSource, 'stagePendingAiSummaryForChart');
  if(!pendingAiStageSource.includes('setPendingChartAiSummary(item, stagedPayload);')
    || !pendingAiStageSource.includes('[AI_SUMMARY_COMMIT_BLOCKED_QUICK_RUNNING]')){
    throw new Error('Blocked AI summary commits must stage a pending payload instead of only logging.');
  }
  const flushPendingAiSource = extractFunctionSource(appSource, 'flushPendingAiSummaryForChart');
  if(!flushPendingAiSource.includes("reason:'pending_context_stale'")
    || !flushPendingAiSource.includes('canCommitAiSummaryForChart({')
    || !flushPendingAiSource.includes('applyCommittedAiSummaryForChart(item, pending)')
    || !flushPendingAiSource.includes('[AI_SUMMARY_PENDING_STATE]')
    || !flushPendingAiSource.includes('[AI_SUMMARY_FLUSH_ATTEMPT]')
    || !flushPendingAiSource.includes('[AI_SUMMARY_FLUSH_REJECTED]')
    || !flushPendingAiSource.includes('[AI_SUMMARY_FLUSH_COMMITTED]')){
    throw new Error('Pending AI summaries must flush only for the same chart context and reject stale uploads.');
  }
  const handleWorkspaceTabChangeSource = extractFunctionSource(appSource, 'handleWorkspaceTabChange');
  const reconcileVisibleReviewStateSource = extractFunctionSource(appSource, 'reconcileVisibleReviewState');
  const renderNeutralReviewPendingStateSource = extractFunctionSource(appSource, 'renderNeutralReviewPendingState');
  const refreshTrackOnlySource = extractFunctionSource(appSource, 'refreshTrackOnly');
  const chartPipelineAllowsAiSource = extractFunctionSource(appSource, 'chartPipelineAllowsAi');
  const confirmReviewChartMatchesCurrentTickerSource = extractFunctionSource(appSource, 'confirmReviewChartMatchesCurrentTicker');
  const analyseSetupGateSource = extractFunctionSource(appSource, 'analyseSetup');
  if(!refreshTrackOnlySource.includes('clearTrackPatchNoChangeFlags();')
    || !refreshTrackOnlySource.includes("console.info('[TrackPullRefresh]', {event:'riskRecalcSkipped', source, reason:'no_changed_inputs'});")
    || !refreshTrackOnlySource.includes('startupCoordinator.trackNeedsFullRender = false;')){
    throw new Error('No-change Track refreshes must clear stale dirty/full-render flags so Track refocus does not rerun unnecessarily.');
  }
  if(!chartPipelineAllowsAiGateSource.includes("['verified', 'analysis_running', 'analysis_complete']")){
    throw new Error('Simplified chart pipeline must define the AI-allowed phase list before AI setup analysis can start.');
  }
  if(!confirmReviewChartMatchesCurrentTickerSource.includes("phase:'verified'")
    || !confirmReviewChartMatchesCurrentTickerSource.includes('manualConfirmed:true')
    || !confirmReviewChartMatchesCurrentTickerSource.includes('runSimplifiedChartFullAnalysis(record, {')){
    throw new Error('Manual chart confirmation must promote the simplified pipeline and then start AI analysis explicitly.');
  }
  if(!analyseSetupGateSource.includes('ensureSimplifiedChartPipelineForRender(record, {source:\'analyse_setup_gate\'})')
    || !analyseSetupGateSource.includes('chartPipelineAllowsAi(gatePhase)')
    || !analyseSetupGateSource.includes('[CHART_AI_ANALYSIS_BLOCKED]')
    || !analyseSetupGateSource.includes('[CHART_AI_ANALYSIS_ALLOWED]')
    || !analyseSetupGateSource.includes('[CHART_ANALYSIS_REQUEST_FINALIZE_REASON]')
    || !appSource.includes('[CHART_REQUEST_ID_MUTATION]')
    || !analyseSetupGateSource.includes('beginReviewAiAnalysis(ticker, prompt, {'))
  {
    throw new Error('Analyse setup must gate chart AI from the simplified pipeline and emit explicit allow/block/finalize diagnostics for every started chart-analysis request.');
  }
  if(analyseSetupGateSource.includes('verificationOnly:true')
    || analyseSetupGateSource.includes('chartVerificationGateDecision(')
    || analyseSetupGateSource.includes('if(!verificationGate.allowed)')){
    throw new Error('Analyse setup must not retain the legacy verification-only gate branch once the simplified chart pipeline owns Review chart analysis.');
  }
  const reviewWorkspaceSource = extractFunctionSource(appSource, 'renderReviewWorkspace');
  if(!handleWorkspaceTabChangeSource.includes("nextTab === 'review'")
    || !handleWorkspaceTabChangeSource.includes("reconcileVisibleReviewState({")
    || !handleWorkspaceTabChangeSource.includes("source:'review_tab_activation'")){
    throw new Error('Review tab activation must reconcile visible Review DOM before deferred Review rendering runs.');
  }
  if(!reconcileVisibleReviewStateSource.includes('[REVIEW_VISIBLE_STATE_CHECK]')
    || !reconcileVisibleReviewStateSource.includes('[REVIEW_VISIBLE_STATE_VALID]')
    || !renderNeutralReviewPendingStateSource.includes('[REVIEW_STALE_DOM_CLEARED]')
    || !renderNeutralReviewPendingStateSource.includes('Preparing Review')
    || !renderNeutralReviewPendingStateSource.includes('Waiting for latest setup data')){
    throw new Error('Review visible-state reconciliation must clear stale Review DOM into a neutral pending state with diagnostics.');
  }
  if(!reviewWorkspaceSource.includes('[CHART_CONTEXT_SNAPSHOT]')
    || !reviewWorkspaceSource.includes('[CHART_CONTEXT_MISMATCH]')
    || !reviewWorkspaceSource.includes('buildChartContextMismatchPipeline(record, simplifiedChartPipeline || {}, renderContextSnapshot)')
    || !reviewWorkspaceSource.includes('renderContextSnapshot.displayedImageId !== renderContextSnapshot.verificationImageId')
    || !reviewWorkspaceSource.includes('box.dataset.renderedReviewTicker = normalizeTicker(record.ticker || \'\');')
    || !reviewWorkspaceSource.includes('box.dataset.renderedReviewRequestToken = String(currentRenderedReviewRequestToken() || \'\');')){
    throw new Error('Review render must snapshot displayed-vs-verification chart context and refuse verified rendering on image mismatch.');
  }
  const appAnalyseSetupSource = extractFunctionSource(appSource, 'analyseSetup');
  const chartAssessorInputSource = extractFunctionSource(appSource, 'buildChartAssessorInput');
  const chartAssessorToNormalizedSource = extractFunctionSource(appSource, 'chartAssessorInputToNormalizedAnalysis');
  const getReviewAnalysisStateSource = extractFunctionSource(appSource, 'getReviewAnalysisState');
  const successfulSameContextSource = extractFunctionSource(appSource, 'hasSuccessfulCompletedAnalysisForCurrentChartContext');
  const queueAutoAnalysisSource = extractFunctionSource(appSource, 'queueAutoAnalysisForTicker');
  const aiSummaryGuardSource = extractFunctionSource(appSource, 'chartAiSummaryRenderGuard');
  const stagePendingChartAiSummarySource = extractFunctionSource(appSource, 'stagePendingAiSummaryForChart');
  if(appAnalyseSetupSource.indexOf('[AI_SUMMARY_READY]') === -1
    || !appAnalyseSetupSource.includes("const analysisSource = String(options.source || 'unknown');")
    || !appAnalyseSetupSource.includes('[CHART_ANALYSIS_REQUEST_START]')
    || !appAnalyseSetupSource.includes('[CHART_ANALYSIS_REQUEST_SKIPPED_DUPLICATE_IMAGE]')
    || !appAnalyseSetupSource.includes('[CHART_CONTEXT_AT_VERIFICATION_START]')
    || !appAnalyseSetupSource.includes('pipelineAlreadyResolvedForCurrentContext && analysisAlreadyCommittedForCurrentContext')
    || !appAnalyseSetupSource.includes("stagePendingAiSummaryForChart(record, aiSummaryCommitPayload, 'quick_running')")
    || !appAnalyseSetupSource.includes("aiSummaryCommitResult = {committed:false, reason:'pipeline_blocked'};")
    || !appAnalyseSetupSource.includes('[AI_SUMMARY_SKIPPED_PIPELINE_BLOCKED]')
    || !appAnalyseSetupSource.includes("applyCommittedAiSummaryForChart(record, aiSummaryCommitPayload)")
    || !appAnalyseSetupSource.includes("flushPendingAiSummaryForChart(record, {source:'analyse_setup_failed'})")){
    throw new Error('AI summary commit must remain sequenced after the simplified pipeline gate in the analysis path.');
  }
  if(!appAnalyseSetupSource.includes("requestId:analysisRequestId,")
    || !appAnalyseSetupSource.includes('sanitizeChartAssessorVisibleIdentity(')
    || !appAnalyseSetupSource.includes('buildSimplifiedTickerGateAnalysis(')
    || !appAnalyseSetupSource.includes('buildChartAssessorInput(record, simplifiedGateAnalysis, requestChartImageSource, analysisRequestId)')
    || !appAnalyseSetupSource.includes('const shouldPromoteSimplifiedPipeline = !!(')
    || !appAnalyseSetupSource.includes('upsertReviewChartAnalysisPipeline(record, promotedPipeline);')){
    throw new Error('Live chart analysis must preserve request-aware chart assessor inputs for the simplified pipeline path.');
  }
  if(!appAnalyseSetupSource.includes('!isStrictChartIdentityProvenanceAnalysis(normalizedLiveAnalysis)')
    || !appAnalyseSetupSource.includes('normalizedLiveAnalysis.chartIdentityProvenanceVersion = 1')){
    throw new Error('Live analyseSetup results must upgrade any non-strict analysis into strict provenance mode before sanitization.');
  }
  if(!appAnalyseSetupSource.includes('[CHART_ANALYSIS_REQUEST_FINALIZE_REASON]')
    || !queueAutoAnalysisSource.includes("ensureSimplifiedChartPipelineForRender(liveRecord, {source:'queue_auto_analysis'})")
    || !queueAutoAnalysisSource.includes('chartPipelineAllowsAi(pipelinePhase)')){
    throw new Error('Analysis request finalization and auto-analysis dispatch must both use the simplified chart pipeline.');
  }
  if(!appAnalyseSetupSource.includes("{caller:'analyse_setup_live'}")){
    throw new Error('Chart assessor sanitization must log its live caller source.');
  }
  if(!sanitizeChartIdentitySource.includes('liveCurrentContext')
    || !sanitizeChartIdentitySource.includes('safeAnalysis.chartIdentityProvenanceVersion = 1')){
    throw new Error('Current live chart context must force strict provenance if a rebuilt analysis downgrades version unexpectedly.');
  }
  if(!chartAssessorInputSource.includes('chartIdentityProvenanceVersion')
    || !chartAssessorInputSource.includes('visibleTickerSource')
    || !chartAssessorInputSource.includes('visibleTimeframeSource')
    || !chartAssessorInputSource.includes('visiblePriceSource')
    || !chartAssessorInputSource.includes('chartRegionConfirmation')
    || !chartAssessorInputSource.includes('chartRegionConfirmationSource')){
    throw new Error('Chart assessor input must preserve sanitized provenance context for downstream deterministic verification.');
  }
  if(!chartAssessorToNormalizedSource.includes('chartIdentityProvenanceVersion')
    || !chartAssessorToNormalizedSource.includes('visible_ticker_source')
    || !chartAssessorToNormalizedSource.includes('visible_timeframe_source')
    || !chartAssessorToNormalizedSource.includes('visible_price_source')
    || !chartAssessorToNormalizedSource.includes('chart_region_confirmation')
    || !chartAssessorToNormalizedSource.includes('chart_region_confirmation_source')){
    throw new Error('Chart assessor normalized replay must preserve provenance fields rather than dropping them.');
  }
  if(!chartAssessorToNormalizedSource.includes('[CHART_ASSESSOR_REHYDRATED_FROM_TRUSTED_CONTEXT]')){
    throw new Error('Any downstream trusted-context rehydration must be explicitly logged.');
  }
  if(!appAnalyseSetupSource.includes('normalizeAnalysisResult(data.analysis, previousTickerState)')
    || !appAnalyseSetupSource.includes('sanitizeChartAssessorVisibleIdentity(')
    || !extractFunctionSource(appSource, 'normalizeAnalysisResult').includes('chartIdentityProvenanceVersion')
    || !extractFunctionSource(appSource, 'normalizeAnalysisResult').includes('visible_ticker_source')
    || !extractFunctionSource(appSource, 'normalizeAnalysisResult').includes('chart_region_confirmation_source')){
    throw new Error('Live analysis normalization must preserve chart identity provenance before sanitization.');
  }
  const normalizeAnalysisResultSource = extractFunctionSource(appSource, 'normalizeAnalysisResult');
  const normalizeAnalysisResponseSource = extractFunctionSource(appSource, 'normalizeAnalysisResponse');
  if(normalizeAnalysisResponseSource.includes(": 1,") && normalizeAnalysisResponseSource.includes('chartIdentityProvenanceVersion')){
    throw new Error('Chart identity provenance version must not default to strict mode when absent.');
  }
  if(normalizeAnalysisResultSource.includes(": 1,") && normalizeAnalysisResultSource.includes('chartIdentityProvenanceVersion')){
    throw new Error('Normalized analysis results must preserve absent chart provenance version instead of forcing strict mode.');
  }
  if(!aiCommitGateSource.includes('const pipeline = getReviewChartAnalysisPipeline(item);')
    || !appAnalyseSetupSource.includes('const activeChartPipeline = getReviewChartAnalysisPipeline(record);')
    || !flushPendingAiSource.includes('const currentPipeline = getReviewChartAnalysisPipeline(item) || {};')
    || !flushPendingAiSource.includes('const currentChartContext = currentReviewChartContext(item, item.review || {});')
    || !flushPendingAiSource.includes('const currentRequestId = String(currentChartContext.requestId || \'\');')){
    throw new Error('Sensitive AI-summary and analyseSetup request-context reads must use the simplified pipeline and current chart context instead of raw persisted quick state.');
  }
  const renderReviewWorkspaceSource = extractFunctionSource(appSource, 'renderReviewWorkspace');
  const simplifiedDecisionSource = extractFunctionSource(appSource, 'buildSimplifiedChartPipelineDecision');
  const simplifiedRunSource = extractFunctionSource(appSource, 'runSimplifiedChartAnalysis');
  const ensurePipelineSource = extractFunctionSource(appSource, 'ensureSimplifiedChartPipelineForRender');
  if(!renderReviewWorkspaceSource.includes("renderSource:'simplified_pipeline'")
    || !renderReviewWorkspaceSource.includes('renderSimplifiedChartPipelineMarkup(record, simplifiedChartPipeline || {})')
    || !renderReviewWorkspaceSource.includes('renderReviewChartStatusLine(record, simplifiedChartPipeline)')){
    throw new Error('Review chart rendering must be owned by the simplified pipeline only.');
  }
  if(!renderReviewWorkspaceSource.includes("const renderedDecisionSummary = String(decisionSummary || snapshotVerdictLine || '').trim();")
    || !renderReviewWorkspaceSource.includes('<div class="review-decision-primary decision-summary">${escapeHtml(renderedDecisionSummary)}</div>')){
    throw new Error('Review render must display canonical decisionSummary and fall back to snapshotVerdictLine only when canonical summary is unavailable.');
  }
  if(!simplifiedDecisionSource.includes("key:'chart_mismatch'")
    || !simplifiedDecisionSource.includes("key:'cant_read'")
    || !simplifiedDecisionSource.includes("key:'chart_context_mismatch'")
    || !simplifiedDecisionSource.includes('Chart looks correct.')){
    throw new Error('Simplified Review chart verification must render first-class matched, mismatch, unreadable, and context-mismatch decisions.');
  }
  if(!simplifiedRunSource.includes('buildSimplifiedTickerGateAnalysis(')
    || !simplifiedRunSource.includes('[CHART_PIPELINE_MISMATCH_GATE_OVERRIDE]')
    || !simplifiedRunSource.includes("normalizedVisibleTicker !== expectedVisibleTicker")
    || !(simplifiedRunSource.includes('upsertReviewChartAnalysisPipeline(verifiedRecord, nextPipeline);')
      || simplifiedRunSource.includes('upsertReviewChartAnalysisPipeline(currentRecord, nextPipeline);')
      || simplifiedRunSource.includes('upsertReviewChartAnalysisPipeline(item, nextPipeline);'))
    || !simplifiedRunSource.includes("if(nextPipeline.phase === 'verified')")){
    throw new Error('Simplified chart verification must commit terminal match and mismatch results directly from the simplified quick path.');
  }
  if(!ensurePipelineSource.includes('[REVIEW_CHART_PIPELINE_STALE_REQUEST_IGNORED]')
    || !ensurePipelineSource.includes("phase:mismatch ? 'possible_mismatch' : (verifiedMatch ? 'verified' : 'cant_read')")){
    throw new Error('Simplified Review pipeline recovery must be request-aware and rebuild current verified/mismatch/unreadable state directly.');
  }
  if(!appAnalyseSetupSource.includes('[CHART_ANALYSIS_DUPLICATE_RUNNING_BYPASSED_FOR_REPLACEMENT]')
    || !appAnalyseSetupSource.includes('[CHART_REPLACEMENT_ANALYSIS_SUPERSEDES_RUNNING]')
    || !appAnalyseSetupSource.includes('[CHART_ANALYSIS_DUPLICATE_RUNNING_IGNORED]')
    || !appAnalyseSetupSource.includes("const replacementUploadSupersedesRunning = analysisSource === 'chart_upload'")
    || !appAnalyseSetupSource.includes("clearReviewAiAnalysis(ticker);")){
    throw new Error('Replacement chart uploads must supersede same-ticker running analysis, while ordinary duplicate clicks stay ignored.');
  }
  if(!stagePendingChartAiSummarySource.includes('[AI_SUMMARY_COMMIT_BLOCKED_QUICK_RUNNING]')){
    throw new Error('Quick-running AI summary wait logs must be deduplicated per chart context.');
  }
  if(!getReviewAnalysisStateSource.includes("analysisStatus = String(")
    || !getReviewAnalysisStateSource.includes("? 'failed'")
    || !getReviewAnalysisStateSource.includes("? 'committed'")
    || !getReviewAnalysisStateSource.includes(": (rawAnalysis ? 'raw_only' : 'idle')")){
    throw new Error('Review analysis state must distinguish committed analysis from failed and raw-only payloads.');
  }
  if(!successfulSameContextSource.includes('state.analysisStatus === \'committed\'')
    || !successfulSameContextSource.includes('String(state.analysisRequestId || \'\') === requestedRequestId')
    || !successfulSameContextSource.includes('normalizeTicker(state.ticker || item.ticker || \'\') === requestedTicker')
    || !successfulSameContextSource.includes('!pending')){
    throw new Error('Same-image dedupe must require full committed chart context, including request id.');
  }
  if(!appSource.includes("runSimplifiedChartAnalysis(record, {")
    || !appSource.includes("runSimplifiedChartFullAnalysis(record, {")
    || !appSource.includes("analyseSetup(record.ticker, {source:'manual_button'});")){
    throw new Error('Review chart upload/manual-confirm flows must go through the simplified chart pipeline, while manual Analyse remains an explicit AI action.');
  }
  const aiGateSandbox = {
    normalizeTicker(value){ return String(value || '').trim().toUpperCase(); },
    chartPipelineAllowsAi(phase = ''){
      return ['verified', 'analysis_running', 'analysis_complete'].includes(String(phase || '').trim());
    },
    getReviewChartAnalysisPipeline(record = {}){
      return record && record.review && record.review.chartAnalysisPipeline && typeof record.review.chartAnalysisPipeline === 'object'
        ? record.review.chartAnalysisPipeline
        : null;
    }
  };
  vm.createContext(aiGateSandbox);
  vm.runInContext(aiCommitGateSource, aiGateSandbox, {filename:'app.js#canCommitAiSummaryForChart'});
  const gateBlocked = aiGateSandbox.canCommitAiSummaryForChart({
    record:{
      ticker:'NVDA',
      review:{
        chartAnalysisPipeline:{
          ticker:'NVDA',
          imageId:'img-1',
          requestId:'req-1',
          phase:'verifying'
        }
      }
    },
    ticker:'NVDA',
    imageId:'img-1',
    requestId:'req-1'
  });
  const gateAllowed = aiGateSandbox.canCommitAiSummaryForChart({
    record:{
      ticker:'NVDA',
      review:{
        chartAnalysisPipeline:{
          ticker:'NVDA',
          imageId:'img-1',
          requestId:'req-1',
          phase:'verified'
        }
      }
    },
    ticker:'NVDA',
    imageId:'img-1',
    requestId:'req-1'
  });
  const gateRejectedStale = aiGateSandbox.canCommitAiSummaryForChart({
    record:{
      ticker:'LIN',
      review:{
        chartAnalysisPipeline:{
          ticker:'LIN',
          imageId:'img-2',
          requestId:'req-2',
          phase:'verified'
        }
      }
    },
    ticker:'NVDA',
    imageId:'img-1',
    requestId:'req-1'
  });
  if(gateBlocked !== false || gateAllowed !== true || gateRejectedStale !== false){
    throw new Error('AI summary commit gate must block running quick analyses and stale chart contexts.');
  }
  const sameImageDedupeSandbox = {
    getReviewAnalysisState(record){ return record.__analysisState; },
    getPendingChartAiSummary(record){ return record.__pending || null; },
    normalizeTicker(value){ return String(value || '').trim().toUpperCase(); }
  };
  vm.createContext(sameImageDedupeSandbox);
  vm.runInContext(successfulSameContextSource, sameImageDedupeSandbox, {filename:'app.js#hasSuccessfulCompletedAnalysisForCurrentChartContext'});
  const dedupeSuccess = sameImageDedupeSandbox.hasSuccessfulCompletedAnalysisForCurrentChartContext({
    __analysisState:{
      normalizedAnalysis:{ verdict:'Watch' },
      analysisStatus:'committed',
      ticker:'NVDA',
      analysisChartImageId:'img-1',
      chartImageId:'img-1',
      analysisRequestId:'req-1',
      error:''
    }
  }, {ticker:'NVDA', imageId:'img-1', requestId:'req-1'});
  const dedupeFailed = sameImageDedupeSandbox.hasSuccessfulCompletedAnalysisForCurrentChartContext({
    __analysisState:{
      normalizedAnalysis:null,
      analysisStatus:'failed',
      ticker:'NVDA',
      analysisChartImageId:'img-1',
      chartImageId:'img-1',
      analysisRequestId:'req-1',
      error:'AI failed'
    }
  }, {ticker:'NVDA', imageId:'img-1', requestId:'req-1'});
  const dedupeRawOnly = sameImageDedupeSandbox.hasSuccessfulCompletedAnalysisForCurrentChartContext({
    __analysisState:{
      normalizedAnalysis:null,
      analysisStatus:'raw_only',
      ticker:'NVDA',
      analysisChartImageId:'img-1',
      chartImageId:'img-1',
      analysisRequestId:'req-1',
      error:''
    }
  }, {ticker:'NVDA', imageId:'img-1', requestId:'req-1'});
  const dedupePending = sameImageDedupeSandbox.hasSuccessfulCompletedAnalysisForCurrentChartContext({
    __analysisState:{
      normalizedAnalysis:{ verdict:'Watch' },
      analysisStatus:'committed',
      ticker:'NVDA',
      analysisChartImageId:'img-1',
      chartImageId:'img-1',
      analysisRequestId:'req-1',
      error:''
    },
    __pending:{ ticker:'NVDA', imageId:'img-1', requestId:'req-1' }
  }, {ticker:'NVDA', imageId:'img-1', requestId:'req-1'});
  const dedupeRequestMismatch = sameImageDedupeSandbox.hasSuccessfulCompletedAnalysisForCurrentChartContext({
    __analysisState:{
      normalizedAnalysis:{ verdict:'Watch' },
      analysisStatus:'committed',
      ticker:'NVDA',
      analysisChartImageId:'img-1',
      chartImageId:'img-1',
      analysisRequestId:'req-A',
      error:''
    }
  }, {ticker:'NVDA', imageId:'img-1', requestId:'req-B'});
  if(dedupeSuccess !== true || dedupeFailed !== false || dedupeRawOnly !== false || dedupePending !== false || dedupeRequestMismatch !== false){
    throw new Error('Same-image dedupe must only suppress matching committed analysis context, not failed, raw-only, pending, or request-mismatched states.');
  }
  const chartFastPassSource = extractFunctionSource(appSource, 'buildChartVerificationFastPass');
  const chartSandbox = {
    normaliseVisibleTicker(value){ return String(value || '').trim().toUpperCase(); },
    chartVerificationNumberOrNull(value){
      if(value === null || value === undefined || value === '') return null;
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    },
    chartVerificationNumericLabels(){ return []; },
    isDailyTimeframe(value){ return String(value || '').trim().toUpperCase() === '1D'; },
    chartImageIdForReview(review){
      const item = review && typeof review === 'object' ? review : {};
      return String((item.chartRef && item.chartRef.imageId) || (item.chartImageOriginal && item.chartImageOriginal.imageId) || (item.chartImagePreview && item.chartImagePreview.imageId) || '');
    },
    chartVerificationDisplayValue(value){
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric.toFixed(2) : 'n/a';
    },
    escapeHtml(value){ return String(value || '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); },
    debugFlagEnabled(){ return false; },
    uiState:{ reviewRenderPass:1 }
  };
  vm.createContext(chartSandbox);
  vm.runInContext(chartDecisionClassNameSource, chartSandbox, {filename:'app.js#chartDecisionClassName'});
  vm.runInContext(chartFastPassSource, chartSandbox, {filename:'app.js#buildChartVerificationFastPass'});
  const mirroredFastPass = chartSandbox.buildChartVerificationFastPass({
    ticker:'DINO',
    marketData:{price:70.30}
  }, {
    visible_ticker:'DINO',
    visible_timeframe:'1D',
    visible_latest_price:70.30
  }, {
    imageId:'img-1',
    originalAvailable:true
  });
  if(mirroredFastPass.status !== 'uncertain_missing_context' || mirroredFastPass.independentImageEvidence !== false || mirroredFastPass.contextMirroringSuspected !== true){
    throw new Error('Header-only mirrored reads without image-derived evidence must remain uncertain, not clear match candidates.');
  }
  const headerOnlyFastPass = chartSandbox.buildChartVerificationFastPass({
    ticker:'MRNA',
    marketData:{price:26.80}
  }, {
    visible_ticker:'MRNA',
    visible_timeframe:'1D',
    visible_latest_price:26.80,
    chart_match_status:'match'
  }, {
    imageId:'img-header-only',
    originalAvailable:true
  });
  if(headerOnlyFastPass.status !== 'uncertain_missing_context' || headerOnlyFastPass.independentImageEvidence !== false || headerOnlyFastPass.chartNativeEvidencePresent !== false){
    throw new Error('Header-only OCR matches without visible-identity provenance must remain uncertain.');
  }
  const mismatchFastPass = chartSandbox.buildChartVerificationFastPass({
    ticker:'DINO',
    marketData:{price:70.30}
  }, {
    visible_ticker:'ETR',
    visible_timeframe:'1D',
    visible_latest_price:88.12
  }, {
    imageId:'img-2',
    originalAvailable:true
  });
  if(mismatchFastPass.status !== 'ticker_mismatch' || !mismatchFastPass.evidence.some(item => /mismatch/i.test(item) || /ticker/i.test(item))){
    throw new Error('Visible ticker mismatches must return a hard chart mismatch with evidence.');
  }
  const priceMismatchFastPass = chartSandbox.buildChartVerificationFastPass({
    ticker:'DINO',
    marketData:{price:70.30}
  }, {
    visible_timeframe:'1D',
    visible_latest_price:95.00
  }, {
    imageId:'img-3',
    originalAvailable:true
  });
  if(priceMismatchFastPass.status !== 'strong_mismatch' || !priceMismatchFastPass.evidence.some(item => /Price delta/i.test(item))){
    throw new Error('Missing ticker plus far-off price must still produce a strong mismatch with evidence.');
  }
  const nativeEvidenceFastPass = chartSandbox.buildChartVerificationFastPass({
    ticker:'DINO',
    marketData:{price:70.30}
  }, {
    visible_ticker:'DINO',
    visible_timeframe:'1D',
    visible_latest_price:70.30,
    visible_ma20:67.43,
    ma20_visible:true
  }, {
    imageId:'img-native-ok',
    originalAvailable:true
  });
  if(nativeEvidenceFastPass.status !== 'clear_match_candidate' || nativeEvidenceFastPass.independentImageEvidence !== true || nativeEvidenceFastPass.chartNativeEvidencePresent !== true){
    throw new Error('Correct chart matches should only become clear candidates once chart-native evidence exists.');
  }
  const normalizeSandbox = {
    cloneData(value, fallback){
      if(value === undefined || value === null) return fallback;
      return JSON.parse(JSON.stringify(value));
    },
    repairChartGuruStoredText(value = ''){
      return String(value || '').trim();
    },
    normalizeChartGuruSectionKey(value = ''){
      return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    },
    chartGuruSectionDisplayForKey(key = '', fallback = {}){
      return {
        icon:String(fallback.icon || '').trim(),
        label:String(fallback.label || '').trim()
      };
    },
    repairCanonicalNarrationContractPhase(contract){
      return contract;
    }
  };
  vm.createContext(normalizeSandbox);
  vm.runInContext(normalizeSource, normalizeSandbox, {filename:'app.js#normalizeAnalysisResponse'});
  const normalized = normalizeSandbox.normalizeAnalysisResponse({
    coach_summary:'Constructive, but not ready.',
    verdict:'Watch',
    aiObservation:{
      rawOpinion:{
        verdict:'Entry',
        final_verdict:'Entry',
        entry:'101',
        stop:'95',
        first_target:'120'
      }
    }
  });
  if(!normalized || normalized.aiObservation.rawOpinion.verdict !== 'Entry' || normalized.entry || normalized.first_target || normalized.final_verdict){
    throw new Error('Frontend AI normalization must preserve supplied rawOpinion while keeping canonical plan/verdict fields blank.');
  }
  const effectivePlanSource = extractFunctionSource(appSource, 'effectivePlanForRecord');
  if(/analysis\.plan_metrics_valid|source:'ai'/.test(effectivePlanSource)){
    throw new Error('Effective plan must not source canonical plan levels from AI observation output.');
  }
  const mergeLegacySource = extractFunctionSource(appSource, 'mergeLegacyCardIntoRecord');
  if(/source:'analysis'/.test(mergeLegacySource) || !/rawPlanOpinion|nonAuthoritative/.test(mergeLegacySource)){
    throw new Error('Legacy card merge must quarantine lastAnalysis plan levels instead of writing canonical record.plan.');
  }
  if(!/source:'scanner_estimate'/.test(mergeLegacySource) || !/currentPlanSource === 'scanner_estimate'/.test(mergeLegacySource)){
    throw new Error('Legacy card merge must persist scanner estimates only as refreshable non-authoritative scanner_estimate plans.');
  }
  const applyGlobalVerdictGatesSource = extractFunctionSource(appSource, 'applyGlobalVerdictGates');
  if(!/preserveScannerEstimatePlan/.test(applyGlobalVerdictGatesSource) || !/planSource === 'scanner_estimate'/.test(applyGlobalVerdictGatesSource)){
    throw new Error('Global verdict gates must preserve concrete scanner_estimate plan inputs for later resolver passes.');
  }
  const analysisVerdictSource = extractFunctionSource(appSource, 'analysisVerdictForRecord');
  if(/normalizedAnalysis|aiVerdict|final_verdict \|\| normalizedAnalysis\.verdict/.test(analysisVerdictSource)){
    throw new Error('AI verdict fields must not participate in canonical/display verdict selection.');
  }
  const evidenceSandbox = {
    uiState:{},
    normalizeTicker(value){
      return String(value || '').trim().toUpperCase();
    },
    numericOrNull(value){
      if(value === null || value === undefined) return null;
      if(typeof value === 'string' && value.trim() === '') return null;
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    },
    evaluateRewardRisk(entry, stop, target){
      const numericEntry = Number(entry);
      const numericStop = Number(stop);
      const numericTarget = Number(target);
      const risk = numericEntry - numericStop;
      const reward = numericTarget - numericEntry;
      const rrRatio = risk > 0 ? reward / risk : null;
      return {valid:Number.isFinite(rrRatio) && rrRatio > 0, rrRatio};
    },
    deriveCurrentPlanState(entry, stop, target){
      const numericEntry = Number(entry);
      const numericStop = Number(stop);
      const numericTarget = Number(target);
      const risk = numericEntry - numericStop;
      const reward = numericTarget - numericEntry;
      const valid = Number.isFinite(risk) && Number.isFinite(reward) && risk > 0 && reward > 0;
      return {status:valid ? 'valid' : 'invalid', riskFit:{risk_status:valid ? 'fits_risk' : 'invalid_plan'}};
    },
    hasAuthoritativeStopBreach(){
      return false;
    },
    escapeHtml(value){
      return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
    }
  };
  vm.createContext(evidenceSandbox);
  vm.runInContext(extractRegistryAccessorSource(appSource), evidenceSandbox, {filename:'app.js#scannerProjectionFieldRegistry'});
  [
    'resolvePullbackInterpretation',
    'projectionValue',
    'scannerProjectionFieldRegistry',
    'scannerProjectionValues',
    'hasUsableAnalysisProjection',
    'scannerProjectionPresentFields',
    'scannerProjectionTrustedFields',
    'hasAiObservationEvidenceHints',
    'resolveDerivedStateSource',
    'aiObservationEvidenceStates',
    'hasMathematicallyPriceablePlan',
    'currentScannerEstimateHardBlockers',
    'resolveAlivePullbackReboundGuard',
    'chartConsistencyArray',
    'chartVerificationNumberOrNull',
    'normaliseVisibleTicker',
    'normaliseVisibleTimeframe',
    'isDailyTimeframe',
    'simpleStableHash',
    'chartImageIdForReview',
    'logChartVerificationLifecycle',
    'logChartVerificationFastPass',
    'chartVerificationExchangeTimeZone',
    'chartVerificationMarketOpenNow',
    'chartVerificationToleranceConfig',
    'chartVerificationToleranceDetail',
    'valueWithinTolerance',
    'chartIndicatorVerificationStatus',
    'chartVerificationDisplayValue',
    'chartVerificationNumericLabels',
    'chartVerificationProximityMatches',
    'chartVerificationPriceMismatchSeverity',
    'buildChartVerificationFastPass',
    'buildPreAiChartVerificationTrace',
    'hasExplicitChartIdentityProvenanceVersion',
    'isStrictChartIdentityProvenanceAnalysis',
    'sanitizeChartAssessorVisibleIdentity',
    'buildChartAssessorInput',
    'currentReviewChartContext',
    'chartAssessorInputToNormalizedAnalysis',
    'chartImageDimensionsFromRef',
    'chartImageDimensionsLabel',
    'buildChartImageSourceTrace',
    'logChartRequestIdMutation',
    'hasVerifiableReviewChartSource',
    'getReviewChartAnalysisPipeline',
    'chartPipelineAllowsAi',
    'chartImageForAnalysis',
    'clearReviewChartImageSources',
    'queueAutoAnalysisForTicker',
    'confirmReviewChartMatchesCurrentTicker',
    'rejectReviewChartAndUploadAnother',
    'debugFlagEnabled',
    'chartDecisionClassName',
    'renderReviewChartStatusLine',
    'ensureReviewChartLightboxShell',
    'closeReviewChartLightbox',
    'openReviewChartLightbox',
    'clearStartupReviewSessionState',
    'buildDeterministicChartVerification',
    'chartAiSummaryRenderGuard',
    'renderSuppressedAiAnalysisPanel',
    'analysisDerivedStatesFromRecord'
  ].forEach(functionName => {
    vm.runInContext(extractFunctionSource(appSource, functionName), evidenceSandbox, {filename:`app.js#${functionName}`});
  });
  evidenceSandbox.getReviewAiRuntime = function getReviewAiRuntime(){
    if(!evidenceSandbox.uiState.reviewAiRuntime || typeof evidenceSandbox.uiState.reviewAiRuntime !== 'object'){
      evidenceSandbox.uiState.reviewAiRuntime = {};
    }
    return evidenceSandbox.uiState.reviewAiRuntime;
  };
  evidenceSandbox.normalizeTickerRecord = function normalizeTickerRecord(record){
    return record && typeof record === 'object' ? record : {};
  };
  const directDerived = evidenceSandbox.analysisDerivedStatesFromRecord({
    review:{
      normalizedAnalysis:{
        ai_observation_only:true,
        coach_summary:'Strong trend, but price is extended and too volatile to price reliably.',
        constructive_evidence:['Strong uptrend remains intact.'],
        risk_evidence:['No clean pullback base and no reliable stop yet.'],
        bounce_evidence:'Rebound attempt, not confirmed.',
        priceability_evidence:'Too volatile to price reliably.'
      }
    }
  });
  if(directDerived.derivedStateSource !== 'ai_observation_hints' || directDerived.aiObservationEvidenceApplied !== true || directDerived.structureState !== 'unknown' || directDerived.pullbackZone !== 'none' || directDerived.setupLocationState !== 'none' || directDerived.priceabilityState !== '' || directDerived.aiEvidenceStructureHint !== 'mixed' || directDerived.aiEvidenceLocationHint !== 'extended' || directDerived.aiEvidencePriceabilityHint !== 'unpriceable' || directDerived.aiEvidenceBounceHint !== 'attempt_observed'){
    throw new Error('Direct chart-analysis records without scanner projection must expose non-authoritative ai_observation_evidence hints.');
  }
  const directEvidence = evidenceSandbox.aiObservationEvidenceStates({
    ai_observation_only:true,
    coach_summary:'Strong trend, but price is extended and too volatile to price reliably.'
  });
  if(Object.keys(directEvidence).some(key => /(?:^|_)(structure|trend|bounce|volume|priceability|stabilisation|setup_location)_state$/.test(key))){
    throw new Error('AI observation evidence must not expose canonical-looking *_state fields.');
  }
  const aiBrokenDerived = evidenceSandbox.analysisDerivedStatesFromRecord({
    review:{
      normalizedAnalysis:{
        ai_observation_only:true,
        coach_summary:'The trend looks broken and damaged, with failed structure.',
        risk_evidence:['Trend broken. Structure failed.']
      }
    }
  });
  if(aiBrokenDerived.structureState !== 'unknown' || aiBrokenDerived.aiEvidenceStructureHint !== 'damaged_context'){
    throw new Error('AI observation evidence must not emit hard broken/weakening/intact/strong structureState.');
  }
  const metadataOnlyDerived = evidenceSandbox.analysisDerivedStatesFromRecord({
    scan:{analysisProjection:{scan_type:'20MA', setup_type_reason:'metadata only'}},
    review:{
      normalizedAnalysis:{
        ai_observation_only:true,
        coach_summary:'Trend broken and damaged, but this is AI observation only.'
      }
    }
  });
  if(metadataOnlyDerived.derivedStateSource !== 'ai_observation_hints' || metadataOnlyDerived.structureState !== 'unknown' || metadataOnlyDerived.aiEvidenceStructureHint !== 'damaged_context'){
    throw new Error('Metadata-only scanner projection must not suppress neutral AI evidence fallback.');
  }
  const camelCaseProjected = evidenceSandbox.analysisDerivedStatesFromRecord({
    scan:{analysisProjection:{structureState:'broken', bounceState:'none', pullbackZone:'near_50ma', stabilisationState:'none'}},
    review:{
      normalizedAnalysis:{
        ai_observation_only:true,
        coach_summary:'AI says constructive recovery, but scanner projection owns state.'
      }
    }
  });
  if(camelCaseProjected.derivedStateSource !== 'scanner_projection+ai_observation_hints' || camelCaseProjected.structureState !== 'broken' || camelCaseProjected.bounceState !== 'none' || camelCaseProjected.pullbackZone !== 'near_50ma' || camelCaseProjected.aiObservationEvidenceApplied !== true || !camelCaseProjected.scannerProjectionTrustedFieldsApplied.includes('structureState')){
    throw new Error('CamelCase scanner projection fields must be detected and consumed consistently.');
  }
  const projectedDerived = evidenceSandbox.analysisDerivedStatesFromRecord({
    scan:{analysisProjection:{structure_state:'weak', bounce_state:'none', priceability_state:'unpriceable'}},
    review:{
      normalizedAnalysis:{
        ai_observation_only:true,
        coach_summary:'Strong trend with confirmed bounce.',
        priceability_evidence:'Looks priceable.'
      }
    }
  });
  if(projectedDerived.derivedStateSource !== 'scanner_projection+ai_observation_hints' || projectedDerived.aiObservationEvidenceApplied !== true || projectedDerived.structureState !== 'weak' || projectedDerived.bounceState !== 'none' || projectedDerived.priceabilityState !== 'unpriceable' || !projectedDerived.scannerProjectionTrustedFieldsApplied.includes('bounceState') || projectedDerived.aiEvidenceBounceHint !== 'confirmed_observed'){
    throw new Error('Scanner projection must win over AI observation evidence hints.');
  }
  const ftiAlivePullbackDerived = evidenceSandbox.analysisDerivedStatesFromRecord({
    marketData:{price:73.19, ma20:75.4, ma50:71.6, ma200:52, previousClose:71.15, changePercent:2.87},
    scan:{analysisProjection:{
      trend_state:'strong',
      structure_state:'weak',
      pullback_zone:'near_50ma',
      stabilisation_state:'early',
      bounce_state:'none',
      priceability_state:'unpriceable'
    }}
  });
  if(ftiAlivePullbackDerived.structureState === 'weak' || ftiAlivePullbackDerived.structureState === 'weakening' || ftiAlivePullbackDerived.bounceState === 'none' || ftiAlivePullbackDerived.alivePullbackReboundGuardApplied !== true){
    throw new Error('Alive pullback/rebound evidence near support must prevent scanner weak/no-bounce downgrade.');
  }
  const freshSyntheticBounceGuard = evidenceSandbox.resolveAlivePullbackReboundGuard({
    marketData:{price:73.19, ma20:75.4, ma50:71.6, ma200:52, previousClose:71.15, changePercent:2.87},
    trendState:'strong',
    structureState:'intact',
    pullbackZone:'near_50ma',
    bounceState:'none',
    allowBounceDowngradeCorrection:false
  });
  if(freshSyntheticBounceGuard.applied === true || freshSyntheticBounceGuard.bounceState === 'attempt'){
    throw new Error('Fresh derivation must not let synthetic bounce none trigger the alive pullback guard.');
  }
  const freshActualWeakGuard = evidenceSandbox.resolveAlivePullbackReboundGuard({
    marketData:{price:73.19, ma20:75.4, ma50:71.6, ma200:52, previousClose:71.15, changePercent:2.87},
    trendState:'strong',
    structureState:'weak',
    pullbackZone:'near_50ma',
    stabilisationState:'early',
    bounceState:'none',
    allowBounceDowngradeCorrection:false
  });
  if(freshActualWeakGuard.applied !== true || freshActualWeakGuard.structureState === 'weak' || freshActualWeakGuard.bounceState !== 'attempt'){
    throw new Error('Fresh derivation may only apply alive pullback guard after an actual structure downgrade exists.');
  }
  const staleScannerInvalidatedGuard = evidenceSandbox.resolveAlivePullbackReboundGuard({
    record:{
      plan:{
        source:'scanner_estimate',
        entry:73.19,
        stop:69.5,
        firstTarget:82,
        invalidatedState:true
      },
      marketData:{price:73.19, ma20:75.4, ma50:71.6, ma200:52, previousClose:71.15, changePercent:2.87, currency:'USD'}
    },
    marketData:{price:73.19, ma20:75.4, ma50:71.6, ma200:52, previousClose:71.15, changePercent:2.87, currency:'USD'},
    trendState:'strong',
    structureState:'weak',
    pullbackZone:'near_50ma',
    stabilisationState:'early',
    bounceState:'none'
  });
  if(staleScannerInvalidatedGuard.applied !== true || staleScannerInvalidatedGuard.structureState === 'weak' || staleScannerInvalidatedGuard.bounceState !== 'attempt'){
    throw new Error('Stale persisted scanner-estimate invalidatedState must not suppress alive pullback rebound correction.');
  }
  const currentScannerInvalidatedGuard = evidenceSandbox.resolveAlivePullbackReboundGuard({
    record:{
      plan:{
        source:'scanner_estimate',
        entry:73.19,
        stop:69.5,
        firstTarget:82
      },
      marketData:{price:73.19, ma20:75.4, ma50:71.6, ma200:52, previousClose:71.15, changePercent:2.87, currency:'USD'},
      setup:{structureState:'broken', trendState:'broken'}
    },
    marketData:{price:73.19, ma20:75.4, ma50:71.6, ma200:52, previousClose:71.15, changePercent:2.87, currency:'USD'},
    trendState:'broken',
    structureState:'broken',
    pullbackZone:'near_50ma',
    stabilisationState:'early',
    bounceState:'none'
  });
  if(currentScannerInvalidatedGuard.applied === true){
    throw new Error('Real current scanner-estimate invalidation/broken structure must still suppress alive pullback rebound correction.');
  }
  const blankTrendMarketOnlyDerived = evidenceSandbox.analysisDerivedStatesFromRecord({
    marketData:{price:73.19, ma20:75.4, ma50:71.6, ma200:52, previousClose:71.15, changePercent:2.87},
    scan:{analysisProjection:{
      pullback_zone:'near_50ma',
      bounce_state:'none'
    }}
  });
  if(blankTrendMarketOnlyDerived.alivePullbackReboundGuardApplied === true || blankTrendMarketOnlyDerived.bounceState === 'attempt'){
    throw new Error('Alive pullback guard must not create bounce attempts from market data when trend/structure context is blank.');
  }
  const trueBrokenProjection = evidenceSandbox.analysisDerivedStatesFromRecord({
    marketData:{price:42, ma20:48, ma50:50, ma200:55, previousClose:43, changePercent:-2},
    scan:{analysisProjection:{
      trend_state:'broken',
      structure_state:'broken',
      pullback_zone:'extended',
      stabilisation_state:'none',
      bounce_state:'none'
    }}
  });
  if(trueBrokenProjection.structureState !== 'broken' || trueBrokenProjection.bounceState !== 'none' || trueBrokenProjection.alivePullbackReboundGuardApplied === true){
    throw new Error('Alive pullback guard must not soften true broken scanner projections.');
  }
  const trueWeakeningProjection = evidenceSandbox.analysisDerivedStatesFromRecord({
    marketData:{price:49, ma20:52, ma50:55, ma200:44, previousClose:48.5, changePercent:1.1},
    scan:{analysisProjection:{
      trend_state:'weak',
      structure_state:'weakening',
      pullback_zone:'near_50ma',
      stabilisation_state:'none',
      bounce_state:'none'
    }}
  });
  if(trueWeakeningProjection.structureState !== 'weakening' || trueWeakeningProjection.bounceState !== 'none' || trueWeakeningProjection.alivePullbackReboundGuardApplied === true){
    throw new Error('Alive pullback guard must not soften genuine weak/weakening trend projections.');
  }
  const priceabilityOnlyProjected = evidenceSandbox.analysisDerivedStatesFromRecord({
    scan:{analysisProjection:{priceability_state:'unpriceable'}},
    review:{normalizedAnalysis:null}
  });
  if(priceabilityOnlyProjected.derivedStateSource !== 'scanner_projection' || priceabilityOnlyProjected.priceabilityState !== 'unpriceable' || !priceabilityOnlyProjected.scannerProjectionTrustedFieldsApplied.includes('priceabilityState')){
    throw new Error('Consumed scanner priceability field must be reflected in source diagnostics.');
  }
  const mathematicallyPriceableProjection = evidenceSandbox.analysisDerivedStatesFromRecord({
    plan:{entry:62.73, stop:56.58, firstTarget:81.19},
    marketData:{currency:'USD'},
    scan:{analysisProjection:{priceability_state:'unpriceable', setup_location_state:'extended'}}
  });
  if(mathematicallyPriceableProjection.priceabilityState === 'unpriceable'){
    throw new Error('Scanner priceability must not stay unpriceable when deterministic plan math is valid.');
  }
  const metadataOnlyProjectionFields = evidenceSandbox.analysisDerivedStatesFromRecord({
    scan:{analysisProjection:{scan_type:'20MA', setup_type_reason:'metadata only'}},
    review:{normalizedAnalysis:null}
  });
  if(metadataOnlyProjectionFields.derivedStateSource !== 'unknown' || metadataOnlyProjectionFields.scannerProjectionTrustedFieldsApplied.length !== 0 || !metadataOnlyProjectionFields.scannerProjectionFieldsPresent.includes('scanType')){
    throw new Error('Metadata-only scanner projection must be present but not trusted/applied.');
  }
  const partialProjected = evidenceSandbox.analysisDerivedStatesFromRecord({
    scan:{analysisProjection:{pullback_zone:'near_20ma'}},
    review:{
      normalizedAnalysis:{
        ai_observation_only:true,
        coach_summary:'Trend broken and damaged, but this is AI observation only.',
        bounce_evidence:'Bounce attempt observed.'
      }
    }
  });
  if(partialProjected.derivedStateSource !== 'scanner_projection+ai_observation_hints' || partialProjected.aiObservationEvidenceApplied !== true || partialProjected.pullbackZone !== 'near_20ma' || partialProjected.structureState !== 'unknown' || partialProjected.bounceState !== '' || partialProjected.aiEvidenceStructureHint !== 'damaged_context' || !partialProjected.scannerProjectionTrustedFieldsApplied.includes('pullbackZone')){
    throw new Error('Partial scanner projection must merge per-field without allowing AI to emit canonical structure/bounce.');
  }
  const unknownStructurePromotion = resolverCore.resolveGlobalVerdict({
    ticker:'AINEUTRAL',
    in_watchlist:true,
    plan:{entry:100, stop:95, firstTarget:115},
    marketData:{price:101, ma20:100, ma50:98, ma200:90, currency:'USD'}
  }, {
    analysisDerivedStatesFromRecord:() => ({
      structureState:'unknown',
      trendState:'',
      bounceState:'confirmed',
      pullbackZone:'near_20ma',
      stabilisationState:'clear',
      volumeState:'strong'
    }),
    effectivePlanForRecord:() => ({entry:100, stop:95, firstTarget:115}),
    deriveCurrentPlanState:() => ({
      entry:100,
      stop:95,
      target:115,
      status:'valid',
      tradeability:'entry',
      rewardRisk:{valid:true, rrRatio:3},
      riskFit:{risk_status:'ok'},
      capitalFit:{capital_fit:'ok'}
    }),
    applySetupConfirmationPlanGate:(unusedRecord, displayedPlan) => displayedPlan,
    resolveFinalStateContract:() => ({
      finalVerdict:'Entry',
      structuralState:'entry',
      actionStateKey:'ready_to_act',
      planStatusKey:'valid',
      tradeabilityVerdict:'Entry',
      blockerReason:'',
      terminal:false,
      baseVerdict:'entry'
    }),
    resolvePreLifecycleStateContract:() => ({
      finalVerdict:'Entry',
      structuralState:'entry',
      actionStateKey:'ready_to_act',
      planStatusKey:'valid',
      tradeabilityVerdict:'Entry',
      blockerReason:'',
      terminal:false,
      baseVerdict:'entry'
    }),
    baseVerdictFromResolvedContract:() => 'entry',
    evaluatePlanRealism:() => ({credible_rr:3}),
    setupScoreForRecord:() => 9,
    scannerScoreGradientClass:() => '',
    isHostileMarketStatus:() => false,
    state:{marketStatus:''}
  });
  if(unknownStructurePromotion.entry_gate_pass === true || unknownStructurePromotion.near_entry_gate_pass === true){
    throw new Error('Unknown structure from AI fallback must not allow Entry/Near Entry promotion.');
  }
}

runAiContractAssertions();

function runPlanSemanticsAssertions(){
  const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const sandbox = {
    console,
    state:{marketStatus:''},
    average(values){
      const list = (Array.isArray(values) ? values : []).map(Number).filter(Number.isFinite);
      return list.length ? list.reduce((sum, value) => sum + value, 0) / list.length : null;
    },
    normalizeTickerRecord:record => record,
    numericOrNull:value => {
      if(value === null || value === undefined) return null;
      if(typeof value === 'string' && value.trim() === '') return null;
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    },
    fallbackPlanProposalForCard:() => null,
    resolverSeedVerdictForRecord:() => 'Watch',
    cloneData:(value, fallback) => value == null ? fallback : JSON.parse(JSON.stringify(value)),
    currentRiskSettings:() => ({}),
    currentMaxLoss:() => 40,
    currentAccountSizeGbp:() => 4000,
    normalizeQuoteCurrency:value => String(value || '').trim().toUpperCase(),
    normalizeExitMode:value => value || 'fixed_target',
    evaluateRewardRisk:(entry, stop, target) => {
      const values = [entry, stop, target].map(Number);
      if(values.some(value => !Number.isFinite(value))) return {valid:false, rrRatio:null, riskPerShare:null, rewardPerShare:null, rrState:'invalid'};
      const risk = values[0] - values[1];
      const reward = values[2] - values[0];
      const valid = risk > 0 && reward > 0;
      return {valid, rrRatio:valid ? reward / risk : null, riskPerShare:risk, rewardPerShare:reward, rrState:valid ? 'valid' : 'invalid'};
    },
    evaluateRiskFit:({entry, stop}) => Number.isFinite(Number(entry)) && Number.isFinite(Number(stop)) && Number(entry) > Number(stop)
      ? {max_loss:40, risk_per_share:Number(entry) - Number(stop), position_size:8, risk_status:'fits_risk'}
      : {max_loss:40, risk_per_share:null, position_size:0, risk_status:'plan_missing'},
    evaluateCapitalFit:() => ({capital_fit:'acceptable', capital_ok:true, position_cost:800, position_cost_gbp:800}),
    deriveTradeability:(status, riskStatus) => status === 'valid' && riskStatus === 'fits_risk' ? 'tradable' : 'invalid',
    deriveAffordability:() => 'affordable',
    deriveExecutionPlanState:() => ({
      targetReviewState:'not_near_target',
      targetActionRecommendation:'',
      targetAlertLevel:null
    }),
    resolvePlanSource:(_record, _candidate, requestedSource) => String(requestedSource || ''),
    applyLifecycleStageFromPlan(){},
    scanTypeForEvaluation:value => String(value || '20MA'),
    analysisDerivedStatesFromRecord:() => ({structureState:'intact', trendState:'uptrend', bounceState:'none', pullbackZone:'near_50ma', stabilisationState:'none', volumeState:'neutral'}),
    resolveGlobalVerdict:() => ({allow_plan:false, allow_watchlist:true, final_verdict:'watch', reason:'Wait', downgrade_reason:'Wait'}),
    normalizeGlobalVerdictKey(value){
      const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
      if(safe === 'nearentry') return 'near_entry';
      if(['entry','near_entry','watch','avoid'].includes(safe)) return safe;
      return safe || 'watch';
    },
    watchlistRefreshStructureGate:() => ({
      refresh_demote_reason:'Structurally alive; keep on monitor.',
      structural_alive_at_refresh:true,
      avoid_allowed_by_structure_gate:false,
      explicit_invalidation_reason:'(none)',
      lifecycle_drop_reason:'(none)'
    }),
    normalizeAnalysisVerdict(value){
      const safe = String(value || 'Watch').trim();
      if(/^entry$/i.test(safe)) return 'Entry';
      if(/^near[ _-]?entry$/i.test(safe)) return 'Near Entry';
      if(/^avoid$/i.test(safe)) return 'Avoid';
      return 'Watch';
    },
    capitalConstraintReasonForPlan:() => '',
    normalizeRrConfidenceLabel:() => 'Strong',
    executionCapitalBlocked:() => false,
    executionCapitalHeavy:() => false,
    hasAuthoritativeStopBreach:() => false,
    evaluateBouncePriceabilityGuard(input = {}){
      return {
        originalBounceState:String(input.originalBounceState || 'attempt').trim().toLowerCase(),
        adjustedBounceState:String(input.originalBounceState || 'attempt').trim().toLowerCase(),
        bouncePriceabilityGuardApplied:true,
        bouncePriceabilityGuardReason:'Repair is forming but the setup is not priceable yet.',
        hasClearInvalidationLevel:true,
        hasPriceablePlan:true,
        unpriceableBlockReason:'Repair is forming but the setup is not priceable yet.'
      };
    },
    avoidSubtypeForRecord:() => '',
    isTerminalDeadSetup:() => ({dead:false, reason:'', reasonCode:''}),
    getReviewAnalysisState:() => ({normalizedAnalysis:{}}),
    getPlanUiState:() => ({state:'valid', label:'Plan valid'}),
    getSetupUiState:() => ({state:'watch'}),
    appendWatchlistDebugEvent:() => {},
    globalVerdictLabel:value => String(value || ''),
    setStatus:() => {},
    activeReviewTicker:() => '',
    escapeHtml:value => String(value || ''),
    uiState:{watchlistLifecycleRunning:false},
    actionableRrValueForPlan:plan => plan && plan.status === 'valid' && plan.rewardRisk && plan.rewardRisk.valid ? plan.rewardRisk.rrRatio : null,
    evaluateSetupQualityAdjustments:() => ({weakRegimePenalty:false, lowControlSetup:false, tooWideForQualityPullback:false}),
    evaluateWarningState:() => ({}),
    normalizeAnalysisVerdict:value => String(value || 'Watch'),
    getSetupUiState:() => ({state:'monitor'}),
    isHostileMarketStatus:() => false,
    resolveGlobalVerdictImpl:record => ({
      final_verdict:'Entry',
      allow_plan:true,
      allow_watchlist:true,
      priceability_state:'priceable',
      plan_status:'valid',
      reason:'',
      downgrade_reason:''
    }),
    resolvePreLifecycleStateContract:() => ({}),
    baseVerdictFromResolvedContract:resolved => String(resolved && resolved.finalVerdict || 'Watch'),
    applySetupConfirmationPlanGate:(_item, displayedPlan) => displayedPlan,
    setupScoreForRecord:() => 75,
    rawSetupScoreForRecord:() => 75,
    cumulativePenaltyTraceForRecord:() => ({sources:[]}),
    state:{},
    scannerScoreGradientClass:() => 'neutral',
    buildDecisionSummary:() => 'Decision summary',
    debugFlagEnabled:() => false,
    planNeedsAdjustment:false,
    actionPriority:stage => ({action_now:0, near_entry:1, needs_plan:2, watch:3, avoid:4}[stage] ?? 4),
    hasUnsavedPlanEdits:() => false,
    savedPlanSnapshotForRecord:() => ({entry:100, stop:95, firstTarget:120}),
    planValuesEqual:(left, right) => JSON.stringify(left || {}) === JSON.stringify(right || {}),
    planUiLabel:planValidity => planValidity === 'missing'
      ? 'No actionable plan yet'
      : (planValidity === 'valid' ? 'Plan valid' : (planValidity === 'needs_adjustment' ? 'Needs adjustment' : (planValidity === 'unrealistic_rr' ? 'Unrealistic R:R' : 'Invalid plan')))
  };
  vm.createContext(sandbox);
  [
    'currentScannerEstimateHardBlockers',
    'hasAnyPlanFields',
    'effectivePlanForRecord',
    'planSourceForDiagnostics',
    'canonicalTradePlanAuthorityVersion',
    'stampCanonicalTradePlan',
    'applyPlanCandidateToRecord',
    'scannerEstimateAuthorityReasonPriority',
    'scannerEstimateAuthorityReasonFromText',
    'resolveScannerEstimateStructuredAuthorityCode',
    'isCurrentTechnicalInvalidation',
    'resolveCurrentScannerEstimatePlanBlockers',
    'resolveScannerEstimatePlanAuthority',
    'planCheckStateForRecord',
    'capSeverityFromEvaluation',
    'resolveCanonicalPullbackState',
    'buildPromotionGateTrace',
    'capVerdictByBlockingFactors',
    'legacyResolveFinalStateContract',
    'resolveFinalStateContract',
    'normalizeTickerJourneyAuthority',
    'currentTickerJourneyAuthority',
    'shouldPreserveScanAuthorityCanonicalPath',
    'selectedAuthorityContractForGlobalVerdict',
    'selectedAuthorityContractSource',
    'canonicalVerdictAuthoritySource',
    'resolveGlobalVerdict',
    'applyGlobalVerdictGates',
    'executionDowngradeVerdictForRecord',
    'isAnalysisStaleForRecord',
    'watchlistRefreshStructureGate',
    'shouldSuppressWatchlistAddSoftDowngrade',
    'deriveActionStateForRecord',
    'actionStateForRecord',
    'nextActionTextForRecord',
    'currentHardFailVerdictForRecord',
    'deriveCurrentPlanState',
    'planUiClass',
    'getPlanUiState',
    'isNearLevel',
    'deriveRecentCandleEvidence',
    'buildScannerChecks',
    'priorHighTarget',
    'nearestPivotTargets',
    'pullbackSwingHighCandidate',
    'targetResistanceProfile',
    'realisticFirstTarget',
    'deriveTradePlan',
    'evaluatePlanRealism'
  ].forEach(functionName => {
    vm.runInContext(extractFunctionSource(appSource, functionName), sandbox, {filename:`app.js#${functionName}`});
  });
  const stampedPlan = (plan = {}) => ({
    authoritySource:'applyPlanCandidateToRecord',
    authorityVersion:'trade_plan_v1',
    authorityReason:'test_fixture',
    writtenBy:'test_fixture',
    writtenAt:'2026-06-30T00:00:00.000Z',
    candidateSource:String(plan.source || 'manual'),
    ...plan
  });

  const noPlanRecord = {ticker:'NOPLAN', plan:{entry:null, stop:null, firstTarget:null, source:'manual'}, review:{manualReview:null}, scan:{}, marketData:{currency:'USD'}};
  const noPlanEffective = sandbox.effectivePlanForRecord(noPlanRecord, {allowScannerFallback:false});
  const noPlanState = sandbox.deriveCurrentPlanState(noPlanEffective.entry, noPlanEffective.stop, noPlanEffective.firstTarget, 'USD');
  const noPlanUi = sandbox.getPlanUiState(noPlanRecord, {displayedPlan:noPlanState, effectivePlan:noPlanEffective});
  const noPlanRealism = sandbox.evaluatePlanRealism(noPlanRecord, {displayedPlan:noPlanState});
  if(noPlanEffective.source === 'manual' || sandbox.planSourceForDiagnostics(noPlanRecord, noPlanEffective) === 'manual'){
    throw new Error('Missing AI/chart plan with no user-entered fields must not be diagnosed as manual.');
  }
  if(noPlanUi.state !== 'missing' || /Invalid plan/i.test(noPlanUi.label) || noPlanRealism.rr_realism_label !== 'N/A'){
    throw new Error('Missing generated plan must display as pending/no actionable plan with RR realism N/A.');
  }

  const partialManualRecord = {ticker:'PARTIAL', plan:stampedPlan({entry:100, stop:null, firstTarget:null, source:'manual'}), review:{manualReview:null}, scan:{}, marketData:{currency:'USD'}};
  const partialEffective = sandbox.effectivePlanForRecord(partialManualRecord, {allowScannerFallback:false});
  const partialState = sandbox.deriveCurrentPlanState(partialEffective.entry, partialEffective.stop, partialEffective.firstTarget, 'USD');
  const partialUi = sandbox.getPlanUiState(partialManualRecord, {displayedPlan:partialState, effectivePlan:partialEffective});
  if(sandbox.planSourceForDiagnostics(partialManualRecord, partialEffective) !== 'manual' || partialUi.state !== 'invalid'){
    throw new Error('User-entered incomplete plan fields may remain manual and invalid/incomplete.');
  }

  const validManualRecord = {ticker:'VALIDMANUAL', plan:stampedPlan({entry:100, stop:95, firstTarget:115, source:'manual'}), review:{manualReview:null}, scan:{}, marketData:{price:100, currency:'USD'}};
  const validEffective = sandbox.effectivePlanForRecord(validManualRecord, {allowScannerFallback:false});
  const validState = sandbox.deriveCurrentPlanState(validEffective.entry, validEffective.stop, validEffective.firstTarget, 'USD');
  if(sandbox.planSourceForDiagnostics(validManualRecord, validEffective) !== 'manual' || validState.status !== 'valid'){
    throw new Error('Complete manual plan must remain manual and use normal validation math.');
  }

  const scannerEstimatePlanRecord = {
    ticker:'SCANNERKEEP',
    plan:stampedPlan({entry:100, stop:95, firstTarget:115, source:'scanner_estimate', hasValidPlan:true, riskStatus:'fits_risk', blockedReason:''}),
    setup:{},
    marketData:{price:100, currency:'USD'},
    watchlist:{debug:{}, inWatchlist:false}
  };
  sandbox.applyGlobalVerdictGates(scannerEstimatePlanRecord, {source:'scan'});
  if(scannerEstimatePlanRecord.plan.entry !== 100 || scannerEstimatePlanRecord.plan.stop !== 95 || scannerEstimatePlanRecord.plan.firstTarget !== 115){
    throw new Error('Global verdict gates must not strip concrete scanner_estimate plan fields during monitor/watch states.');
  }
  if(scannerEstimatePlanRecord.plan.hasValidPlan !== true || scannerEstimatePlanRecord.plan.riskStatus !== 'fits_risk'){
    throw new Error('Global verdict gates must not corrupt scanner_estimate plan validity metadata during monitor/watch states.');
  }

  const trowLikeRecord = {
    ticker:'TROWLIKE',
    plan:stampedPlan({
      entry:110.27,
      stop:102.29,
      firstTarget:136.19,
      source:'scanner_estimate',
      status:'valid',
      tradeability:'tradable',
      riskStatus:'fits_risk',
      blockedReason:'',
      blockedReasonCode:'',
      firstTargetTooClose:false,
      planValidationState:'missed',
      triggerState:'invalidated',
      missedState:'missed',
      invalidatedState:'invalidated'
    }),
    marketData:{price:110.27, currency:'USD'},
    setup:{},
    watchlist:{debug:{}, inWatchlist:true}
  };
  sandbox.analysisDerivedStatesFromRecord = record => {
    if(record && record.ticker === 'CURRENT_SCANNER_INVALIDATION'){
      return {
        structureState:'broken',
        trendState:'broken',
        bounceState:'attempt',
        pullbackZone:'near_20ma',
        stabilisationState:'none',
        volumeState:'supportive',
        priceabilityState:'priceable'
      };
    }
    return {
      structureState:'strong',
      trendState:'uptrend',
      bounceState:'attempt',
      pullbackZone:'near_20ma',
      stabilisationState:'none',
      volumeState:'supportive',
      priceabilityState:'priceable'
    };
  };
  sandbox.resolverSeedVerdictForRecord = () => 'Entry';
  const trowLikeEffectivePlan = {entry:110.27, stop:102.29, firstTarget:136.19, source:'scanner_estimate'};
  const trowLikeDisplayedPlan = sandbox.deriveCurrentPlanState(110.27, 102.29, 136.19, 'USD');
  const trowLikeContract = sandbox.resolveFinalStateContract(trowLikeRecord, {
    finalVerdict:'Entry',
    derivedStates:sandbox.analysisDerivedStatesFromRecord(trowLikeRecord),
    effectivePlan:trowLikeEffectivePlan,
    displayedPlan:trowLikeDisplayedPlan
  });
  if(!trowLikeContract.contractDiagnostics || trowLikeContract.contractDiagnostics.softReadinessOnlyDemotion !== true){
    throw new Error('TROW-like soft-readiness case must be detected explicitly in resolveFinalStateContract diagnostics.');
  }
  if(trowLikeContract.unpriceableBlockReason || trowLikeContract.blockerCode === 'bounce_not_priceable'){
    throw new Error('Soft readiness only must not be treated as a hard unpriceable blocker in resolveFinalStateContract.');
  }
  const liveLikeResolvedVerdict = sandbox.resolveGlobalVerdict(trowLikeRecord);
  if(!liveLikeResolvedVerdict.contractDiagnostics || liveLikeResolvedVerdict.contractDiagnostics.softReadinessOnlyDemotion !== true){
    throw new Error('Dirty persisted TROW-like record must keep soft-readiness protection through the real resolveGlobalVerdict path.');
  }
  if(liveLikeResolvedVerdict.contractDiagnostics.structuredBlockersPresent === true){
    throw new Error('Stale persisted plan-owned blocker metadata must not count as a current structured blocker in soft-readiness protection.');
  }
  const preservedScanAuthorityRecord = {
    ticker:'MIXED_DIAGNOSTICS',
    authority:{version:1, source:'scan', reason:'scanner_workflow'},
    watchlist:{inWatchlist:true, debug:{}},
    marketData:{price:100, currency:'USD'},
    plan:{
      entry:100,
      stop:95,
      firstTarget:108,
      source:'',
      authoritySource:'applyPlanCandidateToRecord',
      authorityVersion:'trade_plan_v1'
    },
    setup:{
      structureState:'weak',
      trendState:'acceptable',
      setupLocationState:'off_level',
      priceabilityState:'priceable',
      stabilisationState:'none',
      bounceState:'none',
      pullbackZone:'extended',
      volumeState:'weak'
    }
  };
  const originalAnalysisDerivedStatesFromRecord = sandbox.analysisDerivedStatesFromRecord;
  sandbox.analysisDerivedStatesFromRecord = () => ({
    structureState:'weak',
    trendState:'acceptable',
    setupLocationState:'off_level',
    priceabilityState:'priceable',
    stabilisationState:'none',
    bounceState:'none',
    pullbackZone:'extended',
    volumeState:'weak'
  });
  const originalResolvePreLifecycleStateContract = sandbox.resolvePreLifecycleStateContract;
  const originalResolveFinalStateContract = sandbox.resolveFinalStateContract;
  sandbox.resolvePreLifecycleStateContract = () => ({
    finalVerdict:'Watch',
    final_verdict:'watch',
    structuralState:'developing',
    actionStateKey:'wait_for_confirmation',
    planStatusKey:'valid',
    tradeabilityVerdict:'Watch',
    blockerReason:'Pre-lifecycle authority.',
    reasonSummary:'Pre-lifecycle authority.',
    terminal:false,
    baseVerdict:'watch',
    primaryBlockerSource:'setup_location',
    contractDiagnostics:{
      authorityContract:'pre_lifecycle',
      blockerSource:'setup_location',
      planStatus:'valid',
      tradeability:'risk_only',
      softReadinessOnlyDemotion:false
    }
  });
  sandbox.resolveFinalStateContract = () => ({
    finalVerdict:'Avoid',
    final_verdict:'avoid',
    structuralState:'avoid',
    actionStateKey:'blocked',
    planStatusKey:'invalid',
    tradeabilityVerdict:'Avoid',
    blockerReason:'Tracked authority.',
    reasonSummary:'Tracked authority.',
    terminal:false,
    baseVerdict:'avoid',
    primaryBlockerSource:'plan_state',
    contractDiagnostics:{
      authorityContract:'tracked_final',
      blockerSource:'plan_state',
      planStatus:'invalid',
      tradeability:'invalid',
      softReadinessOnlyDemotion:false
    }
  });
  const mixedDiagnosticsVerdict = sandbox.resolveGlobalVerdict(preservedScanAuthorityRecord, {
    preserveScanAuthorityCanonicalPath:true
  });
  sandbox.analysisDerivedStatesFromRecord = originalAnalysisDerivedStatesFromRecord;
  sandbox.resolvePreLifecycleStateContract = originalResolvePreLifecycleStateContract;
  sandbox.resolveFinalStateContract = originalResolveFinalStateContract;
  if(!mixedDiagnosticsVerdict.contractDiagnostics || mixedDiagnosticsVerdict.contractDiagnostics.authorityContract !== 'pre_lifecycle'){
    throw new Error('resolveGlobalVerdict must source contractDiagnostics from the same preserved authority contract as final_verdict.');
  }
  if(mixedDiagnosticsVerdict.contractDiagnostics.blockerSource !== 'setup_location'){
    throw new Error('Preserved watch verdict must not expose tracked plan_state diagnostics.');
  }
  if(mixedDiagnosticsVerdict.canonical_soft_readiness_alignment_source !== 'scan_authority_preserved'){
    throw new Error('Unchanged scan-authority preservation must report scan_authority_preserved provenance.');
  }
  if(mixedDiagnosticsVerdict.contractDiagnostics.canonicalAuthoritySelectionSource !== 'scan_authority_preserved'){
    throw new Error('Preserved scan-authority diagnostics must expose scan_authority_preserved as canonical provenance.');
  }
  if(mixedDiagnosticsVerdict.contractDiagnostics.authoritySelectionSource !== 'scan_authority_preserved'){
    throw new Error('Preserved scan-authority diagnostics must expose scan_authority_preserved as the selected contract path.');
  }
  if(mixedDiagnosticsVerdict.canonical_soft_readiness_alignment_source === 'review_soft_readiness_override'){
    throw new Error('Unchanged scan-authority preservation must not report review_soft_readiness_override.');
  }
  const originalResolveGlobalVerdictImpl = sandbox.resolveGlobalVerdictImpl;
  sandbox.resolveGlobalVerdictImpl = () => ({
    final_verdict:'watch',
    canonical_final_verdict:'entry',
    canonical_visual_bucket:'entry',
    canonical_soft_readiness_alignment_applied:true,
    allow_plan:true,
    allow_watchlist:true,
    priceability_state:'priceable',
    plan_status:'valid',
    contractDiagnostics:{
      authorityContract:'tracked_final',
      blockerSource:'setup_location',
      planStatus:'valid',
      tradeability:'tradable',
      softReadinessOnlyDemotion:true,
      structuredBlockersPresent:false,
      finalPriceabilityState:'priceable'
    }
  });
  const reviewSoftReadinessVerdict = sandbox.resolveGlobalVerdict({
    ticker:'REVIEW_OVERRIDE',
    watchlist_entry_exists:true,
    marketData:{price:100, currency:'USD'},
    derivedStates:{
      structureState:'strong',
      trendState:'intact',
      setupLocationState:'off_level',
      priceabilityState:'priceable',
      stabilisationState:'none',
      bounceState:'attempt',
      pullbackZone:'near_20ma',
      volumeState:'supportive'
    },
    effectivePlan:{entry:100, stop:96, firstTarget:112},
    displayedPlan:{
      status:'valid',
      entry:100,
      stop:96,
      target:112,
      tradeability:'tradable',
      rewardRisk:{rrRatio:3},
      riskFit:{risk_status:'acceptable'},
      affordability:'acceptable',
      capitalFit:{capital_fit:'acceptable'}
    }
  }, {
    preserveReviewCanonicalForSoftReadiness:true,
    analysisDerivedStatesFromRecord:() => ({
      structureState:'strong',
      trendState:'intact',
      setupLocationState:'off_level',
      priceabilityState:'priceable',
      stabilisationState:'none',
      bounceState:'attempt',
      pullbackZone:'near_20ma',
      volumeState:'supportive'
    }),
    effectivePlanForRecord:() => ({entry:100, stop:96, firstTarget:112}),
    deriveCurrentPlanState:() => ({
      status:'valid',
      entry:100,
      stop:96,
      target:112,
      tradeability:'tradable',
      rewardRisk:{rrRatio:3},
      riskFit:{risk_status:'acceptable'},
      affordability:'acceptable',
      capitalFit:{capital_fit:'acceptable'}
    }),
    resolvePreLifecycleStateContract:() => ({
      finalVerdict:'Watch',
      final_verdict:'watch',
      structuralState:'developing',
      actionStateKey:'wait_for_confirmation',
      planStatusKey:'valid',
      tradeabilityVerdict:'Watch',
      blockerReason:'Needs stronger confirmation.',
      reasonSummary:'Needs stronger confirmation.',
      terminal:false,
      baseVerdict:'watch',
      primaryBlockerSource:'setup_location',
      contractDiagnostics:{
        authorityContract:'pre_lifecycle',
        blockerSource:'setup_location',
        planStatus:'valid',
        tradeability:'tradable',
        softReadinessOnlyDemotion:false
      }
    }),
    resolveFinalStateContract:() => ({
      finalVerdict:'Watch',
      final_verdict:'watch',
      canonical_final_verdict:'entry',
      canonical_visual_bucket:'entry',
      canonical_priceability_state:'priceable',
      structuralState:'developing',
      actionStateKey:'wait_for_confirmation',
      planStatusKey:'valid',
      tradeabilityVerdict:'Watch',
      blockerReason:'Needs stronger confirmation.',
      reasonSummary:'Needs stronger confirmation.',
      terminal:false,
      baseVerdict:'watch',
      primaryBlockerSource:'setup_location',
      contractDiagnostics:{
        authorityContract:'tracked_final',
        blockerSource:'setup_location',
        planStatus:'valid',
        tradeability:'tradable',
        softReadinessOnlyDemotion:true,
        structuredBlockersPresent:false,
        finalPriceabilityState:'priceable'
      }
    })
  });
  sandbox.resolveGlobalVerdictImpl = originalResolveGlobalVerdictImpl;
  if(reviewSoftReadinessVerdict.canonical_final_verdict !== 'entry'){
    throw new Error('Review soft-readiness override must preserve the canonical entry verdict.');
  }
  if(reviewSoftReadinessVerdict.canonical_soft_readiness_alignment_source !== 'review_soft_readiness_override'){
    throw new Error('Review soft-readiness override must report review_soft_readiness_override provenance.');
  }
  if(reviewSoftReadinessVerdict.contractDiagnostics.canonicalAuthoritySelectionSource !== 'review_soft_readiness_override'){
    throw new Error('Review soft-readiness diagnostics must expose review_soft_readiness_override as canonical provenance.');
  }
  if(reviewSoftReadinessVerdict.canonical_soft_readiness_alignment_source === 'scan_authority_preserved'){
    throw new Error('Review soft-readiness override must not report scan_authority_preserved.');
  }
  const trowLikeGlobalVerdict = {
    allow_plan:false,
    allow_watchlist:true,
    final_verdict:'watch',
    priceability_state:'priceable',
    plan_status:'valid',
    reason:'Conditions are not strong enough for active focus.',
    downgrade_reason:'Conditions are not strong enough for active focus.',
    contractDiagnostics:liveLikeResolvedVerdict.contractDiagnostics
  };
  sandbox.resolveGlobalVerdict = () => trowLikeGlobalVerdict;
  sandbox.applyGlobalVerdictGates(trowLikeRecord, {source:'track_focus'});
  if(trowLikeRecord.plan.blockedReasonCode === 'resolver_block'){
    throw new Error('Soft readiness only must not persist generic resolver_block on a valid tradable scanner_estimate plan.');
  }

  sandbox.resolveGlobalVerdict = sandbox.resolveGlobalVerdictImpl;
  const stalePersistedInvalidationRecord = {
    ticker:'STALE_SCANNER_INVALIDATION',
    plan:{
      entry:100,
      stop:95,
      firstTarget:120,
      source:'scanner_estimate',
      status:'valid',
      tradeability:'tradable',
      riskStatus:'fits_risk',
      blockedReason:'',
      blockedReasonCode:'',
      invalidatedState:'invalidated',
      missedState:'missed'
    },
    marketData:{price:100, currency:'USD'},
    setup:{structureState:'intact', trendState:'uptrend'},
    lifecycle:{stage:'tracking', status:'open'},
    watchlist:{debug:{}, inWatchlist:true}
  };
  const stalePersistedDisplayedPlan = sandbox.deriveCurrentPlanState(100, 95, 120, 'USD');
  const stalePersistedDowngrade = sandbox.executionDowngradeVerdictForRecord(stalePersistedInvalidationRecord, {
    displayedPlan:stalePersistedDisplayedPlan,
    provisionalVerdict:'Entry',
    globalVerdict:{
      final_verdict:'Entry',
      allow_plan:true,
      allow_watchlist:true,
      priceability_state:'priceable',
      plan_status:'valid',
      reason:'',
      downgrade_reason:''
    }
  });
  if(stalePersistedDowngrade === 'Watch'){
    throw new Error('Stale persisted invalidated/missed metadata must not force Watch demotion on a fresh valid tradable scanner-estimate plan.');
  }
  if(sandbox.isAnalysisStaleForRecord(stalePersistedInvalidationRecord) === true){
    throw new Error('Stale persisted invalidated/missed metadata must not mark fresh valid scanner-estimate analysis as stale.');
  }
  const stalePersistedRefreshGate = sandbox.watchlistRefreshStructureGate(stalePersistedInvalidationRecord);
  if(stalePersistedRefreshGate.dead_trigger_source === 'explicit_invalidation' || stalePersistedRefreshGate.explicit_invalidation_reason !== '(none)'){
    throw new Error('Stale persisted invalidatedState must not create explicit invalidation during watchlist refresh.');
  }
  const stalePersistedFinalContract = sandbox.resolveFinalStateContract(stalePersistedInvalidationRecord, {
    finalVerdict:'Entry',
    derivedStates:sandbox.analysisDerivedStatesFromRecord(stalePersistedInvalidationRecord),
    effectivePlan:{entry:100, stop:95, firstTarget:120, source:'scanner_estimate'},
    displayedPlan:stalePersistedDisplayedPlan
  });
  if(stalePersistedFinalContract.contractDiagnostics && stalePersistedFinalContract.contractDiagnostics.structuredBlockersPresent === true){
    throw new Error('Stale persisted invalidated/missed metadata must not create structured blockers in resolveFinalStateContract().');
  }
  const stalePersistedLegacyContract = sandbox.legacyResolveFinalStateContract(stalePersistedInvalidationRecord, {
    finalVerdict:'Entry',
    derivedStates:sandbox.analysisDerivedStatesFromRecord(stalePersistedInvalidationRecord),
    effectivePlan:{entry:100, stop:95, firstTarget:120, source:'scanner_estimate'},
    displayedPlan:stalePersistedDisplayedPlan,
    rrResolution:{rawResolverVerdict:'Entry', rr_label:'Strong', rr_value:4, remapReason:'', reason:'', status:'Entry'},
    planCheckState:{state:'valid'},
    qualityAdjustments:{weakRegimePenalty:false, lowControlSetup:false, tooWideForQualityPullback:false},
    warningState:{reasons:[]},
    planUiState:{state:'valid', label:'Plan valid'},
    setupUiState:{state:'monitor'},
    avoidSubtype:'',
    deadCheck:{dead:false, reason:'', reasonCode:'', terminalTriggerUsed:false},
    emojiPresentation:{primaryState:'entry', primaryEmoji:'\uD83D\uDE80', primaryLabel:'Entry', badgeClass:'ready', modifiers:[]}
  });
  if(['setup_invalidated','missed_setup'].includes(String(stalePersistedLegacyContract.blockerCode || ''))){
    throw new Error('Stale persisted invalidated/missed metadata must not drive the action-state copy path.');
  }
  const stalePersistedDerivedActionState = sandbox.deriveActionStateForRecord(stalePersistedInvalidationRecord);
  if(stalePersistedDerivedActionState.stage === 'avoid'){
    throw new Error('Stale persisted invalidatedState must not force deriveActionStateForRecord() to Avoid.');
  }
  const stalePersistedNextAction = sandbox.nextActionTextForRecord(stalePersistedInvalidationRecord);
  if(stalePersistedNextAction === 'Setup invalidated' || stalePersistedNextAction === 'Missed - do not chase'){
    throw new Error('Stale persisted invalidated/missed metadata must not drive nextActionTextForRecord().');
  }
  if(sandbox.currentHardFailVerdictForRecord(stalePersistedInvalidationRecord) === 'Avoid'){
    throw new Error('Stale persisted invalidated/missed metadata must not drive structural hard-fail Avoid.');
  }

  const currentInvalidatedLiveRecord = {
    ticker:'CURRENT_SCANNER_INVALIDATION',
    plan:{
      entry:100,
      stop:95,
      firstTarget:120,
      source:'scanner_estimate',
      status:'valid',
      tradeability:'tradable',
      riskStatus:'fits_risk',
      blockedReason:'',
      blockedReasonCode:''
    },
    marketData:{price:100, currency:'USD'},
    setup:{structureState:'broken', trendState:'broken'},
    lifecycle:{stage:'tracking', status:'open'},
    watchlist:{debug:{}, inWatchlist:true}
  };
  const currentInvalidatedDisplayedPlan = sandbox.deriveCurrentPlanState(100, 95, 120, 'USD');
  const currentInvalidatedDowngrade = sandbox.executionDowngradeVerdictForRecord(currentInvalidatedLiveRecord, {
    displayedPlan:currentInvalidatedDisplayedPlan,
    provisionalVerdict:'Entry',
    globalVerdict:{
      final_verdict:'Entry',
      allow_plan:true,
      allow_watchlist:true,
      priceability_state:'priceable',
      plan_status:'valid',
      explicit_invalidation_reason_code:'broken_structure',
      reason:'',
      downgrade_reason:''
    }
  });
  if(currentInvalidatedDowngrade !== 'Watch'){
    throw new Error('Current broken-structure invalidation must still force Watch demotion on scanner-estimate plans.');
  }
  if(sandbox.isAnalysisStaleForRecord(currentInvalidatedLiveRecord) !== true){
    throw new Error('Current broken-structure invalidation must still mark analysis stale.');
  }
  const currentInvalidatedFinalContract = sandbox.resolveFinalStateContract(currentInvalidatedLiveRecord, {
    finalVerdict:'Entry',
    derivedStates:sandbox.analysisDerivedStatesFromRecord(currentInvalidatedLiveRecord),
    effectivePlan:{entry:100, stop:95, firstTarget:120, source:'scanner_estimate'},
    displayedPlan:currentInvalidatedDisplayedPlan
  });
  if(!currentInvalidatedFinalContract.contractDiagnostics || currentInvalidatedFinalContract.contractDiagnostics.structuredBlockersPresent !== true){
    throw new Error('Current invalidated scanner-estimate state must still surface as a structured blocker in resolveFinalStateContract().');
  }
  const currentInvalidatedLegacyContract = sandbox.legacyResolveFinalStateContract(currentInvalidatedLiveRecord, {
    finalVerdict:'Entry',
    derivedStates:sandbox.analysisDerivedStatesFromRecord(currentInvalidatedLiveRecord),
    effectivePlan:{entry:100, stop:95, firstTarget:120, source:'scanner_estimate'},
    displayedPlan:currentInvalidatedDisplayedPlan,
    rrResolution:{rawResolverVerdict:'Entry', rr_label:'Strong', rr_value:4, remapReason:'', reason:'', status:'Entry'},
    planCheckState:{state:'valid'},
    qualityAdjustments:{weakRegimePenalty:false, lowControlSetup:false, tooWideForQualityPullback:false},
    warningState:{reasons:[]},
    planUiState:{state:'valid', label:'Plan valid'},
    setupUiState:{state:'monitor'},
    avoidSubtype:'',
    deadCheck:{dead:false, reason:'', reasonCode:'', terminalTriggerUsed:false},
    emojiPresentation:{primaryState:'entry', primaryEmoji:'\uD83D\uDE80', primaryLabel:'Entry', badgeClass:'ready', modifiers:[]}
  });
  if(!['setup_invalidated','broken_structure','broken_trend'].includes(String(currentInvalidatedLegacyContract.blockerCode || ''))){
    throw new Error('Current invalidated scanner-estimate state must still drive a blocking action-state copy outcome.');
  }
  if(sandbox.deriveActionStateForRecord(currentInvalidatedLiveRecord).stage !== 'avoid'){
    throw new Error('Current invalidated scanner-estimate state must still force deriveActionStateForRecord() to Avoid.');
  }
  if(sandbox.nextActionTextForRecord(currentInvalidatedLiveRecord) !== 'Setup invalidated'){
    throw new Error('Current invalidated scanner-estimate state must still drive nextActionTextForRecord().');
  }
  if(sandbox.currentHardFailVerdictForRecord(currentInvalidatedLiveRecord) !== 'Avoid'){
    throw new Error('Current invalidated scanner-estimate state must still drive structural hard-fail Avoid.');
  }

  const currentMissedLiveRecord = {
    ticker:'CURRENT_SCANNER_MISSED',
    plan:{
      entry:100,
      stop:95,
      firstTarget:120,
      source:'scanner_estimate',
      status:'valid',
      tradeability:'tradable',
      riskStatus:'fits_risk',
      blockedReason:'',
      blockedReasonCode:''
    },
    marketData:{price:118, currency:'USD'},
    setup:{structureState:'intact', trendState:'uptrend'},
    lifecycle:{stage:'tracking', status:'open'},
    watchlist:{debug:{}, inWatchlist:true}
  };
  if(sandbox.isAnalysisStaleForRecord(currentMissedLiveRecord) !== true){
    throw new Error('Current missed scanner-estimate setup must still mark analysis stale.');
  }
  const currentMissedLegacyContract = sandbox.legacyResolveFinalStateContract(currentMissedLiveRecord, {
    finalVerdict:'Entry',
    derivedStates:sandbox.analysisDerivedStatesFromRecord(currentMissedLiveRecord),
    effectivePlan:{entry:100, stop:95, firstTarget:120, source:'scanner_estimate'},
    displayedPlan:sandbox.deriveCurrentPlanState(100, 95, 120, 'USD'),
    rrResolution:{rawResolverVerdict:'Entry', rr_label:'Strong', rr_value:4, remapReason:'', reason:'', status:'Entry'},
    planCheckState:{state:'valid'},
    qualityAdjustments:{weakRegimePenalty:false, lowControlSetup:false, tooWideForQualityPullback:false},
    warningState:{reasons:[]},
    planUiState:{state:'valid', label:'Plan valid'},
    setupUiState:{state:'monitor'},
    avoidSubtype:'',
    deadCheck:{dead:false, reason:'', reasonCode:'', terminalTriggerUsed:false},
    emojiPresentation:{primaryState:'entry', primaryEmoji:'\uD83D\uDE80', primaryLabel:'Entry', badgeClass:'ready', modifiers:[]}
  });
  if(currentMissedLegacyContract.blockerCode !== 'missed_setup'){
    throw new Error('Current missed scanner-estimate state must still drive action-state copy missed handling.');
  }
  if(sandbox.nextActionTextForRecord(currentMissedLiveRecord) !== 'Missed - do not chase'){
    throw new Error('Current missed scanner-estimate state must still drive nextActionTextForRecord().');
  }

  const staleTargetTooCloseRecord = {
    ticker:'STALE_TARGET_CLOSE',
    plan:{
      entry:100,
      stop:95,
      firstTarget:120,
      source:'scanner_estimate',
      firstTargetTooClose:true,
      blockedReason:'',
      blockedReasonCode:''
    },
    marketData:{price:100, currency:'USD'},
    setup:{},
    watchlist:{debug:{}, inWatchlist:true}
  };
  sandbox.analysisDerivedStatesFromRecord = () => ({
    structureState:'strong',
    trendState:'uptrend',
    bounceState:'attempt',
    pullbackZone:'near_20ma',
    stabilisationState:'none',
    volumeState:'supportive',
    priceabilityState:'priceable'
  });
  sandbox.resolverSeedVerdictForRecord = () => 'Entry';
  const staleTargetDisplayedPlan = sandbox.deriveCurrentPlanState(100, 95, 120, 'USD');
  if(staleTargetDisplayedPlan.firstTargetTooClose === true){
    throw new Error('Stale target-too-close regression requires current recomputed plan math to clear the target-too-close flag.');
  }
  const staleTargetContract = sandbox.resolveFinalStateContract(staleTargetTooCloseRecord, {
    finalVerdict:'Entry',
    derivedStates:sandbox.analysisDerivedStatesFromRecord(staleTargetTooCloseRecord),
    effectivePlan:{entry:100, stop:95, firstTarget:120, source:'scanner_estimate'},
    displayedPlan:staleTargetDisplayedPlan
  });
  if(staleTargetContract.contractDiagnostics && staleTargetContract.contractDiagnostics.structuredBlockersPresent === true){
    throw new Error('Persisted firstTargetTooClose must not count as a current structured blocker when recomputed plan math clears it.');
  }
  const staleTargetLiveVerdict = sandbox.resolveGlobalVerdict(staleTargetTooCloseRecord);
  if(staleTargetLiveVerdict.contractDiagnostics && staleTargetLiveVerdict.contractDiagnostics.structuredBlockersPresent === true){
    throw new Error('resolveGlobalVerdict wrapper must ignore stale persisted firstTargetTooClose when current recomputed plan math clears it.');
  }
  const staleTargetAuthority = sandbox.resolveScannerEstimatePlanAuthority(staleTargetTooCloseRecord, {
    allow_plan:true,
    priceability_state:'priceable',
    final_verdict:'entry'
  }, staleTargetDisplayedPlan);
  if(staleTargetAuthority.reasonCode === 'target_too_close'){
    throw new Error('Stale persisted firstTargetTooClose must not create target_too_close authority when current recomputed plan math clears it.');
  }
  const staleTargetPlanCheckRecord = {
    ticker:'STALE_TARGET_CLOSE_PLAN_CHECK',
    plan:{
      entry:100,
      stop:95,
      firstTarget:120,
      source:'scanner_estimate',
      firstTargetTooClose:true,
      planValidationState:'stale'
    },
    marketData:{price:100, currency:'USD'},
    setup:{}
  };
  const staleTargetPlanCheckDisplayedPlan = sandbox.deriveCurrentPlanState(100, 95, 120, 'USD');
  const staleTargetPlanCheckState = sandbox.planCheckStateForRecord(staleTargetPlanCheckRecord, {
    effectivePlan:{entry:100, stop:95, firstTarget:120, source:'scanner_estimate'},
    displayedPlan:staleTargetPlanCheckDisplayedPlan
  });
  if(staleTargetPlanCheckState === 'stale' || staleTargetPlanCheckState === 'needs_replan'){
    throw new Error('planCheckStateForRecord must not preserve stale/needs_replan from persisted firstTargetTooClose when current recomputed plan math clears it.');
  }

  const targetTooCloseRecord = {
    ticker:'REALBLOCK1',
    plan:{entry:100, stop:95, firstTarget:101, source:'scanner_estimate', firstTargetTooClose:true, blockedReason:'', blockedReasonCode:''},
    marketData:{price:100, currency:'USD'},
    setup:{}
  };
  const targetTooClosePlan = sandbox.deriveCurrentPlanState(100, 95, 101, 'USD');
  if(targetTooClosePlan.firstTargetTooClose !== true){
    throw new Error('Current recomputed target-too-close regression requires displayed plan math to set firstTargetTooClose.');
  }
  const targetTooCloseAuthority = sandbox.resolveScannerEstimatePlanAuthority(targetTooCloseRecord, {
    allow_plan:false,
    priceability_state:'priceable',
    final_verdict:'watch'
  }, targetTooClosePlan);
  if(targetTooCloseAuthority.reasonCode !== 'target_too_close'){
    throw new Error('Structured target_too_close blocker must remain authoritative.');
  }
  const targetTooCloseContract = sandbox.resolveFinalStateContract(targetTooCloseRecord, {
    finalVerdict:'Entry',
    derivedStates:sandbox.analysisDerivedStatesFromRecord(targetTooCloseRecord),
    effectivePlan:{entry:100, stop:95, firstTarget:101, source:'scanner_estimate'},
    displayedPlan:targetTooClosePlan
  });
  if(!targetTooCloseContract.contractDiagnostics || targetTooCloseContract.contractDiagnostics.structuredBlockersPresent !== true){
    throw new Error('Current recomputed firstTargetTooClose must still count as a structured blocker in resolveFinalStateContract.');
  }
  const targetTooClosePlanCheckRecord = {
    ticker:'REALBLOCK1C',
    plan:{entry:100, stop:95, firstTarget:101, source:'scanner_estimate', firstTargetTooClose:false, planValidationState:'stale'},
    marketData:{price:100, currency:'USD'},
    setup:{}
  };
  const targetTooClosePlanCheckState = sandbox.planCheckStateForRecord(targetTooClosePlanCheckRecord, {
    effectivePlan:{entry:100, stop:95, firstTarget:101, source:'scanner_estimate'},
    displayedPlan:targetTooClosePlan
  });
  if(targetTooClosePlanCheckState !== 'stale'){
    throw new Error('Current recomputed firstTargetTooClose must still preserve stale/needs_replan style blocking in planCheckStateForRecord.');
  }

  const persistedAndCurrentTargetTooCloseRecord = {
    ticker:'REALBLOCK1B',
    plan:{entry:100, stop:95, firstTarget:101, source:'scanner_estimate', firstTargetTooClose:true, blockedReason:'', blockedReasonCode:''},
    marketData:{price:100, currency:'USD'},
    setup:{}
  };
  const persistedAndCurrentTargetTooClosePlan = sandbox.deriveCurrentPlanState(100, 95, 101, 'USD');
  const persistedAndCurrentTargetTooCloseAuthority = sandbox.resolveScannerEstimatePlanAuthority(persistedAndCurrentTargetTooCloseRecord, {
    allow_plan:false,
    priceability_state:'priceable',
    final_verdict:'watch'
  }, persistedAndCurrentTargetTooClosePlan);
  if(persistedAndCurrentTargetTooCloseAuthority.reasonCode !== 'target_too_close'){
    throw new Error('Persisted true plus current true target-too-close must still remain authoritative.');
  }

  const missedRecord = {
    ticker:'REALBLOCK2',
    plan:{entry:100, stop:95, firstTarget:120, source:'scanner_estimate', blockedReason:'', blockedReasonCode:''},
    marketData:{price:100, currency:'USD'}
  };
  const missedPlan = sandbox.deriveCurrentPlanState(100, 95, 120, 'USD');
  missedPlan.planValidationState = 'missed';
  const missedAuthority = sandbox.resolveScannerEstimatePlanAuthority(missedRecord, {
    allow_plan:false,
    priceability_state:'priceable',
    final_verdict:'watch'
  }, missedPlan);
  if(missedAuthority.reasonCode !== 'missed'){
    throw new Error('Structured missed blocker must remain authoritative.');
  }

  const invalidatedRecord = {
    ticker:'REALBLOCK3',
    plan:{entry:100, stop:95, firstTarget:120, source:'scanner_estimate', blockedReason:'', blockedReasonCode:''},
    marketData:{price:100, currency:'USD'}
  };
  const invalidatedPlan = sandbox.deriveCurrentPlanState(100, 95, 120, 'USD');
  invalidatedPlan.planValidationState = 'invalidated';
  const invalidatedAuthority = sandbox.resolveScannerEstimatePlanAuthority(invalidatedRecord, {
    allow_plan:false,
    priceability_state:'priceable',
    final_verdict:'watch'
  }, invalidatedPlan);
  if(invalidatedAuthority.reasonCode !== 'invalidated'){
    throw new Error('Structured invalidated blocker must remain authoritative.');
  }

  sandbox.analysisDerivedStatesFromRecord = () => ({
    structureState:'strong',
    trendState:'uptrend',
    bounceState:'confirmed',
    pullbackZone:'near_20ma',
    stabilisationState:'clear',
    volumeState:'supportive'
  });
  const stopBreachRecord = {
    ticker:'REALBLOCK4',
    plan:{entry:100, stop:95, firstTarget:120, source:'scanner_estimate', blockedReason:'', blockedReasonCode:''},
    marketData:{price:94, currency:'USD'}
  };
  const stopBreachPlan = sandbox.deriveCurrentPlanState(100, 95, 120, 'USD');
  const stopBreachAuthority = sandbox.resolveScannerEstimatePlanAuthority(stopBreachRecord, {
    allow_plan:false,
    priceability_state:'priceable',
    final_verdict:'watch',
    explicit_invalidation_reason_code:'stop_breach'
  }, stopBreachPlan);
  if(!['invalidated','broken_structure'].includes(stopBreachAuthority.reasonCode)){
    throw new Error('Authoritative stop-breach blocker must remain active.');
  }

  sandbox.analysisDerivedStatesFromRecord = () => ({
    structureState:'broken',
    trendState:'broken',
    bounceState:'none',
    pullbackZone:'near_20ma',
    stabilisationState:'none',
    volumeState:'weak'
  });
  const brokenStructureRecord = {
    ticker:'REALBLOCK5',
    plan:{entry:100, stop:95, firstTarget:120, source:'scanner_estimate', blockedReason:'', blockedReasonCode:''},
    marketData:{price:100, currency:'USD'}
  };
  const brokenStructurePlan = sandbox.deriveCurrentPlanState(100, 95, 120, 'USD');
  const brokenStructureAuthority = sandbox.resolveScannerEstimatePlanAuthority(brokenStructureRecord, {
    allow_plan:false,
    priceability_state:'priceable',
    final_verdict:'watch',
    explicit_invalidation_reason_code:'broken_structure'
  }, brokenStructurePlan);
  if(!['invalidated','broken_structure'].includes(brokenStructureAuthority.reasonCode)){
    throw new Error('Broken-structure blocker must remain authoritative.');
  }

  const addTimeSoftDowngradeRecord = {
    ticker:'ADDTIMEENTRY',
    plan:{
      entry:110.27,
      stop:102.29,
      firstTarget:136.19,
      source:'scanner_estimate',
      status:'valid',
      tradeability:'tradable',
      riskStatus:'fits_risk',
      blockedReason:'',
      blockedReasonCode:''
    },
    marketData:{price:110.27, currency:'USD'},
    setup:{},
    watchlist:{debug:{}, inWatchlist:true}
  };
  sandbox.analysisDerivedStatesFromRecord = () => ({
    structureState:'strong',
    trendState:'uptrend',
    bounceState:'attempt',
    pullbackZone:'near_20ma',
    stabilisationState:'none',
    volumeState:'supportive',
    priceabilityState:'priceable'
  });
  const addTimeSoftDowngradePlan = sandbox.deriveCurrentPlanState(110.27, 102.29, 136.19, 'USD');
  const addTimeSoftDowngradeVerdict = {
    allow_plan:false,
    allow_watchlist:true,
    final_verdict:'watch',
    priceability_state:'priceable',
    plan_status:'valid',
    reason:'Conditions are not strong enough for active focus.',
    downgrade_reason:'Conditions are not strong enough for active focus.'
  };
  const suppressSoftAddDowngrade = sandbox.shouldSuppressWatchlistAddSoftDowngrade(addTimeSoftDowngradeRecord, {
    state:'entry',
    downgradeReason:'Conditions are not strong enough for active focus.'
  }, {
    source:'watchlist_add',
    globalVerdict:addTimeSoftDowngradeVerdict,
    structureGate:sandbox.watchlistRefreshStructureGate(addTimeSoftDowngradeRecord),
    displayedPlan:addTimeSoftDowngradePlan
  });
  if(suppressSoftAddDowngrade !== true){
    throw new Error('Add-to-watchlist lifecycle must suppress generic soft downgrade copy for a fresh Entry/priceable setup with no hard structured blocker.');
  }
  const suppressSoftAutoRecomputeDowngrade = sandbox.shouldSuppressWatchlistAddSoftDowngrade(addTimeSoftDowngradeRecord, {
    state:'entry',
    downgradeReason:'Conditions are not strong enough for active focus.'
  }, {
    source:'auto_recompute',
    globalVerdict:addTimeSoftDowngradeVerdict,
    structureGate:sandbox.watchlistRefreshStructureGate(addTimeSoftDowngradeRecord),
    displayedPlan:addTimeSoftDowngradePlan
  });
  if(suppressSoftAutoRecomputeDowngrade !== true){
    throw new Error('Immediate post-add auto_recompute must also suppress generic soft downgrade copy for a fresh Entry/priceable setup with no hard structured blocker.');
  }

  const addTimeTargetTooClosePlan = sandbox.deriveCurrentPlanState(100, 95, 101, 'USD');
  const suppressTargetTooCloseDowngrade = sandbox.shouldSuppressWatchlistAddSoftDowngrade(targetTooCloseRecord, {
    state:'entry',
    downgradeReason:'Conditions are not strong enough for active focus.'
  }, {
    source:'watchlist_add',
    globalVerdict:{
      allow_plan:false,
      allow_watchlist:true,
      final_verdict:'watch',
      priceability_state:'priceable',
      plan_status:'valid',
      reason:'Conditions are not strong enough for active focus.',
      downgrade_reason:'Conditions are not strong enough for active focus.'
    },
    structureGate:sandbox.watchlistRefreshStructureGate(targetTooCloseRecord),
    displayedPlan:addTimeTargetTooClosePlan
  });
  if(suppressTargetTooCloseDowngrade === true){
    throw new Error('Add-to-watchlist lifecycle must keep current target_too_close blockers authoritative.');
  }

  const suppressInvalidatedDowngrade = sandbox.shouldSuppressWatchlistAddSoftDowngrade(currentInvalidatedLiveRecord, {
    state:'entry',
    downgradeReason:'Conditions are not strong enough for active focus.'
  }, {
    source:'watchlist_add',
    globalVerdict:{
      allow_plan:false,
      allow_watchlist:true,
      final_verdict:'watch',
      priceability_state:'priceable',
      plan_status:'valid',
      explicit_invalidation_reason_code:'broken_structure',
      reason:'Conditions are not strong enough for active focus.',
      downgrade_reason:'Conditions are not strong enough for active focus.'
    },
    structureGate:sandbox.watchlistRefreshStructureGate(currentInvalidatedLiveRecord),
    displayedPlan:currentInvalidatedDisplayedPlan
  });
  if(suppressInvalidatedDowngrade === true){
    throw new Error('Add-to-watchlist lifecycle must keep current invalidated/broken-structure blockers authoritative.');
  }

  const suppressStopBreachDowngrade = sandbox.shouldSuppressWatchlistAddSoftDowngrade(stopBreachRecord, {
    state:'entry',
    downgradeReason:'Conditions are not strong enough for active focus.'
  }, {
    source:'watchlist_add',
    globalVerdict:{
      allow_plan:false,
      allow_watchlist:true,
      final_verdict:'watch',
      priceability_state:'priceable',
      plan_status:'valid',
      explicit_invalidation_reason_code:'stop_breach',
      reason:'Conditions are not strong enough for active focus.',
      downgrade_reason:'Conditions are not strong enough for active focus.'
    },
    structureGate:sandbox.watchlistRefreshStructureGate(stopBreachRecord),
    displayedPlan:stopBreachPlan
  });
  if(suppressStopBreachDowngrade === true){
    throw new Error('Add-to-watchlist lifecycle must keep stop-breach blockers authoritative.');
  }

  const targetHistory = [
    {date:'2026-06-24', open:101, high:102, low:100, close:101.8, volume:1200000},
    {date:'2026-06-23', open:100, high:101, low:99, close:100.7, volume:1100000},
    {date:'2026-06-20', open:99.5, high:100.5, low:98.8, close:99.9, volume:1000000},
    {date:'2026-06-19', open:98.7, high:99.4, low:97.5, close:98.5, volume:980000},
    {date:'2026-06-18', open:98.4, high:98.9, low:96.8, close:97.4, volume:1050000},
    {date:'2026-06-17', open:100.8, high:104.6, low:100.2, close:103.8, volume:1300000},
    {date:'2026-06-16', open:101.2, high:103.9, low:100.6, close:102.4, volume:1250000},
    {date:'2026-06-13', open:100.6, high:102.1, low:99.8, close:101.1, volume:1180000}
  ];
  const targetData = {
    price:101.8,
    sma20:100.4,
    sma50:99.2,
    sma200:92,
    perf1w:0.8,
    perf3m:14,
    volume:1200000,
    avgVolume30d:1050000,
    history:targetHistory
  };
  const estimatedPlan = sandbox.deriveTradePlan(targetData, '20MA');
  if(Math.abs(Number(estimatedPlan.target) - 104.6) > 0.01){
    throw new Error(`Estimated first target should anchor to recent swing resistance at 104.60, got ${estimatedPlan.target}.`);
  }
  if(!(Number(estimatedPlan.target) > Number(estimatedPlan.entry))){
    throw new Error('Estimated first target must stay above entry when anchored to recent swing resistance.');
  }

  const dualResistanceHistory = [
    {date:'2026-06-24', open:100.6, high:101.2, low:100.1, close:100.9, volume:1200000},
    {date:'2026-06-23', open:100.2, high:100.8, low:99.7, close:100.4, volume:1100000},
    {date:'2026-06-20', open:100.7, high:102.4, low:100.1, close:101.8, volume:1260000},
    {date:'2026-06-19', open:99.8, high:100.4, low:99.1, close:99.9, volume:1080000},
    {date:'2026-06-18', open:99.1, high:99.9, low:98.4, close:99, volume:1060000},
    {date:'2026-06-17', open:98.8, high:99.4, low:97.9, close:98.3, volume:1040000},
    {date:'2026-06-16', open:102.2, high:105.8, low:101.6, close:104.9, volume:1300000},
    {date:'2026-06-13', open:101.4, high:103.1, low:100.9, close:102.5, volume:1220000}
  ];
  const dualResistanceData = {
    price:100.9,
    sma20:100.1,
    sma50:98.7,
    sma200:92,
    perf1w:0.4,
    perf3m:11,
    volume:1200000,
    avgVolume30d:1050000,
    history:dualResistanceHistory
  };
  const dualResistanceProfile = sandbox.targetResistanceProfile(dualResistanceData, '20MA', {
    entry:100,
    riskPerShare:2,
    checks:sandbox.buildScannerChecks(dualResistanceData)
  });
  if(Math.abs(Number(dualResistanceProfile.realisticTarget) - 102.4) > 0.01){
    throw new Error(`Nearest resistance must remain the first realistic target. Got ${dualResistanceProfile.realisticTarget}.`);
  }
  if(!(Number(dualResistanceProfile.realisticRr) < 1.5)){
    throw new Error('Nearest resistance should preserve weak RR when it sits below the minimum meaningful target.');
  }
  if(Math.abs(Number(dualResistanceProfile.extendedTarget) - 105.8) > 0.01){
    throw new Error(`Farther resistance should only be exposed as extended context. Got ${dualResistanceProfile.extendedTarget}.`);
  }
  const dualResistancePlan = sandbox.deriveTradePlan(dualResistanceData, '20MA');
  if(Math.abs(Number(dualResistancePlan.target) - 102.4) > 0.01){
    throw new Error(`Derived plan must keep the nearest resistance as the first target. Got ${dualResistancePlan.target}.`);
  }
  if(!(Number(dualResistancePlan.rr) < 1.5)){
    throw new Error('Derived plan must preserve weak RR when the nearest resistance is too close.');
  }

  const optimisticPlanRecord = {
    ticker:'TARGET',
    plan:{entry:100, stop:98, firstTarget:110, source:'manual'},
    review:{manualReview:null},
    scan:{resolvedVerdict:'Watch'},
    meta:{marketStatus:'S&P above 50 MA'},
    marketData:{
      ...targetData,
      price:101,
      currency:'USD'
    },
    derivedStates:{
      structureState:'intact',
      trendState:'uptrend',
      bounceState:'attempt',
      pullbackZone:'near_20ma',
      stabilisationState:'early',
      volumeState:'neutral'
    }
  };
  const optimisticPlanState = sandbox.deriveCurrentPlanState(100, 98, 110, 'USD');
  const optimisticPlanRealism = sandbox.evaluatePlanRealism(optimisticPlanRecord, {
    displayedPlan:optimisticPlanState,
    derivedStates:optimisticPlanRecord.derivedStates
  });
  if(optimisticPlanRealism.optimistic_target_flag !== true || optimisticPlanRealism.rr_realism_label !== 'Optimistic'){
    throw new Error('Target beyond nearby resistance on an early repair setup must be flagged as optimistic.');
  }
  if(!(Number(optimisticPlanRealism.credible_rr) < Number(optimisticPlanRealism.raw_rr))){
    throw new Error('Credible RR must be clipped below raw RR when the first target stretches beyond local resistance.');
  }

  const validPricesWithoutConfirmation = {
    structure_state:'intact',
    trend_state:'uptrend',
    bounce_state:'none',
    stabilisation_state:'none',
    pullback_zone:'near_50ma',
    market_regime:'supportive',
    volume_state:'normal',
    plan_visible:true,
    plan_status:'valid',
    plan_blocked:false,
    has_entry:true,
    has_stop:true,
    entry:100,
    stop:95,
    target:115,
    rr:3,
    credible_rr:3,
    tradeability:'tradable',
    pullback_valid:true,
    entry_trigger_hit:false,
    stop_distance_too_wide:false,
    capital_fit:'acceptable',
    affordability:'affordable',
    price_below_50ma:false,
    price_below_200ma:false,
    ma50_below_200ma:false,
    terminal_avoid_applied:false
  };
  const caseCEntryGate = resolverCore.canPromoteToEntry(validPricesWithoutConfirmation);
  const caseCNearEntryGate = resolverCore.canPromoteToNearEntry(validPricesWithoutConfirmation);
  const caseCGuarded = resolverCore.applyPromotionGuards({final_verdict:'watch', reason:''}, validPricesWithoutConfirmation);
  if(caseCEntryGate.pass === true || caseCNearEntryGate.pass === true || caseCGuarded.final_verdict === 'entry' || caseCGuarded.final_verdict === 'near_entry'){
    throw new Error('Valid manual prices alone must not promote without bounce/stabilisation confirmation gates.');
  }

  const riskOnlyProvisionalNearEntry = resolverCore.canPromoteToNearEntry({
    structure_state:'developing_clean',
    trend_state:'acceptable',
    bounce_state:'attempt',
    stabilisation_state:'early',
    pullback_zone:'near_50ma',
    market_regime:'supportive',
    volume_state:'normal',
    plan_visible:true,
    plan_status:'valid',
    plan_blocked:false,
    has_entry:true,
    has_stop:true,
    entry:178.75,
    stop:176.07,
    target:193.32,
    rr:5.44,
    credible_rr:2.5,
    provisional_entry:178.75,
    provisional_stop:176.07,
    provisional_target:193.32,
    provisional_rr:5.44,
    tradeability:'risk_only',
    pullback_valid:true,
    entry_trigger_hit:false,
    stop_distance_too_wide:false,
    capital_fit:'unknown',
    affordability:'',
    price_above_50ma:true,
    price_above_200ma:true,
    ma50_above_200ma:true,
    reclaims_level:true,
    candle_evidence_reclaim_range_meaningful:true,
    candle_evidence_reclaimed_prior_day_high:true,
    terminal_avoid_applied:false
  });
  if(riskOnlyProvisionalNearEntry.pass !== true){
    throw new Error('Risk-only provisional scanner plans with valid math must still qualify for Near Entry when capital is not explicitly blocked.');
  }
  if(riskOnlyProvisionalNearEntry.checks.tradeability_ok !== true || riskOnlyProvisionalNearEntry.checks.unpriceable_block !== false){
    throw new Error('Risk-only tradeability must not be treated as an unpriceable plan blocker for provisional Near Entry gating.');
  }
  const below50ProvisionalNearEntry = resolverCore.canPromoteToNearEntry({
    structure_state:'developing_clean',
    trend_state:'acceptable',
    bounce_state:'attempt',
    stabilisation_state:'early',
    pullback_zone:'near_50ma',
    market_regime:'supportive',
    volume_state:'normal',
    plan_visible:true,
    plan_status:'valid',
    plan_blocked:false,
    has_entry:true,
    has_stop:true,
    entry:178.75,
    stop:176.07,
    target:193.32,
    rr:5.44,
    credible_rr:2.5,
    provisional_entry:178.75,
    provisional_stop:176.07,
    provisional_target:193.32,
    provisional_rr:5.44,
    tradeability:'risk_only',
    pullback_valid:true,
    entry_trigger_hit:false,
    stop_distance_too_wide:false,
    capital_fit:'unknown',
    affordability:'',
    price_below_50ma:true,
    price_above_200ma:true,
    ma50_above_200ma:true,
    reclaims_level:true,
    candle_evidence_reclaim_range_meaningful:true,
    terminal_avoid_applied:false
  });
  if(below50ProvisionalNearEntry.pass !== false || below50ProvisionalNearEntry.checks.below_50_without_reclaim !== true){
    throw new Error('Near Entry must now fail when price remains below the 50MA.');
  }
  const acceptableRrNearEntry = resolverCore.canPromoteToNearEntry({
    structure_state:'intact',
    trend_state:'strong',
    bounce_state:'attempt',
    stabilisation_state:'early',
    pullback_zone:'near_20ma',
    market_regime:'supportive',
    volume_state:'normal',
    plan_visible:true,
    plan_status:'valid',
    plan_blocked:false,
    has_entry:true,
    has_stop:true,
    entry:161.74,
    stop:157.2,
    target:169.09,
    rr:1.62,
    credible_rr:1.62,
    provisional_entry:161.74,
    provisional_stop:157.2,
    provisional_target:169.09,
    provisional_rr:1.62,
    tradeability:'tradable',
    pullback_valid:true,
    entry_trigger_hit:false,
    stop_distance_too_wide:false,
    capital_fit:'acceptable',
    affordability:'acceptable',
    price_above_50ma:true,
    price_above_200ma:true,
    ma50_above_200ma:true,
    reclaims_level:true,
    candle_evidence_reclaim_range_meaningful:true,
    candle_evidence_reclaimed_prior_day_high:true,
    terminal_avoid_applied:false
  });
  if(acceptableRrNearEntry.pass !== true || acceptableRrNearEntry.checks.rr_priceable !== true){
    throw new Error('Constructive provisional repairs with acceptable first-target RR must remain eligible for Near Entry.');
  }
  const bounceAttemptPromotionTrace = sandbox.buildPromotionGateTrace({
    structureState:'intact',
    pullbackState:'near_20ma',
    stabilisationState:'early',
    bounceState:'attempt',
    planStateKey:'valid',
    hasPriceablePlanValues:true,
    hasClearInvalidationLevel:true,
    hasEntry:true,
    hasStop:true,
    hasTarget:true,
    riskTooWide:false,
    stopDistanceTooWide:false,
    hardBlockers:false,
    tradeStructureClearEnough:true,
    rr:2.1,
    priceBelow50MA:false,
    reclaimAttempt:false
  });
  if(
    bounceAttemptPromotionTrace.promotion_watch_to_near_allowed !== true
    || bounceAttemptPromotionTrace.gate_bounce_ok_for_near !== true
    || bounceAttemptPromotionTrace.gate_bounce_confirmed_for_entry !== false
    || bounceAttemptPromotionTrace.promotion_near_to_entry_allowed === true
  ){
    throw new Error('Intact near-20MA bounce attempts with a priced plan must promote to Near Entry without becoming Entry.');
  }

  const noBouncePromotionTrace = sandbox.buildPromotionGateTrace({
    structureState:'intact',
    pullbackState:'near_20ma',
    stabilisationState:'early',
    bounceState:'none',
    planStateKey:'valid',
    hasPriceablePlanValues:true,
    hasClearInvalidationLevel:true,
    hasEntry:true,
    hasStop:true,
    hasTarget:true,
    riskTooWide:false,
    stopDistanceTooWide:false,
    hardBlockers:false,
    tradeStructureClearEnough:true,
    rr:2.1,
    priceBelow50MA:false,
    reclaimAttempt:false
  });
  if(noBouncePromotionTrace.promotion_watch_to_near_allowed === true || noBouncePromotionTrace.gate_bounce_ok_for_near === true){
    throw new Error('Near-20MA pullbacks without any bounce attempt must remain Watch.');
  }

  const carrLikePromotionTrace = sandbox.buildPromotionGateTrace({
    structureState:'strong',
    pullbackState:'near_20ma',
    rawPullbackState:'none',
    canonicalPullbackState:'near_20ma',
    setupLocationState:'off_level',
    stabilisationState:'none',
    bounceState:'attempt',
    planStateKey:'valid',
    hasPriceablePlanValues:true,
    hasClearInvalidationLevel:true,
    hasEntry:true,
    hasStop:true,
    hasTarget:true,
    riskTooWide:false,
    stopDistanceTooWide:false,
    hardBlockers:false,
    tradeStructureClearEnough:true,
    rr:1.2,
    priceBelow50MA:false,
    reclaimAttempt:false,
    pullbackValid:true
  });
  if(carrLikePromotionTrace.gate_pullback_zone_ok_for_near !== true){
    throw new Error('CARR-like reconciled pullbacks must satisfy the Near Entry pullback gate even when raw pullback_zone is none.');
  }
  if(carrLikePromotionTrace.audit_pullback_zone !== 'near_20ma' || carrLikePromotionTrace.audit_pullback_zone_raw !== 'none'){
    throw new Error('Promotion diagnostics must preserve both canonical and raw pullback states for CARR-like reconciliations.');
  }

  const offLevelPromotionTrace = sandbox.buildPromotionGateTrace({
    structureState:'strong',
    pullbackState:'none',
    rawPullbackState:'none',
    canonicalPullbackState:'none',
    setupLocationState:'off_level',
    stabilisationState:'none',
    bounceState:'none',
    planStateKey:'valid',
    hasPriceablePlanValues:true,
    hasClearInvalidationLevel:true,
    hasEntry:true,
    hasStop:true,
    hasTarget:true,
    riskTooWide:false,
    stopDistanceTooWide:false,
    hardBlockers:false,
    tradeStructureClearEnough:true,
    rr:2.1,
    priceBelow50MA:false,
    reclaimAttempt:false,
    pullbackValid:false
  });
  if(offLevelPromotionTrace.gate_pullback_zone_ok_for_near === true){
    throw new Error('Genuinely off-level charts without support interaction must still fail the pullback gate.');
  }

  const recent50maDefenceTrace = sandbox.buildPromotionGateTrace({
    structureState:'intact',
    pullbackState:'near_50ma',
    rawPullbackState:'none',
    canonicalPullbackState:'near_50ma',
    setupLocationState:'off_level',
    stabilisationState:'early',
    bounceState:'attempt',
    planStateKey:'valid',
    hasPriceablePlanValues:true,
    hasClearInvalidationLevel:true,
    hasEntry:true,
    hasStop:true,
    hasTarget:true,
    riskTooWide:false,
    stopDistanceTooWide:false,
    hardBlockers:false,
    tradeStructureClearEnough:true,
    rr:1.9,
    priceBelow50MA:false,
    reclaimAttempt:false,
    pullbackValid:true
  });
  if(recent50maDefenceTrace.gate_pullback_zone_ok_for_near !== true || recent50maDefenceTrace.audit_pullback_zone !== 'near_50ma'){
    throw new Error('Recent 50MA defences must keep canonical pullback authority when the close has moved off the raw zone.');
  }

  const confirmedEntryPromotionTrace = sandbox.buildPromotionGateTrace({
    structureState:'intact',
    pullbackState:'near_20ma',
    stabilisationState:'clear',
    bounceState:'confirmed',
    planStateKey:'valid',
    hasPriceablePlanValues:true,
    hasClearInvalidationLevel:true,
    hasEntry:true,
    hasStop:true,
    hasTarget:true,
    riskTooWide:false,
    stopDistanceTooWide:false,
    hardBlockers:false,
    tradeStructureClearEnough:true,
    rr:2.3,
    breaksLocalHigh:true,
    priceBelow50MA:false,
    reclaimAttempt:true
  });
  if(confirmedEntryPromotionTrace.promotion_near_to_entry_allowed !== true){
    throw new Error('Confirmed bounce with trigger and valid priced plan must still promote to Entry.');
  }

  const weakStructurePromotionTrace = sandbox.buildPromotionGateTrace({
    structureState:'weak',
    pullbackState:'near_20ma',
    stabilisationState:'early',
    bounceState:'attempt',
    planStateKey:'valid',
    hasPriceablePlanValues:true,
    hasClearInvalidationLevel:true,
    hasEntry:true,
    hasStop:true,
    hasTarget:true,
    riskTooWide:false,
    stopDistanceTooWide:false,
    hardBlockers:false,
    tradeStructureClearEnough:true,
    rr:2.1,
    priceBelow50MA:false,
    reclaimAttempt:false
  });
  if(weakStructurePromotionTrace.promotion_watch_to_near_allowed === true || weakStructurePromotionTrace.gate_not_weakening_for_near === true){
    throw new Error('Weak or damaged structure must not promote to Near Entry just because a bounce attempt exists.');
  }

  const weakVolumeAttemptNearEntry = resolverCore.canPromoteToNearEntry({
    structure_state:'intact',
    trend_state:'strong',
    bounce_state:'attempt',
    stabilisation_state:'early',
    pullback_zone:'near_20ma',
    market_regime:'supportive',
    volume_state:'weak',
    plan_visible:true,
    plan_status:'valid',
    plan_blocked:false,
    has_entry:true,
    has_stop:true,
    entry:161.74,
    stop:157.2,
    target:169.09,
    rr:1.62,
    credible_rr:1.62,
    provisional_entry:161.74,
    provisional_stop:157.2,
    provisional_target:169.09,
    provisional_rr:1.62,
    tradeability:'tradable',
    pullback_valid:true,
    entry_trigger_hit:false,
    stop_distance_too_wide:false,
    capital_fit:'acceptable',
    affordability:'acceptable',
    price_above_50ma:true,
    price_above_200ma:true,
    ma50_above_200ma:true,
    reclaims_level:true,
    candle_evidence_reclaim_range_meaningful:true,
    candle_evidence_reclaimed_prior_day_high:true,
    terminal_avoid_applied:false
  });
  const weakVolumeAttemptEntry = resolverCore.canPromoteToEntry({
    structure_state:'intact',
    trend_state:'strong',
    bounce_state:'attempt',
    stabilisation_state:'early',
    pullback_zone:'near_20ma',
    market_regime:'supportive',
    volume_state:'weak',
    plan_visible:true,
    plan_status:'valid',
    plan_blocked:false,
    has_entry:true,
    has_stop:true,
    entry:161.74,
    stop:157.2,
    target:169.09,
    rr:1.62,
    credible_rr:1.62,
    provisional_entry:161.74,
    provisional_stop:157.2,
    provisional_target:169.09,
    provisional_rr:1.62,
    tradeability:'tradable',
    pullback_valid:true,
    entry_trigger_hit:false,
    stop_distance_too_wide:false,
    capital_fit:'acceptable',
    affordability:'acceptable',
    price_above_50ma:true,
    price_above_200ma:true,
    ma50_above_200ma:true,
    reclaims_level:true,
    candle_evidence_reclaim_range_meaningful:true,
    candle_evidence_reclaimed_prior_day_high:true,
    terminal_avoid_applied:false
  });
  if(weakVolumeAttemptNearEntry.pass !== true || weakVolumeAttemptEntry.pass === true){
    throw new Error('Weak volume may stay non-actionable, but it must not block Near Entry when buyers have started to respond.');
  }

  const frozenReplaySnapshotPath = path.join(os.tmpdir(), `pullback-playbook-frozen-replay-${Date.now()}.json`);
  fs.writeFileSync(frozenReplaySnapshotPath, JSON.stringify({
    snapshots:[
      {
        ticker:'FROZEN',
        price:100.9,
        previousClose:100.2,
        sma20:100.1,
        sma50:98.7,
        sma200:92,
        rsi14:52.4,
        volume:1200000,
        avgVolume30d:1050000,
        perf1w:0.4,
        perf1m:1.8,
        perf3m:11,
        perf6m:16,
        perfYtd:9,
        exchange:'NASDAQ',
        currency:'USD',
        history:dualResistanceHistory
      }
    ]
  }, null, 2));
  const frozenReplayRun = spawnSync(process.execPath, [
    path.join(root, 'scripts', 'replay-resolver-snapshot.js'),
    '--snapshot',
    frozenReplaySnapshotPath
  ], {
    cwd:root,
    encoding:'utf8'
  });
  try{
    if(frozenReplayRun.status !== 0){
      throw new Error(`Frozen replay snapshot path must run successfully, got: ${frozenReplayRun.stderr || frozenReplayRun.stdout}`);
    }
    const frozenReplayOutput = String(frozenReplayRun.stdout || '');
    if(!/\"ticker\":\s*\"FROZEN\"/.test(frozenReplayOutput) || !/\"simulatedLifecycleFromWatch\":/.test(frozenReplayOutput) || !/\"blockerCopy\":/.test(frozenReplayOutput)){
      throw new Error('Frozen replay snapshot output must include ticker, simulatedLifecycleFromWatch, and blockerCopy fields.');
    }
    if(!/FROZEN \|/.test(frozenReplayOutput)){
      throw new Error('Frozen replay snapshot output must include the compact per-ticker report.');
    }
  }finally{
    try{ fs.unlinkSync(frozenReplaySnapshotPath); }catch(_error){}
  }

  const replayModuleSource = fs.readFileSync(path.join(root, 'scripts', 'replay-resolver-snapshot.js'), 'utf8');
  const replaySandbox = {
    console,
    numericOrNull(value){
      if(value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) return null;
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    },
    fmtPrice(value){
      const numeric = replaySandbox.numericOrNull(value);
      return Number.isFinite(numeric) ? numeric.toFixed(2) : 'n/a';
    },
    fmtPct(value, digits = 2){
      const numeric = replaySandbox.numericOrNull(value);
      return Number.isFinite(numeric) ? `${(numeric * 100).toFixed(digits)}%` : 'n/a';
    },
    fmtRatio(value, digits = 2){
      const numeric = replaySandbox.numericOrNull(value);
      return Number.isFinite(numeric) ? `${numeric.toFixed(digits)}R` : 'n/a';
    },
    pctDistance(price, average){
      const safePrice = replaySandbox.numericOrNull(price);
      const safeAverage = replaySandbox.numericOrNull(average);
      if(!Number.isFinite(safePrice) || !Number.isFinite(safeAverage) || safeAverage === 0) return null;
      return (safePrice - safeAverage) / safeAverage;
    },
    safeNumber(value, digits = 4){
      const numeric = replaySandbox.numericOrNull(value);
      return Number.isFinite(numeric) ? Number(numeric.toFixed(digits)) : null;
    }
  };
  vm.createContext(replaySandbox);
  [
    'function structureContradictionForPromotionText',
    'function fallbackPromotionDiagnostic',
    'function buildReplayJsonResult',
    'function buildTickerReportLines'
  ].forEach(marker => {
    const functionName = marker.replace('function ', '');
    vm.runInContext(extractFunctionSource(replayModuleSource, functionName), replaySandbox, {filename:`scripts/replay-resolver-snapshot.js#${functionName}`});
  });
  if(replaySandbox.structureContradictionForPromotionText('Structure is not strong/intact/developing clean.', 'intact', 'alive') !== true){
    throw new Error('Replay promotion diagnostics must flag stale structure blockers on intact/alive setups.');
  }
  const repairedFallback = replaySandbox.fallbackPromotionDiagnostic({
    globalVerdict:{promotionBlockedReason:'Structure is not strong/intact/developing clean.', promotionBlockedBy:'gates'},
    replayBase:{record:{planRealism:{realistic_rr:1.2}, derivedStates:{bounceState:'attempt', priceabilityState:'provisional'}}},
    structureState:'intact',
    structureEligibility:'alive'
  });
  if(!/not priceable yet/i.test(String(repairedFallback.promotionBlocker || '')) || repairedFallback.failingGate !== 'bounce'){
    throw new Error('Replay promotion diagnostics must blame priceability/repair rather than structure on intact provisional setups.');
  }
  const weakRrFallback = replaySandbox.fallbackPromotionDiagnostic({
    globalVerdict:{promotionBlockedReason:'Structure is not strong/intact/developing clean.', promotionBlockedBy:'gates'},
    replayBase:{record:{planRealism:{realistic_rr:1.1}, derivedStates:{bounceState:'confirmed', priceabilityState:'priceable'}}},
    structureState:'strong',
    structureEligibility:'alive'
  });
  if(!/reward potential|resistance/i.test(String(weakRrFallback.promotionBlocker || '')) || weakRrFallback.failingGate !== 'rr'){
    throw new Error('Replay promotion diagnostics must blame nearby resistance/weak RR on strong alive setups.');
  }

  const promotedVerdict = 'entry';
  const promotedBucket = 'entry';
  const promotedDiagnosticsActive = !['entry', 'near_entry'].includes(promotedVerdict)
    && !['entry', 'near_entry'].includes(promotedBucket);
  const promotedBlockerCopy = promotedDiagnosticsActive ? 'Needs confirmation before promotion.' : '';
  const promotedBlockers = promotedDiagnosticsActive ? ['Bounce must be confirmed.'] : [];
  const promotedDiminishingReason = promotedVerdict === 'watch' && promotedBucket === 'diminishing'
    ? 'invalid_rr_promotion_blocked'
    : '';
  if(promotedDiagnosticsActive || promotedBlockerCopy || promotedBlockers.length || promotedDiminishingReason){
    throw new Error('Promoted replay results must not surface active blocker or diminishing diagnostics.');
  }

  const diminishedVerdict = 'watch';
  const diminishedBucket = 'diminishing';
  const diminishedReason = diminishedVerdict === 'watch' && diminishedBucket === 'diminishing'
    ? 'invalid_rr_promotion_blocked'
    : '';
  if(diminishedReason !== 'invalid_rr_promotion_blocked'){
    throw new Error('Watch/diminishing replay results must retain active diminishing diagnostics.');
  }

  const trowLikeReplay = {
    ticker:'TROWLIKE',
    proxy:{verdict:'Watch', reasons:['pullback near 20MA'], blockers:[], score:6},
    snapshot:{price:110.27, sma20:108.52, sma50:105.14, sma200:98.77, rsi14:56.2, volume:1200000, avgVolume30d:1000000},
    replay:{
      scannerCanonicalVerdict:'entry',
      scannerCanonicalVerdictLabel:'Entry',
      scannerVisualBucket:'entry',
      scannerSnapshotIncomplete:false,
      reviewCanonicalVerdict:'entry',
      reviewCanonicalVerdictLabel:'Entry',
      reviewVisualBucket:'entry',
      layerMutationReason:'',
      simulatedLifecycleFromWatch:'entry',
      structureState:'strong',
      structureEligibility:'alive',
      bounceState:'confirmed',
      stabilisationState:'confirmed',
      priceabilityState:'priceable',
      setupScore:9,
      realisticTarget:118.4,
      extendedTarget:123.9,
      realisticRr:2.1,
      targetStretchPct:0.02,
      targetCapReason:'Nearest resistance already supports the first target.',
      blockers:[],
      blockerSource:'',
      promotionDiagnosticsActive:false,
      promotionBlocker:'',
      failingGate:'',
      blockerCopy:'',
      watchToDiminishingReason:'',
      diminishingReasonActive:false,
      canonicalInputDiagnostics:null
    }
  };
  const trowLikeJson = replaySandbox.buildReplayJsonResult(trowLikeReplay);
  if(trowLikeJson.reviewCanonicalVerdict !== 'entry'){
    throw new Error('TROW-like replay JSON must keep canonical Entry primary.');
  }
  if(!trowLikeJson.rawShortlistSignal || trowLikeJson.rawShortlistSignal.verdict !== 'Watch'){
    throw new Error('TROW-like replay JSON must expose the raw shortlist signal separately.');
  }
  if(Object.prototype.hasOwnProperty.call(trowLikeJson, 'proxyVerdict')){
    throw new Error('Replay JSON must not expose an ambiguous top-level proxyVerdict field.');
  }
  const trowLikeLines = replaySandbox.buildTickerReportLines(trowLikeReplay).join('\n');
  if(!/TROWLIKE \| canonical Entry\/entry \| PROXY\/CANONICAL DIVERGENCE proxy=Watch/.test(trowLikeLines)){
    throw new Error('TROW-like replay text must headline canonical Entry and frame proxy disagreement as proxy/canonical divergence.');
  }
  if(!/raw shortlist signal: Watch \| score 6/.test(trowLikeLines)){
    throw new Error('TROW-like replay text must keep the proxy verdict on a diagnostic-only line.');
  }
  if(/MISMATCH proxy=Watch review=Entry/.test(trowLikeLines)){
    throw new Error('Replay text must not frame proxy disagreement as equivalent review state.');
  }

  const unpLikeReplay = {
    ticker:'UNPLIKE',
    proxy:{verdict:'Near Entry', reasons:['pullback near 50MA'], blockers:[], score:8},
    snapshot:{price:231.8, sma20:238.4, sma50:229.7, sma200:210.5, rsi14:49.1, volume:800000, avgVolume30d:950000},
    replay:{
      scannerCanonicalVerdict:'watch',
      scannerCanonicalVerdictLabel:'Watch',
      scannerVisualBucket:'monitor',
      scannerSnapshotIncomplete:false,
      reviewCanonicalVerdict:'watch',
      reviewCanonicalVerdictLabel:'Watch',
      reviewVisualBucket:'monitor',
      layerMutationReason:'',
      simulatedLifecycleFromWatch:'watch',
      structureState:'intact',
      structureEligibility:'alive',
      bounceState:'attempt',
      stabilisationState:'early',
      priceabilityState:'provisional',
      setupScore:5,
      realisticTarget:236.2,
      extendedTarget:245.5,
      realisticRr:1.1,
      targetStretchPct:0.05,
      targetCapReason:'Nearby resistance keeps first-target RR too weak.',
      blockers:['Bounce must be confirmed.'],
      blockerSource:'gates',
      promotionDiagnosticsActive:true,
      promotionBlocker:'Not priceable yet.',
      failingGate:'bounce',
      blockerCopy:'Needs confirmation before promotion.',
      watchToDiminishingReason:'',
      diminishingReasonActive:false,
      canonicalInputDiagnostics:null
    }
  };
  const unpLikeJson = replaySandbox.buildReplayJsonResult(unpLikeReplay);
  if(unpLikeJson.reviewCanonicalVerdict !== 'watch'){
    throw new Error('UNP-like replay JSON must keep canonical Watch primary.');
  }
  if(!unpLikeJson.rawShortlistSignal || unpLikeJson.rawShortlistSignal.verdict !== 'Near Entry'){
    throw new Error('UNP-like replay JSON must expose the raw shortlist signal separately.');
  }
  const unpLikeLines = replaySandbox.buildTickerReportLines(unpLikeReplay).join('\n');
  if(!/UNPLIKE \| canonical Watch\/monitor \| PROXY\/CANONICAL DIVERGENCE proxy=Near Entry/.test(unpLikeLines)){
    throw new Error('UNP-like replay text must headline canonical Watch and frame proxy disagreement as proxy/canonical divergence.');
  }

  const replayShapeSnapshotPath = path.join(os.tmpdir(), `pullback-playbook-replay-shape-${Date.now()}.json`);
  fs.writeFileSync(replayShapeSnapshotPath, JSON.stringify({
    snapshots:[
      {
        ticker:'SHAPETEST',
        price:100.9,
        previousClose:100.2,
        sma20:100.1,
        sma50:98.7,
        sma200:92,
        rsi14:52.4,
        volume:1200000,
        avgVolume30d:1050000,
        perf1w:0.4,
        perf1m:1.8,
        perf3m:11,
        perf6m:16,
        perfYtd:9,
        exchange:'NASDAQ',
        currency:'USD',
        history:dualResistanceHistory
      }
    ]
  }, null, 2));
  try{
    const replayShapeRun = spawnSync(process.execPath, [
      path.join(root, 'scripts', 'replay-resolver-snapshot.js'),
      '--snapshot',
      replayShapeSnapshotPath
    ], {
      cwd:root,
      encoding:'utf8'
    });
    if(replayShapeRun.status !== 0){
      throw new Error(`Replay JSON-shape regression must execute successfully, got: ${replayShapeRun.stderr || replayShapeRun.stdout}`);
    }
    const replayShapePayload = parseJsonPrefix(replayShapeRun.stdout);
    if(!replayShapePayload || !Array.isArray(replayShapePayload.results) || !replayShapePayload.results.length){
      throw new Error('Replay JSON-shape regression must parse executable replay output.');
    }
    const replayShapeResult = replayShapePayload.results[0];
    if(!Object.prototype.hasOwnProperty.call(replayShapeResult, 'reviewCanonicalVerdict')
      || !Object.prototype.hasOwnProperty.call(replayShapeResult, 'reviewVisualBucket')
      || !Object.prototype.hasOwnProperty.call(replayShapeResult, 'scannerCanonicalVerdict')){
      throw new Error('Replay JSON must expose canonical review/scanner fields as primary output.');
    }
    if(!replayShapeResult.rawShortlistSignal || typeof replayShapeResult.rawShortlistSignal !== 'object'){
      throw new Error('Replay JSON must expose proxy data only under rawShortlistSignal.');
    }
    if(Object.prototype.hasOwnProperty.call(replayShapeResult, 'proxyVerdict')){
      throw new Error('Replay JSON-shape regression must reject top-level proxyVerdict.');
    }
  }finally{
    try{ fs.unlinkSync(replayShapeSnapshotPath); }catch(_error){}
  }

  const shortlistWrapperPath = path.join(os.tmpdir(), `pullback-playbook-shortlist-shape-${Date.now()}.js`);
  fs.writeFileSync(shortlistWrapperPath, `
const Module = require('module');
const path = require('path');
const childProcess = require('child_process');
const root = ${JSON.stringify(root)};
const targetPath = path.join(root, 'scripts', 'debug-near-entry-shortlist.js');
const originalLoad = Module._load;
const originalSpawnSync = childProcess.spawnSync;
const stubSnapshot = {
  ticker:'MERGETEST',
  price:101,
  sma20:100,
  sma50:99,
  sma200:90,
  rsi14:58,
  volume:1000000,
  avgVolume30d:900000
};
const replayPayload = {
  ok:true,
  results:[{
    ticker:'MERGETEST',
    reviewCanonicalVerdict:'watch',
    reviewVisualBucket:'monitor',
    scannerCanonicalVerdict:'entry',
    rawShortlistSignal:{verdict:'Near Entry', reasons:['proxy'], blockers:[]},
    structureState:'intact',
    structureEligibility:'alive',
    bounceState:'attempt',
    stabilisationState:'early',
    priceabilityState:'provisional',
    realisticRr:1.1,
    setupScore:5,
    blockerCopy:'Needs confirmation before promotion.',
    blockers:['Bounce must be confirmed.'],
    promotionDiagnostics:{promotionBlocker:'Not priceable yet.', failingGate:'bounce'}
  }]
};
Module._load = function(request, parent, isMain){
  if(parent && parent.filename === targetPath && request.includes('scan-config')){
    return {
      getProviderConfig(providerId){ return {id:providerId || 'fmp'}; },
      normalizePlanId(providerId){ return providerId || 'fmp'; },
      normalizeProviderId(value){ return String(value || 'fmp'); }
    };
  }
  if(parent && parent.filename === targetPath && request.includes('/providers/fmp')){
    return {
      async getSnapshot(){ return stubSnapshot; }
    };
  }
  if(parent && parent.filename === targetPath && request.includes('/providers/marketdata')){
    return {
      async getSnapshot(){ return stubSnapshot; }
    };
  }
  return originalLoad.apply(this, arguments);
};
childProcess.spawnSync = function(command, args, options){
  const joined = Array.isArray(args) ? args.join(' ') : '';
  if(joined.includes('replay-resolver-snapshot.js')){
    return {status:0, stdout:JSON.stringify(replayPayload, null, 2), stderr:''};
  }
  return originalSpawnSync.apply(this, arguments);
};
process.env.FMP_API_KEY = process.env.FMP_API_KEY || 'stub';
process.argv = [process.execPath, targetPath, 'MERGETEST', '--provider=fmp'];
require(targetPath);
`);
  try{
    const shortlistRun = spawnSync(process.execPath, [shortlistWrapperPath], {
      cwd:root,
      encoding:'utf8'
    });
    if(shortlistRun.status !== 0){
      throw new Error(`Shortlist JSON-shape regression must execute successfully, got: ${shortlistRun.stderr || shortlistRun.stdout}`);
    }
    const shortlistPayload = parseJsonPrefix(shortlistRun.stdout);
    if(!shortlistPayload || !Array.isArray(shortlistPayload.rankedResults) || !shortlistPayload.rankedResults.length){
      throw new Error('Shortlist JSON-shape regression must parse executable shortlist output.');
    }
    const shortlistResult = shortlistPayload.rankedResults[0];
    if(shortlistResult.verdict !== 'Watch' || shortlistResult.visualBucket !== 'monitor'){
      throw new Error('Shortlist top-level verdict/visualBucket must come from replay canonical fields after merge.');
    }
    if(!shortlistResult.rawProxyContext || shortlistResult.rawProxyContext.verdict !== 'Near Entry'){
      throw new Error('Shortlist proxy verdict must remain under rawProxyContext only.');
    }
    if(Object.prototype.hasOwnProperty.call(shortlistResult, 'proxyVerdict')){
      throw new Error('Shortlist ranked result must not expose proxy verdict as a top-level field.');
    }
  }finally{
    try{ fs.unlinkSync(shortlistWrapperPath); }catch(_error){}
  }
}

function runTrackPresentationAuthorityAssertions(){
  const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const authoritySandbox = {
    console,
    normalizeTickerRecord(record){
      return record && typeof record === 'object' ? record : {};
    },
    normalizeGlobalVerdictKey(value){
      const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
      if(safe === 'nearentry') return 'near_entry';
      if(['entry','near_entry','watch','avoid','monitor'].includes(safe)) return safe === 'monitor' ? 'watch' : safe;
      return 'watch';
    },
    normalizeVisualBucketForPairing(value){
      const safe = String(value || '').trim().toLowerCase();
      if(['entry','near_entry','diminishing','avoid'].includes(safe)) return safe;
      return 'monitor';
    },
    globalVerdictLabel(value){
      const safe = String(value || '').trim().toLowerCase();
      if(safe === 'entry') return 'Entry';
      if(safe === 'near_entry') return 'Near Entry';
      if(safe === 'avoid') return 'Avoid';
      return 'Watch';
    }
  };
  vm.createContext(authoritySandbox);
  [
    'normalizeUiCopy',
    'sameVisibleCopy',
    'resolvePresentationTone',
    'buildSharedSetupNarrative',
    'terminalAvoidEvidenceForReviewCopy',
    'terminalAvoidCopyPattern',
    'provisionalPlanConfirmationCopy',
    'sanitizeNonTerminalPlanCopy',
    'resolveStructuredExplicitInvalidationAuthorityCode',
    'buildSharedReviewTrackPresentation',
    'resolveTrackCardVisibleModel'
  ].forEach(functionName => {
    vm.runInContext(extractFunctionSource(appSource, functionName), authoritySandbox, {filename:`app.js#${functionName}`});
  });
  const suppressedAvoidPresentation = authoritySandbox.buildSharedReviewTrackPresentation({
    ticker:'NVDA',
    watchlist:{inWatchlist:true, debug:{structural_alive_at_refresh:'true', baseVerdict:'watch', finalVerdict:'avoid'}},
  }, {
    surface:'track',
    sourceOfTruth:'watchlist_persisted_presentation',
    simplifiedState:{
      canonicalVerdict:'avoid',
      visualBucket:'avoid',
      tone:'avoid',
      badgeLabel:'Avoid',
      actionLabel:'Avoid',
      mainBlocker:'Structure is broken.'
    },
    lifecycleSnapshot:{
      state:'avoid',
      structural_alive_at_refresh:'true',
      avoid_allowed_by_structure_gate:'false',
      explicit_invalidation_reason:'(none)'
    },
    globalVerdict:{
      base_verdict:'watch',
      final_verdict:'avoid',
      explicit_invalidation_reason:'(none)'
    }
  });
  if(suppressedAvoidPresentation.canonicalVerdict !== 'avoid' || suppressedAvoidPresentation.visualBucket !== 'avoid'){
    throw new Error('Persisted tracked avoid presentation must stay avoid when no soft-readiness suppression signal is present.');
  }
  if(!String(suppressedAvoidPresentation.badgeLabel || '').trim()
    || !String(suppressedAvoidPresentation.actionLabel || '').trim()
    || !String(suppressedAvoidPresentation.headline || '').trim()
    || !String(suppressedAvoidPresentation.statusText || '').trim()){
    throw new Error('Persisted tracked avoid presentation must still expose non-empty public labels.');
  }
  const publication = sandbox.window.CanonicalDecisionResult.publishCanonicalDecision({
    final_verdict:'entry', entry_gate_pass:true, near_entry_gate_pass:true,
    buyer_control_gate_pass:true, confirmation_gate_pass:true,
    priceability_state:'priceable', structure_eligibility:'alive', support_test_state:'held',
    resolvedPlanEntry:100, resolvedPlanStop:95, resolvedPlanTarget:115, resolvedRR:3,
    semantic_blocker_code:'', primary_blocker_source:'resolver'
  }, {schemaVersion:'normalised-decision-evidence-v1', snapshotId:'track-authority-evidence'});
  const persistedScanWatch = sandbox.window.SimplifiedTradeState.resolveRecordState({
    ticker:'NVDA',
    watchlist:{inWatchlist:true, presentation:{sharedPresentation:suppressedAvoidPresentation}}
  }, {surface:'scan', publication});
  if(persistedScanWatch.canonicalVerdict !== 'entry'
    || persistedScanWatch.visualBucket !== 'entry'
    || persistedScanWatch.evidenceId !== 'track-authority-evidence'
    || persistedScanWatch.compatibility.mayFeedDecisionLogic !== false){
    throw new Error('Scan simplified pipeline must map its returned state solely from the fresh canonical publication.');
  }
  if(persistedScanWatch.canonicalVerdict === String(suppressedAvoidPresentation.canonicalVerdict || '').toLowerCase()
    || persistedScanWatch.visualBucket === String(suppressedAvoidPresentation.visualBucket || '').toLowerCase()){
    throw new Error('Persisted presentation must not override the canonical publication in the simplified state.');
  }
  const watchlistBucketSandbox = {
    console,
    uiState:{
      watchlistRenderSignature:'',
      watchlistPreparedModelCache:null,
      watchlistPresentationStateCache:null
    },
    normalizeTickerRecord(record){
      return record && typeof record === 'object' ? record : {};
    },
    normalizeTicker(value){
      return String(value || '').trim().toUpperCase();
    },
    isWatchlistLiveRefreshPending(){
      return false;
    },
    resolveSimplifiedStateForSurface(){
      return {visualBucket:'monitor'};
    },
    normalizeVisualBucketForPairing(value){
      const safe = String(value || '').trim().toLowerCase();
      if(['entry','near_entry','diminishing','avoid'].includes(safe)) return safe;
      return 'monitor';
    },
    resolveGlobalVerdict(){
      return {final_verdict:'avoid'};
    },
    watchlistLifecycleSnapshot(){
      return {state:'watch'};
    },
    watchlistPriorityForRecord(){
      return {score:0};
    },
    resolveTrackPresentationModel(){
      return {presentationBucket:'avoid', finalVerdict:'avoid'};
    },
    normalizeGlobalVerdictKey(value){
      const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
      return ['entry','near_entry','watch','avoid'].includes(safe) ? safe : 'watch';
    }
  };
  vm.createContext(watchlistBucketSandbox);
  vm.runInContext(extractFunctionSource(appSource, 'buildWatchlistSimplifiedStateCacheKey'), watchlistBucketSandbox, {filename:'app.js#buildWatchlistSimplifiedStateCacheKey'});
  vm.runInContext(extractFunctionSource(appSource, 'resolveSimplifiedStateForWatchlistPresentation'), watchlistBucketSandbox, {filename:'app.js#resolveSimplifiedStateForWatchlistPresentation'});
  vm.runInContext(extractFunctionSource(appSource, 'watchlistPresentationBucketForRecord'), watchlistBucketSandbox, {filename:'app.js#watchlistPresentationBucketForRecord'});
  const freshBucket = watchlistBucketSandbox.watchlistPresentationBucketForRecord({
    ticker:'NVDA',
    watchlist:{
      presentation:{
        sharedPresentation:{visualBucket:'avoid'},
        simplifiedState:{visualBucket:'avoid'},
        globalVerdict:{final_verdict:'avoid'}
      }
    }
  });
  if(freshBucket !== 'monitor'){
    throw new Error('Watchlist section placement must come from fresh simplified state, not embedded persisted presentation state.');
  }
  const projectionSandbox = {
    console,
    normalizeTickerRecord(record){
      return record && typeof record === 'object' ? record : {};
    },
    normalizeTicker(value){
      return String(value || '').trim().toUpperCase();
    },
    watchlistLifecycleSnapshot(){
      return {state:'watch'};
    },
    resolveGlobalVerdict(){
      return {final_verdict:'watch'};
    },
    resolveSimplifiedStateForSurface(){
      return {canonicalVerdict:'watch', visualBucket:'monitor', tone:'monitor'};
    },
    buildSharedReviewTrackPresentation(item, options = {}){
      const verdict = options.globalVerdict && options.globalVerdict.final_verdict || 'watch';
      const simplified = options.simplifiedState || {};
      return {
        canonicalVerdict:String(simplified.canonicalVerdict || verdict || 'watch').trim().toLowerCase(),
        finalVerdict:String(simplified.canonicalVerdict || verdict || 'watch').trim().toLowerCase(),
        visualBucket:String(simplified.visualBucket || 'monitor').trim().toLowerCase(),
        tone:String(simplified.tone || 'monitor').trim().toLowerCase(),
        headline:'Fresh headline',
        statusText:'Fresh headline',
        nextAction:'Fresh action',
        actionLabel:'Fresh action'
      };
    },
    normalizeVisualBucketForPairing(value){
      const safe = String(value || '').trim().toLowerCase();
      if(['entry','near_entry','diminishing','avoid'].includes(safe)) return safe;
      return 'monitor';
    },
    normalizeGlobalVerdictKey(value){
      const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
      return ['entry','near_entry','watch','avoid'].includes(safe) ? safe : 'watch';
    },
    watchlistRenderGroupForBucket(value){
      return String(value || '').trim().toLowerCase();
    }
  };
  vm.createContext(projectionSandbox);
  vm.runInContext(extractFunctionSource(appSource, 'buildTrackProjectionSnapshotFromPersistedPresentation'), projectionSandbox, {filename:'app.js#buildTrackProjectionSnapshotFromPersistedPresentation'});
  const freshProjection = projectionSandbox.buildTrackProjectionSnapshotFromPersistedPresentation({
    ticker:'NVDA',
    watchlist:{
      presentation:{
        sharedPresentation:{canonicalVerdict:'avoid', visualBucket:'avoid', tone:'avoid'},
        globalVerdict:{final_verdict:'avoid'},
        simplifiedState:{canonicalVerdict:'avoid', visualBucket:'avoid', tone:'avoid'}
      }
    }
  });
  if(freshProjection.canonicalVerdict !== 'watch'
    || freshProjection.visualBucket !== 'monitor'
    || freshProjection.tone !== 'monitor'
    || freshProjection.persistedPresentationCacheOnly !== true){
    throw new Error('Track projection snapshot must use fresh resolver/simplified state and keep embedded persisted presentation cache-only.');
  }
  const scanToneSandbox = {
    console,
    normalizeVisualBucketForPairing(value){
      const safe = String(value || '').trim().toLowerCase();
      if(['entry','near_entry','diminishing','avoid'].includes(safe)) return safe;
      return 'monitor';
    }
  };
  vm.createContext(scanToneSandbox);
  vm.runInContext(extractFunctionSource(appSource, 'resolveScanCardTone'), scanToneSandbox, {filename:'app.js#resolveScanCardTone'});
  const diminishingTone = scanToneSandbox.resolveScanCardTone(
    {tone:'diminishing'},
    {canonicalVerdict:'watch', visualBucket:'monitor', tone:'monitor'},
    'monitor'
  );
  const monitorTone = scanToneSandbox.resolveScanCardTone(
    {tone:'monitor'},
    {canonicalVerdict:'watch', visualBucket:'monitor', tone:'monitor'},
    'monitor'
  );
  if(diminishingTone !== 'diminishing'){
    throw new Error('Scan tone precedence must preserve explicit diminishing tone ahead of monitor bucket fallback.');
  }
  if(monitorTone !== 'monitor'){
    throw new Error('Ordinary monitor Scan cards must still resolve monitor tone when no explicit diminishing tone is present.');
  }
  const watchlistScoreSandbox = {console};
  vm.createContext(watchlistScoreSandbox);
  vm.runInContext(extractFunctionSource(appSource, 'shouldHideWatchlistScore'), watchlistScoreSandbox, {filename:'app.js#shouldHideWatchlistScore'});
  const hideForDiminishing = watchlistScoreSandbox.shouldHideWatchlistScore('diminishing', 5);
  const hideForZeroPriority = watchlistScoreSandbox.shouldHideWatchlistScore('watch', 0);
  const showForMonitor = watchlistScoreSandbox.shouldHideWatchlistScore('watch', 3);
  const showForNearEntry = watchlistScoreSandbox.shouldHideWatchlistScore('near_entry', 7);
  if(hideForDiminishing !== true){
    throw new Error('Diminishing watchlist cards must hide setup scores at runtime.');
  }
  if(hideForZeroPriority !== true){
    throw new Error('Zero-priority watchlist cards must hide setup scores at runtime.');
  }
  if(showForMonitor !== false || showForNearEntry !== false){
    throw new Error('Normal monitor and near-entry watchlist cards must keep setup scores visible at runtime.');
  }
  const renderWatchlistSandbox = {
    console,
    __buildSharedReviewTrackPresentationArgs:null,
    __trackVisiblePresentation:null,
    uiState:{
      watchlistRenderSignature:'',
      watchlistPreparedModelCache:null,
      watchlistPresentationStateCache:null
    },
    normalizeTickerRecord(record){
      return record && typeof record === 'object' ? record : {};
    },
    normalizeTicker(value){
      return String(value || '').trim().toUpperCase();
    },
    tickerRecordToWatchlistEntry(record){
      return record ? {ticker:String(record.ticker || '').trim().toUpperCase()} : null;
    },
    buildFinalSetupView(){
      return {};
    },
    isWatchlistLiveRefreshPending(){
      return false;
    },
    isManualWatchlistRefreshInProgress(){
      return false;
    },
    getTradingDaysRemaining(){
      return 5;
    },
    lifecycleLabel(){
      return 'Watch';
    },
    normalizeTicker(value){
      return String(value || '').trim().toUpperCase();
    },
    syncWatchlistLifecycle(){
      return {state:'watch'};
    },
    watchlistLifecycleSnapshot(){
      return {state:'watch'};
    },
    watchlistPriorityForRecord(){
      return {score:0};
    },
    resolveSimplifiedStateForSurface(){
      return {
        canonicalVerdict:'watch',
        visualBucket:'monitor',
        tone:'monitor',
        badgeLabel:'Watch',
        actionLabel:'Watch',
        mainBlocker:'Fresh blocker',
        planStatus:'missing',
        debug:{
          resolvedState:{final_verdict:'watch'},
          derivedStates:{structureEligibility:'alive', structureState:'strong', bounceState:'attempt', volumeState:'normal', priceabilityState:'priceable'}
        }
      };
    },
    analysisDerivedStatesFromRecord(){
      return {structureEligibility:'alive', structureState:'strong', bounceState:'attempt', volumeState:'normal', priceabilityState:'priceable'};
    },
    deriveCurrentPlanState(){
      return {status:'missing'};
    },
    applySetupConfirmationPlanGate(_record, displayedPlan){
      return displayedPlan;
    },
    evaluateSetupQualityAdjustments(){
      return {};
    },
    resolveScannerStateWithTrace(){
      return {rawResolverVerdict:'watch', status:'watch'};
    },
    buildSharedReviewTrackPresentation(record, options = {}){
      renderWatchlistSandbox.__buildSharedReviewTrackPresentationArgs = {
        record,
        options
      };
      return {
        canonicalVerdict:'watch',
        finalVerdict:'watch',
        visualBucket:'monitor',
        tone:'monitor',
        badgeLabel:'Fresh Watch',
        headline:'Fresh headline',
        statusText:'Fresh headline',
        nextAction:'Fresh action',
        actionLabel:'Fresh action'
      };
    },
    persistedTrackVisibleModelFromPresentation(sharedPresentation){
      renderWatchlistSandbox.__trackVisiblePresentation = sharedPresentation;
      throw new Error('__TRACK_VISIBLE_MODEL_CAPTURED__');
    }
  };
  vm.createContext(renderWatchlistSandbox);
  vm.runInContext(extractFunctionSource(appSource, 'buildWatchlistSimplifiedStateCacheKey'), renderWatchlistSandbox, {filename:'app.js#buildWatchlistSimplifiedStateCacheKey'});
  vm.runInContext(extractFunctionSource(appSource, 'resolveSimplifiedStateForWatchlistPresentation'), renderWatchlistSandbox, {filename:'app.js#resolveSimplifiedStateForWatchlistPresentation'});
  vm.runInContext(extractFunctionSource(appSource, 'renderWatchlistCardElement'), renderWatchlistSandbox, {filename:'app.js#renderWatchlistCardElement'});
  const freshHelperState = renderWatchlistSandbox.resolveSimplifiedStateForWatchlistPresentation({
    ticker:'NVDA',
    watchlist:{
      presentation:{
        simplifiedState:{canonicalVerdict:'avoid', visualBucket:'avoid', tone:'avoid'}
      }
    }
  }, {
    surface:'track',
    source:'phase6_runtime_test',
    reason:'phase6_runtime_test'
  });
  if(String(freshHelperState && freshHelperState.visualBucket || '').trim().toLowerCase() !== 'monitor'){
    throw new Error('resolveSimplifiedStateForWatchlistPresentation must recompute fresh state instead of reusing persisted simplifiedState.');
  }
  try{
    renderWatchlistSandbox.renderWatchlistCardElement({
      ticker:'NVDA',
      lifecycle:{stage:'watch', status:'active'},
      watchlist:{
        presentation:{
          sharedPresentation:{canonicalVerdict:'avoid', visualBucket:'avoid', tone:'avoid'},
          globalVerdict:{final_verdict:'avoid'},
          simplifiedState:{canonicalVerdict:'avoid', visualBucket:'avoid', tone:'avoid'}
        },
        debug:{}
      },
      plan:{},
      marketData:{currency:'USD'}
    }, {});
    throw new Error('renderWatchlistCardElement sentinel did not fire.');
  }catch(error){
    if(String(error && error.message || error) !== '__TRACK_VISIBLE_MODEL_CAPTURED__'){
      throw error;
    }
  }
  if(!renderWatchlistSandbox.__buildSharedReviewTrackPresentationArgs
    || !renderWatchlistSandbox.__trackVisiblePresentation){
    throw new Error('Track card render behavioral harness must capture fresh shared presentation inputs.');
  }
  if(String(renderWatchlistSandbox.__buildSharedReviewTrackPresentationArgs.options.globalVerdict && renderWatchlistSandbox.__buildSharedReviewTrackPresentationArgs.options.globalVerdict.final_verdict || '').trim().toLowerCase() !== 'watch'
    || String(renderWatchlistSandbox.__buildSharedReviewTrackPresentationArgs.options.simplifiedState && renderWatchlistSandbox.__buildSharedReviewTrackPresentationArgs.options.simplifiedState.visualBucket || '').trim().toLowerCase() !== 'monitor'
    || String(renderWatchlistSandbox.__trackVisiblePresentation.visualBucket || '').trim().toLowerCase() !== 'monitor'){
    throw new Error('Track card render must build trackVisibleModel from fresh canonical/simplified presentation, not embedded persisted presentation state.');
  }
  const trackDiagnosticSandbox = {
    console,
    uiState:{
      watchlistRenderSignature:'',
      watchlistPreparedModelCache:null,
      watchlistPresentationStateCache:null
    },
    normalizeTickerRecord(record){
      return record && typeof record === 'object' ? record : {};
    },
    normalizeTicker(value){
      return String(value || '').trim().toUpperCase();
    },
    watchlistLifecycleSnapshot(){
      return {state:'watch'};
    },
    resolveSimplifiedStateForSurface(){
      return {
        canonicalVerdict:'watch',
        visualBucket:'monitor',
        tone:'monitor',
        structureEligibility:'alive',
        structureState:'strong',
        setupLocationState:'near_20ma',
        priceabilityState:'priceable',
        bounceState:'attempt',
        planStatus:'missing',
        resolvedRR:2.1,
        entryGatePass:false,
        nearEntryGatePass:false,
        avoidTriggerSource:'',
        terminalAvoidApplied:false,
        debug:{
          resolvedState:{
            final_verdict:'watch',
            viability:'watch',
            finalVerdict:'watch'
          },
          derivedStates:{
            structureEligibility:'alive',
            structureState:'strong',
            bounceState:'attempt',
            volumeState:'normal',
            priceabilityState:'priceable'
          }
        }
      };
    },
    analysisDerivedStatesFromRecord(){
      return {
        structureEligibility:'alive',
        structureState:'strong',
        bounceState:'attempt',
        volumeState:'normal',
        priceabilityState:'priceable'
      };
    },
    deriveCurrentPlanState(){
      return {status:'missing'};
    },
    applySetupConfirmationPlanGate(_record, displayedPlan){
      return displayedPlan;
    },
    resolveGlobalVerdict(){
      return {final_verdict:'watch', viability:'watch'};
    },
    watchlistPriorityForRecord(){
      return {score:0};
    },
    buildSharedReviewTrackPresentation(_record, options = {}){
      return {
        canonicalVerdict:String(options.simplifiedState && options.simplifiedState.canonicalVerdict || 'watch').trim().toLowerCase(),
        visualBucket:String(options.simplifiedState && options.simplifiedState.visualBucket || 'monitor').trim().toLowerCase(),
        tone:String(options.simplifiedState && options.simplifiedState.tone || 'monitor').trim().toLowerCase(),
        mainBlocker:'Fresh blocker'
      };
    },
    persistedTrackVisibleModelFromPresentation(sharedPresentation){
      return {
        canonicalVerdict:sharedPresentation.canonicalVerdict,
        visibleBucket:sharedPresentation.visualBucket,
        tone:sharedPresentation.tone
      };
    },
    resolvePlanVisibility(){
      return {};
    },
    buildConsistencyAuditRows(){
      return [];
    },
    safeDiagnosticClone(value){
      return value;
    }
  };
  vm.createContext(trackDiagnosticSandbox);
  vm.runInContext(extractFunctionSource(appSource, 'diagnosticWatchlistDebugSnapshot'), trackDiagnosticSandbox, {filename:'app.js#diagnosticWatchlistDebugSnapshot'});
  vm.runInContext(extractFunctionSource(appSource, 'buildWatchlistSimplifiedStateCacheKey'), trackDiagnosticSandbox, {filename:'app.js#buildWatchlistSimplifiedStateCacheKey'});
  vm.runInContext(extractFunctionSource(appSource, 'resolveSimplifiedStateForWatchlistPresentation'), trackDiagnosticSandbox, {filename:'app.js#resolveSimplifiedStateForWatchlistPresentation'});
  vm.runInContext(extractFunctionSource(appSource, 'buildTrackDiagnosticSnapshot'), trackDiagnosticSandbox, {filename:'app.js#buildTrackDiagnosticSnapshot'});
  const freshDiagnostic = trackDiagnosticSandbox.buildTrackDiagnosticSnapshot({
    ticker:'NVDA',
    watchlist:{
      presentation:{
        sharedPresentation:{
          canonicalVerdict:'avoid',
          visualBucket:'diminishing',
          tone:'diminishing'
        },
        simplifiedState:{
          canonicalVerdict:'avoid',
          visualBucket:'avoid',
          tone:'avoid',
          structureEligibility:'broken',
          priceabilityState:'unpriceable'
        },
        globalVerdict:{
          final_verdict:'avoid'
        }
      },
      debug:{}
    },
    watchlistVisualState:{
      trackDebug:{
        visibleModel:{canonicalVerdict:'avoid', visibleBucket:'avoid', tone:'avoid'}
      }
    },
    plan:{},
    marketData:{currency:'USD'},
    review:{}
  });
  if(!freshDiagnostic
    || freshDiagnostic.snapshotError
    || !freshDiagnostic.simplifiedState
    || freshDiagnostic.simplifiedState.canonicalVerdict !== 'watch'
    || freshDiagnostic.simplifiedState.visualBucket !== 'monitor'
    || freshDiagnostic.simplifiedState.tone !== 'monitor'
    || freshDiagnostic.simplifiedState.priceabilityState !== 'priceable'
    || freshDiagnostic.simplifiedState.persistedPresentationCacheOnly !== true){
    throw new Error('Track diagnostics must use fresh simplified/canonical state and keep embedded persisted presentation cache-only.');
  }
  const trackLifecycleAuthoritySandbox = {
    console,
    normalizeTickerRecord(record){
      return record && typeof record === 'object' ? record : {};
    },
    normalizeGlobalVerdictKey(value){
      const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
      return ['entry','near_entry','watch','avoid'].includes(safe) ? safe : '';
    },
    normalizeVisualBucketForPairing(value){
      const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
      return ['entry','near_entry','monitor','diminishing','avoid'].includes(safe) ? safe : 'monitor';
    },
    getTone(value){
      const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
      return ['entry','near_entry','monitor','diminishing','avoid'].includes(safe) ? safe : 'monitor';
    },
    globalVerdictLabel(value){
      const safe = String(value || '').trim().toLowerCase();
      if(safe === 'entry') return 'Entry';
      if(safe === 'near_entry') return 'Near Entry';
      if(safe === 'avoid') return 'Avoid';
      return 'Watch';
    },
    resolveStructuredExplicitInvalidationAuthorityCode(globalVerdict){
      return String(globalVerdict && globalVerdict.explicit_invalidation_authority_code || '').trim().toLowerCase();
    },
    resolveGlobalVerdict(){
      return {
        final_verdict:'watch',
        base_verdict:'watch',
        structure_eligibility:'alive',
        structure_state:'strong',
        terminal_avoid_applied:false,
        rejected_by_viability_gate:false
      };
    },
    watchlistLifecycleSnapshot(){
      return {
        state:'entry',
        label:'Entry',
        status:'active'
      };
    }
  };
  vm.createContext(trackLifecycleAuthoritySandbox);
  vm.runInContext(extractFunctionSource(appSource, 'resolveStructuredExplicitInvalidationAuthorityCode'), trackLifecycleAuthoritySandbox, {filename:'app.js#resolveStructuredExplicitInvalidationAuthorityCode'});
  vm.runInContext(extractFunctionSource(appSource, 'buildSharedReviewTrackPresentation'), trackLifecycleAuthoritySandbox, {filename:'app.js#buildSharedReviewTrackPresentation'});
  const trackedLifecycleEntryPresentation = trackLifecycleAuthoritySandbox.buildSharedReviewTrackPresentation({
    ticker:'TROW',
    watchlist:{inWatchlist:true, debug:{}},
    plan:{blockedReasonCode:''},
    setup:{structureState:'strong'}
  }, {
    surface:'track',
    simplifiedState:{
      canonicalVerdict:'watch',
      visualBucket:'monitor',
      tone:'monitor',
      badgeLabel:'Watch',
      actionLabel:'WATCH',
      mainBlocker:'Conditions are not strong enough for active focus.',
      planStatus:'valid',
      priceabilityState:'priceable',
      structureState:'strong',
      structureEligibility:'alive'
    },
    lifecycleSnapshot:{
      state:'entry',
      label:'Entry',
      status:'active'
    },
    globalVerdict:{
      final_verdict:'watch',
      base_verdict:'watch',
      structure_eligibility:'alive',
      structure_state:'strong',
      contractDiagnostics:{
        softReadinessOnlyDemotion:true
      },
      terminal_avoid_applied:false,
      rejected_by_viability_gate:false
    }
  });
  if(trackedLifecycleEntryPresentation.canonicalVerdict !== 'watch'
    || trackedLifecycleEntryPresentation.visualBucket !== 'monitor'
    || trackedLifecycleEntryPresentation.tone !== 'monitor'){
    throw new Error('Track shared presentation must preserve current canonical Watch over historical lifecycle Entry.');
  }
  if(trackedLifecycleEntryPresentation.badgeLabel !== 'Watch'
    || trackedLifecycleEntryPresentation.headline !== 'Watch'){
    throw new Error('Track badge and headline must remain tied to the current canonical Watch.');
  }
  const lifecycleParityCases = [
    {history:'near_entry', verdict:'watch', actionable:false},
    {history:'entry', verdict:'near_entry', actionable:false},
    {history:'watch', verdict:'entry', actionable:true},
    {history:'entry', verdict:'watch', actionable:false, publicationStatus:'validation_failed'}
  ];
  lifecycleParityCases.forEach((fixture) => {
    const presentation = trackLifecycleAuthoritySandbox.buildSharedReviewTrackPresentation({ticker:'LIFE', watchlist:{inWatchlist:true}}, {
      simplifiedState:{
        canonicalVerdict:fixture.verdict,
        visualBucket:fixture.verdict === 'watch' ? 'monitor' : fixture.verdict,
        tone:fixture.verdict === 'watch' ? 'monitor' : fixture.verdict,
        badgeLabel:fixture.verdict === 'near_entry' ? 'Near Entry' : (fixture.verdict === 'entry' ? 'Entry' : 'Watch'),
        publicationStatus:fixture.publicationStatus || 'valid',
        actionable:fixture.actionable,
        entryEligibility:{qualified:fixture.verdict === 'entry'},
        nearEntryEligibility:{qualified:fixture.verdict === 'near_entry'},
        planStatus:'missing', planState:'unavailable',
        decisiveBlocker:'Current canonical blocker.', decisiveBlockerCode:'canonical_blocker', decisiveBlockerCategory:'gate',
        canonicalResultVersion:'v-test', evidenceId:'e-test'
      },
      lifecycleSnapshot:{state:fixture.history, label:fixture.history, status:'historical'}
    });
    if(presentation.canonicalVerdict !== fixture.verdict
      || presentation.actionable !== fixture.actionable
      || presentation.currentDecision.verdict !== fixture.verdict
      || presentation.currentDecision.evidenceId !== 'e-test'
      || presentation.lifecycleHistory.authority !== 'historical_context_only'){
      throw new Error('Track current decision must preserve publication parity independently of lifecycle history.');
    }
    if(fixture.publicationStatus === 'validation_failed'
      && (presentation.publicationStatus !== 'validation_failed' || presentation.actionable !== false || presentation.canonicalPlan !== null)){
      throw new Error('Track validation-failed fallback must remain explicit and must not expose a candidate plan.');
    }
  });
  const trackedLifecycleBlockedPresentation = trackLifecycleAuthoritySandbox.buildSharedReviewTrackPresentation({
    ticker:'UNP',
    watchlist:{inWatchlist:true, debug:{}},
    plan:{blockedReasonCode:'target_too_close'},
    setup:{structureState:'strong'}
  }, {
    surface:'track',
    simplifiedState:{
      canonicalVerdict:'watch',
      visualBucket:'monitor',
      tone:'monitor',
      badgeLabel:'Watch',
      actionLabel:'WATCH',
      mainBlocker:'Nearby resistance limits current reward potential.',
      planStatus:'valid',
      priceabilityState:'priceable',
      structureState:'strong',
      structureEligibility:'alive'
    },
    lifecycleSnapshot:{
      state:'entry',
      label:'Entry',
      status:'active'
    },
    globalVerdict:{
      final_verdict:'watch',
      base_verdict:'watch',
      structure_eligibility:'alive',
      structure_state:'strong',
      contractDiagnostics:{
        softReadinessOnlyDemotion:false
      },
      terminal_avoid_applied:false,
      rejected_by_viability_gate:false
    }
  });
  if(trackedLifecycleBlockedPresentation.canonicalVerdict !== 'watch'){
    throw new Error('Track shared presentation must not preserve lifecycle Entry when a hard structured blocker exists.');
  }
  const model = authoritySandbox.resolveTrackCardVisibleModel({
    ticker:'LIN'
  }, {
    canonicalVerdict:'near_entry',
    visualBucket:'monitor',
    tone:'monitor',
    badgeLabel:'Near Entry',
    planVisible:false,
    planStatus:'valid',
    mainBlocker:'Low-priority watch - needs structure repair.',
    debug:{
      resolvedState:{
        viability:'low_priority',
        hasProvisionalPriceablePlan:true
      },
      derivedStates:{
        structureState:'strong',
        structureEligibility:'alive',
        bounceState:'attempt',
        volumeState:'weak'
      }
    }
  });
  if(model.canonicalVerdict !== 'near_entry' || model.visibleBucket !== 'near_entry' || model.tone !== 'near_entry' || model.badgeLabel !== 'Near Entry'){
    throw new Error('Track visible model must promote canonical near_entry to Near Entry tone and badge even when internal visualBucket is monitor.');
  }
  if(!/^Near Entry$/i.test(String(model.headline || ''))){
    throw new Error('Track visible model must keep the Near Entry state label as the visible headline.');
  }
  if(!/weak volume reduces confidence/i.test(String(model.primaryReason || ''))){
    throw new Error('Track visible model must explain weak-volume lower priority as the reason, not as a conflicting state label.');
  }
  if(!/Provisional plan exists - waiting for confirmation/i.test(String(model.planSummary || ''))){
    throw new Error('Track visible model must explicitly say a provisional plan exists for weak-volume Near Entry states.');
  }
  if(/needs structure repair/i.test(String(model.headline || '')) || /monitor/i.test(String(model.headline || ''))){
    throw new Error('Track visible model must not expose stale structure-repair or Monitor contradiction for alive strong Near Entry setups.');
  }
  const nonVolumeLowPriorityModel = authoritySandbox.resolveTrackCardVisibleModel({
    ticker:'LIN'
  }, {
    canonicalVerdict:'near_entry',
    visualBucket:'monitor',
    tone:'monitor',
    badgeLabel:'Near Entry',
    planVisible:false,
    planStatus:'valid',
    mainBlocker:'Low-priority watch - needs structure repair.',
    debug:{
      resolvedState:{
        viability:'low_priority',
        viabilityBranchReason:'Confirmation quality is still developing.',
        hasPriceablePlan:true
      },
      derivedStates:{
        structureState:'strong',
        structureEligibility:'alive',
        bounceState:'attempt',
        volumeState:'normal'
      }
    }
  });
  if(/volume is weak/i.test(String(nonVolumeLowPriorityModel.headline || ''))){
    throw new Error('Track visible model must not blame low-priority Near Entry states on weak volume unless volume is actually weak.');
  }
  if(!/^Near Entry$/i.test(String(nonVolumeLowPriorityModel.headline || ''))){
    throw new Error('Track visible model must keep the Near Entry label for non-volume low-priority states.');
  }
  if(!/confirmation|control of the rebound/i.test(String(nonVolumeLowPriorityModel.primaryReason || ''))){
    throw new Error('Track visible model must use neutral confirmation wording for non-volume low-priority Near Entry states.');
  }
  if(/needs structure repair/i.test(String(nonVolumeLowPriorityModel.headline || '')) || /monitor/i.test(String(nonVolumeLowPriorityModel.headline || ''))){
    throw new Error('Track visible model must not expose stale structure-repair or Monitor wording for non-volume low-priority Near Entry states.');
  }
  if(!/Valid plan calculations exist, but the trade is not actionable yet/i.test(String(nonVolumeLowPriorityModel.planSummary || ''))){
    throw new Error('Track visible model must explicitly say valid plan calculations exist when planStatus is valid but planVisible is false.');
  }
  if(!/provisional plan|valid plan calculations exist|waiting for confirmation/i.test(String(model.planSummary || ''))){
    throw new Error('Track visible model must describe valid provisional plans as pending confirmation, not missing.');
  }
  const developingWatchModel = authoritySandbox.resolveTrackCardVisibleModel({
    ticker:'ADI'
  }, {
    canonicalVerdict:'watch',
    visualBucket:'monitor',
    tone:'monitor',
    badgeLabel:'Watch',
    planVisible:false,
    planStatus:'missing',
    mainBlocker:'Conditions are not strong enough for active focus.',
    debug:{
      resolvedState:{
        hasClearInvalidationLevel:false,
        hasPriceablePlan:false
      },
      derivedStates:{
        structureState:'intact',
        structureEligibility:'alive',
        bounceState:'attempt',
        volumeState:'supportive',
        pullbackZone:'near_20ma'
      }
    }
  });
  if(developingWatchModel.canonicalVerdict !== 'watch' || developingWatchModel.visibleBucket !== 'monitor' || developingWatchModel.tone !== 'monitor'){
    throw new Error('Developing watch model must preserve watch/monitor final state.');
  }
  if(!/^Developing Watch$/i.test(String(developingWatchModel.headline || ''))){
    throw new Error('Alive monitor/watch setups with forming bounce and no invalidation must render the Developing Watch headline.');
  }
  if(!/support is still being tested|buyer control is only starting to emerge/i.test(String(developingWatchModel.primaryReason || ''))){
    throw new Error('Developing watch model must explain that support is still being tested and buyer control is emerging.');
  }
  if(
    !/clear support level for managing risk/i.test(String(developingWatchModel.planSummary || ''))
    && !/support to hold more clearly|buyers to take firmer control|clearer area of support/i.test(String(developingWatchModel.nextAction || ''))
  ){
    throw new Error('Developing watch model must explain the missing support/risk context.');
  }
  if(!/support to hold more clearly|buyers to take firmer control/i.test(String(developingWatchModel.nextAction || ''))){
    throw new Error('Developing watch model must provide the clearer-support next action.');
  }
  if(/needs structure repair/i.test(String(developingWatchModel.headline || '')) || /needs structure repair/i.test(String(developingWatchModel.primaryReason || '')) || /volume is weak/i.test(String(developingWatchModel.primaryReason || '')) || /conditions are not strong enough for active focus/i.test(String(developingWatchModel.primaryReason || ''))){
    throw new Error('Developing watch model must not expose stale structure-repair, weak-volume, or generic conditions-not-strong-enough copy.');
  }
  const weakVolumeWatchModel = authoritySandbox.resolveTrackCardVisibleModel({
    ticker:'AMZN'
  }, {
    canonicalVerdict:'watch',
    visualBucket:'monitor',
    tone:'monitor',
    badgeLabel:'Watch',
    planVisible:false,
    planStatus:'missing',
    mainBlocker:'Conditions are not strong enough for active focus.',
    debug:{
      resolvedState:{
        hasClearInvalidationLevel:false,
        hasPriceablePlan:false
      },
      derivedStates:{
        structureState:'strong',
        structureEligibility:'alive',
        bounceState:'attempt',
        volumeState:'weak',
        pullbackZone:'near_50ma'
      }
    }
  });
  if(!/support is still being tested|buyer control is only starting to emerge/i.test(String(weakVolumeWatchModel.primaryReason || ''))){
    throw new Error('Weak-volume watch model must still keep the developing support-test narrative as the primary reason.');
  }
  if(/volume is weak/i.test(String(weakVolumeWatchModel.primaryReason || ''))){
    throw new Error('Weak volume may be secondary caution, but it must not replace the primary blocker when no invalidation level exists.');
  }
  const refreshTraceModel = authoritySandbox.resolveTrackCardVisibleModel({
    ticker:'NFLX'
  }, {
    canonicalVerdict:'watch',
    visualBucket:'monitor',
    tone:'monitor',
    badgeLabel:'Watch',
    planVisible:false,
    planStatus:'missing',
    mainBlocker:'Bounce is forming.',
    debug:{
      previousState:'near_entry',
      transition:'near_entry -> watch',
      downgradeApplied:true,
      downgradeReason:'bounce_confirmation_lost',
      resolvedState:{},
      derivedStates:{
        structureState:'intact',
        structureEligibility:'alive',
        bounceState:'attempt',
        volumeState:'supportive'
      }
    }
  });
  if(/near_entry|downgrade|transition|previousState/i.test([refreshTraceModel.headline, refreshTraceModel.primaryReason, refreshTraceModel.planSummary, refreshTraceModel.nextAction].join(' '))){
    throw new Error('Track visible model must explain only the final state, not refresh transition trace.');
  }
  const sparseWatchModel = authoritySandbox.resolveTrackCardVisibleModel({
    ticker:'QQQ'
  }, {
    canonicalVerdict:'watch',
    visualBucket:'monitor',
    tone:'monitor',
    badgeLabel:'Watch',
    planVisible:false,
    planStatus:'missing',
    mainBlocker:'',
    actionLabel:'',
    debug:{
      resolvedState:{},
      derivedStates:{}
    }
  });
  if(!String(sparseWatchModel.headline || '').trim()){
    throw new Error('Track visible model must always provide a non-empty headline.');
  }
  if(authoritySandbox.sameVisibleCopy(sparseWatchModel.headline, sparseWatchModel.primaryReason)){
    throw new Error('Sparse watch model must not duplicate headline and primaryReason.');
  }
  const duplicateSuppressionModel = authoritySandbox.resolveTrackCardVisibleModel({
    ticker:'META'
  }, {
    canonicalVerdict:'watch',
    visualBucket:'monitor',
    tone:'monitor',
    badgeLabel:'Watch',
    planVisible:false,
    planStatus:'missing',
    mainBlocker:'Conditions are not strong enough for active focus.',
    debug:{
      resolvedState:{},
      derivedStates:{
        structureState:'unknown',
        structureEligibility:'',
        bounceState:'',
        volumeState:'normal'
      }
    }
  });
  if(authoritySandbox.sameVisibleCopy(duplicateSuppressionModel.headline, duplicateSuppressionModel.primaryReason)){
    throw new Error('Track visible model must suppress duplicate primaryReason when it normalizes equal to headline.');
  }
  const visiblePlanFallbackModel = authoritySandbox.resolveTrackCardVisibleModel({
    ticker:'SHOP'
  }, {
    canonicalVerdict:'near_entry',
    visualBucket:'near_entry',
    tone:'near_entry',
    badgeLabel:'Near Entry',
    planVisible:true,
    planStatus:'valid',
    mainBlocker:'',
    debug:{
      resolvedState:{},
      derivedStates:{
        structureState:'strong',
        structureEligibility:'alive',
        bounceState:'confirmed',
        volumeState:'supportive'
      }
    }
  });
  if(!/^Trade plan available\.$/i.test(String(visiblePlanFallbackModel.planSummary || ''))){
    throw new Error('Track visible model must never leak raw planStatus in visible plan copy when plan is visible.');
  }
  const hiddenPlanFallbackModel = authoritySandbox.resolveTrackCardVisibleModel({
    ticker:'CRM'
  }, {
    canonicalVerdict:'watch',
    visualBucket:'monitor',
    tone:'monitor',
    badgeLabel:'Watch',
    planVisible:false,
    planStatus:'missing',
    mainBlocker:'',
    debug:{
      resolvedState:{},
      derivedStates:{}
    }
  });
  if(!/No actionable trade plan yet|waiting for confirmation|not actionable yet|plan needs confirmation|Bounce is not clear enough to price yet|Wait for the chart to provide a cleaner entry structure/i.test(String(hiddenPlanFallbackModel.planSummary || '')) || /^missing$/i.test(String(hiddenPlanFallbackModel.planSummary || ''))){
    throw new Error('Track visible model must provide friendly hidden-plan copy when no plan summary exists, and must not leak raw plan status.');
  }
  if(!/const persistedSharedPresentation = persistedPresentation && persistedPresentation\.sharedPresentation/.test(appSource)
    || !/const presentationSourceOfTruth = 'live_recomputed_fallback';/.test(appSource)
    || /const globalVerdict = persistedPresentation && persistedPresentation\.globalVerdict/.test(appSource)
    || /persistedPresentation\.simplifiedState[\s\S]*?return persistedPresentation\.simplifiedState;/.test(appSource)
    || !/const sharedPresentation = buildSharedReviewTrackPresentation\(record,\s*\{/.test(appSource)
    || !/const trackVisibleModel = persistedTrackVisibleModelFromPresentation\(sharedPresentation\);/.test(appSource)
    || !/const watchlistVisualState = persistedWatchlistVisualStateFromPresentation\(sharedPresentation\);/.test(appSource)
    || !/const visualBucket = normalizeVisualBucketForPairing\(trackVisibleModel\.visibleBucket \|\| 'monitor'\);/.test(appSource)
    || !/const tone = String\(trackVisibleModel\.tone \|\| visualBucket \|\| 'monitor'\)/.test(appSource)
    || !/trackVisibleModel\.planSummary/.test(appSource)
    || !/trackVisibleModel\.primaryReason/.test(appSource)
    || !/trackVisibleModel\.nextAction/.test(appSource)
    || !/sameVisibleCopy\(trackVisibleModel\.primaryReason, decisionSummary\)/.test(appSource)){
    throw new Error('Track card render must source visible state from fresh shared presentation, without embedded persisted global/simplified state authority.');
  }
  if(!/const persistedPresentation = persistTrackPresentationOnRecord\(liveRecord,[\s\S]*?\);\s*const lifecycleSnapshot = syncWatchlistLifecycle\(liveRecord\) \|\| watchlistLifecycleSnapshot\(liveRecord\);/s.test(appSource)){
    throw new Error('Persisted Track presentation must be created before lifecycle sync so lifecycle can consume the persisted snapshot instead of rewriting presentation authority.');
  }
  if(!/function persistTrackPresentationOnRecord\(record, bundle, options = \{\}\)\{[\s\S]*?const liveRecord = record && typeof record === 'object' \? record : null;[\s\S]*?liveRecord\.watchlist\.presentation = persisted;[\s\S]*?liveRecord\.watchlistVisualState = persisted\.watchlistVisualState;/s.test(appSource)){
    throw new Error('Persisted Track presentation must be written back onto the live ticker record, not a normalized clone, or Track will fall back to recomputation and stale grouping.');
  }
  if(/const persistedPresentationVerdict = normalizeGlobalVerdictKey\([\s\S]*?persistedSharedPresentation[\s\S]*?canonicalVerdict[\s\S]*?\);[\s\S]*?const canonicalVerdict = persistedPresentationVerdict[\s\S]*?\|\| resolvedFinalVerdictKey/s.test(appSource)
    || !/const canonicalVerdict = resolvedFinalVerdictKey[\s\S]*?\|\| normalizeGlobalVerdictKey\(canonicalContract\.canonicalVerdictKey\);/s.test(appSource)){
    throw new Error('Watchlist lifecycle snapshot must keep persisted shared presentation cache-only and must prefer the live resolved verdict.');
  }
  if(!/function buildTrackProjectionSnapshotFromPersistedPresentation\(record, context = 'watchlist_add_projection'\)\{[\s\S]*?const globalVerdict = resolveGlobalVerdict\(item\);[\s\S]*?const simplifiedState = resolveSimplifiedStateForSurface\(item, 'track', \{[\s\S]*?const renderModels = typeof buildCanonicalRenderModelsFromRecord === 'function'[\s\S]*?const canonicalTrackRenderModel =[\s\S]*?const sharedPresentation = buildSharedReviewTrackPresentation\(item,[\s\S]*?sourceOfTruth:'live_recomputed_fallback'[\s\S]*?const visualBucket = normalizeVisualBucketForPairing\([\s\S]*?canonicalTrackRenderModel[\s\S]*?sharedPresentation\.visualBucket[\s\S]*?'monitor'\s*\);/s.test(appSource)){
    throw new Error('Review add-to-watchlist handoff must derive projection snapshots from fresh globalVerdict/simplifiedState and canonical Track render models, with shared presentation only as cache fallback.');
  }
  if(/function watchlistPresentationBucketForRecord\(record, options = \{\}\)\{[\s\S]*?persistedSharedPresentation[\s\S]*?return normalizeVisualBucketForPairing\(persistedSharedPresentation\.visualBucket \|\| 'monitor'\);/s.test(appSource)){
    throw new Error('Track section placement must not use persisted shared presentation buckets as authority.');
  }
  if(!/function watchlistEligibilityForRecord\(record, options = \{\}\)\{[\s\S]*?const globalVerdict = options\.globalVerdict && typeof options\.globalVerdict === 'object'[\s\S]*?: resolveGlobalVerdict\(item\);[\s\S]*?const simplifiedState = resolveSimplifiedStateForSurface\(item, 'review', \{[\s\S]*?source:'watchlist_eligibility'[\s\S]*?reason:'watchlist_eligibility'[\s\S]*?\}\);[\s\S]*?const finalVerdict = normalizeGlobalVerdictKey\([\s\S]*?simplifiedState[\s\S]*?\|\| globalVerdict\.final_verdict[\s\S]*?\);[\s\S]*?const eligibleVerdict = \['watch','near_entry','entry'\]\.includes\(finalVerdict\);[\s\S]*?const allowWatchlist = eligibleVerdict && globalVerdict\.allow_watchlist === true;/s.test(appSource)){
    throw new Error('Watchlist eligibility must use the simplified review verdict for labels while keeping post-gate global allow_watchlist as the hard Add-to-Watchlist authority.');
  }
  if(!/function resolvePostGateWatchlistEligibility\(record, options = \{\}\)\{[\s\S]*?applyGlobalVerdictGates\(item, \{[\s\S]*?source:String\(options\.source \|\| 'review_add_watchlist_hidden'\)[\s\S]*?deferWatchlistRemoval:options\.deferWatchlistRemoval !== false[\s\S]*?\}\);[\s\S]*?const eligibility = watchlistEligibilityForRecord\(item, \{globalVerdict\}\);/s.test(appSource)){
    throw new Error('Review and add-to-watchlist paths must share one post-gate watchlist eligibility helper instead of duplicating pre-gate and post-gate logic.');
  }
  if(!/const eligibility = resolvePostGateWatchlistEligibility\(record, \{\s*source:'watchlist_add',\s*deferWatchlistRemoval:false,\s*commitOnChange:true\s*\}\);/s.test(appSource)){
    throw new Error('addToWatchlist must compute eligibility from the shared post-gate helper and must not rely on a stale pre-gate eligibility snapshot.');
  }
  if(!/runWatchlistLifecycleEvaluation\(\{[\s\S]*?source:'watchlist_add'[\s\S]*?\}\);\s*refreshTrackedTickerState\(entry\.ticker, \{[\s\S]*?source:'watchlist_add'[\s\S]*?reason:'watchlist_add_refresh'[\s\S]*?force:true[\s\S]*?persist:false[\s\S]*?\}\);\s*markWatchlistDirty\(\[entry\.ticker\], 'watchlist_add'\);\s*uiState\.watchlistPreparedModelCache = null;\s*uiState\.watchlistRenderSignature = '';/s.test(appSource)){
    throw new Error('Watchlist add must rebuild persisted Track presentation and invalidate prepared Track render caches so section grouping cannot reuse stale avoid buckets.');
  }
  if(!/const snapshot = syncWatchlistLifecycle\(record, \{source\}\);/.test(appSource)){
    throw new Error('Watchlist lifecycle evaluation must pass its source through to syncWatchlistLifecycle() so add-time guards can distinguish watchlist_add from later refreshes.');
  }
  if(!/const watchlistEligibility = resolvePostGateWatchlistEligibility\(record, \{\s*source:'review_add_watchlist_hidden',\s*deferWatchlistRemoval:true,\s*commitOnChange:false\s*\}\);/s.test(appSource)){
    throw new Error('Review Add to Watchlist button state must use the same post-gate eligibility decision as the actual add path.');
  }
  if(!/const simplifiedCanonicalVerdict = authoritativeCanonicalVerdict;/.test(appSource)
    || !/let simplifiedVisualBucket = authoritativeVisualBucket;/.test(appSource)
    || !/sourceOfTruth:'simplified_state_pipeline'/.test(appSource)
    || !/const liveReviewProjectionAuthority = false;/.test(appSource)
    || !/if\(!snapshotContractFingerprint \|\| !baselineContractFingerprint\) return false;[\s\S]*?if\(snapshotContractFingerprint !== baselineContractFingerprint\) return false;/s.test(appSource)){
    throw new Error('Review, replay, and projection consumers must keep canonical contract authority and only allow projection transport when the snapshot fingerprint matches the live contract exactly.');
  }
  if(!/const preAddReviewProjectionSnapshot = buildStableReviewProjectionSnapshot\(liveRecord, 'watchlist_add_projection'\);[\s\S]*?const postAddProjectionSnapshot = preAddReviewProjectionSnapshot[\s\S]*?\? \{[\s\S]*?source:'pre_add_review_projection'[\s\S]*?\}\s*:\s*buildTrackProjectionSnapshotFromPersistedPresentation\(entry && entry\.record \? entry\.record : liveRecord, 'watchlist_add_projection'\);[\s\S]*?uiState\.activeReviewSourceProjectionSnapshot = postAddProjectionSnapshot;[\s\S]*?uiState\.activeReviewProjectionSource = 'track_projection_updated';[\s\S]*?renderReviewWorkspace\(postAddProjectionSnapshot[\s\S]*?source:'track_projection_updated'/s.test(appSource)){
    throw new Error('Review must capture a fresh Review-authoritative projection before Add to Watchlist, and only fall back to tracked presentation if that projection is unavailable.');
  }
  if(/decision_summary:presentation\.presentationReason/.test(appSource) || /reason:presentation\.presentationReason/.test(appSource)){
    throw new Error('Legacy presentationReason must not feed non-debug visible Track render paths.');
  }
  if(!/trackDebug\s*=\s*\{/.test(appSource) || !/visibleModel:\s*\{/.test(appSource) || !/resolverTrace:\s*\{/.test(appSource) || !/planTrace:\s*\{/.test(appSource) || !/gateTrace:\s*\{/.test(appSource) || !/lifecycleTrace:\s*\{/.test(appSource)){
    throw new Error('Track debug output must use one namespaced trackDebug structure.');
  }
  if(!/const trackedLifecycleHardStructuredBlock = \['invalidated','missed','target_too_close','broken_structure'\]\.includes\(explicitInvalidationAuthorityCode\)[\s\S]*?\|\| \['invalidated','missed','target_too_close','broken_structure','terminal','expired'\]\.includes\(planBlockedReasonCode\)[\s\S]*?const preserveTrackedEntryAuthority = !!\([\s\S]*?simplifiedVerdict === 'near_entry'[\s\S]*?trackedPlanStatus === 'valid'[\s\S]*?trackedPriceabilityState === 'priceable'[\s\S]*?lifecycleVerdict === 'entry'[\s\S]*?\);[\s\S]*?const preserveTrackedLifecycleCanonicalVerdict = !!\([\s\S]*?\['entry','near_entry'\]\.includes\(lifecycleVerdict\)[\s\S]*?simplifiedVerdict === 'watch'[\s\S]*?trackedLifecycleHardStructuredBlock !== true[\s\S]*?\);[\s\S]*?const canonicalVerdict = preserveTrackedEntryAuthority[\s\S]*?\? 'entry'[\s\S]*?\: \(preserveTrackedLifecycleCanonicalVerdict \? lifecycleVerdict : simplifiedVerdict\);/s.test(appSource)){
    throw new Error('Track shared presentation must allow live lifecycle entry/near_entry to preserve soft-readiness authority when valid, but persisted presentation must remain non-authoritative.');
  }
  if(!/const hideWatchlistScore = shouldHideWatchlistScore\(watchlistState, prioritySortValue\);/.test(appSource)){
    throw new Error('Track watchlist card render must use the shared score-visibility helper for diminishing or zero-priority cards.');
  }
  if(/Final Verdict Rendered|Canonical Final Verdict|Track Visual Bucket|Scan Visual Bucket|Presentation Reason/.test(appSource)){
    throw new Error('Watchlist debug output must not print redundant flat Track state aliases.');
  }
  if(!/if\(!showExpired\)\{\s*purgeExpiredWatchlistEntries\(\);/s.test(appSource)){
    throw new Error('Show Expired watchlist filter must not purge expired entries before rendering.');
  }
  if(!/if\(startupCoordinator\.renderedTabs\.track && !forceFullRender\)\{\s*requestWatchlistRender\(\{\s*source:'track_tab_activation',\s*includeFocusQueue:true/s.test(appSource)){
    throw new Error('Track focus should request a Track render refresh instead of silently returning on cached state.');
  }
  if(!/const lifecycleRefresh = maybeRunTrackFocusLifecycleRefresh\(\{source:'track_focus'\}\);\s*const focusRefresh = maybeRunTrackFocusWatchlistRefresh\(\{source:'track_focus'\}\);/s.test(appSource)){
    throw new Error('Track focus should evaluate the guarded focus-refresh path alongside lifecycle refresh.');
  }
  if(!/function maybeRunTrackFocusWatchlistRefresh\(options = \{\}\)\{/.test(appSource)){
    throw new Error('Track focus should retain the guarded focus-refresh helper.');
  }
  if(!/function trackRefreshFreshnessTimestamp\(\)\{/.test(appSource)
    || !/function trackRefreshFreshnessAgeMs\(now = Date\.now\(\)\)\{/.test(appSource)
    || !/function markTrackRefreshFreshness\(source, summary = null\)\{/.test(appSource)){
    throw new Error('Track focus refresh should use dedicated freshness helpers for stale-decision control.');
  }
  if(!/return String\(trackRefreshRuntime\.lastSuccessfulTrackFocusRefreshAt \|\| ''\)\.trim\(\);/.test(appSource)){
    throw new Error('Track focus TTL decisions must use the dedicated Track-focus freshness timestamp only.');
  }
  if(!/refreshTrackOnly\(\{\s*source:'track_focus_refresh',\s*force:false,\s*clearReviewOverride:false\s*\}\)/s.test(appSource)){
    throw new Error('Track focus refresh should use the guarded track refresh path without clearing active review overrides.');
  }
  if(!/else if\(!watchlistDirty && freshWithinTtl\) skipReason = 'fresh_within_ttl';/.test(appSource)
    || !/\[TRACK_FOCUS_REFRESH_CHECK\]/.test(appSource)
    || !/\[TRACK_FOCUS_REFRESH_SKIPPED\]/.test(appSource)
    || !/\[TRACK_FOCUS_REFRESH_START\]/.test(appSource)
    || !/\[TRACK_FOCUS_REFRESH_DONE\]/.test(appSource)){
    throw new Error('Track focus refresh should log the TTL-based skip/run decision during this audit pass.');
  }
  if(!/refreshSummary = await refreshWatchlistRecordsFromSourceOfTruth\(\{\s*source,\s*trackOnly:true,\s*mode:'incremental',\s*force:options\.force === true,\s*render:false,\s*persist:true,\s*clearReviewOverride:options\.clearReviewOverride\s*\}\)/s.test(appSource)){
    throw new Error('Track refresh should pass through clearReviewOverride so focus refresh does not mutate Review state unexpectedly.');
  }
  if(!/const committedCount = results\.filter\(result => result && result\.ok === true && result\.skipped !== true\)\.length;/.test(appSource)
    || !/if\(attempted <= 0 \|\| committedCount !== attempted \|\| skippedCount > 0 \|\| failed > 0\) return false;/.test(appSource)
    || !/summary\.freshnessAdvanced = freshnessAdvanced;/.test(appSource)
    || !/freshnessAdvanced:refreshSummary && refreshSummary\.freshnessAdvanced === true/.test(appSource)){
    throw new Error('Successful watchlist refreshes must advance and expose the freshness marker.');
  }
  if(!/if\(firstUserOpen\)\{\s*renderWatchlist\(\{\s*source:'track_first_open_sync',\s*allowCachedReturn:false/s.test(appSource)){
    throw new Error('First Track focus should use a synchronous watchlist render so the active bucket is populated immediately.');
  }
  if(!/\[TRACK_BUCKET_TOGGLE\]/.test(appSource) || !/\[TRACK_SHOW_EXPIRED_TOGGLE\]/.test(appSource) || !/\[TRACK_RENDER_BUCKETS\]/.test(appSource)){
    throw new Error('Track bucket investigation logs must be present during this diagnostic pass.');
  }
  if(!/function renderWatchlistCardElement\(record, options = \{\}\)\{\s*const entry = tickerRecordToWatchlistEntry\(record\);\s*if\(!entry\) return null;\s*const debug = record && record\.watchlist && record\.watchlist\.debug && typeof record\.watchlist\.debug === 'object'\s*\?\s*record\.watchlist\.debug\s*:\s*\{\};/s.test(appSource)){
    throw new Error('Track watchlist card render must guard missing debug state and must not reference an undefined debug object.');
  }
  if(!/const simplifiedState = resolveSimplifiedStateForWatchlistPresentation\(record, \{\s*surface:'track',\s*source:'renderWatchlistCardElement',\s*reason:'renderWatchlistCardElement',\s*passCache\s*\}\);/s.test(appSource)
    || !/const derivedStates = simplifiedDebug\.derivedStates && typeof simplifiedDebug\.derivedStates === 'object'\s*\?\s*simplifiedDebug\.derivedStates\s*:\s*analysisDerivedStatesFromRecord\(record\);/s.test(appSource)){
    throw new Error('Track watchlist card render must reuse cached simplified state and derived-state debug payload before recomputing analysis state.');
  }
  if(!/const activeCapitalSimulation = capitalSimulationState && capitalSimulationState\.simulation\s*\?\s*capitalSimulationState\.simulation\s*:\s*null;/.test(appSource)
    || !/Simulation active: \$\{escapeHtml\(activeCapitalSimulation\.label \|\| 'custom'\)\} of account/.test(appSource)
    || !/No capital simulation active\./.test(appSource)){
    throw new Error('Review capital simulation controls must expose visible debug feedback for active and cleared simulation states.');
  }
  if(!/function trackCardRenderSignatureSnapshot\(record\)\{\s*const item = normalizeTickerRecord\(record \|\| \{\}\);\s*const passCache = null;[\s\S]*const simplifiedState = resolveSimplifiedStateForWatchlistPresentation\(item, \{\s*surface:'track',\s*source:'track_card_render_signature_snapshot',\s*reason:'trackCardRenderSignatureSnapshot',\s*passCache\s*\}\);/s.test(appSource)){
    throw new Error('Track card render signature snapshot must initialize simplifiedState before using it during watchlist refresh diffing.');
  }
  if(!/if\(pending && pending\.loadStarted === true\)\{\s*return;\s*\}/s.test(appSource)){
    throw new Error('Watchlist refresh release should skip replay when the pending review load has already started.');
  }
  if(!/loadTickerIntoReview\(pending\.ticker, \{\s*\.\.\.\(pending\.options \|\| \{\}\),\s*forceNow:true,\s*reviewRequestToken:pending\.reviewRequestToken/s.test(appSource)){
    throw new Error('Watchlist refresh release should replay the pending review request only when it has not already started.');
  }
}

function runReviewPullbackBounceDisplayAssertions(){
  const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const sandbox = {
    console,
    numericOrNull(value){
      if(value === null || value === undefined) return null;
      if(typeof value === 'string' && value.trim() === '') return null;
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    },
    normalizeTickerRecord(record){
      return record && typeof record === 'object' ? record : {};
    },
    reviewConsolidationPresentationCopy(){
      return {technicalLabel:'Consolidating'};
    }
  };
  vm.createContext(sandbox);
  [
    'resolveCanonicalPullbackState',
    'pullbackStateLabel',
    'reviewTechnicalPullbackLabel',
    'reviewTechnicalBounceLabel',
    'resolveReviewPullbackBounceDisplayContext'
  ].forEach(functionName => {
    vm.runInContext(extractFunctionSource(appSource, functionName), sandbox, {filename:`app.js#${functionName}`});
  });
  const reconciled = sandbox.resolveReviewPullbackBounceDisplayContext({
    record:{
      ticker:'NVDA',
      marketData:{price:222.82, sma20:220.5, sma50:208.1}
    },
    simplifiedState:{
      structureState:'strong',
      structureEligibility:'alive',
      bounceState:'attempt'
    },
    globalVerdict:{
      pullback_detected:false
    },
    derivedStates:{
      pullbackState:'none',
      pullbackZone:'none',
      bounceState:'attempt',
      stabilisationState:'none',
      setupLocationState:'',
      structureState:'strong'
    },
    reviewEvidence:{
      terminalAvoid:false,
      structuralWeakness:false,
      consolidating:false
    }
  });
  if(reconciled.pullbackLabel === 'Pullback none' || reconciled.resolvedPullbackState === 'none'){
    throw new Error('Review pullback/bounce reconciliation must not render Pullback none alongside a bounce-positive strong setup.');
  }
  if(reconciled.pullbackLabel !== 'Pullback Near 20MA'){
    throw new Error(`Review pullback/bounce reconciliation should prefer Near 20MA for shallow bounce-positive pullbacks. Got: ${reconciled.pullbackLabel}`);
  }
  if(reconciled.canonicalPullbackState !== 'near_20ma' || reconciled.nearEntryPullbackZoneAccepted !== true){
    throw new Error('Review pullback/bounce reconciliation must expose Near 20MA as the canonical accepted pullback state.');
  }
  const carrLikeCanonical = sandbox.resolveCanonicalPullbackState({
    record:{
      ticker:'CARR',
      marketData:{price:69.34, sma20:71.053, sma50:67.8266}
    },
    simplifiedState:{
      structureState:'strong',
      structureEligibility:'alive',
      bounceState:'attempt'
    },
    globalVerdict:{
      pullback_detected:false
    },
    derivedStates:{
      pullbackState:'none',
      pullbackZone:'none',
      bounceState:'attempt',
      stabilisationState:'none',
      setupLocationState:'off_level',
      structureState:'strong'
    },
    reviewEvidence:{
      terminalAvoid:false,
      structuralWeakness:false,
      consolidating:false
    }
  });
  if(carrLikeCanonical.canonicalPullbackState !== 'near_20ma'){
    throw new Error(`CARR-like recent support responses must reconcile to a canonical Near 20MA pullback. Got: ${carrLikeCanonical.canonicalPullbackState}`);
  }
  if(carrLikeCanonical.pullbackValiditySource !== 'reconciled_recent_support_response'){
    throw new Error('CARR-like reconciled pullbacks must report reconciled_recent_support_response as the validity source.');
  }
  if(carrLikeCanonical.currentLocationState !== 'off_level'){
    throw new Error('CARR-like pullback reconciliation must preserve off-level current location separately from canonical support history.');
  }
  const genuinelyNoPullback = sandbox.resolveReviewPullbackBounceDisplayContext({
    record:{
      ticker:'MSFT',
      marketData:{price:300, sma20:280, sma50:260}
    },
    simplifiedState:{
      structureState:'strong',
      structureEligibility:'alive',
      bounceState:'none'
    },
    derivedStates:{
      pullbackState:'none',
      pullbackZone:'none',
      bounceState:'none',
      stabilisationState:'none',
      structureState:'strong'
    },
    reviewEvidence:{
      terminalAvoid:false,
      structuralWeakness:false,
      consolidating:false
    }
  });
  if(genuinelyNoPullback.pullbackLabel !== 'Pullback none'){
    throw new Error('Review pullback/bounce reconciliation must keep Pullback none when bounce evidence is absent.');
  }
  if(genuinelyNoPullback.canonicalPullbackState !== 'none' || genuinelyNoPullback.nearEntryPullbackZoneAccepted === true){
    throw new Error('Genuinely off-level pullbacks without support interaction or buyer response must remain canonically invalid.');
  }
}

function runCanonicalPullbackParityAssertions(){
  const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const appSandbox = {
    console,
    numericOrNull(value){
      if(value === null || value === undefined) return null;
      if(typeof value === 'string' && value.trim() === '') return null;
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    },
    normalizeTickerRecordReadOnly(record){
      return record && typeof record === 'object' ? record : {};
    }
  };
  vm.createContext(appSandbox);
  vm.runInContext(extractFunctionSource(appSource, 'resolveCanonicalPullbackState'), appSandbox, {filename:'app.js#resolveCanonicalPullbackState'});

  const fixtures = [
    {
      id:'off_level_no_support',
      record:{ticker:'OFF', marketData:{price:112, sma20:100, sma50:95}},
      ctx:{
        pullback_zone:'none',
        setup_location_state:'off_level',
        bounce_state:'attempt',
        stabilisation_state:'none',
        structure_state:'strong',
        support_held:false,
        meaningful_reversal:false,
        signal_count:0,
        current_price:112,
        ma20:100,
        ma50:95
      },
      expected:{
        rawPullbackState:'none',
        canonicalPullbackState:'none',
        recentSupportInteraction:false,
        reconciliationReason:'',
        pullbackValid:false
      }
    },
    {
      id:'extended_no_support',
      record:{ticker:'EXT', marketData:{price:111, sma20:100, sma50:95}},
      ctx:{
        pullback_zone:'none',
        setup_location_state:'extended',
        bounce_state:'attempt',
        stabilisation_state:'early',
        structure_state:'strong',
        support_held:false,
        meaningful_reversal:false,
        signal_count:0,
        current_price:111,
        ma20:100,
        ma50:95
      },
      expected:{
        rawPullbackState:'none',
        canonicalPullbackState:'none',
        recentSupportInteraction:false,
        reconciliationReason:'',
        pullbackValid:false
      }
    },
    {
      id:'carr_like_real_support',
      record:{ticker:'CARR', marketData:{price:69.34, sma20:71.053, sma50:67.8266}},
      ctx:{
        pullback_zone:'none',
        setup_location_state:'off_level',
        bounce_state:'attempt',
        stabilisation_state:'none',
        structure_state:'strong',
        support_held:true,
        meaningful_reversal:true,
        signal_count:6,
        current_price:69.34,
        ma20:71.053,
        ma50:67.8266
      },
      expected:{
        rawPullbackState:'none',
        canonicalPullbackState:'near_20ma',
        recentSupportInteraction:true,
        reconciliationReason:'bounce_positive_near_20ma',
        pullbackValid:true
      }
    }
  ];

  fixtures.forEach(fixture => {
    const appResult = appSandbox.resolveCanonicalPullbackState({
      record:fixture.record,
      derivedStates:{
        pullbackZone:fixture.ctx.pullback_zone,
        bounceState:fixture.ctx.bounce_state,
        stabilisationState:fixture.ctx.stabilisation_state,
        setupLocationState:fixture.ctx.setup_location_state,
        structureState:fixture.ctx.structure_state,
        supportHeld:fixture.ctx.support_held,
        meaningfulReversal:fixture.ctx.meaningful_reversal
      },
      globalVerdict:{
        support_held:fixture.ctx.support_held,
        meaningful_reversal:fixture.ctx.meaningful_reversal
      },
      reviewEvidence:{
        terminalAvoid:false,
        structuralWeakness:false
      }
    });
    const resolverResult = resolverCore.resolveCanonicalPullbackContext(fixture.ctx);

    const comparableApp = {
      rawPullbackState:appResult.rawPullbackState,
      canonicalPullbackState:appResult.canonicalPullbackState,
      recentSupportInteraction:appResult.recentSupportInteraction,
      reconciliationReason:appResult.reconciliationReason,
      pullbackValid:appResult.canonicalPullbackValid
    };
    const comparableResolver = {
      rawPullbackState:resolverResult.rawPullbackState,
      canonicalPullbackState:resolverResult.canonicalPullbackState,
      recentSupportInteraction:resolverResult.recentSupportInteraction,
      reconciliationReason:resolverResult.reconciliationReason,
      pullbackValid:resolverResult.canonicalPullbackValid
    };

    if(JSON.stringify(comparableApp) !== JSON.stringify(comparableResolver)){
      throw new Error(`${fixture.id}: app and resolver-core canonical pullback helpers diverged.\napp=${JSON.stringify(comparableApp)}\nresolver=${JSON.stringify(comparableResolver)}`);
    }
    if(JSON.stringify(comparableResolver) !== JSON.stringify(fixture.expected)){
      throw new Error(`${fixture.id}: canonical pullback result mismatch.\nexpected=${JSON.stringify(fixture.expected)}\nactual=${JSON.stringify(comparableResolver)}`);
    }
  });
}

function runReviewPricedButNotReadyAssertions(){
  const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const sandbox = {
    console,
    REVIEW_PRICED_BUT_NOT_READY_LINE1:'The app knows the maths, but the trade isn\'t ready.',
    REVIEW_PRICED_BUT_NOT_READY_LINE2:'Long-press the ticker card in Track for more info.',
    REVIEW_PRICED_BUT_NOT_READY_RR:'Priced',
    reviewPricedButNotReadyCopy(){
      return {
        line1:'The app knows the maths, but the trade isn\'t ready.',
        line2:'Long-press the ticker card in Track for more info.',
        rr:'Priced'
      };
    },
    numericOrNull(value){
      if(value === null || value === undefined) return null;
      if(typeof value === 'string' && value.trim() === '') return null;
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    },
    currentRrThreshold(){ return 2; },
    isAccepted50MaSupportTestDisplayState(){ return false; },
    review50MaSupportTestPresentationCopy(){
      return {
        tradeStatus:'Support test still in progress.',
        draftTradeStatus:'Draft plan possible, but not actionable yet.',
        blocker:'Testing 50MA support - waiting for buyer control to confirm.',
        technicalStructure:'Structure intact',
        technicalPullback:'Pullback near 50MA',
        technicalBounce:'Buyer control not confirmed'
      };
    },
    buildSharedSetupNarrative(){
      return {
        stateLabel:'Watch',
        primaryReason:'Buyers need to prove support.',
        blocker:'Buyers need to prove support.',
        nextAction:'Wait for stronger confirmation.',
        evidence:[],
        cautions:[],
        promotionRequirements:[]
      };
    },
    globalVerdictLabel(){ return 'Watch'; },
    sameVisibleCopy(a, b){
      return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
    },
    normalizeTickerRecord(record){
      return record && typeof record === 'object' ? record : {};
    },
    normalizeGlobalVerdictKey(value){
      const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
      if(safe === 'nearentry') return 'near_entry';
      if(['entry','near_entry','watch','avoid'].includes(safe)) return safe;
      return 'watch';
    },
    normalizeVerdict(value){
      const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
      if(safe === 'nearentry') return 'near_entry';
      if(['entry','near_entry','watch','avoid'].includes(safe)) return safe;
      return 'watch';
    },
    reviewCopyEvidence(){
      return {consolidating:false, terminalAvoid:false, structuralWeakness:false, noBounce:false};
    },
    resolveReviewPullbackBounceDisplayContext(){
      return {
        rawPullbackState:'near_20ma',
        rawBounceState:'attempt',
        rawStabilisationState:'none',
        setupLocationState:'near_20ma',
        structureState:'strong',
        structureEligibility:'alive',
        resolvedPullbackState:'near_20ma',
        pullbackLabel:'Pullback Near 20MA',
        bounceLabel:'Buyers emerging',
        reconciliationApplied:false,
        reconciliationReason:'',
        price:222.82,
        sma20:220.5,
        sma50:208.1
      };
    },
    reviewTechnicalStructureLabel(){ return 'Structure strong'; },
    reviewTechnicalVolumeLabel(state){
      const safe = String(state || '').trim().toLowerCase();
      if(['expanding', 'supportive', 'strong'].includes(safe)) return 'Volume expanding';
      if(safe === 'weak') return 'Volume weak';
      if(['constructive', 'normal'].includes(safe)) return 'Volume constructive';
      if(['neutral', 'average'].includes(safe)) return 'Volume neutral';
      return 'Volume n/a';
    },
    reviewTechnicalMarketLabel(){ return 'Market supportive'; },
    reviewConsolidationPresentationCopy(){
      return {summary:'', blocker:'', nextAction:''};
    },
    rawSetupScoreForRecord(record){
      const rawScore = sandbox.numericOrNull(record && (record.rawScore ?? record.baseScore ?? (record.setup && record.setup.baseScore)));
      return rawScore == null ? 0 : rawScore;
    }
  };
  vm.createContext(sandbox);
  [
    'resolveCanonicalTradePlanAuthority',
    'buildReviewSemanticStatus',
    'canonicalReviewTechnicalStructureLabelFromStoryContext',
    'canonicalReviewTechnicalPullbackLabelFromStoryContext',
    'canonicalReviewTechnicalBuyerLabelFromStoryContext',
    'canonicalBuyerStatesFromStoryContext',
    'canonicalReviewTechnicalContextLineFromStoryContext',
    'canonicalDecisionSummaryFromStoryContext',
    'canonicalBuyerStatesFromStoryContext',
    'canonicalNonChartBlockerSummary',
    'buildDecisionSemantics',
    'sharedDecisionSummaryFromSemantics',
    'reviewDecisionSummaryFromSemantics',
    'reviewNextActionFromDecisionSemantics',
    'buildDecisionSummary',
    'buildResolvedReviewDisplayModel'
  ].forEach(functionName => {
    vm.runInContext(extractFunctionSource(appSource, functionName), sandbox, {filename:`app.js#${functionName}`});
  });
  const blockedSemantics = sandbox.buildDecisionSemantics({
    record:{ticker:'SEMPLAN', rawScore:7},
    finalVerdict:'watch',
    resolvedContract:{planStatusKey:'missing', blockerReason:'No valid invalidation level is available.'},
    derivedStates:{
      structureState:'strong',
      setupLocationState:'near_20ma',
      priceabilityState:'priceable',
      bounceState:'attempt'
    },
    globalVerdict:{
      final_verdict:'watch',
      structure_eligibility:'alive',
      viability:'watchlist',
      viabilityBranchId:'alive_watchlist'
    },
    storyContext:{
      currentPhase:'responding_from_support',
      support:{label:'20MA'},
      buyerControl:{state:'emerging'}
    },
    authoritativeBlockerText:'No valid invalidation level is available.'
  });
  if(blockedSemantics.reasonKind !== 'blocker' || blockedSemantics.actionability !== 'blocked' || blockedSemantics.planCondition !== 'missing'){
    throw new Error('Decision semantics must preserve blocker-first actionability for missing-plan watch states.');
  }
  if(blockedSemantics.currentPhase !== 'responding_from_support' || blockedSemantics.supportRelationship !== 'active_support_test'){
    throw new Error('Decision semantics must preserve canonical phase and support relationship for support-holding states.');
  }
  if(String(sandbox.sharedDecisionSummaryFromSemantics(blockedSemantics, '') || '').trim() !== 'No valid invalidation level is available.'){
    throw new Error('Shared decision summaries must preserve blocker-first copy from the semantic layer.');
  }
  const awaySemantics = sandbox.buildDecisionSemantics({
    record:{ticker:'SEMAWAY', rawScore:7},
    finalVerdict:'watch',
    resolvedContract:{planStatusKey:'valid'},
    derivedStates:{
      structureState:'strong',
      setupLocationState:'off_level',
      priceabilityState:'priceable',
      bounceState:'attempt'
    },
    globalVerdict:{
      final_verdict:'watch',
      structure_eligibility:'alive',
      viability:'watchlist',
      viabilityBranchId:'alive_watchlist'
    },
    storyContext:{
      currentPhase:'away_from_support',
      support:{label:'20MA'},
      buyerControl:{state:'none'}
    }
  });
  if(awaySemantics.reasonKind !== 'extension' || awaySemantics.nextRequiredEvent !== 'reset_to_support' || awaySemantics.opportunityCondition !== 'reset_required'){
    throw new Error('Decision semantics must classify away-from-support watch states as reset-required extensions.');
  }
  const awaySummary = String(sandbox.reviewDecisionSummaryFromSemantics(awaySemantics, '') || '').trim();
  if(awaySummary !== 'Watch - trend remains constructive, but price is currently away from support.'){
    throw new Error('Review summaries must use the semantic away-from-support caution.');
  }
  if(/setup quality fading|chart needs to stabilise|buyers are failing|developing toward entry|no pullback/i.test(awaySummary)){
    throw new Error('Away-from-support semantic summaries must avoid synthetic negative language.');
  }
  const entrySemantics = sandbox.buildDecisionSemantics({
    record:{ticker:'SEMENTRY', rawScore:8},
    finalVerdict:'entry',
    resolvedContract:{planStatusKey:'valid'},
    derivedStates:{
      structureState:'strong',
      setupLocationState:'near_20ma',
      priceabilityState:'priceable',
      bounceState:'confirmed'
    },
    globalVerdict:{
      final_verdict:'entry',
      structure_eligibility:'alive',
      viability:'accept',
      viabilityBranchId:'entry_ready'
    },
    storyContext:{
      currentPhase:'responding_from_support',
      support:{label:'20MA'},
      buyerControl:{state:'confirmed'}
    }
  });
  if(entrySemantics.actionability !== 'actionable' || entrySemantics.nextRequiredEvent !== 'execute_if_trigger_valid' || entrySemantics.evidenceStrength !== 'strong'){
    throw new Error('Decision semantics must preserve actionable Entry semantics without recalculating verdict authority.');
  }
  const semantic = sandbox.buildReviewSemanticStatus({
    simplifiedState:{
      canonicalVerdict:'watch',
      entryGatePass:false,
      mainBlocker:'Needs stronger confirmation.'
    },
    globalVerdict:{
      final_verdict:'watch',
      structure_state:'strong',
      structure_eligibility:'alive',
      setup_location_state:'near_20ma',
      priceability_state:'priceable',
      bounce_state:'attempt'
    },
    derivedStates:{
      structureState:'strong',
      setupLocationState:'near_20ma',
      priceabilityState:'priceable',
      bounceState:'attempt',
      stabilisationState:'none'
    },
    displayedPlan:{
      status:'valid',
      entry:220,
      stop:215,
      target:230,
      rewardRisk:{valid:true, rrRatio:2},
      riskFit:{risk_status:'fits_risk', position_size:8, max_loss:40},
      capitalFit:{capital_fit:'acceptable', quote_currency:'USD'},
      tradeability:'tradable',
      affordability:'affordable'
    },
    planRealism:{raw_rr:2}
  });
  if(semantic.pricedButNotReady !== true){
    throw new Error('Review semantic status must mark valid-plan non-entry states as pricedButNotReady.');
  }
  if(!/The app knows the maths/i.test(String(semantic.tradeStatus && semantic.tradeStatus.line1 || '')) || !/Long-press the ticker card in Track/i.test(String(semantic.tradeStatus && semantic.tradeStatus.line2 || ''))){
    throw new Error('Review semantic status must use the priced-but-not-ready novice copy.');
  }
  if(String(semantic.rrDisplay || '') !== 'Priced'){
    throw new Error('Review semantic status must use non-numeric R:R for priced-but-not-ready states.');
  }
  if(semantic.showPlanFields !== false || semantic.showPlanMetrics !== false || semantic.showCapital !== false){
    throw new Error('Review semantic status must hide priced-plan details and capital metrics when trade is not ready.');
  }
  const resolved = sandbox.buildResolvedReviewDisplayModel({
    record:{ticker:'NVDA', marketData:{price:222.82}},
    simplifiedState:{
      canonicalVerdict:'watch',
      structureState:'strong',
      structureEligibility:'alive',
      bounceState:'attempt',
      volumeState:'supportive'
    },
    globalVerdict:{final_verdict:'watch'},
    reviewSemanticStatus:semantic,
    derivedStates:{
      structureState:'strong',
      pullbackState:'near_20ma',
      bounceState:'attempt',
      stabilisationState:'none',
      volumeState:'supportive'
    },
    displayedPlan:{
      status:'valid',
      entry:220,
      stop:215,
      target:230,
      capitalFit:{position_cost:440, quote_currency:'USD'}
    },
    planRealism:{raw_rr:2}
  });
  if(resolved.planUI.showPlan !== false || resolved.planUI.showRR !== false || resolved.planUI.showCapital !== false || resolved.planUI.showPositionSize !== false){
    throw new Error('Resolved Review display must hide plan numbers and capital metrics for priced-but-not-ready states.');
  }
  if(String(resolved.rrDisplay || '') !== 'Priced'){
    throw new Error('Resolved Review display must show Priced for priced-but-not-ready states.');
  }
  if(String(resolved.planSummary || '').trim()){
    throw new Error('Resolved Review display must avoid duplicating priced-but-not-ready copy in the summary box.');
  }
  const entrySemantic = sandbox.buildReviewSemanticStatus({
    simplifiedState:{
      canonicalVerdict:'entry',
      entryGatePass:true,
      mainBlocker:''
    },
    globalVerdict:{
      final_verdict:'entry',
      structure_state:'strong',
      structure_eligibility:'alive',
      setup_location_state:'near_20ma',
      priceability_state:'priceable',
      bounce_state:'confirmed'
    },
    derivedStates:{
      structureState:'strong',
      setupLocationState:'near_20ma',
      priceabilityState:'priceable',
      bounceState:'confirmed',
      stabilisationState:'clear'
    },
    displayedPlan:{
      status:'valid',
      entry:220,
      stop:215,
      target:230,
      rewardRisk:{valid:true, rrRatio:2},
      riskFit:{risk_status:'fits_risk', position_size:8, max_loss:40},
      capitalFit:{capital_fit:'acceptable', quote_currency:'USD'},
      tradeability:'tradable',
      affordability:'affordable'
    },
    planRealism:{raw_rr:2}
  });
  if(entrySemantic.pricedButNotReady === true || String(entrySemantic.rrDisplay || '') === 'Priced'){
    throw new Error('Entry-ready states must retain actionable numeric plan behaviour.');
  }
  const canonicalReviewEntrySemantic = sandbox.buildReviewSemanticStatus({
    simplifiedState:{
      canonicalVerdict:'entry',
      structureState:'strong',
      structureEligibility:'alive',
      setupLocationState:'off_level',
      priceabilityState:'priceable',
      bounceState:'attempt',
      entryGatePass:false,
      mainBlocker:'Conditions are not strong enough for active focus.'
    },
    globalVerdict:{
      final_verdict:'watch',
      structure_state:'strong',
      structure_eligibility:'alive',
      setup_location_state:'volatile',
      priceability_state:'unpriceable',
      bounce_state:'attempt',
      main_blocker:'Repair is forming but the setup is not priceable yet.'
    },
    derivedStates:{
      structureState:'strong',
      setupLocationState:'off_level',
      priceabilityState:'priceable',
      bounceState:'attempt',
      stabilisationState:'none'
    },
    displayedPlan:{
      status:'valid',
      entry:110,
      stop:102,
      target:130,
      rewardRisk:{valid:true, rrRatio:2.5},
      riskFit:{risk_status:'fits_risk', position_size:5, max_loss:40},
      capitalFit:{capital_fit:'acceptable', quote_currency:'USD'},
      tradeability:'tradable',
      affordability:'affordable'
    },
    planRealism:{raw_rr:2.5}
  });
  if(/not priceable yet|too far above support/i.test(String(canonicalReviewEntrySemantic.blocker || ''))){
    throw new Error('Review semantics must not reintroduce legacy global unpriceable blocker copy when simplified Review state is priceable.');
  }
  if(canonicalReviewEntrySemantic.pricedButNotReady === true || String(canonicalReviewEntrySemantic.rrDisplay || '') === 'Priced'){
    throw new Error('Simplified canonical Entry with valid maths must stay actionable in Review even when stale global pending-confirmation fields still exist.');
  }
  if(/setup remains untradable|trend is weakening/i.test(String(canonicalReviewEntrySemantic.tradeStatus && canonicalReviewEntrySemantic.tradeStatus.line1 || ''))){
    throw new Error('Simplified canonical Entry with pending confirmation must not regress to legacy untradable or weakening Review copy.');
  }
  const weakSemantic = sandbox.buildReviewSemanticStatus({
    simplifiedState:{
      canonicalVerdict:'watch',
      entryGatePass:false,
      mainBlocker:'Trend is weakening - no reliable stop level yet.'
    },
    globalVerdict:{
      final_verdict:'watch',
      structure_state:'weakening',
      structure_eligibility:'damaged',
      setup_location_state:'near_20ma',
      priceability_state:'priceable',
      bounce_state:'attempt'
    },
    derivedStates:{
      structureState:'weakening',
      setupLocationState:'near_20ma',
      priceabilityState:'priceable',
      bounceState:'attempt',
      stabilisationState:'none'
    },
    displayedPlan:{
      status:'valid',
      entry:220,
      stop:215,
      target:230,
      rewardRisk:{valid:true, rrRatio:2}
    },
    planRealism:{raw_rr:2}
  });
  if(weakSemantic.pricedButNotReady === true){
    throw new Error('Structurally weak valid-plan watch states must not be classified as pricedButNotReady.');
  }
  if(/The app knows the maths/i.test(String(weakSemantic.tradeStatus && weakSemantic.tradeStatus.line1 || '')) || String(weakSemantic.rrDisplay || '') === 'Priced'){
    throw new Error('Structurally weak valid-plan watch states must preserve stronger cautionary Review copy.');
  }

  sandbox.buildCanonicalStoryContextForRecord = function(){
    return {
      structure:{state:'developing_clean'},
      support:{label:'20MA'},
      buyerResponse:{semantic:'response_present'},
      buyerControl:{state:'emerging'},
      confirmation:{state:'follow_through_unconfirmed'},
      volume:{state:'supportive'},
      currentPhase:'responding_from_support'
    };
  };
  const canonicalLowScoreResolved = sandbox.buildResolvedReviewDisplayModel({
    record:{ticker:'SCORE', rawScore:4, marketData:{price:55}},
    simplifiedState:{
      canonicalVerdict:'watch',
      structureState:'developing_clean',
      structureEligibility:'alive',
      bounceState:'attempt',
      volumeState:'supportive'
    },
    globalVerdict:{
      final_verdict:'watch',
      structure_eligibility:'alive',
      viability:'watchlist',
      viabilityBranchId:'alive_watchlist_low_score'
    },
    reviewSemanticStatus:{
      primaryReason:'Conditions are not strong enough for active focus.',
      blocker:'Conditions are not strong enough for active focus.',
      tradeStatus:{line1:'Conditions are not strong enough for active focus.', line2:''},
      showPlanFields:false,
      showPlanMetrics:false,
      showCapital:false
    },
    derivedStates:{
      structureState:'developing_clean',
      setupLocationState:'near_20ma',
      priceabilityState:'priceable',
      bounceState:'attempt',
      stabilisationState:'clear',
      volumeState:'supportive'
    },
    displayedPlan:{status:'valid'},
    planRealism:{raw_rr:2}
  });
  if(!/setup quality|active focus/i.test(String(canonicalLowScoreResolved.decisionSummary || ''))){
    throw new Error('Low-score Review summary must preserve the blocker-first explanation.');
  }
  if(/support is holding|buyers still need to prove control/i.test(String(canonicalLowScoreResolved.decisionSummary || ''))){
    throw new Error('Low-score Review summary must not be replaced by canonical chart-story copy.');
  }
  if(!/Structure developing/i.test(String(canonicalLowScoreResolved.technicalContextLine || ''))){
    throw new Error('Developing canonical story context must render Structure developing in Review technical context.');
  }

  const canonicalUnpriceableResolved = sandbox.buildResolvedReviewDisplayModel({
    record:{ticker:'PRICE', rawScore:7, marketData:{price:55}},
    simplifiedState:{
      canonicalVerdict:'watch',
      structureState:'strong',
      structureEligibility:'alive',
      bounceState:'attempt',
      volumeState:'supportive'
    },
    globalVerdict:{
      final_verdict:'watch',
      structure_eligibility:'alive',
      viability:'watchlist',
      viabilityBranchId:'alive_watchlist'
    },
    reviewSemanticStatus:{
      primaryReason:'Trade remains unpriceable.',
      blocker:'Trade remains unpriceable.',
      tradeStatus:{line1:'Trade remains unpriceable.', line2:''},
      showPlanFields:false,
      showPlanMetrics:false,
      showCapital:false
    },
    derivedStates:{
      structureState:'strong',
      setupLocationState:'near_20ma',
      priceabilityState:'unpriceable',
      bounceState:'attempt',
      stabilisationState:'clear',
      volumeState:'supportive'
    },
    displayedPlan:{status:'valid'},
    planRealism:{raw_rr:2}
  });
  if(!/price reliably|unpriceable/i.test(String(canonicalUnpriceableResolved.decisionSummary || ''))){
    throw new Error('Unpriceable Review summary must preserve the pricing blocker.');
  }
  if(/support is holding|buyers still need to prove control/i.test(String(canonicalUnpriceableResolved.decisionSummary || ''))){
    throw new Error('Unpriceable Review summary must not be replaced by canonical chart-story copy.');
  }

  const canonicalMissingPlanResolved = sandbox.buildResolvedReviewDisplayModel({
    record:{ticker:'PLAN', rawScore:7, marketData:{price:55}},
    simplifiedState:{
      canonicalVerdict:'watch',
      structureState:'strong',
      structureEligibility:'alive',
      bounceState:'attempt',
      volumeState:'supportive'
    },
    globalVerdict:{
      final_verdict:'watch',
      structure_eligibility:'alive',
      viability:'watchlist',
      viabilityBranchId:'alive_watchlist'
    },
    reviewSemanticStatus:{
      primaryReason:'Plan needs rebuilding before the setup is actionable.',
      blocker:'Plan needs rebuilding before the setup is actionable.',
      tradeStatus:{line1:'Plan needs rebuilding before the setup is actionable.', line2:''},
      showPlanFields:false,
      showPlanMetrics:false,
      showCapital:false
    },
    derivedStates:{
      structureState:'strong',
      setupLocationState:'near_20ma',
      priceabilityState:'priceable',
      bounceState:'attempt',
      stabilisationState:'clear',
      volumeState:'supportive'
    },
    displayedPlan:{status:'missing'},
    planRealism:{raw_rr:null}
  });
  if(!/plan needs rebuilding/i.test(String(canonicalMissingPlanResolved.decisionSummary || ''))){
    throw new Error('Missing-plan Review summary must preserve the plan blocker.');
  }
  if(/support is holding|buyers still need to prove control/i.test(String(canonicalMissingPlanResolved.decisionSummary || ''))){
    throw new Error('Missing-plan Review summary must not be replaced by canonical chart-story copy.');
  }

  const canonicalChartConfirmationResolved = sandbox.buildResolvedReviewDisplayModel({
    record:{ticker:'CONF', rawScore:7, marketData:{price:55}},
    simplifiedState:{
      canonicalVerdict:'near_entry',
      structureState:'strong',
      structureEligibility:'alive',
      bounceState:'attempt',
      volumeState:'supportive'
    },
    globalVerdict:{
      final_verdict:'near_entry',
      structure_eligibility:'alive',
      viability:'watchlist',
      viabilityBranchId:'alive_watchlist'
    },
    reviewSemanticStatus:{
      primaryReason:'Needs stronger confirmation.',
      blocker:'Needs stronger confirmation.',
      tradeStatus:{line1:'Needs stronger confirmation.', line2:''},
      showPlanFields:false,
      showPlanMetrics:false,
      showCapital:false
    },
    derivedStates:{
      structureState:'strong',
      setupLocationState:'near_20ma',
      priceabilityState:'priceable',
      bounceState:'attempt',
      stabilisationState:'clear',
      volumeState:'supportive'
    },
    displayedPlan:{status:'valid'},
    planRealism:{raw_rr:2}
  });
  if(!/support is holding|trigger is still missing/i.test(String(canonicalChartConfirmationResolved.decisionSummary || ''))){
    throw new Error('Chart-confirmation Review summary should use the canonical chart-story copy when no non-chart blocker controls.');
  }

  sandbox.buildCanonicalStoryContextForRecord = function(){
    return {
      structure:{state:'strong'},
      support:{label:'20MA', type:'20ma'},
      buyerResponse:{semantic:'response_absent'},
      buyerControl:{state:'none'},
      confirmation:{state:'follow_through_unknown'},
      volume:{state:'supportive'},
      currentPhase:'away_from_support'
    };
  };
  const canonicalAwayFromSupportResolved = sandbox.buildResolvedReviewDisplayModel({
    record:{ticker:'AWAY', rawScore:7, marketData:{price:55}},
    simplifiedState:{
      canonicalVerdict:'watch',
      structureState:'strong',
      structureEligibility:'alive',
      bounceState:'attempt',
      volumeState:'supportive'
    },
    globalVerdict:{
      final_verdict:'watch',
      structure_eligibility:'alive',
      viability:'watchlist',
      viabilityBranchId:'alive_watchlist'
    },
    reviewSemanticStatus:{
      primaryReason:'Monitor: still forming. Buyers have not taken control yet.',
      blocker:'Monitor: still forming. Buyers have not taken control yet.',
      tradeStatus:{line1:'Monitor: still forming. Buyers have not taken control yet.', line2:''},
      showPlanFields:false,
      showPlanMetrics:false,
      showCapital:false
    },
    derivedStates:{
      structureState:'strong',
      setupLocationState:'off_level',
      priceabilityState:'priceable',
      bounceState:'attempt',
      stabilisationState:'clear',
      volumeState:'supportive'
    },
    displayedPlan:{status:'valid'},
    planRealism:{raw_rr:2}
  });
  if(String(canonicalAwayFromSupportResolved.decisionSummary || '').trim() !== 'Watch - trend remains constructive, but price is currently away from support.'){
    throw new Error('Away-from-support Watch Review summary must use the canonical away-from-support caution.');
  }
  if(/almost ready|waiting for confirmation/i.test(String(canonicalAwayFromSupportResolved.decisionSummary || ''))){
    throw new Error('Away-from-support Watch Review summary must not fall back to generic readiness copy.');
  }

  const awayFromSupportWatchDecisionSummary = sandbox.buildDecisionSummary({
    record:{ticker:'DAWAYW', rawScore:7},
    finalVerdict:'watch',
    displayedPlan:{status:'valid'},
    resolvedContract:{structuralState:'developing', planStatusKey:'valid'},
    derivedStates:{
      structureState:'strong',
      setupLocationState:'off_level',
      priceabilityState:'priceable',
      bounceState:'attempt'
    },
    globalVerdict:{
      final_verdict:'watch',
      structure_eligibility:'alive',
      viability:'watchlist',
      viabilityBranchId:'alive_watchlist'
    },
    storyContext:{
      currentPhase:'away_from_support',
      buyerControl:{state:'none'}
    }
  });
  if(String(awayFromSupportWatchDecisionSummary || '').trim() !== 'Watch - trend remains constructive, but price is currently away from support.'){
    throw new Error('buildDecisionSummary must use away-from-support Watch caution when canonical phase says price is away from support.');
  }
  if(/almost ready|waiting for confirmation/i.test(String(awayFromSupportWatchDecisionSummary || ''))){
    throw new Error('buildDecisionSummary must not use generic fallback copy for away-from-support Watch states.');
  }

  const awayFromSupportNearEntryDecisionSummary = sandbox.buildDecisionSummary({
    record:{ticker:'DAWAYN', rawScore:7},
    finalVerdict:'near_entry',
    displayedPlan:{status:'valid'},
    resolvedContract:{structuralState:'near_entry', planStatusKey:'valid'},
    derivedStates:{
      structureState:'strong',
      setupLocationState:'off_level',
      priceabilityState:'priceable',
      bounceState:'attempt'
    },
    globalVerdict:{
      final_verdict:'near_entry',
      structure_eligibility:'alive',
      viability:'watchlist',
      viabilityBranchId:'alive_watchlist'
    },
    storyContext:{
      currentPhase:'away_from_support',
      buyerControl:{state:'none'}
    }
  });
  if(String(awayFromSupportNearEntryDecisionSummary || '').trim() !== 'Near Entry - trend remains constructive, but price is currently away from support. Wait for a reset.'){
    throw new Error('buildDecisionSummary must use away-from-support Near Entry caution when canonical phase says price is away from support.');
  }
  if(/almost ready|trigger is still missing/i.test(String(awayFromSupportNearEntryDecisionSummary || ''))){
    throw new Error('Away-from-support Near Entry summary must not imply setup readiness.');
  }

  const extendedFromSupportDecisionSummary = sandbox.buildDecisionSummary({
    record:{ticker:'DEXT', rawScore:7},
    finalVerdict:'watch',
    displayedPlan:{status:'valid'},
    resolvedContract:{structuralState:'developing', planStatusKey:'valid'},
    derivedStates:{
      structureState:'strong',
      setupLocationState:'extended',
      priceabilityState:'priceable',
      bounceState:'attempt'
    },
    globalVerdict:{
      final_verdict:'watch',
      structure_eligibility:'alive',
      viability:'watchlist',
      viabilityBranchId:'alive_watchlist'
    },
    storyContext:{
      currentPhase:'extended_from_support',
      buyerControl:{state:'none'}
    }
  });
  if(String(extendedFromSupportDecisionSummary || '').trim() !== 'Watch - constructive rebound, but price is already away from support.'){
    throw new Error('Extended-from-support summary must remain unchanged.');
  }

  const unpriceableDecisionSummary = sandbox.buildDecisionSummary({
    record:{ticker:'DPRICE', rawScore:7},
    finalVerdict:'watch',
    displayedPlan:{status:'valid'},
    resolvedContract:{structuralState:'developing', planStatusKey:'valid'},
    derivedStates:{
      structureState:'strong',
      setupLocationState:'near_20ma',
      priceabilityState:'unpriceable',
      bounceState:'attempt'
    },
    globalVerdict:{
      final_verdict:'watch',
      structure_eligibility:'alive',
      viability:'watchlist',
      viabilityBranchId:'alive_watchlist'
    },
    storyContext:{
      currentPhase:'responding_from_support',
      buyerControl:{state:'emerging'}
    }
  });
  if(!/price reliably/i.test(String(unpriceableDecisionSummary || '')) || /support is holding|buyers still need to prove control/i.test(String(unpriceableDecisionSummary || ''))){
    throw new Error('buildDecisionSummary must preserve the unpriceable blocker ahead of canonical chart-story copy.');
  }

  const lowScoreDecisionSummary = sandbox.buildDecisionSummary({
    record:{ticker:'DSCORE', rawScore:4},
    finalVerdict:'watch',
    displayedPlan:{status:'valid'},
    resolvedContract:{structuralState:'developing', planStatusKey:'valid'},
    derivedStates:{
      structureState:'developing_clean',
      setupLocationState:'near_20ma',
      priceabilityState:'priceable',
      bounceState:'attempt'
    },
    globalVerdict:{
      final_verdict:'watch',
      structure_eligibility:'alive',
      viability:'watchlist',
      viabilityBranchId:'alive_watchlist_low_score'
    },
    storyContext:{
      currentPhase:'responding_from_support',
      buyerControl:{state:'emerging'}
    }
  });
  if(!/support is holding|buyer control still needs confirmation/i.test(String(lowScoreDecisionSummary || '')) || /setup quality has slipped below useful watchlist quality/i.test(String(lowScoreDecisionSummary || ''))){
    throw new Error('buildDecisionSummary must prefer the canonical chart-story explanation when low-score is not an independent blocker.');
  }

  const invalidPlanDecisionSummary = sandbox.buildDecisionSummary({
    record:{ticker:'DPLAN', rawScore:7},
    finalVerdict:'watch',
    displayedPlan:{status:'missing'},
    resolvedContract:{structuralState:'developing', planStatusKey:'missing', blockerReason:'No valid invalidation level is available.'},
    derivedStates:{
      structureState:'strong',
      setupLocationState:'near_20ma',
      priceabilityState:'priceable',
      bounceState:'attempt'
    },
    globalVerdict:{
      final_verdict:'watch',
      structure_eligibility:'alive',
      viability:'watchlist',
      viabilityBranchId:'alive_watchlist'
    },
    storyContext:{
      currentPhase:'responding_from_support',
      buyerControl:{state:'emerging'}
    }
  });
  if(String(invalidPlanDecisionSummary || '').trim() !== 'No valid invalidation level is available.'){
    throw new Error('buildDecisionSummary must preserve the actual missing-plan blocker text when plan status controls.');
  }
  if(/support is holding|buyers still need to prove control/i.test(String(invalidPlanDecisionSummary || ''))){
    throw new Error('buildDecisionSummary must not replace a plan blocker with canonical chart-story copy.');
  }

  const invalidPlanNearEntryDecisionSummary = sandbox.buildDecisionSummary({
    record:{ticker:'DINVALID', rawScore:7},
    finalVerdict:'near_entry',
    displayedPlan:{status:'invalid'},
    resolvedContract:{structuralState:'near_entry', planStatusKey:'invalid', blockerReason:'Plan needs adjustment.'},
    derivedStates:{
      structureState:'strong',
      setupLocationState:'near_20ma',
      priceabilityState:'priceable',
      bounceState:'attempt'
    },
    globalVerdict:{
      final_verdict:'near_entry',
      structure_eligibility:'alive',
      viability:'watchlist',
      viabilityBranchId:'alive_watchlist'
    },
    storyContext:{
      currentPhase:'responding_from_support',
      buyerControl:{state:'emerging'}
    }
  });
  if(String(invalidPlanNearEntryDecisionSummary || '').trim() !== 'Plan needs adjustment.'){
    throw new Error('buildDecisionSummary must preserve the actual invalid-plan blocker text.');
  }
  if(/support is holding|trigger is still missing/i.test(String(invalidPlanNearEntryDecisionSummary || ''))){
    throw new Error('Invalid-plan Near Entry summary must not be replaced by canonical chart-story copy.');
  }

  const confirmationDecisionSummary = sandbox.buildDecisionSummary({
    record:{ticker:'DCONF', rawScore:7},
    finalVerdict:'near_entry',
    displayedPlan:{status:'valid'},
    resolvedContract:{structuralState:'near_entry', planStatusKey:'valid'},
    derivedStates:{
      structureState:'strong',
      setupLocationState:'near_20ma',
      priceabilityState:'priceable',
      bounceState:'attempt'
    },
    globalVerdict:{
      final_verdict:'near_entry',
      structure_eligibility:'alive',
      viability:'watchlist',
      viabilityBranchId:'alive_watchlist'
    },
    storyContext:{
      currentPhase:'responding_from_support',
      buyerControl:{state:'emerging'}
    }
  });
  if(String(confirmationDecisionSummary || '').trim() !== 'Near Entry - support is holding, but the trigger is still missing.'){
    throw new Error('buildDecisionSummary should use canonical chart-story summary when no non-chart blocker controls.');
  }

  const awayFromSupportMissingPlanDecisionSummary = sandbox.buildDecisionSummary({
    record:{ticker:'DAWAYPLAN', rawScore:7},
    finalVerdict:'watch',
    displayedPlan:{status:'missing'},
    resolvedContract:{structuralState:'developing', planStatusKey:'missing', blockerReason:'No valid invalidation level is available.'},
    derivedStates:{
      structureState:'strong',
      setupLocationState:'off_level',
      priceabilityState:'priceable',
      bounceState:'attempt'
    },
    globalVerdict:{
      final_verdict:'watch',
      structure_eligibility:'alive',
      viability:'watchlist',
      viabilityBranchId:'alive_watchlist'
    },
    storyContext:{
      currentPhase:'away_from_support',
      buyerControl:{state:'none'}
    }
  });
  if(String(awayFromSupportMissingPlanDecisionSummary || '').trim() !== 'No valid invalidation level is available.'){
    throw new Error('Non-chart plan blockers must still beat away-from-support summaries.');
  }

  const awayFromSupportLowScoreDecisionSummary = sandbox.buildDecisionSummary({
    record:{ticker:'DAWAYSCORE', rawScore:4},
    finalVerdict:'watch',
    displayedPlan:{status:'valid'},
    resolvedContract:{structuralState:'developing', planStatusKey:'valid'},
    derivedStates:{
      structureState:'developing_clean',
      setupLocationState:'off_level',
      priceabilityState:'priceable',
      bounceState:'attempt'
    },
    globalVerdict:{
      final_verdict:'watch',
      structure_eligibility:'alive',
      viability:'watchlist',
      viabilityBranchId:'alive_watchlist_low_score'
    },
    storyContext:{
      currentPhase:'away_from_support',
      buyerControl:{state:'none'}
    }
  });
  if(!/away from support|constructive rebound|wait for a reset/i.test(String(awayFromSupportLowScoreDecisionSummary || ''))){
    throw new Error('Low-score alone must not beat away-from-support canonical summaries.');
  }

  const originalBuildCanonicalStoryContextForRecord = sandbox.buildCanonicalStoryContextForRecord;
  sandbox.buildCanonicalStoryContextForRecord = undefined;
  const genericFallbackDecisionSummary = sandbox.buildDecisionSummary({
    record:{ticker:'DFALL', rawScore:7},
    finalVerdict:'watch',
    displayedPlan:{status:'valid'},
    resolvedContract:{structuralState:'developing', planStatusKey:'valid'},
    derivedStates:{
      structureState:'developing_clean',
      setupLocationState:'none',
      priceabilityState:'priceable',
      bounceState:'attempt'
    },
    globalVerdict:{
      final_verdict:'watch',
      structure_eligibility:'alive',
      viability:'watchlist',
      viabilityBranchId:'alive_watchlist'
    },
    storyContext:null
  });
  sandbox.buildCanonicalStoryContextForRecord = originalBuildCanonicalStoryContextForRecord;
  if(String(genericFallbackDecisionSummary || '').trim() !== 'Developing: still forming. Buyers have not taken control yet.'){
    throw new Error('buildDecisionSummary must still use the generic fallback summary when no blocker and no story context exist.');
  }

  const canonicalStructureStateFixtures = [
    {state:'developing', expected:'Structure developing'},
    {state:'developing_clean', expected:'Structure developing'},
    {state:'strong', expected:'Structure intact'},
    {state:'weakening', expected:'Structure weakening'},
    {state:'broken', expected:'Structure broken'},
    {state:'', expected:'Structure n/a'}
  ];
  canonicalStructureStateFixtures.forEach(fixture => {
    const label = sandbox.canonicalReviewTechnicalStructureLabelFromStoryContext({
      structure:{state:fixture.state}
    });
    if(label !== fixture.expected){
      throw new Error(`Canonical Review structure label mismatch for ${fixture.state || 'unknown'}: expected "${fixture.expected}", got "${label}".`);
    }
  });

  const volumeStateFixtures = [
    {state:'constructive', expected:'Volume constructive'},
    {state:'expanding', expected:'Volume expanding'},
    {state:'weak', expected:'Volume weak'},
    {state:'neutral', expected:'Volume neutral'},
    {state:'average', expected:'Volume neutral'},
    {state:'supportive', expected:'Volume expanding'},
    {state:'normal', expected:'Volume constructive'},
    {state:'', expected:'Volume n/a'},
    {state:'unknown', expected:'Volume n/a'}
  ];
  volumeStateFixtures.forEach(fixture => {
    const line = sandbox.canonicalReviewTechnicalContextLineFromStoryContext({
      structure:{state:'strong'},
      support:{label:'20MA'},
      buyerResponse:{semantic:'response_present'},
      buyerControl:{state:'emerging'},
      confirmation:{state:'follow_through_unconfirmed'},
      volume:{state:fixture.state},
      currentPhase:'responding_from_support'
    }, {});
    if(!line.includes(fixture.expected)){
      throw new Error(`Canonical Review volume projection mismatch for ${fixture.state || 'empty'}: expected technical context to include "${fixture.expected}", got "${line}".`);
    }
  });
}

function runCumulativePenaltyDisplayAssertions(){
  const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const sandbox = {
    console,
    state:{marketStatus:'S&P above 50 MA'},
    currentMaxLoss(){ return 40; },
    numericOrNull(value){
      if(value === null || value === undefined) return null;
      if(typeof value === 'string' && value.trim() === '') return null;
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    },
    normalizeAnalysisVerdict(value){
      const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
      if(safe === 'entry') return 'Entry';
      if(safe === 'near entry' || safe === 'near_entry') return 'Near Entry';
      if(safe === 'avoid') return 'Avoid';
      return 'Watch';
    },
    normalizeTickerRecord(record){
      return record && typeof record === 'object' ? record : {};
    },
    normalizeGlobalVerdictKey(value){
      const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
      if(safe === 'nearentry') return 'near_entry';
      if(['entry','near_entry','watch','avoid'].includes(safe)) return safe;
      return 'watch';
    },
    resolverSeedVerdictForRecord(record){
      return record && record.seedVerdict || 'Watch';
    },
    baseVerdictForRecord(){
      return 'Watch';
    },
    analysisDerivedStatesFromRecord(record){
      return record && record.derivedStates || {};
    },
    deriveCurrentPlanState(entry, stop, target, currency){
      const safeEntry = sandbox.numericOrNull(entry);
      const safeStop = sandbox.numericOrNull(stop);
      const safeTarget = sandbox.numericOrNull(target);
      const rrRatio = Number.isFinite(safeEntry) && Number.isFinite(safeStop) && Number.isFinite(safeTarget) && safeEntry > safeStop
        ? (safeTarget - safeEntry) / (safeEntry - safeStop)
        : null;
      const riskPerShare = Number.isFinite(safeEntry) && Number.isFinite(safeStop)
        ? Math.abs(safeEntry - safeStop)
        : null;
      const positionSize = Number.isFinite(riskPerShare) && riskPerShare > 0
        ? Math.max(1, Math.floor(40 / riskPerShare))
        : null;
      return {
        status:Number.isFinite(safeEntry) && Number.isFinite(safeStop) && Number.isFinite(safeTarget) ? 'valid' : 'missing',
        entry:safeEntry,
        stop:safeStop,
        target:safeTarget,
        rewardRisk:{rrRatio},
        riskFit:{
          risk_status:'acceptable',
          position_size:positionSize
        },
        affordability:'acceptable',
        capitalFit:{
          capital_fit:'acceptable',
          position_cost:Number.isFinite(positionSize) && Number.isFinite(safeEntry) ? positionSize * safeEntry : null,
          quote_currency:currency || 'USD'
        },
        tradeability:Number.isFinite(rrRatio) && rrRatio >= 2 ? 'watch' : 'invalid'
      };
    },
    isHostileMarketStatus(status){
      const safe = String(status || '').trim().toLowerCase();
      return safe.includes('below 50') || safe.includes('weak') || safe.includes('hostile');
    },
    structureLabelForRecord(){
      return '';
    },
    isTrueHardFailForRecord(record, derivedStates){
      const derived = derivedStates && typeof derivedStates === 'object' ? derivedStates : {};
      const structureState = String(derived.structureState || '').toLowerCase();
      const trendState = String(derived.trendState || '').toLowerCase();
      return structureState === 'broken' || trendState === 'broken' || !!(record && record.hardFail);
    },
    rawSetupScoreForRecord(record){
      const rawScore = sandbox.numericOrNull(record && (record.rawScore ?? record.baseScore ?? (record.setup && record.setup.baseScore)));
      return rawScore == null ? 0 : rawScore;
    },
    reviewPricedButNotReadyCopy(){
      return {
        line1:'The app knows the maths, but the trade isn\'t ready.',
        line2:'Long-press the ticker card in Track for more info.',
        rr:'Priced'
      };
    },
    review50MaSupportTestPresentationCopy(){
      return {
        tradeStatus:'Support test still in progress.',
        draftTradeStatus:'Draft plan possible, but not actionable yet.',
        blocker:'Testing 50MA support - waiting for buyer control to confirm.',
        technicalStructure:'Structure intact',
        technicalPullback:'Pullback near 50MA',
        technicalBounce:'Bounce not confirmed'
      };
    },
    reviewCopyEvidence(){
      return {consolidating:false, terminalAvoid:false, structuralWeakness:false, noBounce:false};
    },
    resolveReviewPullbackBounceDisplayContext(){
      return {
        rawPullbackState:'near_50ma',
        rawBounceState:'none',
        rawStabilisationState:'none',
        resolvedPullbackState:'near_50ma',
        pullbackLabel:'Pullback Near 50MA',
        bounceLabel:'No buyer control',
        setupLocationState:'near_50ma',
        structureState:'weak',
        structureEligibility:'alive',
        reconciliationApplied:false,
        reconciliationReason:''
      };
    },
    reviewTechnicalStructureLabel(){ return 'Structure intact'; },
    reviewTechnicalVolumeLabel(){ return 'Volume normal'; },
    reviewTechnicalMarketLabel(){ return 'Market weak'; },
    reviewConsolidationPresentationCopy(){
      return {summary:'', blocker:'', nextAction:''};
    },
    normalizeVisualBucketForPairing(value){
      const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
      if(['entry','near_entry','monitor','diminishing','avoid'].includes(safe)) return safe;
      return 'monitor';
    },
    normalizeTicker(value){
      return String(value || '').trim().toUpperCase();
    },
    normalizeTickerRecord(record){
      return record && typeof record === 'object' ? record : {};
    },
    todayIsoDate(){
      return '2026-06-23';
    },
    downloadJsonFile(filename, data){
      sandbox.__lastDownload = {filename, data};
      return true;
    },
    allTickerRecords(){
      return Array.isArray(sandbox.__allTickerRecords) ? sandbox.__allTickerRecords : [];
    },
    isTerminalDeadSetup(record, options = {}){
      const derived = options.derivedStates || (record && record.derivedStates) || {};
      return {dead:String(derived.structureState || '').trim().toLowerCase() === 'broken'};
    },
    sameVisibleCopy(a, b){
      return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
    }
  };
  vm.createContext(sandbox);
  [
    'practicalSizeFlagForPlan',
    'penaltyTraceSources',
    'appendCumulativePenaltyTrace',
    'markPenaltyTraceApplied',
    'markPenaltyTraceSkipped',
    'penaltyReasonLabelFromSource',
    'evaluateSetupQualityAdjustments',
    'entryPromotionAuditCheckDefinitions',
    'entryPromotionAuditEligible',
    'entryPromotionAuditCheckResult',
    'entryPromotionAuditTriggerSource',
    'buildEntryPromotionAuditSnapshot',
    'updateEntryPromotionAudit',
    'cumulativePenaltyTraceForRecord',
    'warningStateFromInputs',
    'deriveDisplaySetupScore',
    'isAccepted50MaSupportTestDisplayState',
    'buildDecisionSemantics',
    'reviewDecisionSummaryFromSemantics',
    'reviewNextActionFromDecisionSemantics',
    'buildResolvedReviewDisplayModel'
  ].forEach(functionName => {
    vm.runInContext(extractFunctionSource(appSource, functionName), sandbox, {filename:`app.js#${functionName}`});
  });

  const weakMarketRecord = {
    ticker:'HWM',
    rawScore:7,
    seedVerdict:'Watch',
    meta:{marketStatus:'weak'},
    marketData:{price:99, sma50:100, currency:'USD'},
    plan:{entry:100, stop:97, firstTarget:106},
    derivedStates:{
      structureState:'intact',
      trendState:'intact',
      bounceState:'attempt',
      stabilisationState:'early',
      volumeState:'normal',
      pullbackZone:'near_50ma'
    }
  };
  const weakWarning = sandbox.warningStateFromInputs(weakMarketRecord, null, weakMarketRecord.derivedStates);
  const weakTraceSources = sandbox.penaltyTraceSources(weakWarning.cumulativePenaltyTrace);
  const weakMarketTrace = weakTraceSources.find(entry => entry && entry.id === 'weak_market_tape');
  if(!weakMarketTrace){
    throw new Error('Weak market trace source must be present for weak-market setups.');
  }
  if(weakWarning.reasons.filter(reason => /weak market needs stronger confirmation|hostile market/i.test(String(reason || ''))).length !== 1){
    throw new Error('Weak market caution should appear once in warning reasons.');
  }
  if(weakTraceSources.filter(entry => entry && entry.id === 'weak_market_tape').length !== 1){
    throw new Error('Weak market caution must have a single trace source entry.');
  }
  const autoDisplayScore = sandbox.deriveDisplaySetupScore(weakMarketRecord, {
    derivedStates:weakMarketRecord.derivedStates,
    warningState:weakWarning
  });
  const manualWarningState = {
    ...weakWarning,
    showWarning:true,
    reasons:[...weakWarning.reasons, 'Manual review warning']
  };
  const manualDisplayScore = sandbox.deriveDisplaySetupScore(weakMarketRecord, {
    derivedStates:weakMarketRecord.derivedStates,
    warningState:manualWarningState
  });
  if(autoDisplayScore !== manualDisplayScore){
    throw new Error('Display score must not take an extra weak-market hit from warningState after the trace path already consumed it.');
  }
  const supportiveScore = sandbox.deriveDisplaySetupScore({
    ...weakMarketRecord,
    meta:{marketStatus:'S&P above 50 MA'}
  }, {
    derivedStates:weakMarketRecord.derivedStates
  });
  if(supportiveScore - autoDisplayScore > 1){
    throw new Error('Weak market caution should not stack into more than a single display-score step relative to the supportive baseline.');
  }
  if(!weakMarketTrace.appliedWhere.includes('warning_state') || !weakMarketTrace.appliedWhere.includes('display_setup_score')){
    throw new Error('Weak market trace must report actual consumption by warning_state and display_setup_score.');
  }

  const terminalRecord = {
    ticker:'ABNB',
    rawScore:6,
    seedVerdict:'Watch',
    meta:{marketStatus:'weak'},
    marketData:{price:90, sma50:100, currency:'USD'},
    plan:{entry:100, stop:97, firstTarget:106},
    derivedStates:{
      structureState:'broken',
      trendState:'intact',
      bounceState:'attempt',
      stabilisationState:'early',
      volumeState:'normal',
      pullbackZone:'near_50ma'
    }
  };
  const terminalTrace = sandbox.cumulativePenaltyTraceForRecord(terminalRecord, {derivedStates:terminalRecord.derivedStates});
  const terminalSources = sandbox.penaltyTraceSources(terminalTrace);
  const brokenStructureTrace = terminalSources.find(entry => entry && entry.id === 'broken_structure');
  const bounceTrace = terminalSources.find(entry => entry && entry.id === 'bounce_unconfirmed');
  if(!brokenStructureTrace || !brokenStructureTrace.appliedWhere.includes('canonical_verdict') || brokenStructureTrace.canonicalImpact !== true){
    throw new Error('Terminal blockers must still report canonical application and win.');
  }
  if(!bounceTrace || bounceTrace.appliedWhere.includes('canonical_verdict') || bounceTrace.canonicalImpact === true || bounceTrace.skippedReason !== 'terminal_short_circuit'){
    throw new Error('Bounce soft cautions must not claim canonical impact after a terminal blocker short-circuits the canonical path.');
  }
  const terminalDisplayScore = sandbox.deriveDisplaySetupScore(terminalRecord, {
    derivedStates:terminalRecord.derivedStates,
    displayStage:'Avoid'
  });
  if(terminalDisplayScore > 3){
    throw new Error('Terminal blockers must still keep the display score in the avoid/dead range.');
  }

  const nearEntryAuditRecord = {
    ticker:'NVDA',
    marketData:{price:100, currency:'USD'},
    meta:{marketStatus:'supportive'},
    plan:{entry:102, stop:98, firstTarget:110},
    entryPromotionAudit:{history:[]},
    derivedStates:{
      structureState:'strong',
      trendState:'intact',
      bounceState:'improving',
      stabilisationState:'early',
      volumeState:'normal',
      pullbackZone:'near_20ma'
    }
  };
  const nearEntryAudit = sandbox.buildEntryPromotionAuditSnapshot(nearEntryAuditRecord, {
    source:'review_save',
    timestamp:'2026-06-23T12:00:00.000Z',
    globalVerdict:{
      final_verdict:'near_entry',
      entry_gate_pass:false,
      near_entry_gate_pass:true,
      entry_gate_checks:{
        structure_ok:true,
        bounce_ok:false,
        pullback_ok:true,
        market_ok:true,
        volume_ok:true,
        plan_visible:true,
        has_entry:true,
        has_stop:true,
        plan_ok:true,
        risk_width_ok:true,
        pullback_valid:true,
        rr_ok:true,
        entry_trigger_hit:false,
        tradeability_ok:true,
        capital_ok:true,
        has_clear_invalidation_level:true,
        has_priceable_plan:true,
        reclaim_confirmed_independent:false,
        unpriceable_block:false,
        below_50_without_reclaim:false
      }
    },
    derivedStates:nearEntryAuditRecord.derivedStates,
    displayedPlan:{
      entry:102,
      stop:98,
      target:110,
      status:'valid',
      rewardRisk:{rrRatio:2}
    },
    resolvedContract:{
      actionStateKey:'wait_for_confirmation',
      structuralState:'near_entry'
    },
    visualBucket:'near_entry',
    trigger:{
      breakAboveTrigger:false,
      strongReversal:false,
      reclaimFollowThrough:false,
      entryTriggerReady:false,
      nearReady:true
    }
  });
  if(nearEntryAudit.currentVerdict !== 'near_entry' || nearEntryAudit.failedEntryChecks.length < 1 || nearEntryAudit.firstFailedEntryCheck.id !== 'bounce_ok'){
    throw new Error('Near Entry ticker audit must record the failed Entry checks in order.');
  }

  const circularAudit = sandbox.buildEntryPromotionAuditSnapshot(nearEntryAuditRecord, {
    source:'watchlist_lifecycle',
    timestamp:'2026-06-23T12:05:00.000Z',
    globalVerdict:{
      final_verdict:'near_entry',
      entry_gate_pass:false,
      near_entry_gate_pass:true,
      entry_gate_checks:{
        structure_ok:true,
        bounce_ok:true,
        pullback_ok:true,
        market_ok:true,
        volume_ok:true,
        plan_visible:true,
        has_entry:true,
        has_stop:true,
        plan_ok:true,
        risk_width_ok:true,
        pullback_valid:true,
        rr_ok:true,
        entry_trigger_hit:true,
        tradeability_ok:true,
        capital_ok:true,
        has_clear_invalidation_level:true,
        has_priceable_plan:true,
        reclaim_confirmed_independent:true,
        unpriceable_block:false,
        below_50_without_reclaim:false
      }
    },
    derivedStates:nearEntryAuditRecord.derivedStates,
    displayedPlan:{
      entry:102,
      stop:98,
      target:110,
      status:'valid',
      rewardRisk:{rrRatio:2}
    },
    resolvedContract:{
      actionStateKey:'ready_to_act',
      structuralState:'entry'
    },
    visualBucket:'near_entry',
    trigger:{
      breakAboveTrigger:false,
      strongReversal:false,
      reclaimFollowThrough:false,
      entryTriggerReady:false,
      nearReady:false
    }
  });
  if(circularAudit.triggerAudit.source !== 'resolver_state_derived' || circularAudit.circularTriggerSuspected !== true){
    throw new Error('Circular trigger suspicion must be flagged when entry_trigger_hit depends on Entry-like resolver state.');
  }

  const staleAudit = sandbox.buildEntryPromotionAuditSnapshot(nearEntryAuditRecord, {
    source:'system',
    timestamp:'2026-06-23T12:10:00.000Z',
    globalVerdict:{
      final_verdict:'near_entry',
      entry_gate_pass:false,
      near_entry_gate_pass:true,
      entry_gate_checks:{
        structure_ok:true,
        bounce_ok:false,
        pullback_ok:true,
        market_ok:true,
        volume_ok:true,
        plan_visible:true,
        has_entry:true,
        has_stop:true,
        plan_ok:true,
        risk_width_ok:true,
        pullback_valid:true,
        rr_ok:true,
        entry_trigger_hit:false,
        tradeability_ok:true,
        capital_ok:true,
        has_clear_invalidation_level:true,
        has_priceable_plan:true,
        reclaim_confirmed_independent:false,
        unpriceable_block:false,
        below_50_without_reclaim:false
      }
    },
    derivedStates:nearEntryAuditRecord.derivedStates,
    displayedPlan:{
      entry:102,
      stop:98,
      target:110,
      status:'valid',
      rewardRisk:{rrRatio:2}
    },
    resolvedContract:{
      actionStateKey:'wait_for_confirmation',
      structuralState:'near_entry'
    },
    visualBucket:'near_entry',
    staleDataPreventedFreshPromotionPass:true,
    trigger:{
      breakAboveTrigger:false,
      strongReversal:false,
      reclaimFollowThrough:false,
      entryTriggerReady:false,
      nearReady:true
    }
  });
  if(staleAudit.staleDataPreventedFreshPromotionPass !== true){
    throw new Error('Entry audit must flag when stale data prevented a fresh promotion pass.');
  }

  const historyRecord = {
    ticker:'CRM',
    entryPromotionAudit:{history:[]}
  };
  for(let index = 0; index < 12; index += 1){
    sandbox.updateEntryPromotionAudit(historyRecord, {
      source:'review_save',
      timestamp:`2026-06-23T12:${String(index).padStart(2, '0')}:00.000Z`,
      globalVerdict:{
        final_verdict:'near_entry',
        entry_gate_pass:false,
        near_entry_gate_pass:true,
        entry_gate_checks:{
          structure_ok:true,
          bounce_ok:false,
          pullback_ok:true,
          market_ok:true,
          volume_ok:true,
          plan_visible:true,
          has_entry:true,
          has_stop:true,
          plan_ok:true,
          risk_width_ok:true,
          pullback_valid:true,
          rr_ok:true,
          entry_trigger_hit:false,
          tradeability_ok:true,
          capital_ok:true,
          has_clear_invalidation_level:true,
          has_priceable_plan:true,
          reclaim_confirmed_independent:false,
          unpriceable_block:false,
          below_50_without_reclaim:false
        }
      },
      derivedStates:nearEntryAuditRecord.derivedStates,
      displayedPlan:{
        entry:102,
        stop:98,
        target:110,
        status:'valid',
        rewardRisk:{rrRatio:2}
      },
      resolvedContract:{
        actionStateKey:'wait_for_confirmation',
        structuralState:'near_entry'
      },
      visualBucket:'near_entry',
      trigger:{
        breakAboveTrigger:false,
        strongReversal:false,
        reclaimFollowThrough:false,
        entryTriggerReady:false,
        nearReady:true
      }
    });
  }
  if(!historyRecord.entryPromotionAudit || historyRecord.entryPromotionAudit.history.length !== 10){
    throw new Error('Entry promotion audit history must keep the latest 10 snapshots.');
  }
  const accepted50Record = {
    ticker:'HWM',
    marketData:{price:248.63, sma50:250.23, currency:'USD'},
    watchlist:{debug:{structural_alive_at_refresh:'true', refresh_demote_reason:'Structurally alive; keep on monitor.'}}
  };
  const accepted50Resolved = sandbox.buildResolvedReviewDisplayModel({
    record:accepted50Record,
    simplifiedState:{
      canonicalVerdict:'watch',
      structureState:'weak',
      structureEligibility:'alive',
      bounceState:'none',
      volumeState:'normal'
    },
    globalVerdict:{
      final_verdict:'watch',
      structure_eligibility:'alive',
      structure_state:'weak',
      pullback_ok:true,
      near_entry_pullback_zone_accepted:true,
      pullback_zone:'near_50ma',
      bounce_state:'none',
      refresh_demote_reason:'Structurally alive; keep on monitor.'
    },
    reviewSemanticStatus:{
      tradeStatus:{line1:'Watch patiently', line2:'Wait for confirmation.'},
      blocker:'Watch patiently',
      primaryReason:'Watch patiently',
      showPlanFields:false,
      showPlanMetrics:false,
      showCapital:false,
      rrDisplay:'No actionable plan yet.'
    },
    derivedStates:{
      structureState:'weak',
      structureEligibility:'alive',
      pullbackZone:'near_50ma',
      bounceState:'none'
    },
    displayedPlan:{status:'missing'},
    planRealism:{}
  });
  if(String(accepted50Resolved.tradeStatus.line1 || '') !== 'Support test still in progress.'){
    throw new Error('Accepted 50MA support-test Review wrapper must keep the protected support-test trade status copy.');
  }
  if(!/Pullback near 50MA/i.test(String(accepted50Resolved.technicalContextLine || ''))){
    throw new Error('Accepted 50MA support-test Review wrapper must keep the support-test technical pullback copy.');
  }
}

function runAccepted50MaSupportThresholdAssertions(){
  const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const domainSource = fs.readFileSync(path.join(root, 'js/domain/simplified-trade-state.js'), 'utf8');
  const scannerSource = fs.readFileSync(path.join(root, 'js/scanner-view.js'), 'utf8');
  const baseSandbox = {
    console,
    numericOrNull(value){
      if(value === null || value === undefined) return null;
      if(typeof value === 'string' && value.trim() === '') return null;
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    },
    readNumber(value){
      if(value === null || value === undefined || value === '') return null;
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    },
    normalizeGlobalVerdictKey(value){
      const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
      if(safe === 'nearentry') return 'near_entry';
      if(['entry','near_entry','watch','avoid','monitor'].includes(safe)) return safe === 'monitor' ? 'watch' : safe;
      return 'watch';
    },
    canonicalVerdict(value){
      const safe = String(value || '').trim().toLowerCase();
      return safe === 'avoid' ? 'avoid' : 'watch';
    }
  };
  const appSandbox = {...baseSandbox};
  vm.createContext(appSandbox);
  vm.runInContext(extractFunctionSource(appSource, 'isAccepted50MaSupportTestDisplayState'), appSandbox, {filename:'app.js#isAccepted50MaSupportTestDisplayState'});
  const domainSandbox = {...baseSandbox};
  vm.createContext(domainSandbox);
  vm.runInContext(extractFunctionSource(domainSource, 'accepted50MaSupportTestDisplayState'), domainSandbox, {filename:'simplified-trade-state.js#accepted50MaSupportTestDisplayState'});
  const scannerSandbox = {...baseSandbox};
  vm.createContext(scannerSandbox);
  vm.runInContext(extractFunctionSource(scannerSource, 'accepted50MaSupportTestForScan'), scannerSandbox, {filename:'scanner-view.js#accepted50MaSupportTestForScan'});
  const hwmRecord = {
    ticker:'HWM',
    marketData:{price:248.63, sma50:250.23},
    watchlist:{debug:{structural_alive_at_refresh:'true', refresh_demote_reason:'Structurally alive; keep on monitor.'}}
  };
  const resolved = {
    final_verdict:'watch',
    structure_eligibility:'alive',
    structure_state:'weak',
    pullback_ok:true,
    near_entry_pullback_zone_accepted:true,
    pullback_zone:'near_50ma',
    bounce_state:'none',
    refresh_demote_reason:'Structurally alive; keep on monitor.'
  };
  const derived = {
    structureState:'weak',
    structureEligibility:'alive',
    pullbackZone:'near_50ma',
    bounceState:'none'
  };
  if(appSandbox.isAccepted50MaSupportTestDisplayState({record:hwmRecord, globalVerdict:resolved, derivedStates:derived}) !== true){
    throw new Error('App Review/Track helper must keep slight below-50MA alive support tests in the accepted support-test display state.');
  }
  if(domainSandbox.accepted50MaSupportTestDisplayState(hwmRecord, resolved, derived) !== true){
    throw new Error('Simplified state source must keep slight below-50MA alive support tests in the accepted support-test display state.');
  }
  if(scannerSandbox.accepted50MaSupportTestForScan(hwmRecord, {canonicalVerdict:'watch'}, resolved, derived) !== true){
    throw new Error('Scanner helper must keep slight below-50MA alive support tests in the accepted support-test display state.');
  }
  const brokenRecord = {
    ticker:'HWM',
    marketData:{price:246, sma50:250.23},
    watchlist:{debug:{structural_alive_at_refresh:'true', refresh_demote_reason:'Structurally alive; keep on monitor.'}}
  };
  if(domainSandbox.accepted50MaSupportTestDisplayState(brokenRecord, resolved, derived) !== false){
    throw new Error('Accepted 50MA support-test display must still reject a more decisive break below the 50MA.');
  }
}

function runBuyerControlLegacyFallbackAssertions(){
  const scannerView = sandbox.window.ScannerView;
  const scannerCardShell = sandbox.window.ScannerCardShell;
  if(!scannerView || typeof scannerView.resolveBuyerControlState !== 'function' || typeof scannerView.buyerControlLabelForDerivedStates !== 'function'){
    throw new Error('ScannerView buyer-control compatibility helpers are unavailable.');
  }
  if(!scannerCardShell || typeof scannerCardShell.scanCardSummaryForView !== 'function'){
    throw new Error('ScannerCardShell summary helper is unavailable.');
  }

  const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const compactSandbox = {
    console,
    numericOrNull(value){
      if(value === null || value === undefined) return null;
      if(typeof value === 'string' && value.trim() === '') return null;
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    },
    pullbackStateLabel(state){
      const safe = String(state || '').trim().toLowerCase();
      if(safe === 'near_20ma') return 'Near 20MA';
      if(safe === 'near_50ma') return 'Near 50MA';
      return safe || 'none';
    },
    normalizeTickerRecord(record){
      return record && typeof record === 'object' ? record : {};
    },
    currentRrThreshold(){ return 2; },
    shortlistStructureBadgeForView(){ return {label:'Strong'}; },
    structureLabelForRecord(){ return 'Strong structure'; },
    displayStageForRecord(){ return 'Watch'; },
    warningStateFromInputs(){ return {reasons:[]}; },
    resultReasonForRecord(){ return 'Fallback'; },
    resolveBuyerControlStateImpl:scannerView.resolveBuyerControlState,
    buyerControlLabelForDerivedStatesImpl:scannerView.buyerControlLabelForDerivedStates
  };
  vm.createContext(compactSandbox);
  [
    'resolveBuyerControlState',
    'buyerControlLabelForDerivedStates',
    'compactReasonLineForView',
    'compactReasonLineForRecord'
  ].forEach(functionName => {
    vm.runInContext(extractFunctionSource(appSource, functionName), compactSandbox, {filename:`app.js#${functionName}`});
  });

  function scannerViewDepsForDerived(derived){
    return {
      projectTickerForCard(record){
        return {
          item:record,
          displayedPlan:{},
          effectivePlan:{},
          planUiState:{state:'valid', label:'Valid'},
          setupUiState:{state:'watch'},
          setupScore:8,
          setupScoreDisplay:'8',
          rrValue:null,
          actionableRrValue:null,
          displayStage:'Watch'
        };
      },
      analysisDerivedStatesFromRecord(){ return {...derived}; },
      numericOrNull(value){
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : null;
      },
      normalizeTicker(value){ return String(value || '').trim().toUpperCase(); },
      normalizeTickerRecord(record){ return record && typeof record === 'object' ? record : {}; },
      resolveSimplifiedStateForSurface(){ return {}; },
      targetReviewQueueLabel(){ return ''; },
      currentSetupType(){ return 'pullback'; },
      resolveEmojiPresentation(){ return {primaryState:'monitor'}; },
      evaluatePlanRealism(){ return {}; },
      fmtPrice(value){ return String(value || ''); },
      normalizeScanType(){ return 'pullback'; },
      globalVerdictLabel(value){
        const safe = String(value || '').trim().toLowerCase();
        if(safe === 'entry') return 'Entry';
        if(safe === 'near_entry') return 'Near Entry';
        if(safe === 'avoid') return 'Avoid';
        return 'Watch';
      },
      getBucket(value){ return value === 'entry' ? 'tradeable_entry' : 'monitor_watch'; },
      getBadge(){ return {text:'Watch', className:'watch'}; },
      resolveGlobalVerdict(){ return {final_verdict:'watch'}; },
      resolveVisualState(){
        return {
          finalVerdict:'watch',
          final_verdict:'watch',
          badge:{text:'Watch', className:'watch'},
          bucket:'monitor_watch'
        };
      },
      normalizeGlobalVerdictKey(value){
        const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
        return ['entry','near_entry','avoid'].includes(safe) ? safe : 'watch';
      },
      normalizeVerdict(value){
        const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
        return ['entry','near_entry','avoid'].includes(safe) ? safe : 'watch';
      },
      primaryVerdictBadge(){ return {label:'Watch', className:'watch'}; },
      setupUiLabel(){ return 'Watch'; },
      setupUiClass(){ return 'watch'; },
      shouldShowActionableRR(){ return false; },
      structureLabelForRecord(){ return 'Strong'; },
      resultSortScoreFromRecord(){ return 0; },
      resolveScannerStateWithTrace(){ return {setupState:'watch', reason_codes:[], trace:[], warnings:[]}; },
      escapeHtml(value){ return String(value || ''); },
      primaryShortlistStatusChip(){ return {label:'Watch', className:'watch'}; },
      normalizeAnalysisVerdict(){ return 'watch'; },
      getActions(){ return {label:'WATCH'}; },
      scanPresentationForView(){ return {}; },
      resolveBuyerControlState:scannerView.resolveBuyerControlState,
      buyerControlLabelForDerivedStates:scannerView.buyerControlLabelForDerivedStates
    };
  }

  function assertCase(id, derived, expectations){
    const record = {
      ticker:'LEG',
      meta:{companyName:'Legacy', exchange:'NYSE'},
      setup:{marketCaution:false},
      plan:{hasValidPlan:true, plannedRR:2},
      scan:{estimatedRR:2},
      marketData:{}
    };
    const view = {
      item:record,
      ticker:'LEG',
      setupStates:{...derived}
    };
    const scannerResolved = scannerView.buildFinalSetupView(record, {}, scannerViewDepsForDerived(derived));
    const shellSummary = scannerCardShell.scanCardSummaryForView(view, {
      analysisDerivedStatesFromRecord(){ return {...derived}; },
      shortlistStructureBadgeForView(){ return {label:'Strong'}; },
      buyerControlLabelForDerivedStates:scannerView.buyerControlLabelForDerivedStates
    });
    compactSandbox.analysisDerivedStatesFromRecord = () => ({...derived});
    const compactViewText = compactSandbox.compactReasonLineForView({
      item:record,
      setupStates:{...derived}
    }, 3);
    const compactRecordText = compactSandbox.compactReasonLineForRecord(record, 3);

    if(scannerResolved.bounceLabel !== expectations.scannerView){
      throw new Error(`${id}: scanner view expected "${expectations.scannerView}" but got "${scannerResolved.bounceLabel}".`);
    }
    if(String(shellSummary.secondary || '') !== expectations.scannerCard){
      throw new Error(`${id}: scanner card shell expected "${expectations.scannerCard}" but got "${shellSummary.secondary}".`);
    }
    if(!String(compactViewText || '').includes(expectations.compact)){
      throw new Error(`${id}: compactReasonLineForView expected to include "${expectations.compact}" but got "${compactViewText}".`);
    }
    if(!String(compactRecordText || '').includes(expectations.compact)){
      throw new Error(`${id}: compactReasonLineForRecord expected to include "${expectations.compact}" but got "${compactRecordText}".`);
    }
  }

  assertCase('legacy_confirmed_fallback', {
    buyerControlState:'none',
    bounceState:'confirmed',
    supportTestState:'held',
    pullbackState:'near_20ma',
    trendState:'strong',
    stabilisationState:'clear'
  }, {
    scannerView:'Buyers confirmed',
    scannerCard:'Buyers confirmed',
    compact:'Buyers confirmed'
  });

  assertCase('legacy_attempt_fallback', {
    buyerControlState:'none',
    bounceState:'attempt',
    supportTestState:'held',
    pullbackState:'near_20ma',
    trendState:'strong',
    stabilisationState:'early'
  }, {
    scannerView:'Buyers emerging',
    scannerCard:'Buyers emerging',
    compact:'Buyers emerging'
  });

  assertCase('missing_modern_fallback', {
    bounceState:'confirmed',
    supportTestState:'held',
    pullbackState:'near_20ma',
    trendState:'strong',
    stabilisationState:'clear'
  }, {
    scannerView:'Buyers confirmed',
    scannerCard:'Buyers confirmed',
    compact:'Buyers confirmed'
  });

  assertCase('modern_emerging_wins', {
    buyerControlState:'emerging',
    bounceState:'confirmed',
    supportTestState:'held',
    pullbackState:'near_20ma',
    trendState:'strong',
    stabilisationState:'early'
  }, {
    scannerView:'Buyers emerging',
    scannerCard:'Buyers emerging',
    compact:'Buyers emerging'
  });

  assertCase('modern_confirmed_wins', {
    buyerControlState:'confirmed',
    bounceState:'attempt',
    supportTestState:'held',
    pullbackState:'near_20ma',
    trendState:'strong',
    stabilisationState:'clear'
  }, {
    scannerView:'Buyers confirmed',
    scannerCard:'Buyers confirmed',
    compact:'Buyers confirmed'
  });

  assertCase('no_evidence', {
    buyerControlState:'none',
    bounceState:'none',
    supportTestState:'not_tested',
    trendState:'strong'
  }, {
    scannerView:'No buyer control',
    scannerCard:'No buyer control yet',
    compact:'No buyer control'
  });
}

function runScannerProjectionAuthorityAssertions(){
  const scannerViewSource = fs.readFileSync(path.join(root, 'js/scanner-view.js'), 'utf8');
  const scannerProjectionSandbox = {
    window:{},
    console
  };
  vm.createContext(scannerProjectionSandbox);
  vm.runInContext(scannerViewSource, scannerProjectionSandbox, {filename:'js/scanner-view.js'});
  const deps = {
    projectTickerForCard(record){
      return {
        item:{
          ...record,
          scan:{
            ...(record.scan || {})
          },
          meta:{
            ...(record.meta || {})
          }
        },
        displayedPlan:{status:'valid'},
        setupUiState:{state:'entry'},
        planUiState:{state:'valid', label:'Plan valid'},
        displayStage:'Entry',
        setupScore:6,
        setupScoreDisplay:'Setup 6/10',
        effectivePlan:{entry:110.27, stop:102.29, firstTarget:136.19}
      };
    },
    analysisDerivedStatesFromRecord(){
      return {structureState:'strong', bounceState:'attempt', pullbackZone:'none'};
    },
    primaryVerdictBadge(){
      return {label:'Entry', className:'ready'};
    },
    setupUiLabel(){
      return 'Ready';
    },
    setupUiClass(){
      return 'ready';
    },
    resolveScannerStateWithTrace(){
      return {setupState:'entry', reason_codes:[]};
    },
    resolveVisualState(){
      return {
        finalVerdict:'watch',
        final_verdict:'watch',
        badge:{text:'Watch', className:'watch'},
        bucket:'monitor_watch'
      };
    },
    resolveEmojiPresentation(){
      return {
        primaryText:'Watch',
        shortLabel:'Watch'
      };
    },
    normalizeGlobalVerdictKey(value){
      return String(value || '').trim().toLowerCase();
    },
    numericOrNull(value){
      if(value === null || value === undefined || String(value).trim() === '') return null;
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    },
    globalVerdictLabel(value){
      const safe = String(value || '').trim().toLowerCase();
      if(safe === 'entry') return 'Entry';
      if(safe === 'near_entry') return 'Near Entry';
      if(safe === 'avoid') return 'Avoid';
      return 'Watch';
    },
    getBadge(){
      return {text:'Watch', className:'watch'};
    },
    getBucket(value){
      return value === 'entry' ? 'tradeable_entry' : 'monitor_watch';
    },
    shouldShowActionableRR(){
      return false;
    },
    structureLabelForRecord(){
      return 'Strong';
    }
  };
  const record = {
    ticker:'TROW',
    meta:{companyName:'T. Rowe Price'},
    scan:{
      resolvedVerdict:'',
      resolvedFinalDisplayState:'',
      resolvedBucket:''
    }
  };
  const view = scannerProjectionSandbox.window.ScannerView.buildFinalSetupView(record, {}, deps);
  if(view.item.scan.resolvedVerdict || view.item.scan.resolvedFinalDisplayState || view.item.scan.resolvedBucket){
    throw new Error('buildFinalSetupView must not write soft scan presentation verdict fields onto its projected item.');
  }
}

function runPaperTradePublicationAuthorityAssertions(){
  const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const contextSource = extractFunctionSource(appSource, 'currentPaperTradeContextForTicker');
  const liveContextSource = contextSource.split('// Legacy path below is retained only as unreachable diagnostic reference.')[0];
  if(!/return canonicalPaperTradeContextFromPublication\(publicationRecord, publication\);/.test(liveContextSource)){
    throw new Error('Paper Trade context must return only the publication-derived mapper result.');
  }
  ['refreshTrackedTickerState', 'deriveCurrentPlanState', 'resolveCanonicalTradePlanAuthority', 'applyReviewWatchlistSoftReadinessDisplayOverride', 'record.plan'].forEach((forbidden) => {
    if(liveContextSource.includes(forbidden)) throw new Error(`Paper Trade live context must not invoke ${forbidden}.`);
  });
  const mapperSource = extractFunctionSource(appSource, 'canonicalPaperTradeContextFromPublication');
  const decisionSource = mapperSource.split('const legacyProjection =')[0];
  if(!/const plan = failed \? null : publication\.canonicalPlan;/.test(decisionSource)
    || /record\.plan|effectivePlan|deriveCurrentPlanState|calculateRewardRisk|positionSizeFor/.test(decisionSource)){
    throw new Error('Paper Trade decision fields must be sourced only from the canonical publication plan payload.');
  }
  if(!/diagnosticOnly:true, mayFeedDecisionLogic:false/.test(mapperSource)){
    throw new Error('Paper Trade legacy projections must be explicitly diagnostic-only.');
  }
  const submitSource = extractFunctionSource(appSource, 'submitPaperTradeFromReview');
  if(!/snapshotMatchesPublication/.test(submitSource)
    || !/!context\.eligibility\.eligible \|\| !context\.paperTradeEnabled \|\| !snapshotMatchesPublication/.test(submitSource)){
    throw new Error('Paper Trade submit must require a matching eligible canonical publication snapshot.');
  }
}

async function runAllAssertions(){
  runTrackPresentationAuthorityAssertions();
  runScannerPolicyCompatibilityAssertions();
  runTesterSetupPersistenceFallbackAssertions();
  runTesterSetupUiGateAssertions();
  runAdvancedScannerUiConsistencyAssertions();
  runTradeExecutionRoutingAssertions();
  runPlanSemanticsAssertions();
  runReviewPullbackBounceDisplayAssertions();
  runBuyerControlLegacyFallbackAssertions();
  runCanonicalPullbackParityAssertions();
  runReviewPricedButNotReadyAssertions();
  runCumulativePenaltyDisplayAssertions();
  runAccepted50MaSupportThresholdAssertions();
  runScannerProjectionAuthorityAssertions();
  runTesterProfileResetAssertions();
  runCanonicalDecisionInvariantAssertions();
  runPaperTradePublicationAuthorityAssertions();
  await runTrackedStateTesterIsolationAssertions();
  await runTesterReportAssertions();

  console.log(`Resolver gate assertions passed (${results.length} cases).`);
  console.log('Review projection invariant assertions passed.');
  console.log('Watchlist long-press summary assertions passed.');
  console.log('Simplified state pipeline assertions passed.');
  console.log('AI chart-coach contract assertions passed.');
  console.log('Track presentation authority assertions passed.');
  console.log('Scanner policy compatibility assertions passed.');
  console.log('Tester setup fallback persistence assertions passed.');
  console.log('Tester setup UI gate assertions passed.');
  console.log('Advanced scanner UI consistency assertions passed.');
  console.log('Trade execution routing assertions passed.');
  console.log('Plan source semantics assertions passed.');
  console.log('Review pullback/bounce display assertions passed.');
  console.log('Review priced-but-not-ready assertions passed.');
  console.log('Cumulative penalty display assertions passed.');
  console.log('Accepted 50MA support threshold assertions passed.');
  console.log('Scanner projection authority assertions passed.');
  console.log('Tester profile reset assertions passed.');
  console.log('Canonical decision invariant assertions passed.');
  console.log('Paper Trade publication-authority assertions passed.');
  console.log('Tracked-state tester isolation assertions passed.');
  console.log('Tester report assertions passed.');
}

runAllAssertions().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
