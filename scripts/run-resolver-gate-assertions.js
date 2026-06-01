const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const sandbox = {
  window: {},
  console
};
sandbox.globalThis = sandbox.window;

function runBrowserModule(relativePath){
  const filePath = path.join(root, relativePath);
  const source = fs.readFileSync(filePath, 'utf8');
  vm.runInNewContext(source, sandbox, {filename:filePath});
}

runBrowserModule('js/bounce-priceability.js');
runBrowserModule('js/plan-math.js');
runBrowserModule('js/tradeability.js');
runBrowserModule('js/resolver-core.js');
runBrowserModule('js/resolver-presentation.js');
runBrowserModule('js/domain/simplified-plan-state.js');
runBrowserModule('js/presentation/simplified-presentation-model.js');
runBrowserModule('js/domain/simplified-trade-state.js');
runBrowserModule('js/scanner-view.js');
runBrowserModule('js/scanner-results-support.js');

const resolverCore = sandbox.window.ResolverCore;
const resolverPresentation = sandbox.window.ResolverPresentation;
if(!resolverCore || typeof resolverCore.runTradeReadinessGateAssertions !== 'function'){
  throw new Error('Resolver gate assertion harness is unavailable.');
}

const results = resolverCore.runTradeReadinessGateAssertions();
const failures = results.filter(result => !result.pass);

