(function(global){
  // Pure / deterministic plan math helpers extracted from app.js.
  function normalizeQuoteCurrency(value){
    const rawText = String(value || '').trim();
    if(!rawText) return '';
    const compact = rawText.replace(/\./g, '').toUpperCase();
    if(compact === 'GBP') return 'GBP';
    if(['GBX','GBPENCE','GBPX','GBP'].includes(compact) && /p$/i.test(rawText)) return 'GBX';
    if(['GBX','GBPENCE','GBPX'].includes(compact)) return 'GBX';
    return compact;
  }

  function convertQuoteValueToGbp(value, quoteCurrency, deps = {}){
    const { numericOrNull, fxRateCache, isFreshTimestamp, fxRateCacheTtlMs } = deps;
    const amount = numericOrNull(value);
    const currency = normalizeQuoteCurrency(quoteCurrency);
    if(!Number.isFinite(amount)) return {gbpValue:null, conversion:'invalid'};
    if(!currency || currency === 'GBP') return {gbpValue:amount, conversion:'native'};
    if(currency === 'GBX' || currency === 'GBPENCE' || currency === 'GBPX' || currency === 'GBP.P'){
      return {gbpValue:amount / 100, conversion:'pence'};
    }
    const cachedFx = fxRateCache && typeof fxRateCache.get === 'function' ? fxRateCache.get(currency) : null;
    if(
      cachedFx
      && isFreshTimestamp(cachedFx.fetchedAt, fxRateCacheTtlMs)
      && Number.isFinite(cachedFx.gbpPerUnit)
      && cachedFx.gbpPerUnit > 0
    ){
      return {gbpValue:amount * cachedFx.gbpPerUnit, conversion:'live_fx'};
    }
    return {gbpValue:null, conversion:'unsupported'};
  }

  function evaluateRiskFit({entry, stop, account_size, risk_percent, max_loss_override, whole_shares_only}, deps = {}){
    const { numericOrNull } = deps;
    const numericEntry = numericOrNull(entry);
    const numericStop = numericOrNull(stop);
    const accountSize = numericOrNull(account_size) || 0;
    const riskPercent = numericOrNull(risk_percent) || 0;
    const override = numericOrNull(max_loss_override);
    const max_loss = Number.isFinite(override) && override > 0 ? override : (accountSize > 0 && riskPercent > 0 ? accountSize * riskPercent : 0);
    if(!Number.isFinite(numericEntry) || !Number.isFinite(numericStop)) return {max_loss, risk_per_share:null, position_size:0, risk_status:'plan_missing'};
    const risk_per_share = numericEntry - numericStop;
    if(!Number.isFinite(risk_per_share) || risk_per_share <= 0) return {max_loss, risk_per_share, position_size:0, risk_status:'invalid_plan'};
    if(!(max_loss > 0)) return {max_loss, risk_per_share, position_size:0, risk_status:'settings_missing'};
    let position_size = max_loss > 0 ? (whole_shares_only === false ? (max_loss / risk_per_share) : Math.floor(max_loss / risk_per_share)) : 0;
    if(!Number.isFinite(position_size)) position_size = 0;
    if(position_size < 1){
      return {
        max_loss,
        risk_per_share,
        position_size:whole_shares_only === false ? Number(position_size.toFixed(2)) : 0,
        risk_status:'too_wide'
      };
    }
    return {
      max_loss,
      risk_per_share,
      position_size:whole_shares_only === false ? Number(position_size.toFixed(2)) : position_size,
      risk_status:'fits_risk'
    };
  }

  function classifyCapitalUsage({position_cost_gbp, account_size_gbp}, deps = {}){
    const { numericOrNull } = deps;
    const positionCostGbp = numericOrNull(position_cost_gbp);
    const accountSize = numericOrNull(account_size_gbp);
    if(!Number.isFinite(positionCostGbp) || positionCostGbp < 0 || !Number.isFinite(accountSize) || accountSize <= 0){
      return {
        usage_percent:null,
        usage_bucket:'unknown',
        capital_ok:null
      };
    }
    const usagePercent = positionCostGbp / accountSize;
    let usageBucket = 'too_expensive';
    if(usagePercent <= 0.25) usageBucket = 'ideal';
    else if(usagePercent <= 0.40) usageBucket = 'acceptable';
    else if(usagePercent <= 0.60) usageBucket = 'borderline';
    else if(usagePercent <= 0.75) usageBucket = 'heavy';
    else if(usagePercent <= 1) usageBucket = 'too_heavy';
    return {
      usage_percent:usagePercent,
      usage_bucket:usageBucket,
      capital_ok:['ideal','acceptable','borderline'].includes(usageBucket)
    };
  }

  function evaluateCapitalFit({entry, position_size, account_size_gbp, quote_currency}, deps = {}){
    const { numericOrNull, convertQuoteValueToGbp, classifyCapitalUsage } = deps;
    const numericEntry = numericOrNull(entry);
    const positionSize = numericOrNull(position_size);
    const accountSize = numericOrNull(account_size_gbp) || 0;
    const quoteCurrency = normalizeQuoteCurrency(quote_currency);
    if(!Number.isFinite(numericEntry) || !Number.isFinite(positionSize) || positionSize <= 0){
      return {
        position_cost:null,
        position_cost_gbp:null,
        quote_currency:quoteCurrency || '',
        capital_fit:'unknown',
        capital_usage_pct:null,
        capital_ok:null,
        capital_note:'Position cost is unavailable until entry and size are valid.'
      };
    }
    const positionCost = numericEntry * positionSize;
    const converted = convertQuoteValueToGbp(positionCost, quoteCurrency);
    if(!Number.isFinite(converted.gbpValue)){
      return {
        position_cost:positionCost,
        position_cost_gbp:null,
        quote_currency:quoteCurrency || '',
        capital_fit:'unknown',
        capital_usage_pct:null,
        capital_ok:null,
        fx_status:quoteCurrency ? 'estimated' : 'unavailable',
        capital_note:quoteCurrency
          ? 'Capital check: FX estimated'
          : 'Capital check unavailable - quote currency is unknown.'
      };
    }
    const capitalUsage = classifyCapitalUsage({
      position_cost_gbp:converted.gbpValue,
      account_size_gbp:accountSize
    });
    const bucket = capitalUsage.usage_bucket;
    const capitalNote = converted.conversion === 'live_fx'
      ? 'Capital check: FX converted'
      : ({
        ideal:'Position cost is ideal for current account size.',
        acceptable:'Position cost is acceptable for current account size.',
        borderline:'Position cost is borderline for current account size.',
        heavy:'Capital usage is heavy for this account size.',
        too_heavy:'Position would use too much account capital.',
        too_expensive:'Position cost is above current account size.'
      })[bucket] || 'Capital check unavailable.';
    return {
      position_cost:positionCost,
      position_cost_gbp:converted.gbpValue,
      quote_currency:quoteCurrency || 'GBP',
      fx_status:converted.conversion === 'live_fx' ? 'converted' : (converted.conversion === 'native' || converted.conversion === 'pence' ? 'native' : ''),
      capital_fit:bucket,
      capital_usage_pct:capitalUsage.usage_percent,
      capital_usage_bucket:bucket,
      capital_ok:capitalUsage.capital_ok,
      capital_note:capitalNote
    };
  }

  function evaluateRewardRisk(entry, stop, firstTarget, deps = {}){
    const { numericOrNull } = deps;
    const numericEntry = numericOrNull(entry);
    const numericStop = numericOrNull(stop);
    const numericFirstTarget = numericOrNull(firstTarget);
    if(!Number.isFinite(numericEntry) || !Number.isFinite(numericStop) || !Number.isFinite(numericFirstTarget)){
      return {valid:false, riskPerShare:null, rewardPerShare:null, rrRatio:null, rrState:'invalid'};
    }
    const riskPerShare = numericEntry - numericStop;
    const rewardPerShare = numericFirstTarget - numericEntry;
    if(!Number.isFinite(riskPerShare) || !Number.isFinite(rewardPerShare) || riskPerShare <= 0 || rewardPerShare <= 0){
      return {valid:false, riskPerShare, rewardPerShare, rrRatio:null, rrState:'invalid'};
    }
    const rrRatio = rewardPerShare / riskPerShare;
    if(rrRatio >= 2) return {valid:true, riskPerShare, rewardPerShare, rrRatio, rrState:'strong'};
    if(rrRatio >= 1.5) return {valid:true, riskPerShare, rewardPerShare, rrRatio, rrState:'acceptable'};
    return {valid:true, riskPerShare, rewardPerShare, rrRatio, rrState:'weak'};
  }

  function deriveAffordability(positionCost, deps = {}){
    const { numericOrNull, classifyCapitalUsage } = deps;
    const capitalContext = positionCost && typeof positionCost === 'object'
      ? positionCost
      : {position_cost:positionCost};
    const usageBucket = String(
      capitalContext.capital_fit
      || capitalContext.capital_usage_bucket
      || classifyCapitalUsage({
        position_cost_gbp:capitalContext.position_cost_gbp ?? capitalContext.position_cost,
        account_size_gbp:capitalContext.account_size_gbp
      }).usage_bucket
      || ''
    ).trim().toLowerCase();
    if(!usageBucket || usageBucket === 'unknown') return '';
    if(usageBucket === 'heavy') return 'heavy_capital';
    if(['too_heavy','too_expensive'].includes(usageBucket)) return 'not_affordable';
    return 'affordable';
  }

  global.PlanMath = {
    normalizeQuoteCurrency,
    convertQuoteValueToGbp,
    evaluateRiskFit,
    classifyCapitalUsage,
    evaluateCapitalFit,
    evaluateRewardRisk,
    deriveAffordability
  };
})(window);
