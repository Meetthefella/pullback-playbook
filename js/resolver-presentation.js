(function(global){
  // Canonical resolver presentation helpers extracted from app.js.
  function clampScore(score){
    const numeric = Number.isFinite(Number(score)) ? Number(score) : 0;
    return Math.max(0, Math.min(10, numeric));
  }

  function visualStateKey(finalVerdict, deps = {}){
    const normalized = deps.normalizeGlobalVerdictKey(finalVerdict || '');
    if(normalized === 'entry') return 'entry';
    if(normalized === 'near_entry') return 'near_entry';
    if(normalized === 'monitor') return 'monitor';
    if(normalized === 'avoid' || normalized === 'dead') return 'avoid';
    return 'developing';
  }

  function visualToneForState(state){
    if(state === 'entry' || state === 'near_entry') return 'bullish';
    if(state === 'monitor') return 'caution';
    if(state === 'avoid') return 'danger';
    return 'neutral';
  }

  function visualPaletteForState(state){
    if(state === 'entry'){
      return {top:'#0c2b1d', bottom:'#071a12', border:'rgba(52, 211, 153, 0.34)', glow:'rgba(52, 211, 153, 0.14)'};
    }
    if(state === 'near_entry'){
      return {top:'#123524', bottom:'#0a2017', border:'rgba(74, 222, 128, 0.28)', glow:'rgba(74, 222, 128, 0.10)'};
    }
    if(state === 'monitor'){
      return {top:'#3a2a12', bottom:'#241a0a', border:'rgba(251, 191, 36, 0.26)', glow:'rgba(245, 158, 11, 0.08)'};
    }
    if(state === 'avoid'){
      return {top:'#3a1212', bottom:'#1f0a0a', border:'rgba(248, 113, 113, 0.28)', glow:'rgba(239, 68, 68, 0.10)'};
    }
    return {top:'#2a2a2a', bottom:'#1a1a1a', border:'rgba(148, 163, 184, 0.22)', glow:'rgba(148, 163, 184, 0.06)'};
  }

  function visualStyleForState(state, score){
    const palette = visualPaletteForState(state);
    const intensity = clampScore(score) / 10;
    const highlight = (0.03 + intensity * 0.13).toFixed(3);
    const lift = (0.015 + intensity * 0.055).toFixed(3);
    return `--visual-state-background:linear-gradient(to top, rgba(255,255,255,${highlight}), rgba(255,255,255,${lift})), linear-gradient(to top, ${palette.top}, ${palette.bottom});--visual-state-border:${palette.border};--visual-state-glow:${palette.glow};`;
  }

  function decisionSummaryForVerdict(finalVerdict, deps = {}){
    const verdict = deps.normalizeGlobalVerdictKey(finalVerdict || '');
    if(verdict === 'entry') return 'Entry - your plan fits.';
    if(verdict === 'near_entry') return 'Near Entry - almost ready. Watch for confirmation.';
    if(verdict === 'avoid' || verdict === 'dead') return 'Avoid - too weak or broken. Leave it alone.';
    return 'Monitor - not ready yet. Wait for a clearer bounce.';
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
      primaryState:deps.normalizeGlobalVerdictKey(visualState && (visualState.finalVerdict || visualState.final_verdict) || 'monitor')
    };
  }

  function resolveVisualState(record, context = 'scanner', options = {}, deps = {}){
    const safeRecord = record && typeof record === 'object' ? record : {};
    const derivedStates = options.derivedStates || deps.analysisDerivedStatesFromRecord(safeRecord);
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
    const legacyVerdict = typeof deps.resolveGlobalVerdict === 'function'
      ? deps.resolveGlobalVerdict(safeRecord)
      : null;
    const rawVerdict = finalVerdictFromResolvedContract(resolvedContract, derivedStates, deps);
    const structureState = String(derivedStates && derivedStates.structureState || '').trim().toLowerCase();
    const deadGuardApplied = structureState !== 'broken' && rawVerdict === 'dead';
    const finalVerdict = deadGuardApplied ? 'monitor' : rawVerdict;
    const state = visualStateKey(finalVerdict, deps);
    const visual_tone = visualToneForState(state);
    const score = clampScore(options.setupScore != null ? options.setupScore : deps.setupScoreForRecord(safeRecord));
    const styleAttr = visualStyleForState(state, score);
    const badge = deps.getBadge(finalVerdict);
    const bucket = deps.getBucket(finalVerdict);
    const conflictingLegacyStateDetected = !!(
      legacyVerdict
      && deps.normalizeGlobalVerdictKey(legacyVerdict.final_verdict || '') !== deps.normalizeGlobalVerdictKey(finalVerdict)
    );
    return {
      state,
      decision_summary:decisionSummaryForVerdict(finalVerdict, deps),
      visual_tone,
      score,
      className:`visual-state-card visual-state-${state} visual-tone-${visual_tone}`,
      tone:visual_tone,
      toneClass:`visual-state-${state} visual-tone-${visual_tone}`,
      borderClass:'',
      backgroundClass:'',
      badgeToneClass:'',
      scoreClass:'',
      debugToneSource:'resolveFinalStateContract',
      styleAttr,
      badge,
      finalVerdict,
      final_verdict:finalVerdict,
      bucket,
      allowPlan:['entry','near_entry'].includes(finalVerdict),
      allow_plan:['entry','near_entry'].includes(finalVerdict),
      allowWatchlist:['monitor','near_entry','entry'].includes(finalVerdict),
      allow_watchlist:['monitor','near_entry','entry'].includes(finalVerdict),
      reason:decisionSummaryForVerdict(finalVerdict, deps),
      ui_state_source:'resolveFinalStateContract',
      final_verdict_rendered:finalVerdict,
      bucket_rendered:bucket,
      dead_guard_applied:deadGuardApplied,
      dead_trigger_source:rawVerdict === 'dead' || rawVerdict === 'avoid'
        ? (structureState === 'broken' ? 'structure_broken' : 'explicit_invalidation')
        : null,
      conflicting_legacy_state_detected:conflictingLegacyStateDetected,
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
