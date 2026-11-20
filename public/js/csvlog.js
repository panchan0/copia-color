/** Lectura de registros de trabajos (CSV) de Fiery y de Xerox. */

export async function readText(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder('utf-16le').decode(buf.subarray(2));
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder('utf-16be').decode(buf.subarray(2));
  // UTF-16 sin marca: muchos ceros en posiciones impares
  let zeros = 0; for (let i = 1; i < Math.min(buf.length, 400); i += 2) if (buf[i] === 0) zeros++;
  if (zeros > 60) return new TextDecoder('utf-16le').decode(buf);
  const utf8 = new TextDecoder('utf-8').decode(buf);
  return utf8.includes('�') ? new TextDecoder('windows-1252').decode(buf) : utf8.replace(/^﻿/, '');
}

export function parseCSV(text) {
  const first = text.split(/\r?\n/).find(l => l.trim()) || '';
  const cands = [',', ';', '\t', '|'];
  const delim = cands.map(d => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const clean = rows.map(r => r.map(c => c.trim())).filter(r => r.some(c => c));
  // Encabezado: primera fila con 3 o más textos no numéricos
  const hi = Math.max(0, clean.findIndex(r => r.filter(c => c && isNaN(Number(c.replace(',', '.')))).length >= 3));
  return { header: clean[hi] || [], rows: clean.slice(hi + 1), delim };
}

const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const find = (header, tests, avoid = []) => {
  const h = header.map(norm);
  for (const t of tests) { const i = h.findIndex(x => t.test(x) && !avoid.some(a => a.test(x))); if (i >= 0) return i; }
  return -1;
};

/** Propone qué columna es cada dato. */
export function guessMap(header) {
  const color = find(header, [/pasadas? en colou?r/, /total number of colou?r pages/, /colou?r pages/, /paginas? (a |de )?colou?r/, /colou?r impressions/, /impresiones? (a |de )?colou?r/, /^colou?r$/], [/mode|modo/]);
  const bn = find(header, [/pasadas? en negro/, /(b\/w|black|mono|grayscale|blanco|byn|b&w).*(pages|paginas|impres)/, /(pages|paginas|impres).*(b\/w|black|mono|blanco)/]);
  const modo = find(header, [/colou?r mode/, /modo de colou?r/, /output colou?r/, /colou?r/], [/pages|paginas|impres/]);
  const total = find(header, [/total de hojas impresas/, /total de pasadas/, /total number of (pages|sheets|impressions) printed/, /pages printed/, /paginas impresas/, /impressions/, /impresiones/, /^pages$/, /^paginas$/, /sheets/, /hojas/], [/colou?r|b\/w|black|mono/]);
  const copias = find(header, [/^copies$/, /^copias$/, /number of copies/, /copies printed/]);
  const fecha = find(header, [/^fecha\/hora/, /impresion completada/, /print(ed)? (date|time|start)/, /fecha.*impres/, /first page printed/, /end time|start time/, /date/, /fecha/, /time/, /hora/], [/creat|recep|reception/]);
  return { fecha, color, bn, modo, total, copias, orden: 'auto' };
}

/** Convierte un texto de fecha a YYYY-MM-DD. orden: 'dmy' | 'mdy' | 'auto' */
export function parseFecha(s, orden = 'auto') {
  if (!s) return null;
  let m = s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return ok(+m[1], +m[2], +m[3]);
  m = s.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    let a = +m[1], b = +m[2], y = +m[3]; if (y < 100) y += 2000;
    let o = orden;
    if (o === 'auto') o = a > 12 ? 'dmy' : b > 12 ? 'mdy' : 'mdy';
    return o === 'dmy' ? ok(y, b, a) : ok(y, a, b);
  }
  const d = new Date(s);
  return isNaN(d) ? null : ok(d.getFullYear(), d.getMonth() + 1, d.getDate());
}
const ok = (y, mo, d) => (mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && y > 2000 && y < 2100) ? `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;

/** Si la columna de fecha no deja ver el orden, mira todas las filas. */
export function detectOrden(rows, i) {
  if (i < 0) return 'mdy';
  for (const r of rows) {
    const m = (r[i] || '').match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
    if (m) { if (+m[1] > 12) return 'dmy'; if (+m[2] > 12) return 'mdy'; }
  }
  return 'mdy';
}

const num = v => { const n = Number(String(v ?? '').replace(/[^\d.,-]/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const esColor = v => { const x = norm(String(v || '')); return /cmyk|colou?r|full|4c|cmy/.test(x) && !/gray|grey|gris|mono|black|b\/w|byn/.test(x); };

async function sha(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Filas listas para guardar: [{h, fecha, color, bn}] y resumen por día. */
export async function procesar(parsed, map, maquina, fechaFija = null) {
  const out = [], porDia = {};
  const orden = map.orden === 'auto' ? detectOrden(parsed.rows, map.fecha) : map.orden;
  let sinFecha = 0;
  for (const r of parsed.rows) {
    const fecha = fechaFija || parseFecha(r[map.fecha], orden);
    if (!fecha) { sinFecha++; continue; }
    const copias = map.copias >= 0 ? Math.max(1, num(r[map.copias])) : 1;
    let color = 0, bn = 0;
    if (map.color >= 0) {
      color = num(r[map.color]) * (map.multiplicar ? copias : 1);
      if (map.bn >= 0) bn = num(r[map.bn]) * (map.multiplicar ? copias : 1);
      else if (map.total >= 0) bn = Math.max(0, num(r[map.total]) * (map.multiplicar ? copias : 1) - color);
    } else if (map.modo >= 0 && map.total >= 0) {
      const t = num(r[map.total]) * (map.multiplicar ? copias : 1);
      if (esColor(r[map.modo])) color = t; else bn = t;
    } else continue;
    color = Math.round(color); bn = Math.round(bn);
    if (!color && !bn) continue;
    out.push({ h: await sha(`${maquina}|${fechaFija || ''}|${r.join('\u0001')}`), fecha, color, bn });
    const d = porDia[fecha] ||= { color: 0, bn: 0, trabajos: 0 };
    d.color += color; d.bn += bn; d.trabajos++;
  }
  return { filas: out, porDia, sinFecha };
}
