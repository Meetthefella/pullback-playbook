const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const fixtures = require(path.join(root, 'tests/fixtures/canonical-decision-baseline-fixtures.js'));

function load(relativePath, sandbox){
  vm.runInNewContext(fs.readFileSync(path.join(root, relativePath), 'utf8'), sandbox, {filename:relativePath});
}

function createSandbox(){
  const sandbox = {window:{}, console};
  sandbox.globalThis = sandbox.window;
  ['js/domain/canonical-resolver-input.js', 'js/domain/canonical-decision-result.js', 'js/resolver-core.js', 'js/domain/paper-trade-eligibility.js', 'js/chart-guru-phase-policy.js', 'js/domain/canonical-decision-observability.js']
    .forEach(relativePath => load(relativePath, sandbox));
  return sandbox.window;
}

function resolverDeps(testCase){
  const contract = testCase.contract;
  const displayedPlan = testCase.displayedPlan;
  return {
    resolvePreLifecycleStateContract:() => contract,
    resolveFinalStateContract:() => contract,
    baseVerdictFromResolvedContract:value => String(value && (value.baseVerdict || value.finalVerdict) || 'watch').toLowerCase().replace(/\s+/g, '_'),
    analysisDerivedStatesFromRecord:item => item.derivedStates,
    effectivePlanForRecord:() => ({entry:displayedPlan.entry, stop:displayedPlan.stop, firstTarget:displayedPlan.target}),
    deriveCurrentPlanState:() => displayedPlan,
    applySetupConfirmationPlanGate:(item, plan) => plan,
    setupScoreForRecord:() => 7,
    canonicalSetupScoreForRecord:() => 7,
    isHostileMarketStatus:() => false,
    evaluatePlanRealism:() => ({credible_rr:displayedPlan.rewardRisk && displayedPlan.rewardRisk.rrRatio}),
    buildCumulativePenaltyTrace:() => [],
    scannerScoreGradientClass:() => '',
    state:{marketStatus:'supportive'}
  };
}

function paperTradeContext(result, plan){
  return {
    finalVerdict:result.final_verdict,
    planStatus:plan.status,
    primaryState:result.lifecycle,
    riskStatus:plan.riskFit && plan.riskFit.risk_status,
    tradeability:plan.tradeability,
    capitalFit:plan.capitalFit && plan.capitalFit.capital_fit,
    entry:plan.entry,
    stop:plan.stop,
    target:plan.target,
    positionSize:plan.riskFit && plan.riskFit.position_size,
    maxLoss:40,
    rrRatio:plan.rewardRisk && plan.rewardRisk.rrRatio
  };
}

