(() => {
  if (window.ZorbasStage3V3) return;
  window.ZorbasStage3V3 = true;

  const mobileReady = typeof waiterState !== 'undefined' && typeof renderWaiterNote === 'function';
  const esc = value => Z.esc(value == null ? '' : String(value));
  const snap = () => (typeof snapshot !== 'undefined' ? snapshot : null);
  const tables = () => snap()?.tables || [];
  const areas = () => snap()?.areas || [];
  const visits = () => snap()?.visits || [];
  const orders = () => snap()?.orders || [];
  let editingOrderId = null;
  let refreshBusy = false;

  if (mobileReady) {
    waiterState.visitId = waiterState.visitId || null;
    waiterState.newGuest = Boolean(waiterState.newGuest);
  }

  function tableFor(id) {
    return tables().find(table => table.id === id) || null;
  }

  function areaFor(id) {
    return areas().find(area => area.id === id) || null;
  }

  function activeVisits(tableId) {
    return visits()
      .filter(visit => visit.table_id === tableId && visit.status === 'active')
      .sort((a, b) => Number(a.visit_number || 0) - Number(b.visit_number || 0) || new Date(a.opened_at) - new Date(b.opened_at));
  }

  function guestName(visit, tableId) {
    if (!visit) return `Гост ${activeVisits(tableId).length + 1}`;
    const list = activeVisits(tableId);
    const index = Math.max(0, list.findIndex(entry => entry.id === visit.id));
    return /^Гост\s+\d+/i.test(String(visit.guest_label || '')) ? visit.guest_label : `Гост ${index + 1}`;
  }

  function visitOrders(visitId) {
    return orders()
      .filter(order => order.visit_id === visitId && !['cancelled', 'returned'].includes(order.status))
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }

  function visitState(visit) {
    if (!visit) return {visit: null, orders: [], total: 0, pendingKitchen: 0, itemCount: 0};
    const list = visitOrders(visit.id);
    let total = 0;
    let pendingKitchen = 0;
    let itemCount = 0;
    list.forEach(order => {
      (order.items || []).forEach(item => {
        if (item.status === 'cancelled') return;
        const quantity = Number(item.quantity || 0);
        total += quantity * Number(item.unit_price || 0);
        itemCount += quantity;
        if (item.send_to_kitchen_snapshot) {
          pendingKitchen += Math.max(0, quantity - Number(item.delivered_quantity || 0));
        }
      });
    });
    return {visit, orders: list, total, pendingKitchen, itemCount};
  }

  function tableState(tableId) {
    const guestStates = activeVisits(tableId).map(visitState);
    return guestStates.reduce((result, state) => {
      result.total += state.total;
      result.pendingKitchen += state.pendingKitchen;
      result.itemCount += state.itemCount;
      result.orderCount += state.orders.length;
      return result;
    }, {guests: guestStates, total: 0, pendingKitchen: 0, itemCount: 0, orderCount: 0});
  }

  function selectedVisit(tableId) {
    const list = activeVisits(tableId);
    const chosen = list.find(visit => visit.id === waiterState?.visitId);
    if (chosen) return chosen;
    if (waiterState?.newGuest || !list.length) return null;
    if (mobileReady) waiterState.visitId = list[0].id;
    return list[0];
  }

  function orderTotal(order) {
    return (order?.items || [])
      .filter(item => item.status !== 'cancelled')
      .reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_price || 0), 0);
  }

  function kitchenState(item) {
    if (!item.send_to_kitchen_snapshot) return '<span class="stage3-bar-state">БАР</span>';
    const quantity = Number(item.quantity || 0);
    const delivered = Math.min(quantity, Number(item.delivered_quantity || 0));
    if (delivered >= quantity) return '<span class="stage3-kitchen-state done">ИЗДАДЕНО</span>';
    if (delivered > 0) return `<span class="stage3-kitchen-state partial">ДАДЕНО ${delivered}/${quantity}</span>`;
    return `<span class="stage3-kitchen-state">ЧАКА ${quantity}</span>`;
  }

  function openedTime(visit) {
    if (!visit?.opened_at) return '';
    return new Date(visit.opened_at).toLocaleTimeString('bg-BG', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Sofia'
    });
  }

  function guestTabsHtml(tableId, selectedId = null, newGuest = false) {
    const list = activeVisits(tableId);
    const buttons = list.map(visit => {
      const state = visitState(visit);
      const active = !newGuest && visit.id === selectedId;
      return `<button type="button" class="stage3-guest-tab ${active ? 'active' : ''}" data-stage3-select-visit="${visit.id}">
        <span>${esc(guestName(visit, tableId))}</span>
        <b>${Z.money(state.total)}</b>
        <small>${state.pendingKitchen ? `${state.pendingKitchen} чакат` : 'готово'}</small>
      </button>`;
    }).join('');
    const nextName = `Гост ${list.length + 1}`;
    return `<div class="stage3-guest-tabs">
      ${buttons}
      <button type="button" class="stage3-guest-tab new ${newGuest || !list.length ? 'active' : ''}" data-stage3-new-guest="${tableId}">
        <span>＋ ${esc(nextName)}</span><small>нова сметка</small>
      </button>
    </div>`;
  }

  function visitHistoryHtml(tableId, visitId = null, compact = false) {
    const table = tableFor(tableId);
    const area = areaFor(table?.area_id);
    const visit = activeVisits(tableId).find(entry => entry.id === visitId) || null;
    const state = visitState(visit);

    if (!visit) {
      return `<section class="stage3-live-note empty-visit ${compact ? 'compact' : ''}">
        <header>
          <div><small>НОВА СМЕТКА</small><strong>${esc(guestName(null, tableId))}</strong><span>${esc(area?.name || '')} · Маса ${esc(table?.table_number || '—')}</span></div>
        </header>
        <p>Напиши първата поръчка за този гост. След печат бележката остава тук до натискане на „Сметка“.</p>
      </section>`;
    }

    const canClose = state.orders.length > 0 && state.pendingKitchen <= 0;
    const billLabel = state.pendingKitchen > 0 ? `${state.pendingKitchen} чакат кухня` : 'Печат и приключване';

    return `<section class="stage3-live-note ${compact ? 'compact' : ''}" data-stage3-visit="${visit.id}">
      <header>
        <div>
          <small>АКТИВНА СМЕТКА</small>
          <strong>${esc(guestName(visit, tableId))}</strong>
          <span>${esc(area?.name || '')} · Маса ${esc(table?.table_number || '—')} · ${openedTime(visit)}</span>
        </div>
        <button type="button" class="stage3-bill-button" data-stage3-close-bill="${visit.id}" ${canClose ? '' : 'disabled'}>
          <small>СМЕТКА</small><b>${Z.money(state.total)}</b><span>${billLabel}</span>
        </button>
      </header>

      <div class="stage3-visit-summary">
        <span><b>${state.orders.length}</b> бележки</span>
        <span><b>${state.itemCount}</b> позиции</span>
        <span class="${state.pendingKitchen ? 'waiting' : 'ready'}">${state.pendingKitchen ? 'Чака кухня' : 'Готово за сметка'}</span>
      </div>

      <div class="stage3-order-history">
        ${state.orders.map((order, index) => {
          const kind = order.order_kind === 'addition' || Number(order.visit_sequence || index + 1) > 1 ? 'ДОБАВКА' : 'НОВА';
          const time = new Date(order.created_at).toLocaleTimeString('bg-BG', {
            hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Sofia'
          });
          const editable = !['completed', 'cancelled', 'returned'].includes(order.status);
          return `<article class="stage3-order-block ${kind === 'НОВА' ? 'new' : 'addition'}">
            <header>
              <div><b>${kind}</b><span>№${esc(order.order_number)} · ${time}</span></div>
              ${editable ? `<button type="button" data-stage3-edit-order="${order.id}">РЕДАКТИРАЙ</button>` : ''}
            </header>
            <div>${(order.items || []).map(item => {
              const cancelled = item.status === 'cancelled';
              const lineTotal = Number(item.quantity || 0) * Number(item.unit_price || 0);
              return `<p class="${cancelled ? 'cancelled' : ''}">
                <span class="stage3-item-name">
                  <b>${Number(item.quantity || 0)} × ${esc(item.item_name)}</b>
                  ${item.note ? `<small>${esc(item.note)}</small>` : ''}
                  <small>${Z.money(lineTotal)}</small>
                </span>
                ${cancelled ? '<em>ОТКАЗАНО</em>' : kitchenState(item)}
              </p>`;
            }).join('')}</div>
            <footer><span>${esc(order.created_by_name || '')}</span><b>${Z.money(orderTotal(order))}</b></footer>
          </article>`;
        }).join('') || '<p class="stage3-no-orders">Няма изпратени бележки.</p>'}
      </div>
    </section>`;
  }

  function ensureEditDialog() {
    let dialog = document.getElementById('stage3WaiterEditDialog');
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = 'stage3WaiterEditDialog';
    dialog.className = 'stage3-edit-dialog';
    dialog.innerHTML = `<form method="dialog" class="stage3-edit-card">
      <header><div><small>РЕДАКЦИЯ НА БЕЛЕЖКА</small><h3 id="stage3EditTitle">Бележка</h3></div><button value="cancel" aria-label="Затвори">×</button></header>
      <div id="stage3EditRows" class="stage3-edit-rows"></div>
      <label class="stage3-edit-reason"><span>Причина</span><input id="stage3EditReason" placeholder="Грешка, отказ, промяна…"></label>
      <button type="button" class="stage3-edit-save" id="stage3EditSave">ЗАПАЗИ И ИЗПРАТИ КОРЕКЦИЯ</button>
    </form>`;
    document.body.appendChild(dialog);
    dialog.addEventListener('click', event => {
      const adjust = event.target.closest('[data-stage3-edit-adjust]');
      if (!adjust) return;
      const input = dialog.querySelector(`[data-stage3-edit-input="${adjust.dataset.itemId}"]`);
      if (!input) return;
      const delta = Number(adjust.dataset.stage3EditAdjust || 0);
      const min = Number(input.min || 0);
      input.value = String(Math.max(min, Number(input.value || 0) + delta));
    });
    dialog.querySelector('#stage3EditSave').onclick = saveEdit;
    return dialog;
  }

  function openEdit(orderId) {
    const order = orders().find(entry => entry.id === orderId);
    if (!order) return Z.toast('Бележката не е намерена.', 'error');
    editingOrderId = orderId;
    const dialog = ensureEditDialog();
    dialog.querySelector('#stage3EditTitle').textContent = `Бележка №${order.order_number}`;
    dialog.querySelector('#stage3EditReason').value = '';
    dialog.querySelector('#stage3EditRows').innerHTML = (order.items || []).map(item => {
      const cancelled = item.status === 'cancelled';
      const delivered = Number(item.delivered_quantity || 0);
      const minimum = item.send_to_kitchen_snapshot ? delivered : 0;
      const value = cancelled ? 0 : Number(item.quantity || 0);
      return `<div class="stage3-edit-row ${cancelled ? 'cancelled' : ''}">
        <div><b>${esc(item.item_name)}</b><small>${item.send_to_kitchen_snapshot ? `Издадени: ${delivered}` : 'Бар'}</small></div>
        <div class="stage3-edit-qty">
          <button type="button" data-stage3-edit-adjust="-1" data-item-id="${item.id}" ${cancelled ? 'disabled' : ''}>−</button>
          <input type="number" step="1" min="${minimum}" value="${value}" data-stage3-edit-input="${item.id}" ${cancelled ? 'disabled' : ''}>
          <button type="button" data-stage3-edit-adjust="1" data-item-id="${item.id}" ${cancelled ? 'disabled' : ''}>+</button>
        </div>
      </div>`;
    }).join('');
    dialog.showModal();
  }

  async function saveEdit() {
    const order = orders().find(entry => entry.id === editingOrderId);
    const dialog = ensureEditDialog();
    if (!order) return dialog.close();
    const payload = (order.items || []).map(item => {
      const input = dialog.querySelector(`[data-stage3-edit-input="${item.id}"]`);
      return {id: item.id, quantity: input ? Number(input.value || 0) : (item.status === 'cancelled' ? 0 : Number(item.quantity || 0))};
    });
    const changed = payload.some(row => {
      const item = order.items.find(entry => entry.id === row.id);
      return row.quantity !== (item.status === 'cancelled' ? 0 : Number(item.quantity || 0));
    });
    if (!changed) return Z.toast('Няма промяна.', 'error');

    const button = dialog.querySelector('#stage3EditSave');
    button.disabled = true;
    button.textContent = 'ЗАПИСВА…';
    try {
      await Z.rpc('zorbas_staff_edit_order_v1', {
        p_token: Z.token(),
        p_order_id: order.id,
        p_expected_revision: Number(order.revision || 1),
        p_items: payload,
        p_reason: dialog.querySelector('#stage3EditReason').value || null
      });
      dialog.close();
      Z.toast('Бележката е коригирана и сумата е обновена.', 'success');
      await refresh();
    } catch (error) {
      Z.toast(error.message, 'error');
    } finally {
      button.disabled = false;
      button.textContent = 'ЗАПАЗИ И ИЗПРАТИ КОРЕКЦИЯ';
    }
  }

  async function closeWithBill(visitId, button) {
    const visit = visits().find(entry => entry.id === visitId && entry.status === 'active');
    const table = tableFor(visit?.table_id);
    const state = visitState(visit);
    if (!visit || !table) return Z.toast('Тези гости вече са приключени.', 'error');
    if (state.pendingKitchen > 0) return Z.toast(`Още ${state.pendingKitchen} кухненски позиции не са издадени.`, 'error');
    if (!state.orders.length) return Z.toast('Няма поръчки за сметка.', 'error');

    const confirmed = confirm(`Да отпечатам ${guestName(visit, table.id)} — ${Z.money(state.total)} на Print 1?`);
    if (!confirmed) return;

    button.disabled = true;
    const old = button.innerHTML;
    button.innerHTML = '<b>ИЗПРАЩА СЕ…</b>';
    try {
      const result = await Z.rpc('zorbas_print_and_close_guest_v1', {
        p_token: Z.token(),
        p_visit_id: visitId
      });
      Z.toast(`Сметката ${Z.money(result.subtotal)} е изпратена на Print 1.`, 'success');
      if (mobileReady) {
        waiterState.cart = [];
        waiterState.query = '';
        waiterState.newGuest = false;
      }
      await refresh();
      const remaining = activeVisits(table.id);
      if (mobileReady) {
        if (remaining.length) {
          waiterState.tableId = table.id;
          waiterState.visitId = remaining[0].id;
          waiterState.step = 'note';
          selectedTable = table.id;
        } else {
          waiterState.tableId = null;
          waiterState.visitId = null;
          waiterState.step = 'tables';
          selectedTable = null;
        }
        renderWaiterMobile();
      }
      if (typeof renderMap === 'function') renderMap();
    } catch (error) {
      Z.toast(error.message, 'error');
      button.disabled = false;
      button.innerHTML = old;
    }
  }

  document.addEventListener('click', event => {
    const tableButton = event.target.closest('[data-waiter-table]');
    if (tableButton && mobileReady) {
      waiterState.visitId = null;
      waiterState.newGuest = false;
    }

    const baseAction = event.target.closest('[data-waiter-action]');
    if (baseAction && mobileReady && ['areas', 'tables'].includes(baseAction.dataset.waiterAction)) {
      waiterState.visitId = null;
      waiterState.newGuest = false;
    }

    const visitButton = event.target.closest('[data-stage3-select-visit]');
    if (visitButton && mobileReady) {
      event.preventDefault();
      event.stopPropagation();
      waiterState.visitId = visitButton.dataset.stage3SelectVisit;
      waiterState.newGuest = false;
      waiterState.cart = [];
      waiterState.query = '';
      waiterState.step = 'note';
      renderWaiterMobile();
      return;
    }

    const newGuestButton = event.target.closest('[data-stage3-new-guest]');
    if (newGuestButton && mobileReady) {
      event.preventDefault();
      event.stopPropagation();
      if (waiterState.cart.length && !confirm('Да изчистя непратените позиции и да започна нов гост?')) return;
      waiterState.visitId = null;
      waiterState.newGuest = true;
      waiterState.cart = [];
      waiterState.query = '';
      waiterState.step = 'note';
      renderWaiterMobile();
      setTimeout(() => document.getElementById('waiterQuickInput')?.focus(), 30);
      return;
    }

    const billButton = event.target.closest('[data-stage3-close-bill]');
    if (billButton) {
      event.preventDefault();
      event.stopPropagation();
      closeWithBill(billButton.dataset.stage3CloseBill, billButton);
      return;
    }

    const editButton = event.target.closest('[data-stage3-edit-order]');
    if (editButton) {
      event.preventDefault();
      event.stopPropagation();
      openEdit(editButton.dataset.stage3EditOrder);
    }
  }, true);

  if (mobileReady) {
    renderWaiterTables = function renderWaiterTablesStage3() {
      const areaId = waiterState.areaId || selectedArea || snap()?.areas?.[0]?.id;
      const areaTables = tables().filter(table => table.area_id === areaId);
      return `
        <div class="waiter-screen-head">
          <button class="waiter-back" data-waiter-action="areas">←</button>
          <div><small>ОБЛАСТ</small><h3>${esc(areaFor(areaId)?.name || '')}</h3></div>
          <span>${areaTables.length} маси</span>
        </div>
        <div class="waiter-table-grid stage3-table-grid">
          ${areaTables.map(table => {
            const stateName = waiterTableState(table);
            const live = tableState(table.id);
            const label = stateName === 'occupied' ? 'Заета' : stateName === 'blocked' ? 'Блокирана' : 'Свободна';
            return `<button class="waiter-table-card ${stateName}" data-waiter-table="${table.id}" ${stateName === 'blocked' ? 'disabled' : ''}>
              <small>${label}</small>
              <strong>${esc(table.table_number)}</strong>
              ${live.guests.length
                ? `<span>${live.guests.length} ${live.guests.length === 1 ? 'гост' : 'гости'} · ${Z.money(live.total)}</span><em>${live.pendingKitchen ? `${live.pendingKitchen} чакат кухня` : 'готови за сметка'}</em>`
                : `<span>${Number(table.seats || 0)} места</span><em>нова бележка</em>`}
            </button>`;
          }).join('') || '<p class="empty">Няма маси в тази област.</p>'}
        </div>`;
    };

    renderWaiterNote = function renderWaiterNoteStage3() {
      const table = tableFor(waiterState.tableId || selectedTable);
      if (!table) return '';
      const visit = selectedVisit(table.id);
      const isNew = waiterState.newGuest || !visit;
      if (!activeVisits(table.id).length) waiterState.newGuest = true;
      return `
        <div class="waiter-screen-head">
          <button class="waiter-back" data-waiter-action="tables">←</button>
          <div><small>${esc(areaFor(table.area_id)?.name || '')}</small><h3>Маса ${esc(table.table_number || '—')}</h3></div>
          <span>${activeVisits(table.id).length} активни</span>
        </div>

        ${guestTabsHtml(table.id, visit?.id || null, isNew)}

        <section class="waiter-notepad stage3-waiter-notepad">
          ${visitHistoryHtml(table.id, visit?.id || null)}

          <div class="stage3-new-position-title">
            <span>НОВА ПОЗИЦИЯ</span>
            <small>за ${esc(visit ? guestName(visit, table.id) : guestName(null, table.id))}</small>
          </div>
          <div class="waiter-lines stage3-current-cart">${waiterCartRows()}</div>
          <label class="waiter-composer">
            <span>Нова позиция</span>
            <input id="waiterQuickInput" value="${esc(waiterState.query)}" autocomplete="off" autocapitalize="sentences" spellcheck="false" placeholder="Започни да пишеш…">
          </label>
          <div id="waiterSuggestionBox"></div>
        </section>

        <button class="waiter-main-action" data-waiter-action="preview" ${waiterState.cart.length ? '' : 'disabled'}>
          ПРЕГЛЕД <span>→</span>
        </button>`;
    };

    renderWaiterPreview = function renderWaiterPreviewStage3() {
      const table = tableFor(waiterState.tableId || selectedTable);
      const visit = selectedVisit(table?.id);
      const rows = waiterState.cart.map(row => {
        const item = snap()?.items?.find(entry => entry.id === row.menu_item_id);
        const total = Number(item?.price || 0) * Number(row.quantity || 0);
        return `<div class="waiter-receipt-row"><span>${row.quantity} × ${esc(item?.name || 'Артикул')}</span><b>${item?.price_pending ? '—' : Z.money(total)}</b></div>`;
      }).join('');
      const targetGuest = visit ? guestName(visit, table?.id) : guestName(null, table?.id);
      const nextKind = visit ? 'ДОБАВКА' : 'НОВА СМЕТКА';

      return `
        <div class="waiter-screen-head">
          <button class="waiter-back" data-waiter-action="note">←</button>
          <div><small>${nextKind}</small><h3>Бележката е готова</h3></div>
          <span>${waiterState.cart.reduce((sum, row) => sum + Number(row.quantity || 0), 0)} позиции</span>
        </div>
        <article class="waiter-receipt">
          <header><small>${nextKind}</small><h2>ZORBAS</h2><p>${esc(areaFor(table?.area_id)?.name || '')} · Маса ${esc(table?.table_number || '—')}</p><b>${esc(targetGuest)}</b></header>
          <div class="waiter-receipt-meta"><span>${esc(document.getElementById('sessionName')?.textContent?.split(' · ')[0] || 'Сервитьор')}</span><span>${new Date().toLocaleTimeString('bg-BG',{hour:'2-digit',minute:'2-digit'})}</span></div>
          <div class="waiter-receipt-items">${rows}</div>
          <footer><span>Общо ново</span><strong>${Z.money(waiterCartTotal())}</strong></footer>
        </article>
        <div class="waiter-print-title">Къде да се изпрати?</div>
        <div class="waiter-print-grid">
          <button class="waiter-print light" data-waiter-print="staff" ${waiterState.printing ? 'disabled' : ''}><strong>PRINT 1</strong><span>Бар / сервитьори</span></button>
          <button class="waiter-print both" data-waiter-print="both" ${waiterState.printing ? 'disabled' : ''}><strong>И ДВАТА</strong><span>Цялото на Print 1 · кухнята на Print 2</span></button>
          <button class="waiter-print primary" data-waiter-print="kitchen" ${waiterState.printing ? 'disabled' : ''}><strong>PRINT 2</strong><span>Само кухня</span></button>
        </div>`;
    };

    printWaiterOrder = async function printWaiterOrderStage3(route) {
      if (waiterState.printing || !waiterState.cart.length || !waiterState.tableId) return;
      waiterState.printing = true;
      renderWaiterMobile();
      const tableId = waiterState.tableId;
      const visit = selectedVisit(tableId);
      try {
        const result = await Z.rpc('zorbas_create_order_v4', {
          p_token: Z.token(),
          p_table_id: tableId,
          p_visit_id: visit?.id || null,
          p_open_new_guest: !visit,
          p_order_type: 'dine_in',
          p_customer_name: null,
          p_customer_phone: null,
          p_ready_at: null,
          p_note: null,
          p_items: waiterState.cart,
          p_route: route
        });
        Z.toast(`${result.order_kind === 'addition' ? 'Добавката' : 'Новата бележка'} ${result.code} е изпратена.`, 'success');
        waiterState.cart = [];
        waiterState.query = '';
        waiterState.visitId = result.visit_id;
        waiterState.newGuest = false;
        waiterState.step = 'note';
        waiterState.tableId = tableId;
        selectedTable = tableId;
        await refresh();
      } catch (error) {
        Z.toast(error.message, 'error');
      } finally {
        waiterState.printing = false;
        waiterState.step = 'note';
        waiterState.tableId = tableId;
        selectedTable = tableId;
        renderWaiterMobile();
        setTimeout(() => document.getElementById('waiterQuickInput')?.focus(), 30);
      }
    };

    const stage3BaseRenderWaiterMobile = renderWaiterMobile;
    renderWaiterMobile = function renderWaiterMobileStage3() {
      const isMobile = window.matchMedia('(max-width:650px)').matches;
      const isOrderMode = waiterState.mobileMode !== 'notes'
        && waiterState.mobileMode !== 'manage'
        && !String(waiterState.step).startsWith('manage')
        && waiterState.step !== 'notes';
      if (!isMobile || !isOrderMode) {
        stage3BaseRenderWaiterMobile();
        return;
      }

      stage3BaseRenderWaiterMobile();
      const root = ensureWaiterMobile();
      if (!waiterState.areaId) waiterState.areaId = selectedArea || snap()?.areas?.[0]?.id || null;
      const body = waiterState.step === 'tables'
        ? renderWaiterTables()
        : waiterState.step === 'note'
          ? renderWaiterNote()
          : waiterState.step === 'preview'
            ? renderWaiterPreview()
            : renderWaiterAreas();
      root.innerHTML = `${waiterStepper()}${body}`;
      bindWaiterInput();
    };
  }

  function decorateDesktopOrder() {
    const body = document.querySelector('#view-order .panel-body');
    const cartRoot = document.getElementById('orderCart');
    if (!body || !cartRoot || typeof selectedTable === 'undefined' || orderType !== 'dine_in') return;
    let panel = document.getElementById('stage3DesktopVisit');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'stage3DesktopVisit';
      cartRoot.before(panel);
    }
    if (!selectedTable) {
      panel.innerHTML = '';
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    const visit = activeVisits(selectedTable)[0] || null;
    panel.innerHTML = `${guestTabsHtml(selectedTable, visit?.id || null, !visit)}${visitHistoryHtml(selectedTable, visit?.id || null, true)}`;
  }

  let scheduled = false;
  function scheduleDesktop() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      decorateDesktopOrder();
    });
  }

  new MutationObserver(scheduleDesktop).observe(document.body, {subtree: true, childList: true});
  document.addEventListener('click', event => {
    if (event.target.closest('[data-table], #orderForTable, [data-view="order"]')) setTimeout(scheduleDesktop, 0);
  });

  setInterval(async () => {
    if (!mobileReady || refreshBusy || waiterState.printing || waiterState.step !== 'note' || !waiterState.tableId) return;
    if (document.activeElement?.id === 'waiterQuickInput' || document.querySelector('.stage3-edit-dialog[open]')) return;
    refreshBusy = true;
    try { await refresh(); }
    catch { }
    finally { refreshBusy = false; }
  }, 4000);

  scheduleDesktop();
})();