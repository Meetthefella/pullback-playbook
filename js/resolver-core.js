(function(global){
  // Canonical global-verdict helpers extracted from app.js.
  const diagnosticTraceState = {};

  function debugFlagEnabled(flagName){
    try{
      if(typeof global !== 'undefined' && global && global[flagName] === true) return true;
      if(typeof global !== 'undefined' && global && global.localStorage){
        return global.localStorage.getItem(flagName) === '1';
      }
    }catch(_error){}
    return false;
  }

  function logDiagnosticTrace(flagName, label, payload, options = {}){
    if(!debugFlagEnabled(flagName) || typeof console === 'undefined' || !console.info) return;
    const key = String(options.key || `${label}:${payload && payload.ticker || ''}`);
    const now = Date.now();
    const minIntervalMs = Number.isFinite(Number(options.minIntervalMs)) ? Number(options.minIntervalMs) : 1000;
    const previous = diagnosticTraceState[key] || {count:0, last:0};
    previous.count += 1;
    if(now - previous.last < minIntervalMs){
      diagnosticTraceState[key] = previous;
      return;
    }
    previous.last = now;
    diagnosticTraceState[key] = previous;
    console.info(label, previous.count > 1 ? {...payload, coalescedCount:previous.count} : payload);
    previous.count = 0;
  }

  function coerceCanonicalVerdict(verdict, fallback = 'watch'){
    const safe = String(verdict || '').trim().toLowerCase();
    if(safe === 'entry') return 'entry';
    if(safe === 'near_entry' || safe === 'near entry' || safe === 'nearentry') return 'near_entry';
    if(safe === 'avoid') return 'avoid';
    if(['watch','monitor','monitor_watch','developing','active','scanner_watch','review_monitor'].includes(safe)) return 'watch';
    if(['dead','diminishing'].includes(safe)) return 'avoid';
    return fallback;
  }

  function normalizeGlobalVerdictKey(verdict){
    return coerceCanonicalVerdict(verdict, 'watch');
  }

  function normalizeVerdict(verdict){
    return normalizeGlobalVerdictKey(verdict);
  }

  function globalVerdictLabel(finalVerdict){
    return ({
      entry:'Entry',
      near_entry:'Near Entry',
      watch:'Watch',
      avoid:'Avoid',
    })[normalizeVerdict(finalVerdict)] || 'Watch';
  }

  function getTone(finalVerdict){
    return ({
      entry:'green',
      near_entry:'teal',
      watch:'monitor',
      avoid:'red',
    })[normalizeVerdict(finalVerdict)] || 'monitor';
  }

  function getBucket(finalVerdict){
    return ({
      entry:'tradeable_entry',
      near_entry:'tradeable_entry',
      watch:'monitor_watch',
      avoid:'lower_priority',
    })[normalizeVerdict(finalVerdict)] || 'monitor_watch';
  }

  function getBadge(finalVerdict){
    const safeVerdict = normalizeVerdict(finalVerdict);
    return ({
      entry:{text:'Entry', className:'badge--entry ready'},
      near_entry:{text:'Near Entry', className:'badge--near-entry near'},
      watch:{text:'Watch', className:'badge--monitor watch'},
      avoid:{text:'Avoid', className:'badge--avoid avoid'},
    })[safeVerdict] || {text:'Watch', className:'badge--monitor watch'};
  }

  function getActions(finalVerdict){
    const safeVerdict = normalizeVerdict(finalVerdict);
    return ({
      entry:{label:'ENTRY', detail:'Ready to act', planAllowed:true, watchlistAllowed:false},
      near_entry:{label:'NEAR ENTRY', detail:'Close to trigger', planAllowed:true, watchlistAllowed:true},
      watch:{label:'WATCH', detail:'Needs confirmation', planAllowed:false, watchlistAllowed:true},
      avoid:{label:'AVOID', detail:'Low priority', planAllowed:false, watchlistAllowed:false},
    })[safeVerdict] || {label:'WATCH', detail:'Needs confirmation', planAllowed:false, watchlistAllowed:true};
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

  function nearEntryPullbackZoneOk(pullbackZone){
    const zone = String(pullbackZone || '').trim().toLowerCase();
    return [
      'near_20ma',
      'near_50ma',
      'at_20ma',
      'at_50ma',
      'reclaim',
      'reclaim_zone',
      'continuation',
      'continuation_zone',
      'left_20ma',
      'left_50ma',
      'recently_left_20ma',
      'recently_left_50ma'
    ].includes(zone);
  }

  function independentEntryTriggerHit(ctx = {}){
    const structureState = String(ctx.structure_state || '').trim().toLowerCase();
    const trendState = String(ctx.trend_state || '').trim().toLowerCase();
    const pullbackZone = String(ctx.pullback_zone || '').trim().toLowerCase();
    const stabilisationState = String(ctx.stabilisation_state || '').trim().toLowerCase();
    const bounceState = String(ctx.bounce_state || '').trim().toLowerCase();
    const currentPrice = numericValueOrNull(ctx.current_price);
    const entry = numericValueOrNull(ctx.entry);
    const planStatus = String(ctx.plan_status || '').trim().toLowerCase();
    const pullbackValid = ['near_20ma','near_50ma'].includes(pullbackZone);
    const structureIntact = !['weak','weakening','broken'].includes(structureState);
    const trendValid = !['weak','broken'].includes(trendState);
    const confirmedBounce = bounceState === 'confirmed';
    const clearStabilisation = stabilisationState === 'clear';
    const hasReviewedPlan = planStatus === 'valid' && entry !== null;
    const breakAboveTrigger = hasReviewedPlan && currentPrice !== null && currentPrice >= entry;
    const strongReversal = pullbackValid && trendValid && structureIntact && confirmedBounce && clearStabilisation;
    const reclaimFollowThrough = strongReversal && breakAboveTrigger;
    return !!(
      ctx.breaks_local_high === true
      || ctx.breaksLocalHigh === true
      || ctx.reclaims_level === true
      || ctx.reclaimsLevel === true
      || ctx.strong_bullish_continuation === true
      || ctx.strongBullishContinuation === true
      || breakAboveTrigger
      || strongReversal
      || reclaimFollowThrough
    );
  }

  function provisionalNumericValue(ctx, primaryKey, fallbackKey){
    const primary = numericValueOrNull(ctx[primaryKey]);
    if(primary !== null) return primary;
    return numericValueOrNull(ctx[fallbackKey]);
  }

  function nearEntryTerminalBlocked(ctx = {}){
    const lifecycleState = String(ctx.lifecycle_state || ctx.lifecycle || '').trim().toLowerCase();
    const terminalSource = String(ctx.terminal_avoid_source || ctx.avoid_trigger_source || ctx.dead_trigger_source || '').trim().toLowerCase();
    const structuralState = String(ctx.structural_state || ctx.structuralState || '').trim().toLowerCase();
    return !!(
      ctx.terminal_avoid_applied === true
      || ctx.terminalAvoidFlag === true
      || ctx.dead_lifecycle_state === true
      || ctx.structurally_broken === true
      || ['dead','avoid','terminal','expired','inactive'].includes(lifecycleState)
      || ['terminal','terminal_avoid','structure_broken','dead','avoid'].includes(terminalSource)
      || ['dead','broken','invalid','failed'].includes(structuralState)
    );
  }

  function resolveNearEntryProvisionalPlan(ctx = {}, bouncePriceability = {}){
    const structureState = String(ctx.structure_state || '').trim().toLowerCase();
    const trendState = String(ctx.trend_state || '').trim().toLowerCase();
    const bounceState = String(bouncePriceability.adjustedBounceState || ctx.bounce_state || '').trim().toLowerCase();
    const originalBounceState = String(bouncePriceability.originalBounceState || ctx.bounce_state || '').trim().toLowerCase() || 'none';
    const entry = provisionalNumericValue(ctx, 'entry', 'provisional_entry');
    const stop = provisionalNumericValue(ctx, 'stop', 'provisional_stop');
    const target = provisionalNumericValue(ctx, 'target', 'provisional_target');
    const rr = provisionalNumericValue(ctx, 'rr', 'provisional_rr');
    const pullbackOk = nearEntryPullbackZoneOk(ctx.pullback_zone) || ctx.recently_left_valid_pullback_zone === true;
    const structureOk = ['strong', 'intact', 'developing_clean'].includes(structureState);
    const hardStructureBlocked = ['weakening', 'weak', 'broken', 'developing_loose'].includes(structureState) || trendState === 'broken';
    const hasClearInvalidationLevel = bouncePriceability.hasClearInvalidationLevel === true
      || (Number.isFinite(entry) && Number.isFinite(stop) && entry > stop);
    const hasProvisionalPriceablePlan = !!(
      Number.isFinite(entry)
      && Number.isFinite(stop)
      && Number.isFinite(target)
      && Number.isFinite(rr)
      && entry > stop
      && target > entry
      && rr >= 2
    );
    const hasProvisionalPlanValues = !!(
      Number.isFinite(entry)
      && Number.isFinite(stop)
      && Number.isFinite(target)
      && Number.isFinite(rr)
      && entry > stop
      && target > entry
    );
    const hasContinuationEvidence = !!(
      bouncePriceability.reclaimSignalCount > 0
      || ctx.reclaim_attempt === true
      || ctx.reclaims_level === true
      || ctx.reclaim_hold === true
      || ctx.held_reclaim === true
      || ctx.higher_low_respected === true
      || ctx.swing_low_respected === true
      || ['clear','early','present'].includes(String(ctx.stabilisation_state || '').trim().toLowerCase())
    );
    const bounceAccepted = ['early', 'attempt'].includes(bounceState)
      || (['none', 'unconfirmed', 'improving'].includes(bounceState) && hasContinuationEvidence);
    const hardBlockReason = (() => {
      if(hardStructureBlocked) return 'Structure is weakening or broken.';
      if(ctx.price_below_200ma === true) return 'Price is below the 200MA.';
      if(ctx.ma50_below_200ma === true) return '50MA is below the 200MA.';
      if(!hasClearInvalidationLevel) return 'No valid invalidation level is available.';
      if(ctx.stop_distance_too_wide === true) return 'Stop distance is too wide to price risk cleanly.';
      if(['too_heavy','too_expensive'].includes(String(ctx.capital_fit || '').trim().toLowerCase())) return 'Capital fit is impossible at this risk level.';
      if(String(ctx.affordability || '').trim().toLowerCase() === 'not_affordable') return 'Capital fit is impossible at this risk level.';
      if(!hasProvisionalPriceablePlan) return hasProvisionalPlanValues
        ? 'RR or credible RR must be at least 2.0.'
        : 'Risk/reward cannot be calculated from the current plan.';
      if(!structureOk) return 'Structure is not strong/intact/developing clean.';
      if(!pullbackOk) return 'No low-risk entry is available yet.';
      if(!bounceAccepted) return 'Bounce is developing but not confirmed.';
      return '';
    })();
    const applied = !hardBlockReason && bounceState !== 'confirmed';
    const reason = applied
      ? `Provisional plan - waiting for confirmation. Bounce is developing but not confirmed. Evidence: ${[
        originalBounceState !== bounceState ? `adjusted from ${originalBounceState}` : '',
        hasContinuationEvidence ? 'continuation/reclaim evidence' : '',
        pullbackOk ? 'near or recently left a valid zone' : ''
      ].filter(Boolean).join(', ') || 'early bounce state'}.`
      : '';
    return {
      originalBounceState,
      adjustedBounceState:applied ? (['early','attempt'].includes(bounceState) ? bounceState : 'attempt') : bounceState,
      nearEntryProvisionalBounceApplied:applied,
      nearEntryProvisionalBounceReason:reason,
      hasClearInvalidationLevel,
      hasProvisionalPriceablePlan,
      provisionalPlanBlockReason:hardBlockReason,
      pullbackOk,
      bounceAccepted
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
    const provisionalPlan = resolveNearEntryProvisionalPlan(ctx, bouncePriceability);
    const credibleRrValue = numericValueOrNull(ctx.credible_rr);
    const rrValue = numericValueOrNull(ctx.rr);
    const provisionalRrValue = numericValueOrNull(ctx.provisional_rr);
    const structureState = String(ctx.structure_state || '').trim().toLowerCase();
    const bounceState = String(provisionalPlan.adjustedBounceState || bouncePriceability.adjustedBounceState || ctx.bounce_state || '').trim().toLowerCase();
    const pullbackZone = String(ctx.pullback_zone || '').trim().toLowerCase();
    const tradeability = String(ctx.tradeability || '').trim().toLowerCase();
    const planStatus = String(ctx.plan_status || '').trim().toLowerCase();
    const planText = String(ctx.plan_status_text || '').trim().toLowerCase();
    const validTradeability = ['tradable', 'entry', 'ready', 'action_now'].includes(tradeability);
    const hasProvisionalPlan = provisionalPlan.hasProvisionalPriceablePlan === true && !provisionalPlan.provisionalPlanBlockReason;
    const rrPriceable = credibleRrValue !== null
      ? credibleRrValue >= 2
      : ((rrValue !== null && rrValue >= 2) || (provisionalRrValue !== null && provisionalRrValue >= 2));
    const confirmedBounceOk = bounceState === 'confirmed' && !bouncePriceability.unpriceableBlockReason && bouncePriceability.reclaimConfirmed === true;
    const provisionalBounceOk = provisionalPlan.nearEntryProvisionalBounceApplied === true;
    const checks = {
      structure_ok:['strong', 'intact', 'developing_clean'].includes(structureState),
      structure_hard_blocked:['weakening', 'weak', 'broken', 'developing_loose'].includes(structureState),
      bounce_ok:confirmedBounceOk || provisionalBounceOk,
      bounce_hard_blocked:!(confirmedBounceOk || provisionalBounceOk),
      pullback_ok:nearEntryPullbackZoneOk(pullbackZone) || ctx.recently_left_valid_pullback_zone === true,
      pullback_valid:ctx.pullback_valid !== false || provisionalPlan.pullbackOk === true,
      near_entry_pullback_zone_accepted:nearEntryPullbackZoneOk(pullbackZone) || ctx.recently_left_valid_pullback_zone === true,
      near_entry_terminal_block_applied:nearEntryTerminalBlocked(ctx),
      plan_visible:ctx.plan_visible === true || hasProvisionalPlan,
      has_entry:ctx.has_entry === true || numericValueOrNull(ctx.provisional_entry) !== null,
      has_stop:ctx.has_stop === true || numericValueOrNull(ctx.provisional_stop) !== null,
      plan_ok:planStatus === 'valid' || hasProvisionalPlan,
      weak_bounce_plan_text:planText.includes('bounce is not clear enough to price yet') && !hasProvisionalPlan,
      risk_width_ok:ctx.stop_distance_too_wide !== true,
      rr_priceable:rrPriceable,
      tradeability_ok:validTradeability || hasProvisionalPlan,
      below_50_without_reclaim:ctx.price_below_50ma === true && ctx.reclaim_attempt !== true,
      below_200ma:ctx.price_below_200ma === true,
      ma50_below_200ma:ctx.ma50_below_200ma === true,
      volume_blocked:ctx.volume_required === true && String(ctx.volume_state || '').trim().toLowerCase() === 'weak',
      capital_ok:(() => {
        const capitalFit = String(ctx.capital_fit || '').trim().toLowerCase();
        const affordability = String(ctx.affordability || '').trim().toLowerCase();
        return !['too_heavy','too_expensive'].includes(capitalFit) && affordability !== 'not_affordable';
      })(),
      has_clear_invalidation_level:provisionalPlan.hasClearInvalidationLevel === true,
      has_priceable_plan:bouncePriceability.hasPriceablePlan === true,
      has_provisional_priceable_plan:provisionalPlan.hasProvisionalPriceablePlan === true,
      near_entry_provisional_bounce_applied:provisionalPlan.nearEntryProvisionalBounceApplied === true,
      near_entry_provisional_bounce_reason:String(provisionalPlan.nearEntryProvisionalBounceReason || '').trim(),
      original_bounce_state:provisionalPlan.originalBounceState,
      adjusted_bounce_state:provisionalPlan.adjustedBounceState,
      provisional_plan_block_reason:String(provisionalPlan.provisionalPlanBlockReason || '').trim(),
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
    if(checks.near_entry_terminal_block_applied) reasons.push('Terminal avoid/dead state blocks Near Entry.');
    if(!checks.structure_ok) reasons.push('Structure is not strong/intact/developing clean.');
    if(checks.structure_hard_blocked) reasons.push('Structure is weakening or broken.');
    if(!checks.bounce_ok) reasons.push(provisionalPlan.provisionalPlanBlockReason || 'Setup is near Entry, but needs confirmation.');
    if(
      checks.bounce_hard_blocked
      && bouncePriceability.unpriceableBlockReason
      && !hasProvisionalPlan
      && !(provisionalPlan.hasClearInvalidationLevel && /invalidation level/i.test(bouncePriceability.unpriceableBlockReason))
    ) reasons.push(bouncePriceability.unpriceableBlockReason);
    if(!checks.pullback_ok) reasons.push('Pullback must be near the 20MA or 50MA.');
    if(!checks.pullback_valid) reasons.push('Pullback context is invalid.');
    if(!checks.plan_visible) reasons.push('No actionable plan yet.');
    if(!checks.has_entry) reasons.push('Entry is missing from the plan.');
    if(!checks.has_stop) reasons.push('Stop is missing from the plan.');
    if(!checks.has_clear_invalidation_level) reasons.push('No valid invalidation level is available.');
    if(!checks.plan_ok) reasons.push('Plan must be valid to qualify for Near Entry.');
    if(checks.weak_bounce_plan_text) reasons.push('Bounce is not clear enough to price yet.');
    if(!checks.risk_width_ok) reasons.push('Stop distance is too wide to price risk cleanly.');
    if(!checks.rr_priceable) reasons.push('RR or credible RR must be at least 2.0.');
    if(!checks.tradeability_ok) reasons.push('Tradeability is not priceable yet.');
    if(checks.below_50_without_reclaim) reasons.push('Price is below the 50MA with no reclaim attempt.');
    if(checks.below_200ma) reasons.push('Price is below the 200MA.');
    if(checks.ma50_below_200ma) reasons.push('50MA is below the 200MA.');
    if(!checks.capital_ok) reasons.push('Capital fit is impossible at this risk level.');
    if(checks.volume_blocked) reasons.push('Volume is too weak for this gate.');
    const uniqueReasons = reasons.filter((reason, index) => reasons.indexOf(reason) === index);
    return {
      pass:uniqueReasons.length === 0,
      reasons:uniqueReasons,
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
      : [nearEntryGate.pass
        ? (
          nearEntryGate.checks && nearEntryGate.checks.near_entry_provisional_bounce_applied
            ? (nearEntryGate.checks.near_entry_provisional_bounce_reason || 'Provisional plan - waiting for confirmation. Bounce is developing but not confirmed.')
            : (nearEntryGate.checks && nearEntryGate.checks.near_entry_pullback_zone_accepted
              ? 'Recently-left pullback zone accepted for provisional Near Entry.'
              : 'Near Entry gate passed.')
        )
        : 'Near Entry gate failed.'];
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

  function resolveNonTerminalSetupBlocker(ctx = {}){
    const structureState = String(ctx.structureState || '').trim().toLowerCase();
    const trendState = String(ctx.trendState || '').trim().toLowerCase();
    const bounceState = String(ctx.bounceState || '').trim().toLowerCase();
    const stabilisationState = String(ctx.stabilisationState || '').trim().toLowerCase();
    const pullbackZone = String(ctx.pullbackZone || '').trim().toLowerCase();
    const setupLocationState = String(ctx.setupLocationState || '').trim().toLowerCase();
    const priceabilityState = String(ctx.priceabilityState || '').trim().toLowerCase();
    const hasRecoveryAttempt = ctx.reclaimAttempt === true
      || ctx.reclaimsLevel === true
      || ['attempt','early','confirmed'].includes(bounceState);
    const below200ma = ctx.below200ma === true;
    const ma50Below200ma = ctx.ma50Below200ma === true;
    const below50WithoutReclaim = ctx.below50WithoutReclaim === true;
    const hardInvalidation = ctx.hardInvalidation === true;
    const structurallyBrokenLabel = structureState === 'broken' || trendState === 'broken';
    const liveRecoveryEvidence = structurallyBrokenLabel
      && hasRecoveryAttempt
      && !below200ma
      && !ma50Below200ma
      && !below50WithoutReclaim
      && !hardInvalidation;
    if(!liveRecoveryEvidence){
      return {
        applies:false,
        blockerCode:'',
        reason:'',
        structureEligibility:'',
        structureReason:''
      };
    }
    if(priceabilityState === 'unpriceable' || setupLocationState === 'volatile'){
      return {
        applies:true,
        blockerCode:'volatile_not_stabilised',
        reason:'Avoid for now — setup is too volatile to price reliably.',
        structureEligibility:'alive',
        structureReason:'Recovery attempt in progress; structure is not terminally broken.'
      };
    }
    if(setupLocationState === 'extended' || pullbackZone === 'extended'){
      return {
        applies:true,
        blockerCode:'extended_not_priceable',
        reason:'Strong rebound, but price has not stabilised into a clean pullback yet.',
        structureEligibility:'alive',
        structureReason:'Recovery attempt in progress; structure is not terminally broken.'
      };
    }
    if(stabilisationState !== 'clear'){
      return {
        applies:true,
        blockerCode:'recovery_attempt_not_stabilised',
        reason:'Recovery attempt in progress. Wait for price to stabilise before considering entry.',
        structureEligibility:'alive',
        structureReason:'Recovery attempt in progress; structure is not terminally broken.'
      };
    }
    if(!['near_20ma','near_50ma','recently_left_20ma','recently_left_50ma'].includes(pullbackZone)){
      return {
        applies:true,
        blockerCode:'no_clean_pullback_base',
        reason:'No clean pullback base yet. Wait for price to stabilise before considering entry.',
        structureEligibility:'alive',
        structureReason:'Recovery attempt in progress; structure is not terminally broken.'
      };
    }
    return {
      applies:true,
      blockerCode:'recovery_attempt_not_stabilised',
      reason:'Recovery attempt in progress. Wait for price to stabilise before considering entry.',
      structureEligibility:'alive',
      structureReason:'Recovery attempt in progress; structure is not terminally broken.'
    };
  }

  const FALLING_KNIFE_COPY = 'Selling pressure is accelerating - wait for the stock to stabilise before reassessing.';

  function resolveFallingKnifeRisk(ctx = {}){
    const priceVs20 = numericValueOrNull(ctx.priceVs20);
    const priceVs50 = numericValueOrNull(ctx.priceVs50);
    const perf1w = numericValueOrNull(ctx.perf1w);
    const perf1m = numericValueOrNull(ctx.perf1m);
    const setupScore = numericValueOrNull(ctx.setupScore);
    const structureEligibility = String(ctx.structureEligibility || '').trim().toLowerCase();
    const structureState = String(ctx.structureState || '').trim().toLowerCase();
    const stabilisationState = String(ctx.stabilisationState || '').trim().toLowerCase();
    const priceabilityState = String(ctx.priceabilityState || '').trim().toLowerCase();
    const tradeability = String(ctx.tradeability || '').trim().toLowerCase();
    const reclaimSignals = Number.isFinite(Number(ctx.reclaimSignals)) ? Number(ctx.reclaimSignals) : 0;
    const below20 = ctx.priceBelow20ma === true;
    const below50 = ctx.priceBelow50ma === true || ctx.below50WithoutReclaim === true;
    const below50WithoutReclaim = ctx.below50WithoutReclaim === true;
    const materiallyBelow20 = priceVs20 !== null && priceVs20 <= -0.07;
    const materiallyBelow50 = priceVs50 !== null && priceVs50 <= -0.05;
    const severeWeeklyDrop = perf1w !== null && perf1w <= -6;
    const severeMonthlyDrop = perf1m !== null && perf1m <= -12 && (perf1w === null || perf1w <= -2);
    const largeBearishCandleDetected = ctx.largeBearishCandleDetected === true || severeWeeklyDrop;
    const recentDownsideExpansion = largeBearishCandleDetected || severeWeeklyDrop || severeMonthlyDrop || (materiallyBelow20 && materiallyBelow50);
    const noReclaim = below50WithoutReclaim && reclaimSignals === 0;
    const failedStabilisation = !stabilisationState || ['none','failed','unconfirmed','weak'].includes(stabilisationState);
    const noReliablePlan = ctx.planOk !== true
      && (
        ctx.hasClearInvalidationLevel !== true
        || ctx.tradeabilityOk !== true
        || ctx.rrOk !== true
        || priceabilityState === 'unpriceable'
        || ['not_ready','invalid','watch','risk_only'].includes(tradeability)
      );
    const weakQuality = (setupScore !== null && setupScore <= 3)
      || structureEligibility === 'damaged'
      || ['weak','weakening','developing_loose','failed'].includes(structureState);
    const detected = below20
      && below50
      && noReclaim
      && failedStabilisation
      && noReliablePlan
      && weakQuality
      && recentDownsideExpansion;
    return {
      detected,
      reason:detected
        ? 'accelerating selling below the MA cluster with no reclaim or priceable plan'
        : '',
      copyKey:detected ? 'falling_knife' : '',
      copy:detected ? FALLING_KNIFE_COPY : '',
      priceVs20,
      priceVs50,
      recentDownsideExpansion,
      largeBearishCandleDetected,
      reclaimSignals,
      stabilisationState,
      hasClearInvalidationLevel:ctx.hasClearInvalidationLevel === true,
      tradeability,
      setupScore
    };
  }

  function resolveWatchlistViability(ctx = {}){
    const structureEligibility = String(ctx.structureEligibility || '').toLowerCase();
    const structureState = String(ctx.structureState || '').toLowerCase();
    const bounceState = String(ctx.bounceState || '').toLowerCase();
    const setupLocationState = String(ctx.setupLocationState || '').toLowerCase();
    const priceabilityState = String(ctx.priceabilityState || '').toLowerCase();
    const priceabilityInferred = ctx.priceabilityInferred === true;
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
    const hardTrendBroken = ctx.hardTrendBroken === true;
    const terminalAvoidFlag = ctx.terminalAvoidFlag === true;
    const explicitInvalidationReason = String(ctx.explicitInvalidationReason || '').trim().toLowerCase();
    const hasExplicitInvalidation = !!(explicitInvalidationReason && explicitInvalidationReason !== '(none)');
    const bounceKnown = !!(bounceState && !['n/a','na','unknown','none_available'].includes(bounceState));
    const structureKnown = !!(structureEligibility && !['n/a','na','unknown'].includes(structureEligibility));
    const setupScoreKnown = numericValueOrNull(ctx.setupScore) !== null;
    const pullbackKnown = !!(pullbackZone && !['n/a','na','unknown'].includes(pullbackZone));
    const planInputsKnown = !!(
      String(ctx.planStatusKey || '').trim()
      || ctx.planOk === true
      || ctx.hasEntry === true
      || ctx.hasStop === true
      || ctx.hasTarget === true
    );
    const inputCompleteness = {
      bounceState:bounceKnown,
      structure:structureKnown,
      setupScore:setupScoreKnown,
      pullbackContext:pullbackKnown,
      planInputs:planInputsKnown
    };
    const incompleteInputCount = Object.values(inputCompleteness).filter(flag => flag !== true).length;
    const incompleteInputs = incompleteInputCount > 0;
    const hardInvalidation = structureEligibility === 'broken' || hardTrendBroken || terminalAvoidFlag || hasExplicitInvalidation;
    const defaultLowPriorityBucket = structureEligibility === 'damaged' || bounceEarly ? 'diminishing' : 'monitor';
    const baseViabilityInputs = {
      structureEligibility,
      structureState,
      setupLocationState,
      priceabilityState,
      priceabilityInferred,
      priceabilityInferenceReason:String(ctx.priceabilityInferenceReason || '').trim(),
      bounceState,
      hasUsefulBounce:bounceUseful,
      planStateKey:String(ctx.planStatusKey || '').toLowerCase(),
      planValid:planOk,
      tradeabilityOk,
      rrOk,
      rrKnown:credibleRrValue !== null,
      resolvedRR:credibleRrValue,
      setupScore,
      pullbackZone,
      below50WithoutReclaim:ctx.below50WithoutReclaim === true,
      below200ma:ctx.below200ma === true,
      ma50Below200ma:ctx.ma50Below200ma === true,
      hardInvalidation,
      explicitInvalidationReason:explicitInvalidationReason || '',
      inputCompleteness,
      rejectBlockedByIncompleteInputs:false
    };
    const enrich = (result) => {
      const base = result && typeof result === 'object' ? result : {};
      const rejectBlockedByIncompleteInputs = base.viability === 'reject' && incompleteInputs && !hardInvalidation;
      const viabilityInputs = {
        ...baseViabilityInputs,
        rejectBlockedByIncompleteInputs
      };
      if(rejectBlockedByIncompleteInputs){
        return {
          viability:'low_priority',
          viabilityReason:'Inputs incomplete - refresh before final avoid.',
          mainBlocker:'Inputs incomplete - refresh before final avoid.',
          rejectReason:'',
          visualBucket:defaultLowPriorityBucket,
          inputCompleteness,
          rejectBlockedByIncompleteInputs:true,
          viabilityBranchId:'incomplete_inputs_softened_low_priority',
          viabilityBranchLabel:'Incomplete inputs softened to low priority',
          viabilityBranchReason:'Reject softened because inputs are incomplete and no hard invalidation is present.',
          viabilityInputs,
          originalViabilityBranchId:base.viabilityBranchId || ''
        };
      }
      return {
        ...base,
        visualBucket:base.viability === 'reject' ? 'avoid' : (base.visualBucket || defaultLowPriorityBucket),
        inputCompleteness,
        rejectBlockedByIncompleteInputs:false,
        viabilityInputs
      };
    };
    const withBranch = (result, branchId, branchLabel, branchReason) => ({
      ...result,
      viabilityBranchId:branchId,
      viabilityBranchLabel:branchLabel,
      viabilityBranchReason:branchReason || result.viabilityReason || result.mainBlocker || ''
    });
    const asReject = (viabilityReason, mainBlocker, rejectReason, branchId, branchLabel) => withBranch({
      viability:'reject',
      viabilityReason,
      mainBlocker,
      rejectReason:String(rejectReason || viabilityReason || mainBlocker || 'Rejected by viability gate.')
    }, branchId, branchLabel, viabilityReason);
    const asLowPriority = (viabilityReason, mainBlocker, branchId, branchLabel) => withBranch({
      viability:'low_priority',
      viabilityReason,
      mainBlocker,
      rejectReason:''
    }, branchId, branchLabel, viabilityReason);
    const asWatchlist = (viabilityReason, mainBlocker, branchId, branchLabel) => withBranch({
      viability:'watchlist',
      viabilityReason,
      mainBlocker,
      rejectReason:''
    }, branchId, branchLabel, viabilityReason);

    if(structureEligibility === 'broken'){
      return enrich(asReject(
        'Setup no longer viable - structure is broken.',
        'Structure is broken.',
        'structure_broken',
        'broken_structure_reject',
        'Broken structure reject'
      ));
    }
    const fallingKnife = resolveFallingKnifeRisk(ctx);
    if(fallingKnife.detected){
      const fallingKnifeReject = asReject(
        FALLING_KNIFE_COPY,
        FALLING_KNIFE_COPY,
        'falling_knife',
        'falling_knife_reject',
        'Falling knife reject'
      );
      fallingKnifeReject.fallingKnife = fallingKnife;
      fallingKnifeReject.semanticBlockerCode = 'falling_knife';
      return enrich(fallingKnifeReject);
    }
    if(isExtended && structureEligibility === 'alive'){
      return enrich(asLowPriority(
        'Trend is strong but extended beyond a safe entry zone.',
        'No low-risk entry is available yet.',
        'extended_alive_low_priority',
        'Extended alive low priority'
      ));
    }
    if(structureEligibility === 'alive' && priceabilityState === 'unpriceable' && !priceabilityInferred){
      return enrich(asLowPriority(
        'Strong trend, but too volatile to price reliably.',
        'Strong trend, but too volatile to price reliably.',
        'alive_unpriceable_low_priority',
        'Alive unpriceable low priority'
      ));
    }
    if(structureEligibility === 'damaged' && noBounce && !planOk && setupScore < 5){
      return enrich(asReject(
        'Setup no longer viable - structure is weakening.',
        'Trend is weakening - no reliable stop level yet.',
        'damaged_no_bounce_no_plan_low_score',
        'damaged_no_bounce_no_plan_low_score_reject',
        'Damaged, no bounce, no plan, low score reject'
      ));
    }
    if(structureEligibility === 'damaged' && !tradeabilityOk && !rrOk){
      if(bounceUseful || setupScore >= 5){
        return enrich(asLowPriority(
          'Weakening setup - wait for recovery.',
          'Trend is weakening - no reliable stop level yet.',
          'damaged_tradeability_rr_fail_softened_low_priority',
          'Damaged tradeability/RR failure softened to low priority'
        ));
      }
      return enrich(asReject(
        'No bounce and no valid plan.',
        'Trend is weakening - no reliable stop level yet.',
        'damaged_not_tradeable_no_rr_no_recovery',
        'damaged_tradeability_rr_fail_reject',
        'Damaged tradeability/RR failure reject'
      ));
    }
    if(setupScore < 5 && noBounce){
      return enrich(asReject(
        'Setup has slipped below watchlist quality.',
        'No bounce confirmation yet.',
        'low_score_no_bounce',
        'low_score_no_bounce_reject',
        'Low score with no bounce reject'
      ));
    }
    if(planInvalidLabel && !viableRrExists && !bounceUseful){
      if(structureEligibility === 'alive' && !hardInvalidation){
        return enrich(asWatchlist(
          'Structurally alive - waiting for confirmation.',
          'No bounce confirmation yet.',
          'alive_invalid_plan_no_bounce_watchlist',
          'Alive invalid plan no bounce watchlist'
        ));
      }
      if(structureEligibility === 'damaged' && !hardInvalidation){
        return enrich(asLowPriority(
          'Weakening setup - monitor only if it improves.',
          'Trend is weakening - no reliable stop level yet.',
          'damaged_invalid_plan_no_bounce_low_priority',
          'Damaged invalid plan no bounce low priority'
        ));
      }
      return enrich(asReject(
        'No bounce and no valid plan.',
        'Invalid plan with no credible RR.',
        'invalid_plan_no_rr_no_bounce',
        'invalid_plan_no_rr_no_bounce_reject',
        'Invalid plan with no RR and no bounce reject'
      ));
    }

    if(structureEligibility === 'damaged' && bounceEarly){
      return enrich(asLowPriority(
        'Weakening setup - monitor only if it improves.',
        'Trend is weakening - no reliable stop level yet.',
        'damaged_with_early_bounce_low_priority',
        'Damaged structure with early bounce low priority'
      ));
    }
    if(setupScore >= 5 && setupScore < 7 && (pullbackOk || bounceEarly || structureEligibility !== 'broken')){
      return enrich(asLowPriority(
        'Low-priority watch - needs structure repair.',
        structureEligibility === 'damaged'
          ? 'Trend is weakening - no reliable stop level yet.'
          : (noBounce ? 'No bounce confirmation yet.' : 'Conditions are not strong enough for active focus.'),
        'mid_score_context_low_priority',
        'Mid-score contextual low priority'
      ));
    }

    if(structureEligibility === 'alive' && (pullbackOk || bounceEarly || setupScore >= 7)){
      return enrich(asWatchlist(
        'Structurally alive - waiting for confirmation.',
        noBounce ? 'No bounce confirmation yet.' : 'Needs confirmation before promotion.',
        'alive_watchlist',
        'Alive watchlist'
      ));
    }

    return enrich(asLowPriority(
      'Conditions are not strong enough for active focus.',
      structureEligibility === 'damaged'
        ? 'Trend is weakening - no reliable stop level yet.'
        : (noBounce ? 'No bounce confirmation yet.' : 'No pullback structure to define entry yet.'),
      'fallback_low_priority',
      'Fallback low priority'
    ));
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
    const canonicalSetupScore = typeof deps.canonicalSetupScoreForRecord === 'function'
      ? numericValueOrNull(deps.canonicalSetupScoreForRecord(item))
      : null;
    const setupScore = canonicalSetupScore !== null
      ? canonicalSetupScore
      : deps.setupScoreForRecord(item);
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
    const setupLocationState = String(derivedStates.setupLocationState || '').toLowerCase();
    let priceabilityState = String(derivedStates.priceabilityState || '').toLowerCase();
    let priceabilityInferred = false;
    const volumeRequired = item && item.setup && item.setup.volumeRequired === true;
    const pullbackZone = String(derivedStates.pullbackZone || '').toLowerCase();
    const currentPrice = numericValueOrNull(item && item.marketData && item.marketData.price);
    const sma20 = numericValueOrNull(item && item.marketData && item.marketData.sma20);
    const ma20 = sma20 !== null ? sma20 : numericValueOrNull(item && item.marketData && item.marketData.ma20);
    const priceDistanceFrom20MA = Number.isFinite(currentPrice) && Number.isFinite(ma20) && ma20 !== 0
      ? Math.abs((currentPrice - ma20) / ma20)
      : null;
    const rrValue = numericValueOrNull(displayedPlan && displayedPlan.rewardRisk && displayedPlan.rewardRisk.rrRatio);
    const rawRrValue = numericValueOrNull(rawDisplayedPlan && rawDisplayedPlan.rewardRisk && rawDisplayedPlan.rewardRisk.rrRatio);
    const planEntry = numericValueOrNull(displayedPlan && displayedPlan.entry);
    const planStop = numericValueOrNull(displayedPlan && displayedPlan.stop);
    const planTarget = numericValueOrNull(displayedPlan && displayedPlan.target);
    const rawPlanEntry = numericValueOrNull(rawDisplayedPlan && rawDisplayedPlan.entry);
    const rawPlanStop = numericValueOrNull(rawDisplayedPlan && rawDisplayedPlan.stop);
    const rawPlanTarget = numericValueOrNull(rawDisplayedPlan && rawDisplayedPlan.target);
    const hasEntry = Number.isFinite(planEntry);
    const hasStop = Number.isFinite(planStop);
    const hasTarget = Number.isFinite(planTarget);
    const planVisible = String(displayedPlan && displayedPlan.status || '').toLowerCase() === 'valid';
    const stopDistanceTooWide = String(displayedPlan && displayedPlan.riskFit && displayedPlan.riskFit.risk_status || '').toLowerCase() === 'too_wide';
    const pullbackValid = nearEntryPullbackZoneOk(pullbackZone);
    const planMathProvisionallyPriceable = planVisible
      && hasEntry
      && hasStop
      && hasTarget
      && planEntry > planStop
      && planTarget > planEntry
      && Number.isFinite(rrValue)
      && rrValue >= 2
      && !stopDistanceTooWide
      && pullbackValid;
    let priceabilityInferenceReason = '';
    if(!priceabilityState){
      priceabilityInferred = true;
      if(planVisible && ['tradable', 'entry', 'ready', 'action_now'].includes(tradeabilityState)){
        priceabilityState = 'priceable';
        priceabilityInferenceReason = 'Inferred priceable from valid plan and gate-priceable tradeability.';
      }else if(planMathProvisionallyPriceable){
        priceabilityState = 'provisional';
        priceabilityInferenceReason = 'Inferred provisional from valid plan math while confirmation/tradeability remains pending.';
      }else{
        priceabilityState = 'unpriceable';
        priceabilityInferenceReason = 'Inferred unpriceable because valid priceable plan math is not available.';
      }
    }
    const planStatusText = String(resolved && resolved.blockerReason || '');
    const sma50 = numericValueOrNull(item && item.marketData && item.marketData.sma50);
    const ma50 = sma50 !== null ? sma50 : numericValueOrNull(item && item.marketData && item.marketData.ma50);
    const sma200 = numericValueOrNull(item && item.marketData && item.marketData.sma200);
    const ma200 = sma200 !== null ? sma200 : numericValueOrNull(item && item.marketData && item.marketData.ma200);
    const priceBelow50MA = Number.isFinite(currentPrice) && Number.isFinite(ma50)
      ? currentPrice < ma50
      : false;
    const priceBelow20MA = Number.isFinite(currentPrice) && Number.isFinite(ma20)
      ? currentPrice < ma20
      : false;
    const priceBelow200MA = Number.isFinite(currentPrice) && Number.isFinite(ma200)
      ? currentPrice < ma200
      : false;
    const ma50Below200MA = Number.isFinite(ma50) && Number.isFinite(ma200)
      ? ma50 < ma200
      : false;
    const entryTriggerHit = independentEntryTriggerHit({
      structure_state:structureState,
      trend_state:trendState,
      stabilisation_state:String(derivedStates.stabilisationState || '').toLowerCase(),
      bounce_state:bounceState,
      pullback_zone:pullbackZone,
      current_price:currentPrice,
      entry:planEntry,
      plan_status:planStatusKey,
      breaksLocalHigh:item && item.breaksLocalHigh === true,
      reclaimsLevel:item && item.reclaimsLevel === true,
      strongBullishContinuation:item && item.strongBullishContinuation === true
    });
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
    const capitalFit = String(
      (displayedPlan && displayedPlan.capitalFit && displayedPlan.capitalFit.capital_fit)
      || (rawDisplayedPlan && rawDisplayedPlan.capitalFit && rawDisplayedPlan.capitalFit.capital_fit)
      || ''
    ).toLowerCase();
    const affordability = String((displayedPlan && displayedPlan.affordability) || (rawDisplayedPlan && rawDisplayedPlan.affordability) || '').toLowerCase();
    const semanticBlocker = resolveNonTerminalSetupBlocker({
      structureState,
      trendState,
      bounceState,
      stabilisationState:String(derivedStates.stabilisationState || '').toLowerCase(),
      pullbackZone,
      setupLocationState,
      priceabilityState,
      reclaimAttempt:item && item.reclaimAttempt === true,
      reclaimsLevel:item && item.reclaimsLevel === true,
      below50WithoutReclaim:priceBelow50MA && !(item && (item.reclaimAttempt === true || item.reclaimsLevel === true)),
      below200ma:priceBelow200MA,
      ma50Below200ma:ma50Below200MA,
      hardInvalidation:brokenBelowStop || (item && item.terminal_avoid_applied === true)
    });
    const nonTerminalRecoveryBlocker = semanticBlocker.applies === true;
    const explicitInvalidationFlag = !!(item && item.plan && item.plan.invalidatedState);
    const explicitInvalidationReason = explicitInvalidationFlag && !nonTerminalRecoveryBlocker && (structureState === 'broken' || trendState === 'broken' || brokenBelowStop)
      ? (structureState === 'broken'
        ? 'Structure is broken.'
        : (trendState === 'broken'
          ? 'Trend is broken.'
          : 'Price breached stop structure.'))
      : '';
    const structurallyBroken = !!(
      !nonTerminalRecoveryBlocker
      && (
        structureState === 'broken'
        || trendState === 'broken'
        || brokenBelowStop
      )
    );
    const rawStructureLayer = resolveStructureEligibility({
      structureState,
      trendState,
      brokenBelowStop
    });
    const structureLayer = nonTerminalRecoveryBlocker
      ? {
        structureEligibility:semanticBlocker.structureEligibility || 'alive',
        structureReason:semanticBlocker.structureReason || 'Recovery attempt in progress; structure is not terminally broken.'
      }
      : rawStructureLayer;
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

    const cumulativePenaltyTrace = typeof deps.buildCumulativePenaltyTrace === 'function'
      ? deps.buildCumulativePenaltyTrace(item, {
        derivedStates,
        displayedPlan,
        resolvedContract:resolved,
        displayStage:globalVerdictLabel(finalVerdict)
      })
      : [];
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
      provisional_rr:rawRrValue,
      provisional_entry:rawPlanEntry,
      provisional_stop:rawPlanStop,
      provisional_target:rawPlanTarget,
      current_price:currentPrice,
      trend_state:trendState,
      reclaims_level:item && item.reclaimsLevel === true,
      setup_score:setupScore,
      tradeability:tradeabilityState,
      capital_fit:capitalFit,
      affordability,
      price_below_200ma:priceBelow200MA,
      ma50_below_200ma:ma50Below200MA,
      terminal_avoid_applied:item && item.terminal_avoid_applied === true,
      terminalAvoidFlag:item && item.terminal_avoid_applied === true,
      lifecycle_state:(item && item.lifecycle && item.lifecycle.state) || (item && item.watchlist && item.watchlist.lifecycleState),
      terminal_avoid_source:(item && item.terminal_avoid_source) || (item && item.watchlist && item.watchlist.terminalAvoidSource),
      avoid_trigger_source:(item && item.avoid_trigger_source) || (item && item.watchlist && item.watchlist.avoidTriggerSource),
      dead_trigger_source:structurallyBroken ? 'structure_broken' : '',
      structural_state:structurallyBroken ? 'dead' : String(resolved.structuralState || ''),
      structurally_broken:structurallyBroken
    });
    const nearEntryGateChecks = guardedVerdict.near_entry_gate_checks || {};
    const entryGateChecks = guardedVerdict.entry_gate_checks || {};
    const hasClearInvalidationLevel = nearEntryGateChecks.has_clear_invalidation_level === true
      || entryGateChecks.has_clear_invalidation_level === true;
    const reclaimSignalCount = Number.isFinite(Number(nearEntryGateChecks.reclaim_signal_count))
      ? Number(nearEntryGateChecks.reclaim_signal_count)
      : (Number.isFinite(Number(entryGateChecks.reclaim_signal_count)) ? Number(entryGateChecks.reclaim_signal_count) : 0);
    const reclaimDirectSignalCount = Number.isFinite(Number(nearEntryGateChecks.reclaim_direct_signal_count))
      ? Number(nearEntryGateChecks.reclaim_direct_signal_count)
      : (Number.isFinite(Number(entryGateChecks.reclaim_direct_signal_count)) ? Number(entryGateChecks.reclaim_direct_signal_count) : 0);
    let trackedVerdict = normalizeVerdict(guardedVerdict.final_verdict);
    let trackedReason = guardedVerdict.reason || reason;
    const viability = resolveWatchlistViability({
      structureEligibility:structureLayer.structureEligibility,
      structureState,
      setupLocationState,
      priceabilityState,
      priceabilityInferred,
      priceabilityInferenceReason,
      bounceState,
      pullbackZone,
      setupScore,
      planOk:!invalidPlan,
      rrOk:Number.isFinite(credibleRr) && credibleRr >= 1.5,
      tradeabilityOk:['tradable', 'entry', 'ready', 'action_now'].includes(tradeabilityState),
      volumeOk:volumeState !== 'weak',
      planStatusKey,
      credibleRr,
      isExtended,
      hasEntry,
      hasStop,
      hasTarget,
      hardTrendBroken:!nonTerminalRecoveryBlocker && (trendState === 'broken' || (priceBelow50MA && weakStructure)),
      terminalAvoidFlag:item && item.terminal_avoid_applied === true,
      explicitInvalidationReason,
      below50WithoutReclaim:priceBelow50MA && !(item && (item.reclaimAttempt === true || item.reclaimsLevel === true)),
      priceBelow20ma:priceBelow20MA,
      priceBelow50ma:priceBelow50MA,
      priceVs20:Number.isFinite(currentPrice) && Number.isFinite(ma20) && ma20 !== 0 ? (currentPrice - ma20) / ma20 : null,
      priceVs50:Number.isFinite(currentPrice) && Number.isFinite(ma50) && ma50 !== 0 ? (currentPrice - ma50) / ma50 : null,
      below200ma:priceBelow200MA,
      ma50Below200ma:ma50Below200MA,
      stabilisationState:String(derivedStates.stabilisationState || '').toLowerCase(),
      hasClearInvalidationLevel,
      tradeability:tradeabilityState,
      reclaimSignals:reclaimSignalCount,
      reclaimDirectSignals:reclaimDirectSignalCount,
      perf1w:item && item.marketData && item.marketData.perf1w,
      perf1m:item && item.marketData && item.marketData.perf1m
    });
    if(trackedVerdict !== 'entry' && trackedVerdict !== 'near_entry'){
      if(viability.viability === 'reject'){
        trackedVerdict = 'avoid';
      }else{
        trackedVerdict = 'monitor';
      }
      const alivePoorLocation = structureLayer.structureEligibility === 'alive'
        && ['none','off_level','unclear'].includes(setupLocationState)
        && (priceabilityState === 'unpriceable' || String(viability.viabilityBranchId || '').includes('low_score') || setupScore < 5 || invalidPlan);
      if(nonTerminalRecoveryBlocker){
        trackedReason = semanticBlocker.reason || 'Recovery attempt in progress. Wait for price to stabilise before considering entry.';
      }else if(String(viability.viabilityBranchId || '').toLowerCase().includes('falling_knife')){
        trackedReason = viability.mainBlocker || FALLING_KNIFE_COPY;
      }else if(structureLayer.structureEligibility === 'damaged'){
        trackedReason = 'Trend is weakening - no reliable stop level yet.';
      }else if(isExtended && ['strong','intact'].includes(structureState)){
        trackedReason = 'Trend is strong but extended beyond a safe entry zone. No low-risk entry is available yet.';
      }else if(alivePoorLocation){
        trackedReason = 'Strong trend, but no usable pullback setup yet. Wait for a cleaner reset near support.';
      }else if(structureLayer.structureEligibility === 'alive' && priceabilityState === 'unpriceable' && !priceabilityInferred){
        trackedReason = 'Strong trend, but too volatile to price reliably.';
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
    const canonicalFinalVerdict = normalizeVerdict(finalVerdict);
    const tone = getTone(canonicalFinalVerdict);
    const badge = getBadge(canonicalFinalVerdict);
    const action = getActions(canonicalFinalVerdict);
    const viabilityBranchId = String(viability.viabilityBranchId || '').toLowerCase();
    const deteriorationLowPriority = viability.viability === 'low_priority'
      && (
        structureLayer.structureEligibility === 'damaged'
        || ['weak','weakening','broken','failed','developing_loose'].includes(structureState)
        || setupLocationState === 'volatile'
        || viabilityBranchId.includes('damaged')
        || viabilityBranchId.includes('low_score')
        || viabilityBranchId.includes('failed')
        || viabilityBranchId.includes('recovery')
      );
    const bucket = (canonicalFinalVerdict === 'watch' && deteriorationLowPriority)
      ? 'lower_priority'
      : getBucket(canonicalFinalVerdict);
    const fallingKnifeTrace = viability.fallingKnife || resolveFallingKnifeRisk({
      structureEligibility:structureLayer.structureEligibility,
      structureState,
      priceabilityState,
      planOk:!invalidPlan,
      rrOk:Number.isFinite(credibleRr) && credibleRr >= 1.5,
      tradeabilityOk:['tradable', 'entry', 'ready', 'action_now'].includes(tradeabilityState),
      tradeability:tradeabilityState,
      setupScore,
      stabilisationState:String(derivedStates.stabilisationState || '').toLowerCase(),
      below50WithoutReclaim:priceBelow50MA && !(item && (item.reclaimAttempt === true || item.reclaimsLevel === true)),
      priceBelow20ma:priceBelow20MA,
      priceBelow50ma:priceBelow50MA,
      priceVs20:Number.isFinite(currentPrice) && Number.isFinite(ma20) && ma20 !== 0 ? (currentPrice - ma20) / ma20 : null,
      priceVs50:Number.isFinite(currentPrice) && Number.isFinite(ma50) && ma50 !== 0 ? (currentPrice - ma50) / ma50 : null,
      hasClearInvalidationLevel,
      reclaimSignals:reclaimSignalCount,
      perf1w:item && item.marketData && item.marketData.perf1w,
      perf1m:item && item.marketData && item.marketData.perf1m
    });
    const fallingKnifeApplied = String(viability.viabilityBranchId || '').toLowerCase().includes('falling_knife');
    if(fallingKnifeApplied || (item && item.debugFallingKnifeTrace === true)){
      logDiagnosticTrace('PP_DEBUG_FALLING_KNIFE', '[FALLING_KNIFE_TRACE]', {
        ticker:String(item.ticker || item.symbol || '').trim().toUpperCase(),
        detected:fallingKnifeApplied,
        reason:fallingKnifeTrace.reason || '',
        finalVerdict:canonicalFinalVerdict,
        visualBucket:canonicalFinalVerdict === 'avoid' ? 'avoid' : bucket,
        presentationBucket:canonicalFinalVerdict === 'avoid' ? 'avoid' : bucket,
        tone,
        priceVs20:fallingKnifeTrace.priceVs20,
        priceVs50:fallingKnifeTrace.priceVs50,
        recentDownsideExpansion:fallingKnifeTrace.recentDownsideExpansion === true,
        largeBearishCandleDetected:fallingKnifeTrace.largeBearishCandleDetected === true,
        reclaimSignals:fallingKnifeTrace.reclaimSignals,
        stabilisationState:fallingKnifeTrace.stabilisationState,
        hasClearInvalidationLevel:fallingKnifeTrace.hasClearInvalidationLevel === true,
        tradeability:fallingKnifeTrace.tradeability || tradeabilityState,
        setupScore:fallingKnifeTrace.setupScore,
        copyKey:fallingKnifeTrace.copyKey || ''
      }, {key:`falling-knife:${String(item.ticker || item.symbol || '').trim().toUpperCase()}`, minIntervalMs:1500});
    }
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
      final_verdict:canonicalFinalVerdict,
      tone,
      toneClass:`tone-${tone}`,
      borderClass:`tone-${tone}`,
      backgroundClass:`tone-${tone}`,
      badgeToneClass:`badge-tone-${tone}`,
      scoreClass:Number.isFinite(setupScore) ? deps.scannerScoreGradientClass(setupScore) : '',
      bucket,
      badge,
      action,
      lifecycle:lifecycleMap[canonicalFinalVerdict] || 'watchlist',
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
      finalVerdictAfterPresentation:canonicalFinalVerdict,
      presentationDowngradeApplied:normalizeVerdict(guardedVerdict.final_verdict) !== canonicalFinalVerdict,
      presentationUpgradeBlocked,
      setup_score:Number.isFinite(setupScore) ? setupScore : null,
      priority_score_adjustment:isExtended ? -0.35 : 0,
      is_extended:isExtended,
      setup_location_state:setupLocationState,
      priceability_state:priceabilityState,
      priceability_inferred:priceabilityInferred,
      priceability_inference_reason:priceabilityInferenceReason,
      semantic_blocker_code:(fallingKnifeApplied ? 'falling_knife' : (semanticBlocker.blockerCode || '')),
      semantic_blocker_reason:(fallingKnifeApplied ? FALLING_KNIFE_COPY : (semanticBlocker.reason || '')),
      falling_knife_detected:fallingKnifeApplied,
      falling_knife_reason:fallingKnifeApplied ? (fallingKnifeTrace.reason || '') : '',
      falling_knife_trace:fallingKnifeApplied
        ? fallingKnifeTrace
        : {
          ...fallingKnifeTrace,
          detected:false,
          reason:'',
          copyKey:'',
          copy:''
        },
      non_terminal_recovery_blocker:nonTerminalRecoveryBlocker,
      structure_eligibility:structureLayer.structureEligibility,
      structure_reason:structureLayer.structureReason,
      viability:viability.viability,
      viability_reason:viability.viabilityReason,
      viabilityBranchId:viability.viabilityBranchId || '',
      viabilityBranchLabel:viability.viabilityBranchLabel || '',
      viabilityBranchReason:viability.viabilityBranchReason || '',
      viabilityInputs:viability.viabilityInputs || null,
      originalViabilityBranchId:viability.originalViabilityBranchId || '',
      reject_reason:viability.rejectReason || '',
      input_completeness:viability.inputCompleteness || null,
      reject_blocked_by_incomplete_inputs:viability.rejectBlockedByIncompleteInputs === true,
      viability_visual_bucket:viability.visualBucket || '',
      main_blocker:trackedReason || viability.mainBlocker || '',
      primary_blocker_source:fallingKnifeApplied
        ? 'falling_knife'
        : ((resolved && resolved.primaryBlockerSource) || (structureLayer.structureEligibility === 'damaged' ? 'structure' : (isExtended ? 'setup_location' : (priceabilityState === 'unpriceable' && !priceabilityInferred ? 'priceability' : 'resolver')))),
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
      hasClearInvalidationLevel,
      hasPriceablePlan:!!(
        guardedVerdict.near_entry_gate_checks && guardedVerdict.near_entry_gate_checks.has_priceable_plan
      ),
      originalBounceState:(
        guardedVerdict.near_entry_gate_checks && guardedVerdict.near_entry_gate_checks.original_bounce_state
      ) || (
        guardedVerdict.entry_gate_checks && guardedVerdict.entry_gate_checks.original_bounce_state
      ) || bounceState || '',
      adjustedBounceState:(
        guardedVerdict.near_entry_gate_checks && guardedVerdict.near_entry_gate_checks.adjusted_bounce_state
      ) || (
        guardedVerdict.entry_gate_checks && guardedVerdict.entry_gate_checks.adjusted_bounce_state
      ) || bounceState || '',
      nearEntryProvisionalBounceApplied:!!(
        guardedVerdict.near_entry_gate_checks && guardedVerdict.near_entry_gate_checks.near_entry_provisional_bounce_applied
      ),
      nearEntryPullbackZoneAccepted:!!(
        guardedVerdict.near_entry_gate_checks && guardedVerdict.near_entry_gate_checks.near_entry_pullback_zone_accepted
      ),
      nearEntryTerminalBlockApplied:!!(
        guardedVerdict.near_entry_gate_checks && guardedVerdict.near_entry_gate_checks.near_entry_terminal_block_applied
      ),
      nearEntryProvisionalBounceReason:String(
        guardedVerdict.near_entry_gate_checks && guardedVerdict.near_entry_gate_checks.near_entry_provisional_bounce_reason || ''
      ).trim(),
      hasProvisionalPriceablePlan:!!(
        guardedVerdict.near_entry_gate_checks && guardedVerdict.near_entry_gate_checks.has_provisional_priceable_plan
      ),
      provisionalPlanBlockReason:String(
        guardedVerdict.near_entry_gate_checks && guardedVerdict.near_entry_gate_checks.provisional_plan_block_reason || ''
      ).trim(),
      unpriceableBlockReason:(
        (guardedVerdict.near_entry_gate_checks && guardedVerdict.near_entry_gate_checks.unpriceable_block_reason)
        || (guardedVerdict.entry_gate_checks && guardedVerdict.entry_gate_checks.unpriceable_block_reason)
        || ''
      ),
      reclaimSignalCount,
      reclaimDirectSignalCount,
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
      cumulativePenaltyTrace,
      tracked:isTracked,
      source:'resolver',
      debugToneSource:({
        dead:'terminal_dead',
        avoid:'weak_or_non_tradeable',
        watch:'watch_state',
        monitor:'monitor_state',
        near_entry:'near_entry_state',
        entry:'ready_state'
      })[canonicalFinalVerdict] || 'watch_state',
      resolved
    };
  }

  function runTradeReadinessGateAssertions(){
    const cases = [
      {
        id:'alive-invalid-plan-no-rr-no-bounce-watchlist',
        viability:{
          structureEligibility:'alive',
          structureState:'intact',
          bounceState:'none',
          pullbackZone:'near_50ma',
          setupScore:6,
          planOk:false,
          planStatusKey:'invalid',
          rrOk:false,
          credibleRr:null,
          tradeabilityOk:false,
          hasEntry:false,
          hasStop:false,
          hasTarget:false,
          hardTrendBroken:false,
          terminalAvoidFlag:false,
          explicitInvalidationReason:''
        },
        expect:{viability:'watchlist', branch:'alive_invalid_plan_no_bounce_watchlist'}
      },
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
      },
      {
        id:'E',
        ctx:{
          structure_state:'developing_clean',
          trend_state:'intact',
          stabilisation_state:'early',
          bounce_state:'attempt',
          plan_visible:false,
          has_entry:false,
          has_stop:false,
          has_target:false,
          plan_status:'needs_adjustment',
          plan_status_text:'Bounce is not clear enough to price yet.',
          pullback_zone:'near_20ma',
          stop_distance_too_wide:false,
          provisional_entry:100,
          provisional_stop:97,
          provisional_target:106,
          provisional_rr:2,
          current_price:99.5,
          market_regime:'supportive',
          volume_state:'normal',
          tradeability:'watch',
          entry_trigger_hit:false,
          reclaim_attempt:true,
          price_below_200ma:false,
          ma50_below_200ma:false,
          capital_fit:'acceptable'
        },
        expect:{near:true, entry:false}
      },
      {
        id:'DINO-late-extension',
        ctx:{
          structure_state:'strong',
          trend_state:'intact',
          stabilisation_state:'early',
          bounce_state:'none',
          plan_visible:false,
          has_entry:true,
          has_stop:true,
          has_target:true,
          plan_status:'needs_adjustment',
          plan_status_text:'Bounce is not clear enough to price yet.',
          pullback_zone:'extended',
          pullback_valid:false,
          stop_distance_too_wide:false,
          provisional_entry:62.73,
          provisional_stop:56.58,
          provisional_target:81.19,
          provisional_rr:3.0,
          current_price:71.08,
          market_regime:'supportive',
          volume_state:'supportive',
          tradeability:'watch',
          entry_trigger_hit:false,
          reclaim_attempt:true,
          price_below_200ma:false,
          ma50_below_200ma:false,
          capital_fit:'acceptable'
        },
        expect:{near:false, entry:false}
      },
      {
        id:'DINO-developing-continuation',
        ctx:{
          structure_state:'developing_clean',
          trend_state:'intact',
          stabilisation_state:'early',
          bounce_state:'none',
          plan_visible:false,
          has_entry:true,
          has_stop:true,
          has_target:true,
          plan_status:'needs_adjustment',
          plan_status_text:'Bounce is not clear enough to price yet.',
          pullback_zone:'recently_left_20ma',
          stop_distance_too_wide:false,
          provisional_entry:62.73,
          provisional_stop:56.58,
          provisional_target:81.19,
          provisional_rr:3.0,
          current_price:63.2,
          market_regime:'supportive',
          volume_state:'supportive',
          tradeability:'watch',
          entry_trigger_hit:false,
          reclaim_attempt:true,
          price_below_200ma:false,
          ma50_below_200ma:false,
          capital_fit:'acceptable'
        },
        expect:{near:true, entry:false}
      },
      {
        id:'DINO-developing-continuation-terminal-block',
        ctx:{
          structure_state:'developing_clean',
          trend_state:'intact',
          stabilisation_state:'early',
          bounce_state:'none',
          plan_visible:false,
          has_entry:true,
          has_stop:true,
          has_target:true,
          plan_status:'needs_adjustment',
          plan_status_text:'Bounce is not clear enough to price yet.',
          pullback_zone:'recently_left_20ma',
          stop_distance_too_wide:false,
          provisional_entry:62.73,
          provisional_stop:56.58,
          provisional_target:81.19,
          provisional_rr:3.0,
          current_price:63.2,
          market_regime:'supportive',
          volume_state:'supportive',
          tradeability:'watch',
          entry_trigger_hit:false,
          reclaim_attempt:true,
          price_below_200ma:false,
          ma50_below_200ma:false,
          capital_fit:'acceptable',
          terminal_avoid_applied:true
        },
        expect:{near:false, entry:false}
      }
    ];
    const buildResolverDepsForAssertions = () => ({
      resolveFinalStateContract(item){
        return item && item.resolvedContract || {
          finalVerdict:'Watch',
          structuralState:'developing',
          actionStateKey:'wait_for_confirmation',
          planStatusKey:'valid',
          tradeabilityVerdict:'Watch',
          blockerReason:'Needs stronger confirmation',
          reasonSummary:'Needs stronger confirmation',
          terminal:false,
          baseVerdict:'watch'
        };
      },
      resolvePreLifecycleStateContract(item){
        return item && item.preLifecycleResolved || item && item.resolvedContract || {
          finalVerdict:'Watch',
          structuralState:'developing',
          actionStateKey:'wait_for_confirmation',
          planStatusKey:'valid',
          tradeabilityVerdict:'Watch',
          blockerReason:'Needs stronger confirmation',
          reasonSummary:'Needs stronger confirmation',
          terminal:false,
          baseVerdict:'watch'
        };
      },
      baseVerdictFromResolvedContract(resolved){
        return normalizeVerdict(resolved && (resolved.baseVerdict || resolved.finalVerdict || resolved.tradeabilityVerdict || 'watch'));
      },
      analysisDerivedStatesFromRecord(item){
        return item && item.derivedStates || {};
      },
      effectivePlanForRecord(item){
        return item && item.effectivePlan || item && item.plan || {};
      },
      applySetupConfirmationPlanGate(item, displayedPlan){
        return item && item.displayedPlan || displayedPlan || {};
      },
      deriveCurrentPlanState(entry, stop, target){
        const safeEntry = numericValueOrNull(entry);
        const safeStop = numericValueOrNull(stop);
        const safeTarget = numericValueOrNull(target);
        const rrRatio = Number.isFinite(safeEntry) && Number.isFinite(safeStop) && Number.isFinite(safeTarget) && safeEntry > safeStop
          ? (safeTarget - safeEntry) / (safeEntry - safeStop)
          : null;
        return {
          status:Number.isFinite(safeEntry) && Number.isFinite(safeStop) && Number.isFinite(safeTarget) ? 'valid' : 'missing',
          entry:safeEntry,
          stop:safeStop,
          target:safeTarget,
          tradeability:Number.isFinite(rrRatio) && rrRatio >= 2 ? 'tradable' : 'watch',
          rewardRisk:{rrRatio},
          riskFit:{risk_status:'acceptable'},
          affordability:'acceptable',
          capitalFit:{capital_fit:'acceptable'}
        };
      },
      evaluatePlanRealism(){
        return null;
      },
      setupScoreForRecord(item){
        const displayScore = numericValueOrNull(item && item.displayScore);
        const setupScore = numericValueOrNull(item && item.setupScore);
        return displayScore !== null ? displayScore : (setupScore !== null ? setupScore : 0);
      },
      canonicalSetupScoreForRecord(item){
        const baseScore = numericValueOrNull(item && item.baseScore);
        const setupScore = numericValueOrNull(item && item.setupScore);
        return baseScore !== null ? baseScore : (setupScore !== null ? setupScore : 0);
      },
      buildCumulativePenaltyTrace(item){
        return item && item.cumulativePenaltyTrace && Array.isArray(item.cumulativePenaltyTrace.sources)
          ? item.cumulativePenaltyTrace
          : {sources:[]};
      },
      isHostileMarketStatus(status){
        const safe = String(status || '').trim().toLowerCase();
        return safe === 'weak' || safe === 'hostile' || safe.includes('below 50');
      },
      state:{marketStatus:'supportive'},
      scannerScoreGradientClass(){
        return '';
      }
    });
    const resolverCases = [
      {
        id:'soft-caution-alone-cannot-force-terminal-avoid',
        record:{
          setupScore:7,
          baseScore:7,
          displayScore:5,
          meta:{marketStatus:'weak'},
          derivedStates:{
            structureState:'intact',
            trendState:'intact',
            bounceState:'attempt',
            stabilisationState:'early',
            volumeState:'normal',
            pullbackZone:'near_50ma',
            setupLocationState:'constructive',
            priceabilityState:'provisional'
          },
          effectivePlan:{entry:100, stop:97, firstTarget:106},
          displayedPlan:{
            status:'valid',
            entry:100,
            stop:97,
            target:106,
            tradeability:'watch',
            rewardRisk:{rrRatio:2},
            riskFit:{risk_status:'acceptable'},
            affordability:'acceptable',
            capitalFit:{capital_fit:'acceptable'}
          },
          resolvedContract:{
            finalVerdict:'Watch',
            structuralState:'developing',
            actionStateKey:'wait_for_confirmation',
            planStatusKey:'valid',
            tradeabilityVerdict:'Watch',
            blockerReason:'Needs stronger confirmation',
            reasonSummary:'Needs stronger confirmation',
            terminal:false,
            baseVerdict:'watch'
          },
          cumulativePenaltyTrace:{sources:[
            {id:'weak_market_tape', category:'soft_caution', severity:'medium', terminal:false, present:true, possibleWhere:['canonical_verdict'], appliedWhere:['canonical_verdict'], canonicalImpact:true, displayImpact:false, skippedReason:null},
            {id:'bounce_unconfirmed', category:'soft_caution', severity:'low', terminal:false, present:true, possibleWhere:['canonical_verdict'], appliedWhere:['canonical_verdict'], canonicalImpact:true, displayImpact:false, skippedReason:null}
          ]}
        },
        assert(result){
          return result.final_verdict !== 'avoid'
            && result.final_verdict !== 'dead'
            && result.structure_eligibility === 'alive'
            && result.viability !== 'reject';
        }
      },
      {
        id:'multiple-soft-cautions-cannot-kill-intact-setup',
        record:{
          setupScore:6,
          baseScore:6,
          displayScore:3,
          meta:{marketStatus:'weak'},
          derivedStates:{
            structureState:'intact',
            trendState:'intact',
            bounceState:'none',
            stabilisationState:'early',
            volumeState:'weak',
            pullbackZone:'near_50ma',
            setupLocationState:'constructive',
            priceabilityState:'unpriceable'
          },
          effectivePlan:{entry:100, stop:97, firstTarget:106},
          displayedPlan:{
            status:'valid',
            entry:100,
            stop:97,
            target:106,
            tradeability:'watch',
            rewardRisk:{rrRatio:2},
            riskFit:{risk_status:'acceptable'},
            affordability:'acceptable',
            capitalFit:{capital_fit:'acceptable'}
          },
          resolvedContract:{
            finalVerdict:'Watch',
            structuralState:'developing',
            actionStateKey:'wait_for_confirmation',
            planStatusKey:'valid',
            tradeabilityVerdict:'Watch',
            blockerReason:'Needs stronger confirmation',
            reasonSummary:'Needs stronger confirmation',
            terminal:false,
            baseVerdict:'watch'
          },
          cumulativePenaltyTrace:{sources:[
            {id:'weak_market_tape', category:'soft_caution', severity:'medium', terminal:false, present:true, possibleWhere:['canonical_verdict'], appliedWhere:['canonical_verdict'], canonicalImpact:true, displayImpact:false, skippedReason:null},
            {id:'weak_volume', category:'soft_caution', severity:'medium', terminal:false, present:true, possibleWhere:['canonical_verdict'], appliedWhere:['canonical_verdict'], canonicalImpact:true, displayImpact:false, skippedReason:null},
            {id:'no_bounce_confirmation', category:'soft_caution', severity:'medium', terminal:false, present:true, possibleWhere:['canonical_verdict'], appliedWhere:['canonical_verdict'], canonicalImpact:true, displayImpact:false, skippedReason:null},
            {id:'early_stabilisation', category:'soft_caution', severity:'low', terminal:false, present:true, possibleWhere:['canonical_verdict'], appliedWhere:['canonical_verdict'], canonicalImpact:true, displayImpact:false, skippedReason:null}
          ]}
        },
        assert(result){
          const marketTraceCount = (((result.cumulativePenaltyTrace || {}).sources) || []).filter(entry => entry && entry.id === 'weak_market_tape').length;
          return result.final_verdict !== 'avoid'
            && result.final_verdict !== 'dead'
            && result.structure_eligibility === 'alive'
            && result.viability !== 'reject'
            && marketTraceCount === 1;
        }
      },
      {
        id:'valid-maths-intact-structure-remains-monitor-floor',
        record:{
          setupScore:5,
          baseScore:5,
          displayScore:2,
          derivedStates:{
            structureState:'intact',
            trendState:'intact',
            bounceState:'attempt',
            stabilisationState:'early',
            volumeState:'normal',
            pullbackZone:'near_20ma',
            setupLocationState:'constructive',
            priceabilityState:'priceable'
          },
          effectivePlan:{entry:50, stop:48, firstTarget:55},
          displayedPlan:{
            status:'valid',
            entry:50,
            stop:48,
            target:55,
            tradeability:'watch',
            rewardRisk:{rrRatio:2.5},
            riskFit:{risk_status:'acceptable'},
            affordability:'acceptable',
            capitalFit:{capital_fit:'acceptable'}
          },
          resolvedContract:{
            finalVerdict:'Watch',
            structuralState:'developing',
            actionStateKey:'wait_for_confirmation',
            planStatusKey:'valid',
            tradeabilityVerdict:'Watch',
            blockerReason:'Needs stronger confirmation',
            reasonSummary:'Needs stronger confirmation',
            terminal:false,
            baseVerdict:'watch'
          }
        },
        assert(result){
          return ['watch', 'monitor'].includes(result.final_verdict)
            && result.final_verdict !== 'avoid'
            && result.final_verdict !== 'dead';
        }
      },
      {
        id:'constructive-support-test-can-stay-near-entry-with-soft-cautions',
        record:{
          setupScore:7,
          baseScore:7,
          displayScore:5,
          meta:{marketStatus:'weak'},
          derivedStates:{
            structureState:'developing_clean',
            trendState:'intact',
            bounceState:'attempt',
            stabilisationState:'early',
            volumeState:'normal',
            pullbackZone:'near_50ma',
            setupLocationState:'constructive',
            priceabilityState:'provisional'
          },
          effectivePlan:{entry:100, stop:97, firstTarget:106},
          displayedPlan:{
            status:'valid',
            entry:100,
            stop:97,
            target:106,
            tradeability:'watch',
            rewardRisk:{rrRatio:2},
            riskFit:{risk_status:'acceptable'},
            affordability:'acceptable',
            capitalFit:{capital_fit:'acceptable'}
          },
          resolvedContract:{
            finalVerdict:'Near Entry',
            structuralState:'near_entry',
            actionStateKey:'wait_for_confirmation',
            planStatusKey:'needs_adjustment',
            tradeabilityVerdict:'Near Entry',
            blockerReason:'Bounce is not clear enough to price yet.',
            reasonSummary:'Close to trigger.',
            terminal:false,
            baseVerdict:'near_entry'
          },
          cumulativePenaltyTrace:{sources:[
            {id:'weak_market_tape', category:'soft_caution', severity:'medium', terminal:false, present:true, possibleWhere:['canonical_verdict'], appliedWhere:['canonical_verdict'], canonicalImpact:true, displayImpact:false, skippedReason:null}
          ]}
        },
        assert(result){
          return result.final_verdict === 'near_entry'
            && result.structure_eligibility === 'alive'
            && result.near_entry_gate_pass === true
            && result.final_verdict !== 'avoid';
        }
      },
      {
        id:'independent-trigger-can-promote-entry-without-circular-ready-state',
        record:{
          ticker:'SHOP',
          watchlist_entry_exists:true,
          reclaimsLevel:true,
          derivedStates:{
            structureState:'intact',
            trendState:'intact',
            stabilisationState:'clear',
            bounceState:'confirmed',
            volumeState:'normal',
            pullbackZone:'near_20ma'
          },
          effectivePlan:{entry:100, stop:97, firstTarget:106},
          displayedPlan:{
            status:'valid',
            entry:100,
            stop:97,
            target:106,
            tradeability:'entry',
            rewardRisk:{rrRatio:2.1},
            riskFit:{risk_status:'acceptable'},
            affordability:'acceptable',
            capitalFit:{capital_fit:'acceptable'}
          },
          marketData:{price:101, ma20:98, ma50:95, ma200:90},
          resolvedContract:{
            finalVerdict:'Near Entry',
            structuralState:'near_entry',
            actionStateKey:'wait_for_confirmation',
            planStatusKey:'valid',
            tradeabilityVerdict:'Near Entry',
            blockerReason:'Needs stronger confirmation',
            reasonSummary:'Close to trigger.',
            terminal:false,
            baseVerdict:'near_entry'
          }
        },
        assert(result){
          return result.entry_gate_pass === true
            && result.final_verdict === 'entry';
        }
      }
    ];
    const results = cases.map(testCase => {
      if(testCase.viability){
        const viability = resolveWatchlistViability(testCase.viability);
        const pass = viability.viability === testCase.expect.viability
          && viability.viabilityBranchId === testCase.expect.branch
          && viability.viability !== 'reject';
        return {
          id:testCase.id,
          pass,
          viability:viability.viability,
          viabilityBranchId:viability.viabilityBranchId,
          viabilityReason:viability.viabilityReason
        };
      }
      const near = canPromoteToNearEntry(testCase.ctx);
      const entry = canPromoteToEntry(testCase.ctx);
      const pass = near.pass === testCase.expect.near && (testCase.expect.entry === undefined || entry.pass === testCase.expect.entry);
      return {id:testCase.id, pass, near:near.pass, entry:entry.pass, nearReasons:near.reasons, entryReasons:entry.reasons};
    });
    resolverCases.forEach(testCase => {
      const resolved = resolveGlobalVerdict(testCase.record, buildResolverDepsForAssertions());
      const pass = testCase.assert(resolved) === true;
      results.push({
        id:testCase.id,
        pass,
        finalVerdict:resolved.final_verdict,
        viability:resolved.viability,
        structureEligibility:resolved.structure_eligibility,
        nearEntryGatePass:resolved.near_entry_gate_pass,
        cumulativePenaltyTrace:resolved.cumulativePenaltyTrace
      });
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
