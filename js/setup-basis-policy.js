(function(global){
  function normalizeScanTypeSafe(value, deps){
    if(deps && typeof deps.normalizeScanType === 'function'){
      const normalized = String(deps.normalizeScanType(value) || '').trim().toUpperCase();
      if(['20MA', '50MA', 'AMBIGUOUS'].includes(normalized)) return normalized;
      return '';
    }
    const safe = String(value || '').trim().toUpperCase();
    if(['20MA', '50MA', 'AMBIGUOUS'].includes(safe)) return safe;
    return '';
  }

  function numericOrNullSafe(value, deps){
    if(deps && typeof deps.numericOrNull === 'function') return deps.numericOrNull(value);
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function normalizeStoredSetupType(context = {}, deps = {}){
    return normalizeScanTypeSafe(context.value, deps);
  }

  function currentSetupType(context = {}, deps = {}){
    const safeState = context.state && typeof context.state === 'object' ? context.state : {};
    return normalizeStoredSetupType({value:safeState.setupType}, deps) || 'unknown';
  }

  function selectedQuickScanType(context = {}, deps = {}){
    let value = '';
    if(typeof context.getElementValue === 'function'){
      value = context.getElementValue('scannerSetupType');
    }else if(context.document && typeof context.document.getElementById === 'function'){
      const element = context.document.getElementById('scannerSetupType');
      value = element ? element.value : '';
    }
    return normalizeStoredSetupType({value}, deps);
  }

  function scanTypeForEvaluation(scanType, deps = {}){
    const normalized = normalizeScanTypeSafe(scanType, deps);
    if(normalized === '50MA' || normalized === 'AMBIGUOUS') return '50MA';
    if(normalized === '20MA') return '20MA';
    return '20MA';
  }

  function resolveSetupTypeWithOverlap(context = {}, deps = {}){
    const card = context.card || {};
    const data = context.data || {};
    const checks = context.checks || {};
    const safeState = context.state && typeof context.state === 'object' ? context.state : {};
    const explicit = normalizeScanTypeSafe(
      card.scanSetupType || card.scanType || card.setupType || data.scanSetupType || data.scanType || data.setupType,
      deps
    );
    const globalType = currentSetupType({state:safeState}, deps);
    const price = numericOrNullSafe(data.price ?? card.price, deps);
    const sma20 = numericOrNullSafe(data.sma20 ?? card.sma20, deps);
    const sma50 = numericOrNullSafe(data.sma50 ?? card.sma50, deps);
    const perf1w = numericOrNullSafe(data.perf1w ?? card.perf1w, deps);
    const near20 = !!checks.near20;
    const near50 = !!checks.near50;
    const overlapDetected = near20 && near50;
    const marketWeak = /below 50 ma|weak|hostile/i.test(String(safeState.marketStatus || ''));
    const distance20 = Number.isFinite(price) && Number.isFinite(sma20) && sma20 > 0 ? Math.abs(price - sma20) / sma20 : null;
    const distance50 = Number.isFinite(price) && Number.isFinite(sma50) && sma50 > 0 ? Math.abs(price - sma50) / sma50 : null;
    const below20 = Number.isFinite(price) && Number.isFinite(sma20) ? price < sma20 * 0.998 : false;
    const below50 = Number.isFinite(price) && Number.isFinite(sma50) ? price < sma50 * 0.998 : false;
    const structureBroken = !!checks.structureBroken;
    const constructiveBounce = !!(checks.bounce || checks.stabilising);
    const strongTrend = !!checks.trendStrong;
    const explicitSupported = explicit && (
      !overlapDetected
      || (explicit === '20MA' && near20 && !near50)
      || (explicit === '50MA' && near50 && !near20)
    );

    if(explicit && !overlapDetected) return {
      importedScanType:explicit,
      globalSetupType:globalType,
      overlapDetected:false,
      resolvedScanType:explicit,
      reason:'Explicit setup type kept because the chart does not show a true 20MA/50MA overlap.'
    };
    if(!explicit && globalType !== 'unknown' && !overlapDetected) return {
      importedScanType:'unknown',
      globalSetupType:globalType,
      overlapDetected:false,
      resolvedScanType:globalType,
      reason:'Global setup toggle applied because the chart does not show a true overlap.'
    };
    if(explicitSupported && explicit) return {
      importedScanType:explicit,
      globalSetupType:globalType,
      overlapDetected:false,
      resolvedScanType:explicit,
      reason:'Explicit setup type stayed in force because the chart still clearly fits it.'
    };
    if(near20 && !near50) return {
      importedScanType:explicit || 'unknown',
      globalSetupType:globalType,
      overlapDetected:false,
      resolvedScanType:'20MA',
      reason:'Price is only near the 20MA, so the setup resolves as 20MA.'
    };
    if(near50 && !near20) return {
      importedScanType:explicit || 'unknown',
      globalSetupType:globalType,
      overlapDetected:false,
      resolvedScanType:'50MA',
      reason:'Price is only near the 50MA, so the setup resolves as 50MA.'
    };
    if(!overlapDetected) return {
      importedScanType:explicit || 'unknown',
      globalSetupType:globalType,
      overlapDetected:false,
      resolvedScanType:'unknown',
      reason:'Neither moving average is clearly in play, so setup type remains unknown.'
    };

    let score20 = 0;
    let score50 = 0;
    const reasons = [];
    if(Number.isFinite(distance20) && Number.isFinite(distance50)){
      if(distance20 + 0.0025 < distance50){
        score20 += 2;
        reasons.push('price is clearly closer to the 20MA');
      }else if(distance50 + 0.0025 < distance20){
        score50 += 2;
        reasons.push('price is clearly closer to the 50MA');
      }else{
        reasons.push('price is genuinely near both moving averages');
      }
    }else{
      reasons.push('price is genuinely near both moving averages');
    }
    if(strongTrend && !structureBroken){
      score20 += 1;
      reasons.push('trend structure still supports a continuation-style pullback');
    }
    if(constructiveBounce){
      score20 += 1;
      reasons.push('stabilisation or bounce still looks constructive');
    }
    if(below20){
      score50 += 2;
      reasons.push('price has meaningfully lost the 20MA');
    }
    if(structureBroken){
      score50 += 2;
      reasons.push('structure damage makes this behave more like a deeper 50MA setup');
    }else if(!strongTrend){
      score50 += 1;
      reasons.push('trend quality is not strong enough for a clean 20MA continuation');
    }
    if(marketWeak){
      score50 += 1;
      reasons.push('weak market biases overlap cases toward the more conservative 50MA treatment');
    }
    if(Number.isFinite(perf1w) && perf1w < 0){
      score50 += 1;
      reasons.push('recent price action still looks heavy rather than cleanly constructive');
    }
    if(below50){
      score50 += 2;
      reasons.push('price is under the 50MA, which rules out optimistic 20MA treatment');
    }

    let resolvedScanType = 'ambiguous';
    if(score50 >= score20 + 2){
      resolvedScanType = '50MA';
    }else if(score20 >= score50 + 2){
      resolvedScanType = '20MA';
    }
    const reason = resolvedScanType === '20MA'
      ? `Overlap resolved to 20MA because ${reasons.join(', ')}.`
      : (resolvedScanType === '50MA'
        ? `Overlap resolved to 50MA because ${reasons.join(', ')}.`
        : `Overlap remains ambiguous because ${reasons.join(', ')}.`);

    return {
      importedScanType:explicit || 'unknown',
      globalSetupType:globalType,
      overlapDetected:true,
      resolvedScanType,
      reason
    };
  }

  function resolveScanType(context = {}, deps = {}){
    return resolveSetupTypeWithOverlap(context, deps).resolvedScanType;
  }

  global.SetupBasisPolicy = {
    normalizeStoredSetupType,
    currentSetupType,
    selectedQuickScanType,
    scanTypeForEvaluation,
    resolveSetupTypeWithOverlap,
    resolveScanType
  };
})(typeof window !== 'undefined' ? window : globalThis);
