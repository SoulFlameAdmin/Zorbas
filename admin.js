(() => {
  const files = [
    '/admin-core.js',
    '/admin-order.js?v=20260730-routing2',
    '/admin-auto-routing.js?v=20260730-routing2',
    '/admin-waiter.js?v=20260730-waiter1',
    '/admin-waiter-hook.js?v=20260730-waiter1',
    '/admin-waiter-v2.js?v=20260730-waiter2',
    '/admin-reservation-arrival.js?v=20260730-reservation1',
    '/admin-reservation-refresh.js?v=20260730-reservation1',
    '/admin-keyboard-fix-v3.js?v=20260730-keyboard3',
    '/admin-menu.js',
    '/admin-live-state.js?v=20260730-live1',
    '/admin-manager.js?v=20260730-manager1'
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
    '/admin-manager.css?v=20260730-manager1'
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
