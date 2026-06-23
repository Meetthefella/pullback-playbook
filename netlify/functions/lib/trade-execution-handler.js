const corsHeaders = {
  'Content-Type':'application/json',
  'Cache-Control':'no-store',
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'Content-Type, x-pp-auth',
  'Access-Control-Allow-Methods':'POST, OPTIONS'
};

function jsonResponse(statusCode, body){
  return {
    statusCode,
    headers:corsHeaders,
    body:JSON.stringify(body)
  };
}

function numberOrNull(value){
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function liveTradingLockedResponse(){
  return jsonResponse(403, {
    code:'live_trading_locked',
    error:'Live trading is locked out. Tester mode is paper trading only.'
  });
}

function normalizeTradeExecutionBody(event){
  let body = {};
  try{
    body = JSON.parse(event.body || '{}');
  }catch(_error){
    return {ok:false, response:jsonResponse(400, {code:'invalid_json', error:'Invalid JSON body.'})};
  }
  return {ok:true, body};
}

function authenticateTradeExecution(event){
  const requireAuth = String(process.env.PAPER_TRADE_REQUIRE_AUTH || '').trim().toLowerCase() === 'true';
  const expectedSecret = String(process.env.PAPER_TRADE_SECRET || '').trim();
  const providedSecret = String(
    (event.headers && (event.headers['x-pp-auth'] || event.headers['X-PP-AUTH']))
    || ''
  ).trim();
  if(requireAuth && expectedSecret && providedSecret !== expectedSecret){
    return jsonResponse(401, {code:'unauthorized', error:'Unauthorized'});
  }
  return null;
}

function buildTrading212PaperRequest(body = {}){
  const request = body && body.request && typeof body.request === 'object'
    ? body.request
    : (body && typeof body === 'object' ? {
      symbol:body.symbol || body.ticker,
      quantity:body.quantity || body.size,
      limitPrice:body.limitPrice || body.entry,
      stopLoss:body.stopLoss || body.stop,
      takeProfit:body.takeProfit || body.target,
      side:body.side,
      clientOrderId:body.clientOrderId,
      note:body.note
    } : {});
  const symbol = String(request.symbol || '').trim().toUpperCase();
  const quantity = numberOrNull(request.quantity);
  const limitPrice = numberOrNull(request.limitPrice);
  const stopLoss = numberOrNull(request.stopLoss);
  const takeProfit = numberOrNull(request.takeProfit);
  const side = String(request.side || 'BUY').trim().toUpperCase() === 'SELL' ? 'SELL' : 'BUY';
  const clientOrderId = String(request.clientOrderId || `pbp-${Date.now()}`);
  const note = String(request.note || '').trim();
  return {request, symbol, quantity, limitPrice, stopLoss, takeProfit, side, clientOrderId, note};
}

async function submitTrading212PaperOrder(body = {}, env = process.env){
  const {symbol, quantity, limitPrice, stopLoss, takeProfit, side, clientOrderId, note} = buildTrading212PaperRequest(body);
  const mockRequested = body && body.mock === true;
  const envMock = String(env.T212_PAPER_MOCK || '').trim().toLowerCase() === 'true';

  if(!symbol){
    return jsonResponse(400, {code:'invalid_request', error:'Ticker is required.'});
  }
  if(!Number.isFinite(quantity) || quantity <= 0){
    return jsonResponse(400, {code:'invalid_request', error:'Quantity is required.'});
  }
  if(!Number.isFinite(limitPrice) || limitPrice <= 0){
    return jsonResponse(400, {code:'invalid_request', error:'Limit price is required.'});
  }

  if(mockRequested || envMock){
    return jsonResponse(200, {
      result:{
        orderId:`mock-${Date.now()}`,
        clientOrderId,
        status:'submitted',
        submittedAt:new Date().toISOString(),
        symbol,
        side,
        quantity:Math.floor(quantity),
        price:limitPrice,
        stopLoss,
        takeProfit,
        note,
        broker:'trading212',
        mode:'paper'
      }
    });
  }

  const apiKey = String(env.T212_PAPER_API_KEY || '').trim();
  const baseUrl = String(env.T212_PAPER_BASE_URL || '').trim();
  const orderPath = String(env.T212_PAPER_ORDER_PATH || '/orders').trim();

  if(!apiKey || !baseUrl){
    return jsonResponse(503, {
      code:'paper_trade_not_configured',
      error:'Trading 212 paper-trade endpoint is not configured on the server.'
    });
  }

  const upstreamUrl = `${baseUrl.replace(/\/$/, '')}${orderPath.startsWith('/') ? orderPath : `/${orderPath}`}`;
  const upstreamBody = {
    instrument:symbol,
    side,
    quantity:Math.floor(quantity),
    orderType:'LIMIT',
    timeInForce:'DAY',
    limitPrice,
    stopLoss,
    takeProfit,
    clientOrderId,
    note
  };

  try{
    const upstream = await fetch(upstreamUrl, {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        Authorization:`Bearer ${apiKey}`
      },
      body:JSON.stringify(upstreamBody)
    });
    const data = await upstream.json().catch(() => ({}));
    if(!upstream.ok){
      return jsonResponse(upstream.status || 502, {
        code:String(data && data.code || 'paper_trade_failed'),
        error:String(data && (data.error || data.message) || 'Paper trade submission failed.')
      });
    }
    return jsonResponse(200, {
      result:{
        orderId:String(data.orderId || data.id || ''),
        clientOrderId:String(data.clientOrderId || clientOrderId || ''),
        status:String(data.status || 'submitted'),
        submittedAt:String(data.submittedAt || data.createdAt || new Date().toISOString()),
        symbol,
        side,
        quantity:Math.floor(quantity),
        price:limitPrice,
        stopLoss,
        takeProfit,
        broker:'trading212',
        mode:'paper',
        raw:data
      }
    });
  }catch(_error){
    return jsonResponse(502, {
      code:'paper_trade_unreachable',
      error:'Paper trade service is currently unavailable.'
    });
  }
}

