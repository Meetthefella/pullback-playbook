function numericOrNull(value){
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function hasAuthoritativeLifecyclePlan(record){
  const item = record && typeof record === 'object' ? record : {};
  const plan = item.plan && typeof item.plan === 'object' ? item.plan : {};
  const source = String(plan.source || '').trim().toLowerCase();
  return plan.hasValidPlan === true
    && String(plan.status || '').trim().toLowerCase() === 'valid'
    && Number.isFinite(numericOrNull(plan.entry))
    && Number.isFinite(numericOrNull(plan.stop))
    && Number.isFinite(numericOrNull(plan.firstTarget))
    && Number.isFinite(numericOrNull(plan.plannedRR))
    && source !== 'scanner_estimate';
}

function applyLifecycleStageFromPlan(record, source = 'plan'){
  if(!record) return '';
  if(hasAuthoritativeLifecyclePlan(record)){
    record._appliedStage = 'planned';
    record._appliedSource = source;
    return 'planned';
  }
  if(record.review && record.review.manualReview){
    record._appliedStage = 'reviewed';
    record._appliedSource = 'review';
    return 'reviewed';
  }
  record._appliedStage = '';
  record._appliedSource = '';
  return '';
}

function assert(condition, message){
  if(!condition) throw new Error(message);
}

function makeRecord(overrides = {}){
  return {
    plan:{
      hasValidPlan:false,
      status:'missing',
      entry:null,
      stop:null,
      firstTarget:null,
      plannedRR:null,
      source:''
    },
    review:{
      manualReview:null
    },
    ...overrides,
    plan:{
      hasValidPlan:false,
      status:'missing',
      entry:null,
      stop:null,
      firstTarget:null,
      plannedRR:null,
      source:'',
      ...(overrides.plan || {})
    },
    review:{
      manualReview:null,
      ...(overrides.review || {})
    }
  };
}

function run(){
  const scannerEstimateOnly = makeRecord({
    plan:{
      hasValidPlan:true,
      status:'valid',
      entry:143.16,
      stop:138.85,
      firstTarget:143.82,
      plannedRR:0.15,
      source:'scanner_estimate'
    },
    review:{
      manualReview:{
        savedAt:'2026-06-24T11:00:00.000Z'
      }
    }
  });
  const scannerResult = applyLifecycleStageFromPlan(scannerEstimateOnly, 'scanner_estimate');
  assert(scannerResult !== 'planned', 'scanner_estimate-only plan must not create planned lifecycle stage.');
  assert(scannerEstimateOnly._appliedStage === 'reviewed', 'scanner_estimate-only plan with manual review should remain reviewed.');

  const reviewedAuthoritativePlan = makeRecord({
    plan:{
      hasValidPlan:true,
      status:'valid',
      entry:150,
      stop:145,
      firstTarget:162,
      plannedRR:2.4,
      source:'manual'
    },
    review:{
      manualReview:{
        savedAt:'2026-06-24T11:05:00.000Z'
      }
    }
  });
  const authoritativeResult = applyLifecycleStageFromPlan(reviewedAuthoritativePlan, 'review');
  assert(authoritativeResult === 'planned', 'authoritative valid reviewed plan must still create planned lifecycle stage.');

  console.log('Lifecycle hygiene assertions passed.');
}

run();
