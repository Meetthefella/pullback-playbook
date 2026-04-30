(function(global){
  function stableStringifyForPersistSignature(value){
    if(value === null) return 'null';
    if(value === undefined) return '"__undefined__"';
    if(Array.isArray(value)){
      return `[${value.map(item => stableStringifyForPersistSignature(item)).join(',')}]`;
    }
    if(typeof value === 'object'){
      const keys = Object.keys(value).sort();
      return `{${keys.map(key => `${JSON.stringify(key)}:${stableStringifyForPersistSignature(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
  }

  function trackedStatePersistSignature(payload){
    const safePayload = payload && typeof payload === 'object' ? payload : {};
    const signaturePayload = {
      settings:safePayload.settings && typeof safePayload.settings === 'object' ? safePayload.settings : {},
      records:safePayload.records && typeof safePayload.records === 'object' ? safePayload.records : {},
      removedRecords:safePayload.removedRecords && typeof safePayload.removedRecords === 'object' ? safePayload.removedRecords : {}
    };
    return stableStringifyForPersistSignature(signaturePayload);
  }

  global.AppPersistDomain = Object.assign({}, global.AppPersistDomain, {
    stableStringifyForPersistSignature,
    trackedStatePersistSignature
  });
})(window);
