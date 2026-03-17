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

function buildRequestBody(model, instructions, content){
  return {
    model,
    instructions,
    input: [{ role: 'user', content }],
    max_output_tokens: 300
  };
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

function normaliseAnalysis(obj){
  return {
    setup_type: normaliseString(obj?.setup_type, ''),
    verdict: normaliseString(obj?.verdict, 'Watch'),
    plain_english_chart_read: normaliseString(obj?.plain_english_chart_read, ''),
    entry: normaliseString(obj?.entry, ''),
    stop: normaliseString(obj?.stop, ''),
    first_target: normaliseString(obj?.first_target, ''),
    risk_per_share: normaliseString(obj?.risk_per_share, ''),
    position_size: normaliseString(obj?.position_size, ''),
    reward_risk: obj?.reward_risk == null || obj?.reward_risk === '' ? null : normaliseString(obj?.reward_risk, ''),
    quality_score: Number.isFinite(Number(obj?.quality_score)) ? Number(obj?.quality_score) : null,
    confidence_score: Number.isFinite(Number(obj?.confidence_score)) ? Number(obj?.confidence_score) : null,
    key_reasons: normaliseStringArray(obj?.key_reasons),
    risks: normaliseStringArray(obj?.risks),
    final_verdict: normaliseString(obj?.final_verdict, '')
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

  if(!payload.ticker || !payload.marketStatus || !prompt){
    return jsonResponse(400, {
      error: 'Missing ticker, market status, or prompt.'
    });
  }

  if(prompt.length > 12000){
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

  const content = [
    { type: 'input_text', text: tightenedPrompt }
  ];

  if(chartRef && typeof chartRef.dataUrl === 'string' && /^data:image\/(png|jpeg);base64,/i.test(chartRef.dataUrl)){
    if(chartRef.dataUrl.length > MAX_CHART_DATA_URL_LENGTH){
      return jsonResponse(413, {
        error: 'Chart image is too large. Upload a smaller PNG or JPG screenshot.'
      });
    }

    content.push({
      type: 'input_image',
      image_url: chartRef.dataUrl,
      detail: 'low'
    });
  }

  const instructions = [
    'Analyse a Quality Pullback stock setup.',
    'Use plain English.',
    'Respect the supplied market status and risk limits.',
    'Do not invent chart details that are not provided.',
    'Return exactly one JSON object.',
    'Verdict must be one of: Watch, Near Entry, Entry, Avoid.',
    'If a field is unknown, return null.'
  ].join('\n');

  let upstream;
  let upstreamJson = {};
  let activeContent = content;

  try{
    ({ upstream, payload: upstreamJson } = await sendOpenAiRequest(
      apiKey,
      buildRequestBody(model, instructions, activeContent)
    ));
  }catch(err){
    const message = err?.name === 'AbortError'
      ? 'OpenAI request timed out.'
      : 'Could not reach the OpenAI API.';
    return jsonResponse(502, { error: message });
  }

  if(!upstream.ok && upstream.status === 400 && activeContent.length > 1){
    const originalMessage = extractOpenAiErrorMessage(upstreamJson);

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
        buildRequestBody(model, instructions, activeContent)
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
        buildRequestBody(model, instructions, activeContent)
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

  return jsonResponse(200, {
    ok: true,
    model,
    analysis
  });
};
