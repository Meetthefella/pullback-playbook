const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.resolve(__dirname, '..');

function loadCanonicalResolverInput(){
  const sandbox = {
    window:{},
    console
  };
  sandbox.globalThis = sandbox.window;
  const source = fs.readFileSync(path.join(root, 'js/domain/canonical-resolver-input.js'), 'utf8');
  vm.runInNewContext(source, sandbox, {filename:'js/domain/canonical-resolver-input.js'});
  assert.ok(sandbox.window.CanonicalResolverInput, 'CanonicalResolverInput should be exported on window');
  assert.strictEqual(typeof sandbox.window.CanonicalResolverInput.buildCanonicalResolverInput, 'function', 'buildCanonicalResolverInput should be a function');
  assert.strictEqual(typeof sandbox.window.CanonicalResolverInput.buildCanonicalResolverInputComparison, 'function', 'buildCanonicalResolverInputComparison should be a function');
  return sandbox.window.CanonicalResolverInput;
}

function assertResolveGlobalVerdictContractAlignment(){
  const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const resolverSource = fs.readFileSync(path.join(root, 'js/resolver-core.js'), 'utf8');
  assert.ok(
    /function resolveGlobalVerdict\(record,\s*deps\s*=\s*\{\}\)/.test(appSource),
    'app.js resolveGlobalVerdict must accept injected deps'
  );
  assert.ok(
    /function resolveGlobalVerdict\(record,\s*deps\s*=\s*\{\}\)/.test(resolverSource),
    'js/resolver-core.js resolveGlobalVerdict must accept injected deps'
  );
  [
    'deps.resolveFinalStateContract || resolveFinalStateContract',
    'deps.resolvePreLifecycleStateContract || resolvePreLifecycleStateContract',
    'deps.analysisDerivedStatesFromRecord || analysisDerivedStatesFromRecord',
    'deps.effectivePlanForRecord || effectivePlanForRecord',
    'deps.applySetupConfirmationPlanGate || applySetupConfirmationPlanGate',
    'deps.deriveCurrentPlanState || deriveCurrentPlanState',
    'deps.evaluatePlanRealism || evaluatePlanRealism'
  ].forEach(fragment => {
    assert.ok(appSource.includes(fragment), `app.js must honor injected dep: ${fragment}`);
  });
}

