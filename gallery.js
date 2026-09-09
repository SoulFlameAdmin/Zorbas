(() => {
  const photos = [
    'https://cdn.oink.bg/gallery/87849/9cefcdbf-ad48-411e-8e26-3448d7c401ec_large.webp',
    'https://cdn.oink.bg/gallery/87849/bd653aeb-99f1-4293-995c-38d9c8379e4e_medium.webp',
    'https://cdn.oink.bg/gallery/87849/6a888a0c-b6dc-44d3-ace2-f7cc3d44ed5e_medium.webp',
    'https://cdn.oink.bg/gallery/87849/a34d40cc-9a5f-4138-8ebf-30fe215f3242_medium.webp',
    'https://cdn.oink.bg/gallery/87849/2e5dd6b3-46d1-464c-87b5-030c088c88f2_medium.webp',
    'https://cdn.oink.bg/gallery/87849/d052bf1e-24c7-4e67-93cc-6263696c7f8e_medium.webp',
    'https://cdn.oink.bg/gallery/87849/bb707675-36fa-4f63-baf1-96f1f97a0adc_medium.webp',
    'https://cdn.oink.bg/gallery/87849/206ea5ba-677e-43ea-b842-b1ef715f1179_medium.webp',
    'https://cdn.oink.bg/gallery/87849/4c2da47b-c24f-4701-9a13-566fdd860fda_medium.webp',
    'https://cdn.oink.bg/gallery/87849/58d0d958-f1ee-4cfc-8843-1c5fa644bd45_medium.webp'
  ];

  const grid = document.getElementById('galleryGrid');
  const box = document.getElementById('lightbox');
  const image = document.getElementById('lightboxImage');
  const counter = document.getElementById('lightboxCounter');
  const closeButton = document.getElementById('lightboxClose');
  const prevButton = document.getElementById('lightboxPrev');
  const nextButton = document.getElementById('lightboxNext');
  let current = 0;
  let touchStartX = 0;

  if (!grid || !box || !image) return;

  photos.forEach((src, index) => {
    const button = document.createElement('button');
    button.className = 'gallery-tile is-loading';
    button.type = 'button';
    button.setAttribute('aria-label', `Отвори снимка ${index + 1} от ${photos.length}`);

    const img = document.createElement('img');
    img.src = src;
    img.alt = `ZORBAS Greek Grill House — снимка ${index + 1}`;
    img.loading = index < 4 ? 'eager' : 'lazy';
    img.decoding = 'async';
    img.addEventListener('load', () => button.classList.remove('is-loading'));
    img.addEventListener('error', () => button.remove());

    button.appendChild(img);
    button.addEventListener('click', () => open(index));
    grid.appendChild(button);
  });

  function render() {
    image.src = photos[current];
    image.alt = `ZORBAS Greek Grill House — снимка ${current + 1}`;
    if (counter) counter.textContent = `${current + 1} / ${photos.length}`;
  }

  function open(index) {
    current = index;
    render();
    box.classList.add('is-open');
    box.setAttribute('aria-hidden', 'false');
    document.body.classList.add('lightbox-open');
    closeButton?.focus({ preventScroll: true });
  }

  function close() {
    box.classList.remove('is-open');
    box.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('lightbox-open');
    image.removeAttribute('src');
  }

  function step(delta) {
    current = (current + delta + photos.length) % photos.length;
    render();
  }

  closeButton?.addEventListener('click', close);
  prevButton?.addEventListener('click', () => step(-1));
  nextButton?.addEventListener('click', () => step(1));
  box.addEventListener('click', (event) => {
    if (event.target === box) close();
  });
  document.addEventListener('keydown', (event) => {
    if (!box.classList.contains('is-open')) return;
    if (event.key === 'Escape') close();
    if (event.key === 'ArrowLeft') step(-1);
    if (event.key === 'ArrowRight') step(1);
  });
  box.addEventListener('touchstart', (event) => {
    touchStartX = event.changedTouches[0]?.clientX || 0;
  }, { passive: true });
  box.addEventListener('touchend', (event) => {
    const endX = event.changedTouches[0]?.clientX || 0;
    const delta = endX - touchStartX;
    if (Math.abs(delta) > 50) step(delta > 0 ? -1 : 1);
  }, { passive: true });
})();