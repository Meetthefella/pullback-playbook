(function(global){
  function numericOrNull(value){
    if(value == null || value === '') return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  function hasClearTradeInvalidation(context = {}){
    const entry = numericOrNull(context.entry);
    const stop = numericOrNull(context.stop);
    return !!(Number.isFinite(entry) && Number.isFinite(stop) && entry > stop);
  }

  function canPriceTradePlan(context = {}){
    const entry = numericOrNull(context.entry);
    const stop = numericOrNull(context.stop);
    const target = numericOrNull(context.target);
    const rr = numericOrNull(context.rr);
    return !!(
      Number.isFinite(entry)
      && Number.isFinite(stop)
      && Number.isFinite(target)
      && entry > stop
      && target > entry
      && Number.isFinite(rr)
      && rr > 0
    );
  }

  function isConfirmedBouncePriceable(context = {}){
    const originalBounceState = String(context.originalBounceState || context.bounceState || '').trim().toLowerCase();
    const structureState = String(context.structureState || '').trim().toLowerCase();
    const pullbackZone = String(context.pullbackZone || '').trim().toLowerCase();
    const stabilisationState = String(context.stabilisationState || '').trim().toLowerCase();
    const trendState = String(context.trendState || '').trim().toLowerCase();
    const currentPrice = numericOrNull(context.currentPrice);
    const entry = numericOrNull(context.entry);
    const reclaimConfirmed = context.reclaimConfirmed === true;
    const riskTooWide = context.riskTooWide === true;
    const weakStructure = ['weak','weakening','broken','developing_loose'].includes(structureState) || trendState === 'broken';
    const nearValidPullback = ['near_20ma','near_50ma'].includes(pullbackZone);
    const stabilised = ['clear','early','present'].includes(stabilisationState);
    const hasClearInvalidationLevel = hasClearTradeInvalidation(context);
    const hasPriceablePlan = canPriceTradePlan(context);
    const reclaimedOrHoldingTrigger = reclaimConfirmed || (Number.isFinite(entry) && Number.isFinite(currentPrice) && currentPrice >= (entry * 0.985));
    const hasCredibleEntryTrigger = nearValidPullback && stabilised && !weakStructure && reclaimedOrHoldingTrigger;

    let unpriceableBlockReason = '';
    if(riskTooWide) unpriceableBlockReason = 'Trend is weakening - no reliable stop level yet.';
    else if(!hasClearInvalidationLevel) unpriceableBlockReason = 'Trend is weakening - no reliable stop level yet.';
    else if(!hasPriceablePlan) unpriceableBlockReason = 'Bounce is not clear enough to price yet.';
    else if(!hasCredibleEntryTrigger) unpriceableBlockReason = 'Developing - waiting for confirmation.';

    const guardApplied = originalBounceState === 'confirmed' && !!unpriceableBlockReason;
    const adjustedBounceState = guardApplied ? 'improving' : (originalBounceState || 'none');
    return {
      originalBounceState:originalBounceState || 'none',
      adjustedBounceState,
      bouncePriceabilityGuardApplied:guardApplied,
      bouncePriceabilityGuardReason:guardApplied ? unpriceableBlockReason : '',
      hasClearInvalidationLevel,
      hasPriceablePlan,
      hasCredibleEntryTrigger,
      unpriceableBlockReason
    };
  }

  global.BouncePriceability = Object.assign({}, global.BouncePriceability, {
    hasClearTradeInvalidation,
    canPriceTradePlan,
    isConfirmedBouncePriceable
  });
})(typeof window !== 'undefined' ? window : globalThis);
