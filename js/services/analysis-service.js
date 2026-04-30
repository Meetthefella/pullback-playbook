(function(global){
  function createAnalysisService(){
    async function requestAnalysisFromEndpoints(options = {}){
      const endpoints = Array.isArray(options.endpoints) ? options.endpoints.filter(Boolean) : [];
      const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Math.max(1000, Number(options.timeoutMs)) : 45000;
      const controller = options.controller;
      const isRequestCurrent = typeof options.isRequestCurrent === 'function' ? options.isRequestCurrent : (() => true);
      const buildRequestBody = typeof options.buildRequestBody === 'function' ? options.buildRequestBody : (() => ({}));
      const classifyAbortReason = typeof options.classifyAbortReason === 'function' ? options.classifyAbortReason : (() => '');
      const onStage = typeof options.onStage === 'function' ? options.onStage : (() => {});
      const onApiResponse = typeof options.onApiResponse === 'function' ? options.onApiResponse : (() => {});
      const buildErrorMessage = typeof options.buildErrorMessage === 'function'
        ? options.buildErrorMessage
        : ((status, data, fallback) => fallback || `Request failed (${status}).`);

      if(!endpoints.length){
        return {status:'error', errorMessage:'Analysis request failed.', lastFailureData:null};
      }

      let lastFailureData = null;
      let lastError = 'Analysis request failed.';

      for(const endpoint of endpoints){
        let timer = null;
        let data = {};
        try{
          onStage('Building analysis...');
          timer = setTimeout(() => {
            if(!isRequestCurrent()) return;
            if(controller && controller.signal && !controller.signal.aborted){
              try{
                controller.abort('timeout');
              }catch(error){}
            }
          }, timeoutMs);
          const response = await fetch(endpoint, {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            signal:controller && controller.signal ? controller.signal : undefined,
            body:JSON.stringify(buildRequestBody())
          });
          if(!isRequestCurrent()) return {status:'stale'};
          data = await response.json().catch(() => ({}));
          onApiResponse({endpoint, response, data});
          if(!response.ok) throw new Error(buildErrorMessage(response.status, data, 'Analysis request failed.'));
          onStage('Applying analysis...');
          return {status:'ok', data};
        }catch(error){
          lastFailureData = data && typeof data === 'object' ? data : null;
          const abortReason = String(classifyAbortReason() || '').trim().toLowerCase();
          if(error && error.name === 'AbortError'){
            lastError = abortReason === 'superseded'
              ? 'Analysis request superseded.'
              : 'The analysis request timed out. Retry the setup.';
          }else{
            lastError = String(error && error.message || 'Analysis request failed.');
          }
          if(abortReason === 'superseded') break;
        }finally{
          if(timer) clearTimeout(timer);
        }
      }

      return {status:'error', errorMessage:lastError, lastFailureData};
    }

    return {
      requestAnalysisFromEndpoints
    };
  }

  global.AnalysisService = Object.assign({}, global.AnalysisService, {
    createAnalysisService
  });
})(window);
