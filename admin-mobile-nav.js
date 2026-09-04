(() => {
  'use strict';

  const root = document.documentElement;
  if (!root.classList.contains('zorbas-admin-shell')) return;

  const body = document.body;
  const toggle = document.getElementById('adminMobileMenuToggle');
  const close = document.getElementById('adminMobileMenuClose');
  const backdrop = document.getElementById('adminMobileNavBackdrop');
  const sidebar = document.getElementById('adminSidebar');
  const nav = sidebar?.querySelector('.nav');
  const title = document.getElementById('adminMobileViewTitle');
  const session = document.getElementById('sessionName');
  const mobileSession = document.getElementById('adminMobileSessionName');
  const mobileQuery = window.matchMedia('(max-width: 860px)');
  let returnFocus = null;

  if (!toggle || !close || !backdrop || !sidebar || !nav) return;

  const labels = {
    tables: 'Маси',
    order: 'Нова поръчка',
    orders: 'Бележки',
    manager: 'Manager',
    archive: 'Архив',
    reservations: 'Резервации',
    menuAdmin: 'Меню и цени',
    adminStats: 'Админ отчет'
  };

  function syncSession() {
    if (mobileSession && session) mobileSession.textContent = session.textContent || 'Управление';
  }

  function syncActiveView() {
    const active = nav.querySelector('[data-view].active');
    nav.querySelectorAll('[data-view]').forEach(item => {
      if (item === active) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });
    const view = active?.dataset.view || new URLSearchParams(location.search).get('view') || 'tables';
    if (title) title.textContent = labels[view] || 'Управление';
  }

  function setMenu(open, restoreFocus = true) {
    const next = Boolean(open && mobileQuery.matches);
    body.classList.toggle('admin-mobile-menu-open', next);
    toggle.setAttribute('aria-expanded', String(next));
    toggle.setAttribute('aria-label', next ? 'Затвори менюто' : 'Отвори менюто');
    backdrop.setAttribute('aria-hidden', String(!next));
    backdrop.tabIndex = next ? 0 : -1;
    sidebar.setAttribute('aria-hidden', String(mobileQuery.matches && !next));
    sidebar.inert = Boolean(mobileQuery.matches && !next);

    if (next) {
      returnFocus = document.activeElement;
      requestAnimationFrame(() => close.focus({preventScroll: true}));
    } else if (restoreFocus && returnFocus instanceof HTMLElement && returnFocus.isConnected) {
      returnFocus.focus({preventScroll: true});
      returnFocus = null;
    }
  }

  toggle.addEventListener('click', () => {
    setMenu(!body.classList.contains('admin-mobile-menu-open'));
  });
  close.addEventListener('click', () => setMenu(false));
  backdrop.addEventListener('click', () => setMenu(false));

  nav.addEventListener('click', event => {
    const item = event.target.closest('[data-view], a');
    if (!item) return;
    requestAnimationFrame(() => {
      syncActiveView();
      setMenu(false, item.matches('[data-view]'));
    });
  });

  sidebar.querySelectorAll('.admin-mobile-quick-actions a').forEach(link => {
    link.addEventListener('click', () => setMenu(false, false));
  });

  sidebar.querySelector('[data-admin-mobile-logout]')?.addEventListener('click', () => {
    setMenu(false, false);
    document.getElementById('logoutButton')?.click();
  });

  document.addEventListener('keydown', event => {
    if (!body.classList.contains('admin-mobile-menu-open')) return;
    if (event.key === 'Escape') {
      setMenu(false);
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...sidebar.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter(item => !item.hidden && item.getClientRects().length);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  mobileQuery.addEventListener('change', event => {
    if (!event.matches) {
      body.classList.remove('admin-mobile-menu-open');
      toggle.setAttribute('aria-expanded', 'false');
      backdrop.setAttribute('aria-hidden', 'true');
      backdrop.tabIndex = -1;
      sidebar.removeAttribute('aria-hidden');
      sidebar.inert = false;
      returnFocus = null;
    } else {
      setMenu(false, false);
    }
  });

  new MutationObserver(syncActiveView).observe(nav, {
    subtree: true,
    attributes: true,
    attributeFilter: ['class']
  });
  if (session) new MutationObserver(syncSession).observe(session, {childList: true, subtree: true});

  syncSession();
  syncActiveView();
  setMenu(false, false);
})();
