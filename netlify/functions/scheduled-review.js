const { getProviderConfig, normalizePlanId, normalizeProviderId } = require('./lib/scan-config');
const fmpProvider = require('./lib/providers/fmp');
const marketDataProvider = require('./lib/providers/marketdata');
const { loadTrackedState, saveTrackedState, loadPushSubscriptions, savePushSubscriptions } = require('./lib/tracked-store');
const { normalizeRecord, isEligibleTrackedRecord, reevaluateTickerProgress, displayStageForRecord, buildEntryNotification } = require('./lib/review-monitor');
const { sendPushNotification } = require('./lib/push');

const PROVIDERS = {
  fmp:fmpProvider,
  marketdata:marketDataProvider
};

function providerApiKey(providerId){
  if(providerId === 'fmp') return process.env.FMP_API_KEY;
  if(providerId === 'marketdata') return process.env.MARKETDATA_API_KEY || process.env.MARKETDATA_TOKEN;
  return '';
}

function getProviderAdapter(providerId){
  return PROVIDERS[providerId] || PROVIDERS.fmp;
}

async function fetchSnapshot(symbol, settings){
  const providerId = normalizeProviderId(settings.dataProvider);
  const planId = normalizePlanId(providerId, settings.apiPlan);
  const providerConfig = getProviderConfig(providerId, planId);
  const adapter = getProviderAdapter(providerConfig.id);
  const apiKey = providerApiKey(providerConfig.id);
  if(!apiKey) throw new Error(`Missing API key for provider ${providerConfig.id}.`);
  return adapter.getSnapshot(symbol, {
    apiKey,
    providerConfig,
    log:(level, details) => {
      const payload = JSON.stringify({...details, provider:providerConfig.id});
      if(level === 'error') console.error(`[scheduled-review] ${payload}`);
      else console.log(`[scheduled-review] ${payload}`);
    }
  });
}

async function notifyEntryTransition(record, settings, subscriptions){
  if(!subscriptions.length) return subscriptions;
  const notification = buildEntryNotification(record, settings);
  const remaining = [];
  for(const subscription of subscriptions){
    const result = await sendPushNotification(subscription, {
      title:notification.title,
      body:notification.body,
      ticker:record.ticker,
      url:`./#reviewSection?ticker=${encodeURIComponent(record.ticker)}`
    });
    if(result.ok || !result.removeSubscription) remaining.push(subscription);
  }
  return remaining;
}

exports.config = {
  schedule:'*/15 * * * *'
};

exports.handler = async function handler(){
  const trackedState = await loadTrackedState();
  const settings = trackedState.settings && typeof trackedState.settings === 'object' ? trackedState.settings : {};
  const nextRecords = {...(trackedState.records || {})};
  let subscriptions = await loadPushSubscriptions();
  const results = [];

  for(const [ticker, rawRecord] of Object.entries(trackedState.records || {})){
    const record = normalizeRecord(rawRecord, settings);
    if(!isEligibleTrackedRecord(record)) continue;
    const previousStage = displayStageForRecord(record, settings);
    const priorUserUpdatedAt = String(record.meta && (record.meta.userUpdatedAt || record.meta.updatedAt) || '');
    try{
      const snapshot = await fetchSnapshot(ticker, settings);
      const marketUpdatedAt = snapshot.fetchedAt || new Date().toISOString();
      const existingMeta = record.meta && typeof record.meta === 'object' ? record.meta : {};
      record.marketData = {
        ...record.marketData,
        price:snapshot.price,
        ma20:snapshot.sma20,
        ma50:snapshot.sma50,
        ma200:snapshot.sma200,
        rsi:snapshot.rsi14,
        avgVolume:snapshot.avgVolume30d,
        volume:snapshot.volume,
        perf1w:snapshot.perf1w,
        perf1m:snapshot.perf1m,
        perf3m:snapshot.perf3m,
        perf6m:snapshot.perf6m,
        perfYtd:snapshot.perfYtd,
        marketCap:snapshot.marketCap,
        currency:snapshot.currency,
        history:Array.isArray(snapshot.history) ? snapshot.history : [],
        asOf:marketUpdatedAt,
        source:snapshot.sourceProvider || settings.dataProvider || 'fmp'
      };
      reevaluateTickerProgress(record, settings);
      const nextStage = displayStageForRecord(record, settings);
      const lastNotifiedState = String(record.notifications && record.notifications.lastNotifiedState || '');
      if(previousStage !== 'Entry' && nextStage === 'Entry' && lastNotifiedState !== 'Entry'){
        subscriptions = await notifyEntryTransition(record, settings, subscriptions);
        record.notifications = {
          ...(record.notifications || {}),
          lastNotifiedState:'Entry',
          entryNotifiedAt:new Date().toISOString()
        };
      }else{
        record.notifications = {
          ...(record.notifications || {}),
          lastNotifiedState:nextStage
        };
      }
      // Keep user-authored versioning separate from scheduler freshness so
      // market polls and trigger progression cannot overwrite newer unsynced
      // local notes/checklist/plan edits on the client.
      record.meta = {
        ...existingMeta,
        userUpdatedAt:priorUserUpdatedAt || String(existingMeta.userUpdatedAt || existingMeta.updatedAt || ''),
        updatedAt:priorUserUpdatedAt || String(existingMeta.updatedAt || ''),
        marketUpdatedAt
      };
      nextRecords[ticker] = record;
      results.push({ticker, ok:true, previousStage, nextStage});
    }catch(error){
      results.push({ticker, ok:false, error:String(error && error.message || 'scheduled_review_failed')});
      nextRecords[ticker] = record;
    }
  }

  await saveTrackedState({
    ...trackedState,
    settings,
    records:nextRecords
  });
  await savePushSubscriptions(subscriptions);

  return {
    statusCode:200,
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      ok:true,
      reviewed:results.length,
      results
    })
  };
};
