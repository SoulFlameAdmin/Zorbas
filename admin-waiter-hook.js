(() => {
  const baseRenderAll = renderAll;
  renderAll = function renderAllWithWaiter() {
    baseRenderAll();
    renderWaiterMobile();
  };

  const baseSwitchView = switchView;
  switchView = function switchViewWithWaiter(name) {
    baseSwitchView(name);
    if (name === 'tables') renderWaiterMobile();
  };
})();
