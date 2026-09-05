/* ZORBAS · reservation terminal status controls for staff
   Adds safe CANCEL / NO-SHOW actions to the stable waiter reservation cards.
   Reservation data comes only from the protected staff snapshot. */
(() => {
  'use strict';

  const Z = window.Zorbas;
  if (!Z || typeof Z.rpc !== 'function') return;

  const originalRpc = Z.rpc.bind(Z);
  let snapshot = null;
  let decorating = false;

  function reservationFor(id) {
    return (snapshot?.reservations || []).find(row => String(row.id) === String(id)) || null;
  }

  function canMarkNoShow(reservation) {
    if (!reservation?.start_at) return false;
    const start = new Date(reservation.start_at).getTime();
    return Number.isFinite(start) && Date.now() >= start;
  }

  function ensureStyles() {
    if (document.getElementById('zorbasReservationStatusStyles')) return;
    const style = document.createElement('style');
    style.id = 'zorbasReservationStatusStyles';
    style.textContent = `
      .ws-reservation-status-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}
      .ws-reservation-status-actions button{min-height:42px;border-radius:12px;border:1px solid rgba(255,255,255,.18);font:inherit;font-weight:800;cursor:pointer}
      .ws-reservation-status-actions .ws-res-cancel{background:rgba(220,38,38,.13);color:#fecaca;border-color:rgba(248,113,113,.35)}
      .ws-reservation-status-actions .ws-res-noshow{background:rgba(148,163,184,.11);color:#e2e8f0}
      .ws-reservation-status-actions button:disabled{opacity:.38;cursor:not-allowed}
      .ws-reservation-status-note{grid-column:1/-1;font-size:11px;line-height:1.35;color:#94a3b8}
    `;
    document.head.appendChild(style);
  }

  async function setReservationStatus(id, status, button) {
    const reservation = reservationFor(id);
    if (!reservation || button.disabled) return;

    if (status === 'no_show' && !canMarkNoShow(reservation)) return;

    const question = status === 'no_show'
      ? 'Да отбележа ли резервацията като НЕЯВИЛИ СЕ? / Mark this reservation as NO-SHOW?'
      : 'Да откажа ли тази резервация? / Cancel this reservation?';
    if (!window.confirm(question)) return;

    const buttons = button.closest('.ws-reservation-status-actions')?.querySelectorAll('button') || [];
    buttons.forEach(entry => { entry.disabled = true; });
    const old = button.textContent;
    button.textContent = 'ЗАПИСВА СЕ… / SAVING…';

    try {
      await Z.rpc('zorbas_set_reservation_status_v1', {
        p_token: Z.token(),
        p_reservation_id: id,
        p_status: status,
        p_reason: null
      });
      document.getElementById('waiterStableRefresh')?.click();
    } catch (error) {
      buttons.forEach(entry => { entry.disabled = false; });
      button.textContent = old;
      window.alert(error?.message || 'Статусът на резервацията не беше променен. / Reservation status was not changed.');
    }
  }

  function decorate() {
    if (decorating) return;
    decorating = true;
    try {
      ensureStyles();
      document.querySelectorAll('.ws-reservation-card').forEach(card => {
        if (card.querySelector('[data-reservation-status-actions]')) return;
        const arrived = card.querySelector('[data-arrived-reservation]');
        const id = arrived?.dataset?.arrivedReservation;
        const reservation = reservationFor(id);
        if (!id || !reservation || !['requested', 'confirmed'].includes(reservation.status)) return;

        const actions = document.createElement('div');
        actions.className = 'ws-reservation-status-actions';
        actions.dataset.reservationStatusActions = '1';

        const noShow = document.createElement('button');
        noShow.type = 'button';
        noShow.className = 'ws-res-noshow';
        noShow.dataset.reservationNoShow = id;
        noShow.textContent = 'НЕ ДОЙДОХА / NO-SHOW';
        noShow.disabled = !canMarkNoShow(reservation);
        noShow.onclick = event => { event.preventDefault(); event.stopPropagation(); setReservationStatus(id, 'no_show', noShow); };

        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'ws-res-cancel';
        cancel.dataset.reservationCancel = id;
        cancel.textContent = 'ОТКАЖИ / CANCEL';
        cancel.onclick = event => { event.preventDefault(); event.stopPropagation(); setReservationStatus(id, 'cancelled', cancel); };

        actions.append(noShow, cancel);
        if (noShow.disabled) {
          const note = document.createElement('small');
          note.className = 'ws-reservation-status-note';
          note.textContent = 'NO-SHOW се отключва след часа на резервацията. / NO-SHOW unlocks after reservation time.';
          actions.appendChild(note);
        }
        card.appendChild(actions);
      });
    } finally {
      decorating = false;
    }
  }

  Z.rpc = async function reservationStatusAwareRpc(name, payload = {}, options = {}) {
    const result = await originalRpc(name, payload, options);
    if (name === 'zorbas_staff_snapshot') {
      snapshot = result;
      queueMicrotask(decorate);
    }
    return result;
  };

  const observer = new MutationObserver(() => decorate());
  observer.observe(document.documentElement, {subtree: true, childList: true});
  window.addEventListener('pageshow', decorate);
})();
