const {test, expect} = require('@playwright/test');
const path = require('path');
const {openTrackTab, waitForUiTransitionSettle} = require('./helpers/app-driver');
const {extractAppTickerState} = require('./helpers/app-state');

async function bootApp(page){
  const appUrl = `file:///${path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/')}`;
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
    record.marketData.asOf = '2026-06-29T09:00:00.000Z';
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
      record.plan.writtenAt = seed.planWrittenAt || '2026-06-29T09:00:00.000Z';
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
        stabilisation_state:seed.stabilisationState,
        bounce_state:seed.bounceState,
        volume_state:seed.volumeState,
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
        coach_summary:seed.coachSummary
      }
    };
    record.review.manualReview = {
      entry:seed.entry || '',
      stop:seed.stop || '',
      target:seed.target || ''
    };
    record.watchlist.inWatchlist = true;
    record.watchlist.addedAt = '2026-06-29';
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
    state.paperTradeTesterSetupCompletedAt = '2026-06-29T09:00:00.000Z';
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

test('canonical Near Entry stays distinct from Entry', async ({page}) => {
  await bootApp(page);
  await seedScenario(page, nearEntryScenario());

  await expect(page.locator('#reviewWorkspace .review-summary-badges .badge')).toContainText('Near Entry');
  await expect(page.locator('#tradeStatusBox')).not.toContainText('Entry Ready');
  await expect(page.locator('#paperTradeBtn')).toBeDisabled();

  await openTrackTab(page);
  await waitForUiTransitionSettle(page);

  const trackCard = page.locator('[data-watchlist-ticker="NEAR"]').first();
  await expect(trackCard.locator('.badge.state-pill').first()).toContainText('Near Entry');
  await expect(trackCard).not.toContainText('Entry Ready');
  await expect(trackCard).toContainText(/confirmation|Wait for stronger confirmation/i);

  const entryPanelText = await page.evaluate(() => {
    const panel = document.querySelector('[data-watchlist-ticker="NEAR"] .entry-conditions-panel');
    return String(panel && panel.textContent || '').replace(/\s+/g, ' ').trim();
  });

  expect(entryPanelText).not.toContain('Status: Entry Ready');
  expect(entryPanelText).not.toContain('This setup is Entry because');
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

test('debug card text cannot promote the Track long-press panel to Entry', async ({page}) => {
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
  expect(entryPanelText).toContain('Status: Near Entry');
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
        primaryReason:'Current Track blocker: bounce is still tentative.',
        mainBlocker:'Current Track blocker: bounce is still tentative.',
        nextAction:'Wait for buyers to confirm the bounce.'
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
  expect(panelText, 'long-press panel should show the current Track blocker').toContain('Current Track blocker: bounce is still tentative.');
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
