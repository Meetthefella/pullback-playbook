const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const serverSource = fs.readFileSync(path.join(root, 'netlify', 'functions', 'analyse-setup.js'), 'utf8');

function loadBrowserModule(relativePath, sandbox){
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  vm.runInNewContext(source, sandbox, {filename:relativePath});
}

function extractFunctionSource(source, functionName){
  const start = source.indexOf(`function ${functionName}`);
  if(start < 0) throw new Error(`Unable to find ${functionName}`);
  const paramsStart = source.indexOf('(', start);
  let paramDepth = 0;
  let paramsEnd = -1;
  for(let index = paramsStart; index < source.length; index += 1){
    const char = source[index];
    if(char === '(') paramDepth += 1;
    if(char === ')'){
      paramDepth -= 1;
      if(paramDepth === 0){
        paramsEnd = index;
        break;
      }
    }
  }
  const bodyStart = source.indexOf('{', paramsEnd);
  let depth = 0;
  for(let index = bodyStart; index < source.length; index += 1){
    const char = source[index];
    if(char === '{') depth += 1;
    if(char === '}'){
      depth -= 1;
      if(depth === 0){
        return source.slice(start, index + 1);
      }
    }
  }
  throw new Error(`Unable to extract ${functionName}`);
}

async function runNetlifyCanonicalizationRegression(){
  const modulePath = path.join(root, 'netlify', 'functions', 'analyse-setup.js');
  delete require.cache[modulePath];
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENAI_MODEL = 'gpt-4o-mini';

  const trustedMarketContext = {
    ticker:'NVDA',
    timeframe:'1D',
    currentPrice:200.09,
    ma20:205.74,
    ma50:209.99,
    ma200:190.84,
    volume:18345000,
    latestCandleOHLC:{
      date:'2026-06-30',
      open:198.42,
      high:201.17,
      low:197.85,
      close:200.09,
      volume:18345000
    },
    recentCandleSequence:[
      {date:'2026-06-30', open:198.42, high:201.17, low:197.85, close:200.09, volume:18345000},
      {date:'2026-06-29', open:196.91, high:199.63, low:195.8, close:198.77, volume:17122000},
      {date:'2026-06-28', open:194.4, high:197.11, low:193.98, close:196.2, volume:16220000}
    ],
    currentAppDerivedTradePlan:{
      entry:201.1,
      stop:196.4,
      firstTarget:210.8,
      rewardRiskRatio:2.06,
      status:'valid',
      riskStatus:'fits_risk'
    },
    sourceConfidence:{
      ticker:'record_ticker',
      timeframe:'review_default_daily',
      currentPrice:'trusted_market_data',
      ma20:'trusted_market_data',
      ma50:'trusted_market_data',
      ma200:'trusted_market_data',
      volume:'trusted_market_data',
      latestCandleOHLC:'trusted_market_history',
      recentCandleSequence:'trusted_market_history',
      currentAppDerivedTradePlan:'current_review_plan'
    }
  };

  const aiPayload = {
    extractedFromImage:{
      visible_ticker:'NVDA',
      visible_timeframe:'1D',
      visible_latest_price:null,
      visible_ma20:null,
      visible_ma50:null,
      visible_ma200:null,
      extraction_warnings:['20MA label unreadable on image.', '50MA label unreadable on image.']
    },
    candleStructureAnalysis:{
      summary:'Price is below the 20MA and 50MA but above the 200MA. Recent candles show a bounce attempt, but follow-through is still missing.',
      noviceFriendlyCandleRead:'The latest candles show buyers trying to bounce, but there is not enough follow-through yet to confirm the move.',
      resolverAlignment:'Supports Watch rather than Entry because confirmation is still missing.'
    },
    tradePlanCommentary:{
      summary:'Estimated maths exist, but confirmation is still missing before the setup is actionable.'
    },
    confidenceWarnings:[
      '20MA label unreadable on image.',
      '50MA label unreadable on image.'
    ],
    coach_summary:'Price is below the 20MA and 50MA but above the 200MA. Recent candles show a bounce attempt, but follow-through is still missing.'
  };

  const fetchCalls = [];
  global.fetch = async (url, options = {}) => {
    fetchCalls.push({url, options});
    return {
      ok:true,
      status:200,
      json:async () => ({
        output_text:JSON.stringify(aiPayload)
      })
    };
  };

  const {handler} = require(modulePath);
  const response = await handler({
    httpMethod:'POST',
    body:JSON.stringify({
      payload:{
        ticker:'NVDA',
        marketStatus:'S&P above 50 MA',
        trustedMarketContext
      },
      prompt:'Return JSON only.'
    })
  });

  assert.strictEqual(fetchCalls.length, 1, 'Expected one OpenAI request');
  const body = JSON.parse(response.body);
  assert.strictEqual(response.statusCode, 200, 'Handler should succeed');
  assert.strictEqual(body.analysis.canonicalValues.price, 200.09, 'Canonical price must come from trusted market context');
  assert.strictEqual(body.analysis.canonicalValues.ma20, 205.74, 'Canonical 20MA must come from trusted market context');
  assert.strictEqual(body.analysis.canonicalValues.ma50, 209.99, 'Canonical 50MA must come from trusted market context');
  assert.strictEqual(body.analysis.canonicalValues.ma200, 190.84, 'Canonical 200MA must come from trusted market context');
  assert.strictEqual(body.analysis.trustedMarketContext.currentPrice, 200.09, 'Trusted context should be preserved');
  assert.strictEqual(body.analysis.visible_ma20, null, 'Unreadable image MA should remain unreadable in extracted image facts');
  assert.ok(/below the 20MA and 50MA but above the 200MA/i.test(body.analysis.coach_summary), 'Summary should reflect canonical MA relationship');
  assert.ok(/bounce attempt/i.test(body.analysis.coach_summary), 'Summary should mention bounce attempt');

  global.fetch = async () => ({
    ok:true,
    status:200,
    json:async () => ({
      output_text:'{"broken": true'
    })
  });
  const malformedResponse = await handler({
    httpMethod:'POST',
    body:JSON.stringify({
      payload:{
        ticker:'NVDA',
        marketStatus:'S&P above 50 MA',
        trustedMarketContext
      },
      prompt:'Return JSON only.'
    })
  });
  const malformedBody = JSON.parse(malformedResponse.body);
  assert.strictEqual(malformedResponse.statusCode, 200, 'Malformed JSON with trusted market context should still return usable analysis');
  assert.ok(/malformed json/i.test(String(malformedBody.analysis.parseWarning || '')), 'Malformed JSON fallback should record a parse warning');
  const malformedSummary = String(malformedBody.analysis.candleStructureAnalysis && malformedBody.analysis.candleStructureAnalysis.summary || '');
  assert.ok(/below the 20MA/i.test(malformedSummary) && /below the 50MA/i.test(malformedSummary) && /above the 200MA/i.test(malformedSummary), 'Malformed JSON fallback should include deterministic candle summary with canonical MA relationships');
  assert.strictEqual(Array.isArray(malformedBody.analysis.chartCoach && malformedBody.analysis.chartCoach.sections) ? malformedBody.analysis.chartCoach.sections.length : -1, 0, 'Malformed JSON server fallback should not emit a legacy Chart Guru section list');
  assert.strictEqual(malformedBody.analysis.chartCoach && malformedBody.analysis.chartCoach.primaryStory, null, 'Malformed JSON server fallback should defer primary story selection to the shared deterministic builder');
}

