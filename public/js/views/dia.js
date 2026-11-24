import { api } from '../api.js';
import { S, today, on, syncNow, emit } from '../store.js';
import { deslizar } from '../ui/motion.js';
import { toast, ICON } from '../ui/dom.js';
import { openCalendar } from '../ui/calendar.js';
import { exportMenu } from '../ui/pickers.js';
import { exportExcel, printReport } from '../export.js';
import { salesTable, bindAbrir } from '../ui/salestable.js';
import { esc, money, int, addDays, fechaLarga, cap, statsFromSales, METODOS, dayFromSummary } from '../util.js';

let root, fecha = null, sales = [], cobrosPrev = [], maq = {}, loading = false, reqId = 0, anularPend = null;

export function setFecha(f) {
  const t = today();
  fecha = f > t ? t : f;
  anularPend = null;
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
    <button class="btn line expb" data-exp aria-label="Descargar o imprimir">${ICON.down}<span>Descargar / Imprimir</span></button>
  </div>
  <div class="strip s7">
    <div class="kpi k-total">
      <div class="label" style="margin:0">Cobrado</div>
      <div class="big" data-total>$0.00</div>
      <div class="bar"><i data-bar style="width:0"></i></div>
      <div class="s" data-meta></div>
    </div>
    <div class="kpi"><div class="label" style="margin:0">Páginas a color</div><div class="v" data-kcol>0</div><div class="s" data-kcols></div></div>
    <div class="kpi"><div class="label" style="margin:0">Blanco y negro</div><div class="v" data-kbn>0</div></div>
    <div class="kpi k-pend"><div class="label" style="margin:0">Por cobrar</div><div class="v" data-kpend>$0.00</div><div class="s" data-kpends></div></div>
    <div class="kpi m-efectivo"><div class="label" style="margin:0"><span class="dot"></span> Efectivo</div><div class="v" data-m-efectivo>$0.00</div><div class="s" data-n-efectivo></div></div>
    <div class="kpi m-tarjeta"><div class="label" style="margin:0"><span class="dot"></span> Tarjeta</div><div class="v" data-m-tarjeta>$0.00</div><div class="s" data-n-tarjeta></div></div>
    <div class="kpi m-yappy"><div class="label" style="margin:0"><span class="dot"></span> Yappy</div><div class="v" data-m-yappy>$0.00</div><div class="s" data-n-yappy></div></div>
  </div>
  <div class="card">
    <div class="row between wrap"><div class="label" style="margin:0" data-vtitle>Órdenes</div><div class="sub-note" style="margin:0" data-vtot></div></div>
    <div data-list style="margin-top:8px"></div>
    <div class="sub-note" data-prev-cob></div>
  </div>`;

  root.querySelector('[data-prev]').onclick = () => { setFecha(addDays(fecha, -1)); deslizar(root.querySelector('[data-cal] .lbl'), -1); };
  root.querySelector('[data-next]').onclick = () => { setFecha(addDays(fecha, 1)); deslizar(root.querySelector('[data-cal] .lbl'), 1); };
  root.querySelector('[data-hoy]').onclick = () => setFecha(today());
  root.querySelector('[data-cal]').onclick = e => openCalendar(e.currentTarget, {
    value: fecha, max: today(), onPick: setFecha,
    marks: async (a, b) => {
      const r = await api(`/api/summary?from=${a}&to=${b}`);
      return new Set(Object.keys(r.days).filter(k => r.days[k].n > 0));
    },
  });
  exportMenu(root.querySelector('[data-exp]'), { onExcel: () => exportar('xls'), onPrint: () => exportar('print') });
  const list = root.querySelector('[data-list]');
  bindAbrir(list);
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
  if (!silent) { loading = true; sales = []; cobrosPrev = []; maq = {}; paint(); }
  try {
    const [s, p, sm] = await Promise.all([
      api(`/api/sales?from=${f}&to=${f}`), api(`/api/sales?from=${f}&to=${f}&by=pago`), api(`/api/summary?from=${f}&to=${f}`),
    ]);
    if (id !== reqId) return;
    sales = s.sales;
    const ids = new Set(sales.map(v => v.id));
    cobrosPrev = p.sales.filter(v => !ids.has(v.id));
    maq = sm.days[f]?.maq || {}; loading = false;
    paint();
  } catch (e) {
    if (id !== reqId) return;
    loading = false; paint();
    if (e.status !== 401) toast(e.message, true);
  }
}

const stats = () => { const s = statsFromSales([...sales, ...cobrosPrev], f => f === fecha); s.maq = maq; return s; };

function paint() {
  const s = stats();
  const st = S.settings, metaDia = st.dias ? st.meta / st.dias : 0;
  root.querySelector('[data-total]').textContent = money(s.cobrado);
  const pct = metaDia ? s.cobrado / metaDia * 100 : 0;
  root.querySelector('[data-bar]').style.width = Math.min(100, pct) + '%';
  root.querySelector('[data-meta]').textContent = metaDia ? `${Math.round(pct)}% de ${money(metaDia)}` : '';
  root.querySelector('[data-kcol]').textContent = int(s.colorPags);
  const mc = Object.values(maq).reduce((a, x) => a + x.color, 0);
  root.querySelector('[data-kcols]').textContent = mc ? `Máquinas: ${int(mc)}` : '';
  root.querySelector('[data-kbn]').textContent = int(s.bnPags);
  root.querySelector('[data-kpend]').textContent = money(s.pendT);
  root.querySelector('[data-kpends]').textContent = `${s.pendN} ${s.pendN === 1 ? 'orden' : 'órdenes'}`;
  for (const k of Object.keys(METODOS)) {
    if (!root.querySelector(`[data-m-${k}]`)) continue;
    root.querySelector(`[data-m-${k}]`).textContent = money(s.met[k].t);
    root.querySelector(`[data-n-${k}]`).textContent = `${s.met[k].n} cobro${s.met[k].n === 1 ? '' : 's'}`;
  }
  root.querySelector('[data-vtitle]').textContent = s.n ? `Órdenes · ${s.n}` : 'Órdenes';
  root.querySelector('[data-vtot]').textContent = s.n ? money(s.total) : '';
  root.querySelector('[data-list]').innerHTML = salesTable(sales.filter(v => !v.anulada).reverse(), { loading, pago: true });
  const prevT = cobrosPrev.reduce((a, v) => a + v.total_cents, 0);
  root.querySelector('[data-prev-cob]').textContent = cobrosPrev.length ? `+ ${cobrosPrev.length} cobro${cobrosPrev.length === 1 ? '' : 's'} de días anteriores · ${money(prevT)}` : '';
}


function exportar(kind) {
  if (loading) return toast('Espera a que carguen los datos');
  const s = stats();
  const payload = {
    titulo: 'Informe del día', periodo: cap(fechaLarga(fecha)), from: fecha, to: fecha, multiDay: false,
    sales, cobrosPrev, stats: s, closings: {}, days: {},
    meta: S.settings.dias ? S.settings.meta / S.settings.dias : 0, archivo: `Informe_${fecha}`,
  };
  if (kind === 'xls') exportExcel(payload); else printReport(payload);
}
export { dayFromSummary };
