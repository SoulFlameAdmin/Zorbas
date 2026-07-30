const assert = require('assert');
const fs = require('fs');

const read = path => fs.readFileSync(path, 'utf8');
const arrival = read('admin-reservation-arrival.js');
const refresh = read('admin-reservation-refresh.js');
const loader = read('admin.js');
const waiterEntry = read('waiter.html');
const kitchen = read('kitchen.js');
const kitchenHtml = read('kitchen.html');
const kitchenCss = read('kitchen-v2.css');
const waiterCss = read('waiter-reservation.css');

assert(arrival.includes("zorbas_mark_reservation_arrived_v4"), 'Waiter must call the arrival RPC');
assert(arrival.includes("p_route: 'kitchen'"), 'Preorder must be routed to kitchen on arrival');
assert(arrival.includes("data-reservation-action=\"arrived\""), 'Arrival screen must have a TUK action');
assert(arrival.includes('ТУК'), 'Arrival button label must be TUK');
assert(arrival.includes("button.classList.add('reserved')"), 'Reserved tables must be marked');
assert(waiterCss.includes('.waiter-table-card.reserved'), 'Reserved table must have yellow styling');
assert(refresh.includes("['areas', 'tables']"), 'Reservations must refresh while selecting areas or tables');
assert(loader.indexOf('admin-reservation-arrival.js') < loader.indexOf('admin-keyboard-fix-v3.js'), 'Reservation renderer must load before keyboard guard');
assert(loader.includes('admin-reservation-refresh.js'), 'Live reservation refresh must be loaded');
assert(waiterEntry.includes('20260730-reservation1'), 'Waiter entry must force fresh reservation assets');

assert(kitchenHtml.includes('data-kitchen-view="notes"'), 'Kitchen needs Notes button');
assert(kitchenHtml.includes('data-kitchen-view="reservations"'), 'Kitchen needs Reservations button');
assert(kitchen.includes("['cancelled', 'completed', 'returned'].includes(order.status)"), 'Cancelled orders must be hidden');
assert(kitchen.includes("['kitchen', 'both'].includes(order.print_route)"), 'Only kitchen-routed notes must be shown');
assert(kitchen.includes("PАКЕТ") || kitchen.includes('ПАКЕТ'), 'Pickup notes must be labeled as package');
assert(kitchen.includes('КАКВО ЩЕ ЯДАТ'), 'Reservation cards must show preorder food');
assert(kitchen.includes("reservation.status === 'seated'"), 'Seated reservations must be visible as arrived');
assert(kitchenCss.includes('.kitchen-primary-tabs'), 'Kitchen buttons must be styled');

console.log('RESERVATION_KITCHEN_FLOW_OK');