(function(global){
  function createTradingGatewayService(options = {}){
    const defaultEndpoint = String(options.defaultEndpoint || '/api/trade-execution');
    const defaultTimeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Math.max(2000, Number(options.timeoutMs)) : 20000;
    const adapterFactories = options.adapterFactories && typeof options.adapterFactories === 'object'
      ? options.adapterFactories
      : {};
    const adapters = Object.entries(adapterFactories).reduce((map, [brokerId, factory]) => {
      if(typeof factory !== 'function') return map;
      const adapter = factory();
      if(adapter && typeof adapter === 'object') map[String(brokerId)] = adapter;
      return map;
    }, {});

    const capabilities = Object.freeze({
      testerRole:'paper_only',
      paperTradingEnabled:true,
      liveTradingEnabled:false,
      allowedModes:['paper'],
      supportedBrokers:Object.keys(adapters),
      brokerModes:Object.keys(adapters).reduce((map, brokerId) => {
        map[brokerId] = {paper:true, live:false};
        return map;
      }, {})
    });

    function normalizeError(error, fallbackMessage = 'Trade request failed.'){
      const message = String(error && error.message || fallbackMessage).trim() || fallbackMessage;
      const code = String(error && error.code || '').trim() || 'trade_gateway_error';
      return {ok:false, code, message};
    }

    async function postJsonWithTimeout(url, body, timeoutMs, extraHeaders = {}){
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try{
        const response = await fetch(url, {
          method:'POST',
          headers:{'Content-Type':'application/json', ...extraHeaders},
          body:JSON.stringify(body || {}),
          signal:controller.signal
        });
        const data = await response.json().catch(() => ({}));
        return {response, data};
      }finally{
        clearTimeout(timeout);
      }
    }

    function trading212PaperHeaders(options = {}){
      const apiKey = String(
        options.trading212PaperApiKey
        || (typeof window !== 'undefined' && window.__pp && window.__pp.trading212PaperApiKey)
        || ''
      ).trim();
      const apiSecret = String(
        options.trading212PaperApiSecret
        || (typeof window !== 'undefined' && window.__pp && window.__pp.trading212PaperApiSecret)
        || ''
      ).trim();
      const headers = {};
      if(apiKey) headers['x-trading212-paper-api-key'] = apiKey;
      if(apiSecret) headers['x-trading212-paper-api-secret'] = apiSecret;
      return headers;
    }

    function brokerAdapter(brokerId){
      return adapters[String(brokerId || '').trim().toLowerCase()] || null;
    }

    function getCapabilities(){
      return capabilities;
    }

    function liveTradingLockedResult(){
      return normalizeError({
        code:'live_trading_locked',
        message:'Live trading is locked out. Tester mode is paper trading only.'
      });
    }

    async function submitTrade(request = {}, options = {}){
      const broker = String(request.broker || options.broker || 'trading212').trim().toLowerCase();
      const mode = String(request.mode || options.mode || 'paper').trim().toLowerCase();
      if(mode !== 'paper') return liveTradingLockedResult();
      const adapter = brokerAdapter(broker);
      if(!adapter || typeof adapter.buildGatewayPayload !== 'function'){
        return normalizeError({code:'unsupported_broker', message:`Unsupported broker: ${broker || 'unknown'}.`});
      }
      const built = adapter.buildGatewayPayload(request, {mock:options.mock === true});
      if(!built || built.ok !== true) return built || normalizeError({code:'invalid_request', message:'Unable to build trade payload.'});
      const endpoint = String(options.endpoint || defaultEndpoint).trim() || defaultEndpoint;
      const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Math.max(2000, Number(options.timeoutMs)) : defaultTimeoutMs;
      if(options.mock === true || endpoint.toLowerCase().startsWith('mock:')){
        const normalizedRequest = adapter.normalizePaperTradeRequest(request);
        if(!normalizedRequest || normalizedRequest.ok !== true) return normalizedRequest;
        return adapter.normalizePaperTradeResult({
          orderId:`mock-${Date.now()}`,
          clientOrderId:normalizedRequest.request.clientOrderId || `pbp-${Date.now()}`,
          status:'submitted',
          submittedAt:new Date().toISOString(),
          symbol:normalizedRequest.request.symbol,
          side:normalizedRequest.request.side,
          quantity:normalizedRequest.request.quantity,
          price:normalizedRequest.request.limitPrice,
          stopLoss:normalizedRequest.request.stopLoss,
          takeProfit:normalizedRequest.request.takeProfit
        }, normalizedRequest.request);
      }
      try{
        const sharedSecret = String(
          options.sharedSecret
          || (typeof window !== 'undefined' && window.__pp && window.__pp.paperTradeSecret)
          || ''
        );
        const {response, data} = await postJsonWithTimeout(endpoint, built.payload, timeoutMs, {
          'x-pp-auth': sharedSecret,
          ...trading212PaperHeaders(options)
        });
        if(!response.ok){
          return normalizeError({
            code:String(data && data.code || `http_${response.status}`),
            message:String(data && (data.error || data.message) || `Trade request failed (${response.status}).`)
          });
        }
        return adapter.normalizePaperTradeResult(data && (data.result || data), request);
      }catch(error){
        if(error && error.name === 'AbortError'){
          return normalizeError({code:'timeout', message:'Trade request timed out. Please retry.'});
        }
        return normalizeError(error);
      }
    }

    async function submitPaperTrade(request = {}, options = {}){
      return submitTrade({
        ...request,
        broker:String(options.broker || request.broker || 'trading212').trim().toLowerCase(),
        mode:'paper'
      }, {
        ...options,
        mode:'paper'
      });
    }

    async function testConnection(options = {}){
      const endpoint = String(options.endpoint || defaultEndpoint).trim() || defaultEndpoint;
      const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Math.max(2000, Number(options.timeoutMs)) : defaultTimeoutMs;
      const broker = String(options.broker || 'trading212').trim().toLowerCase();
      const mode = String(options.mode || 'paper').trim().toLowerCase();
      if(mode !== 'paper') return liveTradingLockedResult();
      try{
        const sharedSecret = String(
          options.sharedSecret
          || (typeof window !== 'undefined' && window.__pp && window.__pp.paperTradeSecret)
          || ''
        );
        const {response, data} = await postJsonWithTimeout(endpoint, {
          action:'test_connection',
          broker,
          mode
        }, timeoutMs, {
          'x-pp-auth': sharedSecret,
          ...trading212PaperHeaders(options)
        });
        if(!response.ok){
          return normalizeError({
            code:String(data && data.code || `http_${response.status}`),
            message:String(data && (data.error || data.message) || `Connection test failed (${response.status}).`)
          });
        }
        return {
          ok:true,
          broker,
          mode,
          status:String(data && data.status || 'ready'),
          message:String(data && data.message || 'Connection ready.')
        };
      }catch(error){
        if(error && error.name === 'AbortError'){
          return normalizeError({code:'timeout', message:'Connection test timed out. Please retry.'});
        }
        return normalizeError(error, 'Connection test failed.');
      }
    }

    return {
      getCapabilities,
      submitTrade,
      submitPaperTrade,
      testConnection
    };
  }

  global.TradingGatewayService = Object.assign({}, global.TradingGatewayService, {
    createTradingGatewayService
  });
})(window);
