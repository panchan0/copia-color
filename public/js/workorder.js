import { S } from './store.js';
import { docAssets } from './assets.js';
import { toast, ICON } from './ui/dom.js';
import { openMenu } from './ui/menu.js';
import { esc, money, dmy, METODOS, fmtCant, opTexto, numOrdenTxt } from './util.js';

export const numOrden = n => String(n ?? 0).padStart(6, '0');
const numDe = v => numOrdenTxt(v);
const tasaTxt = () => `ITBMS ${S.settings?.itbms?.tasa ?? 7}%`;
const prod = it => (it.tipo === 'imp' || it.tipo === 'cop') ? `${it.tipo === 'imp' ? 'Impresión' : 'Copia'} a color` : it.nombre;
const tam = it => (it.tipo === 'imp' || it.tipo === 'cop') ? ({ carta: 'Carta 8.5 x 11', legal: 'Legal 8.5 x 14' }[it.tam] || it.nombre) : (it.tam || '—');
function estado(v) {
  if (v.anulada || v.estado === 'anulada') return { t: 'ANULADA', d: '' };
  if (v.estado === 'pendiente') return { t: 'PENDIENTE DE PAGO', d: '' };
  return { t: 'PAGADA', d: `${METODOS[v.metodo] || ''} · ${v.pagada_fecha ? dmy(v.pagada_fecha) : ''} ${v.pagada_hora || ''}`.trim() };
}
const opTxt = v => opTexto(v, S.settings.operadores) || '—';
function empresa() {
  const e = S.settings?.empresa || {};
  return { nombre: S.account.business, tel: e.telefono, correo: e.correo, dir: e.direccion, ruc: e.ruc, logo: e.logo || '' };
}

/** Sello según el estado: imagen subida o sello de texto. */
function sello(v, a) {
  if (v.anulada || v.estado === 'anulada') return { txt: 'ANULADO' };
  if (v.estado === 'pendiente') return a.sello_pendiente ? { img: a.sello_pendiente } : { txt: 'PENDIENTE' };
  return a.sello_pagado ? { img: a.sello_pagado } : { txt: 'CANCELADO' };
}
const imgDims = src => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok({ w: i.width, h: i.height }); i.onerror = ko; i.src = src; });

/* ---------- impresión ---------- */
export async function imprimirOrden(v) {
  const e = empresa(), st = estado(v), a = await docAssets(), se = sello(v, a);
  const box = document.getElementById('print');
  box.innerHTML = `<div class="wo">
    <div class="wo-h">
      <div class="wo-emp">
        ${a.logo_doc ? `<img class="wo-logodoc" src="${esc(a.logo_doc)}" alt="${esc(e.nombre)}">` : `<div class="wo-neg">${esc(e.nombre)}</div>`}
        ${e.dir ? `<div>${esc(e.dir)}</div>` : ''}
        <div>${[e.tel && `Tel. ${esc(e.tel)}`, e.correo && esc(e.correo)].filter(Boolean).join(' · ')}</div>
        ${e.ruc ? `<div>RUC ${esc(e.ruc)}</div>` : ''}
      </div>
      <div class="wo-tit">
        <div class="wo-label">ORDEN DE TRABAJO</div>
        <table class="wo-meta">
          <tr><th>N.º de orden</th><td><b>${numDe(v)}</b></td></tr>
          <tr><th>Fecha</th><td>${dmy(v.fecha)} · ${esc(v.hora)}</td></tr>
          <tr><th>Operador</th><td>${esc(opTxt(v))}</td></tr>
          <tr><th>Estado</th><td><b>${st.t}</b>${st.d ? `<br>${esc(st.d)}` : ''}</td></tr>
        </table>
      </div>
    </div>
    <table class="wo-cli">
      <tr><th>Cliente</th><td colspan="3">${esc(v.client_name || 'Contado')}${v.ruc ? ` · RUC ${esc(v.ruc)}` : ''}</td></tr>
      <tr><th>Celular</th><td>${esc(v.tel || '—')}</td><th>DM</th><td>${esc(v.dm || '—')}</td></tr>
      <tr><th>Correo</th><td colspan="3">${esc(v.email || '—')}</td></tr>
    </table>
    <table class="wo-t">
      <thead><tr><th class="c">#</th><th>Producto o servicio</th><th>Tamaño</th><th>Detalle</th><th class="n">Cant.</th><th class="n">Precio</th><th class="n">Importe</th></tr></thead>
      <tbody>${v.items.map((it, i) => `<tr><td class="c">${i + 1}</td><td>${esc(prod(it))}</td><td>${esc(tam(it))}</td><td class="pre">${esc(it.extra || '')}</td>
        <td class="n">${esc(fmtCant(it.cant, it.unidad))}</td><td class="n">${money(it.precio_cents)}</td><td class="n">${money(it.sub_cents)}</td></tr>`).join('')}</tbody>
    </table>
    <div class="wo-pie">
      <div class="wo-nota"><div class="wo-sub">Nota</div><div class="pre">${esc(v.nota || '')}</div></div>
      <table class="wo-tot">
        <tr><th>Subtotal</th><td class="n">${money(v.subtotal_cents)}</td></tr>
        <tr><th>${tasaTxt()}</th><td class="n">${money(v.itbms_cents)}</td></tr>
        <tr class="g"><th>Total</th><td class="n">${money(v.total_cents)}</td></tr>
      </table>
    </div>
    <div class="wo-sellorow">${se.img ? `<img class="wo-sello" src="${esc(se.img)}" alt="">` : `<div class="wo-sello txt">${se.txt}</div>`}</div>
    <div class="wo-firmas"><div>Entregado por</div><div>Recibido por</div></div>
  </div>`;
  setTimeout(() => window.print(), 50);
}

