(function(global){
  // Watchlist lifecycle snapshot orchestration extracted from app.js.
  function watchlistLifecycleSnapshot(record, deps = {}){
    const item = deps.normalizeTickerRecord(record);
    const gating = deps.applyGlobalVerdictGates(item);
    const globalVerdict = gating.globalVerdict;
    const derivedStates = deps.analysisDerivedStatesFromRecord(item);
    const displayedPlan = deps.deriveCurrentPlanState(
      item.plan && item.plan.entry,
      item.plan && item.plan.stop,
      item.plan && item.plan.firstTarget,
      item.marketData && item.marketData.currency
    );
    const qualityAdjustments = deps.evaluateSetupQualityAdjustments(item, {displayedPlan, derivedStates});
    const avoidSubtype = deps.avoidSubtypeForRecord(item, {
      derivedStates,
      displayedPlan,
      qualityAdjustments,
      finalVerdict:deps.displayStageForRecord(item)
    });
    const deadCheck = deps.isTerminalDeadSetup(item, {derivedStates, displayedPlan});
    const emojiPresentation = deps.resolveEmojiPresentation(item, {
      context:'watchlist',
      finalVerdict:deps.displayStageForRecord(item),
      derivedStates,
      displayedPlan,
      qualityAdjustments,
      avoidSubtype,
      deadCheck
    });
    const resolved = deps.resolveFinalStateContract(item, {
      context:'watchlist',
      finalVerdict:deps.displayStageForRecord(item),
      derivedStates,
      displayedPlan,
      qualityAdjustments,
      avoidSubtype,
      deadCheck,
      emojiPresentation
    });
    const canonicalVerdict = deps.normalizeGlobalVerdictKey(globalVerdict.final_verdict);
    const actionState = deps.deriveActionStateForRecord(item).stage;
    const bounceState = String(derivedStates.bounceState || '').toLowerCase();
    const expiryTradingDays = item.watchlist.expiryAfterTradingDays || deps.WATCHLIST_EXPIRY_TRADING_DAYS;
    const addedAt = item.watchlist.addedAt || deps.todayIsoDate();
    const expiryAt = item.watchlist.expiryAt || deps.tradingDaysFrom(addedAt, expiryTradingDays);
    const remainingTradingDays = expiryAt ? deps.countTradingDaysBetween(deps.todayIsoDate(), expiryAt) : expiryTradingDays;
    const activeExpiryAt = remainingTradingDays <= 0 ? deps.businessDaysFromNow(expiryTradingDays) : expiryAt;
    const hasMeaningfulImprovement = ['entry','near_entry'].includes(canonicalVerdict)
      || actionState === 'action_now'
      || (bounceState === 'confirmed' && String(derivedStates.volumeState || '').toLowerCase() !== 'weak' && !qualityAdjustments.weakRegimePenalty && !qualityAdjustments.lowControlSetup);
    let state = canonicalVerdict;
    let bucket = ({
      entry:'tradeable_entry',
      near_entry:'tradeable_entry',
      watch:'monitor_watch',
      monitor:'monitor_watch',
      avoid:'low_priority_avoid',
      dead:'low_priority_avoid'
    })[canonicalVerdict] || 'monitor_watch';
    let stage = 'watchlist';
    let status = 'active';
    let nextExpiryAt = expiryAt;
    let expiryReason = '';
    let reason = globalVerdict.reason || 'Still progressing on the watchlist.';

    if(canonicalVerdict === 'dead'){
      state = 'dead';
      bucket = 'low_priority_avoid';
      stage = 'avoided';
      status = 'inactive';
      nextExpiryAt = '';
      reason = globalVerdict.reason || resolved.blockerReason || 'Setup failed technically and is no longer actionable.';
    }else if(canonicalVerdict === 'avoid' || !globalVerdict.allow_watchlist){
      state = 'avoid';
      bucket = 'low_priority_avoid';
      stage = 'avoided';
      status = 'inactive';
      nextExpiryAt = '';
      reason = globalVerdict.reason || 'Setup is no longer watchlist-eligible.';
    }else if(remainingTradingDays <= 0 && !hasMeaningfulImprovement){
      state = 'avoid';
      bucket = 'low_priority_avoid';
      stage = 'expired';
      status = 'stale';
      nextExpiryAt = expiryAt || deps.todayIsoDate();
      expiryReason = 'Watchlist setup expired without meaningful improvement.';
      reason = expiryReason;
    }else if(canonicalVerdict === 'entry' || resolved.actionStateKey === 'ready_to_act' || actionState === 'action_now'){
      state = 'entry';
      bucket = 'tradeable_entry';
      stage = 'planned';
      status = 'active';
      nextExpiryAt = deps.businessDaysFromNow(deps.PLAN_EXPIRY_TRADING_DAYS);
      reason = 'Entry setup is actionable now.';
    }else if(canonicalVerdict === 'near_entry' || actionState === 'near_entry'){
      state = 'near_entry';
      bucket = 'tradeable_entry';
      stage = 'watchlist';
      status = 'active';
      nextExpiryAt = activeExpiryAt;
      reason = 'Near entry - monitor for trigger.';
    }else if(canonicalVerdict === 'watch'){
      state = 'watch';
      bucket = 'monitor_watch';
      stage = 'watchlist';
      status = 'active';
      nextExpiryAt = activeExpiryAt;
      reason = globalVerdict.reason || 'Watch setup - keep tracking.';
    }else{
      state = 'monitor';
      bucket = 'monitor_watch';
      stage = 'watchlist';
      status = 'active';
      nextExpiryAt = activeExpiryAt;
      reason = globalVerdict.reason || 'Needs confirmation before it can be acted on.';
    }

    let snapshot = {
      state,
      label:deps.getBadge(state).text,
      badgeClass:deps.getBadge(state).className,
      bucket,
      stage,
      status,
      expiresAt:nextExpiryAt,
      expiryReason,
      reason,
      baseVerdict:globalVerdict.base_verdict || canonicalVerdict,
      downgradeApplied:!!globalVerdict.downgrade_applied,
      downgradeReason:globalVerdict.downgrade_reason || globalVerdict.reason || '',
      remainingTradingDays,
      rank:deps.watchlistLifecycleStateRank(state),
      hasMeaningfulImprovement
    };

    const currentState = deps.canonicalLifecycleState(item.watchlist && item.watchlist.lifecycleState);
    const planUiState = deps.getPlanUiState(item, {displayedPlan});
    const transitionedState = deps.resolveLifecycleTransition(currentState || snapshot.state, {
      structure_state:derivedStates.structureState,
      bounce_state:derivedStates.bounceState,
      plan_status:planUiState.state,
      rr_confidence:resolved.rrConfidenceLabel || resolved.rrConfidence || '',
      market_regime:qualityAdjustments.weakRegimePenalty ? 'weak' : 'normal',
      final_verdict:globalVerdict.final_verdict,
      final_state:snapshot.state
    });
    if(transitionedState && transitionedState !== snapshot.state){
      snapshot = deps.applyLifecycleStatePresentation(snapshot, transitionedState, {
        globalVerdict,
        resolved,
        activeExpiryAt,
        planExpiryAt:deps.businessDaysFromNow(deps.PLAN_EXPIRY_TRADING_DAYS),
        expiryAt,
        reason:snapshot.reason
      });
    }

    return snapshot;
  }

  global.WatchlistLifecycleSnapshot = {
    watchlistLifecycleSnapshot
  };
})(window);
