import { S } from './store.js';
import { toast } from './ui/dom.js';
import { esc, dmy, money, int, cap, fechaCorta, MESES, METODOS, sumDays, pad, prodList, fmtCant, itemLabel } from './util.js';
import { numOrden } from './workorder.js';

/* ---------- modelo común para Excel e impresión ---------- */
const prodName = it => (it.tipo === 'imp' || it.tipo === 'cop') ? `${it.tipo === 'imp' ? 'Impresión' : 'Copia'} a color` : it.nombre;
const tamName = it => (it.tipo === 'imp' || it.tipo === 'cop') ? ({ carta: 'Carta 8.5 x 11', legal: 'Legal 8.5 x 14' }[it.tam] || it.nombre) : (it.tam || '');
const pagoTxt = v => v.anulada || v.estado === 'anulada' ? 'ANULADA' : v.estado === 'pendiente' ? 'PENDIENTE' : `${METODOS[v.metodo]}${v.pagada_fecha && v.pagada_fecha !== v.fecha ? ` (${dmy(v.pagada_fecha).slice(0, 5)})` : ''}`;

function modelo(p) {
  const s = p.stats;
  const ordenes = p.sales.slice().sort((a, b) => a.ts - b.ts).map(v => {
    const anul = v.anulada || v.estado === 'anulada';
    return {
      numero: numOrden(v.numero ?? v.numero_anulado), fecha: `${dmy(v.fecha)} ${v.hora}`, cliente: v.client_name || 'CONTADO',
      operador: v.operador && v.operador !== 'Job Log' ? v.operador : '', anul, pago: pagoTxt(v),
      sub: anul ? null : v.subtotal_cents / 100, itbms: anul ? null : (v.itbms_cents || 0) / 100, total: anul ? null : v.total_cents / 100,
      lineas: v.items.map(it => ({ prod: prodName(it) + (it.extra ? ` (${it.extra})` : ''), tam: tamName(it), cant: it.cant, cantTxt: fmtCant(it.cant, it.unidad), importe: anul ? null : it.sub_cents / 100 })),
    };
  });
  const validas = ordenes.filter(o => !o.anul);
  const tot = k => validas.reduce((a, o) => a + (o[k] || 0), 0);
  const cobros = Object.keys(METODOS).map(k => [METODOS[k], s.met[k].n, s.met[k].t / 100]);
  const prods = prodList(s).map(x => [x.label, fmtCant(x.cant, x.unidad), x.monto / 100]);
  const maquinas = Object.entries(s.maq || {}).map(([k, x]) => [(S.settings.maquinas.find(m => m.id === k) || {}).nombre || k, x.color, x.bn]);
  const cierre = null;
  let dias = null;
  if (p.multiDay) {
    const days = p.days || {};
    if (p.porMes) {
      const y = p.from.slice(0, 4);
      dias = MESES.map((m, i) => { const d = sumDays(Object.keys(days).filter(f => f.startsWith(`${y}-${pad(i + 1)}`)).map(f => days[f])); return d.n || d.cobrado ? [cap(m), d.n, d.colorPags, d.met.efectivo.t / 100, d.met.tarjeta.t / 100, d.met.yappy.t / 100, d.cobrado / 100] : null; }).filter(Boolean);
    } else {
      dias = Object.keys(days).sort().filter(f => days[f].n || days[f].cobrado).map(f => { const d = days[f]; return [cap(fechaCorta(f)), d.n, d.colorPags, d.met.efectivo.t / 100, d.met.tarjeta.t / 100, d.met.yappy.t / 100, d.cobrado / 100]; });
    }
  }
  const previos = (p.cobrosPrev || []).map(v => [numOrden(v.numero), `${dmy(v.fecha)}`, v.client_name || 'CONTADO', METODOS[v.metodo], v.total_cents / 100]);
  return {
    ordenes, cobros, prods, maquinas, cierre, dias, previos,
    sub: tot('sub'), itbms: tot('itbms'), total: tot('total'),
    totales: [
      ['Órdenes', String(validas.length)], ['Subtotal', money(s.sub)], [tasa(), money(s.itbms)], ['Total de órdenes', money(s.total)],
      ['Cobrado', money(s.cobrado)], ['Por cobrar (pendientes)', `${money(s.pendT)} · ${s.pendN} órdenes`],
      ['Páginas a color', int(s.colorPags)], ['Páginas / hojas B/N', int(s.bnPags)]
    ],
  };
}

