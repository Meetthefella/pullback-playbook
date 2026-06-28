const {test, expect} = require('@playwright/test');
const {
  attachConsoleRecorder,
  captureStage,
  gotoApp,
  waitForAppReady,
  dismissOptionalOverlays,
  resetAppState,
  addTickers,
  runScan
} = require('./helpers/app-driver');
const {loadTickerFixture} = require('./helpers/ticker-fixture');

test('scan flow processes supplied tickers', async ({page}, testInfo) => {
  const consoleEvents = await attachConsoleRecorder(page);
  const tickers = loadTickerFixture();
  expect(tickers.length).toBeGreaterThan(0);

  await gotoApp(page);
  await waitForAppReady(page);
  await dismissOptionalOverlays(page);
  await resetAppState(page);
  await addTickers(page, tickers);
  await captureStage(page, testInfo, 'scan-tickers-added');
  await runScan(page, tickers.length);
  await captureStage(page, testInfo, 'scan-results');

  for(const ticker of tickers){
    await expect(page.locator(`#results .resultcompact[data-ticker="${ticker}"]`).first()).toBeVisible();
  }

  const fatalErrors = consoleEvents.filter(entry => entry.type === 'pageerror');
  expect(fatalErrors, `Page errors: ${fatalErrors.map(entry => entry.text).join(' | ')}`).toEqual([]);
});
