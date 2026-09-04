/* ZORBAS · stable waiter phone
   A single renderer and one event boundary. It intentionally does not boot admin.html
   or the historical waiter override chain. */
(() => {
  'use strict';

  const Z = window.Zorbas;
  if (!Z) return;

  const STORAGE_KEY = 'zorbas_waiter_stable_state_v1';
  const state = {
    session: null, snapshot: null, screen: 'areas', areaId: null, tableId: null, visitId: null,
    newGuest: false, query: '', categoryId: 'all', route: 'both', cart: [], orderNote: '',
    menuOpen: false, refreshing: false, refreshAgain: false, submitting: false, online: navigator.onLine !== false
  };
  const $ = id => document.getElementById(id);
  const esc = value => Z.esc(value);
  const money = value => Z.money(value);
  const text = value => String(value ?? '');

  function loadSavedState() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
      if (saved.screen) state.screen = saved.screen;
      if (saved.areaId) state.areaId = saved.areaId;
      if (saved.tableId) state.tableId = saved.tableId;
      if (saved.visitId) state.visitId = saved.visitId;
      state.newGuest = Boolean(saved.newGuest);
      state.route = ['both', 'kitchen', 'staff'].includes(saved.route) ? saved.route : 'both';
      state.orderNote = text(saved.orderNote).slice(0, 500);
      state.cart = Array.isArray(saved.cart) ? saved.cart.map(row => ({
        menu_item_id: row.menu_item_id, quantity: Math.max(1, Number(row.quantity || 1)), note: text(row.note).slice(0, 160),
        meta: row.meta || {mode: 'portion', options: {}}
      })) : [];
    } catch {}
  }
  function saveState() {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({screen: state.screen, areaId: state.areaId, tableId: state.tableId, visitId: state.visitId, newGuest: state.newGuest, route: state.route, orderNote: state.orderNote, cart: state.cart})); } catch {}
  }
  function clearOrder() { state.cart = []; state.orderNote = ''; state.query = ''; state.categoryId = 'all'; state.visitId = null; state.newGuest = false; saveState(); }
  function setAlert(message = '', type = '') {
    const root = $('waiterStableAlert'); if (!root) return;
    root.textContent = message; root.className = `ws-alert ${type}`.trim(); root.classList.toggle('ws-hidden', !message);
  }
  function activeOrders() { return (state.snapshot?.orders || []).filter(order => !['completed', 'cancelled', 'returned'].includes(order.status)); }
  function tableFor(id) { return (state.snapshot?.tables || []).find(table => String(table.id) === String(id)) || null; }
  function areaFor(id) { return (state.snapshot?.areas || []).find(area => String(area.id) === String(id)) || null; }
  function items() { return (state.snapshot?.items || []).filter(item => item.active !== false); }
  function categories() { return state.snapshot?.categories || []; }
  function visitsForTable(tableId) {
    const visits = (state.snapshot?.visits || []).filter(visit => String(visit.table_id) === String(tableId) && visit.status === 'active');
    if (visits.length) return visits;
    const seen = new Set();
    return activeOrders().filter(order => String(order.table_id) === String(tableId) && order.visit_id).map(order => ({id: order.visit_id, table_id: order.table_id, guest_label: order.guest_label || 'Активни гости'})).filter(visit => { if (seen.has(visit.id)) return false; seen.add(visit.id); return true; });
  }
  function reservationForTable(tableId) {
    const now = Date.now();
    return (state.snapshot?.reservations || []).filter(reservation => String(reservation.table_id) === String(tableId)).filter(reservation => ['requested', 'confirmed'].includes(reservation.status)).filter(reservation => !reservation.end_at || new Date(reservation.end_at).getTime() > now - 2 * 60 * 60 * 1000).sort((a, b) => new Date(a.start_at) - new Date(b.start_at))[0] || null;
  }
  function tableStatus(table) {
    if (table.status === 'blocked') return 'blocked';
    if (activeOrders().some(order => String(order.table_id) === String(table.id))) return 'occupied';
    if (table.status === 'occupied') return 'occupied';
    if (reservationForTable(table.id)) return 'reserved';
    return 'free';
  }
  function statusLabel(status) { return ({open: 'чака', sent: 'изпратена', preparing: 'приготвя се', ready: 'готова', served: 'сервирана', completed: 'приключена', cancelled: 'отказана'})[status] || status || '—'; }
  function guestLabel(visit, index = 0) { return visit?.guest_label || `${index + 1}-ви гости`; }
  function selectedVisit() { if (state.newGuest) return null; const visits = visitsForTable(state.tableId); return visits.find(visit => String(visit.id) === String(state.visitId)) || visits[0] || null; }
  function cartQuantity() { return state.cart.reduce((sum, row) => sum + Number(row.quantity || 0), 0); }
  function cartTotal() { return state.cart.reduce((sum, row) => { const item = items().find(entry => String(entry.id) === String(row.menu_item_id)); return sum + Number(item?.price || 0) * Number(row.quantity || 0); }, 0); }

  function renderLogin() { $('waiterLoginView')?.classList.remove('ws-hidden'); $('waiterStableShell')?.classList.add('ws-hidden'); }
  function renderShell() {
    $('waiterLoginView')?.classList.add('ws-hidden'); $('waiterStableShell')?.classList.remove('ws-hidden');
    $('waiterStableSession').textContent = state.session?.display_name || state.session?.username || 'Сервитьор';
    $('waiterStableStatusDot').classList.toggle('offline', !state.online);
    $('waiterStableMenu')?.classList.toggle('open', state.menuOpen);
    $('waiterStableBackdrop')?.classList.toggle('ws-hidden', !state.menuOpen);
    $('waiterStableBackdrop')?.setAttribute('aria-hidden', String(!state.menuOpen));
    renderContent();
  }
  function titleForScreen() { return ({areas: 'Избери област', tables: 'Избери маса', order: 'Нова бележка', notes: 'Бележки', reservations: 'Резервации'})[state.screen] || 'Сервитьори'; }
  function renderContent() {
    const table = tableFor(state.tableId);
    $('waiterStableTitle').textContent = titleForScreen();
    $('waiterStableSubtitle').textContent = table ? `${areaFor(table.area_id)?.name || ''} · Маса ${table.table_number}` : 'Бързо управление от телефона';
    $('waiterStableContent').innerHTML = screenMarkup();
    bindContent();
  }
  function screenMarkup() {
    if (!state.snapshot) return '<div class="ws-empty">Зареждане на масите…</div>';
    if (state.screen === 'tables') return tablesMarkup();
    if (state.screen === 'order') return orderMarkup();
    if (state.screen === 'notes') return notesMarkup();
    if (state.screen === 'reservations') return reservationsMarkup();
    return areasMarkup();
  }
  function areasMarkup() {
    const areas = state.snapshot.areas || [];
    return `<div class="ws-view-head"><div><h2>Нова бележка</h2><p>Първо избери залата. После натисни масата.</p></div></div><div class="ws-grid ws-area-grid">${areas.map(area => { const tables = (state.snapshot.tables || []).filter(table => String(table.area_id) === String(area.id)); const occupied = tables.filter(table => ['occupied', 'reserved'].includes(tableStatus(table))).length; return `<button class="ws-card" data-area-id="${esc(area.id)}"><strong>${esc(area.name)}</strong><small>${tables.length} маси · ${occupied} заети/резервирани</small><i>→</i></button>`; }).join('') || '<div class="ws-empty">Няма въведени области.</div>'}</div>`;
  }
  function tablesMarkup() {
    const area = areaFor(state.areaId); const tables = (state.snapshot.tables || []).filter(table => String(table.area_id) === String(state.areaId));
    return `<div class="ws-view-head"><button class="ws-back" data-screen="areas">← Назад</button><div><h2>${esc(area?.name || 'Маси')}</h2><p>Натисни маса, за да отвориш бележката.</p></div></div><div class="ws-grid ws-table-grid">${tables.map(table => { const status = tableStatus(table); const labels = {free: 'Свободна', occupied: 'Заета', reserved: 'Резервирана', blocked: 'Блокирана'}; const reservation = reservationForTable(table.id); const reservationText = reservation ? ` · ${Z.formatDate(reservation.start_at)}` : ''; return `<button class="ws-card ws-table-card ${status}" data-table-id="${esc(table.id)}" ${status === 'blocked' ? 'disabled' : ''}><small>МАСА</small><strong>${esc(table.table_number)}</strong><span class="ws-status">${labels[status]}${reservationText}</span><span>${Number(table.seats || 0)} места</span></button>`; }).join('') || '<div class="ws-empty">Няма маси в тази област.</div>'}</div>`;
  }
  function guestBarMarkup() {
    const visits = visitsForTable(state.tableId);
    if (!visits.length) return '<div class="ws-alert success">Няма активни гости. Тази бележка ще отвори нова група.</div>';
    const buttons = visits.map((visit, index) => `<button class="ws-guest ${!state.newGuest && String(state.visitId) === String(visit.id) ? 'active' : ''}" data-visit-id="${esc(visit.id)}">${esc(guestLabel(visit, index))}</button>`).join('');
    return `<div class="ws-section"><div class="ws-section-head"><strong>Гости на масата</strong><small>Избери към кого е бележката</small></div><div class="ws-guest-bar">${buttons}<button class="ws-guest new ${state.newGuest ? 'active' : ''}" data-new-guest="1">＋ Нови гости</button></div></div>`;
  }
  function productMarkup() {
    const query = state.query.trim().toLocaleLowerCase('bg-BG');
    const filtered = items().filter(item => (state.categoryId === 'all' || String(item.category_id) === String(state.categoryId)) && (!query || `${item.name} ${item.description || ''}`.toLocaleLowerCase('bg-BG').includes(query)));
    if (!filtered.length) return '<div class="ws-empty">Няма намерени продукти.</div>';
    return filtered.map(item => { const unavailable = Boolean(item.price_pending) || Number(item.price || 0) <= 0; return `<button class="ws-product" data-add-item="${esc(item.id)}" ${unavailable ? 'disabled' : ''}><span class="ws-product-main"><strong>${esc(item.name)}</strong><small>${esc(item.description || (unavailable ? 'Цената още не е потвърдена' : 'Добави към бележката'))}</small></span><span class="ws-product-price">${unavailable ? '—' : money(item.price)}</span><span class="ws-product-add">＋</span></button>`; }).join('');
  }
  function cartMarkup() {
    if (!state.cart.length) return '<div class="ws-empty">Бележката е празна. Избери продукт по-горе.</div>';
    return state.cart.map((row, index) => { const item = items().find(entry => String(entry.id) === String(row.menu_item_id)); return `<div class="ws-cart-row"><div class="ws-qty"><button data-cart-action="minus" data-cart-index="${index}">−</button><b>${Number(row.quantity)}</b><button data-cart-action="plus" data-cart-index="${index}">＋</button></div><span class="ws-cart-name">${esc(item?.name || 'Артикул')}</span><span class="ws-cart-price">${money(Number(item?.price || 0) * Number(row.quantity || 0))}</span><input class="ws-cart-note" data-cart-note="${index}" value="${esc(row.note || '')}" placeholder="Уточнение за този продукт…"></div>`; }).join('');
  }
  function orderMarkup() {
    const table = tableFor(state.tableId);
    return `<div class="ws-view-head"><button class="ws-back" data-screen="tables">← Маси</button><div><h2>Маса ${esc(table?.table_number || '—')}</h2><p>Добавяй спокойно — написаното остава при обновяване.</p></div></div>${guestBarMarkup()}<div class="ws-section"><div class="ws-toolbar"><input class="ws-search" id="stableProductSearch" value="${esc(state.query)}" placeholder="Търси продукт…" autocomplete="off"><button class="ws-secondary" data-clear-search="1">Изчисти</button></div><div class="ws-chips"><button class="ws-chip ${state.categoryId === 'all' ? 'active' : ''}" data-category-id="all">Всички</button>${categories().map(category => `<button class="ws-chip ${String(state.categoryId) === String(category.id) ? 'active' : ''}" data-category-id="${esc(category.id)}">${esc(category.name)}</button>`).join('')}</div><div class="ws-products">${productMarkup()}</div></div><div class="ws-section"><div class="ws-section-head"><strong>Бележка</strong><small>${cartQuantity()} позиции</small></div><div class="ws-cart">${cartMarkup()}</div><label class="ws-field"><span>Обща бележка</span><textarea id="stableOrderNote" rows="2" placeholder="Например: без лук, алергия, разделено…">${esc(state.orderNote)}</textarea></label><div class="ws-total"><span>Общо</span><strong>${money(cartTotal())}</strong></div><div class="ws-route-grid"><button class="ws-route ${state.route === 'both' ? 'active' : ''}" data-route="both">БАР + КУХНЯ</button><button class="ws-route ${state.route === 'kitchen' ? 'active' : ''}" data-route="kitchen">САМО КУХНЯ</button><button class="ws-route ${state.route === 'staff' ? 'active' : ''}" data-route="staff">САМО БАР</button></div><button class="ws-primary ws-full" data-submit-order="1" ${!state.cart.length || state.submitting ? 'disabled' : ''}>${state.submitting ? 'ИЗПРАЩА СЕ…' : 'ИЗПРАТИ БЕЛЕЖКАТА'}</button></div>`;
  }
  function notesMarkup() {
    const orders = [...(state.snapshot.orders || [])].filter(order => order.status !== 'completed').sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return `<div class="ws-view-head"><div><h2>Бележки</h2><p>Последните активни поръчки в ресторанта.</p></div></div><div class="ws-note-list">${orders.map(order => { const table = tableFor(order.table_id); return `<article class="ws-note-card"><div class="ws-note-head"><div><strong>${order.order_type === 'pickup' ? 'ПАКЕТ' : `Маса ${esc(table?.table_number || '—')}`}</strong><small>№${esc(order.order_number || '—')} · ${esc(order.created_by_name || '')}</small></div><span class="ws-badge">${esc(statusLabel(order.status))}</span></div><ul class="ws-note-items">${(order.items || []).map(item => `<li><b>${Number(item.quantity || 0)}×</b><span>${esc(item.item_name || 'Артикул')}${item.note ? ` — ${esc(item.note)}` : ''}</span></li>`).join('')}</ul><button class="ws-secondary ws-full" data-open-manager="1">Отвори пълното управление</button></article>`; }).join('') || '<div class="ws-empty">Няма активни бележки.</div>'}</div>`;
  }
  function reservationsMarkup() {
    const reservations = (state.snapshot.reservations || []).filter(reservation => ['requested', 'confirmed'].includes(reservation.status)).sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
    return `<div class="ws-view-head"><div><h2>Резервации</h2><p>Когато гостите дойдат, натисни „Тук“.</p></div></div><div class="ws-reservation-list">${reservations.map(reservation => { const table = tableFor(reservation.table_id); return `<article class="ws-reservation-card"><div class="ws-reservation-head"><div><strong>${esc(reservation.customer_name || 'Гости')}</strong><small>${reservation.start_at ? esc(Z.formatDate(reservation.start_at)) : 'Без час'}</small></div><span class="ws-badge">${esc(reservation.status === 'confirmed' ? 'потвърдена' : 'заявка')}</span></div><div class="ws-reservation-meta"><span>Маса ${esc(table?.table_number || '—')} · ${Number(reservation.guests || 0)} души</span><span>${esc(reservation.customer_phone || '')}</span>${reservation.note ? `<span>${esc(reservation.note)}</span>` : ''}</div><button class="ws-primary" data-arrived-reservation="${esc(reservation.id)}">✓ ТУК — гостите пристигнаха</button></article>`; }).join('') || '<div class="ws-empty">Няма предстоящи резервации.</div>'}</div>`;
  }

  function bindContent() {
    const root = $('waiterStableContent');
    root.querySelectorAll('[data-area-id]').forEach(button => button.onclick = () => { state.areaId = button.dataset.areaId; state.screen = 'tables'; saveState(); renderContent(); });
    root.querySelectorAll('[data-table-id]').forEach(button => button.onclick = () => { state.tableId = button.dataset.tableId; state.areaId = tableFor(state.tableId)?.area_id || state.areaId; const visits = visitsForTable(state.tableId); state.visitId = visits[0]?.id || null; state.newGuest = !state.visitId; state.screen = 'order'; saveState(); renderContent(); setTimeout(() => $('stableProductSearch')?.focus({preventScroll: true}), 30); });
    root.querySelectorAll('[data-screen]').forEach(button => button.onclick = () => { state.screen = button.dataset.screen; if (state.screen === 'areas') state.areaId = null; saveState(); renderContent(); });
    root.querySelectorAll('[data-visit-id]').forEach(button => button.onclick = () => { state.visitId = button.dataset.visitId; state.newGuest = false; saveState(); renderContent(); });
    root.querySelectorAll('[data-new-guest]').forEach(button => button.onclick = () => { state.visitId = null; state.newGuest = true; saveState(); renderContent(); });
    root.querySelectorAll('[data-category-id]').forEach(button => button.onclick = () => { state.categoryId = button.dataset.categoryId; renderContent(); });
    const search = $('stableProductSearch');
    if (search) search.oninput = () => { state.query = search.value; const products = document.querySelector('.ws-products'); if (products) products.innerHTML = productMarkup(); bindProductButtons(); };
    root.querySelector('[data-clear-search]')?.addEventListener('click', () => { state.query = ''; renderContent(); $('stableProductSearch')?.focus({preventScroll: true}); });
    bindProductButtons();
    root.querySelectorAll('[data-cart-action]').forEach(button => button.onclick = () => { const index = Number(button.dataset.cartIndex); const row = state.cart[index]; if (!row) return; row.quantity += button.dataset.cartAction === 'plus' ? 1 : -1; if (row.quantity <= 0) state.cart.splice(index, 1); saveState(); renderContent(); });
    root.querySelectorAll('[data-cart-note]').forEach(input => input.oninput = () => { const row = state.cart[Number(input.dataset.cartNote)]; if (row) { row.note = input.value.slice(0, 160); saveState(); } });
    root.querySelector('#stableOrderNote')?.addEventListener('input', event => { state.orderNote = event.target.value.slice(0, 500); saveState(); });
    root.querySelectorAll('[data-route]').forEach(button => button.onclick = () => { state.route = button.dataset.route; saveState(); renderContent(); });
    root.querySelector('[data-submit-order]')?.addEventListener('click', submitOrder);
    root.querySelectorAll('[data-open-manager]').forEach(button => button.onclick = () => { location.href = '/admin.html?view=manager'; });
    root.querySelectorAll('[data-arrived-reservation]').forEach(button => button.onclick = () => markReservationArrived(button.dataset.arrivedReservation, button));
  }
  function bindProductButtons() { document.querySelectorAll('[data-add-item]').forEach(button => button.onclick = () => addItem(button.dataset.addItem)); }
  function addItem(itemId) { const item = items().find(entry => String(entry.id) === String(itemId)); if (!item || item.price_pending || Number(item.price || 0) <= 0) return; const row = state.cart.find(entry => String(entry.menu_item_id) === String(item.id)); if (row) row.quantity += 1; else state.cart.push({menu_item_id: item.id, quantity: 1, note: '', meta: {mode: item.quantity_mode === 'piece' ? 'piece' : 'portion', options: {}}}); state.query = ''; saveState(); renderContent(); setTimeout(() => $('stableProductSearch')?.focus({preventScroll: true}), 20); }
  async function submitOrder() {
    if (state.submitting || !state.cart.length || !state.tableId) return;
    const invalid = state.cart.some(row => { const item = items().find(entry => String(entry.id) === String(row.menu_item_id)); return !item || item.price_pending || Number(item.price || 0) <= 0; });
    if (invalid) return setAlert('Има продукт без потвърдена цена.', 'error');
    state.submitting = true; renderContent();
    try {
      const visit = selectedVisit();
      const result = await Z.rpc('zorbas_create_order_v4', {p_token: Z.token(), p_table_id: state.tableId, p_visit_id: visit?.id || null, p_open_new_guest: !visit, p_order_type: 'dine_in', p_customer_name: null, p_customer_phone: null, p_ready_at: null, p_note: state.orderNote || null, p_items: state.cart, p_route: state.route});
      clearOrder(); state.screen = 'order'; state.submitting = false; await refresh({render: false}); renderShell(); setAlert(`Бележка ${result?.code || ''} е изпратена. Можеш да добавиш следваща.`, 'success');
    } catch (error) { state.submitting = false; renderContent(); setAlert(error.message || 'Бележката не беше изпратена.', 'error'); }
  }
  async function markReservationArrived(id, button) {
    if (!id || button.disabled) return; button.disabled = true; const old = button.textContent; button.textContent = 'ЗАПИСВА СЕ…';
    try { await Z.rpc('zorbas_mark_reservation_arrived_v4', {p_token: Z.token(), p_reservation_id: id, p_route: 'kitchen'}); await refresh({render: false}); renderShell(); setAlert('Гостите са отбелязани като пристигнали.', 'success'); }
    catch (error) { button.disabled = false; button.textContent = old; setAlert(error.message || 'Неуспешно отбелязване.', 'error'); }
  }
  async function refresh({render = true} = {}) {
    if (state.refreshing) { state.refreshAgain = true; return; }
    state.refreshing = true;
    try {
      state.snapshot = await Z.rpc('zorbas_staff_snapshot', {p_token: Z.token()});
      if (!state.areaId || !areaFor(state.areaId)) state.areaId = state.snapshot.areas?.[0]?.id || null;
      if (state.tableId && !tableFor(state.tableId)) { state.tableId = null; state.visitId = null; state.screen = 'areas'; }
      if (state.screen === 'order' && !state.tableId) state.screen = 'areas';
      state.cart = state.cart.filter(row => items().some(item => String(item.id) === String(row.menu_item_id))); saveState();
      if (render && !state.submitting && !document.activeElement?.matches('input, textarea, select')) renderShell();
    } catch (error) {
      if (text(error.message).toLowerCase().includes('сесия') || text(error.message).toLowerCase().includes('session')) { Z.setToken(''); state.session = null; renderLogin(); }
      else if (render) setAlert(error.message || 'Няма връзка със системата.', 'error');
    } finally { state.refreshing = false; if (state.refreshAgain) { state.refreshAgain = false; refresh({render: true}); } }
  }
  async function loadShift() {
    const button = $('waiterStableShift'), label = $('waiterStableShiftLabel'); if (!button || !label || !state.session) return;
    try { const shift = await Z.rpc('zorbas_shift_status_v3', {p_token: Z.token()}); const active = Boolean(shift?.id); label.textContent = active ? `🟢 Смяна от ${Z.formatDate(shift.started_at)}` : '⚪ Няма започната смяна'; button.textContent = active ? 'Приключи смяната' : 'Започни смяната'; button.className = active ? 'ws-danger ws-shift-button' : 'ws-primary ws-shift-button'; } catch {}
  }
  async function toggleShift() {
    const button = $('waiterStableShift'); if (!button || button.disabled) return; button.disabled = true;
    try { const current = await Z.rpc('zorbas_shift_status_v3', {p_token: Z.token()}); await Z.rpc('zorbas_toggle_shift_v3', {p_token: Z.token(), p_start: !Boolean(current?.id)}); await loadShift(); }
    catch (error) { setAlert(error.message || 'Смяната не се промени.', 'error'); } finally { button.disabled = false; }
  }
  function closeMenu() { state.menuOpen = false; renderShell(); }
  function bindShell() {
    $('waiterLoginForm')?.addEventListener('submit', async event => {
      event.preventDefault(); const form = event.currentTarget; const button = form.querySelector('button[type="submit"]'); const message = $('waiterLoginMessage'); button.disabled = true; button.textContent = 'ВЛИЗАНЕ…'; message.textContent = '';
      try { const data = await Z.rpc('zorbas_staff_login', {p_username: form.elements.username.value.trim(), p_password: form.elements.password.value, p_display_name: form.elements.display_name.value.trim(), p_device_id: Z.deviceId()}); Z.setToken(data.token); state.session = await Z.requireSession(); await refresh({render: false}); await loadShift(); renderShell(); }
      catch (error) { message.textContent = error.message || 'Входът не успя.'; } finally { button.disabled = false; button.textContent = 'ВХОД'; }
    });
    $('waiterStableMenuToggle')?.addEventListener('click', () => { state.menuOpen = !state.menuOpen; renderShell(); }); $('waiterStableBackdrop')?.addEventListener('click', closeMenu); $('waiterStableMenuClose')?.addEventListener('click', closeMenu); $('waiterStableRefresh')?.addEventListener('click', async () => { await refresh(); await loadShift(); }); $('waiterStableShift')?.addEventListener('click', toggleShift); $('waiterStableLogout')?.addEventListener('click', async () => { await Z.logout(); });
    document.querySelectorAll('[data-nav-screen]').forEach(button => button.addEventListener('click', () => { state.screen = button.dataset.navScreen; state.menuOpen = false; if (state.screen === 'areas') { state.areaId = null; state.tableId = null; state.visitId = null; state.newGuest = false; } saveState(); renderShell(); }));
    window.addEventListener('online', () => { state.online = true; renderShell(); refresh(); }); window.addEventListener('offline', () => { state.online = false; renderShell(); }); window.addEventListener('pageshow', () => { if (state.session) refresh(); });
  }
  async function boot() { loadSavedState(); Z.registerPwa(); bindShell(); try { state.session = await Z.requireSession(); if (!state.session) return renderLogin(); await refresh({render: false}); await loadShift(); renderShell(); if (window.ZorbasLive?.subscribe) window.ZorbasLive.subscribe(() => refresh({render: true})); } catch { renderLogin(); } }
  boot();
})();
