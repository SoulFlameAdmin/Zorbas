const CACHE='zorbas-v60-security-20260905';
const CORE=[
  '/','/index.html',
  '/reserve.html','/reserve.css?v=20260730-2','/config.js?v=20260730-live1','/login-challenge-guard.js?v=20260905-1','/live-sync.js?v=20260730-live1','/reserve.js?v=20260730-live1','/reserve-live.js?v=20260905-stable1',
  '/menu.html','/order.html','/cart.html','/browse-menu.css?v=20260729-aegean6','/browse-menu.js?v=20260729-aegean4','/menu.css?v=20260729-pen3','/order.js?v=20260729-order1','/cart.js?v=20260729-cart2','/zorbas-menu-logo.jpg','/site.css?v=20260729-loader4','/public.js?v=20260729-pwa6',
  '/staff.css','/staff-mobile-2026.css?v=20260801-mobile1','/staff-simple-notes-2026.css?v=20260801-simple1',
  '/waiter.html','/waiter-stable.css?v=20260904-stable2','/waiter-stable.js?v=20260904-stable2','/waiter-order-idempotency.js?v=20260905-1','/waiter-reservation-guests.js?v=20260905-1','/waiter-reservation-status.js?v=20260905-1',
  '/admin.html','/admin.js?v=20260801-bill-visible1','/admin-core.js?v=20260801-boot3','/admin-mobile.css?v=20260904-mobile-admin1','/admin-mobile-nav.js?v=20260904-mobile-admin1','/admin-waiter-home-v1.js?v=20260801-home2','/admin-waiter-note-final.js?v=20260801-note4','/admin-manager-active-final.js?v=20260801-manager-active1','/admin-manager-stability-v2.js?v=20260801-manager-stable2','/admin-waiter-receipts-final.js?v=20260801-waiter-receipts2',
  '/kitchen.html','/kitchen-v2.css?v=20260730-kitchen2','/kitchen.js?v=20260730-live1','/kitchen-live.js?v=20260730-live1',
  '/print.html','/print-browser-safety.js?v=20260905-1','/print.js?v=20260730-correction1-v5-prod2',
  '/manifest.webmanifest?v=launch8','/icon-192.png?v=tower6','/icon-512.png?v=tower6','/apple-touch-icon.png?v=tower6'
];

async function cacheCoreIndividually(){
  const cache=await caches.open(CACHE);
  await Promise.allSettled(CORE.map(async url=>{
    const request=new Request(url,{cache:'reload'});
    const response=await fetch(request);
    if(response.ok) await cache.put(request,response);
  }));
}

self.addEventListener('install',event=>{
  event.waitUntil(cacheCoreIndividually().then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

async function cachedFallback(cache,request){
  return (await cache.match(request)) || (await cache.match(request,{ignoreSearch:true}));
}

async function networkFirst(request){
  const cache=await caches.open(CACHE);
  try{
    const response=await fetch(request,{cache:'no-store'});
    if(response.ok) await cache.put(request,response.clone());
    return response;
  }catch{
    return (await cachedFallback(cache,request)) || (request.mode==='navigate' ? await cache.match('/') : Response.error());
  }
}

async function cacheFirst(request){
  const cache=await caches.open(CACHE);
  const cached=await cachedFallback(cache,request);
  if(cached) return cached;
  const response=await fetch(request);
  if(response.ok) await cache.put(request,response.clone());
  return response;
}

self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.hostname.includes('supabase.co')) return;
  if(url.origin!==self.location.origin) return;

  const networkFirstPath=
    event.request.mode==='navigate'||
    url.pathname.startsWith('/reserve')||
    url.pathname.startsWith('/admin')||
    url.pathname.startsWith('/waiter')||
    url.pathname.startsWith('/staff')||
    url.pathname.startsWith('/manager')||
    url.pathname.startsWith('/kitchen')||
    url.pathname.startsWith('/print')||
    url.pathname==='/login-challenge-guard.js'||
    url.pathname==='/live-sync.js'||
    url.pathname==='/browse-menu.js'||
    url.pathname==='/public.js'||
    url.pathname==='/site.css'||
    url.pathname==='/config.js'||
    url.pathname==='/sw.js';

  event.respondWith(networkFirstPath ? networkFirst(event.request) : cacheFirst(event.request));
});
