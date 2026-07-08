const {test, expect} = require('@playwright/test');
const {
  gotoApp,
  waitForAppReady,
  dismissOptionalOverlays,
  waitForUiTransitionSettle,
  openReviewForTicker,
  addActiveReviewToWatchlistIfEligible,
  openTrackTab
} = require('../helpers/app-driver');

async function bootApp(page){
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

test('AMZN scan card parity keeps rendered diminishing/monitor bucket aligned with canonical replay state', async ({page}) => {
  await bootApp(page);

  await page.locator('#buildBtn').click();
  await page.waitForFunction(() => typeof rankedTickerRecords === 'function' && rankedTickerRecords().length > 0, null, {timeout:90000});
  await waitForUiTransitionSettle(page);

  const amzn = await page.evaluate(() => {
    const ticker = 'AMZN';
    const record = typeof getTickerRecord === 'function' ? getTickerRecord(ticker) : null;
    const simplified = record && typeof resolveSimplifiedStateForSurface === 'function'
      ? resolveSimplifiedStateForSurface(record, 'scan', {source:'amzn_scan_parity', mutationSource:'amzn_scan_parity'})
      : null;
    const reviewStateHealth = record && typeof currentReviewStateHealthSnapshot === 'function'
      ? currentReviewStateHealthSnapshot(record)
      : null;
    const card = document.querySelector(`#results .resultcompact[data-ticker="${ticker}"]`);
    const badge = card && card.querySelector('.badge.state-pill');
    return {
      simplified:simplified ? {
        canonicalVerdict:String(simplified.canonicalVerdict || '').trim().toLowerCase(),
        visualBucket:String(simplified.visualBucket || '').trim().toLowerCase(),
        tone:String(simplified.tone || '').trim().toLowerCase(),
        badgeLabel:String(simplified.badgeLabel || '').trim(),
        actionLabel:String(simplified.actionLabel || '').trim(),
        mainBlocker:String(simplified.mainBlocker || '').trim()
      } : null,
      reviewStateHealth:reviewStateHealth ? {
        canonicalVerdict:String(reviewStateHealth.canonicalVerdict || '').trim().toLowerCase(),
        visualBucket:String(reviewStateHealth.visualBucket || '').trim().toLowerCase()
      } : null,
      rendered:card ? {
        className:String(card.className || ''),
        visualTone:String(card.getAttribute('data-visual-tone') || '').trim().toLowerCase(),
        visualState:String(card.getAttribute('data-visual-state') || '').trim().toLowerCase(),
        sourceVerdict:String(card.getAttribute('data-source-verdict') || '').trim(),
        badgeText:String(badge && badge.textContent || '').replace(/\s+/g, ' ').trim(),
        text:String(card.textContent || '').replace(/\s+/g, ' ').trim()
      } : null
    };
  });

  expect(amzn.simplified, 'AMZN must expose a scan simplified state.').toBeTruthy();
  expect(amzn.reviewStateHealth, 'AMZN must expose review canonical state for parity comparison.').toBeTruthy();
  expect(amzn.rendered, 'AMZN must render a visible scan card.').toBeTruthy();

  const renderedBucket = amzn.rendered.visualTone;
  const simplifiedBucket = amzn.simplified.visualBucket;
  const canonicalVerdict = amzn.simplified.canonicalVerdict;

  expect(
    amzn.rendered.visualState,
    `AMZN rendered scan state must stay aligned with canonical watch verdict.\n${JSON.stringify({amzn}, null, 2)}`
  ).toBe(canonicalVerdict);

  expect(
    renderedBucket,
    `AMZN rendered scan tone must match scan simplified visual bucket.\n${JSON.stringify({amzn}, null, 2)}`
  ).toBe(simplifiedBucket);

  expect(
    amzn.reviewStateHealth.canonicalVerdict,
    `AMZN review canonical verdict must match scan canonical verdict.\n${JSON.stringify({amzn}, null, 2)}`
  ).toBe(canonicalVerdict);
});

test('AMZN setup score stays aligned across scan review and track', async ({page}) => {
  await bootApp(page);

  await page.locator('#buildBtn').click();
  await page.waitForFunction(() => typeof rankedTickerRecords === 'function' && rankedTickerRecords().length > 0, null, {timeout:90000});
  await waitForUiTransitionSettle(page);

  await openReviewForTicker(page, 'AMZN');
  await waitForUiTransitionSettle(page);
  const reviewSnapshot = await page.evaluate(() => {
    const ticker = 'AMZN';
    const reviewScore = document.querySelector('.reviewworkspace-shell .review-summary-right .score.visual-score');
    const reviewQuality = document.getElementById('setupQualityText');
    return {
      reviewScoreText: reviewScore ? reviewScore.textContent.replace(/\s+/g, ' ').trim() : '',
      reviewQualityPresent: !!reviewQuality,
      reviewQualityText: reviewQuality ? reviewQuality.textContent.replace(/\s+/g, ' ').trim() : '',
      reviewRendered: !!document.querySelector(`.reviewworkspace-shell [data-rendered-review-ticker="${ticker}"], .reviewworkspace-shell[data-rendered-review-ticker="${ticker}"]`)
    };
  });
  await addActiveReviewToWatchlistIfEligible(page);
  await openTrackTab(page);
  await waitForUiTransitionSettle(page);

  const amzn = await page.evaluate(() => {
    const ticker = 'AMZN';
    const record = typeof getTickerRecord === 'function' ? getTickerRecord(ticker) : null;
    const canonicalScore = record && typeof setupScoreForRecord === 'function'
      ? setupScoreForRecord(record)
      : null;
    const scanCard = document.querySelector(`#results .resultcompact[data-ticker="${ticker}"]`);
    const trackCard = Array.from(document.querySelectorAll('.watchlist-card')).find(card => {
      const tickerNode = card.querySelector('.watchlist-card__ticker');
      return tickerNode && tickerNode.textContent.trim().toUpperCase() === ticker;
    });
    const trackScore = trackCard && trackCard.querySelector('.score.watchlistscore, .score.visual-score');
    const trackSnapshot = record && typeof trackCardRenderSignatureSnapshot === 'function'
      ? trackCardRenderSignatureSnapshot(record)
      : null;
    return {
      canonicalScore,
      storedSetupScore: record && record.setup ? record.setup.score : null,
      scoreTrace: record && typeof setupScoreTraceForRecord === 'function' ? setupScoreTraceForRecord(record) : null,
      scanScoreText: scanCard && scanCard.querySelector('.scan-card__score')
        ? scanCard.querySelector('.scan-card__score').textContent.replace(/\s+/g, ' ').trim()
        : '',
      trackScoreText: trackScore ? trackScore.textContent.replace(/\s+/g, ' ').trim() : '',
      trackSnapshot
    };
  });

  const expectedScoreText = `Setup ${amzn.canonicalScore}/10`;
  const expectedTrackScoreText = `${amzn.canonicalScore}/10`;
  const expectedReviewQuality = new RegExp(`\\(${amzn.canonicalScore}/10\\)$`);

  expect(reviewSnapshot.reviewRendered, `AMZN review workspace must be rendered.\n${JSON.stringify({amzn, reviewSnapshot}, null, 2)}`).toBe(true);
  expect(amzn.canonicalScore, `AMZN must expose one canonical setup score.\n${JSON.stringify({amzn}, null, 2)}`).not.toBeNull();
  expect(
    amzn.storedSetupScore,
    `AMZN stored setup score must match the canonical setup score used by Scan and Track.\n${JSON.stringify({amzn}, null, 2)}`
  ).toBe(amzn.canonicalScore);
  expect(
    amzn.scanScoreText,
    `AMZN scan score must match canonical setup score.\n${JSON.stringify({amzn}, null, 2)}`
  ).toBe(expectedScoreText);
  expect(
    reviewSnapshot.reviewScoreText,
    `AMZN review score badge must match canonical setup score.\n${JSON.stringify({amzn, reviewSnapshot}, null, 2)}`
  ).toBe(expectedScoreText);
  if(reviewSnapshot.reviewQualityPresent){
    expect(
      reviewSnapshot.reviewQualityText,
      `AMZN review setup-quality panel must match canonical setup score.\n${JSON.stringify({amzn, reviewSnapshot}, null, 2)}`
    ).toMatch(expectedReviewQuality);
  }
  expect(
    amzn.trackScoreText,
    `AMZN track score must match canonical setup score.\n${JSON.stringify({amzn}, null, 2)}`
  ).toBe(expectedTrackScoreText);
  expect(
    amzn.trackSnapshot && amzn.trackSnapshot.score,
    `AMZN track snapshot score authority must match canonical setup score.\n${JSON.stringify({amzn}, null, 2)}`
  ).toBe(String(amzn.canonicalScore));
});
