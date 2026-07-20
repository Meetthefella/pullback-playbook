const {test, expect} = require('@playwright/test');
const path = require('path');

async function bootApp(page){
  const appUrl = `file:///${path.resolve(__dirname, '..', '..', '..', 'index.html').replace(/\\/g, '/')}`;
  await page.goto(appUrl, {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => typeof buildDeterministicChartCoach === 'function', null, {timeout:30000});
}

function controlledRecord(){
  return {
    ticker:'AUTH',
    marketData:{
      price:100,
      previousClose:99.8,
      ma20:100.2,
      ma50:96,
      ma200:85,
      volume:1000000,
      avgVolume:1000000,
      history:[
        {date:'2026-07-01', open:99, high:100, low:98.5, close:99.8, volume:1000000},
        {date:'2026-07-02', open:99.8, high:100.5, low:99.5, close:100, volume:1000000}
      ]
    },
    setup:{structureState:'intact', structureEligibility:'alive', pullbackZone:'near_20ma'}
  };
}

function staleCompatibility(){
  return {
    supportContext:'none',
    supportTestState:'not_tested',
    buyerControlState:'none',
    supportCurrentlyActive:false,
    supportInteractionState:'none',
    pullbackZone:'off_level',
    setupLocationState:'off_level'
  };
}

async function chartGuruAuthorityRead(page, scenario){
  return page.evaluate(({scenario, record}) => {
    const analysis = {
      canonicalValues:{price:100, ma20:100.2, ma50:96, ma200:85, volume:1000000},
      trustedMarketContext:{currentPrice:100, ma20:100.2, ma50:96, ma200:85, volume:1000000}
    };
    const coach = buildDeterministicChartCoach(record, analysis, {
      globalVerdict:{final_verdict:'watch', ...(scenario.canonical || {})},
      canonicalPullback:scenario.projection || {},
      derivedStates:scenario.derived || {}
    });
    const reviewRecord = upsertTickerRecord(record.ticker);
    reviewRecord.marketData = {...reviewRecord.marketData, ...record.marketData};
    reviewRecord.setup = {...reviewRecord.setup, ...record.setup};
    reviewRecord.scan.resolvedVerdict = 'Watch';
    reviewRecord.scan.verdict = 'Watch';
    reviewRecord.review.analysisState = {
      normalizedAnalysis:{...analysis, chartCoach:coach},
      error:'',
      rawAnalysis:'',
      reviewedAt:'2026-07-02T00:00:00.000Z'
    };
    reviewRecord.review.normalizedAnalysis = reviewRecord.review.analysisState.normalizedAnalysis;
    setActiveReviewTicker(record.ticker);
    renderReviewWorkspace({source:'chart_guru_support_authority_parity'});
    return {
      support:coach.diagnostics.narrativeContext.support,
      buyerControl:coach.diagnostics.narrativeContext.buyerControl,
      currentPhase:coach.storyContext.currentPhase,
      selectedStory:coach.primaryStory && coach.primaryStory.key,
      prose:[
        coach.primaryStory && coach.primaryStory.text,
        coach.chartNarrator && coach.chartNarrator.story,
        coach.chartNarrator && coach.chartNarrator.whatNext
      ].filter(Boolean).join(' ').toLowerCase(),
      renderedReviewProse:String(document.getElementById('reviewAiSummaryPreview') && document.getElementById('reviewAiSummaryPreview').textContent || '').toLowerCase()
    };
  }, {scenario, record:controlledRecord()});
}

test('Chart Guru filters weak canonical aliases before selecting a sibling alias', async ({page}) => {
  await bootApp(page);
  const authority = await page.evaluate(() => {
    const weakSnake = chartGuruSupportAuthority({
      support_context:'none', supportContext:'20ma_support',
      support_test_state:'not_tested', supportTestState:'held',
      buyer_control_state:'none', buyerControlState:'confirmed',
      support_interaction_state:'none', supportInteractionState:'active_20ma_support'
    });
    const usableSnake = chartGuruSupportAuthority({
      support_context:'50ma_support', supportContext:'none',
      support_test_state:'testing', supportTestState:'not_tested',
      buyer_control_state:'emerging', buyerControlState:'none',
      support_interaction_state:'active_50ma_support', supportInteractionState:'none'
    });
    return {weakSnake, usableSnake};
  });
  expect(authority.weakSnake.supportContext).toBe('20ma_support');
  expect(authority.weakSnake.supportTestState).toBe('held');
  expect(authority.weakSnake.buyerControlState).toBe('confirmed');
  expect(authority.usableSnake.supportContext).toBe('50ma_support');
  expect(authority.usableSnake.supportTestState).toBe('testing');
  expect(authority.usableSnake.buyerControlState).toBe('emerging');
});

test('Chart Guru preserves canonical support authority across controlled browser fixtures', async ({page}) => {
  await bootApp(page);
  const stale = staleCompatibility();
  const activeTesting = await chartGuruAuthorityRead(page, {
    canonical:{support_context:'20ma_support', support_test_state:'testing', support_interaction_state:'active_20ma_support', distance_from_support_pct:0.002},
    derived:stale,
    projection:{...stale, currentPhase:'away_from_support'}
  });
  expect(activeTesting.support.level).toBe('20ma_support');
  expect(activeTesting.support.currentlyActive).toBe(true);
  expect(activeTesting.support.interaction).toBe('testing');
  expect(activeTesting.currentPhase).not.toBe('away_from_support');
  expect(activeTesting.selectedStory).not.toBe('off_level_wait_for_clearer_support');
  expect(activeTesting.renderedReviewProse).not.toMatch(/return to support|away from the 20-day average/);

  const heldConfirmed = await chartGuruAuthorityRead(page, {
    canonical:{support_context:'20ma_support', support_test_state:'held', buyer_control_state:'confirmed', support_interaction_state:'active_20ma_support', current_phase:'responding_from_support', distance_from_support_pct:0.002},
    derived:stale,
    projection:stale
  });
  expect(heldConfirmed.support.interaction).toBe('held');
  expect(heldConfirmed.buyerControl.state).toBe('confirmed');
  expect(heldConfirmed.currentPhase).toBe('responding_from_support');
  expect(heldConfirmed.support.interaction).not.toBe('not_tested');

  const locationOnly = await chartGuruAuthorityRead(page, {
    canonical:{support_context:'20ma_support', support_interaction_state:'active_20ma_support', distance_from_support_pct:0.002},
    derived:stale
  });
  expect(locationOnly.support.currentlyActive).toBe(true);
  expect(locationOnly.support.interaction).toBe('testing');
  expect(locationOnly.buyerControl.state).not.toBe('confirmed');

  const absentBuyerControl = await chartGuruAuthorityRead(page, {
    canonical:{support_context:'20ma_support', support_test_state:'testing', support_interaction_state:'active_20ma_support', buyer_control_state:'unknown', distance_from_support_pct:0.002},
    derived:stale
  });
  expect(absentBuyerControl.buyerControl.state).not.toBe('confirmed');
});

for(const supportType of ['20ma', '50ma']){
  test(`Chart Guru treats failed ${supportType} support as inactive despite stale active location`, async ({page}) => {
    await bootApp(page);
    const failed = await chartGuruAuthorityRead(page, {
      canonical:{
        support_context:`${supportType}_support`,
        support_test_state:'failed',
        support_interaction_state:`active_${supportType}_support`,
        current_phase:'support_failed',
        distance_from_support_pct:0.002
      },
      derived:{
        supportContext:`${supportType}_support`,
        supportTestState:'testing',
        supportCurrentlyActive:true,
        supportInteractionState:`active_${supportType}_support`,
        pullbackZone:`near_${supportType}`
      },
      projection:{currentPhase:'near_support'}
    });
    expect(failed.support.interaction).toBe('failed');
    expect(failed.support.currentlyActive).toBe(false);
    expect(failed.currentPhase).toBe('support_failed');
    expect(failed.selectedStory).not.toMatch(/rebound|support_response|off_level_wait/);
    expect(failed.renderedReviewProse).not.toMatch(/support is holding|buyers are responding/);
  });
}

test('Chart Guru validates canonical and projected phase against controlled support facts', async ({page}) => {
  await bootApp(page);
  const validFailure = await chartGuruAuthorityRead(page, {
    canonical:{support_context:'20ma_support', support_test_state:'failed', current_phase:'support_failed'},
    derived:{supportInteractionState:'active_20ma_support', supportCurrentlyActive:true},
    projection:{currentPhase:'near_support'}
  });
  expect(validFailure.currentPhase).toBe('support_failed');

  const rejectedAway = await chartGuruAuthorityRead(page, {
    canonical:{support_context:'20ma_support', support_test_state:'held', support_interaction_state:'active_20ma_support', current_phase:'away_from_support', distance_from_support_pct:0.002},
    derived:staleCompatibility()
  });
  expect(rejectedAway.support.currentlyActive).toBe(true);
  expect(rejectedAway.currentPhase).not.toBe('away_from_support');

  const retainedProjectionPhase = await chartGuruAuthorityRead(page, {
    canonical:{support_context:'20ma_support', support_test_state:'held', buyer_control_state:'confirmed', support_interaction_state:'active_20ma_support', distance_from_support_pct:0.002},
    projection:{current_phase:'responding_from_support'},
    derived:staleCompatibility()
  });
  expect(retainedProjectionPhase.currentPhase).toBe('responding_from_support');

  const rejectedResponsePhase = await chartGuruAuthorityRead(page, {
    canonical:{support_context:'20ma_support', support_test_state:'held', support_interaction_state:'active_20ma_support', current_phase:'responding_from_support', distance_from_support_pct:0.002},
    derived:staleCompatibility()
  });
  expect(rejectedResponsePhase.currentPhase).toBe('at_support');

  const rejectedStalledPhase = await chartGuruAuthorityRead(page, {
    canonical:{support_context:'20ma_support', support_test_state:'held', support_interaction_state:'active_20ma_support', current_phase:'stalled_after_response', distance_from_support_pct:0.002},
    derived:staleCompatibility()
  });
  expect(rejectedStalledPhase.currentPhase).toBe('at_support');

  const absentPhase = await chartGuruAuthorityRead(page, {
    canonical:{support_context:'20ma_support', support_test_state:'testing', support_interaction_state:'active_20ma_support'},
    derived:staleCompatibility()
  });
  expect(absentPhase.currentPhase).toBe('at_support');
});
