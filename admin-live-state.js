(() => {
  if (typeof refresh !== 'function' || typeof renderMap !== 'function') return;

  const style = document.createElement('style');
  style.textContent = `
    .table-node.reserved{background:var(--yellow)!important;color:#211707!important}
    .table-node.available{background:var(--green)!important}
    .staff-live-legend{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 12px;color:var(--muted);font-size:11px}
    .staff-live-legend span{display:inline-flex;align-items:center;gap:6px}
    .staff-live-legend i{width:10px;height:10px;border-radius:50%}
    .staff-live-legend .free{background:var(--green)}
    .staff-live-legend .reserved{background:var(--yellow)}
    .staff-live-legend .occupied{background:var(--red)}
    .staff-live-legend .blocked{background:#666}
  `;
  document.head.appendChild(style);

  const baseWaiterTableState = typeof waiterTableState === 'function' ? waiterTableState : null;
  if (baseWaiterTableState) {
    waiterTableState = function unifiedWaiterTableState(table) {
      const live = table?.live_state;
      if (['available','reserved','occupied','blocked'].includes(live)) {
        return live === 'available' ? 'free' : live;
      }
      return baseWaiterTableState(table);
    };
  }

  if (typeof reservationForTable === 'function') {
    reservationForTable = function unifiedReservationForTable(tableId) {
      const table = snapshot?.tables?.find(entry => entry.id === tableId);
      if (table?.live_state !== 'reserved' || !table?.reservation_id) return null;
      return snapshot?.reservations?.find(entry => entry.id === table.reservation_id) || null;
    };
  }

  function tableState(table) {
    if (['available','reserved','occupied','blocked'].includes(table?.live_state)) return table.live_state;
    if (table?.status === 'blocked') return 'blocked';
    if (typeof tableHasActiveOrder === 'function' && tableHasActiveOrder(table.id)) return 'occupied';
    if (table?.status === 'occupied' || table?.status === 'cleaning') return 'occupied';
    return 'available';
  }

  function ensureLegend() {
    const view = document.getElementById('view-tables');
    const map = document.getElementById('staffMap');
    if (!view || !map || view.querySelector('.staff-live-legend')) return;
    const legend = document.createElement('div');
    legend.className = 'staff-live-legend';
    legend.innerHTML = '<span><i class="free"></i>Свободна</span><span><i class="reserved"></i>Резервирана</span><span><i class="occupied"></i>Заета</span><span><i class="blocked"></i>Блокирана</span>';
    map.parentElement?.insertBefore(legend, map);
  }

  renderMap = function renderUnifiedLiveMap() {
    if (!snapshot) return;
    const map = document.getElementById('staffMap');
    const area = snapshot.areas.find(entry => entry.id === selectedArea);
    const tables = snapshot.tables.filter(entry => entry.area_id === selectedArea);
    if (!map) return;
    map.style.aspectRatio = `${Number(area?.map_width || 100)}/${Number(area?.map_height || 70)}`;
    map.innerHTML = tables.map(table => {
      const state = tableState(table);
      const label = state === 'occupied' ? 'Заета' : state === 'reserved' ? 'Резервирана' : state === 'blocked' ? 'Блокирана' : 'Свободна';
      return `<button class="table-node ${state} ${selectedTable === table.id ? 'selected' : ''}" data-table="${table.id}" style="left:${table.x}%;top:${table.y}%;width:${table.width}%;height:${table.height}%;transform:rotate(${table.rotation || 0}deg)" ${state === 'blocked' ? 'disabled' : ''}>${chairs(table.seats)}<span>${Z.esc(table.table_number)}<small>${label} · ${table.seats} места</small></span></button>`;
    }).join('');
    map.querySelectorAll('[data-table]:not(:disabled)').forEach(button => {
      button.onclick = () => {
        selectedTable = button.dataset.table;
        renderMap();
        renderTableInfo();
      };
    });
    ensureLegend();
  };

  let syncing = false;
  let pending = false;

  function canRefreshSafely() {
    const active = document.activeElement;
    if (active?.matches?.('input,textarea,select,[contenteditable="true"]')) return false;
    if (typeof waiterState !== 'undefined' && waiterState?.tableDirty) return false;
    if (typeof waiterState !== 'undefined' && ['note','preview'].includes(waiterState?.step)) return false;
    return true;
  }

  async function syncLiveState() {
    if (!Z.token()) return;
    if (!canRefreshSafely()) {
      pending = true;
      return;
    }
    if (syncing) {
      pending = true;
      return;
    }
    syncing = true;
    try { await refresh(); }
    catch {}
    finally {
      syncing = false;
      if (pending && canRefreshSafely()) {
        pending = false;
        setTimeout(syncLiveState, 120);
      }
    }
  }

  document.addEventListener('focusout', () => {
    if (pending) setTimeout(syncLiveState, 180);
  });
  document.addEventListener('pointerup', () => {
    if (pending && canRefreshSafely()) setTimeout(syncLiveState, 120);
  });

  window.ZorbasLive?.subscribe(syncLiveState);
  ensureLegend();
  if (snapshot) {
    renderMap();
    if (typeof renderWaiterMobile === 'function') renderWaiterMobile();
  }
})();
