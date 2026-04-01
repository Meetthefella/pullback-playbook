// Shared pure helpers used across scanner, review, and planner logic.
(function(global){
  function numericOrNull(value){
    if(value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function escapeHtml(value){
    return String(value || '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }

  function validateTickerSymbol(value){
    return /^[A-Z][A-Z0-9.-]{0,9}$/.test(String(value || '').trim().toUpperCase());
  }

  function normalizeTicker(value){
    return String(value || '').trim().toUpperCase();
  }

  function normalizeScanType(value){
    const text = String(value || '').trim().toUpperCase();
    if(text === '20MA' || text === '50MA') return text;
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

  function clamp(value, min, max){
    return Math.max(min, Math.min(max, value));
  }

  function scoreRange(value, min, max, points){
    if(!Number.isFinite(value)) return 0;
    if(max <= min) return 0;
    return clamp(((value - min) / (max - min)) * points, 0, points);
  }

  global.PullbackCore = {
    numericOrNull,
    escapeHtml,
    validateTickerSymbol,
    normalizeTicker,
    normalizeScanType,
    parseImportedTickerEntries,
    parseTickersDetailed,
    parseTickers,
    uniqueTickers,
    clamp,
    scoreRange
  };
})(window);
