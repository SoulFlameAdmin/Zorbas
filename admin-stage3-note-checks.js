(() => {
  if (window.ZorbasStage3NoteChecks) return;
  window.ZorbasStage3NoteChecks = true;

  let currentOrderId = null;
  let editMode = false;
  let saving = false;
  const draft = new Map();

  const snap = () => (typeof snapshot !== 'undefined' ? snapshot : null);
  const orders = () => snap()?.orders || [];
  const tables = () => snap()?.tables || [];
  const areas = () => snap()?.areas || [];
  const visits = () => snap()?.visits || [];
  const esc = value => Z.esc(value == null ? '' : String(value));

  function orderFor(id) {
    return orders().find(order => order.id === id) || null;
  }

  function tableFor(id) {
    return tables().find(table => table.id === id) || null;
  }

  function areaFor(id) {
    return areas().find(area => area.id === id) || null;
  }

  function visitFor(id) {
    return visits().find(visit => visit.id === id) || null;
  }

  function issuedQuantity(item) {
    const service = Number(item.service_delivered_quantity || 0);
    if (service > 0 || Object.prototype.hasOwnProperty.call(item, 'service_delivered_quantity')) return service;
    return item.send_to_kitchen_snapshot ? Number(item.delivered_quantity || 0) : 0;
  }

  function isIssued(item) {
    const quantity = Number(item.quantity || 0);
    return item.status !== 'cancelled' && quantity > 0 && issuedQuantity(item) >= quantity;
  }

  function lineTotal(item) {
    return Number(item.quantity || 0) * Number(item.unit_price || 0);
  }

  function orderTotal(order) {
    return (order?.items || [])
      .filter(item => item.status !== 'cancelled')
      .reduce((sum, item) => sum + lineTotal(item), 0);
  }

  function ensureDialog() {
    let dialog = document.getElementById('stage3NoteDetailDialog');
    if (dialog) return dialog;

    dialog = document.createElement('dialog');
    dialog.id = 'stage3NoteDetailDialog';
    dialog.className = 'stage3-note-detail-dialog';
    dialog.innerHTML = `
      <section class="stage3-note-detail-card">
        <header class="stage3-note-detail-head">
          <div>
            <small id="stage3NoteKind">БЕЛЕЖКА</small>
            <h3 id="stage3NoteTitle">Бележка</h3>
            <p id="stage3NoteMeta"></p>
          </div>
          <button type="button" class="stage3-note-close" data-stage3-note-close aria-label="Затвори">×</button>
        </header>
        <div class="stage3-note-detail-summary" id="stage3NoteSummary"></div>
        <div class="stage3-note-detail-items" id="stage3NoteItems"></div>
        <footer class="stage3-note-detail-footer" id="stage3NoteFooter"></footer>
      </section>`;
    document.body.appendChild(dialog);

    dialog.addEventListener('click', event => {
      if (event.target === dialog || event.target.closest('[data-stage3-note-close]')) {
        dialog.close();
        return;
      }

      const edit = event.target.closest('[data-stage3-note-edit]');
      if (edit) {
        editMode = true;
        fillDraft();
        renderDialog();
        return;
      }

      const cancel = event.target.closest('[data-stage3-note-cancel-edit]');
      if (cancel) {
        editMode = false;
        draft.clear();
        renderDialog();
        return;
      }

      const quantityEdit = event.target.closest('[data-stage3-note-quantity-edit]');
      if (quantityEdit) {
        const orderId = quantityEdit.dataset.stage3NoteQuantityEdit;
        dialog.close();
        setTimeout(() => document.querySelector(`[data-stage3-edit-order="${CSS.escape(orderId)}"]`)?.click(), 0);
        return;
      }

      const check = event.target.closest('[data-stage3-service-check]');
      if (check && editMode && !saving) {
        const itemId = check.dataset.stage3ServiceCheck;
        draft.set(itemId, !draft.get(itemId));
        renderDialog();
        return;
      }

      if (event.target.closest('[data-stage3-note-save]')) saveDeliveryChecks();
    });

    return dialog;
  }

  function fillDraft() {
    draft.clear();
    const order = orderFor(currentOrderId);
    (order?.items || []).forEach(item => {
      if (item.status !== 'cancelled') draft.set(item.id, isIssued(item));
    });
  }

  function openDialog(orderId) {
    const order = orderFor(orderId);
    if (!order) return Z.toast('Бележката не е намерена.', 'error');
    currentOrderId = orderId;
    editMode = false;
    saving = false;
    draft.clear();
    renderDialog();
    ensureDialog().showModal();
  }

  function itemStatus(item, checked) {
    if (item.status === 'cancelled') return '<span class="stage3-note-item-status cancelled">ОТКАЗАНО</span>';
    const quantity = Number(item.quantity || 0);
    const issued = issuedQuantity(item);
    if (checked) return '<span class="stage3-note-item-status issued">ИЗДАДЕНО</span>';
    if (issued > 0) return `<span class="stage3-note-item-status partial">${issued}/${quantity} ИЗДАДЕНИ</span>`;
    return `<span class="stage3-note-item-status waiting">${item.send_to_kitchen_snapshot ? 'ЧАКА КУХНЯ' : 'БАР · ЧАКА'}</span>`;
  }

  function renderDialog() {
    const dialog = ensureDialog();
    const order = orderFor(currentOrderId);
    if (!order) {
      dialog.close();
      return;
    }

    const table = tableFor(order.table_id);
    const area = areaFor(table?.area_id);
    const visit = visitFor(order.visit_id);
    const kind = order.order_kind === 'addition' || Number(order.visit_sequence || 1) > 1 ? 'ДОБАВКА' : 'НОВА';
    const time = new Date(order.created_at).toLocaleTimeString('bg-BG', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Sofia'
    });
    const activeItems = (order.items || []).filter(item => item.status !== 'cancelled');
    const issuedLines = activeItems.filter(isIssued).length;

    dialog.querySelector('#stage3NoteKind').textContent = kind;
    dialog.querySelector('#stage3NoteTitle').textContent = `Бележка №${order.order_number}`;
    dialog.querySelector('#stage3NoteMeta').textContent = `${area?.name || ''} · Маса ${table?.table_number || '—'} · ${visit?.guest_label || ''} · ${time}`;
    dialog.querySelector('#stage3NoteSummary').innerHTML = `
      <span><b>${activeItems.length}</b> продукта</span>
      <span><b>${issuedLines}</b> издадени</span>
      <span><b>${Z.money(orderTotal(order))}</b></span>`;

    dialog.querySelector('#stage3NoteItems').innerHTML = (order.items || []).map(item => {
      const cancelled = item.status === 'cancelled';
      const checked = editMode ? Boolean(draft.get(item.id)) : isIssued(item);
      return `<article class="stage3-note-detail-item ${checked ? 'is-issued' : ''} ${cancelled ? 'is-cancelled' : ''}">
        <button type="button" class="stage3-service-check ${checked ? 'checked' : ''}"
          data-stage3-service-check="${item.id}"
          ${!editMode || cancelled ? 'disabled' : ''}
          aria-label="${checked ? 'Маркирано като издадено' : 'Маркирай като издадено'}">
          ${checked ? '✓' : ''}
        </button>
        <div class="stage3-note-item-name">
          <b>${Number(item.quantity || 0)} × ${esc(item.item_name)}</b>
          ${item.note ? `<small>${esc(item.note)}</small>` : ''}
          <small>${Z.money(lineTotal(item))}</small>
        </div>
        ${itemStatus(item, checked)}
      </article>`;
    }).join('');

    dialog.querySelector('#stage3NoteFooter').innerHTML = editMode
      ? `<button type="button" class="btn" data-stage3-note-cancel-edit ${saving ? 'disabled' : ''}>ОТКАЗ</button>
         <button type="button" class="btn green" data-stage3-note-save ${saving ? 'disabled' : ''}>${saving ? 'ЗАПАЗВА…' : 'ЗАПАЗИ ОТБЕЛЯЗВАНЕТО'}</button>`
      : `<button type="button" class="btn" data-stage3-note-quantity-edit="${order.id}">КОЛИЧЕСТВА / ОТКАЗ</button>
         <button type="button" class="btn primary" data-stage3-note-edit>РЕДАКТИРАЙ · ОТБЕЛЕЖИ</button>`;
  }

  async function saveDeliveryChecks() {
    const order = orderFor(currentOrderId);
    if (!order || saving) return;

    const changed = (order.items || []).filter(item =>
      item.status !== 'cancelled' && Boolean(draft.get(item.id)) !== isIssued(item)
    );
    if (!changed.length) {
      editMode = false;
      draft.clear();
      renderDialog();
      return Z.toast('Няма промяна.', 'error');
    }

    saving = true;
    renderDialog();
    try {
      for (const item of changed) {
        await Z.rpc('zorbas_set_service_item_delivered_v1', {
          p_token: Z.token(),
          p_item_id: item.id,
          p_delivered: Boolean(draft.get(item.id)),
          p_expected_version: Number(item.manager_version || 1)
        });
      }
      Z.toast('Продуктите в бележката са обновени.', 'success');
      await refresh();
      editMode = false;
      draft.clear();
      renderDialog();
    } catch (error) {
      Z.toast(error.message, 'error');
    } finally {
      saving = false;
      renderDialog();
    }
  }

  function decorateCards() {
    document.querySelectorAll('.stage3-order-block').forEach(card => {
      const editButton = card.querySelector('[data-stage3-edit-order]');
      const orderId = editButton?.dataset.stage3EditOrder;
      if (!orderId) return;

      card.dataset.stage3OrderDetail = orderId;
      card.classList.add('stage3-note-clickable');
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `Отвори бележка ${orderId}`);

      const order = orderFor(orderId);
      const activeItems = (order?.items || []).filter(item => item.status !== 'cancelled');
      const issuedLines = activeItems.filter(isIssued).length;
      let count = card.querySelector('.stage3-note-issued-count');
      if (!count) {
        count = document.createElement('span');
        count.className = 'stage3-note-issued-count';
        card.querySelector('header > div')?.appendChild(count);
      }
      count.textContent = `${issuedLines}/${activeItems.length} издадени`;
    });
  }

  document.addEventListener('click', event => {
    const card = event.target.closest('.stage3-order-block[data-stage3-order-detail]');
    if (!card) return;
    if (event.target.closest('button, input, select, textarea, a')) return;
    event.preventDefault();
    event.stopPropagation();
    openDialog(card.dataset.stage3OrderDetail);
  }, true);

  document.addEventListener('keydown', event => {
    const card = event.target.closest?.('.stage3-order-block[data-stage3-order-detail]');
    if (!card || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    openDialog(card.dataset.stage3OrderDetail);
  });

  let scheduled = false;
  function scheduleDecorate() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      decorateCards();
    });
  }

  new MutationObserver(scheduleDecorate).observe(document.body, {subtree: true, childList: true});
  scheduleDecorate();
})();