const { loadTrackedState, saveTrackedState } = require('./lib/tracked-store');
const { corsHeadersForEvent, guardTrustedOrigin } = require('./lib/request-guard');

function jsonResponse(event, statusCode, body){
  return {
    statusCode,
    headers:corsHeadersForEvent(event, 'GET, POST, OPTIONS'),
    body:JSON.stringify(body)
  };
}

function normalizeRecordVersions(record){
  const safe = record && typeof record === 'object' ? record : {};
  const meta = safe.meta && typeof safe.meta === 'object' ? {...safe.meta} : {};
  const fallbackUpdatedAt = String(meta.updatedAt || safe.updatedAt || '');
  // userUpdatedAt tracks user-authored state. Scheduler-only market refreshes
  // must not advance the version used for merge/delete conflict resolution.
  if(!meta.userUpdatedAt && fallbackUpdatedAt) meta.userUpdatedAt = fallbackUpdatedAt;
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
  if(!guardTrustedOrigin(event)) return jsonResponse(event, 403, {error:'Forbidden'});
  if(event.httpMethod === 'OPTIONS') return jsonResponse(event, 200, {ok:true});
  if(event.httpMethod === 'GET'){
    const state = await loadTrackedState();
    return jsonResponse(event, 200, {ok:true, trackedState:state});
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
  return jsonResponse(event, 200, {ok:true, trackedState:saved});
};
