(function(global){
  const DEFAULT_RISK_SETTINGS = {
    account_size:4000,
    risk_percent:1,
    max_loss_override:40,
    whole_shares_only:true
  };

  function numericOrNull(value){
    if(value === null || value === undefined) return null;
    if(typeof value === 'string' && value.trim() === '') return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function normalizeRiskSettings(riskSettings = {}){
    const source = riskSettings && typeof riskSettings === 'object' ? riskSettings : {};
    const accountSize = numericOrNull(source.account_size ?? source.accountSize);
    const riskPercent = numericOrNull(source.risk_percent ?? source.riskPercent);
    const maxLoss = numericOrNull(source.max_loss_override ?? source.maxLossOverride ?? source.max_loss ?? source.maxRisk);
    return {
      account_size:Number.isFinite(accountSize) && accountSize > 0 ? accountSize : DEFAULT_RISK_SETTINGS.account_size,
      risk_percent:Number.isFinite(riskPercent) && riskPercent > 0 ? riskPercent : DEFAULT_RISK_SETTINGS.risk_percent,
      max_loss_override:Number.isFinite(maxLoss) && maxLoss > 0 ? maxLoss : DEFAULT_RISK_SETTINGS.max_loss_override,
      whole_shares_only:source.whole_shares_only !== false && source.wholeSharesOnly !== false
    };
  }

  function normalizeEffectivePlan(record, effectivePlan = {}){
    const item = record && typeof record === 'object' ? record : {};
    const plan = effectivePlan && typeof effectivePlan === 'object' ? effectivePlan : {};
    const recordPlan = item.plan && typeof item.plan === 'object' ? item.plan : {};
    return {
      entry:plan.entry ?? recordPlan.entry,
      stop:plan.stop ?? recordPlan.stop,
      firstTarget:plan.firstTarget ?? plan.target ?? recordPlan.firstTarget ?? recordPlan.target,
      source:String(plan.source || recordPlan.source || '')
    };
  }

  function localEvaluateRiskFit({entry, stop, account_size, risk_percent, max_loss_override, whole_shares_only}){
    const numericEntry = numericOrNull(entry);
    const numericStop = numericOrNull(stop);
    const accountSize = numericOrNull(account_size) || 0;
    const riskPercent = numericOrNull(risk_percent) || 0;
    const override = numericOrNull(max_loss_override);
    const maxLoss = Number.isFinite(override) && override > 0
      ? override
      : (accountSize > 0 && riskPercent > 0 ? accountSize * (riskPercent / 100) : 0);
    if(!Number.isFinite(numericEntry) || !Number.isFinite(numericStop)){
      return {max_loss:maxLoss, risk_per_share:null, position_size:0, risk_status:'plan_missing'};
    }
    const riskPerShare = numericEntry - numericStop;
    if(!Number.isFinite(riskPerShare) || riskPerShare <= 0){
      return {max_loss:maxLoss, risk_per_share:riskPerShare, position_size:0, risk_status:'invalid_plan'};
    }
    if(!(maxLoss > 0)){
      return {max_loss:maxLoss, risk_per_share:riskPerShare, position_size:0, risk_status:'settings_missing'};
    }
    const rawSize = maxLoss / riskPerShare;
    const positionSize = whole_shares_only === false ? Number(rawSize.toFixed(2)) : Math.floor(rawSize);
    if(positionSize < 1){
      return {max_loss:maxLoss, risk_per_share:riskPerShare, position_size:whole_shares_only === false ? positionSize : 0, risk_status:'too_wide'};
    }
    return {max_loss:maxLoss, risk_per_share:riskPerShare, position_size:positionSize, risk_status:'fits_risk'};
  }

  function deriveTradeability(planStatus, riskStatus, capitalFit, deps = {}){
    if(typeof deps.deriveTradeability === 'function') return deps.deriveTradeability(planStatus, riskStatus, capitalFit);
    if(global.Tradeability && typeof global.Tradeability.deriveTradeability === 'function'){
      return global.Tradeability.deriveTradeability(planStatus, riskStatus, capitalFit);
    }
    if(planStatus !== 'valid') return 'invalid';
    if(riskStatus === 'fits_risk' && ['ideal','acceptable','borderline'].includes(String(capitalFit || '').toLowerCase())) return 'tradable';
    if(riskStatus === 'too_wide') return 'too_wide';
    if(['too_heavy','too_expensive'].includes(String(capitalFit || '').toLowerCase())) return 'too_expensive';
    return 'watch';
  }

  function authoritativePlanBlock(record){
    const item = record && typeof record === 'object' ? record : {};
    const plan = item.plan && typeof item.plan === 'object' ? item.plan : {};
    const status = String(plan.status || '').trim().toLowerCase();
    const tradeability = String(plan.tradeability || '').trim().toLowerCase();
    const riskStatus = String(plan.riskStatus || '').trim().toLowerCase();
    const blockedReason = String(plan.blockedReason || '').trim();
    const source = String(plan.source || '').trim().toLowerCase();
    const firstTargetTooClose = plan.firstTargetTooClose === true;
    const invalidByStatus = ['invalid','missing'].includes(status);
    const invalidByTradeability = ['invalid','too_wide','too_expensive'].includes(tradeability);
    const invalidByRisk = ['plan_blocked','invalid_plan','plan_missing','too_wide'].includes(riskStatus);
    const blocked = !!(
      invalidByStatus
      || invalidByTradeability
      || invalidByRisk
      || blockedReason
      || firstTargetTooClose
    );
    return {
      blocked,
      source,
      status,
      tradeability,
      riskStatus,
      blockedReason,
      firstTargetTooClose
    };
  }

  function deriveCurrentPlanState(record, effectivePlan, riskSettings, deps = {}){
    const planMath = deps.PlanMath || global.PlanMath || {};
    const item = record && typeof record === 'object' ? record : {};
    const plan = normalizeEffectivePlan(item, effectivePlan);
    const settings = normalizeRiskSettings(riskSettings);
    const entry = numericOrNull(plan.entry);
    const stop = numericOrNull(plan.stop);
    const target = numericOrNull(plan.firstTarget);
    const hasEntry = Number.isFinite(entry);
    const hasStop = Number.isFinite(stop);
    const hasTarget = Number.isFinite(target);
    const allPresent = hasEntry && hasStop && hasTarget;
    const quoteCurrency = (item.marketData && item.marketData.currency) || '';

    if(
      typeof planMath.evaluateRewardRisk !== 'function'
      || typeof planMath.evaluateCapitalFit !== 'function'
    ){
      return {
        entry,
        stop,
        target,
        status:allPresent ? 'invalid' : 'missing',
        rewardRisk:{valid:false, riskPerShare:null, rewardPerShare:null, rrRatio:null, rrState:'invalid'},
        rewardPerShare:null,
        riskFit:{max_loss:settings.max_loss_override, risk_per_share:null, position_size:0, risk_status:hasEntry && hasStop ? 'invalid_plan' : 'plan_missing'},
        capitalFit:{capital_fit:'unknown', capital_ok:null, position_cost:null, position_cost_gbp:null, quote_currency:quoteCurrency || ''},
        tradeability:'invalid',
        affordability:'',
        planSourceUsedForRisk:plan.source,
        planVisible:false,
        hasEntry,
        hasStop,
        hasTarget,
        rr:null,
        riskPerShare:null,
        maxLoss:settings.max_loss_override,
        positionSize:0,
        capitalOk:null,
        debug:{missingDependency:'PlanMath'}
      };
    }

    const rewardRisk = planMath.evaluateRewardRisk(entry, stop, target, {numericOrNull});
    const riskInput = {
        entry,
        stop,
        account_size:settings.account_size,
        risk_percent:settings.risk_percent,
        max_loss_override:settings.max_loss_override,
        whole_shares_only:settings.whole_shares_only
      };
    const riskFit = hasEntry && hasStop
      ? (typeof deps.evaluateRiskFit === 'function' ? deps.evaluateRiskFit(riskInput) : localEvaluateRiskFit(riskInput))
      : {
        max_loss:settings.max_loss_override,
        risk_per_share:null,
        position_size:0,
        risk_status:'plan_missing'
      };
    const capitalFit = planMath.evaluateCapitalFit({
      entry,
      position_size:riskFit.position_size,
      account_size_gbp:settings.account_size,
      quote_currency:quoteCurrency
    }, {
      numericOrNull,
      convertQuoteValueToGbp:(value, currency) => planMath.convertQuoteValueToGbp(value, currency, {numericOrNull}),
      classifyCapitalUsage:(input) => planMath.classifyCapitalUsage(input, {numericOrNull})
    });
    const rewardPerShare = hasEntry && hasTarget && target > entry ? target - entry : null;
    const status = !allPresent ? 'missing' : (rewardRisk.valid ? 'valid' : 'invalid');
    const tradeability = deriveTradeability(status, riskFit.risk_status, capitalFit.capital_fit, deps);
    const affordability = status === 'valid' && typeof planMath.deriveAffordability === 'function'
      ? planMath.deriveAffordability({...capitalFit, account_size_gbp:settings.account_size}, {
        numericOrNull,
        classifyCapitalUsage:(input) => planMath.classifyCapitalUsage(input, {numericOrNull})
      })
      : '';

    const authoritative = authoritativePlanBlock(item);
    const shouldHonorAuthoritativeBlock = authoritative.blocked === true
      && authoritative.source === 'scanner_estimate';

    return {
      entry,
      stop,
      target,
      status:shouldHonorAuthoritativeBlock ? 'invalid' : status,
      rewardRisk,
      rewardPerShare,
      riskFit,
      capitalFit,
      tradeability:shouldHonorAuthoritativeBlock ? 'invalid' : tradeability,
      affordability,
      planSourceUsedForRisk:plan.source,
      planVisible:shouldHonorAuthoritativeBlock ? false : status === 'valid',
      hasEntry,
      hasStop,
      hasTarget,
      rr:rewardRisk && Number.isFinite(rewardRisk.rrRatio) ? rewardRisk.rrRatio : null,
      riskPerShare:riskFit.risk_per_share,
      maxLoss:riskFit.max_loss,
      positionSize:riskFit.position_size,
      positionCost:capitalFit.position_cost,
      positionCostGbp:capitalFit.position_cost_gbp,
      capitalOk:capitalFit.capital_ok,
      capitalUsagePct:capitalFit.capital_usage_pct,
      quoteCurrency:capitalFit.quote_currency || quoteCurrency || '',
      authoritativeBlockApplied:shouldHonorAuthoritativeBlock,
      authoritativeBlockedReason:shouldHonorAuthoritativeBlock ? authoritative.blockedReason : ''
    };
  }

  function validateCurrentPlan(record, planState, options = {}){
    const item = record && typeof record === 'object' ? record : {};
    const displayedPlan = planState && typeof planState === 'object' ? planState : deriveCurrentPlanState(item, null, null, options.deps || {});
    const derivedStates = options.derivedStates || {};
    const structureState = String(derivedStates.structureState || derivedStates.structure_state || '').toLowerCase();
    const trendState = String(derivedStates.trendState || derivedStates.trend_state || '').toLowerCase();
    const currentPrice = numericOrNull(item.marketData && item.marketData.price);
    const entry = numericOrNull(displayedPlan.entry);
    const stop = numericOrNull(displayedPlan.stop);
    const target = numericOrNull(displayedPlan.target);

    if(displayedPlan.status !== 'valid'){
      return {
        state:displayedPlan.status === 'missing' ? 'not_reviewed' : 'needs_replan',
        valid:false,
        needsReplan:displayedPlan.status !== 'missing',
        missed:false,
        invalidated:false,
        capitalConstraint:'',
        reasonCode:displayedPlan.status === 'missing' ? 'plan_missing' : 'plan_incomplete'
      };
    }
    if(structureState === 'broken' || trendState === 'broken' || (Number.isFinite(currentPrice) && Number.isFinite(stop) && currentPrice <= (stop * 0.995))){
      return {state:'invalidated', valid:false, needsReplan:false, missed:false, invalidated:true, capitalConstraint:'', reasonCode:'technical_invalidation'};
    }
    if(Number.isFinite(currentPrice) && Number.isFinite(target) && currentPrice >= (target * 0.98)){
      return {state:'missed', valid:false, needsReplan:false, missed:true, invalidated:false, capitalConstraint:'', reasonCode:'missed_setup'};
    }
    const riskStatus = String(displayedPlan.riskFit && displayedPlan.riskFit.risk_status || '').toLowerCase();
    const capitalFit = String(displayedPlan.capitalFit && displayedPlan.capitalFit.capital_fit || '').toLowerCase();
    const capitalConstraint = riskStatus === 'too_wide'
      ? 'risk_too_wide'
      : (['too_heavy','too_expensive'].includes(capitalFit) ? 'capital_too_high' : '');
    const rr = numericOrNull(displayedPlan.rewardRisk && displayedPlan.rewardRisk.rrRatio);
    const staleMove = Number.isFinite(entry) && Number.isFinite(currentPrice) && currentPrice > entry && Number.isFinite(rr) && rr < 1.5;
    return {
      state:staleMove ? 'needs_replan' : 'valid',
      valid:!staleMove,
      needsReplan:staleMove,
      missed:false,
      invalidated:false,
      capitalConstraint,
      reasonCode:staleMove ? 'plan_premature_or_stale' : 'valid'
    };
  }

  global.SimplifiedPlanState = {
    deriveCurrentPlanState,
    validateCurrentPlan,
    normalizeRiskSettings
  };
})(window);
