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
      const onRequestDispatched = typeof options.onRequestDispatched === 'function' ? options.onRequestDispatched : (() => {});
      const onResponseHeaders = typeof options.onResponseHeaders === 'function' ? options.onResponseHeaders : (() => {});
      const onResponseTextReceived = typeof options.onResponseTextReceived === 'function' ? options.onResponseTextReceived : (() => {});
      const onJsonParseStart = typeof options.onJsonParseStart === 'function' ? options.onJsonParseStart : (() => {});
      const onJsonParseSuccess = typeof options.onJsonParseSuccess === 'function' ? options.onJsonParseSuccess : (() => {});
      const onJsonParseFailed = typeof options.onJsonParseFailed === 'function' ? options.onJsonParseFailed : (() => {});
      const onRequestAborted = typeof options.onRequestAborted === 'function' ? options.onRequestAborted : (() => {});
      const onRequestFailed = typeof options.onRequestFailed === 'function' ? options.onRequestFailed : (() => {});
      const onRequestFinally = typeof options.onRequestFinally === 'function' ? options.onRequestFinally : (() => {});
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
        let terminalOutcome = 'request_failed';
        try{
          onStage('Building analysis...');
          const requestBody = buildRequestBody();
          onRequestDispatched({endpoint, requestBody});
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
            body:JSON.stringify(requestBody)
          });
          onResponseHeaders({
            endpoint,
            response,
            contentType:String(response.headers && typeof response.headers.get === 'function' ? response.headers.get('content-type') || '' : '')
          });
          if(!isRequestCurrent()) return {status:'stale'};
          const responseText = await response.text();
          onResponseTextReceived({endpoint, responseText});
          if(responseText && String(responseText).trim()){
            onJsonParseStart({endpoint});
            try{
              data = JSON.parse(responseText);
              onJsonParseSuccess({endpoint, data});
            }catch(parseError){
              onJsonParseFailed({endpoint, error:parseError, responseText});
              throw new Error('Analysis request returned malformed JSON.');
            }
          }else{
            data = {};
          }
          onApiResponse({endpoint, response, data});
          if(!response.ok) throw new Error(buildErrorMessage(response.status, data, 'Analysis request failed.'));
          onStage('Applying analysis...');
          terminalOutcome = 'ok';
          return {status:'ok', data};
        }catch(error){
          lastFailureData = data && typeof data === 'object' ? data : null;
          const abortReason = String(classifyAbortReason() || '').trim().toLowerCase();
          if(error && error.name === 'AbortError'){
            onRequestAborted({endpoint, error, abortReason});
            lastError = abortReason === 'superseded'
              ? 'Analysis request superseded.'
              : 'The analysis request timed out. Retry the setup.';
            terminalOutcome = abortReason === 'superseded' ? 'aborted_superseded' : 'aborted_timeout';
          }else{
            onRequestFailed({endpoint, error});
            lastError = String(error && error.message || 'Analysis request failed.');
            terminalOutcome = 'request_failed';
          }
          if(abortReason === 'superseded') break;
        }finally{
          if(timer) clearTimeout(timer);
          onRequestFinally({endpoint, terminalOutcome});
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
