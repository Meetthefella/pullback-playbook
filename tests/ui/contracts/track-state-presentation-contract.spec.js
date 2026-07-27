const {test, expect} = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const {openTrackTab, waitForUiTransitionSettle} = require('../helpers/app-driver');
const {extractAppTickerState} = require('../helpers/app-state');

async function bootApp(page){
  const appUrl = `file:///${path.resolve(__dirname, '..', '..', '..', 'index.html').replace(/\\/g, '/')}`;
  await page.goto(appUrl, {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => {
    if(typeof startupDebugRenderState !== 'function') return false;
    const ready = startupDebugRenderState();
    return !!(
      document.getElementById('buildBtn')
      && document.querySelector('[data-workspace-tab="scan"]')
      && ready
      && ready.hydrationComplete === true
      && ready.riskRefreshComplete === true
    );
  }, null, {timeout:30000});
  await page.evaluate(() => {
    try{
      localStorage.clear();
      sessionStorage.clear();
    }catch(_error){}
    if(typeof resetAllData === 'function') resetAllData();
  });
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => {
    if(typeof startupDebugRenderState !== 'function') return false;
    const ready = startupDebugRenderState();
    return !!(ready && ready.hydrationComplete === true && ready.riskRefreshComplete === true);
  }, null, {timeout:30000});
  const skipButton = page.getByRole('button', {name:'Skip'});
  if(await skipButton.count()){
    try{
      if(await skipButton.isVisible()) await skipButton.click();
    }catch(_error){}
  }
}

async function seedScenario(page, scenario){
  await page.evaluate(seed => {
    const fixtureDate = typeof todayIsoDate === 'function' ? todayIsoDate() : new Date().toISOString().slice(0, 10);
    const fixtureTimestamp = `${fixtureDate}T09:00:00.000Z`;
    const record = upsertTickerRecord(seed.ticker);
    record.meta.companyName = seed.companyName;
    record.meta.exchange = 'NASDAQ';
    record.meta.tradingViewSymbol = `NASDAQ:${seed.ticker}`;
    record.meta.marketStatus = 'S&P above 50 MA';
    record.marketData.currency = seed.currency || 'USD';
    record.marketData.price = seed.price;
    record.marketData.previousClose = seed.previousClose;
    record.marketData.ma20 = seed.ma20;
    record.marketData.ma50 = seed.ma50;
    record.marketData.ma200 = seed.ma200;
    record.marketData.rsi = seed.rsi;
    record.marketData.volume = seed.volume;
    record.marketData.avgVolume = seed.avgVolume;
    record.marketData.asOf = fixtureTimestamp;
    record.marketData.history = [
      {date:'2026-06-27', open:seed.price - 1, high:seed.price + 1, low:seed.price - 2, close:seed.price, volume:seed.volume}
    ];
    record.strongBullishReversal = seed.strongBullishReversal === true;
    record.strongBullishContinuation = seed.strongBullishContinuation === true;
    record.breaksLocalHigh = seed.breaksLocalHigh === true;
    record.reclaimAttempt = seed.reclaimAttempt === true;
    record.reclaimsLevel = seed.reclaimsLevel === true;
    record.setup.structureState = seed.structureState;
    record.setup.structureEligibility = seed.structureEligibility;
    record.setup.setupLocationState = seed.setupLocationState;
    record.setup.pullbackZone = seed.pullbackZone;
    record.setup.priceabilityState = seed.priceabilityState;
    record.setup.bounceState = seed.bounceState;
    record.setup.stabilisationState = seed.stabilisationState;
    record.setup.volumeState = seed.volumeState;
    record.setup.trendState = seed.trendState;
    record.plan.entry = seed.entry || '';
    record.plan.stop = seed.stop || '';
    record.plan.firstTarget = seed.target || '';
    record.plan.target = seed.target || '';
    record.plan.source = 'scanner_estimate';
    record.plan.status = seed.planStatus;
    record.plan.riskStatus = seed.riskStatus || '';
    record.plan.tradeability = seed.tradeability || '';
    record.plan.triggerState = seed.triggerState || '';
    if(seed.planStamped !== false && seed.entry && seed.stop && seed.target){
      record.plan.authoritySource = seed.planAuthoritySource || 'playwright_seed';
      record.plan.authorityVersion = 'trade_plan_v1';
      record.plan.authorityReason = seed.planAuthorityReason || 'canonical_seed_fixture';
      record.plan.writtenBy = seed.planWrittenBy || 'track-state-presentation-contract.spec';
      record.plan.writtenAt = seed.planWrittenAt || fixtureTimestamp;
    }
    record.scan.analysisProjection = {
      price:seed.price,
      sma20:seed.ma20,
      sma50:seed.ma50,
      sma200:seed.ma200,
      rr_ratio:String(seed.scannerResolvedRR || ''),
      risk_status:seed.riskStatus || '',
      derived_states:{
        trend_state:seed.trendState,
        pullback_zone:seed.pullbackZone,
        setup_location_state:seed.setupLocationState,
        priceability_state:seed.priceabilityState,
        structure_state:seed.structureState,
        structure_eligibility:seed.structureEligibility,
        stabilisation_state:seed.stabilisationState,
        bounce_state:seed.bounceState,
        volume_state:seed.volumeState,
        support_context:seed.supportContext || '',
        support_test_state:seed.supportTestState || '',
        buyer_control_state:seed.buyerControlState || '',
        candle_evidence_reclaim_range_meaningful:seed.reclaimRangeMeaningful === true ? 'yes' : 'no',
        candle_evidence_reclaimed_prior_day_high:seed.reclaimedPriorDayHigh === true ? 'yes' : 'no',
        has_clear_invalidation_level:seed.planStatus === 'valid' ? 'yes' : 'no',
        has_priceable_plan:seed.planStatus === 'valid' ? 'yes' : 'no',
        entry_defined:seed.entry ? 'yes' : 'no',
        stop_defined:seed.stop ? 'yes' : 'no',
        target_defined:seed.target ? 'yes' : 'no'
      }
    };
    record.scan.resolvedVerdict = seed.scanVerdictLabel;
    record.scan.verdict = seed.scanVerdictLabel;
    record.scan.score = seed.scanScore;
    record.scan.riskStatus = seed.riskStatus || '';
    record.scan.summary = seed.scanSummary;
    record.review.analysisState = {
      normalized:{
        coach_summary:seed.coachSummary,
        ...(seed.normalizedAnalysis && typeof seed.normalizedAnalysis === 'object'
          ? seed.normalizedAnalysis
          : {})
      }
    };
    record.review.manualReview = {
      entry:seed.entry || '',
      stop:seed.stop || '',
      target:seed.target || ''
    };
    record.watchlist.inWatchlist = true;
    record.watchlist.addedAt = fixtureDate;
    record.watchlist.expiryAfterTradingDays = 5;
    record.watchlist.presentation = {
      sharedPresentation:{
        canonicalVerdict:seed.canonicalVerdict,
        finalVerdict:seed.canonicalVerdict,
        visualBucket:seed.visualBucket,
        tone:seed.visualBucket,
        badgeLabel:seed.badgeLabel,
        actionLabel:seed.actionLabel
      }
    };

    state.paperTradeApiKey = 'paper-key';
    state.paperTradeApiSecret = 'paper-secret';
    state.paperTradeTesterSetupCompletedAt = fixtureTimestamp;
    fxRateCache.set('USD', {
      gbpPerUnit:0.79,
      fetchedAt:new Date().toISOString()
    });
    trading212PaperAvailabilityChecked = true;
    trading212PaperEnabled = true;
    trading212PaperAvailabilityMessage = 'Paper gateway ready.';

    uiState.activeReviewSourceProjectionSnapshot = projectionSnapshotWithAuthority({
      ticker:seed.ticker,
      canonicalVerdict:seed.canonicalVerdict,
      finalVerdict:seed.canonicalVerdict,
      sourceOfTruthVisualBucket:seed.visualBucket,
      visualBucket:seed.visualBucket,
      tone:seed.visualBucket
    }, record, {
      authority:{version:1, source:'manual'}
    });
    uiState.activeReviewProjectionSource = 'clicked_card_snapshot';
    setActiveReviewTicker(seed.ticker);
    renderReviewWorkspace({source:'track_state_contract_test'});
    renderWatchlist({source:'track_state_contract_test'});
  }, scenario);
}

function entryScenario(){
  return {
    ticker:'ENTR',
    companyName:'Entry Systems Ltd.',
    canonicalVerdict:'entry',
    visualBucket:'entry',
    badgeLabel:'Entry',
    actionLabel:'Execute only if the trigger remains valid.',
    scanVerdictLabel:'Entry',
    scanScore:9,
    scanSummary:'Structure is intact, buyers are in control, and the trade plan is ready.',
    coachSummary:'Constructive setup with buyers in control.',
    price:110.27,
    previousClose:106.34,
    ma20:106.727,
    ma50:103.852,
    ma200:100.9815,
    rsi:64.82,
    volume:3831934,
    avgVolume:2115787.96,
    structureState:'strong',
    structureEligibility:'alive',
    setupLocationState:'near_20ma',
    pullbackZone:'near_20ma',
    priceabilityState:'priceable',
    bounceState:'confirmed',
    stabilisationState:'clear',
    volumeState:'supportive',
    trendState:'strong',
    strongBullishReversal:true,
    strongBullishContinuation:true,
    breaksLocalHigh:true,
    reclaimAttempt:true,
    reclaimRangeMeaningful:true,
    reclaimedPriorDayHigh:true,
    entry:110.27,
    stop:102.29,
    target:136.19,
    planStatus:'valid',
    riskStatus:'fits_risk',
    tradeability:'tradable',
    triggerState:'confirmed',
    scannerResolvedRR:2.5,
    currency:'USD',
    planStamped:true
  };
}

function watchScenario(){
  return {
    ticker:'WATC',
    companyName:'Watch Holdings Plc',
    canonicalVerdict:'watch',
    visualBucket:'monitor',
    badgeLabel:'Watch',
    actionLabel:'Wait for stronger confirmation before considering entry.',
    scanVerdictLabel:'Watch',
    scanScore:6,
    scanSummary:'Trend is intact but the bounce is still too early.',
    coachSummary:'Constructive structure, but the trigger is not there yet.',
    price:52.4,
    previousClose:52.1,
    ma20:51.8,
    ma50:49.9,
    ma200:45.2,
    rsi:58.1,
    volume:1820000,
    avgVolume:1640000,
    structureState:'strong',
    structureEligibility:'alive',
    setupLocationState:'near_20ma',
    pullbackZone:'near_20ma',
    priceabilityState:'unpriceable',
    bounceState:'attempt',
    stabilisationState:'stabilising',
    volumeState:'supportive',
    trendState:'strong',
    entry:'',
    stop:'',
    target:'',
    planStatus:'missing',
    riskStatus:'plan_missing',
    tradeability:'unpriceable',
    triggerState:'',
    scannerResolvedRR:''
  };
}

function nearEntryScenario(){
  return {
    ticker:'NEAR',
    companyName:'Near Trigger Inc.',
    canonicalVerdict:'near_entry',
    visualBucket:'near_entry',
    badgeLabel:'Near Entry',
    actionLabel:'Wait for stronger confirmation before considering entry.',
    scanVerdictLabel:'Near Entry',
    scanScore:8,
    scanSummary:'The setup is almost ready but still needs trigger confirmation.',
    coachSummary:'Strong structure with improving response, but confirmation is still pending.',
    price:88.5,
    previousClose:87.2,
    ma20:87.8,
    ma50:84.9,
    ma200:79.4,
    rsi:61.7,
    volume:2140000,
    avgVolume:1960000,
    structureState:'strong',
    structureEligibility:'alive',
    setupLocationState:'near_20ma',
    pullbackZone:'near_20ma',
    priceabilityState:'priceable',
    bounceState:'attempt',
    stabilisationState:'stabilising',
    volumeState:'supportive',
    trendState:'strong',
    strongBullishReversal:true,
    reclaimAttempt:true,
    reclaimsLevel:true,
    reclaimRangeMeaningful:true,
    reclaimedPriorDayHigh:true,
    entry:89.1,
    stop:84.2,
    target:98.0,
    planStatus:'valid',
    riskStatus:'fits_risk',
    tradeability:'tradable',
    triggerState:'developing',
    scannerResolvedRR:2.2,
    planStamped:true
  };
}

function awayFromSupportScenario(){
  return {
    ticker:'AWAY',
    companyName:'Away From Support Plc',
    canonicalVerdict:'watch',
    visualBucket:'monitor',
    badgeLabel:'Watch',
    actionLabel:'Wait for a reset into support before considering entry again.',
    scanVerdictLabel:'Watch',
    scanScore:7,
    scanSummary:'Trend remains constructive, but price is already away from support.',
    coachSummary:'Constructive rebound, but the opportunity has already moved away from support.',
    price:72.4,
    previousClose:71.8,
    ma20:67.1,
    ma50:63.9,
    ma200:58.2,
    rsi:66.4,
    volume:2410000,
    avgVolume:1980000,
    structureState:'strong',
    structureEligibility:'alive',
    setupLocationState:'off_level',
    pullbackZone:'left_support_zone',
    priceabilityState:'priceable',
    bounceState:'confirmed',
    stabilisationState:'clear',
    volumeState:'supportive',
    trendState:'strong',
    strongBullishReversal:true,
    strongBullishContinuation:true,
    reclaimAttempt:true,
    reclaimsLevel:true,
    reclaimRangeMeaningful:true,
    reclaimedPriorDayHigh:true,
    entry:73.2,
    stop:67.4,
    target:86.0,
    planStatus:'valid',
    riskStatus:'fits_risk',
    tradeability:'tradable',
    triggerState:'waiting_for_trigger',
    scannerResolvedRR:2.2,
    planStamped:true
  };
}

function supportFailedScenario(){
  return {
    ticker:'FAILR',
    companyName:'Failed Support Plc',
    canonicalVerdict:'avoid',
    visualBucket:'avoid',
    badgeLabel:'Avoid',
    actionLabel:'Wait for stronger confirmation before considering entry.',
    scanVerdictLabel:'Avoid',
    scanScore:3,
    scanSummary:'Support failed and the setup needs repair.',
    coachSummary:'The prior support test failed and buyers lost control.',
    price:47.2,
    previousClose:49.6,
    ma20:50.8,
    ma50:52.1,
    ma200:58.4,
    rsi:38.2,
    volume:3180000,
    avgVolume:2010000,
    structureState:'weakening',
    structureEligibility:'damaged',
    setupLocationState:'lost_support',
    pullbackZone:'below_support',
    priceabilityState:'unpriceable',
    bounceState:'failed',
    supportContext:'20ma_support',
    supportTestState:'failed',
    buyerControlState:'none',
    stabilisationState:'none',
    volumeState:'heavy_distribution',
    trendState:'weakening',
    entry:'',
    stop:'',
    target:'',
    planStatus:'missing',
    riskStatus:'plan_missing',
    tradeability:'unpriceable',
    triggerState:'',
    scannerResolvedRR:'',
    planStamped:false,
    normalizedAnalysis:{
      canonicalValues:{
        price:47.2,
        ma20:50.8,
        ma50:52.1,
        ma200:58.4
      },
      trustedMarketContext:{
        recentCandleSequence:[
          {date:'2026-06-27', open:49.8, high:50.1, low:46.8, close:47.2, volume:3180000},
          {date:'2026-06-26', open:48.4, high:50.0, low:48.1, close:49.6, volume:2640000},
          {date:'2026-06-25', open:50.7, high:51.1, low:48.6, close:48.8, volume:2410000}
        ]
      }
    }
  };
}

