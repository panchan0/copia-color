import { esc, money, METODOS, itemLabel, fmtCant, dmy } from '../util.js';
import { numOrden } from '../workorder.js';

export const numTxt = v => v.numero != null ? numOrden(v.numero) : (v.numero_anulado != null ? numOrden(v.numero_anulado) : '—');

export function estadoTag(v) {
  if (v.anulada || v.estado === 'anulada') return '<span class="tag t-anul">Anulada</span>';
  if (v.estado === 'pendiente') return '<span class="tag t-pend">Pendiente</span>';
  return `<span class="tag m-${v.metodo}">${METODOS[v.metodo] || 'Pagada'}</span>`;
}

/** Tabla de órdenes (en celular se ve como lista compacta). */
export function salesTable(sales, { empty = 'Sin órdenes', loading = false, fecha = false, pago = false } = {}) {
  if (loading) return '<div class="empty">Cargando…</div>';
  if (!sales.length) return `<div class="empty">${empty}</div>`;
  const det = v => v.items.map(it => `${esc(fmtCant(it.cant, it.unidad))} × ${esc(itemLabel(it))}${it.extra ? ` (${esc(it.extra)})` : ''}`).join('<br>');
  const op = v => v.operador && v.operador !== 'Job Log' ? v.operador : '';
  return `<table class="stbl"><thead><tr>
    <th>N°</th><th>${fecha ? 'Fecha' : 'Hora'}</th><th>Cliente</th><th>Producto o servicio</th><th>Estado</th>${pago ? '<th class="dk">Cobrada</th>' : ''}<th class="dk">Operador</th><th class="n">Total</th><th></th></tr></thead><tbody>
    ${sales.map(v => {
      const anul = v.anulada || v.estado === 'anulada';
      return `<tr class="rowlink${anul ? ' void' : ''}" data-id="${esc(v.id)}" tabindex="0">
      <td class="c-n num">${numTxt(v)}</td>
      <td class="c-h num">${fecha ? `${dmy(v.fecha).slice(0, 5)} ` : ''}${esc(v.hora)}</td>
      <td class="c-cl">${v.client_name ? esc(v.client_name) : '<span class="muted">Contado</span>'}</td>
      <td class="c-d"><div class="clamp">${det(v)}</div></td>
      <td class="c-e">${estadoTag(v)}</td>
      ${pago ? `<td class="dk num muted">${v.pagada_fecha ? `${dmy(v.pagada_fecha).slice(0, 5)} ${esc(v.pagada_hora || '')}` : '—'}</td>` : ''}
      <td class="dk muted">${esc(op(v) || '—')}</td>
      <td class="n num c-t"><b>${money(v.total_cents)}</b></td>
      <td class="c-a"><svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></td>
    </tr>`;
    }).join('')}</tbody></table>`;
}

/** Abre la vista detallada al tocar una orden. */
export function bindAbrir(container, from) {
  const abrir = tr => { if (tr) location.hash = `#orden=${tr.dataset.id}`; };
  container.addEventListener('click', e => abrir(e.target.closest('tr.rowlink')));
  container.addEventListener('keydown', e => { if (e.key === 'Enter') abrir(e.target.closest('tr.rowlink')); });
  void from;
}
