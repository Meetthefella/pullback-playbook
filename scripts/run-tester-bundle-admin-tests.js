const fs = require('fs');
const path = require('path');
const Module = require('module');

const root = path.join(__dirname, '..');
const adminHandlerPath = path.join(root, 'netlify', 'functions', 'tester-bundle-admin.js');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

function parseBody(response){
  return JSON.parse(String(response && response.body || '{}'));
}

function loadWithBlobStub(targetPath, storeData){
  const originalLoad = Module._load;
  const helperPaths = [
    path.join(root, 'netlify', 'functions', 'lib', 'tester-bundle-store.js'),
    path.join(root, 'netlify', 'functions', 'lib', 'request-guard.js')
  ];
  delete require.cache[targetPath];
  helperPaths.forEach(helperPath => delete require.cache[helperPath]);
  Module._load = function patchedLoad(request, parent, isMain){
    if(request === '@netlify/blobs'){
      return {
        getStore(storeOptions){
          const name = typeof storeOptions === 'string' ? storeOptions : storeOptions && storeOptions.name;
          if(!storeData.has(name)) storeData.set(name, new Map());
          const bucket = storeData.get(name);
          return {
            async getJSON(key){
              return bucket.has(key) ? JSON.parse(JSON.stringify(bucket.get(key))) : null;
            },
            async setJSON(key, value){
              bucket.set(key, JSON.parse(JSON.stringify(value)));
            }
          };
        }
      };
    }
    return originalLoad.apply(this, arguments);
  };
  try{
    return require(targetPath);
  }finally{
    Module._load = originalLoad;
  }
}

async function run(){
  process.env.TESTER_REPORT_ADMIN_TOKEN = 'admin-secret';
  const storeData = new Map();
  const adminHandler = loadWithBlobStub(adminHandlerPath, storeData);
  const bundleStore = new Map();
  storeData.set('tester-issue-bundles', bundleStore);

  const issueId = 'BUG-20260626102014-AAPL';
  const fullKey = adminHandler.fullKeyFromIssueId(issueId);
  bundleStore.set(fullKey, {issue:{issueId}, summary:{ticker:'AAPL'}});

  const eventFor = (headers = {}, query = {}, method = 'GET') => ({
    httpMethod:method,
    headers,
    queryStringParameters:query
  });

  const noToken = await adminHandler.handler(eventFor({}, {issueId}));
  assert(noToken.statusCode === 403, 'Missing admin token must be rejected.');

  const badToken = await adminHandler.handler(eventFor({'x-admin-token':'wrong'}, {issueId}));
  assert(badToken.statusCode === 403, 'Bad admin token must be rejected.');

  const malformed = await adminHandler.handler(eventFor({'x-admin-token':'admin-secret'}, {issueId:'BAD-ID'}));
  assert(malformed.statusCode === 400, 'Malformed issueId must be rejected.');

  const noListMode = await adminHandler.handler(eventFor({'x-admin-token':'admin-secret'}, {mode:'list', issueId}));
  assert(noListMode.statusCode === 400, 'List mode must not exist.');

  const valid = await adminHandler.handler(eventFor({'x-admin-token':'admin-secret'}, {issueId}));
  const validBody = parseBody(valid);
  assert(valid.statusCode === 200, 'Valid admin token must fetch the bundle.');
  assert(validBody && validBody.issue && validBody.issue.issueId === issueId, 'Expected full bundle must be returned.');

  const noReadByKey = await adminHandler.handler(eventFor({'x-admin-token':'admin-secret'}, {key:fullKey}));
  assert(noReadByKey.statusCode === 400, 'Direct key-based reads must not be supported.');

  console.log('tester-bundle admin tests passed');
}

run().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
