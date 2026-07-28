const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const resolverSource = fs.readFileSync(path.join(root, 'js/resolver-core.js'), 'utf8');
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
  diagnostics:{
    stale:false,
    selectionInputs:{
      baseVerdict:'watch', resolvedContract:{}, semanticBlocker:{}, structureLayer:{structureEligibility:'alive'},
      structureState:'intact', setupScore:4, promotionGuardBeforePriceability:{final_verdict:'watch', entry_gate_pass:false, near_entry_gate_pass:false},
      viability:{viability:'watchlist'}, priceabilityState:'unknown', primaryBlockerSource:'resolver'
    }
  }
};
const evaluationBefore = JSON.stringify(evaluationInput);
const evaluation = api.evaluateCanonicalSemanticsAndGates(first, evaluationInput);
assert.strictEqual(JSON.stringify(evaluationInput), evaluationBefore, 'evaluation must not mutate inputs');
assert.ok(Object.isFrozen(evaluation) && Object.isFrozen(evaluation.semanticStates) && Object.isFrozen(evaluation.gates), 'evaluation result must be immutable');
assert.strictEqual(evaluation.semanticStates.plan.priceability, 'provisional');
assert.strictEqual(evaluation.gates.buyerControl.reasons[0], 'Buyer control is not confirmed.');
assert.strictEqual(Object.prototype.hasOwnProperty.call(evaluation, 'verdict'), false, 'semantic evaluation must not select a final verdict');
const selection = api.selectCanonicalDecision(first, evaluation);
assert.ok(Object.isFrozen(selection) && Object.isFrozen(selection.decisionTrace), 'selector result must be immutable');
assert.strictEqual(selection.diagnostics.authority, 'canonical_selector', 'selector must be the canonical decision authority');
assert.strictEqual(selection.verdict, 'watch', 'selector must deterministically replay the supplied evaluation');
assert.strictEqual(firstDecisionTraceDivergenceSafe(api, selection.decisionTrace), null, 'a trace must equal itself');
const alteredTrace = JSON.parse(JSON.stringify(selection.decisionTrace));
alteredTrace[3].outputVerdict = 'entry';
const firstDivergence = api.firstDecisionTraceDivergence(selection.decisionTrace, alteredTrace);
assert.deepStrictEqual(JSON.parse(JSON.stringify(firstDivergence)), {stepIndex:3, stepCode:'near_entry_priceability_enforcement', field:'outputVerdict', legacyValue:'watch', selectorValue:'entry'}, 'first-divergence diagnostics must identify the first changed step and field');
assert.ok(/const canonicalDecisionSelection = selectCanonicalDecision\(resolutionContext, canonicalEvaluation\);[\s\S]*?const rawResult = \{[\s\S]*?canonicalDecisionSelection,[\s\S]*?final_verdict:canonicalDecisionSelection\.verdict,/m.test(resolverSource), 'candidate verdict must be copied directly from the selector during Stage 3C');
assert.ok(/main_blocker:canonicalDecisionSelection\.decisiveBlocker\.reason,[\s\S]*?canonical_decision_trace:canonicalDecisionSelection\.decisionTrace,[\s\S]*?primary_blocker_source:canonicalDecisionSelection\.decisiveBlocker\.category,/m.test(resolverSource), 'candidate blocker and trace must be copied directly from the selector');
assert.ok(!/shadow_decision_selection/.test(resolverSource), 'resolver must not retain a shadow selector publication alias');
console.log('Resolver context assertions passed (determinism, immutability, identity, unknown preservation, and selector authority boundary).');

function firstDecisionTraceDivergenceSafe(api, trace){
  return api.firstDecisionTraceDivergence(trace, JSON.parse(JSON.stringify(trace)));
}
