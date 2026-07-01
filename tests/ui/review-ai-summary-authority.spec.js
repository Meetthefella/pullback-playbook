const {test, expect} = require('@playwright/test');
const path = require('path');

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

async function seedReviewScenario(page){
  await page.evaluate(() => {
    const chartRef = {
      dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7d8AAAAASUVORK5CYII=',
      name:'nvda-chart.png',
      ticker:'NVDA',
      imageId:'chart-nvda-authority'
    };
    const record = upsertTickerRecord('NVDA');
    record.meta.companyName = 'NVIDIA Corporation';
    record.meta.exchange = 'NASDAQ';
    record.meta.tradingViewSymbol = 'NASDAQ:NVDA';
    record.meta.marketStatus = 'S&P above 50 MA';
    record.marketData.currency = 'USD';
    record.marketData.price = 200.09;
    record.marketData.previousClose = 198.77;
    record.marketData.ma20 = 205.74;
    record.marketData.ma50 = 209.99;
    record.marketData.ma200 = 190.84;
    record.marketData.volume = 18345000;
    record.marketData.avgVolume = 17122000;
    record.marketData.asOf = '2026-06-30T20:00:00.000Z';
    record.marketData.history = [
      {date:'2026-06-30', open:198.42, high:201.17, low:197.85, close:200.09, volume:18345000},
      {date:'2026-06-29', open:199.8, high:200.0, low:196.7, close:198.77, volume:17122000},
      {date:'2026-06-28', open:194.4, high:197.11, low:193.98, close:196.2, volume:16220000}
    ];
    record.setup.structureState = 'strong';
    record.setup.structureEligibility = 'alive';
    record.setup.setupLocationState = 'near_50ma';
    record.setup.pullbackZone = 'near_50ma';
    record.setup.priceabilityState = 'provisional';
    record.setup.bounceState = 'attempt';
    record.setup.stabilisationState = 'early';
    record.setup.volumeState = 'supportive';
    record.setup.trendState = 'strong';
    record.plan.entry = 201.1;
    record.plan.stop = 196.4;
    record.plan.firstTarget = 210.8;
    record.plan.target = 210.8;
    record.plan.source = 'scanner_estimate';
    record.plan.status = 'valid';
    record.plan.riskStatus = 'fits_risk';
    record.plan.tradeability = 'priceable';
    record.plan.triggerState = 'unconfirmed';
    record.scan.analysisProjection = {
      price:200.09,
      sma20:205.74,
      sma50:209.99,
      sma200:190.84,
      rr_ratio:'2.06',
      risk_status:'fits_risk',
      derived_states:{
        trend_state:'strong',
        pullback_zone:'near_50ma',
        setup_location_state:'near_50ma',
        priceability_state:'provisional',
        structure_state:'strong',
        stabilisation_state:'early',
        bounce_state:'attempt',
        volume_state:'supportive',
        has_clear_invalidation_level:'yes',
        has_priceable_plan:'yes',
        entry_defined:'yes',
        stop_defined:'yes',
        target_defined:'yes'
      }
    };
    record.scan.resolvedVerdict = 'Watch';
    record.scan.verdict = 'Watch';
    record.scan.score = 7;
    record.scan.riskStatus = 'fits_risk';
    record.scan.summary = 'Structure is strong, but the bounce still needs confirmation.';
    record.review.manualReview = {
      entry:201.1,
      stop:196.4,
      target:210.8
    };
    record.review.chartRef = chartRef;
    record.review.chartImagePreview = chartRef;
    record.review.chartAvailable = true;
    record.review.chartAnalysisPipeline = {
      ticker:'NVDA',
      imageId:'chart-nvda-authority',
      requestId:'verify-nvda-authority',
      phase:'analysis_complete',
      verifiedMatch:true,
      manualConfirmed:false,
      expectedFacts:{
        ticker:'NVDA',
        timeframe:'1D',
        price:200.09,
        ma20:205.74,
        ma50:209.99,
        ma200:190.84
      },
      readFacts:{
        ticker:'NVDA',
        timeframe:'1D',
        price:200.09,
        ma20:null,
        ma50:null,
        ma200:190.84
      },
      evidence:['Ticker matched the uploaded chart context.'],
      diagnostics:['20MA label unreadable on image.', '50MA label unreadable on image.'],
      aiAllowed:true,
      source:'review_ai_summary_authority_spec',
      updatedAt:'2026-07-01T10:00:00.000Z'
    };
    const baseProjection = {
      ticker:'NVDA',
      canonicalVerdict:'watch',
      finalVerdict:'watch',
      sourceOfTruthVisualBucket:'monitor',
      visualBucket:'monitor',
      tone:'monitor'
    };
    record.watchlist.presentation = {
      sharedPresentation:{
        canonicalVerdict:'watch',
        finalVerdict:'watch',
        visualBucket:'monitor',
        tone:'monitor',
        badgeLabel:'Watch',
        actionLabel:'Wait for stronger confirmation before considering entry.'
      }
    };
    uiState.activeReviewSourceProjectionSnapshot = baseProjection;
    uiState.activeReviewProjectionSource = 'review_ai_summary_authority_spec';
    setActiveReviewTicker('NVDA');
    renderReviewWorkspace({source:'review_ai_summary_authority_spec_seed'});
  });
  await page.locator('[data-workspace-tab="review"]').click();
  await page.waitForFunction(() => {
    return document.querySelector('[data-workspace-tab="review"][aria-selected="true"]') !== null
      && !!document.getElementById('reviewWorkspace');
  }, null, {timeout:10000});
}

