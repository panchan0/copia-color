import { S } from './store.js';
import { toast } from './ui/dom.js';
import { esc, dmy, money, int, cap, fechaCorta, MESES, METODOS, pagTipo, pagTotal, analizarCierre, sumDays, pad } from './util.js';
import { numOrden } from './workorder.js';

/* Informe con el formato: Número · Emisión · Hora · Nombre/Razón social · Detalle · Subtotal · ITBMS · Total · Pago */

const ab = it => `${it.tipo === 'imp' ? 'imp.' : 'cop.'} ${it.tam === 'otro' ? (it.nombre || 'otro').toLowerCase() : it.tam}`;
const detalle = v => v.items.map(it => `${it.cant} ${ab(it)}`).join(', ');

function modelo(p) {
  const s = p.stats;
  const filas = p.sales.slice().sort((a, b) => a.ts - b.ts).map(v => ({
    numero: numOrden(v.numero), emision: dmy(v.fecha), hora: v.hora,
    nombre: v.anulada ? `ANULADA · ${v.client_name || 'CONTADO'}` : (v.client_name || 'CONTADO'),
    detalle: detalle(v), anulada: v.anulada,
    sub: v.anulada ? null : (v.subtotal_cents ?? v.total_cents) / 100,
    itbms: v.anulada ? null : (v.itbms_cents || 0) / 100,
    total: v.anulada ? null : v.total_cents / 100,
    pago: METODOS[v.metodo],
  }));
  const pagos = Object.keys(METODOS).map(k => [METODOS[k], s.met[k].n, s.met[k].t / 100]);
  const pag = [
    ['Impresiones', s.pag.imp.carta, s.pag.imp.legal, s.pag.imp.otro, pagTipo(s, 'imp')],
    ['Copias', s.pag.cop.carta, s.pag.cop.legal, s.pag.cop.otro, pagTipo(s, 'cop')],
    ['Total', s.pag.imp.carta + s.pag.cop.carta, s.pag.imp.legal + s.pag.cop.legal, s.pag.imp.otro + s.pag.cop.otro, pagTotal(s)],
  ];
  let cierre = null;
  if (!p.multiDay && p.closings[p.from]) {
    const c = p.closings[p.from], a = analizarCierre(c, s);
    cierre = [];
    if (a.maq != null) cierre.push(['Contador máquina', `${int(c.inicio)} → ${int(c.fin)} = ${int(a.maq)} págs`], ['Páginas cobradas', int(pagTotal(s))], ['Diferencia', (a.dif > 0 ? '+' : '') + int(a.dif)]);
    if (a.difFiery != null) cierre.push(['Fiery', `${int(c.fiery)} págs · dif. ${(a.difFiery > 0 ? '+' : '') + int(a.difFiery)}`]);
    if (a.difEf != null) cierre.push(['Efectivo en caja', `${money(c.efectivo_cents)} · dif. ${a.difEf > 0 ? '+' : ''}${money(a.difEf)}`]);
    if (c.nota) cierre.push(['Nota', c.nota]);
    if (!cierre.length) cierre = null;
  }
  let dias = null;
  if (p.multiDay) {
    const days = p.days || {};
    if (p.porMes) {
      const y = p.from.slice(0, 4);
      dias = MESES.map((m, i) => { const d = sumDays(Object.keys(days).filter(f => f.startsWith(`${y}-${pad(i + 1)}`)).map(f => days[f])); return d.n ? [cap(m), d.n, pagTotal(d), d.sub / 100, d.itbms / 100, d.total / 100] : null; }).filter(Boolean);
    } else {
      dias = Object.keys(days).sort().filter(f => days[f].n).map(f => { const d = days[f]; return [cap(fechaCorta(f)), d.n, pagTotal(d), (d.sub ?? d.total) / 100, (d.itbms || 0) / 100, d.total / 100]; });
    }
  }
  return { filas, pagos, pag, cierre, dias, sub: s.sub / 100, itbms: s.itbms / 100, total: s.total / 100, n: s.n, meta: p.meta / 100 };
}

