(() => {
  if (typeof waiterState === 'undefined' || typeof snapshot === 'undefined' || typeof renderWaiterMobile !== 'function') return;

  waiterState.pendingReservationId = waiterState.pendingReservationId || null;
  const baseRenderWaiterMobile = renderWaiterMobile;
  const mobile = () => window.matchMedia('(max-width:650px)').matches;

  function reservationForTable(tableId) {
    const now = Date.now();
    return (snapshot?.reservations || [])
      .filter(reservation => reservation.table_id === tableId)
      .filter(reservation => ['requested', 'confirmed'].includes(reservation.status))
      .filter(reservation => new Date(reservation.end_at).getTime() > now - 2 * 60 * 60 * 1000)
      .sort((a, b) => new Date(a.start_at) - new Date(b.start_at))[0] || null;
  }

  function reservationById(id) {
    return (snapshot?.reservations || []).find(reservation => reservation.id === id) || null;
  }

  function reservationTime(reservation, includeDate = false) {
    const date = new Date(reservation.start_at);
    const time = date.toLocaleTimeString('bg-BG', {hour:'2-digit', minute:'2-digit', timeZone:'Europe/Sofia'});
    if (!includeDate) return time;
    const day = date.toLocaleDateString('bg-BG', {day:'2-digit', month:'2-digit', timeZone:'Europe/Sofia'});
    return `${day} · ${time}`;
  }

  function isToday(value) {
    const date = new Date(value).toLocaleDateString('sv-SE', {timeZone:'Europe/Sofia'});
    const today = new Date().toLocaleDateString('sv-SE', {timeZone:'Europe/Sofia'});
    return date === today;
  }

  function preorderForReservation(reservation) {
    if (!reservation?.preorder_order_id) return null;
    return (snapshot?.orders || []).find(order => order.id === reservation.preorder_order_id) || null;
  }

  function decorateReservedTables() {
    if (!mobile() || waiterState.mobileMode !== 'order' || waiterState.step !== 'tables') return;
    document.querySelectorAll('[data-waiter-table]').forEach(button => {
      if (button.classList.contains('occupied') || button.classList.contains('blocked')) return;
      const reservation = reservationForTable(button.dataset.waiterTable);
      if (!reservation) return;
      button.classList.add('reserved');
      button.dataset.reservationId = reservation.id;
      const status = button.querySelector('small');
      if (status) status.textContent = `Резервирана · ${reservationTime(reservation, !isToday(reservation.start_at))}`;
      const seats = button.querySelector('span');
      if (seats) seats.textContent = `${reservation.guests} души`;
    });
  }

  function arrivalScreen() {
    const reservation = reservationById(waiterState.pendingReservationId);
    const table = snapshot?.tables?.find(entry => entry.id === reservation?.table_id);
    const area = snapshot?.areas?.find(entry => entry.id === table?.area_id);
    const preorder = preorderForReservation(reservation);
    const food = (preorder?.items || []).map(item => `
      <li><b>${Number(item.quantity || 1)}×</b><span>${Z.esc(item.item_name || 'Артикул')}</span>${item.note ? `<small>${Z.esc(item.note)}</small>` : ''}</li>
    `).join('');

    if (!reservation) {
      return `<div class="waiter-screen-head"><button class="waiter-back" data-reservation-action="back">←</button><div><small>РЕЗЕРВАЦИЯ</small><h3>Не е намерена</h3></div></div>`;
    }

    return `
      <div class="waiter-screen-head">
        <button class="waiter-back" data-reservation-action="back">←</button>
        <div><small>${Z.esc(area?.name || 'Област')}</small><h3>Маса ${Z.esc(table?.table_number || '—')}</h3></div>
        <span class="waiter-reserved-badge">РЕЗЕРВИРАНА</span>
      </div>
      <section class="waiter-arrival-card">
        <header>
          <div><small>ОЧАКВАНИ ГОСТИ</small><h4>${Z.esc(reservation.customer_name)}</h4></div>
          <strong>${reservationTime(reservation, !isToday(reservation.start_at))}</strong>
        </header>
        <div class="waiter-arrival-meta">
          <span>👥 ${Number(reservation.guests || 0)} души</span>
          <span>☎ ${Z.esc(reservation.customer_phone || '')}</span>
        </div>
        ${reservation.note ? `<p class="waiter-arrival-note">${Z.esc(reservation.note)}</p>` : ''}
        <div class="waiter-arrival-food">
          <small>ПРЕДВАРИТЕЛНА ХРАНА</small>
          ${food ? `<ul>${food}</ul>` : '<p>Няма предварително избрана храна.</p>'}
        </div>
        <button class="waiter-arrived-button" data-reservation-action="arrived" data-reservation-id="${reservation.id}">
          <span>✓</span><strong>ТУК</strong><small>Гостите пристигнаха</small>
        </button>
      </section>`;
  }

  renderWaiterMobile = function renderWaiterMobileWithReservations(...args) {
    const result = baseRenderWaiterMobile.apply(this, args);
    if (!mobile()) return result;

    if (waiterState.step === 'reservationArrival') {
      const root = ensureWaiterMobile();
      root.innerHTML = arrivalScreen();
      return result;
    }

    decorateReservedTables();
    return result;
  };
  window.renderWaiterMobile = renderWaiterMobile;

  document.addEventListener('click', async event => {
    const reservedTable = event.target.closest('[data-waiter-table][data-reservation-id]');
    if (reservedTable && waiterState.step === 'tables') {
      event.preventDefault();
      event.stopImmediatePropagation();
      const reservation = reservationById(reservedTable.dataset.reservationId);
      if (!reservation) return;
      waiterState.pendingReservationId = reservation.id;
      waiterState.tableId = reservation.table_id;
      waiterState.areaId = snapshot.tables.find(table => table.id === reservation.table_id)?.area_id || waiterState.areaId;
      selectedTable = waiterState.tableId;
      selectedArea = waiterState.areaId;
      waiterState.step = 'reservationArrival';
      renderWaiterMobile();
      return;
    }

    const actionButton = event.target.closest('[data-reservation-action]');
    if (!actionButton) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    if (actionButton.dataset.reservationAction === 'back') {
      waiterState.pendingReservationId = null;
      waiterState.step = 'tables';
      renderWaiterMobile();
      return;
    }

    if (actionButton.dataset.reservationAction !== 'arrived' || actionButton.disabled) return;
    const reservation = reservationById(actionButton.dataset.reservationId);
    if (!reservation) return;

    actionButton.disabled = true;
    actionButton.querySelector('strong').textContent = 'ЗАПИСВАМ…';
    try {
      const result = await Z.rpc('zorbas_mark_reservation_arrived_v4', {
        p_token: Z.token(),
        p_reservation_id: reservation.id,
        p_route: 'kitchen'
      });
      waiterState.pendingReservationId = null;
      waiterState.mobileMode = 'order';
      waiterState.tableId = reservation.table_id;
      waiterState.areaId = snapshot.tables.find(table => table.id === reservation.table_id)?.area_id || waiterState.areaId;
      selectedTable = waiterState.tableId;
      selectedArea = waiterState.areaId;
      waiterState.step = 'note';
      await refresh();
      Z.toast(result.preorder_sent ? 'Гостите са тук. Храната е изпратена към кухнята.' : 'Гостите са тук. Масата е отбелязана като заета.', 'success');
      renderWaiterMobile();
    } catch (error) {
      actionButton.disabled = false;
      actionButton.querySelector('strong').textContent = 'ТУК';
      Z.toast(error.message, 'error');
    }
  }, true);
})();