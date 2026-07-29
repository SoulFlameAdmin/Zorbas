(() => {
  'use strict';

  const Z = window.Zorbas;
  const STORAGE_KEY = 'zorbas_takeaway_cart_v1';
  let catalog = {categories: [], items: [], areas: []};
  let cart = loadCart();

  const cartLoading = document.getElementById('cartLoading');
  const cartEmpty = document.getElementById('cartEmpty');
  const cartContent = document.getElementById('cartContent');
  const cartItems = document.getElementById('cartItems');
  const cartTotal = document.getElementById('cartTotal');
  const priceNote = document.getElementById('priceNote');
  const checkoutPanel = document.getElementById('checkoutPanel');
  const pickupForm = document.getElementById('pickupForm');
  const pickupSuccess = document.getElementById('pickupSuccess');

  Z.registerPwa();
  document.querySelectorAll('[data-install-pwa]').forEach(button => {
    button.addEventListener('click', Z.installPwa);
  });
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

  function priceText(item) {
    return item.price_pending ? 'Цена на място' : Z.money(item.price);
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

  function updateNavigationCount(count) {
    document.querySelectorAll('[data-cart-count]').forEach(node => {
      node.textContent = count;
      node.hidden = count === 0;
    });
  }

  function renderCart() {
    cart = cart.filter(row => {
      const item = itemById(row.menu_item_id);
      return item && item.available_for_pickup;
    });
    saveCart();

    const summary = cartSummary();
    const hasItems = summary.count > 0;
    cartLoading.hidden = true;
    cartEmpty.hidden = hasItems;
    cartContent.hidden = !hasItems;
    checkoutPanel.hidden = !hasItems;
    updateNavigationCount(summary.count);
    cartTotal.textContent = Z.money(summary.total);
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
        <div class="cart-row cart-row-page">
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
        pickupSuccess.hidden = true;
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
    pickupSuccess.hidden = true;
    renderCart();
  }

  function setupReadyTime() {
    const ready = pickupForm.elements.ready;
    ready.min = Z.localDateTimeValue(new Date());
    if (!ready.value) {
      ready.value = Z.localDateTimeValue(new Date(Date.now() + 60 * 60 * 1000));
    }
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
        <a class="secondary-action success-action" href="/order.html">← ОБРАТНО КЪМ ПОРЪЧКАТА</a>
      `;
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
      renderCart();
    } catch (error) {
      cartLoading.textContent = 'Количката не можа да се зареди. Опитайте отново след малко.';
      cartLoading.classList.add('error');
      Z.toast(error.message, 'error');
    }
  }

  boot();
})();
