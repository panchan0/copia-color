import { api } from '../api.js';
import { S, today, on, emit, syncNow } from '../store.js';
import { $, toast, choice, ICON } from '../ui/dom.js';
import { metodoPicker, clientePicker, listPicker, operadorPicker } from '../ui/pickers.js';
import { salesTable, bindOrden } from '../ui/salestable.js';
import { imprimirOrden, descargarOrden, numOrden } from '../workorder.js';
import { esc, money, toCents, uuid, METODOS, CATS, calcItbms, fmtCant } from '../util.js';

let root, cat = 'color', servId = null, tamId = null, cant = 1, ticket = [], metodo = null, clientId = null, operador = null, paying = false;
let paints = {}, recientes = [], pendingId = null;
try { operador = localStorage.getItem('cc_operador') || null; } catch { /* sin almacenamiento */ }

const servicios = () => S.settings.catalogo.filter(s => s.cat === cat);
const serv = () => S.settings.catalogo.find(s => s.id === servId) || null;
const tam = () => serv()?.tams.find(t => t.id === tamId) || null;
const UNIT_LABEL = { 'pág': 'Cantidad de páginas', 'hoja': 'Cantidad de hojas', 'pie lineal': 'Pies lineales', 'juego': 'Cantidad de juegos', 'unidad': 'Cantidad' };

function tramo(t, pags) {
  if (!t?.tramos) return null;
  let desde = 1;
  for (const tr of t.tramos) { if (pags <= tr.hasta) return { ...tr, desde }; desde = tr.hasta + 1; }
  return null;
}
function precioActual() {
  const s = serv(), t = tam(); if (!s || !t) return 0;
  if (t.tramos) { const tr = tramo(t, Number($('#encPags', root).value)); return tr ? tr.precio : 0; }
  return t.precio || toCents($('#libPrecio', root).value) || 0;
}
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
  };
}
const lineaOk = () => { const l = linea(); return !!l && l.cant > 0 && l.precio_cents > 0; };
const items = () => ticket.length ? ticket : (lineaOk() ? [linea()] : []);
const bruto = () => items().reduce((a, b) => a + b.sub_cents, 0);

