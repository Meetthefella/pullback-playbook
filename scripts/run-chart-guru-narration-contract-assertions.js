/*
 * High-level narrator authority integration test.
 * It deliberately stops at the renderer boundary: chart verification and image facts
 * are not narration inputs and the renderer receives only the canonical contract.
 */
const assert = require('assert');
const hooks = require('../netlify/functions/analyse-setup').__test;
const {loadBenchmarkCases} = require('../tests/fixtures/chart-guru-benchmark-library.js');

function deterministicEngine(chartCoach){
  const primary = chartCoach.primaryStory || {};
  const recent = chartCoach.recentStory || {};
  const context = chartCoach.storyContext || chartCoach.diagnostics && chartCoach.diagnostics.storyContext || {};
  return hooks.normalizeDeterministicEventPacket({
    dominantEventKey:primary.key, dominantEventLabel:primary.label, dominantEvent:primary.text,
    eventSequence:recent.steps, evidenceFactIds:[...(primary.evidenceFactIds || []), ...(recent.evidenceFactIds || [])],
    primaryStoryKey:primary.key, recentStoryKey:recent.key, recentStorySupportLabel:recent.supportLabel,
    supportSemantic:recent.supportSemantic || context.support && context.support.semantic,
    buyerResponseSemantic:recent.buyerResponseSemantic || context.buyerResponse && context.buyerResponse.semantic,
    confirmationSemantic:recent.confirmationSemantic || context.confirmation && context.confirmation.semantic,
    supportState:context.support, buyerControlState:context.buyerControl && context.buyerControl.state,
    currentPhase:context.currentPhase, stepDetails:recent.stepDetails
  });
}

function engineToContract(packet, fixture){
  return hooks.buildCanonicalNarrationContract(packet, {
    structure:fixture.setupStates.structureState === 'broken' ? 'broken' : (fixture.setupStates.structureState === 'weakening' ? 'weakening' : 'intact'),
    trend:fixture.setupStates.trendState === 'strong' ? 'healthy' : 'weak',
    volume:fixture.setupStates.volumeState,
    market:/below/i.test(fixture.marketStatus) ? 'weak' : 'supportive',
    verdict:'watch'
  });
}

function assertRendererBoundary(contract){
  const contaminated = {...contract, verification:{chartMatch:'mismatch'}, imageAnalysis:{visibleTicker:'WRONG'}, traderInterpretation:{dominantEvent:'wrong'}, diagnostics:{internal:true}};
  const prompt = hooks.buildProductionChartGuruFinalPrompt(contaminated);
  assert.ok(prompt.includes('Canonical narration contract'), 'renderer prompt must name the canonical contract');
  assert.ok(prompt.includes(contract.version), 'renderer prompt must include contract version');
  const rendererInput = JSON.parse(prompt.slice(prompt.indexOf('{')));
  assert.deepStrictEqual(Object.keys(rendererInput).sort(), ['version','phase','dominantEvent','eventSequence','structure','support','buyerResponse','buyerControl','followThrough','trend','volume','market','dominantBlocker','nextRequiredEvent','verdict','evidenceFactIds'].sort(), 'renderer prompt must use an exact contract-field allow-list');
  assert.ok(!/verification|imageAnalysis|traderInterpretation|diagnostics|chartMatch|visibleTicker/i.test(prompt), 'verification, image analysis, interpreter, and diagnostics fields must never enter renderer input');
}

for(const fixture of loadBenchmarkCases()){
  const packet = deterministicEngine(fixture.deterministicChartCoach);
  const contract = engineToContract(packet, fixture);
  const validation = hooks.validateCanonicalNarrationContract(contract);
  assert.strictEqual(validation.ok, true, `${fixture.id}: deterministic engine must produce a valid canonical contract (${validation.errors.join(', ')})`);
  assert.strictEqual(contract.dominantEvent, packet.dominantEventLabel, `${fixture.id}: event identity must survive engine → contract`);
  assert.deepStrictEqual([...contract.eventSequence], [...packet.eventSequence], `${fixture.id}: chronology must survive engine → contract`);
  assert.deepStrictEqual([...contract.evidenceFactIds], [...packet.evidenceFactIds], `${fixture.id}: evidence ids must survive engine → contract`);
  assertRendererBoundary(contract);

  const rendererOutput = hooks.deterministicNarrationFallback(contract);
  const faithful = hooks.validateNarrationProseAgainstContract(rendererOutput, contract);
  assert.strictEqual(faithful.ok, true, `${fixture.id}: deterministic renderer fallback must remain faithful (${faithful.errors.join(', ')})`);
}

