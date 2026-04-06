(function(global){
  // Canonical resolver presentation helpers extracted from app.js.
  function primaryShortlistStatusChip(view, deps = {}){
    const item = view && view.item ? view.item : view;
    const globalVerdict = deps.resolveGlobalVerdict(item);
    const badge = deps.getBadge(globalVerdict.final_verdict);
    return {
      label:badge.text,
      className:badge.className,
      modifiers:[],
      primaryState:deps.normalizeGlobalVerdictKey(globalVerdict.final_verdict)
    };
  }

  function resolveGlobalVisualState(record, context = 'scanner', options = {}, deps = {}){
    const safeRecord = record && typeof record === 'object' ? record : {};
    const globalVerdict = deps.resolveGlobalVerdict(safeRecord);
    return {
      tone:globalVerdict.tone,
      toneClass:globalVerdict.toneClass,
      borderClass:globalVerdict.borderClass,
      backgroundClass:globalVerdict.backgroundClass,
      badgeToneClass:globalVerdict.badgeToneClass,
      scoreClass:globalVerdict.scoreClass,
      debugToneSource:globalVerdict.debugToneSource,
      finalVerdict:globalVerdict.final_verdict,
      bucket:globalVerdict.bucket,
      lifecycle:globalVerdict.lifecycle,
      allowPlan:globalVerdict.allow_plan,
      allowWatchlist:globalVerdict.allow_watchlist,
      reason:globalVerdict.reason,
      context
    };
  }

  function resolveEmojiPresentation(record, options = {}, deps = {}){
    const item = record && typeof record === 'object' ? record : {};
    const finalVerdict = deps.normalizeAnalysisVerdict(options.finalVerdict || deps.resolverSeedVerdictForRecord(item));
    const derivedStates = options.derivedStates || deps.analysisDerivedStatesFromRecord(item);
    const effectivePlan = options.effectivePlan || deps.effectivePlanForRecord(item, {allowScannerFallback:true});
    const displayedPlan = options.displayedPlan || deps.deriveCurrentPlanState(
      effectivePlan.entry,
      effectivePlan.stop,
      effectivePlan.firstTarget,
      item.marketData && item.marketData.currency
    );
    const qualityAdjustments = options.qualityAdjustments || deps.evaluateSetupQualityAdjustments(item, {displayedPlan, derivedStates});
    const warningState = options.warningState || deps.evaluateWarningState(item, deps.getReviewAnalysisState(item).normalizedAnalysis);
    const planCheckState = options.planCheckState || deps.planCheckStateForRecord(item, {effectivePlan, displayedPlan});
    const planUiState = options.planUiState || deps.getPlanUiState(item, {displayedPlan, effectivePlan, planCheckState});
    const setupUiState = options.setupUiState || deps.getSetupUiState(item, {displayStage:finalVerdict, derivedStates, planUiState});
    const avoidSubtype = options.avoidSubtype || deps.avoidSubtypeForRecord(item, {
      derivedStates,
      displayedPlan,
      qualityAdjustments,
      finalVerdict
    });
    const deadCheck = options.deadCheck || deps.isTerminalDeadSetup(item, {derivedStates, displayedPlan});
    const resolved = deps.resolveFinalStateContract(item, {
      context:options.context || 'generic',
      finalVerdict,
      derivedStates,
      effectivePlan,
      displayedPlan,
      qualityAdjustments,
      warningState,
      planCheckState,
      planUiState,
      setupUiState,
      avoidSubtype,
      deadCheck
    });
    const modifiers = [];
    const addModifier = (emoji, label, code, className = 'near') => {
      if(!emoji || !label || modifiers.some(existing => existing.code === code) || modifiers.length >= 2) return;
      modifiers.push({emoji, label, code, className});
    };
    const volumeState = String(derivedStates.volumeState || '').toLowerCase();
    const weakMarket = !!(
      qualityAdjustments.weakRegimePenalty
      || item.setup.marketCaution
      || (warningState && Array.isArray(warningState.reasons) && warningState.reasons.some(reason => /hostile market|weak market/i.test(String(reason || ''))))
    );
    if(qualityAdjustments.lowControlSetup || qualityAdjustments.tooWideForQualityPullback){
      addModifier('\uD83D\uDD0B', 'Weak control', 'weak_control');
    }
    if(volumeState === 'weak'){
      addModifier('\uD83E\uDED7', 'Weak volume', 'weak_volume');
    }
    if(weakMarket){
      addModifier('\u26A0\uFE0F', 'Weak market', 'weak_market');
    }
    return {
      primaryState:resolved.structuralState,
      primaryEmoji:(resolved.badgeText.split(' ')[0] || '\uD83C\uDF31'),
      primaryLabel:resolved.structuralStateLabel,
      badgeClass:resolved.badgeClass || 'watch',
      modifiers
    };
  }

  global.ResolverPresentation = {
    primaryShortlistStatusChip,
    resolveGlobalVisualState,
    resolveEmojiPresentation
  };
})(window);
