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
    let trackScrollSaveRaf = 0;
    let trackScrollSaveFinalTimer = 0;
    let trackSuppressedSaveRaf = 0;
    let pendingTrackScrollSave = null;
    let pendingSuppressedTrackScrollSave = null;
    let lastTrackScrollTraceAt = 0;
    let lastSuppressedTrackScrollTraceAt = 0;
    let postRestoreSnapApplied = false;

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
        ...details
      };
      if(window.PP_SCROLL_TRACE_STACKS === true){
        payload.stack = details.stack || (new Error().stack);
      }
      window.__ppRecentScrollAction = {
        label:payload.label,
        time:payload.time,
        details:{...details, scrollY}
      };
      console.log('[SCROLL_TRACE]', payload);
    }

    function trackTimingDebugEnabled(){
      try{
        if(typeof window !== 'undefined' && window.PP_DEBUG_TRACK_TIMING === true) return true;
        if(typeof window !== 'undefined' && window.localStorage){
          return window.localStorage.getItem('PP_DEBUG_TRACK_TIMING') === '1';
        }
      }catch(_error){}
      return false;
    }

    function markTrackTiming(name){
      if(!trackTimingDebugEnabled() || typeof performance === 'undefined' || typeof performance.mark !== 'function') return;
      try{ performance.mark(name); }catch(_error){}
    }

    function measureTrackTiming(restoreTarget, actualFinalScrollY, verifyRetries, revealStrategy){
      if(!trackTimingDebugEnabled() || typeof performance === 'undefined') return;
      try{
        if(typeof performance.mark === 'function') performance.mark('track-visible');
        if(typeof performance.measure === 'function') performance.measure('review-to-track-visible', 'track-switch-start', 'track-visible');
        const measures = typeof performance.getEntriesByName === 'function'
          ? performance.getEntriesByName('review-to-track-visible')
          : [];
        const latest = measures && measures.length ? measures[measures.length - 1] : null;
        if(typeof console !== 'undefined' && console.info){
          console.info('[TRACK_TIMING]', {
            durationMs:latest ? Math.round(Number(latest.duration || 0)) : null,
            restoreTarget,
            actualFinalScrollY,
            verifyRetries,
            revealStrategy
          });
        }
      }catch(_error){}
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

    function computedHtmlScrollBehavior(){
      if(typeof window === 'undefined' || typeof document === 'undefined' || !document.documentElement) return '';
      try{
        return String(window.getComputedStyle(document.documentElement).scrollBehavior || '');
      }catch(_error){
        return '';
      }
    }

    function setSmoothScrollDisabled(disabled, reason = 'track_restore'){
      if(typeof document === 'undefined' || !document.documentElement) return;
      document.documentElement.classList.toggle('no-smooth-scroll', disabled === true);
      traceScrollEvent(disabled === true ? 'scroll:smooth-disabled' : 'scroll:smooth-restored', {
        caller:'setSmoothScrollDisabled',
        reason,
        computedHtmlScrollBehavior:computedHtmlScrollBehavior(),
        restoreInProgress:uiState.trackRestoreInProgress === true,
        activeSmoothDisabled:document.documentElement.classList.contains('no-smooth-scroll')
      });
    }

    function isTrackRestorePending(){
      return normalizeTab(uiState.activeWorkspaceTab || '') === 'track'
        && (uiState.trackRestoreInProgress === true || uiState.trackRevealPending === true);
    }

    function isPostTrackRestoreGuardActive(){
      return normalizeTab(uiState.activeWorkspaceTab || '') === 'track'
        && Number(uiState.postTrackRestoreGuardUntil || 0) > nowMs();
    }

    function activeTrackRestoreTarget(){
      const pending = Number(uiState.pendingTrackRestoreY);
      if(Number.isFinite(pending)) return pending;
      if(typeof window !== 'undefined'){
        const globalPending = Number(window.__ppPendingTrackRestoreY);
        if(Number.isFinite(globalPending)) return globalPending;
      }
      const remembered = Number(lastKnownScrollByTab.track);
      if(Number.isFinite(remembered)) return remembered;
      const fallback = Number(uiState.trackScrollY);
      return Number.isFinite(fallback) ? fallback : null;
    }

    function postTrackRestoreTarget(){
      const target = Number(uiState.postTrackRestoreTarget);
      return Number.isFinite(target) ? target : activeTrackRestoreTarget();
    }

    function isProgrammaticTrackRestoreAllowed(reason = ''){
      const safeReason = String(reason || '');
      return safeReason.indexOf('track_restore') >= 0 || safeReason === 'track_tab_activation';
    }

    function installTrackRestoreScrollDriverGuard(){
      if(typeof window === 'undefined' || window.__ppTrackScrollDriverGuardInstalled === true) return;
      window.__ppTrackScrollDriverGuardInstalled = true;
      const nativeScrollTo = window.scrollTo ? window.scrollTo.bind(window) : null;
      const nativeScrollBy = window.scrollBy ? window.scrollBy.bind(window) : null;
      const nativeScrollIntoView = typeof Element !== 'undefined' && Element.prototype && Element.prototype.scrollIntoView
        ? Element.prototype.scrollIntoView
        : null;
      const shouldBlock = () => {
        if(window.__ppAllowTrackRestoreScrollDriver === true) return false;
        return isTrackRestorePending();
      };
      if(nativeScrollTo){
        window.scrollTo = function guardedScrollTo(...args){
          if(shouldBlock()){
            traceScrollEvent('scroll-driver:scrollTo', {
              caller:'native_scrollTo_guard',
              blocked:true,
              args,
              restoreTarget:activeTrackRestoreTarget(),
              restoreInProgress:uiState.trackRestoreInProgress === true,
              revealPending:uiState.trackRevealPending === true
            });
            return undefined;
          }
          return nativeScrollTo(...args);
        };
      }
      if(nativeScrollBy){
        window.scrollBy = function guardedScrollBy(...args){
          if(shouldBlock()){
            traceScrollEvent('scroll-driver:scrollBy', {
              caller:'native_scrollBy_guard',
              blocked:true,
              args,
              restoreTarget:activeTrackRestoreTarget(),
              restoreInProgress:uiState.trackRestoreInProgress === true,
              revealPending:uiState.trackRevealPending === true
            });
            return undefined;
          }
          return nativeScrollBy(...args);
        };
      }
      if(nativeScrollIntoView){
        Element.prototype.scrollIntoView = function guardedScrollIntoView(...args){
          if(shouldBlock()){
            traceScrollEvent('scroll-driver:scrollIntoView', {
              caller:'native_scrollIntoView_guard',
              blocked:true,
              target:this && (this.id ? `#${this.id}` : String(this.className || this.tagName || 'element')),
              args,
              restoreTarget:activeTrackRestoreTarget(),
              restoreInProgress:uiState.trackRestoreInProgress === true,
              revealPending:uiState.trackRevealPending === true
            });
            return undefined;
          }
          return nativeScrollIntoView.apply(this, args);
        };
      }
    }

    function revealTraceLabelForReason(reason, pending){
      if(pending === true) return 'track:reveal:pending';
      const safeReason = String(reason || '');
      if(safeReason === 'track_restore_verify_complete' || safeReason === 'verified_restore') return 'track:reveal:after-verified-restore';
      if(safeReason === 'restore_reveal_timeout' || safeReason === 'fallback_timeout' || safeReason === 'layout_wait_limit_reached') return 'track:reveal:fallback';
      return 'track:reveal:after-restore';
    }

    function setTrackRevealPending(pending, reason = 'track_restore'){
      if(typeof document === 'undefined' || !document.body) return;
      document.body.classList.toggle('track-restore-pending', pending === true);
      uiState.trackRevealPending = pending === true;
      if(pending === true){
        traceScrollEvent('tab:visual-hold', {
          caller:'setTrackRevealPending',
          pendingTab:'track',
          visibleSurface:'restore_overlay',
          reason
        });
        traceScrollEvent('track:restore-overlay-visible', {
          caller:'setTrackRevealPending',
          reason,
          restoreTarget:Number.isFinite(Number(uiState.pendingTrackRestoreY)) ? Number(uiState.pendingTrackRestoreY) : null
        });
      }else{
        traceScrollEvent('tab:visual-swap-after-restore', {
          caller:'setTrackRevealPending',
          visibleTab:'track',
          reason
        });
      }
      traceScrollEvent(revealTraceLabelForReason(reason, pending === true), {
        caller:'setTrackRevealPending',
        reason,
        restoreTarget:Number.isFinite(Number(uiState.pendingTrackRestoreY)) ? Number(uiState.pendingTrackRestoreY) : null,
        actualY:currentScrollY(),
        trackRevealPending:pending === true,
        panelHiddenBeforeActivate:pending === true
      });
    }

    function clearTrackRevealPending(reason = 'track_restore_complete'){
      setTrackRevealPending(false, reason);
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

    function scrollSaveSuppressionState(){
      const suppressUntil = Math.max(
        Number(uiState.suppressWorkspaceScrollSaveUntil || 0),
        typeof window !== 'undefined' ? Number(window.__ppSuppressScrollMemoryUntil || 0) : 0
      );
      const suppressionReason = String(
        uiState.suppressWorkspaceScrollSaveReason
        || (typeof window !== 'undefined' ? window.__ppScrollMemorySuppressionReason : '')
        || 'programmatic_scroll'
      );
      return {suppressUntil, suppressionReason, suppressed:nowMs() < suppressUntil};
    }

    function traceSuppressedTrackScrollSave(payload = {}){
      pendingSuppressedTrackScrollSave = {
        ...pendingSuppressedTrackScrollSave,
        ...payload,
        attemptedScrollY:currentScrollY(),
        savedTrackScrollY:Number.isFinite(Number(uiState.trackScrollY)) ? Number(uiState.trackScrollY) : null
      };
      const now = nowMs();
      if((now - lastSuppressedTrackScrollTraceAt) < 150) return;
      lastSuppressedTrackScrollTraceAt = now;
      if(trackSuppressedSaveRaf || typeof window === 'undefined') return;
      trackSuppressedSaveRaf = window.requestAnimationFrame ? window.requestAnimationFrame(() => {
        trackSuppressedSaveRaf = 0;
        if(!pendingSuppressedTrackScrollSave) return;
        traceScrollEvent('track:scroll-save-suppressed', {
          caller:'coalescedTrackScrollSave',
          ...pendingSuppressedTrackScrollSave
        });
        pendingSuppressedTrackScrollSave = null;
      }) : 0;
      if(!trackSuppressedSaveRaf){
        traceScrollEvent('track:scroll-save-suppressed', {
          caller:'coalescedTrackScrollSave',
          ...pendingSuppressedTrackScrollSave
        });
        pendingSuppressedTrackScrollSave = null;
      }
    }

    function commitTrackScrollMemory(scrollY, traceLabel = 'track:scroll-save-throttled'){
      const oldSavedTrackScrollY = Number(uiState.trackScrollY);
      const newSavedTrackScrollY = Number(scrollY);
      if(!Number.isFinite(newSavedTrackScrollY)) return;
      uiState.trackScrollY = newSavedTrackScrollY;
      lastKnownScrollByTab.track = newSavedTrackScrollY;
      uiState.pendingTrackRestoreY = null;
      if(typeof window !== 'undefined') window.__ppPendingTrackRestoreY = undefined;
      traceScrollEvent(traceLabel, {
        caller:'commitTrackScrollMemory',
        oldSavedTrackScrollY:Number.isFinite(oldSavedTrackScrollY) ? oldSavedTrackScrollY : null,
        newSavedTrackScrollY,
        saveAcceptedReason:'active_visible_track_user_scroll'
      });
    }

    function queueTrackScrollMemorySave(scrollY){
      const active = normalizeTab(uiState.activeWorkspaceTab || '');
      if(active !== 'track') return;
      const {suppressed, suppressionReason} = scrollSaveSuppressionState();
      if(isPostTrackRestoreGuardActive()){
        traceSuppressedTrackScrollSave({
          reason:'post_restore_guard',
          active,
          attemptedScrollY:scrollY,
          restoreTarget:postTrackRestoreTarget()
        });
        return;
      }
      if(suppressed){
        traceSuppressedTrackScrollSave({
          reason:suppressionReason,
          active,
          attemptedScrollY:scrollY
        });
        return;
      }
      if(!isWorkspaceVisiblyActive('track')){
        traceSuppressedTrackScrollSave({
          reason:'blocked_not_active_visible_track',
          active,
          bodyActiveTab:String(document.body && document.body.getAttribute('data-active-workspace') || ''),
          attemptedScrollY:scrollY
        });
        return;
      }
      const nextY = Number(scrollY);
      if(!Number.isFinite(nextY)) return;
      uiState.trackScrollY = nextY;
      lastKnownScrollByTab.track = nextY;
      uiState.pendingTrackRestoreY = null;
      if(typeof window !== 'undefined') window.__ppPendingTrackRestoreY = undefined;
      pendingTrackScrollSave = {scrollY:nextY};
      const now = nowMs();
      if(!trackScrollSaveRaf && typeof window !== 'undefined' && (now - lastTrackScrollTraceAt) >= 125){
        lastTrackScrollTraceAt = now;
        trackScrollSaveRaf = window.requestAnimationFrame ? window.requestAnimationFrame(() => {
          trackScrollSaveRaf = 0;
          if(!pendingTrackScrollSave) return;
          commitTrackScrollMemory(pendingTrackScrollSave.scrollY, 'track:scroll-save-throttled');
        }) : 0;
      }
      if(trackScrollSaveFinalTimer) clearTimeout(trackScrollSaveFinalTimer);
      trackScrollSaveFinalTimer = setTimeout(() => {
        trackScrollSaveFinalTimer = 0;
        if(!pendingTrackScrollSave) return;
        commitTrackScrollMemory(pendingTrackScrollSave.scrollY, 'track:scroll-save-final');
        pendingTrackScrollSave = null;
      }, 200);
    }

    function saveActiveWorkspaceScroll(options = {}){
      const active = normalizeTab(uiState.activeWorkspaceTab || '');
      const {suppressed, suppressionReason} = scrollSaveSuppressionState();
      if(suppressed){
        if(options.extendSuppression !== false) extendActiveScrollSuppression(`${suppressionReason}_settling`, 350);
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
        traceScrollEvent(options.traceLabel || 'track:scroll-save-final', {
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
      if(isTrackRestorePending() && !isProgrammaticTrackRestoreAllowed(reason)){
        traceScrollEvent('scroll-driver:restore-blocked', {
          caller:'scrollWindowTo',
          reason,
          targetY:targetTop,
          restoreTarget:activeTrackRestoreTarget(),
          trackRevealPending:uiState.trackRevealPending === true,
          restoreInProgress:uiState.trackRestoreInProgress === true
        });
        return;
      }
      suppressScrollMemory(reason, behavior === 'smooth' ? 1000 : 700);
      traceScrollEvent('scrollTo:before', {
        caller:'scrollWindowTo',
        intendedTop:targetTop,
        targetY:targetTop,
        behavior,
        requestedBehavior:behavior,
        computedHtmlScrollBehavior:computedHtmlScrollBehavior(),
        restoreInProgress:uiState.trackRestoreInProgress === true,
        activeSmoothDisabled:typeof document !== 'undefined' && !!(document.documentElement && document.documentElement.classList.contains('no-smooth-scroll')),
        suppressionReason:reason
      });
      try{
        window.__ppAllowTrackRestoreScrollDriver = isProgrammaticTrackRestoreAllowed(reason);
        window.scrollTo({top:targetTop, behavior});
      }catch(_error){
        window.__ppAllowTrackRestoreScrollDriver = isProgrammaticTrackRestoreAllowed(reason);
        window.scrollTo(0, targetTop);
      }finally{
        window.__ppAllowTrackRestoreScrollDriver = false;
      }
      traceScrollEvent('scrollTo:after', {
        caller:'scrollWindowTo',
        intendedTop:targetTop,
        targetY:targetTop,
        behavior,
        requestedBehavior:behavior,
        computedHtmlScrollBehavior:computedHtmlScrollBehavior(),
        restoreInProgress:uiState.trackRestoreInProgress === true,
        activeSmoothDisabled:typeof document !== 'undefined' && !!(document.documentElement && document.documentElement.classList.contains('no-smooth-scroll')),
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
      setSmoothScrollDisabled(true, 'review_initial_positioning');
      scrollWindowTo(0, 'auto', 'review_initial_positioning');
      setTimeout(() => setSmoothScrollDisabled(false, 'review_initial_positioning_complete'), 250);
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
        scheduleTrackRestore(restoreTarget, 'track_tab_activation', {immediate:true});
      }
      updateTrackScrollTopControl();
    }

    function trackRestoreLayoutMetrics(target){
      const docH = Number(document && document.documentElement ? document.documentElement.scrollHeight || 0 : 0);
      const viewportH = Number(window && window.innerHeight || 0);
      const maxScrollableY = Math.max(0, docH - viewportH);
      const restoreTarget = Math.max(0, Number(target) || 0);
      const scrollableToTarget = maxScrollableY >= Math.max(0, restoreTarget - 24);
      const lastStableTrackDocH = Math.max(
        Number(uiState.lastStableTrackDocH || 0),
        typeof window !== 'undefined' ? Number(window.__ppLastStableTrackDocH || 0) : 0
      );
      const renderComplete = !(uiState.trackRenderInFlight === true || (typeof window !== 'undefined' && window.__ppTrackRenderInFlight === true));
      const nearLastStableHeight = !Number.isFinite(lastStableTrackDocH)
        || lastStableTrackDocH <= 0
        || docH >= Math.max(0, lastStableTrackDocH - 96);
      return {
        restoreTarget,
        docH,
        viewportH,
        maxScrollableY,
        canRestore:scrollableToTarget,
        scrollableToTarget,
        lastStableTrackDocH:Number.isFinite(lastStableTrackDocH) ? lastStableTrackDocH : 0,
        renderComplete,
        nearLastStableHeight
      };
    }

    function canRestoreTrackScroll(target){
      if(typeof document === 'undefined' || typeof window === 'undefined') return true;
      return trackRestoreLayoutMetrics(target).canRestore;
    }

    function scheduleTrackRestore(target, reason = 'track_restore', options = {}){
      const restoreTarget = Math.max(0, Number(target) || 0);
      const concealUntilRestored = restoreTarget > 24;
      const restoreRunId = (Number(uiState.trackRestoreRunId || 0) + 1);
      uiState.trackRestoreRunId = restoreRunId;
      uiState.trackRevealCompleted = false;
      uiState.trackRestoreCompletionCommitted = false;
      uiState.trackRestoreInProgress = true;
      if(typeof window !== 'undefined') window.__ppTrackRestoreInProgress = true;
      if(concealUntilRestored) setTrackRevealPending(true, reason);
      setSmoothScrollDisabled(true, reason);
      let layoutWaitCount = 0;
      let verifyRetries = 0;
      let lastLayoutDocH = 0;
      let stableLayoutFrames = 0;
      let lastLayoutNotReadyTraceAt = 0;
      const stableLayoutMetrics = () => {
        const metrics = trackRestoreLayoutMetrics(restoreTarget);
        if(Math.abs(metrics.docH - lastLayoutDocH) <= 12){
          stableLayoutFrames += 1;
        }else{
          stableLayoutFrames = 0;
          lastLayoutDocH = metrics.docH;
        }
        const layoutStable = stableLayoutFrames >= 2;
        const layoutReady = metrics.scrollableToTarget && layoutStable && metrics.renderComplete && metrics.nearLastStableHeight;
        return {
          ...metrics,
          layoutStable,
          stableLayoutFrames,
          canRestore:layoutReady,
          layoutReadiness:!metrics.scrollableToTarget
            ? 'document_not_tall_enough'
            : (!metrics.nearLastStableHeight
              ? 'layout-below-last-stable-height'
              : (!metrics.renderComplete
                ? 'layout-render-in-progress'
                : (layoutStable ? 'layout-ready-stable' : 'layout-scrollable-but-not-stable')))
        };
      };
      const traceLayoutNotReady = (caller, trigger, metrics, extra = {}) => {
        const now = nowMs();
        if(now - lastLayoutNotReadyTraceAt < 150 && !String(trigger || '').includes('fallback')) return;
        lastLayoutNotReadyTraceAt = now;
        traceScrollEvent(metrics.scrollableToTarget ? 'track:restore:layout-growing' : 'track:restore:layout-not-ready', {
          caller,
          reason:trigger,
          restoreDelayedUntilLayoutReady:true,
          revealBlockedReason:metrics.layoutReadiness,
          currentDocH:metrics.docH,
          previousDocH:lastLayoutDocH,
          lastStableTrackDocH:metrics.lastStableTrackDocH,
          restoreTarget,
          stableFrameCount:metrics.stableLayoutFrames,
          renderComplete:metrics.renderComplete === true,
          ...metrics,
          ...extra
        });
      };
      const finalizeTrackRestore = (finalReason, details = {}) => {
        if(uiState.trackRestoreRunId !== restoreRunId || uiState.trackRestoreCompletionCommitted === true) return;
        uiState.trackRestoreCompletionCommitted = true;
        uiState.trackRevealCompleted = true;
        clearTimeout(revealFallback);
        const actualFinalScrollY = currentScrollY();
        const finalMetrics = trackRestoreLayoutMetrics(restoreTarget);
        if(Math.abs(actualFinalScrollY - restoreTarget) <= 24){
          uiState.pendingTrackRestoreY = null;
          if(typeof window !== 'undefined') window.__ppPendingTrackRestoreY = undefined;
        }
        uiState.trackRestoreInProgress = false;
        if(typeof window !== 'undefined') window.__ppTrackRestoreInProgress = false;
        uiState.postTrackRestoreTarget = restoreTarget;
        uiState.postTrackRestoreGuardUntil = nowMs() + 500;
        postRestoreSnapApplied = false;
        suppressScrollMemory('track_restore_post_guard', 650);
        setSmoothScrollDisabled(false, finalReason);
        if(concealUntilRestored) clearTrackRevealPending(finalReason);
        traceScrollEvent('track:restore:finalized', {
          caller:'finalizeTrackRestore',
          reason:finalReason,
          restoreTarget,
          actualFinalScrollY,
          verifyRetries,
          revealStrategy:details.revealStrategy || finalReason,
          ...finalMetrics
        });
        measureTrackTiming(restoreTarget, actualFinalScrollY, verifyRetries, details.revealStrategy || finalReason);
      };
      const revealFallback = setTimeout(() => {
        if(uiState.trackRestoreRunId !== restoreRunId || uiState.trackRestoreCompletionCommitted === true) return;
        if(concealUntilRestored && normalizeTab(uiState.activeWorkspaceTab || '') === 'track' && uiState.trackRevealPending === true){
          const metrics = stableLayoutMetrics();
          if(!metrics.canRestore){
            traceScrollEvent('track:restore:fallback-blocked', {
              caller:'scheduleTrackRestore',
              reason:'layout_not_ready',
              restoreTarget,
              actualY:currentScrollY(),
              ...metrics,
              revealBlockedReason:metrics.layoutReadiness
            });
            waitForLayoutThenRestore('fallback_layout_not_ready');
            return;
          }
          traceScrollEvent('track:restore:fallback-timeout', {
            caller:'scheduleTrackRestore',
            reason:'restore_reveal_timeout',
            restoreTarget,
            actualY:currentScrollY(),
            ...metrics
          });
          finalizeTrackRestore('fallback_timeout', {revealStrategy:'fallback_timeout'});
        }
      }, 650);
      const waitForLayoutThenRestore = trigger => {
        if(uiState.trackRestoreRunId !== restoreRunId || uiState.trackRestoreCompletionCommitted === true) return;
        if(normalizeTab(uiState.activeWorkspaceTab || '') !== 'track') return;
        const metrics = stableLayoutMetrics();
        if(metrics.canRestore){
          traceScrollEvent('track:restore:layout-ready-stable', {
            caller:'scheduleTrackRestore',
            reason:trigger,
            restoreDelayedUntilLayoutReady:layoutWaitCount > 0,
            layoutReadiness:'layout-ready-stable',
            ...metrics
          });
          runRestore(Math.max(1, layoutWaitCount + 1));
          return;
        }
        layoutWaitCount += 1;
        traceLayoutNotReady('scheduleTrackRestore', trigger, metrics);
        if(layoutWaitCount >= 60){
          traceScrollEvent('track:restore:hard-timeout', {
            caller:'scheduleTrackRestore',
            reason:'layout_wait_limit_reached',
            revealBlockedReason:metrics.layoutReadiness,
            ...metrics
          });
          finalizeTrackRestore('layout_wait_limit_reached', {revealStrategy:'hard_timeout'});
          return;
        }
        if(typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'){
          window.requestAnimationFrame(() => window.requestAnimationFrame(() => waitForLayoutThenRestore('layout_retry')));
        }else{
          setTimeout(() => waitForLayoutThenRestore('layout_retry'), 50);
        }
      };
      const scheduleVerify = () => {
        if(typeof window === 'undefined') return;
        traceScrollEvent('delayed-scroll:scheduled', {
          caller:'scheduleTrackRestore',
          label:'track:scroll-restore-verify',
          restoreTarget,
          reason
        });
        setTimeout(() => {
          if(uiState.trackRestoreRunId !== restoreRunId || uiState.trackRestoreCompletionCommitted === true) return;
          if(normalizeTab(uiState.activeWorkspaceTab || '') !== 'track'){
            finalizeTrackRestore('track_restore_verify_aborted', {revealStrategy:'aborted'});
            return;
          }
          const metrics = stableLayoutMetrics();
          if(!metrics.canRestore){
            traceLayoutNotReady('scheduleTrackRestore.verify', 'verify_layout_not_ready', metrics, {actualY:currentScrollY()});
            waitForLayoutThenRestore('verify_layout_not_ready');
            return;
          }
          const actualY = currentScrollY();
          const delta = actualY - restoreTarget;
          const retryApplied = Math.abs(delta) > 24 && canRestoreTrackScroll(restoreTarget);
          if(retryApplied) verifyRetries += 1;
          traceScrollEvent('track:scroll-restore:verify', {
            caller:'scheduleTrackRestore.verify',
            reason:retryApplied ? 'post_focus_drift' : 'within_tolerance',
            restoreTarget,
            actualY,
            delta,
            retryApplied,
            ...metrics
          });
          if(retryApplied){
            suppressScrollMemory('track_restore_verify_retry', 900);
            setSmoothScrollDisabled(true, 'track_restore_verify_retry');
            scrollWindowTo(restoreTarget, 'auto', 'track_restore_verify_retry');
          }
          setTimeout(() => {
            if(uiState.trackRestoreRunId !== restoreRunId || uiState.trackRestoreCompletionCommitted === true) return;
            if(normalizeTab(uiState.activeWorkspaceTab || '') !== 'track') return;
            const finalY = currentScrollY();
            const finalMetrics = stableLayoutMetrics();
            if(!finalMetrics.canRestore){
              traceLayoutNotReady('scheduleTrackRestore.finalize', 'finalize_layout_not_ready', finalMetrics, {actualY:finalY});
              waitForLayoutThenRestore('finalize_layout_not_ready');
              return;
            }
            finalizeTrackRestore('verified_restore', {revealStrategy:retryApplied ? 'verified_after_retry' : 'verified'});
          }, retryApplied ? 180 : 120);
        }, 350);
      };
      const runRestore = attempt => {
        if(uiState.trackRestoreRunId !== restoreRunId || uiState.trackRestoreCompletionCommitted === true) return;
        if(normalizeTab(uiState.activeWorkspaceTab || '') !== 'track'){
          finalizeTrackRestore('track_restore_aborted', {revealStrategy:'aborted'});
          return;
        }
        const metrics = stableLayoutMetrics();
        if(!metrics.canRestore){
          waitForLayoutThenRestore('run_restore_layout_not_ready');
          return;
        }
        suppressScrollMemory(reason, 900);
        const before = currentScrollY();
        traceScrollEvent('track:scroll-restore:before', {
          caller:'scheduleTrackRestore',
          reason,
          restoreTarget,
          restoreActualBefore:before,
          attempt,
          trackRevealPending:uiState.trackRevealPending === true,
          ...metrics
        });
        scrollWindowTo(restoreTarget, 'auto', reason);
        const after = currentScrollY();
        traceScrollEvent('track:scroll-restore:after', {
          caller:'scheduleTrackRestore',
          reason,
          restoreTarget,
          restoreActualBefore:before,
          restoreActualAfter:after,
          attempt,
          scrollToAppliedBeforeReveal:uiState.trackRevealPending === true,
          ...metrics
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
          scheduleVerify();
        }
      };
      traceScrollEvent('delayed-scroll:scheduled', {
        caller:'scheduleTrackRestore',
        label:'track:scroll-restore',
        restoreTarget,
        reason,
        duplicateRestoreSuppressed:options.immediate === true
      });
      if(options.immediate === true){
        runRestore(1);
        return;
      }
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
      const previousTab = normalizeTab(uiState.activeWorkspaceTab || '');
      if(previousTab === 'review' && nextTab === 'track') markTrackTiming('track-switch-start');
      traceScrollEvent('tab:switch:before', {
        caller:'switchWorkspace',
        fromTab:previousTab,
        toTab:nextTab,
        options
      });
      saveActiveWorkspaceScroll({traceLabel:'track:scroll-save-final'});
      if(previousTab === 'review' && nextTab !== 'review'){
        uiState.reviewInitialTopPositioned = false;
      }
      if(nextTab === 'track'){
        const restoreTarget = Number.isFinite(Number(lastKnownScrollByTab.track))
          ? Number(lastKnownScrollByTab.track)
          : Number(uiState.trackScrollY);
        if(Number.isFinite(restoreTarget) && restoreTarget > 24){
          uiState.pendingTrackRestoreY = restoreTarget;
          if(typeof window !== 'undefined') window.__ppPendingTrackRestoreY = restoreTarget;
          setTrackRevealPending(true, 'track_tab_activation_prepare');
        }
      }else{
        clearTrackRevealPending('non_track_tab_activation');
      }
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
      installTrackRestoreScrollDriverGuard();
      if(typeof history !== 'undefined' && 'scrollRestoration' in history){
        try{
          history.scrollRestoration = 'manual';
          traceScrollEvent('scroll-driver:hash', {
            caller:'init',
            reason:'history_scroll_restoration_manual',
            restoreInProgress:uiState.trackRestoreInProgress === true,
            revealPending:uiState.trackRevealPending === true
          });
        }catch(_error){}
      }
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
          if(isTrackRestorePending()){
            const restoreTarget = activeTrackRestoreTarget();
            if(Number.isFinite(restoreTarget) && Math.abs(nextScrollY - restoreTarget) > 24){
              traceScrollEvent('scroll-driver:restore', {
                caller:'track_restore_scroll_guard',
                reason:'external_scroll_during_track_restore',
                attemptedY:nextScrollY,
                restoreTarget,
                deltaFromTarget:nextScrollY - restoreTarget,
                trackRevealPending:uiState.trackRevealPending === true,
                restoreInProgress:uiState.trackRestoreInProgress === true
              });
              scrollWindowTo(restoreTarget, 'auto', 'track_restore_external_scroll_guard');
            }
          }
          if(isPostTrackRestoreGuardActive()){
            const restoreTarget = postTrackRestoreTarget();
            if(Number.isFinite(restoreTarget) && Math.abs(nextScrollY - restoreTarget) > 24){
              const elapsedSinceFinalize = Math.max(0, 500 - (Number(uiState.postTrackRestoreGuardUntil || 0) - nowMs()));
              traceScrollEvent('track:post-restore-drift', {
                caller:'post_restore_scroll_guard',
                restoreTarget,
                actualY:nextScrollY,
                delta:nextScrollY - restoreTarget,
                elapsedSinceFinalize,
                activeDriver:window.__ppRecentScrollAction || null,
                snapBackApplied:postRestoreSnapApplied !== true
              });
              if(postRestoreSnapApplied !== true){
                postRestoreSnapApplied = true;
                scrollWindowTo(restoreTarget, 'auto', 'track_restore_post_guard_snap');
              }
            }
          }
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
          if(normalizeTab(uiState.activeWorkspaceTab || '') === 'track'){
            queueTrackScrollMemorySave(nextScrollY);
          }else{
            saveActiveWorkspaceScroll({traceLabel:'track:scroll-save-final', extendSuppression:false});
          }
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
