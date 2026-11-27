import { api, setHandlers } from './api.js';
import { S, loadMe, loadClients, startSync, stopSync, today } from './store.js';
import { $, $$, toast } from './ui/dom.js';
import { closeMenu } from './ui/menu.js';
import { transicion, syncNav } from './ui/motion.js';
import { ci } from './icons.js';
import { aplicarTema, prefs, guardarPref } from './tema.js';
import { showAuth } from './views/auth.js';
import { esc } from './util.js';
import * as dia from './views/dia.js';
import * as caja from './views/caja.js';
import * as reportes from './views/reportes.js';
import * as ajustes from './views/ajustes.js';
import * as ordenes from './views/ordenes.js';
import * as orden from './views/orden.js';

const VIEWS = { dia, caja, ordenes, orden, reportes, ajustes };
aplicarTema();
for (const b of document.querySelectorAll('nav.tabs button[data-v]:not(.acct)')) {
  const k = b.dataset.v === 'ajustes' ? 'operadores' : b.dataset.v; b.querySelector('svg')?.remove();
  b.insertAdjacentHTML('afterbegin', `<span class="nico"><span class="d">${ci(k)}</span><span class="f">${ci(k, 'fill')}</span></span>`);
}
const NAV = { caja: 'ordenes', orden: 'ordenes' };
let mounted = false, vista = null, navSel = 'dia';

