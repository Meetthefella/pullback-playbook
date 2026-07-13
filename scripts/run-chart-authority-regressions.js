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

  const {handler} = require(modulePath);
  const invokeHandler = async sequence => {
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
          trustedMarketContext
        },
        prompt:'Return JSON only.'
      })
    });
    return {response, fetchCalls, body:JSON.parse(response.body)};
  };

  const successRun = await invokeHandler([
    {payload:{output_text:JSON.stringify(aiPayload)}},
    {payload:{output_text:JSON.stringify(traderInterpretation)}},
    {payload:{output_text:JSON.stringify(finalNarrative)}}
  ]);

  assert.strictEqual(successRun.fetchCalls.length, 3, 'Expected analysis request plus two-step Chart Guru requests');
  assert.strictEqual(successRun.response.statusCode, 200, 'Handler should succeed');
  const firstRequest = JSON.parse(successRun.fetchCalls[0].options.body || '{}');
  const secondRequest = JSON.parse(successRun.fetchCalls[1].options.body || '{}');
  const thirdRequest = JSON.parse(successRun.fetchCalls[2].options.body || '{}');
  const body = successRun.body;
  assert.strictEqual(secondRequest.text && secondRequest.text.format && secondRequest.text.format.name, 'chart_guru_trader_interpretation', 'Production Chart Guru should call the interpretation step before final prose');
  assert.strictEqual(thirdRequest.text && thirdRequest.text.format && thirdRequest.text.format.name, 'chart_guru_final_prose', 'Production Chart Guru should use the final prose schema after interpretation');
  assert.ok(/Return extractedFromImage, trustedMarketContext, canonicalValues/i.test(String(firstRequest.instructions || '')), 'The canonical analysis request should remain intact');
  assert.ok(!/Return extractedFromImage, trustedMarketContext, canonicalValues/i.test(String(thirdRequest.instructions || '')), 'Final prose request should not carry the full non-prose output contract');
  const finalPromptText = (((thirdRequest.input || [])[0] || {}).content || []).find(part => part && part.type === 'input_text');
  assert.ok(finalPromptText && /dominantEvent/.test(String(finalPromptText.text || '')), 'Final prose prompt should receive traderInterpretation');
  assert.strictEqual(body.analysis.canonicalValues.price, 200.09, 'Canonical price must come from trusted market context');
  assert.strictEqual(body.analysis.canonicalValues.ma20, 205.74, 'Canonical 20MA must come from trusted market context');
  assert.strictEqual(body.analysis.canonicalValues.ma50, 209.99, 'Canonical 50MA must come from trusted market context');
  assert.strictEqual(body.analysis.canonicalValues.ma200, 190.84, 'Canonical 200MA must come from trusted market context');
  assert.strictEqual(body.analysis.trustedMarketContext.currentPrice, 200.09, 'Trusted context should be preserved');
  assert.strictEqual(body.analysis.visible_ma20, null, 'Unreadable image MA should remain unreadable in extracted image facts');
  assert.strictEqual(
    body.analysis.coach_summary,
    finalNarrative.chartStory,
    'Summary should now come from the validated two-step Chart Guru prose'
  );
  assert.ok(body.analysis.traderInterpretation && /early repair attempt/i.test(body.analysis.traderInterpretation.traderRead || ''), 'Analysis should preserve the intermediate trader interpretation');
  assert.ok(body.analysis.chartGuruNarrative && /nearby averages/i.test(body.analysis.chartGuruNarrative.whatNext || ''), 'Analysis should preserve the final two-step narrative payload');
  assert.strictEqual(body.analysis.chartCoach && body.analysis.chartCoach.source, 'openai_two_step_chart_guru', 'Two-step success should populate a renderable Chart Guru model');
  assert.ok(Array.isArray(body.analysis.chartCoach && body.analysis.chartCoach.sections) && body.analysis.chartCoach.sections.some(section => section.key === 'setup_location'), 'Two-step success should populate the visible section model');
  assert.strictEqual(body.analysis.chartCoach && body.analysis.chartCoach.recentStory && body.analysis.chartCoach.recentStory.key, 'openai_two_step_narrative', 'Two-step success should emit broader recentStory metadata server-side');
  assert.ok(Array.isArray(body.analysis.chartCoach && body.analysis.chartCoach.diagnostics && body.analysis.chartCoach.diagnostics.priorityOrder), 'Two-step success should emit chartCoach diagnostics server-side');
  assert.strictEqual(body.analysis.chartGuruOpenAiFallbackReason, '', 'Successful two-step Chart Guru should not set a fallback reason');

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

  const interpretationFailureRun = await invokeHandler([
    {payload:{output_text:JSON.stringify(aiPayload)}},
    {ok:false, status:500, payload:{error:{message:'Interpretation exploded'}}}
  ]);
  assert.strictEqual(interpretationFailureRun.response.statusCode, 200, 'Interpretation-stage failure should degrade to deterministic 200');
  assert.strictEqual(interpretationFailureRun.body.analysis.chartGuruOpenAiFallbackReason, 'interpretation_request_failed', 'Interpretation-stage failure should record a specific fallback reason');
  assert.strictEqual(Array.isArray(interpretationFailureRun.body.analysis.chartCoach.sections) ? interpretationFailureRun.body.analysis.chartCoach.sections.length : -1, 0, 'Interpretation-stage failure should leave Chart Guru to deterministic fallback');

  const interpretationMalformedRun = await invokeHandler([
    {payload:{output_text:JSON.stringify(aiPayload)}},
    {payload:{output_text:'{"dominantEvent":"broken"'}}
  ]);
  assert.strictEqual(interpretationMalformedRun.response.statusCode, 200, 'Malformed interpretation JSON should degrade to deterministic 200');
  assert.strictEqual(interpretationMalformedRun.body.analysis.chartGuruOpenAiFallbackReason, 'interpretation_json_parse_failed', 'Malformed interpretation JSON should record a parse fallback reason');

  const finalFailureRun = await invokeHandler([
    {payload:{output_text:JSON.stringify(aiPayload)}},
    {payload:{output_text:JSON.stringify(traderInterpretation)}},
    {ok:false, status:500, payload:{error:{message:'Final prose exploded'}}}
  ]);
  assert.strictEqual(finalFailureRun.response.statusCode, 200, 'Final-prose failure should degrade to deterministic 200');
  assert.strictEqual(finalFailureRun.body.analysis.chartGuruOpenAiFallbackReason, 'final_prose_request_failed', 'Final-prose failure should record a specific fallback reason');
  assert.strictEqual(Array.isArray(finalFailureRun.body.analysis.chartCoach.sections) ? finalFailureRun.body.analysis.chartCoach.sections.length : -1, 0, 'Final-prose failure should leave Chart Guru to deterministic fallback');

  const finalMalformedRun = await invokeHandler([
    {payload:{output_text:JSON.stringify(aiPayload)}},
    {payload:{output_text:JSON.stringify(traderInterpretation)}},
    {payload:{output_text:'{"chartStory":"broken"'}}
  ]);
  assert.strictEqual(finalMalformedRun.response.statusCode, 200, 'Malformed final prose JSON should degrade to deterministic 200');
  assert.strictEqual(finalMalformedRun.body.analysis.chartGuruOpenAiFallbackReason, 'final_prose_json_parse_failed', 'Malformed final prose JSON should record a parse fallback reason');
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
    'chartCoachRecentColorRun',
    'chartCoachLargeBodyRun',
    'chartGuruDominantEventLabel',
    'chartGuruBuyerResponsePresent',
    'chartGuruControlledPullbackPresent',
    'chartGuruVolumeParticipationLabel',
    'chartGuruRecentSupportType',
    'chartGuruRecentSupportResponsePresent',
    'chartGuruSemanticEnvelopeFromStory',
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
    'canonicalCandleContext',
    'deterministicCandleStructureSummary',
    'sanitizeChartCoachForDisplay',
    'chartGuruNarrationSourceLabel',
    'chartGuruChartCoachFreshness',
    'chartGuruNarrationSourceForAnalysis',
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
  assert(appSource.includes("const title = '🧘 Chart Guru';"), 'Review helper source should pin the Chart Guru title');
  assert(!appSource.includes('primaryTeachingSection'), 'Dead legacy Chart Guru teaching-section variable should be removed');
  assert(!appSource.includes('const finalizedSections = finalizeChartCoachSections(rankedSections);'), 'Dead finalizedSections recomputation should be removed');
  assert(!appSource.includes('aiSummaryConflictDetected'), 'Dead aiSummaryConflictDetected review state should be removed');
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
