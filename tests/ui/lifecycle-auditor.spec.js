const {test, expect} = require('@playwright/test');
const {
  attachConsoleRecorder,
  captureStage,
  gotoApp,
  waitForAppReady,
  dismissOptionalOverlays,
  addActiveReviewToWatchlistIfEligible,
  openTrackTab,
  openWorkspaceTab,
  reloadApp,
  waitForUiTransitionSettle
} = require('./helpers/app-driver');
const {
  captureLifecycleSnapshot,
  buildTransitionReport,
  buildForensicFindings
} = require('./helpers/lifecycle-auditor');
const {writeJsonReport, writeArtifactJson} = require('./helpers/report');

const JOURNEY_TICKER = 'TROW';
const API_PATH_PATTERN = /^\/(?:api|\.netlify\/functions)\//i;
const API_TARGET_PATTERN = /(trade-execution|paper-trade|tracked-state|market-data)/i;

async function attachNetworkRecorder(page){
  const events = [];
  const shouldTrack = url => {
    let parsedUrl = null;
    try{
      parsedUrl = new URL(String(url || ''));
    }catch(_error){
      return false;
    }
    return API_PATH_PATTERN.test(parsedUrl.pathname || '')
      && API_TARGET_PATTERN.test(parsedUrl.pathname || '');
  };
  const push = entry => {
    events.push({
      ...entry,
      timestamp:new Date().toISOString()
    });
  };
  page.on('request', request => {
    const url = request.url();
    if(!shouldTrack(url)) return;
    push({
      type:'request',
      method:request.method(),
      url,
      postData:request.postData() || ''
    });
  });
  page.on('response', async response => {
    const url = response.url();
    if(!shouldTrack(url)) return;
    let body = '';
    try{
      body = await response.text();
    }catch(_error){}
    push({
      type:'response',
      status:response.status(),
      url,
      body
    });
  });
  page.on('requestfailed', request => {
    const url = request.url();
    if(!shouldTrack(url)) return;
    push({
      type:'requestfailed',
      method:request.method(),
      url,
      errorText:request.failure() && request.failure().errorText || 'requestfailed'
    });
  });
  return events;
}

async function stubPaperTradeGateway(page){
  await page.route(/\/(?:api|\.netlify\/functions)\//i, async route => {
    const requestUrl = route.request().url();
    let parsedUrl = null;
    try{
      parsedUrl = new URL(requestUrl);
    }catch(_error){
      await route.abort();
      return;
    }
    const pathname = String(parsedUrl.pathname || '');
    if(!API_PATH_PATTERN.test(pathname) || !API_TARGET_PATTERN.test(pathname)){
      await route.fallback();
      return;
    }
    if(/market-data/i.test(pathname)){
      await route.fulfill({
        status:200,
        contentType:'application/json',
        body:JSON.stringify({
          ok:true,
          symbol:'SPY',
          price:600,
          previousClose:598,
          ma20:595,
          ma50:590,
          ma200:560,
          volume:1000000,
          avgVolume:900000,
          provider:'stub'
        })
      });
      return;
    }
    if(/tracked-state/i.test(pathname)){
      await route.fulfill({
        status:200,
        contentType:'application/json',
        body:JSON.stringify({
          ok:true,
          records:[],
          updatedAt:new Date().toISOString()
        })
      });
      return;
    }
    await route.fulfill({
      status:200,
      contentType:'application/json',
      body:JSON.stringify({
        ok:true,
        broker:'trading212',
        orderId:'PT-LIFECYCLE-001',
        clientOrderId:'pbp-lifecycle-001'
      })
    });
  });
}

async function bootLifecycleApp(page){
  await gotoApp(page);
  await waitForAppReady(page);
  await page.evaluate(() => {
    try{
      localStorage.clear();
      sessionStorage.clear();
    }catch(_error){}
    if(typeof resetAllData === 'function') resetAllData();
  });
  await page.reload({waitUntil:'domcontentloaded'});
  await waitForAppReady(page);
  await dismissOptionalOverlays(page);
}

