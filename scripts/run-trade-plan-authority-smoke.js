const fs = require('fs');
const path = require('path');
const http = require('http');
const {spawn} = require('child_process');
const {chromium} = require('@playwright/test');

const host = '127.0.0.1';
const port = 4173;
const baseUrl = `http://${host}:${port}`;
const artifactDir = path.resolve(__dirname, '..', 'artifacts', 'trade-plan-authority-smoke');

function ensureDir(dir){
  fs.mkdirSync(dir, {recursive:true});
}

function wait(ms){
  return new Promise(resolve => setTimeout(resolve, ms));
}

function probeServer(){
  return new Promise(resolve => {
    const request = http.get(`${baseUrl}/index.html`, response => {
      response.resume();
      resolve(response.statusCode >= 200 && response.statusCode < 500);
    });
    request.on('error', () => resolve(false));
    request.setTimeout(1000, () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function startServer(){
  if(await probeServer()) return {process:null, reused:true};
  const child = spawn(process.execPath, ['scripts/playwright-static-server.js'], {
    cwd:path.resolve(__dirname, '..'),
    stdio:['ignore', 'pipe', 'pipe']
  });
  let ready = false;
  child.stdout.on('data', chunk => {
    const text = String(chunk || '');
    if(/Playwright static server listening|already listening/i.test(text)) ready = true;
    process.stdout.write(text);
  });
  child.stderr.on('data', chunk => {
    process.stderr.write(String(chunk || ''));
  });
  for(let attempt = 0; attempt < 50; attempt += 1){
    if(ready || await probeServer()) return {process:child, reused:false};
    if(child.exitCode != null) break;
    await wait(200);
  }
  throw new Error('Failed to start local Playwright static server.');
}

async function stopServer(server){
  if(!server || !server.process) return;
  server.process.kill();
}

async function waitForAppReady(page){
  await page.goto(`${baseUrl}/?trade_plan_smoke=${Date.now()}`, {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => {
    if(typeof startupDebugRenderState !== 'function') return false;
    const ready = startupDebugRenderState();
    return !!(ready && ready.hydrationComplete === true && ready.riskRefreshComplete === true && document.getElementById('buildBtn'));
  }, null, {timeout:30000});
  const skipButton = page.getByRole('button', {name:'Skip'});
  if(await skipButton.count()){
    try{
      if(await skipButton.isVisible()) await skipButton.click();
    }catch(_error){}
  }
}

async function resetApp(page){
  await page.evaluate(async () => {
    try{ localStorage.clear(); }catch(_error){}
    try{ sessionStorage.clear(); }catch(_error){}
    if(typeof clearPlaybookCaches === 'function') await clearPlaybookCaches();
    if(typeof resetAllData === 'function') resetAllData();
    if(typeof clearTransientSessionState === 'function'){
      clearTransientSessionState({
        persist:true,
        clearScannerCache:true,
        clearPersistedShortlistState:true,
        preserveSavedReviewCards:false
      });
    }
  });
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => {
    if(typeof startupDebugRenderState !== 'function') return false;
    const ready = startupDebugRenderState();
    return !!(ready && ready.hydrationComplete === true && ready.riskRefreshComplete === true);
  }, null, {timeout:30000});
}

async function seedCase(page, name){
  return page.evaluate(caseName => {
    const commonRecord = (ticker, price, currency = 'USD') => {
      const record = upsertTickerRecord(ticker);
      record.meta.companyName = `${ticker} Holdings`;
      record.meta.exchange = 'NASDAQ';
      record.meta.tradingViewSymbol = `NASDAQ:${ticker}`;
      record.meta.marketStatus = 'S&P above 50 MA';
      record.marketData.currency = currency;
      record.marketData.price = price;
      record.marketData.previousClose = price - 1;
      record.marketData.ma20 = price - 2;
      record.marketData.ma50 = price - 5;
      record.marketData.ma200 = price - 10;
      record.marketData.rsi = 62;
      record.marketData.volume = 1200000;
      record.marketData.avgVolume = 1000000;
      record.marketData.asOf = '2026-06-30T09:00:00.000Z';
      record.marketData.history = [
        {date:'2026-06-29', open:price - 1.2, high:price + 0.6, low:price - 1.5, close:price, volume:1200000}
      ];
      record.scan.analysisProjection = {
        price,
        sma20:price - 2,
        sma50:price - 5,
        sma200:price - 10,
        rr_ratio:'2.50',
        risk_status:'fits_risk',
        derived_states:{
          trend_state:'strong',
          pullback_zone:'near_20ma',
          setup_location_state:'near_20ma',
          priceability_state:'priceable',
          structure_state:'strong',
          stabilisation_state:'stabilising',
          bounce_state:'confirmed',
          volume_state:'supportive',
          has_clear_invalidation_level:'yes',
          has_priceable_plan:'yes',
          entry_defined:'yes',
          stop_defined:'yes',
          target_defined:'yes'
        }
      };
      record.scan.resolvedVerdict = 'Entry';
      record.scan.verdict = 'Entry';
      record.scan.score = 9;
      record.scan.riskStatus = 'fits_risk';
      record.scan.summary = 'Entry setup is technically valid.';
      record.review.analysisState = {
        normalized:{
          coach_summary:'Constructive setup with buyers in control.'
        }
      };
      record.watchlist.inWatchlist = true;
      record.watchlist.addedAt = '2026-06-30';
      record.watchlist.expiryAfterTradingDays = 5;
      state.paperTradeApiKey = 'paper-key';
      state.paperTradeApiSecret = 'paper-secret';
      state.paperTradeTesterSetupCompletedAt = '2026-06-30T08:00:00.000Z';
      trading212PaperAvailabilityChecked = true;
      trading212PaperEnabled = true;
      trading212PaperAvailabilityMessage = 'Paper gateway ready.';
      return record;
    };
    const renderTicker = ticker => {
      uiState.activeReviewSourceProjectionSnapshot = null;
      uiState.activeReviewProjectionSource = '';
      setActiveReviewTicker(ticker);
      renderReviewWorkspace({source:'trade_plan_authority_smoke'});
      if(typeof applyVisibleWorkspaceForTour === 'function') applyVisibleWorkspaceForTour('review');
    };

    if(caseName === 'affordable'){
      const record = commonRecord('AFFE', 100, 'GBP');
      applyPlanCandidateToRecord(record, {
        entry:100,
        stop:95,
        firstTarget:112
      }, {
        source:'review',
        reason:'smoke_affordable_entry',
        writtenBy:'trade_plan_authority_smoke',
        updatedAt:'2026-06-30T09:00:00.000Z'
      });
      renderTicker('AFFE');
      return {ticker:'AFFE'};
    }

    if(caseName === 'unaffordable'){
      const record = commonRecord('UNAF', 1000, 'GBP');
      applyPlanCandidateToRecord(record, {
        entry:1000,
        stop:995,
        firstTarget:1015
      }, {
        source:'review',
        reason:'smoke_unaffordable_entry',
        writtenBy:'trade_plan_authority_smoke',
        updatedAt:'2026-06-30T09:05:00.000Z'
      });
      renderTicker('UNAF');
      return {ticker:'UNAF'};
    }

    if(caseName === 'legacy_unstamped'){
      const raw = baseTickerRecord('UNST');
      raw.meta.companyName = 'UNST Holdings';
      raw.meta.exchange = 'NASDAQ';
      raw.meta.tradingViewSymbol = 'NASDAQ:UNST';
      raw.meta.marketStatus = 'S&P above 50 MA';
      raw.marketData.currency = 'USD';
      raw.marketData.price = 80;
      raw.marketData.previousClose = 79;
      raw.marketData.ma20 = 78;
      raw.marketData.ma50 = 75;
      raw.marketData.ma200 = 70;
      raw.marketData.rsi = 60;
      raw.marketData.volume = 800000;
      raw.marketData.avgVolume = 750000;
      raw.marketData.asOf = '2026-06-30T09:10:00.000Z';
      raw.scan.analysisProjection = {
        price:80,
        sma20:78,
        sma50:75,
        sma200:70,
        rr_ratio:'2.00',
        risk_status:'fits_risk',
        derived_states:{
          trend_state:'strong',
          pullback_zone:'near_20ma',
          setup_location_state:'near_20ma',
          priceability_state:'priceable',
          structure_state:'strong',
          stabilisation_state:'stabilising',
          bounce_state:'confirmed',
          volume_state:'supportive'
        }
      };
      raw.scan.resolvedVerdict = 'Entry';
      raw.scan.verdict = 'Entry';
      raw.plan.entry = 80;
      raw.plan.stop = 76;
      raw.plan.firstTarget = 88;
      raw.plan.source = 'manual';
      raw.plan.status = 'valid';
      raw.plan.tradeability = 'tradable';
      raw.plan.riskStatus = 'fits_risk';
      raw.plan.capitalFit = 'acceptable';
      raw.plan.positionSize = 10;
      raw.plan.plannedRR = 2;
      raw.watchlist.inWatchlist = true;
      state.tickerRecords.UNST = normalizeTickerRecord(raw);
      renderTicker('UNST');
      return {ticker:'UNST'};
    }

    throw new Error(`Unknown case ${caseName}`);
  }, name);
}

async function collectCaseResult(page, caseName, ticker, consoleEvents){
  await page.waitForFunction(symbol => {
    return typeof activeReviewTicker === 'function'
      && activeReviewTicker() === symbol
      && !!document.getElementById('tradeStatusBox');
  }, ticker, {timeout:10000});
  const screenshotPath = path.join(artifactDir, `${caseName}.png`);
  await page.screenshot({path:screenshotPath, fullPage:true});
  return page.evaluate(({symbol, events}) => {
    const record = getTickerRecord(symbol);
    const effectivePlan = typeof effectivePlanForRecord === 'function' ? effectivePlanForRecord(record, {allowScannerFallback:true}) : null;
    const displayedPlan = (effectivePlan && typeof deriveCurrentPlanState === 'function')
      ? deriveCurrentPlanState(effectivePlan.entry, effectivePlan.stop, effectivePlan.firstTarget, record && record.marketData && record.marketData.currency)
      : null;
    const globalVerdict = typeof resolveGlobalVerdict === 'function' ? resolveGlobalVerdict(record) : null;
    const simplifiedState = typeof resolveSimplifiedStateForSurface === 'function'
      ? resolveSimplifiedStateForSurface(record, 'review', {source:'trade_plan_authority_smoke_trace', mutationSource:'trade_plan_authority_smoke_trace'})
      : null;
    const semantic = typeof buildReviewSemanticStatus === 'function'
      ? buildReviewSemanticStatus({
        record,
        simplifiedState,
        globalVerdict,
        derivedStates:typeof analysisDerivedStatesFromRecord === 'function' ? analysisDerivedStatesFromRecord(record) : {},
        displayedPlan,
        planRealism:{raw_rr:displayedPlan && displayedPlan.rewardRisk ? displayedPlan.rewardRisk.rrRatio : null}
      })
      : null;
    const health = currentReviewStateHealthSnapshot(record);
    const statusText = String(document.getElementById('tradeStatusBox') && document.getElementById('tradeStatusBox').textContent || '').replace(/\s+/g, ' ').trim();
    const capitalFitText = String(document.getElementById('capitalFitBox') && document.getElementById('capitalFitBox').textContent || '').replace(/\s+/g, ' ').trim();
    const disabledReason = String(document.getElementById('paperTradeDisabledReason') && document.getElementById('paperTradeDisabledReason').textContent || '').replace(/\s+/g, ' ').trim();
    const paperBtn = document.getElementById('paperTradeBtn');
    return {
      review:{
        tradeStatus:statusText,
        capitalFitText,
        paperTradeEnabled:!!(paperBtn && !paperBtn.disabled),
        paperTradeDisabledReason:disabledReason
      },
      diagnostics:{
        ticker:symbol,
        sourceOfTruth:health.sourceOfTruth,
        planAuthority:health.planAuthority,
        planTrace:health.planTrace,
        planCandidates:health.planCandidates,
        plan:record && record.plan ? {
          entry:record.plan.entry,
          stop:record.plan.stop,
          firstTarget:record.plan.firstTarget,
          source:record.plan.source,
          status:record.plan.status,
          tradeability:record.plan.tradeability,
          capitalFit:record.plan.capitalFit,
          authoritySource:record.plan.authoritySource,
          authorityVersion:record.plan.authorityVersion,
          authorityReason:record.plan.authorityReason,
          writtenBy:record.plan.writtenBy,
          writtenAt:record.plan.writtenAt,
          candidateSource:record.plan.candidateSource
        } : null,
        tracePath:{
          rawPlan:record && record.plan ? {
            entry:record.plan.entry,
            stop:record.plan.stop,
            firstTarget:record.plan.firstTarget,
            status:record.plan.status,
            tradeability:record.plan.tradeability,
            capitalFit:record.plan.capitalFit,
            affordability:record.plan.affordability
          } : null,
          effectivePlan,
          displayedPlan,
          globalVerdict,
          simplifiedState,
          semantic
        },
        paperTrade:{
          eligibleFromButton:!!(paperBtn && !paperBtn.disabled),
          eligibleFromPlanTrace:!!(health.planTrace && health.planTrace.fields && health.planTrace.fields.paperTradeEligibility && health.planTrace.fields.paperTradeEligibility.finalDisplayedValue),
          disabledReason
        }
      },
      console:{
        errors:events.filter(entry => entry.type === 'error' || entry.type === 'pageerror').map(entry => entry.text),
        warnings:events.filter(entry => entry.type === 'warning').map(entry => entry.text)
      }
    };
  }, {symbol:ticker, events:consoleEvents});
}

async function main(){
  ensureDir(artifactDir);
  const server = await startServer();
  const browser = await chromium.launch({headless:true});
  const page = await browser.newPage();
  const consoleEvents = [];
  page.on('console', message => {
    consoleEvents.push({type:message.type(), text:message.text()});
  });
  page.on('pageerror', error => {
    consoleEvents.push({type:'pageerror', text:String(error && error.message || error || 'Unknown page error')});
  });

  try{
    await waitForAppReady(page);
    const cases = ['affordable', 'unaffordable', 'legacy_unstamped'];
    const report = {};
    for(const caseName of cases){
      await resetApp(page);
      const startIndex = consoleEvents.length;
      const seeded = await seedCase(page, caseName);
      const caseConsole = consoleEvents.slice(startIndex);
      report[caseName] = await collectCaseResult(page, caseName, seeded.ticker, caseConsole);
      fs.writeFileSync(
        path.join(artifactDir, `${caseName}.diagnostics.json`),
        JSON.stringify(report[caseName], null, 2)
      );
    }
    const affordable = report.affordable;
    const unaffordable = report.unaffordable;
    const legacy = report.legacy_unstamped;
    if(!/Entry Ready - plan is actionable\./i.test(String(affordable.review.tradeStatus || ''))
      || !/Capital fit: (Ideal|Acceptable|Borderline)/i.test(String(affordable.review.capitalFitText || ''))
      || affordable.review.paperTradeEnabled !== true
      || String(affordable.diagnostics.plan && affordable.diagnostics.plan.authoritySource || '') !== 'applyPlanCandidateToRecord'){
      throw new Error('Affordable smoke assertion failed.');
    }
    if(!/Setup valid but unaffordable/i.test(String(unaffordable.review.tradeStatus || ''))
      || !/Capital fit: Too expensive/i.test(String(unaffordable.review.capitalFitText || ''))
      || unaffordable.review.paperTradeEnabled !== false
      || /Entry Ready - plan is actionable\./i.test(String(unaffordable.review.tradeStatus || ''))
      || String(unaffordable.diagnostics.planAuthority && unaffordable.diagnostics.planAuthority.reasonCode || '') !== 'capital_not_affordable'
      || String(unaffordable.diagnostics.plan && unaffordable.diagnostics.plan.authoritySource || '') !== 'applyPlanCandidateToRecord'){
      throw new Error('Unaffordable smoke assertion failed.');
    }
    if(/Entry Ready - plan is actionable\./i.test(String(legacy.review.tradeStatus || ''))
      || legacy.review.paperTradeEnabled !== false
      || String(legacy.diagnostics.plan && legacy.diagnostics.plan.authoritySource || '') !== 'rejected_unstamped_plan'
      || String(legacy.diagnostics.plan && legacy.diagnostics.plan.authorityReason || '') !== 'legacy_unstamped_plan_downgraded'){
      throw new Error('Legacy unstamped smoke assertion failed.');
    }
    fs.writeFileSync(path.join(artifactDir, 'trade-plan-authority-smoke-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
    await stopServer(server);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
