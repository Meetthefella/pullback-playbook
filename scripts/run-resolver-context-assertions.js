const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const sandbox = {window:{}, console};
sandbox.globalThis = sandbox.window;
vm.runInNewContext(fs.readFileSync(path.join(root, 'js/resolver-core.js'), 'utf8'), sandbox, {filename:'resolver-core.js'});

const evidence = {
  schemaVersion:'normalised-decision-evidence-v1',
  snapshotId:'context-fixture-evidence',
  source:'canonical-resolver-input',
  values:{price:{state:'present', value:100}, stop:{state:'unknown', value:null}},
  provenance:{selectedAuthority:'canonical_plan', conflicts:[]}
};
const before = JSON.stringify(evidence);
const api = sandbox.window.ResolverCore;
const first = api.buildCanonicalResolutionContext(evidence, {resolverSource:'resolver-core', policy:{minimumEntryRr:2}});
const second = api.buildCanonicalResolutionContext(evidence, {resolverSource:'resolver-core', policy:{minimumEntryRr:2}});

assert.strictEqual(JSON.stringify(evidence), before, 'context construction must not mutate normalised evidence');
assert.deepStrictEqual(JSON.parse(JSON.stringify(first)), JSON.parse(JSON.stringify(second)), 'context must be deterministic for identical inputs');
assert.strictEqual(first.evidenceId, 'context-fixture-evidence');
assert.strictEqual(first.resolverSnapshotId, 'context-fixture-evidence:resolver-core');
assert.strictEqual(first.surface, 'resolver-core');
assert.ok(Object.isFrozen(first) && Object.isFrozen(first.evidence) && Object.isFrozen(first.policy), 'context must be deeply immutable');
assert.strictEqual(first.evidence.values.stop.state, 'unknown', 'unknown evidence must remain distinct from false or absent');
first.evidence.values.price.value = 200;
assert.strictEqual(first.evidence.values.price.value, 100, 'frozen context cannot be changed after construction');
console.log('Resolver context assertions passed (determinism, immutability, identity, and unknown preservation).');
