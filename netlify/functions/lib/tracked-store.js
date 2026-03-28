const { getStore } = require('@netlify/blobs');

const STORE_NAME = 'pullback-playbook';
const RECORDS_KEY = 'tracked-records';
const SUBSCRIPTIONS_KEY = 'push-subscriptions';

function storeInstance(){
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

async function loadTrackedState(){
  return normalizeTrackedState(await getJson(RECORDS_KEY, {
    updatedAt:'',
    settings:{},
    records:{}
  }));
}

async function saveTrackedState(value){
  const payload = normalizeTrackedState(value);
  payload.updatedAt = new Date().toISOString();
  await setJson(RECORDS_KEY, payload);
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
  savePushSubscriptions
};
