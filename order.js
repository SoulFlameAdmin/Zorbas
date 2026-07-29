(() => {
  'use strict';

  const Z = window.Zorbas;
  const STORAGE_KEY = 'zorbas_takeaway_cart_v1';
  let catalog = {categories: [], items: [], areas: []};
  let activeCategory = 'all';
  let cart = loadCart();

  const menuTabs = document.getElementById('menuTabs');
  const menuState = document.getElementById('menuState');
  const menuList = document.getElementById('menuList');
  const shortcutCount = document.getElementById('shortcutCount');
  const mobileCartBar = document.getElementById('mobileCartBar');
  const mobileCartCount = document.getElementById('mobileCartCount');
  const mobileCartTotal = document.getElementById('mobileCartTotal');

  if (location.hash === '#cart') {
    location.replace('/cart.html');
    return;
  }

  Z.registerPwa();
  document.querySelectorAll('[data-install-pwa]').forEach(button => {
    button.addEventListener('click', Z.installPwa);
  });

  function loadCart() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (!Array.isArray(saved)) return [];
      return saved
        .filter(row => row && typeof row.menu_item_id === 'string')
        .map(row => ({
          menu_item_id: row.menu_item_id,
          quantity: Math.max(1, Math.min(99, Number(row.quantity) || 1)),
          note: '',
          meta: {mode: row?.meta?.mode === 'piece' ? 'piece' : 'portion'}
        }));
    } catch {
      return [];
    }
  }

  function saveCart() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    } catch {
      // The cart still works for this visit when storage is unavailable.
    }
  }

  function itemById(id) {
    return catalog.items.find(item => item.id === id);
  }

  function categoryHasItems(id) {
    return catalog.items.some(item => item.category_id === id);
  }

  function visibleItems() {
    return catalog.items.filter(item => activeCategory === 'all' || item.category_id === activeCategory);
  }

  function priceText(item) {
    return item.price_pending ? 'Цена на място' : Z.money(item.price);
  }

  function foodEmoji(item) {
    const value = `${item.name || ''} ${item.description || ''}`.toLocaleLowerCase('bg-BG');
    if (/салат|домати|крастав|зелена/.test(value)) return '🥗';
    if (/гирос|дюнер|пита/.test(value)) return '🥙';
    if (/сувлаки|шиш|кебап/.test(value)) return '🍢';
    if (/риба|ципура|лаврак|сьомга/.test(value)) return '🐟';
    if (/октопод|калмар|скарид|морск/.test(value)) return '🦑';
    if (/бургер/.test(value)) return '🍔';
    if (/пица/.test(value)) return '🍕';
    if (/картоф/.test(value)) return '🍟';
    if (/пиле|пилеш/.test(value)) return '🍗';
    if (/свин|ребр|месо|стек/.test(value)) return '🥩';
    if (/сирене|кашкавал|фета/.test(value)) return '🧀';
    if (/супа/.test(value)) return '🥣';
    if (/торта|десерт|слад|баклава/.test(value)) return '🍰';
    if (/вино/.test(value)) return '🍷';
    if (/бира/.test(value)) return '🍺';
    if (/кафе/.test(value)) return '☕';
    if (/вода|сок|лимонад|напит/.test(value)) return '🥤';
    return '🍽️';
  }

  function renderTabs() {
    const categories = catalog.categories.filter(category => categoryHasItems(category.id));
    const tabs = [{id: 'all', name: 'Всичко'}, ...categories];
    menuTabs.innerHTML = tabs.map(tab => `
      <button
        class="category-tab ${activeCategory === tab.id ? 'active' : ''}"
        type="button"
        data-category="${Z.esc(tab.id)}"
        aria-pressed="${activeCategory === tab.id}">
        ${Z.esc(tab.name)}
      </button>
    `).join('');

    menuTabs.querySelectorAll('[data-category]').forEach(button => {
      button.addEventListener('click', () => {
        activeCategory = button.dataset.category;
        renderTabs();
        renderMenu();
      });
    });
  }

  function renderMenu() {
    const items = visibleItems();
    menuState.hidden = true;
    menuList.innerHTML = items.map(item => {
      const visual = item.image_url
        ? `<img src="${Z.esc(item.image_url)}" alt="" loading="lazy">`
        : `<span aria-hidden="true">${foodEmoji(item)}</span>`;
      const action = item.available_for_pickup
        ? `<button class="add-button" type="button" data-add="${Z.esc(item.id)}" aria-label="Добави ${Z.esc(item.name)} в количката">+</button>`
        : '<span class="restaurant-only">Само в ресторанта</span>';
      return `
        <article class="menu-item">
          <div class="item-visual">${visual}</div>
          <div class="item-copy">
            <h3>${Z.esc(item.name)}</h3>
            ${item.description ? `<p>${Z.esc(item.description)}</p>` : ''}
            <strong class="item-price">${priceText(item)}</strong>
          </div>
          <div class="item-action">${action}</div>
        </article>
      `;
    }).join('');

    if (!items.length) {
      menuState.textContent = 'В тази категория все още няма продукти.';
      menuState.hidden = false;
    }

    menuList.querySelectorAll('[data-add]').forEach(button => {
      button.addEventListener('click', () => addItem(button.dataset.add));
    });
  }

  function addItem(id) {
    const item = itemById(id);
    if (!item || !item.available_for_pickup) return;

    const row = cart.find(entry => entry.menu_item_id === id);
    if (row) {
      row.quantity = Math.min(99, row.quantity + 1);
    } else {
      cart.push({
        menu_item_id: id,
        quantity: 1,
        note: '',
        meta: {mode: item.quantity_mode === 'piece' ? 'piece' : 'portion'}
      });
    }

    renderCartSummary();
    Z.toast(`${item.name} е добавено в количката.`, 'success');
  }

  function renderCartSummary() {
    cart = cart.filter(row => {
      const item = itemById(row.menu_item_id);
      return item && item.available_for_pickup;
    });
    saveCart();

    const summary = cart.reduce((result, row) => {
      const item = itemById(row.menu_item_id);
      if (!item) return result;
      result.count += row.quantity;
      if (item.price_pending) {
        result.hasPendingPrice = true;
      } else {
        result.total += Number(item.price || 0) * row.quantity;
      }
      return result;
    }, {count: 0, total: 0, hasPendingPrice: false});

    shortcutCount.textContent = summary.count;
    mobileCartCount.textContent = summary.count;
    document.querySelectorAll('[data-cart-count]').forEach(node => {
      node.textContent = summary.count;
      node.hidden = summary.count === 0;
    });
    mobileCartBar.hidden = summary.count === 0;
    mobileCartTotal.textContent = summary.hasPendingPrice
      ? `${Z.money(summary.total)} + цена на място`
      : Z.money(summary.total);
  }

  async function boot() {
    try {
      const data = await Z.rpc('zorbas_public_catalog');
      catalog = {
        categories: Array.isArray(data?.categories) ? data.categories : [],
        items: Array.isArray(data?.items) ? data.items : [],
        areas: Array.isArray(data?.areas) ? data.areas : []
      };
      renderTabs();
      renderMenu();
      renderCartSummary();
    } catch (error) {
      menuState.textContent = 'Менюто не можа да се зареди. Опитайте отново след малко.';
      menuState.classList.add('error');
      Z.toast(error.message, 'error');
    }
  }

  boot();
})();
