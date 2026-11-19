import { S } from './store.js';
import { toast } from './ui/dom.js';
import { esc, dmy, money, int, cap, fechaCorta, MESES, METODOS, TIPOS, itemLabel, pagTipo, pagTotal, analizarCierre, sumDays, pad } from './util.js';

/* ---------- modelo común para Excel e impresión ---------- */
function modelo(p) {
  const s = p.stats;
  const vendidas = p.sales.filter(v => !v.anulada).sort((a, b) => a.ts - b.ts);
  const anuladas = p.sales.length - vendidas.length;
  const lineas = [];
  vendidas.forEach((v, i) => v.items.forEach((it, j) => lineas.push({
    n: i + 1, first: j === 0, fecha: dmy(v.fecha), hora: v.hora, cliente: v.client_name || '', venta: itemLabel(it),
    cant: it.cant, precio: it.precio_cents / 100, monto: it.sub_cents / 100, total: j === 0 ? v.total_cents / 100 : null, pago: METODOS[v.metodo],
  })));
  const pag = [
    ['Impresiones', s.pag.imp.carta, s.pag.imp.legal, s.pag.imp.otro, pagTipo(s, 'imp')],
    ['Copias', s.pag.cop.carta, s.pag.cop.legal, s.pag.cop.otro, pagTipo(s, 'cop')],
    ['Total', s.pag.imp.carta + s.pag.cop.carta, s.pag.imp.legal + s.pag.cop.legal, s.pag.imp.otro + s.pag.cop.otro, pagTotal(s)],
  ];
  const pagos = Object.keys(METODOS).map(k => [METODOS[k], s.met[k].n, s.met[k].t / 100]);
  pagos.push(['Total', s.n, s.total / 100]);

  let cierre = null;
  if (!p.multiDay) {
    const c = p.closings[p.from];
    if (c) {
      const a = analizarCierre(c, s);
      cierre = [];
      if (c.inicio != null) cierre.push(['Contador al abrir', c.inicio, 'n']);
      if (c.fin != null) cierre.push(['Contador al cerrar', c.fin, 'n']);
      if (a.maq != null) cierre.push(['Páginas según máquina', a.maq, 'n'], ['Páginas cobradas', pagTotal(s), 'n'], ['Diferencia', a.dif, 'n']);
      if (a.difFiery != null) cierre.push(['Páginas color Fiery', c.fiery, 'n'], ['Impresiones cobradas', pagTipo(s, 'imp'), 'n'], ['Diferencia Fiery', a.difFiery, 'n']);
      if (a.difEf != null) cierre.push(['Efectivo en caja', c.efectivo_cents / 100, '$'], ['Efectivo registrado', s.met.efectivo.t / 100, '$'], ['Diferencia efectivo', a.difEf / 100, '$']);
      if (c.nota) cierre.push(['Nota', c.nota, 't']);
      if (!cierre.length) cierre = null;
    }
  }

  let detalle = null;
  if (p.multiDay) {
    const days = p.days || {};
    if (p.porMes) {
      const y = p.from.slice(0, 4);
      detalle = MESES.map((m, i) => {
        const k = `${y}-${pad(i + 1)}`;
        const d = sumDays(Object.keys(days).filter(f => f.startsWith(k)).map(f => days[f]));
        return d.n ? [cap(m), pagTotal(d), d.met.efectivo.t / 100, d.met.tarjeta.t / 100, d.met.yappy.t / 100, d.total / 100, null] : null;
      }).filter(Boolean);
    } else {
      detalle = Object.keys(days).sort().filter(f => days[f].n).map(f => {
        const d = days[f], a = analizarCierre(p.closings[f], d);
        return [cap(fechaCorta(f)), pagTotal(d), d.met.efectivo.t / 100, d.met.tarjeta.t / 100, d.met.yappy.t / 100, d.total / 100, a.maq != null ? a.dif : null];
      });
    }
  }
  return { lineas, pag, pagos, cierre, detalle, anuladas, meta: p.meta / 100, vendido: s.total / 100 };
}

