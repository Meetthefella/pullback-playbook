const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

async function flushAsync(turns = 6){
  for(let index = 0; index < turns; index += 1){
    await Promise.resolve();
  }
}

function createStorage(){
  const map = new Map();
  return {
    getItem(key){ return map.has(key) ? map.get(key) : null; },
    setItem(key, value){ map.set(key, String(value)); },
    removeItem(key){ map.delete(key); }
  };
}

function createThrowingStorage(){
  return {
    getItem(){ throw new Error('storage blocked'); },
    setItem(){ throw new Error('storage blocked'); },
    removeItem(){ throw new Error('storage blocked'); }
  };
}

function createClassList(){
  const values = new Set();
  return {
    add(...items){ items.forEach(item => values.add(item)); },
    remove(...items){ items.forEach(item => values.delete(item)); },
    contains(item){ return values.has(item); }
  };
}

function createElement(tagName, registry){
  const element = {
    tagName:String(tagName || 'div').toUpperCase(),
    style:{
      setProperty(name, value){ this[name] = value; },
      removeProperty(name){ delete this[name]; }
    },
    dataset:{},
    hidden:false,
    classList:createClassList(),
    listeners:{},
    focusCount:0,
    offsetHeight:160,
    appendChild(child){ child.parentNode = this; child.ownerDocument = this.ownerDocument; return child; },
    addEventListener(type, handler){ this.listeners[type] = handler; },
    click(){ if(this.listeners.click) this.listeners.click({type:'click', target:this, preventDefault(){}, stopPropagation(){}}); },
    focus(){ this.focusCount += 1; if(this.ownerDocument) this.ownerDocument.activeElement = this; },
    scrollIntoView(){},
    getBoundingClientRect(){ return this._rect || {top:100, left:80, width:220, height:120, bottom:220, right:300}; },
    querySelector(selector){ return this._query ? this._query[selector] || null : null; }
  };
  Object.defineProperty(element, 'id', {
    get(){ return this._id || ''; },
    set(value){ this._id = String(value); registry[this._id] = this; }
  });
  Object.defineProperty(element, 'innerHTML', {
    get(){ return this._innerHTML || ''; },
    set(value){
      this._innerHTML = String(value);
      if(this._innerHTML.includes('onboarding-tour-backdrop')){
        const spotlight = createElement('div', registry);
        const tooltip = createElement('div', registry);
        const progress = createElement('div', registry);
        const title = createElement('h3', registry);
        const body = createElement('p', registry);
        const checkbox = createElement('input', registry);
        checkbox.id = 'onboardingTourDontShowAgain';
        const back = createElement('button', registry);
        const next = createElement('button', registry);
        const skip = createElement('button', registry);
        tooltip.offsetHeight = 164;
        this._query = {
          '.onboarding-tour-spotlight':spotlight,
          '.onboarding-tour-tooltip':tooltip,
          '.onboarding-tour-progress':progress,
          '.onboarding-tour-title':title,
          '.onboarding-tour-body':body,
          '#onboardingTourDontShowAgain':checkbox,
          '[data-tour-action="back"]':back,
          '[data-tour-action="next"]':next,
          '[data-tour-action="skip"]':skip
        };
      }
    }
  });
  return element;
}

function extractFunctionSource(source, functionName){
  const start = source.indexOf(`function ${functionName}(`);
  if(start < 0) throw new Error(`Could not find function ${functionName}`);
  const braceStart = source.indexOf('{', start);
  if(braceStart < 0) throw new Error(`Could not find body for ${functionName}`);
  let depth = 0;
  for(let index = braceStart; index < source.length; index += 1){
    const character = source[index];
    if(character === '{'){
      depth += 1;
    }else if(character === '}'){
      depth -= 1;
      if(depth === 0){
        return source.slice(start, index + 1);
      }
    }
  }
  throw new Error(`Could not extract function ${functionName}`);
}

