const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const sandbox = {window:{}, console};
sandbox.globalThis = sandbox.window;
['js/domain/canonical-decision-result.js', 'js/domain/canonical-setup-projection.js', 'js/domain/simplified-trade-state.js']
  .forEach(file => vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, {filename:file}));

const decision = sandbox.window.CanonicalDecisionResult;
const state = sandbox.window.SimplifiedTradeState;
const publication = decision.publishCanonicalDecision({
  final_verdict:'near_entry', entry_gate_pass:false, near_entry_gate_pass:true,
  buyer_control_gate_pass:true, confirmation_gate_pass:false,
  priceability_state:'priceable', structure_eligibility:'alive', support_test_state:'held',
  resolvedPlanEntry:100, resolvedPlanStop:95, resolvedPlanTarget:110, resolvedRR:2,
  primary_blocker_source:'confirmation'
}, {schemaVersion:'normalised-decision-evidence-v1', snapshotId:'TSLA-evidence'}, {
  ticker:'TSLA', recordIdentity:'TSLA:created-1', refreshCycleId:'scan-2026-07-29T09:00:00.000Z'
});

assert.strictEqual(publication.publicationStatus, 'valid');
assert.strictEqual(publication.validationStatus, 'valid');
assert.strictEqual(publication.evidenceId, 'TSLA-evidence');
assert.strictEqual(publication.canonicalResultVersion, publication.canonicalResult.schemaVersion);
assert.ok(publication.publicationId.includes('TSLA'));
assert.ok(Object.isFrozen(publication));
assert.ok(Object.isFrozen(publication.canonicalResult));
assert.strictEqual(decision.publicationMatches(publication, {
  ticker:'TSLA', recordIdentity:'TSLA:created-1', refreshCycleId:'scan-2026-07-29T09:00:00.000Z'
}), true, 'matching publication must remain current regardless of elapsed time');
assert.strictEqual(decision.publicationMatches(publication, {
  ticker:'TSLA', recordIdentity:'TSLA:created-1', refreshCycleId:'scan-next'
}), false, 'a new cycle must make the old publication unavailable');
assert.strictEqual(decision.publicationMatches(publication, {
  ticker:'TSLA', recordIdentity:'different-record', refreshCycleId:'scan-2026-07-29T09:00:00.000Z'
}), false, 'record identity mismatch must be rejected');
const mismatchedEvidence = {...publication, evidenceId:'other-evidence'};
assert.strictEqual(decision.publicationMatches(mismatchedEvidence, {
  ticker:'TSLA', recordIdentity:'TSLA:created-1', refreshCycleId:'scan-2026-07-29T09:00:00.000Z'
}), false, 'publication metadata must match canonical evidence');

const scan = state.resolveRecordState({ticker:'TSLA'}, {publication, surface:'scan'});
const review = state.resolveRecordState({ticker:'TSLA'}, {publication, surface:'review'});
const track = state.resolveRecordState({ticker:'TSLA'}, {publication, surface:'track'});
[scan, review, track].forEach(surface => {
  assert.strictEqual(surface.publicationId, publication.publicationId);
  assert.strictEqual(surface.evidenceId, publication.evidenceId);
  assert.strictEqual(surface.refreshCycleId, publication.refreshCycleId);
  assert.strictEqual(surface.canonicalVerdict, 'near_entry');
});

const unavailable = state.resolveRecordState({ticker:'TSLA'}, {surface:'track'});
assert.strictEqual(unavailable.publicationStatus, 'validation_failed');
assert.strictEqual(unavailable.actionable, false);
assert.strictEqual(unavailable.planVisible, false);
assert.strictEqual(unavailable.canonicalPlan, null);

console.log('Canonical publication identity assertions passed.');
