const assert = require('assert');
const fs = require('fs');

const index = fs.readFileSync('index.html', 'utf8');
const app = fs.readFileSync('app.js', 'utf8');
const serviceWorker = fs.readFileSync('service-worker.js', 'utf8');
const match = app.match(/const APP_VERSION = 'v([^']+)'/);
assert(match, 'app.js must declare APP_VERSION.');
const version = match[1];
assert(!index.includes('?v=4.5.3'), 'index.html must not retain previous v4.5.3 browser asset URLs for this release.');
const releaseModules = [
  './js/domain/canonical-resolver-input.js',
  './js/domain/canonical-setup-projection.js',
  './js/resolver-core.js',
  './js/domain/simplified-trade-state.js',
  './js/scanner-card-shell.js',
  './app.js'
];

releaseModules.forEach(modulePath => {
  assert(
    index.includes(`src="${modulePath}?v=${version}"`),
    `${modulePath} must use the current release cache-busting query (${version}).`
  );
  assert(
    serviceWorker.includes(modulePath.replace(/^\.\//, '')),
    `${modulePath} must be included in the service-worker release precache list.`
  );
});

assert(serviceWorker.includes('const ASSET_VERSION = BUILD_VERSION.replace(/^v/, \'\');'), 'Service worker must derive asset queries from its release version.');
console.log(`Browser asset-version assertions passed for v${version}.`);
