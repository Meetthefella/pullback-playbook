(function(global){
  // Keep canonical Chart Guru phase validation independent from rendering and DOM state.
  function validatedCanonicalPhase(phase = '', {supportInteraction = '', supportCurrentlyActive = false, buyerResponsePresent = false, buyerControlState = '', reboundStalled = false} = {}){
    const candidate = String(phase || '').trim().toLowerCase();
    if(candidate === 'support_failed') return supportInteraction === 'failed' ? candidate : '';
    if(['at_support', 'responding_from_support'].includes(candidate)){
      if(!supportCurrentlyActive || supportInteraction === 'failed') return '';
      return candidate === 'responding_from_support' && !(buyerResponsePresent || buyerControlState === 'confirmed') ? '' : candidate;
    }
    if(['away_from_support', 'extended_from_support'].includes(candidate)) return supportCurrentlyActive ? '' : candidate;
    if(candidate === 'stalled_after_response') return reboundStalled ? candidate : '';
    if(candidate === 'repairing_structure') return supportInteraction === 'failed' ? candidate : '';
    return '';
  }

  global.ChartGuruPhasePolicy = {
    validatedCanonicalPhase
  };
})(typeof window !== 'undefined' ? window : globalThis);
