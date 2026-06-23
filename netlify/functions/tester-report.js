const { getStore } = require('@netlify/blobs');
const { corsHeadersForEvent, guardTrustedOrigin } = require('./lib/request-guard');
const { normalizeTesterId, validateTesterId } = require('./lib/tracked-store');

const STORE_NAME = 'pullback-playbook';
const REPORT_PREFIX = 'tester-reports';
const ALLOWED_CATEGORIES = ['Bad verdict', 'Chart mismatch', 'Paper trade problem', 'UI problem', 'Other'];
const MAX_NOTES_LENGTH = 4000;
const MAX_PAYLOAD_BYTES = 50000;
const MAX_LIST_LIMIT = 50;

function jsonResponse(event, statusCode, body){
  return {
    statusCode,
    headers:corsHeadersForEvent(event, 'POST, OPTIONS'),
    body:JSON.stringify(body)
  };
}

function manualBlobsClientOptions(){
  const siteID = String(
    process.env.NETLIFY_BLOBS_SITE_ID
    || process.env.SITE_ID
    || process.env.NETLIFY_SITE_ID
    || ''
  ).trim();
  const token = String(
    process.env.NETLIFY_BLOBS_TOKEN
    || process.env.BLOBS_TOKEN
    || process.env.NETLIFY_AUTH_TOKEN
    || process.env.NETLIFY_API_TOKEN
    || ''
  ).trim();
  if(!siteID || !token) return null;
  return {siteID, token};
}

function storeInstance(){
  const manualClientOptions = manualBlobsClientOptions();
  if(manualClientOptions){
    try{
      return getStore({
        name:STORE_NAME,
        ...manualClientOptions
      });
    }catch(error){
      // Fall through to automatic context resolution below.
    }
  }
  try{
    return getStore(STORE_NAME);
  }catch(error){
    return getStore({name:STORE_NAME});
  }
}

function testerIdFromEvent(event){
  const headers = event && event.headers && typeof event.headers === 'object' ? event.headers : {};
  return normalizeTesterId(headers['x-pullback-tester-id'] || headers['X-Pullback-Tester-Id'] || '');
}

function adminTokenFromEvent(event){
  const headers = event && event.headers && typeof event.headers === 'object' ? event.headers : {};
  return String(headers['x-admin-token'] || headers['X-Admin-Token'] || headers.authorization || headers.Authorization || '').trim();
}

function adminAccessAllowed(event){
  const configured = String(process.env.TESTER_REPORT_ADMIN_TOKEN || '').trim();
  if(!configured) return false;
  const presented = adminTokenFromEvent(event);
  if(!presented) return false;
  if(presented === configured) return true;
  if(/^bearer\s+/i.test(presented)){
    return presented.replace(/^bearer\s+/i, '').trim() === configured;
  }
  return false;
}

function queryParams(event){
  return event && event.queryStringParameters && typeof event.queryStringParameters === 'object'
    ? event.queryStringParameters
    : {};
}

function normalizeCategory(value){
  return String(value || '').trim();
}

function slugifyTicker(value){
  const safe = String(value || '').trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return safe || 'general';
}

function redactSensitivePayload(value, parentKey = ''){
  const key = String(parentKey || '').trim().toLowerCase();
  const blockedKey = /(papertradeapikey|papertradeapisecret|authorization|credentials|secret|api[_-]?key)/i.test(key);
  if(value == null) return value;
  if(blockedKey) return '[REDACTED]';
  if(Array.isArray(value)) return value.map(item => redactSensitivePayload(item, parentKey));
  if(typeof value === 'object'){
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [
      childKey,
      redactSensitivePayload(childValue, childKey)
    ]));
  }
  if(typeof value === 'string'){
    if(/^basic\s+/i.test(value)) return '[REDACTED]';
    return value;
  }
  return value;
}

function byteSize(value){
  return Buffer.byteLength(JSON.stringify(value || {}), 'utf8');
}

function reportKey(testerId, payload){
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const ticker = slugifyTicker(payload && payload.snapshot && payload.snapshot.ticker || 'general');
  return `${REPORT_PREFIX}/${testerId}/${timestamp}-${ticker}.json`;
}

