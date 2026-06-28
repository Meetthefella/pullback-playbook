function normalizeNumber(value){
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

async function extractAppTickerState(page, ticker, consoleEvents = []){
  return page.evaluate(async ({ticker, consoleEvents}) => {
    const safeText = value => String(value || '').replace(/\s+/g, ' ').trim();
    const numericOrNull = value => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    };
    const record = typeof getTickerRecord === 'function' ? getTickerRecord(ticker) : null;
    const globalVerdict = record && typeof resolveGlobalVerdict === 'function' ? resolveGlobalVerdict(record) : null;
    const scanSimplified = record && typeof resolveSimplifiedStateForSurface === 'function'
      ? resolveSimplifiedStateForSurface(record, 'scan', {source:'playwright_parity', mutationSource:'playwright_parity'})
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
    const reviewShell = document.querySelector('#reviewWorkspace .reviewworkspace-shell');
    const activeTrackCard = document.querySelector(`[data-watchlist-ticker="${ticker}"]`);
    const watchlistPresentation = record && record.watchlist && record.watchlist.presentation && typeof record.watchlist.presentation === 'object'
      ? record.watchlist.presentation
      : null;
    const replaySnapshot = record ? {
      ticker:String(record.ticker || ''),
      trustedComparisonFields:{
        ticker:String(record.ticker || ''),
        companyName:String(record.meta && record.meta.companyName || ''),
        exchange:String(record.meta && record.meta.exchange || ''),
        currency:String(record.marketData && record.marketData.currency || 'USD'),
        tradingViewSymbol:String(record.meta && record.meta.tradingViewSymbol || ''),
        price:numericOrNull(record.marketData && record.marketData.price),
        previousClose:numericOrNull(record.marketData && record.marketData.previousClose),
        sma20:numericOrNull(record.marketData && record.marketData.ma20),
        sma50:numericOrNull(record.marketData && record.marketData.ma50),
        sma200:numericOrNull(record.marketData && record.marketData.ma200),
        rsi14:numericOrNull(record.marketData && record.marketData.rsi),
        volume:numericOrNull(record.marketData && record.marketData.volume),
        avgVolume30d:numericOrNull(record.marketData && record.marketData.avgVolume),
        perf1w:numericOrNull(record.marketData && record.marketData.perf1w),
        perf1m:numericOrNull(record.marketData && record.marketData.perf1m),
        perf3m:numericOrNull(record.marketData && record.marketData.perf3m),
        perf6m:numericOrNull(record.marketData && record.marketData.perf6m),
        perfYtd:numericOrNull(record.marketData && record.marketData.perfYtd),
        fetchedAt:String(record.marketData && record.marketData.asOf || ''),
        warnings:Array.isArray(record.marketData && record.marketData.warnings) ? record.marketData.warnings.slice() : []
      },
      recentDailyHistory:Array.isArray(record.marketData && record.marketData.history)
        ? record.marketData.history.map(row => ({
          date:String(row.date || ''),
          open:numericOrNull(row.open),
          high:numericOrNull(row.high),
          low:numericOrNull(row.low),
          close:numericOrNull(row.close),
          volume:numericOrNull(row.volume)
        }))
        : []
    } : null;
    return {
      ticker,
      snapshot:replaySnapshot,
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
      }
    };
  }, {ticker, consoleEvents});
}

module.exports = {
  extractAppTickerState,
  normalizeNumber
};
