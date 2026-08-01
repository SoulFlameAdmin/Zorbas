(() => {
  const files = [
    '/admin-login-stability.js?v=20260801-login1',
    '/admin-core.js?v=20260801-boot3',
    '/admin-order.js?v=20260730-routing3',
    '/admin-auto-routing.js?v=20260730-routing3',
    '/admin-waiter.js?v=20260730-waiter1',
    '/admin-waiter-hook.js?v=20260730-waiter1',
    '/admin-waiter-v2.js?v=20260730-waiter2',
    '/admin-reservation-arrival.js?v=20260730-reservation1',
    '/admin-reservation-refresh.js?v=20260730-reservation1',
    '/admin-keyboard-fix-v3.js?v=20260730-keyboard3',
    '/admin-menu.js?v=20260801-boot3',
    '/admin-live-state.js?v=20260730-live1',
    '/admin-manager.js?v=20260730-manager1',
    '/admin-manager-v2.js?v=20260731-manager2',
    '/admin-bill-flow-v1.js?v=20260731-bill2',
    '/admin-stage1.js?v=20260731-stage1b',
    '/admin-stage2.js?v=20260731-stage2a',
    '/admin-stage3.js?v=20260731-stage3c',
    '/admin-stage3-note-checks.js?v=20260731-notechecks1',
    '/admin-note-input-stability.js?v=20260801-note1'
  ];

  const load = src => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Не може да се зареди ${src}`));
    document.body.appendChild(script);
  });

  (async () => {
    for (const file of files) await load(file);
  })().catch(error => {
    console.error(error);
    clearTimeout(window.__zorbasBootTimer);
    const boot = document.getElementById('zorbasBoot');
    const text = document.getElementById('zorbasBootText');
    if (boot) boot.classList.add('problem');
    if (text) text.textContent = 'Част от програмата не се зареди. Натисни „Опитай отново“.';
  });
})();