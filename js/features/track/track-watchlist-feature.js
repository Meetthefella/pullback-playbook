(function(global){
  function createTrackWatchlistFeature(deps){
    function perfEnabled(){
      return typeof deps.perfDebugEnabled === 'function' ? deps.perfDebugEnabled() : false;
    }

    function logPerf(event, payload){
      if(typeof deps.logPerf === 'function'){
        deps.logPerf(event, payload || {});
        return;
      }
      if(!perfEnabled()) return;
      console.debug(`[PP_PERF] ${event}`, payload || {});
    }

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
      let fallbackReason = 'unknown';
      const activeTab = typeof deps.activeWorkspaceTab === 'function' ? deps.activeWorkspaceTab() : '';
      const startedAt = typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
      logPerf('watchlist_single_ticker_refresh_requested', {
        ticker:symbol,
        activeTab,
        watchlistDirty:typeof deps.hasWatchlistDirtyRecords === 'function' ? deps.hasWatchlistDirtyRecords() : null,
        trackNeedsFullRender:typeof deps.trackNeedsFullRender === 'function' ? deps.trackNeedsFullRender() : null
      });
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
        logPerf('watchlist_single_ticker_patch_start', {
          ticker:symbol,
          activeTab:typeof deps.activeWorkspaceTab === 'function' ? deps.activeWorkspaceTab() : '',
          reason:placementStable ? 'placement_stable' : 'placement_changed',
          watchlistDirty:typeof deps.hasWatchlistDirtyRecords === 'function' ? deps.hasWatchlistDirtyRecords() : null,
          trackNeedsFullRender:typeof deps.trackNeedsFullRender === 'function' ? deps.trackNeedsFullRender() : null
        });
        if(placementStable){
          const patched = deps.updateWatchlistCardForTicker(symbol);
          if(patched){
            requireFullWatchlistRender = false;
            fallbackReason = '';
            const patchEndedAt = typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
            logPerf('watchlist_single_ticker_patch_end', {
              ticker:symbol,
              activeTab:typeof deps.activeWorkspaceTab === 'function' ? deps.activeWorkspaceTab() : '',
              durationMs:Number((patchEndedAt - startedAt).toFixed(1)),
              reason:'patched'
            });
          }else{
            requireFullWatchlistRender = true;
            fallbackReason = 'patch_target_missing';
          }
        }else{
          requireFullWatchlistRender = true;
          fallbackReason = 'placement_changed';
        }
      }finally{
        deps.setManualWatchlistRefreshInProgress(symbol, false);
        if(requireFullWatchlistRender){
          logPerf('watchlist_single_ticker_patch_fallback_full', {
            ticker:symbol,
            activeTab:typeof deps.activeWorkspaceTab === 'function' ? deps.activeWorkspaceTab() : '',
            fallbackReason,
            watchlistDirty:typeof deps.hasWatchlistDirtyRecords === 'function' ? deps.hasWatchlistDirtyRecords() : null,
            trackNeedsFullRender:typeof deps.trackNeedsFullRender === 'function' ? deps.trackNeedsFullRender() : null
          });
          if(typeof deps.activeWorkspaceTab === 'function' && deps.activeWorkspaceTab() === 'track'){
            if(typeof deps.renderWatchlistChunked === 'function' && typeof deps.prepareWatchlistRenderModel === 'function'){
              deps.renderWatchlistChunked({
                source:'watchlist_single_ticker_patch_fallback_full',
                model:deps.prepareWatchlistRenderModel('watchlist_single_ticker_patch_fallback_full', {
                  lightweight:true
                })
              }).catch(() => {
                deps.requestWatchlistRender({
                  includeFocusQueue:true,
                  source:'watchlist_single_ticker_patch_fallback_full'
                });
              }).finally(() => {
                deps.setWatchlistCardRefreshButtonState(symbol, false);
              });
            }else{
              deps.requestWatchlistRender({
                includeFocusQueue:true,
                source:'watchlist_single_ticker_patch_fallback_full'
              });
            }
          }else{
            deps.requestWatchlistRender({
              includeFocusQueue:true,
              source:'watchlist_single_ticker_patch_fallback_full_hidden'
            });
            deps.setWatchlistCardRefreshButtonState(symbol, false);
          }
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
