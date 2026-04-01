// Pure planner helpers and small calculation utilities.
(function(global){
  function evaluateRiskFit({entry, stop, account_size, risk_percent, max_loss_override, whole_shares_only}){
    const numericEntry = global.PullbackCore.numericOrNull(entry);
    const numericStop = global.PullbackCore.numericOrNull(stop);
    const accountSize = global.PullbackCore.numericOrNull(account_size) || 0;
    const riskPercent = global.PullbackCore.numericOrNull(risk_percent) || 0;
    const override = global.PullbackCore.numericOrNull(max_loss_override);
    const max_loss = Number.isFinite(override) && override > 0 ? override : (accountSize > 0 && riskPercent > 0 ? accountSize * riskPercent : 0);
    if(!Number.isFinite(numericEntry) || !Number.isFinite(numericStop)) return {max_loss, risk_per_share:null, position_size:0, risk_status:'plan_missing'};
    const risk_per_share = numericEntry - numericStop;
    if(!Number.isFinite(risk_per_share) || risk_per_share <= 0) return {max_loss, risk_per_share, position_size:0, risk_status:'invalid_plan'};
    if(!(max_loss > 0)) return {max_loss, risk_per_share, position_size:0, risk_status:'settings_missing'};
    let position_size = max_loss > 0 ? (whole_shares_only === false ? (max_loss / risk_per_share) : Math.floor(max_loss / risk_per_share)) : 0;
    if(!Number.isFinite(position_size)) position_size = 0;
    if(position_size < 1) return {max_loss, risk_per_share, position_size:whole_shares_only === false ? Number(position_size.toFixed(2)) : 0, risk_status:'too_wide'};
    return {max_loss, risk_per_share, position_size:whole_shares_only === false ? Number(position_size.toFixed(2)) : position_size, risk_status:'fits_risk'};
  }

  function evaluateRewardRisk(entry, stop, firstTarget){
    const numericEntry = global.PullbackCore.numericOrNull(entry);
    const numericStop = global.PullbackCore.numericOrNull(stop);
    const numericFirstTarget = global.PullbackCore.numericOrNull(firstTarget);
    if(!Number.isFinite(numericEntry) || !Number.isFinite(numericStop) || !Number.isFinite(numericFirstTarget)){
      return {valid:false, riskPerShare:null, rewardPerShare:null, rrRatio:null, rrState:'invalid'};
    }
    const riskPerShare = numericEntry - numericStop;
    const rewardPerShare = numericFirstTarget - numericEntry;
    if(!Number.isFinite(riskPerShare) || !Number.isFinite(rewardPerShare) || riskPerShare <= 0 || rewardPerShare <= 0){
      return {valid:false, riskPerShare, rewardPerShare, rrRatio:null, rrState:'invalid'};
    }
    const rrRatio = rewardPerShare / riskPerShare;
    if(rrRatio >= 2) return {valid:true, riskPerShare, rewardPerShare, rrRatio, rrState:'strong'};
    if(rrRatio >= 1.5) return {valid:true, riskPerShare, rewardPerShare, rrRatio, rrState:'acceptable'};
    return {valid:true, riskPerShare, rewardPerShare, rrRatio, rrState:'weak'};
  }

  function targetReviewStateLabel(targetReviewState){
    if(targetReviewState === 'near_target') return 'Near Target';
    if(targetReviewState === 'at_target') return 'At Target';
    if(targetReviewState === 'beyond_target') return 'Beyond Target';
    return 'Not Near Target';
  }

  function deriveTargetReviewState(currentPrice, firstTarget){
    const price = global.PullbackCore.numericOrNull(currentPrice);
    const target = global.PullbackCore.numericOrNull(firstTarget);
    if(!Number.isFinite(price) || !Number.isFinite(target) || target <= 0) return 'not_near_target';
    if(price >= target * 1.01) return 'beyond_target';
    if(price >= target * 0.995) return 'at_target';
    if(price >= target * 0.98) return 'near_target';
    return 'not_near_target';
  }

  function dynamicExitRecommendation(targetReviewState, displayStage, setupScore){
    if(targetReviewState === 'beyond_target') return 'Consider trailing stop';
    if(targetReviewState === 'at_target'){
      return (displayStage === 'Entry' || (Number.isFinite(setupScore) && setupScore >= 8))
        ? 'Consider trailing stop'
        : 'Consider taking profit';
    }
    if(targetReviewState === 'near_target') return 'Review now';
    return 'Hold / monitor';
  }

  function targetReviewQueueLabel(targetReviewState){
    if(targetReviewState === 'near_target') return 'Near Target';
    if(targetReviewState === 'at_target') return 'At Target';
    if(targetReviewState === 'beyond_target') return 'Review Target';
    return '';
  }

  function deriveTradeability(planStatus, riskStatus, capitalFit){
    if(planStatus !== 'valid') return 'invalid';
    if(riskStatus !== 'fits_risk') return 'invalid';
    if(capitalFit === 'fits_capital') return 'tradable';
    if(capitalFit === 'too_expensive') return 'too_expensive';
    return 'risk_only';
  }

  global.PullbackPlanner = {
    evaluateRiskFit,
    evaluateRewardRisk,
    targetReviewStateLabel,
    deriveTargetReviewState,
    dynamicExitRecommendation,
    targetReviewQueueLabel,
    deriveTradeability
  };
})(window);
