const fs = require('fs');
const path = require('path');
const Module = require('module');

const root = path.join(__dirname, '..');
const handlerPath = path.join(root, 'netlify', 'functions', 'tester-bundle.js');
const testerReportPath = path.join(root, 'netlify', 'functions', 'tester-report.js');
const sampleDiagnosticsPath = path.join(root, 'sample-diagnostics.json');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

function parseBody(response){
  return JSON.parse(String(response && response.body || '{}'));
}

function ownKeys(value){
  return value && typeof value === 'object' ? Object.keys(value) : [];
}

function loadWithBlobStub(targetPath, storeData, options = {}){
  const originalLoad = Module._load;
  const helperPaths = [
    path.join(root, 'netlify', 'functions', 'lib', 'tester-bundle-store.js'),
    path.join(root, 'netlify', 'functions', 'lib', 'tester-bundle-normalizer.js')
  ];
  delete require.cache[targetPath];
  helperPaths.forEach(helperPath => {
    delete require.cache[helperPath];
  });
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

async function run(){
  const storeData = new Map();
  const testerBundle = loadWithBlobStub(handlerPath, storeData);
  const testerReport = loadWithBlobStub(testerReportPath, storeData);
  const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const sampleDiagnostics = JSON.parse(fs.readFileSync(sampleDiagnosticsPath, 'utf8'));
  const testerId = '11111111-1111-4111-8111-111111111111';

  const eventFor = (method, body, headers = {}) => ({
    httpMethod:method,
    headers:{
      origin:'http://localhost:8888',
      ...headers
    },
    body:body == null ? '' : body
  });

  const optionsResponse = await testerBundle.handler(eventFor('OPTIONS', ''));
  assert(optionsResponse.statusCode === 200, 'OPTIONS must return 200.');

  const getResponse = await testerBundle.handler(eventFor('GET', ''));
  assert(getResponse.statusCode === 405, 'GET must be rejected.');

  const putResponse = await testerBundle.handler(eventFor('PUT', ''));
  assert(putResponse.statusCode === 405, 'Non-POST methods must be rejected.');

  const missingTester = await testerBundle.handler(eventFor('POST', JSON.stringify({snapshot:{}})));
  assert(missingTester.statusCode === 400, 'Missing testerId must be rejected.');

  const invalidTester = await testerBundle.handler(eventFor('POST', JSON.stringify({snapshot:{}}), {
    'x-pullback-tester-id':'../escape'
  }));
  assert(invalidTester.statusCode === 400, 'Invalid testerId must be rejected.');

  const invalidJson = await testerBundle.handler(eventFor('POST', '{bad', {
    'x-pullback-tester-id':testerId
  }));
  const invalidJsonBody = parseBody(invalidJson);
  assert(invalidJson.statusCode === 400, 'Invalid JSON must be rejected.');
  assert(invalidJsonBody.error === 'Invalid JSON body.', 'Invalid JSON must return a friendly 400 message.');

  const oversized = await testerBundle.handler(eventFor('POST', JSON.stringify({
    snapshot:{payload:'x'.repeat(100500)}
  }), {'x-pullback-tester-id':testerId}));
  assert(oversized.statusCode === 413, 'Oversized payload must be rejected.');

  const generalResponse = await testerBundle.handler(eventFor('POST', JSON.stringify(sampleDiagnostics), {
    'x-pullback-tester-id':testerId
  }));
  const generalBody = parseBody(generalResponse);
  assert(generalResponse.statusCode === 200 && generalBody.ok, 'Valid General bundle must succeed.');
  assert(/^BUG-\d{14}-AAPL$/.test(generalBody.issueId), 'Issue ID must use UTC timestamp and sanitized ticker.');
  assert(/^issues\/\d{4}-\d{2}\/BUG-\d{14}-AAPL\.json$/.test(generalBody.indexKey), 'Index key must be month partitioned.');
  assert(/^issues\/\d{4}-\d{2}\/BUG-\d{14}-AAPL\/full\.json$/.test(generalBody.fullKey), 'Full key must be month partitioned.');
  assert(generalBody.receipt && generalBody.receipt.title === 'Diagnostics Submitted', 'Successful submission must return a receipt title.');
  assert(generalBody.receipt.issueId === generalBody.issueId, 'Receipt must include the returned issue ID.');
  assert(generalBody.receipt.buildVersion === 'v-test', 'Receipt must include build version.');
  assert(generalBody.receipt.bundle === 'General', 'General snapshot receipt must label the bundle correctly.');
  assert(Array.isArray(generalBody.receipt.stored) && generalBody.receipt.stored.join(',') === 'Index,Full Bundle', 'Receipt must list stored artifacts.');
  assert(/^\d{2}:\d{2}:\d{2} UTC$/.test(generalBody.receipt.submittedAtUtc), 'Receipt must include submitted UTC time.');

  const indexStore = storeData.get('tester-issue-index');
  const bundleStore = storeData.get('tester-issue-bundles');
  assert(indexStore && indexStore.has(generalBody.indexKey), 'Index blob must be stored.');
  assert(bundleStore && bundleStore.has(generalBody.fullKey), 'Full blob must be stored.');
  const storedIndex = indexStore.get(generalBody.indexKey);
  const storedBundle = bundleStore.get(generalBody.fullKey);

  assert(ownKeys(storedBundle).join(',') === [
    'schemaVersion',
    'issue',
    'workflow',
    'summary',
    'codexFocus',
    'contradictions',
    'expectedVsActual',
    'stateHealth',
    'presentation',
    'gates',
    'lifecycle',
    'plan',
    'resolverTrace',
    'extractedSections',
    'rawBundles',
    'history'
  ].join(','), 'Full bundle top-level key order must match the contract.');
  assert(storedBundle.schemaVersion === 2, 'Full bundle schema version must advance for workflow tracking.');
  assert(storedBundle.workflow.status === 'submitted', 'New submissions must start as submitted.');
  assert(storedBundle.workflow.statusLabel === 'Submitted', 'New submissions must store workflow label.');
  assert(storedIndex.workflow.status === 'submitted', 'Compact index must store workflow status.');
  assert(storedBundle.history[0].type === 'submission', 'Initial history event must remain the submission record.');

  assert(storedBundle.summary.timestamp === sampleDiagnostics.snapshot.timestamp, 'Provided timestamp must be preserved.');
  assert(storedBundle.rawBundles.submitted.snapshot.paperTradeApiKey === '[REDACTED]', 'Trading 212 credentials must be redacted in full bundle.');
  assert(storedBundle.rawBundles.submitted.snapshot.paperTradeApiSecret === '[REDACTED]', 'Trading 212 credentials must be redacted in full bundle.');
  assert(storedBundle.rawBundles.submitted.snapshot.paperApiKey === '[REDACTED]', 'paperApiKey aliases must be redacted in full bundle.');
  assert(storedBundle.rawBundles.submitted.snapshot.paperApiSecret === '[REDACTED]', 'paperApiSecret aliases must be redacted in full bundle.');
  assert(storedBundle.rawBundles.submitted.snapshot.apiKey === '[REDACTED]', 'apiKey must be redacted in full bundle.');
  assert(storedBundle.rawBundles.submitted.snapshot.apiSecret === '[REDACTED]', 'apiSecret must be redacted in full bundle.');
  assert(storedBundle.rawBundles.submitted.snapshot.token === '[REDACTED]', 'token must be redacted in full bundle.');
  assert(storedBundle.rawBundles.submitted.snapshot.password === '[REDACTED]', 'password must be redacted in full bundle.');
  assert(storedBundle.rawBundles.submitted.snapshot.nested.Authorization === '[REDACTED]', 'authorization must be redacted in full bundle.');
  assert(storedBundle.rawBundles.submitted.snapshot.nested.deep.trading212Token === '[REDACTED]', 'nested token-like Trading 212 fields must be redacted in full bundle.');
  assert(JSON.stringify(storedIndex).indexOf('leak-me') === -1, 'Compact index must not store raw secrets.');
  assert(storedBundle.expectedVsActual.expected === sampleDiagnostics.expected, 'Expected text must be preserved.');

  const missingTimestampResponse = await testerBundle.handler(eventFor('POST', JSON.stringify({
    category:'Other',
    snapshot:{
      ticker:'MSFT',
      panelTitle:'General diagnostics'
    }
  }), {'x-pullback-tester-id':testerId}));
  const missingTimestampBody = parseBody(missingTimestampResponse);
  const storedMissingTimestamp = bundleStore.get(missingTimestampBody.fullKey);
  assert(/^\d{4}-\d{2}-\d{2}T/.test(storedMissingTimestamp.summary.timestamp), 'Missing timestamp must fall back safely to server receive time.');

  const missingTickerResponse = await testerBundle.handler(eventFor('POST', JSON.stringify({
    category:'Other',
    snapshot:{
      panelTitle:'General diagnostics'
    }
  }), {'x-pullback-tester-id':testerId}));
  const missingTickerBody = parseBody(missingTickerResponse);
  const storedMissingTicker = bundleStore.get(missingTickerBody.fullKey);
  assert(/BUG-\d{14}-UNKNOWN/.test(missingTickerBody.issueId), 'Missing ticker must become UNKNOWN in issue IDs.');
  assert(storedMissingTicker.summary.ticker === 'UNKNOWN', 'Missing ticker must become UNKNOWN in summary.');

  const reviewResponse = await testerBundle.handler(eventFor('POST', JSON.stringify({
    category:'Bad verdict',
    snapshot:{
      ticker:'MSFT',
      panelTitle:'Review diagnostics',
      stateHealth:{
        canonicalVerdict:'Avoid',
        visualBucket:'Near Entry',
        tone:'near_entry',
        planStatus:'Avoid',
        terminalAvoidApplied:true
      }
    }
  }), {'x-pullback-tester-id':testerId}));
  const reviewBody = parseBody(reviewResponse);
  const storedReview = bundleStore.get(reviewBody.fullKey);
  assert(storedReview.summary.canonicalVerdict === 'Avoid', 'Review bundle must extract summary from stateHealth.');
  assert(Array.isArray(storedReview.contradictions) && storedReview.contradictions.length >= 1, 'Review contradictions must be derived.');

  const trackResponse = await testerBundle.handler(eventFor('POST', JSON.stringify({
    category:'Other',
    snapshot:{
      ticker:'NVDA',
      panelTitle:'Track diagnostics',
      stateHealth:{
        canonicalVerdict:'Entry'
      },
      resolverTrace:{
        plan:{status:'Entry'}
      },
      sections:{
        track:{
          simplifiedState:{
            canonicalVerdict:'Entry',
            visualBucket:'Entry',
            tone:'entry',
            structureEligibility:'eligible',
            structureState:'intact',
            setupLocationState:'at_20ma',
            priceabilityState:'good',
            bounceState:'confirmed',
            planStatus:'Entry',
            resolvedRR:3.1,
            entryGatePass:true,
            nearEntryGatePass:true,
            primaryBlockerReason:'',
            divergenceDetected:false,
            terminalAvoidApplied:false
          },
          consistencyAudit:[{check:'verdict', ok:true}],
          lifecycleSnapshot:{state:'alive'},
          resolverTrace:{plan:{status:'Entry'}}
        }
      }
    }
  }), {'x-pullback-tester-id':testerId}));
  const trackBody = parseBody(trackResponse);
  const storedTrack = bundleStore.get(trackBody.fullKey);
  assert(storedTrack.summary.structureState === 'intact', 'Track bundle must extract summary from simplifiedState.');
  assert(storedTrack.extractedSections.track.consistencyAudit.length === 1, 'Track extracted sections must be preserved.');
  assert(trackBody.receipt.bundle === 'Track + General', 'Track snapshot receipt must label the bundle correctly.');

  const reviewBundleReceiptResponse = await testerBundle.handler(eventFor('POST', JSON.stringify({
    category:'Other',
    snapshot:{
      ticker:'AMAT',
      buildVersion:'v4.4.19',
      panelTitle:'Review + Track + General diagnostics',
      sections:{
        review:{ok:true},
        chartVerification:{ok:true},
        track:{consistencyAudit:[{ok:true}]}
      },
      stateHealth:{canonicalVerdict:'Watch'}
    }
  }), {'x-pullback-tester-id':testerId}));
  const reviewBundleReceiptBody = parseBody(reviewBundleReceiptResponse);
  assert(reviewBundleReceiptBody.receipt.bundle === 'Review + Track + General', 'Combined snapshot receipt must label the bundle correctly.');
  assert(reviewBundleReceiptBody.receipt.buildVersion === 'v4.4.19', 'Receipt must surface the snapshot build version.');
  assert(reviewBundleReceiptBody.receipt.workflow.status === 'submitted', 'Receipt must expose workflow status.');

  const writeFailStoreData = new Map();
  const failingTesterBundle = loadWithBlobStub(handlerPath, writeFailStoreData, {
    failSetForStore:'tester-issue-index'
  });
  const writeFailResponse = await failingTesterBundle.handler(eventFor('POST', JSON.stringify(sampleDiagnostics), {
    'x-pullback-tester-id':testerId
  }));
  const writeFailBody = parseBody(writeFailResponse);
  assert(writeFailResponse.statusCode === 502, 'Blob write failures must fail cleanly.');
  assert(writeFailBody.error === 'Failed to store tester diagnostics bundle.', 'Blob write failures must return a useful error response.');

  const testerReportUiStillExists =
    /submitTesterReportBtn/.test(indexSource)
    && /copyTesterSnapshotBtn/.test(indexSource)
    && /defaultTesterReportEndpoint = '\/api\/tester-report'/.test(appSource);
  assert(testerReportUiStillExists, 'Legacy tester report route and report UI controls must remain present.');
  assert(!/testerReportsList/.test(indexSource), 'No browse/read UI must be exposed to testers.');
  assert(!/httpMethod === 'GET'/.test(fs.readFileSync(handlerPath, 'utf8')), 'tester-bundle must not expose GET/list/read behavior.');

  const testerReportReadBlocked = await testerReport.handler({
    httpMethod:'GET',
    headers:{origin:'http://localhost:8888'},
    queryStringParameters:{mode:'list'}
  });
  assert(testerReportReadBlocked.statusCode === 403, 'tester-report.js security model must remain unchanged.');

  assert(/id="testerReportExpected"/.test(indexSource), 'Tester form must expose Expected field.');
  assert(/id="testerReportActual"/.test(indexSource), 'Tester form must expose Actual field.');
  assert(/defaultTesterBundleEndpoint = '\/api\/tester-bundle'/.test(appSource), 'App must target the new tester-bundle endpoint.');
  assert(/function testerReceiptMarkup\(/.test(appSource), 'App must render a tester submission receipt.');
  assert(/<strong>Issue:<\/strong>/.test(appSource), 'Receipt markup must show the issue section.');
  assert(/<strong>Build:<\/strong>/.test(appSource), 'Receipt markup must show the build section.');
  assert(/<strong>Bundle:<\/strong>/.test(appSource), 'Receipt markup must show the bundle section.');
  assert(/<strong>Status:<\/strong>/.test(appSource), 'Receipt markup must show the workflow status section.');
  assert(/<strong>Stored:<\/strong>/.test(appSource), 'Receipt markup must show the stored section.');
  assert(/<strong>Submitted:<\/strong>/.test(appSource), 'Receipt markup must show the submitted section.');
  assert(/Mark Closed/.test(indexSource) || /mark-recent-bug-closed/.test(appSource), 'Recent submitted bugs must support local Closed updates.');
  assert(/Submission failed: invalid JSON\./.test(appSource), 'App must keep invalid JSON failures friendly.');
  assert(/Submission failed: diagnostics payload is too large\./.test(appSource), 'App must keep oversized payload failures friendly.');
  assert(/Submission failed: network error\./.test(appSource), 'App must keep network failures friendly.');
  assert(/Submission failed: server could not store diagnostics\./.test(appSource), 'App must keep blob write failures friendly.');

  console.log('tester-bundle handler tests passed');
}

run().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