/* ---------- PDF ---------- */
let lib = null;
function loadPdf() {
  if (window.jspdf) return Promise.resolve(window.jspdf);
  return lib ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = '/vendor/jspdf.umd.min.js';
    s.onload = () => res(window.jspdf);
    s.onerror = () => { lib = null; rej(new Error('No se pudo cargar el generador de PDF')); };
    document.head.appendChild(s);
  });
}

export async function descargarOrden(v) {
  let jspdf;
  try { jspdf = await loadPdf(); } catch (e) { return toast(e.message, true); }
  const doc = new jspdf.jsPDF({ unit: 'mm', format: 'letter', orientation: 'portrait' });
  const e = empresa(), st = estado(v), a = await docAssets(), se = sello(v, a);
  const L = 15, R = 216 - 15, W = R - L;
  const line = (x1, y1, x2, y2, w = 0.25, c = 150) => { doc.setDrawColor(c); doc.setLineWidth(w); doc.line(x1, y1, x2, y2); };
  const box = (x, y, w, h, fill) => { doc.setDrawColor(150); doc.setLineWidth(0.25); if (fill) { doc.setFillColor(...fill); doc.rect(x, y, w, h, 'FD'); } else doc.rect(x, y, w, h); };
  const txt = (t, x, y, o = {}) => { doc.setFont('helvetica', o.b ? 'bold' : 'normal'); doc.setFontSize(o.s || 9.5); doc.setTextColor(...(o.c || [20, 20, 20])); doc.text(String(t ?? ''), x, y, o.a ? { align: o.a, maxWidth: o.w } : (o.w ? { maxWidth: o.w } : undefined)); };

  // Encabezado: empresa (izq.) y datos de la orden (der.)
  let y = 18, ex = L, ey = y + 6;
  if (a.logo_doc) {
    try {
      const d = await imgDims(a.logo_doc);
      let w = 70, h = w * d.h / d.w; if (h > 22) { h = 22; w = h * d.w / d.h; }
      doc.addImage(a.logo_doc, a.logo_doc.startsWith('data:image/png') ? 'PNG' : 'JPEG', L, y - 8, w, h);
      ey = y - 8 + h + 5;
    } catch { txt(e.nombre, ex, y, { b: true, s: 15 }); }
  } else txt(e.nombre, ex, y, { b: true, s: 15 });
  if (e.dir) { txt(e.dir, ex, ey); ey += 5; }
  txt([e.tel && `Tel. ${e.tel}`, e.correo].filter(Boolean).join('  ·  '), ex, ey); ey += 5;
  if (e.ruc) { txt(`RUC ${e.ruc}`, ex, ey); ey += 5; }
  const mx = R - 82, mw = 82;
  txt('ORDEN DE TRABAJO', R, y, { b: true, s: 13, a: 'right', c: [224, 25, 125] });
  const meta = [['N.º de orden', numDe(v)], ['Fecha', `${dmy(v.fecha)} · ${v.hora}`], ['Operador', opTxt(v)], ['Estado', st.t + (st.d ? ` · ${st.d}` : '')]];
  let my = y + 4;
  meta.forEach(([k, val], i) => {
    box(mx, my, 28, 7, [239, 236, 229]); box(mx + 28, my, mw - 28, 7);
    txt(k, mx + 2, my + 4.8, { b: true, s: 8.5 }); txt(val, mx + 30, my + 4.8, { b: i === 0 || i === 3, s: 8.5, w: mw - 32 });
    my += 7;
  });
  y = Math.max(ey, my) + 6;

  // Cliente
  const cli = [['Cliente', `${v.client_name || 'Contado'}${v.ruc ? ` · RUC ${v.ruc}` : ''}`], ['Celular', v.tel || '—'], ['DM', v.dm || '—'], ['Correo', v.email || '—']];
  box(L, y, 22, 7, [239, 236, 229]); box(L + 22, y, W - 22, 7);
  txt(cli[0][0], L + 2, y + 4.8, { b: true }); txt(cli[0][1], L + 24, y + 4.8);
  y += 7;
  const half = W / 2;
  box(L, y, 22, 7, [239, 236, 229]); box(L + 22, y, half - 22, 7); box(L + half, y, 16, 7, [239, 236, 229]); box(L + half + 16, y, half - 16, 7);
  txt('Celular', L + 2, y + 4.8, { b: true }); txt(cli[1][1], L + 24, y + 4.8); txt('DM', L + half + 2, y + 4.8, { b: true }); txt(cli[2][1], L + half + 18, y + 4.8);
  y += 7;
  box(L, y, 22, 7, [239, 236, 229]); box(L + 22, y, W - 22, 7);
  txt('Correo', L + 2, y + 4.8, { b: true }); txt(cli[3][1], L + 24, y + 4.8);
  y += 13;

  // Tabla de productos
  const cols = [8, 56, 34, 34, 16, 19, 19];
  const xs = cols.reduce((a, w, i) => (a.push(a[i] + w), a), [L]);
  const heads = ['#', 'Producto o servicio', 'Tamaño', 'Detalle', 'Cant.', 'Precio', 'Importe'];
  const right = [false, false, false, false, true, true, true];
  const fila = (vals, yy, h, head) => {
    vals.forEach((t, i) => {
      box(xs[i], yy, cols[i], h, head ? [239, 236, 229] : null);
      txt(t, right[i] ? xs[i + 1] - 2 : xs[i] + 2, yy + 4.8, { b: head, s: 8.5, a: right[i] ? 'right' : undefined, w: cols[i] - 4 });
    });
  };
  fila(heads, y, 7, true); y += 7;
  doc.setFontSize(8.5);
  for (const [i, it] of v.items.entries()) {
    const vals = [String(i + 1), prod(it), tam(it), it.extra || '', fmtCant(it.cant, it.unidad), money(it.precio_cents), money(it.sub_cents)];
    const lines = Math.max(...vals.map((t, j) => doc.splitTextToSize(String(t), cols[j] - 4).length));
    const h = Math.max(7, 3 + lines * 3.8);
    if (y + h > 250) { doc.addPage(); y = 18; fila(heads, y, 7, true); y += 7; }
    fila(vals, y, h, false); y += h;
  }
  y += 6;

  // Nota y totales
  const tw = 70, tx = R - tw;
  box(L, y, W - tw - 6, 21); txt('Nota', L + 2, y + 5, { b: true, s: 8.5 }); txt(v.nota || '', L + 2, y + 10, { s: 8.5, w: W - tw - 10 });
  [['Subtotal', money(v.subtotal_cents)], [tasaTxt(), money(v.itbms_cents)], ['Total', money(v.total_cents)]].forEach(([k, val], i) => {
    const g = i === 2;
    box(tx, y + i * 7, 34, 7, [239, 236, 229]); box(tx + 34, y + i * 7, tw - 34, 7, g ? [255, 236, 246] : null);
    txt(k, tx + 2, y + i * 7 + 4.8, { b: true, s: g ? 10 : 9 }); txt(val, R - 2, y + i * 7 + 4.8, { b: g, s: g ? 11 : 9, a: 'right' });
  });
  y += 21 + 8;
  // sello en el espacio libre
  if (y + 30 > 262) { doc.addPage(); y = 30; }
  if (se.img) {
    try {
      const d = await imgDims(se.img); const w = 62, h = w * d.h / d.w;
      doc.addImage(se.img, se.img.startsWith('data:image/png') ? 'PNG' : 'JPEG', L + 4, y, w, Math.min(h, 28));
    } catch { /* sin sello */ }
  } else {
    doc.setDrawColor(40); doc.setLineWidth(1); doc.roundedRect(L + 4, y + 2, 62, 16, 3, 3);
    txt(se.txt, L + 35, y + 13, { b: true, s: 18, a: 'center', c: [40, 40, 40] });
  }
  y += 34;
  if (y > 262) { doc.addPage(); y = 40; }
  line(L, y, L + 70, y, 0.4, 20); line(R - 70, y, R, y, 0.4, 20);
  txt('Entregado por', L, y + 5, { s: 8.5, c: [100, 100, 100] }); txt('Recibido por', R - 70, y + 5, { s: 8.5, c: [100, 100, 100] });
  doc.save(`Orden_${numDe(v)}.pdf`);
}

/** Menú "Orden" con imprimir / descargar PDF. getSale puede ser async. */
export function ordenMenu(btn, getSale) {
  openMenu(btn, {
    width: 220, align: 'right',
    build(el, close) {
      el.innerHTML = `<div class="list"><button type="button" class="it" data-x="print">${ICON.print}Imprimir orden</button><button type="button" class="it" data-x="pdf">${ICON.down}Descargar PDF</button></div>`;
      el.addEventListener('click', async e => {
        const b = e.target.closest('.it'); if (!b) return; close();
        const v = await getSale(); if (!v) return;
        if (b.dataset.x === 'print') imprimirOrden(v); else descargarOrden(v);
      });
    },
  });
}
