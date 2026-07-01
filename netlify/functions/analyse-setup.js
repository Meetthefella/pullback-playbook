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
    sections:[
      {key:'trend', icon:'📈', label:'Trend', text:summary, confidence:0.72, teachingFocus:false, source:'deterministic_parse_fallback'},
      {key:'what_next', icon:'🎯', label:'What next?', text:'Look for the next close to confirm whether buyers are improving or sellers are still in control.', confidence:0.62, teachingFocus:false, source:'deterministic_parse_fallback'}
    ],
    summaryText:`📈 Trend: ${summary}\n🎯 What next?: Look for the next close to confirm whether buyers are improving or sellers are still in control.`,
    source:'deterministic_parse_fallback',
    renderVersion:'chart-coach-v1',
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
  const chartCoachSource = normalizeObject(obj?.chartCoach || obj?.chart_coach);
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
    : [
      'Analyse a Quality Pullback chart as Chart Coach, an observation-only educational feature.',
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
      'chartCoach is the main educational output.',
      'chartCoach.sections must contain at most 6 relevant emoji-led sections.',
      'The final section should usually be What next?.',
      'Expand only the strongest teaching opportunity with one extra beginner-friendly learning sentence.',
      'Return exactly one JSON object.',
      'Return evidence fields only; ai_observation_only must be true.',
      'If a field is unknown, return null.'
    ].join('\n');

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

  const analysis = normaliseAnalysis(parsed, payload);

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