function createEnvironment(targets = {}, options = {}){
  const registry = {};
  const body = createElement('body', registry);
  body.classList = createClassList();
  body.appendChild = function appendChild(child){
    child.parentNode = this;
    child.ownerDocument = this.ownerDocument;
    return child;
  };
  const advancedDetails = createElement('details', registry);
  advancedDetails.id = 'advancedUtilitiesDetails';
  advancedDetails.open = options.advancedOpen === true;
  advancedDetails.ownerDocument = null;
  const document = {
    body,
    activeElement:null,
    createElement(tag){ const node = createElement(tag, registry); node.ownerDocument = document; return node; },
    getElementById(id){ return registry[id] || null; },
    querySelector(selector){ return targets[selector] || null; }
  };
  body.ownerDocument = document;
  advancedDetails.ownerDocument = document;
  const windowListeners = {};
  const vvListeners = {};
  const visualViewport = {
    width:390,
    height:844,
    offsetLeft:0,
    offsetTop:0,
    addEventListener(type, handler){ vvListeners[type] = handler; }
  };
  const warnings = [];
  const infos = [];
  const storage = options.throwingStorage ? createThrowingStorage() : createStorage();
  let activeWorkspace = String(options.activeWorkspace || 'scan');
  const bridgeCalls = [];
  const window = {
    document,
    localStorage:storage,
    innerWidth:390,
    innerHeight:844,
    visualViewport,
    addEventListener(type, handler){ windowListeners[type] = handler; },
    setTimeout(fn){ fn(); return 1; },
    clearTimeout(){},
    requestAnimationFrame(fn){ fn(); return 1; },
    cancelAnimationFrame(){},
    setActiveWorkspaceTab(){ throw new Error('setActiveWorkspaceTab should not be called by onboarding'); },
    handleWorkspaceTabChange(){ throw new Error('handleWorkspaceTabChange should not be called by onboarding'); },
    appShell:{ setActiveWorkspace(){ throw new Error('appShell.setActiveWorkspace should not be called by onboarding'); } },
    pullbackPlaybookOnboarding:{
      showWorkspaceForTour(tab){
        activeWorkspace = String(tab || '');
        bridgeCalls.push({type:'showWorkspaceForTour', tab:activeWorkspace});
        return activeWorkspace;
      },
      getVisibleContext(){
        bridgeCalls.push({type:'getVisibleContext'});
        return {
          workspaceTab:activeWorkspace,
          advancedOpen:advancedDetails.open === true
        };
      },
      restoreVisibleContext(context){
        const snapshot = context && typeof context === 'object' ? context : {};
        activeWorkspace = String(snapshot.workspaceTab || activeWorkspace || 'scan');
        advancedDetails.open = snapshot.advancedOpen === true;
        bridgeCalls.push({
          type:'restoreVisibleContext',
          workspaceTab:activeWorkspace,
          advancedOpen:advancedDetails.open === true
        });
        return {
          workspaceTab:activeWorkspace,
          advancedOpen:advancedDetails.open === true
        };
      },
      setAdvancedUtilitiesOpen(open){
        bridgeCalls.push({type:'setAdvancedUtilitiesOpen', open:open === true});
        advancedDetails.open = open === true;
        return advancedDetails.open;
      },
      isAdvancedUtilitiesOpen(){
        bridgeCalls.push({type:'isAdvancedUtilitiesOpen'});
        return advancedDetails.open === true;
      }
    },
    __bridgeCalls:bridgeCalls,
    __listeners:windowListeners,
    __vvListeners:vvListeners
  };
  registry.advancedUtilitiesDetails = advancedDetails;
  return {window, storage, registry, warnings, infos, advancedDetails};
}

function loadScript(window, warnings, infos){
  const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'onboarding-tour.js'), 'utf8');
  const consoleStub = {
    warn(...args){ warnings.push(args); },
    info(...args){ infos.push(args); }
  };
  const context = vm.createContext({window, document:window.document, globalThis:window, console:consoleStub});
  vm.runInContext(source, context, {filename:'onboarding-tour.js'});
  return window;
}

