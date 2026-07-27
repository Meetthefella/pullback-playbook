const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const sandbox = {window:{}, console};
sandbox.globalThis = sandbox.window;
vm.runInNewContext(fs.readFileSync(path.join(root, 'js/domain/canonical-decision-result.js'), 'utf8'), sandbox, {filename:'canonical-decision-result.js'});
const api = sandbox.window.CanonicalDecisionResult;

const invalidCandidate = {
  final_verdict:'entry', entry_gate_pass:false, near_entry_gate_pass:false,
  buyer_control_gate_pass:false, confirmation_gate_pass:false,
  priceability_state:'priceable', structure_eligibility:'alive', support_test_state:'holding'
};
const evidence = {schemaVersion:'normalised-decision-evidence-v1', snapshotId:'hwm-invalid-snapshot'};
const invalid = api.createCanonicalDecisionResult(invalidCandidate, evidence);
assert.strictEqual(invalid.validation.status, 'validation_failed');
assert.ok(invalid.validation.violations.some(item => item.code === 'entry_verdict_without_entry_eligibility'));
const fallback = api.publishCanonicalDecision(invalidCandidate, evidence);
assert.strictEqual(fallback.publicationStatus, 'validation_failed');
assert.strictEqual(fallback.canonicalResult, null);
assert.strictEqual(fallback.safeFallback.verdict, 'watch');
assert.strictEqual(fallback.safeFallback.actionable, false);
assert.throws(() => api.publishCanonicalDecision(invalidCandidate, evidence, {enforce:true}), /Canonical Norm violation/);

const validCandidate = {
  final_verdict:'entry', entry_gate_pass:true, near_entry_gate_pass:true,
  buyer_control_gate_pass:true, confirmation_gate_pass:true,
  priceability_state:'priceable', structure_eligibility:'alive', support_test_state:'holding',
  resolvedPlanEntry:100, resolvedPlanStop:95, resolvedPlanTarget:110, resolvedRR:2
};
const valid = api.publishCanonicalDecision(validCandidate, evidence);
assert.strictEqual(valid.publicationStatus, 'valid');
assert.strictEqual(valid.canonicalResult.validation.status, 'valid');
assert.ok(Object.isFrozen(valid.canonicalResult));
console.log('run-canonical-norm-assertions: ok');
