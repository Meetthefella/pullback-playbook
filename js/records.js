(function(global){
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
        source: ''
      },
      setup: {
        rawScore: null,
        score: null,
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
      meta: { ...base.meta, ...(normalized.meta || {}) }
    };
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
    merged.review.cardOpen = !!merged.review.cardOpen;
    merged.review.chartAvailable = !!(merged.review.chartAvailable || (merged.review.chartRef && merged.review.chartRef.dataUrl));
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
    merged.plan.maxLoss = numericOrNull(merged.plan.maxLoss);
    merged.plan.firstTargetTooClose = !!merged.plan.firstTargetTooClose;
    merged.plan.status = String(merged.plan.status || '');
    merged.plan.triggerState = String(merged.plan.triggerState || 'waiting_for_trigger');
    merged.plan.planValidationState = String(merged.plan.planValidationState || '');
    merged.plan.needsReplan = !!merged.plan.needsReplan;
    merged.plan.missedState = String(merged.plan.missedState || '');
    merged.plan.invalidatedState = String(merged.plan.invalidatedState || '');
    merged.setup.rawScore = numericOrNull(merged.setup.rawScore);
    merged.setup.baseScore = numericOrNull(merged.setup.baseScore);
    merged.setup.score = numericOrNull(merged.setup.score);
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
    const convictionTier = convictionTierForRecord(merged, {
      derivedStates: setupDerivedStates,
      warningState: setupWarningState,
      displayScore: displaySetupScore,
      qualityAdjustments
    });
    merged.setup = {
      baseScore: baseSetupScore,
      rawScore: baseSetupScore,
      score: displaySetupScore,
      convictionTier,
      practicalSizeFlag: practicalSizeFlagForPlan(merged.plan),
      controlQuality: qualityAdjustments.controlQuality,
      capitalEfficiency: qualityAdjustments.capitalEfficiency,
      adjustmentReasons: qualityAdjustments.adjustmentReasons,
      warning: setupWarningState,
      verdict: String(merged.scan.verdict || merged.watchlist.status || 'Watch'),
      reasons: Array.isArray(merged.scan.reasons) && merged.scan.reasons.length
        ? merged.scan.reasons
        : [String(merged.scan.summary || '').trim()].filter(Boolean),
      marketCaution: /below 50 ma/i.test(String(merged.meta.marketStatus || state.marketStatus || ''))
    };
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
