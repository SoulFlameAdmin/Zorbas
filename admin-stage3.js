(() => {
  if (window.ZorbasStage3) return;
  window.ZorbasStage3 = true;

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

  function orderTotal(order) {
    return (order?.items || [])
      .filter(item => item.status !== 'cancelled')
      .reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_price || 0), 0);
  }

  function visitTotal(visitId) {
    return visitOrders(visitId).reduce((sum, order) => sum + orderTotal(order), 0);
  }

  function kitchenState(item) {
    if (!item.send_to_kitchen_snapshot) return '<span class="stage3-bar-state">БАР</span>';
    const quantity = Number(item.quantity || 0);
    const delivered = Math.min(quantity, Number(item.delivered_quantity || 0));
    if (delivered >= quantity) return '<span class="stage3-kitchen-state done">КУХНЯ · ИЗДАДЕНО</span>';
    if (delivered > 0) return `<span class="stage3-kitchen-state partial">КУХНЯ · ${delivered}/${quantity}</span>`;
    return `<span class="stage3-kitchen-state">КУХНЯ · 0/${quantity}</span>`;
  }

  function visitHistoryHtml(tableId, compact = false) {
    const table = tableFor(tableId);
    const area = areaFor(table?.area_id);
    const visit = activeVisit(tableId);
    if (!visit) {
      return `<section class="stage3-live-note empty-visit">
        <header><div><small>ТЕКУЩА БЕЛЕЖКА</small><strong>НОВИ ГОСТИ</strong></div><span>${esc(area?.name || '')} · Маса ${esc(table?.table_number || '—')}</span></header>
        <p>Това ще бъде първата бележка за новите гости. След изпращане ще остане запазена тук.</p>
      </section>`;
    }

    const list = visitOrders(visit.id);
    const total = visitTotal(visit.id);
    const pendingKitchen = list.reduce((sum, order) => sum + (order.items || [])
      .filter(item => item.status !== 'cancelled' && item.send_to_kitchen_snapshot)
      .reduce((inner, item) => inner + Math.max(0, Number(item.quantity || 0) - Number(item.delivered_quantity || 0)), 0), 0);

    return `<section class="stage3-live-note ${compact ? 'compact' : ''}" data-stage3-visit="${visit.id}">
      <header>
        <div><small>ТЕКУЩА БЕЛЕЖКА</small><strong>${esc(visit.guest_label)}</strong><span>${esc(area?.name || '')} · Маса ${esc(table?.table_number || '—')}</span></div>
        <button type="button" class="stage3-bill-button" data-stage3-close-bill="${tableId}" ${list.length ? '' : 'disabled'}>
          <small>СМЕТКА</small><b>${Z.money(total)}</b><span>ПРИКЛЮЧИ МАСАТА</span>
        </button>
      </header>
      <div class="stage3-kitchen-overview ${pendingKitchen ? 'waiting' : 'ready'}">
        ${pendingKitchen ? `${pendingKitchen} кухненски бройки още чакат` : 'Кухнята е издадена'}
      </div>
      <div class="stage3-order-history">
        ${list.length ? list.map((order, index) => {
          const kind = order.order_kind === 'addition' || Number(order.visit_sequence || index + 1) > 1 ? 'ДОБАВКА' : 'НОВИ';
          const time = new Date(order.created_at).toLocaleTimeString('bg-BG', {hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Sofia'});
          return `<article class="stage3-order-block ${kind === 'НОВИ' ? 'new' : 'addition'}">
            <header><b>${kind}</b><span>Бележка №${esc(order.order_number)} · ${time}</span></header>
            <div>${(order.items || []).map(item => `
              <p class="${item.status === 'cancelled' ? 'cancelled' : ''}">
                <span><b>${Number(item.quantity || 0)} ×</b> ${esc(item.item_name)}${item.note ? `<small>${esc(item.note)}</small>` : ''}</span>
                ${item.status === 'cancelled' ? '<em>ОТКАЗАНО</em>' : kitchenState(item)}
              </p>`).join('')}</div>
            <footer><span>${esc(order.created_by_name || '')}</span><b>${Z.money(orderTotal(order))}</b></footer>
          </article>`;
        }).join('') : '<p class="stage3-no-orders">Още няма изпратена бележка.</p>'}
      </div>
      <footer class="stage3-visit-total"><span>ОБЩО ЗА ${esc(visit.guest_label).toUpperCase()}</span><strong>${Z.money(total)}</strong></footer>
    </section>`;
  }

  async function closeWithBill(tableId, button) {
    const table = tableFor(tableId);
    const visit = activeVisit(tableId);
    if (!table || !visit) return Z.toast('Няма активни гости на тази маса.', 'error');
    const total = visitTotal(visit.id);
    const confirmed = confirm(`Да отпечатам сметка ${Z.money(total)} и да освободя Маса ${table.table_number}?`);
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
    const baseRenderWaiterPreview = renderWaiterPreview;

    renderWaiterNote = function renderWaiterNoteStage3() {
      const table = tableFor(waiterState.tableId || selectedTable);
      return `
        <div class="waiter-screen-head">
          <button class="waiter-back" data-waiter-action="tables">←</button>
          <div><small>${esc(areaFor(table?.area_id)?.name || '')}</small><h3>Маса ${esc(table?.table_number || '—')}</h3></div>
          <span>${waiterState.cart.reduce((sum, row) => sum + Number(row.quantity || 0), 0)} нови</span>
        </div>
        <section class="waiter-notepad stage3-waiter-notepad">
          <div class="waiter-note-title"><span>БЕЛЕЖКА</span><small>Пази се до сметката</small></div>
          ${visitHistoryHtml(table?.id)}
          <div class="stage3-new-position-title"><span>НОВА ПОЗИЦИЯ</span><small>за същата маса и същите гости</small></div>
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
      const html = baseRenderWaiterPreview();
      return html.replace(
        /<div class="waiter-print-title">[\s\S]*?<div class="waiter-print-grid">[\s\S]*?<\/div>\s*$/,
        `<div class="waiter-print-title">Нова отделна бележка за същите гости</div>
         <div class="waiter-print-grid stage3-one-print">
           <button class="waiter-print both" data-waiter-print="both" ${waiterState.printing ? 'disabled' : ''}>
             <strong>ИЗПРАТИ · БАР + КУХНЯ</strong><span>Храната се отделя автоматично за Print 2</span>
           </button>
         </div>`
      );
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