function assertSimplifiedPipelineResolverInjection(){
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

  const runModule = relativePath => {
    const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
    vm.runInNewContext(source, sandbox, {filename:relativePath});
  };

  runModule('js/plan-math.js');
  runModule('js/tradeability.js');
  runModule('js/domain/simplified-plan-state.js');
  runModule('js/presentation/simplified-presentation-model.js');

  let capturedDeps = null;
  let capturedRecord = null;
  sandbox.window.ResolverCore = {
    resolveGlobalVerdict(record, deps){
      capturedRecord = record;
      capturedDeps = deps;
      return {
        final_verdict:'watch',
        main_blocker:'',
        reason:'',
        contractDiagnostics:{softReadinessOnlyDemotion:true}
      };
    },
    globalVerdictLabel(value){
      const safe = String(value || '').trim().toLowerCase();
      if(safe === 'entry') return 'Entry';
      if(safe === 'near_entry') return 'Near Entry';
      if(safe === 'avoid') return 'Avoid';
      return 'Watch';
    },
    normalizeGlobalVerdictKey(value){
      const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
      return ['entry','near_entry','watch','avoid'].includes(safe) ? safe : 'watch';
    },
    normalizeVerdict(value){
      const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
      return ['entry','near_entry','watch','avoid'].includes(safe) ? safe : 'watch';
    },
    getBadge(){ return {text:'Watch'}; },
    getActions(){ return {label:'WAIT'}; }
  };
  sandbox.window.ResolverPresentation = {
    resolveVisualState(){
      return {
        canonicalVerdict:'entry',
        finalVerdict:'watch',
        visualBucket:'entry',
        tone:'entry',
        badge:{text:'Entry'},
        priceabilityState:'priceable'
      };
    }
  };

  runModule('js/domain/simplified-trade-state.js');

  const deps = {
    effectivePlanForRecord(){
      return {entry:110.27, stop:102.29, firstTarget:136.19, source:'scanner_estimate'};
    },
    riskSettingsProvider(){
      return {accountSize:4000, riskPercent:1, maxLoss:40, wholeSharesOnly:true};
    },
    analysisDerivedStatesFromRecord(){
      return {
        structureState:'strong',
        trendState:'intact',
        bounceState:'attempt',
        stabilisationState:'none',
        volumeState:'supportive',
        pullbackZone:'none',
        setupLocationState:'off_level',
        priceabilityState:'unpriceable'
      };
    },
    applySetupConfirmationPlanGate(unusedRecord, displayedPlan){
      return displayedPlan;
    },
    baseVerdictFromResolvedContract(resolved){
      return String(resolved && resolved.baseVerdict || 'watch').toLowerCase();
    },
    resolvePreLifecycleStateContract(){
      return {
        finalVerdict:'Watch',
        structuralState:'developing',
        actionStateKey:'wait_for_confirmation',
        planStatusKey:'valid',
        tradeabilityVerdict:'Watch',
        blockerReason:'Needs stronger confirmation',
        reasonSummary:'Pre-watchlist setup',
        terminal:false,
        baseVerdict:'watch'
      };
    },
    resolveFinalStateContract(){
      return {
        finalVerdict:'Watch',
        final_verdict:'watch',
        structuralState:'developing',
        actionStateKey:'wait_for_confirmation',
        planStatusKey:'valid',
        tradeabilityVerdict:'Watch',
        blockerReason:'Needs stronger confirmation',
        reasonSummary:'Pre-watchlist setup',
        terminal:false,
        baseVerdict:'watch',
        canonical_final_verdict:'entry',
        canonical_visual_bucket:'entry',
        canonical_priceability_state:'priceable',
        canonical_soft_readiness_alignment_applied:true
      };
    },
    evaluatePlanRealism(){
      return {credible_rr:3.25};
    },
    setupScoreForRecord(){
      return 7;
    },
    isHostileMarketStatus(){
      return false;
    },
    scannerScoreGradientClass(){
      return '';
    },
    state:{marketStatus:'supportive'}
  };
  const record = {
    ticker:'TROW',
    marketData:{price:110.27, currency:'USD'},
    plan:{entry:110.27, stop:102.29, firstTarget:136.19}
  };
  const result = sandbox.window.SimplifiedTradeState.resolveRecordState(record, {
    surface:'review',
    log:false,
    deps
  });

  assert.strictEqual(capturedRecord, record, 'simplified pipeline should pass the same record into ResolverCore.resolveGlobalVerdict');
  assert.ok(capturedDeps && typeof capturedDeps === 'object', 'simplified pipeline should inject resolver deps');
  assert.strictEqual(capturedDeps.analysisDerivedStatesFromRecord(record).priceabilityState, 'priceable', 'reconciled derivedStates should be injected into ResolverCore.resolveGlobalVerdict');
  assert.strictEqual(capturedDeps.resolveFinalStateContract(record).canonical_final_verdict, 'entry', 'override-aware final-state contract should be injected');
  assert.strictEqual(result.canonicalVerdict, 'entry', 'soft-readiness-only review case should preserve canonical Entry in simplified pipeline');
  assert.strictEqual(result.priceabilityState, 'priceable', 'soft-readiness-only review case should preserve priceable state in simplified pipeline');
}

