(() => {
  'use strict';

  if (window.ZorbasWaiterNoteFinal) return;
  window.ZorbasWaiterNoteFinal = true;

  let scheduled = false;
  let lastSignature = '';

  function ensureButton() {
    let button = document.getElementById('waiterFixedBill');
    if (button) return button;

    button = document.createElement('button');
    button.id = 'waiterFixedBill';
    button.type = 'button';
    button.className = 'waiter-fixed-bill';
    button.setAttribute('aria-label', 'Принт на сметка');
    button.innerHTML = `
      <span class="wfb-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none"><path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v7H7v-7Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M17.5 11.5h.01" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
      </span>
      <span class="wfb-copy"><b>ПРИНТ СМЕТКА</b><small>Няма активна сметка</small></span>`;

    button.addEventListener('click', () => {
      const source = document.querySelector('.stage3-bill-button[data-stage3-close-bill]');
      if (!source || source.disabled) return;
      source.click();
    });

    document.body.appendChild(button);
    return button;
  }

  function sync() {
    scheduled = false;
    const mobile = window.matchMedia('(max-width:650px)').matches;
    const notePage = mobile && Boolean(document.querySelector('.stage3-waiter-notepad'));
    document.body.classList.toggle('waiter-note-page-active', notePage);

    const button = ensureButton();
    button.hidden = !notePage;
    if (!notePage) return;

    const source = document.querySelector('.stage3-bill-button[data-stage3-close-bill]');
    const total = source?.querySelector('b')?.textContent?.trim() || '';
    const detail = source?.querySelector('span')?.textContent?.trim() || '';
    const disabled = !source || source.disabled;
    const waiting = /чакат|кухня/i.test(detail);
    const label = disabled ? (waiting ? 'ЧАКА КУХНЯ' : 'ПРИНТ СМЕТКА') : 'ПРИНТ СМЕТКА';
    const subtitle = total || (waiting ? detail : 'Няма активна сметка');
    const signature = `${label}|${subtitle}|${disabled}`;

    if (signature !== lastSignature) {
      lastSignature = signature;
      button.disabled = disabled;
      button.classList.toggle('waiting', waiting);
      button.querySelector('.wfb-copy b').textContent = label;
      button.querySelector('.wfb-copy small').textContent = subtitle;
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(sync);
  }

  new MutationObserver(schedule).observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['disabled', 'class']
  });

  window.addEventListener('pageshow', schedule);
  window.addEventListener('resize', schedule);
  schedule();
})();