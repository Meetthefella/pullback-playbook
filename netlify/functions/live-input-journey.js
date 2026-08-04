const {buildNormalizedSnapshot} = require('./lib/market-normalizers');
const {getProviderConfig, normalizePlanId, normalizeProviderId} = require('./lib/scan-config');
const fmpProvider = require('./lib/providers/fmp');
const marketDataProvider = require('./lib/providers/marketdata');
const {renderDeterministicChartPng, sha256} = require('./lib/deterministic-chart-png');

const corsHeaders = {'Content-Type':'application/json', 'Cache-Control':'no-store', 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Methods':'GET, OPTIONS'};
const providers = {fmp:fmpProvider, marketdata:marketDataProvider};
const JOURNEY_PROVIDER_ID = 'fmp';
const json = (statusCode, body) => ({statusCode, headers:corsHeaders, body:JSON.stringify(body)});
const keyFor = provider => provider === 'fmp' ? process.env.FMP_API_KEY : (process.env.MARKETDATA_API_KEY || process.env.MARKETDATA_TOKEN || '');
const validTicker = ticker => /^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker);
const supportsJourneyProvider = providerId => providerId === JOURNEY_PROVIDER_ID;

function selectBarsAtOrBefore(history, asOf){
  const requested = String(asOf || '').slice(0, 10);
  return (Array.isArray(history) ? history : []).filter(bar => String(bar && bar.date || '') <= requested).slice(0, 200);
}

exports.handler = async event => {
  if(event.httpMethod === 'OPTIONS') return json(200, {ok:true});
  if(event.httpMethod !== 'GET') return json(405, {ok:false, error:'Method not allowed.'});
  const query = event.queryStringParameters || {};
  const ticker = String(query.ticker || query.symbol || '').trim().toUpperCase();
  const asOf = String(query.asOf || '').trim().slice(0, 10);
  const providerId = normalizeProviderId(query.provider);
  if(!supportsJourneyProvider(providerId)) return json(400, {ok:false, error:'Shadow Journey is configured for Financial Modeling Prep only in this deployment. Select FMP in API Settings.'});
  const config = getProviderConfig(providerId, normalizePlanId(providerId, query.plan));
  const apiKey = keyFor(config.id);
  if(!validTicker(ticker) || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return json(400, {ok:false, error:'ticker and asOf (YYYY-MM-DD) are required.'});
  if(!apiKey) return json(503, {ok:false, error:`${config.label} is not configured.`});
  try{
    const provider = providers[config.id];
    const snapshot = await provider.getSnapshot(ticker, {apiKey, providerConfig:config, log:() => {}});
    const bars = selectBarsAtOrBefore(snapshot.history, asOf);
    if(bars.length < 200) return json(422, {ok:false, error:`Insufficient daily OHLCV history at ${asOf} (${bars.length}/200 bars).`});
    const marketPacket = buildNormalizedSnapshot(ticker, config.id, snapshot, bars, snapshot.warnings || []);
    const barsHash = sha256(Buffer.from(JSON.stringify(bars)));
    const variant = String(query.chartVariant || 'base').trim().toLowerCase() || 'base';
    const png = renderDeterministicChartPng(bars, {ticker, asOf, barsHash, variant});
    const chartHash = sha256(png);
    const runId = sha256(`${ticker}|${asOf}|${config.id}|${barsHash}`).slice(0, 24);
    return json(200, {ok:true, runId, ticker, asOf, provider:config.id, bars, barsHash, chartHash, chartPngBase64:png.toString('base64'), marketPacket:{...marketPacket, asOf, quoteUnits:marketPacket.currency, snapshotId:`${runId}:${barsHash.slice(0, 12)}`}});
  }catch(error){
    return json(502, {ok:false, error:String(error && error.message || 'Live input journey data request failed.')});
  }
};

exports.__test = {selectBarsAtOrBefore, supportsJourneyProvider, JOURNEY_PROVIDER_ID};
