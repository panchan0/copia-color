import { openMenu, keyNav } from './menu.js';
import { dialog, ICON, toast } from './dom.js';
import { esc, METODOS, opCode, nuevoCodigoOp } from '../util.js';
import { S, syncNow } from '../store.js';
import { api } from '../api.js';

/** Selector de método de pago (menú desplegable). */
export function metodoPicker(btn, getValue, onChange) {
  const paint = () => {
    const v = getValue();
    btn.className = 'picker' + (v ? ` m-${v} has` : '');
    btn.innerHTML = v
      ? `<span class="dot"></span><span class="t">${METODOS[v]}</span>${ICON.chev}`
      : `<span class="t ph">Selecciona el método de pago</span>${ICON.chev}`;
  };
  btn.addEventListener('click', () => openMenu(btn, {
    width: 'anchor',
    build(el, close) {
      el.innerHTML = `<div class="list">${Object.entries(METODOS).map(([k, l]) =>
        `<button type="button" class="it m-${k}${getValue() === k ? ' sel' : ''}" data-k="${k}"><span class="dot"></span>${l}</button>`).join('')}</div>`;
      el.addEventListener('click', e => { const b = e.target.closest('.it'); if (!b) return; close(); onChange(b.dataset.k); paint(); });
    },
  }));
  paint();
  return paint;
}

/** Crea un cliente con un diálogo y lo devuelve. */
export async function nuevoCliente(nombre = '') {
  return dialog({
    title: 'Nuevo cliente',
    fields: [
      { name: 'name', label: 'Nombre o empresa', value: nombre },
      { name: 'phone', label: 'Celular (opcional)', type: 'tel' },
      { name: 'dm', label: 'DM / Instagram (opcional)' },
      { name: 'email', label: 'Correo (opcional)', type: 'email' },
      { name: 'ruc', label: 'RUC / cédula (opcional)' },
    ],
    async onSubmit(v) {
      const r = await api('/api/clients', { method: 'POST', body: v });
      S.clients.push(r.client);
      S.clients.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
      syncNow();
      return r.client;
    },
  });
}

/** Selector de cliente con búsqueda y opción de agregar uno nuevo. */
export function clientePicker(btn, getValue, onChange) {
  const paint = () => {
    const c = S.clients.find(x => x.id === getValue());
    btn.className = 'picker';
    btn.innerHTML = `${ICON.user}<span class="t${c ? '' : ' ph'}">${c ? esc(c.name) : 'Sin cliente'}</span>${ICON.chev}`;
  };
  btn.addEventListener('click', () => openMenu(btn, {
    width: 'anchor',
    build(el, close, place) {
      el.innerHTML = `<input class="input search" placeholder="Buscar cliente…" autocomplete="off"><div class="list"></div>`;
      const inp = el.querySelector('input'), list = el.querySelector('.list');
      const draw = () => {
        const q = inp.value.trim().toLowerCase();
        const found = S.clients.filter(c => !q || c.name.toLowerCase().includes(q) || (c.phone || '').includes(q));
        const exact = S.clients.some(c => c.name.toLowerCase() === q);
        list.innerHTML =
          (q ? '' : `<button type="button" class="it${!getValue() ? ' sel' : ''}" data-id="">Sin cliente</button>`) +
          found.map(c => `<button type="button" class="it${c.id === getValue() ? ' sel' : ''}" data-id="${esc(c.id)}">${esc(c.name)}${c.phone ? `<small>${esc(c.phone)}</small>` : ''}</button>`).join('') +
          (q && !found.length ? '<div class="none">No hay clientes con ese nombre</div>' : '') +
          (!S.clients.length && !q ? '<div class="none">Todavía no hay clientes guardados</div>' : '') +
          `<div class="sep"></div><button type="button" class="it add" data-add>${ICON.plus}${q && !exact ? `Agregar “${esc(inp.value.trim())}”` : 'Agregar cliente nuevo'}</button>`;
        place();
      };
      inp.addEventListener('input', draw);
      keyNav(inp, list);
      list.addEventListener('click', async e => {
        const b = e.target.closest('.it'); if (!b) return;
        if (b.dataset.add !== undefined) {
          const nombre = inp.value.trim();
          close();
          const c = await nuevoCliente(nombre);
          if (c) { onChange(c.id); paint(); toast('Cliente guardado'); }
          return;
        }
        close(); onChange(b.dataset.id || null); paint();
      });
      draw();
      setTimeout(() => inp.focus(), 20);
    },
  }));
  paint();
  return paint;
}

