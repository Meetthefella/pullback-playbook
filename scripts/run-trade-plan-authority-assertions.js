const fs = require('fs');
const path = require('path');
const vm = require('vm');

const appPath = path.resolve(__dirname, '..', 'app.js');
const source = fs.readFileSync(appPath, 'utf8');
const recordsPath = path.resolve(__dirname, '..', 'js', 'records.js');
const recordsSource = fs.readFileSync(recordsPath, 'utf8');

function extractFunction(name){
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  if(start === -1) throw new Error(`Missing ${name}`);
  let signatureClosedAt = -1;
  let parenDepth = 0;
  for(let i = start + marker.length - 1; i < source.length; i += 1){
    const ch = source[i];
    if(ch === '(') parenDepth += 1;
    if(ch === ')'){
      parenDepth -= 1;
      if(parenDepth === 0){
        signatureClosedAt = i;
        break;
      }
    }
  }
  const bodyStart = source.indexOf('{', signatureClosedAt);
  let depth = 1;
  let inString = false;
  let quote = '';
  let inLineComment = false;
  let inBlockComment = false;
  let prev = '';
  for(let i = bodyStart + 1; i < source.length; i += 1){
    const ch = source[i];
    const next = source[i + 1];
    if(inLineComment){
      if(ch === '\n') inLineComment = false;
      prev = ch;
      continue;
    }
    if(inBlockComment){
      if(prev === '*' && ch === '/') inBlockComment = false;
      prev = ch;
      continue;
    }
    if(inString){
      if(ch === quote && prev !== '\\') inString = false;
      prev = ch;
      continue;
    }
    if(ch === '/' && next === '/'){
      inLineComment = true;
      prev = ch;
      continue;
    }
    if(ch === '/' && next === '*'){
      inBlockComment = true;
      prev = ch;
      continue;
    }
    if(ch === '"' || ch === '\'' || ch === '`'){
      inString = true;
      quote = ch;
      prev = ch;
      continue;
    }
    if(ch === '{') depth += 1;
    if(ch === '}'){
      depth -= 1;
      if(depth === 0) return source.slice(start, i + 1);
    }
    prev = ch;
  }
  throw new Error(`Unclosed ${name}`);
}

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const sandbox = {
  console,
  normalizeGlobalVerdictKey(value){
    const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
    if(['entry', 'near_entry', 'watch', 'avoid'].includes(safe)) return safe;
    return 'watch';
  },
  numericOrNull(value){
    if(value === null || value === undefined || String(value).trim() === '') return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  },
  currentRrThreshold(){
    return 2;
  },
  isAccepted50MaSupportTestDisplayState(){
    return false;
  },
  review50MaSupportTestPresentationCopy(){
    return {
      tradeStatus:'Setup not ready yet.',
      draftTradeStatus:'Draft plan possible, but not actionable yet.',
      blocker:'Waiting for confirmation.',
      monitoringReason:'Waiting for confirmation.',
      nextAction:'Wait.'
    };
  },
  buildSharedSetupNarrative(){
    return {stateLabel:'Watch', primaryReason:'', blocker:'', nextAction:'', evidence:[], cautions:[], promotionRequirements:[]};
  },
  sameVisibleCopy(a, b){
    return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  },
  resolverSeedVerdictForRecord(){
    return 'Watch';
  },
  cloneData(value){
    return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
  },
  normalizeCard(value){
    return value || {};
  },
  scannerEstimateForCard(){
    return {entry:101, stop:99, target:106};
  }
};

vm.createContext(sandbox);
vm.runInContext(extractFunction('planValuesEqual'), sandbox, {filename:appPath});
vm.runInContext(extractFunction('resolvePlanSource'), sandbox, {filename:appPath});
vm.runInContext(extractFunction('canonicalTradePlanAuthorityVersion'), sandbox, {filename:appPath});
vm.runInContext(extractFunction('hasCanonicalTradePlanStamp'), sandbox, {filename:appPath});
vm.runInContext(extractFunction('stampCanonicalTradePlan'), sandbox, {filename:appPath});
vm.runInContext(extractFunction('fallbackPlanProposalForCard'), sandbox, {filename:appPath});
vm.runInContext(extractFunction('tradePlanCandidateSnapshot'), sandbox, {filename:appPath});
vm.runInContext(extractFunction('collectTradePlanAuthorityCandidates'), sandbox, {filename:appPath});
vm.runInContext(extractFunction('effectivePlanForRecord'), sandbox, {filename:appPath});
vm.runInContext(extractFunction('recordPlanHasConcreteValues'), sandbox, {filename:appPath});
vm.runInContext(extractFunction('applyPlanCandidateToRecord'), sandbox, {filename:appPath});
vm.runInContext(extractFunction('ensureCanonicalPlanForRecord'), sandbox, {filename:appPath});
vm.runInContext(extractFunction('resolveCanonicalTradePlanAuthority'), sandbox, {filename:appPath});
vm.runInContext(extractFunction('isResolverBlockedEstimatedPlanAuthority'), sandbox, {filename:appPath});
vm.runInContext(extractFunction('buildReviewSemanticStatus'), sandbox, {filename:appPath});

