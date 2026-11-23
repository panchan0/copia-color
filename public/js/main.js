import { api, setHandlers } from './api.js';
import { S, loadMe, loadClients, startSync, stopSync, today } from './store.js';
import { $, $$, toast } from './ui/dom.js';
import { closeMenu } from './ui/menu.js';
import { showAuth } from './views/auth.js';
import { esc } from './util.js';
import * as dia from './views/dia.js';
import * as caja from './views/caja.js';
import * as reportes from './views/reportes.js';
import * as ajustes from './views/ajustes.js';
import * as ordenes from './views/ordenes.js';
import * as orden from './views/orden.js';

const VIEWS = { dia, caja, ordenes, orden, reportes, ajustes };
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
  vista = v;
  $$('.view').forEach(s => s.classList.toggle('on', s.id === 'v-' + v));
  if (v !== 'orden') navSel = NAV[v] || v;
  $$('nav.tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === navSel));
  if (push && location.hash !== '#' + v) history.replaceState(null, '', '#' + v);
  VIEWS[v].show(sub);
  window.scrollTo(0, 0);
}

function paintAcct() {
  $('#acct').innerHTML = S.account ? esc(S.account.email) : '';
  const logo = S.settings?.empresa?.logo;
  $('#brand').innerHTML = S.account ? `${logo ? `<img src="${esc(logo)}" alt="">` : `<span class="ini">${esc((S.account.business || '?').trim().charAt(0).toUpperCase())}</span>`}<b>${esc(S.account.business)}</b>` : '';
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
  showAuth(a, () => enter().catch(e => toast(e.message, true)));
}

setHandlers(
  () => { if ($('#auth').classList.contains('hide')) lock(); },
  online => $('#netbar').classList.toggle('hide', online),
);

document.getElementById('updbtn')?.addEventListener('click', () => location.reload());

(async () => {
  try { await enter(); }
  catch (e) { if (e.status !== 401) { toast(e.message, true); lock(); } }
})();
