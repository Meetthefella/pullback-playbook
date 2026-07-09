const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const appPath = path.join(root, 'app.js');
const appSource = fs.readFileSync(appPath, 'utf8');
const fixturePath = path.join(root, 'tests', 'fixtures', 'chart-guru-event-first-cases.json');
const fixtures = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const analyseSetupModule = require(path.join(root, 'netlify', 'functions', 'analyse-setup.js'));

function extractConstAssignment(name){
  const marker = `const ${name} = `;
  const start = appSource.indexOf(marker);
  if(start === -1) throw new Error(`Could not find const ${name} in app.js`);
  const afterMarker = start + marker.length;
  let index = afterMarker;
  while(index < appSource.length && /\s/.test(appSource[index])) index += 1;
  const opener = appSource[index];
  if(opener !== '{' && opener !== '[') throw new Error(`Const ${name} is not an object/array literal.`);
  const closer = opener === '{' ? '}' : ']';
  let depth = 1;
  let inString = false;
  let stringQuote = '';
  let previous = '';
  for(let i = index + 1; i < appSource.length; i += 1){
    const ch = appSource[i];
    if(inString){
      if(ch === stringQuote && previous !== '\\') inString = false;
      previous = ch;
      continue;
    }
    if(ch === '"' || ch === '\'' || ch === '`'){
      inString = true;
      stringQuote = ch;
      previous = ch;
      continue;
    }
    if(ch === opener) depth += 1;
    if(ch === closer){
      depth -= 1;
      if(depth === 0){
        let end = i + 1;
        while(end < appSource.length && /\s/.test(appSource[end])) end += 1;
        if(appSource[end] === ';') end += 1;
        return appSource.slice(start, end);
      }
    }
    previous = ch;
  }
  throw new Error(`Could not parse const ${name}.`);
}

function extractFunction(name){
  const marker = `function ${name}(`;
  const start = appSource.indexOf(marker);
  if(start === -1) throw new Error(`Could not find ${name} in app.js`);
  let parenDepth = 0;
  let signatureClosedAt = -1;
  for(let i = start + marker.length - 1; i < appSource.length; i += 1){
    const ch = appSource[i];
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
  let index = appSource.indexOf('{', signatureClosedAt);
  if(index === -1) throw new Error(`Could not find body for ${name}`);
  let depth = 1;
  let inString = false;
  let stringQuote = '';
  let inLineComment = false;
  let inBlockComment = false;
  let previous = '';
  for(let i = index + 1; i < appSource.length; i += 1){
    const ch = appSource[i];
    const next = appSource[i + 1];
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
      if(depth === 0) return appSource.slice(start, i + 1);
    }
    previous = ch;
  }
  throw new Error(`Could not parse ${name}`);
}

function toPlainJson(value){
  return JSON.parse(JSON.stringify(value));
}

function normalizeFixturePayload(fixture){
  return {
    ticker:fixture.ticker,
    marketStatus:fixture.marketStatus,
    scanType:fixture.scanType,
    trendState:fixture.setupStates.trendState,
    pullbackZone:fixture.setupStates.pullbackZone,
    structureState:fixture.setupStates.structureState,
    stabilisationState:fixture.setupStates.stabilisationState,
    bounceState:fixture.setupStates.bounceState,
    volumeState:fixture.setupStates.volumeState,
    entryDefined:'no',
    stopDefined:'no',
    targetDefined:'no',
    accountSize:4000,
    maxRisk:40,
    notes:'',
    trustedMarketContext:fixture.trustedMarketContext
  };
}

function buildEventPacketSandbox(){
  const sandbox = {console};
  sandbox.globalThis = sandbox;
  vm.runInNewContext([
    extractConstAssignment('CHART_GURU_EVENT_LABELS'),
    extractFunction('chartGuruDominantEventLabel'),
    extractFunction('buildDeterministicEventPacketFromChartCoach'),
    extractFunction('chartCoachModelIsUsable')
  ].join('\n\n'), sandbox, {filename:appPath});
  return sandbox;
}

