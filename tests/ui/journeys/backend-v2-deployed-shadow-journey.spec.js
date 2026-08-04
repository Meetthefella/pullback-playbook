const {test, expect} = require('@playwright/test');
const crypto = require('crypto');
const fs = require('fs');

const baseUrl = String(process.env.PP_BASE_URL || '').trim().replace(/\/$/, '');
if(!baseUrl) throw new Error('PP_BASE_URL is required for the deployed backend-v2 shadow journey. No local server is permitted.');

test.use({baseURL:baseUrl, storageState:undefined});

function sha256(value){ return crypto.createHash('sha256').update(value).digest('hex'); }
function changedAsOf(asOf){
  const configured = String(process.env.PP_JOURNEY_CHANGED_AS_OF || '').trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(configured)) return configured;
  const date = new Date(`${asOf}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 14);
  return date.toISOString().slice(0, 10);
}
function assertNoApplicationInternalCalls(){
  const source = fs.readFileSync(__filename, 'utf8');
  const prohibited = [
    /\bpage\.evaluate\s*\(/,
    /\b(resolveGlobalVerdict|publishCanonicalPublicationForRecord|canonicalPublicationForRecord|captureBackendV2Input|BackendV2\.[A-Za-z]+|BackendV2LegacyAdapter\.[A-Za-z]+)\s*\(/
  ];
  for(const expression of prohibited){
    if(expression.test(source)) throw new Error(`Journey test structurally calls application internals: ${expression}`);
  }
}
function packetEndpoint(ticker, asOf, variant = 'base'){
  const query = new URLSearchParams({ticker, asOf});
  if(variant !== 'base') query.set('chartVariant', variant);
  return `${baseUrl}/.netlify/functions/live-input-journey?${query.toString()}`;
}
async function requestPacket(request, ticker, asOf, variant = 'base'){
  const response = await request.get(packetEndpoint(ticker, asOf, variant));
  expect(response.ok()).toBeTruthy();
  const packet = await response.json();
  expect(packet.ok).toBe(true);
  expect(packet.ticker).toBe(ticker);
  expect(packet.asOf).toBe(asOf);
  expect(packet.bars).toHaveLength(200);
  expect(packet.bars.every((bar, index) => index === 0 || packet.bars[index - 1].date >= bar.date)).toBe(true);
  expect(packet.barsHash).toBe(sha256(Buffer.from(JSON.stringify(packet.bars))));
  expect(packet.chartHash).toBe(sha256(Buffer.from(packet.chartPngBase64, 'base64')));
  expect(packet.marketPacket.history).toHaveLength(200);
  expect(packet.marketPacket.history).toEqual(packet.bars);
  expect(packet.marketPacket.currency).toBeTruthy();
  expect(packet.marketPacket.quoteUnits).toBe(packet.marketPacket.currency);
  expect(packet.marketPacket.price).toBeTruthy();
  return packet;
}
async function diagnostics(page){
  const raw = await page.locator('#backendV2JourneyDiagnostics').textContent();
  return JSON.parse(String(raw || ''));
}
async function uploadPng(page, ticker, asOf, packet, label){
  const png = Buffer.from(packet.chartPngBase64, 'base64');
  await page.locator('#reviewChartFile').setInputFiles({name:`${ticker}-${asOf}-${label}.png`, mimeType:'image/png', buffer:png});
  const preview = page.locator('#reviewWorkspace img[alt^="Chart preview"]');
  await expect(preview).toBeVisible({timeout:30000});
  const src = await preview.getAttribute('src');
  expect(src).toMatch(/^data:image\/png;base64,/);
  return sha256(Buffer.from(String(src).split(',', 2)[1], 'base64'));
}
async function importPacketThroughUi(page, ticker, asOf, packet){
  await page.locator('#backendV2JourneyTicker').fill(ticker);
  await page.locator('#backendV2JourneyAsOf').fill(asOf);
  await page.locator('#backendV2JourneyLoadBtn').click();
  await expect(page.locator('#backendV2JourneyStatus')).toContainText(packet.runId, {timeout:30000});
  await expect(page.locator('#reviewWorkspace')).toContainText('No chart attached yet');
  await expect(page.locator('#reviewWorkspace img[alt^="Chart preview"]')).toHaveCount(0);
  const result = await diagnostics(page);
  expect(result.runId).toBe(packet.runId);
  expect(result.barHash).toBe(packet.barsHash);
  expect(result.pngHash).toBe(packet.chartHash);
  expect(result.bars).toBe(200);
  expect(result.firstDate).toBe(packet.bars[199].date);
  expect(result.lastDate).toBe(packet.bars[0].date);
  expect(result.currency).toBe(packet.marketPacket.currency);
  expect(result.quoteUnits).toBe(packet.marketPacket.quoteUnits);
  expect(result.publicationId).toBeTruthy();
  expect(result.snapshotId).toBeTruthy();
  expect(result.shadowAssessmentId).toBeTruthy();
  expect(result.shadowSourcePublicationId).toBe(result.publicationId);
  expect(result.retrievedPublicationId).toBe(result.publicationId);
  expect(await page.locator('#reviewWorkspace').getAttribute('data-rendered-publication-id')).toBe(result.publicationId);
  return result;
}

test('deployed Review journey links a paired market publication, retained PNG, and observational shadow assessment', async ({page, request}) => {
  assertNoApplicationInternalCalls();
  const ticker = String(process.env.PP_JOURNEY_TICKER || 'CAT').toUpperCase();
  const asOf = String(process.env.PP_JOURNEY_AS_OF || '').trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error('PP_JOURNEY_AS_OF (YYYY-MM-DD) is required.');

  const basePacket = await requestPacket(request, ticker, asOf);
  await page.goto(baseUrl, {waitUntil:'domcontentloaded'});
  const baseBeforeUpload = await importPacketThroughUi(page, ticker, asOf, basePacket);

  const retainedBaseHash = await uploadPng(page, ticker, asOf, basePacket, 'base');
  let result = await diagnostics(page);
  expect(retainedBaseHash).toBe(basePacket.chartHash);
  expect(result.reviewImageHash).toBe(basePacket.chartHash);
  expect(result.reviewImageMatchesJourneyPng).toBe(true);
  expect(result.publicationIdAfterImageUpload).toBe(baseBeforeUpload.publicationId);
  expect(result.publicationUnchangedAfterImageUpload).toBe(true);
  expect(await page.locator('#reviewWorkspace').getAttribute('data-rendered-publication-id')).toBe(baseBeforeUpload.publicationId);

  const alternatePacket = await requestPacket(request, ticker, asOf, 'alternate');
  expect(alternatePacket.runId).toBe(basePacket.runId);
  expect(alternatePacket.barsHash).toBe(basePacket.barsHash);
  expect(alternatePacket.chartHash).not.toBe(basePacket.chartHash);
  const retainedAlternateHash = await uploadPng(page, ticker, asOf, alternatePacket, 'alternate');
  result = await diagnostics(page);
  expect(retainedAlternateHash).toBe(alternatePacket.chartHash);
  expect(result.reviewImageHash).toBe(alternatePacket.chartHash);
  expect(result.reviewImageHash).not.toBe(retainedBaseHash);
  expect(result.reviewImageId).toBeTruthy();
  expect(result.reviewImageMatchesJourneyPng).toBe(false);
  expect(result.barHash).toBe(basePacket.barsHash);
  expect(result.publicationIdAfterImageUpload).toBe(baseBeforeUpload.publicationId);
  expect(result.publicationUnchangedAfterImageUpload).toBe(true);

  const nextAsOf = changedAsOf(asOf);
  const changedPacket = await requestPacket(request, ticker, nextAsOf);
  expect(changedPacket.barsHash).not.toBe(basePacket.barsHash);
  const changedBeforeUpload = await importPacketThroughUi(page, ticker, nextAsOf, changedPacket);
  expect(changedBeforeUpload.snapshotId).not.toBe(baseBeforeUpload.snapshotId);
  expect(changedBeforeUpload.publicationId).not.toBe(baseBeforeUpload.publicationId);
  expect(changedBeforeUpload.shadowAssessmentId).not.toBe(baseBeforeUpload.shadowAssessmentId);
  expect(changedBeforeUpload.reviewImageHash).toBe('');
  expect(await page.locator('#reviewWorkspace').getAttribute('data-rendered-publication-id')).toBe(changedBeforeUpload.publicationId);
});
