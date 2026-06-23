(function(global){
  function fallbackUniqueTickers(values){
    const seen = new Set();
    return (Array.isArray(values) ? values : []).reduce((list, value) => {
      const safe = String(value || '').trim().toUpperCase();
      if(!safe || seen.has(safe)) return list;
      seen.add(safe);
      list.push(safe);
      return list;
    }, []);
  }

  function uniqueTickersWithDeps(values, deps){
    if(deps && typeof deps.uniqueTickers === 'function') return deps.uniqueTickers(values || []);
    return fallbackUniqueTickers(values);
  }

  function normalizeMode(value, deps){
    if(deps && typeof deps.normalizeUniverseMode === 'function'){
      return deps.normalizeUniverseMode(value);
    }
    return ['tradingview_only', 'core8', 'combined'].includes(String(value || '')) ? String(value || '') : '';
  }

  function normalizeStoredMode(context = {}, deps = {}){
    return normalizeMode(context.value, deps);
  }

  function selectedMode(context = {}, deps = {}){
    let value = '';
    if(typeof context.getElementValue === 'function'){
      value = context.getElementValue('universeMode');
    }else if(context.document && typeof context.document.getElementById === 'function'){
      const element = context.document.getElementById('universeMode');
      value = element ? element.value : '';
    }
    return normalizeMode(value, deps);
  }

  function defaultModeForTickers(tickers, deps){
    return uniqueTickersWithDeps(tickers || [], deps).length ? 'tradingview_only' : 'core8';
  }

  function effectiveMode(context = {}, deps = {}){
    const safeState = context.state && typeof context.state === 'object' ? context.state : {};
    return normalizeMode(safeState.universeMode, deps) || defaultModeForTickers(safeState.tickers || [], deps);
  }

  function finalUniverse(context = {}, deps = {}){
    const safeState = context.state && typeof context.state === 'object' ? context.state : {};
    const imported = uniqueTickersWithDeps(safeState.tickers || [], deps);
    const mode = effectiveMode(context, deps);
    const defaultAutoUniverse = Array.isArray(context.defaultAutoUniverse) ? context.defaultAutoUniverse : [];
    const limit = Number.isFinite(Number(context.maxScanTickers)) ? Number(context.maxScanTickers) : null;
    if(mode === 'tradingview_only') return imported;
    if(mode === 'combined'){
      const merged = uniqueTickersWithDeps([...imported, ...defaultAutoUniverse], deps);
      return Number.isFinite(limit) ? merged.slice(0, limit) : merged;
    }
    return defaultAutoUniverse.slice();
  }

  global.ScannerUniversePolicy = {
    normalizeMode,
    normalizeStoredMode,
    selectedMode,
    defaultModeForTickers,
    effectiveMode,
    finalUniverse
  };
})(typeof window !== 'undefined' ? window : globalThis);
