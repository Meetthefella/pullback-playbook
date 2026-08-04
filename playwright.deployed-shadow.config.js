const {defineConfig} = require('@playwright/test');

const baseURL = String(process.env.PP_BASE_URL || '').trim().replace(/\/$/, '');
if(!baseURL) throw new Error('PP_BASE_URL is required for deployed shadow journeys. This configuration never starts a local server.');

module.exports = defineConfig({
  testDir:'./tests/ui/journeys',
  timeout:120000,
  expect:{timeout:10000},
  fullyParallel:false,
  retries:0,
  reporter:[['list'], ['html', {open:'never', outputFolder:'playwright-report'}]],
  use:{
    baseURL,
    headless:true,
    trace:'on-first-retry',
    screenshot:'only-on-failure',
    video:'retain-on-failure'
  }
});