for(const [phase, nextRequiredEvent] of Object.entries({
  at_support:'support_hold', responding_from_support:'follow_through', stalled_after_response:'follow_through',
  extended_from_support:'pullback_or_reset', away_from_support:'clearer_support', support_failed:'repair',
  repairing_structure:'repair', current_location_unresolved:'clearer_support'
})){
  const contract = hooks.buildCanonicalNarrationContract({
    currentPhase:phase, dominantEventLabel:'Canonical event', eventSequence:['first','current'], evidenceFactIds:['fact_a'],
    supportState:{interaction:['extended_from_support','away_from_support'].includes(phase) ? 'not_tested' : (phase === 'support_failed' ? 'failed' : 'testing')},
    buyerControlState:'emerging', confirmationSemantic:phase === 'support_failed' ? 'follow_through_failed' : 'follow_through_unconfirmed'
  }, {structure:phase === 'support_failed' ? 'weakening' : 'intact', nextRequiredEvent});
  assert.strictEqual(contract.phase, phase, `${phase}: canonical phase must be preserved`);
  assert.strictEqual(contract.nextRequiredEvent, nextRequiredEvent, `${phase}: next event must be phase-specific`);
  assert.ok(hooks.validateCanonicalNarrationContract({...contract, nextRequiredEvent:'unknown'}).errors.includes('phase_next_event_mismatch'), `${phase}: a valid known phase must reject a missing next event`);
  const fallback = hooks.deterministicNarrationFallback(contract);
  assert.strictEqual(hooks.validateNarrationProseAgainstContract(fallback, contract).ok, true, `${phase}: fallback sections must be faithful`);
  const text = Object.values(fallback).join(' ').toLowerCase();
  if(['extended_from_support','away_from_support'].includes(phase)) assert.ok(/not at an active support test/.test(text), `${phase}: fallback must not claim active support`);
  else if(phase === 'support_failed') assert.ok(/support.*failed|failed.*support/.test(text), `${phase}: fallback must preserve failed support`);
  else if(phase === 'stalled_after_response') assert.ok(/stalled/.test(fallback.chartStory) && !/reset|new pullback/i.test(fallback.whatNext), `${phase}: fallback must preserve stalled response and follow-through only`);
  else if(['at_support','responding_from_support'].includes(phase)) assert.ok(/support/.test(fallback.chartStory.toLowerCase()), `${phase}: fallback must preserve active support context`);
}

const stalled = hooks.buildCanonicalNarrationContract({
  currentPhase:'stalled_after_response', dominantEventLabel:'Response stalled', eventSequence:['support_test','buyers_responded','rebound_stalled'],
  supportState:{interaction:'held'}, buyerControlState:'emerging', confirmationSemantic:'follow_through_unconfirmed', evidenceFactIds:['support','stall']
}, {structure:'intact', nextRequiredEvent:'follow_through'});
stalled.support = {type:'50ma', label:'50-day average', interaction:'held', currentlyActive:true, semantic:'active_held_support'};
const staleNextEventContract = hooks.selectCanonicalNarrationContractForRenderer({
  ...stalled,
  nextRequiredEvent:'clearer_support'
});
assert.strictEqual(staleNextEventContract.nextRequiredEvent, 'follow_through', 'a supplied contract may not retain a stale next event that contradicts its phase');

