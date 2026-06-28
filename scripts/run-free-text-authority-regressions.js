const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

function extractFunctionSource(source, functionName){
  const start = source.indexOf(`function ${functionName}`);
  if(start < 0) throw new Error(`Unable to find ${functionName} in app.js`);
  const paramsStart = source.indexOf('(', start);
  if(paramsStart < 0) throw new Error(`Unable to find params for ${functionName}`);
  let paramDepth = 0;
  let paramsEnd = -1;
  for(let index = paramsStart; index < source.length; index += 1){
    const char = source[index];
    if(char === '(') paramDepth += 1;
    if(char === ')'){
      paramDepth -= 1;
      if(paramDepth === 0){
        paramsEnd = index;
        break;
      }
    }
  }
  if(paramsEnd < 0) throw new Error(`Unable to find param end for ${functionName}`);
  const bodyStart = source.indexOf('{', paramsEnd);
  let depth = 0;
  for(let index = bodyStart; index < source.length; index += 1){
    const char = source[index];
    if(char === '{') depth += 1;
    if(char === '}'){
      depth -= 1;
      if(depth === 0){
        return source.slice(start, index + 1);
      }
    }
  }
  throw new Error(`Unable to extract ${functionName}`);
}

function createSandbox(){
  const sandbox = {
    console,
    uiState:{watchlistLifecycleRunning:false},
    numericOrNull(value){
      if(value === null || value === undefined || value === '') return null;
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    },
    normalizeGlobalVerdictKey(value){
      const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
      if(safe === 'nearentry') return 'near_entry';
      return safe || 'watch';
    },
    normalizeVerdict(value){
      return String(value || '').trim().toLowerCase();
    },
    normalizeTickerRecord(record){
      return record && typeof record === 'object' ? record : {};
    },
    isAccepted50MaSupportTestDisplayState(){
      return false;
    },
    watchlistPriorityForRecord(){
      return {score:0};
    },
    resolvePresentationTone(input = {}){
      return String(input.tone || input.visualBucket || 'monitor');
    },
    resolveVisualBucketFromInputs(bucket, verdict){
      return {
        displayBucket:String(bucket || verdict || 'monitor').trim().toLowerCase() || 'monitor',
        legacyBucket:String(bucket || verdict || 'monitor').trim().toLowerCase() || 'monitor'
      };
    },
    setupScoreForRecord(){
      return 0;
    },
    analysisDerivedStatesFromRecord(record){
      return record && record.derivedStates && typeof record.derivedStates === 'object' ? record.derivedStates : {};
    },
    deriveCurrentPlanState(entry, stop, firstTarget){
      const values = [entry, stop, firstTarget].map(value => {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : null;
      });
      const [safeEntry, safeStop, safeTarget] = values;
      if(values.some(value => value === null)){
        return {status:'missing', tradeability:'watch', riskFit:{risk_status:''}, firstTargetTooClose:false};
      }
      if(safeEntry <= safeStop || safeTarget <= safeEntry){
        return {status:'invalid', tradeability:'invalid', riskFit:{risk_status:'plan_blocked'}, firstTargetTooClose:false};
      }
      const riskPerShare = safeEntry - safeStop;
      const rewardPerShare = safeTarget - safeEntry;
      return {
        status:'valid',
        tradeability:'watch',
        riskFit:{risk_status:'fits_risk'},
        entry:safeEntry,
        stop:safeStop,
        firstTarget:safeTarget,
        firstTargetTooClose:rewardPerShare < (1.5 * riskPerShare)
      };
    },
    resolveGlobalVerdict(record){
      return record && record._globalVerdict ? record._globalVerdict : {};
    },
    watchlistRefreshStructureGate(){
      return {
        refresh_demote_reason:'',
        structural_alive_at_refresh:true,
        avoid_allowed_by_structure_gate:true,
        explicit_invalidation_reason:'',
        lifecycle_drop_reason:''
      };
    },
    appendWatchlistDebugEvent(){},
    globalVerdictLabel(value){
      return String(value || '');
    },
    setStatus(){},
    activeReviewTicker(){
      return '';
    },
    escapeHtml(value){
      return String(value || '');
    }
  };
  vm.createContext(sandbox);
  [
    'scannerEstimateAuthorityReasonPriority',
    'scannerEstimateAuthorityReasonFromText',
    'resolveScannerEstimateStructuredAuthorityCode',
    'resolveStructuredExplicitInvalidationAuthorityCode',
    'isCurrentTechnicalInvalidation',
    'resolveCurrentScannerEstimatePlanBlockers',
    'resolveScannerEstimatePlanAuthority',
    'applyGlobalVerdictGates',
    'hasProjectionTerminalAvoidReason',
    'resolveTrackPresentationModel'
  ].forEach(functionName => {
    vm.runInContext(extractFunctionSource(appSource, functionName), sandbox, {filename:`app.js#${functionName}`});
  });
  return sandbox;
}

