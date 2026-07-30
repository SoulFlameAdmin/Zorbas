const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const windowListeners = new Map();
const viewportListeners = new Map();
let renderCount = 0;
let focusCount = 0;

const quickInput = {
  id: 'waiterQuickInput',
  focus() { focusCount += 1; }
};

const context = {
  console,
  Date,
  JSON,
  Number,
  Boolean,
  String,
  Math,
  Intl,
  Map,
  Set,
  URL,
  setTimeout(fn) { fn(); return 1; },
  clearTimeout() {},
  localStorage: {
    getItem() { return null; },
    setItem() {}
  },
  document: {
    activeElement: quickInput,
    getElementById(id) { return id === 'waiterQuickInput' ? quickInput : null; }
  },
  window: {
    innerWidth: 400,
    addEventListener(name, fn) { windowListeners.set(name, fn); },
    visualViewport: {
      addEventListener(name, fn) { viewportListeners.set(name, fn); }
    }
  },
  Z: {
    esc(value) { return String(value ?? ''); },
    money(value) { return `${Number(value || 0).toFixed(2)} лв.`; },
    token() { return 'test-token'; },
    rpc() { throw new Error('RPC must not run in waiter unit test'); },
    toast() {}
  },
  snapshot: {
    items: [{
      id: 'salad-50',
      name: 'Салата 50/50',
      active: true,
      category_id: 'salads',
      quantity_mode: 'portion',
      price: 12
    }],
    categories: [{id: 'salads', name: 'Салати'}],
    stations: [],
    areas: [{id: 'inside', name: 'Вътре'}],
    tables: [{id: 'table-10', area_id: 'inside', table_number: '10', seats: 4, status: 'free'}],
    orders: []
  },
  selectedArea: 'inside',
  selectedTable: 'table-10'
};
context.window.window = context.window;
context.globalThis = context;

vm.createContext(context);
vm.runInContext(fs.readFileSync('admin-waiter.js', 'utf8'), context, {filename: 'admin-waiter.js'});

vm.runInContext(`
  waiterState.step = 'note';
  waiterState.areaId = 'inside';
  waiterState.tableId = 'table-10';
  renderWaiterMobile = function () { renderCount += 1; };
  window.renderWaiterMobile = renderWaiterMobile;
`, context);
context.renderCount = renderCount;

vm.runInContext(fs.readFileSync('admin-keyboard-fix-v3.js', 'utf8'), context, {filename: 'admin-keyboard-fix-v3.js'});

// Opening the Android keyboard causes height-only resize. It must not rebuild the notepad.
windowListeners.get('resize')();
vm.runInContext('renderWaiterMobile()', context);
assert.strictEqual(context.renderCount, 0, 'Keyboard-only resize must not rerender the notepad');

// This is the reported bug: pressing ✓ while the input is focused must add the item and rerender.
vm.runInContext(`
  waiterState.query = 'S';
  waiterState.candidate = snapshot.items[0];
  acceptWaiterItem(waiterState.candidate);
`, context);
assert.strictEqual(vm.runInContext('waiterState.cart.length', context), 1, '✓ must add one item');
assert.strictEqual(vm.runInContext('waiterState.cart[0].menu_item_id', context), 'salad-50');
assert.strictEqual(vm.runInContext('waiterState.query', context), '', 'Accepted text must clear');
assert.strictEqual(context.renderCount, 1, '✓ must visibly rerender the note');
assert.strictEqual(focusCount, 1, 'Input must regain focus after accepting an item');

// Quantity changes are meaningful and must render even while the keyboard resize guard is active.
vm.runInContext('waiterState.cart[0].quantity += 1; renderWaiterMobile();', context);
assert.strictEqual(context.renderCount, 2, 'Quantity change must rerender');

// A second shorthand with an explicit quantity must merge into the existing line.
vm.runInContext(`
  waiterState.query = '2 S';
  waiterState.candidate = snapshot.items[0];
  acceptWaiterItem(waiterState.candidate);
`, context);
assert.strictEqual(vm.runInContext('waiterState.cart.length', context), 1, 'Repeated item must stay on one line');
assert.strictEqual(vm.runInContext('waiterState.cart[0].quantity', context), 4, 'Explicit quantity must be added');
assert.strictEqual(context.renderCount, 3, 'Second ✓ must rerender');

// Preview navigation is meaningful and must never be swallowed by the keyboard guard.
vm.runInContext("waiterState.step = 'preview'; renderWaiterMobile();", context);
assert.strictEqual(context.renderCount, 4, 'Preview navigation must rerender');

// Static wiring checks for the deployed waiter entry and current guard.
const loader = fs.readFileSync('admin.js', 'utf8');
const entry = fs.readFileSync('waiter.html', 'utf8');
assert(loader.includes('admin-keyboard-fix-v3.js'), 'Admin loader must use keyboard fix v3');
assert(entry.includes('20260730-keyboard3'), 'Waiter entry must force the fresh loader');

console.log('WAITER_FLOW_TEST_OK');
