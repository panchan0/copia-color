import { api } from '../api.js';
import { S, today, on, emit, syncNow } from '../store.js';
import { $, toast, choice, ICON } from '../ui/dom.js';
import { salesTable, bindOrden } from '../ui/salestable.js';
import { imprimirOrden, descargarOrden, numOrden } from '../workorder.js';
import { metodoPicker, clientePicker } from '../ui/pickers.js';
import { esc, money, int, toCents, uuid, TAMS, METODOS, itemLabel, calcItbms } from '../util.js';

let root, tipo = 'imp', tam = 'carta', cant = 1, ticket = [], metodo = null, clientId = null, paying = false;
let paintMetodo, paintCliente, recientes = [], pendingId = null;

const precio = () => tam === 'otro' ? toCents($('#otroPrecio', root).value) : S.settings.precios[tipo][tam];
const nombre = () => tam === 'otro' ? ($('#otroNombre', root).value.trim() || 'Otro') : TAMS[tam];
const linea = () => { const p = precio(); return { tipo, tam, nombre: nombre(), cant, precio_cents: p, sub_cents: p * cant }; };
const lineaOk = () => cant > 0 && precio() > 0;
const items = () => ticket.length ? ticket : (lineaOk() ? [linea()] : []);
const bruto = () => items().reduce((a, b) => a + b.sub_cents, 0);
const total = () => calcItbms(bruto(), S.settings.itbms).total;

export function mount(el) {
  root = el;
  root.innerHTML = `
  <div class="lay-caja">
    <div class="c-main">
      <div class="card">
        <div class="seg" data-tipo><button data-t="imp">Impresión</button><button data-t="cop">Copia</button></div>
        <div class="label" style="margin-top:16px">Tamaño</div>
        <div class="chips" data-tams></div>
        <div class="grid2 hide" data-otro style="margin-top:10px">
          <div class="field"><label for="otroNombre">Tamaño</label><input class="input" id="otroNombre" placeholder="Ej. Tabloide" maxlength="40"></div>
          <div class="field"><label for="otroPrecio">Precio c/u</label><input class="input" id="otroPrecio" type="number" inputmode="decimal" step="0.01" min="0" placeholder="0.00"></div>
        </div>
        <div class="label" style="margin-top:16px">Cantidad</div>
        <div class="qty"><button data-q="-1" aria-label="Menos">−</button><input id="qInput" type="number" inputmode="numeric" min="1" value="1"><button data-q="+1" aria-label="Más">+</button></div>
        <div class="quick"><button data-a="5">+5</button><button data-a="10">+10</button><button data-a="25">+25</button><button data-a="50">+50</button><button data-a="0">1</button></div>
        <div class="lineprev"><span data-ldesc></span><b data-lsub></b></div>
        <button class="btn ghost block" data-add>+ Agregar otra línea</button>
      </div>
    </div>
    <div class="c-side">
      <div class="card c-ticket">
        <div class="row between"><div class="label" style="margin:0">Ticket</div><button class="btn ghost sm hide" data-clear>Vaciar</button></div>
        <div data-lines style="margin-top:6px"></div>
        <div class="ticket-sub" data-tsub></div>
        <div class="ticket-total"><span class="label" style="margin:0">Total</span><span class="big" data-total>$0.00</span></div>
      </div>
      <div class="card c-pago">
        <div class="field"><label>Cliente / empresa</label><button type="button" data-cli></button></div>
        <div class="field" style="margin-top:12px"><label>Método de pago</label><button type="button" data-met></button></div>
        <div class="grid2 hide" data-cash style="margin-top:12px">
          <div class="field"><label for="recibe">Recibe</label><input class="input" id="recibe" type="number" inputmode="decimal" step="0.01" placeholder="0.00"></div>
          <div class="field"><label>Cambio</label><input class="input num" data-cambio readonly value="—" tabindex="-1"></div>
        </div>
        <button class="btn block pay" data-pay>Cobrar</button>
      </div>
    </div>
    <div class="card c-rec">
      <div class="label">Últimas ventas de hoy</div>
      <div data-recent></div>
    </div>
  </div>`;

  root.querySelector('[data-tipo]').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; tipo = b.dataset.t; paint(); });
  root.querySelector('[data-tams]').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; tam = b.dataset.k; paint(); if (tam === 'otro') $('#otroNombre', root).focus(); });
  ['otroNombre', 'otroPrecio', 'recibe'].forEach(id => $('#' + id, root).addEventListener('input', paint));
  const q = $('#qInput', root);
  q.addEventListener('input', () => { cant = Math.max(0, Math.min(100000, Math.round(Number(q.value) || 0))); paint(); });
  q.addEventListener('blur', () => { if (cant < 1) cant = 1; paint(); });
  q.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } });
  root.querySelectorAll('[data-q]').forEach(b => b.onclick = () => setCant(cant + Number(b.dataset.q)));
  root.querySelector('.quick').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const a = Number(b.dataset.a); setCant(a === 0 ? 1 : cant + a); });
  root.querySelector('[data-add]').onclick = agregar;
  root.querySelector('[data-clear]').onclick = () => { ticket = []; paint(); };
  root.querySelector('[data-lines]').addEventListener('click', e => { const b = e.target.closest('.x'); if (!b) return; ticket.splice(Number(b.dataset.i), 1); paint(); });
  paintMetodo = metodoPicker(root.querySelector('[data-met]'), () => metodo, v => { metodo = v; paint(); if (v === 'efectivo') setTimeout(() => $('#recibe', root).focus(), 30); });
  paintCliente = clientePicker(root.querySelector('[data-cli]'), () => clientId, v => { clientId = v; });
  $('#recibe', root).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); cobrar(); } });
  root.querySelector('[data-pay]').onclick = cobrar;
  bindOrden(root.querySelector('[data-recent]'), id => recientes.find(v => v.id === id));
  on(what => { if (what === 'remote') { if (clientId && !S.clients.some(c => c.id === clientId)) clientId = null; paintCliente(); paint(); loadRecientes(); } });
}

