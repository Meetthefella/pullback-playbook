const {test, expect} = require('@playwright/test');
const {buildReplaySnapshotFromRecord} = require('../helpers/app-state');
const {runReplayForSnapshot} = require('../helpers/replay-runner');

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
  expect(snapshot.canonicalContract).toBeTruthy();
  expect(snapshot.canonicalContract.ticker).toBe('TROW');
  expect(snapshot.renderModels).toBeTruthy();
  expect(snapshot.renderModels.review).toBeTruthy();
  expect(snapshot.renderModels.track).toBeTruthy();
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
  expect(snapshot.replayBuildProjectionAuthority).toBeUndefined();
  expect(snapshot.replayBuildProjectionVerdict).toBeUndefined();
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
  expect(replay.result.replayAuthoritySource).toBe('canonical_contract');
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

test('replay prefers snapshot canonical contract authority over recomputed fallback when contract/render models are present', async () => {
  const snapshot = {
    ticker:'UNP',
    marketData:{
      currency:'USD',
      price:245.11,
      ma20:240.2,
      ma50:233.4,
      ma200:210.8,
      asOf:'2026-06-28T22:40:32.187Z'
    },
    plan:{
      status:'missing',
      tradeability:'not_ready',
      source:'scanner_estimate'
    },
    scan:{
      resolvedVerdict:'Entry',
      verdict:'Entry',
      analysisProjection:{
        derived_states:{
          trend_state:'strong',
          pullback_zone:'near_20ma',
          setup_location_state:'near_20ma',
          structure_state:'strong',
          bounce_state:'confirmed',
          priceability_state:'priceable'
        }
      }
    },
    canonicalContract:{
      schemaVersion:'plan-verdict-contract-v1',
      ticker:'UNP',
      authoritativeInputs:{
        ticker:'UNP',
        scanner:{resolvedVerdict:'Watch', score:35, analysisProjection:{}, flags:{}},
        reviewAuthority:{savedVerdict:'', savedScore:null, manualReview:null},
        planAuthority:{entry:null, stop:null, firstTarget:null, source:'', authoritySource:'', authorityVersion:'', submittedPaperTradeAt:''},
        lifecycleAuthority:{stage:'watchlist', status:'active', lockReason:'', expiresAt:'2026-07-10'},
        paperTradeAuthority:{submittedTrades:[]},
        marketData:{price:245.11, ma20:240.2, ma50:233.4, ma200:210.8, asOf:'2026-06-28T22:40:32.187Z'}
      },
      canonicalVerdict:'watch',
      canonicalVisualBucket:'monitor',
      derivedStates:{
        setupScore:5,
        planReady:false,
        planStatus:'missing',
        tradeability:'not_ready',
        riskStatus:'plan_missing',
        inWatchlist:true,
        hasSavedReviewAuthority:false,
        structureState:'strong',
        structureEligibility:'alive',
        setupLocationState:'near_20ma',
        priceabilityState:'priceable',
        bounceState:'confirmed',
        lifecycleState:'watch'
      },
      planAuthority:{
        entry:null,
        stop:null,
        firstTarget:null,
        source:'not_generated',
        stamped:false,
        status:'missing',
        tradeability:'not_ready',
        riskStatus:'plan_missing'
      },
      lifecycleAuthority:{
        stage:'watchlist',
        status:'active',
        state:'watch',
        label:'Watch',
        lockReason:'',
        expiresAt:'2026-07-10'
      },
      paperTradeAuthority:{
        submittedTrades:[],
        submittedPaperTradeAt:'',
        currentPlanSnapshot:{entry:null, stop:null, target:null, status:'missing'}
      },
      contractFingerprint:'fp_contract_locked'
    },
    renderModels:{
      review:{
        ticker:'UNP',
        canonicalVerdict:'watch',
        visualBucket:'monitor',
        tone:'monitor',
        badgeLabel:'Watch',
        headline:'Watch',
        nextAction:'Wait for stronger confirmation before considering entry.',
        primaryReason:'Confirmation is still developing, so the setup stays on watch.',
        planVisible:false,
        planStatus:'missing',
        setupScore:5,
        actionable:false,
        contractFingerprint:'fp_contract_locked'
      },
      track:{
        ticker:'UNP',
        canonicalVerdict:'watch',
        visualBucket:'monitor',
        visibleBucket:'monitor',
        tone:'monitor',
        badgeLabel:'Watch',
        headline:'Watch',
        statusText:'Watch',
        nextAction:'Wait for stronger confirmation before considering entry.',
        actionLabel:'Wait for stronger confirmation before considering entry.',
        primaryReason:'Confirmation is still developing, so the setup stays on watch.',
        planStatus:'missing',
        setupScore:5,
        contractFingerprint:'fp_contract_locked'
      }
    },
    review:{
      analysisState:{normalized:null},
      projectionSource:'',
      projectionSnapshot:null
    }
  };

  const replay = runReplayForSnapshot(snapshot);

  expect(replay.result.scannerCanonicalVerdict).toBe('watch');
  expect(replay.result.reviewCanonicalVerdict).toBe('watch');
  expect(replay.result.reviewVisualBucket).toBe('monitor');
  expect(replay.result.replayAuthoritySource).toBe('canonical_contract');
});