const ahora = () => { const d = new Date(); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const tasa = () => `ITBMS ${S.settings?.itbms?.tasa ?? 7}%`;

/* ---------- Excel ---------- */
let loadingLib = null;
function loadExcelJS() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  return loadingLib ||= new Promise((res, rej) => {
    const sc = document.createElement('script');
    sc.src = '/vendor/exceljs.min.js';
    sc.onload = () => res(window.ExcelJS);
    sc.onerror = () => { loadingLib = null; rej(new Error('No se pudo cargar el generador de Excel')); };
    document.head.appendChild(sc);
  });
}
const MONEY = '#,##0.00';
const thin = c => ({ style: 'thin', color: { argb: c } });

function nuevaHoja(wb, nombre, negocio, widths, titleRow) {
  const ws = wb.addWorksheet(nombre, {
    pageSetup: {
      paperSize: 1, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true,
      margins: { left: 0.35, right: 0.35, top: 0.45, bottom: 0.55, header: 0.2, footer: 0.25 },
      ...(titleRow ? { printTitlesRow: `${titleRow}:${titleRow}` } : {}),
    },
    headerFooter: { oddFooter: `&L&8${negocio.replace(/&/g, '&&')}&R&8Página &P de &N` },
    views: [{ showGridLines: false, ...(titleRow ? { state: 'frozen', ySplit: titleRow } : {}) }],
  });
  ws.columns = widths.map(w => ({ width: w }));
  return ws;
}

