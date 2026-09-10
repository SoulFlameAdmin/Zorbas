// ZORBAS live sync · resilient realtime + polling fallback
(() => {
  if (window.ZorbasLive) return;

  const listeners = new Set();
  let started = false;
  let lastVersion = null;
  let fallbackTimer = null;
  let reconnectTimer = null;
  let realtimeClient = null;
  let realtimeChannel = null;
  let realtimeStatus = 'idle';
  let realtimeStarting = null;
  let polling = false;
  let scriptPromise = null;
  let notifyTimer = null;
  let lastPollOkAt = 0;
  let lastPollErrorAt = 0;

  const Z = () => window.Zorbas;
  const online = () => navigator.onLine !== false;

  function notify(source = 'live') {
    clearTimeout(notifyTimer);
    notifyTimer = setTimeout(() => {
      listeners.forEach(listener => {
        try {
          Promise.resolve(listener({
            source,
            version: lastVersion,
            connected: isConnected(),
            realtime: realtimeStatus
          })).catch(() => {});
        } catch {}
      });
    }, 80);
  }

  function isPollFresh() {
    return lastPollOkAt > 0 && Date.now() - lastPollOkAt < 7000;
  }

  function isConnected() {
    return online() && (realtimeStatus === 'SUBSCRIBED' || isPollFresh());
  }

  async function pollVersion(force = false) {
    if (polling || !Z() || !online()) return false;
    polling = true;
    const recovering = lastPollErrorAt > lastPollOkAt;
    try {
      const result = await Z().rpc('zorbas_live_version');
      const version = Number(result?.version || 0);
      lastPollOkAt = Date.now();

      if (lastVersion === null) {
        lastVersion = version;
        if (force) notify(recovering ? 'reconnected' : 'initial');
      } else if (version !== lastVersion) {
        lastVersion = version;
        notify('poll');
      } else if (recovering) {
        notify('reconnected');
      } else if (force) {
        notify('visible');
      }
      return true;
    } catch {
      lastPollErrorAt = Date.now();
      return false;
    } finally {
      polling = false;
    }
  }

  function loadSupabaseClient() {
    if (window.supabase?.createClient) return Promise.resolve(window.supabase);
    if (scriptPromise) return scriptPromise;

    scriptPromise = new Promise((resolve, reject) => {
      const stale = document.querySelector('script[data-zorbas-supabase-live]');
      if (stale && !window.supabase?.createClient) stale.remove();

      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
      script.async = true;
      script.dataset.zorbasSupabaseLive = '1';
      script.onload = () => {
        const library = window.supabase;
        if (library?.createClient) resolve(library);
        else {
          script.remove();
          reject(new Error('Supabase realtime client did not load'));
        }
      };
      script.onerror = error => {
        script.remove();
        reject(error);
      };
      document.head.appendChild(script);
    }).finally(() => {
      scriptPromise = null;
    });

    return scriptPromise;
  }

  async function resetRealtimeChannel() {
    const channel = realtimeChannel;
    realtimeChannel = null;
    if (channel && realtimeClient?.removeChannel) {
      try { await realtimeClient.removeChannel(channel); } catch {}
    }
  }

  async function startRealtime() {
    if (!online() || !Z()) return;
    if (realtimeStatus === 'SUBSCRIBED' && realtimeChannel) return;
    if (realtimeStarting) return realtimeStarting;

    realtimeStarting = (async () => {
      realtimeStatus = 'connecting';
      try {
        const library = await loadSupabaseClient();
        if (!library?.createClient || !Z() || !online()) return;

        if (!realtimeClient) {
          realtimeClient = library.createClient(Z().URL, Z().KEY, {
            auth: {persistSession:false, autoRefreshToken:false, detectSessionInUrl:false},
            realtime: {params:{eventsPerSecond:10}}
          });
        }

        await resetRealtimeChannel();
        const channel = realtimeClient
          .channel(`zorbas-live-${Math.random().toString(36).slice(2)}`)
          .on('postgres_changes', {
            event: '*', schema: 'public', table: 'zorbas_live_updates'
          }, payload => {
            const version = Number(payload?.new?.version || 0);
            if (!version || version !== lastVersion) {
              lastVersion = version || lastVersion;
              notify('realtime');
            }
          });

        realtimeChannel = channel;
        channel.subscribe(status => {
          realtimeStatus = status || 'unknown';
          if (status === 'SUBSCRIBED') {
            notify('realtime-connected');
            pollVersion(true);
            return;
          }
          if (['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)) {
            notify('realtime-degraded');
          }
        });
      } catch {
        realtimeStatus = 'unavailable';
      }
    })().finally(() => {
      realtimeStarting = null;
    });

    return realtimeStarting;
  }

  function ensureRealtime() {
    if (!online()) return;
    if (realtimeStatus !== 'SUBSCRIBED') startRealtime();
  }

  function start() {
    if (started) return;
    started = true;

    pollVersion(false);
    fallbackTimer = setInterval(() => {
      pollVersion(false);
    }, 2000);

    reconnectTimer = setInterval(() => {
      if (!online()) return;
      if (realtimeStatus !== 'SUBSCRIBED') ensureRealtime();
    }, 15000);

    startRealtime();

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        pollVersion(true);
        ensureRealtime();
      }
    });

    window.addEventListener('online', () => {
      realtimeStatus = realtimeStatus === 'SUBSCRIBED' ? realtimeStatus : 'reconnecting';
      pollVersion(true);
      ensureRealtime();
    });

    window.addEventListener('offline', () => {
      realtimeStatus = 'offline';
      notify('offline');
    });
  }

  function subscribe(listener, options = {}) {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    start();
    if (options.immediate) {
      Promise.resolve().then(() => listener({
        source:'subscribe',
        version:lastVersion,
        connected:isConnected(),
        realtime:realtimeStatus
      })).catch(() => {});
    }
    return () => listeners.delete(listener);
  }

  window.ZorbasLive = {
    subscribe,
    refresh: () => pollVersion(true),
    reconnect: () => startRealtime(),
    get version() { return lastVersion; },
    get connected() { return isConnected(); },
    get status() {
      return {
        online: online(),
        connected: isConnected(),
        realtime: realtimeStatus,
        lastPollOkAt: lastPollOkAt || null,
        lastPollErrorAt: lastPollErrorAt || null
      };
    }
  };
})();