test('replay keeps exported review fields pinned to snapshot render-model and contract authority', async () => {
  const snapshot = {
    ticker:'CSCO',
    marketData:{
      currency:'USD',
      price:61.4,
      ma20:60.1,
      ma50:58.4,
      ma200:53.2,
      asOf:'2026-06-28T22:40:32.187Z'
    },
    plan:{
      entry:61.4,
      stop:58.8,
      firstTarget:66.9,
      status:'valid',
      tradeability:'tradable',
      riskStatus:'fits_risk',
      source:'scanner_estimate'
    },
    scan:{
      resolvedVerdict:'Entry',
      verdict:'Entry',
      analysisProjection:{
        derived_states:{
          trend_state:'strong',
          pullback_zone:'near_20ma',
          setup_location_state:'near_20ma',
          structure_state:'strong',
          bounce_state:'confirmed',
          priceability_state:'priceable'
        },
        target_profile:{
          realisticTarget:66.9,
          extendedTarget:69.4,
          realisticRr:2.12,
          targetStretchPct:4.7,
          targetCapReason:'snapshot_review_contract'
        }
      }
    },
    canonicalContract:{
      schemaVersion:'plan-verdict-contract-v1',
      ticker:'CSCO',
      authoritativeInputs:{
        ticker:'CSCO',
        scanner:{resolvedVerdict:'Watch', score:29, analysisProjection:{}, flags:{}},
        reviewAuthority:{savedVerdict:'', savedScore:null, manualReview:null},
        planAuthority:{entry:61.4, stop:58.8, firstTarget:66.9, source:'manual'},
        lifecycleAuthority:{stage:'watchlist', status:'active', lockReason:'', expiresAt:'2026-07-10'},
        paperTradeAuthority:{submittedTrades:[]},
        marketData:{price:61.4, ma20:60.1, ma50:58.4, ma200:53.2, asOf:'2026-06-28T22:40:32.187Z'}
      },
      canonicalVerdict:'watch',
      canonicalVisualBucket:'monitor',
      derivedStates:{
        setupScore:4,
        structureState:'developing_clean',
        structureEligibility:'alive',
        setupLocationState:'near_20ma',
        priceabilityState:'provisional',
        stabilisationState:'stabilising',
        bounceState:'attempt',
        lifecycleState:'watch'
      },
      planAuthority:{
        entry:61.4,
        stop:58.8,
        firstTarget:66.9,
        source:'manual',
        stamped:true,
        status:'valid',
        tradeability:'tradable',
        riskStatus:'fits_risk'
      },
      lifecycleAuthority:{
        stage:'watchlist',
        status:'active',
        state:'watch',
        label:'Watch',
        lockReason:'',
        expiresAt:'2026-07-10'
      },
      paperTradeAuthority:{
        submittedTrades:[]
      },
      contractFingerprint:'fp_csco_locked'
    },
    renderModels:{
      review:{
        ticker:'CSCO',
        canonicalVerdict:'watch',
        visualBucket:'monitor',
        tone:'monitor',
        badgeLabel:'Watch',
        headline:'Watch',
        nextAction:'Wait for clean confirmation instead of forcing an entry.',
        primaryReason:'The contract keeps this on watch until confirmation improves.',
        planVisible:true,
        planStatus:'valid',
        setupScore:4,
        actionable:false,
        contractFingerprint:'fp_csco_locked'
      },
      track:{
        ticker:'CSCO',
        canonicalVerdict:'watch',
        visualBucket:'monitor',
        visibleBucket:'monitor',
        tone:'monitor',
        badgeLabel:'Watch',
        headline:'Watch',
        statusText:'Watch',
        nextAction:'Wait for clean confirmation instead of forcing an entry.',
        actionLabel:'Wait for clean confirmation instead of forcing an entry.',
        primaryReason:'The contract keeps this on watch until confirmation improves.',
        planStatus:'valid',
        setupScore:4,
        contractFingerprint:'fp_csco_locked'
      }
    },
    review:{
      analysisState:{normalized:null},
      projectionSource:'',
      projectionSnapshot:null
    }
  };

  const replay = runReplayForSnapshot(snapshot);

  expect(replay.result.reviewCanonicalVerdict).toBe('watch');
  expect(replay.result.reviewVisualBucket).toBe('monitor');
  expect(replay.result.reviewNextAction).toBe('Wait for clean confirmation instead of forcing an entry.');
  expect(replay.result.reviewPrimaryReason).toBe('The contract keeps this on watch until confirmation improves.');
  expect(replay.result.planStatus).toBe('valid');
  expect(replay.result.simulatedLifecycleFromWatch).toBe('watch');
  expect(replay.result.structureState).toBe('developing_clean');
  expect(replay.result.structureEligibility).toBe('alive');
  expect(replay.result.bounceState).toBe('attempt');
  expect(replay.result.stabilisationState).toBe('stabilising');
  expect(replay.result.priceabilityState).toBe('provisional');
  expect(replay.result.setupScore).toBe(4);
  expect(replay.result.snapshotContractFingerprint).toBe('fp_csco_locked');
  expect(replay.result.realisticTarget).toBe(66.9);
  expect(replay.result.extendedTarget).toBe(69.4);
  expect(replay.result.realisticRr).toBe(2.12);
  expect(replay.result.targetStretchPct).toBe(4.7);
  expect(replay.result.targetCapReason).toBe('snapshot_review_contract');
  expect(replay.result.replayAuthoritySource).toBe('canonical_contract');
});

