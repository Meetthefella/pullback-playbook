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

const sandbox = {
  console,
  normalizeTicker(value){
    return String(value || '').trim().toUpperCase();
  },
  normalizeScanType(value){
    return String(value || '').trim();
  },
  numericOrNull(value){
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  },
  normalizeTickerRecordsMap(value){
    return value && typeof value === 'object' ? value : {};
  }
};
sandbox.globalThis = sandbox;

[
  'baseCard',
  'normalizeCard',
  'withPersistMeta',
  'stripPersistMeta',
  'persistedAtMs',
  'persistedFormatLabel',
  'buildFullPersistedState',
  'mergePersistedStateLayers',
  'orderedPersistedLayerSummaries',
  'buildSettingsPersistedState',
  'normalizeRiskPercentInput',
  'canonicalizeRestoredRiskSettings'
].forEach(name => {
  vm.runInNewContext(extractFunction(name), sandbox, {filename:appPath});
});

function assert(condition, message){
  if(!condition) throw new Error(message);
}

function testFreshFallbackBeatsStaleFull(){
  const settings = sandbox.buildSettingsPersistedState({
    accountSize:5000,
    marketStatus:'S&P above 50 MA'
  }, {persistedAt:'2026-06-22T09:00:00.000Z'});
  const full = sandbox.withPersistMeta({
    accountSize:4000,
    marketStatus:'S&P below 50 MA'
  }, {
    persistedAt:'2026-06-22T08:00:00.000Z',
    persistedFormat:'full'
  });
  const merged = sandbox.mergePersistedStateLayers([
    {name:'settings', priority:1, data:settings},
    {name:'full', priority:4, data:full}
  ]);
  assert(merged.accountSize === 5000, 'Fresh settings snapshot must override stale full snapshot account size.');
  assert(merged.marketStatus === 'S&P above 50 MA', 'Fresh settings snapshot must override stale full snapshot market status.');
}

function testFullSnapshotTrimsDuplicateProjections(){
  const full = sandbox.buildFullPersistedState({
    tickerRecords:{AAPL:{ticker:'AAPL'}},
    cards:[{ticker:'AAPL'}],
    scannerResults:[{ticker:'AAPL'}],
    watchlist:[{ticker:'AAPL'}],
    tradeDiary:[{ticker:'AAPL'}],
    scannerDebug:['debug'],
    lastImportRaw:'AAPL',
    listName:'Today'
  }, {
    persistedAt:'2026-06-22T09:05:00.000Z'
  });
  assert(Array.isArray(full.cards) && full.cards.length === 0, 'Full snapshot must drop legacy cards projection.');
  assert(Array.isArray(full.scannerResults) && full.scannerResults.length === 0, 'Full snapshot must drop scannerResults projection.');
  assert(Array.isArray(full.watchlist) && full.watchlist.length === 0, 'Full snapshot must drop watchlist projection.');
  assert(Array.isArray(full.tradeDiary) && full.tradeDiary.length === 0, 'Full snapshot must drop tradeDiary projection.');
  assert(Array.isArray(full.scannerDebug) && full.scannerDebug.length === 0, 'Full snapshot must drop scannerDebug payload.');
  assert(full.lastImportRaw === '', 'Full snapshot must clear lastImportRaw.');
  assert(full.listName === 'Today', 'Full snapshot must preserve real user state.');
}

function testPersistenceOrderingDiagnostics(){
  const settings = sandbox.buildSettingsPersistedState({}, {
    persistedAt:'2026-06-22T09:00:00.000Z'
  });
  const full = sandbox.withPersistMeta({}, {
    persistedAt:'2026-06-22T09:30:00.000Z',
    persistedFormat:'full'
  });
  const ordered = sandbox.orderedPersistedLayerSummaries([
    {name:'settings', priority:1, data:settings},
    {name:'full', priority:4, data:full}
  ]);
  assert(Array.isArray(ordered) && ordered.length === 2, 'Ordered persistence summaries must include each layer.');
  assert(ordered[0].name === 'settings', 'Older settings layer must appear first.');
  assert(ordered[1].name === 'full', 'Newer full layer must appear last.');
}

function testDraftOnlyReviewSurvivesNormalization(){
  const normalized = sandbox.normalizeCard({
    ticker:'TROW',
    draft:{
      checks:{uptrend:true, bounce:true},
      entry:'110.27',
      stop:'102.29',
      target:'136.19',
      summary:'Constructive setup.',
      savedAt:'2026-06-28T20:00:00.000Z'
    },
    manualReview:null,
    savedVerdict:'',
    savedScore:null
  });
  assert(normalized.draft && normalized.draft.entry === '110.27', 'Draft-only review payload must survive app normalization.');
  assert(normalized.draft && normalized.draft.checks && normalized.draft.checks.bounce === true, 'Draft checklist state must survive app normalization.');
  assert(normalized.manualReview === null, 'Draft-only review must not create manualReview authority during normalization.');
}

function testDraftOnlyReviewDoesNotCreateAuthorityDuringFullPersist(){
  const full = sandbox.buildFullPersistedState({
    tickerRecords:{
      TROW:{
        ticker:'TROW',
        review:{
          draft:{
            checks:{uptrend:true},
            entry:'110.27',
            stop:'102.29',
            target:'136.19',
            summary:'Constructive setup.',
            savedAt:'2026-06-28T20:00:00.000Z'
          },
          manualReview:null,
          savedVerdict:'',
          savedScore:null
        }
      }
    }
  }, {
    persistedAt:'2026-06-28T20:01:00.000Z'
  });
  const review = full.tickerRecords && full.tickerRecords.TROW && full.tickerRecords.TROW.review
    ? full.tickerRecords.TROW.review
    : null;
  assert(review && review.draft && review.draft.target === '136.19', 'Full persisted state must retain draft-only review state.');
  assert(review && review.manualReview === null, 'Full persisted state must not invent manualReview authority for draft-only reviews.');
  assert(review && review.savedVerdict === '', 'Full persisted state must keep savedVerdict empty for draft-only reviews.');
  assert(review && review.savedScore == null, 'Full persisted state must keep savedScore empty for draft-only reviews.');
}

function testStaleDerivedRiskDoesNotOverrideCanonicalSettings(){
  const restored = {
    accountSize:4000,
    riskPercent:1,
    maxLossOverride:'',
    userRiskPerTrade:4000,
    maxRisk:4000
  };
  sandbox.canonicalizeRestoredRiskSettings(restored, {
    accountSize:4000,
    riskPercent:1,
    maxLossOverride:'',
    userRiskPerTrade:4000,
    maxRisk:4000
  });
  assert(restored.maxLossOverride === '', 'Stale derived full-account risk must not become maxLossOverride during restore.');
  assert(restored.riskPercent === 1, 'Canonical explicit riskPercent must survive stale derived maxRisk restore.');
  assert(restored.userRiskPerTrade === 0, 'Derived userRiskPerTrade must be cleared before recomputation during restore.');
  assert(restored.maxRisk === 0, 'Derived maxRisk must be cleared before recomputation during restore.');
}

testFreshFallbackBeatsStaleFull();
testFullSnapshotTrimsDuplicateProjections();
testPersistenceOrderingDiagnostics();
testDraftOnlyReviewSurvivesNormalization();
testDraftOnlyReviewDoesNotCreateAuthorityDuringFullPersist();
testStaleDerivedRiskDoesNotOverrideCanonicalSettings();

console.log('Storage persistence assertions passed.');
