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
    extractFunction('chartGuruBuyerResponsePresent'),
    extractFunction('chartGuruRecentSupportType'),
    extractFunction('chartGuruResolvedSupportType'),
    extractFunction('chartGuruRecentSupportResponsePresent'),
    extractFunction('chartGuruSupportReferenceLevel'),
    extractFunction('chartGuruSupportDistancePct'),
    extractFunction('chartGuruSemanticEnvelopeFromNarrativeContext'),
    extractFunction('chartGuruSemanticEnvelopeCompatibilityForStoryKey'),
    extractFunction('chartGuruNarrativeContext'),
    extractFunction('chartGuruSemanticEnvelopeFromStory'),
    extractFunction('eventPacketEvidenceIncludes'),
    extractFunction('chartGuruResolveSemanticEnvelopeValue'),
    extractFunction('buildDeterministicEventPacketFromChartCoach'),
    extractFunction('chartCoachModelIsUsable')
  ].join('\n\n'), sandbox, {filename:appPath});
  return sandbox;
}

function buildStage15SelectorSandbox(){
  const sandbox = {console};
  sandbox.globalThis = sandbox;
  vm.runInNewContext([
    extractFunction('chartCoachRecentColorRun'),
    extractFunction('chartCoachLargeBodyRun'),
    extractFunction('chartGuruBuyerResponsePresent'),
    extractFunction('chartGuruControlledPullbackPresent'),
    extractFunction('chartGuruVolumeParticipationLabel'),
    extractFunction('chartNarratorSupportLabel'),
    extractFunction('chartGuruRecentSupportType'),
    extractFunction('chartGuruResolvedSupportType'),
    extractFunction('chartGuruRecentSupportResponsePresent'),
    extractFunction('chartGuruSupportReferenceLevel'),
    extractFunction('chartGuruSupportDistancePct'),
    extractFunction('chartGuruSemanticEnvelopeFromNarrativeContext'),
    extractFunction('chartGuruSemanticEnvelopeCompatibilityForStoryKey'),
    extractFunction('chartGuruNarrativeContext'),
    extractFunction('chartCoachPrimaryStoryCandidates')
  ].join('\n\n'), sandbox, {filename:'chart-guru-stage15-selector.js'});
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
    resolveCanonicalPullbackState(){
      return {
        canonicalPullbackState:'near_20ma',
        reconciliationReason:'',
        supportInteractionState:'active_20ma_support',
        currentLocationState:'near_20ma',
        pullbackValiditySource:'raw_pullback_zone'
      };
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
    'VRT_event_first_momentum_fading',
    'UNP_event_first_early_rebound_20ma',
    'MSFT_event_first_support_breakdown_stabilising'
  ].forEach(id => {
    assert.ok(ids.includes(id), `Fixture set must include ${id}.`);
  });
}

function verifySemanticClassifierCoverage(){
  const hooks = analyseSetupModule.__test;
  [
    'Price is away from support right now.',
    'It is not sitting near support anymore.',
    'Traders may need a clearer support area elsewhere.',
    'This setup is waiting for price to pull back into support.'
  ].forEach(text => {
    assert.strictEqual(hooks.classifySupportNarrationSemantic(text), 'support_absent', `Support classifier should treat "${text}" as support_absent.`);
  });
  [
    'Price is rebounding from the 20-day average.',
    'The setup is still sitting near support.',
    'Buyers are defending the support area.'
  ].forEach(text => {
    assert.strictEqual(hooks.classifySupportNarrationSemantic(text), 'support_present', `Support classifier should treat "${text}" as support_present.`);
  });
  assert.ok(
    hooks.semanticContradictionsForEnvelope('Price is away from support and waiting for a cleaner pullback.', {supportSemantic:'support_present'}).length >= 1,
    'Semantic envelope should reject support-absent narration when supportSemantic is support_present.'
  );
  assert.strictEqual(
    hooks.classifyRepairNarrationSemantic('Buyers are trying to stabilise the chart, but they have not regained control yet.'),
    'repair_unconfirmed',
    'Repair classifier should recognise unconfirmed stabilisation attempts.'
  );
  assert.ok(
    hooks.semanticContradictionsForEnvelope(
      'Support has failed, sellers are still in charge, and the chart needs a clearer support area elsewhere.',
      {
        supportSemantic:'support_failed',
        buyerResponseSemantic:'response_present',
        confirmationSemantic:'follow_through_unconfirmed'
      }
    ).length >= 1,
    'Semantic envelope should reject damaged-chart narration that omits the active buyer response.'
  );
  assert.strictEqual(
    hooks.validateFinalProseResponse({
      chartStory:'Price has reached support, and buyers are pushing it higher.',
      whyItMatters:'This matters because traders now have a reason to trust the bounce.',
      setupLocation:'The price is sitting at the 50-day moving average, which is a support area.',
      learningPoint:'Support tests can work well when buyers prove themselves quickly.',
      whatNext:'Watch for the confirmed bounce to keep working higher.'
    }, [], {
      supportSemantic:'support_present',
      buyerResponseSemantic:'response_absent',
      confirmationSemantic:'follow_through_unconfirmed'
    }, {
      traderInterpretation:{
        supportSemantic:'support_present',
        buyerResponseSemantic:'response_absent',
        confirmationSemantic:'follow_through_unconfirmed'
      }
    }).ok,
    false,
    'Tutor validation must reject response-absent prose that implies a confirmed bounce.'
  );
  assert.strictEqual(
    hooks.validateFinalProseResponse({
      chartStory:'Buyers stepped in at support, but they are back in full control now.',
      whyItMatters:'This matters because the stock looks ready again.',
      setupLocation:'The price is near support at the 20-day moving average.',
      learningPoint:'A first response can look good, but traders still want proof.',
      whatNext:'Watch to see if buyers can back it up with another strong close.'
    }, [], {
      supportSemantic:'support_present',
      buyerResponseSemantic:'response_present',
      confirmationSemantic:'follow_through_unconfirmed'
    }, {
      traderInterpretation:{
        supportSemantic:'support_present',
        buyerResponseSemantic:'response_present',
        confirmationSemantic:'follow_through_unconfirmed'
      }
    }).ok,
    false,
    'Tutor validation must reject response-present prose that claims control has already been regained.'
  );
  assert.strictEqual(
    hooks.validateFinalProseResponse({
      chartStory:'The pullbacks are getting messier, and buyers are not pushing back as strongly as before. That tells traders this setup is losing quality.',
      whyItMatters:'This matters because traders usually want cleaner pullbacks than this.',
      setupLocation:'The trend is still partly intact, but the support area is not producing clean reactions.',
      learningPoint:'A chart can stay in trend, but traders still need to see clean pullbacks before trusting it.',
      whatNext:'Watch for proof that the pullbacks are cleaning up and buyers are pushing back with more strength.'
    }, [], {
      dominantEventKey:'extended_after_run'
    }, {
      traderInterpretation:{
        dominantEventKey:'extended_after_run',
        supportSemantic:'support_unknown',
        buyerResponseSemantic:'response_unknown',
        confirmationSemantic:'follow_through_unconfirmed'
      }
    }).ok,
    true,
    'Fading-quality narration should pass when deterioration leads the chart story.'
  );
  assert.strictEqual(
    hooks.validateFinalProseResponse({
      chartStory:'This situation indicates a potential opportunity as market participants assess the constructive backdrop.',
      whyItMatters:'This situation indicates that buyer commitment may facilitate a more favourable position.',
      setupLocation:'The price is near support.',
      learningPoint:'Always be cautious.',
      whatNext:'Watch for proof.'
    }, [], {
      supportSemantic:'support_present',
      buyerResponseSemantic:'response_absent',
      confirmationSemantic:'follow_through_unconfirmed'
    }, {
      traderInterpretation:{
        supportSemantic:'support_present',
        buyerResponseSemantic:'response_absent',
        confirmationSemantic:'follow_through_unconfirmed'
      }
    }).ok,
    false,
    'Tutor validation must reject abstract AI wording and generic learning advice.'
  );
  assert.strictEqual(
    hooks.validateFinalProseResponse({
      chartStory:'The pullback is near the 20-day average. Buyers have not shown enough yet. The setup is still early.',
      whyItMatters:'This matters because support still needs proof.',
      setupLocation:'Price is near the 20-day average support area.',
      learningPoint:'Wait for confirmation.',
      whatNext:'Watch for buyers to hold the 20-day average and add follow-through.'
    }, [], {
      dominantEventKey:'constructive_pullback_awaiting_confirmation',
      supportSemantic:'support_present',
      buyerResponseSemantic:'response_absent',
      confirmationSemantic:'follow_through_unconfirmed'
    }, {
      traderInterpretation:{
        dominantEventKey:'constructive_pullback_awaiting_confirmation',
        supportSemantic:'support_present',
        buyerResponseSemantic:'response_absent',
        confirmationSemantic:'follow_through_unconfirmed'
      }
    }).ok,
    false,
    'Tutor validation must reject learningPoint text that falls back to generic advice-only wording.'
  );
  assert.strictEqual(
    hooks.validateFinalProseResponse({
      chartStory:'Buyers tried to bounce from the 20-day average, but that first bounce faded quickly. Support has not proved itself yet.',
      whyItMatters:'This matters because a failed first bounce often means the pullback still needs more work.',
      setupLocation:'Price is still working around the 20-day average, with the 50-day average below as backup support.',
      learningPoint:'A support touch matters less than what buyers do next. A failed first bounce is a reason to stay patient.',
      whatNext:'Watch for buyers to reclaim the 20-day average and add follow-through before trusting the pullback again.'
    }, [], {
      dominantEventKey:'failed_first_bounce_from_20ma',
      supportSemantic:'support_present',
      buyerResponseSemantic:'response_present',
      confirmationSemantic:'follow_through_unconfirmed'
    }, {
      traderInterpretation:{
        dominantEventKey:'failed_first_bounce_from_20ma',
        supportSemantic:'support_present',
        buyerResponseSemantic:'response_present',
        confirmationSemantic:'follow_through_unconfirmed'
      }
    }).ok,
    true,
    'Failed-bounce prose should pass when chartStory is event-led and learningPoint teaches the specific event lesson.'
  );
  assert.ok(
    hooks.semanticContradictionsForEnvelope(
      'Price is not near support right now and needs to move back into the 20-day average before this becomes interesting.',
      {
        dominantEventKey:'early_rebound_from_20ma',
        supportSemantic:'support_present',
        buyerResponseSemantic:'response_present',
        confirmationSemantic:'follow_through_unconfirmed'
      }
    ).length >= 1,
    'UNP-style near-support rebound narration must reject support-absent meaning after buyers have already responded.'
  );
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
  assert.strictEqual(payload.pullbackZone, 'near_20ma', 'Client analysis payload should use canonical pullback state for narration parity.');
  assert.strictEqual(payload.canonicalPullbackState, 'near_20ma', 'Client analysis payload should expose canonicalPullbackState.');
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
      'storyEvents',
      'supportState',
      'buyerControlState',
      'currentPhase',
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
    assert.ok(Array.isArray(packet.storyEvents), `${fixture.id}: storyEvents must be present.`);
    assert.deepStrictEqual(packet.stepDetails, recentStory.stepDetails, `${fixture.id}: stepDetails must preserve recent story trace.`);
    assert.ok(packet.evidenceFactIds.length >= 1, `${fixture.id}: evidenceFactIds must remain populated.`);
  }
}

