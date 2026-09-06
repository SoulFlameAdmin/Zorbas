(() => {
  const Z = window.Zorbas;
  if (!Z) return;

  const nav = document.querySelector('#adminSidebar .nav');
  const main = document.querySelector('.content');
  if (!nav || !main || document.getElementById('view-ops')) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.view = 'ops';
  button.textContent = '◉ Система';
  const printLink = nav.querySelector('a[href="/print.html"]');
  nav.insertBefore(button, printLink || null);

  const section = document.createElement('section');
  section.className = 'view';
  section.id = 'view-ops';
  section.innerHTML = `
    <div class="view-head">
      <div><h3>Състояние на системата</h3><p>Оперативна проверка без клиентски или служебни лични данни.</p></div>
      <button class="btn" id="opsHealthRefresh" type="button">Провери</button>
    </div>
    <section class="panel">
      <div class="panel-head"><h4 id="opsHealthTitle">Проверка…</h4><span class="badge" id="opsHealthChecked">—</span></div>
      <div class="panel-body">
        <div class="stats-grid" id="opsHealthCards"></div>
        <p class="empty" id="opsHealthMessage">Отвори „Система“, за да провериш текущото състояние.</p>
      </div>
    </section>`;
  main.appendChild(section);

  const title = document.getElementById('opsHealthTitle');
  const checked = document.getElementById('opsHealthChecked');
  const cards = document.getElementById('opsHealthCards');
  const message = document.getElementById('opsHealthMessage');
  const refreshButton = document.getElementById('opsHealthRefresh');

  const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const card = (label, value, note = '') => {
    const node = document.createElement('article');
    node.className = 'stat-card';
    const small = document.createElement('small');
    const strong = document.createElement('strong');
    const p = document.createElement('p');
    small.textContent = label;
    strong.textContent = String(value);
    p.textContent = note;
    node.append(small, strong, p);
    return node;
  };

  function render(data) {
    const printing = data?.printing || {};
    const service = data?.service || {};
    const maintenance = data?.maintenance || {};
    const state = data?.status || 'action_required';
    title.textContent = state === 'ok' ? '🟢 Системата е здрава' : state === 'warning' ? '🟡 Има предупреждение' : '🔴 Нужно е действие';
    checked.textContent = data?.checked_at ? new Date(data.checked_at).toLocaleString('bg-BG') : '—';
    cards.replaceChildren(
      card('Непотвърден физически печат', number(printing.ambiguous_last_48h), 'Изисква физическа проверка преди повторение.'),
      card('Изтекли print leases', number(printing.expired_leases), 'Задачи, останали заключени след прекъсване.'),
      card('Изчерпани опити за печат', number(printing.exhausted_last_48h), 'Печатът не трябва да се счита за успешен.'),
      card('Проблемни dine-in поръчки', number(service.recent_dinein_without_visit), 'Текущи поръчки без посещение на маса.'),
      card('Несъответствие маса/състояние', number(service.live_table_mismatch), 'Живо обслужване и статусът на масата не съвпадат.'),
      card('Живи посещения', number(service.current_live_visits), 'Текущи обслужвани групи.'),
      card('Поръчки за 24 часа', number(service.orders_last_24h), 'Обобщен брой без лични данни.'),
      card('Резервации за 24 часа', number(service.confirmed_reservations_next_24h), 'Само потвърдени предстоящи резервации.'),
      card('Изтекли сесии', number(maintenance.expired_sessions), 'Информационна стойност за поддръжка.')
    );
    message.textContent = state === 'ok'
      ? 'Няма открит текущ блокиращ проблем.'
      : state === 'warning'
        ? 'Провери последните неуспешни печати.'
        : 'Провери червените показатели преди следваща натоварена смяна.';
  }

  async function loadHealth() {
    refreshButton.disabled = true;
    message.textContent = 'Проверка на базата, печата и текущото обслужване…';
    try {
      const data = await Z.rpc('zorbas_ops_health_v1', { p_token: Z.token() });
      render(data);
    } catch (error) {
      title.textContent = '🔴 Проверка неуспешна';
      checked.textContent = new Date().toLocaleString('bg-BG');
      cards.replaceChildren();
      message.textContent = error?.message || 'Неуспешна оперативна проверка.';
    } finally {
      refreshButton.disabled = false;
    }
  }

  button.addEventListener('click', () => {
    if (typeof switchView === 'function') switchView('ops');
    else {
      document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view === section));
      document.querySelectorAll('.nav [data-view]').forEach(item => item.classList.toggle('active', item === button));
    }
    loadHealth();
  });
  refreshButton.addEventListener('click', loadHealth);

  if (new URLSearchParams(location.search).get('view') === 'ops') {
    button.click();
  }

  setInterval(() => {
    if (section.classList.contains('active') && !document.hidden) loadHealth();
  }, 60000);
})();
