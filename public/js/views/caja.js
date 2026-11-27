import { api } from '../api.js';
import { S, today, on, emit, syncNow } from '../store.js';
import { $, toast, choice, ICON } from '../ui/dom.js';
import { metodoPicker, clientePicker, listPicker, operadorPicker, CREDITO } from '../ui/pickers.js';
import { imprimirOrden, descargarOrden } from '../workorder.js';
import { esc, money, toCents, uuid, METODOS, calcItbms, fmtCant, baseNombre, CATS2, catDe, opCode, numOrdenTxt } from '../util.js';

let root, cat = 'imp', base = null, enColor = true, editId = null, editNum = null, servId = null, tamId = null, cant = 1, ticket = [], metodo = null, clientId = null, credito = false, operador = null, paying = false;
let paints = {}, pendingId = null;
try { operador = localStorage.getItem('cc_operador') || null; } catch { /* sin almacenamiento */ }

const servicios = () => S.settings.catalogo.filter(s => catDe(s) === cat && !s.oculto && s.tams.some(t => !t.oculto));
const bases = () => [...new Set(servicios().map(s => baseNombre(s.nombre)))];
const variantes = () => servicios().filter(s => baseNombre(s.nombre) === base);
function elegirServ() {
  const vs = variantes();
  const s = vs.find(x => !!x.color === enColor) || vs[0] || null;
  if (s) enColor = !!s.color;
  servId = s?.id || null;
  if (!s?.tams.some(t => t.id === tamId && !t.oculto)) tamId = s?.tams.find(t => !t.oculto)?.id || null;
}
const serv = () => S.settings.catalogo.find(s => s.id === servId) || null;
const tam = () => serv()?.tams.find(t => t.id === tamId) || null;
const tamsVisibles = () => (serv()?.tams || []).filter(t => !t.oculto);
const UNIT_LABEL = { 'pág': 'Páginas', 'hoja': 'Hojas', 'pie lineal': 'Pies', 'juego': 'Juegos', 'unidad': 'Cantidad' };

function tramo(t, pags) {
  if (!t?.tramos) return null;
  let desde = 1;
  for (const tr of t.tramos) { if (pags <= tr.hasta) return { ...tr, desde }; desde = tr.hasta + 1; }
  return null;
}
/** Precio del catálogo para la línea actual (0 si es libre). */
function precioCat() {
  const s = serv(), t = tam(); if (!s || !t) return 0;
  if (t.tramos) { const tr = tramo(t, Number($('#encPags', root).value)); return tr ? tr.precio : 0; }
  return t.precio || 0;
}
/** Precio escrito a mano (precio especial del cliente o precio libre). */
const precioMano = () => toCents($('#libPrecio', root).value) || 0;
const precioActual = () => precioMano() || precioCat();
function linea() {
  const s = serv(), t = tam(), p = precioActual();
  if (!s || !t) return null;
  const pags = Number($('#encPags', root).value);
  const tr = t.tramos ? tramo(t, pags) : null;
  const libre = !!s.libre;
  const nombre = libre ? ($('#libNombre', root).value.trim() || 'Otro') : s.nombre;
  const tamTxt = libre ? ($('#libTam', root).value.trim() || '—') : t.nombre;
  const extraUser = $('#lnExtra', root).value.trim();
  const extra = [tr ? `${pags} págs (tarifa ${tr.desde} a ${tr.hasta})` : '', extraUser].filter(Boolean).join(' · ') || null;
  return {
    serv: s.id, tam: t.id, cant, precio_cents: p, sub_cents: Math.round(p * cant), paginas: t.tramos ? pags : undefined,
    nombre, tamano: tamTxt, color: libre ? $('#libColor', root).checked : s.color, extraUser, extra, unidad: s.unidad, tamLabel: tamTxt,
    especial: !libre && precioMano() > 0 && precioMano() !== precioCat(),
  };
}
const lineaOk = () => { const l = linea(); return !!l && l.cant > 0 && l.precio_cents > 0; };
const items = () => ticket;
const bruto = () => items().reduce((a, b) => a + b.sub_cents, 0);

