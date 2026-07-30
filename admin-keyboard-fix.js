(() => {
  if (typeof renderWaiterMobile !== 'function') return;

  const originalRenderWaiterMobile = renderWaiterMobile;
  let lastLayoutWidth = window.innerWidth;
  let skipCurrentResizeRender = false;

  window.addEventListener('resize', () => {
    const nextWidth = window.innerWidth;
    const widthChanged = Math.abs(nextWidth - lastLayoutWidth) > 4;
    lastLayoutWidth = nextWidth;

    // Android closes the keyboard if the whole waiter screen is rebuilt while
    // only the viewport height changes. Ignore that resize, but still rerender
    // on rotation or a real layout-width change.
    skipCurrentResizeRender = !widthChanged;
    requestAnimationFrame(() => {
      skipCurrentResizeRender = false;
    });
  }, true);

  const guardedRenderWaiterMobile = function guardedRenderWaiterMobile(...args) {
    if (skipCurrentResizeRender) return;
    return originalRenderWaiterMobile.apply(this, args);
  };

  renderWaiterMobile = guardedRenderWaiterMobile;
  window.renderWaiterMobile = guardedRenderWaiterMobile;
})();
