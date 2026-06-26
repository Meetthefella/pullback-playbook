const path = require('path');
const Module = require('module');

const root = path.join(__dirname, '..');
const submitHandlerPath = path.join(root, 'netlify', 'functions', 'tester-bundle.js');
const receiptsHandlerPath = path.join(root, 'netlify', 'functions', 'tester-bundle-receipts.js');
const sampleDiagnosticsPath = path.join(root, 'sample-diagnostics.json');

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
    path.join(root, 'netlify', 'functions', 'lib', 'tester-bundle-normalizer.js'),
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
            async setJSON(key, value){
              bucket.set(key, JSON.parse(JSON.stringify(value)));
            },
            async getJSON(key){
              return bucket.has(key) ? JSON.parse(JSON.stringify(bucket.get(key))) : null;
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

async function seedIssue(storeData, testerId, sampleDiagnostics){
  const testerBundle = loadWithBlobStub(submitHandlerPath, storeData);
  const response = await testerBundle.handler({
    httpMethod:'POST',
    headers:{
      origin:'http://localhost:8888',
      'x-pullback-tester-id':testerId
    },
    body:JSON.stringify(sampleDiagnostics)
  });
  return parseBody(response);
}

async function run(){
  const storeData = new Map();
  const sampleDiagnostics = require(sampleDiagnosticsPath);
  const testerA = '11111111-1111-4111-8111-111111111111';
  const testerB = '22222222-2222-4222-8222-222222222222';
  const seededA = await seedIssue(storeData, testerA, sampleDiagnostics);
  const seededB = await seedIssue(storeData, testerB, {...sampleDiagnostics, snapshot:{...sampleDiagnostics.snapshot, ticker:'MSFT'}});
  const receiptsHandler = loadWithBlobStub(receiptsHandlerPath, storeData);

  const eventFor = (testerId, issueIds, method = 'POST', headers = {}) => ({
    httpMethod:method,
    headers:{
      origin:'http://localhost:8888',
      ...(testerId ? {'x-pullback-tester-id':testerId} : {}),
      ...headers
    },
    body:JSON.stringify({issueIds})
  });

  const options = await receiptsHandler.handler({httpMethod:'OPTIONS', headers:{origin:'http://localhost:8888'}, body:''});
  assert(options.statusCode === 200, 'OPTIONS must succeed.');

  const getRejected = await receiptsHandler.handler(eventFor(testerA, [seededA.issueId], 'GET'));
  assert(getRejected.statusCode === 405, 'GET must be rejected.');

  const missingTester = await receiptsHandler.handler(eventFor('', [seededA.issueId]));
  assert(missingTester.statusCode === 400, 'Missing testerId must be rejected.');

  const invalidTester = await receiptsHandler.handler(eventFor('../escape', [seededA.issueId]));
  assert(invalidTester.statusCode === 400, 'Invalid testerId must be rejected.');

  const valid = await receiptsHandler.handler(eventFor(testerA, [seededA.issueId]));
  const validBody = parseBody(valid);
  assert(valid.statusCode === 200 && validBody.ok, 'Valid tester-owned lookup must succeed.');
  assert(Array.isArray(validBody.receipts) && validBody.receipts.length === 1, 'Owned issue must return one receipt.');
  assert(validBody.receipts[0].issueId === seededA.issueId, 'Returned receipt must match requested issue.');
  assert(validBody.receipts[0].workflow.status === 'submitted', 'Workflow status must be included.');

  const foreign = await receiptsHandler.handler(eventFor(testerA, [seededB.issueId]));
  const foreignBody = parseBody(foreign);
  assert(foreign.statusCode === 200, 'Foreign issue lookup must not leak via hard error.');
  assert(Array.isArray(foreignBody.receipts) && foreignBody.receipts.length === 0, 'Foreign tester issues must not be returned.');

  console.log('tester-bundle receipts tests passed');
}

run().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
