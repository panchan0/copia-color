import { api } from '../api.js';
import { S, today, on, syncNow, emit } from '../store.js';
import { $, toast, ICON } from '../ui/dom.js';
import { openCalendar } from '../ui/calendar.js';
import { exportMenu } from '../ui/pickers.js';
import { exportExcel, printReport } from '../export.js';
import { salesTable, bindOrden } from '../ui/salestable.js';
import { bindCobrar } from '../ui/cobrar.js';
import { esc, money, int, addDays, fechaLarga, cap, statsFromSales, analizarCierre, METODOS, toCents, centsToInput, dayFromSummary } from '../util.js';

let root, fecha = null, sales = [], cobrosPrev = [], closing = null, maq = {}, loading = false, reqId = 0, cierreDirty = false, anularPend = null;

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
  <div class="strip s7">
    <div class="kpi k-total">
      <div class="label" style="margin:0">Cobrado</div>
      <div class="big" data-total>$0.00</div>
      <div class="bar"><i data-bar style="width:0"></i></div>
      <div class="s" data-meta></div>
    </div>
    <div class="kpi"><div class="label" style="margin:0">Páginas a color</div><div class="v" data-kcol>0</div><div class="s" data-kcols></div></div>
    <div class="kpi"><div class="label" style="margin:0">Blanco y negro</div><div class="v" data-kbn>0</div><div class="s">páginas y hojas</div></div>
    <div class="kpi k-pend"><div class="label" style="margin:0">Por cobrar</div><div class="v" data-kpend>$0.00</div><div class="s" data-kpends></div></div>
    <div class="kpi m-efectivo"><div class="label" style="margin:0"><span class="dot"></span> Efectivo</div><div class="v" data-m-efectivo>$0.00</div><div class="s" data-n-efectivo></div></div>
    <div class="kpi m-tarjeta"><div class="label" style="margin:0"><span class="dot"></span> Tarjeta</div><div class="v" data-m-tarjeta>$0.00</div><div class="s" data-n-tarjeta></div></div>
    <div class="kpi m-yappy"><div class="label" style="margin:0"><span class="dot"></span> Yappy</div><div class="v" data-m-yappy>$0.00</div><div class="s" data-n-yappy></div></div>
  </div>
  <div class="card">
    <div class="row between wrap"><div class="label" style="margin:0" data-vtitle>Órdenes</div><div class="sub-note" style="margin:0" data-vtot></div></div>
    <div data-list style="margin-top:8px"></div>
    <div class="sub-note" data-prev-cob></div>
  </div>
  <div class="card cierre">
    <div class="label">Cierre del día</div>
    <div class="cgrid">
      <div class="field"><label for="cInicio">Contador color al abrir</label><input class="input" id="cInicio" type="number" inputmode="numeric" min="0"></div>
      <div class="field"><label for="cFin">Contador color al cerrar</label><input class="input" id="cFin" type="number" inputmode="numeric" min="0"></div>
      <div class="field"><label for="cEf">Efectivo en caja</label><input class="input" id="cEf" type="number" inputmode="decimal" step="0.01" min="0"></div>
      <div class="field c-nota"><label for="cNota">Nota</label><input class="input" id="cNota" maxlength="300"></div>
      <div class="field c-btn"><label>&nbsp;</label><button class="btn" data-save>Guardar cierre</button></div>
    </div>
    <div class="cres" data-res></div>
    <div class="ref" data-ref></div>
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
  exportMenu(root.querySelector('[data-exp]'), { onExcel: () => exportar('xls'), onPrint: () => exportar('print') });
  ['cInicio', 'cFin', 'cEf', 'cNota'].forEach(id => $('#' + id, root).addEventListener('input', () => { cierreDirty = true; paintCierre(); }));
  root.querySelector('[data-save]').onclick = guardarCierre;
  const list = root.querySelector('[data-list]');
  list.addEventListener('click', onAnular);
  bindOrden(list, id => sales.find(v => v.id === id));
  bindCobrar(list, () => load(true));
  on(what => { if (what === 'remote' || what === 'sale') load(true); });
  if (!fecha) fecha = today();
}

export function show() { paintHead(); load(); }

function paintHead() {
  const t = today();
  root.querySelector('.lbl').innerHTML = esc(cap(fechaLarga(fecha))) + (fecha === t ? ' <span class="pill">Hoy</span>' : '');
  root.querySelector('[data-next]').disabled = fecha >= t;
  root.querySelector('[data-hoy]').classList.toggle('hide', fecha === t);
}

async function load(silent = false) {
  const id = ++reqId, f = fecha;
  if (!silent) { loading = true; sales = []; cobrosPrev = []; closing = null; maq = {}; paint(); }
  try {
    const [s, p, c, sm] = await Promise.all([
      api(`/api/sales?from=${f}&to=${f}`), api(`/api/sales?from=${f}&to=${f}&by=pago`),
      api(`/api/closings/${f}`), api(`/api/summary?from=${f}&to=${f}`),
    ]);
    if (id !== reqId) return;
    sales = s.sales;
    const ids = new Set(sales.map(v => v.id));
    cobrosPrev = p.sales.filter(v => !ids.has(v.id));
    closing = c.closing; maq = sm.days[f]?.maq || {}; loading = false;
    if (!cierreDirty) fillCierre();
    paint();
  } catch (e) {
    if (id !== reqId) return;
    loading = false; paint();
    if (e.status !== 401) toast(e.message, true);
  }
}

const stats = () => { const s = statsFromSales([...sales, ...cobrosPrev], f => f === fecha); s.maq = maq; return s; };

