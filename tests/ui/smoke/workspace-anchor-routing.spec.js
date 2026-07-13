const {test, expect} = require('@playwright/test');
const {
  gotoApp,
  waitForAppReady,
  dismissOptionalOverlays,
  waitForUiTransitionSettle
} = require('../helpers/app-driver');

test('diary hash anchor activates the diary workspace tab', async ({page}) => {
  await gotoApp(page);
  await waitForAppReady(page);
  await dismissOptionalOverlays(page);

  await page.evaluate(() => {
    const anchor = document.createElement('a');
    anchor.href = '#diarySection';
    anchor.id = 'testDiaryAnchorRoute';
    anchor.textContent = 'Diary route test';
    document.body.appendChild(anchor);
  });

  await page.evaluate(() => {
    const anchor = document.getElementById('testDiaryAnchorRoute');
    if(anchor) anchor.click();
  });
  await waitForUiTransitionSettle(page);

  await expect(page.locator('[data-workspace-tab="diary"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-workspace-card="diary"]').first()).toBeVisible();
});
