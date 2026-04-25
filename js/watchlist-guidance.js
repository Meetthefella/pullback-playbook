(function(global){
  // Watchlist guidance helpers extracted from app.js.
  function watchlistLifecycleChangeType(previousState, currentState, deps = {}){
    if(previousState === currentState) return 'unchanged';
    if(currentState === 'expired') return 'expired';
    const previousRank = deps.watchlistLifecycleStateRank(previousState);
    const currentRank = deps.watchlistLifecycleStateRank(currentState);
    if(!Number.isFinite(previousRank) || !Number.isFinite(currentRank)) return 'changed';
    return currentRank < previousRank ? 'promoted' : 'downgraded';
  }

  function watchlistNextStateGuidance(record, lifecycleSnapshot, context = {}, deps = {}){
    const item = deps.normalizeTickerRecord(record);
    const derivedStates = context.derivedStates || deps.analysisDerivedStatesFromRecord(item);
    const displayedPlan = context.displayedPlan || deps.deriveCurrentPlanState(
      item.plan && item.plan.entry,
      item.plan && item.plan.stop,
      item.plan && item.plan.firstTarget,
      item.marketData && item.marketData.currency
    );
    const qualityAdjustments = context.qualityAdjustments || deps.evaluateSetupQualityAdjustments(item, {displayedPlan, derivedStates});
    const rrResolution = context.rrResolution || deps.resolveScannerStateWithTrace(item);
    const resolved = context.resolvedContract || deps.resolveFinalStateContract(item, {
      context:'watchlist',
      derivedStates,
      displayedPlan,
      qualityAdjustments,
      rrResolution,
      planUiState:context.planUiState
    });
    const globalVerdict = typeof deps.resolveGlobalVerdict === 'function'
      ? deps.resolveGlobalVerdict(item)
      : null;
    const structureEligibility = String(globalVerdict && globalVerdict.structure_eligibility || '').toLowerCase();
    const mainBlocker = String(globalVerdict && globalVerdict.main_blocker || '').trim();

    if(['dead','expired'].includes(String(lifecycleSnapshot && lifecycleSnapshot.state || '')) || resolved.structuralState === 'dead'){
      return {nextPossibleState:'None', mainBlocker:mainBlocker || resolved.blockerReason || 'Setup is no longer active'};
    }
    if(structureEligibility === 'damaged'){
      return {
        nextPossibleState:'\ud83d\udfe1 Monitor',
        mainBlocker:mainBlocker || 'Trend is weakening - no reliable stop level yet.'
      };
    }
    if(resolved.actionStateKey === 'recalculate_plan'){
      return {
        nextPossibleState:'\ud83d\udfe1 Hold for entry conditions',
        mainBlocker:mainBlocker || resolved.blockerReason || 'Plan needs adjustment'
      };
    }
    if(resolved.actionStateKey === 'ready_to_act'){
      return {
        nextPossibleState:'\ud83d\ude80 Entry',
        mainBlocker:mainBlocker || resolved.blockerReason || 'Ready if trigger is met'
      };
    }
    return {
      nextPossibleState:resolved.structuralState === 'near_entry' ? '\ud83c\udfaf Near Entry' : '\ud83c\udf31 Developing',
      mainBlocker:mainBlocker || resolved.blockerReason || 'Needs better confirmation'
    };
  }

  global.WatchlistGuidance = {
    watchlistLifecycleChangeType,
    watchlistNextStateGuidance
  };
})(window);
