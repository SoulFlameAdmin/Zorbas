/* ZORBAS · idempotent waiter order submit bridge
   Reuses one request key only while a logical order submit is unresolved. */
(() => {
  'use strict';

  const Z = window.Zorbas;
  if (!Z || typeof Z.rpc !== 'function') return;

  const STORAGE_KEY = 'zorbas_waiter_order_idempotency_v1';
  const MAX_AGE_MS = 12 * 60 * 60 * 1000;
  const MAX_ENTRIES = 20;
  const originalRpc = Z.rpc.bind(Z);
  let pending = loadPending();

  function stableStringify(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }

  function fingerprint(payload) {
    const safe = {...(payload || {})};
    delete safe.p_token;
    delete safe.p_idempotency_key;
    return stableStringify(safe);
  }

  function createKey() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    const random = Math.random().toString(36).slice(2);
    return `order-${Date.now()}-${random}-${Math.random().toString(36).slice(2)}`;
  }

  function loadPending() {
    try {
      const raw = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
      return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    } catch {
      return {};
    }
  }

  function prune() {
    const now = Date.now();
    const rows = Object.entries(pending)
      .filter(([, row]) => row && typeof row.key === 'string' && row.key.length >= 12 && now - Number(row.created_at || 0) < MAX_AGE_MS)
      .sort((a, b) => Number(b[1].created_at || 0) - Number(a[1].created_at || 0))
      .slice(0, MAX_ENTRIES);
    pending = Object.fromEntries(rows);
  }

  function savePending() {
    prune();
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pending)); } catch {}
  }

  function requestKeyFor(requestFingerprint) {
    prune();
    const existing = pending[requestFingerprint];
    if (existing?.key) return existing.key;
    const key = createKey();
    pending[requestFingerprint] = {key, created_at: Date.now()};
    savePending();
    return key;
  }

  function resolveRequest(requestFingerprint, key) {
    if (pending[requestFingerprint]?.key !== key) return;
    delete pending[requestFingerprint];
    savePending();
  }

  Z.rpc = async function idempotentWaiterRpc(name, payload = {}, options = {}) {
    if (name !== 'zorbas_create_order_v4') return originalRpc(name, payload, options);

    const requestFingerprint = fingerprint(payload);
    const key = requestKeyFor(requestFingerprint);

    try {
      const result = await originalRpc('zorbas_create_order_v5', {...payload, p_idempotency_key: key}, options);
      resolveRequest(requestFingerprint, key);
      return result;
    } catch (error) {
      // Keep the same key after an unknown/failed response. A retry of the same
      // logical order will either create it once or replay the already-created row.
      savePending();
      throw error;
    }
  };
})();
