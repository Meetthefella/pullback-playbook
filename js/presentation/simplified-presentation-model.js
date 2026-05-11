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
