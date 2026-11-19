import { api } from '../api.js';
import { S, today, on, syncNow } from '../store.js';
import { $, toast, ICON } from '../ui/dom.js';
import { openCalendar } from '../ui/calendar.js';
import { exportMenu } from '../ui/pickers.js';
import { exportExcel, printReport } from '../export.js';
import { esc, money, int, addDays, fechaLarga, cap, statsFromSales, pagTipo, analizarCierre, METODOS, itemLabelLower, toCents, centsToInput } from '../util.js';

let root, fecha = null, sales = [], closing = null, loading = false, reqId = 0, cierreDirty = false, anularPend = null;

export function setFecha(f) {
  const t = today();
  fecha = f > t ? t : f;
  cierreDirty = false; anularPend = null;
  if (root) { paintHead(); load(); }
}
export const getFecha = () => fecha;

export function mount(el) {
  root = el;
  root.innerHTML = `
  <div class="toolbar">
    <button class="iconbtn" data-prev aria-label="Día anterior">${ICON.left}</button>
    <button class="datebtn" data-cal>${ICON.cal}<span class="lbl"></span></button>
    <button class="iconbtn" data-next aria-label="Día siguiente">${ICON.right}</button>
    <button class="btn ghost sm" data-hoy>Hoy</button>
    <div class="spacer"></div>
    <button class="btn line" data-exp>${ICON.down}Descargar / Imprimir</button>
  </div>
  <div class="lay-dia">
    <div class="d-res">
      <div class="card">
        <div class="label">Vendido</div>
        <div class="big" data-total>$0.00</div>
        <div class="bar"><i data-bar style="width:0"></i></div>
        <div class="sub-note" data-meta></div>
      </div>
      <div class="kpis">
        <div class="kpi"><div class="label" style="margin:0">Impresiones</div><div class="v" data-kimp>0</div><div class="s" data-kimps></div></div>
        <div class="kpi"><div class="label" style="margin:0">Copias</div><div class="v" data-kcop>0</div><div class="s" data-kcops></div></div>
      </div>
      <div class="card"><div class="label">Por método de pago</div><div data-met></div></div>
    </div>
    <div class="card d-ven">
      <div class="label" data-vtitle>Ventas</div>
      <div class="sales">
        <div class="shead"><span>Hora</span><span>Cliente</span><span>Detalle</span><span>Pago</span><span style="text-align:right">Total</span><span></span></div>
        <div data-list></div>
      </div>
    </div>
    <div class="card d-cie">
      <div class="label">Cierre del día</div>
      <div class="grid2">
        <div class="field"><label for="cInicio">Contador color al abrir</label><input class="input" id="cInicio" type="number" inputmode="numeric" min="0"></div>
        <div class="field"><label for="cFin">Contador color al cerrar</label><input class="input" id="cFin" type="number" inputmode="numeric" min="0"></div>
        <div class="field"><label for="cFiery">Páginas color Fiery</label><input class="input" id="cFiery" type="number" inputmode="numeric" min="0"></div>
        <div class="field"><label for="cEf">Efectivo en caja</label><input class="input" id="cEf" type="number" inputmode="decimal" step="0.01" min="0"></div>
      </div>
      <div class="field" style="margin-top:10px"><label for="cNota">Nota</label><input class="input" id="cNota" maxlength="300"></div>
      <div data-res></div>
      <div class="ref" data-ref></div>
      <button class="btn block" style="margin-top:14px" data-save>Guardar cierre</button>
    </div>
  </div>`;

  root.querySelector('[data-prev]').onclick = () => setFecha(addDays(fecha, -1));
  root.querySelector('[data-next]').onclick = () => setFecha(addDays(fecha, 1));
  root.querySelector('[data-hoy]').onclick = () => setFecha(today());
  root.querySelector('[data-cal]').onclick = e => openCalendar(e.currentTarget, {
    value: fecha, max: today(), onPick: setFecha,
    marks: async (a, b) => {
      const r = await api(`/api/summary?from=${a}&to=${b}`);
      return new Set(Object.keys(r.days).filter(k => r.days[k].n > 0));
    },
  });
  exportMenu(root.querySelector('[data-exp]'), {
    onExcel: () => exportar('xls'),
    onPrint: () => exportar('print'),
  });
  ['cInicio', 'cFin', 'cFiery', 'cEf', 'cNota'].forEach(id => $('#' + id, root).addEventListener('input', () => { cierreDirty = true; paintCierre(); }));
  root.querySelector('[data-save]').onclick = guardarCierre;
  root.querySelector('[data-list]').addEventListener('click', onListClick);

  on(what => { if (what === 'remote' || what === 'sale') load(true); });
  if (!fecha) fecha = today();
}

