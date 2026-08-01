(() => {
  'use strict';

  if (window.ZorbasWaiterReceiptsFinal) return;
  window.ZorbasWaiterReceiptsFinal = true;

  const busy = new Set();
  let scheduled = false;

  const orders = () => (typeof snapshot !== 'undefined' && snapshot?.orders) ? snapshot.orders : [];
  const orderFor = id => orders().find(order => order.id === id) || null;

  function issuedQuantity(item) {
    if (Object.prototype.hasOwnProperty.call(item, 'service_delivered_quantity')) {
      return Number(item.service_delivered_quantity || 0);
    }
    return item.send_to_kitchen_snapshot ? Number(item.delivered_quantity || 0) : 0;
  }

  function isIssued(item) {
    const quantity = Number(item.quantity || 0);
    return item.status !== 'cancelled' && quantity > 0 && issuedQuantity(item) >= quantity;
  }

  function isReceiptComplete(order) {
    const activeItems = (order?.items || []).filter(item => item.status !== 'cancelled');
    return activeItems.length > 0 && activeItems.every(isIssued);
  }

  function decorate() {
    scheduled = false;

    document.querySelectorAll('body.waiter-note-page-active .stage3-order-block[data-stage3-order-detail]').forEach(card => {
      const order = orderFor(card.dataset.stage3OrderDetail);
      if (!order) return;

      const receiptComplete = isReceiptComplete(order);
      card.classList.add('waiter-receipt-card');
      card.classList.toggle('waiter-receipt-complete', receiptComplete);
      card.classList.toggle('waiter-receipt-pending', !receiptComplete);
      card.dataset.waiterReceiptComplete = String(receiptComplete);

      const total = card.querySelector(':scope > footer b');
      if (total) {
        total.setAttribute('aria-hidden', receiptComplete ? 'false' : 'true');
        total.title = receiptComplete
          ? 'Всички продукти са издадени.'
          : 'Сумата ще се покаже, когато всички продукти са издадени.';
      }

      const rows = [...card.querySelectorAll(':scope > div > p')];

      rows.forEach((row, index) => {
        const item = (order.items || [])[index];
        if (!item) return;

        const cancelled = item.status === 'cancelled';
        const issued = isIssued(item);
        const partial = !cancelled && !issued && issuedQuantity(item) > 0;

        row.dataset.waiterReceiptItem = item.id;
        row.classList.toggle('waiter-receipt-issued', issued);
        row.classList.toggle('waiter-receipt-cancelled', cancelled);
        row.classList.toggle('waiter-receipt-partial', partial);

        let toggle = row.querySelector(':scope > .waiter-receipt-toggle');
        if (!toggle) {
          toggle = document.createElement('button');
          toggle.type = 'button';
          toggle.className = 'waiter-receipt-toggle';
          row.prepend(toggle);
        }

        toggle.dataset.waiterReceiptItem = item.id;
        toggle.dataset.waiterReceiptOrder = order.id;
        toggle.disabled = cancelled || busy.has(item.id);
        toggle.classList.toggle('checked', issued);
        toggle.classList.toggle('partial', partial);
        toggle.setAttribute('aria-label', cancelled
          ? 'Отказан продукт'
          : issued
            ? 'Върни продукта като неиздаден'
            : 'Маркирай продукта като издаден');
        toggle.innerHTML = `<span>${issued ? '✓' : partial ? '•' : ''}</span>`;
      });
    });
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(decorate);
  }

  document.addEventListener('click', async event => {
    const toggle = event.target.closest('.waiter-receipt-toggle[data-waiter-receipt-item]');
    if (!toggle) return;

    event.preventDefault();
    event.stopPropagation();

    const order = orderFor(toggle.dataset.waiterReceiptOrder);
    const item = order?.items?.find(entry => entry.id === toggle.dataset.waiterReceiptItem);
    if (!item || item.status === 'cancelled' || busy.has(item.id)) return;

    busy.add(item.id);
    toggle.disabled = true;
    toggle.classList.add('saving');

    try {
      await Z.rpc('zorbas_set_service_item_delivered_v1', {
        p_token: Z.token(),
        p_item_id: item.id,
        p_delivered: !isIssued(item),
        p_expected_version: Number(item.manager_version || 1)
      });
      await refresh();
    } catch (error) {
      Z.toast(error.message, 'error');
    } finally {
      busy.delete(item.id);
      schedule();
    }
  });

  new MutationObserver(schedule).observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class']
  });

  window.addEventListener('pageshow', schedule);
  schedule();
})();