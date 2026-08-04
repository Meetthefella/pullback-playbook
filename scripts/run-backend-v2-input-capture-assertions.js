const assert = require('assert');
require('../js/backend-v2/input-capture.js');

const capture = global.BackendV2InputCapture.captureForRecord({
  ticker:'CAT',
  marketData:{asOf:'2026-08-03T15:30:00Z', price:330, ma20:326, ma50:320, ma200:290, currency:'USD', source:'test', history:Array.from({length:200}, (_, index) => ({date:`2026-01-${index + 1}`}))},
  review:{chartRef:{dataUrl:'data:image/png;base64,abc'}, chartImageOriginal:{imageId:'chart-1', name:'chart.png', type:'image/png', bytes:42, width:100, height:80, uploadedAt:'2026-08-03T15:29:00Z', source:'file_upload', dataUrlField:'chartRef.dataUrl'}}
}, {source:'assertion', collectedAt:'2026-08-03T15:31:00Z'});
assert.equal(capture.readyForPlaybookReview, true);
assert.equal(capture.chart.hasOriginalBytes, true);
assert.equal(capture.market.historyPoints, 200);
const incomplete = global.BackendV2InputCapture.captureForRecord({ticker:'CAT', marketData:{}, review:{}});
assert.equal(incomplete.readyForPlaybookReview, false);
assert.ok(incomplete.missing.includes('original chart image'));
console.log('backend-v2 input capture assertions passed');
