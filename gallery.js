(() => {
  const localFallbacks = [
    '/menu-images/grucka-salata.webp',
    '/menu-images/grucka-musaka.webp',
    '/menu-images/panseta-pandjari.webp',
    '/menu-images/purjeni-midi.webp',
    '/menu-images/skaridi-vanamei.webp'
  ];

  // Public copies of ZORBAS social/business photos are intentionally rendered
  // inside the site instead of sending visitors to Google/Facebook on click.
  const photos = [
    'https://img3.restaurants10.com/385/114/621125483851143.jpg',
    'https://img4.restaurants10.com/413/358/418301084133585.jpg',
    'https://img5.restaurants10.com/788/023/414167917880235.jpg',
    'https://img5.restaurants10.com/189/684/207335141896848.jpg',
    'https://cdn.oink.bg/gallery/87849/9cefcdbf-ad48-411e-8e26-3448d7c401ec_large.webp',
    'https://cdn.oink.bg/gallery/87849/bd653aeb-99f1-4293-995c-38d9c8379e4e_medium.webp',
    'https://cdn.oink.bg/gallery/87849/6a888a0c-b6dc-44d3-ace2-f7cc3d44ed5e_medium.webp',
    'https://cdn.oink.bg/gallery/87849/a34d40cc-9a5f-4138-8ebf-30fe215f3242_medium.webp',
    'https://cdn.oink.bg/gallery/87849/2e5dd6b3-46d1-464c-87b5-030c088c88f2_medium.webp',
    'https://cdn.oink.bg/gallery/87849/d052bf1e-24c7-4e67-93cc-6263696c7f8e_medium.webp',
    'https://cdn.oink.bg/gallery/87849/bb707675-36fa-4f63-baf1-96f1f97a0adc_medium.webp',
    'https://cdn.oink.bg/gallery/87849/206ea5ba-677e-43ea-b842-b1ef715f1179_medium.webp',
    'https://cdn.oink.bg/gallery/87849/4c2da47b-c24f-4701-9a13-566fdd860fda_medium.webp',
    'https://cdn.oink.bg/gallery/87849/58d0d958-f1ee-4cfc-8843-1c5fa644bd45_medium.webp',
    ...localFallbacks
  ].map((src, index) => ({
    src,
    fallback: localFallbacks[index % localFallbacks.length],
    resolved: src
  }));

  const grid = document.getElementById('photoGrid');
  const lightbox = document.getElementById('lightbox');
  const lightboxImage = document.getElementById('lightboxImage');
  const lightboxCount = document.getElementById('lightboxCount');
  let activeIndex = 0;
  let touchStartX = 0;

  function isRemote(src) {
    return /^https?:\/\//i.test(src);
  }

  function setSafeImageSource(img, photo, card) {
    if (isRemote(photo.src)) img.referrerPolicy = 'no-referrer';
    img.src = photo.src;
    img.onerror = () => {
      if (img.dataset.fallbackTried === '1') {
        card?.classList.add('is-broken');
        return;
      }
      img.dataset.fallbackTried = '1';
      photo.resolved = photo.fallback;
      img.removeAttribute('referrerpolicy');
      img.src = photo.fallback;
    };
    img.onload = () => {
      photo.resolved = img.currentSrc || img.src;
    };
  }

  function renderGrid() {
    const fragment = document.createDocumentFragment();
    photos.forEach((photo, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'photo-card';
      button.setAttribute('aria-label', `Отвори снимка ${index + 1}`);

      const img = document.createElement('img');
      img.alt = 'ZORBAS Greek Grill House';
      img.loading = index < 4 ? 'eager' : 'lazy';
      img.decoding = 'async';
      setSafeImageSource(img, photo, button);

      button.appendChild(img);
      button.addEventListener('click', () => openLightbox(index));
      fragment.appendChild(button);
    });
    grid.appendChild(fragment);
  }

  function show(index) {
    activeIndex = (index + photos.length) % photos.length;
    const photo = photos[activeIndex];
    lightboxImage.dataset.fallbackTried = '0';
    lightboxImage.referrerPolicy = isRemote(photo.resolved) ? 'no-referrer' : '';
    lightboxImage.src = photo.resolved;
    lightboxImage.onerror = () => {
      if (lightboxImage.dataset.fallbackTried === '1') return;
      lightboxImage.dataset.fallbackTried = '1';
      photo.resolved = photo.fallback;
      lightboxImage.removeAttribute('referrerpolicy');
      lightboxImage.src = photo.fallback;
    };
    lightboxCount.textContent = `${activeIndex + 1} / ${photos.length}`;
  }

  function openLightbox(index) {
    show(index);
    if (!lightbox.open) lightbox.showModal();
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    if (lightbox.open) lightbox.close();
    document.body.style.overflow = '';
  }

  lightbox.querySelector('[data-close]').addEventListener('click', closeLightbox);
  lightbox.querySelector('[data-prev]').addEventListener('click', () => show(activeIndex - 1));
  lightbox.querySelector('[data-next]').addEventListener('click', () => show(activeIndex + 1));
  lightbox.addEventListener('click', event => {
    if (event.target === lightbox) closeLightbox();
  });
  lightbox.addEventListener('close', () => {
    document.body.style.overflow = '';
  });

  document.addEventListener('keydown', event => {
    if (!lightbox.open) return;
    if (event.key === 'Escape') closeLightbox();
    if (event.key === 'ArrowLeft') show(activeIndex - 1);
    if (event.key === 'ArrowRight') show(activeIndex + 1);
  });

  lightbox.addEventListener('touchstart', event => {
    touchStartX = event.changedTouches[0]?.clientX || 0;
  }, {passive: true});
  lightbox.addEventListener('touchend', event => {
    const endX = event.changedTouches[0]?.clientX || 0;
    const delta = endX - touchStartX;
    if (Math.abs(delta) < 45) return;
    show(activeIndex + (delta < 0 ? 1 : -1));
  }, {passive: true});

  renderGrid();
})();
