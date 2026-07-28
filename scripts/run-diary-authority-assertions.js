const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const sandbox = {console, window:null};
sandbox.window = sandbox;
vm.createContext(sandbox);
for(const relative of ['js/domain/diary-schema.js', 'js/services/diary-service.js']){
  vm.runInContext(fs.readFileSync(path.join(root, relative), 'utf8'), sandbox, {filename:relative});
}

const assert = (condition, message) => {
  if(!condition) throw new Error(message);
};
const clone = value => JSON.parse(JSON.stringify(value));
const normalizeTicker = value => String(value || '').trim().toUpperCase();
const normalizeImportedStatus = value => {
  const key = String(value || '').trim().toLowerCase();
  return ({watch:'Watch', 'near entry':'Near Entry', near_entry:'Near Entry', entry:'Entry', avoid:'Avoid'})[key] || 'Watch';
};
const schema = sandbox.DiarySchema.createDiarySchema({
  normalizeTicker,
  normalizeImportedStatus,
  normalizeScanType:value => String(value || '').trim(),
  numericOrNull:value => Number.isFinite(Number(value)) ? Number(value) : null,
  todayIsoDate:() => '2026-07-28',
  countTradingDaysBetween:() => 1,
  isClosedOutcome:value => ['Win', 'Loss', 'Scratch', 'Cancelled'].includes(String(value || ''))
});
sandbox.__ppDiarySchema = schema;

const records = {};
const ensure = ticker => {
  const symbol = normalizeTicker(ticker);
  if(!records[symbol]) records[symbol] = {ticker:symbol, diary:{records:[], diaryIds:[], hasDiary:false}};
  return records[symbol];
};
const service = sandbox.DiaryService.createDiaryService({
  allTickerRecords:() => Object.values(records),
  upsertTickerRecord:ensure,
  mergeDiaryRecordIntoRecord:(record, trade) => {
    const index = record.diary.records.findIndex(item => item.id === trade.id);
    if(index >= 0) record.diary.records.splice(index, 1, trade);
    else record.diary.records.push(trade);
    record.diary.diaryIds = record.diary.records.map(item => item.id);
    record.diary.hasDiary = true;
  },
  commitTickerState:() => {},
  normalizeTicker,
  normalizeImportedStatus,
  todayIsoDate:() => '2026-07-28',
  isClosedOutcome:value => ['Win', 'Loss', 'Scratch', 'Cancelled'].includes(String(value || ''))
});

const canonicalPlan = {
  state:'valid',
  levels:{
    entry:{value:100, valueState:'present', currency:'GBP', source:'canonical'},
    stop:{value:95, valueState:'present', currency:'GBP', source:'canonical'},
    firstTarget:{value:112, valueState:'present', currency:'GBP', source:'canonical'}
  },
  rewardRisk:{resolvedRr:2.4, valueState:'present', source:'canonical'},
  risk:{riskPerShare:5, positionSize:8, maximumLoss:40, exposure:800, currency:'GBP'},
  visibility:{mayShowPlan:true},
  provenance:{evidenceId:'evidence-entry', resolverVersion:'resolver-v1'}
};
const snapshot = {
  publicationStatus:'valid', canonicalNormVersion:'canonical-norm-v1.1',
  canonicalResultVersion:'canonical-result-v1', evidenceId:'evidence-entry',
  timestamp:'2026-07-28T09:00:00.000Z', verdict:'entry',
  eligibility:{entry:{qualified:true}, nearEntry:{qualified:false, state:'superseded_by_entry'}},
  actionable:true, semantics:{structure:'intact', support:'held', pullback:'valid', buyerControl:'confirmed', followThrough:'confirmed'},
  blocker:{code:'', category:''}, plan:canonicalPlan, validation:{status:'valid'}
};
const created = service.saveTradeRecordForTicker('HWM', schema.createTradeRecord({
  ticker:'HWM', decisionSnapshotAtTime:snapshot, notes:'original note'
}));
assert(created.decisionSnapshotAtTime.evidenceId === 'evidence-entry', 'creation must retain canonical evidence ID');
assert(created.plannedEntry === '100' && created.plannedRR === '2.4', 'legacy plan aliases must derive from the archived plan');
assert(created.executionRecord.currency === 'GBP', 'execution record must preserve canonical currency metadata');

const original = clone(created.decisionSnapshotAtTime);
for(const [field, value] of [
  ['actualEntry', '100.4'], ['actualExit', '111'], ['outcome', 'Win'], ['notes', 'edited note'],
  ['setupTags', 'first pullback, clean'], ['beforeImage', 'image-ref'], ['verdict', 'Avoid'],
  ['plannedEntry', '1'], ['decisionSnapshotAtTime', {verdict:'avoid'}]
]){
  const updated = service.updateTradeField(created.id, field, value);
  assert(JSON.stringify(updated.decisionSnapshotAtTime) === JSON.stringify(original), `update ${field} must not mutate decisionSnapshotAtTime`);
}
const afterUpdates = service.listTrades().find(item => item.id === created.id);
assert(afterUpdates.executionRecord.actualEntry === '100.4' && afterUpdates.laterOutcome.outcome === 'Win', 'execution and outcome must remain separate from decision history');
assert(afterUpdates.verdict === 'Entry' && afterUpdates.plannedEntry === '100', 'protected aliases must remain canonical projections');

const retrospective = service.appendRetrospectiveAnalysis(created.id, {resolverVersion:'resolver-v2', canonicalNormVersion:'canonical-norm-v2', retrospectiveResult:{verdict:'watch'}});
assert(retrospective.retrospectiveAnalysis.length === 1, 'retrospective analysis must append');
assert(retrospective.retrospectiveAnalysis[0].explicitlyRetrospective === true, 'retrospective analysis must be labelled');
assert(JSON.stringify(retrospective.decisionSnapshotAtTime) === JSON.stringify(original), 'retrospective analysis must not overwrite the original snapshot');
const reloaded = service.listTrades().find(item => item.id === created.id);
assert(JSON.stringify(reloaded.decisionSnapshotAtTime) === JSON.stringify(original), 'reload must preserve historical decision snapshot exactly');

const failed = service.saveTradeRecordForTicker('FAIL', schema.createTradeRecord({
  ticker:'FAIL', decisionSnapshotAtTime:{publicationStatus:'validation_failed', canonicalNormVersion:'canonical-norm-v1.1', evidenceId:'failed-evidence', verdict:'watch', actionable:true, plan:canonicalPlan, validation:{status:'validation_failed'}}
}));
assert(failed.decisionSnapshotAtTime.actionable === false && failed.decisionSnapshotAtTime.plan === null, 'validation-failed archive cannot expose candidate plan or actionability');

const legacy = schema.normalizeTradeRecord({ticker:'LEGACY', verdict:'Entry'});
assert(legacy.archiveMigration && legacy.archiveMigration.archivalOnly === true, 'legacy archive migration must be explicit and non-authoritative');

const serviceSource = fs.readFileSync(path.join(root, 'js/services/diary-service.js'), 'utf8');
for(const forbidden of ['resolveGlobalVerdict(', 'resolveCanonicalDecision(', 'evaluateRewardRisk(', 'evaluateRiskFit(', 'refreshTrackedTickerState(']){
  assert(!serviceSource.includes(forbidden), `Diary service must not invoke ${forbidden}`);
}
console.log('Diary authority assertions passed (creation, immutability, reload, retrospective, validation-failure, units, and structural isolation).');
