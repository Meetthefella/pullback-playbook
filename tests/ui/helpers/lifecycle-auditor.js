const path = require('path');
const {extractAppTickerState, normalizeNumber} = require('./app-state');
const {runReplayForSnapshot} = require('./replay-runner');

function normalizeText(value){
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeVerdict(value){
  const safe = normalizeText(value).toLowerCase().replace(/\s+/g, '_');
  if(['watch', 'near_entry', 'entry', 'avoid'].includes(safe)) return safe;
  return safe;
}

function normalizeActionState(value){
  const safe = normalizeText(value).toLowerCase().replace(/\s+/g, '_');
  if(!safe) return '';
  if(/entry_ready|ready_to_act|execute_only_if|execute/.test(safe)) return 'entry_ready';
  if(/near_entry|wait_for_confirmation|waiting_for_confirmation|developing|confirmation/.test(safe)) return 'wait_for_confirmation';
  if(/watch|monitor/.test(safe)) return 'monitor';
  if(/avoid|rebuild|dead|inactive/.test(safe)) return 'avoid';
  return safe;
}

function sanitizeAuthorityValue(value){
  if(value == null) return '';
  if(typeof value === 'string') return normalizeText(value);
  if(typeof value === 'number' || typeof value === 'boolean') return String(value);
  return normalizeText(JSON.stringify(value));
}

function authorityValueAt(source, field){
  const item = source && typeof source === 'object' ? source : {};
  if(field === 'canonicalVerdict'){
    return normalizeVerdict(item.canonicalVerdict || item.finalVerdict || item.final_verdict);
  }
  if(field === 'visualBucket'){
    return normalizeVerdict(item.visualBucket || item.sourceOfTruthVisualBucket || item.presentationBucket);
  }
  if(field === 'actionState'){
    return normalizeActionState(item.actionState || item.actionLabel || item.actionStateKey || item.nextAction);
  }
  if(field === 'tradePlan'){
    return normalizeText(item.tradePlanStatus || item.planStatus || item.displayedPlan && item.displayedPlan.status).toLowerCase();
  }
  return '';
}

function buildLifecycleEvidence(appState){
  const diaryEntries = appState && appState.diary && Array.isArray(appState.diary.entries)
    ? appState.diary.entries
    : [];
  const latestEntry = diaryEntries.length ? diaryEntries[diaryEntries.length - 1] : null;
  const latestHistory = appState && appState.authority && appState.authority.history && typeof appState.authority.history === 'object'
    ? appState.authority.history
    : null;
  const paperTradeContext = appState && appState.paperTrade && appState.paperTrade.context && typeof appState.paperTrade.context === 'object'
    ? appState.paperTrade.context
    : null;
  const paperTradeButton = appState && appState.paperTrade && appState.paperTrade.button && typeof appState.paperTrade.button === 'object'
    ? appState.paperTrade.button
    : {};
  const gatewayModel = appState && appState.paperTrade && appState.paperTrade.gateway && typeof appState.paperTrade.gateway === 'object'
    ? appState.paperTrade.gateway
    : {};
  const uiState = appState && appState.paperTrade && appState.paperTrade.uiState && typeof appState.paperTrade.uiState === 'object'
    ? appState.paperTrade.uiState
    : {};
  const buttonText = normalizeText(paperTradeButton.statusText || paperTradeButton.text || paperTradeButton.previewText || '').toLowerCase();
  const paperTradeLifecycleState = normalizeText(
    latestHistory && latestHistory.lifecycleStatus
    || latestEntry && (latestEntry.status || latestEntry.executionMeta && latestEntry.executionMeta.status)
    || (/submitted/.test(buttonText) ? 'submitted' : '')
  ).toLowerCase();
  return {
    currentTradePlanState:normalizeText(
      appState && appState.review && appState.review.stateHealth && appState.review.stateHealth.planStatus
      || appState && appState.paperTrade && appState.paperTrade.context && appState.paperTrade.context.displayedPlan && appState.paperTrade.context.displayedPlan.status
      || ''
    ).toLowerCase(),
    paperTradeGatewayState:normalizeText(gatewayModel.state || '').toLowerCase(),
    paperTradeEligibilityState:appState && appState.paperTrade && appState.paperTrade.context && appState.paperTrade.context.eligibility
      ? {
        eligible:appState.paperTrade.context.eligibility.eligible === true,
        reasons:Array.isArray(appState.paperTrade.context.eligibility.reasons)
          ? appState.paperTrade.context.eligibility.reasons.map(reason => normalizeText(reason)).filter(Boolean)
          : []
      }
      : {eligible:false, reasons:[]},
    paperTradeLifecycleState,
    paperTradeEnabledUiState:paperTradeButton.enabled === true,
    paperTradeUiState:normalizeText(uiState.state || '').toLowerCase(),
    paperTradeUiReason:normalizeText(paperTradeButton.disabledReason || paperTradeButton.statusText || uiState.message || ''),
    historyEventState:{
      hasSubmittedEvent:paperTradeLifecycleState === 'submitted',
      lifecycleStatus:normalizeText(latestHistory && latestHistory.lifecycleStatus).toLowerCase(),
      sourceType:normalizeText(latestHistory && latestHistory.sourceType).toLowerCase(),
      sourceRef:normalizeText(latestHistory && latestHistory.sourceRef),
      eventRecorded:latestHistory && latestHistory.eventRecorded === true,
      submittedAt:normalizeText(latestHistory && latestHistory.submittedAt)
    }
  };
}

function buildAuthoritySummary(appState, replayResult){
  const authority = appState.authority || {};
  const paperTradeApplicable = !!(
    appState
    && appState.paperTrade
    && (
      appState.paperTrade.button && appState.paperTrade.button.enabled === true
      || appState.paperTrade.context && appState.paperTrade.context.eligibility && appState.paperTrade.context.eligibility.eligible === true
      || appState.paperTrade.button && normalizeText(appState.paperTrade.button.previewText || '').length
      || appState.paperTrade.button && /submitted/i.test(normalizeText(appState.paperTrade.button.statusText || ''))
    )
  );
  const sources = {
    scanner:authority.scanner,
    resolver:authority.resolver,
    review:authority.review,
    sharedPresentation:authority.sharedPresentation,
    trackPresentation:authority.trackPresentation,
    paperTrade:paperTradeApplicable ? authority.paperTrade : null,
    watchlist:authority.watchlist,
    history:authority.history,
    replay:replayResult ? {
      canonicalVerdict:replayResult.reviewCanonicalVerdict,
      visualBucket:replayResult.reviewVisualBucket,
      actionState:replayResult.reviewActionLabel || replayResult.reviewNextAction || '',
      tradePlan:replayResult.planStatus || ''
    } : null
  };
  const fields = ['canonicalVerdict', 'visualBucket', 'actionState', 'tradePlan'];
  const duplicates = fields.map(field => {
    const entries = Object.entries(sources)
      .map(([name, source]) => ({name, value:authorityValueAt(source, field)}))
      .filter(entry => entry.value);
    const grouped = entries.reduce((map, entry) => {
      map[entry.value] = map[entry.value] || [];
      map[entry.value].push(entry.name);
      return map;
    }, {});
    const uniqueValues = Object.keys(grouped);
    return {
      field,
      entries,
      uniqueValues,
      conflicting:true,
      groups:grouped
    };
  }).filter(entry => entry.uniqueValues.length > 1);
  return {
    sources,
    duplicates,
    lifecycleEvidence:buildLifecycleEvidence(appState)
  };
}

function buildStaleStateFindings(appState){
  const canonicalVerdict = normalizeVerdict(appState.normalized && appState.normalized.reviewCanonicalVerdict);
  const reviewBadge = normalizeVerdict(appState.visibleCopy && appState.visibleCopy.review && appState.visibleCopy.review.badge);
  const trackBadge = normalizeVerdict(appState.visibleCopy && appState.visibleCopy.track && appState.visibleCopy.track.badge);
  const findings = [];
  if(canonicalVerdict && reviewBadge && canonicalVerdict !== reviewBadge){
    findings.push({
      type:'stale_review_presentation',
      path:'visibleCopy.review.badge',
      expected:canonicalVerdict,
      actual:reviewBadge
    });
  }
  if(canonicalVerdict && trackBadge && canonicalVerdict !== trackBadge){
    findings.push({
      type:'stale_track_presentation',
      path:'visibleCopy.track.badge',
      expected:canonicalVerdict,
      actual:trackBadge
    });
  }
  const candidates = Array.isArray(appState.staleFieldCandidates) ? appState.staleFieldCandidates : [];
  candidates.forEach(entry => {
    const key = String(entry && entry.key || '');
    const value = sanitizeAuthorityValue(entry && entry.value);
    if(!key || !value) return;
    if(/verdict/i.test(key) && canonicalVerdict && normalizeVerdict(value) && normalizeVerdict(value) !== canonicalVerdict){
      findings.push({
        type:'stale_named_field',
        path:entry.path,
        expected:canonicalVerdict,
        actual:value
      });
    }
  });
  return findings;
}

function buildCopyConsistency(appState){
  const visibleCopy = appState.visibleCopy || {};
  const scan = visibleCopy.scan || {};
  const review = visibleCopy.review || {};
  const track = visibleCopy.track || {};
  const diaryCard = appState.diary && Array.isArray(appState.diary.visibleCards) && appState.diary.visibleCards.length
    ? normalizeText(appState.diary.visibleCards[0])
    : '';
  const mismatches = [];
  const reviewVerdict = normalizeVerdict(review.canonicalVerdict);
  if(reviewVerdict && review.badge && normalizeVerdict(review.badge) !== reviewVerdict){
    mismatches.push({field:'badgeLabel', surface:'review', expected:reviewVerdict, actual:review.badge});
  }
  if(reviewVerdict && track.badge && normalizeVerdict(track.badge) !== reviewVerdict){
    mismatches.push({field:'badgeLabel', surface:'track', expected:reviewVerdict, actual:track.badge});
  }
  if(reviewVerdict === 'entry' && /isn't ready|needs confirmation/i.test(review.tradeStatus || '')){
    mismatches.push({field:'reviewTradeStatus', surface:'review', expected:'entry-ready copy', actual:review.tradeStatus});
  }
  if(reviewVerdict === 'entry' && /isn't ready|needs confirmation/i.test(track.cardText || '')){
    mismatches.push({field:'trackCopy', surface:'track', expected:'entry-ready copy', actual:track.cardText});
  }
  if(diaryCard && reviewVerdict && !new RegExp(reviewVerdict.replace('_', '\\s+'), 'i').test(diaryCard) && /Entry|Near Entry|Watch|Avoid/i.test(diaryCard)){
    mismatches.push({field:'diaryVerdictCopy', surface:'diary', expected:reviewVerdict, actual:diaryCard});
  }
  if(scan.badge && review.badge && normalizeVerdict(scan.badge) && normalizeVerdict(scan.badge) !== reviewVerdict){
    mismatches.push({field:'scanToReviewBadge', surface:'scan', expected:reviewVerdict, actual:scan.badge});
  }
  return mismatches;
}

function buildButtonStateSnapshot(appState){
  const review = appState.review && appState.review.visible ? appState.review.visible : {};
  const paperTrade = appState.paperTrade && appState.paperTrade.button ? appState.paperTrade.button : {};
  return {
    paperTradeEnabled:paperTrade.enabled === true,
    paperTradeText:normalizeText(paperTrade.text),
    paperTradeDisabledReason:normalizeText(paperTrade.disabledReason),
    reviewEntryVisible:review.entryVisible === true,
    reviewCapitalVisible:review.capitalVisible === true,
    reviewRrVisible:review.rrVisible === true
  };
}

function diffObjects(before, after, prefix = ''){
  const left = before && typeof before === 'object' ? before : {};
  const right = after && typeof after === 'object' ? after : {};
  const keys = Array.from(new Set([...Object.keys(left), ...Object.keys(right)])).sort();
  const diffs = [];
  keys.forEach(key => {
    const nextPath = prefix ? `${prefix}.${key}` : key;
    const leftValue = left[key];
    const rightValue = right[key];
    if(Array.isArray(leftValue) || Array.isArray(rightValue)){
      const leftJson = JSON.stringify(leftValue ?? null);
      const rightJson = JSON.stringify(rightValue ?? null);
      if(leftJson !== rightJson){
        diffs.push({path:nextPath, before:leftValue ?? null, after:rightValue ?? null});
      }
      return;
    }
    if(leftValue && typeof leftValue === 'object' && rightValue && typeof rightValue === 'object'){
      diffs.push(...diffObjects(leftValue, rightValue, nextPath));
      return;
    }
    if(JSON.stringify(leftValue ?? null) !== JSON.stringify(rightValue ?? null)){
      diffs.push({path:nextPath, before:leftValue ?? null, after:rightValue ?? null});
    }
  });
  return diffs;
}

async function captureLifecycleSnapshot(page, ticker, stage, consoleEvents = [], networkEvents = []){
  const appState = await extractAppTickerState(page, ticker, consoleEvents);
  const replay = appState.snapshot ? runReplayForSnapshot(appState.snapshot) : null;
  const timestamp = new Date().toISOString();
  return {
    ticker,
    stage,
    timestamp,
    appState,
    replay:{
      snapshot:appState.snapshot || null,
      result:replay ? replay.result : null,
      reportText:replay ? replay.reportText : ''
    },
    buttons:buildButtonStateSnapshot(appState),
    copyConsistency:buildCopyConsistency(appState),
    staleState:buildStaleStateFindings(appState),
    authority:buildAuthoritySummary(appState, replay && replay.result),
    network:networkEvents.slice(),
    console:{
      warnings:(appState.console && appState.console.warnings) || [],
      errors:(appState.console && appState.console.errors) || []
    }
  };
}

function buildTransitionReport(previousSnapshot, currentSnapshot){
  const previous = previousSnapshot || {};
  const current = currentSnapshot || {};
  const prevState = previous.appState || {};
  const nextState = current.appState || {};
  const comparison = {
    canonicalVerdict:{
      previous:normalizeVerdict(prevState.normalized && prevState.normalized.reviewCanonicalVerdict),
      current:normalizeVerdict(nextState.normalized && nextState.normalized.reviewCanonicalVerdict)
    },
    visualBucket:{
      previous:normalizeText(prevState.review && prevState.review.stateHealth && prevState.review.stateHealth.visualBucket),
      current:normalizeText(nextState.review && nextState.review.stateHealth && nextState.review.stateHealth.visualBucket)
    },
    actionState:{
      previous:normalizeText(prevState.review && prevState.review.visible && prevState.review.visible.actionLabel),
      current:normalizeText(nextState.review && nextState.review.visible && nextState.review.visible.actionLabel)
    },
    tradePlan:{
      previous:{
        entry:normalizeText(prevState.review && prevState.review.visible && prevState.review.visible.entry),
        stop:normalizeText(prevState.review && prevState.review.visible && prevState.review.visible.stop),
        target:normalizeText(prevState.review && prevState.review.visible && prevState.review.visible.target),
        rr:normalizeText(prevState.review && prevState.review.visible && prevState.review.visible.rr)
      },
      current:{
        entry:normalizeText(nextState.review && nextState.review.visible && nextState.review.visible.entry),
        stop:normalizeText(nextState.review && nextState.review.visible && nextState.review.visible.stop),
        target:normalizeText(nextState.review && nextState.review.visible && nextState.review.visible.target),
        rr:normalizeText(nextState.review && nextState.review.visible && nextState.review.visible.rr)
      }
    }
  };
  const copyDiff = diffObjects(previousSnapshot && previousSnapshot.appState && previousSnapshot.appState.visibleCopy, currentSnapshot && currentSnapshot.appState && currentSnapshot.appState.visibleCopy);
  const authorityDiff = diffObjects(previousSnapshot && previousSnapshot.authority && previousSnapshot.authority.sources, currentSnapshot && currentSnapshot.authority && currentSnapshot.authority.sources);
  const firstDivergence = copyDiff[0] || authorityDiff[0] || null;
  return {
    transition:`${previous.stage || 'start'} -> ${current.stage || 'current'}`,
    previousStage:previous.stage || '',
    currentStage:current.stage || '',
    comparison,
    copyDiff,
    authorityDiff,
    firstDivergence
  };
}

function buildForensicFindings(journeySnapshots){
  const failures = [];
  for(let index = 1; index < journeySnapshots.length; index += 1){
    const previous = journeySnapshots[index - 1];
    const current = journeySnapshots[index];
    const transition = buildTransitionReport(previous, current);
    const issues = [
      ...(current.copyConsistency || []),
      ...(current.staleState || []),
      ...((current.authority && current.authority.duplicates) || []).map(entry => ({
        field:entry.field,
        surface:'authority',
        actual:entry.groups
      }))
    ];
    if(issues.length){
      failures.push({
        ticker:current.ticker,
        transition:transition.transition,
        previousState:transition.comparison,
        currentState:{
          canonicalVerdict:current.appState && current.appState.review && current.appState.review.stateHealth && current.appState.review.stateHealth.canonicalVerdict,
          replayVerdict:current.replay && current.replay.result && current.replay.result.reviewCanonicalVerdict,
          trackVerdict:current.appState && current.appState.track && current.appState.track.simplifiedState && current.appState.track.simplifiedState.canonicalVerdict,
          diaryVerdict:(current.appState && current.appState.diary && current.appState.diary.entries && current.appState.diary.entries[0] && current.appState.diary.entries[0].verdict) || '',
          tradePlanStatus:current.appState && current.appState.review && current.appState.review.stateHealth && current.appState.review.stateHealth.planStatus,
          paperTradeEnabled:current.buttons && current.buttons.paperTradeEnabled,
          paperTradeLifecycleState:current.authority && current.authority.lifecycleEvidence && current.authority.lifecycleEvidence.paperTradeLifecycleState,
          historyEventState:current.authority && current.authority.lifecycleEvidence && current.authority.lifecycleEvidence.historyEventState
        },
        issues,
        firstPointOfDivergence:transition.firstDivergence,
        probableRootCause:transition.firstDivergence ? transition.firstDivergence.path : '',
        suggestedFix:transition.firstDivergence ? `Inspect the first mutation at ${transition.firstDivergence.path}.` : ''
      });
    }
  }
  return failures;
}

module.exports = {
  buildAuthoritySummary,
  buildButtonStateSnapshot,
  buildCopyConsistency,
  buildForensicFindings,
  buildTransitionReport,
  captureLifecycleSnapshot,
  diffObjects,
  normalizeText,
  normalizeVerdict
};
