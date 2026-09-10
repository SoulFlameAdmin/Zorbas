(() => {
  'use strict';

  if (window.ZorbasStableNotes) return;
  window.ZorbasStableNotes = true;

  function grow(field) {
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${Math.max(field.scrollHeight, 38)}px`;
  }

  function upgradeItemNote(input) {
    if (!input || input.dataset.noteUpgraded === '1') return;
    input.dataset.noteUpgraded = '1';

    const originalHandler = input.oninput;
    const textarea = document.createElement('textarea');
    textarea.className = input.className;
    textarea.dataset.cartNote = input.dataset.cartNote || '';
    textarea.placeholder = input.placeholder || 'Уточнение / Item note…';
    textarea.value = input.value || '';
    textarea.maxLength = 160;
    textarea.rows = 1;
    textarea.setAttribute('aria-label', input.getAttribute('aria-label') || 'Уточнение към продукт / Item note');

    textarea.addEventListener('input', () => {
      textarea.value = textarea.value.slice(0, 160);
      input.value = textarea.value;
      if (typeof originalHandler === 'function') originalHandler.call(input);
      grow(textarea);
    });

    input.replaceWith(textarea);
    grow(textarea);
  }

  function enhance(root = document) {
    root.querySelectorAll('input.ws-cart-note[data-cart-note]').forEach(upgradeItemNote);

    root.querySelectorAll('textarea.ws-cart-note[data-cart-note]').forEach(field => {
      if (field.dataset.autogrowBound === '1') return grow(field);
      field.dataset.autogrowBound = '1';
      field.addEventListener('input', () => grow(field));
      grow(field);
    });

    const orderNote = root.querySelector('#stableOrderNote');
    if (orderNote) {
      orderNote.maxLength = 500;
      if (orderNote.dataset.autogrowBound !== '1') {
        orderNote.dataset.autogrowBound = '1';
        orderNote.addEventListener('input', () => grow(orderNote));
      }
      grow(orderNote);
    }
  }

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      enhance();
    });
  }

  new MutationObserver(schedule).observe(document.body, {subtree: true, childList: true});
  window.addEventListener('pageshow', schedule);
  window.addEventListener('resize', schedule);
  schedule();
})();
