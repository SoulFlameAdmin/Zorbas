const loader = document.querySelector('.page-loader');
const header = document.querySelector('.site-header');
const menuToggle = document.querySelector('.menu-toggle');
const mobileMenu = document.querySelector('.mobile-menu');
const mobileLinks = document.querySelectorAll('.mobile-menu a');
const reveals = document.querySelectorAll('.reveal');
const bookingForm = document.querySelector('#booking-form');
const formStatus = document.querySelector('.form-status');
const year = document.querySelector('#year');

window.addEventListener('load', () => {
  window.setTimeout(() => loader?.classList.add('is-hidden'), 650);
});

const updateHeader = () => {
  header?.classList.toggle('scrolled', window.scrollY > 35);
};

updateHeader();
window.addEventListener('scroll', updateHeader, { passive: true });

const closeMenu = () => {
  document.body.classList.remove('menu-open');
  menuToggle?.classList.remove('active');
  menuToggle?.setAttribute('aria-expanded', 'false');
  mobileMenu?.classList.remove('active');
  mobileMenu?.setAttribute('aria-hidden', 'true');
};

menuToggle?.addEventListener('click', () => {
  const isOpen = menuToggle.classList.toggle('active');
  document.body.classList.toggle('menu-open', isOpen);
  menuToggle.setAttribute('aria-expanded', String(isOpen));
  mobileMenu?.classList.toggle('active', isOpen);
  mobileMenu?.setAttribute('aria-hidden', String(!isOpen));
});

mobileLinks.forEach((link) => link.addEventListener('click', closeMenu));

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.13 }
);

reveals.forEach((item) => observer.observe(item));

document.querySelector('.hero-content')?.classList.add('visible');

bookingForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(bookingForm);
  const name = String(data.get('name') || '').trim();
  const date = String(data.get('date') || '').trim();
  const time = String(data.get('time') || '').trim();

  if (!name || !date || !time) {
    formStatus.textContent = 'Попълни задължителните полета.';
    return;
  }

  formStatus.textContent = `Благодарим, ${name}. Заявката е подготвена. Ще свържем формата със системата за потвърждение.`;
  bookingForm.reset();
});

if (year) {
  year.textContent = String(new Date().getFullYear());
}
