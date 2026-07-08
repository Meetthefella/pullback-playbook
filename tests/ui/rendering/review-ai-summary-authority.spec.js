const {test, expect} = require('@playwright/test');
const path = require('path');

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

test('Chart Guru renders deterministic teaching sections in the review UI', async ({page}) => {
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

  await expect(page.locator('#reviewAiSummaryTitle')).toHaveText('🧘 Chart Guru');
  await expect(page.locator('#reviewWorkspace')).not.toContainText('AI Summary');
  await expect(page.locator('#reviewWorkspace')).not.toContainText('Chart Guru Notes');
  await expect(page.locator('#reviewWorkspace')).not.toContainText('Chart Coach');
  await expect(page.locator('#reviewAiSummaryPreview')).toContainText('🟢 Chart Story');
  await expect(page.locator('#reviewAiSummaryPreview')).toContainText('buyers have started to respond');
  await expect(page.locator('#reviewAiSummaryPreview')).toContainText('50-day average');
  await expect(page.locator('#reviewAiSummaryPreview')).toContainText('setup constructive as long as buyers can follow through');
  await expect(page.locator('#reviewAiSummaryPreview')).toContainText('Why it matters');
  await expect(page.locator('#reviewAiSummaryPreview')).toContainText('💡 Learning point');
  await expect(page.locator('#reviewAiSummaryPreview')).toContainText('Volume');
  await expect(page.locator('#reviewAiSummaryPreview')).toContainText('Volume');
  await expect(page.locator('#reviewAiSummaryPreview')).toContainText('🎯 What next?');
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

  await expect(page.locator('#reviewAiSummaryPreview')).toContainText('🟢 Chart Story');
  await expect(page.locator('#reviewAiSummaryPreview')).toContainText('Why it matters');
  await expect(page.locator('#reviewAiSummaryPreview')).toContainText('🎯 What next?');
  await expect(page.locator('#reviewAiSummaryPreview')).not.toContainText('observe how price behaves around key moving averages');

  await page.setViewportSize({width:390, height:844});
  await expect.poll(async () => {
    return await page.locator('#reviewAiSummaryPreview').evaluate(node => node.scrollWidth <= node.clientWidth + 1);
  }).toBe(true);

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

  await expect(page.locator('#reviewAiSummaryPreview')).toContainText('🎯 What next?');
  await expect(page.locator('#reviewAiSummaryPreview')).not.toContainText('Interesting setup. Monitor.');
  await expect(page.locator('#reviewAiSummaryPreview')).not.toContainText('observe how price behaves around key moving averages');
});

