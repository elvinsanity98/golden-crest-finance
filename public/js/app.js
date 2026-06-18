// Mobile sidebar toggle
(function () {
  var toggle = document.getElementById('sidebarToggle');
  var drawer = document.getElementById('mobileSidebar');
  if (!toggle || !drawer) return;

  toggle.addEventListener('click', function () {
    drawer.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  });

  drawer.querySelectorAll('[data-close-sidebar]').forEach(function (el) {
    el.addEventListener('click', function () {
      drawer.classList.add('hidden');
      document.body.style.overflow = '';
    });
  });
})();

// Friendly numeric input formatting on blur (visual only)
document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('input[type="number"][data-format-money]').forEach(function (input) {
    input.addEventListener('blur', function () {
      var v = parseFloat(input.value);
      if (!isNaN(v)) input.value = v.toFixed(2);
    });
  });
});

// Branded page loader: hide once the page is ready, show again during
// internal navigations so transitions feel smooth (instead of a blank tab).
(function () {
  var loader = document.getElementById('gcLoader');
  if (!loader) return;
  function hide() { loader.classList.add('gc-hide'); }
  function show() { loader.classList.remove('gc-hide'); }

  if (document.readyState === 'complete') hide();
  else window.addEventListener('load', hide);
  setTimeout(hide, 4000); // safety net if something stalls

  // Coming back via the back/forward cache — make sure it's hidden
  window.addEventListener('pageshow', function (e) { if (e.persisted) hide(); });

  // Show on internal link clicks
  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (!href || href.charAt(0) === '#' || href.indexOf('javascript:') === 0) return;
    if (a.target === '_blank' || a.hasAttribute('download')) return;
    if (a.origin && a.origin !== window.location.origin) return;
    show();
  });

  // Show on form submit (unless a data-confirm dialog was cancelled)
  document.addEventListener('submit', function (e) {
    if (e.defaultPrevented) return;
    show();
  });
})();

// Confirmation dialogs for any form carrying a data-confirm message.
// Placeholders like {amount} are replaced with that field's current value.
document.addEventListener('submit', function (e) {
  var form = e.target;
  if (!form || !form.getAttribute) return;
  var msg = form.getAttribute('data-confirm');
  if (!msg) return;
  msg = msg.replace(/\{(\w+)\}/g, function (_, name) {
    var el = form.elements[name];
    return el && el.value != null ? el.value : '';
  });
  if (!window.confirm(msg)) {
    e.preventDefault();
    e.stopPropagation();
  }
}, true);
