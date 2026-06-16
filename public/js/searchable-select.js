// Progressive-enhancement searchable dropdown.
// Turns any <select data-searchable> into a type-to-filter combobox while
// keeping the native <select> as the source of truth (so the form submits
// normally and existing change-listeners keep working). Degrades gracefully:
// if this script doesn't run, the plain <select> still works.
(function () {
  function enhance(select) {
    if (select.dataset.ssEnhanced) return;
    select.dataset.ssEnhanced = '1';

    var wrap = document.createElement('div');
    wrap.className = 'ss-wrap';
    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(select);
    select.classList.add('ss-native');

    var input = document.createElement('input');
    input.type = 'text';
    input.className = select.className.replace('ss-native', '').trim();
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('role', 'combobox');
    wrap.appendChild(input);

    var caret = document.createElement('span');
    caret.className = 'ss-caret';
    caret.innerHTML = '<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M5.5 7.5l4.5 4.5 4.5-4.5"/></svg>';
    wrap.appendChild(caret);

    var panel = document.createElement('div');
    panel.className = 'ss-panel';
    panel.style.display = 'none';
    wrap.appendChild(panel);

    var placeholder = select.getAttribute('data-placeholder') ||
      (select.options[0] ? select.options[0].textContent.trim() : 'Search…');
    input.placeholder = placeholder;

    var hlIndex = -1; // highlighted item index within the *visible* list

    function selectedOption() { return select.options[select.selectedIndex]; }

    function syncInput() {
      var o = selectedOption();
      input.value = (o && o.value !== '') ? o.textContent.trim() : '';
    }

    function selectOption(optIndex) {
      select.selectedIndex = optIndex;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      syncInput();
      closePanel();
    }

    function buildList(filter) {
      panel.innerHTML = '';
      hlIndex = -1;
      var q = (filter || '').toLowerCase();
      var shown = 0;
      Array.prototype.forEach.call(select.options, function (opt, i) {
        var text = opt.textContent.trim();
        if (q && text.toLowerCase().indexOf(q) === -1) return;
        var item = document.createElement('div');
        item.className = 'ss-item';
        if (i === select.selectedIndex) item.classList.add('ss-selected');
        item.textContent = text;
        item.setAttribute('data-opt', i);
        item.addEventListener('mousedown', function (e) {
          e.preventDefault();
          selectOption(i);
        });
        panel.appendChild(item);
        shown++;
      });
      if (shown === 0) {
        var none = document.createElement('div');
        none.className = 'ss-none';
        none.textContent = 'No matches';
        panel.appendChild(none);
      }
    }

    function openPanel() {
      buildList('');
      panel.style.display = 'block';
      wrap.classList.add('ss-open');
      input.select();
    }
    function closePanel() {
      panel.style.display = 'none';
      wrap.classList.remove('ss-open');
      syncInput();
    }

    function visibleItems() {
      return Array.prototype.slice.call(panel.querySelectorAll('.ss-item'));
    }
    function highlight(items, idx) {
      items.forEach(function (it) { it.classList.remove('ss-hl'); });
      if (items[idx]) {
        items[idx].classList.add('ss-hl');
        items[idx].scrollIntoView({ block: 'nearest' });
      }
      hlIndex = idx;
    }

    input.addEventListener('focus', openPanel);
    input.addEventListener('click', openPanel);
    input.addEventListener('input', function () {
      panel.style.display = 'block';
      wrap.classList.add('ss-open');
      buildList(input.value);
    });
    input.addEventListener('keydown', function (e) {
      var items = visibleItems();
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (panel.style.display === 'none') openPanel();
        highlight(items, Math.min(items.length - 1, hlIndex + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        highlight(items, Math.max(0, hlIndex - 1));
      } else if (e.key === 'Enter') {
        if (panel.style.display !== 'none' && items[hlIndex]) {
          e.preventDefault();
          selectOption(parseInt(items[hlIndex].getAttribute('data-opt'), 10));
        }
      } else if (e.key === 'Escape') {
        closePanel();
      }
    });

    caret.addEventListener('mousedown', function (e) {
      e.preventDefault();
      if (panel.style.display === 'none') { input.focus(); openPanel(); }
      else closePanel();
    });

    document.addEventListener('click', function (e) {
      if (!wrap.contains(e.target)) closePanel();
    });

    syncInput();
  }

  function init() {
    var list = document.querySelectorAll('select[data-searchable]');
    Array.prototype.forEach.call(list, enhance);
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