export function mount(el) {
  root = el;
  root.innerHTML = `
  <div class="subhead"><button class="back" data-back>${ICON.left}Volver</button><h2 data-tit>Nueva orden</h2></div>
  <div class="lay-caja">
    <div class="c-main">
      <div class="card">
        <div class="label">Cliente</div>
        <div class="grid2">
          <div class="field span2"><label>Cliente o empresa</label><button type="button" data-cli></button></div>
          <div class="field"><label for="ctTel">Celular</label><input class="input" id="ctTel" type="tel" maxlength="30"></div>
          <div class="field"><label for="ctDm">DM</label><input class="input" id="ctDm" maxlength="60" placeholder="@usuario"></div>
          <div class="field span2"><label for="ctEmail">Correo</label><input class="input" id="ctEmail" type="email" maxlength="120"></div>
          <div class="field"><label>Operador</label><button type="button" data-op></button></div>
          <div class="field span2"><label for="oNota">Nota</label><textarea class="input ta" id="oNota" maxlength="600" rows="2"></textarea></div>
        </div>
      </div>
      <div class="card">
        <div class="label">Servicio</div>
        <div class="grid2">
          <div class="field"><label>Tipo</label><button type="button" data-cat></button></div>
          <div class="field"><label>Producto o servicio</label><button type="button" data-serv></button></div>
        </div>
        <div class="field colsel" data-colsel><label>Color</label><div class="seg tema" data-col><button type="button" data-c="1">A color</button><button type="button" data-c="0">Blanco y negro</button></div></div>
        <div class="tamq">
          <div class="field"><label>Tamaño</label><button type="button" data-tam></button></div>
          <div class="field"><label for="qInput" data-qlabel>Cantidad</label><input class="input num" id="qInput" type="number" inputmode="decimal" min="0" value="1"></div>
        </div>
        <div class="grid2">
          <div class="field hide" data-fprecio><label for="libPrecio">Precio por unidad</label><input class="input" id="libPrecio" type="number" inputmode="decimal" step="0.01" min="0" placeholder="0.00"></div>
          <div class="field hide" data-fpags><label for="encPags">Páginas del documento</label><input class="input" id="encPags" type="number" inputmode="numeric" min="1"></div>
        </div>
        <div class="grid2 hide" data-libre style="margin-top:10px">
          <div class="field"><label for="libNombre">Descripción</label><input class="input" id="libNombre" maxlength="80"></div>
          <div class="field"><label for="libTam">Tamaño</label><input class="input" id="libTam" maxlength="40"></div>
          <label class="check"><input type="checkbox" id="libColor"> Es a color</label>
        </div>
        <div class="field" style="margin-top:10px"><label for="lnExtra">Detalle</label><textarea class="input ta" id="lnExtra" maxlength="200" rows="1"></textarea></div>
        <button class="btn line block" data-add style="margin-top:12px">${ICON.plus}Agregar a la orden</button>
      </div>
    </div>
    <div class="c-side">
      <div class="card c-ticket">
        <div class="row between"><div class="label" style="margin:0">Orden</div><button class="lnk an hide" data-clear>Vaciar</button></div>
        <div data-lines></div>
        <div class="ticket-sub" data-tsub></div>
        <div class="ticket-total"><span>Total</span><span class="big num" data-total>$0.00</span></div>
        <div class="field" style="margin-top:12px"><label>Método de pago</label><button type="button" data-met></button></div>
        <div class="grid2 hide" data-cash style="margin-top:10px">
          <div class="field"><label for="recibe">Recibe</label><input class="input" id="recibe" type="number" inputmode="decimal" step="0.01" placeholder="0.00"></div>
          <div class="field"><label>Cambio</label><input class="input num" data-cambio readonly value="—" tabindex="-1"></div>
        </div>
        <div class="payrow">
          <button class="btn line" data-pend>Guardar pendiente</button>
          <button class="btn pay" data-pay>Cobrar</button>
        </div>
      </div>
    </div>
  </div>`;

  root.querySelector('[data-back]').onclick = () => { location.hash = editId ? `#orden=${editId}` : '#ordenes'; };
  paints.cat = listPicker(root.querySelector('[data-cat]'), { items: () => Object.entries(CATS2).filter(([id]) => S.settings.catalogo.some(x => catDe(x) === id && !x.oculto)).map(([id, label]) => ({ id, label })), getValue: () => cat, onChange: setCat });
  paints.serv = listPicker(root.querySelector('[data-serv]'), {
    items: () => bases().map(b => ({ id: b, label: b })), getValue: () => base, placeholder: 'Selecciona',
    onChange: v => { base = v; $('#libPrecio', root).value = ''; elegirServ(); paints.tam(); paint(); },
  });
  root.querySelector('[data-col]').addEventListener('click', e => {
    const b = e.target.closest('button[data-c]'); if (!b || b.disabled) return;
    enColor = b.dataset.c === '1'; elegirServ(); paints.tam(); paint();
  });
  root.querySelectorAll('textarea.ta').forEach(t => t.addEventListener('input', () => autoAlto(t)));
  paints.tam = listPicker(root.querySelector('[data-tam]'), {
    items: () => tamsVisibles().map(t => ({ id: t.id, label: t.nombre, sub: t.tramos ? `desde ${money(t.tramos[0].precio)}` : t.precio ? `${money(t.precio)}${serv().unidad === 'pie lineal' ? ' / pie' : ''}` : 'precio libre' })),
    getValue: () => tamId, placeholder: 'Selecciona', onChange: v => { tamId = v; $('#libPrecio', root).value = ''; paint(); },
  });
  ['libNombre', 'libTam', 'libPrecio', 'encPags', 'lnExtra', 'recibe'].forEach(id => $('#' + id, root).addEventListener('input', paint));
  $('#libColor', root).addEventListener('change', paint);
  const q = $('#qInput', root);
  q.addEventListener('input', () => { cant = normCant(Number(q.value) || 0); paint(); });
  q.addEventListener('blur', () => { if (cant <= 0) cant = 1; paint(); });
  q.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } });
  root.querySelector('[data-add]').onclick = agregar;
  root.querySelector('[data-clear]').onclick = () => { ticket = []; paint(); };
  root.querySelector('[data-lines]').addEventListener('click', e => { const b = e.target.closest('.x'); if (!b) return; ticket.splice(Number(b.dataset.i), 1); paint(); });
  paints.met = metodoPicker(root.querySelector('[data-met]'), () => metodo, v => { metodo = v; paint(); if (v === 'efectivo') setTimeout(() => $('#recibe', root).focus(), 30); });
  paints.cli = clientePicker(root.querySelector('[data-cli]'), () => clientId || (credito ? CREDITO : null), v => {
    credito = v === CREDITO; clientId = credito ? null : v; llenarContacto();
  });
  paints.op = operadorPicker(root.querySelector('[data-op]'), () => operador, v => { operador = v; try { localStorage.setItem('cc_operador', v); } catch { /* */ } });
  $('#recibe', root).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); guardar(true); } });
  root.querySelector('[data-pay]').onclick = () => guardar(true);
  root.querySelector('[data-pend]').onclick = () => guardar(false);
  on(what => {
    if (what === 'remote') {
      if (clientId && !S.clients.some(c => c.id === clientId)) clientId = null;
      if (servId && !serv()) { servId = null; elegirServ(); }
      paints.cli(); paints.op(); paints.serv(); paints.tam(); paint();
    }
  });
  setCat('imp');
}
function autoAlto(t) { t.style.height = 'auto'; t.style.height = Math.min(220, t.scrollHeight + 2) + 'px'; }

