const fs = require('fs');
const path = require('path');

function normalizeTicker(value){
  return String(value || '').trim().toUpperCase();
}

function loadTickerFixture(){
  const envTickers = String(process.env.PP_TICKERS || '').trim();
  if(envTickers){
    return envTickers
      .split(/[,\s]+/)
      .map(normalizeTicker)
      .filter(Boolean);
  }
  const fixturePath = path.join(__dirname, '..', 'fixtures', 'tickers.json');
  const parsed = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  return (Array.isArray(parsed.tickers) ? parsed.tickers : [])
    .map(normalizeTicker)
    .filter(Boolean);
}

module.exports = {
  loadTickerFixture,
  normalizeTicker
};
