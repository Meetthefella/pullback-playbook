(function(global){
  // Canonical resolver-support helpers extracted from app.js.
  function baseVerdictFromResolvedContract(resolved, deps = {}){
    const safeResolved = resolved && typeof resolved === 'object' ? resolved : {};
    const structuralState = String(safeResolved.structuralState || '').toLowerCase();
    const actionStateKey = String(safeResolved.actionStateKey || '').toLowerCase();
    const tradeabilityVerdict = deps.normalizeAnalysisVerdict(safeResolved.tradeabilityVerdict || safeResolved.finalVerdict || '');
    if(structuralState === 'dead' || actionStateKey === 'rebuild_setup') return 'dead';
    if(structuralState === 'entry' || actionStateKey === 'ready_to_act' || tradeabilityVerdict === 'Entry') return 'entry';
    if(structuralState === 'near_entry' || tradeabilityVerdict === 'Near Entry') return 'near_entry';
    if(actionStateKey === 'wait_for_confirmation') return 'monitor';
    if(actionStateKey === 'recalculate_plan' || structuralState === 'developing') return 'watch';
    if(tradeabilityVerdict === 'Avoid') return 'watch';
    return 'watch';
  }

  function resolverSeedVerdictForRecord(record, deps = {}){
    const item = record && typeof record === 'object' ? record : {};
    const scan = item.scan && typeof item.scan === 'object' ? item.scan : {};
    return deps.normalizeAnalysisVerdict(
      (item.review && item.review.savedVerdict)
      || scan.resolvedVerdict
      || deps.baseVerdictForRecord(item, {includeRuntimeFallback:false})
      || scan.verdict
      || 'Watch'
    );
  }

  function finalVerdictForRecord(record, options = {}, deps = {}){
    const item = record && typeof record === 'object' ? record : {};
    const displayedPlan = options.displayedPlan || deps.deriveCurrentPlanState(
      item.plan && item.plan.entry,
      item.plan && item.plan.stop,
      item.plan && item.plan.firstTarget,
      item.marketData && item.marketData.currency
    );
    const derivedStates = options.derivedStates || deps.analysisDerivedStatesFromRecord(item);
    const planUiState = options.planUiState || deps.getPlanUiState(item, {displayedPlan});
    const baseVerdict = deps.baseVerdictForRecord(item, options);
    const advisoryVerdict = deps.analysisVerdictForRecord(item, options);
    const includeExecutionDowngrade = options.includeExecutionDowngrade !== false;
    const executionVerdict = includeExecutionDowngrade
      ? deps.executionDowngradeVerdictForRecord(item, {displayedPlan, planUiState})
      : '';
    const conservativeVerdict = deps.mostConservativeVerdict(baseVerdict, advisoryVerdict, executionVerdict);
    const deadCheck = deps.isTerminalDeadSetup(item, {derivedStates, displayedPlan});
    const structureState = String(derivedStates.structureState || '').toLowerCase();
    const trendState = String(derivedStates.trendState || '').toLowerCase();
    const structurallyAlive = !deadCheck.dead
      && structureState !== 'broken'
      && trendState !== 'broken'
      && !(item.plan && item.plan.invalidatedState)
      && !(item.plan && item.plan.missedState);
    if(!structurallyAlive) return conservativeVerdict;

    const resolved = deps.resolveFinalStateContract(item, {
      context:options.context || 'review',
      finalVerdict:conservativeVerdict,
      derivedStates,
      displayedPlan,
      planUiState
    });
    if(resolved.structuralState === 'dead' || resolved.actionStateKey === 'rebuild_setup'){
      return conservativeVerdict === 'Entry' ? 'Near Entry' : 'Watch';
    }
    if(resolved.actionStateKey === 'ready_to_act') return 'Entry';
    if(resolved.structuralState === 'near_entry') return 'Near Entry';
    return conservativeVerdict === 'Avoid' ? 'Watch' : conservativeVerdict;
  }

  function displayStageForRecord(record, options = {}, deps = {}){
    return finalVerdictForRecord(record, options, deps);
  }

  function reviewHeaderVerdictForRecord(record, deps = {}){
    const item = record && typeof record === 'object' ? record : {};
    const displayedPlan = deps.deriveCurrentPlanState(
      item.plan && item.plan.entry,
      item.plan && item.plan.stop,
      item.plan && item.plan.firstTarget,
      item.marketData && item.marketData.currency
    );
    const derivedStates = deps.analysisDerivedStatesFromRecord(item);
    const deadCheck = deps.isTerminalDeadSetup(item, {derivedStates, displayedPlan});
    const verdict = finalVerdictForRecord(item, {
      includeExecutionDowngrade:false,
      includeRuntimeFallback:false,
      context:'review',
      derivedStates,
      displayedPlan
    }, deps);
    if(deadCheck.dead) return verdict;
    return verdict === 'Avoid' ? 'Watch' : verdict;
  }

  global.ResolverSupport = {
    baseVerdictFromResolvedContract,
    resolverSeedVerdictForRecord,
    finalVerdictForRecord,
    displayStageForRecord,
    reviewHeaderVerdictForRecord
  };
})(window);
