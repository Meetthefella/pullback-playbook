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
    if(verdict === 'entry') return {line1:'Entry - your plan fits.', line2:''};
    if(verdict === 'near_entry') return {line1:'Near Entry - almost ready. Watch for confirmation.', line2:''};
    if(verdict === 'avoid' || verdict === 'dead') return {line1:'Avoid - too weak or broken. Leave it alone.', line2:''};
    const structuralState = String(resolvedContract && resolvedContract.structuralState || '').toLowerCase();
    const summary = structuralState === 'developing'
      ? 'Developing - still forming. Buyers have not taken control yet.'
      : 'Monitor - still forming. Buyers have not taken control yet.';
    return {line1:'Bounce is too weak to price cleanly.', line2:summary};
  }

  window.ReviewPresentation = {
    plannerToneClass,
    capitalFitMetricText,
    renderTradeStatusMarkup,
    tradeStatusMetricText
  };
})();
