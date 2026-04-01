// Pure scanner and setup-derivation helpers, plus dependency-injected wrappers.
(function(global){
  function scannerFieldLabel(field){
    return {
      exchange:'Exchange',
      perf1w:'Perf 1W',
      price:'Price',
      sma20:'SMA 20',
      sma50:'SMA 50',
      sma200:'SMA 200',
      avgVolume30d:'Avg Volume 30D',
      marketCap:'Market Cap',
      rsi14:'RSI 14',
      perf1m:'Perf 1M',
      perf3m:'Perf 3M',
      perf6m:'Perf 6M',
      perfYtd:'Perf YTD'
    }[field] || field;
  }

  function formatRuleNumber(value){
    if(!Number.isFinite(value)) return 'missing';
    if(Math.abs(value) >= 1000000) return Number(value).toLocaleString(undefined, {maximumFractionDigits:0});
    return Number(value).toLocaleString(undefined, {maximumFractionDigits:2});
  }

  function formatScannerRule(rule){
    if(!rule || typeof rule !== 'object') return 'Unknown rule';
    if(rule.label) return rule.label;
    const right = rule.valueField ? scannerFieldLabel(rule.valueField) : Number(rule.value || 0).toLocaleString();
    return `${scannerFieldLabel(rule.field)} ${rule.operator} ${right}`;
  }

  function compareValues(left, operator, right){
    if(!Number.isFinite(left) || !Number.isFinite(right)) return false;
    if(operator === '>') return left > right;
    if(operator === '>=') return left >= right;
    if(operator === '<') return left < right;
    if(operator === '<=') return left <= right;
    if(operator === '===') return left === right;
    return false;
  }

  function isUsExchange(exchange){
    return ['NASDAQ', 'NYSE', 'AMEX'].includes(String(exchange || '').trim().toUpperCase());
  }

  function evaluateScannerRuleDetailed(rule, data){
    if(!rule || typeof rule !== 'object') return {passed:false, label:'Invalid rule'};
    if(rule.rules && Array.isArray(rule.rules)){
      const details = rule.rules.map(item => evaluateScannerRuleDetailed(item, data));
      const mode = rule.mode === 'any' ? 'any' : 'all';
      const passed = mode === 'any' ? details.some(item => item.passed) : details.every(item => item.passed);
      return {passed, label:rule.label || 'Rule group', details};
    }
    const left = global.PullbackCore.numericOrNull(data && data[rule.field]);
    const right = rule.valueField ? global.PullbackCore.numericOrNull(data && data[rule.valueField]) : global.PullbackCore.numericOrNull(rule.value);
    const passed = compareValues(left, rule.operator, right);
    const leftLabel = `${scannerFieldLabel(rule.field)} ${formatRuleNumber(left)}`;
    const rightLabel = rule.valueField
      ? `${scannerFieldLabel(rule.valueField)} ${formatRuleNumber(right)}`
      : formatRuleNumber(right);
    return {
      passed,
      label:`${leftLabel} ${rule.operator} ${rightLabel} = ${passed ? 'PASS' : 'FAIL'}`,
      left,
      right
    };
  }

  function evaluateScannerRule(rule, data){
    if(!rule || typeof rule !== 'object') return false;
    if(rule.rules && Array.isArray(rule.rules)){
      const mode = rule.mode === 'any' ? 'any' : 'all';
      const results = rule.rules.map(item => evaluateScannerRule(item, data));
      return mode === 'any' ? results.some(Boolean) : results.every(Boolean);
    }
    if(!data || typeof data !== 'object' || !rule.field || !rule.operator) return false;
    const left = global.PullbackCore.numericOrNull(data && data[rule.field]);
    const right = rule.valueField ? global.PullbackCore.numericOrNull(data && data[rule.valueField]) : global.PullbackCore.numericOrNull(rule.value);
    return compareValues(left, rule.operator, right);
  }

  function isNearLevel(price, level, tolerance){
    if(!Number.isFinite(price) || !Number.isFinite(level) || level === 0) return false;
    return Math.abs(price - level) / level <= tolerance;
  }

  function buildScannerChecks(data){
    const price = global.PullbackCore.numericOrNull(data && data.price);
    const sma20 = global.PullbackCore.numericOrNull(data && data.sma20);
    const sma50 = global.PullbackCore.numericOrNull(data && data.sma50);
    const sma200 = global.PullbackCore.numericOrNull(data && data.sma200);
    const perf1w = global.PullbackCore.numericOrNull(data && data.perf1w);
    const volume = global.PullbackCore.numericOrNull(data && data.volume);
    const avgVolume30d = global.PullbackCore.numericOrNull(data && data.avgVolume30d);
    const near20 = isNearLevel(price, sma20, 0.025);
    const near50 = isNearLevel(price, sma50, 0.035);
    const trendStrong = Number.isFinite(price) && Number.isFinite(sma50) && Number.isFinite(sma200) && Number.isFinite(sma20) && price > sma50 && price > sma200 && sma20 > sma50 && sma50 > sma200;
    const structureBroken = Number.isFinite(price) && Number.isFinite(sma50) && Number.isFinite(sma20) && price < sma50 && sma20 < sma50;
    const relevantReclaim = near50 && Number.isFinite(sma50) ? sma50 : sma20;
    const reclaimedSupport = Number.isFinite(price) && Number.isFinite(relevantReclaim) && price >= relevantReclaim * 0.998;
    const bounceReady = Number.isFinite(perf1w) && perf1w >= 2 && reclaimedSupport && !structureBroken;
    return {
      trendStrong,
      above50:Number.isFinite(price) && Number.isFinite(sma50) && price > sma50,
      above200:Number.isFinite(price) && Number.isFinite(sma200) && price > sma200,
      ma50gt200:Number.isFinite(sma50) && Number.isFinite(sma200) && sma50 > sma200,
      near20,
      near50,
      stabilising:(near20 || near50) && (!Number.isFinite(perf1w) || perf1w > -1.5),
      bounce:bounceReady,
      bounceStrength:Number.isFinite(perf1w)
        ? (perf1w >= 3 ? 'strong' : (perf1w >= 1 ? 'moderate' : (perf1w > 0 ? 'weak' : 'none')))
        : 'none',
      volume:Number.isFinite(volume) && Number.isFinite(avgVolume30d) && avgVolume30d > 0 ? volume >= avgVolume30d * 0.8 : false,
      structureBroken
    };
  }

  function priorHighTarget(data, scanType){
    const rows = Array.isArray(data && data.history) ? data.history : [];
    const price = global.PullbackCore.numericOrNull(data && data.price);
    if(!rows.length || !Number.isFinite(price)) return null;
    const lookback = scanType === '50MA' ? 84 : 42;
    const windowRows = rows.slice(1, lookback);
    const highs = windowRows.map(row => global.PullbackCore.numericOrNull(row.high ?? row.close)).filter(Number.isFinite).filter(value => value > price);
    if(!highs.length) return null;
    return Math.max(...highs);
  }

  function nearestPivotTargets(data, price, lookback = 42){
    const rows = Array.isArray(data && data.history) ? data.history : [];
    if(!rows.length || !Number.isFinite(price)) return [];
    const windowRows = rows.slice(1, Math.max(lookback, 6));
    const pivots = [];
    for(let index = 1; index < windowRows.length - 1; index += 1){
      const prevHigh = global.PullbackCore.numericOrNull(windowRows[index - 1] && (windowRows[index - 1].high ?? windowRows[index - 1].close));
      const currentHigh = global.PullbackCore.numericOrNull(windowRows[index] && (windowRows[index].high ?? windowRows[index].close));
      const nextHigh = global.PullbackCore.numericOrNull(windowRows[index + 1] && (windowRows[index + 1].high ?? windowRows[index + 1].close));
      if(!Number.isFinite(prevHigh) || !Number.isFinite(currentHigh) || !Number.isFinite(nextHigh)) continue;
      if(currentHigh >= prevHigh && currentHigh > nextHigh && currentHigh > price){
        pivots.push(currentHigh);
      }
    }
    return [...new Set(pivots.map(value => Number(value.toFixed(2))))].sort((a, b) => a - b);
  }

  function realisticFirstTarget(data, scanType, options = {}){
    const price = global.PullbackCore.numericOrNull(data && data.price);
    const entry = global.PullbackCore.numericOrNull(options.entry);
    const riskPerShare = global.PullbackCore.numericOrNull(options.riskPerShare);
    const sma20 = global.PullbackCore.numericOrNull(data && data.sma20);
    const sma50 = global.PullbackCore.numericOrNull(data && data.sma50);
    const checks = options.checks || buildScannerChecks(data || {});
    const perf1w = global.PullbackCore.numericOrNull(data && data.perf1w);
    if(!Number.isFinite(price) || !Number.isFinite(entry)) return null;
    const scanStyle = scanType === '50MA' ? '50MA' : '20MA';
    const pivots = nearestPivotTargets(data, price, scanStyle === '50MA' ? 84 : 42);
    const nearestPivot = pivots.find(level => level > entry);
    const priorHigh = priorHighTarget(data, scanStyle);
    const above20 = Number.isFinite(price) && Number.isFinite(sma20) && price >= sma20;
    const above50 = Number.isFinite(price) && Number.isFinite(sma50) && price >= sma50;
    const strongStructure = !!(checks.trendStrong && above20 && above50 && Number.isFinite(perf1w) && perf1w >= 2);
    const confirmationStrong = !!(checks.bounce && above20 && Number.isFinite(perf1w) && perf1w >= 2);
    const weakOrEarly = !strongStructure || !confirmationStrong || !!checks.structureBroken;
    const conservativeCap = Number.isFinite(riskPerShare) ? entry + (riskPerShare * (weakOrEarly ? 2 : 3)) : null;
    const modestRecovery = Number.isFinite(riskPerShare) ? entry + (riskPerShare * 2) : (entry * (weakOrEarly ? 1.03 : 1.05));
    if(weakOrEarly){
      if(Number.isFinite(nearestPivot)) return nearestPivot;
      if(Number.isFinite(conservativeCap)) return conservativeCap;
      if(Number.isFinite(priorHigh)) return Math.min(priorHigh, Number.isFinite(modestRecovery) ? modestRecovery : priorHigh);
      return modestRecovery;
    }
    if(Number.isFinite(nearestPivot)) return nearestPivot;
    if(Number.isFinite(priorHigh)) return priorHigh;
    if(Number.isFinite(conservativeCap)) return conservativeCap;
    return modestRecovery;
  }

  function deriveTradePlan(data, scanType, deps){
    const price = deps.numericOrNull(data.price);
    const sma20 = deps.numericOrNull(data.sma20);
    const sma50 = deps.numericOrNull(data.sma50);
    if(!Number.isFinite(price) || !Number.isFinite(sma20) || !Number.isFinite(sma50)) return {entry:null, stop:null, target:null, riskPerShare:null, rewardPerShare:null, rr:null, rrState:'invalid', rrValid:false, firstTargetTooClose:false, positionSize:0, stopBufferPct:null};
    const support = scanType === '50MA' ? sma50 : sma20;
    const backupSupport = scanType === '50MA' ? sma20 : sma50;
    const entry = Math.max(price, support);
    const stopBufferPct = price < 50 ? 0.02 : (price <= 200 ? 0.015 : 0.01);
    const stop = Math.min(price, Math.min(support, backupSupport) * (1 - stopBufferPct));
    const riskFit = deps.evaluateRiskFit({
      entry,
      stop,
      ...deps.currentRiskSettings()
    });
    const riskPerShare = Number.isFinite(riskFit.risk_per_share) ? riskFit.risk_per_share : null;
    const checks = deps.buildScannerChecks(data);
    const target = deps.realisticFirstTarget(data, scanType, {
      entry,
      riskPerShare,
      checks
    });
    const rewardRisk = deps.evaluateRewardRisk(entry, stop, target);
    return {
      entry,
      stop,
      target,
      riskPerShare,
      rewardPerShare:rewardRisk.rewardPerShare,
      rr:rewardRisk.rrRatio,
      rrRatio:rewardRisk.rrRatio,
      rrState:rewardRisk.rrState,
      rrValid:rewardRisk.valid,
      stopBufferPct,
      firstTargetTooClose:rewardRisk.valid ? rewardRisk.rewardPerShare < (1.5 * rewardRisk.riskPerShare) : false,
      positionSize:riskFit.position_size,
      maxLoss:riskFit.max_loss,
      riskStatus:riskFit.risk_status
    };
  }

  function deriveSetupStates(card, data, checks, tradePlan, deps){
    const safeCard = card || {};
    const safeData = data || {};
    const baseChecks = deps.buildScannerChecks(safeData);
    const preflightChecks = deps.mergeDerivedChecks((safeCard && safeCard.checks) || {}, checks || baseChecks, null);
    const initialScanType = deps.resolveScanType(safeCard, safeData, preflightChecks);
    const plan = tradePlan || deriveTradePlan(safeData, initialScanType === 'unknown' ? '20MA' : initialScanType, deps);
    const safeChecks = deps.mergeDerivedChecks((safeCard && safeCard.checks) || {}, checks || baseChecks, plan);
    const scanType = deps.resolveScanType(safeCard, safeData, safeChecks);
    const price = deps.numericOrNull(safeData.price ?? safeCard.price);
    const sma20 = deps.numericOrNull(safeData.sma20 ?? safeCard.sma20);
    const sma50 = deps.numericOrNull(safeData.sma50 ?? safeCard.sma50);
    const sma200 = deps.numericOrNull(safeData.sma200 ?? safeCard.sma200);
    const perf1w = deps.numericOrNull(safeData.perf1w ?? safeCard.perf1w);
    const perf3m = deps.numericOrNull(safeData.perf3m ?? safeCard.perf3m);
    const volume = deps.numericOrNull(safeData.volume ?? safeCard.volume);
    const avgVolume30d = deps.numericOrNull(safeData.avgVolume30d ?? safeCard.avgVolume30d);
    const rows = Array.isArray(safeData.history) ? safeData.history : [];
    const recentRows = rows.slice(0, 5);
    const dist20 = Number.isFinite(price) && Number.isFinite(sma20) && sma20 > 0 ? (price - sma20) / sma20 : null;
    const dist50 = Number.isFinite(price) && Number.isFinite(sma50) && sma50 > 0 ? (price - sma50) / sma50 : null;
    const entryDefined = !!(safeCard.entry || safeChecks.entryDefined || Number.isFinite(plan.entry));
    const stopDefined = !!(safeCard.stop || safeChecks.stopDefined || Number.isFinite(plan.riskPerShare) && plan.riskPerShare > 0);
    const targetDefined = !!(safeCard.target || safeChecks.targetDefined || Number.isFinite(plan.target)) && Number.isFinite(plan.rr) && plan.rr > 0;

    let trendState = 'weak';
    if((Number.isFinite(price) && Number.isFinite(sma200) && price < sma200) || (Number.isFinite(sma50) && Number.isFinite(sma200) && sma50 < sma200)){
      trendState = 'broken';
    }else if(Number.isFinite(price) && Number.isFinite(sma50) && Number.isFinite(sma200) && price > sma50 && price > sma200 && sma50 > sma200){
      trendState = 'strong';
    }else if(Number.isFinite(price) && Number.isFinite(sma200) && Number.isFinite(sma50) && price > sma200 && sma50 > sma200){
      trendState = 'acceptable';
    }else if(Number.isFinite(price) && Number.isFinite(sma200) && price > sma200){
      trendState = 'weak';
    }
    if(trendState === 'acceptable' && Number.isFinite(perf3m) && perf3m < 2) trendState = 'weak';

    let pullbackZone = 'none';
    if(Number.isFinite(dist20) && dist20 >= -0.03 && dist20 <= 0.02 && (!Number.isFinite(dist50) || Math.abs(dist20) <= Math.abs(dist50))){
      pullbackZone = 'near_20ma';
    }else if(Number.isFinite(dist50) && dist50 >= -0.05 && dist50 <= 0.02){
      pullbackZone = 'near_50ma';
    }else if((scanType === '20MA' && Number.isFinite(dist20) && dist20 < -0.06) || (scanType === '50MA' && Number.isFinite(dist50) && dist50 < -0.07) || safeChecks.structureBroken){
      pullbackZone = 'extended';
    }

    let structureState = 'weakening';
    if(safeChecks.structureBroken || trendState === 'broken'){
      structureState = 'broken';
    }else if(safeChecks.trendStrong && (pullbackZone === 'near_20ma' || pullbackZone === 'near_50ma') && Number.isFinite(perf1w) && perf1w > -4){
      structureState = 'intact';
    }else{
      structureState = 'weakening';
    }

    const recentHighs = recentRows.map(row => deps.numericOrNull(row && (row.high ?? row.close))).filter(Number.isFinite);
    const recentLows = recentRows.map(row => deps.numericOrNull(row && (row.low ?? row.close))).filter(Number.isFinite);
    const recentCloses = recentRows.map(row => deps.numericOrNull(row && row.close)).filter(Number.isFinite);
    const reclaimArea = scanType === '50MA'
      ? Math.max(...[sma50, sma20].filter(Number.isFinite))
      : Math.max(...[sma20, sma50].filter(Number.isFinite));
    const localPivotHigh = recentHighs.length >= 3 ? Math.max(...recentHighs.slice(1, 3)) : null;
    const localPivotLow = recentLows.length >= 3 ? Math.min(...recentLows.slice(1, 3)) : null;
    const reclaimConfirmed = Number.isFinite(price)
      && (
        (Number.isFinite(reclaimArea) && price >= reclaimArea * 0.998)
        || (Number.isFinite(localPivotHigh) && price >= localPivotHigh * 0.998)
      );
    const worseningHighs = recentHighs.length >= 3 && recentHighs[0] < recentHighs[1] && recentHighs[1] < recentHighs[2];
    const worseningCloses = recentCloses.length >= 3 && recentCloses[0] < recentCloses[1] && recentCloses[1] < recentCloses[2];
    const pullbackStoppedWorsening = (recentCloses.length >= 2 && recentCloses[0] >= recentCloses[1] * 0.995)
      || (Number.isFinite(localPivotLow) && Number.isFinite(price) && price >= localPivotLow);
    const strongStructureContext = structureState === 'intact' && trendState !== 'broken';
    const supportiveVolume = safeChecks.volume || (Number.isFinite(volume) && Number.isFinite(avgVolume30d) && volume >= avgVolume30d * 0.95);
    if(structureState !== 'broken' && (trendState === 'weak' || worseningHighs || worseningCloses || (Number.isFinite(perf1w) && perf1w < -2))){
      structureState = 'weak';
    }

    let stabilisationState = 'none';
    if((pullbackZone === 'near_20ma' || pullbackZone === 'near_50ma') && pullbackStoppedWorsening && !worseningCloses && !worseningHighs && reclaimConfirmed){
      stabilisationState = 'clear';
    }else if((pullbackZone === 'near_20ma' || pullbackZone === 'near_50ma') && (pullbackStoppedWorsening || safeChecks.stabilising || (Number.isFinite(perf1w) && perf1w > -1.5))){
      stabilisationState = 'early';
    }

    let bounceState = 'none';
    if(
      strongStructureContext
      && safeChecks.bounce
      && reclaimConfirmed
      && pullbackStoppedWorsening
      && !worseningHighs
      && stabilisationState === 'clear'
      && supportiveVolume
      && Number.isFinite(perf1w) && perf1w >= 2
    ){
      bounceState = 'confirmed';
    }else if(
      (safeChecks.bounce || stabilisationState === 'early' || (Number.isFinite(perf1w) && perf1w >= 0))
      && !safeChecks.structureBroken
    ){
      bounceState = 'attempt';
    }

    let volumeState = 'normal';
    if(safeChecks.volume && bounceState !== 'none'){
      volumeState = 'supportive';
    }else if(Number.isFinite(volume) && Number.isFinite(avgVolume30d) && avgVolume30d > 0){
      if(volume >= avgVolume30d * 1.1 && bounceState !== 'none') volumeState = 'supportive';
      else if(volume < avgVolume30d * 0.8) volumeState = 'weak';
    }

    return {
      trend_state:trendState,
      pullback_zone:pullbackZone,
      structure_state:structureState,
      stabilisation_state:stabilisationState,
      bounce_state:bounceState,
      volume_state:volumeState,
      scan_type:scanType,
      entry_defined:entryDefined ? 'yes' : 'no',
      stop_defined:stopDefined ? 'yes' : 'no',
      target_defined:targetDefined ? 'yes' : 'no'
    };
  }

  global.PullbackScanner = {
    scannerFieldLabel,
    formatRuleNumber,
    formatScannerRule,
    compareValues,
    isUsExchange,
    evaluateScannerRuleDetailed,
    evaluateScannerRule,
    isNearLevel,
    buildScannerChecks,
    priorHighTarget,
    nearestPivotTargets,
    realisticFirstTarget,
    deriveTradePlan,
    deriveSetupStates
  };
})(window);