function go(v, push = true) {
  if (v === 'maquinas') v = 'ajustes';
  if (v.startsWith('orden=')) {
    const from = vista && vista !== 'orden' ? (vista === 'ajustes' ? '#ajustes=anuladas' : '#' + vista) : null;
    orden.setOrden(decodeURIComponent(v.slice(6)), from);
    v = 'orden'; push = false;
  }
  let sub = null;
  if (v.startsWith('ajustes=')) { sub = v.slice(8); v = 'ajustes'; push = false; }
  if (!VIEWS[v]) v = 'dia';
  closeMenu();
  const antes = vista, subAntes = antes === 'ajustes' ? ajustes.pagina() : null;
  const esSub = x => x === 'caja' || x === 'orden';
  let tipo = null;
  if (antes && antes !== v) {
    if (esSub(v) && !esSub(antes)) tipo = 'abrir';
    else if (esSub(antes) && !esSub(v)) tipo = 'cerrar';
    else if (!esSub(v)) tipo = ORDEN.indexOf(v) > ORDEN.indexOf(antes) ? 'adelante' : 'atras';
    else tipo = 'abrir';
  } else if (antes === 'ajustes' && v === 'ajustes' && (sub || 'home') !== subAntes) tipo = sub && sub !== 'home' ? 'abrir' : 'cerrar';
  vista = v;
  if (v !== 'orden') navSel = NAV[v] || v;
  $$('nav.tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === navSel));
  syncNav();
  if (push && location.hash !== '#' + v) history.replaceState(null, '', '#' + v);
  transicion(tipo, () => {
    $$('.view').forEach(s => s.classList.toggle('on', s.id === 'v-' + v));
    VIEWS[v].show(sub);
    window.scrollTo(0, 0);
    document.dispatchEvent(new Event('vista-visible'));
  });
}
const ORDEN = ['dia', 'ordenes', 'reportes', 'ajustes'];

function paintAcct() {
  const logo = S.settings?.empresa?.logo;
  const av = S.account ? (logo ? `<img src="${esc(logo)}" alt="">` : `<span class="ini">${esc((S.account.business || '?').trim().charAt(0).toUpperCase())}</span>`) : '';
  $('#acct').innerHTML = S.account ? `${av}<span class="an"><b>${esc(S.account.business)}</b><small>${esc(S.account.email)}</small></span><span class="gear">${ci('ajustes')}</span>` : '';
  $('#brand').innerHTML = '<div class="cmyk"><i style="background:var(--c)"></i><i style="background:var(--m)"></i><i style="background:var(--y)"></i><i style="background:var(--ink)"></i></div><b>Color</b><button class="navtog" data-navtoggle aria-label="Minimizar barra"><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button>';
  syncNav();
}

async function enter() {
  await Promise.all([loadMe(), loadClients()]);
  document.body.classList.remove('locked');
  $('#auth').classList.add('hide');
  paintAcct();
  if (!mounted) {
    for (const [k, m] of Object.entries(VIEWS)) m.mount($('#v-' + k));
    reportes.setGoDia(f => { dia.setFecha(f); go('dia'); });
    ajustes.setLogout(salir);
    document.querySelector('nav.tabs').addEventListener('click', e => { const b = e.target.closest('button[data-v]'); if (b) go(b.dataset.v); });
    window.addEventListener('hashchange', () => go(location.hash.slice(1), false));
    document.addEventListener('account-changed', paintAcct);
    mounted = true;
  }
  dia.setFecha(today());
  go(location.hash.slice(1) || 'dia');
  startSync();
}

async function salir(todos = false) {
  try { await api(todos ? '/api/auth/logout-all' : '/api/auth/logout', { method: 'POST', body: {} }); } catch { /* igual salir */ }
  location.hash = ''; location.reload();
}

function lock() {
  stopSync(); closeMenu();
  document.body.classList.add('locked');
  const a = $('#auth'); a.classList.remove('hide');
  showAuth(a, () => { document.dispatchEvent(new Event('sesion-iniciada')); if (location.hash.startsWith('#reset=')) history.replaceState(null, '', '#dia'); enter().catch(e => toast(e.message, true)); });
}

/* Período de prueba vencido: se oculta toda la app y no se muestra ningún dato */
let bloqueada = false;
function finPrueba() {
  if (bloqueada) return;
  bloqueada = true;
  stopSync(); closeMenu();
  document.querySelectorAll('body > *').forEach(e => e.remove());
  const d = document.createElement('div');
  d.className = 'fin-prueba';
  d.innerHTML = `<div class="box"><svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
    <h1>Período de prueba terminado</h1><p>Contacta al proveedor del sistema para activarlo. Tu información está guardada.</p></div>`;
  document.body.className = '';
  document.body.appendChild(d);
}
function avisoPrueba(pr) {
  const b = $('#prbar'); if (!b) return;
  b.classList.toggle('hide', !pr);
  if (pr) b.textContent = `Período de prueba · ${pr.dias === 0 ? 'último día' : pr.dias === 1 ? 'queda 1 día' : `quedan ${pr.dias} días`}`;
}
async function revisarPrueba() {
  try {
    const r = await fetch('/api/config', { cache: 'no-store', headers: { 'x-requested-with': 'copias-color' } });
    const { prueba } = await r.json();
    if (prueba?.vencida) { finPrueba(); return true; }
    avisoPrueba(prueba);
  } catch { /* sin conexión */ }
  return false;
}
setInterval(revisarPrueba, 10 * 60000);

setHandlers(
  () => { if ($('#auth').classList.contains('hide')) lock(); },
  online => $('#netbar').classList.toggle('hide', online),
  finPrueba,
);

document.getElementById('updbtn')?.addEventListener('click', () => location.reload());

/* Comportamiento de app: sin zoom con los dedos ni doble toque */
document.addEventListener('gesturestart', e => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
let ultimoToque = 0;
document.addEventListener('touchend', e => {
  const t = Date.now();
  if (t - ultimoToque < 300 && !e.target.closest('input, textarea, select')) e.preventDefault();
  ultimoToque = t;
}, { passive: false });

/* Barra lateral plegable (PC) */
function aplicarBarra() { document.body.classList.toggle('nav-min', !!prefs().barraMin); syncNav(); }
document.addEventListener('click', e => {
  if (!e.target.closest('[data-navtoggle]')) return;
  guardarPref({ barraMin: !prefs().barraMin }); aplicarBarra();
  setTimeout(syncNav, 320);
});
aplicarBarra();

/* Por seguridad, al cerrar la app por completo la sesión se cierra */
const VIVA = 'cc_viva';
let viva = false; try { viva = sessionStorage.getItem(VIVA) === '1'; } catch { /* */ }
document.addEventListener('sesion-iniciada', () => { try { sessionStorage.setItem(VIVA, '1'); } catch { /* */ } });

(async () => {
  if (await revisarPrueba()) return;
  if (!viva && !location.hash.startsWith('#reset=')) { try { await api('/api/auth/logout', { method: 'POST', body: {} }); } catch { /* sin sesión */ } }
  if (location.hash.startsWith('#reset=')) { lock(); return; }
  try { await enter(); document.dispatchEvent(new Event('sesion-iniciada')); }
  catch (e) { if (e.status !== 401) { toast(e.message, true); lock(); } }
})();
