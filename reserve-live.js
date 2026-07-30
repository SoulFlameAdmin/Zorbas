(() => {
  const Z = window.Zorbas;
  if (!Z || !window.ZorbasLive) return;

  let syncing = false;
  let pending = false;

  async function syncClientTables() {
    if (syncing) { pending = true; return; }
    const form = document.getElementById('reservationForm');
    const active = document.activeElement;
    if (active?.matches?.('input,textarea,select')) {
      pending = true;
      return;
    }

    syncing = true;
    try {
      if (typeof state !== 'undefined' && typeof renderTables === 'function') {
        if (state.view === 'tables') {
          state.tables = await Z.rpc('zorbas_public_availability', {
            p_date: state.date,
            p_time: state.time,
            p_duration_minutes: 120
          });
          renderTables();
        } else if (state.view === 'details' && typeof checkExactSlot === 'function') {
          await checkExactSlot(false);
        }
      } else if (form) {
        form.dispatchEvent(new Event('change', {bubbles:true}));
      }
    } catch {}
    finally {
      syncing = false;
      if (pending) {
        pending = false;
        setTimeout(syncClientTables, 160);
      }
    }
  }

  document.addEventListener('focusout', () => {
    if (pending) setTimeout(syncClientTables, 180);
  });
  window.ZorbasLive.subscribe(syncClientTables);
})();
