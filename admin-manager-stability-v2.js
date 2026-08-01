(() => {
  'use strict';

  if (window.ZorbasManagerStabilityV2) return;
  window.ZorbasManagerStabilityV2 = true;

  const mobile = () => window.matchMedia('(max-width:650px)').matches;
  const externalViews = new Set(['manager', 'archive', 'reservations', 'orders', 'menuAdmin', 'adminStats']);

  function leaveWaiterHome(view) {
    if (typeof waiterState === 'undefined') return;
    waiterState.homeMenuOpen = false;
    waiterState.mobileMode = view;
    waiterState.step = view;
    document.body.classList.remove('waiter-home-active');
  }

  if (typeof switchView === 'function' && !switchView.__zorbasManagerStable) {
    const baseSwitchView = switchView;
    const stableSwitchView = function (name) {
      if (externalViews.has(name)) leaveWaiterHome(name);
      return baseSwitchView.call(this, name);
    };
    stableSwitchView.__zorbasManagerStable = true;
    switchView = stableSwitchView;
    window.switchView = stableSwitchView;
  }

  if (typeof renderWaiterMobile === 'function' && !renderWaiterMobile.__zorbasManagerStable) {
    const baseRenderWaiterMobile = renderWaiterMobile;
    const stableRenderWaiterMobile = function (...args) {
      const currentView = typeof activeView === 'string' ? activeView : 'tables';
      if (mobile() && currentView !== 'tables') {
        leaveWaiterHome(currentView);
        return;
      }
      return baseRenderWaiterMobile.apply(this, args);
    };
    stableRenderWaiterMobile.__zorbasManagerStable = true;
    renderWaiterMobile = stableRenderWaiterMobile;
    window.renderWaiterMobile = stableRenderWaiterMobile;
  }

  document.addEventListener('click', event => {
    const homeAction = event.target.closest('[data-wh-action="manager"], [data-wh-action="reservations"]');
    if (homeAction) {
      leaveWaiterHome(homeAction.dataset.whAction === 'manager' ? 'manager' : 'reservations');
      return;
    }

    const managerTab = event.target.closest('[data-manager-v2-view]');
    if (managerTab) leaveWaiterHome(managerTab.dataset.managerV2View);
  }, true);

  window.addEventListener('popstate', () => {
    const requested = new URLSearchParams(location.search).get('view');
    if (requested && externalViews.has(requested)) leaveWaiterHome(requested);
  });
})();