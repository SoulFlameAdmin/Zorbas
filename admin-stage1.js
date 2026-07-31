(() => {
  if (window.ZorbasStage1) return;
  window.ZorbasStage1 = true;

  const busyItems = new Set();
  let decorating = false;
  let scheduled = false;

  const getSnapshot = () => (typeof snapshot !== 'undefined' ? snapshot : null);
  const orders = () => getSnapshot()?.orders || [];
  const visits = () => getSnapshot()?.visits || [];
  const tables = () => getSnapshot()?.tables || [];
  const areas = () => getSnapshot()?.areas || [];
  const menuItems = () => getSnapshot()?.items || [];

  const orderFor = id => orders().find(order => order.id === id) || null;
  const visitFor = id => visits().find(visit => visit.id === id) || null;
  const tableFor = id => tables().find(table => table.id === id) || null;
  const areaFor = id => areas().find(area => area.id === id) || null;

  function orderForItem(itemId) {
    return orders().find(order => (order.items || []).some(item => item.id === itemId)) || null;
  }

  function itemFor(itemId) {
    for (const order of orders()) {
      const item = (order.items || []).find(entry => entry.id === itemId);
      if (item) return item;
    }
    return null;
  }

  function isKitchenItem(item) {
    if (!item) return false;
    if (typeof item.send_to_kitchen_snapshot === 'boolean') return item.send_to_kitchen_snapshot;
    const menu = menuItems().find(entry => entry.id === item.menu_item_id);
    return Boolean(menu?.send_to_kitchen);
  }

  function activeOrder(order) {
    return order && !['completed', 'cancelled', 'returned'].includes(order.status);
  }

  function visitOrders(visitId) {
    return orders().filter(order => order.visit_id === visitId && !['cancelled', 'returned'].includes(order.status));
  }

  function visitTotal(visitId) {
    return visitOrders(visitId).reduce((total, order) => total + (order.items || [])
      .filter(item => item.status !== 'cancelled')
      .reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_price || 0), 0), 0);
  }

  function kitchenItemsForOrder(order) {
    return (order?.items || []).filter(item => item.status !== 'cancelled' && isKitchenItem(item));
  }

  function kitchenStatsForVisit(visitId) {
    const items = visitOrders(visitId).flatMap(kitchenItemsForOrder);
    return items.reduce((result, item) => {
      result.ordered += Number(item.quantity || 0);
      result.delivered += Math.min(Number(item.delivered_quantity || 0), Number(item.quantity || 0));
      return result;
    }, {ordered: 0, delivered: 0});
  }

  function inferredSequence(order) {
    if (!order?.visit_id) return 1;
    const list = visitOrders(order.visit_id).slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    return Math.max(1, list.findIndex(entry => entry.id === order.id) + 1);
  }

  function orderKind(order) {
    if (order?.order_kind) return order.order_kind;
    return inferredSequence(order) === 1 ? 'new' : 'addition';
  }

  function visitIsKitchenDone(visitId) {
    return visitOrders(visitId).every(order => !order.manager_required || order.manager_state === 'completed');
  }

  function money(value) {
    return Z?.money ? Z.money(Number(value || 0)) : `${Number(value || 0).toFixed(2)} лв.`;
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      decorateAll();
    });
  }

  async function setDelivered(item, value, button) {
    if (!item || busyItems.has(item.id)) return;
    busyItems.add(item.id);
    if (button) button.disabled = true;
    try {
      await Z.rpc('zorbas_manager_set_delivered_quantity_v1', {
        p_token: Z.token(),
        p_item_id: item.id,
        p_quantity: value,
        p_expected_version: Number(item.manager_version || 1)
      });
      await refresh();
    } catch (error) {
      Z.toast(error.message, 'error');
    } finally {
      busyItems.delete(item.id);
    }
  }

  function quantityControl(item, order) {
    const ordered = Number(item.quantity || 0);
    const delivered = Math.min(Number(item.delivered_quantity || 0), ordered);
    const done = delivered >= ordered;
    const wrap = document.createElement('div');
    wrap.className = `stage1-quantity-control ${done ? 'done' : delivered > 0 ? 'partial' : ''}`;
    wrap.dataset.stage1Quantity = item.id;
    wrap.innerHTML = `
      <button type="button" data-stage1-minus aria-label="Намали издадените">−</button>
      <strong><span>${delivered}</span> / ${ordered}</strong>
      <button type="button" data-stage1-plus aria-label="Увеличи издадените">+</button>
      <small>${done ? 'ИЗДАДЕНИ' : delivered > 0 ? 'ЧАСТИЧНО' : 'ЧАКАТ'}</small>`;
    const locked = order?.manager_state === 'completed' || item.status === 'cancelled';
    const minus = wrap.querySelector('[data-stage1-minus]');
    const plus = wrap.querySelector('[data-stage1-plus]');
    minus.disabled = locked || delivered <= 0;
    plus.disabled = locked || delivered >= ordered;
    minus.onclick = event => {
      event.stopPropagation();
      setDelivered(item, Math.max(0, delivered - 1), event.currentTarget);
    };
    plus.onclick = event => {
      event.stopPropagation();
      setDelivered(item, Math.min(ordered, delivered + 1), event.currentTarget);
    };
    return wrap;
  }

  function decorateManagerItems() {
    const board = document.getElementById('managerBoard');
    if (!board) return;

    board.querySelectorAll('.manager-item').forEach(row => {
      const action = row.querySelector('[data-item]');
      const itemId = action?.dataset.item;
      const item = itemFor(itemId);
      const order = orderForItem(itemId);
      if (!item || !isKitchenItem(item)) {
        row.hidden = true;
        return;
      }
      row.hidden = false;
      row.dataset.stage1KitchenItem = '1';
      row.querySelector('[data-stage1-quantity]')?.remove();
      row.appendChild(quantityControl(item, order));
      const delivered = Number(item.delivered_quantity || 0) >= Number(item.quantity || 0);
      row.classList.toggle('is-delivered', delivered);
      row.classList.toggle('stage1-partial', !delivered && Number(item.delivered_quantity || 0) > 0);
      const state = row.querySelector('.manager-state');
      if (state) state.textContent = delivered ? 'ИЗДАДЕНО' : Number(item.delivered_quantity || 0) > 0 ? 'ЧАСТИЧНО' : 'ЧАКА';
    });

    board.querySelectorAll('.manager-order').forEach(section => {
      const complete = section.querySelector('[data-complete-order]');
      const order = orderFor(complete?.dataset.completeOrder);
      if (!order) return;
      const kitchen = kitchenItemsForOrder(order);
      section.hidden = kitchen.length === 0;
      if (!kitchen.length) return;
      const ready = kitchen.every(item => Number(item.delivered_quantity || 0) >= Number(item.quantity || 0));
      complete.disabled = !ready;
      complete.textContent = ready ? '✓ КУХНЯТА Е ИЗДАДЕНА · В АРХИВ' : 'ПЪРВО ИЗДАЙ ВСИЧКИ КУХНЕНСКИ ПРОДУКТИ';
      complete.classList.toggle('manager-v2-ready', ready);
      const head = section.querySelector('.manager-order-head b');
      if (head) {
        const prefix = orderKind(order) === 'new' ? 'НОВО' : 'ДОБАВКА';
        head.textContent = `${prefix} · Бележка №${order.order_number}`;
      }
    });

    board.querySelectorAll('.manager-visit-card').forEach(card => {
      const orderIds = [...card.querySelectorAll('[data-complete-order]')].map(button => button.dataset.completeOrder);
      const order = orderIds.map(orderFor).find(Boolean);
      if (!order?.visit_id) return;
      const visit = visitFor(order.visit_id);
      const table = tableFor(visit?.table_id);
      const area = areaFor(table?.area_id);
      const stats = kitchenStatsForVisit(order.visit_id);
      const counters = card.querySelector('.visit-counters');
      if (counters) counters.innerHTML = `<b>${stats.delivered}/${stats.ordered} издадени</b><span>${area?.name || ''} · ${visit?.guest_label || ''}</span>`;
      const title = card.querySelector('header strong');
      if (title && table) title.textContent = `МАСА ${table.table_number}`;
      const next = card.querySelector('[data-next-guests]');
      const close = card.querySelector('[data-close-visit]');
      const canFinish = visitIsKitchenDone(order.visit_id) && Boolean(visit?.bill_printed_at);
      if (next) {
        next.disabled = !canFinish;
        next.textContent = 'ПЛАТЕНО · СЛЕДВАЩИ ГОСТИ';
      }
      if (close) {
        close.disabled = !canFinish;
        close.textContent = 'ПЛАТЕНО · ОСВОБОДИ МАСАТА';
      }
    });

    const pending = visitOrders(null).length;
    const kitchenRemaining = orders().reduce((sum, order) => sum + kitchenItemsForOrder(order)
      .reduce((inner, item) => inner + Math.max(0, Number(item.quantity || 0) - Number(item.delivered_quantity || 0)), 0), 0);
    document.querySelectorAll('[data-manager-v2-view="manager"] b').forEach(badge => badge.textContent = String(kitchenRemaining));
  }

  function decorateNotes() {
    document.querySelectorAll('.note-card').forEach(card => {
      const orderId = card.querySelector('[data-edit-note]')?.dataset.editNote || card.querySelector('[data-bill]')?.dataset.bill;
      const order = orderFor(orderId);
      if (!order) return;
      const visit = visitFor(order.visit_id);
      const table = tableFor(order.table_id);
      const area = areaFor(table?.area_id);
      let label = card.querySelector('.stage1-order-label');
      if (!label) {
        label = document.createElement('div');
        label.className = 'stage1-order-label';
        card.querySelector('header')?.appendChild(label);
      }
      label.textContent = orderKind(order) === 'new'
        ? `НОВО · ${visit?.guest_label || '1-ви гости'} · ХЛЯБ`
        : `ДОБАВКА · ${visit?.guest_label || ''}`;
      label.classList.toggle('addition', orderKind(order) !== 'new');
      const title = card.querySelector('header strong');
      if (title && table) title.textContent = `${area?.name || ''} · МАСА ${table.table_number} · ${visit?.guest_label || ''}`;
      const bill = card.querySelector('[data-bill]');
      if (bill && visit) {
        bill.hidden = visit.status !== 'active' || ['paid', 'cancelled'].includes(visit.bill_status);
        bill.textContent = `СМЕТКА ЗА ${visit.guest_label.toUpperCase()} · ${money(visitTotal(visit.id))}`;
      }
    });

    document.querySelectorAll('.waiter-note-history').forEach(card => {
      const number = (card.textContent.match(/№\s*([^\s·]+)/) || [])[1];
      const order = orders().find(entry => String(entry.order_number) === String(number));
      if (!order) return;
      const visit = visitFor(order.visit_id);
      let label = card.querySelector('.stage1-mobile-label');
      if (!label) {
        label = document.createElement('div');
        label.className = 'stage1-mobile-label';
        card.querySelector('header')?.insertAdjacentElement('afterend', label);
      }
      label.textContent = orderKind(order) === 'new'
        ? `НОВО · ${visit?.guest_label || '1-ви гости'} · СЛОЖИ ХЛЯБ`
        : `ДОБАВКА · ${visit?.guest_label || ''}`;
      label.classList.toggle('addition', orderKind(order) !== 'new');
    });
  }

  async function printVisitBill(visit, button) {
    button.disabled = true;
    const original = button.textContent;
    button.textContent = 'ИЗПРАЩА СЕ…';
    try {
      const result = await Z.rpc('zorbas_print_visit_bill_v1', {p_token: Z.token(), p_visit_id: visit.id});
      Z.toast(`Сметката е изпратена към Print 1 · ${money(result.subtotal)}`, 'success');
      await refresh();
    } catch (error) {
      Z.toast(error.message, 'error');
      button.disabled = false;
      button.textContent = original;
    }
  }

  async function finishVisit(tableId, nextGuests, button) {
    if (!confirm(nextGuests ? 'Платено ли е и да започна ли следващите гости?' : 'Платено ли е и да освободя ли масата?')) return;
    button.disabled = true;
    try {
      if (nextGuests) await Z.rpc('zorbas_start_next_guests_v1', {p_token: Z.token(), p_table_id: tableId});
      else await Z.rpc('zorbas_close_visit_v1', {p_token: Z.token(), p_table_id: tableId});
      Z.toast(nextGuests ? 'Следващите гости са започнати.' : 'Масата е свободна.', 'success');
      await refresh();
    } catch (error) {
      Z.toast(error.message, 'error');
      button.disabled = false;
    }
  }

  function decorateTableInfo() {
    const root = document.getElementById('tableInfo');
    if (!root || typeof selectedTable === 'undefined' || !selectedTable) return;
    const table = tableFor(selectedTable);
    const visit = visitFor(table?.active_visit_id);
    root.querySelector('[data-visit-quick-actions]')?.classList.add('hidden');
    root.querySelector('[data-stage1-visit-panel]')?.remove();
    if (!visit) return;

    const related = visitOrders(visit.id);
    const kitchenDone = visitIsKitchenDone(visit.id);
    const total = visitTotal(visit.id);
    const panel = document.createElement('section');
    panel.dataset.stage1VisitPanel = '1';
    panel.className = 'stage1-visit-panel';
    panel.innerHTML = `
      <header><div><small>ТЕКУЩО ПОСЕЩЕНИЕ</small><h4>${visit.guest_label}</h4></div><b>${money(total)}</b></header>
      <div class="stage1-visit-status">
        <span>${related.length} бележки</span>
        <span class="${kitchenDone ? 'ok' : 'wait'}">${kitchenDone ? '✓ Кухнята е приключена' : 'Кухнята още работи'}</span>
        <span class="${visit.bill_printed_at ? 'ok' : 'wait'}">${visit.bill_printed_at ? `✓ Сметка печатана ${visit.bill_print_count || 1} пъти` : 'Сметката не е печатана'}</span>
      </div>
      <button class="btn light full" data-stage1-bill>СМЕТКА · ${money(total)}</button>
      <div class="stage1-finish-actions">
        <button class="btn" data-stage1-next ${!kitchenDone || !visit.bill_printed_at ? 'disabled' : ''}>ПЛАТЕНО · СЛЕДВАЩИ ГОСТИ</button>
        <button class="btn green" data-stage1-close ${!kitchenDone || !visit.bill_printed_at ? 'disabled' : ''}>ПЛАТЕНО · ОСВОБОДИ</button>
      </div>`;
    root.appendChild(panel);
    panel.querySelector('[data-stage1-bill]').onclick = event => printVisitBill(visit, event.currentTarget);
    panel.querySelector('[data-stage1-next]').onclick = event => finishVisit(table.id, true, event.currentTarget);
    panel.querySelector('[data-stage1-close]').onclick = event => finishVisit(table.id, false, event.currentTarget);
  }

  function decorateHeadings() {
    const title = document.querySelector('#view-manager .view-head h3');
    const description = document.querySelector('#view-manager .view-head p');
    if (title) title.textContent = 'Manager · само кухнята';
    if (description) description.textContent = 'Напитките не се показват. Отбелязвай издадените порции по брой: 0/3, 1/3, 2/3, 3/3.';
  }

  function decorateAll() {
    if (decorating || !getSnapshot()) return;
    decorating = true;
    try {
      decorateHeadings();
      decorateManagerItems();
      decorateNotes();
      decorateTableInfo();
    } finally {
      decorating = false;
    }
  }

  new MutationObserver(schedule).observe(document.body, {childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'disabled']});
  window.addEventListener('resize', schedule);
  schedule();
})();