sandbox.evaluateRewardRisk = function(entry, stop, firstTarget){
  const riskPerShare = sandbox.numericOrNull(entry) - sandbox.numericOrNull(stop);
  const rewardPerShare = sandbox.numericOrNull(firstTarget) - sandbox.numericOrNull(entry);
  const valid = Number.isFinite(riskPerShare) && riskPerShare > 0 && Number.isFinite(rewardPerShare) && rewardPerShare > 0;
  return {
    valid,
    riskPerShare:valid ? riskPerShare : null,
    rewardPerShare:valid ? rewardPerShare : null,
    rrRatio:valid ? rewardPerShare / riskPerShare : null
  };
};
sandbox.evaluateRiskFit = function(){
  return {position_size:4, max_loss:40, risk_status:'fits_risk'};
};
sandbox.currentRiskSettings = function(){
  return {account_size:4000, max_loss:40};
};
sandbox.normalizeQuoteCurrency = function(value){
  return String(value || '').trim().toUpperCase();
};
sandbox.evaluateCapitalFit = function({entry, position_size, quote_currency} = {}){
  return {
    capital_fit:'acceptable',
    capital_note:'Capital check: ok',
    position_cost:Number(entry) * Number(position_size),
    position_cost_gbp:Number(entry) * Number(position_size),
    quote_currency:String(quote_currency || 'USD')
  };
};
sandbox.currentAccountSizeGbp = function(){
  return 4000;
};
sandbox.normalizeExitMode = function(value){
  return value || 'fixed_target';
};
sandbox.currentMaxLoss = function(){
  return 40;
};
sandbox.deriveTradeability = function(){
  return 'tradable';
};
sandbox.deriveAffordability = function(){
  return 'affordable';
};
sandbox.deriveExecutionPlanState = function(){
  return {
    targetReviewState:'not_near_target',
    targetActionRecommendation:'',
    targetAlertLevel:null
  };
};
sandbox.applyLifecycleStageFromPlan = function(){};
sandbox.applyGlobalVerdictGates = function(record){
  return {
    record,
    changed:false,
    globalVerdict:{allow_plan:true}
  };
};

function makeDisplayedPlan(overrides = {}){
  return {
    status:'valid',
    entry:114.38,
    stop:102.66,
    target:152.47,
    rewardRisk:{valid:true, rrRatio:3.25},
    riskFit:{risk_status:'fits_risk', risk_per_share:11.72, max_loss:40, position_size:3},
    capitalFit:{capital_fit:'acceptable', capital_note:'Capital check: ok', quote_currency:'USD'},
    tradeability:'tradable',
    affordability:'affordable',
    ...overrides
  };
}

function makeContext(overrides = {}){
  return {
    record:{ticker:'TROW', marketData:{currency:'USD'}},
    simplifiedState:{
      canonicalVerdict:'entry',
      structureState:'strong',
      structureEligibility:'alive',
      setupLocationState:'near_20ma',
      priceabilityState:'priceable',
      bounceState:'confirmed',
      planStatus:'valid',
      entryGatePass:true,
      nearEntryGatePass:true,
      mainBlocker:''
    },
    globalVerdict:{final_verdict:'entry', entry_gate_pass:true, near_entry_gate_pass:true},
    derivedStates:{stabilisationState:'clear'},
    displayedPlan:makeDisplayedPlan(),
    planRealism:{raw_rr:3.25},
    ...overrides
  };
}

{
  const authority = sandbox.resolveCanonicalTradePlanAuthority(makeContext({context:'test'}));
  assert(authority.actionable === true, 'Affordable entry plan should be actionable.');
  assert(authority.reasonCode === 'ok', 'Affordable entry plan should resolve with ok reason.');
}

