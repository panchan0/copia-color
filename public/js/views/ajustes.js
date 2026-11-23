import { api } from '../api.js';
import { S, on, loadMe, syncNow } from '../store.js';
import { $, toast, dialog, ICON } from '../ui/dom.js';
import { nuevoCliente, listPicker } from '../ui/pickers.js';
import * as maquinas from './maquinas.js';
import { esc, centsToInput, toCents, CATS } from '../util.js';

let root, onLogout = () => {}, catAbierta = 'color', pagina = 'home', paintCat = () => {};
export const setLogout = f => { onLogout = f; };

const ZONAS = ['America/Panama', 'America/Bogota', 'America/Costa_Rica', 'America/Mexico_City', 'America/Guatemala', 'America/Caracas', 'America/Lima', 'America/Santo_Domingo', 'America/New_York'];

export function mount(el) {
  root = el;
  const sub = (id, titulo, cuerpo) => `<div class="ajp hide" data-p="${id}"><div class="subhead"><button class="back" data-home>${ICON.left}Ajustes</button><h2>${titulo}</h2></div>${cuerpo}</div>`;
  const fila = (id, titulo, ico) => `<button class="srow" data-go="${id}"><span class="sico">${ico}</span><span class="st">${titulo}</span><svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button>`;
  root.innerHTML = `
  <div class="ajp" data-p="home">
    <div class="card acct-head"><div class="alogo" data-alogo></div><div class="aname"><b data-aneg></b><small data-email></small></div></div>
    <div class="card setlist">
      ${fila('negocio', 'Negocio y logo', '<svg viewBox="0 0 24 24"><path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6"/></svg>')}
      ${fila('precios', 'Productos y precios', '<svg viewBox="0 0 24 24"><path d="M20 12l-8 8-9-9V3h8z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>')}
      ${fila('clientes', 'Clientes', '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="4"/><path d="M2 21c1-4 4-6 7-6s6 2 7 6M17 11a3 3 0 1 0 0-6M22 21c-.6-2.6-2-4.4-4-5.3"/></svg>')}
      ${fila('operadores', 'Operadores', '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>')}
      ${fila('meta', 'Meta e impuesto', '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>')}
      ${fila('importar', 'Importar registros de máquinas', '<svg viewBox="0 0 24 24"><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 17v4h10v-4"/></svg>')}
      ${fila('cuenta', 'Cuenta y seguridad', '<svg viewBox="0 0 24 24"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>')}
    </div>
  </div>
  ${sub('negocio', 'Negocio y logo', `<div class="card">
      <div class="logorow"><div class="alogo big" data-alogo2></div><div class="row wrap"><label class="btn line sm">Cambiar logo<input type="file" accept="image/*" data-logo hidden></label><button class="lnk an hide" data-logodel>Quitar</button></div></div>
      <div class="grid2" style="margin-top:14px">
        <div class="field span2"><label for="aNeg">Nombre del negocio</label><input class="input" id="aNeg" maxlength="80"></div>
        <div class="field"><label for="eTel">Teléfono</label><input class="input" id="eTel" maxlength="40"></div>
        <div class="field"><label for="eRuc">RUC</label><input class="input" id="eRuc" maxlength="60"></div>
        <div class="field span2"><label for="eMail">Correo</label><input class="input" id="eMail" maxlength="120"></div>
        <div class="field span2"><label for="eDir">Dirección</label><input class="input" id="eDir" maxlength="120"></div>
      </div>
      <button class="btn" style="margin-top:14px" data-neg>Guardar</button>
    </div>`)}
  ${sub('precios', 'Productos y precios', `<div class="card">
      <div class="ptools"><button type="button" data-pcat></button><button class="btn line sm" data-newserv>${ICON.plus}Nuevo</button><button class="btn sm" data-save>Guardar</button></div>
      <div data-precios></div>
    </div>`)}
  ${sub('clientes', 'Clientes', `<div class="card">
      <div class="ptools"><input class="input" data-q type="search" placeholder="Buscar"><button class="btn sm" data-addc>${ICON.plus}Nuevo</button></div>
      <div class="clist" data-clist></div>
    </div>`)}
  ${sub('operadores', 'Operadores', `<div class="card">
      <div class="ptools"><span></span><button class="btn sm" data-addop>${ICON.plus}Nuevo</button></div>
      <div class="clist" data-ops></div>
    </div>`)}
  ${sub('meta', 'Meta e impuesto', `<div class="card">
      <div class="grid2">
        <div class="field"><label for="aMeta">Meta mensual ($)</label><input class="input" id="aMeta" type="number" step="1" min="1" inputmode="decimal"></div>
        <div class="field"><label for="aTasa">ITBMS (%)</label><input class="input" id="aTasa" type="number" step="0.01" min="0" max="30" inputmode="decimal"></div>
        <div class="field"><label for="aDias">Días laborables al mes</label><input class="input" id="aDias" type="number" min="1" max="31" inputmode="numeric"></div>
        <div class="field"><label for="aSem">Días por semana</label><input class="input" id="aSem" type="number" min="1" max="7" inputmode="numeric"></div>
        <div class="field span2"><label for="aTz">Zona horaria</label><select class="input" id="aTz"></select></div>
      </div>
      <div class="sub-note" data-metainfo></div>
      <button class="btn" style="margin-top:14px" data-save>Guardar</button>
    </div>`)}
  ${sub('importar', 'Importar registros de máquinas', '<div data-maq></div>')}
  ${sub('cuenta', 'Cuenta y seguridad', `<div class="card setlist">
      <button class="srow" data-pwd><span class="st">Cambiar contraseña</span><svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button>
      <button class="srow" data-out><span class="st">Cerrar sesión</span><svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button>
      <button class="srow danger" data-outall><span class="st">Cerrar sesión en todos los dispositivos</span><svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button>
    </div>`)}`;
  maquinas.mount(root.querySelector('[data-maq]'));
  root.addEventListener('click', e => {
    const g = e.target.closest('[data-go]'); if (g) return ir(g.dataset.go);
    if (e.target.closest('[data-home]')) ir('home');
  });
  paintCat = listPicker(root.querySelector('[data-pcat]'), { items: () => Object.entries(CATS).map(([id, label]) => ({ id, label })), getValue: () => catAbierta, onChange: v => { leerPrecios(); catAbierta = v; paintPrecios(); } });
  root.querySelector('[data-logo]').addEventListener('change', subirLogo);
  root.querySelector('[data-logodel]').onclick = () => guardarLogo('');
  root.querySelectorAll('[data-save]').forEach(b => b.onclick = guardarAjustes);
  root.querySelector('[data-neg]').onclick = guardarNegocio;
  root.querySelector('[data-newserv]').onclick = nuevoServicio;
  root.querySelector('[data-precios]').addEventListener('click', onCatalogo);
  root.querySelector('[data-addc]').onclick = async () => { const c = await nuevoCliente(); if (c) { toast('Cliente guardado'); paintClientes(); } };
  root.querySelector('[data-addop]').onclick = agregarOperador;
  root.querySelector('[data-ops]').addEventListener('click', quitarOperador);
  root.querySelector('[data-q]').addEventListener('input', paintClientes);
  root.querySelector('[data-clist]').addEventListener('click', onCliente);
  ['aMeta', 'aDias', 'aSem'].forEach(id => $('#' + id, root).addEventListener('input', paintInfo));
  root.querySelector('[data-pwd]').onclick = cambiarPwd;
  root.querySelector('[data-out]').onclick = () => onLogout(false);
  root.querySelector('[data-outall]').onclick = async () => {
    const ok = await dialog({ title: 'Cerrar sesión en todos los dispositivos', html: '<p class="sub-note">Tendrás que volver a iniciar sesión en cada equipo.</p>', ok: 'Cerrar todas', danger: true });
    if (ok) onLogout(true);
  };
  on(what => { if (what === 'remote') { if (!root.closest('.view.on') || pagina === 'home') fill(); paintClientes(); paintOps(); } });
}

