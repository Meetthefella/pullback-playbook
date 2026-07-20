const {test, expect} = require('@playwright/test');
const path = require('path');

const {loadBenchmarkCases} = require('../../fixtures/chart-guru-benchmark-library.js');
const analyseSetupModule = require('../../../netlify/functions/analyse-setup.js');
const fixtures = loadBenchmarkCases();

function buildDeterministicEventPacketFromFixture(chartCoach = {}){
  const primaryStory = chartCoach.primaryStory || {};
  const recentStory = chartCoach.recentStory || {};
  const eventLabels = {
    constructive_pullback_near_20ma:'First pullback to 20MA',
    bounce_confirmation_pending:'Successful 20MA defence',
    failed_bounce:'Failed first bounce from 20MA',
    pullback_still_repairing:'Pullback drifting below 20MA',
    constructive_pullback_near_50ma:'First test of 50MA',
    off_level_wait_for_clearer_support:'Off level — wait for clearer support',
    structure_breaking_down:'Support breakdown',
    strong_upside_acceleration:'Trend acceleration',
    sharp_selloff:'Trend damage with sellers in control',
    extended_after_run:'Momentum fading after extension',
    bounce_attempt:'Rebound attempt without follow-through',
    long_lower_wick_support_test:'Structure repair in progress',
    long_upper_wick_rejection:'Distribution after extension',
    doji_indecision:'Consolidation after advance',
    trend_climbing:'Breakout continuation',
    trend_mixed:'Range-bound pause near highs'
  };
  const evidenceFactIds = [...new Set([
    ...(Array.isArray(primaryStory.evidenceFactIds) ? primaryStory.evidenceFactIds : []),
    ...(Array.isArray(recentStory.evidenceFactIds) ? recentStory.evidenceFactIds : [])
  ])];
  return {
    dominantEventKey:String(primaryStory.key || recentStory.key || '').trim(),
    dominantEventLabel:String(eventLabels[String(primaryStory.key || recentStory.key || '').trim()] || 'Market event in progress'),
    dominantEvent:String(primaryStory.text || '').trim(),
    eventSequence:Array.isArray(recentStory.steps) ? recentStory.steps.slice() : [],
    evidenceFactIds,
    confidence:Number.isFinite(Number(primaryStory.confidence)) ? Number(primaryStory.confidence) : null,
    rankReason:String(primaryStory.rankReason || '').trim(),
    primaryStoryKey:String(primaryStory.key || '').trim(),
    primaryStoryLabel:String(primaryStory.label || '').trim(),
    primaryStoryIcon:String(primaryStory.icon || '').trim(),
    recentStoryKey:String(recentStory.key || '').trim(),
    recentStoryBias:String(recentStory.bias || '').trim(),
    recentStoryToneMode:String(recentStory.toneMode || '').trim(),
    recentStoryConfidenceMode:String(recentStory.confidenceMode || '').trim(),
    recentStoryTrendLabel:String(recentStory.trendLabel || '').trim(),
    recentStorySupportLabel:String(recentStory.supportLabel || '').trim(),
    stepDetails:Array.isArray(recentStory.stepDetails) ? recentStory.stepDetails.slice() : []
  };
}