export function show() { if (fecha !== today() && !sales.length && !closing) {} paintHead(); load(); }

function paintHead() {
  const t = today();
  root.querySelector('.lbl').innerHTML = esc(cap(fechaLarga(fecha))) + (fecha === t ? ' <span class="pill">Hoy</span>' : '');
  root.querySelector('[data-next]').disabled = fecha >= t;
  root.querySelector('[data-hoy]').classList.toggle('hide', fecha === t);
}

async function load(silent = false) {
  const id = ++reqId, f = fecha;
  if (!silent) { loading = true; sales = []; closing = null; paint(); }
  try {
    const [s, c] = await Promise.all([api(`/api/sales?from=${f}&to=${f}`), api(`/api/closings/${f}`)]);
    if (id !== reqId) return;
    sales = s.sales; closing = c.closing; loading = false;
    if (!cierreDirty) fillCierre();
    paint();
  } catch (e) {
    if (id !== reqId) return;
    loading = false; paint();
    if (e.status !== 401) toast(e.message, true);
  }
}

function fillCierre() {
  const c = closing || {};
  $('#cInicio', root).value = c.inicio ?? '';
  $('#cFin', root).value = c.fin ?? '';
  $('#cFiery', root).value = c.fiery ?? '';
  $('#cEf', root).value = c.efectivo_cents != null ? centsToInput(c.efectivo_cents) : '';
  $('#cNota', root).value = c.nota || '';
}

function cierreForm() {
  const n = id => { const v = $('#' + id, root).value.trim(); return v === '' ? null : Math.max(0, Math.round(Number(v))); };
  const ef = $('#cEf', root).value.trim();
  return { inicio: n('cInicio'), fin: n('cFin'), fiery: n('cFiery'), efectivo_cents: ef === '' ? null : Math.max(0, toCents(ef)), nota: $('#cNota', root).value.trim() };
}

function paint() {
  const s = statsFromSales(sales);
  const st = S.settings, metaDia = st.dias ? st.meta / st.dias : 0;
  root.querySelector('[data-total]').textContent = money(s.total);
  const pct = metaDia ? s.total / metaDia * 100 : 0;
  root.querySelector('[data-bar]').style.width = Math.min(100, pct) + '%';
  root.querySelector('[data-meta]').textContent = metaDia ? `${Math.round(pct)}% de la meta diaria (${money(metaDia)})` : '';
  root.querySelector('[data-kimp]').textContent = int(pagTipo(s, 'imp'));
  root.querySelector('[data-kimps]').textContent = `Carta ${int(s.pag.imp.carta)} · Legal ${int(s.pag.imp.legal)}${s.pag.imp.otro ? ' · Otro ' + int(s.pag.imp.otro) : ''}`;
  root.querySelector('[data-kcop]').textContent = int(pagTipo(s, 'cop'));
  root.querySelector('[data-kcops]').textContent = `Carta ${int(s.pag.cop.carta)} · Legal ${int(s.pag.cop.legal)}${s.pag.cop.otro ? ' · Otro ' + int(s.pag.cop.otro) : ''}`;
  root.querySelector('[data-met]').innerHTML = Object.entries(METODOS).map(([k, l]) =>
    `<div class="mrow m-${k}"><span class="dot"></span><span>${l}</span><span class="n">${s.met[k].n}</span><span class="a">${money(s.met[k].t)}</span></div>`).join('');
  root.querySelector('[data-vtitle]').textContent = s.n ? `Ventas · ${s.n}` : 'Ventas';
  const list = root.querySelector('[data-list]');
  if (loading) list.innerHTML = '<div class="empty">Cargando…</div>';
  else if (!sales.length) list.innerHTML = '<div class="empty">Sin ventas</div>';
  else list.innerHTML = sales.slice().reverse().map(v => {
    const det = v.items.map(it => `${int(it.cant)} ${itemLabelLower(it)}`).join(', ');
    const an = !v.anulada ? `<button class="an" data-id="${esc(v.id)}">${anularPend === v.id ? '¿Anular?' : 'Anular'}</button>` : '<small>Anulada</small>';
    return `<div class="srow${v.anulada ? ' void' : ''}">
      <span class="h">${esc(v.hora)}</span>
      <span class="c-cl cl">${v.client_name ? esc(v.client_name) : '<span style="color:var(--muted);font-weight:500">—</span>'}</span>
      <span class="det">${v.client_name ? `<span class="det-m cl">${esc(v.client_name)} · </span>` : ''}${esc(det)}<span class="det-m"><br><span class="tag m-${v.metodo}">${METODOS[v.metodo]}</span></span></span>
      <span class="c-pay"><span class="tag m-${v.metodo}">${METODOS[v.metodo]}</span></span>
      <span class="amt">${money(v.total_cents)}<span class="det-m"><br>${an}</span></span>
      <span class="c-act" style="text-align:right">${an}</span>
    </div>`;
  }).join('');
  paintCierre();
}

