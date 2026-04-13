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
      normalizeGlobalVerdictKey,
      buildValidityConditionSummary,
      blockedTradeStatusFromPrimaryBlocker
    } = deps;
    const {globalVerdict, displayedPlan, resolvedContract} = input || {};
    const verdict = normalizeGlobalVerdictKey(globalVerdict && globalVerdict.final_verdict || '');
    const blockerReason = String(resolvedContract && resolvedContract.blockerReason || '').toLowerCase();
    const terminalBlock = verdict === 'dead'
      || blockerReason.includes('rebuild')
      || blockerReason.includes('too much account capital')
      || blockerReason.includes('too heavy')
      || blockerReason.includes('too expensive')
      || blockerReason.includes('no viable plan');
    if((verdict === 'monitor' || verdict === 'watch' || verdict === 'near_entry' || ((globalVerdict && globalVerdict.bucket) === 'monitor_watch' && (globalVerdict && globalVerdict.tone) === 'orange')) && !terminalBlock){
      return buildValidityConditionSummary({
        finalVerdict:verdict,
        entryGateChecks:globalVerdict && globalVerdict.entry_gate_checks,
        nearEntryGateChecks:globalVerdict && globalVerdict.near_entry_gate_checks,
        structureState:globalVerdict && globalVerdict.structure_state,
        bounceState:globalVerdict && globalVerdict.bounce_state,
        rrConfidence:resolvedContract && resolvedContract.rrConfidenceLabel,
        pullbackState:globalVerdict && globalVerdict.pullback_state
      });
    }
    if(!globalVerdict || globalVerdict.allow_plan === false) return blockedTradeStatusFromPrimaryBlocker(resolvedContract);
    const planStatus = String(displayedPlan && displayedPlan.status || '').trim().toLowerCase();
    if(planStatus === 'valid') return {line1:'Reviewable', line2:''};
    if(planStatus === 'needs_adjustment' || planStatus === 'pending_validation' || planStatus === 'missing') return blockedTradeStatusFromPrimaryBlocker(resolvedContract);
    return blockedTradeStatusFromPrimaryBlocker(resolvedContract);
  }

  window.ReviewPresentation = {
    plannerToneClass,
    capitalFitMetricText,
    renderTradeStatusMarkup,
    tradeStatusMetricText
  };
})();
