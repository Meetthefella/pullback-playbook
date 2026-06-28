function normalizeNumber(value){
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function cloneJsonValue(value){
  if(value == null) return value;
  if(Array.isArray(value)) return value.map(cloneJsonValue);
  if(typeof value === 'object'){
    return Object.keys(value).reduce((output, key) => {
      const nextValue = cloneJsonValue(value[key]);
      if(nextValue !== undefined) output[key] = nextValue;
      return output;
    }, {});
  }
  if(['string', 'number', 'boolean'].includes(typeof value)) return value;
  return undefined;
}

function pickObject(source, keys = []){
  const input = source && typeof source === 'object' ? source : {};
  return keys.reduce((output, key) => {
    if(input[key] !== undefined){
      output[key] = cloneJsonValue(input[key]);
    }
    return output;
  }, {});
}

function mapHistoryRows(history){
  return Array.isArray(history)
    ? history.map(row => ({
      date:String(row && row.date || ''),
      open:normalizeNumber(row && row.open),
      high:normalizeNumber(row && row.high),
      low:normalizeNumber(row && row.low),
      close:normalizeNumber(row && row.close),
      volume:normalizeNumber(row && row.volume)
    }))
    : [];
}

function buildReplaySnapshotFromRecord(record, runtimeContext = {}){
  const item = record && typeof record === 'object' ? cloneJsonValue(record) : null;
  if(!item) return null;
  const context = runtimeContext && typeof runtimeContext === 'object' ? runtimeContext : {};
  const marketData = item.marketData && typeof item.marketData === 'object' ? item.marketData : {};
  const review = item.review && typeof item.review === 'object' ? item.review : {};
  const reviewAnalysisState = review.analysisState && typeof review.analysisState === 'object'
    ? review.analysisState
    : {};
  const scan = item.scan && typeof item.scan === 'object' ? item.scan : {};
  const meta = item.meta && typeof item.meta === 'object' ? item.meta : {};
  const setup = item.setup && typeof item.setup === 'object' ? item.setup : {};
  const plan = item.plan && typeof item.plan === 'object' ? item.plan : {};
  const manualReview = review.manualReview && typeof review.manualReview === 'object'
    ? review.manualReview
    : null;
  return {
    ticker:String(item.ticker || ''),
    trustedComparisonFields:{
      ticker:String(item.ticker || ''),
      companyName:String(meta.companyName || ''),
      exchange:String(meta.exchange || ''),
      currency:String(marketData.currency || 'USD'),
      tradingViewSymbol:String(meta.tradingViewSymbol || ''),
      price:normalizeNumber(marketData.price),
      previousClose:normalizeNumber(marketData.previousClose),
      sma20:normalizeNumber(marketData.ma20),
      sma50:normalizeNumber(marketData.ma50),
      sma200:normalizeNumber(marketData.ma200),
      rsi14:normalizeNumber(marketData.rsi),
      volume:normalizeNumber(marketData.volume),
      avgVolume30d:normalizeNumber(marketData.avgVolume),
      perf1w:normalizeNumber(marketData.perf1w),
      perf1m:normalizeNumber(marketData.perf1m),
      perf3m:normalizeNumber(marketData.perf3m),
      perf6m:normalizeNumber(marketData.perf6m),
      perfYtd:normalizeNumber(marketData.perfYtd),
      fetchedAt:String(marketData.asOf || ''),
      warnings:Array.isArray(marketData.warnings) ? cloneJsonValue(marketData.warnings) : []
    },
    recentDailyHistory:mapHistoryRows(marketData.history),
    meta:pickObject(meta, ['companyName', 'exchange', 'tradingViewSymbol']),
    marketData:{
      currency:String(marketData.currency || 'USD'),
      price:normalizeNumber(marketData.price),
      previousClose:normalizeNumber(marketData.previousClose),
      ma20:normalizeNumber(marketData.ma20),
      ma50:normalizeNumber(marketData.ma50),
      ma200:normalizeNumber(marketData.ma200),
      sma20:normalizeNumber(marketData.sma20),
      sma50:normalizeNumber(marketData.sma50),
      sma200:normalizeNumber(marketData.sma200),
      rsi:normalizeNumber(marketData.rsi),
      volume:normalizeNumber(marketData.volume),
      avgVolume:normalizeNumber(marketData.avgVolume),
      perf1w:normalizeNumber(marketData.perf1w),
      perf1m:normalizeNumber(marketData.perf1m),
      perf3m:normalizeNumber(marketData.perf3m),
      perf6m:normalizeNumber(marketData.perf6m),
      perfYtd:normalizeNumber(marketData.perfYtd),
      asOf:String(marketData.asOf || ''),
      warnings:Array.isArray(marketData.warnings) ? cloneJsonValue(marketData.warnings) : [],
      history:mapHistoryRows(marketData.history)
    },
    setup:pickObject(setup, ['marketCaution', 'volumeRequired', 'bounceState', 'structureState', 'trendState']),
    plan:cloneJsonValue(plan),
    scan:{
      analysisProjection:scan.analysisProjection && typeof scan.analysisProjection === 'object'
        ? cloneJsonValue(scan.analysisProjection)
        : null,
      score:normalizeNumber(scan.score),
      riskStatus:String(scan.riskStatus || ''),
      summary:String(scan.summary || ''),
      resolvedVerdict:String(scan.resolvedVerdict || ''),
      verdict:String(scan.verdict || ''),
      reasons:Array.isArray(scan.reasons) ? cloneJsonValue(scan.reasons) : [],
      flags:scan.flags && typeof scan.flags === 'object' ? cloneJsonValue(scan.flags) : null,
      estimatedEntryZone:normalizeNumber(scan.estimatedEntryZone),
      estimatedStopArea:normalizeNumber(scan.estimatedStopArea),
      estimatedTargetArea:normalizeNumber(scan.estimatedTargetArea),
      estimatedRR:normalizeNumber(scan.estimatedRR)
    },
    review:{
      normalizedAnalysis:review.normalizedAnalysis && typeof review.normalizedAnalysis === 'object'
        ? cloneJsonValue(review.normalizedAnalysis)
        : null,
      manualReview:manualReview ? cloneJsonValue(manualReview) : null,
      projectionSource:String(context.reviewProjectionSource || ''),
      projectionSnapshot:context.reviewProjectionSnapshot && typeof context.reviewProjectionSnapshot === 'object'
        ? cloneJsonValue(context.reviewProjectionSnapshot)
        : null,
      analysisState:{
        normalized:reviewAnalysisState.normalized && typeof reviewAnalysisState.normalized === 'object'
          ? cloneJsonValue(reviewAnalysisState.normalized)
          : null
      }
    },
    reclaimAttempt:item.reclaimAttempt === true,
    reclaimsLevel:item.reclaimsLevel === true,
    breaksLocalHigh:item.breaksLocalHigh === true,
    strongBullishContinuation:item.strongBullishContinuation === true,
    in_watchlist:item.in_watchlist === true,
    watchlist_entry_exists:item.watchlist_entry_exists === true,
    terminal_avoid_applied:item.terminal_avoid_applied === true,
    avoid_trigger_source:String(item.avoid_trigger_source || '')
  };
}

async function extractAppTickerState(page, ticker, consoleEvents = []){
  const resolveAppRecord = targetTicker => page.evaluate(({ticker}) => {
    const normalizedTicker = String(ticker || '').trim().toUpperCase();
    if(typeof getTickerRecord === 'function'){
      const direct = getTickerRecord(normalizedTicker);
      if(direct) return direct;
    }
    if(typeof allTickerRecords === 'function'){
      const records = allTickerRecords();
      if(Array.isArray(records)){
        return records.find(item => String(item && item.ticker || '').trim().toUpperCase() === normalizedTicker) || null;
      }
    }
    return null;
  }, {ticker:targetTicker});

  let authoritativeRecord = await resolveAppRecord(ticker);
  if(!authoritativeRecord){
    await page.waitForFunction(targetTicker => {
      const normalizedTicker = String(targetTicker || '').trim().toUpperCase();
      if(typeof getTickerRecord === 'function' && getTickerRecord(normalizedTicker)) return true;
      if(typeof allTickerRecords === 'function'){
        const records = allTickerRecords();
        return Array.isArray(records) && records.some(item => String(item && item.ticker || '').trim().toUpperCase() === normalizedTicker);
      }
      return false;
    }, ticker, {timeout:2000}).catch(() => null);
    authoritativeRecord = await resolveAppRecord(ticker);
  }

  const appState = await page.evaluate(async ({ticker, consoleEvents, authoritativeRecord}) => {
    const safeText = value => String(value || '').replace(/\s+/g, ' ').trim();
    const withReviewProjectionSuppressed = callback => {
      if(typeof callback !== 'function') return null;
      const stateRef = typeof uiState === 'object' && uiState ? uiState : null;
      if(!stateRef) return callback();
      const previousProjectionSnapshot = stateRef.activeReviewSourceProjectionSnapshot;
      const previousProjectionSource = stateRef.activeReviewProjectionSource;
      try{
        delete stateRef.activeReviewSourceProjectionSnapshot;
        stateRef.activeReviewProjectionSource = '';
        return callback();
      }finally{
        if(previousProjectionSnapshot === undefined) delete stateRef.activeReviewSourceProjectionSnapshot;
        else stateRef.activeReviewSourceProjectionSnapshot = previousProjectionSnapshot;
        if(previousProjectionSource === undefined) delete stateRef.activeReviewProjectionSource;
        else stateRef.activeReviewProjectionSource = previousProjectionSource;
      }
    };
    const record = authoritativeRecord || (() => {
      if(typeof getTickerRecord === 'function'){
        const direct = getTickerRecord(ticker);
        if(direct) return direct;
      }
      if(typeof allTickerRecords === 'function'){
        const records = allTickerRecords();
        if(Array.isArray(records)){
          return records.find(item => String(item && item.ticker || '').trim().toUpperCase() === String(ticker || '').trim().toUpperCase()) || null;
        }
      }
      return null;
    })();
    const globalVerdict = record && typeof resolveGlobalVerdict === 'function' ? resolveGlobalVerdict(record) : null;
    const scanSimplified = record && typeof resolveSimplifiedStateForSurface === 'function'
      ? withReviewProjectionSuppressed(() => resolveSimplifiedStateForSurface(record, 'scan', {source:'playwright_parity', mutationSource:'playwright_parity'}))
      : null;
    const reviewStateHealth = record && typeof currentReviewStateHealthSnapshot === 'function'
      ? currentReviewStateHealthSnapshot(record)
      : null;
    const reviewVisible = record && typeof currentVisibleReviewDiagnostics === 'function'
      ? currentVisibleReviewDiagnostics(record)
      : null;
    const trackSnapshot = record && typeof buildTrackDiagnosticSnapshot === 'function'
      ? buildTrackDiagnosticSnapshot(record)
      : null;
    const activeProjectionSnapshot = typeof uiState === 'object'
      && uiState
      && uiState.activeReviewSourceProjectionSnapshot
      && typeof uiState.activeReviewSourceProjectionSnapshot === 'object'
      && String(uiState.activeReviewSourceProjectionSnapshot.ticker || '').trim().toUpperCase() === String(ticker || '').trim().toUpperCase()
        ? uiState.activeReviewSourceProjectionSnapshot
        : null;
    const synthesizedProjectionSnapshot = !activeProjectionSnapshot
      && reviewStateHealth
      && String(reviewStateHealth.sourceOfTruth || '').trim().toLowerCase() === 'review_projection_snapshot'
        ? {
          ticker:String(ticker || '').trim().toUpperCase(),
          canonicalVerdict:String(reviewStateHealth.canonicalVerdict || ''),
          finalVerdict:String(reviewStateHealth.canonicalVerdict || ''),
          renderedVerdict:String(reviewStateHealth.canonicalVerdict || ''),
          visualBucket:String(reviewStateHealth.visualBucket || ''),
          renderedBucket:String(reviewStateHealth.visualBucket || ''),
          sourceOfTruthVisualBucket:String(reviewStateHealth.visualBucket || ''),
          tone:String(reviewStateHealth.tone || ''),
          decisionSummary:String(reviewStateHealth.primaryBlockerReason || ''),
          actionGuidance:safeText(document.getElementById('reviewNextActionInline') && document.getElementById('reviewNextActionInline').textContent),
          source:'review_state_health_snapshot'
        }
        : null;
    const effectiveProjectionSnapshot = activeProjectionSnapshot || synthesizedProjectionSnapshot;
    const reviewProjectionSource = effectiveProjectionSnapshot
      ? String((activeProjectionSnapshot && uiState && uiState.activeReviewProjectionSource) || 'clicked_card_snapshot')
      : '';
    const reviewShell = document.querySelector('#reviewWorkspace .reviewworkspace-shell');
    const activeTrackCard = document.querySelector(`[data-watchlist-ticker="${ticker}"]`);
    const watchlistPresentation = record && record.watchlist && record.watchlist.presentation && typeof record.watchlist.presentation === 'object'
      ? record.watchlist.presentation
      : null;
    return {
      ticker,
      authoritativeRecord:record,
      recordFlags:{
        inWatchlist:!!(record && record.watchlist && record.watchlist.inWatchlist),
        hasManualReview:!!(record && record.review && record.review.manualReview),
        hasPersistedTrackPresentation:!!(watchlistPresentation && watchlistPresentation.sharedPresentation)
      },
      scan:{
        simplifiedState:scanSimplified ? {
          canonicalVerdict:String(scanSimplified.canonicalVerdict || ''),
          visualBucket:String(scanSimplified.visualBucket || ''),
          tone:String(scanSimplified.tone || ''),
          badgeLabel:String(scanSimplified.badgeLabel || ''),
          actionLabel:String(scanSimplified.actionLabel || ''),
          planStatus:String(scanSimplified.planStatus || ''),
          mainBlocker:String(scanSimplified.mainBlocker || '')
        } : null,
        visibleCard:{
          badgeLabel:safeText(document.querySelector(`#results .resultcompact[data-ticker="${ticker}"] .badge.state-pill`) && document.querySelector(`#results .resultcompact[data-ticker="${ticker}"] .badge.state-pill`).textContent),
          technicalSummary:safeText(document.querySelector(`#results .resultcompact[data-ticker="${ticker}"] .scan-card__technical`) && document.querySelector(`#results .resultcompact[data-ticker="${ticker}"] .scan-card__technical`).textContent),
          decisionSummary:safeText(document.querySelector(`#results .resultcompact[data-ticker="${ticker}"] .scan-card__decision`) && document.querySelector(`#results .resultcompact[data-ticker="${ticker}"] .scan-card__decision`).textContent)
        }
      },
      review:{
        stateHealth:reviewStateHealth,
        visible:{
          currentVerdict:String(reviewShell && reviewShell.dataset && reviewShell.dataset.visualState || reviewVisible && reviewVisible.currentVerdict || ''),
          currentTone:String(reviewShell && reviewShell.dataset && reviewShell.dataset.visualTone || reviewVisible && reviewVisible.currentTone || ''),
          badgeLabel:safeText(document.querySelector('#reviewWorkspace .badge.state-pill') && document.querySelector('#reviewWorkspace .badge.state-pill').textContent),
          reviewHeadline:safeText(document.querySelector('#reviewWorkspace .summary') && document.querySelector('#reviewWorkspace .summary').textContent),
          reviewStatus:safeText(document.getElementById('tradeStatusBox') && document.getElementById('tradeStatusBox').textContent),
          workspaceStatus:safeText(document.getElementById('reviewWorkspaceStatus') && document.getElementById('reviewWorkspaceStatus').textContent),
          actionLabel:safeText(document.getElementById('reviewNextActionInline') && document.getElementById('reviewNextActionInline').textContent),
          actionPrimary:safeText(document.getElementById('reviewNextActionPrimary') && document.getElementById('reviewNextActionPrimary').textContent),
          technicalSummary:safeText(document.getElementById('reviewTechnicalContextLine') && document.getElementById('reviewTechnicalContextLine').textContent),
          entry:safeText(document.getElementById('entryPrice') && document.getElementById('entryPrice').value),
          stop:safeText(document.getElementById('stopPrice') && document.getElementById('stopPrice').value),
          target:safeText(document.getElementById('targetPrice') && document.getElementById('targetPrice').value),
          rr:safeText(document.getElementById('rrValue') && document.getElementById('rrValue').textContent),
          entryVisible:!(document.getElementById('tradePlanInputs') && document.getElementById('tradePlanInputs').classList.contains('review-hidden')),
          capitalVisible:!(document.getElementById('capitalFitMetric') && document.getElementById('capitalFitMetric').classList.contains('review-hidden')),
          rrVisible:!(document.getElementById('rrValue') && /No actionable plan yet/i.test(document.getElementById('rrValue').textContent || ''))
        },
        globalVerdict:globalVerdict ? {
          finalVerdict:String(globalVerdict.final_verdict || ''),
          mainBlocker:String(globalVerdict.main_blocker || globalVerdict.reason || ''),
          tradeability:String(globalVerdict.tradeabilityVerdict || globalVerdict.tradeability || ''),
          reasonCode:String(globalVerdict.semantic_blocker_code || globalVerdict.reason_code || ''),
          planStatus:String(globalVerdict.planStateKey || globalVerdict.plan_status || '')
        } : null
      },
      track:{
        simplifiedState:trackSnapshot && trackSnapshot.simplifiedState ? trackSnapshot.simplifiedState : null,
        visible:{
          badgeLabel:safeText(activeTrackCard && activeTrackCard.querySelector('.badge.state-pill') && activeTrackCard.querySelector('.badge.state-pill').textContent),
          decisionSummary:safeText(activeTrackCard && activeTrackCard.querySelector('.decision-summary') && activeTrackCard.querySelector('.decision-summary').textContent),
          planMeta:safeText(activeTrackCard && activeTrackCard.querySelector('.watchlist-plan-meta') && activeTrackCard.querySelector('.watchlist-plan-meta').textContent),
          cardText:safeText(activeTrackCard && activeTrackCard.textContent)
        },
        diagnostics:trackSnapshot
      },
      console:{
        warnings:consoleEvents.filter(entry => entry.type === 'warning').map(entry => entry.text),
        errors:consoleEvents.filter(entry => entry.type === 'error' || entry.type === 'pageerror').map(entry => entry.text)
      },
      reviewProjectionContext:{
        reviewProjectionSource,
        reviewProjectionSnapshot:effectiveProjectionSnapshot
      }
    };
  }, {ticker, consoleEvents, authoritativeRecord});
  appState.snapshot = buildReplaySnapshotFromRecord(appState.authoritativeRecord, appState.reviewProjectionContext);
  appState.snapshotContract = {
    hasAnalysisProjection:!!(appState.snapshot && appState.snapshot.scan && appState.snapshot.scan.analysisProjection),
    hasPlan:!!(appState.snapshot && appState.snapshot.plan),
    hasNormalizedReviewAnalysis:!!(appState.snapshot && appState.snapshot.review && appState.snapshot.review.analysisState && appState.snapshot.review.analysisState.normalized),
    hasReviewProjectionSnapshot:!!(appState.snapshot && appState.snapshot.review && appState.snapshot.review.projectionSnapshot),
    excludesWatchlistPresentation:!(appState.snapshot && appState.snapshot.watchlist && appState.snapshot.watchlist.presentation),
    excludesTrackDiagnostics:appState.snapshot && appState.snapshot.track === undefined
  };
  delete appState.authoritativeRecord;
  return appState;
}

module.exports = {
  buildReplaySnapshotFromRecord,
  extractAppTickerState,
  normalizeNumber
};
