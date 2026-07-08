const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

function loadPlanVerdictContract(){
  const sandbox = {
    window:{},
    console
  };
  sandbox.globalThis = sandbox.window;
  const source = fs.readFileSync(path.join(root, 'js/domain/plan-verdict-contract.js'), 'utf8');
  vm.runInNewContext(source, sandbox, {filename:'js/domain/plan-verdict-contract.js'});
  assert.ok(sandbox.window.PlanVerdictContract, 'PlanVerdictContract should be exported on window');
  return sandbox.window.PlanVerdictContract;
}

function sampleRecord(){
  return {
    ticker:'TROW',
    marketData:{
      price:110.27,
      ma20:106.72,
      ma50:103.85,
      ma200:100.98,
      volume:3831934,
      avgVolume:2115787.96,
      perf1w:2.43,
      perf1m:5.52,
      asOf:'2026-06-28T14:40:23.308Z'
    },
    scan:{
      resolvedVerdict:'Near Entry',
      score:9,
      analysisProjection:{
        derived_states:{
          trend_state:'strong',
          structure_state:'strong',
          bounce_state:'attempt'
        }
      },
      flags:{
        checks:{above50:true}
      }
    },
    review:{
      savedVerdict:'Entry',
      savedScore:8,
      manualReview:{
        entry:111,
        stop:105,
        target:125,
        score:8
      }
    },
    plan:{
      entry:110.27,
      stop:102.29,
      firstTarget:136.19,
      source:'scanner_estimate',
      authoritySource:'saved_review',
      authorityVersion:'trade_plan_v1',
      authorityReason:'saved_review_plan',
      writtenBy:'persistActiveReviewDraft',
      writtenAt:'2026-06-29T08:58:00.000Z',
      submittedPaperTradeAt:'2026-06-29T09:00:00.000Z'
    },
    setup:{
      score:7,
      structureState:'strong',
      structureEligibility:'alive',
      setupLocationState:'near_20ma',
      pullbackZone:'near_20ma',
      priceabilityState:'priceable',
      bounceState:'attempt',
      stabilisationState:'clear',
      trendState:'strong'
    },
    watchlist:{
      inWatchlist:true,
      presentation:{
        sharedPresentation:{
          canonicalVerdict:'watch'
        }
      },
      debug:{
        downgradeReason:'diagnostic only'
      }
    },
    lifecycle:{
      stage:'active',
      status:'reviewed',
      expiresAt:'2026-07-01T00:00:00.000Z'
    },
    diary:{
      records:[
        {
          id:'paper-1',
          ticker:'TROW',
          sourceType:'paper_trade',
          status:'submitted',
          updatedAt:'2026-06-29T09:30:00.000Z'
        }
      ]
    }
  };
}

function run(){
  const contractModule = loadPlanVerdictContract();
  const {
    CATEGORY,
    fieldClassificationForTickerRecordPath,
    canonicalInputFingerprint,
    contractFingerprint,
    buildPlanVerdictContract,
    buildReviewRenderModel,
    buildTrackRenderModel,
    buildTrackLongPressModel
  } = contractModule;

  assert.strictEqual(fieldClassificationForTickerRecordPath('scan.analysisProjection'), CATEGORY.CANONICAL_AUTHORITY);
  assert.strictEqual(fieldClassificationForTickerRecordPath('review.savedVerdict'), CATEGORY.PERSISTED_STATE);
  assert.strictEqual(fieldClassificationForTickerRecordPath('watchlist.presentation.sharedPresentation'), CATEGORY.DISPLAY_CACHE);
  assert.strictEqual(fieldClassificationForTickerRecordPath('watchlist.debug'), CATEGORY.DIAGNOSTICS_ONLY);
  assert.strictEqual(fieldClassificationForTickerRecordPath('review.draft'), CATEGORY.TEMPORARY_UI_STATE);

  const record = sampleRecord();
  const fingerprintA = canonicalInputFingerprint(record);
  const fingerprintB = canonicalInputFingerprint(JSON.parse(JSON.stringify(record)));
  assert.strictEqual(fingerprintA, fingerprintB, 'canonical input fingerprint should be deterministic');

  const contract = buildPlanVerdictContract(record);
  assert.strictEqual(contract.ticker, 'TROW');
  assert.strictEqual(contract.canonicalVerdict, 'near_entry');
  assert.strictEqual(contract.canonicalVisualBucket, 'near_entry');
  assert.strictEqual(contract.derivedStates.setupScore, 8);
  assert.strictEqual(contract.planAuthority.stamped, true);
  assert.ok(Array.isArray(contract.paperTradeAuthority.submittedTrades), 'submitted paper trades should be exposed as historical authority inputs');
  assert.strictEqual(contract.paperTradeAuthority.submittedTrades.length, 1);

  const contractCopy = buildPlanVerdictContract(JSON.parse(JSON.stringify(record)));
  assert.strictEqual(contractFingerprint(contract), contractFingerprint(contractCopy), 'equivalent contracts should fingerprint the same');

  const reviewModel = buildReviewRenderModel(contract, {draftVerdict:'watch'});
  assert.strictEqual(reviewModel.canonicalVerdict, 'near_entry');
  assert.strictEqual(reviewModel.visualBucket, 'near_entry');
  assert.strictEqual(reviewModel.contractFingerprint, contract.contractFingerprint);

  const trackModel = buildTrackRenderModel(contract);
  assert.strictEqual(trackModel.inWatchlist, true);
  assert.strictEqual(trackModel.canonicalVerdict, 'near_entry');

  const longPressModel = buildTrackLongPressModel(contract);
  assert.strictEqual(longPressModel.header, 'Near Entry');
  assert.strictEqual(longPressModel.actionable, false);

  assert.ok(
    appSource.includes('const planVerdictContract = buildCanonicalPlanVerdictContract(item, {'),
    'app.js must build a canonical plan/verdict contract inside active resolver adapters'
  );
  assert.ok(
    /const trackRenderModel = planVerdictContractApi[\s\S]*?buildTrackRenderModel/.test(appSource),
    'buildSharedReviewTrackPresentation must delegate through buildTrackRenderModel'
  );
  assert.ok(
    appSource.includes('const planVerdictContract = refreshed.canonicalContract && refreshed.canonicalContract.planVerdictContract'),
    'currentPaperTradeContextForTicker must consume the canonical contract bundle when available'
  );
  assert.ok(
    appSource.includes("schemaVersion:'resolved-state-bundle-cache-v2'"),
    'resolved state bundle cache should use the explicit v2 schema'
  );
  assert.ok(
    appSource.includes('inputFingerprint:resolvedStateBundleInputFingerprint('),
    'resolved state bundle cache should be keyed by canonical input fingerprint'
  );
  assert.ok(
    !appSource.includes('cachedAt:new Date().toISOString()'),
    'resolved state bundle cache should no longer be timestamp-biased'
  );
  assert.ok(
    appSource.includes("schemaVersion:'watchlist-presentation-cache-v2'"),
    'persisted watchlist presentation should use the explicit display-cache schema'
  );

  console.log('run-plan-verdict-contract-assertions: ok');
}

run();
