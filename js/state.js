(function(global){
  function createAppState(options = {}){
    const safeJsonParse = options.safeJsonParse || ((value, fallback) => {
      try{
        const parsed = JSON.parse(value);
        return parsed == null ? fallback : parsed;
      }catch(error){
        return fallback;
      }
    });
    const defaultState = options.defaultState && typeof options.defaultState === 'object'
      ? options.defaultState
      : {};
    const state = safeJsonParse(JSON.stringify(defaultState), defaultState);
    const uiState = {
      promptOpen:{},
      responseOpen:{},
      secondaryUiTicker:'',
      secondaryUiMode:null,
      loadingTicker:'',
      selectedScanner:{},
      activeReviewTicker:'',
      activeReviewAddsToScannerUniverse:true,
      activeReviewVerdictOverride:'',
      scannerSessionTickers:[],
      scannerLastScanAt:'',
      scannerSessionId:'',
      controlStripPanel:'',
      scannerShortlistSuppressed:false,
      watchlistLifecycleRunning:false,
      watchlistLifecycleLastRunAt:'',
      watchlistLifecycleLastSource:'',
      watchlistLifecyclePendingSource:'',
      runtimeDebugEntries:[],
      runtimeDebugContext:'',
      scannerCardClickTrace:{}
    };
    return {state, uiState};
  }

  global.AppStateBridge = Object.assign({}, global.AppStateBridge, {
    createAppState
  });
})(window);
