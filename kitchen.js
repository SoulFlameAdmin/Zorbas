(() => {
  const Z = window.Zorbas;
  const $ = id => document.getElementById(id);
  let snapshot = null;
  let session = null;
  let stationId = null;
  let filter = 'active';
  let view = 'notes';
  let timer = null;

  async function login(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    $('loginMessage').textContent = 'Влизане…';
    try {
      const data = await Z.rpc('zorbas_staff_login', {
        p_username: form.get('username'),
        p_password: form.get('password'),
        p_display_name: form.get('display_name'),
        p_device_id: Z.deviceId()
      });
      Z.setToken(data.token);
      await start();
    } catch (error) {
      $('loginMessage').textContent = error.message;
    }
  }

  async function start() {
    session = await Z.requireSession();
    if (!session) return;
    $('loginView').classList.add('hidden');
    $('appView').classList.remove('hidden');
    $('sessionName').textContent = `${session.display_name} · свързано със Supabase`;
    await Promise.all([refresh(), loadShift()]);
    clearInterval(timer);
    timer = setInterval(refresh, 5000);
  }

  async function refresh() {
    try {
      snapshot = await Z.rpc('zorbas_staff_snapshot', {p_token: Z.token()});
      if (!stationId) stationId = snapshot.stations?.[0]?.id || null;
      renderStations();
      renderQueue();
      renderReservations();
    } catch (error) {
      Z.toast(error.message, 'error');
    }
  }

  function setView(nextView) {
    view = nextView;
    document.querySelectorAll('[data-kitchen-view]').forEach(button => button.classList.toggle('active', button.dataset.kitchenView === view));
    $('kitchenNotesView').classList.toggle('active', view === 'notes');
    $('kitchenReservationsView').classList.toggle('active', view === 'reservations');
    document.body.classList.toggle('kitchen-reservations-mode', view === 'reservations');
  }

  function renderStations() {
    const nav = $('stationNav');
    nav.innerHTML = (snapshot?.stations || []).map(station => `
      <button class="${station.id === stationId ? 'active' : ''}" data-station="${station.id}">${Z.esc(station.name)}</button>
    `).join('');
    nav.querySelectorAll('[data-station]').forEach(button => {
      button.onclick = () => {
        stationId = button.dataset.station;
        renderStations();
        renderQueue();
      };
    });
    const current = snapshot?.stations?.find(station => station.id === stationId);
    $('stationTitle').textContent = current?.name || 'Кухня';
  }

  function metaText(meta = {}) {
    const labels = [];
    const map = {mode:'Вид', pieces:'Бройки', cheese:'Със сирене', oregano:'Риган', oregano_meat:'Риган месо', oregano_fries:'Риган картофи', sauce:'Сос'};
    const source = meta.options || meta;
    Object.entries(source || {}).forEach(([key, value]) => {
      if (value !== false && value !== '' && value != null) labels.push(`${map[key] || key}: ${value === true ? 'да' : value}`);
    });
    if (meta.mode) labels.unshift(`Вид: ${meta.mode === 'piece' ? 'бройки' : 'порция'}`);
    return labels.join(' · ');
  }

  function activeReservation(order) {
    if (!order?.reservation_id) return null;
    return (snapshot?.reservations || []).find(reservation => reservation.id === order.reservation_id) || null;
  }

  function wasSentToKitchen(order) {
    if (['kitchen', 'both'].includes(order.print_route)) return true;
    return (snapshot?.print_jobs || []).some(job =>
      job.order_id === order.id &&
      job.destination === 'kitchen' &&
      ['order', 'addition', 'pickup'].includes(job.job_type)
    );
  }

  function visibleKitchenOrder(order) {
    if (['cancelled', 'completed', 'returned'].includes(order.status)) return false;
    return wasSentToKitchen(order);
  }

  function renderQueue() {
    if (!snapshot || !stationId) return;
    const groups = [];
    (snapshot.orders || []).forEach(order => {
      if (!visibleKitchenOrder(order)) return;
      const items = (order.items || []).filter(item => {
        if (item.station_id !== stationId) return false;
        if (filter === 'ready') return item.status === 'ready';
        return ['pending', 'sent', 'preparing'].includes(item.status);
      });
      if (items.length) groups.push({...order, stationItems: items});
    });
    groups.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    $('kitchenQueue').innerHTML = groups.length
      ? groups.map(orderCard).join('')
      : '<div class="empty">Няма изпратени бележки за тази станция.</div>';
    document.querySelectorAll('[data-item-status]').forEach(button => {
      button.onclick = () => setItemStatus(button.dataset.itemId, button.dataset.itemStatus);
    });
  }

  function clock(value) {
    if (!value) return '';
    return new Date(value).toLocaleTimeString('bg-BG', {hour:'2-digit', minute:'2-digit', timeZone:'Europe/Sofia'});
  }

  function orderCard(order) {
    const table = snapshot.tables?.find(entry => entry.id === order.table_id);
    const reservation = activeReservation(order);
    const age = Math.max(0, Math.floor((Date.now() - new Date(order.created_at)) / 60000));
    const label = order.order_type === 'pickup'
      ? `ПАКЕТ${order.ready_at ? ` ЗА ${clock(order.ready_at)} ЧАСА` : ''}`
      : `МАСА ${table?.table_number || '—'}`;
    const late = age >= 10 ? 'late' : '';
    const guests = reservation ? `<span class="kitchen-guests">👥 ${Number(reservation.guests || 0)} души</span>` : '';
    return `<article class="order-card ${late}">
      <header>
        <div><strong>${label}</strong><small>Поръчка №${order.order_number} · ${Z.esc(order.created_by_name || '')}</small>${guests}</div>
        <span class="badge">${age} мин.</span>
      </header>
      ${order.note ? `<p class="notice">⚠ ${Z.esc(order.note)}</p>` : ''}
      <div class="order-items">${order.stationItems.map(item => `
        <div class="kitchen-item">
          <div class="qty">${Number(item.quantity)}×</div>
          <div><b>${Z.esc(item.item_name)}</b>${item.note ? `<p>⚠ ${Z.esc(item.note)}</p>` : ''}${metaText(item.item_meta) ? `<small>${Z.esc(metaText(item.item_meta))}</small>` : ''}</div>
          <div class="item-actions">
            ${item.status !== 'preparing' && item.status !== 'ready' ? `<button class="btn" data-item-id="${item.id}" data-item-status="preparing">ЗАПОЧВАМ</button>` : ''}
            ${item.status !== 'ready' ? `<button class="btn green" data-item-id="${item.id}" data-item-status="ready">ГОТОВО</button>` : '<span class="badge ready">ГОТОВО</span>'}
          </div>
        </div>`).join('')}</div>
      <footer><span>${Z.formatDate(order.created_at)}</span>${order.order_type === 'pickup' && order.ready_at ? `<b>За ${clock(order.ready_at)}</b>` : ''}</footer>
    </article>`;
  }

  function reservationStatus(reservation) {
    if (reservation.status === 'seated') return ['ТУК', 'seated'];
    if (reservation.status === 'requested') return ['ЗАЯВКА', 'requested'];
    return ['ОЧАКВА СЕ', 'confirmed'];
  }

  function reservationCard(reservation) {
    const table = snapshot.tables?.find(entry => entry.id === reservation.table_id);
    const area = snapshot.areas?.find(entry => entry.id === table?.area_id);
    const preorder = reservation.preorder_order_id
      ? snapshot.orders?.find(order => order.id === reservation.preorder_order_id)
      : null;
    const [statusText, statusClass] = reservationStatus(reservation);
    const day = new Date(reservation.start_at).toLocaleDateString('bg-BG', {day:'2-digit', month:'2-digit', timeZone:'Europe/Sofia'});
    const food = (preorder?.items || []).map(item => `
      <li><b>${Number(item.quantity || 1)}×</b><span>${Z.esc(item.item_name)}</span>${item.note ? `<small>${Z.esc(item.note)}</small>` : ''}</li>
    `).join('');
    const foodState = !preorder
      ? 'Няма предварително избрана храна.'
      : preorder.status === 'open'
        ? 'Храната чака пристигането на гостите.'
        : 'Храната е изпратена към кухнята.';

    return `<article class="kitchen-reservation-card ${statusClass}">
      <header>
        <div><small>${Z.esc(area?.name || 'Област')}</small><strong>МАСА ${Z.esc(table?.table_number || '—')}</strong></div>
        <span class="reservation-status ${statusClass}">${statusText}</span>
      </header>
      <div class="reservation-time"><b>${day}</b><strong>${clock(reservation.start_at)}</strong><span>👥 ${Number(reservation.guests || 0)} души</span></div>
      <div class="reservation-person"><b>${Z.esc(reservation.customer_name)}</b><span>${Z.esc(reservation.customer_phone)}</span></div>
      ${reservation.note ? `<p class="reservation-note">${Z.esc(reservation.note)}</p>` : ''}
      <section class="reservation-food"><small>КАКВО ЩЕ ЯДАТ</small>${food ? `<ul>${food}</ul>` : `<p>${foodState}</p>`}${food ? `<p class="food-state">${foodState}</p>` : ''}</section>
    </article>`;
  }

  function renderReservations() {
    if (!snapshot) return;
    const reservations = (snapshot.reservations || [])
      .filter(reservation => ['requested', 'confirmed', 'seated'].includes(reservation.status))
      .sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
    $('kitchenReservations').innerHTML = reservations.length
      ? reservations.map(reservationCard).join('')
      : '<div class="empty">Няма предстоящи резервации.</div>';
  }

  async function setItemStatus(id, status) {
    try {
      await Z.rpc('zorbas_set_item_status_v3', {p_token: Z.token(), p_item_id: id, p_status: status});
      await refresh();
    } catch (error) {
      Z.toast(error.message, 'error');
    }
  }

  async function loadShift() {
    try {
      const shift = await Z.rpc('zorbas_shift_status_v3', {p_token: Z.token()});
      renderShift(shift);
    } catch (error) {
      Z.toast(error.message, 'error');
    }
  }

  function renderShift(shift) {
    const active = !!shift?.id;
    $('shiftText').textContent = active ? `🟢 На работа от ${Z.formatDate(shift.started_at)}` : '⚪ Извън работа';
    $('shiftButton').textContent = active ? 'Приключвам смяна' : 'Започвам смяна';
    $('shiftButton').className = `btn ${active ? 'red' : 'green'} full`;
    $('shiftButton').dataset.active = active ? '1' : '0';
  }

  async function toggleShift() {
    const startShift = $('shiftButton').dataset.active !== '1';
    try {
      await Z.rpc('zorbas_toggle_shift_v3', {p_token: Z.token(), p_start: startShift});
      await loadShift();
    } catch (error) {
      Z.toast(error.message, 'error');
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    Z.registerPwa();
    $('loginForm').onsubmit = login;
    $('logoutButton').onclick = Z.logout;
    $('refreshButton').onclick = refresh;
    $('refreshReservationsButton').onclick = refresh;
    $('shiftButton').onclick = toggleShift;
    document.querySelectorAll('[data-filter]').forEach(button => {
      button.onclick = () => {
        filter = button.dataset.filter;
        document.querySelectorAll('[data-filter]').forEach(entry => entry.classList.toggle('active', entry === button));
        renderQueue();
      };
    });
    document.querySelectorAll('[data-kitchen-view]').forEach(button => button.onclick = () => setView(button.dataset.kitchenView));
    document.querySelectorAll('[data-install-pwa]').forEach(button => button.onclick = Z.installPwa);
    setView('notes');
    start().catch(() => {});
  });
})();