test('replay still reports recomputed authority drift diagnostics while keeping snapshot public authority locked', async () => {
  const snapshot = {
    ticker:'ADBE',
    marketData:{
      currency:'USD',
      price:522.4,
      ma20:510.8,
      ma50:498.1,
      ma200:470.5,
      asOf:'2026-06-28T22:40:32.187Z'
    },
    plan:{
      status:'missing',
      tradeability:'not_ready',
      source:'scanner_estimate'
    },
    scan:{
      resolvedVerdict:'Entry',
      verdict:'Entry',
      analysisProjection:{
        derived_states:{
          trend_state:'strong',
          pullback_zone:'near_20ma',
          setup_location_state:'near_20ma',
          structure_state:'strong',
          bounce_state:'confirmed',
          priceability_state:'priceable'
        }
      }
    },
    canonicalContract:{
      schemaVersion:'plan-verdict-contract-v1',
      ticker:'ADBE',
      authoritativeInputs:{
        ticker:'ADBE',
        scanner:{resolvedVerdict:'Watch', score:24, analysisProjection:{}, flags:{}},
        reviewAuthority:{savedVerdict:'', savedScore:null, manualReview:null},
        planAuthority:{entry:null, stop:null, firstTarget:null, source:'', authoritySource:'', authorityVersion:'', submittedPaperTradeAt:''},
        lifecycleAuthority:{stage:'watchlist', status:'active', lockReason:'', expiresAt:'2026-07-10'},
        paperTradeAuthority:{submittedTrades:[]},
        marketData:{price:522.4, ma20:510.8, ma50:498.1, ma200:470.5, asOf:'2026-06-28T22:40:32.187Z'}
      },
      canonicalVerdict:'watch',
      canonicalVisualBucket:'monitor',
      derivedStates:{
        setupScore:3,
        structureState:'developing_clean',
        structureEligibility:'alive',
        setupLocationState:'near_20ma',
        priceabilityState:'provisional',
        stabilisationState:'stabilising',
        bounceState:'attempt'
      },
      planAuthority:{
        entry:null,
        stop:null,
        firstTarget:null,
        source:'not_generated',
        stamped:false,
        status:'missing',
        tradeability:'not_ready',
        riskStatus:'plan_missing'
      },
      lifecycleAuthority:{
        stage:'watchlist',
        status:'active',
        state:'watch',
        label:'Watch',
        lockReason:'',
        expiresAt:'2026-07-10'
      },
      paperTradeAuthority:{
        submittedTrades:[]
      },
      contractFingerprint:'fp_adbe_locked'
    },
    renderModels:{
      review:{
        ticker:'ADBE',
        canonicalVerdict:'watch',
        visualBucket:'monitor',
        tone:'monitor',
        badgeLabel:'Watch',
        headline:'Watch',
        nextAction:'Wait for proper confirmation.',
        primaryReason:'Snapshot contract keeps this in watch mode.',
        planVisible:false,
        planStatus:'missing',
        setupScore:3,
        actionable:false,
        contractFingerprint:'fp_adbe_locked'
      },
      track:{
        ticker:'ADBE',
        canonicalVerdict:'watch',
        visualBucket:'monitor',
        visibleBucket:'monitor',
        tone:'monitor',
        badgeLabel:'Watch',
        headline:'Watch',
        statusText:'Watch',
        nextAction:'Wait for proper confirmation.',
        actionLabel:'Wait for proper confirmation.',
        primaryReason:'Snapshot contract keeps this in watch mode.',
        planStatus:'missing',
        setupScore:3,
        contractFingerprint:'fp_adbe_locked'
      }
    },
    review:{
      analysisState:{normalized:null},
      projectionSource:'',
      projectionSnapshot:null
    }
  };

  const replay = runReplayForSnapshot(snapshot);

  expect(replay.result.reviewCanonicalVerdict).toBe('watch');
  expect(replay.result.reviewVisualBucket).toBe('monitor');
  expect(replay.result.replayAuthoritySource).toBe('canonical_contract');
  expect(replay.result.authorityDrift).toBeTruthy();
  expect(replay.result.authorityDrift.differsFromSnapshot).toBe(true);
  expect(replay.result.authorityDrift.scannerCanonicalVerdict).toBe('entry');
  expect(replay.result.authorityDrift.canonicalVerdict).toBe('watch');
  expect(replay.result.authorityDrift.visualBucket).toBe('monitor');
});

