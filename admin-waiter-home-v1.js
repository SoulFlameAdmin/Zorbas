(() => {
  'use strict';

  if (window.ZorbasWaiterHomeV2) return;
  if (typeof waiterState === 'undefined' || typeof renderWaiterMobile !== 'function') return;
  window.ZorbasWaiterHomeV2 = true;

  const mobile = () => window.matchMedia('(max-width:650px)').matches;
  const esc = value => Z.esc(value == null ? '' : String(value));
  const sessionText = () => document.getElementById('sessionName')?.textContent || '';
  const displayName = () => sessionText().split(' · ')[0] || 'Христо Царухов';
  const role = () => (sessionText().split(' · ')[1] || '').trim().toLowerCase();
  const isManager = () => ['admin', 'manager', 'owner'].includes(role());

  waiterState.homeMenuOpen = false;

  function icon(kind) {
    const icons = {
      tables: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M19 28h26M23 28v18M41 28v18M15 23v24M49 23v24M13 47h8M43 47h8M18 20h28"/></svg>',
      notes: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M19 10h26v43l-5-4-5 4-5-4-5 4-6-4zM25 22h14M25 30h14M25 38h9"/></svg>'
    };
    return icons[kind] || '';
  }

  function tableLabel(table) {
    const raw = String(table?.table_number || '').trim();
    if (!raw) return 'Маса';
    if (/^\d+$/.test(raw)) return `Маса ${raw}`;
    return raw;
  }

  function activeVisitsFor(tableId) {
    return (snapshot?.visits || []).filter(visit => visit.table_id === tableId && visit.status === 'active');
  }

  function activeOrdersFor(tableId) {
    const visits = activeVisitsFor(tableId);
    const visitIds = new Set(visits.map(visit => visit.id));
    return (snapshot?.orders || [])
      .filter(order => order.table_id === tableId)
      .filter(order => !['completed', 'cancelled', 'returned'].includes(order.status))
      .filter(order => !visitIds.size || !order.visit_id || visitIds.has(order.visit_id));
  }

  function tableSummary(table) {
    const orders = activeOrdersFor(table.id);
    let total = 0;
    let kitchenWaiting = 0;
    let barWaiting = 0;
    let latest = 0;

    orders.forEach(order => {
      latest = Math.max(latest, new Date(order.created_at || 0).getTime() || 0);
      (order.items || []).forEach(item => {
        if (item.status === 'cancelled') return;
        const quantity = Number(item.quantity || 0);
        total += quantity * Number(item.unit_price || 0);
        const delivered = Number(item.service_delivered_quantity ?? item.delivered_quantity ?? 0);
        const remaining = Math.max(0, quantity - delivered);
        if (item.send_to_kitchen_snapshot) kitchenWaiting += remaining;
        else barWaiting += remaining;
      });
    });

    let status = 'Готово';
    let statusClass = 'ready';
    if (kitchenWaiting > 0) {
      status = `${kitchenWaiting} чакат`;
      statusClass = 'waiting';
    } else if (barWaiting > 0) {
      status = 'Бар';
      statusClass = 'bar';
    }

    return {
      table,
      total,
      latest,
      status,
      statusClass,
      active: activeVisitsFor(table.id).length > 0 || orders.length > 0 || table.status === 'occupied'
    };
  }

  function activeTableSummaries() {
    return (snapshot?.tables || [])
      .map(tableSummary)
      .filter(entry => entry.active)
      .sort((a, b) => b.latest - a.latest || tableLabel(a.table).localeCompare(tableLabel(b.table), 'bg'));
  }

  function shiftActive() {
    return document.getElementById('shiftButton')?.dataset.active === 'true';
  }

  function renderRows(entries) {
    if (!entries.length) {
      return '<div class="wh-empty">Нямаш активни маси. Натисни „Нова поръчка“.</div>';
    }

    return entries.slice(0, 3).map(entry => {
      const rawNumber = String(entry.table.table_number || '—');
      return `<button type="button" class="wh-table-row" data-wh-table="${esc(entry.table.id)}">
        <span class="wh-table-name">
          <span class="wh-table-number"><i></i><b>${esc(rawNumber)}</b></span>
          <strong>${esc(tableLabel(entry.table))}</strong>
        </span>
        <span class="wh-table-amount">${Z.money(entry.total)}</span>
        <span class="wh-table-status ${entry.statusClass}">${esc(entry.status)}</span>
        <span class="wh-chevron">›</span>
      </button>`;
    }).join('');
  }

  function renderMenu() {
    if (!waiterState.homeMenuOpen) return '';
    return `<div class="wh-menu-panel" data-wh-action="close-menu">
      <div class="wh-menu-card" role="menu" aria-label="Меню">
        <button type="button" data-wh-action="home">Начало</button>
        <button type="button" data-wh-action="reservations">Резервации</button>
        <button type="button" data-wh-action="shift">${shiftActive() ? 'Приключи смяната' : 'Започни смяната'}</button>
        ${isManager() ? '<button type="button" data-wh-action="manager">Manager</button>' : ''}
        <button type="button" class="danger" data-wh-action="logout">Изход</button>
      </div>
    </div>`;
  }

  function renderHome() {
    const root = typeof ensureWaiterMobile === 'function'
      ? ensureWaiterMobile()
      : document.getElementById('waiterMobile');
    if (!root || !snapshot) return;

    document.body.classList.add('waiter-home-active');
    const tables = activeTableSummaries();
    const readyCount = tables.filter(entry => entry.statusClass === 'ready').length;
    const active = shiftActive();

    root.innerHTML = `<main class="wh-home">
      <header class="wh-header">
        <div class="wh-header-spacer" aria-hidden="true"></div>
        <div class="wh-brand">
          <small>${esc(displayName())}</small>
          <strong>ZORBAS</strong>
          <span>Сервитьор</span>
        </div>
        <button type="button" class="wh-menu-button" data-wh-action="menu" aria-label="Отвори менюто"><i></i><i></i><i></i></button>
      </header>

      <button type="button" class="wh-shift-pill ${active ? '' : 'off'}" data-wh-action="shift">
        <i></i><span>${active ? 'Смяната е активна' : 'Смяната не е започната'}</span>
      </button>

      <button type="button" class="wh-primary" data-wh-action="new-order">
        <span class="plus">＋</span><span>НОВА ПОРЪЧКА</span>
      </button>

      <section class="wh-quick-grid" aria-label="Бързи действия">
        <button type="button" class="wh-quick-card" data-wh-action="tables">
          <span class="wh-icon">${icon('tables')}</span>
          <strong>Моите маси</strong>
          <small>${tables.length} активни</small>
        </button>
        <button type="button" class="wh-quick-card" data-wh-action="notes">
          <span class="wh-icon">${icon('notes')}</span>
          <strong>Бележки</strong>
          <small>${readyCount} готови</small>
        </button>
      </section>

      <section class="wh-recent">
        <div class="wh-section-head"><h3>Последни маси</h3>${tables.length > 3 ? '<button type="button" data-wh-action="tables">Виж всички</button>' : ''}</div>
        <div class="wh-table-list">${renderRows(tables)}</div>
      </section>

      <nav class="wh-bottom-nav" aria-label="Основна навигация">
        <button type="button" class="wh-nav-item" data-wh-action="tables">${icon('tables')}<span>Маси</span></button>
        <button type="button" class="wh-nav-item active" data-wh-action="new-order"><span class="wh-nav-plus">＋</span><span>Поръчка</span></button>
        <button type="button" class="wh-nav-item" data-wh-action="notes">${icon('notes')}<span>Бележки</span></button>
      </nav>
      ${renderMenu()}
    </main>`;

    bindRoot(root);
  }

  function leaveHome() {
    waiterState.homeMenuOpen = false;
    document.body.classList.remove('waiter-home-active');
  }

  function openNewOrder() {
    leaveHome();
    waiterState.mobileMode = 'order';
    waiterState.step = 'areas';
    waiterState.areaId = null;
    waiterState.tableId = null;
    waiterState.visitId = null;
    waiterState.newGuest = false;
    selectedArea = null;
    selectedTable = null;
    switchView('tables');
    renderWaiterMobile();
  }

  function openTables() {
    leaveHome();
    waiterState.mobileMode = 'order';
    waiterState.step = 'areas';
    waiterState.areaId = null;
    waiterState.tableId = null;
    selectedTable = null;
    switchView('tables');
    renderWaiterMobile();
  }

  function openNotes() {
    leaveHome();
    waiterState.mobileMode = 'notes';
    waiterState.step = 'notes';
    switchView('tables');
    renderWaiterMobile();
  }

  function openTable(tableId) {
    const table = snapshot?.tables?.find(entry => entry.id === tableId);
    if (!table) return;
    leaveHome();
    waiterState.mobileMode = 'order';
    waiterState.step = 'note';
    waiterState.tableId = table.id;
    waiterState.areaId = table.area_id;
    waiterState.visitId = null;
    waiterState.newGuest = false;
    selectedTable = table.id;
    selectedArea = table.area_id;
    switchView('tables');
    renderWaiterMobile();
  }

  function toggleShift() {
    const button = document.getElementById('shiftButton');
    waiterState.homeMenuOpen = false;
    if (!button) return;
    button.click();
    setTimeout(renderHome, 450);
  }

  function bindRoot(root) {
    if (root.dataset.whHomeBound === '1') return;
    root.dataset.whHomeBound = '1';
    root.addEventListener('click', event => {
      const table = event.target.closest('[data-wh-table]');
      if (table) {
        openTable(table.dataset.whTable);
        return;
      }

      const actionButton = event.target.closest('[data-wh-action]');
      if (!actionButton) return;
      const action = actionButton.dataset.whAction;

      if (action === 'close-menu' && event.target !== actionButton) return;
      if (action === 'menu') {
        waiterState.homeMenuOpen = !waiterState.homeMenuOpen;
        renderHome();
      } else if (action === 'close-menu') {
        waiterState.homeMenuOpen = false;
        renderHome();
      } else if (action === 'home') {
        waiterState.homeMenuOpen = false;
        waiterState.mobileMode = 'home';
        waiterState.step = 'home';
        switchView('tables');
        renderHome();
      } else if (action === 'new-order') {
        openNewOrder();
      } else if (action === 'tables') {
        openTables();
      } else if (action === 'notes') {
        openNotes();
      } else if (action === 'reservations') {
        leaveHome();
        switchView('reservations');
      } else if (action === 'manager') {
        leaveHome();
        switchView('manager');
      } else if (action === 'shift') {
        toggleShift();
      } else if (action === 'logout') {
        Z.logout();
      }
    });
  }

  const baseRender = renderWaiterMobile;
  renderWaiterMobile = function renderWaiterMobileWithHome(...args) {
    if (mobile() && waiterState.mobileMode === 'home') {
      renderHome();
      return;
    }
    document.body.classList.remove('waiter-home-active');
    return baseRender.apply(this, args);
  };
  window.renderWaiterMobile = renderWaiterMobile;

  const requestedView = new URLSearchParams(location.search).get('view');
  if (mobile() && (!requestedView || requestedView === 'tables') && !waiterState.tableId) {
    waiterState.mobileMode = 'home';
    waiterState.step = 'home';
    switchView('tables');
    renderWaiterMobile();
  }

  window.ZorbasWaiterHome = {
    show() {
      waiterState.mobileMode = 'home';
      waiterState.step = 'home';
      switchView('tables');
      renderWaiterMobile();
    }
  };
})();