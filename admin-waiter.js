const waiterState = {
  step: 'areas',
  areaId: null,
  tableId: null,
  query: '',
  candidate: null,
  cart: [],
  showMenu: false,
  printing: false
};

const WAITER_ALIAS_KEY = 'zorbas_waiter_aliases_v1';

function waiterAliases() {
  try { return JSON.parse(localStorage.getItem(WAITER_ALIAS_KEY) || '{}'); }
  catch { return {}; }
}

function saveWaiterAlias(query, itemId) {
  const key = normalizeWaiterText(query);
  if (!key || key.length < 2) return;
  const aliases = waiterAliases();
  aliases[key] = itemId;
  localStorage.setItem(WAITER_ALIAS_KEY, JSON.stringify(aliases));
}

function normalizeWaiterText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function waiterLatin(value) {
  const map = {
    а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',
    н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',
    щ:'sht',ъ:'a',ь:'y',ю:'yu',я:'ya'
  };
  return normalizeWaiterText(value).split('').map(char => map[char] || char).join('');
}

function waiterQueryParts(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d+)\s*[xх×.]?\s*(.*)$/i);
  const quantity = match ? Math.max(1, Number(match[1]) || 1) : 1;
  const text = match ? match[2] : raw;
  return { quantity, text: text.trim() };
}

function waiterItemRank(item, query) {
  const parsed = waiterQueryParts(query);
  const q = normalizeWaiterText(parsed.text);
  if (!q) return 0;

  const name = normalizeWaiterText(item.name);
  const latinName = waiterLatin(item.name);
  const qLatin = waiterLatin(parsed.text);
  const aliases = waiterAliases();

  if (aliases[q] === item.id || aliases[qLatin] === item.id) return 1000;
  if (name === q || latinName === q || latinName === qLatin) return 900;
  if (name.startsWith(q) || latinName.startsWith(q) || latinName.startsWith(qLatin)) return 800;

  const words = name.split(' ');
  const latinWords = latinName.split(' ');
  if (words.some(word => word.startsWith(q)) || latinWords.some(word => word.startsWith(qLatin))) return 700;

  const tokens = q.split(' ').filter(Boolean);
  const latinTokens = qLatin.split(' ').filter(Boolean);
  if (tokens.length && tokens.every(token => name.includes(token))) return 600;
  if (latinTokens.length && latinTokens.every(token => latinName.includes(token))) return 550;
  if (name.includes(q) || latinName.includes(qLatin)) return 500;
  return 0;
}

function waiterMatches(query, limit = 12) {
  if (!snapshot?.items) return [];
  return snapshot.items
    .filter(item => item.active)
    .map(item => ({ item, rank: waiterItemRank(item, query) }))
    .filter(result => result.rank > 0)
    .sort((a, b) => b.rank - a.rank || String(a.item.name).localeCompare(String(b.item.name), 'bg'))
    .slice(0, limit)
    .map(result => result.item);
}

function waiterAreaName(id) {
  return snapshot?.areas?.find(area => area.id === id)?.name || '';
}

function waiterTable(id) {
  return snapshot?.tables?.find(table => table.id === id) || null;
}

function waiterCategoryName(item) {
  return snapshot?.categories?.find(category => category.id === item?.category_id)?.name || 'Меню';
}

function waiterStationName(item) {
  return snapshot?.stations?.find(station => station.id === item?.station_id)?.name || '';
}

function waiterTableState(table) {
  if (table.status === 'blocked') return 'blocked';
  if (tableHasActiveOrder(table.id) || table.status === 'occupied') return 'occupied';
  return 'free';
}

function waiterCartTotal() {
  return waiterState.cart.reduce((sum, row) => {
    const item = snapshot.items.find(entry => entry.id === row.menu_item_id);
    return sum + Number(item?.price || 0) * Number(row.quantity || 0);
  }, 0);
}

function waiterStepIndex() {
  return ({areas: 1, tables: 2, note: 3, preview: 4})[waiterState.step] || 1;
}

function waiterStepper() {
  const current = waiterStepIndex();
  return `<div class="waiter-stepper">${['Област','Маса','Бележка','Преглед'].map((label, index) => {
    const number = index + 1;
    const state = number < current ? 'done' : number === current ? 'active' : '';
    return `<span class="${state}"><b>${number < current ? '✓' : number}</b>${label}</span>`;
  }).join('')}</div>`;
}

function ensureWaiterMobile() {
  let root = document.getElementById('waiterMobile');
  if (!root) {
    root = document.createElement('div');
    root.id = 'waiterMobile';
    root.className = 'waiter-mobile';
    document.getElementById('view-tables')?.appendChild(root);
    bindWaiterMobile(root);
  }
  return root;
}

