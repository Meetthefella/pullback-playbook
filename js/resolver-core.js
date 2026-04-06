(function(global){
  // Canonical global-verdict helpers extracted from app.js.
  function normalizeGlobalVerdictKey(verdict){
    const safeVerdict = String(verdict || '').trim().toLowerCase();
    if(['entry','near_entry','watch','monitor','avoid','dead'].includes(safeVerdict)) return safeVerdict;
    return 'watch';
  }

  function globalVerdictLabel(finalVerdict){
    return ({
      entry:'Entry',
      near_entry:'Near Entry',
      watch:'Watch',
      monitor:'Monitor',
      avoid:'Avoid',
      dead:'Dead'
    })[normalizeGlobalVerdictKey(finalVerdict)] || 'Watch';
  }

  function getTone(finalVerdict){
    return ({
      entry:'green',
      near_entry:'teal',
      watch:'purple',
      monitor:'orange',
      avoid:'red',
      dead:'red'
    })[normalizeGlobalVerdictKey(finalVerdict)] || 'purple';
  }

  function getBucket(finalVerdict){
    return ({
      entry:'tradeable_entry',
      near_entry:'tradeable_entry',
      watch:'monitor_watch',
      monitor:'monitor_watch',
      avoid:'lower_priority',
      dead:'lower_priority'
    })[normalizeGlobalVerdictKey(finalVerdict)] || 'monitor_watch';
  }

  function getBadge(finalVerdict){
    const safeVerdict = normalizeGlobalVerdictKey(finalVerdict);
    return ({
      entry:{text:'\uD83D\uDE80 Entry', className:'ready'},
      near_entry:{text:'\uD83C\uDFAF Near Entry', className:'near'},
      watch:{text:'\uD83D\uDFE3 Watch', className:'watch'},
      monitor:{text:'\uD83D\uDFE1 Monitor', className:'near'},
      avoid:{text:'\u26D4 Avoid', className:'avoid'},
      dead:{text:'\uD83D\uDC80 Dead', className:'avoid'}
    })[safeVerdict] || {text:'\uD83D\uDFE3 Watch', className:'watch'};
  }

  function getActions(finalVerdict){
    const safeVerdict = normalizeGlobalVerdictKey(finalVerdict);
    return ({
      entry:{label:'ENTRY', detail:'Ready to act', planAllowed:true, watchlistAllowed:false},
      near_entry:{label:'NEAR ENTRY', detail:'Close to trigger', planAllowed:true, watchlistAllowed:false},
      watch:{label:'WATCH', detail:'Review candidate', planAllowed:false, watchlistAllowed:true},
      monitor:{label:'MONITOR', detail:'Needs confirmation', planAllowed:false, watchlistAllowed:true},
      avoid:{label:'AVOID', detail:'Low priority', planAllowed:false, watchlistAllowed:false},
      dead:{label:'DEAD', detail:'Drop setup', planAllowed:false, watchlistAllowed:false}
    })[safeVerdict] || {label:'WATCH', detail:'Review candidate', planAllowed:false, watchlistAllowed:true};
  }

  function resolveGlobalVerdict(record, deps = {}){
    const item = record && typeof record === 'object' ? record : {};
    const resolved = deps.resolveFinalStateContract(item, {context:'global'});
    const baseVerdict = deps.baseVerdictFromResolvedContract(resolved);
    const derivedStates = deps.analysisDerivedStatesFromRecord(item);
    const displayedPlan = deps.deriveCurrentPlanState(
      item.plan && item.plan.entry,
      item.plan && item.plan.stop,
      item.plan && item.plan.firstTarget,
      item.marketData && item.marketData.currency
    );
    const setupScore = deps.setupScoreForRecord(item);
    const structureState = String(derivedStates.structureState || '').toLowerCase();
    const trendState = String(derivedStates.trendState || '').toLowerCase();
    const bounceState = String(derivedStates.bounceState || '').toLowerCase();
    const marketWeak = !!(
      item.setup && item.setup.marketCaution
      || deps.isHostileMarketStatus((item.meta && item.meta.marketStatus) || deps.state.marketStatus)
    );
    const planStatusKey = String(resolved.planStatusKey || '').toLowerCase();
    const tradeabilityState = String(displayedPlan.tradeability || '').toLowerCase();
    const volumeState = String(derivedStates.volumeState || '').toLowerCase();
    const structurallyBroken = !!(
      resolved.terminal
      || structureState === 'broken'
      || trendState === 'broken'
      || resolved.structuralState === 'dead'
    );
    const weakStructure = ['weak','weakening','developing_loose'].includes(structureState);
    const tentativeBounce = ['none','unconfirmed','attempt','early'].includes(bounceState);
    const weakVolume = volumeState === 'weak';
    const invalidPlan = ['invalid','missing','needs_adjustment','unrealistic_rr','rebuild_required'].includes(planStatusKey)
      || tradeabilityState === 'invalid';
    const supportiveStructure = !weakStructure && ['intact','strong','developing'].includes(structureState || '');
    let finalVerdict = baseVerdict;
    let reason = 'Default live setup state.';

    if(structurallyBroken){
      finalVerdict = 'dead';
      reason = resolved.blockerReason || 'Structure is broken.';
    }else if(setupScore <= 2){
      finalVerdict = 'avoid';
      reason = 'Setup score is too weak.';
    }else if(weakStructure && invalidPlan){
      finalVerdict = 'avoid';
      reason = 'Weak structure with unusable plan.';
    }else if(resolved.actionStateKey === 'ready_to_act' || resolved.structuralState === 'entry'){
      finalVerdict = 'entry';
      reason = resolved.blockerReason || 'Ready to act.';
    }else if(resolved.structuralState === 'near_entry' || resolved.tradeabilityVerdict === 'Near Entry'){
      finalVerdict = 'near_entry';
      reason = resolved.reasonSummary || 'Close to trigger.';
    }else if(setupScore >= 5 && supportiveStructure && !marketWeak && !weakVolume && !tentativeBounce){
      finalVerdict = 'watch';
      reason = 'Alive structure with improving confirmation.';
    }else if(setupScore >= 5 && supportiveStructure){
      finalVerdict = marketWeak || weakVolume || tentativeBounce ? 'monitor' : 'watch';
      reason = marketWeak ? 'Weak market caution.' : (weakVolume ? 'Weak volume caution.' : (tentativeBounce ? 'Bounce still tentative.' : 'Alive setup worth monitoring.'));
    }else if(setupScore >= 3 && !structurallyBroken){
      finalVerdict = 'monitor';
      reason = invalidPlan
        ? 'Alive setup but plan is not ready.'
        : (marketWeak
          ? 'Weak market caution.'
          : (tentativeBounce
            ? 'Bounce still tentative.'
            : (weakVolume ? 'Weak volume caution.' : 'Alive but early setup.')));
    }else if(resolved.actionStateKey === 'recalculate_plan' || resolved.actionStateKey === 'wait_for_confirmation' || resolved.structuralState === 'developing'){
      finalVerdict = 'monitor';
      reason = resolved.blockerReason || 'Waiting for confirmation.';
    }else if(String(resolved.finalVerdict || '').toLowerCase() === 'avoid'){
      finalVerdict = weakStructure ? 'avoid' : 'monitor';
      reason = weakStructure
        ? (resolved.reasonSummary || resolved.blockerReason || 'Lower-priority setup.')
        : 'Alive setup downgraded to monitoring.';
    }

    const lifecycleMap = {
      entry:'active',
      near_entry:'active',
      watch:'watchlist',
      monitor:'watchlist',
      avoid:'drop',
      dead:'drop'
    };
    const tone = getTone(finalVerdict);
    const badge = getBadge(finalVerdict);
    const action = getActions(finalVerdict);
    const bucket = getBucket(finalVerdict);
    return {
      base_verdict:baseVerdict,
      final_verdict:finalVerdict,
      tone,
      toneClass:`tone-${tone}`,
      borderClass:`tone-${tone}`,
      backgroundClass:`tone-${tone}`,
      badgeToneClass:`badge-tone-${tone}`,
      scoreClass:Number.isFinite(setupScore) ? deps.scannerScoreGradientClass(setupScore) : '',
      bucket,
      badge,
      action,
      lifecycle:lifecycleMap[finalVerdict] || 'watchlist',
      allow_plan:action.planAllowed,
      allow_watchlist:action.watchlistAllowed,
      reason,
      downgrade_applied:baseVerdict !== finalVerdict,
      downgrade_reason:reason,
      setup_score:Number.isFinite(setupScore) ? setupScore : null,
      structure_state:structureState || '',
      bounce_state:bounceState || '',
      market_regime:marketWeak ? 'weak' : 'normal',
      source:'resolver',
      debugToneSource:({
        dead:'terminal_dead',
        avoid:'weak_or_non_tradeable',
        watch:'watch_state',
        monitor:'monitor_state',
        near_entry:'near_entry_state',
        entry:'ready_state'
      })[finalVerdict] || 'watch_state',
      resolved
    };
  }

  global.ResolverCore = {
    normalizeGlobalVerdictKey,
    globalVerdictLabel,
    getTone,
    getBucket,
    getBadge,
    getActions,
    resolveGlobalVerdict
  };
})(window);
