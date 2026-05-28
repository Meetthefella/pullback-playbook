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

function normaliseAnalysis(obj){
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
  const coachSummary = normaliseString(obj?.coach_summary || obj?.plain_english_chart_read || obj?.chart_read, '');
  return {
    setup_type: normaliseString(obj?.setup_type, ''),
    verdict: 'Watch',
    coach_summary: coachSummary,
    plain_english_chart_read: coachSummary,
    visible_ticker: normaliseString(obj?.visible_ticker, ''),
    visible_timeframe: normaliseString(obj?.visible_timeframe, ''),
    visible_latest_price: normaliseNumber(obj?.visible_latest_price),
    visible_ma20: normaliseNumber(obj?.visible_ma20),
    visible_ma50: normaliseNumber(obj?.visible_ma50),
    visible_ma200: normaliseNumber(obj?.visible_ma200),
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
      'Set coach_summary, plain_english_chart_read, constructive_evidence, risk_evidence, and what_needs_to_improve to empty values.',
      'If a field is unknown, return null.'
    ].join('\n')
    : [
      'Analyse a Quality Pullback chart as an observation-only chart coach.',
      'Use plain English for a novice retail trader.',
      'Be honest about uncertainty.',
      'Do not invent chart details that are not provided.',
      'Do not issue buy/sell advice.',
      'Do not assign the app final readiness label, trading action, verdict, state, bucket, tone, promotion/demotion state, or score.',
      'The deterministic app resolver will decide final state.',
      'If a chart image is attached, extract visible facts only: visible ticker, timeframe, latest price, moving average values, visible price/date range, and confidence.',
      'If numeric chart labels are visible but cannot be confidently assigned to latest price or a specific moving average, include them in visible_numeric_labels.',
      'TradingView mobile/narrow screenshots may crop MA legend text or numeric labels. If an MA line is visible but its value is unreadable, report the line as visible and keep the numeric value null.',
      'Do not fabricate MA values. Visibility can be partial/inferred; numeric values require readable text.',
      'Do not decide whether the chart is authentic. The app will compare extracted facts against trusted scanner and market data.',
      'Legacy fallback only: if deterministic facts are not visible enough and the chart/ticker match looks doubtful, return chart_match_status as mismatch or unclear and explain chart_match_warning.',
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

    return jsonResponse(502, {
      error: 'OpenAI response could not be parsed as JSON.',
      raw: rawText || null
    });
  }

  const analysis = normaliseAnalysis(parsed);

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