function buildNormalizedAnalysis(fixture){
  const hooks = analyseSetupModule.__test;
  const deterministicEventPacket = buildDeterministicEventPacketFromFixture(fixture.deterministicChartCoach);
  const traderInterpretation = hooks.normalizeTraderInterpretation(fixture.interpreterResponse, deterministicEventPacket);
  const chartCoach = hooks.buildTwoStepChartCoach(fixture.finalProse, traderInterpretation, {
    deterministicEventPacket
  });
  return {
    deterministicEventPacket,
    traderInterpretation,
    chartGuruNarrative:fixture.finalProse,
    chartCoach,
    coach_summary:fixture.finalProse.chartStory,
    plain_english_chart_read:fixture.finalProse.chartStory,
    trustedMarketContext:fixture.trustedMarketContext,
    canonicalValues:{
      ticker:fixture.trustedMarketContext.ticker,
      timeframe:fixture.trustedMarketContext.timeframe,
      price:fixture.trustedMarketContext.currentPrice,
      ma20:fixture.trustedMarketContext.ma20,
      ma50:fixture.trustedMarketContext.ma50,
      ma200:fixture.trustedMarketContext.ma200,
      volume:fixture.trustedMarketContext.volume,
      latestCandleOHLC:fixture.trustedMarketContext.latestCandleOHLC,
      currentAppDerivedTradePlan:fixture.trustedMarketContext.currentAppDerivedTradePlan
    }
  };
}

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

