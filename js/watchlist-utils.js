(function(global){
  // Deterministic watchlist snapshot / summary helpers extracted from app.js.
  function watchlistActionSummary(actionPresentation){
    const label = String(actionPresentation && (actionPresentation.shortLabel || actionPresentation.label) || '').trim();
    if(!label) return 'Monitor';
    if(/stronger volume/i.test(label)) return '🫗 Volume weak - monitor for expansion';
    if(/bounce confirmation/i.test(label)) return 'Wait for bounce confirmation';
    if(/better conditions/i.test(label)) return 'Weak market - wait for better conditions';
    if(/tighter structure|control is not good enough/i.test(label)) return '🔋 Weak control - wait for tighter structure';
    return label;
  }

  function watchlistReasonSummary(reasoning, actionText){
    const actionLower = String(actionText || '').toLowerCase();
    const detailParts = String(reasoning && reasoning.detail || '')
      .split('|')
      .map(part => String(part || '').trim())
      .filter(Boolean);
    const filteredParts = detailParts.filter(part => {
      const text = part.toLowerCase();
      if(!text) return false;
      if(actionLower.includes(text)) return false;
      if(text.includes('volume') && actionLower.includes('volume')) return false;
      if(text.includes('bounce') && actionLower.includes('bounce')) return false;
      if(text.includes('market') && actionLower.includes('market')) return false;
      if(text.includes('control') && actionLower.includes('control')) return false;
      return true;
    });
    if(filteredParts.length) return filteredParts.slice(0, 2).join(' + ');
    return String(reasoning && reasoning.headline || '')
      .replace(/^(Monitor|Downgraded|Avoid|Ready|Prepare):\s*/i, '')
      .trim();
  }

  function normalizeStoredPlanSnapshot(snapshot){
    const source = snapshot && typeof snapshot === 'object' ? snapshot : {};
    return {
      entry:String(source.entry || '').trim(),
      stop:String(source.stop || '').trim(),
      firstTarget:String(source.firstTarget || '').trim(),
      status:String(source.status || '').trim(),
      planState:String(source.planState || '').trim(),
      rr:String(source.rr || '').trim(),
      tradeability:String(source.tradeability || '').trim()
    };
  }

  function storedPlanState(snapshot){
    const plan = normalizeStoredPlanSnapshot(snapshot);
    const hasValues = !!(plan.entry || plan.stop || plan.firstTarget);
    if(!hasValues) return 'NO_PLAN';
    if(String(plan.status || '').toLowerCase() === 'valid') return 'VALID_PLAN';
    return 'INVALID_PLAN';
  }

  function planSnapshotFromDisplayedPlan(displayedPlan, deps = {}){
    const { numericOrNull } = deps;
    const plan = displayedPlan && typeof displayedPlan === 'object' ? displayedPlan : {};
    const rewardRisk = plan.rewardRisk && typeof plan.rewardRisk === 'object' ? plan.rewardRisk : {};
    return normalizeStoredPlanSnapshot({
      entry:Number.isFinite(numericOrNull(plan.entry)) ? Number(numericOrNull(plan.entry)).toFixed(2) : '',
      stop:Number.isFinite(numericOrNull(plan.stop)) ? Number(numericOrNull(plan.stop)).toFixed(2) : '',
      firstTarget:Number.isFinite(numericOrNull(plan.target)) ? Number(numericOrNull(plan.target)).toFixed(2) : '',
      status:String(plan.status || '').trim(),
      planState:'',
      rr:Number.isFinite(numericOrNull(rewardRisk.rrRatio)) ? Number(numericOrNull(rewardRisk.rrRatio)).toFixed(2) : '',
      tradeability:String(plan.tradeability || '').trim()
    });
  }

  function planSnapshotSummary(snapshot, options = {}){
    const plan = normalizeStoredPlanSnapshot(snapshot);
    const state = storedPlanState(plan);
    if(state === 'NO_PLAN') return String(options.emptyLabel || 'None').trim();
    const stateLabel = state === 'VALID_PLAN' ? 'Exists (valid)' : 'Exists (invalid)';
    return `${stateLabel} | Entry ${plan.entry || 'n/a'} | Stop ${plan.stop || 'n/a'} | First target ${plan.firstTarget || 'n/a'}`;
  }

  function planSnapshotsEqual(a, b){
    const left = normalizeStoredPlanSnapshot(a);
    const right = normalizeStoredPlanSnapshot(b);
    return left.entry === right.entry
      && left.stop === right.stop
      && left.firstTarget === right.firstTarget
      && left.status === right.status
      && left.rr === right.rr
      && left.tradeability === right.tradeability;
  }

  function recomputeAttemptedForSource(source){
    return ['auto_recompute','manual_refresh','review','review_save','plan_update'].includes(String(source || '').trim());
  }

  function determineRecomputeResult(previousPlan, newPlan, attempted, deps = {}){
    const { numericOrNull, tradeabilityRank } = deps;
    if(!attempted) return 'Skipped';
    const before = normalizeStoredPlanSnapshot(previousPlan);
    const after = normalizeStoredPlanSnapshot(newPlan);
    if(planSnapshotsEqual(before, after)) return 'Unchanged';
    const beforeState = storedPlanState(before);
    const afterState = storedPlanState(after);
    const beforeRr = numericOrNull(before.rr);
    const afterRr = numericOrNull(after.rr);
    const beforeTradeability = tradeabilityRank(before.tradeability);
    const afterTradeability = tradeabilityRank(after.tradeability);
    if((beforeState !== 'VALID_PLAN' && afterState === 'VALID_PLAN')
      || afterTradeability > beforeTradeability
      || (Number.isFinite(beforeRr) && Number.isFinite(afterRr) && afterRr > beforeRr)
      || (!before.entry && !!after.entry)){
      return 'Improved';
    }
    if(afterState !== 'VALID_PLAN') return 'Failed';
    return 'Unchanged';
  }

  global.WatchlistUtils = {
    watchlistActionSummary,
    watchlistReasonSummary,
    normalizeStoredPlanSnapshot,
    storedPlanState,
    planSnapshotFromDisplayedPlan,
    planSnapshotSummary,
    planSnapshotsEqual,
    recomputeAttemptedForSource,
    determineRecomputeResult
  };
})(window);
