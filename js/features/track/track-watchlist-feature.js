(function(global){
  function createTrackWatchlistFeature(deps){
    async function refreshTicker(ticker){
      const symbol = deps.normalizeTicker(ticker);
      if(!symbol) return;
      if(deps.isManualWatchlistRefreshInProgress(symbol)){
        deps.setStatus('scannerSelectionStatus', '<span class="warntext">Refresh already running...</span>');
        return;
      }
      const beforeRecord = deps.getTickerRecord(symbol);
      const beforePlacement = beforeRecord ? deps.watchlistPlacementSnapshot(beforeRecord) : null;
      let requireFullWatchlistRender = true;
      deps.setManualWatchlistRefreshInProgress(symbol, true);
      deps.setWatchlistCardRefreshButtonState(symbol, true);
      try{
        deps.setStatus('scannerSelectionStatus', `Refreshing ${deps.escapeHtml(symbol)}...`);
        const result = await deps.refreshWatchlistRecordFromSourceOfTruth(symbol, {
          source:'manual_refresh',
          clearReviewOverride:true
        });
        if(result.ok){
          deps.setStatus('scannerSelectionStatus', `<span class="ok">${deps.escapeHtml(symbol)} refreshed from saved market data.</span>`);
        }else{
          deps.setStatus('scannerSelectionStatus', `<span class="warntext">Could not refresh ${deps.escapeHtml(symbol)} right now. Kept the watchlist entry active locally.</span>`);
        }
        deps.commitTickerState({syncTracked:false});
        deps.requeueTickerForToday(symbol);
        deps.renderScannerResults();
        deps.renderCards();
        if(deps.activeReviewTicker() === symbol) deps.renderReviewWorkspace();
        if(result.ok){
          deps.requestTrackedStatePersist({
            reason:'manual_watchlist_refresh',
            delayMs:350
          });
        }
        const afterRecord = deps.getTickerRecord(symbol);
        const afterPlacement = afterRecord ? deps.watchlistPlacementSnapshot(afterRecord) : null;
        const placementStable = !!(
          beforePlacement
          && afterPlacement
          && beforePlacement.visible === afterPlacement.visible
          && beforePlacement.bucket === afterPlacement.bucket
          && beforePlacement.lifecycleRank === afterPlacement.lifecycleRank
          && beforePlacement.priority === afterPlacement.priority
        );
        if(placementStable){
          requireFullWatchlistRender = !deps.updateWatchlistCardForTicker(symbol);
        }else{
          requireFullWatchlistRender = true;
        }
      }finally{
        deps.setManualWatchlistRefreshInProgress(symbol, false);
        if(requireFullWatchlistRender){
          deps.requestWatchlistRender({includeFocusQueue:true});
        }else{
          deps.renderFocusQueue();
          deps.setWatchlistCardRefreshButtonState(symbol, false);
        }
      }
    }

    return {
      refreshTicker
    };
  }

  global.TrackWatchlistFeature = Object.assign({}, global.TrackWatchlistFeature, {
    createTrackWatchlistFeature
  });
})(window);
