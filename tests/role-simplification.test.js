const assert = require('assert');
const fs = require('fs');

const read = file => fs.readFileSync(file, 'utf8');
const waiter = read('waiter.html');
const kitchenHtml = read('kitchen.html');
const kitchen = read('kitchen.js');
const adminCore = read('admin-core.js');
const adminNav = read('admin-mobile-nav.js');
const adminLoader = read('admin.js');
const ownerDashboard = read('admin-owner-dashboard.js');
const ownerRole = read('admin-role-shell.js');
const serviceDay = read('supabase/migrations/20260906133500_zorbas_service_day_0500.sql');
const dashboardMigration = read('supabase/migrations/20260906133000_zorbas_owner_dashboard_v2.sql');

assert(waiter.includes('▦ Маси · Нова бележка'), 'Waiter must start from tables/new note');
assert(waiter.includes('☰ Моите бележки'), 'Waiter must keep notes');
assert(waiter.includes('◷ Резервации'), 'Waiter must keep reservations');
assert(!waiter.includes('/admin.html?view=manager'), 'Waiter must not expose full management');
assert(!waiter.includes('href="/print.html"'), 'Waiter must not expose print operations');

assert(kitchenHtml.includes('<h1>Manager</h1>'), 'Kitchen device must be presented as Manager');
assert(kitchenHtml.includes('Най-старите бележки са първи'), 'Manager must explain oldest-first queue');
assert(kitchen.includes('groups.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))'), 'Manager queue must sort oldest first');
assert(kitchen.includes('zorbas_manager_set_delivered_quantity_v1'), 'Manager must track delivered quantity');
assert(kitchen.includes('zorbas_manager_update_item_v1'), 'Manager must assign items to staff');
assert(kitchen.includes('zorbas_manager_complete_order_v1'), 'Manager must explicitly complete a fully delivered note');
assert(kitchen.includes('Бележка №${order.order_number} · Сервитьор:'), 'Manager must show note and waiter identity together');

assert(adminCore.includes("activeView='adminStats'"), 'Owner admin must default to reports');
assert(adminCore.includes("switchView(allowed.includes(requested)?requested:'adminStats')"), 'Owner admin must land on reports without a requested safe view');
assert(adminNav.includes("new Set(['order', 'orders', 'manager'])"), 'Owner menu must hide operational waiter/manager screens');
assert(adminNav.includes("{label: 'НАЧАЛО', items: ['adminStats']}"), 'Owner menu must put reports first');
assert(ownerRole.includes("blockedViews = new Set(['order', 'orders', 'manager'])"), 'Owner role shell must enforce non-operational views');
assert(adminLoader.includes('/admin-owner-dashboard.js?v=20260906-owner1'), 'Owner dashboard enhancement must load');
assert(adminLoader.includes('/admin-role-shell.js?v=20260906-owner1'), 'Owner role shell must load last');

assert(ownerDashboard.includes("data.dashboardRange = '5years'") || ownerDashboard.includes("dataset.dashboardRange = '5years'"), 'Owner dashboard must add a 5-year range');
assert(ownerDashboard.includes("dataset.dashboardRange = '10years'"), 'Owner dashboard must add a 10-year range');
assert(ownerDashboard.includes('statsWaiters'), 'Owner dashboard must render waiter statistics');
assert(dashboardMigration.includes("'by_waiter'"), 'Owner dashboard RPC must return waiter statistics');

assert(serviceDay.includes("time '05:00'"), 'Service day must roll at 05:00 Europe/Sofia');
assert(serviceDay.includes('zorbas_private_service_day_start'), 'Service-day helper must be installed');
assert(serviceDay.includes('v.opened_at>=public.zorbas_private_service_day_start(now())'), 'Old visits must stop being live after the service-day boundary');
assert(serviceDay.includes('rr.start_at>=v_day_start'), 'Staff reservation snapshot must start from the current service day');

console.log('ROLE_SIMPLIFICATION_TEST_OK');