const amznStylePacket = {
  dominantEventKey:'early_rebound_from_20ma',
  primaryStoryKey:'early_rebound_from_20ma',
  recentStoryKey:'early_rebound_from_20ma',
  dominantEventLabel:'Early rebound from 20-day average',
  eventSequence:['support_held_at_20ma','buyers_responded','rebound_stalled'],
  storyEvents:['support_held_at_20ma','buyers_responded','buyer_control_emerging','rebound_stalled'],
  supportState:{type:'20ma', label:'20-day average', interaction:'held', currentlyActive:false, semantic:'unknown'},
  supportSemantic:'support_present',
  buyerResponseSemantic:'response_present',
  buyerResponseState:'present',
  buyerControlState:'developing',
  followThroughState:'stalled',
  confirmationSemantic:'follow_through_stalled',
  currentPhase:'unknown',
  evidenceFactIds:['support_20ma','buyers_responded','rebound_stalled']
};
const amznStyleContract = hooks.buildCanonicalNarrationContract(amznStylePacket, {structure:'intact', verdict:'watch'});
assert.strictEqual(amznStyleContract.phase, 'stalled_after_response', 'stalled deterministic chronology must outrank an unknown phase');
assert.strictEqual(amznStyleContract.support.type, '20ma', 'the historical 20MA support type must survive contract projection');
assert.strictEqual(amznStyleContract.support.label, '20-day average', 'the historical 20MA label must survive contract projection');
assert.strictEqual(amznStyleContract.buyerResponse, 'present', 'buyer response must remain separate from buyer control');
assert.strictEqual(amznStyleContract.buyerControl, 'developing', 'developing buyer control must survive contract projection');
assert.strictEqual(amznStyleContract.followThrough, 'stalled', 'stalled follow-through must survive contract projection');
assert.strictEqual(amznStyleContract.nextRequiredEvent, 'follow_through', 'a stalled response must require follow-through rather than a new support test');
assert.strictEqual(hooks.projectNarrationPhaseFromPacket(amznStylePacket), 'stalled_after_response', 'packet phase projection must recognise the AMZN-style chronology');
const repairedSuppliedContract = hooks.selectCanonicalNarrationContractForRenderer({...amznStyleContract, phase:'unknown'}, amznStylePacket, {structure:'intact', verdict:'watch'});
assert.strictEqual(repairedSuppliedContract.phase, 'stalled_after_response', 'a supplied unknown phase must be repaired from deterministic chronology before rendering');
const repairedContractOnly = hooks.selectCanonicalNarrationContractForRenderer({...amznStyleContract, phase:'unknown'}, {}, {structure:'intact', verdict:'watch'});
assert.strictEqual(repairedContractOnly.phase, 'stalled_after_response', 'a supplied unknown phase must be repaired from its own canonical buyer-state chronology when a legacy packet is unavailable');
assert.strictEqual(repairedContractOnly.nextRequiredEvent, 'follow_through', 'phase repair must carry its exact canonical next event');
const contractOnlyUnknown = dominantEvent => ({
  version:'chart-guru-narration-contract-v1', phase:'unknown', dominantEvent, eventSequence:[],
  structure:'intact', support:{type:'unknown', label:'', interaction:'unknown', currentlyActive:null, semantic:'unknown'},
  buyerResponse:'unknown', buyerControl:'unknown', followThrough:'unknown', trend:'healthy', volume:'unknown', market:'supportive',
  dominantBlocker:'unknown', nextRequiredEvent:'unknown', verdict:'watch', evidenceFactIds:[]
});
for(const dominantEvent of ['Early rebound from 20MA', 'Early rebound from 20 MA', 'Early rebound from 50MA', 'Early rebound from 50 MA', 'Early rebound from 200MA', 'Early rebound from 200 MA']){
  const repaired = hooks.selectCanonicalNarrationContractForRenderer(contractOnlyUnknown(dominantEvent), {}, {});
  assert.strictEqual(repaired.phase, 'responding_from_support', `${dominantEvent}: canonical MA label must repair an unknown contract-only phase`);
  assert.strictEqual(repaired.nextRequiredEvent, 'follow_through', `${dominantEvent}: repaired phase must derive follow-through as the next required event`);
  assert.strictEqual(hooks.validateCanonicalNarrationContract(repaired).ok, true, `${dominantEvent}: repaired contract must remain valid`);
  assert.ok(hooks.validateCanonicalNarrationContract({...repaired, nextRequiredEvent:'unknown'}).errors.includes('phase_next_event_mismatch'), `${dominantEvent}: a repaired phase must still reject a contradictory next event`);
}
for(const dominantEvent of ['early_rebound_from_20ma', 'early_rebound_from_50ma', 'early_rebound_from_200ma']){
  const repaired = hooks.selectCanonicalNarrationContractForRenderer(contractOnlyUnknown(dominantEvent), {}, {});
  assert.strictEqual(repaired.phase, 'responding_from_support', `${dominantEvent}: canonical event enum must repair an unknown contract-only phase`);
  assert.strictEqual(repaired.nextRequiredEvent, 'follow_through', `${dominantEvent}: canonical event enum must derive the next event`);
}
const respondingPacketForInvariant = {...amznStylePacket, currentPhase:'responding_from_support', followThroughState:'not_started', confirmationSemantic:'follow_through_not_started', eventSequence:['support_held_at_20ma','buyers_responded']};
const unresolvedRespondingContract = {...contractOnlyUnknown('early_rebound_from_20ma'), support:{type:'20ma', label:'20-day average', interaction:'held', currentlyActive:true, semantic:'active_held_support'}};
const unresolvedErrors = hooks.validateCanonicalNarrationContract(unresolvedRespondingContract, respondingPacketForInvariant).errors;
assert.ok(unresolvedErrors.includes('phase_mismatch_with_packet'), 'A known packet phase may not validate against an unknown contract phase');
assert.ok(unresolvedErrors.includes('phase_missing_for_dominant_event'), 'A recognised early-rebound event may not validate with an unknown contract phase');
const unrelatedContractOnly = contractOnlyUnknown('Momentum remains mixed after recent volatility');
assert.strictEqual(hooks.selectCanonicalNarrationContractForRenderer(unrelatedContractOnly, {}, {}).phase, 'unknown', 'unrelated dominant-event text must not manufacture a recognised phase');
assert.ok(hooks.validateCanonicalNarrationContract({...amznStyleContract, phase:'unknown'}).errors.includes('phase_unknown_with_recognized_evidence'), 'unknown phase must fail validation when stalled chronology is already proven');
const historicalSupportContradictions = [
  'Price is not sitting near a support area right now.',
  'Price is away from the 20-day average.',
  'Watch for price to move back into the 20-day average before the setup becomes relevant.',
  'No support test occurred.'
];
for(const sentence of historicalSupportContradictions){
  const response = {chartStory:'Buyers responded from the 20-day average, but follow-through has stalled.', whyItMatters:'The rebound did not progress.', setupLocation:sentence, learningPoint:'A stalled rebound needs renewed participation.', whatNext:'Watch for buyers to follow through with another firm close.'};
  assert.strictEqual(hooks.validateNarrationProseAgainstContract(response, amznStyleContract).ok, false, `historical 20MA support contradiction must fail: ${sentence}`);
}
const genuinelyUnknownContract = hooks.buildCanonicalNarrationContract({}, {structure:'unknown', verdict:'watch'});
assert.strictEqual(genuinelyUnknownContract.phase, 'unknown', 'incomplete evidence may remain unknown when no recognised chronology exists');
assert.strictEqual(genuinelyUnknownContract.nextRequiredEvent, 'unknown', 'a genuinely unknown contract must retain an explicit unknown next event');
assert.strictEqual(hooks.validateCanonicalNarrationContract(genuinelyUnknownContract).ok, true, 'a genuinely unknown contract must remain renderable');
const stalledAfterConfirmedControl = {...stalled, buyerResponse:'confirmed', buyerControl:'confirmed', followThrough:'stalled'};
assert.strictEqual(hooks.validateCanonicalNarrationContract(stalledAfterConfirmedControl).ok, true, 'confirmed initial buyer control must be valid when follow-through later stalls');
assert.ok(
  hooks.validateCanonicalNarrationContract({...stalledAfterConfirmedControl, followThrough:'confirmed'}).errors.includes('stalled_follow_through_confirmed_conflict'),
  'stalled phase must reject confirmed follow-through rather than historical confirmed control'
);
const stalledControlProse = {
  chartStory:'Buyers initially responded at support and took control, but the rebound has since stalled.',
  whyItMatters:'The first response was constructive, but stalled follow-through means the setup has not progressed.',
  setupLocation:'Price is holding around the 50-day average.',
  learningPoint:'Initial buyer control needs continuation to become actionable.',
  whatNext:'Watch for buyers to follow through with another firm close.'
};
assert.strictEqual(hooks.validateNarrationProseAgainstContract(stalledControlProse, stalledAfterConfirmedControl).ok, true, 'AI narration may preserve confirmed historical control while identifying stalled follow-through');
const stalledContradictoryProse = {...stalledControlProse, chartStory:'Buyers took control and follow-through is confirmed.'};
assert.ok(
  hooks.validateNarrationProseAgainstContract(stalledContradictoryProse, stalledAfterConfirmedControl).errors.includes('stalled_follow_through_described_as_confirmed'),
  'stalled prose must reject a claim that follow-through is confirmed'
);
const invalidRendererOutput = {
  chartStory:'Price is away from support after a strong extension.', whyItMatters:'It matters.', setupLocation:'Away from support.',
  learningPoint:'A lesson.', whatNext:'Watch for a new pullback reset.'
};
const rendererErrors = hooks.validateNarrationProseAgainstContract(invalidRendererOutput, stalled).errors;
assert.ok(rendererErrors.includes('unsupported_away_from_active_support'), 'stalled response must reject away/extension wording');
assert.ok(rendererErrors.includes('stalled_response_reset_instruction'), 'stalled response must reject reset instructions');

