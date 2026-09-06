(() => {
  'use strict';

  const SOFIA_TZ = 'Europe/Sofia';
  let loading = false;

  function dates(range) {
    const to = new Date();
    const from = new Date(to);
    if (range === 'today' || range === 'day') from.setHours(0, 0, 0, 0);
    else if (range === 'yesterday') {
      from.setDate(from.getDate() - 1);
      from.setHours(0, 0, 0, 0);
      to.setHours(0, 0, 0, 0);
    } else if (range === 'week') from.setDate(from.getDate() - 7);
    else if (range === 'month') from.setMonth(from.getMonth() - 1);
    else if (range === 'year') from.setFullYear(from.getFullYear() - 1);
    else if (range === '5years') from.setFullYear(from.getFullYear() - 5);
    else if (range === '10years') from.setFullYear(from.getFullYear() - 10);
    else from.setFullYear(from.getFullYear() - 50);
    return {from, to};
  }

  function ensureUi() {
    const content = document.getElementById('statsContent');
    if (!content) return;
    const toolbar = content.querySelector('[data-dashboard-range]')?.parentElement;
    if (toolbar && !toolbar.querySelector('[data-dashboard-range="5years"]')) {
      const all = toolbar.querySelector('[data-dashboard-range="all"]');
      const five = document.createElement('button');
      five.type = 'button';
      five.className = 'tab';
      five.dataset.dashboardRange = '5years';
      five.textContent = '5 години';
      const ten = document.createElement('button');
      ten.type = 'button';
      ten.className = 'tab';
      ten.dataset.dashboardRange = '10years';
      ten.textContent = '10 години';
      toolbar.insertBefore(five, all || null);
      toolbar.insertBefore(ten, all || null);
    }

    if (!document.getElementById('ownerWaiterStats')) {
      const section = document.createElement('section');
      section.id = 'ownerWaiterStats';
      section.className = 'panel';
      section.style.marginTop = '15px';
      section.innerHTML = `
        <div class="panel-head"><h4>По сервитьори</h4></div>
        <div class="table-scroll"><table class="data-table">
          <thead><tr><th>Сервитьор</th><th>Бележки</th><th>Артикули</th><th>Оборот</th><th>Средна бележка</th><th>Корекции</th><th>Отказани</th></tr></thead>
          <tbody id="statsWaiters"></tbody>
        </table></div>`;
      content.appendChild(section);
    }
  }

  function esc(value) {
    return typeof Z !== 'undefined' && Z?.esc ? Z.esc(value == null ? '' : String(value)) : String(value ?? '');
  }

  function money(value) {
    return typeof Z !== 'undefined' && Z?.money ? Z.money(Number(value || 0)) : Number(value || 0).toFixed(2);
  }

  function render(data) {
    const cards = [
      ['Поръчки', data.orders_count],
      ['Посещения', data.visits_count],
      ['Приключени бележки', data.completed_orders],
      ['Обща стойност', money(data.gross_total)],
      ['Чиста стойност', money(data.net_total)],
      ['Средна сметка', money(data.average_bill)],
      ['Корекции', data.corrections_count],
      ['На място', data.dine_in_count],
      ['За вкъщи', data.pickup_count]
    ];
    const cardsRoot = document.getElementById('statsCards');
    if (cardsRoot) cardsRoot.innerHTML = cards.map(([label, value]) => `<article class="stat"><small>${label}</small><strong>${value}</strong></article>`).join('');

    const tables = document.getElementById('statsDays');
    if (tables) tables.innerHTML = (data.tables || []).map(row => `<tr><td>Маса ${esc(row.table_number)}</td><td>${row.visits}</td><td>${row.occupied_minutes} мин.</td><td>${money(row.total)}</td></tr>`).join('');

    const items = document.getElementById('statsItems');
    if (items) items.innerHTML = (data.top_items || []).map(row => `<tr><td>${esc(row.item_name)}</td><td>${row.quantity}</td><td>${money(row.total)}</td></tr>`).join('');

    const hours = document.getElementById('statsHours');
    if (hours) hours.innerHTML = (data.by_hour || []).map(row => `<tr><td>${String(row.hour_key).padStart(2, '0')}:00</td><td>${row.orders}</td><td>${money(row.total)}</td></tr>`).join('');

    const waiters = document.getElementById('statsWaiters');
    if (waiters) waiters.innerHTML = (data.by_waiter || []).map(row => `<tr><td>${esc(row.waiter_name)}</td><td>${row.notes}</td><td>${row.item_quantity}</td><td>${money(row.total)}</td><td>${money(row.average_note)}</td><td>${row.corrections}</td><td>${row.cancelled_notes}</td></tr>`).join('') || '<tr><td colspan="7">Няма данни за сервитьори в периода.</td></tr>';
  }

  async function loadOwnerStats(range = 'today') {
    if (loading || !window.Zorbas?.token?.()) return;
    loading = true;
    try {
      const period = dates(range);
      const data = await Z.rpc('zorbas_admin_dashboard_v1', {
        p_token: Z.token(),
        p_from: period.from.toISOString(),
        p_to: period.to.toISOString()
      });
      render(data || {});
    } catch (error) {
      Z.toast(error.message, 'error');
    } finally {
      loading = false;
    }
  }

  function installHandlers() {
    ensureUi();
    document.getElementById('statsContent')?.addEventListener('click', event => {
      const button = event.target.closest('[data-dashboard-range]');
      if (!button) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      document.querySelectorAll('[data-dashboard-range]').forEach(entry => entry.classList.toggle('active', entry === button));
      loadOwnerStats(button.dataset.dashboardRange);
    }, true);

    if (typeof loadStats === 'function') {
      loadStats = range => loadOwnerStats(range === 'day' ? 'today' : range);
      window.loadStats = loadStats;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installHandlers, {once:true});
  else installHandlers();

  void SOFIA_TZ;
})();