test('Chart Guru renders the structure_breaking_down branch in the Review UI', async ({page}) => {
  await bootApp(page);
  await page.evaluate(() => {
    const chartRef = {
      dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7d8AAAAASUVORK5CYII=',
      name:'amd-breakdown-chart.png',
      ticker:'AMD',
      imageId:'chart-amd-breakdown'
    };
    const record = upsertTickerRecord('AMD');
    record.meta.companyName = 'Advanced Micro Devices';
    record.meta.exchange = 'NASDAQ';
    record.meta.marketStatus = 'S&P below 50 MA';
    record.marketData.currency = 'USD';
    record.marketData.price = 82.4;
    record.marketData.previousClose = 88.0;
    record.marketData.ma20 = 88.6;
    record.marketData.ma50 = 92.1;
    record.marketData.ma200 = 104.4;
    record.marketData.volume = 1650000;
    record.marketData.avgVolume = 1000000;
    record.marketData.asOf = '2026-07-01T20:00:00.000Z';
    record.marketData.history = [
      {date:'2026-07-01', open:87.9, high:88.1, low:82.0, close:82.4, volume:1650000},
      {date:'2026-06-30', open:90.4, high:90.8, low:87.3, close:88.0, volume:1410000},
      {date:'2026-06-29', open:92.1, high:92.3, low:89.4, close:90.2, volume:1230000}
    ];
    record.setup.structureState = 'broken';
    record.setup.structureEligibility = 'broken';
    record.setup.setupLocationState = 'lost_support';
    record.setup.pullbackZone = 'off_level';
    record.setup.priceabilityState = 'unpriceable';
    record.setup.bounceState = 'failed';
    record.setup.stabilisationState = 'none';
    record.setup.volumeState = 'active';
    record.setup.trendState = 'weakening';
    record.plan.entry = '';
    record.plan.stop = '';
    record.plan.firstTarget = '';
    record.plan.target = '';
    record.plan.source = 'none';
    record.plan.status = 'missing';
    record.plan.riskStatus = 'unpriceable';
    record.plan.tradeability = 'unpriceable';
    record.plan.triggerState = 'invalid';
    record.scan.analysisProjection = {
      price:82.4,
      sma20:88.6,
      sma50:92.1,
      sma200:104.4,
      derived_states:{
        trend_state:'weakening',
        pullback_zone:'off_level',
        setup_location_state:'lost_support',
        priceability_state:'unpriceable',
        structure_state:'broken',
        stabilisation_state:'none',
        bounce_state:'failed',
        volume_state:'active',
        has_clear_invalidation_level:'no',
        has_priceable_plan:'no'
      }
    };
    record.scan.resolvedVerdict = 'Avoid';
    record.scan.verdict = 'Avoid';
    record.scan.score = 2;
    record.scan.riskStatus = 'unpriceable';
    record.scan.summary = 'Support has failed and the setup is breaking down.';
    record.review.chartRef = chartRef;
    record.review.chartImagePreview = chartRef;
    record.review.chartAvailable = true;
    record.review.chartAnalysisPipeline = {
      ticker:'AMD',
      imageId:'chart-amd-breakdown',
      requestId:'verify-amd-breakdown',
      phase:'analysis_complete',
      verifiedMatch:true,
      manualConfirmed:false,
      expectedFacts:{
        ticker:'AMD',
        timeframe:'1D',
        price:82.4,
        ma20:88.6,
        ma50:92.1,
        ma200:104.4
      },
      readFacts:{
        ticker:'AMD',
        timeframe:'1D',
        price:82.4,
        ma20:88.6,
        ma50:92.1,
        ma200:104.4
      },
      evidence:['Ticker matched the uploaded chart context.'],
      diagnostics:[],
      aiAllowed:true,
      source:'review_chart_guru_breakdown_spec',
      updatedAt:'2026-07-01T10:00:00.000Z'
    };
    const baseProjection = {
      ticker:'AMD',
      canonicalVerdict:'avoid',
      finalVerdict:'avoid',
      sourceOfTruthVisualBucket:'avoid',
      visualBucket:'avoid',
      tone:'avoid'
    };
    record.watchlist.presentation = {
      sharedPresentation:{
        canonicalVerdict:'avoid',
        finalVerdict:'avoid',
        visualBucket:'avoid',
        tone:'avoid',
        badgeLabel:'Avoid',
        actionLabel:'Leave it alone until a new base forms.'
      }
    };
    record.review.analysisState = {
      raw:'',
      normalized:{
        parseWarning:'Model response was malformed JSON. Deterministic chart summary used instead.',
        coach_summary:'generic fallback that should not render',
        plain_english_chart_read:'generic fallback that should not render',
        trustedMarketContext:{
          ticker:'AMD',
          timeframe:'1D',
          currentPrice:82.4,
          ma20:88.6,
          ma50:92.1,
          ma200:104.4,
          avgVolume30d:1000000,
          recentCandleSequence:[
            {date:'2026-07-01', open:87.9, high:88.1, low:82.0, close:82.4, volume:1650000},
            {date:'2026-06-30', open:90.4, high:90.8, low:87.3, close:88.0, volume:1410000},
            {date:'2026-06-29', open:92.1, high:92.3, low:89.4, close:90.2, volume:1230000}
          ]
        },
        canonicalValues:{
          price:82.4,
          ma20:88.6,
          ma50:92.1,
          ma200:104.4,
          volume:1650000
        },
        candleStructureAnalysis:{
          summary:'Heavy selling has damaged the chart and support is no longer holding.'
        },
        tradePlanCommentary:{
          summary:'No actionable trade plan is available.'
        }
      },
      prompt:'',
      error:'',
      reviewedAt:'2026-07-01T10:00:00.000Z',
      chartImageId:'chart-amd-breakdown',
      requestId:'analysis-amd-breakdown',
      ticker:'AMD'
    };
    record.review.normalizedAnalysis = record.review.analysisState.normalized;
    uiState.activeReviewSourceProjectionSnapshot = baseProjection;
    uiState.activeReviewProjectionSource = 'review_chart_guru_breakdown_spec';
    setActiveReviewTicker('AMD');
    renderReviewWorkspace({source:'review_chart_guru_breakdown_spec'});
  });
  await page.locator('[data-workspace-tab="review"]').click();

  const deterministicModel = await page.evaluate(() => {
    const record = getTickerRecord('AMD');
    const chartRead = finalDisplayedAnalysisChartRead(record, record.review.normalizedAnalysis);
    const biggestClue = chartRead.chartCoach.sections.find(section => section.key === 'biggest_clue');
    const whatNext = chartRead.chartCoach.sections.find(section => section.key === 'what_next');
    return {
      primaryStoryKey:String(chartRead.chartCoach.primaryStory && chartRead.chartCoach.primaryStory.key || ''),
      biggestClueText:String(biggestClue && biggestClue.text || ''),
      whatNextText:String(whatNext && whatNext.text || ''),
      renderedText:String(chartRead.text || '')
    };
  });

  await expect(page.locator('#reviewAiSummaryTitle')).toHaveText('🧘 Chart Guru');
  await expect(page.locator('#reviewWorkspace')).not.toContainText('AI Summary');
  await expect(page.locator('#reviewWorkspace')).not.toContainText('Chart Guru Notes');
  await expect(page.locator('#reviewWorkspace')).not.toContainText('Chart Coach');
  await expect(page.locator('#reviewAiSummaryPreview')).toContainText('📉 Chart Story');
  await expect(page.locator('#reviewAiSummaryPreview')).toContainText(deterministicModel.biggestClueText);
  await expect(page.locator('#reviewAiSummaryPreview')).toContainText(deterministicModel.whatNextText);
  await expect(page.locator('#reviewAiSummaryPreview')).toContainText('🎯 What next?');
  await expect(page.locator('#reviewAiSummaryPreview')).toContainText('rebuild a proper base');
  await expect(page.locator('#reviewAiSummaryPreview')).not.toContainText('The latest candle is red');
  await expect(page.locator('#reviewAiSummaryPreview')).not.toContainText('The latest candle is small');
  await expect(page.locator('#reviewAiSummaryPreview')).not.toContainText('Wait for stronger confirmation before considering an entry.');
  await expect(page.locator('#reviewAiSummaryPreview')).not.toContainText('generic fallback that should not render');

  expect(deterministicModel.primaryStoryKey).toBe('structure_breaking_down');
});

