import { api } from '../api.js';
import { S, on, loadMe, syncNow } from '../store.js';
import { $, toast, dialog, choice, ICON } from '../ui/dom.js';
import { nuevoCliente, listPicker, crearOperador } from '../ui/pickers.js';
import * as maquinas from './maquinas.js';
import * as canales from './canales.js';
import { imprimirFactura, numFac } from '../facturas.js';
import { transicion } from '../ui/motion.js';
import { ci } from '../icons.js';
import { prefs, guardarPref } from '../tema.js';
import { docAssets, guardarAsset, prepararImagen } from '../assets.js';
function paintPref() { const p = prefs(); root.querySelectorAll('[data-tema] button').forEach(b => b.classList.toggle('sel', b.dataset.t === p.tema)); root.querySelector('[data-calma]').checked = p.calma; }
import { salesTable, bindAbrir } from '../ui/salestable.js';
import { today } from '../store.js';
import { money, int, MESES, cap, startOfMonth, endOfMonth, addMonths, parseD, opCode } from '../util.js';

let anMes = null, anReq = 0;
async function loadAnuladas() {
  anMes = anMes || startOfMonth(today());
  const d = parseD(anMes), id = ++anReq;
  root.querySelector('[data-ames]').textContent = `${cap(MESES[d.getUTCMonth()])} ${d.getUTCFullYear()}`;
  root.querySelector('[data-anext]').disabled = anMes >= startOfMonth(today());
  const list = root.querySelector('[data-alist]');
  list.innerHTML = salesTable([], { loading: true });
  try {
    const r = await api(`/api/orders?estado=anulada&from=${anMes}&to=${endOfMonth(anMes)}`);
    if (id !== anReq) return;
    root.querySelector('[data-an1]').textContent = `${int(r.sales.length)} ${r.sales.length === 1 ? 'orden' : 'órdenes'}`;
    root.querySelector('[data-an2]').textContent = money(r.sales.reduce((a, v) => a + v.total_cents, 0));
    list.innerHTML = salesTable(r.sales, { fecha: true, empty: 'Sin órdenes anuladas en este mes' });
  } catch (e) { if (id === anReq) { list.innerHTML = ''; toast(e.message, true); } }
}
import { esc, centsToInput, toCents, CATS } from '../util.js';

let root, onLogout = () => {}, catAbierta = 'color', pag = 'home', paintCat = () => {};
export const setLogout = f => { onLogout = f; };

const ZONAS = ['America/Panama', 'America/Bogota', 'America/Costa_Rica', 'America/Mexico_City', 'America/Guatemala', 'America/Caracas', 'America/Lima', 'America/Santo_Domingo', 'America/New_York'];

