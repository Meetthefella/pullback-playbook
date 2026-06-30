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
  calculateMaxLossFromRiskPercent(accountSize, riskPercent){
    const size = Number(accountSize);
    const percent = Number(riskPercent);
    if(!Number.isFinite(size) || !Number.isFinite(percent)) return 0;
    return size * (percent / 100);
  },
  normalizeTickerRecordsMap(value){
    return value && typeof value === 'object' ? value : {};
  },
  cloneData(value, fallback = null){
    const target = value == null ? fallback : value;
    return target == null ? target : JSON.parse(JSON.stringify(target));
  },
  persistableWatchlistState(value){
    const safe = value && typeof value === 'object' ? value : {};
    return {
      inWatchlist:!!safe.inWatchlist,
      addedAt:safe.addedAt || '',
      source:safe.source || ''
    };
  },
  persistableMetaState(value){
    const safe = value && typeof value === 'object' ? value : {};
    return {
      createdAt:safe.createdAt || '',
      updatedAt:safe.updatedAt || ''
    };
  },
  normalizeTickerRecord(record){
    const safe = record && typeof record === 'object' ? record : {};
    const ticker = String(safe.ticker || '').trim().toUpperCase();
    const marketData = safe.marketData && typeof safe.marketData === 'object' ? safe.marketData : {};
    const scan = safe.scan && typeof safe.scan === 'object' ? safe.scan : {};
    const review = safe.review && typeof safe.review === 'object' ? safe.review : {};
    const plan = safe.plan && typeof safe.plan === 'object' ? safe.plan : {};
    const watchlist = safe.watchlist && typeof safe.watchlist === 'object' ? safe.watchlist : {};
    const journal = safe.journal && typeof safe.journal === 'object' ? safe.journal : {};
    return {
      ticker,
      marketData:{
        price:marketData.price ?? null,
        asOf:marketData.asOf || '',
        source:marketData.source || '',
        ma20:marketData.ma20 ?? null,
        ma50:marketData.ma50 ?? null,
        ma200:marketData.ma200 ?? null,
        rsi:marketData.rsi ?? null,
        avgVolume:marketData.avgVolume ?? null,
        volume:marketData.volume ?? null,
        perf1w:marketData.perf1w ?? null,
        perf1m:marketData.perf1m ?? null,
        perf3m:marketData.perf3m ?? null,
        perf6m:marketData.perf6m ?? null,
        perfYtd:marketData.perfYtd ?? null,
        currency:marketData.currency || '',
        history:Array.isArray(marketData.history) ? marketData.history : [],
        previousClose:marketData.previousClose ?? null
      },
      scan:{
        scanType:scan.scanType || '',
        scanSetupType:scan.scanSetupType || '',
        setupOrigin:scan.setupOrigin || '',
        score:scan.score ?? null,
        resolvedVerdict:scan.resolvedVerdict || '',
        verdict:scan.verdict || '',
        reasons:Array.isArray(scan.reasons) ? scan.reasons : [],
        flags:scan.flags && typeof scan.flags === 'object' ? scan.flags : {},
        summary:scan.summary || '',
        riskStatus:scan.riskStatus || '',
        trendStatus:scan.trendStatus || '',
        pullbackStatus:scan.pullbackStatus || '',
        pullbackType:scan.pullbackType || '',
        analysisProjection:scan.analysisProjection && typeof scan.analysisProjection === 'object' ? scan.analysisProjection : null,
        lastScannedAt:scan.lastScannedAt || '',
        updatedAt:scan.updatedAt || ''
      },
      review:{
        notes:review.notes || '',
        savedVerdict:review.savedVerdict || '',
        savedSummary:review.savedSummary || '',
        savedScore:review.savedScore ?? null,
        lastReviewedAt:review.lastReviewedAt || '',
        manualReview:review.manualReview && typeof review.manualReview === 'object' ? review.manualReview : null,
        cardOpen:!!review.cardOpen,
        source:review.source || '',
        analysisState:review.analysisState && typeof review.analysisState === 'object' ? review.analysisState : null,
        chartAnalysisPipeline:review.chartAnalysisPipeline ?? null,
        draft:review.draft && typeof review.draft === 'object' ? review.draft : null
      },
      plan:{
        hasValidPlan:!!plan.hasValidPlan,
        entry:plan.entry || '',
        stop:plan.stop || '',
        firstTarget:plan.firstTarget || '',
        exitMode:plan.exitMode || '',
        targetReviewState:plan.targetReviewState || '',
        targetActionRecommendation:plan.targetActionRecommendation || '',
        targetAlert:plan.targetAlert && typeof plan.targetAlert === 'object' ? plan.targetAlert : {},
        riskPerShare:plan.riskPerShare ?? null,
        rewardPerShare:plan.rewardPerShare ?? null,
        plannedRR:plan.plannedRR ?? null,
        positionSize:plan.positionSize ?? null,
        positionCost:plan.positionCost ?? null,
        positionCostGbp:plan.positionCostGbp ?? null,
        quoteCurrency:plan.quoteCurrency || '',
        maxLoss:plan.maxLoss ?? null,
        riskStatus:plan.riskStatus || '',
        capitalFit:plan.capitalFit || '',
        tradeability:plan.tradeability || '',
        capitalNote:plan.capitalNote || '',
        affordability:plan.affordability || '',
        status:plan.status || '',
        triggerState:plan.triggerState || '',
        planValidationState:plan.planValidationState || '',
        needsReplan:!!plan.needsReplan,
        missedState:plan.missedState || '',
        invalidatedState:plan.invalidatedState || '',
        firstTargetTooClose:!!plan.firstTargetTooClose,
        source:plan.source || '',
        target:plan.target || '',
        lastValidatedAt:plan.lastValidatedAt || ''
      },
      setup:{
        rawScore:safe.setup && typeof safe.setup === 'object' ? safe.setup.rawScore ?? null : null,
        score:safe.setup && typeof safe.setup === 'object' ? safe.setup.score ?? null : null,
        convictionTier:safe.setup && typeof safe.setup === 'object' ? safe.setup.convictionTier || '' : '',
        practicalSizeFlag:safe.setup && typeof safe.setup === 'object' ? safe.setup.practicalSizeFlag || '' : '',
        verdict:safe.setup && typeof safe.setup === 'object' ? safe.setup.verdict || '' : '',
        reasons:safe.setup && typeof safe.setup === 'object' && Array.isArray(safe.setup.reasons) ? safe.setup.reasons : [],
        marketCaution:safe.setup && typeof safe.setup === 'object' ? safe.setup.marketCaution || '' : ''
      },
      watchlist:{
        inWatchlist:!!watchlist.inWatchlist,
        addedAt:watchlist.addedAt || '',
        source:watchlist.source || ''
      },
      lifecycle:safe.lifecycle && typeof safe.lifecycle === 'object' ? safe.lifecycle : {},
      diary:safe.diary && typeof safe.diary === 'object' ? {records:Array.isArray(safe.diary.records) ? safe.diary.records : []} : {records:[]},
      meta:safe.meta && typeof safe.meta === 'object' ? safe.meta : {},
      journal:{
        lastResult:journal.lastResult || '',
        lastTradedAt:journal.lastTradedAt || ''
      }
    };
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
  'buildPersistableTickerRecordsMap',
  'buildFullPersistedState',
  'mergePersistedStateLayers',
  'orderedPersistedLayerSummaries',
  'buildSettingsPersistedState',
  'normalizeRiskPercentInput',
  'canonicalizeRestoredRiskSettings',
  'currentMaxLoss',
  'canonicalRiskAmount',
  'currentRiskSettings'
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

function testCurrentRiskSettingsIgnoresStaleDerivedRisk(){
  sandbox.state = {
    accountSize:4000,
    riskPercent:1,
    maxLossOverride:'',
    userRiskPerTrade:4000,
    maxRisk:4000,
    wholeSharesOnly:true
  };
  const settings = sandbox.currentRiskSettings();
  assert(settings.max_loss_override === 40, 'Risk recompute must derive max_loss_override from canonical settings, not stale derived userRiskPerTrade.');
}

testFreshFallbackBeatsStaleFull();
testFullSnapshotTrimsDuplicateProjections();
testPersistenceOrderingDiagnostics();
testDraftOnlyReviewSurvivesNormalization();
testDraftOnlyReviewDoesNotCreateAuthorityDuringFullPersist();
testStaleDerivedRiskDoesNotOverrideCanonicalSettings();
testCurrentRiskSettingsIgnoresStaleDerivedRisk();

console.log('Storage persistence assertions passed.');
