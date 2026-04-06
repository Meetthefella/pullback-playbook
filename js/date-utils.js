(function(global){
  function isoDateAddDays(isoDate, days){
    const date = new Date(`${String(isoDate).slice(0, 10)}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + Number(days || 0));
    return date.toISOString().slice(0, 10);
  }

  function isoDateMonthBounds(isoDate){
    const [year, month] = String(isoDate || global.AppUtils.todayIsoDate()).slice(0, 10).split('-').map(Number);
    const first = new Date(Date.UTC(year, Math.max(0, month - 1), 1, 12, 0, 0));
    const last = new Date(Date.UTC(year, month, 0, 12, 0, 0));
    return {
      first:first.toISOString().slice(0, 10),
      last:last.toISOString().slice(0, 10),
      year,
      month
    };
  }

  function marketCalendarYearConfig(year){
    const config = global.US_MARKET_CALENDAR_CONFIG || {};
    return config[Number(year)] || {holidays:[], earlyCloseDays:{}};
  }

  function isHoliday(dateET){
    const isoDate = String(dateET || '').slice(0, 10);
    const year = Number(isoDate.slice(0, 4));
    return marketCalendarYearConfig(year).holidays.includes(isoDate);
  }

  function isTradingDay(dateET){
    const isoDate = String(dateET || '').slice(0, 10);
    const weekday = global.weekdayIndexFromIsoDate(isoDate);
    return weekday !== 0 && weekday !== 6 && !isHoliday(isoDate);
  }

  function formatLocalTimestamp(timestamp){
    const time = Date.parse(timestamp || '');
    if(!Number.isFinite(time)) return '';
    return new Date(time).toLocaleString();
  }

  function tradingDaysFrom(startDate, count){
    const base = new Date(`${startDate}T12:00:00Z`);
    let added = 0;
    while(added < count){
      base.setUTCDate(base.getUTCDate() + 1);
      const day = base.getUTCDay();
      if(day !== 0 && day !== 6) added += 1;
    }
    return base.toISOString().slice(0, 10);
  }

  global.AppDateUtils = Object.assign({}, global.AppDateUtils, {
    isoDateAddDays,
    isoDateMonthBounds,
    isHoliday,
    isTradingDay,
    formatLocalTimestamp,
    tradingDaysFrom
  });
})(window);
