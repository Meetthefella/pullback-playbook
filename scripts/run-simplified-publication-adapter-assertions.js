const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const sandbox = {window:{}, console};
sandbox.globalThis = sandbox.window;

function load(relative){
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  vm.runInNewContext(source, sandbox, {filename:relative});
}

load('js/domain/canonical-decision-result.js');
load('js/domain/simplified-trade-state.js');

const decision = sandbox.window.CanonicalDecisionResult;
const simplified = sandbox.window.SimplifiedTradeState;
const evidence = {schemaVersion:'normalised-decision-evidence-v1', snapshotId:'consumer-1-evidence'};
const publication = decision.publishCanonicalDecision({
  final_verdict:'entry', entry_gate_pass:true, near_entry_gate_pass:true,
  buyer_control_gate_pass:true, confirmation_gate_pass:true,
  priceability_state:'priceable', structure_eligibility:'alive', support_test_state:'held',
  resolvedPlanEntry:100, resolvedPlanStop:95, resolvedPlanTarget:115, resolvedRR:3,
  semantic_blocker_code:'', primary_blocker_source:'resolver'
}, evidence);
assert.strictEqual(publication.publicationStatus, 'valid');

const mapped = simplified.resolveRecordState({
  ticker:'PARITY', plan:{entry:1, stop:0.5, firstTarget:2}
}, {publication, surface:'track'});
assert.strictEqual(mapped.publicationStatus, 'valid');
assert.strictEqual(mapped.canonicalResultVersion, publication.canonicalResult.schemaVersion);
assert.strictEqual(mapped.evidenceId, publication.canonicalResult.snapshot.evidenceId);
assert.strictEqual(mapped.canonicalVerdict, publication.canonicalResult.verdict.value);
assert.strictEqual(mapped.actionable, publication.canonicalResult.verdict.actionable);
assert.strictEqual(JSON.stringify(mapped.entryEligibility), JSON.stringify(publication.canonicalResult.eligibility.entry));
assert.strictEqual(JSON.stringify(mapped.nearEntryEligibility), JSON.stringify(publication.canonicalResult.eligibility.nearEntry));
assert.strictEqual(mapped.entry, publication.canonicalResult.plan.levels.entry.value);
assert.strictEqual(mapped.stop, publication.canonicalResult.plan.levels.stop.value);
assert.strictEqual(mapped.target, publication.canonicalResult.plan.levels.firstTarget.value);
assert.strictEqual(mapped.resolvedRR, publication.canonicalResult.plan.rewardRisk.resolvedRr);
assert.strictEqual(mapped.planVisible, publication.canonicalResult.plan.visibility.mayShowPlan);
assert.strictEqual(mapped.canonicalPlan, publication.canonicalResult.plan, 'plan payload must remain the immutable canonical snapshot object');
assert.strictEqual(mapped.canonicalPlan.provenance.evidenceId, mapped.evidenceId, 'plan provenance must retain the canonical evidence ID');
assert.strictEqual(mapped.canonicalDecisionProjection.evidenceId, mapped.evidenceId, 'decision projection must retain the canonical evidence ID');

const invalid = decision.publishCanonicalDecision({
  final_verdict:'entry', entry_gate_pass:false, near_entry_gate_pass:false,
  buyer_control_gate_pass:false, confirmation_gate_pass:false,
  priceability_state:'unpriceable', structure_eligibility:'alive', support_test_state:'held',
  resolvedPlanEntry:100, resolvedPlanStop:95, resolvedPlanTarget:115, resolvedRR:3
}, evidence);
const failed = simplified.resolveRecordState({ticker:'INVALID'}, {publication:invalid, surface:'track'});
assert.strictEqual(failed.publicationStatus, 'validation_failed');
assert.strictEqual(failed.actionable, false);
assert.strictEqual(failed.entry, null);
assert.strictEqual(failed.stop, null);
assert.strictEqual(failed.target, null);
assert.strictEqual(failed.resolvedRR, null);
assert.strictEqual(failed.canonicalPlan, null);
assert.strictEqual(failed.decisiveBlockerCode, 'canonical_norm_validation_failed');

const source = fs.readFileSync(path.join(root, 'js/domain/simplified-trade-state.js'), 'utf8');
const boundary = source.match(/function resolveRecordState\(record, options = \{\}\)\{([\s\S]*?)\n  \}/);
assert.ok(boundary, 'publication-only resolveRecordState must exist');
assert.ok(!/ResolverCore|SimplifiedPlanState|reconcileDerivedPriceabilityState|applyPersistedPresentationOverlay/.test(boundary[1]), 'publication boundary must not invoke decision or plan authority');

const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const bridgeStart = appSource.indexOf('function resolveSimplifiedStateForSurface(record, surface = \'review\', options = {}){');
const bridgeEnd = appSource.indexOf('\n}\n\nfunction runVerdictDriftParityChecks', bridgeStart);
assert.ok(bridgeStart >= 0 && bridgeEnd > bridgeStart, 'publication-only surface bridge must exist');
const bridge = appSource.slice(bridgeStart, bridgeEnd);
assert.ok(!/ResolverCore|effectivePlanForRecord|deriveCurrentPlanState|calculateReward|positionSize|applyPersistedPresentationOverlay|resolveFinalStateContract/.test(bridge), 'surface bridge must not invoke resolver, plan, or persisted-authority helpers');
assert.ok(/SimplifiedTradeState\.resolveRecordState/.test(bridge), 'surface bridge must delegate to the publication-only mapper');

console.log('run-simplified-publication-adapter-assertions: ok');