const kdpContradictions = [
  'Price is away from the 50-day average.', 'Price is not sitting near a support area.', 'Price is currently off support.',
  'Wait for price to return to the 50-day average.', 'The chart needs a fresh pullback into the 50-day average.',
  'There is no active support test right now.', 'The setup is extended from its support area.'
];
for(const sentence of kdpContradictions){
  const response = {chartStory:'The response from support has stalled.', whyItMatters:'Buyers still need proof.', setupLocation:sentence, learningPoint:'An early response needs follow-through.', whatNext:'Watch for buyers to follow through.'};
  assert.strictEqual(hooks.validateNarrationProseAgainstContract(response, stalled).ok, false, `KDP contradiction must fail: ${sentence}`);
}
for(const phase of ['at_support','responding_from_support','stalled_after_response']){
  const activePhaseContract = {...stalled, phase, support:{...stalled.support}};
  const response = {chartStory:phase === 'at_support' ? 'Price is testing support.' : (phase === 'responding_from_support' ? 'Price is responding from support.' : 'The response from support has stalled.'), whyItMatters:'The location needs proof.', setupLocation:'Price is not sitting near a support area.', learningPoint:'Support needs confirmation.', whatNext:phase === 'at_support' ? 'Watch for support to hold.' : 'Watch for buyers to follow through.'};
  assert.ok(hooks.validateNarrationProseAgainstContract(response, activePhaseContract).errors.includes('unsupported_not_near_active_support'), `${phase}: active support contradiction must never be permissive`);
}
for(const futureAlias of ['near_support','support_holding','support_reacting']){
  const futurePhaseContract = {...stalled, phase:futureAlias};
  assert.ok(hooks.validateCanonicalNarrationContract(futurePhaseContract).errors.includes('phase_unknown'), `${futureAlias}: a new phase must fail closed until explicitly modelled`);
}
for(const sentence of [
  'Price is holding around the 50-day average, but the rebound has stalled.',
  'Buyers responded at the 50-day average, but they have not yet produced convincing follow-through.',
  'Support is still active, although buyer control remains incomplete.',
  'Price is below the 20-day average while still testing the 50-day average.'
]){
  const response = {chartStory:'The response from support has stalled.', whyItMatters:'Buyers still need proof.', setupLocation:sentence, learningPoint:'An early response needs follow-through.', whatNext:'Watch for buyers to follow through.'};
  assert.strictEqual(hooks.validateNarrationProseAgainstContract(response, stalled).ok, true, `KDP faithful wording must pass: ${sentence}`);
}
for(const sentence of ['Price is off the 50-day average.', 'Price is off the 50MA.', 'Price is extended from the 50-day average.', 'Price is detached from the 50MA.', 'Price has moved clear of the 50-day average.']){
  const response = {chartStory:'The response from support has stalled.', whyItMatters:'Buyers still need proof.', setupLocation:sentence, learningPoint:'An early response needs follow-through.', whatNext:'Watch for buyers to follow through.'};
  assert.strictEqual(hooks.validateNarrationProseAgainstContract(response, stalled).ok, false, `active 50MA named contradiction must fail: ${sentence}`);
}
for(const sentence of ['Price is below the 20-day average while testing the 50-day average.', 'Price has moved away from the 20-day average but remains around the 50-day average.', 'Price is holding near the 50-day average despite remaining below the 20-day average.']){
  const response = {chartStory:'The response from support has stalled.', whyItMatters:'Buyers still need proof.', setupLocation:sentence, learningPoint:'An early response needs follow-through.', whatNext:'Watch for buyers to follow through.'};
  assert.strictEqual(hooks.validateNarrationProseAgainstContract(response, stalled).ok, true, `unrelated 20MA wording must remain valid for active 50MA: ${sentence}`);
}

