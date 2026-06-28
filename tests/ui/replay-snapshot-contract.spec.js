const {test, expect} = require('@playwright/test');
const {buildReplaySnapshotFromRecord} = require('./helpers/app-state');
const {runReplayForSnapshot} = require('./helpers/replay-runner');

test('replay snapshot includes authoritative review inputs and excludes presentation-only state', async () => {
  const snapshot = buildReplaySnapshotFromRecord({
    ticker:'TROW',
    meta:{
      companyName:'T. Rowe Price Group, Inc.',
      exchange:'NASDAQ',
      tradingViewSymbol:'NASDAQ:TROW'
    },
    marketData:{
      currency:'USD',
      price:110.27,
      previousClose:106.34,
      ma20:106.727,
      ma50:103.852,
      ma200:100.9815,
      rsi:64.82,
      volume:3831934,
      avgVolume:2115787.96,
      perf1w:2.43,
      perf1m:5.52,
      perf3m:22.21,
      perf6m:6.0,
      perfYtd:5.39,
      asOf:'2026-06-28T14:40:23.308Z',
      history:[{date:'2026-06-26', open:110.27, high:110.27, low:110.27, close:110.27, volume:3831934}]
    },
    setup:{
      volumeRequired:false,
      marketCaution:false
    },
    plan:{
      entry:110.27,
      stop:102.29,
      firstTarget:136.19,
      source:'scanner_estimate'
    },
    scan:{
      analysisProjection:{
        derived_states:{
          trend_state:'strong',
          pullback_zone:'near_20ma',
          setup_location_state:'usable_pullback',
          priceability_state:'unpriceable'
        }
      },
      score:10,
      riskStatus:'fits_risk',
      summary:'Watch for confirmation.'
    },
    review:{
      analysisState:{
        normalized:{
          ai_observation_only:true,
          coach_summary:'Constructive but waiting for confirmation.'
        }
      },
      manualReview:{
        entry:110.27,
        stop:102.29,
        target:136.19
      }
    },
    watchlist:{
      inWatchlist:true,
      debug:{downgradeReason:'presentation only'},
      presentation:{sharedPresentation:{canonicalVerdict:'watch'}}
    },
    track:{
      diagnostics:{debugOnly:true}
    }
  }, {
    reviewProjectionSource:'clicked_card_snapshot',
    reviewProjectionSnapshot:{
      ticker:'TROW',
      canonicalVerdict:'entry',
      finalVerdict:'entry',
      sourceOfTruthVisualBucket:'entry',
      visualBucket:'entry',
      tone:'entry'
    }
  });

  expect(snapshot.scan.analysisProjection).toBeTruthy();
  expect(snapshot.plan).toEqual({
    entry:110.27,
    stop:102.29,
    firstTarget:136.19,
    source:'scanner_estimate'
  });
  expect(snapshot.review.analysisState.normalized).toEqual({
    ai_observation_only:true,
    coach_summary:'Constructive but waiting for confirmation.'
  });
  expect(snapshot.review.projectionSource).toBe('clicked_card_snapshot');
  expect(snapshot.review.projectionSnapshot).toEqual({
    ticker:'TROW',
    canonicalVerdict:'entry',
    finalVerdict:'entry',
    sourceOfTruthVisualBucket:'entry',
    visualBucket:'entry',
    tone:'entry'
  });
  expect(snapshot.review.manualReview).toEqual({
    entry:110.27,
    stop:102.29,
    target:136.19
  });
  expect(snapshot.marketData.history).toHaveLength(1);
  expect(snapshot.watchlist).toBeUndefined();
  expect(snapshot.track).toBeUndefined();
});

