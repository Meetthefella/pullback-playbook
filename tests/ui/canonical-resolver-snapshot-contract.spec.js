const {test, expect} = require('@playwright/test');
const path = require('path');
const {
  openTrackTab,
  waitForUiTransitionSettle
} = require('./helpers/app-driver');
const {extractAppTickerState} = require('./helpers/app-state');

async function bootApp(page){
  const appUrl = `file:///${path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/')}`;
  await page.goto(appUrl, {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => {
    if(typeof startupDebugRenderState !== 'function') return false;
    const ready = startupDebugRenderState();
    return !!(ready && ready.hydrationComplete === true && ready.riskRefreshComplete === true);
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

async function seedCanonicalWatchWithValidPlan(page){
  await page.evaluate(() => {
    const ticker = 'TROW';
    state.paperTradeApiKey = 'paper-key';
    state.paperTradeApiSecret = 'paper-secret';
    state.paperTradeTesterSetupCompletedAt = '2026-06-29T09:00:00.000Z';
    const record = upsertTickerRecord(ticker);
    record.meta.companyName = 'T. Rowe Price Group, Inc.';
    record.meta.exchange = 'LSE';
    record.meta.tradingViewSymbol = 'LSE:TROW';
    record.meta.marketStatus = 'S&P above 50 MA';
    record.marketData.currency = 'GBP';
    record.marketData.price = 20.4;
    record.marketData.previousClose = 19.9;
    record.marketData.ma20 = 20.1;
    record.marketData.ma50 = 19.4;
    record.marketData.ma200 = 17.8;
    record.marketData.rsi = 64.82;
    record.marketData.volume = 3831934;
    record.marketData.avgVolume = 2115787.96;
    record.marketData.asOf = '2026-06-29T09:00:00.000Z';
    record.marketData.history = [
      {date:'2026-06-27', open:19.8, high:20.6, low:19.6, close:20.4, volume:3831934}
    ];
    record.setup.structureState = 'strong';
    record.setup.structureEligibility = 'alive';
    record.setup.setupLocationState = 'near_20ma';
    record.setup.pullbackZone = 'near_20ma';
    record.setup.priceabilityState = 'priceable';
    record.setup.bounceState = 'confirmed';
    record.setup.stabilisationState = 'stabilising';
    record.setup.volumeState = 'supportive';
    record.setup.trendState = 'strong';
    record.plan.entry = 20.4;
    record.plan.stop = 18.8;
    record.plan.firstTarget = 25.2;
    record.plan.target = 25.2;
    record.plan.status = 'valid';
    record.plan.source = 'scanner_estimate';
    record.plan.riskStatus = 'fits_risk';
    record.plan.tradeability = 'risk_only';
    record.plan.authorityVersion = 'trade_plan_v1';
    record.plan.authoritySource = 'resolver';
    record.plan.authorityReason = 'canonical_test_seed';
    record.plan.writtenBy = 'playwright';
    record.plan.writtenAt = '2026-06-29T09:00:00.000Z';
    record.plan.quoteCurrency = 'GBP';
    record.plan.capitalFit = {
      capital_fit:'unknown',
      capital_note:'Capital fit cannot be confirmed yet.',
      position_cost:4080,
      quote_currency:'GBP',
      fx_status:'native'
    };
    record.scan.score = 9;
    record.scan.resolvedVerdict = 'Watch';
    record.scan.verdict = 'Watch';
    record.scan.summary = 'Bounce still tentative.';
    record.scan.riskStatus = 'fits_risk';
    record.scan.analysisProjection = {
      price:20.4,
      sma20:20.1,
      sma50:19.4,
      sma200:17.8,
      rr_ratio:'3.00',
      risk_status:'fits_risk',
      derived_states:{
        trend_state:'strong',
        pullback_zone:'near_20ma',
        setup_location_state:'near_20ma',
        priceability_state:'priceable',
        structure_state:'strong',
        stabilisation_state:'stabilising',
        bounce_state:'confirmed',
        volume_state:'supportive',
        has_clear_invalidation_level:'yes',
        has_priceable_plan:'yes',
        entry_defined:'yes',
        stop_defined:'yes',
        target_defined:'yes'
      }
    };
    record.review.savedVerdict = 'Entry';
    record.review.savedScore = 2;
    record.review.savedSummary = 'Stale saved review verdict.';
    record.review.analysisState = {
      normalized:{
        coach_summary:'Ignore stale review presentation.'
      }
    };
    record.review.manualReview = {
      entry:20.4,
      stop:18.8,
      target:25.2
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
        actionLabel:'Execute only if the trigger remains valid.',
        mainBlocker:'Stale persisted entry label.'
      }
    };
    state.tickers = [ticker];
    uiState.scannerSessionTickers = [ticker];
    commitTickerState();
    renderCards();
    renderScannerResults();
    renderWatchlist({source:'canonical_resolver_snapshot_test'});
  });
}

function assertCanonicalParity({scan, review, track}, sourceLabel){
  expect(scan.normalized.scanCanonicalVerdict, `${sourceLabel}: Scan surface keeps its persisted scan verdict`).toBe('watch');
  expect(review.normalized.reviewCanonicalVerdict, `${sourceLabel}: Review must follow live canonical snapshot`).toBe('near_entry');
  expect(track.normalized.trackCanonicalVerdict, `${sourceLabel}: Track must follow live canonical snapshot`).toBe('near_entry');
  expect(review.normalized.reviewCanonicalVerdict, `${sourceLabel}: Review and Track verdict parity`).toBe(track.normalized.trackCanonicalVerdict);
  expect(track.normalized.trackDiagnosticMatchesRenderedAuthority, `${sourceLabel}: Track diagnostic authority must match rendered Track card`).toBe(true);
  expect(review.authority && review.authority.replayBuilder, `${sourceLabel}: App replay builder must be exposed in extracted authority state`).toBeTruthy();
  expect(
    review.authority && review.authority.replayBuilder && review.authority.replayBuilder.reviewCanonicalVerdict,
    `${sourceLabel}: App replay builder must stay aligned with Review canonical authority`
  ).toBe(review.normalized.reviewCanonicalVerdict);
  expect(
    review.authority && review.authority.replayBuilder && review.authority.replayBuilder.reviewVisualBucket,
    `${sourceLabel}: App replay builder must stay aligned with Review visual bucket authority`
  ).toBe(review.normalized.reviewVisualBucket);
  expect(review.review.stateHealth.contract && review.review.stateHealth.contract.contractFingerprint, `${sourceLabel}: Review diagnostics must expose canonical contract fingerprint`).toBeTruthy();
  expect(track.track.diagnostics && track.track.diagnostics.contract && track.track.diagnostics.contract.contractFingerprint, `${sourceLabel}: Track diagnostics must expose canonical contract fingerprint`).toBeTruthy();
  expect(
    review.review.stateHealth.contract && review.review.stateHealth.contract.canonicalVerdict,
    `${sourceLabel}: Review and Track diagnostics must expose the same canonical verdict root`
  ).toBe(track.track.diagnostics && track.track.diagnostics.contract && track.track.diagnostics.contract.canonicalVerdict);
  expect(
    review.review.stateHealth.contract && review.review.stateHealth.contract.canonicalVisualBucket,
    `${sourceLabel}: Review and Track diagnostics must expose the same canonical visual bucket root`
  ).toBe(track.track.diagnostics && track.track.diagnostics.contract && track.track.diagnostics.contract.canonicalVisualBucket);

  expect(scan.scan.visibleCard.scoreLabel, `${sourceLabel}: Scan displayed score should use the shared score display pipeline`).toContain('6');
  expect(review.review.stateHealth.planAuthority.verdict, `${sourceLabel}: Review plan authority verdict`).toBe('near_entry');
  expect(track.track.visible.scoreLabel, `${sourceLabel}: Track setup score should stay aligned with the shared display-model score pipeline`).toContain('6');

  expect(review.review.visible.entryVisible, `${sourceLabel}: Review trade plan should stay visible`).toBe(true);
  expect(!!track.visibleCopy.track.entryPanel, `${sourceLabel}: Track trade plan should stay visible`).toBe(true);
  expect(review.paperTrade.button.enabled, `${sourceLabel}: Paper Trade must stay disabled for blocked setup`).toBe(false);
  expect(track.paperTrade.button.enabled, `${sourceLabel}: Track-opened review context must keep Paper Trade disabled`).toBe(false);

  expect(review.visibleCopy.review.tradeStatus, `${sourceLabel}: Review blocker copy`).toContain('confirmation');
  expect(track.visibleCopy.track.cardText, `${sourceLabel}: Track blocker copy`).toContain('confirmation');
  expect(track.visibleCopy.track.entryPanel && track.visibleCopy.track.entryPanel.status, `${sourceLabel}: Track status`).not.toContain('Entry Ready');
}

test('scan, review, and track stay on the same canonical resolver snapshot after opening from scan or track', async ({page}) => {
  await bootApp(page);
  await seedCanonicalWatchWithValidPlan(page);

  const scanState = await extractAppTickerState(page, 'TROW');
  await page.evaluate(() => {
    if(typeof openRankedResultInReview === 'function'){
      openRankedResultInReview('TROW');
      return;
    }
    loadTickerIntoReview('TROW', {
      includeInScannerUniverse:false,
      recompute:false,
      sourceContext:'scan',
      forceNow:true,
      openTrigger:{
        kind:'scan_result',
        eventType:'click',
        userInitiated:true,
        isTrusted:null
      }
    });
  });
  await waitForUiTransitionSettle(page);
  const reviewFromScanState = await extractAppTickerState(page, 'TROW');

  await openTrackTab(page);
  await waitForUiTransitionSettle(page);
  const trackState = await extractAppTickerState(page, 'TROW');

  await page.evaluate(() => {
    reviewWatchlistTicker('TROW', {
      sourceProjectionSnapshot:{
        ticker:'TROW',
        canonicalVerdict:'entry',
        finalVerdict:'entry',
        renderedVerdict:'entry',
        visualBucket:'entry',
        sourceOfTruthVisualBucket:'entry',
        renderedBucket:'entry',
        tone:'entry',
        decisionSummary:'Stale projection summary',
        actionGuidance:'Execute only if the trigger remains valid.'
      },
      openTrigger:{
        kind:'watchlist_review',
        eventType:'click',
        userInitiated:true,
        isTrusted:null
      }
    });
  });
  await waitForUiTransitionSettle(page);
  const reviewFromTrackState = await extractAppTickerState(page, 'TROW');

  assertCanonicalParity({
    scan:scanState,
    review:reviewFromScanState,
    track:trackState
  }, 'open_from_scan');
  assertCanonicalParity({
    scan:scanState,
    review:reviewFromTrackState,
    track:trackState
  }, 'open_from_track');
});

test('clicked snapshot source without a matching projection refreshes from live resolver', async ({page}) => {
  await bootApp(page);
  await seedCanonicalWatchWithValidPlan(page);

  const result = await page.evaluate(() => {
    const outcomes = [];
    const originalRefreshTrackedTickerState = refreshTrackedTickerState;
    let refreshCount = 0;
    refreshTrackedTickerState = function observedRefreshTrackedTickerState(...args){
      refreshCount += 1;
      return originalRefreshTrackedTickerState.apply(this, args);
    };
    try{
      setActiveReviewTicker('TROW');
      [
        null,
        {
          ticker:'MSFT',
          canonicalVerdict:'entry',
          finalVerdict:'entry',
          visualBucket:'entry',
          tone:'entry',
          capturedAt:new Date().toISOString()
        }
      ].forEach(snapshot => {
        uiState.activeReviewProjectionSource = 'clicked_card_snapshot';
        uiState.activeReviewSourceProjectionSnapshot = snapshot;
        renderReviewWorkspace({source:'clicked_snapshot_missing_or_mismatched_regression'});
        outcomes.push({
          snapshotTicker:snapshot && snapshot.ticker || '',
          stateHealth:currentReviewStateHealthSnapshot(getTickerRecord('TROW')),
          paperTrade:currentPaperTradeContextForTicker('TROW')
        });
      });
    }finally{
      refreshTrackedTickerState = originalRefreshTrackedTickerState;
    }
    return {refreshCount, outcomes};
  });

  expect(result.refreshCount, 'missing/mismatched clicked snapshots must not skip live refresh').toBeGreaterThanOrEqual(2);
  result.outcomes.forEach(outcome => {
    expect(outcome.stateHealth.sourceOfTruth, `snapshot ${outcome.snapshotTicker || '(null)'} must not be projection authority`).not.toBe('review_projection_snapshot');
    expect(outcome.stateHealth.canonicalVerdict, `snapshot ${outcome.snapshotTicker || '(null)'} must use live resolver verdict`).toBe('near_entry');
    expect(outcome.paperTrade && outcome.paperTrade.finalVerdict, `snapshot ${outcome.snapshotTicker || '(null)'} must not enable Paper Trade Entry`).not.toBe('Entry');
  });
});

test('score-only Review snapshot cannot become presentation authority', async ({page}) => {
  await bootApp(page);
  await seedCanonicalWatchWithValidPlan(page);

  const result = await page.evaluate(() => {
    const originalRefreshTrackedTickerState = refreshTrackedTickerState;
    let refreshCount = 0;
    refreshTrackedTickerState = function observedRefreshTrackedTickerState(...args){
      refreshCount += 1;
      return originalRefreshTrackedTickerState.apply(this, args);
    };
    try{
      setActiveReviewTicker('TROW');
      setActiveReviewSourceProjectionSnapshot('TROW', {
        ticker:'TROW',
        setupScore:10,
        capturedAt:new Date().toISOString()
      }, 'scanner');
      const projectionSource = uiState.activeReviewProjectionSource;
      renderReviewWorkspace({source:'score_only_snapshot_regression'});
      const record = getTickerRecord('TROW');
      const baselineSharedPresentation = buildSharedReviewTrackPresentation(record, {
        surface:'review',
        simplifiedState:resolveSimplifiedStateForSurface(record, 'review', {log:false}),
        lifecycleSnapshot:watchlistLifecycleSnapshot(record),
        globalVerdict:resolveGlobalVerdict(record),
        source:'score_only_shared_presentation_baseline',
        reason:'score_only_shared_presentation_baseline'
      });
      const scoreOnlyClickedSnapshot = {
        ticker:'TROW',
        setupScore:10,
        capturedAt:new Date().toISOString()
      };
      uiState.activeReviewProjectionSource = 'clicked_card_snapshot';
      uiState.activeReviewSourceProjectionSnapshot = scoreOnlyClickedSnapshot;
      const forcedClickedHealth = currentReviewStateHealthSnapshot(getTickerRecord('TROW'));
      const forcedClickedSharedPresentation = buildSharedReviewTrackPresentation(record, {
        surface:'review',
        simplifiedState:resolveSimplifiedStateForSurface(record, 'review', {log:false}),
        lifecycleSnapshot:watchlistLifecycleSnapshot(record),
        globalVerdict:resolveGlobalVerdict(record),
        source:'score_only_shared_presentation_regression',
        reason:'score_only_shared_presentation_regression'
      });
      return {
        projectionSource,
        refreshCount,
        stateHealth:currentReviewStateHealthSnapshot(getTickerRecord('TROW')),
        forcedClickedHealth,
        baselineSharedPresentation,
        forcedClickedSharedPresentation,
        tradeStatus:String(document.querySelector('#tradeStatusBox') && document.querySelector('#tradeStatusBox').textContent || '').trim(),
        paperTrade:currentPaperTradeContextForTicker('TROW')
      };
    }finally{
      refreshTrackedTickerState = originalRefreshTrackedTickerState;
    }
  });

  expect(result.projectionSource, 'score-only snapshot must be classified as score transport only').toBe('scanner_score_snapshot');
  expect(result.refreshCount, 'score-only snapshot must not skip live refresh').toBeGreaterThanOrEqual(1);
  expect(result.stateHealth.sourceOfTruth, 'score-only snapshot must not become Review presentation authority').not.toBe('review_projection_snapshot');
  expect(result.stateHealth.canonicalVerdict, 'score-only snapshot must keep live resolver verdict').toBe('near_entry');
  expect(result.forcedClickedHealth.sourceOfTruth, 'score-only snapshot with stale clicked source must not become health projection authority').not.toBe('review_projection_snapshot');
  expect(result.forcedClickedHealth.canonicalVerdict, 'health snapshot must keep live resolver verdict for forced score-only clicked source').toBe('near_entry');
  expect(result.forcedClickedSharedPresentation.canonicalVerdict, 'score-only clicked snapshot must not change shared presentation verdict').toBe(result.baselineSharedPresentation.canonicalVerdict);
  expect(result.forcedClickedSharedPresentation.visualBucket, 'score-only clicked snapshot must not change shared presentation bucket').toBe(result.baselineSharedPresentation.visualBucket);
  expect(result.forcedClickedSharedPresentation.headline, 'score-only clicked snapshot must not change shared presentation headline').toBe(result.baselineSharedPresentation.headline);
  expect(result.tradeStatus, 'score-only snapshot must not render clicked Entry copy').not.toContain('Entry Ready');
  expect(result.paperTrade && result.paperTrade.finalVerdict, 'score-only snapshot must not enable Paper Trade Entry').not.toBe('Entry');
});

test('unknown capital fit never enables Paper Trade eligibility', async ({page}) => {
  await bootApp(page);
  const eligibility = await page.evaluate(() => {
    const paperTradeEligibility = window.PaperTradeEligibility && typeof window.PaperTradeEligibility.createPaperTradeEligibility === 'function'
      ? window.PaperTradeEligibility.createPaperTradeEligibility()
      : null;
    if(!paperTradeEligibility) return null;
    return paperTradeEligibility.evaluatePaperTradeEligibility({
      finalVerdict:'Entry',
      planStatus:'valid',
      primaryState:'active',
      riskStatus:'fits_risk',
      tradeability:'tradable',
      capitalFit:'unknown',
      hardBlocker:'',
      entry:20.4,
      stop:18.8,
      target:25.2,
      positionSize:100,
      maxLoss:40,
      rrRatio:3
    });
  });

  expect(eligibility, 'paper-trade eligibility helper should be available').toBeTruthy();
  expect(eligibility.eligible, 'unknown capital fit must not be paper-trade eligible').toBe(false);
  expect(eligibility.reasons.join(' '), 'unknown capital fit should produce a capital-fit rejection').toContain('Capital fit is unknown.');
});

test('scan-open score transport cannot override a later Track render', async ({page}) => {
  await bootApp(page);
  await seedCanonicalWatchWithValidPlan(page);

  await page.evaluate(() => {
    openRankedResultInReview('TROW');
  });
  await waitForUiTransitionSettle(page);
  const transportAfterScanOpen = await page.evaluate(() => ({
    scoreTransportLive:!!uiState.activeReviewScoreTransportSnapshot,
    trackScoreToken:String(uiState.activeTrackScoreTransportToken || ''),
    scoreTransportMapType:typeof activeReviewOpenScoreTransportByToken,
    scoreTransportConsumerType:typeof consumeOpenScoreTransportForTrackRecord
  }));
  expect(transportAfterScanOpen.scoreTransportLive, 'Scan open must not store score transport globally').toBe(false);
  expect(transportAfterScanOpen.trackScoreToken, 'Scan open must not leave a Track score token').toBe('');
  expect(transportAfterScanOpen.scoreTransportMapType, 'Scan open must not expose a global score transport map').toBe('undefined');
  expect(transportAfterScanOpen.scoreTransportConsumerType, 'Track must not expose a later score transport consumer').toBe('undefined');

  await page.evaluate(() => {
    setActiveWorkspaceTab('track', {focusTop:false});
    uiState.activeReviewScoreTransportSnapshot = {
      ticker:'TROW',
      setupScore:10,
      reviewLoadToken:uiState.reviewLoadToken,
      consumed:false,
      trackActivationToken:'stale-test-token'
    };
    uiState.activeTrackScoreTransportToken = 'stale-test-token';
    renderWatchlist({source:'stale_score_transport_regression', allowCachedReturn:false});
  });
  await waitForUiTransitionSettle(page);

  const state = await extractAppTickerState(page, 'TROW');
  expect(state.track.visible.scoreLabel, 'stale score transport must not override Track score').not.toBe('10/10');
  const transportState = await page.evaluate(() => ({
    scoreTransportLive:!!uiState.activeReviewScoreTransportSnapshot,
    trackScoreToken:String(uiState.activeTrackScoreTransportToken || '')
  }));
  expect(transportState.scoreTransportLive, 'stale score transport should be cleared by later Track render').toBe(false);
  expect(transportState.trackScoreToken, 'stale score token should be cleared by later Track render').toBe('');
});

test('lifecycle Entry without canonical actionable plan does not force Paper Trade Entry', async ({page}) => {
  await bootApp(page);
  await seedCanonicalWatchWithValidPlan(page);

  const context = await page.evaluate(() => {
    const record = getTickerRecord('TROW');
    record.watchlist.lifecycleState = 'entry';
    record.watchlist.debug = record.watchlist.debug && typeof record.watchlist.debug === 'object' ? record.watchlist.debug : {};
    record.watchlist.debug.currentState = 'entry';
    setActiveReviewTicker('TROW');
    return currentPaperTradeContextForTicker('TROW');
  });

  expect(context && context.finalVerdict, 'lifecycle Entry alone must not force paper-trade verdict Entry').not.toBe('Entry');
  expect(context && context.eligibility && context.eligibility.eligible, 'lifecycle Entry alone must not enable Paper Trade').toBe(false);
});

test('persisted Review presentation cannot soft-promote current Watch state', async ({page}) => {
  await bootApp(page);

  const result = await page.evaluate(() => {
    const record = upsertTickerRecord('SOFT');
    record.watchlist.inWatchlist = true;
    record.watchlist.presentation = {
      sharedPresentation:{
        canonicalVerdict:'entry',
        finalVerdict:'entry',
        visualBucket:'entry',
        tone:'entry',
        badgeLabel:'Entry',
        headline:'Entry Ready'
      }
    };
    const simplified = {
      canonicalVerdict:'watch',
      visualBucket:'monitor',
      tone:'monitor',
      badgeLabel:'Watch',
      planStatus:'valid',
      priceabilityState:'priceable',
      mainBlocker:'Wait for confirmation.'
    };
    const globalVerdict = {
      final_verdict:'watch',
      structure_state:'strong',
      structure_eligibility:'alive'
    };
    return applyReviewWatchlistSoftReadinessDisplayOverride(record, simplified, globalVerdict, {state:'watch'});
  });

  expect(result.canonicalVerdict, 'persisted Review presentation must not promote Watch to Entry').toBe('watch');
  expect(result.visualBucket, 'persisted Review presentation must not promote visual bucket').toBe('monitor');
  expect(result.debug && result.debug.reviewWatchlistSoftReadinessDisplayOverrideApplied, 'no persisted soft override should be applied').not.toBe(true);
});

test('persisted sharedPresentation Entry cannot become lifecycle or Review soft-readiness authority', async ({page}) => {
  await bootApp(page);

  const result = await page.evaluate(() => {
    const record = upsertTickerRecord('LIFE');
    record.meta.exchange = 'LSE';
    record.marketData.currency = 'GBP';
    record.marketData.price = 20;
    record.marketData.ma20 = 19.8;
    record.marketData.ma50 = 19.2;
    record.setup.structureState = 'strong';
    record.setup.structureEligibility = 'alive';
    record.setup.setupLocationState = 'near_20ma';
    record.setup.pullbackZone = 'near_20ma';
    record.setup.priceabilityState = 'priceable';
    record.setup.bounceState = 'none';
    record.setup.stabilisationState = 'early';
    record.setup.volumeState = 'weak';
    record.plan.entry = 20;
    record.plan.stop = 18;
    record.plan.firstTarget = 25;
    record.plan.target = 25;
    record.plan.status = 'valid';
    record.plan.riskStatus = 'fits_risk';
    record.plan.tradeability = 'risk_only';
    record.watchlist.inWatchlist = true;
    record.watchlist.addedAt = '2026-06-29';
    state.paperTradeApiKey = 'paper-key';
    state.paperTradeApiSecret = 'paper-secret';
    state.paperTradeTesterSetupCompletedAt = '2026-06-29T09:00:00.000Z';
    record.watchlist.presentation = {
      sharedPresentation:{
        canonicalVerdict:'entry',
        finalVerdict:'entry',
        visualBucket:'entry',
        tone:'entry',
        badgeLabel:'Entry',
        headline:'Entry Ready',
        mainBlocker:'Stale Entry presentation.'
      }
    };
    const lifecycle = watchlistLifecycleSnapshot(record);
    const simplified = {
      canonicalVerdict:'watch',
      visualBucket:'monitor',
      tone:'monitor',
      badgeLabel:'Watch',
      planStatus:'valid',
      priceabilityState:'priceable',
      structureState:'strong',
      structureEligibility:'alive',
      mainBlocker:'Wait for current confirmation.'
    };
    const globalVerdict = {
      final_verdict:'watch',
      structure_state:'strong',
      structure_eligibility:'alive'
    };
    const review = applyReviewWatchlistSoftReadinessDisplayOverride(record, simplified, globalVerdict, lifecycle);
    const paperTrade = currentPaperTradeContextForTicker('LIFE');
    return {
      lifecycleState:lifecycle.state,
      lifecycleBucket:lifecycle.bucket,
      reviewCanonicalVerdict:review.canonicalVerdict,
      reviewVisualBucket:review.visualBucket,
      reviewOverrideApplied:!!(review.debug && review.debug.reviewWatchlistSoftReadinessDisplayOverrideApplied === true),
      paperTradeFinalVerdict:paperTrade && paperTrade.finalVerdict,
      paperTradeEligible:!!(paperTrade && paperTrade.eligibility && paperTrade.eligibility.eligible === true)
    };
  });

  expect(result.lifecycleState, 'persisted Entry presentation must not become lifecycle state').not.toBe('entry');
  expect(result.lifecycleBucket, 'persisted Entry presentation must not become lifecycle bucket').not.toBe('tradeable_entry');
  expect(result.reviewCanonicalVerdict, 'persisted lifecycle/presentation must not soft-promote Review').toBe('watch');
  expect(result.reviewVisualBucket, 'persisted lifecycle/presentation must not promote Review bucket').toBe('monitor');
  expect(result.reviewOverrideApplied, 'Review soft-readiness override must not run without resolver alignment').toBe(false);
  expect(result.paperTradeFinalVerdict, 'persisted Entry presentation must not promote paper-trade verdict').not.toBe('Entry');
  expect(result.paperTradeEligible, 'persisted Entry presentation must not enable paper-trade eligibility').toBe(false);
});

test('stale persisted sharedPresentation copy cannot render after live resolver changes', async ({page}) => {
  await bootApp(page);
  await seedCanonicalWatchWithValidPlan(page);

  const reviewResult = await page.evaluate(() => {
    const record = getTickerRecord('TROW');
    record.watchlist.presentation = {
      sharedPresentation:{
        canonicalVerdict:'entry',
        finalVerdict:'entry',
        visualBucket:'entry',
        tone:'entry',
        badgeLabel:'Entry',
        actionLabel:'STALE ACTION COPY DO NOT SHOW',
        mainBlocker:'STALE BLOCKER COPY DO NOT SHOW',
        primaryReason:'STALE PRIMARY COPY DO NOT SHOW',
        headline:'STALE HEADLINE COPY DO NOT SHOW'
      }
    };
    uiState.activeReviewSourceProjectionSnapshot = null;
    uiState.activeReviewProjectionSource = 'non_watchlist_direct_resolve';
    setActiveReviewTicker('TROW');
    renderReviewWorkspace({source:'stale_persisted_copy_regression'});
    const lifecycle = watchlistLifecycleSnapshot(record);
    return {
      reviewText:String(document.querySelector('#reviewWorkspace') && document.querySelector('#reviewWorkspace').textContent || '').replace(/\s+/g, ' ').trim(),
      lifecycleReason:String(lifecycle && lifecycle.reason || '')
    };
  });
  await waitForUiTransitionSettle(page);

  await openTrackTab(page);
  await waitForUiTransitionSettle(page);
  const state = await extractAppTickerState(page, 'TROW');
  const trackText = [
    state.visibleCopy.track.cardText,
    state.visibleCopy.track.entryPanel && state.visibleCopy.track.entryPanel.why,
    state.visibleCopy.track.entryPanel && state.visibleCopy.track.entryPanel.nextAction
  ].filter(Boolean).join(' ');

  ['STALE ACTION COPY DO NOT SHOW', 'STALE BLOCKER COPY DO NOT SHOW', 'STALE PRIMARY COPY DO NOT SHOW', 'STALE HEADLINE COPY DO NOT SHOW'].forEach(staleCopy => {
    expect(reviewResult.reviewText, `Review must not render stale persisted copy: ${staleCopy}`).not.toContain(staleCopy);
    expect(trackText, `Track must not render stale persisted copy: ${staleCopy}`).not.toContain(staleCopy);
    expect(reviewResult.lifecycleReason, `Lifecycle reason must not use stale persisted copy: ${staleCopy}`).not.toContain(staleCopy);
  });
});

test('Track parity helper detects rendered and diagnostic authority divergence', async ({page}) => {
  await bootApp(page);
  await seedCanonicalWatchWithValidPlan(page);
  await openTrackTab(page);
  await waitForUiTransitionSettle(page);

  await page.evaluate(() => {
    window.__originalBuildTrackDiagnosticSnapshot = buildTrackDiagnosticSnapshot;
    buildTrackDiagnosticSnapshot = function divergentTrackDiagnosticSnapshot(record){
      const base = window.__originalBuildTrackDiagnosticSnapshot(record);
      return {
        ...base,
        simplifiedState:{
          ...(base && base.simplifiedState || {}),
          canonicalVerdict:'entry',
          visualBucket:'entry',
          tone:'entry'
        }
      };
    };
  });

  try{
    const state = await extractAppTickerState(page, 'TROW');
    expect(state.normalized.trackRenderedCanonicalVerdict, 'rendered Track authority should come from the card badge').toBe('near_entry');
    expect(state.normalized.trackDiagnosticCanonicalVerdict, 'test fixture should force diagnostic divergence').toBe('entry');
    expect(state.normalized.trackDiagnosticMatchesRenderedAuthority, 'helper must expose rendered/diagnostic mismatch').toBe(false);
    expect(state.normalized.trackCanonicalVerdict, 'normalized Track authority must prefer rendered card authority').toBe(state.normalized.trackRenderedCanonicalVerdict);
  }finally{
    await page.evaluate(() => {
      if(window.__originalBuildTrackDiagnosticSnapshot){
        buildTrackDiagnosticSnapshot = window.__originalBuildTrackDiagnosticSnapshot;
        delete window.__originalBuildTrackDiagnosticSnapshot;
      }
    });
  }
});

test('paper trade ignores Entry verdict when canonical plan authority is not actionable', async ({page}) => {
  await bootApp(page);
  await seedCanonicalWatchWithValidPlan(page);

  const context = await page.evaluate(() => {
    const originalResolveCanonicalTradePlanAuthority = resolveCanonicalTradePlanAuthority;
    resolveCanonicalTradePlanAuthority = function patchedResolveCanonicalTradePlanAuthority(inputs){
      const base = originalResolveCanonicalTradePlanAuthority(inputs);
      if(inputs && inputs.context === 'paper_trade_context'){
        return {
          ...base,
          verdict:'entry',
          planStatus:'invalid',
          actionable:false,
          riskFits:true,
          capitalAffordable:true,
          tradeabilityActionable:true,
          terminalAvoid:false,
          structuralWeakness:false,
          planFieldsPresent:true,
          reasonCode:'plan_not_valid'
        };
      }
      return base;
    };
    try{
      setActiveReviewTicker('TROW');
      return currentPaperTradeContextForTicker('TROW');
    }finally{
      resolveCanonicalTradePlanAuthority = originalResolveCanonicalTradePlanAuthority;
    }
  });

  expect(context && context.debugSnapshot && context.debugSnapshot.planAuthority && context.debugSnapshot.planAuthority.verdict, 'test fixture should expose Entry verdict authority').toBe('entry');
  expect(context && context.debugSnapshot && context.debugSnapshot.planAuthority && context.debugSnapshot.planAuthority.actionable, 'plan authority is deliberately non-actionable').toBe(false);
  expect(context && context.finalVerdict, 'Entry verdict alone must not force Paper Trade Entry').not.toBe('Entry');
  expect(context && context.eligibility && context.eligibility.eligible, 'non-actionable Entry verdict must not enable Paper Trade').toBe(false);
  expect(context && context.debugSnapshot && context.debugSnapshot.blockerReason, 'non-actionable Entry verdict must not clear blockers').not.toBe('');
});

test('visible Paper Trade stays disabled when Entry presentation lacks actionable plan authority', async ({page}) => {
  await bootApp(page);
  await seedCanonicalWatchWithValidPlan(page);

  const result = await page.evaluate(() => {
    const record = getTickerRecord('TROW');
    record.plan.tradeability = 'tradable';
    record.plan.capitalFit = {
      capital_fit:'acceptable',
      capital_note:'Capital fit confirmed.',
      position_cost:510,
      quote_currency:'GBP',
      fx_status:'native'
    };
    trading212PaperAvailabilityChecked = true;
    trading212PaperEnabled = true;
    trading212PaperAvailabilityMessage = 'Paper gateway ready.';
    uiState.activeReviewSourceProjectionSnapshot = projectionSnapshotWithAuthority({
      ticker:'TROW',
      canonicalVerdict:'entry',
      finalVerdict:'entry',
      renderedVerdict:'entry',
      visualBucket:'entry',
      sourceOfTruthVisualBucket:'entry',
      renderedBucket:'entry',
      tone:'entry',
      decisionSummary:'Entry Ready',
      actionGuidance:'Execute only if the trigger remains valid.'
    }, record, {
      authority:{version:1, source:'manual'}
    });
    uiState.activeReviewProjectionSource = 'clicked_card_snapshot';
    setActiveReviewTicker('TROW');
    const originalResolveCanonicalTradePlanAuthority = resolveCanonicalTradePlanAuthority;
    resolveCanonicalTradePlanAuthority = function patchedResolveCanonicalTradePlanAuthority(inputs){
      const base = originalResolveCanonicalTradePlanAuthority(inputs);
      if(inputs && inputs.context === 'review_render_paper_trade'){
        return {
          ...base,
          verdict:'entry',
          planStatus:'valid',
          actionable:false,
          riskFits:true,
          capitalAffordable:true,
          tradeabilityActionable:true,
          terminalAvoid:false,
          structuralWeakness:false,
          planFieldsPresent:true,
          reasonCode:'verdict_not_entry'
        };
      }
      return base;
    };
    try{
      renderReviewWorkspace({source:'visible_paper_trade_authority_regression'});
      const button = document.querySelector('#paperTradeBtn');
      const reason = document.querySelector('#paperTradeDisabledReason');
      return {
        disabled:button ? button.disabled === true : null,
        reason:String(reason && reason.textContent || '').trim()
      };
    }finally{
      resolveCanonicalTradePlanAuthority = originalResolveCanonicalTradePlanAuthority;
    }
  });

  expect(result.disabled, 'visible Paper Trade must require actionable canonical plan authority').toBe(true);
  expect(result.reason, 'disabled Paper Trade should keep the canonical authority blocker visible').toContain('resolver still blocks Entry');
});

test('clicked Review Entry presentation cannot make Paper Trade plan authority actionable', async ({page}) => {
  await bootApp(page);
  await seedCanonicalWatchWithValidPlan(page);

  const result = await page.evaluate(async () => {
    const record = getTickerRecord('TROW');
    record.plan.tradeability = 'tradable';
    record.plan.capitalFit = {
      capital_fit:'acceptable',
      capital_note:'Capital fit confirmed.',
      position_cost:510,
      quote_currency:'GBP',
      fx_status:'native'
    };
    trading212PaperAvailabilityChecked = true;
    trading212PaperEnabled = true;
    trading212PaperAvailabilityMessage = 'Paper gateway ready.';
    uiState.activeReviewSourceProjectionSnapshot = projectionSnapshotWithAuthority({
      ticker:'TROW',
      canonicalVerdict:'entry',
      finalVerdict:'entry',
      renderedVerdict:'entry',
      visualBucket:'entry',
      sourceOfTruthVisualBucket:'entry',
      renderedBucket:'entry',
      tone:'entry',
      decisionSummary:'Entry Ready',
      actionGuidance:'Execute only if the trigger remains valid.'
    }, record, {
      authority:{version:1, source:'manual'}
    });
    uiState.activeReviewProjectionSource = 'clicked_card_snapshot';
    setActiveReviewTicker('TROW');
    const observedAuthorities = [];
    const originalResolveCanonicalTradePlanAuthority = resolveCanonicalTradePlanAuthority;
    resolveCanonicalTradePlanAuthority = function observedResolveCanonicalTradePlanAuthority(inputs){
      const result = originalResolveCanonicalTradePlanAuthority(inputs);
      if(inputs && (inputs.context === 'review_render_paper_trade' || inputs.context === 'paper_trade_context')){
        observedAuthorities.push({
          context:inputs.context,
          verdict:result.verdict,
          planStatus:result.planStatus,
          actionable:result.actionable === true,
          reasonCode:result.reasonCode
        });
      }
      return result;
    };
    try{
      renderReviewWorkspace({source:'paper_trade_projection_entry_live_watch_regression'});
      const button = document.querySelector('#paperTradeBtn');
      const tradeStatus = String(document.querySelector('#tradeStatusBox') && document.querySelector('#tradeStatusBox').textContent || '').trim();
      const context = currentPaperTradeContextForTicker('TROW');
      openPaperTradePreview('TROW');
      const afterPreview = paperTradeUiStateForTicker('TROW');
      await submitPaperTradeFromReview('TROW');
      const afterSubmit = paperTradeUiStateForTicker('TROW');
      return {
        tradeStatus,
        reviewAuthority:observedAuthorities.find(entry => entry.context === 'review_render_paper_trade') || null,
        contextAuthority:observedAuthorities.find(entry => entry.context === 'paper_trade_context') || null,
        buttonDisabled:button ? button.disabled === true : null,
        finalVerdict:context && context.finalVerdict,
        eligible:context && context.eligibility && context.eligibility.eligible,
        previewOpen:afterPreview && afterPreview.previewOpen === true,
        previewSnapshot:afterPreview && afterPreview.snapshot,
        submitPreviewOpen:afterSubmit && afterSubmit.previewOpen === true,
        submitSnapshot:afterSubmit && afterSubmit.snapshot
      };
    }finally{
      resolveCanonicalTradePlanAuthority = originalResolveCanonicalTradePlanAuthority;
    }
  });

  expect(result.tradeStatus, 'Review may still display the clicked Entry presentation').toContain('Entry Ready');
  expect(result.reviewAuthority && result.reviewAuthority.actionable, 'visible Paper Trade authority must use live resolver verdict, not clicked Entry').toBe(false);
  expect(result.reviewAuthority && result.reviewAuthority.reasonCode, 'projection Entry must not satisfy Paper Trade authority').toBe('verdict_not_entry');
  expect(result.buttonDisabled, 'visible Paper Trade button must remain disabled').toBe(true);
  expect(result.contextAuthority && result.contextAuthority.actionable, 'preview/submit context authority must also stay non-actionable').toBe(false);
  expect(result.finalVerdict, 'preview/submit context must not return Entry').not.toBe('Entry');
  expect(result.eligible, 'preview/submit eligibility must stay false').toBe(false);
  expect(result.previewOpen, 'preview must not open').toBe(false);
  expect(result.previewSnapshot, 'preview must not create an executable snapshot').toBeFalsy();
  expect(result.submitPreviewOpen, 'submit must not reopen preview').toBe(false);
  expect(result.submitSnapshot, 'submit must not create an executable snapshot').toBeFalsy();
});

test('paper trade preview and submit ignore authoritative Review Entry when plan authority is not actionable', async ({page}) => {
  await bootApp(page);
  await seedCanonicalWatchWithValidPlan(page);

  const result = await page.evaluate(async () => {
    const record = getTickerRecord('TROW');
    record.plan.tradeability = 'tradable';
    record.plan.capitalFit = {
      capital_fit:'acceptable',
      capital_note:'Capital fit confirmed.',
      position_cost:510,
      quote_currency:'GBP',
      fx_status:'native'
    };
    trading212PaperAvailabilityChecked = true;
    trading212PaperEnabled = true;
    trading212PaperAvailabilityMessage = 'Paper gateway ready.';
    uiState.activeReviewSourceProjectionSnapshot = projectionSnapshotWithAuthority({
      ticker:'TROW',
      canonicalVerdict:'entry',
      finalVerdict:'entry',
      renderedVerdict:'entry',
      visualBucket:'entry',
      sourceOfTruthVisualBucket:'entry',
      renderedBucket:'entry',
      tone:'entry',
      decisionSummary:'Entry Ready',
      actionGuidance:'Execute only if the trigger remains valid.'
    }, record, {
      authority:{version:1, source:'manual'}
    });
    uiState.activeReviewProjectionSource = 'clicked_card_snapshot';
    setActiveReviewTicker('TROW');
    const originalResolveCanonicalTradePlanAuthority = resolveCanonicalTradePlanAuthority;
    resolveCanonicalTradePlanAuthority = function patchedResolveCanonicalTradePlanAuthority(inputs){
      const base = originalResolveCanonicalTradePlanAuthority(inputs);
      if(inputs && (inputs.context === 'review_render_paper_trade' || inputs.context === 'paper_trade_context')){
        return {
          ...base,
          verdict:'entry',
          planStatus:'valid',
          actionable:false,
          riskFits:true,
          capitalAffordable:true,
          tradeabilityActionable:true,
          terminalAvoid:false,
          structuralWeakness:false,
          planFieldsPresent:true,
          reasonCode:'resolver_blocks_entry'
        };
      }
      return base;
    };
    try{
      renderReviewWorkspace({source:'paper_trade_context_authority_regression'});
      const button = document.querySelector('#paperTradeBtn');
      const context = currentPaperTradeContextForTicker('TROW');
      openPaperTradePreview('TROW');
      const afterPreview = paperTradeUiStateForTicker('TROW');
      await submitPaperTradeFromReview('TROW');
      const afterSubmit = paperTradeUiStateForTicker('TROW');
      return {
        buttonDisabled:button ? button.disabled === true : null,
        finalVerdict:context && context.finalVerdict,
        eligible:context && context.eligibility && context.eligibility.eligible,
        previewOpen:afterPreview && afterPreview.previewOpen === true,
        previewSnapshot:afterPreview && afterPreview.snapshot,
        submitState:afterSubmit && afterSubmit.state,
        submitPreviewOpen:afterSubmit && afterSubmit.previewOpen === true,
        submitSnapshot:afterSubmit && afterSubmit.snapshot
      };
    }finally{
      resolveCanonicalTradePlanAuthority = originalResolveCanonicalTradePlanAuthority;
    }
  });

  expect(result.buttonDisabled, 'visible button must remain disabled').toBe(true);
  expect(result.finalVerdict, 'paper trade context must not fall back to Review Entry presentation').not.toBe('Entry');
  expect(result.eligible, 'preview context must remain ineligible').toBe(false);
  expect(result.previewOpen, 'preview must not open without actionable plan authority').toBe(false);
  expect(result.previewSnapshot, 'preview must not create an executable snapshot').toBeFalsy();
  expect(result.submitPreviewOpen, 'submit must not reopen preview without actionable authority').toBe(false);
  expect(result.submitSnapshot, 'submit must not create an executable snapshot').toBeFalsy();
});

test('switching active review ticker does not rewrite unstamped plans', async ({page}) => {
  await bootApp(page);

  const result = await page.evaluate(() => {
    const first = upsertTickerRecord('PLAN');
    upsertTickerRecord('SAFE');
    first.plan.entry = 101.5;
    first.plan.stop = 98.2;
    first.plan.firstTarget = 110.4;
    first.plan.status = 'valid';
    first.plan.source = 'manual';
    first.plan.tradeability = 'tradable';
    first.plan.riskStatus = 'fits_risk';
    first.plan.authorityVersion = '';
    first.plan.authoritySource = '';
    first.plan.authorityReason = '';
    delete first.plan.writtenAt;
    delete first.plan.writtenBy;
    const before = {
      entry:first.plan.entry,
      stop:first.plan.stop,
      firstTarget:first.plan.firstTarget,
      status:first.plan.status
    };
    setActiveReviewTicker('PLAN');
    setActiveReviewTicker('SAFE');
    const afterRecord = getTickerRecord('PLAN');
    return {
      before,
      after:{
        entry:afterRecord && afterRecord.plan && afterRecord.plan.entry,
        stop:afterRecord && afterRecord.plan && afterRecord.plan.stop,
        firstTarget:afterRecord && afterRecord.plan && afterRecord.plan.firstTarget,
        status:afterRecord && afterRecord.plan && afterRecord.plan.status
      }
    };
  });

  expect(result.after).toEqual(result.before);
});

test('unstamped track projection snapshot cannot force Review into Entry', async ({page}) => {
  await bootApp(page);
  await seedCanonicalWatchWithValidPlan(page);

  const result = await page.evaluate(() => {
    const record = getTickerRecord('TROW');
    uiState.activeReviewSourceProjectionSnapshot = {
      ticker:'TROW',
      canonicalVerdict:'entry',
      finalVerdict:'entry',
      renderedVerdict:'entry',
      visualBucket:'entry',
      sourceOfTruthVisualBucket:'entry',
      renderedBucket:'entry',
      tone:'entry',
      decisionSummary:'Entry Ready',
      actionGuidance:'Execute only if the trigger remains valid.'
    };
    uiState.activeReviewProjectionSource = 'track_projection_updated';
    setActiveReviewTicker('TROW');
    renderReviewWorkspace({source:'unstamped_track_projection_regression'});
    const reviewStateHealth = currentReviewStateHealthSnapshot(record);
    return {
      sourceOfTruth:String(reviewStateHealth && reviewStateHealth.sourceOfTruth || ''),
      canonicalVerdict:String(reviewStateHealth && reviewStateHealth.canonicalVerdict || ''),
      visualBucket:String(reviewStateHealth && reviewStateHealth.visualBucket || ''),
      tradeStatus:String(document.querySelector('#tradeStatusBox') && document.querySelector('#tradeStatusBox').textContent || '').trim()
    };
  });

  expect(String(result.sourceOfTruth || '').trim().toLowerCase()).not.toBe('review_projection_snapshot');
  expect(String(result.canonicalVerdict || '').trim().toLowerCase()).not.toBe('entry');
  expect(String(result.visualBucket || '').trim().toLowerCase()).not.toBe('entry');
});