async function extractSemanticAgreement(page, ticker){
  return page.evaluate(({ticker}) => {
    const record = getTickerRecord(ticker);
    const globalVerdict = resolveGlobalVerdict(record);
    const reviewSimplified = resolveSimplifiedStateForSurface(record, 'review', {
      log:false,
      source:'track_state_semantic_contract',
      reason:'track_state_semantic_contract'
    });
    const trackSimplified = resolveSimplifiedStateForSurface(record, 'track', {
      log:false,
      source:'track_state_semantic_contract',
      reason:'track_state_semantic_contract'
    });
    const derivedStates = analysisDerivedStatesFromRecord(record);
    const displayedPlan = deriveCurrentPlanState(
      record.plan && record.plan.entry,
      record.plan && record.plan.stop,
      record.plan && record.plan.firstTarget,
      record.marketData && record.marketData.currency
    );
    const resolvedVerdict = reviewSimplified.canonicalVerdict || globalVerdict.final_verdict || globalVerdict.finalVerdict || 'watch';
    const rrValue = Number.isFinite(displayedPlan && displayedPlan.rewardRisk && displayedPlan.rewardRisk.rrRatio)
      ? Number(displayedPlan.rewardRisk.rrRatio)
      : null;
    const reviewSemanticStatus = buildReviewSemanticStatus({
      record,
      simplifiedState:reviewSimplified,
      globalVerdict,
      derivedStates,
      displayedPlan,
      planRealism:{raw_rr:rrValue, realistic_rr:rrValue}
    });
    const reviewDisplay = buildResolvedReviewDisplayModel({
      record,
      simplifiedState:reviewSimplified,
      globalVerdict,
      reviewSemanticStatus,
      derivedStates,
      displayedPlan,
      planRealism:{raw_rr:rrValue, realistic_rr:rrValue}
    });
    const trackPresentation = buildSharedReviewTrackPresentation(record, {
      surface:'track',
      simplifiedState:trackSimplified,
      lifecycleSnapshot:watchlistLifecycleSnapshot(record),
      globalVerdict,
      source:'track_state_semantic_contract',
      reason:'track_state_semantic_contract'
    });
    const trackDiagnostics = buildTrackDiagnosticSnapshot(record);
    const reviewProjection = reviewDisplay && reviewDisplay.decisionProjection ? reviewDisplay.decisionProjection : null;
    const trackProjection = trackPresentation && trackPresentation.trackSemanticProjection ? trackPresentation.trackSemanticProjection : null;
    return {
      reviewProjection,
      trackProjection,
      diagnosticsSemantics:trackDiagnostics && trackDiagnostics.semantics ? trackDiagnostics.semantics : null,
      reviewDecisionSummary:String(reviewDisplay && reviewDisplay.decisionSummary || ''),
      trackDecisionSummary:String(trackPresentation && trackPresentation.trackDecisionSummary || ''),
      trackPrimaryReason:String(trackPresentation && trackPresentation.trackPrimaryReason || ''),
      trackNextAction:String(trackPresentation && trackPresentation.trackNextAction || '')
    };
  }, {ticker});
}

async function resolveReviewActionConflict(page, {
  ticker,
  verdict = 'watch',
  globalVerdict = {},
  simplifiedState = {},
  reviewSemanticStatus = {},
  derivedStates = {},
  displayedPlan = {},
  planRealism = {},
  analysisState = null,
  storyContextOverride = null
}){
  return page.evaluate(payload => {
    const record = {
      ticker:payload.ticker,
      marketData:{price:55, currency:'USD'},
      review:{},
      setup:{},
      plan:{},
      watchlist:{}
    };
    if(payload.analysisState){
      record.review.analysisState = payload.analysisState;
    }
    const global = {
      final_verdict:payload.verdict,
      ...payload.globalVerdict
    };
    const simplified = {
      canonicalVerdict:payload.verdict,
      ...payload.simplifiedState
    };
    const originalBuildCanonicalStoryContextForRecord = typeof buildCanonicalStoryContextForRecord === 'function'
      ? buildCanonicalStoryContextForRecord
      : null;
    if(payload.storyContextOverride){
      globalThis.buildCanonicalStoryContextForRecord = function(){
        return payload.storyContextOverride;
      };
    }
    let resolved = null;
    try{
      resolved = buildResolvedReviewDisplayModel({
        record,
        simplifiedState:simplified,
        globalVerdict:global,
        reviewSemanticStatus:payload.reviewSemanticStatus,
        derivedStates:payload.derivedStates,
        displayedPlan:payload.displayedPlan,
        planRealism:payload.planRealism
      });
    }finally{
      if(payload.storyContextOverride){
        if(originalBuildCanonicalStoryContextForRecord){
          globalThis.buildCanonicalStoryContextForRecord = originalBuildCanonicalStoryContextForRecord;
        }else{
          delete globalThis.buildCanonicalStoryContextForRecord;
        }
      }
    }
    return {
      nextActionLabel:String(resolved.nextActionLabel || ''),
      decisionSummary:String(resolved.decisionSummary || ''),
      storyContext:resolved.storyContext || null,
      decisionProjection:resolved.decisionProjection || null
    };
  }, {
    ticker,
    verdict,
    globalVerdict,
    simplifiedState,
    reviewSemanticStatus,
    derivedStates,
    displayedPlan,
    planRealism,
    analysisState,
    storyContextOverride
  });
}

async function extractScanReviewParity(page, ticker){
  return page.evaluate(symbol => {
    const record = getTickerRecord(symbol);
    const globalVerdict = resolveGlobalVerdict(record);
    const derivedStates = analysisDerivedStatesFromRecord(record);
    const displayedPlan = deriveCurrentPlanState(
      record.plan && record.plan.entry,
      record.plan && record.plan.stop,
      record.plan && record.plan.firstTarget,
      record.marketData && record.marketData.currency
    );
    const analysisState = typeof getReviewAnalysisState === 'function' ? getReviewAnalysisState(record) : null;
    const normalizedAnalysis = analysisState && analysisState.normalizedAnalysis && typeof analysisState.normalizedAnalysis === 'object'
      ? analysisState.normalizedAnalysis
      : null;
    const reviewSimplified = resolveSimplifiedStateForSurface(record, 'review', {
      log:false,
      source:'scan_review_parity_contract',
      reason:'scan_review_parity_contract'
    });
    const reviewSemanticStatus = buildReviewSemanticStatus({
      record,
      simplifiedState:reviewSimplified,
      globalVerdict,
      derivedStates,
      displayedPlan,
      planRealism:{raw_rr:2.2, realistic_rr:2.2}
    });
    const reviewDisplay = buildResolvedReviewDisplayModel({
      record,
      simplifiedState:reviewSimplified,
      globalVerdict,
      reviewSemanticStatus,
      derivedStates,
      displayedPlan,
      planRealism:{raw_rr:2.2, realistic_rr:2.2}
    });
    const scannerVisualState = resolveVisualState(record, 'scanner', {
      derivedStates,
      displayedPlan,
      analysis:normalizedAnalysis
    });
    const storyWithoutAnalysis = buildCanonicalStoryContextForRecord(record, {
      globalVerdict,
      derivedStates
    });
    const storyWithAnalysis = buildCanonicalStoryContextForRecord(record, {
      analysis:normalizedAnalysis || {},
      globalVerdict,
      derivedStates
    });
    const trackPresentation = buildSharedReviewTrackPresentation(record, {
      surface:'track',
      simplifiedState:resolveSimplifiedStateForSurface(record, 'track', {
        log:false,
        source:'scan_review_parity_contract',
        reason:'scan_review_parity_contract'
      }),
      lifecycleSnapshot:watchlistLifecycleSnapshot(record),
      globalVerdict,
      source:'scan_review_parity_contract',
      reason:'scan_review_parity_contract'
    });
    const accepted50 = isAccepted50MaSupportTestDisplayState({
      record,
      simplifiedState:reviewSimplified,
      globalVerdict,
      derivedStates
    });
    return {
      scannerSummary:String(scannerVisualState && scannerVisualState.decision_summary || ''),
      scannerVerdict:String(scannerVisualState && (scannerVisualState.finalVerdict || scannerVisualState.final_verdict) || '').trim().toLowerCase(),
      scannerBucket:String(scannerVisualState && (scannerVisualState.bucket || scannerVisualState.visualBucket) || '').trim().toLowerCase(),
      reviewDecisionSummary:String(reviewDisplay && reviewDisplay.decisionSummary || ''),
      reviewTechnicalContext:String(reviewDisplay && reviewDisplay.technicalContextLine || ''),
      reviewProjection:reviewDisplay && reviewDisplay.decisionProjection ? reviewDisplay.decisionProjection : null,
      scannerTechnicalSummary:scanCardTechnicalSummaryForView({item:record, setupStates:derivedStates}),
      trackPrimaryReason:String(trackPresentation && trackPresentation.trackPrimaryReason || ''),
      trackNextAction:String(trackPresentation && trackPresentation.trackNextAction || ''),
      trackProjection:trackPresentation && trackPresentation.trackSemanticProjection
        ? trackPresentation.trackSemanticProjection
        : null,
      storyWithoutAnalysis:storyWithoutAnalysis || null,
      storyWithAnalysis:storyWithAnalysis || null,
      accepted50,
      accepted50Allowed:typeof accepted50MaSupportTestAllowedForStoryContext === 'function'
        ? accepted50MaSupportTestAllowedForStoryContext(storyWithAnalysis)
        : null
    };
  }, ticker);
}

test('canonical Entry uses a neutral tracked section heading and consistent review/track RR copy', async ({page}) => {
  await bootApp(page);
  await seedScenario(page, entryScenario());

  await expect(page.locator('#reviewWorkspace .review-summary-badges .badge')).toContainText('Entry');
  await expect(page.locator('#tradeStatusBox')).toContainText('Entry Ready');
  await expect(page.locator('#tradePlanInputs')).not.toHaveClass(/review-hidden/);
  await expect(page.locator('#rrValue')).toContainText('3.25R');
  await expect(page.locator('#paperTradeBtn')).toBeEnabled();

  await openTrackTab(page);
  await waitForUiTransitionSettle(page);

  const activeHeader = page.locator('.watchlistgroup__header').first();
  await expect(activeHeader).toContainText('Tracked Setups');
  await expect(activeHeader).not.toContainText('Monitor');
  await expect(activeHeader).not.toContainText('waiting for confirmation');

  const trackCard = page.locator('[data-watchlist-ticker="ENTR"]').first();
  await expect(trackCard.locator('.badge.state-pill').first()).toContainText('Entry');
  await expect(trackCard).toContainText('Entry Ready');
  await expect(trackCard).toContainText('Buyers are in control and the setup is ready to act on.');
  await expect(trackCard).toContainText('Execute only if the trigger remains valid.');
  await expect(trackCard).not.toContainText('waiting for confirmation');

  const entryPanelText = await page.evaluate(() => {
    const panel = document.querySelector('[data-watchlist-ticker="ENTR"] .entry-conditions-panel');
    return String(panel && panel.textContent || '').replace(/\s+/g, ' ').trim();
  });

  expect(entryPanelText).toContain('Status: Entry Ready');
  expect(entryPanelText).toContain('the plan is valid at 3.25R');
  expect(entryPanelText).not.toContain('2.5R');
});

test('canonical Watch stays non-actionable and may still require confirmation', async ({page}) => {
  await bootApp(page);
  await seedScenario(page, watchScenario());

  await expect(page.locator('#reviewWorkspace .review-summary-badges .badge')).toContainText('Watch');
  await expect(page.locator('#tradeStatusBox')).not.toContainText('Entry Ready');
  await expect(page.locator('#tradePlanInputs')).toHaveClass(/review-hidden/);
  await expect(page.locator('#paperTradeBtn')).toBeDisabled();

  await openTrackTab(page);
  await waitForUiTransitionSettle(page);

  const trackCard = page.locator('[data-watchlist-ticker="WATC"]').first();
  await expect(trackCard.locator('.badge.state-pill').first()).toContainText('Watch');
  await expect(trackCard).toContainText(/confirmation|Wait for stronger confirmation/i);
  await expect(trackCard).not.toContainText('Entry Ready');
});

test('stale Near Entry presentation cannot publish an unqualified Near Entry decision', async ({page}) => {
  await bootApp(page);
  await seedScenario(page, nearEntryScenario());

  await expect(page.locator('#reviewWorkspace .review-summary-badges .badge')).toContainText('Watch');
  await expect(page.locator('#tradeStatusBox')).not.toContainText('Entry Ready');
  await expect(page.locator('#paperTradeBtn')).toBeDisabled();

  await openTrackTab(page);
  await waitForUiTransitionSettle(page);

  const trackCard = page.locator('[data-watchlist-ticker="NEAR"]').first();
  await expect(trackCard.locator('.badge.state-pill').first()).toContainText('Watch');
  await expect(trackCard).not.toContainText('Entry Ready');
  await expect(trackCard).toContainText(/confirmation|Wait for stronger confirmation/i);

  const entryPanelText = await page.evaluate(() => {
    const panel = document.querySelector('[data-watchlist-ticker="NEAR"] .entry-conditions-panel');
    return String(panel && panel.textContent || '').replace(/\s+/g, ' ').trim();
  });

  expect(entryPanelText).not.toContain('Status: Entry Ready');
  expect(entryPanelText).not.toContain('This setup is Entry because');
});

test('Review and Track may differ in Category B narrative while Track retains its published decision projection', async ({page}) => {
  await bootApp(page);
  await seedScenario(page, watchScenario());

  const result = await extractSemanticAgreement(page, 'WATC');

  expect(result.reviewDecisionSummary).toContain('Watch');
  expect(result.trackDecisionSummary).toContain('Watch');
  expect(result.reviewDecisionSummary).not.toBe('');
  expect(result.trackDecisionSummary).not.toBe('');
  expect(result.trackPrimaryReason).not.toBe('');
  expect(result.trackNextAction).not.toBe('');
  expect(result.trackProjection).toMatchObject({
    canonicalVerdict:'watch',
    actionability:'blocked'
  });
  expect(result.diagnosticsSemantics).toMatchObject({
    canonicalVerdict:result.trackProjection.canonicalVerdict,
    currentPhase:result.trackProjection.currentPhase,
    actionability:result.trackProjection.actionability,
    decisiveReason:result.trackProjection.decisiveReason,
    blocker:result.trackProjection.blocker,
    supportRelationship:result.trackProjection.supportRelationship,
    opportunityCondition:result.trackProjection.opportunityCondition,
    planStatus:result.trackProjection.planStatus
  });
  expect(result.diagnosticsSemantics.authoritySource).toBe('canonical_publication');
});

