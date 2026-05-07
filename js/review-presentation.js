(function(){
  function plannerToneClass(rrValue, deps){
    const {rrDisplayClass} = deps;
    const rrClass = rrDisplayClass(rrValue);
    if(rrClass === 'rr-low') return 'plannerbox--rr-low';
    if(rrClass === 'rr-high') return 'plannerbox--rr-high';
    return 'plannerbox--rr-mid';
  }

  function capitalFitMetricText(capitalComfortLabel){
    return `Capital fit: ${String(capitalComfortLabel || 'Not available')}`;
  }

  function renderTradeStatusMarkup(status, deps){
    const {escapeHtml} = deps;
    const safeStatus = status && typeof status === 'object' ? status : {line1:String(status || ''), line2:''};
    const line1 = String(safeStatus.line1 || '').trim();
    const line2 = String(safeStatus.line2 || '').trim();
    if(line2){
      return `<span class="trade-status-primary">${escapeHtml(line1)}</span><span class="trade-status-secondary">${escapeHtml(line2)}</span>`;
    }
    return `<span class="trade-status-primary">${escapeHtml(line1)}</span>`;
  }

  function tradeStatusMetricText(input, deps){
    const {
      normalizeGlobalVerdictKey
    } = deps;
    const {globalVerdict, resolvedContract} = input || {};
    const verdict = normalizeGlobalVerdictKey(globalVerdict && globalVerdict.final_verdict || '');
    const terminalAvoidEvidence = !!(
      globalVerdict && (
        globalVerdict.terminal_avoid_applied === true
        || globalVerdict.rejected_by_viability_gate === true
        || String(globalVerdict.viability || '').trim().toLowerCase() === 'reject'
        || ['broken','dead','invalid','failed'].includes(String(globalVerdict.structure_state || '').trim().toLowerCase())
        || ['terminal','terminal_avoid','structure_broken','explicit_invalidation','dead','avoid'].includes(String(globalVerdict.avoid_trigger_source || globalVerdict.dead_trigger_source || '').trim().toLowerCase())
      )
    );
    const hasProvisionalPlan = !!(globalVerdict && (
      globalVerdict.hasProvisionalPriceablePlan === true
      || globalVerdict.has_provisional_priceable_plan === true
    ));
    const hasPriceablePlan = !!(globalVerdict && (
      globalVerdict.hasPriceablePlan === true
      || globalVerdict.has_priceable_plan === true
    ));
    const nearEntryGatePass = !!(globalVerdict && globalVerdict.near_entry_gate_pass === true);
    const confirmationCopy = hasProvisionalPlan
      ? {line1:'Provisional plan - waiting for confirmation.', line2:''}
      : (hasPriceablePlan || nearEntryGatePass
        ? {line1:'Plan needs confirmation before entry.', line2:'No actionable entry yet.'}
        : {line1:'Bounce is developing - waiting for confirmation.', line2:'No actionable entry yet.'});
    if(verdict === 'entry') return {line1:'Entry - your plan fits.', line2:''};
    if(verdict === 'near_entry') return {line1:'Near Entry - almost ready. Watch for confirmation.', line2:''};
    if(verdict === 'avoid' || verdict === 'dead'){
      return terminalAvoidEvidence
        ? {line1:'Avoid - too weak or broken. Leave it alone.', line2:''}
        : confirmationCopy;
    }
    const structureState = String(globalVerdict && globalVerdict.structure_state || '').toLowerCase();
    const structureEligibility = String(globalVerdict && globalVerdict.structure_eligibility || '').toLowerCase();
    const isExtended = globalVerdict && globalVerdict.is_extended === true;
    const mainBlocker = String(globalVerdict && globalVerdict.main_blocker || '').trim();
    const reviewLifecycleBias = String(globalVerdict && globalVerdict.review_lifecycle_bias || '').trim().toLowerCase();
    const reviewLifecycleLine1 = String(globalVerdict && globalVerdict.review_lifecycle_line1 || '').trim();
    const reviewLifecycleLine2 = String(globalVerdict && globalVerdict.review_lifecycle_line2 || '').trim();
    const trackPresentationBucket = String(globalVerdict && globalVerdict.track_presentation_bucket || '').trim().toLowerCase();
    if(isExtended){
      return {
        line1:'No pullback structure to define entry yet.',
        line2:'Buyers in control, but price is stretched away from support'
      };
    }
    if(reviewLifecycleBias === 'diminishing' || trackPresentationBucket === 'diminishing'){
      return {
        line1:reviewLifecycleLine1 || 'Trend is weakening - no reliable stop level yet.',
        line2:reviewLifecycleLine2 || 'Diminishing - setup quality is fading.'
      };
    }
    if(structureEligibility === 'damaged' || structureState === 'weakening'){
      return {
        line1:'Trend is weakening - no reliable stop level yet.',
        line2:'Monitor - structure weakening.'
      };
    }
    if(mainBlocker){
      if(!terminalAvoidEvidence && /avoid|too weak|broken|leave it alone/i.test(mainBlocker)){
        return confirmationCopy;
      }
      return {line1:mainBlocker, line2:'Monitor - waiting for confirmation.'};
    }
    const structuralState = String(resolvedContract && resolvedContract.structuralState || '').toLowerCase();
    const bouncePrimary = ['strong','intact','developing_clean','developing'].includes(structureState)
      ? 'Bounce is too weak to price cleanly.'
      : 'No pullback structure to define entry yet.';
    const summary = structuralState === 'developing'
      ? 'Developing - waiting for confirmation.'
      : 'Monitor - waiting for confirmation.';
    return {line1:bouncePrimary, line2:summary};
  }

  window.ReviewPresentation = {
    plannerToneClass,
    capitalFitMetricText,
    renderTradeStatusMarkup,
    tradeStatusMetricText
  };
})();
