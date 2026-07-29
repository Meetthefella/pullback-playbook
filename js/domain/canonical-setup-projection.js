(function(global){
  // Presentation-only projection of the validated canonical decision.  This is
  // intentionally the sole place a displayed bucket and setup score are made.
  // It never reads setup.score, scan.score, lifecycle state, or assessment prose.
  const VERSION = 'canonical-setup-projection-v1';

  function key(value, fallback = ''){
    const normalized = String(value == null ? '' : value).trim().toLowerCase().replace(/[\s-]+/g, '_');
    return normalized || fallback;
  }

  function isOneOf(value, values){ return values.includes(key(value)); }
  function labelFor(bucket){ return bucket === 'near_entry' ? 'Near Entry' : (bucket === 'entry' ? 'Entry' : (bucket === 'avoid' ? 'Avoid' : 'Watch')); }

  function projectionInput(publication){
    const envelope = publication && typeof publication === 'object' ? publication : {};
    const failed = envelope.publicationStatus === 'validation_failed';
    const canonical = !failed && envelope.canonicalResult && typeof envelope.canonicalResult === 'object' ? envelope.canonicalResult : null;
    const fallback = envelope.safeFallback && typeof envelope.safeFallback === 'object' ? envelope.safeFallback : {};
    const semantics = canonical && canonical.semantics || {};
    const eligibility = canonical && canonical.eligibility || {};
    const plan = canonical && canonical.plan || {};
    const verdict = key(failed ? fallback.verdict : canonical && canonical.verdict && canonical.verdict.value, 'watch');
    return {envelope, failed, canonical, fallback, semantics, eligibility, plan, verdict};
  }

  function numericOrNull(value){ const number = Number(value); return Number.isFinite(number) ? number : null; }
  function presentationForStatus(status){
    const resolvedStatus = key(status, 'watch');
    if(resolvedStatus === 'avoid') return {resolvedStatus, bucket:'avoid', tone:'avoid', visualBucket:'avoid', range:[0, 2]};
    if(resolvedStatus === 'near_entry') return {resolvedStatus, bucket:'near_entry', tone:'near_entry', visualBucket:'near_entry', range:[6, 9]};
    if(resolvedStatus === 'entry') return {resolvedStatus, bucket:'entry', tone:'entry', visualBucket:'entry', range:[8, 10]};
    return {resolvedStatus:'watch', bucket:'watch', tone:'watch', visualBucket:'monitor', range:[3, 5]};
  }

  function project(publication, options = {}){
    const input = projectionInput(publication);
    const presentation = presentationForStatus(input.verdict);
    const entryEligible = input.eligibility.entry && input.eligibility.entry.qualified === true;
    const nearEntryEligible = input.eligibility.nearEntry && input.eligibility.nearEntry.qualified === true;
    const baseScore = numericOrNull(options.baseScore);
    const canonicalGates = input.canonical && input.canonical.gates || {};
    const maximumEntryQuality = entryEligible && canonicalGates.entry === true && canonicalGates.buyerControl === true && canonicalGates.confirmation === true && key(input.plan.state) === 'valid';
    const scoreAvailable = !input.failed && baseScore !== null;
    let setupScore = null;
    if(scoreAvailable){
      setupScore = Math.max(presentation.range[0], Math.min(presentation.range[1], Math.round(baseScore)));
      if(presentation.resolvedStatus === 'entry' && setupScore === 10 && !maximumEntryQuality) setupScore = 9;
    }
    const scoreBreakdown = Object.freeze({baseScore, band:presentation.range.slice(), maximumEntryQuality, constrainedScore:setupScore});
    const bucketReason = input.failed
      ? 'Canonical decision is unavailable because validation failed.'
      : `Canonical resolved status is ${labelFor(presentation.resolvedStatus)}.`;

    return Object.freeze({
      version:VERSION,
      resolvedStatus:presentation.resolvedStatus,
      bucket:presentation.bucket,
      bucketLabel:labelFor(presentation.bucket),
      tone:presentation.tone,
      visualBucket:presentation.visualBucket,
      setupScore,
      scoreAvailable,
      scoreBreakdown,
      bucketReason,
      canonicalStateSource:input.failed ? 'canonical_publication_safe_fallback' : 'canonical_decision_result',
      canonicalVerdict:input.verdict,
      canonicalEntryEligibility:entryEligible,
      canonicalNearEntryEligibility:nearEntryEligible,
      legacyFallbackUsed:false,
      diagnostics:Object.freeze({
        displayedBucket:presentation.bucket,
        displayedSetupScore:setupScore,
        scoreAvailable,
        canonicalBucket:input.verdict,
        canonicalEntryEligibility:entryEligible,
        canonicalNearEntryEligibility:nearEntryEligible,
        structureState:key(input.semantics.structure && input.semantics.structure.state, 'unknown'),
        supportState:key(input.semantics.support && input.semantics.support.testState, 'unknown'),
        buyerControlState:key(input.semantics.buyer && input.semantics.buyer.control, 'unknown'),
        confirmationState:key(input.semantics.buyer && input.semantics.buyer.followThrough, 'unknown'),
        planValidity:key(input.plan.state, 'unknown'),
        scoreBreakdown,
        bucketReason,
        legacyFallbackUsed:false
      })
    });
  }

  global.CanonicalSetupProjection = {VERSION, project};
})(typeof window !== 'undefined' ? window : globalThis);
