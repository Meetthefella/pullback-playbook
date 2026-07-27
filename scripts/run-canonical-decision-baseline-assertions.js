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
  });
  console.log(JSON.stringify({suite:'canonical-decision-baseline', passed:results.length, results}, null, 2));
}

run();
