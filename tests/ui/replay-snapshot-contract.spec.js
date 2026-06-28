const {test, expect} = require('@playwright/test');
const {buildReplaySnapshotFromRecord} = require('./helpers/app-state');

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
  expect(snapshot.review.manualReview).toEqual({
    entry:110.27,
    stop:102.29,
    target:136.19
  });
  expect(snapshot.marketData.history).toHaveLength(1);
  expect(snapshot.watchlist).toBeUndefined();
  expect(snapshot.track).toBeUndefined();
});
