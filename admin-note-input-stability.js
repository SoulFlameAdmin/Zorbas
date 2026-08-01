(() => {
  'use strict';

  if (window.ZorbasNoteInputStability) return;
  window.ZorbasNoteInputStability = true;

  const STYLE_ID = 'zorbas-note-input-stability-style';

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      @media (max-width:650px) {
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
          z-index:5!important;
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
          z-index:6!important;
          display:block!important;
          width:100%!important;
          min-height:56px!important;
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

        .waiter-main-action {
          position:relative!important;
          z-index:2!important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function currentInput() {
    return document.getElementById('waiterQuickInput');
  }

  function moveComposerFirst() {
    const notepad = document.querySelector('.stage3-waiter-notepad');
    if (!notepad) return;

    const history = Array.from(notepad.children).find(node => node.classList?.contains('stage3-live-note'));
    const title = Array.from(notepad.children).find(node => node.classList?.contains('stage3-new-position-title'));
    const cart = Array.from(notepad.children).find(node => node.classList?.contains('stage3-current-cart'));
    const composer = Array.from(notepad.children).find(node => node.classList?.contains('waiter-composer'));
    const suggestions = Array.from(notepad.children).find(node => node.id === 'waiterSuggestionBox');

    if (!composer) return;
    notepad.classList.add('zorbas-input-first');

    if (history) {
      [title, cart, composer, suggestions].filter(Boolean).forEach(node => {
        notepad.insertBefore(node, history);
      });
    }
  }

  function makeInputWritable() {
    const input = currentInput();
    if (!input) return;

    input.disabled = false;
    input.readOnly = false;
    input.type = 'text';
    input.inputMode = 'text';
    input.enterKeyHint = 'done';
    input.autocomplete = 'off';
    input.autocapitalize = 'sentences';
    input.spellcheck = false;
    input.setAttribute('aria-label', 'Напиши продукт за бележката');

    if (typeof waiterState !== 'undefined' && input.value !== String(waiterState.query || '')) {
      input.value = String(waiterState.query || '');
    }

    if (input.dataset.zorbasWritable === '1') return;
    input.dataset.zorbasWritable = '1';

    let composing = false;

    input.addEventListener('compositionstart', () => {
      composing = true;
    });

    input.addEventListener('compositionend', () => {
      composing = false;
      if (typeof waiterState !== 'undefined') waiterState.query = input.value;
      if (typeof updateWaiterSuggestions === 'function') updateWaiterSuggestions();
    });

    input.addEventListener('input', () => {
      if (typeof waiterState !== 'undefined') {
        waiterState.query = input.value;
        waiterState.showMenu = false;
      }
      if (!composing && typeof updateWaiterSuggestions === 'function') updateWaiterSuggestions();
    }, true);

    input.addEventListener('keydown', event => {
      if (event.key !== 'Enter' || composing) return;
      event.preventDefault();
      if (typeof waiterState !== 'undefined' && waiterState.candidate && typeof acceptWaiterItem === 'function') {
        acceptWaiterItem(waiterState.candidate);
      }
    }, true);

    const composer = input.closest('.waiter-composer');
    const focusInput = event => {
      if (event?.target === input) return;
      input.focus({preventScroll:false});
    };
    composer?.addEventListener('pointerdown', focusInput, {passive:true});
    composer?.addEventListener('click', focusInput);
  }

  function stabilize() {
    installStyle();
    moveComposerFirst();
    makeInputWritable();
  }

  const baseRender = typeof renderWaiterMobile === 'function' ? renderWaiterMobile : null;
  if (baseRender) {
    const stableRender = function (...args) {
      const result = baseRender.apply(this, args);
      queueMicrotask(stabilize);
      return result;
    };
    renderWaiterMobile = stableRender;
    window.renderWaiterMobile = stableRender;
  }

  document.addEventListener('click', event => {
    const composer = event.target.closest?.('.waiter-composer');
    if (!composer) return;
    const input = composer.querySelector('#waiterQuickInput');
    if (input && event.target !== input) input.focus({preventScroll:false});
  }, true);

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      stabilize();
    });
  };

  new MutationObserver(schedule).observe(document.body, {subtree:true, childList:true});
  window.addEventListener('pageshow', schedule);
  window.visualViewport?.addEventListener('resize', () => {
    if (document.activeElement?.id === 'waiterQuickInput') {
      document.activeElement.scrollIntoView({block:'center', behavior:'smooth'});
    }
  });

  stabilize();
})();