const ahora = () => { const d = new Date(); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

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

const MONEY = '"$"#,##0.00';
const GRIS = 'FF8A8A8A';
const thin = c => ({ style: 'thin', color: { argb: c } });

function hojaBase(wb, nombre, negocio, cols, headerRow) {
  const ws = wb.addWorksheet(nombre, {
    pageSetup: {
      paperSize: 1, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.25, footer: 0.3 },
      ...(headerRow ? { printTitlesRow: `${headerRow}:${headerRow}` } : {}),
    },
    headerFooter: { oddFooter: `&L&8${negocio.replace(/&/g, '&&')}&R&8Página &P de &N` },
    views: headerRow ? [{ state: 'frozen', ySplit: headerRow, showGridLines: false }] : [{ showGridLines: false }],
  });
  ws.columns = cols.map(w => ({ width: w }));
  return ws;
}

function titulos(ws, negocio, linea2, ncols) {
  const last = String.fromCharCode(64 + ncols);
  ws.mergeCells(`A1:${last}1`); ws.mergeCells(`A2:${last}2`); ws.mergeCells(`A3:${last}3`);
  ws.getCell('A1').value = negocio; ws.getCell('A1').font = { bold: true, size: 14 };
  ws.getCell('A2').value = linea2; ws.getCell('A2').font = { size: 11 };
  ws.getCell('A3').value = 'Generado ' + ahora(); ws.getCell('A3').font = { size: 9, color: { argb: GRIS } };
}

function encabezado(row) {
  row.eachCell(c => {
    c.font = { bold: true, size: 10 };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFECE5' } };
    c.border = { bottom: thin('FF16161A') };
    c.alignment = { vertical: 'middle', wrapText: true };
  });
  row.height = 18;
}

/** Tabla simple en la hoja Resumen. kinds: 't' texto, 'n' número, '$' dinero, '%' */
function tabla(ws, startRow, titulo, header, rows, kinds, totalLast = false) {
  let r = startRow;
  ws.getCell(`A${r}`).value = titulo; ws.getCell(`A${r}`).font = { bold: true, size: 11 };
  r++;
  if (header) {
    const hr = ws.getRow(r); hr.values = header; encabezado(hr);
    header.forEach((_, i) => { if (i > 0) hr.getCell(i + 1).alignment = { horizontal: 'right' }; });
    r++;
  }
  rows.forEach((vals, idx) => {
    const row = ws.getRow(r);
    row.values = vals;
    vals.forEach((v, i) => {
      const c = row.getCell(i + 1), k = Array.isArray(kinds) ? kinds[i] : kinds(idx, i);
      c.font = { size: 10, bold: totalLast && idx === rows.length - 1 };
      if (k === '$') c.numFmt = MONEY;
      if (k === '%') c.numFmt = '0.0%';
      if (k === 'n') c.numFmt = '#,##0';
      if (i > 0 && k !== 't') c.alignment = { horizontal: 'right' };
      c.border = totalLast && idx === rows.length - 1 ? { top: thin('FF16161A') } : { bottom: thin('FFE3E0D8') };
    });
    r++;
  });
  return r + 1;
}

