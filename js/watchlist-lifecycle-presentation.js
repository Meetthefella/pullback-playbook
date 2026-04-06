(function(global){
  // Presentation shaping for watchlist lifecycle snapshots extracted from app.js.
  function applyLifecycleStatePresentation(snapshot, nextState, context = {}, deps = {}){
    const state = deps.canonicalLifecycleState(nextState) || deps.canonicalLifecycleState(snapshot && snapshot.state);
    const globalVerdict = context.globalVerdict || {};
    const resolved = context.resolved || {};
    const activeExpiryAt = context.activeExpiryAt || '';
    const planExpiryAt = context.planExpiryAt || '';
    const expiryAt = context.expiryAt || '';
    const reason = context.reason || snapshot.reason || globalVerdict.reason || '';
    const badge = deps.getBadge(state || 'monitor');
    const nextSnapshot = {
      ...snapshot,
      state:state || snapshot.state,
      label:badge.text,
      badgeClass:badge.className,
      reason
    };

    if(state === 'dead'){
      nextSnapshot.bucket = 'low_priority_avoid';
      nextSnapshot.stage = 'avoided';
      nextSnapshot.status = 'inactive';
      nextSnapshot.expiresAt = '';
      nextSnapshot.reason = reason || globalVerdict.reason || resolved.blockerReason || 'Setup failed technically and is no longer actionable.';
    }else if(state === 'avoid'){
      nextSnapshot.bucket = 'low_priority_avoid';
      nextSnapshot.stage = 'avoided';
      nextSnapshot.status = 'inactive';
      nextSnapshot.expiresAt = '';
      nextSnapshot.reason = reason || globalVerdict.reason || 'Setup is no longer watchlist-eligible.';
    }else if(state === 'entry'){
      nextSnapshot.bucket = 'tradeable_entry';
      nextSnapshot.stage = 'planned';
      nextSnapshot.status = 'active';
      nextSnapshot.expiresAt = planExpiryAt || nextSnapshot.expiresAt;
      nextSnapshot.reason = reason || 'Entry setup is actionable now.';
    }else if(state === 'near_entry'){
      nextSnapshot.bucket = 'tradeable_entry';
      nextSnapshot.stage = 'watchlist';
      nextSnapshot.status = 'active';
      nextSnapshot.expiresAt = activeExpiryAt || nextSnapshot.expiresAt;
      nextSnapshot.reason = reason || 'Near entry - monitor for trigger.';
    }else if(state === 'watch'){
      nextSnapshot.bucket = 'monitor_watch';
      nextSnapshot.stage = 'watchlist';
      nextSnapshot.status = 'active';
      nextSnapshot.expiresAt = activeExpiryAt || expiryAt || nextSnapshot.expiresAt;
      nextSnapshot.reason = reason || globalVerdict.reason || 'Watch setup - keep tracking.';
    }else{
      nextSnapshot.bucket = 'monitor_watch';
      nextSnapshot.stage = 'watchlist';
      nextSnapshot.status = 'active';
      nextSnapshot.expiresAt = activeExpiryAt || expiryAt || nextSnapshot.expiresAt;
      nextSnapshot.reason = reason || globalVerdict.reason || 'Needs confirmation before it can be acted on.';
    }

    nextSnapshot.rank = deps.watchlistLifecycleStateRank(nextSnapshot.state);
    return nextSnapshot;
  }

  global.WatchlistLifecyclePresentation = {
    applyLifecycleStatePresentation
  };
})(window);
