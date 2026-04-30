(function(global){
  function createTrading212Service(options = {}){
    const defaultEndpoint = String(options.defaultEndpoint || '/api/paper-trade');
    const defaultTimeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Math.max(2000, Number(options.timeoutMs)) : 20000;

    function normalizeError(error, fallbackMessage = 'Paper trade submission failed.'){
      const message = String(error && error.message || fallbackMessage).trim() || fallbackMessage;
      const code = String(error && error.code || '').trim() || 'paper_trade_error';
      return {ok:false, code, message};
    }

    function normalizePaperTradeResult(payload = {}, fallback = {}){
      return {
        ok:true,
        broker:'trading212',
        mode:'paper',
        orderId:String(payload.orderId || payload.id || fallback.orderId || ''),
        clientOrderId:String(payload.clientOrderId || payload.client_order_id || fallback.clientOrderId || ''),
        status:String(payload.status || fallback.status || 'submitted'),
        submittedAt:String(payload.submittedAt || payload.submitted_at || fallback.submittedAt || new Date().toISOString()),
        symbol:String(payload.symbol || fallback.symbol || ''),
        side:String(payload.side || fallback.side || 'BUY'),
        quantity:Number.isFinite(Number(payload.quantity)) ? Number(payload.quantity) : (Number.isFinite(Number(fallback.quantity)) ? Number(fallback.quantity) : null),
        price:Number.isFinite(Number(payload.price)) ? Number(payload.price) : (Number.isFinite(Number(fallback.price)) ? Number(fallback.price) : null),
        stopLoss:Number.isFinite(Number(payload.stopLoss)) ? Number(payload.stopLoss) : (Number.isFinite(Number(fallback.stopLoss)) ? Number(fallback.stopLoss) : null),
        takeProfit:Number.isFinite(Number(payload.takeProfit)) ? Number(payload.takeProfit) : (Number.isFinite(Number(fallback.takeProfit)) ? Number(fallback.takeProfit) : null),
        raw:payload
      };
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

    async function submitPaperTrade(request = {}, options = {}){
      const endpoint = String(options.endpoint || defaultEndpoint).trim() || defaultEndpoint;
      const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Math.max(2000, Number(options.timeoutMs)) : defaultTimeoutMs;
      const payload = request && typeof request === 'object' ? request : {};
      const symbol = String(payload.symbol || payload.ticker || '').trim().toUpperCase();
      const side = String(payload.side || 'BUY').trim().toUpperCase();
      const quantity = Number(payload.quantity);
      const limitPrice = Number(payload.limitPrice);
      const stopLoss = Number(payload.stopLoss);
      const takeProfit = Number(payload.takeProfit);
      const clientOrderId = String(payload.clientOrderId || '').trim();

      if(!symbol) return normalizeError({code:'invalid_request', message:'Ticker is required for paper trade.'});
      if(!Number.isFinite(quantity) || quantity <= 0) return normalizeError({code:'invalid_request', message:'Valid quantity is required for paper trade.'});
      if(!Number.isFinite(limitPrice) || limitPrice <= 0) return normalizeError({code:'invalid_request', message:'Valid entry price is required for paper trade.'});

      const normalizedRequest = {
        mode:'paper',
        symbol,
        side:side === 'SELL' ? 'SELL' : 'BUY',
        quantity:Math.max(1, Math.floor(quantity)),
        limitPrice,
        stopLoss:Number.isFinite(stopLoss) ? stopLoss : null,
        takeProfit:Number.isFinite(takeProfit) ? takeProfit : null,
        orderType:'LIMIT',
        timeInForce:'DAY',
        clientOrderId,
        note:String(payload.note || '').trim()
      };

      const useMock = options.mock === true || payload.mock === true || endpoint.toLowerCase().startsWith('mock:');
      if(useMock){
        return normalizePaperTradeResult({
          orderId:`mock-${Date.now()}`,
          clientOrderId:normalizedRequest.clientOrderId || `pbp-${Date.now()}`,
          status:'submitted',
          submittedAt:new Date().toISOString(),
          symbol:normalizedRequest.symbol,
          side:normalizedRequest.side,
          quantity:normalizedRequest.quantity,
          price:normalizedRequest.limitPrice,
          stopLoss:normalizedRequest.stopLoss,
          takeProfit:normalizedRequest.takeProfit
        }, normalizedRequest);
      }

      try{
        const sharedSecret = String(
          options.sharedSecret
          || (typeof window !== 'undefined' && window.__pp && window.__pp.paperTradeSecret)
          || ''
        );
        const {response, data} = await postJsonWithTimeout(
          endpoint,
          {paper:true, request:normalizedRequest},
          timeoutMs,
          {'x-pp-auth': sharedSecret}
        );
        if(!response.ok){
          return normalizeError({
            code:String(data && data.code || `http_${response.status}`),
            message:String(data && data.error || data && data.message || `Paper trade submission failed (${response.status}).`)
          });
        }
        return normalizePaperTradeResult(data && (data.result || data), normalizedRequest);
      }catch(error){
        if(error && error.name === 'AbortError'){
          return normalizeError({code:'timeout', message:'Paper trade request timed out. Please retry.'});
        }
        return normalizeError(error);
      }
    }

    return {
      submitPaperTrade
    };
  }

  global.Trading212Service = Object.assign({}, global.Trading212Service, {
    createTrading212Service
  });
})(window);