test('constructive weak-RR Watch keeps the specific nearby-resistance explanation in Review', async ({page}) => {
  await bootApp(page);

  const result = await page.evaluate(() => {
    const semantic = buildReviewSemanticStatus({
      simplifiedState:{
        canonicalVerdict:'watch',
        structureState:'strong',
        structureEligibility:'alive',
        setupLocationState:'near_20ma',
        priceabilityState:'priceable',
        bounceState:'attempt',
        planStatus:'valid',
        mainBlocker:'Nearby resistance keeps the first target close, while the stop still needs to sit lower beneath support.'
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
        structureEligibility:'alive',
        setupLocationState:'near_20ma',
        priceabilityState:'priceable',
        bounceState:'attempt',
        stabilisationState:'clear',
        volumeState:'weak'
      },
      displayedPlan:{
        status:'valid',
        entry:104.8,
        stop:100.8,
        target:107.78,
        firstTarget:107.78,
        rewardRisk:{valid:true, rrRatio:0.745},
        riskFit:{risk_status:'fits_risk', position_size:10, max_loss:40},
        capitalFit:{capital_fit:'acceptable', quote_currency:'USD'},
        tradeability:'tradable',
        affordability:'affordable'
      },
      planRealism:{raw_rr:0.7448, realistic_rr:0.7448}
    });
    const resolved = buildResolvedReviewDisplayModel({
      record:{ticker:'MS', marketData:{price:104.8, currency:'USD'}},
      simplifiedState:{
        canonicalVerdict:'watch',
        structureState:'strong',
        structureEligibility:'alive',
        bounceState:'attempt',
        volumeState:'weak',
        actionLabel:'Wait for stronger confirmation before considering entry.'
      },
      globalVerdict:{final_verdict:'watch'},
      reviewSemanticStatus:semantic,
      derivedStates:{
        structureState:'strong',
        structureEligibility:'alive',
        pullbackState:'near_20ma',
        setupLocationState:'near_20ma',
        priceabilityState:'priceable',
        bounceState:'attempt',
        stabilisationState:'clear',
        volumeState:'weak'
      },
      displayedPlan:{
        status:'valid',
        entry:104.8,
        stop:100.8,
        target:107.78,
        firstTarget:107.78,
        rewardRisk:{valid:true, rrRatio:0.745},
        riskFit:{risk_status:'fits_risk', position_size:10, max_loss:40},
        capitalFit:{capital_fit:'acceptable', quote_currency:'USD'},
        tradeability:'tradable',
        affordability:'affordable'
      },
      planRealism:{raw_rr:0.7448, realistic_rr:0.7448}
    });
    return {
      stateLabel:String(semantic.stateLabel || ''),
      tradeStatus:String(semantic.tradeStatus && `${semantic.tradeStatus.line1} ${semantic.tradeStatus.line2}` || ''),
      blocker:String(semantic.blocker || ''),
      resolvedNarrative:String(resolved.resolvedNarrative || ''),
      reviewStatus:String(resolved.tradeStatus && resolved.tradeStatus.line1 || ''),
      rrDisplay:String(resolved.rrDisplay || '')
    };
  });

  const combinedText = [
    result.stateLabel,
    result.tradeStatus,
    result.blocker,
    result.resolvedNarrative,
    result.reviewStatus
  ].join(' ');

  expect(result.stateLabel).toContain('Watch');
  expect(result.rrDisplay).toBe('Priced');
  expect(combinedText).toMatch(/buyers are starting to respond|bounce is interesting/i);
  expect(combinedText).toMatch(/nearby resistance|first target close/i);
  expect(combinedText).toMatch(/stop still needs to sit lower|beneath support/i);
  expect(combinedText).toMatch(/reward-to-risk is still too weak|not good enough yet/i);
  expect(combinedText).not.toMatch(/The app knows the maths, but the trade isn't ready/i);
  expect(combinedText).not.toMatch(/Long-press the ticker card in Track for more info/i);
});

test('Review next action uses semantic reset guidance before conflicting legacy confirmation labels', async ({page}) => {
  await bootApp(page);
  const result = await resolveReviewActionConflict(page, {
    ticker:'RSET',
    verdict:'watch',
    globalVerdict:{
      structure_eligibility:'alive',
      viability:'watchlist',
      viabilityBranchId:'alive_watchlist'
    },
    simplifiedState:{
      structureState:'strong',
      structureEligibility:'alive',
      actionLabel:'Wait for stronger confirmation before considering entry.'
    },
    reviewSemanticStatus:{
      nextAction:'Wait for stronger confirmation before considering entry.',
      primaryReason:'Legacy confirmation guidance should not win.',
      blocker:'Legacy confirmation guidance should not win.'
    },
    derivedStates:{
      structureState:'strong',
      setupLocationState:'off_level',
      priceabilityState:'priceable',
      bounceState:'confirmed',
      stabilisationState:'clear',
      volumeState:'supportive'
    },
    displayedPlan:{status:'valid'},
    planRealism:{raw_rr:2.3},
    storyContextOverride:{
      structure:{state:'strong'},
      support:{label:'20MA'},
      buyerResponse:{semantic:'response_present'},
      buyerControl:{state:'confirmed'},
      confirmation:{state:'follow_through_confirmed'},
      volume:{state:'supportive'},
      currentPhase:'away_from_support'
    }
  });

  expect(result.decisionProjection.currentPhase).toBe('away_from_support');
  expect(result.nextActionLabel).toMatch(/reset into support|usable pullback into support/i);
  expect(result.nextActionLabel).not.toMatch(/stronger confirmation|stabilise|review again later/i);
});

test('Review next action uses failed-support guidance before constructive legacy watch labels', async ({page}) => {
  await bootApp(page);
  const result = await resolveReviewActionConflict(page, {
    ticker:'FAIL',
    verdict:'watch',
    globalVerdict:{
      structure_eligibility:'alive',
      viability:'watchlist',
      viabilityBranchId:'alive_watchlist'
    },
    simplifiedState:{
      structureState:'strong',
      structureEligibility:'alive',
      actionLabel:'Wait for stronger confirmation before considering entry.'
    },
    reviewSemanticStatus:{
      nextAction:'Wait for stronger confirmation before considering entry.',
      primaryReason:'Legacy watch guidance should not win.',
      blocker:'Legacy watch guidance should not win.'
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
    planRealism:{raw_rr:2},
    storyContextOverride:{
      structure:{state:'strong'},
      support:{label:'20MA'},
      buyerResponse:{semantic:'response_failed'},
      buyerControl:{state:'none'},
      confirmation:{state:'follow_through_unknown'},
      volume:{state:'supportive'},
      currentPhase:'support_failed'
    }
  });

  expect(result.decisionProjection.currentPhase).toBe('support_failed');
  expect(result.nextActionLabel).toMatch(/repair|reclaim|avoid/i);
  expect(result.nextActionLabel).not.toMatch(/stronger confirmation|buyers to prove control/i);
});

test('Review next action uses renewed follow-through guidance before initial confirmation labels', async ({page}) => {
  await bootApp(page);
  const result = await resolveReviewActionConflict(page, {
    ticker:'STALL',
    verdict:'near_entry',
    globalVerdict:{
      structure_eligibility:'alive',
      viability:'watchlist',
      viabilityBranchId:'alive_watchlist'
    },
    simplifiedState:{
      structureState:'strong',
      structureEligibility:'alive',
      actionLabel:'Wait for buyers to prove control before considering an entry.'
    },
    reviewSemanticStatus:{
      nextAction:'Wait for buyers to prove control before considering an entry.',
      primaryReason:'Legacy initial confirmation guidance should not win.',
      blocker:'Legacy initial confirmation guidance should not win.'
    },
    derivedStates:{
      structureState:'strong',
      setupLocationState:'near_20ma',
      priceabilityState:'priceable',
      bounceState:'confirmed',
      stabilisationState:'clear',
      volumeState:'supportive'
    },
    displayedPlan:{status:'valid'},
    planRealism:{raw_rr:2.4},
    storyContextOverride:{
      structure:{state:'strong'},
      support:{label:'20MA'},
      buyerResponse:{semantic:'response_present'},
      buyerControl:{state:'confirmed'},
      confirmation:{state:'follow_through_unconfirmed'},
      volume:{state:'supportive'},
      currentPhase:'stalled_after_response'
    }
  });

  expect(result.decisionProjection.currentPhase).toBe('stalled_after_response');
  expect(result.nextActionLabel).toMatch(/follow-through|stronger follow-through/i);
  expect(result.nextActionLabel).not.toMatch(/buyers to prove control|real buyer response/i);
});

test('Review next action keeps legacy fallback when semantic action is unknown', async ({page}) => {
  await bootApp(page);
  const result = await page.evaluate(() => ({
    semanticFallback:reviewNextActionFromDecisionSemantics({}, {
      legacySemanticNextAction:'Legacy semantic fallback should survive.',
      legacySimplifiedActionLabel:'Legacy simplified fallback should not be needed.'
    }),
    simplifiedFallback:reviewNextActionFromDecisionSemantics({}, {
      legacySemanticNextAction:'',
      legacySimplifiedActionLabel:'Legacy simplified fallback should survive.'
    }),
    genericFallback:reviewNextActionFromDecisionSemantics({}, {
      legacySemanticNextAction:'',
      legacySimplifiedActionLabel:''
    })
  }));

  expect(result.semanticFallback).toBe('Legacy semantic fallback should survive.');
  expect(result.simplifiedFallback).toBe('Legacy simplified fallback should survive.');
  expect(result.genericFallback).toBe('Review setup inputs');
});

test('Review away-from-support semantic action outranks stale reviewSemanticStatus.nextAction', async ({page}) => {
  await bootApp(page);
  const result = await resolveReviewActionConflict(page, {
    ticker:'AWAY',
    verdict:'watch',
    globalVerdict:{
      structure_eligibility:'alive',
      viability:'watchlist',
      viabilityBranchId:'alive_watchlist'
    },
    simplifiedState:{
      structureState:'strong',
      structureEligibility:'alive',
      actionLabel:'Wait for stronger confirmation before considering entry.'
    },
    reviewSemanticStatus:{
      nextAction:'Wait for stronger confirmation before considering entry.',
      primaryReason:'Legacy confirmation guidance should not outrank reset semantics.',
      blocker:'Legacy confirmation guidance should not outrank reset semantics.'
    },
    derivedStates:{
      structureState:'strong',
      setupLocationState:'off_level',
      priceabilityState:'priceable',
      bounceState:'confirmed',
      stabilisationState:'clear',
      volumeState:'supportive'
    },
    displayedPlan:{status:'valid'},
    planRealism:{raw_rr:2.3},
    storyContextOverride:{
      structure:{state:'strong'},
      support:{label:'20MA'},
      buyerResponse:{semantic:'response_present'},
      buyerControl:{state:'confirmed'},
      confirmation:{state:'confirmed'},
      volume:{state:'supportive'},
      currentPhase:'away_from_support'
    }
  });

  expect(result.decisionProjection.currentPhase).toBe('away_from_support');
  expect(result.nextActionLabel).toMatch(/reset (?:into|closer to) support|usable pullback into support/i);
  expect(result.nextActionLabel).not.toMatch(/stronger confirmation before considering entry/i);
});

test('helper-level Review support-failed semantic action outranks supplied simplified fallback', async ({page}) => {
  await bootApp(page);
  const result = await resolveReviewActionConflict(page, {
    ticker:'FAIL',
    verdict:'avoid',
    globalVerdict:{
      structure_eligibility:'damaged',
      viability:'reject',
      viabilityBranchId:'terminal_reject'
    },
    simplifiedState:{
      structureState:'weakening',
      structureEligibility:'damaged',
      actionLabel:'Wait for stronger confirmation before considering entry.'
    },
    reviewSemanticStatus:{
      nextAction:'',
      primaryReason:'Constructive fallback should not survive failed support.',
      blocker:'Constructive fallback should not survive failed support.'
    },
    derivedStates:{
      structureState:'weakening',
      setupLocationState:'lost_support',
      priceabilityState:'unpriceable',
      bounceState:'failed',
      stabilisationState:'none',
      volumeState:'heavy_distribution'
    },
    displayedPlan:{status:'missing'},
    planRealism:{raw_rr:null},
    storyContextOverride:{
      structure:{state:'weakening'},
      support:{label:'20MA'},
      buyerResponse:{semantic:'response_failed'},
      buyerControl:{state:'lost'},
      confirmation:{state:'failed'},
      volume:{state:'heavy_distribution'},
      currentPhase:'support_failed'
    }
  });

  expect(result.decisionProjection.currentPhase).toBe('support_failed');
  expect(result.nextActionLabel).toMatch(/repair|reclaim|avoid/i);
  expect(result.nextActionLabel).not.toMatch(/stronger confirmation before considering entry/i);
});

test('rehydrated stale Review projection action copy loses to recomputed failed-support semantic action', async ({page}) => {
  await bootApp(page);
  await seedScenario(page, supportFailedScenario());
  await page.evaluate(() => {
    const record = getTickerRecord('FAILR');
    const staleAction = 'Wait for stronger confirmation before considering entry.';
    const staleSnapshot = projectionSnapshotWithAuthority({
      ticker:'FAILR',
      canonicalVerdict:'entry',
      finalVerdict:'entry',
      renderedVerdict:'Entry',
      sourceOfTruthVisualBucket:'entry',
      visualBucket:'entry',
      tone:'entry',
      actionGuidance:staleAction,
      actionLabel:staleAction,
      actionShortLabel:staleAction,
      decisionSummary:'STALE REVIEW PROJECTION SUMMARY DO NOT SHOW'
    }, record, {
      authority:{version:1, source:'persisted_test'}
    });
    writeSavedReviewAuthority(record, {
      savedVerdict:'Entry',
      savedProjectionSnapshot:staleSnapshot
    }, {
      clearProjectionWhenNonEntry:false
    });
    commitTickerState();
    if(typeof persistState === 'function') persistState();
  });

  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => {
    if(typeof startupDebugRenderState !== 'function') return false;
    const ready = startupDebugRenderState();
    return !!(ready && ready.hydrationComplete === true && ready.riskRefreshComplete === true);
  }, null, {timeout:30000});
  const skipButton = page.getByRole('button', {name:'Skip'});
  if(await skipButton.count()){
    try{
      if(await skipButton.isVisible()) await skipButton.click();
    }catch(_error){}
  }

  const restoredPath = await page.evaluate(() => {
    const record = getTickerRecord('FAILR');
    const storedSnapshot = reviewStoredProjectionSnapshot(record);
    const restoredProjection = persistedReviewProjectionSnapshot(record, 'restored_review_action_failed_support');
    const simplified = resolveSimplifiedStateForSurface(record, 'review', {
      log:false,
      source:'restored_review_action_failed_support',
      reason:'restored_review_action_failed_support'
    });
    const globalVerdict = resolveGlobalVerdict(record);
    const derivedStates = analysisDerivedStatesFromRecord(record);
    return {
      storedActionGuidance:String(storedSnapshot && (
        storedSnapshot.actionGuidance
        || storedSnapshot.actionLabel
        || storedSnapshot.actionShortLabel
      ) || '').trim(),
      storedProjectionVerdict:String(storedSnapshot && (
        storedSnapshot.canonicalVerdict
        || storedSnapshot.finalVerdict
        || storedSnapshot.renderedVerdict
      ) || '').trim().toLowerCase(),
      restoredProjectionAvailable:!!restoredProjection,
      recomputedSimplifiedActionLabel:String(simplified && simplified.actionLabel || '').trim(),
      canonicalVerdict:String(globalVerdict && (globalVerdict.final_verdict || globalVerdict.finalVerdict) || '').trim().toLowerCase(),
      structureState:String(derivedStates && derivedStates.structureState || '').trim().toLowerCase()
    };
  });

  expect(restoredPath.storedActionGuidance).toBe('Wait for stronger confirmation before considering entry.');
  expect(restoredPath.storedProjectionVerdict).toBe('entry');
  expect(restoredPath.restoredProjectionAvailable).toBe(false);
  expect(restoredPath.canonicalVerdict).toBe('watch');
  expect(restoredPath.structureState).toBe('weakening');

  await page.evaluate(() => {
    uiState.activeReviewSourceProjectionSnapshot = null;
    uiState.activeReviewProjectionSource = 'non_watchlist_direct_resolve';
    setActiveReviewTicker('FAILR');
    renderReviewWorkspace({source:'restored_review_action_failed_support'});
    renderWatchlist({source:'restored_review_action_failed_support'});
  });

  const state = await extractAppTickerState(page, 'FAILR');
  const reviewAction = [
    state.visibleCopy.review.nextActionInline,
    state.visibleCopy.review.nextActionPrimary
  ].filter(Boolean).join(' ');
  expect(reviewAction).not.toBe('');
  expect(reviewAction).not.toMatch(/stronger confirmation before considering entry/i);
  expect(reviewAction).not.toContain('STALE REVIEW PROJECTION SUMMARY DO NOT SHOW');

  const semantics = await extractSemanticAgreement(page, 'FAILR');
  expect(semantics.reviewProjection.canonicalVerdict).toBe('watch');
  expect(semantics.trackProjection.canonicalVerdict).toBe('watch');
  expect(semantics.reviewProjection.currentPhase).toBe('support_failed');
  expect(semantics.trackProjection.currentPhase).toBe('watch');
  expect(semantics.trackProjection.blocker).not.toContain('STALE REVIEW');
  expect(semantics.reviewProjection.actionability).toBe(semantics.trackProjection.actionability);
});

test('Review and Track keep phase and blocker aligned while next actions differ by role', async ({page}) => {
  await bootApp(page);
  await seedScenario(page, awayFromSupportScenario());

  const semantics = await extractSemanticAgreement(page, 'AWAY');
  const reviewAction = await page.evaluate(() => {
    const record = getTickerRecord('AWAY');
    const globalVerdict = resolveGlobalVerdict(record);
    const derivedStates = analysisDerivedStatesFromRecord(record);
    const simplifiedState = resolveSimplifiedStateForSurface(record, 'review', {
      log:false,
      source:'review_track_action_parity',
      reason:'review_track_action_parity'
    });
    const displayedPlan = deriveCurrentPlanState(record.plan.entry, record.plan.stop, record.plan.firstTarget, record.marketData.currency);
    const semantic = buildReviewSemanticStatus({
      record,
      simplifiedState,
      globalVerdict,
      derivedStates,
      displayedPlan,
      planRealism:{raw_rr:2.2, realistic_rr:2.2}
    });
    const resolved = buildResolvedReviewDisplayModel({
      record,
      simplifiedState,
      globalVerdict,
      reviewSemanticStatus:semantic,
      derivedStates,
      displayedPlan,
      planRealism:{raw_rr:2.2, realistic_rr:2.2}
    });
    return String(resolved.nextActionLabel || '');
  });

  expect(semantics.trackProjection.canonicalVerdict).toBe('watch');
  expect(semantics.trackProjection.actionability).toBe('blocked');
  expect(reviewAction).toMatch(/reset into support|usable pullback into support/i);
  expect(semantics.trackNextAction).not.toBe('');
});

test('analysis-enriched story context is shared by Review, Track, and diagnostics', async ({page}) => {
  await bootApp(page);
  const seed = watchScenario();
  await page.evaluate(seedData => {
    const record = upsertTickerRecord(seedData.ticker);
    record.meta.companyName = seedData.companyName;
    record.meta.exchange = 'NASDAQ';
    record.meta.tradingViewSymbol = `NASDAQ:${seedData.ticker}`;
    record.meta.marketStatus = 'S&P above 50 MA';
    record.marketData.currency = 'USD';
    record.marketData.price = 52.4;
    record.marketData.previousClose = 52.1;
    record.marketData.ma20 = 51.8;
    record.marketData.ma50 = 49.9;
    record.marketData.ma200 = 45.2;
    record.marketData.volume = 1820000;
    record.marketData.avgVolume = 1640000;
    record.marketData.history = [
      {date:'2026-06-27', open:51.7, high:52.8, low:51.2, close:52.4, volume:1820000},
      {date:'2026-06-26', open:51.8, high:52.0, low:51.0, close:51.6, volume:1710000}
    ];
    record.setup.structureState = 'strong';
    record.setup.structureEligibility = 'alive';
    record.setup.setupLocationState = 'near_20ma';
    record.setup.pullbackZone = 'near_20ma';
    record.setup.priceabilityState = 'priceable';
    record.setup.bounceState = 'attempt';
    record.setup.stabilisationState = 'stabilising';
    record.setup.volumeState = 'supportive';
    record.setup.trendState = 'strong';
    record.plan.entry = 53.1;
    record.plan.stop = 49.2;
    record.plan.firstTarget = 60.3;
    record.plan.target = 60.3;
    record.plan.status = 'valid';
    record.plan.source = 'manual_review';
    record.watchlist.inWatchlist = true;
    record.watchlist.addedAt = '2026-06-29';
    record.watchlist.expiryAfterTradingDays = 5;
    record.review.analysisState = {
      normalized:{
        canonicalValues:{
          price:60.4,
          ma20:52.0,
          ma50:50.0,
          ma200:45.2
        },
        trustedMarketContext:{
          recentCandleSequence:[
            {date:'2026-06-27', open:58.8, high:60.8, low:58.3, close:60.4, volume:2500000},
            {date:'2026-06-26', open:57.1, high:59.2, low:56.8, close:58.9, volume:2300000},
            {date:'2026-06-25', open:54.9, high:57.4, low:54.6, close:57.0, volume:2100000}
          ]
        }
      }
    };
    state.tickers = [seedData.ticker];
    setActiveReviewTicker(seedData.ticker);
    renderReviewWorkspace({source:'analysis_enriched_semantic_contract'});
    renderWatchlist({source:'analysis_enriched_semantic_contract'});
  }, seed);

  const result = await page.evaluate(() => {
    const record = getTickerRecord('WATC');
    const globalVerdict = resolveGlobalVerdict(record);
    const derivedStates = analysisDerivedStatesFromRecord(record);
    const withoutAnalysis = buildCanonicalStoryContextForRecord(record, {
      globalVerdict,
      derivedStates
    });
    const withAnalysis = buildCanonicalStoryContextForRecord(record, {
      analysis:getReviewAnalysisState(record).normalizedAnalysis || {},
      globalVerdict,
      derivedStates
    });
    const reviewTrack = buildResolvedReviewDisplayModel({
      record,
      simplifiedState:resolveSimplifiedStateForSurface(record, 'review', {
        log:false,
        source:'analysis_enriched_semantic_contract',
        reason:'analysis_enriched_semantic_contract'
      }),
      globalVerdict,
      reviewSemanticStatus:buildReviewSemanticStatus({
        record,
        simplifiedState:resolveSimplifiedStateForSurface(record, 'review', {
          log:false,
          source:'analysis_enriched_semantic_contract',
          reason:'analysis_enriched_semantic_contract'
        }),
        globalVerdict,
        derivedStates,
        displayedPlan:deriveCurrentPlanState(record.plan.entry, record.plan.stop, record.plan.firstTarget, record.marketData.currency),
        planRealism:{raw_rr:2.0, realistic_rr:2.0}
      }),
      derivedStates,
      displayedPlan:deriveCurrentPlanState(record.plan.entry, record.plan.stop, record.plan.firstTarget, record.marketData.currency),
      planRealism:{raw_rr:2.0, realistic_rr:2.0}
    });
    const trackPresentation = buildSharedReviewTrackPresentation(record, {
      surface:'track',
      simplifiedState:resolveSimplifiedStateForSurface(record, 'track', {
        log:false,
        source:'analysis_enriched_semantic_contract',
        reason:'analysis_enriched_semantic_contract'
      }),
      lifecycleSnapshot:watchlistLifecycleSnapshot(record),
      globalVerdict,
      source:'analysis_enriched_semantic_contract',
      reason:'analysis_enriched_semantic_contract'
    });
    const diagnostics = buildTrackDiagnosticSnapshot(record);
    return {
      withoutAnalysisPhase:String(withoutAnalysis && withoutAnalysis.currentPhase || ''),
      withAnalysisPhase:String(withAnalysis && withAnalysis.currentPhase || ''),
      reviewPhase:String(reviewTrack && reviewTrack.decisionProjection && reviewTrack.decisionProjection.currentPhase || ''),
      trackPhase:String(trackPresentation && trackPresentation.trackSemanticProjection && trackPresentation.trackSemanticProjection.currentPhase || ''),
      diagnosticsPhase:String(diagnostics && diagnostics.semantics && diagnostics.semantics.currentPhase || ''),
      reviewOpportunity:String(reviewTrack && reviewTrack.decisionProjection && reviewTrack.decisionProjection.opportunityCondition || ''),
      trackOpportunity:String(trackPresentation && trackPresentation.trackSemanticProjection && trackPresentation.trackSemanticProjection.opportunityCondition || ''),
      diagnosticsOpportunity:String(diagnostics && diagnostics.semantics && diagnostics.semantics.opportunityCondition || '')
    };
  });

  expect(result.withAnalysisPhase).not.toBe('');
  expect(result.withoutAnalysisPhase).not.toBe(result.withAnalysisPhase);
  expect(result.reviewPhase).toBe(result.withAnalysisPhase);
  expect(result.trackPhase).toBe('watch');
  expect(result.diagnosticsPhase).toBe(result.trackPhase);
});

test('Scan summary prefers canonical away-from-support semantics over raw extended compatibility fields', async ({page}) => {
  await bootApp(page);
  const scenario = awayFromSupportScenario();
  scenario.setupLocationState = 'extended';
  scenario.pullbackZone = 'extended';
  scenario.bounceState = 'confirmed';
  scenario.actionLabel = 'Wait for a reset into support before considering entry again.';
  scenario.normalizedAnalysis = {
    canonicalValues:{
      price:72.4,
      ma20:68.6,
      ma50:64.4,
      ma200:58.2
    },
    trustedMarketContext:{
      recentCandleSequence:[
        {date:'2026-06-27', open:70.2, high:72.9, low:69.8, close:72.4, volume:2410000},
        {date:'2026-06-26', open:68.4, high:70.5, low:67.9, close:70.1, volume:2250000},
        {date:'2026-06-25', open:67.0, high:68.7, low:66.6, close:68.3, volume:2140000}
      ]
    }
  };
  await seedScenario(page, scenario);

  const result = await extractScanReviewParity(page, 'AWAY');

  expect(result.storyWithAnalysis.currentPhase).toBe('away_from_support');
  expect(result.scannerVerdict).toBe('watch');
  expect(result.scannerBucket).not.toBe('');
  // Consumer 2 now projects presentation copy from the validated canonical
  // publication. Narrative chronology is Category B informational output and
  // no longer establishes Scan decision copy.
  expect(result.scannerSummary).not.toBe('');
  expect(result.scannerSummary).not.toMatch(/buyers emerging|buyers responding|no pullback/i);
});

test('Scan summary does not revert to raw no-pullback copy after a completed support response has moved away from support', async ({page}) => {
  await bootApp(page);
  const scenario = awayFromSupportScenario();
  scenario.setupLocationState = 'none';
  scenario.pullbackZone = 'none';
  scenario.bounceState = 'attempt';
  scenario.normalizedAnalysis = {
    canonicalValues:{
      price:71.9,
      ma20:68.4,
      ma50:64.0,
      ma200:58.2
    },
    trustedMarketContext:{
      recentCandleSequence:[
        {date:'2026-06-27', open:69.7, high:72.2, low:69.3, close:71.9, volume:2380000},
        {date:'2026-06-26', open:68.1, high:69.9, low:67.8, close:69.6, volume:2210000},
        {date:'2026-06-25', open:66.9, high:68.5, low:66.4, close:68.0, volume:2090000}
      ]
    }
  };
  await seedScenario(page, scenario);

  const result = await extractScanReviewParity(page, 'AWAY');

  expect(result.storyWithAnalysis.currentPhase).toBe('away_from_support');
  expect(result.scannerSummary).not.toBe('');
  expect(result.scannerSummary).not.toMatch(/no pullback|developing/i);
});

test('completed continuation supersedes stale support-era fields across Scan and Review Technical Context', async ({page}) => {
  await bootApp(page);
  const scenario = awayFromSupportScenario();
  scenario.setupLocationState = 'off_level';
  scenario.pullbackZone = 'none';
  scenario.bounceState = 'attempt';
  scenario.stabilisationState = 'none';
  scenario.supportContext = '';
  scenario.supportTestState = 'not_tested';
  scenario.buyerControlState = 'none';
  scenario.normalizedAnalysis = {
    canonicalValues:{price:288.3, ma20:273.251, ma50:269.7692, ma200:250, volume:2945750},
    trustedMarketContext:{
      recentCandleSequence:[
        {date:'2026-07-14', open:288.3, high:288.3, low:288.3, close:288.3, volume:2945750},
        {date:'2026-07-13', open:289.13, high:289.13, low:289.13, close:289.13, volume:2276868},
        {date:'2026-07-10', open:286.96, high:286.96, low:286.96, close:286.96, volume:1876200},
        {date:'2026-07-09', open:285.04, high:285.04, low:285.04, close:285.04, volume:2025716}
      ]
    }
  };
  await seedScenario(page, scenario);
  await page.evaluate(() => {
    const record = getTickerRecord('AWAY');
    Object.assign(record.scan.analysisProjection.derived_states, {
      evaluation_scan_type:'20MA',
      candle_evidence_up_closes_after_low:3,
      candle_evidence_higher_low_hold:'yes',
      candle_evidence_downside_momentum_slowing:'yes'
    });
  });

  const result = await extractScanReviewParity(page, 'AWAY');

  expect(result.storyWithAnalysis.support.distanceMeasured).toBe(true);
  expect(result.storyWithAnalysis.support.distancePct).toBeGreaterThan(0.05);
  expect(result.storyWithAnalysis.buyerResponse.semantic).toBe('response_present');
  expect(result.storyWithAnalysis.buyerControl.state).toBe('confirmed');
  expect(result.storyWithAnalysis.confirmation.semantic).toBe('follow_through_confirmed');
  expect(result.storyWithAnalysis.currentPhase).toBe('extended_from_support');
  expect(result.reviewProjection.currentPhase).toBe('extended_from_support');
  expect(result.scannerSummary).not.toBe('');
  expect(result.scannerSummary).not.toMatch(/developing|no pullback|buyers emerging|buyers responding/i);
  expect(result.scannerTechnicalSummary).toBe('Structure intact | Extended from 20-day average | Buyer control confirmed');
  expect(result.reviewTechnicalContext).toMatch(/extended from 20-day average|away from 20-day average/i);
  expect(result.reviewTechnicalContext).not.toMatch(/stalled after|follow-through stalled|buyers emerging/i);
});

test('terminal structural damage retains historical response without presenting current buyer control', async ({page}) => {
  await bootApp(page);
  const scenario = watchScenario();
  Object.assign(scenario, {
    ticker:'CATX',
    companyName:'Terminal Damage Plc',
    canonicalVerdict:'watch',
    visualBucket:'diminishing',
    badgeLabel:'Watch',
    actionLabel:'Wait for stronger confirmation before considering entry.',
    scanVerdictLabel:'Watch',
    price:880.28,
    previousClose:878.4,
    ma20:968.989,
    ma50:928.9992,
    ma200:720.0148,
    structureState:'broken',
    structureEligibility:'broken',
    setupLocationState:'extended',
    pullbackZone:'extended',
    priceabilityState:'provisional',
    bounceState:'attempt',
    stabilisationState:'none',
    volumeState:'constructive',
    trendState:'weak',
    supportContext:'20ma',
    supportTestState:'not_tested',
    buyerControlState:'none',
    normalizedAnalysis:{
      canonicalValues:{price:880.28, ma20:968.989, ma50:928.9992, ma200:720.0148},
      trustedMarketContext:{
        recentCandleSequence:[
          {date:'2026-07-14', open:874.2, high:884.4, low:870.1, close:880.28, volume:3377169},
          {date:'2026-07-13', open:890.0, high:893.1, low:875.3, close:878.4, volume:3510000}
        ]
      }
    }
  });
  await seedScenario(page, scenario);
  await page.evaluate(() => {
    const record = getTickerRecord('CATX');
    Object.assign(record.scan.analysisProjection.derived_states, {
      bounce_state:'attempt',
      setup_location_state:'extended',
      pullback_zone:'extended',
      candle_evidence_up_closes_after_low:1,
      candle_evidence_reclaimed_prior_day_high:'yes'
    });
    record.scan.analysisProjection.bounce_state = 'attempt';
  });

  const result = await extractScanReviewParity(page, 'CATX');

  expect(result.storyWithAnalysis.buyerResponse.semantic).toBe('response_present');
  expect(result.storyWithAnalysis.storyEvents).toContain('buyers_responded');
  expect(result.storyWithAnalysis.buyerControl.state).toBe('failed');
  expect(result.storyWithAnalysis.confirmation.semantic).toBe('follow_through_failed');
  expect(['support_failed', 'repairing_structure']).toContain(result.storyWithAnalysis.currentPhase);
  expect(result.reviewProjection.currentPhase).toBe(result.storyWithAnalysis.currentPhase);
  expect(result.trackProjection.canonicalVerdict).toBe('avoid');
  expect(result.scannerTechnicalSummary).toMatch(/structure broken.*(failed|repairing).*buyer control failed/i);
  expect(result.scannerTechnicalSummary).not.toMatch(/buyers emerging|developing|extended/i);
  expect(result.trackPrimaryReason).not.toMatch(/trend is still healthy/i);
  expect(result.trackNextAction).not.toBe('');
});

test('Scan canonical technical projector covers active, stalled, away, extended, and terminal phases', async ({page}) => {
  await bootApp(page);
  const labels = await page.evaluate(() => {
    const context = ({phase, structure = 'intact', support = '20-day average', buyer = 'none', confirmation = 'follow_through_unknown'}) => ({
      currentPhase:phase,
      structure:{state:structure},
      support:{label:support, type:'20ma'},
      buyerResponse:{semantic:buyer === 'emerging' ? 'response_present' : 'response_unknown'},
      buyerControl:{state:buyer},
      confirmation:{semantic:confirmation, state:confirmation === 'follow_through_confirmed' ? 'confirmed' : 'unconfirmed'}
    });
    return {
      extended:canonicalScanTechnicalSummaryFromStoryContext(context({phase:'extended_from_support', buyer:'confirmed', confirmation:'follow_through_confirmed'})),
      away:canonicalScanTechnicalSummaryFromStoryContext(context({phase:'away_from_support', buyer:'confirmed', confirmation:'follow_through_confirmed'})),
      stalled:canonicalScanTechnicalSummaryFromStoryContext(context({phase:'stalled_after_response', buyer:'emerging', confirmation:'follow_through_unconfirmed'})),
      responding:canonicalScanTechnicalSummaryFromStoryContext(context({phase:'responding_from_support', buyer:'emerging', confirmation:'follow_through_unconfirmed'})),
      terminal:canonicalScanTechnicalSummaryFromStoryContext(context({phase:'repairing_structure', structure:'broken'})),
      unknown:canonicalScanTechnicalSummaryFromStoryContext(context({phase:'', structure:'unknown'}))
    };
  });

  expect(labels.extended).toBe('Structure intact | Extended from 20-day average | Buyer control confirmed');
  expect(labels.away).toBe('Structure intact | Away from 20-day average | Buyer control confirmed');
  expect(labels.stalled).toBe('Structure intact | Stalled after 20-day average | Follow-through stalled');
  expect(labels.responding).toBe('Structure intact | Responding at 20-day average | Buyers responding');
  expect(labels.terminal).toBe('Structure broken | Structure repairing | Buyer control failed');
  expect(labels.unknown).toBe('');
});

test('analysis-enriched Scan reconstruction matches Review semantics when normalized analysis changes the canonical phase', async ({page}) => {
  await bootApp(page);
  const seed = watchScenario();
  await page.evaluate(() => {
    const record = upsertTickerRecord('WATC');
    record.meta.companyName = 'Watch Holdings Plc';
    record.meta.exchange = 'NASDAQ';
    record.meta.tradingViewSymbol = 'NASDAQ:WATC';
    record.meta.marketStatus = 'S&P above 50 MA';
    record.marketData.currency = 'USD';
    record.marketData.price = 52.4;
    record.marketData.previousClose = 52.1;
    record.marketData.ma20 = 51.8;
    record.marketData.ma50 = 49.9;
    record.marketData.ma200 = 45.2;
    record.marketData.volume = 1820000;
    record.marketData.avgVolume = 1640000;
    record.marketData.history = [
      {date:'2026-06-27', open:51.7, high:52.8, low:51.2, close:52.4, volume:1820000},
      {date:'2026-06-26', open:51.8, high:52.0, low:51.0, close:51.6, volume:1710000}
    ];
    record.setup.structureState = 'strong';
    record.setup.structureEligibility = 'alive';
    record.setup.setupLocationState = 'near_20ma';
    record.setup.pullbackZone = 'near_20ma';
    record.setup.priceabilityState = 'priceable';
    record.setup.bounceState = 'attempt';
    record.setup.stabilisationState = 'stabilising';
    record.setup.volumeState = 'supportive';
    record.setup.trendState = 'strong';
    record.plan.entry = 53.1;
    record.plan.stop = 49.2;
    record.plan.firstTarget = 60.3;
    record.plan.target = 60.3;
    record.plan.status = 'valid';
    record.plan.source = 'manual_review';
    record.watchlist.inWatchlist = true;
    record.review.analysisState = {
      normalized:{
        canonicalValues:{
          price:60.4,
          ma20:52.0,
          ma50:50.0,
          ma200:45.2
        },
        trustedMarketContext:{
          recentCandleSequence:[
            {date:'2026-06-27', open:58.8, high:60.8, low:58.3, close:60.4, volume:2500000},
            {date:'2026-06-26', open:57.1, high:59.2, low:56.8, close:58.9, volume:2300000},
            {date:'2026-06-25', open:54.9, high:57.4, low:54.6, close:57.0, volume:2100000}
          ]
        }
      }
    };
    state.tickers = ['WATC'];
  }, seed);

  const result = await page.evaluate(() => {
    const record = getTickerRecord('WATC');
    const globalVerdict = resolveGlobalVerdict(record);
    const derivedStates = analysisDerivedStatesFromRecord(record);
    const displayedPlan = deriveCurrentPlanState(record.plan.entry, record.plan.stop, record.plan.firstTarget, record.marketData.currency);
    const analysisState = getReviewAnalysisState(record);
    const normalizedAnalysis = analysisState && analysisState.normalizedAnalysis && typeof analysisState.normalizedAnalysis === 'object'
      ? analysisState.normalizedAnalysis
      : {};
    const storyWithoutAnalysis = buildCanonicalStoryContextForRecord(record, {
      globalVerdict,
      derivedStates
    });
    const storyWithAnalysis = buildCanonicalStoryContextForRecord(record, {
      analysis:normalizedAnalysis,
      globalVerdict,
      derivedStates
    });
    const reviewDisplay = buildResolvedReviewDisplayModel({
      record,
      simplifiedState:resolveSimplifiedStateForSurface(record, 'review', {
        log:false,
        source:'analysis_enriched_scan_contract',
        reason:'analysis_enriched_scan_contract'
      }),
      globalVerdict,
      reviewSemanticStatus:buildReviewSemanticStatus({
        record,
        simplifiedState:resolveSimplifiedStateForSurface(record, 'review', {
          log:false,
          source:'analysis_enriched_scan_contract',
          reason:'analysis_enriched_scan_contract'
        }),
        globalVerdict,
        derivedStates,
        displayedPlan,
        planRealism:{raw_rr:2.0, realistic_rr:2.0}
      }),
      derivedStates,
      displayedPlan,
      planRealism:{raw_rr:2.0, realistic_rr:2.0}
    });
    const scannerVisualState = resolveVisualState(record, 'scanner', {
      derivedStates,
      displayedPlan,
      analysis:normalizedAnalysis,
      resolvedContract:{
        finalVerdict:'watch',
        final_verdict:'watch',
        planStatusKey:'valid',
        entry_gate_checks:{},
        near_entry_gate_checks:{}
      }
    });
    return {
      storyWithoutPhase:String(storyWithoutAnalysis && storyWithoutAnalysis.currentPhase || ''),
      storyWithPhase:String(storyWithAnalysis && storyWithAnalysis.currentPhase || ''),
      reviewPhase:String(reviewDisplay && reviewDisplay.decisionProjection && reviewDisplay.decisionProjection.currentPhase || ''),
      scannerSummary:String(scannerVisualState && scannerVisualState.decision_summary || '')
    };
  });

  expect(result.storyWithoutPhase).not.toBe(result.storyWithPhase);
  expect(result.reviewPhase).toBe(result.storyWithPhase);
  expect(result.storyWithPhase).toBe('away_from_support');
  expect(result.scannerSummary).not.toMatch(/buyers emerging|buyers responded|support is holding/i);
});

test('Scan obtains restored normalized analysis through the Review authority bridge', async ({page}) => {
  const scannerViewSource = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'js', 'scanner-view.js'), 'utf8');
  expect(scannerViewSource).not.toContain('review.analysisState.normalized');

  await bootApp(page);
  const result = await page.evaluate(() => {
    const record = upsertTickerRecord('SCBR');
    record.meta.companyName = 'Scanner Bridge Authority Plc';
    record.meta.exchange = 'NASDAQ';
    record.meta.tradingViewSymbol = 'NASDAQ:SCBR';
    record.meta.marketStatus = 'S&P above 50 MA';
    record.marketData = {
      ...record.marketData,
      currency:'USD', price:52.4, previousClose:52.1, ma20:51.8, ma50:49.9, ma200:45.2
    };
    record.setup = {
      ...record.setup,
      structureState:'strong', structureEligibility:'alive', setupLocationState:'near_20ma',
      pullbackZone:'near_20ma', priceabilityState:'priceable', bounceState:'attempt',
      stabilisationState:'stabilising', volumeState:'supportive', trendState:'strong'
    };
    record.plan = {...record.plan, entry:53.1, stop:49.2, firstTarget:60.3, target:60.3, status:'valid'};
    record.review.analysisState = {
      normalized:{
        scannerAuthority:'stale-persisted-payload',
        canonicalValues:{price:50.0, ma20:52.0, ma50:50.0, ma200:45.2},
        trustedMarketContext:{
          recentCandleSequence:[
            {date:'2026-06-27', open:50.2, high:50.7, low:49.6, close:50.0, volume:1800000},
            {date:'2026-06-26', open:50.8, high:51.2, low:49.8, close:50.3, volume:1750000}
          ]
        }
      }
    };
    const authoritativeAnalysis = {
      scannerAuthority:'review-authority',
      canonicalValues:{price:60.4, ma20:52.0, ma50:50.0, ma200:45.2},
      trustedMarketContext:{
        recentCandleSequence:[
          {date:'2026-06-27', open:58.8, high:60.8, low:58.3, close:60.4, volume:2500000},
          {date:'2026-06-26', open:57.1, high:59.2, low:56.8, close:58.9, volume:2300000},
          {date:'2026-06-25', open:54.9, high:57.4, low:54.6, close:57.0, volume:2100000}
        ]
      }
    };
    const originalAccessor = getReviewAnalysisState;
    const originalBuilder = buildCanonicalStoryContextForRecord;
    let scannerBridgeAuthority = '';
    let scannerBridgePhase = '';
    globalThis.getReviewAnalysisState = item => item && item.ticker === 'SCBR'
      ? {normalizedAnalysis:authoritativeAnalysis}
      : originalAccessor(item);
    globalThis.buildCanonicalStoryContextForRecord = function(currentRecord, options = {}){
      const story = originalBuilder(currentRecord, options);
      const usesReviewAuthority = !!(
        options.analysis
        && options.analysis.scannerAuthority === 'review-authority'
      );
      if(currentRecord && currentRecord.ticker === 'SCBR' && options.analysis && options.analysis.scannerAuthority){
        scannerBridgeAuthority = options.analysis.scannerAuthority;
        scannerBridgePhase = usesReviewAuthority ? 'away_from_support' : 'at_support';
      }
      return {
        ...story,
        currentPhase:usesReviewAuthority ? 'away_from_support' : 'at_support',
        support:{
          ...(story.support || {}),
          label:'20MA',
          type:'20ma_support',
          currentlyActive:!usesReviewAuthority
        },
        structure:{...(story.structure || {}), state:'strong'},
        buyerControl:{...(story.buyerControl || {}), state:'none'},
        confirmation:{...(story.confirmation || {}), state:'unconfirmed'}
      };
    };
    try{
      const globalVerdict = resolveGlobalVerdict(record);
      const derivedStates = analysisDerivedStatesFromRecord(record);
      const displayedPlan = deriveCurrentPlanState(record.plan.entry, record.plan.stop, record.plan.firstTarget, record.marketData.currency);
      const reviewDisplay = buildResolvedReviewDisplayModel({
        record,
        simplifiedState:resolveSimplifiedStateForSurface(record, 'review', {log:false}),
        globalVerdict,
        reviewSemanticStatus:buildReviewSemanticStatus({record, simplifiedState:resolveSimplifiedStateForSurface(record, 'review', {log:false}), globalVerdict, derivedStates, displayedPlan, planRealism:{raw_rr:2, realistic_rr:2}}),
        derivedStates,
        displayedPlan,
        planRealism:{raw_rr:2, realistic_rr:2}
      });
      scannerBridgeAuthority = '';
      scannerBridgePhase = '';
      const scanView = buildFinalSetupView(record);
      const bridgeAuthorityUsedByScan = scannerBridgeAuthority;
      const bridgePhaseUsedByScan = scannerBridgePhase;
      const scannerStory = buildCanonicalStoryContextForRecord(record, {analysis:authoritativeAnalysis, globalVerdict, derivedStates});
      const rawStory = buildCanonicalStoryContextForRecord(record, {analysis:record.review.analysisState.normalized, globalVerdict, derivedStates});
      return {
        reviewPhase:String(reviewDisplay.decisionProjection && reviewDisplay.decisionProjection.currentPhase || ''),
        scannerPhase:String(scannerStory.currentPhase || ''),
        rawPhase:String(rawStory.currentPhase || ''),
        scannerBridgeAuthority:bridgeAuthorityUsedByScan,
        scannerBridgePhase:bridgePhaseUsedByScan,
        scannerSummary:String(scanView.globalVerdict && scanView.globalVerdict.decision_summary || '')
      };
    }finally{
      globalThis.getReviewAnalysisState = originalAccessor;
      globalThis.buildCanonicalStoryContextForRecord = originalBuilder;
    }
  });

  expect(result.scannerPhase).toBe('away_from_support');
  expect(result.rawPhase).not.toBe(result.scannerPhase);
  expect(result.reviewPhase).toBe(result.scannerPhase);
  expect(result.scannerBridgeAuthority).toBe('');
  expect(result.scannerBridgePhase).toBe('');
  expect(result.scannerSummary).not.toBe('');
});

