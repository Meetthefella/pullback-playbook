const {defineConfig} = require('@playwright/test');

const baseURL = process.env.PP_BASE_URL || 'https://velvety-clafoutis-8a92bf.netlify.app';

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
  use:{
    baseURL,
    headless:true,
    trace:'on-first-retry',
    screenshot:'only-on-failure',
    video:'retain-on-failure'
  }
});
