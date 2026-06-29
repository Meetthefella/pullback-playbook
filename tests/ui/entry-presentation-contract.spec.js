const {test, expect} = require('@playwright/test');
const path = require('path');
const {openTrackTab, waitForUiTransitionSettle} = require('./helpers/app-driver');

test('canonical Entry presentation remains authoritative across review, trade plan, paper trade, and track copy', async ({page}) => {
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

  const fixture = {
    ticker:'TROW',
    companyName:'T. Rowe Price Group, Inc.',
    exchange:'NASDAQ',
    tradingViewSymbol:'NASDAQ:TROW',
    price:110.27,
    previousClose:106.34,
    ma20:106.727,
    ma50:103.852,
    ma200:100.9815,
    rsi:64.82,
    volume:3831934,
    avgVolume:2115787.96,
    entry:110.27,
    stop:102.29,
    target:130.22
  };

  const contract = await page.evaluate(seed => {
    const record = upsertTickerRecord(seed.ticker);
    record.meta.companyName = seed.companyName;
    record.meta.exchange = seed.exchange;
    record.meta.tradingViewSymbol = seed.tradingViewSymbol;
    record.meta.marketStatus = 'S&P above 50 MA';
    record.marketData.currency = 'USD';
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
      {date:'2026-06-27', open:108.10, high:110.60, low:107.90, close:110.27, volume:seed.volume}
    ];
    record.setup.structureState = 'strong';
    record.setup.structureEligibility = 'alive';
    record.setup.setupLocationState = 'near_20ma';
    record.setup.pullbackZone = 'near_20ma';
    record.setup.priceabilityState = 'priceable';
    record.setup.bounceState = 'improving';
    record.setup.stabilisationState = 'stabilising';
    record.setup.volumeState = 'supportive';
    record.setup.trendState = 'strong';
    record.plan.entry = seed.entry;
    record.plan.stop = seed.stop;
    record.plan.firstTarget = seed.target;
    record.plan.target = seed.target;
    record.plan.source = 'scanner_estimate';
    record.plan.status = 'valid';
    record.plan.riskStatus = 'fits_risk';
    record.plan.tradeability = 'tradable';
    record.plan.triggerState = 'confirmed';
    record.scan.analysisProjection = {
      price:seed.price,
      sma20:seed.ma20,
      sma50:seed.ma50,
      sma200:seed.ma200,
      rr_ratio:'2.50',
      risk_status:'fits_risk',
      derived_states:{
        trend_state:'strong',
        pullback_zone:'near_20ma',
        setup_location_state:'near_20ma',
        priceability_state:'priceable',
        structure_state:'strong',
        stabilisation_state:'stabilising',
        bounce_state:'improving',
        volume_state:'supportive',
        has_clear_invalidation_level:'yes',
        has_priceable_plan:'yes',
        entry_defined:'yes',
        stop_defined:'yes',
        target_defined:'yes'
      }
    };
    record.scan.resolvedVerdict = 'Entry';
    record.scan.verdict = 'Entry';
    record.scan.score = 9;
    record.scan.riskStatus = 'fits_risk';
    record.scan.summary = 'Trend structure is intact, the bounce is improving, and the trade plan is ready.';
    record.review.analysisState = {
      normalized:{
        coach_summary:'Constructive setup with buyers in control.'
      }
    };
    record.review.manualReview = {
      entry:seed.entry,
      stop:seed.stop,
      target:seed.target
    };
    record.watchlist.inWatchlist = true;
    record.watchlist.addedAt = '2026-06-29';
    record.watchlist.expiryAfterTradingDays = 5;
    record.watchlist.presentation = {
      sharedPresentation:{
        canonicalVerdict:'entry',
        finalVerdict:'entry',
        visualBucket:'entry',
        tone:'entry',
        badgeLabel:'Entry',
        actionLabel:'Execute only if the trigger remains valid.'
      }
    };

    state.paperTradeApiKey = 'paper-key';
    state.paperTradeApiSecret = 'paper-secret';
    state.paperTradeTesterSetupCompletedAt = '2026-06-29T09:00:00.000Z';
    trading212PaperAvailabilityChecked = true;
    trading212PaperEnabled = true;
    trading212PaperAvailabilityMessage = 'Paper gateway ready.';

    const displayedPlan = deriveCurrentPlanState(seed.entry, seed.stop, seed.target, 'USD');
    const derivedStates = {
      structureState:'strong',
      structureEligibility:'alive',
      setupLocationState:'near_20ma',
      pullbackZone:'near_20ma',
      pullbackState:'near_20ma',
      priceabilityState:'priceable',
      bounceState:'improving',
      stabilisationState:'stabilising',
      volumeState:'supportive',
      trendState:'strong'
    };
    const simplifiedState = {
      canonicalVerdict:'entry',
      visualBucket:'entry',
      tone:'entry',
      badgeLabel:'Entry',
      actionLabel:'Ready to act',
      planStatus:'valid',
      planVisible:false,
      mainBlocker:'Developing - waiting for confirmation.',
      structureState:'strong',
      structureEligibility:'alive',
      setupLocationState:'near_20ma',
      priceabilityState:'priceable',
      bounceState:'improving',
      volumeState:'supportive',
      entryGatePass:false,
      nearEntryGatePass:true
    };
    const globalVerdict = {
      final_verdict:'entry',
      structure_state:'strong',
      structure_eligibility:'alive',
      setup_location_state:'near_20ma',
      pullback_zone:'near_20ma',
      priceability_state:'priceable',
      bounce_state:'improving',
      volume_state:'supportive',
      main_blocker:'Developing - waiting for confirmation.',
      hasPriceablePlan:true,
      has_priceable_plan:true,
      hasClearInvalidationLevel:true,
      entry_gate_pass:false,
      near_entry_gate_pass:true,
      resolvedRR:2.5,
      viability:'accept'
    };
    const resolvedContract = {
      finalVerdict:'Entry',
      final_verdict:'entry',
      planStatusKey:'valid',
      structuralState:'entry',
      primaryState:'entry',
      blockerReason:'Developing - waiting for confirmation.',
      actionStateKey:'ready_to_act',
      actionLabel:'Ready to act',
      resolvedRR:2.5
    };
    const semantic = buildReviewSemanticStatus({
      record,
      simplifiedState,
      globalVerdict,
      derivedStates,
      displayedPlan,
      planRealism:{raw_rr:2.5, realistic_rr:2.5}
    });
    const sharedPresentation = buildSharedReviewTrackPresentation(record, {
      surface:'track',
      simplifiedState,
      lifecycleSnapshot:{state:'entry', label:'Entry'},
      globalVerdict,
      source:'entry_contract_test',
      reason:'entry_contract_test'
    });
    const longPress = buildTrackTickerSpecificEntryConditionsSummary({
      record,
      ticker:seed.ticker,
      finalVerdict:'entry',
      presentationState:'entry',
      resolvedContract,
      globalVerdict,
      derivedStates,
      displayedPlan
    });
    const planVisibility = resolvePlanVisibility({
      state:'Entry',
      finalVerdict:'Entry',
      bounce_state:'attempt',
      structure:'strong',
      hasPriceablePlan:true,
      near_entry_gate_pass:true
    });
    const paperTrade = paperTradeEligibility.evaluatePaperTradeEligibility({
      finalVerdict:'Entry',
      planStatus:'valid',
      entry:displayedPlan.entry,
      stop:displayedPlan.stop,
      target:displayedPlan.target,
      positionSize:displayedPlan.riskFit && displayedPlan.riskFit.position_size,
      maxLoss:displayedPlan.riskFit && displayedPlan.riskFit.max_loss,
      rrRatio:displayedPlan.rewardRisk && displayedPlan.rewardRisk.rrRatio,
      riskStatus:displayedPlan.riskFit && displayedPlan.riskFit.risk_status,
      tradeability:displayedPlan.tradeability,
      capitalFit:displayedPlan.capitalFit && displayedPlan.capitalFit.capital_fit,
      primaryState:'entry',
      hardBlocker:'Developing - waiting for confirmation.'
    });

    uiState.activeReviewSourceProjectionSnapshot = {
      ticker:seed.ticker,
      canonicalVerdict:'entry',
      finalVerdict:'entry',
      sourceOfTruthVisualBucket:'entry',
      visualBucket:'entry',
      tone:'entry'
    };
    uiState.activeReviewProjectionSource = 'clicked_card_snapshot';
    setActiveReviewTicker(seed.ticker);
    renderReviewWorkspace({source:'entry_contract_test'});

    return {
      semantic,
      sharedPresentation,
      longPress,
      planVisibility,
      paperTrade
    };
  }, fixture);

  expect(contract.semantic.tradeStatus.line1).toContain('Entry Ready');
  expect(contract.semantic.tradeStatus.line2).toContain('Execute only if the trigger remains valid.');
  expect(contract.semantic.tradeStatus.line1).not.toContain('isn\'t ready');
  expect(contract.semantic.showPlanFields).toBe(true);
  expect(contract.semantic.showPlanMetrics).toBe(true);
  expect(contract.semantic.showCapital).toBe(true);

  expect(contract.sharedPresentation.badgeLabel).toContain('Entry');
  expect(contract.sharedPresentation.headline).toBeTruthy();
  expect(contract.sharedPresentation.primaryReason).toBe('Buyers are in control and the setup is ready to act on.');
  expect(contract.sharedPresentation.nextAction).toBe('Execute only if the trigger remains valid.');
  expect(contract.sharedPresentation.planSummary).toBe('Trade plan available.');
  expect(contract.sharedPresentation.headline).not.toContain('Monitor');
  expect(contract.sharedPresentation.headline).not.toContain('confirmation');
  expect(contract.sharedPresentation.primaryReason).not.toContain('Monitor');
  expect(contract.sharedPresentation.primaryReason).not.toContain('confirmation');

  expect(contract.longPress.header).toBe('Entry Ready');
  expect(contract.longPress.why).toContain('This setup is Entry because');
  expect(contract.longPress.nextRequiredAction).toBe('Execute only if the trigger remains valid.');
  expect(contract.longPress.stillMissing).toBe('');
  expect(contract.longPress.whyNotEntry).toBe('');
  expect(contract.longPress.why).not.toContain('Monitor');
  expect(contract.longPress.why).not.toContain('needs confirmation');

  expect(contract.planVisibility.showPlan).toBe(true);
  expect(contract.planVisibility.showRR).toBe(true);
  expect(contract.planVisibility.showCapital).toBe(true);

  expect(contract.paperTrade.eligible).toBe(true);
  expect(contract.paperTrade.reasons).toEqual([]);

  await expect(page.locator('#reviewWorkspace .review-summary-badges .badge')).toContainText('Entry');
  await expect(page.locator('#reviewNextActionInline')).toContainText('Execute only if the trigger remains valid.');
  await expect(page.locator('#tradeStatusBox')).toContainText('Entry Ready');
  await expect(page.locator('#tradeStatusBox')).not.toContainText('The app knows the maths, but the trade isn\'t ready');
  await expect(page.locator('#tradeStatusBox')).not.toContainText('needs confirmation');
  await expect(page.locator('#tradePlanInputs')).not.toHaveClass(/review-hidden/);
  await expect(page.locator('#capitalFitMetric')).not.toHaveClass(/review-hidden/);
  await expect(page.locator('#positionSizeStat')).not.toHaveClass(/review-hidden/);
  await expect(page.locator('#rrValue')).toContainText('2.50R');
  await expect(page.locator('#rrValue')).not.toContainText('Priced');
  await expect(page.locator('#paperTradeBtn')).toBeEnabled();
  await expect(page.locator('#paperTradeDisabledReason')).toHaveCount(0);

  await page.evaluate(() => {
    renderWatchlist({source:'entry_contract_test'});
  });
  await openTrackTab(page);
  await waitForUiTransitionSettle(page);

  const trackCard = page.locator('[data-watchlist-ticker="TROW"]').first();
  await expect(trackCard.locator('.badge.state-pill').first()).toContainText('Entry');
  await expect(trackCard).toContainText('Entry');
  await expect(trackCard).not.toContainText('Authoritative FinalWatch');
  await expect(trackCard).not.toContainText('Lifecycle StateWatch');
  await expect(trackCard).not.toContainText('Conditions are not strong enough for active focus');
  await expect(trackCard).not.toContainText('This setup is Monitor because');
  await expect(trackCard).not.toContainText('needs confirmation');

  const entryPanelText = await page.evaluate(() => {
    const panel = document.querySelector('[data-watchlist-ticker="TROW"] .entry-conditions-panel');
    return String(panel && panel.textContent || '').replace(/\s+/g, ' ').trim();
  });

  expect(entryPanelText).toContain('Status: Entry Ready');
  expect(entryPanelText).toContain('Why: This setup is Entry because');
  expect(entryPanelText).toContain('Next Action: Execute only if the trigger remains valid.');
  expect(entryPanelText).not.toContain('Monitor');
  expect(entryPanelText).not.toContain('needs confirmation');
  expect(entryPanelText).not.toContain('The app knows the maths, but the trade isn\'t ready');
});
