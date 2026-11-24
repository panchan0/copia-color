/* Calendario detallado por semana, mes o año con el monto de cada día/mes. */
import { addDays, parseD, MES3, money0, int, esc } from '../util.js';

const DS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const heat = (v, max) => (v > 0 ? `style="--h:${Math.round(10 + 55 * v / max)}%"` : '');

/**
 * modo: 'semana' | 'mes' | 'anio'; from: inicio del periodo (lunes / día 1 / 1 de enero)
 * val(k) => { v: monto en centavos, n: órdenes } · k = 'YYYY-MM-DD' o 'YYYY-MM' en año
 */
export function calGrid({ modo, from, val, hoy, sel = null }) {
  if (modo === 'anio') {
    const y = from.slice(0, 4);
    const ks = MES3.map((_, i) => `${y}-${String(i + 1).padStart(2, '0')}`);
    const max = Math.max(1, ...ks.map(k => val(k).v));
    return `<div class="cg cg-anio">${ks.map((k, i) => { const x = val(k); return `<button type="button" class="cgc${hoy.startsWith(k) ? ' hoy' : ''}${sel === k ? ' sel' : ''}" data-k="${k}" ${heat(x.v, max)}>
      <span class="cgd">${MES3[i]}</span><b class="num">${x.v ? money0(x.v) : '—'}</b><small>${x.n ? `${int(x.n)} órd.` : ''}</small></button>`; }).join('')}</div>`;
  }
  let ini = from, n = 7;
  if (modo === 'mes') {
    const d = parseD(from), dow = (d.getUTCDay() + 6) % 7;
    ini = addDays(from, -dow);
    const fin = parseD(addDays(from, 40)); // aprox; se corta por mes
    const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    n = Math.ceil((dow + ultimo) / 7) * 7; void fin;
  }
  const dias = Array.from({ length: n }, (_, i) => addDays(ini, i));
  const mes = from.slice(0, 7);
  const max = Math.max(1, ...dias.map(k => val(k).v));
  return `<div class="cg cg-${modo}">${DS.map(d => `<span class="cgh">${d}</span>`).join('')}${dias.map(k => {
    const x = val(k), fuera = modo === 'mes' && !k.startsWith(mes), fut = k > hoy;
    return `<button type="button" class="cgc${fuera ? ' fuera' : ''}${fut ? ' fut' : ''}${k === hoy ? ' hoy' : ''}${sel === k ? ' sel' : ''}" data-k="${k}" ${fuera ? '' : heat(x.v, max)}>
      <span class="cgd">${parseD(k).getUTCDate()}</span>${fuera ? '' : `<b class="num">${x.v ? money0(x.v) : ''}</b><small>${x.n ? `${int(x.n)}` : ''}</small>`}</button>`;
  }).join('')}</div>`;
}
export { esc };
