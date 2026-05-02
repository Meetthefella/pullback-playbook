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
    if(state === 'entry') return {top:'#008C89', border:'rgba(0, 140, 137, 0.42)'};
    if(state === 'near_entry') return {top:'#35A0A0', border:'rgba(53, 160, 160, 0.42)'};
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

  function decisionSummaryForVerdict(finalVerdict, options = {}, deps = {}){
    const verdict = coerceCanonicalVerdict(finalVerdict, deps);
    if(verdict === 'entry') return 'Entry - your plan fits.';
    if(verdict === 'near_entry') return 'Near Entry - almost ready. Watch for confirmation.';
    if(verdict === 'avoid') return 'Avoid - too weak or broken. Leave it alone.';
    const structureEligibility = String(options && options.structureEligibility || '').toLowerCase();
    if(structureEligibility === 'damaged') return 'Watch - structure weakening.';
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
    const rawVerdict = finalVerdictFromResolvedContract(resolvedContract, derivedStates, deps);
    const canonicalVerdict = coerceCanonicalVerdict(
      legacyVerdict && legacyVerdict.final_verdict ? String(legacyVerdict.final_verdict) : rawVerdict,
      deps
    );
    const finalVerdict = options.pendingResolution === true ? 'watch' : canonicalVerdict;
    const renderedVerdict = finalVerdict;
    const state = visualStateKey(renderedVerdict, deps);
    const structureEligibility = String(legacyVerdict && legacyVerdict.structure_eligibility || '').trim().toLowerCase();
    const viability = String(legacyVerdict && legacyVerdict.viability || '').trim().toLowerCase();
    const structureState = String(derivedStates && derivedStates.structureState || '').trim().toLowerCase();
    const weakeningButAlive = finalVerdict === 'watch'
      && (
        structureEligibility === 'damaged'
        || structureState === 'weakening'
        || viability === 'low_priority'
      );
    let visual_tone = finalVerdict === 'avoid' ? 'avoid' : visualToneForState(state);
    if(weakeningButAlive && finalVerdict === 'watch'){
      visual_tone = 'diminishing';
    }
    if(visual_tone === 'diminishing' && finalVerdict !== 'watch'){
      visual_tone = finalVerdict === 'avoid' ? 'avoid' : 'monitor';
    }
    const score = clampScore(options.setupScore != null ? options.setupScore : deps.setupScoreForRecord(safeRecord));
    const styleAttr = visualStyleForState(state, score);
    const badge = deps.getBadge(renderedVerdict);
    const bucket = legacyVerdict && legacyVerdict.bucket ? legacyVerdict.bucket : deps.getBucket(renderedVerdict);
    const summaryOptions = {
      structuralState:resolvedContract && resolvedContract.structuralState,
      structureState:String(derivedStates && derivedStates.structureState || '').trim().toLowerCase(),
      structureEligibility:legacyVerdict && legacyVerdict.structure_eligibility
    };
    const resolvedSummary = weakeningButAlive
      ? 'Watch - setup weakening but still alive.'
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
      review_presentation_state:weakeningButAlive ? 'diminishing' : renderedVerdict,
      review_presentation_source:'resolver',
      terminal_avoid_applied:false,
      terminal_avoid_reason:null,
      diminishing_preserved_in_review:weakeningButAlive,
      bucket,
      allowPlan:['entry','near_entry'].includes(finalVerdict),
      allow_plan:['entry','near_entry'].includes(finalVerdict),
      allowWatchlist:['watch','near_entry','entry'].includes(finalVerdict),
      allow_watchlist:['watch','near_entry','entry'].includes(finalVerdict),
      reason:(legacyVerdict && legacyVerdict.main_blocker) || resolvedSummary,
      reason_state:finalVerdict === 'avoid'
        ? (String(derivedStates && derivedStates.structureState || '').trim().toLowerCase() === 'broken' ? 'broken_structure' : 'invalidated')
        : (weakeningButAlive ? 'weakening_but_alive' : 'waiting_for_confirmation'),
      ui_state_source:'resolveFinalStateContract',
      final_verdict_rendered:renderedVerdict,
      bucket_rendered:bucket,
      dead_guard_applied:false,
      dead_trigger_source:null,
      explicit_invalidation_reason:legacyVerdict && legacyVerdict.explicit_invalidation_reason ? String(legacyVerdict.explicit_invalidation_reason) : '(none)',
      structure_to_label_mapping_source:'resolveVisualState(structure_guard)',
      lifecycle_drop_reason:legacyVerdict && legacyVerdict.lifecycle_drop_reason ? String(legacyVerdict.lifecycle_drop_reason) : '(none)',
      avoid_allowed_by_structure_consistency_guard:String(derivedStates && derivedStates.structureState || '').trim().toLowerCase() === 'broken',
      conflicting_legacy_state_detected:false,
      trackPresentationBucket:'',
      trackPresentationTone:'',
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
