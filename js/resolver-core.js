(function(global){
  // Canonical global-verdict helpers extracted from app.js.
  const diagnosticTraceState = {};
  const MIN_ENTRY_RR = 2;
  const MIN_NEAR_ENTRY_RR = 1.5;

  function debugFlagEnabled(flagName){
    try{
      if(typeof global !== 'undefined' && global && global[flagName] === true) return true;
      if(typeof global !== 'undefined' && global && global.localStorage){
        return global.localStorage.getItem(flagName) === '1';
      }
    }catch(_error){}
    return false;
  }

  function logDiagnosticTrace(flagName, label, payload, options = {}){
    if(!debugFlagEnabled(flagName) || typeof console === 'undefined' || !console.info) return;
    const key = String(options.key || `${label}:${payload && payload.ticker || ''}`);
    const now = Date.now();
    const minIntervalMs = Number.isFinite(Number(options.minIntervalMs)) ? Number(options.minIntervalMs) : 1000;
    const previous = diagnosticTraceState[key] || {count:0, last:0};
    previous.count += 1;
    if(now - previous.last < minIntervalMs){
      diagnosticTraceState[key] = previous;
      return;
    }
    previous.last = now;
    diagnosticTraceState[key] = previous;
    console.info(label, previous.count > 1 ? {...payload, coalescedCount:previous.count} : payload);
    previous.count = 0;
  }

  function coerceCanonicalVerdict(verdict, fallback = 'watch'){
    const safe = String(verdict || '').trim().toLowerCase();
    if(safe === 'entry') return 'entry';
    if(safe === 'near_entry' || safe === 'near entry' || safe === 'nearentry') return 'near_entry';
    if(safe === 'avoid') return 'avoid';
    if(['watch','monitor','monitor_watch','developing','active','scanner_watch','review_monitor'].includes(safe)) return 'watch';
    if(['dead','diminishing'].includes(safe)) return 'avoid';
    return fallback;
  }

  function normalizeGlobalVerdictKey(verdict){
    return coerceCanonicalVerdict(verdict, 'watch');
  }

  function normalizeVerdict(verdict){
    return normalizeGlobalVerdictKey(verdict);
  }

  function cloneResolutionValue(value){
    if(value == null || typeof value !== 'object') return value;
    if(Array.isArray(value)) return value.map(cloneResolutionValue);
    return Object.keys(value).reduce((copy, name) => {
      copy[name] = cloneResolutionValue(value[name]);
      return copy;
    }, {});
  }

  function freezeResolutionValue(value){
    if(!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(name => freezeResolutionValue(value[name]));
    return Object.freeze(value);
  }

  // Stage 1: an immutable boundary between normalisation and resolution.
  // It contains factual evidence/provenance and policy identity only; semantic
  // evaluation, gates, promotion guards, and verdict selection remain below.
  function buildCanonicalResolutionContext(normalisedEvidence, dependencies = {}){
    const sourceEvidence = normalisedEvidence && typeof normalisedEvidence === 'object'
      ? normalisedEvidence
      : {schemaVersion:'normalised-decision-evidence-v1', snapshotId:'unavailable', source:'resolver-core-fallback'};
    const policy = dependencies.policy && typeof dependencies.policy === 'object' ? dependencies.policy : {};
    return freezeResolutionValue({
      schemaVersion:'canonical-resolution-context-v1',
      evidence:cloneResolutionValue(sourceEvidence),
      evidenceId:String(sourceEvidence.snapshotId || 'unavailable'),
      resolverSnapshotId:`${String(sourceEvidence.snapshotId || 'unavailable')}:resolver-core`,
      resolverSource:String(dependencies.resolverSource || 'resolver-core'),
      policy:cloneResolutionValue(policy),
      provenance:cloneResolutionValue(sourceEvidence.provenance || {}),
      surface:'resolver-core'
    });
  }

  // Stage 2: immutable hand-off from factual/semantic evaluation to the
  // unchanged verdict selector. Inputs are the existing helper outputs; this
  // function deliberately does not choose a verdict or presentation fields.
  function evaluateCanonicalSemanticsAndGates(context, inputs = {}){
    const source = inputs && typeof inputs === 'object' ? inputs : {};
    return freezeResolutionValue({
      schemaVersion:'canonical-evaluation-result-v1',
      evidence:context && context.evidence ? cloneResolutionValue(context.evidence) : null,
      provenance:context && context.provenance ? cloneResolutionValue(context.provenance) : {},
      semanticStates:cloneResolutionValue(source.semanticStates || {}),
      gates:cloneResolutionValue(source.gates || {}),
      eligibilityInputs:cloneResolutionValue(source.eligibilityInputs || {}),
      promotionGuards:cloneResolutionValue(source.promotionGuards || {}),
      terminalBlockers:cloneResolutionValue(source.terminalBlockers || {}),
      planEvaluation:cloneResolutionValue(source.planEvaluation || {}),
      diagnostics:cloneResolutionValue(source.diagnostics || {})
    });
  }

  // Stage 3A keeps verdict selection in its legacy location. This helper only
  // captures each existing boundary so Stage 3B can compare a shadow selector
  // step-for-step before authority moves.
  function appendLegacyDecisionTrace(trace, details = {}){
    const steps = Array.isArray(trace) ? trace : [];
    const inputVerdict = normalizeVerdict(details.inputVerdict || 'watch');
    const outputVerdict = normalizeVerdict(details.outputVerdict || inputVerdict);
    steps.push(Object.freeze({
      stepCode:String(details.stepCode || 'legacy_decision_boundary'),
      inputVerdict,
      outputVerdict,
      changed:inputVerdict !== outputVerdict,
      blockerCode:String(details.blockerCode || ''),
      blockerCategory:String(details.blockerCategory || ''),
      reasonSource:String(details.reasonSource || ''),
      evidenceId:String(details.evidenceId || ''),
      resultVersion:String(details.resultVersion || 'canonical-decision-result-v1.1')
    }));
    return steps;
  }

  function shouldPreserveScanAuthorityCanonicalPath(record){
    const item = record && typeof record === 'object' ? record : {};
    const authority = item.authority && typeof item.authority === 'object' ? item.authority : {};
    const authorityVersion = Number(authority.version);
    const authoritySource = String(authority.source || '').trim().toLowerCase();
    if(authoritySource !== 'scan' || !Number.isFinite(authorityVersion) || authorityVersion <= 0){
      return false;
    }
    const review = item.review && typeof item.review === 'object' ? item.review : {};
    const hasReviewAuthority = !!(
      (review.manualReview && typeof review.manualReview === 'object')
      || String(review.savedVerdict || '').trim()
    );
    if(hasReviewAuthority) return false;
    const plan = item.plan && typeof item.plan === 'object' ? item.plan : {};
    const planSource = String(plan.source || '').trim().toLowerCase();
    const planIntroducesNewAuthority = !!(
      String(plan.authorityVersion || '').trim()
      && String(plan.authoritySource || '').trim()
      && planSource
      && planSource !== 'scanner_estimate'
    );
    return !planIntroducesNewAuthority;
  }

  function selectedAuthorityContractForGlobalVerdict(record, deps = {}){
    const item = record && typeof record === 'object' ? record : {};
    const isTracked = !!(
      item.in_watchlist
      || item.watchlist_entry_exists
      || (item.watchlist && item.watchlist.inWatchlist)
    );
    const preserveScanAuthorityCanonicalPath = deps.preserveScanAuthorityCanonicalPath === true;
    if(isTracked && !preserveScanAuthorityCanonicalPath){
      return deps.resolveFinalStateContract(item, {context:'global'});
    }
    return deps.resolvePreLifecycleStateContract(item);
  }

  function selectedAuthorityContractSource(record, deps = {}){
    const item = record && typeof record === 'object' ? record : {};
    const isTracked = !!(
      item.in_watchlist
      || item.watchlist_entry_exists
      || (item.watchlist && item.watchlist.inWatchlist)
    );
    const preserveScanAuthorityCanonicalPath = deps.preserveScanAuthorityCanonicalPath === true;
    if(isTracked && preserveScanAuthorityCanonicalPath){
      return 'scan_authority_preserved';
    }
    if(isTracked){
      return 'final_state_contract';
    }
    if(deps.preserveReviewCanonicalForSoftReadiness === true){
      return 'review_soft_readiness_override';
    }
    return 'pre_lifecycle_contract';
  }

  function canonicalVerdictAuthoritySource(record, deps = {}){
    if(deps.preserveScanAuthorityCanonicalPath === true){
      return 'scan_authority_preserved';
    }
    if(deps.canonicalSoftReadinessAlignmentApplied === true){
      if(deps.preserveReviewCanonicalForSoftReadiness === true){
        return 'review_soft_readiness_override';
      }
      return 'non_tracked_soft_readiness';
    }
    return selectedAuthorityContractSource(record, deps);
  }

  function globalVerdictLabel(finalVerdict){
    return ({
      entry:'Entry',
      near_entry:'Near Entry',
      watch:'Watch',
      avoid:'Avoid',
    })[normalizeVerdict(finalVerdict)] || 'Watch';
  }

  function getTone(finalVerdict){
    return ({
      entry:'green',
      near_entry:'teal',
      watch:'monitor',
      avoid:'red',
    })[normalizeVerdict(finalVerdict)] || 'monitor';
  }

  function getBucket(finalVerdict){
    return ({
      entry:'tradeable_entry',
      near_entry:'tradeable_entry',
      watch:'monitor_watch',
      avoid:'lower_priority',
    })[normalizeVerdict(finalVerdict)] || 'monitor_watch';
  }

  function getBadge(finalVerdict){
    const safeVerdict = normalizeVerdict(finalVerdict);
    return ({
      entry:{text:'Entry', className:'badge--entry ready'},
      near_entry:{text:'Near Entry', className:'badge--near-entry near'},
      watch:{text:'Watch', className:'badge--monitor watch'},
      avoid:{text:'Avoid', className:'badge--avoid avoid'},
    })[safeVerdict] || {text:'Watch', className:'badge--monitor watch'};
  }

  function getActions(finalVerdict){
    const safeVerdict = normalizeVerdict(finalVerdict);
    return ({
      entry:{label:'ENTRY', detail:'Ready to act', planAllowed:true, watchlistAllowed:false},
      near_entry:{label:'NEAR ENTRY', detail:'Close to trigger', planAllowed:true, watchlistAllowed:true},
      watch:{label:'WATCH', detail:'Needs confirmation', planAllowed:false, watchlistAllowed:true},
      avoid:{label:'AVOID', detail:'Low priority', planAllowed:false, watchlistAllowed:false},
    })[safeVerdict] || {label:'WATCH', detail:'Needs confirmation', planAllowed:false, watchlistAllowed:true};
  }

  function canonicalVisualBucketForVerdict(verdict){
    const safeVerdict = normalizeVerdict(verdict);
    if(safeVerdict === 'entry') return 'entry';
    if(safeVerdict === 'near_entry') return 'near_entry';
    if(safeVerdict === 'avoid') return 'avoid';
    return 'monitor';
  }

  function numericValueOrNull(value){
    if(value === null || value === undefined) return null;
    if(typeof value === 'string' && value.trim() === '') return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function flagTextIsTrue(value){
    const safe = String(value || '').trim().toLowerCase();
    return value === true || safe === 'true' || safe === 'yes' || safe === '1';
  }

  function normalizeMarketSeverity(value){
    const safe = String(value || '').trim().toLowerCase();
    if(!safe) return 'neutral';
    if(/hostile|poor|bearish|below\s*50/.test(safe)) return 'hostile';
    if(/above\s*50/.test(safe)) return 'supportive';
    if(/weak/.test(safe)) return 'weak';
    if(/supportive|strong|bullish/.test(safe)) return 'supportive';
    if(/normal|neutral/.test(safe)) return 'neutral';
    return 'neutral';
  }

  function canonicalMarketSeverity(ctx = {}){
    if(String(ctx.market_severity || '').trim()){
      return normalizeMarketSeverity(ctx.market_severity);
    }
    return normalizeMarketSeverity(ctx.market_regime);
  }

  function normalizeVolumeState(value){
    const safe = String(value || '').trim().toLowerCase();
    if(['expanding', 'supportive', 'strong', 'active', 'above_average'].includes(safe)) return 'expanding';
    if(['constructive', 'normal', 'neutral', 'average', 'steady'].includes(safe)) return 'constructive';
    if(['weak', 'light', 'low', 'below_average'].includes(safe)) return 'weak';
    return safe || 'constructive';
  }

  function resolveSupportAuthority(ctx = {}){
    const rawPullbackState = String(ctx.pullback_zone || ctx.pullback_state || '').trim().toLowerCase();
    const setupLocationState = String(ctx.setup_location_state || '').trim().toLowerCase();
    const supportInteractionState = String(ctx.support_interaction_state || ctx.supportInteractionState || '').trim().toLowerCase();
    const bounceState = String(ctx.bounce_state || '').trim().toLowerCase();
    const stabilisationState = String(ctx.stabilisation_state || '').trim().toLowerCase();
    const structureState = String(ctx.structure_state || '').trim().toLowerCase();
    const volumeState = normalizeVolumeState(ctx.volume_state);
    const upClosesAfterLow = Number.isFinite(Number(ctx.candle_evidence_up_closes_after_low))
      ? Number(ctx.candle_evidence_up_closes_after_low)
      : 0;
    const signals = {
      strong_bullish_reversal:ctx.strong_bullish_reversal === true || ctx.strongBullishReversal === true,
      bullish_engulfing:ctx.bullish_engulfing === true || ctx.bullishEngulfing === true,
      hammer_rejection:ctx.hammer_rejection === true || ctx.hammerRejection === true || ctx.pin_bar_rejection === true || ctx.pinBarRejection === true,
      bullish_outside_day:ctx.bullish_outside_day === true || ctx.bullishOutsideDay === true,
      strong_green_close_near_high:ctx.strong_green_close_near_high === true || ctx.strongGreenCloseNearHigh === true,
      gap_up_continuation_from_support:ctx.gap_up_continuation_from_support === true || ctx.gapUpContinuationFromSupport === true,
      reclaimed_prior_day_high:flagTextIsTrue(ctx.candle_evidence_reclaimed_prior_day_high) || ctx.reclaimed_prior_day_high === true,
      reclaim_range_meaningful:flagTextIsTrue(ctx.candle_evidence_reclaim_range_meaningful) || ctx.reclaim_range_meaningful === true,
      downside_momentum_slowing:flagTextIsTrue(ctx.candle_evidence_downside_momentum_slowing) || ctx.downside_momentum_slowing === true,
      tighter_ranges:flagTextIsTrue(ctx.candle_evidence_tighter_ranges) || ctx.tighter_ranges === true,
      smaller_bodies:flagTextIsTrue(ctx.candle_evidence_smaller_bodies) || ctx.smaller_bodies === true,
      higher_low_hold:flagTextIsTrue(ctx.candle_evidence_higher_low_hold) || ctx.higher_low_hold === true || ctx.higher_low_respected === true || ctx.swing_low_respected === true,
      reclaims_level:ctx.reclaims_level === true || ctx.reclaimsLevel === true,
      reclaim_attempt:ctx.reclaim_attempt === true,
      positive_session:ctx.positive_session === true || ctx.positiveSession === true,
      expanding_volume:volumeState === 'expanding',
      constructive_volume:volumeState === 'constructive',
      weak_volume:volumeState === 'weak',
      up_closes_after_low:upClosesAfterLow >= 1,
      multiple_up_closes_after_low:upClosesAfterLow >= 2,
      reclaim_confirmed_independent:ctx.reclaim_confirmed_independent === true || ctx.reclaimConfirmedIndependent === true,
      entry_trigger_hit:ctx.entry_trigger_hit === true || ctx.entryTriggerHit === true || ctx.breaks_local_high === true || ctx.breaksLocalHigh === true,
      stabilising:['clear', 'present', 'early'].includes(stabilisationState),
      bounce_developing:['attempt', 'early', 'developing', 'improving', 'confirmed', 'rebound'].includes(bounceState)
    };
    const supportContext = (() => {
      if(
        supportInteractionState.includes('20ma')
        || ['near_20ma', 'at_20ma', 'left_20ma', 'recently_left_20ma'].includes(rawPullbackState)
        || ['near_20ma', 'at_20ma'].includes(setupLocationState)
      ) return '20ma_support';
      if(
        supportInteractionState.includes('50ma')
        || ['near_50ma', 'at_50ma', 'left_50ma', 'recently_left_50ma'].includes(rawPullbackState)
        || ['near_50ma', 'at_50ma'].includes(setupLocationState)
      ) return '50ma_support';
      if(
        supportInteractionState !== 'none'
        || ['supportive', 'support_band', 'pullback_zone', 'usable_pullback', 'between_20_50ma'].includes(setupLocationState)
        || ['reclaim', 'reclaim_zone', 'between_20_50', 'shallow'].includes(rawPullbackState)
      ) return 'other_support';
      return 'none';
    })();
    const supportContextRecognized = supportContext !== 'none';
    const explicitSupportFailure = !!(
      ctx.support_failed === true
      || ctx.supportTestState === 'failed'
      || ctx.support_test_state === 'failed'
      || ctx.structurally_broken === true
      || ['broken', 'failed', 'dead', 'invalid'].includes(structureState)
      || ctx.price_below_50ma === true
      || /support failed|failed support|lost[_\s-]?(20|50)ma|below support|structure is broken/i.test(String(ctx.main_blocker || ctx.reason || '').trim())
    );
    const supportHeldSignals = [
      signals.higher_low_hold,
      signals.reclaim_attempt,
      signals.reclaim_range_meaningful,
      signals.downside_momentum_slowing,
      signals.tighter_ranges,
      signals.smaller_bodies,
      signals.reclaims_level,
      signals.reclaim_confirmed_independent,
      signals.up_closes_after_low
    ].filter(Boolean);
    const supportHeld = supportContextRecognized && !explicitSupportFailure && (
      signals.higher_low_hold
      || signals.reclaims_level
      || signals.reclaim_confirmed_independent
      || signals.reclaim_range_meaningful
      || (signals.up_closes_after_low && (signals.downside_momentum_slowing || signals.tighter_ranges || signals.smaller_bodies))
      || (signals.reclaim_attempt && signals.stabilising)
    );
    const buyerEmerging = supportContextRecognized && !explicitSupportFailure && (
      supportHeld
      || signals.positive_session
      || signals.stabilising
      || signals.bounce_developing
      || signals.reclaim_attempt
      || signals.up_closes_after_low
      || signals.downside_momentum_slowing
      || signals.tighter_ranges
      || signals.smaller_bodies
    );
    const buyerConfirmed = supportHeld && (
      signals.strong_bullish_reversal
      || signals.bullish_engulfing
      || signals.hammer_rejection
      || signals.bullish_outside_day
      || signals.strong_green_close_near_high
      || signals.gap_up_continuation_from_support
      || signals.reclaim_confirmed_independent
      || signals.entry_trigger_hit
      || (signals.reclaims_level && (signals.higher_low_hold || signals.reclaim_range_meaningful || signals.reclaimed_prior_day_high))
      || (signals.reclaimed_prior_day_high && signals.reclaim_range_meaningful)
      || (signals.multiple_up_closes_after_low && (signals.higher_low_hold || signals.reclaimed_prior_day_high || signals.reclaim_range_meaningful))
      || (signals.positive_session && signals.higher_low_hold && !signals.weak_volume)
    );
    const supportTestState = explicitSupportFailure
      ? 'failed'
      : (!supportContextRecognized
        ? 'not_tested'
        : (supportHeld ? 'held' : 'testing'));
    const buyerControlState = buyerConfirmed
      ? 'confirmed'
      : (buyerEmerging ? 'emerging' : 'none');
    const meaningfulReversal = buyerControlState === 'confirmed';
    const signalList = Object.keys(signals).filter(key => signals[key] === true);
    return {
      supportContext,
      supportTestState,
      buyerControlState,
      supportHeld,
      meaningfulReversal,
      supportContextRecognized,
      signalCount:signalList.length,
      signals:signalList,
      volumeState,
      explicitSupportFailure,
      supportHeldSignalCount:supportHeldSignals.length
    };
  }

  function resolveTrendGate(ctx = {}){
    const structureState = String(ctx.structure_state || '').trim().toLowerCase();
    const structureHealthy = ['strong', 'intact', 'developing_clean'].includes(structureState);
    const structureDamaged = ['weakening', 'weak', 'broken', 'developing_loose'].includes(structureState);
    const marketSeverity = canonicalMarketSeverity(ctx);
    const canonicalPullback = resolveCanonicalPullbackContext(ctx);
    const explicitPullbackValid = typeof ctx.pullback_valid === 'boolean' ? ctx.pullback_valid : null;
    const checks = {
      structure_healthy:structureHealthy,
      structure_damaged:structureDamaged,
      price_above_50ma:ctx.price_above_50ma === true || ctx.price_below_50ma === false,
      price_above_200ma:ctx.price_above_200ma === true || ctx.price_below_200ma === false,
      ma50_above_200ma:ctx.ma50_above_200ma === true || ctx.ma50_below_200ma === false,
      pullback_valid:explicitPullbackValid === null
        ? canonicalPullback.canonicalPullbackValid
        : (explicitPullbackValid || canonicalPullback.canonicalPullbackValid),
      no_hard_invalidation:ctx.structurally_broken !== true && ctx.terminal_avoid_applied !== true && ctx.terminalAvoidFlag !== true,
      market_not_hostile:marketSeverity !== 'hostile',
      market_severity:marketSeverity
    };
    const reasons = [];
    if(!checks.structure_healthy) reasons.push('Structure is not healthy enough.');
    if(checks.structure_damaged) reasons.push('Support or structure is damaged.');
    if(!checks.price_above_50ma) reasons.push('Price must be above the 50MA.');
    if(!checks.price_above_200ma) reasons.push('Price must be above the 200MA.');
    if(!checks.ma50_above_200ma) reasons.push('50MA must be above the 200MA.');
    if(!checks.pullback_valid) reasons.push('Pullback context is invalid.');
    if(!checks.no_hard_invalidation) reasons.push('A hard invalidation is active.');
    if(!checks.market_not_hostile) reasons.push('Market conditions are too poor for this setup.');
    return {
      pass:reasons.length === 0,
      reasons,
      checks
    };
  }

  function resolveBuyerControlGate(ctx = {}){
    const supportAuthority = resolveSupportAuthority(ctx);
    const pass = supportAuthority.supportTestState === 'held' && supportAuthority.buyerControlState === 'confirmed';
    const reasons = [];
    if(supportAuthority.supportTestState === 'failed') reasons.push('The support test has failed.');
    else if(supportAuthority.supportTestState !== 'held') reasons.push('Support has not clearly held yet.');
    if(supportAuthority.buyerControlState === 'none') reasons.push('Buyers have not shown meaningful reversal evidence yet.');
    else if(supportAuthority.buyerControlState === 'emerging') reasons.push('Buyer control is improving but not confirmed yet.');
    return {
      pass,
      reasons,
      checks:{
        support_context:supportAuthority.supportContext,
        support_test_state:supportAuthority.supportTestState,
        buyer_control_state:supportAuthority.buyerControlState,
        support_held:supportAuthority.supportHeld,
        meaningful_reversal:supportAuthority.meaningfulReversal,
        signal_count:supportAuthority.signalCount,
        signals:supportAuthority.signals
      }
    };
  }

  function resolveConfirmationGate(ctx = {}){
    const marketSeverity = canonicalMarketSeverity(ctx);
    const volumeState = normalizeVolumeState(ctx.volume_state);
    const tradeability = String(ctx.tradeability || '').trim().toLowerCase();
    const planStatus = String(ctx.plan_status || '').trim().toLowerCase();
    const credibleRrValue = numericValueOrNull(ctx.credible_rr);
    const rrValue = numericValueOrNull(ctx.rr);
    const triggerBreak = ctx.entry_trigger_hit === true || ctx.breaks_local_high === true || ctx.breaksLocalHigh === true;
    const followThrough = ctx.follow_through_close_above_reversal === true || ctx.followThroughCloseAboveReversal === true || ctx.strong_bullish_continuation === true || ctx.strongBullishContinuation === true;
    const reclaim20 = ctx.reclaimed_20ma === true
      || ctx.reclaimed20ma === true
      || (
        (ctx.reclaims_level === true || ctx.reclaimsLevel === true)
        && ctx.price_above_20ma === true
      );
    const confirmationSignals = [
      triggerBreak ? 'trigger_break' : '',
      followThrough ? 'follow_through' : '',
      reclaim20 ? 'reclaim_20ma' : ''
    ].filter(Boolean);
    const checks = {
      confirmation_signal_present:confirmationSignals.length >= 1,
      trigger_break:triggerBreak,
      follow_through:followThrough,
      reclaim_20ma:reclaim20,
      market_ok:marketSeverity === 'supportive',
      volume_ok:volumeState !== 'weak',
      plan_visible:ctx.plan_visible === true,
      has_entry:ctx.has_entry === true,
      has_stop:ctx.has_stop === true,
      plan_ok:planStatus === 'valid' && ctx.plan_blocked !== true,
      risk_width_ok:ctx.stop_distance_too_wide !== true,
      rr_ok:credibleRrValue !== null ? credibleRrValue >= MIN_ENTRY_RR : (rrValue !== null && rrValue >= MIN_ENTRY_RR),
      tradeability_ok:['tradable', 'entry', 'ready', 'action_now', 'risk_only'].includes(tradeability),
      capital_ok:(() => {
        const capitalFit = String(ctx.capital_fit || '').trim().toLowerCase();
        if(!capitalFit || capitalFit === 'unknown') return true;
        return ['ideal', 'acceptable', 'fits_capital'].includes(capitalFit);
      })(),
      market_severity:marketSeverity,
      confirmation_signals:confirmationSignals
    };
    const reasons = [];
    if(!checks.confirmation_signal_present) reasons.push('A fresh confirmation signal is still missing.');
    if(!checks.market_ok) reasons.push('Market conditions are too weak for Entry.');
    if(!checks.volume_ok) reasons.push('Confirmation volume is too weak for Entry.');
    if(!checks.plan_visible) reasons.push('No actionable plan yet.');
    if(!checks.has_entry) reasons.push('Entry is missing from the plan.');
    if(!checks.has_stop) reasons.push('Stop is missing from the plan.');
    if(!checks.plan_ok) reasons.push('Plan must be valid and not blocked.');
    if(!checks.risk_width_ok) reasons.push('Stop distance is too wide to price risk cleanly.');
    if(!checks.rr_ok) reasons.push('RR or credible RR must be at least 2.0.');
    if(!checks.tradeability_ok) reasons.push('Tradeability must be ready for Entry.');
    if(!checks.capital_ok) reasons.push('Capital concentration is too high for entry readiness.');
    return {
      pass:reasons.length === 0,
      reasons,
      checks
    };
  }

  function resolveLatePullbackGate(ctx = {}){
    const setupLocationState = String(ctx.setup_location_state || '').trim().toLowerCase();
    const pullbackZone = String(ctx.pullback_zone || '').trim().toLowerCase();
    const currentPrice = numericValueOrNull(ctx.current_price);
    const ma20 = numericValueOrNull(ctx.ma20);
    const ma50 = numericValueOrNull(ctx.ma50);
    const dist20 = Number.isFinite(currentPrice) && Number.isFinite(ma20) && ma20 !== 0
      ? (currentPrice - ma20) / ma20
      : null;
    const dist50 = Number.isFinite(currentPrice) && Number.isFinite(ma50) && ma50 !== 0
      ? (currentPrice - ma50) / ma50
      : null;
    const checks = {
      late_from_support:
        ['extended', 'extended_from_support'].includes(setupLocationState)
        || pullbackZone === 'extended'
        || (Number.isFinite(dist20) && dist20 > 0.08)
        || (Number.isFinite(dist50) && dist50 > 0.12),
      setup_location_state:setupLocationState,
      pullback_zone:pullbackZone,
      distance_from_20ma:dist20,
      distance_from_50ma:dist50
    };
    const reasons = checks.late_from_support
      ? ['The bounce has already moved too far from support for a low-risk pullback entry.']
      : [];
    return {
      pass:checks.late_from_support !== true,
      reasons,
      checks
    };
  }

  function resolveBouncePriceability(ctx = {}){
    const reclaimSupportingEvidence = [];
    const reclaimDirectEvidence = [];
    const stabilisationState = String(ctx.stabilisation_state || '').trim().toLowerCase();
    if(ctx.reclaim_attempt === true) reclaimSupportingEvidence.push('reclaim_attempt');
    if(stabilisationState === 'clear') reclaimSupportingEvidence.push('stabilisation_clear');
    if(String(ctx.bounce_quality || '').trim().toLowerCase() === 'strong' || String(ctx.bounce_quality || '').trim().toLowerCase() === 'clear'){
      reclaimSupportingEvidence.push('bounce_quality_clear');
    }
    if(String(ctx.volume_state || '').trim().toLowerCase() === 'supportive' || String(ctx.volume_state || '').trim().toLowerCase() === 'strong'){
      reclaimSupportingEvidence.push('volume_confirmation');
    }
    if(ctx.reclaims_level === true) reclaimDirectEvidence.push('reclaims_level');
    if(ctx.reclaim_hold === true) reclaimDirectEvidence.push('reclaim_hold');
    if(ctx.held_reclaim === true) reclaimDirectEvidence.push('held_reclaim');
    if(ctx.entry_trigger_hit === true) reclaimDirectEvidence.push('entry_trigger_hit');
    const currentPriceVal = numericValueOrNull(ctx.current_price);
    const entryVal = numericValueOrNull(ctx.entry);
    const credibleRR = numericValueOrNull(ctx.credible_rr);
    const rrFallback = numericValueOrNull(ctx.rr);
    const resolvedRR = credibleRR !== null ? credibleRR : rrFallback;
    if(entryVal !== null && currentPriceVal !== null && currentPriceVal >= entryVal){
      reclaimDirectEvidence.push('price_holding_entry');
    }
    if(ctx.higher_low_respected === true || ctx.swing_low_respected === true){
      reclaimDirectEvidence.push('higher_low_respected');
    }
    const reclaimSignalCount = reclaimSupportingEvidence.length + reclaimDirectEvidence.length;
    const reclaimDirectSignalCount = reclaimDirectEvidence.length;
    const independentReclaimConfirmed = reclaimSignalCount >= 2 && reclaimDirectSignalCount >= 1;
    const reclaimConfirmedReason = independentReclaimConfirmed
      ? `Confirmed from ${reclaimSignalCount} signals (${reclaimDirectSignalCount} direct).`
      : `Need >=2 signals with >=1 direct; got ${reclaimSignalCount} total and ${reclaimDirectSignalCount} direct.`;
    const reclaimConfirmationEvidence = reclaimDirectEvidence.concat(reclaimSupportingEvidence);
    const helper = global.BouncePriceability && typeof global.BouncePriceability.isConfirmedBouncePriceable === 'function'
      ? global.BouncePriceability.isConfirmedBouncePriceable
      : null;
    if(helper){
      const result = helper({
        originalBounceState:ctx.bounce_state,
        structureState:ctx.structure_state,
        pullbackZone:ctx.pullback_zone,
        stabilisationState:ctx.stabilisation_state,
        trendState:ctx.trend_state,
        currentPrice:ctx.current_price,
        entry:ctx.entry,
        stop:ctx.stop,
        target:ctx.target,
        rr:resolvedRR,
        reclaimConfirmed:independentReclaimConfirmed,
        riskTooWide:ctx.stop_distance_too_wide === true
      });
      return {
        ...result,
        resolvedRR,
        rrKnown:resolvedRR !== null,
        reclaimConfirmed:independentReclaimConfirmed,
        reclaimConfirmationEvidence,
        reclaimSignalCount,
        reclaimDirectSignalCount,
        reclaimConfirmedReason
      };
    }
    const bounce = String(ctx.bounce_state || '').trim().toLowerCase() || 'none';
    return {
      originalBounceState:bounce,
      adjustedBounceState:bounce,
      bouncePriceabilityGuardApplied:false,
      bouncePriceabilityGuardReason:'',
      hasClearInvalidationLevel:ctx.has_stop === true,
      hasPriceablePlan:ctx.plan_status === 'valid',
      hasCredibleEntryTrigger:false,
      unpriceableBlockReason:'',
      resolvedRR,
      rrKnown:resolvedRR !== null,
      reclaimConfirmed:independentReclaimConfirmed,
      reclaimConfirmationEvidence,
      reclaimSignalCount,
      reclaimDirectSignalCount,
      reclaimConfirmedReason
    };
  }

  function nearEntryPullbackZoneOk(pullbackZone){
    const zone = String(pullbackZone || '').trim().toLowerCase();
    return [
      'near_20ma',
      'near_50ma',
      'at_20ma',
      'at_50ma',
      'reclaim',
      'reclaim_zone',
      'continuation',
      'continuation_zone',
      'left_20ma',
      'left_50ma',
      'recently_left_20ma',
      'recently_left_50ma'
    ].includes(zone);
  }

  function resolveCanonicalPullbackContext(ctx = {}){
    const rawPullbackState = String(ctx.pullback_zone || ctx.pullbackState || '').trim().toLowerCase();
    const bounceState = String(ctx.bounce_state || '').trim().toLowerCase();
    const stabilisationState = String(ctx.stabilisation_state || '').trim().toLowerCase();
    const setupLocationState = String(ctx.setup_location_state || '').trim().toLowerCase();
    const structureState = String(ctx.structure_state || '').trim().toLowerCase();
    const currentPrice = numericValueOrNull(ctx.current_price);
    const ma20 = numericValueOrNull(ctx.ma20);
    const ma50 = numericValueOrNull(ctx.ma50);
    const near20 = currentPrice !== null && ma20 !== null && ma20 !== 0
      ? currentPrice >= ma20 * 0.97 && currentPrice <= ma20 * 1.06
      : false;
    const near50 = currentPrice !== null && ma50 !== null && ma50 !== 0
      ? currentPrice >= ma50 * 0.985 && currentPrice <= ma50 * 1.07
      : false;
    const structureEligibility = String(ctx.structure_eligibility || ctx.structureEligibility || '').trim().toLowerCase();
    const supportInteractionHint = String(ctx.support_interaction_state || ctx.supportInteractionState || '').trim().toLowerCase();
    const explicitSupportInteraction = !!(supportInteractionHint && supportInteractionHint !== 'none');
    const supportAuthority = resolveSupportAuthority({
      ...ctx,
      support_context:ctx.support_context,
      support_test_state:ctx.support_test_state,
      buyer_control_state:ctx.buyer_control_state
    });
    const supportHeld = supportAuthority.supportHeld === true || ctx.support_held === true || ctx.supportHeld === true;
    const meaningfulReversal = supportAuthority.meaningfulReversal === true || ctx.meaningful_reversal === true || ctx.meaningfulReversal === true;
    const signalCount = Number(ctx.signal_count ?? ctx.signalCount ?? supportAuthority.signalCount ?? 0);
    const reclaimConfirmedIndependent = ctx.reclaim_confirmed_independent === true || ctx.reclaimConfirmedIndependent === true;
    const reclaimsLevel = ctx.reclaims_level === true || ctx.reclaimsLevel === true;
    const entryTriggerHit = ctx.entry_trigger_hit === true || ctx.entryTriggerHit === true;
    const recentlyLeftSupportZone = ctx.recently_left_valid_pullback_zone === true
      || ctx.recentlyLeftValidPullbackZone === true
      || ['left_20ma', 'left_50ma', 'recently_left_20ma', 'recently_left_50ma'].includes(rawPullbackState);
    const recognizedSupportSetupLocation = ['near_20ma','at_20ma','near_50ma','at_50ma','supportive','support_band','pullback_zone','usable_pullback'].includes(setupLocationState);
    const recognizedRawSupportHistory = ['near_20ma','at_20ma','near_50ma','at_50ma','left_20ma','left_50ma','recently_left_20ma','recently_left_50ma'].includes(rawPullbackState);
    const supportHeldAtRecognizedZone = supportHeld
      && (near20 || near50 || recognizedSupportSetupLocation || recognizedRawSupportHistory || explicitSupportInteraction || recentlyLeftSupportZone);
    const meaningfulReversalAtRecognizedZone = meaningfulReversal
      && (near20 || near50 || recognizedSupportSetupLocation || recognizedRawSupportHistory || explicitSupportInteraction || recentlyLeftSupportZone);
    const explicitBuyerResponsePresent = ctx.buyer_response_present === true || ctx.buyerResponsePresent === true;
    const buyerResponsePresent = explicitBuyerResponsePresent
      || ['attempt','early','developing','confirmed','improving','rebound'].includes(bounceState)
      || ['clear','present','early'].includes(stabilisationState)
      || meaningfulReversal
      || supportHeld
      || signalCount > 0
      || reclaimConfirmedIndependent
      || reclaimsLevel
      || entryTriggerHit;
    const aliveStructure = ['alive','messy'].includes(structureEligibility)
      || ['strong','intact','developing_clean','developing'].includes(structureState);
    const recentSupportInteraction = explicitSupportInteraction
      || recentlyLeftSupportZone
      || near20
      || near50
      || recognizedSupportSetupLocation
      || recognizedRawSupportHistory
      || supportHeldAtRecognizedZone
      || meaningfulReversalAtRecognizedZone;
    let canonicalPullbackState = rawPullbackState || 'none';
    let reconciliationReason = '';
    if((!rawPullbackState || ['none','unclear'].includes(rawPullbackState)) && buyerResponsePresent && aliveStructure && recentSupportInteraction){
      if(near20 || ['near_20ma','at_20ma'].includes(setupLocationState)){
        canonicalPullbackState = 'near_20ma';
        reconciliationReason = 'bounce_positive_near_20ma';
      }else if(near50 || ['near_50ma','at_50ma'].includes(setupLocationState)){
        canonicalPullbackState = 'near_50ma';
        reconciliationReason = 'bounce_positive_near_50ma';
      }else if(['supportive','support_band','pullback_zone','usable_pullback'].includes(setupLocationState)){
        canonicalPullbackState = 'shallow';
        reconciliationReason = 'bounce_positive_supportive_location';
      }else{
        canonicalPullbackState = 'shallow';
        reconciliationReason = 'bounce_positive_pullback_present';
      }
    }
    const supportInteractionState = explicitSupportInteraction
      ? supportInteractionHint
      : (near20 || ['near_20ma','at_20ma'].includes(canonicalPullbackState)
      ? 'active_20ma_support'
      : (near50 || ['near_50ma','at_50ma'].includes(canonicalPullbackState)
        ? 'active_50ma_support'
        : (recentlyLeftSupportZone
          ? 'recent_support_exit'
          : (recentSupportInteraction ? 'recent_pullback_support' : 'none'))));
    const currentLocationState = setupLocationState && !['none','unclear'].includes(setupLocationState)
      ? setupLocationState
      : (near20
        ? 'near_20ma'
        : (near50
          ? 'near_50ma'
          : (rawPullbackState || 'off_level')));
    const canonicalPullbackValid = nearEntryPullbackZoneOk(canonicalPullbackState);
    return {
      rawPullbackState:rawPullbackState || 'none',
      canonicalPullbackState:canonicalPullbackState || 'none',
      canonicalPullbackValid,
      supportContext:supportAuthority.supportContext,
      supportTestState:supportAuthority.supportTestState,
      buyerControlState:supportAuthority.buyerControlState,
      explicitBuyerResponsePresent,
      buyerResponsePresent,
      aliveStructure,
      recentSupportInteraction,
      reconciliationReason,
      supportInteractionState,
      currentLocationState,
      pullbackValiditySource:canonicalPullbackValid
        ? (reconciliationReason ? 'reconciled_recent_support_response' : 'raw_pullback_zone')
        : 'raw_pullback_invalid'
    };
  }

  function inferRecentlyLeftValidPullbackZone(ctx = {}){
    if(ctx.recently_left_valid_pullback_zone === true) return true;
    const zone = String(ctx.pullback_zone || '').trim().toLowerCase();
    if(['left_20ma', 'left_50ma', 'recently_left_20ma', 'recently_left_50ma'].includes(zone)) return true;

    const setupLocationState = String(ctx.setup_location_state || '').trim().toLowerCase();
    const structureState = String(ctx.structure_state || '').trim().toLowerCase();
    const stabilisationState = String(ctx.stabilisation_state || '').trim().toLowerCase();
    const currentPrice = numericValueOrNull(ctx.current_price);
    const ma20 = numericValueOrNull(ctx.ma20);
    const ma50 = numericValueOrNull(ctx.ma50);
    const hasPlan = ctx.has_entry === true && ctx.has_stop === true;
    const reclaimConfirmed = ctx.reclaim_confirmed_independent === true
      || ctx.reclaims_level === true
      || (ctx.entry_trigger_hit === true && ctx.reclaim_attempt === true)
      || (ctx.entry_trigger_hit === true && ['clear', 'present', 'early'].includes(stabilisationState));
    const above20 = ctx.price_above_20ma === true
      || (currentPrice !== null && ma20 !== null && currentPrice >= ma20);
    const above50 = ctx.price_above_50ma === true
      || (currentPrice !== null && ma50 !== null && currentPrice >= ma50);
    const notTooExtendedFrom20 = currentPrice !== null && ma20 !== null && ma20 !== 0
      ? ((currentPrice - ma20) / ma20) <= 0.08
      : true;

    return !!(
      ['none', 'off_level', ''].includes(zone)
      && ['off_level', 'extended', 'extended_from_support'].includes(setupLocationState)
      && ['strong', 'intact', 'developing_clean'].includes(structureState)
      && reclaimConfirmed
      && hasPlan
      && above20
      && above50
      && notTooExtendedFrom20
      && ctx.price_below_50ma !== true
      && ctx.price_below_200ma !== true
    );
  }

  function independentEntryTriggerHit(ctx = {}){
    const structureState = String(ctx.structure_state || '').trim().toLowerCase();
    const trendState = String(ctx.trend_state || '').trim().toLowerCase();
    const pullbackZone = String(resolveCanonicalPullbackContext(ctx).canonicalPullbackState || ctx.pullback_zone || '').trim().toLowerCase();
    const stabilisationState = String(ctx.stabilisation_state || '').trim().toLowerCase();
    const bounceState = String(ctx.bounce_state || '').trim().toLowerCase();
    const currentPrice = numericValueOrNull(ctx.current_price);
    const entry = numericValueOrNull(ctx.entry);
    const planStatus = String(ctx.plan_status || '').trim().toLowerCase();
    const pullbackValid = ['near_20ma','near_50ma'].includes(pullbackZone);
    const structureIntact = !['weak','weakening','broken'].includes(structureState);
    const trendValid = !['weak','broken'].includes(trendState);
    const confirmedBounce = bounceState === 'confirmed';
    const clearStabilisation = stabilisationState === 'clear';
    const hasReviewedPlan = planStatus === 'valid' && entry !== null;
    const breakAboveTrigger = hasReviewedPlan && currentPrice !== null && currentPrice >= entry;
    const strongReversal = pullbackValid && trendValid && structureIntact && confirmedBounce && clearStabilisation;
    const reclaim20ma = ctx.reclaimed_20ma === true
      || ctx.reclaimed20ma === true
      || ((ctx.reclaims_level === true || ctx.reclaimsLevel === true) && ctx.price_above_20ma === true);
    const reclaimFollowThrough = strongReversal && (
      breakAboveTrigger
      || ctx.breaks_local_high === true
      || ctx.breaksLocalHigh === true
      || ctx.strong_bullish_continuation === true
      || ctx.strongBullishContinuation === true
    );
    return !!(
      ctx.breaks_local_high === true
      || ctx.breaksLocalHigh === true
      || reclaim20ma
      || ctx.strong_bullish_continuation === true
      || ctx.strongBullishContinuation === true
      || breakAboveTrigger
      || reclaimFollowThrough
    );
  }

  function provisionalNumericValue(ctx, primaryKey, fallbackKey){
    const primary = numericValueOrNull(ctx[primaryKey]);
    if(primary !== null) return primary;
    return numericValueOrNull(ctx[fallbackKey]);
  }

  function nearEntryTerminalBlocked(ctx = {}){
    const lifecycleState = String(ctx.lifecycle_state || ctx.lifecycle || '').trim().toLowerCase();
    const terminalSource = String(ctx.terminal_avoid_source || ctx.avoid_trigger_source || ctx.dead_trigger_source || '').trim().toLowerCase();
    const structuralState = String(ctx.structural_state || ctx.structuralState || '').trim().toLowerCase();
    return !!(
      ctx.terminal_avoid_applied === true
      || ctx.terminalAvoidFlag === true
      || ctx.dead_lifecycle_state === true
      || ctx.structurally_broken === true
      || ['dead','avoid','terminal','expired','inactive'].includes(lifecycleState)
      || ['terminal','terminal_avoid','structure_broken','dead','avoid'].includes(terminalSource)
      || ['dead','broken','invalid','failed'].includes(structuralState)
    );
  }

  function resolveNearEntryProvisionalPlan(ctx = {}, bouncePriceability = {}){
    const structureState = String(ctx.structure_state || '').trim().toLowerCase();
    const trendState = String(ctx.trend_state || '').trim().toLowerCase();
    const bounceState = String(bouncePriceability.adjustedBounceState || ctx.bounce_state || '').trim().toLowerCase();
    const originalBounceState = String(bouncePriceability.originalBounceState || ctx.bounce_state || '').trim().toLowerCase() || 'none';
    const canonicalPullback = resolveCanonicalPullbackContext(ctx);
    const entry = provisionalNumericValue(ctx, 'entry', 'provisional_entry');
    const stop = provisionalNumericValue(ctx, 'stop', 'provisional_stop');
    const target = provisionalNumericValue(ctx, 'target', 'provisional_target');
    const rr = provisionalNumericValue(ctx, 'rr', 'provisional_rr');
    const recentlyLeftValidPullbackZone = inferRecentlyLeftValidPullbackZone({
      ...ctx,
      reclaim_confirmed_independent:bouncePriceability.reclaimConfirmed === true
    });
    const pullbackOk = nearEntryPullbackZoneOk(canonicalPullback.canonicalPullbackState) || recentlyLeftValidPullbackZone;
    const structureOk = ['strong', 'intact', 'developing_clean'].includes(structureState);
    const hardStructureBlocked = ['weakening', 'weak', 'broken', 'developing_loose'].includes(structureState) || trendState === 'broken';
    const hasClearInvalidationLevel = bouncePriceability.hasClearInvalidationLevel === true
      || (Number.isFinite(entry) && Number.isFinite(stop) && entry > stop);
    const hasProvisionalPriceablePlan = !!(
      Number.isFinite(entry)
      && Number.isFinite(stop)
      && Number.isFinite(target)
      && Number.isFinite(rr)
      && entry > stop
      && target > entry
      && rr >= MIN_NEAR_ENTRY_RR
    );
    const hasProvisionalPlanValues = !!(
      Number.isFinite(entry)
      && Number.isFinite(stop)
      && Number.isFinite(target)
      && Number.isFinite(rr)
      && entry > stop
      && target > entry
    );
    const hasContinuationEvidence = !!(
      bouncePriceability.reclaimSignalCount > 0
      || ctx.reclaim_attempt === true
      || ctx.reclaims_level === true
      || ctx.reclaim_hold === true
      || ctx.held_reclaim === true
      || ctx.higher_low_respected === true
      || ctx.swing_low_respected === true
      || ['clear','early','present'].includes(String(ctx.stabilisation_state || '').trim().toLowerCase())
    );
    const bounceAccepted = ['early', 'attempt'].includes(bounceState)
      || (['none', 'unconfirmed', 'improving'].includes(bounceState) && hasContinuationEvidence);
    const hardBlockReason = (() => {
      if(hardStructureBlocked) return 'Structure is weakening or broken.';
      if(ctx.price_below_200ma === true) return 'Price is below the 200MA.';
      if(ctx.ma50_below_200ma === true) return '50MA is below the 200MA.';
      if(!hasClearInvalidationLevel) return 'No valid invalidation level is available.';
      if(ctx.stop_distance_too_wide === true) return 'Stop distance is too wide to price risk cleanly.';
      if(['too_heavy','too_expensive'].includes(String(ctx.capital_fit || '').trim().toLowerCase())) return 'Capital fit is impossible at this risk level.';
      if(String(ctx.affordability || '').trim().toLowerCase() === 'not_affordable') return 'Capital fit is impossible at this risk level.';
      if(!hasProvisionalPriceablePlan) return hasProvisionalPlanValues
        ? 'RR or credible RR must be at least 1.5.'
        : 'Risk/reward cannot be calculated from the current plan.';
      if(!structureOk) return 'Structure is not strong/intact/developing clean.';
      if(!pullbackOk) return 'No low-risk entry is available yet.';
      if(!bounceAccepted) return 'Bounce is developing but not confirmed.';
      return '';
    })();
    const applied = !hardBlockReason && bounceState !== 'confirmed';
    const reason = applied
      ? `Provisional plan - waiting for confirmation. Bounce is developing but not confirmed. Evidence: ${[
        originalBounceState !== bounceState ? `adjusted from ${originalBounceState}` : '',
        hasContinuationEvidence ? 'continuation/reclaim evidence' : '',
        pullbackOk ? 'near or recently left a valid zone' : ''
      ].filter(Boolean).join(', ') || 'early bounce state'}.`
      : '';
    return {
      originalBounceState,
      adjustedBounceState:applied ? (['early','attempt'].includes(bounceState) ? bounceState : 'attempt') : bounceState,
      nearEntryProvisionalBounceApplied:applied,
      nearEntryProvisionalBounceReason:reason,
      hasClearInvalidationLevel,
      hasProvisionalPriceablePlan,
      provisionalPlanBlockReason:hardBlockReason,
      recentlyLeftValidPullbackZone,
      pullbackOk,
      bounceAccepted
    };
  }

  function canPromoteToEntry(ctx = {}){
    const bouncePriceability = resolveBouncePriceability(ctx);
    const trendGate = resolveTrendGate(ctx);
    const buyerControlGate = resolveBuyerControlGate(ctx);
    const confirmationGate = resolveConfirmationGate(ctx);
    const latePullbackGate = resolveLatePullbackGate(ctx);
    const checks = {
      ...trendGate.checks,
      ...buyerControlGate.checks,
      ...confirmationGate.checks,
      ...latePullbackGate.checks,
      has_clear_invalidation_level:bouncePriceability.hasClearInvalidationLevel === true,
      has_priceable_plan:bouncePriceability.hasPriceablePlan === true,
      unpriceable_block_reason:String(bouncePriceability.unpriceableBlockReason || '').trim(),
      reclaim_confirmed_independent:bouncePriceability.reclaimConfirmed === true,
      reclaim_confirmation_evidence:Array.isArray(bouncePriceability.reclaimConfirmationEvidence) ? bouncePriceability.reclaimConfirmationEvidence.slice() : [],
      reclaim_signal_count:Number.isFinite(Number(bouncePriceability.reclaimSignalCount)) ? Number(bouncePriceability.reclaimSignalCount) : 0,
      reclaim_direct_signal_count:Number.isFinite(Number(bouncePriceability.reclaimDirectSignalCount)) ? Number(bouncePriceability.reclaimDirectSignalCount) : 0,
      reclaim_confirmed_reason:String(bouncePriceability.reclaimConfirmedReason || '').trim(),
      resolved_rr:bouncePriceability.resolvedRR,
      rr_known:bouncePriceability.rrKnown === true,
      trend_gate_pass:trendGate.pass,
      buyer_control_gate_pass:buyerControlGate.pass,
      confirmation_gate_pass:confirmationGate.pass,
      late_pullback_gate_pass:latePullbackGate.pass
    };
    const reasons = [];
    if(!trendGate.pass) reasons.push(...trendGate.reasons);
    if(!buyerControlGate.pass) reasons.push(...buyerControlGate.reasons);
    if(!latePullbackGate.pass) reasons.push(...latePullbackGate.reasons);
    if(!confirmationGate.pass) reasons.push(...confirmationGate.reasons);
    if(bouncePriceability.unpriceableBlockReason && !reasons.includes(bouncePriceability.unpriceableBlockReason)){
      reasons.push(bouncePriceability.unpriceableBlockReason);
    }
    if(!checks.has_clear_invalidation_level) reasons.push('No valid invalidation level is available.');
    if(!checks.has_priceable_plan) reasons.push('Tradeability is not priceable yet.');
    const uniqueReasons = reasons.filter((reason, index) => reasons.indexOf(reason) === index);
    return {
      pass:uniqueReasons.length === 0,
      reasons:uniqueReasons,
      checks
    };
  }

  function canPromoteToNearEntry(ctx = {}){
    const bouncePriceability = resolveBouncePriceability(ctx);
    const provisionalPlan = resolveNearEntryProvisionalPlan(ctx, bouncePriceability);
    const trendGate = resolveTrendGate(ctx);
    const buyerControlGate = resolveBuyerControlGate(ctx);
    const latePullbackGate = resolveLatePullbackGate(ctx);
    const canonicalPullback = resolveCanonicalPullbackContext(ctx);
    const credibleRrValue = numericValueOrNull(ctx.credible_rr);
    const rrValue = numericValueOrNull(ctx.rr);
    const provisionalRrValue = numericValueOrNull(ctx.provisional_rr);
    const bounceState = String(provisionalPlan.adjustedBounceState || bouncePriceability.adjustedBounceState || ctx.bounce_state || '').trim().toLowerCase();
    const pullbackZone = String(canonicalPullback.canonicalPullbackState || ctx.pullback_zone || '').trim().toLowerCase();
    const tradeability = String(ctx.tradeability || '').trim().toLowerCase();
    const planStatus = String(ctx.plan_status || '').trim().toLowerCase();
    const planText = String(ctx.plan_status_text || '').trim().toLowerCase();
    const validTradeability = ['tradable', 'entry', 'ready', 'action_now', 'risk_only'].includes(tradeability);
    const hasProvisionalPlan = provisionalPlan.hasProvisionalPriceablePlan === true && !provisionalPlan.provisionalPlanBlockReason;
    const rrPriceable = credibleRrValue !== null
      ? credibleRrValue >= MIN_NEAR_ENTRY_RR
      : ((rrValue !== null && rrValue >= MIN_NEAR_ENTRY_RR) || (provisionalRrValue !== null && provisionalRrValue >= MIN_NEAR_ENTRY_RR));
    const supportAuthority = resolveSupportAuthority(ctx);
    const confirmedBounceOk = supportAuthority.supportTestState === 'held' && supportAuthority.buyerControlState === 'confirmed';
    const provisionalBounceOk = false;
    const recentlyLeftValidPullbackZone = provisionalPlan.recentlyLeftValidPullbackZone === true
      || inferRecentlyLeftValidPullbackZone({
        ...ctx,
        reclaim_confirmed_independent:bouncePriceability.reclaimConfirmed === true
      });
    const reclaimConfirmedAfterLeavingZone = recentlyLeftValidPullbackZone && bouncePriceability.reclaimConfirmed === true;
    const checks = {
      structure_ok:trendGate.checks.structure_healthy === true,
      structure_hard_blocked:trendGate.checks.structure_damaged === true,
      bounce_ok:confirmedBounceOk || provisionalBounceOk || reclaimConfirmedAfterLeavingZone,
      bounce_hard_blocked:!(confirmedBounceOk || provisionalBounceOk || reclaimConfirmedAfterLeavingZone),
      support_context:supportAuthority.supportContext,
      support_test_state:supportAuthority.supportTestState,
      buyer_control_state:supportAuthority.buyerControlState,
      pullback_ok:nearEntryPullbackZoneOk(pullbackZone) || recentlyLeftValidPullbackZone,
      pullback_valid:trendGate.checks.pullback_valid === true || provisionalPlan.pullbackOk === true || canonicalPullback.canonicalPullbackValid === true,
      near_entry_pullback_zone_accepted:nearEntryPullbackZoneOk(pullbackZone) || recentlyLeftValidPullbackZone || canonicalPullback.canonicalPullbackValid === true,
      raw_pullback_zone:canonicalPullback.rawPullbackState,
      canonical_pullback_state:canonicalPullback.canonicalPullbackState,
      reconciliation_reason:canonicalPullback.reconciliationReason,
      support_interaction_state:canonicalPullback.supportInteractionState,
      current_location_state:canonicalPullback.currentLocationState,
      pullback_validity_source:canonicalPullback.pullbackValiditySource,
      near_entry_terminal_block_applied:nearEntryTerminalBlocked(ctx),
      plan_visible:ctx.plan_visible === true || hasProvisionalPlan,
      has_entry:ctx.has_entry === true || numericValueOrNull(ctx.provisional_entry) !== null,
      has_stop:ctx.has_stop === true || numericValueOrNull(ctx.provisional_stop) !== null,
      plan_ok:planStatus === 'valid' || hasProvisionalPlan,
      weak_bounce_plan_text:planText.includes('bounce is not clear enough to price yet') && !hasProvisionalPlan,
      risk_width_ok:ctx.stop_distance_too_wide !== true,
      rr_priceable:rrPriceable,
      tradeability_ok:validTradeability || hasProvisionalPlan,
      below_50_without_reclaim:trendGate.checks.price_above_50ma !== true,
      below_200ma:trendGate.checks.price_above_200ma !== true,
      ma50_below_200ma:trendGate.checks.ma50_above_200ma !== true,
      volume_blocked:false,
      market_blocked:trendGate.checks.market_not_hostile !== true,
      capital_ok:(() => {
        const capitalFit = String(ctx.capital_fit || '').trim().toLowerCase();
        const affordability = String(ctx.affordability || '').trim().toLowerCase();
        return !['too_heavy','too_expensive'].includes(capitalFit) && affordability !== 'not_affordable';
      })(),
      has_clear_invalidation_level:provisionalPlan.hasClearInvalidationLevel === true,
      has_priceable_plan:bouncePriceability.hasPriceablePlan === true,
      has_provisional_priceable_plan:provisionalPlan.hasProvisionalPriceablePlan === true,
      near_entry_provisional_bounce_applied:provisionalPlan.nearEntryProvisionalBounceApplied === true,
      near_entry_provisional_bounce_reason:String(provisionalPlan.nearEntryProvisionalBounceReason || '').trim(),
      recently_left_valid_pullback_zone:recentlyLeftValidPullbackZone,
      reclaim_confirmed_after_leaving_zone:reclaimConfirmedAfterLeavingZone,
      original_bounce_state:provisionalPlan.originalBounceState,
      adjusted_bounce_state:provisionalPlan.adjustedBounceState,
      provisional_plan_block_reason:String(provisionalPlan.provisionalPlanBlockReason || '').trim(),
      unpriceable_block_reason:String(bouncePriceability.unpriceableBlockReason || '').trim(),
      reclaim_confirmed_independent:bouncePriceability.reclaimConfirmed === true,
      reclaim_confirmation_evidence:Array.isArray(bouncePriceability.reclaimConfirmationEvidence) ? bouncePriceability.reclaimConfirmationEvidence.slice() : [],
      reclaim_signal_count:Number.isFinite(Number(bouncePriceability.reclaimSignalCount)) ? Number(bouncePriceability.reclaimSignalCount) : 0,
      reclaim_direct_signal_count:Number.isFinite(Number(bouncePriceability.reclaimDirectSignalCount)) ? Number(bouncePriceability.reclaimDirectSignalCount) : 0,
      reclaim_confirmed_reason:String(bouncePriceability.reclaimConfirmedReason || '').trim(),
      resolved_rr:bouncePriceability.resolvedRR,
      rr_known:bouncePriceability.rrKnown === true,
      trend_gate_pass:trendGate.pass,
      buyer_control_gate_pass:buyerControlGate.pass,
      late_pullback_gate_pass:latePullbackGate.pass,
      buyer_control_signals:buyerControlGate.checks.signals || []
    };
    checks.unpriceable_block = !hasProvisionalPlan && (
      !validTradeability || !!bouncePriceability.unpriceableBlockReason
    );
    const reasons = [];
    if(checks.near_entry_terminal_block_applied) reasons.push('Terminal avoid/dead state blocks Near Entry.');
    if(!checks.structure_ok) reasons.push(...trendGate.reasons);
    if(checks.structure_hard_blocked) reasons.push('Structure is weakening or broken.');
    if(!checks.bounce_ok) reasons.push(...buyerControlGate.reasons);
    if(
      checks.bounce_hard_blocked
      && bouncePriceability.unpriceableBlockReason
      && !hasProvisionalPlan
      && !(provisionalPlan.hasClearInvalidationLevel && /invalidation level/i.test(bouncePriceability.unpriceableBlockReason))
    ) reasons.push(bouncePriceability.unpriceableBlockReason);
    if(!checks.pullback_ok) reasons.push('Pullback must be near a recognised support area.');
    if(!checks.pullback_valid) reasons.push('Pullback context is invalid.');
    if(!checks.plan_visible) reasons.push('No actionable plan yet.');
    if(!checks.has_entry) reasons.push('Entry is missing from the plan.');
    if(!checks.has_stop) reasons.push('Stop is missing from the plan.');
    if(!checks.has_clear_invalidation_level) reasons.push('No valid invalidation level is available.');
    if(!checks.plan_ok) reasons.push('Plan must be valid to qualify for Near Entry.');
    if(checks.weak_bounce_plan_text) reasons.push('Bounce is not clear enough to price yet.');
    if(!checks.risk_width_ok) reasons.push('Stop distance is too wide to price risk cleanly.');
    if(!checks.rr_priceable) reasons.push('RR or credible RR must be at least 1.5.');
    if(!checks.tradeability_ok) reasons.push('Tradeability is not priceable yet.');
    if(checks.below_50_without_reclaim) reasons.push('Price must be above the 50MA.');
    if(checks.below_200ma) reasons.push('Price is below the 200MA.');
    if(checks.ma50_below_200ma) reasons.push('50MA is below the 200MA.');
    // Market regime remains visible as a caution for Near Entry. It is an
    // Entry confirmation requirement, not a reason to hide an otherwise
    // priceable pullback that is still waiting for its trigger.
    if(!checks.capital_ok) reasons.push('Capital fit is impossible at this risk level.');
    // Near Entry is the monitored, priceable pullback phase. A late-location
    // caution can still block a full Entry, but must not erase a valid
    // recently-left-support pullback before its confirmation trigger arrives.
    const uniqueReasons = reasons.filter((reason, index) => reasons.indexOf(reason) === index);
    return {
      pass:uniqueReasons.length === 0,
      reasons:uniqueReasons,
      checks
    };
  }

  function applyPromotionGuards(resolved, ctx = {}){
    const current = resolved && typeof resolved === 'object' ? resolved : {};
    const entryGate = canPromoteToEntry(ctx);
    const nearEntryGate = canPromoteToNearEntry(ctx);
    const trendGate = resolveTrendGate(ctx);
    const buyerControlGate = resolveBuyerControlGate(ctx);
    const confirmationGate = resolveConfirmationGate(ctx);
    const latePullbackGate = resolveLatePullbackGate(ctx);
    const provisionalVerdict = normalizeGlobalVerdictKey(current.final_verdict);
    const terminalOutcome = provisionalVerdict === 'dead' || provisionalVerdict === 'avoid';
    let finalVerdict = provisionalVerdict;
    let reason = String(current.reason || '').trim();

    if(!terminalOutcome){
      if(provisionalVerdict === 'entry'){
        if(!entryGate.pass){
          if(nearEntryGate.pass){
            finalVerdict = 'near_entry';
            reason = entryGate.reasons[0] || reason || 'Entry gate failed; downgraded to near entry.';
          }else{
            finalVerdict = 'monitor';
            reason = entryGate.reasons[0] || nearEntryGate.reasons[0] || reason || 'Entry and near-entry gates failed; downgraded to monitor.';
          }
        }
      }else if(provisionalVerdict === 'near_entry'){
        if(!nearEntryGate.pass){
          finalVerdict = 'monitor';
          reason = nearEntryGate.reasons[0] || reason || 'Near-entry gate failed; downgraded to monitor.';
        }else if(entryGate.pass){
          finalVerdict = 'entry';
          reason = reason || 'Entry gate passed.';
        }
      }else if(entryGate.pass){
        finalVerdict = 'entry';
        reason = reason || 'Entry gate passed.';
      }else if(nearEntryGate.pass){
        finalVerdict = 'near_entry';
        reason = reason || 'Near-entry gate passed.';
      }
    }

    const softenedVerdict = finalVerdict === 'avoid' && String(ctx.structure_state || '').trim().toLowerCase() !== 'broken'
      ? 'monitor'
      : finalVerdict;
    const entryGateReasons = Array.isArray(entryGate.reasons) && entryGate.reasons.length
      ? entryGate.reasons
      : [entryGate.pass ? 'Entry gate passed.' : 'Entry gate failed.'];
    const nearEntryGateReasons = Array.isArray(nearEntryGate.reasons) && nearEntryGate.reasons.length
      ? nearEntryGate.reasons
      : [nearEntryGate.pass
        ? (
          nearEntryGate.checks && nearEntryGate.checks.near_entry_provisional_bounce_applied
            ? (nearEntryGate.checks.near_entry_provisional_bounce_reason || 'Provisional plan - waiting for confirmation. Bounce is developing but not confirmed.')
            : (nearEntryGate.checks && nearEntryGate.checks.near_entry_pullback_zone_accepted
              ? 'Recently-left pullback zone accepted for provisional Near Entry.'
            : 'Near Entry gate passed.')
        )
        : 'Near Entry gate failed.'];
    const canonicalPullback = resolveCanonicalPullbackContext(current);
    return {
      ...current,
      final_verdict:softenedVerdict,
      reason,
      raw_pullback_zone:canonicalPullback.rawPullbackState,
      canonical_pullback_state:canonicalPullback.canonicalPullbackState,
      canonicalPullbackState:canonicalPullback.canonicalPullbackState,
      reconciliation_reason:canonicalPullback.reconciliationReason,
      reconciliationReason:canonicalPullback.reconciliationReason,
      support_interaction_state:canonicalPullback.supportInteractionState,
      supportInteractionState:canonicalPullback.supportInteractionState,
      current_location_state:canonicalPullback.currentLocationState,
      currentLocationState:canonicalPullback.currentLocationState,
      pullback_validity_source:canonicalPullback.pullbackValiditySource,
      pullbackValiditySource:canonicalPullback.pullbackValiditySource,
      trend_gate_pass:trendGate.pass,
      trend_gate_reasons:Array.isArray(trendGate.reasons) && trendGate.reasons.length ? trendGate.reasons : [trendGate.pass ? 'Trend gate passed.' : 'Trend gate failed.'],
      trend_gate_checks:trendGate.checks || {},
      buyer_control_gate_pass:buyerControlGate.pass,
      buyer_control_gate_reasons:Array.isArray(buyerControlGate.reasons) && buyerControlGate.reasons.length ? buyerControlGate.reasons : [buyerControlGate.pass ? 'Buyer-control gate passed.' : 'Buyer-control gate failed.'],
      buyer_control_gate_checks:buyerControlGate.checks || {},
      confirmation_gate_pass:confirmationGate.pass,
      confirmation_gate_reasons:Array.isArray(confirmationGate.reasons) && confirmationGate.reasons.length ? confirmationGate.reasons : [confirmationGate.pass ? 'Confirmation gate passed.' : 'Confirmation gate failed.'],
      confirmation_gate_checks:confirmationGate.checks || {},
      late_pullback_gate_pass:latePullbackGate.pass,
      late_pullback_gate_reasons:Array.isArray(latePullbackGate.reasons) && latePullbackGate.reasons.length ? latePullbackGate.reasons : [latePullbackGate.pass ? 'Late-pullback gate passed.' : 'Late-pullback gate failed.'],
      late_pullback_gate_checks:latePullbackGate.checks || {},
      entry_gate_pass:entryGate.pass,
      entry_gate_reasons:entryGateReasons,
      entry_gate_checks:entryGate.checks,
      near_entry_gate_pass:nearEntryGate.pass,
      near_entry_gate_reasons:nearEntryGateReasons,
      near_entry_gate_checks:nearEntryGate.checks || {}
    };
  }

  function structureReasonLabel(structureState){
    const safe = String(structureState || '').trim().toLowerCase();
    if(safe === 'broken') return 'structure broken';
    if(safe === 'weakening') return 'trend weakening';
    if(safe === 'developing_loose') return 'messy pullback';
    if(safe === 'weak') return 'weak structure';
    if(safe === 'intact') return 'structure intact';
    if(safe === 'strong') return 'strong structure';
    return safe || 'structure unchanged';
  }

  function resolveStructureEligibility(ctx = {}){
    const structureState = String(ctx.structureState || '').trim().toLowerCase();
    const trendState = String(ctx.trendState || '').trim().toLowerCase();
    const bounceState = String(ctx.bounceState || '').trim().toLowerCase();
    const stabilisationState = String(ctx.stabilisationState || '').trim().toLowerCase();
    const pullbackZone = String(ctx.pullbackZone || '').trim().toLowerCase();
    const brokenBelowStop = ctx.brokenBelowStop === true;
    const brokenStates = ['broken','invalid','failed'];
    if(brokenBelowStop || brokenStates.includes(structureState) || brokenStates.includes(trendState)){
      return {
        structureEligibility:'broken',
        structureReason:'Structure is broken.'
      };
    }
    const constructiveRepairEvidence = ['attempt','early','confirmed'].includes(bounceState)
      || ['early','present','clear'].includes(stabilisationState)
      || ['near_20ma','near_50ma','recently_left_20ma','recently_left_50ma'].includes(pullbackZone);
    if(['weak','weakening'].includes(structureState) && constructiveRepairEvidence){
      return {
        structureEligibility:'messy',
        structureReason:'Structure is still alive, but messy and needs cleaner repair.'
      };
    }
    if(['weak','weakening','developing_loose'].includes(structureState)){
      return {
        structureEligibility:'damaged',
        structureReason:'Trend is weakening - no reliable stop level yet.'
      };
    }
    return {
      structureEligibility:'alive',
      structureReason:'Structure remains technically alive.'
    };
  }

  function resolveExtendedState(ctx = {}){
    const pullbackZone = String(ctx.pullbackZone || '').trim().toLowerCase();
    const noRecentPullbackStructure = ['','unknown','none','off_level','extended','deep'].includes(pullbackZone);
    const numericDistance = Number(ctx.priceDistanceFrom20MA);
    const threshold = Number.isFinite(Number(ctx.threshold)) && Number(ctx.threshold) > 0
      ? Number(ctx.threshold)
      : 0.06;
    const stretchedFrom20 = Number.isFinite(numericDistance) && numericDistance > threshold;
    return (pullbackZone === 'extended') || (stretchedFrom20 && noRecentPullbackStructure);
  }

  function resolveNonTerminalSetupBlocker(ctx = {}){
    const structureState = String(ctx.structureState || '').trim().toLowerCase();
    const trendState = String(ctx.trendState || '').trim().toLowerCase();
    const bounceState = String(ctx.bounceState || '').trim().toLowerCase();
    const stabilisationState = String(ctx.stabilisationState || '').trim().toLowerCase();
    const pullbackZone = String(ctx.pullbackZone || '').trim().toLowerCase();
    const setupLocationState = String(ctx.setupLocationState || '').trim().toLowerCase();
    const priceabilityState = String(ctx.priceabilityState || '').trim().toLowerCase();
    const hasRecoveryAttempt = ctx.reclaimAttempt === true
      || ctx.reclaimsLevel === true
      || ['attempt','early','confirmed'].includes(bounceState);
    const below200ma = ctx.below200ma === true;
    const ma50Below200ma = ctx.ma50Below200ma === true;
    const below50WithoutReclaim = ctx.below50WithoutReclaim === true;
    const hardInvalidation = ctx.hardInvalidation === true;
    const structurallyBrokenLabel = structureState === 'broken' || trendState === 'broken';
    const liveRecoveryEvidence = structurallyBrokenLabel
      && hasRecoveryAttempt
      && !below200ma
      && !ma50Below200ma
      && !below50WithoutReclaim
      && !hardInvalidation;
    if(!liveRecoveryEvidence){
      return {
        applies:false,
        blockerCode:'',
        reason:'',
        structureEligibility:'',
        structureReason:''
      };
    }
    if(priceabilityState === 'unpriceable' || setupLocationState === 'volatile'){
      return {
        applies:true,
        blockerCode:'volatile_not_stabilised',
        reason:'Avoid for now — setup is too volatile to price reliably.',
        structureEligibility:'alive',
        structureReason:'Recovery attempt in progress; structure is not terminally broken.'
      };
    }
    if(setupLocationState === 'extended' || pullbackZone === 'extended'){
      return {
        applies:true,
        blockerCode:'extended_not_priceable',
        reason:'Strong rebound, but price has not stabilised into a clean pullback yet.',
        structureEligibility:'alive',
        structureReason:'Recovery attempt in progress; structure is not terminally broken.'
      };
    }
    if(stabilisationState !== 'clear'){
      return {
        applies:true,
        blockerCode:'recovery_attempt_not_stabilised',
        reason:'Recovery attempt in progress. Wait for price to stabilise before considering entry.',
        structureEligibility:'alive',
        structureReason:'Recovery attempt in progress; structure is not terminally broken.'
      };
    }
    if(!['near_20ma','near_50ma','recently_left_20ma','recently_left_50ma'].includes(pullbackZone)){
      return {
        applies:true,
        blockerCode:'no_clean_pullback_base',
        reason:'No clean pullback base yet. Wait for price to stabilise before considering entry.',
        structureEligibility:'alive',
        structureReason:'Recovery attempt in progress; structure is not terminally broken.'
      };
    }
    return {
      applies:true,
      blockerCode:'recovery_attempt_not_stabilised',
      reason:'Recovery attempt in progress. Wait for price to stabilise before considering entry.',
      structureEligibility:'alive',
      structureReason:'Recovery attempt in progress; structure is not terminally broken.'
    };
  }

  const FALLING_KNIFE_COPY = 'Selling pressure is accelerating - wait for the stock to stabilise before reassessing.';

  function resolveFallingKnifeRisk(ctx = {}){
    const priceVs20 = numericValueOrNull(ctx.priceVs20);
    const priceVs50 = numericValueOrNull(ctx.priceVs50);
    const perf1w = numericValueOrNull(ctx.perf1w);
    const perf1m = numericValueOrNull(ctx.perf1m);
    const setupScore = numericValueOrNull(ctx.setupScore);
    const structureEligibility = String(ctx.structureEligibility || '').trim().toLowerCase();
    const structureState = String(ctx.structureState || '').trim().toLowerCase();
    const stabilisationState = String(ctx.stabilisationState || '').trim().toLowerCase();
    const priceabilityState = String(ctx.priceabilityState || '').trim().toLowerCase();
    const tradeability = String(ctx.tradeability || '').trim().toLowerCase();
    const reclaimSignals = Number.isFinite(Number(ctx.reclaimSignals)) ? Number(ctx.reclaimSignals) : 0;
    const below20 = ctx.priceBelow20ma === true;
    const below50 = ctx.priceBelow50ma === true || ctx.below50WithoutReclaim === true;
    const below50WithoutReclaim = ctx.below50WithoutReclaim === true;
    const materiallyBelow20 = priceVs20 !== null && priceVs20 <= -0.07;
    const materiallyBelow50 = priceVs50 !== null && priceVs50 <= -0.05;
    const severeWeeklyDrop = perf1w !== null && perf1w <= -6;
    const severeMonthlyDrop = perf1m !== null && perf1m <= -12 && (perf1w === null || perf1w <= -2);
    const largeBearishCandleDetected = ctx.largeBearishCandleDetected === true || severeWeeklyDrop;
    const recentDownsideExpansion = largeBearishCandleDetected || severeWeeklyDrop || severeMonthlyDrop || (materiallyBelow20 && materiallyBelow50);
    const noReclaim = below50WithoutReclaim && reclaimSignals === 0;
    const failedStabilisation = !stabilisationState || ['none','failed','unconfirmed','weak'].includes(stabilisationState);
    const noReliablePlan = ctx.planOk !== true
      && (
        ctx.hasClearInvalidationLevel !== true
        || ctx.tradeabilityOk !== true
        || ctx.rrOk !== true
        || priceabilityState === 'unpriceable'
        || ['not_ready','invalid','watch','risk_only'].includes(tradeability)
      );
    const weakQuality = (setupScore !== null && setupScore <= 3)
      || structureEligibility === 'damaged'
      || ['weak','weakening','developing_loose','failed'].includes(structureState);
    const detected = below20
      && below50
      && noReclaim
      && failedStabilisation
      && noReliablePlan
      && weakQuality
      && recentDownsideExpansion;
    return {
      detected,
      reason:detected
        ? 'accelerating selling below the MA cluster with no reclaim or priceable plan'
        : '',
      copyKey:detected ? 'falling_knife' : '',
      copy:detected ? FALLING_KNIFE_COPY : '',
      priceVs20,
      priceVs50,
      recentDownsideExpansion,
      largeBearishCandleDetected,
      reclaimSignals,
      stabilisationState,
      hasClearInvalidationLevel:ctx.hasClearInvalidationLevel === true,
      tradeability,
      setupScore
    };
  }

  function resolveWatchlistViability(ctx = {}){
    const structureEligibility = String(ctx.structureEligibility || '').toLowerCase();
    const structureState = String(ctx.structureState || '').toLowerCase();
    const bounceState = String(ctx.bounceState || '').toLowerCase();
    const setupLocationState = String(ctx.setupLocationState || '').toLowerCase();
    const priceabilityState = String(ctx.priceabilityState || '').toLowerCase();
    const priceabilityInferred = ctx.priceabilityInferred === true;
    const pullbackZone = String(ctx.pullbackZone || '').toLowerCase();
    const setupScore = Number.isFinite(Number(ctx.setupScore)) ? Number(ctx.setupScore) : 0;
    const planOk = ctx.planOk === true;
    const rrOk = ctx.rrOk === true;
    const tradeabilityOk = ctx.tradeabilityOk === true;
    const volumeOk = ctx.volumeOk !== false;
    const pullbackOk = ['near_20ma','near_50ma'].includes(pullbackZone);
    const noBounce = ['none','unconfirmed'].includes(bounceState);
    const bounceEarly = ['attempt','early'].includes(bounceState);
    const bounceUseful = bounceEarly || bounceState === 'confirmed';
    const isExtended = ctx.isExtended === true;
    const extendedLocation = isExtended || setupLocationState === 'extended';
    const planInvalidLabel = String(ctx.planStatusKey || '').toLowerCase() === 'invalid';
    const credibleRrValue = numericValueOrNull(ctx.credibleRr);
    const viableRrExists = rrOk || (credibleRrValue !== null && credibleRrValue >= 1.5);
    const hardTrendBroken = ctx.hardTrendBroken === true;
    const terminalAvoidFlag = ctx.terminalAvoidFlag === true;
    const explicitInvalidationReason = String(ctx.explicitInvalidationReason || '').trim().toLowerCase();
    const hasExplicitInvalidation = !!(explicitInvalidationReason && explicitInvalidationReason !== '(none)');
    const bounceKnown = !!(bounceState && !['n/a','na','unknown','none_available'].includes(bounceState));
    const structureKnown = !!(structureEligibility && !['n/a','na','unknown'].includes(structureEligibility));
    const setupScoreKnown = numericValueOrNull(ctx.setupScore) !== null;
    const pullbackKnown = !!(pullbackZone && !['n/a','na','unknown'].includes(pullbackZone));
    const planInputsKnown = !!(
      String(ctx.planStatusKey || '').trim()
      || ctx.planOk === true
      || ctx.hasEntry === true
      || ctx.hasStop === true
      || ctx.hasTarget === true
    );
    const inputCompleteness = {
      bounceState:bounceKnown,
      structure:structureKnown,
      setupScore:setupScoreKnown,
      pullbackContext:pullbackKnown,
      planInputs:planInputsKnown
    };
    const incompleteInputCount = Object.values(inputCompleteness).filter(flag => flag !== true).length;
    const incompleteInputs = incompleteInputCount > 0;
    const nonStructuralHardInvalidation = hardTrendBroken || terminalAvoidFlag || hasExplicitInvalidation;
    const hardInvalidation = structureEligibility === 'broken' || nonStructuralHardInvalidation;
    const structureMessy = structureEligibility === 'messy';
    const structureAliveLike = structureEligibility === 'alive' || structureMessy;
    const defaultLowPriorityBucket = structureEligibility === 'damaged' ? 'diminishing' : 'monitor';
    const aboveKeyTrendContext = ctx.below200ma !== true && ctx.ma50Below200ma !== true;
    const qualityFloorMet = setupScore >= 4;
    const damagedQualityFloorMet = setupScore >= 2;
    const below50LossStillRepairable = ctx.below50WithoutReclaim === true
      && aboveKeyTrendContext
      && setupLocationState === 'extended'
      && structureState === 'weak'
      && !hardTrendBroken
      && !terminalAvoidFlag
      && !hasExplicitInvalidation
      && planOk
      && viableRrExists
      && bounceState === 'none';
    const noConfirmedBreakdown = ctx.below50WithoutReclaim !== true || below50LossStillRepairable;
    const brokenExtendedRepairable = structureEligibility === 'broken'
      && !nonStructuralHardInvalidation
      && extendedLocation
      && aboveKeyTrendContext
      && noConfirmedBreakdown
      && setupLocationState === 'extended'
      && qualityFloorMet
      && !planInvalidLabel
      && planOk
      && viableRrExists
      && bounceState === 'none'
      && structureState === 'weak';
    const damagedExtendedRepairable = structureEligibility === 'damaged'
      && !nonStructuralHardInvalidation
      && extendedLocation
      && aboveKeyTrendContext
      && noConfirmedBreakdown
      && setupLocationState === 'extended'
      && damagedQualityFloorMet
      && !planInvalidLabel
      && planOk
      && viableRrExists
      && bounceState === 'none'
      && structureState === 'weak';
    const baseViabilityInputs = {
      structureEligibility,
      structureState,
      setupLocationState,
      priceabilityState,
      priceabilityInferred,
      priceabilityInferenceReason:String(ctx.priceabilityInferenceReason || '').trim(),
      bounceState,
      hasUsefulBounce:bounceUseful,
      planStateKey:String(ctx.planStatusKey || '').toLowerCase(),
      planValid:planOk,
      tradeabilityOk,
      rrOk,
      rrKnown:credibleRrValue !== null,
      resolvedRR:credibleRrValue,
      setupScore,
      pullbackZone,
      below50WithoutReclaim:ctx.below50WithoutReclaim === true,
      below200ma:ctx.below200ma === true,
      ma50Below200ma:ctx.ma50Below200ma === true,
      hardInvalidation,
      brokenExtendedRepairable,
      explicitInvalidationReason:explicitInvalidationReason || '',
      inputCompleteness,
      rejectBlockedByIncompleteInputs:false
    };
    const enrich = (result) => {
      const base = result && typeof result === 'object' ? result : {};
      const rejectBlockedByIncompleteInputs = base.viability === 'reject' && incompleteInputs && !hardInvalidation;
      const viabilityInputs = {
        ...baseViabilityInputs,
        rejectBlockedByIncompleteInputs
      };
      if(rejectBlockedByIncompleteInputs){
        return {
          viability:'low_priority',
          viabilityReason:'Inputs incomplete - refresh before final avoid.',
          mainBlocker:'Inputs incomplete - refresh before final avoid.',
          rejectReason:'',
          visualBucket:defaultLowPriorityBucket,
          inputCompleteness,
          rejectBlockedByIncompleteInputs:true,
          viabilityBranchId:'incomplete_inputs_softened_low_priority',
          viabilityBranchLabel:'Incomplete inputs softened to low priority',
          viabilityBranchReason:'Reject softened because inputs are incomplete and no hard invalidation is present.',
          viabilityInputs,
          originalViabilityBranchId:base.viabilityBranchId || ''
        };
      }
      return {
        ...base,
        visualBucket:base.viability === 'reject' ? 'avoid' : (base.visualBucket || defaultLowPriorityBucket),
        inputCompleteness,
        rejectBlockedByIncompleteInputs:false,
        viabilityInputs
      };
    };
    const withBranch = (result, branchId, branchLabel, branchReason) => ({
      ...result,
      viabilityBranchId:branchId,
      viabilityBranchLabel:branchLabel,
      viabilityBranchReason:branchReason || result.viabilityReason || result.mainBlocker || ''
    });
    const asReject = (viabilityReason, mainBlocker, rejectReason, branchId, branchLabel) => withBranch({
      viability:'reject',
      viabilityReason,
      mainBlocker,
      rejectReason:String(rejectReason || viabilityReason || mainBlocker || 'Rejected by viability gate.')
    }, branchId, branchLabel, viabilityReason);
    const asLowPriority = (viabilityReason, mainBlocker, branchId, branchLabel) => withBranch({
      viability:'low_priority',
      viabilityReason,
      mainBlocker,
      rejectReason:''
    }, branchId, branchLabel, viabilityReason);
    const asWatchlist = (viabilityReason, mainBlocker, branchId, branchLabel) => withBranch({
      viability:'watchlist',
      viabilityReason,
      mainBlocker,
      rejectReason:''
    }, branchId, branchLabel, viabilityReason);

    if(structureEligibility === 'broken' && brokenExtendedRepairable){
      return enrich(asLowPriority(
        'Extended pullback is weakening, but no confirmed breakdown is present yet.',
        'Trend is extended away from support - keep on monitor until price resets or repairs.',
        'broken_extended_without_hard_invalidation_low_priority',
        'Broken extended without hard invalidation low priority'
      ));
    }
    if(structureEligibility === 'damaged' && damagedExtendedRepairable){
      return enrich(asLowPriority(
        'Extended pullback is weakening, but no confirmed breakdown is present yet.',
        'Trend is extended away from support - keep on monitor until price resets or repairs.',
        'damaged_extended_without_hard_invalidation_low_priority',
        'Damaged extended without hard invalidation low priority'
      ));
    }
    if(structureEligibility === 'broken'){
      return enrich(asReject(
        'Setup no longer viable - structure is broken.',
        'Structure is broken.',
        'structure_broken',
        'broken_structure_reject',
        'Broken structure reject'
      ));
    }
    const fallingKnife = resolveFallingKnifeRisk(ctx);
    if(fallingKnife.detected){
      const fallingKnifeReject = asReject(
        FALLING_KNIFE_COPY,
        FALLING_KNIFE_COPY,
        'falling_knife',
        'falling_knife_reject',
        'Falling knife reject'
      );
      fallingKnifeReject.fallingKnife = fallingKnife;
      fallingKnifeReject.semanticBlockerCode = 'falling_knife';
      return enrich(fallingKnifeReject);
    }
    if(isExtended && structureAliveLike){
      return enrich(asLowPriority(
        'Trend is strong but extended beyond a safe entry zone.',
        'No low-risk entry is available yet.',
        'extended_alive_low_priority',
        'Extended alive low priority'
      ));
    }
    if(structureAliveLike && priceabilityState === 'unpriceable' && !priceabilityInferred){
      return enrich(asLowPriority(
        'Strong trend, but too volatile to price reliably.',
        'Strong trend, but too volatile to price reliably.',
        'alive_unpriceable_low_priority',
        'Alive unpriceable low priority'
      ));
    }
    if(structureEligibility === 'damaged' && noBounce && !planOk && setupScore < 5){
      return enrich(asReject(
        'Setup no longer viable - structure is weakening.',
        'Trend is weakening - no reliable stop level yet.',
        'damaged_no_bounce_no_plan_low_score',
        'damaged_no_bounce_no_plan_low_score_reject',
        'Damaged, no bounce, no plan, low score reject'
      ));
    }
    if(structureEligibility === 'damaged' && !tradeabilityOk && !rrOk){
      if(bounceUseful || setupScore >= 5){
        return enrich(asLowPriority(
          'Weakening setup - wait for recovery.',
          'Trend is weakening - no reliable stop level yet.',
          'damaged_tradeability_rr_fail_softened_low_priority',
          'Damaged tradeability/RR failure softened to low priority'
        ));
      }
      return enrich(asReject(
        'No bounce and no valid plan.',
        'Trend is weakening - no reliable stop level yet.',
        'damaged_not_tradeable_no_rr_no_recovery',
        'damaged_tradeability_rr_fail_reject',
        'Damaged tradeability/RR failure reject'
      ));
    }
    if(setupScore < 5 && noBounce){
      return enrich(asReject(
        'Setup has slipped below watchlist quality.',
        'No bounce confirmation yet.',
        'low_score_no_bounce',
        'low_score_no_bounce_reject',
        'Low score with no bounce reject'
      ));
    }
    if(planInvalidLabel && !viableRrExists && !bounceUseful){
      if(structureMessy && !hardInvalidation){
        return enrich(asLowPriority(
          'Messy setup - monitor only if repair continues.',
          'Structure is still alive, but messy and needs cleaner repair.',
          'messy_invalid_plan_no_bounce_low_priority',
          'Messy invalid plan no bounce low priority'
        ));
      }
      if(structureAliveLike && !hardInvalidation){
        return enrich(asWatchlist(
          'Structurally alive - waiting for confirmation.',
          'No bounce confirmation yet.',
          'alive_invalid_plan_no_bounce_watchlist',
          'Alive invalid plan no bounce watchlist'
        ));
      }
      if(structureEligibility === 'damaged' && !hardInvalidation){
        return enrich(asLowPriority(
          'Weakening setup - monitor only if it improves.',
          'Trend is weakening - no reliable stop level yet.',
          'damaged_invalid_plan_no_bounce_low_priority',
          'Damaged invalid plan no bounce low priority'
        ));
      }
      return enrich(asReject(
        'No bounce and no valid plan.',
        'Invalid plan with no credible RR.',
        'invalid_plan_no_rr_no_bounce',
        'invalid_plan_no_rr_no_bounce_reject',
        'Invalid plan with no RR and no bounce reject'
      ));
    }

    if(structureMessy && bounceEarly){
      return enrich(asWatchlist(
        'Messy but repairable setup - waiting for confirmation.',
        'Repair is in progress, but the bounce is still early.',
        'messy_with_early_bounce_watchlist',
        'Messy structure with early bounce watchlist'
      ));
    }
    if(structureEligibility === 'damaged' && bounceEarly){
      return enrich(asLowPriority(
        'Weakening setup - monitor only if it improves.',
        'Trend is weakening - no reliable stop level yet.',
        'damaged_with_early_bounce_low_priority',
        'Damaged structure with early bounce low priority'
      ));
    }
    if(setupScore >= 5 && setupScore < 7 && (pullbackOk || bounceEarly || structureEligibility !== 'broken')){
      return enrich(asLowPriority(
        'Low-priority watch - needs structure repair.',
        structureEligibility === 'damaged'
          ? 'Trend is weakening - no reliable stop level yet.'
          : (noBounce ? 'No bounce confirmation yet.' : 'Conditions are not strong enough for active focus.'),
        'mid_score_context_low_priority',
        'Mid-score contextual low priority'
      ));
    }

    if(structureAliveLike && (pullbackOk || bounceEarly || setupScore >= 7)){
      return enrich(asWatchlist(
        structureMessy ? 'Messy but repairable setup - waiting for confirmation.' : 'Structurally alive - waiting for confirmation.',
        structureMessy
          ? 'Structure needs cleaner repair before promotion.'
          : (noBounce ? 'No bounce confirmation yet.' : 'Needs confirmation before promotion.'),
        structureMessy ? 'messy_watchlist' : 'alive_watchlist',
        structureMessy ? 'Messy watchlist' : 'Alive watchlist'
      ));
    }

    return enrich(asLowPriority(
      'Conditions are not strong enough for active focus.',
      structureEligibility === 'damaged'
        ? 'Trend is weakening - no reliable stop level yet.'
        : (noBounce ? 'No bounce confirmation yet.' : 'No pullback structure to define entry yet.'),
      'fallback_low_priority',
      'Fallback low priority'
    ));
  }

  function resolveGlobalVerdict(record, deps = {}){
    const item = record && typeof record === 'object' ? record : {};
    const normalisedEvidence = global.CanonicalResolverInput
      && typeof global.CanonicalResolverInput.normaliseDecisionEvidence === 'function'
      ? global.CanonicalResolverInput.normaliseDecisionEvidence(item, {surface:'resolver-core'})
      : {schemaVersion:'normalised-decision-evidence-v1', snapshotId:'unavailable', source:'resolver-core-fallback'};
    const resolutionContext = buildCanonicalResolutionContext(normalisedEvidence, {
      resolverSource:'resolver-core',
      policy:{minimumEntryRr:MIN_ENTRY_RR, minimumNearEntryRr:MIN_NEAR_ENTRY_RR}
    });
    const preLifecycleResolved = deps.resolvePreLifecycleStateContract(item);
    const preserveReviewCanonicalForSoftReadiness = deps.preserveReviewCanonicalForSoftReadiness === true;
    const preserveScanAuthorityCanonicalPath = deps.preserveScanAuthorityCanonicalPath === true
      || shouldPreserveScanAuthorityCanonicalPath(item);
    const isTracked = !!(
      item.in_watchlist
      || item.watchlist_entry_exists
      || (item.watchlist && item.watchlist.inWatchlist)
    );
    const resolved = selectedAuthorityContractForGlobalVerdict(item, {
      ...deps,
      preserveScanAuthorityCanonicalPath
    });
    const baseVerdict = deps.baseVerdictFromResolvedContract(preLifecycleResolved);
    const derivedStates = deps.analysisDerivedStatesFromRecord(item);
    const effectivePlan = typeof deps.effectivePlanForRecord === 'function'
      ? deps.effectivePlanForRecord(item, {allowScannerFallback:true})
      : {
        entry:item.plan && item.plan.entry,
        stop:item.plan && item.plan.stop,
        firstTarget:item.plan && item.plan.firstTarget
      };
    const rawDisplayedPlan = deps.deriveCurrentPlanState(
      effectivePlan && effectivePlan.entry,
      effectivePlan && effectivePlan.stop,
      effectivePlan && effectivePlan.firstTarget,
      item.marketData && item.marketData.currency
    );
    const displayedPlan = typeof deps.applySetupConfirmationPlanGate === 'function'
      ? deps.applySetupConfirmationPlanGate(item, rawDisplayedPlan, derivedStates)
      : rawDisplayedPlan;
    const canonicalSoftReadinessOverrideAllowed = !isTracked
      || preserveReviewCanonicalForSoftReadiness
      || preserveScanAuthorityCanonicalPath;
    const nonTrackedCanonicalContract = canonicalSoftReadinessOverrideAllowed && typeof deps.resolveFinalStateContract === 'function'
      ? deps.resolveFinalStateContract(item, {
        context:'global',
        derivedStates,
        displayedPlan
      })
      : null;
    const canonicalSetupScore = typeof deps.canonicalSetupScoreForRecord === 'function'
      ? numericValueOrNull(deps.canonicalSetupScoreForRecord(item))
      : null;
    const setupScore = canonicalSetupScore !== null
      ? canonicalSetupScore
      : deps.setupScoreForRecord(item);
    const structureState = String(derivedStates.structureState || '').toLowerCase();
    const trendState = String(derivedStates.trendState || '').toLowerCase();
    const bounceState = String(derivedStates.bounceState || '').toLowerCase();
    const stabilisationState = String(derivedStates.stabilisationState || '').toLowerCase();
    const marketSeverity = canonicalMarketSeverity({
      market_regime:(item.meta && item.meta.marketStatus) || deps.state.marketStatus || '',
      market_severity:(item.setup && item.setup.marketSeverity) || ''
    });
    const marketWeak = !!(
      item.setup && item.setup.marketCaution
      || ['weak', 'hostile'].includes(marketSeverity)
      || deps.isHostileMarketStatus((item.meta && item.meta.marketStatus) || deps.state.marketStatus)
    );
    const planStatusKey = String(resolved.planStatusKey || '').toLowerCase();
    const tradeabilityState = String(displayedPlan.tradeability || '').toLowerCase();
    const volumeState = String(derivedStates.volumeState || '').toLowerCase();
    const setupLocationState = String(derivedStates.setupLocationState || '').toLowerCase();
    let priceabilityState = String(derivedStates.priceabilityState || '').toLowerCase();
    let priceabilityInferred = false;
    const volumeRequired = item && item.setup && item.setup.volumeRequired === true;
    const pullbackZone = String(derivedStates.pullbackZone || '').toLowerCase();
    const currentPrice = numericValueOrNull(item && item.marketData && item.marketData.price);
    const sma20 = numericValueOrNull(item && item.marketData && item.marketData.sma20);
    const ma20 = sma20 !== null ? sma20 : numericValueOrNull(item && item.marketData && item.marketData.ma20);
    const priceDistanceFrom20MA = Number.isFinite(currentPrice) && Number.isFinite(ma20) && ma20 !== 0
      ? Math.abs((currentPrice - ma20) / ma20)
      : null;
    const rrValue = numericValueOrNull(displayedPlan && displayedPlan.rewardRisk && displayedPlan.rewardRisk.rrRatio);
    const rawRrValue = numericValueOrNull(rawDisplayedPlan && rawDisplayedPlan.rewardRisk && rawDisplayedPlan.rewardRisk.rrRatio);
    const planEntry = numericValueOrNull(displayedPlan && displayedPlan.entry);
    const planStop = numericValueOrNull(displayedPlan && displayedPlan.stop);
    const planTarget = numericValueOrNull(displayedPlan && displayedPlan.target);
    const rawPlanEntry = numericValueOrNull(rawDisplayedPlan && rawDisplayedPlan.entry);
    const rawPlanStop = numericValueOrNull(rawDisplayedPlan && rawDisplayedPlan.stop);
    const rawPlanTarget = numericValueOrNull(rawDisplayedPlan && rawDisplayedPlan.target);
    const hasEntry = Number.isFinite(planEntry);
    const hasStop = Number.isFinite(planStop);
    const hasTarget = Number.isFinite(planTarget);
    const planVisible = String(displayedPlan && displayedPlan.status || '').toLowerCase() === 'valid';
    const stopDistanceTooWide = String(displayedPlan && displayedPlan.riskFit && displayedPlan.riskFit.risk_status || '').toLowerCase() === 'too_wide';
    const pullbackValid = nearEntryPullbackZoneOk(pullbackZone);
    const planMathProvisionallyPriceable = planVisible
      && hasEntry
      && hasStop
      && hasTarget
      && planEntry > planStop
      && planTarget > planEntry
      && Number.isFinite(rrValue)
      && rrValue >= MIN_NEAR_ENTRY_RR
      && !stopDistanceTooWide
      && pullbackValid;
    let priceabilityInferenceReason = '';
    if(!priceabilityState){
      priceabilityInferred = true;
      if(planVisible && ['tradable', 'entry', 'ready', 'action_now'].includes(tradeabilityState)){
        priceabilityState = 'priceable';
        priceabilityInferenceReason = 'Inferred priceable from valid plan and gate-priceable tradeability.';
      }else if(planMathProvisionallyPriceable){
        priceabilityState = 'provisional';
        priceabilityInferenceReason = 'Inferred provisional from valid plan math while confirmation/tradeability remains pending.';
      }else{
        priceabilityState = 'unpriceable';
        priceabilityInferenceReason = 'Inferred unpriceable because valid priceable plan math is not available.';
      }
    }
    const planStatusText = String(resolved && resolved.blockerReason || '');
    const sma50 = numericValueOrNull(item && item.marketData && item.marketData.sma50);
    const ma50 = sma50 !== null ? sma50 : numericValueOrNull(item && item.marketData && item.marketData.ma50);
    const sma200 = numericValueOrNull(item && item.marketData && item.marketData.sma200);
    const ma200 = sma200 !== null ? sma200 : numericValueOrNull(item && item.marketData && item.marketData.ma200);
    const priceBelow50MA = Number.isFinite(currentPrice) && Number.isFinite(ma50)
      ? currentPrice < ma50
      : false;
    const priceBelow20MA = Number.isFinite(currentPrice) && Number.isFinite(ma20)
      ? currentPrice < ma20
      : false;
    const priceBelow200MA = Number.isFinite(currentPrice) && Number.isFinite(ma200)
      ? currentPrice < ma200
      : false;
    const ma50Below200MA = Number.isFinite(ma50) && Number.isFinite(ma200)
      ? ma50 < ma200
      : false;
    const entryTriggerHit = independentEntryTriggerHit({
      structure_state:structureState,
      trend_state:trendState,
      stabilisation_state:stabilisationState,
      bounce_state:bounceState,
      pullback_zone:pullbackZone,
      current_price:currentPrice,
      entry:planEntry,
      plan_status:planStatusKey,
      breaksLocalHigh:item && item.breaksLocalHigh === true,
      reclaimsLevel:item && item.reclaimsLevel === true,
      strongBullishContinuation:item && item.strongBullishContinuation === true
    });
    const stopPrice = numericValueOrNull(item && item.plan && item.plan.stop);
    const brokenBelowStop = Number.isFinite(currentPrice) && Number.isFinite(stopPrice) && currentPrice <= stopPrice;
    const planRealism = typeof deps.evaluatePlanRealism === 'function'
      ? deps.evaluatePlanRealism(item, {
        displayedPlan,
        derivedStates
      })
      : null;
    const credibleRrParsed = numericValueOrNull(planRealism && planRealism.credible_rr);
    const credibleRr = credibleRrParsed !== null ? credibleRrParsed : rrValue;
    const capitalFit = String(
      (displayedPlan && displayedPlan.capitalFit && displayedPlan.capitalFit.capital_fit)
      || (rawDisplayedPlan && rawDisplayedPlan.capitalFit && rawDisplayedPlan.capitalFit.capital_fit)
      || ''
    ).toLowerCase();
    const affordability = String((displayedPlan && displayedPlan.affordability) || (rawDisplayedPlan && rawDisplayedPlan.affordability) || '').toLowerCase();
    const semanticBlocker = resolveNonTerminalSetupBlocker({
      structureState,
      trendState,
      bounceState,
      stabilisationState,
      pullbackZone,
      setupLocationState,
      priceabilityState,
      reclaimAttempt:item && item.reclaimAttempt === true,
      reclaimsLevel:item && item.reclaimsLevel === true,
      below50WithoutReclaim:priceBelow50MA && !(item && (item.reclaimAttempt === true || item.reclaimsLevel === true)),
      below200ma:priceBelow200MA,
      ma50Below200ma:ma50Below200MA,
      hardInvalidation:brokenBelowStop || (item && item.terminal_avoid_applied === true)
    });
    const nonTerminalRecoveryBlocker = semanticBlocker.applies === true;
    const explicitInvalidationFlag = !!(item && item.plan && item.plan.invalidatedState);
    const explicitInvalidationReason = explicitInvalidationFlag && !nonTerminalRecoveryBlocker && (structureState === 'broken' || trendState === 'broken' || brokenBelowStop)
      ? (structureState === 'broken'
        ? 'Structure is broken.'
        : (trendState === 'broken'
          ? 'Trend is broken.'
          : 'Price breached stop structure.'))
      : '';
    const structurallyBroken = !!(
      !nonTerminalRecoveryBlocker
      && (
        structureState === 'broken'
        || trendState === 'broken'
        || brokenBelowStop
      )
    );
    const rawStructureLayer = resolveStructureEligibility({
      structureState,
      trendState,
      bounceState,
      stabilisationState,
      pullbackZone,
      brokenBelowStop
    });
    const structureLayer = nonTerminalRecoveryBlocker
      ? {
        structureEligibility:semanticBlocker.structureEligibility || 'alive',
        structureReason:semanticBlocker.structureReason || 'Recovery attempt in progress; structure is not terminally broken.'
      }
      : rawStructureLayer;
    const isExtended = resolveExtendedState({
      pullbackZone,
      priceDistanceFrom20MA
    });
    const weakStructure = ['weak','weakening','developing_loose'].includes(structureState);
    const tentativeBounce = ['none','unconfirmed','attempt','early'].includes(bounceState);
    const weakVolume = volumeState === 'weak';
    const invalidPlan = ['invalid','missing','needs_adjustment','unrealistic_rr','rebuild_required'].includes(planStatusKey)
      || tradeabilityState === 'invalid';
    const supportiveStructure = !weakStructure && ['intact','strong','developing'].includes(structureState || '');
    const legacyDecisionTrace = [];
    appendLegacyDecisionTrace(legacyDecisionTrace, {
      stepCode:'incoming_contract_verdict',
      inputVerdict:baseVerdict,
      outputVerdict:baseVerdict,
      blockerCode:semanticBlocker.blockerCode,
      blockerCategory:semanticBlocker.blockerCategory,
      reasonSource:'resolved_contract',
      evidenceId:resolutionContext.evidenceId
    });
    let finalVerdict = baseVerdict;
    let reason = 'Default live setup state.';

    if(finalVerdict === 'avoid' && !structurallyBroken){
      finalVerdict = 'monitor';
      reason = `${structureReasonLabel(structureState)}. Non-structural avoid downgraded to monitor.`;
    }

    if(structurallyBroken){
      finalVerdict = 'dead';
      reason = resolved.blockerReason || 'Structure is broken.';
    }else if(weakStructure && invalidPlan){
      finalVerdict = 'monitor';
      reason = `${structureReasonLabel(structureState)}. Setup stays on monitor while tradeability is unresolved.`;
    }else if(resolved.actionStateKey === 'ready_to_act' || resolved.structuralState === 'entry'){
      finalVerdict = 'entry';
      reason = resolved.blockerReason || 'Ready to act.';
    }else if(resolved.structuralState === 'near_entry' || resolved.tradeabilityVerdict === 'Near Entry'){
      finalVerdict = 'near_entry';
      reason = resolved.reasonSummary || 'Close to trigger.';
    }else if(setupScore >= 5 && supportiveStructure && !marketWeak && !weakVolume && !tentativeBounce){
      finalVerdict = 'watch';
      reason = 'Alive structure with improving confirmation.';
    }else if(setupScore >= 5 && supportiveStructure){
      finalVerdict = marketWeak || weakVolume || tentativeBounce ? 'monitor' : 'watch';
      reason = marketWeak ? 'Weak market caution.' : (weakVolume ? 'Weak volume caution.' : (tentativeBounce ? 'Bounce still tentative.' : 'Alive setup worth monitoring.'));
    }else if(setupScore >= 3 && !structurallyBroken){
      finalVerdict = 'monitor';
      reason = invalidPlan
        ? ((structureLayer.structureEligibility === 'alive' && ['strong','intact','developing_clean'].includes(structureState))
          ? 'Valid plan math exists, but confirmation is still pending.'
          : `${structureReasonLabel(structureState)}. Plan is not ready yet.`)
        : (marketWeak
          ? 'Weak market caution.'
          : (tentativeBounce
            ? 'Bounce still tentative.'
            : (weakVolume ? 'Weak volume caution.' : `${structureReasonLabel(structureState)}. Setup is still early.`)));
    }else if(resolved.actionStateKey === 'recalculate_plan' || resolved.actionStateKey === 'wait_for_confirmation' || resolved.structuralState === 'developing'){
      finalVerdict = 'monitor';
      reason = resolved.blockerReason || 'Bounce is not clear enough to price yet.';
    }else if(String(resolved.finalVerdict || '').toLowerCase() === 'avoid'){
      finalVerdict = 'monitor';
      reason = resolved.reasonSummary || resolved.blockerReason || `${structureReasonLabel(structureState)}. Alive setup downgraded to monitoring.`;
    }
    appendLegacyDecisionTrace(legacyDecisionTrace, {
      stepCode:'initial_contract_verdict_proposal',
      inputVerdict:baseVerdict,
      outputVerdict:finalVerdict,
      blockerCode:semanticBlocker.blockerCode,
      blockerCategory:semanticBlocker.blockerCategory,
      reasonSource:'initial_contract_selection',
      evidenceId:resolutionContext.evidenceId
    });

    const cumulativePenaltyTrace = typeof deps.buildCumulativePenaltyTrace === 'function'
      ? deps.buildCumulativePenaltyTrace(item, {
        derivedStates,
        displayedPlan,
        resolvedContract:resolved,
        displayStage:globalVerdictLabel(finalVerdict)
      })
      : [];
    const requestedBeforeGuards = normalizeVerdict(finalVerdict);
    let guardedVerdict = applyPromotionGuards({
      final_verdict:finalVerdict,
      reason
    }, {
      structure_state:structureState,
      stabilisation_state:String(derivedStates.stabilisationState || '').toLowerCase(),
      bounce_state:bounceState,
      pullback_zone:pullbackZone,
      setup_location_state:setupLocationState,
      market_regime:marketSeverity,
      market_severity:marketSeverity,
      volume_state:volumeState,
      volume_required:volumeRequired,
      plan_status:planStatusKey,
      plan_blocked:planStatusKey !== 'valid',
      plan_visible:planVisible,
      has_entry:hasEntry,
      has_stop:hasStop,
      has_target:hasTarget,
      stop_distance_too_wide:stopDistanceTooWide,
      pullback_valid:pullbackValid,
      price_below_50ma:priceBelow50MA,
      reclaim_attempt:item && item.reclaimAttempt === true,
      entry_trigger_hit:entryTriggerHit,
      plan_status_text:planStatusText,
      rr:rrValue,
      credible_rr:credibleRr,
      entry:planEntry,
      stop:planStop,
      target:planTarget,
      provisional_rr:rawRrValue,
      provisional_entry:rawPlanEntry,
      provisional_stop:rawPlanStop,
      provisional_target:rawPlanTarget,
      current_price:currentPrice,
      ma20,
      ma50,
      price_above_20ma:priceBelow20MA === false,
      price_above_50ma:priceBelow50MA === false,
      price_above_200ma:priceBelow200MA === false,
      ma50_above_200ma:ma50Below200MA === false,
      trend_state:trendState,
      reclaims_level:item && item.reclaimsLevel === true,
      strong_bullish_reversal:item && item.strongBullishReversal === true,
      bullish_engulfing:item && item.bullishEngulfing === true,
      hammer_rejection:item && item.hammerRejection === true,
      bullish_outside_day:item && item.bullishOutsideDay === true,
      strong_green_close_near_high:item && item.strongGreenCloseNearHigh === true,
      gap_up_continuation_from_support:item && item.gapUpContinuationFromSupport === true,
      candle_evidence_up_closes_after_low:derivedStates.candleEvidenceUpClosesAfterLow,
      candle_evidence_reclaimed_prior_day_high:derivedStates.candleEvidenceReclaimedPriorDayHigh,
      candle_evidence_downside_momentum_slowing:derivedStates.candleEvidenceDownsideMomentumSlowing,
      candle_evidence_tighter_ranges:derivedStates.candleEvidenceTighterRanges,
      candle_evidence_smaller_bodies:derivedStates.candleEvidenceSmallerBodies,
      candle_evidence_higher_low_hold:derivedStates.candleEvidenceHigherLowHold,
      candle_evidence_reclaim_range_meaningful:derivedStates.candleEvidenceReclaimRangeMeaningful,
      setup_score:setupScore,
      tradeability:tradeabilityState,
      capital_fit:capitalFit,
      affordability,
      price_below_200ma:priceBelow200MA,
      ma50_below_200ma:ma50Below200MA,
      terminal_avoid_applied:item && item.terminal_avoid_applied === true,
      terminalAvoidFlag:item && item.terminal_avoid_applied === true,
      lifecycle_state:(item && item.lifecycle && item.lifecycle.state) || (item && item.watchlist && item.watchlist.lifecycleState),
      terminal_avoid_source:(item && item.terminal_avoid_source) || (item && item.watchlist && item.watchlist.terminalAvoidSource),
      avoid_trigger_source:(item && item.avoid_trigger_source) || (item && item.watchlist && item.watchlist.avoidTriggerSource),
      dead_trigger_source:structurallyBroken ? 'structure_broken' : '',
      structural_state:structurallyBroken ? 'dead' : String(resolved.structuralState || ''),
      structurally_broken:structurallyBroken
    });
    appendLegacyDecisionTrace(legacyDecisionTrace, {
      stepCode:'promotion_guard_result',
      inputVerdict:requestedBeforeGuards,
      outputVerdict:guardedVerdict.final_verdict,
      blockerCode:semanticBlocker.blockerCode,
      blockerCategory:semanticBlocker.blockerCategory,
      reasonSource:'promotion_guards',
      evidenceId:resolutionContext.evidenceId
    });
    // A provisional bounce/plan may be narrated, but it is not a qualified
    // Near Entry prerequisite. Keep the gate and verdict hierarchy aligned.
    if(
      guardedVerdict.near_entry_gate_pass === true
      && (!guardedVerdict.near_entry_gate_checks || guardedVerdict.near_entry_gate_checks.has_priceable_plan !== true)
    ){
      const reasons = Array.isArray(guardedVerdict.near_entry_gate_reasons)
        ? guardedVerdict.near_entry_gate_reasons.slice()
        : [];
      if(!reasons.includes('Canonical Near Entry requires a priceable plan.')){
        reasons.unshift('Canonical Near Entry requires a priceable plan.');
      }
      guardedVerdict = {
        ...guardedVerdict,
        final_verdict:normalizeVerdict(guardedVerdict.final_verdict) === 'near_entry' ? 'watch' : guardedVerdict.final_verdict,
        near_entry_gate_pass:false,
        near_entry_gate_reasons:reasons,
        near_entry_gate_checks:{
          ...(guardedVerdict.near_entry_gate_checks || {}),
          canonical_priceable_plan_required:true,
          canonical_priceable_plan_pass:false
        }
      };
    }
    appendLegacyDecisionTrace(legacyDecisionTrace, {
      stepCode:'near_entry_priceability_enforcement',
      inputVerdict:legacyDecisionTrace[legacyDecisionTrace.length - 1].outputVerdict,
      outputVerdict:guardedVerdict.final_verdict,
      blockerCode:semanticBlocker.blockerCode,
      blockerCategory:semanticBlocker.blockerCategory,
      reasonSource:'canonical_near_entry_priceability',
      evidenceId:resolutionContext.evidenceId
    });
    const nearEntryGateChecks = guardedVerdict.near_entry_gate_checks || {};
    const entryGateChecks = guardedVerdict.entry_gate_checks || {};
    const trendGateChecks = guardedVerdict.trend_gate_checks || {};
    const buyerControlGateChecks = guardedVerdict.buyer_control_gate_checks || {};
    const confirmationGateChecks = guardedVerdict.confirmation_gate_checks || {};
    const latePullbackGateChecks = guardedVerdict.late_pullback_gate_checks || {};
    const supportAuthority = resolveSupportAuthority({
      ...(item && typeof item === 'object' ? item : {}),
      ...(guardedVerdict && typeof guardedVerdict === 'object' ? guardedVerdict : {}),
      current_price:currentPrice,
      ma20,
      ma50
    });
    const below50WithoutReclaim = priceBelow50MA && !(item && (item.reclaimAttempt === true || item.reclaimsLevel === true));
    const hasClearInvalidationLevel = nearEntryGateChecks.has_clear_invalidation_level === true
      || entryGateChecks.has_clear_invalidation_level === true;
    const reclaimSignalCount = Number.isFinite(Number(nearEntryGateChecks.reclaim_signal_count))
      ? Number(nearEntryGateChecks.reclaim_signal_count)
      : (Number.isFinite(Number(entryGateChecks.reclaim_signal_count)) ? Number(entryGateChecks.reclaim_signal_count) : 0);
    const reclaimDirectSignalCount = Number.isFinite(Number(nearEntryGateChecks.reclaim_direct_signal_count))
      ? Number(nearEntryGateChecks.reclaim_direct_signal_count)
      : (Number.isFinite(Number(entryGateChecks.reclaim_direct_signal_count)) ? Number(entryGateChecks.reclaim_direct_signal_count) : 0);
    // Scan authority protects an unchanged Watch from downstream plan/lifecycle
    // noise. It must release once the same record independently qualifies as a
    // priceable Near Entry; otherwise a passed promotion gate can never become
    // the canonical state.
    const scanAuthorityNearEntryRelease = !!(
      preserveScanAuthorityCanonicalPath
      && guardedVerdict.near_entry_gate_pass === true
      && guardedVerdict.entry_gate_pass !== true
      && priceabilityState === 'priceable'
      && String(displayedPlan && displayedPlan.status || '').trim().toLowerCase() === 'valid'
      && nearEntryGateChecks.has_priceable_plan === true
      && nearEntryGateChecks.near_entry_terminal_block_applied !== true
    );
    const applyTrackedLifecycleVerdict = isTracked && (
      !preserveScanAuthorityCanonicalPath
      || scanAuthorityNearEntryRelease
    );
    appendLegacyDecisionTrace(legacyDecisionTrace, {
      stepCode:'scan_authority_state_release',
      inputVerdict:guardedVerdict.final_verdict,
      outputVerdict:guardedVerdict.final_verdict,
      blockerCode:semanticBlocker.blockerCode,
      blockerCategory:semanticBlocker.blockerCategory,
      reasonSource:scanAuthorityNearEntryRelease ? 'scan_authority_near_entry_release' : (preserveScanAuthorityCanonicalPath ? 'scan_authority_preserved' : 'scan_authority_not_applicable'),
      evidenceId:resolutionContext.evidenceId
    });
    let trackedVerdict = normalizeVerdict(guardedVerdict.final_verdict);
    let trackedReason = guardedVerdict.reason || reason;
    const viability = resolveWatchlistViability({
      structureEligibility:structureLayer.structureEligibility,
      structureState,
      setupLocationState,
      priceabilityState,
      priceabilityInferred,
      priceabilityInferenceReason,
      bounceState,
      pullbackZone,
      setupScore,
      planOk:!invalidPlan,
      rrOk:Number.isFinite(credibleRr) && credibleRr >= 1.5,
      tradeabilityOk:['tradable', 'entry', 'ready', 'action_now'].includes(tradeabilityState),
      volumeOk:volumeState !== 'weak',
      planStatusKey,
      credibleRr,
      isExtended,
      hasEntry,
      hasStop,
      hasTarget,
      hardTrendBroken:!nonTerminalRecoveryBlocker && (
        trendState === 'broken'
        || (below50WithoutReclaim && weakStructure && (priceBelow200MA || ma50Below200MA))
      ),
      terminalAvoidFlag:item && item.terminal_avoid_applied === true,
      explicitInvalidationReason,
      below50WithoutReclaim,
      priceBelow20ma:priceBelow20MA,
      priceBelow50ma:priceBelow50MA,
      priceVs20:Number.isFinite(currentPrice) && Number.isFinite(ma20) && ma20 !== 0 ? (currentPrice - ma20) / ma20 : null,
      priceVs50:Number.isFinite(currentPrice) && Number.isFinite(ma50) && ma50 !== 0 ? (currentPrice - ma50) / ma50 : null,
      below200ma:priceBelow200MA,
      ma50Below200ma:ma50Below200MA,
      stabilisationState:String(derivedStates.stabilisationState || '').toLowerCase(),
      hasClearInvalidationLevel,
      tradeability:tradeabilityState,
      reclaimSignals:reclaimSignalCount,
      reclaimDirectSignals:reclaimDirectSignalCount,
      perf1w:item && item.marketData && item.marketData.perf1w,
      perf1m:item && item.marketData && item.marketData.perf1m
    });
    if(applyTrackedLifecycleVerdict && trackedVerdict !== 'entry' && trackedVerdict !== 'near_entry'){
      if(viability.viability === 'reject'){
        trackedVerdict = 'avoid';
      }else{
        trackedVerdict = 'monitor';
      }
      const constructiveAliveStructure = structureLayer.structureEligibility === 'alive'
        && ['strong', 'intact', 'developing_clean'].includes(structureState);
      const repairingButUnpriceable = constructiveAliveStructure
        && ['attempt', 'early', 'developing', 'improving'].includes(bounceState)
        && priceabilityState === 'unpriceable';
      const weakRewardPotential = constructiveAliveStructure
        && Number.isFinite(Number(entryGateChecks.resolved_rr))
        && Number(entryGateChecks.resolved_rr) < MIN_NEAR_ENTRY_RR;
      const alivePoorLocation = structureLayer.structureEligibility === 'alive'
        && ['none','off_level','unclear'].includes(setupLocationState)
        && (priceabilityState === 'unpriceable' || String(viability.viabilityBranchId || '').includes('low_score') || setupScore < 5 || invalidPlan);
      if(nonTerminalRecoveryBlocker){
        trackedReason = semanticBlocker.reason || 'Recovery attempt in progress. Wait for price to stabilise before considering entry.';
      }else if(String(viability.viabilityBranchId || '').toLowerCase().includes('falling_knife')){
        trackedReason = viability.mainBlocker || FALLING_KNIFE_COPY;
      }else if(String(viability.viabilityBranchId || '').toLowerCase().includes('extended_without_hard_invalidation')){
        trackedReason = viability.mainBlocker || viability.viabilityReason || trackedReason;
      }else if(structureLayer.structureEligibility === 'damaged'){
        trackedReason = 'Trend is weakening - no reliable stop level yet.';
      }else if(isExtended && ['strong','intact'].includes(structureState)){
        trackedReason = 'Trend is strong but extended beyond a safe entry zone. No low-risk entry is available yet.';
      }else if(repairingButUnpriceable){
        trackedReason = 'Repair is forming but the setup is not priceable yet.';
      }else if(alivePoorLocation){
        trackedReason = 'Strong trend, but no usable pullback setup yet. Wait for a cleaner reset near support.';
      }else if(structureLayer.structureEligibility === 'alive' && priceabilityState === 'unpriceable' && !priceabilityInferred){
        trackedReason = 'Strong trend, but too volatile to price reliably.';
      }else if(weakRewardPotential){
        trackedReason = 'Nearby resistance limits current reward potential.';
      }else if(
        trackedVerdict === 'near_entry'
        && structureLayer.structureEligibility === 'alive'
        && ['strong','intact','developing_clean'].includes(structureState)
      ){
        trackedReason = 'Valid plan math exists, but confirmation is still pending.';
      }else{
        trackedReason = viability.mainBlocker || viability.viabilityReason || trackedReason;
      }
    }
    appendLegacyDecisionTrace(legacyDecisionTrace, {
      stepCode:'lifecycle_viability_adjustment',
      inputVerdict:guardedVerdict.final_verdict,
      outputVerdict:trackedVerdict,
      blockerCode:viability.viability === 'reject' ? 'viability_reject' : semanticBlocker.blockerCode,
      blockerCategory:viability.viability === 'reject' ? 'lifecycle_viability' : semanticBlocker.blockerCategory,
      reasonSource:applyTrackedLifecycleVerdict ? 'lifecycle_viability' : 'lifecycle_not_applied',
      evidenceId:resolutionContext.evidenceId
    });
    const latePullbackActive = latePullbackGateChecks.late_from_support === true;
    // A late-location flag must not undo an already-qualified Near Entry.
    // The Near Entry gate has independently confirmed a priceable pullback
    // context (including the short window after price has left support).
    if(
      latePullbackActive
      && guardedVerdict.near_entry_gate_pass !== true
      && guardedVerdict.entry_gate_pass !== true
      && trackedVerdict !== 'avoid'
      && trackedVerdict !== 'dead'
    ){
      trackedVerdict = 'watch';
      trackedReason = (latePullbackGateChecks && Array.isArray(guardedVerdict.late_pullback_gate_reasons) && guardedVerdict.late_pullback_gate_reasons[0])
        || 'The bounce has already moved too far from support for a low-risk pullback entry.';
    }
    appendLegacyDecisionTrace(legacyDecisionTrace, {
      stepCode:'late_pullback_cap',
      inputVerdict:legacyDecisionTrace[legacyDecisionTrace.length - 1].outputVerdict,
      outputVerdict:trackedVerdict,
      blockerCode:latePullbackActive && guardedVerdict.near_entry_gate_pass !== true && guardedVerdict.entry_gate_pass !== true ? 'late_pullback' : semanticBlocker.blockerCode,
      blockerCategory:latePullbackActive && guardedVerdict.near_entry_gate_pass !== true && guardedVerdict.entry_gate_pass !== true ? 'setup_location' : semanticBlocker.blockerCategory,
      reasonSource:latePullbackActive ? 'late_pullback_gate' : 'late_pullback_not_active',
      evidenceId:resolutionContext.evidenceId
    });
    const trackedAvoidTriggerSource = (trackedVerdict === 'avoid' || trackedVerdict === 'dead')
      ? (structurallyBroken ? 'structure_broken' : (trackedVerdict !== baseVerdict ? 'lifecycle' : null))
      : null;
    const lifecycleDowngradeSuppressed = !applyTrackedLifecycleVerdict
      && (trackedVerdict === 'avoid' || trackedVerdict === 'dead')
      && trackedAvoidTriggerSource === 'lifecycle';
    const nonTrackedSoftenedReject = !applyTrackedLifecycleVerdict && trackedVerdict === 'avoid' && !structurallyBroken;
    finalVerdict = normalizeVerdict(applyTrackedLifecycleVerdict ? trackedVerdict : baseVerdict);
    if(applyTrackedLifecycleVerdict){
      reason = trackedReason;
    }else if(lifecycleDowngradeSuppressed){
      reason = 'Pre-watchlist lifecycle downgrade suppressed.';
    }else if(nonTrackedSoftenedReject){
      reason = guardedVerdict.reason || resolved.blockerReason || reason;
    }else{
      reason = trackedReason;
    }
    const avoidAllowedByStructureConsistencyGuard = structurallyBroken;
    if(!avoidAllowedByStructureConsistencyGuard && (finalVerdict === 'avoid' || finalVerdict === 'dead')){
      finalVerdict = 'monitor';
      reason = 'Setup is weak and not tradeable yet, but not structurally broken.';
    }
    appendLegacyDecisionTrace(legacyDecisionTrace, {
      stepCode:'structural_avoid_guard',
      inputVerdict:applyTrackedLifecycleVerdict ? trackedVerdict : baseVerdict,
      outputVerdict:finalVerdict,
      blockerCode:structurallyBroken ? 'structure_broken' : semanticBlocker.blockerCode,
      blockerCategory:structurallyBroken ? 'structure' : semanticBlocker.blockerCategory,
      reasonSource:avoidAllowedByStructureConsistencyGuard ? 'structural_terminal' : 'structural_avoid_guard',
      evidenceId:resolutionContext.evidenceId
    });
    const avoidTriggerSource = (finalVerdict === 'avoid' || finalVerdict === 'dead')
      ? (structurallyBroken ? 'structure_broken' : null)
      : null;
    const deadTriggerSource = (finalVerdict === 'avoid' || finalVerdict === 'dead')
      ? (structurallyBroken ? 'structure_broken' : null)
      : null;
    const lifecycleDropReason = trackedAvoidTriggerSource === 'lifecycle'
      ? trackedReason
      : '';

    const lifecycleMap = {
      entry:'active',
      near_entry:'active',
      watch:'watchlist',
      monitor:'watchlist',
      avoid:'drop',
      dead:'drop'
    };
    // Promotion contracts can propose an Entry/Near Entry state, but they are
    // never allowed to bypass the gates that establish eligibility. This keeps
    // the decision direction one-way: semantics -> gates -> eligibility -> verdict.
    const verdictBeforeEntryGateEnforcement = finalVerdict;
    if(normalizeVerdict(finalVerdict) === 'entry' && guardedVerdict.entry_gate_pass !== true){
      finalVerdict = guardedVerdict.near_entry_gate_pass === true ? 'near_entry' : 'watch';
      reason = (guardedVerdict.entry_gate_reasons && guardedVerdict.entry_gate_reasons[0])
        || (guardedVerdict.near_entry_gate_reasons && guardedVerdict.near_entry_gate_reasons[0])
        || 'Entry prerequisites are not satisfied.';
    }
    appendLegacyDecisionTrace(legacyDecisionTrace, {
      stepCode:'entry_gate_enforcement',
      inputVerdict:verdictBeforeEntryGateEnforcement,
      outputVerdict:finalVerdict,
      blockerCode:guardedVerdict.entry_gate_pass === true ? '' : 'entry_gate',
      blockerCategory:guardedVerdict.entry_gate_pass === true ? '' : 'entry_eligibility',
      reasonSource:'entry_gate',
      evidenceId:resolutionContext.evidenceId
    });
    const verdictBeforeNearEntryGateEnforcement = finalVerdict;
    if(normalizeVerdict(finalVerdict) === 'near_entry' && guardedVerdict.near_entry_gate_pass !== true){
      finalVerdict = 'watch';
      reason = (guardedVerdict.near_entry_gate_reasons && guardedVerdict.near_entry_gate_reasons[0])
        || 'Near Entry prerequisites are not satisfied.';
    }
    appendLegacyDecisionTrace(legacyDecisionTrace, {
      stepCode:'near_entry_gate_enforcement',
      inputVerdict:verdictBeforeNearEntryGateEnforcement,
      outputVerdict:finalVerdict,
      blockerCode:guardedVerdict.near_entry_gate_pass === true ? '' : 'near_entry_gate',
      blockerCategory:guardedVerdict.near_entry_gate_pass === true ? '' : 'near_entry_eligibility',
      reasonSource:'near_entry_gate',
      evidenceId:resolutionContext.evidenceId
    });
    const canonicalFinalVerdict = normalizeVerdict(finalVerdict);
    const tone = getTone(canonicalFinalVerdict);
    const badge = getBadge(canonicalFinalVerdict);
    const action = getActions(canonicalFinalVerdict);
    const viabilityBranchId = String(viability.viabilityBranchId || '').toLowerCase();
    const deteriorationLowPriority = viability.viability === 'low_priority'
      && (
        structureLayer.structureEligibility === 'damaged'
        || ['weak','weakening','broken','failed','developing_loose'].includes(structureState)
        || setupLocationState === 'volatile'
        || viabilityBranchId.includes('damaged')
        || viabilityBranchId.includes('low_score')
        || viabilityBranchId.includes('failed')
        || viabilityBranchId.includes('recovery')
      );
    const bucket = (canonicalFinalVerdict === 'watch' && (deteriorationLowPriority || latePullbackActive))
      ? 'lower_priority'
      : getBucket(canonicalFinalVerdict);
    const nonTrackedCanonicalDiagnostics = nonTrackedCanonicalContract
      && nonTrackedCanonicalContract.contractDiagnostics
      && typeof nonTrackedCanonicalContract.contractDiagnostics === 'object'
        ? nonTrackedCanonicalContract.contractDiagnostics
        : null;
    const resolvedContractDiagnostics = resolved
      && resolved.contractDiagnostics
      && typeof resolved.contractDiagnostics === 'object'
        ? resolved.contractDiagnostics
        : null;
    const nonTrackedCanonicalVerdict = normalizeVerdict(
      nonTrackedCanonicalContract && (
        nonTrackedCanonicalContract.canonical_final_verdict
        || (nonTrackedCanonicalDiagnostics && nonTrackedCanonicalDiagnostics.upstreamVerdict)
        || nonTrackedCanonicalContract.finalVerdict
        || nonTrackedCanonicalContract.final_verdict
      )
    );
    const nonTrackedCanonicalPriceabilityState = String(
      nonTrackedCanonicalDiagnostics && nonTrackedCanonicalDiagnostics.finalPriceabilityState
      || ''
    ).trim().toLowerCase();
    const nonTrackedCanonicalTradeability = String(displayedPlan && displayedPlan.tradeability || '').trim().toLowerCase();
    const nonTrackedCanonicalCapitalFit = String(
      displayedPlan && displayedPlan.capitalFit && displayedPlan.capitalFit.capital_fit
      || ''
    ).trim().toLowerCase();
    const nonTrackedCanonicalCapitalNote = String(
      displayedPlan && displayedPlan.capitalFit && displayedPlan.capitalFit.capital_note
      || ''
    ).trim();
    const nonTrackedCanonicalFxStatus = String(
      displayedPlan && displayedPlan.capitalFit && displayedPlan.capitalFit.fx_status
      || ''
    ).trim().toLowerCase();
    const nonTrackedCanonicalRiskOnlyFxEstimated = nonTrackedCanonicalTradeability === 'risk_only'
      && nonTrackedCanonicalCapitalFit === 'unknown'
      && (
        nonTrackedCanonicalFxStatus === 'estimated'
        || /fx estimated|conversion unavailable|fx unavailable|capital check: fx estimated/i.test(nonTrackedCanonicalCapitalNote)
      );
    const nonTrackedCanonicalAlignmentApplied = !!(
      canonicalSoftReadinessOverrideAllowed
      && preserveScanAuthorityCanonicalPath !== true
      && nonTrackedCanonicalDiagnostics
      && nonTrackedCanonicalDiagnostics.softReadinessOnlyDemotion === true
      && nonTrackedCanonicalDiagnostics.structuredBlockersPresent !== true
      && displayedPlan
      && String(displayedPlan.status || '').trim().toLowerCase() === 'valid'
      && (
        nonTrackedCanonicalTradeability === 'tradable'
        || nonTrackedCanonicalRiskOnlyFxEstimated
      )
      && ['entry','near_entry'].includes(nonTrackedCanonicalVerdict)
      && nonTrackedCanonicalPriceabilityState === 'priceable'
    );
    const selectedAuthoritySource = scanAuthorityNearEntryRelease
      ? 'scan_authority_near_entry_release'
      : selectedAuthorityContractSource(item, {
      preserveReviewCanonicalForSoftReadiness,
      preserveScanAuthorityCanonicalPath
    });
    const canonicalAuthoritySource = scanAuthorityNearEntryRelease
      ? 'scan_authority_near_entry_release'
      : canonicalVerdictAuthoritySource(item, {
      preserveReviewCanonicalForSoftReadiness,
      preserveScanAuthorityCanonicalPath,
      canonicalSoftReadinessAlignmentApplied:nonTrackedCanonicalAlignmentApplied
    });
    const canonicalReviewVerdict = nonTrackedCanonicalAlignmentApplied
      ? nonTrackedCanonicalVerdict
      : canonicalFinalVerdict;
    const canonicalReviewPriceabilityState = nonTrackedCanonicalAlignmentApplied
      ? nonTrackedCanonicalPriceabilityState
      : priceabilityState;
    const fallingKnifeTrace = viability.fallingKnife || resolveFallingKnifeRisk({
      structureEligibility:structureLayer.structureEligibility,
      structureState,
      priceabilityState,
      planOk:!invalidPlan,
      rrOk:Number.isFinite(credibleRr) && credibleRr >= 1.5,
      tradeabilityOk:['tradable', 'entry', 'ready', 'action_now'].includes(tradeabilityState),
      tradeability:tradeabilityState,
      setupScore,
      stabilisationState:String(derivedStates.stabilisationState || '').toLowerCase(),
      below50WithoutReclaim:priceBelow50MA && !(item && (item.reclaimAttempt === true || item.reclaimsLevel === true)),
      priceBelow20ma:priceBelow20MA,
      priceBelow50ma:priceBelow50MA,
      priceVs20:Number.isFinite(currentPrice) && Number.isFinite(ma20) && ma20 !== 0 ? (currentPrice - ma20) / ma20 : null,
      priceVs50:Number.isFinite(currentPrice) && Number.isFinite(ma50) && ma50 !== 0 ? (currentPrice - ma50) / ma50 : null,
      hasClearInvalidationLevel,
      reclaimSignals:reclaimSignalCount,
      perf1w:item && item.marketData && item.marketData.perf1w,
      perf1m:item && item.marketData && item.marketData.perf1m
    });
    const fallingKnifeApplied = String(viability.viabilityBranchId || '').toLowerCase().includes('falling_knife');
    if(fallingKnifeApplied || (item && item.debugFallingKnifeTrace === true)){
      logDiagnosticTrace('PP_DEBUG_FALLING_KNIFE', '[FALLING_KNIFE_TRACE]', {
        ticker:String(item.ticker || item.symbol || '').trim().toUpperCase(),
        detected:fallingKnifeApplied,
        reason:fallingKnifeTrace.reason || '',
        finalVerdict:canonicalFinalVerdict,
        visualBucket:canonicalFinalVerdict === 'avoid' ? 'avoid' : bucket,
        presentationBucket:canonicalFinalVerdict === 'avoid' ? 'avoid' : bucket,
        tone,
        priceVs20:fallingKnifeTrace.priceVs20,
        priceVs50:fallingKnifeTrace.priceVs50,
        recentDownsideExpansion:fallingKnifeTrace.recentDownsideExpansion === true,
        largeBearishCandleDetected:fallingKnifeTrace.largeBearishCandleDetected === true,
        reclaimSignals:fallingKnifeTrace.reclaimSignals,
        stabilisationState:fallingKnifeTrace.stabilisationState,
        hasClearInvalidationLevel:fallingKnifeTrace.hasClearInvalidationLevel === true,
        tradeability:fallingKnifeTrace.tradeability || tradeabilityState,
        setupScore:fallingKnifeTrace.setupScore,
        copyKey:fallingKnifeTrace.copyKey || ''
      }, {key:`falling-knife:${String(item.ticker || item.symbol || '').trim().toUpperCase()}`, minIntervalMs:1500});
    }
    const guardedForPresentation = normalizeVerdict(guardedVerdict.final_verdict);
    const promotionWasAttempted = requestedBeforeGuards === 'near_entry' || requestedBeforeGuards === 'entry';
    const guardBlockers = []
      .concat(Array.isArray(guardedVerdict.near_entry_gate_reasons) ? guardedVerdict.near_entry_gate_reasons : [])
      .concat(Array.isArray(guardedVerdict.entry_gate_reasons) ? guardedVerdict.entry_gate_reasons : [])
      .filter(Boolean);
    const presentationUpgradeBlocked = promotionWasAttempted
      && guardedForPresentation !== requestedBeforeGuards
      && guardBlockers.length > 0;
    const canonicalNextRequiredEvent = String(supportAuthority.supportTestState || '').toLowerCase() === 'failed'
      ? 'repair'
      : (guardedVerdict.entry_gate_pass === true
        ? 'execute_if_trigger_valid'
        : (guardedVerdict.confirmation_gate_pass === false
          ? 'confirmation'
          : (guardedVerdict.buyer_control_gate_pass === false ? 'buyer_control' : 'review_setup')));
    const canonicalNextAction = canonicalNextRequiredEvent === 'repair'
      ? 'Wait for the setup to repair before reviewing it again.'
      : (canonicalNextRequiredEvent === 'execute_if_trigger_valid'
        ? 'Execute only if the trigger remains valid.'
        : (canonicalNextRequiredEvent === 'buyer_control'
          ? 'Wait for buyers to prove control before considering an entry.'
          : (canonicalNextRequiredEvent === 'confirmation'
            ? 'Wait for stronger confirmation before considering an entry.'
            : 'Review setup inputs')));
    const canonicalDecisiveBlocker = canonicalFinalVerdict === 'entry'
      ? ''
      : (reason || trackedReason || viability.mainBlocker || '');
    appendLegacyDecisionTrace(legacyDecisionTrace, {
      stepCode:'final_decision',
      inputVerdict:legacyDecisionTrace[legacyDecisionTrace.length - 1].outputVerdict,
      outputVerdict:canonicalFinalVerdict,
      blockerCode:fallingKnifeApplied ? 'falling_knife' : (semanticBlocker.blockerCode || ''),
      blockerCategory:fallingKnifeApplied ? 'falling_knife' : ((resolved && resolved.primaryBlockerSource) || (structureLayer.structureEligibility === 'damaged' ? 'structure' : (isExtended ? 'setup_location' : (priceabilityState === 'unpriceable' && !priceabilityInferred ? 'priceability' : 'resolver')))),
      reasonSource:canonicalFinalVerdict === 'entry' ? 'qualified_entry' : 'final_decision_reason',
      evidenceId:resolutionContext.evidenceId
    });
    const immutableLegacyDecisionTrace = freezeResolutionValue(legacyDecisionTrace);
    const canonicalEvaluation = evaluateCanonicalSemanticsAndGates(resolutionContext, {
      semanticStates:{
        structure:{state:structureState, eligibility:structureLayer.structureEligibility},
        support:supportAuthority,
        pullback:resolveCanonicalPullbackContext({pullback_zone:pullbackZone, ...derivedStates}),
        buyerResponse:bounceState,
        buyerControl:guardedVerdict.buyer_control_gate_checks || {},
        followThrough:guardedVerdict.confirmation_gate_checks || {},
        market:{severity:marketSeverity, weak:marketWeak}, volume:{state:volumeState},
        plan:{priceability:priceabilityState, displayedPlan}
      },
      gates:{
        trend:{pass:guardedVerdict.trend_gate_pass === true, reasons:guardedVerdict.trend_gate_reasons || []},
        buyerControl:{pass:guardedVerdict.buyer_control_gate_pass === true, reasons:guardedVerdict.buyer_control_gate_reasons || []},
        confirmation:{pass:guardedVerdict.confirmation_gate_pass === true, reasons:guardedVerdict.confirmation_gate_reasons || []},
        nearEntry:{pass:guardedVerdict.near_entry_gate_pass === true, reasons:guardedVerdict.near_entry_gate_reasons || []},
        entry:{pass:guardedVerdict.entry_gate_pass === true, reasons:guardedVerdict.entry_gate_reasons || []}
      },
      eligibilityInputs:{hasEntry, hasStop, hasTarget, planVisible, tradeabilityState, capitalFit, affordability},
      promotionGuards:guardedVerdict,
      terminalBlockers:{structurallyBroken, nonTerminalRecoveryBlocker, explicitInvalidationReason},
      planEvaluation:{displayedPlan, rawDisplayedPlan, priceabilityState, priceabilityInferred, priceabilityInferenceReason},
      diagnostics:{viability, fallingKnifeApplied}
    });
    const rawResult = {
      base_verdict:normalizeVerdict(baseVerdict),
      tracked_verdict:trackedVerdict,
      final_verdict:canonicalFinalVerdict,
      tone,
      toneClass:`tone-${tone}`,
      borderClass:`tone-${tone}`,
      backgroundClass:`tone-${tone}`,
      badgeToneClass:`badge-tone-${tone}`,
      scoreClass:Number.isFinite(setupScore) ? deps.scannerScoreGradientClass(setupScore) : '',
      bucket,
      badge,
      action,
      lifecycle:lifecycleMap[canonicalFinalVerdict] || 'watchlist',
      allow_plan:action.planAllowed,
      allow_watchlist:action.watchlistAllowed,
      reason,
      subline:isExtended && ['strong','intact'].includes(structureState)
        ? 'Buyers in control, but price is stretched away from support'
        : '',
      final_state_reason:guardedVerdict.reason || reason || 'resolved from gate contract',
      contractDiagnostics:{
        ...(resolvedContractDiagnostics ? {...resolvedContractDiagnostics} : {}),
        authoritySelectionSource:selectedAuthoritySource,
        canonicalAuthoritySelectionSource:canonicalAuthoritySource
      },
      avoid_trigger_source:avoidTriggerSource,
      dead_trigger_source:deadTriggerSource,
      downgrade_applied:baseVerdict !== trackedVerdict,
      downgrade_reason:trackedReason,
      lifecycle_downgrade_suppressed:lifecycleDowngradeSuppressed,
      explicit_invalidation_reason:explicitInvalidationReason || '(none)',
      structure_to_label_mapping_source:'resolveGlobalVerdict(structure_state)',
      lifecycle_drop_reason:lifecycleDropReason || '(none)',
      avoid_allowed_by_structure_consistency_guard:avoidAllowedByStructureConsistencyGuard,
      entry_gate_pass:canonicalEvaluation.gates.entry.pass,
      entry_gate_reasons:canonicalEvaluation.gates.entry.reasons,
      near_entry_gate_pass:canonicalEvaluation.gates.nearEntry.pass,
      near_entry_gate_reasons:canonicalEvaluation.gates.nearEntry.reasons,
      trend_gate_pass:canonicalEvaluation.gates.trend.pass,
      trend_gate_reasons:canonicalEvaluation.gates.trend.reasons,
      buyer_control_gate_pass:canonicalEvaluation.gates.buyerControl.pass,
      buyer_control_gate_reasons:canonicalEvaluation.gates.buyerControl.reasons,
      confirmation_gate_pass:canonicalEvaluation.gates.confirmation.pass,
      confirmation_gate_reasons:canonicalEvaluation.gates.confirmation.reasons,
      late_pullback_gate_pass:guardedVerdict.late_pullback_gate_pass,
      late_pullback_gate_reasons:guardedVerdict.late_pullback_gate_reasons,
      entry_gate_checks:guardedVerdict.entry_gate_checks,
      near_entry_gate_checks:guardedVerdict.near_entry_gate_checks,
      trend_gate_checks:trendGateChecks,
      buyer_control_gate_checks:buyerControlGateChecks,
      confirmation_gate_checks:confirmationGateChecks,
      late_pullback_gate_checks:latePullbackGateChecks,
      promotionBlockedBy:(!guardedVerdict.near_entry_gate_pass || !guardedVerdict.entry_gate_pass)
        ? ((guardedVerdict.near_entry_gate_checks && (guardedVerdict.near_entry_gate_checks.bounce_hard_blocked || !guardedVerdict.near_entry_gate_checks.bounce_ok))
          ? 'bounce'
          : ((guardedVerdict.near_entry_gate_checks && !guardedVerdict.near_entry_gate_checks.plan_ok) ? 'plan' : 'gates'))
        : '',
      promotionBlockedReason:(guardedVerdict.near_entry_gate_reasons && guardedVerdict.near_entry_gate_reasons[0]) || '',
      finalVerdictBeforePresentation:normalizeVerdict(guardedVerdict.final_verdict),
      finalVerdictAfterPresentation:canonicalFinalVerdict,
      presentationDowngradeApplied:normalizeVerdict(guardedVerdict.final_verdict) !== canonicalFinalVerdict,
      presentationUpgradeBlocked,
      setup_score:Number.isFinite(setupScore) ? setupScore : null,
      priority_score_adjustment:isExtended ? -0.35 : 0,
      is_extended:isExtended,
      canonical_final_verdict:canonicalReviewVerdict,
      canonical_visual_bucket:latePullbackActive && canonicalReviewVerdict === 'watch'
        ? 'diminishing'
        : canonicalVisualBucketForVerdict(canonicalReviewVerdict),
      canonical_priceability_state:canonicalReviewPriceabilityState,
      selected_authority_contract_source:selectedAuthoritySource,
      scan_authority_near_entry_release:scanAuthorityNearEntryRelease,
      canonical_soft_readiness_alignment_applied:nonTrackedCanonicalAlignmentApplied,
      canonical_soft_readiness_alignment_source:canonicalAuthoritySource,
      setup_location_state:setupLocationState,
      market_severity:trendGateChecks.market_severity || marketSeverity,
      support_context:supportAuthority.supportContext,
      support_test_state:supportAuthority.supportTestState,
      buyer_control_state:supportAuthority.buyerControlState,
      confirmation_state:confirmationGateChecks.confirmation_signal_present === true
        ? 'confirmed'
        : 'pending',
      late_pullback_state:latePullbackActive ? 'late' : 'actionable',
      priceability_state:priceabilityState,
      priceability_inferred:priceabilityInferred,
      priceability_inference_reason:priceabilityInferenceReason,
      semantic_blocker_code:(fallingKnifeApplied ? 'falling_knife' : (semanticBlocker.blockerCode || '')),
      semantic_blocker_reason:(fallingKnifeApplied ? FALLING_KNIFE_COPY : (semanticBlocker.reason || '')),
      falling_knife_detected:fallingKnifeApplied,
      falling_knife_reason:fallingKnifeApplied ? (fallingKnifeTrace.reason || '') : '',
      falling_knife_trace:fallingKnifeApplied
        ? fallingKnifeTrace
        : {
          ...fallingKnifeTrace,
          detected:false,
          reason:'',
          copyKey:'',
          copy:''
        },
      non_terminal_recovery_blocker:nonTerminalRecoveryBlocker,
      structure_eligibility:structureLayer.structureEligibility,
      structure_reason:structureLayer.structureReason,
      viability:viability.viability,
      viability_reason:viability.viabilityReason,
      viabilityBranchId:viability.viabilityBranchId || '',
      viabilityBranchLabel:viability.viabilityBranchLabel || '',
      viabilityBranchReason:viability.viabilityBranchReason || '',
      viabilityInputs:viability.viabilityInputs || null,
      originalViabilityBranchId:viability.originalViabilityBranchId || '',
      reject_reason:viability.rejectReason || '',
      input_completeness:viability.inputCompleteness || null,
      reject_blocked_by_incomplete_inputs:viability.rejectBlockedByIncompleteInputs === true,
      viability_visual_bucket:viability.visualBucket || '',
      main_blocker:reason || trackedReason || viability.mainBlocker || '',
      canonicalDecisionProjection:{
        verdict:canonicalFinalVerdict,
        canonicalVerdict:canonicalFinalVerdict,
        decisiveBlocker:canonicalDecisiveBlocker,
        primaryReason:canonicalDecisiveBlocker,
        nextRequiredEvent:canonicalNextRequiredEvent,
        nextAction:canonicalNextAction
      },
      legacy_decision_trace:immutableLegacyDecisionTrace,
      primary_blocker_source:fallingKnifeApplied
        ? 'falling_knife'
        : ((resolved && resolved.primaryBlockerSource) || (structureLayer.structureEligibility === 'damaged' ? 'structure' : (isExtended ? 'setup_location' : (priceabilityState === 'unpriceable' && !priceabilityInferred ? 'priceability' : 'resolver')))),
      rejected_by_viability_gate:viability.viability === 'reject',
      low_priority_by_viability_gate:viability.viability === 'low_priority',
      structure_state:structureState || '',
      bounce_state:bounceState || '',
      raw_pullback_zone:pullbackZone || '',
      pullback_zone:(guardedVerdict.canonical_pullback_state || pullbackZone || ''),
      canonical_pullback_state:guardedVerdict.canonical_pullback_state || '',
      canonicalPullbackState:guardedVerdict.canonical_pullback_state || '',
      reconciliation_reason:guardedVerdict.reconciliation_reason || '',
      reconciliationReason:guardedVerdict.reconciliation_reason || '',
      support_interaction_state:guardedVerdict.support_interaction_state || '',
      supportInteractionState:guardedVerdict.support_interaction_state || '',
      current_location_state:guardedVerdict.current_location_state || '',
      currentLocationState:guardedVerdict.current_location_state || '',
      pullback_validity_source:guardedVerdict.pullback_validity_source || '',
      pullbackValiditySource:guardedVerdict.pullback_validity_source || '',
      volume_state:normalizeVolumeState(volumeState || ''),
      market_regime:marketSeverity,
      planPriceabilitySource:'resolver-core:effectivePlan+marketData',
      resolvedPlanEntry:planEntry,
      resolvedPlanStop:planStop,
      resolvedPlanTarget:planTarget,
      resolvedPlanCurrentPrice:currentPrice,
      resolverCoreEntry:planEntry,
      resolverCoreStop:planStop,
      resolverCoreTarget:planTarget,
      resolverCoreCurrentPrice:currentPrice,
      hasClearInvalidationLevel,
      hasPriceablePlan:!!(
        guardedVerdict.near_entry_gate_checks && guardedVerdict.near_entry_gate_checks.has_priceable_plan
      ),
      originalBounceState:(
        guardedVerdict.near_entry_gate_checks && guardedVerdict.near_entry_gate_checks.original_bounce_state
      ) || (
        guardedVerdict.entry_gate_checks && guardedVerdict.entry_gate_checks.original_bounce_state
      ) || bounceState || '',
      adjustedBounceState:(
        guardedVerdict.near_entry_gate_checks && guardedVerdict.near_entry_gate_checks.adjusted_bounce_state
      ) || (
        guardedVerdict.entry_gate_checks && guardedVerdict.entry_gate_checks.adjusted_bounce_state
      ) || bounceState || '',
      nearEntryProvisionalBounceApplied:!!(
        guardedVerdict.near_entry_gate_checks && guardedVerdict.near_entry_gate_checks.near_entry_provisional_bounce_applied
      ),
      nearEntryPullbackZoneAccepted:!!(
        guardedVerdict.near_entry_gate_checks && guardedVerdict.near_entry_gate_checks.near_entry_pullback_zone_accepted
      ),
      nearEntryTerminalBlockApplied:!!(
        guardedVerdict.near_entry_gate_checks && guardedVerdict.near_entry_gate_checks.near_entry_terminal_block_applied
      ),
      nearEntryProvisionalBounceReason:String(
        guardedVerdict.near_entry_gate_checks && guardedVerdict.near_entry_gate_checks.near_entry_provisional_bounce_reason || ''
      ).trim(),
      hasProvisionalPriceablePlan:!!(
        guardedVerdict.near_entry_gate_checks && guardedVerdict.near_entry_gate_checks.has_provisional_priceable_plan
      ),
      provisionalPlanBlockReason:String(
        guardedVerdict.near_entry_gate_checks && guardedVerdict.near_entry_gate_checks.provisional_plan_block_reason || ''
      ).trim(),
      unpriceableBlockReason:(
        (guardedVerdict.near_entry_gate_checks && guardedVerdict.near_entry_gate_checks.unpriceable_block_reason)
        || (guardedVerdict.entry_gate_checks && guardedVerdict.entry_gate_checks.unpriceable_block_reason)
        || ''
      ),
      reclaimSignalCount,
      reclaimDirectSignalCount,
      reclaimConfirmedReason:String(
        (guardedVerdict.near_entry_gate_checks && guardedVerdict.near_entry_gate_checks.reclaim_confirmed_reason)
        || (guardedVerdict.entry_gate_checks && guardedVerdict.entry_gate_checks.reclaim_confirmed_reason)
        || ''
      ).trim(),
      resolvedRR:(
        guardedVerdict.near_entry_gate_checks && guardedVerdict.near_entry_gate_checks.rr_known
      )
        ? guardedVerdict.near_entry_gate_checks.resolved_rr
        : (
          guardedVerdict.entry_gate_checks && guardedVerdict.entry_gate_checks.rr_known
            ? guardedVerdict.entry_gate_checks.resolved_rr
            : null
        ),
      rrKnown:!!(
        (guardedVerdict.near_entry_gate_checks && guardedVerdict.near_entry_gate_checks.rr_known)
        || (guardedVerdict.entry_gate_checks && guardedVerdict.entry_gate_checks.rr_known)
      ),
      cumulativePenaltyTrace,
      tracked:isTracked,
      source:'resolver',
      debugToneSource:({
        dead:'terminal_dead',
        avoid:'weak_or_non_tradeable',
        watch:'watch_state',
        monitor:'monitor_state',
        near_entry:'near_entry_state',
        entry:'ready_state'
      })[canonicalFinalVerdict] || 'watch_state',
      resolved
    };
    const normalizedEvidence = resolutionContext.evidence;
    if(global.CanonicalDecisionResult && typeof global.CanonicalDecisionResult.publishCanonicalDecision === 'function'){
      const publication = global.CanonicalDecisionResult.publishCanonicalDecision(rawResult, normalizedEvidence, {
        enforce:deps.enforceCanonicalNorm === true
      });
      if(publication.publicationStatus === 'validation_failed' && typeof console !== 'undefined' && console.error){
        console.error('[CANONICAL_NORM_VALIDATION_FAILED]', JSON.stringify({
          ticker:String(item.ticker || item.symbol || '').trim().toUpperCase(),
          normVersion:publication.validation && publication.validation.normVersion,
          violations:publication.validation && publication.validation.violations,
          resolverSource:'resolver-core'
        }));
      }
      return global.CanonicalDecisionResult.compatibilityProjection(rawResult, publication);
    }
    return rawResult;
  }

  function runTradeReadinessGateAssertions(){
    const cases = [
      {
        id:'alive-invalid-plan-no-rr-no-bounce-watchlist',
        viability:{
          structureEligibility:'alive',
          structureState:'intact',
          bounceState:'none',
          pullbackZone:'near_50ma',
          setupScore:6,
          planOk:false,
          planStatusKey:'invalid',
          rrOk:false,
          credibleRr:null,
          tradeabilityOk:false,
          hasEntry:false,
          hasStop:false,
          hasTarget:false,
          hardTrendBroken:false,
          terminalAvoidFlag:false,
          explicitInvalidationReason:''
        },
        expect:{viability:'watchlist', branch:'alive_invalid_plan_no_bounce_watchlist'}
      },
      {
        id:'A',
        ctx:{structure_state:'intact', bounce_state:'attempt', plan_visible:false, has_entry:false, has_stop:false, plan_status:'needs_adjustment', plan_status_text:'Bounce is not clear enough to price yet.', pullback_zone:'near_20ma', tradeability:'watch'},
        expect:{near:false, entry:false}
      },
      {
        id:'B',
        ctx:{structure_state:'intact', bounce_state:'improving', plan_visible:true, has_entry:true, has_stop:true, has_target:false, stop_distance_too_wide:false, plan_status:'valid', pullback_zone:'near_20ma', tradeability:'tradable', entry_trigger_hit:false, rr:1.8},
        expect:{near:false, entry:false}
      },
      {
        id:'C',
        ctx:{
          structure_state:'intact',
          trend_state:'intact',
          stabilisation_state:'clear',
          bounce_state:'confirmed',
          plan_visible:true,
          has_entry:true,
          has_stop:true,
          has_target:true,
          plan_status:'valid',
          pullback_zone:'near_20ma',
          stop_distance_too_wide:false,
          entry:100,
          stop:97,
          target:106,
          current_price:101,
          ma50:95,
          ma200:90,
          rr:2.1,
          market_regime:'supportive',
          volume_state:'normal',
          tradeability:'entry',
          entry_trigger_hit:true,
          reclaim_attempt:true,
          reclaims_level:true,
          price_above_50ma:true,
          price_above_200ma:true,
          ma50_above_200ma:true
        },
        expect:{near:true, entry:true}
      },
      {
        id:'D',
        ctx:{structure_state:'weakening', bounce_state:'improving', plan_visible:true, has_entry:true, has_stop:true, plan_status:'valid', pullback_zone:'near_20ma', tradeability:'tradable'},
        expect:{near:false}
      },
      {
        id:'E',
        ctx:{
          structure_state:'developing_clean',
          trend_state:'intact',
          stabilisation_state:'early',
          bounce_state:'attempt',
          plan_visible:false,
          has_entry:false,
          has_stop:false,
          has_target:false,
          plan_status:'needs_adjustment',
          plan_status_text:'Bounce is not clear enough to price yet.',
          pullback_zone:'near_20ma',
          stop_distance_too_wide:false,
          provisional_entry:100,
          provisional_stop:97,
          provisional_target:106,
          provisional_rr:2,
          current_price:99.5,
          ma50:95,
          ma200:90,
          market_regime:'supportive',
          volume_state:'normal',
          tradeability:'watch',
          entry_trigger_hit:false,
          reclaim_attempt:true,
          price_above_50ma:true,
          price_above_200ma:true,
          ma50_above_200ma:true,
          candle_evidence_reclaim_range_meaningful:true,
          candle_evidence_reclaimed_prior_day_high:true,
          candle_evidence_higher_low_hold:true,
          capital_fit:'acceptable'
        },
        expect:{near:true, entry:false}
      },
      {
        id:'DINO-late-extension',
        ctx:{
          structure_state:'strong',
          trend_state:'intact',
          stabilisation_state:'early',
          bounce_state:'none',
          plan_visible:false,
          has_entry:true,
          has_stop:true,
          has_target:true,
          plan_status:'needs_adjustment',
          plan_status_text:'Bounce is not clear enough to price yet.',
          pullback_zone:'extended',
          pullback_valid:false,
          stop_distance_too_wide:false,
          provisional_entry:62.73,
          provisional_stop:56.58,
          provisional_target:81.19,
          provisional_rr:3.0,
          current_price:71.08,
          market_regime:'supportive',
          volume_state:'supportive',
          tradeability:'watch',
          entry_trigger_hit:false,
          reclaim_attempt:true,
          price_below_200ma:false,
          ma50_below_200ma:false,
          capital_fit:'acceptable'
        },
        expect:{near:false, entry:false}
      },
      {
        id:'DINO-developing-continuation',
        ctx:{
          structure_state:'developing_clean',
          trend_state:'intact',
          stabilisation_state:'early',
          bounce_state:'none',
          plan_visible:false,
          has_entry:true,
          has_stop:true,
          has_target:true,
          plan_status:'needs_adjustment',
          plan_status_text:'Bounce is not clear enough to price yet.',
          pullback_zone:'recently_left_20ma',
          stop_distance_too_wide:false,
          provisional_entry:62.73,
          provisional_stop:56.58,
          provisional_target:81.19,
          provisional_rr:3.0,
          current_price:63.2,
          ma50:60.8,
          ma200:55.4,
          market_regime:'supportive',
          volume_state:'supportive',
          tradeability:'watch',
          entry_trigger_hit:false,
          reclaim_attempt:true,
          price_above_50ma:true,
          price_above_200ma:true,
          ma50_above_200ma:true,
          candle_evidence_reclaim_range_meaningful:true,
          candle_evidence_reclaimed_prior_day_high:true,
          candle_evidence_higher_low_hold:true,
          capital_fit:'acceptable'
        },
        expect:{near:true, entry:false}
      },
      {
        id:'DINO-developing-continuation-terminal-block',
        ctx:{
          structure_state:'developing_clean',
          trend_state:'intact',
          stabilisation_state:'early',
          bounce_state:'none',
          plan_visible:false,
          has_entry:true,
          has_stop:true,
          has_target:true,
          plan_status:'needs_adjustment',
          plan_status_text:'Bounce is not clear enough to price yet.',
          pullback_zone:'recently_left_20ma',
          stop_distance_too_wide:false,
          provisional_entry:62.73,
          provisional_stop:56.58,
          provisional_target:81.19,
          provisional_rr:3.0,
          current_price:63.2,
          market_regime:'supportive',
          volume_state:'supportive',
          tradeability:'watch',
          entry_trigger_hit:false,
          reclaim_attempt:true,
          price_below_200ma:false,
          ma50_below_200ma:false,
          capital_fit:'acceptable',
          terminal_avoid_applied:true
        },
        expect:{near:false, entry:false}
      },
      {
        id:'UNP-reclaim-off-support-near-entry',
        ctx:{
          structure_state:'strong',
          trend_state:'intact',
          stabilisation_state:'none',
          bounce_state:'attempt',
          plan_visible:true,
          has_entry:true,
          has_stop:true,
          has_target:true,
          plan_status:'valid',
          pullback_zone:'none',
          setup_location_state:'off_level',
          pullback_valid:false,
          stop_distance_too_wide:false,
          entry:282.25,
          stop:264.38,
          target:340.31,
          current_price:282.25,
          ma20:267.66,
          ma50:267.05,
          rr:3.25,
          market_regime:'normal',
          volume_state:'weak',
          tradeability:'tradable',
          entry_trigger_hit:true,
          reclaim_attempt:true,
          reclaims_level:true,
          price_below_50ma:false,
          price_below_200ma:false,
          ma50_below_200ma:false,
          capital_fit:'acceptable'
        },
        expect:{near:true, entry:false}
      },
      {
        id:'price-above-20ma-alone-does-not-promote',
        ctx:{
          structure_state:'intact',
          trend_state:'intact',
          stabilisation_state:'none',
          bounce_state:'none',
          plan_visible:true,
          has_entry:true,
          has_stop:true,
          has_target:true,
          plan_status:'valid',
          pullback_zone:'near_20ma',
          stop_distance_too_wide:false,
          entry:100,
          stop:97,
          target:106,
          current_price:101,
          ma20:99,
          ma50:95,
          ma200:90,
          rr:2.1,
          market_regime:'supportive',
          volume_state:'supportive',
          tradeability:'tradable',
          price_above_20ma:true,
          price_above_50ma:true,
          price_above_200ma:true,
          ma50_above_200ma:true
        },
        expect:{near:false, entry:false}
      },
      {
        id:'weak-volume-allows-near-entry-but-blocks-entry',
        ctx:{
          structure_state:'strong',
          trend_state:'intact',
          stabilisation_state:'clear',
          bounce_state:'confirmed',
          plan_visible:true,
          has_entry:true,
          has_stop:true,
          has_target:true,
          plan_status:'valid',
          pullback_zone:'near_20ma',
          stop_distance_too_wide:false,
          entry:100,
          stop:97,
          target:106,
          current_price:101,
          ma20:99,
          ma50:95,
          ma200:90,
          rr:2.1,
          market_regime:'supportive',
          volume_state:'weak',
          tradeability:'tradable',
          price_above_20ma:true,
          price_above_50ma:true,
          price_above_200ma:true,
          ma50_above_200ma:true,
          strong_bullish_reversal:true,
          candle_evidence_higher_low_hold:true,
          strong_bullish_continuation:true
        },
        expect:{near:true, entry:false}
      },
      {
        id:'weak-market-allows-near-entry-but-blocks-entry',
        ctx:{
          structure_state:'strong',
          trend_state:'intact',
          stabilisation_state:'clear',
          bounce_state:'confirmed',
          plan_visible:true,
          has_entry:true,
          has_stop:true,
          has_target:true,
          plan_status:'valid',
          pullback_zone:'near_20ma',
          stop_distance_too_wide:false,
          entry:100,
          stop:97,
          target:106,
          current_price:101,
          ma20:99,
          ma50:95,
          ma200:90,
          rr:2.1,
          market_regime:'weak',
          volume_state:'supportive',
          tradeability:'tradable',
          price_above_20ma:true,
          price_above_50ma:true,
          price_above_200ma:true,
          ma50_above_200ma:true,
          strong_bullish_reversal:true,
          candle_evidence_higher_low_hold:true,
          strong_bullish_continuation:true
        },
        expect:{near:true, entry:false}
      },
      {
        id:'neutral-market-allows-near-entry-but-blocks-entry',
        ctx:{
          structure_state:'strong',
          trend_state:'intact',
          stabilisation_state:'clear',
          bounce_state:'confirmed',
          plan_visible:true,
          has_entry:true,
          has_stop:true,
          has_target:true,
          plan_status:'valid',
          pullback_zone:'near_20ma',
          stop_distance_too_wide:false,
          entry:100,
          stop:97,
          target:106,
          current_price:101,
          ma20:99,
          ma50:95,
          ma200:90,
          rr:2.1,
          market_regime:'neutral',
          volume_state:'supportive',
          tradeability:'tradable',
          price_above_20ma:true,
          price_above_50ma:true,
          price_above_200ma:true,
          ma50_above_200ma:true,
          strong_bullish_reversal:true,
          candle_evidence_higher_low_hold:true,
          strong_bullish_continuation:true
        },
        expect:{near:true, entry:false}
      },
      {
        id:'late-bounce-blocks-promotion-even-with-bullish-candles',
        ctx:{
          structure_state:'strong',
          trend_state:'intact',
          stabilisation_state:'clear',
          bounce_state:'confirmed',
          plan_visible:true,
          has_entry:true,
          has_stop:true,
          has_target:true,
          plan_status:'valid',
          pullback_zone:'extended',
          setup_location_state:'extended_from_support',
          stop_distance_too_wide:false,
          entry:100,
          stop:97,
          target:110,
          current_price:109,
          ma20:100,
          ma50:95,
          ma200:90,
          rr:3.0,
          market_regime:'supportive',
          volume_state:'supportive',
          tradeability:'tradable',
          price_above_20ma:true,
          price_above_50ma:true,
          price_above_200ma:true,
          ma50_above_200ma:true,
          strong_bullish_reversal:true,
          candle_evidence_higher_low_hold:true,
          strong_bullish_continuation:true,
          breaks_local_high:true
        },
        expect:{near:false, entry:false}
      }
    ];
    const buildResolverDepsForAssertions = () => ({
      resolveFinalStateContract(item){
        return item && item.resolvedContract || {
          finalVerdict:'Watch',
          structuralState:'developing',
          actionStateKey:'wait_for_confirmation',
          planStatusKey:'valid',
          tradeabilityVerdict:'Watch',
          blockerReason:'Needs stronger confirmation',
          reasonSummary:'Needs stronger confirmation',
          terminal:false,
          baseVerdict:'watch'
        };
      },
      resolvePreLifecycleStateContract(item){
        return item && item.preLifecycleResolved || item && item.resolvedContract || {
          finalVerdict:'Watch',
          structuralState:'developing',
          actionStateKey:'wait_for_confirmation',
          planStatusKey:'valid',
          tradeabilityVerdict:'Watch',
          blockerReason:'Needs stronger confirmation',
          reasonSummary:'Needs stronger confirmation',
          terminal:false,
          baseVerdict:'watch'
        };
      },
      baseVerdictFromResolvedContract(resolved){
        return normalizeVerdict(resolved && (resolved.baseVerdict || resolved.finalVerdict || resolved.tradeabilityVerdict || 'watch'));
      },
      analysisDerivedStatesFromRecord(item){
        return item && item.derivedStates || {};
      },
      effectivePlanForRecord(item){
        return item && item.effectivePlan || item && item.plan || {};
      },
      applySetupConfirmationPlanGate(item, displayedPlan){
        return item && item.displayedPlan || displayedPlan || {};
      },
      deriveCurrentPlanState(entry, stop, target){
        const safeEntry = numericValueOrNull(entry);
        const safeStop = numericValueOrNull(stop);
        const safeTarget = numericValueOrNull(target);
        const rrRatio = Number.isFinite(safeEntry) && Number.isFinite(safeStop) && Number.isFinite(safeTarget) && safeEntry > safeStop
          ? (safeTarget - safeEntry) / (safeEntry - safeStop)
          : null;
        return {
          status:Number.isFinite(safeEntry) && Number.isFinite(safeStop) && Number.isFinite(safeTarget) ? 'valid' : 'missing',
          entry:safeEntry,
          stop:safeStop,
          target:safeTarget,
          tradeability:Number.isFinite(rrRatio) && rrRatio >= 2 ? 'tradable' : 'watch',
          rewardRisk:{rrRatio},
          riskFit:{risk_status:'acceptable'},
          affordability:'acceptable',
          capitalFit:{capital_fit:'acceptable'}
        };
      },
      evaluatePlanRealism(){
        return null;
      },
      setupScoreForRecord(item){
        const displayScore = numericValueOrNull(item && item.displayScore);
        const setupScore = numericValueOrNull(item && item.setupScore);
        return displayScore !== null ? displayScore : (setupScore !== null ? setupScore : 0);
      },
      canonicalSetupScoreForRecord(item){
        const baseScore = numericValueOrNull(item && item.baseScore);
        const setupScore = numericValueOrNull(item && item.setupScore);
        return baseScore !== null ? baseScore : (setupScore !== null ? setupScore : 0);
      },
      buildCumulativePenaltyTrace(item){
        return item && item.cumulativePenaltyTrace && Array.isArray(item.cumulativePenaltyTrace.sources)
          ? item.cumulativePenaltyTrace
          : {sources:[]};
      },
      isHostileMarketStatus(status){
        const safe = String(status || '').trim().toLowerCase();
        return safe === 'weak' || safe === 'hostile' || safe.includes('below 50');
      },
      state:{marketStatus:'supportive'},
      scannerScoreGradientClass(){
        return '';
      }
    });
    const resolverCases = [
      {
        id:'soft-caution-alone-cannot-force-terminal-avoid',
        record:{
          setupScore:7,
          baseScore:7,
          displayScore:5,
          meta:{marketStatus:'weak'},
          derivedStates:{
            structureState:'intact',
            trendState:'intact',
            bounceState:'attempt',
            stabilisationState:'early',
            volumeState:'normal',
            pullbackZone:'near_50ma',
            setupLocationState:'constructive',
            priceabilityState:'provisional'
          },
          effectivePlan:{entry:100, stop:97, firstTarget:106},
          displayedPlan:{
            status:'valid',
            entry:100,
            stop:97,
            target:106,
            tradeability:'watch',
            rewardRisk:{rrRatio:2},
            riskFit:{risk_status:'acceptable'},
            affordability:'acceptable',
            capitalFit:{capital_fit:'acceptable'}
          },
          resolvedContract:{
            finalVerdict:'Watch',
            structuralState:'developing',
            actionStateKey:'wait_for_confirmation',
            planStatusKey:'valid',
            tradeabilityVerdict:'Watch',
            blockerReason:'Needs stronger confirmation',
            reasonSummary:'Needs stronger confirmation',
            terminal:false,
            baseVerdict:'watch'
          },
          cumulativePenaltyTrace:{sources:[
            {id:'weak_market_tape', category:'soft_caution', severity:'medium', terminal:false, present:true, possibleWhere:['canonical_verdict'], appliedWhere:['canonical_verdict'], canonicalImpact:true, displayImpact:false, skippedReason:null},
            {id:'bounce_unconfirmed', category:'soft_caution', severity:'low', terminal:false, present:true, possibleWhere:['canonical_verdict'], appliedWhere:['canonical_verdict'], canonicalImpact:true, displayImpact:false, skippedReason:null}
          ]}
        },
        assert(result){
          return result.final_verdict !== 'avoid'
            && result.final_verdict !== 'dead'
            && result.structure_eligibility === 'alive'
            && result.viability !== 'reject';
        }
      },
      {
        id:'multiple-soft-cautions-cannot-kill-intact-setup',
        record:{
          setupScore:6,
          baseScore:6,
          displayScore:3,
          meta:{marketStatus:'weak'},
          derivedStates:{
            structureState:'intact',
            trendState:'intact',
            bounceState:'none',
            stabilisationState:'early',
            volumeState:'weak',
            pullbackZone:'near_50ma',
            setupLocationState:'constructive',
            priceabilityState:'unpriceable'
          },
          effectivePlan:{entry:100, stop:97, firstTarget:106},
          displayedPlan:{
            status:'valid',
            entry:100,
            stop:97,
            target:106,
            tradeability:'watch',
            rewardRisk:{rrRatio:2},
            riskFit:{risk_status:'acceptable'},
            affordability:'acceptable',
            capitalFit:{capital_fit:'acceptable'}
          },
          resolvedContract:{
            finalVerdict:'Watch',
            structuralState:'developing',
            actionStateKey:'wait_for_confirmation',
            planStatusKey:'valid',
            tradeabilityVerdict:'Watch',
            blockerReason:'Needs stronger confirmation',
            reasonSummary:'Needs stronger confirmation',
            terminal:false,
            baseVerdict:'watch'
          },
          cumulativePenaltyTrace:{sources:[
            {id:'weak_market_tape', category:'soft_caution', severity:'medium', terminal:false, present:true, possibleWhere:['canonical_verdict'], appliedWhere:['canonical_verdict'], canonicalImpact:true, displayImpact:false, skippedReason:null},
            {id:'weak_volume', category:'soft_caution', severity:'medium', terminal:false, present:true, possibleWhere:['canonical_verdict'], appliedWhere:['canonical_verdict'], canonicalImpact:true, displayImpact:false, skippedReason:null},
            {id:'no_bounce_confirmation', category:'soft_caution', severity:'medium', terminal:false, present:true, possibleWhere:['canonical_verdict'], appliedWhere:['canonical_verdict'], canonicalImpact:true, displayImpact:false, skippedReason:null},
            {id:'early_stabilisation', category:'soft_caution', severity:'low', terminal:false, present:true, possibleWhere:['canonical_verdict'], appliedWhere:['canonical_verdict'], canonicalImpact:true, displayImpact:false, skippedReason:null}
          ]}
        },
        assert(result){
          const marketTraceCount = (((result.cumulativePenaltyTrace || {}).sources) || []).filter(entry => entry && entry.id === 'weak_market_tape').length;
          return result.final_verdict !== 'avoid'
            && result.final_verdict !== 'dead'
            && result.structure_eligibility === 'alive'
            && result.viability !== 'reject'
            && marketTraceCount === 1;
        }
      },
      {
        id:'valid-maths-intact-structure-remains-monitor-floor',
        record:{
          setupScore:5,
          baseScore:5,
          displayScore:2,
          derivedStates:{
            structureState:'intact',
            trendState:'intact',
            bounceState:'attempt',
            stabilisationState:'early',
            volumeState:'normal',
            pullbackZone:'near_20ma',
            setupLocationState:'constructive',
            priceabilityState:'priceable'
          },
          effectivePlan:{entry:50, stop:48, firstTarget:55},
          displayedPlan:{
            status:'valid',
            entry:50,
            stop:48,
            target:55,
            tradeability:'watch',
            rewardRisk:{rrRatio:2.5},
            riskFit:{risk_status:'acceptable'},
            affordability:'acceptable',
            capitalFit:{capital_fit:'acceptable'}
          },
          resolvedContract:{
            finalVerdict:'Watch',
            structuralState:'developing',
            actionStateKey:'wait_for_confirmation',
            planStatusKey:'valid',
            tradeabilityVerdict:'Watch',
            blockerReason:'Needs stronger confirmation',
            reasonSummary:'Needs stronger confirmation',
            terminal:false,
            baseVerdict:'watch'
          }
        },
        assert(result){
          return ['watch', 'monitor'].includes(result.final_verdict)
            && result.final_verdict !== 'avoid'
            && result.final_verdict !== 'dead';
        }
      },
      {
        id:'constructive-support-test-can-stay-near-entry-with-soft-cautions',
        record:{
          setupScore:7,
          baseScore:7,
          displayScore:5,
          meta:{marketStatus:'weak'},
          derivedStates:{
            structureState:'developing_clean',
            trendState:'intact',
            bounceState:'attempt',
            stabilisationState:'early',
            volumeState:'normal',
            pullbackZone:'near_50ma',
            setupLocationState:'constructive',
            priceabilityState:'provisional',
            candleEvidenceReclaimRangeMeaningful:true,
            candleEvidenceReclaimedPriorDayHigh:true,
            candleEvidenceHigherLowHold:true
          },
          effectivePlan:{entry:100, stop:97, firstTarget:106},
          displayedPlan:{
            status:'valid',
            entry:100,
            stop:97,
            target:106,
            tradeability:'watch',
            rewardRisk:{rrRatio:2},
            riskFit:{risk_status:'acceptable'},
            affordability:'acceptable',
            capitalFit:{capital_fit:'acceptable'}
          },
          marketData:{price:100, ma20:99, ma50:97, ma200:92},
          resolvedContract:{
            finalVerdict:'Near Entry',
            structuralState:'near_entry',
            actionStateKey:'wait_for_confirmation',
            planStatusKey:'needs_adjustment',
            tradeabilityVerdict:'Near Entry',
            blockerReason:'Bounce is not clear enough to price yet.',
            reasonSummary:'Close to trigger.',
            terminal:false,
            baseVerdict:'near_entry'
          },
          cumulativePenaltyTrace:{sources:[
            {id:'weak_market_tape', category:'soft_caution', severity:'medium', terminal:false, present:true, possibleWhere:['canonical_verdict'], appliedWhere:['canonical_verdict'], canonicalImpact:true, displayImpact:false, skippedReason:null}
          ]}
        },
        assert(result){
          return result.final_verdict === 'near_entry'
            && result.structure_eligibility === 'alive'
            && result.near_entry_gate_pass === true
            && result.final_verdict !== 'avoid';
        }
      },
      {
        id:'priceable-pullback-in-progress-stays-near-entry-despite-late-location-flag',
        record:{
          ticker:'HWM',
          watchlist_entry_exists:true,
          authority:{version:1, source:'scan', reason:'scanner_workflow'},
          plan:{source:'scanner_estimate'},
          meta:{marketStatus:'S&P below 50 MA'},
          setupScore:7,
          baseScore:7,
          displayScore:5,
          reclaimsLevel:true,
          derivedStates:{
            structureState:'strong',
            trendState:'intact',
            bounceState:'attempt',
            stabilisationState:'early',
            volumeState:'weak',
            pullbackZone:'left_20ma',
            setupLocationState:'extended_from_support',
            priceabilityState:'priceable',
            candleEvidenceReclaimRangeMeaningful:true,
            candleEvidenceReclaimedPriorDayHigh:true,
            candleEvidenceHigherLowHold:true
          },
          effectivePlan:{entry:106, stop:100, firstTarget:120},
          displayedPlan:{
            status:'valid',
            entry:106,
            stop:100,
            target:120,
            tradeability:'tradable',
            rewardRisk:{rrRatio:2.33},
            riskFit:{risk_status:'acceptable'},
            affordability:'acceptable',
            capitalFit:{capital_fit:'acceptable'}
          },
          marketData:{price:105, ma20:100, ma50:97, ma200:92},
          resolvedContract:{
            finalVerdict:'Near Entry',
            structuralState:'near_entry',
            actionStateKey:'wait_for_confirmation',
            planStatusKey:'valid',
            tradeabilityVerdict:'Near Entry',
            blockerReason:'Waiting for confirmation.',
            reasonSummary:'Priceable pullback in progress.',
            terminal:false,
            baseVerdict:'near_entry'
          }
        },
        assert(result){
          return result.final_verdict === 'near_entry'
            && result.near_entry_gate_pass === true
            && result.entry_gate_pass === false
            && result.near_entry_gate_checks && result.near_entry_gate_checks.market_blocked === true
            && result.scan_authority_near_entry_release === true
            && result.contractDiagnostics && result.contractDiagnostics.canonicalAuthoritySelectionSource === 'scan_authority_near_entry_release'
            && result.late_pullback_gate_checks && result.late_pullback_gate_checks.late_from_support === true;
        }
      },
      {
        id:'independent-trigger-can-promote-entry-without-circular-ready-state',
        record:{
          ticker:'SHOP',
          watchlist_entry_exists:true,
          marketRegime:'supportive',
          marketStatus:'supportive',
          meta:{marketStatus:'supportive'},
          reclaimsLevel:true,
          reclaimed20ma:true,
          breaksLocalHigh:true,
          strongBullishContinuation:true,
          derivedStates:{
            structureState:'intact',
            trendState:'intact',
            stabilisationState:'clear',
            bounceState:'confirmed',
            volumeState:'normal',
            pullbackZone:'near_20ma',
            candleEvidenceReclaimRangeMeaningful:true,
            candleEvidenceHigherLowHold:true
          },
          effectivePlan:{entry:100, stop:97, firstTarget:106},
          displayedPlan:{
            status:'valid',
            entry:100,
            stop:97,
            target:106,
            tradeability:'entry',
            rewardRisk:{rrRatio:2.1},
            riskFit:{risk_status:'acceptable'},
            affordability:'acceptable',
            capitalFit:{capital_fit:'acceptable'}
          },
          marketData:{price:101, ma20:98, ma50:95, ma200:90},
          resolvedContract:{
            finalVerdict:'Near Entry',
            structuralState:'near_entry',
            actionStateKey:'wait_for_confirmation',
            planStatusKey:'valid',
            tradeabilityVerdict:'Near Entry',
            blockerReason:'Needs stronger confirmation',
            reasonSummary:'Close to trigger.',
            terminal:false,
            baseVerdict:'near_entry'
          }
        },
        assert(result){
          return result.final_verdict === 'entry';
        }
      },
      {
        id:'non-tracked-soft-readiness-deps-can-preserve-entry-priceability',
        record:{
          ticker:'TROW',
          derivedStates:{
            structureState:'strong',
            trendState:'intact',
            bounceState:'attempt',
            stabilisationState:'none',
            volumeState:'supportive',
            pullbackZone:'none',
            setupLocationState:'off_level',
            priceabilityState:'priceable'
          },
          effectivePlan:{entry:110.27, stop:102.29, firstTarget:136.19},
          displayedPlan:{
            status:'valid',
            entry:110.27,
            stop:102.29,
            target:136.19,
            tradeability:'tradable',
            rewardRisk:{rrRatio:3.25},
            riskFit:{risk_status:'acceptable'},
            affordability:'acceptable',
            capitalFit:{capital_fit:'acceptable'}
          },
          preLifecycleResolved:{
            finalVerdict:'Watch',
            structuralState:'developing',
            actionStateKey:'wait_for_confirmation',
            planStatusKey:'valid',
            tradeabilityVerdict:'Watch',
            blockerReason:'Needs stronger confirmation',
            reasonSummary:'Pre-watchlist setup',
            terminal:false,
            baseVerdict:'watch'
          },
          resolvedContract:{
            finalVerdict:'Watch',
            structuralState:'developing',
            actionStateKey:'wait_for_confirmation',
            planStatusKey:'valid',
            tradeabilityVerdict:'Watch',
            blockerReason:'Needs stronger confirmation',
            reasonSummary:'Pre-watchlist setup',
            terminal:false,
            baseVerdict:'watch',
            final_verdict:'watch',
            canonical_final_verdict:'entry',
            canonical_visual_bucket:'entry',
            canonical_priceability_state:'priceable',
            canonical_soft_readiness_alignment_applied:true,
            contractDiagnostics:{softReadinessOnlyDemotion:true}
          }
        },
        assert(result){
          return result.final_verdict === 'watch'
            && result.priceability_state === 'priceable'
            && result.tracked === false;
        }
      },
      {
        id:'tracked-broken-extended-below-50-without-confirmed-breakdown-stays-watch',
        record:{
          ticker:'NVDA',
          watchlist_entry_exists:true,
          baseScore:2,
          setupScore:2,
          derivedStates:{
            structureState:'weak',
            trendState:'acceptable',
            setupLocationState:'extended',
            priceabilityState:'priceable',
            stabilisationState:'none',
            bounceState:'none',
            pullbackZone:'extended',
            volumeState:'weak'
          },
          effectivePlan:{entry:208.87, stop:196.14, firstTarget:235.74},
          displayedPlan:{
            status:'valid',
            entry:208.87,
            stop:196.14,
            target:235.74,
            tradeability:'tradable',
            rewardRisk:{rrRatio:2.11},
            riskFit:{risk_status:'acceptable'},
            affordability:'affordable',
            capitalFit:{capital_fit:'ideal'}
          },
          marketData:{price:196.14, ma20:208.87, ma50:210.22, ma200:190.53},
          resolvedContract:{
            finalVerdict:'Watch',
            structuralState:'developing',
            actionStateKey:'wait_for_confirmation',
            planStatusKey:'valid',
            tradeabilityVerdict:'Watch',
            blockerReason:'Needs stronger confirmation',
            reasonSummary:'Technicals are promising, but stabilisation or bounce is not confirmed yet.',
            terminal:false,
            baseVerdict:'watch'
          }
        },
        assert(result){
          return result.final_verdict === 'watch'
            && result.viability === 'low_priority'
            && result.viabilityBranchId === 'damaged_extended_without_hard_invalidation_low_priority'
            && /extended away from support|too far from support/i.test(String(result.reason || ''));
        }
      },
      {
        id:'tracked-unchanged-scan-authority-does-not-flip-to-plan-state-avoid',
        record:{
          ticker:'KEYS',
          watchlist_entry_exists:true,
          authority:{
            version:1,
            source:'scan',
            reason:'scanner_workflow'
          },
          plan:{
            source:'scanner_estimate',
            authoritySource:'applyPlanCandidateToRecord',
            authorityVersion:'trade_plan_v1'
          },
          derivedStates:{
            structureState:'weak',
            trendState:'acceptable',
            setupLocationState:'off_level',
            priceabilityState:'priceable',
            stabilisationState:'none',
            bounceState:'none',
            pullbackZone:'extended',
            volumeState:'weak'
          },
          effectivePlan:{entry:341.689, stop:309.12, firstTarget:373.34},
          displayedPlan:{
            status:'valid',
            entry:341.689,
            stop:309.12,
            target:373.34,
            tradeability:'risk_only',
            rewardRisk:{rrRatio:0.97},
            riskFit:{risk_status:'acceptable'},
            affordability:'unknown',
            capitalFit:{capital_fit:'unknown', capital_note:'Capital check: fx estimated', fx_status:'estimated'}
          },
          preLifecycleResolved:{
            finalVerdict:'Watch',
            structuralState:'developing',
            actionStateKey:'wait_for_confirmation',
            planStatusKey:'valid',
            tradeabilityVerdict:'Watch',
            blockerReason:'Structure is weak and viability rejected the setup.',
            reasonSummary:'Structure is broken.',
            terminal:false,
            baseVerdict:'watch',
            primaryBlockerSource:'setup_location',
            contractDiagnostics:{
              authorityContract:'pre_lifecycle',
              blockerSource:'setup_location',
              softReadinessOnlyDemotion:false,
              planStatus:'valid',
              tradeability:'risk_only'
            }
          },
          resolvedContract:{
            finalVerdict:'Avoid',
            final_verdict:'avoid',
            structuralState:'avoid',
            actionStateKey:'blocked',
            planStatusKey:'invalid',
            tradeabilityVerdict:'Avoid',
            blockerReason:'Structure is weak and viability rejected the setup.',
            reasonSummary:'Structure is broken.',
            terminal:false,
            baseVerdict:'avoid',
            primaryBlockerSource:'plan_state',
            contractDiagnostics:{
              authorityContract:'tracked_final',
              blockerSource:'plan_state',
              softReadinessOnlyDemotion:false,
              planStatus:'invalid',
              tradeability:'invalid'
            }
          }
        },
        assert(result){
          return result.tracked === true
            && result.final_verdict === 'watch'
            && result.canonical_final_verdict === 'watch'
            && result.canonical_visual_bucket === 'diminishing'
            && result.canonical_soft_readiness_alignment_applied === false
            && result.contractDiagnostics
            && result.contractDiagnostics.authorityContract === 'pre_lifecycle'
            && result.contractDiagnostics.blockerSource === 'setup_location'
            && result.contractDiagnostics.canonicalAuthoritySelectionSource === 'scan_authority_preserved'
            && result.canonical_soft_readiness_alignment_source === 'scan_authority_preserved';
        }
      },
      {
        id:'tracked-unchanged-scan-authority-without-scanner-estimate-plan-source-still-preserves-watch-contract',
        record:{
          ticker:'NOSOURCE',
          watchlist_entry_exists:true,
          authority:{
            version:1,
            source:'scan',
            reason:'scanner_workflow'
          },
          plan:{
            source:'',
            authoritySource:'applyPlanCandidateToRecord',
            authorityVersion:'trade_plan_v1'
          },
          derivedStates:{
            structureState:'weak',
            trendState:'acceptable',
            setupLocationState:'off_level',
            priceabilityState:'priceable',
            stabilisationState:'none',
            bounceState:'none',
            pullbackZone:'extended',
            volumeState:'weak'
          },
          effectivePlan:{entry:50, stop:45, firstTarget:53},
          displayedPlan:{
            status:'valid',
            entry:50,
            stop:45,
            target:53,
            tradeability:'risk_only',
            rewardRisk:{rrRatio:0.6},
            riskFit:{risk_status:'acceptable'},
            affordability:'unknown',
            capitalFit:{capital_fit:'unknown', capital_note:'Capital check: fx estimated', fx_status:'estimated'}
          },
          preLifecycleResolved:{
            finalVerdict:'Watch',
            structuralState:'developing',
            actionStateKey:'wait_for_confirmation',
            planStatusKey:'valid',
            tradeabilityVerdict:'Watch',
            blockerReason:'Conditions are not strong enough for active focus.',
            reasonSummary:'Pre-watchlist setup.',
            terminal:false,
            baseVerdict:'watch',
            primaryBlockerSource:'setup_location',
            contractDiagnostics:{
              authorityContract:'pre_lifecycle',
              blockerSource:'setup_location',
              planStatus:'valid',
              tradeability:'risk_only'
            }
          },
          resolvedContract:{
            finalVerdict:'Avoid',
            final_verdict:'avoid',
            structuralState:'avoid',
            actionStateKey:'blocked',
            planStatusKey:'invalid',
            tradeabilityVerdict:'Avoid',
            blockerReason:'Plan invalid after tracking.',
            reasonSummary:'Tracked path invalidated the plan.',
            terminal:false,
            baseVerdict:'avoid',
            primaryBlockerSource:'plan_state',
            contractDiagnostics:{
              authorityContract:'tracked_final',
              blockerSource:'plan_state',
              planStatus:'invalid',
              tradeability:'invalid'
            }
          }
        },
        assert(result){
          return result.tracked === true
            && result.final_verdict === 'watch'
            && result.canonical_final_verdict === 'watch'
            && result.canonical_visual_bucket === 'diminishing'
            && result.canonical_soft_readiness_alignment_applied === false
            && result.contractDiagnostics
            && result.contractDiagnostics.authorityContract === 'pre_lifecycle'
            && result.contractDiagnostics.blockerSource === 'setup_location'
            && result.contractDiagnostics.canonicalAuthoritySelectionSource === 'scan_authority_preserved'
            && result.canonical_soft_readiness_alignment_source === 'scan_authority_preserved';
        }
      },
      {
        id:'broken-extended-without-hard-invalidation-viability-branch',
        viability:{
          structureEligibility:'broken',
          structureState:'weak',
          setupLocationState:'extended',
          priceabilityState:'provisional',
          bounceState:'none',
          pullbackZone:'extended',
          setupScore:5,
          planOk:true,
          rrOk:false,
          credibleRr:1.87,
          tradeabilityOk:false,
          tradeability:'risk_only',
          volumeOk:false,
          planStatusKey:'valid',
          isExtended:true,
          hasEntry:true,
          hasStop:true,
          hasTarget:true,
          hardTrendBroken:false,
          terminalAvoidFlag:false,
          explicitInvalidationReason:'',
          below50WithoutReclaim:false,
          below200ma:false,
          ma50Below200ma:false,
          stabilisationState:'none'
        },
        expect:{
          viability:'low_priority',
          branch:'broken_extended_without_hard_invalidation_low_priority',
          blocker:'Trend is extended away from support - keep on monitor until price resets or repairs.'
        }
      },
      {
        id:'broken-extended-live-location-state-without-distance-flag-still-softens',
        viability:{
          structureEligibility:'broken',
          structureState:'weak',
          setupLocationState:'extended',
          priceabilityState:'provisional',
          bounceState:'none',
          pullbackZone:'extended',
          setupScore:4,
          planOk:true,
          rrOk:false,
          credibleRr:1.98,
          tradeabilityOk:false,
          tradeability:'risk_only',
          volumeOk:false,
          planStatusKey:'valid',
          isExtended:false,
          hasEntry:true,
          hasStop:true,
          hasTarget:true,
          hardTrendBroken:false,
          terminalAvoidFlag:false,
          explicitInvalidationReason:'',
          below50WithoutReclaim:false,
          below200ma:false,
          ma50Below200ma:false,
          stabilisationState:'none'
        },
        expect:{
          viability:'low_priority',
          branch:'broken_extended_without_hard_invalidation_low_priority',
          blocker:'Trend is extended away from support - keep on monitor until price resets or repairs.'
        }
      },
      {
        id:'broken-structure-with-hard-invalidation-still-rejects',
        viability:{
          structureEligibility:'broken',
          structureState:'weak',
          setupLocationState:'extended',
          priceabilityState:'provisional',
          bounceState:'none',
          pullbackZone:'extended',
          setupScore:3,
          planOk:false,
          rrOk:false,
          credibleRr:1.2,
          tradeabilityOk:false,
          tradeability:'risk_only',
          volumeOk:false,
          planStatusKey:'invalid',
          isExtended:true,
          hasEntry:true,
          hasStop:true,
          hasTarget:true,
          hardTrendBroken:true,
          terminalAvoidFlag:false,
          explicitInvalidationReason:'',
          below50WithoutReclaim:true,
          below200ma:false,
          ma50Below200ma:false,
          stabilisationState:'none'
        },
        expect:{
          viability:'reject',
          branch:'broken_structure_reject',
          blocker:'Structure is broken.'
        }
      },
      {
        id:'broken-nonexception-does-not-fall-through',
        viability:{
          structureEligibility:'broken',
          structureState:'weak',
          setupLocationState:'extended',
          priceabilityState:'provisional',
          bounceState:'attempt',
          pullbackZone:'extended',
          setupScore:5,
          planOk:true,
          rrOk:false,
          credibleRr:1.87,
          tradeabilityOk:false,
          tradeability:'risk_only',
          volumeOk:false,
          planStatusKey:'valid',
          isExtended:true,
          hasEntry:true,
          hasStop:true,
          hasTarget:true,
          hardTrendBroken:false,
          terminalAvoidFlag:false,
          explicitInvalidationReason:'',
          below50WithoutReclaim:false,
          below200ma:false,
          ma50Below200ma:false,
          stabilisationState:'early'
        },
        expect:{
          viability:'reject',
          branch:'broken_structure_reject',
          blocker:'Structure is broken.'
        }
      }
    ];
    const results = cases.map(testCase => {
      if(testCase.viability){
        const viability = resolveWatchlistViability(testCase.viability);
        const pass = viability.viability === testCase.expect.viability
          && viability.viabilityBranchId === testCase.expect.branch
          && (testCase.expect.blocker === undefined || viability.mainBlocker === testCase.expect.blocker);
        return {
          id:testCase.id,
          pass,
          viability:viability.viability,
          viabilityBranchId:viability.viabilityBranchId,
          viabilityReason:viability.viabilityReason,
          mainBlocker:viability.mainBlocker
        };
      }
      const near = canPromoteToNearEntry(testCase.ctx);
      const entry = canPromoteToEntry(testCase.ctx);
      const pass = near.pass === testCase.expect.near && (testCase.expect.entry === undefined || entry.pass === testCase.expect.entry);
      return {id:testCase.id, pass, near:near.pass, entry:entry.pass, nearReasons:near.reasons, entryReasons:entry.reasons};
    });
    resolverCases.forEach(testCase => {
      if(testCase.viability){
        const viability = resolveWatchlistViability(testCase.viability);
        const pass = viability.viability === testCase.expect.viability
          && viability.viabilityBranchId === testCase.expect.branch
          && (testCase.expect.blocker === undefined || viability.mainBlocker === testCase.expect.blocker);
        results.push({
          id:testCase.id,
          pass,
          viability:viability.viability,
          viabilityBranchId:viability.viabilityBranchId,
          viabilityReason:viability.viabilityReason,
          mainBlocker:viability.mainBlocker
        });
        return;
      }
      const resolved = resolveGlobalVerdict(testCase.record, buildResolverDepsForAssertions());
      const pass = testCase.assert(resolved) === true;
      results.push({
        id:testCase.id,
        pass,
        finalVerdict:resolved.final_verdict,
        viability:resolved.viability,
        viabilityBranchId:resolved.viabilityBranchId,
        structureEligibility:resolved.structure_eligibility,
        nearEntryGatePass:resolved.near_entry_gate_pass,
        cumulativePenaltyTrace:resolved.cumulativePenaltyTrace
      });
    });
    results.forEach(result => {
      if(!result.pass){
        console.warn('[GateAssertionFailed]', result);
      }
    });
    return results;
  }

  global.ResolverCore = {
    normalizeGlobalVerdictKey,
    normalizeVerdict,
    buildCanonicalResolutionContext,
    evaluateCanonicalSemanticsAndGates,
    globalVerdictLabel,
    getTone,
    getBucket,
    getBadge,
    getActions,
    normalizeVolumeState,
    resolveSupportAuthority,
    resolveCanonicalPullbackContext,
    canPromoteToEntry,
    canPromoteToNearEntry,
    applyPromotionGuards,
    shouldPreserveScanAuthorityCanonicalPath,
    resolveStructureEligibility,
    resolveWatchlistViability,
    resolveGlobalVerdict,
    runTradeReadinessGateAssertions
  };
})(window);
