const path = require('path');
const {test, expect} = require('@playwright/test');
const {gotoApp, waitForAppReady, dismissOptionalOverlays, resetAppState} = require('../helpers/app-driver');

const chartPath = path.resolve(__dirname, '..', '..', 'fixtures', 'chart-guru-cases', 'CAT', 'chart.png');

test('a real chart upload and collected market facts create a shadow-only v2 input capture', async ({page}) => {
  await gotoApp(page);
  await waitForAppReady(page);
  await dismissOptionalOverlays(page);
  await resetAppState(page);
  await page.evaluate(() => {
    const record = upsertTickerRecord('CAT');
    const history = Array.from({length:200}, (_, index) => ({
      date:`2026-01-${String(Math.max(1, 31 - (index % 28))).padStart(2, '0')}`,
      close:320 - (index * 0.1), open:320 - (index * 0.1), high:321 - (index * 0.1), low:319 - (index * 0.1), volume:1000000
    }));
    record.marketData = {price:330, asOf:'2026-08-03T15:30:00Z', ma20:326, ma50:320, ma200:290, volume:1500000, avgVolume:1200000, currency:'USD', source:'fixture-live-input', history};
    setActiveReviewTicker('CAT');
    setActiveWorkspaceTab('review');
    record.review.cardOpen = true;
    commitTickerState();
    renderReviewWorkspace({source:'backend_v2_input_capture_test', requestedTicker:'CAT'});
  });
  const fileInput = page.locator('#reviewChartFile');
  await expect(fileInput).toBeAttached();
  await fileInput.setInputFiles(chartPath);
  await page.waitForFunction(() => {
    const record = getTickerRecord('CAT');
    return Boolean(record && record.review && record.review.chartRef && record.review.chartRef.imageId
      && record.authority && record.authority.backendV2InputCapture);
  }, null, {timeout:30000});
  const capture = await page.evaluate(() => getTickerRecord('CAT').authority.backendV2InputCapture);
  expect(capture.readyForPlaybookReview).toBe(true);
  expect(capture.chart.hasOriginalBytes).toBe(true);
  expect(capture.market.historyPoints).toBe(200);
  expect(capture.market.provider).toBe('fixture-live-input');
});
