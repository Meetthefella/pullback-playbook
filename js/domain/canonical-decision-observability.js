(function(global){
  function key(value, fallback = ''){
    const normalized = String(value == null ? '' : value).trim().toLowerCase().replace(/[\s-]+/g, '_');
    return normalized || fallback;
  }

  function text(value, fallback = ''){
    const normalized = String(value == null ? '' : value).trim();
    return normalized || fallback;
  }

  function firstText(values, fallback = ''){
    for(const value of values || []){
      const candidate = text(value);
      if(candidate) return candidate;
    }
    return fallback;
  }

  function buildDecisionObservabilitySummary(record, canonical = {}, surfaces = {}){
    const item = record && typeof record === 'object' ? record : {};
    const decision = canonical && typeof canonical === 'object' ? canonical : {};
    const contractDiagnostics = decision.contractDiagnostics && typeof decision.contractDiagnostics === 'object'
      ? decision.contractDiagnostics
      : {};
    const legacy = item.resolvedContract && typeof item.resolvedContract === 'object'
      ? item.resolvedContract
      : {};
    const canonicalVerdict = key(decision.canonical_final_verdict || decision.final_verdict || decision.finalVerdict, 'watch');
    const legacyVerdict = key(legacy.final_verdict || legacy.finalVerdict || item.review && item.review.savedVerdict);
    const decisiveBlocker = canonicalVerdict === 'entry'
      ? ''
      : firstText([
        decision.canonical_decisive_blocker,
        decision.decisiveBlocker,
        decision.main_blocker,
        decision.reason,
        decision.downgrade_reason,
        legacy.blockerReason
      ], 'No decisive blocker supplied.');
    const disagreement = Boolean(legacyVerdict && legacyVerdict !== canonicalVerdict);
    const fallbackUsed = Boolean(
      contractDiagnostics.fallbackUsed === true
      || contractDiagnostics.fallback === true
      || contractDiagnostics.authoritySelectionSource && /fallback/i.test(contractDiagnostics.authoritySelectionSource)
    );
    return Object.freeze({
      schemaVersion:'canonical-decision-observability-v1',
      ticker:text(item.ticker || item.symbol).toUpperCase(),
      canonicalVerdict,
      visualBucket:key(decision.bucket || decision.canonical_visual_bucket || decision.visualBucket, canonicalVerdict),
      decisiveBlocker,
      gates:Object.freeze({
        entry:decision.entry_gate_pass === true,
        nearEntry:decision.near_entry_gate_pass === true,
        buyerControl:decision.buyer_control_gate_pass === true,
        confirmation:decision.confirmation_gate_pass === true
      }),
      authority:Object.freeze({
        selected:text(contractDiagnostics.canonicalAuthoritySelectionSource || contractDiagnostics.authoritySelectionSource, 'legacy_resolver'),
        legacyVerdict:legacyVerdict || null,
        disagreement,
        fallbackUsed
      }),
      surfaces:Object.freeze({
        scan:key(surfaces.scan && surfaces.scan.verdict || canonicalVerdict, canonicalVerdict),
        review:key(surfaces.review && surfaces.review.verdict || canonicalVerdict, canonicalVerdict),
        track:key(surfaces.track && surfaces.track.verdict || canonicalVerdict, canonicalVerdict),
        paperTradeEligible:surfaces.paperTrade && surfaces.paperTrade.eligible === true
      })
    });
  }

  function compactRows(summary){
    const item = summary && typeof summary === 'object' ? summary : {};
    const gates = item.gates || {};
    const authority = item.authority || {};
    const surfaces = item.surfaces || {};
    return [
      {label:'Canonical decision', value:`${text(item.canonicalVerdict, 'watch')} / ${text(item.visualBucket, 'watch')}`},
      {label:'Decisive blocker', value:text(item.decisiveBlocker, '(none)')},
      {label:'Promotion gates', value:`Entry ${gates.entry === true ? 'pass' : 'block'}; Near Entry ${gates.nearEntry === true ? 'pass' : 'block'}`},
      {label:'Authority', value:`${text(authority.selected, 'legacy_resolver')}${authority.disagreement ? ' (legacy disagreement)' : ''}${authority.fallbackUsed ? ' (fallback)' : ''}`},
      {label:'Surface parity', value:`Scan ${text(surfaces.scan, 'watch')} / Review ${text(surfaces.review, 'watch')} / Track ${text(surfaces.track, 'watch')}`}
    ];
  }

  global.CanonicalDecisionObservability = {
    buildDecisionObservabilitySummary,
    compactRows
  };
})(typeof window !== 'undefined' ? window : globalThis);
