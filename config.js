(() => {
  const URL = 'https://frhletkiuupgksmgxoxc.supabase.co';
  const KEY = 'sb_publishable_JQPnalB8jOs639_PWoR6mA_AOk11xWC';
  const tokenKey = 'zorbas_staff_token_v3';
  const pwaInstalledKey = 'zorbas_pwa_installed_v1';
  let installPrompt = null;

  async function rpc(name, payload = {}) {
    const response = await fetch(`${URL}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.message || data?.hint || 'Възникна грешка.');
    }
    return data;
  }

  function token() { return localStorage.getItem(tokenKey) || ''; }
  function setToken(value) { value ? localStorage.setItem(tokenKey, value) : localStorage.removeItem(tokenKey); }
  function deviceId() {
    let id = localStorage.getItem('zorbas_device_id');
    if (!id) {
      id = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      localStorage.setItem('zorbas_device_id', id);
    }
    return id;
  }
  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  }
  function money(value) { return `${Number(value || 0).toFixed(2)} лв.`; }
  function localDate(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  function localDateTimeValue(date = new Date()) {
    return `${localDate(date)}T${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
  }
  function formatDate(value) {
    return value ? new Date(value).toLocaleString('bg-BG', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '—';
  }
  function toast(message, type = 'info') {
    let box = document.getElementById('toast');
    if (!box) {
      box = document.createElement('div');
      box.id = 'toast';
      document.body.appendChild(box);
    }
    box.className = `toast show ${type}`;
    box.textContent = message;
    clearTimeout(box._timer);
    box._timer = setTimeout(() => box.classList.remove('show'), 3200);
  }
  async function requireSession() {
    const value = token();
    if (!value) return null;
    try { return await rpc('zorbas_session_info', {p_token: value}); }
    catch { setToken(''); return null; }
  }
  async function logout() {
    const value = token();
    if (value) await rpc('zorbas_logout', {p_token: value}).catch(() => {});
    setToken('');
    location.reload();
  }
  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }
  function setInstallButtons(label, disabled = false) {
    document.querySelectorAll('[data-install-pwa]').forEach(btn => {
      btn.hidden = false;
      btn.disabled = disabled;
      btn.textContent = label;
      btn.setAttribute('aria-label', label.replace(/^[^\p{L}\p{N}]+/u, ''));
    });
  }
  function refreshInstallButtons() {
    if (isStandalone()) {
      localStorage.setItem(pwaInstalledKey, '1');
      setInstallButtons('✓ Изтеглено', true);
      return;
    }
    if (localStorage.getItem(pwaInstalledKey) === '1') {
      setInstallButtons('↗ Отвори Zorbas');
      return;
    }
    setInstallButtons('⬇ Изтегли');
  }
  async function detectInstalledPwa() {
    if (isStandalone()) {
      localStorage.setItem(pwaInstalledKey, '1');
      return true;
    }
    if (typeof navigator.getInstalledRelatedApps !== 'function') {
      return localStorage.getItem(pwaInstalledKey) === '1';
    }
    try {
      const apps = await navigator.getInstalledRelatedApps();
      const installed = apps.some(app => {
        if (app.platform !== 'webapp' || !app.url) return false;
        try { return new URL(app.url, location.href).origin === location.origin; }
        catch { return false; }
      });
      if (installed) localStorage.setItem(pwaInstalledKey, '1');
      return installed || localStorage.getItem(pwaInstalledKey) === '1';
    } catch {
      return localStorage.getItem(pwaInstalledKey) === '1';
    }
  }
  function refreshPwaMetadata() {
    const manifest = document.querySelector('link[rel="manifest"]');
    if (manifest) manifest.href = '/manifest.webmanifest?v=open7';
    const favicon = document.querySelector('link[rel~="icon"]') || document.createElement('link');
    favicon.rel = 'icon';
    favicon.type = 'image/png';
    favicon.href = '/icon-192.png?v=tower6';
    if (!favicon.parentNode) document.head.appendChild(favicon);
    let appleIcon = document.querySelector('link[rel="apple-touch-icon"]');
    if (!appleIcon) {
      appleIcon = document.createElement('link');
      appleIcon.rel = 'apple-touch-icon';
      document.head.appendChild(appleIcon);
    }
    appleIcon.href = '/apple-touch-icon.png?v=tower6';
    let appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (!appleTitle) {
      appleTitle = document.createElement('meta');
      appleTitle.name = 'apple-mobile-web-app-title';
      document.head.appendChild(appleTitle);
    }
    appleTitle.content = 'Zorbas';
    let appleCapable = document.querySelector('meta[name="apple-mobile-web-app-capable"]');
    if (!appleCapable) {
      appleCapable = document.createElement('meta');
      appleCapable.name = 'apple-mobile-web-app-capable';
      document.head.appendChild(appleCapable);
    }
    appleCapable.content = 'yes';
  }
  function registerPwa() {
    refreshPwaMetadata();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', {updateViaCache: 'none'})
        .then(registration => registration.update())
        .catch(() => {});
    }
    const refreshAndDetect = () => {
      refreshInstallButtons();
      detectInstalledPwa().then(refreshInstallButtons);
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', refreshAndDetect, {once: true});
    } else {
      refreshAndDetect();
    }
  }
  function openInstalledPwa(event) {
    if (isStandalone()) {
      refreshInstallButtons();
      return;
    }
    const target = new URL('/?source=pwa-open', location.origin);
    if (/Android/i.test(navigator.userAgent)) {
      const hasUserGesture = event?.isTrusted || navigator.userActivation?.isActive;
      if (!hasUserGesture) {
        setInstallButtons('↗ Отвори Zorbas');
        return;
      }
      location.href = `intent://${location.host}/?source=pwa-open#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end`;
      return;
    }
    if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
      toast('Отвори Zorbas от иконата на началния екран.');
      return;
    }
    location.assign(target.href);
  }
  async function installPwa(event) {
    if (isStandalone()) {
      refreshInstallButtons();
      toast('Zorbas вече е отворено като приложение.', 'success');
      return;
    }
    if (localStorage.getItem(pwaInstalledKey) === '1' && !installPrompt) {
      openInstalledPwa(event);
      return;
    }
    if (installPrompt) {
      const promptEvent = installPrompt;
      installPrompt = null;
      setInstallButtons('Изтегля се…', true);
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === 'accepted') {
        setInstallButtons('Изтегля се…', true);
        toast('Zorbas се изтегля…', 'success');
      } else {
        localStorage.removeItem(pwaInstalledKey);
        refreshInstallButtons();
      }
      return;
    }
    if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
      toast('На iPhone натисни Споделяне → „Добави към Начален екран“.');
      return;
    }
    toast('Отвори сайта в Chrome и натисни отново „Изтегли“.');
  }
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    localStorage.removeItem(pwaInstalledKey);
    refreshInstallButtons();
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    localStorage.setItem(pwaInstalledKey, '1');
    setInstallButtons('↗ Отвори Zorbas');
    toast('Изтеглено ✓ Натисни „Отвори Zorbas“.', 'success');
  });
  window.matchMedia('(display-mode: standalone)').addEventListener?.('change', refreshInstallButtons);

  window.Zorbas = {URL, KEY, rpc, token, setToken, deviceId, esc, money, localDate, localDateTimeValue, formatDate, toast, requireSession, logout, registerPwa, installPwa, openInstalledPwa};
})();
