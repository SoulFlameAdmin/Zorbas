(() => {
  const root = document.querySelector('.route-actions');
  if (!root) return;
  root.innerHTML = '<button class="btn primary full" id="automaticPrintRoute" style="grid-column:1/-1">ИЗПРАТИ ПОРЪЧКАТА<br><small>1 бележка БАР + 1 бележка КУХНЯ</small></button>';
  document.getElementById('automaticPrintRoute').onclick = () => window.submitOrder();
})();
