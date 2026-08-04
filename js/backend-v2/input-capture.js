(function(global){
  'use strict';

  const CAPTURE_VERSION = 'backend-v2-input-capture-v1';
  function text(value){ return String(value == null ? '' : value).trim(); }
  function number(value){
    if(value === null || value === undefined || text(value) === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  function freeze(value){
    if(!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(name => freeze(value[name]));
    return Object.freeze(value);
  }
  function fingerprint(value){
    const source = JSON.stringify(value);
    let result = 2166136261;
    for(let index = 0; index < source.length; index += 1){ result ^= source.charCodeAt(index); result = Math.imul(result, 16777619); }
    return `capture-${(result >>> 0).toString(36)}`;
  }

  // Captures source facts only. It deliberately does not derive a setup state,
  // score, plan, or eligibility, so it is safe to run during model discovery.
  function captureForRecord(record, options = {}){
    const item = record && typeof record === 'object' ? record : {};
    const market = item.marketData && typeof item.marketData === 'object' ? item.marketData : {};
    const review = item.review && typeof item.review === 'object' ? item.review : {};
    const chart = review.chartImageOriginal && typeof review.chartImageOriginal === 'object'
      ? review.chartImageOriginal
      : (review.chartRef && typeof review.chartRef === 'object' ? review.chartRef : {});
    const history = Array.isArray(market.history) ? market.history : [];
    const missing = [];
    if(!text(item.ticker || item.symbol)) missing.push('ticker');
    if(!text(market.asOf || market.timestamp)) missing.push('market timestamp');
    if(number(market.price ?? market.currentPrice ?? market.close) === null) missing.push('market price');
    if(history.length < 200) missing.push('200 daily bars');
    if(!text(chart.imageId)) missing.push('original chart image');
    if(!text(chart.type).match(/^image\/(png|jpeg)$/)) missing.push('supported chart image type');
    const collected = {
      schemaVersion:CAPTURE_VERSION,
      captureId:'',
      ticker:text(item.ticker || item.symbol).toUpperCase(),
      collectedAt:text(options.collectedAt || new Date().toISOString()),
      source:text(options.source || 'unknown'),
      chart:freeze({
        imageId:text(chart.imageId), contentHash:text(chart.contentHash), name:text(chart.name), type:text(chart.type), bytes:number(chart.bytes),
        width:number(chart.width), height:number(chart.height), uploadedAt:text(chart.uploadedAt), source:text(chart.source),
        hasOriginalBytes:Boolean(review.chartRef && review.chartRef.dataUrl && review.chartImageOriginal && review.chartImageOriginal.dataUrlField === 'chartRef.dataUrl')
      }),
      market:freeze({
        snapshotId:text(market.snapshotId), asOf:text(market.asOf || market.timestamp), provider:text(market.source || market.dataProvider), currency:text(market.currency).toUpperCase(),
        price:number(market.price ?? market.currentPrice ?? market.close), sma20:number(market.sma20 ?? market.ma20), sma50:number(market.sma50 ?? market.ma50), sma200:number(market.sma200 ?? market.ma200),
        volume:number(market.volume), averageVolume:number(market.averageVolume ?? market.avgVolume ?? market.avgVolume30d), historyPoints:history.length,
        firstBarDate:text(history[history.length - 1] && history[history.length - 1].date), latestBarDate:text(history[0] && history[0].date)
      }),
      readyForPlaybookReview:missing.length === 0,
      missing:freeze(missing)
    };
    collected.captureId = fingerprint({...collected, captureId:''});
    return freeze(collected);
  }

  global.BackendV2InputCapture = Object.freeze({CAPTURE_VERSION, captureForRecord});
})(typeof window !== 'undefined' ? window : globalThis);
