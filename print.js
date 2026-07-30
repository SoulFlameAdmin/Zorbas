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
        : 'Ръчен режим — всяка бележка се заключва преди печат.');
    }
  }

  async function start() {
    const session = await Z.requireSession();
    if (!session) return;
    $('loginView').classList.add('hidden');
    $('appView').classList.remove('hidden');
    $('sessionName').textContent = `${session.display_name} · печатен мост v4`;
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
        const next = jobs.find(job => ['pending', 'retrying'].includes(job.status) && Number(job.attempts || 0) < Number(job.max_attempts || 3));
        if (next) await printJob(next.id, true);
      }
    } catch (error) {
      updateControls(`Грешка при опресняване: ${error.message}`);
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

  function statusText(status) {
    return ({
      pending: 'ЧАКА',
      retrying: 'ПОВТОРЕН ОПИТ',
      claimed: 'ВЗЕТА',
      preparing: 'ПОДГОТОВКА',
      sending: 'ИЗПРАЩАНЕ',
      printing: 'ПЕЧАТА',
      printed: 'ОТПЕЧАТАНА',
      failed: 'ГРЕШКА',
      cancelled: 'ОТКАЗАНА'
    })[status] || String(status || '—').toUpperCase();
  }

  function render() {
    $('jobsList').innerHTML = jobs.length ? jobs.map(job => {
      const payload = job.payload || {};
      const attempts = Number(job.attempts || 0);
      const maxAttempts = Number(job.max_attempts || 3);
      const exhausted = attempts >= maxAttempts;
      const busy = ['claimed', 'preparing', 'sending', 'printing'].includes(job.status);
      return `<article class="order-card">
        <header>
          <div>
            <strong>${title(job.job_type)}</strong>
            <small>${destination === 'staff' ? 'Print 1 · сервитьори' : 'Print 2 · кухня'} · ${Z.formatDate(job.created_at)}</small>
          </div>
          <span class="badge ${job.status === 'failed' || exhausted ? 'cancelled' : ''}">${statusText(job.status)}</span>
        </header>
        <div class="panel-body">
          <p><b>${payload.order_type === 'pickup' ? 'ПАКЕТ' : `МАСА ${Z.esc(payload.table_number || '—')}`}</b> · №${Z.esc(payload.order_number || '—')}</p>
          <p>${(payload.items || []).map(item => `${item.quantity}× ${Z.esc(item.name)}`).join('<br>')}</p>
          <p><small>Опити: ${attempts}/${maxAttempts}</small></p>
          ${payload.cancel_reason ? `<p class="notice">ОТКАЗ: ${Z.esc(payload.cancel_reason)}</p>` : ''}
          ${payload.note || payload.order_note ? `<p class="notice">${Z.esc(payload.note || payload.order_note)}</p>` : ''}
          ${job.last_error ? `<p class="notice">ГРЕШКА: ${Z.esc(job.last_error)}</p>` : ''}
          <div class="toolbar">
            <button class="btn primary" data-print="${job.id}" ${busy || exhausted ? 'disabled' : ''}>${job.status === 'failed' ? 'ПОВТОРИ' : 'ПЕЧАТ'}</button>
            <button class="btn red" data-fail="${job.id}" ${busy || exhausted ? 'disabled' : ''}>ОТБЕЛЕЖИ ГРЕШКА</button>
          </div>
        </div>
      </article>`;
    }).join('') : '<div class="empty">Няма чакащи бележки.</div>';

    document.querySelectorAll('[data-print]').forEach(button => {
      button.onclick = () => printJob(button.dataset.print, false);
    });
    document.querySelectorAll('[data-fail]').forEach(button => {
      button.onclick = () => markFailed(button.dataset.fail);
    });
  }

  function receipt(job) {
    const payload = job.payload || {};
    const staff = job.destination === 'staff';
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

  async function claim(id) {
    return Z.rpc('zorbas_claim_print_job_v4', {
      p_token: Z.token(),
      p_job_id: id
    });
  }

  async function ack(id, status, error = null) {
    return Z.rpc('zorbas_ack_print_job_v4', {
      p_token: Z.token(),
      p_job_id: id,
      p_status: status,
      p_error: error
    });
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
      if (claimed?.id) {
        await ack(claimed.id, 'failed', error.message).catch(() => {});
      }
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