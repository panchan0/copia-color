export const pad = n => String(n).padStart(2, '0');
export const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const DIAS3 = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const MES3 = MESES.map(m => m.slice(0, 3));

export const METODOS = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', yappy: 'Yappy' };
export const TIPOS = { imp: 'Impresión', cop: 'Copia' };
export const TAMS = { carta: 'Carta', legal: 'Legal', otro: 'Otro' };

/* Fechas como texto YYYY-MM-DD, calculadas en UTC para evitar saltos por zona horaria */
export function todayIn(tz) {
  try {
    const p = {};
    for (const x of new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())) p[x.type] = x.value;
    return `${p.year}-${p.month}-${p.day}`;
  } catch { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
}
export const parseD = f => { const [y, m, d] = f.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
export const fmtD = dt => `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
export const addDays = (f, n) => { const d = parseD(f); d.setUTCDate(d.getUTCDate() + n); return fmtD(d); };
export const dow = f => parseD(f).getUTCDay();
export const startOfWeek = f => addDays(f, -((dow(f) + 6) % 7));
export const startOfMonth = f => f.slice(0, 8) + '01';
export const endOfMonth = f => { const [y, m] = f.split('-').map(Number); return fmtD(new Date(Date.UTC(y, m, 0))); };
export const addMonths = (f, n) => { const [y, m] = f.split('-').map(Number); return fmtD(new Date(Date.UTC(y, m - 1 + n, 1))); };
export const daysBetween = (a, b) => Math.round((parseD(b) - parseD(a)) / 86400000);
export const dmy = f => { const [y, m, d] = f.split('-'); return `${d}/${m}/${y}`; };
export const fechaLarga = f => { const d = parseD(f); return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} ${MES3[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
export const fechaCorta = f => { const d = parseD(f); return `${DIAS3[d.getUTCDay()]} ${d.getUTCDate()} ${MES3[d.getUTCMonth()]}`; };
export const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

/* Dinero en centavos */
export const money = c => (c < 0 ? '-$' : '$') + (Math.abs(c || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money0 = c => '$' + Math.round((c || 0) / 100).toLocaleString('en-US');
export const int = n => Math.round(n || 0).toLocaleString('en-US');
export const toCents = v => { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? Math.round(n * 100) : NaN; };
export const centsToInput = c => (c == null ? '' : (c / 100).toFixed(2));

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
export const itemLabel = it => `${TIPOS[it.tipo] || ''} ${it.tam === 'otro' ? (it.nombre || 'otro') : (TAMS[it.tam] || '').toLowerCase()}`.trim();
export const itemLabelLower = it => `${(TIPOS[it.tipo] || '').toLowerCase()} ${(it.tam === 'otro' ? (it.nombre || 'otro') : (TAMS[it.tam] || '')).toLowerCase()}`.trim();

/** Estadísticas a partir de una lista de ventas completas */
export function statsFromSales(sales) {
  const s = emptyDay();
  for (const v of sales) {
    if (v.anulada) continue;
    s.n++; s.total += v.total_cents;
    if (s.met[v.metodo]) { s.met[v.metodo].n++; s.met[v.metodo].t += v.total_cents; }
    for (const it of v.items || []) { const g = s.pag[it.tipo]; if (g) g[it.tam in g ? it.tam : 'otro'] += it.cant; }
  }
  return s;
}
export function emptyDay() {
  return { n: 0, total: 0, met: { efectivo: { n: 0, t: 0 }, tarjeta: { n: 0, t: 0 }, yappy: { n: 0, t: 0 } }, pag: { imp: { carta: 0, legal: 0, otro: 0 }, cop: { carta: 0, legal: 0, otro: 0 } } };
}
export function sumDays(list) {
  const s = emptyDay();
  for (const d of list) {
    if (!d) continue;
    s.n += d.n; s.total += d.total;
    for (const k in s.met) { s.met[k].n += d.met[k].n; s.met[k].t += d.met[k].t; }
    for (const t in s.pag) for (const k in s.pag[t]) s.pag[t][k] += d.pag[t][k];
  }
  return s;
}
export const pagTipo = (s, t) => s.pag[t].carta + s.pag[t].legal + s.pag[t].otro;
export const pagTotal = s => pagTipo(s, 'imp') + pagTipo(s, 'cop');

/** Comparación del cierre con lo vendido */
export function analizarCierre(c, s) {
  const out = {};
  if (!c) return out;
  if (c.inicio != null && c.fin != null && c.fin >= c.inicio) { out.maq = c.fin - c.inicio; out.dif = out.maq - pagTotal(s); }
  if (c.fiery != null) out.difFiery = c.fiery - pagTipo(s, 'imp');
  if (c.efectivo_cents != null) out.difEf = c.efectivo_cents - s.met.efectivo.t;
  return out;
}
