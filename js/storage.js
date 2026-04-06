(function(global){
  function safeJsonParse(value, fallback){
    try{
      const parsed = JSON.parse(value);
      return parsed == null ? fallback : parsed;
    }catch(error){
      return fallback;
    }
  }

  function safeStorageGet(storageKey, fallback){
    try{
      const raw = localStorage.getItem(storageKey);
      if(raw == null) return fallback;
      return safeJsonParse(raw, fallback);
    }catch(error){
      return fallback;
    }
  }

  function safeStorageSet(storageKey, value){
    try{
      localStorage.setItem(storageKey, JSON.stringify(value));
      return true;
    }catch(error){
      return false;
    }
  }

  function safeStorageRemove(storageKey){
    try{
      localStorage.removeItem(storageKey);
      return true;
    }catch(error){
      return false;
    }
  }

  function readMarketCache(){
    const marketCacheKey = global.marketCacheKey || 'pullbackPlaybookMarketCacheV1';
    const schemaVersion = global.MARKET_CACHE_SCHEMA_VERSION || 1;
    const parsed = safeStorageGet(marketCacheKey, {});
    if(!parsed || typeof parsed !== 'object') return {};
    if(parsed.__schemaVersion !== schemaVersion) return {};
    return parsed.entries && typeof parsed.entries === 'object' ? parsed.entries : {};
  }

  function writeMarketCache(cache){
    const marketCacheKey = global.marketCacheKey || 'pullbackPlaybookMarketCacheV1';
    const schemaVersion = global.MARKET_CACHE_SCHEMA_VERSION || 1;
    safeStorageSet(marketCacheKey, {
      __schemaVersion:schemaVersion,
      updatedAt:new Date().toISOString(),
      entries:cache || {}
    });
  }

  global.AppStorage = Object.assign({}, global.AppStorage, {
    safeJsonParse,
    safeStorageGet,
    safeStorageSet,
    safeStorageRemove,
    readMarketCache,
    writeMarketCache
  });
})(window);
