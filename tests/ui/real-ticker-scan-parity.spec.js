const {test, expect} = require('@playwright/test');

const REAL_TICKERS = ['AMZN', 'NVDA'];
const REAL_API_ORIGIN = 'https://velvety-clafoutis-8a92bf.netlify.app';

async function bootRealTickerApp(page){
  await page.goto(`/?pp_api_origin=${encodeURIComponent(REAL_API_ORIGIN)}&pp_parity_bust=${Date.now()}`, {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => typeof rankedTickerRecords === 'function' && typeof startupDebugRenderState === 'function');
  await page.waitForFunction(() => {
    const ready = startupDebugRenderState();
    return !!(
      document.getElementById('buildBtn')
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
  await page.goto(`/?pp_api_origin=${encodeURIComponent(REAL_API_ORIGIN)}&pp_parity_bust=${Date.now()}`, {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => typeof rankedTickerRecords === 'function' && typeof startupDebugRenderState === 'function');
  await page.waitForFunction(() => {
    const ready = startupDebugRenderState();
    return !!(
      document.getElementById('buildBtn')
      && ready
      && ready.hydrationComplete === true
      && ready.riskRefreshComplete === true
    );
  }, null, {timeout:30000});
  await dismissOptionalOverlays(page);
}

async function dismissOptionalOverlays(page){
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('button')).forEach(button => {
      const text = String(button.textContent || '').trim().toLowerCase();
      if(text.includes('skip') || text.includes('dismiss') || text.includes('close')){
        try{ button.click(); }catch(_error){}
      }
    });
  });
}

test('real tickers AMZN and NVDA keep scan cards aligned with live market-data resolver output', async ({page}) => {
  await bootRealTickerApp(page);
  await dismissOptionalOverlays(page);
  await page.locator('[data-workspace-tab="scan"]').click();
  await page.waitForFunction(() => document.querySelector('[data-workspace-tab="scan"][aria-selected="true"]') !== null, null, {timeout:10000});

  await page.locator('#tvImportInput').fill(REAL_TICKERS.join('\n'));
  await page.locator('#importTvBtn').click();
  await Promise.all([
    page.waitForResponse(response => /market-data/i.test(response.url()) && response.status() === 200, {timeout:90000}),
    page.locator('#buildBtn').click()
  ]);
  await page.waitForFunction(tickers => {
    if(typeof getTickerRecord !== 'function') return false;
    return tickers.every(ticker => {
      const record = getTickerRecord(ticker);
      return !!(
        record
        && record.marketData
        && Number.isFinite(Number(record.marketData.price))
        && record.scan
        && String(record.scan.resolvedVerdict || '').trim()
      );
    });
  }, REAL_TICKERS, {timeout:90000});

  const parity = await page.evaluate(tickers => {
    const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
    const extract = ticker => {
      const record = typeof getTickerRecord === 'function' ? getTickerRecord(ticker) : null;
      const replay = record && typeof buildReplaySnapshotForTicker === 'function'
        ? buildReplaySnapshotForTicker(ticker)
        : null;
      const scanSimplified = record && typeof resolveSimplifiedStateForSurface === 'function'
        ? resolveSimplifiedStateForSurface(record, 'scan', {source:'real_ticker_scan_parity', mutationSource:'real_ticker_scan_parity'})
        : null;
      const globalVerdict = record && typeof resolveGlobalVerdict === 'function'
        ? resolveGlobalVerdict(record)
        : null;
      const projected = record && typeof projectTickerForCard === 'function'
        ? projectTickerForCard(record, {includeExecutionDowngrade:false, includeRuntimeFallback:false})
        : null;
      const projectedScan = record && typeof projectTickerForCard === 'function'
        ? projectTickerForCard(record, {surface:'scan', includeExecutionDowngrade:false, includeRuntimeFallback:false})
        : null;
      const authoritativeScanSnapshot = record && typeof authoritativeScanSurfaceSnapshot === 'function'
        ? authoritativeScanSurfaceSnapshot(record)
        : null;
      const setupScoreTrace = record && typeof setupScoreTraceForRecord === 'function'
        ? setupScoreTraceForRecord(record)
        : null;
      const scanPresentation = projected && typeof ScannerView !== 'undefined' && typeof ScannerView.scanPresentationForView === 'function'
        ? ScannerView.scanPresentationForView({
          ...projected,
          simplifiedState:scanSimplified
        }, {
          projectTickerForCard,
          analysisDerivedStatesFromRecord,
          resolveSimplifiedStateForSurface,
          numericOrNull,
          escapeHtml,
          shouldShowActionableRR,
          currentRrThreshold
        })
        : null;
      const sharedPresentation = record && record.watchlist && record.watchlist.presentation && record.watchlist.presentation.sharedPresentation
        ? record.watchlist.presentation.sharedPresentation
        : null;
      const card = document.querySelector(`#results .resultcompact[data-ticker="${ticker}"]`);
      const badge = card && card.querySelector('.badge.state-pill');
      return {
        ticker,
        providerDataTimestamp: normalize(record && record.marketData && (record.marketData.fetchedAt || record.marketData.asOf)),
        rawScanResult: record && record.scan ? {
          verdict: normalize(record.scan.verdict),
          resolvedVerdict: normalize(record.scan.resolvedVerdict),
          score: record.scan.score,
          scoreDisplay: normalize(record.scan.scoreDisplay),
          scoreRaw: Number.isFinite(Number(record.scan.scoreRaw)) ? Number(record.scan.scoreRaw) : null,
          summary: normalize(record.scan.summary),
          lastError: normalize(record.scan.lastError)
        } : null,
        rawShortlistVerdict: normalize(replay && replay.rawShortlistVerdict),
        resolverCanonicalVerdict: normalize(replay && replay.reviewCanonicalVerdict).toLowerCase(),
        resolverVisualBucket: normalize(replay && replay.reviewVisualBucket).toLowerCase(),
        resolverSetupScore: replay && Number.isFinite(Number(replay.setupScore)) ? Number(replay.setupScore) : null,
        scanSimplifiedState: scanSimplified ? {
          canonicalVerdict: normalize(scanSimplified.canonicalVerdict).toLowerCase(),
          visualBucket: normalize(scanSimplified.visualBucket).toLowerCase(),
          setupScore: Number.isFinite(Number(scanSimplified.setupScore)) ? Number(scanSimplified.setupScore) : null,
          badgeLabel: normalize(scanSimplified.badgeLabel),
          actionLabel: normalize(scanSimplified.actionLabel),
          mainBlocker: normalize(scanSimplified.mainBlocker)
        } : null,
        scanPresentation: scanPresentation ? {
          canonicalVerdict: normalize(scanPresentation.canonicalVerdict).toLowerCase(),
          visualBucket: normalize(scanPresentation.visualBucket || scanPresentation.presentationBucket).toLowerCase(),
          badgeLabel: normalize(scanPresentation.badgeLabel),
          summary: normalize(scanPresentation.summary)
        } : null,
        authoritativeScanSnapshot: authoritativeScanSnapshot ? {
          canonicalVerdict: normalize(authoritativeScanSnapshot.canonicalVerdict).toLowerCase(),
          visualBucket: normalize(authoritativeScanSnapshot.visualBucket).toLowerCase(),
          score: Number.isFinite(Number(authoritativeScanSnapshot.score)) ? Number(authoritativeScanSnapshot.score) : null,
          summary: normalize(authoritativeScanSnapshot.summary)
        } : null,
        projectedCard: projected ? {
          setupScore: Number.isFinite(Number(projected.setupScore)) ? Number(projected.setupScore) : null,
          setupScoreDisplay: normalize(projected.setupScoreDisplay),
          displayStage: normalize(projected.displayStage)
        } : null,
        projectedScanCard: projectedScan ? {
          setupScore: Number.isFinite(Number(projectedScan.setupScore)) ? Number(projectedScan.setupScore) : null,
          setupScoreDisplay: normalize(projectedScan.setupScoreDisplay),
          displayStage: normalize(projectedScan.displayStage)
        } : null,
        sharedPresentation: sharedPresentation ? {
          canonicalVerdict: normalize(sharedPresentation.canonicalVerdict || sharedPresentation.finalVerdict).toLowerCase(),
          visualBucket: normalize(sharedPresentation.visualBucket).toLowerCase(),
          badgeLabel: normalize(sharedPresentation.badgeLabel),
          headline: normalize(sharedPresentation.headline),
          actionLabel: normalize(sharedPresentation.actionLabel || sharedPresentation.nextAction)
        } : null,
        localTickerRecord: record ? {
          scanScore: record.scan && record.scan.score,
          scanScoreDisplay: normalize(record.scan && record.scan.scoreDisplay),
          setupScore: record.setup && record.setup.score,
          setupScoreDisplay: normalize(record.setup && record.setup.scoreDisplay),
          setupScoreSource: normalize(record.setup && record.setup.scoreSource),
          setupScoreRecomputed: Number.isFinite(Number(record.setup && record.setup.scoreRecomputed)) ? Number(record.setup && record.setup.scoreRecomputed) : null,
          setupScoreTrace: setupScoreTrace ? {
            score: Number.isFinite(Number(setupScoreTrace.score)) ? Number(setupScoreTrace.score) : null,
            source: normalize(setupScoreTrace.source),
            detail: normalize(setupScoreTrace.detail)
          } : null,
          canonicalSetupScore: setupScoreTrace && Number.isFinite(Number(setupScoreTrace.score)) ? Number(setupScoreTrace.score) : null,
          analysisProjectionPresent: !!(record.scan && record.scan.analysisProjection),
          marketDataPrice: record.marketData && record.marketData.price,
          marketDataProvider: normalize(record.marketData && record.marketData.sourceProvider)
        } : null,
        visibleCard: card ? {
          tone: normalize(card.getAttribute('data-visual-tone')).toLowerCase(),
          state: normalize(card.getAttribute('data-visual-state')).toLowerCase(),
          badgeLabel: normalize(badge && badge.textContent),
          setupScoreDisplay: normalize(card.querySelector('.score.visual-score') && card.querySelector('.score.visual-score').textContent),
          text: normalize(card.textContent)
        } : null,
        replayOutput: replay ? {
          rawShortlistVerdict: normalize(replay.rawShortlistVerdict),
          reviewCanonicalVerdict: normalize(replay.reviewCanonicalVerdict).toLowerCase(),
          reviewVisualBucket: normalize(replay.reviewVisualBucket).toLowerCase(),
          setupScore: replay.setupScore
        } : null,
        globalVerdict: globalVerdict ? {
          finalVerdict: normalize(globalVerdict.final_verdict || globalVerdict.finalVerdict).toLowerCase(),
          canonicalVisualBucket: normalize(globalVerdict.canonical_visual_bucket).toLowerCase(),
          setupScore: Number.isFinite(Number(globalVerdict.setup_score)) ? Number(globalVerdict.setup_score) : null,
          reason: normalize(globalVerdict.reason)
        } : null
      };
    };
    return tickers.map(extract);
  }, REAL_TICKERS);

  for(const tickerResult of parity){
    const label = `${tickerResult.ticker} real ticker parity`;
    const rawScanCanonicalVerdict = tickerResult.rawScanResult && tickerResult.rawScanResult.resolvedVerdict
      ? String(tickerResult.rawScanResult.resolvedVerdict).trim().toLowerCase().replace(/\s+/g, '_')
      : '';
    const expectedCanonicalVerdict = tickerResult.replayOutput && tickerResult.replayOutput.reviewCanonicalVerdict
      ? tickerResult.replayOutput.reviewCanonicalVerdict
      : rawScanCanonicalVerdict
        ? rawScanCanonicalVerdict
        : (tickerResult.globalVerdict && tickerResult.globalVerdict.finalVerdict
          ? tickerResult.globalVerdict.finalVerdict
          : '');
    const expectedVisualBucket = tickerResult.replayOutput && tickerResult.replayOutput.reviewVisualBucket
      ? tickerResult.replayOutput.reviewVisualBucket
      : (
        expectedCanonicalVerdict === 'entry'
          ? 'entry'
          : (expectedCanonicalVerdict === 'near_entry'
            ? 'near_entry'
            : (expectedCanonicalVerdict === 'avoid'
              ? 'avoid'
              : (Number.isFinite(Number(tickerResult.rawScanResult && tickerResult.rawScanResult.score)) && Number(tickerResult.rawScanResult && tickerResult.rawScanResult.score) <= 4
                ? 'diminishing'
                : (tickerResult.globalVerdict && tickerResult.globalVerdict.canonicalVisualBucket
                  ? tickerResult.globalVerdict.canonicalVisualBucket
                  : 'monitor'))))
      );
    const expectedSetupScore = Number.isFinite(tickerResult.replayOutput && tickerResult.replayOutput.setupScore)
      ? Number(tickerResult.replayOutput.setupScore)
      : (Number.isFinite(Number(tickerResult.rawScanResult && tickerResult.rawScanResult.score))
        ? Number(tickerResult.rawScanResult && tickerResult.rawScanResult.score)
        : (Number.isFinite(tickerResult.globalVerdict && tickerResult.globalVerdict.setupScore)
          ? Number(tickerResult.globalVerdict.setupScore)
          : null));

    expect(tickerResult.providerDataTimestamp, `${label} must have provider data timestamp.\n${JSON.stringify(tickerResult, null, 2)}`).toBeTruthy();
    expect(tickerResult.localTickerRecord && tickerResult.localTickerRecord.marketDataPrice, `${label} must have resolved live market data.\n${JSON.stringify(tickerResult, null, 2)}`).toBeTruthy();
    expect(tickerResult.rawScanResult && tickerResult.rawScanResult.lastError, `${label} must not preserve market-data fallback errors.\n${JSON.stringify(tickerResult, null, 2)}`).toBe('');
    expect(tickerResult.scanSimplifiedState, `${label} must expose scan simplified state.\n${JSON.stringify(tickerResult, null, 2)}`).toBeTruthy();
    expect(tickerResult.scanPresentation, `${label} must expose scan presentation state.\n${JSON.stringify(tickerResult, null, 2)}`).toBeTruthy();
    expect(tickerResult.visibleCard, `${label} must render a visible scan card.\n${JSON.stringify(tickerResult, null, 2)}`).toBeTruthy();

    expect(
      tickerResult.scanSimplifiedState.canonicalVerdict,
      `${label} app scan canonical verdict must match replay.\n${JSON.stringify(tickerResult, null, 2)}`
    ).toBe(expectedCanonicalVerdict);

    expect(
      tickerResult.scanSimplifiedState.visualBucket,
      `${label} app scan visual bucket must match replay.\n${JSON.stringify(tickerResult, null, 2)}`
    ).toBe(expectedVisualBucket);

    expect(
      tickerResult.scanPresentation.visualBucket,
      `${label} scan presentation bucket must match canonical scan state.\n${JSON.stringify(tickerResult, null, 2)}`
    ).toBe(tickerResult.scanSimplifiedState.visualBucket);

    expect(
      tickerResult.visibleCard.tone,
      `${label} visible scan card tone must match canonical scan bucket.\n${JSON.stringify(tickerResult, null, 2)}`
    ).toBe(tickerResult.scanSimplifiedState.visualBucket);

    expect(
      tickerResult.visibleCard.badgeLabel,
      `${label} visible scan badge must match scan presentation badge.\n${JSON.stringify(tickerResult, null, 2)}`
    ).toBe(tickerResult.scanPresentation.badgeLabel);

    if(Number.isFinite(expectedSetupScore)){
      expect(
        tickerResult.projectedScanCard && tickerResult.projectedScanCard.setupScore,
        `${label} scan card projection score must match replay.\n${JSON.stringify(tickerResult, null, 2)}`
      ).toBe(expectedSetupScore);
      expect(
        tickerResult.authoritativeScanSnapshot && tickerResult.authoritativeScanSnapshot.score,
        `${label} authoritative scan snapshot score must match replay.\n${JSON.stringify(tickerResult, null, 2)}`
      ).toBe(expectedSetupScore);
      expect(
        tickerResult.visibleCard && tickerResult.visibleCard.setupScoreDisplay,
        `${label} visible setup score must match scan projection score.\n${JSON.stringify(tickerResult, null, 2)}`
      ).toBe(`Setup ${expectedSetupScore}/10`);
    }

    if(expectedCanonicalVerdict === 'entry'){
      expect(
        tickerResult.visibleCard.text,
        `${label} replay Entry must not render stale Developing Watch copy.\n${JSON.stringify(tickerResult, null, 2)}`
      ).not.toMatch(/Developing Watch/i);
    }

    if(expectedVisualBucket === 'diminishing'){
      expect(
        tickerResult.visibleCard.tone,
        `${label} replay Diminishing must not render Monitor tone.\n${JSON.stringify(tickerResult, null, 2)}`
      ).toBe('diminishing');
    }
  }
});

test('real ticker review-track-review authority stays stable across first open and reopen', async ({page}) => {
  await bootRealTickerApp(page);
  await dismissOptionalOverlays(page);
  await page.locator('[data-workspace-tab="scan"]').click();
  await page.waitForFunction(() => document.querySelector('[data-workspace-tab="scan"][aria-selected="true"]') !== null, null, {timeout:10000});

  await page.locator('#tvImportInput').fill('AMZN');
  await page.locator('#importTvBtn').click();
  await Promise.all([
    page.waitForResponse(response => /market-data/i.test(response.url()) && response.status() === 200, {timeout:90000}),
    page.locator('#buildBtn').click()
  ]);
  await page.waitForFunction(() => {
    if(typeof getTickerRecord !== 'function') return false;
    const record = getTickerRecord('AMZN');
    return !!(
      record
      && record.marketData
      && Number.isFinite(Number(record.marketData.price))
      && record.scan
      && String(record.scan.resolvedVerdict || '').trim()
    );
  }, null, {timeout:90000});

  const trace = await page.evaluate(async () => {
    const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
    const waitFrame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const capture = stage => {
      const ticker = 'AMZN';
      const record = typeof getTickerRecord === 'function' ? getTickerRecord(ticker) : null;
      const reviewState = typeof currentReviewStateHealthSnapshot === 'function' ? currentReviewStateHealthSnapshot(record) : null;
      const trackState = typeof buildTrackDiagnosticSnapshot === 'function' ? buildTrackDiagnosticSnapshot(record) : null;
      const sharedPresentation = record && record.watchlist && record.watchlist.presentation && record.watchlist.presentation.sharedPresentation
        ? record.watchlist.presentation.sharedPresentation
        : null;
      const lifecycle = record && record.lifecycle ? record.lifecycle : {};
      const watchlistDebug = record && record.watchlist && record.watchlist.debug ? record.watchlist.debug : {};
      const reviewVisible = document.querySelector('.reviewworkspace');
      const trackCard = document.querySelector(`[data-watchlist-ticker="${ticker}"]`);
      return {
        stage,
        canonicalVerdict: normalize(reviewState && reviewState.canonicalVerdict).toLowerCase(),
        visualBucket: normalize(reviewState && reviewState.visualBucket).toLowerCase(),
        scanResolvedVerdict: normalize(record && record.scan && record.scan.resolvedVerdict).toLowerCase(),
        reviewProjectionVerdict: normalize(
          window.uiState && window.uiState.activeReviewSourceProjectionSnapshot && window.uiState.activeReviewSourceProjectionSnapshot.canonicalVerdict
          || window.uiState && window.uiState.activeReviewSourceProjectionSnapshot && window.uiState.activeReviewSourceProjectionSnapshot.finalVerdict
        ).toLowerCase(),
        trackProjectionVerdict: normalize(trackState && trackState.sharedPresentation && trackState.sharedPresentation.canonicalVerdict).toLowerCase(),
        sharedPresentationVerdict: normalize(sharedPresentation && (sharedPresentation.canonicalVerdict || sharedPresentation.finalVerdict)).toLowerCase(),
        stateHealthSourceOfTruth: normalize(reviewState && reviewState.sourceOfTruth),
        watchlistDebugFinalVerdict: normalize(watchlistDebug.finalVerdict).toLowerCase(),
        downgradeApplied: watchlistDebug.downgradeApplied === true,
        downgradeReason: normalize(watchlistDebug.downgradeReason),
        entryGatePass: reviewState && reviewState.entryGatePass === true,
        nearEntryGatePass: reviewState && reviewState.nearEntryGatePass === true,
        primaryBlockerReason: normalize(reviewState && reviewState.primaryBlockerReason),
        bounceState: normalize(reviewState && reviewState.bounceState).toLowerCase(),
        volumeState: normalize(record && record.scan && record.scan.analysisProjection && record.scan.analysisProjection.derived_states && record.scan.analysisProjection.derived_states.volume_state).toLowerCase(),
        savedReviewVerdict: normalize(record && record.review && record.review.savedVerdict).toLowerCase(),
        lifecycleStatus: normalize(lifecycle.status).toLowerCase(),
        lifecycleStage: normalize(lifecycle.stage).toLowerCase(),
        visibleReviewText: normalize(reviewVisible && reviewVisible.textContent),
        visibleTrackText: normalize(trackCard && trackCard.textContent)
      };
    };

    const record = getTickerRecord('AMZN');
    const traceRows = [];
    traceRows.push(capture('scan_result'));
    addToWatchlist({
      ticker:'AMZN',
      dateAdded:todayIsoDate(),
      scoreWhenAdded:preferredScoreForRecord(record),
      verdictWhenAdded:preferredVerdictForRecord(record),
      expiryAfterTradingDays:5
    });
    await waitFrame();
    traceRows.push(capture('add_to_watchlist'));
    traceRows.push(capture('first_review_open_before_render'));
    reviewWatchlistTicker('AMZN');
    await waitFrame();
    traceRows.push(capture('first_review_open_after_render'));
    if(typeof setActiveWorkspaceTab === 'function') setActiveWorkspaceTab('track');
    if(typeof renderWatchlist === 'function') renderWatchlist();
    await waitFrame();
    traceRows.push(capture('track_open'));
    reviewWatchlistTicker('AMZN');
    traceRows.push(capture('second_review_open_before_render'));
    await waitFrame();
    traceRows.push(capture('second_review_open_after_render'));
    return traceRows;
  });

  const firstReview = trace.find(entry => entry.stage === 'first_review_open_after_render');
  const trackOpen = trace.find(entry => entry.stage === 'track_open');
  const secondReview = trace.find(entry => entry.stage === 'second_review_open_after_render');
  expect(firstReview, JSON.stringify(trace, null, 2)).toBeTruthy();
  expect(trackOpen, JSON.stringify(trace, null, 2)).toBeTruthy();
  expect(secondReview, JSON.stringify(trace, null, 2)).toBeTruthy();
  expect(trackOpen.canonicalVerdict, `Track must not diverge from first Review on the same snapshot.\n${JSON.stringify(trace, null, 2)}`).toBe(firstReview.canonicalVerdict);
  expect(secondReview.canonicalVerdict, `Second Review must not diverge from first Review on the same snapshot.\n${JSON.stringify(trace, null, 2)}`).toBe(firstReview.canonicalVerdict);
});
