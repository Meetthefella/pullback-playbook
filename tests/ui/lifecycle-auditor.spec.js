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
  buildAuthoritySummary,
  buildTransitionReport,
  buildForensicFindings,
  normalizeActionState
} = require('./helpers/lifecycle-auditor');
const {writeJsonReport, writeArtifactJson} = require('./helpers/report');

const JOURNEY_TICKER = String(process.env.PP_JOURNEY_TICKER || 'TROW').trim().toUpperCase() || 'TROW';
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
  await page.route(/https:\/\/maker\.ifttt\.com\//i, async route => {
    await route.fulfill({
      status:200,
      contentType:'application/json',
      body:JSON.stringify({ok:true, provider:'ifttt-test-stub'})
    });
  });
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
    const normalizedTicker = String(ticker || '').trim().toUpperCase();
    try{
      await page.waitForFunction(symbol => {
        return typeof activeReviewTicker === 'function' && activeReviewTicker() === symbol;
      }, normalizedTicker, {timeout:2500});
    }catch(_error){
      const resumeButton = page.locator(`[data-act="resume-review"][data-ticker="${normalizedTicker}"]`).first();
      if(await resumeButton.count()){
        await resumeButton.click();
      }
      await page.waitForFunction(symbol => {
        return typeof activeReviewTicker === 'function' && activeReviewTicker() === symbol;
      }, normalizedTicker, {timeout:10000});
    }
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
    state.tickers = [ticker];
    state.shortlist = [ticker];
    uiState.scannerSessionTickers = [ticker];
    uiState.scannerShortlistSuppressed = false;
    uiState.scannerLastScanAt = '2026-06-29T09:00:00.000Z';
    const record = upsertTickerRecord(ticker);
    record.meta.companyName = 'T. Rowe Price Group, Inc.';
    record.meta.exchange = 'LSE';
    record.meta.tradingViewSymbol = `LSE:${ticker}`;
    record.meta.marketStatus = 'S&P above 50 MA';
    record.marketData.currency = 'GBP';
    record.marketData.price = 75;
    record.marketData.previousClose = 72.4;
    record.marketData.ma20 = 73.2;
    record.marketData.ma50 = 70.1;
    record.marketData.ma200 = 64.8;
    record.marketData.rsi = 64.82;
    record.marketData.volume = 1200000;
    record.marketData.avgVolume = 1000000;
    record.marketData.asOf = '2026-06-29T09:00:00.000Z';
    record.marketData.history = [
      {date:'2026-06-27', open:73.1, high:75.3, low:72.8, close:75, volume:1200000}
    ];
    record.strongBullishReversal = true;
    record.strongBullishContinuation = true;
    record.breaksLocalHigh = true;
    record.reclaimAttempt = true;
    record.reclaimsLevel = true;
    record.setup.structureState = 'strong';
    record.setup.structureEligibility = 'alive';
    record.setup.setupLocationState = 'near_20ma';
    record.setup.pullbackZone = 'near_20ma';
    record.setup.priceabilityState = 'priceable';
    record.setup.bounceState = 'confirmed';
    record.setup.stabilisationState = 'clear';
    record.setup.volumeState = 'supportive';
    record.setup.trendState = 'strong';
    record.plan.entry = 75;
    record.plan.stop = 72;
    record.plan.firstTarget = 84;
    record.plan.target = 84;
    record.plan.source = 'scanner_estimate';
    record.plan.status = 'valid';
    record.plan.riskStatus = 'fits_risk';
    record.plan.tradeability = 'tradable';
    record.plan.triggerState = 'confirmed';
    record.plan.authoritySource = 'resolver';
    record.plan.authorityVersion = 'trade_plan_v1';
    record.plan.authorityReason = 'lifecycle_auditor_seed';
    record.plan.writtenBy = 'lifecycle-auditor.spec';
    record.plan.writtenAt = '2026-06-29T09:00:00.000Z';
    record.scan.analysisProjection = {
      price:75,
      sma20:73.2,
      sma50:70.1,
      sma200:64.8,
      rr_ratio:'3.00',
      risk_status:'fits_risk',
      derived_states:{
        trend_state:'strong',
        pullback_zone:'near_20ma',
        setup_location_state:'near_20ma',
        priceability_state:'priceable',
        structure_state:'strong',
        stabilisation_state:'clear',
        bounce_state:'confirmed',
        volume_state:'supportive',
        candle_evidence_reclaim_range_meaningful:'yes',
        candle_evidence_reclaimed_prior_day_high:'yes',
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
      entry:75,
      stop:72,
      target:84
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
  const scanAuthority = snapshot && snapshot.appState && snapshot.appState.authority && snapshot.appState.authority.scanner || {};
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
    expect(scanVerdict, `${stage} scan surface must stay scouting-only once canonical review authority exists.`).toBe('near_entry');
    expect(scanAuthority.scoutingOnly, `${stage} scan diagnostics must mark the scouting-only cap explicitly.`).toBe(true);
    expect(String(scanAuthority.divergenceType || '').trim().toLowerCase(), `${stage} scan diagnostics must expose intentional scouting divergence.`).toBe('intentional_scouting_divergence');
    expect(sharedVerdict, `${stage} shared presentation must promote to entry when replay/review is entry.`).toBe('entry');
    expect(scanAction, `${stage} scan action copy must stay non-final.`).toBe('Scouting only - confirm in Review before treating this as actionable.');
    expect(sharedAction, `${stage} shared presentation action copy must be entry-ready.`).toBe('Execute only if the trigger remains valid.');
    expect(String(scan.badgeLabel || ''), `${stage} scan badge should present a capped scouting label.`).toMatch(/Near Entry/i);
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
  const trackDiagnostics = snapshot && snapshot.appState && snapshot.appState.track && snapshot.appState.track.diagnostics || null;
  const lifecycleEvidence = snapshot && snapshot.authority && snapshot.authority.lifecycleEvidence || null;
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
  expect(Array.isArray(startup.trackedTickers) && startup.trackedTickers.includes(JOURNEY_TICKER), `${stage} must restore the canonical ${JOURNEY_TICKER} ticker list.`).toBe(true);
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
  if(trackDiagnostics && String(trackDiagnostics.canonicalVerdict || '').trim()){
    expect(String(reviewState.canonicalVerdict || '').trim().toLowerCase(), `${stage} Review must stay aligned with Track after reload.`)
      .toBe(String(trackDiagnostics && trackDiagnostics.canonicalVerdict || '').trim().toLowerCase());
  }
  expect(String(reviewState.canonicalVerdict || '').trim().toLowerCase(), `${stage} Review must stay aligned with shared presentation after reload.`)
    .toBe(String(shared.canonicalVerdict || shared.finalVerdict || '').trim().toLowerCase());
  const paperTradeFinalVerdict = String(paperTradeContext && paperTradeContext.finalVerdict || '').trim().toLowerCase();
  const paperTradeLifecycleState = String(lifecycleEvidence && lifecycleEvidence.paperTradeLifecycleState || '').trim().toLowerCase();
  if(
    paperTradeFinalVerdict
    && !/submitted|open/i.test(String(reviewVisible.reviewStatus || ''))
    && !['submitted', 'open'].includes(paperTradeLifecycleState)
  ){
    expect(String(reviewState.canonicalVerdict || '').trim().toLowerCase(), `${stage} Paper Trade must stay aligned with canonical review verdict after reload.`)
      .toBe(paperTradeFinalVerdict);
  }
  if(baselineSnapshot){
    expect(String(reviewState.canonicalVerdict || '').trim().toLowerCase(), `${stage} must match the pre-reload canonical review verdict.`)
      .toBe(String(baselineSnapshot.appState.review.stateHealth.canonicalVerdict || '').trim().toLowerCase());
    expect(String(reviewVisible.rr || ''), `${stage} must match the pre-reload visible RR.`)
      .toBe(String(baselineSnapshot.appState.review.visible.rr || ''));
  }
}

async function openReviewDirect(page, ticker){
  await page.evaluate(symbol => {
    const record = typeof getTickerRecord === 'function' ? getTickerRecord(symbol) : null;
    uiState.activeReviewSourceProjectionSnapshot = projectionSnapshotWithAuthority({
      ticker:symbol,
      canonicalVerdict:'entry',
      finalVerdict:'entry',
      sourceOfTruthVisualBucket:'entry',
      visualBucket:'entry',
      tone:'entry'
    }, record, {
      authority:{version:1, source:'manual'}
    });
    uiState.activeReviewProjectionSource = 'clicked_card_snapshot';
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

async function installReviewRenderCallCounter(page){
  await page.evaluate(() => {
    if(typeof window === 'undefined' || typeof window.renderReviewWorkspace !== 'function') return;
    if(window.__auditRenderReviewWorkspaceWrapped === true) return;
    const original = window.renderReviewWorkspace;
    window.__auditRenderReviewWorkspaceCalls = 0;
    window.renderReviewWorkspace = function(...args){
      window.__auditRenderReviewWorkspaceCalls = Number(window.__auditRenderReviewWorkspaceCalls || 0) + 1;
      return original.apply(this, args);
    };
    window.__auditRenderReviewWorkspaceWrapped = true;
  });
}

async function readReviewRenderCallCounter(page){
  return page.evaluate(() => Number(window.__auditRenderReviewWorkspaceCalls || 0));
}

async function captureReviewDomFingerprint(page){
  return page.evaluate(() => {
    const safeText = value => String(value || '').replace(/\s+/g, ' ').trim();
    return {
      entry:safeText(document.getElementById('entryPrice') && document.getElementById('entryPrice').value),
      stop:safeText(document.getElementById('stopPrice') && document.getElementById('stopPrice').value),
      target:safeText(document.getElementById('targetPrice') && document.getElementById('targetPrice').value),
      rr:safeText(document.getElementById('rrValue') && document.getElementById('rrValue').textContent),
      tradeStatus:safeText(document.getElementById('tradeStatusBox') && document.getElementById('tradeStatusBox').textContent),
      nextAction:safeText(document.getElementById('reviewNextActionInline') && document.getElementById('reviewNextActionInline').textContent)
    };
  });
}

async function captureReviewPersistenceGuardState(page, ticker){
  return page.evaluate(symbol => {
    const record = typeof getTickerRecord === 'function' ? getTickerRecord(symbol) : null;
    return {
      savedVerdict:String(record && record.review && record.review.savedVerdict || ''),
      savedProjectionVerdict:String(
        record
        && record.review
        && record.review.savedProjectionSnapshot
        && (
          record.review.savedProjectionSnapshot.canonicalVerdict
          || record.review.savedProjectionSnapshot.finalVerdict
          || ''
        )
        || ''
      ),
      scanVerdict:String(record && record.scan && record.scan.verdict || ''),
      scanResolvedVerdict:String(record && record.scan && record.scan.resolvedVerdict || '')
    };
  }, ticker);
}

async function applyExplicitReviewDowngrade(page, ticker){
  await page.evaluate(({ticker, updatedAt}) => {
    const record = typeof getTickerRecord === 'function'
      ? (getTickerRecord(ticker) || upsertTickerRecord(ticker))
      : upsertTickerRecord(ticker);
    if(!record) return;
    record.review = record.review && typeof record.review === 'object' ? record.review : {};
    record.review.savedVerdict = 'Watch';
    record.review.savedSummary = 'Downgraded after structure failure.';
    record.review.lastReviewedAt = updatedAt;
    record.review.manualReview = null;
    record.review.draft = null;
    record.review.savedProjectionSnapshot = record.review.savedProjectionSnapshot && typeof record.review.savedProjectionSnapshot === 'object'
      ? {
        ...record.review.savedProjectionSnapshot,
        capturedAt:'2026-07-03T09:00:00.000Z'
      }
      : record.review.savedProjectionSnapshot;
    record.setup.structureState = 'broken';
    record.setup.structureEligibility = 'broken';
    record.setup.bounceState = 'none';
    record.setup.stabilisationState = 'none';
    record.setup.priceabilityState = 'unpriceable';
    record.plan.entry = null;
    record.plan.stop = null;
    record.plan.firstTarget = null;
    record.plan.target = null;
    record.plan.status = 'missing';
    record.plan.invalidatedState = 'Support failed after review.';
    record.plan.riskStatus = 'plan_missing';
    record.plan.tradeability = 'invalid';
    record.scan.resolvedVerdict = 'Watch';
    record.scan.verdict = 'Watch';
    record.scan.updatedAt = updatedAt;
    record.scan.lastScannedAt = updatedAt;
    if(record.scan.analysisProjection && typeof record.scan.analysisProjection === 'object'){
      record.scan.analysisProjection = {
        ...record.scan.analysisProjection,
        derived_states:{
          ...(record.scan.analysisProjection.derived_states || {}),
          structure_state:'broken',
          priceability_state:'unpriceable',
          bounce_state:'none',
          stabilisation_state:'none',
          has_clear_invalidation_level:'no',
          has_priceable_plan:'no',
          entry_defined:'no',
          stop_defined:'no',
          target_defined:'no'
        }
      };
    }
    record.watchlist = record.watchlist && typeof record.watchlist === 'object' ? record.watchlist : {};
    record.watchlist.updatedAt = updatedAt;
    if(typeof refreshTrackedTickerState === 'function'){
      refreshTrackedTickerState(ticker, {
        source:'review_save',
        reason:'explicit_downgrade',
        force:true,
        persist:true
      });
    }
    if(typeof saveState === 'function') saveState();
    if(typeof renderReviewWorkspace === 'function') renderReviewWorkspace({source:'review_save', requestedTicker:ticker});
  }, {ticker, updatedAt:'2026-07-04T10:00:00.000Z'});
  await waitForUiTransitionSettle(page);
}

async function applySavedReviewVerdictDowngrade(page, ticker, verdict = 'Watch'){
  await page.evaluate(({ticker, verdict, updatedAt}) => {
    const record = typeof getTickerRecord === 'function'
      ? (getTickerRecord(ticker) || upsertTickerRecord(ticker))
      : upsertTickerRecord(ticker);
    if(!record) return;
    record.review = record.review && typeof record.review === 'object' ? record.review : {};
    record.review.savedVerdict = verdict;
    record.review.savedSummary = `Manually downgraded to ${verdict}.`;
    record.review.lastReviewedAt = updatedAt;
    record.review.manualReview = {
      ...(record.review.manualReview && typeof record.review.manualReview === 'object' ? record.review.manualReview : {}),
      status:verdict,
      summary:`Manually downgraded to ${verdict}.`,
      savedAt:updatedAt
    };
    if(record.review.savedProjectionSnapshot && typeof record.review.savedProjectionSnapshot === 'object'){
      record.review.savedProjectionSnapshot = {
        ...record.review.savedProjectionSnapshot,
        capturedAt:'2026-07-03T09:00:00.000Z'
      };
    }
    if(record.watchlist && typeof record.watchlist === 'object'){
      record.watchlist.status = verdict;
      record.watchlist.updatedAt = updatedAt;
    }
    if(typeof refreshTrackedTickerState === 'function'){
      refreshTrackedTickerState(ticker, {
        source:'review_save',
        reason:'manual_soft_downgrade',
        force:true,
        persist:true
      });
    }
    if(typeof saveState === 'function') saveState();
  }, {ticker, verdict, updatedAt:'2026-07-04T10:00:00.000Z'});
  await waitForUiTransitionSettle(page);
}

async function applyScoreRegressionEdit(page, ticker){
  await page.evaluate(symbol => {
    const record = typeof getTickerRecord === 'function'
      ? (getTickerRecord(symbol) || upsertTickerRecord(symbol))
      : upsertTickerRecord(symbol);
    if(!record) return;
    const computeScores = candidateRecord => {
      const derivedStates = typeof analysisDerivedStatesFromRecord === 'function'
        ? analysisDerivedStatesFromRecord(candidateRecord)
        : {};
      const baseScore = typeof computeBaseSetupScoreForRecord === 'function'
        ? computeBaseSetupScoreForRecord(candidateRecord, {derivedStates})
        : null;
      const warningState = typeof warningStateFromInputs === 'function'
        ? warningStateFromInputs(candidateRecord, null, derivedStates)
        : null;
      const qualityAdjustments = typeof evaluateSetupQualityAdjustments === 'function'
        ? evaluateSetupQualityAdjustments(candidateRecord, {
          derivedStates,
          displayedPlan:typeof deriveCurrentPlanState === 'function'
            ? deriveCurrentPlanState(
              candidateRecord.plan && candidateRecord.plan.entry,
              candidateRecord.plan && candidateRecord.plan.stop,
              candidateRecord.plan && candidateRecord.plan.firstTarget,
              candidateRecord.marketData && candidateRecord.marketData.currency
            )
            : null
        })
        : null;
      const displayScore = typeof deriveDisplaySetupScore === 'function'
        ? deriveDisplaySetupScore(candidateRecord, {derivedStates, warningState, qualityAdjustments})
        : null;
      return {
        recomputed:Number.isFinite(baseScore) ? Math.round(baseScore) : null,
        penaltyAdjusted:Number.isFinite(displayScore) ? Math.round(displayScore) : null
      };
    };
    const baseSnapshot = JSON.parse(JSON.stringify(record));
    const candidatePatches = [
      {
        review:{savedVerdict:'Watch', savedSummary:'Checklist edit downgraded conviction.', lastReviewedAt:'2026-07-04T11:00:00.000Z'},
        setup:{structureState:'strong', structureEligibility:'alive', bounceState:'confirmed', stabilisationState:'clear', volumeState:'supportive', setupLocationState:'near_20ma', pullbackZone:'near_20ma'},
        meta:{marketStatus:'S&P above 50 MA'},
        marketData:{price:110.27}
      },
      {
        review:{savedVerdict:'Near Entry', savedSummary:'Checklist edit downgraded conviction.', lastReviewedAt:'2026-07-04T11:00:00.000Z'},
        setup:{structureState:'strong', structureEligibility:'alive', bounceState:'confirmed', stabilisationState:'clear', volumeState:'supportive', setupLocationState:'near_20ma', pullbackZone:'near_20ma'},
        meta:{marketStatus:'S&P above 50 MA'},
        marketData:{price:110.27}
      },
      {
        review:{savedVerdict:'Watch', savedSummary:'Checklist edit downgraded conviction.', lastReviewedAt:'2026-07-04T11:00:00.000Z'},
        setup:{structureState:'strong', structureEligibility:'alive', bounceState:'attempt', stabilisationState:'clear', volumeState:'supportive', setupLocationState:'near_50ma', pullbackZone:'near_50ma'},
        meta:{marketStatus:'S&P below 50 MA'},
        marketData:{price:104.4}
      },
      {
        review:{savedVerdict:'Watch', savedSummary:'Checklist edit downgraded conviction.', lastReviewedAt:'2026-07-04T11:00:00.000Z'},
        setup:{structureState:'developing_clean', structureEligibility:'alive', bounceState:'confirmed', stabilisationState:'clear', volumeState:'supportive', setupLocationState:'near_20ma', pullbackZone:'near_20ma'},
        meta:{marketStatus:'S&P above 50 MA'},
        marketData:{price:109.8}
      }
    ];
    let selectedPatch = candidatePatches[0];
    for(const patch of candidatePatches){
      const candidateRecord = JSON.parse(JSON.stringify(baseSnapshot));
      candidateRecord.review = {...(candidateRecord.review || {}), ...(patch.review || {})};
      candidateRecord.setup = {...(candidateRecord.setup || {}), ...(patch.setup || {})};
      candidateRecord.meta = {...(candidateRecord.meta || {}), ...(patch.meta || {})};
      candidateRecord.marketData = {...(candidateRecord.marketData || {}), ...(patch.marketData || {})};
      const scores = computeScores(candidateRecord);
      if(
        Number.isFinite(scores.recomputed)
        && Number.isFinite(scores.penaltyAdjusted)
        && scores.recomputed > scores.penaltyAdjusted
      ){
        selectedPatch = patch;
        break;
      }
    }
    record.review = {...(record.review && typeof record.review === 'object' ? record.review : {}), ...(selectedPatch.review || {})};
    record.review.savedProjectionSnapshot = null;
    record.setup = {...record.setup, ...(selectedPatch.setup || {})};
    record.meta = {...record.meta, ...(selectedPatch.meta || {})};
    record.marketData = {...record.marketData, ...(selectedPatch.marketData || {})};
    if(typeof uiState !== 'undefined' && uiState && typeof uiState === 'object'){
      uiState.activeReviewSourceProjectionSnapshot = null;
      uiState.activeReviewProjectionSource = 'non_watchlist_direct_resolve';
      uiState.activeReviewVerdictOverride = '';
    }
    if(typeof refreshTrackedTickerState === 'function'){
      refreshTrackedTickerState(symbol, {
        source:'review_save',
        reason:'score_edit_regression',
        force:true,
        persist:false
      });
    }
    if(typeof renderScannerResults === 'function') renderScannerResults();
    if(typeof renderWatchlist === 'function') renderWatchlist({source:'score_edit_regression'});
    if(typeof renderReviewWorkspace === 'function') renderReviewWorkspace({source:'score_edit_regression', requestedTicker:symbol});
  }, ticker);
  await openReviewDirect(page, ticker);
  await waitForUiTransitionSettle(page);
}

async function capturePlannerEditingState(page, ticker){
  return page.evaluate(symbol => {
    const record = typeof getTickerRecord === 'function' ? getTickerRecord(symbol) : null;
    const valueOf = id => {
      const node = document.getElementById(id);
      return node ? String(node.value || '') : '';
    };
    const textOf = id => {
      const node = document.getElementById(id);
      return String(node && node.textContent || '').replace(/\s+/g, ' ').trim();
    };
    return {
      entryInput:valueOf('entryPrice'),
      stopInput:valueOf('stopPrice'),
      targetInput:valueOf('targetPrice'),
      planValidation:String(document.getElementById('planValidationBox') && document.getElementById('planValidationBox').value || ''),
      tradeStatus:textOf('tradeStatusBox'),
      rr:textOf('rrValue'),
      statusLine:textOf('paperTradeStatusLine'),
      reviewPlanValidationState:String(record && record.plan && record.plan.planValidationState || ''),
      persistedStop:record && record.plan && record.plan.stop != null ? String(record.plan.stop) : '',
      persistedEntry:record && record.plan && record.plan.entry != null ? String(record.plan.entry) : '',
      persistedTarget:record && record.plan && record.plan.firstTarget != null ? String(record.plan.firstTarget) : ''
    };
  }, ticker);
}

async function capturePaperTradeDiaryVerdictTrace(page, ticker){
  return page.evaluate(symbol => {
    const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
    const matchTicker = entry => String(entry && entry.ticker || '').trim().toUpperCase() === String(symbol || '').trim().toUpperCase();
    const tradeDiary = Array.isArray(state && state.tradeDiary) ? state.tradeDiary.filter(matchTicker) : [];
    const tickerRecord = typeof getTickerRecord === 'function' ? getTickerRecord(symbol) : null;
    const tickerDiaryRows = tickerRecord && tickerRecord.diary && Array.isArray(tickerRecord.diary.records)
      ? tickerRecord.diary.records.filter(matchTicker)
      : [];
    const reviewState = tickerRecord && typeof currentReviewStateHealthSnapshot === 'function'
      ? currentReviewStateHealthSnapshot(tickerRecord)
      : null;
    const paperTradeContext = typeof currentPaperTradeContextForTicker === 'function'
      ? currentPaperTradeContextForTicker(symbol)
      : null;
    const watchlistPresentation = tickerRecord && tickerRecord.watchlist && tickerRecord.watchlist.presentation && tickerRecord.watchlist.presentation.sharedPresentation
      ? tickerRecord.watchlist.presentation.sharedPresentation
      : null;
    const visibleDiaryBadge = (() => {
      const card = document.querySelector('#tradeDiary .diarycard .badge, #tradeDiary .diaryitem .badge, #tradeDiary .badge');
      return normalize(card && card.textContent);
    })();
    const latestTradeDiary = tradeDiary[0] || null;
    const latestTickerDiary = tickerDiaryRows[0] || null;
    return {
      paperTradeContext:{
        canonicalVerdict:normalize(paperTradeContext && paperTradeContext.canonicalVerdict),
        finalVerdict:normalize(paperTradeContext && paperTradeContext.finalVerdict),
        actionabilityState:normalize(paperTradeContext && paperTradeContext.actionabilityState),
        eligibilityEligible:!!(paperTradeContext && paperTradeContext.eligibility && paperTradeContext.eligibility.eligible === true),
        displayedPlanStatus:normalize(paperTradeContext && paperTradeContext.displayedPlan && paperTradeContext.displayedPlan.status)
      },
      canonicalVerdict:normalize(
        paperTradeContext && paperTradeContext.canonicalVerdict
          ? paperTradeContext.canonicalVerdict
          : (reviewState && reviewState.canonicalVerdict)
      ),
      reviewVerdict:normalize(reviewState && reviewState.canonicalVerdict),
      sharedPresentationVerdict:normalize(watchlistPresentation && (watchlistPresentation.canonicalVerdict || watchlistPresentation.finalVerdict)),
      replayVerdict:normalize(
        tickerRecord && typeof buildReplaySnapshotForTicker === 'function'
          ? (buildReplaySnapshotForTicker(symbol) && buildReplaySnapshotForTicker(symbol).reviewCanonicalVerdict)
          : ''
      ),
      tradePlanState:normalize(reviewState && reviewState.planStatus),
      paperTradeEnabled:!!(document.getElementById('paperTradeBtn') && !document.getElementById('paperTradeBtn').disabled),
      latestTradeDiary:latestTradeDiary ? {
        id:normalize(latestTradeDiary.id),
        ticker:normalize(latestTradeDiary.ticker),
        verdict:normalize(latestTradeDiary.verdict),
        chartVerdict:normalize(latestTradeDiary.chartVerdict),
        status:normalize(latestTradeDiary.status || latestTradeDiary.executionMeta && latestTradeDiary.executionMeta.status),
        sourceType:normalize(latestTradeDiary.sourceType),
        sourceRef:normalize(latestTradeDiary.sourceRef),
        submittedAt:normalize(latestTradeDiary.executionMeta && latestTradeDiary.executionMeta.submittedAt || latestTradeDiary.updatedAt || latestTradeDiary.createdAt),
        plannedEntry:normalize(latestTradeDiary.plannedEntry)
      } : null,
      latestTickerDiary:latestTickerDiary ? {
        id:normalize(latestTickerDiary.id),
        ticker:normalize(latestTickerDiary.ticker),
        verdict:normalize(latestTickerDiary.verdict),
        chartVerdict:normalize(latestTickerDiary.chartVerdict),
        status:normalize(latestTickerDiary.status || latestTickerDiary.executionMeta && latestTickerDiary.executionMeta.status),
        sourceType:normalize(latestTickerDiary.sourceType),
        sourceRef:normalize(latestTickerDiary.sourceRef),
        submittedAt:normalize(latestTickerDiary.executionMeta && latestTickerDiary.executionMeta.submittedAt || latestTickerDiary.updatedAt || latestTickerDiary.createdAt),
        plannedEntry:normalize(latestTickerDiary.plannedEntry)
      } : null,
      visibleDiaryBadge
    };
  }, ticker);
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

test('Lifecycle snapshot capture stays read-only for Review DOM', async ({page}) => {
  await bootLifecycleApp(page);
  await stubPaperTradeGateway(page);
  await seedLifecycleScenario(page, JOURNEY_TICKER);
  await openReviewDirect(page, JOURNEY_TICKER);
  await installReviewRenderCallCounter(page);
  const beforeCalls = await readReviewRenderCallCounter(page);
  const beforeFingerprint = await captureReviewDomFingerprint(page);
  await captureLifecycleSnapshot(page, JOURNEY_TICKER, 'helper_purity', [], []);
  const afterCalls = await readReviewRenderCallCounter(page);
  const afterFingerprint = await captureReviewDomFingerprint(page);
  expect(afterCalls, 'State snapshot helpers must not call renderReviewWorkspace while extracting state.').toBe(beforeCalls);
  expect(afterFingerprint, 'State snapshot helpers must not mutate Review DOM while extracting state.').toEqual(beforeFingerprint);
});

test('Opening and rehydrating Review does not persist saved review or scanner authority', async ({page}) => {
  await bootLifecycleApp(page);
  await stubPaperTradeGateway(page);
  await seedLifecycleScenario(page, JOURNEY_TICKER);
  const beforeOpen = await captureReviewPersistenceGuardState(page, JOURNEY_TICKER);
  expect(beforeOpen.savedVerdict).toBe('');
  expect(beforeOpen.savedProjectionVerdict).toBe('');

  await openReviewDirect(page, JOURNEY_TICKER);
  const afterOpen = await captureReviewPersistenceGuardState(page, JOURNEY_TICKER);
  expect(afterOpen, 'Opening Review must not persist saved review authority or rewrite scanner verdicts.').toEqual(beforeOpen);

  await page.reload({waitUntil:'domcontentloaded'});
  await waitForLifecycleAppReady(page);
  const afterReload = await captureReviewPersistenceGuardState(page, JOURNEY_TICKER);
  expect(afterReload, 'Review reload/rehydrate must not persist saved review authority or rewrite scanner verdicts.').toEqual(beforeOpen);
});

test('reloadLifecycleApp observes native reload only', async () => {
  const helperSource = String(reloadLifecycleApp);
  expect(helperSource, 'reloadLifecycleApp must not repair Review by invoking renderReviewWorkspace after reload.').not.toMatch(/renderReviewWorkspace/);
  expect(helperSource, 'reloadLifecycleApp must not recalculate Review state after reload.').not.toMatch(/calculate\s*\(/);
  expect(helperSource, 'reloadLifecycleApp must not mutate page state via page.evaluate during reload observation.').not.toMatch(/page\.evaluate/);
});

test('lifecycle auditor preserves distinct Paper Trade lifecycle and actionability states', async () => {
  expect(normalizeActionState('ready_to_submit')).toBe('ready_to_submit');
  expect(normalizeActionState('preview_open')).toBe('preview_open');
  expect(normalizeActionState('submitted')).toBe('submitted');
  expect(normalizeActionState('open')).toBe('open');
  expect(normalizeActionState('entry_blocked')).toBe('entry_blocked');
  expect(normalizeActionState('Waiting for confirmation')).toBe('wait_for_confirmation');
  expect(normalizeActionState('Execute only if the trigger remains valid.')).toBe('entry_ready');
});

test('lifecycle auditor keeps Paper Trade lifecycle state separate from replay action readiness', async () => {
  const appState = {
    ticker:'TROW',
    startup:{activeReviewTicker:'TROW'},
    authority:{
      resolver:{canonicalVerdict:'entry', visualBucket:'entry', actionState:'Execute only if the trigger remains valid.', tradePlanStatus:'valid'},
      review:{canonicalVerdict:'entry', visualBucket:'entry', actionState:'Execute only if the trigger remains valid.', tradePlanStatus:'valid'},
      paperTrade:{canonicalVerdict:'entry', finalVerdict:'Entry', actionState:'submitted', tradePlanStatus:'valid'},
      history:{lifecycleStatus:'submitted', sourceType:'paper_trade', eventRecorded:true}
    },
    paperTrade:{
      context:{
        canonicalVerdict:'entry',
        finalVerdict:'Entry',
        actionabilityState:'submitted',
        eligibility:{eligible:true, reasons:[]},
        displayedPlan:{status:'valid'}
      },
      button:{enabled:false, statusText:'Paper trade submitted.', previewText:''},
      gateway:{state:'ready'},
      uiState:{state:'submit_success'}
    },
    review:{stateHealth:{planStatus:'valid'}},
    visibleCopy:{review:{tradeStatus:'Entry Ready'}},
    diary:{entries:[{status:'submitted', sourceType:'paper_trade'}]}
  };
  const replayResult = {
    canonicalContract:{canonicalVerdict:'entry', canonicalVisualBucket:'entry', planAuthority:{status:'valid'}},
    renderModels:{review:{nextAction:'Execute only if the trigger remains valid.'}}
  };
  const summary = buildAuthoritySummary(appState, replayResult);
  expect(summary.duplicates, 'Paper Trade submitted/open lifecycle must not be normalized into replay Entry-ready action state.').toEqual([]);
  expect(summary.lifecycleEvidence.paperTradeActionabilityState).toBe('submitted');
  expect(summary.sources.paperTrade.actionState).toBe('submitted');
  expect(summary.sources.replay.actionState).toBe('Execute only if the trigger remains valid.');
});

test('Startup review restore ignores persisted review ticker when the saved workspace tab is not Review', async ({page}) => {
  await bootLifecycleApp(page);
  await stubPaperTradeGateway(page);
  await seedLifecycleScenario(page, JOURNEY_TICKER);
  await openReviewDirect(page, JOURNEY_TICKER);
  await openWorkspaceTab(page, 'scan');
  await page.evaluate(() => {
    if(typeof persistState === 'function') persistState();
  });

  await page.reload({waitUntil:'domcontentloaded'});
  await waitForLifecycleAppReady(page);

  const restoredState = await page.evaluate(() => ({
    activeTab:typeof activeWorkspaceTab === 'function' ? activeWorkspaceTab() : '',
    activeReviewTicker:typeof activeReviewTicker === 'function' ? activeReviewTicker() : '',
    persistedSession:JSON.parse(localStorage.getItem('pullbackPlaybookReviewSessionV1') || '{}')
  }));

  expect(String(restoredState.persistedSession.activeWorkspaceTab || '').trim().toLowerCase()).toBe('scan');
  expect(String(restoredState.activeTab || '').trim().toLowerCase(), 'Reload must respect the last saved workspace tab instead of reopening stale Review context.').toBe('scan');
  expect(String(restoredState.activeReviewTicker || '').trim().toUpperCase(), 'Reload must not restore the persisted review ticker when the saved tab is not Review.').toBe('');
});

test('Persisted review session stores a cleared review ticker instead of resurrecting the previous selection', async ({page}) => {
  await bootLifecycleApp(page);
  await stubPaperTradeGateway(page);
  await seedLifecycleScenario(page, JOURNEY_TICKER);
  await openReviewDirect(page, JOURNEY_TICKER);

  const persistedBeforeClear = await page.evaluate(() => {
    if(typeof persistState === 'function') persistState();
    return JSON.parse(localStorage.getItem('pullbackPlaybookReviewSessionV1') || '{}');
  });
  expect(String(persistedBeforeClear.activeReviewTicker || '').trim().toUpperCase()).toBe(JOURNEY_TICKER);

  const persistedAfterClear = await page.evaluate(() => {
    uiState.activeReviewTicker = '';
    if(typeof persistState === 'function') persistState();
    return JSON.parse(localStorage.getItem('pullbackPlaybookReviewSessionV1') || '{}');
  });

  expect(String(persistedAfterClear.activeReviewTicker || '').trim().toUpperCase(), 'Persisting a cleared review selection must store an empty ticker.').toBe('');
  expect(String(persistedAfterClear.activeWorkspaceTab || '').trim().toLowerCase()).toBe('review');
});

test('Reload does not revive stale persisted Entry after a later explicit downgrade', async ({page}) => {
  await bootLifecycleApp(page);
  await stubPaperTradeGateway(page);
  await seedLifecycleScenario(page, JOURNEY_TICKER);
  await openReviewDirect(page, JOURNEY_TICKER);
  const addedToWatchlist = await addActiveReviewToWatchlistIfEligible(page);
  expect(addedToWatchlist, 'Expected Add to Watchlist to be available before downgrade regression.').toBe(true);
  const persistedEntryBeforeDowngrade = await page.evaluate(ticker => {
    const record = typeof getTickerRecord === 'function' ? getTickerRecord(ticker) : null;
    return {
      savedVerdict:String(record && record.review && record.review.savedVerdict || ''),
      projectionVerdict:String(
        record
        && record.review
        && record.review.savedProjectionSnapshot
        && (record.review.savedProjectionSnapshot.canonicalVerdict || record.review.savedProjectionSnapshot.finalVerdict || '')
        || ''
      )
    };
  }, JOURNEY_TICKER);
  expect(persistedEntryBeforeDowngrade.savedVerdict).toBe('Entry');
  expect(persistedEntryBeforeDowngrade.projectionVerdict.toLowerCase()).toBe('entry');

  await applyExplicitReviewDowngrade(page, JOURNEY_TICKER);
  await reloadLifecycleApp(page, JOURNEY_TICKER);
  const snapshot = await captureLifecycleSnapshot(page, JOURNEY_TICKER, 'post_reload_explicit_downgrade', [], []);
  const persistedStateAfterReload = await page.evaluate(ticker => {
    const record = typeof getTickerRecord === 'function' ? getTickerRecord(ticker) : null;
    return {
      savedVerdict:String(record && record.review && record.review.savedVerdict || ''),
      reviewProjectionVerdict:String(
        record && record.review && record.review.savedProjectionSnapshot
        && (record.review.savedProjectionSnapshot.canonicalVerdict || record.review.savedProjectionSnapshot.finalVerdict || '')
        || ''
      ),
      sharedPresentationVerdict:String(
        record && record.watchlist && record.watchlist.presentation && record.watchlist.presentation.sharedPresentation
        && (
          record.watchlist.presentation.sharedPresentation.canonicalVerdict
          || record.watchlist.presentation.sharedPresentation.finalVerdict
          || ''
        )
        || ''
      ),
      watchlistPresentationVerdict:String(
        record && record.watchlist && record.watchlist.presentation
        && (
          record.watchlist.presentation.canonicalVerdict
          || record.watchlist.presentation.finalVerdict
          || ''
        )
        || ''
      ),
      activeProjectionSource:String(uiState && uiState.activeReviewProjectionSource || ''),
      activeProjectionVerdict:String(
        uiState
        && uiState.activeReviewSourceProjectionSnapshot
        && (
          uiState.activeReviewSourceProjectionSnapshot.canonicalVerdict
          || uiState.activeReviewSourceProjectionSnapshot.finalVerdict
          || ''
        )
        || ''
      )
    };
  }, JOURNEY_TICKER);
  expect(
    String(snapshot.appState.review.stateHealth && snapshot.appState.review.stateHealth.canonicalVerdict || '').trim().toLowerCase(),
    'Later explicit downgrade must beat saved review projection on reload.'
  ).not.toBe('entry');
  expect(
    String(snapshot.replay && snapshot.replay.result && snapshot.replay.result.reviewCanonicalVerdict || '').trim().toLowerCase(),
    'Replay must not revive Entry from stale persisted review authority.'
  ).not.toBe('entry');
  expect(
    String(persistedStateAfterReload.savedVerdict || '').trim().toLowerCase(),
    'Saved Entry verdict must be cleared or downgraded after fresher invalidating review evidence.'
  ).not.toBe('entry');
  expect(
    String(persistedStateAfterReload.reviewProjectionVerdict || '').trim().toLowerCase(),
    'Saved Entry projection must be cleared, downgraded, or ignored after fresher invalidating evidence.'
  ).not.toBe('entry');
  expect(
    String(persistedStateAfterReload.sharedPresentationVerdict || '').trim().toLowerCase(),
    'Shared presentation must not recreate Entry after a fresher downgrade.'
  ).not.toBe('entry');
  expect(
    String(persistedStateAfterReload.watchlistPresentationVerdict || '').trim().toLowerCase(),
    'Watchlist presentation must not recreate Entry after a fresher downgrade.'
  ).not.toBe('entry');
  expect(
    String(persistedStateAfterReload.activeProjectionSource || '').trim().toLowerCase(),
    'Startup/reload persisted context must not be restored as live track_projection_updated authority.'
  ).not.toBe('track_projection_updated');
  expect(
    String(persistedStateAfterReload.activeProjectionVerdict || '').trim().toLowerCase(),
    'Active startup projection must not revive Entry after a fresher downgrade.'
  ).not.toBe('entry');

  await reloadLifecycleApp(page, JOURNEY_TICKER);
  const persistedStateAfterSecondReload = await page.evaluate(ticker => {
    const record = typeof getTickerRecord === 'function' ? getTickerRecord(ticker) : null;
    return {
      savedVerdict:String(record && record.review && record.review.savedVerdict || ''),
      reviewProjectionVerdict:String(
        record && record.review && record.review.savedProjectionSnapshot
        && (record.review.savedProjectionSnapshot.canonicalVerdict || record.review.savedProjectionSnapshot.finalVerdict || '')
        || ''
      ),
      sharedPresentationVerdict:String(
        record && record.watchlist && record.watchlist.presentation && record.watchlist.presentation.sharedPresentation
        && (
          record.watchlist.presentation.sharedPresentation.canonicalVerdict
          || record.watchlist.presentation.sharedPresentation.finalVerdict
          || ''
        )
        || ''
      ),
      activeProjectionSource:String(uiState && uiState.activeReviewProjectionSource || ''),
      activeProjectionVerdict:String(
        uiState
        && uiState.activeReviewSourceProjectionSnapshot
        && (
          uiState.activeReviewSourceProjectionSnapshot.canonicalVerdict
          || uiState.activeReviewSourceProjectionSnapshot.finalVerdict
          || ''
        )
        || ''
      )
    };
  }, JOURNEY_TICKER);
  expect(String(persistedStateAfterSecondReload.savedVerdict || '').trim().toLowerCase()).not.toBe('entry');
  expect(String(persistedStateAfterSecondReload.reviewProjectionVerdict || '').trim().toLowerCase()).not.toBe('entry');
  expect(String(persistedStateAfterSecondReload.sharedPresentationVerdict || '').trim().toLowerCase()).not.toBe('entry');
  expect(String(persistedStateAfterSecondReload.activeProjectionSource || '').trim().toLowerCase()).not.toBe('track_projection_updated');
  expect(String(persistedStateAfterSecondReload.activeProjectionVerdict || '').trim().toLowerCase()).not.toBe('entry');
});

test('Explicit saved Watch downgrade beats stale Entry projection on reload', async ({page}) => {
  await bootLifecycleApp(page);
  await stubPaperTradeGateway(page);
  await seedLifecycleScenario(page, JOURNEY_TICKER);
  await openReviewDirect(page, JOURNEY_TICKER);
  const addedToWatchlist = await addActiveReviewToWatchlistIfEligible(page);
  expect(addedToWatchlist, 'Expected Add to Watchlist to be available before soft downgrade regression.').toBe(true);

  await applySavedReviewVerdictDowngrade(page, JOURNEY_TICKER, 'Watch');
  await reloadLifecycleApp(page, JOURNEY_TICKER);

  const restoredState = await page.evaluate(ticker => {
    const record = typeof getTickerRecord === 'function' ? getTickerRecord(ticker) : null;
    const reviewStateHealth = typeof currentReviewStateHealthSnapshot === 'function'
      ? currentReviewStateHealthSnapshot(record)
      : null;
    return {
      savedVerdict:String(record && record.review && record.review.savedVerdict || ''),
      savedProjectionVerdict:String(
        record && record.review && record.review.savedProjectionSnapshot
        && (record.review.savedProjectionSnapshot.canonicalVerdict || record.review.savedProjectionSnapshot.finalVerdict || '')
        || ''
      ),
      activeProjectionSource:String(uiState && uiState.activeReviewProjectionSource || ''),
      activeProjectionVerdict:String(
        uiState
        && uiState.activeReviewSourceProjectionSnapshot
        && (
          uiState.activeReviewSourceProjectionSnapshot.canonicalVerdict
          || uiState.activeReviewSourceProjectionSnapshot.finalVerdict
          || ''
        )
        || ''
      ),
      reviewCanonicalVerdict:String(reviewStateHealth && reviewStateHealth.canonicalVerdict || ''),
      reviewActionLabel:String(reviewStateHealth && reviewStateHealth.actionLabel || '')
    };
  }, JOURNEY_TICKER);

  expect(restoredState.savedVerdict).toBe('Watch');
  expect(String(restoredState.activeProjectionVerdict || '').trim().toLowerCase(), 'Soft saved downgrade must block stale Entry startup projection.').not.toBe('entry');
  expect(String(restoredState.activeProjectionSource || '').trim().toLowerCase()).not.toBe('track_projection_updated');
  expect(String(restoredState.reviewCanonicalVerdict || '').trim().toLowerCase(), 'Reloaded Review must restore the saved downgrade, not stale Entry.').toBe('watch');
});

test('Submitted paper trade does not replace in-progress invalid planner edits', async ({page}) => {
  await bootLifecycleApp(page);
  await stubPaperTradeGateway(page);
  await seedLifecycleScenario(page, JOURNEY_TICKER);
  await openReviewDirect(page, JOURNEY_TICKER);
  await addActiveReviewToWatchlistIfEligible(page);
  await expect(page.locator('#paperTradeBtn')).toBeEnabled();
  await page.locator('#paperTradeBtn').click();
  await expect(page.locator('#paperTradePreview')).toBeVisible();
  await page.locator('#paperTradeConfirmBtn').click();
  await page.waitForFunction(ticker => {
    const tradeDiary = Array.isArray(state && state.tradeDiary) ? state.tradeDiary : [];
    return tradeDiary.some(entry => {
      const entryTicker = String(entry && entry.ticker || '').trim().toUpperCase();
      const sourceType = String(entry && entry.sourceType || '').trim().toLowerCase();
      const status = String(entry && entry.status || '').trim().toLowerCase();
      return entryTicker === ticker && sourceType === 'paper_trade' && status === 'submitted';
    });
  }, JOURNEY_TICKER, {timeout:15000});

  const submittedPlannerState = await capturePlannerEditingState(page, JOURNEY_TICKER);
  expect(submittedPlannerState.persistedStop).not.toBe('');

  await openReviewDirect(page, JOURNEY_TICKER);
  await expect(page.locator('#stopPrice')).toBeVisible();
  await page.locator('#stopPrice').fill('');
  await waitForUiTransitionSettle(page);

  const editedPlannerState = await capturePlannerEditingState(page, JOURNEY_TICKER);
  expect(editedPlannerState.stopInput, 'Current planner input must stay blank while the user is editing an invalid stop.').toBe('');
  expect(editedPlannerState.persistedStop, 'Submitted trade history should still retain the original stop separately.').toBe(submittedPlannerState.persistedStop);
  expect(editedPlannerState.rr, 'Review must stop showing the old submitted R:R after the live stop is cleared.').not.toContain('3.00R');
  expect(editedPlannerState.rr, `Planner must show a non-actionable validation state instead of restoring submitted numbers.\n${JSON.stringify(editedPlannerState, null, 2)}`).toContain('No actionable plan yet.');
});

test('Post-scan setup edits recompute score instead of pinning stale scanner score', async ({page}) => {
  await bootLifecycleApp(page);
  await stubPaperTradeGateway(page);
  await seedLifecycleScenario(page, JOURNEY_TICKER);
  await openReviewDirect(page, JOURNEY_TICKER);
  await addActiveReviewToWatchlistIfEligible(page);
  await openTrackTab(page);
  await waitForUiTransitionSettle(page);

  await applyScoreRegressionEdit(page, JOURNEY_TICKER);
  await expect(page.locator('.reviewworkspace-shell .review-summary-right .score.visual-score')).toContainText(/Setup \d+\/10/);
  const reviewScoreText = await page.locator('.reviewworkspace-shell .review-summary-right .score.visual-score').textContent();

  await openWorkspaceTab(page, 'scan');
  await openTrackTab(page);
  await waitForUiTransitionSettle(page);
  const trackScoreState = await page.evaluate(ticker => {
    const record = typeof getTickerRecord === 'function' ? getTickerRecord(ticker) : null;
    const trackCard = document.querySelector(`[data-watchlist-ticker="${ticker}"]`);
    const canonicalDisplayedScore = typeof setupScoreForRecord === 'function'
      ? setupScoreForRecord(record)
      : (record && record.setup ? record.setup.score : null);
    return {
      storedSetupScore:Number.isFinite(Number(record && record.setup ? record.setup.score : null)) ? Number(record && record.setup ? record.setup.score : null) : null,
      canonicalDisplayedScore:Number.isFinite(Number(canonicalDisplayedScore)) ? Number(canonicalDisplayedScore) : null,
      recomputedScore:Number.isFinite(Number(record && record.setup ? record.setup.scoreRecomputed : null)) ? Number(record && record.setup ? record.setup.scoreRecomputed : null) : null,
      penaltyAdjustedScore:Number.isFinite(Number(record && record.watchlist && record.watchlist.debug ? record.watchlist.debug.score_recomputed_penalty_adjusted : null)) ? Number(record && record.watchlist && record.watchlist.debug ? record.watchlist.debug.score_recomputed_penalty_adjusted : null) : null,
      scanScore:Number.isFinite(Number(record && record.scan ? record.scan.score : null)) ? Number(record && record.scan ? record.scan.score : null) : null,
      scoreSource:String(record && record.setup && record.setup.scoreSource || ''),
      trackText:String(trackCard && trackCard.querySelector('.score.watchlistscore, .score.visual-score') && trackCard.querySelector('.score.watchlistscore, .score.visual-score').textContent || '').replace(/\s+/g, ' ').trim()
    };
  }, JOURNEY_TICKER);

  expect(trackScoreState.recomputedScore, 'Edited setup must produce a recomputed setup score.').not.toBeNull();
  expect(trackScoreState.penaltyAdjustedScore, 'Edited setup must preserve a recomputed penalty-adjusted score for parity checks.').not.toBeNull();
  expect(trackScoreState.scanScore, 'Seeded scanner score must exist for stale-score regression coverage.').toBe(9);
  expect(trackScoreState.recomputedScore, 'Recomputed score must differ from stale scanner score after setup edits.').not.toBe(trackScoreState.scanScore);
  expect(trackScoreState.canonicalDisplayedScore, 'Canonical displayed setup score must no longer be pinned to stale scan.score after setup edits.').not.toBe(trackScoreState.scanScore);
  expect(trackScoreState.scoreSource, 'Successful recomputation must not preserve stale scanner score authority.').not.toBe('scan.score(authoritative)');
  expect(String(reviewScoreText || '').replace(/\s+/g, ' ').trim()).toContain(`Setup ${trackScoreState.canonicalDisplayedScore}/10`);
  expect(trackScoreState.trackText).toContain(`${trackScoreState.canonicalDisplayedScore}/10`);
});

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

  const addedToWatchlist = await addActiveReviewToWatchlistIfEligible(page);
  expect(addedToWatchlist, 'Expected Add to Watchlist to be available for lifecycle audit journey.').toBe(true);
  const watchlistAddedSnapshot = await captureAuditedStage(page, testInfo, stageSnapshots, JOURNEY_TICKER, 'watchlist_added', consoleEvents, networkEvents);
  assertWatchlistAddedEntryParity(watchlistAddedSnapshot);

  await expect(page.locator('#tradePlanInputs')).not.toHaveClass(/review-hidden/);
  await expect(page.locator('#rrValue')).toContainText('3.00R');
  await captureAuditedStage(page, testInfo, stageSnapshots, JOURNEY_TICKER, 'trade_plan_visible', consoleEvents, networkEvents);

  await expect(page.locator('#paperTradeBtn')).toBeEnabled();
  await captureAuditedStage(page, testInfo, stageSnapshots, JOURNEY_TICKER, 'paper_trade_enabled', consoleEvents, networkEvents);

  await page.locator('#paperTradeBtn').click();
  await expect(page.locator('#paperTradePreview')).toBeVisible();
  await captureAuditedStage(page, testInfo, stageSnapshots, JOURNEY_TICKER, 'paper_trade_preview', consoleEvents, networkEvents);

  const preSubmitDiaryTrace = await capturePaperTradeDiaryVerdictTrace(page, JOURNEY_TICKER);
  expect(preSubmitDiaryTrace.paperTradeContext.finalVerdict, 'finalVerdict immediately before submit must be Entry.').toBe('Entry');
  expect(preSubmitDiaryTrace.canonicalVerdict, 'canonical verdict immediately before submit must be Entry.').toBe('entry');
  expect(preSubmitDiaryTrace.tradePlanState, 'trade plan state immediately before submit must be valid.').toBe('valid');
  expect(preSubmitDiaryTrace.paperTradeEnabled, 'paperTradeEnabled immediately before submit must be true.').toBe(true);

  await page.locator('#paperTradeConfirmBtn').click();
  await page.waitForFunction(() => {
    const node = document.getElementById('paperTradeStatusLine');
    return !!(node && /submitted/i.test(node.textContent || ''));
  }, null, {timeout:15000});
  const postSubmitDiaryTrace = await capturePaperTradeDiaryVerdictTrace(page, JOURNEY_TICKER);
  expect(postSubmitDiaryTrace.latestTradeDiary, 'paper-trade submit must create a raw diary row in state.tradeDiary.').toBeTruthy();
  expect(postSubmitDiaryTrace.latestTickerDiary, 'paper-trade submit must create a raw diary row in tickerRecord.diary.records.').toBeTruthy();
  expect(postSubmitDiaryTrace.latestTradeDiary.verdict, `raw diary verdict immediately after submit must stay Entry.\n${JSON.stringify(postSubmitDiaryTrace, null, 2)}`).toBe('Entry');
  expect(postSubmitDiaryTrace.latestTradeDiary.chartVerdict, `raw diary chartVerdict immediately after submit must stay Entry.\n${JSON.stringify(postSubmitDiaryTrace, null, 2)}`).toBe('Entry');
  expect(postSubmitDiaryTrace.latestTradeDiary.status, 'raw diary status immediately after submit must be submitted.').toBe('submitted');
  expect(postSubmitDiaryTrace.latestTradeDiary.sourceType, 'raw diary sourceType immediately after submit must identify paper trade.').toBe('paper_trade');
  expect(postSubmitDiaryTrace.latestTickerDiary.verdict, `ticker diary verdict immediately after submit must stay Entry.\n${JSON.stringify(postSubmitDiaryTrace, null, 2)}`).toBe('Entry');
  expect(postSubmitDiaryTrace.latestTickerDiary.chartVerdict, `ticker diary chartVerdict immediately after submit must stay Entry.\n${JSON.stringify(postSubmitDiaryTrace, null, 2)}`).toBe('Entry');
  await captureAuditedStage(page, testInfo, stageSnapshots, JOURNEY_TICKER, 'paper_trade_submitted', consoleEvents, networkEvents);

  await openTrackTab(page);
  await captureAuditedStage(page, testInfo, stageSnapshots, JOURNEY_TICKER, 'track_open', consoleEvents, networkEvents);

  await openWorkspaceTab(page, 'diary');
  await page.waitForFunction(ticker => {
    const tradeDiary = Array.isArray(state.tradeDiary) ? state.tradeDiary : [];
    return tradeDiary.some(entry => String(entry && entry.ticker || '').trim().toUpperCase() === ticker);
  }, JOURNEY_TICKER, {timeout:15000});
  const diaryOpenTrace = await capturePaperTradeDiaryVerdictTrace(page, JOURNEY_TICKER);
  expect(diaryOpenTrace.visibleDiaryBadge, `visible Diary verdict must display Entry for the newly submitted paper trade.\n${JSON.stringify(diaryOpenTrace, null, 2)}`).toContain('Entry');
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
