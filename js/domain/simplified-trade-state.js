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
      setupLocationState:String(setup.setupLocationState || setup.setup_location_state || '').toLowerCase(),
      priceabilityState:String(setup.priceabilityState || setup.priceability_state || '').toLowerCase(),
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

  function stableDebugValue(value, depth = 0, seen){
    if(value == null) return value;
    const type = typeof value;
    if(type === 'string' || type === 'boolean') return value;
    if(type === 'number') return Number.isFinite(value) ? Number(value.toFixed ? value.toFixed(4) : value) : String(value);
    if(type === 'function' || type === 'symbol' || type === 'undefined') return undefined;
    if(depth > 4) return '[depth]';
    const refs = seen || [];
    if(refs.indexOf(value) >= 0) return '[circular]';
    const nextSeen = refs.concat([value]);
    if(Array.isArray(value)){
      return value.slice(0, 60).map(entry => stableDebugValue(entry, depth + 1, nextSeen)).filter(entry => entry !== undefined);
    }
    if(type === 'object'){
      const output = {};
      Object.keys(value).sort().forEach(key => {
        if(/^(chart|image|screenshot|rawAi|rawAnalysis|html|element|node)$/i.test(key)) return;
        const stable = stableDebugValue(value[key], depth + 1, nextSeen);
        if(stable !== undefined) output[key] = stable;
      });
      return output;
    }
    return String(value);
  }

  function stableDebugString(value){
    try{
      return JSON.stringify(stableDebugValue(value));
    }catch(error){
      return String(value == null ? '' : value);
    }
  }

  function debugFingerprint(value){
    const input = stableDebugString(value);
    let hash = 2166136261;
    for(let index = 0; index < input.length; index += 1){
      hash ^= input.charCodeAt(index);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return `fp_${(hash >>> 0).toString(16).padStart(8, '0')}_${input.length}`;
  }

  function pickMarketDataForFingerprint(record){
    const item = record && typeof record === 'object' ? record : {};
    const marketData = item.marketData && typeof item.marketData === 'object' ? item.marketData : {};
    return {
      price:item.currentPrice ?? item.price ?? marketData.currentPrice ?? marketData.price ?? marketData.close,
      sma20:marketData.sma20 ?? marketData.ma20 ?? item.sma20,
      sma50:marketData.sma50 ?? marketData.ma50 ?? item.sma50,
      sma200:marketData.sma200 ?? marketData.ma200 ?? item.sma200,
      volume:marketData.volume ?? item.volume,
      averageVolume:marketData.averageVolume ?? marketData.avgVolume ?? item.averageVolume,
      changePercent:marketData.changePercent ?? marketData.changePct ?? item.changePercent,
      asOf:marketData.asOf ?? marketData.timestamp ?? item.marketDataUpdatedAt
    };
  }

  function pickInputForFingerprint(record){
    const item = record && typeof record === 'object' ? record : {};
    return {
      ticker:item.ticker || item.symbol || '',
      setup:item.setup || {},
      plan:item.plan || {},
      lifecycle:item.lifecycle || item.lifecycleState || item.reviewLifecycle || '',
      tradeability:item.tradeability || item.tradeabilityState || '',
      verdict:item.finalVerdict || item.final_verdict || item.verdict || '',
      visual:item.visualBucket || item.bucket || item.tone || '',
      marketData:pickMarketDataForFingerprint(item)
    };
  }

  function derivePipelineDiagnostics(record, options, details){
    const item = record && typeof record === 'object' ? record : {};
    const ticker = String(item.ticker || item.symbol || '').trim().toUpperCase();
    const surface = String(options.surface || options.context || 'scanner');
    const derivedStates = details.derivedStates || {};
    const planState = details.planState || {};
    const resolvedState = details.resolvedState || {};
    const result = details.result || {};
    const inputFingerprint = debugFingerprint(pickInputForFingerprint(item));
    const marketDataFingerprint = debugFingerprint(pickMarketDataForFingerprint(item));
    const planFingerprint = debugFingerprint({
      recordPlan:item.plan || {},
      effectivePlan:details.effectivePlan || {},
      planStatus:planState.status || '',
      entry:planState.entry,
      stop:planState.stop,
      target:planState.target ?? planState.firstTarget,
      rr:planState.rr
    });
    const store = global.__simplifiedStatePipelineDebug && typeof global.__simplifiedStatePipelineDebug === 'object'
      ? global.__simplifiedStatePipelineDebug
      : (global.__simplifiedStatePipelineDebug = {callCounter:0, byKey:{}});
    store.callCounter = Number(store.callCounter || 0) + 1;
    if(!store.byKey || typeof store.byKey !== 'object') store.byKey = {};
    const key = `${surface}:${ticker || '(unknown)'}`;
    const previous = store.byKey[key] || null;
    const diagnostics = {
      callCounter:store.callCounter,
      renderPass:options.renderPass ?? options.reviewRenderPass ?? null,
      surface,
      ticker,
      inputFingerprint,
      marketDataFingerprint,
      planFingerprint,
      inputChangedSincePrevious:previous ? previous.inputFingerprint !== inputFingerprint : false,
      marketDataChangedSincePrevious:previous ? previous.marketDataFingerprint !== marketDataFingerprint : false,
      planChangedSincePrevious:previous ? previous.planFingerprint !== planFingerprint : false,
      previousCanonicalVerdict:previous ? previous.canonicalVerdict : null,
      previousVisualBucket:previous ? previous.visualBucket : null,
      previousMainBlocker:previous ? previous.mainBlocker : null,
      previousInputFingerprint:previous ? previous.inputFingerprint : null,
      previousMarketDataFingerprint:previous ? previous.marketDataFingerprint : null,
      previousPlanFingerprint:previous ? previous.planFingerprint : null,
      structureState:String(derivedStates.structureState || resolvedState.structure_state || resolvedState.structural_state || '').toLowerCase(),
      setupLocationState:String(derivedStates.setupLocationState || resolvedState.setup_location_state || '').toLowerCase(),
      priceabilityState:String(derivedStates.priceabilityState || resolvedState.priceability_state || '').toLowerCase(),
      bounceState:String(derivedStates.bounceState || resolvedState.bounce_state || '').toLowerCase(),
      pullbackZone:String(derivedStates.pullbackZone || resolvedState.pullback_zone || '').toLowerCase(),
      planStatus:String(planState.status || result.planStatus || '').toLowerCase(),
      viability:resolvedState.viability || resolvedState.viability_state || null,
      viabilityBranchId:resolvedState.viabilityBranchId || resolvedState.viability_branch_id || '',
      viabilityBranchLabel:resolvedState.viabilityBranchLabel || resolvedState.viability_branch_label || '',
      viabilityBranchReason:resolvedState.viabilityBranchReason || resolvedState.viability_branch_reason || '',
      viabilityInputs:resolvedState.viabilityInputs || resolvedState.viability_inputs || null,
      rejectedByViabilityGate:resolvedState.rejected_by_viability_gate === true || resolvedState.rejectedByViabilityGate === true,
      terminalAvoidApplied:resolvedState.terminal_avoid_applied === true || resolvedState.terminalAvoidApplied === true,
      canonicalVerdict:result.canonicalVerdict || resolvedState.final_verdict || null,
      visualBucket:result.visualBucket || null,
      mainBlocker:result.mainBlocker || resolvedState.main_blocker || resolvedState.reason || '',
      inputMutationSource:options.mutationSource || options.source || options.reason || options.renderSource || null
    };
    store.byKey[key] = {
      inputFingerprint,
      marketDataFingerprint,
      planFingerprint,
      canonicalVerdict:diagnostics.canonicalVerdict,
      visualBucket:diagnostics.visualBucket,
      mainBlocker:diagnostics.mainBlocker
    };
    return diagnostics;
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
      const pipelineDiagnostics = derivePipelineDiagnostics(item, {...options, surface}, {
        effectivePlan,
        planState,
        derivedStates,
        resolvedState,
        result
      });
      result.debug.pipelineDiagnostics = pipelineDiagnostics;
      if(options.log !== false && global.console && typeof global.console.info === 'function'){
        global.console.info('[SIMPLIFIED_STATE_PIPELINE]', {
          ...pipelineDiagnostics,
          state:result
        });
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