async function seedReviewScenario(page, fixture, normalizedAnalysis){
  await page.evaluate(({fixtureData, analysis}) => {
    const chartRef = {
      dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7d8AAAAASUVORK5CYII=',
      name:`${fixtureData.ticker.toLowerCase()}-chart.png`,
      ticker:fixtureData.ticker,
      imageId:`chart-${fixtureData.ticker.toLowerCase()}-review-contract`
    };
    const record = upsertTickerRecord(fixtureData.ticker);
    record.meta.companyName = `${fixtureData.ticker} Holdings`;
    record.meta.exchange = 'NYSE';
    record.meta.tradingViewSymbol = `NYSE:${fixtureData.ticker}`;
    record.meta.marketStatus = fixtureData.marketStatus;
    record.marketData.currency = 'USD';
    record.marketData.price = fixtureData.trustedMarketContext.currentPrice;
    record.marketData.previousClose = fixtureData.trustedMarketContext.currentPrice;
    record.marketData.ma20 = fixtureData.trustedMarketContext.ma20;
    record.marketData.ma50 = fixtureData.trustedMarketContext.ma50;
    record.marketData.ma200 = fixtureData.trustedMarketContext.ma200;
    record.marketData.volume = fixtureData.trustedMarketContext.volume;
    record.marketData.avgVolume = fixtureData.trustedMarketContext.volume;
    record.marketData.asOf = '2026-07-09T10:00:00.000Z';
    record.marketData.history = [
      {
        date:'2026-07-09',
        open:fixtureData.trustedMarketContext.latestCandleOHLC.open,
        high:fixtureData.trustedMarketContext.latestCandleOHLC.high,
        low:fixtureData.trustedMarketContext.latestCandleOHLC.low,
        close:fixtureData.trustedMarketContext.latestCandleOHLC.close,
        volume:fixtureData.trustedMarketContext.volume
      }
    ];
    record.setup.structureState = fixtureData.setupStates.structureState;
    record.setup.structureEligibility = fixtureData.setupStates.structureState === 'intact' ? 'alive' : fixtureData.setupStates.structureState;
    record.setup.setupLocationState = fixtureData.setupStates.pullbackZone;
    record.setup.pullbackZone = fixtureData.setupStates.pullbackZone;
    record.setup.priceabilityState = 'provisional';
    record.setup.bounceState = fixtureData.setupStates.bounceState;
    record.setup.stabilisationState = fixtureData.setupStates.stabilisationState;
    record.setup.volumeState = fixtureData.setupStates.volumeState;
    record.setup.trendState = fixtureData.setupStates.trendState;
    record.scan.analysisProjection = {
      price:fixtureData.trustedMarketContext.currentPrice,
      sma20:fixtureData.trustedMarketContext.ma20,
      sma50:fixtureData.trustedMarketContext.ma50,
      sma200:fixtureData.trustedMarketContext.ma200,
      derived_states:{
        trend_state:fixtureData.setupStates.trendState,
        pullback_zone:fixtureData.setupStates.pullbackZone,
        setup_location_state:fixtureData.setupStates.pullbackZone,
        priceability_state:'provisional',
        structure_state:fixtureData.setupStates.structureState,
        stabilisation_state:fixtureData.setupStates.stabilisationState,
        bounce_state:fixtureData.setupStates.bounceState,
        volume_state:fixtureData.setupStates.volumeState,
        has_clear_invalidation_level:'no',
        has_priceable_plan:'no',
        entry_defined:'no',
        stop_defined:'no',
        target_defined:'no'
      }
    };
    record.scan.resolvedVerdict = 'Watch';
    record.scan.verdict = 'Watch';
    record.scan.score = 6;
    record.scan.riskStatus = 'plan_missing';
    record.scan.summary = analysis.coach_summary;
    record.review.manualReview = {entry:'', stop:'', target:''};
    record.review.chartRef = chartRef;
    record.review.chartImagePreview = chartRef;
    record.review.chartAvailable = true;
    record.review.chartAnalysisPipeline = {
      ticker:fixtureData.ticker,
      imageId:chartRef.imageId,
      requestId:`verify-${fixtureData.ticker.toLowerCase()}-review-contract`,
      phase:'analysis_complete',
      verifiedMatch:true,
      manualConfirmed:false,
      expectedFacts:{
        ticker:fixtureData.trustedMarketContext.ticker,
        timeframe:fixtureData.trustedMarketContext.timeframe,
        price:fixtureData.trustedMarketContext.currentPrice,
        ma20:fixtureData.trustedMarketContext.ma20,
        ma50:fixtureData.trustedMarketContext.ma50,
        ma200:fixtureData.trustedMarketContext.ma200
      },
      readFacts:{
        ticker:fixtureData.trustedMarketContext.ticker,
        timeframe:fixtureData.trustedMarketContext.timeframe,
        price:fixtureData.trustedMarketContext.currentPrice,
        ma20:fixtureData.trustedMarketContext.ma20,
        ma50:fixtureData.trustedMarketContext.ma50,
        ma200:fixtureData.trustedMarketContext.ma200
      },
      evidence:['Ticker matched the uploaded chart context.'],
      diagnostics:[],
      aiAllowed:true,
      source:'chart_guru_review_contract_spec',
      updatedAt:'2026-07-09T10:00:00.000Z'
    };
    record.review.analysisState = {
      raw:'',
      normalized:analysis,
      prompt:'',
      error:'',
      reviewedAt:'2026-07-09T10:00:00.000Z',
      chartImageId:chartRef.imageId,
      requestId:`analysis-${fixtureData.ticker.toLowerCase()}-review-contract`,
      ticker:fixtureData.ticker
    };
    record.review.normalizedAnalysis = analysis;
    record.watchlist.presentation = {
      sharedPresentation:{
        canonicalVerdict:'watch',
        finalVerdict:'watch',
        visualBucket:'monitor',
        tone:'monitor',
        badgeLabel:'Watch',
        actionLabel:'Wait for cleaner confirmation before considering entry.'
      }
    };
    uiState.activeReviewSourceProjectionSnapshot = {
      ticker:fixtureData.ticker,
      canonicalVerdict:'watch',
      finalVerdict:'watch',
      sourceOfTruthVisualBucket:'monitor',
      visualBucket:'monitor',
      tone:'monitor'
    };
    uiState.activeReviewProjectionSource = 'chart_guru_review_contract_spec';
    setActiveReviewTicker(fixtureData.ticker);
    renderReviewWorkspace({source:'chart_guru_review_contract_spec'});
  }, {
    fixtureData:fixture,
    analysis:normalizedAnalysis
  });
  await page.locator('[data-workspace-tab="review"]').click();
  await page.waitForFunction(() => {
    return document.querySelector('[data-workspace-tab="review"][aria-selected="true"]') !== null
      && !!document.getElementById('reviewWorkspace');
  }, null, {timeout:10000});
}

