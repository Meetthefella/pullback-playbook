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
  if(!/entryConditionsHoldBound/.test(appSource) || !/bindEntryConditionsHoldInteractions\(div\)/.test(appSource)){
    throw new Error('Watchlist long-press helper binding diagnostics must be wired to the active card renderer.');
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
  function depsFor(derivedStates, finalContract, setupScore = 8){
    return {
      riskSettings:{account_size:4000, risk_percent:1, max_loss_override:40, whole_shares_only:true},
      analysisDerivedStatesFromRecord:() => derivedStates,
      resolvePreLifecycleStateContract:() => finalContract,
      resolveFinalStateContract:() => finalContract,
      setupScoreForRecord:() => setupScore,
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
