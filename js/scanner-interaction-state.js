(function(){
  function suppressNextScannerActivation(ticker, deps){
    const {normalizeTicker, uiState} = deps;
    const symbol = normalizeTicker(ticker);
    if(!symbol) return;
    uiState.scanCardMenuGuard = uiState.scanCardMenuGuard || {};
    uiState.scanCardMenuGuard[symbol] = Date.now();
  }

  function allowScannerActivation(ticker, deps){
    const {normalizeTicker, uiState} = deps;
    const symbol = normalizeTicker(ticker);
    if(!symbol) return true;
    const guard = uiState.scanCardMenuGuard && uiState.scanCardMenuGuard[symbol];
    if(!guard) return true;
    if(Date.now() - guard > 1200){
      delete uiState.scanCardMenuGuard[symbol];
      return true;
    }
    delete uiState.scanCardMenuGuard[symbol];
    return false;
  }

  function setScannerCardClickTrace(ticker, stage, detail = '', deps){
    const {
      normalizeTicker,
      uiState,
      activeReviewTicker
    } = deps;
    const symbol = normalizeTicker(ticker);
    if(!symbol) return;
    const entry = {
      at:new Date().toISOString(),
      stage:String(stage || '').trim() || 'unknown',
      detail:String(detail || '').trim(),
      activeReviewTicker:activeReviewTicker() || ''
    };
    uiState.scannerCardClickTrace[symbol] = entry;
    const existingHistory = Array.isArray(uiState.scannerCardClickTraceHistory[symbol])
      ? uiState.scannerCardClickTraceHistory[symbol]
      : [];
    uiState.scannerCardClickTraceHistory[symbol] = [...existingHistory, entry].slice(-10);
  }

  function scannerCardClickTraceForTicker(ticker, deps){
    const {normalizeTicker, uiState} = deps;
    const symbol = normalizeTicker(ticker);
    if(!symbol) return null;
    return uiState.scannerCardClickTrace[symbol] || null;
  }

  function scannerCardClickTraceHistoryForTicker(ticker, deps){
    const {normalizeTicker, uiState} = deps;
    const symbol = normalizeTicker(ticker);
    if(!symbol) return [];
    return Array.isArray(uiState.scannerCardClickTraceHistory[symbol])
      ? uiState.scannerCardClickTraceHistory[symbol]
      : [];
  }

  function setSwipeFeedback(ticker, info, deps){
    const {normalizeTicker, uiState} = deps;
    const symbol = normalizeTicker(ticker);
    if(!symbol) return;
    uiState.swipeFeedback = uiState.swipeFeedback || {};
    if(!info){
      delete uiState.swipeFeedback[symbol];
      return;
    }
    uiState.swipeFeedback[symbol] = {
      ...info,
      at:new Date().toISOString()
    };
  }

  function getSwipeFeedback(ticker, deps){
    const {normalizeTicker, uiState} = deps;
    const symbol = normalizeTicker(ticker);
    if(!symbol) return null;
    return uiState.swipeFeedback && uiState.swipeFeedback[symbol]
      ? uiState.swipeFeedback[symbol]
      : null;
  }

  function recordGestureDebug(ticker, note, deps){
    const {
      normalizeTicker,
      uiState,
      scannerCardClickTraceHistoryForTicker,
      activeReviewTicker
    } = deps;
    const symbol = normalizeTicker(ticker);
    if(!symbol || !note) return;
    const entry = {
      at:new Date().toISOString(),
      stage:'gesture',
      detail:String(note),
      activeReviewTicker:activeReviewTicker() || ''
    };
    const existing = scannerCardClickTraceHistoryForTicker(symbol);
    uiState.scannerCardClickTrace[symbol] = entry;
    uiState.scannerCardClickTraceHistory[symbol] = [...existing, entry].slice(-10);
  }

  window.ScannerInteractionState = {
    suppressNextScannerActivation,
    allowScannerActivation,
    setScannerCardClickTrace,
    scannerCardClickTraceForTicker,
    scannerCardClickTraceHistoryForTicker,
    setSwipeFeedback,
    getSwipeFeedback,
    recordGestureDebug
  };
})();
