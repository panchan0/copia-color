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

const VIEWS = { dia, caja, reportes, ajustes };
let mounted = false, vista = null;

function go(v, push = true) {
  if (!VIEWS[v]) v = 'dia';
  closeMenu();
  vista = v;
  $$('.view').forEach(s => s.classList.toggle('on', s.id === 'v-' + v));
  $$('nav.tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  if (push && location.hash !== '#' + v) history.replaceState(null, '', '#' + v);
  VIEWS[v].show();
  window.scrollTo(0, 0);
}

function paintAcct() {
  $('#acct').innerHTML = S.account ? `<b>${esc(S.account.business)}</b>${esc(S.account.email)}` : '';
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

(async () => {
  try { await enter(); }
  catch (e) { if (e.status !== 401) { toast(e.message, true); lock(); } }
})();
