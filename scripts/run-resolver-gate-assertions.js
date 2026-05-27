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
  const explicitProvenanceSource = extractFunctionSource(appSource, 'chartVerificationHasExplicitRegionProvenance');
  const chartDecisionClassNameSource = extractFunctionSource(appSource, 'chartDecisionClassName');
  const panelStateSource = extractFunctionSource(appSource, 'chartVerificationPanelState');
  const panelStateSandbox = {};
  vm.createContext(panelStateSandbox);
  vm.runInContext(verifiedStatusSource, panelStateSandbox, {filename:'app.js#chartVerificationIsVerifiedStatus'});
  vm.runInContext(explicitProvenanceSource, panelStateSandbox, {filename:'app.js#chartVerificationHasExplicitRegionProvenance'});
  vm.runInContext(chartDecisionClassNameSource, panelStateSandbox, {filename:'app.js#chartDecisionClassName'});
  vm.runInContext('this.chartVerificationIsVerifiedStatus = chartVerificationIsVerifiedStatus; this.chartVerificationHasExplicitRegionProvenance = chartVerificationHasExplicitRegionProvenance;', panelStateSandbox);
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
  const manualActionsSource = extractFunctionSource(appSource, 'chartVerificationShouldShowManualActions');
  if(!manualActionsSource.includes("manualEligibleStatuses")
    || !manualActionsSource.includes("timeframeMissingButExpected")
    || !manualActionsSource.includes("aiAnalysisSuppressed")
    || !manualActionsSource.includes("['queued', 'running'].includes(normalizedQuickStatus) && !hasResolvedTrace")){
    throw new Error('Manual chart override logic must keep resolved untrusted states visible after quick-analysis completion.');
  }
  const manualConfirmSource = extractFunctionSource(appSource, 'confirmReviewChartMatchesCurrentTicker');
  if(!manualConfirmSource.includes('chartVerificationCommittedTrace = cloneData(record.review.chartVerificationTrace, null);')
    || !manualConfirmSource.includes("aiAnalysisSuppressed:false")
    || !manualConfirmSource.includes("suppressionReason:''")
    || !manualConfirmSource.includes("analyseSetup(symbol, {source:'manual_chart_confirm'}).catch(() => {});")){
    throw new Error('Manual chart confirmation must commit the verified trace and trigger a fresh AI analysis run.');
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
  const inheritTraceRequestIdSource = extractFunctionSource(appSource, 'inheritChartTraceRequestIdForCurrentContext');
  const sanitizeChartIdentitySource = extractFunctionSource(appSource, 'sanitizeChartAssessorVisibleIdentity');
  const explicitProvenanceVersionSource = extractFunctionSource(appSource, 'hasExplicitChartIdentityProvenanceVersion');
  const strictProvenanceVersionSource = extractFunctionSource(appSource, 'isStrictChartIdentityProvenanceAnalysis');
  if(!displayedChartContextSource.includes('imageId:String(previewRef && previewRef.imageId || chartImageIdForReview(safe) || \'\')')
    || !displayedChartContextSource.includes('filename:String(previewRef && previewRef.name || attachmentContext && attachmentContext.name || safe.chartRef && safe.chartRef.name || \'\')')){
    throw new Error('Displayed chart context must be derived from the same attachment object used by the renderer.');
  }
  if(!currentChartContextSource.includes('attachmentContext && attachmentContext.requestId')
    || !currentChartContextSource.includes('quick && (quick.requestId || quick.verificationRequestId)')
    || !currentChartContextSource.includes('lifecycle && (lifecycle.requestId || lifecycle.verificationRequestId)')
    || !currentChartContextSource.includes("requestId = String(runtime.requestId || '');")){
    throw new Error('Current chart context must unify request ownership from attachment, quick, lifecycle, and runtime state.');
  }
  if(!inheritTraceRequestIdSource.includes('[CHART_TRACE_REQUEST_ID_INHERITED]')
    || !inheritTraceRequestIdSource.includes('!inheritedRequestId || previousTraceRequestId')
    || !inheritTraceRequestIdSource.includes('verificationRequestId:inheritedRequestId')
    || !inheritTraceRequestIdSource.includes('requestId:inheritedRequestId')){
    throw new Error('Pending deterministic traces must inherit request ids only from matching current chart context.');
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
    || !chartAiSummaryGuardSource.includes("quickStatus === 'running'")){
    throw new Error('AI summary guard must block current rendering while quick chart analysis is still running for the same chart.');
  }
  const aiCommitGateSource = extractFunctionSource(appSource, 'canCommitAiSummaryForChart');
  if(!aiCommitGateSource.includes("['committed', 'failed', 'timeout'].includes")
    || !aiCommitGateSource.includes('requestedImageId === quickImageId')
    || !aiCommitGateSource.includes('requestedRequestId === quickRequestId')){
    throw new Error('AI summary commit gate must require terminal quick status for the same ticker/image/request context.');
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
  const chartTraceSelectorSource = extractFunctionSource(appSource, 'selectReviewChartTraceForRender');
  const handleWorkspaceTabChangeSource = extractFunctionSource(appSource, 'handleWorkspaceTabChange');
  const reconcileVisibleReviewStateSource = extractFunctionSource(appSource, 'reconcileVisibleReviewState');
  const renderNeutralReviewPendingStateSource = extractFunctionSource(appSource, 'renderNeutralReviewPendingState');
  if(!chartTraceSelectorSource.includes('CHART_RENDER_BLOCKED_QUICK_RUNNING')
    || !chartTraceSelectorSource.includes('const mergedCandidatesAllowed = quickRunningForCurrentChart ? [] : mergedMatchingCandidates;')
    || !chartTraceSelectorSource.includes('inheritChartTraceRequestIdForCurrentContext(candidate.trace, currentChartContext')){
    throw new Error('Chart trace selection must block merged/post-AI traces while quick verification is still running.');
  }
  const queueQuickSource = extractFunctionSource(appSource, 'queueReviewQuickChartAnalysis');
  if(queueQuickSource.includes("review.quickChartAnalysis.status = 'running';")
    || !queueQuickSource.includes("analyseSetup(liveItem.ticker || item.ticker, {source:'chart_upload'}).catch(() => {});")){
    throw new Error('Bypass quick-analysis uploads must not create running quick state before a request id exists.');
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
    || !reviewWorkspaceSource.includes("status:'unknown_chart_identity'")
    || !reviewWorkspaceSource.includes('displayedImageId !== renderContextSnapshot.verificationImageId')
    || !reviewWorkspaceSource.includes('box.dataset.renderedReviewTicker = normalizeTicker(record.ticker || \'\');')
    || !reviewWorkspaceSource.includes('box.dataset.renderedReviewRequestToken = String(currentRenderedReviewRequestToken() || \'\');')){
    throw new Error('Review render must snapshot displayed-vs-verification chart context and refuse verified rendering on image mismatch.');
  }
  const appAnalyseSetupSource = extractFunctionSource(appSource, 'analyseSetup');
  const chartAssessorInputSource = extractFunctionSource(appSource, 'buildChartAssessorInput');
  const chartAssessorToNormalizedSource = extractFunctionSource(appSource, 'chartAssessorInputToNormalizedAnalysis');
  const getReviewAnalysisStateSource = extractFunctionSource(appSource, 'getReviewAnalysisState');
  const successfulSameContextSource = extractFunctionSource(appSource, 'hasSuccessfulCompletedAnalysisForCurrentChartContext');
  const quickCommittedContextSource = extractFunctionSource(appSource, 'quickAnalysisCommittedForCurrentChartContext');
  const reviewQuickChartStateSource = extractFunctionSource(appSource, 'reviewQuickChartAnalysisState');
  const maybeLogIncompleteSource = extractFunctionSource(appSource, 'maybeLogQuickChartAnalysisContextIncomplete');
  const aiSummaryGuardSource = extractFunctionSource(appSource, 'chartAiSummaryRenderGuard');
  const analysisPanelSource = extractFunctionSource(appSource, 'renderAnalysisPanelFromRecord');
  if(appAnalyseSetupSource.indexOf('[QUICK_CHART_ANALYSIS_COMMITTED]') === -1
    || appAnalyseSetupSource.indexOf('[AI_SUMMARY_READY]') === -1
    || !appAnalyseSetupSource.includes("const analysisSource = String(options.source || 'unknown');")
    || !appAnalyseSetupSource.includes('[CHART_ANALYSIS_REQUEST_START]')
    || !appAnalyseSetupSource.includes('[CHART_ANALYSIS_REQUEST_SKIPPED_DUPLICATE_IMAGE]')
    || !appAnalyseSetupSource.includes('[CHART_ANALYSIS_REQUEST_NOT_DEDUPED_REQUEST_MISMATCH]')
    || !appAnalyseSetupSource.includes('[CHART_CONTEXT_AT_VERIFICATION_START]')
    || !appAnalyseSetupSource.includes('autoAnalysisSource && requestChartImageId && quickAlreadyCommittedForCurrentContext && analysisAlreadyCommittedForCurrentContext')
    || appAnalyseSetupSource.indexOf('[QUICK_CHART_ANALYSIS_COMMITTED]') > appAnalyseSetupSource.indexOf('const aiSummaryCommitPayload = {')
    || !appAnalyseSetupSource.includes("status:'committed'")
    || !appAnalyseSetupSource.includes("stagePendingAiSummaryForChart(record, aiSummaryCommitPayload, 'quick_running')")
    || !appAnalyseSetupSource.includes("applyCommittedAiSummaryForChart(record, aiSummaryCommitPayload)")
    || !appAnalyseSetupSource.includes("flushPendingAiSummaryForChart(record, {source:'analyse_setup_failed'})")){
    throw new Error('AI summary commit must remain sequenced after quick chart analysis commit in the analysis path.');
  }
  if(!appAnalyseSetupSource.includes("requestId:analysisRequestId,")
    || !appAnalyseSetupSource.includes("status:'running'")
    || !appAnalyseSetupSource.includes("maybeLogQuickChartAnalysisContextIncomplete(record, record.review.quickChartAnalysis, 'analyse_setup_start');")
    || !appAnalyseSetupSource.includes('sanitizeChartAssessorVisibleIdentity(')){
    throw new Error('Quick chart analysis must persist request id as soon as it enters running state.');
  }
  if(!appAnalyseSetupSource.includes('!isStrictChartIdentityProvenanceAnalysis(normalizedLiveAnalysis)')
    || !appAnalyseSetupSource.includes('normalizedLiveAnalysis.chartIdentityProvenanceVersion = 1')){
    throw new Error('Live analyseSetup results must upgrade any non-strict analysis into strict provenance mode before sanitization.');
  }
  if(!appAnalyseSetupSource.includes("{caller:'analyse_setup_live'}")
    || !extractFunctionSource(appSource, 'buildChartConsistencyTrace').includes("{caller:'build_chart_consistency_trace'}")){
    throw new Error('Chart assessor sanitization must log its live and merged caller sources.');
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
  if(!reviewQuickChartStateSource.includes('storedMatchesCurrentContext')
    || !reviewQuickChartStateSource.includes("String(stored.requestId || '') === String(currentContext.requestId || '')")){
    throw new Error('Quick chart analysis state must preserve same-image/same-request committed state even when the stored key drifts.');
  }
  if(!appAnalyseSetupSource.includes('[CHART_ANALYSIS_DUPLICATE_RUNNING_BYPASSED_FOR_REPLACEMENT]')
    || !appAnalyseSetupSource.includes('[CHART_REPLACEMENT_ANALYSIS_SUPERSEDES_RUNNING]')
    || !appAnalyseSetupSource.includes('[CHART_ANALYSIS_DUPLICATE_RUNNING_IGNORED]')
    || !appAnalyseSetupSource.includes("const replacementUploadSupersedesRunning = analysisSource === 'chart_upload'")
    || !appAnalyseSetupSource.includes("clearReviewAiAnalysis(ticker);")){
    throw new Error('Replacement chart uploads must supersede same-ticker running analysis, while ordinary duplicate clicks stay ignored.');
  }
  if(!maybeLogIncompleteSource.includes("[QUICK_CHART_ANALYSIS_CONTEXT_INCOMPLETE]")
    || !maybeLogIncompleteSource.includes("['running', 'committed', 'failed', 'timeout'].includes(status)")
    || !maybeLogIncompleteSource.includes("const requestIdKey = String(requestId || 'missing_request_id');")){
    throw new Error('Incomplete quick-analysis context must be detected and logged for terminal/running states with missing request ids.');
  }
  if(!aiSummaryGuardSource.includes("if(!allowedToRender && reason !== 'quick_running')")){
    throw new Error('Quick-running AI summary gating must not be classified as stale context.');
  }
  if(!analysisPanelSource.includes('shouldLogAiSummaryQuickRunningWait(item, summaryGuard)')){
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
  if(!quickCommittedContextSource.includes('String(quick.requestId || \'\') === requestedRequestId')
    || !quickCommittedContextSource.includes('String(quick.status || \'\') === \'committed\'')){
    throw new Error('Quick-analysis dedupe must require committed quick status for the same request id.');
  }
  if(!appSource.includes("analyseSetup(liveItem.ticker || item.ticker, {source:'chart_upload'}).catch(() => {});")
    || !appSource.includes("analyseSetup(symbol, {source:'review_render_queue'});")
    || !appSource.includes("analyseSetup(record.ticker, {source:'manual_button'});")
    || !appSource.includes("analyseSetup(symbol, {source:'manual_chart_confirm'}).catch(() => {});")){
    throw new Error('Analyse Setup callers must pass explicit request sources for duplicate-request audits.');
  }
  const aiGateSandbox = {
    normalizeTicker(value){ return String(value || '').trim().toUpperCase(); }
  };
  vm.createContext(aiGateSandbox);
  vm.runInContext(aiCommitGateSource, aiGateSandbox, {filename:'app.js#canCommitAiSummaryForChart'});
  const gateBlocked = aiGateSandbox.canCommitAiSummaryForChart({
    record:{
      ticker:'NVDA',
      review:{
        quickChartAnalysis:{
          ticker:'NVDA',
          chartImageId:'img-1',
          requestId:'req-1',
          status:'running'
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
        quickChartAnalysis:{
          ticker:'NVDA',
          chartImageId:'img-1',
          requestId:'req-1',
          status:'committed'
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
        quickChartAnalysis:{
          ticker:'LIN',
          chartImageId:'img-2',
          requestId:'req-2',
          status:'committed'
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
  vm.runInContext(quickCommittedContextSource, sameImageDedupeSandbox, {filename:'app.js#quickAnalysisCommittedForCurrentChartContext'});
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
  const quickContextMatch = sameImageDedupeSandbox.quickAnalysisCommittedForCurrentChartContext({
    ticker:'NVDA',
    review:{ quickChartAnalysis:{ ticker:'NVDA', chartImageId:'img-1', requestId:'req-1', status:'committed' } }
  }, {ticker:'NVDA', imageId:'img-1', requestId:'req-1'});
  const quickContextMismatch = sameImageDedupeSandbox.quickAnalysisCommittedForCurrentChartContext({
    ticker:'NVDA',
    review:{ quickChartAnalysis:{ ticker:'NVDA', chartImageId:'img-1', requestId:'req-A', status:'committed' } }
  }, {ticker:'NVDA', imageId:'img-1', requestId:'req-B'});
  if(dedupeSuccess !== true || dedupeFailed !== false || dedupeRawOnly !== false || dedupePending !== false || dedupeRequestMismatch !== false || quickContextMatch !== true || quickContextMismatch !== false){
    throw new Error('Same-image dedupe must only suppress matching committed chart context, not failed, raw-only, pending, or request-mismatched states.');
  }
  const chartUiDecisionSource = extractFunctionSource(appSource, 'chartVerificationUiDecision');
  const chartRelevantMaRequirementSource = extractFunctionSource(appSource, 'getStrategyRelevantMaRequirement');
  const chartCoreIdentityMatchSource = extractFunctionSource(appSource, 'chartVerificationHasCoreIdentityMatch');
  const chartPrimaryIndicatorSupportSource = extractFunctionSource(appSource, 'chartVerificationHasPrimaryIndicatorSupport');
  const chartSupportsPartialSource = extractFunctionSource(appSource, 'chartVerificationSupportsNonBlockingIndicatorPartial');
  const chartFastPassSource = extractFunctionSource(appSource, 'buildChartVerificationFastPass');
  const explicitProvenanceFnSource = extractFunctionSource(appSource, 'chartVerificationHasExplicitRegionProvenance');
  const chartRenderSource = extractFunctionSource(appSource, 'renderChartConsistencyTrace');
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
  vm.runInContext(chartUiDecisionSource, chartSandbox, {filename:'app.js#chartVerificationUiDecision'});
  vm.runInContext(explicitProvenanceFnSource, chartSandbox, {filename:'app.js#chartVerificationHasExplicitRegionProvenance'});
  vm.runInContext(chartDecisionClassNameSource, chartSandbox, {filename:'app.js#chartDecisionClassName'});
  vm.runInContext(chartFastPassSource, chartSandbox, {filename:'app.js#buildChartVerificationFastPass'});
  vm.runInContext(chartRenderSource, chartSandbox, {filename:'app.js#renderChartConsistencyTrace'});
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
  const verifiedPanelHtml = chartSandbox.renderChartConsistencyTrace({
    visible:true,
    status:'verified_match',
    summary:'Chart and scanner data are consistent.',
    title:'Chart verified',
    extractedFacts:{
      visible_ticker:'DINO',
      visible_timeframe:'1D',
      visible_latest_price:70.3,
      visible_ma20:67.43,
      visible_ma50:62.37,
      visible_ma200:53.89
    },
    trustedFacts:{
      ticker:'DINO',
      expected_timeframe:'1D',
      latest_price:70.3,
      ma20:67.43,
      ma50:62.37,
      ma200:53.89
    },
    evidence:['Ticker, price, and indicators align.'],
    sources:['deterministic_chart_verification'],
    chartImageSource:{sourceKind:'chartImageOriginal', originalDimensions:'1920x1080', previewDimensions:'480x270', verificationSourceDimensions:'1920x1080'}
  });
  if(!/Read from chart:/i.test(verifiedPanelHtml) || !/Expected:/i.test(verifiedPanelHtml) || !/20MA 67\.43/i.test(verifiedPanelHtml)){
    throw new Error('Verified chart traces must show key extracted/trusted facts inline.');
  }
  const mismatchPanelHtml = chartSandbox.renderChartConsistencyTrace({
    visible:true,
    status:'ticker_mismatch',
    summary:'Uploaded chart appears to show ETR, but this review is for DINO.',
    title:'Ticker mismatch',
    evidence:['Uploaded chart appears to show ETR, but this review is for DINO.'],
    extractedFacts:{visible_ticker:'ETR', visible_timeframe:'1D', visible_latest_price:88.12},
    trustedFacts:{ticker:'DINO', expected_timeframe:'1D', latest_price:70.3},
    sources:['deterministic_chart_verification'],
    chartImageSource:{sourceKind:'chartImageOriginal', originalDimensions:'1920x1080', previewDimensions:'480x270', verificationSourceDimensions:'1920x1080'}
  });
  if(!/Evidence:/i.test(mismatchPanelHtml) || !/ETR/i.test(mismatchPanelHtml) || !/DINO/i.test(mismatchPanelHtml)){
    throw new Error('Mismatch chart traces must expose explanatory evidence inline.');
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
    'chartVerificationHasExplicitRegionProvenance',
    'chartVerificationTracePriority',
    'annotateChartTraceForRender',
    'currentReviewChartContext',
    'inheritChartTraceRequestIdForCurrentContext',
    'chartAssessorInputToNormalizedAnalysis',
    'selectReviewChartTraceForRender',
    'chartImageDimensionsFromRef',
    'chartImageDimensionsLabel',
    'buildChartImageSourceTrace',
    'hasVerifiableReviewChartSource',
    'chartImageForAnalysis',
    'clearReviewChartImageSources',
    'maybeLogQuickChartAnalysisContextIncomplete',
    'reviewQuickChartAnalysisKey',
    'reviewQuickChartAnalysisState',
    'confirmReviewChartMatchesCurrentTicker',
    'rejectReviewChartAndUploadAnother',
    'debugFlagEnabled',
    'getStrategyRelevantMaRequirement',
    'chartVerificationHasCoreIdentityMatch',
    'chartVerificationHasPrimaryIndicatorSupport',
    'chartVerificationSupportsNonBlockingIndicatorPartial',
    'chartVerificationUiDecision',
    'chartDecisionClassName',
    'ensureReviewChartLightboxShell',
    'closeReviewChartLightbox',
    'openReviewChartLightbox',
    'clearStartupReviewSessionState',
    'buildDeterministicChartVerification',
    'buildChartConsistencyTrace',
    'chartVerificationAiSuppression',
    'chartAiSummaryRenderGuard',
    'renderSuppressedAiAnalysisPanel',
    'renderChartConsistencyTrace',
    'chartVerificationIsVerifiedStatus',
    'chartVerificationHasExplicitRegionProvenance',
    'chartVerificationShouldShowManualActions',
    'getReviewChartVerificationState',
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
  const consistentTrace = evidenceSandbox.buildChartConsistencyTrace(
    {ticker:'OK', review:{chartRef:{dataUrl:'data:image/png;base64,abc', width:900, height:1600}, chartImageOriginal:{width:900, height:1600, dataUrlField:'chartRef.dataUrl'}, chartImageVerificationSource:{source:'chartImageOriginal', width:900, height:1600}, normalizedAnalysis:{
      chart_match_status:'match',
      coach_summary:'Strong trend with a normal pullback attempt.',
      constructive_evidence:['Structure looks intact.'],
      risk_evidence:[],
      uncertainty_notes:[]
    }}},
    {canonicalVerdict:'watch', visualBucket:'monitor'},
    {derivedStates:{structureState:'intact', bounceState:'attempt', pullbackZone:'near_20ma'}}
  );
  if(consistentTrace.visible !== false || consistentTrace.status !== 'consistent'){
    throw new Error('Consistent scanner and AI evidence should not render a chart mismatch trace.');
  }
  const mismatchTrace = evidenceSandbox.buildChartConsistencyTrace(
    {ticker:'MISS', review:{chartRef:{dataUrl:'data:image/png;base64,abc'}, normalizedAnalysis:{
      chart_match_status:'mismatch',
      chart_match_warning:'The uploaded chart appears to show a different ticker.',
      uncertainty_notes:['Ticker symbol is unclear.']
    }}},
    {canonicalVerdict:'watch', visualBucket:'monitor'},
    {derivedStates:{structureState:'intact', bounceState:'attempt', pullbackZone:'near_20ma'}}
  );
  if(mismatchTrace.visible !== true || mismatchTrace.status !== 'possible_mismatch' || !mismatchTrace.sources.includes('chart_match_status')){
    throw new Error('AI chart mismatch evidence must produce a visible possible_mismatch trace.');
  }
  const conflictTrace = evidenceSandbox.buildChartConsistencyTrace(
    {ticker:'CONFLICT', review:{chartRef:{dataUrl:'data:image/png;base64,abc'}, normalizedAnalysis:{
      chart_match_status:'match',
      coach_summary:'The trend looks broken and damaged, with failed structure.',
      risk_evidence:['Structure failed badly.']
    }}},
    {canonicalVerdict:'watch', visualBucket:'monitor', planStatus:'valid'},
    {derivedStates:{structureState:'strong', bounceState:'attempt', pullbackZone:'near_20ma'}}
  );
  if(conflictTrace.visible !== true || conflictTrace.status !== 'conflict' || conflictTrace.debug.canonicalVerdict !== 'watch' || conflictTrace.debug.visualBucket !== 'monitor'){
    throw new Error('Scanner/AI evidence conflict must show a trace without mutating verdict or bucket semantics.');
  }
  const missingContextTrace = evidenceSandbox.buildChartConsistencyTrace(
    {ticker:'NOCHART', review:{normalizedAnalysis:{
      chart_match_status:'unclear',
      coach_summary:'Ticker and timeframe are not visible enough to verify.',
      uncertainty_notes:['Timeframe not visible.']
    }}},
    {canonicalVerdict:'watch', visualBucket:'monitor'},
    {derivedStates:{structureState:'intact', bounceState:'attempt', pullbackZone:'near_20ma'}}
  );
  if(missingContextTrace.visible !== true || !['uncertain','stale'].includes(missingContextTrace.status) || !missingContextTrace.sources.includes('chartRef')){
    throw new Error('Missing chart/ticker/timeframe context must produce a visible uncertainty trace.');
  }
  const deterministicMismatchTrace = evidenceSandbox.buildChartConsistencyTrace(
    {ticker:'NVDA', marketData:{price:500, ma20:490, ma50:460, ma200:400}, review:{chartRef:{dataUrl:'data:image/png;base64,abc'}, normalizedAnalysis:{
      visible_ticker:'ROST',
      visible_ticker_source:'ocr',
      visible_timeframe:'1D',
      visible_timeframe_source:'ocr',
      visible_latest_price:500,
      visible_price_source:'ocr',
      visible_ma20:490,
      visible_ma50:460,
      visible_ma200:400,
      ma20_visible:true,
      ma50_visible:true,
      ma200_visible:true,
      chart_match_status:'match'
    }}},
    {canonicalVerdict:'watch', visualBucket:'monitor'},
    {derivedStates:{structureState:'intact', bounceState:'attempt', pullbackZone:'near_20ma'}}
  );
  if(deterministicMismatchTrace.status !== 'ticker_mismatch' || !deterministicMismatchTrace.sources.includes('chart_verification_fast_pass') || deterministicMismatchTrace.debug.fastPass.earlyExit !== true || deterministicMismatchTrace.aiAnalysisSuppressed !== true){
    throw new Error('Fast visible_ticker mismatch must exit before full chart verification and suppress AI commentary.');
  }
  const deterministicMissingTrace = evidenceSandbox.buildChartConsistencyTrace(
    {ticker:'NVDA', marketData:{price:500, ma20:490, ma50:460, ma200:400}, review:{chartRef:{dataUrl:'data:image/png;base64,abc'}, normalizedAnalysis:{
      visible_latest_price:500,
      extraction_warnings:['Ticker and timeframe are not visible.']
    }}},
    {canonicalVerdict:'watch', visualBucket:'monitor'},
    {derivedStates:{structureState:'intact', bounceState:'attempt', pullbackZone:'near_20ma'}}
  );
  if(!['chart_verification_untrusted','untrusted_context_mirror','uncertain_missing_context'].includes(deterministicMissingTrace.status)){
    throw new Error('Missing deterministic ticker/timeframe facts with only header OCR must remain manual-required, not verified.');
  }
  if(!['insufficient_context','chart_verification_untrusted','untrusted_context_mirror'].includes(deterministicMissingTrace.debug.fastPass.fastStatus)){
    throw new Error('Weak fast-pass context must remain manual-required.');
  }
  const finalUncertainSuppression = evidenceSandbox.chartVerificationAiSuppression(
    {ticker:'NVDA', marketData:{price:500, ma20:490, ma50:460, ma200:400}, review:{chartRef:{dataUrl:'data:image/png;base64,abc'}}},
    {
      visible_ticker:'NVDA',
      visible_latest_price:500,
      extraction_method_used:'ocr',
      visible_numeric_labels:[500]
    }
  );
  if(finalUncertainSuppression.suppressed !== true || !/could not be (independently )?verified|verified clearly enough/i.test(String(finalUncertainSuppression.message || ''))){
    throw new Error('Ticker/price OCR without chart-native confirmation must suppress normal AI commentary.');
  }
  const contextMirroringTrace = evidenceSandbox.buildChartConsistencyTrace(
    {ticker:'CTVA', marketData:{price:83.30, ma20:80.95, ma50:80.99, ma200:72.13}, review:{chartRef:{dataUrl:'data:image/png;base64,abc'}, normalizedAnalysis:{
      visible_ticker:'CTVA',
      visible_timeframe:'',
      visible_latest_price:83.30,
      extraction_method_used:'none',
      visible_numeric_labels:[]
    }}},
    {canonicalVerdict:'watch', visualBucket:'monitor'},
    {derivedStates:{structureState:'intact', bounceState:'attempt', pullbackZone:'near_20ma'}}
  );
  if(['likely_match','verified_match','consistent','ai_supported_match','partial_indicator_visibility','mostly_verified'].includes(String(contextMirroringTrace.status || ''))){
    throw new Error('Ticker/price matches without readable visible-identity evidence must stay below likely_match.');
  }
  if(['likely_match','verified_match','consistent','ai_supported_match'].includes(String(contextMirroringTrace.status || ''))){
    throw new Error('Context-mirrored chart states with no readable timeframe must not upgrade to likely_match or verified.');
  }
  const independentFastPassTrace = evidenceSandbox.buildChartConsistencyTrace(
    {ticker:'CTVA', marketData:{price:83.30, ma20:80.95, ma50:80.99, ma200:72.13}, review:{chartRef:{dataUrl:'data:image/png;base64,abc'}, normalizedAnalysis:{
      visible_ticker:'CTVA',
      visible_ticker_source:'ocr',
      visible_timeframe:'1D',
      visible_timeframe_source:'ocr',
      visible_latest_price:83.30,
      visible_price_source:'ocr',
      visible_numeric_labels:[83.30, 80.95],
      extraction_method_used:'ocr',
      ma20_visible:true
    }}},
    {canonicalVerdict:'watch', visualBucket:'monitor'},
    {derivedStates:{structureState:'intact', bounceState:'attempt', pullbackZone:'near_20ma'}}
  );
  if(independentFastPassTrace.debug.fastPass.fastStatus !== 'clear_match_candidate' || independentFastPassTrace.debug.fastPass.independentImageEvidence !== true){
    throw new Error('Independent ticker/timeframe/price evidence must allow clear_match_candidate and full verification.');
  }
  const exactMrnaTrace = evidenceSandbox.buildChartConsistencyTrace(
    {ticker:'MRNA', marketData:{price:49.04, ma20:48.15, ma50:47.3, ma200:43.1}, review:{chartRef:{dataUrl:'data:image/png;base64,abc'}, normalizedAnalysis:{
      visible_ticker:'MRNA',
      visible_ticker_source:'ocr',
      visible_timeframe:'1D',
      visible_timeframe_source:'ocr',
      visible_latest_price:49.04,
      visible_price_source:'ocr',
      visible_ma20:48.15,
      visible_ma50:47.30,
      visible_ma200:43.10,
      visible_numeric_labels:[49.04, 48.15, 47.3, 43.1],
      extraction_method_used:'ocr',
      ma20_visible:true,
      ma50_visible:true,
      ma200_visible:true
    }}},
    {canonicalVerdict:'watch', visualBucket:'monitor'},
    {derivedStates:{structureState:'intact', bounceState:'attempt', pullbackZone:'near_20ma'}}
  );
  if(exactMrnaTrace.status !== 'verified_match' && exactMrnaTrace.status !== 'likely_match'){
    throw new Error('Exact genuine MRNA chart with chart-native MA confirmation must verify.');
  }
  if(exactMrnaTrace.aiAnalysisSuppressed !== false || /uncertain/i.test(String(exactMrnaTrace.title || '')) || /not independently verified/i.test(String(exactMrnaTrace.suppressionReason || ''))){
    throw new Error('Exact genuine MRNA chart must not be suppressed or shown as uncertain.');
  }
  const exactMrnaDecision = evidenceSandbox.chartVerificationUiDecision(exactMrnaTrace, 'MRNA');
  if(exactMrnaDecision.key !== 'verified_match' || !/Chart appears to match MRNA/i.test(String(exactMrnaDecision.title || ''))){
    throw new Error('Verified charts must map to the verified_match UI decision.');
  }
  const storedChartTrace = evidenceSandbox.getReviewChartVerificationState({
    ticker:'MRNA',
    review:{
      chartRef:{dataUrl:'data:image/png;base64,abc', imageId:'chart-1'},
      chartImageOriginal:{dataUrl:'data:image/png;base64,abc', imageId:'chart-1', dataUrlField:'chartRef.dataUrl'},
      chartImagePreview:{dataUrl:'data:image/png;base64,abc', imageId:'chart-1'},
      chartImageVerificationSource:{source:'chartImageOriginal', sourceField:'chartRef.dataUrl', imageId:'chart-1'},
      chartVerificationLifecycle:{phase:'deterministic_ready', requestId:'analysis-1'},
      chartVerificationTrace:{
        ticker:'MRNA',
        reviewTicker:'MRNA',
        chartImageId:'chart-1',
        imageId:'chart-1',
        verificationRequestId:'analysis-1',
        requestId:'analysis-1',
        chartImageSource:evidenceSandbox.buildChartImageSourceTrace({
          chartRef:{dataUrl:'data:image/png;base64,abc', imageId:'chart-1'},
          chartImageOriginal:{dataUrl:'data:image/png;base64,abc', imageId:'chart-1', dataUrlField:'chartRef.dataUrl'},
          chartImagePreview:{dataUrl:'data:image/png;base64,abc', imageId:'chart-1'},
          chartImageVerificationSource:{source:'chartImageOriginal', sourceField:'chartRef.dataUrl', imageId:'chart-1'}
        }),
        trace:exactMrnaTrace
      }
    }
  });
  if(!storedChartTrace || storedChartTrace.trace.status !== 'verified_match'){
    throw new Error('Stored deterministic chart trace must be readable before AI analysis completes.');
  }
  const noChartReviewState = evidenceSandbox.getReviewChartVerificationState({
    ticker:'MRNA',
    review:{}
  });
  if(noChartReviewState !== null){
    throw new Error('No-chart review records must not expose a chart verification trace.');
  }
  const localPreAiSource = evidenceSandbox.buildChartImageSourceTrace({
    chartRef:{dataUrl:'data:image/png;base64,pre-ai-nvda', imageId:'chart-pre-ai-nvda'},
    chartImageOriginal:{dataUrl:'data:image/png;base64,pre-ai-nvda', imageId:'chart-pre-ai-nvda', dataUrlField:'chartRef.dataUrl'},
    chartImagePreview:{dataUrl:'data:image/png;base64,pre-ai-nvda', imageId:'chart-pre-ai-nvda'},
    chartImageVerificationSource:{source:'chartImageOriginal', sourceField:'chartRef.dataUrl', imageId:'chart-pre-ai-nvda'}
  });
  const localPreAiFastPass = evidenceSandbox.buildPreAiChartVerificationTrace({
    ticker:'NVDA',
    marketData:{price:480.5, ma20:472.1, ma50:463.4, ma200:410.2},
    review:{
      chartRef:{dataUrl:'data:image/png;base64,pre-ai-nvda', imageId:'chart-pre-ai-nvda'},
      chartImageOriginal:{dataUrl:'data:image/png;base64,pre-ai-nvda', imageId:'chart-pre-ai-nvda', dataUrlField:'chartRef.dataUrl'},
      chartImagePreview:{dataUrl:'data:image/png;base64,pre-ai-nvda', imageId:'chart-pre-ai-nvda'},
      chartImageVerificationSource:{source:'chartImageOriginal', sourceField:'chartRef.dataUrl', imageId:'chart-pre-ai-nvda'}
    }
  }, localPreAiSource);
  if(!localPreAiFastPass
    || String(localPreAiFastPass.status || '') !== 'source_checking'
    || localPreAiFastPass.aiAnalysisSuppressed !== false
    || /verified/i.test(String(localPreAiFastPass.title || ''))
    || /match/i.test(String(localPreAiFastPass.title || ''))){
    throw new Error('Pre-AI chart verification must remain a source-integrity-only state before extracted chart facts exist.');
  }
  evidenceSandbox.uiState = {
    activeReviewTicker:'MRNA',
    activeReviewAddsToScannerUniverse:false,
    activeReviewVerdictOverride:'watch',
    pendingReviewRequest:{ticker:'MRNA', reviewRequestToken:'review-1'},
    pendingReviewTicker:'MRNA',
    queuedReviewTicker:'MRNA',
    pendingReviewCandidate:{ticker:'MRNA', reviewRequestToken:'review-1'},
    reviewPendingLoadError:{ticker:'MRNA', reviewRequestToken:'review-1'},
    reviewLoadToken:17
  };
  evidenceSandbox.$ = () => null;
  evidenceSandbox.activeReviewTicker = () => 'MRNA';
  evidenceSandbox.pendingReviewTicker = () => 'MRNA';
  evidenceSandbox.clearStartupReviewSessionState('startup_local_restore');
  if(evidenceSandbox.uiState.activeReviewTicker !== '' || evidenceSandbox.uiState.pendingReviewRequest !== null || evidenceSandbox.uiState.pendingReviewTicker !== '' || evidenceSandbox.uiState.queuedReviewTicker !== '' || evidenceSandbox.uiState.pendingReviewCandidate !== null || evidenceSandbox.uiState.reviewPendingLoadError !== null || evidenceSandbox.uiState.reviewLoadToken !== 0 || evidenceSandbox.uiState.activeReviewVerdictOverride !== '' || evidenceSandbox.uiState.activeReviewAddsToScannerUniverse !== true){
    throw new Error('Startup Review session clear must remove active review ownership and pending review residue without touching other saved state.');
  }
  const preAiPendingTrace = evidenceSandbox.buildChartConsistencyTrace(
    {ticker:'MRNA', marketData:{price:49.04, ma20:48.15, ma50:47.3, ma200:43.1}, review:{
      chartRef:{dataUrl:'data:image/png;base64,dino-chart', imageId:'chart-dino-1'},
      chartImageOriginal:{dataUrl:'data:image/png;base64,dino-chart', imageId:'chart-dino-1', dataUrlField:'chartRef.dataUrl'},
      chartImagePreview:{dataUrl:'data:image/png;base64,dino-chart', imageId:'chart-dino-1'},
      chartImageVerificationSource:{source:'chartImageOriginal', sourceField:'chartRef.dataUrl', imageId:'chart-dino-1'}
    }},
    {canonicalVerdict:'watch', visualBucket:'monitor'},
    {derivedStates:{structureState:'intact', bounceState:'attempt', pullbackZone:'near_20ma'}}
  );
  if(['consistent','verified_match','likely_match'].includes(String(preAiPendingTrace.status || '')) || preAiPendingTrace.aiAnalysisSuppressed !== false){
    throw new Error('Pre-AI chart verification must remain a warning state before chart-native confirmation exists.');
  }
  const preAiPendingDecision = evidenceSandbox.chartVerificationUiDecision(preAiPendingTrace, 'MRNA');
  if(preAiPendingDecision.key !== 'source_checking' || !/Chart uploaded - checking details/i.test(String(preAiPendingDecision.title || '')) || !/AI chart extraction is running/i.test(String(preAiPendingDecision.summary || ''))){
    throw new Error('Pre-AI chart verification must map to a source-checking decision before extracted chart facts exist.');
  }
  if(evidenceSandbox.chartVerificationShouldShowManualActions(preAiPendingDecision, preAiPendingTrace, 'running', true) !== false){
    throw new Error('Pending chart verification must not require manual confirmation before deterministic analysis completes.');
  }
  if(String(preAiPendingTrace.status || '') !== 'source_checking'){
    throw new Error('Pre-AI chart verification must remain in source_checking until extracted chart facts exist.');
  }
  if(preAiPendingTrace.aiAnalysisSuppressed !== false || String(preAiPendingTrace.suppressionReason || '') !== ''){
    throw new Error('Pre-AI chart verification must remain a warning state, not a suppression.');
  }
  const nvdaAssessorInput = evidenceSandbox.buildChartAssessorInput(
    {ticker:'NVDA', review:{chartRef:{dataUrl:'data:image/png;base64,abc', imageId:'chart-1'}, chartImageOriginal:{dataUrl:'data:image/png;base64,abc', imageId:'chart-1', dataUrlField:'chartRef.dataUrl'}, chartImagePreview:{dataUrl:'data:image/png;base64,abc', imageId:'chart-1'}, chartImageVerificationSource:{source:'chartImageOriginal', sourceField:'chartRef.dataUrl', imageId:'chart-1'}}},
    {
      __chartImageId:'chart-1',
      visible_ticker:'NVDA',
      visible_timeframe:'1D',
      visible_latest_price:480.5,
      chart_region_confirmation:'top-left header and right price axis align with the same chart',
      chart_region_confirmation_source:'chart_region_ocr',
      visible_ma20:472.1,
      visible_ma50:463.4,
      visible_ma200:410.2,
      chart_match_status:'match',
      chart_match_warning:'',
      uncertainty_notes:[]
    },
    evidenceSandbox.buildChartImageSourceTrace({
      chartRef:{dataUrl:'data:image/png;base64,abc', imageId:'chart-1'},
      chartImageOriginal:{dataUrl:'data:image/png;base64,abc', imageId:'chart-1', dataUrlField:'chartRef.dataUrl'},
      chartImagePreview:{dataUrl:'data:image/png;base64,abc', imageId:'chart-1'},
      chartImageVerificationSource:{source:'chartImageOriginal', sourceField:'chartRef.dataUrl', imageId:'chart-1'}
    }),
    'analysis-1'
  );
  if(nvdaAssessorInput.extractedTicker !== 'NVDA' || nvdaAssessorInput.reviewTicker !== 'NVDA' || nvdaAssessorInput.verificationRequestId !== 'analysis-1' || nvdaAssessorInput.chartImageId !== 'chart-1'){
    throw new Error('Chart assessor input must carry the current ticker/image/request identity.');
  }
  if(String(nvdaAssessorInput.chartRegionConfirmation || '') !== 'top-left header and right price axis align with the same chart'
    || String(nvdaAssessorInput.chartRegionConfirmationSource || '') !== 'chart_region_ocr'){
    throw new Error('Chart assessor input must preserve explicit chart region confirmation provenance.');
  }
  const nvdaNormalizedFallback = evidenceSandbox.chartAssessorInputToNormalizedAnalysis(nvdaAssessorInput, {ticker:'NVDA', review:{chartRef:{dataUrl:'data:image/png;base64,abc', imageId:'chart-1'}, chartImageOriginal:{dataUrl:'data:image/png;base64,abc', imageId:'chart-1', dataUrlField:'chartRef.dataUrl'}, chartImagePreview:{dataUrl:'data:image/png;base64,abc', imageId:'chart-1'}, chartImageVerificationSource:{source:'chartImageOriginal', sourceField:'chartRef.dataUrl', imageId:'chart-1'}}}, {forceMatch:true});
  if(nvdaNormalizedFallback.visible_ticker !== 'NVDA' || nvdaNormalizedFallback.visible_timeframe !== '1D' || nvdaNormalizedFallback.chart_match_status !== 'match'){
    throw new Error('Normalized chart assessor input must round-trip already normalized analysis into a committed chart context.');
  }
  if(String(nvdaNormalizedFallback.chart_region_confirmation || '') !== 'top-left header and right price axis align with the same chart'
    || String(nvdaNormalizedFallback.chart_region_confirmation_source || '') !== 'chart_region_ocr'){
    throw new Error('Chart assessor normalized replay must restore explicit chart region confirmation provenance.');
  }
  const nvdaAssessorResult = evidenceSandbox.buildChartConsistencyTrace(
    {ticker:'NVDA', marketData:{price:480.5, ma20:472.1, ma50:463.4, ma200:410.2}, review:{chartRef:{dataUrl:'data:image/png;base64,abc', imageId:'chart-1'}, chartImageOriginal:{dataUrl:'data:image/png;base64,abc', imageId:'chart-1', dataUrlField:'chartRef.dataUrl'}, chartImagePreview:{dataUrl:'data:image/png;base64,abc', imageId:'chart-1'}, chartImageVerificationSource:{source:'chartImageOriginal', sourceField:'chartRef.dataUrl', imageId:'chart-1'}, chartVerificationContext:nvdaAssessorInput, normalizedAnalysis:nvdaAssessorInput}},
    {canonicalVerdict:'watch', visualBucket:'monitor'},
    {derivedStates:{structureState:'intact', bounceState:'attempt', pullbackZone:'near_20ma'}, normalizedAnalysis:nvdaAssessorInput, chartAssessorInput:nvdaAssessorInput}
  );
  if(['pending_chart_native_verification','partial_context_unverified_chart','uncertain_missing_context'].includes(String(nvdaAssessorResult.status || ''))){
    throw new Error('A post-AI chart assessor result must not remain pending when the current ticker/image/request context is provided.');
  }
  const pendingChartTrace = {
    status:'pending_chart_native_verification',
    reviewTicker:'NVDA',
    ticker:'NVDA',
    imageId:'img_6b5b752a_189834',
    chartImageId:'img_6b5b752a_189834',
    requestId:'',
    verificationRequestId:'',
    chartImageSource:evidenceSandbox.buildChartImageSourceTrace({
      chartRef:{dataUrl:'data:image/png;base64,pending-chart', imageId:'img_6b5b752a_189834'},
      chartImageOriginal:{dataUrl:'data:image/png;base64,pending-chart', imageId:'img_6b5b752a_189834', dataUrlField:'chartRef.dataUrl'},
      chartImagePreview:{dataUrl:'data:image/png;base64,pending-chart', imageId:'img_6b5b752a_189834'},
      chartImageVerificationSource:{source:'chartImageOriginal', sourceField:'chartRef.dataUrl', imageId:'img_6b5b752a_189834'}
    }),
    title:'Checking chart details',
    summary:'Chart image attached. Checking chart details.'
  };
  const mergedChartTrace = {
    status:'consistent',
    reviewTicker:'NVDA',
    ticker:'NVDA',
    imageId:'img_6b5b752a_189834',
    chartImageId:'img_6b5b752a_189834',
    requestId:'analysis-2-1779175719748',
    verificationRequestId:'analysis-2-1779175719748',
    chartImageSource:evidenceSandbox.buildChartImageSourceTrace({
      chartRef:{dataUrl:'data:image/png;base64,merged-chart', imageId:'img_6b5b752a_189834'},
      chartImageOriginal:{dataUrl:'data:image/png;base64,merged-chart', imageId:'img_6b5b752a_189834', dataUrlField:'chartRef.dataUrl'},
      chartImagePreview:{dataUrl:'data:image/png;base64,merged-chart', imageId:'img_6b5b752a_189834'},
      chartImageVerificationSource:{source:'chartImageOriginal', sourceField:'chartRef.dataUrl', imageId:'img_6b5b752a_189834'}
    }),
    title:'Chart verified',
    summary:'Ticker, price, and chart evidence are consistent enough to continue.',
    phase:'merged'
  };
  const selectedChartTrace = evidenceSandbox.selectReviewChartTraceForRender({
    ticker:'NVDA',
    review:{
      chartRef:{dataUrl:'data:image/png;base64,merged-chart', imageId:'img_6b5b752a_189834'},
      chartImageOriginal:{dataUrl:'data:image/png;base64,merged-chart', imageId:'img_6b5b752a_189834', dataUrlField:'chartRef.dataUrl'},
      chartImagePreview:{dataUrl:'data:image/png;base64,merged-chart', imageId:'img_6b5b752a_189834'},
      chartImageVerificationSource:{source:'chartImageOriginal', sourceField:'chartRef.dataUrl', imageId:'img_6b5b752a_189834'},
      chartVerificationTrace:{phase:'merged', requestId:'analysis-2-1779175719748', verificationRequestId:'analysis-2-1779175719748', chartImageId:'img_6b5b752a_189834', imageId:'img_6b5b752a_189834', trace:mergedChartTrace}
    }
  }, {phase:'merged', requestId:'analysis-2-1779175719748', verificationRequestId:'analysis-2-1779175719748', chartImageId:'img_6b5b752a_189834', imageId:'img_6b5b752a_189834', trace:mergedChartTrace}, pendingChartTrace, 'committed', nvdaAssessorInput);
  if(!selectedChartTrace || selectedChartTrace.chosen.status !== 'consistent' || String(selectedChartTrace.chosen.requestId || selectedChartTrace.chosen.verificationRequestId || '') !== 'analysis-2-1779175719748'){
    throw new Error('Merged chart trace must win over pending trace for the same image and ticker.');
  }
  if(!selectedChartTrace.chosenCandidate || selectedChartTrace.chosenCandidate.status !== 'consistent' || selectedChartTrace.chosenCandidate.type !== 'post_ai_merged'){
    throw new Error('Merged chart trace selection must surface the merged candidate metadata.');
  }
  const committedChartTrace = evidenceSandbox.selectReviewChartTraceForRender({
    ticker:'NVDA',
    review:{
      chartRef:{dataUrl:'data:image/png;base64,merged-chart', imageId:'img_6b5b752a_189834'},
      chartImageOriginal:{dataUrl:'data:image/png;base64,merged-chart', imageId:'img_6b5b752a_189834', dataUrlField:'chartRef.dataUrl'},
      chartImagePreview:{dataUrl:'data:image/png;base64,merged-chart', imageId:'img_6b5b752a_189834'},
      chartImageVerificationSource:{source:'chartImageOriginal', sourceField:'chartRef.dataUrl', imageId:'img_6b5b752a_189834'},
      chartVerificationTrace:{phase:'deterministic', requestId:'analysis-2-1779175719748', verificationRequestId:'analysis-2-1779175719748', chartImageId:'img_6b5b752a_189834', imageId:'img_6b5b752a_189834', trace:pendingChartTrace},
      chartVerificationCommittedTrace:{phase:'merged', requestId:'analysis-2-1779175719748', verificationRequestId:'analysis-2-1779175719748', chartImageId:'img_6b5b752a_189834', imageId:'img_6b5b752a_189834', trace:mergedChartTrace}
    }
  }, {phase:'deterministic', requestId:'analysis-2-1779175719748', verificationRequestId:'analysis-2-1779175719748', chartImageId:'img_6b5b752a_189834', imageId:'img_6b5b752a_189834', trace:pendingChartTrace}, pendingChartTrace, 'committed', nvdaAssessorInput);
  if(!committedChartTrace || committedChartTrace.chosen.status !== 'consistent' || committedChartTrace.chosenCandidate.type !== 'post_ai_merged'){
    throw new Error('Committed chart trace store must win over deterministic pending trace for the same lineage.');
  }
  const committedPreferredState = evidenceSandbox.getReviewChartVerificationState({
    ticker:'NVDA',
    review:{
      chartRef:{dataUrl:'data:image/png;base64,merged-chart', imageId:'img_6b5b752a_189834'},
      chartImageOriginal:{dataUrl:'data:image/png;base64,merged-chart', imageId:'img_6b5b752a_189834', dataUrlField:'chartRef.dataUrl'},
      chartImagePreview:{dataUrl:'data:image/png;base64,merged-chart', imageId:'img_6b5b752a_189834'},
      chartImageVerificationSource:{source:'chartImageOriginal', sourceField:'chartRef.dataUrl', imageId:'img_6b5b752a_189834'},
      chartVerificationTrace:{phase:'deterministic', requestId:'analysis-2-1779175719748', verificationRequestId:'analysis-2-1779175719748', chartImageId:'img_6b5b752a_189834', imageId:'img_6b5b752a_189834', trace:pendingChartTrace},
      chartVerificationCommittedTrace:{phase:'merged', requestId:'analysis-2-1779175719748', verificationRequestId:'analysis-2-1779175719748', chartImageId:'img_6b5b752a_189834', imageId:'img_6b5b752a_189834', trace:mergedChartTrace}
    }
  });
  if(!committedPreferredState || committedPreferredState.trace.status !== 'consistent' || committedPreferredState.phase !== 'merged'){
    throw new Error('Committed chart state must be preferred over the pending stored wrapper.');
  }
  const inheritedPendingTrace = evidenceSandbox.selectReviewChartTraceForRender({
    ticker:'NVDA',
    review:{
      chartRef:{dataUrl:'data:image/png;base64,pending-chart', imageId:'img_pending_nvda'},
      chartImageOriginal:{dataUrl:'data:image/png;base64,pending-chart', imageId:'img_pending_nvda', dataUrlField:'chartRef.dataUrl'},
      chartImagePreview:{dataUrl:'data:image/png;base64,pending-chart', imageId:'img_pending_nvda'},
      chartImageVerificationSource:{source:'chartImageOriginal', sourceField:'chartRef.dataUrl', imageId:'img_pending_nvda'},
      chartAttachmentContext:{expectedTicker:'NVDA', imageId:'img_pending_nvda', requestId:'analysis-pending-1', name:'nvda.png'},
      chartVerificationTrace:{
        phase:'deterministic',
        requestId:'',
        verificationRequestId:'',
        chartImageId:'img_pending_nvda',
        imageId:'img_pending_nvda',
        trace:{
          status:'source_checking',
          reviewTicker:'NVDA',
          ticker:'NVDA',
          chartImageId:'img_pending_nvda',
          imageId:'img_pending_nvda',
          requestId:'',
          verificationRequestId:'',
          title:'Chart uploaded - checking details',
          summary:'Chart source is valid. AI chart extraction is running.'
        }
      },
      chartVerificationLifecycle:{
        phase:'deterministic_ready',
        chartImageId:'img_pending_nvda',
        imageId:'img_pending_nvda',
        requestId:'analysis-pending-1'
      }
    }
  }, {
    phase:'deterministic',
    requestId:'',
    verificationRequestId:'',
    chartImageId:'img_pending_nvda',
    imageId:'img_pending_nvda',
    trace:{
      status:'source_checking',
      reviewTicker:'NVDA',
      ticker:'NVDA',
      chartImageId:'img_pending_nvda',
      imageId:'img_pending_nvda',
      requestId:'',
      verificationRequestId:'',
      title:'Chart uploaded - checking details',
      summary:'Chart source is valid. AI chart extraction is running.'
    }
  }, null, 'queued', null);
  if(!inheritedPendingTrace
    || !inheritedPendingTrace.chosen
    || String(inheritedPendingTrace.chosen.requestId || inheritedPendingTrace.chosen.verificationRequestId || '') !== 'analysis-pending-1'){
    throw new Error('Pending source-checking chart traces must inherit request ids from the current chart context when image/ticker match.');
  }
  const sanitizedIdentity = evidenceSandbox.sanitizeChartAssessorVisibleIdentity({
    ticker:'NVDA',
    marketData:{price:215.33},
    review:{
      chartRef:{dataUrl:'data:image/png;base64,lin-chart', imageId:'img_lin_wrong'},
      chartImageOriginal:{dataUrl:'data:image/png;base64,lin-chart', imageId:'img_lin_wrong', dataUrlField:'chartRef.dataUrl'},
      chartImagePreview:{dataUrl:'data:image/png;base64,lin-chart', imageId:'img_lin_wrong'},
      chartImageVerificationSource:{source:'chartImageOriginal', sourceField:'chartRef.dataUrl', imageId:'img_lin_wrong'}
    }
  }, {
    chartIdentityProvenanceVersion:1,
    visible_ticker:'NVDA',
    visible_timeframe:'1D',
    visible_latest_price:215.33,
    visible_ticker_source:'',
    visible_timeframe_source:'',
    visible_price_source:'',
    visible_numeric_labels:[]
  }, evidenceSandbox.buildChartImageSourceTrace({
    chartRef:{dataUrl:'data:image/png;base64,lin-chart', imageId:'img_lin_wrong'},
    chartImageOriginal:{dataUrl:'data:image/png;base64,lin-chart', imageId:'img_lin_wrong', dataUrlField:'chartRef.dataUrl'},
    chartImagePreview:{dataUrl:'data:image/png;base64,lin-chart', imageId:'img_lin_wrong'},
    chartImageVerificationSource:{source:'chartImageOriginal', sourceField:'chartRef.dataUrl', imageId:'img_lin_wrong'}
  }), 'analysis-wrong-chart');
  if(String(sanitizedIdentity.visible_ticker || '') !== ''
    || sanitizedIdentity.visible_latest_price !== null
    || String(sanitizedIdentity.visible_timeframe || '') !== ''){
    throw new Error('Expected-value leakage without visible chart evidence must be blanked before assessor verification.');
  }
  const sanitizedIdentityWithProvenance = evidenceSandbox.sanitizeChartAssessorVisibleIdentity({
    ticker:'NVDA',
    marketData:{price:215.33}
  }, {
    chartIdentityProvenanceVersion:1,
    visible_ticker:'LIN',
    visible_timeframe:'1D',
    visible_latest_price:517.58,
    visible_ticker_source:'ocr',
    visible_timeframe_source:'ocr',
    visible_price_source:'ocr',
    visible_numeric_labels:[517.58]
  }, {imageId:'img_lin_correct'}, 'analysis-lin-correct');
  if(String(sanitizedIdentityWithProvenance.visible_ticker || '') !== 'LIN'
    || sanitizedIdentityWithProvenance.visible_latest_price !== 517.58
    || String(sanitizedIdentityWithProvenance.visible_timeframe || '') !== '1D'){
    throw new Error('New analyses with visible-identity provenance must retain extracted chart identity through sanitization.');
  }
  const sanitizedIdentityStrictMissingSource = evidenceSandbox.sanitizeChartAssessorVisibleIdentity({
    ticker:'NVDA',
    marketData:{price:215.33}
  }, {
    chartIdentityProvenanceVersion:1,
    visible_ticker:'NVDA',
    visible_timeframe:'1D',
    visible_latest_price:215.33,
    visible_ticker_source:'',
    visible_timeframe_source:'',
    visible_price_source:'',
    visible_numeric_labels:[]
  }, {imageId:'img_lin_wrong'}, 'analysis-strict-missing-source');
  if(String(sanitizedIdentityStrictMissingSource.visible_ticker || '') !== ''
    || sanitizedIdentityStrictMissingSource.visible_latest_price !== null
    || String(sanitizedIdentityStrictMissingSource.visible_timeframe || '') !== ''){
    throw new Error('New-schema analyses without visible provenance must be blanked by sanitization.');
  }
  const strictBlankIdentityTrace = evidenceSandbox.buildChartConsistencyTrace(
    {ticker:'NVDA', marketData:{price:215.33, ma20:210, ma50:205, ma200:190}, review:{chartRef:{dataUrl:'data:image/png;base64,wrong', imageId:'img_wrong_chart'}, normalizedAnalysis:{
      chartIdentityProvenanceVersion:1,
      visible_ticker:'',
      visible_timeframe:'',
      visible_latest_price:null,
      chart_match_status:'match',
      chart_match_warning:'',
      visible_numeric_labels:[]
    }}},
    {canonicalVerdict:'watch', visualBucket:'monitor'},
    {derivedStates:{structureState:'intact', bounceState:'attempt', pullbackZone:'near_20ma'}}
  );
  if(['consistent','likely_match','verified_match','partial_indicator_visibility','mostly_verified'].includes(String(strictBlankIdentityTrace.status || ''))){
    throw new Error('Strict blank chart identity must not fall through to a positive merged verification state.');
  }
  if(!['unknown_chart_identity','insufficient_identity_evidence'].includes(String(strictBlankIdentityTrace.status || ''))){
    throw new Error('Strict blank chart identity must resolve to an unknown or insufficient-evidence final state.');
  }
  const strictBlankDecision = evidenceSandbox.chartVerificationUiDecision(strictBlankIdentityTrace, 'NVDA');
  if(evidenceSandbox.chartVerificationShouldShowManualActions(strictBlankDecision, strictBlankIdentityTrace, 'committed', true) !== true){
    throw new Error('Strict blank chart identity must keep manual verification controls visible.');
  }
  const legacySanitizedIdentity = evidenceSandbox.sanitizeChartAssessorVisibleIdentity({
    ticker:'NVDA',
    marketData:{price:215.33}
  }, {
    visible_ticker:'NVDA',
    visible_timeframe:'1D',
    visible_latest_price:215.33,
    visible_ticker_source:'',
    visible_timeframe_source:'',
    visible_price_source:'',
    visible_numeric_labels:[]
  }, {imageId:'img_legacy_saved'}, 'analysis-legacy-saved');
  if(String(legacySanitizedIdentity.visible_ticker || '') !== 'NVDA'
    || legacySanitizedIdentity.visible_latest_price !== 215.33
    || String(legacySanitizedIdentity.visible_timeframe || '') !== '1D'){
    throw new Error('Legacy stored analyses without provenance version must remain readable and must not be blanked solely for missing source fields.');
  }
  const committedQuickState = evidenceSandbox.reviewQuickChartAnalysisState({
    ticker:'NVDA',
    review:{
      chartRef:{dataUrl:'data:image/png;base64,chart', imageId:'img_committed_nvda', uploadedAt:'2026-05-26T10:00:00.000Z'},
      chartImageOriginal:{dataUrl:'data:image/png;base64,chart', imageId:'img_committed_nvda', dataUrlField:'chartRef.dataUrl', uploadedAt:'2026-05-26T10:00:00.000Z'},
      chartImagePreview:{dataUrl:'data:image/png;base64,chart', imageId:'img_committed_nvda'},
      chartImageVerificationSource:{source:'chartImageOriginal', sourceField:'chartRef.dataUrl', imageId:'img_committed_nvda'},
      chartAttachmentContext:{expectedTicker:'NVDA', imageId:'img_committed_nvda', requestId:'analysis-committed-1'},
      quickChartAnalysis:{
        key:'stale-key-value',
        ticker:'NVDA',
        reviewTicker:'NVDA',
        chartImageId:'img_committed_nvda',
        requestId:'analysis-committed-1',
        status:'committed'
      }
    }
  }, {
    analysisState:{hasSavedAnalysis:false},
    storedChartVerificationState:{status:'source_checking', trace:{status:'source_checking'}}
  });
  if(String(committedQuickState.status || '') !== 'committed' || committedQuickState.shouldQueue === true){
    throw new Error('Committed quick analysis must remain committed for the same chart image/request context and must not fall back to queued.');
  }
  const aiSupportedMatchTrace = evidenceSandbox.buildChartConsistencyTrace(
    {ticker:'MRNA', marketData:{price:49.04, ma20:48.15, ma50:47.3, ma200:43.1}, review:{chartRef:{dataUrl:'data:image/png;base64,abc', imageId:'chart-1'}, normalizedAnalysis:{
      chartIdentityProvenanceVersion:1,
      visible_ticker:'MRNA',
      visible_timeframe:'1D',
      visible_latest_price:49.04,
      visible_numeric_labels:[49.04],
      extraction_method_used:'ocr',
      chart_match_status:'match',
      chart_match_warning:'',
      ma20_visible:false,
      ma50_visible:false,
      ma200_visible:false
    }}},
    {canonicalVerdict:'watch', visualBucket:'monitor'},
    {derivedStates:{structureState:'intact', bounceState:'attempt', pullbackZone:'near_20ma'}}
  );
  if(['verified_match', 'likely_match', 'partial_indicator_visibility', 'mostly_verified'].includes(String(aiSupportedMatchTrace.status || ''))){
    throw new Error('Header-only ticker/timeframe/price reads without visible-identity provenance must not be promoted into a verified chart state.');
  }
  const aiSupportedMatchDecision = evidenceSandbox.chartVerificationUiDecision(aiSupportedMatchTrace, 'MRNA');
  if(['verified_match', 'likely_match', 'partial_indicator_visibility', 'mostly_verified'].includes(String(aiSupportedMatchDecision.key || ''))){
    throw new Error('AI-supported header-only matches without visible-identity provenance must remain unresolved in Review UI.');
  }
  const aiSupportedMatchRender = evidenceSandbox.renderChartConsistencyTrace(aiSupportedMatchTrace);
  if(/Chart likely matches MRNA/i.test(String(aiSupportedMatchRender || ''))){
    throw new Error('Header-only AI-supported matches must not render as likely_match when visible identity evidence is missing.');
  }
  if(evidenceSandbox.chartVerificationShouldShowManualActions(aiSupportedMatchDecision, aiSupportedMatchTrace, 'committed', true) !== true){
    throw new Error('Unresolved header-only chart states must keep manual confirmation controls visible.');
  }
  const legacyStoredTrace = evidenceSandbox.buildChartConsistencyTrace(
    {ticker:'NVDA', marketData:{price:215.33}, review:{chartRef:{dataUrl:'data:image/png;base64,legacy', imageId:'img_legacy_saved'}, normalizedAnalysis:{
      visible_ticker:'NVDA',
      visible_timeframe:'1D',
      visible_latest_price:215.33,
      chart_match_status:'match',
      chart_match_warning:'',
      visible_numeric_labels:[215.33]
    }}},
    {canonicalVerdict:'watch', visualBucket:'monitor'},
    {derivedStates:{structureState:'intact', bounceState:'attempt', pullbackZone:'near_20ma'}}
  );
  if(!String(legacyStoredTrace.extractedFacts && legacyStoredTrace.extractedFacts.visible_ticker || '')
    && (legacyStoredTrace.extractedFacts && legacyStoredTrace.extractedFacts.visible_latest_price) == null
    && !String(legacyStoredTrace.extractedFacts && legacyStoredTrace.extractedFacts.visible_timeframe || '')){
    throw new Error('Legacy stored analyses must not lose visible identity solely because provenance version is absent.');
  }
  const staleSummaryGuard = evidenceSandbox.chartAiSummaryRenderGuard(
    {ticker:'NVDA', review:{chartRef:{imageId:'img-new'}}},
    {analysisChartImageId:'img-old', analysisRequestId:'analysis-old'},
    {status:'untrusted_context_mirror', imageId:'img-new', verificationRequestId:'analysis-new', requestId:'analysis-new'}
  );
  if(staleSummaryGuard.allowedToRender !== false || staleSummaryGuard.reason !== 'image_mismatch'){
    throw new Error('Stale AI summaries from a previous chart image must be blocked from rendering.');
  }
  const acceptedSummaryGuard = evidenceSandbox.chartAiSummaryRenderGuard(
    {ticker:'PSX', review:{chartRef:{imageId:'img-psx'}}},
    {ticker:'PSX', analysisChartImageId:'img-psx', analysisRequestId:'analysis-psx'},
    {status:'likely_match', imageId:'img-psx', verificationRequestId:'analysis-psx', requestId:'analysis-psx'}
  );
  if(acceptedSummaryGuard.allowedToRender !== true){
    throw new Error('Current-image likely_match analysis must be allowed to render.');
  }
  const staleTickerSummaryGuard = evidenceSandbox.chartAiSummaryRenderGuard(
    {ticker:'LIN', review:{chartRef:{imageId:'img-lin'}}},
    {ticker:'NVDA', analysisChartImageId:'img-lin', analysisRequestId:'analysis-lin'},
    {status:'likely_match', imageId:'img-lin', verificationRequestId:'analysis-lin', requestId:'analysis-lin'}
  );
  if(staleTickerSummaryGuard.allowedToRender !== false || staleTickerSummaryGuard.reason !== 'ticker_mismatch'){
    throw new Error('AI summaries from a previous ticker must be blocked even when imageId/requestId happen to match.');
  }
  const mismatchManualDecision = evidenceSandbox.chartVerificationUiDecision({
    status:'ticker_mismatch',
    title:'Ticker mismatch',
    summary:'Uploaded chart appears to show DINO, but this review is for LIN.'
  }, 'LIN');
  if(mismatchManualDecision.key !== 'chart_mismatch' || evidenceSandbox.chartVerificationShouldShowManualActions(mismatchManualDecision, {status:'ticker_mismatch'}, 'committed', true) !== true){
    throw new Error('Chart mismatch states must keep Replace chart and Confirm chart actions visible.');
  }
  const incompleteManualDecision = evidenceSandbox.chartVerificationUiDecision({
    status:'uncertain_missing_context',
    trustedFacts:{ticker:'LIN', expected_timeframe:'1D', latest_price:506.07},
    extractedFacts:{visible_ticker:'LIN', visible_timeframe:'', visible_latest_price:506.07}
  }, 'LIN');
  if(incompleteManualDecision.key !== 'uncertain_match' || evidenceSandbox.chartVerificationShouldShowManualActions(
    incompleteManualDecision,
    {
      status:'uncertain_missing_context',
      trustedFacts:{ticker:'LIN', expected_timeframe:'1D', latest_price:506.07},
      extractedFacts:{visible_ticker:'LIN', visible_timeframe:'', visible_latest_price:506.07}
    },
    'committed',
    true
  ) !== true){
    throw new Error('Incomplete chart verification with missing timeframe must keep manual confirmation controls visible.');
  }
  const sourceCheckingDecision = evidenceSandbox.chartVerificationUiDecision({status:'source_checking'}, 'LIN');
  if(evidenceSandbox.chartVerificationShouldShowManualActions(sourceCheckingDecision, {status:'source_checking'}, 'running', true) !== false){
    throw new Error('Source-checking states must hide manual actions while extraction is still running.');
  }
  const userConfirmedDecision = evidenceSandbox.chartVerificationUiDecision({
    status:'manually_verified',
    manualConfirmed:true,
    chartUserConfirmed:true
  }, 'LIN');
  if(userConfirmedDecision.key !== 'user_confirmed_match' || evidenceSandbox.chartVerificationShouldShowManualActions(userConfirmedDecision, {status:'manually_verified', manualConfirmed:true, chartUserConfirmed:true}, 'committed', true) !== false){
    throw new Error('User-confirmed charts must hide confirm/reject controls.');
  }
  const aiSupportedWithRegionTrace = {
    ...aiSupportedMatchTrace,
    status:'ai_supported_match',
    debug:{
      ...(aiSupportedMatchTrace.debug || {}),
      fastPass:{
        ...((aiSupportedMatchTrace.debug && aiSupportedMatchTrace.debug.fastPass) || {}),
        trustedChartRegionConfirmation:true,
        independentImageEvidence:true,
        chartNativeEvidencePresent:false
      }
    }
  };
  const aiSupportedWithRegionDecision = evidenceSandbox.chartVerificationUiDecision(aiSupportedWithRegionTrace, 'MRNA');
  if(aiSupportedWithRegionDecision.key !== 'verified_match'){
    throw new Error('AI-supported matches with explicit chart-region provenance must remain acceptable.');
  }
  const echoedWrongChartDecision = evidenceSandbox.chartVerificationUiDecision({
    ...aiSupportedMatchTrace,
    status:'ai_supported_match',
    debug:{
      ...(aiSupportedMatchTrace.debug || {}),
      fastPass:{
        ...((aiSupportedMatchTrace.debug && aiSupportedMatchTrace.debug.fastPass) || {}),
        trustedChartRegionConfirmation:false,
        chartNativeEvidencePresent:false,
        contextMirroringSuspected:true
      }
    }
  }, 'MRNA');
  if(echoedWrongChartDecision.key !== 'uncertain_match'){
    throw new Error('Echoed ticker/price plus ai_supported_match must remain untrusted.');
  }
  const timeframeUncertainTrace = evidenceSandbox.buildChartConsistencyTrace(
    {ticker:'MRNA', marketData:{price:49.04, ma20:48.15, ma50:47.3, ma200:43.1}, review:{chartRef:{dataUrl:'data:image/png;base64,abc', imageId:'chart-1'}, normalizedAnalysis:{
      visible_ticker:'MRNA',
      visible_timeframe:'monthly',
      visible_timeframe_source:'ocr',
      visible_latest_price:49.04,
      visible_numeric_labels:[49.04],
      extraction_method_used:'ocr',
      chart_match_status:'match',
      chart_match_warning:'',
      ma20_visible:false,
      ma50_visible:false,
      ma200_visible:false
    }}},
    {canonicalVerdict:'watch', visualBucket:'monitor'},
    {derivedStates:{structureState:'intact', bounceState:'attempt', pullbackZone:'near_20ma'}}
  );
  if(['verified_match', 'likely_match', 'partial_indicator_visibility', 'mostly_verified'].includes(String(timeframeUncertainTrace.status || ''))
    || !/timeframe|uncertain|chart/i.test(`${String(timeframeUncertainTrace.title || '')} ${String(timeframeUncertainTrace.summary || '')}`.toLowerCase())){
    throw new Error('Wrong timeframe without strong chart evidence must not be promoted into a verified chart state.');
  }
  const manualConfirmRecord = {
    ticker:'MRNA',
    review:{
      chartRef:{dataUrl:'data:image/png;base64,abc', imageId:'chart-1'},
      chartImageOriginal:{dataUrl:'data:image/png;base64,abc', imageId:'chart-1', dataUrlField:'chartRef.dataUrl'},
      chartImagePreview:{dataUrl:'data:image/png;base64,abc', imageId:'chart-1'},
      chartImageVerificationSource:{source:'chartImageOriginal', sourceField:'chartRef.dataUrl', imageId:'chart-1'},
      chartVerificationTrace:{
        ticker:'MRNA',
        reviewTicker:'MRNA',
        chartImageId:'chart-1',
        imageId:'chart-1',
        chartImageSource:evidenceSandbox.buildChartImageSourceTrace({
          chartRef:{dataUrl:'data:image/png;base64,abc', imageId:'chart-1'},
          chartImageOriginal:{dataUrl:'data:image/png;base64,abc', imageId:'chart-1', dataUrlField:'chartRef.dataUrl'},
          chartImagePreview:{dataUrl:'data:image/png;base64,abc', imageId:'chart-1'},
          chartImageVerificationSource:{source:'chartImageOriginal', sourceField:'chartRef.dataUrl', imageId:'chart-1'}
        }),
        trace:aiSupportedMatchTrace,
        manualConfirmed:true,
        manualConfirmedTicker:'MRNA',
        manualConfirmedImageId:'chart-1'
      }
    }
  };
  evidenceSandbox.clearReviewChartImageSources(manualConfirmRecord.review);
  if(manualConfirmRecord.review.chartVerificationTrace !== null || manualConfirmRecord.review.chartVerificationCommittedTrace !== null || manualConfirmRecord.review.chartVerificationLifecycle !== null){
    throw new Error('Replacing/clearing chart sources must invalidate manual confirmation.');
  }
  const staleTickerTrace = evidenceSandbox.getReviewChartVerificationState({
    ticker:'DINO',
    review:{
      chartRef:{dataUrl:'data:image/png;base64,abc', imageId:'chart-1'},
      chartImageOriginal:{dataUrl:'data:image/png;base64,abc', imageId:'chart-1', dataUrlField:'chartRef.dataUrl'},
      chartImagePreview:{dataUrl:'data:image/png;base64,abc', imageId:'chart-1'},
      chartImageVerificationSource:{source:'chartImageOriginal', sourceField:'chartRef.dataUrl', imageId:'chart-1'},
      chartVerificationLifecycle:{phase:'deterministic_ready', requestId:'analysis-1'},
      chartVerificationTrace:{
        ticker:'MRNA',
        reviewTicker:'MRNA',
        chartImageId:'chart-1',
        imageId:'chart-1',
        verificationRequestId:'analysis-1',
        requestId:'analysis-1',
        chartImageSource:evidenceSandbox.buildChartImageSourceTrace({
          chartRef:{dataUrl:'data:image/png;base64,abc', imageId:'chart-1'},
          chartImageOriginal:{dataUrl:'data:image/png;base64,abc', imageId:'chart-1', dataUrlField:'chartRef.dataUrl'},
          chartImagePreview:{dataUrl:'data:image/png;base64,abc', imageId:'chart-1'},
          chartImageVerificationSource:{source:'chartImageOriginal', sourceField:'chartRef.dataUrl', imageId:'chart-1'}
        }),
        trace:exactMrnaTrace
      }
    }
  });
  if(staleTickerTrace !== null){
    throw new Error('Stored chart trace must be rejected when the review ticker changes.');
  }
  const staleRequestTrace = evidenceSandbox.getReviewChartVerificationState({
    ticker:'MRNA',
    review:{
      chartRef:{dataUrl:'data:image/png;base64,abc', imageId:'chart-1'},
      chartImageOriginal:{dataUrl:'data:image/png;base64,abc', imageId:'chart-1', dataUrlField:'chartRef.dataUrl'},
      chartImagePreview:{dataUrl:'data:image/png;base64,abc', imageId:'chart-1'},
      chartImageVerificationSource:{source:'chartImageOriginal', sourceField:'chartRef.dataUrl', imageId:'chart-1'},
      chartVerificationLifecycle:{phase:'deterministic_ready', requestId:'analysis-current'},
      chartVerificationTrace:{
        ticker:'MRNA',
        reviewTicker:'MRNA',
        chartImageId:'chart-1',
        imageId:'chart-1',
        verificationRequestId:'analysis-previous',
        requestId:'analysis-previous',
        chartImageSource:evidenceSandbox.buildChartImageSourceTrace({
          chartRef:{dataUrl:'data:image/png;base64,abc', imageId:'chart-1'},
          chartImageOriginal:{dataUrl:'data:image/png;base64,abc', imageId:'chart-1', dataUrlField:'chartRef.dataUrl'},
          chartImagePreview:{dataUrl:'data:image/png;base64,abc', imageId:'chart-1'},
          chartImageVerificationSource:{source:'chartImageOriginal', sourceField:'chartRef.dataUrl', imageId:'chart-1'}
        }),
        trace:exactMrnaTrace
      }
    }
  });
  if(staleRequestTrace !== null){
    throw new Error('Stored chart trace must be rejected when the verification requestId changes.');
  }
  const staleSourceTrace = evidenceSandbox.getReviewChartVerificationState({
    ticker:'MRNA',
    review:{
      chartRef:{dataUrl:'data:image/png;base64,abc', imageId:'chart-1'},
      chartImageOriginal:{dataUrl:'data:image/png;base64,abc', imageId:'chart-1', dataUrlField:'chartRef.dataUrl'},
      chartImagePreview:{dataUrl:'data:image/png;base64,abc', imageId:'chart-1'},
      chartImageVerificationSource:{source:'chartImageOriginal', sourceField:'chartRef.dataUrl', imageId:'chart-1'},
      chartVerificationLifecycle:{phase:'deterministic_ready', requestId:'analysis-1'},
      chartVerificationTrace:{
        ticker:'MRNA',
        reviewTicker:'MRNA',
        chartImageId:'chart-1',
        imageId:'chart-1',
        verificationRequestId:'analysis-1',
        requestId:'analysis-1',
        chartImageSource:{
          sourceKind:'legacy_chartRef_fallback',
          sourceField:'chartRef.dataUrl',
          originalDimensions:'unknown',
          previewDimensions:'unknown',
          verificationSourceDimensions:'unknown',
          limited:true
        },
        trace:exactMrnaTrace
      }
    }
  });
  if(staleSourceTrace !== null){
    throw new Error('Stored chart trace must be rejected when the source fingerprint changes.');
  }
  const clearedReview = {
    chartRef:{dataUrl:'data:image/png;base64,abc', imageId:'chart-1'},
    chartImageOriginal:{dataUrl:'data:image/png;base64,abc', imageId:'chart-1', dataUrlField:'chartRef.dataUrl'},
    chartImagePreview:{dataUrl:'data:image/png;base64,abc', imageId:'chart-1'},
    chartImageVerificationSource:{source:'chartImageOriginal', sourceField:'chartRef.dataUrl', imageId:'chart-1'},
    chartVerificationLifecycle:{phase:'deterministic_ready', requestId:'analysis-1'},
    chartVerificationTrace:{
      ticker:'MRNA',
      reviewTicker:'MRNA',
      chartImageId:'chart-1',
      imageId:'chart-1',
      verificationRequestId:'analysis-1',
      requestId:'analysis-1',
      chartImageSource:evidenceSandbox.buildChartImageSourceTrace({
        chartRef:{dataUrl:'data:image/png;base64,abc', imageId:'chart-1'},
        chartImageOriginal:{dataUrl:'data:image/png;base64,abc', imageId:'chart-1', dataUrlField:'chartRef.dataUrl'},
        chartImagePreview:{dataUrl:'data:image/png;base64,abc', imageId:'chart-1'},
        chartImageVerificationSource:{source:'chartImageOriginal', sourceField:'chartRef.dataUrl', imageId:'chart-1'}
      }),
      trace:exactMrnaTrace
    }
  };
  evidenceSandbox.clearReviewChartImageSources(clearedReview);
  if(clearedReview.chartVerificationTrace !== null || clearedReview.chartVerificationLifecycle !== null || clearedReview.chartAvailable !== false){
    throw new Error('Clearing chart sources must clear chart verification trace and lifecycle state.');
  }
  const contaminatedHeaderTrace = evidenceSandbox.buildChartConsistencyTrace(
    {ticker:'MRNA', marketData:{price:49.04, ma20:48.15, ma50:47.3, ma200:43.1}, review:{chartRef:{dataUrl:'data:image/png;base64,abc'}, normalizedAnalysis:{
      visible_ticker:'MRNA',
      visible_timeframe:'',
      visible_latest_price:49.04,
      visible_numeric_labels:[49.04],
      extraction_method_used:'ocr',
      ma20_visible:false,
      ma50_visible:false,
      ma200_visible:false
    }}},
    {canonicalVerdict:'watch', visualBucket:'monitor'},
    {derivedStates:{structureState:'intact', bounceState:'attempt', pullbackZone:'near_20ma'}}
  );
  if(['likely_match','verified_match','consistent','ai_supported_match'].includes(contaminatedHeaderTrace.status)){
    throw new Error('Header/OCR-only evidence without a readable timeframe must not upgrade to verified or likely_match.');
  }
  if(!['chart_verification_untrusted','untrusted_context_mirror','uncertain_missing_context'].includes(contaminatedHeaderTrace.status)){
    throw new Error('Contaminated header evidence must stay in a non-verified chart state.');
  }
  if(!/verification incomplete|context uncertain|not verified/i.test(String(contaminatedHeaderTrace.title || '')) || !/independently verify this chart|not show enough|enough .*information/i.test(String(contaminatedHeaderTrace.summary || ''))){
    throw new Error('Contaminated header evidence must explain that verification is incomplete.');
  }
  const mrnaPartialTimeframeTrace = evidenceSandbox.buildChartConsistencyTrace(
    {ticker:'MRNA', marketData:{price:49.04, ma20:48.15, ma50:47.3, ma200:43.1}, review:{chartRef:{dataUrl:'data:image/png;base64,abc'}, normalizedAnalysis:{
      visible_ticker:'MRNA',
      visible_timeframe:'',
      visible_latest_price:49.04,
      visible_numeric_labels:[49.04, 48.15],
      extraction_method_used:'ocr',
      ma20_visible:true
    }}} ,
    {canonicalVerdict:'watch', visualBucket:'monitor'},
    {derivedStates:{structureState:'intact', bounceState:'attempt', pullbackZone:'near_20ma'}}
  );
  if(mrnaPartialTimeframeTrace.debug.fastPass.fastStatus !== 'insufficient_context'){
    throw new Error('Missing-timeframe chart verification must stay below the clear-match candidate threshold.');
  }
  if(['verified_match','consistent','ai_supported_match'].includes(String(mrnaPartialTimeframeTrace.status || ''))){
    throw new Error('Missing-timeframe chart verification must not jump straight to a fully verified state.');
  }
  const mrnaPartialTimeframeDecision = evidenceSandbox.chartVerificationUiDecision(mrnaPartialTimeframeTrace, 'MRNA');
  if(mrnaPartialTimeframeDecision.key !== 'uncertain_match' || !/verification incomplete|context uncertain/i.test(String(mrnaPartialTimeframeDecision.title || ''))){
    throw new Error('Missing-timeframe chart verification must remain an uncertain_match decision with softened wording.');
  }
  const mrnaToleranceDriftTrace = evidenceSandbox.buildChartConsistencyTrace(
    {ticker:'MRNA', marketData:{price:49.04, ma20:48.15, ma50:47.3, ma200:43.1}, review:{chartRef:{dataUrl:'data:image/png;base64,abc'}, normalizedAnalysis:{
      visible_ticker:'MRNA',
      visible_timeframe:'',
      visible_latest_price:49.10,
      visible_numeric_labels:[49.10, 48.15],
      extraction_method_used:'ocr',
      ma20_visible:true
    }}},
    {canonicalVerdict:'watch', visualBucket:'monitor'},
    {derivedStates:{structureState:'intact', bounceState:'attempt', pullbackZone:'near_20ma'}}
  );
  if(['verified_match','consistent','ai_supported_match'].includes(String(mrnaToleranceDriftTrace.status || '')) && !String(mrnaToleranceDriftTrace.title || '').toLowerCase().includes('verified')){
    throw new Error('Within-tolerance missing-timeframe traces must not jump to a contradictory fully verified state.');
  }
  const mrnaToleranceDriftDecision = evidenceSandbox.chartVerificationUiDecision(mrnaToleranceDriftTrace, 'MRNA');
  if(mrnaToleranceDriftDecision.key !== 'uncertain_match' && mrnaToleranceDriftDecision.key !== 'verified_match'){
    throw new Error('Within-tolerance chart verification must stay in a safe user-facing state.');
  }
  const mrnaPartialIndicatorTrace = evidenceSandbox.buildChartConsistencyTrace(
    {ticker:'MRNA', marketData:{price:49.04, ma20:48.15, ma50:47.3, ma200:43.1}, review:{chartRef:{dataUrl:'data:image/png;base64,abc'}, normalizedAnalysis:{
      visible_ticker:'MRNA',
      visible_timeframe:'',
      visible_latest_price:49.04,
      visible_numeric_labels:[49.04],
      extraction_method_used:'ocr',
      ma20_visible:true,
      ma200_visible:true,
      visible_ma20:48.15
    }}},
    {canonicalVerdict:'watch', visualBucket:'monitor'},
    {derivedStates:{structureState:'intact', bounceState:'attempt', pullbackZone:'near_20ma'}}
  );
  if(['verified_match','consistent','ai_supported_match'].includes(String(mrnaPartialIndicatorTrace.status || '')) && !String(mrnaPartialIndicatorTrace.title || '').toLowerCase().includes('verified')){
    throw new Error('Missing-timeframe partial-indicator traces must not jump to a contradictory fully verified state.');
  }
  const mrnaPartialIndicatorDecision = evidenceSandbox.chartVerificationUiDecision(mrnaPartialIndicatorTrace, 'MRNA');
  if(mrnaPartialIndicatorDecision.key !== 'uncertain_match' && mrnaPartialIndicatorDecision.key !== 'verified_match'){
    throw new Error('Partial indicator detail should not create a mismatch-style UI decision.');
  }
  const mrnaOutOfToleranceTrace = evidenceSandbox.buildChartConsistencyTrace(
    {ticker:'MRNA', marketData:{price:49.04, ma20:48.15, ma50:47.3, ma200:43.1}, review:{chartRef:{dataUrl:'data:image/png;base64,abc'}, normalizedAnalysis:{
      visible_ticker:'MRNA',
      visible_timeframe:'',
      visible_latest_price:60.00,
      visible_numeric_labels:[60.00],
      extraction_method_used:'ocr'
    }}},
    {canonicalVerdict:'watch', visualBucket:'monitor'},
    {derivedStates:{structureState:'intact', bounceState:'attempt', pullbackZone:'near_20ma'}}
  );
  if(mrnaOutOfToleranceTrace.status === 'likely_match' || mrnaOutOfToleranceTrace.aiAnalysisSuppressed !== true || !/mismatch|uncertain/i.test(String(mrnaOutOfToleranceTrace.title || ''))){
    throw new Error('Out-of-tolerance price drift must not upgrade to a verified/acceptable chart state.');
  }
  const mrnaMissingTickerTrace = evidenceSandbox.buildChartConsistencyTrace(
    {ticker:'MRNA', marketData:{price:49.04, ma20:48.15, ma50:47.3, ma200:43.1}, review:{chartRef:{dataUrl:'data:image/png;base64,abc'}, normalizedAnalysis:{
      visible_timeframe:'',
      visible_latest_price:49.04,
      visible_numeric_labels:[49.04],
      extraction_method_used:'ocr'
    }}},
    {canonicalVerdict:'watch', visualBucket:'monitor'},
    {derivedStates:{structureState:'intact', bounceState:'attempt', pullbackZone:'near_20ma'}}
  );
  if(['likely_match','verified_match','consistent','ai_supported_match'].includes(String(mrnaMissingTickerTrace.status || ''))){
    throw new Error('Missing visible ticker must block the chart verification upgrade.');
  }
  const mrnaMissingPriceTrace = evidenceSandbox.buildChartConsistencyTrace(
    {ticker:'MRNA', marketData:{price:49.04, ma20:48.15, ma50:47.3, ma200:43.1}, review:{chartRef:{dataUrl:'data:image/png;base64,abc'}, normalizedAnalysis:{
      visible_ticker:'MRNA',
      visible_timeframe:'',
      extraction_method_used:'ocr'
    }}},
    {canonicalVerdict:'watch', visualBucket:'monitor'},
    {derivedStates:{structureState:'intact', bounceState:'attempt', pullbackZone:'near_20ma'}}
  );
  if(['likely_match','verified_match','consistent','ai_supported_match'].includes(String(mrnaMissingPriceTrace.status || ''))){
    throw new Error('Missing visible price must block the chart verification upgrade.');
  }
  const manualConfirmedDecision = evidenceSandbox.chartVerificationUiDecision({
    status:'verified_match',
    manualConfirmed:true,
    chartUserConfirmed:true
  }, 'MRNA');
  if(manualConfirmedDecision.key !== 'user_confirmed_match' || !/confirmed manually/i.test(String(manualConfirmedDecision.title || ''))){
    throw new Error('Manual confirmation must map to the user_confirmed_match UI decision.');
  }
  const indicatorMissingTrace = evidenceSandbox.buildChartConsistencyTrace(
    {ticker:'NVDA', marketData:{price:500, ma20:490, ma50:460, ma200:400}, review:{chartRef:{dataUrl:'data:image/png;base64,abc'}, normalizedAnalysis:{
      chartIdentityProvenanceVersion:1,
      visible_ticker:'NVDA',
      visible_timeframe:'1D',
      visible_latest_price:500,
      ma20_visible:false,
      ma50_visible:false,
      ma200_visible:false
    }}},
    {canonicalVerdict:'watch', visualBucket:'monitor'},
    {derivedStates:{structureState:'intact', bounceState:'attempt', pullbackZone:'near_20ma'}}
  );
  if(['verified_match', 'likely_match', 'partial_indicator_visibility', 'mostly_verified'].includes(String(indicatorMissingTrace.status || ''))){
    throw new Error('Header-only ticker/timeframe/price matches with hidden moving averages must not be promoted when visible identity evidence is missing.');
  }
  if(indicatorMissingTrace.indicatorStates
    && !['chart_verification_untrusted','untrusted_context_mirror','unknown_chart_identity','insufficient_identity_evidence'].includes(indicatorMissingTrace.status)
    && indicatorMissingTrace.indicatorStates.ma200_status !== 'missing'){
    throw new Error('200MA not visible at all must be reported as missing.');
  }
  const partialIndicatorTrace = evidenceSandbox.buildChartConsistencyTrace(
    {ticker:'NVDA', marketData:{price:225.83, ma20:207.24949999999998, ma50:191.17760000000007, ma200:185.4411499999999}, review:{chartRef:{dataUrl:'data:image/png;base64,abc'}, normalizedAnalysis:{
      visible_ticker:'NVDA',
      visible_ticker_source:'ocr',
      visible_timeframe:'1D',
      visible_timeframe_source:'ocr',
      visible_latest_price:225.83,
      visible_price_source:'ocr',
      visible_ma20:207.24949999999998,
      visible_ma50:191.17760000000007,
      visible_ma200:null,
      ma20_visible:true,
      ma50_visible:true,
      ma200_visible:true
    }}},
    {canonicalVerdict:'watch', visualBucket:'monitor'},
    {derivedStates:{structureState:'intact', bounceState:'attempt', pullbackZone:'near_20ma'}}
  );
  if(partialIndicatorTrace.status !== 'partial_indicator_visibility' || partialIndicatorTrace.indicatorStates.ma200_status !== 'partial' || !partialIndicatorTrace.partialIndicators.includes('200MA')){
    throw new Error('200MA line visible but value missing must become a non-blocking partial-indicator verification state.');
  }
  if(!/Chart mostly verified/.test(partialIndicatorTrace.title) || !/Some indicators were not clearly readable/i.test(partialIndicatorTrace.summary || '')){
    throw new Error('Partial MA visibility must use the non-blocking mostly-verified wording.');
  }
  const partialIndicatorDecision = evidenceSandbox.chartVerificationUiDecision(partialIndicatorTrace, 'NVDA');
  if(partialIndicatorDecision.key !== 'partial_indicator_visibility'){
    throw new Error('Non-blocking partial-indicator traces must map to the partial_indicator_visibility UI decision.');
  }
  if(evidenceSandbox.chartVerificationShouldShowManualActions(partialIndicatorDecision, partialIndicatorTrace, 'committed', true) !== false){
    throw new Error('Partial indicator visibility must hide manual chart confirmation controls.');
  }
  const partialIndicatorMarkup = evidenceSandbox.renderChartConsistencyTrace(partialIndicatorTrace);
  if(!/Chart mostly verified/i.test(partialIndicatorMarkup) || !/20 207\.25/.test(partialIndicatorMarkup) || !/50 191\.18/.test(partialIndicatorMarkup) || !/200 n\/a/.test(partialIndicatorMarkup) || !/200 185\.44/.test(partialIndicatorMarkup)){
    throw new Error('Chart verification display values must be formatted to 2 decimals and null as n/a.');
  }
  if(!/Show details/.test(partialIndicatorMarkup) || !/Extracted:/.test(partialIndicatorMarkup) || !/Trusted:/.test(partialIndicatorMarkup)){
    throw new Error('Chart verification panel must show a compact user-facing summary with diagnostics behind details.');
  }
  const near20MissingPrimaryTrace = evidenceSandbox.buildChartConsistencyTrace(
    {ticker:'NVDA', marketData:{price:225.83, ma20:207.25, ma50:191.18, ma200:185.44}, review:{chartRef:{dataUrl:'data:image/png;base64,abc'}, normalizedAnalysis:{
      visible_ticker:'NVDA',
      visible_timeframe:'1D',
      visible_latest_price:225.83,
      visible_ma20:null,
      visible_ma50:191.18,
      visible_ma200:null,
      ma20_visible:false,
      ma50_visible:true,
      ma200_visible:false
    }}},
    {canonicalVerdict:'watch', visualBucket:'monitor'},
    {derivedStates:{structureState:'intact', bounceState:'attempt', pullbackZone:'near_20ma'}}
  );
  if(near20MissingPrimaryTrace.status === 'partial_indicator_visibility'){
    throw new Error('near_20ma setups must not become partial_indicator_visibility when 20MA is missing even if 50MA matches.');
  }
  const near20MissingPrimaryDecision = evidenceSandbox.chartVerificationUiDecision(near20MissingPrimaryTrace, 'NVDA');
  if(evidenceSandbox.chartVerificationShouldShowManualActions(near20MissingPrimaryDecision, near20MissingPrimaryTrace, 'committed', true) !== true){
    throw new Error('near_20ma setups with missing 20MA must keep manual confirmation controls visible.');
  }
  const near20MatchedPrimaryTrace = evidenceSandbox.buildChartConsistencyTrace(
    {ticker:'NVDA', marketData:{price:225.83, ma20:207.25, ma50:191.18, ma200:185.44}, review:{chartRef:{dataUrl:'data:image/png;base64,abc'}, normalizedAnalysis:{
      visible_ticker:'NVDA',
      visible_ticker_source:'ocr',
      visible_timeframe:'1D',
      visible_timeframe_source:'ocr',
      visible_latest_price:225.83,
      visible_price_source:'ocr',
      visible_ma20:207.25,
      visible_ma50:null,
      visible_ma200:null,
      ma20_visible:true,
      ma50_visible:false,
      ma200_visible:false
    }}},
    {canonicalVerdict:'watch', visualBucket:'monitor'},
    {derivedStates:{structureState:'intact', bounceState:'attempt', pullbackZone:'near_20ma'}}
  );
  if(near20MatchedPrimaryTrace.status !== 'partial_indicator_visibility'){
    throw new Error('near_20ma setups with matching 20MA and missing secondary indicators must allow partial_indicator_visibility.');
  }
  const near50MissingPrimaryTrace = evidenceSandbox.buildChartConsistencyTrace(
    {ticker:'NVDA', marketData:{price:225.83, ma20:207.25, ma50:191.18, ma200:185.44}, review:{chartRef:{dataUrl:'data:image/png;base64,abc'}, normalizedAnalysis:{
      visible_ticker:'NVDA',
      visible_ticker_source:'ocr',
      visible_timeframe:'1D',
      visible_timeframe_source:'ocr',
      visible_latest_price:225.83,
      visible_price_source:'ocr',
      visible_ma20:207.25,
      visible_ma50:null,
      visible_ma200:null,
      ma20_visible:true,
      ma50_visible:false,
      ma200_visible:false
    }}},
    {canonicalVerdict:'watch', visualBucket:'monitor'},
    {derivedStates:{structureState:'intact', bounceState:'attempt', pullbackZone:'near_50ma'}}
  );
  if(near50MissingPrimaryTrace.status === 'partial_indicator_visibility'){
    throw new Error('near_50ma setups must not become partial_indicator_visibility when 50MA is missing even if 20MA matches.');
  }
  const near50MatchedPrimaryTrace = evidenceSandbox.buildChartConsistencyTrace(
    {ticker:'NVDA', marketData:{price:225.83, ma20:207.25, ma50:191.18, ma200:185.44}, review:{chartRef:{dataUrl:'data:image/png;base64,abc'}, normalizedAnalysis:{
      visible_ticker:'NVDA',
      visible_ticker_source:'ocr',
      visible_timeframe:'1D',
      visible_timeframe_source:'ocr',
      visible_latest_price:225.83,
      visible_price_source:'ocr',
      visible_ma20:null,
      visible_ma50:191.18,
      visible_ma200:null,
      ma20_visible:false,
      ma50_visible:true,
      ma200_visible:false
    }}},
    {canonicalVerdict:'watch', visualBucket:'monitor'},
    {derivedStates:{structureState:'intact', bounceState:'attempt', pullbackZone:'near_50ma'}}
  );
  if(near50MatchedPrimaryTrace.status !== 'partial_indicator_visibility'){
    throw new Error('near_50ma setups with matching 50MA and missing secondary indicators must allow partial_indicator_visibility.');
  }
  const unknownSetupFallbackTrace = evidenceSandbox.buildChartConsistencyTrace(
    {ticker:'NVDA', marketData:{price:225.83, ma20:207.25, ma50:191.18, ma200:185.44}, review:{chartRef:{dataUrl:'data:image/png;base64,abc'}, normalizedAnalysis:{
      visible_ticker:'NVDA',
      visible_ticker_source:'ocr',
      visible_timeframe:'1D',
      visible_timeframe_source:'ocr',
      visible_latest_price:225.83,
      visible_price_source:'ocr',
      visible_ma20:null,
      visible_ma50:191.18,
      visible_ma200:null,
      ma20_visible:false,
      ma50_visible:true,
      ma200_visible:false
    }}},
    {canonicalVerdict:'watch', visualBucket:'monitor'},
    {derivedStates:{structureState:'intact', bounceState:'attempt', pullbackZone:'unknown'}}
  );
  if(unknownSetupFallbackTrace.status !== 'partial_indicator_visibility'){
    throw new Error('Unknown setup-MA context may fall back to either 20MA or 50MA support for partial_indicator_visibility.');
  }
  const inferredIndicatorTrace = evidenceSandbox.buildChartConsistencyTrace(
    {ticker:'NVDA', marketData:{price:225.83, ma20:207.25, ma50:191.18, ma200:185.44}, review:{chartRef:{dataUrl:'data:image/png;base64,abc'}, normalizedAnalysis:{
      visible_ticker:'NVDA',
      visible_ticker_source:'ocr',
      visible_timeframe:'1D',
      visible_timeframe_source:'ocr',
      visible_latest_price:225.83,
      visible_price_source:'ocr',
      visible_ma20:207.25,
      visible_ma50:191.18,
      visible_ma200:null,
      ma20_visible:true,
      ma50_visible:true,
      ma200_visible:false,
      ma200_line_detected:false,
      ma200_text_detected:false,
      ma200_value_extracted:false,
      ma200_confidence:0.62,
      ma200_extraction_method_used:'200MA colour/context line inference'
    }}},
    {canonicalVerdict:'watch', visualBucket:'monitor'},
    {derivedStates:{structureState:'intact', bounceState:'attempt', pullbackZone:'near_20ma'}}
  );
  if(inferredIndicatorTrace.indicatorStates.ma200_status !== 'inferred' || !inferredIndicatorTrace.inferredIndicators.includes('200MA') || inferredIndicatorTrace.missingIndicators.includes('200MA')){
    throw new Error('Likely visible 200MA without OCR value must be inferred, not missing.');
  }
  if(inferredIndicatorTrace.extractedFacts.visible_ma200 !== null){
    throw new Error('Inferred 200MA visibility must not fabricate a numeric MA value.');
  }
  const confidenceOnlyIndicatorTrace = evidenceSandbox.buildChartConsistencyTrace(
    {ticker:'NVDA', marketData:{price:225.83, ma20:207.25, ma50:191.18, ma200:185.44}, review:{chartRef:{dataUrl:'data:image/png;base64,abc'}, normalizedAnalysis:{
      visible_ticker:'NVDA',
      visible_timeframe:'1D',
      visible_latest_price:225.83,
      visible_ma20:207.25,
      visible_ma50:191.18,
      visible_ma200:null,
      ma20_visible:true,
      ma50_visible:true,
      ma200_visible:false,
      ma200_line_detected:false,
      ma200_text_detected:false,
      ma200_value_extracted:false,
      ma200_confidence:0.78,
      ma200_extraction_method_used:'colour/context line inference'
    }}},
    {canonicalVerdict:'watch', visualBucket:'monitor'},
    {derivedStates:{structureState:'intact', bounceState:'attempt', pullbackZone:'near_20ma'}}
  );
  if(confidenceOnlyIndicatorTrace.indicatorStates.ma200_status !== 'missing'){
    throw new Error('MA confidence alone must not infer 200MA visibility without 200MA-specific evidence.');
  }
  const liveToleranceTrace = evidenceSandbox.buildChartConsistencyTrace(
    {ticker:'NVDA', chartVerificationMarketOpen:true, marketData:{price:225.83, ma20:207.25, ma50:191.18, ma200:185.44}, review:{chartRef:{dataUrl:'data:image/png;base64,abc'}, normalizedAnalysis:{
      visible_ticker:'NVDA',
      visible_ticker_source:'ocr',
      visible_timeframe:'1D',
      visible_timeframe_source:'ocr',
      visible_latest_price:226.90,
      visible_price_source:'ocr',
      visible_ma20:207.92,
      visible_ma50:191.74,
      visible_ma200:185.99,
      ma20_visible:true,
      ma50_visible:true,
      ma200_visible:true
    }}},
    {canonicalVerdict:'watch', visualBucket:'monitor', planStatus:'missing'},
    {derivedStates:{structureState:'intact', bounceState:'attempt', pullbackZone:'near_20ma'}}
  );
  if(liveToleranceTrace.status !== 'verified_match' || liveToleranceTrace.debug.marketOpenAssumed !== true || liveToleranceTrace.debug.staleDataPossible !== true){
    throw new Error('Small visible value drift during market hours must verify within live-market tolerance.');
  }
  if(liveToleranceTrace.debug.canonicalVerdict !== 'watch' || liveToleranceTrace.debug.visualBucket !== 'monitor'){
    throw new Error('Chart verification tolerance must not mutate verdict or bucket semantics.');
  }
  const closedToleranceTrace = evidenceSandbox.buildChartConsistencyTrace(
    {ticker:'NVDA', chartVerificationMarketOpen:false, marketData:{price:225.83, ma20:207.25, ma50:191.18, ma200:185.44}, review:{chartRef:{dataUrl:'data:image/png;base64,abc'}, normalizedAnalysis:{
      visible_ticker:'NVDA',
      visible_ticker_source:'ocr',
      visible_timeframe:'1D',
      visible_timeframe_source:'ocr',
      visible_latest_price:226.90,
      visible_price_source:'ocr',
      visible_ma20:207.92,
      visible_ma50:191.74,
      visible_ma200:185.99,
      ma20_visible:true,
      ma50_visible:true,
      ma200_visible:true
    }}},
    {canonicalVerdict:'watch', visualBucket:'monitor', planStatus:'missing'},
    {derivedStates:{structureState:'intact', bounceState:'attempt', pullbackZone:'near_20ma'}}
  );
  if(!['minor_drift','possible_mismatch'].includes(closedToleranceTrace.status) || closedToleranceTrace.debug.marketOpenAssumed !== false){
    throw new Error('Closed-market tolerance must stay strict enough to flag stale or wrong chart values.');
  }
  const proximityLabelTrace = evidenceSandbox.buildChartConsistencyTrace(
    {ticker:'NVDA', chartVerificationMarketOpen:true, marketData:{price:140, ma20:133.85, ma50:125.37, ma200:114.92}, review:{chartRef:{dataUrl:'data:image/png;base64,abc'}, normalizedAnalysis:{
      visible_ticker:'NVDA',
      visible_ticker_source:'ocr',
      visible_timeframe:'1D',
      visible_timeframe_source:'ocr',
      visible_latest_price:140.05,
      visible_price_source:'ocr',
      visible_ma20:null,
      visible_ma50:null,
      visible_ma200:null,
      visible_numeric_labels:[133.90, 125.72, 115.09],
      ma20_visible:true,
      ma50_visible:true,
      ma200_visible:true
    }}},
    {canonicalVerdict:'watch', visualBucket:'monitor', planStatus:'missing'},
    {derivedStates:{structureState:'intact', bounceState:'attempt', pullbackZone:'near_20ma'}}
  );
  if(proximityLabelTrace.indicatorStates.ma20_status !== 'verified' || proximityLabelTrace.indicatorStates.ma50_status !== 'verified' || proximityLabelTrace.indicatorStates.ma200_status !== 'verified'){
    throw new Error('Unassigned visible numeric labels must map to trusted MA values by proximity within tolerance.');
  }
  if(proximityLabelTrace.status !== 'verified_match' || proximityLabelTrace.title === 'Partial indicator visibility' || proximityLabelTrace.missingIndicators.length || proximityLabelTrace.partialIndicators.length || proximityLabelTrace.summaryDerivedFromFinalState !== true){
    throw new Error('All proximity-mapped indicators must resolve final summary to verified, not stale partial/missing state.');
  }
  if(!proximityLabelTrace.debug.numericLabelToMaMatches || !proximityLabelTrace.debug.numericLabelToMaMatches.ma200){
    throw new Error('Numeric label to MA proximity matches must be included in chart verification diagnostics.');
  }
  const proximityMarkup = evidenceSandbox.renderChartConsistencyTrace(proximityLabelTrace);
  if(!/20 133\.90/.test(proximityMarkup) || !/50 125\.72/.test(proximityMarkup) || !/200 115\.09/.test(proximityMarkup)){
    throw new Error('Proximity-mapped MA values must be shown in chart verification extracted display.');
  }
  const proximityWithoutLineTrace = evidenceSandbox.buildChartConsistencyTrace(
    {ticker:'NVDA', chartVerificationMarketOpen:true, marketData:{price:140, ma20:133.85, ma50:125.37, ma200:114.92}, review:{chartRef:{dataUrl:'data:image/png;base64,abc'}, normalizedAnalysis:{
      visible_ticker:'NVDA',
      visible_ticker_source:'ocr',
      visible_timeframe:'1D',
      visible_timeframe_source:'ocr',
      visible_latest_price:140.05,
      visible_price_source:'ocr',
      visible_numeric_labels:[133.90, 125.72, 115.09],
      ma20_visible:false,
      ma50_visible:false,
      ma200_visible:false
    }}},
    {canonicalVerdict:'watch', visualBucket:'monitor', planStatus:'missing'},
    {derivedStates:{structureState:'intact', bounceState:'attempt', pullbackZone:'near_20ma'}}
  );
  if(!['chart_verification_untrusted','untrusted_context_mirror'].includes(proximityWithoutLineTrace.status) && (proximityWithoutLineTrace.indicatorStates.ma20_status !== 'likely_match' || proximityWithoutLineTrace.indicatorStates.ma50_status !== 'likely_match' || proximityWithoutLineTrace.indicatorStates.ma200_status !== 'likely_match')){
    throw new Error('Unassigned numeric labels without line evidence must be likely_match, not missing or fully verified.');
  }
  if(!['likely_match','chart_verification_untrusted','untrusted_context_mirror'].includes(proximityWithoutLineTrace.status) || proximityWithoutLineTrace.title === 'Partial indicator visibility'){
    throw new Error('Header-only proximity matches must either stay likely_match with native evidence or downgrade to untrusted.');
  }
  const portraitSourceTrace = evidenceSandbox.buildChartImageSourceTrace({
    chartRef:{dataUrl:'data:image/png;base64,source', width:900, height:1600},
    chartImageOriginal:{width:900, height:1600, dataUrlField:'chartRef.dataUrl'},
    chartImagePreview:{width:360, height:480, displayMode:'thumb_object_fit_cover'},
    chartImageVerificationSource:{source:'chartImageOriginal', width:900, height:1600}
  });
  if(portraitSourceTrace.verificationSourceDimensions !== '900x1600' || portraitSourceTrace.previewDimensions !== '360x480' || portraitSourceTrace.verificationUsesCroppedPreview !== false){
    throw new Error('9:16 chart uploads must keep original dimensions for verification even when preview dimensions differ.');
  }
  const legacySourceTrace = evidenceSandbox.buildChartImageSourceTrace({
    chartRef:{dataUrl:'data:image/png;base64,legacy', width:360, height:480}
  });
  if(legacySourceTrace.sourceKind !== 'legacy_chartRef_fallback' || legacySourceTrace.limited !== true){
    throw new Error('Legacy chartRef without chartImageOriginal metadata must be marked as limited fallback verification.');
  }
  const sourceForAnalysis = evidenceSandbox.chartImageForAnalysis({
    chartRef:{dataUrl:'data:image/png;base64,source', width:900, height:1600, name:'portrait.png', type:'image/png'},
    chartImageOriginal:{width:900, height:1600, dataUrlField:'chartRef.dataUrl', name:'portrait.png', type:'image/png'},
    chartImagePreview:{width:360, height:480, dataUrl:'data:image/png;base64,cropped-preview', displayMode:'thumb_object_fit_cover'}
  });
  if(!sourceForAnalysis.chartRef || sourceForAnalysis.chartRef.dataUrl !== 'data:image/png;base64,source' || sourceForAnalysis.sourceTrace.sourceKind !== 'chartImageOriginal'){
    throw new Error('AI extraction must use the original source image, not the cropped preview image.');
  }
  if(sourceForAnalysis.sourceTrace.originalAvailable !== true || sourceForAnalysis.sourceTrace.fallbackUsed !== false || sourceForAnalysis.sourceTrace.verificationUsesCroppedPreview !== false){
    throw new Error('Chart extraction source trace must prefer the original image path when available.');
  }
  const priceMismatchTrace = evidenceSandbox.buildChartConsistencyTrace(
    {ticker:'NVDA', marketData:{price:500, ma20:490, ma50:460, ma200:400}, review:{chartRef:{dataUrl:'data:image/png;base64,abc'}, normalizedAnalysis:{
      visible_ticker:'NVDA',
      visible_ticker_source:'ocr',
      visible_timeframe:'1D',
      visible_timeframe_source:'ocr',
      visible_latest_price:430,
      visible_price_source:'ocr',
      visible_ma20:490,
      visible_ma50:460,
      visible_ma200:400,
      ma20_visible:true,
      ma50_visible:true,
      ma200_visible:true
    }}},
    {canonicalVerdict:'watch', visualBucket:'monitor'},
    {derivedStates:{structureState:'intact', bounceState:'attempt', pullbackZone:'near_20ma'}}
  );
  if(priceMismatchTrace.status !== 'possible_mismatch' || priceMismatchTrace.mismatchSeverity !== 'possible_mismatch' || priceMismatchTrace.aiAnalysisSuppressed !== true){
    throw new Error('Moderate visible latest price mismatch must produce possible_mismatch with strong AI suppression.');
  }
  const strongMismatchTrace = evidenceSandbox.buildChartConsistencyTrace(
    {ticker:'CTVA', marketData:{price:83.30, ma20:80.95, ma50:80.99, ma200:72.13}, review:{chartRef:{dataUrl:'data:image/png;base64,abc'}, normalizedAnalysis:{
      visible_ticker:'CTVA',
      visible_ticker_source:'ocr',
      visible_timeframe:'1D',
      visible_timeframe_source:'ocr',
      visible_latest_price:440.56,
      visible_price_source:'ocr',
      visible_ma20:80.95,
      visible_ma50:80.99,
      visible_ma200:72.13,
      ma20_visible:true,
      ma50_visible:true,
      ma200_visible:true
    }}},
    {canonicalVerdict:'watch', visualBucket:'monitor', planStatus:'missing'},
    {derivedStates:{structureState:'intact', bounceState:'attempt', pullbackZone:'near_20ma'}}
  );
  const strongMismatchMarkup = evidenceSandbox.renderChartConsistencyTrace(strongMismatchTrace);
  if(strongMismatchTrace.status !== 'strong_mismatch' || strongMismatchTrace.title !== 'Chart mismatch detected' || strongMismatchTrace.aiAnalysisSuppressed !== true || strongMismatchTrace.debug.canonicalVerdict !== 'watch' || strongMismatchTrace.debug.fastPass.earlyExit !== true || strongMismatchTrace.debug.fastPass.deepVerificationQueued !== false){
    throw new Error('Severe chart price mismatch must fast-exit as strong_mismatch without changing resolver state.');
  }
  const strongMismatchSummary = strongMismatchMarkup.split('<summary>Show details</summary>')[0] || strongMismatchMarkup;
  if(!/Uploaded chart does not appear to match CTVA\./.test(strongMismatchSummary) || /Visible price 440\.56/.test(strongMismatchSummary)){
    throw new Error('Strong mismatch default wording must be short and non-technical.');
  }
  const strongMismatchSuppression = evidenceSandbox.chartVerificationAiSuppression(
    {ticker:'CTVA', marketData:{price:83.30, ma20:80.95, ma50:80.99, ma200:72.13}},
    {
      visible_ticker:'CTVA',
      visible_timeframe:'1D',
      visible_latest_price:440.56,
      visible_ma20:80.95,
      visible_ma50:80.99,
      visible_ma200:72.13,
      ma20_visible:true,
      ma50_visible:true,
      ma200_visible:true,
      coach_summary:'Strong rally with improving momentum.'
    }
  );
  if(strongMismatchSuppression.suppressed !== true || !/technical analysis could be unreliable/i.test(strongMismatchSuppression.message)){
    throw new Error('Strong chart mismatch must suppress normal AI technical commentary surfaces.');
  }
  const traceDrivenSuppression = evidenceSandbox.chartVerificationAiSuppression(
    {ticker:'CTVA', marketData:{price:83.30}},
    {visible_ticker:'CTVA', visible_latest_price:440.56, coach_summary:'Strong rally with improving momentum.'},
    {chartConsistencyTrace:strongMismatchTrace}
  );
  if(traceDrivenSuppression.suppressed !== true){
    throw new Error('AI summary suppression must be able to use the already-computed chart verification trace.');
  }
  const suppressionMarkup = evidenceSandbox.renderSuppressedAiAnalysisPanel(strongMismatchSuppression, 'raw ai response');
  if(!/AI analysis limited/.test(suppressionMarkup) || /Strong rally with improving momentum/.test(suppressionMarkup) || !/Raw Response/.test(suppressionMarkup)){
    throw new Error('Suppressed AI analysis panel must hide technical commentary and preserve raw response details.');
  }
  const verifiedSuppressesLegacy = evidenceSandbox.buildChartConsistencyTrace(
    {ticker:'NVDA', marketData:{price:500, ma20:490, ma50:460, ma200:400}, review:{chartRef:{dataUrl:'data:image/png;base64,abc'}, normalizedAnalysis:{
      visible_ticker:'NVDA',
      visible_ticker_source:'ocr',
      visible_timeframe:'1D',
      visible_timeframe_source:'ocr',
      visible_latest_price:500,
      visible_price_source:'ocr',
      visible_ma20:490,
      visible_ma50:460,
      visible_ma200:400,
      ma20_visible:true,
      ma50_visible:true,
      ma200_visible:true,
      chart_match_status:'unclear',
      chart_match_warning:'Legacy AI was unsure.'
    }}},
    {canonicalVerdict:'watch', visualBucket:'monitor'},
    {derivedStates:{structureState:'intact', bounceState:'attempt', pullbackZone:'near_20ma'}}
  );
  if(verifiedSuppressesLegacy.status !== 'verified_match' || verifiedSuppressesLegacy.sources.includes('legacy_ai_chart_match')){
    throw new Error('Deterministic verified_match must suppress legacy AI chart-match uncertainty.');
  }
  if(verifiedSuppressesLegacy.debug.fastPass.fastStatus !== 'clear_match_candidate' || verifiedSuppressesLegacy.debug.fastPass.deepVerificationQueued !== true || verifiedSuppressesLegacy.debug.fastPass.independentImageEvidence !== true){
    throw new Error('Valid fast-pass chart candidates must proceed to full deterministic verification.');
  }
  if(verifiedSuppressesLegacy.indicatorStates.ma20_status !== 'verified' || verifiedSuppressesLegacy.indicatorStates.ma50_status !== 'verified' || verifiedSuppressesLegacy.indicatorStates.ma200_status !== 'verified'){
    throw new Error('All visible matching MA values must report verified indicator states.');
  }
  const verifiedSuppression = evidenceSandbox.chartVerificationAiSuppression(
    {ticker:'NVDA', marketData:{price:500, ma20:490, ma50:460, ma200:400}},
    {
      visible_ticker:'NVDA',
      visible_ticker_source:'ocr',
      visible_timeframe:'1D',
      visible_timeframe_source:'ocr',
      visible_latest_price:500,
      visible_price_source:'ocr',
      visible_ma20:490,
      visible_ma50:460,
      visible_ma200:400,
      ma20_visible:true,
      ma50_visible:true,
      ma200_visible:true,
      coach_summary:'Normal chart commentary.'
    }
  );
  if(verifiedSuppression.suppressed === true){
    throw new Error('Verified charts must still allow normal AI analysis display.');
  }
  const headerOnlyDeterministicTrace = evidenceSandbox.buildChartConsistencyTrace(
    {ticker:'MRNA', marketData:{price:26.80}, review:{chartRef:{dataUrl:'data:image/png;base64,abc'}, normalizedAnalysis:{
      chartIdentityProvenanceVersion:1,
      visible_ticker:'MRNA',
      visible_timeframe:'1D',
      visible_latest_price:26.80,
      chart_match_status:'match',
      chart_match_warning:'Looks like MRNA.'
    }}},
    {canonicalVerdict:'watch', visualBucket:'monitor'},
    {derivedStates:{structureState:'intact', bounceState:'attempt', pullbackZone:'near_20ma'}}
  );
  if(['verified_match', 'likely_match', 'partial_indicator_visibility', 'mostly_verified'].includes(String(headerOnlyDeterministicTrace.status || ''))){
    throw new Error('AI match plus header-only OCR must not promote a chart when visible identity evidence is missing.');
  }
  const rawAssessorNormalized = evidenceSandbox.chartAssessorInputToNormalizedAnalysis({
    ticker:'NVDA',
    reviewTicker:'NVDA',
    verificationRequestId:'analysis-test',
    chartImageId:'img-test',
    extractedTicker:'NVDA',
    extractedTimeframe:'1D',
    extractedPrice:220.61,
    chartMatchStatus:'match',
    chartMatchWarning:'',
    aiSupportedMatch:true
  }, {chartRef:{imageId:'img-test'}}, {forceMatch:false});
  rawAssessorNormalized.chartIdentityProvenanceVersion = 1;
  const rawAssessorTrace = evidenceSandbox.buildChartConsistencyTrace(
    {ticker:'NVDA', marketData:{price:220.61}, review:{chartRef:{dataUrl:'data:image/png;base64,abc', imageId:'img-test'}}},
    {canonicalVerdict:'watch', visualBucket:'monitor'},
    {normalizedAnalysis:rawAssessorNormalized}
  );
  if(['verified_match', 'likely_match', 'partial_indicator_visibility', 'mostly_verified'].includes(String(rawAssessorTrace.status || ''))){
    throw new Error('Raw chart assessor payloads without visible-identity provenance must not be promoted into a verified chart state.');
  }
  const legacyFallbackTrace = evidenceSandbox.buildChartConsistencyTrace(
    {ticker:'NVDA', review:{chartRef:{dataUrl:'data:image/png;base64,abc'}, normalizedAnalysis:{
      chart_match_status:'mismatch',
      chart_match_warning:'Legacy AI says the image may be a different ticker.'
    }}},
    {canonicalVerdict:'watch', visualBucket:'monitor'},
    {derivedStates:{structureState:'intact', bounceState:'attempt', pullbackZone:'near_20ma'}}
  );
  if(legacyFallbackTrace.status !== 'possible_mismatch' || !legacyFallbackTrace.sources.includes('legacy_ai_chart_match')){
    throw new Error('Legacy AI chart-match fields must remain fallback-only when deterministic extraction is unavailable.');
  }
  const previewFallbackTrace = evidenceSandbox.buildChartConsistencyTrace(
    {ticker:'CTVA', marketData:{price:83.30, ma20:80.95, ma50:80.99, ma200:72.13}, review:{
      chartImagePreview:{dataUrl:'data:image/png;base64,preview', width:1080, height:2400},
      normalizedAnalysis:{
        visible_ticker:'CTVA',
        visible_ticker_source:'ocr',
        visible_timeframe:'1D',
        visible_timeframe_source:'ocr',
        visible_latest_price:83.30,
        visible_price_source:'ocr',
        chart_match_status:'unclear',
        risk_evidence:['The lack of stabilization raises uncertainty about the sustainability of the current bounce.']
      }
    }},
    {canonicalVerdict:'watch', visualBucket:'monitor'},
    {derivedStates:{structureState:'intact', bounceState:'attempt', pullbackZone:'near_20ma'}}
  );
  const previewFallbackEvidence = (previewFallbackTrace.evidence || []).join(' ');
  if(previewFallbackTrace.chartImageSource.sourceKind !== 'chartImagePreview_fallback' || previewFallbackTrace.debug.hasChart !== true){
    throw new Error('Preview fallback image must count as an available chart source after app resume.');
  }
  if(/No chart screenshot is attached/i.test(previewFallbackEvidence)){
    throw new Error('Preview fallback image must not also report that no chart screenshot is attached.');
  }
  if(/lack of stabilization/i.test(previewFallbackEvidence) || previewFallbackTrace.sources.includes('legacy_ai_chart_match')){
    throw new Error('Legacy chart-match fallback must not surface non-chart risk evidence when deterministic chart facts exist.');
  }
  const staleChartTrace = evidenceSandbox.buildChartConsistencyTrace(
    {ticker:'BWXT', marketData:{price:210.94, ma20:200, ma50:190, ma200:170}, review:{
      chartRef:{dataUrl:'data:image/png;base64,new-bwxt-chart', imageId:'new_image', width:1080, height:2400},
      chartImageOriginal:{imageId:'new_image', width:1080, height:2400, dataUrlField:'chartRef.dataUrl'},
      normalizedAnalysis:{
        __chartImageId:'old_image',
        visible_ticker:'CTVA',
        visible_timeframe:'1D',
        visible_latest_price:83.31,
        visible_ma20:80.95,
        visible_ma50:80.99,
        visible_ma200:72.13,
        ma20_visible:true,
        ma50_visible:true,
        ma200_visible:true
      }
    }},
    {canonicalVerdict:'watch', visualBucket:'monitor'},
    {derivedStates:{structureState:'intact', bounceState:'attempt', pullbackZone:'near_20ma'}}
  );
  if(staleChartTrace.status === 'ticker_mismatch' || /CTVA|83\.31/.test(JSON.stringify(staleChartTrace))){
    throw new Error('Chart verification must ignore normalized analysis tied to a previous chart image id.');
  }
  const staleFastPass = evidenceSandbox.buildChartVerificationFastPass(
    {ticker:'BWXT', marketData:{price:210.94}, review:{chartRef:{dataUrl:'data:image/png;base64,new-bwxt-chart', imageId:'new_image'}}},
    {__chartImageId:'old_image', visible_ticker:'CTVA', visible_latest_price:83.31},
    {imageId:'new_image'}
  );
  if(staleFastPass.fastStatus !== 'stale_state_detected' || staleFastPass.staleStateRejected !== true || staleFastPass.earlyExit !== true){
    throw new Error('Fast chart verification must reject payloads tied to an older chart image version.');
  }
  const explicitlyClearedChartTrace = evidenceSandbox.buildChartConsistencyTrace(
    {ticker:'BWXT', marketData:{price:210.94, ma20:200, ma50:190, ma200:170}, review:{
      chartRef:{dataUrl:'data:image/png;base64,new-bwxt-chart', imageId:'new_image', width:1080, height:2400},
      normalizedAnalysis:{
        visible_ticker:'CTVA',
        visible_timeframe:'1D',
        visible_latest_price:83.31
      }
    }},
    {canonicalVerdict:'watch', visualBucket:'monitor'},
    {normalizedAnalysis:null, derivedStates:{structureState:'intact', bounceState:'attempt', pullbackZone:'near_20ma'}}
  );
  if(/CTVA|83\.31/.test(JSON.stringify(explicitlyClearedChartTrace))){
    throw new Error('Explicitly cleared chart analysis must not fall back to stale review.normalizedAnalysis.');
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
  if(!/max_output_tokens:\s*(9\d\d|1\d{3,})/.test(analyseSetupSource)){
    throw new Error('AI chart-coach endpoint must allow enough output tokens for the expanded evidence schema.');
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