function baseRecord(){
  return {
    ticker:'TROW',
    marketData:{price:110.27, currency:'USD'},
    derivedStates:{structureState:'intact', trendState:'uptrend'},
    watchlist:{inWatchlist:false, debug:{}},
    lifecycle:{stage:'active', status:'reviewed'},
    plan:{
      source:'scanner_estimate',
      entry:110.27,
      stop:102.29,
      firstTarget:136.19,
      firstTargetTooClose:false,
      planValidationState:'missed',
      triggerState:'stale',
      missedState:'missed',
      invalidatedState:'',
      blockedReason:'stale snapshot ignored',
      blockedReasonCode:'resolver_block',
      riskStatus:'plan_blocked',
      tradeability:'invalid',
      status:'invalid',
      hasValidPlan:false
    },
    _globalVerdict:{
      allow_plan:true,
      allow_watchlist:true,
      final_verdict:'entry',
      finalVerdict:'entry',
      priceability_state:'priceable',
      plan_status:'valid',
      reason:'previous invalidation cleared by current resolver',
      downgrade_reason:'missed pullback recovered',
      main_blocker:'broken resistance reclaimed'
    }
  };
}

function run(){
  const sandbox = createSandbox();

  assert.strictEqual(
    sandbox.scannerEstimateAuthorityReasonFromText('previous invalidation cleared by current resolver'),
    '',
    'arbitrary prose must not map into scanner-estimate authority'
  );
  assert.strictEqual(
    sandbox.scannerEstimateAuthorityReasonFromText('missed_setup'),
    'missed',
    'explicit enum/code strings should still map'
  );

  const constructive = baseRecord();
  const authority = sandbox.resolveScannerEstimatePlanAuthority(constructive, constructive._globalVerdict, sandbox.deriveCurrentPlanState(
    constructive.plan.entry,
    constructive.plan.stop,
    constructive.plan.firstTarget
  ));
  assert.strictEqual(authority.mode, 'recover', 'constructive structured setup must recover despite hostile prose');
  assert.strictEqual(authority.reasonCode, 'unknown', 'hostile prose must not generate a blocker reason code');

  const constructiveForGate = baseRecord();
  const gatedConstructive = sandbox.applyGlobalVerdictGates(constructiveForGate, {source:'review'});
  assert.strictEqual(gatedConstructive.globalVerdict.final_verdict, 'entry', 'canonical verdict should remain intact');
  assert.strictEqual(constructiveForGate.plan.blockedReason, '', 'stale prose blockedReason should be cleared on recovery');
  assert.strictEqual(constructiveForGate.plan.blockedReasonCode, '', 'stale prose blockedReasonCode should be cleared on recovery');
  assert.strictEqual(constructiveForGate.plan.planValidationState, '', 'stale planValidationState should clear on recovery');
  assert.strictEqual(constructiveForGate.plan.triggerState, '', 'stale triggerState should clear on recovery');

  const structuredBlocked = baseRecord();
  structuredBlocked._globalVerdict.allow_plan = false;
  structuredBlocked._globalVerdict.final_verdict = 'watch';
  structuredBlocked._globalVerdict.finalVerdict = 'watch';
  structuredBlocked._globalVerdict.plan_status = 'invalid';
  structuredBlocked._globalVerdict.reason = 'all clear';
  structuredBlocked._globalVerdict.downgrade_reason = 'friendly prose';
  structuredBlocked._globalVerdict.explicit_invalidation_reason_code = 'setup_invalidated';
  structuredBlocked._globalVerdict.explicit_invalidation_reason = 'Harmless display copy';
  const blockedAuthority = sandbox.resolveScannerEstimatePlanAuthority(structuredBlocked, structuredBlocked._globalVerdict, sandbox.deriveCurrentPlanState(
    structuredBlocked.plan.entry,
    structuredBlocked.plan.stop,
    structuredBlocked.plan.firstTarget
  ));
  assert.strictEqual(blockedAuthority.mode, 'blocked', 'structured invalidation should remain blocked');
  assert.strictEqual(blockedAuthority.reasonCode, 'invalidated', 'structured code should remain authoritative');

  const blockedByTarget = baseRecord();
  blockedByTarget._globalVerdict.reason = 'friendly prose';
  blockedByTarget._globalVerdict.downgrade_reason = 'still friendly';
  blockedByTarget.plan.firstTargetTooClose = false;
  blockedByTarget.plan.firstTarget = 121;
  const blockedByTargetDisplayedPlan = sandbox.deriveCurrentPlanState(
    blockedByTarget.plan.entry,
    blockedByTarget.plan.stop,
    blockedByTarget.plan.firstTarget
  );
  assert.strictEqual(blockedByTargetDisplayedPlan.firstTargetTooClose, true, 'current recomputed target-too-close should remain authoritative');
  const targetAuthority = sandbox.resolveScannerEstimatePlanAuthority(blockedByTarget, blockedByTarget._globalVerdict, blockedByTargetDisplayedPlan);
  assert.strictEqual(targetAuthority.reasonCode, 'target_too_close', 'structured target-too-close should remain blocked');

  const noAuthorityFromPlanProse = baseRecord();
  noAuthorityFromPlanProse.plan.planValidationState = '';
  noAuthorityFromPlanProse.plan.triggerState = '';
  noAuthorityFromPlanProse.plan.missedState = '';
  noAuthorityFromPlanProse.plan.invalidatedState = '';
  noAuthorityFromPlanProse.plan.blockedReason = 'this setup was missed but has now recovered cleanly';
  noAuthorityFromPlanProse.plan.blockedReasonCode = '';
  const proseOnlyAuthority = sandbox.resolveScannerEstimatePlanAuthority(noAuthorityFromPlanProse, noAuthorityFromPlanProse._globalVerdict, sandbox.deriveCurrentPlanState(
    noAuthorityFromPlanProse.plan.entry,
    noAuthorityFromPlanProse.plan.stop,
    noAuthorityFromPlanProse.plan.firstTarget
  ));
  assert.strictEqual(proseOnlyAuthority.mode, 'recover', 'plan.blockedReason prose alone must not block recovery');

  const noAuthorityFromWatchlistDebug = baseRecord();
  const beforeDebugAuthority = sandbox.resolveScannerEstimatePlanAuthority(noAuthorityFromWatchlistDebug, noAuthorityFromWatchlistDebug._globalVerdict, sandbox.deriveCurrentPlanState(
    noAuthorityFromWatchlistDebug.plan.entry,
    noAuthorityFromWatchlistDebug.plan.stop,
    noAuthorityFromWatchlistDebug.plan.firstTarget
  ));
  noAuthorityFromWatchlistDebug.watchlist.debug.reason = 'missed pullback recovered';
  noAuthorityFromWatchlistDebug.watchlist.debug.downgradeReason = 'stale snapshot ignored';
  noAuthorityFromWatchlistDebug.watchlist.debug.mainBlocker = 'broken resistance reclaimed';
  const afterDebugAuthority = sandbox.resolveScannerEstimatePlanAuthority(noAuthorityFromWatchlistDebug, noAuthorityFromWatchlistDebug._globalVerdict, sandbox.deriveCurrentPlanState(
    noAuthorityFromWatchlistDebug.plan.entry,
    noAuthorityFromWatchlistDebug.plan.stop,
    noAuthorityFromWatchlistDebug.plan.firstTarget
  ));
  assert.deepStrictEqual(afterDebugAuthority, beforeDebugAuthority, 'watchlist.debug prose must not affect canonical authority');

  const noAuthorityFromMainBlocker = baseRecord();
  const beforeMainBlocker = sandbox.resolveScannerEstimatePlanAuthority(noAuthorityFromMainBlocker, noAuthorityFromMainBlocker._globalVerdict, sandbox.deriveCurrentPlanState(
    noAuthorityFromMainBlocker.plan.entry,
    noAuthorityFromMainBlocker.plan.stop,
    noAuthorityFromMainBlocker.plan.firstTarget
  ));
  noAuthorityFromMainBlocker._globalVerdict.main_blocker = 'stale snapshot ignored';
  noAuthorityFromMainBlocker._globalVerdict.reason = 'previous invalidation cleared by current resolver';
  noAuthorityFromMainBlocker._globalVerdict.downgrade_reason = 'prior breach repaired';
  const afterMainBlocker = sandbox.resolveScannerEstimatePlanAuthority(noAuthorityFromMainBlocker, noAuthorityFromMainBlocker._globalVerdict, sandbox.deriveCurrentPlanState(
    noAuthorityFromMainBlocker.plan.entry,
    noAuthorityFromMainBlocker.plan.stop,
    noAuthorityFromMainBlocker.plan.firstTarget
  ));
  assert.deepStrictEqual(afterMainBlocker, beforeMainBlocker, 'presentation blocker prose must not affect canonical authority');

  const projectionBundle = {
    globalVerdict:{
      final_verdict:'watch',
      structure_state:'intact',
      rejected_by_viability_gate:false,
      explicit_invalidation_reason:'previous invalidation cleared by current resolver'
    },
    visualState:{},
    resolvedContract:{structuralState:'intact'}
  };
  assert.strictEqual(
    sandbox.hasProjectionTerminalAvoidReason({}, projectionBundle),
    false,
    'sentence-valued explicit_invalidation_reason must not create terminal projection authority'
  );
  projectionBundle.globalVerdict.explicit_invalidation_reason_code = 'setup_invalidated';
  assert.strictEqual(
    sandbox.hasProjectionTerminalAvoidReason({}, projectionBundle),
    true,
    'structured explicit invalidation code should still create terminal projection authority'
  );

  const trackRecord = baseRecord();
  trackRecord._globalVerdict = {
    final_verdict:'watch',
    base_verdict:'watch',
    structure_eligibility:'alive',
    structure_state:'intact',
    setup_location_state:'near_20ma',
    priceability_state:'priceable',
    bounce_state:'attempt',
    explicit_invalidation_reason:'prior breach repaired'
  };
  const trackViewFromProse = sandbox.resolveTrackPresentationModel(trackRecord, trackRecord._globalVerdict, {state:'watch'}, {score:5});
  assert.strictEqual(trackViewFromProse.avoidTrackEligible, false, 'track presentation must not avoid on prose invalidation copy alone');
  trackRecord._globalVerdict.explicit_invalidation_reason_code = 'setup_invalidated';
  const trackViewFromCode = sandbox.resolveTrackPresentationModel(trackRecord, trackRecord._globalVerdict, {state:'watch'}, {score:5});
  assert.strictEqual(trackViewFromCode.avoidTrackEligible, true, 'track presentation should still avoid on structured invalidation code');

  console.log('run-free-text-authority-regressions: ok');
}

run();
