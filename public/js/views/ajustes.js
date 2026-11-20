import { api } from '../api.js';
import { S, on, loadMe, syncNow } from '../store.js';
import { $, toast, dialog, ICON } from '../ui/dom.js';
import { nuevoCliente } from '../ui/pickers.js';
import { esc, centsToInput, toCents } from '../util.js';

let root, onLogout = () => {};
export const setLogout = f => { onLogout = f; };

const ZONAS = ['America/Panama', 'America/Bogota', 'America/Costa_Rica', 'America/Mexico_City', 'America/Guatemala', 'America/Caracas', 'America/Lima', 'America/Santo_Domingo', 'America/New_York'];

export function mount(el) {
  root = el;
  root.innerHTML = `
  <div class="lay-aj">
    <div>
      <div class="card">
        <div class="label">Negocio</div>
        <div class="field"><label for="aNeg">Nombre</label><input class="input" id="aNeg" maxlength="80"></div>
        <button class="btn" style="margin-top:12px" data-neg>Guardar</button>
      </div>
      <div class="card">
        <div class="label">Precios por página a color</div>
        <div class="grid2">
          <div class="field"><label for="pIC">Impresión carta</label><input class="input" id="pIC" type="number" step="0.01" min="0" inputmode="decimal"></div>
          <div class="field"><label for="pIL">Impresión legal</label><input class="input" id="pIL" type="number" step="0.01" min="0" inputmode="decimal"></div>
          <div class="field"><label for="pCC">Copia carta</label><input class="input" id="pCC" type="number" step="0.01" min="0" inputmode="decimal"></div>
          <div class="field"><label for="pCL">Copia legal</label><input class="input" id="pCL" type="number" step="0.01" min="0" inputmode="decimal"></div>
        </div>
        <button class="btn" style="margin-top:12px" data-save>Guardar</button>
      </div>
    </div>
    <div>
      <div class="card">
        <div class="label">Meta</div>
        <div class="grid2">
          <div class="field"><label for="aMeta">Meta mensual ($)</label><input class="input" id="aMeta" type="number" step="1" min="1" inputmode="decimal"></div>
          <div class="field"><label for="aDias">Días laborables al mes</label><input class="input" id="aDias" type="number" min="1" max="31" inputmode="numeric"></div>
          <div class="field"><label for="aSem">Días laborables por semana</label><input class="input" id="aSem" type="number" min="1" max="7" inputmode="numeric"></div>
          <div class="field"><label for="aTz">Zona horaria</label><select class="input" id="aTz"></select></div>
        </div>
        <div class="sub-note" data-metainfo></div>
        <button class="btn" style="margin-top:12px" data-save>Guardar</button>
      </div>
      <div class="card">
        <div class="label">ITBMS</div>
        <div class="grid2">
          <div class="field"><label for="aIt">Aplicación</label><select class="input" id="aIt">
            <option value="incluido">Incluido en el precio</option><option value="aparte">Se suma al precio</option><option value="no">No aplica</option></select></div>
          <div class="field"><label for="aTasa">Tasa (%)</label><input class="input" id="aTasa" type="number" step="0.01" min="0" max="30" inputmode="decimal"></div>
        </div>
        <button class="btn" style="margin-top:12px" data-save>Guardar</button>
      </div>
      <div class="card">
        <div class="label">Cuenta</div>
        <div data-email style="font-weight:600;margin-bottom:12px"></div>
        <div class="row" style="flex-wrap:wrap">
          <button class="btn line" data-pwd>Cambiar contraseña</button>
          <button class="btn line" data-out>Cerrar sesión</button>
          <button class="btn danger" data-outall>Cerrar sesión en todos los dispositivos</button>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="row between"><div class="label" style="margin:0">Clientes</div><button class="btn sm" data-addc>${ICON.plus}Nuevo</button></div>
      <input class="input" data-q placeholder="Buscar…" style="margin:12px 0 4px">
      <div class="clist" data-clist></div>
    </div>
  </div>`;
  root.querySelectorAll('[data-save]').forEach(b => b.onclick = guardarAjustes);
  root.querySelector('[data-neg]').onclick = guardarNegocio;
  root.querySelector('[data-addc]').onclick = async () => { const c = await nuevoCliente(); if (c) { toast('Cliente guardado'); paintClientes(); } };
  root.querySelector('[data-q]').addEventListener('input', paintClientes);
  root.querySelector('[data-clist]').addEventListener('click', onCliente);
  ['aMeta', 'aDias', 'aSem'].forEach(id => $('#' + id, root).addEventListener('input', paintInfo));
  root.querySelector('[data-pwd]').onclick = cambiarPwd;
  root.querySelector('[data-out]').onclick = () => onLogout(false);
  root.querySelector('[data-outall]').onclick = async () => {
    const ok = await dialog({ title: 'Cerrar sesión en todos los dispositivos', html: '<p class="sub-note">Tendrás que volver a iniciar sesión en cada equipo.</p>', ok: 'Cerrar todas', danger: true });
    if (ok) onLogout(true);
  };
  on(what => { if (what === 'remote') { if (!root.closest('.view.on')) fill(); paintClientes(); } });
}

