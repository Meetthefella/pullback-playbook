const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const appPath = path.join(root, 'app.js');
const appSource = fs.readFileSync(appPath, 'utf8');
const analyseSetupModule = require(path.join(root, 'netlify', 'functions', 'analyse-setup.js'));
const {loadBenchmarkCases} = require(path.join(root, 'tests', 'fixtures', 'chart-guru-benchmark-library.js'));

const fixtures = loadBenchmarkCases();
const hooks = analyseSetupModule.__test;

const STRUCTURED_FACT_KEYS = [
  'ticker',
  'marketStatus',
  'scanType',
  'notes',
  'accountSize',
  'maxRisk',
  'setupStates',
  'trustedMarketContext',
  'canonicalValues',
  'deterministicEventPacket'
];

const TUTOR_INPUT_KEYS = [
  'dominantEvent',
  'dominantEventKey',
  'supportSemantic',
  'buyerResponseSemantic',
  'confirmationSemantic',
  'supportLabel',
  'trendLabel',
  'eventSequence',
  'traderInterpretation',
  'currentRisk',
  'nextSignal',
  'whatChanged',
  'traderRead',
  'riskToWatch',
  'nextUsefulSignal'
];

const APPROVED_BASELINES = {
  verificationBodyChars:670,
  verificationBodyTokens:168,
  fullAnalysisBodyChars:13845,
  fullAnalysisBodyTokens:3462,
  stage2PromptChars:3859,
  stage2PromptTokens:965,
  stage2BodyChars:6416,
  stage2BodyTokens:1604,
  stage3PromptChars:1746,
  stage3PromptTokens:437,
  stage3BodyChars:13999,
  stage3BodyTokens:3500
};

function boundedCeiling(base, pct = 0.12, minimumHeadroom = 180){
  return base + Math.max(minimumHeadroom, Math.ceil(base * pct));
}

function estimateTokensFromChars(charCount){
  return Math.ceil(Number(charCount || 0) / 4);
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
    chartAttached:true,
    chartFileName:`${fixture.ticker}.png`,
    chartMatchStatus:'unclear',
    chartMatchWarning:'',
    trustedMarketContext:fixture.trustedMarketContext
  };
}

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

function buildEventPacketSandbox(){
  const sandbox = {console};
  sandbox.globalThis = sandbox;
  vm.runInNewContext([
    extractConstAssignment('CHART_GURU_EVENT_LABELS'),
    `function numericOrNull(value){
      if(value === null || value === undefined) return null;
      if(typeof value === 'string' && value.trim() === '') return null;
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    }`,
    extractFunction('chartGuruDominantEventLabel'),
    extractFunction('chartGuruBuyerResponsePresent'),
    extractFunction('describeCandleBodyDirection'),
    extractFunction('chartCoachRecentColorRun'),
    extractFunction('chartGuruRecentSupportType'),
    extractFunction('chartGuruResolvedSupportType'),
    extractFunction('chartGuruRecentSupportResponsePresent'),
    extractFunction('chartGuruSupportReferenceLevel'),
    extractFunction('chartGuruSupportDistancePct'),
    extractFunction('chartGuruControlledPullbackPresent'),
    extractFunction('chartGuruVolumeParticipationLabel'),
    extractFunction('buildCanonicalChartStoryContext'),
    extractFunction('chartGuruSemanticEnvelopeFromNarrativeContext'),
    extractFunction('chartGuruSemanticEnvelopeCompatibilityForStoryKey'),
    extractFunction('chartGuruNarrativeContext'),
    extractFunction('chartGuruSemanticEnvelopeFromStory'),
    extractFunction('chartGuruResolveSemanticEnvelopeValue'),
    extractFunction('eventPacketEvidenceIncludes'),
    extractFunction('buildDeterministicEventPacketFromChartCoach'),
    extractFunction('chartCoachModelIsUsable')
  ].join('\n\n'), sandbox, {filename:appPath});
  return sandbox;
}

function buildPromptSandbox(){
  const sandbox = {console};
  sandbox.globalThis = sandbox;
  vm.runInNewContext(extractFunction('buildPromptBody'), sandbox, {filename:appPath});
  return sandbox;
}