const ahora = () => { const d = new Date(); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const tasa = () => `ITBMS ${S.settings?.itbms?.tasa ?? 7}%`;
const empresaTxt = () => { const e = S.settings?.empresa || {}; return [e.telefono && `Tel. ${e.telefono}`, e.correo].filter(Boolean).join(' · '); };

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
const GRID = { style: 'thin', color: { argb: 'FF9A968E' } };
const BORDER = { top: GRID, left: GRID, bottom: GRID, right: GRID };
const HEADFILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFECE5' } };

function hoja(wb, nombre, negocio, widths, { landscape = false, titleRow = null } = {}) {
  const ws = wb.addWorksheet(nombre, {
    pageSetup: {
      paperSize: 1, orientation: landscape ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true,
      margins: { left: 0.35, right: 0.35, top: 0.45, bottom: 0.55, header: 0.2, footer: 0.25 },
      ...(titleRow ? { printTitlesRow: `${titleRow}:${titleRow}` } : {}),
    },
    headerFooter: { oddFooter: `&L&9${negocio.replace(/&/g, '&&')}&R&9Página &P de &N` },
    views: [{ showGridLines: false, ...(titleRow ? { state: 'frozen', ySplit: titleRow } : {}) }],
  });
  ws.columns = widths.map(w => ({ width: w }));
  return ws;
}
function titulos(ws, ncols, negocio, linea2) {
  for (let r = 1; r <= 3; r++) ws.mergeCells(r, 1, r, ncols);
  ws.getCell('A1').value = negocio; ws.getCell('A1').font = { bold: true, size: 16 };
  ws.getCell('A2').value = `${linea2}`; ws.getCell('A2').font = { bold: true, size: 12 };
  ws.getCell('A3').value = `${empresaTxt()}${empresaTxt() ? ' · ' : ''}Generado ${ahora()}`; ws.getCell('A3').font = { size: 10, color: { argb: 'FF6B6B73' } };
}
function celda(c, { bold = false, size = 11, fmt, right = false, fill, wrap = true, grey = false } = {}) {
  c.font = { bold, size, color: grey ? { argb: 'FF9A9A9A' } : undefined };
  c.border = BORDER;
  c.alignment = { vertical: 'top', horizontal: right ? 'right' : 'left', wrapText: wrap };
  if (fmt) c.numFmt = fmt;
  if (fill) c.fill = fill;
}

/** Tabla con bordes en todas las celdas. kinds: 't' texto, 'n' número, '$' dinero */
function tabla(ws, r, c0, titulo, head, rows, kinds, { totalLast = false, size = 12 } = {}) {
  ws.getCell(r, c0).value = titulo; ws.getCell(r, c0).font = { bold: true, size: size + 1 }; r++;
  if (head) { head.forEach((h, j) => { const c = ws.getCell(r, c0 + j); c.value = h; celda(c, { bold: true, size, fill: HEADFILL, right: j > 0 && kinds[j] !== 't' }); }); r++; }
  rows.forEach((row, i) => {
    const last = totalLast && i === rows.length - 1;
    row.forEach((v, j) => { const c = ws.getCell(r, c0 + j); c.value = v; celda(c, { bold: last, size, right: j > 0 && kinds[j] !== 't', fmt: kinds[j] === '$' ? MONEY : kinds[j] === 'n' ? '#,##0' : undefined, fill: last ? HEADFILL : undefined }); });
    r++;
  });
  return r + 1;
}

export async function exportExcel(p) {
  let ExcelJS;
  try { ExcelJS = await loadExcelJS(); } catch (e) { return toast(e.message, true); }
  const m = modelo(p), negocio = S.account.business || 'Mi negocio';
  const wb = new ExcelJS.Workbook(); wb.creator = 'Color'; wb.created = new Date();
  const linea2 = `${p.titulo} · ${p.periodo}`;

  /* Resumen: letra grande, vertical */
  const rs = hoja(wb, 'Resumen', negocio, [58, 22, 24, 20]);
  titulos(rs, 4, negocio, linea2);
  let r = 5;
  r = tabla(rs, r, 1, 'Totales', null, m.totales, ['t', 't']);
  r = tabla(rs, r, 1, 'Cobros por método de pago', ['Método', 'Cobros', 'Monto'], [...m.cobros, ['Total cobrado', m.cobros.reduce((a, x) => a + x[1], 0), m.cobros.reduce((a, x) => a + x[2], 0)]], ['t', 'n', '$'], { totalLast: true });
  if (m.prods.length) r = tabla(rs, r, 1, 'Productos y servicios', ['Producto o servicio · tamaño', 'Cantidad', 'Monto'], [...m.prods, ['Total (sin ITBMS)', '', m.prods.reduce((a, x) => a + x[2], 0)]], ['t', 't', '$'], { totalLast: true });
  if (m.maquinas.length) r = tabla(rs, r, 1, 'Registros de máquinas', ['Máquina', 'Págs color', 'Págs B/N'], m.maquinas, ['t', 'n', 'n']);
  if (m.cierre) r = tabla(rs, r, 1, 'Cierre del día', null, m.cierre, ['t', 't']);
  if (m.previos.length) r = tabla(rs, r, 1, 'Cobros de órdenes de días anteriores', ['N.º · cliente', 'Creada', 'Pago', 'Monto'], m.previos.map(x => [`${x[0]} · ${x[2]}`, x[1], x[3], x[4]]), ['t', 't', 't', '$']);

  /* Órdenes: una fila por producto, datos de la orden combinados */
  const head = ['N.º', 'Fecha y hora', 'Cliente', 'Producto o servicio', 'Tamaño', 'Cant.', 'Importe', tasa(), 'Total orden', 'Pago'];
  const ws = hoja(wb, 'Órdenes', negocio, [9, 18, 26, 36, 22, 9, 12, 11, 13, 16], { landscape: true, titleRow: 5 });
  titulos(ws, head.length, negocio, linea2);
  head.forEach((h, j) => celda(ws.getCell(5, j + 1), { bold: true, fill: HEADFILL, right: j >= 5 && j <= 8 }));
  ws.getRow(5).values = head;
  head.forEach((h, j) => celda(ws.getCell(5, j + 1), { bold: true, fill: HEADFILL, right: j >= 5 && j <= 8 }));
  r = 6;
  const first = r;
  for (const o of m.ordenes) {
    const r0 = r;
    o.lineas.forEach(l => {
      const row = ws.getRow(r);
      row.getCell(4).value = l.prod; row.getCell(5).value = l.tam; row.getCell(6).value = l.cant; row.getCell(7).value = l.importe;
      r++;
    });
    const r1 = r - 1;
    const vals = { 1: o.numero, 2: o.fecha, 3: o.cliente, 8: o.itbms, 9: o.total, 10: o.pago };
    for (const [col, v] of Object.entries(vals)) { ws.getCell(r0, Number(col)).value = v; if (r1 > r0) ws.mergeCells(r0, Number(col), r1, Number(col)); }
    for (let rr = r0; rr <= r1; rr++) for (let j = 1; j <= 10; j++) {
      celda(ws.getCell(rr, j), { size: 11, right: j >= 6 && j <= 9, fmt: j === 6 ? '#,##0.##' : (j >= 7 && j <= 9 ? MONEY : undefined), grey: o.anul, bold: j === 9 });
    }
  }
  if (!m.ordenes.length) { ws.getCell(r, 1).value = 'Sin órdenes en este periodo'; r++; }
  const last = r - 1;
  ws.getCell(r, 4).value = 'TOTAL';
  if (m.ordenes.length) {
    ws.getCell(r, 7).value = { formula: `SUM(G${first}:G${last})`, result: m.sub };
    ws.getCell(r, 8).value = { formula: `SUM(H${first}:H${last})`, result: m.itbms };
    ws.getCell(r, 9).value = { formula: `SUM(I${first}:I${last})`, result: m.total };
  }
  for (let j = 1; j <= 10; j++) celda(ws.getCell(r, j), { bold: true, size: 12, fill: HEADFILL, right: j >= 6 && j <= 9, fmt: j >= 7 && j <= 9 ? MONEY : undefined });

  if (m.dias && m.dias.length) {
    const wd = hoja(wb, p.porMes ? 'Por mes' : 'Por día', negocio, [18, 11, 12, 14, 14, 14, 15], { titleRow: 5 });
    titulos(wd, 7, negocio, linea2);
    const sum = k => m.dias.reduce((a, b) => a + b[k], 0);
    tabla(wd, 4, 1, p.porMes ? 'Detalle por mes' : 'Detalle por día', [p.porMes ? 'Mes' : 'Día', 'Órdenes', 'Págs color', 'Efectivo', 'Tarjeta', 'Yappy', 'Cobrado'],
      [...m.dias, ['Total', sum(1), sum(2), sum(3), sum(4), sum(5), sum(6)]], ['t', 'n', 'n', '$', '$', '$', '$'], { totalLast: true });
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
  const tbl = (titulo, head, rows, kinds, totalLast = false) => `<div class="blk"><h2>${esc(titulo)}</h2><table class="grid">
    ${head ? `<thead><tr>${head.map((h, i) => `<th class="${i && kinds[i] !== 't' ? 'n' : ''}">${esc(h)}</th>`).join('')}</tr></thead>` : ''}
    <tbody>${rows.map((row, ri) => `<tr class="${totalLast && ri === rows.length - 1 ? 'tot' : ''}">${row.map((v, i) => `<td class="${i && kinds[i] !== 't' ? 'n' : ''}">${kinds[i] === '$' ? f$(v) : kinds[i] === 'n' ? int(v) : esc(v ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  let h = `<div class="rep">
  <div class="rep-h"><div><h1>${esc(negocio)}</h1><div class="meta">${esc(empresaTxt())}</div></div><div class="rep-t"><b>${esc(p.titulo)}</b><div>${esc(p.periodo)}</div><div class="meta">Generado ${ahora()}</div></div></div>
  <div class="sumgrid">
    ${tbl('Totales', null, m.totales, ['t', 't'])}
    ${tbl('Cobros por método de pago', ['Método', 'Cobros', 'Monto'], [...m.cobros, ['Total cobrado', m.cobros.reduce((a, x) => a + x[1], 0), m.cobros.reduce((a, x) => a + x[2], 0)]], ['t', 'n', '$'], true)}
  </div>
  ${m.prods.length ? tbl('Productos y servicios', ['Producto o servicio · tamaño', 'Cantidad', 'Monto'], [...m.prods, ['Total (sin ITBMS)', '', m.prods.reduce((a, x) => a + x[2], 0)]], ['t', 't', '$'], true) : ''}
  <div class="sumgrid">
    ${m.maquinas.length ? tbl('Registros de máquinas', ['Máquina', 'Págs color', 'Págs B/N'], m.maquinas, ['t', 'n', 'n']) : ''}
    ${m.cierre ? tbl('Cierre del día', null, m.cierre, ['t', 't']) : ''}
  </div>
  ${m.previos.length ? tbl('Cobros de órdenes de días anteriores', ['N.º', 'Creada', 'Cliente', 'Pago', 'Monto'], m.previos, ['t', 't', 't', 't', '$']) : ''}
  ${m.dias && m.dias.length ? tbl(p.porMes ? 'Detalle por mes' : 'Detalle por día', [p.porMes ? 'Mes' : 'Día', 'Órdenes', 'Págs color', 'Efectivo', 'Tarjeta', 'Yappy', 'Cobrado'],
    [...m.dias, ['Total', ...[1, 2, 3, 4, 5, 6].map(k => m.dias.reduce((a, b) => a + b[k], 0))]], ['t', 'n', 'n', '$', '$', '$', '$'], true) : ''}
  </div>
  <div class="rep lst">
    <h2>Órdenes · ${esc(p.periodo)}</h2>
    <table class="grid ord"><thead><tr><th>N.º</th><th>Fecha y hora</th><th>Cliente</th><th>Producto o servicio</th><th>Tamaño</th><th class="n">Cant.</th><th class="n">Importe</th><th class="n">${tasa()}</th><th class="n">Total</th><th>Pago</th></tr></thead>
    <tbody>${m.ordenes.map(o => o.lineas.map((l, i) => `<tr class="${o.anul ? 'an' : ''}">
      ${i === 0 ? `<td rowspan="${o.lineas.length}">${o.numero}</td><td rowspan="${o.lineas.length}">${esc(o.fecha)}</td><td rowspan="${o.lineas.length}">${esc(o.cliente)}</td>` : ''}
      <td>${esc(l.prod)}</td><td>${esc(l.tam)}</td><td class="n">${esc(l.cantTxt)}</td><td class="n">${f$(l.importe)}</td>
      ${i === 0 ? `<td class="n" rowspan="${o.lineas.length}">${f$(o.itbms)}</td><td class="n" rowspan="${o.lineas.length}"><b>${f$(o.total)}</b></td><td rowspan="${o.lineas.length}">${esc(o.pago)}</td>` : ''}
    </tr>`).join('')).join('') || '<tr><td colspan="10">Sin órdenes</td></tr>'}</tbody>
    <tfoot><tr class="tot"><td colspan="6" class="n">TOTAL</td><td class="n">${f$(m.sub)}</td><td class="n">${f$(m.itbms)}</td><td class="n">${f$(m.total)}</td><td></td></tr></tfoot></table>
  </div>`;
  document.getElementById('print').innerHTML = h;
  setTimeout(() => window.print(), 50);
}
export { itemLabel };