function assertFxEstimatedRiskOnlyPriceabilityReconciliation(){
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

  const runModule = relativePath => {
    const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
    vm.runInNewContext(source, sandbox, {filename:relativePath});
  };

  runModule('js/plan-math.js');
  runModule('js/tradeability.js');
  runModule('js/domain/simplified-plan-state.js');
  runModule('js/presentation/simplified-presentation-model.js');
  runModule('js/domain/simplified-trade-state.js');

  sandbox.window.ResolverCore = {
    resolveGlobalVerdict(){
      return {
        final_verdict:'watch',
        main_blocker:'',
        reason:'',
        structure_eligibility:'alive',
        structure_state:'strong',
        priceability_state:'priceable',
        bounce_state:'attempt',
        near_entry_gate_pass:false,
        entry_gate_pass:false,
        contractDiagnostics:{softReadinessOnlyDemotion:true}
      };
    },
    globalVerdictLabel(value){
      const safe = String(value || '').trim().toLowerCase();
      if(safe === 'entry') return 'Entry';
      if(safe === 'near_entry') return 'Near Entry';
      if(safe === 'avoid') return 'Avoid';
      return 'Watch';
    },
    normalizeGlobalVerdictKey(value){
      const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
      return ['entry','near_entry','watch','avoid'].includes(safe) ? safe : 'watch';
    },
    normalizeVerdict(value){
      const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
      return ['entry','near_entry','watch','avoid'].includes(safe) ? safe : 'watch';
    },
    getBadge(){ return {text:'Entry'}; },
    getActions(){ return {label:'WAIT'}; }
  };
  sandbox.window.ResolverPresentation = {
    resolveVisualState(unusedRecord, unusedSurface, options){
      const resolvedContract = options && options.resolvedContract || {};
      return {
        canonicalVerdict:resolvedContract.canonical_final_verdict || 'watch',
        finalVerdict:resolvedContract.final_verdict || 'watch',
        visualBucket:resolvedContract.canonical_visual_bucket || 'monitor',
        tone:resolvedContract.canonical_visual_bucket || 'monitor',
        badge:{text:resolvedContract.canonical_final_verdict === 'entry' ? 'Entry' : 'Watch'},
        priceabilityState:resolvedContract.canonical_priceability_state || 'unpriceable'
      };
    }
  };

  const deps = {
    effectivePlanForRecord(item){
      return item && item.effectivePlan || {entry:110.27, stop:102.29, firstTarget:136.19, source:'scanner_estimate'};
    },
    riskSettingsProvider(){
      return {accountSize:4000, riskPercent:1, maxLoss:40, wholeSharesOnly:true};
    },
    analysisDerivedStatesFromRecord(item){
      return item && item.derivedStates || {
        structureState:'strong',
        trendState:'intact',
        bounceState:'attempt',
        stabilisationState:'none',
        volumeState:'supportive',
        pullbackZone:'none',
        setupLocationState:'off_level',
        priceabilityState:'unpriceable'
      };
    },
    applySetupConfirmationPlanGate(unusedRecord, displayedPlan){
      return displayedPlan;
    },
    baseVerdictFromResolvedContract(resolved){
      return String(resolved && resolved.baseVerdict || 'watch').toLowerCase();
    },
    resolvePreLifecycleStateContract(){
      return {
        finalVerdict:'Watch',
        structuralState:'developing',
        actionStateKey:'wait_for_confirmation',
        planStatusKey:'valid',
        tradeabilityVerdict:'Watch',
        blockerReason:'Needs stronger confirmation',
        reasonSummary:'Pre-watchlist setup',
        terminal:false,
        baseVerdict:'watch'
      };
    },
    resolveFinalStateContract(){
      return {
        finalVerdict:'Watch',
        final_verdict:'watch',
        structuralState:'developing',
        actionStateKey:'wait_for_confirmation',
        planStatusKey:'valid',
        tradeabilityVerdict:'Watch',
        blockerReason:'Needs stronger confirmation',
        reasonSummary:'Pre-watchlist setup',
        terminal:false,
        baseVerdict:'watch',
        canonical_final_verdict:'entry',
        canonical_visual_bucket:'entry',
        canonical_priceability_state:'priceable',
        canonical_soft_readiness_alignment_applied:true
      };
    },
    evaluatePlanRealism(){
      return {credible_rr:3.25};
    },
    setupScoreForRecord(){
      return 7;
    },
    isHostileMarketStatus(){
      return false;
    },
    scannerScoreGradientClass(){
      return '';
    },
    state:{marketStatus:'supportive'}
  };

  const makeRecord = overrides => ({
    ticker:'TROW',
    marketData:{price:110.27, currency:'USD'},
    plan:{entry:110.27, stop:102.29, firstTarget:136.19, source:'scanner_estimate'},
    effectivePlan:{entry:110.27, stop:102.29, firstTarget:136.19, source:'scanner_estimate'},
    derivedStates:{
      structureState:'strong',
      trendState:'intact',
      bounceState:'attempt',
      stabilisationState:'none',
      volumeState:'supportive',
      pullbackZone:'none',
      setupLocationState:'off_level',
      priceabilityState:'unpriceable'
    },
    ...overrides
  });

  const reviewRecord = makeRecord();
  const reviewResult = sandbox.window.SimplifiedTradeState.resolveRecordState(reviewRecord, {
    surface:'review',
    log:false,
    deps
  });
  assert.strictEqual(reviewResult.canonicalVerdict, 'entry', 'FX-estimated risk_only plan should preserve canonical Entry for TROW-like review');
  assert.strictEqual(reviewResult.priceabilityState, 'priceable', 'FX-estimated risk_only plan should reconcile stale unpriceable to priceable');
  assert.strictEqual(reviewResult.planStatus, 'valid', 'FX-estimated risk_only reconciliation should keep plan valid');

  const tooHeavyRecord = makeRecord({
    marketData:{price:110.27, currency:'GBP'},
    effectivePlan:{entry:110.27, stop:102.29, firstTarget:136.19, source:'scanner_estimate'},
    plan:{entry:110.27, stop:102.29, firstTarget:136.19, source:'scanner_estimate'}
  });
  const tooHeavyDeps = {
    ...deps,
    riskSettingsProvider(){
      return {accountSize:200, riskPercent:1, maxLoss:40, wholeSharesOnly:true};
    }
  };
  const tooHeavyResult = sandbox.window.SimplifiedTradeState.resolveRecordState(tooHeavyRecord, {
    surface:'review',
    log:false,
    deps:tooHeavyDeps
  });
  assert.strictEqual(tooHeavyResult.debug.derivedStates.priceabilityState, 'unpriceable', 'too_heavy capital fit must not reconcile to priceable');
  assert.strictEqual(tooHeavyResult.debug.derivedStates.priceabilityReconciledFromPlan, false, 'too_heavy capital fit must not set reconciliation true');

  const tooExpensiveRecord = makeRecord({
    marketData:{price:4100, currency:'GBP'},
    effectivePlan:{entry:4100, stop:4000, firstTarget:4500, source:'scanner_estimate'},
    plan:{entry:4100, stop:4000, firstTarget:4500, source:'scanner_estimate'}
  });
  const tooExpensiveResult = sandbox.window.SimplifiedTradeState.resolveRecordState(tooExpensiveRecord, {
    surface:'review',
    log:false,
    deps
  });
  assert.strictEqual(tooExpensiveResult.debug.derivedStates.priceabilityState, 'unpriceable', 'too_expensive capital fit must not reconcile to priceable');
  assert.strictEqual(tooExpensiveResult.debug.derivedStates.priceabilityReconciledFromPlan, false, 'too_expensive capital fit must not set reconciliation true');

  const invalidRiskRecord = makeRecord({
    effectivePlan:{entry:110.27, stop:111.10, firstTarget:136.19, source:'scanner_estimate'},
    plan:{entry:110.27, stop:111.10, firstTarget:136.19, source:'scanner_estimate'}
  });
  const invalidRiskResult = sandbox.window.SimplifiedTradeState.resolveRecordState(invalidRiskRecord, {
    surface:'review',
    log:false,
    deps
  });
  assert.strictEqual(invalidRiskResult.debug.derivedStates.priceabilityState, 'unpriceable', 'invalid risk status must not reconcile to priceable');
  assert.strictEqual(invalidRiskResult.debug.derivedStates.priceabilityReconciledFromPlan, false, 'invalid risk status must not set reconciliation true');

  const targetTooCloseRecord = makeRecord({
    plan:{
      entry:110.27,
      stop:102.29,
      firstTarget:118.00,
      source:'scanner_estimate',
      blockedReason:'Target too close',
      blockedReasonCode:'target_too_close'
    },
    effectivePlan:{entry:110.27, stop:102.29, firstTarget:118.00, source:'scanner_estimate'}
  });
  const targetTooCloseResult = sandbox.window.SimplifiedTradeState.resolveRecordState(targetTooCloseRecord, {
    surface:'review',
    log:false,
    deps
  });
  assert.strictEqual(targetTooCloseResult.debug.derivedStates.priceabilityState, 'unpriceable', 'target_too_close authoritative block must still prevent reconciliation');
  assert.strictEqual(targetTooCloseResult.debug.derivedStates.priceabilityReconciledFromPlan, false, 'target_too_close authoritative block must not set reconciliation true');
}