export function show() {
  // operador guardado: convertir nombres antiguos a su código
  const ops = S.settings.operadores || [];
  const m = ops.find(o => o.n === operador || opCode(o) === operador);
  operador = m ? opCode(m) : null;
  root.querySelector('[data-tit]').textContent = editId ? `Editar orden N° ${editNum}` : 'Nueva orden';
  root.querySelector('[data-pay]').classList.toggle('hide', !!editId);
  root.querySelector('[data-met]').closest('.field').classList.toggle('hide', !!editId);
  root.querySelector('[data-pend]').textContent = editId ? 'Guardar cambios' : 'Guardar pendiente';
  root.querySelector('[data-pend]').classList.toggle('pay', !!editId);
  paints.cat(); paints.serv(); paints.tam(); paints.cli(); paints.op(); paint();
  root.querySelectorAll('textarea.ta').forEach(autoAlto);
}

/** Abrir el formulario para una orden nueva (limpio) o para editar una existente. */
export function nueva() { if (editId) limpiar(); editId = null; editNum = null; }
export function editar(v) {
  limpiar();
  editId = v.id; editNum = numOrdenTxt(v);
  clientId = v.client_id || null;
  credito = !clientId && v.client_name === 'Crédito';
  const ops = S.settings.operadores || [];
  const m = ops.find(o => o.n === v.operador || opCode(o) === v.operador);
  operador = m ? opCode(m) : (v.operador && v.operador !== 'Job Log' ? v.operador : null);
  setTimeout(() => {
    $('#ctTel', root).value = v.tel || ''; $('#ctDm', root).value = v.dm || ''; $('#ctEmail', root).value = v.email || '';
    $('#oNota', root).value = v.nota || '';
    root.querySelectorAll('textarea.ta').forEach(autoAlto);
  });
  ticket = v.items.map(it => {
    const s = S.settings.catalogo.find(x => x.id === it.tipo);
    const t = s?.libre ? s.tams[0] : s?.tams.find(x => x.nombre === it.tam);
    let ex = it.extra || '';
    const especial = /^Precio especial( · |$)/.test(ex);
    if (especial) ex = ex.replace(/^Precio especial( · )?/, '');
    const pm = /^(\d+) págs \(tarifa[^)]*\)/.exec(ex);
    const extraUser = pm ? (ex.slice(pm[0].length).replace(/^ · /, '')) : ex;
    return {
      serv: s?.id || it.tipo, tam: t?.id || '', cant: it.cant, precio_cents: it.precio_cents, sub_cents: it.sub_cents,
      paginas: pm ? Number(pm[1]) : undefined, nombre: it.nombre, tamano: it.tam, color: !!it.color, extraUser, extra: it.extra, unidad: it.unidad, tamLabel: it.tam, especial,
    };
  });
}
function limpiar() {
  pendingId = null; ticket = []; cant = 1; metodo = null; clientId = null; credito = false;
  ['recibe', 'ctTel', 'ctDm', 'ctEmail', 'oNota', 'libNombre', 'libTam', 'libPrecio', 'encPags', 'lnExtra'].forEach(id => { const e = $('#' + id, root); if (e) e.value = ''; });
  paints.met?.(); paints.cli?.();
}

