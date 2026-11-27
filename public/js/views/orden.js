import { api } from '../api.js';
import { emit, syncNow } from '../store.js';
import { toast, ICON } from '../ui/dom.js';
import { bindCobrar, bindMetodo } from '../ui/cobrar.js';
import { estadoTag, numTxt } from '../ui/salestable.js';
import { imprimirOrden, descargarOrden } from '../workorder.js';
import { facturar, imprimirFactura } from '../facturas.js';
import { S } from '../store.js';
import * as caja from './caja.js';
import { esc, money, dmy, METODOS, itemLabel, fmtCant, opTexto } from '../util.js';

let root, id = null, venta = null, armada = false, reqId = 0, volver = '#ordenes';

export function setOrden(v, from) { id = v; if (from) volver = from; }

export function mount(el) {
  root = el;
  root.innerHTML = `<div class="subhead"><button class="back" data-back>${ICON.left}Volver</button><h2 data-tit>Orden</h2></div><div class="odet" data-body></div>`;
  root.querySelector('[data-back]').onclick = () => { location.hash = volver; };
  const body = root.querySelector('[data-body]');
  bindCobrar(body, load);
  bindMetodo(body, load);
  body.addEventListener('click', onClick);
}

export function show() { armada = false; venta = null; paint(); load(); }

async function load() {
  if (!id) { location.hash = '#ordenes'; return; }
  const r0 = ++reqId;
  try { const r = await api(`/api/sales/${encodeURIComponent(id)}`); if (r0 === reqId) { venta = r.sale; paint(); } }
  catch (e) { toast(e.message, true); location.hash = volver; }
}

const fila = (k, v) => v ? `<div class="kv"><span>${k}</span><b>${v}</b></div>` : '';

function paint() {
  const body = root.querySelector('[data-body]');
  if (!venta) { body.innerHTML = '<div class="card"><div class="empty">Cargando…</div></div>'; return; }
  const v = venta, anul = v.anulada || v.estado === 'anulada';
  root.querySelector('[data-tit]').textContent = anul ? 'Orden anulada' : `Orden N° ${numTxt(v)}`;
  const op = opTexto(v, S.settings.operadores);
  const contacto = [fila('Celular', esc(v.tel || '')), fila('DM', esc(v.dm || '')), fila('Correo', esc(v.email || '')), fila('RUC', esc(v.ruc || ''))].join('');
  body.innerHTML = `
  <div class="card ohero${anul ? ' void' : ''}">
    <div class="row between"><span class="muted">Total</span>${estadoTag(v)}</div>
    <div class="big num">${money(v.total_cents)}</div>
    <div class="kvs">
      ${fila('Creada', `${dmy(v.fecha)} · ${esc(v.hora)}`)}
      ${v.pagada_fecha && !anul ? fila('Cobrada', `${dmy(v.pagada_fecha)} · ${esc(v.pagada_hora || '')}`) : ''}
      ${v.estado === 'pagada' && !anul ? fila('Método', esc(METODOS[v.metodo] || '—')) : ''}
      ${fila('Operador', esc(op))}
      ${v.entrega ? fila('Para', esc(new Date(v.entrega).toLocaleString('es-PA', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }))) : ''}
    </div>
  </div>
  ${anul ? '' : `<div class="card"><div class="label">Producción</div><div class="seg prodseg" data-prodseg>${[['cola', 'En cola'], ['proceso', 'En proceso'], ['listo', 'Listo'], ['entregado', 'Entregado']].map(([k, l]) => `<button type="button" data-p="${k}" class="${(v.prod || 'entregado') === k ? 'sel' : ''}">${l}</button>`).join('')}</div></div>`}
  <div class="card">
    <div class="label">Cliente</div>
    <div class="kvs">${fila('Nombre', v.client_name ? esc(v.client_name) : 'Contado')}${contacto}${fila('Nota', esc(v.nota || ''))}</div>
  </div>
  <div class="card">
    <div class="label">Productos</div>
    ${v.items.map(it => `<div class="oit"><span class="q num">${esc(fmtCant(it.cant, it.unidad))}×</span><span class="d">${esc(itemLabel(it))}${it.extra ? `<small>${esc(it.extra)}</small>` : ''}<small>${money(it.precio_cents)} c/u</small></span><b class="num">${money(it.sub_cents)}</b></div>`).join('')}
    <div class="ticket-sub"><div><span>Subtotal</span><span class="num">${money(v.subtotal_cents)}</span></div><div><span>ITBMS ${S.settings.itbms.tasa}%</span><span class="num">${money(v.itbms_cents)}</span></div></div>
    <div class="ticket-total"><span>Total</span><span class="big num">${money(v.total_cents)}</span></div>
  </div>
  <div class="card oacts">
    ${!anul && (v.estado === 'pendiente' || v.estado === 'credito') ? `<button class="btn block cob" data-id="${esc(v.id)}">Cobrar ${money(v.total_cents)}</button>
      <button class="btn line block" data-estado="${v.estado === 'credito' ? 'pendiente' : 'credito'}">${v.estado === 'credito' ? 'Pasar a pendiente' : 'Pasar a crédito'}</button>` : ''}
    ${!anul && v.estado === 'pagada' && v.metodo === 'pordefinir' ? `<button class="btn block met" data-id="${esc(v.id)}">Poner método de pago</button>` : ''}
    ${anul ? '' : `<button class="btn line block" data-editar>${ICON.edit || ''}Editar orden</button>`}
    ${anul ? '' : v.factura_id ? `<button class="btn line block" data-verfac="${esc(v.factura_id)}">${ICON.print}Imprimir factura</button>` : `<button class="btn line block" data-facturar>Facturar</button>`}
    <div class="grid2">
      <button class="btn line" data-print>${ICON.print}Imprimir</button>
      <button class="btn line" data-pdf>${ICON.down}PDF</button>
    </div>
    ${anul ? '' : `<button class="btn danger block${armada ? ' armed' : ''}" data-anular>${armada ? 'Toca otra vez para anular' : 'Anular orden'}</button>`}
  </div>`;
}

