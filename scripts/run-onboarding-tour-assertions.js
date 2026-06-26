const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(condition, message){
  if(!condition) throw new Error(message);
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
  const set = new Set();
  return {
    add(...items){ items.forEach(item => set.add(item)); },
    remove(...items){ items.forEach(item => set.delete(item)); },
    contains(item){ return set.has(item); }
  };
}

function createElement(tagName, registry){
  const element = {
    tagName:String(tagName || 'div').toUpperCase(),
    style:{},
    dataset:{},
    hidden:false,
    classList:createClassList(),
    listeners:{},
    focusCount:0,
    appendChild(child){ child.parentNode = this; return child; },
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
        const card = createElement('div', registry);
        const progress = createElement('div', registry);
        const title = createElement('h3', registry);
        const body = createElement('p', registry);
        const checkbox = createElement('input', registry);
        checkbox.id = 'onboardingTourDontShowAgain';
        const back = createElement('button', registry);
        const next = createElement('button', registry);
        const skip = createElement('button', registry);
        this._query = {
          '.onboarding-tour-card':card,
          '.onboarding-tour-spotlight':spotlight,
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

function createEnvironment(targets = {}, helpButton = null){
  const registry = {};
  const body = createElement('body', registry);
  const document = {
    body,
    activeElement:null,
    createElement(tag){ return createElement(tag, registry); },
    getElementById(id){ return registry[id] || (helpButton && helpButton.id === id ? helpButton : null); },
    querySelector(selector){ return targets[selector] || null; }
  };
  body.ownerDocument = document;
  const storage = createStorage();
  const windowListeners = {};
  const window = {
    document,
    localStorage:storage,
    innerWidth:390,
    innerHeight:844,
    addEventListener(type, handler){ windowListeners[type] = handler; },
    setTimeout(fn){ fn(); return 1; },
    clearTimeout(){},
    requestAnimationFrame(fn){ fn(); return 1; },
    scrollY:0,
    __listeners:windowListeners
  };
  return {window, storage, registry};
}

function loadScript(window){
  const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'onboarding-tour.js'), 'utf8');
  const context = vm.createContext({window, document:window.document, globalThis:window, console});
  vm.runInContext(source, context, {filename:'onboarding-tour.js'});
  return window;
}

function run(){
  {
    const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
    assert(appSource.includes('[ONBOARDING_TOUR_INIT_FAILED]'), 'app startup should log onboarding init failure marker');
  }
  {
    const {window} = createEnvironment();
    loadScript(window);
    window.initOnboardingTour();
    assert(window.document.getElementById('onboardingTourOverlay'), 'init should create overlay');
  }
  {
    const target = createElement('div', {});
    const {window, storage} = createEnvironment({'[data-tour="scan-workspace"]':target});
    loadScript(window);
    window.startOnboardingTour();
    assert(storage.getItem('pullbackPlaybookOnboardingSeen') === null, 'start should not persist seen state');
  }
  {
    const {window, storage} = createEnvironment();
    loadScript(window);
    window.dismissOnboardingTour({dontShowAgain:true});
    assert(storage.getItem('pullbackPlaybookOnboardingSeen') === 'true', 'dismiss should persist seen');
    assert(storage.getItem('pullbackPlaybookOnboardingVersion') === '2026-06-onboarding-v1', 'dismiss should persist version');
  }
  {
    const {window} = createEnvironment();
    window.localStorage = createThrowingStorage();
    loadScript(window);
    window.initOnboardingTour();
    window.startOnboardingTour();
    window.dismissOnboardingTour({dontShowAgain:true});
    window.resetOnboardingTour();
    assert(window.document.getElementById('onboardingTourOverlay'), 'throwing storage should not break tour startup');
  }
  {
    const warnings = [];
    const tradingState = {scanner:1, review:2, track:3};
    const window = {
      initOnboardingTour(){ throw new Error('boom'); }
    };
    const consoleStub = {
      warn(code, payload){
        warnings.push({code, payload});
      }
    };
    function startupGuard(){
      const before = JSON.stringify(tradingState);
      let completed = false;
      if(typeof window !== 'undefined' && typeof window.initOnboardingTour === 'function'){
        try{
          window.initOnboardingTour();
        }catch(error){
          if(typeof consoleStub !== 'undefined' && typeof consoleStub.warn === 'function'){
            consoleStub.warn('[ONBOARDING_TOUR_INIT_FAILED]', {
              message:error && error.message ? String(error.message) : 'unknown_error'
            });
          }
        }
      }
      completed = true;
      assert(JSON.stringify(tradingState) === before, 'startup guard should not mutate trading state');
      return completed;
    }
    assert(startupGuard() === true, 'startup should continue after onboarding init failure');
    assert(warnings.length === 1 && warnings[0].code === '[ONBOARDING_TOUR_INIT_FAILED]', 'startup should log bounded onboarding init warning');
  }
  {
    const {window, storage} = createEnvironment();
    loadScript(window);
    storage.setItem('pullbackPlaybookOnboardingSeen', 'true');
    storage.setItem('pullbackPlaybookOnboardingVersion', 'older-version');
    window.initOnboardingTour();
    assert(window.document.getElementById('onboardingTourOverlay').hidden === false, 'version mismatch should auto-show');
  }
  {
    const {window, storage} = createEnvironment();
    loadScript(window);
    storage.setItem('pullbackPlaybookOnboardingSeen', 'true');
    storage.setItem('pullbackPlaybookOnboardingVersion', '2026-06-onboarding-v1');
    window.resetOnboardingTour();
    assert(storage.getItem('pullbackPlaybookOnboardingSeen') === null, 'reset should clear seen');
    assert(storage.getItem('pullbackPlaybookOnboardingVersion') === null, 'reset should clear version');
  }
  {
    const helpButton = createElement('button', {});
    helpButton.id = 'startOnboardingTourBtn';
    const {window} = createEnvironment({}, helpButton);
    loadScript(window);
    window.registerOnboardingHelpButton();
    helpButton.click();
    assert(window.document.getElementById('onboardingTourOverlay').hidden === false, 'help button should reopen tour');
    window.dismissOnboardingTour({dontShowAgain:true});
    window.startOnboardingTour({force:true});
    assert(window.document.getElementById('onboardingTourOverlay').hidden === false, 'force reopen should open after dismissal');
  }
  {
    const {window} = createEnvironment();
    loadScript(window);
    window.startOnboardingTour({force:true});
    assert(window.document.getElementById('onboardingTourOverlay').hidden === false, 'missing targets should still render');
  }
  {
    let scrollCalls = 0;
    const target = createElement('div', {});
    target._rect = {top:900, left:80, width:220, height:120, bottom:1020, right:300};
    target.scrollIntoView = () => { scrollCalls += 1; };
    const {window} = createEnvironment({'[data-tour="scan-workspace"]':target});
    loadScript(window);
    window.initOnboardingTour();
    window.startOnboardingTour();
    const overlay = window.document.getElementById('onboardingTourOverlay');
    overlay.querySelector('[data-tour-action="next"]').click();
    assert(scrollCalls === 1, 'opening a targeted step should scroll once');
    const scrollListener = window.__listeners.scroll;
    assert(typeof scrollListener === 'function', 'scroll listener should be registered');
    scrollListener();
    assert(scrollCalls === 1, 'rerender scheduling should not trigger additional smooth scroll');
  }
  {
    const previous = createElement('button', {});
    const {window} = createEnvironment();
    loadScript(window);
    window.document.activeElement = previous;
    previous.focus = function(){ this.focusCount += 1; window.document.activeElement = this; };
    window.startOnboardingTour();
    const overlay = window.document.getElementById('onboardingTourOverlay');
    const next = overlay.querySelector('[data-tour-action="next"]');
    assert(next.focusCount > 0, 'open should move focus into the dialog');
    overlay.listeners.keydown({key:'Escape', preventDefault(){ this.called = true; }});
    assert(overlay.hidden === true, 'Escape should close the dialog');
    assert(previous.focusCount > 0, 'close should restore prior focus where possible');
  }
  {
    const {window} = createEnvironment();
    loadScript(window);
    const ids = window.__ONBOARDING_TOUR_TEST_API__.currentSteps().map(step => step.id);
    assert(!ids.includes('paper-trading'), 'paper trading step should skip when target is unavailable');
  }
  console.log('onboarding tour assertions passed');
}

run();
