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
        pinned: false
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

  global.AppRecords = {
    createBaseTickerRecord,
    getTickerRecord,
    upsertTickerRecord
  };
})(window);
