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
  const cartEmpty = document.getElementById('cartEmpty');
  const cartContent = document.getElementById('cartContent');
  const cartItems = document.getElementById('cartItems');
  const cartTotal = document.getElementById('cartTotal');
  const priceNote = document.getElementById('priceNote');
  const pickupForm = document.getElementById('pickupForm');
  const pickupSuccess = document.getElementById('pickupSuccess');
  const shortcutCount = document.getElementById('shortcutCount');
  const mobileCartBar = document.getElementById('mobileCartBar');
  const mobileCartCount = document.getElementById('mobileCartCount');
  const mobileCartTotal = document.getElementById('mobileCartTotal');

  Z.registerPwa();
  document.querySelectorAll('[data-install-pwa]').forEach(button => {
    button.addEventListener('click', Z.installPwa);
  });

  document.getElementById('cartShortcut').addEventListener('click', scrollToCart);
  mobileCartBar.addEventListener('click', scrollToCart);
  pickupForm.addEventListener('submit', submitPickup);

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

    pickupSuccess.hidden = true;
    renderCart();
    Z.toast(`${item.name} е добавено в количката.`, 'success');
  }

  function cartSummary() {
    return cart.reduce((summary, row) => {
      const item = itemById(row.menu_item_id);
      if (!item) return summary;
      summary.count += row.quantity;
      if (item.price_pending) {
        summary.hasPendingPrice = true;
      } else {
        summary.total += Number(item.price || 0) * row.quantity;
      }
      return summary;
    }, {count: 0, total: 0, hasPendingPrice: false});
  }

  function renderCart() {
    cart = cart.filter(row => {
      const item = itemById(row.menu_item_id);
      return item && item.available_for_pickup;
    });
    saveCart();

    const summary = cartSummary();
    const hasItems = summary.count > 0;
    shortcutCount.textContent = summary.count;
    cartEmpty.hidden = hasItems;
    cartContent.hidden = !hasItems;
    mobileCartBar.hidden = !hasItems;
    mobileCartCount.textContent = summary.count;
    cartTotal.textContent = Z.money(summary.total);
    mobileCartTotal.textContent = summary.hasPendingPrice
      ? `${Z.money(summary.total)} + цена на място`
      : Z.money(summary.total);
    priceNote.hidden = !summary.hasPendingPrice;

    cartItems.innerHTML = cart.map((row, index) => {
      const item = itemById(row.menu_item_id);
      const modeSelect = item.quantity_mode === 'portion_or_piece' ? `
        <select class="mode-select" data-mode="${index}" aria-label="Мярка за ${Z.esc(item.name)}">
          <option value="portion" ${row.meta.mode === 'portion' ? 'selected' : ''}>Порция</option>
          <option value="piece" ${row.meta.mode === 'piece' ? 'selected' : ''}>Бройки</option>
        </select>
      ` : '';
      return `
        <div class="cart-row">
          <div>
            <h3>${Z.esc(item.name)}</h3>
            <div class="cart-line">
              <button class="remove-item" type="button" data-remove="${index}">премахни</button>
              <span class="cart-price">${priceText(item)}</span>
            </div>
            ${modeSelect}
          </div>
          <div class="quantity-controls" aria-label="Количество">
            <button type="button" data-minus="${index}" aria-label="Намали ${Z.esc(item.name)}">−</button>
            <b>${row.quantity}</b>
            <button type="button" data-plus="${index}" aria-label="Увеличи ${Z.esc(item.name)}">+</button>
          </div>
        </div>
      `;
    }).join('');

    cartItems.querySelectorAll('[data-minus]').forEach(button => {
      button.addEventListener('click', () => changeQuantity(Number(button.dataset.minus), -1));
    });
    cartItems.querySelectorAll('[data-plus]').forEach(button => {
      button.addEventListener('click', () => changeQuantity(Number(button.dataset.plus), 1));
    });
    cartItems.querySelectorAll('[data-remove]').forEach(button => {
      button.addEventListener('click', () => {
        cart.splice(Number(button.dataset.remove), 1);
        renderCart();
      });
    });
    cartItems.querySelectorAll('[data-mode]').forEach(select => {
      select.addEventListener('change', () => {
        const row = cart[Number(select.dataset.mode)];
        if (row) {
          row.meta.mode = select.value;
          saveCart();
        }
      });
    });
  }

  function changeQuantity(index, change) {
    const row = cart[index];
    if (!row) return;
    row.quantity += change;
    if (row.quantity <= 0) cart.splice(index, 1);
    if (row.quantity > 99) row.quantity = 99;
    renderCart();
  }

  function setupReadyTime() {
    const ready = pickupForm.elements.ready;
    ready.min = Z.localDateTimeValue(new Date());
    if (!ready.value) {
      ready.value = Z.localDateTimeValue(new Date(Date.now() + 60 * 60 * 1000));
    }
  }

  function scrollToCart() {
    document.getElementById('cart').scrollIntoView({behavior: 'smooth', block: 'start'});
  }

  async function submitPickup(event) {
    event.preventDefault();
    if (!cart.length) {
      Z.toast('Добавете поне един продукт.', 'error');
      return;
    }

    const form = new FormData(pickupForm);
    const button = pickupForm.querySelector('[type="submit"]');
    button.disabled = true;
    button.textContent = 'ИЗПРАЩА СЕ…';

    try {
      const result = await Z.rpc('zorbas_public_pickup', {
        p_name: form.get('name'),
        p_phone: form.get('phone'),
        p_ready_at: new Date(form.get('ready')).toISOString(),
        p_items: cart,
        p_note: form.get('note') || null
      });
      pickupSuccess.innerHTML = `
        <h3>Поръчката е приета.</h3>
        <p>Код: <b>${Z.esc(result.code)}</b><br>
        Готова за: ${Z.formatDate(result.ready_at)}<br>
        Плащане при вземане от Zorbas.</p>
      `;
      pickupSuccess.hidden = false;
      cart = [];
      pickupForm.reset();
      setupReadyTime();
      renderCart();
      pickupSuccess.hidden = false;
      pickupSuccess.scrollIntoView({behavior: 'smooth', block: 'center'});
      Z.toast('Поръчката е изпратена.', 'success');
    } catch (error) {
      Z.toast(error.message, 'error');
    } finally {
      button.disabled = false;
      button.textContent = 'ПОРЪЧАЙ ЗА ВЗЕМАНЕ';
    }
  }

  async function boot() {
    setupReadyTime();
    try {
      const data = await Z.rpc('zorbas_public_catalog');
      catalog = {
        categories: Array.isArray(data?.categories) ? data.categories : [],
        items: Array.isArray(data?.items) ? data.items : [],
        areas: Array.isArray(data?.areas) ? data.areas : []
      };
      renderTabs();
      renderMenu();
      renderCart();
      if (location.hash === '#cart') {
        window.setTimeout(scrollToCart, 120);
      }
    } catch (error) {
      menuState.textContent = 'Менюто не можа да се зареди. Опитайте отново след малко.';
      menuState.classList.add('error');
      Z.toast(error.message, 'error');
    }
  }

  boot();
})();
