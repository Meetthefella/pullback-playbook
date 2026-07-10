const corsHeaders = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const MAX_CHART_DATA_URL_LENGTH = 6 * 1024 * 1024;
const OPENAI_TIMEOUT_MS = 45000;
const RETRYABLE_STATUSES = new Set([408, 409, 429, 500, 502, 503, 504]);
const CHART_GURU_PRIMARY_STORY_ICON = '🧭';
const CHART_GURU_RENDER_VERSION = 'chart-guru-v1';
const INTERPRETATION_REQUIRED_FIELDS = [
  'dominantEvent',
  'eventSequence',
  'supportSemantic',
  'buyerResponseSemantic',
  'confirmationSemantic',
  'traderInterpretation',
  'currentRisk',
  'nextSignal'
];
const FINAL_PROSE_REQUIRED_FIELDS = [
  'chartStory',
  'whyItMatters',
  'setupLocation',
  'learningPoint',
  'whatNext'
];
const TRADER_INTERPRETATION_SCHEMA = {
  type:'object',
  additionalProperties:false,
  required:INTERPRETATION_REQUIRED_FIELDS,
  properties:{
    dominantEvent:{type:'string'},
    dominantEventKey:{type:'string'},
    supportSemantic:{type:'string'},
    buyerResponseSemantic:{type:'string'},
    confirmationSemantic:{type:'string'},
    eventSequence:{
      type:'array',
      items:{type:'string'}
    },
    traderInterpretation:{type:'string'},
    currentRisk:{type:'string'},
    nextSignal:{type:'string'},
    whatChanged:{type:'string'},
    traderRead:{type:'string'},
    riskToWatch:{type:'string'},
    nextUsefulSignal:{type:'string'}
  }
};
const FINAL_PROSE_SCHEMA = {
  type:'object',
  additionalProperties:false,
  required:FINAL_PROSE_REQUIRED_FIELDS,
  properties:{
    chartStory:{type:'string'},
    whyItMatters:{type:'string'},
    setupLocation:{type:'string'},
    learningPoint:{type:'string'},
    whatNext:{type:'string'}
  }
};

function jsonResponse(statusCode, body){
  return {
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify(body)
  };
}

function extractOutputText(payload){
  if(typeof payload?.output_text === 'string' && payload.output_text.trim()){
    return payload.output_text.trim();
  }

  const output = Array.isArray(payload?.output) ? payload.output : [];
  for(const item of output){
    const content = Array.isArray(item?.content) ? item.content : [];
    for(const part of content){
      if(typeof part?.text === 'string' && part.text.trim()){
        return part.text.trim();
      }
      if(typeof part?.text?.value === 'string' && part.text.value.trim()){
        return part.text.value.trim();
      }
    }
  }

  return '';
}

function extractOpenAiErrorMessage(payload){
  if(typeof payload?.error?.message === 'string' && payload.error.message.trim()){
    return payload.error.message.trim();
  }
  return '';
}

