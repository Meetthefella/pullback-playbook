const path = require('path');
const {expect} = require('@playwright/test');

function artifactPath(testInfo, name){
  return path.join(testInfo.outputDir, name);
}

function buildAppUrl(query = {}){
  const params = new URLSearchParams();
  const input = query && typeof query === 'object' ? query : {};
  Object.keys(input).forEach(key => {
    const value = input[key];
    if(value === undefined || value === null || value === '') return;
    params.set(key, String(value));
  });
  params.set('pp_parity_bust', String(Date.now()));
  return `/?${params.toString()}`;
}

async function captureStage(page, testInfo, name){
  await page.screenshot({
    path:artifactPath(testInfo, `${name}.png`),
    fullPage:true
  });
}

async function attachConsoleRecorder(page){
  const events = [];
  page.on('console', message => {
    events.push({
      type:message.type(),
      text:message.text()
    });
  });
  page.on('pageerror', error => {
    events.push({
      type:'pageerror',
      text:String(error && error.message || error || 'Unknown page error')
    });
  });
  return events;
}

async function gotoApp(page, query = {}){
  await page.goto(buildAppUrl(query), {waitUntil:'domcontentloaded'});
  await expect(page.locator('#buildBtn')).toBeVisible();
}

async function waitForAppReady(page){
  await page.waitForFunction(() => {
    if(typeof startupDebugRenderState !== 'function') return false;
    const ready = startupDebugRenderState();
    return !!(
      document.getElementById('buildBtn')
      && document.querySelector('[data-workspace-tab="scan"]')
      && ready
      && ready.hydrationComplete === true
      && ready.riskRefreshComplete === true
    );
  }, null, {timeout:30000});
}

async function dismissOptionalOverlays(page){
  const skipButton = page.getByRole('button', {name:'Skip'});
  if(await skipButton.count()){
    try{
      if(await skipButton.isVisible()){
        await skipButton.click();
      }
    }catch(error){}
  }
}

async function resetAppState(page){
  await page.evaluate(async () => {
    if('serviceWorker' in navigator){
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(registration => registration.unregister()));
    }
    if('caches' in window){
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map(cacheKey => caches.delete(cacheKey)));
    }
    try{
      localStorage.clear();
    }catch(error){}
    try{
      sessionStorage.clear();
    }catch(error){}
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
  await waitForAppReady(page);
  await dismissOptionalOverlays(page);
}

async function addTickers(page, tickers){
  await page.locator('#tvImportInput').fill(tickers.join('\n'));
  await page.locator('#importTvBtn').click();
  await expect(page.locator('#tvImportPreview')).toContainText(tickers[0]);
}

async function runScan(page, expectedCount){
  await page.locator('#buildBtn').press('Enter');
  await page.waitForFunction(count => {
    if(typeof rankedTickerRecords !== 'function') return false;
    return rankedTickerRecords().length >= count;
  }, expectedCount, {timeout:90000});
}

async function openReviewForTicker(page, ticker){
  await page.locator('[data-workspace-tab="scan"]').click();
  await page.waitForFunction(() => {
    return document.querySelector('[data-workspace-tab="scan"][aria-selected="true"]') !== null;
  }, null, {timeout:10000});
  const card = page.locator(`#results .resultcompact[data-ticker="${ticker}"]`).first();
  await expect(card).toBeVisible({timeout:30000});
  try{
    await card.click();
  }catch(error){
    await page.evaluate(symbol => {
      if(typeof openRankedResultInReview === 'function') openRankedResultInReview(symbol);
    }, ticker);
  }
  await page.waitForFunction(symbol => {
    return typeof activeReviewTicker === 'function' && activeReviewTicker() === symbol;
  }, ticker, {timeout:30000});
}

async function openScanDecisionTraceForTicker(page, ticker){
  await page.locator('[data-workspace-tab="scan"]').click();
  await page.waitForFunction(() => {
    return document.querySelector('[data-workspace-tab="scan"][aria-selected="true"]') !== null;
  }, null, {timeout:10000});
  const card = page.locator(`#results .resultcompact[data-ticker="${ticker}"]`).first();
  await expect(card).toBeVisible({timeout:30000});
  const overflowButton = card.locator('[data-act="overflow-toggle"]').first();
  await overflowButton.click();
  const traceButton = card.locator('[data-act="open-trace"]').first();
  await expect(traceButton).toBeVisible({timeout:10000});
  await traceButton.click();
  await expect(card.locator('[data-scan-decision-trace-content]')).toBeVisible({timeout:10000});
}

async function waitForUiTransitionSettle(page){
  await page.evaluate(async () => {
    await new Promise(resolve => {
      if(typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'){
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => resolve());
        });
        return;
      }
      setTimeout(resolve, 50);
    });
  });
}

async function addActiveReviewToWatchlistIfEligible(page){
  const button = page.locator('#addWatchlistActiveBtn');
  if(!(await button.count())) return false;
  if(await button.isDisabled()) return false;
  await button.click();
  return true;
}

async function openTrackTab(page){
  await openWorkspaceTab(page, 'track');
}

async function openReviewFromTrackTicker(page, ticker){
  await openTrackTab(page);
  const card = page.locator(`[data-watchlist-ticker="${ticker}"]`).first();
  if(!(await card.isVisible().catch(() => false))){
    for(let attempt = 0; attempt < 8; attempt += 1){
      const collapsedToggle = page.locator('.watchlistgroup__toggle[aria-expanded="false"]').first();
      if(!(await collapsedToggle.count())) break;
      await collapsedToggle.click();
      await waitForUiTransitionSettle(page);
      if(await card.isVisible().catch(() => false)) break;
    }
  }
  await expect(card).toBeVisible({timeout:30000});
  const reviewButton = card.locator('[data-act="review"]').first();
  await reviewButton.click();
  await page.waitForFunction(symbol => {
    return typeof activeReviewTicker === 'function' && activeReviewTicker() === symbol;
  }, ticker, {timeout:30000});
}

async function openWorkspaceTab(page, tab){
  await page.locator(`[data-workspace-tab="${tab}"]`).click();
  await page.waitForFunction(activeTab => {
    return document.querySelector(`[data-workspace-tab="${activeTab}"][aria-selected="true"]`) !== null;
  }, tab, {timeout:10000});
}

async function reloadApp(page){
  await page.reload({waitUntil:'domcontentloaded'});
  await waitForAppReady(page);
  await dismissOptionalOverlays(page);
}

module.exports = {
  attachConsoleRecorder,
  captureStage,
  gotoApp,
  waitForAppReady,
  dismissOptionalOverlays,
  resetAppState,
  addTickers,
  runScan,
  openScanDecisionTraceForTicker,
  openReviewForTicker,
  addActiveReviewToWatchlistIfEligible,
  openWorkspaceTab,
  openTrackTab,
  openReviewFromTrackTicker,
  reloadApp,
  waitForUiTransitionSettle,
  artifactPath,
  buildAppUrl
};