{
  const context = makeContext({
    displayedPlan:makeDisplayedPlan({
      capitalFit:{capital_fit:'too_expensive', capital_note:'Capital check: FX converted', quote_currency:'USD'},
      tradeability:'too_expensive',
      affordability:'not_affordable'
    })
  });
  const authority = sandbox.resolveCanonicalTradePlanAuthority({...context, context:'test'});
  const semantic = sandbox.buildReviewSemanticStatus(context);
  assert(authority.actionable === false, 'Unaffordable entry plan must not remain actionable.');
  assert(authority.reasonCode === 'capital_not_affordable', 'Unaffordable entry plan must fail on capital authority.');
  assert(!/entry ready/i.test(String(semantic.tradeStatus.line1 || '')), 'Review copy must stop showing Entry Ready for unaffordable plans.');
}

{
  const context = makeContext({
    simplifiedState:{...makeContext().simplifiedState, canonicalVerdict:'watch', entryGatePass:false},
    globalVerdict:{final_verdict:'watch', entry_gate_pass:false, near_entry_gate_pass:false}
  });
  const authority = sandbox.resolveCanonicalTradePlanAuthority({...context, context:'test'});
  assert(authority.actionable === false, 'Watch verdict must not create actionable authority from plan maths alone.');
}

{
  const context = makeContext({
    record:{ticker:'TROW', marketData:{currency:'USD'}, plan:{source:'scanner_estimate'}},
    simplifiedState:{
      ...makeContext().simplifiedState,
      canonicalVerdict:'watch',
      setupLocationState:'off_level',
      bounceState:'attempt',
      entryGatePass:false,
      nearEntryGatePass:false,
      mainBlocker:'Trend is strong but extended beyond a safe entry zone. No low-risk entry is available yet.'
    },
    globalVerdict:{
      final_verdict:'watch',
      entry_gate_pass:false,
      near_entry_gate_pass:false,
      main_blocker:'Trend is strong but extended beyond a safe entry zone. No low-risk entry is available yet.'
    },
    displayedPlan:makeDisplayedPlan({
      source:'scanner_estimate',
      planSourceUsedForRisk:'scanner_estimate'
    })
  });
  const authority = sandbox.resolveCanonicalTradePlanAuthority({...context, context:'test'});
  const semantic = sandbox.buildReviewSemanticStatus(context);
  assert(sandbox.isResolverBlockedEstimatedPlanAuthority(authority) === true, 'Resolver-blocked scanner estimate must be identified explicitly.');
  assert(authority.actionable === false, 'Resolver-blocked scanner estimate must not be actionable.');
  assert(/Estimated plan maths are valid, but setup is not actionable\./i.test(String(semantic.tradeStatus.line1 || '')), 'Review copy must label resolver-blocked scanner maths as estimated and non-actionable.');
}

{
  const context = makeContext({
    displayedPlan:makeDisplayedPlan({
      tradeability:'tradable',
      capitalFit:{capital_fit:'acceptable', capital_note:'Capital check: ok', quote_currency:'GBX'}
    })
  });
  const authority = sandbox.resolveCanonicalTradePlanAuthority({...context, context:'test'});
  assert(authority.gbpVsGbxMode === 'gbx', 'GBX handling must stay on the canonical authority object.');
}

{
  const record = {
    ticker:'SHOP',
    plan:{},
    review:{
      manualReview:{entry:100, stop:97, target:108},
      draft:{entry:99, stop:95, target:107}
    },
    scan:{score:8, summary:'scanner'},
    marketData:{currency:'USD'}
  };
  const effectivePlan = sandbox.effectivePlanForRecord(record, {allowScannerFallback:true});
  const candidates = sandbox.collectTradePlanAuthorityCandidates(record);
  assert(effectivePlan.source === 'not_generated', 'Effective plan must not read manual, draft, or fallback candidates when canonical plan is absent.');
  assert(candidates.canonical.present === false, 'Canonical candidate should be absent in this fixture.');
  assert(candidates.rejected.some(candidate => candidate.label === 'manual_review' && candidate.complete === true), 'Manual review candidate should be traced as rejected.');
  assert(candidates.rejected.some(candidate => candidate.label === 'scanner_estimate' && candidate.complete === true), 'Scanner estimate candidate should be traced as rejected.');
}

