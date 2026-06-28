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
  openTrackTab,
  waitForUiTransitionSettle
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
    const reviewOpenImmediateAppState = await extractAppTickerState(page, ticker, consoleEvents);
    await waitForUiTransitionSettle(page);
    await captureStage(page, testInfo, `${ticker.toLowerCase()}-review`);
    const preWatchlistAppState = await extractAppTickerState(page, ticker, consoleEvents);
    assertReplaySnapshotContract(preWatchlistAppState.snapshot, ticker);
    const addedToWatchlist = await addActiveReviewToWatchlistIfEligible(page);
    const postAddAppState = await extractAppTickerState(page, ticker, consoleEvents);
    assertReplaySnapshotContract(postAddAppState.snapshot, ticker);
    let trackOpenImmediateAppState = null;
    if(addedToWatchlist){
      await openTrackTab(page);
      trackOpenImmediateAppState = await extractAppTickerState(page, ticker, consoleEvents);
      await waitForUiTransitionSettle(page);
      await captureStage(page, testInfo, `${ticker.toLowerCase()}-track`);
    }
    const appState = await extractAppTickerState(page, ticker, consoleEvents);
    assertReplaySnapshotContract(appState.snapshot, ticker);
    expect(appState.snapshot, `Missing replay snapshot source for ${ticker}`).toBeTruthy();
    expect(
      appState.snapshot.plan,
      `${ticker} replay snapshot must carry current plan authority from the live record.`
    ).toBeTruthy();
    expect(
      appState.snapshot.scan && appState.snapshot.scan.analysisProjection,
      `${ticker} replay snapshot must carry scan.analysisProjection from the live record.`
    ).toBeTruthy();
    const replayRun = runReplayForSnapshot(appState.snapshot);
    const diagnosis = diagnoseParity(appState, replayRun.result);
    const stageMutation = {
      reviewOpenTransition:summarizeStageMutation(reviewOpenImmediateAppState, preWatchlistAppState, {
        label:'review_open_transition',
        addedToWatchlist:false
      }),
      reviewToPostAdd:summarizeStageMutation(preWatchlistAppState, postAddAppState, {
        label:'review_to_post_add',
        addedToWatchlist
      }),
      trackOpenTransition:summarizeStageMutation(trackOpenImmediateAppState, appState, {
        label:'track_open_transition',
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
    const reviewOpenImmediateState = reviewOpenImmediateAppState && reviewOpenImmediateAppState.review && reviewOpenImmediateAppState.review.stateHealth
      ? reviewOpenImmediateAppState.review.stateHealth
      : {};
    const replayCanonicalVerdict = String(replayRun.result && replayRun.result.reviewCanonicalVerdict || '').trim().toLowerCase();
    const preReviewCanonicalVerdict = String(preReviewState.canonicalVerdict || '').trim().toLowerCase();
    const preReviewPriceabilityState = String(preReviewState.priceabilityState || '').trim().toLowerCase();
    const reviewOpenImmediateCanonicalVerdict = String(reviewOpenImmediateState.canonicalVerdict || '').trim().toLowerCase();
    const reviewOpenImmediatePriceabilityState = String(reviewOpenImmediateState.priceabilityState || '').trim().toLowerCase();
    if(replayCanonicalVerdict === 'entry'
      && reviewOpenImmediateCanonicalVerdict === 'entry'
      && reviewOpenImmediatePriceabilityState === 'priceable'){
      expect(
        stageMutation.reviewOpenTransition.firstMutatedField,
        `${ticker} opening Review must not autosave-mutate canonical verdict away from a fresh Entry/priceable parity state.`
      ).not.toBe('reviewCanonicalVerdict');
      expect(
        stageMutation.reviewOpenTransition.firstMutatedField,
        `${ticker} opening Review must not autosave-mutate priceability away from a fresh Entry/priceable parity state.`
      ).not.toBe('reviewPriceabilityState');
    }
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
      reviewOpenImmediateAppResult:reviewOpenImmediateAppState,
      preWatchlistAppResult:preWatchlistAppState,
      postAddAppResult:postAddAppState,
      trackOpenImmediateAppResult:trackOpenImmediateAppState,
      appResult:appState,
      snapshotContract:appState.snapshotContract,
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

function assertReplaySnapshotContract(snapshot, ticker){
  expect(snapshot, `${ticker} replay snapshot must be present.`).toBeTruthy();
  expect(snapshot.scan, `${ticker} replay snapshot must include scan authority.`).toBeTruthy();
  expect(
    snapshot.scan && snapshot.scan.analysisProjection,
    `${ticker} replay snapshot must include scan.analysisProjection.`
  ).toBeTruthy();
  expect(snapshot.plan, `${ticker} replay snapshot must include the current plan.`).toBeTruthy();
  expect(snapshot.review, `${ticker} replay snapshot must include review authority.`).toBeTruthy();
  expect(
    snapshot.review && snapshot.review.analysisState && Object.prototype.hasOwnProperty.call(snapshot.review.analysisState, 'normalized'),
    `${ticker} replay snapshot must carry review.analysisState.normalized when present.`
  ).toBeTruthy();
  expect(
    snapshot.watchlist,
    `${ticker} replay snapshot must not include watchlist presentation/debug authority.`
  ).toBeUndefined();
  expect(
    snapshot.track,
    `${ticker} replay snapshot must not include track presentation/debug authority.`
  ).toBeUndefined();
}

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