function verifyEventPacketNarrativeSemanticAlignment(){
  const sandbox = buildEventPacketSandbox();
  const makePacket = narrativeContext => sandbox.buildDeterministicEventPacketFromChartCoach({
    primaryStory:{
      key:'extended_after_run',
      label:'Chart Story',
      icon:'📈',
      text:'Deterministic story',
      evidenceFactIds:['trend_context'],
      confidence:0.9,
      rankReason:'test'
    },
    recentStory:{
      key:'extended_after_run',
      bias:'good',
      toneMode:'test',
      confidenceMode:'test',
      trendLabel:'Test',
      supportLabel:'20-day average',
      steps:['story_step'],
      stepDetails:[{key:'story_step', evidenceFactIds:['trend_context'], derivedFromSteps:['story_step'], derivedFromConditions:[]}],
      evidenceFactIds:['trend_context']
    },
    diagnostics:{
      narrativeContext
    }
  });
  const stalledNarrative = {
    support:{level:'20ma_support', label:'20-day average', interaction:'held', currentlyActive:false, distanceMeasured:true, distanceFromSupportPct:0.031, semantic:'support_unknown'},
    buyerResponse:{state:'present', semantic:'response_present'},
    buyerControl:{state:'emerging'},
    confirmation:{semantic:'follow_through_unconfirmed'},
    currentState:{phase:'stalled_after_response'},
    storyEvents:['buyers_responded', 'rebound_stalled']
  };
  const stalledPacket = makePacket(stalledNarrative);
  assert.strictEqual(stalledPacket.supportSemantic, 'support_absent', 'Stalled rebound packet should fall through to compatibility support semantics when narrative support remains unresolved.');
  assert.strictEqual(stalledPacket.buyerResponseSemantic, 'response_present', 'Stalled rebound packet must preserve the initial buyer response.');
  assert.strictEqual(stalledPacket.confirmationSemantic, 'follow_through_unconfirmed', 'Stalled rebound packet must keep confirmation unconfirmed.');
  assert.ok(stalledPacket.storyEvents.includes('buyers_responded'), 'Stalled rebound packet should preserve buyers_responded chronology.');
  assert.notStrictEqual(stalledPacket.buyerResponseSemantic, 'response_absent', 'buyers_responded must not coexist with response_absent.');

  const extendedNarrative = {
    support:{level:'20ma_support', label:'20-day average', interaction:'held', currentlyActive:false, distanceMeasured:true, distanceFromSupportPct:0.056, semantic:'support_absent'},
    buyerResponse:{state:'present', semantic:'response_present'},
    buyerControl:{state:'confirmed'},
    confirmation:{semantic:'follow_through_confirmed'},
    currentState:{phase:'extended_from_support'},
    storyEvents:['buyers_responded', 'buyer_control_confirmed', 'rebound_extended']
  };
  const extendedPacket = makePacket(extendedNarrative);
  assert.strictEqual(extendedPacket.supportSemantic, 'support_absent', 'Extended rebound packet must project supportSemantic from narrative context.');
  assert.strictEqual(extendedPacket.supportState.currentlyActive, false, 'Extended rebound packet must not keep support active.');
  assert.strictEqual(extendedPacket.currentPhase, 'extended_from_support', 'Extended rebound packet must preserve the extension phase.');
  assert.ok(extendedPacket.storyEvents.includes('rebound_extended'), 'Extended rebound packet should preserve rebound_extended chronology.');

  const failedNarrative = {
    support:{level:'20ma_support', label:'20-day average', interaction:'failed', currentlyActive:false, distanceMeasured:true, distanceFromSupportPct:0.018, semantic:'support_failed'},
    buyerResponse:{state:'absent', semantic:'response_failed'},
    buyerControl:{state:'none'},
    confirmation:{semantic:'follow_through_failed'},
    currentState:{phase:'support_failed'},
    storyEvents:['failed_bounce']
  };
  const failedPacket = makePacket(failedNarrative);
  assert.strictEqual(failedPacket.supportSemantic, 'support_failed', 'Failed support packet must project support_failed from narrative context.');
  assert.strictEqual(failedPacket.buyerResponseSemantic, 'response_failed', 'Failed support packet must project response_failed from narrative context.');

  const unknownDistanceNarrative = {
    support:{level:'20ma_support', label:'20-day average', interaction:'held', currentlyActive:false, distanceMeasured:false, distanceFromSupportPct:null, semantic:'support_unknown'},
    buyerResponse:{state:'present', semantic:'response_present'},
    buyerControl:{state:'emerging'},
    confirmation:{semantic:'follow_through_unconfirmed'},
    currentState:{phase:'current_location_unresolved'},
    storyEvents:['buyers_responded']
  };
  const unknownDistancePacket = makePacket(unknownDistanceNarrative);
  assert.strictEqual(unknownDistancePacket.supportState.distanceMeasured, false, 'Unknown-distance packet must preserve unmeasurable support distance.');
  assert.notStrictEqual(unknownDistancePacket.currentPhase, 'extended_from_support', 'Unknown-distance packet must not claim an extension phase.');
  assert.ok(!unknownDistancePacket.storyEvents.includes('rebound_extended'), 'Unknown-distance packet must not emit rebound_extended.');

  const noResponseNarrative = {
    support:{level:'50ma_support', label:'50-day average', interaction:'testing', currentlyActive:true, distanceMeasured:true, distanceFromSupportPct:0.008, semantic:'support_present'},
    buyerResponse:{state:'absent', semantic:'response_absent'},
    buyerControl:{state:'none'},
    confirmation:{semantic:'follow_through_unknown'},
    currentState:{phase:'at_support'},
    storyEvents:['support_testing_at_50ma']
  };
  const noResponsePacket = makePacket(noResponseNarrative);
  assert.strictEqual(noResponsePacket.buyerResponseSemantic, 'response_absent', 'No-response packet must preserve response_absent.');

  const confirmedBuyerNarrative = {
    support:{level:'50ma_support', label:'50-day average', interaction:'held', currentlyActive:true, distanceMeasured:true, distanceFromSupportPct:0.01, semantic:'support_present'},
    buyerResponse:{state:'present', semantic:'response_present'},
    buyerControl:{state:'confirmed'},
    confirmation:{semantic:'follow_through_confirmed'},
    currentState:{phase:'responding_from_support'},
    storyEvents:['buyers_responded', 'buyer_control_confirmed']
  };
  const confirmedBuyerPacket = makePacket(confirmedBuyerNarrative);
  assert.strictEqual(confirmedBuyerPacket.buyerControlState, 'confirmed', 'Confirmed buyer-control packet must preserve buyerControlState.');
  assert.strictEqual(confirmedBuyerPacket.confirmationSemantic, 'follow_through_confirmed', 'Confirmed buyer-control packet must preserve follow-through confirmation.');
}

