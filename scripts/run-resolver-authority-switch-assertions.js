const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const resolverSource = fs.readFileSync(path.join(root, 'js/resolver-core.js'), 'utf8');
const domainSource = fs.readFileSync(path.join(root, 'js/domain/canonical-decision-result.js'), 'utf8');
const sandbox = {window:{}, console};
sandbox.globalThis = sandbox.window;
vm.runInNewContext(domainSource, sandbox, {filename:'canonical-decision-result.js'});

const rawBlock = resolverSource.slice(resolverSource.indexOf('const rawResult = {'), resolverSource.indexOf('const normalizedEvidence = resolutionContext.evidence;'));
assert.ok(/canonicalDecisionSelection,\s*final_verdict:canonicalDecisionSelection\.verdict,/m.test(rawBlock), 'candidate verdict must be copied directly from CanonicalDecisionSelection');
assert.ok(/allow_plan:canonicalDecisionSelection\.actionability,/.test(rawBlock), 'candidate actionability must be copied directly from CanonicalDecisionSelection');
assert.ok(/reason:canonicalDecisionSelection\.decisiveBlocker\.reason,/.test(rawBlock), 'candidate reason must be copied directly from CanonicalDecisionSelection');
assert.ok(/main_blocker:canonicalDecisionSelection\.decisiveBlocker\.reason,/.test(rawBlock), 'candidate decisive blocker text must be copied directly from CanonicalDecisionSelection');
assert.ok(/primary_blocker_source:canonicalDecisionSelection\.decisiveBlocker\.category,/.test(rawBlock), 'candidate decisive blocker category must be copied directly from CanonicalDecisionSelection');
assert.ok(/canonical_decision_trace:canonicalDecisionSelection\.shadowDecisionTrace,/.test(rawBlock), 'published decision trace must come from CanonicalDecisionSelection');
assert.ok(!/final_verdict:canonicalFinalVerdict/.test(rawBlock), 'legacy final verdict must not enter candidate construction');
assert.ok(!/legacy_decision_trace[^\n]*\.outputVerdict/.test(rawBlock), 'legacy trace must not feed candidate decision fields');
assert.ok(!/rawResult\.(?:final_verdict|allow_plan|main_blocker|primary_blocker_source)\s*=/.test(rawBlock), 'no post-selector reassignment may mutate candidate decision fields');

const api = sandbox.window.CanonicalDecisionResult;
const evidence = {schemaVersion:'normalised-decision-evidence-v1', snapshotId:'authority-switch-evidence'};
const candidate = {
  final_verdict:'watch',
  entry_gate_pass:false,
  near_entry_gate_pass:false,
  buyer_control_gate_pass:false,
  confirmation_gate_pass:false,
  hasPriceablePlan:true,
  priceability_state:'priceable',
  structure_state:'intact',
  structure_eligibility:'alive',
  support_test_state:'held',
  canonicalDecisionSelection:{
    eligibility:{entry:{state:'blocked', qualified:false}, nearEntry:{state:'qualified', qualified:true}},
    verdict:'watch',
    actionability:false,
    decisiveBlocker:{code:'selector_blocker', category:'selector_category', reason:'Selector authority blocks promotion.'},
    reasonSource:'selector_reason',
    shadowDecisionTrace:[]
  },
  legacy_decision_trace:[{outputVerdict:'entry'}],
  legacy_decision_selection:{verdict:'entry', actionability:true}
};
const published = api.createCanonicalDecisionResult(candidate, evidence);
assert.strictEqual(published.verdict.value, 'watch', 'legacy observer output cannot promote the candidate');
assert.strictEqual(published.eligibility.nearEntry.qualified, true, 'candidate eligibility must come from CanonicalDecisionSelection');
candidate.legacy_decision_selection.verdict = 'avoid';
candidate.legacy_decision_trace[0].outputVerdict = 'avoid';
assert.strictEqual(published.verdict.value, 'watch', 'mutating a legacy observer after construction cannot alter publication');

const invalidSelectorCandidate = {
  ...candidate,
  final_verdict:'entry',
  canonicalDecisionSelection:{
    ...candidate.canonicalDecisionSelection,
    eligibility:{entry:{state:'blocked', qualified:false}, nearEntry:{state:'blocked', qualified:false}},
    verdict:'entry',
    actionability:true
  }
};
const invalid = api.createCanonicalDecisionResult(invalidSelectorCandidate, evidence);
assert.ok(invalid.validation.violations.some(item => item.code === 'entry_verdict_without_entry_eligibility'), 'a selector/candidate mismatch must be rejected by Canonical Norm validation');

console.log('Resolver authority-switch assertions passed (selector candidate authority, legacy observer isolation, and norm rejection).');
