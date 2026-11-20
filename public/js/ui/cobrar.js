import { api } from '../api.js';
import { syncNow, emit } from '../store.js';
import { toast } from './dom.js';
import { openMenu } from './menu.js';
import { METODOS, esc } from '../util.js';

/** Menú para cobrar una orden pendiente desde una lista. */
export function bindCobrar(container, onDone) {
  container.addEventListener('click', e => {
    const b = e.target.closest('.cob'); if (!b) return;
    openMenu(b, {
      width: 200, align: 'right',
      build(el, close) {
        el.innerHTML = `<div class="none">Cobrar con:</div><div class="list">${Object.entries(METODOS).map(([k, l]) => `<button type="button" class="it m-${k}" data-k="${k}"><span class="dot"></span>${esc(l)}</button>`).join('')}</div>`;
        el.addEventListener('click', async ev => {
          const it = ev.target.closest('.it'); if (!it) return; close();
          try {
            await api(`/api/sales/${b.dataset.id}/pay`, { method: 'POST', body: { metodo: it.dataset.k } });
            toast(`Orden cobrada · ${METODOS[it.dataset.k]}`); emit('sale'); syncNow(); onDone && onDone();
          } catch (err) { toast(err.message, true); }
        });
      },
    });
  });
}
