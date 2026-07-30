(() => {
  const Z = window.Zorbas;
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  let destination = params.get('destination') === 'kitchen' ? 'kitchen' : 'staff';
  let autoMode = params.get('auto') === '1' || localStorage.getItem(`zorbas_auto_print_${destination}`) === '1';
  let jobs = [];
  let timer = null;
  let printing = false;

  async function login(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    $('loginMessage').textContent = 'Влизане…';
    try {
      const data = await Z.rpc('zorbas_staff_login', {
        p_username: form.get('username'),
        p_password: form.get('password'),
        p_display_name: form.get('display_name'),
        p_device_id: Z.deviceId()
      });
      Z.setToken(data.token);
      await start();
    } catch (error) {
      $('loginMessage').textContent = error.message;
    }
  }

  function syncUrl() {
    const next = new URL(location.href);
    next.searchParams.set('destination', destination);
    next.searchParams.set('auto', autoMode ? '1' : '0');
    history.replaceState(null, '', next);
  }

  function updateControls(message = '') {
    document.querySelectorAll('[data-destination]').forEach(button => {
      button.classList.toggle('active', button.dataset.destination === destination);
    });
    const autoButton = $('autoButton');
    if (autoButton) {
      autoButton.textContent = autoMode ? '● AUTO ВКЛЮЧЕН' : '○ AUTO ИЗКЛЮЧЕН';
      autoButton.className = `btn ${autoMode ? 'green' : ''}`;
    }
    const status = $('bridgeStatus');
    if (status) {
      status.textContent = message || (autoMode
        ? `Атомарно слушане на ${destination === 'staff' ? 'Print 1' : 'Print 2'} през 1 секунда.`
        : 'Windows EXE печата автоматично. От телефона можеш да пуснеш безопасен TEST.');
    }
  }

  async function start() {
    const session = await Z.requireSession();
    if (!session) return;
    $('loginView').classList.add('hidden');
    $('appView').classList.remove('hidden');
    $('sessionName').textContent = `${session.display_name} · печатен мост v5`;
    syncUrl();
    updateControls();
    await refresh();
    clearInterval(timer);
    timer = setInterval(refresh, 1000);
  }

  async function refresh() {
    if (printing) return;
    try {
      jobs = await Z.rpc('zorbas_list_print_jobs_v4', {
        p_token: Z.token(),
        p_destination: destination
      });
      render();
      if (autoMode) {
        const next = jobs.find(job =>
          ['pending', 'retrying'].includes(job.status) &&
          Number(job.attempts || 0) < Number(job.max_attempts || 3));
        if (next) await printJob(next.id, true);
      }
    } catch (error) {
      updateControls(`Грешка при опресняване: ${error.message}`);
      Z.toast(error.message, 'error');
    }
  }

  function title(type) {
    return type === 'correction' ? 'КОРЕКЦИЯ / ПРОМЕНЕНО'
      : type === 'cancellation' ? 'ОТКАЗАНА ПОРЪЧКА'
      : type === 'bill' ? 'СМЕТКА'
      : type === 'pickup' ? 'ПАКЕТ · ЗА ВКЪЩИ'
      : type === 'addition' ? 'ДОБАВКА'
      : type === 'test' ? 'TEST ОТ ТЕЛЕФОНА'
      : 'ПОРЪЧКА';
  }

  function statusText(status) {
    return ({
      pending: 'ЧАКА', retrying: 'ПОВТОРЕН ОПИТ', claimed: 'ВЗЕТА',
      preparing: 'ПОДГОТОВКА', sending: 'ИЗПРАЩАНЕ', printing: 'ПЕЧАТА',
      printed: 'ОТПЕЧАТАНА', failed: 'ГРЕШКА', cancelled: 'ОТКАЗАНА'
    })[status] || String(status || '—').toUpperCase();
  }

  function correctionChanges(payload) {
    return (payload.changes || []).map(change => {
      const delta = Number(change.delta || 0);
      return `${delta > 0 ? '+' : ''}${delta}× ${Z.esc(change.name || 'Артикул')}`;
    }).join('<br>');
  }

  function render() {
    $('jobsList').innerHTML = jobs.length ? jobs.map(job => {
      const payload = job.payload || {};
      const attempts = Number(job.attempts || 0);
      const maxAttempts = Number(job.max_attempts || 3);
      const exhausted = attempts >= maxAttempts;
      const busy = ['claimed', 'preparing', 'sending', 'printing'].includes(job.status);
      const content = job.job_type === 'correction'
        ? `<b>ПРОМЕНЕНО</b><br>${correctionChanges(payload) || 'Няма описани промени'}<br><br><b>НОВО</b><br>${(payload.items || []).map(item => `${item.quantity}× ${Z.esc(item.name)}`).join('<br>')}`
        : job.job_type === 'test'
          ? '<b>TEST ОТ ТЕЛЕФОНА</b>'
          : (payload.items || []).map(item => `${item.quantity}× ${Z.esc(item.name)}`).join('<br>');
      return `<article class="order-card">
        <header><div><strong>${title(job.job_type)}</strong><small>${destination === 'staff' ? 'Print 1 · сервитьори / бар' : 'Print 2 · кухня'} · ${Z.formatDate(job.created_at)}</small></div><span class="badge ${job.status === 'failed' || exhausted ? 'cancelled' : ''}">${statusText(job.status)}</span></header>
        <div class="panel-body">
          <p><b>${job.job_type === 'test' ? 'БЕЗОПАСЕН ТЕСТ' : payload.order_type === 'pickup' ? 'ПАКЕТ' : `МАСА ${Z.esc(payload.table_number || '—')}`}</b> · №${Z.esc(payload.order_number || '—')}</p>
          <p>${content}</p><p><small>Опити: ${attempts}/${maxAttempts}</small></p>
          ${payload.reason ? `<p class="notice">ПРИЧИНА: ${Z.esc(payload.reason)}</p>` : ''}
          ${payload.cancel_reason ? `<p class="notice">ОТКАЗ: ${Z.esc(payload.cancel_reason)}</p>` : ''}
          ${payload.note || payload.order_note ? `<p class="notice">${Z.esc(payload.note || payload.order_note)}</p>` : ''}
          ${job.last_error ? `<p class="notice">ГРЕШКА: ${Z.esc(job.last_error)}</p>` : ''}
          <div class="toolbar"><button class="btn primary" data-print="${job.id}" ${busy || exhausted ? 'disabled' : ''}>${job.status === 'failed' ? 'ПОВТОРИ' : 'ПЕЧАТ'}</button><button class="btn red" data-fail="${job.id}" ${busy || exhausted ? 'disabled' : ''}>ОТБЕЛЕЖИ ГРЕШКА</button></div>
        </div>
      </article>`;
    }).join('') : '<div class="empty">Няма чакащи бележки.</div>';
    document.querySelectorAll('[data-print]').forEach(button => button.onclick = () => printJob(button.dataset.print, false));
    document.querySelectorAll('[data-fail]').forEach(button => button.onclick = () => markFailed(button.dataset.fail));
  }

  const rows = payload => (payload.items || []).map(item =>
    `<div><b>${item.quantity} × ${Z.esc(String(item.name || '').toUpperCase())}</b>${item.note ? `<br>БЕЛЕЖКА: ${Z.esc(String(item.note).toUpperCase())}` : ''}</div><br>`
  ).join('');

  function stationReceipt(job) {
    const p = job.payload || {};
    const stand = job.destination === 'kitchen' ? 'КУХНЯ' : 'БАР';
    return `<div class="receipt">
      <div>Щанд: <b>${stand}</b></div>
      <div>Маса: <b>${p.order_type === 'pickup' ? 'ПАКЕТ' : Z.esc(p.table_number || '—')}</b></div>
      <div>Оператор: ${Z.esc(p.actor || '—')}</div><hr>
      ${rows(p) || 'НЯМА АРТИКУЛИ'}<hr>
      <h2>НЕ СЕ ДЪЛЖИ ПЛАЩАНЕ</h2>
      <div class="receipt-row"><span>Номер</span><span>${Z.esc(p.order_number || '—')}</span></div>
      <div>Час: ${Z.formatDate(p.created_at || job.created_at)}</div>
    </div>`;
  }

  function billReceipt(job) {
    const p = job.payload || {};
    const sold = (p.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const itemRows = (p.items || []).map(item => {
      const qty = Number(item.quantity || 0);
      const price = Number(item.unit_price || 0);
      return `<div><b>${Z.esc(String(item.name || '').toUpperCase())}</b>
        <div class="receipt-row"><span>${qty} бр x ${price.toFixed(2)}</span><span>${(qty * price).toFixed(2)} Б</span></div></div><br>`;
    }).join('');
    return `<div class="receipt">
      <h2>"Н енд м" ЕООД</h2>
      <div style="text-align:center">ж.к. "Младост", бл. 5,<br>вх. В, ет. 5, ап. 14<br>Сливен</div>
      <div class="receipt-row"><span>Ид. №</span><span>206740575</span></div>
      <div>Дата: ${Z.formatDate(p.created_at || job.created_at)}</div>
      <div class="receipt-row"><span>${Z.esc(p.actor || '—')}</span><span>1</span></div>
      <div>Маса: ${Z.esc(p.table_number || '—')}</div><br>
      ${itemRows}
      <div>Общо продадени</div>
      <div class="receipt-row big"><span>артикули</span><span>${sold}</span></div>
      <div class="receipt-row big"><span>Total:</span><span>${Number(p.subtotal || 0).toFixed(2)}</span></div>
    </div>`;
  }

  function testReceipt(job) {
    const p = job.payload || {};
    const stand = job.destination === 'kitchen' ? 'КУХНЯ' : 'БАР';
    return `<div class="receipt"><div>Щанд: <b>${stand}</b></div><div>Маса: TEST</div>
      <div>Оператор: ${Z.esc(p.actor || 'ТЕЛЕФОН')}</div><hr>
      <h1>TEST ОТ ТЕЛЕФОНА</h1><h2>${job.destination === 'kitchen' ? 'PRINT 2 · КУХНЯ' : 'PRINT 1 · СЕРВИТЬОРИ'}</h2><hr>
      <h2>НЕ СЕ ДЪЛЖИ ПЛАЩАНЕ</h2>
      <div class="receipt-row"><span>Номер</span><span>${Z.esc(p.order_number || 'TEST')}</span></div>
      <div>Час: ${Z.formatDate(p.created_at || job.created_at)}</div></div>`;
  }

  function correctionReceipt(job) {
    const p = job.payload || {};
    const changes = (p.changes || []).map(change => {
      const delta = Number(change.delta || 0);
      return `<div class="big">${delta > 0 ? '+' : ''}${delta} × ${Z.esc(change.name || 'Артикул')}</div>`;
    }).join('');
    return `<div class="receipt"><h1>ZORBAS</h1><h2>КОРЕКЦИЯ / ПРОМЕНЕНО</h2><hr>
      <div class="big">МАСА ${Z.esc(p.table_number || '—')}</div>
      <div>Поръчка №${Z.esc(p.order_number || '—')} · версия ${Z.esc(p.revision || '—')}</div>
      <div>${Z.formatDate(p.created_at || job.created_at)}</div><hr><h2>ПРОМЕНЕНО</h2>
      ${changes || '<div>Няма описани промени.</div>'}<hr><h2>НОВО</h2>${rows(p) || '<div>Няма оставащи артикули.</div>'}
      ${p.reason ? `<hr><b>ПРИЧИНА:</b><br>${Z.esc(p.reason)}` : ''}</div>`;
  }

  function receipt(job) {
    if (job.job_type === 'correction') return correctionReceipt(job);
    if (job.job_type === 'test') return testReceipt(job);
    if (job.job_type === 'bill') return billReceipt(job);
    return stationReceipt(job);
  }

  async function claim(id) { return Z.rpc('zorbas_claim_print_job_v4', {p_token: Z.token(), p_job_id: id}); }
  async function ack(id, status, error = null) { return Z.rpc('zorbas_ack_print_job_v4', {p_token: Z.token(), p_job_id: id, p_status: status, p_error: error}); }

  async function createPhoneTest(route) {
    try {
      await Z.rpc('zorbas_create_test_print_job_v1', {
        p_token: Z.token(),
        p_destination: route
      });
      Z.toast(route === 'both' ? 'TEST е изпратен към двата принтера.' : 'TEST е изпратен към принтера.', 'success');
      await refresh();
    } catch (error) {
      Z.toast(error.message, 'error');
    }
  }

  async function markFailed(id) {
    if (printing) return;
    printing = true;
    let claimed = null;
    try {
      claimed = await claim(id);
      await ack(claimed.id, 'failed', 'Отбелязано ръчно');
      Z.toast('Задачата е отбелязана като грешка.', 'error');
    } catch (error) {
      Z.toast(error.message, 'error');
    } finally {
      printing = false;
      await refresh();
    }
  }

  async function printJob(id, automatic) {
    if (printing) return;
    printing = true;
    let claimed = null;
    const root = $('printRoot');
    try {
      claimed = await claim(id);
      root.innerHTML = receipt(claimed);
      root.style.display = 'block';
      await ack(claimed.id, 'preparing');
      updateControls(`Подготвя бележка №${claimed.payload?.order_number || '—'}…`);
      await ack(claimed.id, 'printing');
      updateControls(`Печата бележка №${claimed.payload?.order_number || '—'}…`);
      window.print();
      await ack(claimed.id, 'printed');
      if (!automatic) Z.toast('Бележката е отбелязана като отпечатана.', 'success');
    } catch (error) {
      if (claimed?.id) await ack(claimed.id, 'failed', error.message).catch(() => {});
      Z.toast(error.message, 'error');
    } finally {
      root.style.display = 'none';
      root.innerHTML = '';
      printing = false;
      updateControls();
      await refresh();
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    Z.registerPwa();
    $('loginForm').onsubmit = login;
    $('logoutButton').onclick = Z.logout;
    $('refreshButton').onclick = refresh;
    $('testStaffButton').onclick = () => createPhoneTest('staff');
    $('testKitchenButton').onclick = () => createPhoneTest('kitchen');
    $('testBothButton').onclick = () => createPhoneTest('both');
    $('autoButton').onclick = () => {
      autoMode = !autoMode;
      localStorage.setItem(`zorbas_auto_print_${destination}`, autoMode ? '1' : '0');
      syncUrl();
      updateControls();
      if (autoMode) refresh();
    };
    document.querySelectorAll('[data-destination]').forEach(button => {
      button.onclick = () => {
        destination = button.dataset.destination;
        autoMode = localStorage.getItem(`zorbas_auto_print_${destination}`) === '1';
        syncUrl();
        updateControls();
        refresh();
      };
    });
    start().catch(() => {});
  });
})();
