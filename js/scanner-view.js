(function(global){
  // Scanner view/classification helpers extracted from app.js.
  function currentRrThreshold(){
    return 1.5;
  }

  function getRankedDisplayBucket(record, deps = {}){
    return buildFinalSetupView(record, {}, deps).bucket;
  }

  function getFinalBucketFromView(view, deps = {}){
    const item = view.item;
    const rrValue = deps.numericOrNull(view.rrValue);
    const targetReviewLabel = view.planUiState.state === 'valid' ? deps.targetReviewQueueLabel(item.plan.targetReviewState) : '';
    const derivedStates = view && view.setupStates ? view.setupStates : deps.analysisDerivedStatesFromRecord(item);
    const structureState = String(derivedStates && derivedStates.structureState || '').toLowerCase();
    const structurallyAlive = !['broken'].includes(structureState) && view.setupUiState.state !== 'broken';
    if(item.lifecycle.stage === 'expired') return 'filtered';
    if(view.setupUiState.state === 'broken') return 'filtered';
    if(view.setupUiState.state === 'entry'){
      if(targetReviewLabel) return 'focus';
      return 'focus';
    }
    if(view.setupUiState.state === 'watch'){
      if(targetReviewLabel || view.displayStage === 'Near Entry') return 'focus';
      return 'tradeable_secondary';
    }
    if(view.setupUiState.state === 'developing') return 'tradeable_secondary';
    if(structurallyAlive && ['needs_adjustment','pending_validation','invalid','unrealistic_rr'].includes(String(view.planUiState.state || '').toLowerCase())){
      return 'tradeable_secondary';
    }
    if(Number.isFinite(rrValue) && rrValue < currentRrThreshold() && !structurallyAlive) return 'filtered';
    if(view.planUiState.state === 'unrealistic_rr' && !structurallyAlive) return 'filtered';
    return 'tradeable_secondary';
  }

  function rrCategoryForView(view, deps = {}){
    const rrValue = deps.numericOrNull(view && view.rrValue);
    if(view && view.planUiState && view.planUiState.state === 'unrealistic_rr') return 'unrealistic';
    if(!Number.isFinite(rrValue)) return 'na';
    if(rrValue > 12) return 'unrealistic';
    if(rrValue > 8) return 'stretched';
    if(rrValue < currentRrThreshold()) return 'low';
    return 'normal';
  }

  function finalStructureQualityForView(view, deps = {}){
    const derivedStates = view && view.setupStates ? view.setupStates : null;
    const structureState = String(view && view.structureState || (derivedStates && derivedStates.structureState) || '').toLowerCase();
    const stabilisationState = String(view && view.stabilisationState || (derivedStates && derivedStates.stabilisationState) || '').toLowerCase();
    const bounceState = String(view && view.bounceState || (derivedStates && derivedStates.bounceState) || '').toLowerCase();
    if(['broken','weak','developing_loose'].includes(structureState)) return 'weak';
    if(['strong','intact'].includes(structureState)) return 'strong';
    if(structureState === 'developing_clean') return 'developing_clean';
    if(['developing','weakening'].includes(structureState)){
      return bounceState === 'confirmed' && ['clear','early'].includes(stabilisationState)
        ? 'developing_clean'
        : 'developing_loose';
    }
    return 'developing_loose';
  }

  function getFinalClassification(view, deps = {}){
    const resolved = view && view.scannerResolution
      ? view.scannerResolution
      : deps.resolveScannerStateWithTrace(view && view.item ? view.item : view, {baseView:view});
    const item = view && view.item ? view.item : view;
    const derivedStates = view && view.setupStates ? view.setupStates : deps.analysisDerivedStatesFromRecord(item);
    const presentation = deps.resolveEmojiPresentation(item, {
      context:'scanner',
      finalVerdict:view && (view.displayStage || view.finalVerdict),
      setupUiState:view && view.setupUiState,
      displayedPlan:view && view.displayedPlan,
      derivedStates,
      warningState:view && view.warningState
    });
    const primaryState = String(presentation.primaryState || '').toLowerCase();
    const structureState = String(derivedStates && derivedStates.structureState || '').toLowerCase();
    const structurallyAlive = !['broken'].includes(structureState) && String(view && view.setupUiState && view.setupUiState.state || '').toLowerCase() !== 'broken';
    if((primaryState === 'dead' || primaryState === 'inactive') && !structurallyAlive) return 'filtered';
    if(structurallyAlive && ['needs_adjustment','pending_validation','invalid','unrealistic_rr'].includes(String(view && view.planUiState && view.planUiState.state || '').toLowerCase())){
      return 'early';
    }
    if(primaryState === 'entry' || primaryState === 'near_entry') return 'tradeable';
    if(primaryState === 'monitor' || primaryState === 'developing') return 'early';
    return resolved.bucket;
  }

  function legacyBucketForFinalClassification(finalClassification){
    if(finalClassification === 'tradeable') return 'focus';
    if(finalClassification === 'early') return 'tradeable_secondary';
    return 'filtered';
  }

  function buildFinalSetupView(record, options = {}, deps = {}){
    const view = deps.projectTickerForCard(record, {...options, includeExecutionDowngrade:false, includeRuntimeFallback:false});
    const derivedStates = deps.analysisDerivedStatesFromRecord(view.item);
    const rrCategory = rrCategoryForView(view, deps);
    const structureQuality = finalStructureQualityForView({
      ...view,
      setupStates:derivedStates
    }, deps);
    const isStructureValid = ['strong','developing_clean'].includes(structureQuality);
    const bounceState = String(derivedStates.bounceState || '').toLowerCase();
    const hasPlanAdjustmentBlock = view.planUiState.state === 'needs_adjustment'
      || rrCategory === 'stretched'
      || !!(view.item && view.item.plan && view.item.plan.firstTargetTooClose);
    const isNotReadySetup = view.setupUiState.state === 'developing'
      || !isStructureValid
      || bounceState === 'none'
      || hasPlanAdjustmentBlock;
    const finalSetupState = view.setupUiState.state === 'broken'
      ? 'broken'
      : (isNotReadySetup ? 'developing' : view.setupUiState.state);
    const finalVerdictBadge = deps.primaryVerdictBadge(view.displayStage);
    const finalSetupUiState = {
      state:finalSetupState,
      label:finalVerdictBadge.label,
      className:finalVerdictBadge.className,
      setupLabel:deps.setupUiLabel(finalSetupState),
      setupClassName:deps.setupUiClass(finalSetupState)
    };
    const scannerResolution = deps.resolveScannerStateWithTrace(view.item, {
      baseView:view,
      derivedStates,
      rrCategory,
      structureQuality,
      isStructureValid,
      hasPlanAdjustmentBlock
    });
    const finalClassification = getFinalClassification({
      ...view,
      rrCategory,
      structureQuality,
      isStructureValid,
      hasPlanAdjustmentBlock,
      isNotReadySetup,
      bounceState,
      setupState:scannerResolution.setupState,
      planValidation:{state:view.planUiState.state},
      scannerResolution
    }, deps);
    const globalVerdict = deps.resolveGlobalVerdict(view.item);
    const scannerVerdict = deps.normalizeGlobalVerdictKey(globalVerdict.base_verdict || globalVerdict.final_verdict);
    const globalBadge = deps.getBadge(scannerVerdict);
    const bucket = deps.getBucket(scannerVerdict);
    const normalizedFinalClassification = ({
      tradeable_entry:'tradeable',
      monitor_watch:'early',
      lower_priority:'filtered'
    })[bucket] || legacyBucketForFinalClassification(finalClassification);
    if(view.item && view.item.scan){
      view.item.scan.resolvedVerdict = deps.globalVerdictLabel(scannerVerdict);
      view.item.scan.resolvedFinalDisplayState = deps.globalVerdictLabel(scannerVerdict);
      view.item.scan.resolvedBucket = String(bucket || '');
    }
    return {
      ...view,
      ticker:view.item.ticker,
      companyName:view.item.meta.companyName || '',
      setupStates:derivedStates,
      tradePlan:{
        effectivePlan:view.effectivePlan,
        displayedPlan:view.displayedPlan
      },
      planValidation:{
        state:view.planUiState.state,
        label:view.planUiState.label
      },
      score:view.setupScore,
      scoreLabel:view.setupScoreDisplay,
      setupUiState:{
        ...finalSetupUiState,
        label:globalBadge.text,
        className:globalBadge.className
      },
      setupState:scannerResolution.setupState,
      setupLabel:deps.globalVerdictLabel(scannerVerdict),
      rrCategory,
      structureQuality,
      isStructureValid,
      hasPlanAdjustmentBlock,
      isNotReadySetup,
      scannerResolution,
      displayStage:deps.globalVerdictLabel(scannerVerdict),
      finalVerdict:deps.globalVerdictLabel(scannerVerdict),
      finalClassification:normalizedFinalClassification,
      bucket,
      globalVerdict,
      reasonCodes:scannerResolution.reason_codes,
      decisionTrace:scannerResolution.trace,
      decisionWarnings:scannerResolution.warnings,
      rrDisplay:deps.shouldShowActionableRR(view) && Number.isFinite(view.actionableRrValue)
        ? `R:R ${view.actionableRrValue.toFixed(2)}`
        : '',
      structureLabel:deps.structureLabelForRecord(view.item, derivedStates, {displayStage:view.displayStage}),
      pullbackLabel:derivedStates.pullbackZone === 'near_20ma' ? 'Near 20MA' : (derivedStates.pullbackZone === 'near_50ma' ? 'Near 50MA' : ''),
      bounceLabel:derivedStates.bounceState === 'confirmed' ? 'Bounce confirmed' : (derivedStates.bounceState === 'attempt' ? 'Bounce tentative' : (derivedStates.bounceState === 'none' ? 'No bounce' : '')),
      canOpenReview:true,
      canAddToWatchlist:true
    };
  }

  function classifyRankedRecord(record, deps = {}){
    return getRankedDisplayBucket(record, deps);
  }

  function classifyRankedView(view){
    return view && view.bucket ? view.bucket : 'filtered';
  }

  function buildRankedBuckets(records, deps = {}){
    const deduped = new Map();
    (records || []).forEach(record => {
      const ticker = deps.normalizeTickerRecord(record).ticker;
      if(ticker && !deduped.has(ticker)) deduped.set(ticker, record);
    });
    const buckets = {focus:[], tradeableSecondary:[], filtered:[]};
    Array.from(deduped.values()).forEach(record => {
      const bucket = classifyRankedRecord(record, deps);
      if(bucket === 'filtered') buckets.filtered.push(record);
      else if(bucket === 'tradeable_secondary') buckets.tradeableSecondary.push(record);
      else buckets.focus.push(record);
    });
    return buckets;
  }

  function buildRankedBucketsFromViews(views, deps = {}){
    const deduped = new Map();
    (views || []).forEach(view => {
      const ticker = deps.normalizeTicker(view && view.ticker);
      if(ticker && !deduped.has(ticker)) deduped.set(ticker, view);
    });
    const buckets = {focus:[], tradeableSecondary:[], filtered:[]};
    Array.from(deduped.values()).forEach(view => {
      const bucket = classifyRankedView(view);
      if(bucket === 'focus') buckets.focus.push(view);
      else if(bucket === 'tradeable_secondary') buckets.tradeableSecondary.push(view);
      else buckets.filtered.push(view);
    });
    const earlyStateRank = view => {
      const item = view && view.item ? view.item : view;
      const presentation = deps.resolveEmojiPresentation(item, {
        context:'scanner',
        finalVerdict:view && (view.displayStage || view.finalVerdict),
        setupUiState:view && view.setupUiState,
        displayedPlan:view && view.displayedPlan,
        derivedStates:view && view.setupStates,
        warningState:view && view.warningState
      });
      const primaryState = String(presentation.primaryState || '').toLowerCase();
      if(primaryState === 'monitor') return 0;
      if(primaryState === 'developing') return 1;
      return 2;
    };
    buckets.tradeableSecondary.sort((a, b) =>
      earlyStateRank(a) - earlyStateRank(b)
      || deps.resultSortScoreFromRecord(b.item || b) - deps.resultSortScoreFromRecord(a.item || a)
      || String(a.ticker || '').localeCompare(String(b.ticker || ''))
    );
    return buckets;
  }

  function rankedDecisionBucketForView(view, deps = {}){
    const item = view && view.item ? view.item : view;
    const globalVerdict = deps.resolveGlobalVerdict(item);
    return deps.getBucket(globalVerdict.base_verdict || globalVerdict.final_verdict);
  }

  function rankedVisibleSectionForView(view, deps = {}){
    const item = view && view.item ? view.item : view;
    const globalVerdict = deps.resolveGlobalVerdict(item);
    const finalVerdict = deps.normalizeGlobalVerdictKey(globalVerdict.base_verdict || globalVerdict.final_verdict);
    if(finalVerdict === 'entry') return 'tradeable_entry';
    if(finalVerdict === 'near_entry') return 'near_entry';
    if(finalVerdict === 'watch' || finalVerdict === 'monitor') return 'monitor_watch';
    return 'lower_priority';
  }

  function resultReasonForRecord(record, deps = {}){
    const view = deps.projectTickerForCard(record);
    return resultReasonForView(view, deps);
  }

  function resultReasonForView(view, deps = {}){
    const item = view.item;
    const rrValue = deps.numericOrNull(view.actionableRrValue);
    const estimatedRrValue = deps.numericOrNull(view.rrValue);
    const structureBadge = shortlistStructureBadgeForView(view, deps);
    const structureLabel = `${structureBadge.label} structure`;
    if(Number.isFinite(item.marketData.price) && Number.isFinite(item.marketData.ma200) && item.marketData.price < item.marketData.ma200) return 'Trend broken';
    if(Number.isFinite(item.marketData.ma50) && Number.isFinite(item.marketData.ma200) && item.marketData.ma50 < item.marketData.ma200) return 'Trend broken';
    if(item.plan.firstTargetTooClose) return 'First target too close';
    if(view.planUiState.state === 'unrealistic_rr') return 'Unrealistic reward:risk';
    if(view.planUiState.state !== 'valid' && Number.isFinite(estimatedRrValue) && estimatedRrValue < currentRrThreshold()) return 'Low estimated reward';
    if(view.planUiState.state !== 'valid') return view.planUiState.state === 'needs_adjustment' ? 'Plan needs adjustment' : 'Plan invalid';
    if(Number.isFinite(rrValue) && rrValue < currentRrThreshold()) return 'Insufficient reward';
    if(view.setupUiState.state === 'broken') return item.scan.pullbackType && /broken/i.test(item.scan.pullbackType) ? 'Trend broken' : (structureLabel || 'Not actionable');
    if(view.setupUiState.state === 'entry' || view.displayStage === 'Near Entry'){
      return `Near ${deps.escapeHtml(item.scan.scanType || '20MA')} with ${item.scan.pullbackStatus || 'acceptable structure'}`.replace(/&amp;/g, '&');
    }
    return item.setup.reasons[0] || item.scan.summary || 'Needs review';
  }

  function resultSupportLineForRecord(record, deps = {}){
    const view = deps.projectTickerForCard(record);
    return resultSupportLineForView(view, deps);
  }

  function resultSupportLineForView(view, deps = {}){
    const item = view.item;
    const rrValue = deps.shouldShowActionableRR(view) ? deps.numericOrNull(view.actionableRrValue) : null;
    const convictionTier = view.convictionTier;
    if(view.setupUiState.state === 'broken') return item.meta.companyName || item.meta.exchange || 'Filtered from the main review queue.';
    if(view.bucket === 'filtered' || view.finalClassification === 'filtered'){
      const pieces = [
        convictionTier,
        item.setup.marketCaution ? 'Weak market' : '',
        item.meta.companyName || item.meta.exchange || ''
      ].filter(Boolean);
      return pieces.join(' | ') || 'Filtered from the main review queue.';
    }
    const pieces = [
      convictionTier,
      view.planUiState.label,
      Number.isFinite(rrValue) ? `R:R ${rrValue.toFixed(2)}` : '',
      item.setup && item.setup.practicalSizeFlag === 'tiny_size' ? 'Tiny Size' : '',
      item.setup && item.setup.practicalSizeFlag === 'low_impact' ? 'Low Impact' : '',
      view.affordability === 'heavy_capital' ? 'Heavy Capital' : '',
      view.affordability === 'not_affordable' ? 'Not Affordable' : '',
      view.displayedPlan.tradeability === 'too_expensive' ? 'Risk OK | Capital Heavy' : '',
      view.displayedPlan.tradeability === 'risk_only' ? 'Capital check estimated' : '',
      item.setup.marketCaution ? 'Weak market' : ''
    ].filter(Boolean);
    return pieces.join(' | ') || (item.meta.companyName || 'Review in Setup Review for full detail.');
  }

  function isFilteredResultRecord(record, deps = {}){
    return classifyRankedRecord(record, deps) === 'filtered';
  }

  function shortlistStructureBadgeForView(view, deps = {}){
    const item = view && view.item ? view.item : {};
    const derived = view && view.setupStates ? view.setupStates : deps.analysisDerivedStatesFromRecord(item);
    const trendState = String(derived.trendState || '').toLowerCase();
    const structureState = String(derived.structureState || '').toLowerCase();
    const structureQuality = String(view && view.structureQuality || finalStructureQualityForView({
      ...view,
      item,
      setupStates:derived
    }, deps));
    const price = deps.numericOrNull(item.marketData && item.marketData.price);
    const ma50 = deps.numericOrNull(item.marketData && item.marketData.ma50);
    const ma200 = deps.numericOrNull(item.marketData && item.marketData.ma200);
    const brokenTrend = trendState === 'broken'
      || structureState === 'broken'
      || (Number.isFinite(price) && Number.isFinite(ma200) && price < ma200)
      || (Number.isFinite(ma50) && Number.isFinite(ma200) && ma50 < ma200);
    if(brokenTrend) return {state:'broken', label:'Broken', className:'avoid'};
    if(structureQuality === 'strong') return {state:'strong', label:'Strong', className:'ready'};
    if(structureQuality === 'developing_clean' || structureState === 'developing') return {state:'developing', label:'Developing', className:'near'};
    return {state:'weak', label:'Weak', className:'near'};
  }

  function readinessLabelForView(view, deps = {}){
    const statusChip = deps.primaryShortlistStatusChip(view);
    const state = String(statusChip.primaryState || '').toLowerCase();
    const scannerStatus = deps.normalizeAnalysisVerdict(view && view.scannerResolution && view.scannerResolution.status || '');
    if(state === 'entry') return 'Ready now';
    if(state === 'near_entry') return 'Ready soon';
    if(state === 'dead' || state === 'inactive') return 'Low confidence';
    if(scannerStatus === 'Watch') return 'Building';
    if(state === 'developing') return 'Building';
    return 'Low confidence';
  }

  global.ScannerView = {
    currentRrThreshold,
    getRankedDisplayBucket,
    getFinalBucketFromView,
    rrCategoryForView,
    finalStructureQualityForView,
    getFinalClassification,
    buildFinalSetupView,
    classifyRankedRecord,
    classifyRankedView,
    buildRankedBuckets,
    buildRankedBucketsFromViews,
    rankedDecisionBucketForView,
    rankedVisibleSectionForView,
    resultReasonForRecord,
    resultReasonForView,
    resultSupportLineForRecord,
    resultSupportLineForView,
    isFilteredResultRecord,
    shortlistStructureBadgeForView,
    readinessLabelForView
  };
})(window);
