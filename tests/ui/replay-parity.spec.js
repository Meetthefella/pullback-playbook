const {test, expect} = require('@playwright/test');
const {
  attachConsoleRecorder,
  captureStage,
  gotoApp,
  waitForAppReady,
  dismissOptionalOverlays,
  resetAppState,
  addTickers,
  runScan,
  openReviewForTicker,
  addActiveReviewToWatchlistIfEligible,
  openTrackTab
} = require('./helpers/app-driver');
const {extractAppTickerState} = require('./helpers/app-state');
const {diagnoseParity} = require('./helpers/parity-diff');
const {runReplayForSnapshot} = require('./helpers/replay-runner');
const {writeJsonReport, writeArtifactJson} = require('./helpers/report');
const {loadTickerFixture} = require('./helpers/ticker-fixture');

test('deployed app stays in parity with replay output for supplied tickers', async ({page}, testInfo) => {
  const consoleEvents = await attachConsoleRecorder(page);
  const tickers = loadTickerFixture();
  expect(tickers.length).toBeGreaterThan(0);

  await gotoApp(page);
  await waitForAppReady(page);
  await dismissOptionalOverlays(page);
  await resetAppState(page);
  await captureStage(page, testInfo, 'parity-ready');

  await addTickers(page, tickers);
  await captureStage(page, testInfo, 'parity-tickers-added');
  await runScan(page, tickers.length);
  await captureStage(page, testInfo, 'parity-scan-results');

  const reports = [];
  for(const ticker of tickers){
    await openReviewForTicker(page, ticker);
    await captureStage(page, testInfo, `${ticker.toLowerCase()}-review`);
    const preWatchlistAppState = await extractAppTickerState(page, ticker, consoleEvents);
    const addedToWatchlist = await addActiveReviewToWatchlistIfEligible(page);
    const postAddAppState = await extractAppTickerState(page, ticker, consoleEvents);
    if(addedToWatchlist){
      await openTrackTab(page);
      await captureStage(page, testInfo, `${ticker.toLowerCase()}-track`);
    }
    const appState = await extractAppTickerState(page, ticker, consoleEvents);
    expect(appState.snapshot, `Missing replay snapshot source for ${ticker}`).toBeTruthy();
    const replayRun = runReplayForSnapshot(appState.snapshot);
    const diagnosis = diagnoseParity(appState, replayRun.result);
    const stageMutation = {
      reviewToPostAdd:summarizeStageMutation(preWatchlistAppState, postAddAppState, {
        label:'review_to_post_add',
        addedToWatchlist
      }),
      postAddToPostTrack:summarizeStageMutation(postAddAppState, appState, {
        label:'post_add_to_post_track',
        addedToWatchlist
      }),
      reviewToPostTrack:summarizeStageMutation(preWatchlistAppState, appState, {
        label:'review_to_post_track',
        addedToWatchlist
      })
    };
    const preReviewState = preWatchlistAppState && preWatchlistAppState.review && preWatchlistAppState.review.stateHealth
      ? preWatchlistAppState.review.stateHealth
      : {};
    const replayCanonicalVerdict = String(replayRun.result && replayRun.result.reviewCanonicalVerdict || '').trim().toLowerCase();
    const preReviewCanonicalVerdict = String(preReviewState.canonicalVerdict || '').trim().toLowerCase();
    const preReviewPriceabilityState = String(preReviewState.priceabilityState || '').trim().toLowerCase();
    if(addedToWatchlist
      && replayCanonicalVerdict === 'entry'
      && preReviewCanonicalVerdict === 'entry'
      && preReviewPriceabilityState === 'priceable'){
      expect(
        stageMutation.reviewToPostAdd.firstMutatedField,
        `${ticker} must not first mutate at watchlistDowngradeReason during Review -> postAdd for a fresh Entry/priceable parity case.`
      ).not.toBe('watchlistDowngradeReason');
    }
    reports.push({
      ticker,
      preWatchlistAppResult:preWatchlistAppState,
      postAddAppResult:postAddAppState,
      appResult:appState,
      replayResult:replayRun.result,
      replayReportText:replayRun.reportText,
      firstDivergence:diagnosis,
      stageMutation
    });
  }

  const reportPayload = {
    baseURL:testInfo.project.use.baseURL,
    tickers,
    generatedAt:new Date().toISOString(),
    reports
  };
  await writeJsonReport(testInfo, 'replay-parity-report.json', reportPayload);
  const artifactName = `parity-report-${new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_')}.json`;
  const artifactPath = writeArtifactJson(artifactName, reportPayload);
  await testInfo.attach('parity-artifact-path.txt', {
    body:artifactPath,
    contentType:'text/plain'
  });

  const mismatches = reports.filter(entry => entry.firstDivergence.hasMismatch);
  expect(
    mismatches,
    mismatches.length
      ? `Parity mismatches:\n${mismatches.map(entry => `${entry.ticker}: ${entry.firstDivergence.firstDifferingField} | ${entry.firstDivergence.firstFunction} | ${entry.firstDivergence.verdict}`).join('\n')}`
      : ''
  ).toEqual([]);
});

