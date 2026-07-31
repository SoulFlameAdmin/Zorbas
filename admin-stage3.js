(() => {
  if (window.ZorbasStage3V2) return;
  window.ZorbasStage3V2 = true;

  const mobileReady = typeof waiterState !== 'undefined' && typeof renderWaiterNote === 'function';
  const esc = value => Z.esc(value == null ? '' : String(value));
  const snap = () => (typeof snapshot !== 'undefined' ? snapshot : null);
  const tables = () => snap()?.tables || [];
  const areas = () => snap()?.areas || [];
  const visits = () => snap()?.visits || [];
  const orders = () => snap()?.orders || [];

  function tableFor(id) {
    return tables().find(table => table.id === id) || null;
  }

  function areaFor(id) {
    return areas().find(area => area.id === id) || null;
  }

  function activeVisit(tableId) {
    return visits().find(visit => visit.table_id === tableId && visit.status === 'active') || null;
  }

  function visitOrders(visitId) {
    return orders()
      .filter(order => order.visit_id === visitId && !['cancelled', 'returned'].includes(order.status))
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }

  function activeTableVisit(tableId) {
    const visit = activeVisit(tableId);
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
    if (delivered > 0) return `<span class="stage3-kitchen-state partial">КУХНЯ · ${delivered}/${quantity}</span>`;
    return `<span class="stage3-kitchen-state">КУХНЯ · 0/${quantity}</span>`;
  }

  function openedTime(visit) {
    if (!visit?.opened_at) return '';
    return new Date(visit.opened_at).toLocaleTimeString('bg-BG', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Sofia'
    });
  }

  function visitHistoryHtml(tableId, compact = false) {
    const table = tableFor(tableId);
    const area = areaFor(table?.area_id);
    const state = activeTableVisit(tableId);
    const visit = state.visit;

    if (!visit) {
      return `<section class="stage3-live-note empty-visit">
        <header>
          <div><small>ТЕКУЩА БЕЛЕЖКА</small><strong>НОВИ ГОСТИ</strong><span>${esc(area?.name || '')} · Маса ${esc(table?.table_number || '—')}</span></div>
        </header>
        <p>Още няма изпратена поръчка. Първото писане отдолу ще създаде нови гости и ще остане запазено в тази маса.</p>
      </section>`;
    }

    const canClose = state.orders.length > 0 && state.pendingKitchen <= 0;
    const billLabel = state.pendingKitchen > 0 ? `ЧАКА КУХНЯ · ${state.pendingKitchen}` : 'ПРИКЛЮЧИ МАСАТА';

    return `<section class="stage3-live-note ${compact ? 'compact' : ''}" data-stage3-visit="${visit.id}">
      <header>
        <div>
          <small>ТЕКУЩА БЕЛЕЖКА</small>
          <strong>${esc(visit.guest_label)}</strong>
          <span>${esc(area?.name || '')} · Маса ${esc(table?.table_number || '—')} · от ${openedTime(visit)}</span>
        </div>
        <button type="button" class="stage3-bill-button" data-stage3-close-bill="${tableId}" ${canClose ? '' : 'disabled'}>
          <small>СМЕТКА</small><b>${Z.money(state.total)}</b><span>${billLabel}</span>
        </button>
      </header>

      <div class="stage3-visit-summary">
        <span><b>${state.orders.length}</b> отделни бележки</span>
        <span><b>${state.itemCount}</b> позиции</span>
        <span class="${state.pendingKitchen ? 'waiting' : 'ready'}">${state.pendingKitchen ? `${state.pendingKitchen} чакат кухня` : 'Кухнята е издадена'}</span>
      </div>

      <div class="stage3-order-history">
        ${state.orders.map((order, index) => {
          const kind = order.order_kind === 'addition' || Number(order.visit_sequence || index + 1) > 1 ? 'ДОБАВКА' : 'НОВИ';
          const time = new Date(order.created_at).toLocaleTimeString('bg-BG', {
            hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Sofia'
          });
          return `<article class="stage3-order-block ${kind === 'НОВИ' ? 'new' : 'addition'}">
            <header>
              <b>${kind}</b>
              <span>Бележка №${esc(order.order_number)} · ${time}</span>
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
        }).join('')}
      </div>

      <footer class="stage3-visit-total">
        <span>ОБЩО ЗА ${esc(visit.guest_label).toUpperCase()}</span>
        <strong>${Z.money(state.total)}</strong>
      </footer>
    </section>`;
  }

  async function closeWithBill(tableId, button) {
    const table = tableFor(tableId);
    const state = activeTableVisit(tableId);
    if (!table || !state.visit) return Z.toast('Няма активни гости на тази маса.', 'error');
    if (state.pendingKitchen > 0) return Z.toast(`Още ${state.pendingKitchen} кухненски бройки не са издадени.`, 'error');
    if (!state.orders.length) return Z.toast('Няма поръчки за сметка.', 'error');

    const confirmed = confirm(`Да отпечатам сметка ${Z.money(state.total)} и да освободя Маса ${table.table_number}?`);
    if (!confirmed) return;

    button.disabled = true;
    const old = button.innerHTML;
    button.innerHTML = '<b>ИЗПРАЩА СЕ…</b>';
    try {
      const result = await Z.rpc('zorbas_print_and_close_visit_v1', {
        p_token: Z.token(),
        p_table_id: tableId
      });
      Z.toast(`Сметката ${Z.money(result.subtotal)} е изпратена. Маса ${table.table_number} е свободна.`, 'success');

      if (typeof waiterState !== 'undefined') {
        waiterState.cart = [];
        waiterState.query = '';
        waiterState.tableId = null;
        waiterState.step = 'tables';
      }
      if (typeof cart !== 'undefined') cart = [];
      if (typeof selectedTable !== 'undefined') selectedTable = null;

      await refresh();
      if (typeof renderWaiterMobile === 'function') renderWaiterMobile();
      if (typeof renderMap === 'function') renderMap();
    } catch (error) {
      Z.toast(error.message, 'error');
      button.disabled = false;
      button.innerHTML = old;
    }
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-stage3-close-bill]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    closeWithBill(button.dataset.stage3CloseBill, button);
  }, true);

  if (mobileReady) {
    const baseRenderWaiterTables = renderWaiterTables;

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
            const live = activeTableVisit(table.id);
            const label = stateName === 'occupied' ? 'Заета' : stateName === 'blocked' ? 'Блокирана' : 'Свободна';
            return `<button class="waiter-table-card ${stateName}" data-waiter-table="${table.id}" ${stateName === 'blocked' ? 'disabled' : ''}>
              <small>${label}</small>
              <strong>${esc(table.table_number)}</strong>
              ${live.visit
                ? `<span>${esc(live.visit.guest_label)} · ${Z.money(live.total)}</span><em>${live.pendingKitchen ? `${live.pendingKitchen} чакат кухня` : 'готова за сметка'}</em>`
                : `<span>${Number(table.seats || 0)} места</span><em>нова бележка</em>`}
            </button>`;
          }).join('') || '<p class="empty">Няма маси в тази област.</p>'}
        </div>`;
    };

    renderWaiterNote = function renderWaiterNoteStage3() {
      const table = tableFor(waiterState.tableId || selectedTable);
      const active = activeTableVisit(table?.id);
      return `
        <div class="waiter-screen-head">
          <button class="waiter-back" data-waiter-action="tables">←</button>
          <div><small>${esc(areaFor(table?.area_id)?.name || '')}</small><h3>Маса ${esc(table?.table_number || '—')}</h3></div>
          <span>${active.visit ? esc(active.visit.guest_label) : 'Нови гости'}</span>
        </div>

        <section class="waiter-notepad stage3-waiter-notepad">
          <div class="waiter-note-title"><span>БЕЛЕЖКА</span><small>Пази се до сметката</small></div>
          ${visitHistoryHtml(table?.id)}

          <div class="stage3-new-position-title">
            <span>НОВА ПОЗИЦИЯ</span>
            <small>${active.visit ? `за ${esc(active.visit.guest_label)}` : 'първа поръчка'}</small>
          </div>
          <div class="waiter-lines stage3-current-cart">${waiterCartRows()}</div>
          <label class="waiter-composer">
            <span>Нова позиция</span>
            <input id="waiterQuickInput" value="${esc(waiterState.query)}" autocomplete="off" autocapitalize="sentences" spellcheck="false" placeholder="Започни да пишеш…">
          </label>
          <div id="waiterSuggestionBox"></div>
        </section>

        <button class="waiter-main-action" data-waiter-action="preview" ${waiterState.cart.length ? '' : 'disabled'}>
          ПРЕГЛЕД НА НОВАТА БЕЛЕЖКА <span>→</span>
        </button>`;
    };

    renderWaiterPreview = function renderWaiterPreviewStage3() {
      const table = tableFor(waiterState.tableId || selectedTable);
      const active = activeTableVisit(table?.id);
      const rows = waiterState.cart.map(row => {
        const item = snap()?.items?.find(entry => entry.id === row.menu_item_id);
        const total = Number(item?.price || 0) * Number(row.quantity || 0);
        return `<div class="waiter-receipt-row"><span>${row.quantity} × ${esc(item?.name || 'Артикул')}</span><b>${item?.price_pending ? '—' : Z.money(total)}</b></div>`;
      }).join('');
      const nextKind = active.visit ? 'ДОБАВКА' : 'НОВИ';

      return `
        <div class="waiter-screen-head">
          <button class="waiter-back" data-waiter-action="note">←</button>
          <div><small>${nextKind}</small><h3>Преглед на бележката</h3></div>
          <span>${waiterState.cart.reduce((sum, row) => sum + Number(row.quantity || 0), 0)} позиции</span>
        </div>
        <article class="waiter-receipt">
          <header><small>${nextKind}</small><h2>ZORBAS</h2><p>${esc(areaFor(table?.area_id)?.name || '')} · Маса ${esc(table?.table_number || '—')}</p>${active.visit ? `<b>${esc(active.visit.guest_label)}</b>` : '<b>НОВИ ГОСТИ · СЛОЖИ ХЛЯБ</b>'}</header>
          <div class="waiter-receipt-meta"><span>${esc(document.getElementById('sessionName')?.textContent?.split(' · ')[0] || 'Сервитьор')}</span><span>${new Date().toLocaleTimeString('bg-BG',{hour:'2-digit',minute:'2-digit'})}</span></div>
          <div class="waiter-receipt-items">${rows}</div>
          <footer><span>Общо ново</span><strong>${Z.money(waiterCartTotal())}</strong></footer>
        </article>
        <div class="waiter-print-title">Всяко писане излиза като отделна бележка</div>
        <div class="waiter-print-grid stage3-one-print">
          <button class="waiter-print both" data-waiter-print="both" ${waiterState.printing ? 'disabled' : ''}>
            <strong>ИЗПРАТИ · БАР + КУХНЯ</strong>
            <span>Print 1 получава всичко · Print 2 само кухнята</span>
          </button>
        </div>`;
    };

    printWaiterOrder = async function printWaiterOrderStage3() {
      if (waiterState.printing || !waiterState.cart.length || !waiterState.tableId) return;
      waiterState.printing = true;
      renderWaiterMobile();
      const tableId = waiterState.tableId;
      try {
        const result = await Z.rpc('zorbas_create_order_v3', {
          p_token: Z.token(),
          p_table_id: tableId,
          p_order_type: 'dine_in',
          p_customer_name: null,
          p_customer_phone: null,
          p_ready_at: null,
          p_note: null,
          p_items: waiterState.cart,
          p_route: 'both'
        });
        Z.toast(`${result.order_kind === 'addition' ? 'Добавката' : 'Новата бележка'} ${result.code} е изпратена.`, 'success');
        waiterState.cart = [];
        waiterState.query = '';
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
    panel.innerHTML = visitHistoryHtml(selectedTable, true);
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
  scheduleDesktop();
})();