export async function exportExcel(p) {
  let ExcelJS;
  try { ExcelJS = await loadExcelJS(); } catch (e) { return toast(e.message, true); }
  const m = modelo(p), negocio = S.account.business || 'Mi negocio';
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Color'; wb.created = new Date();

  /* Hoja Ventas */
  const conFecha = p.multiDay;
  const head = conFecha
    ? ['N°', 'Fecha', 'Hora', 'Cliente / empresa', 'Venta', 'Cant.', 'P. unit.', 'Monto', 'Total venta', 'Pago']
    : ['N°', 'Hora', 'Cliente / empresa', 'Venta', 'Cant.', 'P. unit.', 'Monto', 'Total venta', 'Pago'];
  const widths = conFecha ? [5, 10.5, 6.5, 20, 16, 6.5, 8.5, 9.5, 11, 10] : [5, 6.5, 24, 17, 6.5, 8.5, 9.5, 11, 10];
  const ws = hojaBase(wb, 'Ventas', negocio, widths, 5);
  titulos(ws, negocio, `${p.titulo} · ${p.periodo}`, head.length);
  const hr = ws.getRow(5); hr.values = head; encabezado(hr);
  const col = name => head.indexOf(name) + 1;
  const numCols = ['Cant.', 'P. unit.', 'Monto', 'Total venta'].map(col);
  numCols.forEach(i => { hr.getCell(i).alignment = { horizontal: 'right', vertical: 'middle' }; });
  hr.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  hr.getCell(col('Pago')).alignment = { horizontal: 'left', indent: 1, vertical: 'middle' };
  let r = 6;
  for (const l of m.lineas) {
    const vals = conFecha ? [l.n, l.fecha, l.hora, l.cliente, l.venta, l.cant, l.precio, l.monto, l.total, l.pago] : [l.n, l.hora, l.cliente, l.venta, l.cant, l.precio, l.monto, l.total, l.pago];
    const row = ws.getRow(r); row.values = vals;
    const shade = l.n % 2 === 0;
    row.eachCell({ includeEmpty: true }, (c, i) => {
      c.font = { size: 10, color: !l.first && ['N°', 'Fecha', 'Hora', 'Cliente / empresa', 'Pago'].includes(head[i - 1]) ? { argb: 'FFB0B0B0' } : undefined };
      c.border = { bottom: thin('FFE3E0D8') };
      if (shade) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F7F3' } };
    });
    [col('P. unit.'), col('Monto'), col('Total venta')].forEach(i => { ws.getCell(r, i).numFmt = MONEY; });
    ws.getCell(r, col('Cant.')).numFmt = '#,##0';
    ws.getCell(r, 1).alignment = { horizontal: 'center' };
    ws.getCell(r, col('Pago')).alignment = { horizontal: 'left', indent: 1 };
    if (l.total != null) ws.getCell(r, col('Total venta')).font = { size: 10, bold: true };
    r++;
  }
  const last = r - 1;
  const tr = ws.getRow(r);
  tr.getCell(col('Venta')).value = 'TOTAL';
  const L = i => String.fromCharCode(64 + i);
  if (m.lineas.length) {
    tr.getCell(col('Cant.')).value = { formula: `SUM(${L(col('Cant.'))}6:${L(col('Cant.'))}${last})`, result: m.lineas.reduce((a, b) => a + b.cant, 0) };
    tr.getCell(col('Monto')).value = { formula: `SUM(${L(col('Monto'))}6:${L(col('Monto'))}${last})`, result: m.vendido };
    tr.getCell(col('Total venta')).value = { formula: `SUM(${L(col('Total venta'))}6:${L(col('Total venta'))}${last})`, result: m.vendido };
  } else {
    ws.getCell(6, 1).value = 'Sin ventas en este periodo';
  }
  tr.eachCell({ includeEmpty: true }, c => { c.font = { bold: true, size: 10 }; c.border = { top: thin('FF16161A') }; });
  tr.getCell(col('Cant.')).numFmt = '#,##0';
  [col('Monto'), col('Total venta')].forEach(i => { tr.getCell(i).numFmt = MONEY; });
  ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: head.length } };

  /* Hoja Resumen */
  const rs = hojaBase(wb, 'Resumen', negocio, [22, 11, 11, 11, 11, 12, 10], null);
  titulos(rs, negocio, `Resumen · ${p.periodo}`, 7);
  let row = 5;
  row = tabla(rs, row, 'Páginas a color', ['', 'Carta', 'Legal', 'Otro', 'Total'], m.pag, ['t', 'n', 'n', 'n', 'n'], true);
  row = tabla(rs, row, 'Pagos', ['Método', 'Ventas', 'Monto'], m.pagos, ['t', 'n', '$'], true);
  row = tabla(rs, row, 'Meta', null, [['Meta del periodo', m.meta], ['Vendido', m.vendido], ['Cumplimiento', m.meta ? m.vendido / m.meta : 0]], (i) => ['t', i === 2 ? '%' : '$']);
  if (m.anuladas) { rs.getCell(`A${row - 1}`).value = `Ventas anuladas (no incluidas): ${m.anuladas}`; rs.getCell(`A${row - 1}`).font = { size: 9, color: { argb: GRIS } }; row++; }
  if (m.cierre) row = tabla(rs, row, 'Cierre del día', null, m.cierre.map(([a, b]) => [a, b]), (i) => ['t', m.cierre[i][2]]);
  if (m.detalle && m.detalle.length) {
    const sum = k => m.detalle.reduce((a, b) => a + (b[k] || 0), 0);
    const rowsD = [...m.detalle.map(d => p.porMes ? d.slice(0, 6) : d), ['Total', sum(1), sum(2), sum(3), sum(4), sum(5)]];
    row = tabla(rs, row, p.porMes ? 'Detalle por mes' : 'Detalle por día', ['Fecha', 'Págs', 'Efectivo', 'Tarjeta', 'Yappy', 'Total', ...(p.porMes ? [] : ['Dif. máq.'])], rowsD, ['t', 'n', '$', '$', '$', '$', 'n'], true);
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
  const f$ = v => v == null ? '' : money(Math.round(v * 100));
  const t = (head, rows, kinds, totalLast) => `<table><thead><tr>${head.map((h, i) => `<th class="${i && kinds[i] !== 't' ? 'n' : ''}">${esc(h)}</th>`).join('')}</tr></thead><tbody>
    ${rows.map((r, ri) => `<tr class="${totalLast && ri === rows.length - 1 ? 'tot' : ''}">${r.map((v, i) => `<td class="${i && kinds[i] !== 't' ? 'n' : ''}">${kinds[i] === '$' ? f$(v) : kinds[i] === 'n' ? (v == null ? '' : int(v)) : esc(v ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  let h = `<h1>${esc(negocio)}</h1><div class="meta">${esc(p.titulo)} · ${esc(p.periodo)} · Generado ${ahora()}</div>`;
  h += `<div class="two"><div><h2>Páginas a color</h2>${t(['', 'Carta', 'Legal', 'Otro', 'Total'], m.pag, ['t', 'n', 'n', 'n', 'n'], true)}</div>
        <div><h2>Pagos</h2>${t(['Método', 'Ventas', 'Monto'], m.pagos, ['t', 'n', '$'], true)}
        <div class="meta" style="margin-top:6px">Meta ${f$(m.meta)} · Vendido ${f$(m.vendido)} · ${m.meta ? (m.vendido / m.meta * 100).toFixed(1) : 0}%${m.anuladas ? ` · Anuladas: ${m.anuladas}` : ''}</div></div></div>`;
  if (m.cierre) h += `<h2>Cierre del día</h2>${t(['Concepto', 'Valor'], m.cierre.map(([a, b, k]) => [a, k === '$' ? f$(b) : k === 'n' ? int(b) : b]), ['t', 'x'])}`;
  if (m.detalle && m.detalle.length) {
    const sum = k => m.detalle.reduce((a, b) => a + (b[k] || 0), 0);
    const rows = [...m.detalle.map(d => p.porMes ? d.slice(0, 6) : d), ['Total', sum(1), sum(2), sum(3), sum(4), sum(5), ...(p.porMes ? [] : [null])]];
    h += `<h2>${p.porMes ? 'Detalle por mes' : 'Detalle por día'}</h2>${t(['Fecha', 'Págs', 'Efectivo', 'Tarjeta', 'Yappy', 'Total', ...(p.porMes ? [] : ['Dif. máq.'])], rows, ['t', 'n', '$', '$', '$', '$', 'n'], true)}`;
  }
  const head = p.multiDay ? ['N°', 'Fecha', 'Hora', 'Cliente', 'Venta', 'Cant.', 'P. unit.', 'Monto', 'Total', 'Pago'] : ['N°', 'Hora', 'Cliente', 'Venta', 'Cant.', 'P. unit.', 'Monto', 'Total', 'Pago'];
  const kinds = p.multiDay ? ['n', 't', 't', 't', 't', 'n', '$', '$', '$', 't'] : ['n', 't', 't', 't', 'n', '$', '$', '$', 't'];
  const rows = m.lineas.map(l => {
    const base = l.first ? [l.n, ...(p.multiDay ? [l.fecha] : []), l.hora, l.cliente] : [null, ...(p.multiDay ? [''] : []), '', ''];
    return [...base, l.venta, l.cant, l.precio, l.monto, l.total, l.first ? l.pago : ''];
  });
  rows.push([...Array(p.multiDay ? 4 : 3).fill(null), 'TOTAL', m.lineas.reduce((a, b) => a + b.cant, 0), null, m.vendido, m.vendido, '']);
  h += `<h2>Ventas</h2>${m.lineas.length ? t(head, rows, kinds, true) : '<div class="meta">Sin ventas</div>'}`;
  const box = document.getElementById('print');
  box.innerHTML = h;
  setTimeout(() => window.print(), 50);
}
