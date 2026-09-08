const fs = require('fs');
const assert = require('assert');

const read = path => fs.readFileSync(path, 'utf8');
const galleryHtml = read('gallery.html');
const galleryCss = read('gallery.css');
const galleryJs = read('gallery.js');
const launcher = read('reserve-launcher.js');

assert(galleryHtml.includes('id="photoGrid"'), 'gallery page must expose a photo-only grid');
assert(galleryHtml.includes('id="lightbox"'), 'gallery page must have an onsite lightbox');
assert(galleryHtml.includes('/gallery.js?v='), 'gallery behavior must be loaded');
assert(galleryHtml.includes('/gallery.css?v='), 'gallery styling must be loaded');
assert(galleryHtml.includes('facebook.com/profile.php?id=100078458821839&sk=photos'), 'Facebook photos must remain available as a secondary source link');

assert(galleryCss.includes('.photo-grid'), 'gallery must use a responsive photo grid');
assert(galleryCss.includes('.lightbox'), 'gallery must provide fullscreen photo viewing');

assert(galleryJs.includes('restaurants10.com'), 'social/business photo sources must render directly inside the site');
assert(galleryJs.includes('cdn.oink.bg/gallery/87849/'), 'restaurant gallery photo sources must render directly inside the site');
assert(galleryJs.includes("loading = index < 4 ? 'eager' : 'lazy'"), 'gallery must lazy-load non-leading photos');
assert(galleryJs.includes("event.key === 'ArrowLeft'"), 'lightbox must support keyboard navigation');
assert(galleryJs.includes("touchstart"), 'lightbox must support touch navigation');
assert(galleryJs.includes('localFallbacks'), 'remote photo failures must have local fallbacks');

assert(launcher.includes("location.assign('/gallery.html')"), 'homepage photos action must stay inside Zorbas');
assert(launcher.includes('data-open-gallery'), 'homepage photos link must be normalized to the onsite gallery');
assert(!launcher.includes("location.assign('https://www.google.com/search"), 'homepage photos action must not leave for Google Images');

console.log('PASS gallery: homepage photos stay onsite, gallery is photo-only, responsive and opens fullscreen with resilient sources.');