async function saveTesterReport(testerId, payload){
  const key = reportKey(testerId, payload);
  const store = storeInstance();
  if(typeof store.setJSON === 'function'){
    await store.setJSON(key, payload);
  }else{
    await store.set(key, JSON.stringify(payload), {contentType:'application/json'});
  }
  return key;
}

async function getJson(key){
  const store = storeInstance();
  if(typeof store.getJSON === 'function'){
    return await store.getJSON(key);
  }
  const value = await store.get(key, {type:'json'});
  return value == null ? null : value;
}

async function listTesterReports(limit = 20){
  const store = storeInstance();
  const safeLimit = Math.max(1, Math.min(MAX_LIST_LIMIT, Number(limit) || 20));
  if(typeof store.list !== 'function') return [];
  const result = await store.list({prefix:`${REPORT_PREFIX}/`, limit:safeLimit});
  const items = Array.isArray(result)
    ? result
    : Array.isArray(result && result.blobs)
      ? result.blobs
      : Array.isArray(result && result.objects)
        ? result.objects
        : [];
  return items.map(item => {
    const key = String(item && (item.key || item.path || item.name) || '');
    const testerId = key.split('/')[1] || '';
    return {
      key,
      testerId,
      modified:String(item && (item.modified || item.updated_at || item.updatedAt || '') || '')
    };
  }).filter(item => item.key);
}

async function readTesterReport(key){
  const safeKey = String(key || '').trim();
  if(!safeKey.startsWith(`${REPORT_PREFIX}/`)) return null;
  return await getJson(safeKey);
}

exports.handler = async function handler(event){
  if(event.httpMethod === 'OPTIONS') return jsonResponse(event, 200, {ok:true});
  if(!guardTrustedOrigin(event)) return jsonResponse(event, 403, {error:'Forbidden'});
  if(event.httpMethod === 'GET'){
    if(!adminAccessAllowed(event)) return jsonResponse(event, 403, {error:'Forbidden'});
    const params = queryParams(event);
    const mode = String(params.mode || 'list').trim().toLowerCase();
    if(mode === 'read'){
      const key = String(params.key || '').trim();
      if(!key) return jsonResponse(event, 400, {error:'Missing report key.'});
      const report = await readTesterReport(key);
      if(!report) return jsonResponse(event, 404, {error:'Tester report not found.'});
      return jsonResponse(event, 200, {ok:true, report:redactSensitivePayload(report)});
    }
    const reports = await listTesterReports(params.limit);
    return jsonResponse(event, 200, {ok:true, reports});
  }
  if(event.httpMethod !== 'POST') return jsonResponse(event, 405, {error:'Method not allowed'});

  const testerId = testerIdFromEvent(event);
  if(!testerId) return jsonResponse(event, 400, {error:'Missing testerId.'});
  if(!validateTesterId(testerId)) return jsonResponse(event, 400, {error:'Invalid testerId.'});

  let body;
  try{
    body = JSON.parse(event.body || '{}');
  }catch(error){
    return jsonResponse(event, 400, {error:'Invalid JSON body.'});
  }

  const category = normalizeCategory(body.category);
  if(!ALLOWED_CATEGORIES.includes(category)){
    return jsonResponse(event, 400, {error:'Invalid category.'});
  }
  const sanitized = redactSensitivePayload({
    receivedAt:new Date().toISOString(),
    testerId,
    category,
    notes:String(body.notes || '').slice(0, MAX_NOTES_LENGTH),
    snapshot:body.snapshot && typeof body.snapshot === 'object' ? body.snapshot : {},
    meta:{
      appVersion:String(body.snapshot && body.snapshot.buildVersion || ''),
      ticker:String(body.snapshot && body.snapshot.ticker || 'general')
    }
  });
  if(byteSize(sanitized) > MAX_PAYLOAD_BYTES){
    return jsonResponse(event, 413, {error:'Tester report payload too large.'});
  }
  const savedKey = await saveTesterReport(testerId, sanitized);
  return jsonResponse(event, 200, {ok:true, reportKey:savedKey});
};

module.exports = {
  handler:exports.handler,
  redactSensitivePayload,
  reportKey,
  saveTesterReport,
  ALLOWED_CATEGORIES,
  manualBlobsClientOptions,
  listTesterReports,
  readTesterReport
};
