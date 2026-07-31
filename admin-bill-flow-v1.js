(() => {
  if (window.ZorbasBillFlowV1) return;
  window.ZorbasBillFlowV1 = true;

  let decorating = false;
  let scheduled = false;
  const orders = () => (typeof snapshot !== 'undefined' && snapshot?.orders) ? snapshot.orders : [];
  const visits = () => (typeof snapshot !== 'undefined' && snapshot?.visits) ? snapshot.visits : [];
  const byNumber = number => orders().find(order => String(order.order_number) === String(number));
  const visitFor = id => visits().find(visit => visit.id === id) || null;
  const visitOrders = visitId => orders().filter(order => order.visit_id === visitId && !['cancelled','returned'].includes(order.status));
  const visitTotal = visitId => visitOrders(visitId).reduce((total, order) => total + (order.items || [])
    .filter(item => item.status !== 'cancelled')
    .reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_price || 0), 0), 0);
  const eligible = order => {
    const visit = visitFor(order?.visit_id);
    return Boolean(order && visit && order.order_type === 'dine_in' && order.table_id && visit.status === 'active' && !['paid','cancelled'].includes(visit.bill_status));
  };
  const money = value => (typeof Z !== 'undefined' && Z.money) ? Z.money(value) : `${Number(value || 0).toFixed(2)} лв.`;

  function numberFromCard(card) {
    const text = card.querySelector('header')?.textContent || card.textContent || '';
    return (text.match(/№\s*([^\s·]+)/) || [])[1] || '';
  }

  async function printBill(order, button) {
    const visit = visitFor(order?.visit_id);
    if (!eligible(order) || !visit) {
      Z.toast('Тези гости вече са приключени или масата не е активна.', 'error');
      return;
    }
    button.disabled = true;
    const old = button.textContent;
    button.textContent = 'ИЗПРАЩА СЕ…';
    try {
      const result = await Z.rpc('zorbas_print_visit_bill_v1', {p_token: Z.token(), p_visit_id: visit.id});
      Z.toast(`Сметката за ${visit.guest_label} е изпратена към Print 1 · ${money(result.subtotal)}`, 'success');
      await refresh();
    } catch (error) {
      Z.toast(error.message, 'error');
      button.disabled = false;
      button.textContent = old;
    }
  }

  function decorateMobileNotes() {
    document.querySelectorAll('.waiter-note-history').forEach(card => {
      const order = byNumber(numberFromCard(card));
      const visit = visitFor(order?.visit_id);
      let actions = card.querySelector('.bill-flow-actions');
      const signature = order && visit ? `${order.id}:${visit.status}:${visit.bill_status}:${visit.bill_print_count}:${visitTotal(visit.id)}` : 'none';
      if (card.dataset.billFlowSignature === signature) return;
      card.dataset.billFlowSignature = signature;

      if (!actions) {
        actions = document.createElement('div');
        actions.className = 'bill-flow-actions';
        card.appendChild(actions);
      }

      if (eligible(order)) {
        const total = visitTotal(visit.id);
        actions.innerHTML = `<button type="button" class="bill-flow-button">СМЕТКА · ${money(total)}</button><small>Събира всички поръчки на ${visit.guest_label}. Manager приключва само кухнята.</small>`;
        actions.querySelector('button').onclick = event => {
          event.stopPropagation();
          printBill(order, event.currentTarget);
        };
        card.classList.add('bill-flow-available');
      } else if (visit && visit.status !== 'active') {
        actions.innerHTML = '<small class="bill-flow-closed">✓ Гостите са приключени · сметката е заключена</small>';
        card.classList.remove('bill-flow-available');
      } else {
        actions.remove();
        card.classList.remove('bill-flow-available','bill-flow-open');
        return;
      }

      const header = card.querySelector('header');
      if (header && header.dataset.billFlowBound !== '1') {
        header.dataset.billFlowBound = '1';
        header.onclick = () => card.classList.toggle('bill-flow-open');
      }
    });
  }

  function decorateManagementNotes() {
    document.querySelectorAll('.note-card [data-bill]').forEach(button => {
      const order = orders().find(entry => entry.id === button.dataset.bill);
      const visit = visitFor(order?.visit_id);
      const canPrint = eligible(order);
      button.hidden = !canPrint;
      if (canPrint) {
        button.textContent = `СМЕТКА ЗА ${visit.guest_label.toUpperCase()} · ${money(visitTotal(visit.id))}`;
        button.onclick = event => printBill(order, event.currentTarget);
      }
    });
  }

  function decorate() {
    if (decorating) return;
    decorating = true;
    try {
      decorateMobileNotes();
      decorateManagementNotes();
    } finally {
      decorating = false;
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      decorate();
    });
  }

  new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
  document.addEventListener('click', event => {
    const card = event.target.closest('.waiter-note-history.bill-flow-available');
    if (card && !event.target.closest('button')) card.classList.toggle('bill-flow-open');
  });
  schedule();
})();
