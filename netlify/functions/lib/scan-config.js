const PROVIDER_CONFIGS = {
  fmp: {
    id:'fmp',
    label:'Financial Modeling Prep',
    defaultPlan:'scanner',
    plans:{
      scanner:{
        maxScanTickers:null,
        supportsSearch:true,
        supportsDailyHistory:true,
        supportsIntraday:false,
        notes:'Default free-tier profile used by Pullback Playbook.'
      }
    }
  },
  marketdata: {
    id:'marketdata',
    label:'MarketData.app',
    defaultPlan:'scanner',
    plans:{
      scanner:{
        maxScanTickers:null,
        supportsSearch:false,
        supportsDailyHistory:true,
        supportsIntraday:true,
        notes:'TODO: wire MarketData.app credentials and endpoints.'
      }
    }
  }
};

function normalizeProviderId(value){
  const provider = String(value || '').trim().toLowerCase();
  return PROVIDER_CONFIGS[provider] ? provider : 'fmp';
}

function normalizePlanId(providerId, planId){
  const provider = PROVIDER_CONFIGS[normalizeProviderId(providerId)] || PROVIDER_CONFIGS.fmp;
  const plan = String(planId || '').trim().toLowerCase();
  return provider.plans[plan] ? plan : provider.defaultPlan;
}

function getProviderConfig(providerId, planId){
  const id = normalizeProviderId(providerId);
  const provider = PROVIDER_CONFIGS[id];
  const plan = normalizePlanId(id, planId);
  return {
    ...provider,
    plan,
    planConfig:provider.plans[plan]
  };
}

module.exports = {
  PROVIDER_CONFIGS,
  getProviderConfig,
  normalizeProviderId,
  normalizePlanId
};
