const { vapidConfigPresent } = require('./lib/push');

const corsHeaders = {
  'Content-Type':'application/json',
  'Cache-Control':'no-store',
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'Content-Type',
  'Access-Control-Allow-Methods':'GET, OPTIONS'
};

function jsonResponse(statusCode, body){
  return {
    statusCode,
    headers:corsHeaders,
    body:JSON.stringify(body)
  };
}

exports.handler = async function handler(event){
  if(event.httpMethod === 'OPTIONS') return jsonResponse(200, {ok:true});
  if(event.httpMethod !== 'GET') return jsonResponse(405, {error:'Method not allowed'});
  return jsonResponse(200, {
    ok:true,
    enabled:vapidConfigPresent(),
    publicKey:process.env.VAPID_PUBLIC_KEY || ''
  });
};
