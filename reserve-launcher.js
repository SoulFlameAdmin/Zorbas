(() => {
  function openReservation(event) {
    const target = event.target.closest?.('[data-open="reserveDialog"],[data-reserve],[href="#reserveDialog"],[href="#reserve"]');
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    location.assign(`/reserve.html?v=20260730-2`);
  }
  document.addEventListener('click', openReservation, true);
  document.addEventListener('touchend', event => {
    const target = event.target.closest?.('[data-open="reserveDialog"],[data-reserve],[href="#reserveDialog"],[href="#reserve"]');
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    location.assign(`/reserve.html?v=20260730-2`);
  }, {capture: true, passive: false});
})();
