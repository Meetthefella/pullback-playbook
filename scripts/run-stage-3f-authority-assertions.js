const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const sandbox = {window:{}, console};
sandbox.globalThis = sandbox.window;
function load(relative){
  vm.runInNewContext(fs.readFileSync(path.join(root, relative), 'utf8'), sandbox, {filename:relative});
}

load('js/domain/canonical-resolver-input.js');
load('js/domain/canonical-decision-result.js');
const input = sandbox.window.CanonicalResolverInput;
const canonical = sandbox.window.CanonicalDecisionResult;

const factualRecord = {
  ticker:'AUTH',
  marketData:{price:100, sma20:99, sma50:95, sma200:90, currency:'GBP'},
  setup:{structureState:'intact', trendState:'intact', pullbackZone:'near_20ma', bounceState:'attempt'},
  plan:{entry:100, stop:95, firstTarget:112, currency:'GBP'}
};
const normalised = value => input.normaliseDecisionEvidence(value, {surface:'stage-3f'});
const baseline = normalised(factualRecord);
const changes = [
  {scan:{analysisProjection:{structure_state:'broken', priceability_state:'unpriceable', verdict:'Avoid'}}},
  {review:{analysisState:{normalized:{structure_state:'broken', verdict:'Avoid'}}}},
  {lifecycle:{state:'entry', stage:'active'}, watchlist:{lifecycleState:'entry'}},
  {authority:{source:'scan', version:99}, scan:{resolvedVerdict:'Entry'}}
];
changes.forEach((change, index) => {
  const record = JSON.parse(JSON.stringify(factualRecord));
  Object.keys(change).forEach(key => { record[key] = change[key]; });
  const candidate = normalised(record);
  assert.deepStrictEqual(candidate.values, baseline.values, `consumer-derived change ${index} altered normalised factual evidence`);
  assert.deepStrictEqual(candidate.provenance.planAuthority.plan, baseline.provenance.planAuthority.plan, `consumer-derived change ${index} altered plan authority`);
});

function candidate(overrides = {}){
  return {
    final_verdict:'entry', entry_gate_pass:true, near_entry_gate_pass:true,
    buyer_control_gate_pass:true, confirmation_gate_pass:true,
    priceability_state:'priceable', structure_eligibility:'alive', support_test_state:'held',
    resolvedPlanEntry:100, resolvedPlanStop:95, resolvedPlanTarget:115, resolvedRR:3,
    semantic_blocker_code:'', primary_blocker_source:'resolver', planCurrency:'GBP',
    planUnits:{entry:'GBP', stop:'GBP', firstTarget:'GBP'}, ...overrides
  };
}
const gbp = canonical.publishCanonicalDecision(candidate(), baseline);
assert.strictEqual(gbp.publicationStatus, 'valid');
assert.strictEqual(gbp.canonicalResult.plan.levels.entry.currency, 'GBP');
const gbx = canonical.publishCanonicalDecision(candidate({planCurrency:'GBX', planUnits:{entry:'GBX', stop:'GBX', firstTarget:'GBX'}}), baseline);
assert.strictEqual(gbx.publicationStatus, 'valid');
assert.strictEqual(gbx.canonicalResult.plan.levels.stop.currency, 'GBX');
const mismatched = canonical.publishCanonicalDecision(candidate({planUnits:{entry:'GBP', stop:'GBX', firstTarget:'GBP'}}), baseline);
assert.strictEqual(mismatched.publicationStatus, 'validation_failed');
assert(mismatched.validation.violations.some(item => item.code === 'incompatible_plan_quote_units'));

const gateCapped = canonical.publishCanonicalDecision(candidate({resolvedRR:1}), baseline);
assert.strictEqual(gateCapped.publicationStatus, 'valid');
assert.strictEqual(gateCapped.canonicalResult.plan.rewardRisk.resolvedRr, 3);
assert.strictEqual(gateCapped.canonicalResult.plan.rewardRisk.gateResolvedRr, 1);
assert.strictEqual(gateCapped.canonicalResult.plan.rewardRisk.passes, false);
assert.strictEqual(gateCapped.canonicalResult.plan.visibility.mayShowPlan, false);

const projection = canonical.compatibilityProjection(candidate(), gbp);
projection.final_verdict = 'avoid';
projection.resolvedPlanEntry = 0;
assert.strictEqual(gbp.canonicalResult.verdict.value, 'entry');
assert.strictEqual(gbp.canonicalResult.plan.levels.entry.value, 100);
assert(Object.isFrozen(gbp.canonicalResult));

console.log('Stage 3F authority invariance assertions passed (Scan/Review/lifecycle/Scan-preservation isolation, GBP/GBX units, RR gate separation, immutable publication).');