test('resolveVisualState ignores persisted review normalized analysis unless analysis is passed explicitly', async ({page}) => {
  await bootApp(page);
  await page.evaluate(() => {
    const record = upsertTickerRecord('RSTR');
    record.meta.companyName = 'Restored Authority Plc';
    record.meta.exchange = 'NASDAQ';
    record.meta.tradingViewSymbol = 'NASDAQ:RSTR';
    record.meta.marketStatus = 'S&P above 50 MA';
    record.marketData.currency = 'USD';
    record.marketData.price = 52.4;
    record.marketData.previousClose = 52.1;
    record.marketData.ma20 = 51.8;
    record.marketData.ma50 = 49.9;
    record.marketData.ma200 = 45.2;
    record.marketData.volume = 1820000;
    record.marketData.avgVolume = 1640000;
    record.marketData.history = [
      {date:'2026-06-27', open:51.7, high:52.8, low:51.2, close:52.4, volume:1820000},
      {date:'2026-06-26', open:51.8, high:52.0, low:51.0, close:51.6, volume:1710000}
    ];
    record.setup.structureState = 'strong';
    record.setup.structureEligibility = 'alive';
    record.setup.setupLocationState = 'near_20ma';
    record.setup.pullbackZone = 'near_20ma';
    record.setup.priceabilityState = 'priceable';
    record.setup.bounceState = 'attempt';
    record.setup.stabilisationState = 'stabilising';
    record.setup.volumeState = 'supportive';
    record.setup.trendState = 'strong';
    record.plan.entry = 53.1;
    record.plan.stop = 49.2;
    record.plan.firstTarget = 60.3;
    record.plan.target = 60.3;
    record.plan.status = 'valid';
    record.plan.source = 'manual_review';
    record.review.analysisState = {
      normalized:{
        canonicalValues:{
          price:60.4,
          ma20:52.0,
          ma50:50.0,
          ma200:45.2
        },
        trustedMarketContext:{
          recentCandleSequence:[
            {date:'2026-06-27', open:58.8, high:60.8, low:58.3, close:60.4, volume:2500000},
            {date:'2026-06-26', open:57.1, high:59.2, low:56.8, close:58.9, volume:2300000},
            {date:'2026-06-25', open:54.9, high:57.4, low:54.6, close:57.0, volume:2100000}
          ]
        }
      }
    };
    state.tickers = ['RSTR'];
  });

  const result = await page.evaluate(() => {
    const record = getTickerRecord('RSTR');
    const globalVerdict = resolveGlobalVerdict(record);
    const derivedStates = analysisDerivedStatesFromRecord(record);
    const displayedPlan = deriveCurrentPlanState(record.plan.entry, record.plan.stop, record.plan.firstTarget, record.marketData.currency);
    const normalizedAnalysis = getReviewAnalysisState(record).normalizedAnalysis;
    const withoutAnalysisStory = buildCanonicalStoryContextForRecord(record, {
      globalVerdict,
      derivedStates
    });
    const withAnalysisStory = buildCanonicalStoryContextForRecord(record, {
      analysis:normalizedAnalysis,
      globalVerdict,
      derivedStates
    });
    const watchlistWithoutAnalysis = resolveVisualState(record, 'watchlist', {
      derivedStates,
      displayedPlan,
      resolvedContract:{
        finalVerdict:'watch',
        final_verdict:'watch',
        planStatusKey:'valid'
      }
    });
    const withoutPersistedAnalysisRecord = JSON.parse(JSON.stringify(record));
    if(withoutPersistedAnalysisRecord.review && withoutPersistedAnalysisRecord.review.analysisState){
      delete withoutPersistedAnalysisRecord.review.analysisState;
    }
    const watchlistWithoutPersistedAnalysis = resolveVisualState(withoutPersistedAnalysisRecord, 'watchlist', {
      derivedStates,
      displayedPlan,
      resolvedContract:{
        finalVerdict:'watch',
        final_verdict:'watch',
        planStatusKey:'valid'
      }
    });
    const watchlistWithAnalysis = resolveVisualState(record, 'watchlist', {
      derivedStates,
      displayedPlan,
      analysis:normalizedAnalysis,
      resolvedContract:{
        finalVerdict:'watch',
        final_verdict:'watch',
        planStatusKey:'valid'
      }
    });
    return {
      withoutAnalysisPhase:String(withoutAnalysisStory && withoutAnalysisStory.currentPhase || ''),
      withAnalysisPhase:String(withAnalysisStory && withAnalysisStory.currentPhase || ''),
      withoutAnalysisSummary:String(watchlistWithoutAnalysis && watchlistWithoutAnalysis.decision_summary || ''),
      withoutPersistedAnalysisSummary:String(watchlistWithoutPersistedAnalysis && watchlistWithoutPersistedAnalysis.decision_summary || ''),
      withAnalysisSummary:String(watchlistWithAnalysis && watchlistWithAnalysis.decision_summary || '')
    };
  });

  expect(result.withoutAnalysisPhase).not.toBe(result.withAnalysisPhase);
  expect(['responding_from_support', 'stalled_after_response']).toContain(result.withoutAnalysisPhase);
  expect(result.withAnalysisPhase).toBe('away_from_support');
  expect(result.withoutAnalysisSummary).toBe(result.withoutPersistedAnalysisSummary);
  expect(result.withoutAnalysisSummary).not.toMatch(/away from support|wait for a reset/i);
});

