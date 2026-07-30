(() => {
  if (typeof waiterState === 'undefined' || typeof snapshot === 'undefined') return;

  waiterState.mobileMode = waiterState.mobileMode || 'order';
  waiterState.menuOpen = false;
  waiterState.manageAreaId = waiterState.manageAreaId || null;
  waiterState.manageTableId = waiterState.manageTableId || null;
  waiterState.tableDirty = false;

  const baseRenderWaiterMobile = renderWaiterMobile;
  const baseRenderWaiterAreas = renderWaiterAreas;
  const baseRenderWaiterTables = renderWaiterTables;
  const baseRenderWaiterNote = renderWaiterNote;
  const baseRenderWaiterPreview = renderWaiterPreview;

  const mobile = () => window.matchMedia('(max-width:650px)').matches;
  const sessionText = () => document.getElementById('sessionName')?.textContent || '';
  const currentRole = () => (sessionText().split(' · ')[1] || '').trim().toLowerCase();
  const isAdmin = () => ['admin', 'manager', 'owner'].includes(currentRole());

  function ensureMobileTop() {
    let top = document.getElementById('waiterMobileTop');
    if (!top) {
      top = document.createElement('header');
      top.id = 'waiterMobileTop';
      top.className = 'waiter-mobile-top';
      document.getElementById('appView')?.prepend(top);
      top.addEventListener('click', handleTopClick);
    }
    return top;
  }

  function handleTopClick(event) {
    const button = event.target.closest('[data-mobile-nav]');
    if (!button) return;
    const action = button.dataset.mobileNav;

    if (action === 'burger') {
      waiterState.menuOpen = !waiterState.menuOpen;
      renderMobileTop();
      return;
    }
    waiterState.menuOpen = false;

    if (action === 'notes') {
      waiterState.mobileMode = 'notes';
      waiterState.step = 'notes';
      switchView('tables');
      renderWaiterMobile();
      return;
    }
    if (action === 'order') {
      waiterState.mobileMode = 'order';
      waiterState.step = 'areas';
      waiterState.areaId = null;
      waiterState.tableId = null;
      switchView('tables');
      renderWaiterMobile();
      return;
    }
    if (action === 'manage') {
      waiterState.mobileMode = 'manage';
      waiterState.step = 'manageAreas';
      waiterState.manageAreaId = null;
      waiterState.manageTableId = null;
      switchView('tables');
      renderWaiterMobile();
      return;
    }
    if (action === 'site') {
      location.href = '/';
      return;
    }
    if (action.startsWith('view:')) {
      switchView(action.slice(5));
      renderMobileTop();
    }
  }

  function renderMobileTop() {
    const top = ensureMobileTop();
    const adminLinks = isAdmin() ? `
      <div class="waiter-mobile-menu-sep"></div>
      <button data-mobile-nav="view:orders">Поръчки</button>
      <button data-mobile-nav="view:reservations">Резервации</button>
      <button data-mobile-nav="view:menuAdmin">Меню</button>
      <button data-mobile-nav="view:adminStats">Админ</button>
      <a href="/print.html">Печат</a>
      <a href="/kitchen.html">Кухня</a>` : '';

    top.innerHTML = `
      <button class="waiter-notes-button ${waiterState.mobileMode === 'notes' ? 'active' : ''}" data-mobile-nav="notes">
        <span>▤</span> Бележки
      </button>
      <div class="waiter-mobile-brand">
        <small>${Z.esc(sessionText().split(' · ')[0] || 'Сервитьор')}</small>
        <strong>ZORBAS</strong>
      </div>
      <button class="waiter-burger ${waiterState.menuOpen ? 'open' : ''}" data-mobile-nav="burger" aria-label="Меню">
        <i></i><i></i><i></i>
      </button>
      <nav class="waiter-mobile-menu ${waiterState.menuOpen ? 'show' : ''}">
        <button data-mobile-nav="order">Поръчка</button>
        <button data-mobile-nav="manage">Маси</button>
        ${adminLinks}
        <div class="waiter-mobile-menu-sep"></div>
        <button class="exit" data-mobile-nav="site">Изход към сайта</button>
      </nav>`;
  }

  function uniqueRecentNotes() {
    const cutoff = Date.now() - 12 * 60 * 60 * 1000;
    const jobs = (snapshot?.print_jobs || [])
      .filter(job => new Date(job.created_at).getTime() >= cutoff)
      .filter(job => ['order', 'addition', 'pickup'].includes(job.job_type))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const groups = new Map();
    jobs.forEach(job => {
      const payload = job.payload || {};
      const key = `${job.order_id || payload.order_id || job.id}:${job.job_type}`;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          created_at: payload.created_at || job.created_at,
          payload,
          destinations: [],
          statuses: []
        });
      }
      const group = groups.get(key);
      if (!group.destinations.includes(job.destination)) group.destinations.push(job.destination);
      group.statuses.push(job.status);
    });

    return [...groups.values()].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  function localDayKey(value) {
    return new Date(value).toLocaleDateString('sv-SE', {timeZone: 'Europe/Sofia'});
  }

  function dayLabel(value) {
    const key = localDayKey(value);
    const now = new Date();
    const today = now.toLocaleDateString('sv-SE', {timeZone: 'Europe/Sofia'});
    const yesterdayDate = new Date(now.getTime() - 86400000);
    const yesterday = yesterdayDate.toLocaleDateString('sv-SE', {timeZone: 'Europe/Sofia'});
    if (key === today) return 'ДНЕС';
    if (key === yesterday) return 'ВЧЕРА';
    return new Date(value).toLocaleDateString('bg-BG', {day:'2-digit', month:'long', timeZone:'Europe/Sofia'}).toUpperCase();
  }

  function noteStatus(note) {
    if (note.statuses.every(status => status === 'printed')) return 'Отпечатана';
    if (note.statuses.some(status => status === 'failed')) return 'Грешка';
    if (note.statuses.some(status => status === 'printing')) return 'Печата се';
    return 'Изпратена';
  }

  function renderWaiterNotesV2() {
    const notes = uniqueRecentNotes();
    let lastDay = '';
    const cards = notes.map(note => {
      const payload = note.payload || {};
      const day = localDayKey(note.created_at);
      const divider = day !== lastDay ? `<div class="waiter-day-divider"><span>${dayLabel(note.created_at)}</span></div>` : '';
      lastDay = day;
      const destination = note.destinations.length > 1
        ? 'Print 1 + Print 2'
        : note.destinations[0] === 'kitchen' ? 'Print 2' : 'Print 1';
      const items = (payload.items || []).map(item => `
        <li><b>${Number(item.quantity || 1)}×</b><span>${Z.esc(item.name || 'Артикул')}</span>${item.note ? `<small>${Z.esc(item.note)}</small>` : ''}</li>
      `).join('');
      return `${divider}<article class="waiter-note-history">
        <header>
          <div>
            <small>${payload.order_type === 'pickup' ? 'ПАКЕТ' : `МАСА ${Z.esc(payload.table_number || '—')}`}</small>
            <strong>№${Z.esc(payload.order_number || '—')}</strong>
          </div>
          <time>${new Date(note.created_at).toLocaleTimeString('bg-BG',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Sofia'})}</time>
        </header>
        <ul>${items}</ul>
        <footer>
          <span>${Z.esc(payload.actor || 'Сервитьор')}</span>
          <span>${destination}</span>
          <b class="${noteStatus(note) === 'Грешка' ? 'error' : ''}">${noteStatus(note)}</b>
        </footer>
      </article>`;
    }).join('');

    return `
      <div class="waiter-screen-head waiter-notes-head">
        <div><small>ПОСЛЕДНИ 12 ЧАСА</small><h3>Бележки</h3></div>
        <button class="waiter-refresh" data-waiter-v2="refresh">↻</button>
      </div>
      <div class="waiter-note-history-list">${cards || '<p class="empty">Няма изпратени бележки през последните 12 часа.</p>'}</div>`;
  }

  function renderManageAreas() {
    const areas = snapshot?.areas || [];
    return `
      <div class="waiter-screen-head">
        <div><small>МАСИ</small><h3>Избери област</h3></div>
        <span>${snapshot?.tables?.length || 0} маси</span>
      </div>
      <p class="waiter-manage-help">Подреждането, местата и статусът се записват в Supabase и се показват при резервация.</p>
      <div class="waiter-area-grid">
        ${areas.map(area => {
          const tables = snapshot.tables.filter(table => table.area_id === area.id);
          const occupied = tables.filter(table => waiterTableState(table) === 'occupied').length;
          return `<button class="waiter-area-card" data-manage-area="${area.id}">
            <span class="waiter-area-icon">⌗</span>
            <strong>${Z.esc(area.name)}</strong>
            <small>${tables.length} маси · ${occupied} заети</small>
            <i>→</i>
          </button>`;
        }).join('') || '<p class="empty">Няма области.</p>'}
      </div>`;
  }

  function chairMarks(seats) {
    const count = Math.min(Number(seats || 4), 12);
    return Array.from({length: count}, (_, index) => `<i style="--chair:${index}"></i>`).join('');
  }

  function renderManageTables() {
    const areaId = waiterState.manageAreaId || snapshot.areas[0]?.id;
    waiterState.manageAreaId = areaId;
    const area = snapshot.areas.find(entry => entry.id === areaId);
    const tables = snapshot.tables.filter(table => table.area_id === areaId);
    const selected = snapshot.tables.find(table => table.id === waiterState.manageTableId);

    return `
      <div class="waiter-screen-head">
        <button class="waiter-back" data-waiter-v2="manageAreas">←</button>
        <div><small>ПОДРЕЖДАНЕ</small><h3>${Z.esc(area?.name || 'Област')}</h3></div>
        <span>${tables.length} маси</span>
      </div>
      <p class="waiter-manage-help">Плъзни маса до реалното ѝ място. Натисни я за места, форма и свободна/заета.</p>
      <div class="waiter-layout-map" id="waiterLayoutMap" style="aspect-ratio:${Number(area?.map_width || 100)}/${Number(area?.map_height || 70)}">
        ${tables.map(table => {
          const state = waiterTableState(table);
          return `<button class="waiter-layout-table shape-${Z.esc(table.shape || 'rectangle')} ${state} ${selected?.id === table.id ? 'selected' : ''}"
            data-manage-table="${table.id}"
            style="left:${Number(table.x || 0)}%;top:${Number(table.y || 0)}%;width:${Number(table.width || 15)}%;height:${Number(table.height || 10)}%;transform:rotate(${Number(table.rotation || 0)}deg)">
            <span>${Z.esc(table.table_number)}</span>
            <small>${Number(table.seats || 0)}</small>
            <em>${chairMarks(table.seats)}</em>
          </button>`;
        }).join('') || '<p class="empty">Няма маси в тази област.</p>'}
      </div>
      ${selected ? renderManageEditor(selected) : '<p class="waiter-select-table">Натисни маса, за да я редактираш.</p>'}`;
  }

  function renderManageEditor(table) {
    const occupied = table.status === 'occupied';
    return `
      <section class="waiter-table-editor">
        <header><div><small>ИЗБРАНА МАСА</small><h4>Маса ${Z.esc(table.table_number)}</h4></div><span class="${occupied ? 'occupied' : 'free'}">${occupied ? 'Заета' : 'Свободна'}</span></header>
        <label>
          <span>Брой столове <b id="waiterSeatsValue">${Number(table.seats || 4)}</b></span>
          <input id="waiterSeatsRange" type="range" min="1" max="16" step="1" value="${Number(table.seats || 4)}">
        </label>
        <div class="waiter-shape-picker">
          <button class="${table.shape === 'rectangle' || !table.shape ? 'active' : ''}" data-table-shape="rectangle">Правоъгълна</button>
          <button class="${table.shape === 'square' ? 'active' : ''}" data-table-shape="square">Квадратна</button>
          <button class="${table.shape === 'circle' ? 'active' : ''}" data-table-shape="circle">Кръгла</button>
        </div>
        <button class="waiter-occupancy-toggle ${occupied ? 'occupied' : ''}" data-waiter-v2="toggleOccupied">
          ${occupied ? 'Освободи масата' : 'Отбележи като заета'}
        </button>
        <button class="waiter-save-table" data-waiter-v2="saveTable" ${waiterState.tableDirty ? '' : 'disabled'}>
          <span>✓</span> ЗАПАЗИ В SUPABASE
        </button>
      </section>`;
  }

  async function saveManagedTable() {
    const table = snapshot.tables.find(entry => entry.id === waiterState.manageTableId);
    if (!table) return;
    try {
      await Z.rpc('zorbas_save_table_v4', {p_token: Z.token(), p_table: table});
      waiterState.tableDirty = false;
      Z.toast('Масата е запазена и вече се вижда при резервация.', 'success');
      await refresh();
      waiterState.mobileMode = 'manage';
      waiterState.step = 'manageTables';
      waiterState.manageAreaId = table.area_id;
      waiterState.manageTableId = table.id;
      renderWaiterMobile();
    } catch (error) {
      Z.toast(error.message, 'error');
    }
  }

  function bindManageDrag(root) {
    const map = root.querySelector('#waiterLayoutMap');
    if (!map || map.dataset.dragBound === '1') return;
    map.dataset.dragBound = '1';
    let drag = null;

    map.addEventListener('pointerdown', event => {
      const node = event.target.closest('[data-manage-table]');
      if (!node) return;
      const table = snapshot.tables.find(entry => entry.id === node.dataset.manageTable);
      if (!table) return;
      event.preventDefault();
      node.setPointerCapture?.(event.pointerId);
      const rect = map.getBoundingClientRect();
      drag = {
        node, table, rect,
        startX: event.clientX,
        startY: event.clientY,
        originalX: Number(table.x || 0),
        originalY: Number(table.y || 0),
        moved: false
      };
      waiterState.manageTableId = table.id;
    });

    map.addEventListener('pointermove', event => {
      if (!drag) return;
      const dx = (event.clientX - drag.startX) / drag.rect.width * 100;
      const dy = (event.clientY - drag.startY) / drag.rect.height * 100;
      if (Math.abs(dx) > .3 || Math.abs(dy) > .3) drag.moved = true;
      const maxX = Math.max(0, 100 - Number(drag.table.width || 15));
      const maxY = Math.max(0, 100 - Number(drag.table.height || 10));
      drag.table.x = Math.min(maxX, Math.max(0, drag.originalX + dx));
      drag.table.y = Math.min(maxY, Math.max(0, drag.originalY + dy));
      drag.node.style.left = `${drag.table.x}%`;
      drag.node.style.top = `${drag.table.y}%`;
      waiterState.tableDirty = true;
    });

    const finish = () => {
      if (!drag) return;
      const moved = drag.moved;
      drag = null;
      renderWaiterMobile();
      if (!moved) {
        document.querySelector('.waiter-table-editor')?.scrollIntoView({behavior:'smooth', block:'nearest'});
      }
    };
    map.addEventListener('pointerup', finish);
    map.addEventListener('pointercancel', finish);
  }

  function handleV2Click(event) {
    const area = event.target.closest('[data-manage-area]');
    if (area) {
      waiterState.manageAreaId = area.dataset.manageArea;
      waiterState.manageTableId = null;
      waiterState.step = 'manageTables';
      renderWaiterMobile();
      return;
    }

    const tableButton = event.target.closest('[data-manage-table]');
    if (tableButton && !event.defaultPrevented) {
      waiterState.manageTableId = tableButton.dataset.manageTable;
      renderWaiterMobile();
      return;
    }

    const shapeButton = event.target.closest('[data-table-shape]');
    if (shapeButton) {
      const table = snapshot.tables.find(entry => entry.id === waiterState.manageTableId);
      if (!table) return;
      table.shape = shapeButton.dataset.tableShape;
      if (table.shape === 'circle' || table.shape === 'square') {
        const size = Math.max(10, Math.min(Number(table.width || 15), Number(table.height || 10)));
        table.width = size;
        table.height = size;
      }
      waiterState.tableDirty = true;
      renderWaiterMobile();
      return;
    }

    const actionButton = event.target.closest('[data-waiter-v2]');
    if (!actionButton) return;
    const action = actionButton.dataset.waiterV2;

    if (action === 'refresh') {
      refresh().then(() => renderWaiterMobile());
      return;
    }
    if (action === 'manageAreas') {
      waiterState.step = 'manageAreas';
      waiterState.manageTableId = null;
      renderWaiterMobile();
      return;
    }
    if (action === 'toggleOccupied') {
      const table = snapshot.tables.find(entry => entry.id === waiterState.manageTableId);
      if (!table) return;
      table.status = table.status === 'occupied' ? 'free' : 'occupied';
      waiterState.tableDirty = true;
      renderWaiterMobile();
      return;
    }
    if (action === 'saveTable') saveManagedTable();
  }

  function bindV2Root(root) {
    if (root.dataset.v2Bound === '1') return;
    root.dataset.v2Bound = '1';
    root.addEventListener('click', handleV2Click);
    root.addEventListener('input', event => {
      if (event.target.id !== 'waiterSeatsRange') return;
      const table = snapshot.tables.find(entry => entry.id === waiterState.manageTableId);
      if (!table) return;
      table.seats = Number(event.target.value);
      waiterState.tableDirty = true;
      const value = document.getElementById('waiterSeatsValue');
      if (value) value.textContent = String(table.seats);
      const save = document.querySelector('.waiter-save-table');
      if (save) save.disabled = false;
    });
  }

  renderWaiterMobile = function renderWaiterMobileV2() {
    if (!snapshot) return;
    renderMobileTop();
    const root = ensureWaiterMobile();
    bindV2Root(root);

    if (!mobile()) {
      baseRenderWaiterMobile();
      return;
    }

    let body = '';
    if (waiterState.mobileMode === 'notes' || waiterState.step === 'notes') {
      waiterState.mobileMode = 'notes';
      body = renderWaiterNotesV2();
    } else if (waiterState.mobileMode === 'manage' || String(waiterState.step).startsWith('manage')) {
      waiterState.mobileMode = 'manage';
      body = waiterState.step === 'manageTables' ? renderManageTables() : renderManageAreas();
    } else {
      waiterState.mobileMode = 'order';
      body = waiterState.step === 'tables'
        ? baseRenderWaiterTables()
        : waiterState.step === 'note'
          ? baseRenderWaiterNote()
          : waiterState.step === 'preview'
            ? baseRenderWaiterPreview()
            : baseRenderWaiterAreas();
      body = `${waiterStepper()}${body}`;
    }

    root.innerHTML = body;
    bindWaiterInput();
    bindManageDrag(root);
  };

  window.addEventListener('resize', () => renderWaiterMobile());
  setInterval(() => {
    if (mobile() && waiterState.mobileMode === 'notes' && typeof refresh === 'function') refresh();
  }, 5000);
})();