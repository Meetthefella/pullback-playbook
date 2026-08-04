(function(global){
  'use strict';

  function text(value){ return String(value == null ? '' : value).trim(); }
  function key(value){ return text(value).toLowerCase().replace(/[\s-]+/g, '_'); }
  function number(value){
    if(value === null || value === undefined || text(value) === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  function valueIs(value, values){ return values.includes(key(value)); }
  function stateSource(record){
    const item = record && typeof record === 'object' ? record : {};
    const scan = item.scan && typeof item.scan === 'object' ? item.scan : {};
    const projection = scan.analysisProjection && typeof scan.analysisProjection === 'object' ? scan.analysisProjection : {};
    return {...(item.derivedStates && typeof item.derivedStates === 'object' ? item.derivedStates : {}), ...projection};
  }
  function field(states, camel, snake){ return states[camel] ?? states[snake]; }
  function observedBoolean(value, accepted){ return text(value) ? valueIs(value, accepted) : undefined; }

  // This is intentionally a one-way reader. No value from UI presentation,
  // saved verdicts, lifecycle history, or legacy plan blockers enters v2.
  function fromRecord(record, options = {}){
    const item = record && typeof record === 'object' ? record : {};
    const market = item.marketData && typeof item.marketData === 'object' ? item.marketData : {};
    const plan = item.plan && typeof item.plan === 'object' ? item.plan : {};
    const states = stateSource(item);
    const stabilisation = field(states, 'stabilisationState', 'stabilisation_state');
    const bounce = field(states, 'bounceState', 'bounce_state');
    const buyer = field(states, 'buyerControlState', 'buyer_control_state');
    const confirmation = field(states, 'confirmationState', 'confirmation_state') ?? field(states, 'followThroughState', 'follow_through_state');
    return {
      ticker:text(item.ticker || item.symbol).toUpperCase(),
      snapshotId:text(options.snapshotId || market.snapshotId),
      createdAt:text(options.createdAt),
      market:{
        asOf:text(market.asOf || market.timestamp), price:number(market.price ?? market.currentPrice ?? market.close),
        sma20:number(market.sma20 ?? market.ma20), sma50:number(market.sma50 ?? market.ma50), sma200:number(market.sma200 ?? market.ma200),
        volume:number(market.volume), averageVolume:number(market.averageVolume ?? market.avgVolume ?? market.avgVolume30d),
        marketStatus:text(options.marketStatus || item.meta && item.meta.marketStatus), currency:text(market.currency)
      },
      setup:{
        stabilising:observedBoolean(stabilisation, ['clear', 'stable', 'confirmed']),
        bounce:observedBoolean(bounce, ['confirmed', 'strong']),
        buyerControl:observedBoolean(buyer, ['confirmed', 'controlled', 'strong']),
        // Follow-through is deliberately not inferred from a bounce. It must
        // arrive as explicit structured evidence before v2 can publish Entry.
        confirmation:observedBoolean(confirmation, ['confirmed', 'true', 'follow_through'])
      },
      plan:{entry:number(plan.entry), stop:number(plan.stop), firstTarget:number(plan.firstTarget ?? plan.target)},
      risk:options.risk && typeof options.risk === 'object' ? options.risk : {},
      playbookVersion:text(options.playbookVersion || 'quality-pullback-v1')
    };
  }

  function legacyState(publication){
    const source = publication && typeof publication === 'object' ? publication : {};
    return key(source.canonicalResult && source.canonicalResult.verdict && source.canonicalResult.verdict.value || source.final_verdict || source.canonical_final_verdict || source.verdict);
  }
  function compare(legacyPublication, v2Assessment){
    const legacy = legacyState(legacyPublication);
    const v2 = key(v2Assessment && v2Assessment.setupState);
    const differences = [];
    if(legacy && legacy !== v2) differences.push({field:'setupState', legacy, v2});
    const legacyRiskVersion = text(legacyPublication && legacyPublication.riskSettingsVersion);
    const v2RiskVersion = text(v2Assessment && v2Assessment.riskSettingsVersion);
    if(legacyRiskVersion && legacyRiskVersion !== v2RiskVersion) differences.push({field:'riskSettingsVersion', legacy:legacyRiskVersion, v2:v2RiskVersion});
    return Object.freeze({schemaVersion:'backend-v2-shadow-report-v1', assessmentId:text(v2Assessment && v2Assessment.assessmentId), snapshotId:text(v2Assessment && v2Assessment.snapshotId), legacyState:legacy, v2State:v2, matches:differences.length === 0 && Boolean(legacy), differences:Object.freeze(differences)});
  }
  function publishForRecord(record, options = {}){
    if(!global.BackendV2 || typeof global.BackendV2.publish !== 'function') throw new Error('BackendV2 must load before BackendV2LegacyAdapter.');
    return global.BackendV2.publish(fromRecord(record, options));
  }

  global.BackendV2LegacyAdapter = Object.freeze({fromRecord, publishForRecord, compare});
})(typeof window !== 'undefined' ? window : globalThis);
