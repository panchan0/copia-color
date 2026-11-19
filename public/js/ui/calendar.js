import { openMenu } from './menu.js';
import { MESES, DIAS3, parseD, fmtD, addMonths, startOfMonth, endOfMonth, dow, addDays } from '../util.js';

/**
 * Calendario propio en un menú desplegable.
 * opts: { value, max, onPick(fecha), marks(desde, hasta) -> Promise<Set<fecha>> }
 */
export function openCalendar(anchor, { value, max, onPick, marks }) {
  let month = startOfMonth(value);
  openMenu(anchor, {
    width: 316,
    build(el, close, place) {
      el.innerHTML = '<div class="cal"></div>';
      const box = el.firstElementChild;
      const render = async () => {
        const first = month, last = endOfMonth(month);
        const lead = (dow(first) + 6) % 7;
        const start = addDays(first, -lead);
        const cells = [];
        for (let i = 0; i < 42; i++) cells.push(addDays(start, i));
        const d = parseD(month);
        const canNext = !max || addMonths(month, 1) <= max;
        box.innerHTML = `<div class="hd"><button type="button" data-p aria-label="Mes anterior">‹</button><b>${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}</b><button type="button" data-n ${canNext ? '' : 'disabled style="opacity:.3"'} aria-label="Mes siguiente">›</button></div>
          <div class="g">${['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'].map(x => `<div class="wd">${x}</div>`).join('')}
          ${cells.map(f => `<button type="button" class="d${f < first || f > last ? ' out' : ''}${f === max ? ' today' : ''}${f === value ? ' sel' : ''}" data-f="${f}" ${max && f > max ? 'disabled' : ''}>${parseD(f).getUTCDate()}</button>`).join('')}</div>
          <div class="ft"><button type="button" class="btn ghost sm" data-hoy>Hoy</button><button type="button" class="btn ghost sm" data-x>Cerrar</button></div>`;
        place();
        if (marks) {
          try {
            const set = await marks(cells[0], cells[41]);
            box.querySelectorAll('.d').forEach(b => { if (set.has(b.dataset.f)) b.classList.add('mk'); });
          } catch { /* sin marcas */ }
        }
      };
      box.addEventListener('click', e => {
        const t = e.target.closest('button'); if (!t) return;
        if (t.dataset.p !== undefined) { month = addMonths(month, -1); render(); }
        else if (t.dataset.n !== undefined) { month = addMonths(month, 1); render(); }
        else if (t.dataset.hoy !== undefined) { close(); onPick(max); }
        else if (t.dataset.x !== undefined) close();
        else if (t.dataset.f && !t.disabled) { close(); onPick(t.dataset.f); }
      });
      render();
    },
  });
}