{
  const record = {
    ticker:'AAPL',
    marketData:{currency:'USD'},
    plan:{
      targetAlert:{},
      exitMode:'fixed_target'
    },
    lifecycle:{},
    review:{}
  };
  sandbox.applyPlanCandidateToRecord(record, {
    entry:100,
    stop:95,
    firstTarget:115
  }, {
    source:'review',
    reason:'review_commit',
    writtenBy:'unit_test',
    updatedAt:'2026-06-30T10:00:00.000Z'
  });
  assert(record.plan.entry === 100, 'Canonical writer must store plan entry.');
  assert(record.plan.authoritySource === 'applyPlanCandidateToRecord', 'Canonical writer must stamp authoritySource.');
  assert(record.plan.authorityVersion === 'trade_plan_v1', 'Canonical writer must stamp authorityVersion.');
  assert(record.plan.authorityReason === 'review_commit', 'Canonical writer must stamp authorityReason.');
  assert(record.plan.writtenBy === 'unit_test', 'Canonical writer must stamp writtenBy.');
  assert(record.plan.writtenAt === '2026-06-30T10:00:00.000Z', 'Canonical writer must stamp writtenAt.');
  assert(record.plan.candidateSource === 'review', 'Canonical writer must stamp candidateSource.');
  assert(sandbox.hasCanonicalTradePlanStamp(record.plan) === true, 'Stamped canonical plan must validate.');
}

{
  const unstampedPersistedRecord = {
    ticker:'TSCO',
    plan:{
      entry:250,
      stop:240,
      firstTarget:280,
      source:'manual',
      status:'valid',
      tradeability:'tradable',
      capitalFit:'acceptable',
      positionSize:4
    },
    marketData:{currency:'USD'}
  };
  const effectivePlan = sandbox.effectivePlanForRecord(unstampedPersistedRecord);
  assert(effectivePlan.source === 'not_generated', 'Review must refuse unstamped persisted plan objects.');
}

{
  const unstampedConcreteRecord = {
    ticker:'MIGR',
    marketData:{currency:'USD'},
    plan:{
      entry:250,
      stop:240,
      firstTarget:280,
      source:'manual_review',
      status:'valid',
      targetAlert:{},
      exitMode:'fixed_target'
    },
    lifecycle:{},
    review:{}
  };
  const changed = sandbox.ensureCanonicalPlanForRecord(unstampedConcreteRecord, {source:'review'});
  assert(changed === true, 'Explicit canonical migration path must promote unstamped concrete plans.');
  assert(unstampedConcreteRecord.plan.authoritySource === 'applyPlanCandidateToRecord', 'Explicit canonical migration must stamp authoritySource.');
  assert(unstampedConcreteRecord.plan.authorityReason === 'promote_concrete_unstamped_plan', 'Explicit canonical migration must preserve promote_concrete_unstamped_plan reason.');
  assert(unstampedConcreteRecord.plan.writtenBy === 'ensureCanonicalPlanForRecord', 'Explicit canonical migration must stamp ensureCanonicalPlanForRecord as writer.');
  assert(sandbox.hasCanonicalTradePlanStamp(unstampedConcreteRecord.plan) === true, 'Explicit canonical migration must produce a valid canonical plan stamp.');
}

{
  const canonicalEntryWrites = (source.match(/record\.plan\.entry\s*=/g) || []).length;
  const canonicalStopWrites = (source.match(/record\.plan\.stop\s*=/g) || []).length;
  const canonicalTargetWrites = (source.match(/record\.plan\.firstTarget\s*=/g) || []).length;
  const canonicalPositionSizeWrites = (source.match(/record\.plan\.positionSize\s*=/g) || []).length;
  const canonicalCapitalFitWrites = (source.match(/record\.plan\.capitalFit\s*=/g) || []).length;
  assert(canonicalEntryWrites === 1, `Expected exactly one record.plan.entry writer, found ${canonicalEntryWrites}.`);
  assert(canonicalStopWrites === 1, `Expected exactly one record.plan.stop writer, found ${canonicalStopWrites}.`);
  assert(canonicalTargetWrites === 1, `Expected exactly one record.plan.firstTarget writer, found ${canonicalTargetWrites}.`);
  assert(canonicalPositionSizeWrites === 1, `Expected exactly one record.plan.positionSize writer, found ${canonicalPositionSizeWrites}.`);
  assert(canonicalCapitalFitWrites === 1, `Expected exactly one record.plan.capitalFit writer, found ${canonicalCapitalFitWrites}.`);
  assert(!/function syncStoredScannerEstimateMath/.test(source), 'Scanner-estimate refresh must not directly mutate canonical plan maths fields.');
  assert(/applyPlanCandidateToRecord\(item, \{[\s\S]*source:'scanner_estimate'[\s\S]*reason:'scanner_estimate_reference_refresh'/.test(source), 'Scanner-estimate refresh must route through applyPlanCandidateToRecord with an explicit non-review refresh reason.');
}

{
  assert(/legacy_unstamped_plan_downgraded/.test(recordsSource), 'Persisted unstamped plan migration marker must exist.');
  assert(/rejected_unstamped_plan/.test(recordsSource), 'Normalizer must downgrade unstamped persisted plans.');
}

console.log('Trade-plan authority assertions passed.');
