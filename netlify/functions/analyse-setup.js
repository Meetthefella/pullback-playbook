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
const analysisSchema = {
  type:'object',
  additionalProperties:false,
  required:['verdict','plain_english_chart_read','entry','stop','first_target','risk_per_share','position_size','quality_score','key_reasons','risks','final_verdict'],
  properties:{
    verdict:{type:'string', enum:['Watch','Near Entry','Entry','Avoid']},
    plain_english_chart_read:{type:'string'},
    entry:{type:'string'},
    stop:{type:'string'},
    first_target:{type:'string'},
    risk_per_share:{type:'string'},
    position_size:{type:'string'},
    quality_score:{type:'integer'},
    key_reasons:{type:'array', items:{type:'string'}},
    risks:{type:'array', items:{type:'string'}},
    final_verdict:{type:'string'}
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
  if(typeof payload.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();
  const messages = Array.isArray(payload.output) ? payload.output : [];
  for(const message of messages){
    const content = Array.isArray(message.content) ? message.content : [];
    for(const item of content){
      if(item && typeof item.text === 'string' && item.text.trim()) return item.text.trim();
    }
  }
  return '';
}

function extractStructuredAnalysis(payload){
  if(payload && payload.output_parsed && typeof payload.output_parsed === 'object'){
    return payload.output_parsed;
  }
  const text = extractOutputText(payload);
  if(!text) return null;
  return JSON.parse(text);
}

function extractOpenAiErrorMessage(payload){
  if(payload && payload.error && typeof payload.error.message === 'string' && payload.error.message.trim()){
    return payload.error.message.trim();
  }
  return '';
}

function sleep(ms){
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildRequestBody(model, instructions, content, formatType){
  if(formatType === 'json_schema'){
    return {
      model,
      instructions,
      input:[{role:'user', content}],
      text:{
        format:{
          type:'json_schema',
          strict:true,
          schema:analysisSchema
        }
      },
      max_output_tokens:300
    };
  }
  return {
    model,
    instructions,
    input:[{role:'user', content}],
    text:{format:{type:'json_object'}},
    max_output_tokens:300
  };
}

async function sendOpenAiRequest(apiKey, requestBody){
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
  try{
    const upstream = await fetch('https://api.openai.com/v1/responses', {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        Authorization:`Bearer ${apiKey}`
      },
      body:JSON.stringify(requestBody),
      signal:controller.signal
    });
    const payload = await upstream.json().catch(() => ({}));
    return {upstream, payload};
  }finally{
    clearTimeout(timeout);
  }
}

exports.handler = async function handler(event){
  if(event.httpMethod === 'OPTIONS') return jsonResponse(200, {ok:true});
  if(event.httpMethod !== 'POST') return jsonResponse(405, {error:'Method not allowed'});

  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-5.4';
  if(!apiKey) return jsonResponse(500, {error:'OPENAI_API_KEY is not configured on the server.'});

  let body;
  try{
    body = JSON.parse(event.body || '{}');
  }catch(err){
    return jsonResponse(400, {error:'Invalid JSON body.'});
  }

  const payload = body.payload || {};
  const prompt = String(body.prompt || '').trim();
  const chartRef = body.chartRef || null;
  if(!payload.ticker || !payload.marketStatus || !prompt){
    return jsonResponse(400, {error:'Missing ticker, market status, or prompt.'});
  }
  if(prompt.length > 12000){
    return jsonResponse(400, {error:'Prompt is too large for the serverless endpoint.'});
  }

  const content = [{type:'input_text', text:prompt}];
  if(chartRef && typeof chartRef.dataUrl === 'string' && /^data:image\/(png|jpeg);base64,/i.test(chartRef.dataUrl)){
    if(chartRef.dataUrl.length > MAX_CHART_DATA_URL_LENGTH){
      return jsonResponse(413, {error:'Chart image is too large. Upload a smaller PNG or JPG screenshot.'});
    }
    content.push({type:'input_image', image_url:chartRef.dataUrl, detail:'low'});
  }

  const instructions = [
    'Analyse a Quality Pullback stock setup.',
    'Return JSON only.',
    'Use verdict exactly one of: Watch, Near Entry, Entry, Avoid.',
    'Use plain English.',
    'Respect market status and risk limits.',
    'Do not invent chart details.'
  ].join('\n');

  let upstream;
  let upstreamJson = {};
  let formatType = 'json_schema';
  let activeContent = content;
  try{
    ({upstream, payload:upstreamJson} = await sendOpenAiRequest(apiKey, buildRequestBody(model, instructions, activeContent, formatType)));
  }catch(err){
    const message = err && err.name === 'AbortError' ? 'OpenAI request timed out.' : 'Could not reach the OpenAI API.';
    return jsonResponse(502, {error:message});
  }

  if(!upstream.ok && upstream.status === 400 && activeContent.length > 1){
    const originalMessage = extractOpenAiErrorMessage(upstreamJson);
    console.error('OpenAI API rejected image input, retrying without chart', {
      status:upstream.status,
      model,
      ticker:String(payload.ticker || ''),
      message:originalMessage || 'OpenAI request failed.'
    });
    activeContent = activeContent.filter(item => item.type !== 'input_image');
    try{
      ({upstream, payload:upstreamJson} = await sendOpenAiRequest(apiKey, buildRequestBody(model, instructions, activeContent, formatType)));
    }catch(err){
      const message = err && err.name === 'AbortError' ? 'OpenAI request timed out.' : 'Could not reach the OpenAI API.';
      return jsonResponse(502, {error:message});
    }
  }

  if(!upstream.ok && RETRYABLE_STATUSES.has(upstream.status)){
    await sleep(800);
    try{
      ({upstream, payload:upstreamJson} = await sendOpenAiRequest(apiKey, buildRequestBody(model, instructions, activeContent, formatType)));
    }catch(err){
      const message = err && err.name === 'AbortError' ? 'OpenAI request timed out.' : 'Could not reach the OpenAI API.';
      return jsonResponse(502, {error:message});
    }
  }

  if(!upstream.ok && upstream.status === 400 && formatType === 'json_schema'){
    const originalMessage = extractOpenAiErrorMessage(upstreamJson);
    console.error('OpenAI API rejected structured output request, retrying with JSON mode', {
      status:upstream.status,
      model,
      ticker:String(payload.ticker || ''),
      message:originalMessage || 'OpenAI request failed.'
    });
    formatType = 'json_object';
    try{
      ({upstream, payload:upstreamJson} = await sendOpenAiRequest(apiKey, buildRequestBody(model, instructions, activeContent, formatType)));
    }catch(err){
      const message = err && err.name === 'AbortError' ? 'OpenAI request timed out.' : 'Could not reach the OpenAI API.';
      return jsonResponse(502, {error:message});
    }
  }

  if(!upstream.ok){
    const openAiMessage = extractOpenAiErrorMessage(upstreamJson) || 'OpenAI request failed.';
    console.error('OpenAI API error', {
      status:upstream.status,
      model,
      ticker:String(payload.ticker || ''),
      message:openAiMessage,
      error:upstreamJson && upstreamJson.error ? upstreamJson.error : upstreamJson
    });
    if(upstream.status === 401){
      return jsonResponse(401, {error:'OpenAI authentication failed. Check OPENAI_API_KEY on the server.'});
    }
    if(upstream.status === 429){
      return jsonResponse(429, {error:'OpenAI rate limit reached. Retry in a moment.'});
    }
    return jsonResponse(upstream.status, {error:openAiMessage});
  }

  let analysis;
  try{
    analysis = extractStructuredAnalysis(upstreamJson);
  }catch(err){
    const text = extractOutputText(upstreamJson);
    console.error('OpenAI API returned unparsable analysis output', {
      model,
      ticker:String(payload.ticker || ''),
      raw:text || null
    });
    return jsonResponse(502, {error:'OpenAI returned non-JSON output.', raw:text});
  }
  if(!analysis || typeof analysis !== 'object') return jsonResponse(502, {error:'OpenAI returned no usable analysis output.'});

  return jsonResponse(200, {
    ok:true,
    model,
    analysis
  });
};
