(() => {
  if (window.ZorbasStage2) return;
  window.ZorbasStage2 = true;

  let current = null;
  let scheduled = false;
  const esc = value => Z.esc(value == null ? '' : String(value));
  const snap = () => (typeof snapshot !== 'undefined' ? snapshot : null);
  const orders = () => snap()?.orders || [];
  const visits = () => snap()?.visits || [];
  const tables = () => snap()?.tables || [];
  const areas = () => snap()?.areas || [];

  function orderForItem(itemId) {
    return orders().find(order => (order.items || []).some(item => item.id === itemId)) || null;
  }

  function itemFor(itemId) {
    const order = orderForItem(itemId);
    return order?.items?.find(item => item.id === itemId) || null;
  }

  function visitFor(id) {
    return visits().find(visit => visit.id === id) || null;
  }

  function tableFor(id) {
    return tables().find(table => table.id === id) || null;
  }

  function areaFor(id) {
    return areas().find(area => area.id === id) || null;
  }

  function sourceLabel(order) {
    const table = tableFor(order?.table_id);
    const area = areaFor(table?.area_id);
    const visit = visitFor(order?.visit_id);
    return `${area?.name || 'Зона'} · Маса ${table?.table_number || '—'} · ${visit?.guest_label || ''}`;
  }

  function activeTargetOptions(sourceOrder) {
    return visits()
      .filter(visit => visit.status === 'active' && visit.id !== sourceOrder?.visit_id)
      .map(visit => {
        const table = tableFor(visit.table_id);
        const area = areaFor(table?.area_id);
        return {visit, table, area};
      })
      .filter(entry => entry.table)
      .sort((a, b) => `${a.area?.name || ''}-${a.table.table_number}`.localeCompare(`${b.area?.name || ''}-${b.table.table_number}`, 'bg'));
  }

  function ensureDialog() {
    let dialog = document.getElementById('stage2ItemDialog');
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = 'stage2ItemDialog';
    dialog.className = 'stage2-dialog';
    dialog.innerHTML = `
      <form method="dialog" class="stage2-card">
        <header>
          <div><small>ЕТАП 2 · РЕДАКЦИЯ</small><h3 id="stage2Title">Продукт</h3></div>
          <button class="stage2-close" value="cancel" aria-label="Затвори">×</button>
        </header>
        <p class="stage2-source" id="stage2Source"></p>
        <div class="stage2-summary" id="stage2Summary"></div>

        <section class="stage2-section">
          <div><small>ПРОМЕНИ / ОТКАЖИ</small><b>Колко остават на тази маса?</b></div>
          <label class="stage2-number">
            <button type="button" data-stage2-adjust="edit:-1">−</button>
            <input id="stage2NewQuantity" type="number" inputmode="decimal" min="0" step="1">
            <button type="button" data-stage2-adjust="edit:1">+</button>
          </label>
          <input id="stage2EditReason" class="small-input" placeholder="Причина: отказ, грешка, промяна…">
          <button type="button" class="btn primary full" id="stage2SaveQuantity">ЗАПАЗИ КОЛИЧЕСТВОТО</button>
        </section>

        <section class="stage2-section stage2-move">
          <div><small>ПРЕМЕСТИ</small><b>Премести неиздадени бройки към други гости</b></div>
          <label class="stage2-number">
            <button type="button" data-stage2-adjust="move:-1">−</button>
            <input id="stage2MoveQuantity" type="number" inputmode="decimal" min="1" step="1">
            <button type="button" data-stage2-adjust="move:1">+</button>
          </label>
          <select id="stage2TargetTable" class="small-input"></select>
          <input id="stage2MoveReason" class="small-input" placeholder="Причина за преместването…">
          <button type="button" class="btn yellow full" id="stage2MoveItem">ПРЕМЕСТИ И ИЗПРАТИ НОВА БЕЛЕЖКА</button>
          <p class="stage2-help">Издадените бройки остават на първата маса. Към другата маса се създава отделна ДОБАВКА.</p>
        </section>
      </form>`;
    document.body.appendChild(dialog);

    dialog.querySelectorAll('[data-stage2-adjust]').forEach(button => {
      button.onclick = () => {
        const [kind, deltaText] = button.dataset.stage2Adjust.split(':');
        const input = document.getElementById(kind === 'edit' ? 'stage2NewQuantity' : 'stage2MoveQuantity');
        const delta = Number(deltaText);
        const min = Number(input.min || 0);
        const max = input.max ? Number(input.max) : Number.POSITIVE_INFINITY;
        input.value = String(Math.max(min, Math.min(max, Number(input.value || 0) + delta)));
      };
    });
    document.getElementById('stage2SaveQuantity').onclick = saveQuantity;
    document.getElementById('stage2MoveItem').onclick = moveItem;
    return dialog;
  }

  function openDialog(itemId) {
    const item = itemFor(itemId);
    const order = orderForItem(itemId);
    if (!item || !order) return;
    current = {item, order};
    const dialog = ensureDialog();
    const delivered = Number(item.delivered_quantity || 0);
    const quantity = Number(item.quantity || 0);
    const remaining = Math.max(0, quantity - delivered);
    const targets = activeTargetOptions(order);

    document.getElementById('stage2Title').textContent = item.item_name;
    document.getElementById('stage2Source').textContent = sourceLabel(order);
    document.getElementById('stage2Summary').innerHTML = `
      <span>Поръчани <b>${quantity}</b></span>
      <span>Издадени <b>${delivered}</b></span>
      <span>Неиздадени <b>${remaining}</b></span>`;

    const editInput = document.getElementById('stage2NewQuantity');
    editInput.min = String(delivered);
    editInput.value = String(quantity);
    document.getElementById('stage2EditReason').value = '';

    const moveInput = document.getElementById('stage2MoveQuantity');
    moveInput.min = '1';
    moveInput.max = String(Math.max(1, remaining));
    moveInput.value = remaining > 0 ? '1' : '0';
    moveInput.disabled = remaining <= 0;

    const select = document.getElementById('stage2TargetTable');
    select.innerHTML = targets.length
      ? `<option value="">Избери област и маса…</option>${targets.map(({visit, table, area}) =>
          `<option value="${table.id}">${esc(area?.name || '')} · Маса ${esc(table.table_number)} · ${esc(visit.guest_label)}</option>`).join('')}`
      : '<option value="">Няма друга заета маса с активни гости</option>';
    select.disabled = !targets.length || remaining <= 0;
    document.getElementById('stage2MoveReason').value = '';
    document.getElementById('stage2MoveItem').disabled = !targets.length || remaining <= 0;
    dialog.showModal();
  }

  async function saveQuantity() {
    if (!current) return;
    const item = itemFor(current.item.id) || current.item;
    const order = orderForItem(item.id) || current.order;
    const quantity = Number(document.getElementById('stage2NewQuantity').value);
    const delivered = Number(item.delivered_quantity || 0);
    if (!Number.isFinite(quantity) || quantity < delivered) {
      return Z.toast(`Минимумът е ${delivered}, защото толкова вече са издадени.`, 'error');
    }
    if (quantity === Number(item.quantity || 0)) return Z.toast('Няма промяна.', 'error');
    const button = document.getElementById('stage2SaveQuantity');
    button.disabled = true;
    button.textContent = 'ЗАПИСВА…';
    try {
      await Z.rpc('zorbas_manager_edit_item_quantity_v1', {
        p_token: Z.token(),
        p_item_id: item.id,
        p_quantity: quantity,
        p_reason: document.getElementById('stage2EditReason').value || null,
        p_expected_version: Number(item.manager_version || 1),
        p_expected_revision: Number(order.revision || 1)
      });
      ensureDialog().close();
      Z.toast(quantity === 0 ? 'Продуктът е отказан и сметката е поправена.' : 'Количеството е променено.', 'success');
      await refresh();
      if (typeof switchView === 'function') switchView('manager');
    } catch (error) {
      Z.toast(error.message, 'error');
    } finally {
      button.disabled = false;
      button.textContent = 'ЗАПАЗИ КОЛИЧЕСТВОТО';
    }
  }

  async function moveItem() {
    if (!current) return;
    const item = itemFor(current.item.id) || current.item;
    const order = orderForItem(item.id) || current.order;
    const quantity = Number(document.getElementById('stage2MoveQuantity').value);
    const targetTable = document.getElementById('stage2TargetTable').value;
    const remaining = Math.max(0, Number(item.quantity || 0) - Number(item.delivered_quantity || 0));
    if (!targetTable) return Z.toast('Избери целева маса.', 'error');
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > remaining) {
      return Z.toast(`Можеш да преместиш от 1 до ${remaining} неиздадени бройки.`, 'error');
    }
    const button = document.getElementById('stage2MoveItem');
    button.disabled = true;
    button.textContent = 'ПРЕМЕСТВА…';
    try {
      const result = await Z.rpc('zorbas_manager_move_item_v1', {
        p_token: Z.token(),
        p_item_id: item.id,
        p_quantity: quantity,
        p_target_table_id: targetTable,
        p_reason: document.getElementById('stage2MoveReason').value || null,
        p_expected_version: Number(item.manager_version || 1),
        p_expected_revision: Number(order.revision || 1)
      });
      ensureDialog().close();
      Z.toast(`${quantity} × ${item.item_name} → Маса ${result.target_table}.`, 'success');
      await refresh();
      if (typeof switchView === 'function') switchView('manager');
    } catch (error) {
      Z.toast(error.message, 'error');
    } finally {
      button.disabled = false;
      button.textContent = 'ПРЕМЕСТИ И ИЗПРАТИ НОВА БЕЛЕЖКА';
    }
  }

  function decorateManager() {
    const board = document.getElementById('managerBoard');
    if (!board) return;
    board.querySelectorAll('.manager-item').forEach(row => {
      const itemButton = row.querySelector('[data-item]');
      const itemId = itemButton?.dataset.item;
      if (!itemId || row.querySelector('[data-stage2-edit]')) return;
      const item = itemFor(itemId);
      if (!item?.send_to_kitchen_snapshot || item.status === 'cancelled') return;
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'stage2-pencil';
      edit.dataset.stage2Edit = itemId;
      edit.title = 'Промени, откажи или премести';
      edit.setAttribute('aria-label', 'Редактирай продукта');
      edit.textContent = '✎';
      edit.onclick = event => {
        event.stopPropagation();
        openDialog(itemId);
      };
      row.querySelector('.manager-item-main')?.appendChild(edit);
    });
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      decorateManager();
    });
  }

  new MutationObserver(schedule).observe(document.body, {subtree: true, childList: true});
  document.addEventListener('click', event => {
    if (event.target.closest('[data-view="manager"], [data-manager-v2-view="manager"], [data-open-manager]')) setTimeout(schedule, 0);
  });
  schedule();
})();
