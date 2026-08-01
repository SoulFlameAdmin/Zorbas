(() => {
  'use strict';

  if (window.ZorbasManagerActiveFinal) return;
  window.ZorbasManagerActiveFinal = true;

  let scheduled = false;
  let decorating = false;

  const orders = () => (typeof snapshot !== 'undefined' && snapshot?.orders) ? snapshot.orders : [];
  const activeOrders = () => orders().filter(order => order.manager_state !== 'completed' && !['completed', 'cancelled', 'returned'].includes(order.status));

  function orderNumberFromCard(card) {
    const text = card.querySelector('.manager-order-head b')?.textContent || '';
    return (text.match(/№\s*([^\s·]+)/) || [])[1] || '';
  }

  function orderForCard(card) {
    const number = orderNumberFromCard(card);
    return orders().find(order => String(order.order_number) === String(number)) || null;
  }

  function formatTime(value) {
    if (!value) return '—';
    return new Date(value).toLocaleTimeString('bg-BG', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Sofia'
    });
  }

  function money(value) {
    if (typeof Z !== 'undefined' && Z?.money) return Z.money(value || 0);
    return `${Number(value || 0).toFixed(2)} лв.`;
  }

  function ensureSummary() {
    const toolbar = document.querySelector('#view-manager .manager-toolbar');
    if (!toolbar) return;

    let summary = toolbar.querySelector('.manager-active-summary');
    if (!summary) {
      summary = document.createElement('div');
      summary.className = 'manager-active-summary';
      const search = toolbar.querySelector('.search');
      if (search) search.insertAdjacentElement('beforebegin', summary);
      else toolbar.appendChild(summary);
    }

    const allItems = activeOrders().flatMap(order => order.items || []).filter(item => item.status !== 'cancelled');
    const newCount = allItems.filter(item => (item.manager_state || 'new') === 'new').length;
    const workingCount = allItems.filter(item => ['assigned', 'sent'].includes(item.manager_state)).length;
    const deliveredCount = allItems.filter(item => item.manager_state === 'delivered').length;
    const signature = `${newCount}|${workingCount}|${deliveredCount}`;

    if (summary.dataset.signature !== signature) {
      summary.dataset.signature = signature;
      summary.innerHTML = `
        <article class="is-new"><small>НОВИ</small><b>${newCount}</b></article>
        <article class="is-working"><small>В ПРОЦЕС</small><b>${workingCount}</b></article>
        <article class="is-done"><small>ИЗДАДЕНИ</small><b>${deliveredCount}</b></article>`;
    }
  }

  function decorateReceipts() {
    document.querySelectorAll('#view-manager .manager-order').forEach(card => {
      const order = orderForCard(card);
      if (!order) return;

      const items = (order.items || []).filter(item => item.status !== 'cancelled');
      const allDelivered = items.length > 0 && items.every(item => item.manager_state === 'delivered');
      card.classList.toggle('is-all-delivered', allDelivered);

      let meta = card.querySelector('.manager-receipt-meta');
      if (!meta) {
        meta = document.createElement('div');
        meta.className = 'manager-receipt-meta';
        card.querySelector('.manager-order-head')?.insertAdjacentElement('afterend', meta);
      }

      const createdBy = order.created_by_name || 'Сервитьор';
      const itemCount = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
      const metaSignature = `${order.created_at}|${createdBy}|${itemCount}`;
      if (meta.dataset.signature !== metaSignature) {
        meta.dataset.signature = metaSignature;
        meta.innerHTML = `
          <span><small>ЧАС</small><b>${formatTime(order.created_at)}</b></span>
          <span><small>СЕРВИТЬОР</small><b>${createdBy}</b></span>
          <span><small>ПОЗИЦИИ</small><b>${itemCount}</b></span>`;
      }

      let total = card.querySelector('.manager-receipt-total');
      if (!total) {
        total = document.createElement('div');
        total.className = 'manager-receipt-total';
        const footer = card.querySelector(':scope > footer');
        if (footer) footer.insertAdjacentElement('beforebegin', total);
        else card.appendChild(total);
      }
      const totalText = money(order.subtotal);
      if (total.dataset.value !== totalText) {
        total.dataset.value = totalText;
        total.innerHTML = `<span>ОБЩО</span><strong>${totalText}</strong>`;
      }
    });
  }

  function markManagerPage() {
    const managerVisible = document.getElementById('view-manager')?.classList.contains('active');
    document.body.classList.toggle('manager-active-page', Boolean(managerVisible));
  }

  function decorate() {
    scheduled = false;
    if (decorating) return;
    decorating = true;
    try {
      markManagerPage();
      ensureSummary();
      decorateReceipts();
    } finally {
      decorating = false;
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(decorate);
  }

  document.addEventListener('click', event => {
    const main = event.target.closest('#view-manager .manager-item-main');
    if (!main) return;
    if (event.target.closest('button,input,select,textarea,a')) return;
    const check = main.querySelector('.manager-v2-check');
    if (check && !check.disabled) check.click();
  });

  new MutationObserver(schedule).observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'disabled']
  });

  window.addEventListener('pageshow', schedule);
  window.addEventListener('resize', schedule);
  schedule();
})();
