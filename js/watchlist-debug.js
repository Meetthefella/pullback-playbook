(function(global){
  // Watchlist debug helpers extracted from app.js.
  function appendWatchlistDebugEvent(record, event){
    if(!record || !record.watchlist || typeof record.watchlist !== 'object') return;
    record.watchlist.debug = record.watchlist.debug && typeof record.watchlist.debug === 'object' ? record.watchlist.debug : {};
    const nextEvent = {
      at:String(event && event.at || new Date().toISOString()),
      source:String(event && event.source || ''),
      result:String(event && event.result || '')
    };
    const trail = Array.isArray(record.watchlist.debug.auditTrail) ? record.watchlist.debug.auditTrail : [];
    const latest = trail[0];
    const timestampDeltaMs = Math.abs(Date.parse(nextEvent.at) - Date.parse(String(latest && latest.at || '')));
    const dedupeUnchanged = latest
      && latest.source === nextEvent.source
      && latest.result === nextEvent.result
      && /^unchanged:/i.test(nextEvent.result)
      && ['auto_recompute','manual_refresh'].includes(nextEvent.source)
      && Number.isFinite(timestampDeltaMs)
      && timestampDeltaMs < 60000;
    if(dedupeUnchanged) return;
    record.watchlist.debug.auditTrail = [nextEvent, ...trail].slice(0, 5);
  }

  global.WatchlistDebug = {
    appendWatchlistDebugEvent
  };
})(window);