const amat = {...stalled, phase:'responding_from_support', support:{type:'20ma', label:'20-day average', interaction:'testing', currentlyActive:true, semantic:'active_testing_support'}, followThrough:'unconfirmed'};
for(const sentence of ['Price is away from the 20-day average.', 'Price is not near support.', 'Buyers have not responded.', 'Wait for a pullback to the 20-day average.']){
  const response = {chartStory:'Price is responding from support.', whyItMatters:'The response needs proof.', setupLocation:sentence, learningPoint:'Early responses need confirmation.', whatNext:'Watch for buyers to follow through.'};
  assert.strictEqual(hooks.validateNarrationProseAgainstContract(response, amat).ok, false, `AMAT contradiction must fail: ${sentence}`);
}
for(const sentence of ['Price is reacting around the 20-day average, but buyers still need to confirm control.', 'The first buyer response is visible, although follow-through is not confirmed.']){
  const response = {chartStory:'Price is responding from support.', whyItMatters:'The response needs proof.', setupLocation:sentence, learningPoint:'Early responses need confirmation.', whatNext:'Watch for buyers to follow through.'};
  assert.strictEqual(hooks.validateNarrationProseAgainstContract(response, amat).ok, true, `AMAT faithful wording must pass: ${sentence}`);
}
for(const sentence of ['Price is off the 20-day average.', 'Price is off the 20MA.', 'Price is extended from the 20-day average.', 'Price is stretched away from the 20MA.', 'Price is no longer near the 20-day average.']){
  const response = {chartStory:'Price is responding from support.', whyItMatters:'The response needs proof.', setupLocation:sentence, learningPoint:'Early responses need confirmation.', whatNext:'Watch for buyers to follow through.'};
  assert.strictEqual(hooks.validateNarrationProseAgainstContract(response, amat).ok, false, `active 20MA named contradiction must fail: ${sentence}`);
}
for(const sentence of ['Price is above the 50-day average while testing the 20-day average.', 'Price remains well above the 50-day average and is reacting around the 20-day average.']){
  const response = {chartStory:'Price is responding from support.', whyItMatters:'The response needs proof.', setupLocation:sentence, learningPoint:'Early responses need confirmation.', whatNext:'Watch for buyers to follow through.'};
  assert.strictEqual(hooks.validateNarrationProseAgainstContract(response, amat).ok, true, `unrelated 50MA wording must remain valid for active 20MA: ${sentence}`);
}

