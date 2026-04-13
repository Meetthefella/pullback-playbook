(function(){
  function renderScanCardSecondaryUi(view, deps){
    const {
      currentScanCardMenuState,
      getScannerSubmenuContent,
      escapeHtml
    } = deps;
    const ticker = view && view.ticker;
    const menuState = currentScanCardMenuState(ticker);
    if(!menuState.menuOpen) return '';
    if(!menuState.activeSubmenu){
      return `<div class="card-overflow-menu no-card-click is-open" data-role="overflow-menu"><button type="button" data-act="open-details">Details</button><button type="button" data-act="open-trace">Decision Trace</button><button type="button" data-act="open-visual-debug">Visual Debug</button></div>`;
    }
    const submenu = getScannerSubmenuContent(menuState.activeSubmenu, view);
    return `<div class="scan-card-secondary-panel scan-card-submenu-panel no-card-click" data-role="secondary-panel" data-panel-mode="${escapeHtml(menuState.activeSubmenu)}" data-submenu-panel><div class="scan-card-secondary-panel__submenu-header" data-act="submenu-back"><button type="button" class="scan-card-secondary-panel__submenu-back">Back</button><div class="scan-card-secondary-panel__title">${escapeHtml(submenu.title)}</div></div><div class="scan-card-secondary-panel__submenu-body">${submenu.content}</div></div>`;
  }

  function getScannerSubmenuContent(key, view, deps){
    const {
      renderScannerDecisionTraceContent,
      renderScannerVisualDebugContent,
      renderScannerDetailsContent
    } = deps;
    if(key === 'trace'){
      return {title:'Decision Trace', content:renderScannerDecisionTraceContent(view)};
    }
    if(key === 'visual-debug'){
      return {title:'Visual Debug', content:renderScannerVisualDebugContent(view)};
    }
    return {title:'Details', content:renderScannerDetailsContent(view)};
  }

  function renderCompactResultCardFromView(view, deps){
    const {
      resolveGlobalVerdict,
      primaryShortlistStatusChip,
      globalVerdictLabel,
      normalizeAnalysisVerdict,
      resolveGlobalVisualState,
      scanCardSummaryForView,
      scanCardPrimaryActionLabel,
      renderScanCardSecondaryUi,
      currentScanCardMenuState,
      escapeHtml,
      scoreClass
    } = deps;
    const item = view.item;
    const globalVerdict = resolveGlobalVerdict(item);
    const statusChip = primaryShortlistStatusChip(view);
    const sourceVerdict = globalVerdictLabel(globalVerdict.final_verdict);
    const scoreLabel = view.setupScoreDisplay;
    const scannerVisualVerdict = normalizeAnalysisVerdict(
      view && (
        (view.scannerResolution && view.scannerResolution.status)
        || view.displayStage
        || view.finalVerdict
        || ''
      )
    );
    const globalVisual = resolveGlobalVisualState(item, 'scanner', {
      structuralState:statusChip.primaryState,
      tradeability:scannerVisualVerdict,
      structure:view && view.setupStates && view.setupStates.structureQuality,
      bounce:view && view.setupStates && view.setupStates.bounceState,
      setupScore:view && view.setupScore
    });
    const companyLine = [item.meta.companyName || '', item.meta.exchange || ''].filter(Boolean).join(' | ');
    const summary = globalVerdict.decision_summary || scanCardPrimaryActionLabel(view);
    const secondaryUiMarkup = renderScanCardSecondaryUi(view);
    const menuState = currentScanCardMenuState(item.ticker);
    return `<div class="resultcompact result-card result-feed-card scan-card ${escapeHtml(globalVisual.toneClass)}" data-ticker="${escapeHtml(item.ticker)}" data-source-verdict="${escapeHtml(sourceVerdict)}"><div class="resultcompacthead"><div class="resultidentity"><div class="ticker">${escapeHtml(item.ticker)}</div><div class="badge-score-row result-feed-card__status"><span class="badge state-pill ${statusChip.className}">${escapeHtml(statusChip.label)}</span><span class="score ${scoreClass(view.setupScore || 0)}">${escapeHtml(scoreLabel)}</span></div>${companyLine ? `<div class="tiny resultsupport">${escapeHtml(companyLine)}</div>` : ''}</div></div><div class="resultsummary"><div class="resultreason">${escapeHtml(summary)}</div></div><button class="card-overflow-button no-card-click" type="button" data-act="overflow-toggle" aria-label="Open card actions" aria-expanded="${menuState.menuOpen ? 'true' : 'false'}"><span class="dot"></span><span class="dot"></span><span class="dot"></span></button>${secondaryUiMarkup}</div>`;
  }

  function scanCardSummaryForView(view, deps){
    const {
      analysisDerivedStatesFromRecord,
      shortlistStructureBadgeForView
    } = deps;
    const item = view.item;
    const derived = view.setupStates || analysisDerivedStatesFromRecord(item);
    const structureBadge = shortlistStructureBadgeForView(view);
    let primary = '';
    let secondary = '';
    if(structureBadge && structureBadge.label){
      primary = `${structureBadge.label} structure`;
    }else if(String(derived.trendState || '').toLowerCase() === 'strong'){
      primary = 'Strong structure';
    }else{
      primary = 'Developing structure';
    }
    if(item.setup.marketCaution){
      secondary = 'Weak market';
    }else if(String(derived.bounceState || '').toLowerCase() === 'confirmed'){
      secondary = 'Bounce confirmed';
    }else if(String(derived.bounceState || '').toLowerCase() === 'attempt'){
      secondary = 'Bounce tentative';
    }else if(String(derived.bounceState || '').toLowerCase() === 'none'){
      secondary = 'Weak bounce';
    }
    return {
      primary,
      secondary
    };
  }

  function scanCardPrimaryActionLabel(view, deps){
    const {
      resolveGlobalVerdict,
      getActions
    } = deps;
    const item = view && view.item ? view.item : view;
    return getActions(resolveGlobalVerdict(item).final_verdict).label;
  }

  window.ScannerCardShell = {
    renderScanCardSecondaryUi,
    getScannerSubmenuContent,
    renderCompactResultCardFromView,
    scanCardSummaryForView,
    scanCardPrimaryActionLabel
  };
})();
