const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const sandbox = {window:{}, console};
sandbox.globalThis = sandbox.window;
vm.runInNewContext(fs.readFileSync(path.join(root, 'js/resolver-core.js'), 'utf8'), sandbox, {filename:'resolver-core.js'});

const evidence = {
  schemaVersion:'normalised-decision-evidence-v1',
  snapshotId:'context-fixture-evidence',
  source:'canonical-resolver-input',
  values:{price:{state:'present', value:100}, stop:{state:'unknown', value:null}},
  provenance:{selectedAuthority:'canonical_plan', conflicts:[]}
};
const before = JSON.stringify(evidence);
const api = sandbox.window.ResolverCore;
const first = api.buildCanonicalResolutionContext(evidence, {resolverSource:'resolver-core', policy:{minimumEntryRr:2}});
const second = api.buildCanonicalResolutionContext(evidence, {resolverSource:'resolver-core', policy:{minimumEntryRr:2}});

assert.strictEqual(JSON.stringify(evidence), before, 'context construction must not mutate normalised evidence');
assert.deepStrictEqual(JSON.parse(JSON.stringify(first)), JSON.parse(JSON.stringify(second)), 'context must be deterministic for identical inputs');
assert.strictEqual(first.evidenceId, 'context-fixture-evidence');
assert.strictEqual(first.resolverSnapshotId, 'context-fixture-evidence:resolver-core');
assert.strictEqual(first.surface, 'resolver-core');
assert.ok(Object.isFrozen(first) && Object.isFrozen(first.evidence) && Object.isFrozen(first.policy), 'context must be deeply immutable');
assert.strictEqual(first.evidence.values.stop.state, 'unknown', 'unknown evidence must remain distinct from false or absent');
first.evidence.values.price.value = 200;
assert.strictEqual(first.evidence.values.price.value, 100, 'frozen context cannot be changed after construction');

const evaluationInput = {
  semanticStates:{structure:{state:'intact'}, support:{testState:'held'}, plan:{priceability:'provisional'}},
  gates:{buyerControl:{pass:false, reasons:['Buyer control is not confirmed.']}, confirmation:{pass:false}},
  eligibilityInputs:{entry:false, nearEntry:false},
  promotionGuards:{entryGatePass:false, nearEntryGatePass:false},
  terminalBlockers:{structure:false, support:false},
  planEvaluation:{entry:100, stop:null, target:null, visibility:false, provenance:{source:'resolver-core'}},
  diagnostics:{stale:false}
};
const evaluationBefore = JSON.stringify(evaluationInput);
const evaluation = api.evaluateCanonicalSemanticsAndGates(first, evaluationInput);
assert.strictEqual(JSON.stringify(evaluationInput), evaluationBefore, 'evaluation must not mutate inputs');
assert.ok(Object.isFrozen(evaluation) && Object.isFrozen(evaluation.semanticStates) && Object.isFrozen(evaluation.gates), 'evaluation result must be immutable');
assert.strictEqual(evaluation.semanticStates.plan.priceability, 'provisional');
assert.strictEqual(evaluation.gates.buyerControl.reasons[0], 'Buyer control is not confirmed.');
assert.strictEqual(Object.prototype.hasOwnProperty.call(evaluation, 'verdict'), false, 'semantic evaluation must not select a final verdict');
console.log('Resolver context assertions passed (determinism, immutability, identity, and unknown preservation).');
