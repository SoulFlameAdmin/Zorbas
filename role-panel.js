(() => {
  const params = new URLSearchParams(location.search);
  const panel = params.get('panel') || '';
  if (panel) document.documentElement.dataset.zorbasPanel = panel;

  function addPanelsLink(container, className = 'zr-panels-link') {
    if (!container || container.querySelector('[data-role-panels-link]')) return;
    const link = document.createElement('a');
    link.href = '/panels.html';
    link.className = className;
    link.dataset.rolePanelsLink = '1';
    link.textContent = '◫ Панели';
    container.prepend(link);
  }

  function configureKitchenRole() {
    if (!location.pathname.endsWith('/kitchen.html') && !location.pathname.endsWith('kitchen.html')) return;
    const role = panel === 'kitchen' ? 'kitchen' : 'manager';
    document.documentElement.dataset.zorbasPanel = role;
    const isKitchen = role === 'kitchen';
    document.title = isKitchen ? 'ZORBAS · Кухня' : 'ZORBAS · Manager';

    const loginTitle = document.querySelector('#loginForm h1');
    if (loginTitle) loginTitle.textContent = isKitchen ? 'Кухня' : 'Manager';
    const topTitle = document.querySelector('#appView .topbar h2');
    if (topTitle) topTitle.textContent = isKitchen ? 'Кухня · Работен панел' : 'Manager · Работен панел';
    const description = document.querySelector('#kitchenNotesView .view-head p');
    if (description) description.textContent = isKitchen
      ? 'Най-старите бележки са първи. Отбелязвай Започвам и Готово за всяка позиция.'
      : 'Следи готовите позиции, разпределяй ги към хората и потвърждавай какво е предадено.';
    const sideTitle = document.querySelector('#kitchenSidebar .side-title');
    if (sideTitle) sideTitle.textContent = isKitchen ? 'Кухненска станция' : 'Работни станции';
    addPanelsLink(document.querySelector('#appView .top-actions'));
  }

  function configureAdminRole() {
    if (!location.pathname.endsWith('/admin.html') && !location.pathname.endsWith('admin.html')) return;
    document.documentElement.dataset.zorbasPanel = 'owner';
    addPanelsLink(document.querySelector('#appView .top-actions'));
  }

  function configureWaiterRole() {
    if (!location.pathname.endsWith('/waiter.html') && !location.pathname.endsWith('waiter.html')) return;
    const footer = document.querySelector('.ws-drawer-footer');
    if (!footer || footer.querySelector('[data-role-panels-link]')) return;
    const link = document.createElement('a');
    link.href = '/panels.html';
    link.dataset.rolePanelsLink = '1';
    link.textContent = '◫ Работни панели';
    link.style.cssText = 'display:flex;align-items:center;justify-content:center;min-height:44px;border:1px solid #d8e0e8;border-radius:10px;background:#fff;color:#183b61;text-decoration:none;font-weight:800;margin-bottom:8px';
    footer.insertBefore(link, footer.firstChild);
  }

  function init() {
    configureKitchenRole();
    configureAdminRole();
    configureWaiterRole();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
