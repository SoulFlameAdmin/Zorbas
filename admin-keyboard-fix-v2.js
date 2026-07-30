(() => {
  if (typeof renderWaiterMobile !== 'function') return;

  const originalRender = renderWaiterMobile;
  let typing = false;
  let lastWidth = window.innerWidth;
  let heightOnlyResize = false;

  const inputFocused = () => document.activeElement?.id === 'waiterQuickInput';
  const noteOpen = () => typeof waiterState !== 'undefined' && waiterState.step === 'note';

  const markTyping = event => {
    if (event.target?.closest?.('#waiterQuickInput')) typing = true;
  };

  document.addEventListener('pointerdown', markTyping, true);
  document.addEventListener('touchstart', markTyping, true);
  document.addEventListener('focusin', event => {
    if (event.target?.id === 'waiterQuickInput') typing = true;
  }, true);
  document.addEventListener('focusout', event => {
    if (event.target?.id !== 'waiterQuickInput') return;
    setTimeout(() => {
      if (!inputFocused()) typing = false;
    }, 250);
  }, true);

  window.addEventListener('resize', () => {
    const nextWidth = window.innerWidth;
    const widthChanged = Math.abs(nextWidth - lastWidth) > 4;
    lastWidth = nextWidth;
    heightOnlyResize = !widthChanged;
    setTimeout(() => { heightOnlyResize = false; }, 350);
  }, true);

  const guardedRender = function (...args) {
    if (noteOpen() && (typing || inputFocused() || heightOnlyResize)) return;
    return originalRender.apply(this, args);
  };

  renderWaiterMobile = guardedRender;
  window.renderWaiterMobile = guardedRender;

  window.visualViewport?.addEventListener('resize', () => {
    const input = document.getElementById('waiterQuickInput');
    if (!input || !inputFocused()) return;
    requestAnimationFrame(() => input.scrollIntoView({block: 'center', behavior: 'auto'}));
  });
})();
