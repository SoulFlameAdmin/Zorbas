(() => {
  'use strict';

  if (window.ZorbasWaiterNoteFinal) return;
  window.ZorbasWaiterNoteFinal = true;

  let scheduled = false;
  let lastSignature = '';

  const snap = () => (typeof snapshot !== 'undefined' ? snapshot : null);

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

  function visitIsFullyIssued(visitId) {
    if (!visitId) return false;

    const activeItems = (snap()?.orders || [])
      .filter(order => order.visit_id === visitId)
      .filter(order => !['cancelled', 'returned'].includes(order.status))
      .flatMap(order => order.items || [])
      .filter(item => item.status !== 'cancelled' && Number(item.quantity || 0) > 0);

    return activeItems.length > 0 && activeItems.every(isIssued);
  }

  function ensureButton() {
    let button = document.getElementById('waiterFixedBill');
    if (button) return button;

    button = document.createElement('button');
    button.id = 'waiterFixedBill';
    button.type = 'button';
    button.className = 'waiter-fixed-bill';
    button.hidden = true;
    button.setAttribute('aria-label', 'Принт на сметка');
    button.innerHTML = `
      <span class="wfb-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none"><path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v7H7v-7Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M17.5 11.5h.01" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
      </span>
      <span class="wfb-copy"><b>ПРИНТ СМЕТКА</b><small></small></span>`;

    button.addEventListener('click', () => {
      if (button.hidden || button.disabled) return;
      const source = document.querySelector('.stage3-bill-button[data-stage3-close-bill]');
      if (!source || source.disabled) return;
      source.click();
    });

    document.body.appendChild(button);
    return button;
  }

  function sync() {
    scheduled = false;

    const mobile = window.matchMedia('(max-width:650px)').matches;
    const notePage = mobile && Boolean(document.querySelector('.stage3-waiter-notepad'));
    document.body.classList.toggle('waiter-note-page-active', notePage);

    const button = ensureButton();
    const source = notePage
      ? document.querySelector('.stage3-bill-button[data-stage3-close-bill]')
      : null;
    const visitId = source?.dataset.stage3CloseBill || '';
    const fullyIssued = notePage && visitIsFullyIssued(visitId);
    const visible = Boolean(source && fullyIssued);

    button.hidden = !visible;
    document.body.classList.toggle('waiter-bill-visible', visible);

    if (!visible) {
      button.disabled = true;
      lastSignature = '';
      return;
    }

    const total = source.querySelector('b')?.textContent?.trim() || '';
    const disabled = Boolean(source.disabled);
    const signature = `${visitId}|${total}|${disabled}`;

    if (signature !== lastSignature) {
      lastSignature = signature;
      button.disabled = disabled;
      button.classList.remove('waiting');
      button.querySelector('.wfb-copy b').textContent = 'ПРИНТ СМЕТКА';
      button.querySelector('.wfb-copy small').textContent = total;
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(sync);
  }

  new MutationObserver(schedule).observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['disabled', 'class', 'hidden']
  });

  window.addEventListener('pageshow', schedule);
  window.addEventListener('resize', schedule);
  schedule();
})();