function renderWaiterAreas() {
  const areas = snapshot.areas || [];
  return `
    <div class="waiter-screen-head">
      <div><small>НОВА БЕЛЕЖКА</small><h3>Избери област</h3></div>
      <span>${snapshot.tables?.length || 0} маси</span>
    </div>
    <div class="waiter-area-grid">
      ${areas.map(area => {
        const tables = snapshot.tables.filter(table => table.area_id === area.id);
        const occupied = tables.filter(table => waiterTableState(table) === 'occupied').length;
        return `<button class="waiter-area-card" data-waiter-area="${area.id}">
          <span class="waiter-area-icon">⌂</span>
          <strong>${Z.esc(area.name)}</strong>
          <small>${tables.length} маси · ${occupied} заети</small>
          <i>→</i>
        </button>`;
      }).join('') || '<p class="empty">Няма въведени области.</p>'}
    </div>`;
}

function renderWaiterTables() {
  const areaId = waiterState.areaId || selectedArea || snapshot.areas[0]?.id;
  const tables = snapshot.tables.filter(table => table.area_id === areaId);
  return `
    <div class="waiter-screen-head">
      <button class="waiter-back" data-waiter-action="areas">←</button>
      <div><small>ОБЛАСТ</small><h3>${Z.esc(waiterAreaName(areaId))}</h3></div>
      <span>${tables.length} маси</span>
    </div>
    <div class="waiter-table-grid">
      ${tables.map(table => {
        const state = waiterTableState(table);
        const label = state === 'occupied' ? 'Заета' : state === 'blocked' ? 'Блокирана' : 'Свободна';
        return `<button class="waiter-table-card ${state}" data-waiter-table="${table.id}" ${state === 'blocked' ? 'disabled' : ''}>
          <small>${label}</small>
          <strong>${Z.esc(table.table_number)}</strong>
          <span>${Number(table.seats || 0)} места</span>
        </button>`;
      }).join('') || '<p class="empty">Няма маси в тази област.</p>'}
    </div>`;
}

function waiterCartRows() {
  if (!waiterState.cart.length) {
    return `<div class="waiter-note-empty"><b>Започни да пишеш</b><span>Например: „ска“ или „2 гръцки“</span></div>`;
  }

  return waiterState.cart.map((row, index) => {
    const item = snapshot.items.find(entry => entry.id === row.menu_item_id);
    return `<div class="waiter-confirmed-line">
      <div><strong>${Z.esc(item?.name || 'Артикул')}</strong><small>${Z.esc(waiterCategoryName(item))}${waiterStationName(item) ? ` · ${Z.esc(waiterStationName(item))}` : ''}</small></div>
      <div class="waiter-line-qty">
        <button data-waiter-minus="${index}" aria-label="Намали">−</button>
        <b>${row.quantity}</b>
        <button data-waiter-plus="${index}" aria-label="Увеличи">+</button>
      </div>
      <span class="waiter-line-check">✓</span>
      <button class="waiter-line-remove" data-waiter-remove="${index}" aria-label="Изтрий">×</button>
    </div>`;
  }).join('');
}

function renderWaiterNote() {
  const table = waiterTable(waiterState.tableId || selectedTable);
  return `
    <div class="waiter-screen-head">
      <button class="waiter-back" data-waiter-action="tables">←</button>
      <div><small>${Z.esc(waiterAreaName(table?.area_id))}</small><h3>Маса ${Z.esc(table?.table_number || '—')}</h3></div>
      <span>${waiterState.cart.reduce((sum, row) => sum + row.quantity, 0)} позиции</span>
    </div>
    <section class="waiter-notepad">
      <div class="waiter-note-title"><span>БЕЛЕЖКА</span><small>Пиши на български</small></div>
      <div class="waiter-lines">${waiterCartRows()}</div>
      <label class="waiter-composer">
        <span>Нова позиция</span>
        <input id="waiterQuickInput" value="${Z.esc(waiterState.query)}" autocomplete="off" autocapitalize="sentences" spellcheck="false" placeholder="Започни да пишеш…">
      </label>
      <div id="waiterSuggestionBox"></div>
    </section>
    <button class="waiter-main-action" data-waiter-action="preview" ${waiterState.cart.length ? '' : 'disabled'}>
      ПРЕГЛЕД <span>→</span>
    </button>`;
}