function runReviewPresentationRegression(){
  const sandbox = {
    window:{},
    console
  };
  sandbox.globalThis = sandbox.window;
  loadBrowserModule('js/review-presentation.js', sandbox);
  const presentation = sandbox.window.ReviewPresentation;
  assert.ok(presentation && typeof presentation.tradeStatusMetricText === 'function', 'ReviewPresentation must load');
  const status = presentation.tradeStatusMetricText({
    globalVerdict:{
      final_verdict:'watch',
      structure_state:'intact',
      structure_eligibility:'alive',
      bounce_state:'attempt',
      plan_status:'valid',
      hasPriceablePlan:true,
      near_entry_gate_pass:false,
      main_blocker:'Structure is broken.'
    },
    resolvedContract:{}
  }, {
    normalizeGlobalVerdictKey(value){
      return String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
    }
  });
  assert.ok(!/Structure is broken/i.test(status.line1), 'Review copy must not use structural-break wording for a live watch setup');
}

function runPresentationModelRegression(){
  const sandbox = {
    window:{},
    console
  };
  sandbox.globalThis = sandbox.window;
  sandbox.window.ResolverCore = {
    normalizeGlobalVerdictKey(value){
      const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
      return ['entry','near_entry','watch','avoid'].includes(safe) ? safe : 'watch';
    },
    normalizeVerdict(value){
      return String(value || '').trim().toLowerCase();
    },
    globalVerdictLabel(value){
      return value;
    }
  };
  loadBrowserModule('js/presentation/simplified-presentation-model.js', sandbox);
  const model = sandbox.window.SimplifiedPresentationModel.buildPresentationModel({
    record:{ticker:'NVDA', marketData:{price:200.09, ma50:209.99}},
    planState:{status:'valid', planVisible:true},
    resolvedState:{
      final_verdict:'watch',
      structure_state:'intact',
      structure_eligibility:'alive',
      main_blocker:'Structure is broken.',
      hasProvisionalPriceablePlan:true
    },
    visualState:{
      canonicalVerdict:'watch',
      visualBucket:'monitor',
      tone:'monitor'
    }
  });
  assert.ok(/confirmation|estimated maths/i.test(String(model.mainBlocker || '')), 'Presentation model should reframe false structural-break copy as a confirmation issue');
  assert.ok(!/^Structure is broken\.?$/i.test(String(model.mainBlocker || '')), 'Presentation model must not preserve generic structural-break copy');
}

