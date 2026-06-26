(function(global){
  'use strict';

  const ONBOARDING_SEEN_KEY = 'pullbackPlaybookOnboardingSeen';
  const ONBOARDING_VERSION_KEY = 'pullbackPlaybookOnboardingVersion';
  const ONBOARDING_VERSION = '2026-06-onboarding-v1';
  const OVERLAY_ID = 'onboardingTourOverlay';
  const HELP_BUTTON_ID = 'startOnboardingTourBtn';
  const STEP_IDS = ['welcome','scan-overview','review-overview','verdict-overview','trade-plan','track-overview','track-long-press','paper-trading','finish'];
  const steps = [
    {id:'welcome', title:'Welcome', body:'This app is built for a fast Quality Pullback workflow: scan, review one ticker, decide, then track it without extra clutter.', placement:'center'},
    {id:'scan-overview', title:'Scan', body:'Start here to import tickers, add names manually, and run a quick scan before opening anything into Review.', targets:['[data-tour="scan-workspace"]'], placement:'bottom'},
    {id:'review-overview', title:'Review', body:'Review keeps one active ticker in focus so chart context, verdict, and trade plan stay in one place.', targets:['[data-tour="review-workspace"]'], placement:'auto'},
    {id:'verdict-overview', title:'Decision Summary', body:'This area is the canonical verdict summary. Use it to see the current state quickly before acting.', targets:['[data-tour="verdict-card"]','[data-tour="review-workspace"]'], placement:'auto'},
    {id:'trade-plan', title:'Trade Plan', body:'The trade plan keeps entry, stop, target, risk, and capital fit aligned with your fixed max-loss rule.', targets:['[data-tour="trade-plan"]','[data-tour="review-workspace"]'], placement:'auto'},
    {id:'track-overview', title:'Track', body:'Track is the working watchlist. Keep active setups here, refresh lifecycle state, and reopen names in Review when needed.', targets:['[data-tour="track-workspace"]'], placement:'top'},
    {id:'track-long-press', title:'Long Press Help', body:'On track cards, long press the helper affordance to inspect entry conditions without changing the record.', targets:['[data-tour="ticker-card"]','[data-tour="watchlist"]'], placement:'top'},
    {id:'paper-trading', title:'Paper Trading', body:'Paper trading stays gated behind tester setup and gateway health, so the app only exposes preview and submit actions when the setup is ready.', targets:['[data-tour="paper-trade"]'], placement:'top', skipIfMissing:true},
    {id:'finish', title:'Need Help Later?', body:'Reopen this tour any time from Advanced / API Utilities. The help entry is kept there so the main workflow stays clean.', targets:['[data-tour="help-menu"]'], placement:'center'}
  ];

  let overlay = null;
  let card = null;
  let spotlight = null;
  let titleNode = null;
  let bodyNode = null;
  let progressNode = null;
  let backButton = null;
  let nextButton = null;
  let skipButton = null;
  let dontShowCheckbox = null;
  let restoreFocusNode = null;
  let rerenderQueued = false;
  const state = {active:false, index:0, initialized:false, autoShown:false};

  function storage(){
    try{return global.localStorage || null;}catch(error){return null;}
  }
  function warn(code, error){
    if(typeof console === 'undefined' || typeof console.warn !== 'function') return;
    console.warn(code, {
      message:error && error.message ? String(error.message) : 'unknown_error'
    });
  }
  function failClosed(error){
    state.active = false;
    rerenderQueued = false;
    if(overlay) overlay.hidden = true;
    if(global.document && global.document.body) global.document.body.classList.remove('onboarding-tour-open');
    restoreFocusNode = null;
    warn('[ONBOARDING_TOUR_RUNTIME_FAILED]', error);
  }
  function safeRun(fn){
    try{
      return fn();
    }catch(error){
      failClosed(error);
      return null;
    }
  }
  function storageGet(key){
    const store = storage();
    if(!store) return null;
    try{
      return store.getItem(key);
    }catch(error){
      return null;
    }
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
  function resolveStep(step){
    const selectors = Array.isArray(step.targets) ? step.targets : [];
    for(let index = 0; index < selectors.length; index += 1){
      try{
        const target = global.document.querySelector(selectors[index]);
        if(target) return target;
      }catch(error){}
    }
    return null;
  }
  function currentSteps(){
    return steps.filter(step => !step.skipIfMissing || resolveStep(step));
  }
  function buildOverlay(){
    if(overlay || !global.document || !global.document.body) return;
    overlay = global.document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.className = 'onboarding-tour-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `<div class="onboarding-tour-backdrop"></div><div class="onboarding-tour-spotlight is-hidden"></div><div class="onboarding-tour-card is-centered" role="dialog" aria-modal="true" aria-labelledby="onboardingTourTitle" aria-describedby="onboardingTourBody" tabindex="-1"><div class="onboarding-tour-progress"></div><h3 class="onboarding-tour-title" id="onboardingTourTitle"></h3><p class="onboarding-tour-body" id="onboardingTourBody"></p><label class="onboarding-tour-checkbox"><input type="checkbox" id="onboardingTourDontShowAgain"> Don't show again</label><div class="onboarding-tour-controls"><button type="button" class="secondary" data-tour-action="back">Back</button><button type="button" class="primary" data-tour-action="next">Next</button></div><div class="onboarding-tour-footer"><button type="button" class="ghost" data-tour-action="skip">Skip</button></div></div>`;
    global.document.body.appendChild(overlay);
    card = overlay.querySelector('.onboarding-tour-card');
    spotlight = overlay.querySelector('.onboarding-tour-spotlight');
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
  function clamp(value, min, max){
    return Math.max(min, Math.min(max, value));
  }
  function rectFor(target){
    if(!target || typeof target.getBoundingClientRect !== 'function') return null;
    const rect = target.getBoundingClientRect();
    return rect && rect.width > 0 && rect.height > 0 ? rect : null;
  }
  function scrollIntoView(target){
    if(!target || typeof target.scrollIntoView !== 'function') return;
    const rect = rectFor(target);
    const viewport = global.innerHeight || 0;
    if(rect && rect.top >= 24 && rect.bottom <= (viewport - 24)) return;
    try{ target.scrollIntoView({behavior:'smooth', block:'center', inline:'nearest'}); }catch(error){ target.scrollIntoView(); }
  }
  function positionSpotlight(target){
    if(!spotlight) return;
    const rect = rectFor(target);
    if(!rect){
      spotlight.classList.add('is-hidden');
      return;
    }
    spotlight.classList.remove('is-hidden');
    spotlight.style.top = Math.max(0, rect.top - 8) + 'px';
    spotlight.style.left = Math.max(0, rect.left - 8) + 'px';
    spotlight.style.width = rect.width + 16 + 'px';
    spotlight.style.height = rect.height + 16 + 'px';
  }
  function positionCard(step, target){
    if(!card) return;
    card.classList.remove('is-centered');
    card.style.left = '';
    card.style.top = '';
    card.style.transform = '';
    if(!target || step.placement === 'center'){
      card.classList.add('is-centered');
      return;
    }
    const rect = rectFor(target);
    if(!rect){
      card.classList.add('is-centered');
      return;
    }
    const width = Math.min(360, Math.max(260, (global.innerWidth || 360) - 24));
    const placement = step.placement === 'auto' ? (rect.top > ((global.innerHeight || 0) / 2) ? 'top' : 'bottom') : step.placement;
    const left = clamp(rect.left + (rect.width / 2) - (width / 2), 12, Math.max(12, (global.innerWidth || width) - width - 12));
    const top = placement === 'top' ? rect.top - 274 : rect.bottom + 14;
    card.style.left = left + 'px';
    card.style.top = clamp(top, 12, Math.max(12, (global.innerHeight || 420) - 280)) + 'px';
  }
  function focusTour(){
    const target = backButton && backButton.disabled ? nextButton : backButton;
    if(target && typeof target.focus === 'function'){
      target.focus();
      return;
    }
    if(card && typeof card.focus === 'function') card.focus();
  }
  function renderCurrentStep(options){
    const settings = options && typeof options === 'object' ? options : {};
    buildOverlay();
    const visibleSteps = currentSteps();
    state.index = clamp(state.index, 0, Math.max(0, visibleSteps.length - 1));
    const step = visibleSteps[state.index];
    const target = resolveStep(step);
    if(settings.allowScroll !== false && target) scrollIntoView(target);
    titleNode.textContent = step.title;
    bodyNode.textContent = step.body;
    progressNode.textContent = 'Step ' + (state.index + 1) + ' of ' + visibleSteps.length;
    backButton.disabled = state.index === 0;
    nextButton.textContent = state.index === visibleSteps.length - 1 ? 'Finish' : 'Next';
    positionSpotlight(target);
    positionCard(step, target);
  }
  function moveStep(delta){
    const visibleSteps = currentSteps();
    if(delta > 0 && state.index === visibleSteps.length - 1){
      dismissOnboardingTour({dontShowAgain:!!(dontShowCheckbox && dontShowCheckbox.checked)});
      return;
    }
    state.index = clamp(state.index + delta, 0, Math.max(0, visibleSteps.length - 1));
    renderCurrentStep({allowScroll:true});
  }
  function startOnboardingTour(options){
    const settings = options && typeof options === 'object' ? options : {};
    buildOverlay();
    if(state.active && settings.force !== true){
      focusTour();
      return;
    }
    restoreFocusNode = global.document && global.document.activeElement ? global.document.activeElement : null;
    state.index = 0;
    state.active = true;
    overlay.hidden = false;
    global.document.body.classList.add('onboarding-tour-open');
    renderCurrentStep({allowScroll:true});
    focusTour();
  }
  function dismissOnboardingTour(options){
    const settings = options && typeof options === 'object' ? options : {};
    if(overlay) overlay.hidden = true;
    if(global.document && global.document.body) global.document.body.classList.remove('onboarding-tour-open');
    state.active = false;
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
      dismissOnboardingTour({dontShowAgain:!!(dontShowCheckbox && dontShowCheckbox.checked)});
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
    const button = global.document.getElementById(HELP_BUTTON_ID);
    if(!button || button.dataset.onboardingBound === '1') return;
    button.dataset.onboardingBound = '1';
    button.addEventListener('click', () => startOnboardingTour({force:true}));
  }
  function rerenderIfOpen(){
    if(!state.active || rerenderQueued) return;
    rerenderQueued = true;
    const run = () => safeRun(() => {
      rerenderQueued = false;
      renderCurrentStep({allowScroll:false});
    });
    if(typeof global.requestAnimationFrame === 'function'){
      global.requestAnimationFrame(run);
      return;
    }
    global.setTimeout(run, 16);
  }
  function initOnboardingTour(){
    if(state.initialized) return;
    state.initialized = true;
    buildOverlay();
    registerOnboardingHelpButton();
    global.addEventListener('resize', rerenderIfOpen, {passive:true});
    global.addEventListener('scroll', rerenderIfOpen, {passive:true});
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
  global.__ONBOARDING_TOUR_TEST_API__ = {version:ONBOARDING_VERSION, seenKey:ONBOARDING_SEEN_KEY, versionKey:ONBOARDING_VERSION_KEY, stepIds:STEP_IDS.slice(), currentSteps};
})(typeof window !== 'undefined' ? window : globalThis);
