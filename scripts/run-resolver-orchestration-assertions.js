const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const resolverSource = fs.readFileSync(path.join(root, 'js/resolver-core.js'), 'utf8');
const sandbox = {window:{}, console};
sandbox.globalThis = sandbox.window;
vm.runInNewContext(fs.readFileSync(path.join(root, 'js/domain/canonical-decision-result.js'), 'utf8'), sandbox, {filename:'canonical-decision-result.js'});
vm.runInNewContext(resolverSource, sandbox, {filename:'resolver-core.js'});

const api = sandbox.window.ResolverCore;
const candidateStart = resolverSource.indexOf('function buildCanonicalDecisionCandidate(');
const candidateEnd = resolverSource.indexOf('\n  function publishCanonicalDecisionCandidate', candidateStart);
const candidateBlock = resolverSource.slice(candidateStart, candidateEnd);
const resolverStart = resolverSource.indexOf('function resolveGlobalVerdict(');
const resolverEnd = resolverSource.indexOf('\n  function resolveScanWorkflow', resolverStart);
const resolverBlock = resolverSource.slice(resolverStart, resolverEnd);

assert.ok(candidateStart >= 0 && candidateEnd > candidateStart, 'candidate construction must be an explicit orchestration seam');
assert.ok(!/evaluateCanonicalSemanticsAndGates\(|selectCanonicalDecision\(/.test(candidateBlock), 'candidate construction must not evaluate or select');
assert.ok(/const canonicalDecisionSelection = selectCanonicalDecision\(resolutionContext, canonicalEvaluation\);/.test(resolverBlock), 'resolver must select once before candidate construction');
assert.ok(/const rawResult = buildCanonicalDecisionCandidate\(\{/.test(resolverBlock), 'resolver must delegate candidate construction');
assert.ok(/const publication = publishCanonicalDecisionCandidate\(rawResult, normalizedEvidence/.test(resolverBlock), 'resolver must delegate validation and publication');
assert.ok(/return buildCanonicalCompatibilityProjection\(rawResult, publication\);/.test(resolverBlock), 'compatibility must remain downstream of publication');
assert.ok(!/rawResult\.(?:final_verdict|allow_plan|reason|main_blocker|primary_blocker_source)\s*=/.test(resolverBlock), 'orchestration must not mutate selected decision fields after candidate construction');

const selection = Object.freeze({
  eligibility:Object.freeze({entry:Object.freeze({state:'blocked', qualified:false}), nearEntry:Object.freeze({state:'blocked', qualified:false})}),
  verdict:'watch',
  actionability:false,
  decisiveBlocker:Object.freeze({code:'support_pending', category:'support', reason:'Support has not clearly held yet.'}),
  reasonSource:'support_gate',
  selectedPromotionPath:'none',
  selectedDemotionPath:'support_gate',
  decisionTrace:Object.freeze([])
});
const candidate = api.buildCanonicalDecisionCandidate({
  canonicalDecisionSelection:selection,
  entry_gate_pass:false,
  near_entry_gate_pass:false,
  buyer_control_gate_pass:false,
  confirmation_gate_pass:false,
  hasPriceablePlan:true,
  priceability_state:'priceable',
  structure_state:'intact',
  structure_eligibility:'alive',
  support_test_state:'held',
  resolvedPlanEntry:100,
  resolvedPlanStop:95,
  resolvedPlanTarget:110,
  resolvedRR:2,
  resolved:{planStatusKey:'valid'}
});
assert.ok(Object.isFrozen(candidate), 'candidate must be immutable after pure assembly');
assert.strictEqual(candidate.final_verdict, selection.verdict, 'candidate verdict must equal selector verdict');
assert.strictEqual(candidate.allow_plan, selection.actionability, 'candidate actionability must equal selector actionability');
assert.strictEqual(candidate.primary_blocker_source, selection.decisiveBlocker.category, 'candidate blocker category must equal selector blocker category');

const evidence = {schemaVersion:'normalised-decision-evidence-v1', snapshotId:'orchestration-fixture'};
const publication = api.publishCanonicalDecisionCandidate(candidate, evidence);
assert.strictEqual(publication.publicationStatus, 'valid', 'valid candidate must publish through the canonical boundary');
assert.strictEqual(publication.canonicalResult.verdict.value, selection.verdict, 'publication must preserve candidate verdict');
const projection = api.buildCanonicalCompatibilityProjection(candidate, publication);
assert.strictEqual(projection.final_verdict, selection.verdict, 'compatibility projection must preserve published verdict');
assert.strictEqual(projection.selector_diagnostics.canonicalNormStatus, 'valid', 'compatibility diagnostics may report publication validation only after publication');

const invalidSelection = Object.freeze({...selection, verdict:'entry', actionability:true, eligibility:Object.freeze({entry:Object.freeze({state:'blocked', qualified:false}), nearEntry:Object.freeze({state:'blocked', qualified:false})})});
const invalidCandidate = api.buildCanonicalDecisionCandidate({...candidate, canonicalDecisionSelection:invalidSelection});
const invalidPublication = api.publishCanonicalDecisionCandidate(invalidCandidate, evidence);
assert.strictEqual(invalidPublication.publicationStatus, 'validation_failed', 'invalid candidate must publish an explicit validation-failed envelope');
const invalidProjection = api.buildCanonicalCompatibilityProjection(invalidCandidate, invalidPublication);
assert.strictEqual(invalidProjection.allow_plan, false, 'validation-failed compatibility output must remain non-actionable');
assert.strictEqual(invalidProjection.validationFailureReasonCode, 'canonical_norm_validation_failed', 'validation-failed identity must survive projection');

console.log('Resolver orchestration assertions passed (pure candidate assembly, publication boundary, validation fallback, and downstream-only compatibility).');