function fillCierre() {
  const c = closing || {};
  $('#cInicio', root).value = c.inicio ?? '';
  $('#cFin', root).value = c.fin ?? '';
  $('#cEf', root).value = c.efectivo_cents != null ? centsToInput(c.efectivo_cents) : '';
  $('#cNota', root).value = c.nota || '';
}

function cierreForm() {
  const n = id => { const v = $('#' + id, root).value.trim(); return v === '' ? null : Math.max(0, Math.round(Number(v))); };
  const ef = $('#cEf', root).value.trim();
  return { inicio: n('cInicio'), fin: n('cFin'), fiery: closing?.fiery ?? null, efectivo_cents: ef === '' ? null : Math.max(0, toCents(ef)), nota: $('#cNota', root).value.trim() };
}

function paint() {
  const s = stats();
  const st = S.settings, metaDia = st.dias ? st.meta / st.dias : 0;
  root.querySelector('[data-total]').textContent = money(s.cobrado);
  const pct = metaDia ? s.cobrado / metaDia * 100 : 0;
  root.querySelector('[data-bar]').style.width = Math.min(100, pct) + '%';
  root.querySelector('[data-meta]').textContent = metaDia ? `${Math.round(pct)}% de la meta diaria (${money(metaDia)})` : '';
  root.querySelector('[data-kcol]').textContent = int(s.colorPags);
  const mc = Object.values(maq).reduce((a, x) => a + x.color, 0);
  root.querySelector('[data-kcols]').textContent = mc ? `Máquinas: ${int(mc)}` : 'cobradas';
  root.querySelector('[data-kbn]').textContent = int(s.bnPags);
  root.querySelector('[data-kpend]').textContent = money(s.pendT);
  root.querySelector('[data-kpends]').textContent = `${s.pendN} orden${s.pendN === 1 ? '' : 'es'} de este día`;
  for (const k of Object.keys(METODOS)) {
    root.querySelector(`[data-m-${k}]`).textContent = money(s.met[k].t);
    root.querySelector(`[data-n-${k}]`).textContent = `${s.met[k].n} cobro${s.met[k].n === 1 ? '' : 's'}`;
  }
  root.querySelector('[data-vtitle]').textContent = s.n ? `Órdenes · ${s.n}` : 'Órdenes';
  root.querySelector('[data-vtot]').textContent = s.n ? `Subtotal ${money(s.sub)} · ITBMS ${money(s.itbms)} · Total ${money(s.total)}` : '';
  root.querySelector('[data-list]').innerHTML = salesTable(sales.slice().reverse(), { pend: anularPend, loading, pago: true });
  const prevT = cobrosPrev.reduce((a, v) => a + v.total_cents, 0);
  root.querySelector('[data-prev-cob]').textContent = cobrosPrev.length ? `Incluye ${cobrosPrev.length} cobro${cobrosPrev.length === 1 ? '' : 's'} de órdenes de días anteriores: ${money(prevT)}` : '';
  paintCierre();
}

function paintCierre() {
  const s = stats();
  const c = cierreForm();
  const a = analizarCierre(c, s);
  const sg = n => (n > 0 ? '+' : '') + int(n);
  const cls = d => d === 0 ? 'ok' : d > 0 ? 'bad' : 'warn';
  let h = '';
  if (c.inicio != null && c.fin != null && c.fin < c.inicio) h += '<div class="diff warn">El contador al cerrar es menor que al abrir</div>';
  if (a.maq != null) h += `<div class="diff ${cls(a.dif)}">Contador ${int(a.maq)} págs a color · Cobradas ${int(s.colorPags)} · Dif. ${sg(a.dif)}</div>`;
  if (a.logColor != null) {
    const det = Object.entries(maq).map(([k, x]) => `${esc((S.settings.maquinas.find(m => m.id === k) || {}).nombre || k)} ${int(x.color)}`).join(' · ');
    h += `<div class="diff ${cls(a.difLog)}">Registros: ${det} · Cobradas ${int(s.colorPags)} · Dif. ${sg(a.difLog)}</div>`;
  }
  if (a.difEf != null) h += `<div class="diff ${a.difEf === 0 ? 'ok' : a.difEf < 0 ? 'bad' : 'warn'}">Caja ${money(c.efectivo_cents)} · Efectivo cobrado ${money(s.met.efectivo.t)} · Dif. ${a.difEf > 0 ? '+' : ''}${money(a.difEf)}</div>`;
  root.querySelector('[data-res]').innerHTML = h;
  root.querySelector('[data-ref]').textContent = `Efectivo cobrado: ${money(s.met.efectivo.t)}${a.logColor == null ? ' · Sin registros de máquinas para este día (sección Máquinas)' : ''}`;
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

async function onAnular(e) {
  const b = e.target.closest('.an'); if (!b) return;
  const id = b.dataset.id;
  if (anularPend !== id) { anularPend = id; paint(); setTimeout(() => { if (anularPend === id) { anularPend = null; paint(); } }, 4000); return; }
  anularPend = null;
  try { await api(`/api/sales/${id}/void`, { method: 'POST', body: {} }); toast('Orden anulada'); emit('sale'); syncNow(); load(true); }
  catch (err) { toast(err.message, true); }
}

function exportar(kind) {
  if (loading) return toast('Espera a que carguen los datos');
  const s = stats();
  const payload = {
    titulo: 'Informe del día', periodo: cap(fechaLarga(fecha)), from: fecha, to: fecha, multiDay: false,
    sales, cobrosPrev, stats: s, closings: closing ? { [fecha]: closing } : {}, days: {},
    meta: S.settings.dias ? S.settings.meta / S.settings.dias : 0, archivo: `Informe_${fecha}`,
  };
  if (kind === 'xls') exportExcel(payload); else printReport(payload);
}
export { dayFromSummary };
