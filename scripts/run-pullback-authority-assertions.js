const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');

function extractFunctionSource(source, functionName){
  const start = source.indexOf(`function ${functionName}`);
  if(start < 0) throw new Error(`Unable to find ${functionName}.`);
  const paramsStart = source.indexOf('(', start);
  let paramDepth = 0;
  let paramsEnd = -1;
  for(let index = paramsStart; index < source.length; index += 1){
    const char = source[index];
    if(char === '(') paramDepth += 1;
    else if(char === ')'){
      paramDepth -= 1;
      if(paramDepth === 0){
        paramsEnd = index;
        break;
      }
    }
  }
  const bodyStart = source.indexOf('{', paramsEnd > -1 ? paramsEnd : start);
  let depth = 0;
  for(let index = bodyStart; index < source.length; index += 1){
    const char = source[index];
    if(char === '{') depth += 1;
    else if(char === '}'){
      depth -= 1;
      if(depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Unable to extract ${functionName}.`);
}

function numericOrNull(value){
  if(value === null || value === undefined) return null;
  if(typeof value === 'string' && value.trim() === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeTickerRecordReadOnly(record){
  return record && typeof record === 'object' ? record : {};
}

function loadResolverCore(){
  const sandbox = {
    window:{},
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval
  };
  sandbox.globalThis = sandbox.window;
  sandbox.window.setTimeout = setTimeout;
  sandbox.window.clearTimeout = clearTimeout;
  sandbox.window.setInterval = setInterval;
  sandbox.window.clearInterval = clearInterval;
  const resolverSource = fs.readFileSync(path.join(root, 'js', 'resolver-core.js'), 'utf8');
  vm.runInNewContext(resolverSource, sandbox, {filename:'js/resolver-core.js'});
  if(!sandbox.window.ResolverCore || typeof sandbox.window.ResolverCore.resolveCanonicalPullbackContext !== 'function'){
    throw new Error('ResolverCore canonical pullback helper is unavailable.');
  }
  return sandbox.window.ResolverCore;
}

function loadAppPullbackSandbox(appSource){
  const sandbox = {
    console,
    numericOrNull,
    normalizeTickerRecordReadOnly,
    pullbackStateLabel(state){
      const safe = String(state || '').trim().toLowerCase();
      if(safe === 'near_20ma') return 'Near 20MA';
      if(safe === 'near_50ma') return 'Near 50MA';
      if(safe === 'between_20_50') return 'between 20/50MA';
      return safe || 'none';
    },
    reviewConsolidationPresentationCopy(){
      return {technicalLabel:'Consolidating'};
    }
  };
  vm.createContext(sandbox);
  [
    'reviewTechnicalPullbackLabel',
    'resolveCanonicalPullbackState',
    'reviewTechnicalBounceLabel',
    'resolveReviewPullbackBounceDisplayContext',
    'buildPromotionGateTrace',
    'runVerdictCapAudit',
    'buildTesterDiagnosticSnapshot',
    'buildReplaySnapshotForTicker'
  ].forEach(functionName => {
    vm.runInContext(extractFunctionSource(appSource, functionName), sandbox, {filename:`app.js#${functionName}`});
  });
  return sandbox;
}

function makeParityFixture(id, record, ctx, expected){
  return {id, record, ctx, expected};
}

function comparablePullback(result){
  return {
    rawPullbackState:String(result.rawPullbackState || '').trim(),
    canonicalPullbackState:String(result.canonicalPullbackState || '').trim(),
    recentSupportInteraction:result.recentSupportInteraction === true,
    reconciliationReason:String(result.reconciliationReason || '').trim(),
    pullbackValid:result.canonicalPullbackValid === true,
    supportInteractionState:String(result.supportInteractionState || '').trim(),
    currentLocationState:String(result.currentLocationState || '').trim()
  };
}

function runCanonicalPullbackParityAssertions(appSandbox, resolverCore){
  const fixtures = [
    makeParityFixture(
      'raw_near_20ma_valid',
      {ticker:'RAW20', marketData:{price:100, sma20:99.4, sma50:95}},
      {
        pullback_zone:'near_20ma',
        setup_location_state:'near_20ma',
        bounce_state:'attempt',
        stabilisation_state:'early',
        structure_state:'strong',
        support_held:false,
        meaningful_reversal:false,
        signal_count:2,
        current_price:100,
        ma20:99.4,
        ma50:95
      },
      {
        rawPullbackState:'near_20ma',
        canonicalPullbackState:'near_20ma',
        recentSupportInteraction:true,
        reconciliationReason:'',
        pullbackValid:true,
        supportInteractionState:'active_20ma_support',
        currentLocationState:'near_20ma'
      }
    ),
    makeParityFixture(
      'structure_eligibility_alive_real_support',
      {ticker:'ALIVE', marketData:{price:69.34, sma20:71.053, sma50:67.8266}},
      {
        pullback_zone:'none',
        setup_location_state:'off_level',
        structure_state:'developing',
        structure_eligibility:'alive',
        bounce_state:'none',
        stabilisation_state:'none',
        support_held:true,
        meaningful_reversal:true,
        signal_count:0,
        current_price:69.34,
        ma20:71.053,
        ma50:67.8266
      },
      {
        rawPullbackState:'none',
        canonicalPullbackState:'near_20ma',
        recentSupportInteraction:true,
        reconciliationReason:'bounce_positive_near_20ma',
        pullbackValid:true,
        supportInteractionState:'active_20ma_support',
        currentLocationState:'off_level'
      }
    ),
    makeParityFixture(
      'structure_eligibility_messy_real_support',
      {ticker:'MESSY', marketData:{price:69.34, sma20:71.053, sma50:67.8266}},
      {
        pullback_zone:'none',
        setup_location_state:'off_level',
        structure_state:'developing',
        structure_eligibility:'messy',
        bounce_state:'none',
        stabilisation_state:'none',
        support_held:true,
        meaningful_reversal:true,
        signal_count:0,
        current_price:69.34,
        ma20:71.053,
        ma50:67.8266
      },
      {
        rawPullbackState:'none',
        canonicalPullbackState:'near_20ma',
        recentSupportInteraction:true,
        reconciliationReason:'bounce_positive_near_20ma',
        pullbackValid:true,
        supportInteractionState:'active_20ma_support',
        currentLocationState:'off_level'
      }
    ),
    makeParityFixture(
      'structure_state_developing_real_support',
      {ticker:'DEV', marketData:{price:69.34, sma20:71.053, sma50:67.8266}},
      {
        pullback_zone:'none',
        setup_location_state:'off_level',
        structure_state:'developing',
        bounce_state:'none',
        stabilisation_state:'none',
        support_held:true,
        meaningful_reversal:true,
        signal_count:0,
        current_price:69.34,
        ma20:71.053,
        ma50:67.8266
      },
      {
        rawPullbackState:'none',
        canonicalPullbackState:'near_20ma',
        recentSupportInteraction:true,
        reconciliationReason:'bounce_positive_near_20ma',
        pullbackValid:true,
        supportInteractionState:'active_20ma_support',
        currentLocationState:'off_level'
      }
    ),
    makeParityFixture(
      'support_held_without_explicit_bounce',
      {ticker:'SUPH', marketData:{price:69.34, sma20:71.053, sma50:67.8266}},
      {
        pullback_zone:'none',
        setup_location_state:'off_level',
        structure_state:'strong',
        bounce_state:'none',
        stabilisation_state:'none',
        support_held:true,
        meaningful_reversal:false,
        signal_count:0,
        current_price:69.34,
        ma20:71.053,
        ma50:67.8266
      },
      {
        rawPullbackState:'none',
        canonicalPullbackState:'near_20ma',
        recentSupportInteraction:true,
        reconciliationReason:'bounce_positive_near_20ma',
        pullbackValid:true,
        supportInteractionState:'active_20ma_support',
        currentLocationState:'off_level'
      }
    ),
    makeParityFixture(
      'meaningful_reversal_without_explicit_bounce',
      {ticker:'REV', marketData:{price:69.34, sma20:71.053, sma50:67.8266}},
      {
        pullback_zone:'none',
        setup_location_state:'off_level',
        structure_state:'strong',
        bounce_state:'none',
        stabilisation_state:'none',
        support_held:false,
        meaningful_reversal:true,
        signal_count:0,
        current_price:69.34,
        ma20:71.053,
        ma50:67.8266
      },
      {
        rawPullbackState:'none',
        canonicalPullbackState:'near_20ma',
        recentSupportInteraction:true,
        reconciliationReason:'bounce_positive_near_20ma',
        pullbackValid:true,
        supportInteractionState:'active_20ma_support',
        currentLocationState:'off_level'
      }
    ),
    makeParityFixture(
      'signal_count_only_response_threshold',
      {ticker:'SIG', marketData:{price:69.34, sma20:71.053, sma50:67.8266}},
      {
        pullback_zone:'none',
        setup_location_state:'off_level',
        structure_state:'strong',
        bounce_state:'none',
        stabilisation_state:'none',
        support_held:false,
        meaningful_reversal:false,
        signal_count:1,
        current_price:69.34,
        ma20:71.053,
        ma50:67.8266
      },
      {
        rawPullbackState:'none',
        canonicalPullbackState:'near_20ma',
        recentSupportInteraction:true,
        reconciliationReason:'bounce_positive_near_20ma',
        pullbackValid:true,
        supportInteractionState:'active_20ma_support',
        currentLocationState:'off_level'
      }
    ),
    makeParityFixture(
      'explicit_bounce_response',
      {ticker:'BNC', marketData:{price:69.34, sma20:71.053, sma50:67.8266}},
      {
        pullback_zone:'none',
        setup_location_state:'off_level',
        structure_state:'strong',
        bounce_state:'improving',
        stabilisation_state:'none',
        support_held:false,
        meaningful_reversal:false,
        signal_count:0,
        current_price:69.34,
        ma20:71.053,
        ma50:67.8266
      },
      {
        rawPullbackState:'none',
        canonicalPullbackState:'near_20ma',
        recentSupportInteraction:true,
        reconciliationReason:'bounce_positive_near_20ma',
        pullbackValid:true,
        supportInteractionState:'active_20ma_support',
        currentLocationState:'off_level'
      }
    ),
    makeParityFixture(
      'stabilisation_led_response_early',
      {ticker:'STAB1', marketData:{price:69.34, sma20:71.053, sma50:67.8266}},
      {
        pullback_zone:'none',
        setup_location_state:'off_level',
        structure_state:'strong',
        bounce_state:'none',
        stabilisation_state:'early',
        support_held:false,
        meaningful_reversal:false,
        signal_count:0,
        current_price:69.34,
        ma20:71.053,
        ma50:67.8266
      },
      {
        rawPullbackState:'none',
        canonicalPullbackState:'near_20ma',
        recentSupportInteraction:true,
        reconciliationReason:'bounce_positive_near_20ma',
        pullbackValid:true,
        supportInteractionState:'active_20ma_support',
        currentLocationState:'off_level'
      }
    ),
    makeParityFixture(
      'stabilisation_led_response_clear',
      {ticker:'STAB2', marketData:{price:69.34, sma20:71.053, sma50:67.8266}},
      {
        pullback_zone:'none',
        setup_location_state:'off_level',
        structure_state:'strong',
        bounce_state:'none',
        stabilisation_state:'clear',
        support_held:false,
        meaningful_reversal:false,
        signal_count:0,
        current_price:69.34,
        ma20:71.053,
        ma50:67.8266
      },
      {
        rawPullbackState:'none',
        canonicalPullbackState:'near_20ma',
        recentSupportInteraction:true,
        reconciliationReason:'bounce_positive_near_20ma',
        pullbackValid:true,
        supportInteractionState:'active_20ma_support',
        currentLocationState:'off_level'
      }
    ),
    makeParityFixture(
      'reclaim_led_response',
      {ticker:'RCLM', marketData:{price:69.34, sma20:71.053, sma50:67.8266}},
      {
        pullback_zone:'none',
        setup_location_state:'off_level',
        structure_state:'strong',
        bounce_state:'none',
        stabilisation_state:'none',
        support_held:false,
        meaningful_reversal:false,
        signal_count:0,
        reclaim_confirmed_independent:true,
        current_price:69.34,
        ma20:71.053,
        ma50:67.8266
      },
      {
        rawPullbackState:'none',
        canonicalPullbackState:'near_20ma',
        recentSupportInteraction:true,
        reconciliationReason:'bounce_positive_near_20ma',
        pullbackValid:true,
        supportInteractionState:'active_20ma_support',
        currentLocationState:'off_level'
      }
    ),
    makeParityFixture(
      'damaged_structure_no_reconcile',
      {ticker:'DMG', marketData:{price:69.34, sma20:71.053, sma50:67.8266}},
      {
        pullback_zone:'none',
        setup_location_state:'off_level',
        structure_state:'weak',
        bounce_state:'attempt',
        stabilisation_state:'early',
        support_held:true,
        meaningful_reversal:true,
        signal_count:3,
        current_price:69.34,
        ma20:71.053,
        ma50:67.8266
      },
      {
        rawPullbackState:'none',
        canonicalPullbackState:'none',
        recentSupportInteraction:true,
        reconciliationReason:'',
        pullbackValid:false,
        supportInteractionState:'active_20ma_support',
        currentLocationState:'off_level'
      }
    ),
    makeParityFixture(
      'broken_structure_no_reconcile',
      {ticker:'BRKN', marketData:{price:69.34, sma20:71.053, sma50:67.8266}},
      {
        pullback_zone:'none',
        setup_location_state:'off_level',
        structure_state:'broken',
        bounce_state:'attempt',
        stabilisation_state:'early',
        support_held:true,
        meaningful_reversal:true,
        signal_count:3,
        current_price:69.34,
        ma20:71.053,
        ma50:67.8266
      },
      {
        rawPullbackState:'none',
        canonicalPullbackState:'none',
        recentSupportInteraction:true,
        reconciliationReason:'',
        pullbackValid:false,
        supportInteractionState:'active_20ma_support',
        currentLocationState:'off_level'
      }
    ),
    makeParityFixture(
      'off_level_no_support',
      {ticker:'OFF', marketData:{price:112, sma20:100, sma50:95}},
      {
        pullback_zone:'none',
        setup_location_state:'off_level',
        bounce_state:'attempt',
        stabilisation_state:'none',
        structure_state:'strong',
        support_held:false,
        meaningful_reversal:false,
        signal_count:0,
        current_price:112,
        ma20:100,
        ma50:95
      },
      {
        rawPullbackState:'none',
        canonicalPullbackState:'none',
        recentSupportInteraction:false,
        reconciliationReason:'',
        pullbackValid:false,
        supportInteractionState:'none',
        currentLocationState:'off_level'
      }
    ),
    makeParityFixture(
      'extended_no_support',
      {ticker:'EXT', marketData:{price:111, sma20:100, sma50:95}},
      {
        pullback_zone:'none',
        setup_location_state:'extended',
        bounce_state:'attempt',
        stabilisation_state:'early',
        structure_state:'strong',
        support_held:false,
        meaningful_reversal:false,
        signal_count:0,
        current_price:111,
        ma20:100,
        ma50:95
      },
      {
        rawPullbackState:'none',
        canonicalPullbackState:'none',
        recentSupportInteraction:false,
        reconciliationReason:'',
        pullbackValid:false,
        supportInteractionState:'none',
        currentLocationState:'extended'
      }
    ),
    makeParityFixture(
      'carr_like_real_support',
      {ticker:'CARR', marketData:{price:69.34, sma20:71.053, sma50:67.8266}},
      {
        pullback_zone:'none',
        setup_location_state:'off_level',
        bounce_state:'attempt',
        stabilisation_state:'none',
        structure_state:'strong',
        support_held:true,
        meaningful_reversal:true,
        signal_count:6,
        current_price:69.34,
        ma20:71.053,
        ma50:67.8266
      },
      {
        rawPullbackState:'none',
        canonicalPullbackState:'near_20ma',
        recentSupportInteraction:true,
        reconciliationReason:'bounce_positive_near_20ma',
        pullbackValid:true,
        supportInteractionState:'active_20ma_support',
        currentLocationState:'off_level'
      }
    ),
    makeParityFixture(
      'recent_50ma_defence',
      {ticker:'ALLY', marketData:{price:248.63, sma20:265, sma50:250.23}},
      {
        pullback_zone:'none',
        setup_location_state:'off_level',
        bounce_state:'attempt',
        stabilisation_state:'early',
        structure_state:'strong',
        support_held:true,
        meaningful_reversal:true,
        signal_count:4,
        current_price:248.63,
        ma20:265,
        ma50:250.23
      },
      {
        rawPullbackState:'none',
        canonicalPullbackState:'near_50ma',
        recentSupportInteraction:true,
        reconciliationReason:'bounce_positive_near_50ma',
        pullbackValid:true,
        supportInteractionState:'active_50ma_support',
        currentLocationState:'off_level'
      }
    )
  ];

  fixtures.forEach(fixture => {
    const appResult = appSandbox.resolveCanonicalPullbackState({
      record:fixture.record,
      derivedStates:{
        pullbackZone:fixture.ctx.pullback_zone,
        bounceState:fixture.ctx.bounce_state,
        stabilisationState:fixture.ctx.stabilisation_state,
        setupLocationState:fixture.ctx.setup_location_state,
        structureState:fixture.ctx.structure_state,
        structureEligibility:fixture.ctx.structure_eligibility,
        supportHeld:fixture.ctx.support_held,
        meaningfulReversal:fixture.ctx.meaningful_reversal,
        signalCount:fixture.ctx.signal_count,
        reclaimConfirmedIndependent:fixture.ctx.reclaim_confirmed_independent,
        reclaimsLevel:fixture.ctx.reclaims_level,
        entryTriggerHit:fixture.ctx.entry_trigger_hit,
        supportInteractionState:fixture.ctx.support_interaction_state
      },
      globalVerdict:{
        support_held:fixture.ctx.support_held,
        meaningful_reversal:fixture.ctx.meaningful_reversal,
        signal_count:fixture.ctx.signal_count,
        reclaim_confirmed_independent:fixture.ctx.reclaim_confirmed_independent,
        reclaims_level:fixture.ctx.reclaims_level,
        entry_trigger_hit:fixture.ctx.entry_trigger_hit,
        support_interaction_state:fixture.ctx.support_interaction_state,
        structure_eligibility:fixture.ctx.structure_eligibility
      },
      reviewEvidence:{
        terminalAvoid:false,
        structuralWeakness:['weak','weakening','broken','damaged','terminal'].includes(String(fixture.ctx.structure_state || '').trim().toLowerCase())
      }
    });
    const resolverResult = resolverCore.resolveCanonicalPullbackContext(fixture.ctx);
    const comparableApp = comparablePullback(appResult);
    const comparableResolver = comparablePullback(resolverResult);
    if(JSON.stringify(comparableApp) !== JSON.stringify(comparableResolver)){
      throw new Error(`${fixture.id}: app and resolver-core pullback helpers diverged.\napp=${JSON.stringify(comparableApp)}\nresolver=${JSON.stringify(comparableResolver)}`);
    }
    if(JSON.stringify(comparableResolver) !== JSON.stringify(fixture.expected)){
      throw new Error(`${fixture.id}: canonical pullback result mismatch.\nexpected=${JSON.stringify(fixture.expected)}\nactual=${JSON.stringify(comparableResolver)}`);
    }
  });
}

function runReviewAuthorityAssertions(appSandbox){
  const rawNear20 = appSandbox.resolveReviewPullbackBounceDisplayContext({
    record:{ticker:'NVDA', marketData:{price:222.82, sma20:220.5, sma50:208.1}},
    simplifiedState:{structureState:'strong', structureEligibility:'alive', bounceState:'attempt'},
    globalVerdict:{pullback_detected:true},
    derivedStates:{
      pullbackState:'near_20ma',
      pullbackZone:'near_20ma',
      bounceState:'attempt',
      stabilisationState:'early',
      setupLocationState:'near_20ma',
      structureState:'strong'
    },
    reviewEvidence:{terminalAvoid:false, structuralWeakness:false, consolidating:false}
  });
  if(rawNear20.canonicalPullbackState !== 'near_20ma' || rawNear20.pullbackLabel !== 'Pullback Near 20MA'){
    throw new Error('Raw near_20ma pullbacks must remain authoritative in Review.');
  }

  const carrLike = appSandbox.resolveReviewPullbackBounceDisplayContext({
    record:{ticker:'CARR', marketData:{price:69.34, sma20:71.053, sma50:67.8266}},
    simplifiedState:{structureState:'strong', structureEligibility:'alive', bounceState:'attempt'},
    globalVerdict:{pullback_detected:false},
    derivedStates:{
      pullbackState:'none',
      pullbackZone:'none',
      bounceState:'attempt',
      stabilisationState:'none',
      setupLocationState:'off_level',
      structureState:'strong',
      supportHeld:true,
      meaningfulReversal:true
    },
    reviewEvidence:{terminalAvoid:false, structuralWeakness:false, consolidating:false}
  });
  if(carrLike.canonicalPullbackState !== 'near_20ma'
    || carrLike.nearEntryPullbackZoneAccepted !== true
    || carrLike.currentLocationState !== 'off_level'
    || carrLike.pullbackLabel !== 'Pullback Near 20MA'){
    throw new Error('CARR-like pullbacks must reconcile to canonical Near 20MA in Review while preserving off-level current location.');
  }

  const genuineOffLevel = appSandbox.resolveReviewPullbackBounceDisplayContext({
    record:{ticker:'MSFT', marketData:{price:300, sma20:280, sma50:260}},
    simplifiedState:{structureState:'strong', structureEligibility:'alive', bounceState:'attempt'},
    globalVerdict:{pullback_detected:false},
    derivedStates:{
      pullbackState:'none',
      pullbackZone:'none',
      bounceState:'attempt',
      stabilisationState:'none',
      setupLocationState:'off_level',
      structureState:'strong'
    },
    reviewEvidence:{terminalAvoid:false, structuralWeakness:false, consolidating:false}
  });
  if(genuineOffLevel.canonicalPullbackState !== 'none'
    || genuineOffLevel.nearEntryPullbackZoneAccepted === true
    || genuineOffLevel.pullbackLabel !== 'Pullback none'){
    throw new Error('Off-level setups without support evidence must remain invalid in Review.');
  }
}

function runPromotionGateAssertions(appSandbox){
  const rawNear20Trace = appSandbox.buildPromotionGateTrace({
    structureState:'intact',
    pullbackState:'near_20ma',
    rawPullbackState:'near_20ma',
    canonicalPullbackState:'near_20ma',
    stabilisationState:'early',
    bounceState:'attempt',
    planStateKey:'valid',
    hasPriceablePlanValues:true,
    hasClearInvalidationLevel:true,
    hasEntry:true,
    hasStop:true,
    hasTarget:true,
    riskTooWide:false,
    stopDistanceTooWide:false,
    hardBlockers:false,
    tradeStructureClearEnough:true,
    rr:2.1,
    priceBelow50MA:false,
    reclaimAttempt:false,
    pullbackValid:true
  });
  if(rawNear20Trace.gate_pullback_zone_ok_for_near !== true
    || rawNear20Trace.audit_pullback_zone !== 'near_20ma'
    || rawNear20Trace.audit_pullback_zone_raw !== 'near_20ma'){
    throw new Error('Raw near_20ma authority must remain valid in the Near Entry gate trace.');
  }

  const offLevelTrace = appSandbox.buildPromotionGateTrace({
    structureState:'strong',
    pullbackState:'none',
    rawPullbackState:'none',
    canonicalPullbackState:'none',
    setupLocationState:'off_level',
    stabilisationState:'none',
    bounceState:'attempt',
    planStateKey:'valid',
    hasPriceablePlanValues:true,
    hasClearInvalidationLevel:true,
    hasEntry:true,
    hasStop:true,
    hasTarget:true,
    riskTooWide:false,
    stopDistanceTooWide:false,
    hardBlockers:false,
    tradeStructureClearEnough:true,
    rr:2.1,
    priceBelow50MA:false,
    reclaimAttempt:false,
    pullbackValid:false
  });
  if(offLevelTrace.gate_pullback_zone_ok_for_near === true){
    throw new Error('Genuine off-level setups must fail the Near Entry pullback gate.');
  }

  const extendedTrace = appSandbox.buildPromotionGateTrace({
    structureState:'strong',
    pullbackState:'none',
    rawPullbackState:'none',
    canonicalPullbackState:'none',
    setupLocationState:'extended',
    stabilisationState:'early',
    bounceState:'attempt',
    planStateKey:'valid',
    hasPriceablePlanValues:true,
    hasClearInvalidationLevel:true,
    hasEntry:true,
    hasStop:true,
    hasTarget:true,
    riskTooWide:false,
    stopDistanceTooWide:false,
    hardBlockers:false,
    tradeStructureClearEnough:true,
    rr:2.1,
    priceBelow50MA:false,
    reclaimAttempt:false,
    pullbackValid:false
  });
  if(extendedTrace.gate_pullback_zone_ok_for_near === true){
    throw new Error('Genuine extended setups must fail the Near Entry pullback gate.');
  }

  const carrLikeTrace = appSandbox.buildPromotionGateTrace({
    structureState:'strong',
    pullbackState:'near_20ma',
    rawPullbackState:'none',
    canonicalPullbackState:'near_20ma',
    setupLocationState:'off_level',
    stabilisationState:'none',
    bounceState:'attempt',
    planStateKey:'valid',
    hasPriceablePlanValues:true,
    hasClearInvalidationLevel:true,
    hasEntry:true,
    hasStop:true,
    hasTarget:true,
    riskTooWide:false,
    stopDistanceTooWide:false,
    hardBlockers:false,
    tradeStructureClearEnough:true,
    rr:1.2,
    priceBelow50MA:false,
    reclaimAttempt:false,
    pullbackValid:true
  });
  if(carrLikeTrace.gate_pullback_zone_ok_for_near !== true
    || carrLikeTrace.audit_pullback_zone !== 'near_20ma'
    || carrLikeTrace.audit_pullback_zone_raw !== 'none'){
    throw new Error('CARR-like reconciled pullbacks must pass the Near Entry gate with canonical/raw parity preserved.');
  }

  const recent50maTrace = appSandbox.buildPromotionGateTrace({
    structureState:'intact',
    pullbackState:'near_50ma',
    rawPullbackState:'none',
    canonicalPullbackState:'near_50ma',
    setupLocationState:'off_level',
    stabilisationState:'early',
    bounceState:'attempt',
    planStateKey:'valid',
    hasPriceablePlanValues:true,
    hasClearInvalidationLevel:true,
    hasEntry:true,
    hasStop:true,
    hasTarget:true,
    riskTooWide:false,
    stopDistanceTooWide:false,
    hardBlockers:false,
    tradeStructureClearEnough:true,
    rr:1.9,
    priceBelow50MA:false,
    reclaimAttempt:false,
    pullbackValid:true
  });
  if(recent50maTrace.gate_pullback_zone_ok_for_near !== true
    || recent50maTrace.audit_pullback_zone !== 'near_50ma'
    || recent50maTrace.audit_pullback_zone_raw !== 'none'){
    throw new Error('Recent 50MA defences must preserve canonical near_50ma pullback authority.');
  }
}

function runDiagnosticsAndSnapshotAssertions(appSource, appSandbox){
  if(!/canonical_pullback_state:String\(resolved\.canonicalPullbackState \|\| ''\)/.test(appSource)
    || !/pullback_validity_source:String\(resolved\.pullbackValiditySource \|\| ''\)/.test(appSource)
    || !/reconciliation_reason:String\(resolved\.reconciliationReason \|\| ''\)/.test(appSource)){
    throw new Error('Verdict-cap/stored audit rows must export canonical pullback diagnostics.');
  }
  if(!/const trackState = buildTrackDiagnosticSnapshot\(liveRecord\);/.test(appSource)
    || !/canonicalContract:safeDiagnosticClone\(canonicalContract \|\| \{\}, \{\}\)/.test(appSource)){
    throw new Error('Replay snapshot builder must carry canonical contract and track diagnostic authority.');
  }

  const diagnosticSandbox = {
    console,
    currentReviewDiagnosticRecord(){
      return {ticker:'CARR'};
    },
    currentTesterId(){ return 'tester'; },
    currentBuildVersion(){ return 'test-build'; },
    activeWorkspaceTab(){ return 'track'; },
    currentVisibleReviewDiagnostics(){ return {}; },
    currentReviewStateHealthSnapshot(){ return {}; },
    currentPaperTradeDebugSnapshotForTicker(){ return null; },
    currentPolicyDiagnostics(){ return {}; },
    currentPaperGatewayDiagnostics(){ return {}; },
    buildTrackDiagnosticSnapshot(){
      return {
        canonical_pullback_state:'near_20ma',
        raw_pullback_zone:'none',
        reconciliation_reason:'bounce_positive_near_20ma',
        support_interaction_state:'active_20ma_support',
        current_location_state:'off_level',
        pullback_validity_source:'reconciled_recent_support_response'
      };
    },
    redactDiagnosticPayload(value){
      return value;
    },
    normalizeTicker(value){
      return String(value || '').trim().toUpperCase();
    },
    getTickerRecord(){
      return {
        ticker:'CARR',
        meta:{},
        marketData:{},
        setup:{},
        plan:{},
        scan:{},
        review:{analysisState:{normalized:null}, manualReview:null}
      };
    },
    normalizeTickerRecordReadOnly,
    uiState:{activeReviewSourceProjectionSnapshot:null, activeReviewProjectionSource:''},
    safeDiagnosticClone(value, fallback){
      if(value === undefined || value === null) return fallback;
      return JSON.parse(JSON.stringify(value));
    },
    normalizeReviewProjectionSource(value){
      return String(value || '').trim().toLowerCase();
    },
    currentReviewStateHealthSnapshot(){
      return {
        canonicalVerdict:'watch',
        visualBucket:'monitor',
        contract:{
          canonicalPullbackState:'near_20ma'
        },
        renderModels:{
          review:{canonicalVerdict:'watch', visualBucket:'monitor'},
          track:{canonicalVerdict:'watch', visualBucket:'monitor', visibleBucket:'monitor'}
        }
      };
    },
    withReviewProjectionSuppressed(fn){
      return fn();
    },
    resolveSimplifiedStateForSurface(){
      return {canonicalVerdict:'watch', visualBucket:'monitor', setupScore:5};
    },
    authoritativeScanSurfaceSnapshot(){
      return {canonicalVerdict:'watch', visualBucket:'monitor'};
    },
    normalizeGlobalVerdictKey(value){
      const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
      if(['entry','near_entry','watch','avoid'].includes(safe)) return safe;
      return 'watch';
    },
    normalizeVisualBucketForPairing(value, canonicalVerdict = ''){
      const safe = String(value || '').trim().toLowerCase();
      if(['entry','near_entry','monitor','diminishing','avoid'].includes(safe)) return safe;
      if(canonicalVerdict === 'entry') return 'entry';
      if(canonicalVerdict === 'near_entry') return 'near_entry';
      if(canonicalVerdict === 'avoid') return 'avoid';
      return 'monitor';
    },
    setupScoreForRecord(){ return 5; }
  };
  vm.createContext(diagnosticSandbox);
  vm.runInContext(extractFunctionSource(appSource, 'buildTesterDiagnosticSnapshot'), diagnosticSandbox, {filename:'app.js#buildTesterDiagnosticSnapshot'});
  vm.runInContext(extractFunctionSource(appSource, 'buildReplaySnapshotForTicker'), diagnosticSandbox, {filename:'app.js#buildReplaySnapshotForTicker'});

  const trackBundle = diagnosticSandbox.buildTesterDiagnosticSnapshot({bundleMode:'track_tester_bundle', trackTicker:'CARR'});
  if(!trackBundle.sections
    || !trackBundle.sections.track
    || trackBundle.sections.track.canonical_pullback_state !== 'near_20ma'
    || trackBundle.sections.track.raw_pullback_zone !== 'none'){
    throw new Error('Track tester diagnostics must carry canonical pullback authority fields.');
  }

  const replaySnapshot = diagnosticSandbox.buildReplaySnapshotForTicker({ticker:'CARR', meta:{}, marketData:{}, setup:{}, plan:{}, scan:{}, review:{}});
  if(!replaySnapshot
    || !replaySnapshot.canonicalContract
    || replaySnapshot.canonicalContract.canonicalPullbackState !== 'near_20ma'){
    throw new Error('Replay snapshot must preserve canonical pullback state from canonical contract authority.');
  }
}

function main(){
  const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const resolverCore = loadResolverCore();
  const appSandbox = loadAppPullbackSandbox(appSource);

  runCanonicalPullbackParityAssertions(appSandbox, resolverCore);
  runReviewAuthorityAssertions(appSandbox);
  runPromotionGateAssertions(appSandbox);
  runDiagnosticsAndSnapshotAssertions(appSource, appSandbox);

  console.log('Pullback authority assertions passed.');
}

main();