/** Botón "Descargar / Imprimir" con su menú. */
export function exportMenu(btn, { onExcel, onPrint }) {
  btn.addEventListener('click', () => openMenu(btn, {
    width: 240, align: 'right',
    build(el, close) {
      el.innerHTML = `<div class="list"><button type="button" class="it" data-x="xls">${ICON.sheet}Descargar Excel</button><button type="button" class="it" data-x="print">${ICON.print}Imprimir</button></div>`;
      el.addEventListener('click', e => { const b = e.target.closest('.it'); if (!b) return; close(); (b.dataset.x === 'xls' ? onExcel : onPrint)(); });
    },
  }));
}

/** Selector genérico de una lista (servicio, tamaño…). items: () => [{id, label, sub, cls}] */
export function listPicker(btn, { items, getValue, onChange, placeholder = 'Selecciona', icon = '', search = false }) {
  const paint = () => {
    const cur = items().find(x => x.id === getValue());
    btn.className = 'picker';
    btn.innerHTML = `${icon}<span class="t${cur ? '' : ' ph'}">${cur ? esc(cur.label) : esc(placeholder)}</span>${cur && cur.sub ? `<span class="psub">${esc(cur.sub)}</span>` : ''}${ICON.chev}`;
  };
  btn.addEventListener('click', () => openMenu(btn, {
    width: 'anchor',
    build(el, close, place) {
      el.innerHTML = `${search ? '<input class="input search" placeholder="Buscar…" autocomplete="off">' : ''}<div class="list"></div>`;
      const list = el.querySelector('.list'), inp = el.querySelector('input');
      const draw = () => {
        const q = (inp?.value || '').trim().toLowerCase();
        list.innerHTML = items().filter(x => !q || x.label.toLowerCase().includes(q)).map(x =>
          `<button type="button" class="it${x.id === getValue() ? ' sel' : ''} ${x.cls || ''}" data-id="${esc(x.id)}"><span class="lbl">${esc(x.label)}</span>${x.sub ? `<small>${esc(x.sub)}</small>` : ''}</button>`).join('') || '<div class="none">Sin resultados</div>';
        place();
      };
      inp?.addEventListener('input', draw);
      if (inp) keyNav(inp, list);
      list.addEventListener('click', e => { const b = e.target.closest('.it'); if (!b) return; close(); onChange(b.dataset.id); paint(); });
      draw();
      if (inp) setTimeout(() => inp.focus(), 20);
    },
  }));
  paint();
  return paint;
}

/** Selector de operador: lista guardada en Ajustes + agregar nuevo. */
/** Crea un operador con número de dos dígitos. Devuelve su código (inicial + número). */
export async function crearOperador() {
  const r = await dialog({
    title: 'Nuevo operador', fields: [{ name: 'name', label: 'Nombre' }],
    async onSubmit(v) {
      const name = (v.name || '').trim(); if (!name) throw new Error('Escribe el nombre');
      const st = structuredClone(S.settings);
      let o = st.operadores.find(x => x.n.toLowerCase() === name.toLowerCase());
      if (!o) { o = { n: name, c: nuevoCodigoOp(st.operadores) }; st.operadores.push(o); }
      const res = await api('/api/settings', { method: 'PUT', body: st });
      S.settings = res.settings; syncNow();
      return { code: opCode(S.settings.operadores.find(x => x.n === o.n) || o) };
    },
  });
  return r?.code || null;
}

export function operadorPicker(btn, getValue, onChange) {
  const ops = () => S.settings.operadores || [];
  const paint = () => {
    const v = getValue();
    btn.className = 'picker';
    btn.innerHTML = `${ICON.user}<span class="t${v ? '' : ' ph'}">${v ? esc(v) : 'Selecciona el operador'}</span>${ICON.chev}`;
  };
  btn.addEventListener('click', () => openMenu(btn, {
    width: 'anchor',
    build(el, close) {
      el.innerHTML = `<div class="list">${ops().map(o => `<button type="button" class="it${opCode(o) === getValue() ? ' sel' : ''}" data-v="${esc(opCode(o))}"><b class="num">${esc(opCode(o))}</b></button>`).join('')}
        ${ops().length ? '' : '<div class="none">Todavía no hay operadores</div>'}<div class="sep"></div><button type="button" class="it add" data-add>${ICON.plus}Agregar operador</button></div>`;
      el.addEventListener('click', async e => {
        const b = e.target.closest('.it'); if (!b) return; close();
        if (b.dataset.add !== undefined) {
          const r = await crearOperador();
          if (r) { onChange(r); paint(); }
          return;
        }
        onChange(b.dataset.v); paint();
      });
    },
  }));
  paint();
  return paint;
}