export function mount(el) {
  root = el;
  root.innerHTML = `
  <div class="lay-caja">
    <div class="c-main">
      <div class="card">
        <div class="seg scroll" data-cat>${Object.entries(CATS).map(([k, l]) => `<button data-c="${k}">${l}</button>`).join('')}</div>
        <div class="grid2 sel2" style="margin-top:14px">
          <div class="field"><label>Producto o servicio</label><button type="button" data-serv></button></div>
          <div class="field"><label>Tamaño</label><button type="button" data-tam></button></div>
        </div>
        <div class="grid2 hide" data-libre style="margin-top:10px">
          <div class="field"><label for="libNombre">Descripción</label><input class="input" id="libNombre" maxlength="80" placeholder="Ej. Sticker, laminado…"></div>
          <div class="field"><label for="libTam">Tamaño</label><input class="input" id="libTam" maxlength="40" placeholder="Ej. 8.5 x 11"></div>
          <label class="check"><input type="checkbox" id="libColor"> Es a color</label>
        </div>
        <div class="grid2" style="margin-top:10px">
          <div class="field hide" data-fprecio><label for="libPrecio">Precio por unidad</label><input class="input" id="libPrecio" type="number" inputmode="decimal" step="0.01" min="0" placeholder="0.00"></div>
          <div class="field hide" data-fpags><label for="encPags">Páginas del documento</label><input class="input" id="encPags" type="number" inputmode="numeric" min="1" placeholder="Ej. 80"></div>
        </div>
        <div class="label" style="margin-top:14px" data-qlabel>Cantidad</div>
        <div class="qty"><button data-q="-1" aria-label="Menos">−</button><input id="qInput" type="number" inputmode="decimal" min="0" value="1"><button data-q="1" aria-label="Más">+</button></div>
        <div class="quick"><button data-a="5">+5</button><button data-a="10">+10</button><button data-a="25">+25</button><button data-a="50">+50</button><button data-a="0">1</button></div>
        <div class="field" style="margin-top:12px"><label for="lnExtra">Detalle de la línea (opcional)</label><input class="input" id="lnExtra" maxlength="80" placeholder="Ej. doble cara, a full color…"></div>
        <div class="lineprev"><span data-ldesc></span><b data-lsub></b></div>
        <button class="btn ghost block" data-add>+ Agregar otra línea a la orden</button>
      </div>
    </div>
    <div class="c-side">
      <div class="card c-ticket">
        <div class="row between"><div class="label" style="margin:0">Orden</div><button class="btn ghost sm hide" data-clear>Vaciar</button></div>
        <div data-lines style="margin-top:6px"></div>
        <div class="ticket-sub" data-tsub></div>
        <div class="ticket-total"><span class="label" style="margin:0">Total</span><span class="big" data-total>$0.00</span></div>
      </div>
      <div class="card c-pago">
        <div class="field"><label>Cliente / empresa</label><button type="button" data-cli></button></div>
        <div class="grid3" style="margin-top:10px">
          <div class="field"><label for="ctTel">Celular</label><input class="input" id="ctTel" type="tel" maxlength="30"></div>
          <div class="field"><label for="ctDm">DM</label><input class="input" id="ctDm" maxlength="60" placeholder="@usuario"></div>
          <div class="field"><label for="ctEmail">Correo</label><input class="input" id="ctEmail" type="email" maxlength="120"></div>
        </div>
        <div class="grid2" style="margin-top:10px">
          <div class="field"><label>Operador</label><button type="button" data-op></button></div>
          <div class="field"><label>Método de pago</label><button type="button" data-met></button></div>
        </div>
        <div class="field" style="margin-top:10px"><label for="oNota">Nota de la orden</label><input class="input" id="oNota" maxlength="300" placeholder="Ej. entregar mañana 10 a. m."></div>
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
    <div class="card c-rec">
      <div class="label">Últimas órdenes de hoy</div>
      <div data-recent></div>
    </div>
  </div>`;

  root.querySelector('[data-cat]').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; setCat(b.dataset.c); });
  paints.serv = listPicker(root.querySelector('[data-serv]'), {
    items: () => servicios().map(s => ({ id: s.id, label: s.nombre })), getValue: () => servId, placeholder: 'Selecciona',
    onChange: v => { servId = v; tamId = serv()?.tams[0]?.id || null; paints.tam(); paint(); },
  });
  paints.tam = listPicker(root.querySelector('[data-tam]'), {
    items: () => (serv()?.tams || []).map(t => ({ id: t.id, label: t.nombre, sub: t.tramos ? `desde ${money(t.tramos[0].precio)}` : t.precio ? `${money(t.precio)}${serv().unidad === 'pie lineal' ? ' / pie' : ''}` : 'precio libre' })),
    getValue: () => tamId, placeholder: 'Selecciona', onChange: v => { tamId = v; paint(); },
  });
  ['libNombre', 'libTam', 'libPrecio', 'encPags', 'lnExtra', 'recibe'].forEach(id => $('#' + id, root).addEventListener('input', paint));
  $('#libColor', root).addEventListener('change', paint);
  const q = $('#qInput', root);
  q.addEventListener('input', () => { cant = normCant(Number(q.value) || 0); paint(); });
  q.addEventListener('blur', () => { if (cant <= 0) cant = 1; paint(); });
  q.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } });
  root.querySelectorAll('[data-q]').forEach(b => b.onclick = () => setCant(cant + Number(b.dataset.q)));
  root.querySelector('.quick').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const a = Number(b.dataset.a); setCant(a === 0 ? 1 : cant + a); });
  root.querySelector('[data-add]').onclick = agregar;
  root.querySelector('[data-clear]').onclick = () => { ticket = []; paint(); };
  root.querySelector('[data-lines]').addEventListener('click', e => { const b = e.target.closest('.x'); if (!b) return; ticket.splice(Number(b.dataset.i), 1); paint(); });
  paints.met = metodoPicker(root.querySelector('[data-met]'), () => metodo, v => { metodo = v; paint(); if (v === 'efectivo') setTimeout(() => $('#recibe', root).focus(), 30); });
  paints.cli = clientePicker(root.querySelector('[data-cli]'), () => clientId, v => { clientId = v; llenarContacto(); });
  paints.op = operadorPicker(root.querySelector('[data-op]'), () => operador, v => { operador = v; try { localStorage.setItem('cc_operador', v); } catch { /* */ } });
  $('#recibe', root).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); guardar(true); } });
  root.querySelector('[data-pay]').onclick = () => guardar(true);
  root.querySelector('[data-pend]').onclick = () => guardar(false);
  bindOrden(root.querySelector('[data-recent]'), id => recientes.find(v => v.id === id));
  on(what => {
    if (what === 'remote') {
      if (clientId && !S.clients.some(c => c.id === clientId)) clientId = null;
      if (servId && !serv()) servId = null;
      paints.cli(); paints.op(); paints.serv(); paints.tam(); paint(); loadRecientes();
    }
  });
  setCat('color');
}

