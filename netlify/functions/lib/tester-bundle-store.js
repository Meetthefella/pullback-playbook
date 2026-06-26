const { getStore } = require('@netlify/blobs');

const STORE_NAME = 'pullback-playbook';
const INDEX_STORE_NAME = 'tester-issue-index';
const FULL_STORE_NAME = 'tester-issue-bundles';
const MAX_PAYLOAD_BYTES = 100000;
const REDACTED_VALUE = '[REDACTED]';
const ISSUE_ID_PATTERN = /^BUG-(\d{14})-([A-Z0-9._-]+)$/;
const TESTER_BUNDLE_SCHEMA_VERSION = 2;
const SENSITIVE_KEY_PARTS = [
  'apikey',
  'apisecret',
  'token',
  'password',
  'secret',
  'authorization',
  'paperapikey',
  'paperapisecret',
  'papertradeapikey',
  'papertradeapisecret',
  'trading212'
];
const WORKFLOW_STATUS_ORDER = [
  'submitted',
  'under_investigation',
  'analysis_complete',
  'fixed'
];
const WORKFLOW_STATUS_META = {
  submitted:{label:'Submitted', colorToken:'grey'},
  under_investigation:{label:'Under Investigation', colorToken:'amber'},
  analysis_complete:{label:'Analysis Complete', colorToken:'blue'},
  fixed:{label:'Fixed', colorToken:'green'},
  closed:{label:'Closed', colorToken:'dark_grey'}
};

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

function getBlobStore(name){
  const manualClientOptions = manualBlobsClientOptions();
  if(manualClientOptions){
    try{
      return getStore({name, ...manualClientOptions});
    }catch(error){}
  }
  try{
    return getStore(name);
  }catch(error){
    return getStore({name});
  }
}

function utf8ByteSize(value){
  return Buffer.byteLength(String(value || ''), 'utf8');
}

function parseJsonBody(event){
  return JSON.parse(String(event && event.body || '{}'));
}

function normalizedKeyName(value){
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function shouldRedactKey(key){
  const normalized = normalizedKeyName(key);
  return SENSITIVE_KEY_PARTS.some(part => normalized.includes(part));
}

function redactSensitivePayload(value, parentKey = ''){
  if(value == null) return value;
  if(shouldRedactKey(parentKey)) return REDACTED_VALUE;
  if(Array.isArray(value)) return value.map(item => redactSensitivePayload(item, parentKey));
  if(typeof value === 'object'){
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [
      childKey,
      redactSensitivePayload(childValue, childKey)
    ]));
  }
  if(typeof value === 'string' && /^basic\s+/i.test(value)) return REDACTED_VALUE;
  return value;
}

function pad(number){
  return String(number).padStart(2, '0');
}

function sanitizeTicker(value){
  const safe = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9._-]+/g, '');
  return safe || 'UNKNOWN';
}

function monthPartitionFromDate(date){
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
}

function issueIdFromSummary(summary, receivedAt){
  const date = receivedAt instanceof Date ? receivedAt : new Date(receivedAt || Date.now());
  const stamp = [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds())
  ].join('');
  return `BUG-${stamp}-${sanitizeTicker(summary && summary.ticker)}`;
}

function buildIssueKeys(issueId, receivedAt){
  const date = receivedAt instanceof Date ? receivedAt : new Date(receivedAt || Date.now());
  const month = monthPartitionFromDate(date);
  return {
    indexKey:`issues/${month}/${issueId}.json`,
    fullKey:`issues/${month}/${issueId}/full.json`
  };
}

function parseIssueId(value){
  const issueId = String(value || '').trim().toUpperCase();
  const match = ISSUE_ID_PATTERN.exec(issueId);
  if(!match) return null;
  const stamp = match[1];
  const year = stamp.slice(0, 4);
  const month = stamp.slice(4, 6);
  return {
    issueId,
    year,
    month,
    receivedAt:`${year}-${month}`
  };
}

function issueKeysFromIssueId(issueId){
  const parsed = parseIssueId(issueId);
  if(!parsed) return null;
  return buildIssueKeys(parsed.issueId, `${parsed.receivedAt}-01T00:00:00.000Z`);
}

function workflowStatusMeta(status){
  const key = String(status || '').trim().toLowerCase();
  return WORKFLOW_STATUS_META[key] || null;
}

function isWorkflowStatus(status){
  return !!workflowStatusMeta(status);
}

