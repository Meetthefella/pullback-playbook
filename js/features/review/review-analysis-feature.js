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
      if(!ticker) return;
      if(deps.normalizeTicker(deps.uiState.loadingTicker || '') === ticker) return;
      if(!String(deps.uiState.activeReviewVerdictOverride || '').trim()){
        deps.uiState.activeReviewVerdictOverride = deps.displayStageForRecord(
          deps.getTickerRecord(ticker) || deps.upsertTickerRecord(ticker),
          {includeExecutionDowngrade:false}
        );
      }
      deps.analyseSetup(ticker);
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
