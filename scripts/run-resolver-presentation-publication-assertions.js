const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const sandbox = {window:{}, console};
sandbox.globalThis = sandbox.window;
for(const relativePath of ['js/domain/canonical-decision-result.js', 'js/resolver-presentation.js']){
  vm.runInNewContext(fs.readFileSync(path.join(root, relativePath), 'utf8'), sandbox, {filename:relativePath});
}

const decision = sandbox.window.CanonicalDecisionResult;
const presentation = sandbox.window.ResolverPresentation;
const publication = decision.publishCanonicalDecision({
  final_verdict:'entry', entry_gate_pass:true, near_entry_gate_pass:true,
  buyer_control_gate_pass:true, confirmation_gate_pass:true,
  priceability_state:'priceable', structure_eligibility:'alive', support_test_state:'held',
  resolvedPlanEntry:100, resolvedPlanStop:95, resolvedPlanTarget:115, resolvedRR:3,
  semantic_blocker_code:'', primary_blocker_source:'resolver'
}, {schemaVersion:'normalised-decision-evidence-v1', snapshotId:'resolver-presentation-evidence'});
const mapped = presentation.resolveVisualState({ticker:'PRESENT'}, 'track', {publication});
assert.strictEqual(mapped.publicationStatus, 'valid');
assert.strictEqual(mapped.finalVerdict, publication.canonicalResult.verdict.value);
assert.strictEqual(mapped.actionable, publication.canonicalResult.verdict.actionable);
assert.strictEqual(mapped.evidenceId, publication.canonicalResult.snapshot.evidenceId);
assert.strictEqual(mapped.canonicalPlan, publication.canonicalResult.plan);
assert.strictEqual(mapped.entryEligibility, publication.canonicalResult.eligibility.entry);
assert.strictEqual(mapped.decisiveBlockerCode, publication.canonicalResult.verdict.decisiveBlockerCode);
assert.strictEqual(mapped.presentation.mayFeedDecisionLogic, false);

const invalid = decision.publishCanonicalDecision({
  final_verdict:'entry', entry_gate_pass:false, near_entry_gate_pass:false,
  buyer_control_gate_pass:false, confirmation_gate_pass:false,
  priceability_state:'unpriceable', structure_eligibility:'alive', support_test_state:'held'
}, {schemaVersion:'normalised-decision-evidence-v1', snapshotId:'invalid-presentation-evidence'});
const failed = presentation.resolveVisualState({ticker:'INVALID'}, 'review', {publication:invalid});
assert.strictEqual(failed.publicationStatus, 'validation_failed');
assert.strictEqual(failed.actionable, false);
assert.strictEqual(failed.canonicalPlan, null);
assert.strictEqual(failed.decisiveBlockerCode, 'canonical_norm_validation_failed');

const source = fs.readFileSync(path.join(root, 'js/resolver-presentation.js'), 'utf8');
const start = source.indexOf('function mapCanonicalDecisionToVisualState(');
const end = source.indexOf('\n  function resolveVisualState(', start);
assert.ok(start >= 0 && end > start, 'canonical presentation mapper must exist');
const mapper = source.slice(start, end);
assert.ok(!/resolveFinalStateContract|effectivePlanForRecord|deriveCurrentPlanState|analysisDerivedStatesFromRecord|legacyResolveVisualStateObserverOnly/.test(mapper), 'presentation mapper must not resolve contracts, plans, semantics, or legacy authority');

const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const bridgeStart = appSource.indexOf("function resolveVisualState(record, context = 'scanner', options = {}){");
const bridgeEnd = appSource.indexOf('\n}\n\nfunction rrDisplayClass', bridgeStart);
assert.ok(bridgeStart >= 0 && bridgeEnd > bridgeStart, 'ResolverPresentation bridge must exist');
const bridge = appSource.slice(bridgeStart, bridgeEnd);
assert.ok(!/resolveFinalStateContract|effectivePlanForRecord|deriveCurrentPlanState|analysisDerivedStatesFromRecord|syncWatchlistLifecycle|watchlistLifecycleSnapshot/.test(bridge), 'ResolverPresentation bridge must not pass local decision or lifecycle authority');
assert.ok(/canonicalPublication/.test(bridge), 'ResolverPresentation bridge must source a canonical publication');

console.log('run-resolver-presentation-publication-assertions: ok');