async function onClick(e) {
  if (!venta) return;
  if (e.target.closest('[data-print]')) return imprimirOrden(venta);
  if (e.target.closest('[data-pdf]')) return descargarOrden(venta);
  if (e.target.closest('[data-editar]')) { caja.editar(venta); location.hash = '#caja'; return; }
  const ps = e.target.closest('[data-prodseg] [data-p]');
  if (ps) {
    try { const r = await api(`/api/sales/${venta.id}/prod`, { method: 'POST', body: { prod: ps.dataset.p } }); venta = r.sale; paint(); toast(ps.dataset.p === 'listo' && r.avisado ? 'Listo · se le avisó al cliente' : 'Producción actualizada'); emit('sale'); syncNow(); }
    catch (err) { toast(err.message, true); }
    return;
  }
  if (e.target.closest('[data-facturar]')) { const f = await facturar([venta]); if (f) load(); return; }
  const vf = e.target.closest('[data-verfac]');
  if (vf) { try { const r = await api(`/api/invoices/${vf.dataset.verfac}`); imprimirFactura(r.invoice); } catch (err) { toast(err.message, true); } return; }
  const est = e.target.closest('[data-estado]');
  if (est) {
    try { const r = await api(`/api/sales/${venta.id}/estado`, { method: 'POST', body: { estado: est.dataset.estado } }); venta = r.sale; paint(); toast(est.dataset.estado === 'credito' ? 'Orden a crédito' : 'Orden pendiente'); emit('sale'); syncNow(); }
    catch (err) { toast(err.message, true); }
    return;
  }
  if (!e.target.closest('[data-anular]')) return;
  if (!armada) { armada = true; paint(); setTimeout(() => { if (armada) { armada = false; paint(); } }, 4000); return; }
  armada = false;
  try { await api(`/api/sales/${venta.id}/void`, { method: 'POST', body: {} }); toast('Orden anulada'); emit('sale'); syncNow(); location.hash = volver; }
  catch (err) { toast(err.message, true); paint(); }
}
