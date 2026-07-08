const fs = require('fs');
const path = require('path');
const vm = require('vm');

const appPath = path.resolve(__dirname, '..', 'app.js');
const source = fs.readFileSync(appPath, 'utf8');

function extractFunction(name){
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  if(start === -1) throw new Error(`Could not find ${name} in app.js`);
  let parenDepth = 0;
  let signatureClosedAt = -1;
  for(let i = start + marker.length - 1; i < source.length; i += 1){
    const ch = source[i];
    if(ch === '(') parenDepth += 1;
    if(ch === ')'){
      parenDepth -= 1;
      if(parenDepth === 0){
        signatureClosedAt = i;
        break;
      }
    }
  }
  if(signatureClosedAt === -1) throw new Error(`Could not find signature end for ${name}`);
  let index = source.indexOf('{', signatureClosedAt);
  if(index === -1) throw new Error(`Could not find body for ${name}`);
  let depth = 1;
  let inString = false;
  let stringQuote = '';
  let inLineComment = false;
  let inBlockComment = false;
  let previous = '';
  for(let i = index + 1; i < source.length; i += 1){
    const ch = source[i];
    const next = source[i + 1];
    if(inLineComment){
      if(ch === '\n') inLineComment = false;
      previous = ch;
      continue;
    }
    if(inBlockComment){
      if(previous === '*' && ch === '/') inBlockComment = false;
      previous = ch;
      continue;
    }
    if(inString){
      if(ch === stringQuote && previous !== '\\') inString = false;
      previous = ch;
      continue;
    }
    if(ch === '/' && next === '/'){
      inLineComment = true;
      previous = ch;
      continue;
    }
    if(ch === '/' && next === '*'){
      inBlockComment = true;
      previous = ch;
      continue;
    }
    if(ch === '"' || ch === '\'' || ch === '`'){
      inString = true;
      stringQuote = ch;
      previous = ch;
      continue;
    }
    if(ch === '{') depth += 1;
    if(ch === '}'){
      depth -= 1;
      if(depth === 0) return source.slice(start, i + 1);
    }
    previous = ch;
  }
  throw new Error(`Could not parse ${name}`);
}

function assert(condition, message){
  if(!condition) throw new Error(message);
}

function createSandbox(){
  const record = {
    ticker:'TROW',
    review:{
      draft:null,
      manualReview:null,
      lastReviewedAt:'',
      savedSummary:'',
      savedVerdict:'',
      savedScore:null,
      cardOpen:false
    },
    watchlist:{inWatchlist:false},
    plan:{},
    scan:{},
    meta:{}
  };
  const dom = {
    entryPrice:{value:'110.27'},
    stopPrice:{value:'102.29'},
    targetPrice:{value:'136.19'}
  };
  const calls = {
    refreshTrackedTickerState:0,
    commitTickerState:0,
    updateWatchlistCardForTicker:0,
    markWatchlistDirty:0
  };
  const sandbox = {
    console,
    state:{tickers:[]},
    uiState:{activeReviewAddsToScannerUniverse:true, reviewRenderPass:1},
    reviewRenderSeq:1,
    startupCoordinator:{trackNeedsFullRender:false},
    activeReviewTicker(){
      return 'TROW';
    },
    currentChecks(){
      return {uptrend:true, bounce:true};
    },
    reviewChecklistContextForActiveTicker(){
      return {};
    },
    resolvedReviewChecksForDisplay(checks){
      return checks;
    },
    getReviewChecklistFallbackMeta(){
      return null;
    },
    isPerfDebugEnabled(){
      return false;
    },
    scoreAndStatusFromChecks(){
      return {score:8, status:'Entry'};
    },
    reviewSetupQualitySummary(){
      return 'Constructive setup.';
    },
    upsertTickerRecord(){
      return record;
    },
    setActiveReviewTicker(){},
    updateTickerInputFromState(){},
    refreshTrackedTickerState(){
      calls.refreshTrackedTickerState += 1;
    },
    commitTickerState(){
      calls.commitTickerState += 1;
    },
    activeWorkspaceTab(){
      return 'review';
    },
    updateWatchlistCardForTicker(){
      calls.updateWatchlistCardForTicker += 1;
    },
    markWatchlistDirty(){
      calls.markWatchlistDirty += 1;
    },
    renderWatchlist(){},
    renderFocusQueue(){},
    renderCards(){},
    renderReviewLifecycleSummary(){},
    normalizeImportedStatus(value){
      return String(value || '').trim().toLowerCase();
    },
    numericOrNull(value){
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    },
    $(id){
      return dom[id] || null;
    }
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(extractFunction('persistActiveReviewDraft'), sandbox, {filename:appPath});
  return {sandbox, record, calls};
}

function testAutosaveStaysDraftOnly(){
  const {sandbox, record, calls} = createSandbox();
  const result = sandbox.persistActiveReviewDraft({source:'review_autosave', manual:false});
  assert(result && result.saved === true, 'Autosave should report success.');
  assert(record.review.draft && record.review.draft.summary === 'Constructive setup.', 'Autosave should persist draft review content.');
  assert(record.review.manualReview === null, 'Autosave must not create review.manualReview authority.');
  assert(record.review.lastReviewedAt === '', 'Autosave must not set lastReviewedAt authority.');
  assert(record.review.savedVerdict === '', 'Autosave must not set savedVerdict authority.');
  assert(record.review.savedScore == null, 'Autosave must not set savedScore authority.');
  assert(calls.refreshTrackedTickerState === 0, 'Autosave must not refresh tracked ticker authority.');
  assert(calls.commitTickerState === 1, 'Autosave should still commit persisted draft state.');
}

function testExplicitSaveRemainsAuthoritative(){
  const {sandbox, record, calls} = createSandbox();
  const result = sandbox.persistActiveReviewDraft({source:'review_save', manual:true});
  assert(result && result.saved === true, 'Explicit save should report success.');
  assert(record.review.draft && record.review.draft.summary === 'Constructive setup.', 'Explicit save should keep draft state aligned.');
  assert(record.review.manualReview && record.review.manualReview.summary === 'Constructive setup.', 'Explicit save must persist manualReview authority.');
  assert(record.review.lastReviewedAt === record.review.manualReview.savedAt, 'Explicit save must stamp lastReviewedAt.');
  assert(record.review.savedVerdict === '', 'Explicit save must not persist savedVerdict authority.');
  assert(record.review.savedScore === 8, 'Explicit save must persist savedScore.');
  assert(calls.refreshTrackedTickerState === 1, 'Explicit save must refresh tracked ticker authority.');
  assert(calls.commitTickerState === 1, 'Explicit save should commit persisted state.');
}

testAutosaveStaysDraftOnly();
testExplicitSaveRemainsAuthoritative();

console.log('Review draft authority assertions passed.');