function normalizeWorkflowStatusFields(value, fallback = {}){
  const safe = value && typeof value === 'object' ? value : {};
  const rawStatus = String(safe.status || fallback.status || 'submitted').trim().toLowerCase();
  const meta = workflowStatusMeta(rawStatus) || WORKFLOW_STATUS_META.submitted;
  const status = workflowStatusMeta(rawStatus) ? rawStatus : 'submitted';
  const explicitStatusProvided = workflowStatusMeta(String(safe.status || '').trim().toLowerCase()) ? true : false;
  return {
    status,
    statusLabel:String(safe.statusLabel || (explicitStatusProvided ? meta.label : fallback.statusLabel) || meta.label).trim() || meta.label,
    statusUpdatedAt:String(safe.statusUpdatedAt || fallback.statusUpdatedAt || '').trim(),
    statusUpdatedBy:String(safe.statusUpdatedBy || fallback.statusUpdatedBy || '').trim(),
    fixedInBuild:String(safe.fixedInBuild || fallback.fixedInBuild || '').trim(),
    closedAt:String(safe.closedAt || fallback.closedAt || '').trim(),
    statusColorToken:meta.colorToken
  };
}

function buildSubmittedWorkflowStatus(receivedAt){
  return normalizeWorkflowStatusFields({
    status:'submitted',
    statusLabel:'Submitted',
    statusUpdatedAt:receivedAt,
    statusUpdatedBy:'app',
    fixedInBuild:'',
    closedAt:''
  });
}

function workflowTransitionAllowed(fromStatus, toStatus){
  if(fromStatus === toStatus) return true;
  const fromIndex = WORKFLOW_STATUS_ORDER.indexOf(String(fromStatus || '').trim().toLowerCase());
  const toIndex = WORKFLOW_STATUS_ORDER.indexOf(String(toStatus || '').trim().toLowerCase());
  if(fromIndex === -1 || toIndex === -1) return false;
  return toIndex === fromIndex + 1;
}

function buildStatusHistoryEvent({
  status,
  statusLabel,
  statusUpdatedAt,
  statusUpdatedBy,
  fixedInBuild = '',
  closedAt = '',
  note = '',
  override = false
}){
  const event = {
    type:'status_change',
    status:String(status || '').trim(),
    statusLabel:String(statusLabel || '').trim(),
    statusUpdatedAt:String(statusUpdatedAt || '').trim(),
    statusUpdatedBy:String(statusUpdatedBy || '').trim()
  };
  if(String(fixedInBuild || '').trim()) event.fixedInBuild = String(fixedInBuild || '').trim();
  if(String(closedAt || '').trim()) event.closedAt = String(closedAt || '').trim();
  if(String(note || '').trim()) event.note = String(note || '').trim();
  if(override === true) event.override = true;
  return event;
}

async function setJson(storeName, key, value){
  const store = getBlobStore(storeName);
  if(typeof store.setJSON === 'function'){
    await store.setJSON(key, value);
    return;
  }
  await store.set(key, JSON.stringify(value), {contentType:'application/json'});
}

async function getJson(storeName, key){
  const store = getBlobStore(storeName);
  if(typeof store.getJSON === 'function'){
    return await store.getJSON(key);
  }
  const value = await store.get(key, {type:'json'});
  return value == null ? null : value;
}

async function saveIssueBundle(indexPayload, fullPayload){
  await setJson(INDEX_STORE_NAME, indexPayload.issue.indexKey, indexPayload);
  await setJson(FULL_STORE_NAME, fullPayload.issue.fullKey, fullPayload);
}

async function loadIndexBundle(indexKey){
  return await getJson(INDEX_STORE_NAME, indexKey);
}

async function loadIssueBundle(fullKey){
  return await getJson(FULL_STORE_NAME, fullKey);
}

async function loadIssueRecord(issueId){
  const keys = issueKeysFromIssueId(issueId);
  if(!keys) return null;
  const [indexPayload, fullPayload] = await Promise.all([
    loadIndexBundle(keys.indexKey),
    loadIssueBundle(keys.fullKey)
  ]);
  return {
    keys,
    indexPayload,
    fullPayload
  };
}

module.exports = {
  STORE_NAME,
  INDEX_STORE_NAME,
  FULL_STORE_NAME,
  MAX_PAYLOAD_BYTES,
  REDACTED_VALUE,
  TESTER_BUNDLE_SCHEMA_VERSION,
  ISSUE_ID_PATTERN,
  WORKFLOW_STATUS_ORDER,
  WORKFLOW_STATUS_META,
  manualBlobsClientOptions,
  getBlobStore,
  utf8ByteSize,
  parseJsonBody,
  redactSensitivePayload,
  sanitizeTicker,
  issueIdFromSummary,
  buildIssueKeys,
  parseIssueId,
  issueKeysFromIssueId,
  workflowStatusMeta,
  isWorkflowStatus,
  normalizeWorkflowStatusFields,
  buildSubmittedWorkflowStatus,
  workflowTransitionAllowed,
  buildStatusHistoryEvent,
  saveIssueBundle,
  loadIndexBundle,
  loadIssueBundle,
  loadIssueRecord
};
