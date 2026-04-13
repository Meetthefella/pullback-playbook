(function(){
  function groupScannerViewsBySection(finalViews, deps){
    const {rankedVisibleSectionForView} = deps;
    const grouped = {tradeableEntry:[], nearEntry:[], monitorWatch:[], lowerPriority:[]};
    (Array.isArray(finalViews) ? finalViews : []).forEach(view => {
      const sectionKey = rankedVisibleSectionForView(view);
      if(sectionKey === 'tradeable_entry') grouped.tradeableEntry.push(view);
      else if(sectionKey === 'near_entry') grouped.nearEntry.push(view);
      else if(sectionKey === 'monitor_watch') grouped.monitorWatch.push(view);
      else grouped.lowerPriority.push(view);
    });
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
    return 'No lower-priority setups';
  }

  function scannerResultSections(finalViews, deps){
    const grouped = groupScannerViewsBySection(finalViews, deps);
    const tradeable = grouped.tradeableEntry;
    const nearEntry = grouped.nearEntry;
    const monitorWatch = grouped.monitorWatch;
    const lowerPriority = grouped.lowerPriority;
    return [
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
        key:'lower-priority',
        title:'Low Priority / Avoid',
        summary: lowerPriority.length
          ? `${lowerPriority.length} low-priority setup${lowerPriority.length === 1 ? '' : 's'}`
          : 'No Lower-Priority Setups',
        items:lowerPriority,
        collapsed:false,
        empty: contextualResultEmptyState('lower_priority', deps)
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