const normCant = n => serv()?.unidad === 'pie lineal' ? Math.max(0, Math.round(n * 100) / 100) : Math.max(0, Math.min(100000, Math.round(n)));
function setCant(n) { cant = Math.max(serv()?.unidad === 'pie lineal' ? 0.5 : 1, normCant(n)); paint(); }

function setCat(c) {
  cat = c;
  base = bases()[0] || null;
  tamId = null; elegirServ();
  paints.cat?.(); paints.serv(); paints.tam(); paint();
}

function llenarContacto() {
  const c = S.clients.find(x => x.id === clientId);
  $('#ctTel', root).value = c?.phone || '';
  $('#ctDm', root).value = c?.dm || '';
  $('#ctEmail', root).value = c?.email || '';
}

const s0libre = () => !!serv()?.libre;
function agregar() {
  const l = linea();
  if (!l) return toast('Selecciona el producto y el tamaño', true);
  if (tam()?.tramos && !tramo(tam(), l.paginas)) return toast('Escribe las páginas del documento (máximo ' + tam().tramos.at(-1).hasta + ')', true);
  if (!(l.precio_cents > 0)) return toast('Escribe el precio', true);
  if (!(l.cant > 0)) return toast('Cantidad inválida', true);
  ticket.push(l); cant = 1; $('#lnExtra', root).value = ''; autoAlto($('#lnExtra', root));
  $('#libPrecio', root).value = '';
  if (s0libre()) { $('#libNombre', root).value = ''; $('#libTam', root).value = ''; }
  paint();
  const ult = root.querySelector('[data-lines] .tline:last-child'); ult?.animate?.([{ background: 'var(--acc2)' }, { background: 'transparent' }], { duration: 900 });
}