function runDeterministicCandleFallbackRegression(){
  const sandbox = {
    console,
    numericOrNull(value){
      if(value === null || value === undefined || value === '') return null;
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    },
    normalizeGlobalVerdictKey(value){
      const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
      return ['entry','near_entry','watch','avoid'].includes(safe) ? safe : 'watch';
    },
    normalizeTickerRecord(record){
      return record && typeof record === 'object' ? record : {};
    },
    resolveGlobalVerdict(record){
      return record._globalVerdict || {final_verdict:'watch'};
    },
    analysisDerivedStatesFromRecord(){
      return {structureState:'intact', setupLocationState:'near_50ma', priceabilityState:'provisional', bounceState:'attempt', stabilisationState:'early'};
    },
    guardAnalysisMovingAverageLanguage(text = ''){
      return {
        text:String(text || ''),
        applied:false,
        reason:'stub',
        priceVs20:'',
        priceVs50:'',
        price:null,
        sma50:null,
        matchedPhrase:'',
        outputChanged:false
      };
    },
    sanitizeAliveWatchSemanticCopy(text){
      return String(text || '');
    }
  };
  vm.createContext(sandbox);
  [
    'chartCoachPriorityForKey',
    'chartCoachProximityLabel',
    'finalizeChartCoachSections',
    'chartCoachDiagnosticsForSections',
    'mergeChartCoachSections',
    'chartCoachConfidenceSentence',
    'chartCoachBodyDescriptor',
    'chartCoachStructureSignals',
    'chartCoachPrimaryOpportunityScore',
    'chartCoachRecentColorRun',
    'chartCoachLargeBodyRun',
    'chartCoachLearningPointForStory',
    'chartCoachWhatNextForStory',
    'chartCoachPrimaryStoryCandidates',
    'buildDeterministicChartCoach',
    'chartCoachModelIsUsable',
    'describeCandleBodyDirection',
    'candleWickRejectionState',
    'isGenericAiCandleCommentary',
    'normalizeCandleSequenceOrder',
    'aiCandleCommentaryContradictsCanonical',
    'isGenericTradePlanCommentary',
    'canonicalCandleContext',
    'deterministicCandleStructureSummary',
    'selectReviewAiSummary',
    'finalDisplayedAnalysisChartRead'
  ].forEach(name => {
    vm.runInContext(extractFunctionSource(appSource, name), sandbox, {filename:`app.js#${name}`});
  });

  const bounceRecord = {
    marketData:{price:200.09, ma20:205.74, ma50:209.99, ma200:190.84},
    _globalVerdict:{final_verdict:'watch'}
  };
  const bounceAnalysis = {
    canonicalValues:{price:200.09, ma20:205.74, ma50:209.99, ma200:190.84},
    trustedMarketContext:{
      recentCandleSequence:[
        {date:'2026-06-30', open:198.4, high:201.2, low:197.9, close:200.09, volume:1000},
        {date:'2026-06-29', open:199.8, high:200.0, low:196.7, close:198.7, volume:1000},
        {date:'2026-06-28', open:201.0, high:201.5, low:198.9, close:199.2, volume:1000}
      ]
    },
    plain_english_chart_read:'Interesting setup. Needs confirmation.'
  };
  const bounceFallback = sandbox.deterministicCandleStructureSummary(bounceRecord, bounceAnalysis, {
    globalVerdict:bounceRecord._globalVerdict
  });
  assert.ok(/below the 20MA/i.test(bounceFallback.text) && /below the 50MA/i.test(bounceFallback.text) && /above the 200MA/i.test(bounceFallback.text), 'Fallback should describe MA relationship');
  assert.ok(/bounce attempt/i.test(bounceFallback.text), 'Fallback should identify bounce attempt');
  assert.ok(/confirmation is still missing/i.test(bounceFallback.text), 'Fallback should require confirmation');

  const failedBounceAnalysis = {
    canonicalValues:{price:198.1, ma20:205.74, ma50:209.99, ma200:190.84},
    trustedMarketContext:{
      recentCandleSequence:[
        {date:'2026-07-01', open:200.3, high:202.4, low:197.8, close:198.1, volume:1000},
        {date:'2026-06-30', open:198.2, high:201.1, low:197.9, close:200.4, volume:1000},
        {date:'2026-06-29', open:197.5, high:198.6, low:195.9, close:197.8, volume:1000}
      ]
    }
  };
  const failedBounceFallback = sandbox.deterministicCandleStructureSummary({...bounceRecord, _globalVerdict:{final_verdict:'watch'}}, failedBounceAnalysis, {
    globalVerdict:{final_verdict:'watch'}
  });
  assert.ok(/failed bounce|sellers pushed it back down/i.test(failedBounceFallback.text), 'Fallback should identify failed bounce or rejection');

  const finalRead = sandbox.finalDisplayedAnalysisChartRead(bounceRecord, bounceAnalysis);
  assert.strictEqual(finalRead.usedDeterministicFallback, true, 'Generic AI output should be replaced by deterministic fallback');
  assert.ok(/🎯 What next\?:/i.test(finalRead.text), 'Fallback should include a What next section');
  assert.strictEqual(finalRead.selectedSummarySource, 'deterministic_chart_coach', 'Fallback should use deterministic Chart Coach');
  assert.ok(finalRead.chartCoach && Array.isArray(finalRead.chartCoach.sections) && finalRead.chartCoach.sections.length >= 2, 'Fallback should expose structured Chart Coach sections');
  assert.ok(finalRead.chartCoach.diagnostics && Array.isArray(finalRead.chartCoach.diagnostics.sectionConfidence), 'Chart Coach should expose section confidence diagnostics');

  const shortSpecificRead = sandbox.finalDisplayedAnalysisChartRead(
    bounceRecord,
    {
      ...bounceAnalysis,
      plain_english_chart_read:'Below 20/50, above 200; follow-through still missing.'
    }
  );
  assert.strictEqual(shortSpecificRead.usedDeterministicFallback, true, 'Chart Coach should stay deterministic even when short AI prose exists');
  assert.ok(/Biggest clue:/i.test(shortSpecificRead.text), 'Deterministic Chart Guru should render a primary story first');

  const malformedFallbackRead = sandbox.finalDisplayedAnalysisChartRead(
    bounceRecord,
    {
      parseWarning:'Model response was malformed JSON. Deterministic chart summary used instead.',
      canonicalValues:bounceAnalysis.canonicalValues,
      trustedMarketContext:bounceAnalysis.trustedMarketContext,
      candleStructureAnalysis:{
        summary:'Price is below the 20MA and 50MA but above the 200MA. Recent candles show a bounce attempt, but follow-through is still missing.'
      },
      tradePlanCommentary:{
        summary:'Estimated maths exist, but confirmation is still missing before any entry is valid.'
      },
      chartCoach:{
        primaryStory:null,
        sections:[],
        summaryText:'',
        source:'',
        renderVersion:'chart-guru-v1',
        explanationFacts:['parse_fallback']
      }
    }
  );
  assert.strictEqual(malformedFallbackRead.selectedSummarySource, 'deterministic_chart_coach', 'Malformed AI response should use the shared deterministic Chart Guru builder');
  assert.strictEqual(malformedFallbackRead.chartCoach.primaryStory.key, finalRead.chartCoach.primaryStory.key, 'Malformed AI fallback should preserve the same deterministic primary story');
  assert.deepStrictEqual(malformedFallbackRead.chartCoach.sections.map(section => section.key), finalRead.chartCoach.sections.map(section => section.key), 'Malformed AI fallback should match the normal deterministic Chart Guru section order');
  assert.strictEqual(malformedFallbackRead.text, finalRead.text, 'Malformed AI fallback should render the same deterministic Chart Guru text for the same verified inputs');

  const structuredBeatsLegacy = sandbox.finalDisplayedAnalysisChartRead(
    bounceRecord,
    {
      ...bounceAnalysis,
      coach_summary:'observe how price behaves around key moving averages',
      plain_english_chart_read:'observe how price behaves around key moving averages',
      candleStructureAnalysis:{
        summary:'Price is below the 20MA and 50MA but above the 200MA. Recent candles show a bounce attempt, and follow-through is still missing.'
      }
    }
  );
  assert.strictEqual(structuredBeatsLegacy.selectedSummarySource, 'deterministic_chart_coach', 'Deterministic Chart Coach should replace legacy summary authority ordering');
  assert.ok(/Biggest clue:/i.test(structuredBeatsLegacy.text), 'Structured Chart Guru should render in Review');

  const tradePlanBeatsGenericLegacy = sandbox.finalDisplayedAnalysisChartRead(
    bounceRecord,
    {
      ...bounceAnalysis,
      candleStructureAnalysis:{summary:'Interesting setup. Monitor.'},
      tradePlanCommentary:{summary:'Estimated maths exist, but confirmation is still missing before any entry is valid.'},
      coach_summary:'observe how price behaves around key moving averages',
      plain_english_chart_read:'observe how price behaves around key moving averages'
    }
  );
  assert.strictEqual(tradePlanBeatsGenericLegacy.selectedSummarySource, 'deterministic_chart_coach', 'Trade plan commentary should not override deterministic Chart Coach');
  assert.ok(/🎯 What next\?:/i.test(tradePlanBeatsGenericLegacy.text), 'Chart Coach should still finish with What next');

  const shortVagueRead = sandbox.finalDisplayedAnalysisChartRead(
    bounceRecord,
    {
      ...bounceAnalysis,
      plain_english_chart_read:'Interesting setup. Monitor.'
    }
  );
  assert.strictEqual(shortVagueRead.usedDeterministicFallback, true, 'Short vague AI candle read should be replaced');

  const nearEntryRead = sandbox.finalDisplayedAnalysisChartRead(
    {...bounceRecord, _globalVerdict:{final_verdict:'near_entry'}},
    {
      ...bounceAnalysis,
      plain_english_chart_read:'Price is above the 20MA with confirmed follow-through.'
    }
  );
  assert.ok(!/\bready for entry\b|\bthis is an entry signal\b|\bgo long\b|\bexecute entry\b/i.test(nearEntryRead.text), 'Chart Coach must not promote Entry by itself');
  assert.ok(/🎯 What next\?:/i.test(nearEntryRead.text), 'Chart Coach should keep the next-step framing');

  const descending = [
    {date:'2026-06-30', open:198.4, high:201.2, low:197.9, close:200.09, volume:1000},
    {date:'2026-06-29', open:199.8, high:200.0, low:196.7, close:198.7, volume:1000},
    {date:'2026-06-28', open:201.0, high:201.5, low:198.9, close:199.2, volume:1000}
  ];
  const ascending = descending.slice().reverse();
  const descendingContext = sandbox.canonicalCandleContext(bounceRecord, {
    canonicalValues:bounceAnalysis.canonicalValues,
    trustedMarketContext:{recentCandleSequence:descending}
  });
  const ascendingContext = sandbox.canonicalCandleContext(bounceRecord, {
    canonicalValues:bounceAnalysis.canonicalValues,
    trustedMarketContext:{recentCandleSequence:ascending}
  });
  assert.strictEqual(descendingContext.latest.close, ascendingContext.latest.close, 'Ascending candle input should normalize to the same latest candle');
  assert.strictEqual(descendingContext.prior.close, ascendingContext.prior.close, 'Ascending candle input should normalize to the same prior candle');
  assert.strictEqual(descendingContext.bounceAttempt, ascendingContext.bounceAttempt, 'Bounce direction must not flip because of candle order');
  assert.strictEqual(descendingContext.failedBounce, ascendingContext.failedBounce, 'Failed-bounce direction must not flip because of candle order');

  const ascendingFailed = failedBounceAnalysis.trustedMarketContext.recentCandleSequence.slice().reverse();
  const failedDescendingSummary = sandbox.deterministicCandleStructureSummary(
    {...bounceRecord, _globalVerdict:{final_verdict:'watch'}},
    failedBounceAnalysis,
    {globalVerdict:{final_verdict:'watch'}}
  );
  const failedAscendingSummary = sandbox.deterministicCandleStructureSummary(
    {...bounceRecord, _globalVerdict:{final_verdict:'watch'}},
    {
      ...failedBounceAnalysis,
      trustedMarketContext:{recentCandleSequence:ascendingFailed}
    },
    {globalVerdict:{final_verdict:'watch'}}
  );
  assert.strictEqual(failedDescendingSummary.facts.failedBounce, failedAscendingSummary.facts.failedBounce, 'Fallback summary must not flip failed-bounce direction because of order');

  const supportRead = sandbox.finalDisplayedAnalysisChartRead(
    {
      marketData:{price:100.4, ma20:100.1, ma50:98.8, ma200:90},
      _globalVerdict:{final_verdict:'watch'}
    },
    {
      canonicalValues:{price:100.4, ma20:100.1, ma50:98.8, ma200:90, volume:1500000},
      trustedMarketContext:{
        recentCandleSequence:[
          {date:'2026-07-01', open:99.95, high:100.7, low:99.2, close:100.4, volume:1500000},
          {date:'2026-06-30', open:100.9, high:101.0, low:99.8, close:99.9, volume:1300000},
          {date:'2026-06-29', open:101.6, high:101.9, low:100.3, close:100.8, volume:1200000}
        ]
      }
    }
  );
  assert.ok(
    supportRead.chartCoach.primaryStory.key === 'long_lower_wick_support_test'
      || supportRead.chartCoach.sections.some(section => section.key === 'support'),
    'Chart Guru should explain support when buyers step in near support'
  );

  const resistanceRead = sandbox.finalDisplayedAnalysisChartRead(
    {
      marketData:{price:101.0, ma20:100.2, ma50:99.1, ma200:92},
      _globalVerdict:{final_verdict:'watch'}
    },
    {
      canonicalValues:{price:101.0, ma20:100.2, ma50:99.1, ma200:92, volume:1600000},
      trustedMarketContext:{
        recentCandleSequence:[
          {date:'2026-07-01', open:100.9, high:102.7, low:100.8, close:101.1, volume:1600000},
          {date:'2026-06-30', open:100.1, high:101.7, low:99.9, close:101.3, volume:1400000},
          {date:'2026-06-29', open:99.7, high:101.1, low:99.4, close:100.6, volume:1300000}
        ]
      }
    }
  );
  assert.ok(
    resistanceRead.chartCoach.primaryStory.key === 'long_upper_wick_rejection'
      || resistanceRead.chartCoach.sections.some(section => section.key === 'resistance'),
    'Chart Guru should explain resistance rejection when sellers push price back'
  );

  const dojiRead = sandbox.finalDisplayedAnalysisChartRead(
    bounceRecord,
    {
      canonicalValues:{price:200.01, ma20:205.74, ma50:209.99, ma200:190.84, volume:1000},
      trustedMarketContext:{
        recentCandleSequence:[
          {date:'2026-07-01', open:200.0, high:201.2, low:198.9, close:200.01, volume:1000},
          {date:'2026-06-30', open:198.2, high:200.9, low:197.7, close:199.8, volume:1200},
          {date:'2026-06-29', open:197.8, high:199.7, low:197.3, close:198.4, volume:1100}
        ]
      }
    }
  );
  assert.ok(/Indecision:|Biggest clue:/i.test(dojiRead.text), 'Chart Guru should explain doji or indecision candles');
  assert.ok(/neither buyers nor sellers proved much control|neither side showed clear control/i.test(dojiRead.text), 'Indecision explanation should be beginner-friendly');

  const rankingModel = sandbox.buildDeterministicChartCoach(
    bounceRecord,
    {
      canonicalValues:{price:100, ma20:101, ma50:103, ma200:90, volume:2500000},
      trustedMarketContext:{
        avgVolume30d:1000000,
        recentCandleSequence:[
          {date:'2026-07-01', open:99.9, high:100.6, low:98.7, close:100.4, volume:2500000},
          {date:'2026-06-30', open:100.8, high:101.3, low:99.6, close:100.1, volume:1500000},
          {date:'2026-06-29', open:101.7, high:102.1, low:100.4, close:101.0, volume:1200000}
        ]
      }
    },
    {globalVerdict:{final_verdict:'watch'}}
  );
  assert.strictEqual(rankingModel.sections[0].key, 'biggest_clue', 'Primary story should render first as Biggest clue');
  assert.strictEqual(rankingModel.sections.filter(section => section.key === 'learning_point').length, 1, 'Only one Learning point section should render');
  assert.ok(rankingModel.sections.some(section => section.key === 'what_next'), 'What next should still be rendered');

  const strongGreenDescending = {
    canonicalValues:{price:186.4, ma20:180.2, ma50:174.1, ma200:156.8, volume:1900000},
    trustedMarketContext:{
      avgVolume30d:1000000,
      recentCandleSequence:[
        {date:'2026-07-01', open:178.6, high:186.9, low:177.9, close:186.4, volume:1900000},
        {date:'2026-06-30', open:176.1, high:179.0, low:175.8, close:178.4, volume:1200000},
        {date:'2026-06-29', open:173.4, high:176.4, low:173.0, close:175.9, volume:980000}
      ]
    }
  };
  const strongGreenAscending = {
    ...strongGreenDescending,
    trustedMarketContext:{
      ...strongGreenDescending.trustedMarketContext,
      recentCandleSequence:strongGreenDescending.trustedMarketContext.recentCandleSequence.slice().reverse()
    }
  };
  const descendingGreenCoach = sandbox.buildDeterministicChartCoach(
    {marketData:{price:186.4, ma20:180.2, ma50:174.1, ma200:156.8, avgVolume30d:1000000}},
    strongGreenDescending,
    {globalVerdict:{final_verdict:'watch'}}
  );
  const ascendingGreenCoach = sandbox.buildDeterministicChartCoach(
    {marketData:{price:186.4, ma20:180.2, ma50:174.1, ma200:156.8, avgVolume30d:1000000}},
    strongGreenAscending,
    {globalVerdict:{final_verdict:'watch'}}
  );
  assert.strictEqual(descendingGreenCoach.primaryStory.key, 'strong_upside_acceleration', 'True consecutive strong green runs should trigger upside acceleration');
  assert.strictEqual(ascendingGreenCoach.primaryStory.key, descendingGreenCoach.primaryStory.key, 'Oldest-first and newest-first candle input should choose the same primary story');

  const mixedColorCoach = sandbox.buildDeterministicChartCoach(
    {marketData:{price:110, ma20:104, ma50:100, ma200:92, avgVolume30d:1000000}},
    {
      canonicalValues:{price:110, ma20:104, ma50:100, ma200:92, volume:1800000},
      trustedMarketContext:{
        avgVolume30d:1000000,
        recentCandleSequence:[
          {date:'2026-07-01', open:104.2, high:110.8, low:103.9, close:110.0, volume:1800000},
          {date:'2026-06-30', open:108.3, high:108.8, low:103.2, close:104.1, volume:1600000},
          {date:'2026-06-29', open:101.4, high:108.5, low:100.9, close:108.0, volume:1500000},
          {date:'2026-06-28', open:99.7, high:102.1, low:99.1, close:101.2, volume:1100000}
        ]
      }
    },
    {globalVerdict:{final_verdict:'watch'}}
  );
  assert.notStrictEqual(mixedColorCoach.primaryStory.key, 'strong_upside_acceleration', 'Mixed green-red-green sequences must not trigger upside acceleration');

  const nonConsecutiveBodyCoach = sandbox.buildDeterministicChartCoach(
    {marketData:{price:71, ma20:68, ma50:64, ma200:58, avgVolume30d:1000000}},
    {
      canonicalValues:{price:71, ma20:68, ma50:64, ma200:58, volume:1600000},
      trustedMarketContext:{
        avgVolume30d:1000000,
        recentCandleSequence:[
          {date:'2026-07-01', open:69.2, high:71.4, low:68.9, close:71.0, volume:1600000},
          {date:'2026-06-30', open:68.8, high:69.7, low:68.5, close:69.1, volume:900000},
          {date:'2026-06-29', open:66.0, high:68.9, low:65.8, close:68.7, volume:1500000}
        ]
      }
    },
    {globalVerdict:{final_verdict:'watch'}}
  );
  assert.notStrictEqual(nonConsecutiveBodyCoach.primaryStory.key, 'strong_upside_acceleration', 'Non-consecutive large bodies must not trigger upside acceleration');

  const strongRedCoach = sandbox.buildDeterministicChartCoach(
    {marketData:{price:142.4, ma20:150.1, ma50:156.8, ma200:170.2, avgVolume30d:1000000}},
    {
      canonicalValues:{price:142.4, ma20:150.1, ma50:156.8, ma200:170.2, volume:2100000},
      trustedMarketContext:{
      avgVolume30d:1000000,
      recentCandleSequence:[
          {date:'2026-07-01', open:150.8, high:151.2, low:142.1, close:142.4, volume:2100000},
          {date:'2026-06-30', open:156.4, high:156.6, low:149.4, close:150.1, volume:1700000},
          {date:'2026-06-29', open:161.2, high:161.4, low:155.5, close:156.0, volume:1400000}
        ]
      }
    },
    {globalVerdict:{final_verdict:'watch'}}
  );
  assert.strictEqual(strongRedCoach.primaryStory.key, 'sharp_selloff', 'True consecutive strong red runs should trigger sharp selloff');

  const deterministicBounceCoach = sandbox.buildDeterministicChartCoach(
    bounceRecord,
    {
      chartCoach:{
        primaryStory:{
          key:'bounce_attempt',
          label:'Biggest clue',
          icon:'🟢',
          text:'AI should not be able to change this primary story.',
          evidenceFactIds:['fake_fact'],
          confidence:0.2,
          rankReason:'ai_override_attempt'
        },
        source:'ai_chart_coach',
        sections:[
          {key:'volume', icon:'📊', label:'Volume', text:'Volume was unusually light, so the move still needs stronger backing.', confidence:0.61, source:'ai_chart_coach'},
          {key:'biggest_clue', icon:'🟢', label:'Biggest clue', text:'AI wording should only polish this sentence.', confidence:0.82, source:'ai_chart_coach', teachingFocus:false},
          {key:'what_next', icon:'🎯', label:'What next?', text:'Look for another strong close to prove buyers can keep control.', confidence:0.66, source:'ai_chart_coach'}
        ],
        summaryText:'AI supplied chart coach.'
      }
    },
    {globalVerdict:bounceRecord._globalVerdict}
  );

  const mergedAiCoach = sandbox.selectReviewAiSummary(
    bounceRecord,
    {
      chartCoach:{
        primaryStory:{
          key:'bounce_attempt',
          label:'Biggest clue',
          icon:'🟢',
          text:'AI should not be able to change this primary story.',
          evidenceFactIds:['fake_fact'],
          confidence:0.2,
          rankReason:'ai_override_attempt'
        },
        source:'ai_chart_coach',
        sections:[
          {key:'volume', icon:'📊', label:'Volume', text:'Volume was unusually light, so the move still needs stronger backing.', confidence:0.61, source:'ai_chart_coach'},
          {key:'biggest_clue', icon:'🟢', label:'Biggest clue', text:'AI wording should only polish this sentence.', confidence:0.82, source:'ai_chart_coach', teachingFocus:false},
          {key:'what_next', icon:'🎯', label:'What next?', text:'Look for another strong close to prove buyers can keep control.', confidence:0.66, source:'ai_chart_coach'}
        ],
        summaryText:'AI supplied chart coach.'
      }
    },
    {
      derivedStates:sandbox.analysisDerivedStatesFromRecord(bounceRecord),
      globalVerdict:bounceRecord._globalVerdict
    }
  );
  assert.strictEqual(mergedAiCoach.chartCoach.diagnostics.priorityOrder.join('|'), mergedAiCoach.chartCoach.sections.map(section => section.key).join('|'), 'Merged AI Chart Coach diagnostics priority order must match final rendered sections');
  assert.strictEqual(mergedAiCoach.chartCoach.diagnostics.sectionConfidence.length, mergedAiCoach.chartCoach.sections.length, 'Merged AI Chart Coach section confidence diagnostics must match final rendered sections');
  assert.strictEqual(mergedAiCoach.chartCoach.diagnostics.sectionConfidence.filter(section => section.teachingFocus === true).length, 1, 'Merged AI Chart Coach diagnostics must preserve a single teaching-focus section');
  assert.strictEqual(mergedAiCoach.chartCoach.primaryStory.key, deterministicBounceCoach.primaryStory.key, 'AI-supplied Chart Coach must not change the deterministic primary story');

  const amatRead = sandbox.finalDisplayedAnalysisChartRead(
    {
      marketData:{price:186.4, ma20:180.2, ma50:174.1, ma200:156.8, avgVolume30d:1000000},
      _globalVerdict:{final_verdict:'watch'}
    },
    {
      canonicalValues:{price:186.4, ma20:180.2, ma50:174.1, ma200:156.8, volume:1900000},
      trustedMarketContext:{
        avgVolume30d:1000000,
        recentCandleSequence:[
          {date:'2026-07-01', open:178.6, high:186.9, low:177.9, close:186.4, volume:1900000},
          {date:'2026-06-30', open:176.1, high:179.0, low:175.8, close:178.4, volume:1200000},
          {date:'2026-06-29', open:173.4, high:176.4, low:173.0, close:175.9, volume:980000}
        ]
      }
    }
  );
  const amatKeys = amatRead.chartCoach.sections.map(section => section.key);
  ['biggest_clue', 'trend', 'volume', 'learning_point', 'what_next'].forEach(key => {
    assert.ok(amatKeys.includes(key), `AMAT-style Chart Guru should include ${key}`);
  });
  assert.strictEqual(amatKeys[0], 'biggest_clue', 'AMAT-style strong upside acceleration selects Biggest clue first, not Trend');
  const amatClue = amatRead.chartCoach.sections.find(section => section.key === 'biggest_clue');
  const amatTrend = amatRead.chartCoach.sections.find(section => section.key === 'trend');
  const amatVolume = amatRead.chartCoach.sections.find(section => section.key === 'volume');
  const amatLearning = amatRead.chartCoach.sections.find(section => section.key === 'learning_point');
  const amatNext = amatRead.chartCoach.sections.find(section => section.key === 'what_next');
  assert.strictEqual(amatRead.chartCoach.primaryStory.key, 'strong_upside_acceleration', 'AMAT-style chart should choose strong upside acceleration as the deterministic primary story');
  assert.ok(/large and green/i.test(amatClue.text), 'AMAT-style Chart Guru should explain the primary acceleration story first');
  assert.ok(/above the short, medium, and long-term averages/i.test(amatTrend.text), 'AMAT-style Chart Guru should explain the MA trend state');
  assert.ok(!/prior close|follow(?:ing)? through|latest close|green candle|buyers finished/i.test(amatTrend.text), 'Trend section must not contain candle-close or follow-through commentary');
  assert.ok(/Volume is active, which makes the move more believable|Volume is active, which makes the move more convincing/i.test(amatVolume.text), 'AMAT-style Chart Guru should explain supportive volume');
  assert.ok(/higher volume are usually more reliable/i.test(amatLearning.text), 'Chart Guru should include one learning point tied to the primary story');
  assert.ok(/calm pullback that holds above the 20-day average/i.test(amatNext.text), 'Chart Guru should give a specific next step tied to the primary story');
}

