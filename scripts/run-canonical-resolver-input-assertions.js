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

  console.log('run-canonical-resolver-input-assertions: ok');
}

run();
