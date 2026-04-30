(function(global){
  function createTrackedStateService(deps){
    const MIN_PERSIST_INTERVAL_MS = 500;
    const PERSIST_PAYLOAD_CHUNK_SIZE = 20;
    const TRACK_REFRESH_DEFER_RETRY_MS = 350;
    let backendSyncTimer = null;
    let backendRefreshTimer = null;
    let persistIdleHandle = null;
    let persistRetryTimer = null;
    let trackedStatePersistScheduled = false;
    let trackedStatePersistInFlight = false;
    let trackedStatePersistFollowUp = false;
    let trackedStatePersistDeferredByTrackRefresh = false;
    let trackedStatePersistLastSuccessfulSignature = '';
    let trackedStatePersistLastStartedAt = 0;
    let trackedStatePullInFlightPromise = null;
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

    function clearPersistIdleHandle(){
      if(persistIdleHandle == null) return;
      if(typeof window !== 'undefined' && typeof window.cancelIdleCallback === 'function'){
        try{
          window.cancelIdleCallback(persistIdleHandle);
        }catch(error){}
      }else{
        clearTimeout(persistIdleHandle);
      }
      persistIdleHandle = null;
    }

    function clearPersistRetryTimer(){
      if(persistRetryTimer == null) return;
      clearTimeout(persistRetryTimer);
      persistRetryTimer = null;
    }

    function scheduleLowPriorityPersistFlush(flush, options = {}){
      const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Math.max(0, Number(options.timeoutMs)) : 1000;
      if(typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function'){
        persistIdleHandle = window.requestIdleCallback(() => {
          persistIdleHandle = null;
          flush();
        }, {timeout:timeoutMs});
        return;
      }
      persistIdleHandle = setTimeout(() => {
        persistIdleHandle = null;
        flush();
      }, 0);
    }

    function schedulePersistRetry(options = {}){
      const reason = String(options.reason || 'track_refresh_deferred');
      const waitMs = Number.isFinite(Number(options.delayMs))
        ? Math.max(100, Number(options.delayMs))
        : TRACK_REFRESH_DEFER_RETRY_MS;
      clearPersistRetryTimer();
      persistRetryTimer = setTimeout(() => {
        persistRetryTimer = null;
        if(trackedStatePersistInFlight || trackedStatePersistScheduled) return;
        trackedStatePersistScheduled = true;
        scheduleLowPriorityPersistFlush(() => {
          trackedStatePersistScheduled = false;
          const stillRefreshingTrack = typeof deps.isTrackRefreshInFlight === 'function'
            ? deps.isTrackRefreshInFlight() === true
            : false;
          if(stillRefreshingTrack){
            trackedStatePersistFollowUp = true;
            trackedStatePersistDeferredByTrackRefresh = true;
            schedulePersistRetry({reason:'track_refresh_still_in_flight'});
            return;
          }
          pushTrackedRecordsToBackend({reason});
        }, {timeoutMs:1000});
      }, waitMs);
    }

    function yieldPersistChunk(){
      return new Promise(resolve => {
        setTimeout(resolve, 0);
      });
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

    async function trackedTickerRecordsPayloadChunked(){
      const records = {};
      const normalizedRecords = Object.values(deps.normalizeTickerRecordsMap(deps.state.tickerRecords || {}));
      for(let index = 0; index < normalizedRecords.length; index += 1){
        const record = normalizedRecords[index];
        if(shouldSyncTickerRecordToBackend(record)) records[record.ticker] = record;
        if(index > 0 && (index % PERSIST_PAYLOAD_CHUNK_SIZE) === 0){
          await yieldPersistChunk();
        }
      }
      const removedRecords = {};
      const currentTickers = new Set(Object.keys(records));
      const localTrackedTickers = deps.uniqueTickers(deps.state.backendLocalTrackedTickers || []);
      const knownVersions = deps.state.backendTrackedVersions && typeof deps.state.backendTrackedVersions === 'object' ? deps.state.backendTrackedVersions : {};
      for(let index = 0; index < localTrackedTickers.length; index += 1){
        const ticker = localTrackedTickers[index];
        if(!currentTickers.has(ticker)) removedRecords[ticker] = String(knownVersions[ticker] || '');
        if(index > 0 && (index % PERSIST_PAYLOAD_CHUNK_SIZE) === 0){
          await yieldPersistChunk();
        }
      }
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
      const persistStartedAt = Date.now();
      const payload = await trackedTickerRecordsPayloadChunked();
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
      clearPersistRetryTimer();
      trackedStatePersistInFlight = true;
      trackedStatePersistLastStartedAt = Date.now();
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
          deps.logDebug('DEBUG_STORAGE', 'TRACKED_STATE_PERSIST_TIMING', {
            durationMs:Date.now() - persistStartedAt,
            recordCount:localTrackedTickers.length
          });
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
      const trackRefreshInFlight = typeof deps.isTrackRefreshInFlight === 'function'
        ? deps.isTrackRefreshInFlight() === true
        : false;
      if(trackRefreshInFlight && options.force !== true){
        trackedStatePersistFollowUp = true;
        trackedStatePersistDeferredByTrackRefresh = true;
        deps.logDebug('DEBUG_STORAGE', 'TRACKED_STATE_PERSIST_DEFER_TRACK_REFRESH', {reason});
        schedulePersistRetry({reason:'track_refresh_deferred'});
        return;
      }
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
        const now = Date.now();
        const sinceLastPersistMs = now - trackedStatePersistLastStartedAt;
        if(trackedStatePersistLastStartedAt > 0 && sinceLastPersistMs < MIN_PERSIST_INTERVAL_MS){
          trackedStatePersistScheduled = true;
          const waitMs = Math.max(0, MIN_PERSIST_INTERVAL_MS - sinceLastPersistMs);
          clearTimeout(backendSyncTimer);
          backendSyncTimer = setTimeout(() => {
            scheduleLowPriorityPersistFlush(flush, {timeoutMs:1000});
          }, waitMs);
          deps.logDebug('DEBUG_STORAGE', 'TRACKED_STATE_PERSIST_THROTTLED', {reason, waitMs});
          return;
        }
        const stillRefreshingTrack = typeof deps.isTrackRefreshInFlight === 'function'
          ? deps.isTrackRefreshInFlight() === true
          : false;
        if(stillRefreshingTrack){
          trackedStatePersistFollowUp = true;
          trackedStatePersistDeferredByTrackRefresh = true;
          deps.logDebug('DEBUG_STORAGE', 'TRACKED_STATE_PERSIST_DEFER_TRACK_REFRESH', {reason:'track_refresh_in_flight_flush'});
          schedulePersistRetry({reason:'track_refresh_in_flight_flush'});
          return;
        }
        if(deps.isPersistBurstActive()){
          trackedStatePersistFollowUp = true;
          deps.logDebug('DEBUG_STORAGE', 'TRACKED_STATE_PERSIST_DEFER_SCAN', {reason});
          return;
        }
        if(trackedStatePersistDeferredByTrackRefresh){
          trackedStatePersistDeferredByTrackRefresh = false;
        }
        pushTrackedRecordsToBackend({reason});
      };
      if(delayMs > 0){
        clearTimeout(backendSyncTimer);
        clearPersistIdleHandle();
        backendSyncTimer = setTimeout(() => {
          scheduleLowPriorityPersistFlush(flush, {timeoutMs:1000});
        }, delayMs);
        return;
      }
      clearPersistIdleHandle();
      scheduleLowPriorityPersistFlush(flush, {timeoutMs:1000});
    }

    function scheduleTrackedRecordsSync(delayMs = 800){
      requestTrackedStatePersist({delayMs, reason:'legacy_schedule'});
    }

    async function pullTrackedRecordsFromBackend(options = {}){
      if(trackedStatePullInFlightPromise){
        deps.logDebug('DEBUG_STORAGE', 'TRACKED_STATE_PULL_REUSE_IN_FLIGHT', {reason:String(options.reason || 'in_flight')});
        return trackedStatePullInFlightPromise;
      }
      if(trackedStateBackendUnavailable && options.force !== true){
        deps.logDebug('DEBUG_STORAGE', 'TRACKED_STATE_PULL_SKIP_BACKEND_UNAVAILABLE', {reason:String(options.reason || 'backend_unavailable')});
        return false;
      }
      trackedStatePullInFlightPromise = (async () => {
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
      }finally{
        trackedStatePullInFlightPromise = null;
      }
      })();
      return trackedStatePullInFlightPromise;
    }

    function bootstrapBackgroundMonitoring(pollMs, options = {}){
      if(options.initialPull !== false) pullTrackedRecordsFromBackend({reason:String(options.reason || 'background_bootstrap')});
      clearInterval(backendRefreshTimer);
      backendRefreshTimer = setInterval(() => {
        pullTrackedRecordsFromBackend({reason:'background_poll'});
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
