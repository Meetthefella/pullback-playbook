const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const hooks = require('../netlify/functions/analyse-setup').__test;

const rendererFields = ['version','phase','dominantEvent','eventSequence','structure','support','buyerControl','followThrough','trend','volume','market','dominantBlocker','nextRequiredEvent','verdict','evidenceFactIds'].sort();

function clientContractBuilder(){
  const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const start = source.indexOf('function buildCanonicalNarrationContract(');
  const open = source.indexOf('){', start) + 1;
  if(open < 1) throw new Error('Could not find client narration contract body.');
  let depth = 0;
  for(let index = open; index < source.length; index += 1){
    if(source[index] === '{') depth += 1;
    if(source[index] === '}' && --depth === 0){
      const sandbox = {};
      vm.runInNewContext(source.slice(start, index + 1), sandbox);
      return sandbox.buildCanonicalNarrationContract;
    }
  }
  throw new Error('Could not load client narration contract builder.');
}

function buildHealthyContract(){
  return hooks.buildCanonicalNarrationContract({
    currentPhase:'responding_from_support', dominantEventLabel:'Early response from support',
    eventSequence:['support_test','buyers_responded'], evidenceFactIds:['support_test'],
    supportState:{interaction:'testing',label:'20-day average'}, buyerControlState:'emerging', confirmationSemantic:'follow_through_unconfirmed'
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
  const instructions = hooks.buildProductionChartGuruFinalInstructions();
  assert.ok(instructions.includes('contract is the sole authority'), 'renderer instructions must retain contract authority rules');
  assert.ok(instructions.includes('Do not issue buy/sell advice'), 'renderer instructions must retain observation-only guard');
}

function verifyClientDerivedStateMapping(){
  const buildClientContract = clientContractBuilder();
  const contract = buildClientContract({
    currentPhase:'responding_from_support', dominantEventLabel:'Early response', eventSequence:['support_test'],
    evidenceFactIds:['support'], supportState:{interaction:'testing'}, buyerControlState:'emerging', confirmationSemantic:'follow_through_unconfirmed'
  }, {structureState:'developing_clean', trendState:'strong', volumeState:'expanding', marketStatus:'S&P above 50 MA'});
  assert.deepStrictEqual(JSON.parse(JSON.stringify({structure:contract.structure, trend:contract.trend, volume:contract.volume})), {structure:'intact', trend:'healthy', volume:'constructive'}, 'client contract must preserve realistic deriveSetupStates semantics instead of degrading them to unknown');
}

function verifyRetryFallbackContract(){
  const contract = buildHealthyContract();
  const invalid = {chartStory:'Price is away from support after extension.', whyItMatters:'It matters.', setupLocation:'Away from support.', learningPoint:'A lesson.', whatNext:'Watch for a reset.'};
  const rejected = hooks.validateNarrationProseAgainstContract(invalid, contract);
  assert.strictEqual(rejected.ok, false, 'invalid renderer output must be rejected before retry');
  const fallback = hooks.deterministicNarrationFallback(contract);
  assert.strictEqual(hooks.validateNarrationProseAgainstContract(fallback, contract).ok, true, 'rejected renderer output must have a faithful deterministic fallback path');
}

verifyRendererBoundary();
verifyClientDerivedStateMapping();
verifyRetryFallbackContract();
console.log('run-chart-guru-ai-contract-assertions: ok');