function paint() {
  const s = serv(), t = tam();
  root.querySelector('[data-libre]').classList.toggle('hide', !s?.libre);
  root.querySelector('[data-fprecio]').classList.toggle('hide', !t);
  const pc = precioCat(), lp = $('#libPrecio', root);
  lp.placeholder = pc ? (pc / 100).toFixed(2) : '0.00';
  root.querySelector('[data-fprecio] label').textContent = pc && precioMano() && precioMano() !== pc ? 'Precio especial' : 'Precio por unidad';
  root.querySelector('[data-fpags]').classList.toggle('hide', !t?.tramos);
  root.querySelector('[data-qlabel]').textContent = UNIT_LABEL[s?.unidad] || 'Cantidad';
  const q = $('#qInput', root); if (document.activeElement !== q) q.value = cant;
  q.step = s?.unidad === 'pie lineal' ? '0.5' : '1';
  root.querySelector('[data-add]').disabled = !lineaOk();
  const vs = variantes(), hayC = vs.some(x => x.color), hayB = vs.some(x => !x.color);
  root.querySelector('[data-colsel]').classList.toggle('hide', !(hayC && hayB) && cat !== 'imp');
  root.querySelectorAll('[data-col] button').forEach(b => { const c = b.dataset.c === '1'; b.disabled = c ? !hayC : !hayB; b.classList.toggle('sel', c === !!serv()?.color); });
  root.querySelector('[data-lines]').innerHTML = ticket.length ? ticket.map((it, i) => `<div class="tline"><span class="q num">${esc(fmtCant(it.cant, it.unidad))}×</span>
    <span class="d">${esc(it.nombre)} · ${esc(it.tamLabel)}<small>${money(it.precio_cents)} c/u${it.extra ? ' · ' + esc(it.extra) : ''}</small></span>
    <b class="num">${money(it.sub_cents)}</b><button class="x" data-i="${i}" aria-label="Quitar">×</button></div>`).join('') : '<div class="empty sm">Agrega productos con el botón “Agregar a la orden”</div>';
  root.querySelector('[data-clear]').classList.toggle('hide', !ticket.length);
  const cx = calcItbms(bruto(), S.settings.itbms), tot = cx.total;
  root.querySelector('[data-total]').textContent = money(tot);
  root.querySelector('[data-tsub]').innerHTML = tot <= 0 ? ''
    : `<div><span>Subtotal</span><span class="num">${money(cx.sub)}</span></div><div><span>ITBMS ${S.settings.itbms.tasa}%</span><span class="num">${money(cx.itbms)}</span></div>`;
  root.querySelector('[data-cash]').classList.toggle('hide', metodo !== 'efectivo');
  const rec = toCents($('#recibe', root).value);
  root.querySelector('[data-cambio]').value = rec > 0 ? (rec >= tot ? money(rec - tot) : 'Falta ' + money(tot - rec)) : '—';
  const pay = root.querySelector('[data-pay]');
  pay.textContent = paying ? 'Guardando…' : `Cobrar ${money(tot)}`;
  pay.disabled = paying || tot <= 0;
  root.querySelector('[data-pend]').disabled = paying || tot <= 0;
}

const cuerpoItems = its => its.map(it => ({ serv: it.serv, tam: it.tam, cant: it.cant, precio_cents: it.precio_cents, especial: !!it.especial, paginas: it.paginas, nombre: it.nombre, tamano: it.tamano, color: it.color, extra: it.extraUser }));

async function guardarEdicion(its) {
  if (paying) return;
  paying = true; paint();
  try {
    const r = await api(`/api/sales/${encodeURIComponent(editId)}`, { method: 'PUT', body: {
      client_id: clientId, credito, operador, contacto_tel: $('#ctTel', root).value, contacto_dm: $('#ctDm', root).value,
      contacto_email: $('#ctEmail', root).value, nota: $('#oNota', root).value, items: cuerpoItems(its),
    } });
    toast('Orden actualizada');
    const id = r.sale.id;
    limpiar(); editId = null;
    emit('sale'); syncNow();
    location.hash = `#orden=${id}`;
  } catch (e) { toast(e.message, true); }
  paying = false; paint();
}

async function guardar(cobrar) {
  const its = items();
  if (!its.length) { toast('Toca “Agregar a la orden” para sumar el producto', true); root.querySelector('[data-add]').focus(); return; }
  if (editId) return guardarEdicion(its);
  if (cobrar && !metodo) { toast('Selecciona el método de pago', true); root.querySelector('[data-met]').click(); return; }
  if (!operador) { toast('Selecciona el operador', true); root.querySelector('[data-op]').click(); return; }
  if (paying) return;
  paying = true; paint();
  pendingId = pendingId || uuid();
  try {
    const body = {
      id: pendingId, metodo: cobrar ? metodo : null, client_id: clientId, credito, operador,
      contacto_tel: $('#ctTel', root).value, contacto_dm: $('#ctDm', root).value, contacto_email: $('#ctEmail', root).value, nota: $('#oNota', root).value,
      items: cuerpoItems(its),
    };
    const r = await api('/api/sales', { method: 'POST', body });
    const v = r.sale;
    await choice({
      title: `${cobrar ? 'Orden cobrada' : 'Orden pendiente'} · N° ${numOrdenTxt(v)}`,
      html: `<p class="sub-note" style="margin:-6px 0 4px">${esc(v.client_name || 'Contado')} · ${money(v.total_cents)}${cobrar ? ' · ' + METODOS[v.metodo] : ' · por cobrar'}</p>`,
      buttons: [
        { label: `${ICON.print}Imprimir orden`, cls: 'line', keep: true, onClick: () => imprimirOrden(v) },
        { label: `${ICON.down}Descargar PDF`, cls: 'line', keep: true, onClick: () => descargarOrden(v) },
        { label: 'Listo', value: true },
      ],
    });
    location.hash = '#ordenes';
    limpiar();
    emit('sale'); syncNow();
  } catch (e) {
    toast(e.message, true);
    if (e.status && e.status < 500) pendingId = null;
  }
  paying = false; paint();
}
