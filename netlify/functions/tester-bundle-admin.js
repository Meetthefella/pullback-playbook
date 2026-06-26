const { corsHeadersForEvent } = require('./lib/request-guard');
const { issueKeysFromIssueId, loadIssueBundle, parseIssueId } = require('./lib/tester-bundle-store');

function jsonResponse(event, statusCode, body){
  return {
    statusCode,
    headers:corsHeadersForEvent(event, 'GET, OPTIONS'),
    body:JSON.stringify(body)
  };
}

function adminTokenFromEvent(event){
  const headers = event && event.headers && typeof event.headers === 'object' ? event.headers : {};
  return String(headers['x-admin-token'] || headers['X-Admin-Token'] || headers.authorization || headers.Authorization || '').trim();
}

function adminAccessAllowed(event){
  const configured = String(process.env.TESTER_REPORT_ADMIN_TOKEN || '').trim();
  if(!configured) return false;
  const presented = adminTokenFromEvent(event);
  if(!presented) return false;
  if(presented === configured) return true;
  if(/^bearer\s+/i.test(presented)){
    return presented.replace(/^bearer\s+/i, '').trim() === configured;
  }
  return false;
}

function queryParams(event){
  return event && event.queryStringParameters && typeof event.queryStringParameters === 'object'
    ? event.queryStringParameters
    : {};
}

function fullKeyFromIssueId(issueId){
  const keys = issueKeysFromIssueId(issueId);
  return keys ? keys.fullKey : null;
}

exports.handler = async function handler(event){
  if(event.httpMethod === 'OPTIONS') return jsonResponse(event, 200, {ok:true});
  if(event.httpMethod !== 'GET') return jsonResponse(event, 405, {error:'Method not allowed'});
  if(!adminAccessAllowed(event)) return jsonResponse(event, 403, {error:'Forbidden'});

  const params = queryParams(event);
  if('mode' in params) return jsonResponse(event, 400, {error:'List/read modes are not supported.'});

  const issueId = String(params.issueId || '').trim();
  const fullKey = fullKeyFromIssueId(issueId);
  if(!fullKey) return jsonResponse(event, 400, {error:'Invalid issueId.'});

  const bundle = await loadIssueBundle(fullKey);
  if(!bundle) return jsonResponse(event, 404, {error:'Tester bundle not found.'});
  return jsonResponse(event, 200, bundle);
};

module.exports = {
  handler:exports.handler,
  adminAccessAllowed,
  fullKeyFromIssueId,
  parseIssueId
};