function renderWaiterPreview() {
  const table = waiterTable(waiterState.tableId || selectedTable);
  const rows = waiterState.cart.map(row => {
    const item = snapshot.items.find(entry => entry.id === row.menu_item_id);
    return `<div class="waiter-receipt-row"><span>${row.quantity} × ${Z.esc(item?.name || 'Артикул')}</span><b>${item?.price_pending ? '—' : Z.money(Number(item?.price || 0) * row.quantity)}</b></div>`;
  }).join('');

  return `
    <div class="waiter-screen-head">
      <button class="waiter-back" data-waiter-action="note">←</button>
      <div><small>ПРЕГЛЕД</small><h3>Бележката е готова</h3></div>
      <span>${waiterState.cart.reduce((sum, row) => sum + row.quantity, 0)} позиции</span>
    </div>
    <article class="waiter-receipt">
      <header><small>RESTAURANT</small><h2>ZORBAS</h2><p>${Z.esc(waiterAreaName(table?.area_id))} · Маса ${Z.esc(table?.table_number || '—')}</p></header>
      <div class="waiter-receipt-meta"><span>${Z.esc(document.getElementById('sessionName')?.textContent?.split(' · ')[0] || 'Сервитьор')}</span><span>${new Date().toLocaleTimeString('bg-BG',{hour:'2-digit',minute:'2-digit'})}</span></div>
      <div class="waiter-receipt-items">${rows}</div>
      <footer><span>Общо</span><strong>${Z.money(waiterCartTotal())}</strong></footer>
    </article>
    <div class="waiter-print-title">Къде да се изпрати?</div>
    <div class="waiter-print-grid">
      <button class="waiter-print light" data-waiter-print="staff" ${waiterState.printing ? 'disabled' : ''}><strong>PRINT 1</strong><span>За сервитьора</span></button>
      <button class="waiter-print both" data-waiter-print="both" ${waiterState.printing ? 'disabled' : ''}><strong>И ДВАТА</strong><span>Print 1 + Print 2</span></button>
      <button class="waiter-print primary" data-waiter-print="kitchen" ${waiterState.printing ? 'disabled' : ''}><strong>PRINT 2</strong><span>Към кухнята</span></button>
    </div>`;
}

function updateWaiterSuggestions() {
  const box = document.getElementById('waiterSuggestionBox');
  if (!box) return;

  const parsed = waiterQueryParts(waiterState.query);
  const query = parsed.text;
  const matches = waiterMatches(waiterState.query, waiterState.showMenu ? 20 : 8);
  waiterState.candidate = matches[0] || null;

  if (!query) {
    box.innerHTML = '<p class="waiter-hint">Системата проверява менюто още докато пишеш.</p>';
    return;
  }

  if (waiterState.candidate && !waiterState.showMenu) {
    const item = waiterState.candidate;
    box.innerHTML = `<div class="waiter-suggestion">
      <div><small>Това ли е?</small><strong>${parsed.quantity > 1 ? `${parsed.quantity} × ` : ''}${Z.esc(item.name)}?</strong><span>${Z.esc(waiterCategoryName(item))}${waiterStationName(item) ? ` · ${Z.esc(waiterStationName(item))}` : ''}</span></div>
      <button data-waiter-action="accept" aria-label="Потвърди">✓</button>
    </div>
    ${matches.length > 1 ? `<button class="waiter-more" data-waiter-action="menu">Друг резултат (${matches.length - 1})</button>` : ''}`;
    return;
  }

  box.innerHTML = `<button class="waiter-not-found" data-waiter-action="menu">× <span>${matches.length ? 'Избери правилното от менюто' : 'Не е намерено — отвори менюто'}</span></button>
    <div class="waiter-manual-list">
      ${(matches.length ? matches : snapshot.items.filter(item => item.active).slice(0, 20)).map(item => `<button data-waiter-item="${item.id}">
        <span><strong>${Z.esc(item.name)}</strong><small>${Z.esc(waiterCategoryName(item))}</small></span><b>✓</b>
      </button>`).join('')}
    </div>`;
}

function acceptWaiterItem(item, rememberAlias = false) {
  if (!item) return;
  const parsed = waiterQueryParts(waiterState.query);
  const quantity = parsed.quantity || 1;
  const existing = waiterState.cart.find(row => row.menu_item_id === item.id);
  if (existing) existing.quantity += quantity;
  else waiterState.cart.push({
    menu_item_id: item.id,
    quantity,
    note: '',
    meta: {
      mode: item.quantity_mode === 'piece' ? 'piece' : 'portion',
      options: {}
    }
  });

  if (rememberAlias) saveWaiterAlias(parsed.text, item.id);
  waiterState.query = '';
  waiterState.candidate = null;
  waiterState.showMenu = false;
  renderWaiterMobile();
  setTimeout(() => document.getElementById('waiterQuickInput')?.focus(), 20);
}

