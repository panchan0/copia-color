/* Aplica el tema antes de pintar para evitar parpadeo. */
(function () {
  var p = {}; try { p = JSON.parse(localStorage.getItem('cc_prefs') || '{}'); } catch (e) { /* nada */ }
  var dark = p.tema === 'oscuro' || (p.tema === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  var r = document.documentElement; r.setAttribute('data-theme', dark ? 'dark' : 'light');
  if (p.calma || matchMedia('(prefers-reduced-motion: reduce)').matches) r.classList.add('calma');
})();
