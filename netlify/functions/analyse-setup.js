const corsHeaders = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const MAX_CHART_DATA_URL_LENGTH = 6 * 1024 * 1024;
const OPENAI_TIMEOUT_MS = 45000;

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
    'You are analysing a Quality Pullback stock setup for a UK retail trader.',
    'Return JSON only.',
    'Use verdict exactly one of: Watch, Near Entry, Entry, Avoid.',
    'Use plain English with no jargon-heavy phrasing.',
    'Respect the supplied market status and fixed risk rules.',
    'Do not invent chart details when the screenshot is unclear or missing.'
  ].join('\n');

  const requestBody = {
    model,
    instructions,
    input:[{role:'user', content}],
    text:{format:{type:'json_object'}}
  };

  let upstream;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
  try{
    upstream = await fetch('https://api.openai.com/v1/responses', {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        Authorization:`Bearer ${apiKey}`
      },
      body:JSON.stringify(requestBody),
      signal:controller.signal
    });
  }catch(err){
    const message = err && err.name === 'AbortError' ? 'OpenAI request timed out.' : 'Could not reach the OpenAI API.';
    return jsonResponse(502, {error:message});
  }finally{
    clearTimeout(timeout);
  }

  const upstreamJson = await upstream.json().catch(() => ({}));
  if(!upstream.ok){
    const message = upstreamJson && upstreamJson.error && upstreamJson.error.message ? upstreamJson.error.message : 'OpenAI request failed.';
    return jsonResponse(upstream.status, {error:message});
  }

  const text = extractOutputText(upstreamJson);
  if(!text) return jsonResponse(502, {error:'OpenAI returned no text output.'});

  let analysis;
  try{
    analysis = JSON.parse(text);
  }catch(err){
    return jsonResponse(502, {error:'OpenAI returned non-JSON output.', raw:text});
  }

  return jsonResponse(200, {
    ok:true,
    model,
    analysis
  });
};
