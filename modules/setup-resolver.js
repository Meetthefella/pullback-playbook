// Pure scoring and resolver helpers for setup state, plan gating, and classification.
(function(global){
  function rrCategoryForView(view, deps = {}){
    const rrValue = deps.numericOrNull(view && view.rrValue);
    if(view && view.planUiState && view.planUiState.state === 'unrealistic_rr') return 'unrealistic';
    if(!Number.isFinite(rrValue)) return 'na';
    if(rrValue > 12) return 'unrealistic';
    if(rrValue > 8) return 'stretched';
    if(rrValue < deps.currentRrThreshold()) return 'low';
    return 'normal';
  }

  function finalStructureQualityForView(view){
    const derivedStates = view && view.setupStates ? view.setupStates : null;
    const structureState = String(view && view.structureState || (derivedStates && derivedStates.structureState) || '').toLowerCase();
    const stabilisationState = String(view && view.stabilisationState || (derivedStates && derivedStates.stabilisationState) || '').toLowerCase();
    const bounceState = String(view && view.bounceState || (derivedStates && derivedStates.bounceState) || '').toLowerCase();
    if(['broken','weak','developing_loose'].includes(structureState)) return 'weak';
    if(['strong','intact'].includes(structureState)) return 'strong';
    if(structureState === 'developing_clean') return 'developing_clean';
    if(['developing','weakening'].includes(structureState)){
      return bounceState === 'confirmed' && ['clear','early'].includes(stabilisationState)
        ? 'developing_clean'
        : 'developing_loose';
    }
    return 'developing_loose';
  }

  function practicalSizeFlagForPlan(plan, deps = {}){
    const safePlan = plan && typeof plan === 'object' ? plan : {};
    const positionSize = deps.numericOrNull(safePlan.positionSize);
    const riskPerShare = deps.numericOrNull(safePlan.riskPerShare);
    const maxLoss = deps.numericOrNull(safePlan.maxLoss) || deps.currentMaxLoss();
    if(Number.isFinite(positionSize) && positionSize <= 1) return 'tiny_size';
    if(Number.isFinite(positionSize) && Number.isFinite(riskPerShare) && Number.isFinite(maxLoss) && maxLoss > 0){
      const deployedRisk = positionSize * riskPerShare;
      if(deployedRisk > 0 && deployedRisk < (maxLoss * 0.4)) return 'low_impact';
    }
    return '';
  }

  function downgradeVerdict(verdict, steps = 1, deps = {}){
    const ladder = ['Entry','Near Entry','Watch','Avoid'];
    const start = ladder.indexOf(deps.normalizeAnalysisVerdict(verdict));
    if(start === -1) return 'Watch';
    return ladder[Math.min(ladder.length - 1, start + Math.max(0, steps))];
  }

  function evaluateSetupQualityAdjustments(record, options = {}, deps = {}){
    const rawRecord = record && typeof record === 'object' ? record : {};
    const derived = options.derivedStates || deps.analysisDerivedStatesFromRecord(rawRecord);
    const displayedPlan = options.displayedPlan || deps.deriveCurrentPlanState(
      rawRecord.plan && rawRecord.plan.entry,
      rawRecord.plan && rawRecord.plan.stop,
      rawRecord.plan && rawRecord.plan.firstTarget,
      rawRecord.marketData && rawRecord.marketData.currency
    );
    const baseVerdict = deps.normalizeAnalysisVerdict(
      options.baseVerdict
      || options.displayStage
      || options.rawVerdict
      || deps.baseVerdictForRecord(rawRecord, {includeRuntimeFallback:false})
    );
    const entry = deps.numericOrNull(displayedPlan.entry);
    const stop = deps.numericOrNull(displayedPlan.stop);
    const rrRatio = deps.numericOrNull(displayedPlan.rewardRisk && displayedPlan.rewardRisk.rrRatio);
    const positionSize = deps.numericOrNull(displayedPlan.riskFit && displayedPlan.riskFit.position_size);
    const stopPercent = Number.isFinite(entry) && Number.isFinite(stop) && entry > 0
      ? Math.abs(entry - stop) / entry
      : null;
    const trendState = String(derived.trendState || '').toLowerCase();
    const pullbackZone = String(derived.pullbackZone || '').toLowerCase();
    const structureState = String(derived.structureState || '').toLowerCase();
    const bounceState = String(derived.bounceState || '').toLowerCase();
    const stabilisationState = String(derived.stabilisationState || '').toLowerCase();
    const hostileMarket = deps.isHostileMarketStatus((rawRecord.meta && rawRecord.meta.marketStatus) || deps.marketStatus);
    const is50maSetup = pullbackZone === 'near_50ma';
    const lowControlSetup = Number.isFinite(stopPercent) && stopPercent > 0.045
      || (Number.isFinite(positionSize) && positionSize <= 2)
      || (is50maSetup && Number.isFinite(rrRatio) && rrRatio < 1.75);
    const tooWideForQualityPullback = Number.isFinite(stopPercent) && stopPercent > 0.05
      || (Number.isFinite(positionSize) && positionSize < 2)
      || (is50maSetup && Number.isFinite(rrRatio) && rrRatio < 1.6 && bounceState !== 'confirmed');
    const strongBounceConfirmation = bounceState === 'confirmed';
    const strongStabilisation = stabilisationState === 'clear' && bounceState === 'confirmed';
    const structureClearlyStrong = trendState === 'strong' && !['weak','weakening','broken'].includes(structureState);
    const strongEnoughToSurviveWeakRegime = is50maSetup
      && structureClearlyStrong
      && strongBounceConfirmation
      && strongStabilisation
      && Number.isFinite(stopPercent) && stopPercent < 0.02
      && Number.isFinite(positionSize) && positionSize > 2
      && Number.isFinite(rrRatio) && rrRatio >= 1.75
      && !lowControlSetup
      && !tooWideForQualityPullback;
    const borderlineWeakMarketConfirmation = bounceState === 'attempt'
      || bounceState === 'none'
      || stabilisationState !== 'clear'
      || (stabilisationState === 'clear' && bounceState !== 'confirmed');
    const weakRegimePenalty = hostileMarket
      && is50maSetup
      && (
        tooWideForQualityPullback
        || lowControlSetup
        || borderlineWeakMarketConfirmation
        || (baseVerdict === 'Entry' && !strongEnoughToSurviveWeakRegime)
      );
    const widthPenalty = tooWideForQualityPullback ? 2 : (lowControlSetup ? 1 : 0);
    const controlQuality = tooWideForQualityPullback ? 'Loose' : (lowControlSetup ? 'Moderate' : 'Tight');
    const capitalEfficiency = tooWideForQualityPullback || (Number.isFinite(positionSize) && positionSize <= 2) || (Number.isFinite(rrRatio) && rrRatio < 1.75)
      ? 'Inefficient'
      : (lowControlSetup ? 'Acceptable' : 'Efficient');
    const adjustmentReasons = [];
    if(Number.isFinite(stopPercent) && stopPercent > 0.045) adjustmentReasons.push('Wide stop for account size');
    if(Number.isFinite(positionSize) && positionSize <= 2) adjustmentReasons.push(`${positionSize} shares at max risk`);
    if(weakRegimePenalty) adjustmentReasons.push('50MA setup in weak market needs stronger confirmation');
    if(lowControlSetup && !adjustmentReasons.includes('Technically valid plan, but lower control than ideal')) adjustmentReasons.push('Technically valid plan, but lower control than ideal');
    return {
      stopPercent,
      lowControlSetup:!!lowControlSetup,
      tooWideForQualityPullback:!!tooWideForQualityPullback,
      weakRegimePenalty:!!weakRegimePenalty,
      widthPenalty,
      capitalEfficiency,
      controlQuality,
      verdictAdjustment:widthPenalty + (weakRegimePenalty ? 1 : 0),
      adjustmentReasons:[...new Set(adjustmentReasons)].slice(0, 4)
    };
  }

  function evaluatePlanRealism(record, options = {}, deps = {}){
    const item = record && typeof record === 'object' ? record : {};
    const derivedStates = options.derivedStates || deps.analysisDerivedStatesFromRecord(item);
    const displayedPlan = options.displayedPlan || deps.deriveCurrentPlanState(
      item.plan && item.plan.entry,
      item.plan && item.plan.stop,
      item.plan && item.plan.firstTarget,
      item.marketData && item.marketData.currency
    );
    const displayStage = deps.normalizeAnalysisVerdict(options.displayStage || item.scan && item.scan.verdict || item.review && item.review.savedVerdict || 'Watch');
    const qualityAdjustments = options.qualityAdjustments || evaluateSetupQualityAdjustments(item, {
      displayedPlan,
      derivedStates,
      displayStage,
      baseVerdict:displayStage
    }, deps);
    const setupUiState = options.setupUiState || (options.setupState ? {state:options.setupState} : deps.getSetupUiState(item, {displayStage}));
    const rawRr = deps.actionableRrValueForPlan(displayedPlan);
    const structureState = String(derivedStates.structureState || '').toLowerCase();
    const bounceState = String(derivedStates.bounceState || '').toLowerCase();
    const volumeState = String(derivedStates.volumeState || '').toLowerCase();
    const pullbackZone = String(derivedStates.pullbackZone || '').toLowerCase();
    const trendState = String(derivedStates.trendState || '').toLowerCase();
    const setupState = String(setupUiState && setupUiState.state || '').toLowerCase();
    const hostileMarket = !!(qualityAdjustments.weakRegimePenalty || deps.isHostileMarketStatus((item.meta && item.meta.marketStatus) || deps.marketStatus));
    const weakStructure = ['weak','weakening','broken'].includes(structureState);
    const looseStructure = ['developing_loose'].includes(String(options.structureQuality || ''));
    const developingSetup = setupState === 'developing' || pullbackZone === 'unknown' || trendState === 'mixed';
    const bounceUnclear = ['none','unconfirmed','attempt','early'].includes(bounceState);
    const weakVolume = volumeState === 'weak';
    const lowControl = !!(qualityAdjustments.lowControlSetup || qualityAdjustments.tooWideForQualityPullback);
    const optimisticTargetFlag = Number.isFinite(rawRr) && rawRr > 3 && (weakStructure || looseStructure || developingSetup || bounceUnclear || weakVolume || hostileMarket || lowControl);
    const reasons = [];
    const pushReason = value => {
      if(value && !reasons.includes(value)) reasons.push(value);
    };

    let rrRealism = 'invalid';
    let rrRealismLabel = 'Unavailable';
    let credibleTargetAssessment = 'No usable plan yet';
    let credibleRr = null;

    if(!Number.isFinite(rawRr)){
      pushReason('Plan is mathematically incomplete or invalid.');
    }else{
      credibleRr = rawRr;
      if(weakStructure || (optimisticTargetFlag && (bounceUnclear || hostileMarket || lowControl || weakVolume || developingSetup))){
        rrRealism = 'low';
        rrRealismLabel = 'Low confidence';
        credibleRr = Math.min(rawRr, 2.5);
        credibleTargetAssessment = optimisticTargetFlag ? 'Optimistic target for current structure' : 'Low-confidence target';
      }else if(looseStructure || developingSetup || bounceUnclear || weakVolume || hostileMarket || lowControl){
        rrRealism = 'conditional';
        rrRealismLabel = 'Conditional';
        credibleRr = Math.min(rawRr, 3);
        credibleTargetAssessment = 'Needs better confirmation before trusting full target';
      }else{
        rrRealism = 'high';
        rrRealismLabel = 'High confidence';
        credibleTargetAssessment = 'Target is realistic for current structure';
      }
    }

    if(optimisticTargetFlag) pushReason('Raw RR is high, but target is optimistic for current structure.');
    if(weakStructure || looseStructure) pushReason('Weak structure reduces confidence in distant target.');
    if(developingSetup && !weakStructure) pushReason('Developing structure does not yet justify a full recovery target.');
    if(bounceUnclear) pushReason('Wait for better confirmation before trusting full target.');
    if(weakVolume) pushReason('Weak volume lowers confidence in target follow-through.');
    if(hostileMarket) pushReason('Weak market conditions reduce target credibility.');
    if(lowControl) pushReason('Lower control reduces confidence in the full target.');

    const summary = reasons[0]
      || (rrRealism === 'high'
        ? 'Target realism is aligned with current structure.'
        : 'Plan is mathematically valid but lower confidence.');

    return {
      raw_rr:rawRr,
      rr_realism:rrRealism,
      rr_realism_label:rrRealismLabel,
      optimistic_target_flag:!!optimisticTargetFlag,
      plan_realism_reason:summary,
      credible_target_assessment:credibleTargetAssessment,
      credible_rr:credibleRr,
      reasons:reasons.slice(0, 4)
    };
  }

  function structureLabelForRecord(record, derivedStates = null, options = {}, deps = {}){
    const rawRecord = record && typeof record === 'object' ? record : {};
    const derived = derivedStates || deps.analysisDerivedStatesFromRecord(rawRecord);
    const displayStage = deps.normalizeAnalysisVerdict(options.displayStage || '');
    const trendState = String(derived.trendState || '').toLowerCase();
    const pullbackZone = String(derived.pullbackZone || '').toLowerCase();
    const structureState = String(derived.structureState || '').toLowerCase();
    const stabilisationState = String(derived.stabilisationState || '').toLowerCase();
    const bounceState = String(derived.bounceState || '').toLowerCase();
    const price = deps.numericOrNull(rawRecord.marketData && rawRecord.marketData.price);
    const ma50 = deps.numericOrNull(rawRecord.marketData && rawRecord.marketData.ma50);
    const ma200 = deps.numericOrNull(rawRecord.marketData && rawRecord.marketData.ma200);
    const brokenTrend = trendState === 'broken'
      || (Number.isFinite(price) && Number.isFinite(ma200) && price < ma200)
      || (Number.isFinite(ma50) && Number.isFinite(ma200) && ma50 < ma200);
    const brokenStructure = structureState === 'broken';
    const constructiveDeveloping = ['near_20ma','near_50ma'].includes(pullbackZone)
      && !brokenTrend
      && !brokenStructure
      && (bounceState === 'confirmed' || stabilisationState === 'clear' || stabilisationState === 'early');

    if(brokenTrend || brokenStructure) return 'Broken structure';
    if(displayStage !== 'Avoid' && ['weak','weakening'].includes(structureState) && constructiveDeveloping) return 'Developing structure';
    if(['weak','weakening'].includes(structureState)) return 'Weak structure';
    return '';
  }

  function warningStateFromInputs(record, analysis = null, derivedStates = null, deps = {}){
    const rawRecord = record && typeof record === 'object' ? record : {};
    const safeAnalysis = analysis && typeof analysis === 'object' ? analysis : null;
    const derived = derivedStates || deps.analysisDerivedStates(deps.tickerRecordToLegacyCard(rawRecord));
    const plan = rawRecord.plan && typeof rawRecord.plan === 'object' ? rawRecord.plan : {};
    const qualityAdjustments = evaluateSetupQualityAdjustments(rawRecord, {derivedStates:derived}, deps);
    const rrRatio = deps.numericOrNull(plan.plannedRR);
    const structureState = String(derived.structureState || '').toLowerCase();
    const stabilisationState = String(derived.stabilisationState || '').toLowerCase();
    const bounceState = String(derived.bounceState || '').toLowerCase();
    const volumeState = String(derived.volumeState || '').toLowerCase();
    const hostileMarket = deps.isHostileMarketStatus((rawRecord.meta && rawRecord.meta.marketStatus) || deps.marketStatus);
    const practicalSizeFlag = practicalSizeFlagForPlan(plan, deps);
    const cautionReasons = [];
    const pushReason = reason => {
      if(reason && !cautionReasons.includes(reason)) cautionReasons.push(reason);
    };

    const displayStage = deps.displayStageForRecord(rawRecord);
    const structureLabel = structureLabelForRecord(rawRecord, derived, {displayStage}, deps);
    if(structureLabel) pushReason(structureLabel);
    if(bounceState !== 'confirmed') pushReason(bounceState === 'none' ? 'No bounce' : 'Bounce unconfirmed');
    if(stabilisationState === 'early') pushReason('Early stabilisation only');
    if(volumeState === 'weak') pushReason('Weak volume');
    if(hostileMarket) pushReason('Hostile market');
    if(practicalSizeFlag === 'tiny_size') pushReason('Tiny size');
    if(practicalSizeFlag === 'low_impact') pushReason('Low impact');
    if(qualityAdjustments.lowControlSetup) pushReason('Lower control setup');
    if(qualityAdjustments.weakRegimePenalty) pushReason('Weak market needs stronger confirmation');
    if(Number.isFinite(rrRatio) && rrRatio >= 3 && (bounceState !== 'confirmed' || ['weak','weakening','broken'].includes(structureState))){
      pushReason('Paper R:R looks better than confirmation');
    }
    if(safeAnalysis && deps.normalizeAnalysisVerdict(safeAnalysis.final_verdict || safeAnalysis.verdict) !== 'Avoid' && hostileMarket && stabilisationState === 'early'){
      pushReason('Borderline setup in weak market');
    }

    const majorCaution = ['weak','weakening','broken'].includes(structureState) || practicalSizeFlag === 'tiny_size';
    return {
      showWarning:majorCaution || cautionReasons.length >= 2,
      reasons:cautionReasons.slice(0, 4)
    };
  }

  function deriveDisplaySetupScore(record, options = {}, deps = {}){
    const rawRecord = record && typeof record === 'object' ? record : {};
    const derived = options.derivedStates || deps.analysisDerivedStatesFromRecord(rawRecord);
    const warningState = options.warningState || warningStateFromInputs(rawRecord, options.analysis || null, derived, deps);
    const rawScore = deps.rawSetupScoreForRecord(rawRecord);
    const displayStage = deps.normalizeAnalysisVerdict(options.displayStage || deps.displayStageForRecord(rawRecord));
    const qualityAdjustments = options.qualityAdjustments || evaluateSetupQualityAdjustments(rawRecord, {derivedStates:derived}, deps);
    const hardFail = deps.isTrueHardFailForRecord(rawRecord, derived, {displayedPlan:options.displayedPlan});
    const structureState = String(derived.structureState || '').toLowerCase();
    const stabilisationState = String(derived.stabilisationState || '').toLowerCase();
    const bounceState = String(derived.bounceState || '').toLowerCase();
    const volumeState = String(derived.volumeState || '').toLowerCase();
    const hostileMarket = deps.isHostileMarketStatus((rawRecord.meta && rawRecord.meta.marketStatus) || deps.marketStatus);
    const practicalSizeFlag = practicalSizeFlagForPlan(rawRecord.plan, deps);
    const noBounce = bounceState === 'none';
    const confirmedBounce = bounceState === 'confirmed';
    let adjusted = rawScore;

    if(warningState.showWarning) adjusted -= 1;
    if(volumeState === 'weak') adjusted -= 1;
    if(hostileMarket) adjusted -= 0.5;
    if(structureState === 'broken') adjusted -= 4;
    if(!confirmedBounce && stabilisationState === 'early') adjusted -= 1;
    if(confirmedBounce) adjusted += 1;
    if(practicalSizeFlag === 'tiny_size') adjusted -= 2;
    if(practicalSizeFlag === 'low_impact') adjusted -= 1;
    if(qualityAdjustments.widthPenalty > 0) adjusted -= qualityAdjustments.widthPenalty;
    if(qualityAdjustments.weakRegimePenalty) adjusted -= 1;

    if(warningState.showWarning) adjusted = Math.min(adjusted, 9);
    if(volumeState === 'weak') adjusted = Math.min(adjusted, 8);
    if(hostileMarket) adjusted = Math.min(adjusted, 8);
    if(volumeState === 'weak' && hostileMarket) adjusted = Math.min(adjusted, 7);
    if(practicalSizeFlag === 'tiny_size') adjusted = Math.min(adjusted, 7);
    if(qualityAdjustments.widthPenalty >= 1) adjusted = Math.min(adjusted, 7);
    if(qualityAdjustments.widthPenalty >= 2) adjusted = Math.min(adjusted, 6);
    if(qualityAdjustments.weakRegimePenalty) adjusted = Math.min(adjusted, 6);
    if(noBounce && !confirmedBounce) adjusted = Math.min(adjusted, 4);
    if(confirmedBounce){
      adjusted = Math.max(adjusted, 5);
    }

    const rounded = Math.max(0, Math.min(10, Math.round(adjusted)));
    if(displayStage === 'Entry') return Math.max(8, Math.min(10, rounded));
    if(displayStage === 'Near Entry') return Math.max(6, Math.min(7, rounded));
    if(displayStage === 'Watch') return Math.max(4, Math.min(5, rounded));
    if(displayStage === 'Avoid') return Math.min(4, rounded);
    if(hardFail) return 0;
    return rounded;
  }

  function evaluateEntryTrigger(record, options = {}, deps = {}){
    const rawRecord = record && typeof record === 'object' ? record : {};
    const derived = options.derivedStates || deps.analysisDerivedStatesFromRecord(rawRecord);
    const displayedPlan = options.displayedPlan || deps.deriveCurrentPlanState(
      rawRecord.plan && rawRecord.plan.entry,
      rawRecord.plan && rawRecord.plan.stop,
      rawRecord.plan && rawRecord.plan.firstTarget,
      rawRecord.marketData && rawRecord.marketData.currency
    );
    const trendState = String(derived.trendState || '').toLowerCase();
    const pullbackZone = String(derived.pullbackZone || '').toLowerCase();
    const structureState = String(derived.structureState || '').toLowerCase();
    const stabilisationState = String(derived.stabilisationState || '').toLowerCase();
    const bounceState = String(derived.bounceState || '').toLowerCase();
    const hostileMarket = deps.isHostileMarketStatus((rawRecord.meta && rawRecord.meta.marketStatus) || deps.marketStatus);
    const currentPrice = deps.numericOrNull(rawRecord.marketData && rawRecord.marketData.price);
    const entry = displayedPlan.entry;
    const stop = displayedPlan.stop;
    const target = displayedPlan.target;
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
    const breakAboveTrigger = hasReviewedPlan && Number.isFinite(currentPrice) && Number.isFinite(entry) && currentPrice >= entry;
    const strongReversal = pullbackValid && structureIntact && confirmedBounce && clearStabilisation;
    const reclaimFollowThrough = pullbackValid && structureIntact && confirmedBounce && clearStabilisation && breakAboveTrigger;
    const triggerReady = trendValid && pullbackValid && structureIntact && !hardFail && hasReviewedPlan
      && confirmedBounce
      && clearStabilisation
      && !hostileMarket
      && (breakAboveTrigger || strongReversal || reclaimFollowThrough);
    const nearReady = !hardFail && pullbackValid && trendState !== 'broken' && structureIntact
      && (confirmedBounce || (bounceState === 'attempt' && clearStabilisation));
    const extendedFromEntry = hasReviewedPlan && Number.isFinite(currentPrice) && Number.isFinite(entry) && currentPrice > (entry * 1.03);
    const clearlyMissed = hasReviewedPlan && Number.isFinite(currentPrice) && Number.isFinite(entry) && currentPrice > (entry * 1.06);
    return {
      triggerState:hardFail ? 'invalidated' : (clearlyMissed ? 'missed' : (triggerReady ? 'triggered' : (nearReady ? 'near_ready' : 'waiting_for_trigger'))),
      entryTriggerReady:triggerReady,
      nearReady,
      hardFail,
      trendValid,
      pullbackValid,
      structureIntact,
      confirmedBounce,
      clearStabilisation,
      hasReviewedPlan,
      hostileMarket,
      extendedFromEntry,
      clearlyMissed
    };
  }

  function validateCurrentPlan(record, options = {}, deps = {}){
    const rawRecord = record && typeof record === 'object' ? record : {};
    const displayedPlan = options.displayedPlan || deps.deriveCurrentPlanState(
      rawRecord.plan && rawRecord.plan.entry,
      rawRecord.plan && rawRecord.plan.stop,
      rawRecord.plan && rawRecord.plan.firstTarget,
      rawRecord.marketData && rawRecord.marketData.currency
    );
    const trigger = options.triggerState || evaluateEntryTrigger(rawRecord, {displayedPlan, derivedStates:options.derivedStates}, deps);
    const entry = displayedPlan.entry;
    const stop = displayedPlan.stop;
    const target = displayedPlan.target;
    const currentPrice = deps.numericOrNull(rawRecord.marketData && rawRecord.marketData.price);
    const structurePremature = !trigger.trendValid || !trigger.structureIntact;
    const confirmationPremature = !trigger.confirmedBounce || !trigger.clearStabilisation;
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
    if(trigger.hardFail){
      return {state:'invalidated', valid:false, needsReplan:false, missed:false, invalidated:true, capitalConstraint:'', reasonCode:'technical_invalidation'};
    }
    if(trigger.clearlyMissed || (Number.isFinite(currentPrice) && Number.isFinite(target) && currentPrice >= (target * 0.98))){
      return {state:'missed', valid:false, needsReplan:false, missed:true, invalidated:false, capitalConstraint:'', reasonCode:'missed_setup'};
    }
    if(structurePremature || confirmationPremature){
      return {
        state:'pending_validation',
        valid:false,
        needsReplan:true,
        missed:false,
        invalidated:false,
        capitalConstraint:'',
        reasonCode:structurePremature ? 'weak_structure' : 'bounce_not_confirmed'
      };
    }
    const prospectiveRisk = (Number.isFinite(currentPrice) && Number.isFinite(stop) && Number.isFinite(target) && currentPrice > entry)
      ? deps.evaluateRewardRisk(currentPrice, stop, target)
      : displayedPlan.rewardRisk;
    const prospectiveRiskFit = (Number.isFinite(currentPrice) && Number.isFinite(stop) && currentPrice > entry)
      ? deps.evaluateRiskFit({entry:currentPrice, stop, ...deps.currentRiskSettings()})
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
      invalidated:false,
      capitalConstraint:(rawRecord.plan && rawRecord.plan.affordability === 'not_affordable') ? 'not_affordable' : ((rawRecord.plan && rawRecord.plan.affordability === 'heavy_capital') ? 'heavy_capital' : ''),
      reasonCode:staleMove ? 'plan_premature_or_stale' : 'valid'
    };
  }

  function isTerminalDeadSetup(record, options = {}, deps = {}){
    const item = deps.normalizeTickerRecord(record);
    const derivedStates = options.derivedStates || deps.analysisDerivedStatesFromRecord(item);
    const structureState = String(derivedStates.structureState || '').toLowerCase();
    const trendState = String(derivedStates.trendState || '').toLowerCase();
    const currentPrice = deps.numericOrNull(item.marketData && item.marketData.price);
    const stopPrice = deps.numericOrNull(item.plan && item.plan.stop);
    const invalidated = !!(item.plan && item.plan.invalidatedState);
    const missed = !!(item.plan && item.plan.missedState);
    const brokenBelowStop = Number.isFinite(currentPrice) && Number.isFinite(stopPrice) && currentPrice <= stopPrice;

    if(structureState === 'broken') return {dead:true, reasonCode:'broken_structure', terminalTriggerUsed:'structure_state'};
    if(trendState === 'broken') return {dead:true, reasonCode:'broken_trend', terminalTriggerUsed:'trend_state'};
    if(invalidated) return {dead:true, reasonCode:'invalidated', terminalTriggerUsed:'plan_invalidated'};
    if(missed) return {dead:true, reasonCode:'missed_state', terminalTriggerUsed:'plan_missed'};
    if(brokenBelowStop) return {dead:true, reasonCode:'stop_breach', terminalTriggerUsed:'price_below_stop'};

    return {dead:false, reasonCode:'', terminalTriggerUsed:'', fallbackStateIfNotDead:'monitor'};
  }

  function avoidSubtypeForRecord(record, options = {}, deps = {}){
    const item = deps.normalizeTickerRecord(record);
    const finalVerdict = deps.normalizeAnalysisVerdict(options.finalVerdict || deps.reviewHeaderVerdictForRecord(item));
    if(finalVerdict !== 'Avoid') return '';
    const derivedStates = options.derivedStates || deps.analysisDerivedStatesFromRecord(item);
    const displayedPlan = options.displayedPlan || deps.deriveCurrentPlanState(
      item.plan && item.plan.entry,
      item.plan && item.plan.stop,
      item.plan && item.plan.firstTarget,
      item.marketData && item.marketData.currency
    );
    const qualityAdjustments = options.qualityAdjustments || evaluateSetupQualityAdjustments(item, {displayedPlan, derivedStates}, deps);
    const planUiState = options.planUiState || deps.getPlanUiState(item, {displayedPlan});
    const structureState = String(derivedStates.structureState || '').toLowerCase();
    const trendState = String(derivedStates.trendState || '').toLowerCase();
    const bounceState = String(derivedStates.bounceState || '').toLowerCase();
    const volumeState = String(derivedStates.volumeState || '').toLowerCase();
    const rrValue = deps.numericOrNull(displayedPlan.rewardRisk && displayedPlan.rewardRisk.rrRatio);
    const setupScore = deps.setupScoreForRecord(item);
    const structureAlive = !['broken','weak'].includes(structureState) && trendState !== 'broken';
    const deadCheck = isTerminalDeadSetup(item, {derivedStates, displayedPlan}, deps);

    if(
      deadCheck.dead
      || (setupScore <= 3 && !structureAlive)
    ) return 'terminal';

    if(
      (structureAlive || structureState === 'weak')
      && (
        ['none','attempt','early'].includes(bounceState)
        || volumeState === 'weak'
        || qualityAdjustments.weakRegimePenalty
        || qualityAdjustments.lowControlSetup
        || qualityAdjustments.tooWideForQualityPullback
        || planUiState.state === 'invalid'
        || planUiState.state === 'unrealistic_rr'
        || (Number.isFinite(rrValue) && rrValue < deps.currentRrThreshold())
        || displayedPlan.affordability === 'heavy_capital'
        || displayedPlan.affordability === 'not_affordable'
        || displayedPlan.tradeability === 'too_expensive'
      )
    ) return 'conditional';

    return '';
  }

  function decisionReasoningForRecord(record, options = {}, deps = {}){
    const item = deps.normalizeTickerRecord(record);
    const reviewVerdict = deps.normalizeAnalysisVerdict(options.reviewVerdict || deps.displayStageForRecord(item));
    const scannerStatus = deps.normalizeAnalysisVerdict(options.scannerStatus || '');
    const derivedStates = options.derivedStates || deps.analysisDerivedStatesFromRecord(item);
    const displayedPlan = options.displayedPlan || deps.deriveCurrentPlanState(
      item.plan && item.plan.entry,
      item.plan && item.plan.stop,
      item.plan && item.plan.firstTarget,
      item.marketData && item.marketData.currency
    );
    const qualityAdjustments = options.qualityAdjustments || evaluateSetupQualityAdjustments(item, {displayedPlan, derivedStates}, deps);
    const warningState = options.warningState || warningStateFromInputs(item, null, derivedStates, deps);
    const avoidSubtype = options.avoidSubtype || avoidSubtypeForRecord(item, {derivedStates, displayedPlan, qualityAdjustments}, deps);
    const parts = [];
    const pushPart = value => {
      if(value && !parts.includes(value)) parts.push(value);
    };
    const removeMatchingParts = phrases => {
      const terms = (Array.isArray(phrases) ? phrases : [phrases])
        .map(value => String(value || '').trim().toLowerCase())
        .filter(Boolean);
      if(!terms.length) return;
      for(let idx = parts.length - 1; idx >= 0; idx -= 1){
        const text = String(parts[idx] || '').trim().toLowerCase();
        if(terms.some(term => text.includes(term) || term.includes(text))){
          parts.splice(idx, 1);
        }
      }
    };
    if(item.plan && item.plan.invalidatedState) pushPart('Setup invalidated');
    if(item.plan && item.plan.missedState) pushPart('Missed entry window');
    (qualityAdjustments.adjustmentReasons || []).forEach(pushPart);
    (warningState.reasons || []).forEach(pushPart);
    if(displayedPlan.riskFit && displayedPlan.riskFit.risk_status === 'too_wide') pushPart('Stop too wide');
    if(deps.executionCapitalBlocked(displayedPlan)) pushPart('Capital burden too high');
    if(!parts.length && item.scan && item.scan.reasons) item.scan.reasons.forEach(pushPart);

    const bounceState = String(derivedStates.bounceState || '').toLowerCase();
    const structureState = String(derivedStates.structureState || '').toLowerCase();
    const structureIntact = ['strong','intact','developing_clean'].includes(structureState);
    const bounceConfirmed = bounceState === 'confirmed';
    const weakMarket = !!qualityAdjustments.weakRegimePenalty || /weak market|hostile market/i.test(parts.join(' | '));
    let headline = reviewVerdict === 'Entry'
      ? 'Ready: review entry conditions'
      : (reviewVerdict === 'Near Entry'
        ? 'Prepare: near trigger'
        : (reviewVerdict === 'Avoid'
          ? (avoidSubtype === 'terminal' ? 'Avoid: terminal failure' : 'Avoid: needs confirmation')
          : ((bounceConfirmed && structureIntact) ? 'Monitor: conditions not supportive' : 'Monitor: setup still developing')));

    if(reviewVerdict === 'Avoid' && avoidSubtype === 'terminal'){
      if(item.plan && item.plan.invalidatedState){
        headline = 'Avoid: setup invalidated';
        removeMatchingParts('setup invalidated');
      }else if(item.plan && item.plan.missedState){
        headline = 'Avoid: missed setup';
        removeMatchingParts('missed entry window');
      }else if(structureState === 'broken' || String(derivedStates.trendState || '').toLowerCase() === 'broken'){
        headline = 'Avoid: broken structure';
        removeMatchingParts('broken structure');
      }else if(deps.getPlanUiState(item, {displayedPlan}).state === 'invalid'){
        headline = 'Avoid: invalid plan';
        removeMatchingParts(['invalid plan','stop too wide']);
      }
    }else if(reviewVerdict === 'Avoid' && avoidSubtype === 'conditional'){
      if(weakMarket && ['none','attempt','early'].includes(bounceState)){
        headline = 'Avoid: weak confirmation in weak market';
        removeMatchingParts(['weak market','hostile market','bounce unconfirmed','early stabilisation only','needs stronger confirmation']);
      }else if(bounceState === 'none'){
        headline = 'Avoid: no bounce confirmation';
        removeMatchingParts(['bounce unconfirmed','no bounce confirmation']);
      }else if(bounceState === 'early' || bounceState === 'attempt'){
        headline = 'Avoid: confirmation still early';
        removeMatchingParts(['early stabilisation only','needs stronger confirmation']);
      }
    }
    if(scannerStatus && deps.verdictRank(reviewVerdict) != null && deps.verdictRank(scannerStatus) != null && deps.verdictRank(reviewVerdict) < deps.verdictRank(scannerStatus)){
      if(weakMarket && ['none','attempt','early'].includes(bounceState)){
        headline = 'Downgraded: weak confirmation in weak market';
        removeMatchingParts(['weak market','hostile market','bounce unconfirmed','early stabilisation only','needs stronger confirmation']);
      }else if(parts[0]){
        headline = `Downgraded: ${parts[0].toLowerCase()}`;
        removeMatchingParts(parts[0]);
      }else{
        headline = 'Downgraded: review found weaker conditions';
      }
    }

    return {
      headline:headline.slice(0, 80),
      detail:parts.slice(0, 3).join(' | '),
      avoidSubtype
    };
  }

  function resolveScannerStateWithTrace(record, options = {}, deps = {}){
    const item = deps.normalizeTickerRecord(record);
    const baseView = options.baseView || deps.projectTickerForCard(item, {
      includeExecutionDowngrade:false,
      includeRuntimeFallback:false
    });
    const derivedStates = options.derivedStates || deps.analysisDerivedStatesFromRecord(baseView.item);
    const rrCategory = options.rrCategory || rrCategoryForView(baseView, deps);
    const structureQuality = options.structureQuality || finalStructureQualityForView({
      ...baseView,
      setupStates:derivedStates
    });
    const isStructureValid = ['strong','developing_clean'].includes(structureQuality);
    const bounceState = String(derivedStates.bounceState || '').toLowerCase();
    const hasPlanAdjustmentBlock = options.hasPlanAdjustmentBlock != null
      ? !!options.hasPlanAdjustmentBlock
      : (
        baseView.planUiState.state === 'needs_adjustment'
        || rrCategory === 'stretched'
        || !!(baseView.item && baseView.item.plan && baseView.item.plan.firstTargetTooClose)
      );
    const finalSetupState = baseView.setupUiState.state === 'broken'
      ? 'broken'
      : (
        baseView.setupUiState.state === 'developing'
        || !isStructureValid
        || bounceState === 'none'
        || hasPlanAdjustmentBlock
          ? 'developing'
          : baseView.setupUiState.state
      );
    const planValidation = String(baseView.planUiState.state || '');
    const planRealism = evaluatePlanRealism(item, {
      displayedPlan:baseView.displayedPlan,
      derivedStates,
      displayStage:baseView.displayStage,
      setupUiState:baseView.setupUiState,
      structureQuality
    }, deps);
    const setupScore = deps.numericOrNull(baseView.setupScore);
    const positionSize = deps.numericOrNull(baseView.positionSize);
    const rrValue = deps.numericOrNull(baseView.rrValue);
    const structureState = String(derivedStates.structureState || '').toLowerCase();
    const emojiPresentation = deps.resolveEmojiPresentation(item, {
      context:'scanner',
      finalVerdict:baseView.displayStage,
      setupUiState:baseView.setupUiState,
      displayedPlan:baseView.displayedPlan,
      derivedStates,
      warningState:baseView.warningState
    });
    const trace = [];
    const reasonCodes = [];
    const warnings = [];
    const addStep = (label, value) => trace.push(`${label}: ${value}`);
    const addReason = code => {
      if(code && !reasonCodes.includes(code)) reasonCodes.push(code);
    };
    const recordScanSetupType = deps.normalizeScanType(item.scan.scanSetupType || item.scan.scanType || '');
    const resolverSetupType = recordScanSetupType || deps.currentSetupType() || 'unknown';

    addStep('scan source', item.scan.setupOrigin || 'unknown');
    addStep('current global setup type', deps.currentSetupType() || 'unknown');
    addStep('record scan_setup_type', recordScanSetupType || 'unknown');
    addStep('resolver setup type used', resolverSetupType);
    addStep('setup origin', item.scan.setupOrigin || 'manual');
    addStep('price vs 20/50/200 MA', [
      Number.isFinite(item.marketData.price) ? `price=${deps.fmtPrice(item.marketData.price)}` : 'price=n/a',
      Number.isFinite(item.marketData.ma20) ? `20=${deps.fmtPrice(item.marketData.ma20)}` : '20=n/a',
      Number.isFinite(item.marketData.ma50) ? `50=${deps.fmtPrice(item.marketData.ma50)}` : '50=n/a',
      Number.isFinite(item.marketData.ma200) ? `200=${deps.fmtPrice(item.marketData.ma200)}` : '200=n/a'
    ].join(' | '));
    addStep('structure state', derivedStates.structureState || '(none)');
    addStep('pullback zone', derivedStates.pullbackZone || '(none)');
    addStep('stabilisation state', derivedStates.stabilisationState || '(none)');
    addStep('bounce state', derivedStates.bounceState || '(none)');
    addStep('volume state', derivedStates.volumeState || '(none)');
    addStep('market regime / caution', item.setup.marketCaution ? 'market caution' : 'normal');
    addStep('estimated RR / tradeability', [
      Number.isFinite(baseView.rrValue) ? `rr=${Number(baseView.rrValue).toFixed(2)}` : 'rr=n/a',
      baseView.displayedPlan && baseView.displayedPlan.tradeability ? `tradeability=${baseView.displayedPlan.tradeability}` : 'tradeability=n/a'
    ].join(' | '));
    addStep('raw setup score', Number.isFinite(setupScore) ? `${setupScore}/10` : 'n/a');
    addStep('setup state', finalSetupState);
    addStep('structure quality', structureQuality);
    addStep('plan validation', planValidation || '(none)');
    addStep('plan adjustment block', hasPlanAdjustmentBlock ? 'true' : 'false');
    addStep('rr realism', `${planRealism.rr_realism_label || 'Unavailable'} | ${planRealism.credible_target_assessment || 'n/a'}`);
    if(planRealism.optimistic_target_flag) addStep('target realism flag', 'first target too optimistic');
    if(item.setup.marketCaution) addReason('hostile_market');
    if(['none','attempt'].includes(bounceState)) addReason('bounce_not_confirmed');
    if(planRealism.optimistic_target_flag) addReason('first_target_too_optimistic');

    let rrReliability = 'high';
    let rrLabel = 'High confidence';
    if(planValidation === 'needs_adjustment' || hasPlanAdjustmentBlock){
      rrReliability = 'low';
      rrLabel = 'Invalid plan';
    }else if(structureState !== 'strong'){
      rrReliability = 'low';
      rrLabel = 'Low confidence';
    }else if(bounceState === 'none'){
      rrReliability = 'conditional';
      rrLabel = 'Needs bounce';
    }
    addStep('rr reliability', `${Number.isFinite(rrValue) ? Number(rrValue).toFixed(2) : 'n/a'} | ${rrLabel}`);

    let bucket = 'filtered';
    let status = 'Avoid';

    if(finalSetupState === 'broken'){
      addReason('broken_setup');
    }else if(planValidation === 'invalid'){
      addReason('plan_invalid');
    }else if(planValidation === 'unrealistic_rr' || rrCategory === 'unrealistic'){
      addReason('rr_unrealistic');
    }else if(Number.isFinite(positionSize) && positionSize < 1){
      addReason('size_below_one');
    }else if(hasPlanAdjustmentBlock || planValidation === 'needs_adjustment'){
      addReason('needs_adjustment');
    }else if(planValidation === 'pending_validation'){
      addReason('plan_premature');
    }else if(structureQuality === 'weak'){
      addReason('weak_structure');
    }else if(structureQuality === 'developing_loose'){
      addReason('loose_structure');
    }else if(structureQuality === 'developing_clean' && bounceState !== 'confirmed'){
      addReason('developing_no_bounce');
    }else if(structureQuality === 'developing_clean' && bounceState === 'confirmed'){
      bucket = 'early';
      status = 'Watch';
      addReason('developing_confirmed_bounce');
    }else if(structureQuality === 'strong' && ['none','attempt'].includes(bounceState)){
      bucket = 'early';
      status = 'Watch';
      addReason(bounceState === 'attempt' ? 'bounce_attempt' : 'no_bounce');
    }else if(Number.isFinite(setupScore) && setupScore < 6){
      bucket = 'early';
      status = 'Watch';
      addReason('score_below_tradeable_floor');
    }else if(structureQuality === 'strong' && bounceState === 'confirmed' && planValidation === 'valid'){
      bucket = 'tradeable';
      status = Number.isFinite(setupScore) && setupScore >= 8 ? 'Entry' : 'Near Entry';
      addReason(status === 'Entry' ? 'high_score_tradeable' : 'tradeable_not_elite');
    }else{
      addReason('filtered_default');
    }

    const finalDisplayState = String(emojiPresentation.primaryLabel || 'Monitor');
    const finalDisplayBucket = emojiPresentation.primaryState === 'dead'
      ? 'filtered'
      : (['developing','monitor'].includes(String(emojiPresentation.primaryState || '').toLowerCase()) ? 'early' : bucket);
    const remapReason = status === 'Avoid' && ['developing','monitor'].includes(String(emojiPresentation.primaryState || '').toLowerCase())
      ? 'weak but still technically alive'
      : '';

    addStep('raw resolver verdict', status);
    addStep('final display state', finalDisplayState);
    if(remapReason) addStep('remap reason', remapReason);
    addStep('resulting bucket', finalDisplayBucket);

    const legacyStatus = deps.normalizeAnalysisVerdict(baseView.displayStage || '');
    if(legacyStatus && legacyStatus !== status){
      warnings.push(`WARNING: status mismatch resolved. legacy=${legacyStatus}, resolved=${status}`);
    }
    if(status === 'Avoid' && ['developing','monitor'].includes(String(emojiPresentation.primaryState || '').toLowerCase())){
      warnings.push(`INFO: raw Avoid softened to ${finalDisplayState} because the setup is still technically alive`);
    }

    return {
      status,
      bucket:finalDisplayBucket,
      reason_codes:reasonCodes,
      score:setupScore,
      rr_value:rrValue,
      rr_reliability:rrReliability,
      rr_label:rrLabel,
      trace,
      warnings,
      derivedStates,
      rrCategory,
      structureQuality,
      isStructureValid,
      hasPlanAdjustmentBlock,
      setupState:finalSetupState,
      rawResolverVerdict:status,
      finalDisplayState,
      remapReason
    };
  }

  function resolveScannerState(record, options = {}, deps = {}){
    const resolved = resolveScannerStateWithTrace(record, options, deps);
    return {
      status:resolved.status,
      bucket:resolved.bucket,
      reason_codes:resolved.reason_codes
    };
  }

  function getFinalClassification(view, deps = {}){
    const resolved = view && view.scannerResolution
      ? view.scannerResolution
      : resolveScannerStateWithTrace(view && view.item ? view.item : view, {baseView:view}, deps);
    const item = view && view.item ? view.item : view;
    const presentation = deps.resolveEmojiPresentation(item, {
      context:'scanner',
      finalVerdict:view && (view.displayStage || view.finalVerdict),
      setupUiState:view && view.setupUiState,
      displayedPlan:view && view.displayedPlan,
      derivedStates:view && view.setupStates,
      warningState:view && view.warningState
    });
    const primaryState = String(presentation.primaryState || '').toLowerCase();
    if(primaryState === 'dead') return 'filtered';
    if(primaryState === 'entry' || primaryState === 'near_entry') return 'tradeable';
    if(primaryState === 'monitor' || primaryState === 'developing') return 'early';
    return resolved.bucket;
  }

  function legacyBucketForFinalClassification(finalClassification){
    if(finalClassification === 'tradeable') return 'focus';
    if(finalClassification === 'early') return 'tradeable_secondary';
    return 'filtered';
  }

  global.PullbackSetupResolver = {
    rrCategoryForView,
    finalStructureQualityForView,
    practicalSizeFlagForPlan,
    downgradeVerdict,
    evaluateSetupQualityAdjustments,
    evaluatePlanRealism,
    structureLabelForRecord,
    warningStateFromInputs,
    deriveDisplaySetupScore,
    evaluateEntryTrigger,
    validateCurrentPlan,
    isTerminalDeadSetup,
    avoidSubtypeForRecord,
    decisionReasoningForRecord,
    resolveScannerStateWithTrace,
    resolveScannerState,
    getFinalClassification,
    legacyBucketForFinalClassification
  };
})(window);
