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
    const f = new FormData(event.currentTarget);
    $('loginMessage').textContent = 'Влизане…';
    try {
      const data = await Z.rpc('zorbas_staff_login', {
        p_username: f.get('username'),
        p_password: f.get('password'),
        p_display_name: f.get('display_name'),
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

  function updateControls() {
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
      status.textContent = autoMode
        ? `Слуша ${destination === 'staff' ? 'Print 1' : 'Print 2'} през 1 секунда.`
        : 'Ръчен режим — натисни ПЕЧАТ.';
    }
  }

  async function start() {
    const session = await Z.requireSession();
    if (!session) return;
    $('loginView').classList.add('hidden');
    $('appView').classList.remove('hidden');
    $('sessionName').textContent = `${session.display_name} · печатен мост`;
    syncUrl();
    updateControls();
    await refresh();
    clearInterval(timer);
    timer = setInterval(refresh, 1000);
  }

  async function refresh() {
    if (printing) return;
    try {
      jobs = await Z.rpc('zorbas_list_print_jobs_v3', {
        p_token: Z.token(),
        p_destination: destination
      });
      render();
      if (autoMode) {
        const next = jobs.find(job => job.status === 'pending');
        if (next) await printJob(next.id, true);
      }
    } catch (error) {
      Z.toast(error.message, 'error');
    }
  }

  function title(type) {
    return type === 'cancellation' ? 'ОТКАЗАНА ПОРЪЧКА'
      : type === 'bill' ? 'СМЕТКА'
      : type === 'pickup' ? 'ПАКЕТ · ЗА ВКЪЩИ'
      : type === 'addition' ? 'ДОБАВКА'
      : 'ПОРЪЧКА';
  }

  function render() {
    $('jobsList').innerHTML = jobs.length ? jobs.map(job => {
      const payload = job.payload || {};
      return `<article class="order-card">
        <header>
          <div>
            <strong>${title(job.job_type)}</strong>
            <small>${destination === 'staff' ? 'Print 1 · сервитьори' : 'Print 2 · кухня'} · ${Z.formatDate(job.created_at)}</small>
          </div>
          <span class="badge ${job.status === 'failed' ? 'cancelled' : ''}">${job.status}</span>
        </header>
        <div class="panel-body">
          <p><b>${payload.order_type === 'pickup' ? 'ПАКЕТ' : `МАСА ${Z.esc(payload.table_number || '—')}`}</b> · №${Z.esc(payload.order_number || '—')}</p>
          <p>${(payload.items || []).map(item => `${item.quantity}× ${Z.esc(item.name)}`).join('<br>')}</p>
          ${payload.cancel_reason ? `<p class="notice">ОТКАЗ: ${Z.esc(payload.cancel_reason)}</p>` : ''}
          ${payload.note || payload.order_note ? `<p class="notice">${Z.esc(payload.note || payload.order_note)}</p>` : ''}
          <div class="toolbar">
            <button class="btn primary" data-print="${job.id}">ПЕЧАТ</button>
            <button class="btn red" data-fail="${job.id}">ОТБЕЛЕЖИ ГРЕШКА</button>
          </div>
        </div>
      </article>`;
    }).join('') : '<div class="empty">Няма чакащи бележки.</div>';

    document.querySelectorAll('[data-print]').forEach(button => {
      button.onclick = () => printJob(button.dataset.print, false);
    });
    document.querySelectorAll('[data-fail]').forEach(button => {
      button.onclick = () => ack(button.dataset.fail, 'failed', 'Отбелязано ръчно');
    });
  }

  function receipt(job) {
    const payload = job.payload || {};
    const staff = destination === 'staff';
    const rows = (payload.items || []).map(item => `
      <div>
        <b>${item.quantity} × ${Z.esc(item.name)}</b>
        ${item.note ? `<br>Бележка: ${Z.esc(item.note)}` : ''}
        ${staff && item.unit_price != null ? `<div class="receipt-row">
          <span>${Number(item.quantity)} × ${Number(item.unit_price).toFixed(2)}</span>
          <span>${(Number(item.quantity) * Number(item.unit_price)).toFixed(2)} лв.</span>
        </div>` : ''}
      </div><br>`).join('');

    return `<div class="receipt">
      <h1>ZORBAS</h1>
      <h2>${title(job.job_type)}</h2>
      <hr>
      <div class="big">${payload.order_type === 'pickup' ? 'ПАКЕТ' : `МАСА ${Z.esc(payload.table_number || '—')}`}</div>
      <div>Поръчка №${Z.esc(payload.order_number || '—')}</div>
      <div>${Z.formatDate(payload.created_at || job.created_at)}</div>
      ${payload.actor ? `<div>Сервитьор: ${Z.esc(payload.actor)}</div>` : ''}
      ${payload.ready_at ? `<div>За час: ${Z.formatDate(payload.ready_at)}</div>` : ''}
      <hr>
      ${rows}
      ${payload.cancel_reason ? `<hr><b>ОТКАЗ:</b><br>${Z.esc(payload.cancel_reason)}` : ''}
      ${payload.note || payload.order_note ? `<hr><b>БЕЛЕЖКА:</b><br>${Z.esc(payload.note || payload.order_note)}` : ''}
      ${staff && payload.subtotal != null ? `<hr><div class="receipt-row big"><span>ОБЩО</span><span>${Number(payload.subtotal).toFixed(2)} лв.</span></div>` : ''}
      <hr>
      <div style="text-align:center">powered by SoulFlame</div>
    </div>`;
  }

  async function printJob(id, automatic) {
    if (printing) return;
    const job = jobs.find(entry => entry.id === id);
    if (!job) return;
    printing = true;
    const root = $('printRoot');
    root.innerHTML = receipt(job);
    root.style.display = 'block';

    try {
      await ack(id, 'printing');
      if (automatic) {
        const status = $('bridgeStatus');
        if (status) status.textContent = `Печата бележка №${job.payload?.order_number || '—'}…`;
      }
      window.print();
      await ack(id, 'printed');
    } catch (error) {
      await ack(id, 'failed', error.message);
    } finally {
      root.style.display = 'none';
      root.innerHTML = '';
      printing = false;
      updateControls();
      await refresh();
    }
  }

  async function ack(id, status, error = null) {
    try {
      return await Z.rpc('zorbas_ack_print_job_v3', {
        p_token: Z.token(),
        p_job_id: id,
        p_status: status,
        p_error: error
      });
    } catch (rpcError) {
      Z.toast(rpcError.message, 'error');
      throw rpcError;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    Z.registerPwa();
    $('loginForm').onsubmit = login;
    $('logoutButton').onclick = Z.logout;
    $('refreshButton').onclick = refresh;
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