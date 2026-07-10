const fs = require('fs');
const path = require('path');
const {test, expect} = require('@playwright/test');
const {
  attachConsoleRecorder,
  captureStage,
  gotoApp,
  waitForAppReady,
  dismissOptionalOverlays,
  resetAppState,
  addTickers,
  openReviewForTicker,
  waitForUiTransitionSettle
} = require('../helpers/app-driver');
const {extractAppTickerState} = require('../helpers/app-state');
const {writeJsonReport, writeArtifactFile, writeArtifactMarkdown} = require('../helpers/report');
const {loadTickerFixture, normalizeTicker} = require('../helpers/ticker-fixture');
const {
  buildAnalyseSetupSuccessResponse,
  buildVerificationOnlySuccessResponse
} = require('../helpers/chart-guru-fixture-pipeline');
const {
  BENCHMARK_ROOT,
  benchmarkCaseFromFolder,
  listBenchmarkFolders,
  loadBenchmarkCaseByTicker
} = require('../../fixtures/chart-guru-benchmark-library.js');
const analyseSetupModule = require('../../../netlify/functions/analyse-setup.js');

const API_ORIGIN = 'https://velvety-clafoutis-8a92bf.netlify.app';
const RUN_TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
const RUN_RESULTS = [];
const LIVE_ANALYSIS_MODE = String(process.env.PP_CHART_GURU_REAL_ANALYSIS || '').trim() === '1';

const JOURNEY_TICKERS = (() => {
  const explicit = normalizeTicker(process.env.PP_JOURNEY_TICKER || '');
  if(explicit) return [explicit];
  const envTickers = loadTickerFixture().filter(Boolean);
  if(String(process.env.PP_TICKERS || '').trim()) return envTickers;
  const discovered = listBenchmarkFolders().map(entry => entry.ticker);
  return discovered.length ? discovered : ['CAT'];
})();

test.describe.configure({mode:'serial'});

