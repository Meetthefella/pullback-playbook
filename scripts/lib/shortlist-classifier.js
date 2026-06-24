function safeNumber(value, digits = 4){
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(digits)) : null;
}

function pctDistance(price, average){
  const safePrice = Number(price);
  const safeAverage = Number(average);
  if(!Number.isFinite(safePrice) || !Number.isFinite(safeAverage) || safeAverage === 0) return null;
  return (safePrice - safeAverage) / safeAverage;
}

function roundPct(value){
  return Number.isFinite(value) ? Number((value * 100).toFixed(2)) : null;
}

function classifyShortlistCandidate(snapshot){
  const price = Number(snapshot.price);
  const sma20 = Number(snapshot.sma20);
  const sma50 = Number(snapshot.sma50);
  const sma200 = Number(snapshot.sma200);
  const rsi14 = Number(snapshot.rsi14);
  const volume = Number(snapshot.volume);
  const avgVolume30 = Number(snapshot.avgVolume30 ?? snapshot.avgVolume30d);

  const above50 = Number.isFinite(price) && Number.isFinite(sma50) ? price >= sma50 : false;
  const above200 = Number.isFinite(price) && Number.isFinite(sma200) ? price >= sma200 : false;
  const ma50gt200 = Number.isFinite(sma50) && Number.isFinite(sma200) ? sma50 >= sma200 : false;
  const distance20 = pctDistance(price, sma20);
  const distance50 = pctDistance(price, sma50);
  const near20 = Number.isFinite(distance20) && Math.abs(distance20) <= 0.03;
  const near50 = Number.isFinite(distance50) && Math.abs(distance50) <= 0.04;
  const extended = Number.isFinite(distance20) && distance20 > 0.08;
  const volumeSupportive = Number.isFinite(volume) && Number.isFinite(avgVolume30) && avgVolume30 > 0
    ? volume >= avgVolume30 * 0.9
    : null;
  const rsiHealthy = Number.isFinite(rsi14) ? rsi14 >= 45 && rsi14 <= 68 : null;

  let score = 0;
  const reasons = [];
  const blockers = [];

  if(above200){
    score += 2;
    reasons.push('price above 200MA');
  }else{
    blockers.push('price below 200MA');
  }
  if(ma50gt200){
    score += 2;
    reasons.push('50MA above 200MA');
  }else{
    blockers.push('50MA below 200MA');
  }
  if(above50){
    score += 1;
    reasons.push('price above 50MA');
  }else{
    blockers.push('price below 50MA');
  }
  if(near20){
    score += 3;
    reasons.push('pullback near 20MA');
  }
  if(near50){
    score += 2;
    reasons.push('pullback near 50MA');
  }
  if(extended){
    score -= 3;
    blockers.push('too extended above 20MA');
  }
  if(volumeSupportive === true){
    score += 1;
    reasons.push('volume roughly supportive');
  }
  if(rsiHealthy === true){
    score += 1;
    reasons.push('RSI in a workable range');
  }else if(rsiHealthy === false){
    blockers.push('RSI not in a clean pullback range');
  }

  let verdict = 'Watch';
  if(blockers.includes('price below 200MA') || blockers.includes('50MA below 200MA')){
    verdict = 'Avoid';
  }else if((near20 || near50) && score >= 7){
    verdict = 'Near Entry';
  }

  return {
    verdict,
    score,
    reasons,
    blockers,
    metrics:{
      price:safeNumber(price),
      sma20:safeNumber(sma20),
      sma50:safeNumber(sma50),
      sma200:safeNumber(sma200),
      distance20Pct:roundPct(distance20),
      distance50Pct:roundPct(distance50),
      rsi14:safeNumber(rsi14, 2),
      volumeRatio:Number.isFinite(volume) && Number.isFinite(avgVolume30) && avgVolume30 > 0
        ? Number((volume / avgVolume30).toFixed(2))
        : null
    }
  };
}

module.exports = {
  classifyShortlistCandidate
};
