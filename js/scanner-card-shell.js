(function(){
  function scanBadgeClassForPresentation(presentation, fallbackClassName){
    const safePresentation = presentation && typeof presentation === 'object' ? presentation : {};
    const bucket = String(safePresentation.presentationBucket || safePresentation.visualBucket || '').trim().toLowerCase();
    if(bucket === 'entry') return 'ready';
    if(bucket === 'near_entry') return 'near';
    if(bucket === 'avoid') return 'avoid';
    return String(fallbackClassName || 'watch').trim() || 'watch';
  }

  function classNameWithProjectedTone(className, presentation, diagnostics = null){
    const safe = presentation && typeof presentation === 'object' ? presentation : {};
    const tone = String(safe.tone || '').trim().toLowerCase();
    const status = String(safe.resolvedStatus || safe.canonicalVerdict || '').trim().toLowerCase();
    if(!tone || !status) return String(className || '');
    const originalTokens = String(className || '').split(/\s+/).filter(Boolean);
    const previousAccentClass = originalTokens.find(token => /^card--(watch|monitor|near-entry|near_entry|entry|avoid)$/i.test(token)) || '';
    const previousVisualTone = originalTokens.find(token => /^visual-tone-(watch|monitor|near_entry|entry|avoid)$/i.test(token)) || '';
    const previousVisualState = originalTokens.find(token => /^visual-state-(watch|monitor|near_entry|entry|avoid)$/i.test(token)) || '';
    const accentTone = tone === 'near_entry' ? 'near-entry' : tone;
    const projectedAccentClass = `card--${accentTone}`;
    const projectedVisualTone = `visual-tone-${tone}`;
    const projectedVisualState = `visual-state-${status}`;
    const tokens = originalTokens.filter(token => !/^(?:visual-(?:tone|state)-(watch|monitor|near_entry|entry|avoid)|card--(?:watch|monitor|near-entry|near_entry|entry|avoid))$/i.test(token));
    tokens.push(projectedVisualTone, projectedVisualState, projectedAccentClass);
    const finalClassName = [...new Set(tokens)].join(' ');
    if(diagnostics && typeof diagnostics === 'object'){
      Object.assign(diagnostics, {previousAccentClass, projectedAccentClass, previousVisualTone, projectedVisualTone, previousVisualState, projectedVisualState, finalClassName});
    }
    return finalClassName;
  }

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
      primaryShortlistStatusChip,
      globalVerdictLabel,
      resolveVisualState,
      resolveGlobalVisualState,
      scanCardPrimaryActionLabel,
      renderScanCardSecondaryUi,
      currentScanCardMenuState,
      escapeHtml
    } = deps;
    const item = view.item;
    const statusChip = primaryShortlistStatusChip(view);
    const visualState = (resolveVisualState || resolveGlobalVisualState)(item, 'scanner', {
      displayedPlan:view && view.displayedPlan,
      derivedStates:view && view.setupStates,
      pendingResolution:!!(view && view.resolutionPending),
      setupScore:view && view.setupScore
    });
    const scanPresentation = view && view.scanPresentation && typeof view.scanPresentation === 'object'
      ? view.scanPresentation
      : null;
    const projectionClassDiagnostics = {};
    const renderedVisualState = scanPresentation ? {
      ...visualState,
      finalVerdict:scanPresentation.canonicalVerdict || visualState.finalVerdict,
      visual_tone:scanPresentation.tone || visualState.visual_tone,
      state:scanPresentation.resolvedStatus || scanPresentation.canonicalVerdict || visualState.state,
      className:classNameWithProjectedTone(visualState.className || visualState.toneClass, scanPresentation, projectionClassDiagnostics)
    } : visualState;
    if(scanPresentation && view && typeof view === 'object') view.projectionClassDiagnostics = projectionClassDiagnostics;
    const sourceVerdict = globalVerdictLabel(renderedVisualState.finalVerdict || renderedVisualState.final_verdict);
    const scoreLabel = view.setupScoreDisplay;
    const resolvedBadge = scanPresentation && String(scanPresentation.badgeLabel || '').trim()
      ? {
        text:String(scanPresentation.badgeLabel || '').trim(),
        className:scanBadgeClassForPresentation(scanPresentation, statusChip.className)
      }
      : (visualState.badge || statusChip);
    const companyLine = [item.meta.companyName || '', item.meta.exchange || ''].filter(Boolean).join(' | ');
    const summary = renderedVisualState.decision_summary || scanCardPrimaryActionLabel(view);
    const secondaryUiMarkup = renderScanCardSecondaryUi(view);
    const menuState = currentScanCardMenuState(item.ticker);
    return `<div class="resultcompact result-card result-feed-card scan-card ${escapeHtml(renderedVisualState.className || renderedVisualState.toneClass || '')}" style="${escapeHtml(renderedVisualState.styleAttr || '')}" data-visual-tone="${escapeHtml(renderedVisualState.visual_tone || '')}" data-visual-state="${escapeHtml(renderedVisualState.state || '')}" data-projection-class-debug="${escapeHtml(JSON.stringify(projectionClassDiagnostics))}" data-ticker="${escapeHtml(item.ticker)}" data-source-verdict="${escapeHtml(sourceVerdict)}"><div class="resultcompacthead"><div class="resultidentity"><div class="ticker">${escapeHtml(item.ticker)}</div><div class="badge-score-row result-feed-card__status"><span class="badge state-pill ${escapeHtml(resolvedBadge.className || statusChip.className)}">${escapeHtml(resolvedBadge.text || resolvedBadge.label || statusChip.label)}</span><span class="score visual-score">${escapeHtml(scoreLabel)}</span></div>${companyLine ? `<div class="tiny resultsupport">${escapeHtml(companyLine)}</div>` : ''}</div></div><div class="resultsummary"><div class="resultreason decision-summary">${escapeHtml(summary)}</div></div><button class="card-overflow-button no-card-click" type="button" data-act="overflow-toggle" aria-label="Open card actions" aria-expanded="${menuState.menuOpen ? 'true' : 'false'}"><span class="dot"></span><span class="dot"></span><span class="dot"></span></button>${secondaryUiMarkup}</div>`;
  }

  function scanCardSummaryForView(view, deps){
    const {
      analysisDerivedStatesFromRecord,
      shortlistStructureBadgeForView,
      buyerControlLabelForDerivedStates
    } = deps;
    const item = view.item;
    const derived = view.setupStates || analysisDerivedStatesFromRecord(item);
    const structureBadge = shortlistStructureBadgeForView(view);
    let primary = '';
    let secondary = '';
    if(structureBadge && structureBadge.label){
      primary = structureBadge.label === 'Developing'
        ? 'Developing - still forming'
        : `${structureBadge.label} structure`;
    }else if(String(derived.trendState || '').toLowerCase() === 'strong'){
      primary = 'Strong structure';
    }else{
      primary = 'Developing structure';
    }
    if(item.setup.marketCaution){
      secondary = 'Weak market';
    }else if(typeof buyerControlLabelForDerivedStates === 'function'){
      secondary = buyerControlLabelForDerivedStates(derived, {noneLabel:'No buyer control yet'});
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
    classNameWithProjectedTone,
    getScannerSubmenuContent,
    renderCompactResultCardFromView,
    scanCardSummaryForView,
    scanCardPrimaryActionLabel
  };
})();
