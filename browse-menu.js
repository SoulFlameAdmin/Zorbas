(() => {
  'use strict';

  const Z = window.Zorbas;
  const STORAGE_KEY = 'zorbas_takeaway_cart_v1';
  let catalog = {categories: [], items: []};

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
    return item.price_pending ? 'Цена на място' : Z.money(item.price);
  }

  function menuGroups() {
    const groups = catalog.categories
      .map(category => ({
        id: category.id,
        name: category.name,
        items: catalog.items.filter(item => item.category_id === category.id)
      }))
      .filter(group => group.items.length);

    const knownIds = new Set(catalog.categories.map(category => category.id));
    const uncategorized = catalog.items.filter(item => !knownIds.has(item.category_id));
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

    menuSections.innerHTML = groups.map((group, index) => `
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
    `).join('');
  }

  async function boot() {
    updateCartCount();
    try {
      const data = await Z.rpc('zorbas_public_catalog');
      catalog = {
        categories: Array.isArray(data?.categories) ? data.categories : [],
        items: Array.isArray(data?.items) ? data.items : []
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
