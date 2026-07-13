(function(global){
  const WORKSPACE_TABS = Object.freeze(['scan', 'review', 'track', 'diary']);
  const WORKSPACE_TAB_SET = new Set(WORKSPACE_TABS);

  function normalizeWorkspaceTab(value, fallback = 'scan'){
    const next = String(value || '').trim().toLowerCase();
    if(WORKSPACE_TAB_SET.has(next)) return next;
    const normalizedFallback = String(fallback || '').trim().toLowerCase();
    return WORKSPACE_TAB_SET.has(normalizedFallback) ? normalizedFallback : 'scan';
  }

  function isWorkspaceTab(value){
    return WORKSPACE_TAB_SET.has(String(value || '').trim().toLowerCase());
  }

  global.WorkspaceTabs = Object.assign({}, global.WorkspaceTabs, {
    WORKSPACE_TABS,
    normalizeWorkspaceTab,
    isWorkspaceTab
  });
})(window);
