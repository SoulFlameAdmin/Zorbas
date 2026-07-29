(() => {
  const Z = window.Zorbas;
  const $ = id => document.getElementById(id);
  let snapshot = null, session = null, stationId = null, filter = 'active', timer = null;

  async function login(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    $('loginMessage').textContent = 'Влизане…';
    try {
      const data = await Z.rpc('zorbas_staff_login', {
        p_username: form.get('username'), p_password: form.get('password'),
        p_display_name: form.get('display_name'), p_device_id: Z.deviceId()
      });
      Z.setToken(data.token); await start();
    } catch (error) { $('loginMessage').textContent = error.message; }
  }

  async function start() {
    session = await Z.requireSession();
    if (!session) return;
    $('loginView').classList.add('hidden'); $('appView').classList.remove('hidden');
    $('sessionName').textContent = `${session.display_name} · свързано със Supabase`;
    await Promise.all([refresh(), loadShift()]);
    timer = setInterval(refresh, 10000);
  }

  async function refresh() {
    try {
      snapshot = await Z.rpc('zorbas_staff_snapshot', {p_token: Z.token()});
      if (!stationId) stationId = snapshot.stations?.[0]?.id || null;
      renderStations(); renderQueue();
    } catch (error) { Z.toast(error.message, 'error'); }
  }

  function renderStations() {
    const nav = $('stationNav');
    nav.innerHTML = (snapshot.stations || []).map(s => `<button class="${s.id === stationId ? 'active' : ''}" data-station="${s.id}">${Z.esc(s.name)}</button>`).join('');
    nav.querySelectorAll('[data-station]').forEach(btn => btn.onclick = () => { stationId = btn.dataset.station; renderStations(); renderQueue(); });
    const current = snapshot.stations?.find(s => s.id === stationId);
    $('stationTitle').textContent = current?.name || 'Кухня';
  }

  function metaText(meta = {}) {
    const labels = [];
    const map = {mode:'Вид', pieces:'Бройки', cheese:'Със сирене', oregano:'Риган', oregano_meat:'Риган месо', oregano_fries:'Риган картофи', sauce:'Сос'};
    const source = meta.options || meta;
    Object.entries(source || {}).forEach(([k,v]) => { if (v !== false && v !== '' && v != null) labels.push(`${map[k] || k}: ${v === true ? 'да' : v}`); });
    if (meta.mode) labels.unshift(`Вид: ${meta.mode === 'piece' ? 'бройки' : 'порция'}`);
    return labels.join(' · ');
  }

  function renderQueue() {
    if (!snapshot || !stationId) return;
    const groups = [];
    (snapshot.orders || []).forEach(order => {
      const items = (order.items || []).filter(item => item.station_id === stationId && (filter === 'ready' ? item.status === 'ready' : ['pending','sent','preparing'].includes(item.status)));
      if (items.length) groups.push({...order, stationItems: items});
    });
    groups.sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
    $('kitchenQueue').innerHTML = groups.length ? groups.map(orderCard).join('') : '<div class="empty">Няма поръчки за тази станция.</div>';
    document.querySelectorAll('[data-item-status]').forEach(btn => btn.onclick = () => setItemStatus(btn.dataset.itemId, btn.dataset.itemStatus));
  }

  function orderCard(order) {
    const table = snapshot.tables?.find(t => t.id === order.table_id);
    const age = Math.max(0, Math.floor((Date.now() - new Date(order.created_at)) / 60000));
    const label = order.order_type === 'pickup' ? '📦 ПАКЕТ' : order.order_type === 'preorder' ? '◷ ПРЕДВАРИТЕЛНА' : `МАСА ${table?.table_number || '—'}`;
    const late = age >= 10 ? 'late' : '';
    return `<article class="order-card ${late}"><header><div><strong>${label}</strong><small>Поръчка №${order.order_number} · ${Z.esc(order.created_by_name || '')}</small></div><span class="badge">${age} мин.</span></header>${order.note ? `<p class="notice">⚠ ${Z.esc(order.note)}</p>` : ''}<div class="order-items">${order.stationItems.map(item => `<div class="kitchen-item"><div class="qty">${Number(item.quantity)}×</div><div><b>${Z.esc(item.item_name)}</b>${item.note ? `<p>⚠ ${Z.esc(item.note)}</p>` : ''}${metaText(item.item_meta) ? `<small>${Z.esc(metaText(item.item_meta))}</small>` : ''}</div><div class="item-actions">${item.status !== 'preparing' && item.status !== 'ready' ? `<button class="btn" data-item-id="${item.id}" data-item-status="preparing">ЗАПОЧВАМ</button>` : ''}${item.status !== 'ready' ? `<button class="btn green" data-item-id="${item.id}" data-item-status="ready">ГОТОВО</button>` : '<span class="badge ready">ГОТОВО</span>'}</div></div>`).join('')}</div><footer><span>${Z.formatDate(order.created_at)}</span>${order.ready_at ? `<b>За ${Z.formatDate(order.ready_at)}</b>` : ''}</footer></article>`;
  }

  async function setItemStatus(id, status) {
    try { await Z.rpc('zorbas_set_item_status_v3', {p_token: Z.token(), p_item_id: id, p_status: status}); await refresh(); }
    catch (error) { Z.toast(error.message, 'error'); }
  }

  async function loadShift() {
    try { const s = await Z.rpc('zorbas_shift_status_v3', {p_token: Z.token()}); renderShift(s); }
    catch (error) { Z.toast(error.message, 'error'); }
  }
  function renderShift(s) {
    const active = !!s?.id;
    $('shiftText').textContent = active ? `🟢 На работа от ${Z.formatDate(s.started_at)}` : '⚪ Извън работа';
    $('shiftButton').textContent = active ? 'Приключвам смяна' : 'Започвам смяна';
    $('shiftButton').className = `btn ${active ? 'red' : 'green'} full`; $('shiftButton').dataset.active = active ? '1' : '0';
  }
  async function toggleShift() {
    const start = $('shiftButton').dataset.active !== '1';
    try { await Z.rpc('zorbas_toggle_shift_v3', {p_token: Z.token(), p_start: start}); await loadShift(); }
    catch (error) { Z.toast(error.message, 'error'); }
  }

  document.addEventListener('DOMContentLoaded', () => {
    Z.registerPwa(); $('loginForm').onsubmit = login; $('logoutButton').onclick = Z.logout;
    $('refreshButton').onclick = refresh; $('shiftButton').onclick = toggleShift;
    document.querySelectorAll('[data-filter]').forEach(btn => btn.onclick = () => { filter = btn.dataset.filter; document.querySelectorAll('[data-filter]').forEach(x => x.classList.toggle('active', x === btn)); renderQueue(); });
    document.querySelectorAll('[data-install-pwa]').forEach(btn => btn.onclick = Z.installPwa);
    start().catch(() => {});
  });
})();