const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const hooks = require(path.join(root, 'netlify', 'functions', 'analyse-setup.js')).__test;

function extract(name){
  const start = appSource.indexOf(`function ${name}(`);
  if(start < 0) throw new Error(`Missing ${name}`);
  const body = appSource.indexOf('{', appSource.indexOf(')', start));
  let depth = 0;
  for(let index = body; index < appSource.length; index += 1){
    if(appSource[index] === '{') depth += 1;
    if(appSource[index] === '}' && --depth === 0) return appSource.slice(start, index + 1);
  }
  throw new Error(`Unclosed ${name}`);
}

const sandbox = {};
vm.runInNewContext(extract('canonicalBuyerStatesFromStoryContext'), sandbox);
const resolve = sandbox.canonicalBuyerStatesFromStoryContext;

const scenarios = [
  ['response present / control developing', {currentPhase:'responding_from_support', buyerResponse:{state:'present'}, buyerControl:{state:'developing'}, followThrough:{state:'not_started'}}, {buyerResponse:'present',buyerControl:'developing',followThrough:'not_started'}],
  ['control confirmed / follow-through developing', {currentPhase:'responding_from_support', buyerResponse:{state:'present'}, buyerControl:{state:'confirmed'}, followThrough:{state:'developing'}}, {buyerResponse:'present',buyerControl:'confirmed',followThrough:'developing'}],
  ['control confirmed / follow-through stalled', {currentPhase:'stalled_after_response', buyerResponse:{state:'present'}, buyerControl:{state:'confirmed'}, followThrough:{state:'stalled'}}, {buyerResponse:'present',buyerControl:'confirmed',followThrough:'stalled'}],
  ['support failed / buyer control failed', {currentPhase:'support_failed', buyerResponse:{state:'failed'}, buyerControl:{state:'failed'}, followThrough:{state:'failed'}}, {buyerResponse:'failed',buyerControl:'failed',followThrough:'failed'}],
  ['restored stale wording is ignored', {currentPhase:'responding_from_support', buyerResponse:{state:'present'}, buyerControl:{state:'confirmed'}, followThrough:{state:'developing'}, simplifiedState:{mainBlocker:'buyers still need to prove control'}}, {buyerResponse:'present',buyerControl:'confirmed',followThrough:'developing'}],
  ['partial legacy fallback', {currentPhase:'at_support', buyerResponse:{state:'absent'}}, {buyerResponse:'none',buyerControl:'none',followThrough:'unknown'}]
];

for(const [name, input, expected] of scenarios){
  assert.deepStrictEqual(JSON.parse(JSON.stringify(resolve(input))), expected, name);
  const contract = hooks.buildCanonicalNarrationContract({
    currentPhase:input.currentPhase,
    buyerResponseState:expected.buyerResponse,
    buyerControlState:expected.buyerControl,
    followThroughState:expected.followThrough,
    supportState:{interaction:expected.buyerControl === 'failed' ? 'failed' : 'held', currentlyActive:expected.buyerControl !== 'failed'}
  }, {verdict:'watch'});
  assert.strictEqual(contract.buyerControl, expected.buyerControl, `${name}: Chart Guru contract control`);
  assert.strictEqual(contract.followThrough, expected.followThrough, `${name}: Chart Guru contract follow-through`);
}

const confirmedControlThenStalled = hooks.buildCanonicalNarrationContract({
  currentPhase:'stalled_after_response',
  buyerResponseState:'confirmed',
  buyerControlState:'confirmed',
  followThroughState:'stalled',
  supportState:{interaction:'held', currentlyActive:true}
}, {verdict:'watch', nextRequiredEvent:'follow_through'});
assert.deepStrictEqual(
  hooks.validateCanonicalNarrationContract(confirmedControlThenStalled),
  {ok:true, errors:[]},
  'confirmed initial control with stalled follow-through must remain eligible for AI narration'
);
assert.ok(
  hooks.validateCanonicalNarrationContract({...confirmedControlThenStalled, followThrough:'confirmed'}).errors.includes('stalled_follow_through_confirmed_conflict'),
  'stalled phase must reject a contract that instead claims confirmed follow-through'
);
const stalledFallback = hooks.deterministicNarrationFallback(confirmedControlThenStalled);
assert.ok(/took control.*follow-through has stalled/i.test(stalledFallback.chartStory), 'stalled fallback must retain historical control and state the current stall');
assert.strictEqual(hooks.validateNarrationProseAgainstContract(stalledFallback, confirmedControlThenStalled).ok, true, 'stalled fallback must remain faithful to confirmed-control history');

