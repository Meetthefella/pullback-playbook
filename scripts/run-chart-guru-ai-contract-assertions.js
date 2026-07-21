const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const hooks = require('../netlify/functions/analyse-setup').__test;

const rendererFields = ['version','phase','dominantEvent','eventSequence','structure','support','buyerResponse','buyerControl','followThrough','trend','volume','market','dominantBlocker','nextRequiredEvent','verdict','evidenceFactIds'].sort();

function sourceFunction(source, name){
  const start = source.indexOf(`function ${name}(`);
  const open = source.indexOf('){', start) + 1;
  if(open < 1) throw new Error(`Could not find ${name}.`);
  let depth = 0;
  for(let index = open; index < source.length; index += 1){
    if(source[index] === '{') depth += 1;
    if(source[index] === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not load ${name}.`);
}

function clientContractHelpers(){
  const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const sandbox = {};
  vm.runInNewContext([
    sourceFunction(source, 'buildCanonicalNarrationContract'),
    sourceFunction(source, 'canonicalNarrationEarlyReboundEventKey'),
    sourceFunction(source, 'repairCanonicalNarrationContractPhase')
  ].join('\n'), sandbox);
  return sandbox;
}

function buildHealthyContract(){
  return hooks.buildCanonicalNarrationContract({
    currentPhase:'responding_from_support', dominantEventLabel:'Early response from support',
    eventSequence:['support_test','buyers_responded'], evidenceFactIds:['support_test'],
    supportState:{type:'20ma', interaction:'testing', label:'20-day average', currentlyActive:true, semantic:'active_testing_support'}, buyerControlState:'emerging', confirmationSemantic:'follow_through_unconfirmed'
  }, {structureState:'strong', trendState:'acceptable', volumeState:'expanding', market:'supportive', verdict:'watch', nextRequiredEvent:'follow_through'});
}

function verifyRendererBoundary(){
  const contract = buildHealthyContract();
  assert.deepStrictEqual({structure:contract.structure, trend:contract.trend, volume:contract.volume}, {structure:'intact', trend:'healthy', volume:'constructive'}, 'realistic derived states must be deliberately mapped into narration enums');
  const contaminated = {...contract, verification:{status:'mismatch'}, imageAnalysis:{ticker:'WRONG'}, traderInterpretation:{text:'legacy'}, diagnostics:{debug:true}};
  const prompt = hooks.buildProductionChartGuruFinalPrompt(contaminated);
  const promptContract = JSON.parse(prompt.slice(prompt.indexOf('{')));
  assert.deepStrictEqual(Object.keys(promptContract).sort(), rendererFields, 'renderer prompt must contain only the canonical narration allow-list');
  assert.ok(prompt.includes(contract.version), 'renderer prompt must include the contract version');
  assert.ok(!/verification|imageAnalysis|traderInterpretation|diagnostics/i.test(prompt), 'legacy interpretation, image, verification, and diagnostic inputs must be absent from renderer prompt');
  assert.deepStrictEqual(promptContract.support, contract.support, 'the supplied canonical support authority must reach the renderer unchanged');
  const instructions = hooks.buildProductionChartGuruFinalInstructions();
  assert.ok(instructions.includes('contract is the sole authority'), 'renderer instructions must retain contract authority rules');
  assert.ok(instructions.includes('Do not issue buy/sell advice'), 'renderer instructions must retain observation-only guard');
}

function verifyClientDerivedStateMapping(){
  const {buildCanonicalNarrationContract:buildClientContract, repairCanonicalNarrationContractPhase} = clientContractHelpers();
  const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.ok(source.includes('const canonicalNarrationContract = repairCanonicalNarrationContractPhase('), 'analysis normalization must route persisted contracts through the canonical phase repair');
  const contract = buildClientContract({
    currentPhase:'responding_from_support', dominantEventLabel:'Early response', eventSequence:['support_test'],
    evidenceFactIds:['support'], supportState:{type:'50ma', label:'50-day average', interaction:'held', currentlyActive:true, semantic:'active_held_support'}, buyerControlState:'emerging', confirmationSemantic:'follow_through_unconfirmed'
  }, {structureState:'developing_clean', trendState:'strong', volumeState:'expanding', marketStatus:'S&P above 50 MA'});
  assert.deepStrictEqual(JSON.parse(JSON.stringify({structure:contract.structure, trend:contract.trend, volume:contract.volume})), {structure:'intact', trend:'healthy', volume:'constructive'}, 'client contract must preserve realistic deriveSetupStates semantics instead of degrading them to unknown');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(contract.support)), {type:'50ma', label:'50-day average', interaction:'held', currentlyActive:true, semantic:'active_held_support'}, 'client contract must retain complete active support authority');
  const repaired = repairCanonicalNarrationContractPhase({
    ...contract,
    phase:'unknown',
    dominantEvent:'Early rebound from 20MA',
    nextRequiredEvent:'unknown',
    buyerResponse:'unknown', buyerControl:'unknown', followThrough:'unknown'
  }, {});
  assert.strictEqual(repaired.phase, 'responding_from_support', 'client rehydration must repair an unknown persisted contract before it reaches diagnostics');
  assert.strictEqual(repaired.nextRequiredEvent, 'follow_through', 'client rehydration must derive the repaired contract next event');
}

function verifyRetryFallbackContract(){
  const contract = buildHealthyContract();
  const invalid = {chartStory:'Price is away from support after extension.', whyItMatters:'It matters.', setupLocation:'Away from support.', learningPoint:'A lesson.', whatNext:'Watch for a reset.'};
  const rejected = hooks.validateNarrationProseAgainstContract(invalid, contract);
  assert.strictEqual(rejected.ok, false, 'invalid renderer output must be rejected before retry');
  const fallback = hooks.deterministicNarrationFallback(contract);
  assert.strictEqual(hooks.validateNarrationProseAgainstContract(fallback, contract).ok, true, 'rejected renderer output must have a faithful deterministic fallback path');
}

function verifyServerPreservesSuppliedContract(){
  const contract = buildHealthyContract();
  const selected = hooks.selectCanonicalNarrationContractForRenderer(contract, {currentPhase:'away_from_support'});
  assert.strictEqual(selected, contract, 'the server renderer boundary must retain the exact supplied contract object');
  assert.deepStrictEqual(selected.support, contract.support, 'the server must not normalize or downgrade supplied support authority');
}

verifyRendererBoundary();
verifyClientDerivedStateMapping();
verifyRetryFallbackContract();
verifyServerPreservesSuppliedContract();
console.log('run-chart-guru-ai-contract-assertions: ok');
