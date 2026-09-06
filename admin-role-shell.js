(() => {
  'use strict';

  const blockedViews = new Set(['order', 'orders', 'manager']);

  function installStyle() {
    if (document.getElementById('adminOwnerRoleStyles')) return;
    const style = document.createElement('style');
    style.id = 'adminOwnerRoleStyles';
    style.textContent = `
      .zorbas-admin-shell #adminSidebar .shift-box{display:none!important}
      .zorbas-admin-shell #view-tables #tableInfo > .form-grid,
      .zorbas-admin-shell #view-tables #tableInfo > .toolbar,
      .zorbas-admin-shell #view-tables #tableInfo [data-visit-quick-actions],
      .zorbas-admin-shell #view-tables #tableInfo [data-stage1-visit-panel]{display:none!important}
    `;
    document.head.appendChild(style);
  }

  function enforceOwnerView() {
    document.querySelectorAll('#adminSidebar [data-view]').forEach(button => {
      const blocked = blockedViews.has(button.dataset.view);
      button.hidden = blocked;
      if (blocked) button.dataset.ownerOperationalHidden = '1';
    });

    const requested = new URLSearchParams(location.search).get('view');
    if (blockedViews.has(requested) && typeof switchView === 'function') {
      switchView('adminStats');
    }
  }

  installStyle();
  enforceOwnerView();

  new MutationObserver(enforceOwnerView).observe(document.getElementById('adminSidebar') || document.body, {
    childList: true,
    subtree: true
  });
})();
