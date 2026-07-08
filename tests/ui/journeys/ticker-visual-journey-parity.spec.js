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
const {loadTickerFixture} = require('../helpers/ticker-fixture');

const REAL_API_ORIGIN = 'https://velvety-clafoutis-8a92bf.netlify.app';
const JOURNEY_TICKERS = (() => {
  const loaded = loadTickerFixture();
  return loaded.length ? loaded : ['UNP', 'TROW', 'NVDA'];
})();

function normalizeText(value){
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeKey(value){
  return normalizeText(value).toLowerCase().replace(/\s+/g, '_');
}

function normalizeBucket(value){
  const normalized = normalizeKey(value);
  if(normalized === 'watch') return 'monitor';
  return normalized;
}

function normalizeVerdict(value){
  const normalized = normalizeText(value).toLowerCase().replace(/\s+/g, '_');
  return normalized;
}

async function waitForTickerScan(page, ticker){
  await page.waitForFunction(symbol => {
    const card = document.querySelector(`#results .resultcompact[data-ticker="${symbol}"]`);
    if(!card || typeof getTickerRecord !== 'function') return false;
    const record = getTickerRecord(symbol);
    const resolvedVerdict = String(
      record && record.scan && (record.scan.resolvedVerdict || record.scan.verdict) || ''
    ).trim();
    return !!(record && record.scan && resolvedVerdict);
  }, ticker, {timeout:90000});
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

function buildSurfaceMismatch(stage, ticker, expected, actual, extra = {}){
  return {
    ticker,
    stage,
    expected,
    actual,
    ...extra
  };
}

test(`${JOURNEY_TICKERS.join(', ')} keep bucket presentation and card tone aligned across the app journey`, async ({page}, testInfo) => {
  const consoleEvents = await attachConsoleRecorder(page);

  await gotoApp(page, {pp_api_origin:REAL_API_ORIGIN});
  await waitForAppReady(page);
  await dismissOptionalOverlays(page);
  await resetAppState(page);

  await addTickers(page, JOURNEY_TICKERS);
  await captureStage(page, testInfo, 'visual-journey-tickers-added');

  await Promise.all([
    page.waitForResponse(response => /market-data/i.test(response.url()) && response.status() === 200, {timeout:90000}),
    page.locator('#buildBtn').click()
  ]);

  const reports = [];
  for(const ticker of JOURNEY_TICKERS){
    await waitForTickerScan(page, ticker);
    await waitForUiTransitionSettle(page);

    const scanState = await extractAppTickerState(page, ticker, consoleEvents);
    const scanExpectedBucket = normalizeBucket(scanState && scanState.normalized && scanState.normalized.scanVisualBucket);
    const scanExpectedVerdict = normalizeVerdict(scanState && scanState.normalized && scanState.normalized.scanCanonicalVerdict);
    const scanVisibleTone = normalizeBucket(scanState && scanState.scan && scanState.scan.visibleCard && scanState.scan.visibleCard.visualTone);
    const scanVisibleState = normalizeVerdict(scanState && scanState.scan && scanState.scan.visibleCard && scanState.scan.visibleCard.visualState);
    const mismatches = [];

    if(scanExpectedBucket){
      if(scanVisibleTone !== scanExpectedBucket){
        mismatches.push(buildSurfaceMismatch('scan_tone', ticker, scanExpectedBucket, scanVisibleTone));
      }
      if(scanVisibleState !== scanExpectedVerdict){
        mismatches.push(buildSurfaceMismatch('scan_state', ticker, scanExpectedVerdict, scanVisibleState, {
          canonicalVerdict:scanExpectedVerdict
        }));
      }
    }

    await openReviewForTicker(page, ticker);
    await waitForUiTransitionSettle(page);
    const reviewState = await extractAppTickerState(page, ticker, consoleEvents);
    const reviewExpectedBucket = normalizeBucket(reviewState && reviewState.normalized && reviewState.normalized.reviewVisualBucket);
    const reviewExpectedVerdict = normalizeVerdict(reviewState && reviewState.normalized && reviewState.normalized.reviewCanonicalVerdict);
    const reviewVisibleTone = normalizeBucket(reviewState && reviewState.review && reviewState.review.visible && reviewState.review.visible.currentTone);
    const reviewVisibleState = normalizeVerdict(reviewState && reviewState.review && reviewState.review.visible && reviewState.review.visible.currentVerdict);

    if(reviewExpectedBucket){
      if(reviewVisibleTone !== reviewExpectedBucket){
        mismatches.push(buildSurfaceMismatch('review_tone', ticker, reviewExpectedBucket, reviewVisibleTone));
      }
      if(reviewVisibleState !== reviewExpectedVerdict){
        mismatches.push(buildSurfaceMismatch('review_state', ticker, reviewExpectedVerdict, reviewVisibleState, {
          canonicalVerdict:reviewExpectedVerdict
        }));
      }
    }

    const addedToWatchlist = await addActiveReviewToWatchlistIfEligible(page);
    if(!addedToWatchlist){
      mismatches.push(buildSurfaceMismatch('watchlist_add', ticker, 'eligible', 'not_eligible'));
    }

    await openTrackTab(page);
    const trackCardVisible = await revealTrackCardIfPresent(page, ticker);
    await waitForUiTransitionSettle(page);
    const trackState = await extractAppTickerState(page, ticker, consoleEvents);
    const trackExpectedBucket = normalizeBucket(trackState && trackState.normalized && (
      trackState.normalized.trackAuthorityBucket
      || trackState.normalized.trackVisualBucket
    ));
    const trackExpectedVerdict = normalizeVerdict(trackState && trackState.normalized && (
      trackState.normalized.trackAuthorityCanonicalVerdict
      || trackState.normalized.trackCanonicalVerdict
    ));
    const trackVisibleTone = normalizeBucket(trackState && trackState.track && trackState.track.visible && trackState.track.visible.visualTone);
    const trackVisibleState = normalizeVerdict(trackState && trackState.track && trackState.track.visible && trackState.track.visible.visualState);

    if(addedToWatchlist){
      if(!trackCardVisible){
        mismatches.push(buildSurfaceMismatch('track_card', ticker, 'visible', 'hidden'));
      }
      if(trackExpectedBucket){
        if(trackVisibleTone !== trackExpectedBucket){
          mismatches.push(buildSurfaceMismatch('track_tone', ticker, trackExpectedBucket, trackVisibleTone));
        }
        if(trackVisibleState !== trackExpectedVerdict){
          mismatches.push(buildSurfaceMismatch('track_state', ticker, trackExpectedVerdict, trackVisibleState, {
            canonicalVerdict:trackExpectedVerdict
          }));
        }
      }
    }

    await openReviewFromTrackTicker(page, ticker);
    await waitForUiTransitionSettle(page);
    const reviewFromTrackState = await extractAppTickerState(page, ticker, consoleEvents);
    const reviewFromTrackExpectedBucket = normalizeBucket(
      reviewFromTrackState && reviewFromTrackState.normalized && reviewFromTrackState.normalized.reviewVisualBucket
    );
    const reviewFromTrackExpectedVerdict = normalizeVerdict(
      reviewFromTrackState && reviewFromTrackState.normalized && reviewFromTrackState.normalized.reviewCanonicalVerdict
    );
    const reviewFromTrackTone = normalizeBucket(
      reviewFromTrackState && reviewFromTrackState.review && reviewFromTrackState.review.visible && reviewFromTrackState.review.visible.currentTone
    );
    const reviewFromTrackVisibleState = normalizeVerdict(
      reviewFromTrackState && reviewFromTrackState.review && reviewFromTrackState.review.visible && reviewFromTrackState.review.visible.currentVerdict
    );

    if(reviewFromTrackExpectedBucket){
      if(reviewFromTrackTone !== reviewFromTrackExpectedBucket){
        mismatches.push(buildSurfaceMismatch('review_from_track_tone', ticker, reviewFromTrackExpectedBucket, reviewFromTrackTone));
      }
      if(reviewFromTrackVisibleState !== reviewFromTrackExpectedVerdict){
        mismatches.push(buildSurfaceMismatch('review_from_track_state', ticker, reviewFromTrackExpectedVerdict, reviewFromTrackVisibleState, {
          canonicalVerdict:reviewFromTrackExpectedVerdict
        }));
      }
    }

    reports.push({
      ticker,
      scanState,
      reviewState,
      trackState,
      reviewFromTrackState,
      mismatches
    });

    await captureStage(page, testInfo, `visual-journey-${ticker.toLowerCase()}-review-from-track`);
    await page.locator('[data-workspace-tab="scan"]').click();
    await waitForUiTransitionSettle(page);
  }

  const reportPayload = {
    tickers:JOURNEY_TICKERS,
    apiOrigin:REAL_API_ORIGIN,
    generatedAt:new Date().toISOString(),
    reports
  };
  await writeJsonReport(testInfo, 'ticker-visual-journey-parity-report.json', reportPayload);
  const artifactPath = writeArtifactJson(`ticker-visual-journey-parity-${Date.now()}.json`, reportPayload);
  await testInfo.attach('ticker-visual-journey-parity-artifact-path.txt', {
    body:artifactPath,
    contentType:'text/plain'
  });

  const allMismatches = reports.flatMap(report => report.mismatches.map(mismatch => ({
    ticker:report.ticker,
    ...mismatch
  })));
  expect(
    allMismatches,
    allMismatches.length
      ? `Visual journey mismatches:\n${JSON.stringify(allMismatches, null, 2)}`
      : ''
  ).toEqual([]);
});
