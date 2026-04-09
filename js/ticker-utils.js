(function(global){
  const normalizeTicker = global.AppUtils && global.AppUtils.normalizeTicker;
  const validateTickerSymbol = global.AppUtils && global.AppUtils.validateTickerSymbol;

  function normalizeScanType(value){
    const text = String(value || '').trim().toUpperCase();
    if(text === '20MA' || text === '50MA' || text === 'AMBIGUOUS') return text === 'AMBIGUOUS' ? 'ambiguous' : text;
    return '';
  }

  function parseImportedTickerEntries(text){
    const rawText = String(text || '').trim();
    if(!rawText) return [];
    const entries = [];
    rawText.split(/\n+/).map(line => line.trim()).filter(Boolean).forEach(line => {
      const explicit = line.match(/^([A-Z][A-Z0-9.-]{0,9})\s*(?:\||,|:|\s)\s*(20MA|50MA)$/i);
      if(explicit){
        entries.push({ticker:normalizeTicker(explicit[1]), scanType:normalizeScanType(explicit[2])});
        return;
      }
      line.split(/[\s,]+/).map(token => token.trim()).filter(Boolean).forEach(token => {
        const pair = token.match(/^([A-Z][A-Z0-9.-]{0,9})[:|](20MA|50MA)$/i);
        if(pair){
          entries.push({ticker:normalizeTicker(pair[1]), scanType:normalizeScanType(pair[2])});
          return;
        }
        entries.push({ticker:normalizeTicker(token), scanType:''});
      });
    });
    return entries;
  }

  function parseTickersDetailed(text){
    const rawItems = parseImportedTickerEntries(text).map(item => item.ticker).filter(Boolean);
    const valid = [];
    const invalid = [];
    const duplicates = [];
    const seen = new Set();
    rawItems.forEach(item => {
      if(!validateTickerSymbol(item)){
        invalid.push(item);
        return;
      }
      if(seen.has(item)){
        duplicates.push(item);
        return;
      }
      seen.add(item);
      valid.push(item);
    });
    return {valid, invalid, duplicates};
  }

  function parseTickers(text){
    return parseTickersDetailed(text).valid;
  }

  function uniqueTickers(values){
    const out = [];
    const seen = new Set();
    (values || []).forEach(value => {
      const ticker = normalizeTicker(value);
      if(!ticker || seen.has(ticker) || !validateTickerSymbol(ticker)) return;
      seen.add(ticker);
      out.push(ticker);
    });
    return out;
  }

  global.AppTickerUtils = Object.assign({}, global.AppTickerUtils, {
    normalizeScanType,
    parseImportedTickerEntries,
    parseTickersDetailed,
    parseTickers,
    uniqueTickers
  });
})(window);
