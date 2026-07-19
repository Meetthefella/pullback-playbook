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
  assert.deepStrictEqual(Object.keys(rendererInput).sort(), ['version','phase','dominantEvent','eventSequence','structure','support','buyerControl','followThrough','trend','volume','market','dominantBlocker','nextRequiredEvent','verdict','evidenceFactIds'].sort(), 'renderer prompt must use an exact contract-field allow-list');
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
const invalidRendererOutput = {
  chartStory:'Price is away from support after a strong extension.', whyItMatters:'It matters.', setupLocation:'Away from support.',
  learningPoint:'A lesson.', whatNext:'Watch for a new pullback reset.'
};
const rendererErrors = hooks.validateNarrationProseAgainstContract(invalidRendererOutput, stalled).errors;
assert.ok(rendererErrors.includes('unsupported_away_or_extension_language'), 'stalled response must reject away/extension wording');
assert.ok(rendererErrors.includes('stalled_response_reset_instruction'), 'stalled response must reject reset instructions');

const impossible = hooks.buildCanonicalNarrationContract({currentPhase:'support_failed', supportState:{interaction:'held'}, buyerControlState:'confirmed', confirmationSemantic:'follow_through_confirmed'}, {structure:'broken', nextRequiredEvent:'repair'});
assert.ok(hooks.validateCanonicalNarrationContract(impossible).errors.length > 0, 'impossible canonical states must be rejected before rendering');

const incompatibleVersion = {...stalled, version:'chart-guru-narration-contract-v999'};
assert.ok(hooks.validateCanonicalNarrationContract(incompatibleVersion).errors.includes('unsupported_contract_version'), 'unsupported contract versions must fail validation rather than render silently');

console.log('run-chart-guru-narration-contract-assertions: ok');
