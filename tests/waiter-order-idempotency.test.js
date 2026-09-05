const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

(async () => {
  const storage = new Map();
  const calls = [];
  let uuidCounter = 0;
  let firstSubmit = true;

  const context = {
    console,
    Date,
    JSON,
    Math,
    Object,
    Array,
    String,
    Number,
    globalThis: null,
    sessionStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); }
    },
    crypto: {
      randomUUID() { uuidCounter += 1; return `00000000-0000-4000-8000-${String(uuidCounter).padStart(12, '0')}`; }
    },
    window: {
      Zorbas: {
        async rpc(name, payload, options) {
          calls.push({name, payload, options});
          if (name === 'zorbas_create_order_v5' && firstSubmit) {
            firstSubmit = false;
            throw new Error('simulated lost response');
          }
          return {id: 'order-1', code: 'TESTCODE'};
        }
      }
    }
  };
  context.globalThis = context;
  context.window.window = context.window;

  vm.createContext(context);
  vm.runInContext(fs.readFileSync('waiter-order-idempotency.js', 'utf8'), context, {filename: 'waiter-order-idempotency.js'});

  const payload = {
    p_token: 'secret-token',
    p_table_id: 'table-10',
    p_visit_id: null,
    p_open_new_guest: true,
    p_order_type: 'dine_in',
    p_customer_name: null,
    p_customer_phone: null,
    p_ready_at: null,
    p_note: 'без лед',
    p_items: [{menu_item_id: 'water', quantity: 2, note: '', meta: {mode: 'portion', options: {}}}],
    p_route: 'both'
  };

  await assert.rejects(
    context.window.Zorbas.rpc('zorbas_create_order_v4', payload),
    /simulated lost response/,
    'An unknown/lost response must remain retryable'
  );

  await context.window.Zorbas.rpc('zorbas_create_order_v4', payload);

  assert.strictEqual(calls.length, 2, 'Retry must make exactly one additional RPC call');
  assert.strictEqual(calls[0].name, 'zorbas_create_order_v5', 'Stable waiter v4 submit must be upgraded to idempotent v5');
  assert.strictEqual(calls[1].name, 'zorbas_create_order_v5', 'Retry must still use idempotent v5');
  assert.ok(calls[0].payload.p_idempotency_key, 'First submit must include an idempotency key');
  assert.strictEqual(
    calls[0].payload.p_idempotency_key,
    calls[1].payload.p_idempotency_key,
    'Same logical order must reuse the same key after a lost response'
  );
  assert.strictEqual(calls[0].payload.p_token, 'secret-token', 'Staff token must still reach the RPC');
  assert(!storage.get('zorbas_waiter_order_idempotency_v1')?.includes('secret-token'), 'Persisted retry state must never contain the staff token');

  await context.window.Zorbas.rpc('zorbas_create_order_v4', payload);
  assert.strictEqual(calls.length, 3);
  assert.notStrictEqual(
    calls[2].payload.p_idempotency_key,
    calls[1].payload.p_idempotency_key,
    'After a confirmed success, a later identical order is a new intent and must get a new key'
  );

  const entry = fs.readFileSync('waiter.html', 'utf8');
  assert(/\/waiter-order-idempotency\.js\?v=[^"']+/.test(entry), 'Waiter entry must load the order idempotency bridge');
  assert(
    entry.indexOf('/waiter-stable.js?') < entry.indexOf('/waiter-order-idempotency.js?') &&
    entry.indexOf('/waiter-order-idempotency.js?') < entry.indexOf('/waiter-reservation-guests.js?'),
    'Idempotency bridge must wrap the stable waiter before the reservation snapshot bridge'
  );

  console.log('WAITER_ORDER_IDEMPOTENCY_OK');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