const sharedDecision = extract('sharedDecisionSummaryFromSemantics');
const reviewDecision = extract('reviewDecisionSummaryFromSemantics');
const trackDecision = extract('trackDecisionSummaryFromSemantics');
assert.ok(sharedDecision.includes('canonicalBuyerStatesFromStoryContext'), 'shared Scan/Review/Track decision copy must use the canonical buyer-state resolver');
assert.ok(sharedDecision.includes('contradictsConfirmedBuyerControl'), 'shared decision copy must explicitly reject contradictory persisted buyer-control prose');
const presentationSandbox = {canonicalBuyerStatesFromStoryContext:resolve, normalizeGlobalVerdictKey:value => String(value || '').trim().toLowerCase() || 'watch'};
vm.runInNewContext(sharedDecision, presentationSandbox);
vm.runInNewContext(reviewDecision, presentationSandbox);
vm.runInNewContext(trackDecision, presentationSandbox);
assert.ok(!/buyer control is not convincing yet|stronger buyer control is needed|support is reacting|bounce is improving/i.test(trackDecision), 'Track summary adapter must not regenerate deprecated buyer-state wording');
const surfaceParityScenarios = [
  ['buyer response developing', {currentPhase:'responding_from_support', buyerResponse:{state:'present'}, buyerControl:{state:'none'}, followThrough:{state:'not_started'}}, /buyer control|support is holding/i],
  ['buyer control developing', {currentPhase:'responding_from_support', buyerResponse:{state:'present'}, buyerControl:{state:'developing'}, followThrough:{state:'not_started'}}, /buyer control is still developing/i],
  ['buyer control confirmed', {currentPhase:'responding_from_support', buyerResponse:{state:'confirmed'}, buyerControl:{state:'confirmed'}, followThrough:{state:'confirmed'}}, /support is holding|independent confirmation/i],
  ['follow-through developing', {currentPhase:'responding_from_support', buyerResponse:{state:'confirmed'}, buyerControl:{state:'confirmed'}, followThrough:{state:'developing'}}, /follow-through is still developing/i],
  ['follow-through stalled', {currentPhase:'stalled_after_response', buyerResponse:{state:'confirmed'}, buyerControl:{state:'confirmed'}, followThrough:{state:'stalled'}}, /follow-through has stalled/i],
  ['support failed', {currentPhase:'support_failed', buyerResponse:{state:'failed'}, buyerControl:{state:'failed'}, followThrough:{state:'failed'}}, /support failed/i]
];
for(const [name, storyContext, expectedMeaning] of surfaceParityScenarios){
  const semantics = {finalVerdict:'watch', currentPhase:storyContext.currentPhase, storyContext};
  const reviewSummary = presentationSandbox.reviewDecisionSummaryFromSemantics(semantics, '');
  const trackSummary = presentationSandbox.trackDecisionSummaryFromSemantics(semantics, '');
  assert.strictEqual(trackSummary, reviewSummary, `${name}: Track must consume the same resolved decision summary as Review`);
  assert.ok(expectedMeaning.test(reviewSummary), `${name}: shared presentation must retain the expected buyer-state meaning`);
}
const staleRestoredSummary = presentationSandbox.sharedDecisionSummaryFromSemantics({
  finalVerdict:'watch', currentPhase:'responding_from_support',
  blockerSummary:'buyers still need to prove control',
  storyContext:{buyerResponse:{state:'confirmed'}, buyerControl:{state:'confirmed'}, followThrough:{state:'developing'}}
});
assert.strictEqual(staleRestoredSummary, 'Watch - buyers have taken control at support, but follow-through is still developing.', 'restored stale prove-control copy must be replaced by canonical follow-through wording');
const stalledWatchSummary = presentationSandbox.sharedDecisionSummaryFromSemantics({
  finalVerdict:'watch', currentPhase:'stalled_after_response',
  storyContext:{buyerResponse:{state:'confirmed'}, buyerControl:{state:'confirmed'}, followThrough:{state:'stalled'}}
});
assert.strictEqual(stalledWatchSummary, 'Watch - buyers initially took control, but follow-through has stalled.', 'Watch summary must make stalled follow-through the current blocker');
const stalledAvoidSummary = presentationSandbox.sharedDecisionSummaryFromSemantics({
  finalVerdict:'avoid', currentPhase:'support_failed', dominantStory:'failed_support_test',
  storyContext:{buyerResponse:{state:'confirmed'}, buyerControl:{state:'confirmed'}, followThrough:{state:'stalled'}}
});
assert.strictEqual(stalledAvoidSummary, 'Avoid - support failed and the chart needs repair.', 'Avoid verdict must retain terminal authority over buyer-state Watch copy');
const developingEntrySummary = presentationSandbox.sharedDecisionSummaryFromSemantics({
  finalVerdict:'entry', currentPhase:'responding_from_support',
  storyContext:{buyerResponse:{state:'confirmed'}, buyerControl:{state:'confirmed'}, followThrough:{state:'developing'}}
});
assert.strictEqual(developingEntrySummary, 'Entry - plan is valid and risk defined.', 'Entry verdict must not be downgraded to Watch by buyer-state copy');
const developingNearEntrySummary = presentationSandbox.sharedDecisionSummaryFromSemantics({
  finalVerdict:'near_entry', currentPhase:'responding_from_support',
  storyContext:{buyerResponse:{state:'confirmed'}, buyerControl:{state:'confirmed'}, followThrough:{state:'developing'}}
});
assert.strictEqual(developingNearEntrySummary, 'Near Entry - buyers are in control, but the entry trigger is still missing.', 'Near Entry verdict must retain its independent trigger condition');
const compatibleRestoredSummary = presentationSandbox.sharedDecisionSummaryFromSemantics({
  finalVerdict:'watch', currentPhase:'responding_from_support',
  blockerSummary:'Buyer control is still developing.',
  storyContext:{buyerResponse:{state:'present'}, buyerControl:{state:'developing'}, followThrough:{state:'not_started'}}
});
assert.strictEqual(compatibleRestoredSummary, 'Buyer control is still developing.', 'compatible developing-control blocker copy may remain');

