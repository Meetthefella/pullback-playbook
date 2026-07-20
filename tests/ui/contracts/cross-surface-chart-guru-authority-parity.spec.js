const {test, expect} = require('@playwright/test');
const path = require('path');

async function bootApp(page){
  const appUrl = `file:///${path.resolve(__dirname, '..', '..', '..', 'index.html').replace(/\\/g, '/')}`;
  await page.goto(appUrl, {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => typeof resolveSimplifiedStateForSurface === 'function', null, {timeout:30000});
}

test('one canonical record keeps a Watch verdict across Scan, Review, and Track while Chart Guru narrates held support', async ({page}) => {
  await bootApp(page);
  const state = await page.evaluate(async () => {
    const record = upsertTickerRecord('PARITY');
    record.marketData = {
      ...record.marketData,
      price:100,
      previousClose:99.8,
      ma20:100.2,
      ma50:96,
      ma200:85,
      volume:1000000,
      avgVolume:1000000,
      history:[
        {date:'2026-07-01', open:99.4, high:100, low:99, close:99.8, volume:900000},
        {date:'2026-07-02', open:99.8, high:100.4, low:99.5, close:100, volume:1000000}
      ]
    };
    record.setup = {
      ...record.setup,
      structureState:'intact',
      structureEligibility:'alive',
      pullbackZone:'near_20ma',
      setupLocationState:'usable_pullback',
      priceabilityState:'unpriceable',
      bounceState:'attempt',
      stabilisationState:'early'
    };
    record.scan.analysisProjection = {
      price:100, sma20:100.2, sma50:96, sma200:85,
      derived_states:{
        trend_state:'strong', structure_state:'intact', pullback_zone:'near_20ma',
        setup_location_state:'usable_pullback', priceability_state:'unpriceable',
        support_context:'20ma_support', support_test_state:'held',
        buyer_control_state:'confirmed', support_interaction_state:'active_20ma_support'
      }
    };
    record.review.manualReview = {entry:'', stop:'', target:''};
    const canonical = resolveSimplifiedStateForSurface(record, 'review', {log:false, source:'cross_surface_authority_parity_canonical'});
    record.scan.resolvedVerdict = canonical.canonicalVerdict;
    record.scan.verdict = canonical.canonicalVerdict;
    record.scan.summary = canonical.mainBlocker;
    const scan = resolveSimplifiedStateForSurface(record, 'scan', {log:false, source:'cross_surface_authority_parity'});
    const review = resolveSimplifiedStateForSurface(record, 'review', {log:false, source:'cross_surface_authority_parity'});
    const track = resolveSimplifiedStateForSurface(record, 'track', {log:false, source:'cross_surface_authority_parity'});
    const coach = buildDeterministicChartCoach(record, {
      canonicalValues:{price:100, ma20:100.2, ma50:96, ma200:85, volume:1000000},
      trustedMarketContext:{currentPrice:100, ma20:100.2, ma50:96, ma200:85, volume:1000000}
    }, {
      globalVerdict:{
        ...review.debug.resolvedState,
        support_context:'20ma_support', support_test_state:'held', buyer_control_state:'confirmed',
        support_interaction_state:'active_20ma_support', distance_from_support_pct:0.002
      },
      derivedStates:review.debug.derivedStates
    });
    record.review.analysisState = {
      normalizedAnalysis:{
        canonicalValues:{price:100, ma20:100.2, ma50:96, ma200:85, volume:1000000},
        trustedMarketContext:{currentPrice:100, ma20:100.2, ma50:96, ma200:85, volume:1000000},
        chartCoach:coach
      },
      error:'', rawAnalysis:'', reviewedAt:'2026-07-02T00:00:00.000Z'
    };
    record.review.normalizedAnalysis = record.review.analysisState.normalizedAnalysis;
    record.watchlist.inWatchlist = true;
    record.watchlist.addedAt = '2026-07-02';
    record.watchlist.expiryAt = '2027-07-02';
    record.scan.lastScannedAt = '2026-07-02T00:00:00.000Z';
    uiState.scannerSessionTickers = [record.ticker];
    renderScannerResults();
    setActiveReviewTicker(record.ticker);
    renderReviewWorkspace({source:'cross_surface_authority_parity'});
    setActiveWorkspaceTab('track');
    await renderTrackWorkspaceForcedFull({reason:'cross_surface_authority_parity'});
    const scanCard = document.querySelector(`#results .resultcompact[data-ticker="${record.ticker}"]`);
    const trackCard = document.querySelector(`#watchlistList [data-watchlist-ticker="${record.ticker}"]`);
    const reviewShell = document.querySelector('#reviewWorkspace [data-review-visual-state]') || document.querySelector('#reviewWorkspace');
    return {
      scanVerdict:scan.canonicalVerdict,
      reviewVerdict:review.canonicalVerdict,
      trackVerdict:track.canonicalVerdict,
      scanBlocker:scan.mainBlocker,
      reviewBlocker:review.mainBlocker,
      trackBlocker:track.mainBlocker,
      support:coach.diagnostics.narrativeContext.support,
      buyerControl:coach.diagnostics.narrativeContext.buyerControl,
      story:coach.primaryStory && coach.primaryStory.key,
      scanDisplay:scanCard && (scanCard.dataset.visualState || scanCard.querySelector('.badge.state-pill') && scanCard.querySelector('.badge.state-pill').textContent),
      reviewDisplay:reviewShell && (reviewShell.dataset.visualState || reviewShell.querySelector('.badge.state-pill') && reviewShell.querySelector('.badge.state-pill').textContent),
      trackDisplay:trackCard && (trackCard.dataset.visualState || trackCard.querySelector('.badge.state-pill') && trackCard.querySelector('.badge.state-pill').textContent)
    };
  });
  expect(state.scanVerdict).toBe('watch');
  expect(state.reviewVerdict).toBe('watch');
  expect(state.trackVerdict).toBe('watch');
  expect(String(state.scanDisplay).toLowerCase()).toMatch(/watch|monitor/);
  expect(String(state.reviewDisplay).toLowerCase()).toMatch(/watch|monitor/);
  expect(String(state.trackDisplay).toLowerCase()).toMatch(/watch|monitor/);
  expect([state.scanBlocker, state.reviewBlocker, state.trackBlocker].join(' ').toLowerCase()).toMatch(/price|plan|risk|entry/);
  expect(state.support.level).toBe('20ma_support');
  expect(state.support.interaction).toBe('held');
  expect(state.support.currentlyActive).toBe(true);
  expect(state.buyerControl.state).toBe('confirmed');
  expect(state.story).not.toBe('off_level_wait_for_clearer_support');
});
