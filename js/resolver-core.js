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
      monitor:'amber',
      avoid:'red',
    })[normalizeVerdict(finalVerdict)] || 'amber';
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
      entry:{text:'\uD83D\uDE80 Entry', className:'badge--entry ready'},
      near_entry:{text:'\uD83C\uDFAF Near Entry', className:'badge--near-entry near'},
      monitor:{text:'\uD83D\uDFE1 Monitor', className:'badge--monitor watch'},
      avoid:{text:'\u26D4 Avoid', className:'badge--avoid avoid'},
    })[safeVerdict] || {text:'\uD83D\uDFE1 Monitor', className:'badge--monitor watch'};
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

  function numericValueOrNull(value){
    if(value === null || value === undefined) return null;
    if(typeof value === 'string' && value.trim() === '') return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function resolveBouncePriceability(ctx = {}){
    const reclaimSupportingEvidence = [];
    const reclaimDirectEvidence = [];
    const stabilisationState = String(ctx.stabilisation_state || '').trim().toLowerCase();
    if(ctx.reclaim_attempt === true) reclaimSupportingEvidence.push('reclaim_attempt');
    if(stabilisationState === 'clear') reclaimSupportingEvidence.push('stabilisation_clear');
    if(String(ctx.bounce_quality || '').trim().toLowerCase() === 'strong' || String(ctx.bounce_quality || '').trim().toLowerCase() === 'clear'){
      reclaimSupportingEvidence.push('bounce_quality_clear');
    }
    if(String(ctx.volume_state || '').trim().toLowerCase() === 'supportive' || String(ctx.volume_state || '').trim().toLowerCase() === 'strong'){
      reclaimSupportingEvidence.push('volume_confirmation');
    }
    if(ctx.reclaims_level === true) reclaimDirectEvidence.push('reclaims_level');
    if(ctx.reclaim_hold === true) reclaimDirectEvidence.push('reclaim_hold');
    if(ctx.held_reclaim === true) reclaimDirectEvidence.push('held_reclaim');
    if(ctx.entry_trigger_hit === true) reclaimDirectEvidence.push('entry_trigger_hit');
    const currentPriceVal = numericValueOrNull(ctx.current_price);
    const entryVal = numericValueOrNull(ctx.entry);
    const credibleRR = numericValueOrNull(ctx.credible_rr);
    const rrFallback = numericValueOrNull(ctx.rr);
    const resolvedRR = credibleRR !== null ? credibleRR : rrFallback;
    if(entryVal !== null && currentPriceVal !== null && currentPriceVal >= entryVal){
      reclaimDirectEvidence.push('price_holding_entry');
    }
    if(ctx.higher_low_respected === true || ctx.swing_low_respected === true){
      reclaimDirectEvidence.push('higher_low_respected');
    }
    const reclaimSignalCount = reclaimSupportingEvidence.length + reclaimDirectEvidence.length;
    const reclaimDirectSignalCount = reclaimDirectEvidence.length;
    const independentReclaimConfirmed = reclaimSignalCount >= 2 && reclaimDirectSignalCount >= 1;
    const reclaimConfirmedReason = independentReclaimConfirmed
      ? `Confirmed from ${reclaimSignalCount} signals (${reclaimDirectSignalCount} direct).`
      : `Need >=2 signals with >=1 direct; got ${reclaimSignalCount} total and ${reclaimDirectSignalCount} direct.`;
    const reclaimConfirmationEvidence = reclaimDirectEvidence.concat(reclaimSupportingEvidence);
    const helper = global.BouncePriceability && typeof global.BouncePriceability.isConfirmedBouncePriceable === 'function'
      ? global.BouncePriceability.isConfirmedBouncePriceable
      : null;
    if(helper){
      const result = helper({
        originalBounceState:ctx.bounce_state,
        structureState:ctx.structure_state,
        pullbackZone:ctx.pullback_zone,
        stabilisationState:ctx.stabilisation_state,
        trendState:ctx.trend_state,
        currentPrice:ctx.current_price,
        entry:ctx.entry,
        stop:ctx.stop,
        target:ctx.target,
        rr:resolvedRR,
        reclaimConfirmed:independentReclaimConfirmed,
        riskTooWide:ctx.stop_distance_too_wide === true
      });
      return {
        ...result,
        resolvedRR,
        rrKnown:resolvedRR !== null,
        reclaimConfirmed:independentReclaimConfirmed,
        reclaimConfirmationEvidence,
        reclaimSignalCount,
        reclaimDirectSignalCount,
        reclaimConfirmedReason
      };
    }
    const bounce = String(ctx.bounce_state || '').trim().toLowerCase() || 'none';
    return {
      originalBounceState:bounce,
      adjustedBounceState:bounce,
      bouncePriceabilityGuardApplied:false,
      bouncePriceabilityGuardReason:'',
      hasClearInvalidationLevel:ctx.has_stop === true,
      hasPriceablePlan:ctx.plan_status === 'valid',
      hasCredibleEntryTrigger:false,
      unpriceableBlockReason:'',
      resolvedRR,
      rrKnown:resolvedRR !== null,
      reclaimConfirmed:independentReclaimConfirmed,
      reclaimConfirmationEvidence,
      reclaimSignalCount,
      reclaimDirectSignalCount,
      reclaimConfirmedReason
    };
  }

  function canPromoteToEntry(ctx = {}){
    const bouncePriceability = resolveBouncePriceability(ctx);
    const credibleRrValue = numericValueOrNull(ctx.credible_rr);
    const rrValue = numericValueOrNull(ctx.rr);
    const bounceState = String(bouncePriceability.adjustedBounceState || ctx.bounce_state || '').trim().toLowerCase();
    const structureState = String(ctx.structure_state || '').trim().toLowerCase();
    const planStatus = String(ctx.plan_status || '').trim().toLowerCase();
    const tradeability = String(ctx.tradeability || '').trim().toLowerCase();
    const marketRegime = String(ctx.market_regime || '').trim().toLowerCase();
    const volumeState = String(ctx.volume_state || '').trim().toLowerCase();
    const checks = {
      structure_ok:['strong', 'intact', 'developing_clean'].includes(structureState),
      bounce_ok:bounceState === 'confirmed' && !bouncePriceability.unpriceableBlockReason && bouncePriceability.reclaimConfirmed === true,
      pullback_ok:['near_20ma', 'near_50ma'].includes(String(ctx.pullback_zone || '').trim().toLowerCase()),
      market_ok:['normal', 'supportive'].includes(marketRegime),
      volume_ok:['normal', 'supportive', 'strong'].includes(volumeState),
      plan_visible:ctx.plan_visible === true,
      has_entry:ctx.has_entry === true,
      has_stop:ctx.has_stop === true,
      plan_ok:planStatus === 'valid' && ctx.plan_blocked !== true,
      risk_width_ok:ctx.stop_distance_too_wide !== true,
      pullback_valid:ctx.pullback_valid !== false,
      rr_ok:credibleRrValue !== null ? credibleRrValue >= 2 : (rrValue !== null && rrValue >= 2),
      entry_trigger_hit:ctx.entry_trigger_hit === true,
      tradeability_ok:['tradable', 'entry', 'ready', 'action_now'].includes(tradeability),
      unpriceable_block:!['tradable', 'entry', 'ready', 'action_now'].includes(tradeability) || !!bouncePriceability.unpriceableBlockReason,
      below_50_without_reclaim:ctx.price_below_50ma === true && ctx.reclaim_attempt !== true,
      capital_ok:(() => {
        const capitalFit = String(ctx.capital_fit || '').trim().toLowerCase();
        if(!capitalFit || capitalFit === 'unknown') return true;
        return ['ideal', 'acceptable', 'fits_capital'].includes(capitalFit);
      })(),
      has_clear_invalidation_level:bouncePriceability.hasClearInvalidationLevel === true,
      has_priceable_plan:bouncePriceability.hasPriceablePlan === true,
      unpriceable_block_reason:String(bouncePriceability.unpriceableBlockReason || '').trim(),
      reclaim_confirmed_independent:bouncePriceability.reclaimConfirmed === true,
      reclaim_confirmation_evidence:Array.isArray(bouncePriceability.reclaimConfirmationEvidence) ? bouncePriceability.reclaimConfirmationEvidence.slice() : [],
      reclaim_signal_count:Number.isFinite(Number(bouncePriceability.reclaimSignalCount)) ? Number(bouncePriceability.reclaimSignalCount) : 0,
      reclaim_direct_signal_count:Number.isFinite(Number(bouncePriceability.reclaimDirectSignalCount)) ? Number(bouncePriceability.reclaimDirectSignalCount) : 0,
      reclaim_confirmed_reason:String(bouncePriceability.reclaimConfirmedReason || '').trim(),
      resolved_rr:bouncePriceability.resolvedRR,
      rr_known:bouncePriceability.rrKnown === true
    };
    const reasons = [];
    if(!checks.structure_ok) reasons.push('Structure is not strong/intact/developing clean.');
    if(!checks.bounce_ok) reasons.push('Bounce must be confirmed.');
    if(bouncePriceability.unpriceableBlockReason) reasons.push(bouncePriceability.unpriceableBlockReason);
    if(!checks.pullback_ok) reasons.push('Pullback must be near the 20MA or 50MA.');
    if(!checks.pullback_valid) reasons.push('Pullback context is invalid.');
    if(!checks.market_ok) reasons.push('Market regime must be supportive.');
    if(!checks.volume_ok) reasons.push('Volume must be at least normal.');
    if(!checks.plan_visible) reasons.push('No actionable plan yet.');
    if(!checks.has_entry) reasons.push('Entry is missing from the plan.');
    if(!checks.has_stop) reasons.push('Stop is missing from the plan.');
    if(!checks.plan_ok) reasons.push('Plan must be valid and not blocked.');
    if(!checks.risk_width_ok) reasons.push('Stop distance is too wide to price risk cleanly.');
    if(!checks.entry_trigger_hit) reasons.push('Entry trigger has not fired.');
    if(!checks.rr_ok) reasons.push('RR or credible RR must be at least 2.0.');
    if(!checks.tradeability_ok) reasons.push('Tradeability must be tradable, entry, or ready.');
    if(checks.unpriceable_block) reasons.push('Tradeability is not priceable yet.');
    if(checks.below_50_without_reclaim) reasons.push('Price is below the 50MA without a reclaim attempt.');
    if(!checks.capital_ok) reasons.push('Capital concentration is too high for entry readiness.');
    return {
      pass:reasons.length === 0,
      reasons,
      checks
    };
  }

  function canPromoteToNearEntry(ctx = {}){
    const bouncePriceability = resolveBouncePriceability(ctx);
    const credibleRrValue = numericValueOrNull(ctx.credible_rr);
    const rrValue = numericValueOrNull(ctx.rr);
    const structureState = String(ctx.structure_state || '').trim().toLowerCase();
    const bounceState = String(bouncePriceability.adjustedBounceState || ctx.bounce_state || '').trim().toLowerCase();
    const pullbackZone = String(ctx.pullback_zone || '').trim().toLowerCase();
    const tradeability = String(ctx.tradeability || '').trim().toLowerCase();
    const planStatus = String(ctx.plan_status || '').trim().toLowerCase();
    const planText = String(ctx.plan_status_text || '').trim().toLowerCase();
    const validTradeability = ['tradable', 'entry', 'ready', 'action_now'].includes(tradeability);
    const checks = {
      structure_ok:['strong', 'intact', 'developing_clean'].includes(structureState),
      structure_hard_blocked:['weakening', 'weak', 'broken', 'developing_loose'].includes(structureState),
      bounce_ok:bounceState === 'confirmed' && !bouncePriceability.unpriceableBlockReason && bouncePriceability.reclaimConfirmed === true,
      bounce_hard_blocked:bounceState !== 'confirmed' || !!bouncePriceability.unpriceableBlockReason || bouncePriceability.reclaimConfirmed !== true,
      pullback_ok:['near_20ma', 'near_50ma'].includes(pullbackZone),
      pullback_valid:ctx.pullback_valid !== false,
      plan_visible:ctx.plan_visible === true,
      has_entry:ctx.has_entry === true,
      has_stop:ctx.has_stop === true,
      plan_ok:planStatus === 'valid',
      weak_bounce_plan_text:planText.includes('bounce is not clear enough to price yet'),
      risk_width_ok:ctx.stop_distance_too_wide !== true,
      rr_priceable:credibleRrValue !== null || rrValue !== null,
      tradeability_ok:validTradeability,
      below_50_without_reclaim:ctx.price_below_50ma === true && ctx.reclaim_attempt !== true,
      volume_blocked:ctx.volume_required === true && String(ctx.volume_state || '').trim().toLowerCase() === 'weak',
      has_clear_invalidation_level:bouncePriceability.hasClearInvalidationLevel === true,
      has_priceable_plan:bouncePriceability.hasPriceablePlan === true,
      unpriceable_block_reason:String(bouncePriceability.unpriceableBlockReason || '').trim(),
      reclaim_confirmed_independent:bouncePriceability.reclaimConfirmed === true,
      reclaim_confirmation_evidence:Array.isArray(bouncePriceability.reclaimConfirmationEvidence) ? bouncePriceability.reclaimConfirmationEvidence.slice() : [],
      reclaim_signal_count:Number.isFinite(Number(bouncePriceability.reclaimSignalCount)) ? Number(bouncePriceability.reclaimSignalCount) : 0,
      reclaim_direct_signal_count:Number.isFinite(Number(bouncePriceability.reclaimDirectSignalCount)) ? Number(bouncePriceability.reclaimDirectSignalCount) : 0,
      reclaim_confirmed_reason:String(bouncePriceability.reclaimConfirmedReason || '').trim(),
      resolved_rr:bouncePriceability.resolvedRR,
      rr_known:bouncePriceability.rrKnown === true
    };
    const reasons = [];
    if(!checks.structure_ok) reasons.push('Structure is not strong/intact/developing clean.');
    if(checks.structure_hard_blocked) reasons.push('Structure is weakening or broken.');
    if(!checks.bounce_ok) reasons.push('Developing - waiting for confirmation.');
    if(checks.bounce_hard_blocked && bouncePriceability.unpriceableBlockReason) reasons.push(bouncePriceability.unpriceableBlockReason);
    if(!checks.pullback_ok) reasons.push('Pullback must be near the 20MA or 50MA.');
    if(!checks.pullback_valid) reasons.push('Pullback context is invalid.');
    if(!checks.plan_visible) reasons.push('No actionable plan yet.');
    if(!checks.has_entry) reasons.push('Entry is missing from the plan.');
    if(!checks.has_stop) reasons.push('Stop is missing from the plan.');
    if(!checks.plan_ok) reasons.push('Plan must be valid to qualify for Near Entry.');
    if(checks.weak_bounce_plan_text) reasons.push('Bounce is not clear enough to price yet.');
    if(!checks.risk_width_ok) reasons.push('Stop distance is too wide to price risk cleanly.');
    if(!checks.rr_priceable) reasons.push('Risk/reward cannot be calculated from the current plan.');
    if(!checks.tradeability_ok) reasons.push('Tradeability is not priceable yet.');
    if(checks.below_50_without_reclaim) reasons.push('Price is below the 50MA with no reclaim attempt.');
    if(checks.volume_blocked) reasons.push('Volume is too weak for this gate.');
    return {
      pass:reasons.length === 0,
      reasons,
      checks
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
    const entryGateReasons = Array.isArray(entryGate.reasons) && entryGate.reasons.length
      ? entryGate.reasons
      : [entryGate.pass ? 'Entry gate passed.' : 'Entry gate failed.'];
    const nearEntryGateReasons = Array.isArray(nearEntryGate.reasons) && nearEntryGate.reasons.length
      ? nearEntryGate.reasons
      : [nearEntryGate.pass ? 'Near Entry gate passed.' : 'Near Entry gate failed.'];
    return {
      ...current,
      final_verdict:softenedVerdict,
      reason,
      entry_gate_pass:entryGate.pass,
      entry_gate_reasons:entryGateReasons,
      entry_gate_checks:entryGate.checks,
      near_entry_gate_pass:nearEntryGate.pass,
      near_entry_gate_reasons:nearEntryGateReasons,
      near_entry_gate_checks:nearEntryGate.checks || {}
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
    const credibleRrValue = numericValueOrNull(ctx.credibleRr);
    const viableRrExists = rrOk || (credibleRrValue !== null && credibleRrValue >= 1.5);

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
    const effectivePlan = typeof deps.effectivePlanForRecord === 'function'
      ? deps.effectivePlanForRecord(item, {allowScannerFallback:true})
      : {
        entry:item.plan && item.plan.entry,
        stop:item.plan && item.plan.stop,
        firstTarget:item.plan && item.plan.firstTarget
      };
    const rawDisplayedPlan = deps.deriveCurrentPlanState(
      effectivePlan && effectivePlan.entry,
      effectivePlan && effectivePlan.stop,
      effectivePlan && effectivePlan.firstTarget,
      item.marketData && item.marketData.currency
    );
    const displayedPlan = typeof deps.applySetupConfirmationPlanGate === 'function'
      ? deps.applySetupConfirmationPlanGate(item, rawDisplayedPlan, derivedStates)
      : rawDisplayedPlan;
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
    const volumeRequired = item && item.setup && item.setup.volumeRequired === true;
    const pullbackZone = String(derivedStates.pullbackZone || '').toLowerCase();
    const currentPrice = numericValueOrNull(item && item.marketData && item.marketData.price);
    const ma20 = numericValueOrNull(item && item.marketData && item.marketData.ma20);
    const priceDistanceFrom20MA = Number.isFinite(currentPrice) && Number.isFinite(ma20) && ma20 !== 0
      ? Math.abs((currentPrice - ma20) / ma20)
      : null;
    const rrValue = numericValueOrNull(displayedPlan && displayedPlan.rewardRisk && displayedPlan.rewardRisk.rrRatio);
    const planEntry = numericValueOrNull(displayedPlan && displayedPlan.entry);
    const planStop = numericValueOrNull(displayedPlan && displayedPlan.stop);
    const planTarget = numericValueOrNull(displayedPlan && displayedPlan.target);
    const hasEntry = Number.isFinite(planEntry);
    const hasStop = Number.isFinite(planStop);
    const hasTarget = Number.isFinite(planTarget);
    const planVisible = String(displayedPlan && displayedPlan.status || '').toLowerCase() === 'valid';
    const stopDistanceTooWide = String(displayedPlan && displayedPlan.riskFit && displayedPlan.riskFit.risk_status || '').toLowerCase() === 'too_wide';
    const planStatusText = String(resolved && resolved.blockerReason || '');
    const pullbackValid = ['near_20ma','near_50ma'].includes(pullbackZone);
    const sma50 = numericValueOrNull(item && item.marketData && item.marketData.sma50);
    const priceBelow50MA = Number.isFinite(currentPrice) && Number.isFinite(sma50)
      ? currentPrice < sma50
      : false;
    const entryTriggerHit = ['entry', 'ready_to_act'].includes(String(resolved.actionStateKey || '').toLowerCase())
      || String(resolved.structuralState || '').toLowerCase() === 'entry';
    const stopPrice = numericValueOrNull(item && item.plan && item.plan.stop);
    const brokenBelowStop = Number.isFinite(currentPrice) && Number.isFinite(stopPrice) && currentPrice <= stopPrice;
    const planRealism = typeof deps.evaluatePlanRealism === 'function'
      ? deps.evaluatePlanRealism(item, {
        displayedPlan,
        derivedStates
      })
      : null;
    const credibleRrParsed = numericValueOrNull(planRealism && planRealism.credible_rr);
    const credibleRr = credibleRrParsed !== null ? credibleRrParsed : rrValue;
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
      reason = resolved.blockerReason || 'Bounce is not clear enough to price yet.';
    }else if(String(resolved.finalVerdict || '').toLowerCase() === 'avoid'){
      finalVerdict = 'monitor';
      reason = resolved.reasonSummary || resolved.blockerReason || `${structureReasonLabel(structureState)}. Alive setup downgraded to monitoring.`;
    }

    const requestedBeforeGuards = normalizeVerdict(finalVerdict);
    const guardedVerdict = applyPromotionGuards({
      final_verdict:finalVerdict,
      reason
    }, {
      structure_state:structureState,
      stabilisation_state:String(derivedStates.stabilisationState || '').toLowerCase(),
      bounce_state:bounceState,
      pullback_zone:pullbackZone,
      market_regime:marketWeak ? 'weak' : 'normal',
      volume_state:volumeState,
      volume_required:volumeRequired,
      plan_status:planStatusKey,
      plan_blocked:planStatusKey !== 'valid',
      plan_visible:planVisible,
      has_entry:hasEntry,
      has_stop:hasStop,
      has_target:hasTarget,
      stop_distance_too_wide:stopDistanceTooWide,
      pullback_valid:pullbackValid,
      price_below_50ma:priceBelow50MA,
      reclaim_attempt:item && item.reclaimAttempt === true,
      entry_trigger_hit:entryTriggerHit,
      plan_status_text:planStatusText,
      rr:rrValue,
      credible_rr:credibleRr,
      entry:planEntry,
      stop:planStop,
      target:planTarget,
      current_price:currentPrice,
      trend_state:trendState,
      reclaims_level:item && item.reclaimsLevel === true,
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
    const guardedForPresentation = normalizeVerdict(guardedVerdict.final_verdict);
    const promotionWasAttempted = requestedBeforeGuards === 'near_entry' || requestedBeforeGuards === 'entry';
    const guardBlockers = []
      .concat(Array.isArray(guardedVerdict.near_entry_gate_reasons) ? guardedVerdict.near_entry_gate_reasons : [])
      .concat(Array.isArray(guardedVerdict.entry_gate_reasons) ? guardedVerdict.entry_gate_reasons : [])
      .filter(Boolean);
    const presentationUpgradeBlocked = promotionWasAttempted
      && guardedForPresentation !== requestedBeforeGuards
      && guardBlockers.length > 0;
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
      final_state_reason:guardedVerdict.reason || reason || 'resolved from gate contract',
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
      near_entry_gate_checks:guardedVerdict.near_entry_gate_checks,
      promotionBlockedBy:(!guardedVerdict.near_entry_gate_pass || !guardedVerdict.entry_gate_pass)
        ? ((guardedVerdict.near_entry_gate_checks && (guardedVerdict.near_entry_gate_checks.bounce_hard_blocked || !guardedVerdict.near_entry_gate_checks.bounce_ok))
          ? 'bounce'
          : ((guardedVerdict.near_entry_gate_checks && !guardedVerdict.near_entry_gate_checks.plan_ok) ? 'plan' : 'gates'))
        : '',
      promotionBlockedReason:(guardedVerdict.near_entry_gate_reasons && guardedVerdict.near_entry_gate_reasons[0]) || '',
      finalVerdictBeforePresentation:normalizeVerdict(guardedVerdict.final_verdict),
      finalVerdictAfterPresentation:finalVerdict,
      presentationDowngradeApplied:normalizeVerdict(guardedVerdict.final_verdict) !== finalVerdict,
      presentationUpgradeBlocked,
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
      planPriceabilitySource:'resolver-core:effectivePlan+marketData',
      resolvedPlanEntry:planEntry,
      resolvedPlanStop:planStop,
      resolvedPlanTarget:planTarget,
      resolvedPlanCurrentPrice:currentPrice,
      resolverCoreEntry:planEntry,
      resolverCoreStop:planStop,
      resolverCoreTarget:planTarget,
      resolverCoreCurrentPrice:currentPrice,
      hasClearInvalidationLevel:!!(
        guardedVerdict.near_entry_gate_checks && guardedVerdict.near_entry_gate_checks.has_clear_invalidation_level
      ),
      hasPriceablePlan:!!(
        guardedVerdict.near_entry_gate_checks && guardedVerdict.near_entry_gate_checks.has_priceable_plan
      ),
      unpriceableBlockReason:(
        (guardedVerdict.near_entry_gate_checks && guardedVerdict.near_entry_gate_checks.unpriceable_block_reason)
        || (guardedVerdict.entry_gate_checks && guardedVerdict.entry_gate_checks.unpriceable_block_reason)
        || ''
      ),
      reclaimSignalCount:Number.isFinite(Number(
        guardedVerdict.near_entry_gate_checks && guardedVerdict.near_entry_gate_checks.reclaim_signal_count
      )) ? Number(guardedVerdict.near_entry_gate_checks.reclaim_signal_count) : 0,
      reclaimDirectSignalCount:Number.isFinite(Number(
        guardedVerdict.near_entry_gate_checks && guardedVerdict.near_entry_gate_checks.reclaim_direct_signal_count
      )) ? Number(guardedVerdict.near_entry_gate_checks.reclaim_direct_signal_count) : 0,
      reclaimConfirmedReason:String(
        (guardedVerdict.near_entry_gate_checks && guardedVerdict.near_entry_gate_checks.reclaim_confirmed_reason)
        || (guardedVerdict.entry_gate_checks && guardedVerdict.entry_gate_checks.reclaim_confirmed_reason)
        || ''
      ).trim(),
      resolvedRR:(
        guardedVerdict.near_entry_gate_checks && guardedVerdict.near_entry_gate_checks.rr_known
      )
        ? guardedVerdict.near_entry_gate_checks.resolved_rr
        : (
          guardedVerdict.entry_gate_checks && guardedVerdict.entry_gate_checks.rr_known
            ? guardedVerdict.entry_gate_checks.resolved_rr
            : null
        ),
      rrKnown:!!(
        (guardedVerdict.near_entry_gate_checks && guardedVerdict.near_entry_gate_checks.rr_known)
        || (guardedVerdict.entry_gate_checks && guardedVerdict.entry_gate_checks.rr_known)
      ),
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

  function runTradeReadinessGateAssertions(){
    const cases = [
      {
        id:'A',
        ctx:{structure_state:'intact', bounce_state:'attempt', plan_visible:false, has_entry:false, has_stop:false, plan_status:'needs_adjustment', plan_status_text:'Bounce is not clear enough to price yet.', pullback_zone:'near_20ma', tradeability:'watch'},
        expect:{near:false, entry:false}
      },
      {
        id:'B',
        ctx:{structure_state:'intact', bounce_state:'improving', plan_visible:true, has_entry:true, has_stop:true, has_target:false, stop_distance_too_wide:false, plan_status:'valid', pullback_zone:'near_20ma', tradeability:'tradable', entry_trigger_hit:false, rr:1.8},
        expect:{near:false, entry:false}
      },
      {
        id:'C',
        ctx:{
          structure_state:'intact',
          trend_state:'intact',
          stabilisation_state:'clear',
          bounce_state:'confirmed',
          plan_visible:true,
          has_entry:true,
          has_stop:true,
          has_target:true,
          plan_status:'valid',
          pullback_zone:'near_20ma',
          stop_distance_too_wide:false,
          entry:100,
          stop:97,
          target:106,
          current_price:101,
          rr:2.1,
          market_regime:'supportive',
          volume_state:'normal',
          tradeability:'entry',
          entry_trigger_hit:true,
          reclaim_attempt:true,
          reclaims_level:true
        },
        expect:{near:true, entry:true}
      },
      {
        id:'D',
        ctx:{structure_state:'weakening', bounce_state:'improving', plan_visible:true, has_entry:true, has_stop:true, plan_status:'valid', pullback_zone:'near_20ma', tradeability:'tradable'},
        expect:{near:false}
      }
    ];
    const results = cases.map(testCase => {
      const near = canPromoteToNearEntry(testCase.ctx);
      const entry = canPromoteToEntry(testCase.ctx);
      const pass = near.pass === testCase.expect.near && (testCase.expect.entry === undefined || entry.pass === testCase.expect.entry);
      return {id:testCase.id, pass, near:near.pass, entry:entry.pass, nearReasons:near.reasons, entryReasons:entry.reasons};
    });
    results.forEach(result => {
      if(!result.pass){
        console.warn('[GateAssertionFailed]', result);
      }
    });
    return results;
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
    resolveGlobalVerdict,
    runTradeReadinessGateAssertions
  };
})(window);