function runChartPipelinePreservationRegression(){
  const sandbox = {
    console,
    cloneData(value, fallback){
      return value == null ? fallback : JSON.parse(JSON.stringify(value));
    },
    normalizeTicker(value){
      return String(value || '').trim().toUpperCase();
    },
    normaliseVisibleTicker(value){
      return String(value || '').trim().toUpperCase();
    },
    chartVerificationNumberOrNull(value){
      if(value === null || value === undefined || value === '') return null;
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    },
    chartImageDimensionsFromRef(){
      return {width:null, height:null};
    },
    chartImageDimensionsLabel(){
      return 'unknown';
    },
    simpleStableHash(value){
      return String(value || '');
    },
    getReviewAiRuntime(){
      return null;
    }
  };
  vm.createContext(sandbox);
  [
    'chartImageIdForReview',
    'buildChartImageSourceTrace',
    'currentReviewChartContext',
    'getReviewChartAnalysisPipeline',
    'buildChartPipelineExpectedFacts',
    'buildChartPipelineReadFacts',
    'chartPipelineHasAnyReadFacts',
    'chartPipelineAllowsAi',
    'chartPipelineHasVerifiedIdentity',
    'recoverChartPipelineReadFacts',
    'normalizeChartPipelineForRender',
    'ensureSimplifiedChartPipelineForRender',
    'upsertReviewChartAnalysisPipeline'
  ].forEach(name => {
    vm.runInContext(extractFunctionSource(appSource, name), sandbox, {filename:`app.js#${name}`});
  });

  const record = {
    ticker:'AMAT',
    marketData:{price:186.4, ma20:180.2, ma50:174.1, ma200:156.8},
    review:{
      chartRef:{
        imageId:'chart-amat-1',
        requestId:'request-new',
        dataUrl:'data:image/png;base64,amat'
      },
      chartImageOriginal:{
        imageId:'chart-amat-1',
        requestId:'request-new',
        dataUrl:'data:image/png;base64,amat'
      },
      chartImagePreview:{
        imageId:'chart-amat-1',
        requestId:'request-new',
        dataUrl:'data:image/png;base64,amat-preview'
      },
      chartAttachmentContext:{
        imageId:'chart-amat-1',
        requestId:'request-new',
        expectedTicker:'AMAT',
        name:'amat.png'
      },
      chartAnalysisPipeline:{
        ticker:'AMAT',
        imageId:'chart-amat-1',
        requestId:'request-old',
        phase:'analysis_running',
        expectedFacts:{ticker:'AMAT', timeframe:'1D', price:186.4, ma20:180.2, ma50:174.1, ma200:156.8},
        readFacts:{ticker:'AMAT', timeframe:'1D', price:186.4, ma20:180.2, ma50:174.1, ma200:156.8},
        aiAllowed:true,
        manualConfirmed:false,
        verifiedMatch:true,
        mismatch:false,
        updatedAt:'2026-07-01T12:00:00.000Z'
      }
    }
  };

  const pipeline = sandbox.ensureSimplifiedChartPipelineForRender(record, {source:'test_preserve_verified_pipeline'});
  assert.strictEqual(pipeline.phase, 'analysis_running', 'Same-image verified pipeline should not fall back to cant_read when request ids drift');
  assert.strictEqual(pipeline.verifiedMatch, true, 'Same-image verified pipeline should preserve verified match');
  assert.strictEqual(String(pipeline.readFacts && pipeline.readFacts.ticker || ''), 'AMAT', 'Same-image verified pipeline should preserve readable ticker facts');
}

