export const pad = n => String(n).padStart(2, '0');
export const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const DIAS3 = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const MES3 = MESES.map(m => m.slice(0, 3));

export const METODOS = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', yappy: 'Yappy', pordefinir: 'Por definir' };
export const METODOS_REALES = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', yappy: 'Yappy' };
export const ESTADOS = { pendiente: 'Pendiente', credito: 'Crédito', pagada: 'Pagada', anulada: 'Anulada' };
export const CATS = { color: 'Color', bn: 'Blanco y negro', planos: 'Planos', enc: 'Encuadernación', otros: 'Otros' };
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
/** Nombre completo de una línea: "Impresión a color · Carta 8.5 x 11" */
export const itemLabel = it => {
  if (it.tipo === 'imp' || it.tipo === 'cop') return `${it.tipo === 'imp' ? 'Impresión' : 'Copia'} a color · ${it.tam === 'otro' ? it.nombre : (TAMS[it.tam] || it.tam)}`;
  return it.tam && it.tam !== '—' ? `${it.nombre} · ${it.tam}` : it.nombre;
};
export const itemLabelLower = itemLabel;
export const fmtCant = (n, unidad) => unidad === 'pie lineal' ? `${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })} pie${n === 1 ? '' : 's'} lin.` : int(n);


/** Estadísticas de una lista de órdenes.
 *  Órdenes creadas: n, total, productos, páginas. Cobros: solo los de `cobrosDe` (fecha de pago en el rango). */
export function statsFromSales(sales, enRango = null) {
  const s = emptyDay();
  for (const v of sales) {
    if (v.anulada) continue;
    const creada = !enRango || enRango(v.fecha);
    if (creada) {
      s.n++; s.total += v.total_cents; s.sub += v.subtotal_cents ?? v.total_cents; s.itbms += v.itbms_cents || 0;
      if (v.estado === 'pendiente') { s.pendN++; s.pendT += v.total_cents; }
      if (v.estado === 'credito') { s.credN++; s.credT += v.total_cents; }
      for (const it of v.items || []) addItem(s, it, it.cant, it.sub_cents);
    }
    const pagada = v.estado === 'pagada' && (!enRango || enRango(v.pagada_fecha));
    if (pagada && s.met[v.metodo]) { s.met[v.metodo].n++; s.met[v.metodo].t += v.total_cents; s.cobrado += v.total_cents; }
  }
  return s;
}
export function emptyDay() {
  return { n: 0, total: 0, sub: 0, itbms: 0, cobrado: 0, pendN: 0, pendT: 0, credN: 0, credT: 0, colorPags: 0, bnPags: 0,
    met: { efectivo: { n: 0, t: 0 }, tarjeta: { n: 0, t: 0 }, yappy: { n: 0, t: 0 }, pordefinir: { n: 0, t: 0 } }, prods: {}, maq: {} };
}
const UNIT_PAG = new Set(['pág', 'hoja', undefined, null]);
function addItem(s, it, cant, monto) {
  const label = itemLabel(it);
  const p = s.prods[label] ||= { label, cat: it.cat || 'color', color: it.color ?? true, unidad: it.unidad || 'pág', cant: 0, monto: 0 };
  p.cant += cant; p.monto += monto;
  const esColor = it.color ?? true;
  if (UNIT_PAG.has(it.unidad)) { if (esColor) s.colorPags += cant; else if (it.cat !== 'enc' && it.cat !== 'otros') s.bnPags += cant; }
}
/** Convierte un día del resumen del servidor al mismo formato */
export function dayFromSummary(d) {
  const s = emptyDay();
  if (!d) return s;
  Object.assign(s, { n: d.n, total: d.total, sub: d.sub, itbms: d.itbms, cobrado: d.cobrado, pendN: d.pendN, pendT: d.pendT, credN: d.credN || 0, credT: d.credT || 0, maq: d.maq || {} });
  for (const k in s.met) s.met[k] = { ...(d.met[k] || { n: 0, t: 0 }) };
  for (const it of d.items || []) addItem(s, it, it.cant, it.monto);
  return s;
}
export function sumDays(list) {
  const s = emptyDay();
  for (const d of list) {
    if (!d) continue;
    for (const k of ['n', 'total', 'sub', 'itbms', 'cobrado', 'pendN', 'pendT', 'credN', 'credT', 'colorPags', 'bnPags']) s[k] += d[k] || 0;
    for (const k in s.met) { s.met[k].n += d.met[k]?.n || 0; s.met[k].t += d.met[k]?.t || 0; }
    for (const [l, p] of Object.entries(d.prods)) { const q = s.prods[l] ||= { ...p, cant: 0, monto: 0 }; q.cant += p.cant; q.monto += p.monto; }
    for (const [m, x] of Object.entries(d.maq || {})) { const q = s.maq[m] ||= { color: 0, bn: 0, trabajos: 0 }; q.color += x.color; q.bn += x.bn; q.trabajos += x.trabajos; }
  }
  return s;
}
export const prodList = s => Object.values(s.prods).sort((a, b) => b.monto - a.monto);
export const maqColor = s => Object.values(s.maq || {}).reduce((a, x) => a + (x.color || 0), 0);

/** Desglose de ITBMS de un monto bruto, igual que el servidor */
export function calcItbms(bruto, cfg) {
  const i = Math.round(bruto * (cfg?.tasa ?? 7) / 100);
  return { sub: bruto, itbms: i, total: bruto + i };
}

/** Comparación del cierre con lo cobrado/hecho */
export function analizarCierre(c, s) {
  const out = {};
  const maq = maqColor(s);
  if (maq) { out.logColor = maq; out.difLog = maq - s.colorPags; }
  if (!c) return out;
  if (c.inicio != null && c.fin != null && c.fin >= c.inicio) { out.maq = c.fin - c.inicio; out.dif = out.maq - s.colorPags; }
  if (c.efectivo_cents != null) out.difEf = c.efectivo_cents - s.met.efectivo.t;
  return out;
}

/* ---- Operadores: se muestran con su inicial y un número de dos dígitos ---- */
export const opCode = o => `${(String(o?.n || '').trim()[0] || '?').toUpperCase()}${o?.c || ''}`;
export function nuevoCodigoOp(ops) {
  const usados = new Set(ops.map(o => o.c));
  const libres = []; for (let i = 1; i <= 99; i++) { const c = String(i).padStart(2, '0'); if (!usados.has(c)) libres.push(c); }
  return libres[Math.floor(Math.random() * libres.length)] || '00';
}
/** Texto del operador de una orden (inicial + número). */
export function opTexto(v, ops) {
  const o = v?.operador; if (!o || o === 'Job Log') return '';
  const m = (ops || []).find(x => x.n === o);
  return m ? opCode(m) : o;
}

/* ---- Productos: el mismo producto puede ser a color o blanco y negro ---- */
export const baseNombre = n => String(n || '').replace(/\s*(a color|en blanco y negro|blanco y negro|b\/n)\b/gi, '').replace(/\s+/g, ' ').trim();
export const CATS2 = { imp: 'Impresiones y copias', planos: 'Planos', enc: 'Encuadernación', otros: 'Otros' };
export const catDe = s => (s.cat === 'color' || s.cat === 'bn' ? 'imp' : s.cat);

/** Número de orden: las anuladas no llevan número. */
export const numOrdenTxt = v => (v && v.numero != null && !v.anulada && v.estado !== 'anulada' ? String(v.numero).padStart(6, '0') : '—');
