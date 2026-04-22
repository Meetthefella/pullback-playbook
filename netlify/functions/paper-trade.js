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

exports.handler = async function handler(event){
  if(event.httpMethod === 'OPTIONS'){
    return jsonResponse(200, {ok:true});
  }
  if(event.httpMethod !== 'POST'){
    return jsonResponse(405, {code:'method_not_allowed', error:'Method not allowed.'});
  }

  const requireAuth = String(process.env.PAPER_TRADE_REQUIRE_AUTH || '').trim().toLowerCase() === 'true';
  const expectedSecret = String(process.env.PAPER_TRADE_SECRET || '').trim();
  const providedSecret = String(
    (event.headers && (event.headers['x-pp-auth'] || event.headers['X-PP-AUTH']))
    || ''
  ).trim();
  if(requireAuth && expectedSecret && providedSecret !== expectedSecret){
    return jsonResponse(401, {code:'unauthorized', error:'Unauthorized'});
  }

  let body = {};
  try{
    body = JSON.parse(event.body || '{}');
  }catch(error){
    return jsonResponse(400, {code:'invalid_json', error:'Invalid JSON body.'});
  }

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
  const mockRequested = body && body.mock === true;
  const envMock = String(process.env.T212_PAPER_MOCK || '').trim().toLowerCase() === 'true';

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
        note
      }
    });
  }

  const apiKey = String(process.env.T212_PAPER_API_KEY || '').trim();
  const baseUrl = String(process.env.T212_PAPER_BASE_URL || '').trim();
  const orderPath = String(process.env.T212_PAPER_ORDER_PATH || '/orders').trim();

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
        raw:data
      }
    });
  }catch(error){
    return jsonResponse(502, {
      code:'paper_trade_unreachable',
      error:'Paper trade service is currently unavailable.'
    });
  }
};