function runClientNormalizerRegression(){
  const sandbox = {
    console,
    cloneData(value, fallback){
      return value == null ? fallback : JSON.parse(JSON.stringify(value));
    },
    analysisNumberOrNull(value){
      if(value === null || value === undefined || value === '') return null;
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(extractFunctionSource(appSource, 'normalizeAnalysisResponse'), sandbox, {filename:'app.js#normalizeAnalysisResponse'});

  const normalized = sandbox.normalizeAnalysisResponse({
    parseWarning:'Model response was malformed JSON. Deterministic chart summary used instead.',
    candleStructureAnalysis:{
      summary:'Price is below the 20MA and 50MA but above the 200MA. Recent candles show a bounce attempt, but follow-through is still missing.'
    },
    tradePlanCommentary:{
      summary:'Estimated maths exist, but confirmation is still missing before any entry is valid.'
    },
    canonicalValues:{price:200.09, ma20:205.74, ma50:209.99, ma200:190.84},
    trustedMarketContext:{currentPrice:200.09, ma20:205.74, ma50:209.99, ma200:190.84}
  });

  assert.strictEqual(normalized.parseWarning, 'Model response was malformed JSON. Deterministic chart summary used instead.', 'Client normalizer should preserve parseWarning without throwing');
  assert.strictEqual(normalized.legacy_summary, '', 'Client normalizer should not invent a legacy summary when only structured fields exist');
  assert.strictEqual(normalized.candleStructureAnalysis.summary, 'Price is below the 20MA and 50MA but above the 200MA. Recent candles show a bounce attempt, but follow-through is still missing.', 'Structured candle summary should survive client normalization');
  assert.ok(normalized.chartCoach && Array.isArray(normalized.chartCoach.sections), 'Client normalizer should preserve structured Chart Coach data');
  assert.strictEqual(normalized.chartCoach.sections.length, 0, 'Client normalizer should preserve an empty Chart Guru shell for malformed-response fallback');
  assert.strictEqual(normalized.chartCoach.primaryStory, null, 'Client normalizer should preserve that malformed-response fallback has no preselected primary story');
}

function runServerCandleOrderRegression(){
  const sandbox = {
    console,
    normaliseNumber(value){
      if(value === null || value === undefined || value === '') return null;
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    },
    normalizeObject(value){
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    }
  };
  vm.createContext(sandbox);
  [
    'normalizeServerCandleSequenceOrder',
    'deterministicServerCandleSummary'
  ].forEach(name => {
    vm.runInContext(extractFunctionSource(serverSource, name), sandbox, {filename:`analyse-setup.js#${name}`});
  });

  const canonicalValues = {
    price:100,
    ma20:105,
    ma50:110,
    ma200:90,
    latestCandleOHLC:{date:'2026-06-30', open:99, high:101, low:98, close:100}
  };
  const descending = {
    currentPrice:100,
    ma20:105,
    ma50:110,
    ma200:90,
    recentCandleSequence:[
      {date:'2026-06-30', open:99, high:101, low:98, close:100},
      {date:'2026-06-29', open:102, high:103, low:99, close:101},
      {date:'2026-06-28', open:100, high:101, low:97, close:98},
      {date:'2026-06-27', open:95, high:100, low:94, close:99}
    ]
  };
  const ascending = {
    ...descending,
    recentCandleSequence:descending.recentCandleSequence.slice().reverse()
  };

  const descendingSummary = sandbox.deterministicServerCandleSummary(descending, canonicalValues);
  const ascendingSummary = sandbox.deterministicServerCandleSummary(ascending, canonicalValues);

  assert.ok(/closed below the prior candle/i.test(descendingSummary), 'Server fallback should compare against the actual prior candle');
  assert.strictEqual(ascendingSummary, descendingSummary, 'Server fallback summary should be stable for ascending or descending candle input');
  assert.ok(!/bounce attempt/i.test(descendingSummary), 'Server fallback should not invent a bounce attempt when the latest close is below the actual prior close');
}

function runReviewChartGuruDisplayRegression(){
  const sandbox = {
    console,
    chartPipelineHasManualConfirmedMismatch(pipeline = {}){
      return pipeline.manualConfirmedMismatch === true;
    },
    normaliseVisibleTicker(value){
      return String(value || '').trim().toUpperCase();
    },
    finalDisplayedAnalysisChartRead(record, analysis){
      return analysis && analysis.chartRead ? analysis.chartRead : {text:'', chartCoach:{sections:[]}};
    },
    renderChartCoachMarkup(chartRead = {}){
      return String(chartRead.markup || '[rendered-chart-guru]').trim();
    },
    reviewAiSummaryConflictsWithResolvedState(text = '', resolvedDisplay = {}){
      return Array.isArray(resolvedDisplay.conflictTexts)
        ? resolvedDisplay.conflictTexts.includes(String(text || '').trim())
        : false;
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(extractFunctionSource(appSource, 'buildReviewChartGuruDisplay'), sandbox, {filename:'app.js#buildReviewChartGuruDisplay'});

  const assertGuruDisplay = (result, expectedText) => {
    assert.strictEqual(result.display.title, '🧘 Chart Guru', 'Review Chart Guru helper should always return the Chart Guru title');
    ['Chart Coach', 'AI Summary', 'Chart Guru Notes'].forEach(legacy => {
      assert.ok(!String(result.display.title || '').includes(legacy), `Review Chart Guru title should not contain ${legacy}`);
      assert.ok(!String(result.display.text || '').includes(legacy), `Review Chart Guru text should not contain ${legacy}`);
      assert.ok(!String(result.display.markup || '').includes(legacy), `Review Chart Guru markup should not contain ${legacy}`);
    });
    if(expectedText !== undefined){
      assert.strictEqual(String(result.display.text || ''), expectedText, 'Review Chart Guru helper should return the expected branch text');
    }
  };

  assertGuruDisplay(sandbox.buildReviewChartGuruDisplay({
    simplifiedChartPipeline:{manualConfirmedMismatch:true, readFacts:{ticker:'msft'}},
    record:{ticker:'NVDA'}
  }), 'Chart Guru is withheld because the chart was manually confirmed despite a ticker mismatch (read MSFT, expected NVDA). Upload the correct chart for reliable coaching.');

  assertGuruDisplay(sandbox.buildReviewChartGuruDisplay({
    chartVerificationBlocksAiReview:true,
    chartUiDecision:{summary:'Manual chart confirmation required.'}
  }), 'Manual chart confirmation required.');

  assertGuruDisplay(sandbox.buildReviewChartGuruDisplay({
    aiSummaryGuard:{allowedToRender:false}
  }), 'No Chart Guru saved yet.');

  assertGuruDisplay(sandbox.buildReviewChartGuruDisplay({
    aiSummaryGuard:{allowedToRender:true},
    aiAnalysisSuppressedByChartMismatch:true,
    aiSuppressionText:'Suppressed because the uploaded chart does not match the ticker.'
  }), 'Suppressed because the uploaded chart does not match the ticker.');

  assertGuruDisplay(sandbox.buildReviewChartGuruDisplay({
    aiSummaryGuard:{allowedToRender:true},
    analysisState:{error:'network timeout'}
  }), 'Chart Guru failed: network timeout');

  assertGuruDisplay(sandbox.buildReviewChartGuruDisplay({
    aiSummaryGuard:{allowedToRender:true},
    analysisUiState:'running',
    analysisLoadingStage:'verifying candles'
  }), 'Chart Guru is building: verifying candles');

  assertGuruDisplay(sandbox.buildReviewChartGuruDisplay({
    aiSummaryGuard:{allowedToRender:true},
    analysisUiState:'idle'
  }), 'No Chart Guru saved yet.');

  const normalizedConflict = sandbox.buildReviewChartGuruDisplay({
    aiSummaryGuard:{allowedToRender:true},
    analysisUiState:'complete',
    analysisState:{normalizedAnalysis:{chartRead:{text:'conflict text', markup:'[guru-markup]'}}},
    resolvedReviewDisplay:{resolvedNarrative:'Resolved review state takes precedence over raw notes.', conflictTexts:['conflict text']}
  });
  assertGuruDisplay(normalizedConflict, 'Resolved review state takes precedence over raw notes.');
  assert.strictEqual(normalizedConflict.conflictDetected, true, 'Conflict branch should flag conflictDetected');

  const normalizedSuccess = sandbox.buildReviewChartGuruDisplay({
    aiSummaryGuard:{allowedToRender:true},
    analysisUiState:'complete',
    analysisState:{normalizedAnalysis:{chartRead:{text:'🟢 Biggest clue: Buyers are in control.', markup:'[guru-markup]'}}}
  });
  assertGuruDisplay(normalizedSuccess, '🟢 Biggest clue: Buyers are in control.');
  assert.strictEqual(normalizedSuccess.display.markup, '[guru-markup]', 'Normalized-analysis branch should preserve rendered Chart Guru markup');

  const rawConflict = sandbox.buildReviewChartGuruDisplay({
    aiSummaryGuard:{allowedToRender:true},
    analysisUiState:'complete',
    analysisState:{rawAnalysis:'legacy conflict'},
    resolvedReviewDisplay:{resolvedNarrative:'Resolved review state takes precedence over raw notes.', conflictTexts:['legacy conflict']}
  });
  assertGuruDisplay(rawConflict, 'Resolved review state takes precedence over raw notes.');
  assert.strictEqual(rawConflict.conflictDetected, true, 'Raw-analysis conflict branch should flag conflictDetected');

  assertGuruDisplay(sandbox.buildReviewChartGuruDisplay({
    aiSummaryGuard:{allowedToRender:true},
    analysisUiState:'complete',
    analysisState:{rawAnalysis:'Verified fallback copy'}
  }), 'Verified fallback copy');
}

function runSourceAssertions(){
  const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const serverSource = fs.readFileSync(path.join(root, 'netlify', 'functions', 'analyse-setup.js'), 'utf8');
  assert(appSource.includes('trustedMarketContext:'), 'App prompt payload must include trustedMarketContext');
  assert(appSource.includes("'candleStructureAnalysis'"), 'Prompt output keys must include candleStructureAnalysis');
  assert(appSource.includes("'chartCoach'"), 'Prompt output keys must include chartCoach');
  assert(appSource.includes("chartVerificationNumberOrNull(read.ma20) === null && chartVerificationNumberOrNull(expected.ma20) === null"), 'Review diagnostics must suppress unreadable MA copy when trusted MA exists');
  assert(serverSource.includes('Use trustedMarketContext for all numeric values and canonical market facts.'), 'Server prompt must instruct AI to trust canonical market context');
  assert(appSource.includes('function buildDeterministicChartCoach'), 'App must include deterministic Chart Coach helper');
  assert(appSource.includes('function selectReviewAiSummary'), 'App must include the Review AI summary authority selector');
  assert(appSource.includes('function buildReviewChartGuruDisplay'), 'App must expose a dedicated Review Chart Guru display helper');
  assert(!appSource.includes('primaryTeachingSection'), 'Dead legacy Chart Guru teaching-section variable should be removed');
  assert(!appSource.includes('const finalizedSections = finalizeChartCoachSections(rankedSections);'), 'Dead finalizedSections recomputation should be removed');
  assert(!appSource.includes('Chart Coach'), 'Review source should not reintroduce the legacy Chart Coach label');
  assert(!appSource.includes('AI Summary'), 'Review source should not reintroduce the legacy AI Summary label');
  assert(!appSource.includes('Chart Guru Notes'), 'Review should not expose legacy Chart Guru Notes user-facing copy');
}

async function run(){
  await runNetlifyCanonicalizationRegression();
  runReviewPresentationRegression();
  runPresentationModelRegression();
  runDeterministicCandleFallbackRegression();
  runChartPipelinePreservationRegression();
  runClientNormalizerRegression();
  runServerCandleOrderRegression();
  runReviewChartGuruDisplayRegression();
  runSourceAssertions();
  console.log('run-chart-authority-regressions: ok');
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
