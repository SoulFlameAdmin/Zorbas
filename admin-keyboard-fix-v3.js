(() => {
  if (typeof renderWaiterMobile !== 'function') return;

  const originalRender = renderWaiterMobile;
  let lastWidth = window.innerWidth;
  let keyboardResizeUntil = 0;

  const inputFocused = () => document.activeElement?.id === 'waiterQuickInput';
  const noteOpen = () => typeof waiterState !== 'undefined' && waiterState.step === 'note';

  function stateSignature() {
    if (typeof waiterState === 'undefined') return '';
    const cart = (waiterState.cart || []).map(row => [
      row.menu_item_id,
      Number(row.quantity || 0),
      row.note || '',
      row.meta?.mode || '',
      JSON.stringify(row.meta?.options || {})
    ]);
    const managedTable = typeof snapshot !== 'undefined'
      ? snapshot?.tables?.find(table => table.id === waiterState.manageTableId)
      : null;

    return JSON.stringify({
      step: waiterState.step,
      mobileMode: waiterState.mobileMode,
      areaId: waiterState.areaId,
      tableId: waiterState.tableId,
      cart,
      printing: Boolean(waiterState.printing),
      manageAreaId: waiterState.manageAreaId,
      manageTableId: waiterState.manageTableId,
      tableDirty: Boolean(waiterState.tableDirty),
      managedTable: managedTable ? {
        x: Number(managedTable.x || 0),
        y: Number(managedTable.y || 0),
        width: Number(managedTable.width || 0),
        height: Number(managedTable.height || 0),
        seats: Number(managedTable.seats || 0),
        shape: managedTable.shape || '',
        status: managedTable.status || ''
      } : null
    });
  }

  let lastRenderedSignature = stateSignature();

  function markKeyboardResize() {
    if (noteOpen() && inputFocused()) keyboardResizeUntil = Date.now() + 900;
  }

  window.addEventListener('resize', () => {
    const nextWidth = window.innerWidth;
    const widthChanged = Math.abs(nextWidth - lastWidth) > 8;
    lastWidth = nextWidth;
    if (!widthChanged) markKeyboardResize();
  }, true);

  window.visualViewport?.addEventListener('resize', markKeyboardResize, true);

  const guardedRender = function (...args) {
    const nextSignature = stateSignature();
    const meaningfulStateChange = nextSignature !== lastRenderedSignature;
    const keyboardOnlyResize = noteOpen()
      && inputFocused()
      && Date.now() < keyboardResizeUntil
      && !meaningfulStateChange;

    if (keyboardOnlyResize) return;

    const result = originalRender.apply(this, args);
    lastRenderedSignature = stateSignature();
    return result;
  };

  renderWaiterMobile = guardedRender;
  window.renderWaiterMobile = guardedRender;
})();
