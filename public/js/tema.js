/* Preferencias de este dispositivo: tema y animaciones. */
const KEY = 'cc_prefs';
const DEF = { tema: 'claro', calma: false };
export function prefs() {
  try { return { ...DEF, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEF }; }
}
const mq = matchMedia('(prefers-color-scheme: dark)');
export function aplicarTema() {
  const p = prefs(), r = document.documentElement;
  const oscuro = p.tema === 'oscuro' || (p.tema === 'auto' && mq.matches);
  r.dataset.theme = oscuro ? 'dark' : 'light';
  r.classList.toggle('calma', !!p.calma || matchMedia('(prefers-reduced-motion: reduce)').matches);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', oscuro ? '#0f141a' : '#ffffff');
}
export function guardarPref(cambios) {
  const p = { ...prefs(), ...cambios };
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* sin almacenamiento */ }
  const r = document.documentElement;
  if ('tema' in cambios && !r.classList.contains('calma')) {
    r.classList.add('tema-cambia'); aplicarTema();
    setTimeout(() => r.classList.remove('tema-cambia'), 450);
  } else aplicarTema();
}
mq.addEventListener?.('change', aplicarTema);
aplicarTema();
