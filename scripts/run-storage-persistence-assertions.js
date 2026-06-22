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
  normalizeTickerRecordsMap(value){
    return value && typeof value === 'object' ? value : {};
  }
};
sandbox.globalThis = sandbox;

[
  'withPersistMeta',
  'stripPersistMeta',
  'persistedAtMs',
  'persistedFormatLabel',
  'buildFullPersistedState',
  'mergePersistedStateLayers',
  'orderedPersistedLayerSummaries',
  'buildSettingsPersistedState'
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

testFreshFallbackBeatsStaleFull();
testFullSnapshotTrimsDuplicateProjections();
testPersistenceOrderingDiagnostics();

console.log('Storage persistence assertions passed.');
