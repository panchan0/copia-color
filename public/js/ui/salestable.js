import { esc, money, int, METODOS, itemLabelLower } from '../util.js';
import { numOrden, ordenMenu } from '../workorder.js';

/** Tabla de ventas (en celular se ve como tarjetas). */
export function salesTable(sales, { anular = true, pend = null, empty = 'Sin ventas', loading = false } = {}) {
  if (loading) return '<div class="empty">Cargando…</div>';
  if (!sales.length) return `<div class="empty">${empty}</div>`;
  const det = v => v.items.map(it => `${int(it.cant)} ${itemLabelLower(it)}`).join(', ');
  return `<table class="stbl"><thead><tr>
    <th>N°</th><th>Hora</th><th class="dk">Cliente</th><th>Detalle</th><th class="dk n">Subtotal</th><th class="dk n">ITBMS</th><th class="n">Total</th><th class="dk">Pago</th><th></th></tr></thead><tbody>
    ${sales.map(v => `<tr class="${v.anulada ? 'void' : ''}">
      <td class="c-n num">${numOrden(v.numero)}</td>
      <td class="c-h num">${esc(v.hora)}</td>
      <td class="dk c-cl">${v.client_name ? esc(v.client_name) : '<span class="muted">Contado</span>'}</td>
      <td class="c-d"><span class="mb c-cl">${v.client_name ? esc(v.client_name) : 'Contado'}</span>${esc(det(v))}<span class="mb"> <span class="tag m-${v.metodo}">${METODOS[v.metodo]}</span></span></td>
      <td class="dk n num">${money(v.subtotal_cents)}</td>
      <td class="dk n num">${money(v.itbms_cents)}</td>
      <td class="n num c-t"><b>${money(v.total_cents)}</b></td>
      <td class="dk"><span class="tag m-${v.metodo}">${METODOS[v.metodo]}</span></td>
      <td class="c-a"><button class="lnk ord" data-id="${esc(v.id)}">Orden</button>${anular ? (v.anulada ? '<span class="muted">Anulada</span>' : `<button class="lnk an" data-id="${esc(v.id)}">${pend === v.id ? '¿Anular?' : 'Anular'}</button>`) : ''}</td>
    </tr>`).join('')}</tbody></table>`;
}

/** Conecta el botón "Orden" de cada fila. */
export function bindOrden(container, findSale) {
  container.addEventListener('click', e => {
    const b = e.target.closest('.ord'); if (!b) return;
    ordenMenu(b, () => findSale(b.dataset.id));
  });
}