if(failures.length){
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

function runScanPresentationAssertions(){
  const scannerView = sandbox.window.ScannerView;
  const scannerResultsSupport = sandbox.window.ScannerResultsSupport;
  if(!scannerView || typeof scannerView.scanPresentationForView !== 'function'){
    throw new Error('Scanner presentation helper is unavailable.');
  }
  if(!scannerResultsSupport || typeof scannerResultsSupport.scannerResultSections !== 'function'){
    throw new Error('Scanner result section helper is unavailable.');
  }
  const deps = {
    normalizeGlobalVerdictKey(value){
      const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
      if(safe === 'nearentry') return 'near_entry';
      if(['entry','near_entry','watch','avoid'].includes(safe)) return safe;
      return safe || 'watch';
    },
    globalVerdictLabel(value){
      const safe = String(value || '').trim().toLowerCase();
      if(safe === 'entry') return 'Entry';
      if(safe === 'near_entry') return 'Near Entry';
      if(safe === 'avoid') return 'Avoid';
      return 'Watch';
    },
    getBucket(value){
      const safe = String(value || '').trim().toLowerCase();
      if(safe === 'entry') return 'entry';
      if(safe === 'near_entry') return 'near_entry';
      if(safe === 'avoid') return 'avoid';
      return 'monitor';
    },
    analysisDerivedStatesFromRecord(record){
      return record && record.derivedStates || {};
    }
  };
  const makeView = (ticker, simplifiedState, setupStates, extra = {}) => ({
    ticker,
    item:{ticker, derivedStates:setupStates},
    simplifiedState,
    setupStates,
    setupScore:extra.setupScore == null ? 6 : extra.setupScore,
    rrValue:extra.rrValue == null ? 0 : extra.rrValue,
    reasonCodes:extra.reasonCodes || []
  });
  const constructive = makeView('EW', {
    canonicalVerdict:'watch',
    visualBucket:'monitor',
    tone:'monitor',
    mainBlocker:'Needs confirmation before promotion.'
  }, {
    structureState:'strong',
    bounceState:'attempt',
    pullbackState:'near_50ma'
  }, {setupScore:8});
  constructive.scanPresentation = scannerView.scanPresentationForView(constructive, deps);
  if(constructive.scanPresentation.scanSection !== 'monitor_watch' || constructive.scanPresentation.tone !== 'monitor'){
    throw new Error('Constructive Watch with bounce attempt must remain in Monitor / Watch.');
  }

  const weakNoBounce = makeView('QSR', {
    canonicalVerdict:'watch',
    visualBucket:'monitor',
    tone:'monitor',
    mainBlocker:'Trend is weakening - no reliable stop level yet.'
  }, {
    structureState:'weak',
    bounceState:'none',
    pullbackState:'near_50ma',
    priceabilityState:'unpriceable'
  }, {setupScore:4});
  weakNoBounce.scanPresentation = scannerView.scanPresentationForView(weakNoBounce, deps);
  if(weakNoBounce.scanPresentation.scanSection !== 'monitor_diminishing' || weakNoBounce.scanPresentation.tone !== 'diminishing'){
    throw new Error('Weak/no-bounce Watch must render as Monitor / Diminishing, not Monitor / Watch.');
  }
  if(/needs confirmation before promotion/i.test(weakNoBounce.scanPresentation.summary || '')){
    throw new Error('Diminishing scan card must not use generic confirmation-promotion copy.');
  }

  const avoid = makeView('ABNB', {
    canonicalVerdict:'avoid',
    visualBucket:'avoid',
    tone:'avoid',
    mainBlocker:'Structure is broken.'
  }, {
    structureState:'broken',
    bounceState:'none',
    pullbackState:'none'
  }, {setupScore:1});
  avoid.scanPresentation = scannerView.scanPresentationForView(avoid, deps);
  if(avoid.scanPresentation.scanSection !== 'avoid' || avoid.scanPresentation.badgeLabel !== 'Avoid' || avoid.scanPresentation.tone !== 'avoid'){
    throw new Error('Avoid scan card must render as red Avoid in the bottom section.');
  }

  const lowPriorityWatch = makeView('AA', {
    canonicalVerdict:'watch',
    visualBucket:'monitor',
    tone:'monitor',
    mainBlocker:'Needs confirmation before promotion.'
  }, {
    structureState:'developing_loose',
    bounceState:'none',
    pullbackState:'near_20ma',
    priceabilityState:'unpriceable'
  }, {
    setupScore:2,
    rrValue:0.42,
    reasonCodes:['bounce_not_confirmed', 'score_below_watch_floor']
  });
  lowPriorityWatch.simplifiedState.debug = {
    resolvedState:{
      setup_score:2,
      planStateKey:'missing',
      tradeabilityLabel:'not_ready',
      near_entry_gate_checks:{
        below_50_without_reclaim:true,
        reclaim_signal_count:0,
        has_clear_invalidation_level:false,
        resolved_rr:0.42
      }
    }
  };
  lowPriorityWatch.scanPresentation = scannerView.scanPresentationForView(lowPriorityWatch, deps);
  if(lowPriorityWatch.scanPresentation.scanSection !== 'monitor_diminishing'){
    throw new Error('AA-style failed reclaim Watch must not be grouped with constructive Watch candidates.');
  }
  if(/needs confirmation before promotion/i.test(lowPriorityWatch.scanPresentation.summary || '')){
    throw new Error('AA-style failed reclaim Watch must replace generic promotion copy.');
  }
  if(lowPriorityWatch.scanPresentation.presentationBucket !== 'diminishing' || lowPriorityWatch.scanPresentation.tone !== 'diminishing'){
    throw new Error('AA-style failed reclaim Watch must render with diminishing, not yellow constructive Watch, tone.');
  }
  if(lowPriorityWatch.scanPresentation.failedReclaimEvidence !== true || lowPriorityWatch.scanPresentation.blockedByBelow50NoReclaim !== true){
    throw new Error('AA-style failed reclaim evidence must be reflected in scan presentation diagnostics.');
  }

  const zeroEvidenceWatch = makeView('ZERO', {
    canonicalVerdict:'watch',
    visualBucket:'monitor',
    tone:'monitor',
    mainBlocker:'Needs confirmation before promotion.'
  }, {
    structureState:'developing_loose',
    bounceState:'none',
    pullbackState:'near_20ma',
    priceabilityState:'unpriceable'
  }, {
    setupScore:9,
    rrValue:3,
    reasonCodes:['score_below_watch_floor']
  });
  zeroEvidenceWatch.simplifiedState.setupScore = 0;
  zeroEvidenceWatch.simplifiedState.debug = {
    resolvedState:{
      setup_score:9,
      planStateKey:'missing',
      tradeabilityLabel:'not_ready',
      resolvedRR:0,
      near_entry_gate_checks:{
        below_50_without_reclaim:true,
        reclaim_signal_count:0,
        has_clear_invalidation_level:false,
        resolved_rr:1
      },
      entry_gate_checks:{
        reclaim_signal_count:2,
        resolved_rr:2
      }
    }
  };
  zeroEvidenceWatch.scanPresentation = scannerView.scanPresentationForView(zeroEvidenceWatch, deps);
  if(zeroEvidenceWatch.scanPresentation.resolvedRR !== 0){
    throw new Error('Scan presentation must preserve resolved_rr: 0 instead of falling through to stale fallback RR.');
  }
  if(zeroEvidenceWatch.scanPresentation.reclaimSignalCount !== 0){
    throw new Error('Scan presentation must preserve explicit reclaim_signal_count: 0 instead of stale fallback counts.');
  }
  if(zeroEvidenceWatch.scanPresentation.failedReclaimEvidence !== true){
    throw new Error('setupScore: 0 and resolved_rr: 0 must still trigger failed-reclaim presentation evidence.');
  }

  const sections = scannerResultsSupport.scannerResultSections([
    avoid,
    weakNoBounce,
    constructive,
    lowPriorityWatch
  ], {
    rankedVisibleSectionForView(view){
      return view.scanPresentation.scanSection;
    },
    state:{marketStatus:'S&P above 50 MA'},
    escapeHtml(value){ return String(value || ''); }
  });
  const populatedKeys = sections.filter(section => section.items.length).map(section => section.key);
  const expectedOrder = ['monitor-watch','monitor-diminishing','avoid'];
  if(JSON.stringify(populatedKeys) !== JSON.stringify(expectedOrder)){
    throw new Error(`Scan sections must order constructive Watch, diminishing Watch, then Avoid. Got ${populatedKeys.join(', ')}`);
  }
}

runScanPresentationAssertions();

function extractFunctionSource(source, functionName){
  const start = source.indexOf(`function ${functionName}`);
  if(start < 0) throw new Error(`Unable to find ${functionName} in app.js.`);
  const paramsStart = source.indexOf('(', start);
  let paramDepth = 0;
  let paramsEnd = -1;
  for(let index = paramsStart; index < source.length; index += 1){
    const char = source[index];
    if(char === '(') paramDepth += 1;
    else if(char === ')'){
      paramDepth -= 1;
      if(paramDepth === 0){
        paramsEnd = index;
        break;
      }
    }
  }
  const bodyStart = source.indexOf('{', paramsEnd > -1 ? paramsEnd : start);
  let depth = 0;
  for(let index = bodyStart; index < source.length; index += 1){
    const char = source[index];
    if(char === '{') depth += 1;
    else if(char === '}'){
      depth -= 1;
      if(depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Unable to extract ${functionName} from app.js.`);
}

function selectReviewChartSourceIncludesTerminalBlockedChosen(source){
  return source.includes('const preferredTerminalBlocked = terminalBlockedCandidates[0] || null;')
    && source.includes('const chosen = (preferredTerminalBlocked || mergedCandidatesAllowed[0] || nonPendingMatchingCandidates[0] || matchingCandidates[0] || ranked[0] || null);')
    && source.includes("preferredTerminalBlocked && chosen === preferredTerminalBlocked")
    && source.includes("'terminal blocked trace'");
}

function extractRegistryAccessorSource(source){
  const start = source.indexOf('const SCANNER_PROJECTION_FIELD_REGISTRY');
  if(start < 0) throw new Error('Unable to find SCANNER_PROJECTION_FIELD_REGISTRY in app.js.');
  const helperSource = extractFunctionSource(source, 'scannerProjectionFieldRegistry');
  const helperStart = source.indexOf(helperSource, start);
  if(helperStart < 0) throw new Error('Unable to find scannerProjectionFieldRegistry after registry in app.js.');
  return source.slice(start, helperStart + helperSource.length);
}

function runReviewProjectionAssertions(){
  const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const projectionSandbox = {
    console:{
      ...console,
      warn(){}
    },
    normalizeGlobalVerdictKey(value){
      const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
      if(safe === 'near_entry' || safe === 'nearentry') return 'near_entry';
      if(['entry', 'watch', 'avoid'].includes(safe)) return safe;
      if(['dead', 'diminishing'].includes(safe)) return 'avoid';
      return safe || 'watch';
    },
    normalizeVisualBucketForPairing(value){
      const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
      if(['watch', 'monitor', 'near_entry', 'entry', 'avoid', 'diminishing', 'dead'].includes(safe)) return safe;
      if(safe === 'avoid_dead' || safe === 'terminal') return 'avoid';
      return safe;
    },
    normalizeTicker(value){
      return String(value || '').trim().toUpperCase();
    },
    numericOrNull(value){
      if(value === null || value === undefined) return null;
      if(typeof value === 'string' && value.trim() === '') return null;
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    },
    currentRrThreshold(){
      return 2;
    },
    sameVisibleCopy(a, b){
      return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
    },
    verdictPresentationLabelForKey(value){
      return String(value || '').trim();
    },
    checklistIds:['trendStrong','above50','above200','ma50gt200','near20','near50','stabilising','bounce','volume','entryDefined','stopDefined','targetDefined']
  };
  vm.createContext(projectionSandbox);
  [
    'isAllowedCanonicalVisualPair',
    'hasProjectionTerminalAvoidReason',
    'terminalAvoidEvidenceForReviewCopy',
    'reviewCopyEvidence',
    'sanitizeAliveWatchSemanticCopy',
    'buildSharedSetupNarrative',
    'provisionalPlanConfirmationCopy',
    'terminalAvoidCopyPattern',
    'sanitizeNonTerminalPlanCopy',
    'resolvePlanVisibility',
    'hasUnconfirmedPriceablePlanForReviewCopy',
    'normalizeUiCopy',
    'isDuplicatedStatusCopy',
    'nonPlanCalcNoteText',
    'buildReviewSemanticStatus',
    'reviewSetupQualitySummary',
    'clampReviewChecklistScore',
    'setupQualityLabelForScore',
    'resolverAlignedSetupScore',
    'scoreAndStatusFromChecks',
    'buildSummary',
    'resolvedReviewChecksForDisplay',
    'applyProjectionSnapshotToReviewBundle'
  ].forEach(functionName => {
    vm.runInContext(extractFunctionSource(appSource, functionName), projectionSandbox, {filename:`app.js#${functionName}`});
  });

  if(projectionSandbox.isAllowedCanonicalVisualPair('near_entry', 'monitor') !== true){
    throw new Error('near_entry + monitor must be an allowed Review projection pair.');
  }

  const safeProjection = projectionSandbox.applyProjectionSnapshotToReviewBundle({}, {
    ticker:'DINO',
    finalVerdict:'near_entry',
    canonicalVerdict:'near_entry',
    renderedVerdict:'near_entry',
    visualBucket:'monitor',
    sourceOfTruthVisualBucket:'monitor',
    renderedBucket:'monitor',
    terminalAvoidApplied:false,
    avoidTriggerSource:'',
    viability:'watchlist',
    actionGuidance:'Avoid - too weak or broken'
  });
  const safeVisual = safeProjection.bundle.visualState || {};
  const safeGlobal = safeProjection.bundle.globalVerdict || {};
  const safeResolved = safeProjection.bundle.resolvedContract || {};
  if(safeGlobal.final_verdict === 'avoid' || safeVisual.visualBucket === 'avoid'){
    throw new Error('Provisional near_entry + monitor projection must not coerce to avoid.');
  }
  if(safeVisual.visualBucket !== 'monitor' || safeGlobal.final_verdict !== 'near_entry'){
    throw new Error('Provisional near_entry + monitor projection did not preserve safe final/visual state.');
  }
  if(/avoid|too weak|broken/i.test(String(safeResolved.actionLabel || safeResolved.actionShortLabel || ''))){
    throw new Error('Provisional near_entry projection must not retain stale Avoid plan/action wording.');
  }

  const invalidButNonTerminal = projectionSandbox.applyProjectionSnapshotToReviewBundle({}, {
    ticker:'DINO',
    finalVerdict:'near_entry',
    canonicalVerdict:'near_entry',
    visualBucket:'diminishing',
    sourceOfTruthVisualBucket:'diminishing',
    terminalAvoidApplied:false,
    avoidTriggerSource:'',
    viability:'watchlist'
  });
  const fallbackVisual = invalidButNonTerminal.bundle.visualState || {};
  const fallbackGlobal = invalidButNonTerminal.bundle.globalVerdict || {};
  if(fallbackGlobal.final_verdict === 'avoid' || fallbackVisual.visualBucket === 'avoid'){
    throw new Error('Invalid non-terminal projection pair must fall back safely, not avoid.');
  }
  if(invalidButNonTerminal.coerced !== true || !invalidButNonTerminal.sanitizedProjectionSnapshot || invalidButNonTerminal.sanitizedProjectionSnapshot.visualBucket !== fallbackVisual.visualBucket || invalidButNonTerminal.sanitizedProjectionSnapshot.finalVerdict !== fallbackGlobal.final_verdict){
    throw new Error('Coerced Review projection must return a sanitized snapshot so stale Track projection state is not reused.');
  }

  const staleAvoidMonitor = projectionSandbox.applyProjectionSnapshotToReviewBundle({}, {
    ticker:'DINO',
    finalVerdict:'avoid',
    canonicalVerdict:'avoid',
    renderedVerdict:'avoid',
    visualBucket:'monitor',
    sourceOfTruthVisualBucket:'monitor',
    renderedBucket:'monitor',
    terminalAvoidApplied:false,
    avoidTriggerSource:'',
    structureState:'intact',
    lifecycleState:'active',
    viability:'watchlist',
    actionGuidance:'Avoid - too weak or broken',
    planStatusLabel:'Avoid - too weak or broken. Leave it alone.',
    hasProvisionalPriceablePlan:true
  });
  const staleAvoidVisual = staleAvoidMonitor.bundle.visualState || {};
  const staleAvoidGlobal = staleAvoidMonitor.bundle.globalVerdict || {};
  const staleAvoidResolved = staleAvoidMonitor.bundle.resolvedContract || {};
  if(staleAvoidGlobal.final_verdict !== 'watch' || staleAvoidVisual.finalVerdict !== 'watch' || staleAvoidVisual.renderedVerdict !== 'watch'){
    throw new Error('Stale non-terminal avoid + monitor projection must normalize final/rendered/canonical verdict to watch.');
  }
  if(staleAvoidVisual.visualBucket !== 'monitor'){
    throw new Error('Stale non-terminal avoid + monitor projection must preserve monitor visual bucket.');
  }
  if(/avoid|too weak|broken/i.test(String(staleAvoidResolved.actionLabel || staleAvoidResolved.actionShortLabel || ''))){
    throw new Error('Stale non-terminal avoid + monitor projection must not retain stale Avoid wording.');
  }
  if(/avoid|too weak|broken|leave it alone/i.test(String(staleAvoidResolved.planStatusLabel || ''))){
    throw new Error('Stale non-terminal avoid + monitor projection must sanitize stale Avoid plan status wording.');
  }

  const staleAvoidPlanCopy = projectionSandbox.resolvePlanVisibility({
    state:'watch',
    finalVerdict:'watch',
    visualBucket:'monitor',
    structure:'intact',
    bounce_state:'attempt',
    near_entry_gate_pass:true,
    terminal_avoid_applied:false,
    avoid_trigger_source:'',
    lifecycle:'active',
    hasProvisionalPriceablePlan:true,
    stalePlanStatus:'Avoid - too weak or broken. Leave it alone.'
  });
  if(/avoid|too weak|broken|leave it alone/i.test(String(staleAvoidPlanCopy.diagnosticsMessage || ''))){
    throw new Error('Non-terminal watch/monitor provisional plan copy must not display stale Avoid wording.');
  }
  if(!/provisional plan|confirmation/i.test(String(staleAvoidPlanCopy.diagnosticsMessage || ''))){
    throw new Error('Non-terminal provisional plan copy must use confirmation/provisional wording.');
  }
  const diminishingPlanCopy = projectionSandbox.resolvePlanVisibility({
    state:'diminishing',
    finalVerdict:'watch',
    visualBucket:'diminishing',
    structure:'weakening',
    bounce_state:'attempt',
    terminal_avoid_applied:false,
    avoid_trigger_source:'',
    lifecycle:'active',
    viability:'watchlist'
  });
  if(!/weakening|fading|losing momentum/i.test(String(diminishingPlanCopy.diagnosticsMessage || ''))){
    throw new Error('Non-terminal diminishing plan copy must preserve deterioration wording.');
  }
  const missingPlanCopy = projectionSandbox.nonPlanCalcNoteText('', '', {
    bounce_state:'attempt',
    hasPriceablePlan:false,
    hasProvisionalPriceablePlan:false,
    terminal_avoid_applied:false
  });
  if(missingPlanCopy !== 'No actionable plan yet.'){
    throw new Error('Missing/unpriceable plan calc note must remain "No actionable plan yet."');
  }
  const provisionalCalcCopy = projectionSandbox.nonPlanCalcNoteText('', '', {
    bounce_state:'attempt',
    hasPriceablePlan:true,
    hasProvisionalPriceablePlan:false,
    terminal_avoid_applied:false
  });
  if(!/confirmation/i.test(String(provisionalCalcCopy || ''))){
    throw new Error('Unconfirmed priceable plan calc note must use confirmation wording.');
  }

  const explicitTerminalAvoidPlanCopy = projectionSandbox.resolvePlanVisibility({
    state:'avoid',
    finalVerdict:'avoid',
    visualBucket:'avoid',
    structure:'broken',
    bounce_state:'attempt',
    terminal_avoid_applied:true,
    avoid_trigger_source:'structure_broken',
    lifecycle:'dead',
    viability:'reject'
  });
  if(!/avoid|too weak|broken|leave it alone/i.test(String(explicitTerminalAvoidPlanCopy.diagnosticsMessage || ''))){
    throw new Error('Terminal Avoid plan copy must still display Avoid wording.');
  }

  const terminalAvoid = projectionSandbox.applyProjectionSnapshotToReviewBundle({}, {
    ticker:'DINO',
    finalVerdict:'avoid',
    canonicalVerdict:'avoid',
    renderedVerdict:'avoid',
    visualBucket:'monitor',
    sourceOfTruthVisualBucket:'monitor',
    renderedBucket:'monitor',
    terminalAvoidApplied:true,
    avoidTriggerSource:'terminal_avoid',
    structureState:'broken',
    lifecycleState:'dead',
    viability:'reject',
    actionGuidance:'Avoid - too weak or broken',
    planStatusLabel:'Avoid - too weak or broken. Leave it alone.'
  });
  const terminalVisual = terminalAvoid.bundle.visualState || {};
  const terminalGlobal = terminalAvoid.bundle.globalVerdict || {};
  const terminalResolved = terminalAvoid.bundle.resolvedContract || {};
  if(terminalGlobal.final_verdict !== 'avoid' || terminalVisual.visualBucket !== 'avoid'){
    throw new Error('Terminal avoid projection must remain avoid.');
  }
  if(!/avoid|too weak|broken/i.test(String(terminalResolved.actionLabel || terminalResolved.planStatusLabel || ''))){
    throw new Error('Terminal avoid projection must retain terminal Avoid wording.');
  }

  const suppressedTrackPromotion = projectionSandbox.applyProjectionSnapshotToReviewBundle({
    canonicalContract:{canonicalVerdictKey:'watch'},
    resolvedContract:{finalVerdict:'watch', visualBucket:'monitor', presentationBucket:'monitor'},
    visualState:{canonicalVerdict:'watch', finalVerdict:'watch', visualBucket:'monitor', presentationBucket:'monitor'},
    globalVerdict:{final_verdict:'watch'}
  }, {
    ticker:'DINO',
    canonicalVerdict:'watch',
    finalVerdict:'near_entry',
    renderedVerdict:'near_entry',
    visualBucket:'near_entry',
    sourceOfTruthVisualBucket:'near_entry',
    renderedBucket:'near_entry',
    terminalAvoidApplied:false,
    avoidTriggerSource:'',
    structureState:'intact',
    lifecycleState:'active',
    viability:'watchlist'
  });
  const suppressedVisual = suppressedTrackPromotion.bundle.visualState || {};
  const suppressedGlobal = suppressedTrackPromotion.bundle.globalVerdict || {};
  if(suppressedGlobal.final_verdict !== 'watch' || suppressedVisual.finalVerdict !== 'watch' || suppressedVisual.renderedVerdict !== 'watch'){
    throw new Error('Track projection must not promote fresh watch resolver state to near_entry.');
  }
  if(suppressedVisual.visualBucket !== 'monitor'){
    throw new Error('Suppressed track projection promotion must keep monitor visual bucket.');
  }
  if(suppressedVisual.reviewProjectionPromotionSuppressed !== true || !suppressedVisual.reviewProjectionPromotionSuppressedReason){
    throw new Error('Suppressed track projection promotion must expose debug suppression fields.');
  }

  const authoritativeNearEntry = projectionSandbox.applyProjectionSnapshotToReviewBundle({
    canonicalContract:{canonicalVerdictKey:'near_entry'},
    resolvedContract:{finalVerdict:'near_entry', visualBucket:'near_entry', presentationBucket:'near_entry'},
    visualState:{canonicalVerdict:'near_entry', finalVerdict:'near_entry', visualBucket:'near_entry', presentationBucket:'near_entry'},
    globalVerdict:{final_verdict:'near_entry'}
  }, {
    ticker:'DINO',
    canonicalVerdict:'near_entry',
    finalVerdict:'near_entry',
    renderedVerdict:'near_entry',
    visualBucket:'near_entry',
    sourceOfTruthVisualBucket:'near_entry',
    renderedBucket:'near_entry',
    terminalAvoidApplied:false,
    avoidTriggerSource:'',
    structureState:'intact',
    lifecycleState:'active',
    viability:'watchlist'
  });
  const authoritativeVisual = authoritativeNearEntry.bundle.visualState || {};
  const authoritativeGlobal = authoritativeNearEntry.bundle.globalVerdict || {};
  if(authoritativeGlobal.final_verdict !== 'near_entry' || authoritativeVisual.visualBucket !== 'near_entry'){
    throw new Error('Authoritative fresh near_entry resolver state must remain near_entry.');
  }

  const rawBullishChecklist = {
    trendStrong:true,
    above50:true,
    above200:true,
    ma50gt200:true,
    near20:false,
    near50:true,
    stabilising:true,
    bounce:true,
    volume:true,
    entryDefined:true,
    stopDefined:true,
    targetDefined:true
  };
  const blockedChecklistContext = {
    canonicalVerdict:'avoid',
    visualBucket:'avoid',
    mainBlocker:'Structure is broken.',
    planVisible:false,
    planStatus:'invalid',
    planValid:false,
    entry:100,
    stop:102,
    target:98,
    structureState:'weak',
    bounceState:'none',
    stabilisationState:'none',
    pullbackZone:'near_50ma',
    viability:'reject',
    rejectedByViabilityGate:true
  };
  const displayedChecklist = projectionSandbox.resolvedReviewChecksForDisplay(rawBullishChecklist, blockedChecklistContext);
  const blockedChecklistScore = projectionSandbox.scoreAndStatusFromChecks(displayedChecklist, blockedChecklistContext);
  const blockedChecklistSummary = projectionSandbox.buildSummary(displayedChecklist, blockedChecklistScore.status, blockedChecklistContext);
  if(blockedChecklistScore.score >= 10){
    throw new Error('Blocked Review checklist must not display 10/10 when the effective plan is invalid.');
  }
  if(displayedChecklist.entryDefined !== true || displayedChecklist.stopDefined !== false || displayedChecklist.targetDefined !== false){
    throw new Error('Review checklist plan fields must reflect the effective valid long-plan shape.');
  }
  if(!/^Avoid for now/i.test(String(blockedChecklistSummary || '')) || /Strong uptrend|broken/i.test(String(blockedChecklistSummary || ''))){
    throw new Error('Blocked Review checklist summary must lead with blocked/no-actionable-plan language, not bullish summary copy.');
  }

  const brokenStructureChecklistContext = {
    canonicalVerdict:'avoid',
    visualBucket:'avoid',
    mainBlocker:'',
    planVisible:true,
    planStatus:'valid',
    planValid:true,
    entry:100,
    stop:95,
    target:115,
    structureState:'broken',
    bounceState:'none',
    stabilisationState:'none',
    pullbackZone:'near_50ma',
    viability:'reject',
    rejectedByViabilityGate:true,
    terminalAvoidApplied:true,
    entryGatePass:false,
    nearEntryGatePass:false
  };
  const brokenStructureChecklist = projectionSandbox.resolvedReviewChecksForDisplay(rawBullishChecklist, brokenStructureChecklistContext);
  const brokenStructureScore = projectionSandbox.scoreAndStatusFromChecks(brokenStructureChecklist, brokenStructureChecklistContext);
  const brokenStructureSummary = projectionSandbox.buildSummary(
    brokenStructureChecklist,
    brokenStructureScore.status,
    brokenStructureChecklistContext
  );
  if(brokenStructureScore.score > 2 || brokenStructureScore.qualityLabel !== 'Poor'){
    throw new Error('Terminal broken-structure Review quality must be capped low even when raw checklist fields are bullish.');
  }
  if(/Strong uptrend/i.test(String(brokenStructureSummary || '')) || !/pullback structure is broken|No entry until/i.test(String(brokenStructureSummary || ''))){
    throw new Error('Terminal broken-structure Review summary must not use bullish checklist summary copy.');
  }
  if(/Checks met\s*:/i.test(appSource) || /review-checklist-panel/.test(appSource)){
    throw new Error('Review must not render the legacy visible checklist count/panel.');
  }

  const aliveVolatileSemantic = projectionSandbox.buildReviewSemanticStatus({
    simplifiedState:{
      canonicalVerdict:'watch',
      mainBlocker:'Trend is weakening - no reliable stop level yet.',
      planStatus:'valid',
      planVisible:true,
      entryGatePass:false,
      nearEntryGatePass:false
    },
    globalVerdict:{
      final_verdict:'watch',
      structure_state:'strong',
      structure_eligibility:'alive',
      setup_location_state:'volatile',
      priceability_state:'unpriceable',
      bounce_state:'attempt',
      main_blocker:'Trend is weakening - no reliable stop level yet.'
    },
    derivedStates:{
      structureState:'strong',
      setupLocationState:'volatile',
      priceabilityState:'unpriceable',
      bounceState:'attempt',
      stabilisationState:'none'
    },
    displayedPlan:{
      status:'valid',
      entry:100,
      stop:95,
      target:115,
      rewardRisk:{valid:true, rrRatio:3}
    },
    planRealism:{raw_rr:3}
  });
  const aliveVolatileText = [
    aliveVolatileSemantic.blocker,
    aliveVolatileSemantic.tradeStatus && aliveVolatileSemantic.tradeStatus.line1,
    aliveVolatileSemantic.tradeStatus && aliveVolatileSemantic.tradeStatus.line2,
    aliveVolatileSemantic.rrDisplay
  ].join(' | ');
  if(/Trend is weakening|structure.*(?:broken|weakening)|failed/i.test(aliveVolatileText)){
    throw new Error('Alive volatile/recovery Review semantics must not use structural weakening wording.');
  }
  if(!/Recovery attempt|stabilised|price reliably|Draft plan possible but weak|No actionable trade yet/i.test(aliveVolatileText)){
    throw new Error('Alive volatile/recovery Review semantics must use recovery/priceability/draft-plan wording.');
  }

  const tgtStyleAliveWatchSemantic = projectionSandbox.buildReviewSemanticStatus({
    simplifiedState:{
      canonicalVerdict:'watch',
      mainBlocker:'No valid invalidation level is available.',
      planStatus:'missing',
      planVisible:false,
      entryGatePass:false,
      nearEntryGatePass:false
    },
    globalVerdict:{
      final_verdict:'watch',
      structure_state:'developing_clean',
      structure_eligibility:'alive',
      setup_location_state:'near_50ma',
      priceability_state:'unpriceable',
      bounce_state:'attempt',
      main_blocker:'No valid invalidation level is available.'
    },
    derivedStates:{
      structureState:'developing_clean',
      setupLocationState:'near_50ma',
      priceabilityState:'unpriceable',
      bounceState:'attempt',
      stabilisationState:'early',
      volumeState:'weak'
    },
    displayedPlan:{status:'missing'},
    planRealism:{}
  });
  const tgtStyleText = [
    tgtStyleAliveWatchSemantic.primaryReason,
    tgtStyleAliveWatchSemantic.blocker,
    tgtStyleAliveWatchSemantic.tradeStatus && tgtStyleAliveWatchSemantic.tradeStatus.line1,
    tgtStyleAliveWatchSemantic.tradeStatus && tgtStyleAliveWatchSemantic.tradeStatus.line2,
    tgtStyleAliveWatchSemantic.rrDisplay
  ].join(' | ');
  if(!/bounce is still taking shape|buyers are starting to step in/i.test(tgtStyleText) || !/clear support level for managing risk|Trade remains unpriceable|No actionable trade yet/i.test(tgtStyleText)){
    throw new Error('TGT-style alive Watch copy must frame the setup as a developing bounce with missing support/risk structure and no trade yet.');
  }
  if(/structure (?:looks )?(?:weak|broken)|no signs of stabilisation|no bounce yet|no signs.*bounce/i.test(tgtStyleText)){
    throw new Error('TGT-style alive Watch copy must not imply weak/broken structure or absent bounce.');
  }

  const sanitizedAliveAiCopy = projectionSandbox.sanitizeAliveWatchSemanticCopy(
    'Overall structure looks weak. No signs of stabilisation or a bounce yet.',
    {
      finalVerdict:'watch',
      structureState:'developing_clean',
      structureEligibility:'alive',
      setupLocationState:'near_50ma',
      priceabilityState:'unpriceable',
      bounceState:'attempt',
      stabilisationState:'early'
    }
  );
  if(!/broader uptrend is still intact|bounce attempt|price reliably/i.test(sanitizedAliveAiCopy)){
    throw new Error('AI summary sanitisation must rewrite stale weak/no-bounce copy for alive bounce-attempt Watch setups.');
  }
  if(/structure (?:looks )?(?:weak|broken)|no signs of stabilisation|no bounce yet|no signs.*bounce/i.test(sanitizedAliveAiCopy)){
    throw new Error('AI summary sanitisation must not leave weak/no-bounce wording when bounce attempt exists.');
  }

  const genuineNoBounceCopy = projectionSandbox.sanitizeAliveWatchSemanticCopy(
    'No signs of stabilisation or a bounce yet.',
    {
      finalVerdict:'watch',
      structureState:'strong',
      structureEligibility:'alive',
      priceabilityState:'unpriceable',
      bounceState:'none',
      stabilisationState:'none'
    }
  );
  if(!/No signs of stabilisation or a bounce yet/i.test(genuineNoBounceCopy)){
    throw new Error('Genuine no-bounce setups may still use no-bounce wording.');
  }

  const genuineDamagedCopy = projectionSandbox.sanitizeAliveWatchSemanticCopy(
    'Structure looks weak and no bounce yet.',
    {
      finalVerdict:'watch',
      structureState:'weakening',
      structureEligibility:'damaged',
      priceabilityState:'unpriceable',
      bounceState:'none'
    }
  );
  if(!/Structure looks weak/i.test(genuineDamagedCopy)){
    throw new Error('Genuine damaged/weakening setups may still use weak-structure wording.');
  }

  const fallingKnifeCopyPreserved = projectionSandbox.sanitizeAliveWatchSemanticCopy(
    'Selling pressure is accelerating  wait for the stock to stabilise before reassessing.',
    {
      finalVerdict:'avoid',
      visualBucket:'avoid',
      structureState:'weakening',
      structureEligibility:'damaged',
      priceabilityState:'unpriceable',
      bounceState:'none',
      semantic_blocker_code:'falling_knife'
    }
  );
  if(!/Selling pressure is accelerating/i.test(fallingKnifeCopyPreserved)){
    throw new Error('Falling-knife Avoid copy must be preserved by alive Watch sanitisation.');
  }

  const trueWeakeningSemantic = projectionSandbox.buildReviewSemanticStatus({
    simplifiedState:{canonicalVerdict:'watch', mainBlocker:'Trend is weakening - no reliable stop level yet.', planStatus:'valid', planVisible:true},
    globalVerdict:{final_verdict:'watch', structure_state:'weakening', structure_eligibility:'damaged', main_blocker:'Trend is weakening - no reliable stop level yet.'},
    derivedStates:{structureState:'weakening'},
    displayedPlan:{status:'valid', entry:50, stop:47, target:59, rewardRisk:{valid:true, rrRatio:3}},
    planRealism:{raw_rr:3}
  });
  if(!/Trend is weakening/i.test(String(trueWeakeningSemantic.blocker || ''))){
    throw new Error('True weakening setup may still render trend weakening wording.');
  }

  const recoveryChecklistContext = {
    canonicalVerdict:'watch',
    visualBucket:'diminishing',
    mainBlocker:'Avoid for now — setup is too volatile to price reliably.',
    planVisible:false,
    planStatus:'invalid',
    planValid:false,
    entry:250,
    stop:255,
    target:245,
    structureState:'broken',
    bounceState:'attempt',
    stabilisationState:'none',
    pullbackZone:'extended',
    viability:'low_priority',
    rejectedByViabilityGate:false,
    nonTerminalRecoveryBlocker:true
  };
  const recoveryChecklist = projectionSandbox.resolvedReviewChecksForDisplay(rawBullishChecklist, recoveryChecklistContext);
  const recoverySummary = projectionSandbox.buildSummary(
    recoveryChecklist,
    projectionSandbox.scoreAndStatusFromChecks(recoveryChecklist, recoveryChecklistContext).status,
    recoveryChecklistContext
  );
  if(recoveryChecklist.stabilising === true || recoveryChecklist.targetDefined === true){
    throw new Error('Volatile recovery checklist must not keep stabilising/target checks from raw bullish inputs.');
  }
  if(/Structure is broken|Strong uptrend/i.test(String(recoverySummary || '')) || !/volatile|Entry, stop, and target cannot be priced reliably yet/i.test(String(recoverySummary || ''))){
    throw new Error('Volatile recovery checklist summary must use non-terminal volatility/no-actionable-plan wording.');
  }
}

function runEntryConditionsSummaryAssertions(){
  const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const appShellSource = fs.readFileSync(path.join(root, 'js/shell/app-shell.js'), 'utf8');
  const stylesSource = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
  if(!/entryConditionsHoldBound/.test(appSource) || !/bindEntryConditionsHoldInteractions\(div\)/.test(appSource)){
    throw new Error('Watchlist long-press helper binding diagnostics must be wired to the active card renderer.');
  }
  if(!/cardMode\s*\?\s*localPanel/.test(appSource)){
    throw new Error('Track card long-press binding must prefer the replacement card local panel over stale document panel ids.');
  }
  if(!/existingCard\.remove\(\)/.test(appSource) || !/watchlist_remove/.test(appSource)){
    throw new Error('Track remove must immediately remove the visible card and invalidate watchlist render state.');
  }
  if(/positionWorkspaceViewport|trackFocusedOnce|trackScrollOffsetY/.test(appShellSource)){
    throw new Error('Track tab focus must not use first-focus auto-scroll positioning.');
  }
  if(!/saveActiveWorkspaceScroll/.test(appShellSource) || !/uiState\.trackScrollY/.test(appShellSource) || !/restoreWorkspaceViewportAfterOpen\(appliedTab\)/.test(appShellSource)){
    throw new Error('Track tab focus must save and restore the last Track scroll position.');
  }
  if(!/lastKnownScrollByTab/.test(appShellSource) || !/pendingTrackRestoreY/.test(appShellSource) || !/__ppPendingTrackRestoreY/.test(appShellSource)){
    throw new Error('Track restore must use an immutable per-tab restore target during tab switches and renders.');
  }
  if(!/window\.__ppPendingTrackRestoreY = undefined/.test(appShellSource) || !/lastKnownScrollByTab\.track = uiState\.trackScrollY/.test(appShellSource)){
    throw new Error('Track pending restore targets must clear after restore/user scroll, and scroll-to-top must update per-tab memory.');
  }
  if(!/scheduleTrackRestore/.test(appShellSource) || !/track:scroll-restore-retry/.test(appShellSource) || !/restoreActualAfter/.test(appShellSource)){
    throw new Error('Track restore must run after layout and retry when the first scrollTo is clamped.');
  }
  if(!/track:scroll-restore:verify/.test(appShellSource) || !/track_restore_verify_retry/.test(appShellSource) || !/post_focus_drift/.test(appShellSource)){
    throw new Error('Track restore must verify after post-focus drift and retry without saving drift positions.');
  }
  if(!/no-smooth-scroll/.test(stylesSource) || !/setSmoothScrollDisabled/.test(appShellSource) || !/computedHtmlScrollBehavior/.test(appShellSource) || !/track_restore_aborted/.test(appShellSource)){
    throw new Error('Track restore must temporarily disable CSS smooth scrolling and trace computed scroll behavior.');
  }
  if(!/!\['track','review'\]\.includes\(appliedTab\)/.test(appShellSource)){
    throw new Error('Track and Review tab focus must avoid forcing window scroll to top.');
  }
  if(/scheduleReviewWorkspaceScroll|scheduleReviewScrollAfterLoad|scrollReviewSectionIntoView/.test(appSource)){
    throw new Error('Review focus must not use delayed or post-render auto-scroll helpers.');
  }
  if(!/primeWorkspaceViewportBeforeOpen\(nextTab\);[\s\S]{0,120}applyWorkspace\(nextTab\)/.test(appShellSource)){
    throw new Error('Review tab activation must prime the viewport before showing Review to avoid a visible jump.');
  }
  if(!/reviewInitialTopPositioned/.test(appShellSource) || !/if\(uiState\.reviewInitialTopPositioned === true\)[\s\S]{0,400}return/.test(appShellSource)){
    throw new Error('Review top positioning must run only once per session.');
  }
  if(!/previousTab === 'review' && nextTab !== 'review'/.test(appShellSource) || !/review_initial_positioning_complete/.test(appShellSource)){
    throw new Error('Review top positioning must reset between Review opens and avoid smooth-scroll animation.');
  }
  if(!/suppressScrollMemory/.test(appShellSource) || !/track:scroll-save-suppressed/.test(appShellSource) || !/__ppSuppressScrollMemoryUntil/.test(appShellSource)){
    throw new Error('Programmatic scrolls must suppress Track scroll-memory overwrites.');
  }
  if(!/extendActiveScrollSuppression/.test(appShellSource) || !/_settling/.test(appShellSource)){
    throw new Error('Programmatic scroll suppression must extend until scroll movement settles.');
  }
  if(!/review_initial_positioning/.test(appShellSource) || !/scroll_to_top_button/.test(appShellSource) || !/track_restore/.test(appShellSource)){
    throw new Error('Review positioning, Track restore, and Track scroll-to-top must carry explicit scroll-memory suppression reasons.');
  }
  if(!/isWorkspaceVisiblyActive/.test(appShellSource) || !/blocked_not_active_visible_track/.test(appShellSource)){
    throw new Error('Track scroll memory must only be saved when Track is the active visible workspace.');
  }
  if(/normalized === 'review'[\s\S]{0,160}scrollWindowTo/.test(appShellSource)){
    throw new Error('Review subsequent tab focuses must not force scroll restoration.');
  }
  if(!/__ppPendingTrackRestoreY/.test(appSource) || !/pendingRestoreApplied/.test(appSource) || !/function restoreTrackUiState[\s\S]*?window\.scrollTo\(\{top:Math\.max\(0, targetScrollY\), behavior:'auto'\}\)/.test(appSource)){
    throw new Error('Track render/remove/refresh must preserve the captured Track page scroll position after DOM updates.');
  }
  if(!/trackScrollTopBtn/.test(appShellSource)){
    throw new Error('Track floating scroll-to-top control must be wired in the app shell.');
  }
  if(!/suppressScrollMemoryForAppScroll/.test(appSource) || !/track_dom_update_restore/.test(appSource)){
    throw new Error('App-level programmatic scrolls must suppress Track scroll-memory saves.');
  }
  if(!/actualTrackPageScrollTop/.test(appSource) || /const scrollTop = Number\(trackWorkspace\.scrollTop/.test(appSource) || !/page_not_at_top/.test(appSource)){
    throw new Error('Track pull-to-refresh must use page scroll, not trackWorkspace.scrollTop, for top eligibility.');
  }
  if(!/track:deferred-startup-refresh:start/.test(appSource) || !/startup_refresh_full_user_open/.test(appSource)){
    throw new Error('Deferred Track startup refresh must be traced distinctly from manual refreshes.');
  }
  if(!/isAdvancedDebugVisible/.test(appSource) || !/reviewAdvancedDebugTap/.test(appSource)){
    throw new Error('Review debug panels must be gated behind the advanced debug reveal path.');
  }
  if(!/data-advanced-debug-trigger/.test(appSource) || !/reviewAdvancedDebugFeedbackNode/.test(appSource) || !/document\.body\.addEventListener\('click', handleReviewAdvancedDebugTap, true\)/.test(appSource)){
    throw new Error('Review advanced debug reveal must be delegated from the Review watchlist status button.');
  }
  const summarySandbox = {
    normalizeGlobalVerdictKey(value){
      const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
      if(safe === 'nearentry') return 'near_entry';
      if(['entry','near_entry','watch','avoid'].includes(safe)) return safe;
      return 'watch';
    },
    normalizeVisualBucketForPairing(value){
      const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
      if(['entry','near_entry','monitor','diminishing','avoid'].includes(safe)) return safe;
      return 'monitor';
    },
    sameVisibleCopy(a, b){
      return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
    },
    normalizeVerdict(value){
      const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
      if(safe === 'near_entry' || safe === 'nearentry') return 'near_entry';
      if(['entry','watch','avoid','dead','monitor','developing'].includes(safe)) return safe;
      return safe || 'watch';
    },
    normalizeTicker(value){
      return String(value || '').trim().toUpperCase();
    }
  };
  vm.createContext(summarySandbox);
  [
    'buildSharedSetupNarrative',
    'resolveSetupPatternUi',
    'entryTriggerConditionForSummary',
    'nextUpgradeStateForSummary',
    'nextUpgradeStateForSummaryLabel',
    'buildEntryConditionsSummary'
  ].forEach(functionName => {
    vm.runInContext(extractFunctionSource(appSource, functionName), summarySandbox, {filename:`app.js#${functionName}`});
  });

  const healthyMissingPlan = summarySandbox.buildEntryConditionsSummary({
    ticker:'MAR',
    finalVerdict:'watch',
    presentationState:'monitor',
    resolvedContract:{planStatusKey:'missing', structuralState:'developing', rrConfidenceLabel:'invalid'},
    globalVerdict:{
      final_verdict:'watch',
      setup_score:8,
      entry_gate_pass:false,
      entry_gate_checks:{structure_ok:true, bounce_ok:false, plan_ok:false, pullback_ok:false, rr_ok:false, volume_ok:false}
    },
    derivedStates:{structureState:'strong', trendState:'strong', bounceState:'none', stabilisationState:'none', pullbackZone:'none', volumeState:'weak'},
    displayedPlan:{}
  });
  const healthyText = [healthyMissingPlan.header, healthyMissingPlan.primary, healthyMissingPlan.definitionLine, healthyMissingPlan.footer, healthyMissingPlan.secondary && healthyMissingPlan.secondary.join(' ')].join(' ');
  if(!healthyMissingPlan.show || !/bounce still needs to form|reliable rebound from support|clearer bounce/i.test(healthyText)){
    throw new Error('Healthy missing-plan/no-bounce Watch long-press summary must describe confirmation, not deterioration.');
  }
  if(/weak pullback|weakening|damaged|deteriorating|losing quality/i.test(healthyText)){
    throw new Error('Healthy Watch long-press summary must not use weak/damaged/deteriorating language.');
  }

  const missingPlanOnly = summarySandbox.buildEntryConditionsSummary({
    ticker:'BK',
    finalVerdict:'watch',
    presentationState:'monitor',
    resolvedContract:{planStatusKey:'missing', structuralState:'watchlist'},
    globalVerdict:{
      final_verdict:'watch',
      setup_score:9,
      entry_gate_checks:{structure_ok:true, bounce_ok:false, plan_ok:false, pullback_ok:true, rr_ok:false}
    },
    derivedStates:{structureState:'strong', trendState:'strong', bounceState:'attempt', stabilisationState:'early', pullbackZone:'near_20ma', volumeState:'supportive'},
    displayedPlan:{}
  });
  const missingPlanText = [missingPlanOnly.primary, missingPlanOnly.footer].join(' ');
  if(!/stronger confirmation|developing watch|clearer support|considering an entry/i.test(missingPlanText)){
    throw new Error('Missing plan alone must produce plan-pending long-press wording.');
  }
  if(/diminishing|weakening|deteriorating|damaged/i.test(missingPlanText)){
    throw new Error('Missing plan alone must not produce Diminishing long-press wording.');
  }

  const trueDiminishing = summarySandbox.buildEntryConditionsSummary({
    ticker:'DOW',
    finalVerdict:'watch',
    presentationState:'diminishing',
    resolvedContract:{planStatusKey:'valid', structuralState:'developing'},
    globalVerdict:{
      final_verdict:'watch',
      setup_score:5,
      main_blocker:'Trend is weakening - no reliable stop level yet.',
      viabilityBranchId:'damaged_tradeability_rr_fail_softened_low_priority',
      entry_gate_checks:{structure_ok:false, bounce_ok:false, plan_ok:true, rr_ok:false}
    },
    derivedStates:{structureState:'weakening', trendState:'weak', bounceState:'none', stabilisationState:'none', pullbackZone:'none', volumeState:'normal'},
    displayedPlan:{}
  });
  const diminishingText = [trueDiminishing.header, trueDiminishing.primary, trueDiminishing.definitionLine, trueDiminishing.secondary && trueDiminishing.secondary.join(' ')].join(' ');
  if(!/diminishing|weakening|deteriorating|stabilise|quality/i.test(diminishingText)){
    throw new Error('True Diminishing long-press summary must retain weakening/fading language.');
  }

  const terminalAvoid = summarySandbox.buildEntryConditionsSummary({
    ticker:'AVD',
    finalVerdict:'avoid',
    presentationState:'avoid',
    resolvedContract:{planStatusKey:'invalid'},
    globalVerdict:{final_verdict:'avoid', terminal_avoid_applied:true},
    derivedStates:{structureState:'broken'},
    displayedPlan:{}
  });
  const terminalAvoidText = [terminalAvoid.header, terminalAvoid.primary, terminalAvoid.definitionLine, terminalAvoid.secondary && terminalAvoid.secondary.join(' ')].join(' ');
  if(terminalAvoid.show !== true || !/avoid|blocked|broken|repair/i.test(terminalAvoidText)){
    throw new Error('Terminal Avoid long-press summary must remain clearly blocked/avoid.');
  }
}

runReviewProjectionAssertions();
runEntryConditionsSummaryAssertions();

function runSharedNarrativeConsistencyAssertions(){
  const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const narrativeSandbox = {
    console,
    normalizeGlobalVerdictKey(value){
      const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
      if(safe === 'nearentry') return 'near_entry';
      if(['entry','near_entry','watch','avoid'].includes(safe)) return safe;
      return 'watch';
    },
    normalizeVisualBucketForPairing(value){
      const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
      if(['entry','near_entry','monitor','diminishing','avoid'].includes(safe)) return safe;
      return 'monitor';
    },
    normalizeVerdict(value){
      const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
      if(safe === 'nearentry') return 'near_entry';
      if(['entry','near_entry','watch','avoid','dead','monitor','developing'].includes(safe)) return safe;
      return safe || 'watch';
    },
    normalizeTicker(value){
      return String(value || '').trim().toUpperCase();
    },
    sameVisibleCopy(a, b){
      return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
    },
    currentRrThreshold(){
      return 2;
    },
    numericOrNull(value){
      if(value === null || value === undefined) return null;
      if(typeof value === 'string' && value.trim() === '') return null;
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    },
    globalVerdictLabel(value){
      const safe = String(value || '').trim().toLowerCase();
      if(safe === 'entry') return 'Entry';
      if(safe === 'near_entry') return 'Near Entry';
      if(safe === 'avoid') return 'Avoid';
      return 'Watch';
    }
  };
  vm.createContext(narrativeSandbox);
  [
    'normalizeUiCopy',
    'resolvePresentationTone',
    'terminalAvoidEvidenceForReviewCopy',
    'terminalAvoidCopyPattern',
    'sanitizeAliveWatchSemanticCopy',
    'provisionalPlanConfirmationCopy',
    'sanitizeNonTerminalPlanCopy',
    'buildSharedSetupNarrative',
    'resolveTrackCardVisibleModel',
    'buildReviewSemanticStatus',
    'resolveSetupPatternUi',
    'entryTriggerConditionForSummary',
    'nextUpgradeStateForSummary',
    'nextUpgradeStateForSummaryLabel',
    'buildEntryConditionsSummary'
  ].forEach(functionName => {
    vm.runInContext(extractFunctionSource(appSource, functionName), narrativeSandbox, {filename:`app.js#${functionName}`});
  });

  const sharedInput = {
    simplifiedState:{
      canonicalVerdict:'watch',
      visualBucket:'monitor',
      planStatus:'missing',
      planVisible:false,
      mainBlocker:'Conditions are not strong enough for active focus.'
    },
    resolvedState:{
      final_verdict:'watch',
      structure_eligibility:'alive',
      structure_state:'strong',
      bounce_state:'attempt',
      priceability_state:'unpriceable',
      hasClearInvalidationLevel:false
    },
    derivedStates:{
      structureState:'strong',
      structureEligibility:'alive',
      bounceState:'attempt',
      volumeState:'supportive',
      pullbackZone:'near_20ma',
      priceabilityState:'unpriceable'
    },
    displayedPlan:{status:'missing'}
  };
  const narrative = narrativeSandbox.buildSharedSetupNarrative(sharedInput);
  if(narrative.stateLabel !== 'Developing Watch'){
    throw new Error('Shared narrative must label the developing-watch state consistently.');
  }
  if(!/bounce is still taking shape/i.test(String(narrative.primaryReason || ''))){
    throw new Error('Shared narrative must explain that the bounce is still taking shape.');
  }
  if(!/support level for managing risk/i.test(String(narrative.blocker || ''))){
    throw new Error('Shared narrative must explain the missing support/risk level.');
  }
  if(!/stronger bounce.*clearer area of support/i.test(String(narrative.nextAction || ''))){
    throw new Error('Shared narrative must explain the next step in plain-English chart terms.');
  }
  if((narrative.promotionRequirements || []).join(' ').match(/needs structure repair/i)){
    throw new Error('Shared narrative must not emit structure-repair language for alive/strong setups.');
  }

  const trackModel = narrativeSandbox.resolveTrackCardVisibleModel({ticker:'ADI'}, {
    canonicalVerdict:'watch',
    visualBucket:'monitor',
    badgeLabel:'Watch',
    planVisible:false,
    planStatus:'missing',
    mainBlocker:'Conditions are not strong enough for active focus.',
    debug:{
      resolvedState:sharedInput.resolvedState,
      derivedStates:sharedInput.derivedStates
    }
  });
  if(trackModel.headline !== narrative.stateLabel || !/bounce is still taking shape/i.test(String(trackModel.primaryReason || ''))){
    throw new Error('Track card narrative must align with the shared developing-watch narrative.');
  }
  if(!/stronger bounce and a clearer area of support/i.test(String(trackModel.planSummary || '')) || /conditions are not strong enough for active focus/i.test(String(trackModel.planSummary || ''))){
    throw new Error('Track More plan summary must prefer the shared next action over legacy generic blocker copy.');
  }

  const reviewModel = narrativeSandbox.buildReviewSemanticStatus({
    simplifiedState:sharedInput.simplifiedState,
    globalVerdict:sharedInput.resolvedState,
    derivedStates:sharedInput.derivedStates,
    displayedPlan:sharedInput.displayedPlan,
    planRealism:{}
  });
  if(reviewModel.stateLabel !== narrative.stateLabel || !/support level for managing risk/i.test(String(reviewModel.blocker || ''))){
    throw new Error('Review narrative must align with the shared developing-watch narrative.');
  }

  const holdModel = narrativeSandbox.buildEntryConditionsSummary({
    ticker:'ADI',
    finalVerdict:'watch',
    presentationState:'monitor',
    resolvedContract:{planStatusKey:'missing', structuralState:'developing', rrConfidenceLabel:'invalid'},
    globalVerdict:{
      final_verdict:'watch',
      structure_eligibility:'alive',
      structure_state:'strong',
      bounce_state:'attempt',
      priceability_state:'unpriceable',
      hasClearInvalidationLevel:false,
      entry_gate_checks:{structure_ok:true, bounce_ok:false, plan_ok:false, pullback_ok:true, rr_ok:false}
    },
    derivedStates:sharedInput.derivedStates,
    displayedPlan:{}
  });
  const holdText = [holdModel.primary, holdModel.pattern_explanation, holdModel.triggerLine, holdModel.futureStateLine, (holdModel.secondary || []).join(' ')].join(' ');
  if(!/bounce is still taking shape/i.test(holdText) || !/support level for managing risk/i.test(holdText) || !/stronger bounce|buyers are defending/i.test(holdText)){
    throw new Error('Track long-press narrative must stay consistent with the shared developing-watch narrative while remaining more detailed.');
  }
  if(/\.\./.test(holdText)){
    throw new Error('Track long-press narrative must not emit doubled punctuation.');
  }

  const diminishingNarrative = narrativeSandbox.buildSharedSetupNarrative({
    simplifiedState:{
      canonicalVerdict:'watch',
      visualBucket:'diminishing',
      planStatus:'missing',
      planVisible:false,
      mainBlocker:'Trend is weakening - no reliable stop level yet.'
    },
    resolvedState:{
      final_verdict:'watch',
      structure_eligibility:'alive',
      structure_state:'intact',
      bounce_state:'attempt',
      priceability_state:'unpriceable',
      viability:'low_priority'
    },
    derivedStates:{
      structureState:'intact',
      structureEligibility:'alive',
      bounceState:'attempt',
      volumeState:'supportive',
      pullbackZone:'near_20ma',
      priceabilityState:'unpriceable'
    },
    displayedPlan:{status:'missing'}
  });
  if(/Developing Watch/i.test(String(diminishingNarrative.stateLabel || '')) || !/Diminishing/i.test(String(diminishingNarrative.stateLabel || ''))){
    throw new Error('Diminishing watch narrative must not be flattened into Developing Watch.');
  }
  if(/bounce is still taking shape|buyers are starting to step in/i.test(String(diminishingNarrative.primaryReason || ''))){
    throw new Error('Diminishing watch narrative must preserve weaker severity instead of using the healthy bounce-forming narrative.');
  }

  if(!/const sharedNarrative = buildSharedSetupNarrative\(/.test(appSource)
    || !/decisionSummary = String\(\s*sharedNarrative\.stateLabel/.test(appSource)
    || !/buildReviewSemanticStatus[\s\S]*buildSharedSetupNarrative/.test(appSource)
    || !/buildEntryConditionsSummary[\s\S]*buildSharedSetupNarrative/.test(appSource)){
    throw new Error('Scan, Review, and Track long-press surfaces must consume the shared narrative builder.');
  }
  if(/const decisionSummary = String\(reviewSemanticStatus\.primaryReason[\s\S]{0,120}const reviewSemanticStatus = buildReviewSemanticStatus\(/.test(appSource)){
    throw new Error('Review semantic status must be initialized before any decisionSummary reads to avoid a TDZ runtime error.');
  }
  if(/const plannerDecisionSummary = String\(plannerSemanticStatus\.primaryReason[\s\S]{0,120}const plannerSemanticStatus = buildReviewSemanticStatus\(/.test(appSource)){
    throw new Error('Planner semantic status must be initialized before any plannerDecisionSummary reads to avoid a TDZ runtime error.');
  }
}

runSharedNarrativeConsistencyAssertions();

function runSimplifiedPipelineAssertions(){
  const pipeline = sandbox.window.SimplifiedTradeState;
  if(!pipeline || typeof pipeline.resolveRecordState !== 'function'){
    throw new Error('SimplifiedTradeState pipeline is unavailable.');
  }
  const requiredKeys = [
    'ticker',
    'canonicalVerdict',
    'visualBucket',
    'tone',
    'badgeLabel',
    'actionLabel',
    'planVisible',
    'planStatus',
    'mainBlocker',
    'entryGatePass',
    'nearEntryGatePass',
    'blockers',
    'debug'
  ];
  function depsFor(derivedStates, finalContract, setupScore = 8, extraDeps = {}){
    return {
      riskSettings:{account_size:4000, risk_percent:1, max_loss_override:40, whole_shares_only:true},
      analysisDerivedStatesFromRecord:() => derivedStates,
      resolvePreLifecycleStateContract:() => finalContract,
      resolveFinalStateContract:() => finalContract,
      setupScoreForRecord:() => setupScore,
      isHostileMarketStatus:() => false,
      scannerScoreGradientClass:() => '',
      ...extraDeps
    };
  }

  const entryBlocked = pipeline.resolveRecordState({
    ticker:'STRICT',
    in_watchlist:true,
    plan:{entry:100, stop:97, firstTarget:105},
    marketData:{price:101, ma20:100, ma50:95, ma200:80, currency:'GBP'},
    setup:{volumeRequired:false}
  }, {
    log:false,
    deps:depsFor({
      structureState:'intact',
      trendState:'intact',
      stabilisationState:'clear',
      bounceState:'confirmed',
      pullbackZone:'near_20ma',
      volumeState:'normal'
    }, {
      finalVerdict:'Entry',
      structuralState:'entry',
      actionStateKey:'ready_to_act',
      planStatusKey:'valid',
      tradeabilityVerdict:'Entry',
      blockerReason:'',
      reasonSummary:'Ready to act.',
      terminal:false,
      baseVerdict:'entry'
    })
  });
  requiredKeys.forEach(key => {
    if(!(key in entryBlocked)) throw new Error(`Simplified pipeline result missing key: ${key}`);
  });
  if(entryBlocked.canonicalVerdict === 'entry' || entryBlocked.entryGatePass !== false){
    throw new Error('Simplified pipeline must keep Entry strict when existing entry gates fail.');
  }

  const nearEntry = pipeline.resolveRecordState({
    ticker:'PROV',
    in_watchlist:true,
    reclaimAttempt:true,
    plan:{entry:100, stop:97, firstTarget:106},
    marketData:{price:99.5, ma20:100, ma50:94, ma200:80, currency:'GBP'},
    setup:{volumeRequired:false}
  }, {
    log:false,
    deps:depsFor({
      structureState:'developing_clean',
      trendState:'intact',
      stabilisationState:'early',
      bounceState:'attempt',
      pullbackZone:'near_20ma',
      volumeState:'normal'
    }, {
      finalVerdict:'Near Entry',
      structuralState:'near_entry',
      actionStateKey:'wait_for_confirmation',
      planStatusKey:'valid',
      tradeabilityVerdict:'Near Entry',
      blockerReason:'Waiting for confirmation.',
      reasonSummary:'Close to trigger.',
      terminal:false,
      baseVerdict:'near_entry'
    })
  });
  if(nearEntry.nearEntryGatePass !== true || !nearEntry.debug || !nearEntry.debug.nearEntryGateChecks){
    throw new Error('Simplified pipeline must preserve resolver-derived Near Entry gate flags.');
  }
  if(nearEntry.debug.nearEntryGateChecks.rr_priceable !== true){
    throw new Error('Credible provisional RR must remain sufficient for Near Entry gate priceability.');
  }

  const inferredProvisionalPriceability = pipeline.resolveRecordState({
    ticker:'FTIPROV',
    in_watchlist:true,
    reclaimAttempt:true,
    plan:{entry:100, stop:97, firstTarget:106},
    marketData:{price:99.5, ma20:100, ma50:94, ma200:80, currency:'GBP'},
    setup:{volumeRequired:false}
  }, {
    log:false,
    deps:depsFor({
      structureState:'intact',
      trendState:'intact',
      setupLocationState:'near_20ma',
      priceabilityState:'',
      stabilisationState:'early',
      bounceState:'attempt',
      pullbackZone:'near_20ma',
      volumeState:'normal'
    }, {
      finalVerdict:'Near Entry',
      structuralState:'near_entry',
      actionStateKey:'wait_for_confirmation',
      planStatusKey:'valid',
      tradeabilityVerdict:'Near Entry',
      blockerReason:'Bounce still tentative.',
      reasonSummary:'Bounce still tentative.',
      terminal:false,
      baseVerdict:'near_entry'
    }, 6, {
      deriveTradeability:() => 'watch'
    })
  });
  const inferredProvisionalResolved = inferredProvisionalPriceability.debug && inferredProvisionalPriceability.debug.resolvedState || {};
  const inferredProvisionalViabilityInputs = inferredProvisionalResolved.viabilityInputs || inferredProvisionalResolved.viability_inputs || {};
  if(inferredProvisionalPriceability.canonicalVerdict !== 'near_entry' || inferredProvisionalResolved.priceability_state === 'unpriceable' || inferredProvisionalViabilityInputs.priceabilityState === 'unpriceable'){
    throw new Error('Blank priceability with valid provisional plan math must infer non-unpriceable resolver priceability.');
  }
  if(inferredProvisionalResolved.priceability_state !== 'provisional' || inferredProvisionalViabilityInputs.priceabilityInferred !== true){
    throw new Error('Valid but confirmation-pending plan should infer provisional priceability with priceabilityInferred true.');
  }

  const reconciledPriceability = pipeline.resolveRecordState({
    ticker:'PRICEFIX',
    in_watchlist:true,
    reclaimAttempt:true,
    plan:{entry:100, stop:97, firstTarget:106},
    marketData:{price:99.5, ma20:100, ma50:94, ma200:80, currency:'GBP'},
    setup:{volumeRequired:false}
  }, {
    log:false,
    deps:depsFor({
      structureState:'developing_clean',
      trendState:'intact',
      setupLocationState:'near_20ma',
      priceabilityState:'unpriceable',
      stabilisationState:'early',
      bounceState:'attempt',
      pullbackZone:'near_20ma',
      volumeState:'normal'
    }, {
      finalVerdict:'Near Entry',
      structuralState:'near_entry',
      actionStateKey:'wait_for_confirmation',
      planStatusKey:'valid',
      tradeabilityVerdict:'Near Entry',
      blockerReason:'Waiting for confirmation.',
      reasonSummary:'Close to trigger.',
      terminal:false,
      baseVerdict:'near_entry'
    })
  });
  const reconciledDerived = reconciledPriceability.debug && reconciledPriceability.debug.derivedStates || {};
  const reconciledPipelineDiagnostics = reconciledPriceability.debug && reconciledPriceability.debug.pipelineDiagnostics || {};
  const reconciledResolved = reconciledPriceability.debug && reconciledPriceability.debug.resolvedState || {};
  const reconciledViabilityInputs = reconciledResolved.viabilityInputs || reconciledResolved.viability_inputs || {};
  if(reconciledPriceability.planStatus !== 'valid' || reconciledDerived.priceabilityState === 'unpriceable' || reconciledViabilityInputs.priceabilityState === 'unpriceable'){
    throw new Error('Valid effective plan must reconcile stale derived unpriceable before resolver viability inputs.');
  }
  if(reconciledDerived.priceabilityReconciledFromPlan !== true || reconciledPipelineDiagnostics.priceabilityReconciledFromPlan !== true){
    throw new Error('Valid effective plan reconciliation must expose positive priceability diagnostics.');
  }
  if(reconciledPriceability.nearEntryGatePass !== true || reconciledPriceability.canonicalVerdict !== 'near_entry'){
    throw new Error('Priceability reconciliation must preserve existing Near Entry gate outcome when gates already pass.');
  }
  const lowRrPlan = pipeline.resolveRecordState({
    ticker:'LOWRR',
    in_watchlist:true,
    plan:{entry:100, stop:97, firstTarget:104},
    marketData:{price:99.5, ma20:100, ma50:94, ma200:80, currency:'GBP'},
    setup:{volumeRequired:false}
  }, {
    log:false,
    deps:depsFor({
      structureState:'developing_clean',
      trendState:'intact',
      setupLocationState:'near_20ma',
      priceabilityState:'unpriceable',
      stabilisationState:'early',
      bounceState:'attempt',
      pullbackZone:'near_20ma',
      volumeState:'normal'
    }, {
      finalVerdict:'Watch',
      structuralState:'developing',
      actionStateKey:'recalculate_plan',
      planStatusKey:'valid',
      tradeabilityVerdict:'Watch',
      blockerReason:'RR is not good enough.',
      reasonSummary:'RR is not good enough.',
      terminal:false,
      baseVerdict:'watch'
    })
  });
  const lowRrDerived = lowRrPlan.debug && lowRrPlan.debug.derivedStates || {};
  const lowRrDiagnostics = lowRrDerived.priceabilityReconciliationDiagnostics || {};
  if(lowRrDerived.priceabilityState === 'priceable' || lowRrDerived.priceabilityReconciledFromPlan === true){
    throw new Error('Low-RR valid plan must not reconcile stale unpriceable to priceable.');
  }
  if(!Array.isArray(lowRrDiagnostics.failedChecks) || !lowRrDiagnostics.failedChecks.includes('rrOk')){
    throw new Error('Low-RR failed reconciliation must expose rrOk as the failed diagnostic check.');
  }
  if(lowRrPlan.entryGatePass === true){
    throw new Error('Low-RR valid plan must not force Entry promotion.');
  }
  if(lowRrPlan.nearEntryGatePass === true || lowRrPlan.canonicalVerdict === 'near_entry'){
    throw new Error('Calculable but unusable low RR must not promote to Near Entry.');
  }
  const lowRrNearChecks = lowRrPlan.debug && lowRrPlan.debug.nearEntryGateChecks || {};
  if(lowRrNearChecks.rr_priceable !== false){
    throw new Error('Low-RR Near Entry gate must require usable RR, not merely calculable RR.');
  }
  if(lowRrNearChecks.has_priceable_plan === true || lowRrNearChecks.has_provisional_priceable_plan === true){
    throw new Error('Low-RR plan must not be exposed as priceable or provisionally priceable.');
  }

  const missingPlan = pipeline.resolveRecordState({
    ticker:'NOPLAN',
    in_watchlist:true,
    plan:{},
    marketData:{price:50, currency:'GBP'}
  }, {
    log:false,
    deps:depsFor({
      structureState:'intact',
      trendState:'intact',
      stabilisationState:'early',
      bounceState:'attempt',
      pullbackZone:'near_20ma',
      volumeState:'normal'
    }, {
      finalVerdict:'Watch',
      structuralState:'developing',
      actionStateKey:'recalculate_plan',
      planStatusKey:'missing',
      tradeabilityVerdict:'Watch',
      blockerReason:'Plan not ready.',
      reasonSummary:'Pre-watchlist setup.',
      terminal:false,
      baseVerdict:'watch'
    })
  });
  if(missingPlan.planVisible !== false || missingPlan.planStatus !== 'missing' || missingPlan.canonicalVerdict !== 'watch' || missingPlan.visualBucket !== 'monitor'){
    throw new Error('Missing plan must produce planVisible:false and safe Watch/Monitor output.');
  }
  if((missingPlan.debug && missingPlan.debug.derivedStates && missingPlan.debug.derivedStates.priceabilityState) === 'priceable'){
    throw new Error('Missing plan must not reconcile unpriceable state to priceable.');
  }

  const aaStyleWeakWatch = pipeline.resolveRecordState({
    ticker:'AAX',
    in_watchlist:true,
    plan:{},
    marketData:{price:62.53, ma20:64.88, ma50:65.22, ma200:49.32, currency:'USD'},
    setup:{volumeRequired:false}
  }, {
    log:false,
    deps:depsFor({
      structureState:'developing_clean',
      trendState:'developing_clean',
      setupLocationState:'near_50ma',
      priceabilityState:'unpriceable',
      stabilisationState:'early',
      bounceState:'attempt',
      pullbackZone:'near_50ma',
      volumeState:'normal'
    }, {
      finalVerdict:'Watch',
      structuralState:'developing',
      actionStateKey:'recalculate_plan',
      planStatusKey:'missing',
      tradeabilityVerdict:'Watch',
      blockerReason:'No valid invalidation level is available.',
      reasonSummary:'No valid invalidation level is available.',
      terminal:false,
      baseVerdict:'watch'
    }, 2)
  });
  const aaDiagnostics = aaStyleWeakWatch.debug && aaStyleWeakWatch.debug.pipelineDiagnostics || {};
  if(aaStyleWeakWatch.canonicalVerdict !== 'watch'){
    throw new Error('AA-style failed-reclaim setup must remain canonical Watch, not terminal Avoid.');
  }
  if(aaStyleWeakWatch.visualBucket !== 'diminishing' || aaStyleWeakWatch.tone !== 'diminishing'){
    throw new Error('AA-style failed-reclaim setup must render weak-watch/diminishing nuance outside Scan too.');
  }
  if(!Array.isArray(aaStyleWeakWatch.weakWatchDowngradeReasons) || !aaStyleWeakWatch.weakWatchDowngradeReasons.includes('below_50_without_reclaim') || !aaStyleWeakWatch.weakWatchDowngradeReasons.includes('no_reclaim_signals')){
    throw new Error('AA-style failed-reclaim diagnostics must infer no-reclaim evidence from below50WithoutReclaim even when explicit reclaim counts are absent.');
  }
  if(/needs confirmation before promotion/i.test(String(aaStyleWeakWatch.mainBlocker || ''))){
    throw new Error('AA-style weak-watch output must not use clean Monitor promotion copy.');
  }

  const invalidManualPlan = pipeline.resolveRecordState({
    ticker:'BADMANUAL',
    in_watchlist:true,
    plan:{entry:100, stop:103, firstTarget:110, source:'manual'},
    marketData:{price:99.5, ma20:100, ma50:94, ma200:80, currency:'GBP'},
    setup:{volumeRequired:false}
  }, {
    log:false,
    deps:depsFor({
      structureState:'developing_clean',
      trendState:'intact',
      setupLocationState:'near_20ma',
      priceabilityState:'unpriceable',
      stabilisationState:'early',
      bounceState:'attempt',
      pullbackZone:'near_20ma',
      volumeState:'normal'
    }, {
      finalVerdict:'Watch',
      structuralState:'developing',
      actionStateKey:'recalculate_plan',
      planStatusKey:'invalid',
      tradeabilityVerdict:'Watch',
      blockerReason:'Plan needs adjustment.',
      reasonSummary:'Plan needs adjustment.',
      terminal:false,
      baseVerdict:'watch'
    })
  });
  const invalidManualDerived = invalidManualPlan.debug && invalidManualPlan.debug.derivedStates || {};
  if(invalidManualPlan.planStatus === 'valid' || invalidManualDerived.priceabilityState === 'priceable' || invalidManualPlan.nearEntryGatePass === true || invalidManualPlan.entryGatePass === true){
    throw new Error('Invalid manual/draft plan must not force priceability or promotion.');
  }

  const strongExtendedPriceable = pipeline.resolveRecordState({
    ticker:'DINOX',
    in_watchlist:true,
    plan:{entry:62.73, stop:56.58, firstTarget:81.19},
    marketData:{price:71.08, ma20:61, ma50:57, ma200:45, currency:'GBP'},
    setup:{volumeRequired:false}
  }, {
    log:false,
    deps:depsFor({
      structureState:'strong',
      trendState:'intact',
      setupLocationState:'extended',
      priceabilityState:'priceable',
      stabilisationState:'early',
      bounceState:'attempt',
      pullbackZone:'extended',
      volumeState:'supportive'
    }, {
      finalVerdict:'Watch',
      structuralState:'developing',
      actionStateKey:'wait_for_confirmation',
      planStatusKey:'valid',
      tradeabilityVerdict:'Watch',
      blockerReason:'Target is optimistic for current structure.',
      reasonSummary:'Strong trend, but no clean pullback entry yet.',
      terminal:false,
      baseVerdict:'watch'
    })
  });
  const dinoResolved = strongExtendedPriceable.debug && strongExtendedPriceable.debug.resolvedState || {};
  if(strongExtendedPriceable.canonicalVerdict !== 'watch' || strongExtendedPriceable.planStatus !== 'valid'){
    throw new Error('Strong extended mathematically priceable setup must remain canonical Watch with valid plan status.');
  }
  if(dinoResolved.priceability_state === 'unpriceable'){
    throw new Error('Strong extended setup with valid plan math must not be labelled mathematically unpriceable.');
  }
  if(strongExtendedPriceable.visualBucket !== 'monitor' || strongExtendedPriceable.tone !== 'monitor'){
    throw new Error('Strong extended mathematically priceable setup without deterioration must remain Monitor Watch.');
  }
  if(strongExtendedPriceable.entryGatePass !== false || strongExtendedPriceable.nearEntryGatePass !== false){
    throw new Error('Strong extended mathematically priceable setup must not pass Entry/Near Entry gates.');
  }
  if(dinoResolved.rejected_by_viability_gate === true || dinoResolved.lifecycle === 'drop'){
    throw new Error('Strong extended mathematically priceable setup must not become terminal Avoid/Dead.');
  }
  if(/weakening|broken|missing plan|no actionable plan/i.test(String(strongExtendedPriceable.mainBlocker || dinoResolved.reason || '')) || !/extended|low-risk|pullback|optimistic|safe entry/i.test(String(strongExtendedPriceable.mainBlocker || dinoResolved.reason || ''))){
    throw new Error('Strong extended mathematically priceable setup reason must reference extension/strategy fit, not missing math or weakening structure.');
  }

  const amznDiminishingWatch = pipeline.resolveRecordState({
    ticker:'AMZNX',
    in_watchlist:true,
    plan:{},
    marketData:{price:190, ma20:184, ma50:175, ma200:145, currency:'USD'},
    setup:{volumeRequired:false}
  }, {
    log:false,
    deps:depsFor({
      structureState:'strong',
      trendState:'intact',
      setupLocationState:'none',
      priceabilityState:'unpriceable',
      stabilisationState:'none',
      bounceState:'none',
      pullbackZone:'none',
      volumeState:'normal'
    }, {
      finalVerdict:'Watch',
      structuralState:'developing',
      actionStateKey:'wait_for_confirmation',
      planStatusKey:'missing',
      tradeabilityVerdict:'Watch',
      blockerReason:'No bounce confirmation yet.',
      reasonSummary:'No bounce confirmation yet.',
      terminal:false,
      baseVerdict:'watch'
    }, 3)
  });
  const amznResolved = amznDiminishingWatch.debug && amznDiminishingWatch.debug.resolvedState || {};
  if(amznDiminishingWatch.canonicalVerdict !== 'watch' || amznDiminishingWatch.entryGatePass !== false || amznDiminishingWatch.nearEntryGatePass !== false){
    throw new Error('AMZN-style poor setup must remain canonical Watch and fail Entry/Near Entry gates.');
  }
  if(amznResolved.terminal_avoid_applied === true || amznResolved.rejected_by_viability_gate === true){
    throw new Error('AMZN-style poor setup must not become terminal Avoid.');
  }
  if(amznDiminishingWatch.visualBucket !== 'monitor' || amznDiminishingWatch.tone !== 'monitor' || amznDiminishingWatch.badgeLabel !== 'Watch'){
    throw new Error('Alive but non-actionable poor setup must remain Monitor Watch unless structural deterioration is present.');
  }
  if(/^\s*No bounce confirmation yet\.?\s*$/i.test(String(amznDiminishingWatch.mainBlocker || '')) || !/no usable pullback|too extended|price reliably|cleaner reset|support/i.test(String(amznDiminishingWatch.mainBlocker || ''))){
    throw new Error('AMZN-style poor setup copy must explain pullback/priceability quality, not only bounce confirmation.');
  }
  const amznLifecycleCopy = [
    amznResolved.main_blocker,
    amznResolved.reason,
    amznResolved.downgrade_reason
  ].join(' | ');
  if(/^\s*(No bounce confirmation yet\.?\s*\|?\s*)+$/i.test(amznLifecycleCopy) || !/no usable pullback|too extended|price reliably|cleaner reset|support|not priceable/i.test(amznLifecycleCopy)){
    throw new Error('AMZN-style lifecycle/downgrade copy must prefer setup quality or priceability wording over bounce-only wording.');
  }

  const developingWatch = pipeline.resolveRecordState({
    ticker:'DEVWATCH',
    in_watchlist:true,
    plan:{},
    marketData:{price:99, ma20:100, ma50:94, ma200:80, currency:'USD'},
    setup:{volumeRequired:false}
  }, {
    log:false,
    deps:depsFor({
      structureState:'intact',
      trendState:'intact',
      setupLocationState:'usable_pullback',
      priceabilityState:'provisional',
      stabilisationState:'early',
      bounceState:'attempt',
      pullbackZone:'near_20ma',
      volumeState:'normal'
    }, {
      finalVerdict:'Watch',
      structuralState:'developing',
      actionStateKey:'wait_for_confirmation',
      planStatusKey:'missing',
      tradeabilityVerdict:'Watch',
      blockerReason:'Bounce is developing but not confirmed.',
      reasonSummary:'Waiting for confirmation.',
      terminal:false,
      baseVerdict:'watch'
    }, 6)
  });
  if(developingWatch.canonicalVerdict !== 'watch' || developingWatch.visualBucket !== 'monitor' || developingWatch.tone !== 'monitor' || developingWatch.badgeLabel !== 'Watch'){
    throw new Error('Developing constructive Watch must remain Monitor tone with Watch badge.');
  }
  if(/no usable pullback|too extended|price reliably|cleaner reset|support|not priceable/i.test(String(developingWatch.mainBlocker || ''))){
    throw new Error('Developing constructive Watch must not inherit Diminishing Watch pullback/priceability copy.');
  }

  const constructiveWaitingWatch = pipeline.resolveRecordState({
    ticker:'CTVAX',
    in_watchlist:true,
    plan:{entry:82.17, stop:79.42, firstTarget:90.41},
    marketData:{price:82.1, ma20:80, ma50:76, ma200:65, currency:'USD'},
    setup:{volumeRequired:false}
  }, {
    log:false,
    deps:depsFor({
      structureState:'strong',
      trendState:'intact',
      setupLocationState:'none',
      priceabilityState:'priceable',
      stabilisationState:'none',
      bounceState:'attempt',
      pullbackZone:'none',
      volumeState:'supportive'
    }, {
      finalVerdict:'Watch',
      structuralState:'developing',
      actionStateKey:'wait_for_confirmation',
      planStatusKey:'valid',
      tradeabilityVerdict:'Watch',
      blockerReason:'Needs confirmation before promotion.',
      reasonSummary:'Bounce still tentative.',
      terminal:false,
      baseVerdict:'watch'
    }, 9)
  });
  if(constructiveWaitingWatch.canonicalVerdict !== 'watch' || constructiveWaitingWatch.visualBucket !== 'monitor' || constructiveWaitingWatch.tone !== 'monitor' || constructiveWaitingWatch.badgeLabel !== 'Watch'){
    throw new Error('Constructive waiting Watch with valid plan and bounce attempt must remain Monitor, not Diminishing.');
  }
  if(/diminish|weakening|no usable pullback|too extended|not priceable/i.test(String(constructiveWaitingWatch.mainBlocker || ''))){
    throw new Error('Constructive waiting Watch must not inherit deterioration or unpriceable copy.');
  }

  const constructiveUnpriceableWaitingWatch = pipeline.resolveRecordState({
    ticker:'MARX',
    in_watchlist:true,
    plan:{},
    marketData:{price:260, ma20:255, ma50:245, ma200:220, currency:'USD'},
    setup:{volumeRequired:false}
  }, {
    log:false,
    deps:depsFor({
      structureState:'strong',
      trendState:'intact',
      setupLocationState:'usable_pullback',
      priceabilityState:'unpriceable',
      stabilisationState:'early',
      bounceState:'attempt',
      pullbackZone:'near_20ma',
      volumeState:'supportive'
    }, {
      finalVerdict:'Watch',
      structuralState:'developing',
      actionStateKey:'wait_for_confirmation',
      planStatusKey:'missing',
      tradeabilityVerdict:'Watch',
      blockerReason:'Needs confirmation before promotion.',
      reasonSummary:'Bounce still tentative.',
      terminal:false,
      baseVerdict:'watch'
    }, 9)
  });
  if(constructiveUnpriceableWaitingWatch.canonicalVerdict !== 'watch' || constructiveUnpriceableWaitingWatch.visualBucket !== 'monitor' || constructiveUnpriceableWaitingWatch.tone !== 'monitor' || constructiveUnpriceableWaitingWatch.badgeLabel !== 'Watch'){
    throw new Error('Constructive high-score Watch must not become Diminishing solely because priceability is currently unpriceable.');
  }
  if(constructiveUnpriceableWaitingWatch.entryGatePass !== false || constructiveUnpriceableWaitingWatch.nearEntryGatePass !== false){
    throw new Error('Constructive unpriceable Watch must still fail Entry/Near Entry gates.');
  }
  if((constructiveUnpriceableWaitingWatch.debug && constructiveUnpriceableWaitingWatch.debug.derivedStates && constructiveUnpriceableWaitingWatch.debug.derivedStates.priceabilityState) === 'priceable'){
    throw new Error('Missing effective plan must not reconcile constructive unpriceable Watch to priceable.');
  }

  const weakLowScoreUnpriceableWatchRecord = {
    ticker:'AAW2',
    in_watchlist:true,
    plan:{},
    marketData:{price:62.53, ma20:64.88, ma50:65.22, ma200:49.32, currency:'USD'},
    setup:{volumeRequired:false}
  };
  const weakLowScoreUnpriceableWatchDeps = depsFor({
    structureState:'developing_clean',
    trendState:'intact',
    setupLocationState:'near_50ma',
    priceabilityState:'unpriceable',
    stabilisationState:'early',
    bounceState:'attempt',
    pullbackZone:'near_50ma',
    volumeState:'normal'
  }, {
    finalVerdict:'Watch',
    structuralState:'developing',
    structure_eligibility:'alive',
    structure_state:'developing_clean',
    actionStateKey:'wait_for_confirmation',
    planStatusKey:'missing',
    tradeabilityVerdict:'Watch',
    blockerReason:'No valid invalidation level is available.',
    reasonSummary:'Bounce still tentative.',
    terminal:false,
    baseVerdict:'watch',
    entry_gate_checks:{
      below_50_without_reclaim:true,
      has_clear_invalidation_level:false,
      plan_ok:false,
      tradeability_ok:false,
      rr_ok:false,
      rr_priceable:false,
      resolved_rr:null
    },
    near_entry_gate_checks:{
      below_50_without_reclaim:true,
      has_clear_invalidation_level:false,
      plan_ok:false,
      tradeability_ok:false,
      rr_priceable:false,
      resolved_rr:null
    },
    viabilityInputs:{
      planValid:false,
      tradeabilityOk:false,
      rrOk:false,
      below50WithoutReclaim:true
    },
    viability:'watchlist',
    viabilityBranchId:'alive_watchlist'
  }, 2);
  const weakLowScoreSurfaces = ['scan', 'track', 'review'].map(surface => pipeline.resolveRecordState(
    weakLowScoreUnpriceableWatchRecord,
    {
      surface,
      log:false,
      deps:weakLowScoreUnpriceableWatchDeps
    }
  ));
  if(weakLowScoreSurfaces.some(result => result.canonicalVerdict !== 'watch' || result.visualBucket !== 'diminishing' || result.tone !== 'diminishing')){
    throw new Error('Alive near_50ma low-score unpriceable Watch must render as Diminishing across scan, track, and review.');
  }
  if(weakLowScoreSurfaces.some(result => result.weakWatchDiminishingApplied !== true || !String(result.weakWatchDiminishingReason || '').includes('unpriceable') || !String(result.weakWatchDiminishingReason || '').includes('low_score') || !String(result.weakWatchDiminishingReason || '').includes('missing_plan') || !String(result.weakWatchDiminishingReason || '').includes('below50_no_reclaim') || !String(result.weakWatchDiminishingReason || '').includes('invalid_rr'))){
    throw new Error('Alive near_50ma low-score unpriceable Watch must propagate the derived weak-watch diminishing reason through the simplified pipeline.');
  }
  if(weakLowScoreSurfaces.some(result => !result.weakWatchDiminishingTrace || result.weakWatchDiminishingTrace.applied !== true || result.weakWatchDiminishingTrace.evaluatedBeforeFinalMonitorFallback !== true || !Array.isArray(result.weakWatchDiminishingTrace.triggerTokens))){
    throw new Error('Alive near_50ma low-score unpriceable Watch must expose a structured weak-watch diminishing trace.');
  }
  if(weakLowScoreSurfaces.some(result => result.weakWatchDiminishingTrace.priceabilityState !== 'unpriceable' || result.weakWatchDiminishingTrace.priceabilityUnpriceable !== true || result.weakWatchDiminishingTrace.returnPath !== 'weak_watch_diminishing')){
    throw new Error('Alive near_50ma low-score unpriceable Watch must use the normalized unpriceable priceability source and the weak_watch_diminishing return path.');
  }

  const lngStyleWeakWatchRecord = {
    ticker:'LNGX',
    in_watchlist:true,
    plan:{},
    marketData:{price:52.1, ma20:54.8, ma50:56.4, ma200:45.2, currency:'USD'},
    setup:{volumeRequired:false}
  };
  const lngStyleWeakWatchDeps = depsFor({
    structureState:'intact',
    trendState:'intact',
    setupLocationState:'extended',
    priceabilityState:'unpriceable',
    stabilisationState:'early',
    bounceState:'attempt',
    pullbackZone:'extended',
    volumeState:'normal'
  }, {
    finalVerdict:'Watch',
    structuralState:'developing',
    actionStateKey:'wait_for_confirmation',
    planStatusKey:'missing',
    tradeabilityVerdict:'Watch',
    blockerReason:'Watch - strong trend, but no clean pullback entry yet.',
    reasonSummary:'Watch - strong trend, but no clean pullback entry yet.',
    terminal:false,
    baseVerdict:'watch',
    entry_gate_checks:{
      below_50_without_reclaim:true,
      has_clear_invalidation_level:false,
      plan_ok:false,
      tradeability_ok:false,
      rr_ok:false,
      rr_priceable:false,
      resolved_rr:null,
      reclaim_signal_count:0
    },
    near_entry_gate_checks:{
      below_50_without_reclaim:true,
      has_clear_invalidation_level:false,
      plan_ok:false,
      tradeability_ok:false,
      rr_ok:false,
      rr_priceable:false,
      resolved_rr:null,
      reclaim_signal_count:0
    },
    viabilityInputs:{
      planValid:false,
      tradeabilityOk:false,
      rrOk:false,
      below50WithoutReclaim:true
    },
    viability:'watchlist',
    viabilityBranchId:'alive_watchlist'
  }, 4);
  const lngStyleWeakWatchSurfaces = ['scan', 'track', 'review'].map(surface => pipeline.resolveRecordState(
    lngStyleWeakWatchRecord,
    {
      surface,
      log:false,
      deps:lngStyleWeakWatchDeps
    }
  ));
  if(lngStyleWeakWatchSurfaces.some(result => result.canonicalVerdict !== 'watch' || result.visualBucket !== 'diminishing' || result.tone !== 'diminishing')){
    throw new Error('LNG-style alive extended unpriceable Watch must render as Diminishing across scan, track, and review.');
  }
  if(lngStyleWeakWatchSurfaces.some(result => result.weakWatchDiminishingApplied !== true || !String(result.weakWatchDiminishingReason || '').includes('unpriceable') || !String(result.weakWatchDiminishingReason || '').includes('missing_plan') || !String(result.weakWatchDiminishingReason || '').includes('below50_no_reclaim'))){
    throw new Error('LNG-style alive extended unpriceable Watch must apply the weak-watch diminishing guard with the expected reason tokens.');
  }
  if(lngStyleWeakWatchSurfaces.some(result => !result.mainBlocker || /strong trend, but no clean pullback entry yet/i.test(result.mainBlocker) || /price is too extended/i.test(result.mainBlocker))){
    throw new Error('LNG-style alive extended unpriceable Watch must use reclaim / safe-entry diminishing copy, not constructive strong-trend copy.');
  }
  if(lngStyleWeakWatchSurfaces.some(result => !result.weakWatchDiminishingTrace || result.weakWatchDiminishingTrace.applied !== true || result.weakWatchDiminishingTrace.returnPath !== 'weak_watch_diminishing')){
    throw new Error('LNG-style alive extended unpriceable Watch must commit the weak-watch diminishing trace before monitor fallback.');
  }

  const weakWatchReasonDeps = {
    resolveGlobalVerdict(){
      return {
        structure_eligibility:'alive',
        viability:'watchlist',
        viabilityBranchId:'alive_watchlist',
        setup_location_state:'near_50ma',
        priceability_state:'unpriceable',
        entry_gate_pass:false,
        near_entry_gate_pass:false,
        entry_gate_checks:{
          below_50_without_reclaim:false,
          has_clear_invalidation_level:false,
          plan_ok:false,
          tradeability_ok:false,
          rr_ok:false,
          rr_priceable:false,
          resolved_rr:null
        },
        near_entry_gate_checks:{
          below_50_without_reclaim:false,
          has_clear_invalidation_level:false,
          plan_ok:false,
          tradeability_ok:false,
          rr_ok:false,
          rr_priceable:false,
          resolved_rr:null
        },
        final_verdict:'watch',
        main_blocker:'No valid invalidation level is available.'
      };
    },
    getBadge:resolverCore.getBadge,
    normalizeGlobalVerdictKey:resolverCore.normalizeGlobalVerdictKey,
    normalizeVerdict:resolverCore.normalizeVerdict
  };

  const bounceAttemptOnlyVisual = resolverPresentation.resolveVisualState({
    ticker:'ATMBR',
    plan:{},
    marketData:{price:66.53, ma20:64.88, ma50:65.22, ma200:49.32, currency:'USD'}
  }, 'review', {
    derivedStates:{
      structureState:'developing_clean',
      setupLocationState:'near_50ma',
      priceabilityState:'unpriceable',
      stabilisationState:'early',
      bounceState:'attempt',
      pullbackZone:'near_50ma'
    },
    effectivePlan:{},
    displayedPlan:{status:'missing'},
    resolvedContract:{
      finalVerdict:'watch',
      final_verdict:'watch',
      final_verdict_rendered:'watch',
      planStatusKey:'missing',
      entry_gate_checks:{
        below_50_without_reclaim:false,
        has_clear_invalidation_level:true,
        plan_ok:true,
        tradeability_ok:true,
        rr_ok:true,
        rr_priceable:true,
        resolved_rr:2.2,
        reclaim_signal_count:1
      },
      near_entry_gate_checks:{
        below_50_without_reclaim:false,
        has_clear_invalidation_level:true,
        plan_ok:true,
        tradeability_ok:true,
        rr_ok:true,
        rr_priceable:true,
        resolved_rr:2.2,
        reclaim_signal_count:1
      }
    },
    setupScore:2
  }, weakWatchReasonDeps);
  if(bounceAttemptOnlyVisual.canonicalVerdict !== 'watch' || bounceAttemptOnlyVisual.visualBucket !== 'diminishing' || bounceAttemptOnlyVisual.tone !== 'diminishing'){
    throw new Error('Bounce-attempt-only weak Watch must render as Diminishing.');
  }
  if(!String(bounceAttemptOnlyVisual.weakWatchDiminishingReason || '').includes('bounce_attempt_only') || /below50_no_reclaim/.test(bounceAttemptOnlyVisual.weakWatchDiminishingReason || '')){
    throw new Error('Bounce-attempt-only weak Watch must use the bounce_attempt_only reason token without claiming below50_no_reclaim.');
  }
  if(!bounceAttemptOnlyVisual.weakWatchDiminishingTrace || !Array.isArray(bounceAttemptOnlyVisual.weakWatchDiminishingTrace.triggerTokens) || !bounceAttemptOnlyVisual.weakWatchDiminishingTrace.triggerTokens.includes('bounce_attempt_only') || bounceAttemptOnlyVisual.weakWatchDiminishingTrace.evaluatedBeforeFinalMonitorFallback !== true){
    throw new Error('Bounce-attempt-only weak Watch must expose the bounce_attempt_only trace token before final monitor fallback.');
  }
  if(bounceAttemptOnlyVisual.weakWatchDiminishingTrace.priceabilityState !== 'unpriceable' || bounceAttemptOnlyVisual.weakWatchDiminishingTrace.priceabilityUnpriceable !== true || bounceAttemptOnlyVisual.weakWatchDiminishingTrace.returnPath !== 'weak_watch_diminishing'){
    throw new Error('Bounce-attempt-only weak Watch must resolve normalized unpriceable priceability before final monitor fallback.');
  }

  const noReclaimSignalsVisual = resolverPresentation.resolveVisualState({
    ticker:'NORECL',
    plan:{entry:100, stop:97, firstTarget:106},
    marketData:{price:99.5, ma20:100, ma50:94, ma200:80, currency:'GBP'}
  }, 'review', {
    derivedStates:{
      structureState:'developing_clean',
      setupLocationState:'near_50ma',
      priceabilityState:'unpriceable',
      stabilisationState:'early',
      bounceState:'attempt',
      pullbackZone:'near_50ma'
    },
    effectivePlan:{entry:100, stop:97, firstTarget:106},
    displayedPlan:{status:'valid'},
    resolvedContract:{
      finalVerdict:'watch',
      final_verdict:'watch',
      final_verdict_rendered:'watch',
      planStatusKey:'missing',
      entry_gate_checks:{
        below_50_without_reclaim:false,
        has_clear_invalidation_level:true,
        plan_ok:false,
        tradeability_ok:true,
        rr_ok:true,
        rr_priceable:true,
        resolved_rr:2.4,
        reclaim_signal_count:0
      },
      near_entry_gate_checks:{
        below_50_without_reclaim:false,
        has_clear_invalidation_level:true,
        plan_ok:false,
        tradeability_ok:true,
        rr_ok:true,
        rr_priceable:true,
        resolved_rr:2.4,
        reclaim_signal_count:0
      }
    },
    setupScore:2
  }, weakWatchReasonDeps);
  if(noReclaimSignalsVisual.canonicalVerdict !== 'watch' || noReclaimSignalsVisual.visualBucket !== 'diminishing' || noReclaimSignalsVisual.tone !== 'diminishing'){
    throw new Error('No-reclaim-signals weak Watch must render as Diminishing.');
  }
  if(!String(noReclaimSignalsVisual.weakWatchDiminishingReason || '').includes('no_reclaim_signals') || /below50_no_reclaim/.test(noReclaimSignalsVisual.weakWatchDiminishingReason || '')){
    throw new Error('No-reclaim-signals weak Watch must use the no_reclaim_signals reason token without claiming below50_no_reclaim.');
  }
  if(!noReclaimSignalsVisual.weakWatchDiminishingTrace || !Array.isArray(noReclaimSignalsVisual.weakWatchDiminishingTrace.triggerTokens) || !noReclaimSignalsVisual.weakWatchDiminishingTrace.triggerTokens.includes('no_reclaim_signals') || noReclaimSignalsVisual.weakWatchDiminishingTrace.returnPath !== 'weak_watch_diminishing'){
    throw new Error('No-reclaim-signals weak Watch must expose the no_reclaim_signals trace token before final monitor fallback.');
  }

  const invalidRrVisual = resolverPresentation.resolveVisualState({
    ticker:'INVRR',
    plan:{entry:100, stop:97, firstTarget:106},
    marketData:{price:99.5, ma20:100, ma50:94, ma200:80, currency:'GBP'}
  }, 'review', {
    derivedStates:{
      structureState:'developing_clean',
      setupLocationState:'near_50ma',
      priceabilityState:'unpriceable',
      stabilisationState:'early',
      bounceState:'confirmed',
      pullbackZone:'near_50ma'
    },
    effectivePlan:{entry:100, stop:97, firstTarget:106},
    displayedPlan:{status:'valid'},
    resolvedContract:{
      finalVerdict:'watch',
      final_verdict:'watch',
      final_verdict_rendered:'watch',
      planStatusKey:'valid',
      entry_gate_checks:{
        below_50_without_reclaim:false,
        has_clear_invalidation_level:true,
        plan_ok:true,
        tradeability_ok:true,
        rr_ok:false,
        rr_priceable:false,
        resolved_rr:1.4
      },
      near_entry_gate_checks:{
        below_50_without_reclaim:false,
        has_clear_invalidation_level:true,
        plan_ok:true,
        tradeability_ok:true,
        rr_ok:false,
        rr_priceable:false,
        resolved_rr:1.4
      }
    },
    setupScore:2
  }, weakWatchReasonDeps);
  if(invalidRrVisual.canonicalVerdict !== 'watch' || invalidRrVisual.visualBucket !== 'diminishing' || invalidRrVisual.tone !== 'diminishing'){
    throw new Error('Invalid-RR weak Watch must render as Diminishing.');
  }
  if(!String(invalidRrVisual.weakWatchDiminishingReason || '').includes('invalid_rr') || /below50_no_reclaim/.test(invalidRrVisual.weakWatchDiminishingReason || '')){
    throw new Error('Invalid-RR weak Watch must include the invalid_rr reason token and must not claim below50_no_reclaim.');
  }
  if(!invalidRrVisual.weakWatchDiminishingTrace || !Array.isArray(invalidRrVisual.weakWatchDiminishingTrace.triggerTokens) || !invalidRrVisual.weakWatchDiminishingTrace.triggerTokens.includes('invalid_rr') || invalidRrVisual.weakWatchDiminishingTrace.evaluatedBeforeFinalMonitorFallback !== true){
    throw new Error('Invalid-RR weak Watch must expose the invalid_rr trace token before final monitor fallback.');
  }
  if(invalidRrVisual.weakWatchDiminishingTrace.priceabilityState !== 'unpriceable' || invalidRrVisual.weakWatchDiminishingTrace.priceabilityUnpriceable !== true || invalidRrVisual.weakWatchDiminishingTrace.returnPath !== 'weak_watch_diminishing'){
    throw new Error('Invalid-RR weak Watch must resolve normalized unpriceable priceability before final monitor fallback.');
  }

  const constructiveNoPlanNoBounceWatch = pipeline.resolveRecordState({
    ticker:'MARLIVE',
    in_watchlist:true,
    plan:{},
    marketData:{price:350.83, ma20:340, ma50:325, ma200:290, currency:'USD'},
    setup:{volumeRequired:false}
  }, {
    log:false,
    deps:depsFor({
      structureState:'strong',
      trendState:'strong',
      setupLocationState:'none',
      priceabilityState:'',
      stabilisationState:'none',
      bounceState:'none',
      pullbackZone:'none',
      volumeState:'weak'
    }, {
      finalVerdict:'Watch',
      structuralState:'developing',
      actionStateKey:'recalculate_plan',
      planStatusKey:'missing',
      tradeabilityVerdict:'Watch',
      blockerReason:'No valid invalidation level is available.',
      reasonSummary:'No valid invalidation level is available. + Weak volume',
      terminal:false,
      baseVerdict:'watch'
    }, 8)
  });
  const marLiveResolved = constructiveNoPlanNoBounceWatch.debug && constructiveNoPlanNoBounceWatch.debug.resolvedState || {};
  if(constructiveNoPlanNoBounceWatch.canonicalVerdict !== 'watch' || constructiveNoPlanNoBounceWatch.visualBucket !== 'monitor' || constructiveNoPlanNoBounceWatch.tone !== 'monitor' || constructiveNoPlanNoBounceWatch.badgeLabel !== 'Watch'){
    throw new Error('Strong high-score Watch with missing plan/no bounce must remain Monitor unless deterioration evidence exists.');
  }
  if(marLiveResolved.viability !== 'watchlist' || marLiveResolved.rejected_by_viability_gate === true || marLiveResolved.terminal_avoid_applied === true){
    throw new Error('Strong high-score missing-plan Watch must remain non-terminal watchlist.');
  }
  if(constructiveNoPlanNoBounceWatch.entryGatePass !== false || constructiveNoPlanNoBounceWatch.nearEntryGatePass !== false){
    throw new Error('Strong high-score missing-plan Watch must still fail Entry/Near Entry gates.');
  }

  const weakeningWatch = pipeline.resolveRecordState({
    ticker:'DOWX',
    in_watchlist:true,
    plan:{entry:50, stop:47, firstTarget:59},
    marketData:{price:49.5, ma20:51, ma50:53, ma200:45, currency:'USD'},
    setup:{volumeRequired:false}
  }, {
    log:false,
    deps:depsFor({
      structureState:'weakening',
      trendState:'weak',
      setupLocationState:'off_level',
      priceabilityState:'priceable',
      stabilisationState:'none',
      bounceState:'none',
      pullbackZone:'none',
      volumeState:'normal'
    }, {
      finalVerdict:'Watch',
      structuralState:'developing',
      actionStateKey:'recalculate_plan',
      planStatusKey:'valid',
      tradeabilityVerdict:'Watch',
      blockerReason:'Trend is weakening - no reliable stop level yet.',
      reasonSummary:'Weakening setup - wait for recovery.',
      terminal:false,
      baseVerdict:'watch'
    }, 5)
  });
  if(weakeningWatch.canonicalVerdict !== 'watch' || weakeningWatch.visualBucket !== 'diminishing' || weakeningWatch.tone !== 'diminishing'){
    throw new Error('Weakening Watch must remain Diminishing.');
  }

  const fallingKnifeBreakdown = pipeline.resolveRecordState({
    ticker:'WLKX',
    in_watchlist:true,
    plan:{},
    marketData:{price:80, ma20:90, ma50:92, ma200:70, perf1w:-8.2, perf1m:-15.5, currency:'USD'},
    setup:{volumeRequired:false}
  }, {
    log:false,
    deps:depsFor({
      structureState:'weakening',
      trendState:'weak',
      setupLocationState:'volatile',
      priceabilityState:'unpriceable',
      stabilisationState:'none',
      bounceState:'none',
      pullbackZone:'none',
      volumeState:'weak'
    }, {
      finalVerdict:'Watch',
      structuralState:'developing',
      actionStateKey:'recalculate_plan',
      planStatusKey:'missing',
      tradeabilityVerdict:'Watch',
      blockerReason:'Trend is weakening - no reliable stop level yet.',
      reasonSummary:'Weakening setup - wait for recovery.',
      terminal:false,
      baseVerdict:'watch'
    }, 2)
  });
  const fallingKnifeResolved = fallingKnifeBreakdown.debug && fallingKnifeBreakdown.debug.resolvedState || {};
  const fallingKnifeText = [
    fallingKnifeBreakdown.mainBlocker,
    fallingKnifeResolved.main_blocker,
    fallingKnifeResolved.reason,
    fallingKnifeResolved.downgrade_reason
  ].join(' | ');
  if(fallingKnifeBreakdown.canonicalVerdict !== 'avoid' || fallingKnifeBreakdown.visualBucket !== 'avoid' || fallingKnifeBreakdown.tone !== 'avoid'){
    throw new Error('WLK-style falling-knife breakdown must render red Avoid on Review.');
  }
  if(fallingKnifeResolved.falling_knife_detected !== true || fallingKnifeResolved.semantic_blocker_code !== 'falling_knife' || !/falling_knife/i.test(String(fallingKnifeResolved.viabilityBranchId || ''))){
    throw new Error('WLK-style falling-knife breakdown must expose falling_knife reason diagnostics.');
  }
  if(!/Selling pressure is accelerating/i.test(fallingKnifeText) || /Trend is weakening - no reliable stop level yet/i.test(String(fallingKnifeBreakdown.mainBlocker || ''))){
    throw new Error('WLK-style falling-knife copy must replace soft weakening copy.');
  }

  const rangeBoundWeakening = pipeline.resolveRecordState({
    ticker:'EIXX',
    in_watchlist:true,
    plan:{},
    marketData:{price:98, ma20:100, ma50:97, ma200:72, perf1w:-1.4, perf1m:-4.2, currency:'USD'},
    setup:{volumeRequired:false}
  }, {
    log:false,
    deps:depsFor({
      structureState:'weakening',
      trendState:'weak',
      setupLocationState:'off_level',
      priceabilityState:'unpriceable',
      stabilisationState:'none',
      bounceState:'attempt',
      pullbackZone:'none',
      volumeState:'normal'
    }, {
      finalVerdict:'Watch',
      structuralState:'developing',
      actionStateKey:'recalculate_plan',
      planStatusKey:'missing',
      tradeabilityVerdict:'Watch',
      blockerReason:'Trend is weakening - no reliable stop level yet.',
      reasonSummary:'Weakening setup - wait for recovery.',
      terminal:false,
      baseVerdict:'watch'
    }, 4)
  });
  const rangeBoundResolved = rangeBoundWeakening.debug && rangeBoundWeakening.debug.resolvedState || {};
  if(rangeBoundWeakening.canonicalVerdict !== 'watch' || rangeBoundWeakening.visualBucket !== 'diminishing' || rangeBoundWeakening.tone !== 'diminishing'){
    throw new Error('EIX-style weak but range-bound setup must remain Diminishing Watch, not Avoid.');
  }
  if(rangeBoundResolved.falling_knife_detected === true || /Selling pressure is accelerating/i.test(String(rangeBoundWeakening.mainBlocker || ''))){
    throw new Error('Range-bound weakening must not trigger falling-knife copy.');
  }

  const brokenStructureAvoid = pipeline.resolveRecordState({
    ticker:'BWXTX',
    in_watchlist:true,
    plan:{},
    marketData:{price:55, ma20:65, ma50:70, ma200:80, perf1w:-7, perf1m:-18, currency:'USD'},
    setup:{volumeRequired:false}
  }, {
    log:false,
    deps:depsFor({
      structureState:'broken',
      trendState:'broken',
      setupLocationState:'volatile',
      priceabilityState:'unpriceable',
      stabilisationState:'none',
      bounceState:'none',
      pullbackZone:'none',
      volumeState:'weak'
    }, {
      finalVerdict:'Avoid',
      structuralState:'dead',
      actionStateKey:'recalculate_plan',
      planStatusKey:'missing',
      tradeabilityVerdict:'Avoid',
      blockerReason:'Structure is broken.',
      reasonSummary:'Structure is broken.',
      terminal:true,
      baseVerdict:'avoid'
    }, 1)
  });
  if(brokenStructureAvoid.canonicalVerdict !== 'avoid' || !/Structure is broken/i.test(String(brokenStructureAvoid.mainBlocker || ''))){
    throw new Error('Broken structural Avoid must retain stronger structure-broken copy.');
  }

  const volatileRecovery = pipeline.resolveRecordState({
    ticker:'TSLAX',
    in_watchlist:true,
    reclaimAttempt:true,
    reclaimsLevel:true,
    plan:{entry:250, stop:255, firstTarget:245},
    marketData:{price:260, ma20:230, ma50:220, ma200:180, currency:'USD'},
    setup:{volumeRequired:false}
  }, {
    log:false,
    deps:depsFor({
      structureState:'broken',
      trendState:'strong',
      setupLocationState:'volatile',
      priceabilityState:'unpriceable',
      stabilisationState:'none',
      bounceState:'attempt',
      pullbackZone:'extended',
      volumeState:'normal'
    }, {
      finalVerdict:'Avoid',
      structuralState:'dead',
      actionStateKey:'recalculate_plan',
      planStatusKey:'invalid',
      tradeabilityVerdict:'Avoid',
      blockerReason:'Structure is broken.',
      reasonSummary:'Structure is broken.',
      terminal:true,
      baseVerdict:'avoid'
    })
  });
  const volatileResolved = volatileRecovery.debug && volatileRecovery.debug.resolvedState || {};
  const volatileReasonText = [
    volatileRecovery.mainBlocker,
    volatileResolved.reason,
    volatileResolved.main_blocker,
    volatileResolved.semantic_blocker_reason
  ].join(' | ');
  if(volatileRecovery.entryGatePass !== false || volatileRecovery.nearEntryGatePass !== false){
    throw new Error('Volatile recovery setup must not pass Entry/Near Entry gates.');
  }
  if(/structure is broken|dead|terminal/i.test(volatileReasonText)){
    throw new Error('Volatile recovery setup must not display terminal broken/dead wording.');
  }
  if(!/volatile|recovery attempt|stabili[sz]e|price reliably|pullback/i.test(volatileReasonText)){
    throw new Error('Volatile recovery setup reason must mention volatility/recovery/stabilisation/priceability.');
  }
  if(volatileResolved.non_terminal_recovery_blocker !== true || !volatileResolved.semantic_blocker_code){
    throw new Error('Volatile recovery setup must expose semantic non-terminal blocker debug fields.');
  }

  const legacyAiSaysReady = pipeline.resolveRecordState({
    ticker:'AILEGACY',
    in_watchlist:true,
    plan:{},
    marketData:{price:50, ma20:52, ma50:55, ma200:40, currency:'GBP'},
    review:{
      analysisState:{
        normalized:{
          ai_observation_only:true,
          verdict:'Entry',
          final_verdict:'Entry',
          coach_summary:'Looks ready for entry from the AI text.'
        }
      }
    }
  }, {
    log:false,
    deps:depsFor({
      structureState:'weak',
      trendState:'weak',
      stabilisationState:'none',
      bounceState:'none',
      pullbackZone:'near_50ma',
      volumeState:'normal'
    }, {
      finalVerdict:'Watch',
      structuralState:'developing',
      actionStateKey:'recalculate_plan',
      planStatusKey:'missing',
      tradeabilityVerdict:'Watch',
      blockerReason:'No actionable plan yet.',
      reasonSummary:'Plan not ready.',
      terminal:false,
      baseVerdict:'watch'
    })
  });
  if(['entry','near_entry'].includes(legacyAiSaysReady.canonicalVerdict) || legacyAiSaysReady.entryGatePass !== false || legacyAiSaysReady.nearEntryGatePass !== false){
    throw new Error('Legacy AI verdict/readiness text must not promote weak/no-plan resolver state.');
  }
}

runSimplifiedPipelineAssertions();

function runAiContractAssertions(){
  const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const promptSource = extractFunctionSource(appSource, 'buildPromptBody');
  if(!/chart coach|observation and explanation only|deterministic resolver/i.test(promptSource)){
    throw new Error('AI prompt must frame the model as an observation-only chart coach.');
  }
  if(/verdict must be|app_verdict_ceiling|quality_score =|confidence_score =|Always propose entry/i.test(promptSource)){
    throw new Error('AI prompt must not request verdicts, app scores, readiness ceilings, or trade-plan authority.');
  }
  if(!/coach_summary|constructive_evidence|risk_evidence|what_needs_to_improve|ai_observation_only/i.test(promptSource)){
    throw new Error('AI prompt must request evidence/narrative fields.');
  }
  const normalizeSource = extractFunctionSource(appSource, 'normalizeAnalysisResponse');
  if(!/aiObservation|rawOpinion|final_verdict:''|ai_observation_only:true/i.test(normalizeSource)){
    throw new Error('AI ingestion must quarantine legacy verdict-like fields as non-authoritative observation data.');
  }
  const verifiedStatusSource = extractFunctionSource(appSource, 'chartVerificationIsVerifiedStatus');
  const allowsAiStatusSource = extractFunctionSource(appSource, 'chartVerificationAllowsAiAnalysisStatus');
  const chartDecisionClassNameSource = extractFunctionSource(appSource, 'chartDecisionClassName');
  const chartUiDecisionRenderSource = extractFunctionSource(appSource, 'chartVerificationUiDecision');
  const panelStateSource = extractFunctionSource(appSource, 'chartVerificationPanelState');
  const panelStateSandbox = {
    chartVerificationNumberOrNull(value){
      if(value === null || value === undefined || value === '') return null;
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    },
    isDailyTimeframe(value){
      return String(value || '').trim().toUpperCase() === '1D';
    }
  };
  vm.createContext(panelStateSandbox);
  vm.runInContext(verifiedStatusSource, panelStateSandbox, {filename:'app.js#chartVerificationIsVerifiedStatus'});
  vm.runInContext(allowsAiStatusSource, panelStateSandbox, {filename:'app.js#chartVerificationAllowsAiAnalysisStatus'});
  vm.runInContext(chartDecisionClassNameSource, panelStateSandbox, {filename:'app.js#chartDecisionClassName'});
  vm.runInContext('this.chartVerificationIsVerifiedStatus = chartVerificationIsVerifiedStatus; this.chartVerificationAllowsAiAnalysisStatus = chartVerificationAllowsAiAnalysisStatus;', panelStateSandbox);
  vm.runInContext(extractFunctionSource(appSource, 'chartVerificationSupportsNonBlockingIndicatorPartial'), panelStateSandbox, {filename:'app.js#chartVerificationSupportsNonBlockingIndicatorPartial'});
  vm.runInContext(extractFunctionSource(appSource, 'chartVerificationHasCoreIdentityMatch'), panelStateSandbox, {filename:'app.js#chartVerificationHasCoreIdentityMatch'});
  vm.runInContext(extractFunctionSource(appSource, 'chartVerificationHasPrimaryIndicatorSupport'), panelStateSandbox, {filename:'app.js#chartVerificationHasPrimaryIndicatorSupport'});
  vm.runInContext(extractFunctionSource(appSource, 'chartVerificationIsBlockedOrMismatchStatus'), panelStateSandbox, {filename:'app.js#chartVerificationIsBlockedOrMismatchStatus'});
  vm.runInContext(extractFunctionSource(appSource, 'chartVerificationBlockedDecisionVariant'), panelStateSandbox, {filename:'app.js#chartVerificationBlockedDecisionVariant'});
  vm.runInContext(extractFunctionSource(appSource, 'getStrategyRelevantMaRequirement'), panelStateSandbox, {filename:'app.js#getStrategyRelevantMaRequirement'});
  vm.runInContext(extractFunctionSource(appSource, 'normaliseVisibleTicker'), panelStateSandbox, {filename:'app.js#normaliseVisibleTicker'});
  vm.runInContext(chartUiDecisionRenderSource, panelStateSandbox, {filename:'app.js#chartVerificationUiDecision'});
  vm.runInContext(panelStateSource, panelStateSandbox, {filename:'app.js#chartVerificationPanelState'});
  const verifiedPanel = panelStateSandbox.chartVerificationPanelState(
    {key:'verified_match', title:'Chart verified', summary:'AI confirms the match.'},
    {status:'pending_chart_native_verification'},
    'queued',
    true,
    {type:'deterministic_pending'}
  );
  if(verifiedPanel.panelVariant !== 'verified' || verifiedPanel.visibleTitle !== 'Chart verified'){
    throw new Error('Verified chart panels must outrank queued quick-analysis placeholders.');
  }
  const immediateUncertainPanel = panelStateSandbox.chartVerificationPanelState(
    {key:'source_checking', title:'Chart uploaded - checking details', summary:'Chart source is valid. AI chart extraction is running.'},
    {status:'source_checking'},
    'queued',
    true,
    {type:'deterministic_pending'}
  );
  if(immediateUncertainPanel.panelVariant !== 'review' || immediateUncertainPanel.visibleTitle !== 'Chart uploaded - checking details'){
    throw new Error('Immediate source-checking states must outrank queued quick-analysis placeholders.');
  }
  const untrustedPanel = panelStateSandbox.chartVerificationPanelState(
    {key:'uncertain_match', title:'Chart verification incomplete', summary:'Could not independently verify this chart. Please inspect the image or upload a clearer chart.'},
    {status:'untrusted_context_mirror'},
    'running',
    true,
    {type:'post_ai_merged', phase:'merged'}
  );
  if(untrustedPanel.panelVariant !== 'untrusted' || untrustedPanel.visibleTitle !== 'Chart verification incomplete'){
    throw new Error('Untrusted merged chart panels must not render as verified.');
  }
  const unreadablePanel = panelStateSandbox.chartVerificationPanelState(
    {key:'unknown_chart_identity', title:'Could not verify chart identity', summary:'The ticker or price could not be read from the uploaded chart.'},
    {status:'unknown_chart_identity'},
    'committed',
    true,
    {type:'post_ai_merged', phase:'merged'}
  );
  if(unreadablePanel.panelVariant !== 'warning' || unreadablePanel.hasVerifiedTrace !== false || unreadablePanel.visibleTitle !== 'Could not verify chart identity'){
    throw new Error('Unreadable chart verification panels must render as warning/blocked, not generic review or verified.');
  }
  const staleSystemPanel = panelStateSandbox.chartVerificationPanelState(
    {key:'stale_state_detected', title:'Chart verification needs attention', summary:'The chart check could not be trusted because the chart source or verification state was inconsistent.'},
    {status:'stale_state_detected'},
    'committed',
    true,
    {type:'post_ai_merged', phase:'merged'}
  );
  if(staleSystemPanel.panelVariant !== 'warning' || staleSystemPanel.visibleTitle !== 'Chart verification needs attention'){
    throw new Error('Stale/system chart verification panels must render as warning/blocked, not generic review.');
  }
  const mismatchPanel = panelStateSandbox.chartVerificationPanelState(
    {key:'chart_mismatch', title:'Chart mismatch detected', summary:'AI analysis has been skipped because the uploaded chart does not appear to match this review.'},
    {status:'ticker_mismatch'},
    'committed',
    true,
    {type:'post_ai_merged', phase:'merged'}
  );
  if(mismatchPanel.panelVariant !== 'mismatch' || mismatchPanel.visibleTitle !== 'Chart mismatch detected'){
    throw new Error('Mismatch chart verification panels must stay on the mismatch variant.');
  }
  if(panelStateSandbox.chartVerificationIsVerifiedStatus('consistent')
    || panelStateSandbox.chartVerificationIsVerifiedStatus('partial_indicator_visibility')
    || panelStateSandbox.chartVerificationIsVerifiedStatus('mostly_verified')){
    throw new Error('Blocked chart-verification statuses must not be treated as verified by the shared UI helper.');
  }
  if(!panelStateSandbox.chartVerificationAllowsAiAnalysisStatus('verified_match')
    || !panelStateSandbox.chartVerificationAllowsAiAnalysisStatus('likely_match')
    || !panelStateSandbox.chartVerificationAllowsAiAnalysisStatus('user_confirmed_match')
    || panelStateSandbox.chartVerificationAllowsAiAnalysisStatus('consistent')
    || panelStateSandbox.chartVerificationAllowsAiAnalysisStatus('partial_indicator_visibility')){
    throw new Error('AI-analysis allowlist must stay narrower than general chart-review statuses.');
  }
  if(!chartUiDecisionRenderSource.includes("key:'partial_indicator_visibility'")
    || !chartUiDecisionRenderSource.includes('AI analysis has been skipped until you confirm this chart manually.')){
    throw new Error('Partial-indicator verification must stay blocked and explicitly require manual confirmation.');
  }
  const manualActionHelperSource = extractFunctionSource(appSource, 'chartVerificationRequiresManualAction');
  const manualBlockedMismatchSource = extractFunctionSource(appSource, 'chartVerificationIsBlockedOrMismatchStatus');
  const blockedDecisionVariantSource = extractFunctionSource(appSource, 'chartVerificationBlockedDecisionVariant');
  if(!manualActionHelperSource.includes("chartVerificationIsBlockedOrMismatchStatus(normalizedStatus)")
    || !manualActionHelperSource.includes("'pending_manual_confirmation'")
    || !manualBlockedMismatchSource.includes("'source_mismatch'")
    || !manualBlockedMismatchSource.includes("'stale_state_detected'")
    || !manualBlockedMismatchSource.includes("'verification_failed'")
    || !manualBlockedMismatchSource.includes("'unknown_chart_identity'")
    || !manualBlockedMismatchSource.includes("'insufficient_identity_evidence'")){
    throw new Error('Manual chart controls must use the shared blocked/manual helper for mismatch, unreadable, and source/stale/system states.');
  }
  if(!blockedDecisionVariantSource.includes("'chart_mismatch'")
    || !blockedDecisionVariantSource.includes("'unknown_chart_identity'")
    || !blockedDecisionVariantSource.includes("'verification_failed'")
    || !extractFunctionSource(appSource, 'chartVerificationPanelState').includes('const blockedDecisionVariant = chartVerificationBlockedDecisionVariant(key);')
    || !extractFunctionSource(appSource, 'chartVerificationPanelState').includes('|| !!blockedDecisionVariant')
    || !extractFunctionSource(appSource, 'chartVerificationPanelState').includes('panelVariant = blockedDecisionVariant;')){
    throw new Error('Chart verification panel state must use explicit blocked decision variants instead of falling back to generic review.');
  }
  const manualConfirmSource = extractFunctionSource(appSource, 'confirmReviewChartMatchesCurrentTicker');
  if(!manualConfirmSource.includes("phase:'verified'")
    || !manualConfirmSource.includes('manualConfirmed:true')
    || !manualConfirmSource.includes('[REVIEW_CHART_MANUAL_CONFIRM_PIPELINE]')
    || !manualConfirmSource.includes('runSimplifiedChartFullAnalysis(record, {')){
    throw new Error('Manual chart confirmation must promote the simplified pipeline first and then trigger a fresh AI analysis run.');
  }
  const handleChartSelectionSource = extractFunctionSource(appSource, 'handleChartSelection');
  if(!handleChartSelectionSource.includes("setActiveReviewTicker(symbol);")
    || !handleChartSelectionSource.includes("const matchingActiveRequest = activeRequest && normalizeTicker(activeRequest.ticker || '') === normalizeTicker(record.ticker || '')")
    || !handleChartSelectionSource.includes("renderReviewWorkspace({source:'chart_upload', requestedTicker:symbol || record.ticker});")
    || !handleChartSelectionSource.includes('record.review.chartAttachmentContext = {')
    || !handleChartSelectionSource.includes("console.info(previousImageId ? '[CHART_ATTACHMENT_REPLACED]' : '[CHART_ATTACHMENT_CREATED]'")){
    throw new Error('Second chart uploads must rebind Review ownership to the upload ticker and avoid inheriting another ticker request context.');
  }
  const lightboxSource = extractFunctionSource(appSource, 'openReviewChartLightbox');
  if(!lightboxSource.includes('const modalTicker = normalizeTicker(source.ticker || (attachmentContext && attachmentContext.expectedTicker) || item.ticker || \'\');')
    || !lightboxSource.includes('[CHART_MODAL_CONTEXT]')
    || !lightboxSource.includes('[CHART_UPLOAD_METADATA_MISMATCH]')
    || !lightboxSource.includes("ticker:modalTicker")){
    throw new Error('Chart lightbox must render attachment-bound ticker metadata and log mismatches.');
  }
  const displayedChartContextSource = extractFunctionSource(appSource, 'reviewDisplayedChartContext');
  const currentChartContextSource = extractFunctionSource(appSource, 'currentReviewChartContext');
  const sanitizeChartIdentitySource = extractFunctionSource(appSource, 'sanitizeChartAssessorVisibleIdentity');
  const explicitProvenanceVersionSource = extractFunctionSource(appSource, 'hasExplicitChartIdentityProvenanceVersion');
  const strictProvenanceVersionSource = extractFunctionSource(appSource, 'isStrictChartIdentityProvenanceAnalysis');
  if(!displayedChartContextSource.includes('imageId:String(previewRef && previewRef.imageId || chartImageIdForReview(safe) || \'\')')
    || !displayedChartContextSource.includes('filename:String(previewRef && previewRef.name || attachmentContext && attachmentContext.name || safe.chartRef && safe.chartRef.name || \'\')')){
    throw new Error('Displayed chart context must be derived from the same attachment object used by the renderer.');
  }
  if(!currentChartContextSource.includes('attachmentContext && attachmentContext.requestId')
    || !currentChartContextSource.includes('pipeline && pipeline.requestId')
    || !currentChartContextSource.includes('lifecycle && (lifecycle.requestId || lifecycle.verificationRequestId)')
    || !currentChartContextSource.includes("requestId = String(runtime.requestId || '');")){
    throw new Error('Current chart context must unify request ownership from attachment, pipeline, lifecycle, and runtime state.');
  }
  if(!sanitizeChartIdentitySource.includes('[CHART_ASSESSOR_VISIBLE_IDENTITY]')
    || !sanitizeChartIdentitySource.includes('[CHART_ASSESSOR_SANITIZER_MODE]')
    || !sanitizeChartIdentitySource.includes('[CHART_ASSESSOR_SANITIZED_OUTPUT]')
    || !sanitizeChartIdentitySource.includes('[CHART_ASSESSOR_VERSION_DOWNGRADE]')
    || !sanitizeChartIdentitySource.includes('[CHART_ASSESSOR_TRUSTED_CONTEXT]')
    || !sanitizeChartIdentitySource.includes('[CHART_ASSESSOR_FALLBACK_USED]')
    || !sanitizeChartIdentitySource.includes('[CHART_ASSESSOR_EXPECTED_VALUE_LEAK]')
    || !sanitizeChartIdentitySource.includes('[CHART_IDENTITY_EXTRACTION_UNREADABLE]')){
    throw new Error('Chart assessor identity sanitization must log visible identity, trusted context, fallback use, and unreadable cases.');
  }
  if(!extractFunctionSource(appSource, 'buildDeterministicChartVerification').includes('[CHART_IDENTITY_EVIDENCE_INSUFFICIENT]')
    || !extractFunctionSource(appSource, 'buildDeterministicChartVerification').includes('identityEvidenceInsufficient')){
    throw new Error('Deterministic chart verification must explicitly reject strict-sanitized blank identity as insufficient evidence.');
  }
  if(!explicitProvenanceVersionSource.includes('chartIdentityProvenanceVersion')
    || !strictProvenanceVersionSource.includes('>= 1')){
    throw new Error('Chart identity provenance strictness must depend on an explicit schema version, not implicit defaults.');
  }
  const beginReviewAiSource = extractFunctionSource(appSource, 'beginReviewAiAnalysis');
  const completeReviewAiSource = extractFunctionSource(appSource, 'completeReviewAiAnalysis');
  const failReviewAiSource = extractFunctionSource(appSource, 'failReviewAiAnalysis');
  if(!beginReviewAiSource.includes("runtime.source = String(options.source || '');")
    || !beginReviewAiSource.includes("runtime.chartImageId = String(options.chartImageId || '');")
    || !completeReviewAiSource.includes('runtime.lastCompletedRequestId = runtime.requestId;')
    || !failReviewAiSource.includes('runtime.lastCompletedRequestId = runtime.requestId;')){
    throw new Error('Review AI runtime must retain request source and image ownership metadata for duplicate-upload audits.');
  }
  const chartAiSummaryGuardSource = extractFunctionSource(appSource, 'chartAiSummaryRenderGuard');
  if(!chartAiSummaryGuardSource.includes("reason = 'quick_running'")
    || !chartAiSummaryGuardSource.includes("pipelinePhase === 'verifying'")){
    throw new Error('AI summary guard must block current rendering while simplified chart verification is still running for the same chart.');
  }
  const aiCommitGateSource = extractFunctionSource(appSource, 'canCommitAiSummaryForChart');
  if(!aiCommitGateSource.includes("!['uploading', 'verifying'].includes")
    || !aiCommitGateSource.includes('requestedImageId === pipelineImageId')
    || !aiCommitGateSource.includes('requestedRequestId === pipelineRequestId')){
    throw new Error('AI summary commit gate must require a terminal simplified pipeline state for the same ticker/image/request context.');
  }
  const pendingAiStageSource = extractFunctionSource(appSource, 'stagePendingAiSummaryForChart');
  if(!pendingAiStageSource.includes('setPendingChartAiSummary(item, stagedPayload);')
    || !pendingAiStageSource.includes('[AI_SUMMARY_COMMIT_BLOCKED_QUICK_RUNNING]')){
    throw new Error('Blocked AI summary commits must stage a pending payload instead of only logging.');
  }
  const flushPendingAiSource = extractFunctionSource(appSource, 'flushPendingAiSummaryForChart');
  if(!flushPendingAiSource.includes("reason:'pending_context_stale'")
    || !flushPendingAiSource.includes('canCommitAiSummaryForChart({')
    || !flushPendingAiSource.includes('applyCommittedAiSummaryForChart(item, pending)')
    || !flushPendingAiSource.includes('[AI_SUMMARY_PENDING_STATE]')
    || !flushPendingAiSource.includes('[AI_SUMMARY_FLUSH_ATTEMPT]')
    || !flushPendingAiSource.includes('[AI_SUMMARY_FLUSH_REJECTED]')
    || !flushPendingAiSource.includes('[AI_SUMMARY_FLUSH_COMMITTED]')){
    throw new Error('Pending AI summaries must flush only for the same chart context and reject stale uploads.');
  }
  const handleWorkspaceTabChangeSource = extractFunctionSource(appSource, 'handleWorkspaceTabChange');
  const reconcileVisibleReviewStateSource = extractFunctionSource(appSource, 'reconcileVisibleReviewState');
  const renderNeutralReviewPendingStateSource = extractFunctionSource(appSource, 'renderNeutralReviewPendingState');
  const refreshTrackOnlySource = extractFunctionSource(appSource, 'refreshTrackOnly');
  const chartVerificationAllowsAiAnalysisStatusSource = extractFunctionSource(appSource, 'chartVerificationAllowsAiAnalysisStatus');
  const confirmReviewChartMatchesCurrentTickerSource = extractFunctionSource(appSource, 'confirmReviewChartMatchesCurrentTicker');
  const analyseSetupGateSource = extractFunctionSource(appSource, 'analyseSetup');
  if(!refreshTrackOnlySource.includes('clearTrackPatchNoChangeFlags();')
    || !refreshTrackOnlySource.includes("console.info('[TrackPullRefresh]', {event:'riskRecalcSkipped', source, reason:'no_changed_inputs'});")
    || !refreshTrackOnlySource.includes('startupCoordinator.trackNeedsFullRender = false;')){
    throw new Error('No-change Track refreshes must clear stale dirty/full-render flags so Track refocus does not rerun unnecessarily.');
  }
  if(!chartVerificationAllowsAiAnalysisStatusSource.includes("['verified_match', 'likely_match', 'user_confirmed_match', 'manually_verified']")){
    throw new Error('Chart verification must define a narrow allowlist before AI setup analysis can start.');
  }
  if(!confirmReviewChartMatchesCurrentTickerSource.includes("phase:'verified'")
    || !confirmReviewChartMatchesCurrentTickerSource.includes('manualConfirmed:true')
    || !confirmReviewChartMatchesCurrentTickerSource.includes('runSimplifiedChartFullAnalysis(record, {')){
    throw new Error('Manual chart confirmation must promote the simplified pipeline and then start AI analysis explicitly.');
  }
  if(!analyseSetupGateSource.includes('ensureSimplifiedChartPipelineForRender(record, {source:\'analyse_setup_gate\'})')
    || !analyseSetupGateSource.includes('chartPipelineAllowsAi(gatePhase)')
    || !analyseSetupGateSource.includes('[CHART_AI_ANALYSIS_BLOCKED]')
    || !analyseSetupGateSource.includes('[CHART_AI_ANALYSIS_ALLOWED]')
    || !analyseSetupGateSource.includes('[CHART_ANALYSIS_REQUEST_FINALIZE_REASON]')
    || !appSource.includes('[CHART_REQUEST_ID_MUTATION]')
    || !analyseSetupGateSource.includes('beginReviewAiAnalysis(ticker, prompt, {'))
  {
    throw new Error('Analyse setup must gate chart AI from the simplified pipeline and emit explicit allow/block/finalize diagnostics for every started chart-analysis request.');
  }
  if(analyseSetupGateSource.includes('verificationOnly:true')
    || analyseSetupGateSource.includes('chartVerificationGateDecision(')
    || analyseSetupGateSource.includes('if(!verificationGate.allowed)')){
    throw new Error('Analyse setup must not retain the legacy verification-only gate branch once the simplified chart pipeline owns Review chart analysis.');
  }
  const reviewWorkspaceSource = extractFunctionSource(appSource, 'renderReviewWorkspace');
  if(!handleWorkspaceTabChangeSource.includes("nextTab === 'review'")
    || !handleWorkspaceTabChangeSource.includes("reconcileVisibleReviewState({")
    || !handleWorkspaceTabChangeSource.includes("source:'review_tab_activation'")){
    throw new Error('Review tab activation must reconcile visible Review DOM before deferred Review rendering runs.');
  }
  if(!reconcileVisibleReviewStateSource.includes('[REVIEW_VISIBLE_STATE_CHECK]')
    || !reconcileVisibleReviewStateSource.includes('[REVIEW_VISIBLE_STATE_VALID]')
    || !renderNeutralReviewPendingStateSource.includes('[REVIEW_STALE_DOM_CLEARED]')
    || !renderNeutralReviewPendingStateSource.includes('Preparing Review')
    || !renderNeutralReviewPendingStateSource.includes('Waiting for latest setup data')){
    throw new Error('Review visible-state reconciliation must clear stale Review DOM into a neutral pending state with diagnostics.');
  }
  if(!reviewWorkspaceSource.includes('[CHART_CONTEXT_SNAPSHOT]')
    || !reviewWorkspaceSource.includes('[CHART_CONTEXT_MISMATCH]')
    || !reviewWorkspaceSource.includes('buildChartContextMismatchPipeline(record, simplifiedChartPipeline || {}, renderContextSnapshot)')
    || !reviewWorkspaceSource.includes('renderContextSnapshot.displayedImageId !== renderContextSnapshot.verificationImageId')
    || !reviewWorkspaceSource.includes('box.dataset.renderedReviewTicker = normalizeTicker(record.ticker || \'\');')
    || !reviewWorkspaceSource.includes('box.dataset.renderedReviewRequestToken = String(currentRenderedReviewRequestToken() || \'\');')){
    throw new Error('Review render must snapshot displayed-vs-verification chart context and refuse verified rendering on image mismatch.');
  }
  const appAnalyseSetupSource = extractFunctionSource(appSource, 'analyseSetup');
  const chartAssessorInputSource = extractFunctionSource(appSource, 'buildChartAssessorInput');
  const chartAssessorToNormalizedSource = extractFunctionSource(appSource, 'chartAssessorInputToNormalizedAnalysis');
  const getReviewAnalysisStateSource = extractFunctionSource(appSource, 'getReviewAnalysisState');
  const successfulSameContextSource = extractFunctionSource(appSource, 'hasSuccessfulCompletedAnalysisForCurrentChartContext');
  const queueAutoAnalysisSource = extractFunctionSource(appSource, 'queueAutoAnalysisForTicker');
  const aiSummaryGuardSource = extractFunctionSource(appSource, 'chartAiSummaryRenderGuard');
  const stagePendingChartAiSummarySource = extractFunctionSource(appSource, 'stagePendingAiSummaryForChart');
  if(appAnalyseSetupSource.indexOf('[AI_SUMMARY_READY]') === -1
    || !appAnalyseSetupSource.includes("const analysisSource = String(options.source || 'unknown');")
    || !appAnalyseSetupSource.includes('[CHART_ANALYSIS_REQUEST_START]')
    || !appAnalyseSetupSource.includes('[CHART_ANALYSIS_REQUEST_SKIPPED_DUPLICATE_IMAGE]')
    || !appAnalyseSetupSource.includes('[CHART_CONTEXT_AT_VERIFICATION_START]')
    || !appAnalyseSetupSource.includes('pipelineAlreadyResolvedForCurrentContext && analysisAlreadyCommittedForCurrentContext')
    || !appAnalyseSetupSource.includes("stagePendingAiSummaryForChart(record, aiSummaryCommitPayload, 'quick_running')")
    || !appAnalyseSetupSource.includes("applyCommittedAiSummaryForChart(record, aiSummaryCommitPayload)")
    || !appAnalyseSetupSource.includes("flushPendingAiSummaryForChart(record, {source:'analyse_setup_failed'})")){
    throw new Error('AI summary commit must remain sequenced after the simplified pipeline gate in the analysis path.');
  }
  if(!appAnalyseSetupSource.includes("requestId:analysisRequestId,")
    || !appAnalyseSetupSource.includes('sanitizeChartAssessorVisibleIdentity(')
    || !appAnalyseSetupSource.includes('buildChartAssessorInput(record, analysis, requestChartImageSource, analysisRequestId)')){
    throw new Error('Live chart analysis must preserve request-aware chart assessor inputs for the simplified pipeline path.');
  }
  if(!appAnalyseSetupSource.includes('!isStrictChartIdentityProvenanceAnalysis(normalizedLiveAnalysis)')
    || !appAnalyseSetupSource.includes('normalizedLiveAnalysis.chartIdentityProvenanceVersion = 1')){
    throw new Error('Live analyseSetup results must upgrade any non-strict analysis into strict provenance mode before sanitization.');
  }
  if(!appAnalyseSetupSource.includes('[CHART_ANALYSIS_REQUEST_FINALIZE_REASON]')
    || !queueAutoAnalysisSource.includes("ensureSimplifiedChartPipelineForRender(liveRecord, {source:'queue_auto_analysis'})")
    || !queueAutoAnalysisSource.includes('chartPipelineAllowsAi(pipelinePhase)')){
    throw new Error('Analysis request finalization and auto-analysis dispatch must both use the simplified chart pipeline.');
  }
  if(!appAnalyseSetupSource.includes("{caller:'analyse_setup_live'}")){
    throw new Error('Chart assessor sanitization must log its live caller source.');
  }
  if(!sanitizeChartIdentitySource.includes('liveCurrentContext')
    || !sanitizeChartIdentitySource.includes('safeAnalysis.chartIdentityProvenanceVersion = 1')){
    throw new Error('Current live chart context must force strict provenance if a rebuilt analysis downgrades version unexpectedly.');
  }
  if(!chartAssessorInputSource.includes('chartIdentityProvenanceVersion')
    || !chartAssessorInputSource.includes('visibleTickerSource')
    || !chartAssessorInputSource.includes('visibleTimeframeSource')
    || !chartAssessorInputSource.includes('visiblePriceSource')
    || !chartAssessorInputSource.includes('chartRegionConfirmation')
    || !chartAssessorInputSource.includes('chartRegionConfirmationSource')){
    throw new Error('Chart assessor input must preserve sanitized provenance context for downstream deterministic verification.');
  }
  if(!chartAssessorToNormalizedSource.includes('chartIdentityProvenanceVersion')
    || !chartAssessorToNormalizedSource.includes('visible_ticker_source')
    || !chartAssessorToNormalizedSource.includes('visible_timeframe_source')
    || !chartAssessorToNormalizedSource.includes('visible_price_source')
    || !chartAssessorToNormalizedSource.includes('chart_region_confirmation')
    || !chartAssessorToNormalizedSource.includes('chart_region_confirmation_source')){
    throw new Error('Chart assessor normalized replay must preserve provenance fields rather than dropping them.');
  }
  if(!chartAssessorToNormalizedSource.includes('[CHART_ASSESSOR_REHYDRATED_FROM_TRUSTED_CONTEXT]')){
    throw new Error('Any downstream trusted-context rehydration must be explicitly logged.');
  }
  if(!appAnalyseSetupSource.includes('normalizeAnalysisResult(data.analysis, previousTickerState)')
    || !appAnalyseSetupSource.includes('sanitizeChartAssessorVisibleIdentity(')
    || !extractFunctionSource(appSource, 'normalizeAnalysisResult').includes('chartIdentityProvenanceVersion')
    || !extractFunctionSource(appSource, 'normalizeAnalysisResult').includes('visible_ticker_source')
    || !extractFunctionSource(appSource, 'normalizeAnalysisResult').includes('chart_region_confirmation_source')){
    throw new Error('Live analysis normalization must preserve chart identity provenance before sanitization.');
  }
  const normalizeAnalysisResultSource = extractFunctionSource(appSource, 'normalizeAnalysisResult');
  const normalizeAnalysisResponseSource = extractFunctionSource(appSource, 'normalizeAnalysisResponse');
  if(normalizeAnalysisResponseSource.includes(": 1,") && normalizeAnalysisResponseSource.includes('chartIdentityProvenanceVersion')){
    throw new Error('Chart identity provenance version must not default to strict mode when absent.');
  }
  if(normalizeAnalysisResultSource.includes(": 1,") && normalizeAnalysisResultSource.includes('chartIdentityProvenanceVersion')){
    throw new Error('Normalized analysis results must preserve absent chart provenance version instead of forcing strict mode.');
  }
  if(!aiCommitGateSource.includes('const pipeline = getReviewChartAnalysisPipeline(item);')
    || !appAnalyseSetupSource.includes('const activeChartPipeline = getReviewChartAnalysisPipeline(record);')
    || !flushPendingAiSource.includes('const currentPipeline = getReviewChartAnalysisPipeline(item) || {};')
    || !flushPendingAiSource.includes('const currentChartContext = currentReviewChartContext(item, item.review || {});')
    || !flushPendingAiSource.includes('const currentRequestId = String(currentChartContext.requestId || \'\');')){
    throw new Error('Sensitive AI-summary and analyseSetup request-context reads must use the simplified pipeline and current chart context instead of raw persisted quick state.');
  }
  const blockedMismatchHelperSource = extractFunctionSource(appSource, 'chartVerificationIsBlockedOrMismatchStatus');
  if(!blockedMismatchHelperSource.includes("'manual_confirmation_required'")
    || !blockedMismatchHelperSource.includes("'strong_mismatch'")
    || !blockedMismatchHelperSource.includes("'possible_mismatch'")
    || !blockedMismatchHelperSource.includes("'stale_state_detected'")
    || !blockedMismatchHelperSource.includes("'verification_failed'")
    || !blockedMismatchHelperSource.includes("'source_mismatch'")){
    throw new Error('Chart verification must define a shared blocked/mismatch helper covering terminal mismatch and stale states.');
  }
  const renderReviewWorkspaceSource = extractFunctionSource(appSource, 'renderReviewWorkspace');
  const simplifiedDecisionSource = extractFunctionSource(appSource, 'buildSimplifiedChartPipelineDecision');
  const simplifiedRunSource = extractFunctionSource(appSource, 'runSimplifiedChartAnalysis');
  const ensurePipelineSource = extractFunctionSource(appSource, 'ensureSimplifiedChartPipelineForRender');
  if(!renderReviewWorkspaceSource.includes("renderSource:'simplified_pipeline'")
    || !renderReviewWorkspaceSource.includes('renderSimplifiedChartPipelineMarkup(record, simplifiedChartPipeline || {})')){
    throw new Error('Review chart rendering must be owned by the simplified pipeline only.');
  }
  if(!simplifiedDecisionSource.includes("key:'chart_mismatch'")
    || !simplifiedDecisionSource.includes("key:'cant_read'")
    || !simplifiedDecisionSource.includes("key:'chart_context_mismatch'")
    || !simplifiedDecisionSource.includes('Chart looks correct.')){
    throw new Error('Simplified Review chart verification must render first-class matched, mismatch, unreadable, and context-mismatch decisions.');
  }
  if(!simplifiedRunSource.includes('buildSimplifiedTickerGateAnalysis(')
    || !simplifiedRunSource.includes('upsertReviewChartAnalysisPipeline(item, nextPipeline);')
    || !simplifiedRunSource.includes("if(nextPipeline.phase === 'verified')")){
    throw new Error('Simplified chart verification must commit a terminal pipeline result and allow AI only from verified ticker matches.');
  }
  if(!ensurePipelineSource.includes('[REVIEW_CHART_PIPELINE_STALE_REQUEST_IGNORED]')
    || !ensurePipelineSource.includes("phase:mismatch ? 'possible_mismatch' : (verifiedMatch ? 'verified' : 'cant_read')")){
    throw new Error('Simplified Review pipeline recovery must be request-aware and rebuild current verified/mismatch/unreadable state directly.');
  }
  if(!appAnalyseSetupSource.includes('[CHART_ANALYSIS_DUPLICATE_RUNNING_BYPASSED_FOR_REPLACEMENT]')
    || !appAnalyseSetupSource.includes('[CHART_REPLACEMENT_ANALYSIS_SUPERSEDES_RUNNING]')
    || !appAnalyseSetupSource.includes('[CHART_ANALYSIS_DUPLICATE_RUNNING_IGNORED]')
    || !appAnalyseSetupSource.includes("const replacementUploadSupersedesRunning = analysisSource === 'chart_upload'")
    || !appAnalyseSetupSource.includes("clearReviewAiAnalysis(ticker);")){
    throw new Error('Replacement chart uploads must supersede same-ticker running analysis, while ordinary duplicate clicks stay ignored.');
  }
  if(!stagePendingChartAiSummarySource.includes('[AI_SUMMARY_COMMIT_BLOCKED_QUICK_RUNNING]')){
    throw new Error('Quick-running AI summary wait logs must be deduplicated per chart context.');
  }
  if(!getReviewAnalysisStateSource.includes("analysisStatus = String(")
    || !getReviewAnalysisStateSource.includes("? 'failed'")
    || !getReviewAnalysisStateSource.includes("? 'committed'")
    || !getReviewAnalysisStateSource.includes(": (rawAnalysis ? 'raw_only' : 'idle')")){
    throw new Error('Review analysis state must distinguish committed analysis from failed and raw-only payloads.');
  }
  if(!successfulSameContextSource.includes('state.analysisStatus === \'committed\'')
    || !successfulSameContextSource.includes('String(state.analysisRequestId || \'\') === requestedRequestId')
    || !successfulSameContextSource.includes('normalizeTicker(state.ticker || item.ticker || \'\') === requestedTicker')
    || !successfulSameContextSource.includes('!pending')){
    throw new Error('Same-image dedupe must require full committed chart context, including request id.');
  }
  if(!appSource.includes("runSimplifiedChartAnalysis(record, {")
    || !appSource.includes("runSimplifiedChartFullAnalysis(record, {")
    || !appSource.includes("analyseSetup(record.ticker, {source:'manual_button'});")){
    throw new Error('Review chart upload/manual-confirm flows must go through the simplified chart pipeline, while manual Analyse remains an explicit AI action.');
  }
  const aiGateSandbox = {
    normalizeTicker(value){ return String(value || '').trim().toUpperCase(); },
    getReviewChartAnalysisPipeline(record = {}){
      return record && record.review && record.review.chartAnalysisPipeline && typeof record.review.chartAnalysisPipeline === 'object'
        ? record.review.chartAnalysisPipeline
        : null;
    }
  };
  vm.createContext(aiGateSandbox);
  vm.runInContext(aiCommitGateSource, aiGateSandbox, {filename:'app.js#canCommitAiSummaryForChart'});
  const gateBlocked = aiGateSandbox.canCommitAiSummaryForChart({
    record:{
      ticker:'NVDA',
      review:{
        chartAnalysisPipeline:{
          ticker:'NVDA',
          imageId:'img-1',
          requestId:'req-1',
          phase:'verifying'
        }
      }
    },
    ticker:'NVDA',
    imageId:'img-1',
    requestId:'req-1'
  });
  const gateAllowed = aiGateSandbox.canCommitAiSummaryForChart({
    record:{
      ticker:'NVDA',
      review:{
        chartAnalysisPipeline:{
          ticker:'NVDA',
          imageId:'img-1',
          requestId:'req-1',
          phase:'verified'
        }
      }
    },
    ticker:'NVDA',
    imageId:'img-1',
    requestId:'req-1'
  });
  const gateRejectedStale = aiGateSandbox.canCommitAiSummaryForChart({
    record:{
      ticker:'LIN',
      review:{
        chartAnalysisPipeline:{
          ticker:'LIN',
          imageId:'img-2',
          requestId:'req-2',
          phase:'verified'
        }
      }
    },
    ticker:'NVDA',
    imageId:'img-1',
    requestId:'req-1'
  });
  if(gateBlocked !== false || gateAllowed !== true || gateRejectedStale !== false){
    throw new Error('AI summary commit gate must block running quick analyses and stale chart contexts.');
  }
  const sameImageDedupeSandbox = {
    getReviewAnalysisState(record){ return record.__analysisState; },
    getPendingChartAiSummary(record){ return record.__pending || null; },
    normalizeTicker(value){ return String(value || '').trim().toUpperCase(); }
  };
  vm.createContext(sameImageDedupeSandbox);
  vm.runInContext(successfulSameContextSource, sameImageDedupeSandbox, {filename:'app.js#hasSuccessfulCompletedAnalysisForCurrentChartContext'});
  const dedupeSuccess = sameImageDedupeSandbox.hasSuccessfulCompletedAnalysisForCurrentChartContext({
    __analysisState:{
      normalizedAnalysis:{ verdict:'Watch' },
      analysisStatus:'committed',
      ticker:'NVDA',
      analysisChartImageId:'img-1',
      chartImageId:'img-1',
      analysisRequestId:'req-1',
      error:''
    }
  }, {ticker:'NVDA', imageId:'img-1', requestId:'req-1'});
  const dedupeFailed = sameImageDedupeSandbox.hasSuccessfulCompletedAnalysisForCurrentChartContext({
    __analysisState:{
      normalizedAnalysis:null,
      analysisStatus:'failed',
      ticker:'NVDA',
      analysisChartImageId:'img-1',
      chartImageId:'img-1',
      analysisRequestId:'req-1',
      error:'AI failed'
    }
  }, {ticker:'NVDA', imageId:'img-1', requestId:'req-1'});
  const dedupeRawOnly = sameImageDedupeSandbox.hasSuccessfulCompletedAnalysisForCurrentChartContext({
    __analysisState:{
      normalizedAnalysis:null,
      analysisStatus:'raw_only',
      ticker:'NVDA',
      analysisChartImageId:'img-1',
      chartImageId:'img-1',
      analysisRequestId:'req-1',
      error:''
    }
  }, {ticker:'NVDA', imageId:'img-1', requestId:'req-1'});
  const dedupePending = sameImageDedupeSandbox.hasSuccessfulCompletedAnalysisForCurrentChartContext({
    __analysisState:{
      normalizedAnalysis:{ verdict:'Watch' },
      analysisStatus:'committed',
      ticker:'NVDA',
      analysisChartImageId:'img-1',
      chartImageId:'img-1',
      analysisRequestId:'req-1',
      error:''
    },
    __pending:{ ticker:'NVDA', imageId:'img-1', requestId:'req-1' }
  }, {ticker:'NVDA', imageId:'img-1', requestId:'req-1'});
  const dedupeRequestMismatch = sameImageDedupeSandbox.hasSuccessfulCompletedAnalysisForCurrentChartContext({
    __analysisState:{
      normalizedAnalysis:{ verdict:'Watch' },
      analysisStatus:'committed',
      ticker:'NVDA',
      analysisChartImageId:'img-1',
      chartImageId:'img-1',
      analysisRequestId:'req-A',
      error:''
    }
  }, {ticker:'NVDA', imageId:'img-1', requestId:'req-B'});
  if(dedupeSuccess !== true || dedupeFailed !== false || dedupeRawOnly !== false || dedupePending !== false || dedupeRequestMismatch !== false){
    throw new Error('Same-image dedupe must only suppress matching committed analysis context, not failed, raw-only, pending, or request-mismatched states.');
  }
  const chartUiDecisionSource = extractFunctionSource(appSource, 'chartVerificationUiDecision');
  const chartRelevantMaRequirementSource = extractFunctionSource(appSource, 'getStrategyRelevantMaRequirement');
  const chartCoreIdentityMatchSource = extractFunctionSource(appSource, 'chartVerificationHasCoreIdentityMatch');
  const chartPrimaryIndicatorSupportSource = extractFunctionSource(appSource, 'chartVerificationHasPrimaryIndicatorSupport');
  const chartSupportsPartialSource = extractFunctionSource(appSource, 'chartVerificationSupportsNonBlockingIndicatorPartial');
  const chartFastPassSource = extractFunctionSource(appSource, 'buildChartVerificationFastPass');
  const chartSandbox = {
    normaliseVisibleTicker(value){ return String(value || '').trim().toUpperCase(); },
    chartVerificationNumberOrNull(value){
      if(value === null || value === undefined || value === '') return null;
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    },
    chartVerificationNumericLabels(){ return []; },
    isDailyTimeframe(value){ return String(value || '').trim().toUpperCase() === '1D'; },
    chartImageIdForReview(review){
      const item = review && typeof review === 'object' ? review : {};
      return String((item.chartRef && item.chartRef.imageId) || (item.chartImageOriginal && item.chartImageOriginal.imageId) || (item.chartImagePreview && item.chartImagePreview.imageId) || '');
    },
    chartVerificationDisplayValue(value){
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric.toFixed(2) : 'n/a';
    },
    escapeHtml(value){ return String(value || '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); },
    debugFlagEnabled(){ return false; },
    uiState:{ reviewRenderPass:1 }
  };
  vm.createContext(chartSandbox);
  vm.runInContext(chartRelevantMaRequirementSource, chartSandbox, {filename:'app.js#getStrategyRelevantMaRequirement'});
  vm.runInContext(chartCoreIdentityMatchSource, chartSandbox, {filename:'app.js#chartVerificationHasCoreIdentityMatch'});
  vm.runInContext(chartPrimaryIndicatorSupportSource, chartSandbox, {filename:'app.js#chartVerificationHasPrimaryIndicatorSupport'});
  vm.runInContext(chartSupportsPartialSource, chartSandbox, {filename:'app.js#chartVerificationSupportsNonBlockingIndicatorPartial'});
  vm.runInContext(extractFunctionSource(appSource, 'chartVerificationIsBlockedOrMismatchStatus'), chartSandbox, {filename:'app.js#chartVerificationIsBlockedOrMismatchStatus'});
  vm.runInContext(extractFunctionSource(appSource, 'chartVerificationRequiresManualAction'), chartSandbox, {filename:'app.js#chartVerificationRequiresManualAction'});
  vm.runInContext(chartUiDecisionRenderSource, chartSandbox, {filename:'app.js#chartVerificationUiDecision'});
  vm.runInContext(chartDecisionClassNameSource, chartSandbox, {filename:'app.js#chartDecisionClassName'});
  vm.runInContext(chartFastPassSource, chartSandbox, {filename:'app.js#buildChartVerificationFastPass'});
  const mirroredFastPass = chartSandbox.buildChartVerificationFastPass({
    ticker:'DINO',
    marketData:{price:70.30}
  }, {
    visible_ticker:'DINO',
    visible_timeframe:'1D',
    visible_latest_price:70.30
  }, {
    imageId:'img-1',
    originalAvailable:true
  });
  if(mirroredFastPass.status !== 'uncertain_missing_context' || mirroredFastPass.independentImageEvidence !== false || mirroredFastPass.contextMirroringSuspected !== true){
    throw new Error('Header-only mirrored reads without image-derived evidence must remain uncertain, not clear match candidates.');
  }
  const headerOnlyFastPass = chartSandbox.buildChartVerificationFastPass({
    ticker:'MRNA',
    marketData:{price:26.80}
  }, {
    visible_ticker:'MRNA',
    visible_timeframe:'1D',
    visible_latest_price:26.80,
    chart_match_status:'match'
  }, {
    imageId:'img-header-only',
    originalAvailable:true
  });
  if(headerOnlyFastPass.status !== 'uncertain_missing_context' || headerOnlyFastPass.independentImageEvidence !== false || headerOnlyFastPass.chartNativeEvidencePresent !== false){
    throw new Error('Header-only OCR matches without visible-identity provenance must remain uncertain.');
  }
  const mismatchFastPass = chartSandbox.buildChartVerificationFastPass({
    ticker:'DINO',
    marketData:{price:70.30}
  }, {
    visible_ticker:'ETR',
    visible_timeframe:'1D',
    visible_latest_price:88.12
  }, {
    imageId:'img-2',
    originalAvailable:true
  });
  if(mismatchFastPass.status !== 'ticker_mismatch' || !mismatchFastPass.evidence.some(item => /mismatch/i.test(item) || /ticker/i.test(item))){
    throw new Error('Visible ticker mismatches must return a hard chart mismatch with evidence.');
  }
  const priceMismatchFastPass = chartSandbox.buildChartVerificationFastPass({
    ticker:'DINO',
    marketData:{price:70.30}
  }, {
    visible_timeframe:'1D',
    visible_latest_price:95.00
  }, {
    imageId:'img-3',
    originalAvailable:true
  });
  if(priceMismatchFastPass.status !== 'strong_mismatch' || !priceMismatchFastPass.evidence.some(item => /Price delta/i.test(item))){
    throw new Error('Missing ticker plus far-off price must still produce a strong mismatch with evidence.');
  }
  const nativeEvidenceFastPass = chartSandbox.buildChartVerificationFastPass({
    ticker:'DINO',
    marketData:{price:70.30}
  }, {
    visible_ticker:'DINO',
    visible_timeframe:'1D',
    visible_latest_price:70.30,
    visible_ma20:67.43,
    ma20_visible:true
  }, {
    imageId:'img-native-ok',
    originalAvailable:true
  });
  if(nativeEvidenceFastPass.status !== 'clear_match_candidate' || nativeEvidenceFastPass.independentImageEvidence !== true || nativeEvidenceFastPass.chartNativeEvidencePresent !== true){
    throw new Error('Correct chart matches should only become clear candidates once chart-native evidence exists.');
  }
  const normalizeSandbox = {
    cloneData(value, fallback){
      if(value === undefined || value === null) return fallback;
      return JSON.parse(JSON.stringify(value));
    }
  };
  vm.createContext(normalizeSandbox);
  vm.runInContext(normalizeSource, normalizeSandbox, {filename:'app.js#normalizeAnalysisResponse'});
  const normalized = normalizeSandbox.normalizeAnalysisResponse({
    coach_summary:'Constructive, but not ready.',
    verdict:'Watch',
    aiObservation:{
      rawOpinion:{
        verdict:'Entry',
        final_verdict:'Entry',
        entry:'101',
        stop:'95',
        first_target:'120'
      }
    }
  });
  if(!normalized || normalized.aiObservation.rawOpinion.verdict !== 'Entry' || normalized.entry || normalized.first_target || normalized.final_verdict){
    throw new Error('Frontend AI normalization must preserve supplied rawOpinion while keeping canonical plan/verdict fields blank.');
  }
  const effectivePlanSource = extractFunctionSource(appSource, 'effectivePlanForRecord');
  if(/analysis\.plan_metrics_valid|source:'ai'/.test(effectivePlanSource)){
    throw new Error('Effective plan must not source canonical plan levels from AI observation output.');
  }
  const mergeLegacySource = extractFunctionSource(appSource, 'mergeLegacyCardIntoRecord');
  if(/source:'analysis'/.test(mergeLegacySource) || !/rawPlanOpinion|nonAuthoritative/.test(mergeLegacySource)){
    throw new Error('Legacy card merge must quarantine lastAnalysis plan levels instead of writing canonical record.plan.');
  }
  const analysisVerdictSource = extractFunctionSource(appSource, 'analysisVerdictForRecord');
  if(/normalizedAnalysis|aiVerdict|final_verdict \|\| normalizedAnalysis\.verdict/.test(analysisVerdictSource)){
    throw new Error('AI verdict fields must not participate in canonical/display verdict selection.');
  }
  const evidenceSandbox = {
    uiState:{},
    normalizeTicker(value){
      return String(value || '').trim().toUpperCase();
    },
    numericOrNull(value){
      if(value === null || value === undefined) return null;
      if(typeof value === 'string' && value.trim() === '') return null;
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    },
    evaluateRewardRisk(entry, stop, target){
      const numericEntry = Number(entry);
      const numericStop = Number(stop);
      const numericTarget = Number(target);
      const risk = numericEntry - numericStop;
      const reward = numericTarget - numericEntry;
      const rrRatio = risk > 0 ? reward / risk : null;
      return {valid:Number.isFinite(rrRatio) && rrRatio > 0, rrRatio};
    },
    deriveCurrentPlanState(entry, stop, target){
      const numericEntry = Number(entry);
      const numericStop = Number(stop);
      const numericTarget = Number(target);
      const risk = numericEntry - numericStop;
      const reward = numericTarget - numericEntry;
      const valid = Number.isFinite(risk) && Number.isFinite(reward) && risk > 0 && reward > 0;
      return {status:valid ? 'valid' : 'invalid', riskFit:{risk_status:valid ? 'fits_risk' : 'invalid_plan'}};
    },
    escapeHtml(value){
      return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
    }
  };
  vm.createContext(evidenceSandbox);
  vm.runInContext(extractRegistryAccessorSource(appSource), evidenceSandbox, {filename:'app.js#scannerProjectionFieldRegistry'});
  [
    'resolvePullbackInterpretation',
    'projectionValue',
    'scannerProjectionFieldRegistry',
    'scannerProjectionValues',
    'hasUsableAnalysisProjection',
    'scannerProjectionPresentFields',
    'scannerProjectionTrustedFields',
    'hasAiObservationEvidenceHints',
    'resolveDerivedStateSource',
    'aiObservationEvidenceStates',
    'hasMathematicallyPriceablePlan',
    'resolveAlivePullbackReboundGuard',
    'chartConsistencyArray',
    'chartVerificationNumberOrNull',
    'normaliseVisibleTicker',
    'normaliseVisibleTimeframe',
    'isDailyTimeframe',
    'simpleStableHash',
    'chartImageIdForReview',
    'logChartVerificationLifecycle',
    'logChartVerificationFastPass',
    'chartVerificationExchangeTimeZone',
    'chartVerificationMarketOpenNow',
    'chartVerificationToleranceConfig',
    'chartVerificationToleranceDetail',
    'valueWithinTolerance',
    'chartIndicatorVerificationStatus',
    'chartVerificationDisplayValue',
    'chartVerificationNumericLabels',
    'chartVerificationProximityMatches',
    'chartVerificationPriceMismatchSeverity',
    'buildChartVerificationFastPass',
    'buildPreAiChartVerificationTrace',
    'hasExplicitChartIdentityProvenanceVersion',
    'isStrictChartIdentityProvenanceAnalysis',
    'sanitizeChartAssessorVisibleIdentity',
    'buildChartAssessorInput',
    'chartVerificationIsBlockedOrMismatchStatus',
    'currentReviewChartContext',
    'chartAssessorInputToNormalizedAnalysis',
    'chartImageDimensionsFromRef',
    'chartImageDimensionsLabel',
    'buildChartImageSourceTrace',
    'logChartRequestIdMutation',
    'hasVerifiableReviewChartSource',
    'getReviewChartAnalysisPipeline',
    'chartPipelineAllowsAi',
    'chartImageForAnalysis',
    'clearReviewChartImageSources',
    'queueAutoAnalysisForTicker',
    'confirmReviewChartMatchesCurrentTicker',
    'rejectReviewChartAndUploadAnother',
    'debugFlagEnabled',
    'getStrategyRelevantMaRequirement',
    'chartVerificationHasCoreIdentityMatch',
    'chartVerificationHasPrimaryIndicatorSupport',
    'chartVerificationSupportsNonBlockingIndicatorPartial',
    'chartVerificationUiDecision',
    'chartDecisionClassName',
    'chartVerificationRequiresManualAction',
    'ensureReviewChartLightboxShell',
    'closeReviewChartLightbox',
    'openReviewChartLightbox',
    'clearStartupReviewSessionState',
    'buildDeterministicChartVerification',
    'chartAiSummaryRenderGuard',
    'renderSuppressedAiAnalysisPanel',
    'chartVerificationIsVerifiedStatus',
    'chartVerificationAllowsAiAnalysisStatus',
    'chartVerificationIsBlockedOrMismatchStatus',
    'analysisDerivedStatesFromRecord'
  ].forEach(functionName => {
    vm.runInContext(extractFunctionSource(appSource, functionName), evidenceSandbox, {filename:`app.js#${functionName}`});
  });
  evidenceSandbox.getReviewAiRuntime = function getReviewAiRuntime(){
    if(!evidenceSandbox.uiState.reviewAiRuntime || typeof evidenceSandbox.uiState.reviewAiRuntime !== 'object'){
      evidenceSandbox.uiState.reviewAiRuntime = {};
    }
    return evidenceSandbox.uiState.reviewAiRuntime;
  };
  evidenceSandbox.normalizeTickerRecord = function normalizeTickerRecord(record){
    return record && typeof record === 'object' ? record : {};
  };
  const directDerived = evidenceSandbox.analysisDerivedStatesFromRecord({
    review:{
      normalizedAnalysis:{
        ai_observation_only:true,
        coach_summary:'Strong trend, but price is extended and too volatile to price reliably.',
        constructive_evidence:['Strong uptrend remains intact.'],
        risk_evidence:['No clean pullback base and no reliable stop yet.'],
        bounce_evidence:'Rebound attempt, not confirmed.',
        priceability_evidence:'Too volatile to price reliably.'
      }
    }
  });
  if(directDerived.derivedStateSource !== 'ai_observation_hints' || directDerived.aiObservationEvidenceApplied !== true || directDerived.structureState !== 'unknown' || directDerived.pullbackZone !== 'none' || directDerived.setupLocationState !== 'none' || directDerived.priceabilityState !== '' || directDerived.aiEvidenceStructureHint !== 'mixed' || directDerived.aiEvidenceLocationHint !== 'extended' || directDerived.aiEvidencePriceabilityHint !== 'unpriceable' || directDerived.aiEvidenceBounceHint !== 'attempt_observed'){
    throw new Error('Direct chart-analysis records without scanner projection must expose non-authoritative ai_observation_evidence hints.');
  }
  const directEvidence = evidenceSandbox.aiObservationEvidenceStates({
    ai_observation_only:true,
    coach_summary:'Strong trend, but price is extended and too volatile to price reliably.'
  });
  if(Object.keys(directEvidence).some(key => /(?:^|_)(structure|trend|bounce|volume|priceability|stabilisation|setup_location)_state$/.test(key))){
    throw new Error('AI observation evidence must not expose canonical-looking *_state fields.');
  }
  const aiBrokenDerived = evidenceSandbox.analysisDerivedStatesFromRecord({
    review:{
      normalizedAnalysis:{
        ai_observation_only:true,
        coach_summary:'The trend looks broken and damaged, with failed structure.',
        risk_evidence:['Trend broken. Structure failed.']
      }
    }
  });
  if(aiBrokenDerived.structureState !== 'unknown' || aiBrokenDerived.aiEvidenceStructureHint !== 'damaged_context'){
    throw new Error('AI observation evidence must not emit hard broken/weakening/intact/strong structureState.');
  }
  const metadataOnlyDerived = evidenceSandbox.analysisDerivedStatesFromRecord({
    scan:{analysisProjection:{scan_type:'20MA', setup_type_reason:'metadata only'}},
    review:{
      normalizedAnalysis:{
        ai_observation_only:true,
        coach_summary:'Trend broken and damaged, but this is AI observation only.'
      }
    }
  });
  if(metadataOnlyDerived.derivedStateSource !== 'ai_observation_hints' || metadataOnlyDerived.structureState !== 'unknown' || metadataOnlyDerived.aiEvidenceStructureHint !== 'damaged_context'){
    throw new Error('Metadata-only scanner projection must not suppress neutral AI evidence fallback.');
  }
  const camelCaseProjected = evidenceSandbox.analysisDerivedStatesFromRecord({
    scan:{analysisProjection:{structureState:'broken', bounceState:'none', pullbackZone:'near_50ma', stabilisationState:'none'}},
    review:{
      normalizedAnalysis:{
        ai_observation_only:true,
        coach_summary:'AI says constructive recovery, but scanner projection owns state.'
      }
    }
  });
  if(camelCaseProjected.derivedStateSource !== 'scanner_projection+ai_observation_hints' || camelCaseProjected.structureState !== 'broken' || camelCaseProjected.bounceState !== 'none' || camelCaseProjected.pullbackZone !== 'near_50ma' || camelCaseProjected.aiObservationEvidenceApplied !== true || !camelCaseProjected.scannerProjectionTrustedFieldsApplied.includes('structureState')){
    throw new Error('CamelCase scanner projection fields must be detected and consumed consistently.');
  }
  const projectedDerived = evidenceSandbox.analysisDerivedStatesFromRecord({
    scan:{analysisProjection:{structure_state:'weak', bounce_state:'none', priceability_state:'unpriceable'}},
    review:{
      normalizedAnalysis:{
        ai_observation_only:true,
        coach_summary:'Strong trend with confirmed bounce.',
        priceability_evidence:'Looks priceable.'
      }
    }
  });
  if(projectedDerived.derivedStateSource !== 'scanner_projection+ai_observation_hints' || projectedDerived.aiObservationEvidenceApplied !== true || projectedDerived.structureState !== 'weak' || projectedDerived.bounceState !== 'none' || projectedDerived.priceabilityState !== 'unpriceable' || !projectedDerived.scannerProjectionTrustedFieldsApplied.includes('bounceState') || projectedDerived.aiEvidenceBounceHint !== 'confirmed_observed'){
    throw new Error('Scanner projection must win over AI observation evidence hints.');
  }
  const ftiAlivePullbackDerived = evidenceSandbox.analysisDerivedStatesFromRecord({
    marketData:{price:73.19, ma20:75.4, ma50:71.6, ma200:52, previousClose:71.15, changePercent:2.87},
    scan:{analysisProjection:{
      trend_state:'strong',
      structure_state:'weak',
      pullback_zone:'near_50ma',
      stabilisation_state:'early',
      bounce_state:'none',
      priceability_state:'unpriceable'
    }}
  });
  if(ftiAlivePullbackDerived.structureState === 'weak' || ftiAlivePullbackDerived.structureState === 'weakening' || ftiAlivePullbackDerived.bounceState === 'none' || ftiAlivePullbackDerived.alivePullbackReboundGuardApplied !== true){
    throw new Error('Alive pullback/rebound evidence near support must prevent scanner weak/no-bounce downgrade.');
  }
  const freshSyntheticBounceGuard = evidenceSandbox.resolveAlivePullbackReboundGuard({
    marketData:{price:73.19, ma20:75.4, ma50:71.6, ma200:52, previousClose:71.15, changePercent:2.87},
    trendState:'strong',
    structureState:'intact',
    pullbackZone:'near_50ma',
    bounceState:'none',
    allowBounceDowngradeCorrection:false
  });
  if(freshSyntheticBounceGuard.applied === true || freshSyntheticBounceGuard.bounceState === 'attempt'){
    throw new Error('Fresh derivation must not let synthetic bounce none trigger the alive pullback guard.');
  }
  const freshActualWeakGuard = evidenceSandbox.resolveAlivePullbackReboundGuard({
    marketData:{price:73.19, ma20:75.4, ma50:71.6, ma200:52, previousClose:71.15, changePercent:2.87},
    trendState:'strong',
    structureState:'weak',
    pullbackZone:'near_50ma',
    stabilisationState:'early',
    bounceState:'none',
    allowBounceDowngradeCorrection:false
  });
  if(freshActualWeakGuard.applied !== true || freshActualWeakGuard.structureState === 'weak' || freshActualWeakGuard.bounceState !== 'attempt'){
    throw new Error('Fresh derivation may only apply alive pullback guard after an actual structure downgrade exists.');
  }
  const blankTrendMarketOnlyDerived = evidenceSandbox.analysisDerivedStatesFromRecord({
    marketData:{price:73.19, ma20:75.4, ma50:71.6, ma200:52, previousClose:71.15, changePercent:2.87},
    scan:{analysisProjection:{
      pullback_zone:'near_50ma',
      bounce_state:'none'
    }}
  });
  if(blankTrendMarketOnlyDerived.alivePullbackReboundGuardApplied === true || blankTrendMarketOnlyDerived.bounceState === 'attempt'){
    throw new Error('Alive pullback guard must not create bounce attempts from market data when trend/structure context is blank.');
  }
  const trueBrokenProjection = evidenceSandbox.analysisDerivedStatesFromRecord({
    marketData:{price:42, ma20:48, ma50:50, ma200:55, previousClose:43, changePercent:-2},
    scan:{analysisProjection:{
      trend_state:'broken',
      structure_state:'broken',
      pullback_zone:'extended',
      stabilisation_state:'none',
      bounce_state:'none'
    }}
  });
  if(trueBrokenProjection.structureState !== 'broken' || trueBrokenProjection.bounceState !== 'none' || trueBrokenProjection.alivePullbackReboundGuardApplied === true){
    throw new Error('Alive pullback guard must not soften true broken scanner projections.');
  }
  const trueWeakeningProjection = evidenceSandbox.analysisDerivedStatesFromRecord({
    marketData:{price:49, ma20:52, ma50:55, ma200:44, previousClose:48.5, changePercent:1.1},
    scan:{analysisProjection:{
      trend_state:'weak',
      structure_state:'weakening',
      pullback_zone:'near_50ma',
      stabilisation_state:'none',
      bounce_state:'none'
    }}
  });
  if(trueWeakeningProjection.structureState !== 'weakening' || trueWeakeningProjection.bounceState !== 'none' || trueWeakeningProjection.alivePullbackReboundGuardApplied === true){
    throw new Error('Alive pullback guard must not soften genuine weak/weakening trend projections.');
  }
  const priceabilityOnlyProjected = evidenceSandbox.analysisDerivedStatesFromRecord({
    scan:{analysisProjection:{priceability_state:'unpriceable'}},
    review:{normalizedAnalysis:null}
  });
  if(priceabilityOnlyProjected.derivedStateSource !== 'scanner_projection' || priceabilityOnlyProjected.priceabilityState !== 'unpriceable' || !priceabilityOnlyProjected.scannerProjectionTrustedFieldsApplied.includes('priceabilityState')){
    throw new Error('Consumed scanner priceability field must be reflected in source diagnostics.');
  }
  const mathematicallyPriceableProjection = evidenceSandbox.analysisDerivedStatesFromRecord({
    plan:{entry:62.73, stop:56.58, firstTarget:81.19},
    marketData:{currency:'USD'},
    scan:{analysisProjection:{priceability_state:'unpriceable', setup_location_state:'extended'}}
  });
  if(mathematicallyPriceableProjection.priceabilityState === 'unpriceable'){
    throw new Error('Scanner priceability must not stay unpriceable when deterministic plan math is valid.');
  }
  const metadataOnlyProjectionFields = evidenceSandbox.analysisDerivedStatesFromRecord({
    scan:{analysisProjection:{scan_type:'20MA', setup_type_reason:'metadata only'}},
    review:{normalizedAnalysis:null}
  });
  if(metadataOnlyProjectionFields.derivedStateSource !== 'unknown' || metadataOnlyProjectionFields.scannerProjectionTrustedFieldsApplied.length !== 0 || !metadataOnlyProjectionFields.scannerProjectionFieldsPresent.includes('scanType')){
    throw new Error('Metadata-only scanner projection must be present but not trusted/applied.');
  }
  const partialProjected = evidenceSandbox.analysisDerivedStatesFromRecord({
    scan:{analysisProjection:{pullback_zone:'near_20ma'}},
    review:{
      normalizedAnalysis:{
        ai_observation_only:true,
        coach_summary:'Trend broken and damaged, but this is AI observation only.',
        bounce_evidence:'Bounce attempt observed.'
      }
    }
  });
  if(partialProjected.derivedStateSource !== 'scanner_projection+ai_observation_hints' || partialProjected.aiObservationEvidenceApplied !== true || partialProjected.pullbackZone !== 'near_20ma' || partialProjected.structureState !== 'unknown' || partialProjected.bounceState !== '' || partialProjected.aiEvidenceStructureHint !== 'damaged_context' || !partialProjected.scannerProjectionTrustedFieldsApplied.includes('pullbackZone')){
    throw new Error('Partial scanner projection must merge per-field without allowing AI to emit canonical structure/bounce.');
  }
  const unknownStructurePromotion = resolverCore.resolveGlobalVerdict({
    ticker:'AINEUTRAL',
    in_watchlist:true,
    plan:{entry:100, stop:95, firstTarget:115},
    marketData:{price:101, ma20:100, ma50:98, ma200:90, currency:'USD'}
  }, {
    analysisDerivedStatesFromRecord:() => ({
      structureState:'unknown',
      trendState:'',
      bounceState:'confirmed',
      pullbackZone:'near_20ma',
      stabilisationState:'clear',
      volumeState:'strong'
    }),
    effectivePlanForRecord:() => ({entry:100, stop:95, firstTarget:115}),
    deriveCurrentPlanState:() => ({
      entry:100,
      stop:95,
      target:115,
      status:'valid',
      tradeability:'entry',
      rewardRisk:{valid:true, rrRatio:3},
      riskFit:{risk_status:'ok'},
      capitalFit:{capital_fit:'ok'}
    }),
    applySetupConfirmationPlanGate:(unusedRecord, displayedPlan) => displayedPlan,
    resolveFinalStateContract:() => ({
      finalVerdict:'Entry',
      structuralState:'entry',
      actionStateKey:'ready_to_act',
      planStatusKey:'valid',
      tradeabilityVerdict:'Entry',
      blockerReason:'',
      terminal:false,
      baseVerdict:'entry'
    }),
    resolvePreLifecycleStateContract:() => ({
      finalVerdict:'Entry',
      structuralState:'entry',
      actionStateKey:'ready_to_act',
      planStatusKey:'valid',
      tradeabilityVerdict:'Entry',
      blockerReason:'',
      terminal:false,
      baseVerdict:'entry'
    }),
    baseVerdictFromResolvedContract:() => 'entry',
    evaluatePlanRealism:() => ({credible_rr:3}),
    setupScoreForRecord:() => 9,
    scannerScoreGradientClass:() => '',
    isHostileMarketStatus:() => false,
    state:{marketStatus:''}
  });
  if(unknownStructurePromotion.entry_gate_pass === true || unknownStructurePromotion.near_entry_gate_pass === true){
    throw new Error('Unknown structure from AI fallback must not allow Entry/Near Entry promotion.');
  }
  const analyseSetupSource = fs.readFileSync(path.join(root, 'netlify/functions/analyse-setup.js'), 'utf8');
  if(!analyseSetupSource.includes('max_output_tokens: maxOutputTokens')
    || !analyseSetupSource.includes('buildRequestBody(model, instructions, activeContent, verificationOnly ? 600 : 1000)')){
    throw new Error('AI chart-coach endpoint must keep separate token budgets for verification-only and full-analysis requests.');
  }
  if(!analyseSetupSource.includes('buildVerificationOnlyContent(payload, chartRef)')
    || !analyseSetupSource.includes('const content = verificationOnly')
    || !analyseSetupSource.includes('Do not perform setup analysis.')
    || !analyseSetupSource.includes('Do not generate coaching, entry, stop, target, or verdict content.')){
    throw new Error('Verification-only backend requests must use a narrow chart-identity prompt path instead of the full setup-analysis prompt.');
  }
  if(/Entry, Near Entry, Watch, Monitor, Diminishing, Avoid, Buy, Sell, or Hold/.test(analyseSetupSource)){
    throw new Error('AI endpoint prompt must not prime explicit final app labels.');
  }
}

runAiContractAssertions();

function runPlanSemanticsAssertions(){
  const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const sandbox = {
    console,
    state:{marketStatus:''},
    numericOrNull:value => {
      if(value === null || value === undefined) return null;
      if(typeof value === 'string' && value.trim() === '') return null;
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    },
    fallbackPlanProposalForCard:() => null,
    resolverSeedVerdictForRecord:() => 'Watch',
    cloneData:(value, fallback) => value == null ? fallback : JSON.parse(JSON.stringify(value)),
    currentRiskSettings:() => ({}),
    currentMaxLoss:() => 40,
    currentAccountSizeGbp:() => 4000,
    evaluateRewardRisk:(entry, stop, target) => {
      const values = [entry, stop, target].map(Number);
      if(values.some(value => !Number.isFinite(value))) return {valid:false, rrRatio:null, riskPerShare:null, rewardPerShare:null, rrState:'invalid'};
      const risk = values[0] - values[1];
      const reward = values[2] - values[0];
      const valid = risk > 0 && reward > 0;
      return {valid, rrRatio:valid ? reward / risk : null, riskPerShare:risk, rewardPerShare:reward, rrState:valid ? 'valid' : 'invalid'};
    },
    evaluateRiskFit:({entry, stop}) => Number.isFinite(Number(entry)) && Number.isFinite(Number(stop)) && Number(entry) > Number(stop)
      ? {max_loss:40, risk_per_share:Number(entry) - Number(stop), position_size:8, risk_status:'fits_risk'}
      : {max_loss:40, risk_per_share:null, position_size:0, risk_status:'plan_missing'},
    evaluateCapitalFit:() => ({capital_fit:'acceptable', capital_ok:true, position_cost:800, position_cost_gbp:800}),
    deriveTradeability:(status, riskStatus) => status === 'valid' && riskStatus === 'fits_risk' ? 'tradable' : 'invalid',
    deriveAffordability:() => 'affordable',
    analysisDerivedStatesFromRecord:() => ({structureState:'intact', trendState:'uptrend', bounceState:'none', pullbackZone:'near_50ma', stabilisationState:'none', volumeState:'neutral'}),
    actionableRrValueForPlan:plan => plan && plan.status === 'valid' && plan.rewardRisk && plan.rewardRisk.valid ? plan.rewardRisk.rrRatio : null,
    evaluateSetupQualityAdjustments:() => ({weakRegimePenalty:false, lowControlSetup:false, tooWideForQualityPullback:false}),
    normalizeAnalysisVerdict:value => String(value || 'Watch'),
    getSetupUiState:() => ({state:'monitor'}),
    isHostileMarketStatus:() => false,
    planUiLabel:planValidity => planValidity === 'missing'
      ? 'No actionable plan yet'
      : (planValidity === 'valid' ? 'Plan valid' : (planValidity === 'needs_adjustment' ? 'Needs adjustment' : (planValidity === 'unrealistic_rr' ? 'Unrealistic R:R' : 'Invalid plan')))
  };
  vm.createContext(sandbox);
  [
    'hasAnyPlanFields',
    'effectivePlanForRecord',
    'planSourceForDiagnostics',
    'deriveCurrentPlanState',
    'planUiClass',
    'getPlanUiState',
    'evaluatePlanRealism'
  ].forEach(functionName => {
    vm.runInContext(extractFunctionSource(appSource, functionName), sandbox, {filename:`app.js#${functionName}`});
  });

  const noPlanRecord = {ticker:'NOPLAN', plan:{entry:null, stop:null, firstTarget:null, source:'manual'}, review:{manualReview:null}, scan:{}, marketData:{currency:'USD'}};
  const noPlanEffective = sandbox.effectivePlanForRecord(noPlanRecord, {allowScannerFallback:false});
  const noPlanState = sandbox.deriveCurrentPlanState(noPlanEffective.entry, noPlanEffective.stop, noPlanEffective.firstTarget, 'USD');
  const noPlanUi = sandbox.getPlanUiState(noPlanRecord, {displayedPlan:noPlanState, effectivePlan:noPlanEffective});
  const noPlanRealism = sandbox.evaluatePlanRealism(noPlanRecord, {displayedPlan:noPlanState});
  if(noPlanEffective.source === 'manual' || sandbox.planSourceForDiagnostics(noPlanRecord, noPlanEffective) === 'manual'){
    throw new Error('Missing AI/chart plan with no user-entered fields must not be diagnosed as manual.');
  }
  if(noPlanUi.state !== 'missing' || /Invalid plan/i.test(noPlanUi.label) || noPlanRealism.rr_realism_label !== 'N/A'){
    throw new Error('Missing generated plan must display as pending/no actionable plan with RR realism N/A.');
  }

  const partialManualRecord = {ticker:'PARTIAL', plan:{entry:100, stop:null, firstTarget:null, source:'manual'}, review:{manualReview:null}, scan:{}, marketData:{currency:'USD'}};
  const partialEffective = sandbox.effectivePlanForRecord(partialManualRecord, {allowScannerFallback:false});
  const partialState = sandbox.deriveCurrentPlanState(partialEffective.entry, partialEffective.stop, partialEffective.firstTarget, 'USD');
  const partialUi = sandbox.getPlanUiState(partialManualRecord, {displayedPlan:partialState, effectivePlan:partialEffective});
  if(sandbox.planSourceForDiagnostics(partialManualRecord, partialEffective) !== 'manual' || partialUi.state !== 'invalid'){
    throw new Error('User-entered incomplete plan fields may remain manual and invalid/incomplete.');
  }

  const validManualRecord = {ticker:'VALIDMANUAL', plan:{entry:100, stop:95, firstTarget:115, source:'manual'}, review:{manualReview:null}, scan:{}, marketData:{price:100, currency:'USD'}};
  const validEffective = sandbox.effectivePlanForRecord(validManualRecord, {allowScannerFallback:false});
  const validState = sandbox.deriveCurrentPlanState(validEffective.entry, validEffective.stop, validEffective.firstTarget, 'USD');
  if(sandbox.planSourceForDiagnostics(validManualRecord, validEffective) !== 'manual' || validState.status !== 'valid'){
    throw new Error('Complete manual plan must remain manual and use normal validation math.');
  }
  const validPricesWithoutConfirmation = {
    structure_state:'intact',
    trend_state:'uptrend',
    bounce_state:'none',
    stabilisation_state:'none',
    pullback_zone:'near_50ma',
    market_regime:'supportive',
    volume_state:'normal',
    plan_visible:true,
    plan_status:'valid',
    plan_blocked:false,
    has_entry:true,
    has_stop:true,
    entry:100,
    stop:95,
    target:115,
    rr:3,
    credible_rr:3,
    tradeability:'tradable',
    pullback_valid:true,
    entry_trigger_hit:false,
    stop_distance_too_wide:false,
    capital_fit:'acceptable',
    affordability:'affordable',
    price_below_50ma:false,
    price_below_200ma:false,
    ma50_below_200ma:false,
    terminal_avoid_applied:false
  };
  const caseCEntryGate = resolverCore.canPromoteToEntry(validPricesWithoutConfirmation);
  const caseCNearEntryGate = resolverCore.canPromoteToNearEntry(validPricesWithoutConfirmation);
  const caseCGuarded = resolverCore.applyPromotionGuards({final_verdict:'watch', reason:''}, validPricesWithoutConfirmation);
  if(caseCEntryGate.pass === true || caseCNearEntryGate.pass === true || caseCGuarded.final_verdict === 'entry' || caseCGuarded.final_verdict === 'near_entry'){
    throw new Error('Valid manual prices alone must not promote without bounce/stabilisation confirmation gates.');
  }
}

function runTrackPresentationAuthorityAssertions(){
  const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const authoritySandbox = {
    console,
    normalizeGlobalVerdictKey(value){
      const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
      if(safe === 'nearentry') return 'near_entry';
      if(['entry','near_entry','watch','avoid','monitor'].includes(safe)) return safe === 'monitor' ? 'watch' : safe;
      return 'watch';
    },
    normalizeVisualBucketForPairing(value){
      const safe = String(value || '').trim().toLowerCase();
      if(['entry','near_entry','diminishing','avoid'].includes(safe)) return safe;
      return 'monitor';
    },
    globalVerdictLabel(value){
      const safe = String(value || '').trim().toLowerCase();
      if(safe === 'entry') return 'Entry';
      if(safe === 'near_entry') return 'Near Entry';
      if(safe === 'avoid') return 'Avoid';
      return 'Watch';
    }
  };
  vm.createContext(authoritySandbox);
  [
    'normalizeUiCopy',
    'sameVisibleCopy',
    'resolvePresentationTone',
    'buildSharedSetupNarrative',
    'terminalAvoidEvidenceForReviewCopy',
    'terminalAvoidCopyPattern',
    'provisionalPlanConfirmationCopy',
    'sanitizeNonTerminalPlanCopy',
    'resolveTrackCardVisibleModel'
  ].forEach(functionName => {
    vm.runInContext(extractFunctionSource(appSource, functionName), authoritySandbox, {filename:`app.js#${functionName}`});
  });
  const model = authoritySandbox.resolveTrackCardVisibleModel({
    ticker:'LIN'
  }, {
    canonicalVerdict:'near_entry',
    visualBucket:'monitor',
    tone:'monitor',
    badgeLabel:'Near Entry',
    planVisible:false,
    planStatus:'valid',
    mainBlocker:'Low-priority watch - needs structure repair.',
    debug:{
      resolvedState:{
        viability:'low_priority',
        hasProvisionalPriceablePlan:true
      },
      derivedStates:{
        structureState:'strong',
        structureEligibility:'alive',
        bounceState:'attempt',
        volumeState:'weak'
      }
    }
  });
  if(model.canonicalVerdict !== 'near_entry' || model.visibleBucket !== 'near_entry' || model.tone !== 'near_entry' || model.badgeLabel !== 'Near Entry'){
    throw new Error('Track visible model must promote canonical near_entry to Near Entry tone and badge even when internal visualBucket is monitor.');
  }
  if(!/^Near Entry$/i.test(String(model.headline || ''))){
    throw new Error('Track visible model must keep the Near Entry state label as the visible headline.');
  }
  if(!/weak volume reduces confidence/i.test(String(model.primaryReason || ''))){
    throw new Error('Track visible model must explain weak-volume lower priority as the reason, not as a conflicting state label.');
  }
  if(!/Provisional plan exists - waiting for confirmation/i.test(String(model.planSummary || ''))){
    throw new Error('Track visible model must explicitly say a provisional plan exists for weak-volume Near Entry states.');
  }
  if(/needs structure repair/i.test(String(model.headline || '')) || /monitor/i.test(String(model.headline || ''))){
    throw new Error('Track visible model must not expose stale structure-repair or Monitor contradiction for alive strong Near Entry setups.');
  }
  const nonVolumeLowPriorityModel = authoritySandbox.resolveTrackCardVisibleModel({
    ticker:'LIN'
  }, {
    canonicalVerdict:'near_entry',
    visualBucket:'monitor',
    tone:'monitor',
    badgeLabel:'Near Entry',
    planVisible:false,
    planStatus:'valid',
    mainBlocker:'Low-priority watch - needs structure repair.',
    debug:{
      resolvedState:{
        viability:'low_priority',
        viabilityBranchReason:'Confirmation quality is still developing.',
        hasPriceablePlan:true
      },
      derivedStates:{
        structureState:'strong',
        structureEligibility:'alive',
        bounceState:'attempt',
        volumeState:'normal'
      }
    }
  });
  if(/volume is weak/i.test(String(nonVolumeLowPriorityModel.headline || ''))){
    throw new Error('Track visible model must not blame low-priority Near Entry states on weak volume unless volume is actually weak.');
  }
  if(!/^Near Entry$/i.test(String(nonVolumeLowPriorityModel.headline || ''))){
    throw new Error('Track visible model must keep the Near Entry label for non-volume low-priority states.');
  }
  if(!/confirmation|control of the rebound/i.test(String(nonVolumeLowPriorityModel.primaryReason || ''))){
    throw new Error('Track visible model must use neutral confirmation wording for non-volume low-priority Near Entry states.');
  }
  if(/needs structure repair/i.test(String(nonVolumeLowPriorityModel.headline || '')) || /monitor/i.test(String(nonVolumeLowPriorityModel.headline || ''))){
    throw new Error('Track visible model must not expose stale structure-repair or Monitor wording for non-volume low-priority Near Entry states.');
  }
  if(!/Valid plan calculations exist, but the trade is not actionable yet/i.test(String(nonVolumeLowPriorityModel.planSummary || ''))){
    throw new Error('Track visible model must explicitly say valid plan calculations exist when planStatus is valid but planVisible is false.');
  }
  if(!/provisional plan|valid plan calculations exist|waiting for confirmation/i.test(String(model.planSummary || ''))){
    throw new Error('Track visible model must describe valid provisional plans as pending confirmation, not missing.');
  }
  const developingWatchModel = authoritySandbox.resolveTrackCardVisibleModel({
    ticker:'ADI'
  }, {
    canonicalVerdict:'watch',
    visualBucket:'monitor',
    tone:'monitor',
    badgeLabel:'Watch',
    planVisible:false,
    planStatus:'missing',
    mainBlocker:'Conditions are not strong enough for active focus.',
    debug:{
      resolvedState:{
        hasClearInvalidationLevel:false,
        hasPriceablePlan:false
      },
      derivedStates:{
        structureState:'intact',
        structureEligibility:'alive',
        bounceState:'attempt',
        volumeState:'supportive',
        pullbackZone:'near_20ma'
      }
    }
  });
  if(developingWatchModel.canonicalVerdict !== 'watch' || developingWatchModel.visibleBucket !== 'monitor' || developingWatchModel.tone !== 'monitor'){
    throw new Error('Developing watch model must preserve watch/monitor final state.');
  }
  if(!/^Developing Watch$/i.test(String(developingWatchModel.headline || ''))){
    throw new Error('Alive monitor/watch setups with forming bounce and no invalidation must render the Developing Watch headline.');
  }
  if(!/bounce is still taking shape|buyers are starting to step in/i.test(String(developingWatchModel.primaryReason || ''))){
    throw new Error('Developing watch model must explain that the bounce is still taking shape.');
  }
  if(!/clear support level for managing risk/i.test(String(developingWatchModel.planSummary || '')) && !/clearer area of support/i.test(String(developingWatchModel.nextAction || ''))){
    throw new Error('Developing watch model must explain the missing support/risk context.');
  }
  if(!/wait for a stronger bounce and a clearer area of support/i.test(String(developingWatchModel.nextAction || ''))){
    throw new Error('Developing watch model must provide the clearer-support next action.');
  }
  if(/needs structure repair/i.test(String(developingWatchModel.headline || '')) || /needs structure repair/i.test(String(developingWatchModel.primaryReason || '')) || /volume is weak/i.test(String(developingWatchModel.primaryReason || '')) || /conditions are not strong enough for active focus/i.test(String(developingWatchModel.primaryReason || ''))){
    throw new Error('Developing watch model must not expose stale structure-repair, weak-volume, or generic conditions-not-strong-enough copy.');
  }
  const weakVolumeWatchModel = authoritySandbox.resolveTrackCardVisibleModel({
    ticker:'AMZN'
  }, {
    canonicalVerdict:'watch',
    visualBucket:'monitor',
    tone:'monitor',
    badgeLabel:'Watch',
    planVisible:false,
    planStatus:'missing',
    mainBlocker:'Conditions are not strong enough for active focus.',
    debug:{
      resolvedState:{
        hasClearInvalidationLevel:false,
        hasPriceablePlan:false
      },
      derivedStates:{
        structureState:'strong',
        structureEligibility:'alive',
        bounceState:'attempt',
        volumeState:'weak',
        pullbackZone:'near_50ma'
      }
    }
  });
  if(!/bounce is still taking shape|buyers are starting to step in/i.test(String(weakVolumeWatchModel.primaryReason || ''))){
    throw new Error('Weak-volume watch model must still keep the developing-bounce narrative as the primary reason.');
  }
  if(/volume is weak/i.test(String(weakVolumeWatchModel.primaryReason || ''))){
    throw new Error('Weak volume may be secondary caution, but it must not replace the primary blocker when no invalidation level exists.');
  }
  const refreshTraceModel = authoritySandbox.resolveTrackCardVisibleModel({
    ticker:'NFLX'
  }, {
    canonicalVerdict:'watch',
    visualBucket:'monitor',
    tone:'monitor',
    badgeLabel:'Watch',
    planVisible:false,
    planStatus:'missing',
    mainBlocker:'Bounce is forming.',
    debug:{
      previousState:'near_entry',
      transition:'near_entry -> watch',
      downgradeApplied:true,
      downgradeReason:'bounce_confirmation_lost',
      resolvedState:{},
      derivedStates:{
        structureState:'intact',
        structureEligibility:'alive',
        bounceState:'attempt',
        volumeState:'supportive'
      }
    }
  });
  if(/near_entry|downgrade|transition|previousState/i.test([refreshTraceModel.headline, refreshTraceModel.primaryReason, refreshTraceModel.planSummary, refreshTraceModel.nextAction].join(' '))){
    throw new Error('Track visible model must explain only the final state, not refresh transition trace.');
  }
  const sparseWatchModel = authoritySandbox.resolveTrackCardVisibleModel({
    ticker:'QQQ'
  }, {
    canonicalVerdict:'watch',
    visualBucket:'monitor',
    tone:'monitor',
    badgeLabel:'Watch',
    planVisible:false,
    planStatus:'missing',
    mainBlocker:'',
    actionLabel:'',
    debug:{
      resolvedState:{},
      derivedStates:{}
    }
  });
  if(!String(sparseWatchModel.headline || '').trim()){
    throw new Error('Track visible model must always provide a non-empty headline.');
  }
  if(authoritySandbox.sameVisibleCopy(sparseWatchModel.headline, sparseWatchModel.primaryReason)){
    throw new Error('Sparse watch model must not duplicate headline and primaryReason.');
  }
  const duplicateSuppressionModel = authoritySandbox.resolveTrackCardVisibleModel({
    ticker:'META'
  }, {
    canonicalVerdict:'watch',
    visualBucket:'monitor',
    tone:'monitor',
    badgeLabel:'Watch',
    planVisible:false,
    planStatus:'missing',
    mainBlocker:'Conditions are not strong enough for active focus.',
    debug:{
      resolvedState:{},
      derivedStates:{
        structureState:'unknown',
        structureEligibility:'',
        bounceState:'',
        volumeState:'normal'
      }
    }
  });
  if(authoritySandbox.sameVisibleCopy(duplicateSuppressionModel.headline, duplicateSuppressionModel.primaryReason)){
    throw new Error('Track visible model must suppress duplicate primaryReason when it normalizes equal to headline.');
  }
  const visiblePlanFallbackModel = authoritySandbox.resolveTrackCardVisibleModel({
    ticker:'SHOP'
  }, {
    canonicalVerdict:'near_entry',
    visualBucket:'near_entry',
    tone:'near_entry',
    badgeLabel:'Near Entry',
    planVisible:true,
    planStatus:'valid',
    mainBlocker:'',
    debug:{
      resolvedState:{},
      derivedStates:{
        structureState:'strong',
        structureEligibility:'alive',
        bounceState:'confirmed',
        volumeState:'supportive'
      }
    }
  });
  if(!/^Trade plan available\.$/i.test(String(visiblePlanFallbackModel.planSummary || ''))){
    throw new Error('Track visible model must never leak raw planStatus in visible plan copy when plan is visible.');
  }
  const hiddenPlanFallbackModel = authoritySandbox.resolveTrackCardVisibleModel({
    ticker:'CRM'
  }, {
    canonicalVerdict:'watch',
    visualBucket:'monitor',
    tone:'monitor',
    badgeLabel:'Watch',
    planVisible:false,
    planStatus:'missing',
    mainBlocker:'',
    debug:{
      resolvedState:{},
      derivedStates:{}
    }
  });
  if(!/No actionable trade plan yet|waiting for confirmation|not actionable yet|plan needs confirmation|Bounce is not clear enough to price yet|Wait for the chart to provide a cleaner entry structure/i.test(String(hiddenPlanFallbackModel.planSummary || '')) || /^missing$/i.test(String(hiddenPlanFallbackModel.planSummary || ''))){
    throw new Error('Track visible model must provide friendly hidden-plan copy when no plan summary exists, and must not leak raw plan status.');
  }
  if(!/const trackVisibleModel = resolveTrackCardVisibleModel\(record, simplifiedState\);/.test(appSource)
    || !/decision_summary:String\(trackVisibleModel\.headline/.test(appSource)
    || !/const visualBucket = normalizeVisualBucketForPairing\(trackVisibleModel\.visibleBucket \|\| 'monitor'\);/.test(appSource)
    || !/const tone = String\(trackVisibleModel\.tone \|\| visualBucket \|\| 'monitor'\)/.test(appSource)
    || !/trackVisibleModel\.planSummary/.test(appSource)
    || !/trackVisibleModel\.primaryReason/.test(appSource)
    || !/trackVisibleModel\.nextAction/.test(appSource)
    || !/sameVisibleCopy\(trackVisibleModel\.primaryReason, decisionSummary\)/.test(appSource)){
    throw new Error('Track card render must source visible state from resolveTrackCardVisibleModel rather than layered legacy fields.');
  }
  if(/decision_summary:presentation\.presentationReason/.test(appSource) || /reason:presentation\.presentationReason/.test(appSource)){
    throw new Error('Legacy presentationReason must not feed non-debug visible Track render paths.');
  }
  if(!/trackDebug\s*=\s*\{/.test(appSource) || !/visibleModel:\s*\{/.test(appSource) || !/resolverTrace:\s*\{/.test(appSource) || !/planTrace:\s*\{/.test(appSource) || !/gateTrace:\s*\{/.test(appSource) || !/lifecycleTrace:\s*\{/.test(appSource)){
    throw new Error('Track debug output must use one namespaced trackDebug structure.');
  }
  if(/Final Verdict Rendered|Canonical Final Verdict|Track Visual Bucket|Scan Visual Bucket|Presentation Reason/.test(appSource)){
    throw new Error('Watchlist debug output must not print redundant flat Track state aliases.');
  }
  if(!/if\(!showExpired\)\{\s*purgeExpiredWatchlistEntries\(\);/s.test(appSource)){
    throw new Error('Show Expired watchlist filter must not purge expired entries before rendering.');
  }
  if(!/if\(startupCoordinator\.renderedTabs\.track && !forceFullRender\)\{\s*requestWatchlistRender\(\{\s*source:'track_tab_activation',\s*includeFocusQueue:true/s.test(appSource)){
    throw new Error('Track focus should request a Track render refresh instead of silently returning on cached state.');
  }
  if(!/const lifecycleRefresh = maybeRunTrackFocusLifecycleRefresh\(\{source:'track_focus'\}\);\s*const focusRefresh = maybeRunTrackFocusWatchlistRefresh\(\{source:'track_focus'\}\);/s.test(appSource)){
    throw new Error('Track focus should evaluate the guarded focus-refresh path alongside lifecycle refresh.');
  }
  if(!/function maybeRunTrackFocusWatchlistRefresh\(options = \{\}\)\{/.test(appSource)){
    throw new Error('Track focus should retain the guarded focus-refresh helper.');
  }
  if(!/function trackRefreshFreshnessTimestamp\(\)\{/.test(appSource)
    || !/function trackRefreshFreshnessAgeMs\(now = Date\.now\(\)\)\{/.test(appSource)
    || !/function markTrackRefreshFreshness\(source, summary = null\)\{/.test(appSource)){
    throw new Error('Track focus refresh should use dedicated freshness helpers for stale-decision control.');
  }
  if(!/return String\(trackRefreshRuntime\.lastSuccessfulTrackFocusRefreshAt \|\| ''\)\.trim\(\);/.test(appSource)){
    throw new Error('Track focus TTL decisions must use the dedicated Track-focus freshness timestamp only.');
  }
  if(!/refreshTrackOnly\(\{\s*source:'track_focus_refresh',\s*force:false,\s*clearReviewOverride:false\s*\}\)/s.test(appSource)){
    throw new Error('Track focus refresh should use the guarded track refresh path without clearing active review overrides.');
  }
  if(!/else if\(!watchlistDirty && freshWithinTtl\) skipReason = 'fresh_within_ttl';/.test(appSource)
    || !/\[TRACK_FOCUS_REFRESH_CHECK\]/.test(appSource)
    || !/\[TRACK_FOCUS_REFRESH_SKIPPED\]/.test(appSource)
    || !/\[TRACK_FOCUS_REFRESH_START\]/.test(appSource)
    || !/\[TRACK_FOCUS_REFRESH_DONE\]/.test(appSource)){
    throw new Error('Track focus refresh should log the TTL-based skip/run decision during this audit pass.');
  }
  if(!/refreshSummary = await refreshWatchlistRecordsFromSourceOfTruth\(\{\s*source,\s*trackOnly:true,\s*mode:'incremental',\s*force:options\.force === true,\s*render:false,\s*persist:true,\s*clearReviewOverride:options\.clearReviewOverride\s*\}\)/s.test(appSource)){
    throw new Error('Track refresh should pass through clearReviewOverride so focus refresh does not mutate Review state unexpectedly.');
  }
  if(!/const committedCount = results\.filter\(result => result && result\.ok === true && result\.skipped !== true\)\.length;/.test(appSource)
    || !/if\(attempted <= 0 \|\| committedCount !== attempted \|\| skippedCount > 0 \|\| failed > 0\) return false;/.test(appSource)
    || !/summary\.freshnessAdvanced = freshnessAdvanced;/.test(appSource)
    || !/freshnessAdvanced:refreshSummary && refreshSummary\.freshnessAdvanced === true/.test(appSource)){
    throw new Error('Successful watchlist refreshes must advance and expose the freshness marker.');
  }
  if(!/if\(firstUserOpen\)\{\s*renderWatchlist\(\{\s*source:'track_first_open_sync',\s*allowCachedReturn:false/s.test(appSource)){
    throw new Error('First Track focus should use a synchronous watchlist render so the active bucket is populated immediately.');
  }
  if(!/\[TRACK_BUCKET_TOGGLE\]/.test(appSource) || !/\[TRACK_SHOW_EXPIRED_TOGGLE\]/.test(appSource) || !/\[TRACK_RENDER_BUCKETS\]/.test(appSource)){
    throw new Error('Track bucket investigation logs must be present during this diagnostic pass.');
  }
  if(!/function renderWatchlistCardElement\(record, options = \{\}\)\{\s*const entry = tickerRecordToWatchlistEntry\(record\);\s*if\(!entry\) return null;\s*const debug = record && record\.watchlist && record\.watchlist\.debug && typeof record\.watchlist\.debug === 'object'\s*\?\s*record\.watchlist\.debug\s*:\s*\{\};/s.test(appSource)){
    throw new Error('Track watchlist card render must guard missing debug state and must not reference an undefined debug object.');
  }
  if(!/function trackCardRenderSignatureSnapshot\(record\)\{\s*const item = normalizeTickerRecord\(record \|\| \{\}\);\s*const passCache = null;[\s\S]*const simplifiedState = resolveSimplifiedStateForWatchlistPresentation\(item, \{\s*surface:'track',\s*source:'track_card_render_signature_snapshot',\s*reason:'trackCardRenderSignatureSnapshot',\s*passCache\s*\}\);/s.test(appSource)){
    throw new Error('Track card render signature snapshot must initialize simplifiedState before using it during watchlist refresh diffing.');
  }
  if(!/if\(pending && pending\.loadStarted === true\)\{\s*return;\s*\}/s.test(appSource)){
    throw new Error('Watchlist refresh release should skip replay when the pending review load has already started.');
  }
  if(!/loadTickerIntoReview\(pending\.ticker, \{\s*\.\.\.\(pending\.options \|\| \{\}\),\s*forceNow:true,\s*reviewRequestToken:pending\.reviewRequestToken/s.test(appSource)){
    throw new Error('Watchlist refresh release should replay the pending review request only when it has not already started.');
  }
}

runTrackPresentationAuthorityAssertions();
runPlanSemanticsAssertions();

console.log(`Resolver gate assertions passed (${results.length} cases).`);
console.log('Review projection invariant assertions passed.');
console.log('Watchlist long-press summary assertions passed.');
console.log('Simplified state pipeline assertions passed.');
console.log('AI chart-coach contract assertions passed.');
console.log('Track presentation authority assertions passed.');
console.log('Plan source semantics assertions passed.');
