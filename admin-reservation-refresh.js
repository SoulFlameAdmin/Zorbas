(() => {
  let refreshingReservations = false;
  setInterval(async () => {
    const isMobile = window.matchMedia('(max-width:650px)').matches;
    const canRefresh = typeof waiterState !== 'undefined'
      && typeof refresh === 'function'
      && waiterState.mobileMode === 'order'
      && ['areas', 'tables'].includes(waiterState.step);
    if (!isMobile || !canRefresh || refreshingReservations) return;
    refreshingReservations = true;
    try { await refresh(); } catch {} finally { refreshingReservations = false; }
  }, 5000);
})();