function same(left, right){
  return JSON.stringify(left) === JSON.stringify(right);
}

function text(value){
  return String(value || '').trim();
}

function diagnoseParity(appState, replayResult){
  const review = appState.review || {};
  const track = appState.track || {};
  const scan = appState.scan || {};
  const replay = replayResult || {};

  const comparisons = [
    {
      field:'reviewCanonicalVerdict',
      app:review.stateHealth && review.stateHealth.canonicalVerdict,
      replay:replay.reviewCanonicalVerdict,
      source:'resolver-core / resolveSimplifiedStateForSurface()',
      file:'app.js'
    },
    {
      field:'reviewVisualBucket',
      app:review.stateHealth && review.stateHealth.visualBucket,
      replay:replay.reviewVisualBucket,
      source:'resolver-presentation / resolveSimplifiedStateForSurface()',
      file:'app.js'
    },
    {
      field:'scannerCanonicalVerdict',
      app:scan.simplifiedState && scan.simplifiedState.canonicalVerdict,
      replay:replay.scannerCanonicalVerdict,
      source:'scan grouping / resolveSimplifiedStateForSurface()',
      file:'app.js'
    },
    {
      field:'scannerVisualBucket',
      app:scan.simplifiedState && scan.simplifiedState.visualBucket,
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
      app:track.simplifiedState && track.simplifiedState.canonicalVerdict,
      replay:replay.reviewCanonicalVerdict,
      source:'track presentation / buildSharedReviewTrackPresentation()',
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
      firstFunction:'buildSharedReviewTrackPresentation()',
      likelySourceFile:'app.js',
      confidence:'medium',
      verdict:'app presentation is wrong',
      recommendedFix:'Audit Track visible-model derivation and persisted presentation handoff, not the resolver core.',
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
