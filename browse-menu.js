(() => {
  'use strict';

  const Z = window.Zorbas;
  const STORAGE_KEY = 'zorbas_takeaway_cart_v1';
  const HIDDEN_PUBLIC_CODES = new Set([
    'voda',
    'tikvichki-grucki',
    'skaridi-skara',
    'sirene-skara',
    'skaridi',
    'kalmari',
    'grucka-musaka',
    'kartofi',
    'kartofi-sirene',
    'pileshki-shishcheta',
    'svinski-shishcheta',
    'pileshka-purjola',
    'pileshko-file',
    'svinski-gurdi',
    'biftek'
  ]);
  const ALLERGENS = [
    'Зърнени култури, съдържащи глутен',
    'Ракообразни и продукти от тях',
    'Яйца и продукти от тях',
    'Риба и рибни продукти',
    'Фъстъци и продукти от тях',
    'Соя и соеви продукти',
    'Мляко и млечни продукти',
    'Ядки',
    'Целина и продукти от нея',
    'Синап и продукти от него',
    'Сусамово семе и продукти от него',
    'Серен диоксид и сулфити',
    'Лупина и продукти от нея',
    'Мекотели и продукти от тях'
  ];

  let catalog = {categories: [], items: [], settings: {}};

  const menuState = document.getElementById('menuState');
  const menuSections = document.getElementById('menuSections');

  Z.registerPwa();
  document.querySelectorAll('[data-install-pwa]').forEach(button => {
    button.addEventListener('click', Z.installPwa);
  });

  function cartCount() {
    try {
      const cart = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (!Array.isArray(cart)) return 0;
      return cart.reduce((sum, row) => sum + Math.max(0, Number(row?.quantity) || 0), 0);
    } catch {
      return 0;
    }
  }

  function updateCartCount() {
    const count = cartCount();
    document.querySelectorAll('[data-cart-count]').forEach(node => {
      node.textContent = count;
      node.hidden = count === 0;
    });
  }

  function priceText(item) {
    if (item.price_pending) return 'Цена на място';

    const euro = Number(item.price);
    const bgn = Number(item.option_schema?.menu_bgn);
    const hasEuro = Number.isFinite(euro) && euro > 0;
    const hasBgn = Number.isFinite(bgn) && bgn > 0;

    if (hasBgn && hasEuro) return `${bgn.toFixed(2)} лв. / ${euro.toFixed(2)} €`;
    if (hasBgn) return `${bgn.toFixed(2)} лв.`;
    if (hasEuro) return `${euro.toFixed(2)} €`;
    return 'Цена на място';
  }

  function visibleItems() {
    return catalog.items.filter(item => !HIDDEN_PUBLIC_CODES.has(item.code));
  }

  function menuGroups() {
    const items = visibleItems();
    const groups = catalog.categories
      .map(category => ({
        id: category.id,
        name: category.name,
        items: items.filter(item => item.category_id === category.id)
      }))
      .filter(group => group.items.length);

    const knownIds = new Set(catalog.categories.map(category => category.id));
    const uncategorized = items.filter(item => !knownIds.has(item.category_id));
    if (uncategorized.length) {
      groups.push({id: 'other', name: 'Други предложения', items: uncategorized});
    }
    return groups;
  }

  function renderDish(item) {
    const restaurantOnly = item.available_for_pickup
      ? ''
      : '<span class="restaurant-note">само в ресторанта</span>';

    return `
      <article class="printed-dish">
        <div class="dish-title-line">
          <h3>${Z.esc(item.name)}</h3>
          <i aria-hidden="true"></i>
          <strong>${priceText(item)}</strong>
        </div>
        ${item.description ? `<p>${Z.esc(item.description)}</p>` : ''}
        ${restaurantOnly}
      </article>
    `;
  }

  function renderCategory(group, index) {
    return `
      <section class="printed-category ${index % 2 ? 'category-even' : ''}" aria-labelledby="category-${Z.esc(group.id)}">
        <header>
          <span aria-hidden="true">◆</span>
          <div>
            <small>ΚΑΤΗΓΟΡΙΑ</small>
            <h2 id="category-${Z.esc(group.id)}">${Z.esc(group.name)}</h2>
          </div>
          <span aria-hidden="true">◆</span>
        </header>
        <div class="printed-dishes">
          ${group.items.map(renderDish).join('')}
        </div>
      </section>
    `;
  }

  function renderAllergens(index) {
    return `
      <section class="printed-category ${index % 2 ? 'category-even' : ''}" aria-labelledby="category-allergens">
        <header>
          <span aria-hidden="true">◆</span>
          <div>
            <small>ALLERGENS</small>
            <h2 id="category-allergens">Алергени</h2>
          </div>
          <span aria-hidden="true">◆</span>
        </header>
        <div class="printed-dishes">
          ${ALLERGENS.map((allergen, allergenIndex) => `
            <article class="printed-dish">
              <div class="dish-title-line">
                <h3>${allergenIndex + 1}. ${Z.esc(allergen)}</h3>
              </div>
            </article>
          `).join('')}
        </div>
      </section>
    `;
  }

  function renderRestaurantInfo(index) {
    const settingsPhone = String(catalog.settings?.phone || '0876765929').replace(/\s+/g, '');
    const phone = settingsPhone === '0876765929' ? '0876 76 59 29' : settingsPhone;
    const address = catalog.settings?.address || 'бул. „Панайот Хитов“ 1, Сливен';

    const rows = [
      ['Резервации', '0892 33 20 17'],
      ['Телефон', phone],
      ['Адрес', address],
      ['Работно време', 'Всеки ден от 12:00 до 23:00 часа'],
      ['Почивен ден', 'Понеделник'],
      ['Цени', 'Потвърдените цени са изписани в лева и евро. Непотвърдените са „Цена на място“.']
    ];

    return `
      <section class="printed-category ${index % 2 ? 'category-even' : ''}" aria-labelledby="category-information">
        <header>
          <span aria-hidden="true">◆</span>
          <div>
            <small>ZORBAS · SLIVEN</small>
            <h2 id="category-information">Информация</h2>
          </div>
          <span aria-hidden="true">◆</span>
        </header>
        <div class="printed-dishes">
          ${rows.map(([label, value]) => `
            <article class="printed-dish">
              <div class="dish-title-line">
                <h3>${Z.esc(label)}</h3>
                <i aria-hidden="true"></i>
                <strong>${Z.esc(value)}</strong>
              </div>
            </article>
          `).join('')}
        </div>
      </section>
    `;
  }

  function renderMenu() {
    const groups = menuGroups();
    const itemCount = groups.reduce((sum, group) => sum + group.items.length, 0);
    menuSections.classList.toggle('single-category', groups.length === 1);
    menuState.hidden = itemCount > 0;

    if (!itemCount) {
      menuState.textContent = 'В тази категория все още няма ястия.';
      menuSections.innerHTML = '';
      return;
    }

    const menuHtml = groups.map(renderCategory).join('');
    menuSections.innerHTML = `${menuHtml}${renderAllergens(groups.length)}${renderRestaurantInfo(groups.length + 1)}`;
  }

  async function boot() {
    updateCartCount();
    try {
      const data = await Z.rpc('zorbas_public_catalog');
      catalog = {
        categories: Array.isArray(data?.categories) ? data.categories : [],
        items: Array.isArray(data?.items) ? data.items : [],
        settings: data?.settings && typeof data.settings === 'object' ? data.settings : {}
      };
      renderMenu();
    } catch (error) {
      menuState.textContent = 'Менюто не можа да се зареди. Опитайте отново след малко.';
      menuState.classList.add('error');
      Z.toast(error.message, 'error');
    }
  }

  window.addEventListener('storage', updateCartCount);
  window.addEventListener('pageshow', updateCartCount);
  boot();
})();