let catalogo = null;
export function show() { ir('home'); }

function ir(p) {
  pagina = p;
  root.querySelectorAll('.ajp').forEach(x => x.classList.toggle('hide', x.dataset.p !== p));
  if (p === 'home' || p === 'negocio' || p === 'meta' || p === 'precios') fill();
  if (p === 'clientes') paintClientes();
  if (p === 'operadores') paintOps();
  if (p === 'importar') maquinas.show();
  window.scrollTo(0, 0);
}

const logoHtml = () => { const l = S.settings.empresa.logo; return l ? `<img src="${esc(l)}" alt="">` : `<span>${esc((S.account.business || '?').trim().charAt(0).toUpperCase())}</span>`; };

function subirLogo(e) {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  const img = new Image(), url = URL.createObjectURL(f);
  img.onload = () => {
    const k = Math.min(1, 240 / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    let q = 0.9, d = c.toDataURL('image/jpeg', q);
    while (d.length > 75000 && q > 0.4) { q -= 0.1; d = c.toDataURL('image/jpeg', q); }
    guardarLogo(d);
  };
  img.onerror = () => { URL.revokeObjectURL(url); toast('No se pudo leer la imagen', true); };
  img.src = url;
}

async function guardarLogo(d) {
  const st = structuredClone(S.settings); st.empresa.logo = d;
  try { const r = await api('/api/settings', { method: 'PUT', body: st }); S.settings = r.settings; toast(d ? 'Logo guardado' : 'Logo quitado'); syncNow(); fill(); document.dispatchEvent(new Event('account-changed')); }
  catch (err) { toast(err.message, true); }
}

function fill() {
  const s = S.settings;
  catalogo = structuredClone(s.catalogo);
  $('#aNeg', root).value = S.account.business;
  $('#eTel', root).value = s.empresa.telefono; $('#eMail', root).value = s.empresa.correo;
  $('#eDir', root).value = s.empresa.direccion; $('#eRuc', root).value = s.empresa.ruc;
  $('#aMeta', root).value = s.meta / 100; $('#aDias', root).value = s.dias; $('#aSem', root).value = s.diasSemana;
  const zonas = ZONAS.includes(s.tz) ? ZONAS : [s.tz, ...ZONAS];
  $('#aTz', root).innerHTML = zonas.map(z => `<option value="${esc(z)}"${z === s.tz ? ' selected' : ''}>${esc(z.replace('America/', '').replace(/_/g, ' '))}</option>`).join('');
  $('#aTasa', root).value = s.itbms.tasa;
  root.querySelector('[data-email]').textContent = S.account.email;
  root.querySelector('[data-aneg]').textContent = S.account.business;
  root.querySelector('[data-alogo]').innerHTML = logoHtml();
  root.querySelector('[data-alogo2]').innerHTML = logoHtml();
  root.querySelector('[data-logodel]').classList.toggle('hide', !s.empresa.logo);
  paintCat(); paintPrecios(); paintInfo();
}

const abiertos = new Set();
const esUser = id => String(id).startsWith('u_');
const UNIDADES = [['pág', 'Por página'], ['hoja', 'Por hoja'], ['unidad', 'Por unidad'], ['juego', 'Por juego'], ['pie lineal', 'Por pie lineal']];

function paintPrecios() {
  root.querySelectorAll('.pserv').forEach(d => d.open ? abiertos.add(d.dataset.id) : abiertos.delete(d.dataset.id));
  const servs = catalogo.filter(s => s.cat === catAbierta);
  const acciones = s => `<div class="row wrap pacts">
      ${s.tams.some(t => t.tramos) || s.libre ? '' : `<button class="lnk" data-addtam="${s.id}">+ Tamaño</button>`}
      ${esUser(s.id) ? `<button class="lnk an" data-delserv="${s.id}">Eliminar</button>` : (s.libre ? '' : `<button class="lnk" data-hideserv="${s.id}">${s.oculto ? 'Mostrar' : 'Ocultar'}</button>`)}</div>`;
  root.querySelector('[data-precios]').innerHTML = servs.map(s => {
    const head = `<summary><span class="pserv-n">${esc(s.nombre)}${s.unidad === 'pie lineal' ? ' <span class="muted">· por pie</span>' : ''}</span>${s.oculto ? '<span class="tag t-anul">Oculto</span>' : ''}<svg class="chev" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></summary>${acciones(s)}`;
    const op = abiertos.has(s.id) ? ' open' : '';
    if (s.tams.some(t => t.tramos)) {
      return `<details class="pserv" data-id="${s.id}"${op}>${head}<div style="overflow-x:auto"><table class="dtable ptab"><thead><tr><th>Páginas</th>${s.tams.map(t => `<th>${esc(t.nombre)}</th>`).join('')}</tr></thead><tbody>
        ${s.tams[0].tramos.map((tr, i) => `<tr><td>${i === 0 ? 1 : s.tams[0].tramos[i - 1].hasta + 1} a ${tr.hasta}</td>${s.tams.map(t => `<td><input class="input pin" data-s="${s.id}" data-t="${t.id}" data-i="${i}" type="number" step="0.01" min="0" value="${centsToInput(t.tramos[i].precio)}"></td>`).join('')}</tr>`).join('')}
      </tbody></table></div></details>`;
    }
    return `<details class="pserv${s.oculto ? ' dim' : ''}" data-id="${s.id}"${op}>${head}<div class="pgrid">
      ${s.tams.map(t => `<div class="field${t.oculto ? ' dim' : ''}"><label>${esc(t.nombre)}${s.libre ? '' : ` <button class="lnk mini" data-${esUser(t.id) ? 'deltam' : 'hidetam'}="${s.id}|${t.id}">${esUser(t.id) ? 'quitar' : (t.oculto ? 'mostrar' : 'ocultar')}</button>`}</label>
        <input class="input pin" data-s="${s.id}" data-t="${t.id}" type="number" step="0.01" min="0" inputmode="decimal" value="${centsToInput(t.precio)}"></div>`).join('')}</div></details>`;
  }).join('') || '<div class="empty">Sin productos</div>';
}

const uid = () => 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function guardarCatalogo(msg) {
  try { const r = await api('/api/settings', { method: 'PUT', body: body() }); S.settings = r.settings; catalogo = structuredClone(r.settings.catalogo); toast(msg); syncNow(); paintPrecios(); }
  catch (err) { toast(err.message, true); }
}

async function nuevoServicio() {
  leerPrecios();
  const v = await dialog({
    title: 'Nuevo producto o servicio',
    fields: [
      { name: 'nombre', label: 'Nombre', placeholder: 'Ej. Sticker en vinil, laminado, foto…' },
      { name: 'cat', label: 'Categoría', type: 'select', value: catAbierta, options: Object.entries(CATS) },
      { name: 'unidad', label: 'Se cobra', type: 'select', value: 'unidad', options: UNIDADES },
      { name: 'tam', label: 'Primer tamaño', placeholder: 'Ej. Carta 8.5 x 11' },
      { name: 'precio', label: 'Precio de ese tamaño ($)', type: 'number', step: '0.01' },
      { name: 'color', label: 'Es a color (cuenta como página a color)', type: 'checkbox' },
    ],
    onSubmit(x) {
      if (!x.nombre?.trim()) throw new Error('Escribe el nombre');
      if (!x.tam?.trim()) throw new Error('Escribe el tamaño');
      if (catalogo.some(c => c.cat === x.cat && c.nombre.toLowerCase() === x.nombre.trim().toLowerCase())) throw new Error('Ya existe un producto con ese nombre');
      const p = toCents(x.precio); if (!(p >= 0)) throw new Error('Precio inválido');
      return x;
    },
  });
  if (!v) return;
  catalogo.push({ id: uid(), cat: v.cat, nombre: v.nombre.trim(), color: !!v.color, unidad: v.unidad, tams: [{ id: uid(), nombre: v.tam.trim(), precio: toCents(v.precio) || 0 }] });
  catAbierta = v.cat;
  await guardarCatalogo('Producto agregado');
}

async function onCatalogo(e) {
  const b = e.target.closest('button'); if (!b) return;
  leerPrecios();
  const d = b.dataset;
  if (d.addtam) {
    const s = catalogo.find(x => x.id === d.addtam);
    const v = await dialog({
      title: `Nuevo tamaño · ${s.nombre}`,
      fields: [{ name: 'tam', label: 'Tamaño', placeholder: 'Ej. 13 x 19' }, { name: 'precio', label: 'Precio ($)', type: 'number', step: '0.01' }],
      onSubmit(x) { if (!x.tam?.trim()) throw new Error('Escribe el tamaño'); if (s.tams.some(t => t.nombre.toLowerCase() === x.tam.trim().toLowerCase())) throw new Error('Ese tamaño ya existe'); if (!(toCents(x.precio) >= 0)) throw new Error('Precio inválido'); return x; },
    });
    if (!v) return;
    s.tams.push({ id: uid(), nombre: v.tam.trim(), precio: toCents(v.precio) || 0 });
    return guardarCatalogo('Tamaño agregado');
  }
  if (d.delserv) { catalogo = catalogo.filter(x => x.id !== d.delserv); return guardarCatalogo('Producto eliminado'); }
  if (d.hideserv) { const s = catalogo.find(x => x.id === d.hideserv); s.oculto = !s.oculto; return guardarCatalogo(s.oculto ? 'Producto oculto' : 'Producto visible'); }
  if (d.deltam || d.hidetam) {
    const [sid, tid] = (d.deltam || d.hidetam).split('|');
    const s = catalogo.find(x => x.id === sid);
    if (d.deltam) s.tams = s.tams.filter(t => t.id !== tid);
    else { const t = s.tams.find(x => x.id === tid); t.oculto = !t.oculto; }
    if (!s.tams.length) catalogo = catalogo.filter(x => x.id !== sid);
    return guardarCatalogo('Catálogo actualizado');
  }
}

function leerPrecios() {
  root.querySelectorAll('.pin').forEach(inp => {
    const s = catalogo.find(x => x.id === inp.dataset.s), t = s?.tams.find(x => x.id === inp.dataset.t); if (!t) return;
    const v = inp.value.trim() === '' ? 0 : toCents(inp.value);
    if (!Number.isFinite(v) || v < 0) return;
    if (inp.dataset.i != null) t.tramos[Number(inp.dataset.i)].precio = v; else t.precio = v;
  });
}

function paintInfo() {
  const meta = Number($('#aMeta', root).value), dias = Number($('#aDias', root).value), sem = Number($('#aSem', root).value);
  root.querySelector('[data-metainfo]').textContent = meta > 0 && dias > 0 ? `Meta diaria $${(meta / dias).toFixed(2)}${sem > 0 ? ` · semanal $${(meta / dias * sem).toFixed(2)}` : ''}` : '';
}

function body() {
  leerPrecios();
  return {
    ...S.settings, catalogo,
    meta: toCents($('#aMeta', root).value), dias: Number($('#aDias', root).value), diasSemana: Number($('#aSem', root).value), tz: $('#aTz', root).value,
    itbms: { modo: 'aparte', tasa: Number($('#aTasa', root).value) },
    empresa: { telefono: $('#eTel', root).value, correo: $('#eMail', root).value, direccion: $('#eDir', root).value, ruc: $('#eRuc', root).value, logo: S.settings.empresa.logo || '' },
  };
}

async function guardarAjustes(e) {
  const b = e.currentTarget; b.disabled = true;
  try { const r = await api('/api/settings', { method: 'PUT', body: body() }); S.settings = r.settings; toast('Ajustes guardados'); syncNow(); fill(); }
  catch (err) { toast(err.message, true); }
  b.disabled = false;
}

async function guardarNegocio(e) {
  const b = e.currentTarget; b.disabled = true;
  try {
    await api('/api/account', { method: 'PUT', body: { business: $('#aNeg', root).value } });
    const r = await api('/api/settings', { method: 'PUT', body: body() }); S.settings = r.settings;
    await loadMe(); toast('Guardado'); syncNow(); document.dispatchEvent(new Event('account-changed'));
  } catch (err) { toast(err.message, true); }
  b.disabled = false;
}

function paintOps() {
  const ops = S.settings.operadores || [];
  root.querySelector('[data-ops]').innerHTML = ops.length ? ops.map(o => `<div class="c"><div class="n"><b>${esc(o)}</b></div><button class="btn danger sm" data-delop="${esc(o)}">Quitar</button></div>`).join('') : '<div class="empty">Agrega a las personas que atienden</div>';
}
async function agregarOperador() {
  const r = await dialog({
    title: 'Nuevo operador', fields: [{ name: 'name', label: 'Nombre' }],
    async onSubmit(v) {
      const name = (v.name || '').trim(); if (!name) throw new Error('Escribe el nombre');
      const st = structuredClone(S.settings); if (!st.operadores.includes(name)) st.operadores.push(name);
      const res = await api('/api/settings', { method: 'PUT', body: st }); S.settings = res.settings; syncNow();
    },
  });
  if (r) paintOps();
}
async function quitarOperador(e) {
  const b = e.target.closest('[data-delop]'); if (!b) return;
  const st = structuredClone(S.settings); st.operadores = st.operadores.filter(o => o !== b.dataset.delop);
  try { const res = await api('/api/settings', { method: 'PUT', body: st }); S.settings = res.settings; syncNow(); paintOps(); }
  catch (err) { toast(err.message, true); }
}

function paintClientes() {
  const q = root.querySelector('[data-q]').value.trim().toLowerCase();
  const list = S.clients.filter(c => !q || c.name.toLowerCase().includes(q));
  root.querySelector('[data-clist]').innerHTML = list.length ? list.map(c => `<div class="c"><div class="n"><b>${esc(c.name)}</b>${c.phone || c.email || c.dm || c.ruc ? `<small>${esc([c.phone, c.dm, c.email, c.ruc].filter(Boolean).join(' · '))}</small>` : ''}</div>
    <button class="btn ghost sm" data-ed="${esc(c.id)}">Editar</button><button class="btn danger sm" data-del="${esc(c.id)}">Eliminar</button></div>`).join('')
    : `<div class="empty">${S.clients.length ? 'Sin resultados' : 'No hay clientes guardados'}</div>`;
}

async function onCliente(e) {
  const ed = e.target.closest('[data-ed]'), del = e.target.closest('[data-del]');
  if (ed) {
    const c = S.clients.find(x => x.id === ed.dataset.ed); if (!c) return;
    const r = await dialog({
      title: 'Editar cliente',
      fields: [{ name: 'name', label: 'Nombre o empresa', value: c.name }, { name: 'phone', label: 'Celular', type: 'tel', value: c.phone || '' },
        { name: 'dm', label: 'DM / Instagram', value: c.dm || '' }, { name: 'email', label: 'Correo', type: 'email', value: c.email || '' }, { name: 'ruc', label: 'RUC / cédula', value: c.ruc || '' }],
      onSubmit: v => api(`/api/clients/${c.id}`, { method: 'PUT', body: v }),
    });
    if (r) { Object.assign(c, r.client); toast('Cliente actualizado'); syncNow(); paintClientes(); }
  } else if (del) {
    const c = S.clients.find(x => x.id === del.dataset.del); if (!c) return;
    const ok = await dialog({ title: `¿Eliminar a ${c.name}?`, html: '<p class="sub-note">Las órdenes ya registradas conservan el nombre.</p>', ok: 'Eliminar', danger: true });
    if (!ok) return;
    try { await api(`/api/clients/${c.id}`, { method: 'DELETE' }); S.clients = S.clients.filter(x => x.id !== c.id); toast('Cliente eliminado'); syncNow(); paintClientes(); }
    catch (err) { toast(err.message, true); }
  }
}

async function cambiarPwd() {
  const r = await dialog({
    title: 'Cambiar contraseña',
    fields: [{ name: 'actual', label: 'Contraseña actual', type: 'password', autocomplete: 'current-password' }, { name: 'nueva', label: 'Contraseña nueva (mínimo 8)', type: 'password', autocomplete: 'new-password' }],
    onSubmit: v => api('/api/account/password', { method: 'POST', body: v }),
  });
  if (r) toast('Contraseña actualizada');
}
