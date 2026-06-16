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
