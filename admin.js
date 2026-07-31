(() => {
  const files = [
    '/admin-core.js',
    '/admin-order.js?v=20260730-routing3',
    '/admin-auto-routing.js?v=20260730-routing3',
    '/admin-waiter.js?v=20260730-waiter1',
    '/admin-waiter-hook.js?v=20260730-waiter1',
    '/admin-waiter-v2.js?v=20260730-waiter2',
    '/admin-reservation-arrival.js?v=20260730-reservation1',
    '/admin-reservation-refresh.js?v=20260730-reservation1',
    '/admin-keyboard-fix-v3.js?v=20260730-keyboard3',
    '/admin-menu.js',
    '/admin-live-state.js?v=20260730-live1',
    '/admin-manager.js?v=20260730-manager1',
    '/admin-manager-v2.js?v=20260731-manager2',
    '/admin-bill-flow-v1.js?v=20260731-bill2',
    '/admin-stage1.js?v=20260731-stage1b',
    '/admin-stage2.js?v=20260731-stage2a',
    '/admin-stage3.js?v=20260731-stage3b'
  ];
  const load = src => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Не може да се зареди ${src}`));
    document.body.appendChild(script);
  });
  [
    '/waiter-mobile.css?v=20260730-waiter1',
    '/waiter-mobile-v2.css?v=20260730-waiter2',
    '/waiter-reservation.css?v=20260730-reservation1',
    '/admin-manager.css?v=20260730-manager1',
    '/admin-manager-v2.css?v=20260731-manager2',
    '/admin-bill-flow-v1.css?v=20260731-bill1',
    '/admin-stage1.css?v=20260731-stage1',
    '/admin-stage2.css?v=20260731-stage2a',
    '/admin-stage3.css?v=20260731-stage3b'
  ].forEach(href => {
    if (document.querySelector(`link[href="${href}"]`)) return;
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = href;
    document.head.appendChild(style);
  });
  (async () => { for (const file of files) await load(file); })().catch(error => {
    document.body.innerHTML = `<main style="padding:30px;color:white;background:#0b1018;min-height:100vh"><h1>Грешка при зареждане</h1><p>${error.message}</p></main>`;
  });
})();
