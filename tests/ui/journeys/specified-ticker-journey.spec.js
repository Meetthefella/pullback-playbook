const {test, expect} = require('@playwright/test');
const {
  attachConsoleRecorder,
  captureStage,
  gotoApp,
  waitForAppReady,
  dismissOptionalOverlays,
  resetAppState,
  addTickers,
  openReviewForTicker,
  addActiveReviewToWatchlistIfEligible,
  openTrackTab,
  openReviewFromTrackTicker,
  waitForUiTransitionSettle
} = require('../helpers/app-driver');
const {extractAppTickerState} = require('../helpers/app-state');
const {writeJsonReport, writeArtifactJson} = require('../helpers/report');
const {loadTickerFixture, normalizeTicker} = require('../helpers/ticker-fixture');

const REAL_API_ORIGIN = 'https://velvety-clafoutis-8a92bf.netlify.app';
const JOURNEY_TICKERS = (() => {
  const explicit = normalizeTicker(process.env.PP_JOURNEY_TICKER || '');
  if(explicit) return [explicit];
  const loaded = loadTickerFixture();
  return loaded.length ? loaded : ['TROW'];
})();

function normalizeText(value){
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeVerdict(value){
  return normalizeText(value).toLowerCase().replace(/\s+/g, '_');
}

function normalizeVisualBucket(value){
  const normalized = normalizeVerdict(value);
  if(normalized === 'watch') return 'monitor';
  return normalized;
}

function buildSurfaceMismatch(stage, ticker, expected, actual, extra = {}){
  return {
    ticker,
    stage,
    expected,
    actual,
    ...extra
  };
}

function isTrackedAuthoritySource(value){
  const normalized = normalizeVerdict(value);
  return ['watchlist_refresh', 'review_save', 'manual'].includes(normalized);
}

function extractScoreValue(label){
  const match = normalizeText(label).match(/(\d+(?:\.\d+)?)\s*\/\s*10/i);
  if(!match) return null;
  const numeric = Number(match[1]);
  return Number.isFinite(numeric) ? numeric : null;
}

function pushMismatch(findings, condition, message, details = {}){
  if(!condition){
    findings.push({
      message,
      ...details
    });
  }
}

function createPhaseRecorder(ticker){
  const phases = [];
  return {
    phases,
    start(phaseName, details = {}){
      phases.push({
        phaseName,
        ticker,
        startedAt:new Date().toISOString(),
        finishedAt:null,
        durationMs:null,
        status:'running',
        details
      });
    },
    end(status = 'passed', details = {}){
      const phase = phases[phases.length - 1];
      if(!phase || phase.finishedAt) return;
      phase.finishedAt = new Date().toISOString();
      phase.durationMs = Date.parse(phase.finishedAt) - Date.parse(phase.startedAt);
      phase.status = status;
      phase.details = {
        ...phase.details,
        ...details
      };
    },
    fail(error){
      this.end('failed', {
        error:String(error && error.stack || error || '')
      });
    }
  };
}

async function waitForSpecifiedTickerScan(page, ticker){
  await page.waitForFunction(symbol => {
    const card = document.querySelector(`#results .resultcompact[data-ticker="${symbol}"]`);
    if(!card) return false;
    if(typeof getTickerRecord !== 'function') return false;
    const record = getTickerRecord(symbol);
    const resolvedVerdict = String(
      record && record.scan && (record.scan.resolvedVerdict || record.scan.verdict) || ''
    ).trim();
    return !!(record && record.scan && resolvedVerdict);
  }, ticker, {timeout:90000});
}

async function isPaperTradeEnabled(page){
  return page.evaluate(() => {
    const button = document.getElementById('paperTradeBtn');
    return !!(button && !button.disabled);
  });
}

async function capturePaperTradePreview(page, ticker, consoleEvents){
  const previewOpened = await isPaperTradeEnabled(page);
  if(!previewOpened){
    return {
      previewOpened:false,
      state:await extractAppTickerState(page, ticker, consoleEvents)
    };
  }
  await page.locator('#paperTradeBtn').click();
  await expect(page.locator('#paperTradePreview')).toBeVisible({timeout:10000});
  await waitForUiTransitionSettle(page);
  return {
    previewOpened:true,
    state:await extractAppTickerState(page, ticker, consoleEvents)
  };
}

async function revealTrackCardIfPresent(page, ticker){
  const card = page.locator(`[data-watchlist-ticker="${ticker}"]`).first();
  if(await card.isVisible().catch(() => false)) return true;
  for(let attempt = 0; attempt < 8; attempt += 1){
    const collapsedToggle = page.locator('.watchlistgroup__toggle[aria-expanded="false"]').first();
    if(!(await collapsedToggle.count())) break;
    await collapsedToggle.click();
    await waitForUiTransitionSettle(page);
    if(await card.isVisible().catch(() => false)) return true;
  }
  return await card.isVisible().catch(() => false);
}

function hasRenderedTrackCard(state){
  const trackVisible = state && state.track && state.track.visible ? state.track.visible : null;
  const badge = normalizeText(trackVisible && trackVisible.badgeLabel);
  const decisionSummary = normalizeText(trackVisible && trackVisible.decisionSummary);
  const cardText = normalizeText(trackVisible && trackVisible.cardText);
  const visualState = normalizeText(trackVisible && trackVisible.visualState);
  const visualTone = normalizeText(trackVisible && trackVisible.visualTone);
  return !!(badge || decisionSummary || cardText || visualState || visualTone);
}

function appendVisualParityFindings(findings, ticker, scanState, reviewState, trackState, reviewFromTrackState, options = {}){
  const trackRendered = options.trackRendered === true;
  const scanExpectedBucket = normalizeVisualBucket(scanState && scanState.normalized && scanState.normalized.scanVisualBucket);
  const scanExpectedVerdict = normalizeVerdict(scanState && scanState.normalized && scanState.normalized.scanCanonicalVerdict);
  const scanVisibleTone = normalizeVisualBucket(scanState && scanState.scan && scanState.scan.visibleCard && scanState.scan.visibleCard.visualTone);
  const scanVisibleState = normalizeVerdict(scanState && scanState.scan && scanState.scan.visibleCard && scanState.scan.visibleCard.visualState);
  const reviewExpectedBucket = normalizeVisualBucket(reviewState && reviewState.normalized && reviewState.normalized.reviewVisualBucket);
  const reviewExpectedVerdict = normalizeVerdict(reviewState && reviewState.normalized && reviewState.normalized.reviewCanonicalVerdict);
  const reviewVisibleTone = normalizeVisualBucket(reviewState && reviewState.review && reviewState.review.visible && reviewState.review.visible.currentTone);
  const reviewVisibleState = normalizeVerdict(reviewState && reviewState.review && reviewState.review.visible && reviewState.review.visible.currentVerdict);
  const trackExpectedBucket = normalizeVisualBucket(trackState && trackState.normalized && (
    trackState.normalized.trackAuthorityBucket
    || trackState.normalized.trackVisualBucket
  ));
  const trackExpectedVerdict = normalizeVerdict(trackState && trackState.normalized && (
    trackState.normalized.trackAuthorityCanonicalVerdict
    || trackState.normalized.trackCanonicalVerdict
  ));
  const trackVisibleTone = normalizeVisualBucket(trackState && trackState.track && trackState.track.visible && trackState.track.visible.visualTone);
  const trackVisibleState = normalizeVerdict(trackState && trackState.track && trackState.track.visible && trackState.track.visible.visualState);
  const reviewFromTrackExpectedBucket = normalizeVisualBucket(
    reviewFromTrackState && reviewFromTrackState.normalized && reviewFromTrackState.normalized.reviewVisualBucket
  );
  const reviewFromTrackExpectedVerdict = normalizeVerdict(
    reviewFromTrackState && reviewFromTrackState.normalized && reviewFromTrackState.normalized.reviewCanonicalVerdict
  );
  const reviewFromTrackTone = normalizeVisualBucket(
    reviewFromTrackState && reviewFromTrackState.review && reviewFromTrackState.review.visible && reviewFromTrackState.review.visible.currentTone
  );
  const reviewFromTrackVisibleState = normalizeVerdict(
    reviewFromTrackState && reviewFromTrackState.review && reviewFromTrackState.review.visible && reviewFromTrackState.review.visible.currentVerdict
  );

  if(scanExpectedBucket && scanVisibleTone !== scanExpectedBucket){
    findings.push(buildSurfaceMismatch('scan_tone', ticker, scanExpectedBucket, scanVisibleTone));
  }
  if(scanExpectedVerdict && scanVisibleState !== scanExpectedVerdict){
    findings.push(buildSurfaceMismatch('scan_state', ticker, scanExpectedVerdict, scanVisibleState, {
      canonicalVerdict:scanExpectedVerdict
    }));
  }
  if(reviewExpectedBucket && reviewVisibleTone !== reviewExpectedBucket){
    findings.push(buildSurfaceMismatch('review_tone', ticker, reviewExpectedBucket, reviewVisibleTone));
  }
  if(reviewExpectedVerdict && reviewVisibleState !== reviewExpectedVerdict){
    findings.push(buildSurfaceMismatch('review_state', ticker, reviewExpectedVerdict, reviewVisibleState, {
      canonicalVerdict:reviewExpectedVerdict
    }));
  }
  if(trackRendered){
    if(trackExpectedBucket && trackVisibleTone !== trackExpectedBucket){
      findings.push(buildSurfaceMismatch('track_tone', ticker, trackExpectedBucket, trackVisibleTone));
    }
    if(trackExpectedVerdict && trackVisibleState !== trackExpectedVerdict){
      findings.push(buildSurfaceMismatch('track_state', ticker, trackExpectedVerdict, trackVisibleState, {
        canonicalVerdict:trackExpectedVerdict
      }));
    }
  }
  if(reviewFromTrackExpectedBucket && reviewFromTrackTone !== reviewFromTrackExpectedBucket){
    findings.push(buildSurfaceMismatch('review_from_track_tone', ticker, reviewFromTrackExpectedBucket, reviewFromTrackTone));
  }
  if(reviewFromTrackExpectedVerdict && reviewFromTrackVisibleState !== reviewFromTrackExpectedVerdict){
    findings.push(buildSurfaceMismatch('review_from_track_state', ticker, reviewFromTrackExpectedVerdict, reviewFromTrackVisibleState, {
      canonicalVerdict:reviewFromTrackExpectedVerdict
    }));
  }
}

function buildMismatchFindings({
  scanState,
  reviewState,
  trackState,
  rescanTrackState,
  reviewFromTrackState,
  watchlistAddSucceeded,
  trackCardVisible,
  paperTrade
}){
  const findings = [];
  const reviewCanonicalVerdict = normalizeVerdict(reviewState && reviewState.normalized && reviewState.normalized.reviewCanonicalVerdict);
  const reviewVisualBucket = normalizeVisualBucket(reviewState && reviewState.normalized && reviewState.normalized.reviewVisualBucket);
  const scanScore = extractScoreValue(scanState && scanState.scan && scanState.scan.visibleCard && scanState.scan.visibleCard.scoreLabel);
  const effectiveTrackState = rescanTrackState || trackState;
  const effectiveReviewFromTrackState = reviewFromTrackState || reviewState;
  const renderedTrackPresent = hasRenderedTrackCard(trackState) || hasRenderedTrackCard(rescanTrackState);
  const reviewFromTrackCanonicalVerdict = normalizeVerdict(effectiveReviewFromTrackState && effectiveReviewFromTrackState.normalized && effectiveReviewFromTrackState.normalized.reviewCanonicalVerdict);
  const reviewFromTrackVisualBucket = normalizeVisualBucket(effectiveReviewFromTrackState && effectiveReviewFromTrackState.normalized && effectiveReviewFromTrackState.normalized.reviewVisualBucket);
  const reviewFromTrackBadge = normalizeText(effectiveReviewFromTrackState && effectiveReviewFromTrackState.review && effectiveReviewFromTrackState.review.visible && effectiveReviewFromTrackState.review.visible.badgeLabel);
  const trackRenderedCanonicalVerdict = normalizeVerdict(effectiveTrackState && effectiveTrackState.normalized && effectiveTrackState.normalized.trackCanonicalVerdict);
  const trackRenderedVisualBucket = normalizeVisualBucket(effectiveTrackState && effectiveTrackState.normalized && effectiveTrackState.normalized.trackRenderedBucket);
  const trackAuthorityCanonicalVerdict = normalizeVerdict(effectiveTrackState && effectiveTrackState.normalized && effectiveTrackState.normalized.trackAuthorityCanonicalVerdict);
  const trackAuthorityBucket = normalizeVisualBucket(effectiveTrackState && effectiveTrackState.normalized && effectiveTrackState.normalized.trackAuthorityBucket);
  const trackRenderedVsAuthorityMismatch = !!(effectiveTrackState && effectiveTrackState.normalized && effectiveTrackState.normalized.trackRenderedVsAuthorityMismatch);
  const trackBadge = normalizeText(effectiveTrackState && effectiveTrackState.track && effectiveTrackState.track.visible && effectiveTrackState.track.visible.badgeLabel);
  const trackScore = extractScoreValue(effectiveTrackState && effectiveTrackState.track && effectiveTrackState.track.visible && effectiveTrackState.track.visible.scoreLabel);

  pushMismatch(
    findings,
    !!(scanState && scanState.scan && scanState.scan.simplifiedState && normalizeText(scanState.scan.simplifiedState.canonicalVerdict)),
    'Scan did not expose a canonical simplified verdict.',
    {surface:'scan'}
  );

  pushMismatch(
    findings,
    !!(reviewState && reviewState.review && reviewState.review.stateHealth && normalizeText(reviewState.review.stateHealth.canonicalVerdict)),
    'Review did not expose canonical state health.',
    {surface:'review'}
  );

  if(watchlistAddSucceeded){
    pushMismatch(
      findings,
      trackCardVisible || renderedTrackPresent,
      'Ticker was added to watchlist but no Track card was rendered.',
      {surface:'track'}
    );
    if(trackCardVisible || renderedTrackPresent){
      pushMismatch(
        findings,
        !!trackRenderedCanonicalVerdict,
        'Track card rendered but track canonical verdict was empty.',
        {surface:'track'}
      );
      pushMismatch(
        findings,
        !!trackAuthorityCanonicalVerdict,
        'Track authority verdict was empty.',
        {surface:'trackAuthority'}
      );
      pushMismatch(
        findings,
        trackAuthorityCanonicalVerdict === reviewFromTrackCanonicalVerdict,
        'Track authority contradicts Review canonical verdict after reopen from Track.',
        {
          surface:'trackAuthority',
          expected:reviewFromTrackCanonicalVerdict,
          actual:trackAuthorityCanonicalVerdict
        }
      );
      if(trackAuthorityBucket){
        pushMismatch(
          findings,
          trackAuthorityBucket === reviewFromTrackVisualBucket,
          'Track authority bucket diverged from Review canonical visual bucket after reopen from Track.',
          {
            surface:'trackAuthority',
            expected:reviewFromTrackVisualBucket,
            actual:trackAuthorityBucket
          }
        );
      }
      if(trackRenderedVisualBucket && trackAuthorityBucket){
        pushMismatch(
          findings,
          trackRenderedVisualBucket === trackAuthorityBucket,
          'Track rendered bucket diverged from Track authority bucket.',
          {
            surface:'trackRendered',
            expected:trackAuthorityBucket,
            actual:trackRenderedVisualBucket
          }
        );
      }
      pushMismatch(
        findings,
        trackRenderedVsAuthorityMismatch === false,
        'Track rendered state diverged from Track authority state.',
        {
          surface:'trackRendered',
          expected:false,
          actual:trackRenderedVsAuthorityMismatch
        }
      );
      if(reviewFromTrackBadge && trackBadge){
        pushMismatch(
          findings,
          normalizeText(trackBadge) === normalizeText(reviewFromTrackBadge),
          'Track badge text diverged from Review badge text after reopen from Track.',
          {
            surface:'trackRendered',
            expected:reviewFromTrackBadge,
            actual:trackBadge
          }
        );
      }
      if(scanScore != null && trackScore != null){
        pushMismatch(
          findings,
          trackScore === scanScore,
          'Track setup score diverged from Scan setup score.',
          {
            surface:'trackRendered',
            expected:scanScore,
            actual:trackScore
          }
        );
      }
      if(trackState && rescanTrackState){
        const preRescanAuthority = trackState.authority && trackState.authority.journey || null;
        const postRescanAuthority = rescanTrackState.authority && rescanTrackState.authority.journey || null;
        const preSource = normalizeVerdict(preRescanAuthority && preRescanAuthority.source);
        const postSource = normalizeVerdict(postRescanAuthority && postRescanAuthority.source);
        const preVersion = Number(preRescanAuthority && preRescanAuthority.version || 0);
        const postVersion = Number(postRescanAuthority && postRescanAuthority.version || 0);
        if(isTrackedAuthoritySource(preSource)){
          pushMismatch(
            findings,
            preSource === postSource,
            'Tracked rescan replaced existing tracked authority source.',
            {
              surface:'authority',
              expected:preRescanAuthority && preRescanAuthority.source,
              actual:postRescanAuthority && postRescanAuthority.source
            }
          );
          pushMismatch(
            findings,
            preVersion === postVersion,
            'Tracked rescan incremented existing tracked authority version.',
            {
              surface:'authority',
              expected:preRescanAuthority && preRescanAuthority.version,
              actual:postRescanAuthority && postRescanAuthority.version
            }
          );
        }
        pushMismatch(
          findings,
          !(isTrackedAuthoritySource(preSource) && postSource === 'scan'),
          'Tracked rescan fell back to scan authority over an existing tracked authority.',
          {
            surface:'authority',
            expected:preRescanAuthority && preRescanAuthority.source,
            actual:postRescanAuthority && postRescanAuthority.source
          }
        );
      }
    }
  }

  if(paperTrade && paperTrade.previewOpened){
    pushMismatch(
      findings,
      !!(paperTrade.state && paperTrade.state.paperTrade && paperTrade.state.paperTrade.context),
      'Paper Trade preview opened without a paper-trade context snapshot.',
      {surface:'paperTrade'}
    );
  }

  return findings;
}

async function runSpecifiedTickerJourney(page, testInfo, ticker){
  const consoleEvents = await attachConsoleRecorder(page);
  const phaseRecorder = createPhaseRecorder(ticker);

  await gotoApp(page, {pp_api_origin:REAL_API_ORIGIN});
  await waitForAppReady(page);
  await dismissOptionalOverlays(page);
  await resetAppState(page);

  phaseRecorder.start('scan');
  await addTickers(page, [ticker]);
  await captureStage(page, testInfo, 'specified-ticker-imported');

  await Promise.all([
    page.waitForResponse(response => /market-data/i.test(response.url()) && response.status() === 200, {timeout:90000}),
    page.locator('#buildBtn').click()
  ]);
  await waitForSpecifiedTickerScan(page, ticker);
  await waitForUiTransitionSettle(page);
  await captureStage(page, testInfo, 'specified-ticker-scan');
  const scanState = await extractAppTickerState(page, ticker, consoleEvents);
  phaseRecorder.end('passed', {
    canonicalVerdict:normalizeText(scanState && scanState.scan && scanState.scan.simplifiedState && scanState.scan.simplifiedState.canonicalVerdict)
  });

  phaseRecorder.start('review');
  await openReviewForTicker(page, ticker);
  await waitForUiTransitionSettle(page);
  await captureStage(page, testInfo, 'specified-ticker-review');
  const reviewState = await extractAppTickerState(page, ticker, consoleEvents);
  phaseRecorder.end('passed', {
    canonicalVerdict:normalizeText(reviewState && reviewState.review && reviewState.review.stateHealth && reviewState.review.stateHealth.canonicalVerdict)
  });

  phaseRecorder.start('track');
  const watchlistAddSucceeded = await addActiveReviewToWatchlistIfEligible(page);
  if(watchlistAddSucceeded){
    await waitForUiTransitionSettle(page);
  }

  await openTrackTab(page);
  const trackCardVisible = watchlistAddSucceeded
    ? await revealTrackCardIfPresent(page, ticker)
    : false;
  await waitForUiTransitionSettle(page);
  await captureStage(page, testInfo, 'specified-ticker-track');
  const trackState = await extractAppTickerState(page, ticker, consoleEvents);
  phaseRecorder.end('passed', {
    trackCardVisible,
    addedToWatchlist:watchlistAddSucceeded
  });

  phaseRecorder.start('rescan');
  await page.locator('[data-workspace-tab="scan"]').click();
  await Promise.all([
    page.waitForResponse(response => /market-data/i.test(response.url()) && response.status() === 200, {timeout:90000}),
    page.locator('#buildBtn').click()
  ]);
  await waitForSpecifiedTickerScan(page, ticker);
  await waitForUiTransitionSettle(page);
  await captureStage(page, testInfo, 'specified-ticker-rescan');

  await openTrackTab(page);
  const rescanTrackCardVisible = watchlistAddSucceeded
    ? await revealTrackCardIfPresent(page, ticker)
    : false;
  await waitForUiTransitionSettle(page);
  const rescanTrackState = await extractAppTickerState(page, ticker, consoleEvents);
  const effectiveTrackCardVisible = !!(
    trackCardVisible
    || rescanTrackCardVisible
    || hasRenderedTrackCard(trackState)
    || hasRenderedTrackCard(rescanTrackState)
  );
  phaseRecorder.end('passed', {
    trackCardVisible:effectiveTrackCardVisible
  });

  phaseRecorder.start('review_from_track');
  if(watchlistAddSucceeded){
    await openReviewFromTrackTicker(page, ticker);
  }else{
    await openReviewForTicker(page, ticker);
  }
  await waitForUiTransitionSettle(page);
  await captureStage(page, testInfo, 'specified-ticker-review-from-track');
  const reviewFromTrackState = await extractAppTickerState(page, ticker, consoleEvents);
  phaseRecorder.end('passed');

  phaseRecorder.start('paper_trade');
  const paperTrade = await capturePaperTradePreview(page, ticker, consoleEvents);
  if(paperTrade.previewOpened){
    await captureStage(page, testInfo, 'specified-ticker-paper-trade-preview');
  }
  phaseRecorder.end('passed', {
    previewOpened:paperTrade.previewOpened
  });

  const mismatchFindings = buildMismatchFindings({
    scanState,
    reviewState,
    trackState,
    rescanTrackState,
    reviewFromTrackState,
    watchlistAddSucceeded,
    trackCardVisible:effectiveTrackCardVisible,
    paperTrade
  });
  appendVisualParityFindings(
    mismatchFindings,
    ticker,
    scanState,
    reviewState,
    rescanTrackState || trackState,
    reviewFromTrackState,
    {trackRendered:effectiveTrackCardVisible}
  );
  if(ticker === 'TROW'){
    const scanCanonicalVerdict = normalizeText(scanState && scanState.normalized && scanState.normalized.scanCanonicalVerdict).toLowerCase();
    const scanVisualBucket = normalizeText(scanState && scanState.normalized && scanState.normalized.scanVisualBucket).toLowerCase();
    const reviewCanonicalVerdict = normalizeText(reviewState && reviewState.normalized && reviewState.normalized.reviewCanonicalVerdict).toLowerCase();
    const reviewVisualBucket = normalizeText(reviewState && reviewState.normalized && reviewState.normalized.reviewVisualBucket).toLowerCase();
    pushMismatch(
      mismatchFindings,
      scanCanonicalVerdict === reviewCanonicalVerdict,
      `${ticker} scan public verdict must align with Review once canonical review authority exists.`,
      {
        surface:'scan',
        expected:reviewCanonicalVerdict,
        actual:scanCanonicalVerdict
      }
    );
    pushMismatch(
      mismatchFindings,
      scanVisualBucket === reviewVisualBucket,
      `${ticker} scan public bucket must align with Review diminishing state once canonical review authority exists.`,
      {
        surface:'scan',
        expected:reviewVisualBucket,
        actual:scanVisualBucket
      }
    );
  }
  const scanVisualBucket = normalizeText(
    scanState && scanState.scan && scanState.scan.visibleCard && scanState.scan.visibleCard.visualTone
    || scanState && scanState.normalized && scanState.normalized.scanVisualBucket
  ).toLowerCase();
  const scanSectionTitle = normalizeText(scanState && scanState.scan && scanState.scan.visibleCard && scanState.scan.visibleCard.sectionTitle);
  const scanBadgeLabel = normalizeText(scanState && scanState.scan && scanState.scan.visibleCard && scanState.scan.visibleCard.badgeLabel);
  const scanDecisionSummary = normalizeText(scanState && scanState.scan && scanState.scan.visibleCard && scanState.scan.visibleCard.decisionSummary);
  if(scanVisualBucket === 'diminishing'){
    pushMismatch(
      mismatchFindings,
      /Diminishing/i.test(scanDecisionSummary) && !/Developing Watch/i.test(scanDecisionSummary),
      `${ticker} diminishing scan card must use diminishing-aligned summary copy.`,
      {
        surface:'scan',
        expected:'Diminishing-aligned summary copy',
        actual:scanDecisionSummary
      }
    );
    pushMismatch(
      mismatchFindings,
      /Diminishing Watch/i.test(scanSectionTitle),
      `${ticker} diminishing scan card must appear in the Diminishing Watch section.`,
      {
        surface:'scan',
        expected:'Diminishing Watch',
        actual:scanSectionTitle
      }
    );
  }
  if(scanVisualBucket === 'monitor'){
    pushMismatch(
      mismatchFindings,
      !/Diminishing Watch|^Avoid\b/i.test(scanDecisionSummary),
      `${ticker} monitor scan card must not render diminishing or avoid summary copy.`,
      {
        surface:'scan',
        expected:'Monitor-aligned summary copy',
        actual:scanDecisionSummary
      }
    );
    pushMismatch(
      mismatchFindings,
      /Monitor \/ Watch/i.test(scanSectionTitle),
      `${ticker} monitor scan card must appear in the Monitor / Watch section.`,
      {
        surface:'scan',
        expected:'Monitor / Watch',
        actual:scanSectionTitle
      }
    );
  }
  if(scanVisualBucket === 'avoid'){
    pushMismatch(
      mismatchFindings,
      /Avoid/i.test(scanDecisionSummary),
      `${ticker} avoid scan card must use avoid-aligned summary copy.`,
      {
        surface:'scan',
        expected:'Avoid-aligned summary copy',
        actual:scanDecisionSummary
      }
    );
    pushMismatch(
      mismatchFindings,
      scanBadgeLabel === 'Avoid',
      `${ticker} avoid scan card must render an Avoid badge.`,
      {
        surface:'scan',
        expected:'Avoid',
        actual:scanBadgeLabel
      }
    );
    pushMismatch(
      mismatchFindings,
      /^Avoid$/i.test(scanSectionTitle),
      `${ticker} avoid scan card must appear in the Avoid section.`,
      {
        surface:'scan',
        expected:'Avoid',
        actual:scanSectionTitle
      }
    );
  }
  const consoleErrors = consoleEvents.filter(entry => entry.type === 'error' || entry.type === 'pageerror');
  const fatalConsoleErrors = consoleErrors.filter(entry => {
    if(entry.type === 'pageerror') return true;
    return !/Failed to load resource: the server responded with a status of 404 \(Not Found\)/i.test(String(entry.text || ''));
  });
  const reportPayload = {
    ticker,
    apiOrigin:REAL_API_ORIGIN,
    generatedAt:new Date().toISOString(),
    phases:phaseRecorder.phases,
    watchlist:{
      addAttempted:true,
      addSucceeded:watchlistAddSucceeded,
      trackCardVisible:effectiveTrackCardVisible
    },
    scan:scanState,
    review:reviewState,
    track:trackState,
    rescanTrack:rescanTrackState,
    reviewFromTrack:reviewFromTrackState,
    paperTrade:{
      eligible:!!(reviewState && reviewState.paperTrade && reviewState.paperTrade.context && reviewState.paperTrade.context.eligibility && reviewState.paperTrade.context.eligibility.eligible === true),
      enabled:!!(reviewState && reviewState.paperTrade && reviewState.paperTrade.button && reviewState.paperTrade.button.enabled === true),
      previewOpened:paperTrade.previewOpened,
      state:paperTrade.state
    },
    consoleErrors,
    fatalConsoleErrors,
    mismatchFindings
  };

  await writeJsonReport(testInfo, 'specified-ticker-journey-report.json', reportPayload);
  const artifactPath = writeArtifactJson(`specified-ticker-journey-${ticker}-${Date.now()}.json`, reportPayload);
  await testInfo.attach('specified-ticker-journey-artifact-path.txt', {
    body:artifactPath,
    contentType:'text/plain'
  });

  expect(
    scanState && scanState.scan && scanState.scan.simplifiedState && normalizeText(scanState.scan.simplifiedState.canonicalVerdict),
    `Scan did not finish for ${ticker}.\n${JSON.stringify(reportPayload, null, 2)}`
  ).toBeTruthy();
  expect(
    reviewState && reviewState.review && reviewState.review.stateHealth && normalizeText(reviewState.review.stateHealth.canonicalVerdict),
    `Review did not resolve canonical state for ${ticker}.\n${JSON.stringify(reportPayload, null, 2)}`
  ).toBeTruthy();
  expect(
    fatalConsoleErrors,
    `Fatal console errors detected for ${ticker}.\n${fatalConsoleErrors.map(entry => entry.text).join('\n')}`
  ).toEqual([]);
  expect(
    mismatchFindings,
    mismatchFindings.length
      ? `Journey mismatches for ${ticker}:\n${JSON.stringify(mismatchFindings, null, 2)}`
      : ''
  ).toEqual([]);
}

for(const ticker of JOURNEY_TICKERS){
  test(`${ticker} can run scan to review to track without synthetic seeding`, async ({page}, testInfo) => {
    try{
      await runSpecifiedTickerJourney(page, testInfo, ticker);
    }catch(error){
      throw error;
    }
  });
}
