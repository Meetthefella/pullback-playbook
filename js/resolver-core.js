(function(global){
  // Canonical global-verdict helpers extracted from app.js.
  function normalizeGlobalVerdictKey(verdict){
    const safeVerdict = String(verdict || '').trim().toLowerCase();
    if(['entry','near_entry','watch','monitor','avoid','dead'].includes(safeVerdict)) return safeVerdict;
    return 'watch';
  }

  function normalizeVerdict(verdict){
    const normalized = normalizeGlobalVerdictKey(verdict);
    if(normalized === 'watch') return 'monitor';
    if(normalized === 'dead') return 'avoid';
    return normalized;
  }

  function globalVerdictLabel(finalVerdict){
    return ({
      entry:'Entry',
      near_entry:'Near Entry',
      monitor:'Monitor',
      avoid:'Avoid',
    })[normalizeVerdict(finalVerdict)] || 'Monitor';
  }

  function getTone(finalVerdict){
    return ({
      entry:'green',
      near_entry:'teal',
      monitor:'orange',
      avoid:'red',
    })[normalizeVerdict(finalVerdict)] || 'orange';
  }

  function getBucket(finalVerdict){
    return ({
      entry:'tradeable_entry',
      near_entry:'tradeable_entry',
      monitor:'monitor_watch',
      avoid:'lower_priority',
    })[normalizeVerdict(finalVerdict)] || 'monitor_watch';
  }

  function getBadge(finalVerdict){
    const safeVerdict = normalizeVerdict(finalVerdict);
    return ({
      entry:{text:'\uD83D\uDE80 Entry', className:'ready'},
      near_entry:{text:'\uD83C\uDFAF Near Entry', className:'near'},
      monitor:{text:'\uD83D\uDFE1 Monitor', className:'near'},
      avoid:{text:'\u26D4 Avoid', className:'avoid'},
    })[safeVerdict] || {text:'\uD83D\uDFE1 Monitor', className:'near'};
  }

  function getActions(finalVerdict){
    const safeVerdict = normalizeVerdict(finalVerdict);
    return ({
      entry:{label:'ENTRY', detail:'Ready to act', planAllowed:true, watchlistAllowed:false},
      near_entry:{label:'NEAR ENTRY', detail:'Close to trigger', planAllowed:true, watchlistAllowed:true},
      monitor:{label:'MONITOR', detail:'Needs confirmation', planAllowed:false, watchlistAllowed:true},
      avoid:{label:'AVOID', detail:'Low priority', planAllowed:false, watchlistAllowed:false},
    })[safeVerdict] || {label:'MONITOR', detail:'Needs confirmation', planAllowed:false, watchlistAllowed:true};
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
        return ['ideal', 'acceptable', 'fits_capital'].includes(capitalFit);
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
    if(!checks.capital_ok) reasons.push('Capital concentration is too high for entry readiness.');
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

    const softenedVerdict = finalVerdict === 'avoid' && String(ctx.structure_state || '').trim().toLowerCase() !== 'broken'
      ? 'monitor'
      : finalVerdict;
    return {
      ...current,
      final_verdict:softenedVerdict,
      reason,
      entry_gate_pass:entryGate.pass,
      entry_gate_reasons:entryGate.reasons,
      entry_gate_checks:entryGate.checks,
      near_entry_gate_pass:nearEntryGate.pass,
      near_entry_gate_reasons:nearEntryGate.reasons
    };
  }

  function structureReasonLabel(structureState){
    const safe = String(structureState || '').trim().toLowerCase();
    if(safe === 'broken') return 'structure broken';
    if(safe === 'weakening') return 'trend weakening';
    if(safe === 'developing_loose') return 'messy pullback';
    if(safe === 'weak') return 'weak structure';
    if(safe === 'intact') return 'structure intact';
    if(safe === 'strong') return 'strong structure';
    return safe || 'structure unchanged';
  }

  function resolveStructureEligibility(ctx = {}){
    const structureState = String(ctx.structureState || '').trim().toLowerCase();
    const trendState = String(ctx.trendState || '').trim().toLowerCase();
    const brokenBelowStop = ctx.brokenBelowStop === true;
    const brokenStates = ['broken','invalid','failed'];
    if(brokenBelowStop || brokenStates.includes(structureState) || brokenStates.includes(trendState)){
      return {
        structureEligibility:'broken',
        structureReason:'Structure is broken.'
      };
    }
    if(['weak','weakening','developing_loose'].includes(structureState)){
      return {
        structureEligibility:'damaged',
        structureReason:'Trend is weakening - no reliable stop level yet.'
      };
    }
    return {
      structureEligibility:'alive',
      structureReason:'Structure remains technically alive.'
    };
  }

  function resolveExtendedState(ctx = {}){
    const pullbackZone = String(ctx.pullbackZone || '').trim().toLowerCase();
    const noRecentPullbackStructure = ['','unknown','none','off_level','extended','deep'].includes(pullbackZone);
    const numericDistance = Number(ctx.priceDistanceFrom20MA);
    const threshold = Number.isFinite(Number(ctx.threshold)) && Number(ctx.threshold) > 0
      ? Number(ctx.threshold)
      : 0.06;
    const stretchedFrom20 = Number.isFinite(numericDistance) && numericDistance > threshold;
    return (pullbackZone === 'extended') || (stretchedFrom20 && noRecentPullbackStructure);
  }

  function resolveWatchlistViability(ctx = {}){
    const structureEligibility = String(ctx.structureEligibility || '').toLowerCase();
    const bounceState = String(ctx.bounceState || '').toLowerCase();
    const pullbackZone = String(ctx.pullbackZone || '').toLowerCase();
    const setupScore = Number.isFinite(Number(ctx.setupScore)) ? Number(ctx.setupScore) : 0;
    const planOk = ctx.planOk === true;
    const rrOk = ctx.rrOk === true;
    const tradeabilityOk = ctx.tradeabilityOk === true;
    const volumeOk = ctx.volumeOk !== false;
    const pullbackOk = ['near_20ma','near_50ma'].includes(pullbackZone);
    const noBounce = ['none','unconfirmed'].includes(bounceState);
    const bounceEarly = ['attempt','early'].includes(bounceState);
    const bounceUseful = bounceEarly || bounceState === 'confirmed';
    const isExtended = ctx.isExtended === true;
    const planInvalidLabel = String(ctx.planStatusKey || '').toLowerCase() === 'invalid';
    const viableRrExists = rrOk || Number.isFinite(Number(ctx.credibleRr)) && Number(ctx.credibleRr) >= 1.5;

    if(structureEligibility === 'broken'){
      return {
        viability:'reject',
        viabilityReason:'Setup no longer viable - structure is broken.',
        mainBlocker:'Structure is broken.'
      };
    }
    if(structureEligibility === 'damaged' && noBounce && !planOk){
      return {
        viability:'reject',
        viabilityReason:'Setup no longer viable - structure is weakening.',
        mainBlocker:'Trend is weakening - no reliable stop level yet.'
      };
    }
    if(structureEligibility === 'damaged' && !tradeabilityOk && !rrOk){
      return {
        viability:'reject',
        viabilityReason:'No bounce and no valid plan.',
        mainBlocker:'Trend is weakening - no reliable stop level yet.'
      };
    }
    if(setupScore < 6 && noBounce){
      return {
        viability:'reject',
        viabilityReason:'Setup has slipped below watchlist quality.',
        mainBlocker:'No bounce confirmation yet.'
      };
    }
    if(planInvalidLabel && !viableRrExists && !bounceUseful){
      return {
        viability:'reject',
        viabilityReason:'No bounce and no valid plan.',
        mainBlocker:'Invalid plan with no credible RR.'
      };
    }

    if(structureEligibility === 'damaged' && bounceEarly){
      return {
        viability:'low_priority',
        viabilityReason:'Weakening setup - monitor only if it improves.',
        mainBlocker:'Trend is weakening - no reliable stop level yet.'
      };
    }
    if(setupScore >= 5 && setupScore < 7 && (pullbackOk || bounceEarly || structureEligibility !== 'broken')){
      return {
        viability:'low_priority',
        viabilityReason:'Low-priority watch - needs structure repair.',
        mainBlocker:structureEligibility === 'damaged'
          ? 'Trend is weakening - no reliable stop level yet.'
          : (noBounce ? 'No bounce confirmation yet.' : 'Conditions are not strong enough for active focus.')
      };
    }
    if(isExtended && structureEligibility === 'alive'){
      return {
        viability:'low_priority',
        viabilityReason:'Extended setup - wait for pullback structure.',
        mainBlocker:'No pullback structure to define entry yet.'
      };
    }

    if(structureEligibility === 'alive' && (pullbackOk || bounceEarly || setupScore >= 7)){
      return {
        viability:'watchlist',
        viabilityReason:'Structurally alive - waiting for confirmation.',
        mainBlocker:noBounce ? 'No bounce confirmation yet.' : 'Needs confirmation before promotion.'
      };
    }

    return {
      viability:'low_priority',
      viabilityReason:'Conditions are not strong enough for active focus.',
      mainBlocker:structureEligibility === 'damaged'
        ? 'Trend is weakening - no reliable stop level yet.'
        : (noBounce ? 'No bounce confirmation yet.' : 'No pullback structure to define entry yet.')
    };
  }

  function resolveGlobalVerdict(record, deps = {}){
    const item = record && typeof record === 'object' ? record : {};
    const preLifecycleResolved = deps.resolvePreLifecycleStateContract(item);
    const isTracked = !!(
      item.in_watchlist
      || item.watchlist_entry_exists
      || (item.watchlist && item.watchlist.inWatchlist)
    );
    const resolved = isTracked
      ? deps.resolveFinalStateContract(item, {context:'global'})
      : preLifecycleResolved;
    const baseVerdict = deps.baseVerdictFromResolvedContract(preLifecycleResolved);
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
    const currentPrice = Number.isFinite(Number(item && item.marketData && item.marketData.price))
      ? Number(item.marketData.price)
      : null;
    const ma20 = Number.isFinite(Number(item && item.marketData && item.marketData.ma20))
      ? Number(item.marketData.ma20)
      : null;
    const priceDistanceFrom20MA = Number.isFinite(currentPrice) && Number.isFinite(ma20) && ma20 !== 0
      ? Math.abs((currentPrice - ma20) / ma20)
      : null;
    const rrValue = Number.isFinite(Number(displayedPlan && displayedPlan.rewardRisk && displayedPlan.rewardRisk.rrRatio))
      ? Number(displayedPlan.rewardRisk.rrRatio)
      : null;
    const stopPrice = Number.isFinite(Number(item && item.plan && item.plan.stop))
      ? Number(item.plan.stop)
      : null;
    const brokenBelowStop = Number.isFinite(currentPrice) && Number.isFinite(stopPrice) && currentPrice <= stopPrice;
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
    const explicitInvalidationFlag = !!(item && item.plan && item.plan.invalidatedState);
    const explicitInvalidationReason = explicitInvalidationFlag && (structureState === 'broken' || trendState === 'broken' || brokenBelowStop)
      ? (structureState === 'broken'
        ? 'Structure is broken.'
        : (trendState === 'broken'
          ? 'Trend is broken.'
          : 'Price breached stop structure.'))
      : '';
    const structurallyBroken = !!(
      structureState === 'broken'
      || trendState === 'broken'
      || brokenBelowStop
    );
    const structureLayer = resolveStructureEligibility({
      structureState,
      trendState,
      brokenBelowStop
    });
    const isExtended = resolveExtendedState({
      pullbackZone,
      priceDistanceFrom20MA
    });
    const weakStructure = ['weak','weakening','developing_loose'].includes(structureState);
    const tentativeBounce = ['none','unconfirmed','attempt','early'].includes(bounceState);
    const weakVolume = volumeState === 'weak';
    const invalidPlan = ['invalid','missing','needs_adjustment','unrealistic_rr','rebuild_required'].includes(planStatusKey)
      || tradeabilityState === 'invalid';
    const supportiveStructure = !weakStructure && ['intact','strong','developing'].includes(structureState || '');
    let finalVerdict = baseVerdict;
    let reason = 'Default live setup state.';

    if(finalVerdict === 'avoid' && !structurallyBroken){
      finalVerdict = 'monitor';
      reason = `${structureReasonLabel(structureState)}. Non-structural avoid downgraded to monitor.`;
    }

    if(structurallyBroken){
      finalVerdict = 'dead';
      reason = resolved.blockerReason || 'Structure is broken.';
    }else if(weakStructure && invalidPlan){
      finalVerdict = 'monitor';
      reason = `${structureReasonLabel(structureState)}. Setup stays on monitor while tradeability is unresolved.`;
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
        ? `${structureReasonLabel(structureState)}. Plan is not ready yet.`
        : (marketWeak
          ? 'Weak market caution.'
          : (tentativeBounce
            ? 'Bounce still tentative.'
            : (weakVolume ? 'Weak volume caution.' : `${structureReasonLabel(structureState)}. Setup is still early.`)));
    }else if(resolved.actionStateKey === 'recalculate_plan' || resolved.actionStateKey === 'wait_for_confirmation' || resolved.structuralState === 'developing'){
      finalVerdict = 'monitor';
      reason = resolved.blockerReason || 'Bounce is too weak to price cleanly.';
    }else if(String(resolved.finalVerdict || '').toLowerCase() === 'avoid'){
      finalVerdict = 'monitor';
      reason = resolved.reasonSummary || resolved.blockerReason || `${structureReasonLabel(structureState)}. Alive setup downgraded to monitoring.`;
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
    let trackedVerdict = normalizeVerdict(guardedVerdict.final_verdict);
    let trackedReason = guardedVerdict.reason || reason;
    const viability = resolveWatchlistViability({
      structureEligibility:structureLayer.structureEligibility,
      bounceState,
      pullbackZone,
      setupScore,
      planOk:!invalidPlan,
      rrOk:Number.isFinite(credibleRr) && credibleRr >= 1.5,
      tradeabilityOk:['tradable', 'entry', 'ready', 'action_now'].includes(tradeabilityState),
      volumeOk:volumeState !== 'weak',
      planStatusKey,
      credibleRr,
      isExtended
    });
    if(trackedVerdict !== 'entry' && trackedVerdict !== 'near_entry'){
      if(viability.viability === 'reject'){
        trackedVerdict = 'avoid';
      }else{
        trackedVerdict = 'monitor';
      }
      if(structureLayer.structureEligibility === 'damaged'){
        trackedReason = 'Trend is weakening - no reliable stop level yet.';
      }else if(isExtended && ['strong','intact'].includes(structureState)){
        trackedReason = 'No pullback structure to define entry yet.';
      }else{
        trackedReason = viability.mainBlocker || viability.viabilityReason || trackedReason;
      }
    }
    const trackedAvoidTriggerSource = (trackedVerdict === 'avoid' || trackedVerdict === 'dead')
      ? (structurallyBroken ? 'structure_broken' : (trackedVerdict !== baseVerdict ? 'lifecycle' : null))
      : null;
    const lifecycleDowngradeSuppressed = !isTracked
      && (trackedVerdict === 'avoid' || trackedVerdict === 'dead')
      && trackedAvoidTriggerSource === 'lifecycle';
    finalVerdict = normalizeVerdict(isTracked ? trackedVerdict : baseVerdict);
    reason = isTracked ? trackedReason : (lifecycleDowngradeSuppressed ? 'Pre-watchlist lifecycle downgrade suppressed.' : trackedReason);
    const avoidAllowedByStructureConsistencyGuard = structurallyBroken || viability.viability === 'reject';
    if(!avoidAllowedByStructureConsistencyGuard && (finalVerdict === 'avoid' || finalVerdict === 'dead')){
      finalVerdict = 'monitor';
      reason = 'Setup is weak and not tradeable yet, but not structurally broken.';
    }
    const avoidTriggerSource = (finalVerdict === 'avoid' || finalVerdict === 'dead')
      ? (structurallyBroken ? 'structure_broken' : null)
      : null;
    const deadTriggerSource = (finalVerdict === 'avoid' || finalVerdict === 'dead')
      ? (structurallyBroken ? 'structure_broken' : null)
      : null;
    const lifecycleDropReason = trackedAvoidTriggerSource === 'lifecycle'
      ? trackedReason
      : '';

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
    const bucket = (finalVerdict === 'monitor' && viability.viability === 'low_priority')
      ? 'lower_priority'
      : getBucket(finalVerdict);
    return {
      base_verdict:normalizeVerdict(baseVerdict),
      tracked_verdict:trackedVerdict,
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
      subline:isExtended && ['strong','intact'].includes(structureState)
        ? 'Buyers in control, but price is stretched away from support'
        : '',
      final_state_reason:'derived from structureState only',
      avoid_trigger_source:avoidTriggerSource,
      dead_trigger_source:deadTriggerSource,
      downgrade_applied:baseVerdict !== trackedVerdict,
      downgrade_reason:trackedReason,
      lifecycle_downgrade_suppressed:lifecycleDowngradeSuppressed,
      explicit_invalidation_reason:explicitInvalidationReason || '(none)',
      structure_to_label_mapping_source:'resolveGlobalVerdict(structure_state)',
      lifecycle_drop_reason:lifecycleDropReason || '(none)',
      avoid_allowed_by_structure_consistency_guard:avoidAllowedByStructureConsistencyGuard,
      entry_gate_pass:guardedVerdict.entry_gate_pass,
      entry_gate_reasons:guardedVerdict.entry_gate_reasons,
      near_entry_gate_pass:guardedVerdict.near_entry_gate_pass,
      near_entry_gate_reasons:guardedVerdict.near_entry_gate_reasons,
      entry_gate_checks:guardedVerdict.entry_gate_checks,
      setup_score:Number.isFinite(setupScore) ? setupScore : null,
      priority_score_adjustment:isExtended ? -0.35 : 0,
      is_extended:isExtended,
      structure_eligibility:structureLayer.structureEligibility,
      structure_reason:structureLayer.structureReason,
      viability:viability.viability,
      viability_reason:viability.viabilityReason,
      main_blocker:trackedReason || viability.mainBlocker || '',
      rejected_by_viability_gate:viability.viability === 'reject',
      low_priority_by_viability_gate:viability.viability === 'low_priority',
      structure_state:structureState || '',
      bounce_state:bounceState || '',
      pullback_zone:pullbackZone || '',
      volume_state:volumeState || '',
      market_regime:marketWeak ? 'weak' : 'normal',
      tracked:isTracked,
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
    normalizeVerdict,
    globalVerdictLabel,
    getTone,
    getBucket,
    getBadge,
    getActions,
    canPromoteToEntry,
    canPromoteToNearEntry,
    applyPromotionGuards,
    resolveStructureEligibility,
    resolveWatchlistViability,
    resolveGlobalVerdict
  };
})(window);