function paintCierre() {
  const s = statsFromSales(sales);
  const c = cierreForm();
  const a = analizarCierre(c, s);
  const sg = n => (n > 0 ? '+' : '') + int(n);
  let h = '';
  if (c.inicio != null && c.fin != null && c.fin < c.inicio) h += '<div class="diff warn">El contador al cerrar es menor que al abrir</div>';
  if (a.maq != null) h += `<div class="diff ${a.dif === 0 ? 'ok' : a.dif > 0 ? 'bad' : 'warn'}">Máquina ${int(a.maq)} · Cobradas ${int(pagTipo(s, 'imp') + pagTipo(s, 'cop'))} · Dif. ${sg(a.dif)}</div>`;
  if (a.difFiery != null) h += `<div class="diff ${a.difFiery === 0 ? 'ok' : a.difFiery > 0 ? 'bad' : 'warn'}">Fiery ${int(c.fiery)} · Impresiones cobradas ${int(pagTipo(s, 'imp'))} · Dif. ${sg(a.difFiery)}</div>`;
  if (a.difEf != null) h += `<div class="diff ${a.difEf === 0 ? 'ok' : a.difEf < 0 ? 'bad' : 'warn'}">Caja ${money(c.efectivo_cents)} · Efectivo registrado ${money(s.met.efectivo.t)} · Dif. ${a.difEf > 0 ? '+' : ''}${money(a.difEf)}</div>`;
  root.querySelector('[data-res]').innerHTML = h;
  root.querySelector('[data-ref]').textContent = `Efectivo registrado: ${money(s.met.efectivo.t)}`;
}

async function guardarCierre() {
  const btn = root.querySelector('[data-save]');
  const c = cierreForm();
  if (c.inicio != null && c.fin != null && c.fin < c.inicio) return toast('El contador al cerrar es menor que al abrir', true);
  btn.disabled = true;
  try {
    const r = await api(`/api/closings/${fecha}`, { method: 'PUT', body: c });
    closing = r.closing; cierreDirty = false; toast('Cierre guardado'); syncNow();
  } catch (e) { toast(e.message, true); }
  btn.disabled = false;
}

async function onListClick(e) {
  const b = e.target.closest('.an'); if (!b) return;
  const id = b.dataset.id;
  if (anularPend !== id) { anularPend = id; paint(); setTimeout(() => { if (anularPend === id) { anularPend = null; paint(); } }, 4000); return; }
  anularPend = null;
  try { await api(`/api/sales/${id}/void`, { method: 'POST', body: {} }); toast('Venta anulada'); syncNow(); load(true); }
  catch (err) { toast(err.message, true); }
}

function exportar(kind) {
  if (loading) return toast('Espera a que carguen los datos');
  const s = statsFromSales(sales);
  const payload = {
    titulo: 'Ventas del día', periodo: cap(fechaLarga(fecha)), from: fecha, to: fecha, multiDay: false,
    sales, stats: s, closings: closing ? { [fecha]: closing } : {}, days: { [fecha]: s },
    meta: S.settings.dias ? S.settings.meta / S.settings.dias : 0, archivo: `Ventas_${fecha}`,
  };
  if (kind === 'xls') exportExcel(payload); else printReport(payload);
}
