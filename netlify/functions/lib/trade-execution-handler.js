const corsHeaders = {
  'Content-Type':'application/json',
  'Cache-Control':'no-store',
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'Content-Type, x-pp-auth, x-trading212-paper-api-key, x-trading212-paper-api-secret',
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
      clientOrderId:body.clientOrderId,
      note:body.note
    } : {});
  const symbol = String(request.symbol || '').trim().toUpperCase();
  const quantity = numberOrNull(request.quantity);
  const limitPrice = numberOrNull(request.limitPrice);
  const stopLoss = numberOrNull(request.stopLoss);
  const takeProfit = numberOrNull(request.takeProfit);
  const clientOrderId = String(request.clientOrderId || `pbp-${Date.now()}`);
  const note = String(request.note || '').trim();
  const signedQuantity = Number.isFinite(quantity)
    ? (String(request.side || '').trim().toUpperCase() === 'SELL'
      ? -Math.abs(quantity)
      : quantity)
    : quantity;
  return {request, symbol, quantity:signedQuantity, limitPrice, stopLoss, takeProfit, clientOrderId, note};
}

const TRADING212_PAPER_BASE_URL_ALLOWLIST = Object.freeze([
  'https://demo.trading212.com'
]);
const TRADING212_PAPER_ORDER_PATH_ALLOWLIST = Object.freeze([
  '/api/v0/equity/orders/limit'
]);
const TRADING212_PAPER_READINESS_PATH = '/api/v0/equity/account/summary';

function allowlistedTrading212PaperBaseUrl(env = process.env){
  const configured = String(env.T212_PAPER_BASE_URL || '').trim().replace(/\/$/, '');
  if(configured && TRADING212_PAPER_BASE_URL_ALLOWLIST.includes(configured)) return configured;
  return TRADING212_PAPER_BASE_URL_ALLOWLIST[0];
}

function allowlistedTrading212PaperOrderPath(env = process.env){
  const configured = String(env.T212_PAPER_ORDER_PATH || '').trim();
  if(configured && TRADING212_PAPER_ORDER_PATH_ALLOWLIST.includes(configured)) return configured;
  return TRADING212_PAPER_ORDER_PATH_ALLOWLIST[0];
}

function rejectClientCredentialOverrides(body = {}){
  const credentials = body && body.credentials && typeof body.credentials === 'object' ? body.credentials : null;
  if(!credentials) return null;
  if(credentials.apiKey != null){
    return jsonResponse(400, {code:'invalid_request', error:'Client credentials.apiKey is not allowed.'});
  }
  if(credentials.apiSecret != null){
    return jsonResponse(400, {code:'invalid_request', error:'Client credentials.apiSecret is not allowed.'});
  }
  if(credentials.baseUrl != null){
    return jsonResponse(400, {code:'invalid_request', error:'Client credentials.baseUrl override is not allowed.'});
  }
  if(credentials.orderPath != null){
    return jsonResponse(400, {code:'invalid_request', error:'Client credentials.orderPath override is not allowed.'});
  }
  return null;
}

function trading212PaperRuntimeConfig(event = {}, env = process.env){
  const headers = event && event.headers && typeof event.headers === 'object' ? event.headers : {};
  const apiKey = String(
    headers['x-trading212-paper-api-key']
    || headers['X-TRADING212-PAPER-API-KEY']
    || env.T212_PAPER_API_KEY
    || ''
  ).trim();
  const apiSecret = String(
    headers['x-trading212-paper-api-secret']
    || headers['X-TRADING212-PAPER-API-SECRET']
    || env.T212_PAPER_API_SECRET
    || ''
  ).trim();
  const baseUrl = allowlistedTrading212PaperBaseUrl(env);
  const orderPath = allowlistedTrading212PaperOrderPath(env);
  return {apiKey, apiSecret, baseUrl, orderPath};
}

function trading212BasicAuthHeader(apiKey, apiSecret){
  return `Basic ${Buffer.from(`${apiKey}:${apiSecret}`, 'utf8').toString('base64')}`;
}

