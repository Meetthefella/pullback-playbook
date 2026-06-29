const {test, expect} = require('@playwright/test');
const path = require('path');
const {openTrackTab, waitForUiTransitionSettle} = require('./helpers/app-driver');

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
      {date:'2026-06-27', open:seed.price - 1, high:seed.price + 1, low:seed.price - 2, close:seed.price, volume:seed.volume}
    ];
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
    trading212PaperAvailabilityChecked = true;
    trading212PaperEnabled = true;
    trading212PaperAvailabilityMessage = 'Paper gateway ready.';

    uiState.activeReviewSourceProjectionSnapshot = {
      ticker:seed.ticker,
      canonicalVerdict:seed.canonicalVerdict,
      finalVerdict:seed.canonicalVerdict,
      sourceOfTruthVisualBucket:seed.visualBucket,
      visualBucket:seed.visualBucket,
      tone:seed.visualBucket
    };
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
    bounceState:'improving',
    stabilisationState:'stabilising',
    volumeState:'supportive',
    trendState:'strong',
    entry:110.27,
    stop:102.29,
    target:136.19,
    planStatus:'valid',
    riskStatus:'fits_risk',
    tradeability:'tradable',
    triggerState:'confirmed',
    scannerResolvedRR:2.5
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
    entry:88.5,
    stop:84.2,
    target:98.0,
    planStatus:'valid',
    riskStatus:'fits_risk',
    tradeability:'tradable',
    triggerState:'developing',
    scannerResolvedRR:2.2
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