export function mount(el) {
  root = el;
  const sub = (id, titulo, cuerpo) => `<div class="ajp hide" data-p="${id}"><div class="subhead"><button class="back" data-home>${ICON.left}Cuenta</button><h2>${titulo}</h2></div>${cuerpo}</div>`;
  const fila = (id, titulo) => `<button class="srow" data-go="${id}"><span class="sico">${ci(id)}</span><span class="st">${titulo}</span><svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button>`;
  root.innerHTML = `
  <div class="ajp" data-p="home">
    <div class="card acct-head"><div class="alogo" data-alogo></div><div class="aname"><b data-aneg></b><small data-email></small></div></div>
    <div class="card setlist">
      ${fila('negocio', 'Negocio y logo')}
      ${fila('precios', 'Productos y precios')}
      ${fila('clientes', 'Clientes')}
      ${fila('operadores', 'Operadores')}
      ${fila('meta', 'Meta e impuesto')}
      ${fila('canales', 'Pedidos por WhatsApp, correo y web')}
      ${fila('facturas', 'Facturas')}
      <button class="srow solomovil" data-irinv><span class="sico">${ci('inventario')}</span><span class="st">Inventario</span><svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button>
      ${fila('importar', 'Importar registros de máquinas')}
      ${fila('anuladas', 'Órdenes anuladas')}
      ${fila('personalizar', 'Personalizar')}
      ${fila('cuenta', 'Cuenta y seguridad')}
    </div>
  </div>
  ${sub('negocio', 'Negocio y logo', `<div class="card">
      <div class="logorow"><div class="alogo big" data-alogo2></div><div class="row wrap"><label class="btn line sm">Cambiar logo<input type="file" accept="image/*" data-logo hidden></label><button class="lnk an hide" data-logodel>Quitar</button></div></div>
      <div class="grid2" style="margin-top:14px">
        <div class="field span2"><label for="aNeg">Nombre del negocio</label><input class="input" id="aNeg" maxlength="80"></div>
        <div class="field"><label for="eTel">Teléfono</label><input class="input" id="eTel" maxlength="40"></div>
        <div class="field"><label for="eRuc">RUC</label><div class="rucdv"><input class="input" id="eRuc" maxlength="60"><input class="input" id="eDv" maxlength="4" placeholder="DV" aria-label="DV"></div></div>
        <div class="field span2"><label for="eMail">Correo</label><input class="input" id="eMail" maxlength="120"></div>
        <div class="field span2"><label for="eDir">Dirección</label><input class="input" id="eDir" maxlength="120"></div>
      </div>
      <button class="btn" style="margin-top:14px" data-neg>Guardar</button>
    </div>
    <div class="card">
      <div class="label">Órdenes de trabajo y reportes</div>
      <div class="docimgs">
        ${[['logo_doc', 'Logo'], ['sello_pagado', 'Sello de cobrado'], ['sello_pendiente', 'Sello de pendiente'], ['sello_credito', 'Sello de crédito']].map(([k, l]) => `<div class="docimg">
          <div class="dprev" data-prev="${k}"></div>
          <div class="dinfo"><b>${l}</b><div class="row wrap"><label class="btn line sm">Cambiar<input type="file" accept="image/*" data-asset="${k}" hidden></label><button class="lnk an hide" data-assetdel="${k}">Quitar</button></div></div>
        </div>`).join('')}
      </div>
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
  ${sub('canales', 'Pedidos por WhatsApp, correo y web', '<div data-canales></div>')}
  ${sub('facturas', 'Facturas', `<div class="card"><input class="input" data-fq type="search" placeholder="Buscar cliente, RUC o número" style="margin-bottom:10px"><div data-flist></div></div>`)}
  ${sub('anuladas', 'Órdenes anuladas', `<div class="toolbar"><button class="iconbtn" data-aprev aria-label="Mes anterior">${ICON.left}</button><div class="datebtn" data-ames></div><button class="iconbtn" data-anext aria-label="Mes siguiente">${ICON.right}</button></div>
    <div class="card"><div class="ohead"><span data-an1></span><b class="num" data-an2></b></div><div data-alist></div></div>`)}
  ${sub('personalizar', 'Personalizar', `<div class="card">
      <div class="label">Tema</div>
      <div class="seg tema" data-tema><button data-t="claro">${ci('sun')}Claro</button><button data-t="oscuro">${ci('moon')}Oscuro</button><button data-t="auto">${ci('sunmoon')}Automático</button></div>
    </div>
    <div class="card setlist">
      <label class="srow sw"><span class="st">Reducir animaciones</span><input type="checkbox" class="switch" data-calma></label>
    </div>`)}
  ${sub('cuenta', 'Cuenta y seguridad', `<div class="card setlist">
      <button class="srow" data-2fa><span class="st">Verificación en dos pasos<small data-2fast></small></span><svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button>
      <button class="srow" data-recode><span class="st">Código de recuperación<small data-recst></small></span><svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button>
      <button class="srow" data-pwd><span class="st">Cambiar contraseña</span><svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button>
      <button class="srow" data-out><span class="st">Cerrar sesión</span><svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button>
      <button class="srow danger" data-outall><span class="st">Cerrar sesión en todos los dispositivos</span><svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button>
    </div>`)}`;
  maquinas.mount(root.querySelector('[data-maq]'));
  canales.mount(root.querySelector('[data-canales]'));
  root.querySelector('[data-irinv]').onclick = () => { location.hash = '#inventario'; };
  root.querySelector('[data-fq]').addEventListener('input', paintFacturas);
  root.querySelector('[data-flist]').addEventListener('click', onFactura);
  root.querySelector('[data-tema]').addEventListener('click', e => { const b = e.target.closest('button[data-t]'); if (!b) return; guardarPref({ tema: b.dataset.t }); paintPref(); });
  root.querySelector('[data-calma]').addEventListener('change', e => { guardarPref({ calma: e.target.checked }); paintPref(); });
  bindAbrir(root.querySelector('[data-alist]'));
  root.querySelector('[data-aprev]').onclick = () => { anMes = addMonths(anMes, -1); loadAnuladas(); };
  root.querySelector('[data-anext]').onclick = () => { anMes = addMonths(anMes, 1); loadAnuladas(); };
  root.addEventListener('click', e => {
    const act = () => root.querySelector('.ajp:not(.hide)');
    const g = e.target.closest('[data-go]'); if (g) return transicion('abrir', () => ir(g.dataset.go), act);
    if (e.target.closest('[data-home]')) transicion('cerrar', () => ir('home'), act);
  });
  paintCat = listPicker(root.querySelector('[data-pcat]'), { items: () => Object.entries(CATS).map(([id, label]) => ({ id, label })), getValue: () => catAbierta, onChange: v => { leerPrecios(); catAbierta = v; paintPrecios(); } });
  root.querySelector('[data-logo]').addEventListener('change', subirLogo);
  root.querySelectorAll('[data-asset]').forEach(i => i.addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try { const d = await prepararImagen(f, { max: e.target.dataset.asset === 'logo_doc' ? 900 : 700 }); await guardarAsset(e.target.dataset.asset, d); toast('Imagen guardada'); paintDocs(); }
    catch (err) { toast(err.message, true); }
  }));
  root.querySelectorAll('[data-assetdel]').forEach(b => b.onclick = async () => {
    try { await guardarAsset(b.dataset.assetdel, ''); toast('Imagen quitada'); paintDocs(); } catch (err) { toast(err.message, true); }
  });
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
  root.querySelector('[data-recode]').onclick = codigoRecuperacion;
  root.querySelector('[data-2fa]').onclick = dosPasos;
  root.querySelector('[data-out]').onclick = () => onLogout(false);
  root.querySelector('[data-outall]').onclick = async () => {
    const ok = await dialog({ title: 'Cerrar sesión en todos los dispositivos', html: '<p class="sub-note">Tendrás que volver a iniciar sesión en cada equipo.</p>', ok: 'Cerrar todas', danger: true });
    if (ok) onLogout(true);
  };
  on(what => { if (what === 'remote') { if (!root.closest('.view.on') || pag === 'home') fill(); paintClientes(); paintOps(); } });
}

let catalogo = null;
export const pagina = () => pag;
export function show(sub) { ir(sub && root.querySelector(`.ajp[data-p="${sub}"]`) ? sub : 'home'); }

function ir(p) {
  pag = p;
  root.querySelectorAll('.ajp').forEach(x => x.classList.toggle('hide', x.dataset.p !== p));
  if (p === 'home' || p === 'negocio' || p === 'meta' || p === 'precios') fill();
  if (p === 'clientes') paintClientes();
  if (p === 'negocio') paintDocs();
  if (p === 'operadores') paintOps();
  if (p === 'importar') maquinas.show();
  if (p === 'canales') canales.show();
  if (p === 'facturas') loadFacturas();
  if (p === 'anuladas') loadAnuladas();
  if (p === 'personalizar') paintPref();
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
  $('#eDir', root).value = s.empresa.direccion; $('#eRuc', root).value = s.empresa.ruc; $('#eDv', root).value = s.empresa.dv || '';
  $('#aMeta', root).value = s.meta / 100; $('#aDias', root).value = s.dias; $('#aSem', root).value = s.diasSemana;
  const zonas = ZONAS.includes(s.tz) ? ZONAS : [s.tz, ...ZONAS];
  $('#aTz', root).innerHTML = zonas.map(z => `<option value="${esc(z)}"${z === s.tz ? ' selected' : ''}>${esc(z.replace('America/', '').replace(/_/g, ' '))}</option>`).join('');
  $('#aTasa', root).value = s.itbms.tasa;
  root.querySelector('[data-email]').textContent = S.account.email;
  root.querySelector('[data-aneg]').textContent = S.account.business;
  paintRecSt();
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
    empresa: { telefono: $('#eTel', root).value, correo: $('#eMail', root).value, direccion: $('#eDir', root).value, ruc: $('#eRuc', root).value, dv: $('#eDv', root).value, logo: S.settings.empresa.logo || '' },
  };
}

async function guardarAjustes(e) {
  const b = e.currentTarget; b.disabled = true;
  try { const r = await api('/api/settings', { method: 'PUT', body: body() }); S.settings = r.settings; toast("Guardado"); syncNow(); fill(); }
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
  root.querySelector('[data-ops]').innerHTML = ops.length ? ops.map(o => `<div class="c"><span class="opbadge num">${esc(opCode(o))}</span><div class="n"><b>${esc(o.n)}</b></div><button class="btn danger sm" data-delop="${esc(o.n)}">Quitar</button></div>`).join('') : '<div class="empty">Agrega a las personas que atienden</div>';
}
async function agregarOperador() {
  if (await crearOperador()) paintOps();
}
async function quitarOperador(e) {
  const b = e.target.closest('[data-delop]'); if (!b) return;
  const st = structuredClone(S.settings); st.operadores = st.operadores.filter(o => o.n !== b.dataset.delop);
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
        { name: 'dm', label: 'DM / Instagram', value: c.dm || '' }, { name: 'email', label: 'Correo', type: 'email', value: c.email || '' }, { name: 'ruc', label: 'RUC / cédula', value: c.ruc || '' },
        { name: 'dv', label: 'DV', value: c.dv || '' }, { name: 'direccion', label: 'Dirección', value: c.direccion || '' }],
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

async function codigoRecuperacion() {
  const r = await dialog({
    title: S.account.recovery ? 'Crear un código nuevo' : 'Crear código de recuperación',
    html: S.account.recovery ? '<p class="sub-note">El código anterior dejará de funcionar.</p>' : '',
    fields: [{ name: 'actual', label: 'Tu contraseña', type: 'password', autocomplete: 'current-password' }],
    ok: 'Crear código',
    onSubmit: v => api('/api/account/recovery', { method: 'POST', body: v }),
  });
  if (!r?.code) return;
  S.account.recovery = true; paintRecSt();
  await choice({
    title: 'Código de recuperación',
    html: `<div class="reccode num">${esc(r.code)}</div><p class="sub-note">Guárdalo en un lugar seguro. Sirve una sola vez para entrar con “¿Olvidaste tu contraseña?” y no se vuelve a mostrar.</p>`,
    buttons: [{ label: 'Copiar', value: 'c', cls: 'line' }, { label: 'Listo', value: 'ok' }],
  }).then(v => { if (v === 'c') navigator.clipboard?.writeText(r.code).then(() => toast('Código copiado'), () => {}); });
}
async function paintDocs() {
  const a = await docAssets();
  const def = { sello_pagado: 'CANCELADO', sello_pendiente: 'PENDIENTE', sello_credito: 'CRÉDITO', logo_doc: '' };
  root.querySelectorAll('[data-prev]').forEach(d => {
    const k = d.dataset.prev;
    d.innerHTML = a[k] ? `<img src="${esc(a[k])}" alt="">` : def[k] ? `<span class="sello-def">${def[k]}</span>` : `<span class="muted">${esc(S.account.business)}</span>`;
    root.querySelector(`[data-assetdel="${k}"]`).classList.toggle('hide', !a[k]);
  });
}
function paintRecSt() {
  const e = root.querySelector('[data-recst]'); if (e) e.textContent = S.account.recovery ? 'Activo' : 'Sin crear';
  const f = root.querySelector('[data-2fast]'); if (f) f.textContent = S.account.totp ? 'Activada' : 'Desactivada';
}

let qrLib = null;
function cargarQR() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  return qrLib ||= new Promise((ok, ko) => { const s = document.createElement('script'); s.src = '/vendor/qrcode.min.js'; s.onload = () => ok(window.qrcode); s.onerror = () => { qrLib = null; ko(new Error('No se pudo cargar el código QR')); }; document.head.appendChild(s); });
}

async function dosPasos() {
  if (S.account.totp) {
    const r = await dialog({
      title: 'Desactivar verificación en dos pasos',
      fields: [{ name: 'actual', label: 'Tu contraseña', type: 'password', autocomplete: 'current-password' }, { name: 'code', label: 'Código de la aplicación', placeholder: '000000' }],
      ok: 'Desactivar', onSubmit: v => api('/api/account/2fa/disable', { method: 'POST', body: v }),
    });
    if (r) { S.account.totp = false; paintRecSt(); toast('Verificación en dos pasos desactivada'); }
    return;
  }
  const r = await dialog({
    title: 'Activar verificación en dos pasos',
    html: '<p class="sub-note">Al entrar se pedirá, además de la contraseña, un código de una aplicación como Google Authenticator, Microsoft Authenticator o las Contraseñas del iPhone.</p>',
    fields: [{ name: 'actual', label: 'Tu contraseña', type: 'password', autocomplete: 'current-password' }],
    ok: 'Continuar', onSubmit: v => api('/api/account/2fa/setup', { method: 'POST', body: v }),
  });
  if (!r?.secret) return;
  let svg = '';
  try { const q = (await cargarQR())(0, 'M'); q.addData(r.uri); q.make(); svg = q.createSvgTag(4, 8); } catch { /* sin QR */ }
  const ok = await dialog({
    title: 'Escanea el código',
    html: `<div class="qrbox">${svg}</div><p class="sub-note">Escanéalo con la aplicación de autenticación${'ontouchstart' in window ? ' o toca <a href="' + esc(r.uri) + '">agregar a la app</a>' : ''}. También puedes escribir esta clave:</p><div class="reccode num">${esc(r.secret.match(/.{1,4}/g).join(' '))}</div>`,
    fields: [{ name: 'code', label: 'Código de 6 dígitos que muestra la app', placeholder: '000000' }],
    ok: 'Activar', onSubmit: v => api('/api/account/2fa/enable', { method: 'POST', body: v }),
  });
  if (ok) { S.account.totp = true; paintRecSt(); toast('Verificación en dos pasos activada'); }
}

async function cambiarPwd() {
  const r = await dialog({
    title: 'Cambiar contraseña',
    fields: [{ name: 'actual', label: 'Contraseña actual', type: 'password', autocomplete: 'current-password' }, { name: 'nueva', label: 'Contraseña nueva (mínimo 8)', type: 'password', autocomplete: 'new-password' }],
    onSubmit: v => api('/api/account/password', { method: 'POST', body: v }),
  });
  if (r) toast('Contraseña actualizada');
}

/* ---------- Facturas ---------- */
let facturas = [];
async function loadFacturas() {
  const l = root.querySelector('[data-flist]');
  if (!facturas.length) l.innerHTML = '<div class="empty">Cargando…</div>';
  try { facturas = (await api('/api/invoices')).invoices; paintFacturas(); } catch (e) { toast(e.message, true); }
}
function paintFacturas() {
  const q = root.querySelector('[data-fq]').value.trim().toLowerCase();
  const vis = facturas.filter(f => !q || `${f.receptor.nombre} ${f.receptor.ruc} ${numFac(f.numero)}`.toLowerCase().includes(q));
  root.querySelector('[data-flist]').innerHTML = vis.length ? `<table class="stbl"><thead><tr><th>N°</th><th>Fecha</th><th>Cliente</th><th class="n">Total</th><th></th></tr></thead><tbody>
    ${vis.map(f => `<tr class="rowlink${f.estado === 'anulada' ? ' void' : ''}" data-fac="${esc(f.id)}" tabindex="0"><td class="num">${numFac(f.numero)}</td><td class="num muted">${esc(f.fecha.split('-').reverse().join('/'))}</td>
      <td>${esc(f.receptor.nombre)}${f.receptor.ruc ? `<small class="muted"> · ${esc(f.receptor.ruc)}${f.receptor.dv ? ` DV ${esc(f.receptor.dv)}` : ''}</small>` : ''}${f.estado === 'anulada' ? ' <span class="tag t-anul">Anulada</span>' : ''}</td>
      <td class="n num"><b>${money(f.total_cents)}</b></td><td class="c-a"><svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></td></tr>`).join('')}</tbody></table>`
    : `<div class="empty">${facturas.length ? 'Ninguna factura coincide' : 'Las facturas se crean desde una orden o seleccionando varias en Órdenes'}</div>`;
}
async function onFactura(e) {
  const tr = e.target.closest('[data-fac]'); if (!tr) return;
  const f = facturas.find(x => x.id === tr.dataset.fac); if (!f) return;
  const r = await choice({
    title: `Factura N° ${numFac(f.numero)}`,
    html: `<p class="sub-note" style="margin:-6px 0 4px">${esc(f.receptor.nombre)} · ${money(f.total_cents)}</p>`,
    buttons: [
      ...(f.estado === 'anulada' ? [] : [{ label: 'Anular', value: 'anular', cls: 'danger' }]),
      { label: 'Ver órdenes', value: 'ordenes', cls: 'line' },
      { label: `${ICON.print}Imprimir`, value: 'print' },
    ],
  });
  if (r === 'print') imprimirFactura(f);
  else if (r === 'ordenes' && f.sale_ids[0]) location.hash = `#orden=${f.sale_ids[0]}`;
  else if (r === 'anular') {
    const ok = await dialog({ title: `¿Anular la factura N° ${numFac(f.numero)}?`, html: '<p class="sub-note">Sus órdenes se podrán facturar de nuevo.</p>', ok: 'Anular', danger: true });
    if (!ok) return;
    try { await api(`/api/invoices/${f.id}/void`, { method: 'POST', body: {} }); toast('Factura anulada'); syncNow(); loadFacturas(); } catch (err) { toast(err.message, true); }
  }
}