async function probeTrading212PaperConnection(event = {}, env = process.env){
  const {apiKey, apiSecret, baseUrl} = trading212PaperRuntimeConfig(event, env);
  if(!apiKey || !apiSecret){
    return {ok:false, statusCode:503, code:'paper_trade_not_configured', message:'Trading 212 paper trading needs a tester paper API key and API secret.'};
  }
  const readinessUrl = `${baseUrl.replace(/\/$/, '')}${TRADING212_PAPER_READINESS_PATH}`;
  try{
    const upstream = await fetch(readinessUrl, {
      method:'GET',
      headers:{
        Authorization:trading212BasicAuthHeader(apiKey, apiSecret)
      }
    });
    const data = await upstream.json().catch(() => ({}));
    if(!upstream.ok){
      return {
        ok:false,
        statusCode:upstream.status || 502,
        code:String(data && data.code || (upstream.status === 401 ? 'paper_trade_auth_failed' : 'paper_trade_probe_failed')),
        message:String(data && (data.error || data.message) || (upstream.status === 401 ? 'Trading 212 paper credentials were rejected.' : 'Trading 212 paper readiness probe failed.'))
      };
    }
    return {
      ok:true,
      statusCode:200,
      status:'ready',
      message:'Trading 212 paper trading is ready.',
      source:String(process.env.T212_PAPER_API_KEY || '').trim() ? 'server_or_local_ready' : 'local_key_ready',
      raw:data
    };
  }catch(_error){
    return {
      ok:false,
      statusCode:502,
      code:'paper_trade_unreachable',
      message:'Trading 212 paper service is currently unavailable.'
    };
  }
}

async function submitTrading212PaperOrder(body = {}, env = process.env, event = {}){
  const overrideFailure = rejectClientCredentialOverrides(body);
  if(overrideFailure) return overrideFailure;
  const {symbol, quantity, limitPrice, stopLoss, takeProfit, clientOrderId, note} = buildTrading212PaperRequest(body);
  const mockRequested = body && body.mock === true;
  const envMock = String(env.T212_PAPER_MOCK || '').trim().toLowerCase() === 'true';

  if(!symbol){
    return jsonResponse(400, {code:'invalid_request', error:'Ticker is required.'});
  }
  if(!Number.isFinite(quantity) || quantity === 0){
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
        side:quantity < 0 ? 'SELL' : 'BUY',
        quantity:Math.trunc(quantity),
        price:limitPrice,
        stopLoss,
        takeProfit,
        note,
        broker:'trading212',
        mode:'paper'
      }
    });
  }

  const {apiKey, apiSecret, baseUrl, orderPath} = trading212PaperRuntimeConfig(event, env);

  if(!apiKey || !apiSecret){
    return jsonResponse(503, {
      code:'paper_trade_not_configured',
      error:'Trading 212 paper trading needs a tester paper API key and API secret.'
    });
  }

  const upstreamUrl = `${baseUrl.replace(/\/$/, '')}${orderPath.startsWith('/') ? orderPath : `/${orderPath}`}`;
  const upstreamBody = {
    instrument:symbol,
    quantity:Number.isInteger(quantity) ? quantity : Number(quantity.toFixed(6)),
    limitPrice,
    stopLoss,
    takeProfit
  };

  try{
    const upstream = await fetch(upstreamUrl, {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        Authorization:trading212BasicAuthHeader(apiKey, apiSecret)
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
        side:quantity < 0 ? 'SELL' : 'BUY',
        quantity:Number.isInteger(quantity) ? quantity : Number(quantity.toFixed(6)),
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
  const overrideFailure = rejectClientCredentialOverrides(body);
  if(overrideFailure) return overrideFailure;

  if(action === 'test_connection'){
    if(broker !== 'trading212'){
      return jsonResponse(400, {code:'unsupported_broker', error:`Unsupported broker: ${broker || 'unknown'}.`});
    }
    const mockEnabled = String(process.env.T212_PAPER_MOCK || '').trim().toLowerCase() === 'true';
    if(mockEnabled){
      return jsonResponse(200, {ok:true, status:'mock_ready', message:'Trading 212 paper mock mode is enabled.'});
    }
    const probe = await probeTrading212PaperConnection(event, process.env);
    if(probe.ok === true){
      return jsonResponse(200, {ok:true, status:String(probe.status || 'ready'), message:String(probe.message || 'Trading 212 paper trading is ready.'), source:String(probe.source || 'local_key_ready')});
    }
    return jsonResponse(Number(probe.statusCode || 502), {code:String(probe.code || 'paper_trade_probe_failed'), error:String(probe.message || 'Trading 212 paper readiness probe failed.')});
  }

  if(action !== 'submit_order'){
    return jsonResponse(400, {code:'unsupported_action', error:`Unsupported action: ${action || 'unknown'}.`});
  }
  if(broker !== 'trading212'){
    return jsonResponse(400, {code:'unsupported_broker', error:`Unsupported broker: ${broker || 'unknown'}.`});
  }
  return submitTrading212PaperOrder(body, process.env, event);
}

module.exports = {
  corsHeaders,
  jsonResponse,
  handleTradeExecution,
  submitTrading212PaperOrder,
  probeTrading212PaperConnection,
  trading212BasicAuthHeader,
  trading212PaperRuntimeConfig,
  allowlistedTrading212PaperBaseUrl,
  allowlistedTrading212PaperOrderPath,
  rejectClientCredentialOverrides
};
