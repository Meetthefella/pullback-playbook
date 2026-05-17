(function(global){
  function createAppShell(options = {}){
    const uiState = options.uiState && typeof options.uiState === 'object' ? options.uiState : {};
    const onTabChange = typeof options.onTabChange === 'function' ? options.onTabChange : null;
    const allowedTabs = new Set(['scan','review','track','diary']);
    const tabButtons = Array.from(document.querySelectorAll('[data-workspace-tab]'));
    const workspaceCards = Array.from(document.querySelectorAll('[data-workspace-card]'));
    const trackTopButton = document.getElementById('trackScrollTopBtn');
    const enabled = tabButtons.length > 0 && workspaceCards.length > 0;
    const lastKnownScrollByTab = uiState.lastKnownScrollByTab && typeof uiState.lastKnownScrollByTab === 'object'
      ? uiState.lastKnownScrollByTab
      : {};
    uiState.lastKnownScrollByTab = lastKnownScrollByTab;
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

    function nowMs(){
      return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    }

    function suppressScrollMemory(reason, durationMs = 700){
      const until = nowMs() + Math.max(0, Number(durationMs) || 0);
      uiState.suppressWorkspaceScrollSaveUntil = Math.max(Number(uiState.suppressWorkspaceScrollSaveUntil || 0), until);
      uiState.suppressWorkspaceScrollSaveReason = String(reason || 'programmatic_scroll');
      if(typeof window !== 'undefined'){
        window.__ppSuppressScrollMemoryUntil = uiState.suppressWorkspaceScrollSaveUntil;
        window.__ppScrollMemorySuppressionReason = uiState.suppressWorkspaceScrollSaveReason;
      }
    }

    function extendActiveScrollSuppression(reason, durationMs = 350){
      const safeReason = String(reason || uiState.suppressWorkspaceScrollSaveReason || 'programmatic_scroll_settling');
      const until = nowMs() + Math.max(0, Number(durationMs) || 0);
      uiState.suppressWorkspaceScrollSaveUntil = Math.max(Number(uiState.suppressWorkspaceScrollSaveUntil || 0), until);
      uiState.suppressWorkspaceScrollSaveReason = safeReason;
      if(typeof window !== 'undefined'){
        window.__ppSuppressScrollMemoryUntil = uiState.suppressWorkspaceScrollSaveUntil;
        window.__ppScrollMemorySuppressionReason = safeReason;
      }
    }

    function isWorkspaceVisiblyActive(tab){
      const normalized = normalizeTab(tab);
      if(typeof document === 'undefined') return false;
      if(String(document.body && document.body.getAttribute('data-active-workspace') || '').toLowerCase() !== normalized) return false;
      const card = workspaceCardForTab(normalized);
      return !!(card && !card.hidden && card.getAttribute('aria-hidden') !== 'true');
    }

    function saveActiveWorkspaceScroll(){
      const active = normalizeTab(uiState.activeWorkspaceTab || '');
      const suppressUntil = Math.max(
        Number(uiState.suppressWorkspaceScrollSaveUntil || 0),
        typeof window !== 'undefined' ? Number(window.__ppSuppressScrollMemoryUntil || 0) : 0
      );
      const suppressionReason = String(
        uiState.suppressWorkspaceScrollSaveReason
        || (typeof window !== 'undefined' ? window.__ppScrollMemorySuppressionReason : '')
        || 'programmatic_scroll'
      );
      const now = nowMs();
      if(now < suppressUntil){
        extendActiveScrollSuppression(`${suppressionReason}_settling`, 350);
        traceScrollEvent('track:scroll-save-suppressed', {
          caller:'saveActiveWorkspaceScroll',
          reason:suppressionReason,
          active,
          attemptedScrollY:currentScrollY(),
          savedTrackScrollY:Number.isFinite(Number(uiState.trackScrollY)) ? Number(uiState.trackScrollY) : null
        });
        return;
      }
      if(active === 'track'){
        if(!isWorkspaceVisiblyActive('track')){
          traceScrollEvent('track:scroll-save-suppressed', {
            caller:'saveActiveWorkspaceScroll',
            reason:'blocked_not_active_visible_track',
            active,
            bodyActiveTab:String(document.body && document.body.getAttribute('data-active-workspace') || ''),
            attemptedScrollY:currentScrollY(),
            savedTrackScrollY:Number.isFinite(Number(uiState.trackScrollY)) ? Number(uiState.trackScrollY) : null
          });
          return;
        }
        const oldSavedTrackScrollY = Number(uiState.trackScrollY);
        const newSavedTrackScrollY = currentScrollY();
        uiState.trackScrollY = newSavedTrackScrollY;
        lastKnownScrollByTab.track = newSavedTrackScrollY;
        uiState.pendingTrackRestoreY = null;
        if(typeof window !== 'undefined') window.__ppPendingTrackRestoreY = undefined;
        traceScrollEvent('track:scroll-save', {
          caller:'saveActiveWorkspaceScroll',
          oldSavedTrackScrollY:Number.isFinite(oldSavedTrackScrollY) ? oldSavedTrackScrollY : null,
          newSavedTrackScrollY,
          saveAcceptedReason:'active_visible_track_user_scroll'
        });
      }
      if(active === 'review'){
        uiState.reviewScrollY = currentScrollY();
        lastKnownScrollByTab.review = uiState.reviewScrollY;
      }
    }

    function scrollWindowTo(top, behavior = 'auto', reason = 'programmatic_scroll'){
      if(typeof window === 'undefined') return;
      const targetTop = Math.max(0, Math.round(top));
      suppressScrollMemory(reason, behavior === 'smooth' ? 1000 : 700);
      traceScrollEvent('scrollTo:before', {
        caller:'scrollWindowTo',
        intendedTop:targetTop,
        behavior,
        suppressionReason:reason
      });
      try{
        window.scrollTo({top:targetTop, behavior});
      }catch(_error){
        window.scrollTo(0, targetTop);
      }
      traceScrollEvent('scrollTo:after', {
        caller:'scrollWindowTo',
        intendedTop:targetTop,
        behavior,
        suppressionReason:reason
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
      scrollWindowTo(0, 'auto', 'review_initial_positioning');
    }

    function restoreWorkspaceViewportAfterOpen(tab){
      const normalized = normalizeTab(tab);
      if(normalized === 'track'){
        const restoreTarget = Number.isFinite(Number(lastKnownScrollByTab.track))
          ? Number(lastKnownScrollByTab.track)
          : Number(uiState.trackScrollY);
        if(!Number.isFinite(restoreTarget)) return;
        uiState.pendingTrackRestoreY = restoreTarget;
        if(typeof window !== 'undefined') window.__ppPendingTrackRestoreY = restoreTarget;
        traceScrollEvent('track:scroll-restore:before', {
          caller:'restoreWorkspaceViewportAfterOpen',
          savedTrackScrollY:Number(uiState.trackScrollY || 0),
          restoreTarget,
          restoreActualBefore:currentScrollY(),
          reason:'track_tab_activation'
        });
        scheduleTrackRestore(restoreTarget, 'track_tab_activation');
      }
      updateTrackScrollTopControl();
    }

    function scheduleTrackRestore(target, reason = 'track_restore'){
      const restoreTarget = Math.max(0, Number(target) || 0);
      const runRestore = attempt => {
        if(normalizeTab(uiState.activeWorkspaceTab || '') !== 'track') return;
        suppressScrollMemory(reason, 900);
        const before = currentScrollY();
        traceScrollEvent('track:scroll-restore:before', {
          caller:'scheduleTrackRestore',
          reason,
          restoreTarget,
          restoreActualBefore:before,
          attempt
        });
        scrollWindowTo(restoreTarget, 'auto', reason);
        const after = currentScrollY();
        traceScrollEvent('track:scroll-restore:after', {
          caller:'scheduleTrackRestore',
          reason,
          restoreTarget,
          restoreActualBefore:before,
          restoreActualAfter:after,
          attempt
        });
        if(attempt === 1 && Math.abs(after - restoreTarget) > 24){
          traceScrollEvent('delayed-scroll:scheduled', {
            caller:'scheduleTrackRestore',
            label:'track:scroll-restore-retry',
            restoreTarget,
            restoreActualAfter:after
          });
          if(typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'){
            window.requestAnimationFrame(() => window.requestAnimationFrame(() => runRestore(2)));
          }else{
            setTimeout(() => runRestore(2), 0);
          }
        }else{
          uiState.pendingTrackRestoreY = null;
          if(typeof window !== 'undefined') window.__ppPendingTrackRestoreY = undefined;
        }
      };
      traceScrollEvent('delayed-scroll:scheduled', {
        caller:'scheduleTrackRestore',
        label:'track:scroll-restore',
        restoreTarget,
        reason
      });
      if(typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'){
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => runRestore(1)));
      }else{
        setTimeout(() => runRestore(1), 0);
      }
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
          scrollWindowTo(0, 'auto', 'workspace_top');
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
          lastKnownScrollByTab.track = uiState.trackScrollY;
          uiState.pendingTrackRestoreY = null;
          if(typeof window !== 'undefined') window.__ppPendingTrackRestoreY = undefined;
          scrollWindowTo(workspacePageTop('track'), 'smooth', 'scroll_to_top_button');
          setTimeout(() => {
            if(normalizeTab(uiState.activeWorkspaceTab || '') === 'track'){
              uiState.trackScrollY = workspacePageTop('track');
              lastKnownScrollByTab.track = uiState.trackScrollY;
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