test('replay preserves snapshot target profile values instead of recomputing them away', async () => {
  const snapshot = {
    ticker:'AMZN',
    marketData:{
      currency:'USD',
      price:188.4,
      ma20:182.1,
      ma50:176.4,
      ma200:160.3,
      asOf:'2026-06-28T22:40:32.187Z'
    },
    plan:{
      entry:188.4,
      stop:182.2,
      firstTarget:201.5,
      status:'valid',
      tradeability:'tradable',
      riskStatus:'fits_risk'
    },
    scan:{
      resolvedVerdict:'Near Entry',
      verdict:'Near Entry',
      analysisProjection:{
        derived_states:{
          trend_state:'strong',
          pullback_zone:'near_20ma',
          setup_location_state:'near_20ma',
          structure_state:'strong',
          bounce_state:'attempt',
          priceability_state:'priceable'
        },
        target_profile:{
          nearestResistance:194.8,
          realisticTarget:201.5,
          extendedTarget:208.2,
          realisticRr:2.11,
          targetStretchPct:6.9,
          targetCapReason:'snapshot_target_profile'
        }
      }
    }
  };

  const replay = runReplayForSnapshot(snapshot);

  expect(replay.result.realisticTarget).toBe(201.5);
  expect(replay.result.extendedTarget).toBe(208.2);
  expect(replay.result.realisticRr).toBe(2.11);
  expect(replay.result.targetStretchPct).toBe(6.9);
  expect(replay.result.targetCapReason).toBe('snapshot_target_profile');
});