export function show() { paints.serv(); paints.tam(); paints.cli(); paints.op(); paint(); loadRecientes(); }

const normCant = n => serv()?.unidad === 'pie lineal' ? Math.max(0, Math.round(n * 100) / 100) : Math.max(0, Math.min(100000, Math.round(n)));
function setCant(n) { cant = Math.max(serv()?.unidad === 'pie lineal' ? 0.5 : 1, normCant(n)); paint(); }

function setCat(c) {
  cat = c;
  const s = servicios()[0];
  servId = s?.id || null; tamId = s?.tams[0]?.id || null;
  paints.serv(); paints.tam(); paint();
}

function llenarContacto() {
  const c = S.clients.find(x => x.id === clientId);
  $('#ctTel', root).value = c?.phone || '';
  $('#ctDm', root).value = c?.dm || '';
  $('#ctEmail', root).value = c?.email || '';
}

function agregar() {
  const l = linea();
  if (!l) return toast('Selecciona el producto y el tamaño', true);
  if (tam()?.tramos && !tramo(tam(), l.paginas)) return toast('Escribe las páginas del documento (máximo ' + tam().tramos.at(-1).hasta + ')', true);
  if (!(l.precio_cents > 0)) return toast('Escribe el precio', true);
  if (!(l.cant > 0)) return toast('Cantidad inválida', true);
  ticket.push(l); cant = 1; $('#lnExtra', root).value = '';
  paint(); toast('Línea agregada');
}

function paint() {
  const s = serv(), t = tam();
  root.querySelectorAll('[data-cat] button').forEach(b => b.classList.toggle('sel', b.dataset.c === cat));
  root.querySelector('[data-libre]').classList.toggle('hide', !s?.libre);
  root.querySelector('[data-fprecio]').classList.toggle('hide', !t || !!t.tramos || !!t.precio);
  root.querySelector('[data-fpags]').classList.toggle('hide', !t?.tramos);
  root.querySelector('[data-qlabel]').textContent = UNIT_LABEL[s?.unidad] || 'Cantidad';
  const q = $('#qInput', root); if (document.activeElement !== q) q.value = cant;
  q.step = s?.unidad === 'pie lineal' ? '0.5' : '1';
  const l = linea();
  root.querySelector('[data-ldesc]').textContent = l ? `${l.nombre} · ${l.tamLabel} × ${fmtCant(cant, l.unidad)}${l.extra ? ' · ' + l.extra : ''}` : '—';
  root.querySelector('[data-lsub]').textContent = lineaOk() ? money(l.sub_cents) : '—';
  root.querySelector('[data-add]').disabled = !lineaOk();
  root.querySelector('[data-lines]').innerHTML = ticket.map((it, i) => `<div class="tline"><span class="q">${esc(fmtCant(it.cant, it.unidad))}×</span>
    <span class="d">${esc(it.nombre)} · ${esc(it.tamLabel)}<small>${money(it.precio_cents)} c/u${it.extra ? ' · ' + esc(it.extra) : ''}</small></span>
    <b class="num">${money(it.sub_cents)}</b><button class="x" data-i="${i}" aria-label="Quitar">×</button></div>`).join('');
  root.querySelector('[data-clear]').classList.toggle('hide', !ticket.length);
  const cx = calcItbms(bruto(), S.settings.itbms), tot = cx.total;
  root.querySelector('[data-total]').textContent = money(tot);
  root.querySelector('[data-tsub]').innerHTML = S.settings.itbms.modo === 'no' || tot <= 0 ? ''
    : `<div><span>Subtotal</span><span class="num">${money(cx.sub)}</span></div><div><span>ITBMS ${S.settings.itbms.tasa}%</span><span class="num">${money(cx.itbms)}</span></div>`;
  root.querySelector('[data-cash]').classList.toggle('hide', metodo !== 'efectivo');
  const rec = toCents($('#recibe', root).value);
  root.querySelector('[data-cambio]').value = rec > 0 ? (rec >= tot ? money(rec - tot) : 'Falta ' + money(tot - rec)) : '—';
  const pay = root.querySelector('[data-pay]');
  pay.textContent = paying ? 'Guardando…' : `Cobrar ${money(tot)}${metodo ? ' · ' + METODOS[metodo] : ''}`;
  pay.disabled = paying || tot <= 0;
  root.querySelector('[data-pend]').disabled = paying || tot <= 0;
}

