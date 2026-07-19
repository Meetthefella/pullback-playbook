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
const CHART_GURU_RENDER_VERSION = 'chart-guru-v3';
const CHART_GURU_DETERMINISTIC_CONTRACT_VERSION = 'chart-guru-contract-v3';
const CHART_GURU_INTERPRETATION_PROMPT_VERSION = 'chart-guru-interpretation-v2';
const CHART_GURU_FINAL_PROMPT_VERSION = 'chart-guru-final-v3';
const CHART_GURU_NARRATION_CONTRACT_VERSION = 'chart-guru-narration-contract-v1';
const CANONICAL_NARRATION_RENDERER_FIELDS = ['version','phase','dominantEvent','eventSequence','structure','support','buyerControl','followThrough','trend','volume','market','dominantBlocker','nextRequiredEvent','verdict','evidenceFactIds'];
const INTERPRETATION_REQUIRED_FIELDS = [
  'dominantEvent',
  'dominantEventKey',
  'eventSequence',
  'supportSemantic',
  'buyerResponseSemantic',
  'confirmationSemantic',
  'traderInterpretation',
  'currentRisk',
  'nextSignal',
  'whatChanged',
  'traderRead',
  'riskToWatch',
  'nextUsefulSignal'
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
const PRIMARY_ANALYSIS_SCHEMA = {
  type:'object',
  additionalProperties:false,
  required:[
    'visible_ticker',
    'visible_timeframe',
    'visible_latest_price',
    'visible_ma20',
    'visible_ma50',
    'visible_ma200',
    'visible_numeric_labels',
    'ma20_visible',
    'ma50_visible',
    'ma200_visible',
    'ma200_line_detected',
    'ma200_text_detected',
    'ma200_value_extracted',
    'ma200_confidence',
    'ma200_extraction_method_used',
    'visible_price_range',
    'visible_date_range',
    'extraction_confidence',
    'extraction_warnings',
    'chart_match_status',
    'chart_match_warning',
    'coach_summary',
    'plain_english_chart_read',
    'constructive_evidence',
    'risk_evidence',
    'what_needs_to_improve',
    'confidenceWarnings',
    'candleStructureAnalysis',
    'tradePlanCommentary',
    'ai_observation_only'
  ],
  properties:{
    visible_ticker:{type:'string'},
    visible_timeframe:{type:'string'},
    visible_latest_price:{type:['number', 'null']},
    visible_ma20:{type:['number', 'null']},
    visible_ma50:{type:['number', 'null']},
    visible_ma200:{type:['number', 'null']},
    visible_numeric_labels:{type:'array', items:{type:'number'}},
    ma20_visible:{type:'boolean'},
    ma50_visible:{type:'boolean'},
    ma200_visible:{type:'boolean'},
    ma200_line_detected:{type:'boolean'},
    ma200_text_detected:{type:'boolean'},
    ma200_value_extracted:{type:'boolean'},
    ma200_confidence:{type:['number', 'null']},
    ma200_extraction_method_used:{type:'string'},
    visible_price_range:{type:'string'},
    visible_date_range:{type:'string'},
    extraction_confidence:{type:['number', 'null']},
    extraction_warnings:{type:'array', items:{type:'string'}},
    chart_match_status:{type:'string'},
    chart_match_warning:{type:'string'},
    coach_summary:{type:'string'},
    plain_english_chart_read:{type:'string'},
    constructive_evidence:{type:'array', items:{type:'string'}},
    risk_evidence:{type:'array', items:{type:'string'}},
    what_needs_to_improve:{type:'array', items:{type:'string'}},
    confidenceWarnings:{type:'array', items:{type:'string'}},
    candleStructureAnalysis:{
      type:'object',
      additionalProperties:false,
      required:['summary', 'noviceFriendlyCandleRead', 'source'],
      properties:{
        summary:{type:'string'},
        noviceFriendlyCandleRead:{type:'string'},
        source:{type:'string'}
      }
    },
    tradePlanCommentary:{
      type:'object',
      additionalProperties:false,
      required:['summary'],
      properties:{
        summary:{type:'string'}
      }
    },
    ai_observation_only:{type:'boolean'}
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
  const supportState = safeObject(source.supportState);
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
    storyEvents:normalizeStringSequence(source.storyEvents),
    supportState:supportState && Object.keys(supportState).length ? {
      level:normaliseString(supportState.level, ''),
      label:normaliseString(supportState.label, ''),
      interaction:normaliseString(supportState.interaction, ''),
      currentlyActive:supportState.currentlyActive === true
        ? true
        : (supportState.currentlyActive === false ? false : null),
      distanceMeasured:supportState.distanceMeasured === true
        ? true
        : (supportState.distanceMeasured === false ? false : null),
      distanceFromSupportPct:normaliseNumber(supportState.distanceFromSupportPct)
    } : null,
    buyerControlState:normaliseString(source.buyerControlState, ''),
    currentPhase:normaliseString(source.currentPhase, ''),
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

const NARRATION_ENUMS = {
  phase:new Set(['at_support','responding_from_support','stalled_after_response','extended_from_support','away_from_support','support_failed','repairing_structure','current_location_unresolved']),
  structure:new Set(['intact','weakening','broken','unknown']),
  support:new Set(['testing','held','failed','not_tested','unknown']),
  buyerControl:new Set(['none','emerging','confirmed','unknown']),
  followThrough:new Set(['not_started','unconfirmed','stalled','confirmed','failed','unknown']),
  trend:new Set(['healthy','weak','broken','unknown']),
  volume:new Set(['constructive','weak','heavy','light','mixed','unknown']),
  market:new Set(['supportive','neutral','weak','unknown']),
  blocker:new Set(['none','follow_through','support_hold','repair','pullback_or_reset','location','structure','unknown']),
  nextRequiredEvent:new Set(['none','support_hold','follow_through','repair','pullback_or_reset','clearer_support','unknown']),
  verdict:new Set(['watch','near_entry','entry','avoid','unknown'])
};

function normalizeNarrationEnum(value, values, fallback = 'unknown'){
  const normalized = normaliseString(value, '').trim().toLowerCase();
  return values.has(normalized) ? normalized : fallback;
}

function narrationStructureState(value = ''){
  return ({strong:'intact',intact:'intact',developing_clean:'intact',developing:'intact',weak:'weakening',weakening:'weakening',broken:'broken'})[normaliseString(value, '').trim().toLowerCase()] || 'unknown';
}
function narrationTrendState(value = ''){
  return ({strong:'healthy',healthy:'healthy',acceptable:'healthy',weak:'weak',broken:'broken'})[normaliseString(value, '').trim().toLowerCase()] || 'unknown';
}
function narrationVolumeState(value = ''){
  return ({expanding:'constructive',constructive:'constructive',contracting:'light',diminishing:'light',light:'light',average:'mixed',normal:'mixed',mixed:'mixed',weak:'weak',heavy:'heavy'})[normaliseString(value, '').trim().toLowerCase()] || 'unknown';
}

function buildCanonicalNarrationContract(eventPacket = {}, source = {}){
  if(safeObject(eventPacket).version === CHART_GURU_NARRATION_CONTRACT_VERSION){
    const supplied = safeObject(eventPacket);
    const rebuilt = buildCanonicalNarrationContract({
      currentPhase:supplied.phase,
      dominantEventLabel:supplied.dominantEvent,
      eventSequence:supplied.eventSequence,
      evidenceFactIds:supplied.evidenceFactIds,
      supportState:supplied.support,
      buyerControlState:supplied.buyerControl,
      confirmationSemantic:supplied.followThrough ? `follow_through_${supplied.followThrough}` : ''
    }, {...safeObject(source), structure:supplied.structure, trend:supplied.trend, volume:supplied.volume, market:supplied.market, dominantBlocker:supplied.dominantBlocker, nextRequiredEvent:supplied.nextRequiredEvent, verdict:supplied.verdict});
    return rebuilt;
  }
  const packet = normalizeDeterministicEventPacket(eventPacket);
  const extra = safeObject(source);
  const supportState = safeObject(packet.supportState);
  const inferredPhase = packet.supportSemantic === 'support_failed'
    ? 'support_failed'
    : (packet.supportSemantic === 'support_absent'
      ? 'away_from_support'
      : (packet.buyerResponseSemantic === 'response_present' ? 'responding_from_support' : (packet.supportSemantic === 'support_present' ? 'at_support' : 'current_location_unresolved')));
  const phase = normalizeNarrationEnum(packet.currentPhase, NARRATION_ENUMS.phase, inferredPhase);
  const mappedStructure = narrationStructureState(extra.structure || extra.structureState);
  const structure = mappedStructure !== 'unknown' ? mappedStructure : (packet.dominantEventKey === 'structure_breaking_down' ? 'broken' : 'unknown');
  const support = normalizeNarrationEnum(supportState.interaction, NARRATION_ENUMS.support,
    packet.supportSemantic === 'support_failed' ? 'failed' : (packet.supportSemantic === 'support_present' ? 'testing' : 'unknown'));
  const buyerControl = normalizeNarrationEnum(packet.buyerControlState, NARRATION_ENUMS.buyerControl,
    packet.buyerResponseSemantic === 'response_present' ? 'emerging' : 'none');
  const followThrough = normalizeNarrationEnum(packet.confirmationSemantic
    .replace('follow_through_', ''), NARRATION_ENUMS.followThrough,
    packet.buyerResponseSemantic === 'response_present' ? 'unconfirmed' : 'unknown');
  const nextFromPhase = {
    at_support:'support_hold', responding_from_support:'follow_through', stalled_after_response:'follow_through',
    extended_from_support:'pullback_or_reset', away_from_support:'clearer_support', support_failed:'repair',
    repairing_structure:'repair', current_location_unresolved:'clearer_support'
  };
  const nextRequiredEvent = normalizeNarrationEnum(extra.nextRequiredEvent || extra.nextChartNeed, NARRATION_ENUMS.nextRequiredEvent,
    nextFromPhase[phase] || 'unknown');
  return {
    version:CHART_GURU_NARRATION_CONTRACT_VERSION,
    phase,
    dominantEvent:packet.dominantEventLabel || 'Market event in progress',
    eventSequence:packet.eventSequence,
    structure,
    support:{interaction:support, label:packet.recentStorySupportLabel || supportState.label || ''},
    buyerControl,
    followThrough,
    trend:narrationTrendState(extra.trend || extra.trendState) !== 'unknown' ? narrationTrendState(extra.trend || extra.trendState) : (structure === 'intact' ? 'healthy' : (structure === 'broken' ? 'broken' : 'unknown')),
    volume:narrationVolumeState(extra.volume || extra.volumeState),
    market:normalizeNarrationEnum(extra.market, NARRATION_ENUMS.market),
    dominantBlocker:normalizeNarrationEnum(extra.dominantBlocker, NARRATION_ENUMS.blocker, nextRequiredEvent === 'none' ? 'none' : (nextRequiredEvent === 'unknown' ? 'unknown' : nextRequiredEvent === 'clearer_support' ? 'location' : nextRequiredEvent)),
    nextRequiredEvent,
    verdict:normalizeNarrationEnum(extra.verdict, NARRATION_ENUMS.verdict),
    evidenceFactIds:packet.evidenceFactIds
  };
}

function validateCanonicalNarrationContract(contract = {}){
  const value = safeObject(contract);
  const errors = [];
  if(value.version !== CHART_GURU_NARRATION_CONTRACT_VERSION) errors.push('unsupported_contract_version');
  if(!NARRATION_ENUMS.phase.has(value.phase)) errors.push('phase_unknown');
  if(value.phase === 'stalled_after_response' && (value.followThrough === 'confirmed' || value.buyerControl === 'confirmed')) errors.push('stalled_response_confirmed_conflict');
  if(value.phase === 'support_failed' && (value.support && value.support.interaction === 'held' || value.followThrough === 'confirmed')) errors.push('support_failed_conflict');
  if(['extended_from_support','away_from_support'].includes(value.phase) && value.support && ['testing','held'].includes(value.support.interaction)) errors.push('away_phase_active_support_conflict');
  if(value.structure === 'broken' && (value.support && value.support.interaction === 'held' || value.buyerControl === 'confirmed')) errors.push('broken_structure_recovery_conflict');
  const expectedNext = {stalled_after_response:'follow_through',support_failed:'repair',repairing_structure:'repair',extended_from_support:'pullback_or_reset',away_from_support:'clearer_support'};
  if(expectedNext[value.phase] && value.nextRequiredEvent !== expectedNext[value.phase]) errors.push('phase_next_event_mismatch');
  return {ok:errors.length === 0, errors};
}

function buildCanonicalNarrationRendererInput(contract = {}){
  const source = safeObject(contract);
  return CANONICAL_NARRATION_RENDERER_FIELDS.reduce((input, key) => {
    input[key] = source[key];
    return input;
  }, {});
}

function deterministicNarrationFallback(contract = {}){
  const phase = contract.phase || 'current_location_unresolved';
  const next = contract.nextRequiredEvent || 'clearer_support';
  const location = contract.support && contract.support.label ? ` near the ${contract.support.label}` : '';
  const stories = {
    at_support:`Price is testing support${location}. Buyers have not proved that the level will hold yet.`,
    responding_from_support:`Price is responding from support${location}. Buyers are showing an early response, but it still needs backing up.`,
    stalled_after_response:`The response from support has stalled. Buyers have not taken control, so the first lift needs follow-through.`,
    extended_from_support:`Price has moved well away from the earlier support test. The next useful reference is a calmer pullback or reset.`,
    away_from_support:`Price is away from a clear support test. The chart needs a clearer location before the next decision point.`,
    support_failed:`Support has failed. The chart needs repair before any improvement can be trusted.`,
    repairing_structure:`The chart is repairing damaged structure. Buyers still need to rebuild control.`,
    current_location_unresolved:`The current location is not clear enough to frame a support story. More location evidence is needed.`
  };
  const nextText = {support_hold:'Watch for support to hold.',follow_through:'Watch for buyers to follow through with another firm close.',repair:'Watch for price to repair the damaged structure.',pullback_or_reset:'Watch for a calmer pullback or reset.',clearer_support:'Watch for price to reach a clearer support area.',none:'No additional event is required yet.',unknown:'Watch for a clearer next chart event.'};
  return {
    chartStory:stories[phase] || stories.current_location_unresolved,
    whyItMatters: phase === 'support_failed' || phase === 'repairing_structure' ? 'This matters because damaged structure makes the next move harder to trust.' : 'This matters because the phase shows whether buyers have actually earned control.',
    setupLocation: ['extended_from_support','away_from_support'].includes(phase) ? 'Price is not at an active support test now.' : (phase === 'support_failed' ? 'The earlier support area has failed, so location must be rebuilt.' : `The relevant location is the current support context${location}.`),
    learningPoint: phase === 'stalled_after_response' ? 'An early response is not the same as follow-through.' : 'The location matters, but the next price response is what confirms the story.',
    whatNext:nextText[next] || nextText.unknown
  };
}

function validateNarrationProseAgainstContract(response = {}, contract = {}){
  const prose = normalizeFlatStringFields(response, FINAL_PROSE_REQUIRED_FIELDS);
  const text = Object.values(prose).join(' ').toLowerCase();
  const errors = [];
  if(FINAL_PROSE_REQUIRED_FIELDS.some(key => !prose[key].trim())) errors.push('missing_section');
  const phaseWords = {
    at_support:/support/, responding_from_support:/support|respond/, stalled_after_response:/stalled|follow-through|follow through/,
    extended_from_support:/extended|away from/, away_from_support:/away from|clearer support/,
    support_failed:/support.*fail|failed support/, repairing_structure:/repair|damage/, current_location_unresolved:/location.*clear|clear.*location/
  };
  if(phaseWords[contract.phase] && !phaseWords[contract.phase].test(prose.chartStory.toLowerCase())) errors.push('chart_story_phase_missing');
  if(!['extended_from_support','away_from_support'].includes(contract.phase) && /away from support|extended from support|extension/.test(text)) errors.push('unsupported_away_or_extension_language');
  if(contract.buyerControl !== 'confirmed' && /buyers? (are |have )?(in )?control|control has returned/.test(text)) errors.push('unsupported_buyer_control_language');
  if(contract.structure === 'broken' && /support (is |has )?holding|held support/.test(text)) errors.push('broken_structure_support_holding_language');
  if(contract.followThrough === 'stalled' && /improving rebound|rebound is improving/.test(text)) errors.push('stalled_follow_through_improvement_language');
  if(contract.phase === 'stalled_after_response' && /new pullback|reset|pull back again/.test(prose.whatNext.toLowerCase())) errors.push('stalled_response_reset_instruction');
  const nextPatterns = {follow_through:/follow-through|follow through|another firm close/,repair:/repair|rebuild/,pullback_or_reset:/pullback|reset/,clearer_support:/clearer support|support area/,support_hold:/support.*hold|hold.*support/};
  if(nextPatterns[contract.nextRequiredEvent] && !nextPatterns[contract.nextRequiredEvent].test(prose.whatNext.toLowerCase())) errors.push('next_required_event_missing');
  return {ok:errors.length === 0, errors};
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
    supportLabel:normaliseString(source.supportLabel, '') || deterministicPacket.recentStorySupportLabel,
    trendLabel:normaliseString(source.trendLabel, '') || deterministicPacket.recentStoryTrendLabel,
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
  const supportState = safeObject(packet.supportState);
  const primaryStoryKey = normaliseString(packet.primaryStoryKey || packet.dominantEventKey, '').trim().toLowerCase();
  const recentStoryKey = normaliseString(packet.recentStoryKey, '').trim().toLowerCase();
  if(supportState.currentlyActive === true) return true;
  if(supportState.currentlyActive === false) return false;
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
    confirmationSemantic:normalizeSemanticToken(source.confirmationSemantic, packet.confirmationSemantic),
    dominantEventKey:normalizeSemanticToken(source.dominantEventKey, packet.dominantEventKey || packet.primaryStoryKey),
    dominantEvent:normalizeSemanticToken(source.dominantEvent, packet.dominantEvent || packet.dominantEventLabel)
  };
}

const TUTOR_ABSTRACT_WORDING_PATTERNS = [
  /\bthis situation indicates\b/i,
  /\bpotential opportunity\b/i,
  /\bfavourable position\b/i,
  /\bbuyer commitment\b/i,
  /\bwaiting phase\b/i,
  /\bconstructive backdrop\b/i,
  /\bmarket participants\b/i,
  /\bquality environment\b/i,
  /\bdemonstrates\b/i,
  /\bfacilitates\b/i,
  /\bin order to\b/i
];

function splitIntoSentences(text = ''){
  return String(text || '')
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map(part => part.trim())
    .filter(Boolean);
}

function openingSectionText(text = '', count = 2){
  return splitIntoSentences(text).slice(0, count).join(' ').trim();
}

function textHasAnyPattern(text = '', patterns = []){
  return patterns.some(pattern => pattern.test(String(text || '')));
}

function inferQualitySemantic(envelope = {}){
  const dominantEventKey = normalizeSemanticToken(envelope.dominantEventKey);
  const dominantEvent = normalizeSemanticToken(envelope.dominantEvent);
  if(dominantEventKey === 'extended_after_run' || /\b(diminishing|quality is slipping|quality is fading|losing quality|less convincing|weakening)\b/.test(dominantEvent)){
    return 'fading';
  }
  return '';
}

function eventLeadPatternsForEnvelope(envelope = {}){
  const dominantEventKey = normalizeSemanticToken(envelope.dominantEventKey);
  const dominantEvent = normalizeSemanticToken(envelope.dominantEvent);
  if(dominantEventKey === 'failed_first_bounce_from_20ma' || /\bfailed\b.*\bbounce\b/.test(dominantEvent)){
    return [/\bfailed\b/i, /\bbounce\b/i, /\bfaded quickly\b/i, /\bcould not hold\b/i];
  }
  if(dominantEventKey === 'first_test_of_50ma' || /\b50ma\b.*\btest\b/.test(dominantEvent) || /\b50-day\b.*\btest\b/.test(dominantEvent)){
    return [/\b50(?:-day)?\b/i, /\btest\b/i, /\bsupport\b/i];
  }
  if(dominantEventKey === 'constructive_pullback_awaiting_confirmation' || /\bconstructive\b.*\bpullback\b/.test(dominantEvent)){
    return [/\bpullback\b/i, /\bpulled back\b/i, /\bpulling back\b/i, /\b20(?:-day)?\b/i, /\bcontrolled\b/i, /\borderly\b/i];
  }
  if(dominantEventKey === 'early_constructive_pullback' || /\bearly\b.*\bpullback\b/.test(dominantEvent)){
    return [/\bearly\b/i, /\bpullback\b/i, /\bpulling back\b/i, /\bsupport\b/i, /\bmoving toward\b/i];
  }
  if(dominantEventKey === 'extended_after_run' || /\b(momentum fading|losing quality|weakening)\b/.test(dominantEvent)){
    return [/\blosing quality\b/i, /\bmessier\b/i, /\bless clean\b/i, /\bfading\b/i, /\bweakening\b/i, /\btired\b/i];
  }
  if(dominantEventKey === 'support_breakdown_stabilisation_attempt' || dominantEventKey === 'structure_breaking_down' || /\bsupport breakdown\b/.test(dominantEvent)){
    return [/\bsupport\b/i, /\bfailed\b/i, /\bbroke\b/i, /\blost\b/i, /\bbreakdown\b/i];
  }
  return [];
}

function learningPointPatternsForEnvelope(envelope = {}){
  const dominantEventKey = normalizeSemanticToken(envelope.dominantEventKey);
  const dominantEvent = normalizeSemanticToken(envelope.dominantEvent);
  if(dominantEventKey === 'failed_first_bounce_from_20ma' || /\bfailed\b.*\bbounce\b/.test(dominantEvent)){
    return [/\bsupport touch\b/i, /\bresponse that follows\b/i, /\bfirst bounce\b/i, /\bfailed bounce\b/i, /\bbuyers have not defended\b/i, /\brebound\b/i, /\bstay patient\b/i];
  }
  if(dominantEventKey === 'first_test_of_50ma' || /\b50ma\b.*\btest\b/.test(dominantEvent) || /\b50-day\b.*\btest\b/.test(dominantEvent)){
    return [/\breaching support\b/i, /\bfirst step\b/i, /\bsupport area\b/i, /\bstarting point\b/i, /\b50(?:-day)?\b/i, /\bbuyer response\b/i, /\bholding\b/i, /\bdefend\b/i];
  }
  if(dominantEventKey === 'constructive_pullback_awaiting_confirmation' || /\bconstructive\b.*\bpullback\b/.test(dominantEvent)){
    return [/\bcontrolled pullback\b/i, /\bhealthy pullback\b/i, /\bgood location\b/i, /\bbuyers need to follow through\b/i, /\bbounce\b/i, /\bsupport\b/i, /\btoo early\b/i, /\bstronger setup\b/i];
  }
  if(dominantEventKey === 'early_constructive_pullback' || /\bearly\b.*\bpullback\b/.test(dominantEvent)){
    return [/\bright area\b/i, /\btoo early\b/i, /\blocation\b/i, /\bbuyer response\b/i, /\bnot be ready\b/i, /\bsupport\b/i];
  }
  if(dominantEventKey === 'extended_after_run' || /\b(momentum fading|losing quality|weakening)\b/.test(dominantEvent)){
    return [/\bmessier pullbacks\b/i, /\bharder to trade\b/i, /\bharder to time\b/i, /\bquality\b/i, /\btiming\b/i, /\bclean pullbacks\b/i, /\bless reliable timing\b/i];
  }
  if(dominantEventKey === 'support_breakdown_stabilisation_attempt' || dominantEventKey === 'structure_breaking_down' || /\bsupport breakdown\b/.test(dominantEvent)){
    return [/\bbounce before it is fixed\b/i, /\bbuild a base\b/i, /\breclaim lost support\b/i, /\bdamaged chart\b/i];
  }
  return [];
}

function hasRepeatedSemanticState(sentences = []){
  const semanticBuckets = [
    {key:'response_absent', patterns:[/\bnot shown enough\b/i, /\bneeds proof\b/i, /\bneeds confirmation\b/i, /\bnot confirmed\b/i]},
    {key:'response_present', patterns:[/\bbuyers (?:stepped in|responded|started to respond|are trying to)\b/i, /\bbounce has started\b/i, /\brebound has started\b/i]},
    {key:'support_failed', patterns:[/\bsupport (?:failed|gave way|broke)\b/i, /\blost support\b/i, /\bbreakdown\b/i]}
  ];
  const sentenceBuckets = sentences.map(sentence => semanticBuckets.filter(bucket => textHasAnyPattern(sentence, bucket.patterns)).map(bucket => bucket.key));
  return semanticBuckets.some(bucket => sentenceBuckets.filter(keys => keys.includes(bucket.key)).length > 1);
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
      /\baround (?:the )?(?:20|50)-day average\b/,
      /\bworking around (?:the )?(?:20|50)-day average\b/,
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

function validateTutorSectionRoles(response = {}, envelope = {}){
  const safe = safeObject(response);
  const semanticEnvelope = buildSemanticEnvelope(envelope);
  const errors = [];
  const chartStory = normaliseString(safe.chartStory, '');
  const whyItMatters = normaliseString(safe.whyItMatters, '');
  const setupLocation = normaliseString(safe.setupLocation, '');
  const learningPoint = normaliseString(safe.learningPoint, '');
  const whatNext = normaliseString(safe.whatNext, '');
  const chartStoryOpening = openingSectionText(chartStory);
  const learningPointSentences = splitIntoSentences(learningPoint);

  if(/^this situation\b/i.test(chartStoryOpening) || /^the trend\b/i.test(chartStoryOpening)){
    errors.push('chartStory must begin with observable price or buyer/seller behaviour, not generic framing.');
  }
  if(!textHasAnyPattern(chartStoryOpening, [
    /\bbuyers?\b/i,
    /\bsellers?\b/i,
    /\bprice\b/i,
    /\bstock\b/i,
    /\bbounce\b/i,
    /\bpullback\b/i,
    /\brebound\b/i,
    /\bgreen day\b/i,
    /\bred days?\b/i,
    /\bdrifting lower\b/i,
    /\bstopped falling\b/i,
    /\bpushed\b/i,
    /\bfaded\b/i
  ])){
    errors.push('chartStory must open with visible behaviour the beginner can picture on the chart.');
  }
  if(/^recently\b/i.test(whyItMatters) || /^currently\b/i.test(whyItMatters)){
    errors.push('whyItMatters must explain why traders care now, not restate the chart story or location.');
  }
  if(/\bimportant support level\b/i.test(whyItMatters) && /\bimportant support level\b/i.test(setupLocation)){
    errors.push('whyItMatters and setupLocation should not repeat the same location claim.');
  }
  const specificLocationPresent = textHasAnyPattern(setupLocation, [/\bsupport\b/i, /\bresistance\b/i, /\b20(?:-day)?\b/i, /\b50(?:-day)?\b/i, /\bnear\b/i, /\bat\b/i, /\baround\b/i, /\bbetween\b/i]);
  const honestNonSpecificLocation = semanticEnvelope.supportSemantic === 'support_unknown' && (
    textHasAnyPattern(setupLocation, [/\btrend has not fully broken\b/i, /\btrend is still partly intact\b/i, /\bcurrent timing\b/i, /\bharder to trust\b/i, /\bless orderly\b/i, /\bpullbacks\b/i])
  );
  if(!specificLocationPresent && !honestNonSpecificLocation){
    errors.push('setupLocation must explain where price sits relative to support or resistance in plain English.');
  }
  if(textHasAnyPattern(learningPoint, [/\balways be cautious\b/i, /\balways\b.+\bcautious\b/i])){
    errors.push('learningPoint must avoid generic advice like "always be cautious".');
  }
  if(!textHasAnyPattern(learningPoint, [/\btraders?\b/i, /\bneed to see\b/i, /\bnot enough on its own\b/i, /\bbefore trusting\b/i, /\breduce the risk\b/i, /\bcan bounce before it is fixed\b/i, /\bstarting point\b/i, /\btoo early\b/i, /\bharder to time\b/i, /\bharder to trade\b/i, /\bbuild a base\b/i, /\bwhat buyers do next\b/i, /\bstay patient\b/i, /\bbuyer response\b/i, /\bfollow through\b/i, /\bholding\b/i, /\bdefended\b/i, /\blocation\b/i, /\btiming\b/i])){
    errors.push('learningPoint must give one practical beginner lesson rather than restating the setup.');
  }
  if(textHasAnyPattern(learningPoint, [/\b(always|every time|never)\b/i, /\bassess the setup carefully\b/i, /\bclear signals\b/i, /\bdecision-making process\b/i, /\bbe cautious\b/i, /\bpatience is important\b/i])){
    errors.push('learningPoint must teach the current event, not fall back to generic advice.');
  }
  if(learningPointSentences.length > 2){
    errors.push('learningPoint must stay within one or two sentences.');
  }
  if(/^(watch|look for|wait for)\b/i.test(learningPoint)){
    errors.push('learningPoint must teach a lesson, not repeat the whatNext instruction.');
  }
  if(!textHasAnyPattern(whatNext, [/\bwatch\b/i, /\blook for\b/i, /\bneed to see\b/i, /\bwait for\b/i, /\bif buyers\b/i, /\banother strong\b/i, /\bhold\b/i, /\breclaim\b/i])){
    errors.push('whatNext must give one concrete observable signal.');
  }
  return errors;
}

function validateTutorVoice(response = {}){
  const safe = safeObject(response);
  const errors = [];
  FINAL_PROSE_REQUIRED_FIELDS.forEach(field => {
    const text = normaliseString(safe[field], '');
    if(textHasAnyPattern(text, TUTOR_ABSTRACT_WORDING_PATTERNS)){
      errors.push(`${field} uses abstract AI-style wording.`);
    }
    const sentences = splitIntoSentences(text);
    if(sentences.length > 3){
      errors.push(`${field} should stay within 1-3 short sentences.`);
    }
    sentences.forEach(sentence => {
      const words = sentence.split(/\s+/).filter(Boolean);
      if(words.length > 28){
        errors.push(`${field} contains a long multi-clause sentence that breaks the spoken rhythm.`);
      }
    });
  });
  return errors;
}

function validateTutorPositiveSemanticRequirements(response = {}, envelope = {}){
  const safe = safeObject(response);
  const semanticEnvelope = buildSemanticEnvelope(envelope);
  const errors = [];
  const chartStory = normaliseString(safe.chartStory, '');
  const whyItMatters = normaliseString(safe.whyItMatters, '');
  const setupLocation = normaliseString(safe.setupLocation, '');
  const learningPoint = normaliseString(safe.learningPoint, '');
  const whatNext = normaliseString(safe.whatNext, '');
  const storyAndWhy = [chartStory, whyItMatters].join(' ');
  const fullText = [chartStory, whyItMatters, setupLocation, learningPoint, whatNext].join(' ');
  const chartStorySentences = splitIntoSentences(chartStory);
  const chartStoryFirstSentence = chartStorySentences[0] || '';
  const responseAbsentPatterns = [
    /\bbuyers have not shown enough\b/i,
    /\bno clear response from buyers\b/i,
    /\bthere has not been another strong green day yet\b/i,
    /\bno clear bounce\b/i,
    /\bbuyers have not stepped in strongly enough\b/i,
    /\bstill needs a clear response\b/i
  ];
  const responsePresentPatterns = [
    /\bbuyers (?:have )?(?:started to respond|responded|stepped in|are trying to stabilise|are trying to lift)\b/i,
    /\bbuyers tried to bounce\b/i,
    /\bthe bounce has started\b/i,
    /\bstrong green day appeared\b/i,
    /\bbuyers pushed the price higher\b/i,
    /\bbuyers have started to push\b/i,
    /\bbuyers are pushing\b/i,
    /\brebounding from\b/i
  ];
  const proofPatterns = [
    /\bneeds follow-through\b/i,
    /\bstill needs another strong close\b/i,
    /\bneeds buyers to back it up\b/i,
    /\bwait for proof\b/i,
    /\bwatch for proof\b/i,
    /\bwatch for follow-through\b/i,
    /\bneed to see buyers\b/i,
    /\bhold above\b/i,
    /\bbuild on the rebound\b/i,
    /\bbefore trusting\b/i
  ];
  const confirmedPatterns = [
    /\bconfirmed bounce\b/i,
    /\bconfirmation has already happened\b/i,
    /\bbuyers are defending support\b/i,
    /\brebound (?:is )?underway\b/i,
    /\bbuyers have regained control\b/i,
    /\bbuyers are back in control\b/i
  ];

  if(semanticEnvelope.buyerResponseSemantic === 'response_absent'){
    if(!textHasAnyPattern(storyAndWhy, responseAbsentPatterns)){
      errors.push('Tutor prose must clearly communicate that buyers have not shown enough yet when buyerResponseSemantic is response_absent.');
    }
    if(textHasAnyPattern(fullText, confirmedPatterns)){
      errors.push('Tutor prose must not imply a bounce is underway or confirmed when buyerResponseSemantic is response_absent.');
    }
  }

  if(semanticEnvelope.buyerResponseSemantic === 'response_present'){
    if(!textHasAnyPattern(storyAndWhy, responsePresentPatterns)){
      errors.push('Tutor prose must acknowledge that buyers are responding when buyerResponseSemantic is response_present.');
    }
    if(semanticEnvelope.confirmationSemantic !== 'follow_through_confirmed' && textHasAnyPattern(fullText, [/\bregained control\b/i, /\bback in control\b/i, /\btrend is healthy again\b/i])){
      errors.push('Tutor prose must not imply control has been regained while confirmation is still unconfirmed.');
    }
  }

  if(semanticEnvelope.confirmationSemantic === 'follow_through_unconfirmed'){
    if(!textHasAnyPattern(whatNext, proofPatterns)){
      errors.push('whatNext must ask for proof or follow-through when confirmationSemantic is follow_through_unconfirmed.');
    }
    if(textHasAnyPattern(whatNext, confirmedPatterns)){
      errors.push('whatNext must not imply confirmation has already happened when follow-through is still unconfirmed.');
    }
  }

  if(semanticEnvelope.dominantEventKey === 'failed_first_bounce_from_20ma' || /\bfailed\b.*\bbounce\b/.test(semanticEnvelope.dominantEvent)){
    if(textHasAnyPattern(whatNext, [/\bconfirmed bounce\b/i, /\bconfirmation of the bounce\b/i])){
      errors.push('whatNext for a failed-bounce event must ask for a new stronger buyer response or reclaim, not a "confirmed bounce".');
    }
  }

  if(semanticEnvelope.supportSemantic === 'support_present' && classifySupportNarrationSemantic(setupLocation) !== 'support_present'){
    errors.push('setupLocation must clearly describe active interaction with support when supportSemantic is support_present.');
  }

  if(semanticEnvelope.supportSemantic === 'support_failed'){
    if(classifySupportNarrationSemantic(setupLocation) !== 'support_failed' && !textHasAnyPattern(setupLocation, [/\blost support\b/i, /\bneeds time to rebuild\b/i, /\bneeds repair\b/i])){
      errors.push('setupLocation must describe the lost support and the need for repair when supportSemantic is support_failed.');
    }
  }

  if(inferQualitySemantic(semanticEnvelope) === 'fading'){
    const opening = openingSectionText(chartStory);
    if(!textHasAnyPattern(opening, [/\blosing quality\b/i, /\bquality is slipping\b/i, /\bquality is fading\b/i, /\bless clean\b/i, /\bmessier\b/i, /\bnot pushing back as strongly\b/i, /\bweakening\b/i])){
      errors.push('chartStory must lead with deterioration or loss of quality when the setup is fading.');
    }
  }

  const chartStoryLeadPatterns = eventLeadPatternsForEnvelope(semanticEnvelope);
  if(chartStoryLeadPatterns.length && !textHasAnyPattern(chartStoryFirstSentence, chartStoryLeadPatterns)){
    errors.push('chartStory first sentence must lead with the dominant event rather than broad context.');
  }
  if(chartStorySentences.length > 3){
    errors.push('chartStory must stay within three sentences.');
  }
  if(hasRepeatedSemanticState(chartStorySentences)){
    errors.push('chartStory must avoid repeating the same semantic state across multiple sentences.');
  }

  const learningPatterns = learningPointPatternsForEnvelope(semanticEnvelope);
  if(learningPatterns.length && !textHasAnyPattern(learningPoint, learningPatterns)){
    errors.push('learningPoint must teach a practical lesson tied to the current dominant event.');
  }
  const normalizedLearningPoint = learningPoint.toLowerCase().replace(/[^\w\s]/g, ' ').trim();
  const normalizedWhatNext = whatNext.toLowerCase().replace(/[^\w\s]/g, ' ').trim();
  if(normalizedLearningPoint && normalizedWhatNext && (normalizedLearningPoint === normalizedWhatNext || normalizedWhatNext.includes(normalizedLearningPoint))){
    errors.push('learningPoint must stay distinct from whatNext.');
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
    deterministicEventPacket
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
    'Use storyEvents as the ordered chronology of what happened first, what happened next, and where price is now.',
    'Use supportState.currentlyActive, supportState.distanceFromSupportPct, and currentPhase to avoid keeping old support-touch stories active after price has already moved on.',
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
    'Before writing the final Chart Guru prose, produce the internal trader interpretation from these structured chart facts.',
    '',
    JSON.stringify(safeObject(structuredFacts), null, 2)
  ].join('\n');
}

function buildProductionChartGuruFinalInstructions(){
  const styleGuide = [
    'Chart Guru Style Guide:',
    '- Sound like an experienced swing trader quietly explaining the chart to someone buying their first stock.',
    '- Write the way a real trader would speak out loud, not like a market note, memo, or AI summary.',
    '- Use ordinary spoken English that still makes sense to a beginner.',
    '- Start with what the beginner can see on the chart, then explain why traders care.',
    '- Prefer observable price behaviour over abstract trading language.',
    '- Explain what buyers and sellers are doing rather than leaning on generic concepts.',
    '- Keep sentences short. One idea per sentence.',
    '- Avoid awkward literal rewrites of semantic fields.',
    '- Do not sound corporate, polished, academic, or over-produced.',
    '- Do not lecture or define jargon like a textbook. Explain why traders care instead.',
    '- Prefer "This matters because..." over "This situation is significant because...".',
    '- Prefer "This pullback is not as clean as the earlier ones." over "The setup quality has deteriorated."',
    '- Prefer "Buyers have not shown enough strength yet." over "Buyer commitment is lacking."',
    '- Prefer "There has not been another strong green day yet, so traders still do not know if buyers are back." over "Buyers have not confirmed the bounce."',
    '- Prefer "buyers are trying to stabilise the chart" over "buyers are attempting to steady the action".',
    '- Prefer "buyers have not regained control" over "the rebound has not put them back in control".',
    '- Prefer "build a base" when the chart needs time to settle before improving.',
    '- Prefer phrases like "a strong green day appeared", "the first bounce did not last", "the stock has been drifting lower", or "buyers pushed the price higher" when they fit the trader interpretation.',
    '- For stabilisation semantics, use phrases like "trying to stabilise", "starting to settle", or "base-building" when accurate.',
    '- For buyer response semantics, use phrases like "buyers stepped in", "buyers responded", or "buyers are trying to lift it".',
    '- For seller control semantics, use phrases like "sellers are still in control", "selling pressure is still there", or "buyers have not taken control back" when accurate.',
    '- For rebuilding semantics, use phrases like "build a base", "repair the damage", or "rebuild before it improves" depending on the context.',
    '- For support semantics, use phrases like "near support", "testing support", "lost support", or "reclaim support" instead of abstract level language.',
    '- For follow-through semantics, use phrases like "needs follow-through", "still needs another strong close", or "needs buyers to back it up".',
    '- For failed-bounce semantics, use phrases like "the bounce failed", "buyers could not hold the rebound", or "the rebound faded quickly".',
    '- For momentum-fading semantics, use phrases like "momentum is fading", "the move is losing steam", or "the trend looks more tired now".',
    '- Avoid phrases like "favourable position", "buyer commitment", "waiting phase", "constructive backdrop", "market participants", "indicates potential", "demonstrates", "facilitates", and "in order to".',
    '- The beginner should feel: I understand what happened, why traders care, and what I would watch next.',
    '- Stay beginner-friendly, but keep the voice recognisably trader-like rather than polished, technical, or academic.'
  ].join('\n');
  return [
    'You are the Chart Guru tutor layer.',
    'Use plain English for a novice retail trader.',
    'Render only the supplied canonical narration contract into beginner-friendly teaching copy.',
    'Do not inspect raw chart evidence.',
    'Do not classify the event or invent new chart facts.',
    'Do not issue buy/sell advice or app verdicts.',
    'The contract is the sole authority. Never infer a different phase, support state, buyer control, follow-through, or next event.',
    'chartStory must open by naming the supplied phase in plain English and must not substitute another phase.',
    'whyItMatters explains only the supplied phase. setupLocation describes only the supplied support context. learningPoint teaches the phase-specific reusable principle. whatNext translates only nextRequiredEvent.',
    'Do not use away-from-support or extension wording unless phase is away_from_support or extended_from_support.',
    'Do not say buyers are in control unless buyerControl is confirmed. Do not say support is holding when structure is broken. Do not describe improvement when followThrough is stalled.',
    'For stalled_after_response, do not ask for a reset or new pullback; require follow-through only.',
    'Preserve the contract support location. Do not rewrite a near-support response as price being away from support.',
    'Section jobs are fixed. chartStory: observable behaviour first, then what it means. whyItMatters: why traders care now, without repeating the story. setupLocation: where price sits relative to support or resistance in plain English. learningPoint: one practical lesson. whatNext: one concrete observable signal.',
    'chartStory should usually be two short sentences. Sentence 1: what just happened. Sentence 2: what that means now. Use a third short sentence only when a secondary event is essential.',
    'chartStory first sentence must lead with the dominant event itself, not a generic recap of the broader trend.',
    'Do not write chartStory as a chopped-up list of short fragments or as one long essay sentence.',
    'If buyerResponseSemantic is response_absent, make it clear that buyers have not shown enough yet and do not imply a bounce is underway or confirmed.',
    'If buyerResponseSemantic is response_present, acknowledge that buyers are responding, but do not imply control has been regained unless confirmationSemantic supports it.',
    'If confirmationSemantic is follow_through_unconfirmed, whatNext must ask for proof or follow-through rather than implying confirmation already happened.',
    'For constructive pullback cases near support with buyers still absent or weak and follow-through unconfirmed, prefer phrases like "buyers still need to step in", "buyers have not followed through yet", "the bounce still needs proof", or "the pullback is worth watching, but it is not ready yet".',
    'For failed-bounce cases, whatNext must ask for a new stronger buyer response, a stronger reclaim of the 20-day average, or buyers producing a better bounce and holding it. Do not say "confirmed bounce" or "confirmation of the bounce" because the original bounce already failed.',
    'If supportSemantic is support_present, setupLocation must describe active interaction with support.',
    'If supportSemantic is support_failed, setupLocation must describe the lost support and the need for repair.',
    'If the setup is fading in quality, chartStory must lead with that deterioration rather than generic prior trend context.',
    'learningPoint should be one or two short sentences. Teach one reusable lesson that comes directly from the dominant event. Do not give generic advice like "be cautious", "wait for confirmation", or "look for clear signals".',
    'learningPoint should explain the lesson of the current event, not repeat chartStory and not turn into whatNext.',
    'Do not start learningPoint with "watch", "look for", or "wait for". That belongs in whatNext, not in the lesson.',
    'Avoid vague chartStory wording like "potential setup", "useful area", or "promising chart" when the trader interpretation gives a more concrete event such as a pullback, support test, failed bounce, or fading quality.',
    'If supportLabel is present in the tutor input, preserve it in plain English instead of replacing it with vague location wording.',
    'If supportLabel is empty, stay honest. Do not invent a moving average or named support zone.',
    'Compact semantic-state examples:',
    '- support present + response absent + confirmation unconfirmed: "Price has reached an important support area, but buyers have not pushed back yet. The location is useful, but the chart still needs a clear response."',
    '- support present + response present + confirmation unconfirmed: "Buyers have started to respond at support, but the bounce still needs to hold. The first reaction is encouraging, not confirmed."',
    '- support failed + response present + repair unconfirmed: "Support has already failed. Buyers are trying to stabilise the chart, but they have not repaired the damage yet."',
    '- quality fading + trend partly intact: "This setup is losing quality. The pullbacks are becoming messier, and buyers are not pushing back as strongly as before."',
    '- constructive but early: "The stock is easing toward the 20-day average, but it is still early. Buyers have not shown enough yet."',
    'Examples of practical learning points: "A support touch is not enough on its own. Traders still need to see what buyers do next." "A good support area is only the starting point. Traders still need to see buyers defend it." "A damaged chart can bounce before it is fixed."',
    'More learning-point examples by event: "A failed first bounce is a reason to stay patient." "A healthy pullback can still be too early." "Messier pullbacks usually mean harder timing." "A promising chart is not the same as a ready trade."',
    'Preferred chartStory formulas by event meaning:',
    '- failed bounce: "Buyers tried to bounce from support, but the move faded quickly. That means support has not proved itself yet."',
    '- first support test without confirmation: "The stock has reached its first proper test of support. That means traders are watching for a buyer response, not assuming support is already holding."',
    '- constructive pullback without confirmation: "The stock is pulling back in a controlled way toward support. That means the trend is still intact, but buyers still need to follow through."',
    '- fading quality: "The pullbacks are getting messier. That tells traders the setup is losing quality."',
    '- constructive but early: "The stock is only starting to pull back toward support. That means the setup is still early and buyers have not shown enough yet."',
    'Preferred learningPoint formulas by semantic meaning:',
    '- support present + response absent: "A good support area is only a starting point. Traders still need to see buyers defend it."',
    '- support present + response present + follow-through unconfirmed: "The first reaction from support is encouraging, but one response is not enough on its own."',
    '- support failed + response present + repair unconfirmed: "A damaged chart can bounce before it is fixed. Traders still need to see a base and a reclaim of lost support."',
    '- quality fading: "A trend can stay up while the setup gets harder to trade. Messier pullbacks usually mean worse timing."',
    '- constructive but early: "A promising location is not the same as a ready trade. Buyers still need to show up."',
    'For VRT-style fading cases with no named support label, keep setupLocation honest: "The trend has not fully broken, but the recent pullbacks are less orderly. That makes the current timing harder to trust."',
    'For GEV-style early cases with a named support label, prefer that label directly: "Price is only starting to pull back toward the 20-day average, so the chart has not reached a clear decision point yet."',
    'Avoid generic lesson wording like "it is important to", "it is crucial to", "always look for", "be cautious", or "before making any decisions".',
    'Each section should sound like a calm spoken explanation, not like generated commentary.',
    'In chartStory, begin with the clearest observable behaviour from the trader interpretation before explaining what it means.',
    'In whyItMatters, explain why traders care in plain language.',
    'In setupLocation, describe where the setup sits in simple chart terms without drifting into abstract commentary.',
    'In learningPoint, teach naturally by explaining what traders want to see, not by lecturing.',
    'In whatNext, make the next watch signal feel practical and easy to picture on the chart.',
    styleGuide,
    'Return exactly one JSON object.',
    'Return only these fields as JSON strings: chartStory, whyItMatters, setupLocation, learningPoint, whatNext.',
    'If a field is unknown, return an empty string.'
  ].join('\n');
}

function buildProductionChartGuruFinalPrompt(canonicalNarrationContract, originalPrompt = ''){
  return [
    'Canonical narration contract to render into Chart Guru teaching prose:',
    JSON.stringify(buildCanonicalNarrationRendererInput(canonicalNarrationContract), null, 2)
  ].join('\n');
}

function buildEmptyChartCoach(explanationFacts = []){
  return {
    primaryStory:null,
    sections:[],
    summaryText:'',
    source:'',
    renderVersion:CHART_GURU_RENDER_VERSION,
    explanationFacts:normaliseStringArray(explanationFacts),
    diagnostics:{
      meta:{
        deterministicContractVersion:CHART_GURU_DETERMINISTIC_CONTRACT_VERSION,
        interpretationPromptVersion:CHART_GURU_INTERPRETATION_PROMPT_VERSION,
        finalPromptVersion:CHART_GURU_FINAL_PROMPT_VERSION,
        renderVersion:CHART_GURU_RENDER_VERSION,
        narrationSource:'validation_fallback'
      }
    }
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
      meta:{
        deterministicContractVersion:CHART_GURU_DETERMINISTIC_CONTRACT_VERSION,
        interpretationPromptVersion:CHART_GURU_INTERPRETATION_PROMPT_VERSION,
        finalPromptVersion:CHART_GURU_FINAL_PROMPT_VERSION,
        renderVersion:CHART_GURU_RENDER_VERSION,
        narrationSource:'openai_narrator'
      },
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
  errors.push(...validateTutorPositiveSemanticRequirements(response, envelope));
  errors.push(...validateTutorSectionRoles(response, envelope));
  errors.push(...validateTutorVoice(response));
  return {ok:errors.length === 0, errors};
}

async function sendStrictSchemaOpenAiRequest(apiKey, model, instructions, prompt, schemaName, schema, maxOutputTokens = 600){
  return sendStrictSchemaOpenAiContentRequest(
    apiKey,
    model,
    instructions,
    [{
      type:'input_text',
      text:String(prompt || '')
    }],
    schemaName,
    schema,
    maxOutputTokens
  );
}

async function sendStrictSchemaOpenAiContentRequest(apiKey, model, instructions, content, schemaName, schema, maxOutputTokens = 600){
  let upstream;
  let upstreamJson = {};
  const buildBody = () => ({
    model,
    instructions,
    input:[{
      role:'user',
      content:Array.isArray(content) ? content : []
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
  });

  try{
    ({ upstream, payload: upstreamJson } = await sendOpenAiRequest(
      apiKey,
      buildBody()
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
        buildBody()
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
    renderVersion:CHART_GURU_RENDER_VERSION,
    explanationFacts:['parse_fallback'],
    diagnostics:{
      meta:{
        deterministicContractVersion:CHART_GURU_DETERMINISTIC_CONTRACT_VERSION,
        interpretationPromptVersion:CHART_GURU_INTERPRETATION_PROMPT_VERSION,
        finalPromptVersion:CHART_GURU_FINAL_PROMPT_VERSION,
        renderVersion:CHART_GURU_RENDER_VERSION,
        narrationSource:'validation_fallback'
      }
    }
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

function shouldUsePrimaryAnalysisParseFallback(error = {}, payload = {}, verificationOnly = false){
  return verificationOnly !== true
    && String(error && error.stage || '').trim() === 'chart_guru_primary_analysis'
    && /parsed as json/i.test(String(error && error.message || ''))
    && payload
    && payload.trustedMarketContext
    && typeof payload.trustedMarketContext === 'object';
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
    if(verificationOnly){
      ({ upstream, payload: upstreamJson } = await sendOpenAiRequest(
        apiKey,
        buildRequestBody(model, instructions, activeContent, 600)
      ));
    }else{
      const primaryAnalysisResult = await sendStrictSchemaOpenAiContentRequest(
        apiKey,
        model,
        instructions,
        activeContent,
        'chart_guru_primary_analysis',
        PRIMARY_ANALYSIS_SCHEMA,
        1000
      );
      upstream = { ok:true, status:200 };
      upstreamJson = { output_text: primaryAnalysisResult.rawText };
    }
  }catch(err){
    if(shouldUsePrimaryAnalysisParseFallback(err, payload, verificationOnly)){
      const analysis = normaliseAnalysis(buildMalformedJsonFallbackAnalysis(payload, err.raw || ''), payload);
      return jsonResponse(200, {
        ok:true,
        model,
        analysis
      });
    }
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
      if(verificationOnly){
        ({ upstream, payload: upstreamJson } = await sendOpenAiRequest(
          apiKey,
          buildRequestBody(model, instructions, activeContent, 600)
        ));
      }else{
        const primaryAnalysisResult = await sendStrictSchemaOpenAiContentRequest(
          apiKey,
          model,
          instructions,
          activeContent,
          'chart_guru_primary_analysis',
          PRIMARY_ANALYSIS_SCHEMA,
          1000
        );
        upstream = { ok:true, status:200 };
        upstreamJson = { output_text: primaryAnalysisResult.rawText };
      }
    }catch(err){
      if(shouldUsePrimaryAnalysisParseFallback(err, payload, verificationOnly)){
        const analysis = normaliseAnalysis(buildMalformedJsonFallbackAnalysis(payload, err.raw || ''), payload);
        return jsonResponse(200, {
          ok:true,
          model,
          analysis
        });
      }
      const message = err?.name === 'AbortError'
        ? 'OpenAI request timed out.'
        : 'Could not reach the OpenAI API.';
      return jsonResponse(502, { error: message });
    }
  }

  if(!upstream.ok && RETRYABLE_STATUSES.has(upstream.status)){
    await sleep(800);

    try{
      if(verificationOnly){
        ({ upstream, payload: upstreamJson } = await sendOpenAiRequest(
          apiKey,
          buildRequestBody(model, instructions, activeContent, 600)
        ));
      }else{
        const primaryAnalysisResult = await sendStrictSchemaOpenAiContentRequest(
          apiKey,
          model,
          instructions,
          activeContent,
          'chart_guru_primary_analysis',
          PRIMARY_ANALYSIS_SCHEMA,
          1000
        );
        upstream = { ok:true, status:200 };
        upstreamJson = { output_text: primaryAnalysisResult.rawText };
      }
    }catch(err){
      if(shouldUsePrimaryAnalysisParseFallback(err, payload, verificationOnly)){
        const analysis = normaliseAnalysis(buildMalformedJsonFallbackAnalysis(payload, err.raw || ''), payload);
        return jsonResponse(200, {
          ok:true,
          model,
          analysis
        });
      }
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
    analysis.deterministicEventPacket = structuredFacts.deterministicEventPacket;
    const canonicalNarrationContract = buildCanonicalNarrationContract(payload.canonicalNarrationContract || structuredFacts.deterministicEventPacket, {
      structure:payload.structureState,
      trend:payload.trendState,
      volume:payload.volumeState,
      market:/below/i.test(String(payload.marketStatus || '')) ? 'weak' : 'supportive',
      verdict:analysis.verdict,
      nextChartNeed:payload.canonicalNarrationContract && payload.canonicalNarrationContract.nextRequiredEvent || (structuredFacts.deterministicEventPacket.currentPhase === 'support_failed' ? 'repair' : '')
    });
    const contractValidation = validateCanonicalNarrationContract(canonicalNarrationContract);
    analysis.canonicalNarrationContract = canonicalNarrationContract;
    const narrationErrors = contractValidation.errors.slice();
    let prose = null;
    let narrationSource = 'deterministic_fallback';
    if(contractValidation.ok){
      const finalPrompt = buildProductionChartGuruFinalPrompt(canonicalNarrationContract);
      try{
        const first = await sendStrictSchemaOpenAiRequest(apiKey, model, buildProductionChartGuruFinalInstructions(), finalPrompt, 'chart_guru_final_prose', FINAL_PROSE_SCHEMA, 700);
        const firstValidation = validateNarrationProseAgainstContract(first.parsed, canonicalNarrationContract);
        if(firstValidation.ok){ prose = first.parsed; narrationSource = 'openai'; }
        else {
          narrationErrors.push(...firstValidation.errors.map(code => `first:${code}`));
          const retryPrompt = `${finalPrompt}\n\nCorrect only these failed contract constraints: ${firstValidation.errors.join(', ')}.`;
          const retry = await sendStrictSchemaOpenAiRequest(apiKey, model, buildProductionChartGuruFinalInstructions(), retryPrompt, 'chart_guru_final_prose_retry', FINAL_PROSE_SCHEMA, 700);
          const retryValidation = validateNarrationProseAgainstContract(retry.parsed, canonicalNarrationContract);
          if(retryValidation.ok){ prose = retry.parsed; narrationSource = 'retry'; }
          else narrationErrors.push(...retryValidation.errors.map(code => `retry:${code}`));
        }
      }catch(err){ narrationErrors.push(`request:${String(err && err.stage || 'failed')}`); }
    }
    if(!prose) prose = deterministicNarrationFallback(canonicalNarrationContract);
    analysis = mergeTwoStepNarrativeIntoAnalysis(analysis, prose, canonicalNarrationContract, structuredFacts);
    delete analysis.traderInterpretation;
    analysis.canonicalNarrationContract = canonicalNarrationContract;
    analysis.chartCoach.diagnostics = analysis.chartCoach.diagnostics || {};
    analysis.chartCoach.diagnostics.narration = {contractVersion:canonicalNarrationContract.version, validationOutcome:contractValidation.ok ? (narrationErrors.length ? 'recovered' : 'valid') : 'invalid_contract', proseSource:narrationSource, validationErrors:narrationErrors};
    analysis.chartCoach.source = narrationSource === 'deterministic_fallback' ? 'deterministic_fallback' : 'openai_canonical_narration';
  }catch(err){
    console.error('Chart Guru canonical narration pipeline failed', {
      model,
      ticker:String(payload.ticker || ''),
      message:String(err && err.message || 'Unknown error'),
      status:Number.isFinite(Number(err && err.status)) ? Number(err.status) : null,
      raw:err && Object.prototype.hasOwnProperty.call(err, 'raw') ? err.raw : null
    });
    const contract = buildCanonicalNarrationContract(analysis.deterministicEventPacket, {structure:payload.structureState, trend:payload.trendState, volume:payload.volumeState});
    const prose = deterministicNarrationFallback(contract);
    analysis = mergeTwoStepNarrativeIntoAnalysis(analysis, prose, contract, {deterministicEventPacket:analysis.deterministicEventPacket});
    delete analysis.traderInterpretation;
    analysis.canonicalNarrationContract = contract;
    analysis.chartCoach.diagnostics = analysis.chartCoach.diagnostics || {};
    analysis.chartCoach.diagnostics.narration = {contractVersion:contract.version, validationOutcome:'pipeline_error', proseSource:'deterministic_fallback', validationErrors:['pipeline_error']};
    analysis.chartCoach.source = 'deterministic_fallback';
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
  buildRequestBody,
  buildStrictSchemaRequestBody,
  buildVerificationOnlyContent,
  buildProductionAnalysisInstructionLines,
  normalizeDeterministicEventPacket,
  buildCanonicalNarrationContract,
  validateCanonicalNarrationContract,
  buildCanonicalNarrationRendererInput,
  deterministicNarrationFallback,
  validateNarrationProseAgainstContract,
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
  deterministicNearSupportContext,
  classifySupportNarrationSemantic,
  classifyBuyerResponseSemantic,
  classifyRepairNarrationSemantic,
  semanticContradictionsForEnvelope,
  validateTutorPositiveSemanticRequirements,
  validateTutorSectionRoles,
  validateTutorVoice,
  validateTraderInterpretationResponse,
  validateFinalProseResponse,
  PRIMARY_ANALYSIS_SCHEMA,
  TRADER_INTERPRETATION_SCHEMA,
  FINAL_PROSE_SCHEMA
};
