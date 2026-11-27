/* Facturas: crear desde órdenes e imprimir. */
import { api } from './api.js';
import { S, emit, syncNow } from './store.js';
import { dialog, toast } from './ui/dom.js';
import { docAssets } from './assets.js';
import { esc, money, dmy, fmtCant } from './util.js';

export const numFac = n => String(n ?? 0).padStart(10, '0');

/** Pide los datos fiscales del cliente y crea la factura de las órdenes elegidas. */
export async function facturar(ventas) {
  const v0 = ventas[0];
  const cli = S.clients.find(c => c.id === v0.client_id) || {};
  const r = await dialog({
    title: ventas.length > 1 ? `Facturar ${ventas.length} órdenes · ${money(ventas.reduce((a, v) => a + v.total_cents, 0))}` : `Facturar orden · ${money(v0.total_cents)}`,
    fields: [
      { name: 'tipo', label: 'Tipo de cliente', type: 'select', value: cli.ruc || v0.ruc ? 'contribuyente' : 'consumidor', options: [['contribuyente', 'Contribuyente (con RUC)'], ['consumidor', 'Consumidor final'], ['gobierno', 'Gobierno'], ['extranjero', 'Extranjero']] },
      { name: 'nombre', label: 'Nombre o razón social', value: v0.client_name || cli.name || '' },
      { name: 'ruc', label: 'RUC o cédula', value: v0.ruc || cli.ruc || '' },
      { name: 'dv', label: 'DV', value: v0.dv || cli.dv || '' },
      { name: 'direccion', label: 'Dirección', value: v0.direccion || cli.direccion || '' },
      { name: 'correo', label: 'Correo', type: 'email', value: v0.email || cli.email || '' },
    ],
    ok: 'Crear factura',
    onSubmit: v => api('/api/invoices', { method: 'POST', body: { sale_ids: ventas.map(x => x.id), receptor: v } }),
  });
  if (!r?.invoice) return null;
  toast(`Factura N° ${numFac(r.invoice.numero)} creada`); emit('sale'); syncNow();
  imprimirFactura(r.invoice);
  return r.invoice;
}

export async function imprimirFactura(f) {
  const e = S.settings.empresa, a = await docAssets(), rc = f.receptor;
  const box = document.getElementById('print');
  box.innerHTML = `<div class="wo fac${f.estado === 'anulada' ? ' anul' : ''}">
    <div class="wo-h">
      <div class="wo-emp">
        ${a.logo_doc ? `<img class="wo-logodoc" src="${esc(a.logo_doc)}" alt="">` : `<div class="wo-neg">${esc(S.account.business)}</div>`}
        ${a.logo_doc ? `<div><b>${esc(S.account.business)}</b></div>` : ''}
        ${e.ruc ? `<div>RUC ${esc(e.ruc)}${e.dv ? ` DV ${esc(e.dv)}` : ''}</div>` : ''}
        ${e.direccion ? `<div>${esc(e.direccion)}</div>` : ''}
        <div>${[e.telefono && `Tel. ${esc(e.telefono)}`, e.correo && esc(e.correo)].filter(Boolean).join(' · ')}</div>
      </div>
      <div class="wo-tit">
        <div class="wo-label">FACTURA${f.estado === 'anulada' ? ' ANULADA' : ''}</div>
        <table class="wo-meta">
          <tr><th>N.º</th><td><b>${numFac(f.numero)}</b></td></tr>
          <tr><th>Fecha</th><td>${dmy(f.fecha)} · ${esc(f.hora)}</td></tr>
          ${f.cufe ? `<tr><th>CUFE</th><td style="word-break:break-all">${esc(f.cufe)}</td></tr>` : ''}
        </table>
      </div>
    </div>
    <table class="wo-cli">
      <tr><th>Cliente</th><td colspan="3">${esc(rc.nombre)}</td></tr>
      <tr><th>RUC / Céd.</th><td>${esc(rc.ruc || '—')}</td><th>DV</th><td>${esc(rc.dv || '—')}</td></tr>
      <tr><th>Dirección</th><td colspan="3">${esc(rc.direccion || '—')}</td></tr>
      ${rc.correo ? `<tr><th>Correo</th><td colspan="3">${esc(rc.correo)}</td></tr>` : ''}
    </table>
    <table class="wo-t">
      <thead><tr><th class="c">Orden</th><th>Descripción</th><th class="n">Cant.</th><th class="n">Precio</th><th class="n">Importe</th></tr></thead>
      <tbody>${f.items.map(it => `<tr><td class="c">${String(it.orden ?? '').padStart(6, '0')}</td><td>${esc(it.nombre)}${it.tam && it.tam !== '—' ? ` · ${esc(it.tam)}` : ''}${it.extra ? `<br><small>${esc(it.extra)}</small>` : ''}</td>
        <td class="n">${esc(fmtCant(it.cant, it.unidad))}</td><td class="n">${money(it.precio_cents)}</td><td class="n">${money(it.sub_cents)}</td></tr>`).join('')}</tbody>
    </table>
    <div class="wo-pie">
      <div class="wo-nota"><div class="wo-sub">Nota</div><div class="pre">${esc(f.nota || '')}</div></div>
      <table class="wo-tot">
        <tr><th>Subtotal</th><td class="n">${money(f.subtotal_cents)}</td></tr>
        <tr><th>ITBMS ${S.settings.itbms.tasa}%</th><td class="n">${money(f.itbms_cents)}</td></tr>
        <tr class="g"><th>Total</th><td class="n">${money(f.total_cents)}</td></tr>
      </table>
    </div>
    ${f.cufe ? '' : '<div class="fac-nf">Comprobante no fiscal</div>'}
  </div>`;
  setTimeout(() => window.print(), 50);
}
