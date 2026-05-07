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
runBrowserModule('js/resolver-core.js');

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
  const bodyStart = source.indexOf('{', start);
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
    verdictPresentationLabelForKey(value){
      return String(value || '').trim();
    }
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
}

runReviewProjectionAssertions();

console.log(`Resolver gate assertions passed (${results.length} cases).`);
console.log('Review projection invariant assertions passed.');