export async function exportExcel(p) {
  let ExcelJS;
  try { ExcelJS = await loadExcelJS(); } catch (e) { return toast(e.message, true); }
  const m = modelo(p), negocio = S.account.business || 'Mi negocio';
  const wb = new ExcelJS.Workbook(); wb.creator = 'Color'; wb.created = new Date();
  const ws = nuevaHoja(wb, 'Informe', negocio, [9, 11, 6.5, 28, 22, 10.5, 10, 11, 10.5], 5);
  const NC = 9;
  ws.mergeCells(1, 1, 1, NC); ws.mergeCells(2, 1, 2, NC); ws.mergeCells(3, 1, 3, NC);
  Object.assign(ws.getCell('A1'), { value: negocio }); ws.getCell('A1').font = { bold: true, size: 14 };
  ws.getCell('A2').value = `${p.titulo} · ${p.periodo}`; ws.getCell('A2').font = { size: 11 };
  ws.getCell('A3').value = `Generado ${ahora()}`; ws.getCell('A3').font = { size: 9, color: { argb: 'FF8A8A8A' } };
  const head = ['Número', 'Emisión', 'Hora', 'Nombre/Razón social', 'Detalle', 'Subtotal', tasa(), 'Total', 'Pago'];
  const hr = ws.getRow(5); hr.values = head; hr.height = 18;
  hr.eachCell((c, i) => {
    c.font = { bold: true, size: 10 }; c.border = { bottom: thin('FF16161A') };
    c.alignment = { vertical: 'middle', horizontal: i >= 6 && i <= 8 ? 'right' : 'left', indent: i === 9 ? 1 : 0 };
  });
  let r = 6;
  for (const f of m.filas) {
    const row = ws.getRow(r);
    row.values = [f.numero, f.emision, f.hora, f.nombre, f.detalle, f.sub, f.itbms, f.total, f.pago];
    row.eachCell({ includeEmpty: true }, (c, i) => {
      c.font = { size: 10, color: f.anulada ? { argb: 'FFB0B0B0' } : undefined, strike: f.anulada && i === 4 };
      c.border = { bottom: thin('FFE6E3DC') };
      c.alignment = { vertical: 'top', wrapText: i === 4 || i === 5, horizontal: i >= 6 && i <= 8 ? 'right' : 'left', indent: i === 9 ? 1 : 0 };
    });
    [6, 7, 8].forEach(i => { row.getCell(i).numFmt = MONEY; });
    r++;
  }
  if (!m.filas.length) { ws.getCell(r, 1).value = 'Sin ventas en este periodo'; r++; }
  const last = r - 1;
  const tr = ws.getRow(r);
  tr.getCell(5).value = 'Total ='; tr.getCell(5).alignment = { horizontal: 'right' };
  if (m.filas.length) {
    tr.getCell(6).value = { formula: `SUM(F6:F${last})`, result: m.sub };
    tr.getCell(7).value = { formula: `SUM(G6:G${last})`, result: m.itbms };
    tr.getCell(8).value = { formula: `SUM(H6:H${last})`, result: m.total };
  }
  tr.eachCell({ includeEmpty: true }, (c, i) => { c.font = { bold: true, size: 10 }; if (i >= 6 && i <= 8) { c.border = { top: thin('FF16161A') }; c.numFmt = MONEY; c.alignment = { horizontal: 'right' }; } });
  r += 2;

  // Resumen debajo, en columnas D–H para no ensanchar la hoja
  const bloque = (titulo, header, rows, fmts) => {
    ws.getCell(r, 4).value = titulo; ws.getCell(r, 4).font = { bold: true, size: 10 }; r++;
    if (header) { header.forEach((h, j) => { const c = ws.getCell(r, 4 + j); c.value = h; c.font = { bold: true, size: 9, color: { argb: 'FF6B6B73' } }; c.alignment = { horizontal: j ? 'right' : 'left' }; c.border = { bottom: thin('FFBDB8AD') }; }); r++; }
    rows.forEach((row, ri) => {
      row.forEach((v, j) => {
        const c = ws.getCell(r, 4 + j); c.value = v; c.font = { size: 10, bold: ri === rows.length - 1 && rows.length > 1 && /^Total/.test(row[0]) };
        if (j) c.alignment = { horizontal: 'right' };
        if (fmts[j] === '$') c.numFmt = MONEY; else if (fmts[j] === 'n') c.numFmt = '#,##0';
      });
      r++;
    });
    r++;
  };
  bloque('Por tipo de pago', ['Método', 'Ventas', '', '', 'Total'], [...m.pagos.map(x => [x[0], x[1], null, null, x[2]]), ['Total', m.n, null, null, m.total]], ['t', 'n', '', '', '$']);
  bloque('Páginas a color', ['', 'Carta', 'Legal', 'Otro', 'Total'], m.pag, ['t', 'n', 'n', 'n', 'n']);
  if (m.cierre) bloque('Cierre del día', null, m.cierre.map(([a, b]) => [a, b]), ['t', 't']);
  bloque('Meta', null, [['Meta del periodo', m.meta], ['Vendido', m.total], ['Cumplimiento', m.meta ? `${(m.total / m.meta * 100).toFixed(1)}%` : '—']], ['t', '$']);

  if (m.dias && m.dias.length) {
    const wd = nuevaHoja(wb, p.porMes ? 'Por mes' : 'Por día', negocio, [16, 9, 10, 12, 11, 12], 4);
    wd.mergeCells(1, 1, 1, 6); wd.mergeCells(2, 1, 2, 6);
    wd.getCell('A1').value = negocio; wd.getCell('A1').font = { bold: true, size: 14 };
    wd.getCell('A2').value = `${p.titulo} · ${p.periodo}`;
    const h = wd.getRow(4); h.values = [p.porMes ? 'Mes' : 'Día', 'Ventas', 'Páginas', 'Subtotal', tasa(), 'Total'];
    h.eachCell((c, i) => { c.font = { bold: true, size: 10 }; c.border = { bottom: thin('FF16161A') }; if (i > 1) c.alignment = { horizontal: 'right' }; });
    let rr = 5;
    for (const d of m.dias) { const row = wd.getRow(rr++); row.values = d; [4, 5, 6].forEach(i => { row.getCell(i).numFmt = MONEY; }); row.eachCell(c => { c.font = { size: 10 }; c.border = { bottom: thin('FFE6E3DC') }; }); }
    const t = wd.getRow(rr); t.getCell(1).value = 'Total';
    [2, 3, 4, 5, 6].forEach(i => { const L = String.fromCharCode(64 + i); t.getCell(i).value = { formula: `SUM(${L}5:${L}${rr - 1})`, result: m.dias.reduce((a, b) => a + b[i - 1], 0) }; if (i > 3) t.getCell(i).numFmt = MONEY; });
    t.eachCell(c => { c.font = { bold: true, size: 10 }; c.border = { top: thin('FF16161A') }; });
  }

  const buf = await wb.xlsx.writeBuffer();
  descargar(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${p.archivo}.xlsx`);
  toast('Excel descargado');
}

function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/* ---------- Impresión ---------- */
export function printReport(p) {
  const m = modelo(p), negocio = S.account.business || '';
  const f$ = v => v == null ? '' : money(Math.round(v * 100)).replace('$', '');
  let h = `<div class="rep"><h1>${esc(negocio)}</h1><div class="meta">${esc(p.titulo)} · ${esc(p.periodo)} · Generado ${ahora()}</div>
  <table class="inf"><thead><tr><th>Número</th><th>Emisión</th><th>Hora</th><th>Nombre/Razón social</th><th>Detalle</th><th class="n">Subtotal</th><th class="n">${tasa()}</th><th class="n">Total</th><th>Pago</th></tr></thead><tbody>
  ${m.filas.map(f => `<tr class="${f.anulada ? 'an' : ''}"><td>${f.numero}</td><td>${f.emision}</td><td>${esc(f.hora)}</td><td>${esc(f.nombre)}</td><td class="det">${esc(f.detalle)}</td><td class="n">${f$(f.sub)}</td><td class="n">${f$(f.itbms)}</td><td class="n">${f$(f.total)}</td><td>${esc(f.pago)}</td></tr>`).join('') || '<tr><td colspan="9">Sin ventas</td></tr>'}
  </tbody><tfoot><tr><td colspan="5" class="n">Total =</td><td class="n">${f$(m.sub)}</td><td class="n">${f$(m.itbms)}</td><td class="n">${f$(m.total)}</td><td></td></tr></tfoot></table>
  <div class="resgrid">
    <div><h2>Por tipo de pago</h2><table><tbody>${m.pagos.map(x => `<tr><td>${x[0]}</td><td class="n">${x[1]}</td><td class="n">${f$(x[2])}</td></tr>`).join('')}<tr class="tot"><td>Total</td><td class="n">${m.n}</td><td class="n">${f$(m.total)}</td></tr></tbody></table></div>
    <div><h2>Páginas a color</h2><table><thead><tr><th></th><th class="n">Carta</th><th class="n">Legal</th><th class="n">Otro</th><th class="n">Total</th></tr></thead><tbody>${m.pag.map((x, i) => `<tr class="${i === 2 ? 'tot' : ''}">${x.map((v, j) => `<td class="${j ? 'n' : ''}">${j ? int(v) : v}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    ${m.cierre ? `<div><h2>Cierre del día</h2><table><tbody>${m.cierre.map(([a, b]) => `<tr><td>${esc(a)}</td><td class="n">${esc(b)}</td></tr>`).join('')}</tbody></table></div>` : ''}
  </div>
  ${m.dias && m.dias.length ? `<h2>${p.porMes ? 'Por mes' : 'Por día'}</h2><table><thead><tr><th>${p.porMes ? 'Mes' : 'Día'}</th><th class="n">Ventas</th><th class="n">Páginas</th><th class="n">Subtotal</th><th class="n">${tasa()}</th><th class="n">Total</th></tr></thead><tbody>${m.dias.map(d => `<tr><td>${esc(d[0])}</td><td class="n">${d[1]}</td><td class="n">${int(d[2])}</td><td class="n">${f$(d[3])}</td><td class="n">${f$(d[4])}</td><td class="n">${f$(d[5])}</td></tr>`).join('')}</tbody></table>` : ''}
  </div>`;
  document.getElementById('print').innerHTML = h;
  setTimeout(() => window.print(), 50);
}
