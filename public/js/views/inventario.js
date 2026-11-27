/* Inventario (experimental): existencias, entradas y salidas, y descuento automático por lo vendido. */
import { api } from '../api.js';
import { S, on, syncNow } from '../store.js';
import { toast, dialog, ICON } from '../ui/dom.js';
import { esc, money, int, toCents, centsToInput, dmy } from '../util.js';
import { transicion } from '../ui/motion.js';

let root, items = [], abierto = null, movs = [], req = 0;
const UNIDADES = ['hoja', 'resma', 'caja', 'rollo', 'unidad', 'paquete', 'galón', 'litro', 'cartucho', 'tóner', 'metro', 'pie'];
const fmt = n => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

export function mount(el) {
  root = el;
  root.innerHTML = `
  <div data-v="lista">
    <div class="toolbar"><h2 class="vt">Inventario <span class="tag t-exp">Experimental</span></h2><button class="btn" data-nuevo>${ICON.plus}Nuevo artículo</button></div>
    <div class="kpis inv-k" data-k></div>
    <div class="card"><input class="input" data-q type="search" placeholder="Buscar artículo" style="margin-bottom:10px"><div data-lista></div></div>
  </div>
  <div data-v="item" class="hide"></div>`;
  root.querySelector('[data-nuevo]').onclick = () => editar(null);
  root.querySelector('[data-q]').addEventListener('input', paint);
  root.querySelector('[data-lista]').addEventListener('click', e => { const r = e.target.closest('[data-it]'); if (r) transicion('abrir', () => abrir(r.dataset.it), () => root.querySelector('[data-v]:not(.hide)')); });
  root.querySelector('[data-v="item"]').addEventListener('click', onItem);
  on(w => { if (w === 'remote' && root.closest('.view.on')) load(true); });
}

export function show() { abierto = null; vista(); load(); }

function vista() {
  root.querySelector('[data-v="lista"]').classList.toggle('hide', !!abierto);
  root.querySelector('[data-v="item"]').classList.toggle('hide', !abierto);
}

async function load(silent = false) {
  const id = ++req;
  if (!silent && !items.length) root.querySelector('[data-lista]').innerHTML = '<div class="empty">Cargando…</div>';
  try {
    const r = await api('/api/inventario'); if (id !== req) return;
    items = r.items; paint();
    if (abierto) { if (items.some(x => x.id === abierto)) paintItem(); else { abierto = null; vista(); } }
  } catch (e) { if (e.status !== 401) toast(e.message, true); }
}

const bajo = it => it.minimo > 0 && it.stock <= it.minimo;

function paint() {
  const q = root.querySelector('[data-q]').value.trim().toLowerCase();
  const vis = items.filter(x => !q || x.nombre.toLowerCase().includes(q));
  const nb = items.filter(bajo).length, valor = items.reduce((a, x) => a + Math.max(0, x.stock) * x.costo_cents, 0);
  root.querySelector('[data-k]').innerHTML = [
    ['Artículos', int(items.length)], ['Por reponer', int(nb)], ['Valor en existencia', money(Math.round(valor))],
  ].map(([l, v], i) => `<div class="kpi${i === 1 && nb ? ' k-bajo' : ''}"><div class="label" style="margin:0">${l}</div><div class="v">${v}</div></div>`).join('');
  root.querySelector('[data-lista]').innerHTML = vis.length ? `<table class="stbl invt"><thead><tr><th>Artículo</th><th class="n">Existencia</th><th class="n dk">Mínimo</th><th class="n dk">Costo</th><th></th></tr></thead><tbody>
    ${vis.sort((a, b) => Number(bajo(b)) - Number(bajo(a)) || a.nombre.localeCompare(b.nombre, 'es')).map(x => `<tr class="rowlink${bajo(x) ? ' bajo' : ''}" data-it="${esc(x.id)}" tabindex="0">
      <td><b>${esc(x.nombre)}</b>${x.reglas.length ? '<small class="muted"> · se descuenta al vender</small>' : ''}${bajo(x) ? ' <span class="tag t-anul">Reponer</span>' : ''}</td>
      <td class="n num"><b>${fmt(x.stock)}</b> <small class="muted">${esc(x.unidad)}</small></td>
      <td class="n num dk muted">${fmt(x.minimo)}</td>
      <td class="n num dk muted">${x.costo_cents ? money(x.costo_cents) : '—'}</td>
      <td class="c-a"><svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></td></tr>`).join('')}</tbody></table>`
    : `<div class="empty">${items.length ? 'Ningún artículo con ese nombre' : 'Agrega papel, tóner y demás materiales para llevar el control'}</div>`;
}

