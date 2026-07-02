(function(global){
  function canonicalVerdict(value){
    const normalizer = global.ResolverCore && (global.ResolverCore.normalizeGlobalVerdictKey || global.ResolverCore.normalizeVerdict);
    if(typeof normalizer === 'function'){
      const normalized = normalizer(value || 'watch');
      return ['entry','near_entry','watch','avoid'].includes(normalized) ? normalized : 'watch';
    }
    const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
    if(safe === 'entry' || safe === 'near_entry' || safe === 'avoid') return safe;
    return 'watch';
  }

  function firstText(values){
    for(let index = 0; index < values.length; index += 1){
      const value = values[index];
      if(Array.isArray(value) && value.length) return String(value[0] || '').trim();
      if(typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
  }

  function normalizeMainBlockerCopy(mainBlocker, resolved){
    const text = String(mainBlocker || '').trim();
    const state = resolved && typeof resolved === 'object' ? resolved : {};
    const semanticReason = String(state.semantic_blocker_reason || state.semanticBlockerReason || '').trim();
    const semanticCode = String(state.semantic_blocker_code || state.semanticBlockerCode || '').trim();
    if(state.non_terminal_recovery_blocker === true || semanticCode){
      return semanticReason || 'Recovery attempt in progress. Wait for price to stabilise before considering entry.';
    }
    const structureState = String(state.structure_state || state.structureState || '').trim().toLowerCase();
    const rejectedByViability = state.rejected_by_viability_gate === true
      || state.rejectedByViabilityGate === true
      || String(state.viability || '').trim().toLowerCase() === 'reject';
    if(
      rejectedByViability
      && /^structure is broken\.?$/i.test(text)
      && ['weak','weakening','developing_loose'].includes(structureState)
    ){
      return structureState === 'weak'
        ? 'Structure is weak and viability rejected the setup.'
        : 'Trend is weakening and viability rejected the setup.';
    }
    const resolvedVerdict = canonicalVerdict(state.final_verdict || state.finalVerdict || 'watch');
    const structureEligibility = String(state.structure_eligibility || state.structureEligibility || '').trim().toLowerCase();
    const setupLocationState = String(state.setup_location_state || state.setupLocationState || '').trim().toLowerCase();
    const priceabilityState = String(state.priceability_state || state.priceabilityState || '').trim().toLowerCase();
    const bounceState = String(state.bounce_state || state.bounceState || '').trim().toLowerCase();
    const viabilityBranchId = String(state.viabilityBranchId || state.viability_branch_id || '').trim().toLowerCase();
    const aliveStructure = structureEligibility === 'alive'
      || ['strong','intact','developing_clean'].includes(structureState);
    const structuralWeakness = ['damaged','broken'].includes(structureEligibility)
      || ['weak','weakening','broken','failed','developing_loose'].includes(structureState);
    if(
      resolvedVerdict === 'watch'
      && aliveStructure
      && !structuralWeakness
      && /^structure is broken\.?$/i.test(text)
    ){
      const hasPlanMath = state.hasProvisionalPriceablePlan === true
        || state.has_provisional_priceable_plan === true
        || state.hasPriceablePlan === true
        || state.has_priceable_plan === true
        || String(state.plan_status || state.planStatus || '').trim().toLowerCase() === 'valid';
      return hasPlanMath
        ? 'Estimated maths exist, but confirmation is still missing before any entry is valid.'
        : 'Structure is still alive. Confirmation is missing, so the setup is not actionable yet.';
    }
    if(
      resolvedVerdict === 'watch'
      && aliveStructure
      && !structuralWeakness
      && /trend is weakening|structure (?:is )?(?:weakening|deteriorating|broken)|failed/i.test(text)
    ){
      if(setupLocationState === 'volatile' || priceabilityState === 'unpriceable'){
        return ['attempt','early','developing'].includes(bounceState)
          ? 'The broader uptrend is still intact, but the pullback has become volatile and the bounce attempt is not yet stable enough to price reliably.'
          : 'Recovery attempt is developing, but price has not stabilised enough yet. Setup is not clean enough to price reliably yet.';
      }
      return 'Setup is not actionable yet. Wait for clearer stabilisation and a reliable entry/stop area.';
    }
    if(
      resolvedVerdict === 'watch'
      && aliveStructure
      && !structuralWeakness
      && ['attempt','early','developing'].includes(bounceState)
      && /no (?:signs? of )?(?:stabili[sz]ation|bounce)|no bounce(?: yet| confirmation)?|bounce (?:is )?not (?:present|there)/i.test(text)
    ){
      return priceabilityState === 'unpriceable' || setupLocationState === 'volatile'
        ? 'The broader uptrend is still intact, but the pullback has become volatile and the bounce attempt is not yet stable enough to price reliably.'
        : 'Bounce attempt present, but confirmation is not strong enough yet.';
    }
    const setupScoreValue = state.setup_score ?? state.setupScore;
    const setupScore = Number.isFinite(Number(setupScoreValue)) ? Number(setupScoreValue) : null;
    const weakBounceOnlyCopy = /^no bounce confirmation yet\.?$/i.test(text) || /^developing - waiting for confirmation\.?$/i.test(text);
    if(
      resolvedVerdict === 'watch'
      && structureEligibility === 'alive'
      && weakBounceOnlyCopy
      && (
        ['none','extended','volatile','off_level','unclear'].includes(setupLocationState)
        || priceabilityState === 'unpriceable'
        || viabilityBranchId.includes('low_score')
        || (setupScore !== null && setupScore < 5)
      )
    ){
      if(setupLocationState === 'none' || setupLocationState === 'off_level' || setupLocationState === 'unclear'){
        return 'Strong trend, but no usable pullback setup yet. Wait for a cleaner reset near support.';
      }
      if(priceabilityState === 'unpriceable' || setupLocationState === 'extended' || setupLocationState === 'volatile'){
        return 'Setup is not priceable yet. No reliable entry or stop area is available.';
      }
      return 'Setup quality has slipped below useful watchlist quality. Wait for a cleaner reset near support.';
    }
    return text;
  }

  function accepted50MaSupportTestDisplayState(record, resolved = {}, visual = {}){
    const item = record && typeof record === 'object' ? record : {};
    const watchlistDebug = item.watchlist && item.watchlist.debug && typeof item.watchlist.debug === 'object'
      ? item.watchlist.debug
      : {};
    const structureState = String(
      visual.structureState
      || visual.structure_state
      || resolved.structure_state
      || resolved.structureState
      || item.setup && (item.setup.structureState || item.setup.structure_state)
      || ''
    ).trim().toLowerCase();
    const structureEligibility = String(
      visual.structureEligibility
      || visual.structure_eligibility
      || resolved.structure_eligibility
      || resolved.structureEligibility
      || ''
    ).trim().toLowerCase();
    const pullbackState = String(
      visual.pullbackState
      || visual.pullback_zone
      || resolved.pullback_zone
      || resolved.pullback_state
      || item.setup && (item.setup.pullbackZone || item.setup.pullback_zone)
      || ''
    ).trim().toLowerCase();
    const bounceState = String(
      visual.bounceState
      || visual.bounce_state
      || resolved.bounce_state
      || item.setup && (item.setup.bounceState || item.setup.bounce_state)
      || ''
    ).trim().toLowerCase();
    const pullbackAccepted = resolved.nearEntryPullbackZoneAccepted === true
      || resolved.near_entry_pullback_zone_accepted === true
      || resolved.pullback_ok === true
      || (resolved.entry_gate_checks && resolved.entry_gate_checks.pullback_ok === true)
      || (resolved.near_entry_gate_checks && resolved.near_entry_gate_checks.pullback_ok === true);
    const structurallyAliveAtRefresh = String(
      resolved.structural_alive_at_refresh
      || watchlistDebug.structural_alive_at_refresh
      || ''
    ).trim().toLowerCase() === 'true';
    const positiveAliveSignal = structurallyAliveAtRefresh
      || structureEligibility === 'alive'
      || ['strong','intact','developing_clean'].includes(structureState);
    const explicitInvalidationReason = String(resolved.explicit_invalidation_reason || '').trim().toLowerCase();
    const hasExplicitInvalidation = !!(
      explicitInvalidationReason
      && explicitInvalidationReason !== '(none)'
      && explicitInvalidationReason !== 'none'
      && explicitInvalidationReason !== 'n/a'
    );
    const refreshDemoteReason = String(
      resolved.refresh_demote_reason
      || watchlistDebug.refresh_demote_reason
      || ''
    ).trim().toLowerCase();
    const supportFailureReason = String(
      refreshDemoteReason
      || resolved.main_blocker
      || resolved.reason
      || resolved.downgrade_reason
      || ''
    ).trim().toLowerCase();
    const explicitAliveMonitorReason = /structurally alive;\s*keep on monitor|testing 50ma support|support defence/i.test(refreshDemoteReason);
    const failedSupportTest = explicitAliveMonitorReason
      ? false
      : /lost[_\s-]?50ma|support failed|failed support|below support|structure is broken|trend is weakening|structure weakening|diminishing|remove from active focus/i.test(supportFailureReason);
    const currentPrice = Number(item.marketData && (item.marketData.price ?? item.marketData.currentPrice ?? item.marketData.close));
    const sma50 = Number(item.marketData && (item.marketData.sma50 ?? item.marketData.ma50));
    const lost50MaSupport = Number.isFinite(currentPrice) && Number.isFinite(sma50) && sma50 > 0 && currentPrice < sma50 * 0.99;
    const terminalAvoid = canonicalVerdict(resolved.final_verdict || resolved.finalVerdict || 'watch') === 'avoid'
      || resolved.terminal_avoid_applied === true
      || resolved.rejected_by_viability_gate === true
      || String(resolved.viability || '').trim().toLowerCase() === 'reject'
      || ['broken','failed','dead','invalid'].includes(structureState)
      || structureEligibility === 'broken'
      || hasExplicitInvalidation;
    const bounceUnconfirmed = ['none','unconfirmed','attempt','early','developing','improving',''].includes(bounceState);
    return pullbackAccepted
      && pullbackState === 'near_50ma'
      && bounceUnconfirmed
      && positiveAliveSignal
      && !lost50MaSupport
      && !terminalAvoid
      && !failedSupportTest;
  }

  function buildPresentationModel({surface = 'scanner', record, planState, resolvedState, visualState} = {}){
    const item = record && typeof record === 'object' ? record : {};
    const resolved = resolvedState && typeof resolvedState === 'object' ? resolvedState : {};
    const visual = visualState && typeof visualState === 'object' ? visualState : {};
    const plan = planState && typeof planState === 'object' ? planState : {};
    const verdict = canonicalVerdict(
      resolved.canonical_final_verdict
      || resolved.final_verdict_rendered
      || resolved.final_verdict
      || resolved.finalVerdict
      || visual.canonicalVerdict
      || visual.finalVerdict
      || visual.final_verdict
      || 'watch'
    );
    const badge = visual.badge || resolved.badge || {};
    const action = resolved.action || {};
    const resolvedRR = Number.isFinite(Number(
      visual.resolvedRR
      || visual.resolved_rr
      || resolved.resolvedRR
      || resolved.resolved_rr
      || resolved.rr
    ))
      ? Number(
        visual.resolvedRR
        || visual.resolved_rr
        || resolved.resolvedRR
        || resolved.resolved_rr
        || resolved.rr
      )
      : null;
    const entryReasons = Array.isArray(resolved.entry_gate_reasons) ? resolved.entry_gate_reasons.slice() : [];
    const nearReasons = Array.isArray(resolved.near_entry_gate_reasons) ? resolved.near_entry_gate_reasons.slice() : [];
    const blockers = []
      .concat(nearReasons)
      .concat(entryReasons)
      .filter(Boolean);
    let mainBlocker = normalizeMainBlockerCopy(firstText([
      resolved.main_blocker,
      resolved.promotionBlockedReason,
      visual.reason,
      resolved.reason,
      blockers
    ]), resolved);
    if(
      (visual.weakWatchDowngradeApplied === true || visual.weakWatchDiminishingApplied === true)
      && /needs confirmation|no valid invalidation|bounce.*confirm|hold for entry|waiting for confirmation|strong trend|clean pullback|price is too extended|usable pullback setup/i.test(mainBlocker)
    ){
      mainBlocker = 'Rebound attempt is not confirmed - price remains below key reclaim levels and no safe entry structure is available yet.';
    }
    const accepted50MaSupportTest = accepted50MaSupportTestDisplayState(item, resolved, visual);
    const canonicalSoftReadinessOverride = resolved.canonical_soft_readiness_alignment_applied === true;
    const weakWatchVisualOverride = verdict === 'watch' && (
      visual.weakWatchDowngradeApplied === true
      || visual.weakWatchDiminishingApplied === true
      || ['diminishing'].includes(String(visual.visualBucket || visual.presentationBucket || visual.bucket || '').trim().toLowerCase())
    );
    const preferredVisualBucket = canonicalSoftReadinessOverride
      ? String(
        (resolved.canonical_visual_bucket || '')
        || visual.visualBucket
        || visual.presentationBucket
        || visual.bucket
        || resolved.bucket
        || 'monitor'
      ).trim().toLowerCase() || 'monitor'
      : (weakWatchVisualOverride
        ? String(
          visual.visualBucket
          || visual.presentationBucket
          || visual.bucket
          || (resolved.canonical_visual_bucket || '')
          || resolved.bucket
          || 'monitor'
        ).trim().toLowerCase() || 'monitor'
        : String(
          (resolved.canonical_visual_bucket || '')
          || visual.visualBucket
          || visual.presentationBucket
          || visual.bucket
          || resolved.bucket
          || 'monitor'
        ).trim().toLowerCase() || 'monitor');
    const preferredTone = canonicalSoftReadinessOverride
      ? String(
        visual.tone
        || visual.visual_tone
        || resolved.tone
        || (resolved.canonical_visual_bucket || '')
        || preferredVisualBucket
        || resolved.bucket
        || 'monitor'
      ).trim().toLowerCase() || 'monitor'
      : (weakWatchVisualOverride
        ? String(
          visual.tone
          || visual.visual_tone
          || preferredVisualBucket
          || resolved.tone
          || (resolved.canonical_visual_bucket || '')
          || resolved.bucket
          || 'monitor'
        ).trim().toLowerCase() || 'monitor'
        : String(
          visual.tone
          || visual.visual_tone
          || resolved.tone
          || preferredVisualBucket
          || (resolved.canonical_visual_bucket || '')
          || resolved.bucket
          || 'monitor'
        ).trim().toLowerCase() || 'monitor');
    const normalizedVisualBucket = accepted50MaSupportTest
      && preferredVisualBucket === 'diminishing'
        ? 'monitor'
        : preferredVisualBucket;
    const normalizedTone = accepted50MaSupportTest
      && preferredTone === 'diminishing'
        ? 'monitor'
        : preferredTone;
    if(accepted50MaSupportTest && /trend is weakening|structure is broken|diminishing/i.test(mainBlocker)){
      mainBlocker = 'Testing 50MA support - waiting for buyers to confirm.';
    }
    const actionLabel = verdict === 'entry'
      ? 'Execute only if the trigger remains valid.'
      : (verdict === 'near_entry'
        ? 'Wait for stronger confirmation before considering an entry.'
        : String(action.label || resolved.actionLabel || visual.decision_summary || '').trim());

    return {
      ticker:String(item.ticker || item.symbol || '').trim().toUpperCase(),
      canonicalVerdict:verdict,
      visualBucket:normalizedVisualBucket,
      tone:normalizedTone,
      badgeLabel:String(badge.text || badge.label || resolved.badgeLabel || (global.ResolverCore && global.ResolverCore.globalVerdictLabel ? global.ResolverCore.globalVerdictLabel(verdict) : 'Watch')).trim(),
      actionLabel,
      planVisible:plan.planVisible === true || String(plan.status || '').toLowerCase() === 'valid',
      planStatus:String(plan.status || 'missing').trim().toLowerCase() || 'missing',
      mainBlocker,
      resolvedRR,
      avoidTriggerSource:String(
        visual.avoidTriggerSource
        || visual.avoid_trigger_source
        || resolved.avoidTriggerSource
        || resolved.avoid_trigger_source
        || resolved.dead_trigger_source
        || ''
      ).trim().toLowerCase(),
      structureState:String(
        visual.structureState
        || visual.structure_state
        || ''
      ).trim().toLowerCase(),
      structureEligibility:String(
        visual.structureEligibility
        || visual.structure_eligibility
        || resolved.structureEligibility
        || resolved.structure_eligibility
        || ''
      ).trim().toLowerCase(),
      setupLocationState:String(
        visual.setupLocationState
        || visual.setup_location_state
        || resolved.setup_location_state
        || ''
      ).trim().toLowerCase(),
      priceabilityState:String(
        resolved.canonical_priceability_state
        || visual.priceabilityState
        || visual.priceability_state
        || resolved.priceability_state
        || ''
      ).trim().toLowerCase(),
      bounceState:String(
        visual.bounceState
        || visual.bounce_state
        || resolved.bounce_state
        || ''
      ).trim().toLowerCase(),
      entryGatePass:resolved.entry_gate_pass === true,
      nearEntryGatePass:resolved.near_entry_gate_pass === true,
      terminalAvoidApplied:resolved.terminal_avoid_applied === true || resolved.terminalAvoidApplied === true,
      blockers,
      visualBucketBeforeWeakWatchDowngrade:visual.visualBucketBeforeWeakWatchDowngrade || '',
      weakWatchDowngradeApplied:visual.weakWatchDowngradeApplied === true,
      weakWatchDowngradeReasons:Array.isArray(visual.weakWatchDowngradeReasons) ? visual.weakWatchDowngradeReasons.slice() : [],
      weakWatchDiminishingApplied:visual.weakWatchDiminishingApplied === true,
      weakWatchDiminishingReason:String(visual.weakWatchDiminishingReason || ''),
      weakWatchDiminishingTrace:visual.weakWatchDiminishingTrace && typeof visual.weakWatchDiminishingTrace === 'object'
        ? {...visual.weakWatchDiminishingTrace}
        : null,
      finalVisualBucket:visual.finalVisualBucket || visual.visualBucket || visual.presentationBucket || '',
      debug:{
        surface,
        source:'simplified-state-pipeline',
        resolvedFinalVerdict:resolved.final_verdict || resolved.finalVerdict || '',
        resolvedCanonicalFinalVerdict:resolved.canonical_final_verdict || '',
        visualFinalVerdict:visual.finalVerdict || visual.final_verdict || '',
        planSource:plan.planSourceUsedForRisk || '',
        entryGateChecks:resolved.entry_gate_checks || {},
        nearEntryGateChecks:resolved.near_entry_gate_checks || {},
        resolvedState,
        visualState
      }
    };
  }

  global.SimplifiedPresentationModel = {
    buildPresentationModel
  };
})(window);
