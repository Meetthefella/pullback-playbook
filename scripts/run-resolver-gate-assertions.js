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
    actionGuidance:'Avoid - too weak or broken'
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
    actionGuidance:'Avoid - too weak or broken'
  });
  const terminalVisual = terminalAvoid.bundle.visualState || {};
  const terminalGlobal = terminalAvoid.bundle.globalVerdict || {};
  if(terminalGlobal.final_verdict !== 'avoid' || terminalVisual.visualBucket !== 'avoid'){
    throw new Error('Terminal avoid projection must remain avoid.');
  }
}

runReviewProjectionAssertions();

console.log(`Resolver gate assertions passed (${results.length} cases).`);
console.log('Review projection invariant assertions passed.');