async function abrir(id) {
  abierto = id; movs = []; vista(); paintItem(); window.scrollTo(0, 0);
  try { const r = await api(`/api/inventario/${encodeURIComponent(id)}/movs`); if (abierto === id) { movs = r.movs; paintItem(); } } catch (e) { toast(e.message, true); }
}

const TIPO = { entrada: 'Entrada', salida: 'Salida', ajuste: 'Ajuste', venta: 'Venta' };
const servNombre = r => { const s = S.settings.catalogo.find(x => x.id === r.serv); return s ? `${s.nombre}${r.tam ? ` · ${r.tam}` : ' · todos los tamaños'}` : r.serv; };

function paintItem() {
  const it = items.find(x => x.id === abierto); if (!it) return;
  root.querySelector('[data-v="item"]').innerHTML = `
  <div class="subhead"><button class="back" data-volver>${ICON.left}Inventario</button><h2>${esc(it.nombre)}</h2></div>
  <div class="card ohero${bajo(it) ? ' void' : ''}">
    <div class="row between"><span class="muted">Existencia</span>${bajo(it) ? '<span class="tag t-anul">Reponer</span>' : ''}</div>
    <div class="big num">${fmt(it.stock)} <small>${esc(it.unidad)}</small></div>
    <div class="grid3 invb"><button class="btn" data-mov="entrada">${ICON.plus}Entrada</button><button class="btn line" data-mov="salida">Salida</button><button class="btn line" data-mov="conteo">Conteo</button></div>
  </div>
  <div class="card">
    <div class="row between"><div class="label" style="margin:0">Se descuenta al vender</div><button class="lnk" data-regla>${ICON.plus}Agregar</button></div>
    ${it.reglas.length ? it.reglas.map((r, i) => `<div class="oit"><span class="d">${esc(servNombre(r))}<small>${fmt(r.factor)} ${esc(it.unidad)} por cada unidad vendida</small></span><button class="x" data-quitar="${i}" aria-label="Quitar">×</button></div>`).join('')
      : '<div class="sub-note">Sin productos enlazados: solo cambia con entradas, salidas y conteos.</div>'}
  </div>
  <div class="card">
    <div class="label">Movimientos</div>
    ${movs.length ? `<table class="stbl"><tbody>${movs.map(m => `<tr><td class="num muted">${dmy(m.fecha).slice(0, 5)}</td><td>${TIPO[m.tipo] || m.tipo}${m.numero ? ` · orden N° ${String(m.numero).padStart(6, '0')}` : ''}${m.nota ? `<small class="muted"> · ${esc(m.nota)}</small>` : ''}</td><td class="n num"><b class="${m.cant < 0 ? 'neg' : 'pos'}">${m.cant > 0 ? '+' : ''}${fmt(m.cant)}</b></td></tr>`).join('')}</tbody></table>` : '<div class="empty sm">Sin movimientos</div>'}
  </div>
  <div class="card oacts">
    <button class="btn line block" data-editar>${ICON.edit}Editar artículo</button>
    <button class="btn danger block" data-archivar>Quitar del inventario</button>
  </div>`;
}

