const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

function extractFunctionSource(source, functionName){
  const start = source.indexOf(`function ${functionName}`);
  if(start < 0) throw new Error(`Unable to find ${functionName} in app.js.`);
  const paramsStart = source.indexOf('(', start);
  let paramsDepth = 0;
  let paramsEnd = -1;
  for(let index = paramsStart; index < source.length; index += 1){
    const char = source[index];
    if(char === '(') paramsDepth += 1;
    else if(char === ')'){
      paramsDepth -= 1;
      if(paramsDepth === 0){
        paramsEnd = index;
        break;
      }
    }
  }
  const bodyStart = source.indexOf('{', paramsEnd);
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

function loadSimplifiedPlanState(rootDir){
  const sandbox = {window:{}};
  sandbox.globalThis = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(rootDir, 'js/domain/simplified-plan-state.js'), 'utf8'), sandbox, {
    filename:'js/domain/simplified-plan-state.js'
  });
  return sandbox.window.SimplifiedPlanState;
}

function loadAppHarness(rootDir){
  const source = fs.readFileSync(path.join(rootDir, 'app.js'), 'utf8');
  const simplifiedPlanState = loadSimplifiedPlanState(rootDir);
  const sandbox = {
    console,
    window:{},
    globalThis:null,
    numericOrNull(value){
      if(value === null || value === undefined) return null;
      if(typeof value === 'string' && value.trim() === '') return null;
      const number = Number(value);
      return Number.isFinite(number) ? number : null;
    },
    normalizeStoredPlanSnapshot(plan = {}){
      return {
        entry:String(plan.entry ?? ''),
        stop:String(plan.stop ?? ''),
        firstTarget:String(plan.firstTarget ?? ''),
        status:String(plan.status || ''),
        tradeability:String(plan.tradeability || ''),
        riskStatus:String(plan.riskStatus || ''),
        blockedReason:String(plan.blockedReason || '')
      };
    },
    appendWatchlistDebugEvent(){},
    setStatus(){},
    escapeHtml(value){ return String(value || ''); },
    activeReviewTicker(){ return ''; },
    globalVerdictLabel(value){ return String(value || ''); },
    currentRiskSettings(){
      return {account_size:4000, risk_percent:1, max_loss_override:40, whole_shares_only:true};
    },
    evaluateRewardRisk(entry, stop, firstTarget){
      const riskPerShare = Number(entry) - Number(stop);
      const rewardPerShare = Number(firstTarget) - Number(entry);
      return {
        valid:Number.isFinite(riskPerShare) && Number.isFinite(rewardPerShare) && riskPerShare > 0 && rewardPerShare > 0,
        riskPerShare,
        rewardPerShare,
        rrRatio:rewardPerShare / riskPerShare
      };
    },
    evaluateRiskFit({entry, stop}){
      const riskPerShare = Number(entry) - Number(stop);
      return riskPerShare > 0
        ? {position_size:Math.floor(40 / riskPerShare), max_loss:40, risk_status:'fits_risk'}
        : {position_size:0, max_loss:40, risk_status:'invalid_plan'};
    },
    normalizeQuoteCurrency(value){ return String(value || '').trim().toUpperCase(); },
    evaluateCapitalFit({entry, position_size, quote_currency}){
      const positionCost = Number(entry) * Number(position_size || 0);
      return {
        capital_fit:positionCost <= 4000 ? 'ideal' : 'too_heavy',
        capital_note:'',
        position_cost:positionCost,
        position_cost_gbp:positionCost,
        quote_currency:String(quote_currency || 'USD')
      };
    },
    currentAccountSizeGbp(){ return 4000; },
    normalizeExitMode(value){ return value || 'fixed_target'; },
    currentMaxLoss(){ return 40; },
    deriveTradeability(status, riskStatus, capitalFit){
      return status === 'valid' && riskStatus === 'fits_risk' && !['too_heavy','too_expensive'].includes(String(capitalFit || '').toLowerCase()) ? 'tradable' : 'invalid';
    },
    deriveAffordability(){ return 'affordable'; },
    deriveExecutionPlanState(){
      return {
        targetReviewState:'not_near_target',
        targetActionRecommendation:'',
        targetAlertLevel:null
      };
    },
    resolvePlanSource(_record, _candidate, requestedSource){
      return String(requestedSource || '');
    },
    applyLifecycleStageFromPlan(){},
    watchlistRefreshStructureGate(){
      return {
        refresh_demote_reason:'Structurally alive; keep on monitor.',
        structural_alive_at_refresh:true,
        avoid_allowed_by_structure_gate:false,
        explicit_invalidation_reason:'',
        lifecycle_drop_reason:''
      };
    },
    uiState:{watchlistLifecycleRunning:false},
    resolveGlobalVerdict(record){
      return record._globalVerdict || {};
    },
    analysisDerivedStatesFromRecord(record){
      return record && record.derivedStates ? record.derivedStates : {};
    },
    normalizeGlobalVerdictKey(value){
      const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
      if(safe === 'monitor') return 'watch';
      if(safe === 'diminishing') return 'watch';
      if(safe === 'dead') return 'avoid';
      return safe || 'watch';
    }
  };
  sandbox.deriveCurrentPlanState = function(entry, stop, target, currency){
    const derived = simplifiedPlanState.deriveCurrentPlanState({
      marketData:{currency:currency || 'USD'},
      plan:{entry, stop, firstTarget:target, source:'scanner_estimate'}
    }, null, {
      account_size:4000,
      risk_percent:1,
      max_loss_override:40,
      whole_shares_only:true
    }, {
      PlanMath:{
        evaluateRewardRisk(entryValue, stopValue, targetValue){
          const riskPerShare = Number(entryValue) - Number(stopValue);
          const rewardPerShare = Number(targetValue) - Number(entryValue);
          return {
            valid:Number.isFinite(riskPerShare) && Number.isFinite(rewardPerShare) && riskPerShare > 0 && rewardPerShare > 0,
            riskPerShare,
            rewardPerShare,
            rrRatio:rewardPerShare / riskPerShare,
            rrState:(rewardPerShare / riskPerShare) >= 2 ? 'strong' : 'weak'
          };
        },
        evaluateCapitalFit({entry:entryValue, position_size, account_size_gbp, quote_currency}){
          return {
            capital_fit:(Number(entryValue) * Number(position_size || 0)) <= Number(account_size_gbp || 0) ? 'ideal' : 'too_heavy',
            capital_ok:(Number(entryValue) * Number(position_size || 0)) <= Number(account_size_gbp || 0),
            position_cost:Number(entryValue) * Number(position_size || 0),
            position_cost_gbp:Number(entryValue) * Number(position_size || 0),
            capital_usage_pct:(Number(entryValue) * Number(position_size || 0)) / Number(account_size_gbp || 1),
            quote_currency:quote_currency || 'USD'
          };
        },
        deriveAffordability(){ return 'affordable'; },
        convertQuoteValueToGbp(value){ return value; },
        classifyCapitalUsage(){ return {capital_fit:'ideal'}; }
      }
    });
    if(sandbox.__derivedPlanOverrides){
      Object.assign(derived, sandbox.__derivedPlanOverrides);
    }
    return derived;
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  [
    'canonicalTradePlanAuthorityVersion',
    'stampCanonicalTradePlan',
    'applyPlanCandidateToRecord',
    'scannerEstimateAuthorityReasonPriority',
    'scannerEstimateAuthorityReasonFromText',
    'resolveScannerEstimateStructuredAuthorityCode',
    'isCurrentTechnicalInvalidation',
    'scannerEstimateBlockedPlanSnapshotRecord',
    'resolveCurrentScannerEstimatePlanBlockers',
    'resolveScannerEstimatePlanAuthority',
    'blockedScannerEstimatePlanSnapshot',
    'applyGlobalVerdictGates'
  ].forEach(name => {
    vm.runInContext(extractFunctionSource(source, name), sandbox, {filename:`app.js#${name}`});
  });
  return sandbox;
}

function run(){
  const rootDir = path.resolve(__dirname, '..');
  const sandbox = loadAppHarness(rootDir);

  const trowLikeRecord = {
    ticker:'TROW',
    marketData:{currency:'USD'},
    lifecycle:{stage:'reviewed', status:'active'},
    plan:{
      entry:110.27,
      stop:102.29422,
      firstTarget:136.191285,
      source:'scanner_estimate',
      hasValidPlan:false,
      status:'invalid',
      tradeability:'invalid',
      riskStatus:'plan_blocked',
      planValidationState:'needs_replan',
      triggerState:'missed',
      missedState:'stale watchlist blocker',
      blockedReason:'Strong trend, but no usable pullback setup yet. Wait for a cleaner reset near support.',
      firstTargetTooClose:false
    },
    watchlist:{debug:{}},
    _globalVerdict:{
      allow_plan:true,
      final_verdict:'entry',
      reason:'',
      downgrade_reason:'',
      priceability_state:'priceable',
      plan_status:'valid',
      planStatusKey:'valid',
      unpriceableBlockReason:'',
      terminal_avoid_applied:false
    }
  };

  const beforeTrow = {...trowLikeRecord.plan};
  sandbox.applyGlobalVerdictGates(trowLikeRecord, {source:'focus'});
  const trowAuthority = sandbox.resolveScannerEstimatePlanAuthority(trowLikeRecord, trowLikeRecord._globalVerdict, sandbox.deriveCurrentPlanState(
    trowLikeRecord.plan.entry,
    trowLikeRecord.plan.stop,
    trowLikeRecord.plan.firstTarget,
    trowLikeRecord.marketData.currency
  ));
  assert(beforeTrow.status === 'invalid' && trowLikeRecord.plan.status === 'valid', 'Expected recovery branch to clear stale invalid status.');
  assert(beforeTrow.blockedReason && trowLikeRecord.plan.blockedReason === '', 'Expected recovery branch to clear stale blockedReason.');
  assert(trowAuthority.mode === 'recover', `Expected shared authority helper to classify TROW as recover, got ${trowAuthority.mode}.`);
  assert(trowLikeRecord.watchlist.debug.scanner_estimate_authority_mode === 'recover', `Expected watchlist debug recovery marker, got ${trowLikeRecord.watchlist.debug.scanner_estimate_authority_mode}.`);
  assert(trowLikeRecord.plan.status === 'valid', `Expected scanner_estimate plan to remain valid, got ${trowLikeRecord.plan.status}.`);
  assert(trowLikeRecord.plan.tradeability === 'tradable', `Expected tradeability to remain tradable, got ${trowLikeRecord.plan.tradeability}.`);
  assert(trowLikeRecord.plan.riskStatus === 'fits_risk', `Expected riskStatus to remain fits_risk, got ${trowLikeRecord.plan.riskStatus}.`);
  assert(trowLikeRecord.plan.capitalFit === 'ideal', `Expected refreshed capitalFit to come from canonical writer, got ${trowLikeRecord.plan.capitalFit}.`);
  assert(trowLikeRecord.plan.capitalNote === '', `Expected refreshed capital note to match derived canonical plan state, got ${trowLikeRecord.plan.capitalNote}.`);
  assert(trowLikeRecord.plan.planValidationState === '', `Expected planValidationState to stay clear, got ${trowLikeRecord.plan.planValidationState}.`);
  assert(trowLikeRecord.plan.triggerState === '', `Expected stale triggerState to clear, got ${trowLikeRecord.plan.triggerState}.`);
  assert(trowLikeRecord.plan.missedState === '', `Expected stale missedState to clear, got ${trowLikeRecord.plan.missedState}.`);
  assert(trowLikeRecord.plan.blockedReason === '', `Expected blockedReason to stay clear, got ${trowLikeRecord.plan.blockedReason}.`);
  assert(trowLikeRecord.plan.authorityReason === 'scanner_estimate_reference_refresh', `Expected refreshed scanner-estimate plan to keep explicit non-review authorityReason, got ${trowLikeRecord.plan.authorityReason}.`);
  assert(trowLikeRecord.plan.writtenBy === 'applyGlobalVerdictGates', `Expected refreshed scanner-estimate plan to keep stamped writtenBy, got ${trowLikeRecord.plan.writtenBy}.`);
  assert(trowLikeRecord.plan.candidateSource === 'scanner_estimate', `Expected refreshed scanner-estimate plan to keep stamped candidateSource, got ${trowLikeRecord.plan.candidateSource}.`);
  assert(!trowLikeRecord.plan.recoverySource, 'Recovery must not persist transient recoverySource on the plan.');

  const blockedSnapshot = sandbox.blockedScannerEstimatePlanSnapshot({
    marketData:{currency:'USD'},
    lifecycle:{stage:'reviewed', status:'active'},
    plan:{
      entry:110.27,
      stop:102.29422,
      firstTarget:136.191285,
      source:'scanner_estimate',
      status:'invalid',
      tradeability:'invalid',
      riskStatus:'plan_blocked',
      blockedReason:'',
      firstTargetTooClose:false
    },
    _globalVerdict:{
      allow_plan:true,
      final_verdict:'entry',
      priceability_state:'priceable',
      terminal_avoid_applied:false
    }
  });
  assert(blockedSnapshot === null, 'Soft-blocked valid scanner_estimate plan should not be captured as an authoritative blocked snapshot.');

  const missedLikeRecord = {
    ticker:'MISS',
    marketData:{currency:'USD'},
    lifecycle:{stage:'expired', status:'closed'},
    plan:{
      entry:110.27,
      stop:102.29422,
      firstTarget:136.191285,
      source:'scanner_estimate',
      hasValidPlan:false,
      status:'invalid',
      tradeability:'invalid',
      riskStatus:'plan_blocked',
      planValidationState:'missed',
      triggerState:'missed',
      missedState:'target slipped',
      blockedReason:'Setup already missed.',
      firstTargetTooClose:false
    },
    watchlist:{debug:{}},
    terminal_avoid_applied:true,
    _globalVerdict:{
      allow_plan:false,
      final_verdict:'watch',
      reason:'Setup already missed.',
      downgrade_reason:'Setup already missed.',
      priceability_state:'priceable',
      plan_status:'valid',
      planStatusKey:'valid',
      unpriceableBlockReason:'',
      terminal_avoid_applied:true
    }
  };
  sandbox.applyGlobalVerdictGates(missedLikeRecord, {source:'focus'});
  const missedAuthority = sandbox.resolveScannerEstimatePlanAuthority(missedLikeRecord, missedLikeRecord._globalVerdict, sandbox.deriveCurrentPlanState(
    missedLikeRecord.plan.entry,
    missedLikeRecord.plan.stop,
    missedLikeRecord.plan.firstTarget,
    missedLikeRecord.marketData.currency
  ));
  assert(missedLikeRecord.plan.status === 'invalid', `Expected missed scanner_estimate plan to remain invalid, got ${missedLikeRecord.plan.status}.`);
  assert(missedLikeRecord.plan.tradeability === 'invalid', `Expected missed scanner_estimate tradeability to remain invalid, got ${missedLikeRecord.plan.tradeability}.`);
  assert(missedLikeRecord.plan.riskStatus === 'plan_blocked', `Expected missed scanner_estimate riskStatus to remain plan_blocked, got ${missedLikeRecord.plan.riskStatus}.`);
  assert(missedLikeRecord.plan.planValidationState === 'needs_replan' || missedLikeRecord.plan.planValidationState === 'missed', `Expected missed scanner_estimate planValidationState to remain blocked, got ${missedLikeRecord.plan.planValidationState}.`);
  assert(missedLikeRecord.plan.blockedReason === 'Setup already missed.', `Expected missed scanner_estimate blockedReason to remain, got ${missedLikeRecord.plan.blockedReason}.`);
  assert(missedAuthority.mode === 'blocked', `Expected missed scanner_estimate to stay blocked, got ${missedAuthority.mode}.`);
  assert(missedAuthority.reasonCode === 'expired', `Expected expired lifecycle to remain the authoritative reasonCode, got ${missedAuthority.reasonCode}.`);
  assert(missedLikeRecord.watchlist.debug.scanner_estimate_authority_mode === 'blocked', `Expected blocked debug marker, got ${missedLikeRecord.watchlist.debug.scanner_estimate_authority_mode}.`);
  assert(!missedLikeRecord.plan.recoverySource, 'Negative case must not hit scanner_estimate recovery branch.');

  const missedBlockedSnapshot = sandbox.blockedScannerEstimatePlanSnapshot(missedLikeRecord);
  assert(!!missedBlockedSnapshot, 'Non-actionable missed scanner_estimate plan should preserve a blocked diagnostic snapshot.');
  assert(missedBlockedSnapshot.planValidationState === 'missed', `Expected blocked snapshot to preserve planValidationState, got ${missedBlockedSnapshot.planValidationState}.`);
  assert(missedBlockedSnapshot.triggerState === 'missed', `Expected blocked snapshot to preserve triggerState, got ${missedBlockedSnapshot.triggerState}.`);
  assert(missedBlockedSnapshot.missedState === 'target slipped', `Expected blocked snapshot to preserve missedState, got ${missedBlockedSnapshot.missedState}.`);
  assert(missedBlockedSnapshot.riskStatus === 'plan_blocked', `Expected blocked snapshot to preserve riskStatus, got ${missedBlockedSnapshot.riskStatus}.`);
  assert(missedBlockedSnapshot.tradeability === 'invalid', `Expected blocked snapshot to preserve tradeability, got ${missedBlockedSnapshot.tradeability}.`);

  const targetTooCloseRecord = {
    ticker:'TTC',
    marketData:{currency:'USD'},
    lifecycle:{stage:'reviewed', status:'active'},
    plan:{
      entry:100,
      stop:96,
      firstTarget:105,
      source:'scanner_estimate',
      hasValidPlan:true,
      status:'valid',
      tradeability:'tradable',
      riskStatus:'fits_risk',
      planValidationState:'',
      triggerState:'waiting_for_trigger',
      blockedReason:'',
      firstTargetTooClose:true
    },
    watchlist:{debug:{}},
    _globalVerdict:{
      allow_plan:true,
      final_verdict:'near_entry',
      reason:'',
      downgrade_reason:'',
      priceability_state:'priceable',
      plan_status:'valid',
      planStatusKey:'valid',
      terminal_avoid_applied:false
    }
  };
  sandbox.applyGlobalVerdictGates(targetTooCloseRecord, {source:'focus'});
  const targetTooCloseAuthority = sandbox.resolveScannerEstimatePlanAuthority(targetTooCloseRecord, targetTooCloseRecord._globalVerdict, sandbox.deriveCurrentPlanState(
    targetTooCloseRecord.plan.entry,
    targetTooCloseRecord.plan.stop,
    targetTooCloseRecord.plan.firstTarget,
    targetTooCloseRecord.marketData.currency
  ));
  assert(targetTooCloseAuthority.mode === 'blocked', `Expected target-too-close authority to block, got ${targetTooCloseAuthority.mode}.`);
  assert(targetTooCloseAuthority.reasonCode === 'target_too_close', `Expected target-too-close reasonCode, got ${targetTooCloseAuthority.reasonCode}.`);
  assert(targetTooCloseRecord.plan.status === 'invalid', `Expected target-too-close plan status invalid, got ${targetTooCloseRecord.plan.status}.`);
  assert(targetTooCloseRecord.plan.blockedReasonCode === 'target_too_close', `Expected target-too-close blockedReasonCode, got ${targetTooCloseRecord.plan.blockedReasonCode}.`);
  const targetTooCloseSnapshot = sandbox.blockedScannerEstimatePlanSnapshot(targetTooCloseRecord);
  assert(!!targetTooCloseSnapshot, 'Target-too-close snapshot should be preserved until the blocker clears.');
  assert(targetTooCloseSnapshot.firstTargetTooClose === true, 'Target-too-close snapshot must preserve firstTargetTooClose for diagnostics.');

  sandbox.__derivedPlanOverrides = {
    planValidationState:'missed',
    triggerState:'missed'
  };
  const currentPlanBlockedRecord = {
    ticker:'CURBLOCK',
    marketData:{currency:'USD'},
    lifecycle:{stage:'reviewed', status:'active'},
    plan:{
      entry:110.27,
      stop:102.29422,
      firstTarget:136.191285,
      source:'scanner_estimate',
      hasValidPlan:false,
      status:'invalid',
      tradeability:'invalid',
      riskStatus:'plan_blocked',
      planValidationState:'missed',
      triggerState:'missed',
      missedState:'current missed trigger',
      blockedReason:'Missed trigger.',
      firstTargetTooClose:false
    },
    watchlist:{debug:{}},
    _globalVerdict:{
      allow_plan:true,
      final_verdict:'entry',
      reason:'',
      downgrade_reason:'',
      priceability_state:'priceable',
      plan_status:'valid',
      planStatusKey:'valid',
      unpriceableBlockReason:'',
      terminal_avoid_applied:false
    }
  };
  sandbox.applyGlobalVerdictGates(currentPlanBlockedRecord, {source:'focus'});
  const currentPlanBlockedAuthority = sandbox.resolveScannerEstimatePlanAuthority(currentPlanBlockedRecord, currentPlanBlockedRecord._globalVerdict, sandbox.deriveCurrentPlanState(
    currentPlanBlockedRecord.plan.entry,
    currentPlanBlockedRecord.plan.stop,
    currentPlanBlockedRecord.plan.firstTarget,
    currentPlanBlockedRecord.marketData.currency
  ));
  assert(currentPlanBlockedAuthority.mode === 'blocked', `Expected corroborated current plan blocker to stay blocked, got ${currentPlanBlockedAuthority.mode}.`);
  assert(currentPlanBlockedAuthority.reasonCode === 'missed', `Expected corroborated current plan blocker reasonCode missed, got ${currentPlanBlockedAuthority.reasonCode}.`);
  assert(currentPlanBlockedRecord.plan.planValidationState === 'missed', `Expected corroborated planValidationState to remain, got ${currentPlanBlockedRecord.plan.planValidationState}.`);
  assert(currentPlanBlockedRecord.plan.triggerState === 'missed', `Expected corroborated triggerState to remain, got ${currentPlanBlockedRecord.plan.triggerState}.`);
  assert(currentPlanBlockedRecord.plan.missedState === 'current missed trigger', `Expected corroborated missedState to remain, got ${currentPlanBlockedRecord.plan.missedState}.`);
  sandbox.__derivedPlanOverrides = null;

  const informationalReasonRecoveryRecord = {
    ticker:'PLANCLR',
    marketData:{currency:'USD'},
    lifecycle:{stage:'reviewed', status:'active'},
    plan:{
      entry:110.27,
      stop:102.29422,
      firstTarget:136.191285,
      source:'scanner_estimate',
      hasValidPlan:false,
      status:'invalid',
      tradeability:'invalid',
      riskStatus:'plan_blocked',
      planValidationState:'missed',
      triggerState:'missed',
      missedState:'stale contradicted blocker',
      blockedReason:'Old missed state.',
      firstTargetTooClose:false
    },
    watchlist:{debug:{}},
    _globalVerdict:{
      allow_plan:true,
      final_verdict:'entry',
      reason:'setup_pending_review',
      downgrade_reason:'',
      priceability_state:'priceable',
      plan_status:'valid',
      planStatusKey:'valid',
      unpriceableBlockReason:'',
      terminal_avoid_applied:false
    }
  };
  sandbox.applyGlobalVerdictGates(informationalReasonRecoveryRecord, {source:'focus'});
  const informationalReasonRecoveryAuthority = sandbox.resolveScannerEstimatePlanAuthority(informationalReasonRecoveryRecord, informationalReasonRecoveryRecord._globalVerdict, sandbox.deriveCurrentPlanState(
    informationalReasonRecoveryRecord.plan.entry,
    informationalReasonRecoveryRecord.plan.stop,
    informationalReasonRecoveryRecord.plan.firstTarget,
    informationalReasonRecoveryRecord.marketData.currency
  ));
  assert(informationalReasonRecoveryAuthority.mode === 'recover', `Expected informational reason to still allow recovery, got ${informationalReasonRecoveryAuthority.mode}.`);
  assert(informationalReasonRecoveryRecord.plan.planValidationState === '', `Expected informational reason recovery to clear planValidationState, got ${informationalReasonRecoveryRecord.plan.planValidationState}.`);
  assert(informationalReasonRecoveryRecord.plan.triggerState === '', `Expected informational reason recovery to clear triggerState, got ${informationalReasonRecoveryRecord.plan.triggerState}.`);
  assert(informationalReasonRecoveryRecord.plan.missedState === '', `Expected informational reason recovery to clear missedState, got ${informationalReasonRecoveryRecord.plan.missedState}.`);

  [
    'previous invalidation cleared by current resolver',
    'broken resistance reclaimed',
    'missed pullback recovered',
    'stale snapshot ignored',
    'prior breach repaired'
  ].forEach((reasonText, index) => {
    const benignReasonRecord = {
      ticker:`PROSE${index}`,
      marketData:{currency:'USD'},
      lifecycle:{stage:'reviewed', status:'active'},
      plan:{
        entry:110.27,
        stop:102.29422,
        firstTarget:136.191285,
        source:'scanner_estimate',
        hasValidPlan:false,
        status:'invalid',
        tradeability:'invalid',
        riskStatus:'plan_blocked',
        planValidationState:'missed',
        triggerState:'missed',
        missedState:'stale blocker metadata',
        invalidatedState:'',
        blockedReason:'Old stale block',
        blockedReasonCode:'missed',
        firstTargetTooClose:false
      },
      watchlist:{debug:{}},
      _globalVerdict:{
        allow_plan:true,
        final_verdict:'entry',
        reason:reasonText,
        downgrade_reason:'',
        priceability_state:'priceable',
        plan_status:'valid',
        planStatusKey:'valid',
        unpriceableBlockReason:'',
        terminal_avoid_applied:false
      }
    };
    sandbox.applyGlobalVerdictGates(benignReasonRecord, {source:'focus'});
    const benignReasonAuthority = sandbox.resolveScannerEstimatePlanAuthority(benignReasonRecord, benignReasonRecord._globalVerdict, sandbox.deriveCurrentPlanState(
      benignReasonRecord.plan.entry,
      benignReasonRecord.plan.stop,
      benignReasonRecord.plan.firstTarget,
      benignReasonRecord.marketData.currency
    ));
    assert(benignReasonAuthority.mode === 'recover', `Expected benign prose to recover for "${reasonText}", got ${benignReasonAuthority.mode}.`);
    assert(!benignReasonAuthority.reasonCode || benignReasonAuthority.reasonCode === 'unknown', `Expected no blocker reasonCode from benign prose "${reasonText}", got ${benignReasonAuthority.reasonCode}.`);
    assert(benignReasonRecord.plan.planValidationState === '', `Expected benign prose recovery to clear planValidationState for "${reasonText}", got ${benignReasonRecord.plan.planValidationState}.`);
    assert(benignReasonRecord.plan.triggerState === '', `Expected benign prose recovery to clear triggerState for "${reasonText}", got ${benignReasonRecord.plan.triggerState}.`);
    assert(benignReasonRecord.plan.missedState === '', `Expected benign prose recovery to clear missedState for "${reasonText}", got ${benignReasonRecord.plan.missedState}.`);
  });

  const staleBlockedReasonRecord = {
    ticker:'STALECODE',
    marketData:{currency:'USD'},
    lifecycle:{stage:'reviewed', status:'active'},
    plan:{
      entry:110.27,
      stop:102.29422,
      firstTarget:136.191285,
      source:'scanner_estimate',
      hasValidPlan:false,
      status:'invalid',
      tradeability:'invalid',
      riskStatus:'plan_blocked',
      planValidationState:'',
      triggerState:'',
      missedState:'',
      invalidatedState:'',
      blockedReason:'Missed trigger.',
      blockedReasonCode:'missed',
      firstTargetTooClose:false
    },
    watchlist:{debug:{}},
    _globalVerdict:{
      allow_plan:true,
      final_verdict:'entry',
      reason:'',
      downgrade_reason:'',
      priceability_state:'priceable',
      plan_status:'valid',
      planStatusKey:'valid',
      unpriceableBlockReason:'',
      terminal_avoid_applied:false
    }
  };
  sandbox.applyGlobalVerdictGates(staleBlockedReasonRecord, {source:'focus'});
  const staleBlockedReasonAuthority = sandbox.resolveScannerEstimatePlanAuthority(staleBlockedReasonRecord, staleBlockedReasonRecord._globalVerdict, sandbox.deriveCurrentPlanState(
    staleBlockedReasonRecord.plan.entry,
    staleBlockedReasonRecord.plan.stop,
    staleBlockedReasonRecord.plan.firstTarget,
    staleBlockedReasonRecord.marketData.currency
  ));
  assert(staleBlockedReasonAuthority.mode === 'recover', `Expected stale stored blocked reason/code to recover, got ${staleBlockedReasonAuthority.mode}.`);
  assert(staleBlockedReasonRecord.plan.status === 'valid', `Expected stale stored blocked reason/code status valid, got ${staleBlockedReasonRecord.plan.status}.`);
  assert(staleBlockedReasonRecord.plan.blockedReason === '', `Expected stale stored blocked reason to clear, got ${staleBlockedReasonRecord.plan.blockedReason}.`);
  assert(staleBlockedReasonRecord.plan.blockedReasonCode === '', `Expected stale stored blocked reason code to clear, got ${staleBlockedReasonRecord.plan.blockedReasonCode}.`);

  const genericReasonCodeRecord = {
    ticker:'GENCODE',
    marketData:{currency:'USD'},
    lifecycle:{stage:'watchlist', status:'active'},
    plan:{
      entry:110.27,
      stop:102.29,
      firstTarget:136.19,
      source:'scanner_estimate',
      hasValidPlan:false,
      status:'invalid',
      tradeability:'invalid',
      riskStatus:'plan_blocked',
      planValidationState:'pending_validation',
      triggerState:'waiting_for_trigger',
      missedState:'',
      invalidatedState:'',
      blockedReason:'Old generic invalidation',
      blockedReasonCode:'invalidated',
      firstTargetTooClose:false
    },
    watchlist:{debug:{}},
    _globalVerdict:{
      allow_plan:true,
      final_verdict:'entry',
      reason:'Repair is forming but the setup is not priceable yet.',
      downgrade_reason:'Strong trend, but no usable pullback setup yet. Wait for a cleaner reset near support.',
      reasonCode:'technical_invalidation',
      downgrade_reason_code:'technical_invalidation',
      unpriceable_reason_code:'technical_invalidation',
      blockerCode:'bounce_not_priceable',
      priceability_state:'priceable',
      plan_status:'valid',
      planStatusKey:'valid',
      unpriceableBlockReason:'',
      terminal_avoid_applied:false,
      explicit_invalidation_reason:'',
      explicit_invalidation_reason_code:''
    }
  };
  sandbox.applyGlobalVerdictGates(genericReasonCodeRecord, {source:'focus'});
  const genericReasonCodeAuthority = sandbox.resolveScannerEstimatePlanAuthority(genericReasonCodeRecord, genericReasonCodeRecord._globalVerdict, sandbox.deriveCurrentPlanState(
    genericReasonCodeRecord.plan.entry,
    genericReasonCodeRecord.plan.stop,
    genericReasonCodeRecord.plan.firstTarget,
    genericReasonCodeRecord.marketData.currency
  ));
  assert(genericReasonCodeAuthority.mode === 'recover', `Expected generic resolver reason codes to stay non-authoritative, got ${genericReasonCodeAuthority.mode}.`);
  assert(genericReasonCodeAuthority.reasonCode === 'unknown', `Expected no specific blocker reasonCode from generic resolver codes, got ${genericReasonCodeAuthority.reasonCode}.`);
  assert(genericReasonCodeRecord.plan.status === 'valid', `Expected generic resolver-code record to recover status valid, got ${genericReasonCodeRecord.plan.status}.`);
  assert(genericReasonCodeRecord.plan.tradeability === 'tradable', `Expected generic resolver-code record to recover tradeability tradable, got ${genericReasonCodeRecord.plan.tradeability}.`);
  assert(genericReasonCodeRecord.plan.riskStatus === 'fits_risk', `Expected generic resolver-code record to recover riskStatus fits_risk, got ${genericReasonCodeRecord.plan.riskStatus}.`);
  assert(genericReasonCodeRecord.plan.blockedReason === '', `Expected generic resolver-code blockedReason to clear, got ${genericReasonCodeRecord.plan.blockedReason}.`);
  assert(genericReasonCodeRecord.plan.blockedReasonCode === '', `Expected generic resolver-code blockedReasonCode to clear, got ${genericReasonCodeRecord.plan.blockedReasonCode}.`);

  const focusPendingValidationRecord = {
    ticker:'FOCUSPEND',
    marketData:{currency:'USD'},
    lifecycle:{stage:'watchlist', status:'active'},
    plan:{
      entry:110.27,
      stop:102.29,
      firstTarget:136.19,
      source:'scanner_estimate',
      hasValidPlan:true,
      status:'valid',
      tradeability:'tradable',
      riskStatus:'fits_risk',
      planValidationState:'pending_validation',
      triggerState:'waiting_for_trigger',
      missedState:'',
      invalidatedState:'',
      blockedReason:'',
      blockedReasonCode:'',
      firstTargetTooClose:false
    },
    watchlist:{debug:{
      newPlan:{
        entry:'110.27',
        stop:'102.29',
        firstTarget:'136.19',
        status:'valid',
        tradeability:'tradable'
      }
    }},
    _globalVerdict:{
      allow_plan:false,
      final_verdict:'watch',
      reason:'Repair is forming but the setup is not priceable yet.',
      downgrade_reason:'Strong trend, but no usable pullback setup yet. Wait for a cleaner reset near support.',
      blockerCode:'technical_invalidation',
      priceability_state:'unpriceable',
      plan_status:'valid',
      planStatusKey:'valid',
      unpriceableBlockReason:'Developing - waiting for confirmation.',
      terminal_avoid_applied:false,
      explicit_invalidation_reason:'',
      explicit_invalidation_reason_code:''
    }
  };
  sandbox.applyGlobalVerdictGates(focusPendingValidationRecord, {source:'focus'});
  const focusPendingValidationAuthority = sandbox.resolveScannerEstimatePlanAuthority(focusPendingValidationRecord, focusPendingValidationRecord._globalVerdict, sandbox.deriveCurrentPlanState(
    focusPendingValidationRecord.plan.entry,
    focusPendingValidationRecord.plan.stop,
    focusPendingValidationRecord.plan.firstTarget,
    focusPendingValidationRecord.marketData.currency
  ));
  assert(focusPendingValidationAuthority.mode === 'blocked', `Expected focus pending-validation case to remain blocked, got ${focusPendingValidationAuthority.mode}.`);
  assert(focusPendingValidationAuthority.specificBlock === false, `Expected focus pending-validation case to stay a soft resolver block, got specificBlock=${focusPendingValidationAuthority.specificBlock}.`);
  assert(focusPendingValidationAuthority.reasonCode === 'resolver_block', `Expected focus pending-validation case to use resolver_block, got ${focusPendingValidationAuthority.reasonCode}.`);
  assert(focusPendingValidationRecord.plan.status === 'valid', `Expected focus pending-validation status to stay valid, got ${focusPendingValidationRecord.plan.status}.`);
  assert(focusPendingValidationRecord.plan.tradeability === 'tradable', `Expected focus pending-validation tradeability to stay tradable, got ${focusPendingValidationRecord.plan.tradeability}.`);
  assert(focusPendingValidationRecord.plan.riskStatus === 'fits_risk', `Expected focus pending-validation riskStatus to stay fits_risk, got ${focusPendingValidationRecord.plan.riskStatus}.`);
  assert(focusPendingValidationRecord.plan.blockedReasonCode === 'resolver_block', `Expected focus pending-validation blockedReasonCode resolver_block, got ${focusPendingValidationRecord.plan.blockedReasonCode}.`);
  assert(focusPendingValidationRecord.plan.invalidatedState === '', `Expected focus pending-validation invalidatedState to remain empty, got ${focusPendingValidationRecord.plan.invalidatedState}.`);
  assert(sandbox.blockedScannerEstimatePlanSnapshot(focusPendingValidationRecord) === null, 'Expected focus pending-validation case to avoid preserving a blocked snapshot.');

  sandbox.__derivedPlanOverrides = {
    planValidationState:'invalidated',
    triggerState:'invalidated'
  };
  const corroboratedTechnicalInvalidationRecord = {
    ticker:'TECHINV',
    marketData:{currency:'USD', price:95},
    lifecycle:{stage:'watchlist', status:'active'},
    derivedStates:{structureState:'broken', trendState:'broken'},
    plan:{
      entry:110.27,
      stop:102.29,
      firstTarget:136.19,
      source:'scanner_estimate',
      hasValidPlan:true,
      status:'valid',
      tradeability:'tradable',
      riskStatus:'fits_risk',
      planValidationState:'pending_validation',
      triggerState:'waiting_for_trigger',
      missedState:'',
      invalidatedState:'',
      blockedReason:'',
      blockedReasonCode:'',
      firstTargetTooClose:false
    },
    watchlist:{debug:{}},
    _globalVerdict:{
      allow_plan:false,
      final_verdict:'watch',
      reason:'Setup is no longer technically valid.',
      downgrade_reason:'Setup is no longer technically valid.',
      blockerCode:'technical_invalidation',
      priceability_state:'unpriceable',
      plan_status:'valid',
      planStatusKey:'valid',
      unpriceableBlockReason:'',
      terminal_avoid_applied:false,
      explicit_invalidation_reason:'',
      explicit_invalidation_reason_code:''
    }
  };
  sandbox.applyGlobalVerdictGates(corroboratedTechnicalInvalidationRecord, {source:'focus'});
  const corroboratedTechnicalInvalidationAuthority = sandbox.resolveScannerEstimatePlanAuthority(corroboratedTechnicalInvalidationRecord, corroboratedTechnicalInvalidationRecord._globalVerdict, sandbox.deriveCurrentPlanState(
    corroboratedTechnicalInvalidationRecord.plan.entry,
    corroboratedTechnicalInvalidationRecord.plan.stop,
    corroboratedTechnicalInvalidationRecord.plan.firstTarget,
    corroboratedTechnicalInvalidationRecord.marketData.currency
  ));
  assert(corroboratedTechnicalInvalidationAuthority.mode === 'blocked', `Expected corroborated technical invalidation to remain blocked, got ${corroboratedTechnicalInvalidationAuthority.mode}.`);
  assert(corroboratedTechnicalInvalidationAuthority.specificBlock === true, `Expected corroborated technical invalidation to remain a specific block, got specificBlock=${corroboratedTechnicalInvalidationAuthority.specificBlock}.`);
  assert(corroboratedTechnicalInvalidationAuthority.reasonCode === 'invalidated', `Expected corroborated technical invalidation reasonCode invalidated, got ${corroboratedTechnicalInvalidationAuthority.reasonCode}.`);
  assert(corroboratedTechnicalInvalidationRecord.plan.blockedReasonCode === 'invalidated', `Expected corroborated technical invalidation blockedReasonCode invalidated, got ${corroboratedTechnicalInvalidationRecord.plan.blockedReasonCode}.`);
  sandbox.__derivedPlanOverrides = null;

  console.log('TROW plan regressions passed.');
}

run();
