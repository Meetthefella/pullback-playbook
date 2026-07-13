(function(global){
  // Scanner view/classification helpers extracted from app.js.
  function currentRrThreshold(){
    return 1.5;
  }

  function resolveBuyerControlState(derivedStates = {}){
    const derived = derivedStates && typeof derivedStates === 'object' ? derivedStates : {};
    const modernState = String(
      derived.buyerControlState
      || derived.buyer_control_state
      || ''
    ).trim().toLowerCase();
    if(['confirmed', 'emerging'].includes(modernState)) return modernState;
    const legacyBounceState = String(
      derived.bounceState
      || derived.bounce_state
      || ''
    ).trim().toLowerCase();
    if(legacyBounceState === 'confirmed') return 'confirmed';
    if(legacyBounceState === 'attempt') return 'emerging';
    return 'none';
  }

  function buyerControlLabelForDerivedStates(derivedStates = {}, options = {}){
    const derived = derivedStates && typeof derivedStates === 'object' ? derivedStates : {};
    const labels = options && typeof options === 'object' ? options : {};
    const supportTestState = String(
      derived.supportTestState
      || derived.support_test_state
      || ''
    ).trim().toLowerCase();
    const buyerControlState = resolveBuyerControlState(derived);
    if(buyerControlState === 'confirmed') return labels.confirmedLabel || 'Buyers confirmed';
    if(supportTestState === 'testing') return labels.testingLabel || 'Support testing';
    if(buyerControlState === 'emerging') return labels.emergingLabel || 'Buyers emerging';
    return labels.noneLabel || 'No buyer control';
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

  function normalizeScanVisualBucket(value){
    const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
    if(['entry','near_entry','monitor','diminishing','avoid','dead'].includes(safe)) return safe;
    if(['watch','monitor_watch'].includes(safe)) return 'monitor';
    if(['monitor_diminishing','diminishing_watch'].includes(safe)) return 'diminishing';
    if(['tradeable_entry','entry_ready'].includes(safe)) return 'entry';
    if(['low_priority','lower_priority','low_priority_avoid','avoid_dead'].includes(safe)) return 'avoid';
    if(safe.includes('diminish')) return 'diminishing';
    if(safe.includes('avoid') || safe.includes('dead') || safe.includes('broken')) return 'avoid';
    if(safe.includes('near')) return 'near_entry';
    return 'monitor';
  }

  function firstFiniteNumber(...values){
    for(const value of values){
      const number = Number(value);
      if(Number.isFinite(number)) return number;
    }
    return null;
  }

  function accepted50MaSupportTestForScan(item, simplified, visualState, derived){
    const resolvedState = simplified && simplified.debug && simplified.debug.resolvedState && typeof simplified.debug.resolvedState === 'object'
      ? simplified.debug.resolvedState
      : (visualState && typeof visualState === 'object' ? visualState : {});
    const watchlistDebug = item && item.watchlist && item.watchlist.debug && typeof item.watchlist.debug === 'object'
      ? item.watchlist.debug
      : {};
    const structureState = String(derived && derived.structureState || resolvedState.structure_state || '').trim().toLowerCase();
    const structureEligibility = String(derived && derived.structureEligibility || simplified && simplified.structureEligibility || resolvedState.structure_eligibility || '').trim().toLowerCase();
    const pullbackState = String(derived && (derived.pullbackZone || derived.pullbackState) || resolvedState.pullback_zone || resolvedState.pullback_state || '').trim().toLowerCase();
    const bounceState = String(derived && derived.bounceState || resolvedState.bounce_state || '').trim().toLowerCase();
    const pullbackAccepted = !!(
      resolvedState.nearEntryPullbackZoneAccepted === true
      || resolvedState.near_entry_pullback_zone_accepted === true
      || resolvedState.pullback_ok === true
      || (resolvedState.entry_gate_checks && resolvedState.entry_gate_checks.pullback_ok === true)
      || (resolvedState.near_entry_gate_checks && resolvedState.near_entry_gate_checks.pullback_ok === true)
    );
    const structurallyAliveAtRefresh = String(
      resolvedState.structural_alive_at_refresh
      || watchlistDebug.structural_alive_at_refresh
      || ''
    ).trim().toLowerCase() === 'true';
    const positiveAliveSignal = structurallyAliveAtRefresh
      || structureEligibility === 'alive'
      || ['strong','intact','developing_clean'].includes(structureState);
    const explicitInvalidationReason = String(resolvedState.explicit_invalidation_reason || '').trim().toLowerCase();
    const hasExplicitInvalidation = !!(
      explicitInvalidationReason
      && explicitInvalidationReason !== '(none)'
      && explicitInvalidationReason !== 'none'
      && explicitInvalidationReason !== 'n/a'
    );
    const refreshDemoteReason = String(
      resolvedState.refresh_demote_reason
      || watchlistDebug.refresh_demote_reason
      || ''
    ).trim().toLowerCase();
    const supportFailureReason = String(
      refreshDemoteReason
      || resolvedState.main_blocker
      || resolvedState.reason
      || resolvedState.downgrade_reason
      || ''
    ).trim().toLowerCase();
    const explicitAliveMonitorReason = /structurally alive;\s*keep on monitor|testing 50ma support|support defence/i.test(refreshDemoteReason);
    const failedSupportTest = explicitAliveMonitorReason
      ? false
      : /lost[_\s-]?50ma|support failed|failed support|below support|structure is broken|trend is weakening|structure weakening|diminishing|remove from active focus/i.test(supportFailureReason);
    const currentPrice = Number(item && item.marketData && (item.marketData.price ?? item.marketData.currentPrice ?? item.marketData.close));
    const sma50 = Number(item && item.marketData && (item.marketData.sma50 ?? item.marketData.ma50));
    const lost50MaSupport = Number.isFinite(currentPrice) && Number.isFinite(sma50) && sma50 > 0 && currentPrice < sma50 * 0.99;
    const terminalAvoid = String(resolvedState.final_verdict || '').trim().toLowerCase() === 'avoid'
      || resolvedState.terminal_avoid_applied === true
      || resolvedState.rejected_by_viability_gate === true
      || String(resolvedState.viability || '').trim().toLowerCase() === 'reject'
      || ['broken','failed','dead','invalid'].includes(structureState)
      || structureEligibility === 'broken'
      || hasExplicitInvalidation;
    return pullbackAccepted
      && pullbackState === 'near_50ma'
      && ['none','unconfirmed','attempt','early','developing','improving',''].includes(bounceState)
      && positiveAliveSignal
      && !lost50MaSupport
      && !terminalAvoid
      && !failedSupportTest;
  }

  function scanPresentationForView(view, deps = {}){
    const item = view && view.item ? view.item : view || {};
    const simplified = view && view.simplifiedState && typeof view.simplifiedState === 'object'
      ? view.simplifiedState
      : (typeof deps.resolveSimplifiedStateForSurface === 'function'
        ? deps.resolveSimplifiedStateForSurface(item, 'scan', {log:false})
        : {});
    const visualState = view && view.globalVerdict && typeof view.globalVerdict === 'object' ? view.globalVerdict : {};
    const derived = view && view.setupStates
      ? view.setupStates
      : (deps.analysisDerivedStatesFromRecord ? deps.analysisDerivedStatesFromRecord(item) : {});
    const normalizedVerdict = deps.normalizeGlobalVerdictKey || (value => String(value || '').trim().toLowerCase().replace(/\s+/g, '_'));
    const verdictLabel = deps.globalVerdictLabel || (value => String(value || '').trim() || 'Watch');
    const canonicalVerdict = normalizedVerdict(
      simplified.canonicalVerdict
      || view && view.canonicalVerdict
      || view && view.finalVerdict
      || visualState.finalVerdict
      || visualState.final_verdict
      || view && view.displayStage
      || 'watch'
    );
    const visualBucket = normalizeScanVisualBucket(
      simplified.visualBucket
      || view && (view.visualBucket || view.presentationBucket)
      || visualState.visualBucket
      || visualState.bucket
      || view && view.bucket
      || (deps.getBucket ? deps.getBucket(canonicalVerdict) : canonicalVerdict)
    );
    const tone = normalizeScanVisualBucket(
      simplified.tone
      || view && view.tone
      || visualState.tone
      || visualState.visual_tone
      || visualBucket
    );
    const structureState = String(derived && derived.structureState || '').toLowerCase();
    const bounceState = String(derived && derived.bounceState || '').toLowerCase();
    const setupLocationState = String(derived && (derived.setupLocationState || derived.pullbackState || derived.pullbackZone) || '').toLowerCase();
    const priceabilityState = String(derived && derived.priceabilityState || '').toLowerCase();
    const branchId = String(
      simplified.viabilityBranchId
      || simplified.debug && simplified.debug.resolvedState && simplified.debug.resolvedState.viabilityBranchId
      || view && view.viabilityBranchId
      || ''
    ).toLowerCase();
    const mainBlocker = String(
      simplified.mainBlocker
      || visualState.reason
      || visualState.main_blocker
      || view && view.mainBlocker
      || ''
    ).trim();
    const reasonCodes = Array.isArray(view && view.reasonCodes) ? view.reasonCodes : [];
    const resolvedState = simplified && simplified.debug && simplified.debug.resolvedState && typeof simplified.debug.resolvedState === 'object'
      ? simplified.debug.resolvedState
      : {};
    const scanAuthorityDebug = simplified && simplified.debug && simplified.debug.authoritativeScanSurfaceSnapshot
      && typeof simplified.debug.authoritativeScanSurfaceSnapshot === 'object'
        ? simplified.debug.authoritativeScanSurfaceSnapshot
        : {};
    const scoutingOnly = scanAuthorityDebug.scoutingOnly === true;
    const intentionalScoutingDivergence = !!(
      scoutingOnly
      && scanAuthorityDebug.diagnostics
      && scanAuthorityDebug.diagnostics.intentionalScoutingDivergence === true
    );
    const entryGateChecks = resolvedState.entry_gate_checks || resolvedState.entryGateChecks || {};
    const nearEntryGateChecks = resolvedState.near_entry_gate_checks || resolvedState.nearEntryGateChecks || {};
    const setupScore = firstFiniteNumber(
      simplified.setupScore,
      simplified.setup_score,
      resolvedState.setup_score,
      view && view.setupScore,
      view && view.score
    );
    const resolvedRR = firstFiniteNumber(
      resolvedState.resolvedRR,
      resolvedState.resolved_rr,
      nearEntryGateChecks.resolved_rr,
      entryGateChecks.resolved_rr,
      view && view.rrValue
    );
    const blockedByBelow50NoReclaim = nearEntryGateChecks.below_50_without_reclaim === true
      || entryGateChecks.below_50_without_reclaim === true
      || resolvedState.below50WithoutReclaim === true;
    const reclaimSignalCount = firstFiniteNumber(
      nearEntryGateChecks.reclaim_signal_count,
      entryGateChecks.reclaim_signal_count,
      resolvedState.reclaimSignalCount
    );
    const hasClearInvalidationLevel = nearEntryGateChecks.has_clear_invalidation_level === true
      || entryGateChecks.has_clear_invalidation_level === true
      || resolvedState.hasClearInvalidationLevel === true;
    const planStateKey = String(
      resolvedState.planStateKey
      || resolvedState.plan_state_key
      || simplified.planStatus
      || ''
    ).toLowerCase();
    const tradeabilityLabel = String(
      resolvedState.tradeabilityLabel
      || resolvedState.tradeabilityVerdict
      || resolvedState.tradeability_state
      || ''
    ).toLowerCase();
    const failedReclaimEvidence = canonicalVerdict === 'watch'
      && (
        reasonCodes.includes('score_below_watch_floor')
        || setupScore !== null && setupScore <= 2
        || blockedByBelow50NoReclaim
      )
      && (
        blockedByBelow50NoReclaim
        || reclaimSignalCount === 0
      )
      && (
        hasClearInvalidationLevel === false
        || priceabilityState === 'unpriceable'
        || ['missing','invalid','not_generated'].includes(planStateKey)
        || /not_ready|unpriceable|avoid/.test(tradeabilityLabel)
        || resolvedRR !== null && resolvedRR < 2
      );
    const hasDeteriorationEvidence = [
      'weak',
      'weakening',
      'developing_loose'
    ].includes(structureState)
      || /weak|weakening|failed|reject|deteriorat|low_score|no_reliable_stop/.test(branchId)
      || /trend is weakening|structure .*weak|failed reclaim|no reliable stop|setup quality .*(?:fading|slipped)|too volatile/i.test(mainBlocker)
      || failedReclaimEvidence;
    const lowQualityWatch = canonicalVerdict === 'watch'
      && (
        visualBucket === 'diminishing'
        || tone === 'diminishing'
        || hasDeteriorationEvidence
        || (bounceState === 'none' && ['weak','weakening','developing_loose'].includes(structureState))
        || (priceabilityState === 'unpriceable' && hasDeteriorationEvidence)
      );
    const accepted50MaSupportTest = accepted50MaSupportTestForScan(item, simplified, visualState, derived);

    let scanSection = 'monitor_watch';
    let presentationBucket = 'monitor';
    let presentationTone = 'monitor';
    let sortPriority = 30;
    if((canonicalVerdict === 'entry' || visualBucket === 'entry') && scoutingOnly !== true){
      scanSection = 'tradeable_entry';
      presentationBucket = 'entry';
      presentationTone = 'entry';
      sortPriority = 10;
    }else if(canonicalVerdict === 'near_entry' || visualBucket === 'near_entry'){
      scanSection = 'near_entry';
      presentationBucket = 'near_entry';
      presentationTone = 'near_entry';
      sortPriority = 20;
    }else if(canonicalVerdict === 'avoid' || visualBucket === 'avoid' || visualBucket === 'dead'){
      scanSection = 'avoid';
      presentationBucket = 'avoid';
      presentationTone = 'avoid';
      sortPriority = 50;
    }else if(lowQualityWatch && !accepted50MaSupportTest){
      scanSection = 'monitor_diminishing';
      presentationBucket = 'diminishing';
      presentationTone = 'diminishing';
      sortPriority = 40;
    }

    let badgeLabel = verdictLabel(canonicalVerdict);
    if(presentationBucket === 'entry') badgeLabel = 'Entry';
    else if(presentationBucket === 'near_entry') badgeLabel = 'Near Entry';
    else if(presentationBucket === 'avoid') badgeLabel = 'Avoid';
    else badgeLabel = 'Watch';

    let summary = mainBlocker || String(simplified.actionLabel || '').trim();
    const genericConfirmation = /needs confirmation before promotion|needs confirmation$/i.test(summary);
    if(scanSection === 'monitor_diminishing' && (!summary || genericConfirmation)){
      summary = failedReclaimEvidence
        ? 'Recent rebound failed - wait for stabilisation.'
        : 'Setup quality is weakening. Wait for a cleaner reset before reviewing.';
    }else if(scanSection === 'avoid' && (!summary || genericConfirmation)){
      summary = 'Avoid for now. Structure or tradeability is not good enough.';
    }else if(scanSection === 'monitor_watch' && !summary){
      summary = 'Needs confirmation before promotion.';
    }
    if(intentionalScoutingDivergence){
      summary = String(
        scanAuthorityDebug.summary
        || 'Scouting only - confirm in Review before treating this as actionable.'
      ).trim();
    }

    return {
      canonicalVerdict,
      visualBucket,
      presentationBucket,
      scanSection,
      tone:presentationTone,
      badgeLabel,
      summary,
      reasonCode:reasonCodes[0] || branchId || setupLocationState || bounceState || '',
      sortPriority,
      structureState,
      bounceState,
      setupLocationState,
      priceabilityState,
      blockedByBelow50NoReclaim,
      reclaimSignalCount,
      hasClearInvalidationLevel,
      resolvedRR,
      failedReclaimEvidence,
      deteriorationEvidence:hasDeteriorationEvidence,
      scoutingOnly,
      diagnostics:{
        intentionalScoutingDivergence,
        divergenceType:intentionalScoutingDivergence ? 'intentional_scouting_divergence' : ''
      }
    };
  }

  function buildFinalSetupView(record, options = {}, deps = {}){
    const view = deps.projectTickerForCard(record, {...options, surface:'scan', includeExecutionDowngrade:false, includeRuntimeFallback:false});
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
    const visualState = deps.resolveVisualState(view.item, 'scanner', {
      derivedStates,
      displayedPlan:view.displayedPlan
    });
    const scannerVerdict = deps.normalizeGlobalVerdictKey(visualState.finalVerdict || visualState.final_verdict);
    const globalBadge = visualState.badge || deps.getBadge(scannerVerdict);
    const bucket = visualState.bucket || deps.getBucket(scannerVerdict);
    const normalizedFinalClassification = ({
      tradeable_entry:'tradeable',
      monitor_watch:'early',
      lower_priority:'filtered'
    })[bucket] || legacyBucketForFinalClassification(finalClassification);
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
      globalVerdict:visualState,
      scanPresentation:scanPresentationForView({
        ...view,
        setupStates:derivedStates,
        globalVerdict:visualState,
        reasonCodes:scannerResolution.reason_codes
      }, deps),
      reasonCodes:scannerResolution.reason_codes,
      decisionTrace:scannerResolution.trace,
      decisionWarnings:scannerResolution.warnings,
      rrDisplay:deps.shouldShowActionableRR(view) && Number.isFinite(view.actionableRrValue)
        ? `R:R ${view.actionableRrValue.toFixed(2)}`
        : '',
      structureLabel:deps.structureLabelForRecord(view.item, derivedStates, {displayStage:view.displayStage}),
      pullbackLabel:derivedStates.pullbackZone === 'near_20ma' ? 'Near 20MA' : (derivedStates.pullbackZone === 'near_50ma' ? 'Near 50MA' : ''),
      bounceLabel:buyerControlLabelForDerivedStates(derivedStates),
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
    const visualState = deps.resolveVisualState(item, 'scanner');
    return visualState.bucket || deps.getBucket(visualState.finalVerdict || visualState.final_verdict);
  }

  function rankedVisibleSectionForView(view, deps = {}){
    const presentation = view && view.scanPresentation
      ? view.scanPresentation
      : scanPresentationForView(view, deps);
    return presentation.scanSection || 'monitor_watch';
  }

  function resultReasonForRecord(record, deps = {}){
    const view = deps.projectTickerForCard(record, {surface:'scan'});
    return resultReasonForView(view, deps);
  }

  function resultReasonForView(view, deps = {}){
    const item = view.item;
    const simplified = view && view.simplifiedState && typeof view.simplifiedState === 'object'
      ? view.simplifiedState
      : (typeof deps.resolveSimplifiedStateForSurface === 'function'
        ? deps.resolveSimplifiedStateForSurface(item, 'scan', {log:false})
        : {});
    const rrValue = deps.numericOrNull(simplified && simplified.debug && simplified.debug.resolvedState && simplified.debug.resolvedState.resolvedRR)
      ?? deps.numericOrNull(view.actionableRrValue);
    const estimatedRrValue = deps.numericOrNull(simplified && simplified.debug && simplified.debug.resolvedState && simplified.debug.resolvedState.resolvedRR)
      ?? deps.numericOrNull(view.rrValue);
    const mainBlocker = String(simplified.mainBlocker || view.mainBlocker || '').trim();
    const planStatus = String(simplified.planStatus || view.planUiState.state || '').trim().toLowerCase();
    const visualBucket = String(simplified.visualBucket || view.visualBucket || view.presentationBucket || '').trim().toLowerCase();
    const canonicalVerdict = String(simplified.canonicalVerdict || view.finalVerdict || view.displayStage || '').trim().toLowerCase();
    const structureBadge = shortlistStructureBadgeForView(view, deps);
    const structureLabel = `${structureBadge.label} structure`;
    if(/broken/i.test(mainBlocker)) return mainBlocker;
    if(visualBucket === 'diminishing' && canonicalVerdict === 'watch'){
      return mainBlocker || 'Recent rebound failed - wait for stabilisation.';
    }
    if(planStatus !== 'valid' && Number.isFinite(estimatedRrValue) && estimatedRrValue < currentRrThreshold()) return mainBlocker || 'Low estimated reward';
    if(planStatus !== 'valid') return mainBlocker || (planStatus === 'needs_adjustment' ? 'Plan needs adjustment' : 'Plan invalid');
    if(Number.isFinite(rrValue) && rrValue < currentRrThreshold()) return mainBlocker || 'Insufficient reward';
    if(simplified && simplified.entryGatePass === true && canonicalVerdict === 'entry'){
      return simplified.actionLabel || `Near ${deps.escapeHtml(item.scan.scanType || '20MA')} with ${item.scan.pullbackStatus || 'acceptable structure'}`.replace(/&amp;/g, '&');
    }
    if(mainBlocker) return mainBlocker;
    return item.setup.reasons[0] || item.scan.summary || 'Needs review';
  }

  function resultSupportLineForRecord(record, deps = {}){
    const view = deps.projectTickerForCard(record, {surface:'scan'});
    return resultSupportLineForView(view, deps);
  }

  function resultSupportLineForView(view, deps = {}){
    const item = view.item;
    const simplified = view && view.simplifiedState && typeof view.simplifiedState === 'object'
      ? view.simplifiedState
      : (typeof deps.resolveSimplifiedStateForSurface === 'function'
        ? deps.resolveSimplifiedStateForSurface(item, 'scan', {log:false})
        : {});
    const rrValue = deps.shouldShowActionableRR(view) ? deps.numericOrNull(simplified && simplified.debug && simplified.debug.resolvedState && simplified.debug.resolvedState.resolvedRR) ?? deps.numericOrNull(view.actionableRrValue) : null;
    const convictionTier = view.convictionTier;
    if(String(simplified.mainBlocker || '').toLowerCase().includes('broken')) return item.meta.companyName || item.meta.exchange || 'Filtered from the main review queue.';
    if(String(simplified.visualBucket || '').toLowerCase() === 'avoid' || view.bucket === 'filtered' || view.finalClassification === 'filtered'){
      const pieces = [
        convictionTier,
        item.setup.marketCaution ? 'Weak market' : '',
        item.meta.companyName || item.meta.exchange || ''
      ].filter(Boolean);
      return pieces.join(' | ') || 'Filtered from the main review queue.';
    }
    const pieces = [
      convictionTier,
      simplified.planStatus && simplified.planStatus !== 'missing' ? (simplified.planStatus || view.planUiState.label) : view.planUiState.label,
      Number.isFinite(rrValue) ? `R:R ${rrValue.toFixed(2)}` : '',
      item.setup && item.setup.practicalSizeFlag === 'tiny_size' ? 'Tiny Size' : '',
      item.setup && item.setup.practicalSizeFlag === 'low_impact' ? 'Low Impact' : '',
      (simplified.planStatus === 'missing' && simplified.mainBlocker) ? simplified.mainBlocker : '',
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
    const simplified = view && view.simplifiedState && typeof view.simplifiedState === 'object'
      ? view.simplifiedState
      : (typeof deps.resolveSimplifiedStateForSurface === 'function'
        ? deps.resolveSimplifiedStateForSurface(item, 'scan', {log:false})
        : {});
    const derived = view && view.setupStates ? view.setupStates : deps.analysisDerivedStatesFromRecord(item);
    const trendState = String(derived.trendState || '').toLowerCase();
    const structureState = String(derived.structureState || '').toLowerCase();
    const structureQuality = String(view && view.structureQuality || finalStructureQualityForView({
      ...view,
      item,
      setupStates:derived
    }, deps));
    if(String(simplified.visualBucket || '').toLowerCase() === 'diminishing'){
      return {state:'developing', label:'Developing', className:'near'};
    }
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
    resolveBuyerControlState,
    buyerControlLabelForDerivedStates,
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
    scanPresentationForView,
    resultReasonForRecord,
    resultReasonForView,
    resultSupportLineForRecord,
    resultSupportLineForView,
    isFilteredResultRecord,
    shortlistStructureBadgeForView,
    readinessLabelForView
  };
})(window);