function buildAnalysisPayloadSandbox(eventPacket){
  const sandbox = {
    console,
    state:{marketStatus:'S&P above 50 MA', accountSize:4000, userRiskPerTrade:40},
    normalizeCard(value){
      return value;
    },
    currentMaxLoss(){
      return 40;
    },
    buildScannerChecks(){
      return {};
    },
    mergeDerivedChecks(){
      return {};
    },
    resolveScanType(){
      return '20MA';
    },
    scanTypeForEvaluation(value){
      return value;
    },
    deriveTradePlan(){
      return {};
    },
    deriveSetupStates(){
      return {
        scan_type:'20MA',
        trend_state:'strong',
        pullback_zone:'near_20ma',
        structure_state:'weakening',
        stabilisation_state:'early',
        bounce_state:'attempt',
        volume_state:'weak',
        entry_defined:'no',
        stop_defined:'no',
        target_defined:'no'
      };
    },
    buildTrustedMarketContextPayload(card){
      return card.__trustedMarketContext || {};
    },
    buildChartGuruDeterministicAuthorityPayload(){
      return {eventPacket};
    }
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(extractFunction('buildAnalysisPayload'), sandbox, {filename:appPath});
  return sandbox;
}

function extractEmbeddedJsonObject(text){
  const safe = String(text || '');
  for(let start = safe.indexOf('{'); start !== -1; start = safe.indexOf('{', start + 1)){
    let depth = 0;
    let inString = false;
    let previous = '';
    for(let i = start; i < safe.length; i += 1){
      const ch = safe[i];
      if(inString){
        if(ch === '"' && previous !== '\\') inString = false;
        previous = ch;
        continue;
      }
      if(ch === '"'){
        inString = true;
        previous = ch;
        continue;
      }
      if(ch === '{') depth += 1;
      if(ch === '}'){
        depth -= 1;
        if(depth === 0){
          try{
            return JSON.parse(safe.slice(start, i + 1));
          }catch(error){
            break;
          }
        }
      }
      previous = ch;
    }
  }
  return null;
}

function normalizeText(value){
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function uniqueWordRatio(text){
  const words = normalizeText(text).split(/[^a-z0-9]+/).filter(Boolean);
  if(!words.length) return 0;
  return new Set(words).size / words.length;
}

function repeatedPhraseCount(fields = []){
  const phrases = new Map();
  fields.forEach(field => {
    const words = normalizeText(field).split(/[^a-z0-9]+/).filter(Boolean);
    for(let i = 0; i <= words.length - 3; i += 1){
      const phrase = words.slice(i, i + 3).join(' ');
      if(phrase.length < 8) continue;
      phrases.set(phrase, (phrases.get(phrase) || 0) + 1);
    }
  });
  let repeated = 0;
  phrases.forEach(count => {
    if(count > 1) repeated += 1;
  });
  return repeated;
}

function sectionWordSet(text = ''){
  const stopwords = new Set(['the', 'and', 'that', 'this', 'with', 'from', 'into', 'after', 'before', 'still', 'have', 'has', 'will', 'they', 'them', 'than', 'then', 'just', 'near', 'over', 'under', 'again']);
  return new Set(
    normalizeText(text)
      .split(/[^a-z0-9]+/)
      .filter(word => word.length >= 4 && !stopwords.has(word))
  );
}

function maxSectionSimilarity(fields = []){
  let maxSimilarity = 0;
  for(let i = 0; i < fields.length; i += 1){
    const left = sectionWordSet(fields[i]);
    if(!left.size) continue;
    for(let j = i + 1; j < fields.length; j += 1){
      const right = sectionWordSet(fields[j]);
      if(!right.size) continue;
      let intersection = 0;
      left.forEach(word => {
        if(right.has(word)) intersection += 1;
      });
      const union = new Set([...left, ...right]).size;
      const similarity = union ? intersection / union : 0;
      if(similarity > maxSimilarity) maxSimilarity = similarity;
    }
  }
  return maxSimilarity;
}

function scoreTokenCoverage(tokens = [], text = ''){
  if(!tokens.length) return 4;
  const safe = normalizeText(text);
  const matched = tokens.filter(token => safe.includes(normalizeText(token))).length;
  if(matched >= tokens.length) return 4;
  if(matched >= Math.max(1, tokens.length - 1)) return 3;
  if(matched >= Math.ceil(tokens.length / 2)) return 2;
  if(matched > 0) return 1;
  return 0;
}

function scoreChronology(eventSequence = [], prose = ''){
  const safeProse = normalizeText(prose);
  const normalizedSteps = eventSequence.map(step => normalizeText(step));
  let lastIndex = -1;
  let orderedMatches = 0;
  normalizedSteps.forEach(step => {
    const parts = step.split(/[^a-z0-9]+/).filter(part => part.length >= 4);
    const needle = parts[0] || step;
    const index = safeProse.indexOf(needle);
    if(index > lastIndex && index !== -1){
      orderedMatches += 1;
      lastIndex = index;
    }
  });
  if(orderedMatches >= Math.min(3, normalizedSteps.length)) return 4;
  if(orderedMatches >= 2) return 3;
  if(orderedMatches >= 1) return 2;
  return 1;
}

function buildSemanticJudge(caseFixture, interpretation, finalProse){
  const expectations = caseFixture.semanticExpectations || {};
  const proseFields = [
    finalProse.chartStory,
    finalProse.whyItMatters,
    finalProse.setupLocation,
    finalProse.learningPoint,
    finalProse.whatNext
  ];
  const proseText = proseFields.join(' ');
  const traderText = [
    interpretation.dominantEvent,
    interpretation.traderInterpretation,
    interpretation.currentRisk,
    interpretation.nextSignal
  ].join(' ');
  const similarity = maxSectionSimilarity(proseFields);
  const repeatedPhrases = repeatedPhraseCount(proseFields);
  const eventFirstNarration = scoreTokenCoverage(expectations.dominantEventTokens, `${finalProse.chartStory} ${interpretation.dominantEvent}`);
  const chronologicalStorytelling = scoreChronology(interpretation.eventSequence, proseText);
  const traderRealism = scoreTokenCoverage(expectations.traderTokens, traderText);
  const beginnerClarity = uniqueWordRatio(proseText) >= 0.62 && !/\brsi\b|\bmacd\b|\bvwap\b/i.test(proseText) ? 4 : (uniqueWordRatio(proseText) >= 0.54 ? 3 : 2);
  const sectionUniqueness = similarity < 0.35 ? 4 : (similarity < 0.5 ? 3 : 1);
  const unsupportedInference = (expectations.forbiddenTokens || []).some(token => normalizeText(proseText).includes(normalizeText(token)) || normalizeText(traderText).includes(normalizeText(token))) ? 0 : 4;
  const repetitiveWording = repeatedPhrases <= 2 ? 4 : (repeatedPhrases <= 5 ? 2 : 0);
  return {
    eventFirstNarration,
    chronologicalStorytelling,
    traderRealism,
    beginnerClarity,
    sectionUniqueness,
    unsupportedInference,
    repetitiveWording,
    total:eventFirstNarration + chronologicalStorytelling + traderRealism + beginnerClarity + sectionUniqueness + unsupportedInference + repetitiveWording
  };
}

function verifyFixtureCoverage(){
  const ids = fixtures.map(fixture => fixture.id);
  [
    'CAT_event_first_failed_bounce',
    'ALLY_event_first_50ma_test',
    'UPS_event_first_constructive_pullback',
    'AMAT_event_first_pullback_20ma',
    'GEV_event_first_early_constructive',
    'VRT_event_first_momentum_fading'
  ].forEach(id => {
    assert.ok(ids.includes(id), `Fixture set must include ${id}.`);
  });
}

function verifyAppPayloadIncludesDeterministicEventPacket(){
  const eventPacket = {
    dominantEventKey:'failed_bounce',
    dominantEventLabel:'Failed first bounce from 20MA',
    dominantEvent:'The bounce attempt faded quickly, which suggests sellers are still pushing back.',
    eventSequence:['pullback_to_20ma', 'bounce_attempt', 'failed_bounce'],
    primaryStoryKey:'failed_bounce',
    recentStoryKey:'failed_first_bounce_from_20ma'
  };
  const sandbox = buildAnalysisPayloadSandbox(eventPacket);
  const payload = sandbox.buildAnalysisPayload({
    ticker:'CAT',
    notes:'Test payload',
    chartRef:{dataUrl:'data:image/png;base64,abc', name:'cat-chart.png'},
    marketData:{price:41.32},
    __trustedMarketContext:{ticker:'CAT', timeframe:'1D'}
  });
  assert.deepStrictEqual(payload.deterministicEventPacket, eventPacket, 'Client analysis payload must include deterministicEventPacket unchanged.');
}

function verifyEventPacketContract(){
  const sandbox = buildEventPacketSandbox();
  for(const fixture of fixtures){
    const packet = toPlainJson(sandbox.buildDeterministicEventPacketFromChartCoach(fixture.deterministicChartCoach));
    const primaryStory = fixture.deterministicChartCoach.primaryStory;
    const recentStory = fixture.deterministicChartCoach.recentStory;
    [
      'dominantEventKey',
      'dominantEventLabel',
      'dominantEvent',
      'eventSequence',
      'evidenceFactIds',
      'primaryStoryKey',
      'primaryStoryLabel',
      'primaryStoryIcon',
      'recentStoryKey',
      'recentStoryBias',
      'recentStoryToneMode',
      'recentStoryConfidenceMode',
      'recentStoryTrendLabel',
      'recentStorySupportLabel',
      'stepDetails'
    ].forEach(field => {
      assert.ok(Object.prototype.hasOwnProperty.call(packet, field), `${fixture.id}: deterministicEventPacket must include ${field}.`);
    });
    assert.strictEqual(packet.dominantEventKey, primaryStory.key, `${fixture.id}: dominantEventKey must match the deterministic primary story.`);
    assert.strictEqual(packet.dominantEvent, primaryStory.text, `${fixture.id}: dominantEvent must preserve deterministic primary story text.`);
    assert.strictEqual(packet.primaryStoryKey, primaryStory.key, `${fixture.id}: primaryStoryKey must be preserved.`);
    assert.strictEqual(packet.recentStoryKey, recentStory.key, `${fixture.id}: recentStoryKey must be preserved.`);
    assert.strictEqual(packet.dominantEventLabel, sandbox.chartGuruDominantEventLabel(primaryStory.key), `${fixture.id}: dominantEventLabel must map from existing story keys.`);
    assert.deepStrictEqual(packet.eventSequence, recentStory.steps, `${fixture.id}: eventSequence must preserve recent story steps.`);
    assert.deepStrictEqual(packet.stepDetails, recentStory.stepDetails, `${fixture.id}: stepDetails must preserve recent story trace.`);
    assert.ok(packet.evidenceFactIds.length >= 1, `${fixture.id}: evidenceFactIds must remain populated.`);
  }
}

function verifyInterpreterContractAndTutorBoundary(){
  const hooks = analyseSetupModule.__test;
  assert.ok(hooks, 'analyse-setup.js must expose a __test surface for narration contract assertions.');
  for(const fixture of fixtures){
    const packet = hooks.normalizeDeterministicEventPacket(buildEventPacketSandbox().buildDeterministicEventPacketFromChartCoach(fixture.deterministicChartCoach));
    const structuredFacts = hooks.buildProductionStructuredFacts({
      ...normalizeFixturePayload(fixture),
      deterministicEventPacket:packet
    }, {});
    const normalizedInterpretation = hooks.normalizeTraderInterpretation(fixture.interpreterResponse, packet);
    const validation = hooks.validateTraderInterpretationResponse(normalizedInterpretation);
    assert.strictEqual(validation.ok, true, `${fixture.id}: normalized interpreter output must satisfy schema.`);
    ['dominantEvent', 'traderInterpretation', 'currentRisk', 'nextSignal'].forEach(field => {
      assert.ok(String(normalizedInterpretation[field] || '').trim(), `${fixture.id}: interpreter output must include ${field}.`);
    });
    assert.ok(Array.isArray(normalizedInterpretation.eventSequence) && normalizedInterpretation.eventSequence.length, `${fixture.id}: interpreter output must include eventSequence.`);

    const invalidValidation = hooks.validateTraderInterpretationResponse({
      dominantEvent:'x',
      eventSequence:['a'],
      traderInterpretation:'',
      currentRisk:'',
      nextSignal:''
    });
    assert.strictEqual(invalidValidation.ok, false, `${fixture.id}: schema validation must fail when required interpreter fields are missing.`);

    const tutorPrompt = hooks.buildProductionChartGuruFinalPrompt(normalizedInterpretation, 'Tutor prompt preface');
    const tutorInput = extractEmbeddedJsonObject(tutorPrompt);
    assert.ok(tutorInput, `${fixture.id}: Stage 3 prompt must embed trader interpretation JSON.`);
    [
      'dominantEvent',
      'dominantEventKey',
      'eventSequence',
      'traderInterpretation',
      'currentRisk',
      'nextSignal',
      'whatChanged',
      'traderRead',
      'riskToWatch',
      'nextUsefulSignal'
    ].forEach(key => {
      assert.ok(Object.prototype.hasOwnProperty.call(tutorInput, key), `${fixture.id}: tutor input must preserve ${key}.`);
    });
    [
      'trustedMarketContext',
      'canonicalValues',
      'deterministicEventPacket',
      'visible_latest_price',
      'visible_ma20',
      'visible_ma50',
      'visible_ma200',
      'screenshotDescription',
      'indicatorList'
    ].forEach(forbidden => {
      assert.ok(!Object.prototype.hasOwnProperty.call(tutorInput, forbidden), `${fixture.id}: tutor input must not include ${forbidden}.`);
      assert.ok(!tutorPrompt.includes(forbidden), `${fixture.id}: tutor prompt must not leak ${forbidden}.`);
    });
    assert.ok(hooks.buildProductionChartGuruFinalInstructions().includes('Do not inspect raw chart evidence.'), `${fixture.id}: Stage 3 instructions must explicitly forbid raw evidence inspection.`);

    assert.deepStrictEqual(toPlainJson(structuredFacts.eventSequence), toPlainJson(packet.eventSequence), `${fixture.id}: structured facts must retain deterministic event sequence.`);
    assert.deepStrictEqual(toPlainJson(structuredFacts.deterministicEvidence.stepDetails), toPlainJson(packet.stepDetails), `${fixture.id}: structured facts must retain deterministic evidence trace.`);
  }
}

async function verifyAuthorityContract(){
  const hooks = analyseSetupModule.__test;
  const {handler} = analyseSetupModule;
  const chartSandbox = buildEventPacketSandbox();
  const fixture = fixtures.find(item => item.id === 'CAT_event_first_failed_bounce');
  const packet = chartSandbox.buildDeterministicEventPacketFromChartCoach(fixture.deterministicChartCoach);
  const baseAnalysisPayload = {
    extractedFromImage:{
      visible_ticker:fixture.ticker,
      visible_timeframe:'1D',
      visible_latest_price:null,
      visible_ma20:null,
      visible_ma50:null,
      visible_ma200:null
    },
    candleStructureAnalysis:{
      summary:'Price pulled back to support and the first bounce failed.'
    },
    tradePlanCommentary:{
      summary:'No actionable plan yet.'
    },
    confidenceWarnings:[],
    coach_summary:'Price pulled back to support and the first bounce failed.'
  };

  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENAI_MODEL = 'gpt-4o-mini';

  async function invokeHandler(sequence){
    const fetchCalls = [];
    global.fetch = async (url, options = {}) => {
      fetchCalls.push({url, options});
      const step = sequence[Math.max(0, fetchCalls.length - 1)] || sequence[sequence.length - 1];
      if(typeof step === 'function'){
        return step({url, options, callNumber:fetchCalls.length});
      }
      const safeStep = step || {};
      if(safeStep.throwAbort){
        const error = new Error('timed out');
        error.name = 'AbortError';
        throw error;
      }
      return {
        ok:safeStep.ok !== false,
        status:Number.isFinite(Number(safeStep.status)) ? Number(safeStep.status) : 200,
        json:async () => safeStep.payload || {}
      };
    };
    const response = await handler({
      httpMethod:'POST',
      body:JSON.stringify({
        payload:{
          ticker:fixture.ticker,
          marketStatus:fixture.marketStatus,
          trustedMarketContext:fixture.trustedMarketContext,
          deterministicEventPacket:packet
        },
        prompt:'Return JSON only.'
      })
    });
    return {
      response,
      body:JSON.parse(response.body),
      fetchCalls
    };
  }

  const malformedPrimary = await invokeHandler([
    {payload:{output_text:'{"broken":true'}}
  ]);
  assert.strictEqual(malformedPrimary.response.statusCode, 200, 'Malformed primary analysis JSON should still return a deterministic-safe response.');
  assert.ok(/malformed json/i.test(String(malformedPrimary.body.analysis.parseWarning || '')), 'Malformed primary analysis should expose a parse warning.');
  assert.strictEqual(hooks.buildEmptyChartCoach && typeof hooks.buildEmptyChartCoach, 'function', 'Contract helper should expose buildEmptyChartCoach.');
  assert.strictEqual(buildEventPacketSandbox().chartCoachModelIsUsable(malformedPrimary.body.analysis.chartCoach), false, 'Malformed primary analysis should not return a usable AI chartCoach.');

  const scenarios = [
    {
      name:'interpreter_request_failed',
      sequence:[
        {payload:{output_text:JSON.stringify(baseAnalysisPayload)}},
        {ok:false, status:500, payload:{error:{message:'Interpreter exploded'}}}
      ],
      expectedFallback:'interpretation_request_failed'
    },
    {
      name:'interpreter_timeout',
      sequence:[
        {payload:{output_text:JSON.stringify(baseAnalysisPayload)}},
        {throwAbort:true}
      ],
      expectedFallback:'interpretation_request_failed'
    },
    {
      name:'interpretation_json_parse_failed',
      sequence:[
        {payload:{output_text:JSON.stringify(baseAnalysisPayload)}},
        {payload:{output_text:'{"dominantEvent":"broken"'}}
      ],
      expectedFallback:'interpretation_json_parse_failed'
    },
    {
      name:'interpretation_validation_failed',
      sequence:[
        {payload:{output_text:JSON.stringify(baseAnalysisPayload)}},
        {payload:{output_text:JSON.stringify({
          dominantEvent:'Failed first bounce from 20MA',
          eventSequence:['pullback', 'bounce'],
          traderInterpretation:'',
          currentRisk:'',
          nextSignal:''
        })}}
      ],
      expectedFallback:'interpretation_validation_failed'
    },
    {
      name:'final_prose_request_failed',
      sequence:[
        {payload:{output_text:JSON.stringify(baseAnalysisPayload)}},
        {payload:{output_text:JSON.stringify(fixture.interpreterResponse)}},
        {ok:false, status:500, payload:{error:{message:'Tutor exploded'}}}
      ],
      expectedFallback:'final_prose_request_failed'
    },
    {
      name:'final_prose_timeout',
      sequence:[
        {payload:{output_text:JSON.stringify(baseAnalysisPayload)}},
        {payload:{output_text:JSON.stringify(fixture.interpreterResponse)}},
        {throwAbort:true}
      ],
      expectedFallback:'final_prose_request_failed'
    },
    {
      name:'final_prose_json_parse_failed',
      sequence:[
        {payload:{output_text:JSON.stringify(baseAnalysisPayload)}},
        {payload:{output_text:JSON.stringify(fixture.interpreterResponse)}},
        {payload:{output_text:'{"chartStory":"broken"'}}
      ],
      expectedFallback:'final_prose_json_parse_failed'
    },
    {
      name:'final_prose_validation_failed',
      sequence:[
        {payload:{output_text:JSON.stringify(baseAnalysisPayload)}},
        {payload:{output_text:JSON.stringify(fixture.interpreterResponse)}},
        {payload:{output_text:JSON.stringify({
          chartStory:'',
          whyItMatters:'Something happened.',
          setupLocation:'Near support.',
          learningPoint:'',
          whatNext:'Watch.'
        })}}
      ],
      expectedFallback:'final_prose_validation_failed'
    }
  ];

  for(const scenario of scenarios){
    const result = await invokeHandler(scenario.sequence);
    assert.strictEqual(result.response.statusCode, 200, `${scenario.name}: failure path should degrade to a deterministic-safe 200 response.`);
    assert.strictEqual(result.body.analysis.chartGuruOpenAiFallbackReason, scenario.expectedFallback, `${scenario.name}: fallback reason must be explicit.`);
    assert.strictEqual(buildEventPacketSandbox().chartCoachModelIsUsable(result.body.analysis.chartCoach), false, `${scenario.name}: failing AI path must not return a usable AI chartCoach.`);
    assert.ok(Array.isArray(result.body.analysis.chartCoach.sections) && result.body.analysis.chartCoach.sections.length === 0, `${scenario.name}: failing AI path must leave public chart authority to deterministic Chart Guru.`);
  }
}

function verifyStoryContinuityAndBenchmarks(){
  const hooks = analyseSetupModule.__test;
  const chartSandbox = buildEventPacketSandbox();
  const judgeSummaries = [];
  for(const fixture of fixtures){
    const packet = hooks.normalizeDeterministicEventPacket(chartSandbox.buildDeterministicEventPacketFromChartCoach(fixture.deterministicChartCoach));
    const interpretation = hooks.normalizeTraderInterpretation(fixture.interpreterResponse, packet);
    const chartCoach = hooks.buildTwoStepChartCoach(fixture.finalProse, interpretation, {
      deterministicEventPacket:packet
    });
    const mergedAnalysis = hooks.mergeTwoStepNarrativeIntoAnalysis({}, fixture.finalProse, interpretation, {
      deterministicEventPacket:packet
    });
    const diagnostics = hooks.buildChartGuruNarrationDiagnostics(interpretation, packet);

    assert.strictEqual(packet.primaryStoryKey, fixture.deterministicChartCoach.primaryStory.key, `${fixture.id}: deterministic evidence and event packet must agree on the dominant story key.`);
    assert.strictEqual(interpretation.dominantEvent, fixture.interpreterResponse.dominantEvent, `${fixture.id}: interpreter must preserve the intended dominantEvent.`);
    assert.strictEqual(chartCoach.primaryStory.key, packet.primaryStoryKey, `${fixture.id}: stored chartCoach must keep deterministic primary story authority.`);
    assert.strictEqual(chartCoach.recentStory.key, packet.recentStoryKey, `${fixture.id}: stored chartCoach must keep deterministic recent story authority.`);
    assert.strictEqual(chartCoach.recentStory.trendLabel, interpretation.dominantEvent, `${fixture.id}: tutor-mapped chartCoach must keep the interpreter dominantEvent as the visible recent story label.`);
    assert.strictEqual(mergedAnalysis.deterministicEventPacket.primaryStoryKey, packet.primaryStoryKey, `${fixture.id}: stored analysis must preserve deterministicEventPacket.`);
    assert.strictEqual(mergedAnalysis.traderInterpretation.dominantEvent, interpretation.dominantEvent, `${fixture.id}: stored analysis must preserve the interpreter dominantEvent.`);
    assert.deepStrictEqual(toPlainJson(mergedAnalysis.traderInterpretation.eventSequence), toPlainJson(interpretation.eventSequence), `${fixture.id}: stored analysis must preserve eventSequence.`);
    assert.strictEqual(diagnostics.dominantEvent, interpretation.dominantEvent, `${fixture.id}: diagnostics must expose dominantEvent.`);
    assert.deepStrictEqual(toPlainJson(diagnostics.eventSequence), toPlainJson(interpretation.eventSequence), `${fixture.id}: diagnostics must expose eventSequence.`);
    assert.strictEqual(diagnostics.traderInterpretation, interpretation.traderInterpretation, `${fixture.id}: diagnostics must expose traderInterpretation.`);
    assert.strictEqual(diagnostics.currentRisk, interpretation.currentRisk, `${fixture.id}: diagnostics must expose currentRisk.`);
    assert.strictEqual(diagnostics.nextSignal, interpretation.nextSignal, `${fixture.id}: diagnostics must expose nextSignal.`);
    assert.notStrictEqual(chartCoach.primaryStory.key, 'openai_two_step_primary_story', `${fixture.id}: chartCoach must not replace deterministic authority with an OpenAI-only primary story key.`);
    assert.notStrictEqual(chartCoach.recentStory.key, 'openai_two_step_narrative', `${fixture.id}: chartCoach must not replace deterministic recent story authority when deterministic keys exist.`);

    const judge = buildSemanticJudge(fixture, interpretation, fixture.finalProse);
    judgeSummaries.push({id:fixture.id, total:judge.total});
    assert.ok(judge.eventFirstNarration >= 3, `${fixture.id}: semantic judge must see event-first narration.`);
    assert.ok(judge.chronologicalStorytelling >= 2, `${fixture.id}: semantic judge must see chronological storytelling.`);
    assert.ok(judge.traderRealism >= 2, `${fixture.id}: semantic judge must see trader realism.`);
    assert.ok(judge.beginnerClarity >= 3, `${fixture.id}: semantic judge must see beginner clarity.`);
    assert.ok(judge.sectionUniqueness >= 3, `${fixture.id}: semantic judge must see distinct tutor sections.`);
    assert.ok(judge.unsupportedInference >= 4, `${fixture.id}: semantic judge must reject unsupported inference.`);
    assert.ok(judge.repetitiveWording >= 2, `${fixture.id}: semantic judge must reject repetitive wording.`);
    assert.ok(judge.total >= 20, `${fixture.id}: semantic benchmark score must stay above regression threshold.`);
  }
  assert.strictEqual(judgeSummaries.length, 6, 'Benchmark suite must evaluate all six representative narration fixtures.');
}

async function run(){
  verifyFixtureCoverage();
  verifyAppPayloadIncludesDeterministicEventPacket();
  verifyEventPacketContract();
  verifyInterpreterContractAndTutorBoundary();
  await verifyAuthorityContract();
  verifyStoryContinuityAndBenchmarks();
  console.log('run-chart-guru-narration-contract-assertions: ok');
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
