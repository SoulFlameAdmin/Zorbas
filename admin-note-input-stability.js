(() => {
  'use strict';

  if (window.ZorbasNoteInputStabilityV2) return;
  window.ZorbasNoteInputStabilityV2 = true;

  let keyboardLocked = false;
  let pendingRefresh = false;
  let blurTimer = 0;

  const inputFocused = () => document.activeElement?.id === 'waiterQuickInput';

  function installStyle() {
    if (document.getElementById('zorbas-note-input-stability-v2-style')) return;
    const style = document.createElement('style');
    style.id = 'zorbas-note-input-stability-v2-style';
    style.textContent = `
      @media (max-width:650px) {
        html.zorbas-keyboard-open,
        html.zorbas-keyboard-open body {
          overscroll-behavior:none!important;
        }

        .stage3-waiter-notepad.zorbas-input-first {
          display:flex!important;
          flex-direction:column!important;
          gap:0!important;
        }

        .stage3-waiter-notepad.zorbas-input-first > .stage3-new-position-title {
          order:1!important;
          margin:4px 12px 0!important;
          padding:12px 2px 8px!important;
          border-top:0!important;
        }

        .stage3-waiter-notepad.zorbas-input-first > .stage3-current-cart {
          order:2!important;
          margin:0 12px!important;
          overflow:hidden!important;
          border:1px solid #294059!important;
          border-bottom:0!important;
          border-radius:15px 15px 0 0!important;
          background:#0c1724!important;
        }

        .stage3-waiter-notepad.zorbas-input-first > .stage3-current-cart:empty {
          display:none!important;
        }

        .stage3-waiter-notepad.zorbas-input-first > .waiter-composer {
          order:3!important;
          position:relative!important;
          z-index:20!important;
          display:grid!important;
          margin:0 12px!important;
          padding:10px!important;
          border:1px solid #3b5d82!important;
          border-radius:15px!important;
          background:linear-gradient(145deg,#14263a,#0e1b2a)!important;
          box-shadow:0 12px 30px rgba(0,0,0,.24)!important;
          pointer-events:auto!important;
          touch-action:manipulation!important;
        }

        .stage3-waiter-notepad.zorbas-input-first > .stage3-current-cart:not(:empty) + .waiter-composer {
          border-radius:0 0 15px 15px!important;
        }

        .stage3-waiter-notepad.zorbas-input-first > .waiter-composer span {
          margin:0 0 7px!important;
          color:#b9cbe0!important;
          font-size:10px!important;
          font-weight:900!important;
          letter-spacing:.12em!important;
        }

        #waiterQuickInput {
          position:relative!important;
          z-index:21!important;
          display:block!important;
          width:100%!important;
          min-height:58px!important;
          box-sizing:border-box!important;
          margin:0!important;
          padding:0 15px!important;
          border:1px solid #5279a3!important;
          border-radius:13px!important;
          background:#07111d!important;
          color:#fff!important;
          caret-color:#8fc0ff!important;
          font:700 17px/1.2 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;
          opacity:1!important;
          visibility:visible!important;
          pointer-events:auto!important;
          touch-action:manipulation!important;
          user-select:text!important;
          -webkit-user-select:text!important;
          outline:none!important;
        }

        #waiterQuickInput:focus {
          border-color:#88b9f2!important;
          box-shadow:0 0 0 4px rgba(103,157,219,.22)!important;
        }

        #waiterQuickInput::placeholder {
          color:#8193a8!important;
          opacity:1!important;
        }

        .stage3-waiter-notepad.zorbas-input-first > #waiterSuggestionBox {
          order:4!important;
          margin:8px 12px 12px!important;
        }

        .stage3-waiter-notepad.zorbas-input-first > .stage3-live-note {
          order:5!important;
          margin:4px 12px 12px!important;
          border:1px solid #263a50!important;
          border-radius:15px!important;
          overflow:hidden!important;
        }

        .stage3-waiter-notepad.zorbas-input-first > .stage3-live-note:before {
          content:'ИСТОРИЯ НА МАСАТА';
          display:block;
          padding:10px 12px;
          border-bottom:1px solid #263a50;
          background:#0a1522;
          color:#7f94ab;
          font-size:9px;
          font-weight:900;
          letter-spacing:.13em;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function prepareInput() {
    const notepad = document.querySelector('.stage3-waiter-notepad');
    const input = document.getElementById('waiterQuickInput');
    if (!notepad || !input) return;

    // CSS order is enough. Never move the focused input in the DOM.
    notepad.classList.add('zorbas-input-first');

    input.disabled = false;
    input.readOnly = false;
    input.type = 'text';
    input.inputMode = 'text';
    input.enterKeyHint = 'done';
    input.autocomplete = 'off';
    input.autocapitalize = 'sentences';
    input.spellcheck = false;
    input.setAttribute('aria-label', 'Напиши продукт за бележката');

    if (input.dataset.zorbasKeyboardV2 === '1') return;
    input.dataset.zorbasKeyboardV2 = '1';

    input.addEventListener('focus', () => {
      clearTimeout(blurTimer);
      keyboardLocked = true;
      document.documentElement.classList.add('zorbas-keyboard-open');
    });

    input.addEventListener('blur', () => {
      clearTimeout(blurTimer);
      blurTimer = window.setTimeout(async () => {
        if (inputFocused()) return;
        keyboardLocked = false;
        document.documentElement.classList.remove('zorbas-keyboard-open');
        if (pendingRefresh && typeof refresh === 'function') {
          pendingRefresh = false;
          try { await refresh(); } catch {}
        }
      }, 350);
    });

    input.addEventListener('input', () => {
      if (typeof waiterState !== 'undefined') {
        waiterState.query = input.value;
        waiterState.showMenu = false;
      }
    }, true);

    input.closest('.waiter-composer')?.addEventListener('click', event => {
      if (event.target !== input) input.focus({preventScroll:true});
    });
  }

  installStyle();

  const baseRender = typeof renderWaiterMobile === 'function' ? renderWaiterMobile : null;
  if (baseRender) {
    const stableRender = function (...args) {
      // Android resizes the viewport when its keyboard opens. Keeping this DOM
      // untouched is what keeps the keyboard and caret alive.
      if (keyboardLocked && inputFocused() && document.getElementById('waiterQuickInput')?.isConnected) {
        return;
      }
      const result = baseRender.apply(this, args);
      queueMicrotask(prepareInput);
      return result;
    };
    renderWaiterMobile = stableRender;
    window.renderWaiterMobile = stableRender;
  }

  if (typeof refresh === 'function') {
    const baseRefresh = refresh;
    refresh = async function (...args) {
      if (keyboardLocked && inputFocused()) {
        pendingRefresh = true;
        return snapshot;
      }
      return baseRefresh.apply(this, args);
    };
  }

  let scheduled = false;
  const schedulePrepare = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      prepareInput();
    });
  };

  new MutationObserver(schedulePrepare).observe(document.body, {subtree:true, childList:true});
  window.addEventListener('pageshow', schedulePrepare);
  prepareInput();
})();