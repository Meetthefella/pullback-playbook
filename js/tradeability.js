(function(global){
  // Pure tradeability and RR band helpers extracted from app.js.
  function riskStatusLabel(riskStatus){
    if(riskStatus === 'fits_risk') return 'Fits Risk';
    if(riskStatus === 'too_wide') return 'Too Wide';
    if(riskStatus === 'settings_missing') return 'Settings Missing';
    if(riskStatus === 'invalid_plan') return 'Invalid Plan';
    return 'Plan Missing';
  }

  function rrBandForValue(rrValue){
    if(!Number.isFinite(rrValue)) return 'na';
    if(rrValue >= 3) return 'strong';
    if(rrValue >= 2) return 'good';
    if(rrValue >= 1.5) return 'acceptable';
    return 'weak';
  }

  function rrStateLabel(rrValue, deps = {}){
    const { numericOrNull } = deps;
    const band = typeof rrValue === 'string' && !Number.isFinite(Number(rrValue)) ? rrValue : rrBandForValue(numericOrNull(rrValue));
    if(band === 'strong') return 'Strong R:R';
    if(band === 'good') return 'Good R:R';
    if(band === 'acceptable') return 'Acceptable R:R';
    if(band === 'weak') return 'Weak R:R';
    return 'R:R N/A';
  }

  function rrStateShortLabel(rrValue, deps = {}){
    const { numericOrNull } = deps;
    const band = typeof rrValue === 'string' && !Number.isFinite(Number(rrValue)) ? rrValue : rrBandForValue(numericOrNull(rrValue));
    if(band === 'strong') return 'Strong';
    if(band === 'good') return 'Good';
    if(band === 'acceptable') return 'Acceptable';
    if(band === 'weak') return 'Weak';
    return 'N/A';
  }

  function rrStateClass(rrValue, deps = {}){
    const { numericOrNull } = deps;
    const band = typeof rrValue === 'string' && !Number.isFinite(Number(rrValue)) ? rrValue : rrBandForValue(numericOrNull(rrValue));
    if(band === 'strong' || band === 'good') return 's-hi';
    if(band === 'acceptable') return 's-mid';
    return 's-low';
  }

  function planQualityForRr(rrRatio){
    const band = rrBandForValue(rrRatio);
    if(band === 'strong') return 'Strong';
    if(band === 'good') return 'Good';
    if(band === 'acceptable') return 'Acceptable';
    if(band === 'weak') return 'Weak';
    return null;
  }

  function tradeabilityLabel(tradeability){
    if(tradeability === 'tradable') return 'Tradable';
    if(tradeability === 'capital_heavy') return 'Capital Heavy';
    if(tradeability === 'too_expensive') return 'Too Expensive';
    if(tradeability === 'risk_only') return 'Risk OK | Capital Check Estimated';
    if(tradeability === 'not_ready') return 'Not Ready';
    return 'Invalid';
  }

  function deriveTradeability(planStatus, riskStatus, capitalFit){
    if(planStatus === 'missing' || planStatus === 'invalid' || planStatus === 'needs_adjustment') return 'not_ready';
    if(planStatus !== 'valid') return 'invalid';
    if(riskStatus !== 'fits_risk') return 'invalid';
    if(['ideal','acceptable','borderline','fits_capital'].includes(capitalFit)) return 'tradable';
    if(capitalFit === 'heavy') return 'capital_heavy';
    if(capitalFit === 'too_heavy') return 'too_expensive';
    if(capitalFit === 'too_expensive') return 'too_expensive';
    return 'risk_only';
  }

  global.Tradeability = {
    riskStatusLabel,
    rrBandForValue,
    rrStateLabel,
    rrStateShortLabel,
    rrStateClass,
    planQualityForRr,
    tradeabilityLabel,
    deriveTradeability
  };
})(window);