async function reloadLifecycleApp(page, ticker = ''){
  await page.reload({waitUntil:'domcontentloaded'});
  await waitForLifecycleAppReady(page, ticker);
  const skipButton = page.getByRole('button', {name:'Skip'});
  if(await skipButton.count()){
    try{
      if(await skipButton.isVisible()) await skipButton.click();
    }catch(_error){}
  }
  if(ticker){
    await openWorkspaceTab(page, 'review');
    await page.waitForFunction(symbol => {
      return typeof activeReviewTicker === 'function' && activeReviewTicker() === symbol;
    }, String(ticker || '').trim().toUpperCase(), {timeout:10000});
    await waitForUiTransitionSettle(page);
  }
}

async function waitForLifecycleAppReady(page, ticker = ''){
  const normalizedTicker = String(ticker || '').trim().toUpperCase();
  const waitForCanonicalStartupHydration = async () => {
    try{
      await page.waitForFunction(() => {
        if(typeof startupDebugRenderState !== 'function') return false;
        const ready = startupDebugRenderState();
        return !!(
          document.getElementById('buildBtn')
          && document.querySelector('[data-workspace-tab="scan"]')
          && ready
          && ready.localStateLoaded === true
          && ready.canonicalStateHydrated === true
        );
      }, null, {timeout:30000});
    }catch(error){
      const diagnostic = await page.evaluate(() => {
        const storage = {};
        try{
          for(let index = 0; index < localStorage.length; index += 1){
            const storageKey = localStorage.key(index);
            storage[storageKey] = localStorage.getItem(storageKey);
          }
        }catch(_error){}
        return {
          hasStartupDebugRenderState:typeof startupDebugRenderState === 'function',
          startupDebugRenderState:(() => {
            try{
              return typeof startupDebugRenderState === 'function' ? startupDebugRenderState() : null;
            }catch(runtimeError){
              return {error:String(runtimeError && runtimeError.message || runtimeError || 'startup_debug_failed')};
            }
          })(),
          bodyText:String(document.body && document.body.innerText || '').slice(0, 800),
          localStorageKeys:Object.keys(storage),
          persistedState:storage
        };
      }).catch(() => ({evaluateFailed:true}));
      throw new Error(`startup_canonical_hydration_timeout ${JSON.stringify(diagnostic)}`);
    }
    return true;
  };
  const waitForTickerLifecycleRehydrate = async () => {
    if(!normalizedTicker) return false;
    await page.waitForFunction(symbol => {
      const record = typeof getTickerRecord === 'function' ? getTickerRecord(symbol) : null;
      if(!record) return false;
      const reviewStateHealth = typeof currentReviewStateHealthSnapshot === 'function'
        ? currentReviewStateHealthSnapshot(record)
        : null;
      const paperTradeContext = typeof currentPaperTradeContextForTicker === 'function'
        ? currentPaperTradeContextForTicker(symbol)
        : null;
      return !!(
        document.getElementById('buildBtn')
        && document.querySelector('[data-workspace-tab="scan"]')
        && reviewStateHealth
        && String(reviewStateHealth.canonicalVerdict || '').trim()
        && paperTradeContext
        && String(paperTradeContext.finalVerdict || '').trim()
      );
    }, normalizedTicker, {timeout:30000});
    return true;
  };
  const waitForPaperTradeRehydrate = async () => {
    if(!normalizedTicker) return false;
    try{
      await page.waitForFunction(symbol => {
      const record = typeof getTickerRecord === 'function' ? getTickerRecord(symbol) : null;
      if(!record) return false;
      const completedAt = String(state && state.paperTradeTesterSetupCompletedAt || '').trim();
      const gateway = typeof tradeGatewayHealthModel === 'function' ? tradeGatewayHealthModel() : null;
      const context = typeof currentPaperTradeContextForTicker === 'function'
        ? currentPaperTradeContextForTicker(symbol)
        : null;
      const button = document.getElementById('paperTradeBtn');
      const disabledReason = String(document.getElementById('paperTradeDisabledReason') && document.getElementById('paperTradeDisabledReason').textContent || '').trim();
      const statusText = String(document.getElementById('paperTradeStatusLine') && document.getElementById('paperTradeStatusLine').textContent || '').trim();
      const validPlan = !!(context && context.displayedPlan && String(context.displayedPlan.status || '').trim().toLowerCase() === 'valid');
      const entryVerdict = !!(context && String(context.finalVerdict || '').trim().toLowerCase() === 'entry');
      if(!completedAt || !validPlan || !entryVerdict) return true;
      if(!gateway || String(gateway.state || '').trim().toLowerCase() === 'checking') return false;
      return true;
      }, normalizedTicker, {timeout:30000});
    }catch(error){
      const diagnostic = await page.evaluate(symbol => {
        const context = typeof currentPaperTradeContextForTicker === 'function'
          ? currentPaperTradeContextForTicker(symbol)
          : null;
        const gateway = typeof tradeGatewayHealthModel === 'function'
          ? tradeGatewayHealthModel()
          : null;
        const button = document.getElementById('paperTradeBtn');
        return {
          activeWorkspace:typeof activeWorkspaceTab === 'function' ? activeWorkspaceTab() : '',
          activeReviewTicker:typeof activeReviewTicker === 'function' ? activeReviewTicker() : '',
          completedAt:String(state && state.paperTradeTesterSetupCompletedAt || ''),
          gateway,
          context,
          buttonPresent:!!button,
          buttonDisabled:!!(button && button.disabled),
          buttonText:String(button && button.textContent || ''),
          disabledReason:String(document.getElementById('paperTradeDisabledReason') && document.getElementById('paperTradeDisabledReason').textContent || ''),
          statusText:String(document.getElementById('paperTradeStatusLine') && document.getElementById('paperTradeStatusLine').textContent || '')
        };
      }, normalizedTicker).catch(() => ({evaluateFailed:true}));
      throw new Error(`paper_trade_rehydrate_timeout ${JSON.stringify(diagnostic)}`);
    }
    return true;
  };
  try{
    await waitForCanonicalStartupHydration();
    if(normalizedTicker) await waitForTickerLifecycleRehydrate();
    if(normalizedTicker) await waitForPaperTradeRehydrate();
    return;
  }catch(_error){
    if(await waitForTickerLifecycleRehydrate().catch(() => false)){
      if(normalizedTicker) await waitForPaperTradeRehydrate();
      return;
    }
    await waitForCanonicalStartupHydration();
    if(normalizedTicker) await waitForTickerLifecycleRehydrate();
    if(normalizedTicker) await waitForPaperTradeRehydrate();
  }
}

