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

  function countTradingDaysBetween(startDate, endDate){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(startDate || '') || !/^\d{4}-\d{2}-\d{2}$/.test(endDate || '')) return 0;
    const start = new Date(`${startDate}T12:00:00Z`);
    const end = new Date(`${endDate}T12:00:00Z`);
    if(end <= start) return 0;
    let count = 0;
    const cursor = new Date(start);
    while(cursor < end){
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      const day = cursor.getUTCDay();
      if(day !== 0 && day !== 6 && cursor <= end) count += 1;
    }
    return count;
  }

  function fmtPrice(value){
    return Number.isFinite(value) ? Number(value).toFixed(2) : '-';
  }

  function todayIsoDate(){
    return new Date().toISOString().slice(0, 10);
  }

  function businessDaysFromNow(days){
    return global.tradingDaysFrom(todayIsoDate(), days);
  }

  global.AppUtils = Object.assign({}, global.AppUtils, {
    numericOrNull,
    escapeHtml,
    validateTickerSymbol,
    normalizeTicker,
    countTradingDaysBetween,
    fmtPrice,
    todayIsoDate,
    businessDaysFromNow
  });
})(window);