function run(){
  const api = createSandbox();
  const paper = api.PaperTradeEligibility.createPaperTradeEligibility();
  const results = fixtures.map(testCase => {
    const result = api.ResolverCore.resolveGlobalVerdict(testCase.record, resolverDeps(testCase));
    const eligibility = paper.evaluatePaperTradeEligibility(paperTradeContext(result, testCase.displayedPlan));
    const chartGuru = api.ChartGuruPhasePolicy.validatedCanonicalPhase(testCase.chartGuru.phase, testCase.chartGuru);
    const summary = api.CanonicalDecisionObservability.buildDecisionObservabilitySummary(testCase.record, result, {
      scan:{verdict:result.final_verdict},
      review:{verdict:result.final_verdict},
      track:{verdict:result.final_verdict},
      paperTrade:eligibility
    });
    return {
      id:testCase.id,
      ticker:testCase.ticker,
      decisionTrace:result.legacy_decision_trace,
      canonicalFacts:{
        structure:result.structure_state,
        bounce:result.bounce_state,
        priceability:result.priceability_state,
        support:result.supportAuthority && result.supportAuthority.semantic
      },
      gates:summary.gates,
      verdict:result.final_verdict,
      decisiveBlocker:summary.decisiveBlocker,
      surfaces:summary.surfaces,
      paperTradeEligible:eligibility.eligible,
      chartGuru:{phase:chartGuru, supportInteraction:testCase.chartGuru.supportInteraction}
    };
  });

  assert.strictEqual(results.length, 6, 'baseline must cover the five named tickers plus broken structure');
  assert.strictEqual(results.find(result => result.id === 'broken_structure').verdict, 'avoid', 'broken structure must remain Avoid');
  assert.strictEqual(results.find(result => result.id === 'hwm_confirmed_control').verdict, 'watch', 'HWM-like Entry proposal must not bypass failed Entry prerequisites');
  assert.strictEqual(results.find(result => result.id === 'amzn_emerging_buyer_control').gates.entry, false, 'emerging buyer control must block Entry');
  assert.strictEqual(results.find(result => result.id === 'unp_unpriceable_plan').paperTradeEligible, false, 'unpriceable plan must block paper trading');
  assert.strictEqual(results.find(result => result.id === 'cat_accepted_50ma_support').chartGuru.phase, 'at_support', 'accepted 50MA support must retain at-support phase');
  assert.strictEqual(results.find(result => result.id === 'kdp_confirmed_without_follow_through').gates.entry, false, 'confirmed control without follow-through must block Entry');
  results.forEach(result => {
    assert.strictEqual(result.surfaces.scan, result.verdict, `${result.id}: Scan baseline must reflect the resolver`);
    assert.strictEqual(result.surfaces.review, result.verdict, `${result.id}: Review baseline must reflect the resolver`);
    assert.strictEqual(result.surfaces.track, result.verdict, `${result.id}: Track baseline must reflect the resolver`);
    assert.ok(Array.isArray(result.decisionTrace), `${result.id}: legacy decision trace must be available for Stage 3 shadow parity`);
    const stepCodes = result.decisionTrace.map(step => step.stepCode);
    const requiredSteps = [
      'incoming_contract_verdict',
      'initial_contract_verdict_proposal',
      'promotion_guard_result',
      'near_entry_priceability_enforcement',
      'scan_authority_state_release',
      'lifecycle_viability_adjustment',
      'late_pullback_cap',
      'structural_avoid_guard',
      'entry_gate_enforcement',
      'near_entry_gate_enforcement',
      'final_decision'
    ];
    assert.strictEqual(stepCodes.join('|'), requiredSteps.join('|'), `${result.id}: legacy trace must preserve the exact current decision order`);
    result.decisionTrace.forEach(step => {
      assert.strictEqual(typeof step.changed, 'boolean', `${result.id}: ${step.stepCode} must report whether it changed the verdict`);
      assert.ok(step.evidenceId, `${result.id}: ${step.stepCode} must retain its evidence identity`);
      assert.strictEqual(step.resultVersion, 'canonical-decision-result-v1.1', `${result.id}: ${step.stepCode} must retain its result version`);
    });
    assert.strictEqual(result.decisionTrace[result.decisionTrace.length - 1].outputVerdict, result.verdict, `${result.id}: final trace verdict must equal published canonical verdict`);
  });
  const changedSteps = id => results.find(result => result.id === id).decisionTrace.filter(step => step.changed).map(step => step.stepCode);
  assert.ok(changedSteps('hwm_confirmed_control').includes('entry_gate_enforcement'), 'HWM trace must capture its final Entry-gate demotion.');
  assert.ok(changedSteps('kdp_confirmed_without_follow_through').includes('near_entry_gate_enforcement'), 'KDP trace must capture its final Near Entry-gate demotion.');
  assert.ok(changedSteps('broken_structure').includes('structural_avoid_guard') === false, 'Terminal broken structure must not be softened by the structural Avoid guard.');
  assert.strictEqual(results.find(result => result.id === 'unp_unpriceable_plan').decisionTrace.find(step => step.stepCode === 'near_entry_priceability_enforcement').outputVerdict, 'watch', 'Unpriceable plan trace must remain non-promoted.');
  console.log(JSON.stringify({
    suite:'canonical-decision-baseline',
    passed:results.length,
    traceAssertions:'passed',
    results:results.map(({decisionTrace, ...result}) => result)
  }, null, 2));
}

run();
