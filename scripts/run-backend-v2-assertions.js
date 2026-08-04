const assert = require('assert');
require('../js/backend-v2/canonical-assessment.js');

const {publish, present} = global.BackendV2;
const base = {
  ticker:'HWM', snapshotId:'hwm-2026-08-03', market:{asOf:'2026-08-03T15:30:00Z', price:105, sma20:104, sma50:103, sma200:95, volume:200, averageVolume:150, marketStatus:'above_50ma'},
  setup:{stabilising:true, bounce:true, buyerControl:true, confirmation:true},
  plan:{entry:105, stop:102, target:112}, risk:{version:7, maxLossGbp:40}, createdAt:'2026-08-03T15:31:00Z'
};
const entry = publish(base);
assert.equal(entry.setupState, 'entry');
assert.equal(entry.eligibility.paperTrade, true);
assert.equal(entry.risk.positionSize, 13);
assert.equal(present(entry).verdict, 'Entry');
const unconfirmed = publish({...base, setup:{...base.setup, confirmation:false}});
assert.equal(unconfirmed.setupState, 'near_entry');
assert.equal(unconfirmed.eligibility.paperTrade, false);
const missing = publish({...base, market:{...base.market, asOf:''}});
assert.equal(missing.setupState, 'avoid');
assert.equal(missing.eligibility.entry, false);
const staleRisk = publish({...base, risk:{version:null, maxLossGbp:40}});
assert.equal(staleRisk.setupState, 'entry');
assert.equal(staleRisk.eligibility.paperTrade, false);
const hostileMarket = publish({...base, market:{...base.market, marketStatus:'S&P below 50 MA'}});
assert.equal(hostileMarket.features.marketSupportive.value, false);
assert.equal(hostileMarket.gates.find(gate => gate.code === 'market_context').passed, false);
assert.notEqual(hostileMarket.setupState, 'near_entry');
assert.notEqual(hostileMarket.setupState, 'entry');
console.log('backend-v2 assertions passed');
