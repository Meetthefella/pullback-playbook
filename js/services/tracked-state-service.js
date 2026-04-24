(function(global){
  function createTrackedStateService(deps){
    let backendSyncTimer = null;
    let backendRefreshTimer = null;
    let trackedStatePersistScheduled = false;
    let trackedStatePersistInFlight = false;
    let trackedStatePersistFollowUp = false;
    let trackedStatePersistLastSuccessfulSignature = '';
    let trackedStateBackendUnavailable = !!(deps.state && deps.state.trackedStateBackendUnavailable === true);
    let trackedStateBackendUnavailableNotified = !!(deps.state && deps.state.trackedStateBackendUnavailableNotified === true);

    function updateTrackedStateBackendAvailability(unavailable, detail = {}){
      const nextUnavailable = unavailable === true;
      trackedStateBackendUnavailable = nextUnavailable;
      if(deps.state && typeof deps.state === 'object'){
        deps.state.trackedStateBackendUnavailable = nextUnavailable;
        if(nextUnavailable && !trackedStateBackendUnavailableNotified){
          deps.state.trackedStateBackendUnavailableNotified = true;
        }
      }
      if(nextUnavailable){
        if(!trackedStateBackendUnavailableNotified){
          trackedStateBackendUnavailableNotified = true;
          deps.logDebugWarn('DEBUG_STORAGE', 'TRACKED_STATE_BACKEND_UNAVAILABLE', {
            status:Number.isFinite(Number(detail.status)) ? Number(detail.status) : null,
            source:String(detail.source || '')
          });
          if(typeof deps.onTrackedStateBackendUnavailable === 'function'){
            deps.onTrackedStateBackendUnavailable({
              status:Number.isFinite(Number(detail.status)) ? Number(detail.status) : null,
              source:String(detail.source || '')
            });
          }
        }
        return;
      }
      if(trackedStateBackendUnavailableNotified && typeof deps.onTrackedStateBackendRecovered === 'function'){
        deps.onTrackedStateBackendRecovered();
      }
      trackedStateBackendUnavailableNotified = false;
      if(deps.state && typeof deps.state === 'object'){
        deps.state.trackedStateBackendUnavailableNotified = false;
      }
    }

    function trackedStateEndpoint(){
      return deps.defaultTrackedStateEndpoint;
    }

    function normalizedRiskPercentForPersist(value){
      const numeric = deps.numericOrNull(value);
      if(!Number.isFinite(numeric) || numeric <= 0) return 1;
      return numeric;
    }

    function shouldSyncTickerRecordToBackend(record){
      const item = deps.normalizeTickerRecord(record || {});
      return !!(
        item.watchlist.inWatchlist
        || item.review.manualReview
        || item.plan.hasValidPlan
        || ['watchlist','reviewed','planned','shortlisted'].includes(String(item.lifecycle.stage || ''))
      );
    }

    function trackedTickerRecordsPayload(){
      const records = {};
      Object.values(deps.normalizeTickerRecordsMap(deps.state.tickerRecords || {})).forEach(record => {
        if(shouldSyncTickerRecordToBackend(record)) records[record.ticker] = record;
      });
      const removedRecords = {};
      const currentTickers = new Set(Object.keys(records));
      const localTrackedTickers = deps.uniqueTickers(deps.state.backendLocalTrackedTickers || []);
      const knownVersions = deps.state.backendTrackedVersions && typeof deps.state.backendTrackedVersions === 'object' ? deps.state.backendTrackedVersions : {};
      localTrackedTickers.forEach(ticker => {
        if(!currentTickers.has(ticker)) removedRecords[ticker] = String(knownVersions[ticker] || '');
      });
      return {
        settings:{
          accountSize:deps.currentAccountSizeGbp(),
          riskPercent:normalizedRiskPercentForPersist(deps.state.riskPercent),
          maxLossOverride:deps.numericOrNull(deps.state.maxLossOverride),
          wholeSharesOnly:deps.state.wholeSharesOnly !== false,
          marketStatus:String(deps.state.marketStatus || ''),
          dataProvider:deps.normalizeDataProvider(deps.state.dataProvider),
          apiPlan:String(deps.state.apiPlan || deps.DEFAULT_API_PLAN)
        },
        records,
        removedRecords
      };
    }

    function updateBackendTrackedVersions(records){
      const next = {};
      Object.entries(records && typeof records === 'object' ? records : {}).forEach(([ticker, record]) => {
        next[deps.normalizeTicker(ticker)] = String(record && record.meta && record.meta.updatedAt || '');
      });
      deps.state.backendTrackedVersions = next;
    }

    function syncBackendTrackedOwnership(remoteRecords){
      const remoteTickers = deps.uniqueTickers(Object.keys(remoteRecords && typeof remoteRecords === 'object' ? remoteRecords : {}));
      const backendOwned = new Set(deps.uniqueTickers(deps.state.backendLocalTrackedTickers || []));
      const remoteTickerSet = new Set(remoteTickers);
      let changed = false;
      backendOwned.forEach(ticker => {
        if(remoteTickerSet.has(ticker)) return;
        const localRecord = deps.state.tickerRecords && deps.state.tickerRecords[ticker] ? deps.normalizeTickerRecord(deps.state.tickerRecords[ticker]) : null;
        const syncedUpdatedAt = String((deps.state.backendTrackedVersions && deps.state.backendTrackedVersions[ticker]) || '');
        const localUpdatedAt = String(localRecord && localRecord.meta && localRecord.meta.updatedAt || '');
        const hasNewerLocalWork = !!(localRecord && localUpdatedAt && syncedUpdatedAt && localUpdatedAt > syncedUpdatedAt);
        if(localRecord && !hasNewerLocalWork){
          delete deps.state.tickerRecords[ticker];
          changed = true;
          backendOwned.delete(ticker);
          return;
        }
        if(!localRecord){
          backendOwned.delete(ticker);
        }
      });
      remoteTickers.forEach(ticker => backendOwned.add(ticker));
      deps.state.backendLocalTrackedTickers = [...backendOwned];
      return changed;
    }

    async function pushTrackedRecordsToBackend(options = {}){
      if(trackedStateBackendUnavailable && options.force !== true){
        deps.logDebug('DEBUG_STORAGE', 'TRACKED_STATE_PERSIST_SKIP_BACKEND_UNAVAILABLE', {reason:String(options.reason || 'backend_unavailable')});
        return false;
      }
      const payload = trackedTickerRecordsPayload();
      const payloadSignature = deps.trackedStatePersistSignature(payload);
      if(payloadSignature === trackedStatePersistLastSuccessfulSignature){
        deps.logDebug('DEBUG_STORAGE', 'TRACKED_STATE_PERSIST_SKIP_UNCHANGED', {reason:'signature_unchanged'});
        return false;
      }
      if(trackedStatePersistInFlight){
        trackedStatePersistFollowUp = true;
        deps.logDebug('DEBUG_STORAGE', 'TRACKED_STATE_PERSIST_SKIP_IN_FLIGHT', {reason:'in_flight'});
        return false;
      }
      trackedStatePersistInFlight = true;
      const localTrackedTickers = Object.keys(payload.records).map(deps.normalizeTicker);
      try{
        const response = await deps.fetchJsonWithTimeout(trackedStateEndpoint(), {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify(payload)
        });
        const body = await response.json().catch(() => ({}));
        if(response.status === 403 || response.status === 401){
          updateTrackedStateBackendAvailability(true, {status:response.status, source:'persist'});
          return false;
        }
        if(response.ok && body && body.trackedState){
          updateTrackedStateBackendAvailability(false, {status:response.status, source:'persist'});
          updateBackendTrackedVersions(body.trackedState.records);
          deps.state.backendLocalTrackedTickers = localTrackedTickers;
          deps.persistState();
          trackedStatePersistLastSuccessfulSignature = payloadSignature;
          deps.logDebug('DEBUG_STORAGE', 'TRACKED_STATE_PERSIST_OK', {
            trackedTickers:localTrackedTickers.length
          });
          return true;
        }
      }catch(error){
        deps.logDebugWarn('DEBUG_STORAGE', 'TRACKED_STATE_PERSIST_ERROR', {
          message:String(error && error.message || 'tracked_state_persist_failed')
        });
      }finally{
        trackedStatePersistInFlight = false;
        if(trackedStatePersistFollowUp){
          trackedStatePersistFollowUp = false;
          requestTrackedStatePersist({reason:'follow_up'});
        }
      }
      return false;
    }

    function requestTrackedStatePersist(options = {}){
      if(trackedStateBackendUnavailable && options.force !== true){
        deps.logDebug('DEBUG_STORAGE', 'TRACKED_STATE_PERSIST_SKIP_BACKEND_UNAVAILABLE', {reason:String(options.reason || 'backend_unavailable')});
        return;
      }
      const delayMs = Number.isFinite(Number(options.delayMs)) ? Math.max(0, Number(options.delayMs)) : 0;
      const reason = String(options.reason || 'unspecified');
      if(trackedStatePersistInFlight){
        trackedStatePersistFollowUp = true;
        deps.logDebug('DEBUG_STORAGE', 'TRACKED_STATE_PERSIST_QUEUE_FOLLOW_UP', {reason});
        return;
      }
      if(trackedStatePersistScheduled){
        deps.logDebug('DEBUG_STORAGE', 'TRACKED_STATE_PERSIST_COALESCED', {reason});
        return;
      }
      trackedStatePersistScheduled = true;
      const flush = () => {
        trackedStatePersistScheduled = false;
        if(deps.isPersistBurstActive()){
          trackedStatePersistFollowUp = true;
          deps.logDebug('DEBUG_STORAGE', 'TRACKED_STATE_PERSIST_DEFER_SCAN', {reason});
          return;
        }
        pushTrackedRecordsToBackend({reason});
      };
      if(delayMs > 0){
        clearTimeout(backendSyncTimer);
        backendSyncTimer = setTimeout(flush, delayMs);
        return;
      }
      setTimeout(flush, 0);
    }

    function scheduleTrackedRecordsSync(delayMs = 800){
      requestTrackedStatePersist({delayMs, reason:'legacy_schedule'});
    }

    async function pullTrackedRecordsFromBackend(options = {}){
      if(trackedStateBackendUnavailable && options.force !== true){
        deps.logDebug('DEBUG_STORAGE', 'TRACKED_STATE_PULL_SKIP_BACKEND_UNAVAILABLE', {reason:String(options.reason || 'backend_unavailable')});
        return false;
      }
      try{
        const response = await deps.fetchJsonWithTimeout(trackedStateEndpoint(), {method:'GET'});
        if(response.status === 403 || response.status === 401){
          updateTrackedStateBackendAvailability(true, {status:response.status, source:'pull'});
          return false;
        }
        const payload = await response.json().catch(() => ({}));
        if(!response.ok || !payload || payload.ok === false || !payload.trackedState) return false;
        updateTrackedStateBackendAvailability(false, {status:response.status, source:'pull'});
        const trackedState = payload.trackedState;
        let changed = syncBackendTrackedOwnership(trackedState.records);
        Object.entries((trackedState.records && typeof trackedState.records === 'object') ? trackedState.records : {}).forEach(([ticker, incoming]) => {
          const symbol = deps.normalizeTicker(ticker);
          if(!symbol || !incoming || typeof incoming !== 'object') return;
          const local = deps.getTickerRecord(symbol);
          const incomingUpdatedAt = String(incoming.meta && incoming.meta.updatedAt || '');
          const localUpdatedAt = String(local && local.meta && local.meta.updatedAt || '');
          if(!local || !localUpdatedAt || (incomingUpdatedAt && incomingUpdatedAt >= localUpdatedAt)){
            deps.state.tickerRecords[symbol] = deps.normalizeTickerRecord({...incoming, ticker:symbol});
            changed = true;
          }
        });
        if(changed){
          deps.syncLegacyCollectionsFromTickerRecords();
          if(options.render !== false){
            deps.renderScannerResults();
            deps.renderWatchlist();
            deps.renderFocusQueue();
            deps.renderReviewWorkspace();
          }
        }
        updateBackendTrackedVersions(trackedState.records);
        deps.persistState();
        return changed;
      }catch(error){
        return false;
      }
    }

    function bootstrapBackgroundMonitoring(pollMs){
      pullTrackedRecordsFromBackend();
      clearInterval(backendRefreshTimer);
      backendRefreshTimer = setInterval(() => {
        pullTrackedRecordsFromBackend();
      }, pollMs);
    }

    return {
      trackedStateEndpoint,
      scheduleTrackedRecordsSync,
      requestTrackedStatePersist,
      pullTrackedRecordsFromBackend,
      bootstrapBackgroundMonitoring,
      isTrackedStateBackendUnavailable:() => trackedStateBackendUnavailable
    };
  }

  global.TrackedStateService = Object.assign({}, global.TrackedStateService, {
    createTrackedStateService
  });
})(window);
