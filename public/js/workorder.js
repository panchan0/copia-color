import { S } from './store.js';
import { toast, ICON } from './ui/dom.js';
import { openMenu } from './ui/menu.js';
import { esc, money, int, dmy, METODOS, itemLabel } from './util.js';

export const numOrden = n => String(n ?? 0).padStart(6, '0');
const cliente = v => v.client_name || 'CONTADO';
const tasaTxt = () => `ITBMS ${S.settings?.itbms?.tasa ?? 7}%`;

/* ---------- impresión ---------- */
export function imprimirOrden(v) {
  const box = document.getElementById('print');
  box.innerHTML = `<div class="wo">
    <div class="wo-h">
      <div><div class="wo-neg">${esc(S.account.business)}</div><div class="wo-sub">Orden de trabajo</div></div>
      <div class="wo-num"><span>N°</span> ${numOrden(v.numero)}<div class="wo-sub">${dmy(v.fecha)} · ${esc(v.hora)}</div></div>
    </div>
    ${v.anulada ? '<div class="wo-anul">ANULADA</div>' : ''}
    <table class="wo-cli"><tr><td><b>Cliente</b></td><td>${esc(cliente(v))}</td>${v.client_phone ? `<td><b>Tel.</b></td><td>${esc(v.client_phone)}</td>` : ''}${v.client_ruc ? `<td><b>RUC</b></td><td>${esc(v.client_ruc)}</td>` : ''}</tr></table>
    <table class="wo-t"><thead><tr><th class="n">Cant.</th><th>Descripción</th><th class="n">P. unit.</th><th class="n">Monto</th></tr></thead>
    <tbody>${v.items.map(it => `<tr><td class="n">${int(it.cant)}</td><td>${esc(itemLabel(it))} a color</td><td class="n">${money(it.precio_cents)}</td><td class="n">${money(it.sub_cents)}</td></tr>`).join('')}</tbody></table>
    <table class="wo-tot">
      <tr><td>Subtotal</td><td class="n">${money(v.subtotal_cents)}</td></tr>
      <tr><td>${tasaTxt()}</td><td class="n">${money(v.itbms_cents)}</td></tr>
      <tr class="g"><td>Total</td><td class="n">${money(v.total_cents)}</td></tr>
      <tr><td>Pago</td><td class="n">${METODOS[v.metodo]} · ${v.anulada ? 'Anulada' : 'Pagado'}</td></tr>
    </table>
    <div class="wo-obs">Observaciones</div>
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
  const doc = new jspdf.jsPDF({ unit: 'mm', format: 'letter' });
  const L = 18, R = 216 - 18, W = R - L;
  let y = 22;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
  doc.text(S.account.business, L, y);
  doc.setFontSize(18); doc.text(`N° ${numOrden(v.numero)}`, R, y, { align: 'right' });
  y += 7;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(90);
  doc.text('ORDEN DE TRABAJO', L, y);
  doc.text(`${dmy(v.fecha)}  ${v.hora}`, R, y, { align: 'right' });
  doc.setTextColor(0);
  y += 4; doc.setDrawColor(22); doc.setLineWidth(0.6); doc.line(L, y, R, y);
  if (v.anulada) { y += 8; doc.setTextColor(200, 40, 40); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text('ANULADA', L, y); doc.setTextColor(0); }
  y += 9;
  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.text('Cliente:', L, y);
  doc.setFont('helvetica', 'normal'); doc.text(cliente(v), L + 17, y);
  const extra = [v.client_phone && `Tel. ${v.client_phone}`, v.client_ruc && `RUC ${v.client_ruc}`].filter(Boolean).join('    ');
  if (extra) doc.text(extra, R, y, { align: 'right' });
  y += 9;
  const cx = [L + 2, L + 22, R - 40, R - 2];
  doc.setFillColor(239, 236, 229); doc.rect(L, y - 5, W, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.text('Cant.', cx[0], y); doc.text('Descripción', cx[1], y); doc.text('P. unit.', cx[2], y, { align: 'right' }); doc.text('Monto', cx[3], y, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  y += 8;
  for (const it of v.items) {
    doc.text(String(it.cant), cx[0], y);
    doc.text(`${itemLabel(it)} a color`, cx[1], y);
    doc.text(money(it.precio_cents), cx[2], y, { align: 'right' });
    doc.text(money(it.sub_cents), cx[3], y, { align: 'right' });
    doc.setDrawColor(227, 224, 216); doc.setLineWidth(0.2); doc.line(L, y + 2.5, R, y + 2.5);
    y += 7.5;
    if (y > 240) { doc.addPage(); y = 22; }
  }
  y += 3;
  const tl = R - 70;
  const fila = (a, b, bold) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.text(a, tl, y); doc.text(b, R - 2, y, { align: 'right' }); y += 6.5; };
  fila('Subtotal', money(v.subtotal_cents));
  fila(tasaTxt(), money(v.itbms_cents));
  doc.setDrawColor(22); doc.setLineWidth(0.4); doc.line(tl, y - 4.5, R, y - 4.5);
  doc.setFontSize(12); fila('Total', money(v.total_cents), true); doc.setFontSize(10);
  fila('Pago', `${METODOS[v.metodo]} · ${v.anulada ? 'Anulada' : 'Pagado'}`);
  y += 6;
  doc.setFont('helvetica', 'bold'); doc.text('Observaciones', L, y); doc.setFont('helvetica', 'normal');
  doc.setDrawColor(190); doc.setLineWidth(0.2);
  for (let i = 1; i <= 3; i++) doc.line(L, y + i * 8, R, y + i * 8);
  y += 46;
  doc.line(L, y, L + 70, y); doc.line(R - 70, y, R, y);
  doc.setFontSize(9); doc.setTextColor(90);
  doc.text('Entregado por', L, y + 5); doc.text('Recibido por', R - 70, y + 5);
  doc.save(`Orden_${numOrden(v.numero)}.pdf`);
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