async function run(){
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const onboardingSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'onboarding-tour.js'), 'utf8');
  const bridgeSource = extractFunctionSource(appSource, 'ensureOnboardingDisplayBridge');
  assert(appSource.includes('window.pullbackPlaybookOnboarding'), 'app should expose the onboarding bridge');
  assert(appSource.includes('showWorkspaceForTour = function showWorkspaceForTour'), 'app bridge should expose display-only tab setter');
  assert(appSource.includes('getVisibleContext = function getVisibleContext'), 'app bridge should expose visible context getter');
  assert(appSource.includes('restoreVisibleContext = function restoreVisibleContext'), 'app bridge should expose visible context restore');
  assert(!bridgeSource.includes('setActiveWorkspaceTab('), 'display-only onboarding bridge must not call setActiveWorkspaceTab');
  assert(!bridgeSource.includes('setActiveWorkspace('), 'display-only onboarding bridge must not call appShell.setActiveWorkspace');
  assert(!bridgeSource.includes('handleWorkspaceTabChange('), 'display-only onboarding bridge must not call handleWorkspaceTabChange');
  assert(!onboardingSource.includes('global.setActiveWorkspaceTab'), 'tour should not depend on window.setActiveWorkspaceTab directly');
  assert(!onboardingSource.includes('setWorkspaceTab('), 'tour should not use the old onboarding tab bridge');

  {
    const {window, warnings, infos} = createEnvironment();
    loadScript(window, warnings, infos);
    window.initOnboardingTour();
    await flushAsync();
    assert(window.document.getElementById('onboardingTourOverlay'), 'init should create overlay');
    assert(typeof window.__listeners.resize === 'function', 'resize listener should be registered');
    assert(typeof window.__listeners.orientationchange === 'function', 'orientation listener should be registered');
    assert(typeof window.__vvListeners.resize === 'function', 'visualViewport resize listener should be registered');
  }

  {
    const {window, storage, warnings, infos} = createEnvironment();
    loadScript(window, warnings, infos);
    window.startOnboardingTour();
    await flushAsync();
    assert(storage.getItem('pullbackPlaybookOnboardingSeen') === null, 'start should not persist seen state');
  }

  {
    const {window, storage, warnings, infos} = createEnvironment({}, {throwingStorage:true});
    loadScript(window, warnings, infos);
    window.initOnboardingTour();
    window.startOnboardingTour();
    await flushAsync();
    window.dismissOnboardingTour({dontShowAgain:true});
    window.resetOnboardingTour();
    assert(window.document.getElementById('onboardingTourOverlay'), 'throwing storage should not break startup');
  }

  {
    const {window, storage, warnings, infos} = createEnvironment();
    loadScript(window, warnings, infos);
    storage.setItem('pullbackPlaybookOnboardingSeen', 'true');
    storage.setItem('pullbackPlaybookOnboardingVersion', 'older-version');
    window.initOnboardingTour();
    await flushAsync();
    assert(window.document.getElementById('onboardingTourOverlay').hidden === false, 'version mismatch should auto-show');
  }

  {
    const {window, storage, warnings, infos} = createEnvironment();
    loadScript(window, warnings, infos);
    window.dismissOnboardingTour({dontShowAgain:true});
    assert(storage.getItem('pullbackPlaybookOnboardingSeen') === 'true', 'dismiss should persist seen');
    window.startOnboardingTour({force:true});
    await flushAsync();
    assert(window.document.getElementById('onboardingTourOverlay').hidden === false, 'force reopen should work');
  }

  {
    const helpButton = createElement('button', {});
    helpButton.id = 'startOnboardingTourBtn';
    const {window, warnings, infos} = createEnvironment({'#startOnboardingTourBtn':helpButton});
    const originalGetElementById = window.document.getElementById.bind(window.document);
    window.document.getElementById = id => id === 'startOnboardingTourBtn' ? helpButton : originalGetElementById(id);
    loadScript(window, warnings, infos);
    window.registerOnboardingHelpButton();
    helpButton.click();
    await flushAsync();
    assert(window.document.getElementById('onboardingTourOverlay').hidden === false, 'help button should reopen tour');
  }

  {
    let scrollCalls = 0;
    const target = createElement('div', {});
    target._rect = {top:900, left:80, width:220, height:120, bottom:1020, right:300};
    target.scrollIntoView = () => { scrollCalls += 1; };
    const targets = {
      '[data-tour="scan-tab"]':createElement('button', {}),
      '[data-tour="ticker-inputs"]':target
    };
    const {window, warnings, infos} = createEnvironment(targets);
    loadScript(window, warnings, infos);
    window.initOnboardingTour();
    window.startOnboardingTour();
    await flushAsync();
    const overlay = window.document.getElementById('onboardingTourOverlay');
    overlay.querySelector('[data-tour-action="next"]').click();
    await flushAsync();
    overlay.querySelector('[data-tour-action="next"]').click();
    await flushAsync();
    assert(scrollCalls === 1, 'targeted step should scroll once when opened');
    const scrollListener = window.__listeners.scroll;
    assert(typeof scrollListener === 'function', 'passive scroll listener should be registered');
    scrollListener();
    assert(scrollCalls === 1, 'passive rerender should not trigger additional smooth scroll');
  }

  {
    const targets = {
      '[data-tour="review-tab"]':createElement('button', {}),
      '[data-tour="review-workspace"]':createElement('div', {}),
      '[data-tour="verdict-card"]':createElement('div', {})
    };
    const {window, warnings, infos} = createEnvironment(targets);
    loadScript(window, warnings, infos);
    window.startOnboardingTour();
    await flushAsync();
    const overlay = window.document.getElementById('onboardingTourOverlay');
    overlay.querySelector('[data-tour-action="next"]').click();
    await flushAsync();
    overlay.querySelector('[data-tour-action="next"]').click();
    await flushAsync();
    overlay.querySelector('[data-tour-action="next"]').click();
    await flushAsync();
    overlay.querySelector('[data-tour-action="next"]').click();
    await flushAsync();
    const workspaceCalls = window.__bridgeCalls.filter(call => call.type === 'showWorkspaceForTour').map(call => call.tab);
    assert(workspaceCalls.includes('scan'), 'tour should display scan workspace through the production bridge');
    assert(workspaceCalls.includes('review'), 'tour should display review workspace through the production bridge');
  }

  {
    const previous = createElement('button', {});
    const {window, warnings, infos} = createEnvironment();
    loadScript(window, warnings, infos);
    window.document.activeElement = previous;
    previous.focus = function(){ this.focusCount += 1; window.document.activeElement = this; };
    window.startOnboardingTour();
    await flushAsync();
    const overlay = window.document.getElementById('onboardingTourOverlay');
    const next = overlay.querySelector('[data-tour-action="next"]');
    assert(next.focusCount > 0, 'open should move focus into the tooltip');
    const storage = window.localStorage;
    const checkbox = overlay.querySelector('#onboardingTourDontShowAgain');
    checkbox.checked = true;
    overlay.listeners.keydown({key:'Escape', preventDefault(){}});
    assert(overlay.hidden === true, 'Escape should close the tour');
    assert(previous.focusCount > 0, 'close should restore focus');
    assert(storage.getItem('pullbackPlaybookOnboardingSeen') === null, 'Escape should not persist dont show again');
  }

  {
    const targets = {
      '[data-tour="scan-tab"]':createElement('button', {})
    };
    const {window, warnings, infos, advancedDetails} = createEnvironment(targets, {
      activeWorkspace:'track',
      advancedOpen:false
    });
    loadScript(window, warnings, infos);
    window.startOnboardingTour();
    await flushAsync();
    const overlay = window.document.getElementById('onboardingTourOverlay');
    for(let index = 0; index < 9; index += 1){
      overlay.querySelector('[data-tour-action="next"]').click();
      await flushAsync();
    }
    assert(advancedDetails.open === true, 'tour should open advanced utilities for diary/tester help');
    window.dismissOnboardingTour();
    assert(advancedDetails.open === false, 'dismiss should restore advanced utilities visibility');
    const workspaceCalls = window.__bridgeCalls.filter(call => call.type === 'restoreVisibleContext');
    assert(workspaceCalls[workspaceCalls.length - 1].workspaceTab === 'track', 'dismiss should restore the pre-tour workspace through the bridge');
  }

  {
    const targets = {
      '[data-tour="scan-tab"]':createElement('button', {})
    };
    const delayedTarget = createElement('div', {});
    delayedTarget._rect = {top:180, left:20, width:200, height:80, bottom:260, right:220};
    let reviewQueryCount = 0;
    const {window, warnings, infos} = createEnvironment(targets);
    const originalQuerySelector = window.document.querySelector.bind(window.document);
    window.document.querySelector = selector => {
      if(selector === '[data-tour="review-tab"]'){
        reviewQueryCount += 1;
        return reviewQueryCount >= 3 ? delayedTarget : null;
      }
      return originalQuerySelector(selector);
    };
    loadScript(window, warnings, infos);
    window.startOnboardingTour();
    await flushAsync();
    const overlay = window.document.getElementById('onboardingTourOverlay');
    overlay.querySelector('[data-tour-action="next"]').click();
    await flushAsync();
    overlay.querySelector('[data-tour-action="next"]').click();
    await flushAsync();
    overlay.querySelector('[data-tour-action="next"]').click();
    await flushAsync();
    overlay.querySelector('[data-tour-action="next"]').click();
    await flushAsync();
    assert(reviewQueryCount >= 3, 'tour should retry target resolution after a workspace switch');
  }

  {
    const {window, warnings, infos} = createEnvironment();
    loadScript(window, warnings, infos);
    const ids = window.__ONBOARDING_TOUR_TEST_API__.buildSteps().map(step => step.id);
    assert(ids.includes('paper-trading'), 'step model should include diary/tester step');
  }

  {
    const startApplicationSource = extractFunctionSource(appSource, 'startApplication');
    const warnings = [];
    const progress = [];
    const tradingState = {reviewCount:3, watchlistCount:5, paperTrades:1};
    const context = vm.createContext({
      console:{
        warn(...args){ warnings.push(args); }
      },
      window:{
        initOnboardingTour(){ throw new Error('boom'); }
      },
      appShell:{init(){ progress.push('appShell.init'); }},
      bindWorkspaceAnchorBridge(){ progress.push('bindWorkspaceAnchorBridge'); },
      bindReviewAdvancedDebugGesture(){ progress.push('bindReviewAdvancedDebugGesture'); },
      perfMark(){},
      perfMeasure(){},
      startupCoordinator:{},
      loadState(){ progress.push('loadState'); },
      renderRuntimeDebugPanel(){},
      setControlFocus(){},
      uiState:{controlStripPanel:'market'},
      updateControlFocusRailVisuals(){},
      $(){ return null; },
      consumeResetNotice(){ progress.push('consumeResetNotice'); },
      scheduleNamedDeferredStartupTask(name, fn){
        progress.push(name);
      },
      bootstrapMarketStatusClock(){},
      bootstrapWatchlistLifecycleAutomation(){},
      updateTickerSearchStatus(){},
      updateProviderStatusNote(){},
      refreshTrading212PaperAvailability(){ return {catch(){ return {}; }}; },
      tradingState
    });
    vm.runInContext(`${startApplicationSource}; this.__startApplication__ = startApplication;`, context, {filename:'app.js'});
    context.__startApplication__();
    assert(progress.includes('loadState'), 'startup should continue after onboarding init failure');
    assert(progress.includes('startup_post_shell_bootstrap'), 'startup should still reach deferred bootstrap scheduling');
    assert(warnings.length === 1 && warnings[0][0] === '[ONBOARDING_TOUR_INIT_FAILED]', 'startup should catch and log onboarding init failures');
    assert(JSON.stringify(tradingState) === JSON.stringify({reviewCount:3, watchlistCount:5, paperTrades:1}), 'startup guard should not mutate trading state');
  }

  console.log('onboarding tour assertions passed');
}

run().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
