const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/resolver-core.js'), 'utf8');
const selectorStart = source.indexOf('function selectCanonicalDecision(');
const selectorEnd = source.indexOf('\n  function shouldPreserveScanAuthorityCanonicalPath', selectorStart);
const resolverStart = source.indexOf('function resolveGlobalVerdict(');
const resolverEnd = source.indexOf('\n  function resolveScanWorkflow', resolverStart);
const selectorBlock = source.slice(selectorStart, selectorEnd);
const resolverBlock = source.slice(resolverStart, resolverEnd);
const rawStart = resolverBlock.indexOf('const rawResult = {');
const rawEnd = resolverBlock.indexOf('const normalizedEvidence = resolutionContext.evidence;', rawStart);
const rawBlock = resolverBlock.slice(rawStart, rawEnd);

assert.ok(selectorStart >= 0 && selectorEnd > selectorStart, 'the sole canonical selector must remain present');
assert.ok(/decisionTrace:frozenTrace/.test(selectorBlock), 'the selector must publish the canonical decision trace');
assert.ok(!/legacyDecisionTrace|legacyDecisionSelection|shadowDecisionParity|__PP_ASSERT_SHADOW_SELECTOR_PARITY__/.test(resolverBlock), 'resolver flow must not execute legacy shadow decision instrumentation');
assert.ok(!/appendLegacyDecisionTrace/.test(source), 'legacy decision-trace writer must be retired');
assert.ok(!/shadowDecisionTrace/.test(source), 'shadow-named authoritative trace fields must be retired');
assert.ok(/const canonicalDecisionSelection = selectCanonicalDecision\(resolutionContext, canonicalEvaluation\);/.test(resolverBlock), 'resolver must obtain its decision from the selector');
assert.ok(/final_verdict:canonicalDecisionSelection\.verdict,/.test(rawBlock), 'candidate verdict must copy selector output');
assert.ok(/allow_plan:canonicalDecisionSelection\.actionability,/.test(rawBlock), 'candidate actionability must copy selector output');
assert.ok(/canonical_decision_trace:canonicalDecisionSelection\.decisionTrace,/.test(rawBlock), 'candidate trace must copy the canonical selector trace');
assert.ok(/selector_diagnostics:freezeResolutionValue\(\{[\s\S]*?selectorAuthority:true,[\s\S]*?candidateParity:true/.test(rawBlock), 'compact selector diagnostics must remain without a second engine');
assert.ok(!/rawResult\.(?:final_verdict|allow_plan|main_blocker|primary_blocker_source)\s*=/.test(rawBlock), 'post-selector code must not mutate decision fields');
assert.ok(!/canonicalDecisionSelection\.(?:verdict|actionability|eligibility|decisiveBlocker)\s*=/.test(resolverBlock), 'selector result must remain immutable in resolver orchestration');

console.log('Resolver legacy-retirement assertions passed (one selector, canonical trace, compact diagnostics, and no executable legacy chain).');