async function waitForLifecycleAuditFunctions(page){
  await page.waitForFunction(() => {
    if(typeof window === 'undefined') return false;
    if(typeof window.upsertTickerRecord !== 'function') return false;
    if(typeof window.refreshViewFromMemory !== 'function') return false;
    if(typeof window.renderReviewWorkspace !== 'function') return false;
    if(typeof window.renderWatchlist !== 'function') return false;
    try{
      return !!window.upsertTickerRecord('__AUDIT_PROBE__');
    }catch(_error){
      return false;
    }
  }, null, {timeout:30000});
}

async function seedLifecycleScenario(page, ticker){
  await page.evaluate(({ticker}) => {
    if(typeof window !== 'undefined' && window && typeof window.state === 'object' && window.state){
      window.state.tickers = [ticker];
      window.state.shortlist = [ticker];
    }
    if(typeof window !== 'undefined' && window && typeof window.uiState === 'object' && window.uiState){
      window.uiState.scannerSessionTickers = [ticker];
      window.uiState.scannerShortlistSuppressed = false;
      window.uiState.scannerLastScanAt = '2026-06-29T09:00:00.000Z';
      window.uiState.activeReviewSourceProjectionSnapshot = {
        ticker,
        canonicalVerdict:'entry',
        finalVerdict:'entry',
        sourceOfTruthVisualBucket:'entry',
        visualBucket:'entry',
        tone:'entry'
      };
      window.uiState.activeReviewProjectionSource = 'clicked_card_snapshot';
    }
    const record = upsertTickerRecord(ticker);
    record.meta.companyName = 'T. Rowe Price Group, Inc.';
    record.meta.exchange = 'NASDAQ';
    record.meta.tradingViewSymbol = `NASDAQ:${ticker}`;
    record.meta.marketStatus = 'S&P above 50 MA';
    record.marketData.currency = 'USD';
    record.marketData.price = 110.27;
    record.marketData.previousClose = 106.34;
    record.marketData.ma20 = 106.727;
    record.marketData.ma50 = 103.852;
    record.marketData.ma200 = 100.9815;
    record.marketData.rsi = 64.82;
    record.marketData.volume = 3831934;
    record.marketData.avgVolume = 2115787.96;
    record.marketData.asOf = '2026-06-29T09:00:00.000Z';
    record.marketData.history = [
      {date:'2026-06-27', open:108.10, high:110.60, low:107.90, close:110.27, volume:3831934}
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
    record.plan.entry = 110.27;
    record.plan.stop = 102.29;
    record.plan.firstTarget = 136.19;
    record.plan.target = 136.19;
    record.plan.source = 'scanner_estimate';
    record.plan.status = 'valid';
    record.plan.riskStatus = 'fits_risk';
    record.plan.tradeability = 'tradable';
    record.plan.triggerState = 'confirmed';
    record.scan.analysisProjection = {
      price:110.27,
      sma20:106.727,
      sma50:103.852,
      sma200:100.9815,
      rr_ratio:'3.25',
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
    record.scan.resolvedVerdict = 'Entry';
    record.scan.verdict = 'Entry';
    record.scan.score = 9;
    record.scan.riskStatus = 'fits_risk';
    record.scan.summary = 'Trend structure is intact, buyers are in control, and the trade plan is ready.';
    record.scan.lastScannedAt = '2026-06-29T09:00:00.000Z';
    record.review.analysisState = {
      normalized:{
        coach_summary:'Constructive setup with buyers in control.'
      }
    };
    record.review.manualReview = {
      entry:110.27,
      stop:102.29,
      target:136.19
    };

    state.paperTradeApiKey = 'paper-key';
    state.paperTradeApiSecret = 'paper-secret';
    state.paperTradeTesterSetupCompletedAt = '2026-06-29T09:00:00.000Z';
    try{ trading212PaperSupported = true; }catch(_error){}
    try{ trading212PaperAvailabilityChecked = true; }catch(_error){}
    try{ trading212PaperEnabled = true; }catch(_error){}
    try{ trading212PaperAvailabilityMessage = 'Paper gateway ready.'; }catch(_error){}

    if(typeof saveState === 'function') saveState();
    if(typeof renderScannerResults === 'function') renderScannerResults();
    if(typeof refreshViewFromMemory === 'function') refreshViewFromMemory();
  }, {ticker});
  await waitForUiTransitionSettle(page);
}

async function captureAuditedStage(page, testInfo, snapshots, ticker, stage, consoleEvents, networkEvents){
  await waitForUiTransitionSettle(page);
  await captureStage(page, testInfo, stage);
  const snapshot = await captureLifecycleSnapshot(page, ticker, stage, consoleEvents, networkEvents);
  snapshots.push(snapshot);
  return snapshot;
}

function assertWatchlistAddedEntryParity(snapshot){
  const stage = snapshot && snapshot.stage || 'watchlist_added';
  const scan = snapshot && snapshot.appState && snapshot.appState.scan && snapshot.appState.scan.simplifiedState || {};
  const shared = snapshot && snapshot.appState && snapshot.appState.authority && snapshot.appState.authority.sharedPresentation || {};
  const replay = snapshot && snapshot.replay && snapshot.replay.result || {};
  const reviewVerdict = String(snapshot && snapshot.appState && snapshot.appState.review && snapshot.appState.review.stateHealth && snapshot.appState.review.stateHealth.canonicalVerdict || '').trim().toLowerCase();
  const replayVerdict = String(replay.reviewCanonicalVerdict || '').trim().toLowerCase();
  const scanVerdict = String(scan.canonicalVerdict || '').trim().toLowerCase();
  const sharedVerdict = String(shared.canonicalVerdict || shared.finalVerdict || '').trim().toLowerCase();
  const scanAction = String(scan.actionLabel || '').trim();
  const sharedAction = String(shared.actionLabel || shared.nextAction || '').trim();
  const staleNearEntryCopy = /near entry|wait for confirmation|waiting for confirmation/i;
  if(replayVerdict === 'entry' || reviewVerdict === 'entry'){
    expect(scanVerdict, `${stage} scan surface must promote to entry when replay/review is entry.`).toBe('entry');
    expect(sharedVerdict, `${stage} shared presentation must promote to entry when replay/review is entry.`).toBe('entry');
    expect(scanAction, `${stage} scan action copy must be entry-ready.`).toBe('Execute only if the trigger remains valid.');
    expect(sharedAction, `${stage} shared presentation action copy must be entry-ready.`).toBe('Execute only if the trigger remains valid.');
    expect(String(scan.badgeLabel || ''), `${stage} scan badge must not preserve Near Entry copy.`).not.toMatch(/Near Entry/i);
    expect(String(shared.badgeLabel || ''), `${stage} shared badge must not preserve Near Entry copy.`).not.toMatch(/Near Entry/i);
    expect(String(shared.headline || ''), `${stage} shared headline must not preserve Near Entry copy.`).not.toMatch(/Near Entry/i);
    expect(String(shared.nextAction || shared.actionLabel || ''), `${stage} shared CTA must not preserve wait-for-confirmation copy.`).not.toMatch(staleNearEntryCopy);
  }
}

function assertPostReloadReviewRehydration(snapshot, baselineSnapshot){
  const stage = snapshot && snapshot.stage || 'post_reload';
  const reviewState = snapshot && snapshot.appState && snapshot.appState.review && snapshot.appState.review.stateHealth || null;
  const reviewVisible = snapshot && snapshot.appState && snapshot.appState.review && snapshot.appState.review.visible || {};
  const paperTradeContext = snapshot && snapshot.appState && snapshot.appState.paperTrade && snapshot.appState.paperTrade.context || null;
  const replay = snapshot && snapshot.replay && snapshot.replay.result || {};
  const shared = snapshot && snapshot.appState && snapshot.appState.authority && snapshot.appState.authority.sharedPresentation || {};
  const startup = snapshot && snapshot.appState && snapshot.appState.startup || {};
  const startupDebug = startup.debugRenderState || {};
  const loadStateTrace = Array.isArray(startupDebug.loadStateTrace) ? startupDebug.loadStateTrace : [];
  const firstFailingStage = loadStateTrace.find(entry => /:fail$/i.test(String(entry && entry.stage || ''))) || null;
  const lastSuccessfulStage = [...loadStateTrace].reverse().find(entry => /:success$|:skipped$|:set$/i.test(String(entry && entry.stage || ''))) || null;
  const trowPresenceByStage = loadStateTrace.map(entry => ({
    stage:entry.stage,
    tickerPresent:entry.tickerPresent === true,
    recordPresent:entry.recordPresent === true
  }));
  expect(Number(startup.tickerRecordCount || 0), `${stage} must restore persisted tickerRecords before reload auditing can continue.`).toBeGreaterThan(0);
  expect(Array.isArray(startup.trackedTickers) && startup.trackedTickers.includes(JOURNEY_TICKER), `${stage} must restore the canonical TROW ticker list.`).toBe(true);
  expect(startup.activeReviewTicker, `${stage} must restore activeReviewTicker from persisted review.cardOpen.`).toBe(JOURNEY_TICKER);
  expect(
    startupDebug.localStateLoaded,
    `${stage} must mark local state as loaded. lastSuccess=${lastSuccessfulStage && lastSuccessfulStage.stage || 'none'} firstFail=${firstFailingStage && firstFailingStage.stage || 'none'} trace=${JSON.stringify(trowPresenceByStage)}`
  ).toBe(true);
  expect(
    startupDebug.canonicalStateHydrated,
    `${stage} must mark canonical startup hydration as complete before Review rebuild. lastSuccess=${lastSuccessfulStage && lastSuccessfulStage.stage || 'none'} firstFail=${firstFailingStage && firstFailingStage.stage || 'none'} trace=${JSON.stringify(trowPresenceByStage)}`
  ).toBe(true);
  expect(reviewState, `${stage} must rebuild review.stateHealth after reload.`).toBeTruthy();
  expect(String(reviewState && reviewState.canonicalVerdict || ''), `${stage} must rebuild Review canonical state after reload.`).toBeTruthy();
  expect(String(reviewVisible.entry || ''), `${stage} must preserve visible Review entry after reload.`).toBeTruthy();
  expect(String(reviewVisible.rr || ''), `${stage} must preserve visible Review RR after reload.`).toBeTruthy();
  expect(paperTradeContext, `${stage} must rebuild Paper Trade context after reload.`).toBeTruthy();
  expect(String(replay.reviewCanonicalVerdict || '').trim().toLowerCase(), `${stage} replay must still expose canonical review verdict.`).toBeTruthy();
  expect(String(reviewState.canonicalVerdict || '').trim().toLowerCase(), `${stage} Review must stay aligned with replay after reload.`)
    .toBe(String(replay.reviewCanonicalVerdict || '').trim().toLowerCase());
  expect(String(reviewState.canonicalVerdict || '').trim().toLowerCase(), `${stage} Review must stay aligned with shared presentation after reload.`)
    .toBe(String(shared.canonicalVerdict || shared.finalVerdict || '').trim().toLowerCase());
  if(baselineSnapshot){
    expect(String(reviewState.canonicalVerdict || '').trim().toLowerCase(), `${stage} must match the pre-reload canonical review verdict.`)
      .toBe(String(baselineSnapshot.appState.review.stateHealth.canonicalVerdict || '').trim().toLowerCase());
    expect(String(reviewVisible.rr || ''), `${stage} must match the pre-reload visible RR.`)
      .toBe(String(baselineSnapshot.appState.review.visible.rr || ''));
  }
}

async function openReviewDirect(page, ticker){
  await page.evaluate(symbol => {
    if(typeof window !== 'undefined' && window && typeof window.uiState === 'object' && window.uiState){
      window.uiState.activeReviewSourceProjectionSnapshot = {
        ticker:symbol,
        canonicalVerdict:'entry',
        finalVerdict:'entry',
        sourceOfTruthVisualBucket:'entry',
        visualBucket:'entry',
        tone:'entry'
      };
      window.uiState.activeReviewProjectionSource = 'clicked_card_snapshot';
    }
    if(typeof setActiveReviewTicker === 'function') setActiveReviewTicker(symbol);
    if(typeof renderReviewWorkspace === 'function') renderReviewWorkspace({source:'lifecycle_auditor', requestedTicker:symbol});
    if(typeof calculate === 'function') calculate({persist:false});
  }, ticker);
  await page.waitForFunction(symbol => {
    return typeof activeReviewTicker === 'function' && activeReviewTicker() === symbol;
  }, ticker, {timeout:10000});
  await openWorkspaceTab(page, 'review');
  await waitForUiTransitionSettle(page);
}

function assertSnapshotConsistency(snapshot){
  const label = `${snapshot.ticker} @ ${snapshot.stage}`;
  if(snapshot.stage !== 'launch_ready'){
    expect(snapshot.appState.review.stateHealth, `${label} missing review stateHealth`).toBeTruthy();
    expect(snapshot.appState.review.stateHealth.canonicalVerdict, `${label} missing canonical verdict`).toBeTruthy();
    expect(snapshot.replay.result, `${label} missing replay result`).toBeTruthy();
    expect(snapshot.replay.result.reviewCanonicalVerdict, `${label} missing replay canonical verdict`).toBeTruthy();
  }
  expect(snapshot.copyConsistency, `${label} copy inconsistencies detected`).toEqual([]);
  expect(snapshot.staleState, `${label} stale-state findings detected`).toEqual([]);
  expect(
    snapshot.authority.duplicates,
    `${label} duplicate authority detected:\n${snapshot.authority.duplicates.map(entry => `${entry.field}: ${JSON.stringify(entry.groups)}`).join('\n')}`
  ).toEqual([]);
  expect(
    snapshot.console.errors,
    `${label} console/page errors detected:\n${snapshot.console.errors.join('\n')}`
  ).toEqual([]);
  const lifecycleEvidence = snapshot.authority && snapshot.authority.lifecycleEvidence
    ? snapshot.authority.lifecycleEvidence
    : null;
  if(snapshot.stage === 'paper_trade_submitted' || lifecycleEvidence && lifecycleEvidence.historyEventState && lifecycleEvidence.historyEventState.hasSubmittedEvent){
    expect(
      lifecycleEvidence && lifecycleEvidence.currentTradePlanState,
      `${label} submitted paper trade must preserve current trade-plan state.`
    ).toBe('valid');
    expect(
      lifecycleEvidence && lifecycleEvidence.paperTradeLifecycleState,
      `${label} paper-trade lifecycle state should report submitted separately from plan validity.`
    ).toBe('submitted');
    expect(
      lifecycleEvidence && lifecycleEvidence.historyEventState && lifecycleEvidence.historyEventState.hasSubmittedEvent,
      `${label} history should record the submitted event.`
    ).toBe(true);
  }
  if(snapshot.stage === 'post_reload'){
    expect(
      lifecycleEvidence && lifecycleEvidence.paperTradeGatewayState,
      `${label} missing paper-trade gateway state after reload.`
    ).not.toBe('checking');
    if(
      lifecycleEvidence
      && lifecycleEvidence.currentTradePlanState === 'valid'
      && lifecycleEvidence.paperTradeEligibilityState
      && lifecycleEvidence.paperTradeEligibilityState.eligible === true
      && lifecycleEvidence.paperTradeGatewayState === 'ready'
    ){
      expect(
        lifecycleEvidence.paperTradeEnabledUiState || /submitted|open/i.test(String(lifecycleEvidence.paperTradeUiReason || '')),
        `${label} canonical Entry + valid plan + gateway ready must enable Paper Trade or clearly expose submitted/open state.`
      ).toBe(true);
    }
  }
}

test('Lifecycle Auditor proves scan-to-diary consistency with replay parity and mutation convergence', async ({page}, testInfo) => {
  let consoleEvents = [];
  let networkEvents = [];
  const stageSnapshots = [];
  await bootLifecycleApp(page);
  consoleEvents = await attachConsoleRecorder(page);
  networkEvents = await attachNetworkRecorder(page);
  await stubPaperTradeGateway(page);
  await captureAuditedStage(page, testInfo, stageSnapshots, JOURNEY_TICKER, 'launch_ready', consoleEvents, networkEvents);

  await seedLifecycleScenario(page, JOURNEY_TICKER);
  await captureAuditedStage(page, testInfo, stageSnapshots, JOURNEY_TICKER, 'ticker_seeded', consoleEvents, networkEvents);
  await captureAuditedStage(page, testInfo, stageSnapshots, JOURNEY_TICKER, 'scan_completed', consoleEvents, networkEvents);

  await openReviewDirect(page, JOURNEY_TICKER);
  await captureAuditedStage(page, testInfo, stageSnapshots, JOURNEY_TICKER, 'review_open', consoleEvents, networkEvents);

  await expect(page.locator('#tradePlanInputs')).not.toHaveClass(/review-hidden/);
  await expect(page.locator('#rrValue')).toContainText('3.25R');
  await captureAuditedStage(page, testInfo, stageSnapshots, JOURNEY_TICKER, 'trade_plan_visible', consoleEvents, networkEvents);

  await expect(page.locator('#paperTradeBtn')).toBeEnabled();
  await captureAuditedStage(page, testInfo, stageSnapshots, JOURNEY_TICKER, 'paper_trade_enabled', consoleEvents, networkEvents);

  const addedToWatchlist = await addActiveReviewToWatchlistIfEligible(page);
  expect(addedToWatchlist, 'Expected Add to Watchlist to be available for lifecycle audit journey.').toBe(true);
  const watchlistAddedSnapshot = await captureAuditedStage(page, testInfo, stageSnapshots, JOURNEY_TICKER, 'watchlist_added', consoleEvents, networkEvents);
  assertWatchlistAddedEntryParity(watchlistAddedSnapshot);

  await page.locator('#paperTradeBtn').click();
  await expect(page.locator('#paperTradePreview')).toBeVisible();
  await captureAuditedStage(page, testInfo, stageSnapshots, JOURNEY_TICKER, 'paper_trade_preview', consoleEvents, networkEvents);

  await page.locator('#paperTradeConfirmBtn').click();
  await page.waitForFunction(() => {
    const node = document.getElementById('paperTradeStatusLine');
    return !!(node && /submitted/i.test(node.textContent || ''));
  }, null, {timeout:15000});
  await captureAuditedStage(page, testInfo, stageSnapshots, JOURNEY_TICKER, 'paper_trade_submitted', consoleEvents, networkEvents);

  await openTrackTab(page);
  await captureAuditedStage(page, testInfo, stageSnapshots, JOURNEY_TICKER, 'track_open', consoleEvents, networkEvents);

  await openWorkspaceTab(page, 'diary');
  await page.waitForFunction(ticker => {
    const tradeDiary = Array.isArray(state.tradeDiary) ? state.tradeDiary : [];
    return tradeDiary.some(entry => String(entry && entry.ticker || '').trim().toUpperCase() === ticker);
  }, JOURNEY_TICKER, {timeout:15000});
  await captureAuditedStage(page, testInfo, stageSnapshots, JOURNEY_TICKER, 'diary_open', consoleEvents, networkEvents);

  const baselineDiarySnapshot = stageSnapshots[stageSnapshots.length - 1];
  const fuzzSequence = ['scan', 'track', 'review', 'scan', 'diary', 'track', 'review'];
  for(let index = 0; index < fuzzSequence.length; index += 1){
    await openWorkspaceTab(page, fuzzSequence[index]);
    await captureAuditedStage(page, testInfo, stageSnapshots, JOURNEY_TICKER, `fuzz_${index + 1}_${fuzzSequence[index]}`, consoleEvents, networkEvents);
  }

  await reloadLifecycleApp(page, JOURNEY_TICKER);
  await captureAuditedStage(page, testInfo, stageSnapshots, JOURNEY_TICKER, 'post_reload', consoleEvents, networkEvents);

  const mutationReports = [];
  for(let index = 1; index < stageSnapshots.length; index += 1){
    mutationReports.push(buildTransitionReport(stageSnapshots[index - 1], stageSnapshots[index]));
  }

  stageSnapshots.forEach(snapshot => {
    assertSnapshotConsistency(snapshot);
  });

  const postReloadSnapshot = stageSnapshots[stageSnapshots.length - 1];
  assertPostReloadReviewRehydration(postReloadSnapshot, baselineDiarySnapshot);
  expect(
    postReloadSnapshot.appState.review.stateHealth.canonicalVerdict,
    'Reload must converge back to the same canonical review verdict.'
  ).toBe(baselineDiarySnapshot.appState.review.stateHealth.canonicalVerdict);
  expect(
    postReloadSnapshot.appState.review.visible.rr,
    'Reload must preserve the visible trade plan RR.'
  ).toBe(baselineDiarySnapshot.appState.review.visible.rr);
  expect(
    (
      postReloadSnapshot.buttons.paperTradeEnabled === baselineDiarySnapshot.buttons.paperTradeEnabled
      || /submitted|open/i.test(String(postReloadSnapshot.authority && postReloadSnapshot.authority.lifecycleEvidence && postReloadSnapshot.authority.lifecycleEvidence.paperTradeUiReason || ''))
    ),
    'Reload must preserve paper-trade availability or clearly expose submitted/open paper-trade state.'
  ).toBe(true);
  expect(
    postReloadSnapshot.appState.diary.entries.length,
    'Reload must preserve the paper-trade diary entry.'
  ).toBeGreaterThan(0);

  const forensicFindings = buildForensicFindings(stageSnapshots);
  const reportPayload = {
    ticker:JOURNEY_TICKER,
    generatedAt:new Date().toISOString(),
    snapshots:stageSnapshots,
    transitions:mutationReports,
    forensicFindings,
    consoleEvents,
    networkEvents
  };
  await writeJsonReport(testInfo, 'lifecycle-auditor-report.json', reportPayload);
  const artifactPath = writeArtifactJson(`lifecycle-auditor-${Date.now()}.json`, reportPayload);
  await testInfo.attach('lifecycle-auditor-artifact-path.txt', {
    body:artifactPath,
    contentType:'text/plain'
  });

  expect(
    forensicFindings,
    forensicFindings.length
      ? `Lifecycle forensic findings:\n${forensicFindings.map(entry => `${entry.transition}: ${entry.issues.map(issue => issue.field || issue.type).join(', ')}`).join('\n')}`
      : ''
  ).toEqual([]);
});
