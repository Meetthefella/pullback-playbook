const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const context = {window:{}, console};
vm.createContext(context);
vm.runInContext(fs.readFileSync('js/domain/canonical-setup-projection.js', 'utf8'), context, {filename:'canonical-setup-projection.js'});
vm.runInContext(fs.readFileSync('js/scanner-card-shell.js', 'utf8'), context, {filename:'scanner-card-shell.js'});
const {project} = context.window.CanonicalSetupProjection;
const {classNameWithProjectedTone} = context.window.ScannerCardShell;
const appSource = fs.readFileSync('app.js', 'utf8');
const setupScoreSource = appSource.slice(appSource.indexOf('function setupScoreForRecord('), appSource.indexOf('\nfunction setupScoreDisplayForRecord('));
assert(!setupScoreSource.includes('resolveGlobalVerdict'), 'setupScoreForRecord must stay O(1) and must not resolve the canonical pipeline during scanner ranking.');

function publication(overrides = {}){
  const base = {publicationStatus:'valid', canonicalResult:{
    verdict:{value:'watch'}, eligibility:{entry:{qualified:false}, nearEntry:{qualified:false}},
    semantics:{structure:{state:'intact', eligibility:'alive'}, support:{context:'near_20ma', testState:'testing'}, buyer:{control:'pending', response:'pending', followThrough:'pending'}, market:{state:'supportive', volume:'normal'}},
    plan:{state:'valid', rewardRisk:{passes:true}}
  }};
  const source = overrides.canonicalResult || {};
  return {...base, ...overrides, canonicalResult:{...base.canonicalResult, ...source,
    verdict:{...base.canonicalResult.verdict, ...(source.verdict || {})},
    eligibility:{...base.canonicalResult.eligibility, ...(source.eligibility || {})},
    semantics:{...base.canonicalResult.semantics, ...(source.semantics || {})},
    plan:{...base.canonicalResult.plan, ...(source.plan || {})}
  }};
}

let result = project(publication(), {baseScore:10});
assert.notStrictEqual(result.bucket, 'entry');
assert.strictEqual(result.bucket, 'watch');
assert.strictEqual(result.tone, 'watch');
assert(result.setupScore >= 3 && result.setupScore <= 5);

result = project(publication({canonicalResult:{semantics:{structure:{state:'intact', eligibility:'alive'}, support:{context:'away', testState:'away'}, buyer:{control:'pending', response:'pending', followThrough:'pending'}, market:{state:'supportive', volume:'normal'}}}}), {baseScore:4});
assert.strictEqual(result.bucket, 'watch');
assert(result.setupScore >= 3 && result.setupScore <= 5);

result = project(publication({canonicalResult:{verdict:{value:'avoid'}, semantics:{structure:{state:'broken', eligibility:'broken'}, support:{context:'near_20ma', testState:'failed'}, buyer:{control:'failed', response:'failed', followThrough:'failed'}, market:{state:'supportive', volume:'normal'}}}}), {baseScore:8});
assert.strictEqual(result.bucket, 'avoid');
assert.strictEqual(result.tone, 'avoid');
assert(result.setupScore <= 2);

result = project(publication({canonicalResult:{verdict:{value:'near_entry'}, eligibility:{entry:{qualified:false}, nearEntry:{qualified:true}}, semantics:{structure:{state:'intact', eligibility:'alive'}, support:{context:'near_20ma', testState:'testing'}, buyer:{control:'constructive', response:'constructive', followThrough:'pending'}, market:{state:'supportive', volume:'normal'}}}}), {baseScore:4});
assert.strictEqual(result.bucket, 'near_entry');
assert.strictEqual(result.tone, 'near_entry');
assert(result.setupScore >= 6 && result.setupScore <= 9);

result = project(publication({canonicalResult:{verdict:{value:'entry'}, eligibility:{entry:{qualified:true}, nearEntry:{qualified:true}}, gates:{entry:true, buyerControl:true, confirmation:true}, semantics:{structure:{state:'intact', eligibility:'alive'}, support:{context:'near_20ma', testState:'testing'}, buyer:{control:'confirmed', response:'confirmed', followThrough:'confirmed'}, market:{state:'supportive', volume:'normal'}}}}), {baseScore:10});
assert.strictEqual(result.bucket, 'entry');
assert.strictEqual(result.tone, 'entry');
assert.strictEqual(result.setupScore, 10);

result = project(publication({canonicalResult:{verdict:{value:'watch'}, eligibility:{entry:{qualified:false}, nearEntry:{qualified:false}}}}), {baseScore:10});
assert.strictEqual(result.bucket, 'watch');
assert.notStrictEqual(result.bucket, 'entry');

const persisted = JSON.parse(JSON.stringify(publication({canonicalResult:{verdict:{value:'near_entry'}, eligibility:{entry:{qualified:false}, nearEntry:{qualified:true}}}})));
const scan = project(persisted, {baseScore:8});
const track = project(JSON.parse(JSON.stringify(persisted)), {baseScore:8});
assert.deepStrictEqual({bucket:scan.bucket, score:scan.setupScore}, {bucket:track.bucket, score:track.setupScore});
assert.strictEqual(scan.legacyFallbackUsed, false);

result = project({publicationStatus:'validation_failed', safeFallback:{verdict:'watch'}}, {baseScore:10});
assert.strictEqual(result.scoreAvailable, false);
assert.strictEqual(result.setupScore, null);

const baseClasses = 'result-card visual-state-card visual-tone-monitor visual-state-monitor card--monitor unrelated-class';
[
  {tone:'watch', status:'watch', accent:'card--watch'},
  {tone:'near_entry', status:'near_entry', accent:'card--near-entry'},
  {tone:'entry', status:'entry', accent:'card--entry'},
  {tone:'avoid', status:'avoid', accent:'card--avoid'}
].forEach(({tone, status, accent}) => {
  const diagnostics = {};
  const projectedClasses = classNameWithProjectedTone(baseClasses, {tone, resolvedStatus:status}, diagnostics);
  assert(projectedClasses.includes('result-card') && projectedClasses.includes('visual-state-card') && projectedClasses.includes('unrelated-class'));
  assert(projectedClasses.includes(`visual-tone-${tone}`) && projectedClasses.includes(`visual-state-${status}`) && projectedClasses.includes(accent));
  assert(!projectedClasses.includes('card--monitor'));
  assert.strictEqual(diagnostics.previousAccentClass, 'card--monitor');
  assert.strictEqual(diagnostics.projectedAccentClass, accent);
  assert.strictEqual(diagnostics.finalClassName, projectedClasses);
  assert.strictEqual(classNameWithProjectedTone(projectedClasses, {tone, resolvedStatus:status}), projectedClasses);
});
console.log('Canonical setup projection assertions passed.');
