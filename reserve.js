(() => {
  const Z = window.Zorbas;
  const root = document.getElementById('reserveApp');
  if (!Z || !root) return;

  const state = {
    catalog: {areas: [], categories: [], items: []},
    tables: [],
    areaId: null,
    tableId: null,
    view: 'tables',
    loading: true,
    checking: false,
    date: '',
    time: '',
    guests: 2,
    reservation: null,
    foodCart: []
  };

  const labels = {available: 'СВОБОДНА', reserved: 'РЕЗЕРВИРАНА', occupied: 'ЗАЕТА'};
  const esc = value => Z.esc(value);
  const formatDisplayDate = value => value ? value.split('-').reverse().join('.') : '';

  function initialSlot() {
    const now = new Date(Date.now() + 30 * 60 * 1000);
    now.setSeconds(0, 0);
    now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15);
    return {
      date: Z.localDate(now),
      time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    };
  }

  function header(kicker = 'РЕЗЕРВАЦИЯ', meta = '') {
    return `<header class="topbar">
      <button class="icon-btn" type="button" data-home aria-label="Назад към сайта">←</button>
      <div class="brand"><small>${esc(kicker)}</small><strong>ZORBAS</strong></div>
      <div class="top-meta">${esc(meta)}</div>
    </header>`;
  }

  async function boot() {
    const slot = initialSlot();
    state.date = slot.date;
    state.time = slot.time;
    try {
      state.catalog = await Z.rpc('zorbas_public_catalog');
      state.areaId = state.catalog.areas?.[0]?.id || null;
      await loadTables();
    } catch (error) {
      root.innerHTML = `${header()}<main class="main"><div class="empty">${esc(error.message)}</div></main>`;
      bindHome();
    }
  }

  async function loadTables() {
    state.loading = true;
    render();
    try {
      state.tables = await Z.rpc('zorbas_public_availability', {
        p_date: state.date,
        p_time: state.time,
        p_duration_minutes: 120
      });
    } catch (error) {
      Z.toast(error.message, 'error');
      state.tables = [];
    } finally {
      state.loading = false;
      render();
    }
  }

  function render() {
    if (state.view === 'details') return renderDetails();
    if (state.view === 'success') return renderSuccess();
    if (state.view === 'food') return renderFood();
    renderTables();
  }

  function renderTables() {
    const area = state.catalog.areas.find(item => item.id === state.areaId);
    const tables = state.tables
      .filter(item => item.area_id === state.areaId)
      .sort((a, b) => String(a.table_number).localeCompare(String(b.table_number), 'bg', {numeric: true}));

    root.innerHTML = `${header('РЕЗЕРВАЦИЯ', 'СЪСТОЯНИЕ СЕГА')}
      <main class="main">
        <p class="eyebrow">ИЗБЕРИ МАСА</p>
        <div class="title-row"><h1>${esc(area?.name || 'Маси')}</h1><span class="count-pill">${tables.length} маси</span></div>
        <div class="legend"><span><i class="free"></i>Свободна</span><span><i class="reserved"></i>Резервирана</span><span><i class="occupied"></i>Заета</span></div>
        <div class="areas">${(state.catalog.areas || []).map(item => `<button class="area-btn ${item.id === state.areaId ? 'active' : ''}" type="button" data-area="${item.id}">${esc(item.name)}</button>`).join('')}</div>
        <div class="tables-grid">
          ${state.loading ? '<div class="loading-card">Проверявам масите…</div>' : tables.map(table => {
            const status = table.state || (table.available ? 'available' : 'reserved');
            const cssState = status === 'available' ? 'free' : status;
            return `<button class="table-card ${cssState}" type="button" data-table="${table.id}" ${status === 'available' ? '' : 'disabled'}>
              <span class="state-pill">${labels[status] || 'НЕСВОБОДНА'}</span>
              <span class="table-number">${esc(table.table_number)}</span>
              <span class="table-seats">${Number(table.seats || 0)} места</span>
            </button>`;
          }).join('') || '<div class="empty">Няма въведени маси в тази зона.</div>'}
        </div>
      </main>`;

    bindHome();
    root.querySelectorAll('[data-area]').forEach(button => {
      button.onclick = () => {
        state.areaId = button.dataset.area;
        state.tableId = null;
        renderTables();
      };
    });
    root.querySelectorAll('[data-table]:not(:disabled)').forEach(button => {
      button.onclick = () => {
        state.tableId = button.dataset.table;
        state.view = 'details';
        render();
      };
    });
  }

  function renderDetails() {
    const table = state.tables.find(item => item.id === state.tableId);
    const area = state.catalog.areas.find(item => item.id === table?.area_id);
    if (!table) {
      state.view = 'tables';
      return render();
    }

    root.innerHTML = `${header('СТЪПКА 2', `МАСА ${table.table_number}`)}
      <main class="main">
        <button class="back-btn" type="button" data-back>← Към масите</button>
        <div class="summary"><div><small>ИЗБРАНА МАСА</small><strong>${esc(area?.name || '')} · Маса ${esc(table.table_number)}</strong></div><span>${table.seats} места</span></div>
        <form class="form-card" id="reservationForm">
          <div class="fields">
            <label class="field"><span>За коя дата</span><input class="control" type="date" name="date" min="${Z.localDate(new Date())}" value="${esc(state.date)}" required></label>
            <label class="field"><span>В колко часа</span><input class="control" type="time" name="time" step="900" value="${esc(state.time)}" required></label>
            <label class="field"><span>Колко човека</span><input class="control" type="number" name="guests" min="1" max="${Number(table.seats || 1)}" value="${Math.min(state.guests, Number(table.seats || 1))}" required></label>
            <label class="field"><span>Име</span><input class="control" name="name" autocomplete="name" placeholder="Вашето име" required></label>
            <label class="field full"><span>Телефон</span><input class="control" type="tel" name="phone" autocomplete="tel" inputmode="tel" placeholder="08…" required></label>
            <label class="field full"><span>Бележка по желание</span><textarea class="control" name="note" placeholder="Детско столче, повод, друго…"></textarea></label>
          </div>
          <div class="slot-status" id="slotStatus">Проверявам избрания час…</div>
          <button class="primary" id="reserveSubmit" type="submit" disabled>РЕЗЕРВИРАЙ МАСА ${esc(table.table_number)}</button>
        </form>
      </main>`;

    bindHome();
    root.querySelector('[data-back]').onclick = async () => {
      state.view = 'tables';
      state.tableId = null;
      await loadTables();
    };
    const form = root.querySelector('#reservationForm');
    let timer = null;
    form.querySelectorAll('[name=date],[name=time],[name=guests]').forEach(input => {
      input.addEventListener('change', () => {
        clearTimeout(timer);
        timer = setTimeout(() => checkExactSlot(false), 120);
      });
    });
    form.addEventListener('submit', submitReservation);
    checkExactSlot(false);
  }

  function formValues() {
    const form = root.querySelector('#reservationForm');
    if (!form) return null;
    const data = new FormData(form);
    return {
      date: String(data.get('date') || ''),
      time: String(data.get('time') || ''),
      guests: Number(data.get('guests') || 1),
      name: String(data.get('name') || '').trim(),
      phone: String(data.get('phone') || '').trim(),
      note: String(data.get('note') || '').trim()
    };
  }

  async function checkExactSlot(showMessage = true) {
    if (state.checking) return false;
    const values = formValues();
    const statusBox = root.querySelector('#slotStatus');
    const submit = root.querySelector('#reserveSubmit');
    if (!values || !statusBox || !submit) return false;

    state.date = values.date;
    state.time = values.time;
    state.guests = values.guests;
    state.checking = true;
    submit.disabled = true;
    statusBox.className = 'slot-status';
    statusBox.textContent = 'Проверявам избрания час…';

    try {
      const fresh = await Z.rpc('zorbas_public_availability', {
        p_date: values.date,
        p_time: values.time,
        p_duration_minutes: 120
      });
      const table = fresh.find(item => item.id === state.tableId);
      const enoughSeats = Number(table?.seats || 0) >= values.guests;
      const available = Boolean(table && table.state === 'available' && enoughSeats);
      statusBox.className = `slot-status ${available ? 'ok' : 'bad'}`;
      statusBox.textContent = available
        ? '✓ Масата е свободна за този ден и час.'
        : !table || table.state !== 'available'
          ? 'Тази маса е резервирана или заета за избрания час.'
          : `Масата е за максимум ${table.seats} човека.`;
      submit.disabled = !available;
      if (showMessage && !available) Z.toast('Изберете друг час или друга маса.', 'error');
      return available;
    } catch (error) {
      statusBox.className = 'slot-status bad';
      statusBox.textContent = 'Не успях да проверя свободните места.';
      if (showMessage) Z.toast(error.message, 'error');
      return false;
    } finally {
      state.checking = false;
    }
  }

  async function submitReservation(event) {
    event.preventDefault();
    const values = formValues();
    const table = state.tables.find(item => item.id === state.tableId);
    if (!values || !table || !(await checkExactSlot(true))) return;

    const button = root.querySelector('#reserveSubmit');
    button.disabled = true;
    button.textContent = 'ЗАПИСВАМ…';
    try {
      const result = await Z.rpc('zorbas_public_reserve', {
        p_name: values.name,
        p_phone: values.phone,
        p_guests: values.guests,
        p_date: values.date,
        p_time: values.time,
        p_duration_minutes: 120,
        p_table_id: state.tableId,
        p_note: values.note || null
      });
      state.reservation = {
        ...result,
        phone: values.phone,
        tableNumber: table.table_number,
        date: values.date,
        time: values.time,
        guests: values.guests
      };
      state.view = 'success';
      render();
      Z.toast('Масата е резервирана.', 'success');
    } catch (error) {
      Z.toast(error.message, 'error');
      button.disabled = false;
      button.textContent = `РЕЗЕРВИРАЙ МАСА ${table.table_number}`;
    }
  }

  function renderSuccess() {
    const reservation = state.reservation;
    if (!reservation) {
      state.view = 'tables';
      return render();
    }
    root.innerHTML = `${header('ГОТОВО')}
      <main class="main success">
        <div class="check">✓</div>
        <h1>Масата е резервирана.</h1>
        <p>Маса ${esc(reservation.tableNumber)} · ${formatDisplayDate(reservation.date)} · ${esc(reservation.time)}<br>${reservation.guests} човека</p>
        <div class="code">${esc(reservation.code)}</div>
        <button class="primary" type="button" data-food>🍽 ИЗБЕРИ ХРАНА ЗА ПРИСТИГАНЕТО</button>
        <button class="secondary" type="button" data-finish>ГОТОВО, БЕЗ ХРАНА</button>
      </main>`;
    bindHome();
    root.querySelector('[data-food]').onclick = () => {
      state.foodCart = [];
      state.view = 'food';
      render();
    };
    root.querySelector('[data-finish]').onclick = () => location.href = '/';
  }

  function addFood(itemId) {
    const existing = state.foodCart.find(item => item.menu_item_id === itemId);
    if (existing) existing.quantity += 1;
    else {
      const menuItem = state.catalog.items.find(item => item.id === itemId);
      state.foodCart.push({
        menu_item_id: itemId,
        quantity: 1,
        note: '',
        meta: {mode: menuItem?.quantity_mode === 'piece' ? 'piece' : 'portion'}
      });
    }
    renderFood();
  }

  function renderFood() {
    const items = (state.catalog.items || []).filter(item => item.send_to_kitchen);
    const totalCount = state.foodCart.reduce((sum, item) => sum + item.quantity, 0);
    root.innerHTML = `${header('СТЪПКА 3', `МАСА ${state.reservation?.tableNumber || ''}`)}
      <main class="main">
        <button class="back-btn" type="button" data-back-success>← Към потвърждението</button>
        <div class="food-head"><div><p class="eyebrow">ПО ЖЕЛАНИЕ</p><h1>Храна при пристигане</h1></div></div>
        <div class="food-list">${items.map(item => {
          const count = state.foodCart.find(row => row.menu_item_id === item.id)?.quantity || 0;
          const price = item.price_pending ? 'Цена в заведението' : Z.money(item.price);
          return `<article class="food-item"><div><h3>${esc(item.name)}${count ? ` · ×${count}` : ''}</h3><p>${esc(price)}</p></div><button class="add-food" type="button" data-add-food="${item.id}" aria-label="Добави ${esc(item.name)}">+</button></article>`;
        }).join('') || '<div class="empty">Няма налични ястия за предварителна поръчка.</div>'}</div>
      </main>
      <div class="cart-dock"><div class="cart-dock-inner"><div><strong>${totalCount} позиции</strong><small>Към резервацията</small></div><button class="cart-submit" type="button" data-submit-food ${totalCount ? '' : 'disabled'}>ЗАПАЗИ ХРАНАТА</button></div></div>`;
    bindHome();
    root.querySelector('[data-back-success]').onclick = () => {
      state.view = 'success';
      render();
    };
    root.querySelectorAll('[data-add-food]').forEach(button => {
      button.onclick = () => addFood(button.dataset.addFood);
    });
    const submit = root.querySelector('[data-submit-food]');
    if (submit) submit.onclick = submitFood;
  }

  async function submitFood() {
    if (!state.reservation || !state.foodCart.length) return;
    const button = root.querySelector('[data-submit-food]');
    button.disabled = true;
    button.textContent = 'ЗАПИСВАМ…';
    try {
      const result = await Z.rpc('zorbas_public_preorder', {
        p_reservation_id: state.reservation.id,
        p_phone: state.reservation.phone,
        p_items: state.foodCart,
        p_note: null
      });
      Z.toast(`Храната е запазена. Код ${result.code}`, 'success');
      setTimeout(() => { location.href = '/'; }, 900);
    } catch (error) {
      Z.toast(error.message, 'error');
      button.disabled = false;
      button.textContent = 'ЗАПАЗИ ХРАНАТА';
    }
  }

  function bindHome() {
    root.querySelectorAll('[data-home]').forEach(button => {
      button.onclick = () => { location.href = '/'; };
    });
  }

  boot();
})();
