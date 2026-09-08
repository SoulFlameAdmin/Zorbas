(() => {
  const RESERVATION_TARGET = '[data-open="reservationDialog"],[data-open="reserveDialog"],[data-reserve],[href="#reservationDialog"],[href="#reserveDialog"],[href="#reserve"]';
  const PHOTO_TARGET = 'a.home-link.underlined,[data-open-gallery],[href*="google.com/search"][href*="tbm=isch"]';

  function openReservation(event) {
    const target = event.target.closest?.(RESERVATION_TARGET);
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    location.assign('/reserve.html?v=20260905-stable2');
  }

  function openGallery(event) {
    const target = event.target.closest?.(PHOTO_TARGET);
    if (!target) return;
    const label = (target.textContent || '').trim().toUpperCase();
    const isPhotoLink = target.matches('[data-open-gallery],[href*="google.com/search"][href*="tbm=isch"]') || label === 'СНИМКИ';
    if (!isPhotoLink) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    location.assign('/gallery.html');
  }

  function normalizePhotoLink() {
    document.querySelectorAll(PHOTO_TARGET).forEach(link => {
      const label = (link.textContent || '').trim().toUpperCase();
      if (label !== 'СНИМКИ' && !link.matches('[data-open-gallery],[href*="google.com/search"][href*="tbm=isch"]')) return;
      link.setAttribute('href', '/gallery.html');
      link.removeAttribute('target');
      link.removeAttribute('rel');
      link.setAttribute('data-open-gallery', 'true');
    });
  }

  normalizePhotoLink();
  document.addEventListener('click', openReservation, true);
  document.addEventListener('touchend', openReservation, {capture: true, passive: false});
  document.addEventListener('click', openGallery, true);
  document.addEventListener('touchend', openGallery, {capture: true, passive: false});
})();
