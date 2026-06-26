const {
  REDACTED_VALUE,
  TESTER_BUNDLE_SCHEMA_VERSION,
  buildSubmittedWorkflowStatus,
  normalizeWorkflowStatusFields
} = require('./tester-bundle-store');

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

function stringOrEmpty(value){
  return value == null ? '' : String(value);
}

function numberOrNull(value){
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function booleanOrNull(value){
  if(value === true) return true;
  if(value === false) return false;
  return null;
}

function pickDefined(candidates){
  for(const candidate of candidates){
    if(candidate !== undefined) return candidate;
  }
  return undefined;
}

function nestedGet(root, path){
  return path.reduce((current, key) => {
    if(!current || typeof current !== 'object') return undefined;
    return current[key];
  }, root);
}

function normalizeSummary(snapshot, testerId, receivedAtIso){
  const safeSnapshot = asObject(snapshot);
  const trackState = asObject(nestedGet(safeSnapshot, ['sections', 'track', 'simplifiedState']));
  const stateHealth = asObject(safeSnapshot.stateHealth);
  const siblingFallback = safeSnapshot;
  const source = Object.keys(trackState).length ? trackState : stateHealth;
  const resolve = key => pickDefined([
    source[key],
    trackState[key],
    stateHealth[key],
    siblingFallback[key]
  ]);
  return {
    timestamp:stringOrEmpty(pickDefined([safeSnapshot.timestamp, receivedAtIso])),
    testerId:stringOrEmpty(testerId),
    buildVersion:stringOrEmpty(safeSnapshot.buildVersion),
    activeWorkspace:stringOrEmpty(safeSnapshot.activeWorkspace),
    panelTitle:stringOrEmpty(safeSnapshot.panelTitle),
    ticker:stringOrEmpty(safeSnapshot.ticker || 'UNKNOWN'),
    canonicalVerdict:stringOrEmpty(resolve('canonicalVerdict')),
    visualBucket:stringOrEmpty(resolve('visualBucket')),
    tone:stringOrEmpty(resolve('tone')),
    structureEligibility:stringOrEmpty(resolve('structureEligibility')),
    structureState:stringOrEmpty(resolve('structureState')),
    setupLocationState:stringOrEmpty(resolve('setupLocationState')),
    priceabilityState:stringOrEmpty(resolve('priceabilityState')),
    bounceState:stringOrEmpty(resolve('bounceState')),
    planStatus:stringOrEmpty(resolve('planStatus')),
    resolvedRR:numberOrNull(resolve('resolvedRR')),
    entryGatePass:booleanOrNull(resolve('entryGatePass')),
    nearEntryGatePass:booleanOrNull(resolve('nearEntryGatePass')),
    primaryBlockerReason:stringOrEmpty(resolve('primaryBlockerReason')),
    divergenceDetected:booleanOrNull(resolve('divergenceDetected')),
    terminalAvoidApplied:booleanOrNull(resolve('terminalAvoidApplied'))
  };
}

function normalizeResolverTrace(snapshot){
  const safeSnapshot = asObject(snapshot);
  const topLevel = asObject(safeSnapshot.resolverTrace);
  const trackLevel = asObject(nestedGet(safeSnapshot, ['sections', 'track', 'resolverTrace']));
  return {
    ...cloneJson(topLevel, {}),
    ...cloneJson(trackLevel, {}),
    watchlistDebug:cloneJson(pickDefined([trackLevel.watchlistDebug, topLevel.watchlistDebug]), {}),
    plan:cloneJson(pickDefined([trackLevel.plan, topLevel.plan]), {}),
    scan:cloneJson(pickDefined([trackLevel.scan, topLevel.scan]), {}),
    setup:cloneJson(pickDefined([trackLevel.setup, topLevel.setup]), {})
  };
}

function normalizeExtractedSections(snapshot){
  const safeSnapshot = asObject(snapshot);
  const track = asObject(nestedGet(safeSnapshot, ['sections', 'track']));
  return {
    review:{
      chartVerification:cloneJson(nestedGet(safeSnapshot, ['sections', 'chartVerification']), null)
    },
    track:{
      consistencyAudit:cloneJson(track.consistencyAudit, []),
      lifecycleSnapshot:cloneJson(track.lifecycleSnapshot, {}),
      visibleModel:cloneJson(track.visibleModel, {}),
      gateTrace:cloneJson(track.gateTrace, {}),
      planTrace:cloneJson(track.planTrace, {})
    }
  };
}

function deriveContradictions(summary){
  const contradictions = [];
  if(summary.canonicalVerdict && summary.visualBucket && summary.canonicalVerdict.toLowerCase() !== summary.visualBucket.toLowerCase()){
    contradictions.push({
      type:'verdict_visual_bucket_mismatch',
      message:`Canonical verdict ${summary.canonicalVerdict} differs from visual bucket ${summary.visualBucket}.`
    });
  }
  if(summary.entryGatePass === true && /avoid/i.test(summary.planStatus || '')){
    contradictions.push({
      type:'entry_gate_plan_status_conflict',
      message:'Entry gate passed while plan status still signals Avoid.'
    });
  }
  if(summary.nearEntryGatePass === true && /avoid/i.test(summary.planStatus || '')){
    contradictions.push({
      type:'near_entry_gate_plan_status_conflict',
      message:'Near-entry gate passed while plan status still signals Avoid.'
    });
  }
  if(summary.terminalAvoidApplied === true && /near entry|entry/i.test(summary.tone || '')){
    contradictions.push({
      type:'terminal_avoid_tone_conflict',
      message:'Terminal Avoid is applied while presentation tone still implies a tradable state.'
    });
  }
  return contradictions;
}

function normalizeExpectedVsActual(body){
  const safe = asObject(body);
  return {
    expected:stringOrEmpty(safe.expected),
    actual:stringOrEmpty(safe.actual),
    notes:stringOrEmpty(safe.notes)
  };
}

function bundleLabelFromSnapshot(snapshot){
  const safeSnapshot = asObject(snapshot);
  const sections = asObject(safeSnapshot.sections);
  const labels = [];
  const hasGeneral = Object.keys(asObject(safeSnapshot.stateHealth)).length > 0
    || Object.keys(asObject(safeSnapshot.review)).length > 0
    || Object.keys(asObject(safeSnapshot.resolverTrace)).length > 0
    || stringOrEmpty(safeSnapshot.panelTitle).toLowerCase().includes('general');
  const hasReview = Object.keys(asObject(sections.review)).length > 0
    || Object.keys(asObject(sections.chartVerification)).length > 0
    || stringOrEmpty(safeSnapshot.bundleMode) === 'review_tester_bundle'
    || stringOrEmpty(safeSnapshot.panelTitle).toLowerCase().includes('review');
  const hasTrack = Object.keys(asObject(sections.track)).length > 0
    || stringOrEmpty(safeSnapshot.bundleMode) === 'track_tester_bundle'
    || stringOrEmpty(safeSnapshot.panelTitle).toLowerCase().includes('track');
  if(hasReview) labels.push('Review');
  if(hasTrack) labels.push('Track');
  if(hasGeneral || !labels.length) labels.push('General');
  return labels.join(' + ');
}

function buildIndexPayload(fullPayload){
  const { issue, summary, contradictions, expectedVsActual, workflow } = fullPayload;
  return {
    schemaVersion:fullPayload.schemaVersion,
    issue:cloneJson(issue, {}),
    workflow:cloneJson(workflow, {}),
    summary:cloneJson(summary, {}),
    contradictions:cloneJson(contradictions, []),
    expectedVsActual:cloneJson(expectedVsActual, {})
  };
}

function normalizeIssueBundle({ issueId, receivedAt, testerId, body, indexKey, fullKey }){
  const safeBody = asObject(body);
  const snapshot = asObject(safeBody.snapshot);
  const summary = normalizeSummary(snapshot, testerId, receivedAt);
  const issue = {
    issueId:stringOrEmpty(issueId),
    receivedAt:stringOrEmpty(receivedAt),
    testerId:stringOrEmpty(testerId),
    category:stringOrEmpty(safeBody.category),
    indexKey:stringOrEmpty(indexKey),
    fullKey:stringOrEmpty(fullKey)
  };
  const workflow = normalizeWorkflowStatusFields(
    safeBody.workflow,
    buildSubmittedWorkflowStatus(receivedAt)
  );
  const fullPayload = {
    schemaVersion:TESTER_BUNDLE_SCHEMA_VERSION,
    issue,
    workflow,
    summary,
    codexFocus:{
      startHere:[
        'stateHealth',
        'resolverTrace.watchlistDebug',
        'resolverTrace.plan',
        'resolverTrace.scan.analysisProjection.derived_states',
        'resolverTrace.setup.warning.cumulativePenaltyTrace',
        'extractedSections.track.consistencyAudit',
        'extractedSections.track.lifecycleSnapshot',
        'extractedSections.review.chartVerification'
      ]
    },
    contradictions:deriveContradictions(summary),
    expectedVsActual:normalizeExpectedVsActual(safeBody),
    stateHealth:cloneJson(snapshot.stateHealth, {}),
    presentation:{
      panelTitle:stringOrEmpty(snapshot.panelTitle),
      activeWorkspace:stringOrEmpty(snapshot.activeWorkspace),
      canonicalVerdict:summary.canonicalVerdict,
      visualBucket:summary.visualBucket,
      tone:summary.tone
    },
    gates:{
      structureEligibility:summary.structureEligibility,
      structureState:summary.structureState,
      setupLocationState:summary.setupLocationState,
      priceabilityState:summary.priceabilityState,
      bounceState:summary.bounceState,
      entryGatePass:summary.entryGatePass,
      nearEntryGatePass:summary.nearEntryGatePass,
      terminalAvoidApplied:summary.terminalAvoidApplied
    },
    lifecycle:{
      primaryBlockerReason:summary.primaryBlockerReason,
      divergenceDetected:summary.divergenceDetected
    },
    plan:{
      status:summary.planStatus,
      resolvedRR:summary.resolvedRR
    },
    resolverTrace:normalizeResolverTrace(snapshot),
    extractedSections:normalizeExtractedSections(snapshot),
    rawBundles:{
      submitted:cloneJson(safeBody, {})
    },
    history:[
      {
        type:'submission',
        receivedAt:stringOrEmpty(receivedAt),
        testerId:stringOrEmpty(testerId),
        category:stringOrEmpty(safeBody.category),
        snapshotTimestamp:stringOrEmpty(snapshot.timestamp)
      }
    ]
  };
  return {
    fullPayload,
    indexPayload:buildIndexPayload(fullPayload),
    receipt:{
      title:'Diagnostics Submitted',
      issueId:stringOrEmpty(issueId),
      buildVersion:stringOrEmpty(summary.buildVersion),
      bundle:bundleLabelFromSnapshot(snapshot),
      workflow:cloneJson(workflow, {}),
      stored:['Index', 'Full Bundle'],
      submittedAtUtc:stringOrEmpty(receivedAt).replace(/^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2}:\d{2}).*$/, '$1 UTC')
    }
  };
}

module.exports = {
  normalizeIssueBundle,
  REDACTED_VALUE
};