export function show() { paint(); paintCliente(); loadRecientes(); }

function setCant(n) { cant = Math.max(1, Math.min(100000, Math.round(n))); paint(); }

function agregar() {
  if (!lineaOk()) return toast(tam === 'otro' ? 'Escribe el precio del tamaño' : 'Cantidad inválida', true);
  ticket.push(linea()); cant = 1; paint(); toast('Línea agregada');
}

function paint() {
  const pr = S.settings.precios;
  root.querySelectorAll('[data-tipo] button').forEach(b => b.classList.toggle('sel', b.dataset.t === tipo));
  root.querySelector('[data-tams]').innerHTML = ['carta', 'legal', 'otro'].map(k =>
    `<button class="chip${k === tam ? ' sel' : ''}" data-k="${k}">${TAMS[k]}<span>${k === 'otro' ? 'precio libre' : money(pr[tipo][k])}</span></button>`).join('');
  root.querySelector('[data-otro]').classList.toggle('hide', tam !== 'otro');
  const q = $('#qInput', root); if (document.activeElement !== q) q.value = cant;
  const l = linea();
  root.querySelector('[data-ldesc]').textContent = `${itemLabel(l)} × ${int(cant)}`;
  root.querySelector('[data-lsub]').textContent = lineaOk() ? money(l.sub_cents) : '—';
  root.querySelector('[data-add]').disabled = !lineaOk();
  root.querySelector('[data-lines]').innerHTML = ticket.length
    ? ticket.map((it, i) => `<div class="tline"><span class="q">${int(it.cant)}×</span><span class="d">${esc(itemLabel(it))}<small>${money(it.precio_cents)} c/u</small></span><b class="num">${money(it.sub_cents)}</b><button class="x" data-i="${i}" aria-label="Quitar">×</button></div>`).join('')
    : '';
  root.querySelector('[data-clear]').classList.toggle('hide', !ticket.length);
  const cx = calcItbms(bruto(), S.settings.itbms), t = cx.total;
  root.querySelector('[data-total]').textContent = money(t);
  root.querySelector('[data-tsub]').innerHTML = S.settings.itbms.modo === 'no' || t <= 0 ? ''
    : `<div><span>Subtotal</span><span class="num">${money(cx.sub)}</span></div><div><span>ITBMS ${S.settings.itbms.tasa}%</span><span class="num">${money(cx.itbms)}</span></div>`;
  root.querySelector('[data-cash]').classList.toggle('hide', metodo !== 'efectivo');
  const rec = toCents($('#recibe', root).value);
  root.querySelector('[data-cambio]').value = rec > 0 ? (rec >= t ? money(rec - t) : 'Falta ' + money(t - rec)) : '—';
  const pay = root.querySelector('[data-pay]');
  pay.textContent = paying ? 'Guardando…' : `Cobrar ${money(t)}${metodo ? ' · ' + METODOS[metodo] : ''}`;
  pay.disabled = paying || t <= 0;
}

async function cobrar() {
  const its = items();
  if (!its.length) return toast('Agrega al menos una línea', true);
  if (!metodo) { toast('Selecciona el método de pago', true); root.querySelector('[data-met]').click(); return; }
  if (paying) return;
  paying = true; paint();
  // El id se conserva si falla la red, así un reintento no duplica la venta
  pendingId = pendingId || uuid();
  try {
    const body = { id: pendingId, metodo, client_id: clientId, items: its.map(it => ({ tipo: it.tipo, tam: it.tam, nombre: it.nombre, cant: it.cant, precio_cents: it.precio_cents })) };
    const r = await api('/api/sales', { method: 'POST', body });
    const v = r.sale;
    choice({
      title: `Venta registrada · Orden N° ${numOrden(v.numero)}`,
      html: `<p class="sub-note" style="margin:-6px 0 4px">${esc(v.client_name || 'Contado')} · ${money(v.total_cents)} · ${METODOS[v.metodo]}</p>`,
      buttons: [
        { label: `${ICON.print}Imprimir orden`, cls: 'line', keep: true, onClick: () => imprimirOrden(v) },
        { label: `${ICON.down}Descargar PDF`, cls: 'line', keep: true, onClick: () => descargarOrden(v) },
        { label: 'Listo', value: true },
      ],
    });
    pendingId = null; ticket = []; cant = 1; metodo = null; clientId = null;
    $('#recibe', root).value = '';
    if (tam === 'otro') { $('#otroNombre', root).value = ''; $('#otroPrecio', root).value = ''; }
    paintMetodo(); paintCliente();
    emit('sale'); syncNow(); loadRecientes();
  } catch (e) {
    toast(e.message, true);
    if (e.status && e.status !== 0 && e.status < 500) pendingId = null;
  }
  paying = false; paint();
}

async function loadRecientes() {
  const t = today();
  try {
    const r = await api(`/api/sales?from=${t}&to=${t}`);
    recientes = r.sales.slice(-10).reverse();
  } catch { recientes = []; }
  root.querySelector('[data-recent]').innerHTML = salesTable(recientes, { anular: false, empty: 'Sin ventas hoy' });
}
