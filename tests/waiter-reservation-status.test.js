const assert = require('assert');
const fs = require('fs');

const entry = fs.readFileSync('waiter.html', 'utf8');
const stable = fs.readFileSync('waiter-stable.js', 'utf8');
const statusBridge = fs.readFileSync('waiter-reservation-status.js', 'utf8');

assert(/\/waiter-reservation-status\.js\?v=[^"']+/.test(entry), 'Waiter entry must load reservation status controls with cache busting');
assert(
  entry.indexOf('/waiter-reservation-guests.js?') < entry.indexOf('/waiter-reservation-status.js?'),
  'Reservation status controls must load after the protected staff snapshot bridge'
);
assert(stable.includes('data-arrived-reservation'), 'Stable waiter must still expose the HERE reservation action');
assert(statusBridge.includes("name === 'zorbas_staff_snapshot'"), 'Status controls must derive reservation data from the protected staff snapshot');
assert(statusBridge.includes("zorbas_set_reservation_status_v1"), 'Status controls must use the staff-only reservation status RPC');
assert(statusBridge.includes("p_status: status"), 'Selected terminal reservation status must be sent to the RPC');
assert(statusBridge.includes("status === 'no_show'"), 'Status controls must support no-show');
assert(statusBridge.includes("setReservationStatus(id, 'cancelled'"), 'Status controls must support cancellation');
assert(statusBridge.includes('Date.now() >= start'), 'No-show must be time-gated until reservation time');
assert(statusBridge.includes("['requested', 'confirmed']"), 'Only active reservation states may receive terminal status controls');
assert(statusBridge.includes("document.getElementById('waiterStableRefresh')?.click()"), 'Successful status changes must refresh the stable waiter snapshot');

console.log('WAITER_RESERVATION_STATUS_OK');