function sleep(ms){
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildRequestBody(model, instructions, content, maxOutputTokens = 1000){
  return {
    model,
    instructions,
    input: [{ role: 'user', content }],
    text: {
      format: {
        type: 'json_object'
      }
    },
    max_output_tokens: maxOutputTokens
  };
}

function buildStrictSchemaRequestBody(model, instructions, prompt, schemaName, schema, maxOutputTokens = 600){
  return {
    model,
    instructions,
    input:[{
      role:'user',
      content:[{
        type:'input_text',
        text:String(prompt || '')
      }]
    }],
    text:{
      format:{
        type:'json_schema',
        name:schemaName,
        strict:true,
        schema
      }
    },
    temperature:0.2,
    max_output_tokens:maxOutputTokens
  };
}

function buildVerificationOnlyContent(payload = {}, chartRef = null){
  const verificationContext = {
    mode: 'chart_identity_verification',
    review_ticker: normaliseString(payload?.ticker, ''),
    chart_attached: payload?.chartAttached === true,
    chart_file_name: normaliseString(payload?.chartFileName, ''),
    image_dimensions: chartRef && typeof chartRef === 'object'
      ? {
        width: Number.isFinite(Number(chartRef.width)) ? Number(chartRef.width) : null,
        height: Number.isFinite(Number(chartRef.height)) ? Number(chartRef.height) : null
      }
      : null
  };
  return [
    {
      type: 'input_text',
      text: [
        'Chart verification only.',
        'Use the uploaded chart image as the primary source of truth.',
        'Return only visible identity evidence as JSON.',
        JSON.stringify(verificationContext, null, 2)
      ].join('\n\n')
    }
  ];
}

async function sendOpenAiRequest(apiKey, requestBody){
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  try{
    const upstream = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    const payload = await upstream.json().catch(() => ({}));
    return { upstream, payload };
  } finally{
    clearTimeout(timeout);
  }
}

function stripCodeFences(text){
  return String(text || '')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
}

function extractFirstJsonObject(text){
  const cleaned = stripCodeFences(text);
  const start = cleaned.indexOf('{');
  if(start === -1) return '';

  let depth = 0;
  let inString = false;
  let escape = false;

  for(let i = start; i < cleaned.length; i += 1){
    const ch = cleaned[i];

    if(inString){
      if(escape){
        escape = false;
      }else if(ch === '\\'){
        escape = true;
      }else if(ch === '"'){
        inString = false;
      }
      continue;
    }

    if(ch === '"'){
      inString = true;
      continue;
    }

    if(ch === '{'){
      depth += 1;
      continue;
    }

    if(ch === '}'){
      depth -= 1;
      if(depth === 0){
        return cleaned.slice(start, i + 1);
      }
    }
  }

  return '';
}

function tryParseJson(text){
  if(typeof text !== 'string' || !text.trim()) return null;

  const cleaned = stripCodeFences(text);

  try{
    return JSON.parse(cleaned);
  }catch(err){}

  const extracted = extractFirstJsonObject(cleaned);
  if(extracted){
    try{
      return JSON.parse(extracted);
    }catch(err){}
  }

  return null;
}

function normaliseString(value, fallback = ''){
  return typeof value === 'string' ? value : fallback;
}

function normaliseStringArray(value){
  return Array.isArray(value) ? value.map(item => String(item)) : [];
}

function normaliseNumber(value){
  if(value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeObject(value){
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function safeObject(value){
  return normalizeObject(value);
}

function normalizeFlatStringFields(value, fields = []){
  const source = safeObject(value);
  return fields.reduce((acc, field) => {
    acc[field] = normaliseString(source[field], '');
    return acc;
  }, {});
}

function collectAllowedNumericMentions(value, target = new Set()){
  if(value === null || value === undefined) return target;
  if(typeof value === 'number' && Number.isFinite(value)){
    target.add(String(value));
    return target;
  }
  if(typeof value === 'string'){
    const trimmed = value.trim();
    if(trimmed && /^-?\d+(?:\.\d+)?$/.test(trimmed)){
      target.add(trimmed);
    }
    return target;
  }
  if(Array.isArray(value)){
    value.forEach(item => collectAllowedNumericMentions(item, target));
    return target;
  }
  if(typeof value === 'object'){
    Object.values(value).forEach(item => collectAllowedNumericMentions(item, target));
  }
  return target;
}

function normalizeStringSequence(value){
  return Array.isArray(value) ? value.map(item => String(item || '').trim()).filter(Boolean) : [];
}

const CHART_GURU_EVENT_LABELS = {
  early_rebound_from_20ma:'Early rebound from 20MA',
  constructive_pullback_near_20ma:'First pullback to 20MA',
  bounce_confirmation_pending:'Successful 20MA defence',
  failed_bounce:'Failed first bounce from 20MA',
  pullback_still_repairing:'Pullback drifting below 20MA',
  constructive_pullback_near_50ma:'First test of 50MA',
  off_level_wait_for_clearer_support:'Deep pullback into 50MA',
  structure_breaking_down:'Support breakdown',
  strong_upside_acceleration:'Trend acceleration',
  sharp_selloff:'Trend damage with sellers in control',
  extended_after_run:'Momentum fading after extension',
  bounce_attempt:'Rebound attempt without follow-through',
  long_lower_wick_support_test:'Structure repair in progress',
  long_upper_wick_rejection:'Distribution after extension',
  doji_indecision:'Consolidation after advance',
  trend_climbing:'Breakout continuation',
  trend_mixed:'Range-bound pause near highs'
};

function chartGuruDominantEventLabel(storyKey = ''){
  const normalized = String(storyKey || '').trim().toLowerCase();
  return CHART_GURU_EVENT_LABELS[normalized] || 'Market event in progress';
}

function normalizeDeterministicEventPacket(value = {}){
  const source = safeObject(value);
  const dominantEventKey = normaliseString(source.dominantEventKey || source.primaryStoryKey, '');
  const dominantEventLabel = normaliseString(source.dominantEventLabel, '') || chartGuruDominantEventLabel(dominantEventKey);
  return {
    dominantEventKey,
    dominantEventLabel,
    dominantEvent:normaliseString(source.dominantEvent, ''),
    eventSequence:normalizeStringSequence(source.eventSequence),
    evidenceFactIds:normaliseStringArray(source.evidenceFactIds),
    confidence:normaliseNumber(source.confidence),
    rankReason:normaliseString(source.rankReason, ''),
    primaryStoryKey:normaliseString(source.primaryStoryKey || dominantEventKey, ''),
    primaryStoryLabel:normaliseString(source.primaryStoryLabel, ''),
    primaryStoryIcon:normaliseString(source.primaryStoryIcon, ''),
    recentStoryKey:normaliseString(source.recentStoryKey, ''),
    recentStoryBias:normaliseString(source.recentStoryBias, ''),
    recentStoryToneMode:normaliseString(source.recentStoryToneMode, ''),
    recentStoryConfidenceMode:normaliseString(source.recentStoryConfidenceMode, ''),
    recentStoryTrendLabel:normaliseString(source.recentStoryTrendLabel || dominantEventLabel, ''),
    recentStorySupportLabel:normaliseString(source.recentStorySupportLabel, ''),
    supportSemantic:normaliseString(source.supportSemantic, ''),
    buyerResponseSemantic:normaliseString(source.buyerResponseSemantic, ''),
    confirmationSemantic:normaliseString(source.confirmationSemantic, ''),
    stepDetails:Array.isArray(source.stepDetails)
      ? source.stepDetails.map(detail => {
        const safe = safeObject(detail);
        return {
          key:normaliseString(safe.key, ''),
          evidenceFactIds:normaliseStringArray(safe.evidenceFactIds),
          derivedFromSteps:normaliseStringArray(safe.derivedFromSteps),
          derivedFromConditions:normaliseStringArray(safe.derivedFromConditions)
        };
      }).filter(detail => detail.key)
      : []
  };
}

function normalizeTraderInterpretation(value = {}, eventPacket = {}){
  const source = safeObject(value);
  const deterministicPacket = normalizeDeterministicEventPacket(eventPacket);
  const eventSequence = normalizeStringSequence(source.eventSequence);
  const traderInterpretation = normaliseString(source.traderInterpretation, '') || normaliseString(source.traderRead, '');
  const currentRisk = normaliseString(source.currentRisk, '') || normaliseString(source.riskToWatch, '');
  const nextSignal = normaliseString(source.nextSignal, '') || normaliseString(source.nextUsefulSignal, '');
  return {
    dominantEvent:normaliseString(source.dominantEvent, '') || deterministicPacket.dominantEventLabel,
    dominantEventKey:normaliseString(source.dominantEventKey, '') || deterministicPacket.dominantEventKey,
    supportSemantic:normaliseString(source.supportSemantic, '') || deterministicPacket.supportSemantic,
    buyerResponseSemantic:normaliseString(source.buyerResponseSemantic, '') || deterministicPacket.buyerResponseSemantic,
    confirmationSemantic:normaliseString(source.confirmationSemantic, '') || deterministicPacket.confirmationSemantic,
    eventSequence:eventSequence.length ? eventSequence : deterministicPacket.eventSequence,
    traderInterpretation,
    currentRisk,
    nextSignal,
    whatChanged:normaliseString(source.whatChanged, '') || ((eventSequence.length ? eventSequence : deterministicPacket.eventSequence).join(' -> ')),
    traderRead:normaliseString(source.traderRead, '') || traderInterpretation,
    riskToWatch:normaliseString(source.riskToWatch, '') || currentRisk,
    nextUsefulSignal:normaliseString(source.nextUsefulSignal, '') || nextSignal
  };
}

function deterministicNearSupportContext(eventPacket = {}, structuredFacts = {}){
  const packet = normalizeDeterministicEventPacket(eventPacket);
  const facts = safeObject(structuredFacts);
  const setupStates = safeObject(facts.setupStates);
  const pullbackZone = normaliseString(setupStates.pullbackZone || facts.pullbackZone, '').trim().toLowerCase();
  const primaryStoryKey = normaliseString(packet.primaryStoryKey || packet.dominantEventKey, '').trim().toLowerCase();
  const recentStoryKey = normaliseString(packet.recentStoryKey, '').trim().toLowerCase();
  const explicitlyOffSupport = ['off_level_wait_for_clearer_support', 'extended_after_run'].includes(primaryStoryKey)
    || ['off_level_wait_for_clearer_support', 'extended_after_run'].includes(recentStoryKey)
    || ['off_level', 'extended', 'none'].includes(pullbackZone);
  const nearSupport = ['near_20ma', 'near_50ma', 'between_20_50ma'].includes(pullbackZone)
    || ['early_rebound_from_20ma', 'constructive_pullback_near_20ma', 'constructive_pullback_near_50ma', 'bounce_confirmation_pending'].includes(primaryStoryKey)
    || ['early_rebound_from_20ma', 'constructive_pullback_near_20ma', 'constructive_pullback_near_50ma', 'bounce_confirmation_pending'].includes(recentStoryKey);
  return nearSupport && !explicitlyOffSupport;
}

function normalizeSemanticToken(value = '', fallback = ''){
  return normaliseString(value, fallback).trim().toLowerCase();
}

function buildSemanticEnvelope(value = {}, fallback = {}){
  const source = safeObject(value);
  const packet = safeObject(fallback);
  return {
    supportSemantic:normalizeSemanticToken(source.supportSemantic, packet.supportSemantic),
    buyerResponseSemantic:normalizeSemanticToken(source.buyerResponseSemantic, packet.buyerResponseSemantic),
    confirmationSemantic:normalizeSemanticToken(source.confirmationSemantic, packet.confirmationSemantic)
  };
}

function classifySupportNarrationSemantic(text = ''){
  const safe = String(text || '').trim().toLowerCase();
  if(!safe) return 'support_unknown';
  const groups = {
    support_absent:[
      /\baway from support\b/,
      /\bnot near support\b/,
      /\bnot sitting near support\b/,
      /\baway from the main support areas\b/,
      /\bwait(?:ing)? for (?:price to )?pull back into support\b/,
      /\bneeds? a clearer support area elsewhere\b/,
      /\bsupport is not currently relevant\b/,
      /\bnot in the cleaner pullback zone\b/
    ],
    support_failed:[
      /\bsupport (?:gave way|failed|broke|did not hold|has not held)\b/,
      /\blost support\b/,
      /\bfell back below support\b/
    ],
    support_reclaimed:[
      /\breclaimed support\b/,
      /\bback above support\b/,
      /\bregained the (?:20|50)-day average\b/
    ],
    support_present:[
      /\bnear support\b/,
      /\bsitting near support\b/,
      /\bfrom (?:the )?(?:20|50)-day average\b/,
      /\bat (?:the )?(?:20|50)-day average\b/,
      /\bholding (?:near|at|above) support\b/,
      /\brebounding from (?:the )?(?:20|50)-day average\b/,
      /\bsupport area\b/
    ]
  };
  if(groups.support_absent.some(pattern => pattern.test(safe))) return 'support_absent';
  if(groups.support_failed.some(pattern => pattern.test(safe))) return 'support_failed';
  if(groups.support_reclaimed.some(pattern => pattern.test(safe))) return 'support_reclaimed';
  if(groups.support_present.some(pattern => pattern.test(safe))) return 'support_present';
  return 'support_unknown';
}

function classifyBuyerResponseSemantic(text = ''){
  const safe = String(text || '').trim().toLowerCase();
  if(!safe) return 'response_unknown';
  if(/\bfailed bounce\b|\bbuyers (?:lost control|failed to hold)\b|\brebound could fail\b/.test(safe)) return 'response_failed';
  if(/\bbuyers (?:have )?(?:responded|started to respond|stepped in)\b|\brebound\b|\bbounce attempt\b|\bstabili(?:s|z)ing\b|\bimproving\b/.test(safe)) return 'response_present';
  if(/\bno buyer response\b|\bbuyers have not responded\b|\bno rebound yet\b/.test(safe)) return 'response_absent';
  return 'response_unknown';
}

function classifyRepairNarrationSemantic(text = ''){
  const safe = String(text || '').trim().toLowerCase();
  if(!safe) return 'repair_unknown';
  if(/\b(?:rebuild|repair mode|still damaged|not repaired|have not regained control|has not regained control|buyers are trying to stabili(?:s|z)e|attempting to steady|stabili(?:s|z)e it)\b/.test(safe)) return 'repair_unconfirmed';
  if(/\b(?:repaired|recovered|regained control|buyers are back in control|trend is healthy again)\b/.test(safe)) return 'repair_confirmed';
  return 'repair_unknown';
}

function semanticContradictionsForEnvelope(text = '', envelope = {}){
  const safeEnvelope = buildSemanticEnvelope(envelope);
  const errors = [];
  const supportSemantic = classifySupportNarrationSemantic(text);
  const buyerResponseSemantic = classifyBuyerResponseSemantic(text);
  const repairSemantic = classifyRepairNarrationSemantic(text);
  const buyerResponseMentioned = buyerResponseSemantic === 'response_present';
  const unqualifiedSellerControl = /\bsellers (?:are|remain|still look) (?:fully )?(?:in charge|in control)\b|\brecent action still shows sellers in charge\b|\bsellers are still controlling the recent candles\b/.test(String(text || '').trim().toLowerCase());
  if(safeEnvelope.supportSemantic === 'support_present' && ['support_absent'].includes(supportSemantic)){
    errors.push('Narration contradicts support_present by implying price is away from support.');
  }
  if(safeEnvelope.supportSemantic === 'support_absent' && ['support_present', 'support_reclaimed'].includes(supportSemantic)){
    errors.push('Narration contradicts support_absent by implying active support interaction.');
  }
  if(safeEnvelope.buyerResponseSemantic === 'response_present' && buyerResponseSemantic === 'response_absent'){
    errors.push('Narration contradicts response_present by implying buyers have not responded.');
  }
  if(safeEnvelope.buyerResponseSemantic === 'response_failed' && buyerResponseSemantic === 'response_present' && !/\bfail(?:ed|ure)\b/i.test(String(text || ''))){
    errors.push('Narration contradicts response_failed by implying a healthy buyer response.');
  }
  if(
    safeEnvelope.supportSemantic === 'support_failed'
    && safeEnvelope.buyerResponseSemantic === 'response_present'
    && safeEnvelope.confirmationSemantic !== 'follow_through_confirmed'
  ){
    if(!buyerResponseMentioned){
      errors.push('Narration must acknowledge the buyer response when support has failed but stabilisation is being attempted.');
    }
    if(repairSemantic === 'repair_confirmed'){
      errors.push('Narration contradicts the damaged-but-unconfirmed envelope by implying the chart has already repaired.');
    }
    if(unqualifiedSellerControl && !buyerResponseMentioned){
      errors.push('Narration overstates seller control by omitting the active stabilisation attempt.');
    }
  }
  return errors;
}

function buildChartGuruNarrationDiagnostics(value = {}, eventPacket = {}){
  const interpretation = normalizeTraderInterpretation(value, eventPacket);
  return {
    dominantEvent:interpretation.dominantEvent,
    eventSequence:interpretation.eventSequence.slice(),
    supportSemantic:interpretation.supportSemantic,
    buyerResponseSemantic:interpretation.buyerResponseSemantic,
    confirmationSemantic:interpretation.confirmationSemantic,
    traderInterpretation:interpretation.traderInterpretation,
    currentRisk:interpretation.currentRisk,
    nextSignal:interpretation.nextSignal
  };
}

function buildProductionStructuredFacts(payload = {}, analysis = {}){
  const trustedMarketContext = normalizeObject(payload.trustedMarketContext || analysis.trustedMarketContext);
  const canonicalValues = normalizeObject({
    ticker:trustedMarketContext.ticker,
    timeframe:trustedMarketContext.timeframe,
    price:trustedMarketContext.currentPrice,
    ma20:trustedMarketContext.ma20,
    ma50:trustedMarketContext.ma50,
    ma200:trustedMarketContext.ma200,
    volume:trustedMarketContext.volume,
    latestCandleOHLC:trustedMarketContext.latestCandleOHLC,
    currentAppDerivedTradePlan:trustedMarketContext.currentAppDerivedTradePlan
  });
  const deterministicEventPacket = normalizeDeterministicEventPacket(payload.deterministicEventPacket);
  return {
    ticker:normaliseString(payload.ticker, ''),
    marketStatus:normaliseString(payload.marketStatus, ''),
    scanType:normaliseString(payload.scanType, ''),
    notes:normaliseString(payload.notes, ''),
    accountSize:normaliseNumber(payload.accountSize),
    maxRisk:normaliseNumber(payload.maxRisk),
    setupStates:{
      trendState:normaliseString(payload.trendState, ''),
      pullbackZone:normaliseString(payload.pullbackZone, ''),
      structureState:normaliseString(payload.structureState, ''),
      stabilisationState:normaliseString(payload.stabilisationState, ''),
      bounceState:normaliseString(payload.bounceState, ''),
      volumeState:normaliseString(payload.volumeState, ''),
      entryDefined:normaliseString(payload.entryDefined, ''),
      stopDefined:normaliseString(payload.stopDefined, ''),
      targetDefined:normaliseString(payload.targetDefined, '')
    },
    trustedMarketContext,
    canonicalValues,
    deterministicEventPacket,
    eventSequence:deterministicEventPacket.eventSequence,
    deterministicEvidence:{
      evidenceFactIds:deterministicEventPacket.evidenceFactIds.slice(),
      stepDetails:deterministicEventPacket.stepDetails.map(detail => ({
        key:detail.key,
        evidenceFactIds:detail.evidenceFactIds.slice(),
        derivedFromSteps:detail.derivedFromSteps.slice(),
        derivedFromConditions:detail.derivedFromConditions.slice()
      }))
    }
  };
}

function buildProductionAnalysisInstructionLines(){
  return [
    'Analyse a Quality Pullback chart as Chart Guru, an observation-only educational feature.',
    'Use plain English for a novice retail trader.',
    'Be honest about uncertainty.',
    'Do not invent chart details that are not provided.',
    'Do not issue buy/sell advice.',
    'Do not assign the app final readiness label, trading action, verdict, state, bucket, tone, promotion/demotion state, or score.',
    'The deterministic app resolver will decide final state.',
    'Use trustedMarketContext for all numeric values and canonical market facts.',
    'Do not replace trusted ticker, timeframe, price, MA values, volume, candle OHLC, or trade-plan maths with visual guesses from the image.',
    'Use the image only for visual structure, candle interpretation, and disagreement detection.',
    'If the image disagrees with trustedMarketContext, return both but keep trustedMarketContext canonical.',
    'If a chart image is attached, extract visible facts only: visible ticker, timeframe, latest price, moving average values, visible price/date range, and confidence.',
    'If numeric chart labels are visible but cannot be confidently assigned to latest price or a specific moving average, include them in visible_numeric_labels.',
    'TradingView mobile/narrow screenshots may crop MA legend text or numeric labels. If an MA line is visible but its value is unreadable, report the line as visible and keep the numeric value null.',
    'Do not fabricate MA values. Visibility can be partial/inferred; numeric values require readable text.',
    'Do not decide whether the chart is authentic. The app will compare extracted facts against trusted scanner and market data.',
    'Legacy fallback only: if deterministic facts are not visible enough and the chart/ticker match looks doubtful, return chart_match_status as mismatch or unclear and explain chart_match_warning.',
    'Return extractedFromImage, trustedMarketContext, canonicalValues, candleStructureAnalysis, tradePlanCommentary, chartCoach, confidenceWarnings, and a short novice-friendly candle read.',
    'chartCoach is the main educational output for Chart Guru.',
    'The app has already determined the setup context and story order before you respond.',
    'chartCoach must include a deterministic primaryStory object with key, label, icon, text, evidenceFactIds, confidence, and rankReason.',
    'Use the supplied chart evidence to explain the app-determined primary story first, then supporting evidence, then one learning point, then What next?.',
    'chartCoach.sections must contain at most 5 relevant emoji-led sections.',
    'The first section should usually be Biggest clue and should follow primaryStory.',
    'Include only one Learning point section and one What next? section.',
    'You may simplify or polish the deterministic explanation for a beginner, but do not rediscover the chart from scratch or change primaryStory key, section order, evidence facts, numeric values, confidence, or resolver authority.',
    'Return exactly one JSON object.',
    'Return evidence fields only; ai_observation_only must be true.',
    'If a field is unknown, return null.'
  ];
}

function buildProductionChartGuruInterpretationInstructions(){
  return [
    'You are an internal trader interpreter for Chart Guru.',
    'Read deterministic chart evidence plus the deterministic event packet and explain what just happened in trader terms before any beginner-friendly narration is written.',
    'Treat the deterministic event packet as the only event-classification authority.',
    'Stay concise, factual, sequence-aware, and trader-focused.',
    'Do not write beginner prose.',
    'Do not invent prices, new indicators, or unsupported chart facts.',
    'Carry supportSemantic, buyerResponseSemantic, and confirmationSemantic forward from the deterministic evidence instead of re-inferring them.',
    'If support has already failed but buyerResponseSemantic says a response is present, keep the dominant event negative while preserving that stabilisation attempt as live context.',
    'If deterministic context says the setup is near the 20-day or 50-day average, do not describe price as away from support unless the deterministic event packet explicitly says the setup is off-level or extended.',
    'Return only the JSON fields defined by the schema.'
  ].join('\n');
}

function buildProductionChartGuruInterpretationPrompt(structuredFacts, originalPrompt = ''){
  return [
    String(originalPrompt || '').trim(),
    '',
    'Before writing the final Chart Guru prose, produce the internal trader interpretation from these structured chart facts.',
    '',
    JSON.stringify(safeObject(structuredFacts), null, 2)
  ].join('\n');
}

function buildProductionChartGuruFinalInstructions(){
  return [
    'You are the Chart Guru tutor layer.',
    'Use plain English for a novice retail trader.',
    'Translate the supplied trader interpretation into beginner-friendly teaching copy.',
    'Do not inspect raw chart evidence.',
    'Do not classify the event or invent new chart facts.',
    'Do not issue buy/sell advice or app verdicts.',
    'Use supportSemantic, buyerResponseSemantic, and confirmationSemantic as fixed meaning constraints from the trader interpretation.',
    'Preserve support-location meaning from the trader interpretation. Do not rewrite a near-support rebound as price being away from support.',
    'If supportSemantic is support_failed while buyerResponseSemantic is response_present and confirmationSemantic is not follow_through_confirmed, explain that support already failed, buyers are trying to stabilise, and control has not been regained.',
    'Return exactly one JSON object.',
    'Return only these fields as JSON strings: chartStory, whyItMatters, setupLocation, learningPoint, whatNext.',
    'If a field is unknown, return an empty string.'
  ].join('\n');
}

function buildProductionChartGuruFinalPrompt(traderInterpretation, originalPrompt = ''){
  return [
    String(originalPrompt || '').trim(),
    '',
    'Trader interpretation to translate into Chart Guru teaching prose:',
    JSON.stringify(safeObject(traderInterpretation), null, 2)
  ].join('\n');
}

function buildEmptyChartCoach(explanationFacts = []){
  return {
    primaryStory:null,
    sections:[],
    summaryText:'',
    source:'',
    renderVersion:CHART_GURU_RENDER_VERSION,
    explanationFacts:normaliseStringArray(explanationFacts)
  };
}

function normalizeRecentStoryStep(step = ''){
  return String(step || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

function buildTwoStepChartCoach(finalResponse = {}, traderInterpretation = {}, structuredFacts = {}){
  const prose = normalizeFlatStringFields(finalResponse, FINAL_PROSE_REQUIRED_FIELDS);
  const facts = safeObject(structuredFacts);
  const eventPacket = normalizeDeterministicEventPacket(facts.deterministicEventPacket || facts.eventPacket);
  const interpretation = normalizeTraderInterpretation(traderInterpretation, eventPacket);
  const eventSequence = interpretation.eventSequence.map(step => normalizeRecentStoryStep(step)).filter(Boolean);
  const evidenceFactIds = [...new Set([
    'openai_two_step_narrative',
    ...eventPacket.evidenceFactIds
  ].map(id => String(id || '').trim()).filter(Boolean))];
  const primaryStoryKey = String(eventPacket.primaryStoryKey || eventPacket.dominantEventKey || 'openai_two_step_primary_story').trim();
  const primaryStoryLabel = String(eventPacket.primaryStoryLabel || 'Chart Story').trim();
  const primaryStoryIcon = String(eventPacket.primaryStoryIcon || CHART_GURU_PRIMARY_STORY_ICON).trim();
  const recentStoryKey = String(eventPacket.recentStoryKey || 'openai_two_step_narrative').trim();
  const storyStepDetails = eventSequence.map(step => ({
    key:step,
    evidenceFactIds:evidenceFactIds.slice(),
    derivedFromSteps:[step],
    derivedFromConditions:[]
  }));
  const sections = [
    {key:'biggest_clue', icon:CHART_GURU_PRIMARY_STORY_ICON, label:'Chart Story', text:prose.chartStory, confidence:0.82, teachingFocus:false},
    {key:'why_it_matters', icon:'🧠', label:'Why it matters', text:prose.whyItMatters, confidence:0.78, teachingFocus:false},
    {key:'setup_location', icon:'📍', label:'Setup location', text:prose.setupLocation, confidence:0.76, teachingFocus:false},
    {key:'learning_point', icon:'💡', label:'Learning point', text:prose.learningPoint, confidence:0.8, teachingFocus:true},
    {key:'what_next', icon:'🎯', label:'What next?', text:prose.whatNext, confidence:0.78, teachingFocus:false}
  ].filter(section => section.text);
  const summaryText = sections.map(section => `${section.icon} ${section.label}: ${section.text}`).join('\n');
  return {
    primaryStory:{
      key:primaryStoryKey,
      label:primaryStoryLabel,
      icon:primaryStoryIcon,
      text:prose.chartStory,
      evidenceFactIds:evidenceFactIds.slice(),
      confidence:Number.isFinite(Number(eventPacket.confidence)) ? Number(eventPacket.confidence) : 0.82,
      rankReason:eventPacket.rankReason || interpretation.dominantEvent || interpretation.whatChanged || 'two_step_chart_guru'
    },
    recentStory:{
      key:recentStoryKey,
      bias:String(eventPacket.recentStoryBias || 'educational').trim(),
      toneMode:String(eventPacket.recentStoryToneMode || 'openai_two_step').trim(),
      confidenceMode:String(eventPacket.recentStoryConfidenceMode || 'deterministic_event_packet_plus_trader_interpretation').trim(),
      trendLabel:String(interpretation.dominantEvent || eventPacket.recentStoryTrendLabel || '').trim(),
      supportLabel:String(prose.setupLocation || eventPacket.recentStorySupportLabel || '').trim(),
      supportSemantic:String(interpretation.supportSemantic || eventPacket.supportSemantic || '').trim(),
      buyerResponseSemantic:String(interpretation.buyerResponseSemantic || eventPacket.buyerResponseSemantic || '').trim(),
      confirmationSemantic:String(interpretation.confirmationSemantic || eventPacket.confirmationSemantic || '').trim(),
      steps:eventSequence,
      stepDetails:storyStepDetails,
      evidenceFactIds:evidenceFactIds.slice()
    },
    sections:sections.map(section => ({
      ...section,
      source:'openai_two_step_chart_guru'
    })),
    summaryText,
    source:'openai_two_step_chart_guru',
    renderVersion:CHART_GURU_RENDER_VERSION,
    explanationFacts:evidenceFactIds.slice(),
    diagnostics:{
      priorityOrder:sections.map(section => String(section.key || '').trim()),
      sectionConfidence:sections.map(section => ({
        key:String(section.key || '').trim(),
        confidence:Number.isFinite(Number(section.confidence)) ? Number(section.confidence) : null,
        teachingFocus:section.teachingFocus === true
      })),
      storyContract:{
        primaryStoryKey,
        storyKey:recentStoryKey,
        toneMode:String(eventPacket.recentStoryToneMode || 'openai_two_step').trim(),
        confidenceMode:String(eventPacket.recentStoryConfidenceMode || 'deterministic_event_packet_plus_trader_interpretation').trim(),
        supportSemantic:String(interpretation.supportSemantic || eventPacket.supportSemantic || '').trim(),
        buyerResponseSemantic:String(interpretation.buyerResponseSemantic || eventPacket.buyerResponseSemantic || '').trim(),
        confirmationSemantic:String(interpretation.confirmationSemantic || eventPacket.confirmationSemantic || '').trim(),
        steps:eventSequence.slice(),
        stepDetails:storyStepDetails.map(detail => ({
          key:detail.key,
          evidenceFactIds:detail.evidenceFactIds.slice(),
          derivedFromSteps:detail.derivedFromSteps.slice(),
          derivedFromConditions:detail.derivedFromConditions.slice()
        }))
      }
    }
  };
}

function mergeTwoStepNarrativeIntoAnalysis(analysis = {}, finalResponse = {}, traderInterpretation = {}, structuredFacts = {}){
  const base = analysis && typeof analysis === 'object' ? analysis : {};
  const prose = normalizeFlatStringFields(finalResponse, FINAL_PROSE_REQUIRED_FIELDS);
  const eventPacket = normalizeDeterministicEventPacket(safeObject(structuredFacts).deterministicEventPacket);
  const interpretation = normalizeTraderInterpretation(traderInterpretation, eventPacket);
  const chartCoach = buildTwoStepChartCoach(prose, interpretation, structuredFacts);
  return {
    ...base,
    coach_summary:prose.chartStory || base.coach_summary || '',
    plain_english_chart_read:prose.chartStory || base.plain_english_chart_read || '',
    candleStructureAnalysis:{
      ...normalizeObject(base.candleStructureAnalysis),
      noviceFriendlyCandleRead:prose.chartStory || normalizeObject(base.candleStructureAnalysis).noviceFriendlyCandleRead || '',
      twoStepNarrative:{
        chartStory:prose.chartStory,
        whyItMatters:prose.whyItMatters,
        setupLocation:prose.setupLocation,
        learningPoint:prose.learningPoint,
        whatNext:prose.whatNext
      }
    },
    chartCoach,
    chartGuruNarrative:{
      chartStory:prose.chartStory,
      whyItMatters:prose.whyItMatters,
      setupLocation:prose.setupLocation,
      learningPoint:prose.learningPoint,
      whatNext:prose.whatNext
    },
    deterministicEventPacket:eventPacket,
    traderInterpretation:{
      dominantEventKey:interpretation.dominantEventKey,
      dominantEvent:interpretation.dominantEvent,
      supportSemantic:interpretation.supportSemantic,
      buyerResponseSemantic:interpretation.buyerResponseSemantic,
      confirmationSemantic:interpretation.confirmationSemantic,
      whatChanged:interpretation.whatChanged,
      eventSequence:interpretation.eventSequence.slice(),
      traderInterpretation:interpretation.traderInterpretation,
      currentRisk:interpretation.currentRisk,
      nextSignal:interpretation.nextSignal,
      traderRead:interpretation.traderRead,
      riskToWatch:interpretation.riskToWatch,
      nextUsefulSignal:interpretation.nextUsefulSignal
    },
    chartGuruOpenAiFallbackReason:''
  };
}

function disablePrimaryAnalysisChartCoach(analysis = {}, explanationFacts = []){
  const base = analysis && typeof analysis === 'object' ? analysis : {};
  return {
    ...base,
    chartCoach:buildEmptyChartCoach(explanationFacts),
    chartGuruOpenAiFallbackReason:normaliseString(base.chartGuruOpenAiFallbackReason, '')
  };
}

function validateRequiredStringFields(response, fields = []){
  const source = safeObject(response);
  const errors = [];
  fields.forEach(field => {
    if(!String(source[field] || '').trim()){
      errors.push(`Missing required field: ${field}.`);
    }
  });
  return errors;
}

function validateNoUnexpectedPriceMentions(response, fields = [], allowedValues = []){
  const text = fields.map(field => String(safeObject(response)[field] || '').trim()).join('\n');
  const allowed = new Set(normaliseStringArray(allowedValues));
  const errors = [];
  for(const match of text.matchAll(/\b\d+(?:\.\d+)?\b/g)){
    const value = String(match[0]);
    const index = Number(match.index || 0);
    const context = text.slice(Math.max(0, index - 12), Math.min(text.length, index + value.length + 12));
    if(allowed.has(value)) continue;
    if(/\b(20|50|200)(?:-day|\s*day|\s*ma)\b/i.test(context)) continue;
    if(/\bma\s*(20|50|200)\b/i.test(context)) continue;
    if(/[£$€]/.test(context) || value.includes('.') || Number(value) >= 100){
      errors.push(`Unexpected price-like number "${value}" in "${context.trim()}".`);
    }
  }
  return errors;
}

function validateTraderInterpretationResponse(response, eventPacket = {}, structuredFacts = {}){
  const packet = normalizeDeterministicEventPacket(eventPacket);
  const interpretation = normalizeTraderInterpretation(response, packet);
  const errors = [];
  if(!interpretation.dominantEvent) errors.push('Missing required field: dominantEvent.');
  if(!interpretation.eventSequence.length) errors.push('Missing required field: eventSequence.');
  if(!interpretation.traderInterpretation) errors.push('Missing required field: traderInterpretation.');
  if(!interpretation.currentRisk) errors.push('Missing required field: currentRisk.');
  if(!interpretation.nextSignal) errors.push('Missing required field: nextSignal.');
  if(!interpretation.supportSemantic) errors.push('Missing required field: supportSemantic.');
  if(!interpretation.buyerResponseSemantic) errors.push('Missing required field: buyerResponseSemantic.');
  if(!interpretation.confirmationSemantic) errors.push('Missing required field: confirmationSemantic.');
  if(deterministicNearSupportContext(eventPacket, structuredFacts)){
    const text = [
      interpretation.dominantEvent,
      interpretation.traderInterpretation,
      interpretation.currentRisk,
      interpretation.nextSignal
    ].join('\n');
    errors.push(...semanticContradictionsForEnvelope(text, interpretation));
  }
  errors.push(...semanticContradictionsForEnvelope([
    interpretation.dominantEvent,
    interpretation.traderInterpretation,
    interpretation.currentRisk,
    interpretation.nextSignal
  ].join('\n'), interpretation));
  return {ok:errors.length === 0, errors};
}

function validateFinalProseResponse(response, allowedPriceMentions = [], eventPacket = {}, structuredFacts = {}){
  const packet = normalizeDeterministicEventPacket(eventPacket);
  const envelope = buildSemanticEnvelope(safeObject(structuredFacts).traderInterpretation, packet);
  const errors = validateRequiredStringFields(response, FINAL_PROSE_REQUIRED_FIELDS);
  errors.push(...validateNoUnexpectedPriceMentions(response, FINAL_PROSE_REQUIRED_FIELDS, allowedPriceMentions));
  const text = FINAL_PROSE_REQUIRED_FIELDS.map(field => String(safeObject(response)[field] || '').trim()).join('\n');
  if(deterministicNearSupportContext(eventPacket, structuredFacts) || envelope.supportSemantic || envelope.buyerResponseSemantic){
    errors.push(...semanticContradictionsForEnvelope(text, envelope));
  }
  return {ok:errors.length === 0, errors};
}

async function sendStrictSchemaOpenAiRequest(apiKey, model, instructions, prompt, schemaName, schema, maxOutputTokens = 600){
  let upstream;
  let upstreamJson = {};

  try{
    ({ upstream, payload: upstreamJson } = await sendOpenAiRequest(
      apiKey,
      buildStrictSchemaRequestBody(model, instructions, prompt, schemaName, schema, maxOutputTokens)
    ));
  }catch(err){
    const error = new Error(err?.name === 'AbortError' ? 'OpenAI request timed out.' : 'Could not reach the OpenAI API.');
    error.stage = schemaName;
    throw error;
  }

  if(!upstream.ok && RETRYABLE_STATUSES.has(upstream.status)){
    await sleep(800);
    try{
      ({ upstream, payload: upstreamJson } = await sendOpenAiRequest(
        apiKey,
        buildStrictSchemaRequestBody(model, instructions, prompt, schemaName, schema, maxOutputTokens)
      ));
    }catch(err){
      const error = new Error(err?.name === 'AbortError' ? 'OpenAI request timed out.' : 'Could not reach the OpenAI API.');
      error.stage = schemaName;
      throw error;
    }
  }

  if(!upstream.ok){
    const openAiMessage = extractOpenAiErrorMessage(upstreamJson) || 'OpenAI request failed.';
    const error = new Error(openAiMessage);
    error.status = upstream.status;
    error.payload = upstreamJson;
    error.stage = schemaName;
    throw error;
  }

  const rawText = extractOutputText(upstreamJson);
  const parsed = tryParseJson(rawText);
  if(!parsed || typeof parsed !== 'object'){
    const error = new Error('OpenAI response could not be parsed as JSON.');
    error.raw = rawText || null;
    error.stage = schemaName;
    throw error;
  }

  return {
    rawText,
    parsed
  };
}

function normalizeCanonicalValues(canonicalValues = {}, trustedMarketContext = {}, imageFacts = {}){
  const trustedPlan = normalizeObject(trustedMarketContext.currentAppDerivedTradePlan);
  const canonical = normalizeObject(canonicalValues);
  return {
    ticker: normaliseString(canonical.ticker || trustedMarketContext.ticker, ''),
    timeframe: normaliseString(canonical.timeframe || trustedMarketContext.timeframe, ''),
    price: normaliseNumber(canonical.price ?? canonical.currentPrice ?? trustedMarketContext.currentPrice),
    ma20: normaliseNumber(canonical.ma20 ?? trustedMarketContext.ma20),
    ma50: normaliseNumber(canonical.ma50 ?? trustedMarketContext.ma50),
    ma200: normaliseNumber(canonical.ma200 ?? trustedMarketContext.ma200),
    volume: normaliseNumber(canonical.volume ?? trustedMarketContext.volume),
    latestCandleOHLC: normalizeObject(canonical.latestCandleOHLC || canonical.latest_candle_ohlc || trustedMarketContext.latestCandleOHLC),
    currentAppDerivedTradePlan: {
      entry: normaliseNumber(canonical.entry ?? canonical.planEntry ?? trustedPlan.entry),
      stop: normaliseNumber(canonical.stop ?? canonical.planStop ?? trustedPlan.stop),
      firstTarget: normaliseNumber(canonical.firstTarget ?? canonical.first_target ?? canonical.target ?? trustedPlan.firstTarget),
      rewardRiskRatio: normaliseNumber(canonical.rewardRiskRatio ?? canonical.reward_risk_ratio ?? trustedPlan.rewardRiskRatio),
      positionSize: normaliseNumber(canonical.positionSize ?? canonical.position_size ?? trustedPlan.positionSize),
      status: normaliseString(canonical.status || trustedPlan.status, ''),
      riskStatus: normaliseString(canonical.riskStatus || canonical.risk_status || trustedPlan.riskStatus, '')
    },
    imageDisagreement: {
      price: normaliseNumber(imageFacts.visible_latest_price ?? imageFacts.price),
      ma20: normaliseNumber(imageFacts.visible_ma20 ?? imageFacts.ma20),
      ma50: normaliseNumber(imageFacts.visible_ma50 ?? imageFacts.ma50),
      ma200: normaliseNumber(imageFacts.visible_ma200 ?? imageFacts.ma200)
    }
  };
}

function genericSummaryText(text = ''){
  const safe = String(text || '').trim().toLowerCase();
  if(!safe) return true;
  const hasConcreteSignal = /20ma|50ma|200ma|below 20|below 50|above 200|above 20|above 50|below 200|wick|candle|close|open|higher|lower|rejection|follow-?through|bounce|failed bounce|green|red|buyers|sellers|reclaim|entry|stop|target|reward|risk|math/i.test(safe);
  if(hasConcreteSignal) return false;
  return /observe how price behaves around key moving averages|interesting setup|needs confirmation|monitor closely|wait and see|mixed picture|worth monitoring|something to watch/i.test(safe);
}

function normalizeServerCandleSequenceOrder(candles = []){
  const rows = Array.isArray(candles) ? candles.slice() : [];
  const parsed = rows.map((candle, index) => {
    const item = candle && typeof candle === 'object' ? candle : {};
    const rawDate = String(item.datetime || item.timestamp || item.date || '').trim();
    const timeValue = rawDate ? Date.parse(rawDate) : NaN;
    return {
      candle:item,
      index,
      timestamp:Number.isFinite(timeValue) ? timeValue : null
    };
  });
  const datedCount = parsed.filter(entry => entry.timestamp !== null).length;
  if(!datedCount){
    return {
      candles:rows,
      orderConfidence:'low'
    };
  }
  parsed.sort((a, b) => {
    if(a.timestamp === null && b.timestamp === null) return a.index - b.index;
    if(a.timestamp === null) return 1;
    if(b.timestamp === null) return -1;
    if(b.timestamp !== a.timestamp) return b.timestamp - a.timestamp;
    return a.index - b.index;
  });
  return {
    candles:parsed.map(entry => entry.candle),
    orderConfidence:datedCount === parsed.length ? 'high' : 'medium'
  };
}

function deterministicServerCandleSummary(trustedMarketContext = {}, canonicalValues = {}){
  const latest = canonicalValues.latestCandleOHLC && typeof canonicalValues.latestCandleOHLC === 'object'
    ? canonicalValues.latestCandleOHLC
    : normalizeObject(trustedMarketContext.latestCandleOHLC);
  const recentInput = Array.isArray(trustedMarketContext.recentCandleSequence) ? trustedMarketContext.recentCandleSequence : [];
  const recent = normalizeServerCandleSequenceOrder(recentInput).candles;
  const prior = recent[1] && typeof recent[1] === 'object' ? recent[1] : {};
  const price = normaliseNumber(canonicalValues.price ?? trustedMarketContext.currentPrice);
  const ma20 = normaliseNumber(canonicalValues.ma20 ?? trustedMarketContext.ma20);
  const ma50 = normaliseNumber(canonicalValues.ma50 ?? trustedMarketContext.ma50);
  const ma200 = normaliseNumber(canonicalValues.ma200 ?? trustedMarketContext.ma200);
  const open = normaliseNumber(latest.open);
  const close = normaliseNumber(latest.close);
  const high = normaliseNumber(latest.high);
  const low = normaliseNumber(latest.low);
  const priorClose = normaliseNumber(prior.close);
  const bits = [];
  const relation = [];
  if(price !== null && ma20 !== null) relation.push(price > ma20 ? 'above the 20MA' : 'below the 20MA');
  if(price !== null && ma50 !== null) relation.push(price > ma50 ? 'above the 50MA' : 'below the 50MA');
  if(price !== null && ma200 !== null) relation.push(price > ma200 ? 'above the 200MA' : 'below the 200MA');
  if(relation.length) bits.push(`Price is ${relation.join(', ')}.`);
  if(open !== null && close !== null){
    bits.push(close > open ? 'The latest candle closed green.' : (close < open ? 'The latest candle closed red.' : 'The latest candle closed flat.'));
  }
  if(close !== null && priorClose !== null){
    bits.push(close > priorClose ? 'It closed above the prior candle.' : (close < priorClose ? 'It closed below the prior candle.' : 'It closed in line with the prior candle.'));
  }
  if(open !== null && close !== null && high !== null && low !== null){
    const bodyTop = Math.max(open, close);
    const bodyBottom = Math.min(open, close);
    const body = Math.abs(close - open);
    const upperWick = Math.max(0, high - bodyTop);
    const lowerWick = Math.max(0, bodyBottom - low);
    const baseline = body > 0 ? body : Math.max(0.01, (high - low) * 0.15);
    if(lowerWick >= baseline * 1.5 && lowerWick > upperWick * 1.1) bits.push('There is lower-wick rejection, which shows buyers defended the low.');
    if(upperWick >= baseline * 1.5 && upperWick > lowerWick * 1.1) bits.push('There is upper-wick rejection, which shows sellers pushed it back down.');
  }
  const bounceAttempt = close !== null && priorClose !== null && open !== null && close > open && close > priorClose;
  bits.push(bounceAttempt ? 'Recent candles show a bounce attempt, but follow-through is still missing.' : 'Follow-through is still missing.');
  return bits.join(' ').trim() || 'Price is moving around key moving averages. Follow-through is still missing.';
}

function buildMalformedJsonFallbackAnalysis(payload = {}, rawText = ''){
  const trustedMarketContext = normalizeObject(payload.trustedMarketContext);
  const canonicalValues = normalizeCanonicalValues({}, trustedMarketContext, {});
  const summary = deterministicServerCandleSummary(trustedMarketContext, canonicalValues);
  const chartCoach = {
    primaryStory:null,
    sections:[],
    summaryText:'',
    source:'',
    renderVersion:'chart-guru-v1',
    explanationFacts:['parse_fallback']
  };
  return {
    setup_type:'',
    verdict:'Watch',
    coach_summary:'',
    plain_english_chart_read:'',
    parseWarning:'Model response was malformed JSON. Deterministic chart summary used instead.',
    extractedFromImage:{},
    trustedMarketContext,
    canonicalValues,
    candleStructureAnalysis:{
      summary,
      noviceFriendlyCandleRead:summary,
      source:'deterministic_parse_fallback'
    },
    tradePlanCommentary:{
      summary:'Estimated maths can still be reviewed, but candle confirmation must come from the canonical chart context.'
    },
    confidenceWarnings:[
      'Model response could not be parsed as JSON.',
      rawText ? 'Deterministic summary used from trusted market context.' : 'No structured model output was available.'
    ],
    chartCoach,
    ai_observation_only:true,
    final_verdict:''
  };
}

function normaliseAnalysis(obj, payload = {}){
  const imageFacts = normalizeObject(obj?.extractedFromImage || obj?.extracted_from_image);
  const trustedMarketContext = normalizeObject(obj?.trustedMarketContext || obj?.trusted_market_context || payload?.trustedMarketContext);
  const canonicalValues = normalizeCanonicalValues(obj?.canonicalValues || obj?.canonical_values, trustedMarketContext, imageFacts);
  const candleStructureAnalysis = normalizeObject(obj?.candleStructureAnalysis || obj?.candle_structure_analysis);
  const tradePlanCommentary = normalizeObject(obj?.tradePlanCommentary || obj?.trade_plan_commentary);
  const chartCoachSource = normalizeObject(obj?.chartGuru || obj?.chart_guru || obj?.chartCoach || obj?.chart_coach);
  const primaryStorySource = normalizeObject(chartCoachSource?.primaryStory || chartCoachSource?.primary_story);
  const hasPrimaryStory = !!(
    primaryStorySource
    && (
      normaliseString(primaryStorySource.key, '')
      || normaliseString(primaryStorySource.label, '')
      || normaliseString(primaryStorySource.icon, '')
      || normaliseString(primaryStorySource.text, '')
    )
  );
  const confidenceWarnings = Array.isArray(obj?.confidenceWarnings || obj?.confidence_warnings)
    ? (obj.confidenceWarnings || obj.confidence_warnings).map(item => String(item))
    : [];
  const rawOpinion = {
    verdict: normaliseString(obj?.verdict, ''),
    final_verdict: normaliseString(obj?.final_verdict, ''),
    readiness: normaliseString(obj?.readiness, ''),
    recommendation: normaliseString(obj?.recommendation, ''),
    setupRating: normaliseString(obj?.setupRating || obj?.setup_rating, ''),
    score: obj?.score ?? obj?.quality_score ?? null,
    bucket: normaliseString(obj?.bucket, ''),
    tone: normaliseString(obj?.tone, ''),
    state: normaliseString(obj?.state, ''),
    action: normaliseString(obj?.action, ''),
    decision: normaliseString(obj?.decision, ''),
    tradeable: obj?.tradeable ?? obj?.tradeability ?? null,
    entry: normaliseString(obj?.entry || obj?.proposed_entry, ''),
    stop: normaliseString(obj?.stop || obj?.proposed_stop, ''),
    first_target: normaliseString(obj?.first_target || obj?.target || obj?.proposed_first_target, ''),
    reward_risk: obj?.reward_risk == null || obj?.reward_risk === '' ? null : normaliseString(obj?.reward_risk, '')
  };
  const coachSummary = normaliseString(
    obj?.coach_summary
    || obj?.plain_english_chart_read
    || obj?.chart_read
    || candleStructureAnalysis?.noviceFriendlyCandleRead
    || candleStructureAnalysis?.novice_friendly_candle_read
    || candleStructureAnalysis?.summary,
    ''
  );
  const chartCoach = {
    primaryStory:hasPrimaryStory
      ? {
        key:normaliseString(primaryStorySource?.key, ''),
        label:normaliseString(primaryStorySource?.label, ''),
        icon:normaliseString(primaryStorySource?.icon, ''),
        text:normaliseString(primaryStorySource?.text, ''),
        evidenceFactIds:normaliseStringArray(primaryStorySource?.evidenceFactIds || primaryStorySource?.evidence_fact_ids),
        confidence:normaliseNumber(primaryStorySource?.confidence),
        rankReason:normaliseString(primaryStorySource?.rankReason || primaryStorySource?.rank_reason, '')
      }
      : null,
    sections:Array.isArray(chartCoachSource?.sections)
      ? chartCoachSource.sections.map(section => {
        const safe = normalizeObject(section);
        return {
          key:normaliseString(safe?.key, ''),
          icon:normaliseString(safe?.icon, ''),
          label:normaliseString(safe?.label, ''),
          text:normaliseString(safe?.text, ''),
          confidence:normaliseNumber(safe?.confidence),
          teachingFocus:safe?.teachingFocus === true,
          source:normaliseString(safe?.source, '')
        };
      }).filter(section => section.icon && section.label && section.text)
      : [],
    summaryText:normaliseString(chartCoachSource?.summaryText || chartCoachSource?.summary_text, ''),
    source:normaliseString(chartCoachSource?.source, ''),
    renderVersion:normaliseString(chartCoachSource?.renderVersion || chartCoachSource?.render_version, ''),
    explanationFacts:normaliseStringArray(chartCoachSource?.explanationFacts || chartCoachSource?.explanation_facts)
  };
  return {
    setup_type: normaliseString(obj?.setup_type, ''),
    verdict: 'Watch',
    coach_summary: coachSummary,
    plain_english_chart_read: coachSummary,
    parseWarning: normaliseString(obj?.parseWarning || obj?.parse_warning, ''),
    visible_ticker: normaliseString(obj?.visible_ticker || imageFacts?.visible_ticker || imageFacts?.ticker, ''),
    visible_timeframe: normaliseString(obj?.visible_timeframe || imageFacts?.visible_timeframe || imageFacts?.timeframe, ''),
    visible_latest_price: normaliseNumber(obj?.visible_latest_price ?? imageFacts?.visible_latest_price ?? imageFacts?.price),
    visible_ma20: normaliseNumber(obj?.visible_ma20 ?? imageFacts?.visible_ma20 ?? imageFacts?.ma20),
    visible_ma50: normaliseNumber(obj?.visible_ma50 ?? imageFacts?.visible_ma50 ?? imageFacts?.ma50),
    visible_ma200: normaliseNumber(obj?.visible_ma200 ?? imageFacts?.visible_ma200 ?? imageFacts?.ma200),
    visible_numeric_labels: Array.isArray(obj?.visible_numeric_labels)
      ? obj.visible_numeric_labels.map(item => normaliseNumber(item)).filter(value => value !== null)
      : [],
    ma20_visible: obj?.ma20_visible === true,
    ma50_visible: obj?.ma50_visible === true,
    ma200_visible: obj?.ma200_visible === true,
    ma200_line_detected: obj?.ma200_line_detected === true,
    ma200_text_detected: obj?.ma200_text_detected === true,
    ma200_value_extracted: obj?.ma200_value_extracted === true || normaliseNumber(obj?.visible_ma200) !== null,
    ma200_confidence: normaliseNumber(obj?.ma200_confidence),
    ma200_extraction_method_used: normaliseString(obj?.ma200_extraction_method_used || obj?.extraction_method_used, ''),
    visible_price_range: normaliseString(obj?.visible_price_range, ''),
    visible_date_range: normaliseString(obj?.visible_date_range, ''),
    extraction_confidence: normaliseNumber(obj?.extraction_confidence),
    extraction_warnings: normaliseStringArray(obj?.extraction_warnings),
    // TODO(chart-verification): legacy_ai_chart_match is fallback-only. Remove after deterministic extraction is validated.
    chart_match_status: normaliseString(obj?.chart_match_status, ''),
    chart_match_warning: normaliseString(obj?.chart_match_warning, ''),
    extractedFromImage: imageFacts,
    trustedMarketContext,
    canonicalValues,
    candleStructureAnalysis,
    tradePlanCommentary,
    chartCoach,
    confidenceWarnings,
    entry: '',
    stop: '',
    first_target: '',
    risk_per_share: '',
    position_size: '',
    reward_risk: null,
    quality_score: null,
    confidence_score: null,
    key_reasons: normaliseStringArray(obj?.constructive_evidence || obj?.key_reasons),
    risks: normaliseStringArray(obj?.risk_evidence || obj?.risks),
    constructive_evidence: normaliseStringArray(obj?.constructive_evidence),
    risk_evidence: normaliseStringArray(obj?.risk_evidence),
    what_needs_to_improve: normaliseStringArray(obj?.what_needs_to_improve),
    structure_evidence: normaliseString(obj?.structure_evidence, ''),
    location_evidence: normaliseString(obj?.location_evidence, ''),
    bounce_evidence: normaliseString(obj?.bounce_evidence, ''),
    stabilisation_evidence: normaliseString(obj?.stabilisation_evidence, ''),
    volume_evidence: normaliseString(obj?.volume_evidence, ''),
    priceability_evidence: normaliseString(obj?.priceability_evidence, ''),
    uncertainty_notes: normaliseStringArray(obj?.uncertainty_notes),
    ai_observation_only: true,
    aiObservation: {
      observationOnly: true,
      rawOpinion
    },
    final_verdict: ''
  };
}

exports.handler = async function handler(event){
  if(event.httpMethod === 'OPTIONS'){
    return jsonResponse(200, { ok: true });
  }

  if(event.httpMethod !== 'POST'){
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  if(!apiKey){
    return jsonResponse(500, {
      error: 'OPENAI_API_KEY is not configured on the server.'
    });
  }

  let body;
  try{
    body = JSON.parse(event.body || '{}');
  }catch(err){
    return jsonResponse(400, { error: 'Invalid JSON body.' });
  }

  const payload = body.payload || {};
  const prompt = String(body.prompt || '').trim();
  const chartRef = body.chartRef || null;
  const verificationOnly = body.verificationOnly === true;

  if(!payload.ticker || !payload.marketStatus || (!verificationOnly && !prompt)){
    return jsonResponse(400, {
      error: 'Missing ticker, market status, or prompt.'
    });
  }

  if(!verificationOnly && prompt.length > 12000){
    return jsonResponse(400, {
      error: 'Prompt is too large for the serverless endpoint.'
    });
  }

  const tightenedPrompt = [
    prompt,
    '',
    'Return ONLY valid raw JSON.',
    'Do not include markdown.',
    'Do not include code fences.',
    'Do not include commentary before or after the JSON.'
  ].join('\n');

  const content = verificationOnly
    ? buildVerificationOnlyContent(payload, chartRef)
    : [
      { type: 'input_text', text: tightenedPrompt }
    ];

  if(chartRef && typeof chartRef.dataUrl === 'string' && /^data:image\/(png|jpeg);base64,/i.test(chartRef.dataUrl)){
    if(chartRef.dataUrl.length > MAX_CHART_DATA_URL_LENGTH){
      return jsonResponse(413, {
        error: 'Chart image is too large. Upload a smaller PNG or JPG screenshot.'
      });
    }

    console.log('[CHART_IMAGE_SOURCE]', {
      endpoint: 'analyse-setup',
      verificationSource: String(chartRef.verificationSource || 'chartRef'),
      width: Number.isFinite(Number(chartRef.width)) ? Number(chartRef.width) : null,
      height: Number.isFinite(Number(chartRef.height)) ? Number(chartRef.height) : null,
      bytesApprox: Math.round(chartRef.dataUrl.length * 0.75)
    });

    content.push({
      type: 'input_image',
      image_url: chartRef.dataUrl,
      detail: verificationOnly ? 'high' : 'low'
    });
  }

  const instructions = verificationOnly
    ? [
      'Verify chart identity only.',
      'Do not perform setup analysis.',
      'Do not generate coaching, entry, stop, target, or verdict content.',
      'Extract visible facts only: visible ticker, timeframe, latest price, moving average values, visible price/date range, and extraction confidence.',
      'Prioritise readable ticker, timeframe, current price, and moving-average legend values from the screenshot chrome before any broader chart interpretation.',
      'If numeric chart labels are visible but cannot be confidently assigned to latest price or a specific moving average, include them in visible_numeric_labels.',
      'TradingView mobile/narrow screenshots may crop MA legend text or numeric labels. If an MA line is visible but its value is unreadable, report the line as visible and keep the numeric value null.',
      'Do not fabricate ticker, timeframe, price, or MA values.',
      'Do not use trusted app context as a fallback for visible values.',
      'Do not decide whether the chart is authentic. The app will compare extracted facts against trusted scanner and market data.',
      'Legacy fallback only: if deterministic facts are not visible enough and the chart/ticker match looks doubtful, return chart_match_status as mismatch or unclear and explain chart_match_warning.',
      'Return exactly one JSON object.',
      'Return evidence fields only; ai_observation_only must be true.',
      'Set coach_summary, plain_english_chart_read, constructive_evidence, risk_evidence, what_needs_to_improve, and chartCoach to empty values.',
      'If a field is unknown, return null.'
    ].join('\n')
    : buildProductionAnalysisInstructionLines().join('\n');

  let upstream;
  let upstreamJson = {};
  let activeContent = content;

  try{
    ({ upstream, payload: upstreamJson } = await sendOpenAiRequest(
      apiKey,
      buildRequestBody(model, instructions, activeContent, verificationOnly ? 600 : 1000)
    ));
  }catch(err){
    const message = err?.name === 'AbortError'
      ? 'OpenAI request timed out.'
      : 'Could not reach the OpenAI API.';
    return jsonResponse(502, { error: message });
  }

  if(!upstream.ok && upstream.status === 400 && activeContent.length > 1){
    const originalMessage = extractOpenAiErrorMessage(upstreamJson);

    if(verificationOnly){
      console.error('OpenAI API rejected verification image input; refusing text-only fallback', {
        status: upstream.status,
        model,
        ticker: String(payload.ticker || ''),
        message: originalMessage || 'OpenAI request failed.'
      });
      return jsonResponse(502, {
        error: 'Chart verification image was rejected by the AI API. Verification cannot continue without the uploaded chart image.'
      });
    }

    console.error('OpenAI API rejected image input, retrying without chart', {
      status: upstream.status,
      model,
      ticker: String(payload.ticker || ''),
      message: originalMessage || 'OpenAI request failed.'
    });

    activeContent = activeContent.filter(item => item.type !== 'input_image');

    try{
      ({ upstream, payload: upstreamJson } = await sendOpenAiRequest(
        apiKey,
        buildRequestBody(model, instructions, activeContent, verificationOnly ? 600 : 1000)
      ));
    }catch(err){
      const message = err?.name === 'AbortError'
        ? 'OpenAI request timed out.'
        : 'Could not reach the OpenAI API.';
      return jsonResponse(502, { error: message });
    }
  }

  if(!upstream.ok && RETRYABLE_STATUSES.has(upstream.status)){
    await sleep(800);

    try{
      ({ upstream, payload: upstreamJson } = await sendOpenAiRequest(
        apiKey,
        buildRequestBody(model, instructions, activeContent, verificationOnly ? 600 : 1000)
      ));
    }catch(err){
      const message = err?.name === 'AbortError'
        ? 'OpenAI request timed out.'
        : 'Could not reach the OpenAI API.';
      return jsonResponse(502, { error: message });
    }
  }

  if(!upstream.ok){
    const openAiMessage = extractOpenAiErrorMessage(upstreamJson) || 'OpenAI request failed.';

    console.error('OpenAI API error', {
      status: upstream.status,
      model,
      ticker: String(payload.ticker || ''),
      message: openAiMessage,
      error: upstreamJson?.error || upstreamJson
    });

    if(upstream.status === 401){
      return jsonResponse(401, {
        error: 'OpenAI authentication failed. Check OPENAI_API_KEY on the server.'
      });
    }

    if(upstream.status === 429){
      return jsonResponse(429, {
        error: 'OpenAI quota or rate limit reached. Check billing, then retry.'
      });
    }

    return jsonResponse(upstream.status, { error: openAiMessage });
  }

  const rawText = extractOutputText(upstreamJson);
  const parsed = tryParseJson(rawText);

  console.log('OPENAI_ANALYSIS_RESPONSE', JSON.stringify({
    model,
    ticker: String(payload.ticker || ''),
    output_text_present: !!(typeof upstreamJson?.output_text === 'string' && upstreamJson.output_text.trim()),
    extracted_text_length: rawText ? rawText.length : 0,
    parsed: !!parsed
  }));

  if(!parsed || typeof parsed !== 'object'){
    console.error('OpenAI returned unparsable analysis output', {
      model,
      ticker: String(payload.ticker || ''),
      raw: rawText || null
    });
    if(payload && payload.trustedMarketContext && typeof payload.trustedMarketContext === 'object'){
      const analysis = normaliseAnalysis(buildMalformedJsonFallbackAnalysis(payload, rawText), payload);
      return jsonResponse(200, {
        ok:true,
        model,
        analysis
      });
    }
    return jsonResponse(502, {
      error: 'OpenAI response could not be parsed as JSON.',
      raw: rawText || null
    });
  }

  let analysis = disablePrimaryAnalysisChartCoach(
    normaliseAnalysis(parsed, payload),
    ['primary_analysis_chart_coach_disabled_for_two_step']
  );

  try{
    const structuredFacts = buildProductionStructuredFacts(payload, analysis);
    const allowedPriceMentions = Array.from(collectAllowedNumericMentions(structuredFacts));
    const interpretationPrompt = buildProductionChartGuruInterpretationPrompt(structuredFacts, tightenedPrompt);
    const interpretationResult = await sendStrictSchemaOpenAiRequest(
      apiKey,
      model,
      buildProductionChartGuruInterpretationInstructions(),
      interpretationPrompt,
      'chart_guru_trader_interpretation',
      TRADER_INTERPRETATION_SCHEMA,
      500
    );
    const interpretationValidation = validateTraderInterpretationResponse(
      interpretationResult.parsed,
      structuredFacts.deterministicEventPacket,
      structuredFacts
    );
    if(!interpretationValidation.ok){
      console.error('Chart Guru trader interpretation validation failed; falling back to deterministic Chart Guru', {
        model,
        ticker: String(payload.ticker || ''),
        errors: interpretationValidation.errors
      });
      analysis.chartGuruOpenAiFallbackReason = 'interpretation_validation_failed';
      analysis.chartGuruOpenAiValidationErrors = interpretationValidation.errors.slice();
      analysis.chartCoach = buildEmptyChartCoach(['interpretation_validation_failed']);
      return jsonResponse(200, {
        ok:true,
        model,
        analysis
      });
    }

    const finalPrompt = buildProductionChartGuruFinalPrompt(interpretationResult.parsed, tightenedPrompt);
    const finalResult = await sendStrictSchemaOpenAiRequest(
      apiKey,
      model,
      buildProductionChartGuruFinalInstructions(),
      finalPrompt,
      'chart_guru_final_prose',
      FINAL_PROSE_SCHEMA,
      700
    );
    const finalValidation = validateFinalProseResponse(
      finalResult.parsed,
      allowedPriceMentions,
      structuredFacts.deterministicEventPacket,
      structuredFacts
    );
    if(!finalValidation.ok){
      console.error('Chart Guru final prose validation failed; falling back to deterministic Chart Guru', {
        model,
        ticker: String(payload.ticker || ''),
        errors: finalValidation.errors
      });
      analysis.chartGuruOpenAiFallbackReason = 'final_prose_validation_failed';
      analysis.chartGuruOpenAiValidationErrors = finalValidation.errors.slice();
      analysis.chartCoach = buildEmptyChartCoach(['final_prose_validation_failed']);
      return jsonResponse(200, {
        ok:true,
        model,
        analysis
      });
    }

    analysis = mergeTwoStepNarrativeIntoAnalysis(analysis, finalResult.parsed, interpretationResult.parsed, structuredFacts);
  }catch(err){
    const stage = String(err && err.stage || '');
    const failureReason = /chart_guru_trader_interpretation/i.test(stage)
      ? (/parsed as json/i.test(String(err && err.message || '')) ? 'interpretation_json_parse_failed' : 'interpretation_request_failed')
      : (/chart_guru_final_prose/i.test(stage)
        ? (/parsed as json/i.test(String(err && err.message || '')) ? 'final_prose_json_parse_failed' : 'final_prose_request_failed')
        : 'chart_guru_pipeline_failed');
    console.error('Chart Guru two-step pipeline failed; falling back to deterministic Chart Guru', {
      model,
      ticker:String(payload.ticker || ''),
      message:String(err && err.message || 'Unknown error'),
      status:Number.isFinite(Number(err && err.status)) ? Number(err.status) : null,
      raw:err && Object.prototype.hasOwnProperty.call(err, 'raw') ? err.raw : null
    });
    analysis.chartGuruOpenAiFallbackReason = failureReason;
    analysis.chartGuruOpenAiError = String(err && err.message || 'Chart Guru two-step pipeline failed.');
    analysis.chartCoach = buildEmptyChartCoach([failureReason]);
    return jsonResponse(200, {
      ok:true,
      model,
      analysis
    });
  }

  console.log('OPENAI_ANALYSIS_SUCCESS_PAYLOAD', JSON.stringify({
    ok: true,
    model,
    ticker: String(payload.ticker || ''),
    analysis
  }));

  return jsonResponse(200, {
    ok: true,
    model,
    analysis
  });
};

exports.__test = {
  normalizeDeterministicEventPacket,
  normalizeTraderInterpretation,
  buildChartGuruNarrationDiagnostics,
  buildProductionStructuredFacts,
  buildProductionChartGuruInterpretationInstructions,
  buildProductionChartGuruInterpretationPrompt,
  buildProductionChartGuruFinalInstructions,
  buildProductionChartGuruFinalPrompt,
  buildTwoStepChartCoach,
  mergeTwoStepNarrativeIntoAnalysis,
  buildEmptyChartCoach,
  classifySupportNarrationSemantic,
  classifyBuyerResponseSemantic,
  classifyRepairNarrationSemantic,
  semanticContradictionsForEnvelope,
  validateTraderInterpretationResponse,
  validateFinalProseResponse
};
