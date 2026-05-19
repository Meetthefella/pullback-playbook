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
    tgtStyleAliveWatchSemantic.blocker,
    tgtStyleAliveWatchSemantic.tradeStatus && tgtStyleAliveWatchSemantic.tradeStatus.line1,
    tgtStyleAliveWatchSemantic.tradeStatus && tgtStyleAliveWatchSemantic.tradeStatus.line2,
    tgtStyleAliveWatchSemantic.rrDisplay
  ].join(' | ');
  if(!/broader uptrend is still intact|bounce attempt|not stable enough|price reliably|No actionable trade yet/i.test(tgtStyleText)){
    throw new Error('TGT-style alive Watch copy must frame the setup as intact trend + unconfirmed bounce + not priceable yet.');
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
  if(!healthyMissingPlan.show || !/waiting for bounce|needs confirmation|alive|stepping back in/i.test(healthyText)){
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
  if(!/plan pending|cleaner entry and stop|no actionable plan/i.test(missingPlanText)){
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
    'buildChartAssessorInput',
    'chartVerificationTracePriority',
    'annotateChartTraceForRender',
    'chartAssessorInputToNormalizedAnalysis',
    'selectReviewChartTraceForRender',
    'chartImageDimensionsFromRef',
    'chartImageDimensionsLabel',
    'buildChartImageSourceTrace',
    'hasVerifiableReviewChartSource',
    'chartImageForAnalysis',
    'clearReviewChartImageSources',
    'confirmReviewChartMatchesCurrentTicker',
    'rejectReviewChartAndUploadAnother',
    'debugFlagEnabled',
    'chartVerificationUiDecision',
    'chartDecisionClassName',
    'ensureReviewChartLightboxShell',
    'closeReviewChartLightbox',
    'openReviewChartLightbox',
    'clearStartupReviewSessionState',
    'buildDeterministicChartVerification',
    'buildChartConsistencyTrace',
    'chartVerificationAiSuppression',
    'renderSuppressedAiAnalysisPanel',
    'renderChartConsistencyTrace',
    'chartVerificationShouldShowManualActions',
    'getReviewChartVerificationState',
    'analysisDerivedStatesFromRecord'
  ].forEach(functionName => {
    vm.runInContext(extractFunctionSource(appSource, functionName), evidenceSandbox, {filename:`app.js#${functionName}`});
  });
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
      visible_timeframe:'1D',
      visible_latest_price:500,
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
  if(deterministicMissingTrace.status !== 'uncertain_missing_context' || !deterministicMissingTrace.missing.includes('independent chart evidence')){
    throw new Error('Missing deterministic ticker/timeframe facts must produce uncertain_missing_context.');
  }
  if(deterministicMissingTrace.debug.fastPass.fastStatus !== 'insufficient_context' || deterministicMissingTrace.debug.fastPass.earlyExit === true || deterministicMissingTrace.aiAnalysisSuppressed !== false){
    throw new Error('Insufficient fast-pass context must remain a warning, not a hard suppression.');
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
  if(finalUncertainSuppression.suppressed !== false){
    throw new Error('Ticker/price OCR without chart-native confirmation must be allowed with warning.');
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
  if(contextMirroringTrace.debug.fastPass.fastStatus !== 'insufficient_context' || contextMirroringTrace.debug.fastPass.contextMirroringSuspected !== true || contextMirroringTrace.aiAnalysisSuppressed !== false){
    throw new Error('Ticker/price matching app context without independent image evidence must stay a warning, not a hard suppression.');
  }
  const independentFastPassTrace = evidenceSandbox.buildChartConsistencyTrace(
    {ticker:'CTVA', marketData:{price:83.30, ma20:80.95, ma50:80.99, ma200:72.13}, review:{chartRef:{dataUrl:'data:image/png;base64,abc'}, normalizedAnalysis:{
      visible_ticker:'CTVA',
      visible_timeframe:'1D',
      visible_latest_price:83.30,
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
      visible_timeframe:'1D',
      visible_latest_price:49.04,
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
  if(!localPreAiFastPass || localPreAiFastPass.status !== 'pending_chart_native_verification' || localPreAiFastPass.aiAnalysisSuppressed !== false || /verified/i.test(String(localPreAiFastPass.title || ''))){
    throw new Error('Pre-AI chart verification must begin as a lightweight pending fast pass before AI analysis completes.');
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
  if(preAiPendingDecision.key !== 'uncertain_match' || !/Verification incomplete/i.test(String(preAiPendingDecision.title || '')) || !/auto-read enough chart details/i.test(String(preAiPendingDecision.summary || ''))){
    throw new Error('Pending chart verification must map to a softened uncertain_match decision.');
  }
  if(evidenceSandbox.chartVerificationShouldShowManualActions(preAiPendingDecision, preAiPendingTrace, 'running', true) !== false){
    throw new Error('Pending chart verification must not require manual confirmation before deterministic analysis completes.');
  }
  if(!['pending_chart_native_verification','partial_context_unverified_chart','uncertain_missing_context'].includes(String(preAiPendingTrace.status || ''))){
    throw new Error('Pre-AI chart verification must remain pending or partially verified until chart-native evidence exists.');
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
  const nvdaNormalizedFallback = evidenceSandbox.chartAssessorInputToNormalizedAnalysis(nvdaAssessorInput, {ticker:'NVDA', review:{chartRef:{dataUrl:'data:image/png;base64,abc', imageId:'chart-1'}, chartImageOriginal:{dataUrl:'data:image/png;base64,abc', imageId:'chart-1', dataUrlField:'chartRef.dataUrl'}, chartImagePreview:{dataUrl:'data:image/png;base64,abc', imageId:'chart-1'}, chartImageVerificationSource:{source:'chartImageOriginal', sourceField:'chartRef.dataUrl', imageId:'chart-1'}}}, {forceMatch:true});
  if(nvdaNormalizedFallback.visible_ticker !== 'NVDA' || nvdaNormalizedFallback.visible_timeframe !== '1D' || nvdaNormalizedFallback.chart_match_status !== 'match'){
    throw new Error('Normalized chart assessor input must round-trip already normalized analysis into a committed chart context.');
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
  const aiSupportedMatchTrace = evidenceSandbox.buildChartConsistencyTrace(
    {ticker:'MRNA', marketData:{price:49.04, ma20:48.15, ma50:47.3, ma200:43.1}, review:{chartRef:{dataUrl:'data:image/png;base64,abc', imageId:'chart-1'}, normalizedAnalysis:{
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
  if(aiSupportedMatchTrace.status !== 'ai_supported_match' || aiSupportedMatchTrace.aiAnalysisSuppressed !== false || /uncertain/i.test(String(aiSupportedMatchTrace.title || ''))){
    throw new Error('AI-supported ticker/price match must resolve out of pending without uncertain suppression.');
  }
  const aiSupportedMatchDecision = evidenceSandbox.chartVerificationUiDecision(aiSupportedMatchTrace, 'MRNA');
  if(aiSupportedMatchDecision.key !== 'verified_match' || !/Chart appears to match MRNA/i.test(String(aiSupportedMatchDecision.title || '')) || !/AI supports the chart match/i.test(String(aiSupportedMatchDecision.detail || ''))){
    throw new Error('AI-supported match must render as a verified-style Review banner.');
  }
  if(evidenceSandbox.chartVerificationShouldShowManualActions(aiSupportedMatchDecision, aiSupportedMatchTrace, 'committed', true) !== false){
    throw new Error('AI-supported verified chart states must not show manual confirmation controls.');
  }
  const timeframeUncertainTrace = evidenceSandbox.buildChartConsistencyTrace(
    {ticker:'MRNA', marketData:{price:49.04, ma20:48.15, ma50:47.3, ma200:43.1}, review:{chartRef:{dataUrl:'data:image/png;base64,abc', imageId:'chart-1'}, normalizedAnalysis:{
      visible_ticker:'MRNA',
      visible_timeframe:'monthly',
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
  if(timeframeUncertainTrace.status !== 'partial_context_timeframe_uncertain' || timeframeUncertainTrace.aiAnalysisSuppressed !== false || !/timeframe/i.test(String(timeframeUncertainTrace.title || ''))){
    throw new Error('Uncertain timeframe must be treated as partial context, not a hard mismatch.');
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
  if(contaminatedHeaderTrace.status === 'likely_match' || contaminatedHeaderTrace.status === 'verified_match' || contaminatedHeaderTrace.aiAnalysisSuppressed !== false){
    throw new Error('Header/OCR-only evidence without chart-native confirmation must not upgrade to verified or likely_match.');
  }
  if(contaminatedHeaderTrace.status !== 'partial_context_unverified_chart' && contaminatedHeaderTrace.status !== 'uncertain_missing_context'){
    throw new Error('Contaminated header evidence must stay in a non-verified chart state.');
  }
  if(!/partially verified/i.test(String(contaminatedHeaderTrace.title || '')) || !/chart-native/i.test(String(contaminatedHeaderTrace.summary || ''))){
    throw new Error('Contaminated header evidence must explain that chart-native confirmation is missing.');
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
  if(mrnaPartialTimeframeTrace.debug.fastPass.fastStatus !== 'clear_match_candidate' || mrnaPartialTimeframeTrace.debug.fastPass.independentImageEvidence !== true){
    throw new Error('MRNA-style independent ticker/price evidence with a missing timeframe must still reach clear_match_candidate.');
  }
  if(mrnaPartialTimeframeTrace.status === 'uncertain_missing_context' || /uncertain/i.test(String(mrnaPartialTimeframeTrace.title || '')) || mrnaPartialTimeframeTrace.aiAnalysisSuppressed !== false || String(mrnaPartialTimeframeTrace.suppressionReason || '') !== ''){
    throw new Error('MRNA-style independent ticker/price evidence with a missing timeframe must render as verified/acceptable context without uncertain suppression.');
  }
  const mrnaPartialTimeframeDecision = evidenceSandbox.chartVerificationUiDecision(mrnaPartialTimeframeTrace, 'MRNA');
  if(mrnaPartialTimeframeDecision.key !== 'uncertain_match' || !/Verification incomplete/i.test(String(mrnaPartialTimeframeDecision.title || ''))){
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
  if(mrnaToleranceDriftTrace.debug.fastPass.fastStatus !== 'clear_match_candidate' || mrnaToleranceDriftTrace.debug.fastPass.independentImageEvidence !== true || mrnaToleranceDriftTrace.status === 'uncertain_missing_context' || /uncertain/i.test(String(mrnaToleranceDriftTrace.title || '')) || mrnaToleranceDriftTrace.aiAnalysisSuppressed !== false || String(mrnaToleranceDriftTrace.suppressionReason || '') !== ''){
    throw new Error('MRNA-style ticker/price evidence within tolerance must still render as verified/acceptable context without uncertain suppression.');
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
  if(mrnaPartialIndicatorTrace.debug.fastPass.fastStatus !== 'clear_match_candidate' || mrnaPartialIndicatorTrace.status === 'uncertain_missing_context' || /uncertain/i.test(String(mrnaPartialIndicatorTrace.title || '')) || mrnaPartialIndicatorTrace.aiAnalysisSuppressed !== false || String(mrnaPartialIndicatorTrace.suppressionReason || '') !== ''){
    throw new Error('Missing timeframe plus a partial indicator detail must still verify when ticker and price are independently matched.');
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
  if(mrnaMissingTickerTrace.status === 'likely_match' || mrnaMissingTickerTrace.aiAnalysisSuppressed !== false || !/uncertain|missing/i.test(String(mrnaMissingTickerTrace.title || ''))){
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
  if(mrnaMissingPriceTrace.status === 'likely_match' || mrnaMissingPriceTrace.aiAnalysisSuppressed !== false || !/uncertain|missing/i.test(String(mrnaMissingPriceTrace.title || ''))){
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
  if(!['indicator_missing','partial_context_unverified_chart'].includes(indicatorMissingTrace.status)){
    throw new Error('Hidden moving averages must stay non-verified even without chart-native confirmation.');
  }
  if(indicatorMissingTrace.indicatorStates.ma200_status !== 'missing'){
    throw new Error('200MA not visible at all must be reported as missing.');
  }
  const partialIndicatorTrace = evidenceSandbox.buildChartConsistencyTrace(
    {ticker:'NVDA', marketData:{price:225.83, ma20:207.24949999999998, ma50:191.17760000000007, ma200:185.4411499999999}, review:{chartRef:{dataUrl:'data:image/png;base64,abc'}, normalizedAnalysis:{
      visible_ticker:'NVDA',
      visible_timeframe:'1D',
      visible_latest_price:225.83,
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
  if(partialIndicatorTrace.status !== 'indicator_partial' || partialIndicatorTrace.indicatorStates.ma200_status !== 'partial' || !partialIndicatorTrace.partialIndicators.includes('200MA')){
    throw new Error('200MA line visible but value missing must be partial, not missing.');
  }
  if(!/Partial indicator visibility/.test(partialIndicatorTrace.title) || /Indicators missing/.test(partialIndicatorTrace.title)){
    throw new Error('Partial MA visibility must use partial wording, not missing-indicator wording.');
  }
  const partialIndicatorMarkup = evidenceSandbox.renderChartConsistencyTrace(partialIndicatorTrace);
  if(!/20 207\.25/.test(partialIndicatorMarkup) || !/50 191\.18/.test(partialIndicatorMarkup) || !/200 n\/a/.test(partialIndicatorMarkup) || !/200 185\.44/.test(partialIndicatorMarkup)){
    throw new Error('Chart verification display values must be formatted to 2 decimals and null as n/a.');
  }
  if(!/Show details/.test(partialIndicatorMarkup) || !/Extracted:/.test(partialIndicatorMarkup) || !/Trusted:/.test(partialIndicatorMarkup)){
    throw new Error('Chart verification panel must show a compact user-facing summary with diagnostics behind details.');
  }
  const inferredIndicatorTrace = evidenceSandbox.buildChartConsistencyTrace(
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
      visible_timeframe:'1D',
      visible_latest_price:226.90,
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
      visible_timeframe:'1D',
      visible_latest_price:226.90,
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
      visible_timeframe:'1D',
      visible_latest_price:140.05,
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
      visible_timeframe:'1D',
      visible_latest_price:140.05,
      visible_numeric_labels:[133.90, 125.72, 115.09],
      ma20_visible:false,
      ma50_visible:false,
      ma200_visible:false
    }}},
    {canonicalVerdict:'watch', visualBucket:'monitor', planStatus:'missing'},
    {derivedStates:{structureState:'intact', bounceState:'attempt', pullbackZone:'near_20ma'}}
  );
  if(proximityWithoutLineTrace.indicatorStates.ma20_status !== 'likely_match' || proximityWithoutLineTrace.indicatorStates.ma50_status !== 'likely_match' || proximityWithoutLineTrace.indicatorStates.ma200_status !== 'likely_match'){
    throw new Error('Unassigned numeric labels without line evidence must be likely_match, not missing or fully verified.');
  }
  if(proximityWithoutLineTrace.status !== 'likely_match' || proximityWithoutLineTrace.title === 'Partial indicator visibility' || proximityWithoutLineTrace.missingIndicators.length || proximityWithoutLineTrace.partialIndicators.length){
    throw new Error('All likely-matched indicators must resolve final summary to mostly verified, not stale partial/missing state.');
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
      visible_timeframe:'1D',
      visible_latest_price:430,
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
      visible_timeframe:'1D',
      visible_latest_price:440.56,
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
      visible_timeframe:'1D',
      visible_latest_price:500,
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
      visible_timeframe:'1D',
      visible_latest_price:500,
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
        visible_timeframe:'1D',
        visible_latest_price:83.30,
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

runPlanSemanticsAssertions();

console.log(`Resolver gate assertions passed (${results.length} cases).`);
console.log('Review projection invariant assertions passed.');
console.log('Watchlist long-press summary assertions passed.');
console.log('Simplified state pipeline assertions passed.');
console.log('AI chart-coach contract assertions passed.');
console.log('Plan source semantics assertions passed.');
