# Browser asset versioning rule

If a browser-loaded JavaScript module changes, update its `?v=` query in `index.html` in the same commit and add that exact versioned URL to `VERSIONED_RELEASE_MODULES` in `service-worker.js`.

All modules changed for a release must use the `APP_VERSION` release number. Run `node scripts/run-browser-asset-version-assertions.js` before shipping.
