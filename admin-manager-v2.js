(() => {
  if (window.ZorbasManagerV2) return;
  window.ZorbasManagerV2 = true;

  const SOFIA_TZ = 'Europe/Sofia';
  const managerRoles = new Set(['admin', 'manager', 'owner']);
  const state = {
    archiveRows: [],
    decorating: false,
    scheduled: false
  };

  const sessionRole = () => {
    const text = document.getElementById('sessionName')?.textContent || '';
    return (text.split(' · ')[1] || '').trim().toLowerCase();
  };
  const allowed = () => managerRoles.has(sessionRole());
  const activeOrders = () => (typeof snapshot !== 'undefined' && snapshot?.orders ? snapshot.orders : [])
    .filter(order => order.manager_state !== 'completed' && !['completed', 'cancelled', 'returned'].includes(order.status));
  const activeCount = () => activeOrders().length;
  const itemCount = () => activeOrders().reduce((sum, order) => sum + (order.items || [])
    .filter(item => item.status !== 'cancelled' && item.manager_state !== 'delivered').length, 0);

  function scheduleDecorate() {
    if (state.scheduled) return;
    state.scheduled = true;
    requestAnimationFrame(() => {
      state.scheduled = false;
      decorateAll();
    });
  }

  function closeBurger() {
    document.querySelector('.waiter-mobile-menu')?.classList.remove('show');
    document.querySelector('.waiter-burger')?.classList.remove('open');
  }

  function go(view) {
    closeBurger();
    if (typeof switchView === 'function') switchView(view);
    scheduleDecorate();
  }

  function createViewButton(view, label, count) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.managerV2View = view;
    button.className = 'manager-v2-nav-button';
    button.innerHTML = `<span>${label}</span>${Number.isFinite(count) ? `<b>${count}</b>` : ''}`;
    return button;
  }

  function decorateBurger() {
    if (!allowed()) return;
    const menu = document.querySelector('.waiter-mobile-menu');
    if (!menu) return;

    let group = menu.querySelector('[data-manager-v2-menu]');
    if (!group) {
      group = document.createElement('div');
      group.dataset.managerV2Menu = '1';
      group.className = 'manager-v2-mobile-group';
      const firstSeparator = menu.querySelector('.waiter-mobile-menu-sep');
      if (firstSeparator) firstSeparator.insertAdjacentElement('afterend', group);
      else menu.prepend(group);
    }

    const pending = itemCount();
    const currentView = typeof activeView === 'string' ? activeView : '';
    const signature = `${pending}:${currentView}`;
    if (group.dataset.signature !== signature) {
      group.dataset.signature = signature;
      group.replaceChildren(
        createViewButton('manager', '◎ Manager · активни', pending),
        createViewButton('archive', '▣ Manager · архив', null)
      );
      group.querySelector(`[data-manager-v2-view="${currentView}"]`)?.classList.add('active');
    }
  }

  function ensureModeTabs(view) {
    const toolbar = document.querySelector(`#view-${view} .${view === 'manager' ? 'manager' : 'archive'}-toolbar`);
    if (!toolbar) return;
    let tabs = toolbar.querySelector('[data-manager-v2-tabs]');
    if (!tabs) {
      tabs = document.createElement('div');
      tabs.dataset.managerV2Tabs = '1';
      tabs.className = 'manager-v2-tabs';
      toolbar.prepend(tabs);
    }
    const count = activeCount();
    const signature = `${count}:${view}`;
    if (tabs.dataset.signature !== signature) {
      tabs.dataset.signature = signature;
      tabs.replaceChildren(
        createViewButton('manager', 'Активни бележки', count),
        createViewButton('archive', 'Архив', null)
      );
      tabs.querySelector(`[data-manager-v2-view="${view}"]`)?.classList.add('active');
    }
  }

  function orderNumberFromNode(node) {
    const text = node?.querySelector('.manager-order-head b')?.textContent || node?.textContent || '';
    return (text.match(/№\s*([^\s·]+)/) || [])[1] || '';
  }

  function orderTimestamp(orderNumber) {
    const order = (typeof snapshot !== 'undefined' ? snapshot?.orders : [])?.find(entry => String(entry.order_number) === String(orderNumber));
    return order ? new Date(order.created_at).getTime() || 0 : 0;
  }

  function cardTimestamp(card) {
    const numbers = [...card.querySelectorAll('.manager-order')].map(orderNumberFromNode);
    if (!numbers.length) {
      const pickupNumber = (card.textContent.match(/ПОРЪЧКА\s*№\s*([^\s·]+)/) || [])[1];
      if (pickupNumber) numbers.push(pickupNumber);
    }
    return Math.max(0, ...numbers.map(orderTimestamp));
  }

  function sortManagerNewestFirst() {
    const board = document.getElementById('managerBoard');
    if (!board) return;

    board.querySelectorAll('.manager-orders').forEach(container => {
      const current = [...container.querySelectorAll(':scope > .manager-order')];
      const desired = [...current].sort((a, b) => orderTimestamp(orderNumberFromNode(b)) - orderTimestamp(orderNumberFromNode(a)));
      const changed = current.some((node, index) => node !== desired[index]);
      if (changed) desired.forEach(order => container.appendChild(order));
    });

    const currentCards = [...board.querySelectorAll(':scope > .manager-visit-card')];
    if (!currentCards.length) return;
    const desiredCards = [...currentCards].sort((a, b) => cardTimestamp(b) - cardTimestamp(a));
    const cardOrderChanged = currentCards.some((node, index) => node !== desiredCards[index]);
    let divider = board.querySelector(':scope > .manager-v2-divider');
    const foreignDividers = [...board.querySelectorAll(':scope > .manager-divider:not(.manager-v2-divider)')];
    if (!divider) {
      divider = document.createElement('div');
      divider.className = 'manager-divider manager-v2-divider';
      divider.innerHTML = '<span>НАЙ-НОВИ ПЪРВО</span>';
      board.prepend(divider);
    } else if (board.firstElementChild !== divider) {
      board.prepend(divider);
    }
    foreignDividers.forEach(node => node.remove());
    if (cardOrderChanged) desiredCards.forEach(card => board.appendChild(card));
  }

  function decorateManagerItems() {
    const board = document.getElementById('managerBoard');
    if (!board) return;

    board.querySelectorAll('.manager-item').forEach(item => {
      const main = item.querySelector('.manager-item-main');
      if (!main) return;
      const delivered = item.classList.contains('is-delivered');
      let check = main.querySelector('.manager-v2-check');
      if (!check) {
        check = document.createElement('button');
        check.type = 'button';
        check.className = 'manager-v2-check';
        check.setAttribute('aria-label', 'Отбележи продукта като издаден');
        main.prepend(check);
      }
      check.classList.toggle('checked', delivered);
      const checkText = delivered ? '✓' : '';
      if (check.textContent !== checkText) check.textContent = checkText;
      const checkTitle = delivered ? 'Върни продукта като неиздаден' : 'Отбележи като издаден';
      if (check.title !== checkTitle) check.title = checkTitle;
      check.onclick = event => {
        event.preventDefault();
        event.stopPropagation();
        const action = item.querySelector(`[data-manager-action="${delivered ? 'reset' : 'delivered'}"]`);
        if (action && !action.disabled) action.click();
      };

      const deliveredButton = item.querySelector('[data-manager-action="delivered"]');
      if (deliveredButton && deliveredButton.textContent !== '✓ ИЗДАДЕН') deliveredButton.textContent = '✓ ИЗДАДЕН';
      const sentButton = item.querySelector('[data-manager-action="sent"]');
      if (sentButton && sentButton.textContent !== 'КЪМ МАСАТА') sentButton.textContent = 'КЪМ МАСАТА';
    });

    board.querySelectorAll('[data-complete-order]').forEach(button => {
      const label = button.disabled
        ? 'ПЪРВО ОТБЕЛЕЖИ ВСИЧКИ ПРОДУКТИ'
        : '✓ ВСИЧКО Е ИЗДАДЕНО · В АРХИВ';
      if (button.textContent !== label) button.textContent = label;
      button.classList.toggle('manager-v2-ready', !button.disabled);
    });
  }

  function formatArchiveMeta(order) {
    const created = new Date(order.created_at);
    const completedValue = order.completed_at || order.updated_at || order.created_at;
    const completed = new Date(completedValue);
    const table = order.order_type === 'pickup' ? 'ПАКЕТ' : `МАСА ${order.table_number || '—'}`;
    const weekday = created.toLocaleDateString('bg-BG', {weekday: 'long', timeZone: SOFIA_TZ});
    const date = created.toLocaleDateString('bg-BG', {day: '2-digit', month: '2-digit', year: 'numeric', timeZone: SOFIA_TZ});
    const time = created.toLocaleTimeString('bg-BG', {hour: '2-digit', minute: '2-digit', timeZone: SOFIA_TZ});
    const completedTime = completed.toLocaleTimeString('bg-BG', {hour: '2-digit', minute: '2-digit', timeZone: SOFIA_TZ});
    return `<span><small>ДЕН</small><b>${weekday}</b></span><span><small>ДАТА</small><b>${date}</b></span><span><small>ЧАС</small><b>${time}</b></span><span><small>МЯСТО</small><b>${table}</b></span><span><small>АРХИВИРАНО</small><b>${completedTime}</b></span>`;
  }

  function decorateArchive() {
    const root = document.getElementById('archiveList');
    if (!root || !state.archiveRows.length) return;
    const rows = new Map(state.archiveRows.map(order => [String(order.order_number), order]));
    const cards = [...root.querySelectorAll('.archive-card')];

    cards.forEach(card => {
      const number = (card.textContent.match(/№\s*([^\s·]+)/) || [])[1];
      const order = rows.get(String(number));
      if (!order) return;
      card.dataset.managerV2Time = String(new Date(order.completed_at || order.updated_at || order.created_at).getTime() || 0);
      let meta = card.querySelector('.manager-v2-archive-meta');
      if (!meta) {
        meta = document.createElement('div');
        meta.className = 'manager-v2-archive-meta';
        card.querySelector('header')?.insertAdjacentElement('afterend', meta);
      }
      const signature = String(order.completed_at || order.updated_at || order.created_at);
      if (meta.dataset.signature !== signature) {
        meta.dataset.signature = signature;
        meta.innerHTML = formatArchiveMeta(order);
      }
    });

    const desired = [...cards].sort((a, b) => Number(b.dataset.managerV2Time || 0) - Number(a.dataset.managerV2Time || 0));
    const changed = cards.some((card, index) => card !== desired[index]);
    if (changed) desired.forEach(card => root.appendChild(card));
  }

  function decorateHeadings() {
    const managerTitle = document.querySelector('#view-manager .view-head h3');
    const managerDescription = document.querySelector('#view-manager .view-head p');
    const title = 'Manager · издаване на поръчките';
    const description = 'Бележките са от най-новата към най-старата. Натисни квадратчето на всеки издаден продукт.';
    if (managerTitle && managerTitle.textContent !== title) managerTitle.textContent = title;
    if (managerDescription && managerDescription.textContent !== description) managerDescription.textContent = description;
  }

  function decorateAll() {
    if (state.decorating) return;
    state.decorating = true;
    try {
      decorateBurger();
      ensureModeTabs('manager');
      ensureModeTabs('archive');
      decorateHeadings();
      sortManagerNewestFirst();
      decorateManagerItems();
      decorateArchive();
    } finally {
      state.decorating = false;
    }
  }

  if (typeof Z !== 'undefined' && Z?.rpc && !Z.rpc.__managerV2Wrapped) {
    const originalRpc = Z.rpc.bind(Z);
    const wrappedRpc = async (name, args) => {
      const result = await originalRpc(name, args);
      if (name === 'zorbas_manager_archive_v1' && Array.isArray(result)) {
        state.archiveRows = result;
        scheduleDecorate();
      }
      return result;
    };
    wrappedRpc.__managerV2Wrapped = true;
    Z.rpc = wrappedRpc;
  }

  const observer = new MutationObserver(scheduleDecorate);
  observer.observe(document.body, {childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'disabled']});
  window.addEventListener('resize', scheduleDecorate);
  document.addEventListener('click', event => {
    const target = event.target.closest('[data-manager-v2-view]');
    if (target) go(target.dataset.managerV2View);
  });

  scheduleDecorate();
})();
