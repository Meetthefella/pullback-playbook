// Leaf pure helpers shared by the app.
// These stay dependency-free so extraction cannot affect app flow.
(function(){
  function numericOrNull(value){
    if(value === null || value === undefined || value === '') return null;
    var number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function safeJsonParse(value, fallback){
    try{
      var parsed = JSON.parse(value);
      return parsed == null ? fallback : parsed;
    }catch(error){
      return fallback;
    }
  }

  function escapeHtml(value){
    return String(value || '').replace(/[&<>"']/g, function(char){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char];
    });
  }

  function validateTickerSymbol(value){
    return /^[A-Z][A-Z0-9.-]{0,9}$/.test(String(value || '').trim().toUpperCase());
  }

  function normalizeTicker(value){
    return String(value || '').trim().toUpperCase();
  }

  function normalizeScanType(value){
    var text = String(value || '').trim().toUpperCase();
    if(text === '20MA' || text === '50MA') return text;
    return '';
  }

  function parseImportedTickerEntries(text){
    var rawText = String(text || '').trim();
    var entries = [];
    if(!rawText) return entries;
    rawText.split(/\n+/).map(function(line){ return line.trim(); }).filter(Boolean).forEach(function(line){
      var explicit = line.match(/^([A-Z][A-Z0-9.-]{0,9})\s*(?:\||,|:|\s)\s*(20MA|50MA)$/i);
      if(explicit){
        entries.push({ticker:normalizeTicker(explicit[1]), scanType:normalizeScanType(explicit[2])});
        return;
      }
      line.split(/[\s,]+/).map(function(token){ return token.trim(); }).filter(Boolean).forEach(function(token){
        var pair = token.match(/^([A-Z][A-Z0-9.-]{0,9})[:|](20MA|50MA)$/i);
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
    var rawItems = parseImportedTickerEntries(text).map(function(item){ return item.ticker; }).filter(Boolean);
    var valid = [];
    var invalid = [];
    var duplicates = [];
    var seen = new Set();
    rawItems.forEach(function(item){
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
    return {valid:valid, invalid:invalid, duplicates:duplicates};
  }

  function parseTickers(text){
    return parseTickersDetailed(text).valid;
  }

  function uniqueTickers(values){
    var out = [];
    var seen = new Set();
    (values || []).forEach(function(value){
      var ticker = normalizeTicker(value);
      if(!ticker || seen.has(ticker) || !validateTickerSymbol(ticker)) return;
      seen.add(ticker);
      out.push(ticker);
    });
    return out;
  }

  function fmtPrice(value){
    return Number.isFinite(value) ? Number(value).toFixed(2) : '-';
  }

  function clamp(value, min, max){
    return Math.max(min, Math.min(max, value));
  }

  function scoreRange(value, min, max, points){
    if(!Number.isFinite(value)) return 0;
    if(max <= min) return 0;
    return clamp(((value - min) / (max - min)) * points, 0, points);
  }

  function normalizeImportedStatus(value, options){
    var settings = options || {};
    var v = String(value || '').trim().toLowerCase();
    if(!v) return settings.preserveEmpty ? '' : 'Watch';
    if(v === 'ready') return 'Ready';
    if(v === 'entry') return 'Entry';
    if(v === 'near pullback' || v === 'near setup') return 'Near Setup';
    if(v === 'near entry') return 'Near Entry';
    if(v === 'avoid') return 'Avoid';
    return 'Watch';
  }

  window.PullbackCoreLeaf = {
    numericOrNull:numericOrNull,
    safeJsonParse:safeJsonParse,
    escapeHtml:escapeHtml,
    validateTickerSymbol:validateTickerSymbol,
    normalizeTicker:normalizeTicker,
    normalizeScanType:normalizeScanType,
    parseImportedTickerEntries:parseImportedTickerEntries,
    parseTickersDetailed:parseTickersDetailed,
    parseTickers:parseTickers,
    uniqueTickers:uniqueTickers,
    fmtPrice:fmtPrice,
    clamp:clamp,
    scoreRange:scoreRange,
    normalizeImportedStatus:normalizeImportedStatus
  };
})();
