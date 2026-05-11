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

const resolverCore = sandbox.window.ResolverCore;
if(!resolverCore || typeof resolverCore.runTradeReadinessGateAssertions !== 'function'){
  throw new Error('Resolver gate assertion harness is unavailable.');
}

const results = resolverCore.runTradeReadinessGateAssertions();
const failures = results.filter(result => !result.pass);

if(failures.length){
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

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
    'provisionalPlanConfirmationCopy',
    'terminalAvoidCopyPattern',
    'sanitizeNonTerminalPlanCopy',
    'resolvePlanVisibility',
    'hasUnconfirmedPriceablePlanForReviewCopy',
    'normalizeUiCopy',
    'isDuplicatedStatusCopy',
    'nonPlanCalcNoteText',
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
}

runReviewProjectionAssertions();

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
  function depsFor(derivedStates, finalContract){
    return {
      riskSettings:{account_size:4000, risk_percent:1, max_loss_override:40, whole_shares_only:true},
      analysisDerivedStatesFromRecord:() => derivedStates,
      resolvePreLifecycleStateContract:() => finalContract,
      resolveFinalStateContract:() => finalContract,
      setupScoreForRecord:() => 8,
      isHostileMarketStatus:() => false,
      scannerScoreGradientClass:() => ''
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

  const strongExtendedUnpriceable = pipeline.resolveRecordState({
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
      priceabilityState:'unpriceable',
      stabilisationState:'early',
      bounceState:'none',
      pullbackZone:'extended',
      volumeState:'supportive'
    }, {
      finalVerdict:'Watch',
      structuralState:'developing',
      actionStateKey:'recalculate_plan',
      planStatusKey:'needs_adjustment',
      tradeabilityVerdict:'Watch',
      blockerReason:'Bounce is not clear enough to price yet.',
      reasonSummary:'Strong trend, but no clean pullback entry yet.',
      terminal:false,
      baseVerdict:'watch'
    })
  });
  const dinoResolved = strongExtendedUnpriceable.debug && strongExtendedUnpriceable.debug.resolvedState || {};
  if(strongExtendedUnpriceable.canonicalVerdict !== 'watch'){
    throw new Error('Strong extended unpriceable setup must remain canonical Watch.');
  }
  if(strongExtendedUnpriceable.entryGatePass !== false || strongExtendedUnpriceable.nearEntryGatePass !== false){
    throw new Error('Strong extended unpriceable setup must not pass Entry/Near Entry gates.');
  }
  if(dinoResolved.rejected_by_viability_gate === true || dinoResolved.lifecycle === 'drop'){
    throw new Error('Strong extended unpriceable setup must not become terminal Avoid/Dead.');
  }
  if(/weakening|broken/i.test(String(strongExtendedUnpriceable.mainBlocker || dinoResolved.reason || ''))){
    throw new Error('Strong extended unpriceable setup reason must reference priceability/location, not weakening/broken structure.');
  }
}

runSimplifiedPipelineAssertions();

console.log(`Resolver gate assertions passed (${results.length} cases).`);
console.log('Review projection invariant assertions passed.');
console.log('Simplified state pipeline assertions passed.');
