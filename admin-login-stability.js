(() => {
  'use strict';

  const FIXED_OPERATOR = 'Христо Царухов';
  const FIXED_USERNAME = 'admin';

  function prepareLogin() {
    const form = document.getElementById('loginForm');
    if (!form || form.dataset.stableLoginReady === '1') return;
    form.dataset.stableLoginReady = '1';
    form.setAttribute('autocomplete', 'off');

    const displayName = form.elements.namedItem('display_name');
    const username = form.elements.namedItem('username');
    const password = form.elements.namedItem('password');
    const submit = form.querySelector('button[type="submit"], button:not([type])');
    const message = document.getElementById('loginMessage');
    const normalLabel = submit?.textContent || 'ВХОД';

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

    const unlockSubmit = () => {
      if (!submit) return;
      submit.disabled = false;
      submit.textContent = normalLabel;
    };

    applyFixedIdentity();
    setTimeout(applyFixedIdentity, 0);
    setTimeout(applyFixedIdentity, 250);
    setTimeout(applyFixedIdentity, 900);

    displayName?.addEventListener('input', applyFixedIdentity);
    username?.addEventListener('input', applyFixedIdentity);

    if (password) {
      password.value = '';
      password.autocomplete = 'off';
      password.autocapitalize = 'none';
      password.spellcheck = false;
      password.inputMode = 'text';
    }

    if (submit) {
      submit.disabled = true;
      submit.textContent = 'ЗАРЕЖДАНЕ…';

      let checks = 0;
      const readyTimer = setInterval(() => {
        checks += 1;
        if (typeof form.onsubmit === 'function') {
          clearInterval(readyTimer);
          unlockSubmit();
          password?.focus({preventScroll: true});
        } else if (checks >= 100) {
          clearInterval(readyTimer);
          unlockSubmit();
        }
      }, 50);

      form.addEventListener('submit', () => {
        applyFixedIdentity();
        submit.disabled = true;
        submit.textContent = 'ВЛИЗАНЕ…';
        setTimeout(() => {
          if (!document.getElementById('loginView')?.classList.contains('hidden')) unlockSubmit();
        }, 22000);
      }, true);

      if (message) {
        new MutationObserver(() => {
          const text = message.textContent.trim();
          if (text && text !== 'Влизане…') unlockSubmit();
        }).observe(message, {childList: true, characterData: true, subtree: true});
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', prepareLogin, {once: true});
  } else {
    prepareLogin();
  }
})();
