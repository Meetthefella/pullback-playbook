(function(global){
  'use strict';

  const ONBOARDING_SEEN_KEY = 'pullbackPlaybookOnboardingSeen';
  const ONBOARDING_VERSION_KEY = 'pullbackPlaybookOnboardingVersion';
  const ONBOARDING_VERSION = '2026-06-onboarding-v1';
  const OVERLAY_ID = 'onboardingTourOverlay';
  const HELP_BUTTON_ID = 'startOnboardingTourBtn';
  const TARGET_HIGHLIGHT_CLASS = 'onboarding-tour-target';
  const MOBILE_MARGIN = 16;
  const TOOLTIP_MAX_WIDTH = 320;
  const SMALL_TARGET_EDGE = 24;
  const TOOLTIP_TARGET_GAP = 18;
  const TOOLTIP_BOTTOM_BREATHING_ROOM = 24;

  const stepDefinitions = [
    {
      id:'welcome',
      title:'💡 Welcome',
      body:'A quick tour of Scan, Review, Track, and Diary. Nothing in this walkthrough changes your trading data.',
      placement:'center'
    },
    {
      id:'scan-tab',
      title:'💡 Scan',
      body:'This is the starting workspace. Use it to gather tickers and send promising names into Review.',
      targets:['[data-tour="scan-tab"]','[data-tour="scan-workspace"]'],
      beforeStep(){ showWorkspace('scan'); }
    },
    {
      id:'ticker-inputs',
      title:'💡 Add Tickers',
      body:'Use screenshot import, manual search, or a pasted list to build the names you want to check.',
      targets:['[data-tour="ticker-inputs"]']
    },
    {
      id:'run-scan',
      title:'💡 Run Scan',
      body:'Tap this after adding tickers. The app checks for pullback candidates and sends promising names into Review.',
      targets:['[data-tour="run-scan"]']
    },
    {
      id:'review-tab',
      title:'💡 Review',
      body:'Review keeps one active ticker in focus so chart context, verdict, and planning stay together.',
      targets:['[data-tour="review-tab"]','[data-tour="review-workspace"]'],
      beforeStep(){ showWorkspace('review'); }
    },
    {
      id:'verdict-summary',
      title:'💡 Verdict Summary',
      body:'This card shows the current decision state in plain language before you plan or save anything.',
      targets:['[data-tour="verdict-card"]','[data-tour="review-workspace"]']
    },
    {
      id:'trade-plan',
      title:'💡 Trade Plan',
      body:'Entry, stop, target, and capital fit stay here so the plan respects your risk rule.',
      targets:['[data-tour="trade-plan"]','[data-tour="review-workspace"]']
    },
    {
      id:'track-tab',
      title:'💡 Track',
      body:'Track is the live watchlist view for active setups and lifecycle follow-up.',
      targets:['[data-tour="track-tab"]','[data-tour="track-workspace"]'],
      beforeStep(){ showWorkspace('track'); }
    },
    {
      id:'ticker-card',
      title:'💡 Ticker Card',
      body:'Open a tracked name again from here, or watch the lifecycle state if the list is still empty.',
      targets:['[data-tour="ticker-card"]','[data-tour="watchlist"]'],
      beforeStep(){ showWorkspace('track'); }
    },
    {
      id:'paper-trading',
      title:'💡 Diary And Tester',
      body:'Diary and tester tools live here. Paper-trading stays gated until setup and gateway checks are ready.',
      targets:['[data-tour="paper-trade"]','[data-tour="help-menu"]'],
      beforeStep(){
        showWorkspace('diary');
        setDetailsOpen('advancedUtilitiesDetails', true);
      }
    },
    {
      id:'finish',
      title:'💡 Tour Complete',
      body:'You can reopen this walkthrough any time from App Help in Advanced / API Utilities.',
      placement:'center',
      beforeStep(){
        showWorkspace('diary');
        setDetailsOpen('advancedUtilitiesDetails', true);
      }
    }
  ];

  let overlay = null;
  let spotlight = null;
  let tooltip = null;
  let titleNode = null;
  let bodyNode = null;
  let progressNode = null;
  let backButton = null;
  let nextButton = null;
  let skipButton = null;
  let dontShowCheckbox = null;
  let restoreFocusNode = null;
  let currentTarget = null;
  let currentSteps = [];
  let activeStepId = '';
  let rafToken = 0;
  let settleTimer = 0;
  let rerenderQueued = false;
  let lastDisplayNav = null;
  let preTourUiContext = null;
  let renderSequence = 0;
  const state = {
    active:false,
    initialized:false,
    autoShown:false,
    index:0
  };

  function storage(){
    try{return global.localStorage || null;}catch(error){return null;}
  }
  function storageGet(key){
    const store = storage();
    if(!store) return null;
    try{return store.getItem(key);}catch(error){return null;}
  }
  function storageSet(key, value){
    const store = storage();
    if(!store) return false;
    try{
      store.setItem(key, value);
      return true;
    }catch(error){
      return false;
    }
  }
  function storageRemove(key){
    const store = storage();
    if(!store) return false;
    try{
      store.removeItem(key);
      return true;
    }catch(error){
      return false;
    }
  }
  function warn(code, error, extra){
    if(typeof console === 'undefined' || typeof console.warn !== 'function') return;
    console.warn(code, {
      message:error && error.message ? String(error.message) : 'unknown_error',
      ...extra
    });
  }
  function debugLog(label, payload){
    if(typeof console === 'undefined' || typeof console.info !== 'function') return;
    if(global.PP_DEBUG_ONBOARDING !== true) return;
    console.info(label, payload);
  }
  function safeRun(fn, options){
    try{
      return fn();
    }catch(error){
      failClosed(error, options);
      return null;
    }
  }
  function failClosed(error, options){
    const settings = options && typeof options === 'object' ? options : {};
    state.active = false;
    rerenderQueued = false;
    if(rafToken && typeof global.cancelAnimationFrame === 'function'){
      try{ global.cancelAnimationFrame(rafToken); }catch(_error){}
    }
    if(settleTimer) global.clearTimeout(settleTimer);
    rafToken = 0;
    settleTimer = 0;
    if(overlay) overlay.hidden = true;
    clearTargetHighlight();
    if(global.document && global.document.body) global.document.body.classList.remove('onboarding-tour-open');
    restorePreTourUiContext();
    if(settings.skipWarning !== true) warn('[ONBOARDING_TOUR_RUNTIME_FAILED]', error);
  }
  function readSeenState(){
    return {
      seen:String(storageGet(ONBOARDING_SEEN_KEY) || '').toLowerCase() === 'true',
      version:String(storageGet(ONBOARDING_VERSION_KEY) || '')
    };
  }
  function shouldAutoShow(){
    const persisted = readSeenState();
    return !(persisted.seen && persisted.version === ONBOARDING_VERSION);
  }
  function persistSeen(){
    storageSet(ONBOARDING_SEEN_KEY, 'true');
    storageSet(ONBOARDING_VERSION_KEY, ONBOARDING_VERSION);
  }
  function resetOnboardingTour(){
    storageRemove(ONBOARDING_SEEN_KEY);
    storageRemove(ONBOARDING_VERSION_KEY);
  }
  function currentViewport(){
    const visualViewport = global.visualViewport || null;
    const width = Math.max(0, Math.round(visualViewport ? visualViewport.width : (global.innerWidth || 0)));
    const height = Math.max(0, Math.round(visualViewport ? visualViewport.height : (global.innerHeight || 0)));
    const offsetLeft = Math.max(0, Math.round(visualViewport ? visualViewport.offsetLeft : 0));
    const offsetTop = Math.max(0, Math.round(visualViewport ? visualViewport.offsetTop : 0));
    const bottomNav = global.document ? global.document.getElementById('bottomRibbonNav') : null;
    const bottomNavRect = bottomNav && typeof bottomNav.getBoundingClientRect === 'function'
      ? bottomNav.getBoundingClientRect()
      : null;
    const bottomInset = bottomNavRect && bottomNavRect.top < height
      ? Math.max(0, Math.round(height - bottomNavRect.top))
      : 0;
    return {
      width,
      height,
      left:offsetLeft,
      top:offsetTop,
      right:offsetLeft + width,
      bottom:offsetTop + height,
      safeTop:offsetTop + MOBILE_MARGIN,
      safeBottom:offsetTop + height - Math.max(bottomInset + TOOLTIP_BOTTOM_BREATHING_ROOM, MOBILE_MARGIN + TOOLTIP_BOTTOM_BREATHING_ROOM),
      safeLeft:offsetLeft + MOBILE_MARGIN,
      safeRight:offsetLeft + width - MOBILE_MARGIN
    };
  }
  function clamp(value, min, max){
    return Math.max(min, Math.min(max, value));
  }
  function clearTargetHighlight(){
    if(currentTarget && currentTarget.classList){
      currentTarget.classList.remove(TARGET_HIGHLIGHT_CLASS);
    }
    currentTarget = null;
  }
  function highlightTarget(target){
    clearTargetHighlight();
    if(target && target.classList){
      target.classList.add(TARGET_HIGHLIGHT_CLASS);
      currentTarget = target;
    }
  }
  function resolveTarget(step){
    const selectors = Array.isArray(step.targets) ? step.targets : [];
    for(let index = 0; index < selectors.length; index += 1){
      try{
        const target = global.document.querySelector(selectors[index]);
        if(target) return target;
      }catch(error){}
    }
    debugLog('[ONBOARDING_TOUR_TARGET_MISSING]', {
      stepId:step.id,
      selectors
    });
    return null;
  }
  function onboardingBridge(){
    return global.pullbackPlaybookOnboarding && typeof global.pullbackPlaybookOnboarding === 'object'
      ? global.pullbackPlaybookOnboarding
      : null;
  }
  function getCurrentVisibleContextSafely(){
    const bridge = onboardingBridge();
    if(bridge && typeof bridge.getVisibleContext === 'function'){
      try{
        const context = bridge.getVisibleContext();
        return context && typeof context === 'object'
          ? context
          : {workspaceTab:'', advancedOpen:false};
      }catch(error){
        warn('[ONBOARDING_TOUR_BRIDGE_FAILED]', error, {action:'getVisibleContext'});
        return {workspaceTab:'', advancedOpen:false};
      }
    }
    const workspaceTab = global.document && global.document.body
      ? String(global.document.body.getAttribute('data-visible-workspace') || global.document.body.getAttribute('data-active-workspace') || '').trim().toLowerCase()
      : '';
    const node = global.document ? global.document.getElementById('advancedUtilitiesDetails') : null;
    return {
      workspaceTab,
      advancedOpen:!!(node && node.open === true)
    };
  }
  function capturePreTourUiContext(){
    return getCurrentVisibleContextSafely();
  }
  function restorePreTourUiContext(){
    if(!preTourUiContext) return;
    const snapshot = preTourUiContext;
    preTourUiContext = null;
    const bridge = onboardingBridge();
    if(bridge && typeof bridge.restoreVisibleContext === 'function'){
      try{
        bridge.restoreVisibleContext(snapshot);
        return;
      }catch(error){
        warn('[ONBOARDING_TOUR_BRIDGE_FAILED]', error, {action:'restoreVisibleContext'});
      }
    }
    if(snapshot && snapshot.workspaceTab) showWorkspace(snapshot.workspaceTab);
    setDetailsOpen('advancedUtilitiesDetails', !!(snapshot && snapshot.advancedOpen === true));
  }
  function setDetailsOpen(id, open){
    const bridge = onboardingBridge();
    if(bridge && typeof bridge.setAdvancedUtilitiesOpen === 'function'){
      try{
        bridge.setAdvancedUtilitiesOpen(open === true);
        return;
      }catch(error){
        warn('[ONBOARDING_TOUR_BRIDGE_FAILED]', error, {action:'setAdvancedUtilitiesOpen'});
      }
    }
    const node = global.document ? global.document.getElementById(id) : null;
    if(node && 'open' in node) node.open = open === true;
  }
  function showWorkspace(tab){
    lastDisplayNav = String(tab || '');
    const bridge = onboardingBridge();
    if(bridge && typeof bridge.showWorkspaceForTour === 'function'){
      try{
        bridge.showWorkspaceForTour(tab);
      }catch(error){
        warn('[ONBOARDING_TOUR_BRIDGE_FAILED]', error, {
          action:'showWorkspaceForTour',
          tab:String(tab || '')
        });
      }
    }
  }
  function buildSteps(){
    return stepDefinitions.slice();
  }
  function buildOverlay(){
    if(overlay || !global.document || !global.document.body) return;
    overlay = global.document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.className = 'onboarding-tour-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `<div class="onboarding-tour-backdrop"></div><div class="onboarding-tour-spotlight is-hidden"></div><div class="onboarding-tour-tooltip is-centered" role="dialog" aria-modal="true" aria-labelledby="onboardingTourTitle" aria-describedby="onboardingTourBody" tabindex="-1"><div class="onboarding-tour-progress"></div><h3 class="onboarding-tour-title" id="onboardingTourTitle"></h3><p class="onboarding-tour-body" id="onboardingTourBody"></p><div class="onboarding-tour-controls"><button type="button" class="secondary compactbutton" data-tour-action="back">Back</button><button type="button" class="primary compactbutton" data-tour-action="next">Next</button><button type="button" class="ghost compactbutton" data-tour-action="skip">Skip</button></div><label class="onboarding-tour-checkbox"><input type="checkbox" id="onboardingTourDontShowAgain"> Don't show again</label></div>`;
    global.document.body.appendChild(overlay);
    spotlight = overlay.querySelector('.onboarding-tour-spotlight');
    tooltip = overlay.querySelector('.onboarding-tour-tooltip');
    titleNode = overlay.querySelector('.onboarding-tour-title');
    bodyNode = overlay.querySelector('.onboarding-tour-body');
    progressNode = overlay.querySelector('.onboarding-tour-progress');
    backButton = overlay.querySelector('[data-tour-action="back"]');
    nextButton = overlay.querySelector('[data-tour-action="next"]');
    skipButton = overlay.querySelector('[data-tour-action="skip"]');
    dontShowCheckbox = overlay.querySelector('#onboardingTourDontShowAgain');
    backButton.addEventListener('click', () => moveStep(-1));
    nextButton.addEventListener('click', () => moveStep(1));
    skipButton.addEventListener('click', () => dismissOnboardingTour({dontShowAgain:!!(dontShowCheckbox && dontShowCheckbox.checked)}));
    overlay.addEventListener('keydown', handleKeydown);
  }
  function tooltipMetrics(viewport){
    const width = Math.min(TOOLTIP_MAX_WIDTH, Math.max(220, viewport.width - (MOBILE_MARGIN * 2)));
    const height = tooltip
      ? Math.max(tooltip.offsetHeight || 0, 160)
      : 160;
    return {width, height};
  }
  function targetRect(target){
    if(!target || typeof target.getBoundingClientRect !== 'function') return null;
    const rect = target.getBoundingClientRect();
    if(!(rect.width >= SMALL_TARGET_EDGE && rect.height >= SMALL_TARGET_EDGE)) return null;
    return rect;
  }
  function scrollTargetIntoView(target){
    if(!target || typeof target.scrollIntoView !== 'function') return;
    const rect = targetRect(target);
    const viewport = currentViewport();
    if(rect && rect.top >= viewport.safeTop && rect.bottom <= viewport.safeBottom) return;
    try{
      target.scrollIntoView({behavior:'smooth', block:'center', inline:'nearest'});
    }catch(error){
      target.scrollIntoView();
    }
  }
  function positionSpotlight(target, viewport){
    if(!spotlight) return;
    const rect = targetRect(target);
    if(!rect){
      spotlight.classList.add('is-hidden');
      spotlight.style.removeProperty('--spotlight-top');
      spotlight.style.removeProperty('--spotlight-left');
      spotlight.style.removeProperty('--spotlight-width');
      spotlight.style.removeProperty('--spotlight-height');
      return;
    }
    const top = clamp(rect.top - 8, viewport.safeTop, viewport.safeBottom);
    const left = clamp(rect.left - 8, viewport.safeLeft, viewport.safeRight);
    const width = Math.min(rect.width + 16, viewport.safeRight - left);
    const height = Math.min(rect.height + 16, viewport.safeBottom - top);
    spotlight.classList.remove('is-hidden');
    spotlight.style.setProperty('--spotlight-top', `${top}px`);
    spotlight.style.setProperty('--spotlight-left', `${left}px`);
    spotlight.style.setProperty('--spotlight-width', `${Math.max(width, 0)}px`);
    spotlight.style.setProperty('--spotlight-height', `${Math.max(height, 0)}px`);
  }
  function positionTooltip(step, target, options){
    const settings = options && typeof options === 'object' ? options : {};
    const viewport = currentViewport();
    const metrics = tooltipMetrics(viewport);
    tooltip.classList.remove('is-centered');
    tooltip.style.removeProperty('left');
    tooltip.style.removeProperty('top');
    tooltip.style.removeProperty('max-width');
    tooltip.removeAttribute('data-pointer-direction');
    tooltip.style.maxWidth = `${viewport.width - (MOBILE_MARGIN * 2)}px`;
    const rect = targetRect(target);
    positionSpotlight(target, viewport);
    if(!rect || step.placement === 'center'){
      tooltip.classList.add('is-centered');
      return;
    }
    const belowTop = rect.bottom + TOOLTIP_TARGET_GAP;
    const aboveTop = rect.top - metrics.height - TOOLTIP_TARGET_GAP;
    const canPlaceBelow = belowTop + metrics.height <= viewport.safeBottom;
    const canPlaceAbove = aboveTop >= viewport.safeTop;
    let top = canPlaceAbove || !canPlaceBelow ? aboveTop : belowTop;
    const pointerDirection = top === aboveTop ? 'down' : 'up';
    top = clamp(top, viewport.safeTop, Math.max(viewport.safeTop, viewport.safeBottom - metrics.height));
    const centeredLeft = rect.left + (rect.width / 2) - (metrics.width / 2);
    const left = clamp(centeredLeft, viewport.safeLeft, Math.max(viewport.safeLeft, viewport.safeRight - metrics.width));
    tooltip.setAttribute('data-pointer-direction', pointerDirection);
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    if(settings.logPosition === true){
      debugLog('[ONBOARDING_TOUR_POSITIONED]', {
        stepId:step.id,
        targetRect:{
          top:Math.round(rect.top),
          left:Math.round(rect.left),
          width:Math.round(rect.width),
          height:Math.round(rect.height)
        },
        tooltip:{left:Math.round(left), top:Math.round(top), width:metrics.width, height:metrics.height}
      });
    }
  }
  function focusTooltip(){
    const target = backButton && backButton.disabled ? nextButton : backButton;
    if(target && typeof target.focus === 'function'){
      target.focus();
      return;
    }
    if(tooltip && typeof tooltip.focus === 'function') tooltip.focus();
  }
  function stepAt(index){
    const safeIndex = clamp(index, 0, Math.max(0, currentSteps.length - 1));
    return currentSteps[safeIndex] || null;
  }
  function schedulePositionRefresh(step, target, options){
    if(!state.active) return;
    if(rafToken && typeof global.cancelAnimationFrame === 'function'){
      try{ global.cancelAnimationFrame(rafToken); }catch(_error){}
    }
    if(settleTimer) global.clearTimeout(settleTimer);
    const run = () => safeRun(() => positionTooltip(step, target, options));
    if(typeof global.requestAnimationFrame === 'function'){
      rafToken = global.requestAnimationFrame(() => {
        run();
        rafToken = global.requestAnimationFrame(() => run());
      });
    }else{
      run();
    }
    settleTimer = global.setTimeout(run, 80);
  }
  function waitFrame(){
    return new Promise(resolve => {
      if(typeof global.requestAnimationFrame === 'function'){
        global.requestAnimationFrame(() => resolve());
        return;
      }
      global.setTimeout(resolve, 16);
    });
  }
  async function waitForTourTarget(step, options){
    const settings = options && typeof options === 'object' ? options : {};
    const timeoutMs = Number.isFinite(Number(settings.timeoutMs)) ? Number(settings.timeoutMs) : 350;
    const selectors = Array.isArray(step && step.targets) ? step.targets : [];
    if(!selectors.length) return null;
    const startedAt = Date.now();
    let target = null;
    await waitFrame();
    await waitFrame();
    while((Date.now() - startedAt) <= timeoutMs){
      target = resolveTarget(step);
      if(targetRect(target)) return target;
      await waitFrame();
    }
    return resolveTarget(step);
  }
  async function renderStep(index, options){
    const settings = options && typeof options === 'object' ? options : {};
    const sequence = ++renderSequence;
    buildOverlay();
    state.index = clamp(index, 0, Math.max(0, currentSteps.length - 1));
    const step = stepAt(state.index);
    if(!step) return;
    activeStepId = step.id;
    titleNode.textContent = step.title;
    bodyNode.textContent = step.body;
    progressNode.textContent = `${state.index + 1} / ${currentSteps.length}`;
    backButton.disabled = state.index === 0;
    nextButton.textContent = state.index === currentSteps.length - 1 ? 'Finish' : 'Next';
    const beforeResult = safeRun(() => {
      if(typeof step.beforeStep === 'function') step.beforeStep();
    });
    if(beforeResult === null || !state.active || sequence !== renderSequence) return;
    const target = await waitForTourTarget(step, {timeoutMs:settings.targetTimeoutMs});
    if(!state.active || sequence !== renderSequence) return;
    highlightTarget(target);
    if(settings.allowScroll !== false && target) scrollTargetIntoView(target);
    schedulePositionRefresh(step, target, {logPosition:settings.logPosition === true});
  }
  function moveStep(delta){
    if(delta > 0 && state.index >= currentSteps.length - 1){
      dismissOnboardingTour({dontShowAgain:!!(dontShowCheckbox && dontShowCheckbox.checked)});
      return;
    }
    void renderStep(state.index + delta, {allowScroll:true});
  }
  function startOnboardingTour(options){
    const settings = options && typeof options === 'object' ? options : {};
    buildOverlay();
    if(state.active && settings.force !== true){
      focusTooltip();
      return;
    }
    currentSteps = buildSteps();
    preTourUiContext = capturePreTourUiContext();
    restoreFocusNode = global.document && global.document.activeElement ? global.document.activeElement : null;
    state.active = true;
    overlay.hidden = false;
    if(global.document && global.document.body) global.document.body.classList.add('onboarding-tour-open');
    void renderStep(0, {allowScroll:false, logPosition:true});
    focusTooltip();
  }
  function dismissOnboardingTour(options){
    const settings = options && typeof options === 'object' ? options : {};
    state.active = false;
    activeStepId = '';
    currentSteps = [];
    if(rafToken && typeof global.cancelAnimationFrame === 'function'){
      try{ global.cancelAnimationFrame(rafToken); }catch(_error){}
    }
    if(settleTimer) global.clearTimeout(settleTimer);
    rafToken = 0;
    settleTimer = 0;
    if(overlay) overlay.hidden = true;
    clearTargetHighlight();
    if(global.document && global.document.body) global.document.body.classList.remove('onboarding-tour-open');
    restorePreTourUiContext();
    if(settings.dontShowAgain) persistSeen();
    if(restoreFocusNode && typeof restoreFocusNode.focus === 'function'){
      try{ restoreFocusNode.focus(); }catch(error){}
    }
    restoreFocusNode = null;
  }
  function handleKeydown(event){
    if(!state.active || !event) return;
    if(event.key === 'Escape'){
      event.preventDefault();
      dismissOnboardingTour({dontShowAgain:false});
      return;
    }
    if(event.key !== 'Tab') return;
    const focusable = [backButton, nextButton, skipButton, dontShowCheckbox].filter(node => node && !node.disabled);
    if(!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = global.document && global.document.activeElement ? global.document.activeElement : null;
    if(event.shiftKey && active === first){
      event.preventDefault();
      last.focus();
      return;
    }
    if(!event.shiftKey && active === last){
      event.preventDefault();
      first.focus();
    }
  }
  function registerOnboardingHelpButton(){
    const button = global.document ? global.document.getElementById(HELP_BUTTON_ID) : null;
    if(!button || button.dataset.onboardingBound === '1') return;
    button.dataset.onboardingBound = '1';
    button.addEventListener('click', () => startOnboardingTour({force:true}));
  }
  function rerenderIfOpen(){
    if(!state.active || rerenderQueued) return;
    rerenderQueued = true;
    const run = () => safeRun(() => {
      rerenderQueued = false;
      const step = stepAt(state.index);
      if(!step) return;
      const target = resolveTarget(step);
      highlightTarget(target);
      schedulePositionRefresh(step, target, {logPosition:false});
    });
    if(typeof global.requestAnimationFrame === 'function'){
      global.requestAnimationFrame(run);
      return;
    }
    global.setTimeout(run, 16);
  }
  function initViewportListeners(){
    global.addEventListener('resize', rerenderIfOpen, {passive:true});
    global.addEventListener('orientationchange', rerenderIfOpen, {passive:true});
    global.addEventListener('scroll', rerenderIfOpen, {passive:true});
    if(global.visualViewport && typeof global.visualViewport.addEventListener === 'function'){
      global.visualViewport.addEventListener('resize', rerenderIfOpen, {passive:true});
      global.visualViewport.addEventListener('scroll', rerenderIfOpen, {passive:true});
    }
  }
  function initOnboardingTour(){
    if(state.initialized) return;
    state.initialized = true;
    buildOverlay();
    registerOnboardingHelpButton();
    initViewportListeners();
    global.setTimeout(() => safeRun(() => {
      registerOnboardingHelpButton();
      if(!state.autoShown && shouldAutoShow()){
        state.autoShown = true;
        startOnboardingTour();
      }
    }), 0);
  }

  global.initOnboardingTour = initOnboardingTour;
  global.startOnboardingTour = startOnboardingTour;
  global.dismissOnboardingTour = dismissOnboardingTour;
  global.resetOnboardingTour = resetOnboardingTour;
  global.registerOnboardingHelpButton = registerOnboardingHelpButton;
  global.__ONBOARDING_TOUR_TEST_API__ = {
    version:ONBOARDING_VERSION,
    seenKey:ONBOARDING_SEEN_KEY,
    versionKey:ONBOARDING_VERSION_KEY,
    buildSteps,
    currentStepId(){ return activeStepId; },
    lastDisplayNav(){ return lastDisplayNav; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
