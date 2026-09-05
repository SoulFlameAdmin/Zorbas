/* ZORBAS · staff-only reservation guest count on waiter table cards */
(() => {
  'use strict';

  const Z = window.Zorbas;
  if (!Z || typeof Z.rpc !== 'function') return;

  let snapshot = null;
  let applyQueued = false;
  const originalRpc = Z.rpc.bind(Z);

  function toTime(value, fallback = 0) {
    if (!value) return fallback;
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : fallback;
  }

  function guestInfoForTable(tableId) {
    if (!snapshot || !tableId) return null;
    const now = Date.now();
    const horizon = now + 2 * 60 * 60 * 1000;
    const reservations = Array.isArray(snapshot.reservations) ? snapshot.reservations : [];
    const rows = reservations
      .filter(row => String(row?.table_id || '') === String(tableId))
      .filter(row => !['completed', 'cancelled', 'no_show'].includes(String(row?.status || '')));

    const seated = rows
      .filter(row => row.status === 'seated')
      .filter(row => toTime(row.end_at, Infinity) > now)
      .sort((a, b) => toTime(b.arrival_confirmed_at || b.updated_at || b.start_at) - toTime(a.arrival_confirmed_at || a.updated_at || a.start_at))[0];

    if (seated && Number(seated.guests) > 0) {
      return {count: Number(seated.guests), kind: 'present'};
    }

    const upcoming = rows
      .filter(row => ['requested', 'confirmed'].includes(row.status))
      .filter(row => toTime(row.start_at, Infinity) < horizon)
      .filter(row => toTime(row.end_at, Infinity) > now)
      .sort((a, b) => toTime(a.start_at, Infinity) - toTime(b.start_at, Infinity))[0];

    if (upcoming && Number(upcoming.guests) > 0) {
      return {count: Number(upcoming.guests), kind: 'reserved'};
    }

    const table = (snapshot.tables || []).find(row => String(row?.id || '') === String(tableId));
    if (table && Number(table.reservation_guests) > 0) {
      return {count: Number(table.reservation_guests), kind: 'reserved'};
    }

    return null;
  }

  function ensureStyle() {
    if (document.getElementById('waiterReservationGuestsStyle')) return;
    const style = document.createElement('style');
    style.id = 'waiterReservationGuestsStyle';
    style.textContent = `
      .ws-table-card .ws-reservation-guests {
        display: block;
        margin-top: 7px;
        font-size: .78rem;
        font-weight: 800;
        line-height: 1.25;
        letter-spacing: .01em;
      }
      .ws-table-card.occupied .ws-reservation-guests { color: #ffd36a; }
      .ws-table-card.reserved .ws-reservation-guests { color: #9fd0ff; }
    `;
    document.head.appendChild(style);
  }

  function applyGuestCounts() {
    applyQueued = false;
    if (!snapshot) return;
    ensureStyle();

    document.querySelectorAll('.ws-table-card[data-table-id]').forEach(card => {
      const info = guestInfoForTable(card.dataset.tableId);
      let badge = card.querySelector('.ws-reservation-guests');

      if (!info) {
        badge?.remove();
        return;
      }

      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'ws-reservation-guests';
        card.appendChild(badge);
      }

      const label = info.kind === 'present'
        ? `👥 ${info.count} човека вътре / ${info.count} people now`
        : `👥 Резервация: ${info.count} човека / ${info.count} guests`;
      if (badge.textContent !== label) badge.textContent = label;
    });
  }

  function queueApply() {
    if (applyQueued) return;
    applyQueued = true;
    queueMicrotask(applyGuestCounts);
  }

  Z.rpc = async function reservationAwareRpc(name, payload = {}, options = {}) {
    const result = await originalRpc(name, payload, options);
    if (name === 'zorbas_staff_snapshot' && result && typeof result === 'object') {
      snapshot = result;
      queueApply();
    }
    return result;
  };

  const app = document.getElementById('waiterStableApp') || document.body;
  const observer = new MutationObserver(queueApply);
  observer.observe(app, {subtree: true, childList: true});
  window.addEventListener('pageshow', queueApply);
})();
