import { esc, money, METODOS, itemLabel, fmtCant, dmy } from '../util.js';
import { numOrden, ordenMenu } from '../workorder.js';

export const numTxt = v => v.numero != null ? numOrden(v.numero) : (v.numero_anulado != null ? numOrden(v.numero_anulado) : '—');

export function estadoTag(v) {
  if (v.anulada || v.estado === 'anulada') return '<span class="tag t-anul">Anulada</span>';
  if (v.estado === 'pendiente') return '<span class="tag t-pend">Pendiente</span>';
  return `<span class="tag m-${v.metodo}">${METODOS[v.metodo] || 'Pagada'}</span>`;
}

/** Tabla de órdenes (en celular se ve como tarjetas). */
export function salesTable(sales, { anular = true, cobrar = true, pend = null, empty = 'Sin órdenes', loading = false, fecha = false, pago = false } = {}) {
  if (loading) return '<div class="empty">Cargando…</div>';
  if (!sales.length) return `<div class="empty">${empty}</div>`;
  const det = v => v.items.map(it => `<div>${esc(fmtCant(it.cant, it.unidad))} × ${esc(itemLabel(it))}${it.extra ? ` <span class="muted">(${esc(it.extra)})</span>` : ''}</div>`).join('');
  return `<table class="stbl"><thead><tr>
    <th>N°</th><th>${fecha ? 'Creada' : 'Hora'}</th><th class="dk">Cliente</th><th>Producto o servicio</th><th class="n">Total</th><th class="dk">Estado</th>${pago ? '<th class="dk">Cobrada</th>' : ''}<th class="dk">Operador</th><th></th></tr></thead><tbody>
    ${sales.map(v => {
      const anul = v.anulada || v.estado === 'anulada';
      const acts = [
        `<button class="lnk ord" data-id="${esc(v.id)}">Orden</button>`,
        cobrar && v.estado === 'pendiente' ? `<button class="lnk cob" data-id="${esc(v.id)}">Cobrar</button>` : '',
        anular && !anul ? `<button class="lnk an" data-id="${esc(v.id)}">${pend === v.id ? '¿Anular?' : 'Anular'}</button>` : '',
      ].join('');
      return `<tr class="${anul ? 'void' : ''}">
      <td class="c-n num">${numTxt(v)}</td>
      <td class="c-h num">${fecha ? `${dmy(v.fecha).slice(0, 5)} ` : ''}${esc(v.hora)}</td>
      <td class="dk c-cl">${v.client_name ? esc(v.client_name) : '<span class="muted">Contado</span>'}</td>
      <td class="c-d"><span class="mb c-cl">${v.client_name ? esc(v.client_name) : 'Contado'}</span>${det(v)}<span class="mb">${estadoTag(v)}${v.operador ? ` <span class="muted">· ${esc(v.operador)}</span>` : ''}</span></td>
      <td class="n num c-t"><b>${money(v.total_cents)}</b></td>
      <td class="dk">${estadoTag(v)}${v.origen ? ' <span class="tag t-log">Job Log</span>' : ''}</td>
      ${pago ? `<td class="dk num muted">${v.pagada_fecha ? `${dmy(v.pagada_fecha).slice(0, 5)} ${esc(v.pagada_hora || '')}` : '—'}</td>` : ''}
      <td class="dk muted">${esc(v.operador || '—')}</td>
      <td class="c-a">${acts}</td>
    </tr>`;
    }).join('')}</tbody></table>`;
}

/** Conecta el botón "Orden" de cada fila. */
export function bindOrden(container, findSale) {
  container.addEventListener('click', e => {
    const b = e.target.closest('.ord'); if (!b) return;
    ordenMenu(b, () => findSale(b.dataset.id));
  });
}