test('replay honors authoritative review projection snapshot when present', async () => {
  const snapshot = buildReplaySnapshotFromRecord({
    ticker:'TROW',
    marketData:{
      currency:'USD',
      price:110.27,
      previousClose:106.34,
      ma20:106.727,
      ma50:103.852,
      ma200:100.9815,
      rsi:64.82,
      volume:3831934,
      avgVolume:2115787.96,
      asOf:'2026-06-28T20:56:13.518Z',
      history:[{date:'2026-06-26', open:110.27, high:110.27, low:110.27, close:110.27, volume:3831934}]
    },
    plan:{
      entry:110.27,
      stop:102.29,
      firstTarget:136.19,
      status:'valid',
      tradeability:'tradable'
    },
    scan:{
      analysisProjection:{
        priceability_state:'unpriceable',
        bounce_state:'attempt',
        structure_state:'strong',
        setup_location_state:'off_level'
      },
      resolvedVerdict:'Entry',
      verdict:'Entry'
    },
    review:{
      analysisState:{
        normalized:{coach_summary:'Constructive but waiting for confirmation.'}
      }
    }
  }, {
    reviewProjectionSource:'clicked_card_snapshot',
    reviewProjectionSnapshot:{
      ticker:'TROW',
      canonicalVerdict:'entry',
      finalVerdict:'entry',
      sourceOfTruthVisualBucket:'entry',
      visualBucket:'entry',
      tone:'entry'
    }
  });

  const replay = runReplayForSnapshot(snapshot);

  expect(replay.result.reviewCanonicalVerdict).toBe('entry');
  expect(replay.result.reviewVisualBucket).toBe('entry');
  expect(replay.result.reviewProjectionSource).toBe('clicked_card_snapshot');
});

test('replay keeps scanner canonical state aligned with canonical simplified scan state for TROW-like soft-readiness cases', async () => {
  const snapshot = buildReplaySnapshotFromRecord({
    ticker:'TROW',
    meta:{
      companyName:'T. Rowe Price Group, Inc.',
      exchange:'NASDAQ',
      tradingViewSymbol:'NASDAQ:TROW'
    },
    marketData:{
      currency:'USD',
      price:110.27,
      previousClose:106.34,
      ma20:106.727,
      ma50:103.852,
      ma200:100.9815,
      rsi:64.82,
      volume:3831934,
      avgVolume:2115787.96,
      asOf:'2026-06-28T22:40:32.187Z',
      history:[{date:'2026-06-26', open:110.27, high:110.27, low:110.27, close:110.27, volume:3831934}]
    },
    plan:{
      entry:110.27,
      stop:102.29,
      firstTarget:136.19,
      status:'valid',
      tradeability:'risk_only',
      capitalFit:'unknown',
      capitalNote:'Capital check: FX estimated',
      riskStatus:'fits_risk',
      source:'scanner_estimate'
    },
    scan:{
      analysisProjection:{
        price:110.27,
        sma20:106.727,
        sma50:103.852,
        sma200:100.9815,
        rr_ratio:'3.25',
        risk_status:'fits_risk',
        derived_states:{
          trend_state:'strong',
          pullback_zone:'none',
          setup_location_state:'off_level',
          priceability_state:'priceable',
          structure_state:'strong',
          stabilisation_state:'none',
          bounce_state:'attempt',
          has_clear_invalidation_level:'yes',
          has_priceable_plan:'yes',
          unpriceable_block_reason:'Developing - waiting for confirmation.',
          volume_state:'supportive',
          entry_defined:'yes',
          stop_defined:'yes',
          target_defined:'yes'
        }
      },
      resolvedVerdict:'Entry',
      verdict:'Entry',
      score:7,
      riskStatus:'fits_risk',
      summary:'trend structure is intact, pullback is close to support, trade plan is mostly defined.'
    },
    review:{
      analysisState:{
        normalized:{coach_summary:'Constructive but waiting for confirmation.'}
      }
    }
  }, {
    reviewProjectionSource:'clicked_card_snapshot',
    reviewProjectionSnapshot:{
      ticker:'TROW',
      canonicalVerdict:'entry',
      finalVerdict:'entry',
      sourceOfTruthVisualBucket:'entry',
      visualBucket:'entry',
      tone:'entry'
    }
  });

  const replay = runReplayForSnapshot(snapshot);

  expect(replay.result.scannerCanonicalVerdict).toBe('entry');
  expect(replay.result.scannerVisualBucket).toBe('entry');
  expect(replay.result.reviewCanonicalVerdict).toBe('entry');
});
