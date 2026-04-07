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
      near_entry:{label:'NEAR ENTRY', detail:'Close to trigger', planAllowed:true, watchlistAllowed:true},
      watch:{label:'WATCH', detail:'Review candidate', planAllowed:false, watchlistAllowed:true},
      monitor:{label:'MONITOR', detail:'Needs confirmation', planAllowed:false, watchlistAllowed:true},
      avoid:{label:'AVOID', detail:'Low priority', planAllowed:false, watchlistAllowed:false},
      dead:{label:'DEAD', detail:'Drop setup', planAllowed:false, watchlistAllowed:false}
    })[safeVerdict] || {label:'WATCH', detail:'Review candidate', planAllowed:false, watchlistAllowed:true};
  }

  function canPromoteToEntry(ctx = {}){
    const checks = {
      structure_ok:['intact', 'strong'].includes(String(ctx.structure_state || '').trim().toLowerCase()),
      bounce_ok:String(ctx.bounce_state || '').trim().toLowerCase() === 'confirmed',
      pullback_ok:['near_20ma', 'near_50ma'].includes(String(ctx.pullback_zone || '').trim().toLowerCase()),
      market_ok:['normal', 'supportive'].includes(String(ctx.market_regime || '').trim().toLowerCase()),
      volume_ok:['normal', 'supportive', 'strong'].includes(String(ctx.volume_state || '').trim().toLowerCase()),
      plan_ok:String(ctx.plan_status || '').trim().toLowerCase() === 'valid' && ctx.plan_blocked !== true,
      rr_ok:Number.isFinite(Number(ctx.credible_rr)) ? Number(ctx.credible_rr) >= 2 : (Number.isFinite(Number(ctx.rr)) && Number(ctx.rr) >= 2),
      score_ok:Number.isFinite(Number(ctx.setup_score)) && Number(ctx.setup_score) >= 7,
      tradeability_ok:['tradable', 'entry', 'ready', 'action_now'].includes(String(ctx.tradeability || '').trim().toLowerCase()),
      capital_ok:(() => {
        const capitalFit = String(ctx.capital_fit || '').trim().toLowerCase();
        if(!capitalFit || capitalFit === 'unknown') return true;
        return ['fits_capital', 'manageable', 'comfortable'].includes(capitalFit);
      })()
    };
    const reasons = [];
    if(!checks.structure_ok) reasons.push('Structure must be intact or strong.');
    if(!checks.bounce_ok) reasons.push('Bounce must be confirmed.');
    if(!checks.pullback_ok) reasons.push('Pullback must be near the 20MA or 50MA.');
    if(!checks.market_ok) reasons.push('Market regime must be supportive.');
    if(!checks.volume_ok) reasons.push('Volume must be at least normal.');
    if(!checks.plan_ok) reasons.push('Plan must be valid and not blocked.');
    if(!checks.rr_ok) reasons.push('RR or credible RR must be at least 2.0.');
    if(!checks.score_ok) reasons.push('Setup score must be at least 7.');
    if(!checks.tradeability_ok) reasons.push('Tradeability must be tradable, entry, or ready.');
    if(!checks.capital_ok) reasons.push('Capital fit must be manageable.');
    return {
      pass:reasons.length === 0,
      reasons,
      checks
    };
  }

  function canPromoteToNearEntry(ctx = {}){
    const checks = {
      structure_ok:['intact', 'strong'].includes(String(ctx.structure_state || '').trim().toLowerCase()),
      bounce_ok:['attempt', 'confirmed'].includes(String(ctx.bounce_state || '').trim().toLowerCase()),
      pullback_ok:['near_20ma', 'near_50ma'].includes(String(ctx.pullback_zone || '').trim().toLowerCase()),
      plan_ok:['valid', 'needs_adjustment', 'pending_validation'].includes(String(ctx.plan_status || '').trim().toLowerCase()),
      rr_ok:Number.isFinite(Number(ctx.credible_rr)) ? Number(ctx.credible_rr) >= 1.5 : (Number.isFinite(Number(ctx.rr)) && Number(ctx.rr) >= 1.5),
      score_ok:Number.isFinite(Number(ctx.setup_score)) && Number(ctx.setup_score) >= 6
    };
    const reasons = [];
    if(!checks.structure_ok) reasons.push('Structure must be intact or strong.');
    if(!checks.bounce_ok) reasons.push('Bounce must be at least an attempt.');
    if(!checks.pullback_ok) reasons.push('Pullback must be near the 20MA or 50MA.');
    if(!checks.plan_ok) reasons.push('Plan must be valid, pending validation, or needs adjustment.');
    if(!checks.rr_ok) reasons.push('RR or credible RR must be at least 1.5.');
    if(!checks.score_ok) reasons.push('Setup score must be at least 6.');
    return {
      pass:reasons.length === 0,
      reasons
    };
  }

  function applyPromotionGuards(resolved, ctx = {}){
    const current = resolved && typeof resolved === 'object' ? resolved : {};
    const entryGate = canPromoteToEntry(ctx);
    const nearEntryGate = canPromoteToNearEntry(ctx);
    const provisionalVerdict = normalizeGlobalVerdictKey(current.final_verdict);
    const terminalOutcome = provisionalVerdict === 'dead' || provisionalVerdict === 'avoid';
    let finalVerdict = provisionalVerdict;
    let reason = String(current.reason || '').trim();

    if(!terminalOutcome){
      if(provisionalVerdict === 'entry'){
        if(!entryGate.pass){
          if(nearEntryGate.pass){
            finalVerdict = 'near_entry';
            reason = entryGate.reasons[0] || reason || 'Entry gate failed; downgraded to near entry.';
          }else{
            finalVerdict = 'monitor';
            reason = entryGate.reasons[0] || nearEntryGate.reasons[0] || reason || 'Entry and near-entry gates failed; downgraded to monitor.';
          }
        }
      }else if(provisionalVerdict === 'near_entry'){
        if(!nearEntryGate.pass){
          finalVerdict = 'monitor';
          reason = nearEntryGate.reasons[0] || reason || 'Near-entry gate failed; downgraded to monitor.';
        }else if(entryGate.pass){
          finalVerdict = 'entry';
          reason = reason || 'Entry gate passed.';
        }
      }else if(entryGate.pass){
        finalVerdict = 'entry';
        reason = reason || 'Entry gate passed.';
      }else if(nearEntryGate.pass){
        finalVerdict = 'near_entry';
        reason = reason || 'Near-entry gate passed.';
      }
    }

    return {
      ...current,
      final_verdict:finalVerdict,
      reason,
      entry_gate_pass:entryGate.pass,
      entry_gate_reasons:entryGate.reasons,
      entry_gate_checks:entryGate.checks,
      near_entry_gate_pass:nearEntryGate.pass,
      near_entry_gate_reasons:nearEntryGate.reasons
    };
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
    const pullbackZone = String(derivedStates.pullbackZone || '').toLowerCase();
    const rrValue = Number.isFinite(Number(displayedPlan && displayedPlan.rewardRisk && displayedPlan.rewardRisk.rrRatio))
      ? Number(displayedPlan.rewardRisk.rrRatio)
      : null;
    const planRealism = typeof deps.evaluatePlanRealism === 'function'
      ? deps.evaluatePlanRealism(item, {
        displayedPlan,
        derivedStates
      })
      : null;
    const credibleRr = Number.isFinite(Number(planRealism && planRealism.credible_rr))
      ? Number(planRealism.credible_rr)
      : rrValue;
    const capitalFit = String(displayedPlan && displayedPlan.capitalFit && displayedPlan.capitalFit.capital_fit || '').toLowerCase();
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
      finalVerdict = 'monitor';
      reason = 'Weak structure and invalid plan need monitoring, not rejection.';
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

    const guardedVerdict = applyPromotionGuards({
      final_verdict:finalVerdict,
      reason
    }, {
      structure_state:structureState,
      bounce_state:bounceState,
      pullback_zone:pullbackZone,
      market_regime:marketWeak ? 'weak' : 'normal',
      volume_state:volumeState,
      plan_status:planStatusKey,
      plan_blocked:planStatusKey !== 'valid',
      rr:rrValue,
      credible_rr:credibleRr,
      setup_score:setupScore,
      tradeability:tradeabilityState,
      capital_fit:capitalFit
    });
    finalVerdict = guardedVerdict.final_verdict;
    reason = guardedVerdict.reason || reason;

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
      entry_gate_pass:guardedVerdict.entry_gate_pass,
      entry_gate_reasons:guardedVerdict.entry_gate_reasons,
      near_entry_gate_pass:guardedVerdict.near_entry_gate_pass,
      near_entry_gate_reasons:guardedVerdict.near_entry_gate_reasons,
      entry_gate_checks:guardedVerdict.entry_gate_checks,
      setup_score:Number.isFinite(setupScore) ? setupScore : null,
      structure_state:structureState || '',
      bounce_state:bounceState || '',
      pullback_zone:pullbackZone || '',
      volume_state:volumeState || '',
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
    canPromoteToEntry,
    canPromoteToNearEntry,
    applyPromotionGuards,
    resolveGlobalVerdict
  };
})(window);