function deepClone(value){
  return JSON.parse(JSON.stringify(value));
}

function sampleRecord(){
  return {
    ticker:'TROW',
    marketData:{
      price:110.27,
      sma20:108.5,
      sma50:104.2,
      sma200:92.1,
      volume:1000000,
      avgVolume30d:850000,
      perf1w:0.03,
      perf1m:0.06,
      asOf:'2026-06-27T08:00:00.000Z'
    },
    scan:{
      analysisProjection:{
        trend_state:'uptrend',
        structure_state:'intact',
        bounce_state:'attempt',
        setup_location_state:'near_20ma',
        priceability_state:'priceable'
      },
      flags:{
        checks:{
          above50:true
        }
      },
      resolvedVerdict:'Near Entry',
      estimatedRR:2.4
    },
    review:{
      manualReview:{
        entry:111,
        stop:105,
        target:125,
        summary:'Manual review summary',
        score:8
      },
      savedVerdict:'Entry',
      savedSummary:'Previous invalidation cleared by current resolver.',
      savedScore:8,
      analysisState:{
        normalized:{
          verdict:'watch'
        },
        raw:'missed pullback recovered'
      }
    },
    reason:'previous invalidation cleared by current resolver',
    downgrade_reason:'missed pullback recovered',
    main_blocker:'broken resistance reclaimed',
    plan:{
      source:'scanner_estimate',
      entry:110.27,
      stop:102.29,
      firstTarget:136.19,
      planValidationState:'missed',
      triggerState:'stale',
      missedState:'missed',
      invalidatedState:'',
      blockedReason:'stale snapshot ignored',
      blockedReasonCode:'resolver_block',
      riskStatus:'plan_blocked',
      tradeability:'invalid',
      firstTargetTooClose:false
    },
    lifecycle:{
      stage:'active',
      status:'reviewed',
      expiresAt:'2026-07-01T00:00:00.000Z'
    },
    watchlist:{
      debug:{
        refresh_demote_reason:'broken resistance reclaimed',
        explicit_invalidation_reason:'prior breach repaired',
        reason:'stale snapshot ignored',
        downgradeReason:'previous invalidation cleared by current resolver',
        mainBlocker:'missed pullback recovered'
      },
      presentation:{
        sharedPresentation:{
          visualBucket:'diminishing',
          badgeLabel:'Watch',
          actionLabel:'Hold'
        }
      }
    },
    visualBucket:'monitor',
    badgeLabel:'Near Entry',
    actionLabel:'Ready soon',
    tone:'monitor'
  };
}

