const {test, expect} = require('@playwright/test');
const path = require('path');

async function bootCleanApp(page){
  const appUrl = `file:///${path.resolve(__dirname, '..', '..', '..', 'index.html').replace(/\\/g, '/')}`;
  await page.goto(appUrl, {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => {
    const ready = typeof startupDebugRenderState === 'function' && startupDebugRenderState();
    return !!(ready && ready.hydrationComplete && ready.riskRefreshComplete);
  }, null, {timeout:30000});
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); if(typeof resetAllData === 'function') resetAllData(); });
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => {
    const ready = typeof startupDebugRenderState === 'function' && startupDebugRenderState();
    return !!(ready && ready.hydrationComplete && ready.riskRefreshComplete);
  }, null, {timeout:30000});
}

async function seedProjectionOnlyEntry(page, ticker){
  return page.evaluate(symbol => {
    const record = upsertTickerRecord(symbol);
    Object.assign(record.meta, {companyName:'Projection Isolation Plc', exchange:'NASDAQ', tradingViewSymbol:`NASDAQ:${symbol}`, marketStatus:'S&P above 50 MA'});
    Object.assign(record.marketData, {currency:'USD', price:75, previousClose:72.4, ma20:73.2, ma50:70.1, ma200:64.8, volume:1200000, avgVolume:1000000});
    Object.assign(record.setup, {structureState:'strong', structureEligibility:'alive', setupLocationState:'near_20ma', pullbackZone:'near_20ma', priceabilityState:'priceable', bounceState:'attempt', stabilisationState:'stabilising', volumeState:'supportive', trendState:'strong'});
    Object.assign(record.plan, {entry:75, stop:72, firstTarget:84, target:84, status:'valid', source:'manual_review'});
    record.scan.analysisProjection = {derived_states:{structure_state:'strong', buyer_control_state:'confirmed', follow_through_state:'confirmed'}, verdict:'Entry'};
    record.scan.resolvedVerdict = 'Entry';
    record.review.analysisState = {normalized:{requestedVerdict:'Entry', phase:'away_from_support'}};
    record.watchlist.inWatchlist = true;
    record.watchlist.presentation = {sharedPresentation:{canonicalVerdict:'entry', finalVerdict:'entry', visualBucket:'entry'}};
    state.tickers = [symbol];
    setActiveReviewTicker(symbol);
    const baseline = resolveGlobalVerdict(record);
    const simplified = resolveSimplifiedStateForSurface(record, 'review', {log:false, source:'entry_projection_isolation'});
    return {
      canonical:{
        verdict:baseline.final_verdict, evidenceId:baseline.evidenceId, resultVersion:baseline.canonicalResultVersion,
        entry:baseline.resolvedPlanEntry, stop:baseline.resolvedPlanStop, target:baseline.resolvedPlanTarget,
        resolvedRr:baseline.resolvedRR, gateResolvedRr:baseline.gateResolvedRr,
        actionability:baseline.actionability, blocker:baseline.decisive_blocker_code || baseline.main_blocker
      },
      simplified:{verdict:simplified.canonicalVerdict, actionability:simplified.actionability}
    };
  }, ticker);
}

test('retired Scan/Review Entry projections cannot manufacture canonical Entry presentation', async ({page}) => {
  // Retired expectation: consumer Entry labels established the current decision.
  // Canonical invariant: only current factual evidence can qualify Entry.
  await bootCleanApp(page);
  const before = await seedProjectionOnlyEntry(page, 'TROW');
  const after = await page.evaluate(() => {
    const record = getTickerRecord('TROW');
    record.scan.analysisProjection.derived_states.buyer_control_state = 'failed';
    record.review.analysisState.normalized.phase = 'entry_ready';
    record.watchlist.presentation.sharedPresentation.canonicalVerdict = 'entry';
    const publication = resolveGlobalVerdict(record);
    setActiveReviewTicker('TROW');
    renderReviewWorkspace({source:'entry_projection_isolation'});
    return {verdict:publication.final_verdict, evidenceId:publication.evidenceId, resultVersion:publication.canonicalResultVersion, actionability:publication.actionability, blocker:publication.decisive_blocker_code || publication.main_blocker};
  });
  expect(before.canonical.verdict).toBe('watch');
  expect(after).toMatchObject({verdict:before.canonical.verdict, evidenceId:before.canonical.evidenceId, resultVersion:before.canonical.resultVersion, actionability:before.canonical.actionability, blocker:before.canonical.blocker});
  await expect(page.locator('#reviewWorkspace .review-summary-badges .badge')).toContainText('Watch');
  await expect(page.locator('#paperTradeBtn')).toBeDisabled();
});

test('Paper Trade enablement follows canonical actionability, not backend or presentation Entry state', async ({page}) => {
  // Retired expectation: gateway configuration plus an Entry projection enabled execution.
  // Canonical invariant: a non-actionable publication stays non-executable.
  await bootCleanApp(page);
  const before = await seedProjectionOnlyEntry(page, 'BKND');
  const after = await page.evaluate(() => {
    state.paperTradeApiKey = '';
    state.paperTradeApiSecret = '';
    trading212PaperAvailabilityChecked = true;
    trading212PaperEnabled = true;
    const record = getTickerRecord('BKND');
    record.review.analysisState.normalized.requestedVerdict = 'Entry';
    record.scan.resolvedVerdict = 'Entry';
    const publication = resolveGlobalVerdict(record);
    setActiveReviewTicker('BKND');
    renderReviewWorkspace({source:'paper_trade_projection_isolation'});
    return {verdict:publication.final_verdict, evidenceId:publication.evidenceId, resultVersion:publication.canonicalResultVersion, actionability:publication.actionability};
  });
  expect(after).toMatchObject({verdict:before.canonical.verdict, evidenceId:before.canonical.evidenceId, resultVersion:before.canonical.resultVersion, actionability:before.canonical.actionability});
  await expect(page.locator('#reviewWorkspace .review-summary-badges .badge')).toContainText('Watch');
  await expect(page.locator('#paperTradeBtn')).toBeDisabled();
});
