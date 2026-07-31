(() => {
  if (window.ZorbasStage1) return;
  window.ZorbasStage1 = true;

  const busyItems = new Set();
  let decorating = false;
  let scheduled = false;

  const snap = () => (typeof snapshot !== 'undefined' ? snapshot : null);
  const orders = () => snap()?.orders || [];
  const visits = () => snap()?.visits || [];
  const tables = () => snap()?.tables || [];
  const areas = () => snap()?.areas || [];
  const menuItems = () => snap()?.items || [];
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
    return Boolean(menuItems().find(entry => entry.id === item.menu_item_id)?.send_to_kitchen);
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
    return visitOrders(visitId).flatMap(kitchenItemsForOrder).reduce((result, item) => {
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
    return order?.order_kind || (inferredSequence(order) === 1 ? 'new' : 'addition');
  }

  function visitIsKitchenDone(visitId) {
    return visitOrders(visitId).every(order => !order.manager_required || order.manager_state === 'completed');
  }

  function money(value) {
    return Z?.money ? Z.money(Number(value || 0)) : `${Number(value || 0).toFixed(2)} лв.`;
  }

  function setText(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
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
      const itemId = row.querySelector('[data-item]')?.dataset.item;
      const item = itemFor(itemId);
      const order = orderForItem(itemId);
      const kitchen = Boolean(item && isKitchenItem(item));
      if (row.hidden === kitchen) row.hidden = !kitchen;
      if (!kitchen) return;

      row.dataset.stage1KitchenItem = '1';
      const ordered = Number(item.quantity || 0);
      const deliveredQuantity = Math.min(Number(item.delivered_quantity || 0), ordered);
      const delivered = deliveredQuantity >= ordered;
      const signature = `${item.manager_version}:${ordered}:${deliveredQuantity}:${order?.manager_state}:${item.status}`;
      if (row.dataset.stage1Signature !== signature) {
        row.dataset.stage1Signature = signature;
        const old = row.querySelector('[data-stage1-quantity]');
        const control = quantityControl(item, order);
        if (old) old.replaceWith(control); else row.appendChild(control);
      }
      row.classList.toggle('is-delivered', delivered);
      row.classList.toggle('stage1-partial', !delivered && deliveredQuantity > 0);
      setText(row.querySelector('.manager-state'), delivered ? 'ИЗДАДЕНО' : deliveredQuantity > 0 ? 'ЧАСТИЧНО' : 'ЧАКА');
    });

    board.querySelectorAll('.manager-order').forEach(section => {
      const complete = section.querySelector('[data-complete-order]');
      const order = orderFor(complete?.dataset.completeOrder);
      if (!order) return;
      const kitchen = kitchenItemsForOrder(order);
      const shouldHide = kitchen.length === 0;
      if (section.hidden !== shouldHide) section.hidden = shouldHide;
      if (shouldHide) return;
      const ready = kitchen.every(item => Number(item.delivered_quantity || 0) >= Number(item.quantity || 0));
      if (complete.disabled === ready) complete.disabled = !ready;
      setText(complete, ready ? '✓ КУХНЯТА Е ИЗДАДЕНА · В АРХИВ' : 'ПЪРВО ИЗДАЙ ВСИЧКИ КУХНЕНСКИ ПРОДУКТИ');
      complete.classList.toggle('manager-v2-ready', ready);
      const prefix = orderKind(order) === 'new' ? 'НОВО' : 'ДОБАВКА';
      setText(section.querySelector('.manager-order-head b'), `${prefix} · Бележка №${order.order_number}`);
    });

    board.querySelectorAll('.manager-visit-card').forEach(card => {
      const order = [...card.querySelectorAll('[data-complete-order]')]
        .map(button => orderFor(button.dataset.completeOrder)).find(Boolean);
      if (!order?.visit_id) return;
      const visit = visitFor(order.visit_id);
      const table = tableFor(visit?.table_id);
      const area = areaFor(table?.area_id);
      const stats = kitchenStatsForVisit(order.visit_id);
      const counters = card.querySelector('.visit-counters');
      const counterSignature = `${stats.delivered}:${stats.ordered}:${area?.name}:${visit?.guest_label}`;
      if (counters && counters.dataset.stage1Signature !== counterSignature) {
        counters.dataset.stage1Signature = counterSignature;
        counters.innerHTML = `<b>${stats.delivered}/${stats.ordered} издадени</b><span>${area?.name || ''} · ${visit?.guest_label || ''}</span>`;
      }
      if (table) setText(card.querySelector('header strong'), `МАСА ${table.table_number}`);
      const canFinish = visitIsKitchenDone(order.visit_id) && Boolean(visit?.bill_printed_at);
      const next = card.querySelector('[data-next-guests]');
      const close = card.querySelector('[data-close-visit]');
      if (next) {
        if (next.disabled === canFinish) next.disabled = !canFinish;
        setText(next, 'ПЛАТЕНО · СЛЕДВАЩИ ГОСТИ');
      }
      if (close) {
        if (close.disabled === canFinish) close.disabled = !canFinish;
        setText(close, 'ПЛАТЕНО · ОСВОБОДИ МАСАТА');
      }
    });

    const kitchenRemaining = orders().reduce((sum, order) => sum + kitchenItemsForOrder(order)
      .reduce((inner, item) => inner + Math.max(0, Number(item.quantity || 0) - Number(item.delivered_quantity || 0)), 0), 0);
    document.querySelectorAll('[data-manager-v2-view="manager"] b').forEach(badge => setText(badge, String(kitchenRemaining)));
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
      const isNew = orderKind(order) === 'new';
      setText(label, isNew ? `НОВО · ${visit?.guest_label || '1-ви гости'} · ХЛЯБ` : `ДОБАВКА · ${visit?.guest_label || ''}`);
      label.classList.toggle('addition', !isNew);
      if (table) setText(card.querySelector('header strong'), `${area?.name || ''} · МАСА ${table.table_number} · ${visit?.guest_label || ''}`);
      const bill = card.querySelector('[data-bill]');
      if (bill && visit) {
        const visible = visit.status === 'active' && !['paid', 'cancelled'].includes(visit.bill_status);
        if (bill.hidden === visible) bill.hidden = !visible;
        setText(bill, `СМЕТКА ЗА ${visit.guest_label.toUpperCase()} · ${money(visitTotal(visit.id))}`);
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
      const isNew = orderKind(order) === 'new';
      setText(label, isNew ? `НОВО · ${visit?.guest_label || '1-ви гости'} · СЛОЖИ ХЛЯБ` : `ДОБАВКА · ${visit?.guest_label || ''}`);
      label.classList.toggle('addition', !isNew);
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
    const oldQuick = root.querySelector('[data-visit-quick-actions]');
    if (oldQuick && !oldQuick.classList.contains('hidden')) oldQuick.classList.add('hidden');
    const current = root.querySelector('[data-stage1-visit-panel]');
    if (!visit) {
      current?.remove();
      return;
    }

    const related = visitOrders(visit.id);
    const kitchenDone = visitIsKitchenDone(visit.id);
    const total = visitTotal(visit.id);
    const signature = `${visit.id}:${visit.version}:${visit.bill_status}:${visit.bill_print_count}:${related.length}:${kitchenDone}:${total}`;
    if (current?.dataset.signature === signature) return;

    const panel = document.createElement('section');
    panel.dataset.stage1VisitPanel = '1';
    panel.dataset.signature = signature;
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
    panel.querySelector('[data-stage1-bill]').onclick = event => printVisitBill(visit, event.currentTarget);
    panel.querySelector('[data-stage1-next]').onclick = event => finishVisit(table.id, true, event.currentTarget);
    panel.querySelector('[data-stage1-close]').onclick = event => finishVisit(table.id, false, event.currentTarget);
    if (current) current.replaceWith(panel); else root.appendChild(panel);
  }

  function decorateHeadings() {
    setText(document.querySelector('#view-manager .view-head h3'), 'Manager · само кухнята');
    setText(document.querySelector('#view-manager .view-head p'), 'Напитките не се показват. Отбелязвай издадените порции по брой: 0/3, 1/3, 2/3, 3/3.');
  }

  function decorateAll() {
    if (decorating || !snap()) return;
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

  new MutationObserver(schedule).observe(document.body, {childList: true, subtree: true});
  window.addEventListener('resize', schedule);
  schedule();
})();
