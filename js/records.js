(function(global){
  const VALID_SCORE_STRUCTURE_STATES = new Set([
    'strong',
    'intact',
    'developing',
    'developing_clean',
    'developing_loose',
    'weak',
    'weakening',
    'broken'
  ]);

  const VALID_SCORE_BOUNCE_STATES = new Set([
    'none',
    'attempt',
    'confirmed',
    'early',
    'unconfirmed'
  ]);

  const VALID_SCORE_VOLUME_STATES = new Set([
    'supportive',
    'strong',
    'normal',
    'neutral',
    'weak'
  ]);

  function hasCompleteScoreInputs(derivedStates, baseScore){
    const safeDerived = derivedStates && typeof derivedStates === 'object' ? derivedStates : {};
    const structureState = String(safeDerived.structureState || '').trim().toLowerCase();
    const bounceState = String(safeDerived.bounceState || '').trim().toLowerCase();
    const volumeState = String(safeDerived.volumeState || '').trim().toLowerCase();
    const structureReady = VALID_SCORE_STRUCTURE_STATES.has(structureState);
    const bounceReady = VALID_SCORE_BOUNCE_STATES.has(bounceState);
    const volumeReady = VALID_SCORE_VOLUME_STATES.has(volumeState);
    return Number.isFinite(baseScore) && structureReady && bounceReady && volumeReady;
  }

  function scoreSourceForRecordContext(context){
    const safe = context && typeof context === 'object' ? context : {};
    if(safe.preservedReviewedScore) return 'review.savedScore(preserved)';
    if(Number.isFinite(safe.recomputedScore)) return 'recomputed.chartQuality';
    if(Number.isFinite(safe.previousStoredScore)) return 'setup.score(previous)';
    if(Number.isFinite(safe.reviewedScore)) return 'review.savedScore';
    return 'fallback.default';
  }

  function scoreChangeReasonForRecordContext(context){
    const safe = context && typeof context === 'object' ? context : {};
    if(safe.preservedReviewedScore && safe.fallbackApplied){
      return 'Reviewed score preserved because recomputation inputs were incomplete.';
    }
    if(safe.preservedReviewedScore){
      return 'Reviewed score preserved to prevent fallback overwrite.';
    }
    if(Number.isFinite(safe.previousStoredScore) && Number.isFinite(safe.recomputedScore) && safe.previousStoredScore !== safe.recomputedScore){
      return 'Score updated from full recomputation inputs.';
    }
    if(
      Number.isFinite(safe.recomputedScore)
      && Number.isFinite(safe.penaltyAdjustedScore)
      && safe.penaltyAdjustedScore < safe.recomputedScore
    ){
      return 'Chart-quality score preserved; tradeability penalties kept out of setup score.';
    }
    if(Number.isFinite(safe.recomputedScore)){
      return 'Recomputed score accepted.';
    }
    return 'No score change.';
  }

  function createBaseTickerRecord(ticker, deps){
    const { normalizeTicker, baseTradeOutcome } = deps || {};
    if (typeof normalizeTicker !== 'function') {
      throw new Error('AppRecords requires normalizeTicker.');
    }
    if (typeof baseTradeOutcome !== 'function') {
      throw new Error('AppRecords requires baseTradeOutcome.');
    }

    const createdAt = new Date().toISOString();
    return {
      ticker: normalizeTicker(ticker),
      marketData: {
        price: null,
        asOf: '',
        source: '',
        ma20: null,
        ma50: null,
        ma200: null,
        rsi: null,
        avgVolume: null,
        volume: null,
        perf1w: null,
        perf1m: null,
        perf3m: null,
        perf6m: null,
        perfYtd: null,
        marketCap: null,
        currency: '',
        history: []
      },
      scan: {
        scanType: '',
        scanSetupType: '',
        setupOrigin: '',
        estimatedEntryZone: null,
        estimatedStopArea: null,
        estimatedTargetArea: null,
        estimatedRR: null,
        score: null,
        resolvedVerdict: '',
        verdict: '',
        reasons: [],
        flags: {},
        summary: '',
        riskStatus: 'plan_missing',
        trendStatus: '',
        pullbackStatus: '',
        pullbackType: '',
        analysisProjection: null,
        lastScannedAt: '',
        updatedAt: ''
      },
      review: {
        chartAvailable: false,
        chartRef: null,
        chartImageOriginal: null,
        chartImagePreview: null,
        chartImageVerificationSource: null,
        importedFromScreenshot: false,
        notes: '',
        savedVerdict: '',
        savedSummary: '',
        savedScore: null,
        analysisState: {
          raw: '',
          normalized: null,
          prompt: '',
          error: '',
          reviewedAt: ''
        },
        aiAnalysisRaw: '',
        normalizedAnalysis: null,
        lastReviewedAt: '',
        lastPrompt: '',
        lastError: '',
        draft: null,
        manualReview: null,
        cardOpen: false,
        source: 'manual'
      },
      plan: {
        hasValidPlan: false,
        entry: null,
        stop: null,
        firstTarget: null,
        exitMode: 'fixed_target',
        targetReviewState: 'not_near_target',
        targetActionRecommendation: '',
        targetAlert: {
          enabled: true,
          level: null,
          lastState: ''
        },
        riskPerShare: null,
        rewardPerShare: null,
        plannedRR: null,
        positionSize: null,
        positionCost: null,
        positionCostGbp: null,
        quoteCurrency: '',
        maxLoss: null,
        riskStatus: 'plan_missing',
        capitalFit: 'unknown',
        tradeability: 'invalid',
        capitalNote: '',
        affordability: '',
        status: 'missing',
        triggerState: 'waiting_for_trigger',
        planValidationState: '',
        needsReplan: false,
        missedState: '',
        invalidatedState: '',
        firstTargetTooClose: false,
        lastPlannedAt: '',
        source: '',
        authoritySource: '',
        authorityVersion: '',
        authorityReason: '',
        writtenBy: '',
        writtenAt: '',
        candidateSource: ''
      },
      setup: {
        rawScore: null,
        baseScore: null,
        score: null,
        scoreSource: '',
        scorePrevious: null,
        scoreRecomputed: null,
        scoreFallbackApplied: false,
        scoreChangeReason: '',
        reviewedScorePreserved: false,
        refreshReplacedReviewedScore: false,
        convictionTier: '',
        practicalSizeFlag: '',
        verdict: '',
        reasons: [],
        marketCaution: false
      },
      action: {
        stage: 'watch',
        priority: 3
      },
      watchlist: {
        inWatchlist: false,
        addedAt: '',
        addedScore: null,
        expiryAt: '',
        status: '',
        expiryAfterTradingDays: 5,
        updatedAt: '',
        lifecycleState: '',
        lifecycleLabel: '',
        watchlist_priority_score: null,
        watchlist_priority_bucket: '',
        debug: {
          lastEvaluatedAt: '',
          lastSource: '',
          hadFreshInputs: false,
          previousState: '',
          currentState: '',
          changeType: '',
          reason: '',
          nextPossibleState: '',
          mainBlocker: '',
          planRecomputed: false,
          recomputeResult: '',
          planSnapshotMismatch: '',
          previousPlan: null,
          newPlan: null,
          warnings: [],
          auditTrail: []
        }
      },
      diary: {
        hasDiary: false,
        diaryIds: [],
        lastOutcomeAt: '',
        records: [],
        tradeOutcome: baseTradeOutcome()
      },
      lifecycle: {
        stage: '',
        status: 'inactive',
        lockReason: '',
        stageUpdatedAt: '',
        expiresAt: '',
        expiryReason: '',
        history: []
      },
      entryPromotionAudit: {
        latest: null,
        history: []
      },
      authority: {
        version: 0,
        source: '',
        updatedAt: '',
        reason: ''
      },
      meta: {
        createdAt,
        updatedAt: createdAt,
        tags: [],
        dataVersion: 2,
        companyName: '',
        exchange: '',
        tradingViewSymbol: '',
        marketStatus: '',
        pinned: false,
        previousFinalVerdict: '',
        lastAlertedState: ''
      }
    };
  }

  function reviewChartImageId(review){
    const safe = review && typeof review === 'object' ? review : {};
    return String(
      (safe.chartVerificationCommittedTrace && (safe.chartVerificationCommittedTrace.imageId || safe.chartVerificationCommittedTrace.chartImageId))
      || (safe.chartVerificationTrace && (safe.chartVerificationTrace.imageId || safe.chartVerificationTrace.chartImageId))
      || (safe.chartImageVerificationSource && safe.chartImageVerificationSource.imageId)
      || (safe.chartImageOriginal && safe.chartImageOriginal.imageId)
      || (safe.chartRef && safe.chartRef.imageId)
      || (safe.chartImagePreview && safe.chartImagePreview.imageId)
      || ''
    );
  }

  const reviewObjectIdentityRegistry = typeof WeakMap === 'function' ? new WeakMap() : null;
  let reviewObjectIdentityCounter = 0;
  function reviewObjectIdentityId(value){
    if(!value || typeof value !== 'object' || !reviewObjectIdentityRegistry) return '';
    if(!reviewObjectIdentityRegistry.has(value)){
      reviewObjectIdentityCounter += 1;
      reviewObjectIdentityRegistry.set(value, `review_obj_${reviewObjectIdentityCounter}`);
    }
    return reviewObjectIdentityRegistry.get(value) || '';
  }

  function getTickerRecord(ticker, deps){
    const { normalizeTicker, state } = deps || {};
    if (typeof normalizeTicker !== 'function') {
      throw new Error('AppRecords requires normalizeTicker.');
    }
    const symbol = normalizeTicker(ticker);
    return symbol ? state?.tickerRecords?.[symbol] || null : null;
  }

  function upsertTickerRecord(ticker, deps){
    const {
      normalizeTicker,
      state,
      normalizeTickerRecord,
      createBaseTickerRecord
    } = deps || {};
    if (typeof normalizeTicker !== 'function') {
      throw new Error('AppRecords requires normalizeTicker.');
    }
    if (typeof normalizeTickerRecord !== 'function') {
      throw new Error('AppRecords requires normalizeTickerRecord.');
    }
    if (typeof createBaseTickerRecord !== 'function') {
      throw new Error('AppRecords requires createBaseTickerRecord.');
    }

    const symbol = normalizeTicker(ticker);
    if (!symbol) return null;
    if (!state.tickerRecords[symbol]) {
      state.tickerRecords[symbol] = normalizeTickerRecord(createBaseTickerRecord(symbol));
    }
    return state.tickerRecords[symbol];
  }

  function normalizeTickerRecord(record, deps){
    const {
      normalizeTicker,
      createBaseTickerRecord,
      normalizeScanType,
      numericOrNull,
      normalizeImportedStatus,
      normalizeExitMode,
      normalizeTargetReviewState,
      normalizeStoredPlanSnapshot,
      normalizeTradeRecord,
      uniqueStrings,
      normalizeStoredTradeOutcome,
      hasAnyPlanFields,
      deriveExecutionPlanState,
      analysisDerivedStatesFromRecord,
      computeBaseSetupScoreForRecord,
      deriveCurrentPlanState,
      evaluateSetupQualityAdjustments,
      warningStateFromInputs,
      deriveDisplaySetupScore,
      convictionTierForRecord,
      practicalSizeFlagForPlan,
      evaluateEntryTrigger,
      validateCurrentPlan,
      hasLockedLifecycle,
      deriveActionStateForRecord,
      state
    } = deps || {};

    const normalized = record && typeof record === 'object' ? record : {};
    const base = createBaseTickerRecord(normalizeTicker(normalized.ticker));
    const canonicalTradePlanAuthorityVersion = 'trade_plan_v1';
    const hasCanonicalTradePlanStamp = plan => {
      const safePlan = plan && typeof plan === 'object' ? plan : {};
      return String(safePlan.authorityVersion || '').trim() === canonicalTradePlanAuthorityVersion
        && !!String(safePlan.authoritySource || '').trim()
        && !!String(safePlan.writtenBy || '').trim()
        && !!String(safePlan.writtenAt || '').trim();
    };
    const clearNonCanonicalPlanFields = plan => {
      if(!(plan && typeof plan === 'object')) return;
      plan.hasValidPlan = false;
      plan.entry = null;
      plan.stop = null;
      plan.firstTarget = null;
      plan.riskPerShare = null;
      plan.rewardPerShare = null;
      plan.plannedRR = null;
      plan.positionSize = null;
      plan.positionCost = null;
      plan.positionCostGbp = null;
      plan.quoteCurrency = '';
      plan.maxLoss = null;
      plan.riskStatus = 'plan_missing';
      plan.capitalFit = 'unknown';
      plan.tradeability = 'invalid';
      plan.capitalNote = '';
      plan.affordability = '';
      plan.status = 'missing';
      plan.firstTargetTooClose = false;
      plan.lastPlannedAt = '';
      plan.source = '';
    };
    const reviewObjectIdentityId = value => {
      if(!value || typeof value !== 'object' || typeof WeakMap !== 'function') return '';
      if(!normalizeTickerRecord._reviewObjectIdentityRegistry){
        normalizeTickerRecord._reviewObjectIdentityRegistry = new WeakMap();
        normalizeTickerRecord._reviewObjectIdentityCounter = 0;
      }
      const registry = normalizeTickerRecord._reviewObjectIdentityRegistry;
      if(!registry.has(value)){
        normalizeTickerRecord._reviewObjectIdentityCounter += 1;
        registry.set(value, `review_obj_${normalizeTickerRecord._reviewObjectIdentityCounter}`);
      }
      return registry.get(value) || '';
    };
    const merged = {
      ...base,
      ...normalized,
      ticker: normalizeTicker(normalized.ticker || base.ticker),
      marketData: { ...base.marketData, ...(normalized.marketData || {}) },
      scan: { ...base.scan, ...(normalized.scan || {}) },
      review: { ...base.review, ...(normalized.review || {}) },
      plan: { ...base.plan, ...(normalized.plan || {}) },
      watchlist: { ...base.watchlist, ...(normalized.watchlist || {}) },
      diary: { ...base.diary, ...(normalized.diary || {}) },
      lifecycle: { ...base.lifecycle, ...(normalized.lifecycle || {}) },
      authority: { ...base.authority, ...(normalized.authority || {}) },
      meta: { ...base.meta, ...(normalized.meta || {}) }
    };
    const previousReview = normalized.review && typeof normalized.review === 'object' ? normalized.review : {};
    const previousCommittedTrace = previousReview.chartVerificationCommittedTrace && typeof previousReview.chartVerificationCommittedTrace === 'object'
      ? previousReview.chartVerificationCommittedTrace
      : null;
    const previousChartTrace = previousReview.chartVerificationTrace && typeof previousReview.chartVerificationTrace === 'object'
      ? previousReview.chartVerificationTrace
      : null;
    const previousLifecycle = previousReview.chartVerificationLifecycle && typeof previousReview.chartVerificationLifecycle === 'object'
      ? previousReview.chartVerificationLifecycle
      : null;
    const previousContext = previousReview.chartVerificationContext && typeof previousReview.chartVerificationContext === 'object'
      ? previousReview.chartVerificationContext
      : null;
    const baseCommittedTrace = base.review.chartVerificationCommittedTrace && typeof base.review.chartVerificationCommittedTrace === 'object'
      ? base.review.chartVerificationCommittedTrace
      : null;
    const baseChartTrace = base.review.chartVerificationTrace && typeof base.review.chartVerificationTrace === 'object'
      ? base.review.chartVerificationTrace
      : null;
    const baseLifecycle = base.review.chartVerificationLifecycle && typeof base.review.chartVerificationLifecycle === 'object'
      ? base.review.chartVerificationLifecycle
      : null;
    const baseContext = base.review.chartVerificationContext && typeof base.review.chartVerificationContext === 'object'
      ? base.review.chartVerificationContext
      : null;
    const currentReviewImageId = reviewChartImageId(previousReview || base.review || merged.review || {});
    const previousCommittedImageId = reviewChartImageId(previousCommittedTrace || {});
    const baseCommittedImageId = reviewChartImageId(baseCommittedTrace || {});
    const preservePreviousCommittedTrace = !!(
      previousCommittedTrace
      && (!currentReviewImageId || previousCommittedImageId === currentReviewImageId)
    );
    const preserveBaseCommittedTrace = !!(
      !preservePreviousCommittedTrace
      && baseCommittedTrace
      && (!currentReviewImageId || baseCommittedImageId === currentReviewImageId)
    );
    merged.review.chartVerificationCommittedTrace = preservePreviousCommittedTrace
      ? previousCommittedTrace
      : (preserveBaseCommittedTrace ? baseCommittedTrace : null);
    merged.review.chartVerificationTrace = previousChartTrace
      || merged.review.chartVerificationCommittedTrace
      || baseChartTrace
      || null;
    merged.review.chartVerificationLifecycle = previousLifecycle || baseLifecycle || merged.review.chartVerificationLifecycle || null;
    merged.review.chartVerificationContext = previousContext || baseContext || merged.review.chartVerificationContext || null;
    if((global.PP_DEBUG_CHART_TRACE === true || global.PP_FORCE_CHART_TRACE === true) && (previousCommittedTrace || baseCommittedTrace || previousChartTrace || baseChartTrace || previousLifecycle || baseLifecycle || previousContext || baseContext)){
      console.info('[CHART_TRACE_PERSISTENCE_AUDIT]', {
        ticker:String(merged.ticker || ''),
        sourceReviewObjectId:reviewObjectIdentityId(previousReview || null),
        destinationReviewObjectId:reviewObjectIdentityId(merged.review),
        hadCommittedTrace:!!(previousCommittedTrace || baseCommittedTrace),
        preservedCommittedTrace:!!(merged.review.chartVerificationCommittedTrace),
        preservedLifecycle:!!(merged.review.chartVerificationLifecycle),
        preservedContext:!!(merged.review.chartVerificationContext),
        previousCommittedStatus:String(previousCommittedTrace && (previousCommittedTrace.status || previousCommittedTrace.mergedStatus) || ''),
        nextCommittedStatus:String(merged.review.chartVerificationCommittedTrace && (merged.review.chartVerificationCommittedTrace.status || merged.review.chartVerificationCommittedTrace.mergedStatus) || ''),
        droppedDuring:!!((previousCommittedTrace || baseCommittedTrace) && !merged.review.chartVerificationCommittedTrace),
        propertyKeysBefore:Object.keys(previousReview || {}).sort(),
        propertyKeysAfter:Object.keys(merged.review || {}).sort()
      });
    }
    if((preservePreviousCommittedTrace || preserveBaseCommittedTrace || previousChartTrace || baseChartTrace) && typeof console !== 'undefined' && console.info && (global.PP_DEBUG_CHART_TRACE === true || global.PP_FORCE_CHART_TRACE === true)){
      console.info('[REVIEW_OBJECT_REBUILD]', {
        previousReviewObjectId:reviewObjectIdentityId(previousReview || null),
        nextReviewObjectId:reviewObjectIdentityId(merged.review),
        preservedCommittedTrace:!!(merged.review.chartVerificationCommittedTrace),
        previousCommittedStatus:String(previousCommittedTrace && previousCommittedTrace.status || previousCommittedTrace && previousCommittedTrace.mergedStatus || ''),
        nextCommittedStatus:String(merged.review.chartVerificationCommittedTrace && (merged.review.chartVerificationCommittedTrace.status || merged.review.chartVerificationCommittedTrace.mergedStatus) || '')
      });
    }
    const projectionScanType = normalizeScanType(
      merged.scan
      && merged.scan.analysisProjection
      && typeof merged.scan.analysisProjection === 'object'
        ? (merged.scan.analysisProjection.scan_type || merged.scan.analysisProjection.setup_type || '')
        : ''
    );
    merged.review.analysisState = {
      ...base.review.analysisState,
      ...((merged.review.analysisState && typeof merged.review.analysisState === 'object') ? merged.review.analysisState : {})
    };
    merged.marketData.price = numericOrNull(merged.marketData.price);
    merged.marketData.ma20 = numericOrNull(merged.marketData.ma20);
    merged.marketData.ma50 = numericOrNull(merged.marketData.ma50);
    merged.marketData.ma200 = numericOrNull(merged.marketData.ma200);
    merged.marketData.rsi = numericOrNull(merged.marketData.rsi);
    merged.marketData.avgVolume = numericOrNull(merged.marketData.avgVolume);
    merged.marketData.volume = numericOrNull(merged.marketData.volume);
    merged.marketData.perf1w = numericOrNull(merged.marketData.perf1w);
    merged.marketData.perf1m = numericOrNull(merged.marketData.perf1m);
    merged.marketData.perf3m = numericOrNull(merged.marketData.perf3m);
    merged.marketData.perf6m = numericOrNull(merged.marketData.perf6m);
    merged.marketData.perfYtd = numericOrNull(merged.marketData.perfYtd);
    merged.marketData.marketCap = numericOrNull(merged.marketData.marketCap);
    merged.marketData.history = Array.isArray(merged.marketData.history) ? merged.marketData.history : [];
    merged.scan.scanType = normalizeScanType(merged.scan.scanType || projectionScanType);
    merged.scan.scanSetupType = normalizeScanType(merged.scan.scanSetupType || merged.scan.scanType || projectionScanType);
    if (!merged.scan.scanType) merged.scan.scanType = merged.scan.scanSetupType;
    merged.scan.setupOrigin = String(merged.scan.setupOrigin || '');
    merged.scan.estimatedEntryZone = numericOrNull(merged.scan.estimatedEntryZone);
    merged.scan.estimatedStopArea = numericOrNull(merged.scan.estimatedStopArea);
    merged.scan.estimatedTargetArea = numericOrNull(merged.scan.estimatedTargetArea);
    merged.scan.estimatedRR = numericOrNull(merged.scan.estimatedRR);
    merged.scan.score = numericOrNull(merged.scan.score);
    merged.scan.updatedAt = String(merged.scan.updatedAt || '');
    merged.scan.reasons = Array.isArray(merged.scan.reasons) ? merged.scan.reasons.map(item => String(item || '')).filter(Boolean) : [];
    merged.scan.flags = merged.scan.flags && typeof merged.scan.flags === 'object' ? merged.scan.flags : {};
    merged.review.notes = String(merged.review.notes || '');
    const rawSavedVerdict = String(merged.review.savedVerdict || '').trim();
    merged.review.savedVerdict = rawSavedVerdict ? normalizeImportedStatus(rawSavedVerdict) : '';
    merged.review.savedSummary = String(merged.review.savedSummary || '');
    merged.review.savedScore = numericOrNull(merged.review.savedScore);
    merged.review.analysisState.raw = String(merged.review.analysisState.raw || '');
    merged.review.analysisState.normalized = merged.review.analysisState.normalized && typeof merged.review.analysisState.normalized === 'object'
      ? merged.review.analysisState.normalized
      : null;
    merged.review.analysisState.prompt = String(merged.review.analysisState.prompt || '');
    merged.review.analysisState.error = String(merged.review.analysisState.error || '');
    merged.review.analysisState.reviewedAt = String(merged.review.analysisState.reviewedAt || '');
    merged.review.aiAnalysisRaw = String(merged.review.aiAnalysisRaw || '');
    merged.review.lastPrompt = String(merged.review.lastPrompt || '');
    merged.review.lastError = String(merged.review.lastError || '');
    if (!merged.review.analysisState.raw && merged.review.aiAnalysisRaw) merged.review.analysisState.raw = merged.review.aiAnalysisRaw;
    if (!merged.review.analysisState.normalized && merged.review.normalizedAnalysis && typeof merged.review.normalizedAnalysis === 'object') {
      merged.review.analysisState.normalized = merged.review.normalizedAnalysis;
    }
    if (!merged.review.analysisState.prompt && merged.review.lastPrompt) merged.review.analysisState.prompt = merged.review.lastPrompt;
    if (!merged.review.analysisState.error && merged.review.lastError) merged.review.analysisState.error = merged.review.lastError;
    if (!merged.review.analysisState.reviewedAt && merged.review.lastReviewedAt) merged.review.analysisState.reviewedAt = merged.review.lastReviewedAt;
    merged.review.draft = merged.review.draft && typeof merged.review.draft === 'object' ? merged.review.draft : null;
    merged.review.cardOpen = !!merged.review.cardOpen;
    merged.review.chartAvailable = !!(merged.review.chartAvailable || (merged.review.chartRef && merged.review.chartRef.dataUrl));
    merged.review.chartImageOriginal = merged.review.chartImageOriginal && typeof merged.review.chartImageOriginal === 'object' ? merged.review.chartImageOriginal : null;
    merged.review.chartImagePreview = merged.review.chartImagePreview && typeof merged.review.chartImagePreview === 'object' ? merged.review.chartImagePreview : null;
    merged.review.chartImageVerificationSource = merged.review.chartImageVerificationSource && typeof merged.review.chartImageVerificationSource === 'object' ? merged.review.chartImageVerificationSource : null;
    merged.review.importedFromScreenshot = !!merged.review.importedFromScreenshot;
    merged.review.manualReview = merged.review.manualReview && typeof merged.review.manualReview === 'object' ? merged.review.manualReview : null;
    merged.plan.hasValidPlan = !!merged.plan.hasValidPlan;
    merged.plan.entry = numericOrNull(merged.plan.entry);
    merged.plan.stop = numericOrNull(merged.plan.stop);
    merged.plan.firstTarget = numericOrNull(merged.plan.firstTarget);
    merged.plan.exitMode = normalizeExitMode(merged.plan.exitMode);
    merged.plan.targetReviewState = normalizeTargetReviewState(merged.plan.targetReviewState);
    merged.plan.targetActionRecommendation = String(merged.plan.targetActionRecommendation || '');
    merged.plan.targetAlert = merged.plan.targetAlert && typeof merged.plan.targetAlert === 'object' ? merged.plan.targetAlert : {};
    merged.plan.targetAlert.enabled = merged.plan.exitMode === 'dynamic_exit'
      ? merged.plan.targetAlert.enabled !== false
      : false;
    merged.plan.targetAlert.level = numericOrNull(merged.plan.targetAlert.level);
    merged.plan.targetAlert.lastState = normalizeTargetReviewState(merged.plan.targetAlert.lastState);
    merged.plan.riskPerShare = numericOrNull(merged.plan.riskPerShare);
    merged.plan.rewardPerShare = numericOrNull(merged.plan.rewardPerShare);
    merged.plan.plannedRR = numericOrNull(merged.plan.plannedRR);
    merged.plan.positionSize = numericOrNull(merged.plan.positionSize);
    merged.plan.positionCost = numericOrNull(merged.plan.positionCost);
    merged.plan.positionCostGbp = numericOrNull(merged.plan.positionCostGbp);
    merged.plan.quoteCurrency = String(merged.plan.quoteCurrency || '');
    merged.plan.maxLoss = numericOrNull(merged.plan.maxLoss);
    merged.plan.firstTargetTooClose = !!merged.plan.firstTargetTooClose;
    merged.plan.status = String(merged.plan.status || '');
    merged.plan.authoritySource = String(merged.plan.authoritySource || '');
    merged.plan.authorityVersion = String(merged.plan.authorityVersion || '');
    merged.plan.authorityReason = String(merged.plan.authorityReason || '');
    merged.plan.writtenBy = String(merged.plan.writtenBy || '');
    merged.plan.writtenAt = String(merged.plan.writtenAt || '');
    merged.plan.candidateSource = String(merged.plan.candidateSource || '');
    merged.plan.triggerState = String(merged.plan.triggerState || 'waiting_for_trigger');
    merged.plan.planValidationState = String(merged.plan.planValidationState || '');
    merged.plan.needsReplan = !!merged.plan.needsReplan;
    merged.plan.missedState = String(merged.plan.missedState || '');
    merged.plan.invalidatedState = String(merged.plan.invalidatedState || '');
    const mergedPlanFieldsPresent = hasAnyPlanFields(merged);
    if(mergedPlanFieldsPresent && !hasCanonicalTradePlanStamp(merged.plan)){
      clearNonCanonicalPlanFields(merged.plan);
      merged.plan.authoritySource = 'rejected_unstamped_plan';
      merged.plan.authorityVersion = canonicalTradePlanAuthorityVersion;
      merged.plan.authorityReason = 'legacy_unstamped_plan_downgraded';
      merged.plan.writtenBy = 'normalizeTickerRecord';
      merged.plan.writtenAt = new Date().toISOString();
      merged.plan.candidateSource = String(normalized.plan && normalized.plan.source || '');
      merged.watchlist = merged.watchlist && typeof merged.watchlist === 'object' ? merged.watchlist : {};
      merged.watchlist.debug = merged.watchlist.debug && typeof merged.watchlist.debug === 'object' ? merged.watchlist.debug : {};
      merged.watchlist.debug.planSnapshotMismatch = 'Unstamped persisted plan downgraded before canonical display.';
    }
    merged.setup.rawScore = numericOrNull(merged.setup.rawScore);
    merged.setup.baseScore = numericOrNull(merged.setup.baseScore);
    merged.setup.score = numericOrNull(merged.setup.score);
    merged.setup.scoreSource = String(merged.setup.scoreSource || '');
    merged.setup.scorePrevious = numericOrNull(merged.setup.scorePrevious);
    merged.setup.scoreRecomputed = numericOrNull(merged.setup.scoreRecomputed);
    merged.setup.scoreFallbackApplied = !!merged.setup.scoreFallbackApplied;
    merged.setup.scoreChangeReason = String(merged.setup.scoreChangeReason || '');
    merged.setup.reviewedScorePreserved = !!merged.setup.reviewedScorePreserved;
    merged.setup.refreshReplacedReviewedScore = !!merged.setup.refreshReplacedReviewedScore;
    merged.setup.convictionTier = String(merged.setup.convictionTier || '');
    merged.setup.practicalSizeFlag = String(merged.setup.practicalSizeFlag || '');
    merged.setup.controlQuality = String(merged.setup.controlQuality || '');
    merged.setup.capitalEfficiency = String(merged.setup.capitalEfficiency || '');
    merged.setup.adjustmentReasons = Array.isArray(merged.setup.adjustmentReasons) ? merged.setup.adjustmentReasons.map(item => String(item || '')).filter(Boolean) : [];
    merged.watchlist.inWatchlist = !!merged.watchlist.inWatchlist;
    merged.watchlist.addedScore = numericOrNull(merged.watchlist.addedScore);
    merged.watchlist.expiryAfterTradingDays = Number.isFinite(Number(merged.watchlist.expiryAfterTradingDays)) ? Math.max(1, Number(merged.watchlist.expiryAfterTradingDays)) : 5;
    merged.watchlist.updatedAt = String(merged.watchlist.updatedAt || '');
    merged.watchlist.lifecycleState = String(merged.watchlist.lifecycleState || '');
    merged.watchlist.lifecycleLabel = String(merged.watchlist.lifecycleLabel || '');
    merged.watchlist.watchlist_priority_score = numericOrNull(merged.watchlist.watchlist_priority_score);
    merged.watchlist.watchlist_priority_bucket = String(merged.watchlist.watchlist_priority_bucket || '');
    merged.watchlist.debug = merged.watchlist.debug && typeof merged.watchlist.debug === 'object' ? merged.watchlist.debug : {};
    merged.watchlist.debug.lastEvaluatedAt = String(merged.watchlist.debug.lastEvaluatedAt || '');
    merged.watchlist.debug.lastSource = String(merged.watchlist.debug.lastSource || '');
    merged.watchlist.debug.hadFreshInputs = !!merged.watchlist.debug.hadFreshInputs;
    merged.watchlist.debug.previousState = String(merged.watchlist.debug.previousState || '');
    merged.watchlist.debug.currentState = String(merged.watchlist.debug.currentState || '');
    merged.watchlist.debug.changeType = String(merged.watchlist.debug.changeType || '');
    merged.watchlist.debug.reason = String(merged.watchlist.debug.reason || '');
    merged.watchlist.debug.nextPossibleState = String(merged.watchlist.debug.nextPossibleState || '');
    merged.watchlist.debug.mainBlocker = String(merged.watchlist.debug.mainBlocker || '');
    merged.watchlist.debug.planRecomputed = !!merged.watchlist.debug.planRecomputed;
    merged.watchlist.debug.recomputeResult = String(merged.watchlist.debug.recomputeResult || '');
    merged.watchlist.debug.planSnapshotMismatch = String(merged.watchlist.debug.planSnapshotMismatch || '');
    merged.watchlist.debug.previousPlan = normalizeStoredPlanSnapshot(merged.watchlist.debug.previousPlan);
    merged.watchlist.debug.newPlan = normalizeStoredPlanSnapshot(merged.watchlist.debug.newPlan);
    merged.watchlist.debug.warnings = Array.isArray(merged.watchlist.debug.warnings) ? merged.watchlist.debug.warnings.map(item => String(item || '').trim()).filter(Boolean).slice(0, 5) : [];
    merged.watchlist.debug.auditTrail = Array.isArray(merged.watchlist.debug.auditTrail)
      ? merged.watchlist.debug.auditTrail
        .map(item => ({
          at: String(item && item.at || ''),
          source: String(item && item.source || ''),
          result: String(item && item.result || '')
        }))
        .filter(item => item.at || item.source || item.result)
        .slice(0, 5)
      : [];
    merged.diary.records = Array.isArray(merged.diary.records) ? merged.diary.records.map(normalizeTradeRecord) : [];
    merged.diary.diaryIds = uniqueStrings(merged.diary.diaryIds && merged.diary.diaryIds.length ? merged.diary.diaryIds : merged.diary.records.map(item => item.id));
    merged.diary.hasDiary = !!(merged.diary.hasDiary || merged.diary.records.length);
    merged.diary.tradeOutcome = normalizeStoredTradeOutcome(merged.diary.tradeOutcome);
    merged.lifecycle.stage = String(merged.lifecycle.stage || '');
    merged.lifecycle.status = String(merged.lifecycle.status || 'inactive');
    merged.lifecycle.lockReason = String(merged.lifecycle.lockReason || '');
    merged.lifecycle.stageUpdatedAt = String(merged.lifecycle.stageUpdatedAt || '');
    merged.lifecycle.expiresAt = String(merged.lifecycle.expiresAt || '');
    merged.lifecycle.expiryReason = String(merged.lifecycle.expiryReason || '');
    merged.lifecycle.history = Array.isArray(merged.lifecycle.history) ? merged.lifecycle.history.map(entry => ({
      stage: String(entry && entry.stage || ''),
      status: String(entry && entry.status || ''),
      changedAt: String(entry && entry.changedAt || ''),
      reason: String(entry && entry.reason || ''),
      source: String(entry && entry.source || '')
    })).filter(entry => entry.stage || entry.status) : [];
    merged.entryPromotionAudit = merged.entryPromotionAudit && typeof merged.entryPromotionAudit === 'object'
      ? merged.entryPromotionAudit
      : {};
    merged.entryPromotionAudit.latest = merged.entryPromotionAudit.latest && typeof merged.entryPromotionAudit.latest === 'object'
      ? merged.entryPromotionAudit.latest
      : null;
    merged.entryPromotionAudit.history = Array.isArray(merged.entryPromotionAudit.history)
      ? merged.entryPromotionAudit.history
        .filter(entry => entry && typeof entry === 'object')
        .map(entry => ({
          ticker: String(entry.ticker || merged.ticker || '').trim().toUpperCase(),
          timestamp: String(entry.timestamp || ''),
          source: String(entry.source || ''),
          currentVerdict: String(entry.currentVerdict || ''),
          visualBucket: String(entry.visualBucket || ''),
          entryGatePass: entry.entryGatePass === true,
          nearEntryGatePass: entry.nearEntryGatePass === true,
          terminalBlockerExists: entry.terminalBlockerExists === true,
          staleDataPreventedFreshPromotionPass: entry.staleDataPreventedFreshPromotionPass === true,
          circularTriggerSuspected: entry.circularTriggerSuspected === true,
          failedEntryChecks: Array.isArray(entry.failedEntryChecks)
            ? entry.failedEntryChecks.filter(item => item && typeof item === 'object').map(item => ({
              id: String(item.id || ''),
              label: String(item.label || ''),
              classification: String(item.classification || ''),
              temporary: item.temporary !== false
            }))
            : [],
          passedEntryChecks: Array.isArray(entry.passedEntryChecks)
            ? entry.passedEntryChecks.filter(item => item && typeof item === 'object').map(item => ({
              id: String(item.id || ''),
              label: String(item.label || '')
            }))
            : [],
          firstFailedEntryCheck: entry.firstFailedEntryCheck && typeof entry.firstFailedEntryCheck === 'object'
            ? {
              id: String(entry.firstFailedEntryCheck.id || ''),
              label: String(entry.firstFailedEntryCheck.label || ''),
              classification: String(entry.firstFailedEntryCheck.classification || ''),
              temporary: entry.firstFailedEntryCheck.temporary !== false
            }
            : null,
          triggerAudit: entry.triggerAudit && typeof entry.triggerAudit === 'object'
            ? {
              entryTriggerHit: entry.triggerAudit.entryTriggerHit === true,
              source: String(entry.triggerAudit.source || ''),
              dependedOnReadyToAct: entry.triggerAudit.dependedOnReadyToAct === true,
              dependedOnEntryLikeState: entry.triggerAudit.dependedOnEntryLikeState === true,
              independentTriggerSignalExists: entry.triggerAudit.independentTriggerSignalExists === true
            }
            : null
        }))
        .slice(0, 10)
      : [];
    merged.authority = merged.authority && typeof merged.authority === 'object'
      ? merged.authority
      : {};
    merged.authority.version = Number.isFinite(Number(merged.authority.version))
      ? Math.max(0, Math.round(Number(merged.authority.version)))
      : 0;
    merged.authority.source = String(merged.authority.source || '').trim().toLowerCase();
    merged.authority.updatedAt = String(merged.authority.updatedAt || '');
    merged.authority.reason = String(merged.authority.reason || '');
    merged.meta.tags = Array.isArray(merged.meta.tags) ? merged.meta.tags.map(item => String(item || '')).filter(Boolean) : [];
    merged.meta.dataVersion = 2;
    merged.meta.updatedAt = String(merged.meta.updatedAt || merged.meta.createdAt || new Date().toISOString());
    merged.meta.createdAt = String(merged.meta.createdAt || merged.meta.updatedAt || new Date().toISOString());
    merged.meta.previousFinalVerdict = String(merged.meta.previousFinalVerdict || '').trim().toLowerCase();
    merged.meta.lastAlertedState = String(merged.meta.lastAlertedState || '').trim().toLowerCase();
    const computedPlanStatus = merged.plan.hasValidPlan ? 'valid' : (hasAnyPlanFields(merged) ? 'invalid' : 'missing');
    merged.plan.status = computedPlanStatus;
    const normalizedExecution = deriveExecutionPlanState(merged, {
      exitMode: merged.plan.exitMode,
      targetLevel: merged.plan.targetAlert.level ?? merged.plan.firstTarget
    });
    merged.plan.exitMode = normalizedExecution.exitMode;
    merged.plan.targetReviewState = normalizedExecution.targetReviewState;
    merged.plan.targetActionRecommendation = normalizedExecution.targetActionRecommendation;
    merged.plan.targetAlert.level = Number.isFinite(merged.plan.targetAlert.level)
      ? merged.plan.targetAlert.level
      : normalizedExecution.targetAlertLevel;
    merged.plan.targetAlert.lastState = normalizedExecution.targetReviewState;
    const setupDerivedStates = analysisDerivedStatesFromRecord(merged);
    const baseSetupScore = computeBaseSetupScoreForRecord(merged, { derivedStates: setupDerivedStates });
    const canonicalDisplayedPlan = deriveCurrentPlanState(merged.plan.entry, merged.plan.stop, merged.plan.firstTarget, merged.marketData.currency);
    const qualityAdjustments = evaluateSetupQualityAdjustments(merged, {
      derivedStates: setupDerivedStates,
      displayedPlan: canonicalDisplayedPlan
    });
    const setupWarningState = warningStateFromInputs(merged, null, setupDerivedStates);
    const displaySetupScore = deriveDisplaySetupScore(merged, {
      derivedStates: setupDerivedStates,
      warningState: setupWarningState,
      qualityAdjustments
    });
    const recomputedChartScore = Number.isFinite(baseSetupScore)
      ? Math.max(0, Math.min(10, Math.round(baseSetupScore)))
      : null;
    const recomputedPenaltyAdjustedScore = Number.isFinite(displaySetupScore)
      ? Math.max(0, Math.min(10, Math.round(displaySetupScore)))
      : null;
    const previousStoredScore = numericOrNull(merged.setup.score);
    const reviewedScore = numericOrNull(
      merged.review.savedScore
      ?? (merged.review.manualReview && merged.review.manualReview.score)
    );
    const recomputeComplete = hasCompleteScoreInputs(setupDerivedStates, baseSetupScore);
    const fallbackApplied = !recomputeComplete || !Number.isFinite(recomputedChartScore);
    const preserveReviewedScore = Number.isFinite(reviewedScore) && fallbackApplied;
    const selectedScore = preserveReviewedScore
      ? reviewedScore
      : (Number.isFinite(recomputedPenaltyAdjustedScore)
        ? recomputedPenaltyAdjustedScore
        : (Number.isFinite(recomputedChartScore)
          ? recomputedChartScore
          : (Number.isFinite(previousStoredScore) ? previousStoredScore : (Number.isFinite(reviewedScore) ? reviewedScore : 0))));
    const setupScoreContext = {
      preservedReviewedScore:preserveReviewedScore,
      recomputedScore:recomputedChartScore,
      previousStoredScore,
      reviewedScore,
      penaltyAdjustedScore:recomputedPenaltyAdjustedScore,
      fallbackApplied
    };
    const scoreSource = scoreSourceForRecordContext(setupScoreContext);
    const scoreChangeReason = scoreChangeReasonForRecordContext(setupScoreContext);
    const refreshReplacedReviewedScore = Number.isFinite(reviewedScore)
      && Number.isFinite(previousStoredScore)
      && previousStoredScore === reviewedScore
      && !preserveReviewedScore
      && Number.isFinite(recomputedChartScore)
      && recomputedChartScore < reviewedScore;
    const convictionTier = convictionTierForRecord(merged, {
      derivedStates: setupDerivedStates,
      warningState: setupWarningState,
      displayScore: selectedScore,
      qualityAdjustments
    });
    merged.setup = {
      baseScore: baseSetupScore,
      rawScore: baseSetupScore,
      score: selectedScore,
      scoreSource,
      scorePrevious: previousStoredScore,
      scoreRecomputed: recomputedChartScore,
      scoreFallbackApplied: !!fallbackApplied,
      scoreChangeReason,
      reviewedScorePreserved: !!preserveReviewedScore,
      refreshReplacedReviewedScore: !!refreshReplacedReviewedScore,
      convictionTier,
      practicalSizeFlag: practicalSizeFlagForPlan(merged.plan),
      controlQuality: qualityAdjustments.controlQuality,
      capitalEfficiency: qualityAdjustments.capitalEfficiency,
      adjustmentReasons: qualityAdjustments.adjustmentReasons,
      warning: setupWarningState,
      verdict: String(merged.scan.resolvedVerdict || merged.scan.verdict || merged.watchlist.status || 'Watch'),
      reasons: Array.isArray(merged.scan.reasons) && merged.scan.reasons.length
        ? merged.scan.reasons
        : [String(merged.scan.summary || '').trim()].filter(Boolean),
      marketCaution: /below 50 ma/i.test(String(merged.meta.marketStatus || state.marketStatus || ''))
    };
    merged.watchlist.debug = merged.watchlist.debug && typeof merged.watchlist.debug === 'object' ? merged.watchlist.debug : {};
    merged.watchlist.debug.score_source_used = scoreSource;
    merged.watchlist.debug.score_previous_stored = Number.isFinite(previousStoredScore) ? previousStoredScore : null;
    merged.watchlist.debug.score_recomputed = Number.isFinite(recomputedChartScore) ? recomputedChartScore : null;
    merged.watchlist.debug.score_recomputed_penalty_adjusted = Number.isFinite(recomputedPenaltyAdjustedScore) ? recomputedPenaltyAdjustedScore : null;
    merged.watchlist.debug.score_fallback_applied = !!fallbackApplied;
    merged.watchlist.debug.score_change_reason = scoreChangeReason;
    merged.watchlist.debug.refresh_replaced_reviewed_state = !!refreshReplacedReviewedScore;
    merged.watchlist.debug.score_recompute_complete = !!recomputeComplete;
    const triggerState = evaluateEntryTrigger(merged, { derivedStates: setupDerivedStates, displayedPlan: canonicalDisplayedPlan });
    const planValidation = validateCurrentPlan(merged, { derivedStates: setupDerivedStates, displayedPlan: canonicalDisplayedPlan, triggerState });
    if (hasLockedLifecycle(merged) || String(merged.lifecycle.status || '') === 'stale') {
      merged.plan.triggerState = merged.plan.invalidatedState ? 'invalidated' : (merged.plan.missedState ? 'missed' : 'stale');
      if (!['invalidated', 'missed'].includes(String(merged.plan.planValidationState || ''))) {
        merged.plan.planValidationState = 'stale';
      }
      merged.plan.needsReplan = false;
    } else {
      merged.plan.triggerState = String(triggerState.triggerState || 'waiting_for_trigger');
      merged.plan.planValidationState = String(planValidation.state || '');
      merged.plan.needsReplan = !!planValidation.needsReplan;
      merged.plan.missedState = planValidation.missed ? 'missed' : '';
      merged.plan.invalidatedState = planValidation.invalidated ? 'invalidated' : '';
    }
    merged.action = deriveActionStateForRecord(merged);
    return merged;
  }

  global.AppRecords = {
    createBaseTickerRecord,
    normalizeTickerRecord,
    getTickerRecord,
    upsertTickerRecord
  };
})(window);