async function printWaiterOrder(route) {
  if (waiterState.printing || !waiterState.cart.length || !waiterState.tableId) return;
  waiterState.printing = true;
  renderWaiterMobile();

  try {
    const result = await Z.rpc('zorbas_create_order_v3', {
      p_token: Z.token(),
      p_table_id: waiterState.tableId,
      p_order_type: 'dine_in',
      p_customer_name: null,
      p_customer_phone: null,
      p_ready_at: null,
      p_note: null,
      p_items: waiterState.cart,
      p_route: route
    });

    Z.toast(`Бележка ${result.code} е изпратена.`, 'success');
    waiterState.cart = [];
    waiterState.query = '';
    waiterState.step = 'areas';
    waiterState.tableId = null;
    selectedTable = null;
    await refresh();
    switchView('orders');
  } catch (error) {
    Z.toast(error.message, 'error');
  } finally {
    waiterState.printing = false;
    renderWaiterMobile();
  }
}

function bindWaiterMobile(root) {
  root.addEventListener('click', event => {
    const areaButton = event.target.closest('[data-waiter-area]');
    if (areaButton) {
      waiterState.areaId = areaButton.dataset.waiterArea;
      selectedArea = waiterState.areaId;
      waiterState.step = 'tables';
      renderWaiterMobile();
      return;
    }

    const tableButton = event.target.closest('[data-waiter-table]');
    if (tableButton) {
      waiterState.tableId = tableButton.dataset.waiterTable;
      selectedTable = waiterState.tableId;
      const table = waiterTable(waiterState.tableId);
      waiterState.areaId = table?.area_id || waiterState.areaId;
      selectedArea = waiterState.areaId;
      waiterState.step = 'note';
      renderWaiterMobile();
      setTimeout(() => document.getElementById('waiterQuickInput')?.focus(), 20);
      return;
    }

    const actionButton = event.target.closest('[data-waiter-action]');
    if (actionButton) {
      const action = actionButton.dataset.waiterAction;
      if (action === 'areas') {
        waiterState.step = 'areas';
        waiterState.tableId = null;
        selectedTable = null;
      } else if (action === 'tables') {
        waiterState.step = 'tables';
        waiterState.tableId = null;
        selectedTable = null;
      } else if (action === 'note') {
        waiterState.step = 'note';
      } else if (action === 'preview' && waiterState.cart.length) {
        waiterState.step = 'preview';
      } else if (action === 'accept') {
        acceptWaiterItem(waiterState.candidate);
        return;
      } else if (action === 'menu') {
        waiterState.showMenu = true;
        updateWaiterSuggestions();
        return;
      }
      renderWaiterMobile();
      return;
    }

    const itemButton = event.target.closest('[data-waiter-item]');
    if (itemButton) {
      const item = snapshot.items.find(entry => entry.id === itemButton.dataset.waiterItem);
      acceptWaiterItem(item, true);
      return;
    }

    const removeButton = event.target.closest('[data-waiter-remove]');
    if (removeButton) {
      waiterState.cart.splice(Number(removeButton.dataset.waiterRemove), 1);
      renderWaiterMobile();
      return;
    }

    const minusButton = event.target.closest('[data-waiter-minus]');
    if (minusButton) {
      const index = Number(minusButton.dataset.waiterMinus);
      waiterState.cart[index].quantity -= 1;
      if (waiterState.cart[index].quantity <= 0) waiterState.cart.splice(index, 1);
      renderWaiterMobile();
      return;
    }

    const plusButton = event.target.closest('[data-waiter-plus]');
    if (plusButton) {
      waiterState.cart[Number(plusButton.dataset.waiterPlus)].quantity += 1;
      renderWaiterMobile();
      return;
    }

    const printButton = event.target.closest('[data-waiter-print]');
    if (printButton) printWaiterOrder(printButton.dataset.waiterPrint);
  });
}

function bindWaiterInput() {
  const input = document.getElementById('waiterQuickInput');
  if (!input) return;

  input.oninput = () => {
    waiterState.query = input.value;
    waiterState.showMenu = false;
    updateWaiterSuggestions();
  };

  input.onkeydown = event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (waiterState.candidate) acceptWaiterItem(waiterState.candidate);
    }
  };

  updateWaiterSuggestions();
}

function renderWaiterMobile() {
  if (!snapshot) return;
  const root = ensureWaiterMobile();

  if (!waiterState.areaId) waiterState.areaId = selectedArea || snapshot.areas[0]?.id || null;
  if (waiterState.tableId && !waiterTable(waiterState.tableId)) {
    waiterState.tableId = null;
    waiterState.step = 'tables';
  }

  const body = waiterState.step === 'tables'
    ? renderWaiterTables()
    : waiterState.step === 'note'
      ? renderWaiterNote()
      : waiterState.step === 'preview'
        ? renderWaiterPreview()
        : renderWaiterAreas();

  root.innerHTML = `${waiterStepper()}${body}`;
  bindWaiterInput();
}

window.renderWaiterMobile = renderWaiterMobile;
