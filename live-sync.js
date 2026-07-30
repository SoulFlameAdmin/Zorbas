// Final production retry: 2026-07-30T15:43:00+03:00
(() => {
  if (window.ZorbasLive) return;

  const listeners = new Set();
  let started = false;
  let lastVersion = null;
  let fallbackTimer = null;
  let realtimeChannel = null;
  let polling = false;
  let scriptPromise = null;
  let notifyTimer = null;

  const Z = () => window.Zorbas;

  function notify(source = 'live') {
    clearTimeout(notifyTimer);
    notifyTimer = setTimeout(() => {
      listeners.forEach(listener => {
        try { Promise.resolve(listener({source, version:lastVersion})).catch(() => {}); }
        catch {}
      });
    }, 80);
  }

  async function pollVersion(force = false) {
    if (polling || !Z()) return;
    polling = true;
    try {
      const result = await Z().rpc('zorbas_live_version');
      const version = Number(result?.version || 0);
      if (lastVersion === null) {
        lastVersion = version;
        if (force) notify('initial');
      } else if (version !== lastVersion) {
        lastVersion = version;
        notify('poll');
      } else if (force) {
        notify('visible');
      }
    } catch {}
    finally { polling = false; }
  }

  function loadSupabaseClient() {
    if (window.supabase?.createClient) return Promise.resolve(window.supabase);
    if (scriptPromise) return scriptPromise;
    scriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-zorbas-supabase-live]');
      if (existing) {
        existing.addEventListener('load', () => resolve(window.supabase), {once:true});
        existing.addEventListener('error', reject, {once:true});
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
      script.async = true;
      script.dataset.zorbasSupabaseLive = '1';
      script.onload = () => resolve(window.supabase);
      script.onerror = reject;
      document.head.appendChild(script);
    });
    return scriptPromise;
  }

  async function startRealtime() {
    try {
      const library = await loadSupabaseClient();
      if (!library?.createClient || !Z()) return;
      const client = library.createClient(Z().URL, Z().KEY, {
        auth: {persistSession:false, autoRefreshToken:false, detectSessionInUrl:false},
        realtime: {params:{eventsPerSecond:10}}
      });
      realtimeChannel = client
        .channel(`zorbas-live-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'zorbas_live_updates'
        }, payload => {
          const version = Number(payload?.new?.version || 0);
          if (!version || version !== lastVersion) {
            lastVersion = version || lastVersion;
            notify('realtime');
          }
        })
        .subscribe();
    } catch {
      // The polling fallback remains active.
    }
  }

  function start() {
    if (started) return;
    started = true;
    pollVersion(false);
    fallbackTimer = setInterval(() => pollVersion(false), 2000);
    startRealtime();
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) pollVersion(true);
    });
    window.addEventListener('online', () => pollVersion(true));
  }

  function subscribe(listener, options = {}) {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    start();
    if (options.immediate) Promise.resolve().then(() => listener({source:'subscribe', version:lastVersion})).catch(() => {});
    return () => listeners.delete(listener);
  }

  window.ZorbasLive = {
    subscribe,
    refresh: () => pollVersion(true),
    get version() { return lastVersion; },
    get connected() { return Boolean(realtimeChannel); }
  };
})();
