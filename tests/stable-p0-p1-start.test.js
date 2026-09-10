const fs = require('fs');
const assert = require('assert');

const read = path => fs.readFileSync(path, 'utf8');

const pickupMigration = read('supabase/migrations/20260910184500_zorbas_public_pickup_price_quantity_guard_v1.sql');
const resetMigration = read('supabase/migrations/20260910185500_zorbas_daily_reset_close_stale_visits_v1.sql');
const order = read('order.js');
const cart = read('cart.js');
const waiter = read('waiter.html');
const notesCss = read('waiter-stable-notes.css');
const notesJs = read('waiter-stable-notes.js');
const sw = read('sw.js');
const orderHtml = read('order.html');
const cartHtml = read('cart.html');

// Backend is authoritative for public pickup.
assert(pickupMigration.includes("coalesce(v_menu.price_pending, false) or coalesce(v_menu.price, 0) <= 0"), 'backend must reject pending or zero prices');
assert(pickupMigration.includes("v_quantity < 1 or v_quantity > 99"), 'backend must constrain public quantity');
assert(pickupMigration.includes("v_quantity <> trunc(v_quantity)"), 'public quantity must be an integer');
assert(pickupMigration.includes('for share;'), 'menu rows must be locked while the order is validated and inserted');
assert(pickupMigration.indexOf('for v_item in') < pickupMigration.indexOf('insert into public.zorbas_orders('), 'all cart rows must be validated before creating the order');
assert(pickupMigration.includes("length(trim(coalesce(p_note,''))) > 500"), 'order notes must have a server-side size limit');
assert(pickupMigration.includes("length(trim(coalesce(v_item.note,''))) > 160"), 'item notes must have a server-side size limit');

// Public UI must agree with backend rules.
for (const [name, source] of [['order', order], ['cart', cart]]) {
  assert(source.includes('function isOrderable(item)'), `${name} must centralize orderable-product rules`);
  assert(source.includes("!Boolean(item?.price_pending)"), `${name} must reject pending prices`);
  assert(source.includes("Number(item?.price || 0) > 0"), `${name} must reject zero prices`);
}
assert(order.includes('Изчаква цена'), 'menu must explain why a product cannot be added');
assert(cart.includes('invalidRow'), 'checkout must revalidate the cart immediately before RPC submit');
assert(cart.includes('Number(row.quantity) > 99'), 'checkout must reject out-of-range quantity before RPC submit');

// Long operational notes must wrap and grow instead of being clipped.
assert(waiter.includes('/waiter-stable-notes.css?v=20260910-1'), 'waiter must load stable note wrapping CSS');
assert(waiter.includes('/waiter-stable-notes.js?v=20260910-1'), 'waiter must load stable note auto-grow JS');
assert(notesCss.includes('white-space: pre-wrap !important'), 'displayed notes must preserve wrapping/newlines');
assert(notesCss.includes('overflow-wrap: anywhere !important'), 'long note words must wrap instead of overflow');
assert(notesCss.includes('text-overflow: clip !important'), 'notes must not use ellipsis clipping');
assert(notesJs.includes("document.createElement('textarea')"), 'item note editor must become multiline');
assert(notesJs.includes('Math.max(field.scrollHeight, 38)'), 'note editors must auto-grow with content');
assert(notesJs.includes('textarea.maxLength = 160'), 'item note draft must keep its existing size bound');
assert(notesJs.includes('orderNote.maxLength = 500'), 'order note draft must match backend size bound');

// The service worker must actually deliver this release rather than an older cached JS file.
assert(sw.includes("const CACHE='zorbas-v63-stable-p0p1-20260910'"), 'stable rollout must advance the PWA cache namespace');
assert(sw.includes('/waiter-stable-notes.css?v=20260910-1'), 'offline waiter must cache the note wrapping stylesheet');
assert(sw.includes('/waiter-stable-notes.js?v=20260910-1'), 'offline waiter must cache the note auto-grow module');
const orderScript = orderHtml.match(/<script src="(\/order\.js\?v=[^"]+)"/i)?.[1];
const cartScript = cartHtml.match(/<script src="(\/cart\.js\?v=[^"]+)"/i)?.[1];
assert(orderScript && sw.includes(`'${orderScript}'`), 'service worker must pre-cache the exact order.js URL loaded by order.html');
assert(cartScript && sw.includes(`'${cartScript}'`), 'service worker must pre-cache the exact cart.js URL loaded by cart.html');

// 05:00 rollover closes stale operational visits without inventing a payment.
assert(resetMigration.includes("opened_at < v_day_start"), 'daily reset must target only visits from a previous service day');
assert(resetMigration.includes("status = 'completed'"), 'stale visits must stop remaining operationally active');
assert(resetMigration.includes("'auto_closed_reason', 'service_day_rollover'"), 'automatic rollover must be traceable in visit metadata');
assert(resetMigration.includes("'bill_status_at_auto_close', bill_status"), 'automatic rollover must record the bill state it found');
assert(!resetMigration.includes("bill_status = 'paid'"), 'daily reset must never pretend an unpaid visit was paid');
assert(!resetMigration.includes('paid_at = now()'), 'daily reset must never fabricate a payment timestamp');

console.log('PASS Zorbas stable start: pickup guard, full note wrapping, PWA delivery and safe 05:00 rollover are protected.');
