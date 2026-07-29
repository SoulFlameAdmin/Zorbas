(() => {
  const files = ['/admin-core.js', '/admin-order.js', '/admin-menu.js'];
  const load = src => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Не може да се зареди ${src}`));
    document.body.appendChild(script);
  });
  (async () => { for (const file of files) await load(file); })().catch(error => {
    document.body.innerHTML = `<main style="padding:30px;color:white;background:#0b1018;min-height:100vh"><h1>Грешка при зареждане</h1><p>${error.message}</p></main>`;
  });
})();