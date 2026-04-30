(function(global){
  function createReviewAnalysisFeature(deps){
    function setLoadingStage(ticker, message){
      const symbol = deps.normalizeTicker(ticker);
      if(!symbol) return;
      deps.uiState.analysisLoadingStageByTicker = deps.uiState.analysisLoadingStageByTicker && typeof deps.uiState.analysisLoadingStageByTicker === 'object'
        ? deps.uiState.analysisLoadingStageByTicker
        : {};
      deps.uiState.analysisLoadingStageByTicker[symbol] = String(message || '').trim() || 'Analysing...';
    }

    function getLoadingStage(ticker){
      const symbol = deps.normalizeTicker(ticker);
      if(!symbol) return '';
      const map = deps.uiState.analysisLoadingStageByTicker && typeof deps.uiState.analysisLoadingStageByTicker === 'object'
        ? deps.uiState.analysisLoadingStageByTicker
        : {};
      return String(map[symbol] || '').trim();
    }

    function clearLoadingStage(ticker){
      const symbol = deps.normalizeTicker(ticker);
      if(!symbol) return;
      if(!deps.uiState.analysisLoadingStageByTicker || typeof deps.uiState.analysisLoadingStageByTicker !== 'object') return;
      delete deps.uiState.analysisLoadingStageByTicker[symbol];
    }

    function analyseActiveReviewTicker(){
      const ticker = deps.activeReviewTicker();
      const symbol = deps.normalizeTicker(ticker);
      const runtime = deps.getReviewAiRuntime ? deps.getReviewAiRuntime() : null;
      const currentRuntimeTicker = deps.normalizeTicker(runtime && runtime.ticker || '');
      const currentRuntimeStatus = String(runtime && runtime.status || '');
      console.debug('[review-analysis] button_click', {
        ticker:symbol || '',
        activeReviewTicker:ticker || '',
        runtimeTicker:currentRuntimeTicker,
        runtimeStatus:currentRuntimeStatus
      });
      if(!symbol){
        console.warn('[review-analysis] blocked_no_ticker');
        return;
      }
      if(currentRuntimeStatus === 'running' && currentRuntimeTicker === symbol){
        const stale = deps.isReviewAiAnalysisStale ? deps.isReviewAiAnalysisStale(symbol) : false;
        if(stale){
          console.warn('[review-analysis] stale_state_cleared', {ticker:symbol});
          if(deps.clearReviewAiAnalysis) deps.clearReviewAiAnalysis(symbol);
          if(deps.uiState.analysisActiveRequest && deps.uiState.analysisActiveRequest.id){
            deps.uiState.analysisActiveRequest = null;
          }
          clearLoadingStage(symbol);
        }else{
          console.warn('[review-analysis] duplicate_running_click_ignored', {ticker:symbol});
          return;
        }
      }
      if(!String(deps.uiState.activeReviewVerdictOverride || '').trim()){
        deps.uiState.activeReviewVerdictOverride = deps.displayStageForRecord(
          deps.getTickerRecord(symbol) || deps.upsertTickerRecord(symbol),
          {includeExecutionDowngrade:false}
        );
      }
      console.debug('[review-analysis] proceed_analysis', {ticker:symbol});
      console.debug('[review-analysis] request_start', {ticker:symbol});
      deps.analyseSetup(symbol);
    }

    return {
      setLoadingStage,
      getLoadingStage,
      clearLoadingStage,
      analyseActiveReviewTicker
    };
  }

  global.ReviewAnalysisFeature = Object.assign({}, global.ReviewAnalysisFeature, {
    createReviewAnalysisFeature
  });
})(window);
