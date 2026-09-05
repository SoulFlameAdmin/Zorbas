const assert = require('assert');
const fs = require('fs');

const live = fs.readFileSync('reserve-live.js', 'utf8');
const reserve = fs.readFileSync('reserve.js', 'utf8');
const html = fs.readFileSync('reserve.html', 'utf8');
const home = fs.readFileSync('index.html', 'utf8');
const launcher = fs.readFileSync('reserve-launcher.js', 'utf8');

assert(!live.includes("getElementById('reservationForm')"), 'Realtime helper must not take control of the reservation form');
assert(!live.includes("getElementById('reserveSubmit')"), 'Realtime helper must not toggle the reservation submit button');
assert(reserve.includes("await checkExactSlot(true)"), 'Main reservation flow must re-check the exact slot before saving');
assert(reserve.includes("zorbas_public_reserve"), 'Main reservation flow must save through the public reservation RPC');
assert(html.includes('reserve-live.js?v=20260905-stable1'), 'Reservation page must load the stabilized realtime helper');

assert(home.includes('data-open="reservationDialog"'), 'Homepage reservation entry point must remain discoverable');
assert(launcher.includes('[data-open="reservationDialog"]'), 'Homepage reservation button must be intercepted by the stable reservation launcher');
assert(launcher.includes("location.assign('/reserve.html?v=20260905-stable2')"), 'Homepage reservation must route to the stabilized dedicated reservation page');

console.log('PUBLIC_RESERVATION_CLIENT_STABILITY_OK');
