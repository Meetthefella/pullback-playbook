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
} = require('./helpers/app-driver');
const {extractAppTickerState} = require('./helpers/app-state');
const {writeJsonReport, writeArtifactJson} = require('./helpers/report');

const REAL_API_ORIGIN = 'https://velvety-clafoutis-8a92bf.netlify.app';
const JOURNEY_TICKER = String(process.env.PP_JOURNEY_TICKER || 'TROW').trim().toUpperCase() || 'TROW';

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

test('specified ticker can run scan to review to track without synthetic seeding', async ({page}, testInfo) => {
  const consoleEvents = await attachConsoleRecorder(page);

  await gotoApp(page, {pp_api_origin:REAL_API_ORIGIN});
  await waitForAppReady(page);
  await dismissOptionalOverlays(page);
  await resetAppState(page);

  await addTickers(page, [JOURNEY_TICKER]);
  await captureStage(page, testInfo, 'specified-ticker-imported');

  await Promise.all([
    page.waitForResponse(response => /market-data/i.test(response.url()) && response.status() === 200, {timeout:90000}),
    page.locator('#buildBtn').click()
  ]);
  await waitForSpecifiedTickerScan(page, JOURNEY_TICKER);
  await waitForUiTransitionSettle(page);
  await captureStage(page, testInfo, 'specified-ticker-scan');

  const scanState = await extractAppTickerState(page, JOURNEY_TICKER, consoleEvents);

  await openReviewForTicker(page, JOURNEY_TICKER);
  await waitForUiTransitionSettle(page);
  await captureStage(page, testInfo, 'specified-ticker-review');
  const reviewState = await extractAppTickerState(page, JOURNEY_TICKER, consoleEvents);

  const watchlistAddSucceeded = await addActiveReviewToWatchlistIfEligible(page);
  if(watchlistAddSucceeded){
    await waitForUiTransitionSettle(page);
  }

  await openTrackTab(page);
  const trackCardVisible = watchlistAddSucceeded
    ? await revealTrackCardIfPresent(page, JOURNEY_TICKER)
    : false;
  await waitForUiTransitionSettle(page);
  await captureStage(page, testInfo, 'specified-ticker-track');
  const trackState = await extractAppTickerState(page, JOURNEY_TICKER, consoleEvents);

  await page.locator('[data-workspace-tab="scan"]').click();
  await Promise.all([
    page.waitForResponse(response => /market-data/i.test(response.url()) && response.status() === 200, {timeout:90000}),
    page.locator('#buildBtn').click()
  ]);
  await waitForSpecifiedTickerScan(page, JOURNEY_TICKER);
  await waitForUiTransitionSettle(page);
  await captureStage(page, testInfo, 'specified-ticker-rescan');

  await openTrackTab(page);
  const rescanTrackCardVisible = watchlistAddSucceeded
    ? await revealTrackCardIfPresent(page, JOURNEY_TICKER)
    : false;
  await waitForUiTransitionSettle(page);
  const rescanTrackState = await extractAppTickerState(page, JOURNEY_TICKER, consoleEvents);
  const effectiveTrackCardVisible = !!(
    trackCardVisible
    || rescanTrackCardVisible
    || hasRenderedTrackCard(trackState)
    || hasRenderedTrackCard(rescanTrackState)
  );

  if(watchlistAddSucceeded){
    await openReviewFromTrackTicker(page, JOURNEY_TICKER);
  }else{
    await openReviewForTicker(page, JOURNEY_TICKER);
  }
  await waitForUiTransitionSettle(page);
  await captureStage(page, testInfo, 'specified-ticker-review-from-track');
  const reviewFromTrackState = await extractAppTickerState(page, JOURNEY_TICKER, consoleEvents);
  const paperTrade = await capturePaperTradePreview(page, JOURNEY_TICKER, consoleEvents);
  if(paperTrade.previewOpened){
    await captureStage(page, testInfo, 'specified-ticker-paper-trade-preview');
  }

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
  if(JOURNEY_TICKER === 'TROW'){
    const scanCanonicalVerdict = normalizeText(scanState && scanState.normalized && scanState.normalized.scanCanonicalVerdict).toLowerCase();
    const scanVisualBucket = normalizeText(scanState && scanState.normalized && scanState.normalized.scanVisualBucket).toLowerCase();
    const reviewCanonicalVerdict = normalizeText(reviewState && reviewState.normalized && reviewState.normalized.reviewCanonicalVerdict).toLowerCase();
    const reviewVisualBucket = normalizeText(reviewState && reviewState.normalized && reviewState.normalized.reviewVisualBucket).toLowerCase();
    pushMismatch(
      mismatchFindings,
      scanCanonicalVerdict === reviewCanonicalVerdict,
      'TROW scan public verdict must align with Review once canonical review authority exists.',
      {
        surface:'scan',
        expected:reviewCanonicalVerdict,
        actual:scanCanonicalVerdict
      }
    );
    pushMismatch(
      mismatchFindings,
      scanVisualBucket === reviewVisualBucket,
      'TROW scan public bucket must align with Review diminishing state once canonical review authority exists.',
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
  const scanBadgeLabel = normalizeText(scanState && scanState.scan && scanState.scan.visibleCard && scanState.scan.visibleCard.badgeLabel);
  const scanDecisionSummary = normalizeText(scanState && scanState.scan && scanState.scan.visibleCard && scanState.scan.visibleCard.decisionSummary);
  if(scanVisualBucket === 'diminishing'){
    pushMismatch(
      mismatchFindings,
      /Diminishing/i.test(scanDecisionSummary) && !/Developing Watch/i.test(scanDecisionSummary),
      `${JOURNEY_TICKER} diminishing scan card must use diminishing-aligned summary copy.`,
      {
        surface:'scan',
        expected:'Diminishing-aligned summary copy',
        actual:scanDecisionSummary
      }
    );
  }
  if(scanVisualBucket === 'monitor'){
    pushMismatch(
      mismatchFindings,
      !/Diminishing Watch|^Avoid\b/i.test(scanDecisionSummary),
      `${JOURNEY_TICKER} monitor scan card must not render diminishing or avoid summary copy.`,
      {
        surface:'scan',
        expected:'Monitor-aligned summary copy',
        actual:scanDecisionSummary
      }
    );
  }
  if(scanVisualBucket === 'avoid'){
    pushMismatch(
      mismatchFindings,
      /Avoid/i.test(scanDecisionSummary),
      `${JOURNEY_TICKER} avoid scan card must use avoid-aligned summary copy.`,
      {
        surface:'scan',
        expected:'Avoid-aligned summary copy',
        actual:scanDecisionSummary
      }
    );
    pushMismatch(
      mismatchFindings,
      scanBadgeLabel === 'Avoid',
      `${JOURNEY_TICKER} avoid scan card must render an Avoid badge.`,
      {
        surface:'scan',
        expected:'Avoid',
        actual:scanBadgeLabel
      }
    );
  }
  const consoleErrors = consoleEvents.filter(entry => entry.type === 'error' || entry.type === 'pageerror');
  const fatalConsoleErrors = consoleErrors.filter(entry => {
    if(entry.type === 'pageerror') return true;
    return !/Failed to load resource: the server responded with a status of 404 \(Not Found\)/i.test(String(entry.text || ''));
  });
  const reportPayload = {
    ticker:JOURNEY_TICKER,
    apiOrigin:REAL_API_ORIGIN,
    generatedAt:new Date().toISOString(),
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
  const artifactPath = writeArtifactJson(`specified-ticker-journey-${JOURNEY_TICKER}-${Date.now()}.json`, reportPayload);
  await testInfo.attach('specified-ticker-journey-artifact-path.txt', {
    body:artifactPath,
    contentType:'text/plain'
  });

  expect(
    scanState && scanState.scan && scanState.scan.simplifiedState && normalizeText(scanState.scan.simplifiedState.canonicalVerdict),
    `Scan did not finish for ${JOURNEY_TICKER}.\n${JSON.stringify(reportPayload, null, 2)}`
  ).toBeTruthy();
  expect(
    reviewState && reviewState.review && reviewState.review.stateHealth && normalizeText(reviewState.review.stateHealth.canonicalVerdict),
    `Review did not resolve canonical state for ${JOURNEY_TICKER}.\n${JSON.stringify(reportPayload, null, 2)}`
  ).toBeTruthy();
  expect(
    fatalConsoleErrors,
    `Fatal console errors detected for ${JOURNEY_TICKER}.\n${fatalConsoleErrors.map(entry => entry.text).join('\n')}`
  ).toEqual([]);
  expect(
    mismatchFindings,
    mismatchFindings.length
      ? `Journey mismatches for ${JOURNEY_TICKER}:\n${JSON.stringify(mismatchFindings, null, 2)}`
      : ''
  ).toEqual([]);
});
