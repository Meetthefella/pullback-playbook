(function(global){
  const NORM_VERSION = 'canonical-norm-v1';
  const RESULT_VERSION = 'canonical-decision-result-v1';

  function key(value, fallback = ''){
    const normalized = String(value == null ? '' : value).trim().toLowerCase().replace(/[\s-]+/g, '_');
    return normalized || fallback;
  }

  function clone(value){
    if(value == null || typeof value !== 'object') return value;
    if(Array.isArray(value)) return value.map(clone);
    return Object.keys(value).reduce((result, name) => {
      result[name] = clone(value[name]);
      return result;
    }, {});
  }

  function deepFreeze(value){
    if(!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(name => deepFreeze(value[name]));
    return Object.freeze(value);
  }

  function violation(code, category, level, fields, message){
    return Object.freeze({code, category, level, fields:Object.freeze(fields.slice()), message});
  }

  function eligibilityFor(candidate){
    const entryGate = candidate.entry_gate_pass === true;
    const nearEntryGate = candidate.near_entry_gate_pass === true;
    const buyerControl = candidate.buyer_control_gate_pass === true;
    const confirmation = candidate.confirmation_gate_pass === true;
    const priceability = key(candidate.priceability_state, 'unknown');
    const planValid = !['unpriceable', 'invalid', 'missing'].includes(priceability)
      && candidate.hasPriceablePlan !== false;
    const verdict = key(candidate.final_verdict, 'watch');
    const contractNearEntry = key(candidate.resolved && candidate.resolved.structuralState) === 'near_entry'
      || key(candidate.resolved && candidate.resolved.tradeabilityVerdict) === 'near_entry';
    const nearEntryQualified = planValid && (nearEntryGate || contractNearEntry);
    return Object.freeze({
      entry:Object.freeze({
        state:verdict === 'entry' ? 'qualified' : (entryGate ? 'qualified' : 'blocked'),
        qualified:entryGate && buyerControl && confirmation && planValid,
        mandatoryGates:Object.freeze({entry:entryGate, buyerControl, confirmation, plan:planValid})
      }),
      nearEntry:Object.freeze({
        state:verdict === 'entry' ? 'superseded_by_entry' : (nearEntryQualified ? 'qualified' : 'blocked'),
        qualified:nearEntryQualified,
        mandatoryGates:Object.freeze({nearEntry:nearEntryGate, plan:planValid, authoritativeContract:contractNearEntry}),
        qualificationSource:nearEntryGate ? 'near_entry_gate' : (contractNearEntry ? 'authoritative_contract' : 'none')
      })
    });
  }

  function validateCanonicalNorm(result){
    const candidate = result && typeof result === 'object' ? result : {};
    const violations = [];
    const eligibility = candidate.eligibility || {};
    const entry = eligibility.entry || {};
    const nearEntry = eligibility.nearEntry || {};
    const gates = candidate.gates || {};
    const verdict = key(candidate.verdict && candidate.verdict.value, 'watch');
    const semantics = candidate.semantics || {};
    const priceability = key(semantics.planState && semantics.planState.priceability, 'unknown');
    const terminal = key(semantics.structure && semantics.structure.eligibility) === 'broken'
      || key(semantics.support && semantics.support.testState) === 'failed';

    if(verdict === 'entry' && entry.qualified !== true){
      violations.push(violation('entry_verdict_without_entry_eligibility', 'decision', 'final_verdict', ['verdict.value', 'eligibility.entry.qualified'], 'Entry verdict requires qualified Entry eligibility.'));
    }
    if(entry.qualified === true && gates.buyerControl !== true){
      violations.push(violation('entry_eligibility_with_failed_buyer_control', 'semantic', 'eligibility', ['eligibility.entry', 'gates.buyerControl'], 'Entry eligibility requires buyer-control gate pass.'));
    }
    if(entry.qualified === true && gates.confirmation !== true){
      violations.push(violation('entry_eligibility_with_failed_confirmation', 'semantic', 'eligibility', ['eligibility.entry', 'gates.confirmation'], 'Entry eligibility requires confirmation gate pass.'));
    }
    if(entry.qualified === true && ['unpriceable', 'invalid', 'missing'].includes(priceability)){
      violations.push(violation('actionable_entry_with_unpriceable_plan', 'decision', 'eligibility', ['eligibility.entry', 'semantics.planState.priceability'], 'Entry eligibility requires a priceable valid plan.'));
    }
    if(verdict === 'near_entry' && nearEntry.qualified !== true){
      violations.push(violation('near_entry_verdict_without_near_entry_eligibility', 'decision', 'final_verdict', ['verdict.value', 'eligibility.nearEntry.qualified'], 'Near Entry verdict requires qualified Near Entry eligibility.'));
    }
    if(['entry', 'near_entry'].includes(verdict) && terminal){
      violations.push(violation('verdict_overrides_hard_blocker', 'decision', 'final_verdict', ['verdict.value', 'semantics.structure.eligibility', 'semantics.support.testState'], 'Actionable verdict cannot override a terminal structure or support failure.'));
    }
    if(candidate.snapshot && candidate.evidence && candidate.snapshot.evidenceId !== candidate.evidence.snapshotId){
      violations.push(violation('mixed_canonical_snapshot', 'semantic', 'evidence', ['snapshot.evidenceId', 'evidence.snapshotId'], 'Result fields must originate from one evidence snapshot.'));
    }
    return Object.freeze({
      status:violations.length ? 'validation_failed' : 'valid',
      normVersion:NORM_VERSION,
      violations:Object.freeze(violations)
    });
  }

  function createCanonicalDecisionResult(candidate, evidence){
    const raw = candidate && typeof candidate === 'object' ? candidate : {};
    const normalizedEvidence = evidence && typeof evidence === 'object' ? evidence : {snapshotId:'unavailable', schemaVersion:'normalised-decision-evidence-v1'};
    const eligibility = eligibilityFor(raw);
    const result = {
      schemaVersion:RESULT_VERSION,
      normVersion:NORM_VERSION,
      snapshot:{id:`${normalizedEvidence.snapshotId || 'unavailable'}:resolver-core`, evidenceId:normalizedEvidence.snapshotId || 'unavailable', resolverSource:'resolver-core'},
      evidence:normalizedEvidence,
      semantics:{
        structure:{state:key(raw.structure_state, 'unknown'), eligibility:key(raw.structure_eligibility, 'unknown')},
        support:{context:key(raw.support_context, 'unknown'), testState:key(raw.support_test_state, 'unknown')},
        pullback:{state:key(raw.canonical_pullback_state || raw.pullback_zone, 'unknown')},
        buyer:{control:key(raw.buyer_control_state, 'unknown'), response:key(raw.bounce_state, 'unknown'), followThrough:key(raw.confirmation_state, 'unknown')},
        market:{state:key(raw.market_regime, 'unknown'), volume:key(raw.volume_state, 'unknown')},
        planState:{priceability:key(raw.priceability_state, 'unknown'), status:key(raw.resolved && raw.resolved.planStatusKey, 'unknown')}
      },
      gates:{entry:raw.entry_gate_pass === true, nearEntry:raw.near_entry_gate_pass === true, buyerControl:raw.buyer_control_gate_pass === true, confirmation:raw.confirmation_gate_pass === true},
      eligibility,
      verdict:{value:key(raw.final_verdict, 'watch'), actionable:key(raw.final_verdict) === 'entry', decisiveBlocker:key(raw.final_verdict) === 'entry' ? '' : String(raw.main_blocker || raw.reason || '').trim()}
    };
    result.validation = validateCanonicalNorm(result);
    return deepFreeze(result);
  }

  function safeFallback(candidate, validation){
    const raw = candidate && typeof candidate === 'object' ? candidate : {};
    const terminal = key(raw.structure_eligibility) === 'broken' || key(raw.support_test_state) === 'failed';
    return deepFreeze({
      verdict:terminal ? 'avoid' : 'watch', actionable:false,
      reasonCode:'canonical_norm_validation_failed',
      publicationStatus:'validation_failed', validation
    });
  }

  function publishCanonicalDecision(candidate, evidence, options = {}){
    const canonicalResult = createCanonicalDecisionResult(candidate, evidence);
    const validation = canonicalResult.validation;
    if(validation.status === 'valid'){
      return deepFreeze({publicationStatus:'valid', canonicalResult, safeFallback:null, invalidCandidate:null, validation});
    }
    if(options.enforce === true){
      const error = new Error(`Canonical Norm violation: ${validation.violations.map(item => item.code).join(', ')}`);
      error.code = 'canonical_norm_validation_failed';
      error.validation = validation;
      error.candidate = canonicalResult;
      throw error;
    }
    return deepFreeze({publicationStatus:'validation_failed', canonicalResult:null, safeFallback:safeFallback(candidate, validation), invalidCandidate:canonicalResult, validation});
  }

  function compatibilityProjection(candidate, publication){
    const raw = clone(candidate || {});
    const envelope = publication || {};
    if(envelope.publicationStatus === 'valid'){
      raw.publicationStatus = 'valid';
      raw.canonicalDecisionResult = envelope.canonicalResult;
      raw.canonicalPublication = envelope;
      return raw;
    }
    const fallback = envelope.safeFallback || {verdict:'watch', actionable:false, reasonCode:'canonical_norm_validation_failed'};
    raw.final_verdict = fallback.verdict;
    raw.canonical_final_verdict = fallback.verdict;
    raw.allow_plan = false;
    raw.allow_watchlist = fallback.verdict !== 'avoid';
    raw.main_blocker = 'Canonical decision validation failed.';
    raw.reason = raw.main_blocker;
    raw.publicationStatus = 'validation_failed';
    raw.canonicalDecisionResult = null;
    raw.canonicalPublication = envelope;
    raw.validationFailureReasonCode = fallback.reasonCode;
    return raw;
  }

  global.CanonicalDecisionResult = {NORM_VERSION, RESULT_VERSION, validateCanonicalNorm, createCanonicalDecisionResult, publishCanonicalDecision, compatibilityProjection};
})(typeof window !== 'undefined' ? window : globalThis);
