/** Lectura de registros de trabajos (CSV) de Fiery y de Xerox. */

export async function readText(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder('utf-16le').decode(buf.subarray(2));
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder('utf-16be').decode(buf.subarray(2));
  // UTF-16 sin marca: muchos ceros en posiciones impares
  let zeros = 0; for (let i = 1; i < Math.min(buf.length, 400); i += 2) if (buf[i] === 0) zeros++;
  if (zeros > 60) return new TextDecoder('utf-16le').decode(buf);
  const utf8 = new TextDecoder('utf-8').decode(buf);
  // UTF-8 salvo que haya muchos caracteres inválidos (archivo guardado en Windows-1252)
  const malos = (utf8.match(/\uFFFD/g) || []).length;
  return (malos > 20 && malos > utf8.length / 2000 ? new TextDecoder('windows-1252').decode(buf) : utf8).replace(/^\uFEFF/, '');
}

export function parseCSV(text) {
  // El separador es el que más aparece en las primeras líneas (Fiery usa tabulador y una línea de título)
  const muestra = text.split(/\r?\n/).filter(l => l.trim()).slice(0, 6);
  const cands = ['\t', ';', ',', '|'];
  const delim = cands.map(d => [d, Math.max(...muestra.map(l => l.split(d).length))]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else if (i + 1 >= text.length || text[i + 1] === delim || text[i + 1] === '\n' || text[i + 1] === '\r') q = false;
        else cell += ch;
      }
      else cell += ch;
    } else if (ch === '"' && cell === '') q = true; // comillas solo al inicio de la celda (Fiery escribe 8,5x11" sin cerrar)
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
  const estado = find(header, [/estado de impresion/, /^estado$/, /job status/, /^status$/]);
  const titulo = find(header, [/titulo del trabajo/, /job name/, /document name/, /^titulo/, /nombre del (trabajo|documento)/]);
  const tamPag = find(header, [/tamano (de )?pagina/, /page size/, /paper size/, /tamano (del )?papel/]);
  const gramaje = find(header, [/gramaje/, /paper weight/, /weight/]);
  const fecha = find(header, [/impresion completada/, /^fecha\/hora/, /print(ed)? (date|time|start)/, /fecha.*impres/, /first page printed/, /end time|start time/, /date/, /fecha/, /time/, /hora/], [/creat|recep|reception/]);
  return { fecha, color, bn, modo, total, copias, estado, titulo, tamPag, gramaje, orden: 'auto' };
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
    if (!filaValida(r, map)) continue;
    const fecha = fechaFija || parseFecha(r[map.fecha], orden);
    if (!enDias(map, fecha)) continue;
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
    if (map.soloColor) { bn = 0; if (!color) continue; }
    if (!color && !bn) continue;
    out.push({ h: await sha(`${maquina}|${fechaFija || ''}|${r.join('\u0001')}`), fecha, color, bn });
    const d = porDia[fecha] ||= { color: 0, bn: 0, trabajos: 0 };
    d.color += color; d.bn += bn; d.trabajos++;
  }
  return { filas: out, porDia, sinFecha };
}

/** Trabajos cancelados, con error o páginas de prueba no cuentan. */
function filaValida(r, map) {
  if (map.estado >= 0) {
    const e = norm(r[map.estado] || '');
    if (map.soloOk ? !/^(ok|completado|completed|impreso|printed|terminado|done)$/.test(e.trim()) : /cancel|error|abort|fall/.test(e)) return false;
  }
  if (map.titulo >= 0 && /pagina de prueba|test page|configuration page|pagina de configuracion/.test(norm(r[map.titulo] || ''))) return false;
  return true;
}

function tsDe(s, orden) {
  const f = parseFecha(s, orden); if (!f) return null;
  const m = String(s).match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?\s*m\.?)?/i);
  let h = m ? +m[1] : 0; const mi = m ? +m[2] : 0, se = m && m[3] ? +m[3] : 0;
  if (m && m[4]) { const pm = /p/i.test(m[4]); if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }
  const [y, mo, d] = f.split('-').map(Number);
  return { fecha: f, ts: new Date(y, mo - 1, d, h, mi, se).getTime(), hora: `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}` };
}

function tamDe(txt) {
  const x = norm(txt || '').replace(/,/g, '.').replace(/\s/g, '');
  if (/11x17|12x18|13x19|17x11|tabloid|a3/.test(x)) return 'tab';
  if (/8.5x14|14x8.5|legal|oficio/.test(x)) return 'legal';
  if (/8.5x11|11x8.5|letter|carta|a4/.test(x)) return 'carta';
  return null;
}
const grueso = g => { const n = parseInt(String(g || '').replace(/[^\d-]/g, ''), 10); return Number.isFinite(n) && n >= 150; };

const baseTitulo = t => norm(t || '').replace(/\.(pdf|docx?|jpe?g|png|pptx?|xlsx?|tiff?|ai|psd|eps)\b.*$/, '')
  .replace(/\(\d+\)/g, ' ').replace(/[_\-.]+/g, ' ').replace(/\b(copia|copy)\b/g, ' ').replace(/\s+\d+\s*$/, '').replace(/\s+/g, ' ').trim();
