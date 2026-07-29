(() => {
  const URL = 'https://frhletkiuupgksmgxoxc.supabase.co';
  const KEY = 'sb_publishable_JQPnalB8jOs639_PWoR6mA_AOk11xWC';
  const tokenKey = 'zorbas_staff_token_v3';
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
  function registerPwa() {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
  async function installPwa() {
    if (installPrompt) {
      installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
      return;
    }
    toast('От менюто на браузъра избери „Инсталирай приложението“ или „Добави към началния екран“.');
  }
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    document.querySelectorAll('[data-install-pwa]').forEach(btn => btn.hidden = false);
  });

  window.Zorbas = {URL, KEY, rpc, token, setToken, deviceId, esc, money, localDate, localDateTimeValue, formatDate, toast, requireSession, logout, registerPwa, installPwa};
})();