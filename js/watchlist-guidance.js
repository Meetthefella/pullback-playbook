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
    const simplified = context.simplifiedState && typeof context.simplifiedState === 'object'
      ? context.simplifiedState
      : null;
    const derivedStates = context.derivedStates || deps.analysisDerivedStatesFromRecord(item);
    const displayedPlan = context.displayedPlan || deps.deriveCurrentPlanState(
      item.plan && item.plan.entry,
      item.plan && item.plan.stop,
      item.plan && item.plan.firstTarget,
      item.marketData && item.marketData.currency
    );
    // Simplified state is authoritative for presentation copy. Debug snapshots stay diagnostic-only.
    const structureEligibility = String((simplified && simplified.structureEligibility) || '').toLowerCase();
    const structureState = String((simplified && simplified.structureState) || '').toLowerCase();
    const setupLocationState = String((simplified && simplified.setupLocationState) || '').toLowerCase();
    const priceabilityState = String((simplified && simplified.priceabilityState) || '').toLowerCase();
    const bounceState = String((simplified && simplified.bounceState) || '').toLowerCase();
    const planStatus = String((simplified && simplified.planStatus) || '').toLowerCase();
    const mainBlocker = String((simplified && simplified.mainBlocker) || '').trim();
    const canonicalVerdict = String((simplified && simplified.canonicalVerdict) || 'watch').trim().toLowerCase();
    const visualBucket = String((simplified && simplified.visualBucket) || 'monitor').trim().toLowerCase();

    if(['dead','expired'].includes(String(lifecycleSnapshot && lifecycleSnapshot.state || '')) || ['dead','broken','invalid','failed'].includes(structureState)){
      return {nextPossibleState:'None', mainBlocker:mainBlocker || 'Setup is no longer active'};
    }
    if(structureEligibility === 'damaged'){
      return {
        nextPossibleState:'\ud83d\udfe1 Monitor',
        mainBlocker:mainBlocker || 'Trend is weakening - no reliable stop level yet.'
      };
    }
    if(simplified && simplified.entryGatePass === true){
      return {
        nextPossibleState:'\ud83d\ude80 Entry',
        mainBlocker:mainBlocker || 'Ready if trigger is met'
      };
    }
    if(simplified && simplified.nearEntryGatePass === true){
      return {
        nextPossibleState:'\ud83c\udfaf Near Entry',
        mainBlocker:mainBlocker || 'Needs confirmation before promotion.'
      };
    }
    return {
      nextPossibleState:canonicalVerdict === 'near_entry'
        ? '\ud83c\udfaf Near Entry'
        : (visualBucket === 'diminishing' ? '\ud83d\udfe1 Monitor' : '\ud83c\udf31 Developing'),
      mainBlocker:mainBlocker || (structureEligibility === 'alive' && priceabilityState === 'unpriceable' && ['attempt','early','developing'].includes(bounceState) && (planStatus === 'missing' || setupLocationState === 'near_50ma')
        ? 'Setup is not priceable yet. No reliable entry or stop area is available.'
        : 'Needs better confirmation')
    };
  }

  global.WatchlistGuidance = {
    watchlistLifecycleChangeType,
    watchlistNextStateGuidance
  };
})(window);
