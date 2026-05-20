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