test('damaged lost-support setups do not retain intact-support or buyers-emerging wording after canonical damage is resolved', async ({page}) => {
  await bootApp(page);
  const scenario = supportFailedScenario();
  scenario.canonicalVerdict = 'watch';
  scenario.visualBucket = 'monitor';
  scenario.badgeLabel = 'Watch';
  scenario.scanVerdictLabel = 'Watch';
  await seedScenario(page, scenario);

  const result = await extractScanReviewParity(page, 'FAILR');

  expect(result.storyWithAnalysis.currentPhase).toBe('support_failed');
  expect(result.reviewProjection.canonicalVerdict).toBe('watch');
  expect(result.scannerSummary).not.toMatch(/buyers emerging|buyers responding|support is holding/i);
  expect(result.reviewTechnicalContext).toMatch(/Structure broken|Structure weakening/i);
  expect(result.reviewTechnicalContext).not.toMatch(/Structure intact|Responding at|Testing 20MA/i);
});

test('accepted 50MA support-test override allows weak live tests and rejects contradictory canonical states', async ({page}) => {
  await bootApp(page);
  const result = await page.evaluate(() => {
    const buildCase = ({ticker, analysis, storyContextOverride}) => {
      const record = {
        ticker,
        marketData:{
          currency:'USD',
          price:248.39,
          ma20:255.4,
          ma50:250.23,
          ma200:241.3
        },
        watchlist:{
          inWatchlist:true,
          debug:{
            structural_alive_at_refresh:'true',
            refresh_demote_reason:'Structurally alive; keep on monitor.'
          }
        },
        review:{
          analysisState:{normalized:analysis}
        },
        plan:{status:'valid', source:'manual_review'},
        setup:{
          structureState:'weak',
          structureEligibility:'alive',
          setupLocationState:'near_50ma',
          pullbackZone:'near_50ma',
          priceabilityState:'priceable',
          bounceState:'none',
          supportContext:'50ma_support',
          supportTestState:'testing',
          buyerControlState:'none',
          stabilisationState:'none',
          volumeState:'supportive',
          trendState:'strong'
        }
      };
      const derivedStates = {
        structureState:'weak',
        structureEligibility:'alive',
        pullbackZone:'near_50ma',
        setupLocationState:'near_50ma',
        priceabilityState:'priceable',
        bounceState:'none',
        supportContext:'50ma_support',
        supportTestState:'testing',
        buyerControlState:'none',
        stabilisationState:'none',
        volumeState:'supportive'
      };
      const globalVerdict = {
        final_verdict:'watch',
        structure_eligibility:'alive',
        structure_state:'weak',
        near_entry_pullback_zone_accepted:true,
        pullback_zone:'near_50ma',
        bounce_state:'none',
        refresh_demote_reason:'Structurally alive; keep on monitor.'
      };
      const displayedPlan = deriveCurrentPlanState('', '', '', 'USD');
      const originalBuilder = buildCanonicalStoryContextForRecord;
      if(storyContextOverride){
        globalThis.buildCanonicalStoryContextForRecord = function(currentRecord, options = {}){
          return {
            ...storyContextOverride,
            support:{label:'50MA', type:'50ma_support', currentlyActive:true, ...(storyContextOverride.support || {})},
            structure:{state:'weak', ...(storyContextOverride.structure || {})},
            volume:{state:'supportive', ...(storyContextOverride.volume || {})}
          };
        };
      }
      try{
        const reviewSemanticStatus = buildReviewSemanticStatus({
          record,
          simplifiedState:resolveSimplifiedStateForSurface(record, 'review', {log:false}),
          globalVerdict,
          derivedStates,
          displayedPlan,
          planRealism:{raw_rr:null, realistic_rr:null}
        });
        const resolved = buildResolvedReviewDisplayModel({
          record,
          simplifiedState:resolveSimplifiedStateForSurface(record, 'review', {log:false}),
          globalVerdict,
          reviewSemanticStatus,
          derivedStates,
          displayedPlan,
          planRealism:{raw_rr:null, realistic_rr:null}
        });
        return {
          accepted50:isAccepted50MaSupportTestDisplayState({record, globalVerdict, derivedStates}),
          accepted50Allowed:accepted50MaSupportTestAllowedForStoryContext(resolved.storyContext),
          technicalContext:String(resolved.technicalContextLine || ''),
          currentPhase:String(resolved.storyContext && resolved.storyContext.currentPhase || '')
        };
      }finally{
        globalThis.buildCanonicalStoryContextForRecord = originalBuilder;
      }
    };
    return {
      weakLive:buildCase({
        ticker:'FIFW',
        analysis:{
          canonicalValues:{price:248.39, ma20:255.4, ma50:250.23, ma200:241.3},
          trustedMarketContext:{
            recentCandleSequence:[
              {date:'2026-06-27', open:249.8, high:250.6, low:247.9, close:248.39, volume:1500000},
              {date:'2026-06-26', open:251.4, high:252.1, low:248.8, close:249.7, volume:1460000}
            ]
          }
        },
        storyContextOverride:{
          currentPhase:'at_support',
          support:{label:'50MA', type:'50ma_support', currentlyActive:true},
          structure:{state:'weak'},
          buyerControl:{state:'none'},
          confirmation:{state:'unconfirmed'}
        }
      }),
      live:buildCase({
        ticker:'FIFT',
        analysis:{
          canonicalValues:{price:248.39, ma20:255.4, ma50:250.23, ma200:241.3},
          trustedMarketContext:{
            recentCandleSequence:[
              {date:'2026-06-27', open:249.8, high:250.6, low:247.9, close:248.39, volume:1500000},
              {date:'2026-06-26', open:251.4, high:252.1, low:248.8, close:249.7, volume:1460000}
            ]
          }
        }
      }),
      advanced:buildCase({
        ticker:'FIFX',
        analysis:{
          canonicalValues:{price:258.8, ma20:252.2, ma50:250.23, ma200:241.3},
          trustedMarketContext:{
            recentCandleSequence:[
              {date:'2026-06-27', open:256.7, high:259.0, low:256.3, close:258.8, volume:1700000},
              {date:'2026-06-26', open:254.7, high:257.0, low:254.4, close:256.8, volume:1620000},
              {date:'2026-06-25', open:252.5, high:255.0, low:252.2, close:254.6, volume:1540000}
            ]
          }
        },
        storyContextOverride:{
          currentPhase:'away_from_support',
          buyerResponse:{semantic:'response_present'},
          buyerControl:{state:'confirmed'},
          confirmation:{state:'follow_through_confirmed'},
          support:{label:'50MA', type:'50ma_support', currentlyActive:false}
        }
      }),
      broken:buildCase({
        ticker:'FIFB',
        analysis:{
          canonicalValues:{price:248.39, ma20:255.4, ma50:250.23, ma200:241.3},
          trustedMarketContext:{
            recentCandleSequence:[
              {date:'2026-06-27', open:249.8, high:250.6, low:247.9, close:248.39, volume:1500000},
              {date:'2026-06-26', open:251.4, high:252.1, low:248.8, close:249.7, volume:1460000}
            ]
          }
        },
        storyContextOverride:{
          currentPhase:'at_support',
          support:{label:'50MA', type:'50ma_support', currentlyActive:true},
          structure:{state:'broken'},
          buyerControl:{state:'none'},
          confirmation:{state:'unconfirmed'}
        }
      }),
      emptyPhase:buildCase({
        ticker:'FIFE',
        analysis:{canonicalValues:{price:248.39, ma20:255.4, ma50:250.23, ma200:241.3}},
        storyContextOverride:{
          currentPhase:'',
          support:{label:'50MA', type:'50ma_support', currentlyActive:true},
          structure:{state:'weak'}
        }
      }),
      missingPhase:buildCase({
        ticker:'FIFM',
        analysis:{canonicalValues:{price:248.39, ma20:255.4, ma50:250.23, ma200:241.3}},
        storyContextOverride:{
          support:{label:'50MA', type:'50ma_support', currentlyActive:true},
          structure:{state:'weak'}
        }
      }),
      intactLive:buildCase({
        ticker:'FIFI',
        analysis:{canonicalValues:{price:248.39, ma20:255.4, ma50:250.23, ma200:241.3}},
        storyContextOverride:{
          currentPhase:'responding_from_support',
          support:{label:'50MA', type:'50ma_support', currentlyActive:true},
          structure:{state:'strong'},
          buyerControl:{state:'none'},
          confirmation:{state:'unconfirmed'}
        }
      })
    };
  });

  expect(result.weakLive.accepted50).toBe(true);
  expect(result.weakLive.currentPhase).toBe('at_support');
  expect(result.weakLive.accepted50Allowed).toBe(true);
  expect(result.weakLive.technicalContext).toContain('Pullback near 50MA');

  expect(result.live.accepted50).toBe(true);
  expect(result.live.accepted50Allowed).toBe(true);
  expect(result.live.technicalContext).toContain('Pullback near 50MA');

  expect(result.broken.accepted50).toBe(true);
  expect(result.broken.accepted50Allowed).toBe(false);
  expect(result.broken.technicalContext).not.toContain('Pullback near 50MA');
  expect(result.broken.technicalContext).toMatch(/Structure broken/i);

  expect(result.advanced.accepted50).toBe(true);
  expect(result.advanced.currentPhase).toBe('away_from_support');
  expect(result.advanced.accepted50Allowed).toBe(false);
  expect(result.advanced.technicalContext).not.toContain('Pullback near 50MA');
  expect(result.advanced.technicalContext).toMatch(/Away from 50MA|Extended from 50MA/i);

  expect(result.emptyPhase.accepted50).toBe(true);
  expect(result.emptyPhase.accepted50Allowed).toBe(false);
  expect(result.emptyPhase.technicalContext).not.toContain('Pullback near 50MA');

  expect(result.missingPhase.accepted50).toBe(true);
  expect(result.missingPhase.accepted50Allowed).toBe(false);
  expect(result.missingPhase.technicalContext).not.toContain('Pullback near 50MA');

  expect(result.intactLive.accepted50).toBe(true);
  expect(result.intactLive.accepted50Allowed).toBe(true);
  expect(result.intactLive.technicalContext).toContain('Pullback near 50MA');
});

