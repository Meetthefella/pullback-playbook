const {test, expect} = require('@playwright/test');
const {
  attachConsoleRecorder,
  buildAppUrl,
  waitForAppReady,
  dismissOptionalOverlays,
  resetAppState,
  addTickers,
  openReviewForTicker,
  addActiveReviewToWatchlistIfEligible,
  openTrackTab,
  openWorkspaceTab,
  openReviewFromTrackTicker,
  reloadApp,
  waitForUiTransitionSettle
} = require('../helpers/app-driver');
const {extractAppTickerState} = require('../helpers/app-state');
const {writeJsonReport, writeArtifactJson} = require('../helpers/report');

const DEPLOYED_BASE_URL = String(
  process.env.PP_DEPLOYED_BASE_URL
  || process.env.PP_LIVE_BASE_URL
  || 'https://velvety-clafoutis-8a92bf.netlify.app'
).trim().replace(/\/+$/, '');
const LIVE_TICKER = String(process.env.PP_LIVE_AUTHORITY_TICKER || 'TROW').trim().toUpperCase() || 'TROW';

function normalizeText(value){
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeKey(value){
  return normalizeText(value).toLowerCase().replace(/\s+/g, '_');
}

function parseScore(label){
  const match = normalizeText(label).match(/(\d+(?:\.\d+)?)/);
  if(!match) return null;
  const numeric = Number(match[1]);
  return Number.isFinite(numeric) ? numeric : null;
}

function compactChartGuruText(text){
  return normalizeText(text).slice(0, 1200);
}

function buildDeployedAppUrl(){
  return `${DEPLOYED_BASE_URL}${buildAppUrl({pp_api_origin:DEPLOYED_BASE_URL})}`;
}

async function gotoDeployedApp(page){
  await page.goto(buildDeployedAppUrl(), {waitUntil:'domcontentloaded'});
  await waitForAppReady(page);
  await dismissOptionalOverlays(page);
}

async function waitForScanTicker(page, ticker){
  await page.waitForFunction(symbol => {
    const card = document.querySelector(`#results .resultcompact[data-ticker="${symbol}"]`);
    if(!card || typeof getTickerRecord !== 'function') return false;
    const record = getTickerRecord(symbol);
    const verdict = String(
      record
      && record.scan
      && (record.scan.resolvedVerdict || record.scan.verdict)
      || ''
    ).trim();
    return !!verdict;
  }, ticker, {timeout:120000});
}

async function runSingleTickerScan(page, ticker){
  await Promise.all([
    page.waitForResponse(response => /market-data/i.test(response.url()) && response.status() === 200, {timeout:120000}),
    page.locator('#buildBtn').click()
  ]);
  await waitForScanTicker(page, ticker);
  await waitForUiTransitionSettle(page);
}

async function waitForAnalysisComplete(page, ticker){
  const analyseButton = page.locator('#analyseActiveBtn');
  await expect(analyseButton).toBeVisible({timeout:30000});

  const analysisAlreadySaved = await page.evaluate(symbol => {
    if(typeof getTickerRecord !== 'function') return false;
    const record = getTickerRecord(symbol);
    return !!(
      record
      && record.review
      && record.review.analysisState
      && (
        record.review.analysisState.reviewedAt
        || record.review.analysisState.error
        || record.review.analysisState.normalized
      )
    );
  }, ticker);

  if(!analysisAlreadySaved){
    const enabled = await analyseButton.isEnabled().catch(() => false);
    if(enabled){
      await analyseButton.click();
    }
  }

  await expect.poll(async () => {
    return await page.evaluate(symbol => {
      if(typeof getTickerRecord !== 'function') return {done:false};
      const record = getTickerRecord(symbol);
      const analysisState = record && record.review && record.review.analysisState && typeof record.review.analysisState === 'object'
        ? record.review.analysisState
        : {};
      const runtime = (typeof uiState !== 'undefined' && uiState && uiState.reviewAiRuntime && typeof uiState.reviewAiRuntime === 'object')
        ? uiState.reviewAiRuntime
        : {};
      const loadingTicker = String(runtime.loadingTicker || '');
      const preview = String(document.getElementById('reviewAiSummaryPreview') && document.getElementById('reviewAiSummaryPreview').textContent || '').trim();
      const title = String(document.getElementById('reviewAiSummaryTitle') && document.getElementById('reviewAiSummaryTitle').textContent || '').trim();
      const analyseButton = document.getElementById('analyseActiveBtn');
      const noChartStrong = Array.from(document.querySelectorAll('#reviewWorkspace strong'))
        .find(node => /No chart uploaded yet\./i.test(String(node.textContent || '').trim()));
      const noChartSummary = noChartStrong && noChartStrong.parentElement
        ? String(noChartStrong.parentElement.textContent || '').trim()
        : '';
      const hasResult = !!(
        String(analysisState.reviewedAt || '').trim()
        || String(analysisState.error || '').trim()
        || (analysisState.normalized && typeof analysisState.normalized === 'object')
      );
      const previewReady = !!preview && preview !== 'No Chart Guru saved yet.';
      const blockedByChartGate = !!(
        analyseButton
        && analyseButton.disabled
        && /No chart uploaded yet\./i.test(String(noChartStrong && noChartStrong.textContent || ''))
        && /verify this setup/i.test(noChartSummary)
      );
      return {
        done:(hasResult && loadingTicker !== symbol && previewReady) || blockedByChartGate,
        loadingTicker,
        preview,
        title,
        blockedByChartGate,
        analyseEnabled:!!(analyseButton && !analyseButton.disabled),
        analyseText:String(analyseButton && analyseButton.textContent || ''),
        noChartSummary,
        reviewedAt:String(analysisState.reviewedAt || ''),
        error:String(analysisState.error || '')
      };
    }, ticker);
  }, {
    timeout:180000,
    intervals:[1000, 2000, 4000]
  }).toMatchObject({done:true});

  await waitForUiTransitionSettle(page);
}

async function ensureTrackCardVisible(page, ticker){
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

async function openTrackDiagnosticsBundle(page, ticker){
  await openTrackTab(page);
  const card = page.locator(`[data-watchlist-ticker="${ticker}"]`).first();
  await expect(card).toBeVisible({timeout:30000});
  const moreToggle = card.locator('.watchlist-card__details > summary').first();
  if(await moreToggle.count()){
    const detailsOpen = await card.locator('.watchlist-card__details').evaluate(node => node.open === true).catch(() => false);
    if(!detailsOpen){
      await moreToggle.click();
      await waitForUiTransitionSettle(page);
    }
  }
  const debugToggle = card.locator('.watchlist-debug-pane > summary').first();
  if(await debugToggle.count()){
    const debugOpen = await card.locator('.watchlist-debug-pane').evaluate(node => node.open === true).catch(() => false);
    if(!debugOpen){
      await debugToggle.click();
      await waitForUiTransitionSettle(page);
    }
  }
  const copyButton = card.locator('[data-act="copy-track-diagnostics-bundle"]').first();
  await expect(copyButton).toBeVisible({timeout:10000});
  await copyButton.click();
  await expect.poll(async () => {
    return await page.evaluate(() => {
      const snapshot = uiState && uiState.lastTesterDiagnosticSnapshot;
      return snapshot && snapshot.panelTitle ? String(snapshot.panelTitle) : '';
    });
  }, {timeout:10000}).toBe('Track Diagnostics Bundle');
  return await page.evaluate(() => uiState && uiState.lastTesterDiagnosticSnapshot ? JSON.parse(JSON.stringify(uiState.lastTesterDiagnosticSnapshot)) : null);
}

async function openGeneralDiagnosticsSnapshot(page){
  await openWorkspaceTab(page, 'diary');
  const details = page.locator('#advancedUtilitiesDetails');
  const isOpen = await details.evaluate(node => node.open === true).catch(() => false);
  if(!isOpen){
    await page.locator('#advancedUtilitiesDetails > summary').click();
    await waitForUiTransitionSettle(page);
  }
  await page.locator('#copyTesterSnapshotBtn').click();
  await expect.poll(async () => {
    return await page.evaluate(() => {
      const snapshot = uiState && uiState.lastTesterDiagnosticSnapshot;
      return snapshot && snapshot.panelTitle ? String(snapshot.panelTitle) : '';
    });
  }, {timeout:10000}).toBe('General diagnostics');
  return await page.evaluate(() => uiState && uiState.lastTesterDiagnosticSnapshot ? JSON.parse(JSON.stringify(uiState.lastTesterDiagnosticSnapshot)) : null);
}

async function captureChartGuruSurface(page){
  return await page.evaluate(() => ({
    title:String(document.getElementById('reviewAiSummaryTitle') && document.getElementById('reviewAiSummaryTitle').textContent || '').replace(/\s+/g, ' ').trim(),
    preview:String(document.getElementById('reviewAiSummaryPreview') && document.getElementById('reviewAiSummaryPreview').textContent || '').replace(/\s+/g, ' ').trim(),
    analyseEnabled:!!(document.getElementById('analyseActiveBtn') && !document.getElementById('analyseActiveBtn').disabled),
    analyseText:String(document.getElementById('analyseActiveBtn') && document.getElementById('analyseActiveBtn').textContent || '').replace(/\s+/g, ' ').trim(),
    noChartSummary:(() => {
      const strong = Array.from(document.querySelectorAll('#reviewWorkspace strong'))
        .find(node => /No chart uploaded yet\./i.test(String(node.textContent || '').trim()));
      return strong && strong.parentElement
        ? String(strong.parentElement.textContent || '').replace(/\s+/g, ' ').trim()
        : '';
    })()
  }));
}

function buildAuthorityDigest(state, chartGuru = null){
  const planFromPaperTrade = state && state.paperTrade && state.paperTrade.context && state.paperTrade.context.displayedPlan
    ? state.paperTrade.context.displayedPlan
    : {};
  return {
    normalized:{
      scanCanonicalVerdict:normalizeKey(state && state.normalized && state.normalized.scanCanonicalVerdict),
      scanVisualBucket:normalizeKey(state && state.normalized && state.normalized.scanVisualBucket),
      reviewCanonicalVerdict:normalizeKey(state && state.normalized && state.normalized.reviewCanonicalVerdict),
      reviewVisualBucket:normalizeKey(state && state.normalized && state.normalized.reviewVisualBucket),
      trackCanonicalVerdict:normalizeKey(state && state.normalized && state.normalized.trackCanonicalVerdict),
      trackRenderedBucket:normalizeKey(state && state.normalized && state.normalized.trackRenderedBucket),
      trackAuthorityCanonicalVerdict:normalizeKey(state && state.normalized && state.normalized.trackAuthorityCanonicalVerdict),
      trackAuthorityBucket:normalizeKey(state && state.normalized && state.normalized.trackAuthorityBucket)
    },
    visible:{
      scanBadge:normalizeText(state && state.scan && state.scan.visibleCard && state.scan.visibleCard.badgeLabel),
      scanScore:parseScore(state && state.scan && state.scan.visibleCard && state.scan.visibleCard.scoreLabel),
      reviewBadge:normalizeText(state && state.review && state.review.visible && state.review.visible.badgeLabel),
      reviewTone:normalizeKey(state && state.review && state.review.visible && state.review.visible.currentTone),
      reviewStatus:normalizeText(state && state.review && state.review.visible && state.review.visible.reviewStatus),
      reviewWorkspaceStatus:normalizeText(state && state.review && state.review.visible && state.review.visible.workspaceStatus),
      reviewEntry:normalizeText(state && state.review && state.review.visible && state.review.visible.entry),
      reviewStop:normalizeText(state && state.review && state.review.visible && state.review.visible.stop),
      reviewTarget:normalizeText(state && state.review && state.review.visible && state.review.visible.target),
      reviewRr:normalizeText(state && state.review && state.review.visible && state.review.visible.rr),
      trackBadge:normalizeText(state && state.track && state.track.visible && state.track.visible.badgeLabel),
      trackVisualTone:normalizeKey(state && state.track && state.track.visible && state.track.visible.visualTone),
      trackScore:parseScore(state && state.track && state.track.visible && state.track.visible.scoreLabel),
      trackDecision:normalizeText(state && state.track && state.track.visible && state.track.visible.decisionSummary),
      trackPlanMeta:normalizeText(state && state.track && state.track.visible && state.track.visible.planMeta)
    },
    contract:{
      fingerprint:normalizeText(state && state.authority && state.authority.canonicalContract && state.authority.canonicalContract.contractFingerprint),
      setupScore:state && state.authority && state.authority.canonicalContract && state.authority.canonicalContract.derivedStates
        ? state.authority.canonicalContract.derivedStates.setupScore
        : null
    },
    paperTrade:{
      enabled:!!(state && state.paperTrade && state.paperTrade.button && state.paperTrade.button.enabled),
      eligible:!!(state && state.paperTrade && state.paperTrade.context && state.paperTrade.context.eligibility && state.paperTrade.context.eligibility.eligible === true),
      canonicalVerdict:normalizeKey(state && state.paperTrade && state.paperTrade.context && state.paperTrade.context.canonicalVerdict),
      setupScore:state && state.paperTrade && state.paperTrade.context ? state.paperTrade.context.setupScore : null,
      entry:normalizeText(planFromPaperTrade.entry),
      stop:normalizeText(planFromPaperTrade.stop),
      target:normalizeText(planFromPaperTrade.firstTarget || planFromPaperTrade.target),
      previewText:normalizeText(state && state.paperTrade && state.paperTrade.button && state.paperTrade.button.previewText)
    },
    chartGuru:{
      title:normalizeText(chartGuru && chartGuru.title),
      preview:compactChartGuruText(chartGuru && chartGuru.preview),
      analyseEnabled:!!(chartGuru && chartGuru.analyseEnabled),
      analyseText:normalizeText(chartGuru && chartGuru.analyseText),
      noChartSummary:normalizeText(chartGuru && chartGuru.noChartSummary)
    }
  };
}

function buildFindings(state, trackDiagnostics, generalDiagnostics){
  const findings = [];
  const digest = buildAuthorityDigest(state, state && state.__chartGuruSurface);
  const canonicalVerdict = digest.normalized.reviewCanonicalVerdict;
  const canonicalBucket = digest.normalized.reviewVisualBucket;
  const scanScore = digest.visible.scanScore;
  const trackScore = digest.visible.trackScore;
  const contractSetupScore = state && state.authority && state.authority.canonicalContract && state.authority.canonicalContract.derivedStates
    ? Number(state.authority.canonicalContract.derivedStates.setupScore)
    : null;
  const paperTradeContext = state && state.paperTrade && state.paperTrade.context ? state.paperTrade.context : null;
  const trackBundle = trackDiagnostics && trackDiagnostics.sections && trackDiagnostics.sections.track ? trackDiagnostics.sections.track : null;

  function push(condition, message, details = {}){
    if(!condition){
      findings.push({message, ...details});
    }
  }

  push(!!canonicalVerdict, 'Review canonical verdict is missing.', {surface:'review'});
  push(digest.normalized.scanCanonicalVerdict === canonicalVerdict, 'Scan canonical verdict diverged from Review.', {
    surface:'scan',
    expected:canonicalVerdict,
    actual:digest.normalized.scanCanonicalVerdict
  });
  push(digest.normalized.scanVisualBucket === canonicalBucket, 'Scan visual bucket diverged from Review.', {
    surface:'scan',
    expected:canonicalBucket,
    actual:digest.normalized.scanVisualBucket
  });
  push(digest.normalized.trackCanonicalVerdict === canonicalVerdict, 'Track rendered canonical verdict diverged from Review.', {
    surface:'track',
    expected:canonicalVerdict,
    actual:digest.normalized.trackCanonicalVerdict
  });
  push(digest.normalized.trackAuthorityCanonicalVerdict === canonicalVerdict, 'Track authority canonical verdict diverged from Review.', {
    surface:'trackAuthority',
    expected:canonicalVerdict,
    actual:digest.normalized.trackAuthorityCanonicalVerdict
  });
  push(digest.normalized.trackRenderedBucket === canonicalBucket, 'Track rendered bucket diverged from Review.', {
    surface:'track',
    expected:canonicalBucket,
    actual:digest.normalized.trackRenderedBucket
  });
  push(digest.normalized.trackAuthorityBucket === canonicalBucket, 'Track authority bucket diverged from Review.', {
    surface:'trackAuthority',
    expected:canonicalBucket,
    actual:digest.normalized.trackAuthorityBucket
  });
  push(normalizeKey(digest.visible.reviewBadge) === canonicalVerdict, 'Review badge diverged from canonical verdict.', {
    surface:'review',
    expected:canonicalVerdict,
    actual:digest.visible.reviewBadge
  });
  push(normalizeKey(digest.visible.trackBadge) === canonicalVerdict, 'Track badge diverged from canonical verdict.', {
    surface:'track',
    expected:canonicalVerdict,
    actual:digest.visible.trackBadge
  });
  push(digest.visible.reviewTone === canonicalBucket, 'Review tone diverged from canonical bucket.', {
    surface:'review',
    expected:canonicalBucket,
    actual:digest.visible.reviewTone
  });
  push(digest.visible.trackVisualTone === canonicalBucket, 'Track tone diverged from canonical bucket.', {
    surface:'track',
    expected:canonicalBucket,
    actual:digest.visible.trackVisualTone
  });

  if(scanScore != null && contractSetupScore != null){
    push(scanScore === contractSetupScore, 'Scan setup score diverged from canonical contract setup score.', {
      surface:'scan',
      expected:contractSetupScore,
      actual:scanScore
    });
  }
  if(trackScore != null && contractSetupScore != null){
    push(trackScore === contractSetupScore, 'Track setup score diverged from canonical contract setup score.', {
      surface:'track',
      expected:contractSetupScore,
      actual:trackScore
    });
  }
  if(paperTradeContext){
    push(normalizeKey(paperTradeContext.canonicalVerdict) === canonicalVerdict, 'Paper-trade canonical verdict diverged from Review.', {
      surface:'paperTrade',
      expected:canonicalVerdict,
      actual:paperTradeContext.canonicalVerdict
    });
    if(contractSetupScore != null && paperTradeContext.setupScore != null){
      push(Number(paperTradeContext.setupScore) === contractSetupScore, 'Paper-trade setup score diverged from canonical contract.', {
        surface:'paperTrade',
        expected:contractSetupScore,
        actual:paperTradeContext.setupScore
      });
    }
    if(digest.paperTrade.enabled || digest.paperTrade.eligible){
      push(
        digest.paperTrade.entry === digest.visible.reviewEntry
          && digest.paperTrade.stop === digest.visible.reviewStop
          && digest.paperTrade.target === digest.visible.reviewTarget,
        'Paper-trade displayed plan diverged from Review plan.',
        {
          surface:'paperTrade',
          expected:{
            entry:digest.visible.reviewEntry,
            stop:digest.visible.reviewStop,
            target:digest.visible.reviewTarget
          },
          actual:{
            entry:digest.paperTrade.entry,
            stop:digest.paperTrade.stop,
            target:digest.paperTrade.target
          }
        }
      );
    }
  }

  const chartGuruCompleted = (
    digest.chartGuru.title === '🧘 Chart Guru'
    && !!digest.chartGuru.preview
    && !/No Chart Guru saved yet\./i.test(digest.chartGuru.preview)
  );
  const chartGuruBlockedByNoChart = (
    digest.chartGuru.analyseEnabled === false
    && /No chart uploaded yet\./i.test(digest.chartGuru.noChartSummary)
    && /verify this setup/i.test(digest.chartGuru.noChartSummary)
  );
  push(
    chartGuruCompleted || chartGuruBlockedByNoChart,
    'Review did not settle into either a completed Chart Guru state or the expected no-chart gate state.',
    {surface:'reviewAnalysis', actual:digest.chartGuru}
  );

  if(trackBundle){
    push(
      normalizeKey(trackBundle.simplifiedState && trackBundle.simplifiedState.canonicalVerdict) === canonicalVerdict,
      'Track diagnostics canonical verdict diverged from rendered authority.',
      {
        surface:'trackDiagnostics',
        expected:canonicalVerdict,
        actual:trackBundle.simplifiedState && trackBundle.simplifiedState.canonicalVerdict
      }
    );
    push(
      normalizeKey(trackBundle.simplifiedState && trackBundle.simplifiedState.visualBucket) === canonicalBucket,
      'Track diagnostics visual bucket diverged from rendered authority.',
      {
        surface:'trackDiagnostics',
        expected:canonicalBucket,
        actual:trackBundle.simplifiedState && trackBundle.simplifiedState.visualBucket
      }
    );
    push(
      normalizeText(trackBundle.sharedPresentation && trackBundle.sharedPresentation.badgeLabel) === digest.visible.trackBadge,
      'Track diagnostics badge label diverged from rendered Track badge.',
      {
        surface:'trackDiagnostics',
        expected:digest.visible.trackBadge,
        actual:trackBundle.sharedPresentation && trackBundle.sharedPresentation.badgeLabel
      }
    );
  }

  if(generalDiagnostics){
    push(normalizeText(generalDiagnostics.ticker) === LIVE_TICKER, 'General diagnostics ticker did not follow the active review ticker.', {
      surface:'diagnostics',
      expected:LIVE_TICKER,
      actual:generalDiagnostics.ticker
    });
    push(
      normalizeKey(generalDiagnostics.stateHealth && generalDiagnostics.stateHealth.canonicalVerdict) === canonicalVerdict,
      'General diagnostics canonical verdict diverged from Review.',
      {
        surface:'diagnostics',
        expected:canonicalVerdict,
        actual:generalDiagnostics.stateHealth && generalDiagnostics.stateHealth.canonicalVerdict
      }
    );
    push(
      normalizeKey(generalDiagnostics.stateHealth && generalDiagnostics.stateHealth.visualBucket) === canonicalBucket,
      'General diagnostics visual bucket diverged from Review.',
      {
        surface:'diagnostics',
        expected:canonicalBucket,
        actual:generalDiagnostics.stateHealth && generalDiagnostics.stateHealth.visualBucket
      }
    );
  }

  return findings;
}

test('deployed app preserves canonical authority through scan, review, track, reload, and diagnostics', async ({page}, testInfo) => {
  test.slow();
  test.setTimeout(600000);
  const consoleEvents = await attachConsoleRecorder(page);

  await gotoDeployedApp(page);
  await resetAppState(page);

  await addTickers(page, [LIVE_TICKER]);
  await runSingleTickerScan(page, LIVE_TICKER);
  const scanState = await extractAppTickerState(page, LIVE_TICKER, consoleEvents);

  await openReviewForTicker(page, LIVE_TICKER);
  await waitForAnalysisComplete(page, LIVE_TICKER);
  const reviewState = await extractAppTickerState(page, LIVE_TICKER, consoleEvents);
  const reviewChartGuru = await captureChartGuruSurface(page);

  const addedToWatchlist = await addActiveReviewToWatchlistIfEligible(page);
  expect(addedToWatchlist, `${LIVE_TICKER} could not be added to Track from Review.`).toBe(true);
  await waitForUiTransitionSettle(page);

  await openTrackTab(page);
  const trackCardVisible = await ensureTrackCardVisible(page, LIVE_TICKER);
  expect(trackCardVisible, `${LIVE_TICKER} Track card was not visible after add-to-watchlist.`).toBe(true);
  const trackState = await extractAppTickerState(page, LIVE_TICKER, consoleEvents);

  await openReviewFromTrackTicker(page, LIVE_TICKER);
  await waitForUiTransitionSettle(page);
  if(await page.locator('#paperTradeBtn').isEnabled().catch(() => false)){
    await page.locator('#paperTradeBtn').click();
    await expect(page.locator('#paperTradePreview')).toBeVisible({timeout:15000});
    await waitForUiTransitionSettle(page);
  }
  const preReloadState = await extractAppTickerState(page, LIVE_TICKER, consoleEvents);
  const preReloadChartGuru = await captureChartGuruSurface(page);
  preReloadState.__chartGuruSurface = preReloadChartGuru;
  const trackDiagnostics = await openTrackDiagnosticsBundle(page, LIVE_TICKER);
  await openReviewFromTrackTicker(page, LIVE_TICKER);
  await waitForUiTransitionSettle(page);
  const generalDiagnostics = await openGeneralDiagnosticsSnapshot(page);

  const preReloadDigest = buildAuthorityDigest(preReloadState, preReloadChartGuru);
  const findings = buildFindings(preReloadState, trackDiagnostics, generalDiagnostics);

  await reloadApp(page);
  await openTrackTab(page);
  await ensureTrackCardVisible(page, LIVE_TICKER);
  await openReviewFromTrackTicker(page, LIVE_TICKER);
  await waitForUiTransitionSettle(page);
  const postReloadState = await extractAppTickerState(page, LIVE_TICKER, consoleEvents);
  const postReloadChartGuru = await captureChartGuruSurface(page);
  const postReloadDigest = buildAuthorityDigest(postReloadState, postReloadChartGuru);

  const consoleErrors = consoleEvents.filter(entry => entry.type === 'error' || entry.type === 'pageerror');
  const fatalConsoleErrors = consoleErrors.filter(entry => {
    if(entry.type === 'pageerror') return true;
    return !/Failed to load resource: the server responded with a status of (404|503)/i.test(String(entry.text || ''));
  });

  const report = {
    ticker:LIVE_TICKER,
    deployedBaseUrl:DEPLOYED_BASE_URL,
    generatedAt:new Date().toISOString(),
    scanState,
    reviewState,
    trackState,
    preReloadState,
    postReloadState,
    diagnostics:{
      track:trackDiagnostics,
      general:generalDiagnostics
    },
    digests:{
      preReload:preReloadDigest,
      postReload:postReloadDigest
    },
    consoleErrors,
    fatalConsoleErrors,
    findings
  };

  await writeJsonReport(testInfo, 'deployed-authority-journey-report.json', report);
  const artifactPath = writeArtifactJson(`deployed-authority-journey-${LIVE_TICKER}-${Date.now()}.json`, report);
  await testInfo.attach('deployed-authority-journey-artifact-path.txt', {
    body:artifactPath,
    contentType:'text/plain'
  });

  expect(
    fatalConsoleErrors,
    `Fatal console errors detected.\n${fatalConsoleErrors.map(entry => entry.text).join('\n')}`
  ).toEqual([]);
  expect(
    findings,
    findings.length
      ? `Canonical authority mismatches for ${LIVE_TICKER}.\n${JSON.stringify(findings, null, 2)}`
      : ''
  ).toEqual([]);
  expect(
    postReloadDigest,
    `Restored state diverged after reload for ${LIVE_TICKER}.\n${JSON.stringify({preReloadDigest, postReloadDigest}, null, 2)}`
  ).toEqual(preReloadDigest);
});
