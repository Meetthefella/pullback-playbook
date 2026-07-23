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

function extractConstAssignment(constName){
  const marker = `const ${constName} = `;
  const start = appSource.indexOf(marker);
  if(start === -1) throw new Error(`Unable to find const ${constName}`);
  const afterMarker = start + marker.length;
  let index = afterMarker;
  while(index < appSource.length && /\s/.test(appSource[index])) index += 1;
  if(appSource.startsWith('Object.freeze(', index)){
    index += 'Object.freeze('.length;
    while(index < appSource.length && /\s/.test(appSource[index])) index += 1;
  }
  const opener = appSource[index];
  if(opener !== '{' && opener !== '['){
    let inString = false;
    let quote = '';
    let previous = '';
    for(let i = index; i < appSource.length; i += 1){
      const char = appSource[i];
      if(inString){
        if(char === quote && previous !== '\\') inString = false;
        previous = char;
        continue;
      }
      if(char === '"' || char === '\'' || char === '`'){
        inString = true;
        quote = char;
        previous = char;
        continue;
      }
      if(char === ';'){
        return appSource.slice(start, i + 1);
      }
      previous = char;
    }
    throw new Error(`Unable to extract const ${constName}`);
  }
  const closer = opener === '{' ? '}' : ']';
  let depth = 1;
  let inString = false;
  let quote = '';
  let previous = '';
  for(let i = index + 1; i < appSource.length; i += 1){
    const char = appSource[i];
    if(inString){
      if(char === quote && previous !== '\\') inString = false;
      previous = char;
      continue;
    }
    if(char === '"' || char === '\'' || char === '`'){
      inString = true;
      quote = char;
      previous = char;
      continue;
    }
    if(char === opener) depth += 1;
    if(char === closer){
      depth -= 1;
      if(depth === 0){
        let end = i + 1;
        while(end < appSource.length && /\s/.test(appSource[end])) end += 1;
        if(appSource[end] === ')'){
          end += 1;
          while(end < appSource.length && /\s/.test(appSource[end])) end += 1;
        }
        if(appSource[end] === ';') end += 1;
        return appSource.slice(start, end);
      }
    }
    previous = char;
  }
  throw new Error(`Unable to extract const ${constName}`);
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
  const traderInterpretation = {
    dominantEvent:'Early rebound attempt below the short-term averages.',
    eventSequence:[
      'price pulled back under the 20-day and 50-day averages',
      'buyers started to defend the recent low',
      'price bounced, but follow-through is still unproven'
    ],
    traderInterpretation:'Buyers have started to respond after the pullback, but this is still an early repair attempt rather than a confirmed reversal.',
    currentRisk:'The rebound can still fail if price stalls and rolls back under the recent low before reclaiming nearby resistance.',
    nextSignal:'Watch for another constructive close that reclaims more of the pullback and starts proving buyer control.',
    supportSemantic:'support_unknown',
    buyerResponseSemantic:'response_present',
    confirmationSemantic:'follow_through_unconfirmed',
    whatChanged:'Buyers started to respond after the pullback, but the rebound still needs proof.',
    traderRead:'This is still an early repair attempt rather than a confirmed reversal.',
    riskToWatch:'If price cannot add follow-through and starts rolling back over, the pullback can stay weak.',
    nextUsefulSignal:'A firmer close that reclaims more of the pullback would matter more.'
  };
  const finalNarrative = {
    chartStory:'Buyers have started to bounce NVDA after the pullback, but price is still working underneath the 20MA and 50MA.',
    whyItMatters:'That matters because an early rebound can still fail if buyers cannot reclaim those nearer trend guides with follow-through.',
    setupLocation:'Price is rebounding between the short-term averages overhead and the longer-term 200MA underneath, so the chart is still in repair rather than fully reset.',
    learningPoint:'A one-day bounce is not enough on its own before trusting the rebound. Traders can reduce the risk by waiting for follow through that proves buyers are doing more than producing a brief lift.',
    whatNext:'Watch for firmer follow-through that reclaims more of the pullback and starts pushing back through the nearby averages.'
  };
  const canonicalNarrative = {
    chartStory:'The current location is not clear enough to frame a support story. More location evidence is needed.',
    whyItMatters:'This matters because the phase shows whether buyers have actually earned control.',
    setupLocation:'The relevant location is the current support context.',
    learningPoint:'The location matters, but the next price response is what confirms the story.',
    whatNext:'Watch for price to reach a clearer support area.'
  };

  const {handler, __test} = require(modulePath);
  const normalizedInterpretation = __test.normalizeTraderInterpretation(traderInterpretation, {});
  assert.ok(/early repair attempt/i.test(normalizedInterpretation.traderRead), 'Legacy trader-interpretation normalization remains directly covered without an outbound request');
  const invokeHandler = async (sequence, payloadOverrides = {}) => {
    const fetchCalls = [];
    global.fetch = async (url, options = {}) => {
      fetchCalls.push({url, options});
      const requestBody = JSON.parse(options.body || '{}');
      const step = sequence[Math.max(0, fetchCalls.length - 1)] || sequence[sequence.length - 1];
      if(typeof step === 'function'){
        return step({url, options, requestBody, callNumber:fetchCalls.length});
      }
      const safeStep = step || {};
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
          ticker:'NVDA',
          marketStatus:'S&P above 50 MA',
          trustedMarketContext,
          ...payloadOverrides
        },
        prompt:'Return JSON only.'
      })
    });
    return {response, fetchCalls, body:JSON.parse(response.body)};
  };

  const successRun = await invokeHandler([
    {payload:{output_text:JSON.stringify(aiPayload)}},
    {payload:{output_text:JSON.stringify(canonicalNarrative)}}
  ]);

  assert.strictEqual(successRun.fetchCalls.length, 2, 'Expected primary analysis followed by canonical final prose');
  assert.strictEqual(successRun.response.statusCode, 200, 'Handler should succeed');
  const firstRequest = JSON.parse(successRun.fetchCalls[0].options.body || '{}');
  const secondRequest = JSON.parse(successRun.fetchCalls[1].options.body || '{}');
  const body = successRun.body;
  assert.strictEqual(secondRequest.text && secondRequest.text.format && secondRequest.text.format.name, 'chart_guru_final_prose', 'Production Chart Guru should request canonical final prose after primary analysis');
  assert.ok(/Return extractedFromImage, trustedMarketContext, canonicalValues/i.test(String(firstRequest.instructions || '')), 'The canonical analysis request should remain intact');
  assert.ok(!/Return extractedFromImage, trustedMarketContext, canonicalValues/i.test(String(secondRequest.instructions || '')), 'Final prose request should not carry the full non-prose output contract');
  const finalPromptText = (((secondRequest.input || [])[0] || {}).content || []).find(part => part && part.type === 'input_text');
  assert.ok(finalPromptText && /"phase"\s*:\s*"(?:unknown|current_location_unresolved)"|clearer_support/.test(String(finalPromptText.text || '')), 'Final prose prompt should receive the canonical narration contract only');
  assert.strictEqual(body.analysis.canonicalValues.price, 200.09, 'Canonical price must come from trusted market context');
  assert.strictEqual(body.analysis.canonicalValues.ma20, 205.74, 'Canonical 20MA must come from trusted market context');
  assert.strictEqual(body.analysis.canonicalValues.ma50, 209.99, 'Canonical 50MA must come from trusted market context');
  assert.strictEqual(body.analysis.canonicalValues.ma200, 190.84, 'Canonical 200MA must come from trusted market context');
  assert.strictEqual(body.analysis.trustedMarketContext.currentPrice, 200.09, 'Trusted context should be preserved');
  assert.strictEqual(body.analysis.visible_ma20, null, 'Unreadable image MA should remain unreadable in extracted image facts');
  assert.strictEqual(
    body.analysis.coach_summary,
    canonicalNarrative.chartStory,
    'Summary should come from validated canonical narration prose'
  );
  assert.ok(body.analysis.chartGuruNarrative && /clearer support/i.test(body.analysis.chartGuruNarrative.whatNext || ''), 'Analysis should preserve the validated canonical narration payload');
  assert.strictEqual(body.analysis.chartCoach && body.analysis.chartCoach.source, 'openai_canonical_narration', 'Canonical narration success should populate a renderable Chart Guru model');
  assert.ok(Array.isArray(body.analysis.chartCoach && body.analysis.chartCoach.sections) && body.analysis.chartCoach.sections.some(section => section.key === 'setup_location'), 'Two-step success should populate the visible section model');
  assert.strictEqual(body.analysis.chartCoach && body.analysis.chartCoach.recentStory && body.analysis.chartCoach.recentStory.key, 'openai_two_step_narrative', 'Canonical narration should retain compatible recentStory metadata server-side');
  assert.ok(Array.isArray(body.analysis.chartCoach && body.analysis.chartCoach.diagnostics && body.analysis.chartCoach.diagnostics.priorityOrder), 'Two-step success should emit chartCoach diagnostics server-side');
  assert.strictEqual(body.analysis.chartGuruOpenAiFallbackReason, '', 'Successful two-step Chart Guru should not set a fallback reason');

  // HTTP-handler regression for the exact stale v1 payload observed in the
  // browser: phase and next event arrive unknown while the packet already proves
  // an early 20MA response. The final renderer prompt and returned diagnostics
  // must both use the repaired object.
  const respondingPacket = {
    dominantEventKey:'early_rebound_from_20ma',
    dominantEventLabel:'Early rebound from 20MA',
    currentPhase:'responding_from_support',
    supportSemantic:'support_present',
    supportState:{type:'20ma', label:'20-day average', interaction:'held', currentlyActive:true, semantic:'active_held_support'},
    buyerResponseState:'present', buyerControlState:'developing', followThroughState:'not_started',
    eventSequence:['support_held_at_20ma','buyers_responded'], evidenceFactIds:['support_held_at_20ma','buyers_responded']
  };
  const staleV1Contract = {
    version:'chart-guru-narration-contract-v1', phase:'unknown', dominantEvent:'early_rebound_from_20ma', eventSequence:[],
    structure:'intact', support:{type:'20ma', label:'20-day average', interaction:'held', currentlyActive:true, semantic:'active_held_support'},
    buyerResponse:'present', buyerControl:'developing', followThrough:'not_started', trend:'healthy', volume:'mixed', market:'supportive',
    dominantBlocker:'follow_through', nextRequiredEvent:'unknown', verdict:'watch', evidenceFactIds:[]
  };
  const respondingProse = {
    chartStory:'Buyers are responding from the 20-day average, but control is still developing.',
    whyItMatters:'The response is constructive, although it still needs follow-through.',
    setupLocation:'The relevant location is the current support context near the 20-day average.',
    learningPoint:'An initial response needs follow-through before it becomes reliable.',
    whatNext:'Watch for follow-through with another firm close.'
  };
  const repairedHttpRun = await invokeHandler([
    {payload:{output_text:JSON.stringify(aiPayload)}},
    {payload:{output_text:JSON.stringify(respondingProse)}}
  ], {deterministicEventPacket:respondingPacket, canonicalNarrationContract:staleV1Contract});
  const repairedPrompt = JSON.parse(repairedHttpRun.fetchCalls[1].options.body || '{}');
  const repairedPromptText = (((repairedPrompt.input || [])[0] || {}).content || []).find(part => part && part.type === 'input_text');
  assert.match(String(repairedPromptText && repairedPromptText.text || ''), /"phase"\s*:\s*"responding_from_support"/, 'HTTP renderer prompt must receive the repaired phase');
  assert.match(String(repairedPromptText && repairedPromptText.text || ''), /"nextRequiredEvent"\s*:\s*"follow_through"/, 'HTTP renderer prompt must receive the repaired next event');
  const repairedAnalysis = repairedHttpRun.body.analysis;
  const returnedDiagnostics = repairedHttpRun.body.diagnostics;
  const repairedDiagnostics = repairedAnalysis.chartCoach && repairedAnalysis.chartCoach.diagnostics && repairedAnalysis.chartCoach.diagnostics.narration;
  assert.strictEqual(repairedAnalysis.canonicalNarrationContract.phase, 'responding_from_support', 'HTTP response must persist the repaired phase');
  assert.notStrictEqual(repairedAnalysis.canonicalNarrationContract.nextRequiredEvent, 'unknown', 'HTTP response must persist a resolved next event');
  assert.strictEqual(repairedDiagnostics.validationStatus, 'passed', 'Repaired HTTP contract must validate before rendering');
  assert.deepStrictEqual(repairedDiagnostics.validationErrors, [], 'Repaired HTTP contract must have no validation codes');
  assert.strictEqual(repairedDiagnostics.retryCount, 0, 'Repaired HTTP narration must not retry');
  assert.strictEqual(repairedDiagnostics.pipelineTrace.phaseBeforeRepair, 'unknown', 'Diagnostics must retain the incoming phase snapshot');
  assert.strictEqual(repairedDiagnostics.pipelineTrace.phaseAfterRepair, 'responding_from_support', 'Diagnostics must retain the repaired phase snapshot');
  assert.strictEqual(repairedDiagnostics.pipelineTrace.rendererReceivesRepairedContract, true, 'Renderer must receive the final repaired contract object');
  assert.strictEqual(returnedDiagnostics.contractPhase, 'responding_from_support', 'HTTP response diagnostics must expose the final contract phase');
  assert.strictEqual(returnedDiagnostics.nextRequiredEvent, 'follow_through', 'HTTP response diagnostics must expose the final next event');
  assert.strictEqual(returnedDiagnostics.phaseRepair.after, returnedDiagnostics.contractPhase, 'HTTP response repair trace must agree with the displayed contract phase');
  assert.deepStrictEqual(returnedDiagnostics.canonicalNarrationContract, returnedDiagnostics.rendererContractSnapshot, 'HTTP response must serialise one final contract for diagnostics and renderer');

  const malformedResponseRun = await invokeHandler([
    {payload:{output_text:'{"broken": true'}}
  ]);
  const malformedResponse = malformedResponseRun.response;
  const malformedBody = malformedResponseRun.body;
  assert.strictEqual(malformedResponse.statusCode, 200, 'Malformed JSON with trusted market context should still return usable analysis');
  assert.ok(/malformed json/i.test(String(malformedBody.analysis.parseWarning || '')), 'Malformed JSON fallback should record a parse warning');
  const malformedSummary = String(malformedBody.analysis.candleStructureAnalysis && malformedBody.analysis.candleStructureAnalysis.summary || '');
  assert.ok(/below the 20MA/i.test(malformedSummary) && /below the 50MA/i.test(malformedSummary) && /above the 200MA/i.test(malformedSummary), 'Malformed JSON fallback should include deterministic candle summary with canonical MA relationships');
  assert.strictEqual(Array.isArray(malformedBody.analysis.chartCoach && malformedBody.analysis.chartCoach.sections) ? malformedBody.analysis.chartCoach.sections.length : -1, 0, 'Malformed JSON server fallback should not emit a legacy Chart Guru section list');
  assert.strictEqual(malformedBody.analysis.chartCoach && malformedBody.analysis.chartCoach.primaryStory, null, 'Malformed JSON server fallback should defer primary story selection to the shared deterministic builder');

  const finalFailureRun = await invokeHandler([
    {payload:{output_text:JSON.stringify(aiPayload)}},
    {ok:false, status:500, payload:{error:{message:'Final prose exploded'}}}
  ]);
  assert.strictEqual(finalFailureRun.response.statusCode, 200, 'Final-prose failure should degrade to deterministic 200');
  assert.strictEqual(finalFailureRun.body.analysis.chartCoach && finalFailureRun.body.analysis.chartCoach.source, 'deterministic_fallback', 'Final-prose failure should use deterministic fallback');

  const retryRun = await invokeHandler([
    {payload:{output_text:JSON.stringify(aiPayload)}},
    {payload:{output_text:JSON.stringify(finalNarrative)}},
    {payload:{output_text:JSON.stringify(canonicalNarrative)}}
  ]);
  assert.strictEqual(retryRun.fetchCalls.length, 3, 'Invalid canonical prose should receive one constrained retry');
  const retryRequest = JSON.parse(retryRun.fetchCalls[2].options.body || '{}');
  assert.strictEqual(retryRequest.text && retryRequest.text.format && retryRequest.text.format.name, 'chart_guru_final_prose_retry', 'Retry request should expose the canonical retry stage name');
  assert.strictEqual(retryRun.body.analysis.chartCoach && retryRun.body.analysis.chartCoach.source, 'openai_canonical_narration', 'A valid retry should restore canonical narration');
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
  const knownDeterministicFactIds = new Set([
    'trend_context',
    'structure_broken',
    'support_short_term_average',
      'support_medium_term_average',
      'buyer_response_state',
      'bounce_attempt',
    'lower_rejection_wick',
    'upper_rejection_wick',
    'resistance_rejection',
    'weakness_signal',
    'low_volume',
    'high_volume',
    'price_accelerating_higher',
    'price_accelerating_lower',
    'failed_bounce',
    'extended_above_support',
    'doji_or_small_body',
    'latest_green_candle',
    'latest_red_candle',
    'large_green_run',
    'large_red_run'
  ]);
  const assertStepDetailsUseKnownFacts = (coach, label) => {
    const details = Array.isArray(coach && coach.recentStory && coach.recentStory.stepDetails) ? coach.recentStory.stepDetails : [];
    details.forEach(detail => {
      const evidence = Array.isArray(detail && detail.evidenceFactIds) ? detail.evidenceFactIds : [];
      evidence.forEach(id => {
        assert.ok(knownDeterministicFactIds.has(id), `${label} should only use known deterministic fact ids, received ${id}`);
      });
    });
  };
  const assertDerivedSupportPresent = (coach, stepKey, label) => {
    const detail = Array.isArray(coach && coach.recentStory && coach.recentStory.stepDetails)
      ? coach.recentStory.stepDetails.find(entry => entry && entry.key === stepKey)
      : null;
    assert.ok(detail, `${label} should expose step detail for ${stepKey}`);
    assert.ok(
      (Array.isArray(detail.derivedFromSteps) && detail.derivedFromSteps.length > 0)
        || (Array.isArray(detail.derivedFromConditions) && detail.derivedFromConditions.length > 0),
      `${label} should expose derived support for ${stepKey}`
    );
  };
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
    normalizeVerdict(value){
      const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
      if(safe === 'nearentry') return 'near_entry';
      return ['entry','near_entry','watch','avoid'].includes(safe) ? safe : 'watch';
    },
    normalizeTickerRecord(record){
      return record && typeof record === 'object' ? record : {};
    },
    resolveGlobalVerdict(record){
      return record._globalVerdict || {final_verdict:'watch'};
    },
    resolveCanonicalPullbackState({record = {}, derivedStates = {}} = {}){
      return record && record._canonicalPullback ? record._canonicalPullback : {
        supportInteractionState:String(derivedStates.supportInteractionState || ''),
        supportContext:String(derivedStates.supportContext || ''),
        supportTestState:String(derivedStates.supportTestState || ''),
        buyerControlState:String(derivedStates.buyerControlState || '')
      };
    },
    analysisDerivedStatesFromRecord(record){
      if(record && record._derivedStates) return record._derivedStates;
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
  loadBrowserModule('js/chart-guru-phase-policy.js', sandbox);
  vm.runInContext(extractConstAssignment('APP_VERSION'), sandbox, {filename:'app.js#APP_VERSION'});
  vm.runInContext(extractConstAssignment('APP_BUILD_TIMESTAMP'), sandbox, {filename:'app.js#APP_BUILD_TIMESTAMP'});
  vm.runInContext(extractConstAssignment('CHART_GURU_RENDER_VERSION'), sandbox, {filename:'app.js#CHART_GURU_RENDER_VERSION'});
  vm.runInContext(extractConstAssignment('CHART_GURU_DETERMINISTIC_CONTRACT_VERSION'), sandbox, {filename:'app.js#CHART_GURU_DETERMINISTIC_CONTRACT_VERSION'});
  vm.runInContext(extractConstAssignment('CHART_GURU_INTERPRETATION_PROMPT_VERSION'), sandbox, {filename:'app.js#CHART_GURU_INTERPRETATION_PROMPT_VERSION'});
  vm.runInContext(extractConstAssignment('CHART_GURU_FINAL_PROMPT_VERSION'), sandbox, {filename:'app.js#CHART_GURU_FINAL_PROMPT_VERSION'});
  vm.runInContext(extractConstAssignment('CHART_GURU_EVENT_LABELS'), sandbox, {filename:'app.js#CHART_GURU_EVENT_LABELS'});
  vm.runInContext(extractConstAssignment('CHART_GURU_MOJIBAKE_REPAIRS'), sandbox, {filename:'app.js#CHART_GURU_MOJIBAKE_REPAIRS'});
  vm.runInContext(extractConstAssignment('CHART_GURU_SECTION_DISPLAY'), sandbox, {filename:'app.js#CHART_GURU_SECTION_DISPLAY'});
  [
    'repairChartGuruStoredText',
    'currentBuildVersion',
    'currentBuildAssetId',
    'currentChartGuruVersionInfo',
    'currentBuildInfo',
    'chartCoachPriorityForKey',
    'chartCoachProximityLabel',
    'finalizeChartCoachSections',
    'chartCoachDiagnosticsForSections',
    'mergeChartCoachSections',
    'chartCoachConfidenceSentence',
    'chartCoachBodyDescriptor',
    'chartCoachStructureSignals',
    'chartCoachPrimaryOpportunityScore',
    'chartCoachProximityLabel',
    'chartCoachRecentColorRun',
    'chartCoachLargeBodyRun',
    'chartGuruDominantEventLabel',
    'chartGuruBuyerResponsePresent',
    'chartGuruControlledPullbackPresent',
    'chartGuruVolumeParticipationLabel',
    'chartGuruRecentSupportType',
    'chartGuruResolvedSupportType',
    'chartGuruRecentSupportResponsePresent',
    'chartGuruSupportReferenceLevel',
    'chartGuruSupportDistancePct',
    'chartGuruSupportAuthority',
    'chartGuruExplicitResolverSupportContext',
    'chartGuruValidatedCanonicalPhase',
    'chartGuruSupportEpisodeFromHistory',
    'chartGuruPostSupportHigh',
    'buildCanonicalChartStoryContext',
    'chartGuruSemanticEnvelopeFromNarrativeContext',
    'chartGuruSemanticEnvelopeCompatibilityForStoryKey',
    'chartGuruNarrativeContext',
    'chartGuruSemanticEnvelopeFromStory',
    'chartGuruResolveSemanticEnvelopeValue',
    'eventPacketEvidenceIncludes',
    'buildDeterministicEventPacketFromChartCoach',
    'chartNarratorDeterministicPick',
    'chartNarratorSupportLabel',
    'chartNarratorTrendLabel',
    'chartNarratorBiasForStory',
    'chartNarratorToneModeForStorySteps',
    'chartNarratorConfidenceModeForStorySteps',
    'chartNarratorStepEvidenceFactIds',
    'chartNarratorStepDerivedSupport',
    'chartNarratorEvidenceForStorySteps',
    'chartNarratorHasStep',
    'chartNarratorRecentStoryForPrimaryStory',
    'chartNarratorStoryTextForPrimaryStory',
    'chartNarratorWhyItMattersForStory',
    'chartNarratorSupportSectionsForStory',
    'buildChartNarrator',
    'chartCoachLearningPointForStory',
    'chartCoachWhatNextForStory',
    'chartCoachPrimaryStoryCandidates',
    'buildDeterministicChartCoach',
    'chartCoachModelIsUsable',
    'describeCandleBodyDirection',
    'candleWickRejectionState',
    'isGenericAiCandleCommentary',
    'normalizeCandleSequenceOrder',
    'normalizeChartGuruSectionKey',
    'chartGuruSectionDisplayForKey',
    'aiCandleCommentaryContradictsCanonical',
    'isGenericTradePlanCommentary',
    'canonicalVolumeParticipationForState',
    'buildCanonicalStoryContextForRecord',
    'canonicalReviewTechnicalStructureLabelFromStoryContext',
    'canonicalReviewTechnicalPullbackLabelFromStoryContext',
    'canonicalReviewTechnicalBuyerLabelFromStoryContext',
    'canonicalScanTechnicalSummaryFromStoryContext',
    'canonicalBuyerStatesFromStoryContext',
    'canonicalDecisionSummaryFromStoryContext',
    'canonicalNonChartBlockerSummary',
    'buildDecisionSummary',
    'canonicalCandleContext',
    'buildDeterministicReviewProse',
    'deterministicCandleStructureSummary',
    'sanitizeChartCoachForDisplay',
    'chartGuruNarrationSourceLabel',
    'chartGuruChartCoachFreshness',
    'chartGuruNarrationSourceForAnalysis',
    'selectReviewAiSummary',
    'finalDisplayedAnalysisChartRead',
    'buildFixedPlanHistoricalReplay'
  ].forEach(name => {
    vm.runInContext(extractFunctionSource(appSource, name), sandbox, {filename:`app.js#${name}`});
  });

  const supportContextAt = ({type, price, supportTestState = 'not_tested', structureBroken = false, failedBounce = false, ma20 = 120, ma50 = 120}) => sandbox.buildCanonicalChartStoryContext({
    currentPrice:price,
    ma20:type === '20ma' ? 100 : ma20,
    ma50:type === '50ma' ? 100 : ma50,
    supportContext:type,
    supportTestState,
    structureIntact:!structureBroken,
    structureBroken,
    failedBounce,
    buyerControlState:'none'
  });
  [
    {label:'20MA exact-band', type:'20ma', price:101.4, active:true},
    {label:'20MA wider active band', type:'20ma', price:102.0, active:true},
    {label:'20MA threshold interior', type:'20ma', price:102.49, active:true},
    {label:'20MA threshold exterior', type:'20ma', price:102.51, active:false},
    {label:'50MA threshold interior', type:'50ma', price:102.99, active:true},
    {label:'50MA threshold exterior', type:'50ma', price:103.01, active:false}
  ].forEach(({label, type, price, active}) => {
    const story = supportContextAt({type, price});
    assert.strictEqual(story.support.currentlyActive, active, `${label}: active-support authority must use the shared MA-distance threshold.`);
    assert.strictEqual(story.support.interaction, active ? 'testing' : 'not_tested', `${label}: support interaction must consume the active-support authority, not just the narrower proximity hint.`);
    assert.strictEqual(story.currentPhase, active ? 'at_support' : 'away_from_support', `${label}: canonical phase must agree with support interaction.`);
    assert.ok(!(story.support.currentlyActive && story.support.interaction === 'away_from_support'), `${label}: debug state must never call active support away from support.`);
  });
  const failedNearSupport = supportContextAt({type:'20ma', price:101.4, supportTestState:'failed'});
  assert.strictEqual(failedNearSupport.support.interaction, 'failed', 'Failed support must override measured proximity.');
  assert.strictEqual(failedNearSupport.currentPhase, 'support_failed', 'Failed support must override an otherwise active support band.');
  const brokenNearSupport = supportContextAt({type:'50ma', price:101.4, structureBroken:true});
  assert.strictEqual(brokenNearSupport.support.interaction, 'failed', 'Broken structure must override measured proximity.');
  assert.strictEqual(brokenNearSupport.currentPhase, 'support_failed', 'Broken structure must retain the failed-support phase.');
  const active50WithNear20 = supportContextAt({type:'50ma', price:102, ma20:102});
  assert.strictEqual(active50WithNear20.support.type, '50ma', 'An unrelated 20MA proximity must not replace an active 50MA context.');
  assert.strictEqual(active50WithNear20.support.referenceLevel, 100, 'The active 50MA context must retain its own support reference.');
  const active20WithNear50 = supportContextAt({type:'20ma', price:102, ma50:102});
  assert.strictEqual(active20WithNear50.support.type, '20ma', 'An unrelated 50MA proximity must not replace an active 20MA context.');
  assert.strictEqual(active20WithNear50.support.referenceLevel, 100, 'The active 20MA context must retain its own support reference.');

  const episodeFrom = historySequence => sandbox.chartGuruSupportEpisodeFromHistory({supportContext:'20ma', historySequence}, 100);
  const candle = (date, close, high = close, low = close) => ({date, open:close, high, low, close, ma20:100});
  const immediateResponse = episodeFrom([
    candle('2026-01-01', 100, 100.5, 99.8),
    candle('2026-01-02', 105, 106, 104.8),
    candle('2026-01-03', 107, 108, 106.5)
  ]);
  assert.ok(immediateResponse.supportEvent, 'Two consecutive qualifying candles must establish a support episode.');
  assert.strictEqual(immediateResponse.latestEpisode.responseDetected, true, 'Two consecutive qualifying candles immediately after support must validate a response.');
  const fixedPlanReplay = sandbox.buildFixedPlanHistoricalReplay({
    plan:{stop:264.2, firstTarget:283.23},
    marketData:{history:[
      {date:'2025-07-16', close:180},
      {date:'2026-07-22', close:280.7},
      {date:'2026-07-21', close:279},
      {date:'2026-07-20', close:271.98},
      {date:'2026-07-16', close:271.19}
    ]}
  }, {supportEpisodeStartDate:'2026-07-15'});
  assert.strictEqual(fixedPlanReplay.historicalReplayMode, 'fixed_plan_reconstruction', 'Historical R:R output must declare its fixed-plan replay mode.');
  assert.strictEqual(fixedPlanReplay.historicalReplayAuthoritative, false, 'Historical R:R replay must never claim persisted resolver authority.');
  assert.strictEqual(fixedPlanReplay.targetMayContainLookahead, true, 'A current resistance target must be marked as possible future-information lookahead.');
  assert.strictEqual(fixedPlanReplay.historicalReplayScope, 'selected_support_episode_forward', 'Replay must exclude unrelated history before the selected support episode.');
  assert.strictEqual(fixedPlanReplay.reconstructedPriceabilityTimeline.some(bar => bar.date === '2025-07-16'), false, 'Replay must not combine an older unrelated history window with the selected support episode.');
  assert.strictEqual(fixedPlanReplay.reconstructedFirstThresholdPassDate, '2026-07-16', 'Fixed-plan replay should identify the first chronological close that clears 1.5R.');
  assert.strictEqual(fixedPlanReplay.fixedPlanEverReachedNearEntryRR, true, 'Fixed-plan replay should report a historical 1.5R pass when one exists.');
  assert.strictEqual(fixedPlanReplay.fixedPlanEverReachedEntryRR, false, 'Fixed-plan replay should not invent a 2R pass.');
  assert.strictEqual(fixedPlanReplay.reconstructedPriceabilityTimeline[0].nonPriceabilityGateReplay.buyerControl.authority, 'unavailable_not_persisted', 'Unavailable historical buyer control must remain explicitly unavailable.');
  assert.strictEqual(fixedPlanReplay.reconstructedPriceabilityTimeline[0].nonPriceabilityGateReplay.stop.authority, 'fixed_current_plan_assumption', 'Replay stop provenance must remain explicit.');
  const replayWithoutEpisodeBoundary = sandbox.buildFixedPlanHistoricalReplay({
    plan:{stop:264.2, firstTarget:283.23},
    marketData:{history:Array.from({length:400}, (_, index) => ({date:`2025-01-${String((index % 28) + 1).padStart(2, '0')}`, close:270}))}
  });
  assert.strictEqual(replayWithoutEpisodeBoundary.historicalReplayScope, 'unavailable_no_selected_support_episode', 'Missing canonical episode boundaries must not fall back to a huge all-history replay.');
  assert.strictEqual(replayWithoutEpisodeBoundary.reconstructedPriceabilityTimeline.length, 0, 'Missing canonical episode boundaries must keep the diagnostics bundle compact and copyable.');
  const immediateResponseStory = sandbox.buildCanonicalChartStoryContext({
    currentPrice:102, ma20:100, supportContext:'20ma', supportTestState:'not_tested', structureIntact:true,
    historySequence:[
      candle('2026-01-01', 100, 100.5, 99.8),
      candle('2026-01-02', 105, 106, 104.8),
      candle('2026-01-03', 107, 108, 106.5)
    ]
  });
  assert.strictEqual(immediateResponseStory.diagnostics.phaseDecision.supportEpisodeEstablished, true, 'A valid consecutive response must establish episode authority.');
  assert.strictEqual(immediateResponseStory.diagnostics.phaseDecision.postSupportHighSource, 'validated_support_episode', 'A valid response must anchor its post-support high to the episode.');
  assert.strictEqual(immediateResponseStory.diagnostics.phaseDecision.anchoredPostSupportHigh, 108, 'Episode-derived high authority must use the response episode high.');
  assert.strictEqual(immediateResponseStory.diagnostics.phaseDecision.retracementAvailable, true, 'A validated episode high above support must make retracement measurable.');
  assert.strictEqual(immediateResponseStory.currentPhase, 'responding_from_support', 'A valid response inside active support must project a coherent canonical phase.');
  const multiContactResponse = episodeFrom([
    candle('2026-01-10', 100, 100.5, 99.8),
    candle('2026-01-11', 100.6, 101, 99.9),
    candle('2026-01-12', 105, 106, 104.8),
    candle('2026-01-13', 107, 108, 106.5)
  ]);
  assert.strictEqual(multiContactResponse.supportEvent.timestamp, '2026-01-10', 'The oldest candle must remain the selected support-event origin.');
  assert.strictEqual(multiContactResponse.contactStartIndex, 2, 'The newest contact must define the response boundary in newest-first history.');
  assert.strictEqual(multiContactResponse.contactEndIndex, 3, 'The oldest contact must remain the end of the newest-first contact range.');
  assert.strictEqual(multiContactResponse.responseWindowStartIndex, 1, 'Response evaluation must begin immediately after the complete contact episode.');
  assert.deepStrictEqual(Array.from(multiContactResponse.qualifyingResponseIndexes), [1, 0], 'Only the true post-episode consecutive response candles may be counted.');
  assert.strictEqual(multiContactResponse.latestEpisode.responseDetected, true, 'A multi-candle support test followed by two consecutive responses must validate.');
  const oneResponse = episodeFrom([
    candle('2026-01-01', 100, 100.5, 99.8),
    candle('2026-01-02', 105, 106, 104.8)
  ]);
  assert.strictEqual(oneResponse.supportEvent, null, 'One qualifying post-support candle must not validate a response episode.');
  const multiContactOneResponse = episodeFrom([
    candle('2026-01-20', 100, 100.5, 99.8),
    candle('2026-01-21', 100.6, 101, 99.9),
    candle('2026-01-22', 105, 106, 104.8)
  ]);
  assert.strictEqual(multiContactOneResponse.supportEvent, null, 'A multi-candle support test with one response candle must remain unvalidated.');
  assert.strictEqual(multiContactOneResponse.latestEpisode.responseCandleCount, 1, 'Only the post-episode response candle may be counted.');
  const interruptedResponse = episodeFrom([
    candle('2026-02-01', 100, 100.5, 99.8),
    candle('2026-02-02', 105, 106, 104.8),
    candle('2026-02-03', 94, 95, 93),
    candle('2026-02-04', 105, 106, 104.8),
    candle('2026-02-05', 107, 108, 106.5)
  ]);
  assert.strictEqual(interruptedResponse.supportEvent, null, 'A non-qualifying interruption must break the response sequence.');
  const multiContactInterruptedResponse = episodeFrom([
    candle('2026-02-10', 100, 100.5, 99.8),
    candle('2026-02-11', 100.6, 101, 99.9),
    candle('2026-02-12', 105, 106, 104.8),
    candle('2026-02-13', 94, 95, 93),
    candle('2026-02-14', 107, 108, 106.5)
  ]);
  assert.strictEqual(multiContactInterruptedResponse.supportEvent, null, 'A non-qualifying post-episode candle must interrupt a multi-candle support response.');
  assert.strictEqual(multiContactInterruptedResponse.latestEpisode.responseCandleCount, 1, 'Separated qualifying candles must not be combined after a multi-candle test.');
  const contactAfterEpisode = episodeFrom([
    candle('2026-02-20', 100, 100.5, 99.8),
    candle('2026-02-21', 100.6, 101, 99.9),
    candle('2026-02-22', 105, 106, 104.8),
    candle('2026-02-23', 100.4, 100.8, 99.8),
    candle('2026-02-24', 107, 108, 106.5)
  ]);
  assert.strictEqual(contactAfterEpisode.supportEvent, null, 'A new contact after the completed episode must interrupt the original response run.');
  assert.strictEqual(contactAfterEpisode.latestEpisode.responseDetected, false, 'Only contacts inside the selected episode are skipped; later contacts remain interruptions.');
  const laterRally = episodeFrom([
    candle('2026-03-01', 100, 100.5, 99.8),
    candle('2026-03-02', 94, 95, 93),
    candle('2026-03-10', 105, 106, 104.8),
    candle('2026-03-11', 107, 108, 106.5)
  ]);
  assert.strictEqual(laterRally.supportEvent, null, 'A later unrelated rally must not validate an old support contact.');
  const newerResponse = episodeFrom([
    candle('2026-04-01', 100, 100.5, 99.8),
    candle('2026-04-02', 105, 106, 104.8),
    candle('2026-04-03', 94, 95, 93),
    candle('2026-04-10', 100, 100.5, 99.8),
    candle('2026-04-11', 100.6, 101, 99.9),
    candle('2026-04-12', 105, 106, 104.8),
    candle('2026-04-13', 107, 109, 106.5)
  ]);
  assert.strictEqual(newerResponse.supportEvent.timestamp, '2026-04-10', 'A newer valid consecutive rebound must become the selected support episode.');
  assert.strictEqual(newerResponse.latestEpisode.responseDetected, true, 'The newer multi-candle contact episode must validate from its own consecutive response.');
  const noResponseStory = sandbox.buildCanonicalChartStoryContext({
    currentPrice:102.6, ma20:100, supportContext:'20ma', supportTestState:'not_tested', structureIntact:true,
    historySequence:[candle('2026-05-01', 100, 100.5, 99.8), candle('2026-05-02', 105, 106, 104.8)]
  });
  assert.strictEqual(noResponseStory.diagnostics.phaseDecision.postSupportHighSource, 'unavailable', 'No ordered rebound must leave post-support-high authority unavailable.');
  assert.strictEqual(noResponseStory.diagnostics.phaseDecision.retracementAvailable, false, 'No ordered rebound must leave retracement unavailable.');
  assert.strictEqual(noResponseStory.diagnostics.phaseDecision.retracementPhaseOverrideApplied, false, 'No ordered rebound must not trigger a retracement phase override.');
  const explicitHighStory = sandbox.buildCanonicalChartStoryContext({
    currentPrice:102.6, ma20:100, supportContext:'20ma', supportTestState:'not_tested', structureIntact:true,
    historySequence:[candle('2026-05-01', 100, 100.5, 99.8)], postSupportHigh:110
  });
  assert.strictEqual(explicitHighStory.diagnostics.phaseDecision.postSupportHighSource, 'explicit_post_support_high', 'Trusted explicit post-support highs must remain independent authority.');
  assert.strictEqual(explicitHighStory.diagnostics.phaseDecision.anchoredPostSupportHigh, 110, 'Trusted explicit post-support highs must remain available without a historical response episode.');

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

  const resolvedOffLevelFallback = sandbox.deterministicCandleStructureSummary(
    bounceRecord,
    bounceAnalysis,
    {
      globalVerdict:{final_verdict:'watch'},
      derivedStates:{
        structureState:'strong',
        setupLocationState:'extended',
        pullbackZone:'extended',
        supportContext:'none',
        supportTestState:'not_tested',
        buyerControlState:'none',
        bounceState:'attempt',
        stabilisationState:'none',
        volumeState:'supportive'
      }
    }
  );
  const resolvedOffLevelReviewText = String(
    resolvedOffLevelFallback.reviewProse && (
      resolvedOffLevelFallback.reviewProse.text
      || resolvedOffLevelFallback.reviewProse.chartRead
    ) || ''
  );
  assert.ok(/no longer an active support test|extended away from that area|away from support/i.test(resolvedOffLevelReviewText), 'Deterministic Review prose must respect resolved away-from-support overrides instead of reverting to a near-support read.');
  const resolvedOffLevelDecisionSummary = sandbox.canonicalDecisionSummaryFromStoryContext({
    finalVerdict:'watch',
    storyContext:{
      currentPhase:'away_from_support',
      buyerControl:{state:'none'}
    },
    fallbackSummary:'Watch - waiting for confirmation.'
  });
  assert.strictEqual(resolvedOffLevelDecisionSummary, 'Watch - trend remains constructive, but price is currently away from support.', 'Shared canonical decision summary must expose away-from-support caution for resolved off-level watch states.');
  assert.ok(!/waiting for confirmation|almost ready/i.test(String(resolvedOffLevelDecisionSummary || '')), 'Shared canonical decision summary must not fall back to generic readiness copy for away-from-support states.');

  const resolvedFailedSupportFallback = sandbox.deterministicCandleStructureSummary(
    bounceRecord,
    bounceAnalysis,
    {
      globalVerdict:{final_verdict:'watch'},
      derivedStates:{
        structureState:'weakening',
        setupLocationState:'near_20ma',
        pullbackZone:'near_20ma',
        supportContext:'failed',
        supportTestState:'failed',
        buyerControlState:'none',
        bounceState:'none',
        stabilisationState:'none',
        volumeState:'weak'
      }
    }
  );
  const resolvedFailedSupportReviewText = String(
    resolvedFailedSupportFallback.reviewProse && (
      resolvedFailedSupportFallback.reviewProse.text
      || resolvedFailedSupportFallback.reviewProse.chartRead
    ) || ''
  );
  assert.ok(/support has failed|repair mode/i.test(resolvedFailedSupportReviewText), 'Deterministic Review prose must keep resolved failed-support semantics.');

  const resolvedBuyerControlFallback = sandbox.deterministicCandleStructureSummary(
    bounceRecord,
    bounceAnalysis,
    {
      globalVerdict:{final_verdict:'near_entry'},
      derivedStates:{
        structureState:'strong',
        setupLocationState:'near_20ma',
        pullbackZone:'near_20ma',
        supportContext:'active',
        supportTestState:'held',
        buyerControlState:'confirmed',
        bounceState:'confirmed',
        stabilisationState:'clear',
        volumeState:'supportive'
      }
    }
  );
  const resolvedBuyerControlReviewText = String(
    resolvedBuyerControlFallback.reviewProse && (
      resolvedBuyerControlFallback.reviewProse.text
      || resolvedBuyerControlFallback.reviewProse.chartRead
    ) || ''
  );
  assert.ok(/started to confirm the rebound|does not create an entry trigger/i.test(resolvedBuyerControlReviewText), 'Deterministic Review prose must follow resolved buyer-control overrides.');

  const finalRead = sandbox.finalDisplayedAnalysisChartRead(bounceRecord, bounceAnalysis);
  assert.strictEqual(finalRead.usedDeterministicFallback, true, 'Generic AI output should be replaced by deterministic fallback');
  assert.ok(/🎯 What next\?:/i.test(finalRead.text), 'Fallback should include a What next section');
  assert.strictEqual(finalRead.selectedSummarySource, 'deterministic_chart_coach', 'Fallback should use deterministic Chart Coach');
  assert.ok(finalRead.chartCoach && Array.isArray(finalRead.chartCoach.sections) && finalRead.chartCoach.sections.length >= 2, 'Fallback should expose structured Chart Coach sections');
  assert.ok(finalRead.chartCoach.diagnostics && Array.isArray(finalRead.chartCoach.diagnostics.sectionConfidence), 'Chart Coach should expose section confidence diagnostics');
  assert.ok(finalRead.chartCoach.diagnostics && finalRead.chartCoach.diagnostics.storyContract, 'Chart Coach diagnostics should expose the story contract');
  assert.strictEqual((finalRead.chartCoach.diagnostics.storyContract.steps || []).join('|'), (finalRead.chartCoach.recentStory.steps || []).join('|'), 'Chart Coach diagnostics should expose the same story steps used by the rendered model');
  assert.strictEqual(finalRead.chartCoach.diagnostics.storyContract.toneMode, finalRead.chartCoach.recentStory.toneMode, 'Chart Coach diagnostics should expose the same tone mode used by the rendered model');
  assert.strictEqual(finalRead.chartCoach.diagnostics.storyContract.confidenceMode, finalRead.chartCoach.recentStory.confidenceMode, 'Chart Coach diagnostics should expose the same confidence mode used by the rendered model');

  const shortSpecificRead = sandbox.finalDisplayedAnalysisChartRead(
    bounceRecord,
    {
      ...bounceAnalysis,
      plain_english_chart_read:'Below 20/50, above 200; follow-through still missing.'
    }
  );
  assert.strictEqual(shortSpecificRead.usedDeterministicFallback, true, 'Chart Coach should stay deterministic even when short AI prose exists');
  assert.ok(/Chart Story:/i.test(shortSpecificRead.text), 'Deterministic Chart Guru should render a Chart Story first');

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
        renderVersion:'chart-guru-v3',
        explanationFacts:['parse_fallback'],
        diagnostics:{
          meta:{
            deterministicContractVersion:'chart-guru-contract-v3',
            interpretationPromptVersion:'chart-guru-interpretation-v2',
            finalPromptVersion:'chart-guru-final-v2',
            renderVersion:'chart-guru-v3',
            narrationSource:'validation_fallback'
          }
        }
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
  assert.ok(/Chart Story:/i.test(structuredBeatsLegacy.text), 'Structured Chart Guru should render in Review');

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

  const extendedReviewRecord = {
    marketData:{price:288.3, ma20:273.251, ma50:269.7692, ma200:250},
    _globalVerdict:{
      final_verdict:'watch',
      structure_state:'strong',
      structure_eligibility:'alive',
      support_context:'20ma',
      support_test_state:'held',
      buyer_control_state:'confirmed',
      bounce_state:'confirmed',
      stabilisation_state:'clear',
      pullback_zone:'off_level',
      setup_location_state:'off_level'
    },
    _derivedStates:{
      structureState:'strong',
      structureEligibility:'alive',
      setupLocationState:'off_level',
      pullbackZone:'off_level',
      priceabilityState:'provisional',
      bounceState:'confirmed',
      stabilisationState:'clear',
      volumeState:'constructive',
      supportContext:'20ma',
      supportTestState:'held',
      buyerControlState:'confirmed',
      evaluationScanType:'20MA',
      candleEvidenceUpClosesAfterLow:2,
      candleEvidenceReclaimedPriorDayHigh:true,
      candleEvidenceHigherLowHold:true,
      candleEvidenceReclaimRangeMeaningful:true
    }
  };
  const extendedReviewAnalysis = {
    canonicalValues:{price:288.3, ma20:273.251, ma50:269.7692, ma200:250, volume:1500000},
    trustedMarketContext:{
      avgVolume30d:1400000,
      recentCandleSequence:[
        {date:'2026-07-03', open:285.2, high:289.0, low:284.8, close:288.3, volume:1500000},
        {date:'2026-07-02', open:281.4, high:285.1, low:280.7, close:284.4, volume:1450000},
        {date:'2026-07-01', open:278.1, high:281.8, low:277.6, close:281.0, volume:1380000}
      ]
    }
  };
  const extendedReviewRead = sandbox.finalDisplayedAnalysisChartRead(extendedReviewRecord, extendedReviewAnalysis);
  assert.strictEqual(extendedReviewRead.usedDeterministicFallback, true, 'Extended rebound review case should still use deterministic Review prose.');
  assert.strictEqual(String(extendedReviewRead.chartCoach && extendedReviewRead.chartCoach.storyContext && extendedReviewRead.chartCoach.storyContext.currentPhase || ''), 'extended_from_support', 'Extended rebound review case must preserve the canonical extended phase.');
  assert.ok(/well beyond|extended away|no longer an active support test|moved well beyond/i.test(extendedReviewRead.text), 'Review prose must describe the post-support extension state.');
  assert.ok(!/Support is reacting|Buyers emerging|buyer control is not convincing yet/i.test(extendedReviewRead.text), 'Review prose must not fall back to stale active-support wording once the rebound is extended.');
  assert.strictEqual(extendedReviewRead.selectedSummarySource, 'deterministic_chart_coach', 'Fresh deterministic fallback should keep the generated deterministic source.');

  // FROG regression: a previous 50MA rebound may remain in chronology, but a
  // substantial retracement must not leave the current canonical phase extended.
  // This input is deliberately oldest-first. The production normalizer must make
  // that direction explicit and anchor the original 50MA touch, not the later
  // retracement back inside the same tolerance.
  const frogSupportEpisodeHistory = [
    {date:'2026-07-15', open:82.0, high:82.4, low:80.9, close:81.7, volume:1250000},
    {date:'2026-07-16', open:82.1, high:87.5, low:81.8, close:86.4, volume:1300000},
    {date:'2026-07-17', open:86.8, high:94.0, low:85.9, close:92.8, volume:1350000},
    {date:'2026-07-18', open:93.2, high:98.9, low:91.6, close:97.1, volume:1400000},
    {date:'2026-07-19', open:91.6, high:90.3, low:82.9, close:84.5, volume:1100000},
    {date:'2026-07-20', open:85.0, high:87.0, low:84.0, close:86.56, volume:1000000}
  ].map(candle => ({...candle, ma50:81.62}));
  const frogSupportEpisode = sandbox.chartGuruSupportEpisodeFromHistory({supportContext:'50ma', historySequence:frogSupportEpisodeHistory}, 81.62);
  assert.strictEqual(frogSupportEpisode.historyOrdering, 'newest_first', 'Support-episode selection must normalize production history direction explicitly.');
  assert.strictEqual(frogSupportEpisode.supportEvent.timestamp, '2026-07-15', 'The original 50MA touch, rather than the later revisit, must anchor the rebound episode.');
  assert.strictEqual(frogSupportEpisode.postSupportHigh.timestamp, '2026-07-18', 'The rally high after the original support event must remain in the measured window.');
  assert.strictEqual(frogSupportEpisode.postSupportHigh.value, 98.9, 'Post-support extension must use the actual rally high.');
  assert.strictEqual(frogSupportEpisode.laterRevisits.length, 1, 'The later 50MA revisit must be recorded and rejected instead of replacing the rebound origin.');
  assert.ok(/rejected/.test(frogSupportEpisode.laterRevisits[0].reason), 'A single-candle post-revisit bounce must not be treated as a new support response.');
  assert.strictEqual(sandbox.chartGuruSupportEpisodeFromHistory({supportContext:'50ma', historySequence:[]}, 81.62), null, 'Missing history must fail conservatively without inventing a support episode.');
  const frogRetracedRecord = {
    marketData:{price:86.56, ma20:89.39, ma50:81.62, ma200:59.51, history:frogSupportEpisodeHistory},
    _globalVerdict:{
      final_verdict:'watch',
      structure_state:'strong',
      structure_eligibility:'alive',
      support_context:'50ma',
      support_test_state:'held',
      buyer_control_state:'emerging',
      bounce_state:'developing',
      stabilisation_state:'present',
      pullback_zone:'extended',
      setup_location_state:'extended',
      current_phase:'extended_from_support'
    },
    _derivedStates:{
      structureState:'strong',
      structureEligibility:'alive',
      setupLocationState:'extended',
      pullbackZone:'extended',
      bounceState:'developing',
      stabilisationState:'present',
      volumeState:'weak',
      supportContext:'50ma',
      supportTestState:'held',
      buyerControlState:'emerging',
      evaluationScanType:'50MA'
    }
  };
  const frogRetracedAnalysis = {
    canonicalValues:{price:86.56, ma20:89.39, ma50:81.62, ma200:59.51, volume:1000000},
    trustedMarketContext:{
      avgVolume30d:1400000,
      recentCandleSequence:[
        {date:'2026-07-21', open:85.0, high:87.0, low:84.0, close:86.56, volume:1000000},
        {date:'2026-07-20', open:83.4, high:90.3, low:82.9, close:85.5, volume:900000},
        {date:'2026-07-19', open:91.6, high:93.1, low:86.4, close:88.0, volume:1100000},
        {date:'2026-07-18', open:96.4, high:98.9, low:92.5, close:93.2, volume:1150000}
      ]
    }
  };
  const frogRetracedStory = sandbox.buildCanonicalStoryContextForRecord(frogRetracedRecord, {
    globalVerdict:frogRetracedRecord._globalVerdict,
    derivedStates:frogRetracedRecord._derivedStates,
    analysis:frogRetracedAnalysis
  });
  assert.strictEqual(frogRetracedStory.currentPhase, 'stalled_after_response', 'A material retracement must supersede stale extended-from-support authority.');
  assert.strictEqual(frogRetracedStory.buyerControl.state, 'emerging', 'Explicit developing buyer control must outrank a derived continuation upgrade.');
  assert.strictEqual(frogRetracedStory.followThrough.state, 'stalled', 'The current FROG-style response must retain stalled follow-through.');
  assert.ok(frogRetracedStory.storyEvents.includes('historical_rebound_extended'), 'The earlier extension should remain chronology, not current phase.');
  assert.ok(frogRetracedStory.diagnostics.phaseDecision.extensionMateriallyRetraced, 'Phase diagnostics must expose the retracement that rejected extension.');
  assert.strictEqual(frogRetracedStory.diagnostics.phaseDecision.supportEvent.timestamp, '2026-07-15', 'Phase diagnostics must expose the selected initial support event.');
  assert.strictEqual(frogRetracedStory.diagnostics.phaseDecision.postSupportHighDetails.timestamp, '2026-07-18', 'Phase diagnostics must expose the post-support rally high.');
  assert.strictEqual(frogRetracedStory.diagnostics.phaseDecision.historyOrdering, 'newest_first', 'Phase diagnostics must expose the normalized history ordering.');
  assert.strictEqual(frogRetracedStory.diagnostics.phaseDecision.laterSupportRevisits.length, 1, 'Phase diagnostics must expose rejected later MA revisits.');
  assert.strictEqual(sandbox.canonicalReviewTechnicalPullbackLabelFromStoryContext(frogRetracedStory), 'Pullback underway', 'Review must not label a historical 50MA response as the current location.');
  assert.ok(/Pullback underway/.test(sandbox.canonicalScanTechnicalSummaryFromStoryContext(frogRetracedStory)), 'Scan and Review technical context must consume the same current phase.');
  const frogRetracedCoach = sandbox.buildDeterministicChartCoach(frogRetracedRecord, frogRetracedAnalysis, {
    globalVerdict:frogRetracedRecord._globalVerdict,
    derivedStates:frogRetracedRecord._derivedStates
  });
  const frogRetracedPacket = sandbox.buildDeterministicEventPacketFromChartCoach(frogRetracedCoach);
  assert.strictEqual(frogRetracedPacket.currentPhase, 'stalled_after_response', 'The Chart Guru packet must carry the current stalled phase, not the historical extension.');
  assert.strictEqual(frogRetracedPacket.followThroughState, 'stalled', 'The Chart Guru packet must preserve stalled follow-through for narration projection.');
  const frogRetracedRead = sandbox.finalDisplayedAnalysisChartRead(frogRetracedRecord, frogRetracedAnalysis);
  assert.ok(/stalled|follow-through/i.test(frogRetracedRead.text), 'Deterministic Review prose must preserve the current stalled-follow-through state.');
  assert.ok(!/extended away|well beyond|no longer an active support test/i.test(frogRetracedRead.text), 'FROG-style retracement prose must not claim price has run away from support.');

  // A genuinely new 50MA response must become the relevant episode only after
  // it has its own multi-candle departure from the later touch.
  const secondSupportEpisodeHistory = [
    {date:'2026-07-10', open:82.1, high:82.6, low:80.9, close:81.7},
    {date:'2026-07-11', open:82.2, high:91.0, low:81.9, close:89.5},
    {date:'2026-07-12', open:89.7, high:97.5, low:88.9, close:96.8},
    {date:'2026-07-18', open:87.0, high:85.0, low:81.1, close:82.0},
    {date:'2026-07-19', open:82.4, high:86.0, low:84.9, close:85.2},
    {date:'2026-07-20', open:85.5, high:89.4, low:84.9, close:88.7}
  ].map(candle => ({...candle, ma50:81.62}));
  const secondSupportEpisode = sandbox.chartGuruSupportEpisodeFromHistory({supportContext:'50ma', historySequence:secondSupportEpisodeHistory}, 81.62);
  assert.strictEqual(secondSupportEpisode.supportEvent.timestamp, '2026-07-18', 'A later MA touch becomes the selected episode only after its own ordered response is present.');
  assert.strictEqual(secondSupportEpisode.postSupportHigh.timestamp, '2026-07-20', 'The new episode must measure its own post-touch high.');

  // Current measured location must win over a stale legacy extension label for
  // either supported moving average. The older rebound remains chronology; it
  // must not supply a buyer response for the newest support test.
  [
    {type:'20ma', label:'20-day average', maKey:'ma20', otherMaKey:'ma50', otherMa:96},
    {type:'50ma', label:'50-day average', maKey:'ma50', otherMaKey:'ma20', otherMa:104}
  ].forEach(({type, label, maKey, otherMaKey, otherMa}) => {
    const supportLevel = 100;
    const historicalExtension = [
      {date:'2026-07-01', open:100.2, high:100.8, low:99.7, close:100.1},
      {date:'2026-07-02', open:104.2, high:106.1, low:104.1, close:104.8},
      {date:'2026-07-03', open:106.5, high:110.0, low:106.2, close:108.4},
      {date:'2026-07-04', open:101.5, high:102.0, low:99.8, close:100.8}
    ].map(candle => ({...candle, [maKey]:supportLevel}));
    const baseContext = {
      supportContext:type,
      supportTestState:'held',
      structureIntact:true,
      extendedAfterRun:true,
      historicalExtendedAfterRun:true,
      currentPrice:100.8,
      ma200:90,
      historySequence:historicalExtension,
      [maKey]:supportLevel,
      [otherMaKey]:otherMa
    };
    const returnToSupportStory = sandbox.buildCanonicalChartStoryContext(baseContext);
    assert.ok(returnToSupportStory.storyEvents.includes('historical_rebound_extended'), `${type}: the earlier extension must remain chronology.`);
    assert.strictEqual(returnToSupportStory.buyerResponse.state, 'absent', `${type}: historical extension alone must not become a current buyer response.`);
    assert.strictEqual(returnToSupportStory.support.currentlyActive, true, `${type}: a measured return within the active-support threshold must override stale extended-after-run state.`);
    assert.strictEqual(returnToSupportStory.currentPhase, 'at_support', `${type}: a return without a fresh buyer response must be an active support test.`);
    assert.strictEqual(returnToSupportStory.diagnostics.phaseDecision.latestSupportEpisode.supportEvent.timestamp, '2026-07-04', `${type}: the phase trace must retain the later current MA contact even before it has a response.`);
    assert.strictEqual(returnToSupportStory.diagnostics.phaseDecision.latestSupportEpisode.responseDetected, false, `${type}: the latest current MA contact must not borrow response authority from the old episode.`);
    assert.strictEqual(returnToSupportStory.diagnostics.phaseDecision.buyerResponseSource, 'none', `${type}: historical response must not become current buyer-response authority.`);
    assert.strictEqual(sandbox.canonicalReviewTechnicalPullbackLabelFromStoryContext(returnToSupportStory), `Testing ${label}`, `${type}: Review must name the active returned-to-support moving average.`);

    const respondingFromSupportStory = sandbox.buildCanonicalChartStoryContext({
      ...baseContext,
      currentPrice:102,
      historySequence:[
        ...historicalExtension,
        {date:'2026-07-05', open:100.7, high:104.0, low:101.8, close:102.0},
        {date:'2026-07-06', open:101.8, high:104.2, low:101.0, close:102.0}
      ]
    });
    assert.strictEqual(respondingFromSupportStory.support.currentlyActive, true, `${type}: fresh buyer evidence must not lose the active current support location.`);
    assert.strictEqual(respondingFromSupportStory.diagnostics.phaseDecision.supportEvent.timestamp, '2026-07-04', `${type}: the selected support event must advance to Episode 2 after its dated rebound.`);
    assert.strictEqual(respondingFromSupportStory.diagnostics.phaseDecision.latestSupportEpisode.supportEvent.timestamp, '2026-07-04', `${type}: the phase trace must identify Episode 2 as the latest support episode.`);
    assert.strictEqual(respondingFromSupportStory.diagnostics.phaseDecision.latestSupportEpisode.responseDetected, true, `${type}: dated candles after Episode 2 must prove its fresh response.`);
    assert.strictEqual(respondingFromSupportStory.buyerResponse.state, 'present', `${type}: the latest support response must supply current buyer-response state.`);
    assert.strictEqual(respondingFromSupportStory.buyerResponse.source, 'latest_support_episode_history', `${type}: current buyer response must be sourced from Episode 2 history, not top-level state.`);
    assert.strictEqual(respondingFromSupportStory.diagnostics.phaseDecision.buyerResponseSource, 'latest_support_episode_history', `${type}: the phase trace must identify Episode 2 as the buyer-response source.`);
    assert.strictEqual(respondingFromSupportStory.currentPhase, 'responding_from_support', `${type}: fresh buyer evidence at active support must advance the canonical phase.`);
    assert.strictEqual(sandbox.canonicalReviewTechnicalPullbackLabelFromStoryContext(respondingFromSupportStory), `Responding at ${label}`, `${type}: Review must project the current support response rather than historical extension chronology.`);

    const soldOffResponseStory = sandbox.buildCanonicalChartStoryContext({
      ...baseContext,
      currentPrice:95,
      historySequence:[
        ...historicalExtension,
        {date:'2026-07-05', open:100.7, high:104.0, low:101.8, close:102.0},
        {date:'2026-07-06', open:101.8, high:104.2, low:101.0, close:102.0},
        {date:'2026-07-07', open:99, high:99.5, low:94.5, close:95, [maKey]:supportLevel}
      ]
    });
    assert.strictEqual(soldOffResponseStory.buyerResponse.state, 'absent', `${type}: a later selloff must demote the episode response from current authority.`);
    assert.notStrictEqual(soldOffResponseStory.buyerResponse.source, 'latest_support_episode_history', `${type}: a failed response must not keep the current-history authority source.`);
    assert.strictEqual(soldOffResponseStory.buyerResponse.validity, 'chronology_only', `${type}: the response must remain chronology-only after the selloff.`);

    const materiallyRetracedStall = sandbox.buildCanonicalChartStoryContext({
      ...baseContext,
      currentPrice:104,
      bounceState:'developing',
      recentlyLeftSupportZone:true
    });
    assert.strictEqual(materiallyRetracedStall.currentPhase, 'stalled_after_response', `${type}: a response that has materially retraced from the historical high must remain stalled.`);
    assert.strictEqual(materiallyRetracedStall.diagnostics.phaseDecision.extensionMateriallyRetraced, true, `${type}: the trace must explicitly record material retracement before Review says pullback.`);
    assert.strictEqual(sandbox.canonicalReviewTechnicalPullbackLabelFromStoryContext(materiallyRetracedStall), 'Pullback underway', `${type}: material retracement must produce the pullback label.`);

    const stalledAwayFromSupport = sandbox.buildCanonicalChartStoryContext({
      ...baseContext,
      currentPrice:104,
      historySequence:[],
      bounceState:'developing',
      recentlyLeftSupportZone:true
    });
    assert.strictEqual(stalledAwayFromSupport.currentPhase, 'stalled_after_response', `${type}: a genuine stalled rebound away from support must retain its stalled phase.`);
    assert.strictEqual(stalledAwayFromSupport.diagnostics.phaseDecision.extensionMateriallyRetraced, false, `${type}: no measured retracement means Review must not imply a pullback.`);
    assert.strictEqual(sandbox.canonicalReviewTechnicalPullbackLabelFromStoryContext(stalledAwayFromSupport), `Stalled after ${label}`, `${type}: a stalled rebound without material retracement must keep its precise support label.`);

    const driftHistory = [
      {date:'2026-08-01', open:100, high:101, low:99.5, close:100, [maKey]:80},
      {date:'2026-08-02', open:102, high:105, low:101, close:104, [maKey]:90},
      {date:'2026-08-03', open:104, high:106, low:103, close:105, [maKey]:90},
      {date:'2026-08-04', open:103, high:104, low:99.8, close:100.5, [maKey]:100},
      {date:'2026-08-05', open:104.5, high:106, low:104.5, close:105, [maKey]:100},
      {date:'2026-08-06', open:105, high:107, low:105, close:106, [maKey]:100}
    ];
    const driftEpisode = sandbox.chartGuruSupportEpisodeFromHistory({supportContext:type, historySequence:driftHistory}, 100);
    assert.strictEqual(driftEpisode.supportEvent.timestamp, '2026-08-04', `${type}: an old candle near today's MA but far from its own MA must be rejected.`);
    assert.strictEqual(driftEpisode.supportEvent.maSource, 'per_candle', `${type}: supplied contemporaneous MA must win over current-MA proximity.`);

    const historicalTouchWithMaDrift = [
      // The close is nearest today's MA (100), but the low is the genuine
      // interaction with this candle's own MA (80).
      {date:'2026-08-10', open:102, high:105, low:80, close:101, [maKey]:80},
      {date:'2026-08-11', open:101, high:125, low:100, close:110, [maKey]:95},
      {date:'2026-08-12', open:110, high:120, low:108, close:112, [maKey]:100}
    ];
    const historicalTouchEpisode = sandbox.chartGuruSupportEpisodeFromHistory({supportContext:type, historySequence:historicalTouchWithMaDrift}, 100);
    assert.strictEqual(historicalTouchEpisode.supportEvent.timestamp, '2026-08-10', `${type}: a low touching its contemporaneous MA must be recognised despite the close being nearer today's MA.`);
    assert.strictEqual(historicalTouchEpisode.supportEvent.price, 80, `${type}: the contemporaneous-MA interaction must identify the low, not the close, as the contact price.`);
    assert.strictEqual(historicalTouchEpisode.postSupportHigh.timestamp, '2026-08-11', `${type}: the post-support high must remain anchored to the contemporaneous-MA touch.`);
    const driftRetracementStory = sandbox.buildCanonicalChartStoryContext({
      ...baseContext,
      currentPrice:105,
      historySequence:historicalTouchWithMaDrift
    });
    assert.strictEqual(driftRetracementStory.diagnostics.phaseDecision.extensionMateriallyRetraced, true, `${type}: retracement must continue to use the selected contemporaneous-MA episode high.`);

    const closeNearTodayButNotHistoricalMa = [
      {date:'2026-08-20', open:102, high:105, low:90, close:101, [maKey]:80},
      {date:'2026-08-21', open:101, high:106, low:94, close:103, [maKey]:90},
      {date:'2026-08-22', open:103, high:107, low:96, close:104, [maKey]:100}
    ];
    const nonContactEpisode = sandbox.chartGuruSupportEpisodeFromHistory({supportContext:type, historySequence:closeNearTodayButNotHistoricalMa}, 100);
    assert.strictEqual(nonContactEpisode.supportEvent, null, `${type}: a close near today's MA without interaction with its own MA must not become a support contact.`);

    const unavailableEpisode = sandbox.chartGuruSupportEpisodeFromHistory({supportContext:type, historySequence:driftHistory.slice(0, 3).map(({ma20, ma50, ...candle}) => candle)}, 100);
    assert.strictEqual(unavailableEpisode.supportEvent, null, `${type}: insufficient close history without per-candle MA must not invent a historical episode.`);
    assert.strictEqual(unavailableEpisode.historicalInferenceSkipped, true, `${type}: unavailable MA evidence must be explicit in the trace.`);
  });

  // A recent high is not support chronology. With insufficient dated 50MA
  // evidence, it must remain separate from the retracement authority and leave
  // an explicit extended-from-support phase intact.
  const incomplete50MaHistory = [
    {date:'2026-09-01', open:104, high:108, low:103, close:106},
    {date:'2026-09-02', open:106, high:110, low:104, close:107},
    {date:'2026-09-03', open:107, high:109, low:103, close:105}
  ];
  const incomplete50MaContext = {
    supportContext:'50ma',
    supportTestState:'held',
    structureIntact:true,
    recentlyLeftSupportZone:true,
    extendedAfterRun:true,
    currentPrice:105,
    ma50:100,
    ma20:104,
    historySequence:incomplete50MaHistory,
    recentSequence:[{date:'2026-09-03', high:118}],
    bounceState:'developing',
    weakVolume:true,
    authoritativeCurrentPhase:'extended_from_support',
    phaseAuthoritySource:'canonical_resolver'
  };
  const unanchoredRecentHighStory = sandbox.buildCanonicalChartStoryContext(incomplete50MaContext);
  const unanchoredTrace = unanchoredRecentHighStory.diagnostics.phaseDecision;
  assert.strictEqual(unanchoredTrace.supportEpisodeEstablished, false, 'Insufficient 50MA history must not establish a support episode.');
  assert.strictEqual(unanchoredTrace.recentHigh, 118, 'The generic recent high may remain visible as chart context.');
  assert.strictEqual(unanchoredTrace.anchoredPostSupportHigh, null, 'A generic recent high must not populate the anchored post-support high.');
  assert.strictEqual(unanchoredTrace.postSupportHighSource, 'unavailable', 'The trace must identify the missing post-support-high authority.');
  assert.strictEqual(unanchoredTrace.retracementAvailable, false, 'Retracement must be unavailable without an anchored support high.');
  assert.strictEqual(unanchoredTrace.retracementFromPostSupportHighPct, null, 'An unanchored recent high must not produce a retracement measurement.');
  assert.strictEqual(unanchoredTrace.extensionMateriallyRetraced, false, 'Unanchored context must not manufacture material retracement.');
  assert.strictEqual(unanchoredTrace.retracementPhaseOverrideApplied, false, 'No retracement phase override may run without anchored authority.');
  assert.match(unanchoredTrace.retracementUnavailableReason, /insufficient contemporaneous MA history/i, 'The trace must explain why historical retracement authority is unavailable.');
  assert.strictEqual(unanchoredRecentHighStory.currentPhase, 'extended_from_support', 'An unanchored recent high must not supersede the authoritative extension phase.');

  const explicitPostSupportHighStory = sandbox.buildCanonicalChartStoryContext({
    ...incomplete50MaContext,
    postSupportHigh:118
  });
  const explicitHighTrace = explicitPostSupportHighStory.diagnostics.phaseDecision;
  assert.strictEqual(explicitHighTrace.anchoredPostSupportHigh, 118, 'A trusted explicit post-support high must be accepted.');
  assert.strictEqual(explicitHighTrace.postSupportHighSource, 'explicit_post_support_high', 'The explicit high authority must be recorded.');
  assert.strictEqual(explicitHighTrace.retracementAvailable, true, 'A trusted explicit high may enable retracement calculation.');
  assert.strictEqual(explicitHighTrace.extensionMateriallyRetraced, true, 'The explicit anchored high must allow material-retracement detection.');
  assert.strictEqual(explicitHighTrace.retracementPhaseOverrideApplied, true, 'Material retracement from an explicit anchored high may supersede extension authority.');
  assert.strictEqual(explicitPostSupportHighStory.currentPhase, 'stalled_after_response', 'The independently evidenced stalled response should replace the extension phase only after anchored retracement is available.');

  const validatedEpisodeHighStory = sandbox.buildCanonicalChartStoryContext({
    supportContext:'50ma',
    supportTestState:'held',
    structureIntact:true,
    recentlyLeftSupportZone:true,
    currentPrice:86.56,
    ma50:81.62,
    historySequence:frogSupportEpisodeHistory
  });
  const validatedEpisodeTrace = validatedEpisodeHighStory.diagnostics.phaseDecision;
  assert.strictEqual(validatedEpisodeTrace.supportEpisodeEstablished, true, 'A dated per-candle MA episode must establish support chronology.');
  assert.strictEqual(validatedEpisodeTrace.postSupportHighSource, 'validated_support_episode', 'A measured episode high must retain its episode authority.');
  assert.strictEqual(validatedEpisodeTrace.anchoredPostSupportHigh, 98.9, 'Only the high after the selected support event may anchor retracement.');
  assert.strictEqual(validatedEpisodeTrace.retracementAvailable, true, 'A validated support episode must permit anchored retracement measurement.');

  const completedContinuationRecord = {
    marketData:{price:288.3, ma20:273.251, ma50:269.7692, ma200:250},
    _globalVerdict:{
      final_verdict:'watch',
      structure_state:'strong',
      structure_eligibility:'alive',
      support_context:'none',
      support_test_state:'not_tested',
      buyer_control_state:'none',
      bounce_state:'attempt',
      stabilisation_state:'none',
      pullback_zone:'none',
      setup_location_state:'off_level'
    },
    _derivedStates:{
      structureState:'strong',
      structureEligibility:'alive',
      setupLocationState:'off_level',
      pullbackZone:'none',
      bounceState:'attempt',
      stabilisationState:'none',
      volumeState:'expanding',
      supportContext:'none',
      supportTestState:'not_tested',
      buyerControlState:'none',
      evaluationScanType:'20MA',
      candleEvidenceUpClosesAfterLow:3,
      candleEvidenceHigherLowHold:true,
      candleEvidenceDownsideMomentumSlowing:true
    }
  };
  const completedContinuationAnalysis = {
    canonicalValues:{price:288.3, ma20:273.251, ma50:269.7692, ma200:250, volume:2945750},
    trustedMarketContext:{
      avgVolume30d:2605426,
      recentCandleSequence:[
        {date:'2026-07-14', open:288.3, high:288.3, low:288.3, close:288.3, volume:2945750},
        {date:'2026-07-13', open:289.13, high:289.13, low:289.13, close:289.13, volume:2276868},
        {date:'2026-07-10', open:286.96, high:286.96, low:286.96, close:286.96, volume:1876200},
        {date:'2026-07-09', open:285.04, high:285.04, low:285.04, close:285.04, volume:2025716}
      ]
    }
  };
  const completedContinuationStory = sandbox.buildCanonicalStoryContextForRecord(completedContinuationRecord, {
    globalVerdict:completedContinuationRecord._globalVerdict,
    derivedStates:completedContinuationRecord._derivedStates,
    analysis:completedContinuationAnalysis
  });
  assert.ok(Math.abs(completedContinuationStory.support.distancePct - ((288.3 - 273.251) / 273.251)) < 0.0001, 'Completed continuation must retain the measured distance from 20MA.');
  assert.strictEqual(completedContinuationStory.support.type, '20ma', 'Completed continuation must retain its historical 20MA support type.');
  assert.strictEqual(completedContinuationStory.buyerResponse.semantic, 'response_present', 'Completed continuation must preserve the historical buyer response.');
  assert.strictEqual(completedContinuationStory.buyerControl.state, 'confirmed', 'Multiple continuation closes must confirm buyer control even when raw scanner state remains attempt.');
  assert.strictEqual(completedContinuationStory.confirmation.semantic, 'follow_through_confirmed', 'Multiple continuation closes must confirm follow-through.');
  assert.strictEqual(completedContinuationStory.currentPhase, 'extended_from_support', 'Material distance after confirmed continuation must supersede stale support-era state.');
  assert.ok(completedContinuationStory.storyEvents.includes('buyers_responded') && completedContinuationStory.storyEvents.includes('rebound_extended'), 'The story must retain both historical support response and current extension.');
  const completedContinuationRead = sandbox.finalDisplayedAnalysisChartRead(completedContinuationRecord, completedContinuationAnalysis);
  assert.ok(/extended away|no longer an active support test|well beyond|moved well beyond/i.test(completedContinuationRead.text), 'Review prose must project the completed-extension phase rather than stale early-response fields.');
  assert.ok(!/support is reacting|buyers emerging|follow-through stalled/i.test(completedContinuationRead.text), 'Completed extension must not render active-support or stalled-response language.');
  assert.strictEqual(completedContinuationRecord._globalVerdict.final_verdict, 'watch', 'Completed continuation must not alter the existing Watch verdict.');

  const activeSupportRecord = {
    marketData:{price:201.2, ma20:200.4, ma50:195.8, ma200:180},
    _globalVerdict:{
      final_verdict:'watch',
      structure_state:'strong',
      structure_eligibility:'alive',
      support_context:'20ma',
      support_test_state:'held',
      buyer_control_state:'emerging',
      bounce_state:'attempt',
      stabilisation_state:'early',
      pullback_zone:'near_20ma',
      setup_location_state:'near_20ma'
    },
    _derivedStates:{
      structureState:'strong',
      structureEligibility:'alive',
      setupLocationState:'near_20ma',
      pullbackZone:'near_20ma',
      priceabilityState:'provisional',
      bounceState:'attempt',
      stabilisationState:'early',
      volumeState:'constructive',
      supportContext:'20ma',
      supportTestState:'held',
      buyerControlState:'emerging',
      evaluationScanType:'20MA',
      candleEvidenceUpClosesAfterLow:1
    }
  };
  const activeSupportAnalysis = {
    canonicalValues:{price:201.2, ma20:200.4, ma50:195.8, ma200:180, volume:1200000},
    trustedMarketContext:{
      avgVolume30d:1300000,
      recentCandleSequence:[
        {date:'2026-07-03', open:200.7, high:201.5, low:199.9, close:201.2, volume:1200000},
        {date:'2026-07-02', open:201.8, high:202.1, low:199.6, close:200.5, volume:1180000},
        {date:'2026-07-01', open:202.6, high:203.0, low:200.1, close:201.0, volume:1150000}
      ]
    }
  };
  const activeSupportRead = sandbox.finalDisplayedAnalysisChartRead(activeSupportRecord, activeSupportAnalysis);
  assert.strictEqual(String(activeSupportRead.chartCoach && activeSupportRead.chartCoach.storyContext && activeSupportRead.chartCoach.storyContext.currentPhase || ''), 'responding_from_support', 'Early support-response review case must preserve the active support phase.');
  assert.ok(/20-day average/i.test(activeSupportRead.text), 'Review prose must name the active support level when canonical context knows it.');
  assert.ok(/early|needs another sign of control|follow-through|reacting/i.test(activeSupportRead.text), 'Review prose may describe an early support response when the chart is still near support.');
  assert.ok(!/extended away|well beyond|no longer an active support test/i.test(activeSupportRead.text), 'Active-support review prose must not drift into the post-support extension family.');

  const failedSupportRecord = {
    marketData:{price:196.4, ma20:200.2, ma50:194.1, ma200:180},
    _globalVerdict:{
      final_verdict:'watch',
      structure_state:'weakening',
      structure_eligibility:'damaged',
      support_context:'20ma',
      support_test_state:'failed',
      buyer_control_state:'none',
      bounce_state:'none',
      stabilisation_state:'none',
      pullback_zone:'off_level',
      setup_location_state:'lost_support'
    },
    _derivedStates:{
      structureState:'weakening',
      structureEligibility:'damaged',
      setupLocationState:'lost_support',
      pullbackZone:'off_level',
      priceabilityState:'unpriceable',
      bounceState:'none',
      stabilisationState:'none',
      volumeState:'weak',
      supportContext:'20ma',
      supportTestState:'failed',
      buyerControlState:'none',
      evaluationScanType:'20MA'
    }
  };
  const failedSupportAnalysis = {
    canonicalValues:{price:196.4, ma20:200.2, ma50:194.1, ma200:180, volume:1000000},
    trustedMarketContext:{
      avgVolume30d:1200000,
      recentCandleSequence:[
        {date:'2026-07-03', open:198.8, high:199.3, low:195.9, close:196.4, volume:1000000},
        {date:'2026-07-02', open:200.6, high:201.2, low:198.0, close:199.1, volume:1100000},
        {date:'2026-07-01', open:202.2, high:202.7, low:199.9, close:200.5, volume:1150000}
      ]
    }
  };
  const failedSupportRead = sandbox.finalDisplayedAnalysisChartRead(failedSupportRecord, failedSupportAnalysis);
  assert.ok(/failed|repair mode|repair/i.test(failedSupportRead.text), 'Failed-support review prose must retain failed or repairing semantics.');
  assert.ok(!/support unknown/i.test(failedSupportRead.text), 'Failed-support review prose must not degrade to support_unknown wording.');

  const explicit50ContextRecord = {
    marketData:{price:206, ma20:198, ma50:200, ma200:180},
    _globalVerdict:{
      final_verdict:'watch',
      structure_state:'strong',
      structure_eligibility:'alive',
      support_context:'50ma',
      support_test_state:'held',
      buyer_control_state:'emerging',
      bounce_state:'attempt',
      stabilisation_state:'early'
    },
    _derivedStates:{
      structureState:'strong',
      structureEligibility:'alive',
      setupLocationState:'near_50ma',
      pullbackZone:'near_50ma',
      priceabilityState:'provisional',
      bounceState:'attempt',
      stabilisationState:'early',
      volumeState:'constructive',
      supportContext:'50ma',
      supportTestState:'held',
      buyerControlState:'emerging'
    }
  };
  const explicit50ContextAnalysis = {
    canonicalValues:{price:206, ma20:198, ma50:200, ma200:180, volume:1250000},
    trustedMarketContext:{
      avgVolume30d:1300000,
      recentCandleSequence:[
        {date:'2026-07-03', open:203.9, high:206.2, low:203.4, close:206.0, volume:1250000},
        {date:'2026-07-02', open:202.8, high:204.4, low:201.9, close:203.7, volume:1200000},
        {date:'2026-07-01', open:201.4, high:203.0, low:200.8, close:202.5, volume:1180000}
      ]
    }
  };
  const explicit50ContextRead = sandbox.finalDisplayedAnalysisChartRead(explicit50ContextRecord, explicit50ContextAnalysis);
  assert.ok(/50-day average/i.test(explicit50ContextRead.text), 'Review prose must name the correct support from explicit supportContext without relying on legacy hints.');

  const missingDistanceRecord = {
    marketData:{price:null, ma20:200.4, ma50:195.8, ma200:180},
    _globalVerdict:{
      final_verdict:'watch',
      structure_state:'strong',
      structure_eligibility:'alive',
      support_context:'20ma',
      support_test_state:'held',
      buyer_control_state:'confirmed',
      bounce_state:'confirmed',
      stabilisation_state:'clear',
      pullback_zone:'extended',
      setup_location_state:'extended'
    },
    _derivedStates:{
      structureState:'strong',
      structureEligibility:'alive',
      setupLocationState:'extended',
      pullbackZone:'extended',
      priceabilityState:'provisional',
      bounceState:'confirmed',
      stabilisationState:'clear',
      volumeState:'constructive',
      supportContext:'20ma',
      supportTestState:'held',
      buyerControlState:'confirmed'
    }
  };
  const missingDistanceRead = sandbox.finalDisplayedAnalysisChartRead(missingDistanceRecord, {
    canonicalValues:{price:null, ma20:200.4, ma50:195.8, ma200:180, volume:1200000},
    trustedMarketContext:{recentCandleSequence:activeSupportAnalysis.trustedMarketContext.recentCandleSequence}
  });
  assert.ok(!/extended away|well beyond|no longer an active support test/i.test(missingDistanceRead.text), 'Missing current price or MA data must not trigger a false extended-after-run review story.');
  assert.notStrictEqual(String(missingDistanceRead.chartCoach && missingDistanceRead.chartCoach.storyContext && missingDistanceRead.chartCoach.storyContext.currentPhase || ''), 'extended_from_support', 'Missing current price or MA data must not classify as extended_from_support.');

  assert.strictEqual(extendedReviewRecord._globalVerdict.final_verdict, 'watch', 'Review prose migration must not change the underlying canonical verdict.');
  assert.strictEqual(nearEntryRead.usedDeterministicFallback, true, 'Review prose migration must not change deterministic fallback selection for near-entry prose cases.');

  const persistedDeterministicCoach = sandbox.buildDeterministicChartCoach(extendedReviewRecord, extendedReviewAnalysis, {
    derivedStates:extendedReviewRecord._derivedStates,
    globalVerdict:extendedReviewRecord._globalVerdict
  });
  const persistedDeterministicRead = sandbox.finalDisplayedAnalysisChartRead(
    extendedReviewRecord,
    {
      ...extendedReviewAnalysis,
      chartCoach:{
        ...persistedDeterministicCoach,
        source:'deterministic',
        summaryText:'🧭 Chart Story: Support is reacting. 🎯 What next?: Buyers emerging and buyer control is not convincing yet.'
      }
    }
  );
  assert.strictEqual(persistedDeterministicRead.selectedSummarySource, 'deterministic', 'Persisted deterministic chartCoach should preserve the exact restored source label.');
  assert.strictEqual(persistedDeterministicRead.usedDeterministicFallback, true, 'Exact deterministic restore path must use the canonical deterministic Review prose.');
  assert.ok(/well beyond|extended away|no longer an active support test|moved well beyond/i.test(persistedDeterministicRead.text), 'Persisted deterministic restore path must render the new post-support extension Review prose.');
  assert.ok(!/Support is reacting|Buyers emerging|buyer control is not convincing yet/i.test(persistedDeterministicRead.text), 'Persisted deterministic restore path must not render stale stored section-summary phrases.');
  assert.strictEqual(extendedReviewRecord._globalVerdict.final_verdict, 'watch', 'Persisted deterministic restore path must not alter the underlying verdict.');

  const prefixedDeterministicRead = sandbox.finalDisplayedAnalysisChartRead(
    extendedReviewRecord,
    {
      ...extendedReviewAnalysis,
      chartCoach:{
        ...persistedDeterministicCoach,
        source:'deterministic_fallback',
        summaryText:'🧭 Chart Story: stale deterministic summary'
      }
    }
  );
  assert.strictEqual(prefixedDeterministicRead.usedDeterministicFallback, true, 'Prefixed deterministic sources must continue to use deterministic Review prose.');
  assert.ok(/well beyond|extended away|no longer an active support test|moved well beyond/i.test(prefixedDeterministicRead.text), 'Prefixed deterministic sources must keep the canonical Review prose path.');

  const exactMatchSafetyRead = sandbox.finalDisplayedAnalysisChartRead(
    extendedReviewRecord,
    {
      ...extendedReviewAnalysis,
      chartCoach:{
        ...persistedDeterministicCoach,
        source:'restored_deterministic_summary',
        summaryText:'Persisted AI-style text should stay on its own source path.'
      }
    }
  );
  assert.strictEqual(exactMatchSafetyRead.usedDeterministicFallback, false, 'Sources that merely contain deterministic must not be classified as deterministic Review output.');
  assert.strictEqual(exactMatchSafetyRead.selectedSummarySource, 'restored_deterministic_summary', 'Non-matching deterministic-like sources should preserve their own source label.');
  assert.ok(/Why it matters:|Volume:|Learning point:/i.test(exactMatchSafetyRead.text), 'Non-matching deterministic-like sources should stay on the multi-section Chart Coach summary path.');
  assert.ok(!/no longer an active support test/i.test(exactMatchSafetyRead.text), 'Non-matching deterministic-like sources must not be upgraded onto the canonical deterministic Review prose path.');

  const genuineAiSourceRead = sandbox.finalDisplayedAnalysisChartRead(
    extendedReviewRecord,
    {
      ...extendedReviewAnalysis,
      chartCoach:{
        ...persistedDeterministicCoach,
        source:'openai_two_step_chart_guru',
        summaryText:'🧭 Chart Story: AI summary should remain unchanged.',
        sections:[
          {
            key:'biggest_clue',
            icon:'🧭',
            label:'Chart Story',
            text:'AI summary should remain unchanged.'
          }
        ]
      }
    }
  );
  assert.strictEqual(genuineAiSourceRead.usedDeterministicFallback, false, 'Non-deterministic AI sources must remain on the AI summary path.');
  assert.ok(/AI summary should remain unchanged\./i.test(genuineAiSourceRead.text), 'Non-deterministic AI sources must not be overwritten by deterministic Review prose.');

  const originalSelectReviewAiSummary = sandbox.selectReviewAiSummary;
  sandbox.selectReviewAiSummary = () => ({
    text:'Persisted deterministic summary should be ignored when recomputed facts disagree.',
    source:'deterministic',
    chartCoach:{
      source:'deterministic',
      summaryText:'🧭 Chart Story: Support is reacting. 🎯 What next?: Buyers emerging and buyer control is not convincing yet.',
      storyContext:{
        dominantStory:'initial_support_response',
        currentPhase:'responding_from_support',
        support:{
          label:'20-day average',
          type:'20ma',
          currentlyActive:true
        },
        volume:{state:'constructive'},
        diagnostics:{}
      },
      sections:[
        {
          key:'biggest_clue',
          icon:'🧭',
          label:'Chart Story',
          text:'Support is reacting.'
        },
        {
          key:'what_next',
          icon:'🎯',
          label:'What next?',
          text:'Buyers emerging and buyer control is not convincing yet.'
        }
      ]
    },
    fallback:{
      storyContext:{
        dominantStory:'extended_after_support_rebound',
        currentPhase:'extended_from_support',
        support:{
          label:'20-day average',
          type:'20ma',
          currentlyActive:false
        },
        volume:{state:'constructive'},
        diagnostics:{}
      },
      facts:{source:'recomputed_fallback'}
    }
  });
  const restoredDeterministicPrecedenceRead = sandbox.finalDisplayedAnalysisChartRead(extendedReviewRecord, extendedReviewAnalysis);
  assert.strictEqual(restoredDeterministicPrecedenceRead.usedDeterministicFallback, true, 'Restored deterministic summaries must still use deterministic Review prose.');
  assert.ok(/well beyond|extended away|no longer an active support test|moved well beyond/i.test(restoredDeterministicPrecedenceRead.text), 'Restored deterministic summaries must follow the recomputed canonical fallback story context when it disagrees with stale persisted metadata.');
  assert.ok(!/Support is reacting|Buyers emerging|buyer control is not convincing yet/i.test(restoredDeterministicPrecedenceRead.text), 'Restored deterministic summaries must ignore stale persisted support-reaction wording when recomputed canonical facts show an extended rebound.');

  sandbox.selectReviewAiSummary = () => ({
    text:'Persisted deterministic summary should remain available when recomputed context is unavailable.',
    source:'deterministic',
    chartCoach:{
      source:'deterministic',
      summaryText:'🧭 Chart Story: Support is reacting. 🎯 What next?: Buyers emerging and buyer control is not convincing yet.',
      storyContext:{
        dominantStory:'initial_support_response',
        currentPhase:'responding_from_support',
        support:{
          label:'20-day average',
          type:'20ma',
          currentlyActive:true
        },
        volume:{state:'constructive'},
        diagnostics:{}
      },
      sections:[
        {
          key:'biggest_clue',
          icon:'🧭',
          label:'Chart Story',
          text:'Support is reacting.'
        },
        {
          key:'what_next',
          icon:'🎯',
          label:'What next?',
          text:'Buyers emerging and buyer control is not convincing yet.'
        }
      ]
    },
    fallback:{
      storyContext:null,
      facts:{source:'recomputed_fallback_missing_story'}
    }
  });
  const deterministicCompatibilityRead = sandbox.finalDisplayedAnalysisChartRead(activeSupportRecord, activeSupportAnalysis);
  assert.strictEqual(deterministicCompatibilityRead.usedDeterministicFallback, true, 'Deterministic restore path should still use deterministic Review prose when fallback story context is missing.');
  assert.ok(/reacting|needs another sign of control|follow-through/i.test(deterministicCompatibilityRead.text), 'Deterministic restore path may fall back to persisted sanitized story context when no recomputed fallback story context exists.');

  sandbox.selectReviewAiSummary = originalSelectReviewAiSummary;

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
  const resistanceStoryKey = String(resistanceRead.chartCoach && resistanceRead.chartCoach.primaryStory && resistanceRead.chartCoach.primaryStory.key || '');
  assert.ok(
    !['early_rebound_from_20ma', 'constructive_pullback_near_20ma', 'constructive_pullback_near_50ma', 'bounce_confirmation_pending'].includes(resistanceStoryKey),
    'Chart Guru should not collapse an upper-wick continuation chart into a generic support-response story'
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
  assert.ok(/Indecision:|Chart Story:/i.test(dojiRead.text), 'Chart Guru should explain doji or indecision candles');
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
  assert.strictEqual(rankingModel.sections[0].key, 'biggest_clue', 'Primary story should still render first as the Chart Story section');
  assert.strictEqual(rankingModel.sections.filter(section => section.key === 'learning_point').length, 1, 'Only one Learning point section should render');
  assert.ok(rankingModel.sections.some(section => section.key === 'what_next'), 'What next should still be rendered');

  const hwmStyleCoach = sandbox.buildDeterministicChartCoach(
    {
      marketData:{price:144.1, ma20:143.6, ma50:138.4, ma200:121.8, avgVolume30d:1000000}
    },
    {
      canonicalValues:{price:144.1, ma20:143.6, ma50:138.4, ma200:121.8, volume:720000},
      trustedMarketContext:{
        avgVolume30d:1000000,
        recentCandleSequence:[
          {date:'2026-07-01', open:144.0, high:144.8, low:143.2, close:144.1, volume:720000},
          {date:'2026-06-30', open:145.6, high:146.2, low:143.8, close:144.2, volume:810000},
          {date:'2026-06-29', open:146.4, high:147.0, low:145.0, close:145.7, volume:930000},
          {date:'2026-06-28', open:142.2, high:146.8, low:141.9, close:146.5, volume:1250000}
        ]
      }
    },
    {
      derivedStates:{
        structureState:'intact',
        structureEligibility:'alive',
        pullbackZone:'near_20ma',
        setupLocationState:'supportive',
        bounceState:'attempt',
        volumeState:'weak',
        priceabilityState:'unpriceable'
      },
      globalVerdict:{final_verdict:'watch'}
    }
  );
  assert.ok(
    ['constructive_pullback_near_20ma', 'early_rebound_from_20ma'].includes(hwmStyleCoach.primaryStory.key),
    'Constructive near-20MA charts with buyer response should stay in the constructive support-context family'
  );
  assert.strictEqual(hwmStyleCoach.sections[0].key, 'biggest_clue', 'Constructive pullback story should still render first');
  assert.strictEqual(hwmStyleCoach.sections[0].label, 'Chart Story', 'Primary section should be labeled as Chart Story');
  assert.ok(
    /(pullback|recent dip|buyers (?:started to|have started to) respond|buyers (?:started to|have started to) rebound|bounce)/i.test(hwmStyleCoach.sections[0].text)
      && /20-day average/i.test(hwmStyleCoach.sections[0].text),
    'First rendered section should explain the constructive near-support context'
  );
  assert.ok(hwmStyleCoach.sections.every(section => section.key !== 'indecision' || /small|neither/i.test(section.text)), 'Indecision, if present, should remain supporting detail only');
  const hwmWhatNext = hwmStyleCoach.sections.find(section => section.key === 'what_next');
  assert.ok(/confirm support|firmer close|watch for|follow-through|follow through/i.test(hwmWhatNext.text), 'What next should require bullish confirmation from support');
  assert.ok(/decisive close below|failure back below|slips? back below|support would weaken/i.test(hwmWhatNext.text), 'What next should explain the support-loss invalidation');
  assert.ok(!hwmStyleCoach.primaryStory.evidenceFactIds.includes('bounce_attempt') || /bounce/i.test(hwmStyleCoach.sections[0].text), 'Constructive pullback evidence should only claim a bounce attempt when one exists');
  assert.ok(
    hwmStyleCoach.recentStory.steps.includes('pullback_to_20ma')
      && hwmStyleCoach.recentStory.steps.includes('weak_volume')
      && (
        hwmStyleCoach.recentStory.steps.includes('support_test')
        || hwmStyleCoach.recentStory.steps.includes('buyer_response')
      )
      && (
        hwmStyleCoach.recentStory.steps.includes('support_still_unproven')
        || hwmStyleCoach.recentStory.steps.includes('confirmation_needed')
      ),
    'Constructive near-support story should preserve pullback context, weak-volume context, and an unconfirmed support-response state'
  );
  assertStepDetailsUseKnownFacts(hwmStyleCoach, 'Constructive near-support story');
  assert.ok(
    ['cautious_support_test', 'constructive_buyer_response'].includes(hwmStyleCoach.recentStory.toneMode),
    'Constructive near-support story should expose a deterministic constructive tone mode'
  );
  assert.ok(
    ['support_test_needs_buyer_proof', 'buyer_response_needs_volume_proof', 'buyer_response_needs_follow_through'].includes(hwmStyleCoach.recentStory.confidenceMode),
    'Constructive near-support story should expose a deterministic but still-unconfirmed confidence mode'
  );
  assertDerivedSupportPresent(
    hwmStyleCoach,
    hwmStyleCoach.recentStory.steps.includes('confirmation_needed') ? 'confirmation_needed' : 'support_still_unproven',
    'Constructive near-support story'
  );
  assert.strictEqual(hwmStyleCoach.primaryStory.readerTest.tone, 'good', 'Constructive near-support story should pass the Reader Test with a constructive tone');

  const legacyDerivedSupportCoach = sandbox.buildDeterministicChartCoach(
    {marketData:{price:100, ma20:100.5, ma50:96, ma200:80, avgVolume30d:1000000}},
    {canonicalValues:{price:100, ma20:100.5, ma50:96, ma200:80, volume:800000}, trustedMarketContext:{avgVolume30d:1000000, recentCandleSequence:[]}},
    {
      derivedStates:{structureState:'intact', pullbackZone:'near_20ma', setupLocationState:'usable_pullback', supportContext:'20ma_support', supportTestState:'testing', buyerControlState:'emerging', bounceState:'none', stabilisationState:'early', volumeState:'weak'},
      globalVerdict:{final_verdict:'watch'}
    }
  );
  assert.strictEqual(legacyDerivedSupportCoach.storyContext.support.level, '20ma_support', 'Legacy records without canonical support data may fall back to derived support context');
  assert.strictEqual(legacyDerivedSupportCoach.storyContext.support.interaction, 'testing', 'Legacy records must preserve their usable derived support-test state');

  const locationOnlySupportCoach = sandbox.buildDeterministicChartCoach(
    {marketData:{price:100, ma20:100.4, ma50:96, ma200:80, avgVolume30d:1000000}},
    {canonicalValues:{price:100, ma20:100.4, ma50:96, ma200:80, volume:800000}, trustedMarketContext:{avgVolume30d:1000000, recentCandleSequence:[]}},
    {
      derivedStates:{structureState:'intact', pullbackZone:'near_20ma', setupLocationState:'usable_pullback', supportContext:'none', supportTestState:'not_tested', buyerControlState:'none', bounceState:'none', stabilisationState:'none', volumeState:'weak'},
      globalVerdict:{final_verdict:'watch', support_context:'20ma_support', support_interaction_state:'active_20ma_support'}
    }
  );
  assert.strictEqual(locationOnlySupportCoach.storyContext.support.currentlyActive, true, 'Location-only: active 20MA support must preserve the valid support location');
  assert.strictEqual(locationOnlySupportCoach.storyContext.support.interaction, 'testing', 'Location-only: active support without explicit evidence must remain testing');
  assert.notStrictEqual(locationOnlySupportCoach.storyContext.buyerControl.state, 'confirmed', 'Location-only: support proximity must not manufacture confirmed buyer control');
  assert.notStrictEqual(locationOnlySupportCoach.primaryStory.key, 'off_level_wait_for_clearer_support', 'Location-only: in-band support must not use the off-level story');
  assert.ok(!/away from (?:the )?20-day average|return to support|return to the 20-day average/i.test(locationOnlySupportCoach.summaryText), 'Location-only: in-band support prose must not claim price is away from support');

  for(const supportType of ['20ma', '50ma']){
    const failedSupportCoach = sandbox.buildDeterministicChartCoach(
      {marketData:{price:100, ma20:100.2, ma50:99.8, ma200:80, avgVolume30d:1000000}},
      {canonicalValues:{price:100, ma20:100.2, ma50:99.8, ma200:80, volume:900000}, trustedMarketContext:{avgVolume30d:1000000, recentCandleSequence:[]}},
      {
        derivedStates:{structureState:'weakening', pullbackZone:supportType === '20ma' ? 'near_20ma' : 'near_50ma', setupLocationState:'usable_pullback', supportContext:'none', supportTestState:'testing', buyerControlState:'emerging', bounceState:'attempt', volumeState:'weak'},
        globalVerdict:{final_verdict:'watch', support_context:`${supportType}_support`, support_test_state:'failed', support_interaction_state:`active_${supportType}_support`, current_phase:'support_failed'}
      }
    );
    assert.strictEqual(failedSupportCoach.storyContext.support.interaction, 'failed', `${supportType}: failed support must override stale active-location interaction`);
    assert.strictEqual(failedSupportCoach.storyContext.support.currentlyActive, false, `${supportType}: failed support must be inactive`);
    assert.strictEqual(failedSupportCoach.storyContext.currentPhase, 'support_failed', `${supportType}: valid canonical failed phase must be retained`);
    assert.ok(!['early_rebound_from_20ma', 'constructive_pullback_near_20ma', 'constructive_pullback_near_50ma', 'bounce_confirmation_pending'].includes(failedSupportCoach.primaryStory.key), `${supportType}: failed support must not select an active-support rebound story`);
    assert.ok(!/support is holding|responding from support/i.test(failedSupportCoach.summaryText), `${supportType}: failed support prose must not claim holding support or a response`);
  }

  const rejectedAwayPhase = sandbox.buildCanonicalChartStoryContext({supportContext:'20ma_support', supportTestState:'held', buyerControlState:'confirmed', pullbackNear20:true, currentPrice:100, ma20:100.2, structureIntact:true, authoritativeCurrentPhase:'away_from_support'});
  assert.strictEqual(rejectedAwayPhase.currentPhase, 'at_support', 'An away phase must be rejected while authoritative support is active and in band');
  const retainedRespondingPhase = sandbox.buildCanonicalChartStoryContext({supportContext:'20ma_support', supportTestState:'held', buyerControlState:'confirmed', pullbackNear20:true, currentPrice:100, ma20:100.2, structureIntact:true, authoritativeCurrentPhase:'responding_from_support'});
  assert.strictEqual(retainedRespondingPhase.currentPhase, 'responding_from_support', 'A consistent canonical responding phase must be retained');

  const constructiveSupportOnlyCoach = sandbox.buildDeterministicChartCoach(
    {
      marketData:{price:143.9, ma20:143.4, ma50:138.4, ma200:121.8, avgVolume30d:1000000}
    },
    {
      canonicalValues:{price:143.9, ma20:143.4, ma50:138.4, ma200:121.8, volume:760000},
      trustedMarketContext:{
        avgVolume30d:1000000,
        recentCandleSequence:[
          {date:'2026-07-01', open:144.6, high:145.0, low:143.2, close:143.9, volume:760000},
          {date:'2026-06-30', open:145.7, high:146.1, low:144.1, close:144.8, volume:820000},
          {date:'2026-06-29', open:146.5, high:147.0, low:145.0, close:145.9, volume:910000},
          {date:'2026-06-28', open:142.2, high:146.8, low:141.9, close:146.5, volume:1250000}
        ]
      }
    },
    {
      derivedStates:{
        structureState:'intact',
        structureEligibility:'alive',
        pullbackZone:'near_20ma',
        setupLocationState:'supportive',
        bounceState:'none',
        volumeState:'weak',
        priceabilityState:'unpriceable'
      },
      globalVerdict:{final_verdict:'watch'}
    }
  );
  assert.notStrictEqual(constructiveSupportOnlyCoach.primaryStory.key, 'early_rebound_from_20ma', 'Near-20MA support contact alone must not be upgraded into a buyer-response story.');
  assert.notStrictEqual(constructiveSupportOnlyCoach.primaryStory.key, 'constructive_pullback_near_20ma', 'Controlled-pullback wording now requires genuine controlled-pullback evidence rather than support proximity alone.');
  assert.notStrictEqual(constructiveSupportOnlyCoach.primaryStory.key, 'pullback_still_repairing', 'Unpriceable trade maths alone must not turn an intact pullback into a repair story');
  assert.ok(!/bounce still needs confirmation|buyers have started to push price higher again|buyers have started to respond/i.test(constructiveSupportOnlyCoach.primaryStory.text), 'Support-only story must not claim that buyer response has already started');
  assert.ok(!constructiveSupportOnlyCoach.primaryStory.evidenceFactIds.includes('bounce_attempt'), 'Constructive support-only story must not claim bounce_attempt evidence');
  assert.ok(!/dynamic support|bullish continuation|confirmation candle|price action equilibrium/i.test(constructiveSupportOnlyCoach.primaryStory.text), 'Constructive support-only story should follow the show-don’t-label rule');

  const constructiveBounceCoach = sandbox.buildDeterministicChartCoach(
    {
      marketData:{price:144.5, ma20:143.6, ma50:138.4, ma200:121.8, avgVolume30d:1000000}
    },
    {
      canonicalValues:{price:144.5, ma20:143.6, ma50:138.4, ma200:121.8, volume:720000},
      trustedMarketContext:{
        avgVolume30d:1000000,
        recentCandleSequence:[
          {date:'2026-07-01', open:144.0, high:145.0, low:143.2, close:144.5, volume:720000},
          {date:'2026-06-30', open:145.6, high:146.2, low:143.8, close:144.2, volume:810000},
          {date:'2026-06-29', open:146.4, high:147.0, low:145.0, close:145.7, volume:930000},
          {date:'2026-06-28', open:142.2, high:146.8, low:141.9, close:146.5, volume:1250000}
        ]
      }
    },
    {
      derivedStates:{
        structureState:'intact',
        structureEligibility:'alive',
        pullbackZone:'near_20ma',
        setupLocationState:'supportive',
        bounceState:'attempt',
        volumeState:'weak',
        priceabilityState:'unpriceable'
      },
      globalVerdict:{final_verdict:'watch'}
    }
  );
  assert.ok(
    /buyers (?:stepped back in|have started to respond|started to respond|have started to rebound|started to rebound|are beginning to respond)|rebound|bounce/i.test(constructiveBounceCoach.primaryStory.text),
    'Constructive bounce story should explain the buyer response after the pullback'
  );
  assert.ok(
    /volume is still a bit light|move needs more proof|volume .* light|volume .* not expanded|follow-through .* missing|follow through .* missing/i.test(constructiveBounceCoach.primaryStory.text),
    'Constructive bounce story should keep weak volume or missing-confirmation as a confidence qualifier'
  );
  assert.ok(constructiveBounceCoach.primaryStory.evidenceFactIds.includes('bounce_attempt'), 'Constructive bounce story should preserve bounce_attempt evidence');
  assert.ok(!/not in the ideal support area yet|needs a clearer pullback/i.test(constructiveBounceCoach.primaryStory.text), 'Constructive bounce story must not fall back to off-level wording once the pullback has already happened');
  assert.ok(
    constructiveBounceCoach.recentStory.steps.includes('pullback_to_20ma')
      && constructiveBounceCoach.recentStory.steps.includes('buyer_response')
      && constructiveBounceCoach.recentStory.steps.includes('confirmation_needed')
      && constructiveBounceCoach.recentStory.steps.includes('weak_volume'),
    'Constructive bounce story should expose pullback, buyer-response, weak-volume, and confirmation-needed context'
  );
  assertStepDetailsUseKnownFacts(constructiveBounceCoach, 'Constructive bounce story');
  assert.strictEqual(constructiveBounceCoach.recentStory.toneMode, 'constructive_buyer_response', 'Constructive bounce story should expose a constructive tone mode');
  assert.ok(
    ['buyer_response_needs_volume_proof', 'buyer_response_needs_follow_through'].includes(constructiveBounceCoach.recentStory.confidenceMode),
    'Constructive bounce story should expose a buyer-response confidence mode'
  );
  assertDerivedSupportPresent(constructiveBounceCoach, 'confirmation_needed', 'Constructive bounce story');

  const bounceAttemptOnlyCoach = sandbox.buildDeterministicChartCoach(
    {
      marketData:{price:100.4, ma20:100.1, ma50:95.8, ma200:90, avgVolume30d:1000000}
    },
    {
      canonicalValues:{price:100.4, ma20:100.1, ma50:95.8, ma200:90, volume:1500000},
      trustedMarketContext:{
        avgVolume30d:1000000,
        recentCandleSequence:[
          {date:'2026-07-01', open:99.95, high:100.5, low:99.7, close:100.4, volume:1500000},
          {date:'2026-06-30', open:100.9, high:101.0, low:99.8, close:99.9, volume:1300000},
          {date:'2026-06-29', open:101.6, high:101.9, low:100.3, close:100.8, volume:1200000}
        ]
      }
    },
    {
      derivedStates:{
        structureState:'intact',
        structureEligibility:'alive',
        pullbackZone:'near_20ma',
        setupLocationState:'supportive',
        bounceState:'attempt',
        volumeState:'supportive',
        priceabilityState:'provisional'
      },
      globalVerdict:{final_verdict:'watch'}
    }
  );
  assert.ok(
    ['constructive_pullback_near_20ma', 'constructive_pullback_near_50ma', 'bounce_confirmation_pending', 'early_rebound_from_20ma'].includes(bounceAttemptOnlyCoach.primaryStory.key),
    'Bounce attempt near valid support should still keep a constructive support-context headline'
  );
  assert.ok(bounceAttemptOnlyCoach.primaryStory.evidenceFactIds.includes('bounce_attempt'), 'Bounce-attempt headline near support should preserve bounce_attempt evidence');

  const lowerWickOnlyCoach = sandbox.buildDeterministicChartCoach(
    {
      marketData:{price:100.2, ma20:100.0, ma50:95.8, ma200:90, avgVolume30d:1000000}
    },
    {
      canonicalValues:{price:100.2, ma20:100.0, ma50:95.8, ma200:90, volume:1500000},
      trustedMarketContext:{
        avgVolume30d:1000000,
        recentCandleSequence:[
          {date:'2026-07-01', open:100.3, high:100.6, low:99.2, close:100.2, volume:1500000},
          {date:'2026-06-30', open:100.8, high:101.0, low:99.7, close:100.4, volume:1300000},
          {date:'2026-06-29', open:101.2, high:101.6, low:100.1, close:100.9, volume:1200000}
        ]
      }
    },
    {
      derivedStates:{
        structureState:'intact',
        structureEligibility:'alive',
        pullbackZone:'near_20ma',
        setupLocationState:'supportive',
        bounceState:'none',
        volumeState:'supportive',
        priceabilityState:'provisional'
      },
      globalVerdict:{final_verdict:'watch'}
    }
  );
  assert.ok(
    ['constructive_pullback_near_20ma', 'constructive_pullback_near_50ma', 'bounce_confirmation_pending', 'early_rebound_from_20ma', 'long_lower_wick_support_test'].includes(lowerWickOnlyCoach.primaryStory.key),
    'Lower-wick-only defence near valid support should stay in either a support-context or wick-defence story'
  );
  assert.ok(
    lowerWickOnlyCoach.primaryStory.evidenceFactIds.includes('lower_rejection_wick')
      || lowerWickOnlyCoach.primaryStory.evidenceFactIds.includes('support_short_term_average')
      || lowerWickOnlyCoach.primaryStory.evidenceFactIds.includes('support_medium_term_average'),
    'Lower-wick-only headline near support should preserve either wick evidence or explicit support-context evidence'
  );
  assert.ok(
    !/buyers have started to rebound|buyers have started to respond|bounce is underway|bounce has started/i.test(lowerWickOnlyCoach.primaryStory.text),
    'Lower-wick-only defence must not claim that a buyer response is underway'
  );
  assert.ok(
    !/bounce is not ready yet|keep control again/i.test((lowerWickOnlyCoach.sections.find(section => section.key === 'what_next') || {}).text || ''),
    'Lower-wick-only what-next copy must not rely on an already-started bounce'
  );

  const bounceAndLowerWickCoach = sandbox.buildDeterministicChartCoach(
    {
      marketData:{price:100.4, ma20:100.1, ma50:95.8, ma200:90, avgVolume30d:1000000}
    },
    {
      canonicalValues:{price:100.4, ma20:100.1, ma50:95.8, ma200:90, volume:1500000},
      trustedMarketContext:{
        avgVolume30d:1000000,
        recentCandleSequence:[
          {date:'2026-07-01', open:99.95, high:100.7, low:99.2, close:100.4, volume:1500000},
          {date:'2026-06-30', open:100.9, high:101.0, low:99.8, close:99.9, volume:1300000},
          {date:'2026-06-29', open:101.6, high:101.9, low:100.3, close:100.8, volume:1200000}
        ]
      }
    },
    {
      derivedStates:{
        structureState:'intact',
        structureEligibility:'alive',
        pullbackZone:'near_20ma',
        setupLocationState:'supportive',
        bounceState:'attempt',
        volumeState:'supportive',
        priceabilityState:'provisional'
      },
      globalVerdict:{final_verdict:'watch'}
    }
  );
  assert.ok(
    ['constructive_pullback_near_20ma', 'constructive_pullback_near_50ma', 'bounce_confirmation_pending', 'early_rebound_from_20ma', 'long_lower_wick_support_test'].includes(bounceAndLowerWickCoach.primaryStory.key),
    'Combined bounce-attempt and wick defence near valid support should stay in a constructive support or wick-defence story'
  );
  assert.ok(bounceAndLowerWickCoach.primaryStory.evidenceFactIds.includes('bounce_attempt'), 'Combined bounce/defence headline near support should preserve bounce_attempt evidence');
  assert.ok(
    bounceAndLowerWickCoach.primaryStory.evidenceFactIds.includes('lower_rejection_wick')
      || bounceAndLowerWickCoach.primaryStory.evidenceFactIds.includes('support_short_term_average')
      || bounceAndLowerWickCoach.primaryStory.evidenceFactIds.includes('support_medium_term_average'),
    'Combined bounce/defence headline near support should preserve either wick or explicit support evidence'
  );

  const repairingCoach = sandbox.buildDeterministicChartCoach(
    {
      marketData:{price:96.2, ma20:98.4, ma50:101.1, ma200:90.5, avgVolume30d:1000000}
    },
    {
      canonicalValues:{price:96.2, ma20:98.4, ma50:101.1, ma200:90.5, volume:760000},
      trustedMarketContext:{
        avgVolume30d:1000000,
        recentCandleSequence:[
          {date:'2026-07-01', open:96.6, high:97.3, low:95.8, close:96.2, volume:760000},
          {date:'2026-06-30', open:98.1, high:98.4, low:96.4, close:96.8, volume:820000},
          {date:'2026-06-29', open:99.2, high:99.6, low:97.8, close:98.5, volume:910000}
        ]
      }
    },
    {
      derivedStates:{
        structureState:'weakening',
        structureEligibility:'alive',
        pullbackZone:'left_support_zone',
        setupLocationState:'off_level',
        bounceState:'none',
        volumeState:'weak',
        priceabilityState:'unpriceable'
      },
      globalVerdict:{final_verdict:'watch'}
    }
  );
  assert.ok(
    ['pullback_still_repairing', 'structure_breaking_down'].includes(repairingCoach.primaryStory.key),
    'Weakening pullbacks that have left support should stay in the repair-or-damage family before isolated candle commentary'
  );
  assert.ok(/needs repair|needs to rebuild|not settled yet|buyers have not really taken control again|still damaged|repair/i.test(repairingCoach.sections[0].text), 'Repairing pullback story should explain that the setup still needs repair');
  assert.ok(/reclaim|rebuild|repair/i.test((repairingCoach.sections.find(section => section.key === 'what_next') || {}).text || ''), 'Repairing pullback should tell the user to reclaim or rebuild before trusting it');

  const intactOffLevelCoach = sandbox.buildDeterministicChartCoach(
    {
      marketData:{price:108.4, ma20:101.1, ma50:97.2, ma200:90.6, avgVolume30d:1000000}
    },
    {
      canonicalValues:{price:108.4, ma20:101.1, ma50:97.2, ma200:90.6, volume:940000},
      trustedMarketContext:{
        avgVolume30d:1000000,
        recentCandleSequence:[
          {date:'2026-07-01', open:109.0, high:109.4, low:107.8, close:108.4, volume:940000},
          {date:'2026-06-30', open:109.4, high:109.9, low:108.3, close:109.0, volume:980000},
          {date:'2026-06-29', open:110.0, high:110.4, low:108.8, close:109.5, volume:1010000}
        ]
      }
    },
    {
      derivedStates:{
        structureState:'strong',
        structureEligibility:'alive',
        pullbackZone:'left_support_zone',
        setupLocationState:'off_level',
        bounceState:'none',
        volumeState:'weak',
        priceabilityState:'provisional'
      },
      globalVerdict:{final_verdict:'watch'}
    }
  );
  assert.strictEqual(intactOffLevelCoach.primaryStory.key, 'off_level_wait_for_clearer_support', 'Intact off-level charts should use a neutral setup-location story instead of a negative structural headline');
  assert.notStrictEqual(intactOffLevelCoach.primaryStory.key, 'pullback_still_repairing', 'Intact structure must not use the repair headline just because price recently left support');
  assert.notStrictEqual(intactOffLevelCoach.primaryStory.key, 'structure_breaking_down', 'Intact structure must not use the breakdown headline just because price is off-level');
  assert.ok(/not sitting near a support area|wait-and-see spot|clean pullback/i.test(intactOffLevelCoach.primaryStory.text), 'Neutral off-level story should explain that the setup is away from useful support');
  assert.ok(!/repair|weakening|breaking down|failed bounce|lost support/i.test(intactOffLevelCoach.primaryStory.text), 'Neutral off-level story must avoid structural damage language on intact charts');
  assert.strictEqual(intactOffLevelCoach.recentStory.steps.join('|'), 'intact_structure|off_level|wait_for_clearer_support', 'Neutral off-level story should expose the expected recent-story skeleton');
  assert.ok(Array.isArray(intactOffLevelCoach.recentStory.stepDetails) && intactOffLevelCoach.recentStory.stepDetails.some(detail => detail.key === 'off_level'), 'Neutral off-level story should expose step-level contract details');
  assert.strictEqual(intactOffLevelCoach.primaryStory.readerTest.tone, 'neutral', 'Neutral off-level story should pass the Reader Test with a neutral tone');

  const intactLostSupportCoach = sandbox.buildDeterministicChartCoach(
    {
      marketData:{price:114.6, ma20:106.2, ma50:101.4, ma200:92.3, avgVolume30d:1000000}
    },
    {
      canonicalValues:{price:114.6, ma20:106.2, ma50:101.4, ma200:92.3, volume:910000},
      trustedMarketContext:{
        avgVolume30d:1000000,
        recentCandleSequence:[
          {date:'2026-07-01', open:115.2, high:115.5, low:114.0, close:114.6, volume:910000},
          {date:'2026-06-30', open:115.8, high:116.1, low:114.7, close:115.1, volume:950000},
          {date:'2026-06-29', open:116.4, high:116.8, low:115.3, close:115.9, volume:990000}
        ]
      }
    },
    {
      derivedStates:{
        structureState:'intact',
        structureEligibility:'alive',
        pullbackZone:'none',
        setupLocationState:'lost_support',
        bounceState:'none',
        volumeState:'weak',
        priceabilityState:'provisional'
      },
      globalVerdict:{final_verdict:'watch'}
    }
  );
  assert.strictEqual(intactLostSupportCoach.primaryStory.key, 'off_level_wait_for_clearer_support', 'Intact lost-support location should use the neutral setup-location story');
  assert.notStrictEqual(intactLostSupportCoach.primaryStory.key, 'pullback_still_repairing', 'Lost-support location alone must not imply structural repair when structure is intact');
  assert.notStrictEqual(intactLostSupportCoach.primaryStory.key, 'structure_breaking_down', 'Lost-support location alone must not imply a breakdown when structure is intact');
  assert.notStrictEqual(intactLostSupportCoach.primaryStory.key, 'failed_bounce', 'Lost-support location alone must not headline failed bounce when structure is intact');
  assert.ok(/not sitting near a support area|wait-and-see spot|clean pullback/i.test(intactLostSupportCoach.primaryStory.text), 'Intact lost-support location should explain that the setup needs clearer support');
  assert.ok(!/repair|weakening|breaking down|failed bounce/i.test(intactLostSupportCoach.primaryStory.text), 'Neutral lost-support story must avoid structural damage language on intact charts');

  const intactOffLevelBounceAttemptCoach = sandbox.buildDeterministicChartCoach(
    {
      marketData:{price:112.8, ma20:105.1, ma50:100.3, ma200:91.7, avgVolume30d:1000000}
    },
    {
      canonicalValues:{price:112.8, ma20:105.1, ma50:100.3, ma200:91.7, volume:930000},
      trustedMarketContext:{
        avgVolume30d:1000000,
        recentCandleSequence:[
          {date:'2026-07-01', open:111.9, high:113.1, low:111.4, close:112.8, volume:930000},
          {date:'2026-06-30', open:113.0, high:113.4, low:111.0, close:111.8, volume:980000},
          {date:'2026-06-29', open:114.1, high:114.6, low:112.5, close:113.1, volume:1005000}
        ]
      }
    },
    {
      derivedStates:{
        structureState:'strong',
        structureEligibility:'alive',
        pullbackZone:'off_level',
        setupLocationState:'lost_support',
        bounceState:'attempt',
        volumeState:'weak',
        priceabilityState:'provisional'
      },
      globalVerdict:{final_verdict:'watch'}
    }
  );
  assert.strictEqual(intactOffLevelBounceAttemptCoach.primaryStory.key, 'off_level_wait_for_clearer_support', 'Off-level intact bounce attempts should still use the neutral setup-location story');
  assert.notStrictEqual(intactOffLevelBounceAttemptCoach.primaryStory.key, 'bounce_confirmation_pending', 'A bounce attempt away from support must not headline as bounce confirmation');
  assert.ok(/not sitting near a support area|wait-and-see spot|clean pullback|drifted away from the area where a cleaner pullback would usually set up/i.test(intactOffLevelBounceAttemptCoach.primaryStory.text), 'Off-level intact bounce attempts should still explain that support needs to become clearer');
  assert.ok(!/bounce still needs|buyers are trying to defend support/i.test(intactOffLevelBounceAttemptCoach.primaryStory.text), 'Off-level intact bounce attempts must not imply the setup is valid just because a bounce attempt exists');

  const breakdownCoach = sandbox.buildDeterministicChartCoach(
    {
      marketData:{price:82.4, ma20:88.6, ma50:92.1, ma200:104.4, avgVolume30d:1000000}
    },
    {
      canonicalValues:{price:82.4, ma20:88.6, ma50:92.1, ma200:104.4, volume:1650000},
      trustedMarketContext:{
        avgVolume30d:1000000,
        recentCandleSequence:[
          {date:'2026-07-01', open:87.9, high:88.1, low:82.0, close:82.4, volume:1650000},
          {date:'2026-06-30', open:90.4, high:90.8, low:87.3, close:88.0, volume:1410000},
          {date:'2026-06-29', open:92.1, high:92.3, low:89.4, close:90.2, volume:1230000}
        ]
      }
    },
    {
      derivedStates:{
        structureState:'broken',
        structureEligibility:'broken',
        pullbackZone:'off_level',
        setupLocationState:'lost_support',
        bounceState:'failed',
        volumeState:'active',
        priceabilityState:'unpriceable'
      },
      globalVerdict:{final_verdict:'avoid'}
    }
  );
  assert.strictEqual(breakdownCoach.primaryStory.key, 'structure_breaking_down', 'Broken structure should surface the breakdown story first');
  assert.ok(!breakdownCoach.primaryStory.evidenceFactIds.includes('failed_bounce'), 'Broken-structure breakdown story must not claim failed_bounce evidence when no failed bounce occurred');
  assert.ok(/support has given way|sellers are still controlling|sellers in charge/i.test(breakdownCoach.sections[0].text), 'Breakdown story should explain that support is failing');
  assert.ok(/rebuild a proper base/i.test((breakdownCoach.sections.find(section => section.key === 'what_next') || {}).text || ''), 'Breakdown story should tell the user to wait for a rebuild');
  assert.strictEqual(breakdownCoach.recentStory.steps.join('|'), 'broken_structure|support_lost|avoid', 'Broken structure should expose the expected recent-story skeleton');
  assert.ok(Array.isArray((breakdownCoach.sections.find(section => section.key === 'biggest_clue') || {}).evidenceFactIds) && (breakdownCoach.sections.find(section => section.key === 'biggest_clue') || {}).evidenceFactIds.includes('structure_broken'), 'Rendered Chart Story evidence should come through the recent-story contract for broken structures');
  assert.strictEqual(breakdownCoach.primaryStory.readerTest.tone, 'bad', 'Broken structure should pass the Reader Test with a negative tone');

  const failedBounceBreakdownCoach = sandbox.buildDeterministicChartCoach(
    {
      marketData:{price:89.8, ma20:92.4, ma50:96.1, ma200:108.2, avgVolume30d:1000000}
    },
    {
      canonicalValues:{price:89.8, ma20:92.4, ma50:96.1, ma200:108.2, volume:1480000},
      trustedMarketContext:{
        avgVolume30d:1000000,
        recentCandleSequence:[
          {date:'2026-07-01', open:91.6, high:92.0, low:89.4, close:89.8, volume:1480000},
          {date:'2026-06-30', open:90.7, high:92.4, low:90.3, close:91.9, volume:1320000},
          {date:'2026-06-29', open:93.6, high:93.9, low:90.8, close:91.1, volume:1260000}
        ]
      }
    },
    {
      derivedStates:{
        structureState:'weakening',
        structureEligibility:'alive',
        pullbackZone:'off_level',
        setupLocationState:'lost_support',
        bounceState:'failed',
        volumeState:'active',
        priceabilityState:'provisional'
      },
      globalVerdict:{final_verdict:'watch'}
    }
  );
  assert.strictEqual(failedBounceBreakdownCoach.primaryStory.key, 'structure_breaking_down', 'Failed bounce below key averages should still choose the breakdown story');
  assert.ok(failedBounceBreakdownCoach.primaryStory.evidenceFactIds.includes('failed_bounce'), 'Failed-bounce breakdown story should preserve failed_bounce evidence');

  const intactOffLevelFailedBounceCoach = sandbox.buildDeterministicChartCoach(
    {
      marketData:{price:108.7, ma20:101.2, ma50:97.4, ma200:90.8, avgVolume30d:1000000}
    },
    {
      canonicalValues:{price:108.7, ma20:101.2, ma50:97.4, ma200:90.8, volume:1030000},
      trustedMarketContext:{
        avgVolume30d:1000000,
        recentCandleSequence:[
          {date:'2026-07-01', open:109.6, high:110.0, low:108.2, close:108.7, volume:1030000},
          {date:'2026-06-30', open:110.2, high:110.5, low:108.9, close:109.5, volume:1080000},
          {date:'2026-06-29', open:110.8, high:111.2, low:109.7, close:110.4, volume:1110000}
        ]
      }
    },
    {
      derivedStates:{
        structureState:'intact',
        structureEligibility:'alive',
        pullbackZone:'left_support_zone',
        setupLocationState:'off_level',
        bounceState:'failed',
        volumeState:'active',
        priceabilityState:'provisional'
      },
      globalVerdict:{final_verdict:'watch'}
    }
  );
  assert.notStrictEqual(intactOffLevelFailedBounceCoach.primaryStory.key, 'failed_bounce', 'Intact structure must not use failed_bounce as the primary story');
  assert.notStrictEqual(intactOffLevelFailedBounceCoach.primaryStory.key, 'structure_breaking_down', 'Intact structure must not use a breakdown headline just because one bounce failed');
  assert.notStrictEqual(intactOffLevelFailedBounceCoach.primaryStory.key, 'pullback_still_repairing', 'Intact structure must not use a repair headline just because one bounce failed off-level');
  assert.strictEqual(intactOffLevelFailedBounceCoach.primaryStory.key, 'off_level_wait_for_clearer_support', 'Intact off-level failed-bounce charts should use the neutral setup-location story');
  assert.ok(!/failed bounce|faded quickly/i.test(intactOffLevelFailedBounceCoach.primaryStory.text), 'Intact off-level failed-bounce story must not headline failed-bounce wording');
  const intactFailedBounceSupportSection = intactOffLevelFailedBounceCoach.sections.find(section => section.key === 'weakness');
  if(intactFailedBounceSupportSection){
    assert.notStrictEqual(intactFailedBounceSupportSection.key, 'biggest_clue', 'Failed-bounce weakness, when rendered, must stay subordinate to the neutral headline');
  }

  const intactFailedBounceCoach = sandbox.buildDeterministicChartCoach(
    {
      marketData:{price:96.4, ma20:99.1, ma50:96.8, ma200:88.3, avgVolume30d:1000000}
    },
    {
      canonicalValues:{price:96.4, ma20:99.1, ma50:96.8, ma200:88.3, volume:1020000},
      trustedMarketContext:{
        avgVolume30d:1000000,
        recentCandleSequence:[
          {date:'2026-07-01', open:97.3, high:98.0, low:96.1, close:96.4, volume:1020000},
          {date:'2026-06-30', open:98.6, high:99.4, low:97.0, close:97.6, volume:1080000},
          {date:'2026-06-29', open:99.8, high:100.3, low:98.1, close:98.9, volume:1110000}
        ]
      }
    },
    {
      derivedStates:{
        structureState:'intact',
        structureEligibility:'alive',
        pullbackZone:'near_50ma',
        setupLocationState:'supportive',
        bounceState:'failed',
        volumeState:'active',
        priceabilityState:'provisional'
      },
      globalVerdict:{final_verdict:'watch'}
    }
  );
  assert.notStrictEqual(intactFailedBounceCoach.primaryStory.key, 'structure_breaking_down', 'Intact structure must not use a breakdown headline just because one bounce failed below the short-term averages');
  assert.notStrictEqual(intactFailedBounceCoach.primaryStory.key, 'early_rebound_from_20ma', 'A failed bounce without renewed buyer proof must not headline as an active rebound.');
  assert.ok(!/buyers have started to push price higher again|buyers have started to respond|controlled pullback/i.test(intactFailedBounceCoach.primaryStory.text), 'Intact failed-bounce charts must not borrow constructive buyer-response wording without the required support-control evidence.');

  const structureBrokenOnlyCoach = sandbox.buildDeterministicChartCoach(
    {
      marketData:{price:81.7, ma20:87.9, ma50:91.4, ma200:103.8, avgVolume30d:1000000}
    },
    {
      canonicalValues:{price:81.7, ma20:87.9, ma50:91.4, ma200:103.8, volume:1520000},
      trustedMarketContext:{
        avgVolume30d:1000000,
        recentCandleSequence:[
          {date:'2026-07-01', open:84.3, high:84.6, low:81.1, close:81.7, volume:1520000},
          {date:'2026-06-30', open:86.5, high:86.9, low:83.8, close:84.2, volume:1370000},
          {date:'2026-06-29', open:88.4, high:88.8, low:85.9, close:86.4, volume:1190000}
        ]
      }
    },
    {
      derivedStates:{
        structureState:'broken',
        structureEligibility:'broken',
        pullbackZone:'off_level',
        setupLocationState:'lost_support',
        bounceState:'none',
        volumeState:'active',
        priceabilityState:'provisional'
      },
      globalVerdict:{final_verdict:'avoid'}
    }
  );
  assert.strictEqual(structureBrokenOnlyCoach.primaryStory.key, 'structure_breaking_down', 'Broken structure should still choose the breakdown story without a failed bounce');
  assert.ok(!structureBrokenOnlyCoach.primaryStory.evidenceFactIds.includes('failed_bounce'), 'Broken-structure-only story must not claim failed_bounce evidence');
  assert.ok(/support has given way|sellers are still controlling|sellers in charge/i.test(structureBrokenOnlyCoach.primaryStory.text), 'Broken-structure-only story should stay focused on support failing');
  assert.ok(!/failed bounce/i.test(structureBrokenOnlyCoach.primaryStory.text), 'Broken-structure-only copy must not imply a failed bounce occurred');

  const nonStructuralAvoidCoach = sandbox.buildDeterministicChartCoach(
    {
      marketData:{price:130.2, ma20:128.7, ma50:123.9, ma200:111.1, avgVolume30d:1000000}
    },
    {
      canonicalValues:{price:130.2, ma20:128.7, ma50:123.9, ma200:111.1, volume:890000},
      trustedMarketContext:{
        avgVolume30d:1000000,
        recentCandleSequence:[
          {date:'2026-07-01', open:130.3, high:130.8, low:129.2, close:130.2, volume:890000},
          {date:'2026-06-30', open:131.2, high:131.4, low:129.7, close:130.4, volume:910000},
          {date:'2026-06-29', open:131.6, high:132.0, low:130.5, close:130.9, volume:950000}
        ]
      }
    },
    {
      derivedStates:{
        structureState:'intact',
        structureEligibility:'alive',
        pullbackZone:'near_20ma',
        setupLocationState:'supportive',
        bounceState:'none',
        volumeState:'weak',
        priceabilityState:'unpriceable'
      },
      globalVerdict:{final_verdict:'avoid'}
    }
  );
  assert.notStrictEqual(nonStructuralAvoidCoach.primaryStory.key, 'structure_breaking_down', 'Avoid verdict alone must not force a breakdown story when structure is still intact');
  assert.ok(!nonStructuralAvoidCoach.primaryStory.evidenceFactIds.includes('bounce_attempt'), 'Constructive pullback story should not claim a bounce attempt when bounce state is absent');

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
          label:'Chart Story',
          icon:'🟢',
          text:'AI should not be able to change this primary story.',
          evidenceFactIds:['fake_fact'],
          confidence:0.2,
          rankReason:'ai_override_attempt'
        },
        source:'ai_chart_coach',
        sections:[
          {key:'volume', icon:'📊', label:'Volume', text:'Volume was unusually light, so the move still needs stronger backing.', confidence:0.61, source:'ai_chart_coach'},
          {key:'biggest_clue', icon:'🟢', label:'Chart Story', text:'AI wording should only polish this sentence.', confidence:0.82, source:'ai_chart_coach', teachingFocus:false},
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
          label:'Chart Story',
          icon:'🟢',
          text:'AI should not be able to change this primary story.',
          evidenceFactIds:['fake_fact'],
          confidence:0.2,
          rankReason:'ai_override_attempt'
        },
        source:'ai_chart_coach',
        sections:[
          {key:'volume', icon:'📊', label:'Volume', text:'Volume was unusually light, so the move still needs stronger backing.', confidence:0.61, source:'ai_chart_coach'},
          {key:'biggest_clue', icon:'🟢', label:'Chart Story', text:'AI wording should only polish this sentence.', confidence:0.82, source:'ai_chart_coach', teachingFocus:false},
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
  assert.strictEqual((mergedAiCoach.chartCoach.diagnostics.storyContract && mergedAiCoach.chartCoach.diagnostics.storyContract.steps || []).join('|'), (mergedAiCoach.chartCoach.recentStory.steps || []).join('|'), 'Merged AI Chart Coach diagnostics should preserve the same story spine as the rendered model');
  assert.strictEqual(mergedAiCoach.chartCoach.primaryStory.key, deterministicBounceCoach.primaryStory.key, 'AI-supplied Chart Coach must not change the deterministic primary story');
  assert.strictEqual((mergedAiCoach.chartCoach.sections.find(section => section.key === 'biggest_clue') || {}).text, (deterministicBounceCoach.sections.find(section => section.key === 'biggest_clue') || {}).text, 'AI-supplied Chart Coach must not override the deterministic Chart Story text');
  assert.strictEqual((mergedAiCoach.chartCoach.sections.find(section => section.key === 'what_next') || {}).text, (deterministicBounceCoach.sections.find(section => section.key === 'what_next') || {}).text, 'AI-supplied Chart Coach must not override deterministic what-next guidance');

  const twoStepAiCoach = sandbox.selectReviewAiSummary(
    bounceRecord,
    {
      chartCoach:{
        primaryStory:{
          key:'openai_two_step_primary_story',
          label:'Chart Story',
          icon:'🧭',
          text:'The main event is that buyers tried to bounce, but the move is still stuck below the nearer averages.',
          evidenceFactIds:['openai_two_step_narrative'],
          confidence:0.82,
          rankReason:'two_step_chart_guru'
        },
        source:'openai_two_step_chart_guru',
        renderVersion:'chart-guru-v3',
        diagnostics:{
          meta:{
            deterministicContractVersion:'chart-guru-contract-v3',
            interpretationPromptVersion:'chart-guru-interpretation-v2',
            finalPromptVersion:'chart-guru-final-v2',
            renderVersion:'chart-guru-v3',
            narrationSource:'openai_narrator'
          }
        },
        sections:[
          {key:'biggest_clue', icon:'🧭', label:'Chart Story', text:'The main event is that buyers tried to bounce, but the move is still stuck below the nearer averages.', confidence:0.82, source:'openai_two_step_chart_guru'},
          {key:'why_it_matters', icon:'🧠', label:'Why it matters', text:'That matters because a bounce can fail when price cannot repair the nearer damage.', confidence:0.78, source:'openai_two_step_chart_guru'},
          {key:'setup_location', icon:'📍', label:'Setup location', text:'Price is caught between the nearer trend guides and the longer-term support area.', confidence:0.76, source:'openai_two_step_chart_guru'},
          {key:'learning_point', icon:'💡', label:'Learning point', text:'Early bounces are stronger when they reclaim nearby resistance, not just bounce for one candle.', confidence:0.8, source:'openai_two_step_chart_guru', teachingFocus:true},
          {key:'what_next', icon:'🎯', label:'What next?', text:'Watch for firmer follow-through that starts reclaiming the nearby averages.', confidence:0.78, source:'openai_two_step_chart_guru'}
        ],
        summaryText:'🧭 Chart Story: The main event is that buyers tried to bounce, but the move is still stuck below the nearer averages.'
      }
    },
    {
      derivedStates:sandbox.analysisDerivedStatesFromRecord(bounceRecord),
      globalVerdict:bounceRecord._globalVerdict
    }
  );
  assert.strictEqual(twoStepAiCoach.source, 'openai_two_step_chart_guru', 'Review should accept a usable two-step Chart Guru model directly');
  assert.strictEqual(twoStepAiCoach.chartCoach.source, 'openai_two_step_chart_guru', 'Review should keep the two-step Chart Guru model as the visible source');
  assert.ok(/buyers tried to bounce/i.test(twoStepAiCoach.text), 'Two-step Chart Guru text should remain visible instead of being replaced by deterministic fallback');

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
  ['biggest_clue', 'why_it_matters', 'volume', 'learning_point', 'what_next'].forEach(key => {
    assert.ok(amatKeys.includes(key), `AMAT-style Chart Guru should include ${key}`);
  });
  assert.strictEqual(amatKeys[0], 'biggest_clue', 'AMAT-style strong upside acceleration should still lead with the Chart Story');
  const amatClue = amatRead.chartCoach.sections.find(section => section.key === 'biggest_clue');
  const amatWhy = amatRead.chartCoach.sections.find(section => section.key === 'why_it_matters');
  const amatVolume = amatRead.chartCoach.sections.find(section => section.key === 'volume');
  const amatLearning = amatRead.chartCoach.sections.find(section => section.key === 'learning_point');
  const amatNext = amatRead.chartCoach.sections.find(section => section.key === 'what_next');
  assert.strictEqual(amatRead.chartCoach.primaryStory.key, 'strong_upside_acceleration', 'AMAT-style chart should choose strong upside acceleration as the deterministic primary story');
  assert.ok(/buyers have been clearly in control|buyers have driven this move higher/i.test(amatClue.text), 'AMAT-style Chart Guru should explain the primary acceleration story first');
  assert.ok(/become easier to mis-time|already extended/i.test(amatWhy.text), 'AMAT-style Chart Guru should explain why the strong run matters');
  assert.ok(/Volume is active, which makes the move more believable|Volume is active, which makes the move more convincing/i.test(amatVolume.text), 'AMAT-style Chart Guru should explain supportive volume');
  assert.ok(/higher volume are usually more believable|quiet volume/i.test(amatLearning.text), 'Chart Guru should include one learning point tied to the primary story');
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
    'preserveManualConfirmIdentityReadFacts',
    'recoverChartPipelineReadFacts',
    'normalizeChartPipelineForRender',
    'buildChartPipelineFromVerification',
    'mergePromotedChartPipelineIdentity',
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

  const existingVerifiedPipeline = {
    ticker:'AMAT',
    imageId:'chart-amat-1',
    requestId:'request-new',
    phase:'analysis_running',
    expectedFacts:{ticker:'AMAT', timeframe:'1D', price:186.4, ma20:180.2, ma50:174.1, ma200:156.8},
    readFacts:{ticker:'AMAT', timeframe:'1D', price:186.4, ma20:180.2, ma50:174.1, ma200:156.8},
    evidence:['Read ticker AMAT from the chart image.'],
    aiAllowed:true,
    manualConfirmed:false,
    verifiedMatch:true,
    mismatch:false,
    hasFacts:true
  };
  const promotedWeakerPipeline = sandbox.buildChartPipelineFromVerification(record, {
    imageId:'chart-amat-1',
    requestId:'request-new',
    source:'chart_pipeline_quick_check',
    analysis:{
      visible_ticker:'',
      visible_timeframe:'',
      visible_latest_price:null,
      ma20_visible:false,
      ma50_visible:false,
      ma200_visible:false
    },
    chartAssessorInput:{},
    chartImageSource:{sourceKind:'review_chart'}
  });
  const mergedPreservedPipeline = sandbox.mergePromotedChartPipelineIdentity(
    record,
    existingVerifiedPipeline,
    promotedWeakerPipeline,
    {imageId:'chart-amat-1', requestId:'request-new'}
  );
  assert.strictEqual(mergedPreservedPipeline.phase, 'analysis_running', 'Weaker post-AI chart facts must not demote an already verified pipeline');
  assert.strictEqual(mergedPreservedPipeline.verifiedMatch, true, 'Weaker post-AI chart facts must preserve verified match');
  assert.strictEqual(mergedPreservedPipeline.mismatch, false, 'Weaker post-AI chart facts must not create a synthetic mismatch');
  assert.strictEqual(String(mergedPreservedPipeline.readFacts && mergedPreservedPipeline.readFacts.ticker || ''), 'AMAT', 'Weaker post-AI chart facts must preserve the verified ticker');
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
    },
    repairCanonicalNarrationContractPhase(contract){
      return contract;
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(extractConstAssignment('CHART_GURU_MOJIBAKE_REPAIRS'), sandbox, {filename:'app.js#CHART_GURU_MOJIBAKE_REPAIRS'});
  vm.runInContext(extractConstAssignment('CHART_GURU_SECTION_DISPLAY'), sandbox, {filename:'app.js#CHART_GURU_SECTION_DISPLAY'});
  [
    'repairChartGuruStoredText',
    'normalizeChartGuruSectionKey',
    'chartGuruSectionDisplayForKey'
  ].forEach(name => {
    vm.runInContext(extractFunctionSource(appSource, name), sandbox, {filename:`app.js#${name}`});
  });
  vm.runInContext(extractFunctionSource(appSource, 'normalizeAnalysisResponse'), sandbox, {filename:'app.js#normalizeAnalysisResponse'});

  const normalized = sandbox.normalizeAnalysisResponse({
    parseWarning:'Model response was malformed JSON. Deterministic chart summary used instead.',
    chartGuruOpenAiFallbackReason:'final_prose_request_failed',
    chartGuruOpenAiValidationErrors:['Missing required field: whatNext.'],
    chartGuruOpenAiError:'Final prose exploded.',
    candleStructureAnalysis:{
      summary:'Price is below the 20MA and 50MA but above the 200MA. Recent candles show a bounce attempt, but follow-through is still missing.'
    },
    tradePlanCommentary:{
      summary:'Estimated maths exist, but confirmation is still missing before any entry is valid.'
    },
    chartCoach:{
      primaryStory:{key:'openai_two_step_primary_story', label:'Chart Story', icon:'🧭', text:'AI chart story', confidence:0.82, rankReason:'two_step'},
      recentStory:{key:'deterministic_recent_story', steps:['pullback', 'bounce_attempt']},
      diagnostics:{
        meta:{
          deterministicContractVersion:'chart-guru-contract-v3',
          interpretationPromptVersion:'chart-guru-interpretation-v2',
          finalPromptVersion:'chart-guru-final-v2',
          renderVersion:'chart-guru-v3',
          narrationSource:'openai_narrator'
        },
        storyContract:{steps:['pullback', 'bounce_attempt']}
      },
      sections:[{key:'biggest_clue', icon:'🧭', label:'Chart Story', text:'AI chart story', confidence:0.82, source:'openai_two_step_chart_guru'}],
      summaryText:'🧭 Chart Story: AI chart story',
      source:'openai_two_step_chart_guru',
      renderVersion:'chart-guru-v3',
      explanationFacts:['openai_two_step_narrative']
    },
    canonicalValues:{price:200.09, ma20:205.74, ma50:209.99, ma200:190.84},
    trustedMarketContext:{currentPrice:200.09, ma20:205.74, ma50:209.99, ma200:190.84}
  });

  assert.strictEqual(normalized.parseWarning, 'Model response was malformed JSON. Deterministic chart summary used instead.', 'Client normalizer should preserve parseWarning without throwing');
  assert.strictEqual(normalized.legacy_summary, '', 'Client normalizer should not invent a legacy summary when only structured fields exist');
  assert.strictEqual(normalized.candleStructureAnalysis.summary, 'Price is below the 20MA and 50MA but above the 200MA. Recent candles show a bounce attempt, but follow-through is still missing.', 'Structured candle summary should survive client normalization');
  assert.ok(normalized.chartCoach && Array.isArray(normalized.chartCoach.sections), 'Client normalizer should preserve structured Chart Coach data');
  assert.strictEqual(normalized.chartCoach.sections.length, 1, 'Client normalizer should preserve supplied Chart Guru sections');
  assert.strictEqual(normalized.chartCoach.primaryStory.key, 'openai_two_step_primary_story', 'Client normalizer should preserve supplied Chart Guru primary story');
  assert.strictEqual(normalized.chartCoach.recentStory.key, 'deterministic_recent_story', 'Client normalizer should preserve recent-story metadata when supplied');
  assert.strictEqual((normalized.chartCoach.diagnostics && normalized.chartCoach.diagnostics.storyContract && normalized.chartCoach.diagnostics.storyContract.steps || []).join('|'), 'pullback|bounce_attempt', 'Client normalizer should preserve diagnostics metadata when supplied');
  assert.strictEqual(normalized.chartGuruOpenAiFallbackReason, 'final_prose_request_failed', 'Client normalizer should preserve Chart Guru fallback reason');
  assert.strictEqual((normalized.chartGuruOpenAiValidationErrors || []).join('|'), 'Missing required field: whatNext.', 'Client normalizer should preserve Chart Guru validation errors');
  assert.strictEqual(normalized.chartGuruOpenAiError, 'Final prose exploded.', 'Client normalizer should preserve Chart Guru fallback error text');
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
  assert.ok(appSource.includes("const title = '🧘 Chart Guru';"), 'Review Chart Guru helper source should pin the live title string');

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
    analysisState:{normalizedAnalysis:{chartRead:{text:'🟢 Chart Story: Buyers are in control.', markup:'[guru-markup]'}}}
  });
  assertGuruDisplay(normalizedSuccess, '🟢 Chart Story: Buyers are in control.');
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
  assert(serverSource.includes('buildProductionChartGuruInterpretationInstructions()'), 'Production handler should use the production interpretation prompt');
  assert(serverSource.includes('buildProductionChartGuruFinalInstructions()'), 'Production handler should use the production final prose prompt');
  assert(!serverSource.includes('scripts/lib/chart-guru-openai-harness'), 'Production handler must not import the dev-only harness helper');
  assert(!serverSource.includes('buildOneStepInstructions()'), 'One-step prompt mode must remain out of the production handler');
  [
    'CAT_failed_first_bounce_20ma',
    'ALLY_first_test_of_50ma',
    'UPS_constructive_pullback_no_confirmation',
    'VRT_diminishing_quality',
    'GEV_constructive_but_early_monitor_watch'
  ].forEach(forbidden => {
    assert(!serverSource.includes(forbidden), `Production handler must not hardcode fixture-specific id ${forbidden}`);
  });
  assert(appSource.includes('function buildDeterministicChartCoach'), 'App must include deterministic Chart Coach helper');
  assert(appSource.includes('function selectReviewAiSummary'), 'App must include the Review AI summary authority selector');
  assert(appSource.includes('function buildReviewChartGuruDisplay'), 'App must expose a dedicated Review Chart Guru display helper');
  assert(appSource.includes('const canonicalPhaseDecisionCoach = chartGuruDisplayState.chartCoach'), 'Review Advanced Debug must read the selected Chart Guru display model, not only the raw server narration payload');
  assert(appSource.includes('canonicalPhaseDecisionDebugMarkup(analysisState.normalizedAnalysis, canonicalPhaseDecisionCoach)'), 'Review Advanced Debug must render canonical phase instrumentation from the selected display model');
  assert(appSource.includes("const title = '🧘 Chart Guru';"), 'Review helper source should pin the Chart Guru title');
  assert(!appSource.includes('primaryTeachingSection'), 'Dead legacy Chart Guru teaching-section variable should be removed');
  assert(!appSource.includes('const finalizedSections = finalizeChartCoachSections(rankedSections);'), 'Dead finalizedSections recomputation should be removed');
  assert(!appSource.includes('aiSummaryConflictDetected'), 'Dead aiSummaryConflictDetected review state should be removed');
  assert(!appSource.includes('Chart Coach'), 'Review source should not reintroduce the legacy Chart Coach label');
  assert(!appSource.includes('AI Summary'), 'Review source should not reintroduce the legacy AI Summary label');
  assert(!appSource.includes('Chart Guru Notes'), 'Review should not expose legacy Chart Guru Notes user-facing copy');
}

async function run(){
  // This harness asserts the initial two-step request sequence, before any stateful Chart Guru regression advances it.
  await runNetlifyCanonicalizationRegression();
  runDeterministicCandleFallbackRegression();
  runReviewPresentationRegression();
  runPresentationModelRegression();
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
