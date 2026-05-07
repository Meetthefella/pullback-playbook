(function(global){
  function safeWatchModel(record, surface, reason, error){
    const builder = global.SimplifiedPresentationModel && global.SimplifiedPresentationModel.buildPresentationModel;
    const fallback = {
      final_verdict:'watch',
      bucket:'monitor',
      tone:'monitor',
      badge:{text:'Watch'},
      action:{label:'WATCH'},
      reason:String(reason || 'Simplified pipeline unavailable.'),
      main_blocker:String(reason || 'Simplified pipeline unavailable.'),
      entry_gate_pass:false,
      near_entry_gate_pass:false,
      entry_gate_reasons:[String(reason || 'Simplified pipeline unavailable.')],
      near_entry_gate_reasons:[String(reason || 'Simplified pipeline unavailable.')]
    };
    const visual = {
      canonicalVerdict:'watch',
      finalVerdict:'watch',
      visualBucket:'monitor',
      tone:'monitor',
      badge:{text:'Watch'},
      reason:fallback.reason
    };
    const plan = {status:'missing', planVisible:false};
    const result = typeof builder === 'function'
      ? builder({surface, record, planState:plan, resolvedState:fallback, visualState:visual})
      : {
        ticker:String(record && (record.ticker || record.symbol) || '').trim().toUpperCase(),
        canonicalVerdict:'watch',
        visualBucket:'monitor',
        tone:'monitor',
        badgeLabel:'Watch',
        actionLabel:'WATCH',
        planVisible:false,
        planStatus:'missing',
        mainBlocker:fallback.reason,
        entryGatePass:false,
        nearEntryGatePass:false,
        blockers:[fallback.reason],
        debug:{surface, source:'simplified-state-pipeline', error:String(error && error.message || error || '')}
      };
    result.debug = {
      ...(result.debug || {}),
      safeFallback:true,
      error:String(error && error.message || error || ''),
      stack:String(error && error.stack || '')
    };
    return result;
  }

  function mergeDeps(options = {}){
    const deps = options.deps && typeof options.deps === 'object' ? options.deps : {};
    return {
      ...deps,
      normalizeGlobalVerdictKey:deps.normalizeGlobalVerdictKey || (global.ResolverCore && global.ResolverCore.normalizeGlobalVerdictKey),
      normalizeVerdict:deps.normalizeVerdict || (global.ResolverCore && global.ResolverCore.normalizeVerdict),
      getBadge:deps.getBadge || (global.ResolverCore && global.ResolverCore.getBadge),
      getActions:deps.getActions || (global.ResolverCore && global.ResolverCore.getActions),
      setupScoreForRecord:deps.setupScoreForRecord || (() => 0),
      scannerScoreGradientClass:deps.scannerScoreGradientClass || (() => ''),
      isHostileMarketStatus:deps.isHostileMarketStatus || (() => false),
      state:deps.state || {marketStatus:'S&P above 50 MA'}
    };
  }

  function fallbackEffectivePlan(record){
    const item = record && typeof record === 'object' ? record : {};
    const plan = item.plan && typeof item.plan === 'object' ? item.plan : {};
    return {
      entry:plan.entry,
      stop:plan.stop,
      firstTarget:plan.firstTarget ?? plan.target,
      source:String(plan.source || '')
    };
  }

  function fallbackDerivedStates(record){
    const item = record && typeof record === 'object' ? record : {};
    const setup = item.setup && typeof item.setup === 'object' ? item.setup : {};
    return {
      structureState:String(setup.structureState || setup.structure_state || '').toLowerCase(),
      trendState:String(setup.trendState || setup.trend_state || '').toLowerCase(),
      bounceState:String(setup.bounceState || setup.bounce_state || '').toLowerCase(),
      stabilisationState:String(setup.stabilisationState || setup.stabilisation_state || '').toLowerCase(),
      pullbackZone:String(setup.pullbackZone || setup.pullback_zone || '').toLowerCase(),
      volumeState:String(setup.volumeState || setup.volume_state || 'normal').toLowerCase()
    };
  }

  function baseVerdictFromResolvedContract(resolved){
    const contract = resolved && typeof resolved === 'object' ? resolved : {};
    const raw = String(contract.baseVerdict || contract.finalVerdict || contract.final_verdict || 'watch').toLowerCase();
    if(raw.indexOf('near') >= 0) return 'near_entry';
    if(raw.indexOf('entry') >= 0) return 'entry';
    if(raw.indexOf('avoid') >= 0 || raw.indexOf('dead') >= 0) return 'avoid';
    return 'watch';
  }

  function fallbackPreLifecycleContract(record, derivedStates, planState){
    const structureState = String(derivedStates.structureState || '').toLowerCase();
    const trendState = String(derivedStates.trendState || '').toLowerCase();
    const broken = structureState === 'broken' || trendState === 'broken';
    return {
      finalVerdict:broken ? 'Avoid' : 'Watch',
      structuralState:broken ? 'dead' : 'developing',
      actionStateKey:broken ? 'rebuild_setup' : 'recalculate_plan',
      planStatusKey:String(planState && planState.status || 'missing').toLowerCase(),
      tradeabilityVerdict:broken ? 'Avoid' : 'Watch',
      blockerReason:broken ? 'Structure is broken' : 'Plan not ready',
      reasonSummary:broken ? 'Structure is broken' : 'Pre-watchlist setup',
      terminal:broken,
      baseVerdict:broken ? 'avoid' : 'watch'
    };
  }

  function resolveRecordState(record, options = {}){
    const surface = options.surface || options.context || 'scanner';
    try{
      if(!global.SimplifiedPlanState || !global.SimplifiedPresentationModel){
        return safeWatchModel(record, surface, 'Simplified pipeline modules are not loaded.');
      }
      if(!global.ResolverCore || typeof global.ResolverCore.resolveGlobalVerdict !== 'function'){
        return safeWatchModel(record, surface, 'ResolverCore is not available.');
      }
      if(!global.ResolverPresentation || typeof global.ResolverPresentation.resolveVisualState !== 'function'){
        return safeWatchModel(record, surface, 'ResolverPresentation is not available.');
      }

      const deps = mergeDeps(options);
      const item = record && typeof record === 'object' ? record : {};
      const effectivePlan = typeof deps.effectivePlanForRecord === 'function'
        ? deps.effectivePlanForRecord(item, {allowScannerFallback:true})
        : fallbackEffectivePlan(item);
      const riskSettings = typeof deps.riskSettingsProvider === 'function'
        ? deps.riskSettingsProvider(item)
        : (deps.riskSettings || options.riskSettings || {});
      const planState = global.SimplifiedPlanState.deriveCurrentPlanState(item, effectivePlan, riskSettings, deps);
      const derivedStates = typeof deps.analysisDerivedStatesFromRecord === 'function'
        ? deps.analysisDerivedStatesFromRecord(item)
        : fallbackDerivedStates(item);
      const validation = global.SimplifiedPlanState.validateCurrentPlan(item, planState, {derivedStates, deps});
      const resolverDeps = {
        ...deps,
        analysisDerivedStatesFromRecord:() => derivedStates,
        effectivePlanForRecord:() => effectivePlan,
        deriveCurrentPlanState:() => planState,
        applySetupConfirmationPlanGate:deps.applySetupConfirmationPlanGate || ((unusedRecord, displayedPlan) => displayedPlan),
        baseVerdictFromResolvedContract:deps.baseVerdictFromResolvedContract || baseVerdictFromResolvedContract,
        resolvePreLifecycleStateContract:deps.resolvePreLifecycleStateContract || ((inputRecord) => fallbackPreLifecycleContract(inputRecord, derivedStates, planState)),
        resolveFinalStateContract:deps.resolveFinalStateContract || ((inputRecord) => fallbackPreLifecycleContract(inputRecord, derivedStates, planState)),
        evaluatePlanRealism:deps.evaluatePlanRealism || (() => ({credible_rr:planState.rr})),
        setupScoreForRecord:deps.setupScoreForRecord || (() => 0),
        isHostileMarketStatus:deps.isHostileMarketStatus || (() => false),
        scannerScoreGradientClass:deps.scannerScoreGradientClass || (() => '')
      };
      const resolvedState = global.ResolverCore.resolveGlobalVerdict(item, resolverDeps);
      const basePresentationContract = resolverDeps.resolveFinalStateContract(item, {context:surface, derivedStates, displayedPlan:planState});
      const resolvedVerdictLabel = global.ResolverCore.globalVerdictLabel
        ? global.ResolverCore.globalVerdictLabel(resolvedState && resolvedState.final_verdict)
        : (resolvedState && resolvedState.final_verdict || 'Watch');
      const presentationContract = {
        ...(basePresentationContract && typeof basePresentationContract === 'object' ? basePresentationContract : {}),
        finalVerdict:resolvedVerdictLabel,
        final_verdict:resolvedState && resolvedState.final_verdict,
        final_verdict_rendered:resolvedState && resolvedState.final_verdict,
        planStatusKey:(basePresentationContract && basePresentationContract.planStatusKey) || planState.status || 'missing',
        blockerReason:(resolvedState && (resolvedState.main_blocker || resolvedState.reason)) || (basePresentationContract && basePresentationContract.blockerReason) || '',
        reasonSummary:(resolvedState && (resolvedState.reason || resolvedState.main_blocker)) || (basePresentationContract && basePresentationContract.reasonSummary) || ''
      };
      const visualState = global.ResolverPresentation.resolveVisualState(
        item,
        surface,
        {
          derivedStates,
          effectivePlan,
          displayedPlan:planState,
          resolvedContract:presentationContract,
          setupScore:resolverDeps.setupScoreForRecord(item)
        },
        {
          ...resolverDeps,
          resolveGlobalVerdict:() => resolvedState,
          getBadge:resolverDeps.getBadge || global.ResolverCore.getBadge,
          normalizeGlobalVerdictKey:resolverDeps.normalizeGlobalVerdictKey || global.ResolverCore.normalizeGlobalVerdictKey,
          normalizeVerdict:resolverDeps.normalizeVerdict || global.ResolverCore.normalizeVerdict
        }
      );
      const result = global.SimplifiedPresentationModel.buildPresentationModel({
        surface,
        record:item,
        planState,
        resolvedState,
        visualState
      });
      result.debug = {
        ...(result.debug || {}),
        validation,
        derivedStates,
        effectivePlan,
        pipeline:'record->effectivePlan->planState->validate->ResolverCore->ResolverPresentation->presentationModel'
      };
      if(options.log !== false && global.console && typeof global.console.info === 'function'){
        global.console.info('[SIMPLIFIED_STATE_PIPELINE]', result);
      }
      return result;
    }catch(error){
      const result = safeWatchModel(record, surface, 'Simplified pipeline failed safely.', error);
      if(options.log !== false && global.console && typeof global.console.info === 'function'){
        global.console.info('[SIMPLIFIED_STATE_PIPELINE]', result);
      }
      return result;
    }
  }

  global.SimplifiedTradeState = {
    resolveRecordState
  };
})(window);
