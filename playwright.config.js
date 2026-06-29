const {defineConfig} = require('@playwright/test');

const baseURL = process.env.PP_BASE_URL || 'http://127.0.0.1:4173';

module.exports = defineConfig({
  testDir:'./tests/ui',
  timeout:120000,
  expect:{timeout:10000},
  fullyParallel:false,
  retries:0,
  reporter:[
    ['list'],
    ['html', {open:'never', outputFolder:'playwright-report'}]
  ],
  webServer:{
    command:'node scripts/playwright-static-server.js',
    url:baseURL,
    reuseExistingServer:true,
    timeout:30000
  },
  use:{
    baseURL,
    headless:true,
    trace:'on-first-retry',
    screenshot:'only-on-failure',
    video:'retain-on-failure'
  }
});
