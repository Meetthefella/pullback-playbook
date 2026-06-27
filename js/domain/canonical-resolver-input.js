(function(global){
  function safeObject(value){
    return value && typeof value === 'object' ? value : {};
  }

  function numericOrNull(value){
    if(value === null || value === undefined) return null;
    if(typeof value === 'string' && value.trim() === '') return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function stableClone(value){
    if(value == null) return value;
    try{
      if(typeof structuredClone === 'function'){
        return structuredClone(value);
      }
    }catch(_error){
      // Fall through to detached summary clone.
    }
    const seen = new WeakSet();
    function cloneDetached(input, depth = 0){
      if(input == null) return input;
      const valueType = typeof input;
      if(valueType === 'string' || valueType === 'number' || valueType === 'boolean') return input;
      if(valueType === 'bigint') return `[bigint:${String(input)}]`;
      if(valueType === 'undefined') return '[undefined]';
      if(valueType === 'symbol') return `[symbol:${String(input)}]`;
      if(valueType === 'function') return `[function:${String(input.name || 'anonymous')}]`;
      if(depth >= 5) return '[max-depth]';
      if(valueType !== 'object') return String(input);
      if(seen.has(input)) return '[circular]';
      seen.add(input);
      if(Array.isArray(input)){
        return input.slice(0, 50).map(entry => cloneDetached(entry, depth + 1));
      }
      const output = {};
      Object.keys(input).slice(0, 50).forEach(key => {
        try{
          output[key] = cloneDetached(input[key], depth + 1);
        }catch(error){
          output[key] = `[unclonable:${String(error && error.message || 'error')}]`;
        }
      });
      return output;
    }
    return cloneDetached(value);
  }

  function stableStringify(value){
    try{
      return JSON.stringify(value);
    }catch(_error){
      return String(value);
    }
  }

  function hasText(value){
    return String(value || '').trim() !== '';
  }

  function collectPresentationLabels(record){
    const item = safeObject(record);
    const watchlist = safeObject(item.watchlist);
    const presentation = safeObject(watchlist.presentation);
    const sharedPresentation = safeObject(presentation.sharedPresentation);
    const labels = [];
    [
      ['visualBucket', item.visualBucket],
      ['badgeLabel', item.badgeLabel],
      ['actionLabel', item.actionLabel],
      ['tone', item.tone],
      ['presentationBucket', item.presentationBucket],
      ['trackPresentationBucket', item.trackPresentationBucket],
      ['watchlist.presentation.sharedPresentation.badgeLabel', sharedPresentation.badgeLabel],
      ['watchlist.presentation.sharedPresentation.actionLabel', sharedPresentation.actionLabel],
      ['watchlist.presentation.sharedPresentation.visualBucket', sharedPresentation.visualBucket],
      ['watchlist.presentation.sharedPresentation.tone', sharedPresentation.tone],
      ['watchlist.presentation.sharedPresentation.presentationBucket', sharedPresentation.presentationBucket],
      ['watchlist.presentation.sharedPresentation.trackPresentationBucket', sharedPresentation.trackPresentationBucket]
    ].forEach(([path, value]) => {
      if(hasText(value)) labels.push({path, value:String(value).trim()});
    });
    return labels;
  }

  function collectPresentationFeedbackRisks(record){
    const item = safeObject(record);
    const watchlist = safeObject(item.watchlist);
    const presentation = safeObject(watchlist.presentation);
    const sharedPresentation = safeObject(presentation.sharedPresentation);
    const risks = [];
    [
      ['watchlist.presentation.sharedPresentation', sharedPresentation],
      ['visualBucket', item.visualBucket],
      ['badgeLabel', item.badgeLabel],
      ['actionLabel', item.actionLabel],
      ['tone', item.tone],
      ['presentationBucket', item.presentationBucket],
      ['trackPresentationBucket', item.trackPresentationBucket],
      ['watchlist.presentation.sharedPresentation.visualBucket', sharedPresentation.visualBucket],
      ['watchlist.presentation.sharedPresentation.badgeLabel', sharedPresentation.badgeLabel],
      ['watchlist.presentation.sharedPresentation.actionLabel', sharedPresentation.actionLabel],
      ['watchlist.presentation.sharedPresentation.tone', sharedPresentation.tone],
      ['watchlist.presentation.sharedPresentation.presentationBucket', sharedPresentation.presentationBucket],
      ['watchlist.presentation.sharedPresentation.trackPresentationBucket', sharedPresentation.trackPresentationBucket]
    ].forEach(([path, value]) => {
      const present = path === 'watchlist.presentation.sharedPresentation'
        ? Object.keys(value || {}).length > 0
        : hasText(value);
      if(present){
        risks.push({
          path,
          classification:'presentation_only_feedback_risk'
        });
      }
    });
    return risks;
  }

  function collectFreeTextAuthorityRisks(record){
    const item = safeObject(record);
    const plan = safeObject(item.plan);
    const review = safeObject(item.review);
    const watchlist = safeObject(item.watchlist);
    const debug = safeObject(watchlist.debug);
    const risks = [];
    [
      ['plan.blockedReason', plan.blockedReason],
      ['reason', item.reason],
      ['downgrade_reason', item.downgrade_reason],
      ['main_blocker', item.main_blocker],
      ['mainBlocker', item.mainBlocker],
      ['review.savedSummary', review.savedSummary],
      ['review.analysisState.raw', safeObject(review.analysisState).raw],
      ['watchlist.debug.refresh_demote_reason', debug.refresh_demote_reason],
      ['watchlist.debug.explicit_invalidation_reason', debug.explicit_invalidation_reason],
      ['watchlist.debug.reason', debug.reason],
      ['watchlist.debug.downgradeReason', debug.downgradeReason],
      ['watchlist.debug.mainBlocker', debug.mainBlocker]
    ].forEach(([path, value]) => {
      if(hasText(value)){
        risks.push({
          path,
          value:String(value).trim(),
          blockedFromCanonicalAuthority:true
        });
      }
    });
    return risks;
  }

  function selectPlanAuthorityCandidate(record){
    const item = safeObject(record);
    const plan = safeObject(item.plan);
    const manualReview = safeObject(safeObject(item.review).manualReview);
    const manualPlan = {
      entry:numericOrNull(manualReview.entry),
      stop:numericOrNull(manualReview.stop),
      firstTarget:numericOrNull(manualReview.target)
    };
    const manualPlanPresent = Number.isFinite(manualPlan.entry) && Number.isFinite(manualPlan.stop) && Number.isFinite(manualPlan.firstTarget);
    const planCandidate = {
      entry:numericOrNull(plan.entry),
      stop:numericOrNull(plan.stop),
      firstTarget:numericOrNull(plan.firstTarget)
    };
    const storedPlanPresent = Number.isFinite(planCandidate.entry) && Number.isFinite(planCandidate.stop) && Number.isFinite(planCandidate.firstTarget);
    if(manualPlanPresent){
      return {
        source:'manual_review',
        plan:manualPlan,
        provisional:false,
        reasons:['manual_review_numeric_plan_present']
      };
    }
    if(storedPlanPresent){
      return {
        source:String(plan.source || '').trim().toLowerCase() || 'stored_plan',
        plan:planCandidate,
        provisional:String(plan.source || '').trim().toLowerCase() === 'scanner_estimate',
        reasons:[String(plan.source || '').trim().toLowerCase() === 'scanner_estimate' ? 'scanner_estimate_numeric_plan_present' : 'stored_numeric_plan_present']
      };
    }
    return {
      source:'none',
      plan:null,
      provisional:false,
      reasons:['no_numeric_plan_candidate']
    };
  }

  function selectDerivedStateAuthorityCandidate(record){
    const item = safeObject(record);
    const scan = safeObject(item.scan);
    const review = safeObject(item.review);
    const analysisProjection = scan.analysisProjection && typeof scan.analysisProjection === 'object' ? stableClone(scan.analysisProjection) : null;
    const normalizedAnalysis = safeObject(review.analysisState).normalized && typeof safeObject(review.analysisState).normalized === 'object'
      ? stableClone(safeObject(review.analysisState).normalized)
      : (review.normalizedAnalysis && typeof review.normalizedAnalysis === 'object' ? stableClone(review.normalizedAnalysis) : null);
    if(analysisProjection){
      return {
        source:'scanner_projection',
        states:analysisProjection,
        reasons:['scanner_analysis_projection_present']
      };
    }
    if(normalizedAnalysis){
      return {
        source:'review_normalized',
        states:normalizedAnalysis,
        reasons:['review_normalized_analysis_present']
      };
    }
    return {
      source:'none',
      states:null,
      reasons:['no_structured_derived_state_source']
    };
  }

  function buildCanonicalResolverInput(record, options = {}){
    const item = safeObject(record);
    const marketData = safeObject(item.marketData);
    const scan = safeObject(item.scan);
    const review = safeObject(item.review);
    const plan = safeObject(item.plan);
    const lifecycle = safeObject(item.lifecycle);
    const watchlist = safeObject(item.watchlist);
    const watchlistDebug = safeObject(watchlist.debug);
    const watchlistPresentation = watchlist.presentation && typeof watchlist.presentation === 'object'
      ? stableClone(watchlist.presentation)
      : null;

    const selectedPlanAuthority = selectPlanAuthorityCandidate(item);
    const selectedDerivedStateAuthority = selectDerivedStateAuthorityCandidate(item);
    const freeTextAuthorityRisks = collectFreeTextAuthorityRisks(item);
    const presentationLabels = collectPresentationLabels(item);
    const presentationFeedbackRisks = collectPresentationFeedbackRisks(item);
    const auditOnlyFields = [
      'plan.planValidationState',
      'plan.triggerState',
      'plan.missedState',
      'plan.invalidatedState',
      'plan.blockedReason',
      'watchlist.debug',
      'watchlist.presentation'
    ];
    const legacyStructuredAuthorityFields = [
      'plan.blockedReasonCode'
    ];
    const presentationOnlyFields = [
      'visualBucket',
      'badgeLabel',
      'actionLabel',
      'tone'
    ].concat(presentationLabels.map(entry => entry.path));

    const ignoredStaleFields = [];
    [
      ['plan.planValidationState', plan.planValidationState],
      ['plan.triggerState', plan.triggerState],
      ['plan.missedState', plan.missedState],
      ['plan.invalidatedState', plan.invalidatedState],
      ['plan.blockedReason', plan.blockedReason]
    ].forEach(([path, value]) => {
      if(hasText(value) || value === true){
        ignoredStaleFields.push({
          path,
          reason:'persisted_plan_blocker_audit_only'
        });
      }
    });
    const legacyStructuredAuthorityValues = [];
    [
      ['plan.blockedReasonCode', plan.blockedReasonCode]
    ].forEach(([path, value]) => {
      if(hasText(value)){
        legacyStructuredAuthorityValues.push({
          path,
          value:String(value).trim(),
          classification:'legacy_structured_authority'
        });
      }
    });

    return {
      schemaVersion:'canonical-resolver-input-v1',
      surface:String(options.surface || options.context || 'generic'),
      ticker:String(item.ticker || item.symbol || '').trim().toUpperCase(),
      canonical: {
        market: {
          price:numericOrNull(marketData.price ?? marketData.currentPrice ?? marketData.close),
          sma20:numericOrNull(marketData.sma20 ?? marketData.ma20),
          sma50:numericOrNull(marketData.sma50 ?? marketData.ma50),
          sma200:numericOrNull(marketData.sma200 ?? marketData.ma200),
          volume:numericOrNull(marketData.volume),
          avgVolume30d:numericOrNull(marketData.avgVolume30d ?? marketData.avgVolume30),
          perf1w:numericOrNull(marketData.perf1w),
          perf1m:numericOrNull(marketData.perf1m),
          asOf:String(marketData.asOf || marketData.timestamp || '').trim()
        },
        scanner: {
          analysisProjection:selectedDerivedStateAuthority.source === 'scanner_projection' ? stableClone(selectedDerivedStateAuthority.states) : (scan.analysisProjection && typeof scan.analysisProjection === 'object' ? stableClone(scan.analysisProjection) : null),
          checks:scan.flags && typeof scan.flags === 'object' ? stableClone(scan.flags.checks || null) : null,
          resolvedVerdict:String(scan.resolvedVerdict || scan.verdict || '').trim(),
          estimatedRR:numericOrNull(scan.estimatedRR)
        },
        manual: {
          hasManualReview:review.manualReview && typeof review.manualReview === 'object',
          manualReview:review.manualReview && typeof review.manualReview === 'object'
            ? {
              entry:numericOrNull(review.manualReview.entry),
              stop:numericOrNull(review.manualReview.stop),
              target:numericOrNull(review.manualReview.target),
              summary:hasText(review.manualReview.summary) ? String(review.manualReview.summary).trim() : '',
              score:numericOrNull(review.manualReview.score)
            }
            : null
        },
        plan: {
          numericFields:{
            entry:numericOrNull(plan.entry),
            stop:numericOrNull(plan.stop),
            firstTarget:numericOrNull(plan.firstTarget)
          },
          source:String(plan.source || '').trim().toLowerCase(),
          firstTargetTooClose:plan.firstTargetTooClose === true
        },
        lifecycle: {
          stage:String(lifecycle.stage || '').trim().toLowerCase(),
          status:String(lifecycle.status || '').trim().toLowerCase(),
          expiresAt:String(lifecycle.expiresAt || '').trim()
        }
      },
      diagnostics: {
        selectedPlanAuthorityCandidate:selectedPlanAuthority,
        selectedDerivedStateAuthorityCandidate:selectedDerivedStateAuthority,
        auditOnlyFields,
        legacyStructuredAuthorityFields,
        legacyStructuredAuthorityValues,
        presentationOnlyFields:[...new Set(presentationOnlyFields)],
        presentationFeedbackRisks,
        ignoredStaleFields,
        blockedFreeTextAuthorityPaths:freeTextAuthorityRisks
      },
      legacy: {
        persistedPlanBlockers:{
          planValidationState:String(plan.planValidationState || '').trim(),
          triggerState:String(plan.triggerState || '').trim(),
          missedState:String(plan.missedState || '').trim(),
          invalidatedState:String(plan.invalidatedState || '').trim(),
          blockedReason:String(plan.blockedReason || '').trim(),
          blockedReasonCode:String(plan.blockedReasonCode || '').trim(),
          riskStatus:String(plan.riskStatus || '').trim(),
          tradeability:String(plan.tradeability || '').trim(),
          firstTargetTooClose:plan.firstTargetTooClose === true
        },
        reviewSaved:{
          savedVerdict:String(review.savedVerdict || '').trim(),
          savedSummary:String(review.savedSummary || '').trim(),
          savedScore:numericOrNull(review.savedScore)
        },
        watchlistDebug:stableClone(watchlistDebug),
        watchlistPresentation:watchlistPresentation,
        presentationLabels
      }
    };
  }

  function buildLegacyResolverInputSnapshot(record, options = {}){
    const item = safeObject(record);
    const marketData = safeObject(item.marketData);
    const plan = safeObject(item.plan);
    const lifecycle = safeObject(item.lifecycle);
    const derivedStates = options.derivedStates && typeof options.derivedStates === 'object' ? options.derivedStates : null;
    const effectivePlan = options.effectivePlan && typeof options.effectivePlan === 'object' ? options.effectivePlan : null;
    const displayedPlan = options.displayedPlan && typeof options.displayedPlan === 'object' ? options.displayedPlan : null;
    const review = safeObject(item.review);
    return {
      ticker:String(item.ticker || item.symbol || '').trim().toUpperCase(),
      market: {
        price:numericOrNull(marketData.price ?? marketData.currentPrice ?? marketData.close),
        sma20:numericOrNull(marketData.sma20 ?? marketData.ma20),
        sma50:numericOrNull(marketData.sma50 ?? marketData.ma50),
        sma200:numericOrNull(marketData.sma200 ?? marketData.ma200),
        volume:numericOrNull(marketData.volume),
        avgVolume30d:numericOrNull(marketData.avgVolume30d ?? marketData.avgVolume30),
        perf1w:numericOrNull(marketData.perf1w),
        perf1m:numericOrNull(marketData.perf1m)
      },
      derivedStates:stableClone(derivedStates),
      effectivePlan:effectivePlan ? {
        entry:numericOrNull(effectivePlan.entry),
        stop:numericOrNull(effectivePlan.stop),
        firstTarget:numericOrNull(effectivePlan.firstTarget),
        source:String(effectivePlan.source || '').trim().toLowerCase()
      } : null,
      displayedPlan:displayedPlan ? {
        status:String(displayedPlan.status || '').trim().toLowerCase(),
        entry:numericOrNull(displayedPlan.entry),
        stop:numericOrNull(displayedPlan.stop),
        target:numericOrNull(displayedPlan.target ?? displayedPlan.firstTarget),
        tradeability:String(displayedPlan.tradeability || '').trim().toLowerCase(),
        riskStatus:String(displayedPlan.riskFit && displayedPlan.riskFit.risk_status || '').trim().toLowerCase()
      } : null,
      lifecycle: {
        stage:String(lifecycle.stage || '').trim().toLowerCase(),
        status:String(lifecycle.status || '').trim().toLowerCase()
      },
      manualReviewDetected:review.manualReview && typeof review.manualReview === 'object',
      persistedPlanBlockers: {
        planValidationState:String(plan.planValidationState || '').trim(),
        triggerState:String(plan.triggerState || '').trim(),
        missedState:String(plan.missedState || '').trim(),
        invalidatedState:String(plan.invalidatedState || '').trim(),
        blockedReason:String(plan.blockedReason || '').trim(),
        blockedReasonCode:String(plan.blockedReasonCode || '').trim()
      }
    };
  }

  function buildCanonicalResolverInputComparison(record, options = {}){
    const canonicalInput = options.canonicalInput && typeof options.canonicalInput === 'object'
      ? options.canonicalInput
      : buildCanonicalResolverInput(record, options);
    const legacyLiveInputs = buildLegacyResolverInputSnapshot(record, options);
    const differences = [];
    const compareValue = (path, left, right) => {
      if(stableStringify(left) !== stableStringify(right)){
        differences.push({path, live:left, canonical:right});
      }
    };
    compareValue('market', legacyLiveInputs.market, canonicalInput.canonical.market);
    compareValue('lifecycle', legacyLiveInputs.lifecycle, canonicalInput.canonical.lifecycle);
    compareValue(
      'planAuthorityCandidate',
      legacyLiveInputs.effectivePlan,
      canonicalInput.diagnostics && canonicalInput.diagnostics.selectedPlanAuthorityCandidate
        ? canonicalInput.diagnostics.selectedPlanAuthorityCandidate.plan
        : null
    );
    compareValue(
      'derivedStateAuthorityCandidate',
      legacyLiveInputs.derivedStates,
      canonicalInput.diagnostics && canonicalInput.diagnostics.selectedDerivedStateAuthorityCandidate
        ? canonicalInput.diagnostics.selectedDerivedStateAuthorityCandidate.states
        : null
    );
    return {
      capturedAt:new Date().toISOString(),
      ticker:legacyLiveInputs.ticker,
      oldLiveResolverInputs:legacyLiveInputs,
      canonicalNormalizedInputs:canonicalInput,
      selectedPlanAuthority:canonicalInput.diagnostics ? canonicalInput.diagnostics.selectedPlanAuthorityCandidate : null,
      selectedDerivedStateAuthority:canonicalInput.diagnostics ? canonicalInput.diagnostics.selectedDerivedStateAuthorityCandidate : null,
      differences,
      hasDifferences:differences.length > 0
    };
  }

  global.CanonicalResolverInput = {
    buildCanonicalResolverInput,
    buildLegacyResolverInputSnapshot,
    buildCanonicalResolverInputComparison
  };
})(window);