async function handleTradeExecution(event){
  if(event.httpMethod === 'OPTIONS'){
    return jsonResponse(200, {ok:true});
  }
  if(event.httpMethod !== 'POST'){
    return jsonResponse(405, {code:'method_not_allowed', error:'Method not allowed.'});
  }
  const authFailure = authenticateTradeExecution(event);
  if(authFailure) return authFailure;
  const parsed = normalizeTradeExecutionBody(event);
  if(parsed.ok !== true) return parsed.response;
  const body = parsed.body || {};
  const action = String(body.action || 'submit_order').trim().toLowerCase();
  const broker = String(body.broker || 'trading212').trim().toLowerCase();
  const mode = String(body.mode || 'paper').trim().toLowerCase();

  if(mode !== 'paper') return liveTradingLockedResponse();

  if(action === 'test_connection'){
    if(broker !== 'trading212'){
      return jsonResponse(400, {code:'unsupported_broker', error:`Unsupported broker: ${broker || 'unknown'}.`});
    }
    const configured = !!(String(process.env.T212_PAPER_API_KEY || '').trim() && String(process.env.T212_PAPER_BASE_URL || '').trim());
    const mockEnabled = String(process.env.T212_PAPER_MOCK || '').trim().toLowerCase() === 'true';
    if(mockEnabled){
      return jsonResponse(200, {ok:true, status:'mock_ready', message:'Trading 212 paper mock mode is enabled.'});
    }
    if(configured){
      return jsonResponse(200, {ok:true, status:'ready', message:'Trading 212 paper trading is configured.'});
    }
    return jsonResponse(503, {code:'paper_trade_not_configured', error:'Trading 212 paper trading is not configured on the server.'});
  }

  if(action !== 'submit_order'){
    return jsonResponse(400, {code:'unsupported_action', error:`Unsupported action: ${action || 'unknown'}.`});
  }
  if(broker !== 'trading212'){
    return jsonResponse(400, {code:'unsupported_broker', error:`Unsupported broker: ${broker || 'unknown'}.`});
  }
  return submitTrading212PaperOrder(body, process.env);
}

module.exports = {
  corsHeaders,
  jsonResponse,
  handleTradeExecution,
  submitTrading212PaperOrder
};
