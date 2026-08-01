(() => {
  'use strict';

  const FIXED_OPERATOR = 'Христо Царухов';
  const FIXED_USERNAME = 'admin';

  function prepareLogin() {
    const form = document.getElementById('loginForm');
    if (!form) return;

    form.setAttribute('autocomplete', 'off');

    const displayName = form.elements.namedItem('display_name');
    const username = form.elements.namedItem('username');
    const password = form.elements.namedItem('password');
    const submit = form.querySelector('button[type="submit"], button:not([type])');

    const applyFixedIdentity = () => {
      if (displayName) {
        displayName.value = FIXED_OPERATOR;
        displayName.readOnly = true;
        displayName.autocomplete = 'off';
        displayName.setAttribute('aria-label', 'Оператор');
      }
      if (username) {
        username.value = FIXED_USERNAME;
        username.readOnly = true;
        username.autocomplete = 'off';
        username.autocapitalize = 'none';
        username.spellcheck = false;
        username.setAttribute('aria-label', 'Потребител');
      }
    };

    applyFixedIdentity();
    setTimeout(applyFixedIdentity, 0);
    setTimeout(applyFixedIdentity, 250);
    setTimeout(applyFixedIdentity, 900);

    displayName?.addEventListener('input', applyFixedIdentity);
    username?.addEventListener('input', applyFixedIdentity);
    form.addEventListener('submit', applyFixedIdentity, true);

    if (password) {
      password.value = '';
      password.autocomplete = 'off';
      password.autocapitalize = 'none';
      password.spellcheck = false;
      password.inputMode = 'text';
    }

    if (submit) {
      const normalLabel = submit.textContent || 'ВХОД';
      submit.disabled = true;
      submit.textContent = 'ЗАРЕЖДАНЕ…';

      let checks = 0;
      const timer = setInterval(() => {
        checks += 1;
        if (typeof form.onsubmit === 'function') {
          clearInterval(timer);
          submit.disabled = false;
          submit.textContent = normalLabel;
          password?.focus({preventScroll: true});
        } else if (checks >= 100) {
          clearInterval(timer);
          submit.disabled = false;
          submit.textContent = normalLabel;
        }
      }, 50);
    }
  }

  prepareLogin();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', prepareLogin, {once: true});
  }
})();
