/* Cuenta › Pedidos por WhatsApp, correo y web. */
import { api } from '../api.js';
import { S, syncNow } from '../store.js';
import { toast, dialog } from '../ui/dom.js';
import { esc } from '../util.js';
import { prefs, guardarPref } from '../tema.js';
import { plim, pushSoportado, suscrito, activarPush, desactivarPush } from '../avisos.js';

let root, info = null, qrLib = null;
const enlace = () => `${location.origin}/pedido#${info?.token || ''}`;

function cargarQR() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  return qrLib ||= new Promise((ok, ko) => { const s = document.createElement('script'); s.src = '/vendor/qrcode.min.js'; s.onload = () => ok(window.qrcode); s.onerror = () => { qrLib = null; ko(new Error('No se pudo cargar el código QR')); }; document.head.appendChild(s); });
}

export function mount(el) { root = el; root.addEventListener('click', onClick); root.addEventListener('change', onChange); }

export async function show() {
  if (!info) root.innerHTML = '<div class="card"><div class="empty">Cargando…</div></div>';
  try { info = await api('/api/canales'); } catch (e) { toast(e.message, true); return; }
  await paint();
}

const estado = (ok, si, no) => `<span class="tag ${ok ? 'm-efectivo' : 't-anul'}">${ok ? si : no}</span>`;

async function paint() {
  const c = S.settings.canales || {}, p = prefs();
  const push = pushSoportado() && await suscrito();
  root.innerHTML = `
  <div class="card">
    <div class="label">Enlace para que los clientes envíen trabajos</div>
    <div class="linkrow"><input class="input" readonly value="${esc(enlace())}" data-link><button class="btn sm" data-copiar>Copiar</button></div>
    <div class="row wrap" style="margin-top:10px;gap:8px">
      <a class="btn line sm" href="${esc(enlace())}" target="_blank" rel="noopener">Abrir</a>
      <button class="btn line sm" data-qr>Código QR</button>
      <button class="lnk an" data-nuevo>Cambiar enlace</button>
    </div>
  </div>
  <div class="card setlist">
    <label class="srow sw"><span class="st">La IA contesta los mensajes<small>WhatsApp y correo</small></span><input type="checkbox" class="switch" data-k="ia" ${c.ia !== false ? 'checked' : ''}></label>
    <label class="srow sw"><span class="st">Crear la orden sola<small>Cuando el pedido está claro y tiene precio en el catálogo</small></span><input type="checkbox" class="switch" data-k="autoOrden" ${c.autoOrden !== false ? 'checked' : ''}></label>
    <label class="srow sw"><span class="st">Avisar al cliente cuando esté listo</span><input type="checkbox" class="switch" data-k="avisoListo" ${c.avisoListo !== false ? 'checked' : ''}></label>
  </div>
  <div class="card setlist">
    <div class="label">Avisos en este dispositivo</div>
    <label class="srow sw"><span class="st">Notificaciones<small>${pushSoportado() ? 'Aunque la app esté cerrada' : /iPhone|iPad/.test(navigator.userAgent) ? 'Instala la app (Compartir › Agregar a inicio) para activarlas' : 'Este navegador no las permite'}</small></span><input type="checkbox" class="switch" data-push ${push ? 'checked' : ''} ${pushSoportado() ? '' : 'disabled'}></label>
    <label class="srow sw"><span class="st">Sonido</span><input type="checkbox" class="switch" data-sonido ${p.sonido !== false ? 'checked' : ''}></label>
    <button class="srow" data-probar><span class="st">Probar sonido</span></button>
  </div>
  <div class="card setlist">
    <div class="label">Conexiones</div>
    <div class="srow"><span class="st">WhatsApp Business${info.whatsapp.listo ? '' : '<small>Falta conectar la API de WhatsApp (Meta)</small>'}</span>${estado(info.whatsapp.listo, 'Conectado', 'Sin conectar')}</div>
    <div class="srow col"><span class="st">Webhook para Meta</span><div class="linkrow"><input class="input" readonly value="${esc(location.origin)}/api/wa/webhook"><button class="btn sm" data-copiarwh>Copiar</button></div></div>
    <div class="srow"><span class="st">Respuestas por correo${info.correo.respuestas ? '' : '<small>Falta la clave de Resend</small>'}</span>${estado(info.correo.respuestas, 'Listo', 'Sin conectar')}</div>
    <div class="srow"><span class="st">Inteligencia artificial${info.ia.modelo ? `<small>${esc(info.ia.modelo)}</small>` : ''}</span>${estado(info.ia.disponible, 'Lista', 'No disponible')}</div>
  </div>`;
}

async function onClick(e) {
  const copiar = async txt => { try { await navigator.clipboard.writeText(txt); toast('Copiado'); } catch { toast('No se pudo copiar', true); } };
  if (e.target.closest('[data-copiar]')) return copiar(enlace());
  if (e.target.closest('[data-copiarwh]')) return copiar(`${location.origin}/api/wa/webhook`);
  if (e.target.closest('[data-probar]')) return plim();
  if (e.target.closest('[data-qr]')) {
    let svg = '';
    try { const q = (await cargarQR())(0, 'M'); q.addData(enlace()); q.make(); svg = q.createSvgTag(6, 12); } catch (err) { return toast(err.message, true); }
    const box = document.getElementById('print');
    const r = await dialog({ title: 'Código QR del enlace', html: `<div class="qrbox">${svg}</div><p class="sub-note" style="text-align:center">Imprímelo y ponlo en el mostrador.</p>`, ok: 'Imprimir', cancel: 'Cerrar' });
    if (r) {
      box.innerHTML = `<div class="qrprint"><h1>${esc(S.account.business)}</h1><p>Envía tu trabajo desde el celular</p>${svg}<p class="u">${esc(enlace())}</p></div>`;
      setTimeout(() => window.print(), 50);
    }
    return;
  }
  if (e.target.closest('[data-nuevo]')) {
    const ok = await dialog({ title: '¿Cambiar el enlace?', html: '<p class="sub-note">El enlace y el código QR actuales dejan de funcionar.</p>', ok: 'Cambiar', danger: true });
    if (!ok) return;
    try { info = await api('/api/canales', { method: 'POST', body: {} }); toast('Enlace nuevo listo'); paint(); } catch (err) { toast(err.message, true); }
  }
}

async function onChange(e) {
  const k = e.target.dataset.k;
  if (k) {
    const st = structuredClone(S.settings); st.canales = { ...st.canales, [k]: e.target.checked };
    try { const r = await api('/api/settings', { method: 'PUT', body: st }); S.settings = r.settings; toast('Guardado'); syncNow(); }
    catch (err) { toast(err.message, true); e.target.checked = !e.target.checked; }
    return;
  }
  if (e.target.matches('[data-sonido]')) { guardarPref({ sonido: e.target.checked }); if (e.target.checked) plim(); return; }
  if (e.target.matches('[data-push]')) {
    const on = e.target.checked; e.target.disabled = true;
    try { if (on) { await activarPush(); toast('Notificaciones activadas'); } else { await desactivarPush(); toast('Notificaciones desactivadas'); } }
    catch (err) { toast(err.message, true); e.target.checked = !on; }
    e.target.disabled = false;
  }
}

