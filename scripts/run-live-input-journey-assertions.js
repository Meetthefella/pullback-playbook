const assert = require('assert');
const journey = require('../netlify/functions/live-input-journey');

async function main(){
  assert.equal(journey.__test.JOURNEY_PROVIDER_ID, 'fmp');
  assert.equal(journey.__test.supportsJourneyProvider('fmp'), true);
  assert.equal(journey.__test.supportsJourneyProvider('marketdata'), false);
  const response = await journey.handler({
    httpMethod:'GET',
    queryStringParameters:{ticker:'CAT', asOf:'2026-07-31', provider:'marketdata'}
  });
  assert.equal(response.statusCode, 400);
  const body = JSON.parse(response.body);
  assert.equal(body.ok, false);
  assert.match(body.error, /Financial Modeling Prep only/i);
  console.log('live input journey provider assertions passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