test('Chart Guru does not render before verification passes and stays mobile-safe', async ({page}) => {
  await bootApp(page);
  await page.setViewportSize({width:390, height:844});
  await page.evaluate(() => {
    const record = upsertTickerRecord('MSFT');
    record.meta.companyName = 'Microsoft Corporation';
    record.meta.exchange = 'NASDAQ';
    record.meta.marketStatus = 'S&P above 50 MA';
    record.marketData.price = 510.25;
    record.marketData.ma20 = 505.1;
    record.marketData.ma50 = 498.4;
    record.marketData.ma200 = 430.2;
    const chartRef = {
      dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7d8AAAAASUVORK5CYII=',
      name:'msft-chart.png',
      ticker:'MSFT',
      imageId:'chart-msft-preverify'
    };
    record.review.chartRef = chartRef;
    record.review.chartImagePreview = chartRef;
    record.review.chartImageOriginal = chartRef;
    record.review.chartAvailable = true;
    record.review.chartAnalysisPipeline = {
      ticker:'MSFT',
      imageId:'chart-msft-preverify',
      requestId:'verify-msft-preverify',
      phase:'possible_mismatch',
      verifiedMatch:false,
      manualConfirmed:false,
      aiAllowed:false,
      expectedFacts:{ticker:'MSFT', timeframe:'1D', price:510.25},
      readFacts:{ticker:'MIST', timeframe:'1D', price:510.25},
      evidence:['Visible ticker does not match the selected ticker.'],
      source:'chart_coach_preverify_spec',
      updatedAt:'2026-07-01T10:00:00.000Z'
    };
    record.review.analysisState = {
      raw:'',
      normalized:{
        chartCoach:{
          sections:[
            {key:'candle', icon:'🟢', label:'Candle', text:'This should not render before verification.', confidence:0.9, teachingFocus:true}
          ],
          summaryText:'This should not render before verification.',
          source:'ai_chart_coach',
          renderVersion:'chart-guru-v1'
        }
      },
      error:'',
      reviewedAt:'2026-07-01T10:00:00.000Z',
      chartImageId:'chart-msft-preverify',
      requestId:'analysis-msft-preverify',
      ticker:'MSFT'
    };
    record.review.normalizedAnalysis = record.review.analysisState.normalized;
    setActiveReviewTicker('MSFT');
    renderReviewWorkspace({source:'chart_coach_preverify_spec'});
  });
  await page.locator('[data-workspace-tab="review"]').click();
  await expect(page.locator('#reviewAiSummaryTitle')).toHaveCount(0);
  await expect(page.locator('#reviewWorkspace')).toContainText('Chart Verification Failed');
});