async function applyAnalysis(page, normalizedAnalysis){
  await page.evaluate(analysis => {
    const record = upsertTickerRecord('NVDA');
    record.review.analysisState = {
      raw:'',
      normalized:analysis,
      prompt:'',
      error:'',
      reviewedAt:'2026-07-01T10:00:00.000Z',
      chartImageId:'chart-nvda-authority',
      requestId:'analysis-nvda-authority',
      ticker:'NVDA'
    };
    record.review.normalizedAnalysis = analysis;
    renderReviewWorkspace({source:'review_ai_summary_authority_spec_apply'});
  }, normalizedAnalysis);
}

test('Review AI Summary card follows structured authority order in rendered UI', async ({page}) => {
  await bootApp(page);
  await seedReviewScenario(page);

  await applyAnalysis(page, {
    parseWarning:'Model response was malformed JSON. Deterministic chart summary used instead.',
    coach_summary:'observe how price behaves around key moving averages',
    plain_english_chart_read:'observe how price behaves around key moving averages',
    trustedMarketContext:{
      ticker:'NVDA',
      timeframe:'1D',
      currentPrice:200.09,
      ma20:205.74,
      ma50:209.99,
      ma200:190.84,
      recentCandleSequence:[
        {date:'2026-06-30', open:198.42, high:201.17, low:197.85, close:200.09, volume:18345000},
        {date:'2026-06-29', open:199.8, high:200.0, low:196.7, close:198.77, volume:17122000},
        {date:'2026-06-28', open:194.4, high:197.11, low:193.98, close:196.2, volume:16220000}
      ]
    },
    canonicalValues:{
      price:200.09,
      ma20:205.74,
      ma50:209.99,
      ma200:190.84
    },
    candleStructureAnalysis:{
      summary:'Price is below the 20MA and 50MA but above the 200MA. Recent candles show a bounce attempt, but follow-through is still missing.'
    },
    tradePlanCommentary:{
      summary:'Estimated maths exist, but confirmation is still missing before any entry is valid.'
    }
  });

  await expect(page.locator('#reviewAiSummaryTitle')).toHaveText('AI Summary');
  await expect(page.locator('#reviewAiSummaryPreview')).toContainText('Price is below the 20MA, below the 50MA, above the 200MA.');
  await expect(page.locator('#reviewAiSummaryPreview')).toContainText('Recent candles show a bounce attempt, but confirmation is still missing.');
  await expect(page.locator('#reviewAiSummaryPreview')).toContainText('This still belongs in Watch until the candles show cleaner confirmation.');
  await expect(page.locator('#reviewAiSummaryPreview')).not.toContainText('observe how price behaves around key moving averages');
  await expect(page.locator('#reviewAiSummaryPreview')).not.toContainText('AI analysis failed');

  await applyAnalysis(page, {
    coach_summary:'observe how price behaves around key moving averages',
    plain_english_chart_read:'observe how price behaves around key moving averages',
    trustedMarketContext:{
      ticker:'NVDA',
      timeframe:'1D',
      currentPrice:200.09,
      ma20:205.74,
      ma50:209.99,
      ma200:190.84,
      recentCandleSequence:[
        {date:'2026-06-30', open:198.42, high:201.17, low:197.85, close:200.09, volume:18345000},
        {date:'2026-06-29', open:199.8, high:200.0, low:196.7, close:198.77, volume:17122000},
        {date:'2026-06-28', open:194.4, high:197.11, low:193.98, close:196.2, volume:16220000}
      ]
    },
    canonicalValues:{
      price:200.09,
      ma20:205.74,
      ma50:209.99,
      ma200:190.84
    },
    candleStructureAnalysis:{
      summary:'Price is below the 20MA and 50MA but above the 200MA. Recent candles show a bounce attempt, and follow-through is still missing.'
    }
  });

  await expect(page.locator('#reviewAiSummaryPreview')).toContainText('Price is below the 20MA and 50MA but above the 200MA.');
  await expect(page.locator('#reviewAiSummaryPreview')).toContainText('Recent candles show a bounce attempt, and follow-through is still missing.');
  await expect(page.locator('#reviewAiSummaryPreview')).not.toContainText('observe how price behaves around key moving averages');

  await applyAnalysis(page, {
    coach_summary:'observe how price behaves around key moving averages',
    plain_english_chart_read:'observe how price behaves around key moving averages',
    trustedMarketContext:{
      ticker:'NVDA',
      timeframe:'1D',
      currentPrice:200.09,
      ma20:205.74,
      ma50:209.99,
      ma200:190.84,
      recentCandleSequence:[
        {date:'2026-06-30', open:198.42, high:201.17, low:197.85, close:200.09, volume:18345000},
        {date:'2026-06-29', open:199.8, high:200.0, low:196.7, close:198.77, volume:17122000},
        {date:'2026-06-28', open:194.4, high:197.11, low:193.98, close:196.2, volume:16220000}
      ]
    },
    canonicalValues:{
      price:200.09,
      ma20:205.74,
      ma50:209.99,
      ma200:190.84
    },
    candleStructureAnalysis:{
      summary:'Interesting setup. Monitor.'
    },
    tradePlanCommentary:{
      summary:'Estimated maths exist, but confirmation is still missing before any entry is valid.'
    }
  });

  await expect(page.locator('#reviewAiSummaryPreview')).toContainText('Estimated maths exist, but confirmation is still missing before any entry is valid.');
  await expect(page.locator('#reviewAiSummaryPreview')).not.toContainText('Interesting setup. Monitor.');
  await expect(page.locator('#reviewAiSummaryPreview')).not.toContainText('observe how price behaves around key moving averages');
});
