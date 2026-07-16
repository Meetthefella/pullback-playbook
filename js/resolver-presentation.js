(function(global){
  function clampScore(score){
    const numeric = Number.isFinite(Number(score)) ? Number(score) : 0;
    return Math.max(0, Math.min(10, numeric));
  }

  function coerceCanonicalVerdict(verdict, deps = {}){
    const normalizer = deps.normalizeGlobalVerdictKey || deps.normalizeVerdict;
    if(typeof normalizer === 'function'){
      const normalized = String(normalizer(verdict || '') || '').trim().toLowerCase();
      if(['entry','near_entry','watch','avoid'].includes(normalized)) return normalized;
    }
    const safe = String(verdict || '').trim().toLowerCase();
    if(safe === 'entry') return 'entry';
    if(safe === 'near_entry' || safe === 'near entry' || safe === 'nearentry') return 'near_entry';
    if(safe === 'avoid') return 'avoid';
    if(['dead','diminishing'].includes(safe)) return 'avoid';
    return 'watch';
  }

  function visualStateKey(finalVerdict, deps = {}){
    const normalized = coerceCanonicalVerdict(finalVerdict, deps);
    if(normalized === 'entry') return 'entry';
    if(normalized === 'near_entry') return 'near_entry';
    if(normalized === 'avoid') return 'avoid';
    return 'watch';
  }

  function visualToneForState(state){
    if(state === 'entry') return 'entry';
    if(state === 'near_entry') return 'near_entry';
    if(state === 'avoid') return 'avoid';
    return 'monitor';
  }

  function visualPaletteForState(state){
    if(state === 'entry') return {top:'#16A34A', border:'rgba(22, 163, 74, 0.44)'};
    if(state === 'near_entry') return {top:'#0284C7', border:'rgba(2, 132, 199, 0.44)'};
    if(state === 'avoid') return {top:'#D50032', border:'rgba(213, 0, 50, 0.48)'};
    return {top:'#FFA000', border:'rgba(255, 160, 0, 0.42)'};
  }

  function visualStyleForState(state, score){
    const palette = visualPaletteForState(state);
    const intensity = clampScore(score) / 10;
    const glowBoost = (0.08 + intensity * 0.08).toFixed(3);
    return `--visual-state-background:${palette.top};--visual-state-border:${palette.border};--visual-state-glow:rgba(0,0,0,${glowBoost});--state-color:${palette.top};`;
  }

  function cardClassForState(state){
    if(state === 'entry') return 'card--entry';
    if(state === 'near_entry') return 'card--near-entry';
    if(state === 'avoid') return 'card--avoid';
    return 'card--watch';
  }

  function visualBucketForCanonical(canonicalVerdict, options = {}, deps = {}){
    const verdict = coerceCanonicalVerdict(canonicalVerdict, deps);
    if(verdict === 'entry') return 'entry';
    if(verdict === 'near_entry') return 'near_entry';
    if(verdict === 'avoid') return 'avoid';
    const structureEligibility = String(options.structureEligibility || '').trim().toLowerCase();
    const structureState = String(options.structureState || '').trim().toLowerCase();
    const viability = String(options.viability || '').trim().toLowerCase();
    const viabilityBranchId = String(options.viabilityBranchId || '').trim().toLowerCase();
    const setupLocationState = String(options.setupLocationState || '').trim().toLowerCase();
    const priceabilityState = String(options.priceabilityState || '').trim().toLowerCase();
    const bounceState = String(options.bounceState || '').trim().toLowerCase();
    const stabilisationState = String(options.stabilisationState || '').trim().toLowerCase();
    const pullbackZone = String(options.pullbackZone || '').trim().toLowerCase();
    const planStatus = String(options.planStatus || '').trim().toLowerCase();
    const setupScore = Number.isFinite(Number(options.setupScore)) ? Number(options.setupScore) : null;
    const resolvedRR = Number.isFinite(Number(options.resolvedRR)) ? Number(options.resolvedRR) : null;
    const reclaimSignalCount = Number.isFinite(Number(options.reclaimSignalCount)) ? Number(options.reclaimSignalCount) : null;
    const below50WithoutReclaim = options.below50WithoutReclaim === true;
    const latePullbackState = String(options.latePullbackState || '').trim().toLowerCase();
    const hasClearInvalidationLevel = options.hasClearInvalidationLevel === true;
    const tradeabilityOk = options.tradeabilityOk === true;
    const rrOk = options.rrOk === true;
    const planValid = options.planValid === true;
    const aliveStructure = ['alive','messy'].includes(structureEligibility)
      || (!structureEligibility && ['strong','intact','developing_clean'].includes(structureState));
    const noReclaimEvidence = reclaimSignalCount === 0 || below50WithoutReclaim;
    const weakWatchDowngradeApplied = verdict === 'watch'
      && setupScore !== null
      && setupScore <= 2
      && aliveStructure
      && priceabilityState === 'unpriceable'
      && (
        below50WithoutReclaim
        || noReclaimEvidence
        || planStatus === 'missing'
        || !planValid
        || !tradeabilityOk
        || !rrOk
        || hasClearInvalidationLevel === false
        || (resolvedRR !== null && resolvedRR < 2)
      );
    const constructiveWaiting = aliveStructure
      && ['attempt','early','confirmed'].includes(bounceState)
      && priceabilityState !== 'unpriceable'
      && viability !== 'low_priority'
      && !viabilityBranchId.includes('extended')
      && !viabilityBranchId.includes('low_score')
      && (setupScore === null || setupScore >= 5)
      && !['invalid','rebuild_required','too_wide'].includes(planStatus);
    const developingWatch = ['near_20ma','near_50ma','recently_left_20ma','recently_left_50ma'].includes(pullbackZone)
      && ['attempt','early','confirmed'].includes(bounceState)
      && ['early','present','clear'].includes(stabilisationState)
      && priceabilityState !== 'unpriceable';
    const constructiveUnpriceableWaiting = aliveStructure
      && ['near_20ma','near_50ma','recently_left_20ma','recently_left_50ma'].includes(pullbackZone)
      && ['attempt','early'].includes(bounceState)
      && ['early','present','clear'].includes(stabilisationState)
      && priceabilityState === 'unpriceable'
      && !below50WithoutReclaim
      && reclaimSignalCount !== 0
      && hasClearInvalidationLevel !== false
      && (setupScore === null || setupScore >= 4);
    const structureAllowsDevelopingWatch = aliveStructure;
    if(developingWatch && structureAllowsDevelopingWatch){
      return 'monitor';
    }
    if(constructiveUnpriceableWaiting){
      return 'monitor';
    }
    if(setupLocationState === 'none' && constructiveWaiting){
      return 'monitor';
    }
    if(latePullbackState === 'late'){
      return 'diminishing';
    }
    const deteriorationEvidence = ['damaged','broken'].includes(structureEligibility)
      || (
        structureEligibility !== 'messy'
        && ['weak','weakening','broken','failed','developing_loose'].includes(structureState)
      )
      || viabilityBranchId.includes('damaged')
      || viabilityBranchId.includes('failed')
      || viabilityBranchId.includes('weakening');
    if(!developingWatch && deteriorationEvidence){
      return 'diminishing';
    }
    if(weakWatchDowngradeApplied){
      return 'diminishing';
    }
    const weakWatchDiminishingApplied = weakWatchDiminishingTraceForState({
      verdict,
      structureEligibility,
      structureState,
      setupLocationState,
      priceabilityState,
      numericSetupScore:setupScore,
      planStatus,
      planValid,
      tradeabilityOk,
      rrOk,
      resolvedRR,
      hasClearInvalidationLevel,
      below50WithoutReclaim,
      reclaimSignalCount,
      bounceState
    }).applied;
    if(weakWatchDiminishingApplied){
      return 'diminishing';
    }
    if(structureEligibility === 'damaged' || (structureEligibility !== 'messy' && structureState === 'weakening')){
      return 'diminishing';
    }
    return 'monitor';
  }

  function cardClassForBucket(bucket){
    const safe = String(bucket || '').trim().toLowerCase();
    if(safe === 'entry') return 'card--entry';
    if(safe === 'near_entry') return 'card--near-entry';
    if(safe === 'diminishing') return 'card--diminishing';
    if(safe === 'avoid') return 'card--avoid';
    return 'card--monitor';
  }

  function weakWatchDiminishingTraceForState(details = {}){
    const verdictIsWatch = String(details.verdict || '').trim().toLowerCase() === 'watch';
    const structureEligibility = String(details.structureEligibility || '').trim().toLowerCase();
    const structureState = String(details.structureState || '').trim().toLowerCase();
    const aliveStructure = ['alive','messy'].includes(structureEligibility)
      || (!structureEligibility && ['strong','intact','developing_clean'].includes(structureState));
    const setupLocationState = String(details.setupLocationState || '').trim().toLowerCase();
    const priceabilityState = String(details.priceabilityState || '').trim().toLowerCase();
    const priceabilityUnpriceable = priceabilityState === 'unpriceable';
    const numericSetupScore = Number.isFinite(Number(details.numericSetupScore))
      ? Number(details.numericSetupScore)
      : null;
    const lowScore = numericSetupScore !== null && numericSetupScore <= 2;
    const planStatus = String(details.planStatus || '').trim().toLowerCase();
    const planValid = details.planValid === true;
    const rrOk = details.rrOk === true;
    const resolvedRR = Number.isFinite(Number(details.resolvedRR)) ? Number(details.resolvedRR) : null;
    const hasClearInvalidationLevel = details.hasClearInvalidationLevel === true;
    const below50WithoutReclaim = details.below50WithoutReclaim === true;
    const reclaimSignalCount = Number.isFinite(Number(details.reclaimSignalCount)) ? Number(details.reclaimSignalCount) : null;
    const noReclaimEvidence = reclaimSignalCount === 0 || below50WithoutReclaim;
    const bounceState = String(details.bounceState || '').trim().toLowerCase();
    const promotionBlocked = details.promotionBlocked === true;
    const hardWeakTokens = new Set([
      'below50_no_reclaim',
      'no_reclaim_signals',
      'invalid_rr',
      'no_valid_invalidation',
      'bounce_attempt_only',
      'bounce_early',
      'promotion_blocked'
    ]);
    const weakWatchTriggerMatches = [];
    if(priceabilityUnpriceable) weakWatchTriggerMatches.push('unpriceable');
    if(lowScore) weakWatchTriggerMatches.push('low_score');
    if(planStatus === 'missing' || !planValid) weakWatchTriggerMatches.push('missing_plan');
    if(!rrOk || (resolvedRR !== null && resolvedRR < 2)) weakWatchTriggerMatches.push('invalid_rr');
    if(hasClearInvalidationLevel === false) weakWatchTriggerMatches.push('no_valid_invalidation');
    if(below50WithoutReclaim) weakWatchTriggerMatches.push('below50_no_reclaim');
    else if(noReclaimEvidence) weakWatchTriggerMatches.push('no_reclaim_signals');
    if(bounceState === 'attempt') weakWatchTriggerMatches.push('bounce_attempt_only');
    if(bounceState === 'early') weakWatchTriggerMatches.push('bounce_early');
    if(promotionBlocked) weakWatchTriggerMatches.push('promotion_blocked');

    const triggerTokens = [];
    if(priceabilityUnpriceable) triggerTokens.push('unpriceable');
    if(lowScore) triggerTokens.push('low_score');
    if(planStatus === 'missing' || !planValid) triggerTokens.push('missing_plan');
    if(!rrOk || (resolvedRR !== null && resolvedRR < 2)) triggerTokens.push('invalid_rr');
    if(hasClearInvalidationLevel === false) triggerTokens.push('no_valid_invalidation');
    if(below50WithoutReclaim) triggerTokens.push('below50_no_reclaim');
    else if(noReclaimEvidence) triggerTokens.push('no_reclaim_signals');
    if(bounceState === 'attempt') triggerTokens.push('bounce_attempt_only');
    if(bounceState === 'early') triggerTokens.push('bounce_early');
    if(promotionBlocked) triggerTokens.push('promotion_blocked');

    const hasHardWeakToken = triggerTokens.some(token => hardWeakTokens.has(token));
    const contextualWeakness = ['extended', 'volatile', 'off_level'].includes(setupLocationState)
      || lowScore
      || below50WithoutReclaim;
    const hasMeaningfulWeakness = weakWatchTriggerMatches.length >= 2
      || weakWatchTriggerMatches.includes('below50_no_reclaim')
      || weakWatchTriggerMatches.includes('invalid_rr')
      || weakWatchTriggerMatches.includes('missing_plan')
      || weakWatchTriggerMatches.includes('no_valid_invalidation')
      || weakWatchTriggerMatches.includes('promotion_blocked');
    const applied = verdictIsWatch
      && aliveStructure
      && priceabilityUnpriceable
      && hasHardWeakToken
      && contextualWeakness
      && hasMeaningfulWeakness;
    const reasonTokens = [];
    if(priceabilityUnpriceable) reasonTokens.push('unpriceable');
    if(lowScore) reasonTokens.push('low_score');
    if(planStatus === 'missing' || !planValid) reasonTokens.push('missing_plan');
    if(below50WithoutReclaim){
      reasonTokens.push('below50_no_reclaim');
    }else if(noReclaimEvidence){
      reasonTokens.push('no_reclaim_signals');
    }
    if(bounceState === 'attempt'){
      reasonTokens.push('bounce_attempt_only');
    }else if(bounceState === 'early'){
      reasonTokens.push('bounce_early');
    }
    if(!rrOk || (resolvedRR !== null && resolvedRR < 2)){
      reasonTokens.push('invalid_rr');
    }else if(hasClearInvalidationLevel === false){
      reasonTokens.push('no_valid_invalidation');
    }
    if(promotionBlocked){
      reasonTokens.push('promotion_blocked');
    }

    return {
      verdictIsWatch,
      aliveStructure,
      priceabilityState,
      priceabilityUnpriceable,
      numericSetupScore,
      lowScore,
      planStatus,
      planValid,
      rrOk,
      resolvedRR,
      hasClearInvalidationLevel,
      below50WithoutReclaim,
      reclaimSignalCount,
      noReclaimEvidence,
      bounceState,
      promotionBlocked,
      triggerTokens,
      applied,
      evaluatedBeforeFinalMonitorFallback:true,
      returnPath:applied ? 'weak_watch_diminishing' : 'monitor_fallback',
      reason:reasonTokens.length ? reasonTokens.join('_') : 'weak_watch_diminishing_guard'
    };
  }

  function weakWatchDiminishingReasonForState(details = {}){
    return weakWatchDiminishingTraceForState(details).reason;
  }

  function decisionSummaryForVerdict(finalVerdict, options = {}, deps = {}){
    const verdict = coerceCanonicalVerdict(finalVerdict, deps);
    const storyContext = options.storyContext && typeof options.storyContext === 'object' ? options.storyContext : null;
    if(verdict === 'entry') return 'Entry - your plan fits.';
    if(verdict === 'avoid') return 'Avoid - too weak or broken. Leave it alone.';
    const structureEligibility = String(options && options.structureEligibility || '').toLowerCase();
    const setupLocationState = String(options && options.setupLocationState || '').toLowerCase();
    const priceabilityState = String(options && options.priceabilityState || '').toLowerCase();
    const bounceState = String(options && options.bounceState || '').toLowerCase();
    const planStatus = String(options && options.planStatus || '').toLowerCase();
    const viability = String(options && options.viability || '').toLowerCase();
    const viabilityBranchId = String(options && options.viabilityBranchId || '').toLowerCase();
    const setupScore = Number.isFinite(Number(options && options.setupScore)) ? Number(options.setupScore) : null;
    const structureState = String(options && options.structureState || '').toLowerCase();
    const latePullbackState = String(options && options.latePullbackState || '').toLowerCase();
    const mainBlocker = String(options && options.mainBlocker || '').trim();
    const hasBlockingPlanStatus = ['invalid','missing','rebuild_required','too_wide'].includes(planStatus);
    const aliveStructure = structureEligibility === 'alive'
      || (!structureEligibility && ['strong','intact','developing_clean'].includes(structureState));
    const constructiveWaiting = aliveStructure
      && ['attempt','early','confirmed'].includes(bounceState)
      && priceabilityState !== 'unpriceable'
      && viability !== 'low_priority'
      && !viabilityBranchId.includes('extended')
      && !viabilityBranchId.includes('low_score')
      && (setupScore === null || setupScore >= 5)
      && !hasBlockingPlanStatus;
    const canonicalSummary = storyContext && typeof deps.canonicalDecisionSummaryFromStoryContext === 'function'
      ? String(deps.canonicalDecisionSummaryFromStoryContext({
        finalVerdict:verdict,
        storyContext,
        fallbackSummary:''
      }) || '').trim()
      : '';
    if(setupLocationState === 'none' && constructiveWaiting) return 'Watch - waiting for confirmation.';
    if(latePullbackState === 'late') return 'Watch - trend is healthy, but the buyer response is already too far from support to chase.';
    if(setupLocationState === 'extended') return 'Watch - strong trend, but no clean pullback entry yet.';
    if(setupLocationState === 'volatile') return 'Watch - setup is too volatile to price reliably.';
    if((setupLocationState === 'none' || setupLocationState === 'off_level' || setupLocationState === 'unclear') && (viability === 'low_priority' || viabilityBranchId.includes('low_score') || (setupScore !== null && setupScore < 5) || priceabilityState === 'unpriceable')) return 'Watch - strong trend, but no usable pullback setup yet.';
    if(priceabilityState === 'unpriceable') return 'Watch - price is too extended to price reliably.';
    if(viabilityBranchId.includes('low_score') || (setupScore !== null && setupScore < 5)) return 'Watch - setup quality has slipped below useful watchlist quality.';
    if(hasBlockingPlanStatus && mainBlocker) return mainBlocker;
    if(structureEligibility === 'damaged') return 'Watch - structure weakening.';
    if(structureEligibility === 'messy') return 'Watch - structure still alive, but messy.';
    if(canonicalSummary) return canonicalSummary;
    if(verdict === 'near_entry') return 'Near Entry - almost ready. Watch for confirmation.';
    return 'Watch - waiting for confirmation.';
  }

  function finalVerdictFromResolvedContract(resolved, derivedStates, deps = {}){
    const contract = resolved && typeof resolved === 'object' ? resolved : {};
    const structureState = String(derivedStates && derivedStates.structureState || '').trim().toLowerCase();
    const structuralState = String(contract.structuralState || '').trim().toLowerCase();
    const actionStateKey = String(contract.actionStateKey || '').trim().toLowerCase();
    if(structureState === 'broken' || structuralState === 'dead' || actionStateKey === 'rebuild_setup') return 'avoid';
    if(structuralState === 'entry' || actionStateKey === 'ready_to_act') return 'entry';
    if(structuralState === 'near_entry') return 'near_entry';
    return 'watch';
  }

  function primaryShortlistStatusChip(view, deps = {}){
    const item = view && view.item ? view.item : view;
    const visualState = deps.resolveVisualState ? deps.resolveVisualState(item, 'scanner') : null;
    const badge = visualState && visualState.badge ? visualState.badge : deps.getBadge('watch');
    return {
      label:badge.text,
      className:badge.className,
      modifiers:[],
      primaryState:coerceCanonicalVerdict(visualState && (visualState.finalVerdict || visualState.final_verdict) || 'watch', deps)
    };
  }

  function resolveVisualState(record, context = 'scanner', options = {}, deps = {}){
    const safeRecord = record && typeof record === 'object' ? record : {};
    const derivedStates = options.derivedStates || deps.analysisDerivedStatesFromRecord(safeRecord);
    const legacyVerdict = typeof deps.resolveGlobalVerdict === 'function' ? deps.resolveGlobalVerdict(safeRecord) : null;
    const effectivePlan = options.effectivePlan || deps.effectivePlanForRecord(safeRecord, {allowScannerFallback:true});
    const displayedPlan = options.displayedPlan || deps.deriveCurrentPlanState(
      effectivePlan.entry,
      effectivePlan.stop,
      effectivePlan.firstTarget,
      safeRecord.marketData && safeRecord.marketData.currency
    );
    const resolvedContract = options.resolvedContract || deps.resolveFinalStateContract(safeRecord, {context, derivedStates, displayedPlan});
    const rawVerdict = String(
      (resolvedContract && (
        resolvedContract.finalVerdict
        || resolvedContract.final_verdict_rendered
        || resolvedContract.final_verdict
      ))
      || finalVerdictFromResolvedContract(resolvedContract, derivedStates, deps)
      || 'watch'
    ).trim();
    let canonicalVerdict = coerceCanonicalVerdict(rawVerdict, deps);
    const explicitInvalidationReason = String(legacyVerdict && legacyVerdict.explicit_invalidation_reason || '').trim().toLowerCase();
    const hasExplicitInvalidation = !!(explicitInvalidationReason && explicitInvalidationReason !== '(none)');
    const terminalAvoidApplied = legacyVerdict && legacyVerdict.terminal_avoid_applied === true;
    const structureEligibility = String(legacyVerdict && legacyVerdict.structure_eligibility || '').trim().toLowerCase();
    const viability = String(legacyVerdict && legacyVerdict.viability || '').trim().toLowerCase();
    const viabilityBranchId = String(legacyVerdict && legacyVerdict.viabilityBranchId || '').trim().toLowerCase();
    const structureState = String(derivedStates && derivedStates.structureState || '').trim().toLowerCase();
    const setupLocationState = String((derivedStates && derivedStates.setupLocationState) || (legacyVerdict && legacyVerdict.setup_location_state) || '').trim().toLowerCase();
    const latePullbackState = String(legacyVerdict && legacyVerdict.late_pullback_state || '').trim().toLowerCase();
    const derivedPriceabilityState = String(derivedStates && derivedStates.priceabilityState || '').trim().toLowerCase();
    const priceabilityState = String(derivedPriceabilityState || (legacyVerdict && legacyVerdict.priceability_state) || '').trim().toLowerCase();
    const bounceState = String(derivedStates && derivedStates.bounceState || legacyVerdict && legacyVerdict.bounce_state || '').trim().toLowerCase();
    const stabilisationState = String(derivedStates && derivedStates.stabilisationState || '').trim().toLowerCase();
    const pullbackZone = String(derivedStates && derivedStates.pullbackZone || legacyVerdict && legacyVerdict.pullback_zone || '').trim().toLowerCase();
    const planStatus = String(resolvedContract && resolvedContract.planStatusKey || displayedPlan && displayedPlan.status || '').trim().toLowerCase();
    const entryGateChecks = resolvedContract && resolvedContract.entry_gate_checks || {};
    const nearEntryGateChecks = resolvedContract && resolvedContract.near_entry_gate_checks || {};
    const viabilityInputs = legacyVerdict && (legacyVerdict.viabilityInputs || legacyVerdict.viability_inputs) || {};
    const optionSetupScore = options.setupScore != null ? options.setupScore : deps.setupScoreForRecord(safeRecord);
    const below50WithoutReclaim = nearEntryGateChecks.below_50_without_reclaim === true
      || entryGateChecks.below_50_without_reclaim === true
      || viabilityInputs.below50WithoutReclaim === true
      || viabilityInputs.below_50_without_reclaim === true;
    const reclaimSignalCount = Number.isFinite(Number(nearEntryGateChecks.reclaim_signal_count))
      ? Number(nearEntryGateChecks.reclaim_signal_count)
      : (Number.isFinite(Number(entryGateChecks.reclaim_signal_count))
        ? Number(entryGateChecks.reclaim_signal_count)
        : (Number.isFinite(Number(legacyVerdict && legacyVerdict.reclaimSignalCount))
          ? Number(legacyVerdict.reclaimSignalCount)
          : null));
    const noReclaimEvidence = reclaimSignalCount === 0 || below50WithoutReclaim;
    const hasClearInvalidationLevel = nearEntryGateChecks.has_clear_invalidation_level === true
      || entryGateChecks.has_clear_invalidation_level === true
      || legacyVerdict && legacyVerdict.hasClearInvalidationLevel === true;
    const legacyResolvedRR = Number.isFinite(Number(legacyVerdict && legacyVerdict.resolvedRR))
      ? Number(legacyVerdict.resolvedRR)
      : (Number.isFinite(Number(legacyVerdict && legacyVerdict.resolved_rr))
        ? Number(legacyVerdict.resolved_rr)
        : null);
    const resolvedRR = Number.isFinite(Number(nearEntryGateChecks.resolved_rr))
      ? Number(nearEntryGateChecks.resolved_rr)
      : (Number.isFinite(Number(entryGateChecks.resolved_rr))
        ? Number(entryGateChecks.resolved_rr)
        : legacyResolvedRR);
    const rrOk = nearEntryGateChecks.rr_priceable === true
      || entryGateChecks.rr_ok === true
      || viabilityInputs.rrOk === true;
    const tradeabilityOk = nearEntryGateChecks.tradeability_ok === true
      || entryGateChecks.tradeability_ok === true
      || viabilityInputs.tradeabilityOk === true
      || viabilityInputs.tradeabilityOK === true;
    const planValid = nearEntryGateChecks.plan_ok === true
      || entryGateChecks.plan_ok === true
      || viabilityInputs.planValid === true;
    const weakWatchDowngradeReasons = [];
    const numericSetupScore = Number.isFinite(Number(optionSetupScore)) ? Number(optionSetupScore) : null;
    if(numericSetupScore !== null && numericSetupScore <= 2) weakWatchDowngradeReasons.push('setup_score_below_watch_floor');
    if(below50WithoutReclaim) weakWatchDowngradeReasons.push('below_50_without_reclaim');
    if(reclaimSignalCount === 0 || below50WithoutReclaim) weakWatchDowngradeReasons.push('no_reclaim_signals');
    if(hasClearInvalidationLevel === false) weakWatchDowngradeReasons.push('no_clear_invalidation_level');
    if(priceabilityState === 'unpriceable') weakWatchDowngradeReasons.push('unpriceable');
    if(!planValid) weakWatchDowngradeReasons.push('no_valid_plan');
    if(!tradeabilityOk) weakWatchDowngradeReasons.push('tradeability_not_ready');
    if(!rrOk || resolvedRR !== null && resolvedRR < 2) weakWatchDowngradeReasons.push('rr_not_usable');
    const hardStructureFailure = structureEligibility === 'broken' || structureState === 'broken';
    const weakOrWeakeningStructure = structureState === 'weakening' || structureState === 'weak';
    const weakeningLowPriorityRecovery = (
      viability === 'low_priority'
      && weakOrWeakeningStructure
      && !terminalAvoidApplied
      && !hasExplicitInvalidation
      && !hardStructureFailure
    );
    if(canonicalVerdict === 'avoid' && weakeningLowPriorityRecovery){
      canonicalVerdict = 'watch';
    }
    const finalVerdict = options.pendingResolution === true ? 'watch' : canonicalVerdict;
    const renderedVerdict = finalVerdict;
    const state = visualStateKey(renderedVerdict, deps);
    const previousVerdict = coerceCanonicalVerdict(
      safeRecord && safeRecord.meta && safeRecord.meta.previousFinalVerdict,
      deps
    );
    const aliveStructure = ['alive','messy'].includes(structureEligibility)
      || (!structureEligibility && ['strong','intact','developing_clean'].includes(structureState));
    const weakeningButAlive = finalVerdict === 'watch'
      && (
        structureEligibility === 'damaged'
        || structureState === 'weakening'
        || viability === 'low_priority'
      );
    const weakWatchDiminishingTrace = weakWatchDiminishingTraceForState({
      verdict:finalVerdict,
      structureEligibility,
      structureState,
      setupLocationState,
      latePullbackState,
      priceabilityState,
      numericSetupScore,
      planStatus,
      planValid,
      tradeabilityOk,
      rrOk,
      resolvedRR,
      hasClearInvalidationLevel,
      below50WithoutReclaim,
      reclaimSignalCount,
      bounceState,
      promotionBlocked:resolvedContract && (
        resolvedContract.presentationUpgradeBlocked === true
        || resolvedContract.promotionBlockedBy
        || resolvedContract.entry_gate_pass === false
        || resolvedContract.near_entry_gate_pass === false
      )
    });
    const weakWatchDiminishingApplied = weakWatchDiminishingTrace.applied;
    const weakWatchDiminishingReason = weakWatchDiminishingTrace.reason;
    const visualBucketBeforeWeakWatchDowngrade = visualBucketForCanonical(finalVerdict, {
      structureEligibility,
      structureState,
      setupLocationState,
      latePullbackState,
      priceabilityState,
      viability,
      viabilityBranchId,
      bounceState,
      stabilisationState,
      pullbackZone,
      planStatus,
      setupScore:optionSetupScore,
      below50WithoutReclaim:false,
      reclaimSignalCount,
      hasClearInvalidationLevel,
      resolvedRR,
      rrOk,
      tradeabilityOk,
      planValid
    }, deps);
    const visualBucket = visualBucketForCanonical(finalVerdict, {
      structureEligibility,
      structureState,
      setupLocationState,
      latePullbackState,
      priceabilityState,
      viability,
      viabilityBranchId,
      bounceState,
      stabilisationState,
      pullbackZone,
      planStatus,
      setupScore:optionSetupScore,
      below50WithoutReclaim,
      reclaimSignalCount,
      hasClearInvalidationLevel,
      resolvedRR,
      rrOk,
      tradeabilityOk,
      planValid
    }, deps);
    const weakWatchDowngradeApplied = finalVerdict === 'watch'
      && visualBucketBeforeWeakWatchDowngrade !== 'diminishing'
      && visualBucket === 'diminishing'
      && weakWatchDowngradeReasons.includes('setup_score_below_watch_floor')
      && weakWatchDowngradeReasons.includes('below_50_without_reclaim')
      && weakWatchDowngradeReasons.includes('no_reclaim_signals');
    let visual_tone = visualBucket;
    if(visual_tone === 'diminishing' && finalVerdict !== 'watch') visual_tone = finalVerdict === 'avoid' ? 'avoid' : 'monitor';
    const score = clampScore(optionSetupScore);
    const styleAttr = visualStyleForState(visual_tone === 'diminishing' ? 'watch' : visual_tone, score);
    const badge = deps.getBadge(renderedVerdict);
    const storyContext = typeof deps.buildCanonicalStoryContextForRecord === 'function'
      ? deps.buildCanonicalStoryContextForRecord(safeRecord, {
        globalVerdict:legacyVerdict,
        derivedStates
      })
      : null;
    const summaryOptions = {
      structuralState:resolvedContract && resolvedContract.structuralState,
      structureState:String(derivedStates && derivedStates.structureState || '').trim().toLowerCase(),
      structureEligibility:legacyVerdict && legacyVerdict.structure_eligibility,
      viability,
      setupLocationState,
      priceabilityState,
      bounceState,
      planStatus,
      mainBlocker:legacyVerdict && (legacyVerdict.main_blocker || legacyVerdict.mainBlocker),
      viabilityBranchId,
      setupScore:optionSetupScore,
      storyContext
    };
    const resolvedSummary = decisionSummaryForVerdict(renderedVerdict, summaryOptions, deps);
    const cardClass = cardClassForBucket(visualBucket);
    const staleVisualFieldIgnored = true;
    const staleAvoidSuppressed = previousVerdict === 'avoid' && finalVerdict !== 'avoid';
    const scanVisualSource = 'fresh_resolved_bundle';
    const reviewVisualSource = 'fresh_resolved_bundle';
    return {
      state,
      decision_summary:resolvedSummary,
      visual_tone,
      score,
      className:`visual-state-card visual-state-${state} visual-tone-${visual_tone} ${cardClass}`,
      tone:visual_tone,
      toneClass:`visual-state-${state} visual-tone-${visual_tone} ${cardClass}`,
      borderClass:'',
      backgroundClass:'',
      badgeToneClass:'',
      scoreClass:'',
      debugToneSource:'resolveFinalStateContract',
      styleAttr,
      badge,
      finalVerdict,
      final_verdict:finalVerdict,
      renderedVerdict,
      review_presentation_state:visualBucket === 'diminishing' ? 'diminishing' : renderedVerdict,
      review_presentation_source:'resolver',
      terminal_avoid_applied:false,
      terminal_avoid_reason:null,
      diminishing_preserved_in_review:weakeningButAlive || weakWatchDiminishingApplied,
      weakWatchDiminishingApplied,
      weakWatchDiminishingReason,
      weakWatchDiminishingTrace,
      canonicalVerdict:finalVerdict,
      visualBucket,
      presentationBucket:visualBucket,
      bucket:visualBucket,
      allowPlan:['entry','near_entry'].includes(finalVerdict),
      allow_plan:['entry','near_entry'].includes(finalVerdict),
      allowWatchlist:['watch','near_entry','entry'].includes(finalVerdict),
      allow_watchlist:['watch','near_entry','entry'].includes(finalVerdict),
      structureEligibility,
      structureEligibilityNormalized:structureEligibility,
      structureState:String(derivedStates && derivedStates.structureState || '').trim().toLowerCase(),
      reason:(legacyVerdict && legacyVerdict.main_blocker) || resolvedSummary,
      reason_state:finalVerdict === 'avoid'
        ? (String(derivedStates && derivedStates.structureState || '').trim().toLowerCase() === 'broken' ? 'broken_structure' : 'invalidated')
        : ((weakeningButAlive || weakWatchDiminishingApplied) ? 'weakening_but_alive' : 'waiting_for_confirmation'),
      ui_state_source:'resolveFinalStateContract',
      final_verdict_rendered:renderedVerdict,
      bucket_rendered:visualBucket,
      dead_guard_applied:false,
      dead_trigger_source:null,
      explicit_invalidation_reason:legacyVerdict && legacyVerdict.explicit_invalidation_reason ? String(legacyVerdict.explicit_invalidation_reason) : '(none)',
      structure_to_label_mapping_source:'resolveVisualState(structure_guard)',
      setup_location_state:setupLocationState,
      late_pullback_state:latePullbackState,
      priceability_state:priceabilityState,
      lifecycle_drop_reason:legacyVerdict && legacyVerdict.lifecycle_drop_reason ? String(legacyVerdict.lifecycle_drop_reason) : '(none)',
      avoid_allowed_by_structure_consistency_guard:String(derivedStates && derivedStates.structureState || '').trim().toLowerCase() === 'broken',
      conflicting_legacy_state_detected:false,
      trackPresentationBucket:visualBucket,
      trackPresentationTone:visual_tone,
      visualBucketBeforeWeakWatchDowngrade,
      weakWatchDowngradeApplied,
      weakWatchDowngradeReasons,
      finalVisualBucket:visualBucket,
      previousVerdict,
      freshCanonicalVerdict:finalVerdict,
      freshVisualBucket:visualBucket,
      staleVisualFieldIgnored,
      staleAvoidSuppressed,
      scanVisualSource,
      reviewVisualSource,
      structureSource:'analysisDerivedStatesFromRecord',
      resolvedContract,
      legacyVerdict,
      context
    };
  }

  function resolveGlobalVisualState(record, context = 'scanner', options = {}, deps = {}){
    return resolveVisualState(record, context, options, deps);
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
    const avoidSubtype = options.avoidSubtype || deps.avoidSubtypeForRecord(item, {derivedStates, displayedPlan, qualityAdjustments, finalVerdict});
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
    if(qualityAdjustments.lowControlSetup || qualityAdjustments.tooWideForQualityPullback) addModifier('\uD83D\uDD0B', 'Weak control', 'weak_control');
    if(volumeState === 'weak') addModifier('\uD83E\uDED7', 'Weak volume', 'weak_volume');
    if(weakMarket) addModifier('\u26A0\uFE0F', 'Weak market', 'weak_market');
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
    resolveVisualState,
    resolveGlobalVisualState,
    resolveEmojiPresentation
  };
})(window);
