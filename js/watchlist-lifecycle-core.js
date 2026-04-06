(function(global){
  // Deterministic watchlist lifecycle core helpers extracted from app.js.
  function watchlistLifecycleStateRank(state){
    if(state === 'entry') return 0;
    if(state === 'near_entry') return 1;
    if(state === 'watch') return 2;
    if(state === 'monitor') return 3;
    if(state === 'avoid') return 4;
    if(state === 'dead') return 5;
    return 6;
  }

  function canonicalLifecycleState(state){
    const value = String(state || '').trim().toLowerCase();
    if(value === 'developing') return 'monitor';
    if(value === 'early') return 'watch';
    if(value === 'filtered' || value === 'inactive' || value === 'avoided') return 'avoid';
    if(['entry','near_entry','watch','monitor','avoid','dead'].includes(value)) return value;
    return '';
  }

  function resolveLifecycleTransition(currentState, inputs = {}, deps = {}){
    const rawState = String(currentState || '').trim().toLowerCase();
    const lifecycleState = canonicalLifecycleState(currentState);
    const structureState = String(inputs.structure_state || '').trim().toLowerCase();
    const bounceState = String(inputs.bounce_state || '').trim().toLowerCase();
    const planStatus = String(inputs.plan_status || '').trim().toLowerCase();
    const rrConfidence = String(inputs.rr_confidence || '').trim().toLowerCase();
    const marketRegime = String(inputs.market_regime || '').trim().toLowerCase();
    const finalVerdict = canonicalLifecycleState(inputs.final_verdict);
    let nextState = lifecycleState || canonicalLifecycleState(inputs.final_state) || '';

    if(structureState === 'broken') nextState = 'avoid';

    if(
      ['watch','monitor'].includes(lifecycleState)
      && finalVerdict === 'near_entry'
      && structureState === 'intact'
      && bounceState === 'confirmed'
      && planStatus === 'valid'
      && rrConfidence !== 'invalid'
      && marketRegime !== 'weak'
    ){
      nextState = 'near_entry';
    }

    if(
      lifecycleState === 'monitor'
      && structureState === 'broken'
    ){
      nextState = 'avoid';
    }

    if(
      lifecycleState === 'monitor'
      && planStatus === 'invalid'
    ){
      nextState = 'monitor';
    }

    if(
      ['watch','developing'].includes(rawState)
      && finalVerdict === 'monitor'
      && structureState === 'intact'
    ){
      nextState = 'monitor';
    }

    if(
      nextState === 'avoid'
      && finalVerdict
      && finalVerdict !== 'avoid'
    ){
      return lifecycleState || currentState;
    }

    if(
      nextState === 'near_entry'
      && finalVerdict
      && finalVerdict !== 'near_entry'
    ){
      return lifecycleState || currentState;
    }

    return nextState;
  }

  global.WatchlistLifecycleCore = {
    watchlistLifecycleStateRank,
    canonicalLifecycleState,
    resolveLifecycleTransition
  };
})(window);
