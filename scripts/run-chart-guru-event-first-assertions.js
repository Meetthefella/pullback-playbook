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

function toPlainJson(value){
  return JSON.parse(JSON.stringify(value));
}

function buildEventPacketSandbox(){
  const sandbox = {console};
  sandbox.globalThis = sandbox;
  const snippets = [
    extractConstAssignment('CHART_GURU_EVENT_LABELS'),
    extractFunction('chartGuruDominantEventLabel'),
    extractFunction('buildDeterministicEventPacketFromChartCoach')
  ].join('\n\n');
  vm.runInNewContext(snippets, sandbox, {filename:appPath});
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

function verifyAppPayloadIncludesDeterministicEventPacket(){
  const eventPacket = {
    dominantEventKey:'failed_bounce',
    dominantEventLabel:'Failed first bounce from 20MA',
    eventSequence:['pullback_to_20ma', 'bounce_attempt', 'failed_bounce']
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

function verifyDeterministicEventPacketPreservesTrace(){
  const sandbox = buildEventPacketSandbox();
  for(const fixture of fixtures){
    const packet = sandbox.buildDeterministicEventPacketFromChartCoach(fixture.deterministicChartCoach);
    const story = fixture.deterministicChartCoach.primaryStory;
    const recent = fixture.deterministicChartCoach.recentStory;
    assert.strictEqual(packet.dominantEventKey, story.key, `${fixture.id}: dominant event key should match deterministic primary story key.`);
    assert.strictEqual(packet.dominantEvent, story.text, `${fixture.id}: dominant event text should preserve primary story text.`);
    assert.strictEqual(packet.primaryStoryKey, story.key, `${fixture.id}: primaryStoryKey should be preserved.`);
    assert.strictEqual(packet.recentStoryKey, recent.key, `${fixture.id}: recentStoryKey should be preserved.`);
    assert.strictEqual(packet.dominantEventLabel, sandbox.chartGuruDominantEventLabel(story.key), `${fixture.id}: dominant event label should be mapped from the existing story key.`);
    assert.deepStrictEqual(toPlainJson(packet.eventSequence), toPlainJson(recent.steps), `${fixture.id}: event sequence should preserve deterministic recent story steps.`);
    assert.deepStrictEqual(toPlainJson(packet.stepDetails), toPlainJson(recent.stepDetails), `${fixture.id}: step details should preserve deterministic recent story trace.`);
    assert.ok(packet.evidenceFactIds.includes(story.evidenceFactIds[0]), `${fixture.id}: packet should carry primary story evidence ids.`);
    assert.ok(packet.evidenceFactIds.includes(recent.evidenceFactIds[0]), `${fixture.id}: packet should carry recent story evidence ids.`);
  }
}

function verifyNetlifyNormalizationAndTutorBoundary(){
  const hooks = analyseSetupModule.__test;
  assert.ok(hooks, 'analyse-setup.js must expose a __test surface for contract assertions.');

  for(const fixture of fixtures){
    const sourcePacket = buildEventPacketSandbox().buildDeterministicEventPacketFromChartCoach(fixture.deterministicChartCoach);
    const normalizedPacket = hooks.normalizeDeterministicEventPacket(sourcePacket);
    assert.strictEqual(normalizedPacket.dominantEventLabel, sourcePacket.dominantEventLabel, `${fixture.id}: normalized packet should preserve dominant event label.`);
    assert.deepStrictEqual(toPlainJson(normalizedPacket.eventSequence), toPlainJson(sourcePacket.eventSequence), `${fixture.id}: normalized packet should preserve event sequence.`);
    assert.strictEqual(normalizedPacket.primaryStoryKey, sourcePacket.primaryStoryKey, `${fixture.id}: normalized packet should preserve primary story key.`);
    assert.strictEqual(normalizedPacket.recentStoryKey, sourcePacket.recentStoryKey, `${fixture.id}: normalized packet should preserve recent story key.`);

    const payload = {
      ...normalizeFixturePayload(fixture),
      deterministicEventPacket:sourcePacket
    };
    const structuredFacts = hooks.buildProductionStructuredFacts(payload, {});
    assert.strictEqual(structuredFacts.deterministicEventPacket.dominantEventLabel, sourcePacket.dominantEventLabel, `${fixture.id}: structured facts should carry normalized deterministicEventPacket.`);
    assert.deepStrictEqual(toPlainJson(structuredFacts.eventSequence), toPlainJson(sourcePacket.eventSequence), `${fixture.id}: structured facts should mirror deterministic event sequence.`);

    const compatInterpretation = hooks.normalizeTraderInterpretation({
      dominantEvent:fixture.interpreterResponse.dominantEvent,
      traderRead:fixture.interpreterResponse.traderInterpretation,
      riskToWatch:fixture.interpreterResponse.currentRisk,
      nextUsefulSignal:fixture.interpreterResponse.nextSignal
    }, structuredFacts.deterministicEventPacket);
    assert.strictEqual(compatInterpretation.dominantEvent, fixture.interpreterResponse.dominantEvent, `${fixture.id}: trader interpretation should preserve dominantEvent.`);
    assert.deepStrictEqual(toPlainJson(compatInterpretation.eventSequence), toPlainJson(sourcePacket.eventSequence), `${fixture.id}: trader interpretation should fall back to deterministic event sequence when omitted by the model.`);
    assert.strictEqual(compatInterpretation.traderInterpretation, fixture.interpreterResponse.traderInterpretation, `${fixture.id}: trader interpretation should normalize traderInterpretation.`);
    assert.strictEqual(compatInterpretation.currentRisk, fixture.interpreterResponse.currentRisk, `${fixture.id}: trader interpretation should normalize currentRisk.`);
    assert.strictEqual(compatInterpretation.nextSignal, fixture.interpreterResponse.nextSignal, `${fixture.id}: trader interpretation should normalize nextSignal.`);
    assert.strictEqual(hooks.validateTraderInterpretationResponse(compatInterpretation).ok, true, `${fixture.id}: normalized trader interpretation should satisfy the Stage 2 contract.`);

    const tutorPrompt = hooks.buildProductionChartGuruFinalPrompt(compatInterpretation, 'Tutor prompt preface');
    assert.ok(tutorPrompt.includes('Trader interpretation to translate into Chart Guru teaching prose:'), `${fixture.id}: Stage 3 prompt should explicitly consume trader interpretation.`);
    assert.ok(tutorPrompt.includes(compatInterpretation.traderInterpretation), `${fixture.id}: Stage 3 prompt should include normalized trader interpretation.`);
    assert.ok(!tutorPrompt.includes('trustedMarketContext'), `${fixture.id}: Stage 3 prompt must not include raw trusted market facts.`);
    assert.ok(!tutorPrompt.includes('deterministicEventPacket'), `${fixture.id}: Stage 3 prompt must not include raw deterministic packet payload.`);
    assert.ok(!tutorPrompt.includes('visible_latest_price'), `${fixture.id}: Stage 3 prompt must not include screenshot-derived evidence fields.`);
    assert.ok(hooks.buildProductionChartGuruFinalInstructions().includes('Do not inspect raw chart evidence.'), `${fixture.id}: Stage 3 instructions must forbid raw evidence access.`);

    const chartCoach = hooks.buildTwoStepChartCoach(fixture.finalProse, compatInterpretation, {
      deterministicEventPacket:sourcePacket
    });
    assert.strictEqual(chartCoach.primaryStory.key, sourcePacket.primaryStoryKey, `${fixture.id}: final chartCoach must preserve deterministic primary story authority.`);
    assert.strictEqual(chartCoach.recentStory.key, sourcePacket.recentStoryKey, `${fixture.id}: final chartCoach must preserve deterministic recent story authority.`);
    assert.notStrictEqual(chartCoach.primaryStory.key, 'openai_two_step_primary_story', `${fixture.id}: chartCoach must not create an OpenAI-only primary story contract when deterministic authority exists.`);
    assert.notStrictEqual(chartCoach.recentStory.key, 'openai_two_step_narrative', `${fixture.id}: chartCoach must not replace deterministic recent story key with an OpenAI-only story key.`);
    assert.deepStrictEqual(toPlainJson(chartCoach.recentStory.steps), toPlainJson(sourcePacket.eventSequence), `${fixture.id}: chartCoach must preserve the deterministic event sequence.`);
    assert.strictEqual(chartCoach.diagnostics.storyContract.primaryStoryKey, sourcePacket.primaryStoryKey, `${fixture.id}: diagnostics must point to deterministic primary story authority.`);
    assert.strictEqual(chartCoach.diagnostics.storyContract.storyKey, sourcePacket.recentStoryKey, `${fixture.id}: diagnostics must point to deterministic recent story authority.`);

    const mergedAnalysis = hooks.mergeTwoStepNarrativeIntoAnalysis({}, fixture.finalProse, compatInterpretation, {
      deterministicEventPacket:sourcePacket
    });
    assert.strictEqual(mergedAnalysis.deterministicEventPacket.primaryStoryKey, sourcePacket.primaryStoryKey, `${fixture.id}: merged analysis must store deterministicEventPacket.`);
    assert.deepStrictEqual(toPlainJson(mergedAnalysis.traderInterpretation.eventSequence), toPlainJson(sourcePacket.eventSequence), `${fixture.id}: merged analysis must retain eventSequence in traderInterpretation.`);
    assert.strictEqual(mergedAnalysis.traderInterpretation.traderInterpretation, fixture.interpreterResponse.traderInterpretation, `${fixture.id}: merged analysis must store normalized traderInterpretation text.`);
  }
}

function verifyFixtureCoverage(){
  const ids = fixtures.map(fixture => fixture.id);
  assert.ok(ids.includes('CAT_event_first_failed_bounce'), 'Fixture set must include the CAT failed-first-bounce event-first case.');
  assert.ok(ids.includes('ALLY_event_first_50ma_test'), 'Fixture set must include the ALLY 50MA-test event-first case.');
}

function run(){
  verifyFixtureCoverage();
  verifyAppPayloadIncludesDeterministicEventPacket();
  verifyDeterministicEventPacketPreservesTrace();
  verifyNetlifyNormalizationAndTutorBoundary();
  console.log('run-chart-guru-event-first-assertions: ok');
}

run();
