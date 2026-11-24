import { api } from '../api.js';
import { today, on, syncNow, emit } from '../store.js';
import { toast, ICON } from '../ui/dom.js';
import { listPicker } from '../ui/pickers.js';
import { nueva as nuevaOrden } from './caja.js';
import { salesTable, bindAbrir, numTxt } from '../ui/salestable.js';
import { esc, money, int, MESES, MES3, cap, startOfMonth, endOfMonth, addMonths, addDays, startOfWeek, parseD, baseNombre, dmy } from '../util.js';
import { S } from '../store.js';
import { calGrid } from '../ui/calgrid.js';
import { deslizar } from '../ui/motion.js';

let fProd = null, fCol = 'todos', cal = false, cmodo = 'mes', cref = null, dia = null;
let paintEst = () => {}, root, estado = 'pendiente', mes = null, lista = [], loading = false, reqId = 0, anularPend = null;
const ESTS = { pendiente: 'Pendientes', pordefinir: 'Por definir', pagada: 'Pagadas', todas: 'Todas' };

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
  <div class="toolbar filtros"><button type="button" data-fprod></button><button type="button" data-fcol></button><button class="iconbtn caltog" data-caltog aria-label="Calendario">${ICON.cal}</button></div>
  <div class="card ocal hide" data-ocal>
    <div class="toolbar" style="margin-bottom:10px">
      <div class="seg" data-cmodo><button data-m="semana">Semana</button><button data-m="mes">Mes</button><button data-m="anio">Año</button></div>
    </div>
    <div class="toolbar" style="margin-bottom:10px">
      <button class="iconbtn" data-cprev aria-label="Anterior">${ICON.left}</button>
      <div class="datebtn" data-clbl></div>
      <button class="iconbtn" data-cnext aria-label="Siguiente">${ICON.right}</button>
    </div>
    <div data-cgrid></div>
  </div>
  <div class="card olist">
    <div class="ohead"><span data-k1></span><b class="num" data-k2></b></div>
    <div class="bulk hide" data-bulk><button class="btn line sm" data-cobrartodas>Cobrar todas sin método</button></div>
    <div data-list></div>
  </div>`;
  paintEst = listPicker(root.querySelector('[data-est]'), { items: () => Object.entries(ESTS).map(([id, label]) => ({ id, label })), getValue: () => estado, onChange: v => { estado = v; load(); } });
  root.querySelector('[data-nueva]').onclick = () => { nuevaOrden(); location.hash = '#caja'; };
  root.querySelector('[data-prev]').onclick = () => { mes = addMonths(mes, -1); load(); };
  root.querySelector('[data-next]').onclick = () => { mes = addMonths(mes, 1); load(); };
  root.querySelector('[data-q]').addEventListener('input', paint);
  cref = today();
  listPicker(root.querySelector('[data-fprod]'), {
    items: () => [{ id: '', label: 'Todos los productos' }, ...[...new Set(S.settings.catalogo.filter(x => !x.oculto).map(x => baseNombre(x.nombre)))].map(n => ({ id: n, label: n }))],
    getValue: () => fProd || '', onChange: v => { fProd = v || null; paint(); },
  });
  listPicker(root.querySelector('[data-fcol]'), {
    items: () => [{ id: 'todos', label: 'Color y B/N' }, { id: 'color', label: 'Solo a color' }, { id: 'bn', label: 'Solo blanco y negro' }],
    getValue: () => fCol, onChange: v => { fCol = v; paint(); },
  });
  root.querySelector('[data-caltog]').onclick = () => { cal = !cal; dia = null; load(); };
  root.querySelector('[data-cmodo]').addEventListener('click', e => {
    const b = e.target.closest('button[data-m]'); if (!b || b.dataset.m === cmodo) return;
    const o = ['semana', 'mes', 'anio'], dir = o.indexOf(b.dataset.m) > o.indexOf(cmodo) ? 1 : -1;
    cmodo = b.dataset.m; dia = null; load(false, dir);
  });
  const mover = n => { cref = cmodo === 'semana' ? addDays(startOfWeek(cref), 7 * n) : cmodo === 'mes' ? addMonths(startOfMonth(cref), n) : `${Number(cref.slice(0, 4)) + n}-01-01`; dia = null; load(false, n); };
  root.querySelector('[data-cprev]').onclick = () => mover(-1);
  root.querySelector('[data-cnext]').onclick = () => mover(1);
  root.querySelector('[data-cgrid]').addEventListener('click', e => {
    const c = e.target.closest('.cgc[data-k]'); if (!c || c.classList.contains('fuera')) return;
    if (cmodo === 'anio') { cmodo = 'mes'; cref = c.dataset.k + '-01'; dia = null; load(false, 1); return; }
    dia = dia === c.dataset.k ? null : c.dataset.k; paint();
  });
  root.querySelector('[data-cobrartodas]').addEventListener('click', cobrarTodas);
  const list = root.querySelector('[data-list]');
  bindAbrir(list);
  on(what => { if ((what === 'remote' || what === 'sale') && root.closest('.view.on')) load(true); });
}

export function show() { load(); }

function crango() {
  if (cmodo === 'semana') { const a = startOfWeek(cref); return { from: a, to: addDays(a, 6) }; }
  if (cmodo === 'mes') return { from: startOfMonth(cref), to: endOfMonth(cref) };
  const y = cref.slice(0, 4); return { from: `${y}-01-01`, to: `${y}-12-31` };
}
async function load(silent = false, dir = 0) {
  const id = ++reqId;
  paintHead();
  if (dir) { deslizar(root.querySelector('[data-clbl]'), dir); }
  if (!silent) { loading = true; paint(); }
  try {
    const cr = crango();
    const q = cal ? `estado=${estado}&from=${cr.from}&to=${cr.to}` : estado === 'pendiente' ? 'estado=pendiente' : estado === 'pordefinir' ? 'estado=pordefinir' : `estado=${estado}&from=${mes}&to=${endOfMonth(mes)}`;
    const r = await api(`/api/orders?${q}`);
    if (id !== reqId) return;
    const cr2 = crango();
    lista = r.sales.filter(v => !(v.anulada || v.estado === 'anulada') && (!cal || (v.fecha >= cr2.from && v.fecha <= cr2.to))); loading = false; paint();
    if (dir) deslizar(root.querySelector('[data-cgrid]'), dir, 40);
  } catch (e) { if (id === reqId) { loading = false; paint(); if (e.status !== 401) toast(e.message, true); } }
}

function paintHead() {
  paintEst();
  root.querySelector('[data-mesnav]').classList.toggle('hide', cal || estado === 'pendiente' || estado === 'pordefinir');
  root.querySelector('[data-ocal]').classList.toggle('hide', !cal);
  root.querySelector('[data-caltog]').classList.toggle('on', cal);
  root.querySelectorAll('[data-cmodo] button').forEach(b => b.classList.toggle('sel', b.dataset.m === cmodo));
  const cr = crango(), dF = parseD(cr.from), dT = parseD(cr.to);
  root.querySelector('[data-clbl]').textContent = cmodo === 'semana' ? `${dF.getUTCDate()} ${MES3[dF.getUTCMonth()]} – ${dT.getUTCDate()} ${MES3[dT.getUTCMonth()]} ${dT.getUTCFullYear()}`
    : cmodo === 'mes' ? `${cap(MESES[dF.getUTCMonth()])} ${dF.getUTCFullYear()}` : cr.from.slice(0, 4);
  const d = parseD(mes);
  root.querySelector('[data-mes]').textContent = `${cap(MESES[d.getUTCMonth()])} ${d.getUTCFullYear()}`;
  root.querySelector('[data-next]').disabled = mes >= startOfMonth(today());
}

const baseItem = it => { const sv = S.settings.catalogo.find(x => x.id === it.tipo); return sv ? baseNombre(sv.nombre) : baseNombre(it.nombre); };
const pasaItem = it => (!fProd || baseItem(it) === fProd) && (fCol === 'todos' || (fCol === 'color') === !!it.color);
function filtrarBase() {
  const q = root.querySelector('[data-q]').value.trim().toLowerCase();
  const l = (fProd || fCol !== 'todos') ? lista.filter(v => v.items.some(pasaItem)) : lista;
  if (!q) return l;
  return l.filter(v => (v.client_name || 'contado').toLowerCase().includes(q) || numTxt(v).includes(q) || (v.operador || '').toLowerCase().includes(q)
    || v.items.some(it => `${it.nombre} ${it.tam}`.toLowerCase().includes(q)));
}

function filtrar() { const b = filtrarBase(); return dia ? b.filter(v => v.fecha === dia) : b; }

function paint() {
  if (cal) {
    const base = filtrarBase(), por = {};
    for (const v of base) { const k = cmodo === 'anio' ? v.fecha.slice(0, 7) : v.fecha; const x = por[k] ||= { v: 0, n: 0 }; x.v += v.total_cents; x.n++; }
    root.querySelector('[data-cgrid]').innerHTML = calGrid({ modo: cmodo, from: crango().from, val: k => por[k] || { v: 0, n: 0 }, hoy: today(), sel: dia });
  }
  const vis = filtrar();
  const total = vis.filter(v => !v.anulada).reduce((a, v) => a + v.total_cents, 0);
  root.querySelector('[data-k1]').textContent = loading ? '' : `${int(vis.length)} ${vis.length === 1 ? 'orden' : 'órdenes'}${dia ? ` · ${dmy(dia)}` : ''}`;
  root.querySelector('[data-k2]').textContent = loading ? '' : money(total);
  root.querySelector('[data-bulk]').classList.toggle('hide', estado !== 'pendiente' || !vis.length);
  root.querySelector('[data-list]').innerHTML = salesTable(vis, {
    loading, fecha: true, pago: estado !== 'pendiente',
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

export { esc };
