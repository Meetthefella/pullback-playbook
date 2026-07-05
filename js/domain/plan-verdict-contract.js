(function(global){
  const CATEGORY = Object.freeze({
    CANONICAL_AUTHORITY:'canonical_authority',
    DERIVED_AUTHORITY:'derived_authority',
    PERSISTED_STATE:'persisted_state',
    DISPLAY_CACHE:'display_cache',
    DIAGNOSTICS_ONLY:'diagnostics_only',
    TEMPORARY_UI_STATE:'temporary_ui_state'
  });

  const FIELD_CLASSIFICATIONS = Object.freeze({
    'ticker':CATEGORY.CANONICAL_AUTHORITY,
    'marketData.price':CATEGORY.CANONICAL_AUTHORITY,
    'marketData.asOf':CATEGORY.CANONICAL_AUTHORITY,
    'marketData.ma20':CATEGORY.CANONICAL_AUTHORITY,
    'marketData.ma50':CATEGORY.CANONICAL_AUTHORITY,
    'marketData.ma200':CATEGORY.CANONICAL_AUTHORITY,
    'marketData.sma20':CATEGORY.CANONICAL_AUTHORITY,
    'marketData.sma50':CATEGORY.CANONICAL_AUTHORITY,
    'marketData.sma200':CATEGORY.CANONICAL_AUTHORITY,
    'marketData.volume':CATEGORY.CANONICAL_AUTHORITY,
    'marketData.avgVolume':CATEGORY.CANONICAL_AUTHORITY,
    'marketData.avgVolume30d':CATEGORY.CANONICAL_AUTHORITY,
    'marketData.perf1w':CATEGORY.CANONICAL_AUTHORITY,
    'marketData.perf1m':CATEGORY.CANONICAL_AUTHORITY,
    'scan.resolvedVerdict':CATEGORY.CANONICAL_AUTHORITY,
    'scan.verdict':CATEGORY.CANONICAL_AUTHORITY,
    'scan.score':CATEGORY.CANONICAL_AUTHORITY,
    'scan.flags':CATEGORY.CANONICAL_AUTHORITY,
    'scan.analysisProjection':CATEGORY.CANONICAL_AUTHORITY,
    'review.manualReview':CATEGORY.CANONICAL_AUTHORITY,
    'review.savedVerdict':CATEGORY.PERSISTED_STATE,
    'review.savedSummary':CATEGORY.PERSISTED_STATE,
    'review.savedScore':CATEGORY.PERSISTED_STATE,
    'review.savedProjectionSnapshot':CATEGORY.DISPLAY_CACHE,
    'review.analysisState.normalized':CATEGORY.DERIVED_AUTHORITY,
    'review.draft':CATEGORY.TEMPORARY_UI_STATE,
    'plan.entry':CATEGORY.CANONICAL_AUTHORITY,
    'plan.stop':CATEGORY.CANONICAL_AUTHORITY,
    'plan.firstTarget':CATEGORY.CANONICAL_AUTHORITY,
    'plan.source':CATEGORY.CANONICAL_AUTHORITY,
    'plan.authoritySource':CATEGORY.PERSISTED_STATE,
    'plan.authorityVersion':CATEGORY.PERSISTED_STATE,
    'plan.authorityReason':CATEGORY.PERSISTED_STATE,
    'plan.writtenBy':CATEGORY.PERSISTED_STATE,
    'plan.writtenAt':CATEGORY.PERSISTED_STATE,
    'plan.candidateSource':CATEGORY.PERSISTED_STATE,
    'plan.submittedPaperTradeAt':CATEGORY.PERSISTED_STATE,
    'setup.score':CATEGORY.DERIVED_AUTHORITY,
    'setup.structureState':CATEGORY.DERIVED_AUTHORITY,
    'setup.structureEligibility':CATEGORY.DERIVED_AUTHORITY,
    'setup.setupLocationState':CATEGORY.DERIVED_AUTHORITY,
    'setup.pullbackZone':CATEGORY.DERIVED_AUTHORITY,
    'setup.priceabilityState':CATEGORY.DERIVED_AUTHORITY,
    'setup.bounceState':CATEGORY.DERIVED_AUTHORITY,
    'setup.stabilisationState':CATEGORY.DERIVED_AUTHORITY,
    'setup.trendState':CATEGORY.DERIVED_AUTHORITY,
    'lifecycle.stage':CATEGORY.PERSISTED_STATE,
    'lifecycle.status':CATEGORY.PERSISTED_STATE,
    'lifecycle.lockReason':CATEGORY.PERSISTED_STATE,
    'lifecycle.expiresAt':CATEGORY.PERSISTED_STATE,
    'watchlist.inWatchlist':CATEGORY.PERSISTED_STATE,
    'watchlist.presentation':CATEGORY.DISPLAY_CACHE,
    'watchlist.presentation.sharedPresentation':CATEGORY.DISPLAY_CACHE,
    'watchlist.debug':CATEGORY.DIAGNOSTICS_ONLY,
    'visualBucket':CATEGORY.DISPLAY_CACHE,
    'presentationBucket':CATEGORY.DISPLAY_CACHE,
    'badgeLabel':CATEGORY.DISPLAY_CACHE,
    'actionLabel':CATEGORY.DISPLAY_CACHE,
    'tone':CATEGORY.DISPLAY_CACHE,
    'track.diagnostics':CATEGORY.DIAGNOSTICS_ONLY,
    'ui.activeReviewProjectionSource':CATEGORY.TEMPORARY_UI_STATE,
    'ui.activeReviewSourceProjectionSnapshot':CATEGORY.TEMPORARY_UI_STATE
  });

  function safeObject(value){
    return value && typeof value === 'object' ? value : {};
  }

  function numericOrNull(value){
    if(value === null || value === undefined) return null;
    if(typeof value === 'string' && value.trim() === '') return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function normalizeVerdict(value){
    const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
    if(['watch', 'near_entry', 'entry', 'avoid'].includes(safe)) return safe;
    if(safe.indexOf('near') >= 0 && safe.indexOf('entry') >= 0) return 'near_entry';
    if(safe.indexOf('entry') >= 0) return 'entry';
    if(safe.indexOf('avoid') >= 0) return 'avoid';
    return 'watch';
  }

  function normalizeOptionalVerdict(value){
    if(value === null || value === undefined) return '';
    if(typeof value === 'string' && value.trim() === '') return '';
    return normalizeVerdict(value);
  }

  function firstFinite(values){
    for(let index = 0; index < values.length; index += 1){
      const numeric = numericOrNull(values[index]);
      if(Number.isFinite(numeric)) return numeric;
    }
    return null;
  }

  function visualBucketForVerdict(value){
    const verdict = normalizeVerdict(value);
    if(verdict === 'entry') return 'entry';
    if(verdict === 'near_entry') return 'near_entry';
    if(verdict === 'avoid') return 'avoid';
    return 'monitor';
  }

  function verdictLabel(value){
    const verdict = normalizeVerdict(value);
    if(verdict === 'entry') return 'Entry';
    if(verdict === 'near_entry') return 'Near Entry';
    if(verdict === 'avoid') return 'Avoid';
    return 'Watch';
  }

  function nextActionForVerdict(value){
    const verdict = normalizeVerdict(value);
    if(verdict === 'entry') return 'Execute only if the trigger remains valid.';
    if(verdict === 'near_entry') return 'Wait for stronger confirmation before considering entry.';
    if(verdict === 'avoid') return 'Avoid until structure rebuilds and risk can be defined cleanly.';
    return 'Wait for stronger confirmation before considering entry.';
  }

  function primaryReasonForVerdict(value){
    const verdict = normalizeVerdict(value);
    if(verdict === 'entry') return 'Buyers are in control and the setup is ready to act on.';
    if(verdict === 'near_entry') return 'The setup is close, but confirmation still needs to improve.';
    if(verdict === 'avoid') return 'A blocking issue is active, so the setup is not tradable.';
    return 'Confirmation is still developing, so the setup stays on watch.';
  }

  function stableClone(value){
    if(value == null) return value;
    try{
      return JSON.parse(JSON.stringify(value));
    }catch(_error){
      return null;
    }
  }

  function stableSerialize(value){
    if(value == null) return 'null';
    if(typeof value !== 'object') return JSON.stringify(value);
    if(Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
  }

  function hashString(input){
    let hash = 2166136261;
    for(let index = 0; index < input.length; index += 1){
      hash ^= input.charCodeAt(index);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return `fp_${(hash >>> 0).toString(16).padStart(8, '0')}_${input.length}`;
  }

  function resolveCanonicalVerdict(inputs, context = {}){
    const resolvedContract = safeObject(context.resolvedContract);
    const globalVerdict = safeObject(context.globalVerdict);
    const savedReviewVerdict = normalizeOptionalVerdict(inputs.reviewAuthority.savedVerdict);
    const manualReviewVerdict = normalizeOptionalVerdict(inputs.reviewAuthority.manualVerdict);
    const explicitSavedDowngrade = savedReviewVerdict && savedReviewVerdict !== 'entry'
      ? savedReviewVerdict
      : (manualReviewVerdict && manualReviewVerdict !== 'entry'
        ? manualReviewVerdict
        : '');
    return normalizeVerdict(
      explicitSavedDowngrade
      ||
      resolvedContract.canonical_final_verdict
      || resolvedContract.final_verdict_rendered
      || resolvedContract.final_verdict
      || resolvedContract.finalVerdict
      || globalVerdict.canonical_final_verdict
      || globalVerdict.final_verdict_rendered
      || globalVerdict.final_verdict
      || globalVerdict.finalVerdict
      || savedReviewVerdict
      || manualReviewVerdict
      || inputs.scanner.resolvedVerdict
      || 'watch'
    );
  }

  function resolveCanonicalVisualBucket(inputs, context = {}, canonicalVerdict = 'watch'){
    const resolvedContract = safeObject(context.resolvedContract);
    const visualState = safeObject(context.visualState);
    const verdictBucket = visualBucketForVerdict(canonicalVerdict);
    if(['entry', 'near_entry', 'avoid'].includes(verdictBucket)){
      return verdictBucket;
    }
    return visualBucketForVerdict(
      resolvedContract.canonical_visual_bucket
      || visualState.visualBucket
      || visualState.presentationBucket
      || visualState.bucket
      || verdictBucket
    );
  }

  function resolvePlanAuthority(inputs, context = {}){
    const effectivePlan = safeObject(context.effectivePlan);
    const displayedPlan = safeObject(context.displayedPlan);
    const source = String(
      effectivePlan.source
      || displayedPlan.source
      || inputs.planAuthority.source
      || 'none'
    ).trim().toLowerCase() || 'none';
    const entry = firstFinite([effectivePlan.entry, displayedPlan.entry, inputs.planAuthority.entry]);
    const stop = firstFinite([effectivePlan.stop, displayedPlan.stop, inputs.planAuthority.stop]);
    const firstTarget = firstFinite([
      effectivePlan.firstTarget,
      displayedPlan.target,
      displayedPlan.firstTarget,
      inputs.planAuthority.firstTarget
    ]);
    return {
      entry,
      stop,
      firstTarget,
      source,
      stamped:!!(inputs.planAuthority.authoritySource && inputs.planAuthority.authorityVersion),
      status:String(displayedPlan.status || context.planStatus || '').trim().toLowerCase() || 'missing',
      tradeability:String(displayedPlan.tradeability || '').trim().toLowerCase(),
      riskStatus:String(displayedPlan.riskFit && displayedPlan.riskFit.risk_status || displayedPlan.riskStatus || '').trim().toLowerCase()
    };
  }

  function resolveLifecycleAuthority(inputs, context = {}, canonicalVerdict = 'watch'){
    const lifecycleSnapshot = safeObject(context.lifecycleSnapshot);
    return {
      stage:String(lifecycleSnapshot.stage || inputs.lifecycleAuthority.stage || '').trim().toLowerCase(),
      status:String(lifecycleSnapshot.status || inputs.lifecycleAuthority.status || '').trim().toLowerCase(),
      state:String(lifecycleSnapshot.state || canonicalVerdict || '').trim().toLowerCase(),
      label:String(lifecycleSnapshot.label || '').trim(),
      lockReason:String(inputs.lifecycleAuthority.lockReason || '').trim(),
      expiresAt:String(lifecycleSnapshot.expiresAt || inputs.lifecycleAuthority.expiresAt || '').trim()
    };
  }

  function resolvePaperTradeAuthority(inputs, context = {}){
    const displayedPlan = safeObject(context.displayedPlan);
    const existing = safeObject(inputs.paperTradeAuthority);
    return {
      submittedTrades:Array.isArray(existing.submittedTrades) ? existing.submittedTrades.slice() : [],
      submittedPaperTradeAt:String(context.submittedPaperTradeAt || inputs.planAuthority.submittedPaperTradeAt || '').trim(),
      currentPlanSnapshot:displayedPlan && Object.keys(displayedPlan).length ? stableClone({
        entry:displayedPlan.entry,
        stop:displayedPlan.stop,
        target:displayedPlan.target,
        firstTarget:displayedPlan.firstTarget,
        status:displayedPlan.status
      }) : null
    };
  }

  function resolveDerivedStateSnapshot(record, context = {}, inputs, planAuthority, lifecycleAuthority){
    const setup = safeObject(safeObject(record).setup);
    const derivedStates = safeObject(context.derivedStates);
    return {
      setupScore:firstFinite([context.setupScore, context.displayedPlan && context.displayedPlan.setupScore, resolveSetupScore(record, inputs)]),
      planReady:Number.isFinite(planAuthority.entry) && Number.isFinite(planAuthority.stop) && Number.isFinite(planAuthority.firstTarget),
      planStatus:String(planAuthority.status || '').trim().toLowerCase() || 'missing',
      tradeability:String(planAuthority.tradeability || '').trim().toLowerCase(),
      riskStatus:String(planAuthority.riskStatus || '').trim().toLowerCase(),
      inWatchlist:safeObject(safeObject(record).watchlist).inWatchlist === true,
      hasSavedReviewAuthority:!!inputs.reviewAuthority.savedVerdict,
      structureState:String(derivedStates.structureState || setup.structureState || '').trim().toLowerCase(),
      structureEligibility:String(derivedStates.structureEligibility || setup.structureEligibility || '').trim().toLowerCase(),
      setupLocationState:String(derivedStates.setupLocationState || setup.setupLocationState || '').trim().toLowerCase(),
      priceabilityState:String(derivedStates.priceabilityState || setup.priceabilityState || '').trim().toLowerCase(),
      bounceState:String(derivedStates.bounceState || setup.bounceState || '').trim().toLowerCase(),
      lifecycleState:String(lifecycleAuthority.state || '').trim().toLowerCase()
    };
  }

  function authoritativeInputsFromRecord(record, context = {}){
    const item = safeObject(record);
    const marketData = safeObject(item.marketData);
    const scan = safeObject(item.scan);
    const review = safeObject(item.review);
    const plan = safeObject(item.plan);
    const lifecycle = safeObject(item.lifecycle);
    const stampedCanonicalPlan = !!(
      String(plan.authorityVersion || '').trim() === 'trade_plan_v1'
      && String(plan.authoritySource || '').trim()
      && String(plan.writtenBy || '').trim()
      && String(plan.writtenAt || '').trim()
    );
    const diaryRecords = Array.isArray(context.submittedPaperTrades)
      ? context.submittedPaperTrades
      : (Array.isArray(item.diary && item.diary.records) ? item.diary.records : []);
    return {
      ticker:String(item.ticker || item.symbol || '').trim().toUpperCase(),
      marketData:{
        price:numericOrNull(marketData.price ?? marketData.currentPrice ?? marketData.close),
        ma20:numericOrNull(marketData.ma20 ?? marketData.sma20),
        ma50:numericOrNull(marketData.ma50 ?? marketData.sma50),
        ma200:numericOrNull(marketData.ma200 ?? marketData.sma200),
        volume:numericOrNull(marketData.volume),
        avgVolume:numericOrNull(marketData.avgVolume ?? marketData.avgVolume30d),
        perf1w:numericOrNull(marketData.perf1w),
        perf1m:numericOrNull(marketData.perf1m),
        asOf:String(marketData.asOf || marketData.timestamp || '').trim()
      },
      scanner:{
        resolvedVerdict:String(scan.resolvedVerdict || scan.verdict || '').trim(),
        score:numericOrNull(scan.score),
        analysisProjection:stableClone(scan.analysisProjection),
        flags:stableClone(scan.flags)
      },
      reviewAuthority:{
        savedVerdict:String(review.savedVerdict || '').trim(),
        savedScore:numericOrNull(review.savedScore),
        manualReview:review.manualReview && typeof review.manualReview === 'object'
          ? {
            entry:numericOrNull(review.manualReview.entry),
            stop:numericOrNull(review.manualReview.stop),
            target:numericOrNull(review.manualReview.target),
            score:numericOrNull(review.manualReview.score)
          }
          : null
      },
      planAuthority:{
        entry:stampedCanonicalPlan ? numericOrNull(plan.entry) : null,
        stop:stampedCanonicalPlan ? numericOrNull(plan.stop) : null,
        firstTarget:stampedCanonicalPlan ? numericOrNull(plan.firstTarget ?? plan.target) : null,
        source:stampedCanonicalPlan ? String(plan.source || '').trim().toLowerCase() : '',
        authoritySource:stampedCanonicalPlan ? String(plan.authoritySource || '').trim().toLowerCase() : '',
        authorityVersion:stampedCanonicalPlan ? String(plan.authorityVersion || '').trim() : '',
        submittedPaperTradeAt:String(plan.submittedPaperTradeAt || '').trim()
      },
      lifecycleAuthority:{
        stage:String(lifecycle.stage || '').trim().toLowerCase(),
        status:String(lifecycle.status || '').trim().toLowerCase(),
        lockReason:String(lifecycle.lockReason || '').trim(),
        expiresAt:String(lifecycle.expiresAt || '').trim()
      },
      paperTradeAuthority:{
        submittedTrades:diaryRecords
          .filter(entry => entry && typeof entry === 'object')
          .filter(entry => String(entry.sourceType || '').trim().toLowerCase() === 'paper_trade' || String(entry.status || '').trim().toLowerCase() === 'submitted')
          .map(entry => ({
            id:String(entry.id || entry.sourceRef || '').trim(),
            ticker:String(entry.ticker || item.ticker || '').trim().toUpperCase(),
            status:String(entry.status || '').trim().toLowerCase(),
            submittedAt:String(entry.updatedAt || entry.date || '').trim()
          }))
      }
    };
  }

  function resolveSetupScore(record, inputs){
    const setup = safeObject(safeObject(record).setup);
    if(Number.isFinite(inputs.reviewAuthority.savedScore)) return inputs.reviewAuthority.savedScore;
    if(Number.isFinite(numericOrNull(setup.score))) return numericOrNull(setup.score);
    if(Number.isFinite(inputs.scanner.score)) return inputs.scanner.score;
    return null;
  }

  function buildPlanVerdictContract(record, context = {}){
    const inputs = authoritativeInputsFromRecord(record, context);
    const canonicalVerdict = resolveCanonicalVerdict(inputs, context);
    const canonicalVisualBucket = resolveCanonicalVisualBucket(inputs, context, canonicalVerdict);
    const planAuthority = resolvePlanAuthority(inputs, context);
    const lifecycleAuthority = resolveLifecycleAuthority(inputs, context, canonicalVerdict);
    const paperTradeAuthority = resolvePaperTradeAuthority(inputs, context);
    const derivedStates = resolveDerivedStateSnapshot(record, context, inputs, planAuthority, lifecycleAuthority);
    const contract = {
      schemaVersion:'plan-verdict-contract-v1',
      ticker:inputs.ticker,
      authoritativeInputs:inputs,
      canonicalVerdict,
      canonicalVisualBucket,
      derivedStates,
      planAuthority,
      lifecycleAuthority,
      paperTradeAuthority,
      diagnostics:{
        fingerprint:hashString(stableSerialize(inputs)),
        fieldCategories:FIELD_CLASSIFICATIONS,
        source:String(context.source || '').trim().toLowerCase(),
        surface:String(context.surface || '').trim().toLowerCase(),
        reason:String(context.reason || '').trim()
      }
    };
    contract.contractFingerprint = contractFingerprint(contract);
    return contract;
  }

  function canonicalInputFingerprint(record, context = {}){
    return hashString(stableSerialize(authoritativeInputsFromRecord(record, context)));
  }

  function contractFingerprint(contract){
    const safe = safeObject(contract);
    return hashString(stableSerialize({
      ticker:safe.ticker,
      authoritativeInputs:safe.authoritativeInputs,
      canonicalVerdict:safe.canonicalVerdict,
      canonicalVisualBucket:safe.canonicalVisualBucket,
      planAuthority:safe.planAuthority,
      lifecycleAuthority:safe.lifecycleAuthority,
      paperTradeAuthority:safe.paperTradeAuthority
    }));
  }

  function fieldClassificationForTickerRecordPath(path){
    return FIELD_CLASSIFICATIONS[String(path || '').trim()] || null;
  }

  function buildReviewRenderModel(contract, uiDraftState){
    const safe = safeObject(contract);
    const verdict = normalizeVerdict(safe.canonicalVerdict);
    const visualBucket = String(safe.canonicalVisualBucket || 'monitor');
    const actionable = verdict === 'entry' && !!(safe.planAuthority && safe.planAuthority.stamped);
    return {
      ticker:String(safe.ticker || ''),
      canonicalVerdict:verdict,
      visualBucket,
      tone:visualBucket,
      badgeLabel:verdictLabel(verdict),
      headline:verdict === 'entry' ? 'Entry Ready' : verdictLabel(verdict),
      nextAction:nextActionForVerdict(verdict),
      primaryReason:primaryReasonForVerdict(verdict),
      planVisible:verdict === 'entry',
      planStatus:String(safe.planAuthority && safe.planAuthority.status || safe.derivedStates && safe.derivedStates.planStatus || 'missing').trim().toLowerCase(),
      setupScore:numericOrNull(safe.derivedStates && safe.derivedStates.setupScore),
      actionable,
      draftState:stableClone(uiDraftState),
      contractFingerprint:contractFingerprint(safe)
    };
  }

  function buildTrackRenderModel(contract){
    const safe = safeObject(contract);
    const verdict = normalizeVerdict(safe.canonicalVerdict);
    const visualBucket = String(safe.canonicalVisualBucket || 'monitor');
    const planVisible = verdict === 'entry';
    const nextAction = nextActionForVerdict(verdict);
    const primaryReason = primaryReasonForVerdict(verdict);
    return {
      ticker:String(safe.ticker || ''),
      canonicalVerdict:verdict,
      visualBucket,
      visibleBucket:visualBucket,
      tone:visualBucket,
      badgeLabel:verdictLabel(verdict),
      headline:verdict === 'entry' ? 'Entry Ready' : verdictLabel(verdict),
      statusText:verdict === 'entry' ? 'Entry Ready' : verdictLabel(verdict),
      nextAction,
      actionLabel:nextAction,
      primaryReason,
      mainBlocker:primaryReason,
      planVisible,
      planStatus:String(safe.planAuthority && safe.planAuthority.status || safe.derivedStates && safe.derivedStates.planStatus || 'missing').trim().toLowerCase(),
      planSummary:planVisible ? 'Trade plan available.' : 'No actionable trade plan yet.',
      setupScore:numericOrNull(safe.derivedStates && safe.derivedStates.setupScore),
      inWatchlist:safe.derivedStates && safe.derivedStates.inWatchlist === true,
      contractFingerprint:contractFingerprint(safe)
    };
  }

  function buildTrackLongPressModel(contract){
    const trackModel = buildTrackRenderModel(contract);
    const verdict = normalizeVerdict(trackModel.canonicalVerdict);
    return {
      ticker:String(trackModel.ticker || ''),
      canonicalVerdict:verdict,
      header:verdict === 'entry' ? 'Entry Ready' : (verdict === 'near_entry' ? 'Near Entry' : 'Watch'),
      actionable:verdict === 'entry',
      nextAction:String(trackModel.nextAction || ''),
      primaryReason:String(trackModel.primaryReason || ''),
      visualBucket:String(trackModel.visibleBucket || trackModel.visualBucket || 'monitor'),
      contractFingerprint:String(trackModel.contractFingerprint || '')
    };
  }

  global.PlanVerdictContract = {
    CATEGORY,
    FIELD_CLASSIFICATIONS,
    fieldClassificationForTickerRecordPath,
    canonicalInputFingerprint,
    contractFingerprint,
    buildPlanVerdictContract,
    buildReviewRenderModel,
    buildTrackRenderModel,
    buildTrackLongPressModel
  };
})(window);