function extractEmbeddedJsonObject(text){
  const safe = String(text || '');
  for(let start = safe.indexOf('{'); start !== -1; start = safe.indexOf('{', start + 1)){
    let depth = 0;
    let inString = false;
    let previous = '';
    for(let index = start; index < safe.length; index += 1){
      const ch = safe[index];
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
          return JSON.parse(safe.slice(start, index + 1));
        }
      }
      previous = ch;
    }
  }
  return null;
}

function extractJsonAfterMarker(text, marker){
  const safeText = String(text || '');
  const safeMarker = String(marker || '');
  const markerIndex = safeText.indexOf(safeMarker);
  const startSearch = markerIndex >= 0 ? markerIndex + safeMarker.length : 0;
  return extractEmbeddedJsonObject(safeText.slice(startSearch));
}

function buildTightenedPrompt(prompt){
  return [
    String(prompt || '').trim(),
    '',
    'Return ONLY valid raw JSON.',
    'Do not include markdown.',
    'Do not include code fences.',
    'Do not include commentary before or after the JSON.'
  ].join('\n');
}

function measureJsonBody(body){
  const serialized = JSON.stringify(body);
  return {
    chars:serialized.length,
    estimatedTokens:estimateTokensFromChars(serialized.length)
  };
}

function assertWithinBoundedBaseline(actual, baseline, label){
  const ceiling = boundedCeiling(baseline);
  assert.ok(
    actual <= ceiling,
    `${label} exceeded bounded baseline. baseline=${baseline} ceiling=${ceiling} actual=${actual}`
  );
}

function verifyBudgetsAndVerificationPath(){
  assert.ok(hooks, 'analyse-setup.js must expose __test hooks.');
  const verificationContent = hooks.buildVerificationOnlyContent({ticker:'CAT', chartAttached:true, chartFileName:'CAT.png'}, {width:1179, height:2556});
  assert.ok(Array.isArray(verificationContent) && verificationContent.length === 1, 'Verification-only content must be a narrow single-text payload before image attachment.');
  assert.ok(String(verificationContent[0].text || '').includes('Chart verification only.'), 'Verification-only content must identify chart verification mode.');

  const verificationBody = hooks.buildRequestBody(
    'gpt-4o-mini',
    [
      'Verify chart identity only.',
      'Do not perform setup analysis.',
      'Do not generate coaching, entry, stop, target, or verdict content.'
    ].join('\n'),
    verificationContent,
    600
  );
  assert.strictEqual(verificationBody.max_output_tokens, 600, 'Verification-only requests must keep the 600-token output budget.');
  assert.strictEqual(verificationBody.text && verificationBody.text.format && verificationBody.text.format.type, 'json_object', 'Verification-only requests must use the narrow json_object path.');

  const fullAnalysisBody = hooks.buildStrictSchemaRequestBody(
    'gpt-4o-mini',
    hooks.buildProductionAnalysisInstructionLines().join('\n'),
    buildTightenedPrompt('Quality Pullback chart-coach read. Return JSON only.'),
    'chart_guru_primary_analysis',
    hooks.PRIMARY_ANALYSIS_SCHEMA,
    1000
  );
  assert.strictEqual(fullAnalysisBody.max_output_tokens, 1000, 'Primary analysis requests must keep the 1000-token output budget.');
  assert.strictEqual(fullAnalysisBody.text && fullAnalysisBody.text.format && fullAnalysisBody.text.format.type, 'json_schema', 'Primary analysis requests must use the strict-schema path.');

  const interpretationBody = hooks.buildStrictSchemaRequestBody(
    'gpt-4o-mini',
    hooks.buildProductionChartGuruInterpretationInstructions(),
    'stub',
    'chart_guru_trader_interpretation',
    hooks.TRADER_INTERPRETATION_SCHEMA,
    500
  );
  assert.strictEqual(interpretationBody.max_output_tokens, 500, 'Interpreter requests must keep the 500-token output budget.');

  const tutorBody = hooks.buildStrictSchemaRequestBody(
    'gpt-4o-mini',
    hooks.buildProductionChartGuruFinalInstructions(),
    'stub',
    'chart_guru_final_prose',
    hooks.FINAL_PROSE_SCHEMA,
    700
  );
  assert.strictEqual(tutorBody.max_output_tokens, 700, 'Tutor requests must keep the 700-token output budget.');
}

