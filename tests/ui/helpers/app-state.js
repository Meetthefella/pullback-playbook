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

function normalizeCopyText(value){
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeVerdictKey(value){
  const safe = normalizeCopyText(value).toLowerCase().replace(/\s+/g, '_');
  if(['watch', 'near_entry', 'entry', 'avoid', 'monitor', 'diminishing'].includes(safe)) return safe;
  return safe;
}

function buildCanonicalContractSnapshot(record, runtimeContext = {}){
  const item = record && typeof record === 'object' ? record : {};
  const context = runtimeContext && typeof runtimeContext === 'object' ? runtimeContext : {};
  const marketData = item.marketData && typeof item.marketData === 'object' ? item.marketData : {};
  const scan = item.scan && typeof item.scan === 'object' ? item.scan : {};
  const review = item.review && typeof item.review === 'object' ? item.review : {};
  const plan = item.plan && typeof item.plan === 'object' ? item.plan : {};
  const setup = item.setup && typeof item.setup === 'object' ? item.setup : {};
  const lifecycle = item.lifecycle && typeof item.lifecycle === 'object' ? item.lifecycle : {};
  const manualReview = review.manualReview && typeof review.manualReview === 'object'
    ? review.manualReview
    : null;
  const canonicalVerdict = normalizeVerdictKey(
    context.reviewCanonicalVerdict
    || context.sharedPresentationCanonicalVerdict
    || context.trackPresentationCanonicalVerdict
    || context.scannerCanonicalVerdict
    || review.savedVerdict
    || scan.resolvedVerdict
    || scan.verdict
    || 'watch'
  ) || 'watch';
  const canonicalVisualBucket = normalizeVerdictKey(
    context.reviewVisualBucket
    || context.sharedPresentationVisualBucket
    || context.trackPresentationVisualBucket
    || context.scannerVisualBucket
    || (canonicalVerdict === 'entry'
      ? 'entry'
      : (canonicalVerdict === 'near_entry'
        ? 'near_entry'
        : (canonicalVerdict === 'avoid' ? 'avoid' : 'monitor')))
  ) || 'monitor';
  const stampedPlan = !!(
    String(plan.authorityVersion || '').trim() === 'trade_plan_v1'
    && String(plan.authoritySource || '').trim()
  );
  const firstTarget = normalizeNumber(plan.firstTarget != null ? plan.firstTarget : plan.target);
  const authoritativeInputs = {
    ticker:String(item.ticker || '').trim().toUpperCase(),
    marketData:{
      price:normalizeNumber(marketData.price),
      ma20:normalizeNumber(marketData.ma20 != null ? marketData.ma20 : marketData.sma20),
      ma50:normalizeNumber(marketData.ma50 != null ? marketData.ma50 : marketData.sma50),
      ma200:normalizeNumber(marketData.ma200 != null ? marketData.ma200 : marketData.sma200),
      volume:normalizeNumber(marketData.volume),
      avgVolume:normalizeNumber(marketData.avgVolume),
      perf1w:normalizeNumber(marketData.perf1w),
      perf1m:normalizeNumber(marketData.perf1m),
      asOf:String(marketData.asOf || '').trim()
    },
    scanner:{
      resolvedVerdict:String(scan.resolvedVerdict || scan.verdict || '').trim(),
      score:normalizeNumber(scan.score),
      analysisProjection:scan.analysisProjection && typeof scan.analysisProjection === 'object'
        ? cloneJsonValue(scan.analysisProjection)
        : null,
      flags:scan.flags && typeof scan.flags === 'object' ? cloneJsonValue(scan.flags) : null
    },
    reviewAuthority:{
      savedVerdict:String(review.savedVerdict || '').trim(),
      savedScore:normalizeNumber(review.savedScore),
      manualReview:manualReview ? cloneJsonValue(manualReview) : null
    },
    planAuthority:{
      entry:stampedPlan ? normalizeNumber(plan.entry) : null,
      stop:stampedPlan ? normalizeNumber(plan.stop) : null,
      firstTarget:stampedPlan ? firstTarget : null,
      source:stampedPlan ? String(plan.source || '').trim().toLowerCase() : '',
      authoritySource:stampedPlan ? String(plan.authoritySource || '').trim().toLowerCase() : '',
      authorityVersion:stampedPlan ? String(plan.authorityVersion || '').trim() : '',
      submittedPaperTradeAt:String(plan.submittedPaperTradeAt || '').trim()
    },
    lifecycleAuthority:{
      stage:String(lifecycle.stage || '').trim().toLowerCase(),
      status:String(lifecycle.status || '').trim().toLowerCase(),
      lockReason:String(lifecycle.lockReason || '').trim(),
      expiresAt:String(lifecycle.expiresAt || '').trim()
    },
    paperTradeAuthority:{
      submittedTrades:[]
    }
  };
  const planStatus = String(plan.status || '').trim().toLowerCase() || 'missing';
  return {
    schemaVersion:'plan-verdict-contract-v1',
    ticker:authoritativeInputs.ticker,
    authoritativeInputs,
    canonicalVerdict,
    canonicalVisualBucket,
    derivedStates:{
      setupScore:normalizeNumber(review.savedScore != null ? review.savedScore : (setup.score != null ? setup.score : scan.score)),
      planReady:[normalizeNumber(plan.entry), normalizeNumber(plan.stop), firstTarget].every(Number.isFinite),
      planStatus,
      tradeability:String(plan.tradeability || '').trim().toLowerCase(),
      riskStatus:String(plan.riskStatus || plan.risk_status || '').trim().toLowerCase(),
      inWatchlist:!!(item.watchlist && item.watchlist.inWatchlist),
      hasSavedReviewAuthority:!!String(review.savedVerdict || '').trim(),
      structureState:String(setup.structureState || '').trim().toLowerCase(),
      structureEligibility:String(setup.structureEligibility || '').trim().toLowerCase(),
      setupLocationState:String(setup.setupLocationState || '').trim().toLowerCase(),
      priceabilityState:String(setup.priceabilityState || '').trim().toLowerCase(),
      bounceState:String(setup.bounceState || '').trim().toLowerCase(),
      supportContext:String(setup.supportContext || setup.support_context || '').trim().toLowerCase(),
      supportTestState:String(setup.supportTestState || setup.support_test_state || '').trim().toLowerCase(),
      buyerControlState:String(setup.buyerControlState || setup.buyer_control_state || '').trim().toLowerCase(),
      lifecycleState:String(lifecycle.state || canonicalVerdict).trim().toLowerCase()
    },
    planAuthority:{
      entry:normalizeNumber(plan.entry),
      stop:normalizeNumber(plan.stop),
      firstTarget,
      source:String(plan.source || '').trim().toLowerCase(),
      stamped:stampedPlan,
      status:planStatus,
      tradeability:String(plan.tradeability || '').trim().toLowerCase(),
      riskStatus:String(plan.riskStatus || plan.risk_status || '').trim().toLowerCase()
    },
    lifecycleAuthority:{
      stage:String(lifecycle.stage || '').trim().toLowerCase(),
      status:String(lifecycle.status || '').trim().toLowerCase(),
      state:String(lifecycle.state || canonicalVerdict).trim().toLowerCase(),
      label:String(lifecycle.label || '').trim(),
      lockReason:String(lifecycle.lockReason || '').trim(),
      expiresAt:String(lifecycle.expiresAt || '').trim()
    },
    paperTradeAuthority:{
      submittedTrades:[],
      submittedPaperTradeAt:String(plan.submittedPaperTradeAt || '').trim(),
      currentPlanSnapshot:planStatus !== 'missing'
        ? {
          entry:normalizeNumber(plan.entry),
          stop:normalizeNumber(plan.stop),
          target:normalizeNumber(plan.target),
          firstTarget,
          status:planStatus
        }
        : null
    },
    contractFingerprint:String(context.contractFingerprint || ''),
    diagnostics:{
      source:String(context.snapshotSource || 'replay_snapshot').trim().toLowerCase(),
      surface:String(context.snapshotSurface || 'replay').trim().toLowerCase(),
      reason:String(context.snapshotReason || 'replay_snapshot').trim()
    }
  };
}

function buildRenderModelSnapshot(contract, runtimeContext = {}){
  const safeContract = contract && typeof contract === 'object' ? contract : {};
  const context = runtimeContext && typeof runtimeContext === 'object' ? runtimeContext : {};
  const verdict = normalizeVerdictKey(safeContract.canonicalVerdict || 'watch') || 'watch';
  const visualBucket = normalizeVerdictKey(safeContract.canonicalVisualBucket || '') || (verdict === 'entry'
    ? 'entry'
    : (verdict === 'near_entry' ? 'near_entry' : (verdict === 'avoid' ? 'avoid' : 'monitor')));
  const label = verdict === 'entry'
    ? 'Entry'
    : (verdict === 'near_entry' ? 'Near Entry' : (verdict === 'avoid' ? 'Avoid' : 'Watch'));
  const headline = verdict === 'entry' ? 'Entry Ready' : label;
  const nextAction = verdict === 'entry'
    ? 'Execute only if the trigger remains valid.'
    : (verdict === 'avoid'
      ? 'Avoid until structure rebuilds and risk can be defined cleanly.'
      : 'Wait for stronger confirmation before considering entry.');
  const primaryReason = verdict === 'entry'
    ? 'Buyers are in control and the setup is ready to act on.'
    : (verdict === 'near_entry'
      ? 'The setup is close, but confirmation still needs to improve.'
      : (verdict === 'avoid'
        ? 'A blocking issue is active, so the setup is not tradable.'
        : 'Confirmation is still developing, so the setup stays on watch.'));
  const planStatus = String(safeContract.planAuthority && safeContract.planAuthority.status || safeContract.derivedStates && safeContract.derivedStates.planStatus || 'missing').trim().toLowerCase();
  const setupScore = normalizeNumber(safeContract.derivedStates && safeContract.derivedStates.setupScore);
  return {
    review:{
      ticker:String(safeContract.ticker || ''),
      canonicalVerdict:verdict,
      visualBucket,
      tone:visualBucket,
      badgeLabel:label,
      headline,
      nextAction,
      primaryReason,
      planVisible:verdict === 'entry',
      planStatus,
      setupScore,
      actionable:verdict === 'entry' && !!(safeContract.planAuthority && safeContract.planAuthority.stamped),
      draftState:context.reviewDraftState ? cloneJsonValue(context.reviewDraftState) : null,
      contractFingerprint:String(safeContract.contractFingerprint || '')
    },
    track:{
      ticker:String(safeContract.ticker || ''),
      canonicalVerdict:verdict,
      visualBucket,
      visibleBucket:visualBucket,
      tone:visualBucket,
      badgeLabel:label,
      headline,
      statusText:headline,
      nextAction,
      actionLabel:nextAction,
      primaryReason,
      mainBlocker:primaryReason,
      planVisible:verdict === 'entry',
      planStatus,
      planSummary:verdict === 'entry' ? 'Trade plan available.' : 'No actionable trade plan yet.',
      setupScore,
      inWatchlist:safeContract.derivedStates && safeContract.derivedStates.inWatchlist === true,
      contractFingerprint:String(safeContract.contractFingerprint || '')
    },
    trackLongPress:{
      ticker:String(safeContract.ticker || ''),
      canonicalVerdict:verdict,
      header:headline,
      actionable:verdict === 'entry',
      nextAction,
      primaryReason,
      visualBucket,
      contractFingerprint:String(safeContract.contractFingerprint || '')
    }
  };
}

function buildVisibleCopySnapshot(appState = {}){
  const scan = appState.scan || {};
  const review = appState.review || {};
  const track = appState.track || {};
  const reviewVisible = review.visible || {};
  const reviewState = review.stateHealth || {};
  const trackVisible = track.visible || {};
  const trackState = track.simplifiedState || {};
  const diagnostics = track.diagnostics || {};
  const watchlistVisual = diagnostics.watchlistVisualState || {};
  const entryConditions = (trackVisible.entryPanel && typeof trackVisible.entryPanel === 'object')
    ? trackVisible.entryPanel
    : (watchlistVisual.entryConditionsSummary || {});
  const entryPanel = entryConditions && typeof entryConditions === 'object'
    ? {
      status:normalizeCopyText(entryConditions.status || entryConditions.header),
      why:normalizeCopyText(entryConditions.why || entryConditions.primary),
      signals:Array.isArray(entryConditions.signals)
        ? entryConditions.signals.map(normalizeCopyText).filter(Boolean)
        : [],
      stillMissing:normalizeCopyText(entryConditions.stillMissing || entryConditions.definitionLine),
      upgrade:normalizeCopyText(entryConditions.upgrade || entryConditions.triggerLine),
      nextAction:normalizeCopyText(entryConditions.nextRequiredAction),
      downgrade:normalizeCopyText(entryConditions.downgrade || entryConditions.futureStateLine),
      whyNotEntry:normalizeCopyText(entryConditions.whyNotEntry)
    }
    : null;
  return {
    scan:{
      badge:normalizeCopyText(scan.visibleCard && scan.visibleCard.badgeLabel),
      technical:normalizeCopyText(scan.visibleCard && scan.visibleCard.technicalSummary),
      decision:normalizeCopyText(scan.visibleCard && scan.visibleCard.decisionSummary),
      trace:normalizeCopyText(scan.decisionTrace && scan.decisionTrace.panelText)
    },
    review:{
      canonicalVerdict:normalizeCopyText(reviewState.canonicalVerdict),
      visualBucket:normalizeCopyText(reviewState.visualBucket),
      badge:normalizeCopyText(reviewVisible.badgeLabel),
      headline:normalizeCopyText(reviewVisible.reviewHeadline),
      tradeStatus:normalizeCopyText(reviewVisible.reviewStatus),
      workspaceStatus:normalizeCopyText(reviewVisible.workspaceStatus),
      nextActionInline:normalizeCopyText(reviewVisible.actionLabel),
      nextActionPrimary:normalizeCopyText(reviewVisible.actionPrimary),
      technical:normalizeCopyText(reviewVisible.technicalSummary),
      rr:normalizeCopyText(reviewVisible.rr),
      entry:normalizeCopyText(reviewVisible.entry),
      stop:normalizeCopyText(reviewVisible.stop),
      target:normalizeCopyText(reviewVisible.target),
      entryVisible:reviewVisible.entryVisible === true,
      capitalVisible:reviewVisible.capitalVisible === true,
      rrVisible:reviewVisible.rrVisible === true
    },
    track:{
      canonicalVerdict:normalizeCopyText(trackVisible.badgeLabel || trackState.canonicalVerdict),
      visualBucket:normalizeCopyText(trackVisible.visualState || trackState.visualBucket),
      badge:normalizeCopyText(trackVisible.badgeLabel),
      decision:normalizeCopyText(trackVisible.decisionSummary),
      planMeta:normalizeCopyText(trackVisible.planMeta),
      cardText:normalizeCopyText(trackVisible.cardText),
      entryPanel
    }
  };
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
  const reviewProjectionSource = String(context.reviewProjectionSource || '').trim().toLowerCase();
  const projectionVerdict = String(
    context.reviewProjectionSnapshot
    && (
      context.reviewProjectionSnapshot.canonicalVerdict
      || context.reviewProjectionSnapshot.finalVerdict
      || context.reviewProjectionSnapshot.renderedVerdict
      || ''
    )
  ).trim().toLowerCase();
  const currentCanonicalVerdict = String(
    context.reviewCanonicalVerdict
    || context.sharedPresentationCanonicalVerdict
    || context.trackPresentationCanonicalVerdict
    || context.scannerCanonicalVerdict
    || ''
  ).trim().toLowerCase();
  const liveReviewProjectionAuthority = ['clicked_card_snapshot', 'track_projection_updated'].includes(reviewProjectionSource)
    && (!projectionVerdict || !currentCanonicalVerdict || projectionVerdict === currentCanonicalVerdict);
  const scan = item.scan && typeof item.scan === 'object' ? item.scan : {};
  const meta = item.meta && typeof item.meta === 'object' ? item.meta : {};
  const setup = item.setup && typeof item.setup === 'object' ? item.setup : {};
  const plan = item.plan && typeof item.plan === 'object' ? item.plan : {};
  const manualReview = review.manualReview && typeof review.manualReview === 'object'
    ? review.manualReview
    : null;
  const canonicalContract = cloneJsonValue(
    context.canonicalContract && typeof context.canonicalContract === 'object'
      ? context.canonicalContract
      : buildCanonicalContractSnapshot(item, context)
  );
  const renderModels = cloneJsonValue(
    context.renderModels && typeof context.renderModels === 'object'
      ? context.renderModels
      : buildRenderModelSnapshot(canonicalContract, context)
  );
  return {
    ticker:String(item.ticker || ''),
    canonicalContract,
    renderModels,
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
    setup:pickObject(setup, [
      'marketCaution',
      'volumeRequired',
      'bounceState',
      'structureState',
      'structureEligibility',
      'stabilisationState',
      'priceabilityState',
      'setupLocationState',
      'pullbackZone',
      'trendState'
    ]),
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
      projectionSource:reviewProjectionSource,
      projectionSnapshot:liveReviewProjectionAuthority && context.reviewProjectionSnapshot && typeof context.reviewProjectionSnapshot === 'object'
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
    const cloneValue = (value, seen = new WeakSet(), depth = 0) => {
      if(value === null || value === undefined) return value ?? null;
      if(depth > 8) return '[depth_limited]';
      if(typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
      if(value instanceof Date) return value.toISOString();
      if(Array.isArray(value)) return value.map(entry => cloneValue(entry, seen, depth + 1));
      if(typeof value !== 'object') return String(value);
      if(seen.has(value)) return '[circular]';
      seen.add(value);
      const output = {};
      Object.keys(value).forEach(key => {
        try{
          output[key] = cloneValue(value[key], seen, depth + 1);
        }catch(_error){
          output[key] = '[unclonable]';
        }
      });
      seen.delete(value);
      return output;
    };
    try{
      if(typeof getTickerRecord === 'function'){
        const direct = getTickerRecord(normalizedTicker);
        if(direct) return cloneValue(direct);
      }
    }catch(_error){}
    try{
      if(typeof allTickerRecords === 'function'){
        const records = allTickerRecords();
        if(Array.isArray(records)){
          return cloneValue(records.find(item => String(item && item.ticker || '').trim().toUpperCase() === normalizedTicker) || null);
        }
      }
    }catch(_error){}
    return null;
  }, {ticker:targetTicker});

  let authoritativeRecord = await resolveAppRecord(ticker);
  if(!authoritativeRecord){
    await page.waitForFunction(targetTicker => {
      const normalizedTicker = String(targetTicker || '').trim().toUpperCase();
      try{
        if(typeof getTickerRecord === 'function' && getTickerRecord(normalizedTicker)) return true;
      }catch(_error){}
      try{
        if(typeof allTickerRecords === 'function'){
          const records = allTickerRecords();
          return Array.isArray(records) && records.some(item => String(item && item.ticker || '').trim().toUpperCase() === normalizedTicker);
        }
      }catch(_error){}
      return false;
    }, ticker, {timeout:2000}).catch(() => null);
    authoritativeRecord = await resolveAppRecord(ticker);
  }

  const appState = await page.evaluate(async ({ticker, consoleEvents, authoritativeRecord}) => {
    const safeText = value => String(value || '').replace(/\s+/g, ' ').trim();
    const cloneValue = (value, seen = new WeakSet(), depth = 0) => {
      if(value === null || value === undefined) return value ?? null;
      if(depth > 8) return '[depth_limited]';
      if(typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
      if(value instanceof Date) return value.toISOString();
      if(Array.isArray(value)){
        return value.map(entry => cloneValue(entry, seen, depth + 1));
      }
      if(typeof value !== 'object') return String(value);
      if(seen.has(value)) return '[circular]';
      seen.add(value);
      const output = {};
      Object.keys(value).forEach(key => {
        try{
          output[key] = cloneValue(value[key], seen, depth + 1);
        }catch(_error){
          output[key] = '[unclonable]';
        }
      });
      seen.delete(value);
      return output;
    };
    const searchNamedFields = (value, targetKeys, path = '', output = []) => {
      if(!value || typeof value !== 'object') return output;
      if(Array.isArray(value)){
        value.forEach((entry, index) => {
          searchNamedFields(entry, targetKeys, `${path}[${index}]`, output);
        });
        return output;
      }
      Object.keys(value).forEach(key => {
        const nextPath = path ? `${path}.${key}` : key;
        const current = value[key];
        if(targetKeys.includes(key)){
          output.push({
            path:nextPath,
            key,
            value:typeof current === 'string' || typeof current === 'number' || typeof current === 'boolean'
              ? current
              : cloneValue(current)
          });
        }
        if(current && typeof current === 'object'){
          searchNamedFields(current, targetKeys, nextPath, output);
        }
      });
      return output;
    };
    const withReviewProjectionSuppressed = callback => {
      if(typeof callback !== 'function') return null;
      const stateRef = typeof window !== 'undefined' && window && typeof window.uiState === 'object' && window.uiState
        ? window.uiState
        : null;
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
      try{
        if(typeof getTickerRecord === 'function'){
          const direct = getTickerRecord(ticker);
          if(direct) return direct;
        }
      }catch(_error){}
      try{
        if(typeof allTickerRecords === 'function'){
          const records = allTickerRecords();
          if(Array.isArray(records)){
            return records.find(item => String(item && item.ticker || '').trim().toUpperCase() === String(ticker || '').trim().toUpperCase()) || null;
          }
        }
      }catch(_error){}
      return null;
    })();
    const globalVerdict = record && typeof resolveGlobalVerdict === 'function' ? resolveGlobalVerdict(record) : null;
    const scanSimplified = record && typeof resolveSimplifiedStateForSurface === 'function'
      ? withReviewProjectionSuppressed(() => resolveSimplifiedStateForSurface(record, 'scan', {source:'playwright_parity', mutationSource:'playwright_parity'}))
      : null;
    const scanRenderPathSimplified = record && typeof resolveSimplifiedStateForSurface === 'function'
      ? withReviewProjectionSuppressed(() => resolveSimplifiedStateForSurface(record, 'scan', {source:'scan_grouping', mutationSource:'scan_grouping'}))
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
    const lexicalUiStateRef = (() => {
      try{
        return typeof uiState === 'object' && uiState ? uiState : null;
      }catch(_error){
        return null;
      }
    })();
    const lexicalStateRef = (() => {
      try{
        return typeof state === 'object' && state ? state : null;
      }catch(_error){
        return null;
      }
    })();
    const uiStateRef = lexicalUiStateRef || (typeof window !== 'undefined' && window && typeof window.uiState === 'object' && window.uiState
      ? window.uiState
      : null);
    const stateRef = lexicalStateRef || (typeof window !== 'undefined' && window && typeof window.state === 'object' && window.state
      ? window.state
      : {});
    const activeProjectionSnapshot = uiStateRef
      && uiStateRef.activeReviewSourceProjectionSnapshot
      && typeof uiStateRef.activeReviewSourceProjectionSnapshot === 'object'
      && String(uiStateRef.activeReviewSourceProjectionSnapshot.ticker || '').trim().toUpperCase() === String(ticker || '').trim().toUpperCase()
        ? uiStateRef.activeReviewSourceProjectionSnapshot
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
      ? String((activeProjectionSnapshot && uiStateRef && uiStateRef.activeReviewProjectionSource) || 'clicked_card_snapshot')
      : '';
    const reviewShell = document.querySelector('#reviewWorkspace .reviewworkspace');
    const activeTrackCard = document.querySelector(`[data-watchlist-ticker="${ticker}"]`);
    const activeTrackEntryPanel = activeTrackCard && activeTrackCard.querySelector('.entry-conditions-panel');
    const diaryEntries = Array.isArray(stateRef.tradeDiary)
      ? stateRef.tradeDiary.filter(entry => String(entry && entry.ticker || '').trim().toUpperCase() === String(ticker || '').trim().toUpperCase())
      : [];
    const watchlistPresentation = record && record.watchlist && record.watchlist.presentation && typeof record.watchlist.presentation === 'object'
      ? record.watchlist.presentation
      : null;
    let paperTradeContext = null;
    try{
      paperTradeContext = typeof currentPaperTradeContextForTicker === 'function'
        ? currentPaperTradeContextForTicker(ticker)
        : null;
    }catch(_error){}
    let paperTradeDebug = null;
    try{
      paperTradeDebug = typeof currentPaperTradeDebugSnapshotForTicker === 'function'
        ? currentPaperTradeDebugSnapshotForTicker(ticker)
        : null;
    }catch(_error){}
    let paperTradeUi = null;
    try{
      paperTradeUi = typeof paperTradeUiStateForTicker === 'function'
        ? paperTradeUiStateForTicker(ticker)
        : null;
    }catch(_error){}
    let paperTradeGateway = null;
    try{
      paperTradeGateway = typeof tradeGatewayHealthModel === 'function'
        ? tradeGatewayHealthModel()
        : null;
    }catch(_error){}
    let appReplaySnapshot = null;
    try{
      appReplaySnapshot = typeof buildReplaySnapshotForTicker === 'function'
        ? buildReplaySnapshotForTicker(record)
        : null;
    }catch(_error){}
    const paperTradeBtn = document.getElementById('paperTradeBtn');
    const staleFieldTargets = [
      'savedVerdict',
      'resolvedVerdict',
      'reviewVerdict',
      'badgeLabel',
      'actionLabel',
      'headline',
      'summary',
      'presentation',
      'sharedPresentation',
      'scannerEstimate',
      'reviewPresentation',
      'trackPresentation'
    ];
    const staleFieldScanRoots = {
      record:record || null,
      reviewStateHealth,
      reviewVisible,
      trackSnapshot,
      watchlistPresentation,
      paperTradeContext
    };
    const capturedState = cloneValue({
      ticker,
      authoritativeRecord:cloneValue(record),
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
          setupScore:Number.isFinite(Number(scanSimplified.setupScore)) ? Number(scanSimplified.setupScore) : null,
          badgeLabel:String(scanSimplified.badgeLabel || ''),
          actionLabel:String(scanSimplified.actionLabel || ''),
          planStatus:String(scanSimplified.planStatus || ''),
          mainBlocker:String(scanSimplified.mainBlocker || '')
        } : null,
        renderPathSimplifiedState:scanRenderPathSimplified ? {
          canonicalVerdict:String(scanRenderPathSimplified.canonicalVerdict || ''),
          visualBucket:String(scanRenderPathSimplified.visualBucket || ''),
          tone:String(scanRenderPathSimplified.tone || ''),
          setupScore:Number.isFinite(Number(scanRenderPathSimplified.setupScore)) ? Number(scanRenderPathSimplified.setupScore) : null,
          badgeLabel:String(scanRenderPathSimplified.badgeLabel || ''),
          actionLabel:String(scanRenderPathSimplified.actionLabel || ''),
          planStatus:String(scanRenderPathSimplified.planStatus || ''),
          mainBlocker:String(scanRenderPathSimplified.mainBlocker || '')
        } : null,
        visibleCard:{
          visualState:String(document.querySelector(`#results .resultcompact[data-ticker="${ticker}"]`) && document.querySelector(`#results .resultcompact[data-ticker="${ticker}"]`).dataset && document.querySelector(`#results .resultcompact[data-ticker="${ticker}"]`).dataset.visualState || ''),
          visualTone:String(document.querySelector(`#results .resultcompact[data-ticker="${ticker}"]`) && document.querySelector(`#results .resultcompact[data-ticker="${ticker}"]`).dataset && document.querySelector(`#results .resultcompact[data-ticker="${ticker}"]`).dataset.visualTone || ''),
          sectionTitle:safeText((() => {
            const card = document.querySelector(`#results .resultcompact[data-ticker="${ticker}"]`);
            if(!card) return '';
            const group = card.closest('.resultsgroup');
            return group && group.querySelector('.summary strong')
              ? group.querySelector('.summary strong').textContent
              : '';
          })()),
          badgeLabel:safeText(document.querySelector(`#results .resultcompact[data-ticker="${ticker}"] .badge.state-pill`) && document.querySelector(`#results .resultcompact[data-ticker="${ticker}"] .badge.state-pill`).textContent),
          scoreLabel:safeText(document.querySelector(`#results .resultcompact[data-ticker="${ticker}"] .visual-score, #results .resultcompact[data-ticker="${ticker}"] .score`) && document.querySelector(`#results .resultcompact[data-ticker="${ticker}"] .visual-score, #results .resultcompact[data-ticker="${ticker}"] .score`).textContent),
          technicalSummary:safeText(document.querySelector(`#results .resultcompact[data-ticker="${ticker}"] .scan-card__technical`) && document.querySelector(`#results .resultcompact[data-ticker="${ticker}"] .scan-card__technical`).textContent),
          decisionSummary:safeText(document.querySelector(`#results .resultcompact[data-ticker="${ticker}"] .scan-card__decision`) && document.querySelector(`#results .resultcompact[data-ticker="${ticker}"] .scan-card__decision`).textContent)
        },
        decisionTrace:{
          panelText:safeText(document.querySelector(`#results .resultcompact[data-ticker="${ticker}"] [data-scan-decision-trace-content]`) && document.querySelector(`#results .resultcompact[data-ticker="${ticker}"] [data-scan-decision-trace-content]`).textContent)
        }
      },
      review:{
        stateHealth:cloneValue(reviewStateHealth),
        chartGuruAudit:(record && typeof buildChartGuruAuditSnapshot === 'function')
          ? cloneValue(buildChartGuruAuditSnapshot(record))
          : null,
        visible:{
          currentVerdict:String(reviewShell && reviewShell.dataset && reviewShell.dataset.visualState || reviewVisible && reviewVisible.currentVerdict || ''),
          currentTone:String(reviewShell && reviewShell.dataset && reviewShell.dataset.visualTone || reviewVisible && reviewVisible.currentTone || ''),
          badgeLabel:safeText(
            (document.querySelector('#reviewWorkspace .review-summary-badges .badge')
              || document.querySelector('#reviewWorkspace .badge.state-pill'))
            && (
              (document.querySelector('#reviewWorkspace .review-summary-badges .badge')
                || document.querySelector('#reviewWorkspace .badge.state-pill')).textContent
            )
          ),
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
          planStatus:String(globalVerdict.planStateKey || globalVerdict.plan_status || ''),
          allowWatchlist:globalVerdict.allow_watchlist === true,
          allowPlan:globalVerdict.allow_plan === true,
          primaryBlockerSource:String(globalVerdict.primary_blocker_source || ''),
          contractAuthority:String(globalVerdict.contractDiagnostics && globalVerdict.contractDiagnostics.authorityContract || ''),
          contractSelectionSource:String(
            globalVerdict.selected_authority_contract_source
            || globalVerdict.contractDiagnostics && globalVerdict.contractDiagnostics.authoritySelectionSource
            || ''
          ),
          canonicalSelectionSource:String(
            globalVerdict.canonical_soft_readiness_alignment_source
            || globalVerdict.contractDiagnostics && globalVerdict.contractDiagnostics.canonicalAuthoritySelectionSource
            || ''
          ),
          canonicalAlignmentApplied:globalVerdict.canonical_soft_readiness_alignment_applied === true
        } : null
      },
      paperTrade:{
        button:{
          visible:!!paperTradeBtn,
          enabled:!!(paperTradeBtn && !paperTradeBtn.disabled),
          text:safeText(paperTradeBtn && paperTradeBtn.textContent),
          disabledReason:safeText(document.getElementById('paperTradeDisabledReason') && document.getElementById('paperTradeDisabledReason').textContent),
          statusText:safeText(document.getElementById('paperTradeStatusLine') && document.getElementById('paperTradeStatusLine').textContent),
          previewText:safeText(document.getElementById('paperTradePreview') && document.getElementById('paperTradePreview').textContent)
        },
        gateway:paperTradeGateway ? cloneValue(paperTradeGateway) : null,
        uiState:paperTradeUi ? cloneValue(paperTradeUi) : null,
        context:paperTradeContext ? cloneValue({
          ticker:paperTradeContext.ticker,
          canonicalVerdict:paperTradeContext.canonicalVerdict,
          finalVerdict:paperTradeContext.finalVerdict,
          eligibilityVerdict:paperTradeContext.eligibilityVerdict,
          actionabilityState:paperTradeContext.actionabilityState,
          paperTradeEnabled:paperTradeContext.paperTradeEnabled === true,
          setupScore:paperTradeContext.setupScore,
          eligibility:paperTradeContext.eligibility,
          displayedPlan:paperTradeContext.displayedPlan,
          resolvedContract:paperTradeContext.resolvedContract,
          derivedStates:paperTradeContext.derivedStates,
          debugSnapshot:paperTradeContext.debugSnapshot
        }) : null,
        debug:cloneValue(paperTradeDebug)
      },
      track:{
        simplifiedState:trackSnapshot && trackSnapshot.simplifiedState ? cloneValue(trackSnapshot.simplifiedState) : null,
        visible:{
          badgeLabel:safeText(activeTrackCard && activeTrackCard.querySelector('.badge.state-pill') && activeTrackCard.querySelector('.badge.state-pill').textContent),
          visualState:String(activeTrackCard && activeTrackCard.dataset && activeTrackCard.dataset.visualState || ''),
          visualTone:String(activeTrackCard && activeTrackCard.dataset && activeTrackCard.dataset.visualTone || ''),
          scoreLabel:safeText(activeTrackCard && activeTrackCard.querySelector('.watchlistscore, .watchlist-card__status .visual-score, .watchlist-card__status .score') && activeTrackCard.querySelector('.watchlistscore, .watchlist-card__status .visual-score, .watchlist-card__status .score').textContent),
          decisionSummary:safeText(activeTrackCard && activeTrackCard.querySelector('.decision-summary') && activeTrackCard.querySelector('.decision-summary').textContent),
          planMeta:safeText(activeTrackCard && activeTrackCard.querySelector('.watchlist-plan-meta') && activeTrackCard.querySelector('.watchlist-plan-meta').textContent),
          cardText:safeText(activeTrackCard && activeTrackCard.textContent),
          entryPanel:activeTrackEntryPanel ? {
            status:safeText(activeTrackEntryPanel.querySelector('.entry-conditions-header') && activeTrackEntryPanel.querySelector('.entry-conditions-header').textContent).replace(/^Status:\s*/i, ''),
            why:safeText(activeTrackEntryPanel.querySelector('.entry-conditions-pattern') && activeTrackEntryPanel.querySelector('.entry-conditions-pattern').textContent).replace(/^Why:\s*/i, ''),
            text:safeText(activeTrackEntryPanel.textContent)
          } : null
        },
        diagnostics:cloneValue(trackSnapshot)
      },
      diary:{
        entries:cloneValue(diaryEntries) || [],
        visibleCards:Array.from(document.querySelectorAll('#tradeDiary .diaryitem, #tradeDiary > div')).map(node => safeText(node.textContent)).filter(Boolean)
      },
      authority:{
        journey:authoritativeRecord && authoritativeRecord.authority && typeof authoritativeRecord.authority === 'object'
          ? cloneValue(authoritativeRecord.authority)
          : null,
        canonicalContract:cloneValue(
          reviewStateHealth && reviewStateHealth.contract
          || trackSnapshot && trackSnapshot.contract
          || null
        ),
        renderModels:cloneValue(
          reviewStateHealth && reviewStateHealth.renderModels
          || trackSnapshot && trackSnapshot.renderModels
          || null
        ),
        scanner:scanSimplified ? {
          canonicalVerdict:String(scanSimplified.canonicalVerdict || ''),
          contractCanonicalVerdict:String(
            scanSimplified.debug
            && scanSimplified.debug.authoritativeScanSurfaceSnapshot
            && scanSimplified.debug.authoritativeScanSurfaceSnapshot.contractCanonicalVerdict
            || ''
          ),
          visualBucket:String(scanSimplified.visualBucket || ''),
          actionState:String(scanSimplified.actionLabel || ''),
          tradePlanStatus:String(scanSimplified.planStatus || ''),
          scoutingOnly:!!(
            scanSimplified.debug
            && scanSimplified.debug.authoritativeScanSurfaceSnapshot
            && scanSimplified.debug.authoritativeScanSurfaceSnapshot.scoutingOnly === true
          ),
          divergenceType:String(
            scanSimplified.debug
            && scanSimplified.debug.authoritativeScanSurfaceSnapshot
            && scanSimplified.debug.authoritativeScanSurfaceSnapshot.diagnostics
            && scanSimplified.debug.authoritativeScanSurfaceSnapshot.diagnostics.divergenceType
            || ''
          )
        } : null,
        resolver:reviewStateHealth ? {
          canonicalVerdict:String(reviewStateHealth.canonicalVerdict || ''),
          visualBucket:String(reviewStateHealth.visualBucket || ''),
          actionState:String(reviewStateHealth.actionState || reviewStateHealth.actionLabel || ''),
          tradePlanStatus:String(reviewStateHealth.planStatus || '')
        } : null,
        review:reviewVisible ? {
          canonicalVerdict:String(reviewStateHealth && reviewStateHealth.canonicalVerdict || ''),
          visualBucket:String(reviewStateHealth && reviewStateHealth.visualBucket || ''),
          actionState:String(reviewStateHealth && (reviewStateHealth.actionState || reviewStateHealth.actionLabel) || ''),
          tradePlanStatus:String(reviewStateHealth && reviewStateHealth.planStatus || '')
        } : null,
        sharedPresentation:watchlistPresentation && watchlistPresentation.sharedPresentation ? cloneValue(watchlistPresentation.sharedPresentation) : null,
        trackPresentation:trackSnapshot && trackSnapshot.sharedPresentation ? cloneValue(trackSnapshot.sharedPresentation) : null,
        watchlist:watchlistPresentation ? cloneValue(watchlistPresentation) : null,
        paperTrade:paperTradeContext ? cloneValue({
          canonicalVerdict:String(
            paperTradeContext.canonicalVerdict
            || paperTradeContext.resolvedContract && (
              paperTradeContext.resolvedContract.finalVerdict
              || paperTradeContext.resolvedContract.final_verdict
              || paperTradeContext.resolvedContract.primaryState
            )
            || ''
          ),
          finalVerdict:paperTradeContext.finalVerdict,
          eligibilityVerdict:paperTradeContext.eligibilityVerdict || '',
          actionState:paperTradeContext.actionabilityState || '',
          tradePlanStatus:paperTradeContext.displayedPlan && paperTradeContext.displayedPlan.status
        }) : null,
        history:diaryEntries.length ? cloneValue({
          canonicalVerdict:'',
          lifecycleStatus:diaryEntries[diaryEntries.length - 1].status
            || diaryEntries[diaryEntries.length - 1].executionMeta && diaryEntries[diaryEntries.length - 1].executionMeta.status
            || '',
          sourceType:diaryEntries[diaryEntries.length - 1].sourceType || '',
          sourceRef:diaryEntries[diaryEntries.length - 1].sourceRef || '',
          eventRecorded:true,
          submittedAt:diaryEntries[diaryEntries.length - 1].executionMeta && diaryEntries[diaryEntries.length - 1].executionMeta.submittedAt
            || diaryEntries[diaryEntries.length - 1].updatedAt
            || diaryEntries[diaryEntries.length - 1].date
            || ''
        }) : null,
        replayBuilder:cloneValue(appReplaySnapshot)
      },
      staleFieldCandidates:searchNamedFields(staleFieldScanRoots, staleFieldTargets),
      startup:{
        debugRenderState:typeof startupDebugRenderState === 'function' ? cloneValue(startupDebugRenderState()) : null,
        tickerRecordCount:Object.keys(stateRef && stateRef.tickerRecords && typeof stateRef.tickerRecords === 'object' ? stateRef.tickerRecords : {}).length,
        trackedTickers:Array.isArray(stateRef && stateRef.tickers) ? stateRef.tickers.slice() : [],
        activeReviewTicker:(() => {
          try{
            return typeof activeReviewTicker === 'function' ? String(activeReviewTicker() || '') : '';
          }catch(_error){
            return '';
          }
        })()
      },
      console:{
        warnings:consoleEvents.filter(entry => entry.type === 'warning').map(entry => entry.text),
        errors:consoleEvents.filter(entry => entry.type === 'error' || entry.type === 'pageerror').map(entry => entry.text)
      },
      reviewProjectionContext:{
        reviewProjectionSource,
        reviewProjectionSnapshot:cloneValue(effectiveProjectionSnapshot)
      }
    });
    return capturedState;
  }, {ticker, consoleEvents, authoritativeRecord});
  appState.snapshot = buildReplaySnapshotFromRecord(appState.authoritativeRecord, {
    ...appState.reviewProjectionContext,
    canonicalContract:appState.authority && appState.authority.canonicalContract,
    renderModels:appState.authority && appState.authority.renderModels,
    reviewCanonicalVerdict:appState.review && appState.review.stateHealth && appState.review.stateHealth.canonicalVerdict,
    reviewVisualBucket:appState.review && appState.review.stateHealth && appState.review.stateHealth.visualBucket,
    sharedPresentationCanonicalVerdict:appState.authority && appState.authority.sharedPresentation && (
      appState.authority.sharedPresentation.canonicalVerdict
      || appState.authority.sharedPresentation.finalVerdict
    ),
    sharedPresentationVisualBucket:appState.authority && appState.authority.sharedPresentation && (
      appState.authority.sharedPresentation.sourceOfTruthVisualBucket
      || appState.authority.sharedPresentation.visualBucket
      || appState.authority.sharedPresentation.renderedBucket
    ),
    trackPresentationCanonicalVerdict:appState.authority && appState.authority.trackPresentation && (
      appState.authority.trackPresentation.canonicalVerdict
      || appState.authority.trackPresentation.finalVerdict
    ),
    trackPresentationVisualBucket:appState.authority && appState.authority.trackPresentation && (
      appState.authority.trackPresentation.sourceOfTruthVisualBucket
      || appState.authority.trackPresentation.visualBucket
      || appState.authority.trackPresentation.renderedBucket
    ),
    scannerCanonicalVerdict:appState.authority && appState.authority.scanner && appState.authority.scanner.canonicalVerdict
  });
  appState.snapshotContract = {
    hasCanonicalContract:!!(appState.snapshot && appState.snapshot.canonicalContract),
    hasRenderModels:!!(appState.snapshot && appState.snapshot.renderModels && appState.snapshot.renderModels.review && appState.snapshot.renderModels.track),
    hasAnalysisProjection:!!(appState.snapshot && appState.snapshot.scan && appState.snapshot.scan.analysisProjection),
    hasPlan:!!(appState.snapshot && appState.snapshot.plan),
    hasNormalizedReviewAnalysis:!!(appState.snapshot && appState.snapshot.review && appState.snapshot.review.analysisState && appState.snapshot.review.analysisState.normalized),
    hasReviewProjectionSnapshot:!!(appState.snapshot && appState.snapshot.review && appState.snapshot.review.projectionSnapshot),
    excludesWatchlistPresentation:!(appState.snapshot && appState.snapshot.watchlist && appState.snapshot.watchlist.presentation),
    excludesTrackDiagnostics:appState.snapshot && appState.snapshot.track === undefined
  };
  appState.visibleCopy = buildVisibleCopySnapshot(appState);
  const trackDiagnosticCanonicalVerdict = normalizeVerdictKey(appState.track && appState.track.simplifiedState && appState.track.simplifiedState.canonicalVerdict);
  const trackRenderedCanonicalVerdict = normalizeVerdictKey(appState.track && appState.track.visible && appState.track.visible.badgeLabel);
  const trackDiagnosticVisualBucket = normalizeVerdictKey(appState.track && appState.track.simplifiedState && appState.track.simplifiedState.visualBucket);
  const trackRenderedVisualBucket = normalizeVerdictKey(
    appState.track && appState.track.visible && (
      appState.track.visible.visualTone
      || appState.track.visible.visualState
    )
  );
  const trackAuthorityPresentation = appState.authority && (
    appState.authority.trackPresentation
    || appState.authority.sharedPresentation
  ) && typeof (appState.authority.trackPresentation || appState.authority.sharedPresentation) === 'object'
    ? (appState.authority.trackPresentation || appState.authority.sharedPresentation)
    : null;
  const trackAuthorityCanonicalVerdict = normalizeVerdictKey(
    trackAuthorityPresentation && (
      trackAuthorityPresentation.canonicalVerdict
      || trackAuthorityPresentation.finalVerdict
      || trackAuthorityPresentation.renderedVerdict
    )
  );
  const trackAuthorityBucket = normalizeVerdictKey(
    trackAuthorityPresentation && (
      trackAuthorityPresentation.sourceOfTruthVisualBucket
      || trackAuthorityPresentation.visualBucket
      || trackAuthorityPresentation.renderedBucket
    )
  );
  const trackContract = appState.authority && appState.authority.canonicalContract && typeof appState.authority.canonicalContract === 'object'
    ? appState.authority.canonicalContract
    : null;
  const trackContractCanonicalVerdict = normalizeVerdictKey(
    trackContract && (
      trackContract.canonicalVerdict
      || trackContract.canonicalVerdictKey
    )
  );
  const trackContractBucket = normalizeVerdictKey(
    trackContract && (
      trackContract.canonicalVisualBucket
      || trackContract.bucket
    )
  );
  const trackPresentationSourceOfTruth = normalizeCopyText(
    trackAuthorityPresentation && trackAuthorityPresentation.sourceOfTruth
  ).toLowerCase();
  const trackDiagnosticContractAuthority = normalizeCopyText(
    appState.track
    && appState.track.simplifiedState
    && appState.track.simplifiedState.contractDiagnostics
    && appState.track.simplifiedState.contractDiagnostics.authorityContract
  ).toLowerCase();
  const trackDiagnosticContractSource = normalizeCopyText(
    appState.track
    && appState.track.simplifiedState
    && (
      appState.track.simplifiedState.selected_authority_contract_source
      || appState.track.simplifiedState.canonical_soft_readiness_alignment_source
      || appState.track.simplifiedState.contractDiagnostics
      && appState.track.simplifiedState.contractDiagnostics.canonicalAuthoritySelectionSource
    )
  ).toLowerCase();
  appState.normalized = {
    reviewCanonicalVerdict:normalizeVerdictKey(appState.review && appState.review.stateHealth && appState.review.stateHealth.canonicalVerdict),
    reviewVisualBucket:normalizeVerdictKey(appState.review && appState.review.stateHealth && appState.review.stateHealth.visualBucket),
    trackCanonicalVerdict:trackRenderedCanonicalVerdict || trackDiagnosticCanonicalVerdict,
    trackVisualBucket:trackRenderedVisualBucket,
    trackRenderedBucket:trackRenderedVisualBucket,
    trackDiagnosticBucket:trackDiagnosticVisualBucket,
    trackAuthorityCanonicalVerdict,
    trackAuthorityBucket,
    trackContractCanonicalVerdict,
    trackContractBucket,
    trackPresentationSourceOfTruth,
    trackDiagnosticContractAuthority,
    trackDiagnosticContractSource,
    trackRenderedVsAuthorityMismatch:!!(
      (trackRenderedCanonicalVerdict && trackAuthorityCanonicalVerdict && trackRenderedCanonicalVerdict !== trackAuthorityCanonicalVerdict)
      || (trackRenderedVisualBucket && trackAuthorityBucket && trackRenderedVisualBucket !== trackAuthorityBucket)
    ),
    trackDiagnosticCanonicalVerdict,
    trackRenderedCanonicalVerdict,
    trackDiagnosticVisualBucket,
    trackRenderedVisualBucket,
    trackDiagnosticMatchesRenderedAuthority:!!(
      trackDiagnosticCanonicalVerdict
      && trackRenderedCanonicalVerdict
      && trackDiagnosticCanonicalVerdict === trackRenderedCanonicalVerdict
      && (!trackRenderedVisualBucket || trackDiagnosticVisualBucket === trackRenderedVisualBucket)
    ),
    scanCanonicalVerdict:normalizeVerdictKey(appState.scan && appState.scan.simplifiedState && appState.scan.simplifiedState.canonicalVerdict),
    scanVisualBucket:normalizeVerdictKey(appState.scan && appState.scan.simplifiedState && appState.scan.simplifiedState.visualBucket)
  };
  delete appState.authoritativeRecord;
  return appState;
}

module.exports = {
  buildReplaySnapshotFromRecord,
  buildVisibleCopySnapshot,
  extractAppTickerState,
  normalizeNumber
};
