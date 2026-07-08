const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const recordsSource = fs.readFileSync(path.join(root, 'js/records.js'), 'utf8');

function extractFunctionSource(source, functionName){
  const start = source.indexOf(`function ${functionName}`);
  if(start < 0) throw new Error(`Unable to find function ${functionName}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for(let index = bodyStart; index < source.length; index += 1){
    const char = source[index];
    if(char === '{') depth += 1;
    if(char === '}'){
      depth -= 1;
      if(depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Unable to extract function ${functionName}`);
}

function run(){
  assert.ok(
    recordsSource.includes('function normalizeTickerRecordForPersistence(record, deps)'),
    'records.js must expose normalizeTickerRecordForPersistence'
  );
  assert.ok(
    recordsSource.includes("return normalizeTickerRecordInternal(record, deps, { readOnly:false });"),
    'write-capable normalization must route through normalizeTickerRecordInternal(..., {readOnly:false})'
  );
  assert.ok(
    recordsSource.includes("return normalizeTickerRecordInternal(record, deps, { readOnly:true });"),
    'read-only normalization must route through normalizeTickerRecordInternal(..., {readOnly:true})'
  );

  const reviewStateHealth = extractFunctionSource(appSource, 'currentReviewStateHealthSnapshot');
  assert.ok(
    reviewStateHealth.includes('normalizeTickerRecordReadOnly(sourceRecord)'),
    'currentReviewStateHealthSnapshot must normalize through the read-only path'
  );
  assert.ok(
    !reviewStateHealth.includes('normalizeTickerRecord(record || {})'),
    'currentReviewStateHealthSnapshot must not use write-capable normalization'
  );

  assert.ok(
    appSource.includes("function watchlistLifecycleSnapshot(record, options = {}){\r\n  const item = normalizeTickerRecordReadOnly(record);")
      || appSource.includes("function watchlistLifecycleSnapshot(record, options = {}){\n  const item = normalizeTickerRecordReadOnly(record);"),
    'watchlistLifecycleSnapshot must normalize through the read-only path'
  );

  assert.ok(
    appSource.includes("function buildFinalStatePassCacheKey(record, options = {}){\r\n  const item = normalizeTickerRecordReadOnly(record || {});")
      || appSource.includes("function buildFinalStatePassCacheKey(record, options = {}){\n  const item = normalizeTickerRecordReadOnly(record || {});"),
    'buildFinalStatePassCacheKey must normalize through the read-only path'
  );

  [
    'writeLifecycleState',
    'writeSavedReviewAuthority',
    'writeSubmittedPaperTradeState',
    'normalizeTickerRecordForPersistence',
    'normalizeDetachedTickerRecord'
  ].forEach(name => {
    assert.ok(appSource.includes(`function ${name}(`), `app.js must define ${name}`);
  });

  assert.ok(
    appSource.includes('writeSavedReviewAuthority(record, {'),
    'persistActiveReviewDraft manual save must write review authority through writeSavedReviewAuthority'
  );

  assert.ok(
    appSource.includes('writeSavedReviewAuthority(record, {'),
    'mergeLegacyCardIntoRecord must write saved review authority through writeSavedReviewAuthority'
  );
  assert.ok(
    appSource.includes('writeLifecycleState(record, {'),
    'mergeLegacyCardIntoRecord lifecycle writes must route through writeLifecycleState'
  );

  assert.ok(
    appSource.includes('writeSubmittedPaperTradeState(liveRecord, {'),
    'submitPaperTradeFromReview must route submitted plan persistence through writeSubmittedPaperTradeState'
  );

  assert.ok(
    appSource.includes('writeSavedReviewAuthority(item, {savedProjectionSnapshot:null}'),
    'clearPersistedReviewProjectionState must clear saved projection through writeSavedReviewAuthority'
  );

  assert.ok(
    appSource.includes('writeSavedReviewAuthority(item, {savedProjectionSnapshot:nextSnapshot}'),
    'persistReviewProjectionSnapshotOnRecord must persist projection through writeSavedReviewAuthority'
  );

  console.log('run-normalization-read-write-assertions: ok');
}

run();
