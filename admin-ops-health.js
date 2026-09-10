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
      <div><h3>Състояние на системата</h3><p>Bridge, принтери, lifecycle и база данни без клиентски или служебни лични данни.</p></div>
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
  const dateText = value => value ? new Date(value).toLocaleString('bg-BG') : 'няма';
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

  function render(data, versionHealth = {}) {
    const printing = data?.printing || {};
    const bridge = data?.bridge || {};
    const service = data?.service || {};
    const maintenance = data?.maintenance || {};
    const bridgeRequired = Boolean(bridge.required);
    const bridgeOnline = number(bridge.online);
    const bridgeState = !bridgeRequired ? 'НЕ СЕ ИЗИСКВА' : bridgeOnline > 0 ? 'ONLINE' : 'OFFLINE';
    const printerValue = `${number(printing.active_printers)}/${number(printing.expected_printers)}`;
    const safeTestReady = Boolean(versionHealth.safe_test_no_print_ready);
    const rawState = data?.status || 'action_required';
    const state = rawState === 'ok' && !safeTestReady ? 'warning' : rawState;
    const currentVersion = versionHealth.current_version || 'неизвестна';
    const requiredVersion = versionHealth.required_version || '1.2.4';

    title.textContent = state === 'ok' ? '🟢 Системата е здрава' : state === 'warning' ? '🟡 Има предупреждение' : '🔴 Нужно е действие';
    checked.textContent = data?.checked_at ? new Date(data.checked_at).toLocaleString('bg-BG') : '—';

    cards.replaceChildren(
      card('Bridge', bridgeState, `Режим: ${bridge.operating_mode || '—'} · последно: ${dateText(bridge.last_seen_at)}`),
      card('Bridge версия', currentVersion, safeTestReady ? `Safe test-no-print: ГОТОВ · минимум ${requiredVersion}` : `ОБНОВИ до ${requiredVersion}+ преди test_no_print`),
      card('Bridge устройства', `${bridgeOnline}/${number(bridge.devices)}`, `Стари/offline: ${number(bridge.stale)} · outdated: ${number(versionHealth.outdated_devices)}`),
      card('Активни принтери', printerValue, `Невалидна конфигурация: ${number(printing.bad_printer_config)}`),
      card('Успешни печати · 24ч', number(printing.printed_last_24h), `Последен успешен: ${dateText(printing.last_printed_at)}`),
      card('Непотвърден физически печат', number(printing.ambiguous_last_48h), 'Изисква физическа проверка преди повторение.'),
      card('Изтекли print leases', number(printing.expired_leases), 'Задачи, останали заключени след прекъсване.'),
      card('Изчерпани опити за печат', number(printing.exhausted_last_48h), 'Печатът не трябва да се счита за успешен.'),
      card('Lifecycle конфликти', number(service.lifecycle_conflicts), 'Невъзможни комбинации между кухня, item delivery и order state.'),
      card('Стари незатворени поръчки', number(service.stale_nonfinal_orders), 'Поръчки от предишен service day, които чакат 05:00 rollover.'),
      card('Стари active посещения', number(service.historical_stale_active_visits), 'Исторически visits извън текущия service day.'),
      card('Проблемни dine-in поръчки', number(service.recent_dinein_without_visit), 'Текущи поръчки без посещение на маса.'),
      card('Несъответствие маса/състояние', number(service.live_table_mismatch), 'Живо обслужване и статусът на масата не съвпадат.'),
      card('Живи посещения', number(service.current_live_visits), 'Текущи обслужвани групи.'),
      card('Поръчки за 24 часа', number(service.orders_last_24h), 'Обобщен брой без лични данни.'),
      card('Резервации за 24 часа', number(service.confirmed_reservations_next_24h), 'Само потвърдени предстоящи резервации.'),
      card('Изтекли сесии', number(maintenance.expired_sessions), 'Информационна стойност за поддръжка.')
    );

    if (!safeTestReady && state !== 'action_required') {
      message.textContent = `Bridge е онлайн, но safe test-no-print не е готов. Инсталирай Bridge ${requiredVersion}+ преди тест без физически печат.`;
    } else {
      message.textContent = state === 'ok'
        ? 'Няма открит текущ блокиращ проблем. Bridge, принтери и lifecycle са в норма.'
        : state === 'warning'
          ? 'Има исторически или неблокиращи записи за почистване. Системата може да работи, но провери жълтите показатели.'
          : 'Има текущ operational риск. Провери Bridge, принтерите и lifecycle конфликтите преди натоварена смяна.';
    }
  }

  async function loadHealth() {
    refreshButton.disabled = true;
    message.textContent = 'Проверка на Bridge, версията, принтерите, базата и текущото обслужване…';
    try {
      const [data, versionHealth] = await Promise.all([
        Z.rpc('zorbas_ops_health_v1', { p_token: Z.token() }),
        Z.rpc('zorbas_bridge_version_health_v1', { p_token: Z.token() })
      ]);
      render(data, versionHealth);
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
