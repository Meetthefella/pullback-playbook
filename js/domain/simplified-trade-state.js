(function(global){
  const simplifiedTraceState = {};

  function simplifiedDebugFlagEnabled(flagName){
    try{
      if(global && global[flagName] === true) return true;
      if(global && global.localStorage) return global.localStorage.getItem(flagName) === '1';
    }catch(_error){}
    return false;
  }

  function coalescedSimplifiedTrace(flagName, label, payload, options = {}){
    if(!simplifiedDebugFlagEnabled(flagName) || !global.console || typeof global.console.info !== 'function') return;
    const key = String(options.key || `${label}:${payload && payload.ticker || ''}`);
    const now = Date.now();
    const minIntervalMs = Number.isFinite(Number(options.minIntervalMs)) ? Number(options.minIntervalMs) : 1000;
    const previous = simplifiedTraceState[key] || {last:0, count:0};
    previous.count += 1;
    if(now - previous.last < minIntervalMs){
      simplifiedTraceState[key] = previous;
      return;
    }
    previous.last = now;
    simplifiedTraceState[key] = previous;
    global.console.info(label, previous.count > 1 ? {...payload, coalescedCount:previous.count} : payload);
    previous.count = 0;
  }

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

  function tryBuildCanonicalResolverInput(record, options = {}){
    try{
      if(!global.CanonicalResolverInput || typeof global.CanonicalResolverInput.buildCanonicalResolverInput !== 'function'){
        return null;
      }
      return global.CanonicalResolverInput.buildCanonicalResolverInput(record, options);
    }catch(error){
      return {
        error:String(error && error.message || error || 'canonical_resolver_input_failed')
      };
    }
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

  function numericOrNull(value){
    if(value === null || value === undefined) return null;
    if(typeof value === 'string' && value.trim() === '') return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function priceabilityReconciliationDiagnostics(planState){
    const plan = planState && typeof planState === 'object' ? planState : {};
    const entry = numericOrNull(plan.entry);
    const stop = numericOrNull(plan.stop);
    const target = numericOrNull(plan.target ?? plan.firstTarget);
    const rr = numericOrNull(plan.rr ?? (plan.rewardRisk && plan.rewardRisk.rrRatio));
    const status = String(plan.status || '').trim().toLowerCase();
    const tradeability = String(plan.tradeability || '').trim().toLowerCase();
    const riskStatus = String(plan.riskFit && plan.riskFit.risk_status || '').trim().toLowerCase();
    const capitalFit = String(plan.capitalFit && plan.capitalFit.capital_fit || '').trim().toLowerCase();
    const capitalNote = String(plan.capitalFit && plan.capitalFit.capital_note || '').trim();
    const fxStatus = String(plan.capitalFit && plan.capitalFit.fx_status || '').trim().toLowerCase();
    const authoritativeHardBlock = plan.authoritativeBlockApplied === true;
    const riskOnlyFxEstimated = tradeability === 'risk_only'
      && capitalFit === 'unknown'
      && !authoritativeHardBlock
      && (
        fxStatus === 'estimated'
        || /fx estimated|conversion unavailable|fx unavailable|capital check: fx estimated/i.test(capitalNote)
      );
    const gatePriceableTradeability = ['tradable','entry','ready','action_now'].includes(tradeability) || riskOnlyFxEstimated;
    const riskInvalid = ['invalid_plan','plan_missing','too_wide'].includes(riskStatus);
    const capitalImpossible = ['too_heavy','too_expensive','impossible'].includes(capitalFit);
    const checks = {
      statusValid:status === 'valid',
      hasEntry:Number.isFinite(entry),
      hasStop:Number.isFinite(stop),
      hasTarget:Number.isFinite(target),
      entryStopValid:Number.isFinite(entry) && Number.isFinite(stop) && entry > stop,
      targetValid:Number.isFinite(entry) && Number.isFinite(target) && target > entry,
      rrKnown:Number.isFinite(rr),
      rrOk:Number.isFinite(rr) && rr >= 2,
      tradeabilityOk:gatePriceableTradeability,
      riskOnlyFxEstimated,
      noAuthoritativeHardBlock:!authoritativeHardBlock,
      riskOk:!riskInvalid,
      capitalOk:!capitalImpossible
    };
    const failedChecks = Object.keys(checks).filter(key => checks[key] !== true);
    return {
      canReconcile:failedChecks.length === 0,
      failedChecks,
      checks,
      inputs:{
        status,
        entry,
        stop,
        target,
        rr,
        tradeability,
        riskStatus,
        capitalFit,
        capitalNote,
        fxStatus,
        authoritativeHardBlock
      }
    };
  }

  function planStateHasPriceableMath(planState){
    return priceabilityReconciliationDiagnostics(planState).canReconcile === true;
  }

  function reconcileDerivedPriceabilityState(derivedStates, planState){
    const source = derivedStates && typeof derivedStates === 'object' ? derivedStates : {};
    const current = String(source.priceabilityState || source.priceability_state || '').trim().toLowerCase();
    const diagnostics = priceabilityReconciliationDiagnostics(planState);
    if(current === 'unpriceable' && diagnostics.canReconcile){
      return {
        ...source,
        priceabilityState:'priceable',
        priceability_state:'priceable',
        originalPriceabilityState:current,
        priceabilityReconciledFromPlan:true,
        priceabilityReconciliationReason:diagnostics.checks.riskOnlyFxEstimated === true
          ? 'Effective plan has valid price structure and FX-estimated capital uncertainty should not keep priceability unpriceable.'
          : 'Effective plan has valid entry, stop, target, RR, risk fit, and tradeability.',
        priceabilityReconciliationDiagnostics:diagnostics
      };
    }
    return {
      ...source,
      originalPriceabilityState:current,
      priceabilityReconciledFromPlan:false,
      priceabilityReconciliationReason:current === 'unpriceable'
        ? `Not reconciled: ${diagnostics.failedChecks.join(', ') || 'no failed checks'}`
        : 'No stale unpriceable state to reconcile.',
      priceabilityReconciliationDiagnostics:diagnostics
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

  function accepted50MaSupportTestDisplayState(record, resolvedState = {}, derivedStates = {}){
    const item = record && typeof record === 'object' ? record : {};
    const watchlistDebug = item.watchlist && item.watchlist.debug && typeof item.watchlist.debug === 'object'
      ? item.watchlist.debug
      : {};
    const structureState = String(derivedStates.structureState || resolvedState.structure_state || '').trim().toLowerCase();
    const structureEligibility = String(derivedStates.structureEligibility || resolvedState.structure_eligibility || '').trim().toLowerCase();
    const pullbackState = String(derivedStates.pullbackZone || derivedStates.pullbackState || resolvedState.pullback_zone || resolvedState.pullback_state || '').trim().toLowerCase();
    const bounceState = String(derivedStates.bounceState || resolvedState.bounce_state || '').trim().toLowerCase();
    const pullbackAccepted = resolvedState.nearEntryPullbackZoneAccepted === true
      || resolvedState.near_entry_pullback_zone_accepted === true
      || resolvedState.pullback_ok === true
      || (resolvedState.entry_gate_checks && resolvedState.entry_gate_checks.pullback_ok === true)
      || (resolvedState.near_entry_gate_checks && resolvedState.near_entry_gate_checks.pullback_ok === true);
    const structurallyAliveAtRefresh = String(
      resolvedState.structural_alive_at_refresh
      || watchlistDebug.structural_alive_at_refresh
      || ''
    ).trim().toLowerCase() === 'true';
    const positiveAliveSignal = structurallyAliveAtRefresh
      || structureEligibility === 'alive'
      || ['strong','intact','developing_clean'].includes(structureState);
    const explicitInvalidationReason = String(resolvedState.explicit_invalidation_reason || '').trim().toLowerCase();
    const hasExplicitInvalidation = !!(
      explicitInvalidationReason
      && explicitInvalidationReason !== '(none)'
      && explicitInvalidationReason !== 'none'
      && explicitInvalidationReason !== 'n/a'
    );
    const refreshDemoteReason = String(
      resolvedState.refresh_demote_reason
      || watchlistDebug.refresh_demote_reason
      || ''
    ).trim().toLowerCase();
    const supportFailureReason = String(
      refreshDemoteReason
      || resolvedState.main_blocker
      || resolvedState.reason
      || resolvedState.downgrade_reason
      || ''
    ).trim().toLowerCase();
    const explicitAliveMonitorReason = /structurally alive;\s*keep on monitor|testing 50ma support|support defence/i.test(refreshDemoteReason);
    const failedSupportTest = explicitAliveMonitorReason
      ? false
      : /lost[_\s-]?50ma|support failed|failed support|below support|structure is broken|trend is weakening|structure weakening|diminishing|remove from active focus/i.test(supportFailureReason);
    const currentPrice = numericOrNull(item.marketData && (item.marketData.price ?? item.marketData.currentPrice ?? item.marketData.close));
    const sma50 = numericOrNull(item.marketData && (item.marketData.sma50 ?? item.marketData.ma50));
    const lost50MaSupport = Number.isFinite(currentPrice) && Number.isFinite(sma50) && sma50 > 0 && currentPrice < sma50 * 0.99;
    const terminalAvoid = String(resolvedState.final_verdict || '').trim().toLowerCase() === 'avoid'
      || resolvedState.terminal_avoid_applied === true
      || resolvedState.rejected_by_viability_gate === true
      || String(resolvedState.viability || '').trim().toLowerCase() === 'reject'
      || ['broken','failed','dead','invalid'].includes(structureState)
      || structureEligibility === 'broken'
      || hasExplicitInvalidation;
    return pullbackAccepted
      && pullbackState === 'near_50ma'
      && ['none','unconfirmed','attempt','early','developing','improving',''].includes(bounceState)
      && positiveAliveSignal
      && !lost50MaSupport
      && !terminalAvoid
      && !failedSupportTest;
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

  function persistedSharedPresentationForRecord(record){
    const item = record && typeof record === 'object' ? record : {};
    const watchlist = item.watchlist && typeof item.watchlist === 'object' ? item.watchlist : null;
    const presentation = watchlist && watchlist.presentation && typeof watchlist.presentation === 'object'
      ? watchlist.presentation
      : null;
    const sharedPresentation = presentation && presentation.sharedPresentation && typeof presentation.sharedPresentation === 'object'
      ? presentation.sharedPresentation
      : null;
    return sharedPresentation || null;
  }

  function persistedPresentationFeedbackDiagnostics(result, persistedSharedPresentation){
    const persisted = persistedSharedPresentation && typeof persistedSharedPresentation === 'object'
      ? persistedSharedPresentation
      : null;
    const fresh = result && typeof result === 'object' ? result : {};
    const persistedVerdict = String(persisted && (persisted.canonicalVerdict || persisted.finalVerdict) || '').trim().toLowerCase();
    const freshVerdict = String(fresh.canonicalVerdict || fresh.finalVerdict || '').trim().toLowerCase();
    const persistedBucket = String(persisted && (persisted.visualBucket || persisted.presentationBucket || persisted.trackPresentationBucket) || '').trim().toLowerCase();
    const freshBucket = String(fresh.visualBucket || fresh.presentationBucket || '').trim().toLowerCase();
    const persistedTone = String(persisted && persisted.tone || '').trim().toLowerCase();
    const freshTone = String(fresh.tone || '').trim().toLowerCase();
    const persistedBadge = String(persisted && persisted.badgeLabel || '').trim();
    const freshBadge = String(fresh.badgeLabel || '').trim();
    const persistedAction = String(persisted && persisted.actionLabel || '').trim();
    const freshAction = String(fresh.actionLabel || '').trim();
    const persistedMainBlocker = String(persisted && (persisted.mainBlocker || persisted.primaryReason) || '').trim();
    const freshMainBlocker = String(fresh.mainBlocker || '').trim();
    const risks = [
      'watchlist.presentation.sharedPresentation',
      'visualBucket',
      'badgeLabel',
      'actionLabel',
      'tone',
      'presentationBucket',
      'trackPresentationBucket'
    ];
    return {
      hasPersistedPresentation:!!persisted,
      presentationOnlyFeedbackRisks:risks,
      persistedCanonicalVerdict:persistedVerdict || '(none)',
      freshCanonicalVerdict:freshVerdict || '(none)',
      persistedVisualBucket:persistedBucket || '(none)',
      freshVisualBucket:freshBucket || '(none)',
      persistedTone:persistedTone || '(none)',
      freshTone:freshTone || '(none)',
      verdictConflict:!!(persistedVerdict && freshVerdict && persistedVerdict !== freshVerdict),
      bucketConflict:!!(persistedBucket && freshBucket && persistedBucket !== freshBucket),
      toneConflict:!!(persistedTone && freshTone && persistedTone !== freshTone),
      badgeConflict:!!(persistedBadge && freshBadge && persistedBadge !== freshBadge),
      actionConflict:!!(persistedAction && freshAction && persistedAction !== freshAction),
      mainBlockerConflict:!!(persistedMainBlocker && freshMainBlocker && persistedMainBlocker !== freshMainBlocker)
    };
  }

  function applyPersistedPresentationOverlay(result, persistedSharedPresentation){
    const persisted = persistedSharedPresentation && typeof persistedSharedPresentation === 'object'
      ? persistedSharedPresentation
      : null;
    if(!persisted || !result || typeof result !== 'object') return result;
    const feedback = persistedPresentationFeedbackDiagnostics(result, persistedSharedPresentation);
    const conflictsDetected = feedback.verdictConflict
      || feedback.bucketConflict
      || feedback.toneConflict
      || feedback.badgeConflict
      || feedback.actionConflict
      || feedback.mainBlockerConflict;
    if(!conflictsDetected && !String(result.badgeLabel || '').trim() && String(persisted.badgeLabel || '').trim()){
      result.badgeLabel = String(persisted.badgeLabel || '').trim();
    }
    if(!conflictsDetected && !String(result.actionLabel || '').trim() && String(persisted.actionLabel || '').trim()){
      result.actionLabel = String(persisted.actionLabel || '').trim();
    }
    if(!conflictsDetected && !String(result.mainBlocker || '').trim() && String(persisted.mainBlocker || persisted.primaryReason || '').trim()){
      result.mainBlocker = String(persisted.mainBlocker || persisted.primaryReason || '').trim();
    }
    result.debug = {
      ...(result.debug || {}),
      persistedPresentationAvailable:true,
      persistedPresentationOverlayApplied:true,
      persistedPresentationAuthorityDisabled:'global_non_authoritative',
      persistedPresentationConflictSuppressed:conflictsDetected,
      persistedPresentationSnapshot:stableDebugValue({
        canonicalVerdict:persisted.canonicalVerdict || persisted.finalVerdict || '',
        visualBucket:persisted.visualBucket || persisted.presentationBucket || persisted.trackPresentationBucket || '',
        tone:persisted.tone || '',
        badgeLabel:persisted.badgeLabel || '',
        actionLabel:persisted.actionLabel || '',
        mainBlocker:persisted.mainBlocker || persisted.primaryReason || ''
      })
    };
    return result;
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
      structureEligibility:String(result.structureEligibility || resolvedState.structure_eligibility || resolvedState.structureEligibility || '').toLowerCase(),
      setupLocationState:String(derivedStates.setupLocationState || resolvedState.setup_location_state || '').toLowerCase(),
      priceabilityState:String(derivedStates.priceabilityState || resolvedState.priceability_state || '').toLowerCase(),
      priceabilityReconciledFromPlan:derivedStates.priceabilityReconciledFromPlan === true,
      priceabilityReconciliationReason:String(derivedStates.priceabilityReconciliationReason || ''),
      priceabilityReconciliationDiagnostics:derivedStates.priceabilityReconciliationDiagnostics || null,
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
      visualBucketBeforeWeakWatchDowngrade:result.visualBucketBeforeWeakWatchDowngrade || null,
      weakWatchDowngradeApplied:result.weakWatchDowngradeApplied === true,
      weakWatchDowngradeReasons:Array.isArray(result.weakWatchDowngradeReasons) ? result.weakWatchDowngradeReasons.slice() : [],
      weakWatchDiminishingApplied:result.weakWatchDiminishingApplied === true,
      weakWatchDiminishingReason:String(result.weakWatchDiminishingReason || ''),
      weakWatchDiminishingTrace:result.weakWatchDiminishingTrace && typeof result.weakWatchDiminishingTrace === 'object'
        ? {...result.weakWatchDiminishingTrace}
        : null,
      finalVisualBucket:result.finalVisualBucket || result.visualBucket || null,
      mainBlocker:result.mainBlocker || resolvedState.main_blocker || resolvedState.reason || '',
      inputMutationSource:options.mutationSource || options.source || options.reason || options.renderSource || null
    };
    store.byKey[key] = {
      inputFingerprint,
      marketDataFingerprint,
      planFingerprint,
      canonicalVerdict:diagnostics.canonicalVerdict,
      visualBucket:diagnostics.visualBucket,
      weakWatchDiminishingApplied:diagnostics.weakWatchDiminishingApplied,
      weakWatchDiminishingReason:diagnostics.weakWatchDiminishingReason,
      weakWatchDiminishingTrace:diagnostics.weakWatchDiminishingTrace,
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
      const rawDerivedStates = typeof deps.analysisDerivedStatesFromRecord === 'function'
        ? deps.analysisDerivedStatesFromRecord(item)
        : fallbackDerivedStates(item);
      const derivedStates = reconcileDerivedPriceabilityState(rawDerivedStates, planState);
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
      const persistedSharedPresentation = persistedSharedPresentationForRecord(item);
      applyPersistedPresentationOverlay(result, persistedSharedPresentation);
      const accepted50MaSupportTest = accepted50MaSupportTestDisplayState(item, resolvedState, derivedStates);
      if(accepted50MaSupportTest && String(result.visualBucket || '').trim().toLowerCase() === 'diminishing'){
        result.visualBucket = 'monitor';
      }
      if(accepted50MaSupportTest && String(result.tone || '').trim().toLowerCase() === 'diminishing'){
        result.tone = 'monitor';
      }
      if(
        accepted50MaSupportTest
        && /trend is weakening|structure is broken|diminishing/i.test(String(result.mainBlocker || '').trim())
      ){
        result.mainBlocker = 'Testing 50MA support - waiting for buyers to confirm.';
      }
      result.debug = {
        ...(result.debug || {}),
        validation,
        derivedStates,
        originalDerivedStates:rawDerivedStates,
        effectivePlan,
        pipeline:'record->effectivePlan->planState->validate->ResolverCore->ResolverPresentation->presentationModel',
        accepted50MaSupportTestDisplay:accepted50MaSupportTest,
        persistedPresentationFeedback:persistedPresentationFeedbackDiagnostics(result, persistedSharedPresentation)
      };
      const canonicalResolverInputDiagnostics = tryBuildCanonicalResolverInput(item, {surface, mode:'diagnostic'});
      if(canonicalResolverInputDiagnostics){
        result.debug.canonicalResolverInputDiagnostics = canonicalResolverInputDiagnostics;
      }
      const pipelineDiagnostics = derivePipelineDiagnostics(item, {...options, surface}, {
        effectivePlan,
        planState,
        derivedStates,
        resolvedState,
        result
      });
      result.debug.pipelineDiagnostics = pipelineDiagnostics;
      if(options.log !== false){
        coalescedSimplifiedTrace('PP_DEBUG_SIMPLIFIED_STATE_PIPELINE', '[SIMPLIFIED_STATE_PIPELINE]', {
          ticker:pipelineDiagnostics.ticker,
          surface:pipelineDiagnostics.surface,
          callCounter:pipelineDiagnostics.callCounter,
          renderPass:pipelineDiagnostics.renderPass,
          canonicalVerdict:pipelineDiagnostics.canonicalVerdict,
          visualBucket:pipelineDiagnostics.visualBucket,
          planStatus:pipelineDiagnostics.planStatus,
          priceabilityState:pipelineDiagnostics.priceabilityState,
          setupLocationState:pipelineDiagnostics.setupLocationState,
          mainBlocker:pipelineDiagnostics.mainBlocker,
          weakWatchDiminishingApplied:pipelineDiagnostics.weakWatchDiminishingApplied,
          weakWatchDiminishingReason:pipelineDiagnostics.weakWatchDiminishingReason,
          inputChangedSincePrevious:pipelineDiagnostics.inputChangedSincePrevious,
          marketDataChangedSincePrevious:pipelineDiagnostics.marketDataChangedSincePrevious,
          planChangedSincePrevious:pipelineDiagnostics.planChangedSincePrevious,
          weakWatchDowngradeApplied:result.weakWatchDowngradeApplied === true,
          weakWatchDiminishingTrace:JSON.stringify(pipelineDiagnostics.weakWatchDiminishingTrace || {})
        }, {key:`pipeline:${pipelineDiagnostics.surface}:${pipelineDiagnostics.ticker}`, minIntervalMs:1000});
      }
      return result;
    }catch(error){
      const result = safeWatchModel(record, surface, 'Simplified pipeline failed safely.', error);
      if(options.log !== false){
        coalescedSimplifiedTrace('PP_DEBUG_SIMPLIFIED_STATE_PIPELINE', '[SIMPLIFIED_STATE_PIPELINE]', {
          ticker:result.ticker || '',
          surface,
          canonicalVerdict:result.canonicalVerdict,
          visualBucket:result.visualBucket,
          mainBlocker:result.mainBlocker,
          weakWatchDiminishingReason:result.weakWatchDiminishingReason || '',
          weakWatchDiminishingTrace:JSON.stringify(result.weakWatchDiminishingTrace || {}),
          error:error && error.message ? String(error.message) : 'unknown'
        }, {key:`pipeline-error:${surface}:${result.ticker || ''}`, minIntervalMs:1000});
      }
      return result;
    }
  }

  global.SimplifiedTradeState = {
    resolveRecordState
  };
})(window);
