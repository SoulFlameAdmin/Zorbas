(() => {
  const Z = window.Zorbas;
  if (!Z) return;

  let liveSnapshot = null;
  let areaId = null;
  let loading = false;
  let pending = false;

  const style = document.createElement('style');
  style.textContent = `
    .kitchen-live-tables{margin-bottom:24px;padding:18px;border:1px solid #2b3b50;border-radius:22px;background:linear-gradient(180deg,#151f2d,#0e1621)}
    .kitchen-live-title{display:flex;align-items:end;justify-content:space-between;gap:12px;margin-bottom:12px}
    .kitchen-live-title small{display:block;color:#8392a7;font-size:10px;letter-spacing:.14em}
    .kitchen-live-title h4{margin:4px 0 0;font-size:25px}
    .kitchen-live-title span{color:#8fa1b8;font-size:11px}
    .kitchen-live-legend{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px;color:#a9b6c8;font-size:11px}
    .kitchen-live-legend span{display:inline-flex;align-items:center;gap:6px}.kitchen-live-legend i{width:10px;height:10px;border-radius:50%}
    .kitchen-live-legend .free{background:#45a879}.kitchen-live-legend .reserved{background:#d2aa37}.kitchen-live-legend .occupied{background:#c65a70}.kitchen-live-legend .blocked{background:#697586}
    .kitchen-live-areas{display:flex;gap:7px;overflow:auto;margin-bottom:13px;padding-bottom:2px}
    .kitchen-live-area{min-height:38px;padding:0 13px;border:1px solid #2b3b50;border-radius:999px;background:#111a27;color:#a9b6c8;white-space:nowrap;font-weight:800}
    .kitchen-live-area.active{background:#5577aa;border-color:#7192c5;color:#fff}
    .kitchen-live-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:9px}
    .kitchen-live-table{position:relative;display:grid;place-items:center;min-height:112px;border:1px solid transparent;border-radius:18px;color:#fff;text-align:center}
    .kitchen-live-table.available{background:linear-gradient(160deg,#15302b,#111b27);border-color:#285947}
    .kitchen-live-table.reserved{background:linear-gradient(160deg,#443715,#211f25);border-color:#806a27}
    .kitchen-live-table.occupied{background:linear-gradient(160deg,#43222b,#1b1b25);border-color:#783b4a}
    .kitchen-live-table.blocked{background:#252c36;border-color:#586272}
    .kitchen-live-table b{font-size:35px}.kitchen-live-table small{display:block;margin-top:5px;color:#b7c0ce}
    .kitchen-live-state{position:absolute;top:10px;padding:4px 7px;border-radius:999px;background:#ffffff12;font-size:8px;font-weight:900;letter-spacing:.05em}
    .kitchen-live-empty{grid-column:1/-1;padding:30px;text-align:center;color:#8d9bae}
    @media(max-width:650px){.kitchen-live-tables{padding:13px;margin-bottom:17px}.kitchen-live-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.kitchen-live-table{min-height:105px;border-radius:16px}.kitchen-live-table b{font-size:31px}.kitchen-live-state{font-size:7px}}
  `;
  document.head.appendChild(style);

  function stateLabel(state) {
    return state === 'occupied' ? 'ЗАЕТА' : state === 'reserved' ? 'РЕЗЕРВИРАНА' : state === 'blocked' ? 'БЛОКИРАНА' : 'СВОБОДНА';
  }

  function ensureRoot() {
    const view = document.getElementById('kitchenReservationsView');
    const cards = document.getElementById('kitchenReservations');
    if (!view || !cards) return null;
    let root = document.getElementById('kitchenLiveTables');
    if (!root) {
      root = document.createElement('section');
      root.id = 'kitchenLiveTables';
      root.className = 'kitchen-live-tables';
      cards.parentElement.insertBefore(root, cards);
      root.addEventListener('click', event => {
        const button = event.target.closest('[data-kitchen-live-area]');
        if (!button) return;
        areaId = button.dataset.kitchenLiveArea;
        render();
      });
    }
    return root;
  }

  function render() {
    const root = ensureRoot();
    if (!root) return;
    const areas = liveSnapshot?.areas || [];
    if (!areaId || !areas.some(area => area.id === areaId)) areaId = areas[0]?.id || null;
    const area = areas.find(entry => entry.id === areaId);
    const tables = (liveSnapshot?.tables || []).filter(table => table.area_id === areaId);
    root.innerHTML = `
      <div class="kitchen-live-title"><div><small>СЪСТОЯНИЕ В РЕАЛНО ВРЕМЕ</small><h4>Маси · ${Z.esc(area?.name || 'Zorbas')}</h4></div><span>${tables.length} маси</span></div>
      <div class="kitchen-live-legend"><span><i class="free"></i>Свободна</span><span><i class="reserved"></i>Резервирана</span><span><i class="occupied"></i>Заета</span><span><i class="blocked"></i>Блокирана</span></div>
      <div class="kitchen-live-areas">${areas.map(entry => `<button type="button" class="kitchen-live-area ${entry.id === areaId ? 'active' : ''}" data-kitchen-live-area="${entry.id}">${Z.esc(entry.name)}</button>`).join('')}</div>
      <div class="kitchen-live-grid">${loading && !liveSnapshot ? '<div class="kitchen-live-empty">Обновявам масите…</div>' : tables.map(table => {
        const state = ['available','reserved','occupied','blocked'].includes(table.live_state) ? table.live_state : (table.status === 'occupied' ? 'occupied' : table.status === 'blocked' ? 'blocked' : 'available');
        return `<article class="kitchen-live-table ${state}"><span class="kitchen-live-state">${stateLabel(state)}</span><div><b>${Z.esc(table.table_number)}</b><small>${Number(table.seats || 0)} места</small></div></article>`;
      }).join('') || '<div class="kitchen-live-empty">Няма маси в тази област.</div>'}</div>`;
  }

  async function loadLiveTables() {
    if (!Z.token()) return;
    if (loading) { pending = true; return; }
    loading = true;
    render();
    try {
      liveSnapshot = await Z.rpc('zorbas_staff_snapshot', {p_token:Z.token()});
      render();
    } catch {}
    finally {
      loading = false;
      if (pending) { pending = false; setTimeout(loadLiveTables, 80); }
    }
  }

  function syncKitchen() {
    document.getElementById('refreshButton')?.click();
    loadLiveTables();
  }

  document.addEventListener('DOMContentLoaded', () => {
    ensureRoot();
    if (Z.token()) loadLiveTables();
    document.getElementById('loginForm')?.addEventListener('submit', () => {
      setTimeout(loadLiveTables, 450);
      setTimeout(loadLiveTables, 1100);
    });
    window.ZorbasLive?.subscribe(syncKitchen);
    setInterval(() => {
      if (Z.token() && !document.hidden) loadLiveTables();
    }, 5000);
  });
})();
