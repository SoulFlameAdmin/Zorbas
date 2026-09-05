(() => {
  const RESERVATION_TARGET = '[data-open="reservationDialog"],[data-open="reserveDialog"],[data-reserve],[href="#reservationDialog"],[href="#reserveDialog"],[href="#reserve"]';

  function openReservation(event) {
    const target = event.target.closest?.(RESERVATION_TARGET);
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    location.assign('/reserve.html?v=20260905-stable2');
  }

  document.addEventListener('click', openReservation, true);
  document.addEventListener('touchend', openReservation, {capture: true, passive: false});
})();
