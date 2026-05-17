(function(global){
  function createAppShell(options = {}){
    const uiState = options.uiState && typeof options.uiState === 'object' ? options.uiState : {};
    const onTabChange = typeof options.onTabChange === 'function' ? options.onTabChange : null;
    const allowedTabs = new Set(['scan','review','track','diary']);
    const tabButtons = Array.from(document.querySelectorAll('[data-workspace-tab]'));
    const workspaceCards = Array.from(document.querySelectorAll('[data-workspace-card]'));
    const trackTopButton = document.getElementById('trackScrollTopBtn');
    const enabled = tabButtons.length > 0 && workspaceCards.length > 0;

    function normalizeTab(value){
      const tab = String(value || '').trim().toLowerCase();
      return allowedTabs.has(tab) ? tab : 'scan';
    }

    function workspaceForElement(element){
      if(!element || typeof element.closest !== 'function') return '';
      const card = element.closest('[data-workspace-card]');
      return card ? normalizeTab(card.getAttribute('data-workspace-card')) : '';
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
      try{
        workspace.focus({preventScroll:true});
      }catch(error){}
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

    function scrollWindowTo(top, behavior = 'auto'){
      if(typeof window === 'undefined') return;
      try{
        window.scrollTo({top:Math.max(0, Math.round(top)), behavior});
      }catch(_error){
        window.scrollTo(0, Math.max(0, Math.round(top)));
      }
    }

    function primeWorkspaceViewportBeforeOpen(tab){
      const normalized = normalizeTab(tab);
      if(normalized !== 'review') return;
      scrollWindowTo(0, 'auto');
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
      blurFocusedElementForTab(nextTab);
      primeWorkspaceViewportBeforeOpen(nextTab);
      const appliedTab = applyWorkspace(nextTab);
      focusWorkspaceContainer(appliedTab, options);
      const shouldFocusTop = !['track','review'].includes(appliedTab)
        && (options.focusTop === true || options.focusTop !== false);
      if(shouldFocusTop){
        try{
          window.scrollTo({top:0, behavior:'auto'});
        }catch(error){}
      }
      updateTrackScrollTopControl();
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
          updateTrackScrollTopControl();
        }, {passive:true});
      }
      if(trackTopButton){
        trackTopButton.addEventListener('click', () => {
          if(normalizeTab(uiState.activeWorkspaceTab || '') !== 'track') return;
          scrollWindowTo(workspacePageTop('track'), 'smooth');
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
