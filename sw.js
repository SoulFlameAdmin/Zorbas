const CACHE='zorbas-v41-table-first-reservation-20260730';
const CORE=['/','/index.html','/menu.html','/order.html','/cart.html','/browse-menu.css?v=20260729-aegean6','/browse-menu.js?v=20260729-aegean4','/menu.css?v=20260729-pen3','/order.js?v=20260729-order1','/cart.js?v=20260729-cart2','/zorbas-menu-logo.jpg','/site.css?v=20260729-loader4','/public.js?v=20260729-pwa6','/reservation-mobile-v3.js?v=20260730-1','/reservation-mobile-v3.css?v=20260730-1','/config.js?v=20260729-pwa8','/staff.css','/waiter-mobile.css?v=20260730-waiter1','/waiter-mobile-v2.css?v=20260730-waiter2','/waiter-reservation.css?v=20260730-reservation1','/waiter.html','/admin.html','/admin.js?v=20260730-reservation1','/admin-core.js','/admin-order.js','/admin-waiter.js?v=20260730-waiter1','/admin-waiter-hook.js?v=20260730-waiter1','/admin-waiter-v2.js?v=20260730-waiter2','/admin-reservation-arrival.js?v=20260730-reservation1','/admin-reservation-refresh.js?v=20260730-reservation1','/admin-keyboard-fix-v3.js?v=20260730-keyboard3','/admin-menu.js','/kitchen.html','/kitchen-v2.css?v=20260730-kitchen2','/kitchen.js?v=20260730-kitchen2','/print.html','/print.js?v=20260730-bridge4','/manifest.webmanifest?v=launch8','/icon-192.png?v=tower6','/icon-512.png?v=tower6','/apple-touch-icon.png?v=tower6'];
const RESERVATION_LOADER=`;(()=>{if(document.querySelector('script[data-crv3]'))return;const s=document.createElement('script');s.src='/reservation-mobile-v3.js?v=20260730-1';s.dataset.crv3='1';document.head.appendChild(s)})();`;
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.hostname.includes('supabase.co'))return;
  if(url.pathname==='/public.js'){
    event.respondWith((async()=>{
      let response;
      try{response=await fetch(event.request,{cache:'no-store'});}catch{response=await caches.match(event.request)||await caches.match('/public.js?v=20260729-pwa6');}
      if(!response)return new Response(RESERVATION_LOADER,{headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'no-store'}});
      const headers=new Headers(response.headers);headers.set('content-type','application/javascript; charset=utf-8');headers.set('cache-control','no-store');
      return new Response(`${await response.text()}\n${RESERVATION_LOADER}`,{status:response.status,statusText:response.statusText,headers});
    })());
    return;
  }
  const freshAsset=url.pathname.startsWith('/admin')||url.pathname.startsWith('/waiter')||url.pathname.startsWith('/staff')||url.pathname.startsWith('/kitchen')||url.pathname.startsWith('/print')||url.pathname==='/site.css';
  if(event.request.mode==='navigate'||freshAsset){
    event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response;}).catch(()=>caches.match(event.request).then(response=>response||caches.match('/'))));
    return;
  }
  event.respondWith(caches.match(event.request).then(response=>response||fetch(event.request).then(network=>{const copy=network.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return network;})));
});
