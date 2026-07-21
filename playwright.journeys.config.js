const {defineConfig} = require('@playwright/test');

const baseURL = process.env.PP_BASE_URL || 'http://127.0.0.1:4173';
const reuseExistingServer = process.env.PP_REUSE_EXISTING_SERVER === 'true';
const disableManagedWebServer = process.env.PP_DISABLE_WEBSERVER === 'true';
const gracefulShutdownSignal = process.platform === 'win32' ? 'SIGINT' : 'SIGTERM';

// Browser journeys navigate through the HTTP app origin and therefore own the
// static-server lifecycle (or accept the fresh-port runner's external server).
module.exports = defineConfig({
  testDir:'./tests/ui/journeys',
  timeout:120000,
  expect:{timeout:10000},
  fullyParallel:false,
  retries:0,
  reporter:[
    ['list'],
    ['html', {open:'never', outputFolder:'playwright-report'}]
  ],
  webServer:disableManagedWebServer ? undefined : {
    command:'node scripts/playwright-static-server.js',
    url:baseURL,
    reuseExistingServer,
    timeout:30000,
    gracefulShutdown:{
      signal:gracefulShutdownSignal,
      timeout:1000
    }
  },
  use:{
    baseURL,
    headless:true,
    trace:'on-first-retry',
    screenshot:'only-on-failure',
    video:'retain-on-failure'
  }
});