test('missing normalized analysis falls back safely without fabricating support evidence', async ({page}) => {
  await bootApp(page);
  await seedScenario(page, watchScenario());
  await page.evaluate(() => {
    const record = getTickerRecord('WATC');
    record.review.analysisState = {normalized:{}};
  });

  const result = await extractScanReviewParity(page, 'WATC');

  expect(result.storyWithAnalysis.currentPhase || '').toBe(result.storyWithoutAnalysis.currentPhase || '');
  expect(result.scannerSummary).not.toBe('');
  expect(result.scannerSummary).not.toMatch(/support failed|buyers emerging/i);
});

test('support-failed canonical phase keeps scan and review guidance aligned without forcing an Avoid verdict', async ({page}) => {
  await bootApp(page);
  const scenario = supportFailedScenario();
  scenario.canonicalVerdict = 'watch';
  scenario.visualBucket = 'monitor';
  scenario.badgeLabel = 'Watch';
  scenario.scanVerdictLabel = 'Watch';
  await seedScenario(page, scenario);

  const result = await extractScanReviewParity(page, 'FAILR');

  expect(result.reviewProjection.canonicalVerdict).toBe('watch');
  expect(result.storyWithAnalysis.currentPhase).toBe('support_failed');
  expect(result.scannerSummary).not.toMatch(/buyers emerging|buyers responding|support is holding/i);
});

