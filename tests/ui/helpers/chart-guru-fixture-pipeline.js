const analyseSetupModule = require('../../../netlify/functions/analyse-setup.js');
const {
  loadBenchmarkCases,
  loadBenchmarkCaseByTicker,
  normalizeTicker
} = require('../../fixtures/chart-guru-benchmark-library.js');

const EVENT_LABELS = {
  early_rebound_from_20ma:'Early rebound from 20MA',
  constructive_pullback_near_20ma:'First pullback to 20MA',
  bounce_confirmation_pending:'Successful 20MA defence',
  failed_bounce:'Failed first bounce from 20MA',
  pullback_still_repairing:'Pullback drifting below 20MA',
  constructive_pullback_near_50ma:'First test of 50MA',
  off_level_wait_for_clearer_support:'Off level — wait for clearer support',
  structure_breaking_down:'Support breakdown',
  strong_upside_acceleration:'Trend acceleration',
  sharp_selloff:'Trend damage with sellers in control',
  extended_after_run:'Momentum fading after extension',
  bounce_attempt:'Rebound attempt without follow-through',
  long_lower_wick_support_test:'Structure repair in progress',
  long_upper_wick_rejection:'Distribution after extension',
  doji_indecision:'Consolidation after advance',
  trend_climbing:'Breakout continuation',
  trend_mixed:'Range-bound pause near highs'
};

function cloneJson(value){
  return JSON.parse(JSON.stringify(value));
}

function findNarrationFixtureByTicker(ticker){
  return loadBenchmarkCaseByTicker(ticker);
}

function inferSemanticEnvelope(primaryStory = {}, recentStory = {}){
  const storyKey = String(primaryStory.key || recentStory.key || '').trim().toLowerCase();
  if(storyKey === 'early_rebound_from_20ma'){
    return {
      supportSemantic:'support_present',
      buyerResponseSemantic:'response_present',
      confirmationSemantic:'follow_through_unconfirmed'
    };
  }
  if(['constructive_pullback_near_20ma', 'constructive_pullback_near_50ma'].includes(storyKey)){
    return {
      supportSemantic:'support_present',
      buyerResponseSemantic:'response_absent',
      confirmationSemantic:'follow_through_unknown'
    };
  }
  if(storyKey === 'failed_bounce'){
    return {
      supportSemantic:'support_failed',
      buyerResponseSemantic:'response_failed',
      confirmationSemantic:'follow_through_failed'
    };
  }
  if(storyKey === 'structure_breaking_down'){
    const steps = Array.isArray(recentStory.steps) ? recentStory.steps.map(step => String(step || '').trim()) : [];
    const buyerResponsePresent = steps.includes('buyer_response');
    return {
      supportSemantic:'support_failed',
      buyerResponseSemantic:buyerResponsePresent ? 'response_present' : 'response_failed',
      confirmationSemantic:buyerResponsePresent ? 'follow_through_unconfirmed' : 'follow_through_failed'
    };
  }
  if(storyKey === 'off_level_wait_for_clearer_support'){
    return {
      supportSemantic:'support_absent',
      buyerResponseSemantic:'response_absent',
      confirmationSemantic:'follow_through_unknown'
    };
  }
  return {
    supportSemantic:'',
    buyerResponseSemantic:'',
    confirmationSemantic:''
  };
}

function buildDeterministicEventPacketFromFixture(chartCoach = {}){
  const primaryStory = chartCoach.primaryStory || {};
  const recentStory = chartCoach.recentStory || {};
  const dominantKey = String(primaryStory.key || recentStory.key || '').trim();
  const semanticEnvelope = inferSemanticEnvelope(primaryStory, recentStory);
  const evidenceFactIds = [...new Set([
    ...(Array.isArray(primaryStory.evidenceFactIds) ? primaryStory.evidenceFactIds : []),
    ...(Array.isArray(recentStory.evidenceFactIds) ? recentStory.evidenceFactIds : [])
  ])];
  return {
    dominantEventKey:dominantKey,
    dominantEventLabel:String(EVENT_LABELS[dominantKey] || 'Market event in progress'),
    dominantEvent:String(primaryStory.text || '').trim(),
    eventSequence:Array.isArray(recentStory.steps) ? recentStory.steps.slice() : [],
    evidenceFactIds,
    confidence:Number.isFinite(Number(primaryStory.confidence)) ? Number(primaryStory.confidence) : null,
    rankReason:String(primaryStory.rankReason || '').trim(),
    primaryStoryKey:String(primaryStory.key || '').trim(),
    primaryStoryLabel:String(primaryStory.label || '').trim(),
    primaryStoryIcon:String(primaryStory.icon || '').trim(),
    recentStoryKey:String(recentStory.key || '').trim(),
    recentStoryBias:String(recentStory.bias || '').trim(),
    recentStoryToneMode:String(recentStory.toneMode || '').trim(),
    recentStoryConfidenceMode:String(recentStory.confidenceMode || '').trim(),
    recentStoryTrendLabel:String(recentStory.trendLabel || '').trim(),
    recentStorySupportLabel:String(recentStory.supportLabel || '').trim(),
    supportSemantic:String(recentStory.supportSemantic || semanticEnvelope.supportSemantic || '').trim(),
    buyerResponseSemantic:String(recentStory.buyerResponseSemantic || semanticEnvelope.buyerResponseSemantic || '').trim(),
    confirmationSemantic:String(recentStory.confirmationSemantic || semanticEnvelope.confirmationSemantic || '').trim(),
    stepDetails:Array.isArray(recentStory.stepDetails) ? recentStory.stepDetails.slice() : []
  };
}

