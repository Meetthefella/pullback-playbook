function same(left, right){
  return JSON.stringify(left) === JSON.stringify(right);
}

function text(value){
  return String(value || '').trim();
}

function normalizeVisibleVerdict(value){
  const safe = text(value).toLowerCase().replace(/\s+/g, '_');
  if(safe === 'entry') return 'entry';
  if(safe === 'near_entry') return 'near_entry';
  if(safe === 'avoid') return 'avoid';
  if(safe === 'watch') return 'watch';
  return '';
}

function normalizeVisibleBucketFromVerdict(value){
  const verdict = normalizeVisibleVerdict(value);
  if(verdict === 'entry') return 'entry';
  if(verdict === 'near_entry') return 'near_entry';
  if(verdict === 'avoid') return 'avoid';
  if(verdict === 'watch') return 'monitor';
  return '';
}

function diagnoseParity(appState, replayResult){
  const review = appState.review || {};
  const track = appState.track || {};
  const scan = appState.scan || {};
  const replay = replayResult || {};
  const appContract = appState.authority && appState.authority.canonicalContract && typeof appState.authority.canonicalContract === 'object'
    ? appState.authority.canonicalContract
    : null;
  const appReplayBuilder = appState.authority && appState.authority.replayBuilder && typeof appState.authority.replayBuilder === 'object'
    ? appState.authority.replayBuilder
    : null;
  const replayContract = replay.canonicalContract && typeof replay.canonicalContract === 'object'
    ? replay.canonicalContract
    : null;
  const appRenderModels = appState.authority && appState.authority.renderModels && typeof appState.authority.renderModels === 'object'
    ? appState.authority.renderModels
    : null;
  const appReviewRenderModel = appRenderModels && appRenderModels.review && typeof appRenderModels.review === 'object'
    ? appRenderModels.review
    : null;
  const appTrackRenderModel = appRenderModels && appRenderModels.track && typeof appRenderModels.track === 'object'
    ? appRenderModels.track
    : null;
  const scanVisibleCanonical = normalizeVisibleVerdict(scan.visibleCard && scan.visibleCard.badgeLabel);
  const scanVisibleBucket = normalizeVisibleBucketFromVerdict(scan.visibleCard && scan.visibleCard.badgeLabel);
  const scanCanonicalAppValue = scanVisibleCanonical || (scan.simplifiedState && scan.simplifiedState.canonicalVerdict);
  const scanBucketAppValue = scanVisibleBucket || (scan.simplifiedState && scan.simplifiedState.visualBucket);

  if(appContract && replayContract && !same(appContract, replayContract)){
    return {
      hasMismatch:true,
      firstDifferingField:'canonicalContract',
      appValue:appContract,
      replayValue:replayContract,
      firstFunction:'buildPlanVerdictContract()',
      likelySourceFile:'app.js / scripts/replay-resolver-snapshot.js',
      confidence:'high',
      verdict:'contract parity mismatch',
      recommendedFix:'Compare live canonical contract serialization against replay snapshot contract before inspecting presentation or resolver adapters.',
      regressionAssertion:'Assert replay canonicalContract exactly matches the live app canonical contract for the same frozen snapshot.'
    };
  }

  if(appReplayBuilder && !same(appReplayBuilder.reviewCanonicalVerdict, replay.reviewCanonicalVerdict)){
    return {
      hasMismatch:true,
      firstDifferingField:'appReplayBuilder.reviewCanonicalVerdict',
      appValue:appReplayBuilder.reviewCanonicalVerdict,
      replayValue:replay.reviewCanonicalVerdict,
      firstFunction:'buildReplaySnapshotForTicker()',
      likelySourceFile:'app.js / scripts/replay-resolver-snapshot.js',
      confidence:'high',
      verdict:'browser replay builder mismatch',
      recommendedFix:'Compare app-side buildReplaySnapshotForTicker output against CLI replay output before changing presentation-layer parity checks.',
      regressionAssertion:'Assert browser buildReplaySnapshotForTicker().reviewCanonicalVerdict matches CLI replay reviewCanonicalVerdict for the same frozen snapshot.'
    };
  }

  if(appReplayBuilder && !same(appReplayBuilder.reviewVisualBucket, replay.reviewVisualBucket)){
    return {
      hasMismatch:true,
      firstDifferingField:'appReplayBuilder.reviewVisualBucket',
      appValue:appReplayBuilder.reviewVisualBucket,
      replayValue:replay.reviewVisualBucket,
      firstFunction:'buildReplaySnapshotForTicker()',
      likelySourceFile:'app.js / scripts/replay-resolver-snapshot.js',
      confidence:'high',
      verdict:'browser replay builder mismatch',
      recommendedFix:'Compare app-side buildReplaySnapshotForTicker output against CLI replay output before changing presentation-layer parity checks.',
      regressionAssertion:'Assert browser buildReplaySnapshotForTicker().reviewVisualBucket matches CLI replay reviewVisualBucket for the same frozen snapshot.'
    };
  }

  const comparisons = [
    {
      field:'reviewCanonicalVerdict',
      app:(appReviewRenderModel && appReviewRenderModel.canonicalVerdict) || (review.stateHealth && review.stateHealth.canonicalVerdict),
      replay:replay.reviewCanonicalVerdict,
      source:'buildReviewRenderModel()',
      file:'app.js'
    },
    {
      field:'reviewVisualBucket',
      app:(appReviewRenderModel && appReviewRenderModel.visualBucket) || (review.stateHealth && review.stateHealth.visualBucket),
      replay:replay.reviewVisualBucket,
      source:'buildReviewRenderModel()',
      file:'app.js'
    },
    {
      field:'scannerCanonicalVerdict',
      app:scanCanonicalAppValue,
      replay:replay.scannerCanonicalVerdict,
      source:'scan grouping / resolveSimplifiedStateForSurface()',
      file:'app.js'
    },
    {
      field:'scannerVisualBucket',
      app:scanBucketAppValue,
      replay:replay.scannerVisualBucket,
      source:'scan presentation / resolveSimplifiedStateForSurface()',
      file:'app.js'
    },
    {
      field:'planStatus',
      app:review.stateHealth && review.stateHealth.planStatus,
      replay:null,
      source:'simplified-plan-state / review projection',
      file:'app.js'
    },
    {
      field:'trackCanonicalVerdict',
      app:(appTrackRenderModel && appTrackRenderModel.canonicalVerdict) || (track.simplifiedState && track.simplifiedState.canonicalVerdict),
      replay:replay.reviewCanonicalVerdict,
      source:'buildTrackRenderModel()',
      file:'app.js'
    }
  ];

  const firstReplayMismatch = comparisons.find(entry => entry.replay !== null && !same(entry.app, entry.replay));
  if(firstReplayMismatch){
    const authoritativeReplayInputsAligned = !!(
      appState.snapshotContract
      && appState.snapshotContract.hasAnalysisProjection === true
      && appState.snapshotContract.hasPlan === true
    );
    const persistedInfluence = !!(
      appState.recordFlags
      && (
        appState.recordFlags.inWatchlist
        || appState.recordFlags.hasManualReview
        || appState.recordFlags.hasPersistedTrackPresentation
      )
    );
    return {
      hasMismatch:true,
      firstDifferingField:firstReplayMismatch.field,
      appValue:firstReplayMismatch.app,
      replayValue:firstReplayMismatch.replay,
      firstFunction:firstReplayMismatch.source,
      likelySourceFile:firstReplayMismatch.file,
      confidence:authoritativeReplayInputsAligned ? 'high' : (persistedInfluence ? 'high' : 'medium'),
      verdict:authoritativeReplayInputsAligned
        ? 'app or replay canonical layer is wrong'
        : (persistedInfluence ? 'app and replay are using different effective inputs' : 'app or replay canonical layer is wrong'),
      recommendedFix:authoritativeReplayInputsAligned
        ? 'Compare live canonical resolver inputs and outputs against replay for this frozen snapshot and fix the first authoritative transformation.'
        : (persistedInfluence
        ? 'Audit persisted review/watchlist metadata and app-only authority gates before changing resolver logic.'
        : 'Compare canonical resolver inputs for the live record against the replay snapshot and fix the first authoritative transformation.'),
      regressionAssertion:firstReplayMismatch.field === 'reviewCanonicalVerdict'
        ? 'Assert live review canonical verdict matches replay reviewCanonicalVerdict for the same frozen snapshot.'
        : `Assert live ${firstReplayMismatch.field} matches replay output for the same frozen snapshot.`
    };
  }

  const reviewBadge = text(review.visible && review.visible.badgeLabel);
  const reviewVerdictLabel = text(review.stateHealth && review.stateHealth.canonicalVerdict);
  const badgeMismatch = reviewBadge && reviewVerdictLabel && !reviewBadge.toLowerCase().includes(reviewVerdictLabel.replace('_', ' '));
  if(badgeMismatch){
    return {
      hasMismatch:true,
      firstDifferingField:'reviewBadgeLabel',
      appValue:reviewBadge,
      replayValue:reviewVerdictLabel,
      firstFunction:'buildResolvedReviewDisplayModel() / review render',
      likelySourceFile:'app.js',
      confidence:'medium',
      verdict:'app presentation is wrong',
      recommendedFix:'Keep canonical review state unchanged and audit the review display model or badge mapping.',
      regressionAssertion:'Assert review badge/primary label remains aligned with canonical review verdict after render.'
    };
  }

  const trackBadge = text(track.visible && track.visible.badgeLabel);
  const trackVerdict = text(track.simplifiedState && track.simplifiedState.canonicalVerdict);
  const trackMismatch = trackBadge && trackVerdict && !trackBadge.toLowerCase().includes(trackVerdict.replace('_', ' '));
  if(trackMismatch){
    return {
      hasMismatch:true,
      firstDifferingField:'trackBadgeLabel',
      appValue:trackBadge,
      replayValue:trackVerdict,
      firstFunction:'buildTrackRenderModel()',
      likelySourceFile:'app.js',
      confidence:'medium',
      verdict:'app presentation is wrong',
      recommendedFix:'Audit canonical Track render-model derivation and persisted presentation handoff, not the resolver core.',
      regressionAssertion:'Assert Track badge/section label remains aligned with canonical watchlist verdict.'
    };
  }

  return {
    hasMismatch:false,
    firstDifferingField:'',
    appValue:null,
    replayValue:null,
    firstFunction:'',
    likelySourceFile:'',
    confidence:'high',
    verdict:'parity matched',
    recommendedFix:'',
    regressionAssertion:''
  };
}

module.exports = {
  diagnoseParity
};