function normalizeText(value){
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeKey(value){
  return normalizeText(value).toLowerCase();
}

function normalizeSemanticText(value){
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const SEMANTIC_TOKEN_EQUIVALENTS = {
  healthy:['healthy', 'strong uptrend', 'strong trend', 'trend remains healthy', 'trend still looks healthy', 'broader trend still looks healthy'],
  buyers:['buyers', 'buying pressure', 'buyers are attempting to step in', 'buyers have started to push'],
  confirmation:['confirmation', 'confirm', 'follow through', 'followthrough', 'needs more proof', 'needs proof'],
  support:['support', '20 day moving average', '20 day average', 'moving average support', 'support level'],
  watch:['watch', 'look for', 'keep an eye on'],
  rebound:['rebound', 'bounce', 'push the stock higher again', 'push price higher again']
};

function normalizeEventIdentity(value){
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function selectLiveDominantEventIdentity(analysis = {}, snapshot = {}){
  const packet = analysis && analysis.deterministicEventPacket || {};
  const interpretation = analysis && analysis.traderInterpretation || {};
  const chartRead = snapshot && snapshot.chartRead || {};
  return normalizeText(
    packet.dominantEventLabel
    || interpretation.dominantEventKey
    || packet.dominantEventKey
    || interpretation.dominantEvent
    || chartRead.trendLabel
  );
}

function selectLiveDominantEventNarrative(analysis = {}, snapshot = {}){
  const packet = analysis && analysis.deterministicEventPacket || {};
  const interpretation = analysis && analysis.traderInterpretation || {};
  const chartRead = snapshot && snapshot.chartRead || {};
  return normalizeText(
    interpretation.dominantEvent
    || packet.dominantEvent
    || packet.dominantEventLabel
    || chartRead.trendLabel
  );
}

function buildMissingChartResult(caseFolder, benchmarkFixture){
  const reason = `Missing chart fixture for ${caseFolder.ticker}. Add ${path.relative(process.cwd(), caseFolder.chartPath)} to validate live narration.`;
  return {
    ticker:caseFolder.ticker,
    benchmark:{
      expectedDominantEvent:benchmarkFixture ? benchmarkFixture.benchmark.dominantEvent : '',
      fixtureId:benchmarkFixture ? benchmarkFixture.id : '',
      available:!!benchmarkFixture
    },
    live:null,
    comparison:{
      dominantEventMatchesBenchmark:false,
      benchmarkSkippedReason:reason
    },
    reviewRender:null,
    warnings:[],
    errors:[reason],
    status:'blocked',
    blockedReason:reason
  };
}

function buildMissingBenchmarkResult(caseFolder){
  const reason = `Missing benchmark.json for ${caseFolder.ticker}. Expected ${path.relative(process.cwd(), caseFolder.benchmarkPath)}.`;
  return {
    ticker:caseFolder.ticker,
    benchmark:{
      expectedDominantEvent:'',
      fixtureId:'',
      available:false
    },
    live:null,
    comparison:{
      dominantEventMatchesBenchmark:false,
      benchmarkSkippedReason:''
    },
    reviewRender:null,
    warnings:[],
    errors:[reason],
    status:'failed'
  };
}

function sectionTextByKey(sections, key){
  const match = Array.isArray(sections) ? sections.find(section => String(section && section.key || '') === key) : null;
  return normalizeText(match && match.text);
}

function includesAllTokens(text, tokens = []){
  const haystack = normalizeSemanticText(text);
  return tokens.every(token => {
    const normalizedToken = normalizeSemanticText(token);
    const equivalents = SEMANTIC_TOKEN_EQUIVALENTS[normalizedToken] || [normalizedToken];
    return equivalents.some(candidate => haystack.includes(normalizeSemanticText(candidate)));
  });
}

function includesAnyToken(text, tokens = []){
  const haystack = normalizeSemanticText(text);
  return tokens.some(token => haystack.includes(normalizeSemanticText(token)));
}

function classifyNarrationMeaning(text = ''){
  const hooks = analyseSetupModule.__test || {};
  if(typeof hooks.classifySupportNarrationSemantic !== 'function') return '';
  return hooks.classifySupportNarrationSemantic(text);
}

function extractTutorInputFromPrompt(prompt = ''){
  const marker = 'Trader interpretation to translate into Chart Guru teaching prose:';
  const source = String(prompt || '');
  const index = source.indexOf(marker);
  if(index < 0) return null;
  const jsonText = source.slice(index + marker.length).trim();
  if(!jsonText) return null;
  try{
    return JSON.parse(jsonText);
  }catch(_error){
    return null;
  }
}

function buildUnpDebugTrace({requestPayload, responseAnalysis, snapshot, appState, networkTrace, benchmarkFixture, harnessErrors}){
  const hooks = analyseSetupModule.__test || {};
  const packet = responseAnalysis && responseAnalysis.deterministicEventPacket || null;
  const interpretation = responseAnalysis && responseAnalysis.traderInterpretation || null;
  const reviewState = appState && appState.review && appState.review.stateHealth || {};
  const scannerProjection = reviewState
    && reviewState.contract
    && reviewState.contract.authoritativeInputs
    && reviewState.contract.authoritativeInputs.scanner
    && reviewState.contract.authoritativeInputs.scanner.analysisProjection || {};
  const scannerDerivedStates = scannerProjection && scannerProjection.derived_states || {};
  const structuredFacts = hooks.buildProductionStructuredFacts
    ? hooks.buildProductionStructuredFacts(requestPayload || {}, responseAnalysis || {})
    : null;
  const normalizedInterpretation = hooks.normalizeTraderInterpretation
    ? hooks.normalizeTraderInterpretation(interpretation || {}, packet || {})
    : interpretation;
  const semanticEnvelope = normalizedInterpretation ? {
    dominantEventKey:String(normalizedInterpretation.dominantEventKey || packet && packet.dominantEventKey || '').trim(),
    supportSemantic:String(normalizedInterpretation.supportSemantic || packet && packet.supportSemantic || '').trim(),
    buyerResponseSemantic:String(normalizedInterpretation.buyerResponseSemantic || packet && packet.buyerResponseSemantic || '').trim(),
    confirmationSemantic:String(normalizedInterpretation.confirmationSemantic || packet && packet.confirmationSemantic || '').trim(),
    supportLabel:String(normalizedInterpretation.supportLabel || packet && packet.recentStorySupportLabel || '').trim(),
    trendLabel:String(normalizedInterpretation.trendLabel || packet && packet.recentStoryTrendLabel || '').trim()
  } : null;
  const tutorPrompt = hooks.buildProductionChartGuruFinalPrompt
    ? hooks.buildProductionChartGuruFinalPrompt(normalizedInterpretation || {}, 'UNP diagnostics')
    : '';
  const tutorInput = extractTutorInputFromPrompt(tutorPrompt);
  const finalChartCoach = responseAnalysis && responseAnalysis.chartCoach || snapshot && snapshot.storedAnalysis && snapshot.storedAnalysis.chartCoach || null;
  const finalReviewText = snapshot && snapshot.reviewRender ? snapshot.reviewRender.previewText : '';
  const setup = appState && appState.setup || {};
  const pipeline = snapshot && snapshot.pipeline || {};
  const chartRead = snapshot && snapshot.chartRead || {};
  const locationMeaning = classifyNarrationMeaning([
    chartRead.text,
    finalReviewText,
    finalChartCoach && finalChartCoach.summaryText
  ].filter(Boolean).join(' '));
  const rawAnalysisResponseText = String(networkTrace && networkTrace.analysisResponseText || '').trim();
  const parsedAnalysisResponse = networkTrace && networkTrace.analysisResponse || null;
  const rawInterpreterResponseText = interpretation ? JSON.stringify(interpretation, null, 2) : '';
  const interpreterValidationErrors = hooks.validateTraderInterpretationResponse
    ? hooks.validateTraderInterpretationResponse(interpretation || {}, packet || {}, structuredFacts || {})
    : [];
  const rawTutorResponseText = responseAnalysis && responseAnalysis.chartGuruNarrative
    ? JSON.stringify(responseAnalysis.chartGuruNarrative, null, 2)
    : '';
  const finalProseValidationErrors = hooks.validateFinalProseResponse
    ? hooks.validateFinalProseResponse(
      responseAnalysis && responseAnalysis.chartGuruNarrative || {},
      [],
      packet || {},
      {traderInterpretation:normalizedInterpretation || {}}
    )
    : [];
  const analysisForComparison = responseAnalysis || snapshot && snapshot.storedAnalysis || {};
  const expectedBenchmarkValue = normalizeText(benchmarkFixture && benchmarkFixture.benchmark && benchmarkFixture.benchmark.dominantEvent);
  const actualComparedValue = selectLiveDominantEventIdentity(analysisForComparison, snapshot || {});
  const actualNarrativeValue = selectLiveDominantEventNarrative(analysisForComparison, snapshot || {});
  const harnessFailedAssertion = Array.isArray(harnessErrors)
    ? (harnessErrors.find(error => /dominant event benchmark mismatch/i.test(String(error || ''))) || harnessErrors[0] || '')
    : '';

  const stages = [
    {
      stage:'deterministicEventPacket',
      dominantEventKey:packet && packet.primaryStoryKey || packet && packet.dominantEventKey || '',
      supportSemantic:packet && packet.supportSemantic || '',
      buyerResponseSemantic:packet && packet.buyerResponseSemantic || '',
      confirmationSemantic:packet && packet.confirmationSemantic || '',
      supportLabel:packet && packet.recentStorySupportLabel || ''
    },
    {
      stage:'traderInterpretation',
      dominantEvent:normalizedInterpretation && normalizedInterpretation.dominantEvent || '',
      supportSemantic:normalizedInterpretation && normalizedInterpretation.supportSemantic || '',
      buyerResponseSemantic:normalizedInterpretation && normalizedInterpretation.buyerResponseSemantic || '',
      confirmationSemantic:normalizedInterpretation && normalizedInterpretation.confirmationSemantic || '',
      supportLabel:normalizedInterpretation && normalizedInterpretation.supportLabel || ''
    },
    {
      stage:'finalNarration',
      supportMeaning:locationMeaning,
      setupLocation:snapshot && snapshot.chartRead && Array.isArray(snapshot.chartRead.sections)
        ? sectionTextByKey(snapshot.chartRead.sections, 'setup_location')
        : ''
    }
  ];

  let firstDivergentStage = '';
  if(String(pipeline.phase || '').trim() !== 'analysis_complete'){
    firstDivergentStage = 'Pre-Stage 1 server analysis failed; client deterministic fallback took over';
  }else if(packet && packet.supportSemantic === 'support_absent'){
    firstDivergentStage = 'Stage 1.5 deterministicEventPacket';
  }else if(normalizedInterpretation && normalizedInterpretation.supportSemantic === 'support_absent'){
    firstDivergentStage = 'Stage 2 traderInterpretation';
  }else if(locationMeaning === 'support_absent'){
    firstDivergentStage = 'Stage 3 tutor output';
  }else if(chartRead && chartRead.usedDeterministicFallback === true){
    firstDivergentStage = 'Review fallback/render path';
  }else if(expectedBenchmarkValue && actualComparedValue && normalizeEventIdentity(expectedBenchmarkValue) !== normalizeEventIdentity(actualComparedValue)){
    firstDivergentStage = 'Harness comparison normalization';
  }

  return {
    deterministicDominantEventKey:String(packet && (packet.primaryStoryKey || packet.dominantEventKey) || '').trim(),
    benchmarkExpectation:{
      dominantEvent:expectedBenchmarkValue,
      normalizedExpectedDominantEvent:normalizeEventIdentity(expectedBenchmarkValue)
    },
    rawDeterministicSupportLocationFields:{
      setupLocationState:setup && setup.setupLocationState
        || scannerDerivedStates.setup_location_state
        || scannerProjection.setup_location_state
        || '',
      pullbackZone:setup && setup.pullbackZone
        || requestPayload && requestPayload.pullbackZone
        || scannerDerivedStates.pullback_zone
        || scannerProjection.pullback_zone
        || '',
      supportLabel:packet && packet.recentStorySupportLabel || '',
      supportSemantic:packet && packet.supportSemantic || '',
      buyerResponseSemantic:packet && packet.buyerResponseSemantic || '',
      confirmationSemantic:packet && packet.confirmationSemantic || '',
      bounceState:setup && setup.bounceState
        || requestPayload && requestPayload.bounceState
        || scannerDerivedStates.bounce_state
        || scannerProjection.bounce_state
        || '',
      stabilisationState:setup && setup.stabilisationState
        || requestPayload && requestPayload.stabilisationState
        || scannerDerivedStates.stabilisation_state
        || scannerProjection.stabilisation_state
        || '',
      followThroughState:packet && packet.recentStoryConfidenceMode || '',
      primaryStoryKey:packet && packet.primaryStoryKey || '',
      recentStoryKey:packet && packet.recentStoryKey || '',
      recentStoryTrendLabel:packet && packet.recentStoryTrendLabel || '',
      recentStorySupportLabel:packet && packet.recentStorySupportLabel || ''
    },
    clientFallbackInputs:{
      technicalSummary:appState && appState.scan && appState.scan.visibleCard && appState.scan.visibleCard.technicalSummary || '',
      decisionSummary:appState && appState.scan && appState.scan.visibleCard && appState.scan.visibleCard.decisionSummary || '',
      scannerDerivedStates,
      scannerProjectionRisks:Array.isArray(scannerProjection && scannerProjection.risks) ? scannerProjection.risks : [],
      fallbackPrimaryStoryKey:chartRead && chartRead.primaryStoryKey || '',
      fallbackRecentStoryKey:chartRead && chartRead.recentStoryKey || '',
      usedDeterministicFallback:chartRead && chartRead.usedDeterministicFallback === true
    },
    deterministicEventPacket:packet,
    dominantEvent:normalizedInterpretation && normalizedInterpretation.dominantEvent || '',
    interpreterPrompt:structuredFacts,
    interpreterInput:structuredFacts,
    rawInterpreterResponseText,
    parsedInterpreterObject:interpretation,
    interpreterSchemaValidationResult:{
      ok:Array.isArray(interpreterValidationErrors) && interpreterValidationErrors.length === 0,
      errors:interpreterValidationErrors
    },
    interpreterDominantEvent:String(normalizedInterpretation && normalizedInterpretation.dominantEvent || '').trim(),
    interpreterDominantEventKey:String(normalizedInterpretation && normalizedInterpretation.dominantEventKey || '').trim(),
    traderInterpretation:normalizedInterpretation,
    semanticEnvelope,
    tutorPrompt,
    tutorInput,
    rawTutorResponseText,
    parsedTutorProse:responseAnalysis && responseAnalysis.chartGuruNarrative || null,
    finalProseValidationFailures:finalProseValidationErrors,
    chartCoachBeforeNormalization:responseAnalysis && responseAnalysis.chartCoach || null,
    finalChartCoach,
    normalizedAnalysis:snapshot && snapshot.storedAnalysis || null,
    chartCoachAfterNormalization:snapshot && snapshot.storedAnalysis && snapshot.storedAnalysis.chartCoach || null,
    reviewRender:{
      title:snapshot && snapshot.reviewRender && snapshot.reviewRender.title || '',
      previewText:finalReviewText,
      chartReadText:chartRead && chartRead.text || ''
    },
    rawServerAnalysisResponseText:rawAnalysisResponseText,
    parsedServerAnalysisResponse:parsedAnalysisResponse,
    chartAnalysisPipeline:pipeline,
    harnessComparison:{
      expectedBenchmarkValue,
      actualComparedValue,
      actualNarrativeValue,
      normalizedExpected:normalizeEventIdentity(expectedBenchmarkValue),
      normalizedActualCompared:normalizeEventIdentity(actualComparedValue),
      exactFailingAssertion:harnessFailedAssertion
    },
    firstDivergentStage,
    stageSummaries:stages
  };
}

function buildMarkdownSummary(results){
  const lines = ['# Chart Guru Live Narration Journey', '', `Generated: ${new Date().toISOString()}`, ''];
  results.forEach(result => {
    lines.push(`## ${result.ticker}`);
    lines.push(`- Status: ${result.status}`);
    lines.push(`- Expected dominant event: ${result.benchmark && result.benchmark.expectedDominantEvent || 'n/a'}`);
    lines.push(`- Live dominant event: ${result.live && result.live.dominantEvent || 'n/a'}`);
    lines.push(`- Benchmark comparison: ${result.comparison && result.comparison.dominantEventMatchesBenchmark === true ? 'pass' : (result.comparison && result.comparison.benchmarkSkippedReason ? `skipped (${result.comparison.benchmarkSkippedReason})` : 'fail')}`);
    lines.push(`- Trader interpretation: ${result.live && result.live.traderInterpretation || 'n/a'}`);
    lines.push(`- Final novice prose: ${result.live ? [
      result.live.chartStory,
      result.live.whyItMatters,
      result.live.setupLocation,
      result.live.learningPoint,
      result.live.whatNext
    ].filter(Boolean).join(' | ') : 'n/a'}`);
    lines.push(`- Review-rendered prose: ${result.reviewRender ? [
      result.reviewRender.visibleChartStory,
      result.reviewRender.visibleWhyItMatters,
      result.reviewRender.visibleSetupLocation,
      result.reviewRender.visibleLearningPoint,
      result.reviewRender.visibleWhatNext
    ].filter(Boolean).join(' | ') : 'n/a'}`);
    lines.push(`- Warnings: ${Array.isArray(result.warnings) && result.warnings.length ? result.warnings.join(' | ') : 'none'}`);
    lines.push('');
  });
  return lines.join('\n');
}

async function waitForScanTicker(page, ticker){
  await page.waitForFunction(symbol => {
    const card = document.querySelector(`#results .resultcompact[data-ticker="${symbol}"]`);
    if(!card || typeof getTickerRecord !== 'function') return false;
    const record = getTickerRecord(symbol);
    return !!String(record && record.scan && (record.scan.resolvedVerdict || record.scan.verdict) || '').trim();
  }, ticker, {timeout:90000});
}

async function uploadChartFixture(page, fixturePath){
  const fileInput = page.locator('#reviewChartFile');
  await expect(fileInput).toHaveCount(1);
  await fileInput.setInputFiles(fixturePath);
  await expect.poll(async () => {
    return await page.evaluate(() => {
      const record = typeof activeReviewTicker === 'function' ? getTickerRecord(activeReviewTicker()) : null;
      return !!(record && record.review && record.review.chartRef && record.review.chartRef.dataUrl);
    });
  }, {timeout:30000}).toBe(true);
}

async function maybeStartAnalysis(page, ticker){
  await expect.poll(async () => {
    return await page.evaluate(symbol => {
      const record = typeof getTickerRecord === 'function' ? getTickerRecord(symbol) : null;
      const analysis = record && record.review && record.review.normalizedAnalysis;
      const pipeline = record && record.review && record.review.chartAnalysisPipeline;
      const button = document.getElementById('analyseActiveBtn');
      return {
        hasAnalysis:!!(analysis && analysis.chartCoach && Array.isArray(analysis.chartCoach.sections) && analysis.chartCoach.sections.length),
        phase:String(pipeline && pipeline.phase || ''),
        enabled:!!(button && !button.disabled)
      };
    }, ticker);
  }, {
    timeout:120000,
    intervals:[500, 1000, 2000]
  }).not.toMatchObject({phase:'cant_read'});

  const status = await page.evaluate(symbol => {
    const record = typeof getTickerRecord === 'function' ? getTickerRecord(symbol) : null;
    const analysis = record && record.review && record.review.normalizedAnalysis;
    const pipeline = record && record.review && record.review.chartAnalysisPipeline;
    const button = document.getElementById('analyseActiveBtn');
    return {
      hasAnalysis:!!(analysis && analysis.chartCoach && Array.isArray(analysis.chartCoach.sections) && analysis.chartCoach.sections.length),
      phase:String(pipeline && pipeline.phase || ''),
      enabled:!!(button && !button.disabled)
    };
  }, ticker);

  if(!status.hasAnalysis && status.enabled){
    await page.locator('#analyseActiveBtn').click();
  }
}

async function waitForNarrationComplete(page, ticker){
  await expect.poll(async () => {
    return await page.evaluate(symbol => {
      const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
      const record = typeof getTickerRecord === 'function' ? getTickerRecord(symbol) : null;
      const analysis = record && record.review && record.review.normalizedAnalysis || null;
      const pipeline = record && record.review && record.review.chartAnalysisPipeline || null;
      const preview = document.getElementById('reviewAiSummaryPreview');
      return {
        phase:String(pipeline && pipeline.phase || ''),
        hasPacket:!!(analysis && analysis.deterministicEventPacket && analysis.deterministicEventPacket.dominantEventLabel),
        hasInterpretation:!!(analysis && analysis.traderInterpretation && analysis.traderInterpretation.dominantEvent),
        hasChartCoach:!!(analysis && analysis.chartCoach && Array.isArray(analysis.chartCoach.sections) && analysis.chartCoach.sections.length),
        previewText:normalize(preview && preview.textContent)
      };
    }, ticker);
  }, {
    timeout:180000,
    intervals:[1000, 2000, 4000]
  }).toMatchObject({
    phase:'analysis_complete',
    hasPacket:true,
    hasInterpretation:true,
    hasChartCoach:true
  });
}

async function captureNarrationSnapshot(page, ticker, consoleEvents){
  return await page.evaluate(symbol => {
    const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
    const record = getTickerRecord(symbol);
    const normalizedAnalysis = record && record.review && record.review.normalizedAnalysis || {};
    const chartRead = finalDisplayedAnalysisChartRead(record, normalizedAnalysis);
    const chartCoach = chartRead && chartRead.chartCoach || normalizedAnalysis.chartCoach || {};
    const sections = Array.isArray(chartCoach.sections) ? chartCoach.sections : [];
    return {
      ticker:symbol,
      storedAnalysis:JSON.parse(JSON.stringify(normalizedAnalysis)),
      chartRead:{
        selectedSummarySource:String(chartRead && chartRead.selectedSummarySource || ''),
        usedDeterministicFallback:chartRead && chartRead.usedDeterministicFallback === true,
        text:String(chartRead && chartRead.text || ''),
        primaryStoryKey:String(chartCoach && chartCoach.primaryStory && chartCoach.primaryStory.key || ''),
        recentStoryKey:String(chartCoach && chartCoach.recentStory && chartCoach.recentStory.key || ''),
        trendLabel:String(chartCoach && chartCoach.recentStory && chartCoach.recentStory.trendLabel || ''),
        sections:sections.map(section => ({
          key:String(section && section.key || ''),
          label:String(section && section.label || ''),
          text:String(section && section.text || '')
        }))
      },
      reviewRender:{
        title:normalize(document.getElementById('reviewAiSummaryTitle') && document.getElementById('reviewAiSummaryTitle').textContent),
        previewText:normalize(document.getElementById('reviewAiSummaryPreview') && document.getElementById('reviewAiSummaryPreview').textContent),
        previewHtml:String(document.getElementById('reviewAiSummaryPreview') && document.getElementById('reviewAiSummaryPreview').innerHTML || '')
      },
      pipeline:JSON.parse(JSON.stringify(record && record.review && record.review.chartAnalysisPipeline || null))
    };
  }, ticker);
}

for(const ticker of JOURNEY_TICKERS){
  test(`${ticker} completes the Chart Guru narration journey`, async ({page}, testInfo) => {
    test.slow();
    test.setTimeout(300000);

    const caseFolder = benchmarkCaseFromFolder(ticker);
    if(!caseFolder.hasBenchmarkJson){
      const failed = buildMissingBenchmarkResult(caseFolder);
      RUN_RESULTS.push(failed);
      await writeJsonReport(testInfo, `${ticker.toLowerCase()}-chart-guru-live-narration-fixture-error.json`, failed);
      expect(failed.errors, JSON.stringify(failed, null, 2)).toEqual([]);
    }

    const benchmarkFixture = loadBenchmarkCaseByTicker(ticker);
    if(!caseFolder.hasChart){
      const blocked = buildMissingChartResult(caseFolder, benchmarkFixture);
      RUN_RESULTS.push(blocked);
      await writeJsonReport(testInfo, `${ticker.toLowerCase()}-chart-guru-live-narration-blocked.json`, blocked);
      expect(blocked.errors, JSON.stringify(blocked, null, 2)).toEqual([]);
    }

    const consoleEvents = await attachConsoleRecorder(page);
    const networkTrace = {
      verificationRequest:null,
      analysisRequest:null,
      verificationResponse:null,
      analysisResponse:null,
      verificationResponseText:'',
      analysisResponseText:''
    };
    await page.route(/analyse-setup/i, async route => {
      const request = route.request();
      const body = request.postDataJSON() || {};
      if(body && body.verificationOnly === true){
        networkTrace.verificationRequest = JSON.parse(JSON.stringify(body));
      }else{
        networkTrace.analysisRequest = JSON.parse(JSON.stringify(body));
      }
      if(LIVE_ANALYSIS_MODE){
        const upstream = await route.fetch({
          url:`${API_ORIGIN}/.netlify/functions/analyse-setup`
        });
        const responseBody = await upstream.text();
        if(body && body.verificationOnly === true) networkTrace.verificationResponseText = responseBody;
        else networkTrace.analysisResponseText = responseBody;
        try{
          const parsed = JSON.parse(responseBody);
          if(body && body.verificationOnly === true) networkTrace.verificationResponse = parsed;
          else networkTrace.analysisResponse = parsed;
        }catch(_error){}
        await route.fulfill({
          response:upstream,
          body:responseBody
        });
        return;
      }
      if(!benchmarkFixture){
        await route.continue();
        return;
      }
      if(body && body.verificationOnly === true){
        networkTrace.verificationResponse = buildVerificationOnlySuccessResponse(benchmarkFixture);
        await route.fulfill({
          status:200,
          contentType:'application/json',
          body:JSON.stringify(buildVerificationOnlySuccessResponse(benchmarkFixture))
        });
        return;
      }
      networkTrace.analysisResponse = buildAnalyseSetupSuccessResponse(benchmarkFixture);
      await route.fulfill({
        status:200,
        contentType:'application/json',
        body:JSON.stringify(buildAnalyseSetupSuccessResponse(benchmarkFixture))
      });
    });

    await gotoApp(page, {pp_api_origin:API_ORIGIN});
    await waitForAppReady(page);
    await dismissOptionalOverlays(page);
    await resetAppState(page);

    await addTickers(page, [ticker]);
    await Promise.all([
      page.waitForResponse(response => /market-data/i.test(response.url()) && response.status() === 200, {timeout:90000}),
      page.locator('#buildBtn').click()
    ]);
    await waitForScanTicker(page, ticker);
    await openReviewForTicker(page, ticker);
    await waitForUiTransitionSettle(page);
    await captureStage(page, testInfo, `${ticker.toLowerCase()}-chart-guru-review-pre-upload`);

    await uploadChartFixture(page, caseFolder.chartPath);
    let narrationWaitError = null;
    await maybeStartAnalysis(page, ticker);
    try{
      await waitForNarrationComplete(page, ticker);
    }catch(error){
      narrationWaitError = error;
    }
    await waitForUiTransitionSettle(page);
    await captureStage(page, testInfo, `${ticker.toLowerCase()}-chart-guru-review-post-analysis`);

    const appState = await extractAppTickerState(page, ticker, consoleEvents);
    const snapshot = await captureNarrationSnapshot(page, ticker, consoleEvents);
    const analysis = snapshot.storedAnalysis || {};
    const sections = snapshot.chartRead.sections || [];
    const liveDominantEvent = selectLiveDominantEventIdentity(analysis, snapshot);
    const liveDominantEventNarrative = selectLiveDominantEventNarrative(analysis, snapshot);
    const expectedDominantEvent = normalizeText(benchmarkFixture && benchmarkFixture.benchmark && benchmarkFixture.benchmark.dominantEvent);
    const benchmarkSkippedReason = benchmarkFixture ? '' : `No benchmark fixture exists for ${ticker} under ${BENCHMARK_ROOT}.`;
    const warnings = [];
    const errors = [];

    if(narrationWaitError){
      errors.push(`Narration did not complete: ${String(narrationWaitError.message || narrationWaitError)}`);
    }

    const comparison = {
      dominantEventMatchesBenchmark:benchmarkFixture
        ? normalizeEventIdentity(liveDominantEvent) === normalizeEventIdentity(expectedDominantEvent)
        : false,
      comparedAs:'event_identity',
      expectedBenchmarkValue:expectedDominantEvent,
      actualComparedValue:liveDominantEvent,
      actualNarrativeValue:liveDominantEventNarrative,
      benchmarkSkippedReason
    };

    const live = {
      deterministicEventPacket:analysis.deterministicEventPacket || null,
      traderInterpretation:normalizeText(analysis.traderInterpretation && analysis.traderInterpretation.traderInterpretation),
      chartCoach:analysis.chartCoach || null,
      dominantEvent:liveDominantEvent,
      dominantEventNarrative:liveDominantEventNarrative,
      eventSequence:Array.isArray(analysis.traderInterpretation && analysis.traderInterpretation.eventSequence)
        ? analysis.traderInterpretation.eventSequence.slice()
        : [],
      chartStory:sectionTextByKey(sections, 'biggest_clue'),
      whyItMatters:sectionTextByKey(sections, 'why_it_matters'),
      setupLocation:sectionTextByKey(sections, 'setup_location'),
      learningPoint:sectionTextByKey(sections, 'learning_point'),
      whatNext:sectionTextByKey(sections, 'what_next')
    };

    const reviewRender = {
      visibleChartStory:live.chartStory,
      visibleWhyItMatters:live.whyItMatters,
      visibleSetupLocation:live.setupLocation,
      visibleLearningPoint:live.learningPoint,
      visibleWhatNext:live.whatNext,
      previewText:snapshot.reviewRender.previewText
    };

    if(!analysis.deterministicEventPacket) errors.push('deterministicEventPacket missing from stored analysis.');
    if(!analysis.traderInterpretation) errors.push('traderInterpretation missing from stored analysis.');
    if(!analysis.chartCoach) errors.push('chartCoach missing from stored analysis.');
    if(snapshot.chartRead.selectedSummarySource !== 'openai_two_step_chart_guru' && !narrationWaitError){
      errors.push(`Expected openai_two_step_chart_guru summary source, received ${snapshot.chartRead.selectedSummarySource || 'none'}.`);
    }
    if(snapshot.chartRead.usedDeterministicFallback === true && !narrationWaitError){
      errors.push('Review used deterministic fallback instead of the stored Chart Guru narration.');
    }
    if(!narrationWaitError && String(snapshot.chartRead.primaryStoryKey || '') !== String(analysis.deterministicEventPacket && analysis.deterministicEventPacket.primaryStoryKey || '')){
      errors.push('chartCoach primaryStory key diverged from deterministicEventPacket primaryStoryKey.');
    }
    if(!narrationWaitError && String(snapshot.chartRead.recentStoryKey || '') !== String(analysis.deterministicEventPacket && analysis.deterministicEventPacket.recentStoryKey || '')){
      errors.push('chartCoach recentStory key diverged from deterministicEventPacket recentStoryKey.');
    }
    if(!narrationWaitError && String(snapshot.chartRead.trendLabel || '') !== String(analysis.traderInterpretation && analysis.traderInterpretation.dominantEvent || '')){
      errors.push('Dominant event did not survive into the visible recentStory label.');
    }
    if((!reviewRender.previewText || /No Chart Guru saved yet\./i.test(reviewRender.previewText)) && !narrationWaitError){
      errors.push('Review UI did not render final Chart Guru prose.');
    }
    if(/dominantEvent|eventSequence|currentRisk|nextSignal|deterministicEventPacket/i.test(reviewRender.previewText)){
      errors.push('Diagnostics fields leaked into public Review prose.');
    }

    if(benchmarkFixture){
      const semantic = benchmarkFixture.semanticExpectations || {};
      if(!comparison.dominantEventMatchesBenchmark){
        errors.push(`Dominant event benchmark mismatch. Expected event identity "${expectedDominantEvent}" but compared value was "${liveDominantEvent}" (narrative: "${liveDominantEventNarrative}").`);
      }
      if(!includesAllTokens([live.traderInterpretation, analysis.traderInterpretation && analysis.traderInterpretation.currentRisk, analysis.traderInterpretation && analysis.traderInterpretation.nextSignal].join(' '), semantic.traderTokens || [])){
        errors.push('Trader interpretation lost expected semantic cues.');
      }
      if(!includesAllTokens([live.chartStory, live.whyItMatters, live.setupLocation, live.learningPoint, live.whatNext].join(' '), semantic.tutorTokens || [])){
        errors.push('Tutor prose lost expected semantic cues.');
      }
      if(includesAnyToken([live.traderInterpretation, live.chartStory, live.whyItMatters, live.setupLocation, live.learningPoint, live.whatNext].join(' '), semantic.forbiddenTokens || [])){
        errors.push('Unsupported inference or forbidden technical wording appeared in narration.');
      }
    }else{
      warnings.push(benchmarkSkippedReason);
    }

    const consoleErrors = consoleEvents.filter(entry => entry.type === 'error' || entry.type === 'pageerror');
    const fatalConsoleErrors = consoleErrors.filter(entry => {
      if(entry.type === 'pageerror') return true;
      return !/Failed to load resource: the server responded with a status of 404 \(Not Found\)/i.test(String(entry.text || ''));
    });
    if(fatalConsoleErrors.length){
      errors.push(`Fatal console errors: ${fatalConsoleErrors.map(entry => entry.text).join(' | ')}`);
    }

    const result = {
      ticker,
      benchmark:{
        expectedDominantEvent,
        fixtureId:benchmarkFixture && benchmarkFixture.id || '',
        available:!!benchmarkFixture
      },
      live:{
        deterministicEventPacket:live.deterministicEventPacket,
        traderInterpretation:live.traderInterpretation,
        chartCoach:live.chartCoach,
        dominantEvent:live.dominantEvent,
        eventSequence:live.eventSequence,
        chartStory:live.chartStory,
        whyItMatters:live.whyItMatters,
        setupLocation:live.setupLocation,
        learningPoint:live.learningPoint,
        whatNext:live.whatNext
      },
      comparison,
      reviewRender,
      warnings,
      errors,
      status:errors.length ? 'failed' : 'passed',
      snapshot:{
        chartRead:snapshot.chartRead,
        pipeline:snapshot.pipeline,
        appState,
        networkTrace
      }
    };

    if(ticker === 'UNP'){
      result.debugTrace = buildUnpDebugTrace({
        requestPayload:networkTrace.analysisRequest,
        responseAnalysis:networkTrace.analysisResponse && networkTrace.analysisResponse.analysis || analysis,
        snapshot,
        appState,
        networkTrace,
        benchmarkFixture,
        harnessErrors:errors
      });
      await writeJsonReport(testInfo, `${ticker.toLowerCase()}-chart-guru-debug-trace.json`, result.debugTrace);
      writeArtifactFile(
        path.join('chart-guru-live-narration', `${RUN_TIMESTAMP}-${ticker.toLowerCase()}-debug.json`),
        JSON.stringify(result.debugTrace, null, 2)
      );
    }

    RUN_RESULTS.push(result);
    await writeJsonReport(testInfo, `${ticker.toLowerCase()}-chart-guru-live-narration.json`, result);

    expect(errors, errors.length ? JSON.stringify(result, null, 2) : '').toEqual([]);
  });
}

test.afterAll(async () => {
  const payload = {
    generatedAt:new Date().toISOString(),
    tickers:JOURNEY_TICKERS,
    results:RUN_RESULTS
  };
  writeArtifactFile(path.join('chart-guru-live-narration', `${RUN_TIMESTAMP}.json`), JSON.stringify(payload, null, 2));
  writeArtifactMarkdown(path.join('chart-guru-live-narration', `${RUN_TIMESTAMP}.md`), buildMarkdownSummary(RUN_RESULTS));
});