function verifyStagePayloadShapesAndGrowth(){
  const eventSandbox = buildEventPacketSandbox();
  const promptSandbox = buildPromptSandbox();
  const maxMeasurements = {
    verificationBodyChars:0,
    verificationBodyTokens:0,
    fullAnalysisBodyChars:0,
    fullAnalysisBodyTokens:0,
    stage2PromptChars:0,
    stage2PromptTokens:0,
    stage2BodyChars:0,
    stage2BodyTokens:0,
    stage3PromptChars:0,
    stage3PromptTokens:0,
    stage3BodyChars:0,
    stage3BodyTokens:0
  };
  const worstFixture = {};

  for(const fixture of fixtures){
    const packet = hooks.normalizeDeterministicEventPacket(
      eventSandbox.buildDeterministicEventPacketFromChartCoach(fixture.deterministicChartCoach)
    );
    const payload = {
      ...normalizeFixturePayload(fixture),
      deterministicEventPacket:packet
    };
    const prompt = promptSandbox.buildPromptBody(payload).join('\n');
    const tightenedPrompt = buildTightenedPrompt(prompt);
    const chartRef = {
      width:1179,
      height:2556,
      dataUrl:'data:image/png;base64,AAA'
    };

    const verificationContent = hooks.buildVerificationOnlyContent(payload, chartRef);
    const verificationBody = hooks.buildRequestBody(
      'gpt-4o-mini',
      [
        'Verify chart identity only.',
        'Do not perform setup analysis.',
        'Do not generate coaching, entry, stop, target, or verdict content.'
      ].join('\n'),
      verificationContent,
      600
    );
    const verificationMeasure = measureJsonBody(verificationBody);

    const fullAnalysisBody = hooks.buildStrictSchemaRequestBody(
      'gpt-4o-mini',
      hooks.buildProductionAnalysisInstructionLines().join('\n'),
      tightenedPrompt,
      'chart_guru_primary_analysis',
      hooks.PRIMARY_ANALYSIS_SCHEMA,
      1000
    );
    const fullAnalysisMeasure = measureJsonBody(fullAnalysisBody);

    const structuredFacts = hooks.buildProductionStructuredFacts(payload, {});
    const topLevelStructuredKeys = Object.keys(structuredFacts).sort();
    assert.deepStrictEqual(topLevelStructuredKeys, STRUCTURED_FACT_KEYS.slice().sort(), `${fixture.id}: Stage 2 structuredFacts must only contain the approved top-level keys.`);
    assert.ok(structuredFacts.deterministicEventPacket && Array.isArray(structuredFacts.deterministicEventPacket.eventSequence), `${fixture.id}: deterministicEventPacket must carry eventSequence.`);
    assert.ok(Array.isArray(structuredFacts.deterministicEventPacket.stepDetails), `${fixture.id}: deterministicEventPacket must carry stepDetails.`);
    assert.ok(!Object.prototype.hasOwnProperty.call(structuredFacts, 'eventSequence'), `${fixture.id}: Stage 2 structuredFacts must not duplicate eventSequence outside deterministicEventPacket.`);
    assert.ok(!Object.prototype.hasOwnProperty.call(structuredFacts, 'deterministicEvidence'), `${fixture.id}: Stage 2 structuredFacts must not duplicate deterministic evidence outside deterministicEventPacket.`);

    const interpretationPrompt = hooks.buildProductionChartGuruInterpretationPrompt(structuredFacts, tightenedPrompt);
    const interpreterInput = extractJsonAfterMarker(
      interpretationPrompt,
      'Before writing the final Chart Guru prose, produce the internal trader interpretation from these structured chart facts.'
    );
    assert.ok(interpreterInput, `${fixture.id}: Stage 2 prompt must embed structuredFacts JSON.`);
    assert.ok(Object.prototype.hasOwnProperty.call(interpreterInput, 'deterministicEventPacket'), `${fixture.id}: Stage 2 prompt must include deterministicEventPacket.`);
    assert.ok(!Object.prototype.hasOwnProperty.call(interpreterInput, 'eventSequence'), `${fixture.id}: Stage 2 prompt must not duplicate eventSequence as a top-level field.`);
    assert.ok(!Object.prototype.hasOwnProperty.call(interpreterInput, 'deterministicEvidence'), `${fixture.id}: Stage 2 prompt must not duplicate deterministicEvidence as a top-level field.`);
    const interpretationBody = hooks.buildStrictSchemaRequestBody(
      'gpt-4o-mini',
      hooks.buildProductionChartGuruInterpretationInstructions(),
      interpretationPrompt,
      'chart_guru_trader_interpretation',
      hooks.TRADER_INTERPRETATION_SCHEMA,
      500
    );
    const interpretationMeasure = measureJsonBody(interpretationBody);

    const normalizedInterpretation = hooks.normalizeTraderInterpretation(fixture.interpreterResponse, packet);
    const tutorPrompt = hooks.buildProductionChartGuruFinalPrompt(normalizedInterpretation, tightenedPrompt);
    const tutorInput = extractJsonAfterMarker(
      tutorPrompt,
      'Trader interpretation to translate into Chart Guru teaching prose:'
    );
    assert.ok(tutorInput, `${fixture.id}: Stage 3 prompt must embed trader interpretation JSON.`);
    assert.deepStrictEqual(Object.keys(tutorInput).sort(), TUTOR_INPUT_KEYS.slice().sort(), `${fixture.id}: Stage 3 prompt must contain only the intended interpretation and semantic fields.`);
    assert.strictEqual(tutorInput.traderRead, tutorInput.traderInterpretation, `${fixture.id}: traderRead compatibility field must mirror traderInterpretation.`);
    assert.strictEqual(tutorInput.riskToWatch, tutorInput.currentRisk, `${fixture.id}: riskToWatch compatibility field must mirror currentRisk.`);
    assert.strictEqual(tutorInput.nextUsefulSignal, tutorInput.nextSignal, `${fixture.id}: nextUsefulSignal compatibility field must mirror nextSignal.`);
    [
      'trustedMarketContext',
      'canonicalValues',
      'deterministicEventPacket',
      'visible_latest_price',
      'visible_ma20',
      'visible_ma50',
      'visible_ma200',
      'screenshotDescription',
      'indicatorList',
      'chartRef',
      'input_image'
    ].forEach(forbidden => {
      assert.ok(!Object.prototype.hasOwnProperty.call(tutorInput, forbidden), `${fixture.id}: Stage 3 prompt must not include ${forbidden}.`);
      assert.ok(!tutorPrompt.includes(forbidden), `${fixture.id}: Stage 3 prompt must not leak ${forbidden}.`);
    });
    const tutorBody = hooks.buildStrictSchemaRequestBody(
      'gpt-4o-mini',
      hooks.buildProductionChartGuruFinalInstructions(),
      tutorPrompt,
      'chart_guru_final_prose',
      hooks.FINAL_PROSE_SCHEMA,
      700
    );
    const tutorMeasure = measureJsonBody(tutorBody);

    const measures = {
      verificationBodyChars:verificationMeasure.chars,
      verificationBodyTokens:verificationMeasure.estimatedTokens,
      fullAnalysisBodyChars:fullAnalysisMeasure.chars,
      fullAnalysisBodyTokens:fullAnalysisMeasure.estimatedTokens,
      stage2PromptChars:interpretationPrompt.length,
      stage2PromptTokens:estimateTokensFromChars(interpretationPrompt.length),
      stage2BodyChars:interpretationMeasure.chars,
      stage2BodyTokens:interpretationMeasure.estimatedTokens,
      stage3PromptChars:tutorPrompt.length,
      stage3PromptTokens:estimateTokensFromChars(tutorPrompt.length),
      stage3BodyChars:tutorMeasure.chars,
      stage3BodyTokens:tutorMeasure.estimatedTokens
    };

    Object.entries(measures).forEach(([key, value]) => {
      if(value > maxMeasurements[key]){
        maxMeasurements[key] = value;
        worstFixture[key] = fixture.id;
      }
    });
  }

  Object.entries(APPROVED_BASELINES).forEach(([key, baseline]) => {
    assertWithinBoundedBaseline(maxMeasurements[key], baseline, key);
  });

  console.log('Chart Guru AI contract measurements', JSON.stringify({
    maxMeasurements,
    worstFixture
  }));
}

function main(){
  verifyBudgetsAndVerificationPath();
  verifyStagePayloadShapesAndGrowth();
  console.log('Chart Guru AI contract assertions passed.');
}

main();
