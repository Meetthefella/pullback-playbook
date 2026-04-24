function normalizeTicker(value){
  return String(value || '').trim().toUpperCase();
}

function numericOrNull(value){
  if(value == null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function stringOrEmpty(value){
  return String(value || '');
}

function isHostileMarketStatus(value){
  return /below 50 ma/i.test(String(value || ''));
}

function normalizeQuoteCurrency(value){
  const rawText = String(value || '').trim();
  if(!rawText) return '';
  const compact = rawText.replace(/\./g, '').toUpperCase();
  if(compact === 'GBP') return 'GBP';
  if(['GBX','GBPENCE','GBPX','GBP'].includes(compact) && /p$/i.test(rawText)) return 'GBX';
  if(['GBX','GBPENCE','GBPX'].includes(compact)) return 'GBX';
  return compact;
}

function convertQuoteValueToGbp(value, quoteCurrency){
  const amount = numericOrNull(value);
  const currency = normalizeQuoteCurrency(quoteCurrency);
  if(!Number.isFinite(amount)) return {gbpValue:null, conversion:'invalid'};
  if(!currency || currency === 'GBP') return {gbpValue:amount, conversion:'native'};
  if(['GBX','GBPENCE','GBPX','GBP.P'].includes(currency)) return {gbpValue:amount / 100, conversion:'pence'};
  return {gbpValue:null, conversion:'unsupported'};
}

function normalizeRiskPercent(value, fallback = 1){
  const numeric = numericOrNull(value);
  if(!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return numeric;
}

function riskPercentToFraction(value){
  const normalized = normalizeRiskPercent(value, 0);
  return normalized > 0 ? normalized / 100 : 0;
}

function currentRiskSettings(settings = {}){
  const accountSize = numericOrNull(settings.accountSize) || 4000;
  const riskPercent = normalizeRiskPercent(settings.riskPercent, 1);
  const override = numericOrNull(settings.maxLossOverride);
  return {
    account_size:accountSize,
    risk_percent:riskPercent,
    max_loss_override:override,
    whole_shares_only:settings.wholeSharesOnly !== false
  };
}

function evaluateRiskFit({entry, stop, account_size, risk_percent, max_loss_override, whole_shares_only}){
  const numericEntry = numericOrNull(entry);
  const numericStop = numericOrNull(stop);
  const accountSize = numericOrNull(account_size) || 0;
  const riskPercent = normalizeRiskPercent(risk_percent, 0);
  const override = numericOrNull(max_loss_override);
  const max_loss = Number.isFinite(override) && override > 0
    ? override
    : (accountSize > 0 && riskPercent > 0 ? accountSize * riskPercentToFraction(riskPercent) : 0);
  if(!Number.isFinite(numericEntry) || !Number.isFinite(numericStop)) return {max_loss, risk_per_share:null, position_size:0, risk_status:'plan_missing'};
  const risk_per_share = numericEntry - numericStop;
  if(!Number.isFinite(risk_per_share) || risk_per_share <= 0) return {max_loss, risk_per_share, position_size:0, risk_status:'invalid_plan'};
  let position_size = max_loss > 0 ? (whole_shares_only === false ? (max_loss / risk_per_share) : Math.floor(max_loss / risk_per_share)) : 0;
  if(!Number.isFinite(position_size) || position_size < 0) position_size = 0;
  return {
    max_loss,
    risk_per_share,
    position_size,
    risk_status:position_size >= 1 ? 'fits_risk' : 'too_wide'
  };
}

function evaluateRewardRisk(entry, stop, target){
  const numericEntry = numericOrNull(entry);
  const numericStop = numericOrNull(stop);
  const numericTarget = numericOrNull(target);
  const riskPerShare = Number.isFinite(numericEntry) && Number.isFinite(numericStop) ? numericEntry - numericStop : null;
  const rewardPerShare = Number.isFinite(numericTarget) && Number.isFinite(numericEntry) ? numericTarget - numericEntry : null;
  const valid = Number.isFinite(riskPerShare) && riskPerShare > 0 && Number.isFinite(rewardPerShare) && rewardPerShare > 0;
  return {
    valid,
    riskPerShare,
    rewardPerShare,
    rrRatio:valid ? rewardPerShare / riskPerShare : null
  };
}

function deriveAffordability(positionCost){
  const cost = numericOrNull(positionCost);
  if(!Number.isFinite(cost) || cost <= 0) return '';
  if(cost > 3200) return 'not_affordable';
  if(cost > 2500) return 'heavy_capital';
  return 'affordable';
}

function deriveCurrentPlanState(entryValue, stopValue, targetValue, quoteCurrency = '', settings = {}){
  const entry = numericOrNull(entryValue);
  const stop = numericOrNull(stopValue);
  const target = numericOrNull(targetValue);
  const hasAny = [entryValue, stopValue, targetValue].some(value => String(value || '').trim() || Number.isFinite(numericOrNull(value)));
  if(!Number.isFinite(entry) || !Number.isFinite(stop) || !Number.isFinite(target)){
    return {
      status:hasAny ? 'invalid' : 'missing',
      entry,
      stop,
      target,
      rewardRisk:evaluateRewardRisk(entry, stop, target),
      rewardPerShare:null,
      riskFit:{risk_status:hasAny ? 'invalid_plan' : 'plan_missing', position_size:0, max_loss:numericOrNull(settings.maxRisk) || 40},
      capitalFit:{capital_fit:'unknown', capital_note:'', position_cost:null, position_cost_gbp:null, quote_currency:normalizeQuoteCurrency(quoteCurrency)},
      affordability:'',
      tradeability:hasAny ? 'invalid' : 'plan_missing'
    };
  }
  const rewardRisk = evaluateRewardRisk(entry, stop, target);
  const riskFit = evaluateRiskFit({entry, stop, ...currentRiskSettings(settings)});
  const positionSize = Number.isFinite(riskFit.position_size) ? riskFit.position_size : 0;
  const positionCost = Number.isFinite(entry) && Number.isFinite(positionSize) ? entry * positionSize : null;
  const converted = convertQuoteValueToGbp(positionCost, quoteCurrency);
  const accountSizeGbp = numericOrNull(settings.accountSize) || 4000;
  const affordability = deriveAffordability(positionCost);
  let capitalFit = 'unknown';
  let capitalNote = '';
  if(Number.isFinite(converted.gbpValue)){
    capitalFit = converted.gbpValue <= accountSizeGbp ? 'fits_capital' : 'too_expensive';
  }else if(positionCost != null){
    capitalNote = 'FX conversion is not supported yet.';
  }
  let tradeability = 'invalid';
  if(riskFit.risk_status === 'fits_risk'){
    if(capitalFit === 'fits_capital' || affordability === 'affordable' || affordability === 'heavy_capital'){
      tradeability = 'tradable';
    }else if(capitalFit === 'unknown'){
      tradeability = 'risk_only';
    }else{
      tradeability = 'too_expensive';
    }
  }
  return {
    status:rewardRisk.valid && riskFit.risk_status !== 'invalid_plan' ? 'valid' : 'invalid',
    entry,
    stop,
    target,
    rewardRisk,
    rewardPerShare:rewardRisk.rewardPerShare,
    riskFit,
    capitalFit:{
      capital_fit:capitalFit,
      capital_note:capitalNote,
      position_cost:positionCost,
      position_cost_gbp:converted.gbpValue,
      quote_currency:normalizeQuoteCurrency(quoteCurrency)
    },
    affordability,
    tradeability
  };
}

function analysisDerivedStatesFromRecord(record){
  const rawRecord = record && typeof record === 'object' ? record : {};
  const analysisProjection = rawRecord.scan && rawRecord.scan.analysisProjection && typeof rawRecord.scan.analysisProjection === 'object'
    ? rawRecord.scan.analysisProjection
    : {};
  const normalizedAnalysis = rawRecord.review
    && rawRecord.review.analysisState
    && rawRecord.review.analysisState.normalized
    && typeof rawRecord.review.analysisState.normalized === 'object'
      ? rawRecord.review.analysisState.normalized
      : (rawRecord.review && rawRecord.review.normalizedAnalysis && typeof rawRecord.review.normalizedAnalysis === 'object'
        ? rawRecord.review.normalizedAnalysis
        : {});
  return {
    trendState:stringOrEmpty(analysisProjection.trend_state || analysisProjection.trend_status || normalizedAnalysis.trend_state).trim().toLowerCase(),
    pullbackZone:stringOrEmpty(analysisProjection.pullback_zone || analysisProjection.pullback_status || normalizedAnalysis.pullback_zone).trim().toLowerCase(),
    structureState:stringOrEmpty(analysisProjection.structure_state || normalizedAnalysis.structure_state).trim().toLowerCase(),
    stabilisationState:stringOrEmpty(analysisProjection.stabilisation_state || normalizedAnalysis.stabilisation_state).trim().toLowerCase(),
    bounceState:stringOrEmpty(analysisProjection.bounce_state || normalizedAnalysis.bounce_state).trim().toLowerCase()
  };
}

function downgradeVerdict(stage, amount = 1){
  const ladder = ['Entry','Near Entry','Watch','Avoid'];
  const index = ladder.indexOf(String(stage || 'Watch'));
  if(index === -1) return 'Watch';
  return ladder[Math.min(ladder.length - 1, index + Math.max(0, amount))];
}

function evaluateSetupQualityAdjustments(record, options = {}){
  const rawRecord = record && typeof record === 'object' ? record : {};
  const derivedStates = options.derivedStates || analysisDerivedStatesFromRecord(rawRecord);
  const displayedPlan = options.displayedPlan || deriveCurrentPlanState(
    rawRecord.plan && rawRecord.plan.entry,
    rawRecord.plan && rawRecord.plan.stop,
    rawRecord.plan && rawRecord.plan.firstTarget,
    rawRecord.marketData && rawRecord.marketData.currency,
    options.settings
  );
  const stopPercent = Number.isFinite(displayedPlan.entry) && Number.isFinite(displayedPlan.stop) && displayedPlan.entry > 0
    ? Math.abs(displayedPlan.entry - displayedPlan.stop) / displayedPlan.entry
    : null;
  const positionSize = numericOrNull(displayedPlan.riskFit && displayedPlan.riskFit.position_size);
  const plannedRR = numericOrNull(displayedPlan.rewardRisk && displayedPlan.rewardRisk.rrRatio);
  const near50 = derivedStates.pullbackZone === 'near_50ma';
  const hostileMarket = isHostileMarketStatus((rawRecord.meta && rawRecord.meta.marketStatus) || (options.settings && options.settings.marketStatus));
  const lowControlSetup = (Number.isFinite(stopPercent) && stopPercent > 0.045)
    || (Number.isFinite(positionSize) && positionSize <= 2)
    || (near50 && Number.isFinite(plannedRR) && plannedRR < 1.75);
  const tooWideForQualityPullback = (Number.isFinite(stopPercent) && stopPercent > 0.05)
    || (Number.isFinite(positionSize) && positionSize < 2)
    || (near50 && Number.isFinite(plannedRR) && plannedRR < 1.6 && derivedStates.bounceState !== 'confirmed');
  const widthPenalty = tooWideForQualityPullback ? 2 : (lowControlSetup ? 1 : 0);
  const strongEnoughForWeakRegime = near50
    && derivedStates.bounceState === 'confirmed'
    && derivedStates.stabilisationState === 'clear'
    && !lowControlSetup
    && !tooWideForQualityPullback
    && Number.isFinite(stopPercent) && stopPercent < 0.02
    && Number.isFinite(positionSize) && positionSize > 2
    && Number.isFinite(plannedRR) && plannedRR >= 1.75
    && !['weak','weakening','broken'].includes(derivedStates.structureState)
    && derivedStates.trendState === 'strong';
  const weakRegimePenalty = hostileMarket && near50 && !strongEnoughForWeakRegime;
  return {
    widthPenalty,
    weakRegimePenalty
  };
}

function analysisVerdictForRecord(record){
  const normalizedAnalysis = record
    && record.review
    && record.review.analysisState
    && record.review.analysisState.normalized
    && typeof record.review.analysisState.normalized === 'object'
      ? record.review.analysisState.normalized
      : (record && record.review && record.review.normalizedAnalysis && typeof record.review.normalizedAnalysis === 'object'
        ? record.review.normalizedAnalysis
        : null);
  const verdict = stringOrEmpty(normalizedAnalysis && (normalizedAnalysis.final_verdict || normalizedAnalysis.verdict) || record && record.scan && record.scan.verdict || 'Watch').trim();
  return ['Entry','Near Entry','Watch','Avoid'].includes(verdict) ? verdict : 'Watch';
}

function evaluateEntryTrigger(record, options = {}){
  const rawRecord = record && typeof record === 'object' ? record : {};
  const derived = options.derivedStates || analysisDerivedStatesFromRecord(rawRecord);
  const displayedPlan = options.displayedPlan || deriveCurrentPlanState(
    rawRecord.plan && rawRecord.plan.entry,
    rawRecord.plan && rawRecord.plan.stop,
    rawRecord.plan && rawRecord.plan.firstTarget,
    rawRecord.marketData && rawRecord.marketData.currency,
    options.settings
  );
  const trendState = String(derived.trendState || '').toLowerCase();
  const pullbackZone = String(derived.pullbackZone || '').toLowerCase();
  const structureState = String(derived.structureState || '').toLowerCase();
  const stabilisationState = String(derived.stabilisationState || '').toLowerCase();
  const bounceState = String(derived.bounceState || '').toLowerCase();
  const hostileMarket = isHostileMarketStatus((rawRecord.meta && rawRecord.meta.marketStatus) || (options.settings && options.settings.marketStatus));
  const currentPrice = numericOrNull(rawRecord.marketData && rawRecord.marketData.price);
  const entry = displayedPlan.entry;
  const stop = displayedPlan.stop;
  const trendValid = trendState !== 'broken' && trendState !== 'weak';
  const pullbackValid = ['near_20ma','near_50ma'].includes(pullbackZone);
  const structureIntact = !['weak','weakening','broken'].includes(structureState);
  const noBounce = bounceState === 'none';
  const confirmedBounce = bounceState === 'confirmed';
  const clearStabilisation = stabilisationState === 'clear';
  const hardFail = trendState === 'broken'
    || structureState === 'broken'
    || (['weak','weakening'].includes(structureState) && noBounce && hostileMarket)
    || (Number.isFinite(currentPrice) && Number.isFinite(stop) && currentPrice <= (stop * 0.995));
  const hasReviewedPlan = displayedPlan.status === 'valid';
  const breakAboveTrigger = hasReviewedPlan && Number.isFinite(currentPrice) && Number.isFinite(entry) && currentPrice >= (entry * 0.995);
  const strongReversal = pullbackValid && structureIntact && confirmedBounce;
  const reclaimFollowThrough = pullbackValid && structureIntact && clearStabilisation && breakAboveTrigger;
  const triggerReady = trendValid && pullbackValid && structureIntact && !hardFail && hasReviewedPlan
    && (breakAboveTrigger || strongReversal || reclaimFollowThrough);
  const nearReady = !hardFail && pullbackValid && trendState !== 'broken'
    && (confirmedBounce || bounceState === 'attempt' || clearStabilisation);
  const extendedFromEntry = hasReviewedPlan && Number.isFinite(currentPrice) && Number.isFinite(entry) && currentPrice > (entry * 1.03);
  const clearlyMissed = hasReviewedPlan && Number.isFinite(currentPrice) && Number.isFinite(entry) && currentPrice > (entry * 1.06);
  return {
    triggerState:hardFail ? 'invalidated' : (clearlyMissed ? 'missed' : (triggerReady ? 'triggered' : (nearReady ? 'near_ready' : 'waiting_for_trigger'))),
    entryTriggerReady:triggerReady,
    nearReady,
    hardFail,
    extendedFromEntry,
    clearlyMissed
  };
}

function validateCurrentPlan(record, options = {}){
  const rawRecord = record && typeof record === 'object' ? record : {};
  const displayedPlan = options.displayedPlan || deriveCurrentPlanState(
    rawRecord.plan && rawRecord.plan.entry,
    rawRecord.plan && rawRecord.plan.stop,
    rawRecord.plan && rawRecord.plan.firstTarget,
    rawRecord.marketData && rawRecord.marketData.currency,
    options.settings
  );
  const trigger = options.triggerState || evaluateEntryTrigger(rawRecord, {displayedPlan, derivedStates:options.derivedStates, settings:options.settings});
  const currentPrice = numericOrNull(rawRecord.marketData && rawRecord.marketData.price);
  const entry = displayedPlan.entry;
  const stop = displayedPlan.stop;
  const target = displayedPlan.target;
  if(displayedPlan.status !== 'valid'){
    return {
      state:displayedPlan.status === 'missing' ? 'not_reviewed' : 'needs_replan',
      valid:false,
      needsReplan:displayedPlan.status !== 'missing',
      missed:false,
      invalidated:false
    };
  }
  if(trigger.hardFail){
    return {state:'invalidated', valid:false, needsReplan:false, missed:false, invalidated:true};
  }
  if(trigger.clearlyMissed || (Number.isFinite(currentPrice) && Number.isFinite(target) && currentPrice >= (target * 0.98))){
    return {state:'missed', valid:false, needsReplan:false, missed:true, invalidated:false};
  }
  const prospectiveRisk = (Number.isFinite(currentPrice) && Number.isFinite(stop) && Number.isFinite(target) && currentPrice > entry)
    ? evaluateRewardRisk(currentPrice, stop, target)
    : displayedPlan.rewardRisk;
  const prospectiveRiskFit = (Number.isFinite(currentPrice) && Number.isFinite(stop) && currentPrice > entry)
    ? evaluateRiskFit({entry:currentPrice, stop, ...currentRiskSettings(options.settings)})
    : displayedPlan.riskFit;
  const sizeShift = Number.isFinite(displayedPlan.riskFit.position_size) && displayedPlan.riskFit.position_size > 0 && Number.isFinite(prospectiveRiskFit.position_size)
    ? Math.abs(prospectiveRiskFit.position_size - displayedPlan.riskFit.position_size) / displayedPlan.riskFit.position_size
    : 0;
  const staleMove = trigger.extendedFromEntry
    || (prospectiveRisk.valid && prospectiveRisk.rrRatio < 1.5)
    || sizeShift > 0.35;
  return {
    state:staleMove ? 'needs_replan' : 'valid',
    valid:!staleMove,
    needsReplan:staleMove,
    missed:false,
    invalidated:false
  };
}

function displayStageForRecord(record, settings = {}){
  const baseVerdict = analysisVerdictForRecord(record);
  const derivedStates = analysisDerivedStatesFromRecord(record);
  const displayedPlan = deriveCurrentPlanState(
    record.plan && record.plan.entry,
    record.plan && record.plan.stop,
    record.plan && record.plan.firstTarget,
    record.marketData && record.marketData.currency,
    settings
  );
  const trigger = evaluateEntryTrigger(record, {derivedStates, displayedPlan, settings});
  const planValidation = validateCurrentPlan(record, {derivedStates, displayedPlan, triggerState:trigger, settings});
  const qualityAdjustments = evaluateSetupQualityAdjustments(record, {derivedStates, displayedPlan, settings});
  let stage = 'Watch';
  if(trigger.hardFail || planValidation.invalidated) return 'Avoid';
  if(baseVerdict === 'Avoid') return 'Avoid';
  if(trigger.entryTriggerReady && planValidation.state === 'valid' && baseVerdict !== 'Avoid'){
    stage = 'Entry';
  }else if(baseVerdict === 'Entry'){
    if(planValidation.state === 'missed') return 'Watch';
    if(planValidation.state === 'needs_replan') return 'Near Entry';
    stage = trigger.nearReady ? 'Near Entry' : 'Watch';
  }else if(baseVerdict === 'Near Entry'){
    if(planValidation.state === 'missed') return 'Watch';
    stage = trigger.nearReady ? 'Near Entry' : 'Watch';
  }else if(baseVerdict === 'Watch' && trigger.nearReady){
    stage = 'Near Entry';
  }
  if(stage !== 'Avoid' && qualityAdjustments.widthPenalty > 0){
    stage = downgradeVerdict(stage, qualityAdjustments.widthPenalty);
  }
  if(stage !== 'Avoid' && qualityAdjustments.weakRegimePenalty){
    stage = downgradeVerdict(stage, 1);
  }
  return stage;
}

function hasLockedLifecycle(record){
  return !!(record && record.lifecycle && record.lifecycle.lockReason === 'manual_expired');
}

function businessDaysFromNow(days){
  const target = new Date();
  let remaining = Math.max(0, Number(days) || 0);
  while(remaining > 0){
    target.setUTCDate(target.getUTCDate() + 1);
    const day = target.getUTCDay();
    if(day !== 0 && day !== 6) remaining -= 1;
  }
  return target.toISOString().slice(0, 10);
}

function todayIsoDate(){
  return new Date().toISOString().slice(0, 10);
}

function setLifecycleStage(record, {stage, status, changedAt, expiresAt, expiryReason, reason, source, lockReason}){
  const lifecycle = record.lifecycle || (record.lifecycle = {});
  lifecycle.stage = String(stage || lifecycle.stage || '');
  lifecycle.status = String(status || lifecycle.status || 'inactive');
  lifecycle.lockReason = lockReason == null ? String(lifecycle.lockReason || '') : String(lockReason || '');
  lifecycle.stageUpdatedAt = String(changedAt || new Date().toISOString());
  lifecycle.expiresAt = expiresAt == null ? String(lifecycle.expiresAt || '') : String(expiresAt || '');
  lifecycle.expiryReason = expiryReason == null ? String(lifecycle.expiryReason || '') : String(expiryReason || '');
  lifecycle.history = Array.isArray(lifecycle.history) ? lifecycle.history : [];
  lifecycle.history.push({
    stage:lifecycle.stage,
    status:lifecycle.status,
    changedAt:lifecycle.stageUpdatedAt,
    reason:String(reason || expiryReason || ''),
    source:String(source || 'system')
  });
  lifecycle.history = lifecycle.history.slice(-24);
}

function maybeExpireTickerRecord(record){
  if(!record || !record.lifecycle || !record.lifecycle.expiresAt) return false;
  if(['entered','exited'].includes(String(record.lifecycle.stage || ''))) return false;
  if(String(record.lifecycle.status || '') === 'closed') return false;
  if(todayIsoDate() < String(record.lifecycle.expiresAt || '')) return false;
  setLifecycleStage(record, {
    stage:'expired',
    status:'stale',
    changedAt:new Date().toISOString(),
    expiresAt:record.lifecycle.expiresAt,
    expiryReason:record.lifecycle.expiryReason || 'Aged out without progressing.',
    reason:record.lifecycle.expiryReason || 'Aged out without progressing.',
    source:'system'
  });
  return true;
}

function normalizeRecord(record, settings = {}){
  const safe = record && typeof record === 'object' ? record : {};
  safe.ticker = normalizeTicker(safe.ticker);
  safe.marketData = safe.marketData && typeof safe.marketData === 'object' ? safe.marketData : {};
  safe.scan = safe.scan && typeof safe.scan === 'object' ? safe.scan : {};
  safe.review = safe.review && typeof safe.review === 'object' ? safe.review : {};
  safe.review.analysisState = safe.review.analysisState && typeof safe.review.analysisState === 'object' ? safe.review.analysisState : {};
  safe.plan = safe.plan && typeof safe.plan === 'object' ? safe.plan : {};
  safe.lifecycle = safe.lifecycle && typeof safe.lifecycle === 'object' ? safe.lifecycle : {};
  safe.meta = safe.meta && typeof safe.meta === 'object' ? safe.meta : {};
  safe.watchlist = safe.watchlist && typeof safe.watchlist === 'object' ? safe.watchlist : {};
  safe.notifications = safe.notifications && typeof safe.notifications === 'object' ? safe.notifications : {};
  safe.meta.marketStatus = String(safe.meta.marketStatus || settings.marketStatus || '');
  ['price','ma20','ma50','ma200','rsi','avgVolume','volume','perf1w','perf1m','perf3m','perf6m','perfYtd','marketCap'].forEach(key => {
    safe.marketData[key] = numericOrNull(safe.marketData[key]);
  });
  safe.marketData.history = Array.isArray(safe.marketData.history) ? safe.marketData.history : [];
  safe.plan.entry = numericOrNull(safe.plan.entry);
  safe.plan.stop = numericOrNull(safe.plan.stop);
  safe.plan.firstTarget = numericOrNull(safe.plan.firstTarget);
  safe.plan.status = stringOrEmpty(safe.plan.status || '');
  safe.plan.triggerState = stringOrEmpty(safe.plan.triggerState || 'waiting_for_trigger');
  safe.plan.planValidationState = stringOrEmpty(safe.plan.planValidationState || '');
  safe.plan.needsReplan = !!safe.plan.needsReplan;
  safe.plan.missedState = stringOrEmpty(safe.plan.missedState || '');
  safe.plan.invalidatedState = stringOrEmpty(safe.plan.invalidatedState || '');
  safe.plan.targetAlert = safe.plan.targetAlert && typeof safe.plan.targetAlert === 'object' ? safe.plan.targetAlert : {};
  safe.meta.updatedAt = String(safe.meta.updatedAt || new Date().toISOString());
  return safe;
}

function reevaluateTickerProgress(record, settings = {}){
  const item = normalizeRecord(record, settings);
  maybeExpireTickerRecord(item);
  if(hasLockedLifecycle(item)){
    item.plan.triggerState = 'stale';
    if(!['invalidated','missed'].includes(String(item.plan.planValidationState || ''))){
      item.plan.planValidationState = 'stale';
    }
    return item;
  }
  const displayedPlan = deriveCurrentPlanState(item.plan.entry, item.plan.stop, item.plan.firstTarget, item.marketData.currency, settings);
  const trigger = evaluateEntryTrigger(item, {displayedPlan, settings});
  const planValidation = validateCurrentPlan(item, {displayedPlan, triggerState:trigger, settings});
  item.plan.status = displayedPlan.status;
  item.plan.hasValidPlan = displayedPlan.status === 'valid';
  item.plan.triggerState = String(trigger.triggerState || 'waiting_for_trigger');
  item.plan.planValidationState = String(planValidation.state || '');
  item.plan.needsReplan = !!planValidation.needsReplan;
  item.plan.missedState = planValidation.missed ? 'missed' : '';
  item.plan.invalidatedState = planValidation.invalidated ? 'invalidated' : '';
  if(String(item.lifecycle.status || '') === 'stale' && !item.plan.invalidatedState && !item.plan.missedState && item.plan.triggerState !== 'triggered'){
    item.plan.triggerState = 'stale';
    if(!['missed','invalidated'].includes(item.plan.planValidationState)){
      item.plan.planValidationState = 'stale';
    }
    return item;
  }
  if(item.plan.invalidatedState){
    setLifecycleStage(item, {
      stage:'avoided',
      status:'inactive',
      changedAt:new Date().toISOString(),
      expiresAt:'',
      expiryReason:'',
      reason:'Setup invalidated during scheduled review.',
      source:'scheduled-review'
    });
  }else if(item.plan.missedState){
    setLifecycleStage(item, {
      stage:'expired',
      status:'stale',
      changedAt:new Date().toISOString(),
      expiresAt:todayIsoDate(),
      expiryReason:'Setup missed after trigger progression.',
      reason:'Setup missed after trigger progression.',
      source:'scheduled-review'
    });
  }else if(item.plan.triggerState === 'triggered' && item.plan.planValidationState === 'valid' && displayedPlan.status === 'valid'){
    const alreadyActivePlanned = item.lifecycle.stage === 'planned' && item.lifecycle.status === 'active' && item.lifecycle.expiresAt;
    if(!alreadyActivePlanned){
      setLifecycleStage(item, {
        stage:'planned',
        status:'active',
        changedAt:new Date().toISOString(),
        expiresAt:item.lifecycle.stage === 'planned' && item.lifecycle.status === 'active' && item.lifecycle.expiresAt
          ? item.lifecycle.expiresAt
          : businessDaysFromNow(3),
        expiryReason:'',
        reason:'Trigger confirmed and reviewed plan still validates.',
        source:'scheduled-review'
      });
    }
  }
  item.meta.updatedAt = new Date().toISOString();
  return item;
}

function isEligibleTrackedRecord(record){
  const item = record && typeof record === 'object' ? record : {};
  return !!(
    (item.watchlist && item.watchlist.inWatchlist)
    || (item.review && item.review.manualReview)
    || (item.plan && (item.plan.hasValidPlan || [item.plan.entry, item.plan.stop, item.plan.firstTarget].some(Number.isFinite)))
    || ['watchlist','reviewed','planned','shortlisted'].includes(String(item.lifecycle && item.lifecycle.stage || ''))
  );
}

function buildEntryNotification(record, settings = {}){
  const displayedPlan = deriveCurrentPlanState(record.plan && record.plan.entry, record.plan && record.plan.stop, record.plan && record.plan.firstTarget, record.marketData && record.marketData.currency, settings);
  const bodyParts = [];
  if(Number.isFinite(displayedPlan.entry)) bodyParts.push(`Entry ${displayedPlan.entry.toFixed(2)}`);
  if(Number.isFinite(displayedPlan.stop)) bodyParts.push(`Stop ${displayedPlan.stop.toFixed(2)}`);
  if(Number.isFinite(displayedPlan.target)) bodyParts.push(`Target ${displayedPlan.target.toFixed(2)}`);
  return {
    title:`${record.ticker} is now Entry-ready`,
    body:bodyParts.join(' | ') || 'Reviewed setup progressed to Entry.'
  };
}

module.exports = {
  normalizeRecord,
  isEligibleTrackedRecord,
  reevaluateTickerProgress,
  displayStageForRecord,
  buildEntryNotification
};
