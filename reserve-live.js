(() => {
  const Z = window.Zorbas;
  if (!Z || !window.ZorbasLive) return;

  const labels = {available:'СВОБОДНА', reserved:'РЕЗЕРВИРАНА', occupied:'ЗАЕТА', blocked:'БЛОКИРАНА'};
  let syncing = false;
  let pending = false;

  function currentSlot() {
    const now = new Date(Date.now() + 30 * 60 * 1000);
    return {
      date: Z.localDate(now),
      time: `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`
    };
  }

  function paintVisibleCards(tables) {
    const byId = new Map((tables || []).map(table => [String(table.id), table]));
    document.querySelectorAll('.table-card[data-table]').forEach(card => {
      const table = byId.get(String(card.dataset.table));
      if (!table) return;
      const state = table.state || (table.available ? 'available' : 'reserved');
      card.classList.remove('free','reserved','occupied','blocked');
      card.classList.add(state === 'available' ? 'free' : state);
      card.disabled = state !== 'available';
      const pill = card.querySelector('.state-pill');
      if (pill) pill.textContent = labels[state] || 'НЕСВОБОДНА';
      card.setAttribute('aria-label', `Маса ${table.table_number}, ${labels[state] || 'несвободна'}, ${table.seats} места`);
    });
  }

  async function syncClientTables() {
    if (syncing) { pending = true; return; }

    // The reservation form has one owner: reserve.js. Realtime must never
    // change its availability message or submit button while a reservation
    // is being checked/saved, otherwise the two async flows can race.
    const active = document.activeElement;
    if (active?.matches?.('input,textarea,select')) { pending = true; return; }

    const cards = document.querySelectorAll('.table-card[data-table]');
    if (!cards.length) return;

    syncing = true;
    try {
      const slot = currentSlot();
      const tables = await Z.rpc('zorbas_public_availability', {
        p_date:slot.date,
        p_time:slot.time,
        p_duration_minutes:120
      });
      paintVisibleCards(tables);
    } catch {}
    finally {
      syncing = false;
      if (pending) { pending = false; setTimeout(syncClientTables, 160); }
    }
  }

  document.addEventListener('focusout', () => {
    if (pending) setTimeout(syncClientTables, 180);
  });
  window.ZorbasLive.subscribe(syncClientTables);
})();
