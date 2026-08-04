(function(global){
  'use strict';

  // Backend v2 is deliberately self-contained. It accepts only an explicit
  // assessment request and never reads UI, persisted presentation, or legacy
  // resolver state. The UI can consume its publication through an adapter.
  const VERSION = 'backend-v2.0';
  const STATES = Object.freeze(['avoid', 'watch', 'near_entry', 'entry']);

  function number(value){
    if(value === null || value === undefined || String(value).trim() === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  function text(value){ return String(value == null ? '' : value).trim(); }
  function key(value){ return text(value).toLowerCase().replace(/[\s-]+/g, '_'); }
  // The live app uses human-readable market-status labels (for example
  // "S&P below 50 MA"). Keep the v2 snapshot vocabulary narrow, but map those
  // labels before a gate is evaluated.
  function marketStatusKey(value){
    const normalized = key(value).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if(['below_50ma', 'below_50_ma', 'sp_below_50_ma', 's_p_below_50_ma', 'weak', 'hostile'].includes(normalized)) return 'below_50ma';
    return normalized;
  }
  function clone(value){
    if(value == null || typeof value !== 'object') return value;
    if(Array.isArray(value)) return value.map(clone);
    return Object.keys(value).reduce((result, name) => { result[name] = clone(value[name]); return result; }, {});
  }
  function freeze(value){
    if(!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(name => freeze(value[name]));
    return Object.freeze(value);
  }
  function stable(value){
    if(value == null || typeof value !== 'object') return JSON.stringify(value);
    if(Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
    return `{${Object.keys(value).sort().map(name => `${JSON.stringify(name)}:${stable(value[name])}`).join(',')}}`;
  }
  function hash(value){
    let valueHash = 2166136261;
    const source = stable(value);
    for(let index = 0; index < source.length; index += 1){ valueHash ^= source.charCodeAt(index); valueHash = Math.imul(valueHash, 16777619); }
    return `v2-${(valueHash >>> 0).toString(36)}`;
  }
  function fact(value, source, available = value !== null && value !== undefined){
    return freeze({value:available ? value : null, available:Boolean(available), source:text(source) || 'unavailable', evidence:[]});
  }
  function bool(value){ return value === true ? true : (value === false ? false : null); }

  function createSnapshot(input = {}){
    const market = input.market && typeof input.market === 'object' ? input.market : {};
    const ticker = text(input.ticker || market.ticker).toUpperCase();
    const raw = {
      ticker,
      asOf:text(market.asOf || market.timestamp),
      price:number(market.price ?? market.close),
      sma20:number(market.sma20 ?? market.ma20),
      sma50:number(market.sma50 ?? market.ma50),
      sma200:number(market.sma200 ?? market.ma200),
      volume:number(market.volume),
      averageVolume:number(market.averageVolume ?? market.avgVolume30d ?? market.avgVolume30),
      marketStatus:marketStatusKey(market.marketStatus || input.marketStatus),
      currency:text(market.currency || 'USD').toUpperCase()
    };
    const id = text(input.snapshotId) || hash(raw);
    return freeze({id, schemaVersion:'market-snapshot-v2', ...raw});
  }

  function buildFeatures(snapshot, input = {}){
    const setup = input.setup && typeof input.setup === 'object' ? input.setup : {};
    const plan = input.plan && typeof input.plan === 'object' ? input.plan : {};
    const price = snapshot.price;
    const distance = average => price !== null && average !== null && average !== 0 ? ((price - average) / average) * 100 : null;
    const entry = number(plan.entry), stop = number(plan.stop), target = number(plan.target ?? plan.firstTarget);
    const validPlan = entry !== null && stop !== null && target !== null && entry > stop && target > entry;
    const riskPerShare = validPlan ? entry - stop : null;
    const rewardRisk = validPlan ? (target - entry) / riskPerShare : null;
    const above20 = price !== null && snapshot.sma20 !== null ? price >= snapshot.sma20 : null;
    const above50 = price !== null && snapshot.sma50 !== null ? price >= snapshot.sma50 : null;
    const above200 = price !== null && snapshot.sma200 !== null ? price >= snapshot.sma200 : null;
    const trendHealthy = above50 !== null && above200 !== null ? above50 && above200 : null;
    const volumeRatio = snapshot.volume !== null && snapshot.averageVolume !== null && snapshot.averageVolume > 0 ? snapshot.volume / snapshot.averageVolume : null;
    const near20 = distance(snapshot.sma20) !== null ? Math.abs(distance(snapshot.sma20)) <= 3 : null;
    const near50 = distance(snapshot.sma50) !== null ? Math.abs(distance(snapshot.sma50)) <= 3 : null;
    return freeze({
      distanceFrom20:fact(distance(snapshot.sma20), 'market-snapshot'), distanceFrom50:fact(distance(snapshot.sma50), 'market-snapshot'),
      trendHealthy:fact(trendHealthy, 'market-snapshot'), near20:fact(near20, 'market-snapshot'), near50:fact(near50, 'market-snapshot'),
      stabilising:fact(bool(setup.stabilising), 'setup-evidence', setup.stabilising !== undefined),
      bounce:fact(bool(setup.bounce), 'setup-evidence', setup.bounce !== undefined),
      buyerControl:fact(bool(setup.buyerControl), 'setup-evidence', setup.buyerControl !== undefined),
      confirmation:fact(bool(setup.confirmation), 'setup-evidence', setup.confirmation !== undefined),
      volumeRatio:fact(volumeRatio, 'market-snapshot'),
      marketSupportive:fact(snapshot.marketStatus ? !['below_50ma', 'weak', 'hostile'].includes(snapshot.marketStatus) : null, 'market-snapshot', Boolean(snapshot.marketStatus)),
      validPlan:fact(validPlan, 'trade-plan', entry !== null && stop !== null && target !== null), rewardRisk:fact(rewardRisk, 'trade-plan', validPlan),
      levels:freeze({entry:fact(entry, 'trade-plan'), stop:fact(stop, 'trade-plan'), target:fact(target, 'trade-plan'), riskPerShare:fact(riskPerShare, 'trade-plan', validPlan)})
    });
  }

  function assess(snapshot, features, input = {}){
    const fail = (code, message) => ({code, passed:false, message});
    const pass = (code, message) => ({code, passed:true, message});
    const gates = [];
    if(!snapshot.ticker || !snapshot.asOf || snapshot.price === null) gates.push(fail('data_sufficiency', 'A ticker, timestamp, and current price are required.'));
    else gates.push(pass('data_sufficiency', 'Required market data is present.'));
    if(features.trendHealthy.value === true) gates.push(pass('trend_health', 'Price is above the 50 and 200 moving averages.'));
    else gates.push(fail('trend_health', features.trendHealthy.available ? 'Trend is not healthy.' : 'Trend evidence is unavailable.'));
    const supportRelevant = features.near20.value === true || features.near50.value === true;
    if(supportRelevant) gates.push(pass('support_relevance', 'Price is near a tracked moving average.'));
    else gates.push(fail('support_relevance', (features.near20.available || features.near50.available) ? 'Price is not near the 20 or 50 moving average.' : 'Support evidence is unavailable.'));
    if(features.buyerControl.value === true) gates.push(pass('buyer_control', 'Buyer control is confirmed.'));
    else gates.push(fail('buyer_control', features.buyerControl.available ? 'Buyer control is not confirmed.' : 'Buyer-control evidence is unavailable.'));
    if(features.confirmation.value === true) gates.push(pass('confirmation', 'Follow-through is confirmed.'));
    else gates.push(fail('confirmation', features.confirmation.available ? 'Follow-through is not confirmed.' : 'Confirmation evidence is unavailable.'));
    const rr = features.rewardRisk.value;
    if(features.validPlan.value === true && rr >= 2) gates.push(pass('plan_viability', 'The plan has at least 2R reward-to-risk.'));
    else gates.push(fail('plan_viability', features.validPlan.available ? 'A valid plan with at least 2R is required.' : 'Trade-plan evidence is unavailable.'));
    if(features.marketSupportive.value !== false) gates.push(pass('market_context', 'Market context does not block the setup.'));
    else gates.push(fail('market_context', 'Market context is not supportive.'));

    const gate = code => gates.find(item => item.code === code);
    const baseReady = ['data_sufficiency','trend_health','support_relevance','market_context'].every(code => gate(code).passed);
    const nearEligible = baseReady && features.stabilising.value === true && features.validPlan.value === true && rr >= 1.5;
    const entryEligible = nearEligible && gate('buyer_control').passed && gate('confirmation').passed && gate('plan_viability').passed;
    const verdict = entryEligible ? 'entry' : (nearEligible ? 'near_entry' : (gate('data_sufficiency').passed && gate('trend_health').passed ? 'watch' : 'avoid'));
    const phase = !gate('data_sufficiency').passed ? 'insufficient_data' : (!gate('trend_health').passed ? 'failed_support' : (features.confirmation.value === true ? 'confirmed_follow_through' : (features.bounce.value === true ? 'responding_from_support' : (supportRelevant ? 'testing_support' : 'approaching_support'))));
    const reasons = gates.filter(item => !item.passed).map(item => item.code);
    return freeze({setupState:verdict, setupPhase:phase, gates:freeze(gates.map(freeze)), eligibility:freeze({nearEntry:nearEligible, entry:entryEligible, paperTrade:entryEligible}), reasons:freeze(reasons)});
  }

  function applyRisk(assessment, features, risk = {}){
    // Risk settings versions are opaque identities, not numeric counters. The
    // current application uses values such as "execution-risk-settings-v1".
    const version = text(risk.version) || null;
    const maxLossGbp = number(risk.maxLossGbp ?? risk.maxRiskGbp);
    const rps = features.levels.riskPerShare.value;
    const positionSize = maxLossGbp !== null && rps !== null && rps > 0 ? Math.floor(maxLossGbp / rps) : null;
    const executable = assessment.eligibility.paperTrade && version !== null && maxLossGbp !== null && positionSize !== null && positionSize >= 1;
    return freeze({riskSettingsVersion:version, maxLossGbp, riskPerShare:rps, positionSize, executable, reason:executable ? '' : 'Paper Trade requires an Entry assessment and current versioned risk settings.'});
  }

  function publish(input = {}){
    const snapshot = createSnapshot(input);
    const features = buildFeatures(snapshot, input);
    const decision = assess(snapshot, features, input);
    const risk = applyRisk(decision, features, input.risk);
    const canonical = {schemaVersion:'canonical-assessment-v2', assessmentId:'', ticker:snapshot.ticker, snapshotId:snapshot.id, playbookVersion:text(input.playbookVersion || 'quality-pullback-v1'), rulesVersion:VERSION, riskSettingsVersion:risk.riskSettingsVersion, setupState:decision.setupState, setupPhase:decision.setupPhase, eligibility:{...decision.eligibility, paperTrade:risk.executable}, features, gates:decision.gates, plan:freeze({entry:features.levels.entry.value, stop:features.levels.stop.value, firstTarget:features.levels.target.value, rewardRisk:features.rewardRisk.value, positionSize:risk.positionSize}), risk, reasons:decision.reasons, createdAt:text(input.createdAt || new Date().toISOString())};
    canonical.assessmentId = hash({...canonical, assessmentId:undefined, createdAt:undefined});
    return freeze(canonical);
  }

  function present(assessment){
    const value = assessment && typeof assessment === 'object' ? assessment : {};
    const state = STATES.includes(value.setupState) ? value.setupState : 'avoid';
    return freeze({assessmentId:text(value.assessmentId), verdict:state === 'near_entry' ? 'Near Entry' : `${state.charAt(0).toUpperCase()}${state.slice(1)}`, setupState:state, setupPhase:text(value.setupPhase), summary:value.reasons && value.reasons.length ? `Waiting on: ${value.reasons.join(', ')}.` : 'All required Quality Pullback gates passed.', mayPaperTrade:value.eligibility && value.eligibility.paperTrade === true});
  }

  global.BackendV2 = freeze({VERSION, createSnapshot, buildFeatures, assess, applyRisk, publish, present});
})(typeof window !== 'undefined' ? window : globalThis);
