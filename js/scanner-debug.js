(function(global){
  // Scanner trace/debug helpers extracted from app.js.
  function resolveScannerStateWithTrace(record, options = {}, deps = {}){
    const item = deps.normalizeTickerRecord(record);
    const baseView = options.baseView || deps.projectTickerForCard(item, {
      includeExecutionDowngrade:false,
      includeRuntimeFallback:false
    });
    const derivedStates = options.derivedStates || deps.analysisDerivedStatesFromRecord(baseView.item);
    const rrCategory = options.rrCategory || deps.rrCategoryForView(baseView);
    const structureQuality = options.structureQuality || deps.finalStructureQualityForView({
      ...baseView,
      setupStates:derivedStates
    });
    const isStructureValid = ['strong','developing_clean'].includes(structureQuality);
    const bounceState = String(derivedStates.bounceState || '').toLowerCase();
    const hasPlanAdjustmentBlock = options.hasPlanAdjustmentBlock != null
      ? !!options.hasPlanAdjustmentBlock
      : (
        baseView.planUiState.state === 'needs_adjustment'
        || rrCategory === 'stretched'
        || !!(baseView.item && baseView.item.plan && baseView.item.plan.firstTargetTooClose)
      );
    const finalSetupState = baseView.setupUiState.state === 'broken'
      ? 'broken'
      : (
        baseView.setupUiState.state === 'developing'
        || !isStructureValid
        || bounceState === 'none'
        || hasPlanAdjustmentBlock
          ? 'developing'
          : baseView.setupUiState.state
      );
    const planValidation = String(baseView.planUiState.state || '');
    const planRealism = deps.evaluatePlanRealism(item, {
      displayedPlan:baseView.displayedPlan,
      derivedStates,
      displayStage:baseView.displayStage,
      setupUiState:baseView.setupUiState,
      structureQuality
    });
    const setupScore = deps.numericOrNull(baseView.setupScore);
    const positionSize = deps.numericOrNull(baseView.positionSize);
    const rrValue = deps.numericOrNull(baseView.rrValue);
    const structureState = String(derivedStates.structureState || '').toLowerCase();
    const pullbackZone = String(derivedStates.pullbackZone || '').toLowerCase();
    const structurallyAlive = !['broken'].includes(structureState) && finalSetupState !== 'broken';
    const aliveDevelopingCandidate = structurallyAlive
      && ['developing','watch'].includes(String(baseView.setupUiState.state || '').toLowerCase())
      && ['intact','strong','weakening','developing','developing_clean','developing_loose'].includes(structureState)
      && ['near_20ma','near_50ma','at_20ma','at_50ma'].includes(pullbackZone);
    deps.resolveEmojiPresentation(item, {
      context:'scanner',
      finalVerdict:baseView.displayStage,
      setupUiState:baseView.setupUiState,
      displayedPlan:baseView.displayedPlan,
      derivedStates,
      warningState:baseView.warningState
    });
    const trace = [];
    const reasonCodes = [];
    const warnings = [];
    const addStep = (label, value) => trace.push(`${label}: ${value}`);
    const addReason = code => {
      if(code && !reasonCodes.includes(code)) reasonCodes.push(code);
    };
    const recordScanSetupType = deps.normalizeScanType(item.scan.scanSetupType || item.scan.scanType || '');
    const derivedScanType = derivedStates.scanType || derivedStates.scan_type || '';
    const derivedImportedScanType = derivedStates.importedScanType || derivedStates.imported_scan_type || '';
    const derivedOverlapDetected = derivedStates.setupTypeOverlapDetected || derivedStates.setup_type_overlap_detected || '';
    const derivedSetupTypeReason = derivedStates.setupTypeReason || derivedStates.setup_type_reason || '';
    const resolverSetupType = derivedScanType || recordScanSetupType || deps.currentSetupType() || 'unknown';

    addStep('scan source', item.scan.setupOrigin || 'unknown');
    addStep('current global setup type', deps.currentSetupType() || 'unknown');
    addStep('record scan_setup_type', derivedImportedScanType || recordScanSetupType || 'unknown');
    addStep('overlap detected', String(derivedOverlapDetected).toLowerCase() === 'yes' ? 'true' : 'false');
    addStep('resolver setup type used', resolverSetupType);
    addStep('setup-type decision reason', derivedSetupTypeReason || 'n/a');
    addStep('setup origin', item.scan.setupOrigin || 'manual');
    addStep('price vs 20/50/200 MA', [
      Number.isFinite(item.marketData.price) ? `price=${deps.fmtPrice(item.marketData.price)}` : 'price=n/a',
      Number.isFinite(item.marketData.ma20) ? `20=${deps.fmtPrice(item.marketData.ma20)}` : '20=n/a',
      Number.isFinite(item.marketData.ma50) ? `50=${deps.fmtPrice(item.marketData.ma50)}` : '50=n/a',
      Number.isFinite(item.marketData.ma200) ? `200=${deps.fmtPrice(item.marketData.ma200)}` : '200=n/a'
    ].join(' | '));
    addStep('structure state', derivedStates.structureState || '(none)');
    addStep('pullback zone', derivedStates.pullbackZone || '(none)');
    addStep('stabilisation state', derivedStates.stabilisationState || '(none)');
    addStep('bounce state', derivedStates.bounceState || '(none)');
    addStep('volume state', derivedStates.volumeState || '(none)');
    addStep('market regime / caution', item.setup.marketCaution ? 'market caution' : 'normal');
    addStep('estimated RR / tradeability', [
      Number.isFinite(baseView.rrValue) ? `rr=${Number(baseView.rrValue).toFixed(2)}` : 'rr=n/a',
      baseView.displayedPlan && baseView.displayedPlan.tradeability ? `tradeability=${baseView.displayedPlan.tradeability}` : 'tradeability=n/a'
    ].join(' | '));
    addStep('raw setup score', Number.isFinite(setupScore) ? `${setupScore}/10` : 'n/a');
    addStep('setup state', finalSetupState);
    addStep('structure quality', structureQuality);
    addStep('plan validation', planValidation || '(none)');
    addStep('plan adjustment block', hasPlanAdjustmentBlock ? 'true' : 'false');
    addStep('rr realism', `${planRealism.rr_realism_label || 'Unavailable'} | ${planRealism.credible_target_assessment || 'n/a'}`);
    if(planRealism.optimistic_target_flag) addStep('target realism flag', 'first target too optimistic');
    if(item.setup.marketCaution) addReason('hostile_market');
    if(['none','attempt'].includes(bounceState)) addReason('bounce_not_confirmed');
    if(planRealism.optimistic_target_flag) addReason('first_target_too_optimistic');

    let rrReliability = 'high';
    let rrLabel = 'High confidence';
    if(planValidation === 'needs_adjustment' || hasPlanAdjustmentBlock){
      rrReliability = 'low';
      rrLabel = 'Invalid plan';
    }else if(structureState !== 'strong'){
      rrReliability = 'low';
      rrLabel = 'Low confidence';
    }else if(bounceState === 'none'){
      rrReliability = 'conditional';
      rrLabel = 'Needs bounce';
    }
    addStep('rr reliability', `${Number.isFinite(rrValue) ? Number(rrValue).toFixed(2) : 'n/a'} | ${rrLabel}`);

    let bucket = 'filtered';
    let status = 'Avoid';
    const validPullbackContext = ['near_20ma','near_50ma','at_20ma','at_50ma'].includes(pullbackZone);
    const bounceConfirmed = bounceState === 'confirmed';

    if(planValidation === 'invalid') addReason('plan_invalid');
    if(planValidation === 'unrealistic_rr' || rrCategory === 'unrealistic') addReason('rr_unrealistic');
    if(Number.isFinite(positionSize) && positionSize < 1) addReason('size_below_one');
    if(hasPlanAdjustmentBlock || planValidation === 'needs_adjustment') addReason('needs_adjustment');
    if(planValidation === 'pending_validation') addReason('plan_premature');

    if(finalSetupState === 'broken' || !structurallyAlive){
      addReason('broken_setup');
    }else if(!validPullbackContext){
      addReason('no_pullback_context');
    }else if(Number.isFinite(setupScore) && setupScore >= 7 && bounceConfirmed){
      bucket = 'tradeable';
      status = 'Near Entry';
      addReason('scanner_ready_setup');
    }else if(Number.isFinite(setupScore) && setupScore >= 4){
      bucket = 'early';
      status = 'Watch';
      if(structureQuality === 'developing_loose') addReason('loose_structure');
      else if(structureQuality === 'developing_clean' && !bounceConfirmed) addReason('developing_no_bounce');
      else if(structureQuality === 'strong' && ['none','attempt'].includes(bounceState)) addReason(bounceState === 'attempt' ? 'bounce_attempt' : 'no_bounce');
      else addReason('scanner_review_candidate');
    }else{
      addReason('score_below_watch_floor');
    }

    const globalVerdict = deps.resolveGlobalVerdict(item);
    const invalidAvoidGuard = planValidation === 'invalid' && status === 'Avoid';
    const finalDisplayState = deps.globalVerdictLabel(globalVerdict.final_verdict);
    const falseDeadGuard = aliveDevelopingCandidate
      && ['needs_adjustment','pending_validation','invalid'].includes(planValidation)
      && ['developing','watch','avoid'].includes(String(baseView.displayStage || '').toLowerCase());
    const finalDisplayBucket = deps.getBucket(globalVerdict.final_verdict);
    const remapReason = !invalidAvoidGuard && status === 'Avoid' && ['watch','monitor'].includes(globalVerdict.final_verdict)
      ? 'weak but still technically alive'
      : '';
    const guardedDisplayState = finalDisplayState;

    addStep('base verdict', deps.normalizeGlobalVerdictKey(globalVerdict.base_verdict || status));
    if(falseDeadGuard) addStep('alive setup guard', 'blocked false Dead/filtered classification');
    addStep('final display state', guardedDisplayState);
    if(remapReason) addStep('remap reason', remapReason);
    addStep('resulting bucket', finalDisplayBucket);

    const legacyStatus = deps.normalizeAnalysisVerdict(baseView.displayStage || '');
    if(legacyStatus && legacyStatus !== status){
      warnings.push(`WARNING: status mismatch resolved. legacy=${legacyStatus}, resolved=${status}`);
    }
    if(!invalidAvoidGuard && status === 'Avoid' && ['watch','monitor'].includes(globalVerdict.final_verdict)){
      warnings.push(`INFO: raw Avoid softened to ${finalDisplayState} because the setup is still technically alive`);
    }

    return {
      status,
      bucket:finalDisplayBucket,
      reason_codes:reasonCodes,
      score:setupScore,
      rr_value:rrValue,
      rr_reliability:rrReliability,
      rr_label:rrLabel,
      trace,
      warnings,
      derivedStates,
      rrCategory,
      structureQuality,
      isStructureValid,
      hasPlanAdjustmentBlock,
      setupState:finalSetupState,
      rawResolverVerdict:status,
      finalDisplayState:guardedDisplayState,
      remapReason
    };
  }

  function resolveScannerState(record, options = {}, deps = {}){
    const resolved = resolveScannerStateWithTrace(record, options, deps);
    return {
      status:resolved.status,
      bucket:resolved.bucket,
      reason_codes:resolved.reason_codes
    };
  }

  function renderDebugKeyValueGrid(rows, deps = {}){
    const safeRows = Array.isArray(rows) ? rows.filter(row => row && row.label) : [];
    if(!safeRows.length) return '<div class="tiny">No debug data.</div>';
    return `<div class="watchlist-debug-grid tiny">${safeRows.map(row => `<div><strong>${deps.escapeHtml(String(row.label))}</strong><div>${deps.escapeHtml(String(row.value ?? 'n/a'))}</div></div>`).join('')}</div>`;
  }

  function renderDebugSectionMarkup(title, rows, deps = {}){
    return `<div class="watchlist-debug-block tiny"><strong>${deps.escapeHtml(String(title || 'Debug'))}</strong>${renderDebugKeyValueGrid(rows, deps)}</div>`;
  }

  function renderAdvancedDebugMarkup(rows, title = 'Advanced Debug (Internal)', deps = {}){
    const safeRows = Array.isArray(rows) ? rows.filter(row => row && row.label) : [];
    if(!safeRows.length) return '';
    return `<details class="compact-details"><summary>${deps.escapeHtml(String(title))}</summary>${renderDebugKeyValueGrid(safeRows, deps)}</details>`;
  }

  function renderScannerDecisionTraceContent(view, deps = {}){
    const resolution = view && view.scannerResolution ? view.scannerResolution : null;
    if(!resolution) return '<div class="tiny">No trace available.</div>';
    const lines = [];
    (resolution.trace || []).forEach(line => lines.push(String(line)));
    if(Array.isArray(resolution.reason_codes) && resolution.reason_codes.length){
      lines.push(`reason codes: ${resolution.reason_codes.join(', ')}`);
    }
    if(Array.isArray(resolution.warnings) && resolution.warnings.length){
      resolution.warnings.forEach(line => lines.push(String(line)));
    }
    const item = view && view.item ? view.item : {};
    const globalVerdict = deps.resolveGlobalVerdict(item);
    const nextAction = deps.getActions(globalVerdict.final_verdict || '');
    const baseSection = renderDebugSectionMarkup('Base Assessment', [
      {label:'Base Verdict', value:globalVerdict.base_verdict || '(none)'},
      {label:'Setup Score', value:Number.isFinite(globalVerdict.setup_score) ? `${globalVerdict.setup_score}/10` : '(none)'},
      {label:'Structure', value:globalVerdict.structure_state || '(none)'},
      {label:'Bounce', value:globalVerdict.bounce_state || '(none)'},
      {label:'Market', value:globalVerdict.market_regime || '(none)'},
      {label:'Volume', value:(view && view.setupStates && view.setupStates.volumeState) || resolution.volume_state || '(none)'}
    ], deps);
    const finalSection = renderDebugSectionMarkup('Final Decision', [
      {label:'Final Verdict', value:globalVerdict.final_verdict || '(none)'},
      {label:'Tone', value:globalVerdict.tone || '(none)'},
      {label:'Bucket', value:globalVerdict.bucket || '(none)'},
      {label:'Badge', value:(globalVerdict.badge && globalVerdict.badge.text) || '(none)'},
      {label:'Downgrade Applied', value:globalVerdict.downgrade_applied ? 'true' : 'false'},
      {label:'Downgrade Reason', value:globalVerdict.downgrade_reason || '(none)'},
      {label:'Entry Gate Pass', value:globalVerdict.entry_gate_pass ? 'true' : 'false'},
      {label:'Near Entry Gate Pass', value:globalVerdict.near_entry_gate_pass ? 'true' : 'false'}
    ], deps);
    const executionSection = renderDebugSectionMarkup('Execution State', [
      {label:'Lifecycle State', value:globalVerdict.lifecycle || '(none)'},
      {label:'Action State', value:nextAction.label || '(none)'},
      {label:'Plan Status', value:view && view.planUiState && view.planUiState.label || 'Plan blocked'},
      {label:'Plan Blocked', value:globalVerdict.allow_plan ? 'false' : 'true'},
      {label:'RR Confidence', value:resolution.rr_label || '(none)'},
      {label:'Capital Fit', value:(view && view.planUiState && view.planUiState.capitalFitLabel) || '(none)'},
      {label:'Next Possible', value:nextAction.detail || nextAction.label || '(none)'}
    ], deps);
    const advancedSection = `<details class="compact-details"><summary>Advanced Debug (Internal)</summary><div class="mutebox scrollbox">${deps.escapeHtml(lines.join('\n') || 'No trace available.')}</div></details>`;
    const gateSection = renderAdvancedDebugMarkup([
      {label:'Entry Gate Reasons', value:(globalVerdict.entry_gate_reasons || []).join(' | ') || '(none)'},
      {label:'Near Entry Gate Reasons', value:(globalVerdict.near_entry_gate_reasons || []).join(' | ') || '(none)'},
      {label:'Entry Gate Checks', value:JSON.stringify(globalVerdict.entry_gate_checks || {}) || '(none)'}
    ], 'Promotion Gates', deps);
    return `${finalSection}${baseSection}${executionSection}${gateSection}${advancedSection}`;
  }

  function renderScannerDetailsContent(view, deps = {}){
    const item = view.item;
    const resolution = view.scannerResolution || {};
    const statusChip = deps.primaryShortlistStatusChip(view);
    const companyLine = [item.meta.companyName || '', item.meta.exchange || ''].filter(Boolean).join(' | ');
    const modifiersMarkup = deps.emojiModifierMarkup(statusChip);
    const detailMeta = [
      companyLine,
      Number.isFinite(item.marketData.price) ? `Price ${deps.fmtPrice(Number(item.marketData.price))}` : '',
      Number.isFinite(item.marketData.ma20) ? `20 ${deps.fmtPrice(Number(item.marketData.ma20))}` : '',
      Number.isFinite(item.marketData.ma50) ? `50 ${deps.fmtPrice(Number(item.marketData.ma50))}` : '',
      Number.isFinite(item.marketData.ma200) ? `200 ${deps.fmtPrice(Number(item.marketData.ma200))}` : '',
      Number.isFinite(item.marketData.rsi) ? `RSI ${deps.fmtPrice(Number(item.marketData.rsi))}` : '',
      item.setup.marketCaution ? 'Weak market' : '',
      view.planUiState && view.planUiState.label ? `Plan ${view.planUiState.label}` : '',
      Number.isFinite(resolution.rr_value) ? `RR ${Number(resolution.rr_value).toFixed(1)} (${resolution.rr_label || 'n/a'})` : ''
    ].filter(Boolean).join(' | ');
    return `<div class="tiny">${deps.escapeHtml(detailMeta || 'No extra detail yet.')}</div>${modifiersMarkup ? `<div class="inline-status" style="margin-top:8px">${modifiersMarkup}</div>` : ''}`;
  }

  function renderScannerVisualDebugContent(view, deps = {}){
    const item = view && view.item ? view.item : {};
    const globalVerdict = deps.resolveGlobalVerdict(item);
    const statusChip = deps.primaryShortlistStatusChip(view || {});
    const structureQuality = String(view && view.setupStates && view.setupStates.structureQuality || '').toLowerCase();
    const bounceState = String(view && view.setupStates && view.setupStates.bounceState || '').toLowerCase();
    const nextAction = deps.getActions(globalVerdict.final_verdict || '');
    const clickTrace = deps.scannerCardClickTraceForTicker(item.ticker);
    const clickTraceHistory = deps.scannerCardClickTraceHistoryForTicker(item.ticker);
    const reviewAnalysisState = deps.reviewAnalysisUiStateForRecord ? deps.reviewAnalysisUiStateForRecord(item) : '';
    const resolution = view && view.scannerResolution ? view.scannerResolution : {};
    const baseSection = renderDebugSectionMarkup('Base Assessment', [
      {label:'Base Verdict', value:globalVerdict.base_verdict || '(none)'},
      {label:'Setup Score', value:Number.isFinite(globalVerdict.setup_score) ? `${globalVerdict.setup_score}/10` : '(none)'},
      {label:'Structure', value:globalVerdict.structure_state || structureQuality || '(none)'},
      {label:'Bounce', value:globalVerdict.bounce_state || bounceState || '(none)'},
      {label:'Market', value:globalVerdict.market_regime || '(none)'},
      {label:'Volume', value:(view && view.setupStates && view.setupStates.volumeState) || resolution.volume_state || '(none)'}
    ], deps);
    const finalSection = renderDebugSectionMarkup('Final Decision', [
      {label:'Final Verdict', value:globalVerdict.final_verdict || '(none)'},
      {label:'Tone', value:globalVerdict.tone || '(none)'},
      {label:'Bucket', value:globalVerdict.bucket || '(none)'},
      {label:'Badge', value:(globalVerdict.badge && globalVerdict.badge.text) || statusChip.label || '(none)'},
      {label:'Downgrade Applied', value:globalVerdict.downgrade_applied ? 'true' : 'false'},
      {label:'Downgrade Reason', value:globalVerdict.downgrade_reason || '(none)'},
      {label:'Entry Gate Pass', value:globalVerdict.entry_gate_pass ? 'true' : 'false'},
      {label:'Near Entry Gate Pass', value:globalVerdict.near_entry_gate_pass ? 'true' : 'false'}
    ], deps);
    const executionSection = renderDebugSectionMarkup('Execution State', [
      {label:'Lifecycle State', value:globalVerdict.lifecycle || '(none)'},
      {label:'Action State', value:nextAction.label || '(none)'},
      {label:'Plan Status', value:view && view.planUiState && view.planUiState.label || 'Plan blocked'},
      {label:'Plan Blocked', value:globalVerdict.allow_plan ? 'false' : 'true'},
      {label:'RR Confidence', value:resolution.rr_label || '(none)'},
      {label:'Capital Fit', value:(view && view.planUiState && view.planUiState.capitalFitLabel) || '(none)'},
      {label:'Next Possible', value:nextAction.detail || nextAction.label || '(none)'}
    ], deps);
    const swipeInfo = deps.getSwipeFeedback(item.ticker);
    const swipeSummary = swipeInfo
      ? (swipeInfo.removed
        ? 'Removed by swipe'
        : `${swipeInfo.reason || 'Swipe not far enough'}${Number.isFinite(swipeInfo.distance) && Number.isFinite(swipeInfo.threshold) ? ` (${swipeInfo.distance}/${swipeInfo.threshold}px)` : ''}`)
      : '(none)';
    const swipeFeedbackRow = {label:'Swipe Feedback', value:swipeSummary};
    const interactionSection = renderDebugSectionMarkup('Interaction', [
      {label:'Swipe Feedback', value:swipeSummary},
      {label:'Review Open Trace', value:clickTrace ? `${clickTrace.stage}${clickTrace.detail ? ` | ${clickTrace.detail}` : ''} | ${clickTrace.at}` : '(none)'},
      {label:'Review Open Trace History', value:clickTraceHistory.length ? clickTraceHistory.map(entry => `${entry.stage}${entry.detail ? ` | ${entry.detail}` : ''} | ${entry.at}`).join(' || ') : '(none)'},
      {label:'Review Loading State', value:reviewAnalysisState || '(none)'},
      {label:'Loading Ticker', value:deps.uiState && deps.uiState.loadingTicker ? deps.uiState.loadingTicker : '(none)'},
      {label:'Active Review Ticker', value:deps.uiState && deps.uiState.activeReviewTicker ? deps.uiState.activeReviewTicker : '(none)'}
    ], deps);
    const advancedSection = renderAdvancedDebugMarkup([
      swipeFeedbackRow,
      {label:'Entry Gate Reasons', value:(globalVerdict.entry_gate_reasons || []).join(' | ') || '(none)'},
      {label:'Near Entry Gate Reasons', value:(globalVerdict.near_entry_gate_reasons || []).join(' | ') || '(none)'},
      {label:'Entry Gate Checks', value:JSON.stringify(globalVerdict.entry_gate_checks || {}) || '(none)'},
      {label:'Base Status Label', value:String(statusChip.primaryState || '(none)')},
      {label:'Base Structure Label', value:structureQuality || '(none)'},
      {label:'Base Bounce Label', value:bounceState || '(none)'},
      {label:'Resolver Reason', value:globalVerdict.reason || '(none)'},
      {label:'Card Click Trace', value:clickTrace ? `${clickTrace.stage}${clickTrace.detail ? ` | ${clickTrace.detail}` : ''} | ${clickTrace.at}` : '(none)'}
    ], 'Advanced Debug (Internal)', deps);
    return `${finalSection}${baseSection}${executionSection}${interactionSection}${advancedSection}`;
  }

  global.ScannerDebug = {
    resolveScannerStateWithTrace,
    resolveScannerState,
    renderScannerDecisionTraceContent,
    renderScannerDetailsContent,
    renderDebugKeyValueGrid,
    renderDebugSectionMarkup,
    renderAdvancedDebugMarkup,
    renderScannerVisualDebugContent
  };
})(window);