for(const phase of ['away_from_support','extended_from_support']){
  const contract = {...stalled, phase, support:{type:'50ma', label:'50-day average', interaction:'not_tested', currentlyActive:false, semantic:'off_support'}, nextRequiredEvent:phase === 'away_from_support' ? 'clearer_support' : 'pullback_or_reset'};
  const response = {chartStory:phase === 'away_from_support' ? 'Price is away from support.' : 'Price is extended from support.', whyItMatters:'Location needs to improve.', setupLocation:'Price is not at an active support test.', learningPoint:'Location matters.', whatNext:phase === 'away_from_support' ? 'Watch for a clearer support area.' : 'Watch for a calmer pullback or reset.'};
  assert.strictEqual(hooks.validateNarrationProseAgainstContract(response, contract).ok, true, `${phase} must allow legitimate away language`);
}

(async () => {
  const valid = {chartStory:'The response from support has stalled.', whyItMatters:'Buyers still need proof.', setupLocation:'Price is holding around the 50-day average.', learningPoint:'An early response needs follow-through.', whatNext:'Watch for buyers to follow through.'};
  let requests = 0;
  const retried = await hooks.renderCanonicalNarrationWithRetry(stalled, async () => (++requests === 1 ? invalidRendererOutput : valid));
  assert.strictEqual(requests, 2, 'a contradictory first renderer response must trigger exactly one retry');
  assert.strictEqual(retried.source, 'retry', 'the valid retry must be used');
  assert.strictEqual(retried.retryCount, 1, 'a valid retry must report one retry');
  assert.ok(retried.errors.some(code => code.startsWith('first:unsupported_away_from_active_support')), 'first-response contradiction diagnostics must be retained');
  requests = 0;
  const namedOff = {...valid, setupLocation:'Price is off the 50-day average.'};
  const namedRetry = await hooks.renderCanonicalNarrationWithRetry(stalled, async () => (++requests === 1 ? namedOff : valid));
  assert.strictEqual(requests, 2, 'named active-support contradiction must trigger exactly one retry');
  assert.strictEqual(namedRetry.source, 'retry', 'a valid retry must replace named off-support prose');
  assert.ok(namedRetry.errors.includes('first:unsupported_away_from_active_support'), 'named off-support wording must retain the active-support diagnostic');
  requests = 0;
  const fallback = await hooks.renderCanonicalNarrationWithRetry(stalled, async () => { requests += 1; return invalidRendererOutput; });
  assert.strictEqual(requests, 2, 'two contradictory responses must make exactly two renderer calls');
  assert.strictEqual(fallback.source, 'deterministic_fallback', 'an invalid retry must use deterministic fallback');
  assert.strictEqual(fallback.retryCount, 1, 'a fallback after an invalid retry must report one retry');
  const missingNextEvent = {...valid, whatNext:'Watch the next candle for a better signal.'};
  assert.ok(hooks.validateNarrationProseAgainstContract(missingNextEvent, stalled).errors.includes('next_required_event_missing'), 'renderer prose must preserve the contract nextRequiredEvent in whatNext');
  assert.strictEqual(hooks.narrationDebugSource('openai'), 'canonical_llm', 'debug metadata must label canonical LLM prose consistently');
  assert.strictEqual(hooks.narrationDebugValidationStatus('recovered'), 'passed', 'a valid retry must report final validation as passed');
  assert.strictEqual(hooks.narrationDebugValidationStatus('invalid_contract'), 'failed', 'an invalid contract must report validation failure');
  console.log('run-chart-guru-narration-contract-assertions: ok');
})().catch(error => { console.error(error); process.exitCode = 1; });

const impossible = hooks.buildCanonicalNarrationContract({currentPhase:'support_failed', supportState:{interaction:'held'}, buyerControlState:'confirmed', confirmationSemantic:'follow_through_confirmed'}, {structure:'broken', nextRequiredEvent:'repair'});
assert.ok(hooks.validateCanonicalNarrationContract(impossible).errors.length > 0, 'impossible canonical states must be rejected before rendering');

const incompatibleVersion = {...stalled, version:'chart-guru-narration-contract-v999'};
assert.ok(hooks.validateCanonicalNarrationContract(incompatibleVersion).errors.includes('unsupported_contract_version'), 'unsupported contract versions must fail validation rather than render silently');