for(const fixtureId of ['CAT_event_first_failed_bounce', 'ALLY_event_first_50ma_test']){
  test(`Review preserves deterministic dominant event authority for ${fixtureId}`, async ({page}) => {
    const fixture = fixtures.find(item => item.id === fixtureId);
    const normalizedAnalysis = buildNormalizedAnalysis(fixture);
    const expectedPrimaryStoryKey = normalizedAnalysis.deterministicEventPacket.primaryStoryKey;
    const expectedRecentStoryKey = normalizedAnalysis.deterministicEventPacket.recentStoryKey;

    await bootApp(page);
    await seedReviewScenario(page, fixture, normalizedAnalysis);

    const chartRead = await page.evaluate(ticker => {
      const record = getTickerRecord(ticker);
      const result = finalDisplayedAnalysisChartRead(record, record.review.normalizedAnalysis);
      return {
        selectedSummarySource:String(result.selectedSummarySource || ''),
        usedDeterministicFallback:result.usedDeterministicFallback === true,
        previewText:String(result.text || ''),
        primaryStoryKey:String(result.chartCoach && result.chartCoach.primaryStory && result.chartCoach.primaryStory.key || ''),
        recentStoryKey:String(result.chartCoach && result.chartCoach.recentStory && result.chartCoach.recentStory.key || ''),
        trendLabel:String(result.chartCoach && result.chartCoach.recentStory && result.chartCoach.recentStory.trendLabel || ''),
        traderDominantEvent:String(record.review.normalizedAnalysis && record.review.normalizedAnalysis.traderInterpretation && record.review.normalizedAnalysis.traderInterpretation.dominantEvent || '')
      };
    }, fixture.ticker);

    expect(chartRead.selectedSummarySource).toBe('openai_two_step_chart_guru');
    expect(chartRead.usedDeterministicFallback).toBe(false);
    expect(chartRead.primaryStoryKey).toBe(expectedPrimaryStoryKey);
    expect(chartRead.recentStoryKey).toBe(expectedRecentStoryKey);
    expect(chartRead.trendLabel).toBe(chartRead.traderDominantEvent);
    await expect(page.locator('#reviewAiSummaryTitle')).toHaveText('\u{1F9D8} Chart Guru');
    await expect(page.locator('#reviewAiSummaryPreview')).toContainText(fixture.finalProse.chartStory);
    await expect(page.locator('#reviewAiSummaryPreview')).toContainText('\u{1F3AF} What next?');
    await expect(page.locator('#reviewAiSummaryTitle')).not.toContainText('\u00F0\u0178');
    await expect(page.locator('#reviewAiSummaryTitle')).not.toContainText('\u00E2\u20AC');
    await expect(page.locator('#reviewAiSummaryTitle')).not.toContainText('\u00C3');
    await expect(page.locator('#reviewAiSummaryTitle')).not.toContainText('\u00C2');
    await expect(page.locator('#reviewAiSummaryPreview')).not.toContainText('\u00F0\u0178');
    await expect(page.locator('#reviewAiSummaryPreview')).not.toContainText('\u00E2\u20AC');
    await expect(page.locator('#reviewAiSummaryPreview')).not.toContainText('\u00C3');
    await expect(page.locator('#reviewAiSummaryPreview')).not.toContainText('\u00C2');
    await expect(page.locator('#reviewAiSummaryPreview')).not.toContainText('dominantEvent');
    await expect(page.locator('#reviewAiSummaryPreview')).not.toContainText('currentRisk');
    await expect(page.locator('#reviewAiSummaryPreview')).not.toContainText('nextSignal');

    if(fixtureId === 'CAT_event_first_failed_bounce'){
      expect(chartRead.previewText.toLowerCase()).toContain('failed');
      expect(chartRead.previewText.toLowerCase()).toContain('20-day');
    }else{
      expect(chartRead.previewText.toLowerCase()).toContain('50-day');
      expect(chartRead.previewText.toLowerCase()).toContain('test');
    }
  });
}
