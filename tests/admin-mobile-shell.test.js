const assert = require('assert');
const fs = require('fs');

const read = path => fs.readFileSync(path, 'utf8');
const html = read('admin.html');
const loader = read('admin.js');
const css = read('admin-mobile.css');
const navigation = read('admin-mobile-nav.js');
const serviceWorker = read('sw.js');

assert(html.includes("'zorbas-admin-shell'"), 'Admin entry must identify the admin shell');
assert(html.includes('id="adminMobileMenuToggle"'), 'Admin needs a mobile menu trigger');
assert(html.includes('aria-controls="adminSidebar"'), 'Menu trigger must target the drawer');
assert(html.includes('id="adminMobileNavBackdrop"'), 'Admin needs a dismissible mobile backdrop');
assert(html.includes('data-admin-mobile-logout'), 'Logout must remain available inside the drawer');
assert(html.includes('/admin-mobile.css?v=20260904-mobile-admin1'), 'Admin must load the mobile stylesheet');

assert(loader.includes('/admin-mobile-nav.js?v=20260906-owner1'), 'Admin must load current owner mobile navigation behavior');
assert(css.includes('@media (max-width: 860px)'), 'Mobile layout needs a phone/tablet breakpoint');
assert(css.includes('body.admin-mobile-menu-open #appView .sidebar'), 'Open state must reveal the drawer');
assert(css.includes('#appView .waiter-mobile-top'), 'Admin must suppress duplicate waiter navigation');
assert(css.includes('env(safe-area-inset-top'), 'Mobile header must respect device safe areas');

assert(navigation.includes("event.key === 'Escape'"), 'Escape must close the drawer');
assert(navigation.includes("aria-current', 'page'"), 'Active navigation must be announced');
assert(navigation.includes("toggle.setAttribute('aria-expanded'"), 'Burger state must be accessible');
assert(navigation.includes('sidebar.inert'), 'Closed drawer must not receive keyboard focus');

assert(navigation.includes("label: 'НАЧАЛО'"), 'Owner burger must have a home group');
assert(navigation.includes("label: 'НАБЛЮДЕНИЕ'"), 'Owner burger must group live monitoring');
assert(navigation.includes("label: 'НАСТРОЙКИ'"), 'Owner burger must group settings and system tools');
assert(navigation.includes("items: ['adminStats']"), 'Reports must be the owner home entry');
assert(navigation.includes("items: ['tables', 'reservations', 'archive']"), 'Monitoring must keep tables, reservations and archive');
assert(navigation.includes("items: ['menuAdmin', 'ops', 'print']"), 'Settings must keep menu, system and print together');
assert(navigation.includes("new Set(['order', 'orders', 'manager'])"), 'Owner burger must hide waiter and manager work screens');
assert(navigation.includes("adminStats: 'Отчети'"), 'Admin stats must be presented as Reports');
assert(navigation.includes("ops: 'Система'"), 'Operational health must be presented as System');

assert(serviceWorker.includes('zorbas-v61-roles-20260906'), 'PWA cache must be on the current role generation');
assert(serviceWorker.includes('/admin-mobile.css?v=20260904-mobile-admin1'), 'PWA must cache mobile CSS');
assert(serviceWorker.includes('/admin-mobile-nav.js?v=20260906-owner1'), 'PWA must cache current mobile navigation');
assert(serviceWorker.includes('/admin-owner-dashboard.js?v=20260906-owner1'), 'PWA must cache owner dashboard enhancements');
assert(serviceWorker.includes('/admin-role-shell.js?v=20260906-owner1'), 'PWA must cache owner role shell');

console.log('ADMIN_MOBILE_SHELL_TEST_OK');