test('reduced-packet semantics stay aligned and unknown-safe', async ({page}) => {
  await bootApp(page);
  await page.evaluate(() => {
    const record = upsertTickerRecord('REDU');
    record.meta.companyName = 'Reduced Packet plc';
    record.meta.exchange = 'NASDAQ';
    record.meta.tradingViewSymbol = 'NASDAQ:REDU';
    record.meta.marketStatus = 'S&P above 50 MA';
    record.marketData.currency = 'USD';
    record.marketData.price = '';
    record.marketData.ma20 = '';
    record.marketData.ma50 = '';
    record.marketData.ma200 = '';
    record.setup.structureState = 'strong';
    record.setup.structureEligibility = 'alive';
    record.setup.setupLocationState = '';
    record.setup.pullbackZone = '';
    record.setup.priceabilityState = '';
    record.setup.bounceState = '';
    record.setup.stabilisationState = '';
    record.setup.volumeState = '';
    record.setup.trendState = 'strong';
    record.plan.status = 'missing';
    record.scan.analysisProjection = {
      derived_states:{
        structure_state:'strong',
        trend_state:'strong'
      }
    };
    record.review.analysisState = {
      normalized:{
        deterministicEventPacket:{
          supportState:{distanceMeasured:false},
          currentPhase:'',
          storyEvents:[]
        }
      }
    };
    record.watchlist.inWatchlist = true;
    record.watchlist.addedAt = '2026-06-29';
    state.tickers = ['REDU'];
    setActiveReviewTicker('REDU');
    renderReviewWorkspace({source:'reduced_packet_semantic_contract'});
    renderWatchlist({source:'reduced_packet_semantic_contract'});
  });

  const result = await extractSemanticAgreement(page, 'REDU');
  expect(result.trackProjection.canonicalVerdict).toBe('watch');
  expect(result.trackProjection.actionability).toBe('blocked');
  expect(result.trackProjection.currentPhase).not.toBe('support_failed');
  expect(result.trackProjection.supportRelationship).not.toBe('failed_support');
  expect(result.trackProjection.opportunityCondition).not.toBe('broken');
  expect(result.diagnosticsSemantics.currentPhase).toBe(result.trackProjection.currentPhase);
  expect(result.diagnosticsSemantics.supportRelationship).toBe(result.trackProjection.supportRelationship);
});

test('read-only getter, Review, Track, and diagnostics paths do not stamp or rewrite unstamped plans', async ({page}) => {
  await bootApp(page);

  const result = await page.evaluate(() => {
    const ticker = 'READ';
    const record = upsertTickerRecord(ticker);
    record.meta.companyName = 'Read Path Systems';
    record.meta.exchange = 'NASDAQ';
    record.meta.tradingViewSymbol = `NASDAQ:${ticker}`;
    record.meta.marketStatus = 'S&P above 50 MA';
    record.marketData.currency = 'USD';
    record.marketData.price = 121.4;
    record.marketData.previousClose = 120.8;
    record.marketData.ma20 = 119.2;
    record.marketData.ma50 = 114.6;
    record.marketData.ma200 = 103.1;
    record.marketData.volume = 1800000;
    record.marketData.avgVolume = 1600000;
    record.setup.structureState = 'strong';
    record.setup.structureEligibility = 'alive';
    record.setup.setupLocationState = 'near_20ma';
    record.setup.pullbackZone = 'near_20ma';
    record.setup.priceabilityState = 'priceable';
    record.setup.bounceState = 'attempt';
    record.setup.stabilisationState = 'stabilising';
    record.setup.volumeState = 'supportive';
    record.setup.trendState = 'strong';
    delete record.setup.score;
    record.plan.entry = 121.4;
    record.plan.stop = 116.2;
    record.plan.firstTarget = 132.8;
    record.plan.target = 132.8;
    record.plan.source = 'manual_review';
    record.plan.status = 'valid';
    record.plan.tradeability = 'tradable';
    record.plan.riskStatus = 'fits_risk';
    record.plan.writtenAt = '';
    delete record.plan.authoritySource;
    delete record.plan.authorityVersion;
    delete record.plan.authorityReason;
    delete record.plan.writtenBy;
    delete record.plan.candidateSource;
    delete record.plan.writtenAt;
    record.review.manualReview = {
      entry:121.4,
      stop:116.2,
      target:132.8
    };
    record.watchlist.inWatchlist = true;
    record.watchlist.addedAt = '2026-06-29';
    record.watchlist.expiryAfterTradingDays = 5;
    state.marketStatus = 'S&P above 50 MA';
    uiState.activeReviewProjectionSource = 'read_path_test';
    uiState.activeReviewSourceProjectionSnapshot = null;
    setActiveReviewTicker(ticker);

    const beforeRecord = JSON.parse(JSON.stringify(state.tickerRecords[ticker]));

    const liveRecord = getTickerRecord(ticker);
    refreshTrackedTickerState(ticker, {
      source:'review',
      sourceSurface:'review',
      reason:'read_path_test',
      force:true,
      persist:false,
      emitTrace:true
    });
    resolveSimplifiedStateForSurface(cloneData(liveRecord), 'review', {
      renderPass:0,
      source:'read_path_test',
      mutationSource:'read_path_test'
    });
    resolveSimplifiedStateForSurface(cloneData(liveRecord), 'track', {
      renderPass:0,
      source:'read_path_test',
      mutationSource:'read_path_test'
    });
    currentReviewStateHealthSnapshot(cloneData(liveRecord));
    buildTrackDiagnosticSnapshot(cloneData(liveRecord));

    const afterRecord = JSON.parse(JSON.stringify(state.tickerRecords[ticker]));
    return {
      beforeRecord,
      afterRecord,
      unchanged:JSON.stringify(beforeRecord) === JSON.stringify(afterRecord)
    };
  });

  expect(result.unchanged, 'read paths must not rewrite stored ticker records').toBe(true);
  expect(result.afterRecord.plan.authoritySource, 'read paths must not stamp canonical authoritySource').toBeUndefined();
  expect(result.afterRecord.plan.authorityVersion, 'read paths must not stamp canonical authorityVersion').toBeUndefined();
  expect(result.afterRecord.plan.authorityReason, 'read paths must not stamp canonical authorityReason').toBeUndefined();
  expect(result.afterRecord.plan.writtenBy, 'read paths must not stamp writtenBy').toBeUndefined();
  expect(result.afterRecord.plan.writtenAt, 'read paths must not stamp writtenAt').toBeUndefined();
  expect(result.afterRecord.plan.candidateSource, 'read paths must not stamp candidateSource').toBeUndefined();
  expect(Object.prototype.hasOwnProperty.call(result.afterRecord.setup || {}, 'score'), 'read paths must not create setup.score').toBe(false);
});

test('debug card text cannot promote an unqualified stale Near Entry panel', async ({page}) => {
  await bootApp(page);
  const scenario = nearEntryScenario();
  scenario.companyName = 'Entry Ready Debug Text Inc.';
  await seedScenario(page, scenario);

  await openTrackTab(page);
  await waitForUiTransitionSettle(page);

  const entryPanelText = await page.evaluate(() => {
    const panel = document.querySelector('[data-watchlist-ticker="NEAR"] .entry-conditions-panel');
    return String(panel && panel.textContent || '').replace(/\s+/g, ' ').trim();
  });

  expect(entryPanelText).not.toContain('Status: Entry Ready');
  expect(entryPanelText).toContain('Status: Developing Watch');
});

test('Track long-press ignores Entry label text without canonical Entry authority', async ({page}) => {
  await bootApp(page);
  await seedScenario(page, nearEntryScenario());

  const summary = await page.evaluate(() => {
    const record = getTickerRecord('NEAR');
    const displayedPlan = deriveCurrentPlanState(record.plan.entry, record.plan.stop, record.plan.firstTarget, record.marketData.currency);
    return buildTrackTickerSpecificEntryConditionsSummary({
      record,
      ticker:'NEAR',
      finalVerdict:'watch',
      presentationState:'monitor',
      currentTrackPresentation:{
        canonicalVerdict:'watch',
        finalVerdict:'watch',
        visualBucket:'monitor',
        badgeLabel:'Entry',
        headline:'Entry Ready',
        statusText:'Entry Ready',
        authoritativeEntryPanel:false
      },
      resolvedContract:{
        planStatusKey:'valid',
        blockerReason:'Needs confirmation before promotion.'
      },
      globalVerdict:{
        final_verdict:'watch',
        structure_state:'strong',
        structure_eligibility:'alive',
        setup_location_state:'near_20ma',
        pullback_zone:'near_20ma',
        bounce_state:'attempt',
        priceability_state:'priceable',
        main_blocker:'Needs confirmation before promotion.'
      },
      derivedStates:{
        structureState:'strong',
        structureEligibility:'alive',
        setupLocationState:'near_20ma',
        pullbackZone:'near_20ma',
        bounceState:'attempt',
        priceabilityState:'priceable'
      },
      displayedPlan
    });
  });

  expect(summary.header, 'text-only Entry labels must not promote the panel header').not.toBe('Entry Ready');
  expect(summary.canonicalVerdict, 'text-only Entry labels must not promote canonical panel verdict').not.toBe('entry');
  expect(summary.why || summary.primary || '', 'text-only Entry labels must not use Entry explanatory copy').not.toContain('This setup is Entry because');
});

test('Track long-press fallback uses current Track reason, not stale saved summaries', async ({page}) => {
  await bootApp(page);

  const result = await page.evaluate(() => {
    const record = upsertTickerRecord('COPY');
    record.review.savedSummary = 'STALE ENTRY SAVED REVIEW SUMMARY DO NOT SHOW';
    record.scan.summary = 'STALE ENTRY SCAN SUMMARY DO NOT SHOW';
    const summary = buildTrackTickerSpecificEntryConditionsSummary({
      record,
      ticker:'COPY',
      finalVerdict:'watch',
      presentationState:'monitor',
      currentTrackPresentation:{
        canonicalVerdict:'watch',
        finalVerdict:'watch',
        visualBucket:'monitor',
        primaryReason:'Current Track blocker: buyer control is still emerging.',
        mainBlocker:'Current Track blocker: buyer control is still emerging.',
        nextAction:'Wait for buyer control to confirm.'
      },
      resolvedContract:{
        planStatusKey:'',
        blockerReason:''
      },
      globalVerdict:{
        final_verdict:'watch'
      },
      derivedStates:{},
      displayedPlan:{}
    });
    const markup = renderEntryConditionsHoldHelper(summary, 'watchlist', 'COPY', {mode:'card'});
    return {
      summary,
      markup
    };
  });

  const panelText = String(result.markup || '').replace(/\s+/g, ' ');
  expect(result.summary.source, 'fallback source should be current Track presentation, not saved summaries').toBe('current_track_presentation_fallback');
  expect(panelText, 'long-press panel should show the current Track blocker').toContain('Current Track blocker: buyer control is still emerging.');
  expect(panelText, 'long-press panel must not show stale saved Review copy').not.toContain('STALE ENTRY SAVED REVIEW SUMMARY DO NOT SHOW');
  expect(panelText, 'long-press panel must not show stale Scan copy').not.toContain('STALE ENTRY SCAN SUMMARY DO NOT SHOW');
});

test('persisted sharedPresentation Entry cannot override live canonical Watch', async ({page}) => {
  await bootApp(page);
  await seedScenario(page, watchScenario());
  await page.evaluate(() => {
    const record = getTickerRecord('WATC');
    record.watchlist.presentation = {
      sharedPresentation:{
        canonicalVerdict:'entry',
        finalVerdict:'entry',
        visualBucket:'entry',
        tone:'entry',
        badgeLabel:'Entry',
        headline:'Entry Ready',
        statusText:'Entry Ready',
        actionLabel:'Execute only if the trigger remains valid.'
      }
    };
  });

  await openTrackTab(page);
  await waitForUiTransitionSettle(page);

  const trackCard = page.locator('[data-watchlist-ticker="WATC"]').first();
  await expect(trackCard.locator('.badge.state-pill').first()).toContainText('Watch');
  const entryPanelText = await page.evaluate(() => {
    const panel = document.querySelector('[data-watchlist-ticker="WATC"] .entry-conditions-panel');
    return String(panel && panel.textContent || '').replace(/\s+/g, ' ').trim();
  });
  expect(entryPanelText).not.toContain('Status: Entry Ready');
});

test('stale persisted Track prose fields cannot override live recomputed Track copy', async ({page}) => {
  await bootApp(page);
  await seedScenario(page, watchScenario());
  await page.evaluate(() => {
    const record = getTickerRecord('WATC');
    record.watchlist.presentation = {
      sharedPresentation:{
        canonicalVerdict:'entry',
        finalVerdict:'entry',
        visualBucket:'entry',
        tone:'entry',
        badgeLabel:'Entry',
        headline:'Entry Ready',
        statusText:'Entry Ready',
        actionLabel:'Execute only if the trigger remains valid.',
        trackDecisionSummary:'STALE TRACK DECISION SUMMARY DO NOT SHOW',
        trackPrimaryReason:'STALE TRACK PRIMARY REASON DO NOT SHOW',
        trackNextAction:'STALE TRACK NEXT ACTION DO NOT SHOW',
        trackPlanSummary:'STALE TRACK PLAN SUMMARY DO NOT SHOW',
        trackCurrentPhase:'support_failed',
        trackActionability:'actionable',
        trackDecisiveReason:'STALE TRACK DECISIVE REASON DO NOT SHOW',
        trackBlocker:'STALE TRACK BLOCKER DO NOT SHOW',
        trackSupportRelationship:'failed_support',
        trackOpportunityCondition:'broken',
        trackPlanCondition:'valid'
      }
    };
  });

  await openTrackTab(page);
  await waitForUiTransitionSettle(page);

  const state = await extractAppTickerState(page, 'WATC');
  const cardText = [
    state.visibleCopy.track.cardText,
    state.visibleCopy.track.entryPanel && state.visibleCopy.track.entryPanel.why,
    state.visibleCopy.track.entryPanel && state.visibleCopy.track.entryPanel.nextAction
  ].filter(Boolean).join(' ');

  [
    'STALE TRACK DECISION SUMMARY DO NOT SHOW',
    'STALE TRACK PRIMARY REASON DO NOT SHOW',
    'STALE TRACK NEXT ACTION DO NOT SHOW',
    'STALE TRACK PLAN SUMMARY DO NOT SHOW',
    'STALE TRACK DECISIVE REASON DO NOT SHOW',
    'STALE TRACK BLOCKER DO NOT SHOW'
  ].forEach(staleCopy => {
    expect(cardText).not.toContain(staleCopy);
  });

  const runtimePresentation = await extractSemanticAgreement(page, 'WATC');

  expect(runtimePresentation.trackProjection.currentPhase).not.toBe('support_failed');
  expect(runtimePresentation.trackProjection.actionability).toBe('blocked');
  expect(runtimePresentation.trackProjection.decisiveReason).not.toContain('STALE TRACK');
  expect(runtimePresentation.trackProjection.blocker).not.toContain('STALE TRACK');
  expect(runtimePresentation.trackProjection.supportRelationship).not.toBe('failed_support');
  expect(runtimePresentation.trackProjection.opportunityCondition).not.toBe('broken');
  expect(runtimePresentation.trackDecisionSummary).not.toContain('STALE TRACK');
  expect(runtimePresentation.diagnosticsSemantics).toMatchObject(runtimePresentation.trackProjection);
});