const roundTripContract = hooks.buildCanonicalNarrationContract({
  currentPhase:'responding_from_support', buyerResponseState:'present', buyerControlState:'confirmed', followThroughState:'developing',
  supportState:{interaction:'held', currentlyActive:true}
}, {verdict:'watch', nextRequiredEvent:'follow_through'});
const roundTripCoach = hooks.buildTwoStepChartCoach({chartStory:'Buyers responded from support.', whyItMatters:'Initial control needs follow-through.', setupLocation:'Price is holding at support.', learningPoint:'Control and continuation are separate.', whatNext:'Watch for buyers to follow through.'}, roundTripContract, {});
assert.deepStrictEqual({buyerResponse:roundTripCoach.recentStory.buyerResponseState, buyerControl:roundTripCoach.recentStory.buyerControlState, followThrough:roundTripCoach.recentStory.followThroughState}, {buyerResponse:'present',buyerControl:'confirmed',followThrough:'developing'}, 'persisted Chart Guru metadata must retain all three canonical state domains separately');
assert.strictEqual(roundTripCoach.recentStory.buyerResponseSemantic, 'response_present', 'persisted response semantic must be sourced from buyer response');
const failedResponseContract = hooks.buildCanonicalNarrationContract({currentPhase:'support_failed', buyerResponseState:'failed', buyerControlState:'failed', followThroughState:'failed', supportState:{interaction:'failed', currentlyActive:false}}, {verdict:'watch', nextRequiredEvent:'repair'});
const failedResponseCoach = hooks.buildTwoStepChartCoach({chartStory:'Support failed.', whyItMatters:'The response failed.', setupLocation:'The earlier support failed.', learningPoint:'Repair is required.', whatNext:'Watch for price to repair.'}, failedResponseContract, {});
assert.strictEqual(failedResponseCoach.recentStory.buyerResponseSemantic, 'response_failed', 'failed buyer response must never be written as a buyer-control value');
const unknownResponseContract = hooks.buildCanonicalNarrationContract({currentPhase:'responding_from_support', buyerResponseState:'unknown', buyerControlState:'confirmed', followThroughState:'developing', supportState:{interaction:'held', currentlyActive:true}}, {verdict:'watch', nextRequiredEvent:'follow_through'});
const unknownResponseCoach = hooks.buildTwoStepChartCoach({chartStory:'Buyers took initial control.', whyItMatters:'Follow-through is developing.', setupLocation:'Price is holding at support.', learningPoint:'The response source is unknown.', whatNext:'Watch for buyers to follow through.'}, unknownResponseContract, {});
assert.strictEqual(unknownResponseCoach.recentStory.buyerResponseSemantic, 'response_unknown', 'unknown buyer response must remain type-correct even with explicitly confirmed control');
const fallback = hooks.deterministicNarrationFallback({phase:'responding_from_support', buyerControl:'confirmed', followThrough:'developing', support:{label:'20-day average'}, nextRequiredEvent:'follow_through'});
assert.ok(/taken initial control.*follow-through/i.test(fallback.chartStory), 'confirmed control fallback must make follow-through the blocker');
console.log('run-buyer-state-alignment-assertions: ok');