export function show() { fill(); paintClientes(); }

function fill() {
  const s = S.settings;
  $('#aNeg', root).value = S.account.business;
  $('#pIC', root).value = centsToInput(s.precios.imp.carta); $('#pIL', root).value = centsToInput(s.precios.imp.legal);
  $('#pCC', root).value = centsToInput(s.precios.cop.carta); $('#pCL', root).value = centsToInput(s.precios.cop.legal);
  $('#aMeta', root).value = s.meta / 100; $('#aDias', root).value = s.dias; $('#aSem', root).value = s.diasSemana;
  const zonas = ZONAS.includes(s.tz) ? ZONAS : [s.tz, ...ZONAS];
  $('#aTz', root).innerHTML = zonas.map(z => `<option value="${esc(z)}"${z === s.tz ? ' selected' : ''}>${esc(z.replace('America/', '').replace(/_/g, ' '))}</option>`).join('');
  $('#aIt', root).value = s.itbms.modo; $('#aTasa', root).value = s.itbms.tasa;
  root.querySelector('[data-email]').textContent = S.account.email;
  paintInfo();
}

function paintInfo() {
  const meta = Number($('#aMeta', root).value), dias = Number($('#aDias', root).value), sem = Number($('#aSem', root).value);
  root.querySelector('[data-metainfo]').textContent = meta > 0 && dias > 0
    ? `Meta diaria $${(meta / dias).toFixed(2)}${sem > 0 ? ` · semanal $${(meta / dias * sem).toFixed(2)}` : ''}` : '';
}

async function guardarAjustes(e) {
  const body = {
    precios: { imp: { carta: toCents($('#pIC', root).value), legal: toCents($('#pIL', root).value) }, cop: { carta: toCents($('#pCC', root).value), legal: toCents($('#pCL', root).value) } },
    meta: toCents($('#aMeta', root).value), dias: Number($('#aDias', root).value), diasSemana: Number($('#aSem', root).value), tz: $('#aTz', root).value,
    itbms: { modo: $('#aIt', root).value, tasa: Number($('#aTasa', root).value) },
  };
  const b = e.currentTarget; b.disabled = true;
  try { const r = await api('/api/settings', { method: 'PUT', body }); S.settings = r.settings; toast('Ajustes guardados'); syncNow(); fill(); }
  catch (err) { toast(err.message, true); }
  b.disabled = false;
}

async function guardarNegocio(e) {
  const b = e.currentTarget; b.disabled = true;
  try { await api('/api/account', { method: 'PUT', body: { business: $('#aNeg', root).value } }); await loadMe(); toast('Guardado'); syncNow(); document.dispatchEvent(new Event('account-changed')); }
  catch (err) { toast(err.message, true); }
  b.disabled = false;
}

function paintClientes() {
  const q = root.querySelector('[data-q]').value.trim().toLowerCase();
  const list = S.clients.filter(c => !q || c.name.toLowerCase().includes(q));
  root.querySelector('[data-clist]').innerHTML = list.length ? list.map(c => `<div class="c"><div class="n"><b>${esc(c.name)}</b>${c.phone || c.ruc ? `<small>${esc([c.phone, c.ruc].filter(Boolean).join(' · '))}</small>` : ''}</div>
    <button class="btn ghost sm" data-ed="${esc(c.id)}">Editar</button><button class="btn danger sm" data-del="${esc(c.id)}">Eliminar</button></div>`).join('')
    : `<div class="empty">${S.clients.length ? 'Sin resultados' : 'No hay clientes guardados'}</div>`;
}

async function onCliente(e) {
  const ed = e.target.closest('[data-ed]'), del = e.target.closest('[data-del]');
  if (ed) {
    const c = S.clients.find(x => x.id === ed.dataset.ed); if (!c) return;
    const r = await dialog({
      title: 'Editar cliente',
      fields: [{ name: 'name', label: 'Nombre o empresa', value: c.name }, { name: 'phone', label: 'Teléfono', type: 'tel', value: c.phone || '' }, { name: 'ruc', label: 'RUC / cédula', value: c.ruc || '' }],
      onSubmit: v => api(`/api/clients/${c.id}`, { method: 'PUT', body: v }),
    });
    if (r) { Object.assign(c, r.client); toast('Cliente actualizado'); syncNow(); paintClientes(); }
  } else if (del) {
    const c = S.clients.find(x => x.id === del.dataset.del); if (!c) return;
    const ok = await dialog({ title: `¿Eliminar a ${c.name}?`, html: '<p class="sub-note">Las ventas ya registradas conservan el nombre.</p>', ok: 'Eliminar', danger: true });
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