test('reloaded persisted Track prose fields cannot override live recomputed Track copy', async ({page}) => {
  await bootApp(page);
  await seedScenario(page, watchScenario());
  await page.evaluate(() => {
    const record = getTickerRecord('WATC');
    record.watchlist.presentation = {
      sharedPresentation:{
        canonicalVerdict:'entry',
        finalVerdict:'entry',
        visualBucket:'entry',
        tone:'entry',
        badgeLabel:'Entry',
        headline:'Entry Ready',
        statusText:'Entry Ready',
        actionLabel:'Execute only if the trigger remains valid.',
        trackDecisionSummary:'RELOADED STALE TRACK DECISION SUMMARY DO NOT SHOW',
        trackPrimaryReason:'RELOADED STALE TRACK PRIMARY REASON DO NOT SHOW',
        trackNextAction:'RELOADED STALE TRACK NEXT ACTION DO NOT SHOW',
        trackPlanSummary:'RELOADED STALE TRACK PLAN SUMMARY DO NOT SHOW',
        trackCurrentPhase:'support_failed',
        trackActionability:'actionable',
        trackDecisiveReason:'RELOADED STALE TRACK DECISIVE REASON DO NOT SHOW',
        trackBlocker:'RELOADED STALE TRACK BLOCKER DO NOT SHOW',
        trackSupportRelationship:'failed_support',
        trackOpportunityCondition:'broken',
        trackPlanCondition:'valid'
      }
    };
    commitTickerState();
    if(typeof persistState === 'function') persistState();
  });

  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => {
    if(typeof startupDebugRenderState !== 'function') return false;
    const ready = startupDebugRenderState();
    return !!(ready && ready.hydrationComplete === true && ready.riskRefreshComplete === true);
  }, null, {timeout:30000});
  const skipButton = page.getByRole('button', {name:'Skip'});
  if(await skipButton.count()){
    try{
      if(await skipButton.isVisible()) await skipButton.click();
    }catch(_error){}
  }

  await openTrackTab(page);
  await waitForUiTransitionSettle(page);

  const state = await extractAppTickerState(page, 'WATC');
  const cardText = [
    state.visibleCopy.track.cardText,
    state.visibleCopy.track.entryPanel && state.visibleCopy.track.entryPanel.why,
    state.visibleCopy.track.entryPanel && state.visibleCopy.track.entryPanel.nextAction
  ].filter(Boolean).join(' ');

  [
    'RELOADED STALE TRACK DECISION SUMMARY DO NOT SHOW',
    'RELOADED STALE TRACK PRIMARY REASON DO NOT SHOW',
    'RELOADED STALE TRACK NEXT ACTION DO NOT SHOW',
    'RELOADED STALE TRACK PLAN SUMMARY DO NOT SHOW',
    'RELOADED STALE TRACK DECISIVE REASON DO NOT SHOW',
    'RELOADED STALE TRACK BLOCKER DO NOT SHOW'
  ].forEach(staleCopy => {
    expect(cardText).not.toContain(staleCopy);
  });

  expect(state.authority.trackPresentation && state.authority.trackPresentation.trackCurrentPhase).not.toBe('support_failed');
  expect(state.authority.trackPresentation && state.authority.trackPresentation.trackActionability).toBe('blocked');
  expect(String(state.authority.trackPresentation && state.authority.trackPresentation.trackDecisionSummary || '')).not.toContain('RELOADED STALE TRACK');

  const reloadedSemantics = await extractSemanticAgreement(page, 'WATC');
  expect(reloadedSemantics.trackProjection.decisiveReason).not.toContain('RELOADED STALE TRACK');
  expect(reloadedSemantics.trackProjection.blocker).not.toContain('RELOADED STALE TRACK');
  expect(reloadedSemantics.trackProjection.supportRelationship).not.toBe('failed_support');
  expect(reloadedSemantics.trackProjection.opportunityCondition).not.toBe('broken');
  expect(reloadedSemantics.diagnosticsSemantics).toMatchObject(reloadedSemantics.trackProjection);
});

test('restored legacy sharedPresentation without Track-specific fields recomputes canonical semantics safely', async ({page}) => {
  await bootApp(page);
  await seedScenario(page, watchScenario());
  await page.evaluate(() => {
    const record = getTickerRecord('WATC');
    record.watchlist.presentation = {
      sharedPresentation:{
        canonicalVerdict:'entry',
        finalVerdict:'entry',
        visualBucket:'entry',
        tone:'entry',
        badgeLabel:'Entry',
        headline:'STALE LEGACY ENTRY HEADLINE DO NOT SHOW',
        statusText:'STALE LEGACY ENTRY STATUS DO NOT SHOW',
        actionLabel:'STALE LEGACY ENTRY ACTION DO NOT SHOW',
        primaryReason:'STALE LEGACY ENTRY PRIMARY REASON DO NOT SHOW',
        mainBlocker:'STALE LEGACY ENTRY BLOCKER DO NOT SHOW',
        planStatus:'valid',
        planSummary:'STALE LEGACY ENTRY PLAN DO NOT SHOW'
      }
    };
    commitTickerState();
    if(typeof persistState === 'function') persistState();
  });

  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => {
    if(typeof startupDebugRenderState !== 'function') return false;
    const ready = startupDebugRenderState();
    return !!(ready && ready.hydrationComplete === true && ready.riskRefreshComplete === true);
  }, null, {timeout:30000});
  const skipButton = page.getByRole('button', {name:'Skip'});
  if(await skipButton.count()){
    try{
      if(await skipButton.isVisible()) await skipButton.click();
    }catch(_error){}
  }

  await openTrackTab(page);
  await waitForUiTransitionSettle(page);

  const state = await extractAppTickerState(page, 'WATC');
  const trackText = state.visibleCopy.track.cardText || '';
  [
    'STALE LEGACY ENTRY HEADLINE DO NOT SHOW',
    'STALE LEGACY ENTRY STATUS DO NOT SHOW',
    'STALE LEGACY ENTRY ACTION DO NOT SHOW',
    'STALE LEGACY ENTRY PRIMARY REASON DO NOT SHOW',
    'STALE LEGACY ENTRY BLOCKER DO NOT SHOW',
    'STALE LEGACY ENTRY PLAN DO NOT SHOW'
  ].forEach(staleCopy => {
    expect(trackText).not.toContain(staleCopy);
  });

  const semantics = await extractSemanticAgreement(page, 'WATC');
  expect(semantics.trackProjection.canonicalVerdict).toBe('watch');
  expect(semantics.diagnosticsSemantics).toMatchObject(semantics.trackProjection);
});

test('away-from-support Track wording stays opportunity-specific without weakening language', async ({page}) => {
  await bootApp(page);
  await seedScenario(page, awayFromSupportScenario());

  await openTrackTab(page);
  await waitForUiTransitionSettle(page);

  const semantics = await extractSemanticAgreement(page, 'AWAY');
  const combinedCopy = [
    semantics.reviewDecisionSummary,
    semantics.trackDecisionSummary,
    semantics.trackPrimaryReason,
    semantics.trackNextAction
  ].join(' ');

  expect(semantics.reviewProjection.currentPhase).toBe('away_from_support');
  expect(semantics.trackProjection.currentPhase).toBe('watch');
  expect(['reset_required', 'blocked']).toContain(semantics.reviewProjection.opportunityCondition);
  expect(semantics.trackProjection.opportunityCondition).toBe('blocked');
  expect(semantics.trackDecisionSummary).toContain('Watch');
  expect(combinedCopy).not.toMatch(/weakening|repair|stabilising|setup quality fading/i);
  expect(semantics.diagnosticsSemantics).toMatchObject(semantics.trackProjection);
});

test('Track diagnostics semantic block matches authoritative projection even when presentation fields are stale or blank', async ({page}) => {
  await bootApp(page);
  await seedScenario(page, watchScenario());
  await page.evaluate(() => {
    const record = getTickerRecord('WATC');
    record.watchlist.presentation = {
      sharedPresentation:{
        canonicalVerdict:'watch',
        finalVerdict:'watch',
        visualBucket:'monitor',
        tone:'monitor',
        badgeLabel:'Watch',
        headline:'',
        statusText:'',
        actionLabel:'',
        trackDecisionSummary:'',
        trackPrimaryReason:'',
        trackNextAction:'',
        trackPlanSummary:'',
        trackCurrentPhase:'',
        trackActionability:'',
        trackDecisiveReason:'',
        trackBlocker:''
      }
    };
    renderWatchlist({source:'diagnostics_authority_contract'});
  });

  const semantics = await extractSemanticAgreement(page, 'WATC');
  expect(semantics.trackProjection.decisiveReason).not.toBe('');
  expect(semantics.diagnosticsSemantics.authoritySource).toBe('canonical_publication');
  expect(semantics.diagnosticsSemantics).toMatchObject(semantics.trackProjection);
});

test('persisted debug currentState Entry cannot override live canonical Watch', async ({page}) => {
  await bootApp(page);
  await seedScenario(page, watchScenario());
  await page.evaluate(() => {
    const record = getTickerRecord('WATC');
    record.watchlist.debug = {
      ...(record.watchlist.debug || {}),
      currentState:'Entry',
      lifecycleState:'Entry',
      previousState:'Entry'
    };
  });

  await openTrackTab(page);
  await waitForUiTransitionSettle(page);

  const trackCard = page.locator('[data-watchlist-ticker="WATC"]').first();
  await expect(trackCard.locator('.badge.state-pill').first()).toContainText('Watch');
  await expect(trackCard).not.toContainText('Entry Ready');

  const entryPanelText = await page.evaluate(() => {
    const panel = document.querySelector('[data-watchlist-ticker="WATC"] .entry-conditions-panel');
    return String(panel && panel.textContent || '').replace(/\s+/g, ' ').trim();
  });
  expect(entryPanelText).not.toContain('Status: Entry Ready');
  expect(entryPanelText).not.toContain('This setup is Entry because');
});

test('speculative prepared Track render state does not change non-render cache resolution', async ({page}) => {
  await bootApp(page);
  await seedScenario(page, watchScenario());

  const result = await page.evaluate(() => {
    const record = getTickerRecord('WATC');
    uiState.watchlistRenderSignature = 'committed-render-signature';
    uiState.watchlistPreparedModelCache = {
      mode:'full',
      showExpired:false,
      dirtyEpoch:Number(uiState.watchlistDirtyEpoch || 0),
      renderSignature:'speculative-render-signature',
      records:[record]
    };
    uiState.watchlistPresentationStateCache = {
      renderSignature:'committed-render-signature',
      byKey:new Map(),
      hits:0,
      misses:0
    };
    const staleKey = buildWatchlistSimplifiedStateCacheKey(record, {
      surface:'track',
      source:'renderWatchlistCardElement',
      reason:'renderWatchlistCardElement'
    });
    uiState.watchlistPresentationStateCache.byKey.set(staleKey, {
      canonicalVerdict:'near_entry',
      visualBucket:'near_entry',
      tone:'near_entry',
      badgeLabel:'Near Entry',
      actionLabel:'Wait for stronger confirmation before considering an entry.',
      mainBlocker:'STALE TRACK CACHE SHOULD NOT WIN'
    });
    const resolved = resolveSimplifiedStateForWatchlistPresentation(record, {
      surface:'track',
      source:'renderWatchlistCardElement',
      reason:'renderWatchlistCardElement'
    });
    return {
      currentRenderSignature:uiState.watchlistPresentationStateCache.renderSignature,
      canonicalVerdict:String(resolved && resolved.canonicalVerdict || ''),
      mainBlocker:String(resolved && resolved.mainBlocker || '')
    };
  });

  expect(result.currentRenderSignature).toBe('committed-render-signature');
  expect(result.canonicalVerdict).toBe('near_entry');
  expect(result.mainBlocker).toContain('STALE TRACK CACHE SHOULD NOT WIN');
});

test('rendered Track card authority overrides stale committed cache during a new render pass', async ({page}) => {
  await bootApp(page);
  await seedScenario(page, watchScenario());

  await openTrackTab(page);
  await waitForUiTransitionSettle(page);

  await page.evaluate(() => {
    const record = getTickerRecord('WATC');
    uiState.watchlistRenderSignature = 'stale-render-signature';
    uiState.watchlistPreparedModelCache = {
      mode:'full',
      showExpired:false,
      dirtyEpoch:Number(uiState.watchlistDirtyEpoch || 0),
      renderSignature:'fresh-render-signature',
      records:[record]
    };
    uiState.watchlistPresentationStateCache = {
      renderSignature:'stale-render-signature',
      byKey:new Map(),
      hits:0,
      misses:0
    };
    const staleKey = buildWatchlistSimplifiedStateCacheKey(record, {
      surface:'track',
      source:'renderWatchlistCardElement',
      reason:'renderWatchlistCardElement'
    });
    uiState.watchlistPresentationStateCache.byKey.set(staleKey, {
      canonicalVerdict:'near_entry',
      visualBucket:'near_entry',
      tone:'near_entry',
      badgeLabel:'Near Entry',
      actionLabel:'Wait for stronger confirmation before considering an entry.',
      mainBlocker:'STALE TRACK CACHE SHOULD NOT WIN'
    });
    renderWatchlist({
      source:'track_state_contract_test',
      allowCachedReturn:false
    });
  });

  await waitForUiTransitionSettle(page);

  const state = await extractAppTickerState(page, 'WATC');
  expect(state.normalized.trackRenderedCanonicalVerdict).toBe('watch');
  expect(state.normalized.trackRenderedVisualBucket).toBe('monitor');
  expect(state.normalized.trackDiagnosticCanonicalVerdict).toBe('watch');
  expect(state.authority.trackPresentation && state.authority.trackPresentation.canonicalVerdict).toBe('watch');
  expect(state.authority.trackPresentation && state.authority.trackPresentation.badgeLabel).toBe('Watch');
  expect(state.visibleCopy.track.badge).toBe('Watch');
  expect(state.visibleCopy.track.entryPanel && state.visibleCopy.track.entryPanel.status).toContain('Watch');
  expect(state.visibleCopy.track.cardText).not.toContain('STALE TRACK CACHE SHOULD NOT WIN');
});
