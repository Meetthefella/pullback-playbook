(function(){
  function scoreForView(view){
    const safeScore = Number(view && view.score);
    if(Number.isFinite(safeScore)) return safeScore;
    const fallbackScore = Number(view && view.setupScore);
    if(Number.isFinite(fallbackScore)) return fallbackScore;
    return 0;
  }

  function rrForView(view){
    const rr = Number(view && view.actionableRrValue);
    if(Number.isFinite(rr)) return rr;
    const fallbackRr = Number(view && view.rrValue);
    return Number.isFinite(fallbackRr) ? fallbackRr : -999;
  }

  function sortScannerViews(views){
    return (Array.isArray(views) ? views.slice() : []).sort((a, b) =>
      Number(a && a.scanPresentation && a.scanPresentation.sortPriority || 999) - Number(b && b.scanPresentation && b.scanPresentation.sortPriority || 999)
      || scoreForView(b) - scoreForView(a)
      || rrForView(b) - rrForView(a)
      || String(a && a.ticker || '').localeCompare(String(b && b.ticker || ''))
    );
  }

  function groupScannerViewsBySection(finalViews, deps){
    const {rankedVisibleSectionForView} = deps;
    const grouped = {unavailable:[], tradeableEntry:[], nearEntry:[], monitorWatch:[], monitorDiminishing:[], avoid:[]};
    (Array.isArray(finalViews) ? finalViews : []).forEach(view => {
      const sectionKey = rankedVisibleSectionForView(view);
      if(sectionKey === 'unavailable') grouped.unavailable.push(view);
      else if(sectionKey === 'tradeable_entry') grouped.tradeableEntry.push(view);
      else if(sectionKey === 'near_entry') grouped.nearEntry.push(view);
      else if(sectionKey === 'monitor_watch') grouped.monitorWatch.push(view);
      else if(sectionKey === 'monitor_diminishing') grouped.monitorDiminishing.push(view);
      else grouped.avoid.push(view);
    });
    grouped.unavailable = sortScannerViews(grouped.unavailable);
    grouped.tradeableEntry = sortScannerViews(grouped.tradeableEntry);
    grouped.nearEntry = sortScannerViews(grouped.nearEntry);
    grouped.monitorWatch = sortScannerViews(grouped.monitorWatch);
    grouped.monitorDiminishing = sortScannerViews(grouped.monitorDiminishing);
    grouped.avoid = sortScannerViews(grouped.avoid);
    return grouped;
  }

  function contextualResultEmptyState(bucket, deps){
    const {state} = deps;
    const market = String(state.marketStatus || '').trim() || 'Market not set';
    if(bucket === 'tradeable_entry'){
      return /below 50 ma/i.test(market) ? 'Market not supportive' : 'No Entry Setups';
    }
    if(bucket === 'near_entry_monitor'){
      return 'No setups need confirmation';
    }
    if(bucket === 'monitor_diminishing'){
      return 'No weakening watch setups';
    }
    return 'No avoid setups';
  }

  function scannerResultSections(finalViews, deps){
    const grouped = groupScannerViewsBySection(finalViews, deps);
    const unavailable = grouped.unavailable;
    const tradeable = grouped.tradeableEntry;
    const nearEntry = grouped.nearEntry;
    const monitorWatch = grouped.monitorWatch;
    const monitorDiminishing = grouped.monitorDiminishing;
    const avoid = grouped.avoid;
    return [
      {
        key:'unavailable',
        title:'Not assessed',
        summary: unavailable.length ? `${unavailable.length} setup${unavailable.length === 1 ? '' : 's'} awaiting an authoritative refresh` : 'No unassessed setups',
        items:unavailable,
        collapsed:false,
        empty:'No unassessed setups.'
      },
      {
        key:'tradeable-entry',
        title:'Tradeable / Entry',
        summary: tradeable.length
          ? `${tradeable.length} entry-ready setup${tradeable.length === 1 ? '' : 's'}`
          : 'No Entry Setups',
        items:tradeable,
        collapsed:false,
        empty: contextualResultEmptyState('tradeable_entry', deps)
      },
      {
        key:'near-entry',
        title:'Near Entry',
        summary: nearEntry.length
          ? `${nearEntry.length} setup${nearEntry.length === 1 ? '' : 's'} close to trigger`
          : 'Nothing Near Entry',
        items:nearEntry,
        collapsed:false,
        empty: contextualResultEmptyState('near_entry_monitor', deps)
      },
      {
        key:'monitor-watch',
        title:'Monitor / Watch',
        summary: monitorWatch.length
          ? `${monitorWatch.length} review candidate${monitorWatch.length === 1 ? '' : 's'} worth monitoring`
          : 'Nothing To Monitor',
        items:monitorWatch,
        collapsed:false,
        empty: 'No watch candidates right now.'
      },
      {
        key:'monitor-diminishing',
        title:'Diminishing Watch',
        summary: monitorDiminishing.length
          ? `${monitorDiminishing.length} weakening watch setup${monitorDiminishing.length === 1 ? '' : 's'}`
          : 'No Diminishing Watch Setups',
        items:monitorDiminishing,
        collapsed:false,
        empty: contextualResultEmptyState('monitor_diminishing', deps)
      },
      {
        key:'avoid',
        title:'Avoid',
        summary: avoid.length
          ? `${avoid.length} avoid setup${avoid.length === 1 ? '' : 's'}`
          : 'No Avoid Setups',
        items:avoid,
        collapsed:false,
        empty: contextualResultEmptyState('avoid', deps)
      }
    ];
  }

  function buildScannerSectionShell(section, deps){
    const {escapeHtml, documentRef} = deps;
    const wrap = documentRef.createElement(section.collapsed ? 'details' : 'div');
    wrap.className = `resultsgroup resultsgroup--${section.key}`;
    if(section.collapsed){
      wrap.innerHTML = `<summary class="summary"><strong>${escapeHtml(section.title)}</strong><div class="tiny">${escapeHtml(section.summary)}</div></summary><div class="list"></div>`;
    }else{
      wrap.innerHTML = `<div class="summary resultsgroup__summary"><strong>${escapeHtml(section.title)}</strong><div class="tiny">${escapeHtml(section.summary)}</div></div><div class="list"></div>`;
    }
    return wrap;
  }

  window.ScannerResultsSupport = {
    groupScannerViewsBySection,
    contextualResultEmptyState,
    scannerResultSections,
    buildScannerSectionShell
  };
})();