function buildNormalizedNarrationAnalysis(fixture){
  const hooks = analyseSetupModule.__test;
  const deterministicEventPacket = buildDeterministicEventPacketFromFixture(fixture.deterministicChartCoach);
  const traderInterpretation = hooks.normalizeTraderInterpretation(fixture.interpreterResponse, deterministicEventPacket);
  const chartCoach = hooks.buildTwoStepChartCoach(fixture.finalProse, traderInterpretation, {
    deterministicEventPacket
  });
  return {
    deterministicEventPacket,
    traderInterpretation,
    chartGuruNarrative:cloneJson(fixture.finalProse),
    chartCoach,
    chartGuruDiagnostics:hooks.buildChartGuruNarrationDiagnostics(traderInterpretation, deterministicEventPacket),
    coach_summary:fixture.finalProse.chartStory,
    plain_english_chart_read:fixture.finalProse.chartStory,
    trustedMarketContext:cloneJson(fixture.trustedMarketContext),
    canonicalValues:{
      ticker:fixture.trustedMarketContext.ticker,
      timeframe:fixture.trustedMarketContext.timeframe,
      price:fixture.trustedMarketContext.currentPrice,
      ma20:fixture.trustedMarketContext.ma20,
      ma50:fixture.trustedMarketContext.ma50,
      ma200:fixture.trustedMarketContext.ma200,
      volume:fixture.trustedMarketContext.volume,
      latestCandleOHLC:cloneJson(fixture.trustedMarketContext.latestCandleOHLC),
      currentAppDerivedTradePlan:cloneJson(fixture.trustedMarketContext.currentAppDerivedTradePlan)
    }
  };
}

function buildVerificationOnlyAnalysis(fixture){
  return {
    visible_ticker:fixture.ticker,
    visible_ticker_source:'fixture_upload',
    ticker_extraction_source:'fixture_upload',
    visible_timeframe:fixture.trustedMarketContext.timeframe,
    visible_latest_price:fixture.trustedMarketContext.currentPrice,
    visible_ma20:fixture.trustedMarketContext.ma20,
    visible_ma50:fixture.trustedMarketContext.ma50,
    visible_ma200:fixture.trustedMarketContext.ma200,
    ma20_visible:true,
    ma50_visible:true,
    ma200_visible:true,
    ma200_line_detected:true,
    ma200_text_detected:true,
    ma200_value_extracted:true,
    visible_price_range:'',
    visible_date_range:'',
    visible_numeric_labels:[
      fixture.trustedMarketContext.currentPrice,
      fixture.trustedMarketContext.ma20,
      fixture.trustedMarketContext.ma50,
      fixture.trustedMarketContext.ma200
    ],
    extraction_confidence:0.99,
    extraction_warnings:[],
    chart_match_status:'match',
    chart_match_warning:'',
    extractedFromImage:{
      visible_ticker:fixture.ticker,
      visible_timeframe:fixture.trustedMarketContext.timeframe,
      visible_latest_price:fixture.trustedMarketContext.currentPrice,
      visible_ma20:fixture.trustedMarketContext.ma20,
      visible_ma50:fixture.trustedMarketContext.ma50,
      visible_ma200:fixture.trustedMarketContext.ma200
    },
    trustedMarketContext:cloneJson(fixture.trustedMarketContext),
    canonicalValues:{
      ticker:fixture.trustedMarketContext.ticker,
      timeframe:fixture.trustedMarketContext.timeframe,
      price:fixture.trustedMarketContext.currentPrice,
      ma20:fixture.trustedMarketContext.ma20,
      ma50:fixture.trustedMarketContext.ma50,
      ma200:fixture.trustedMarketContext.ma200,
      volume:fixture.trustedMarketContext.volume
    },
    chartCoach:{
      primaryStory:null,
      sections:[],
      summaryText:'',
      source:'',
      renderVersion:'chart-guru-v3',
      explanationFacts:[],
      diagnostics:{
        meta:{
          deterministicContractVersion:'chart-guru-contract-v3',
          interpretationPromptVersion:'chart-guru-interpretation-v2',
          finalPromptVersion:'chart-guru-final-v2',
          renderVersion:'chart-guru-v3',
          narrationSource:'validation_fallback'
        }
      }
    },
    confidenceWarnings:[],
    coach_summary:'',
    plain_english_chart_read:'',
    constructive_evidence:[],
    risk_evidence:[],
    what_needs_to_improve:[],
    ai_observation_only:true,
    final_verdict:''
  };
}

function buildAnalyseSetupSuccessResponse(fixture){
  return {
    ok:true,
    model:'chart-guru-fixture-pipeline',
    analysis:buildNormalizedNarrationAnalysis(fixture)
  };
}

function buildVerificationOnlySuccessResponse(fixture){
  return {
    ok:true,
    model:'chart-guru-fixture-pipeline',
    analysis:buildVerificationOnlyAnalysis(fixture)
  };
}

module.exports = {
  fixtures:loadBenchmarkCases(),
  normalizeTicker,
  findNarrationFixtureByTicker,
  buildDeterministicEventPacketFromFixture,
  buildNormalizedNarrationAnalysis,
  buildAnalyseSetupSuccessResponse,
  buildVerificationOnlySuccessResponse
};
