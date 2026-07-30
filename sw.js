const CACHE='zorbas-v42-standalone-reservation-20260730';
const CORE=['/','/index.html','/reserve.html','/reserve.css?v=20260730-2','/reserve.js?v=20260730-2','/reserve-launcher.js?v=20260730-2','/menu.html','/order.html','/cart.html','/browse-menu.css?v=20260729-aegean6','/browse-menu.js?v=20260729-aegean4','/menu.css?v=20260729-pen3','/order.js?v=20260729-order1','/cart.js?v=20260729-cart2','/zorbas-menu-logo.jpg','/site.css?v=20260729-loader4','/public.js?v=20260729-pwa6','/config.js?v=20260729-pwa8','/staff.css','/waiter.html','/admin.html','/kitchen.html','/print.html','/manifest.webmanifest?v=launch8','/icon-192.png?v=tower6','/icon-512.png?v=tower6','/apple-touch-icon.png?v=tower6'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.hostname.includes('supabase.co'))return;
  const networkFirst=event.request.mode==='navigate'||url.pathname.startsWith('/reserve')||url.pathname.startsWith('/admin')||url.pathname.startsWith('/waiter')||url.pathname.startsWith('/staff')||url.pathname.startsWith('/kitchen')||url.pathname.startsWith('/print')||url.pathname==='/public.js'||url.pathname==='/site.css'||url.pathname==='/config.js';
  if(networkFirst){
    event.respondWith(fetch(event.request,{cache:'no-store'}).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response;}).catch(()=>caches.match(event.request).then(response=>response||caches.match('/'))));
    return;
  }
  event.respondWith(caches.match(event.request).then(response=>response||fetch(event.request).then(network=>{const copy=network.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return network;})));
});