function verifySemanticEnvelopeCompatibilityFallback(){
  const sandbox = buildEventPacketSandbox();

  const failedBounceEnvelope = sandbox.chartGuruSemanticEnvelopeFromStory('failed_bounce', {});
  assert.strictEqual(failedBounceEnvelope.supportSemantic, 'support_failed', 'Key-only failed_bounce must preserve support_failed semantics.');
  assert.strictEqual(failedBounceEnvelope.buyerResponseSemantic, 'response_failed', 'Key-only failed_bounce must preserve response_failed semantics.');
  assert.notStrictEqual(failedBounceEnvelope.supportSemantic, 'support_unknown', 'Key-only failed_bounce must not degrade to support_unknown.');

  const breakdownEnvelope = sandbox.chartGuruSemanticEnvelopeFromStory('structure_breaking_down', {});
  assert.strictEqual(breakdownEnvelope.supportSemantic, 'support_failed', 'Key-only structure_breaking_down must preserve support_failed semantics.');
  assert.strictEqual(breakdownEnvelope.buyerResponseSemantic, 'response_failed', 'Key-only structure_breaking_down must preserve response_failed semantics.');
  assert.notStrictEqual(breakdownEnvelope.supportSemantic, 'support_unknown', 'Key-only structure_breaking_down must not degrade to support_unknown.');

  const repairingEnvelope = sandbox.chartGuruSemanticEnvelopeFromStory('pullback_still_repairing', {});
  assert.strictEqual(repairingEnvelope.supportSemantic, 'support_failed', 'Key-only pullback_still_repairing must preserve support_failed semantics.');
  assert.notStrictEqual(repairingEnvelope.supportSemantic, 'support_unknown', 'Key-only pullback_still_repairing must not degrade to support_unknown.');

  const unknownEnvelope = sandbox.chartGuruSemanticEnvelopeFromStory('unknown_story_key', {});
  assert.strictEqual(unknownEnvelope.supportSemantic, 'support_unknown', 'Unknown key should keep support semantics unresolved.');
  assert.strictEqual(unknownEnvelope.buyerResponseSemantic, 'response_unknown', 'Unknown key should keep buyer response semantics unresolved.');

  const richContextEnvelope = sandbox.chartGuruSemanticEnvelopeFromStory('failed_bounce', {
    supportContext:'20ma',
    supportTestState:'held',
    pullbackNear20:true,
    structureIntact:true,
    structureBroken:false,
    buyerControlState:'confirmed',
    followThroughConfirmed:true,
    bounceState:'attempt',
    stabilisationState:'clear',
    reclaimConfirmed:true,
    candleEvidenceUpClosesAfterLow:2,
    candleEvidenceReclaimedPriorDayHigh:true
  });
  assert.strictEqual(richContextEnvelope.supportSemantic, 'support_present', 'Rich narrative context must remain authoritative over the key-only failed_bounce fallback.');
  assert.strictEqual(richContextEnvelope.buyerResponseSemantic, 'response_present', 'Rich narrative context must preserve current buyer-response semantics.');
  assert.strictEqual(richContextEnvelope.confirmationSemantic, 'follow_through_confirmed', 'Rich narrative context must preserve current confirmation semantics.');

  const reducedFailedBouncePacket = sandbox.buildDeterministicEventPacketFromChartCoach({
    primaryStory:{
      key:'failed_bounce',
      label:'Chart Story',
      icon:'📉',
      text:'Failed bounce',
      evidenceFactIds:['failed_bounce'],
      confidence:0.9,
      rankReason:'test'
    },
    recentStory:{
      key:'failed_bounce',
      bias:'bad',
      toneMode:'test',
      confidenceMode:'test',
      trendLabel:'Failed bounce',
      supportLabel:'20-day average',
      steps:['failed_bounce'],
      stepDetails:[{key:'failed_bounce', evidenceFactIds:['failed_bounce'], derivedFromSteps:['failed_bounce'], derivedFromConditions:['support_failed']}],
      evidenceFactIds:['failed_bounce']
    },
    diagnostics:{}
  });
  assert.strictEqual(reducedFailedBouncePacket.supportSemantic, 'support_failed', 'Reduced failed_bounce packet must preserve support_failed semantics through the compatibility envelope.');
  assert.strictEqual(reducedFailedBouncePacket.buyerResponseSemantic, 'response_failed', 'Reduced failed_bounce packet must preserve response_failed semantics through the compatibility envelope.');
  assert.strictEqual(reducedFailedBouncePacket.confirmationSemantic, 'follow_through_failed', 'Reduced failed_bounce packet must preserve failed-bounce confirmation semantics through the compatibility envelope.');

  const reducedBreakdownPacket = sandbox.buildDeterministicEventPacketFromChartCoach({
    primaryStory:{
      key:'structure_breaking_down',
      label:'Chart Story',
      icon:'📉',
      text:'Breaking down',
      evidenceFactIds:['structure_broken'],
      confidence:0.9,
      rankReason:'test'
    },
    recentStory:{
      key:'structure_breaking_down',
      bias:'bad',
      toneMode:'test',
      confidenceMode:'test',
      trendLabel:'Breaking down',
      supportLabel:'20-day average',
      steps:['broken_structure'],
      stepDetails:[{key:'broken_structure', evidenceFactIds:['structure_broken'], derivedFromSteps:['broken_structure'], derivedFromConditions:['support_failed']}],
      evidenceFactIds:['structure_broken']
    },
    diagnostics:{}
  });
  assert.strictEqual(reducedBreakdownPacket.supportSemantic, 'support_failed', 'Reduced structure_breaking_down packet must preserve support_failed semantics through the compatibility envelope.');
  assert.strictEqual(reducedBreakdownPacket.buyerResponseSemantic, 'response_failed', 'Reduced structure_breaking_down packet must preserve response_failed semantics through the compatibility envelope.');

  [
    {label:'missing recent-story support semantics', recentStory:{}},
    {label:'null recent-story support semantics', recentStory:{supportSemantic:null}},
    {label:'empty recent-story support semantics', recentStory:{supportSemantic:''}},
    {label:'unknown recent-story support semantics', recentStory:{supportSemantic:'support_unknown'}}
  ].forEach(testCase => {
    const reducedRepairingPacket = sandbox.buildDeterministicEventPacketFromChartCoach({
      primaryStory:{
        key:'pullback_still_repairing',
        label:'Chart Story',
        icon:'ðŸ“‰',
        text:'Still repairing',
        evidenceFactIds:['support_lost'],
        confidence:0.8,
        rankReason:'test'
      },
      recentStory:{
        key:'pullback_still_repairing',
        steps:['repair_needed'],
        stepDetails:[{key:'repair_needed', evidenceFactIds:['support_lost'], derivedFromSteps:['repair_needed'], derivedFromConditions:['support_failed']}],
        evidenceFactIds:['support_lost'],
        ...testCase.recentStory
      },
      diagnostics:{}
    });
    assert.strictEqual(reducedRepairingPacket.supportSemantic, 'support_failed', `Reduced pullback_still_repairing packet must preserve support_failed semantics with ${testCase.label}.`);
  });

  const sentinelRecentStoryPacket = sandbox.buildDeterministicEventPacketFromChartCoach({
    primaryStory:{
      key:'failed_bounce',
      label:'Chart Story',
      icon:'📉',
      text:'Failed bounce',
      evidenceFactIds:['failed_bounce'],
      confidence:0.9,
      rankReason:'test'
    },
    recentStory:{
      key:'failed_bounce',
      supportSemantic:'support_unknown',
      buyerResponseSemantic:'response_unknown',
      confirmationSemantic:'confirmation_unknown',
      steps:['failed_bounce'],
      stepDetails:[{key:'failed_bounce', evidenceFactIds:['failed_bounce'], derivedFromSteps:['failed_bounce'], derivedFromConditions:['support_failed']}],
      evidenceFactIds:['failed_bounce']
    },
    diagnostics:{}
  });
  assert.strictEqual(sentinelRecentStoryPacket.supportSemantic, 'support_failed', 'Unknown recent-story support sentinel must not outrank failed_bounce compatibility semantics.');
  assert.strictEqual(sentinelRecentStoryPacket.buyerResponseSemantic, 'response_failed', 'Unknown recent-story buyer-response sentinel must not outrank failed_bounce compatibility semantics.');
  assert.strictEqual(sentinelRecentStoryPacket.confirmationSemantic, 'follow_through_failed', 'Unknown recent-story confirmation sentinel must not outrank failed-bounce compatibility semantics.');

  const missingRecentStoryPacket = sandbox.buildDeterministicEventPacketFromChartCoach({
    primaryStory:{
      key:'structure_breaking_down',
      label:'Chart Story',
      icon:'📉',
      text:'Breaking down',
      evidenceFactIds:['structure_broken'],
      confidence:0.9,
      rankReason:'test'
    },
    recentStory:{
      key:'structure_breaking_down',
      supportSemantic:'',
      buyerResponseSemantic:null,
      confirmationSemantic:undefined,
      steps:['broken_structure'],
      stepDetails:[{key:'broken_structure', evidenceFactIds:['structure_broken'], derivedFromSteps:['broken_structure'], derivedFromConditions:['support_failed']}],
      evidenceFactIds:['structure_broken']
    },
    diagnostics:{}
  });
  assert.strictEqual(missingRecentStoryPacket.supportSemantic, 'support_failed', 'Missing recent-story support semantics must fall through to structure_breaking_down compatibility semantics.');
  assert.strictEqual(missingRecentStoryPacket.buyerResponseSemantic, 'response_failed', 'Missing recent-story buyer-response semantics must fall through to structure_breaking_down compatibility semantics.');

  const meaningfulRecentStoryPacket = sandbox.buildDeterministicEventPacketFromChartCoach({
    primaryStory:{
      key:'failed_bounce',
      label:'Chart Story',
      icon:'📉',
      text:'Failed bounce',
      evidenceFactIds:['failed_bounce'],
      confidence:0.9,
      rankReason:'test'
    },
    recentStory:{
      key:'failed_bounce',
      supportSemantic:'support_reclaimed',
      buyerResponseSemantic:'response_present',
      confirmationSemantic:'follow_through_unconfirmed',
      steps:['failed_bounce'],
      stepDetails:[{key:'failed_bounce', evidenceFactIds:['failed_bounce'], derivedFromSteps:['failed_bounce'], derivedFromConditions:['support_failed']}],
      evidenceFactIds:['failed_bounce']
    },
    diagnostics:{}
  });
  assert.strictEqual(meaningfulRecentStoryPacket.supportSemantic, 'support_reclaimed', 'Meaningful recent-story support semantics must retain precedence over compatibility semantics.');
  assert.strictEqual(meaningfulRecentStoryPacket.buyerResponseSemantic, 'response_present', 'Meaningful recent-story buyer-response semantics must retain precedence over compatibility semantics.');
  assert.strictEqual(meaningfulRecentStoryPacket.confirmationSemantic, 'follow_through_unconfirmed', 'Meaningful recent-story confirmation semantics must retain precedence over compatibility semantics.');

  const richNarrativePacket = sandbox.buildDeterministicEventPacketFromChartCoach({
    primaryStory:{
      key:'failed_bounce',
      label:'Chart Story',
      icon:'📉',
      text:'Failed bounce',
      evidenceFactIds:['failed_bounce'],
      confidence:0.9,
      rankReason:'test'
    },
    recentStory:{
      key:'failed_bounce',
      supportSemantic:'support_unknown',
      buyerResponseSemantic:'response_unknown',
      confirmationSemantic:'confirmation_unknown',
      steps:['failed_bounce'],
      stepDetails:[{key:'failed_bounce', evidenceFactIds:['failed_bounce'], derivedFromSteps:['failed_bounce'], derivedFromConditions:['support_failed']}],
      evidenceFactIds:['failed_bounce']
    },
    diagnostics:{
      narrativeContext:{
        support:{semantic:'support_present'},
        buyerResponse:{semantic:'response_present'},
        confirmation:{semantic:'follow_through_confirmed'},
        storyEvents:[]
      }
    }
  });
  assert.strictEqual(richNarrativePacket.supportSemantic, 'support_present', 'Narrative-context support semantics must remain authoritative over unknown recent-story and compatibility values.');
  assert.strictEqual(richNarrativePacket.buyerResponseSemantic, 'response_present', 'Narrative-context buyer-response semantics must remain authoritative over unknown recent-story and compatibility values.');
  assert.strictEqual(richNarrativePacket.confirmationSemantic, 'follow_through_confirmed', 'Narrative-context confirmation semantics must remain authoritative over unknown recent-story and compatibility values.');

  const unknownKeyPacket = sandbox.buildDeterministicEventPacketFromChartCoach({
    primaryStory:{
      key:'unknown_story_key',
      label:'Chart Story',
      icon:'📍',
      text:'Unknown story',
      evidenceFactIds:['trend_context'],
      confidence:0.5,
      rankReason:'test'
    },
    recentStory:{
      key:'unknown_story_key',
      supportSemantic:'support_unknown',
      buyerResponseSemantic:'response_unknown',
      confirmationSemantic:'confirmation_unknown',
      steps:['unknown_step'],
      stepDetails:[{key:'unknown_step', evidenceFactIds:['trend_context'], derivedFromSteps:['unknown_step'], derivedFromConditions:[]}],
      evidenceFactIds:['trend_context']
    },
    diagnostics:{}
  });
  assert.strictEqual(unknownKeyPacket.supportSemantic, 'support_unknown', 'Unknown key with unknown sentinels must remain support_unknown.');
  assert.strictEqual(unknownKeyPacket.buyerResponseSemantic, 'response_unknown', 'Unknown key with unknown sentinels must remain response_unknown.');
  assert.strictEqual(unknownKeyPacket.confirmationSemantic, 'follow_through_unknown', 'Unknown key with unknown sentinels must remain follow_through_unknown.');
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
    const validation = hooks.validateTraderInterpretationResponse(normalizedInterpretation, packet, structuredFacts);
    assert.strictEqual(validation.ok, true, `${fixture.id}: normalized interpreter output must satisfy schema.`);
    ['dominantEvent', 'traderInterpretation', 'currentRisk', 'nextSignal'].forEach(field => {
      assert.ok(String(normalizedInterpretation[field] || '').trim(), `${fixture.id}: interpreter output must include ${field}.`);
    });
    ['supportSemantic', 'buyerResponseSemantic', 'confirmationSemantic'].forEach(field => {
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
      'supportLabel',
      'trendLabel',
      'eventSequence',
      'traderInterpretation',
      'currentRisk',
      'nextSignal',
      'supportSemantic',
      'buyerResponseSemantic',
      'confirmationSemantic',
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
    assert.ok(hooks.buildProductionChartGuruFinalInstructions().includes('Chart Guru Style Guide:'), `${fixture.id}: Stage 3 instructions must include the style guide.`);
    assert.ok(hooks.buildProductionChartGuruFinalInstructions().includes('buyers have not regained control'), `${fixture.id}: Stage 3 instructions must prefer natural damaged-rebound wording.`);
    assert.ok(hooks.buildProductionChartGuruFinalInstructions().includes('momentum is fading'), `${fixture.id}: Stage 3 instructions must include preferred momentum-fading phrasing.`);
    assert.ok(hooks.buildProductionChartGuruFinalInstructions().includes('Section jobs are fixed.'), `${fixture.id}: Stage 3 instructions must define each section job explicitly.`);
    assert.ok(hooks.buildProductionChartGuruFinalInstructions().includes('Compact semantic-state examples:'), `${fixture.id}: Stage 3 instructions must include compact semantic-state examples.`);
    assert.ok(hooks.buildProductionChartGuruFinalInstructions().includes('buyers have not shown enough yet'), `${fixture.id}: Stage 3 instructions must reinforce response-absent spoken phrasing.`);

    const interpretationContradictions = hooks.semanticContradictionsForEnvelope([
      normalizedInterpretation.dominantEvent,
      normalizedInterpretation.traderInterpretation,
      normalizedInterpretation.currentRisk,
      normalizedInterpretation.nextSignal
    ].join(' '), normalizedInterpretation);
    assert.deepStrictEqual(interpretationContradictions, [], `${fixture.id}: interpreter output must stay inside the deterministic semantic envelope.`);

    assert.deepStrictEqual(toPlainJson(structuredFacts.deterministicEventPacket.eventSequence), toPlainJson(packet.eventSequence), `${fixture.id}: structured facts must retain deterministic event sequence inside deterministicEventPacket.`);
    assert.deepStrictEqual(toPlainJson(structuredFacts.deterministicEventPacket.stepDetails), toPlainJson(packet.stepDetails), `${fixture.id}: structured facts must retain deterministic evidence trace inside deterministicEventPacket.`);
    assert.ok(!Object.prototype.hasOwnProperty.call(structuredFacts, 'eventSequence'), `${fixture.id}: structured facts must not duplicate eventSequence outside deterministicEventPacket.`);
    assert.ok(!Object.prototype.hasOwnProperty.call(structuredFacts, 'deterministicEvidence'), `${fixture.id}: structured facts must not duplicate deterministicEvidence outside deterministicEventPacket.`);
  }
}

function verifyStage15PostSupportReboundSelection(){
  const sandbox = buildStage15SelectorSandbox();
  const selectPrimaryStory = context => {
    const candidates = sandbox.chartCoachPrimaryStoryCandidates(context);
    return Array.isArray(candidates) && candidates.length ? candidates[0] : null;
  };

  const baseTrendContext = {
    recentSequence:[],
    latestDirection:'green',
    latestWickRejection:'',
    bodyDescriptor:'strong',
    maRelation:{above20:true, above50:true, above200:true},
    structureIntact:true,
    structureBroken:false,
    structureWeakening:false,
    pullbackNear20:false,
    pullbackNear50:false,
    recentlyLeftSupportZone:false,
    offLevelWithoutStructureDamage:false,
    bounceAttempt:false,
    followThroughConfirmed:false,
    failedBounce:false,
    weakVolume:true,
    activeVolume:false,
    extendedAfterRun:true,
    actionable:false,
    setupLocationState:'extended',
    evaluationScanType:'unknown',
    bounceState:'none',
    stabilisationState:'none',
    reclaimConfirmed:false,
    candleEvidenceUpClosesAfterLow:0,
    candleEvidenceReclaimedPriorDayHigh:false,
    candleEvidenceHigherLowHold:false,
    candleEvidenceReclaimRangeMeaningful:false
  };

  const extendedWithoutPullback = selectPrimaryStory(baseTrendContext);
  assert.strictEqual(extendedWithoutPullback && extendedWithoutPullback.key, 'extended_after_run', 'A strong run with no recent support response must stay extended_after_run.');

  const postSupportRebound = selectPrimaryStory({
    ...baseTrendContext,
    recentlyLeftSupportZone:true,
    offLevelWithoutStructureDamage:true,
    setupLocationState:'off_level',
    evaluationScanType:'20MA',
    bounceAttempt:true,
    bounceState:'attempt',
    reclaimConfirmed:true,
    candleEvidenceUpClosesAfterLow:2,
    candleEvidenceReclaimedPriorDayHigh:true,
    candleEvidenceHigherLowHold:true
  });
  assert.strictEqual(postSupportRebound && postSupportRebound.key, 'extended_after_run', 'A rebound that has already progressed materially away from support should promote to the extension story instead of staying in the first-bounce family.');

  const postSupportStabilising = selectPrimaryStory({
    ...baseTrendContext,
    recentlyLeftSupportZone:true,
    offLevelWithoutStructureDamage:true,
    setupLocationState:'off_level',
    evaluationScanType:'20MA',
    bounceAttempt:false,
    bounceState:'none',
    stabilisationState:'early',
    reclaimConfirmed:true,
    candleEvidenceUpClosesAfterLow:1,
    candleEvidenceHigherLowHold:true
  });
  assert.strictEqual(postSupportStabilising && postSupportStabilising.key, 'extended_after_run', 'A stabilising move that is already materially extended from support should stay in the extension family rather than fall back to a first-bounce story.');

  const stalledOffLevelRebound = selectPrimaryStory({
    ...baseTrendContext,
    extendedAfterRun:false,
    recentlyLeftSupportZone:true,
    offLevelWithoutStructureDamage:true,
    setupLocationState:'off_level',
    evaluationScanType:'20MA',
    bounceAttempt:false,
    bounceState:'attempt',
    stabilisationState:'early',
    reclaimConfirmed:false,
    candleEvidenceUpClosesAfterLow:1,
    candleEvidenceHigherLowHold:false,
    bodyDescriptor:'small',
    latestDirection:'flat',
    weakVolume:true
  });
  assert.strictEqual(stalledOffLevelRebound && stalledOffLevelRebound.key, 'off_level_wait_for_clearer_support', 'A response that left support but failed to extend should stay in the off-level or stalled-rebound family.');

  const reclaimAfterSupportResponse = selectPrimaryStory({
    ...baseTrendContext,
    recentlyLeftSupportZone:true,
    offLevelWithoutStructureDamage:true,
    setupLocationState:'off_level',
    evaluationScanType:'20MA',
    bounceAttempt:false,
    bounceState:'improving',
    stabilisationState:'clear',
    reclaimConfirmed:true,
    candleEvidenceReclaimedPriorDayHigh:true,
    candleEvidenceReclaimRangeMeaningful:true
  });
  assert.strictEqual(reclaimAfterSupportResponse && reclaimAfterSupportResponse.key, 'extended_after_run', 'A reclaim after support response must not silently collapse into the generic first-bounce story once price is off-level.');

  const narrativeContext = sandbox.chartGuruNarrativeContext({
    ...baseTrendContext,
    currentPrice:288.3,
    ma20:273.251,
    ma50:269.7692,
    recentlyLeftSupportZone:true,
    offLevelWithoutStructureDamage:true,
    setupLocationState:'off_level',
    evaluationScanType:'20MA',
    bounceAttempt:true,
    bounceState:'attempt',
    reclaimConfirmed:true,
    candleEvidenceUpClosesAfterLow:2,
    candleEvidenceReclaimedPriorDayHigh:true,
    candleEvidenceHigherLowHold:true,
    supportTestState:'held',
    buyerControlState:'emerging'
  });
  assert.strictEqual(narrativeContext.support.currentlyActive, false, 'A materially extended rebound should mark support as historical context rather than the active chart location.');
  assert.strictEqual(narrativeContext.currentState.phase, 'extended_from_support', 'A materially extended rebound should expose the extended_from_support phase.');
  assert.ok((narrativeContext.support.distanceFromSupportPct || 0) > 0.04, 'Extended rebound diagnostics should expose a meaningful distance from support.');
  assert.ok(Array.isArray(narrativeContext.storyEvents) && narrativeContext.storyEvents.includes('rebound_extended'), 'Extended rebound chronology should emit rebound_extended.');

  const failedBounce = selectPrimaryStory({
    ...baseTrendContext,
    structureIntact:false,
    structureWeakening:true,
    extendedAfterRun:false,
    offLevelWithoutStructureDamage:false,
    recentlyLeftSupportZone:false,
    pullbackNear20:true,
    bounceAttempt:false,
    bounceState:'none',
    failedBounce:true,
    latestDirection:'red',
    bodyDescriptor:'strong'
  });
  assert.ok(
    ['failed_bounce', 'pullback_still_repairing', 'structure_breaking_down'].includes(failedBounce && failedBounce.key),
    'A support touch followed by a failed bounce must stay in the failed-bounce/support-failure family.'
  );
}

function verifyNullDistanceExtensionGuards(){
  const sandbox = buildStage15SelectorSandbox();
  const selectPrimaryStory = context => {
    const candidates = sandbox.chartCoachPrimaryStoryCandidates(context);
    return Array.isArray(candidates) && candidates.length ? candidates[0] : null;
  };
  const baseContext = {
    recentSequence:[],
    latestDirection:'green',
    latestWickRejection:'',
    bodyDescriptor:'strong',
    maRelation:{above20:true, above50:true, above200:true},
    structureIntact:true,
    structureBroken:false,
    structureWeakening:false,
    pullbackNear20:true,
    pullbackNear50:false,
    recentlyLeftSupportZone:true,
    offLevelWithoutStructureDamage:true,
    bounceAttempt:true,
    followThroughConfirmed:false,
    failedBounce:false,
    weakVolume:false,
    activeVolume:false,
    extendedAfterRun:false,
    actionable:false,
    setupLocationState:'off_level',
    evaluationScanType:'20MA',
    bounceState:'attempt',
    stabilisationState:'early',
    reclaimConfirmed:true,
    candleEvidenceUpClosesAfterLow:2,
    candleEvidenceReclaimedPriorDayHigh:true,
    candleEvidenceHigherLowHold:true,
    supportTestState:'held',
    buyerControlState:'emerging'
  };
  const nullCases = [
    {label:'missing currentPrice', context:{...baseContext, currentPrice:null, ma20:273.251, setupLocationState:'extended'}},
    {label:'missing ma20', context:{...baseContext, currentPrice:288.3, ma20:null, pullbackZone:'extended'}},
    {label:'missing currentPrice and ma20', context:{...baseContext, currentPrice:null, ma20:null, setupLocationState:'extended', pullbackZone:'extended'}},
    {label:'historical pullbackNear20 only', context:{...baseContext, currentPrice:null, ma20:273.251, pullbackNear20:true}},
    {label:'historical pullbackNear50 only', context:{...baseContext, currentPrice:288.3, ma20:null, pullbackNear20:false, pullbackNear50:true, evaluationScanType:'50MA', ma50:null}},
    {label:'ocr style incomplete record', context:{...baseContext, currentPrice:null, ma20:null, ma50:null, latestDirection:'flat', bodyDescriptor:'small', bounceAttempt:false, setupLocationState:'extended'}}
  ];
  nullCases.forEach(testCase => {
    const narrative = sandbox.chartGuruNarrativeContext(testCase.context);
    const story = selectPrimaryStory(testCase.context);
    assert.strictEqual(narrative.reboundExtended, false, `${testCase.label}: missing support distance must not set reboundExtended.`);
    assert.strictEqual(narrative.extensionEvidencePresent, false, `${testCase.label}: missing support distance must not create extension evidence.`);
    assert.strictEqual(narrative.support.distanceMeasured, false, `${testCase.label}: support distance should be marked unmeasurable.`);
    assert.ok(!Array.isArray(narrative.storyEvents) || !narrative.storyEvents.includes('rebound_extended'), `${testCase.label}: storyEvents must not emit rebound_extended.`);
    assert.notStrictEqual(narrative.currentState.phase, 'extended_from_support', `${testCase.label}: current phase must not claim an extended rebound.`);
    assert.notStrictEqual(narrative.currentState.phase, 'away_from_support', `${testCase.label}: current phase must not claim away-from-support without measured distance.`);
    assert.ok(['current_location_unresolved', 'stalled_after_response', 'at_support', 'responding_from_support', 'support_failed'].includes(narrative.currentState.phase), `${testCase.label}: current phase should stay neutral or unresolved.`);
    assert.notStrictEqual(story && story.key, 'extended_after_run', `${testCase.label}: dominant story must not select the extension branch.`);
  });

  const measurableButNotExtended = {
    ...baseContext,
    currentPrice:206.5,
    ma20:200,
    setupLocationState:'extended',
    pullbackZone:'extended'
  };
  const measurableNarrative = sandbox.chartGuruNarrativeContext(measurableButNotExtended);
  const measurableStory = selectPrimaryStory(measurableButNotExtended);
  assert.strictEqual(measurableNarrative.support.distanceMeasured, true, 'Measured-but-not-extended case: support distance should stay measurable.');
  assert.strictEqual(measurableNarrative.reboundExtended, false, 'Measured-but-not-extended case: sticky historical extended fields must not force reboundExtended.');
  assert.ok(!measurableNarrative.storyEvents.includes('rebound_extended'), 'Measured-but-not-extended case: storyEvents must not emit rebound_extended.');
  assert.notStrictEqual(measurableStory && measurableStory.key, 'extended_after_run', 'Measured-but-not-extended case: dominant story must not select the extension branch.');

  const thresholdContexts = [
    {
      label:'below threshold',
      expectedExtended:false,
      currentPrice:206.99
    },
    {
      label:'at threshold',
      expectedExtended:true,
      currentPrice:207
    },
    {
      label:'above threshold',
      expectedExtended:true,
      currentPrice:207.01
    }
  ];
  thresholdContexts.forEach(testCase => {
    const narrative = sandbox.chartGuruNarrativeContext({
      ...baseContext,
      currentPrice:testCase.currentPrice,
      ma20:200,
      setupLocationState:'extended',
      pullbackZone:'extended'
    });
    const story = selectPrimaryStory({
      ...baseContext,
      currentPrice:testCase.currentPrice,
      ma20:200,
      setupLocationState:'extended',
      pullbackZone:'extended'
    });
    assert.strictEqual(narrative.support.distanceMeasured, true, `${testCase.label}: support distance should be measurable.`);
    assert.strictEqual(narrative.reboundExtended, testCase.expectedExtended, `${testCase.label}: reboundExtended should respect the measurable extension threshold.`);
    assert.strictEqual(
      Array.isArray(narrative.storyEvents) && narrative.storyEvents.includes('rebound_extended'),
      testCase.expectedExtended,
      `${testCase.label}: storyEvents should only emit rebound_extended when measurable extension is present.`
    );
    assert.strictEqual(
      Boolean(story && story.key === 'extended_after_run'),
      testCase.expectedExtended,
      `${testCase.label}: dominant story should only select the extension branch when measurable extension is present.`
    );
  });

  const positiveMeasuredExtension = {
    ...baseContext,
    currentPrice:288.3,
    ma20:273.251,
    pullbackNear20:false,
    bounceAttempt:true,
    bounceState:'attempt',
    stabilisationState:'clear'
  };
  const positiveNarrative = sandbox.chartGuruNarrativeContext(positiveMeasuredExtension);
  const positiveStory = selectPrimaryStory(positiveMeasuredExtension);
  assert.strictEqual(positiveNarrative.support.distanceMeasured, true, 'Positive control: support distance should be measurable.');
  assert.strictEqual(positiveNarrative.reboundExtended, true, 'Positive control: measurable post-support extension should still classify as reboundExtended.');
  assert.strictEqual(positiveStory && positiveStory.key, 'extended_after_run', 'Positive control: measurable post-support extension should still select the extension story.');
}

function verifyExplicitSupportContextResolution(){
  const sandbox = buildStage15SelectorSandbox();
  const baseContext = {
    recentSequence:[],
    structureIntact:true,
    structureBroken:false,
    structureWeakening:false,
    latestDirection:'green',
    bodyDescriptor:'strong',
    bounceAttempt:true,
    bounceState:'attempt',
    stabilisationState:'clear',
    reclaimConfirmed:true,
    candleEvidenceUpClosesAfterLow:2,
    candleEvidenceReclaimedPriorDayHigh:true,
    candleEvidenceHigherLowHold:true,
    supportTestState:'held',
    buyerControlState:'emerging',
    recentlyLeftSupportZone:false,
    offLevelWithoutStructureDamage:false,
    extendedAfterRun:false,
    failedBounce:false,
    weakVolume:false,
    activeVolume:true
  };

  const explicit50Context = {
    ...baseContext,
    supportContext:'50ma',
    currentPrice:206,
    ma50:200
  };
  const explicit50Narrative = sandbox.chartGuruNarrativeContext(explicit50Context);
  assert.strictEqual(explicit50Narrative.support.level, '50ma_support', 'Explicit 50MA context must resolve the 50MA support level without legacy scan hints.');
  assert.strictEqual(explicit50Narrative.support.distanceMeasured, true, 'Explicit 50MA context must produce a measurable support distance when price and ma50 are present.');
  assert.ok(Number.isFinite(explicit50Narrative.support.distanceFromSupportPct), 'Explicit 50MA context must calculate a numeric support distance.');
  assert.strictEqual(sandbox.chartGuruResolvedSupportType(explicit50Context), '50ma', 'Explicit 50MA context must resolve recentSupportType through the canonical support resolver.');
  assert.strictEqual(sandbox.chartNarratorSupportLabel({recentSupportType:sandbox.chartGuruResolvedSupportType(explicit50Context)}), '50-day average', 'Narrator support label must name the 50-day average when explicit supportContext supplies it.');

  const explicit20Context = {
    ...baseContext,
    supportContext:'20ma',
    currentPrice:204,
    ma20:200
  };
  const explicit20Narrative = sandbox.chartGuruNarrativeContext(explicit20Context);
  assert.strictEqual(explicit20Narrative.support.level, '20ma_support', 'Explicit 20MA context must resolve the 20MA support level without legacy scan hints.');
  assert.strictEqual(explicit20Narrative.support.distanceMeasured, true, 'Explicit 20MA context must produce a measurable support distance when price and ma20 are present.');
  assert.strictEqual(sandbox.chartGuruResolvedSupportType(explicit20Context), '20ma', 'Explicit 20MA context must resolve recentSupportType through the canonical support resolver.');
  assert.strictEqual(sandbox.chartNarratorSupportLabel({recentSupportType:sandbox.chartGuruResolvedSupportType(explicit20Context)}), '20-day average', 'Narrator support label must name the 20-day average when explicit supportContext supplies it.');

  const explicitHeldResponse = sandbox.chartGuruNarrativeContext({
    ...baseContext,
    supportContext:'50ma',
    currentPrice:202,
    ma50:200,
    supportTestState:'held',
    bounceState:'improving',
    stabilisationState:'clear'
  });
  assert.strictEqual(explicitHeldResponse.currentState.phase, 'responding_from_support', 'Explicit support context plus a measurable response must no longer stay unresolved.');
  assert.strictEqual(explicitHeldResponse.support.semantic, 'support_present', 'Explicit support context plus a held test must preserve active support semantics.');

  const explicitMeasuredExtension = sandbox.chartGuruNarrativeContext({
    ...baseContext,
    supportContext:'50ma',
    currentPrice:207.2,
    ma50:200,
    recentlyLeftSupportZone:true,
    offLevelWithoutStructureDamage:true,
    supportTestState:'held'
  });
  assert.strictEqual(explicitMeasuredExtension.support.distanceMeasured, true, 'Explicit support context must still measure distance for extension checks.');
  assert.strictEqual(explicitMeasuredExtension.reboundExtended, true, 'Explicit support context must allow measurable extension when current distance clears the extension threshold.');
  assert.strictEqual(explicitMeasuredExtension.currentState.phase, 'extended_from_support', 'Explicit support context must expose the extended phase when the measured rebound is genuinely extended.');

  [
    {label:'missing 20MA', context:{...baseContext, supportContext:'20ma', currentPrice:204, ma20:null}},
    {label:'missing 50MA', context:{...baseContext, supportContext:'50ma', currentPrice:206, ma50:null}},
    {label:'missing current price', context:{...baseContext, supportContext:'20ma', currentPrice:null, ma20:200}}
  ].forEach(testCase => {
    const narrative = sandbox.chartGuruNarrativeContext(testCase.context);
    assert.strictEqual(narrative.support.distanceMeasured, false, `${testCase.label}: missing data must keep support distance unresolved.`);
    assert.strictEqual(narrative.reboundExtended, false, `${testCase.label}: missing data must not classify as an extended rebound.`);
    assert.notStrictEqual(narrative.currentState.phase, 'extended_from_support', `${testCase.label}: missing data must not promote the record into the extension phase.`);
  });

  const conflictingHintsNarrative = sandbox.chartGuruNarrativeContext({
    ...baseContext,
    supportContext:'50ma',
    pullbackNear20:true,
    currentPrice:206,
    ma20:198,
    ma50:200
  });
  assert.strictEqual(conflictingHintsNarrative.support.level, '50ma_support', 'Explicit supportContext must outrank conflicting legacy pullbackNear20 hints.');
  assert.ok(Math.abs(conflictingHintsNarrative.support.distanceFromSupportPct - 0.03) < 1e-9, 'Explicit supportContext must measure distance against the authoritative support level.');

  const unsupportedContextNarrative = sandbox.chartGuruNarrativeContext({
    ...baseContext,
    supportContext:'other_support',
    currentPrice:206,
    ma20:198,
    ma50:200
  });
  assert.strictEqual(unsupportedContextNarrative.support.distanceMeasured, false, 'Unsupported supportContext must not arbitrarily pick an MA for distance measurement.');

  const legacyCompatibilityNarrative = sandbox.chartGuruNarrativeContext({
    ...baseContext,
    currentPrice:204,
    ma20:200,
    pullbackNear20:true,
    evaluationScanType:'20MA'
  });
  assert.strictEqual(legacyCompatibilityNarrative.support.level, '20ma_support', 'Legacy support hints must continue to resolve the support level when supportContext is absent.');
  assert.strictEqual(legacyCompatibilityNarrative.support.distanceMeasured, true, 'Legacy support hints must continue to produce measurable support distance.');
}

function verifyUnknownSupportStateFallbacks(){
  const sandbox = buildEventPacketSandbox();
  const hooks = analyseSetupModule.__test;

  const reducedNearSupportPacket = sandbox.buildDeterministicEventPacketFromChartCoach({
    primaryStory:{
      key:'constructive_pullback_near_20ma',
      label:'Chart Story',
      icon:'ðŸ“ˆ',
      text:'Constructive pullback near 20MA',
      evidenceFactIds:['support_context'],
      confidence:0.8,
      rankReason:'test'
    },
    recentStory:{
      key:'constructive_pullback_near_20ma',
      supportLabel:'20-day average',
      steps:['support_test'],
      stepDetails:[{key:'support_test', evidenceFactIds:['support_context'], derivedFromSteps:['support_test'], derivedFromConditions:['support_present']}],
      evidenceFactIds:['support_context']
    },
    diagnostics:{}
  });
  assert.strictEqual(reducedNearSupportPacket.supportState, null, 'Reduced packets without narrative diagnostics must not emit a synthetic inactive supportState.');

  const normalizedReducedNearSupportPacket = hooks.normalizeDeterministicEventPacket(reducedNearSupportPacket);
  assert.strictEqual(normalizedReducedNearSupportPacket.supportState, null, 'Normalizer must preserve missing supportState as unknown rather than false.');
  assert.strictEqual(
    hooks.deterministicNearSupportContext(normalizedReducedNearSupportPacket, {setupStates:{pullbackZone:'near_20ma'}}),
    true,
    'Reduced legacy near-support packets must still use story and pullback fallbacks when support activity is unknown.'
  );

  const explicitInactiveSupportPacket = hooks.normalizeDeterministicEventPacket({
    primaryStoryKey:'constructive_pullback_near_20ma',
    dominantEventKey:'constructive_pullback_near_20ma',
    recentStoryKey:'constructive_pullback_near_20ma',
    supportState:{
      level:'20ma_support',
      currentlyActive:false
    }
  });
  assert.strictEqual(
    hooks.deterministicNearSupportContext(explicitInactiveSupportPacket, {setupStates:{pullbackZone:'near_20ma'}}),
    false,
    'Explicit inactive support must still override older near-support fallbacks.'
  );

  const unknownSupportActivityPacket = hooks.normalizeDeterministicEventPacket({
    primaryStoryKey:'constructive_pullback_near_50ma',
    dominantEventKey:'constructive_pullback_near_50ma',
    recentStoryKey:'constructive_pullback_near_50ma',
    supportState:{
      level:'50ma_support',
      currentlyActive:null
    }
  });
  assert.strictEqual(
    hooks.deterministicNearSupportContext(unknownSupportActivityPacket, {setupStates:{pullbackZone:'near_50ma'}}),
    true,
    'Unknown support activity must allow legacy near-support fallbacks to remain available.'
  );

  const noSupportEvidencePacket = hooks.normalizeDeterministicEventPacket({
    primaryStoryKey:'unknown_story_key',
    dominantEventKey:'unknown_story_key',
    recentStoryKey:'unknown_story_key'
  });
  assert.strictEqual(
    hooks.deterministicNearSupportContext(noSupportEvidencePacket, {setupStates:{pullbackZone:''}}),
    false,
    'Packets with no support evidence must remain unknown rather than being promoted to near support.'
  );
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
    const tutorValidation = hooks.validateFinalProseResponse(fixture.finalProse, [], packet, {
      ...normalizeFixturePayload(fixture),
      deterministicEventPacket:packet
    });

    assert.strictEqual(packet.primaryStoryKey, fixture.deterministicChartCoach.primaryStory.key, `${fixture.id}: deterministic evidence and event packet must agree on the dominant story key.`);
    assert.strictEqual(interpretation.dominantEvent, fixture.interpreterResponse.dominantEvent, `${fixture.id}: interpreter must preserve the intended dominantEvent.`);
    assert.strictEqual(chartCoach.primaryStory.key, packet.primaryStoryKey, `${fixture.id}: stored chartCoach must keep deterministic primary story authority.`);
    assert.strictEqual(chartCoach.recentStory.key, packet.recentStoryKey, `${fixture.id}: stored chartCoach must keep deterministic recent story authority.`);
    assert.strictEqual(chartCoach.recentStory.trendLabel, interpretation.dominantEvent, `${fixture.id}: tutor-mapped chartCoach must keep the interpreter dominantEvent as the visible recent story label.`);
    assert.strictEqual(chartCoach.recentStory.supportSemantic, interpretation.supportSemantic, `${fixture.id}: stored chartCoach debug must preserve supportSemantic.`);
    assert.strictEqual(chartCoach.recentStory.buyerResponseSemantic, interpretation.buyerResponseSemantic, `${fixture.id}: stored chartCoach debug must preserve buyerResponseSemantic.`);
    assert.strictEqual(chartCoach.recentStory.confirmationSemantic, interpretation.confirmationSemantic, `${fixture.id}: stored chartCoach debug must preserve confirmationSemantic.`);
    assert.strictEqual(mergedAnalysis.deterministicEventPacket.primaryStoryKey, packet.primaryStoryKey, `${fixture.id}: stored analysis must preserve deterministicEventPacket.`);
    assert.strictEqual(mergedAnalysis.traderInterpretation.dominantEvent, interpretation.dominantEvent, `${fixture.id}: stored analysis must preserve the interpreter dominantEvent.`);
    assert.deepStrictEqual(toPlainJson(mergedAnalysis.traderInterpretation.eventSequence), toPlainJson(interpretation.eventSequence), `${fixture.id}: stored analysis must preserve eventSequence.`);
    assert.strictEqual(diagnostics.dominantEvent, interpretation.dominantEvent, `${fixture.id}: diagnostics must expose dominantEvent.`);
    assert.deepStrictEqual(toPlainJson(diagnostics.eventSequence), toPlainJson(interpretation.eventSequence), `${fixture.id}: diagnostics must expose eventSequence.`);
    assert.strictEqual(diagnostics.supportSemantic, interpretation.supportSemantic, `${fixture.id}: diagnostics must expose supportSemantic.`);
    assert.strictEqual(diagnostics.buyerResponseSemantic, interpretation.buyerResponseSemantic, `${fixture.id}: diagnostics must expose buyerResponseSemantic.`);
    assert.strictEqual(diagnostics.confirmationSemantic, interpretation.confirmationSemantic, `${fixture.id}: diagnostics must expose confirmationSemantic.`);
    assert.strictEqual(diagnostics.traderInterpretation, interpretation.traderInterpretation, `${fixture.id}: diagnostics must expose traderInterpretation.`);
    assert.strictEqual(diagnostics.currentRisk, interpretation.currentRisk, `${fixture.id}: diagnostics must expose currentRisk.`);
    assert.strictEqual(diagnostics.nextSignal, interpretation.nextSignal, `${fixture.id}: diagnostics must expose nextSignal.`);
    assert.notStrictEqual(chartCoach.primaryStory.key, 'openai_two_step_primary_story', `${fixture.id}: chartCoach must not replace deterministic authority with an OpenAI-only primary story key.`);
    assert.notStrictEqual(chartCoach.recentStory.key, 'openai_two_step_narrative', `${fixture.id}: chartCoach must not replace deterministic recent story authority when deterministic keys exist.`);
    assert.strictEqual(tutorValidation.ok, true, `${fixture.id}: tutor prose should satisfy validation guards.`);

    if(fixture.setupStates.pullbackZone === 'near_20ma' && ['attempt', 'improving', 'rebound'].includes(fixture.setupStates.bounceState)){
      assert.notStrictEqual(packet.primaryStoryKey, 'off_level_wait_for_clearer_support', `${fixture.id}: near_20ma bounce attempt must not select an away-from-support dominant event.`);
      assert.deepStrictEqual(hooks.semanticContradictionsForEnvelope(interpretation.traderInterpretation, interpretation), [], `${fixture.id}: interpreter must not drift outside the near-support rebound envelope.`);
      assert.deepStrictEqual(hooks.semanticContradictionsForEnvelope(Object.values(fixture.finalProse).join(' '), interpretation), [], `${fixture.id}: tutor prose must not drift outside the near-support rebound envelope.`);
      assert.strictEqual(chartCoach.primaryStory.key, packet.primaryStoryKey, `${fixture.id}: dominant event must survive into stored chartCoach for near-support rebound cases.`);
      assert.strictEqual(mergedAnalysis.chartCoach.primaryStory.key, packet.primaryStoryKey, `${fixture.id}: dominant event must survive into stored analysis for near-support rebound cases.`);
    }
    if(fixture.id === 'UNP_event_first_early_rebound_20ma'){
      assert.strictEqual(packet.primaryStoryKey, 'early_rebound_from_20ma', 'UNP should classify as an early rebound from the 20MA.');
      assert.strictEqual(interpretation.dominantEvent, 'Early rebound from 20MA', 'UNP interpreter dominant event should stay anchored to the near-support rebound story.');
      assert.strictEqual(interpretation.supportSemantic, 'support_present', 'UNP should preserve support_present semantics.');
      assert.strictEqual(interpretation.buyerResponseSemantic, 'response_present', 'UNP should preserve response_present semantics.');
      assert.strictEqual(interpretation.confirmationSemantic, 'follow_through_unconfirmed', 'UNP should preserve follow-through-unconfirmed semantics.');
      assert.strictEqual(chartCoach.recentStory.trendLabel, 'Early rebound from 20MA', 'UNP tutor-mapped chartCoach should keep the rebound dominant event visible.');
    }
    if(fixture.id === 'MSFT_event_first_support_breakdown_stabilising'){
      const proseText = Object.values(fixture.finalProse).join(' ');
      assert.strictEqual(packet.primaryStoryKey, 'structure_breaking_down', 'MSFT should keep the structural-breakdown dominant event.');
      assert.strictEqual(interpretation.supportSemantic, 'support_failed', 'MSFT should preserve support_failed semantics.');
      assert.strictEqual(interpretation.buyerResponseSemantic, 'response_present', 'MSFT should preserve the stabilisation attempt as live context.');
      assert.strictEqual(interpretation.confirmationSemantic, 'follow_through_unconfirmed', 'MSFT should preserve that control has not been regained.');
      assert.ok(/stabili[sz]/i.test(proseText), 'MSFT narration should acknowledge the buyer response or stabilisation attempt.');
      assert.ok(/not regained control|still damaged|repair|rebuild/i.test(proseText), 'MSFT narration should state that the chart is not repaired yet.');
      assert.ok(!/healthy again|entry ready|constructive setup/i.test(proseText), 'MSFT narration must not imply that the damaged setup is actionable.');
      assert.ok(!/\bsellers (?:are|remain) (?:still )?in charge\b/i.test(proseText), 'MSFT narration must avoid an unqualified sellers-are-in-charge formulation when buyers are responding.');
    }

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
  assert.strictEqual(judgeSummaries.length, 10, 'Benchmark suite must evaluate all ten representative narration fixtures.');
}

async function run(){
  verifyFixtureCoverage();
  verifySemanticClassifierCoverage();
  verifyAppPayloadIncludesDeterministicEventPacket();
  verifyEventPacketContract();
  verifySemanticEnvelopeCompatibilityFallback();
  verifyEventPacketNarrativeSemanticAlignment();
  verifyStage15PostSupportReboundSelection();
  verifyNullDistanceExtensionGuards();
  verifyExplicitSupportContextResolution();
  verifyUnknownSupportStateFallbacks();
  verifyInterpreterContractAndTutorBoundary();
  await verifyAuthorityContract();
  verifyStoryContinuityAndBenchmarks();
  console.log('run-chart-guru-narration-contract-assertions: ok');
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
