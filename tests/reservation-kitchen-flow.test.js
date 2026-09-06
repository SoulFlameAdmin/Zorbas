const assert = require('assert');
const fs = require('fs');

const read = path => fs.readFileSync(path, 'utf8');
const arrival = read('admin-reservation-arrival.js');
const refresh = read('admin-reservation-refresh.js');
const loader = read('admin.js');
const waiterEntry = read('waiter.html');
const stableWaiter = read('waiter-stable.js');
const stableWaiterCss = read('waiter-stable.css');
const reservationGuests = read('waiter-reservation-guests.js');
const kitchen = read('kitchen.js');
const kitchenHtml = read('kitchen.html');
const kitchenCss = read('kitchen-v2.css');
const waiterCss = read('waiter-reservation.css');

// Legacy admin reservation flow remains covered because admin.html can still use it internally.
assert(arrival.includes("zorbas_mark_reservation_arrived_v4"), 'Admin waiter must call the arrival RPC');
assert(arrival.includes("p_route: 'kitchen'"), 'Admin preorder must be routed to kitchen on arrival');
assert(arrival.includes("data-reservation-action=\"arrived\""), 'Admin arrival screen must have a HERE action');
assert(arrival.includes('ТУК'), 'Admin arrival button label must be TUK');
assert(arrival.includes("button.classList.add('reserved')"), 'Admin reserved tables must be marked');
assert(waiterCss.includes('.waiter-table-card.reserved'), 'Admin reserved table must have reserved styling');
assert(refresh.includes("['areas', 'tables']"), 'Admin reservations must refresh while selecting areas or tables');
assert(loader.indexOf('admin-reservation-arrival.js') < loader.indexOf('admin-keyboard-fix-v3.js'), 'Admin reservation renderer must load before keyboard guard');
assert(loader.includes('admin-reservation-refresh.js'), 'Admin live reservation refresh must be loaded');

// Production waiter.html uses the stable waiter runtime.
assert(/\/waiter-stable\.js\?v=[^"']+/.test(waiterEntry), 'Production waiter entry must load the stable waiter runtime with cache busting');
assert(/\/waiter-reservation-guests\.js\?v=[^"']+/.test(waiterEntry), 'Production waiter entry must load the reservation guest bridge with cache busting');
assert(waiterEntry.indexOf('/waiter-stable.js?') < waiterEntry.indexOf('/waiter-reservation-guests.js?'), 'Reservation guest bridge must load after stable waiter runtime');
assert(stableWaiter.includes("zorbas_mark_reservation_arrived_v4"), 'Stable waiter must call the arrival RPC');
assert(stableWaiter.includes("p_route: 'kitchen'"), 'Stable waiter must route reservation preorder to kitchen on arrival');
assert(stableWaiter.includes('data-arrived-reservation'), 'Stable waiter reservation screen must have an arrival action');
assert(stableWaiter.includes('ТУК / HERE'), 'Stable waiter arrival action must be bilingual');
assert(stableWaiter.includes("['requested', 'confirmed']"), 'Stable waiter must show active upcoming reservations');
assert(stableWaiterCss.includes('.ws-table-card.reserved'), 'Stable waiter reserved tables must have reserved styling');
assert(reservationGuests.includes("name === 'zorbas_staff_snapshot'"), 'Reservation guest bridge must use protected staff snapshot data');

assert(kitchenHtml.includes('data-kitchen-view="notes"'), 'Manager needs Notes button');
assert(kitchenHtml.includes('data-kitchen-view="reservations"'), 'Manager needs Reservations button');
assert(kitchen.includes("['cancelled', 'returned'].includes(order.status)"), 'Cancelled and returned orders must be hidden from Manager');
assert(kitchen.includes("['kitchen', 'both'].includes(order.print_route)"), 'Only kitchen-routed notes must be shown');
assert(kitchen.includes('ПАКЕТ'), 'Pickup notes must be labeled as package');
assert(kitchen.includes('ПРЕДВАРИТЕЛНА ХРАНА'), 'Reservation cards must show preorder food');
assert(kitchen.includes("reservation.status === 'seated'"), 'Seated reservations must be visible as arrived');
assert(kitchen.includes('zorbas_manager_set_delivered_quantity_v1'), 'Manager must track how many units were handed off');
assert(kitchen.includes('zorbas_manager_complete_order_v1'), 'Manager must complete a fully handed-off note');
assert(kitchenCss.includes('.kitchen-primary-tabs'), 'Kitchen buttons must be styled');

console.log('RESERVATION_KITCHEN_FLOW_OK');
