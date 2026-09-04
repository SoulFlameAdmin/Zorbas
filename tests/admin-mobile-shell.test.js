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

assert(loader.includes('/admin-mobile-nav.js?v=20260904-mobile-admin1'), 'Admin must load mobile navigation behavior');
assert(css.includes('@media (max-width: 860px)'), 'Mobile layout needs a phone/tablet breakpoint');
assert(css.includes('body.admin-mobile-menu-open #appView .sidebar'), 'Open state must reveal the drawer');
assert(css.includes('#appView .waiter-mobile-top'), 'Admin must suppress duplicate waiter navigation');
assert(css.includes('env(safe-area-inset-top'), 'Mobile header must respect device safe areas');

assert(navigation.includes("event.key === 'Escape'"), 'Escape must close the drawer');
assert(navigation.includes("aria-current', 'page'"), 'Active navigation must be announced');
assert(navigation.includes("toggle.setAttribute('aria-expanded'"), 'Burger state must be accessible');
assert(navigation.includes('sidebar.inert'), 'Closed drawer must not receive keyboard focus');

assert(serviceWorker.includes('zorbas-v56-mobile-admin-20260904'), 'PWA cache must be refreshed');
assert(serviceWorker.includes('/admin-mobile.css?v=20260904-mobile-admin1'), 'PWA must cache mobile CSS');
assert(serviceWorker.includes('/admin-mobile-nav.js?v=20260904-mobile-admin1'), 'PWA must cache mobile navigation');

console.log('ADMIN_MOBILE_SHELL_TEST_OK');