async function onItem(e) {
  const it = items.find(x => x.id === abierto); if (!it) return;
  const act = () => root.querySelector('[data-v]:not(.hide)');
  if (e.target.closest('[data-volver]')) return transicion('cerrar', () => { abierto = null; vista(); paint(); }, act);
  const mv = e.target.closest('[data-mov]');
  if (mv) {
    const t = mv.dataset.mov;
    const r = await dialog({
      title: t === 'entrada' ? `Entrada de ${it.nombre}` : t === 'salida' ? `Salida de ${it.nombre}` : `Conteo de ${it.nombre}`,
      fields: [
        { name: 'cant', label: t === 'conteo' ? `Existencia real (${it.unidad})` : `Cantidad (${it.unidad})`, type: 'number', step: 'any', value: t === 'conteo' ? String(it.stock) : '' },
        { name: 'nota', label: 'Nota (opcional)', placeholder: t === 'entrada' ? 'Proveedor, factura…' : t === 'salida' ? 'Daño, uso interno…' : '' },
      ],
      onSubmit: v => api(`/api/inventario/${it.id}/mov`, { method: 'POST', body: { tipo: t, cant: Number(v.cant), nota: v.nota } }),
    });
    if (r) { toast('Guardado'); syncNow(); await load(true); abrir(it.id); }
    return;
  }
  if (e.target.closest('[data-regla]')) return agregarRegla(it);
  const q = e.target.closest('[data-quitar]');
  if (q) { const reglas = it.reglas.filter((_, i) => i !== Number(q.dataset.quitar)); return guardar(it, { reglas }); }
  if (e.target.closest('[data-editar]')) return editar(it);
  if (e.target.closest('[data-archivar]')) {
    const ok = await dialog({ title: `¿Quitar ${it.nombre}?`, html: '<p class="sub-note">Deja de aparecer y de descontarse. Los movimientos quedan guardados.</p>', ok: 'Quitar', danger: true });
    if (!ok) return;
    try { await api(`/api/inventario/${it.id}`, { method: 'PUT', body: { archivado: true } }); toast('Artículo quitado'); abierto = null; vista(); load(true); syncNow(); }
    catch (err) { toast(err.message, true); }
  }
}

async function guardar(it, cambios) {
  try {
    await api(`/api/inventario/${it.id}`, { method: 'PUT', body: { nombre: it.nombre, unidad: it.unidad, minimo: it.minimo, costo_cents: it.costo_cents, reglas: it.reglas, ...cambios } });
    toast('Guardado'); syncNow(); await load(true); paintItem();
  } catch (err) { toast(err.message, true); }
}

async function agregarRegla(it) {
  const servs = S.settings.catalogo.filter(s => !s.oculto && !s.libre);
  const r = await dialog({
    title: 'Descontar al vender',
    html: `<p class="sub-note" style="margin-top:-4px">Cada vez que se registre este producto, se resta del inventario.</p>`,
    fields: [
      { name: 'serv', label: 'Producto', type: 'select', value: servs[0]?.id, options: servs.map(s => [s.id, s.nombre]) },
      { name: 'tam', label: 'Tamaño', type: 'select', value: '', options: [['', 'Todos los tamaños'], ...[...new Set(servs.flatMap(s => s.tams.filter(t => !t.oculto).map(t => t.nombre)))].map(n => [n, n])] },
      { name: 'factor', label: `${it.unidad} por cada unidad vendida`, type: 'number', step: 'any', value: '1' },
    ],
  });
  if (!r) return;
  const s = servs.find(x => x.id === r.serv);
  if (r.tam && !s?.tams.some(t => t.nombre === r.tam)) return toast(`${s?.nombre || 'Ese producto'} no tiene el tamaño ${r.tam}`, true);
  guardar(it, { reglas: [...it.reglas, { serv: r.serv, tam: r.tam, factor: Number(r.factor) || 1 }] });
}

async function editar(it) {
  const r = await dialog({
    title: it ? 'Editar artículo' : 'Nuevo artículo',
    fields: [
      { name: 'nombre', label: 'Nombre', value: it?.nombre || '', placeholder: 'Papel bond carta' },
      { name: 'unidad', label: 'Unidad', type: 'select', value: it?.unidad || 'hoja', options: [...new Set([...(it ? [it.unidad] : []), ...UNIDADES])].map(u => [u, u]) },
      ...(it ? [] : [{ name: 'stock', label: 'Existencia actual', type: 'number', step: 'any', value: '' }]),
      { name: 'minimo', label: 'Avisar cuando queden (mínimo)', type: 'number', step: 'any', value: it ? String(it.minimo) : '' },
      { name: 'costo', label: 'Costo por unidad ($, opcional)', type: 'number', step: '0.0001', value: it?.costo_cents ? centsToInput(it.costo_cents) : '' },
    ],
    onSubmit: v => {
      const body = { nombre: v.nombre, unidad: v.unidad, minimo: Number(v.minimo) || 0, costo_cents: v.costo ? toCents(v.costo) || 0 : 0, reglas: it?.reglas || [], stock: v.stock };
      return it ? api(`/api/inventario/${it.id}`, { method: 'PUT', body }) : api('/api/inventario', { method: 'POST', body });
    },
  });
  if (!r) return;
  toast(it ? 'Guardado' : 'Artículo agregado'); syncNow(); await load(true);
  if (it) paintItem(); else if (r.id) abrir(r.id);
}
