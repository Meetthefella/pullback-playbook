const { loadPushSubscriptions, savePushSubscriptions } = require('./lib/tracked-store');
const { corsHeadersForEvent, guardTrustedOrigin } = require('./lib/request-guard');

function jsonResponse(event, statusCode, body){
  return {
    statusCode,
    headers:corsHeadersForEvent(event, 'POST, OPTIONS'),
    body:JSON.stringify(body)
  };
}

exports.handler = async function handler(event){
  if(!guardTrustedOrigin(event)) return jsonResponse(event, 403, {error:'Forbidden'});
  if(event.httpMethod === 'OPTIONS') return jsonResponse(event, 200, {ok:true});
  if(event.httpMethod !== 'POST') return jsonResponse(event, 405, {error:'Method not allowed'});
  let body;
  try{
    body = JSON.parse(event.body || '{}');
  }catch(error){
    return jsonResponse(event, 400, {error:'Invalid JSON body.'});
  }
  const subscription = body.subscription && typeof body.subscription === 'object' ? body.subscription : null;
  if(!subscription || !subscription.endpoint){
    return jsonResponse(event, 400, {error:'Missing push subscription.'});
  }
  const subscriptions = await loadPushSubscriptions();
  const endpoint = String(subscription.endpoint || '');
  const now = new Date().toISOString();
  const next = subscriptions.filter(item => String(item.endpoint || '') !== endpoint);
  next.push({
    ...subscription,
    createdAt:now,
    updatedAt:now
  });
  await savePushSubscriptions(next);
  return jsonResponse(event, 200, {ok:true});
};