function circularRecord(){
  const record = sampleRecord();
  record.watchlist.debug.self = record.watchlist.debug;
  record.watchlist.debug.onInspect = function onInspect(){ return 'noop'; };
  record.review.analysisState.circular = record.review;
  return record;
}

function run(){
  assertResolveGlobalVerdictContractAlignment();
  const canonicalModule = loadCanonicalResolverInput();
  const {buildCanonicalResolverInput, buildCanonicalResolverInputComparison} = canonicalModule;
  const record = sampleRecord();
  const before = deepClone(record);
  const result = buildCanonicalResolverInput(record, {surface:'test', mode:'diagnostic'});
  const after = deepClone(record);

  assert.deepStrictEqual(after, before, 'builder must not mutate input record');
  assert.strictEqual(result.ticker, 'TROW');
  assert.strictEqual(result.diagnostics.selectedDerivedStateAuthorityCandidate.source, 'scanner_projection', 'scanner projection should be default derived-state candidate');
  assert.strictEqual(result.diagnostics.selectedPlanAuthorityCandidate.source, 'manual_review', 'manual review numeric plan should be detected as plan authority candidate');
  assert.strictEqual(result.diagnostics.selectedPlanAuthorityCandidate.plan.entry, 111, 'manual review plan should not be over-expanded beyond numeric fields');

  assert.ok(result.diagnostics.auditOnlyFields.includes('plan.planValidationState'), 'persisted planValidationState should be audit-only');
  assert.ok(result.diagnostics.auditOnlyFields.includes('watchlist.debug'), 'watchlist.debug should be audit-only');
  assert.ok(result.diagnostics.auditOnlyFields.includes('watchlist.presentation'), 'watchlist.presentation should be audit-only');
  assert.ok(!result.diagnostics.auditOnlyFields.includes('plan.blockedReasonCode'), 'plan.blockedReasonCode should not be reported as plain audit-only');
  assert.ok(result.diagnostics.legacyStructuredAuthorityFields.includes('plan.blockedReasonCode'), 'plan.blockedReasonCode should be classified as legacy structured authority');
  assert.strictEqual(result.diagnostics.legacyStructuredAuthorityValues[0].value, 'resolver_block', 'legacy structured authority value should be preserved');

  assert.ok(result.diagnostics.presentationOnlyFields.includes('badgeLabel'), 'badgeLabel should be presentation-only');
  assert.ok(result.diagnostics.presentationOnlyFields.includes('actionLabel'), 'actionLabel should be presentation-only');
  assert.ok(result.diagnostics.presentationOnlyFields.includes('visualBucket'), 'visualBucket should be presentation-only');
  const presentationRiskPaths = result.diagnostics.presentationFeedbackRisks.map(entry => entry.path);
  assert.ok(presentationRiskPaths.includes('watchlist.presentation.sharedPresentation'), 'sharedPresentation should be marked as a presentation feedback risk');
  assert.ok(presentationRiskPaths.includes('visualBucket'), 'visualBucket should be marked as a presentation feedback risk');
  assert.ok(presentationRiskPaths.includes('badgeLabel'), 'badgeLabel should be marked as a presentation feedback risk');
  assert.ok(presentationRiskPaths.includes('actionLabel'), 'actionLabel should be marked as a presentation feedback risk');
  assert.ok(presentationRiskPaths.includes('tone'), 'tone should be marked as a presentation feedback risk');

  const blockedPaths = result.diagnostics.blockedFreeTextAuthorityPaths.map(entry => entry.path);
  assert.ok(blockedPaths.includes('plan.blockedReason'), 'plan.blockedReason should be blocked from canonical authority');
  assert.ok(blockedPaths.includes('reason'), 'record-level reason should be blocked from canonical authority');
  assert.ok(blockedPaths.includes('downgrade_reason'), 'record-level downgrade_reason should be blocked from canonical authority');
  assert.ok(blockedPaths.includes('main_blocker'), 'record-level main_blocker should be blocked from canonical authority');
  assert.ok(blockedPaths.includes('review.savedSummary'), 'review.savedSummary should be blocked from canonical authority');
  assert.ok(blockedPaths.includes('watchlist.debug.refresh_demote_reason'), 'watchlist.debug.refresh_demote_reason should be blocked from canonical authority');
  assert.ok(blockedPaths.includes('watchlist.debug.reason'), 'watchlist.debug.reason should be blocked from canonical authority');
  assert.ok(blockedPaths.includes('watchlist.debug.mainBlocker'), 'watchlist.debug.mainBlocker should be blocked from canonical authority');

  assert.strictEqual(result.canonical.manual.hasManualReview, true, 'manual review should be detected');
  assert.ok(result.legacy.watchlistDebug && result.legacy.watchlistDebug.refresh_demote_reason, 'watchlist debug should be preserved in legacy diagnostics only');
  assert.ok(result.legacy.watchlistPresentation && result.legacy.watchlistPresentation.sharedPresentation, 'watchlist presentation should be preserved in legacy diagnostics only');

  const ignoredStale = result.diagnostics.ignoredStaleFields.map(entry => entry.path);
  assert.ok(ignoredStale.includes('plan.planValidationState'), 'persisted plan blocker fields should be classified as ignored stale fields');
  assert.ok(ignoredStale.includes('plan.triggerState'), 'persisted triggerState should be classified as ignored stale fields');
  assert.ok(!ignoredStale.includes('plan.blockedReasonCode'), 'plan.blockedReasonCode should not be classified as ignored stale prose');

  assert.strictEqual(result.canonical.plan.numericFields.entry, 110.27, 'numeric plan fields should be captured');
  assert.strictEqual(result.canonical.scanner.analysisProjection.structure_state, 'intact', 'scanner projection should be captured');

  const comparison = buildCanonicalResolverInputComparison(record, {
    surface:'test',
    mode:'diagnostic',
    derivedStates:{structureState:'intact'},
    effectivePlan:{entry:110.27, stop:102.29, firstTarget:136.19, source:'scanner_estimate'},
    displayedPlan:{status:'valid', entry:110.27, stop:102.29, target:136.19, tradeability:'tradable', riskFit:{risk_status:'fits_risk'}}
  });
  assert.strictEqual(comparison.ticker, 'TROW', 'comparison should include ticker');
  assert.ok(comparison.oldLiveResolverInputs, 'comparison should include old live resolver inputs');
  assert.ok(comparison.canonicalNormalizedInputs, 'comparison should include canonical normalized inputs');
  assert.ok(Array.isArray(comparison.differences), 'comparison should include diff array');
  assert.ok(comparison.selectedPlanAuthority, 'comparison should include selected plan authority');
  assert.ok(comparison.selectedDerivedStateAuthority, 'comparison should include selected derived-state authority');

  const circular = circularRecord();
  const circularBefore = circular;
  const circularResult = buildCanonicalResolverInput(circular, {surface:'test', mode:'diagnostic'});
  assert.notStrictEqual(circularResult.legacy.watchlistDebug, circular.watchlist.debug, 'fallback cloning must not return original watchlist.debug reference');
  assert.notStrictEqual(circularResult.legacy.watchlistPresentation, circular.watchlist.presentation, 'fallback cloning must not return original watchlist.presentation reference');
  assert.strictEqual(circularResult.legacy.watchlistDebug.self, '[circular]', 'circular references should be summarized safely');
  assert.ok(String(circularResult.legacy.watchlistDebug.onInspect || '').startsWith('[function:'), 'functions should be summarized safely');
  assert.strictEqual(circular.review.analysisState.circular, circular.review, 'input circular references must remain untouched');
  assert.strictEqual(circularBefore, circular, 'builder must not replace original input object');

  const circularComparison = buildCanonicalResolverInputComparison(circular, {
    surface:'test',
    mode:'diagnostic',
    derivedStates:{structureState:'intact'},
    effectivePlan:{entry:110.27, stop:102.29, firstTarget:136.19, source:'scanner_estimate'},
    displayedPlan:{status:'valid', entry:110.27, stop:102.29, target:136.19, tradeability:'tradable', riskFit:{risk_status:'fits_risk'}}
  });
  assert.notStrictEqual(circularComparison.oldLiveResolverInputs.derivedStates, circular.review, 'comparison snapshots must remain detached from live objects');
  assert.ok(typeof circularComparison.capturedAt === 'string' && circularComparison.capturedAt.length > 0, 'comparison should include capture timestamp');

  assertSimplifiedPipelineResolverInjection();
  assertFxEstimatedRiskOnlyPriceabilityReconciliation();

  console.log('run-canonical-resolver-input-assertions: ok');
}

run();
