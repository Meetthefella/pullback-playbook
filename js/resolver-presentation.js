(function(global){
  // Canonical resolver presentation helpers extracted from app.js.
  function clampScore(score){
    const numeric = Number.isFinite(Number(score)) ? Number(score) : 0;
    return Math.max(0, Math.min(10, numeric));
  }

  function visualStateKey(finalVerdict, deps = {}){
    const normalized = (deps.normalizeVerdict || deps.normalizeGlobalVerdictKey)(finalVerdict || '');
    if(normalized === 'entry') return 'entry';
    if(normalized === 'near_entry') return 'near_entry';
    if(normalized === 'watch') return 'watch';
    if(normalized === 'diminishing') return 'diminishing';
    if(normalized === 'monitor') return 'monitor';
    if(normalized === 'dead') return 'dead';
    if(normalized === 'avoid') return 'avoid';
    return 'monitor';
  }

  function visualToneForState(state){
    if(state === 'entry') return 'entry';
    if(state === 'near_entry') return 'near_entry';
    if(state === 'watch') return 'watch';
    if(state === 'diminishing') return 'diminishing';
    if(state === 'monitor') return 'monitor';
    if(state === 'dead') return 'avoid';
    if(state === 'avoid') return 'avoid';
    return 'neutral';
  }

  function visualPaletteForState(state){
    if(state === 'entry'){
      return {top:'#008C89', bottom:'#020617', border:'rgba(0, 140, 137, 0.42)', glow:'rgba(0, 140, 137, 0.12)'};
    }
    if(state === 'near_entry'){
      return {top:'#35A0A0', bottom:'#020617', border:'rgba(53, 160, 160, 0.42)', glow:'rgba(53, 160, 160, 0.12)'};
    }
    if(state === 'watch'){
      return {top:'#7C3AED', bottom:'#020617', border:'rgba(124, 58, 237, 0.34)', glow:'rgba(124, 58, 237, 0.10)'};
    }
    if(state === 'monitor'){
      return {top:'#FFA000', bottom:'#020617', border:'rgba(255, 160, 0, 0.42)', glow:'rgba(255, 160, 0, 0.10)'};
    }
    if(state === 'diminishing'){
      return {top:'#F97316', bottom:'#020617', border:'rgba(249, 115, 22, 0.46)', glow:'rgba(249, 115, 22, 0.11)'};
    }
    if(state === 'dead'){
      return {top:'#D50032', bottom:'#020617', border:'rgba(213, 0, 50, 0.48)', glow:'rgba(213, 0, 50, 0.12)'};
    }
    if(state === 'avoid'){
      return {top:'#D50032', bottom:'#020617', border:'rgba(213, 0, 50, 0.48)', glow:'rgba(213, 0, 50, 0.12)'};
    }
    return {top:'#2a2a2a', bottom:'#1a1a1a', border:'rgba(148, 163, 184, 0.22)', glow:'rgba(148, 163, 184, 0.06)'};
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
    if(state === 'watch') return 'card--watch';
    if(state === 'diminishing') return 'card--diminishing';
    if(state === 'dead') return 'card--dead';
    if(state === 'avoid') return 'card--avoid';
    return 'card--monitor';
  }

  function decisionSummaryForVerdict(finalVerdict, options = {}, deps = {}){
    const verdict = (deps.normalizeVerdict || deps.normalizeGlobalVerdictKey)(finalVerdict || '');
    if(verdict === 'entry') return 'Entry - your plan fits.';
    if(verdict === 'near_entry') return 'Near Entry - almost ready. Watch for confirmation.';
    if(verdict === 'diminishing') return 'Diminishing - structure is weakening. Setup quality is fading.';
    if(verdict === 'avoid' || verdict === 'dead') return 'Avoid - too weak or broken. Leave it alone.';
    const structuralState = String(options && options.structuralState || '').toLowerCase();
    const structureState = String(options && options.structureState || '').toLowerCase();
    const structureEligibility = String(options && options.structureEligibility || '').toLowerCase();
    const isExtended = options && options.isExtended === true;
    if(isExtended && ['strong','intact'].includes(structureState)){
      return 'Extended - waiting for pullback.';
    }
    if(structureEligibility === 'damaged' || structureState === 'weakening'){
      return 'Monitor - structure weakening.';
    }
    if(structuralState === 'developing'){
      return 'Developing - waiting for confirmation.';
    }
    return 'Monitor - waiting for confirmation.';
  }

  function finalVerdictFromResolvedContract(resolved, derivedStates, deps = {}){
    const contract = resolved && typeof resolved === 'object' ? resolved : {};
    const structureState = String(derivedStates && derivedStates.structureState || '').trim().toLowerCase();
    const structuralState = String(contract.structuralState || '').trim().toLowerCase();
    const actionStateKey = String(contract.actionStateKey || '').trim().toLowerCase();
    const structurallyBroken = structureState === 'broken' || structuralState === 'dead';
    if(structurallyBroken || actionStateKey === 'rebuild_setup') return 'avoid';
    if(structuralState === 'entry' || actionStateKey === 'ready_to_act') return 'entry';
    if(structuralState === 'near_entry') return 'near_entry';
    return 'monitor';
  }

  function primaryShortlistStatusChip(view, deps = {}){
    const item = view && view.item ? view.item : view;
    const visualState = deps.resolveVisualState
      ? deps.resolveVisualState(item, 'scanner')
      : null;
    const badge = visualState && visualState.badge
      ? visualState.badge
      : deps.getBadge('monitor');
    return {
      label:badge.text,
      className:badge.className,
      modifiers:[],
      primaryState:(deps.normalizeVerdict || deps.normalizeGlobalVerdictKey)(visualState && (visualState.finalVerdict || visualState.final_verdict) || 'monitor')
    };
  }

  function resolveVisualState(record, context = 'scanner', options = {}, deps = {}){
    const safeRecord = record && typeof record === 'object' ? record : {};
    const derivedStates = options.derivedStates || deps.analysisDerivedStatesFromRecord(safeRecord);
    const legacyVerdict = typeof deps.resolveGlobalVerdict === 'function'
      ? deps.resolveGlobalVerdict(safeRecord)
      : null;
    const effectivePlan = options.effectivePlan || deps.effectivePlanForRecord(safeRecord, {allowScannerFallback:true});
    const displayedPlan = options.displayedPlan || deps.deriveCurrentPlanState(
      effectivePlan.entry,
      effectivePlan.stop,
      effectivePlan.firstTarget,
      safeRecord.marketData && safeRecord.marketData.currency
    );
    const resolvedContract = options.resolvedContract || deps.resolveFinalStateContract(safeRecord, {
      context,
      derivedStates,
      displayedPlan
    });
    const lifecycleSnapshot = typeof deps.syncWatchlistLifecycle === 'function'
      ? (deps.syncWatchlistLifecycle(safeRecord) || (typeof deps.watchlistLifecycleSnapshot === 'function' ? deps.watchlistLifecycleSnapshot(safeRecord) : null))
      : (typeof deps.watchlistLifecycleSnapshot === 'function' ? deps.watchlistLifecycleSnapshot(safeRecord) : null);
    const priority = typeof deps.watchlistPriorityForRecord === 'function'
      ? deps.watchlistPriorityForRecord(safeRecord)
      : {score:0};
    const rawVerdict = finalVerdictFromResolvedContract(resolvedContract, derivedStates, deps);
    const structureState = String(derivedStates && derivedStates.structureState || '').trim().toLowerCase();
    const canonicalVerdict = legacyVerdict && legacyVerdict.final_verdict
      ? String(legacyVerdict.final_verdict)
      : rawVerdict;
    const trackPresentation = typeof deps.resolveTrackPresentationModel === 'function'
      ? deps.resolveTrackPresentationModel(safeRecord, legacyVerdict, lifecycleSnapshot, priority)
      : null;
    const avoidAllowedByStructureConsistencyGuard = structureState === 'broken';
    const deadGuardApplied = structureState !== 'broken' && (canonicalVerdict === 'dead' || canonicalVerdict === 'avoid');
    const pendingResolution = options.pendingResolution === true;
    const finalVerdict = pendingResolution ? 'monitor' : (deadGuardApplied ? 'monitor' : canonicalVerdict);
    const terminalAvoidApplied = !!(
      !pendingResolution
      && context === 'review'
      && trackPresentation
      && trackPresentation.presentationBucket === 'avoid'
    );
    const diminishingPreservedInReview = !!(
      !pendingResolution
      && context === 'review'
      && trackPresentation
      && trackPresentation.presentationBucket === 'diminishing'
      && !terminalAvoidApplied
    );
    const renderedVerdict = terminalAvoidApplied
      ? 'avoid'
      : (diminishingPreservedInReview ? 'diminishing' : finalVerdict);
    const state = pendingResolution ? 'monitor' : visualStateKey(renderedVerdict, deps);
    const visual_tone = visualToneForState(state);
    const score = clampScore(options.setupScore != null ? options.setupScore : deps.setupScoreForRecord(safeRecord));
    const styleAttr = visualStyleForState(state, score);
    const badge = pendingResolution
      ? {text:'⏳ Reviewing', className:'near'}
      : (diminishingPreservedInReview
        ? {text:'Diminishing', className:'badge--diminishing'}
        : deps.getBadge(renderedVerdict));
    const bucket = pendingResolution
      ? 'monitor_watch'
      : (terminalAvoidApplied
        ? 'avoid_dead'
        : (diminishingPreservedInReview
          ? 'diminishing'
          : (legacyVerdict && legacyVerdict.bucket ? legacyVerdict.bucket : deps.getBucket(renderedVerdict))));
    const normalizedRenderedVerdict = (deps.normalizeVerdict || deps.normalizeGlobalVerdictKey)(renderedVerdict);
    const normalizedLegacyVerdict = legacyVerdict
      ? (deps.normalizeVerdict || deps.normalizeGlobalVerdictKey)(legacyVerdict.final_verdict || legacyVerdict.finalVerdict || '')
      : '';
    const conflictingLegacyStateDetected = !!(
      normalizedLegacyVerdict
      && normalizedLegacyVerdict !== normalizedRenderedVerdict
    );
    const explicitInvalidationReason = legacyVerdict && legacyVerdict.explicit_invalidation_reason
      ? String(legacyVerdict.explicit_invalidation_reason)
      : '(none)';
    const lifecycleDropReason = legacyVerdict && legacyVerdict.lifecycle_drop_reason
      ? String(legacyVerdict.lifecycle_drop_reason)
      : '(none)';
    const summaryOptions = {
      structuralState:resolvedContract && resolvedContract.structuralState,
      structureState,
      structureEligibility:legacyVerdict && legacyVerdict.structure_eligibility,
      viability:legacyVerdict && legacyVerdict.viability,
      isExtended:legacyVerdict && legacyVerdict.is_extended === true,
      reviewPresentationState:diminishingPreservedInReview ? 'diminishing' : '',
      trackPresentationBucket:trackPresentation && trackPresentation.presentationBucket || ''
    };
    const resolvedSummary = pendingResolution
      ? 'Reviewing setup with live data before final status.'
      : decisionSummaryForVerdict(renderedVerdict, summaryOptions, deps);
    const cardClass = cardClassForState(state);
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
      review_presentation_state:diminishingPreservedInReview ? 'diminishing' : renderedVerdict,
      review_presentation_source:diminishingPreservedInReview ? 'track_lifecycle' : 'resolver',
      terminal_avoid_applied:terminalAvoidApplied,
      terminal_avoid_reason:terminalAvoidApplied
        ? (trackPresentation && (trackPresentation.terminalAvoidReason || trackPresentation.presentationReason) || 'Terminal avoid/dead overrides diminishing.')
        : null,
      diminishing_preserved_in_review:diminishingPreservedInReview,
      bucket,
      allowPlan:['entry','near_entry'].includes(finalVerdict),
      allow_plan:['entry','near_entry'].includes(finalVerdict),
      allowWatchlist:['monitor','near_entry','entry'].includes(finalVerdict),
      allow_watchlist:['monitor','near_entry','entry'].includes(finalVerdict),
      reason:pendingResolution
        ? 'Reviewing setup with live data before final status.'
        : (legacyVerdict && legacyVerdict.main_blocker) || resolvedSummary,
      ui_state_source:'resolveFinalStateContract',
      final_verdict_rendered:renderedVerdict,
      bucket_rendered:bucket,
      dead_guard_applied:deadGuardApplied,
      dead_trigger_source:rawVerdict === 'dead' || rawVerdict === 'avoid'
        ? (avoidAllowedByStructureConsistencyGuard ? 'structure_broken' : null)
        : null,
      explicit_invalidation_reason:explicitInvalidationReason,
      structure_to_label_mapping_source:'resolveVisualState(structure_guard)',
      lifecycle_drop_reason:lifecycleDropReason,
      avoid_allowed_by_structure_consistency_guard:avoidAllowedByStructureConsistencyGuard,
      conflicting_legacy_state_detected:conflictingLegacyStateDetected,
      trackPresentationBucket:trackPresentation && trackPresentation.presentationBucket || '',
      trackPresentationTone:trackPresentation && trackPresentation.presentationTone || '',
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
    resolveVisualState,
    resolveGlobalVisualState,
    resolveEmojiPresentation
  };
})(window);