function summarizeStageMutation(preTrackState, postTrackState, context = {}){
  const fields = [
    ['reviewCanonicalVerdict', preTrackState && preTrackState.review && preTrackState.review.stateHealth && preTrackState.review.stateHealth.canonicalVerdict, postTrackState && postTrackState.review && postTrackState.review.stateHealth && postTrackState.review.stateHealth.canonicalVerdict, 'resolveSimplifiedStateForSurface(review)'],
    ['reviewVisualBucket', preTrackState && preTrackState.review && preTrackState.review.stateHealth && preTrackState.review.stateHealth.visualBucket, postTrackState && postTrackState.review && postTrackState.review.stateHealth && postTrackState.review.stateHealth.visualBucket, 'resolveSimplifiedStateForSurface(review)'],
    ['reviewPriceabilityState', preTrackState && preTrackState.review && preTrackState.review.stateHealth && preTrackState.review.stateHealth.priceabilityState, postTrackState && postTrackState.review && postTrackState.review.stateHealth && postTrackState.review.stateHealth.priceabilityState, 'resolveSimplifiedStateForSurface(review)'],
    ['trackCanonicalVerdict', preTrackState && preTrackState.track && preTrackState.track.simplifiedState && preTrackState.track.simplifiedState.canonicalVerdict, postTrackState && postTrackState.track && postTrackState.track.simplifiedState && postTrackState.track.simplifiedState.canonicalVerdict, 'buildSharedReviewTrackPresentation(track)'],
    ['trackPriceabilityState', preTrackState && preTrackState.track && preTrackState.track.simplifiedState && preTrackState.track.simplifiedState.priceabilityState, postTrackState && postTrackState.track && postTrackState.track.simplifiedState && postTrackState.track.simplifiedState.priceabilityState, 'buildSharedReviewTrackPresentation(track)'],
    ['watchlistAuthorityReasonCode', preTrackState && preTrackState.track && preTrackState.track.diagnostics && preTrackState.track.diagnostics.watchlistDebug && preTrackState.track.diagnostics.watchlistDebug.scanner_estimate_authority_reason_code, postTrackState && postTrackState.track && postTrackState.track.diagnostics && postTrackState.track.diagnostics.watchlistDebug && postTrackState.track.diagnostics.watchlistDebug.scanner_estimate_authority_reason_code, 'watchlist lifecycle / authority handoff'],
    ['watchlistDowngradeReason', preTrackState && preTrackState.track && preTrackState.track.diagnostics && preTrackState.track.diagnostics.watchlistDebug && preTrackState.track.diagnostics.watchlistDebug.downgradeReason, postTrackState && postTrackState.track && postTrackState.track.diagnostics && postTrackState.track.diagnostics.watchlistDebug && postTrackState.track.diagnostics.watchlistDebug.downgradeReason, 'watchlist lifecycle / downgrade path']
  ];

  const firstMutation = fields.find(([, before, after]) => JSON.stringify(before) !== JSON.stringify(after));
  return {
    stage:String(context.label || ''),
    addedToWatchlist:context.addedToWatchlist === true,
    firstMutatedField:firstMutation ? firstMutation[0] : '',
    before:firstMutation ? firstMutation[1] ?? null : null,
    after:firstMutation ? firstMutation[2] ?? null : null,
    likelyFunction:firstMutation ? firstMutation[3] : '',
    hasMutation:!!firstMutation
  };
}
