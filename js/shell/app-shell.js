(function(global){
  function createAppShell(options = {}){
    const uiState = options.uiState && typeof options.uiState === 'object' ? options.uiState : {};
    const onTabChange = typeof options.onTabChange === 'function' ? options.onTabChange : null;
    const allowedTabs = new Set(['scan','review','track','diary']);
    const tabButtons = Array.from(document.querySelectorAll('[data-workspace-tab]'));
    const workspaceCards = Array.from(document.querySelectorAll('[data-workspace-card]'));
    const trackTopButton = document.getElementById('trackScrollTopBtn');
    const enabled = tabButtons.length > 0 && workspaceCards.length > 0;
    let lastObservedScrollY = typeof window !== 'undefined' ? Number(window.scrollY || window.pageYOffset || 0) : 0;
    let lastObservedScrollAt = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();

    function normalizeTab(value){
      const tab = String(value || '').trim().toLowerCase();
      return allowedTabs.has(tab) ? tab : 'scan';
    }

    function workspaceForElement(element){
      if(!element || typeof element.closest !== 'function') return '';
      const card = element.closest('[data-workspace-card]');
      return card ? normalizeTab(card.getAttribute('data-workspace-card')) : '';
    }

    function traceScrollEvent(label, details = {}){
      if(typeof window === 'undefined' || window.PP_SCROLL_TRACE !== true) return;
      const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
      const scrollY = Number(window.scrollY || window.pageYOffset || 0);
      const payload = {
        label:String(label || ''),
        activeTab:normalizeTab(uiState.activeWorkspaceTab || ''),
        scrollY,
        viewportH:Number(window.innerHeight || 0),
        docH:Number(document && document.documentElement ? document.documentElement.scrollHeight || 0 : 0),
        time:Math.round(now),
        ...details,
        stack:details.stack || (new Error().stack)
      };
      window.__ppRecentScrollAction = {
        label:payload.label,
        time:payload.time,
        details:{...details, scrollY}
      };
      console.log('[SCROLL_TRACE]', payload);
    }

    if(typeof window !== 'undefined'){
      window.traceScrollEvent = window.traceScrollEvent || traceScrollEvent;
    }

    function blurFocusedElementForTab(nextTab){
      if(typeof document === 'undefined') return;
      const focused = document.activeElement;
      if(!focused || focused === document.body) return;
      const focusedWorkspace = workspaceForElement(focused);
      if(!focusedWorkspace || focusedWorkspace === nextTab) return;
      if(typeof focused.blur === 'function'){
        try{
          focused.blur();
        }catch(error){}
      }
    }

    function focusWorkspaceContainer(nextTab, options = {}){
      if(typeof document === 'undefined') return;
      const workspace = workspaceCards.find(card => normalizeTab(card.getAttribute('data-workspace-card')) === nextTab);
      if(!workspace) return;
      if(!workspace.hasAttribute('tabindex')) workspace.setAttribute('tabindex', '-1');
      if(options.focusWorkspace === false) return;
      if(typeof workspace.focus !== 'function') return;
      traceScrollEvent(`${nextTab}:focus:before`, {
        caller:'focusWorkspaceContainer',
        target:`[data-workspace-card="${nextTab}"]`,
        options:{preventScroll:true}
      });
      try{
        workspace.focus({preventScroll:true});
      }catch(error){}
      traceScrollEvent(`${nextTab}:focus:after`, {
        caller:'focusWorkspaceContainer',
        target:`[data-workspace-card="${nextTab}"]`
      });
    }

    function workspaceCardForTab(tab){
      const normalized = normalizeTab(tab);
      return workspaceCards.find(card => normalizeTab(card.getAttribute('data-workspace-card')) === normalized) || null;
    }

    function workspacePageTop(tab){
      const card = workspaceCardForTab(tab);
      if(!card || typeof card.getBoundingClientRect !== 'function') return 0;
      const scrollY = typeof window !== 'undefined' ? Number(window.scrollY || window.pageYOffset || 0) : 0;
      return Math.max(0, Number(card.getBoundingClientRect().top || 0) + scrollY);
    }

    function updateTrackScrollTopControl(){
      if(!trackTopButton || typeof window === 'undefined') return;
      const active = normalizeTab(uiState.activeWorkspaceTab || '') === 'track';
      const scrollY = Number(window.scrollY || window.pageYOffset || 0);
      const threshold = Math.max(400, Math.round(Number(window.innerHeight || 0) * 0.75));
      const trackTop = workspacePageTop('track');
      const distance = Math.max(0, scrollY - trackTop);
      const visible = active && distance > threshold;
      trackTopButton.hidden = !visible;
      trackTopButton.classList.toggle('is-visible', visible);
    }

    function currentScrollY(){
      return typeof window !== 'undefined' ? Number(window.scrollY || window.pageYOffset || 0) : 0;
    }

    function saveActiveWorkspaceScroll(){
      const active = normalizeTab(uiState.activeWorkspaceTab || '');
      if(active === 'track'){
        const oldSavedTrackScrollY = Number(uiState.trackScrollY);
        const newSavedTrackScrollY = currentScrollY();
        uiState.trackScrollY = newSavedTrackScrollY;
        traceScrollEvent('track:scroll-save', {
          caller:'saveActiveWorkspaceScroll',
          oldSavedTrackScrollY:Number.isFinite(oldSavedTrackScrollY) ? oldSavedTrackScrollY : null,
          newSavedTrackScrollY
        });
      }
      if(active === 'review') uiState.reviewScrollY = currentScrollY();
    }

    function scrollWindowTo(top, behavior = 'auto'){
      if(typeof window === 'undefined') return;
      const targetTop = Math.max(0, Math.round(top));
      traceScrollEvent('scrollTo:before', {
        caller:'scrollWindowTo',
        intendedTop:targetTop,
        behavior
      });
      try{
        window.scrollTo({top:targetTop, behavior});
      }catch(_error){
        window.scrollTo(0, targetTop);
      }
      traceScrollEvent('scrollTo:after', {
        caller:'scrollWindowTo',
        intendedTop:targetTop,
        behavior
      });
    }

    function primeWorkspaceViewportBeforeOpen(tab){
      const normalized = normalizeTab(tab);
      if(normalized !== 'review') return;
      traceScrollEvent('review:initial-top-check', {
        caller:'primeWorkspaceViewportBeforeOpen',
        reviewHasInitialTopPositioned:uiState.reviewInitialTopPositioned === true,
        targetScrollY:0,
        reason:'review_tab_activation'
      });
      if(uiState.reviewInitialTopPositioned === true){
        traceScrollEvent('review:initial-top-skip', {
          caller:'primeWorkspaceViewportBeforeOpen',
          reviewHasInitialTopPositioned:true,
          reason:'already_positioned'
        });
        return;
      }
      uiState.reviewInitialTopPositioned = true;
      traceScrollEvent('review:initial-top-apply', {
        caller:'primeWorkspaceViewportBeforeOpen',
        reviewHasInitialTopPositioned:true,
        targetScrollY:0,
        reason:'first_review_focus'
      });
      scrollWindowTo(0, 'auto');
    }

    function restoreWorkspaceViewportAfterOpen(tab){
      const normalized = normalizeTab(tab);
      if(normalized === 'track' && Number.isFinite(Number(uiState.trackScrollY))){
        traceScrollEvent('track:scroll-restore:before', {
          caller:'restoreWorkspaceViewportAfterOpen',
          savedTrackScrollY:Number(uiState.trackScrollY || 0),
          reason:'track_tab_activation'
        });
        scrollWindowTo(Number(uiState.trackScrollY || 0), 'auto');
        traceScrollEvent('track:scroll-restore:after', {
          caller:'restoreWorkspaceViewportAfterOpen',
          savedTrackScrollY:Number(uiState.trackScrollY || 0),
          reason:'track_tab_activation'
        });
      }
      if(normalized === 'review' && uiState.reviewInitialTopPositioned === true && Number.isFinite(Number(uiState.reviewScrollY))){
        scrollWindowTo(Number(uiState.reviewScrollY || 0), 'auto');
      }
      updateTrackScrollTopControl();
    }

    function applyWorkspace(tab){
      const nextTab = normalizeTab(tab);
      uiState.activeWorkspaceTab = nextTab;
      document.body.setAttribute('data-active-workspace', nextTab);
      workspaceCards.forEach(card => {
        const active = String(card.getAttribute('data-workspace-card') || '').trim().toLowerCase() === nextTab;
        card.hidden = !active;
        if(active){
          card.removeAttribute('inert');
          card.removeAttribute('aria-hidden');
          if(!card.hasAttribute('tabindex')) card.setAttribute('tabindex', '-1');
        }else{
          card.setAttribute('inert', '');
          card.setAttribute('aria-hidden', 'true');
        }
        card.classList.toggle('is-active-workspace', active);
      });
      tabButtons.forEach(button => {
        const active = String(button.getAttribute('data-workspace-tab') || '').trim().toLowerCase() === nextTab;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-selected', active ? 'true' : 'false');
        button.setAttribute('tabindex', active ? '0' : '-1');
      });
      if(onTabChange) onTabChange(nextTab);
      return nextTab;
    }

    function switchWorkspace(tab, options = {}){
      const nextTab = normalizeTab(tab);
      traceScrollEvent('tab:switch:before', {
        caller:'switchWorkspace',
        fromTab:normalizeTab(uiState.activeWorkspaceTab || ''),
        toTab:nextTab,
        options
      });
      saveActiveWorkspaceScroll();
      blurFocusedElementForTab(nextTab);
      primeWorkspaceViewportBeforeOpen(nextTab);
      const appliedTab = applyWorkspace(nextTab);
      focusWorkspaceContainer(appliedTab, options);
      restoreWorkspaceViewportAfterOpen(appliedTab);
      const shouldFocusTop = !['track','review'].includes(appliedTab)
        && (options.focusTop === true || options.focusTop !== false);
      if(shouldFocusTop){
        try{
          window.scrollTo({top:0, behavior:'auto'});
        }catch(error){}
      }
      updateTrackScrollTopControl();
      traceScrollEvent('tab:switch:after', {
        caller:'switchWorkspace',
        appliedTab
      });
      return appliedTab;
    }

    function setActiveWorkspace(tab, options = {}){
      return switchWorkspace(tab, options);
    }

    function getActiveWorkspace(){
      return normalizeTab(uiState.activeWorkspaceTab || 'scan');
    }

    function init(){
      if(!enabled) return;
      tabButtons.forEach(button => {
        button.addEventListener('click', () => {
          const tab = button.getAttribute('data-workspace-tab');
          switchWorkspace(tab);
        });
      });
      if(typeof window !== 'undefined'){
        window.addEventListener('scroll', () => {
          const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
          const nextScrollY = currentScrollY();
          const delta = nextScrollY - lastObservedScrollY;
          if(window.PP_SCROLL_TRACE === true && ['track','review'].includes(normalizeTab(uiState.activeWorkspaceTab || '')) && Math.abs(delta) > 80 && (now - lastObservedScrollAt) <= 250){
            traceScrollEvent('scroll:observed-jump', {
              from:lastObservedScrollY,
              to:nextScrollY,
              delta,
              activeTab:normalizeTab(uiState.activeWorkspaceTab || ''),
              recentAction:window.__ppRecentScrollAction || null
            });
          }
          lastObservedScrollY = nextScrollY;
          lastObservedScrollAt = now;
          saveActiveWorkspaceScroll();
          updateTrackScrollTopControl();
        }, {passive:true});
      }
      if(trackTopButton){
        trackTopButton.addEventListener('click', () => {
          if(normalizeTab(uiState.activeWorkspaceTab || '') !== 'track') return;
          uiState.trackScrollY = workspacePageTop('track');
          scrollWindowTo(workspacePageTop('track'), 'smooth');
          setTimeout(() => {
            if(normalizeTab(uiState.activeWorkspaceTab || '') === 'track'){
              uiState.trackScrollY = workspacePageTop('track');
              updateTrackScrollTopControl();
            }
          }, 450);
        });
      }
      applyWorkspace(getActiveWorkspace());
      updateTrackScrollTopControl();
    }

    return {
      init,
      setActiveWorkspace,
      getActiveWorkspace,
      isEnabled:() => enabled
    };
  }

  global.AppShell = Object.assign({}, global.AppShell, {
    createAppShell
  });
})(window);
