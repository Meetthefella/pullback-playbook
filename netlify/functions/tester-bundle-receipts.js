const { corsHeadersForEvent, guardTrustedOrigin } = require('./lib/request-guard');
const { normalizeTesterId, validateTesterId } = require('./lib/tracked-store');
const {
  parseJsonBody,
  parseIssueId,
  issueKeysFromIssueId,
  loadIndexBundle,
  normalizeWorkflowStatusFields,
  buildSubmittedWorkflowStatus
} = require('./lib/tester-bundle-store');

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

  let body;
  try{
    body = parseJsonBody(event);
  }catch(error){
    return jsonResponse(event, 400, {error:'Invalid JSON body.'});
  }
  const issueIds = Array.isArray(body && body.issueIds) ? body.issueIds : [];
  const normalizedIssueIds = [...new Set(issueIds
    .map(value => String(value || '').trim().toUpperCase())
    .filter(value => !!parseIssueId(value))
  )].slice(0, 10);

  const receipts = [];
  for(const issueId of normalizedIssueIds){
    const keys = issueKeysFromIssueId(issueId);
    if(!keys) continue;
    let indexPayload = null;
    try{
      indexPayload = await loadIndexBundle(keys.indexKey);
    }catch(error){
      return jsonResponse(event, 502, {error:'Failed to load tester receipt statuses.'});
    }
    if(!indexPayload || !indexPayload.issue || String(indexPayload.issue.testerId || '').trim().toLowerCase() !== testerId) continue;
    receipts.push({
      issueId,
      workflow:normalizeWorkflowStatusFields(
        indexPayload.workflow,
        buildSubmittedWorkflowStatus(indexPayload.issue.receivedAt || '')
      )
    });
  }

  return jsonResponse(event, 200, {
    ok:true,
    receipts
  });
};

module.exports = {
  handler:exports.handler
};
