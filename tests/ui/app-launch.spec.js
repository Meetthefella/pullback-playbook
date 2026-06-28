const {test, expect} = require('@playwright/test');
const {
  attachConsoleRecorder,
  captureStage,
  gotoApp,
  waitForAppReady,
  dismissOptionalOverlays
} = require('./helpers/app-driver');

test('application launches cleanly', async ({page}, testInfo) => {
  const consoleEvents = await attachConsoleRecorder(page);
  await gotoApp(page);
  await waitForAppReady(page);
  await dismissOptionalOverlays(page);
  await captureStage(page, testInfo, 'launch-ready');

  const startupErrors = consoleEvents.filter(entry => entry.type === 'pageerror');
  expect(startupErrors, `Startup JS errors: ${startupErrors.map(entry => entry.text).join(' | ')}`).toEqual([]);
});
