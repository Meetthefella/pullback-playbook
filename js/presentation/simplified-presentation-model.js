(function(global){
  function canonicalVerdict(value){
    const normalizer = global.ResolverCore && (global.ResolverCore.normalizeGlobalVerdictKey || global.ResolverCore.normalizeVerdict);
    if(typeof normalizer === 'function'){
      const normalized = normalizer(value || 'watch');
      return ['entry','near_entry','watch','avoid'].includes(normalized) ? normalized : 'watch';
    }
    const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
    if(safe === 'entry' || safe === 'near_entry' || safe === 'avoid') return safe;
    return 'watch';
  }

  function firstText(values){
    for(let index = 0; index < values.length; index += 1){
      const value = values[index];
      if(Array.isArray(value) && value.length) return String(value[0] || '').trim();
      if(typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
  }

  function normalizeMainBlockerCopy(mainBlocker, resolved){
    const text = String(mainBlocker || '').trim();
    const state = resolved && typeof resolved === 'object' ? resolved : {};
    const semanticReason = String(state.semantic_blocker_reason || state.semanticBlockerReason || '').trim();
    const semanticCode = String(state.semantic_blocker_code || state.semanticBlockerCode || '').trim();
    if(state.non_terminal_recovery_blocker === true || semanticCode){
      return semanticReason || 'Recovery attempt in progress. Wait for price to stabilise before considering entry.';
    }
    const structureState = String(state.structure_state || state.structureState || '').trim().toLowerCase();
    const rejectedByViability = state.rejected_by_viability_gate === true
      || state.rejectedByViabilityGate === true
      || String(state.viability || '').trim().toLowerCase() === 'reject';
    if(
      rejectedByViability
      && /^structure is broken\.?$/i.test(text)
      && ['weak','weakening','developing_loose'].includes(structureState)
    ){
      return structureState === 'weak'
        ? 'Structure is weak and viability rejected the setup.'
        : 'Trend is weakening and viability rejected the setup.';
    }
    const resolvedVerdict = canonicalVerdict(state.final_verdict || state.finalVerdict || 'watch');
    const structureEligibility = String(state.structure_eligibility || state.structureEligibility || '').trim().toLowerCase();
    const setupLocationState = String(state.setup_location_state || state.setupLocationState || '').trim().toLowerCase();
    const priceabilityState = String(state.priceability_state || state.priceabilityState || '').trim().toLowerCase();
    const bounceState = String(state.bounce_state || state.bounceState || '').trim().toLowerCase();
    const viabilityBranchId = String(state.viabilityBranchId || state.viability_branch_id || '').trim().toLowerCase();
    const aliveStructure = structureEligibility === 'alive'
      || ['strong','intact','developing_clean'].includes(structureState);
    const structuralWeakness = ['damaged','broken'].includes(structureEligibility)
      || ['weak','weakening','broken','failed','developing_loose'].includes(structureState);
    if(
      resolvedVerdict === 'watch'
      && aliveStructure
      && !structuralWeakness
      && /trend is weakening|structure (?:is )?(?:weakening|deteriorating|broken)|failed/i.test(text)
    ){
      if(setupLocationState === 'volatile' || priceabilityState === 'unpriceable'){
        return ['attempt','early','developing'].includes(bounceState)
          ? 'The broader uptrend is still intact, but the pullback has become volatile and the bounce attempt is not yet stable enough to price reliably.'
          : 'Recovery attempt is developing, but price has not stabilised enough yet. Setup is not clean enough to price reliably yet.';
      }
      return 'Setup is not actionable yet. Wait for clearer stabilisation and a reliable entry/stop area.';
    }
    if(
      resolvedVerdict === 'watch'
      && aliveStructure
      && !structuralWeakness
      && ['attempt','early','developing'].includes(bounceState)
      && /no (?:signs? of )?(?:stabili[sz]ation|bounce)|no bounce(?: yet| confirmation)?|bounce (?:is )?not (?:present|there)/i.test(text)
    ){
      return priceabilityState === 'unpriceable' || setupLocationState === 'volatile'
        ? 'The broader uptrend is still intact, but the pullback has become volatile and the bounce attempt is not yet stable enough to price reliably.'
        : 'Bounce attempt present, but confirmation is not strong enough yet.';
    }
    const setupScoreValue = state.setup_score ?? state.setupScore;
    const setupScore = Number.isFinite(Number(setupScoreValue)) ? Number(setupScoreValue) : null;
    const weakBounceOnlyCopy = /^no bounce confirmation yet\.?$/i.test(text) || /^developing - waiting for confirmation\.?$/i.test(text);
    if(
      resolvedVerdict === 'watch'
      && structureEligibility === 'alive'
      && weakBounceOnlyCopy
      && (
        ['none','extended','volatile','off_level','unclear'].includes(setupLocationState)
        || priceabilityState === 'unpriceable'
        || viabilityBranchId.includes('low_score')
        || (setupScore !== null && setupScore < 5)
      )
    ){
      if(setupLocationState === 'none' || setupLocationState === 'off_level' || setupLocationState === 'unclear'){
        return 'Strong trend, but no usable pullback setup yet. Wait for a cleaner reset near support.';
      }
      if(priceabilityState === 'unpriceable' || setupLocationState === 'extended' || setupLocationState === 'volatile'){
        return 'Setup is not priceable yet. No reliable entry or stop area is available.';
      }
      return 'Setup quality has slipped below useful watchlist quality. Wait for a cleaner reset near support.';
    }
    return text;
  }

  function buildPresentationModel({surface = 'scanner', record, planState, resolvedState, visualState} = {}){
    const item = record && typeof record === 'object' ? record : {};
    const resolved = resolvedState && typeof resolvedState === 'object' ? resolvedState : {};
    const visual = visualState && typeof visualState === 'object' ? visualState : {};
    const plan = planState && typeof planState === 'object' ? planState : {};
    const verdict = canonicalVerdict(
      visual.canonicalVerdict
      || visual.finalVerdict
      || visual.final_verdict
      || resolved.final_verdict
      || resolved.finalVerdict
      || 'watch'
    );
    const badge = visual.badge || resolved.badge || {};
    const action = resolved.action || {};
    const entryReasons = Array.isArray(resolved.entry_gate_reasons) ? resolved.entry_gate_reasons.slice() : [];
    const nearReasons = Array.isArray(resolved.near_entry_gate_reasons) ? resolved.near_entry_gate_reasons.slice() : [];
    const blockers = []
      .concat(nearReasons)
      .concat(entryReasons)
      .filter(Boolean);
    const mainBlocker = normalizeMainBlockerCopy(firstText([
      resolved.main_blocker,
      resolved.promotionBlockedReason,
      visual.reason,
      resolved.reason,
      blockers
    ]), resolved);

    return {
      ticker:String(item.ticker || item.symbol || '').trim().toUpperCase(),
      canonicalVerdict:verdict,
      visualBucket:String(visual.visualBucket || visual.presentationBucket || visual.bucket || resolved.bucket || 'monitor').trim().toLowerCase() || 'monitor',
      tone:String(visual.tone || visual.visual_tone || resolved.tone || 'monitor').trim().toLowerCase() || 'monitor',
      badgeLabel:String(badge.text || badge.label || resolved.badgeLabel || (global.ResolverCore && global.ResolverCore.globalVerdictLabel ? global.ResolverCore.globalVerdictLabel(verdict) : 'Watch')).trim(),
      actionLabel:String(action.label || resolved.actionLabel || visual.decision_summary || '').trim(),
      planVisible:plan.planVisible === true || String(plan.status || '').toLowerCase() === 'valid',
      planStatus:String(plan.status || 'missing').trim().toLowerCase() || 'missing',
      mainBlocker,
      entryGatePass:resolved.entry_gate_pass === true,
      nearEntryGatePass:resolved.near_entry_gate_pass === true,
      blockers,
      debug:{
        surface,
        source:'simplified-state-pipeline',
        resolvedFinalVerdict:resolved.final_verdict || resolved.finalVerdict || '',
        visualFinalVerdict:visual.finalVerdict || visual.final_verdict || '',
        planSource:plan.planSourceUsedForRisk || '',
        entryGateChecks:resolved.entry_gate_checks || {},
        nearEntryGateChecks:resolved.near_entry_gate_checks || {},
        resolvedState,
        visualState
      }
    };
  }

  global.SimplifiedPresentationModel = {
    buildPresentationModel
  };
})(window);
