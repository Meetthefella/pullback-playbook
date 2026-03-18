const {baseNormalizedSnapshot} = require('./lib/market-normalizers');
const {getProviderConfig, normalizePlanId, normalizeProviderId} = require('./lib/scan-config');
const fmpProvider = require('./lib/providers/fmp');
const marketDataProvider = require('./lib/providers/marketdata');

const corsHeaders = {
  'Content-Type':'application/json',
  'Cache-Control':'no-store',
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'Content-Type',
  'Access-Control-Allow-Methods':'GET, OPTIONS'
};

const PROVIDERS = {
  fmp:fmpProvider,
  marketdata:marketDataProvider
};

function jsonResponse(statusCode, body){
  return {
    statusCode,
    headers:corsHeaders,
    body:JSON.stringify(body)
  };
}

function logEndpointEvent(level, details){
  const payload = {
    provider:details.provider || '',
    endpoint:details.endpoint || '',
    symbol:details.symbol || '',
    source:details.source || '',
    outcome:details.outcome || '',
    status:details.status || null,
    reason:details.reason || ''
  };
  const line = `[market-data] ${JSON.stringify(payload)}`;
  if(level === 'error') console.error(line);
  else console.log(line);
}

function requestedTickerCount(params){
  const raw = [
    params.symbol,
    params.ticker,
    params.symbols,
    params.tickers
  ].map(value => String(value || '').trim()).filter(Boolean).join(',');
  if(!raw) return 0;
  return [...new Set(raw.split(/[\s,]+/).map(item => String(item || '').trim().toUpperCase()).filter(Boolean))].length;
}

function providerApiKey(providerId){
  if(providerId === 'fmp') return process.env.FMP_API_KEY;
  if(providerId === 'marketdata') return process.env.MARKETDATA_API_KEY || process.env.MARKETDATA_TOKEN;
  return '';
}

function providerNotConfiguredMessage(providerConfig){
  if(providerConfig.id === 'marketdata'){
    return 'MarketData.app is not configured on the server yet. Set MARKETDATA_API_KEY or MARKETDATA_TOKEN.';
  }
  return `${providerConfig.label} is not configured on the server.`;
}

function getProviderAdapter(providerId){
  return PROVIDERS[providerId] || PROVIDERS.fmp;
}

function baseResponsePayload(symbol, providerId){
  const snapshot = baseNormalizedSnapshot(symbol, providerId);
  return {
    ...snapshot,
    dataProvider:providerId
  };
}

exports.handler = async function handler(event){
  if(event.httpMethod === 'OPTIONS') return jsonResponse(200, {ok:true});
  if(event.httpMethod !== 'GET') return jsonResponse(405, {error:'Method not allowed'});

  const params = event.queryStringParameters || {};
  const providerId = normalizeProviderId(params.provider);
  const planId = normalizePlanId(providerId, params.plan);
  const providerConfig = getProviderConfig(providerId, planId);
  const adapter = getProviderAdapter(providerConfig.id);
  const apiKey = providerApiKey(providerConfig.id);
  const mode = String(params.mode || '').trim().toLowerCase();
  const symbol = String(params.symbol || params.ticker || '').trim().toUpperCase();
  const query = String(params.query || params.q || '').trim();

  if(!apiKey){
    return jsonResponse(500, {ok:false, error:providerNotConfiguredMessage(providerConfig)});
  }

  if(Number.isFinite(providerConfig.planConfig.maxScanTickers) && requestedTickerCount(params) > providerConfig.planConfig.maxScanTickers){
    return jsonResponse(400, {
      error:`Maximum ${providerConfig.planConfig.maxScanTickers} tickers per scan for ${providerConfig.label}`
    });
  }

  try{
    if(mode === 'search' || query){
      if(query.length < 1) return jsonResponse(400, {error:'Missing search query.'});
      if(!providerConfig.planConfig.supportsSearch){
        return jsonResponse(200, {ok:false, error:`${providerConfig.label} symbol search is not available yet.`, results:[]});
      }
      const results = await adapter.searchSymbols(query, {
        apiKey,
        providerConfig,
        log:(level, details) => logEndpointEvent(level, {...details, provider:providerConfig.id})
      });
      return jsonResponse(200, {
        ok:true,
        error:null,
        provider:providerConfig.id,
        providerLabel:providerConfig.label,
        results
      });
    }

    if(!symbol) return jsonResponse(400, {error:'Missing symbol.'});
    if(!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)){
      return jsonResponse(400, {
        ok:false,
        error:'Invalid ticker symbol format.',
        data:baseResponsePayload(symbol, providerConfig.id)
      });
    }

    const snapshot = await adapter.getSnapshot(symbol, {
      apiKey,
      providerConfig,
      log:(level, details) => logEndpointEvent(level, {...details, provider:providerConfig.id})
    });

    return jsonResponse(200, {
      ok:true,
      error:null,
      provider:providerConfig.id,
      providerLabel:providerConfig.label,
      data:{
        ...snapshot,
        dataProvider:providerConfig.id
      }
    });
  }catch(error){
    const failure = adapter.classifyError
      ? adapter.classifyError(error, providerConfig.label)
      : {
          clientMessage:String(error && error.message || 'Market-data request failed.'),
          logMessage:String(error && error.message || 'Market-data request failed.')
        };
    console.error(`[market-data] ${failure.logMessage}`);
    if(mode === 'search' || query){
      return jsonResponse(200, {
        ok:false,
        error:failure.clientMessage,
        provider:providerConfig.id,
        providerLabel:providerConfig.label,
        results:[]
      });
    }
    return jsonResponse(200, {
      ok:false,
      error:failure.clientMessage,
      provider:providerConfig.id,
      providerLabel:providerConfig.label,
      data:baseResponsePayload(symbol, providerConfig.id)
    });
  }
};
