const { corsHeadersForEvent, guardTrustedOrigin } = require('./lib/request-guard');
const { normalizeTesterId, validateTesterId } = require('./lib/tracked-store');
const {
  MAX_PAYLOAD_BYTES,
  utf8ByteSize,
  parseJsonBody,
  redactSensitivePayload,
  issueIdFromSummary,
  buildIssueKeys,
  saveIssueBundle
} = require('./lib/tester-bundle-store');
const { normalizeIssueBundle } = require('./lib/tester-bundle-normalizer');

function jsonResponse(event, statusCode, body){
  return {
    statusCode,
    headers:corsHeadersForEvent(event, 'POST, OPTIONS'),
    body:JSON.stringify(body)
  };
}

function testerIdFromEvent(event){
  const headers = event && event.headers && typeof event.headers === 'object' ? event.headers : {};
  return normalizeTesterId(headers['x-pullback-tester-id'] || headers['X-Pullback-Tester-Id'] || '');
}

exports.handler = async function handler(event){
  if(event.httpMethod === 'OPTIONS') return jsonResponse(event, 200, {ok:true});
  if(!guardTrustedOrigin(event)) return jsonResponse(event, 403, {error:'Forbidden'});
  if(event.httpMethod !== 'POST') return jsonResponse(event, 405, {error:'Method not allowed'});

  const testerId = testerIdFromEvent(event);
  if(!testerId) return jsonResponse(event, 400, {error:'Missing testerId.'});
  if(!validateTesterId(testerId)) return jsonResponse(event, 400, {error:'Invalid testerId.'});
  if(utf8ByteSize(event.body || '') > MAX_PAYLOAD_BYTES){
    return jsonResponse(event, 413, {error:'Tester bundle payload too large.'});
  }

  let body;
  try{
    body = parseJsonBody(event);
  }catch(error){
    return jsonResponse(event, 400, {error:'Invalid JSON body.'});
  }

  const receivedAtDate = new Date();
  const receivedAt = receivedAtDate.toISOString();
  const redactedBody = redactSensitivePayload({
    category:body && body.category,
    expected:body && body.expected,
    actual:body && body.actual,
    notes:body && body.notes,
    snapshot:body && body.snapshot && typeof body.snapshot === 'object' ? body.snapshot : {}
  });
  const provisional = normalizeIssueBundle({
    issueId:'',
    receivedAt,
    testerId,
    body:redactedBody,
    indexKey:'',
    fullKey:''
  });
  const issueId = issueIdFromSummary(provisional.fullPayload.summary, receivedAtDate);
  const keys = buildIssueKeys(issueId, receivedAtDate);
  const normalized = normalizeIssueBundle({
    issueId,
    receivedAt,
    testerId,
    body:redactedBody,
    indexKey:keys.indexKey,
    fullKey:keys.fullKey
  });
  try{
    await saveIssueBundle(normalized.indexPayload, normalized.fullPayload);
  }catch(error){
    return jsonResponse(event, 502, {
      error:'Failed to store tester diagnostics bundle.'
    });
  }
  return jsonResponse(event, 200, {
    ok:true,
    issueId,
    indexKey:keys.indexKey,
    fullKey:keys.fullKey,
    receipt:normalized.receipt
  });
};

module.exports = {
  handler:exports.handler
};
