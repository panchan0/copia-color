import { api } from '../api.js';
import { today, on, syncNow, emit } from '../store.js';
import { toast, ICON } from '../ui/dom.js';
import { listPicker } from '../ui/pickers.js';
import { salesTable, bindOrden, numTxt } from '../ui/salestable.js';
import { bindCobrar, bindMetodo } from '../ui/cobrar.js';
import { esc, money, int, MESES, cap, startOfMonth, endOfMonth, addMonths, parseD } from '../util.js';

let paintEst = () => {}, root, estado = 'pendiente', mes = null, lista = [], loading = false, reqId = 0, anularPend = null;
const ESTS = { pendiente: 'Pendientes', pordefinir: 'Por definir', pagada: 'Pagadas', anulada: 'Anuladas', todas: 'Todas' };

export function mount(el) {
  root = el;
  mes = startOfMonth(today());
  root.innerHTML = `
  <div class="toolbar otb">
    <button type="button" class="estpick" data-est></button>
    <button class="btn" data-nueva>${ICON.plus}Nueva orden</button>
  </div>
  <div class="toolbar otb2">
    <div class="row mesnav" data-mesnav>
      <button class="iconbtn" data-prev aria-label="Mes anterior">${ICON.left}</button>
      <div class="datebtn" data-mes></div>
      <button class="iconbtn" data-next aria-label="Mes siguiente">${ICON.right}</button>
    </div>
    <input class="input" data-q type="search" placeholder="Buscar cliente, número o servicio">
  </div>
  <div class="card olist">
    <div class="ohead"><span data-k1></span><b class="num" data-k2></b></div>
    <div class="bulk hide" data-bulk><button class="btn line sm" data-cobrartodas>Cobrar todas sin método</button></div>
    <div data-list></div>
  </div>`;
  paintEst = listPicker(root.querySelector('[data-est]'), { items: () => Object.entries(ESTS).map(([id, label]) => ({ id, label })), getValue: () => estado, onChange: v => { estado = v; load(); } });
  root.querySelector('[data-nueva]').onclick = () => { location.hash = '#caja'; };
  root.querySelector('[data-prev]').onclick = () => { mes = addMonths(mes, -1); load(); };
  root.querySelector('[data-next]').onclick = () => { mes = addMonths(mes, 1); load(); };
  root.querySelector('[data-q]').addEventListener('input', paint);
  root.querySelector('[data-cobrartodas]').addEventListener('click', cobrarTodas);
  const list = root.querySelector('[data-list]');
  bindOrden(list, id => lista.find(v => v.id === id));
  bindCobrar(list, () => load(true));
  bindMetodo(list, () => load(true));
  list.addEventListener('click', onAnular);
  on(what => { if ((what === 'remote' || what === 'sale') && root.closest('.view.on')) load(true); });
}

export function show() { load(); }

async function load(silent = false) {
  const id = ++reqId;
  paintHead();
  if (!silent) { loading = true; paint(); }
  try {
    const q = estado === 'pendiente' ? 'estado=pendiente' : estado === 'pordefinir' ? 'estado=pordefinir' : `estado=${estado}&from=${mes}&to=${endOfMonth(mes)}`;
    const r = await api(`/api/orders?${q}`);
    if (id !== reqId) return;
    lista = r.sales; loading = false; paint();
  } catch (e) { if (id === reqId) { loading = false; paint(); if (e.status !== 401) toast(e.message, true); } }
}

function paintHead() {
  paintEst();
  root.querySelector('[data-mesnav]').classList.toggle('hide', estado === 'pendiente' || estado === 'pordefinir');
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
  root.querySelector('[data-k1]').textContent = loading ? '' : `${int(vis.length)} ${vis.length === 1 ? 'orden' : 'órdenes'}`;
  root.querySelector('[data-k2]').textContent = loading ? '' : money(total);
  root.querySelector('[data-bulk]').classList.toggle('hide', estado !== 'pendiente' || !vis.length);
  root.querySelector('[data-list]').innerHTML = salesTable(vis, {
    loading, fecha: true, pago: estado !== 'pendiente', pend: anularPend,
    empty: estado === 'pendiente' ? 'No hay órdenes pendientes por cobrar' : 'Sin órdenes en este mes',
  });
}

async function cobrarTodas(e) {
  const vis = filtrar().filter(v => v.estado === 'pendiente');
  if (!vis.length) return;
  const b = e.currentTarget;
  if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = `¿Cobrar ${vis.length} órdenes?`; setTimeout(() => { b.classList.remove('armed'); b.textContent = 'Cobrar todas sin método'; }, 5000); return; }
  b.disabled = true;
  try {
    const r = await api('/api/sales/pay-many', { method: 'POST', body: { ids: vis.map(v => v.id), metodo: 'pordefinir' } });
    toast(`${r.cobradas} órdenes cobradas`); emit('sale'); syncNow(); load(true);
  } catch (err) { toast(err.message, true); }
  b.disabled = false; b.classList.remove('armed'); b.textContent = 'Cobrar todas sin método';
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
