const { corsHeadersForEvent } = require('./lib/request-guard');
const {
  loadIssueRecord,
  saveIssueBundle,
  isWorkflowStatus,
  parseIssueId,
  normalizeWorkflowStatusFields,
  workflowTransitionAllowed,
  buildStatusHistoryEvent,
  buildSubmittedWorkflowStatus
} = require('./lib/tester-bundle-store');
const { adminAccessAllowed } = require('./tester-bundle-admin');

function jsonResponse(event, statusCode, body){
  return {
    statusCode,
    headers:corsHeadersForEvent(event, 'POST, OPTIONS'),
    body:JSON.stringify(body)
  };
}

function parseJsonBody(event){
  try{
    return JSON.parse(String(event && event.body || '{}'));
  }catch(error){
    return null;
  }
}

function asObject(value){
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function cloneJson(value, fallback){
  if(value == null) return fallback;
  try{
    return JSON.parse(JSON.stringify(value));
  }catch(error){
    return fallback;
  }
}

exports.handler = async function handler(event){
  if(event.httpMethod === 'OPTIONS') return jsonResponse(event, 200, {ok:true});
  if(event.httpMethod !== 'POST') return jsonResponse(event, 405, {error:'Method not allowed'});
  if(!adminAccessAllowed(event)) return jsonResponse(event, 403, {error:'Forbidden'});

  const body = parseJsonBody(event);
  if(!body) return jsonResponse(event, 400, {error:'Invalid JSON body.'});

  const issueId = String(body.issueId || '').trim().toUpperCase();
  const status = String(body.status || '').trim().toLowerCase();
  const fixedInBuild = String(body.fixedInBuild || '').trim();
  const note = String(body.note || '').trim();
  const override = body.override === true;
  const statusUpdatedBy = String(body.statusUpdatedBy || 'codex').trim() || 'codex';

  if(!issueId) return jsonResponse(event, 400, {error:'Missing issueId.'});
  if(!parseIssueId(issueId)) return jsonResponse(event, 400, {error:'Invalid issueId.'});
  if(!isWorkflowStatus(status)) return jsonResponse(event, 400, {error:'Invalid status.'});
  if(status === 'closed') return jsonResponse(event, 422, {error:'closed is local-only during this rollout.'});
  if(status === 'fixed' && !fixedInBuild){
    return jsonResponse(event, 400, {error:'fixedInBuild is required when setting fixed.'});
  }

  let record;
  try{
    record = await loadIssueRecord(issueId);
  }catch(error){
    return jsonResponse(event, 502, {error:'Failed to load tester diagnostics bundle.'});
  }
  if(!record || !record.indexPayload || !record.fullPayload){
    return jsonResponse(event, 404, {error:'Tester bundle not found.'});
  }

  const currentWorkflow = normalizeWorkflowStatusFields(
    record.fullPayload.workflow,
    buildSubmittedWorkflowStatus(record.fullPayload.issue && record.fullPayload.issue.receivedAt || '')
  );
  if(!override && !workflowTransitionAllowed(currentWorkflow.status, status)){
    return jsonResponse(event, 400, {error:'Invalid workflow transition.'});
  }

  const statusUpdatedAt = new Date().toISOString();
  const nextWorkflow = normalizeWorkflowStatusFields({
    status,
    statusUpdatedAt,
    statusUpdatedBy,
    fixedInBuild:status === 'fixed' ? fixedInBuild : ''
  }, currentWorkflow);
  const historyEvent = buildStatusHistoryEvent({
    status:nextWorkflow.status,
    statusLabel:nextWorkflow.statusLabel,
    statusUpdatedAt:nextWorkflow.statusUpdatedAt,
    statusUpdatedBy:nextWorkflow.statusUpdatedBy,
    fixedInBuild:nextWorkflow.fixedInBuild,
    note,
    override
  });

  const nextFullPayload = {
    ...cloneJson(record.fullPayload, {}),
    workflow:nextWorkflow,
    history:[
      ...(Array.isArray(record.fullPayload.history) ? cloneJson(record.fullPayload.history, []) : []),
      historyEvent
    ]
  };
  const nextIndexPayload = {
    ...cloneJson(record.indexPayload, {}),
    workflow:nextWorkflow
  };

  try{
    await saveIssueBundle(nextIndexPayload, nextFullPayload);
  }catch(error){
    return jsonResponse(event, 502, {error:'Failed to store tester diagnostics bundle status.'});
  }

  return jsonResponse(event, 200, {
    ok:true,
    issueId,
    workflow:nextWorkflow
  });
};

module.exports = {
  handler:exports.handler
};
