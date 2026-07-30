(() => {
  const Z = window.Zorbas;
  if (!Z || !window.ZorbasLive) return;

  const labels = {available:'СВОБОДНА', reserved:'РЕЗЕРВИРАНА', occupied:'ЗАЕТА', blocked:'БЛОКИРАНА'};
  let syncing = false;
  let pending = false;

  function currentSlot() {
    const form = document.getElementById('reservationForm');
    if (form) {
      const data = new FormData(form);
      return {date:String(data.get('date') || ''), time:String(data.get('time') || '')};
    }
    const meta = document.querySelector('.top-meta')?.textContent || '';
    const match = meta.match(/(\d{2})\.(\d{2})\.(\d{4})\s*·\s*(\d{2}:\d{2})/);
    if (match) return {date:`${match[3]}-${match[2]}-${match[1]}`, time:match[4]};
    const now = new Date(Date.now() + 30 * 60 * 1000);
    return {date:Z.localDate(now), time:`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`};
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
    const active = document.activeElement;
    if (active?.matches?.('input,textarea,select')) { pending = true; return; }

    const cards = document.querySelectorAll('.table-card[data-table]');
    const form = document.getElementById('reservationForm');
    if (!cards.length && !form) return;

    syncing = true;
    try {
      const slot = currentSlot();
      const tables = await Z.rpc('zorbas_public_availability', {
        p_date:slot.date,
        p_time:slot.time,
        p_duration_minutes:120
      });
      if (cards.length) paintVisibleCards(tables);
      if (form) {
        const selectedText = document.querySelector('.summary strong')?.textContent || '';
        const selectedNumber = selectedText.match(/Маса\s+([^·]+)$/i)?.[1]?.trim();
        const guests = Number(new FormData(form).get('guests') || 1);
        const table = (tables || []).find(entry => String(entry.table_number) === String(selectedNumber));
        const okay = Boolean(table && table.state === 'available' && Number(table.seats || 0) >= guests);
        const status = document.getElementById('slotStatus');
        const submit = document.getElementById('reserveSubmit');
        if (status) {
          status.className = `slot-status ${okay ? 'ok' : 'bad'}`;
          status.textContent = okay ? '✓ Масата е свободна за този ден и час.' : 'Масата вече е резервирана или заета. Избери друга.';
        }
        if (submit) submit.disabled = !okay;
      }
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
