const { getStore } = require('@netlify/blobs');

const STORE_NAME = 'pullback-playbook';
const TRACKED_RECORDS_PREFIX = 'tracked-records';
const SUBSCRIPTIONS_KEY = 'push-subscriptions';
const TESTER_ID_PATTERN = /^[a-f0-9-]{16,64}$/;

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

async function getJson(key, fallback){
  const store = storeInstance();
  if(typeof store.getJSON === 'function'){
    const value = await store.getJSON(key);
    return value == null ? fallback : value;
  }
  const value = await store.get(key, {type:'json'});
  return value == null ? fallback : value;
}

async function setJson(key, value){
  const store = storeInstance();
  if(typeof store.setJSON === 'function'){
    await store.setJSON(key, value);
    return;
  }
  await store.set(key, JSON.stringify(value), {contentType:'application/json'});
}

function normalizeTrackedState(value){
  const safe = value && typeof value === 'object' ? value : {};
  return {
    updatedAt:String(safe.updatedAt || ''),
    settings:safe.settings && typeof safe.settings === 'object' ? safe.settings : {},
    records:safe.records && typeof safe.records === 'object' ? safe.records : {}
  };
}

function normalizeSubscriptionList(value){
  return Array.isArray(value) ? value.filter(item => item && typeof item === 'object' && item.endpoint) : [];
}

function normalizeTesterId(value){
  return String(value || '').trim().toLowerCase();
}

function validateTesterId(value){
  const testerId = normalizeTesterId(value);
  return TESTER_ID_PATTERN.test(testerId);
}

function trackedRecordsKey(testerId){
  const normalized = normalizeTesterId(testerId);
  if(!validateTesterId(normalized)){
    throw new Error('invalid_tester_id');
  }
  return `${TRACKED_RECORDS_PREFIX}/${normalized}`;
}

async function loadTrackedState(testerId){
  return normalizeTrackedState(await getJson(trackedRecordsKey(testerId), {
    updatedAt:'',
    settings:{},
    records:{}
  }));
}

async function saveTrackedState(testerId, value){
  const payload = normalizeTrackedState(value);
  payload.updatedAt = new Date().toISOString();
  await setJson(trackedRecordsKey(testerId), payload);
  return payload;
}

async function loadPushSubscriptions(){
  return normalizeSubscriptionList(await getJson(SUBSCRIPTIONS_KEY, []));
}

async function savePushSubscriptions(value){
  const payload = normalizeSubscriptionList(value);
  await setJson(SUBSCRIPTIONS_KEY, payload);
  return payload;
}

module.exports = {
  loadTrackedState,
  saveTrackedState,
  loadPushSubscriptions,
  savePushSubscriptions,
  normalizeTesterId,
  validateTesterId,
  trackedRecordsKey
};
