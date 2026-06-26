const path = require('path');
const Module = require('module');

const root = path.join(__dirname, '..');
const submitHandlerPath = path.join(root, 'netlify', 'functions', 'tester-bundle.js');
const statusHandlerPath = path.join(root, 'netlify', 'functions', 'tester-bundle-status.js');
const sampleDiagnosticsPath = path.join(root, 'sample-diagnostics.json');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

function parseBody(response){
  return JSON.parse(String(response && response.body || '{}'));
}

function loadWithBlobStub(targetPath, storeData, options = {}){
  const originalLoad = Module._load;
  const helperPaths = [
    path.join(root, 'netlify', 'functions', 'lib', 'tester-bundle-store.js'),
    path.join(root, 'netlify', 'functions', 'lib', 'tester-bundle-normalizer.js'),
    path.join(root, 'netlify', 'functions', 'tester-bundle-admin.js')
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
              if(options.failSetForStore === name) throw new Error(`write_failed_${name}`);
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

async function seedIssue(storeData){
  const testerBundle = loadWithBlobStub(submitHandlerPath, storeData);
  const sampleDiagnostics = require(sampleDiagnosticsPath);
  const response = await testerBundle.handler({
    httpMethod:'POST',
    headers:{
      origin:'http://localhost:8888',
      'x-pullback-tester-id':'11111111-1111-4111-8111-111111111111'
    },
    body:JSON.stringify(sampleDiagnostics)
  });
  const body = parseBody(response);
  return {
    issueId:body.issueId,
    indexKey:body.indexKey,
    fullKey:body.fullKey
  };
}

async function run(){
  process.env.TESTER_REPORT_ADMIN_TOKEN = 'admin-secret';
  const storeData = new Map();
  const seeded = await seedIssue(storeData);
  const statusHandler = loadWithBlobStub(statusHandlerPath, storeData);
  const indexStore = storeData.get('tester-issue-index');
  const fullStore = storeData.get('tester-issue-bundles');

  const eventFor = (body, headers = {}, method = 'POST') => ({
    httpMethod:method,
    headers,
    body:body == null ? '' : JSON.stringify(body)
  });

  const options = await statusHandler.handler({httpMethod:'OPTIONS', headers:{}, body:''});
  assert(options.statusCode === 200, 'OPTIONS must succeed.');

  const getRejected = await statusHandler.handler(eventFor({}, {}, 'GET'));
  assert(getRejected.statusCode === 405, 'GET must be rejected.');

  const noToken = await statusHandler.handler(eventFor({issueId:seeded.issueId, status:'under_investigation'}));
  assert(noToken.statusCode === 403, 'Missing token must be rejected.');

  const badToken = await statusHandler.handler(eventFor({issueId:seeded.issueId, status:'under_investigation'}, {'x-admin-token':'wrong'}));
  assert(badToken.statusCode === 403, 'Bad token must be rejected.');

  const invalidJson = await statusHandler.handler({httpMethod:'POST', headers:{'x-admin-token':'admin-secret'}, body:'{bad'});
  assert(invalidJson.statusCode === 400, 'Invalid JSON must be rejected.');

  const malformed = await statusHandler.handler(eventFor({issueId:'bad', status:'under_investigation'}, {'x-admin-token':'admin-secret'}));
  assert(malformed.statusCode === 404 || malformed.statusCode === 400, 'Malformed issueId must be rejected.');

  const invalidStatus = await statusHandler.handler(eventFor({issueId:seeded.issueId, status:'mystery'}, {'x-admin-token':'admin-secret'}));
  assert(invalidStatus.statusCode === 400, 'Invalid status must be rejected.');

  const missingFixedBuild = await statusHandler.handler(eventFor({issueId:seeded.issueId, status:'fixed'}, {'x-admin-token':'admin-secret'}));
  assert(missingFixedBuild.statusCode === 400, 'Fixed status must require fixedInBuild.');

  const skipAhead = await statusHandler.handler(eventFor({issueId:seeded.issueId, status:'analysis_complete'}, {'x-admin-token':'admin-secret'}));
  assert(skipAhead.statusCode === 400, 'Skip-ahead transitions must be rejected.');

  const first = await statusHandler.handler(eventFor({issueId:seeded.issueId, status:'under_investigation'}, {'x-admin-token':'admin-secret'}));
  const firstBody = parseBody(first);
  assert(first.statusCode === 200 && firstBody.ok, 'Valid transition must succeed.');
  assert(firstBody.workflow.status === 'under_investigation', 'Workflow response must return updated status.');

  const repeated = await statusHandler.handler(eventFor({issueId:seeded.issueId, status:'under_investigation'}, {'x-admin-token':'admin-secret'}));
  assert(repeated.statusCode === 200, 'Idempotent status repeats must be allowed.');

  const backward = await statusHandler.handler(eventFor({issueId:seeded.issueId, status:'submitted'}, {'x-admin-token':'admin-secret'}));
  assert(backward.statusCode === 400, 'Backward transitions must be rejected without override.');

  const analysis = await statusHandler.handler(eventFor({issueId:seeded.issueId, status:'analysis_complete', note:'triage done'}, {'x-admin-token':'admin-secret'}));
  assert(analysis.statusCode === 200, 'Analysis-complete transition must succeed.');

  const fixed = await statusHandler.handler(eventFor({issueId:seeded.issueId, status:'fixed', fixedInBuild:'v4.4.20'}, {'x-admin-token':'admin-secret'}));
  assert(fixed.statusCode === 200, 'Fixed transition with build must succeed.');

  const closed = await statusHandler.handler(eventFor({issueId:seeded.issueId, status:'closed'}, {'x-admin-token':'admin-secret'}));
  assert(closed.statusCode === 422, 'Closed transition must be rejected server-side during this rollout.');

  const storedIndex = indexStore.get(seeded.indexKey);
  const storedBundle = fullStore.get(seeded.fullKey);
  assert(storedIndex.workflow.status === 'fixed', 'Compact index must remain at fixed after closed is rejected.');
  assert(storedBundle.workflow.status === 'fixed', 'Full bundle must remain at fixed after closed is rejected.');
  assert(storedBundle.workflow.fixedInBuild === 'v4.4.20', 'Full bundle must retain fixedInBuild.');
  assert(Array.isArray(storedBundle.history) && storedBundle.history.length >= 5, 'History must append status events.');
  assert(storedBundle.history[0].type === 'submission', 'Submission history must be preserved as the first event.');
  assert(storedBundle.history.some(entry => entry.type === 'status_change' && entry.status === 'analysis_complete' && entry.note === 'triage done'), 'History must store status change notes.');

  const overrideStoreData = new Map();
  const overrideSeeded = await seedIssue(overrideStoreData);
  const overrideHandler = loadWithBlobStub(statusHandlerPath, overrideStoreData);
  const override = await overrideHandler.handler(eventFor({issueId:overrideSeeded.issueId, status:'fixed', fixedInBuild:'v4.4.21', override:true}, {'x-admin-token':'admin-secret'}));
  const overrideBody = parseBody(override);
  assert(override.statusCode === 200, 'Override transitions must be allowed.');
  assert(overrideBody.workflow.status === 'fixed', 'Override response must return updated status.');

  const failStoreData = new Map();
  const failSeeded = await seedIssue(failStoreData);
  const failingHandler = loadWithBlobStub(statusHandlerPath, failStoreData, {failSetForStore:'tester-issue-index'});
  const writeFail = await failingHandler.handler(eventFor({issueId:failSeeded.issueId, status:'under_investigation'}, {'x-admin-token':'admin-secret'}));
  assert(writeFail.statusCode === 502, 'Write failures must return 502.');

  console.log('tester-bundle status tests passed');
}

run().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
