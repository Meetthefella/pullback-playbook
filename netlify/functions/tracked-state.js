const { loadTrackedState, saveTrackedState } = require('./lib/tracked-store');
const { corsHeadersForEvent, guardTrustedOrigin } = require('./lib/request-guard');

function jsonResponse(event, statusCode, body){
  if(String(process.env.DEBUG_TRACKED_STATE_SIZE || '').trim().toLowerCase() === 'true'){
    try{
      const approxBytes = Buffer.byteLength(JSON.stringify(body || {}), 'utf8');
      console.log('TRACKED_STATE_RESPONSE_SIZE', {statusCode, approxBytes});
    }catch(error){}
  }
  return {
    statusCode,
    headers:corsHeadersForEvent(event, 'GET, POST, OPTIONS'),
    body:JSON.stringify(body)
  };
}

function compactChartRef(chartRef){
  if(!chartRef || typeof chartRef !== 'object') return null;
  return {
    name:String(chartRef.name || ''),
    type:String(chartRef.type || '')
  };
}

function compactReview(review){
  const safe = review && typeof review === 'object' ? review : {};
  const analysisState = safe.analysisState && typeof safe.analysisState === 'object' ? safe.analysisState : {};
  return {
    ...safe,
    chartRef:compactChartRef(safe.chartRef),
    analysisState:{
      ...analysisState,
      raw:'',
      prompt:''
    },
    aiAnalysisRaw:'',
    lastPrompt:''
  };
}

function compactTickerRecordForResponse(record){
  const safe = record && typeof record === 'object' ? record : {};
  const marketData = safe.marketData && typeof safe.marketData === 'object' ? safe.marketData : {};
  const watchlist = safe.watchlist && typeof safe.watchlist === 'object' ? safe.watchlist : {};
  return {
    ...safe,
    review:compactReview(safe.review),
    marketData:{
      ...marketData,
      history:[]
    },
    watchlist:{
      ...watchlist,
      debug:{}
    }
  };
}

function compactTrackedStateForResponse(state){
  const safe = state && typeof state === 'object' ? state : {};
  const records = safe.records && typeof safe.records === 'object' ? safe.records : {};
  const compactRecords = {};
  Object.entries(records).forEach(([ticker, record]) => {
    if(!ticker || !record || typeof record !== 'object') return;
    compactRecords[ticker] = compactTickerRecordForResponse(record);
  });
  return {
    updatedAt:String(safe.updatedAt || ''),
    settings:safe.settings && typeof safe.settings === 'object' ? safe.settings : {},
    records:compactRecords
  };
}

function trackedStateAckForResponse(state){
  const safe = state && typeof state === 'object' ? state : {};
  const records = safe.records && typeof safe.records === 'object' ? safe.records : {};
  const versionRecords = {};
  Object.entries(records).forEach(([ticker, record]) => {
    if(!ticker || !record || typeof record !== 'object') return;
    const meta = record.meta && typeof record.meta === 'object' ? record.meta : {};
    versionRecords[ticker] = {
      ticker:String(record.ticker || ticker),
      meta:{
        updatedAt:String(meta.updatedAt || record.updatedAt || '')
      }
    };
  });
  return {
    updatedAt:String(safe.updatedAt || ''),
    settings:safe.settings && typeof safe.settings === 'object' ? safe.settings : {},
    records:versionRecords
  };
}

function normalizeRecordVersions(record){
  const safe = record && typeof record === 'object' ? record : {};
  const meta = safe.meta && typeof safe.meta === 'object' ? {...safe.meta} : {};
  const fallbackUpdatedAt = String(meta.updatedAt || safe.updatedAt || '');
  // userUpdatedAt tracks user-authored state. Scheduler-only market refreshes
  // must not advance the version used for merge/delete conflict resolution.
  if(!meta.userUpdatedAt && fallbackUpdatedAt) meta.userUpdatedAt = fallbackUpdatedAt;
  if(!('marketUpdatedAt' in meta)) meta.marketUpdatedAt = String(meta.marketUpdatedAt || '');
  return {
    ...safe,
    meta
  };
}

function recordUserUpdatedAt(record){
  return String(record && record.meta && (record.meta.userUpdatedAt || record.meta.updatedAt) || record && record.updatedAt || '');
}

function newerRecord(existingRecord, incomingRecord){
  const normalizedExisting = normalizeRecordVersions(existingRecord);
  const normalizedIncoming = normalizeRecordVersions(incomingRecord);
  if(!normalizedExisting || !existingRecord) return normalizedIncoming;
  if(!normalizedIncoming || !incomingRecord) return normalizedExisting;
  const existingUpdatedAt = recordUserUpdatedAt(normalizedExisting);
  const incomingUpdatedAt = recordUserUpdatedAt(normalizedIncoming);
  if(!existingUpdatedAt) return normalizedIncoming;
  if(!incomingUpdatedAt) return normalizedExisting;
  return incomingUpdatedAt >= existingUpdatedAt ? normalizedIncoming : normalizedExisting;
}

function mergeRecords(existingRecords = {}, incomingRecords = {}){
  const merged = {...existingRecords};
  Object.entries(incomingRecords || {}).forEach(([ticker, record]) => {
    if(!ticker || !record || typeof record !== 'object') return;
    merged[ticker] = newerRecord(merged[ticker], record);
  });
  return merged;
}

function applyExplicitRemovals(records = {}, removedRecords = {}){
  const next = {...records};
  Object.entries(removedRecords || {}).forEach(([ticker, deletedAt]) => {
    if(!ticker || !(ticker in next)) return;
    // Deletions are compared against the last user-authored version, not the
    // scheduler's market-refresh timestamp, so a background refresh cannot
    // block an explicit user delete intent.
    const existingUpdatedAt = recordUserUpdatedAt(normalizeRecordVersions(next[ticker]));
    if(!existingUpdatedAt || !deletedAt || existingUpdatedAt <= String(deletedAt)){
      delete next[ticker];
    }
  });
  return next;
}

exports.handler = async function handler(event){
 
  if(event.httpMethod === 'OPTIONS') return jsonResponse(event, 200, {ok:true});
 if(!guardTrustedOrigin(event)) return jsonResponse(event, 403, {error:'Forbidden'});
  if(event.httpMethod === 'GET'){
    const state = await loadTrackedState();
    return jsonResponse(event, 200, {ok:true, trackedState:compactTrackedStateForResponse(state)});
  }
  if(event.httpMethod !== 'POST'){
    return jsonResponse(event, 405, {error:'Method not allowed'});
  }
  let body;
  try{
    body = JSON.parse(event.body || '{}');
  }catch(error){
    return jsonResponse(event, 400, {error:'Invalid JSON body.'});
  }
  const existing = await loadTrackedState();
  const nextState = {
    updatedAt:new Date().toISOString(),
    settings:body.settings && typeof body.settings === 'object'
      ? {...existing.settings, ...body.settings}
      : existing.settings,
    records:applyExplicitRemovals(
      mergeRecords(existing.records, body.records && typeof body.records === 'object' ? body.records : {}),
      body.removedRecords && typeof body.removedRecords === 'object' ? body.removedRecords : {}
    )
  };
  const saved = await saveTrackedState(nextState);
  return jsonResponse(event, 200, {ok:true, trackedState:trackedStateAckForResponse(saved)});
};
