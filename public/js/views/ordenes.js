import { api } from '../api.js';
import { today, on, syncNow, emit } from '../store.js';
import { toast, ICON } from '../ui/dom.js';
import { salesTable, bindOrden, numTxt } from '../ui/salestable.js';
import { bindCobrar } from '../ui/cobrar.js';
import { esc, money, int, MESES, cap, startOfMonth, endOfMonth, addMonths, parseD } from '../util.js';

let root, estado = 'pendiente', mes = null, lista = [], loading = false, reqId = 0, anularPend = null;
const ESTS = { pendiente: 'Pendientes', pagada: 'Pagadas', anulada: 'Anuladas', todas: 'Todas' };

export function mount(el) {
  root = el;
  mes = startOfMonth(today());
  root.innerHTML = `
  <div class="toolbar">
    <div class="seg" data-est style="min-width:min(100%,420px)">${Object.entries(ESTS).map(([k, l]) => `<button data-e="${k}">${l}</button>`).join('')}</div>
    <div class="row mesnav" data-mesnav>
      <button class="iconbtn" data-prev aria-label="Mes anterior">${ICON.left}</button>
      <div class="datebtn" style="cursor:default" data-mes></div>
      <button class="iconbtn" data-next aria-label="Mes siguiente">${ICON.right}</button>
    </div>
    <div class="spacer"></div>
    <input class="input" data-q placeholder="Buscar cliente, número o servicio…" style="max-width:320px">
  </div>
  <div class="strip3">
    <div class="kpi"><div class="label" style="margin:0" data-k1l>Órdenes</div><div class="v" data-k1>0</div></div>
    <div class="kpi"><div class="label" style="margin:0" data-k2l>Monto</div><div class="v" data-k2>$0.00</div></div>
    <div class="kpi"><div class="label" style="margin:0">Más antigua</div><div class="v small" data-k3>—</div></div>
  </div>
  <div class="card"><div data-list></div></div>`;
  root.querySelector('[data-est]').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; estado = b.dataset.e; load(); });
  root.querySelector('[data-prev]').onclick = () => { mes = addMonths(mes, -1); load(); };
  root.querySelector('[data-next]').onclick = () => { mes = addMonths(mes, 1); load(); };
  root.querySelector('[data-q]').addEventListener('input', paint);
  const list = root.querySelector('[data-list]');
  bindOrden(list, id => lista.find(v => v.id === id));
  bindCobrar(list, () => load(true));
  list.addEventListener('click', onAnular);
  on(what => { if ((what === 'remote' || what === 'sale') && root.closest('.view.on')) load(true); });
}

export function show() { load(); }

async function load(silent = false) {
  const id = ++reqId;
  paintHead();
  if (!silent) { loading = true; paint(); }
  try {
    const q = estado === 'pendiente' ? 'estado=pendiente' : `estado=${estado}&from=${mes}&to=${endOfMonth(mes)}`;
    const r = await api(`/api/orders?${q}`);
    if (id !== reqId) return;
    lista = r.sales; loading = false; paint();
  } catch (e) { if (id === reqId) { loading = false; paint(); if (e.status !== 401) toast(e.message, true); } }
}

function paintHead() {
  root.querySelectorAll('[data-est] button').forEach(b => b.classList.toggle('sel', b.dataset.e === estado));
  root.querySelector('[data-mesnav]').classList.toggle('hide', estado === 'pendiente');
  const d = parseD(mes);
  root.querySelector('[data-mes]').textContent = `${cap(MESES[d.getUTCMonth()])} ${d.getUTCFullYear()}`;
  root.querySelector('[data-next]').disabled = mes >= startOfMonth(today());
}

function filtrar() {
  const q = root.querySelector('[data-q]').value.trim().toLowerCase();
  if (!q) return lista;
  return lista.filter(v => (v.client_name || 'contado').toLowerCase().includes(q) || numTxt(v).includes(q) || (v.operador || '').toLowerCase().includes(q)
    || v.items.some(it => `${it.nombre} ${it.tam}`.toLowerCase().includes(q)));
}

function paint() {
  const vis = filtrar();
  const total = vis.filter(v => !v.anulada).reduce((a, v) => a + v.total_cents, 0);
  root.querySelector('[data-k1l]').textContent = estado === 'pendiente' ? 'Por cobrar' : 'Órdenes';
  root.querySelector('[data-k1]').textContent = int(vis.length);
  root.querySelector('[data-k2l]').textContent = estado === 'pendiente' ? 'Monto pendiente' : 'Monto';
  root.querySelector('[data-k2]').textContent = money(total);
  const vieja = vis.slice().sort((a, b) => a.ts - b.ts)[0];
  root.querySelector('[data-k3]').textContent = vieja ? `N° ${numTxt(vieja)} · ${vieja.fecha.split('-').reverse().join('/')}` : '—';
  root.querySelector('[data-list]').innerHTML = salesTable(vis, {
    loading, fecha: true, pago: estado !== 'pendiente', pend: anularPend,
    empty: estado === 'pendiente' ? 'No hay órdenes pendientes por cobrar' : 'Sin órdenes en este mes',
  });
}

async function onAnular(e) {
  const b = e.target.closest('.an'); if (!b) return;
  const id = b.dataset.id;
  if (anularPend !== id) { anularPend = id; paint(); setTimeout(() => { if (anularPend === id) { anularPend = null; paint(); } }, 4000); return; }
  anularPend = null;
  try { await api(`/api/sales/${id}/void`, { method: 'POST', body: {} }); toast('Orden anulada'); emit('sale'); syncNow(); load(true); }
  catch (err) { toast(err.message, true); }
}
export { esc };