async function guardar(cobrar) {
  const its = items();
  if (!its.length) return toast('Agrega al menos una línea', true);
  if (cobrar && !metodo) { toast('Selecciona el método de pago', true); root.querySelector('[data-met]').click(); return; }
  if (!operador) { toast('Selecciona el operador', true); root.querySelector('[data-op]').click(); return; }
  if (paying) return;
  paying = true; paint();
  pendingId = pendingId || uuid();
  try {
    const body = {
      id: pendingId, metodo: cobrar ? metodo : null, client_id: clientId, operador,
      contacto_tel: $('#ctTel', root).value, contacto_dm: $('#ctDm', root).value, contacto_email: $('#ctEmail', root).value, nota: $('#oNota', root).value,
      items: its.map(it => ({ serv: it.serv, tam: it.tam, cant: it.cant, precio_cents: it.precio_cents, paginas: it.paginas, nombre: it.nombre, tamano: it.tamano, color: it.color, extra: it.extraUser })),
    };
    const r = await api('/api/sales', { method: 'POST', body });
    const v = r.sale;
    choice({
      title: `${cobrar ? 'Orden cobrada' : 'Orden pendiente'} · N° ${numOrden(v.numero)}`,
      html: `<p class="sub-note" style="margin:-6px 0 4px">${esc(v.client_name || 'Contado')} · ${money(v.total_cents)}${cobrar ? ' · ' + METODOS[v.metodo] : ' · por cobrar'}</p>`,
      buttons: [
        { label: `${ICON.print}Imprimir orden`, cls: 'line', keep: true, onClick: () => imprimirOrden(v) },
        { label: `${ICON.down}Descargar PDF`, cls: 'line', keep: true, onClick: () => descargarOrden(v) },
        { label: 'Listo', value: true },
      ],
    });
    pendingId = null; ticket = []; cant = 1; metodo = null; clientId = null;
    ['recibe', 'ctTel', 'ctDm', 'ctEmail', 'oNota', 'libNombre', 'libTam', 'libPrecio', 'encPags', 'lnExtra'].forEach(id => { $('#' + id, root).value = ''; });
    paints.met(); paints.cli();
    emit('sale'); syncNow(); loadRecientes();
  } catch (e) {
    toast(e.message, true);
    if (e.status && e.status < 500) pendingId = null;
  }
  paying = false; paint();
}

async function loadRecientes() {
  const t = today();
  try { recientes = (await api(`/api/sales?from=${t}&to=${t}`)).sales.slice(-10).reverse(); } catch { recientes = []; }
  root.querySelector('[data-recent]').innerHTML = salesTable(recientes, { anular: false, empty: 'Sin órdenes hoy' });
}
