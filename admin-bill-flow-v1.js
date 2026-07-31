(() => {
  if (window.ZorbasBillFlowV1) return;
  window.ZorbasBillFlowV1 = true;

  const activeStatuses = new Set(['new','accepted','preparing','ready','served','open','active']);
  let decorating = false;
  let scheduled = false;

  const orders = () => (typeof snapshot !== 'undefined' && snapshot?.orders) ? snapshot.orders : [];
  const byNumber = number => orders().find(order => String(order.order_number) === String(number));
  const eligible = order => Boolean(order && order.order_type === 'dine_in' && order.table_id && order.manager_state !== 'completed' && !['completed','cancelled','returned'].includes(order.status));
  const money = value => (typeof Z !== 'undefined' && Z.money) ? Z.money(value) : `${Number(value || 0).toFixed(2)} лв.`;

  function numberFromCard(card) {
    const text = card.querySelector('header')?.textContent || card.textContent || '';
    return (text.match(/№\s*([^\s·]+)/) || [])[1] || '';
  }

  async function printBill(order, button) {
    if (!eligible(order)) {
      if (typeof Z !== 'undefined') Z.toast('Бележката не е активна или вече е приключена в Manager.','error');
      return;
    }
    button.disabled = true;
    const old = button.textContent;
    button.textContent = 'ИЗПРАЩА СЕ…';
    try {
      await Z.rpc('zorbas_print_bill_v3', {p_token: Z.token(), p_order_id: order.id});
      Z.toast(`Сметката за масата е изпратена към Print 1 · ${money(order.subtotal)}`,'success');
    } catch (error) {
      Z.toast(error.message,'error');
    } finally {
      button.disabled = false;
      button.textContent = old;
    }
  }

  function decorateMobileNotes() {
    document.querySelectorAll('.waiter-note-history').forEach(card => {
      const order = byNumber(numberFromCard(card));
      let actions = card.querySelector('.bill-flow-actions');
      const signature = order ? `${order.id}:${order.status}:${order.manager_state}:${order.subtotal}:${order.table_id}` : 'none';
      if (card.dataset.billFlowSignature === signature) return;
      card.dataset.billFlowSignature = signature;

      if (!actions) {
        actions = document.createElement('div');
        actions.className = 'bill-flow-actions';
        card.appendChild(actions);
      }

      if (eligible(order)) {
        actions.innerHTML = `<button type="button" class="bill-flow-button">СМЕТКА · ${money(order.subtotal)}</button><small>Печата се на Print 1. След приключване в Manager бутонът изчезва.</small>`;
        actions.querySelector('button').onclick = event => {
          event.stopPropagation();
          printBill(order, event.currentTarget);
        };
        card.classList.add('bill-flow-available');
      } else if (order?.manager_state === 'completed') {
        actions.innerHTML = '<small class="bill-flow-closed">✓ Приключена в Manager · сметка вече не може да се печата</small>';
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
      const canPrint = eligible(order);
      button.hidden = !canPrint;
      if (canPrint) button.textContent = `СМЕТКА · ${money(order.subtotal)}`;
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