const GENERICAS = new Set(['imprimir', 'impresion', 'print', 'documento', 'document', 'final', 'version', 'copia', 'copy', 'scan', 'escaneado', 'escaneo', 'whatsapp', 'image', 'imagen', 'img', 'archivo', 'file', 'nuevo', 'nueva', 'prueba', 'test', 'para', 'color', 'carta', 'legal', 'microsoft', 'word', 'untitled', 'sin', 'titulo', 'actualizada', 'actualizado', '2025', '2026', '2027']);
const palabras = t => new Set(baseTitulo(t).split(' ').filter(w => w.length >= 4 && !GENERICAS.has(w) && !/^\d+$/.test(w)));
/** Mismo cliente si el nombre es igual, uno empieza con el otro o comparten una palabra propia (ej. "jordi"). */
function parecidos(a, b) {
  const x = baseTitulo(a), y = baseTitulo(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (x.length >= 5 && y.length >= 5 && (x.startsWith(y) || y.startsWith(x))) return true;
  const px = palabras(a), py = palabras(b);
  for (const w of px) if (py.has(w)) return true;
  return false;
}

/**
 * Propone órdenes a partir de los trabajos del registro.
 * Une trabajos seguidos (máx. 15 min entre uno y otro) solo si los nombres de archivo se parecen;
 * si no se puede saber, cada trabajo queda como orden aparte.
 */
export async function proponerOrdenes(parsed, map, catalogo) {
  const orden = map.orden === 'auto' ? detectOrden(parsed.rows, map.fecha) : map.orden;
  const jobs = [];
  for (const r of parsed.rows) {
    if (!filaValida(r, map)) continue;
    const t = tsDe(r[map.fecha], orden); if (!t) continue;
    if (!enDias(map, t.fecha)) continue;
    const color = Math.round(num(r[map.color])), bn = map.soloColor ? 0 : Math.round(map.bn >= 0 ? num(r[map.bn]) : 0);
    if (color <= 0 && bn <= 0) continue;
    const titulo = map.titulo >= 0 ? (r[map.titulo] || '').trim() : '';
    const tamTxt = map.tamPag >= 0 ? r[map.tamPag] : '';
    jobs.push({ ...t, titulo, color, bn, tam: tamDe(tamTxt), tamTxt, grueso: map.gramaje >= 0 && grueso(r[map.gramaje]), gram: map.gramaje >= 0 ? r[map.gramaje] : '', h: await sha(r.join('\u0001')) });
  }
  jobs.sort((a, b) => a.ts - b.ts);
  const grupos = [];
  for (const j of jobs) {
    const g = grupos.at(-1);
    if (g && j.fecha === g.fecha && j.ts - g.jobs.at(-1).ts <= 15 * 60000 && g.jobs.some(x => parecidos(x.titulo, j.titulo))) g.jobs.push(j);
    else grupos.push({ fecha: j.fecha, hora: j.hora, ts: j.ts, jobs: [j] });
  }
  const precioDe = (serv, tam) => catalogo.find(s => s.id === serv)?.tams.find(t => t.id === tam)?.precio || 0;
  for (const g of grupos) {
    const lineas = new Map();
    const add = (serv, tam, cant, detalle) => {
      const k = `${serv}|${tam}`;
      const l = lineas.get(k) || { serv, tam, cant: 0, precio_cents: precioDe(serv, tam), detalles: new Set() };
      l.cant += cant; if (detalle) l.detalles.add(detalle); lineas.set(k, l);
    };
    for (const j of g.jobs) {
      const tam = j.tam || 'carta';
      const nota = j.tam ? '' : `tamaño en registro: ${j.tamTxt || 'sin dato'}`;
      if (j.color > 0) add(j.grueso && tam === 'carta' ? 'col_cart' : 'col_imp', tam, j.color, [j.grueso && tam !== 'carta' ? 'papel grueso' : '', nota].filter(Boolean).join(' · '));
      if (j.bn > 0) add('bn_imp', tam, j.bn, nota);
    }
    g.lineas = [...lineas.values()].map(l => ({ ...l, extra: [...l.detalles].join(' · ').slice(0, 80) }));
    g.titulos = g.jobs.map(j => j.titulo).filter(Boolean);
    g.interno = g.titulos.some(t => /prueba|\btest\b|copias[\s_-]*rapidas/.test(norm(t)));
    g.origen = 'joblog:' + await sha(g.jobs.map(j => j.h).join('|'));
  }
  return grupos;
}

const enDias = (map, f) => !f ? true : Array.isArray(map.dias) ? map.dias.includes(f) : !(map.desde && (f < map.desde || f > map.hasta));

/** Días que aparecen en el registro (solo trabajos válidos con páginas). */
export function diasDelRegistro(parsed, map) {
  const orden = map.orden === 'auto' ? detectOrden(parsed.rows, map.fecha) : map.orden;
  const out = {};
  for (const r of parsed.rows) {
    if (!filaValida(r, map)) continue;
    const f = parseFecha(r[map.fecha], orden); if (!f) continue;
    const c = num(r[map.color]), b = map.bn >= 0 ? num(r[map.bn]) : 0;
    if (c + b <= 0) continue;
    const d = out[f] ||= { trabajos: 0, color: 0 }; d.trabajos++; d.color += c;
  }
  return out;
}
