const {defineConfig} = require('@playwright/test');

// Contract specs load index.html through file:// and must not start the
// managed static server. Keeping this separate makes their lifecycle local to
// Playwright's page fixture and avoids server shutdown time in direct runs.
module.exports = defineConfig({
  testDir:'./tests/ui/contracts',
  timeout:120000,
  expect:{timeout:10000},
  fullyParallel:false,
  retries:0,
  reporter:[
    ['list'],
    ['html', {open:'never', outputFolder:'playwright-report'}]
  ],
  use:{
    headless:true,
    trace:'on-first-retry',
    screenshot:'only-on-failure',
    video:'retain-on-failure'
  }
});
