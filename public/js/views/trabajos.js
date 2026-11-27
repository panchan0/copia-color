/* Trabajos: pedidos que llegan (web, WhatsApp, correo) y la cola de producción. */
import { api } from '../api.js';
import { S, on, emit, syncNow } from '../store.js';
import { toast, ICON } from '../ui/dom.js';
import { ci } from '../icons.js';
import { estadoTag } from '../ui/salestable.js';
import { desdeSolicitud, nueva as nuevaOrden } from './caja.js';
import { esc, money, itemLabel, fmtCant, numOrdenTxt, DIAS3, MES3 } from '../util.js';
import { deslizar } from '../ui/motion.js';

let root, tab = 'produccion', hilos = [], sel = null, det = null, cola = [], colSel = 'cola', reqH = 0, reqD = 0, reqC = 0, timer = null;
const CANAL = { web: 'Web', whatsapp: 'WhatsApp', correo: 'Correo' };
const EST = { nuevo: ['Nuevo', 't-pend'], ia: ['IA atendiendo', 't-ia'], operador: ['Operador', 't-op'], orden: ['Orden creada', 'm-efectivo'], cerrado: ['Cerrado', 't-anul'] };
const PROD = { cola: 'En cola', proceso: 'En proceso', listo: 'Listo' };
const SIG = { cola: ['proceso', 'Empezar'], proceso: ['listo', 'Listo'], listo: ['entregado', 'Entregado'] };

export function mount(el) {
  root = el;
  root.innerHTML = `
  <div class="toolbar trtb">
    <div class="seg" data-tab><button data-t="produccion">Producción</button><button data-t="entrantes">Entrantes<i class="nbadge hide" data-nbadge></i></button></div>
    <button class="btn" data-nueva>${ICON.plus}Nueva orden</button>
  </div>
  <div data-pane="produccion">
    <div class="seg pcols" data-pcols><button data-c="cola">En cola <b data-n="cola"></b></button><button data-c="proceso">En proceso <b data-n="proceso"></b></button><button data-c="listo">Listo <b data-n="listo"></b></button></div>
    <div class="board" data-board></div>
  </div>
  <div data-pane="entrantes" class="hide">
    <div class="inbox">
      <div class="card ilist" data-ilist></div>
      <div class="idet" data-idet></div>
    </div>
  </div>`;
  root.querySelector('[data-tab]').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (b && b.dataset.t !== tab) { const d = b.dataset.t === 'entrantes' ? 1 : -1; tab = b.dataset.t; sel = null; paintTabs(d); load(); } });
  root.querySelector('[data-nueva]').onclick = () => { nuevaOrden(); location.hash = '#caja'; };
  root.querySelector('[data-pcols]').addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (b) { colSel = b.dataset.c; paintBoard(); } });
  root.querySelector('[data-board]').addEventListener('click', onBoard);
  root.querySelector('[data-ilist]').addEventListener('click', e => { const b = e.target.closest('[data-th]'); if (b) abrir(b.dataset.th); });
  root.querySelector('[data-idet]').addEventListener('click', onDet);
  on(what => { if ((what === 'remote' || what === 'sale') && root.closest('.view.on')) load(true); });
  document.addEventListener('trabajo-nuevo', () => { if (root.closest('.view.on')) load(true); });
}

export function show(sub) {
  if (sub) { tab = 'entrantes'; sel = sub; } else if (!sel) sel = null;
  paintTabs(0); load();
  clearInterval(timer);
  timer = setInterval(() => { if (root.closest('.view.on') && tab === 'produccion') paintBoard(); else if (!root.closest('.view.on')) clearInterval(timer); }, 30000);
}

function paintTabs(dir) {
  root.querySelectorAll('[data-tab] button').forEach(b => b.classList.toggle('sel', b.dataset.t === tab));
  root.querySelectorAll('[data-pane]').forEach(p => p.classList.toggle('hide', p.dataset.pane !== tab));
  root.querySelector('.inbox').classList.toggle('con-det', !!sel);
  if (dir) deslizar(root.querySelector(`[data-pane="${tab}"]`), dir, 40);
}

async function load(silent = false) {
  if (tab === 'produccion') return loadCola(silent);
  const id = ++reqH;
  if (!silent && !hilos.length) root.querySelector('[data-ilist]').innerHTML = '<div class="empty">Cargando…</div>';
  try { const r = await api('/api/inbox'); if (id !== reqH) return; hilos = r.threads; paintLista(); if (sel) cargarDet(sel, true); else paintDet(); }
  catch (e) { if (e.status !== 401) toast(e.message, true); }
}

/* ---------------- Producción ---------------- */

async function loadCola(silent) {
  const id = ++reqC;
  if (!silent && !cola.length) root.querySelector('[data-board]').innerHTML = '<div class="empty">Cargando…</div>';
  try { const r = await api('/api/cola'); if (id !== reqC) return; cola = r.sales; paintBoard(); }
  catch (e) { if (e.status !== 401) toast(e.message, true); }
}

function hace(ts) {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60); return h < 24 ? `${h} h ${m % 60 ? `${m % 60} min` : ''}`.trim() : `${Math.floor(h / 24)} d`;
}
function paraTxt(e) {
  const d = new Date(e); if (isNaN(d)) return '';
  const hoy = new Date(), man = new Date(Date.now() + 86400000);
  const dia = d.toDateString() === hoy.toDateString() ? 'Hoy' : d.toDateString() === man.toDateString() ? 'Mañana' : `${DIAS3[d.getDay()]} ${d.getDate()} ${MES3[d.getMonth()]}`;
  return `${dia} ${d.toLocaleTimeString('es-PA', { hour: 'numeric', minute: '2-digit' })}`;
}

function tarjeta(v) {
  const min = (Date.now() - (v.prod === 'cola' ? v.ts : v.prod_ts || v.ts)) / 60000;
  const urg = v.entrega ? (new Date(v.entrega) < new Date() ? 'tarde' : new Date(v.entrega) - Date.now() < 3600000 ? 'pronto' : '') : (v.prod !== 'listo' && min > 45 ? 'tarde' : min > 20 && v.prod !== 'listo' ? 'pronto' : '');
  const sig = SIG[v.prod];
  return `<div class="pcard ${urg}" data-id="${esc(v.id)}">
    <div class="pc-h"><b class="num">N° ${numOrdenTxt(v)}</b><span class="pc-t num">${hace(v.prod === 'cola' ? v.ts : v.prod_ts || v.ts)}</span></div>
    <div class="pc-c">${esc(v.client_name || (v.tel ? `Cel. ${v.tel}` : 'Contado'))}${v.operador === 'IA' || v.operador === 'Web' ? ` <span class="tag t-ia">${v.operador === 'IA' ? 'IA' : 'Web'}</span>` : ''}</div>
    ${v.entrega ? `<div class="pc-e">${ci('dia')}Para ${esc(paraTxt(v.entrega))}</div>` : ''}
    <ul class="pc-i">${v.items.map(it => `<li><b class="num">${esc(fmtCant(it.cant, it.unidad))}×</b> ${esc(itemLabel(it))}${it.extra ? `<small>${esc(it.extra)}</small>` : ''}</li>`).join('')}</ul>
    ${v.nota ? `<div class="pc-n">${esc(v.nota)}</div>` : ''}
    <div class="pc-f">${estadoTag(v)}<span class="num">${money(v.total_cents)}</span></div>
    <div class="pc-a">
      ${v.prod !== 'cola' ? `<button class="btn line sm" data-prod="${v.prod === 'listo' ? 'proceso' : 'cola'}" aria-label="Regresar">${ICON.left}</button>` : ''}
      <button class="btn sm${v.prod === 'listo' ? ' pay' : ''}" data-prod="${sig[0]}">${sig[1]}</button>
    </div>
  </div>`;
}

function paintBoard() {
  const by = { cola: [], proceso: [], listo: [] };
  for (const v of cola) (by[v.prod] || by.cola).push(v);
  for (const k of Object.keys(by)) root.querySelector(`[data-n="${k}"]`).textContent = by[k].length || '';
  root.querySelectorAll('[data-pcols] button').forEach(b => b.classList.toggle('sel', b.dataset.c === colSel));
  root.querySelector('[data-board]').innerHTML = Object.entries(PROD).map(([k, l]) => `<div class="pcol${k === colSel ? ' on' : ''}" data-col="${k}">
      <div class="pcol-h">${l}<b>${by[k].length || ''}</b></div>
      ${by[k].length ? by[k].map(tarjeta).join('') : `<div class="empty sm">${k === 'cola' ? 'Sin trabajos en cola' : k === 'proceso' ? 'Nada en proceso' : 'Nada listo para entregar'}</div>`}
    </div>`).join('');
}

async function onBoard(e) {
  const b = e.target.closest('[data-prod]'), card = e.target.closest('.pcard');
  if (!card) return;
  if (!b) { location.hash = `#orden=${card.dataset.id}`; return; }
  b.disabled = true;
  try {
    const r = await api(`/api/sales/${card.dataset.id}/prod`, { method: 'POST', body: { prod: b.dataset.prod } });
    const i = cola.findIndex(v => v.id === card.dataset.id);
    if (r.sale.prod === 'entregado') cola.splice(i, 1); else cola[i] = r.sale;
    if (b.dataset.prod === 'listo') toast(r.avisado ? 'Listo · se le avisó al cliente' : 'Listo para entregar');
    else if (b.dataset.prod === 'entregado') toast('Entregado');
    paintBoard(); emit('sale');
  } catch (err) { toast(err.message, true); b.disabled = false; }
}

/* ---------------- Entrantes ---------------- */

const horaTxt = ts => { const d = new Date(ts), hoy = new Date(); return d.toDateString() === hoy.toDateString() ? d.toLocaleTimeString('es-PA', { hour: 'numeric', minute: '2-digit' }) : `${d.getDate()} ${MES3[d.getMonth()]}`; };
const chip = e => { const [l, c] = EST[e] || [e, '']; return `<span class="tag ${c}">${l}</span>`; };
const canalIco = c => `<span class="cnl c-${c}">${c === 'whatsapp' ? 'WA' : c === 'correo' ? '@' : 'W'}</span>`;

function paintLista() {
  const l = root.querySelector('[data-ilist]');
  l.innerHTML = hilos.length ? hilos.map(t => `<button class="ith${t.id === sel ? ' on' : ''}${t.no_leidos ? ' nuevo' : ''}" data-th="${esc(t.id)}">
      ${canalIco(t.canal)}
      <span class="ith-b"><span class="ith-r"><b>${esc(t.nombre || t.contacto)}</b><small>${horaTxt(t.updated_at)}</small></span>
      <span class="ith-m">${esc((t.resumen || t.ultimo || '').replace(/\n/g, ' · '))}</span>
      <span class="ith-r">${chip(t.estado)}${t.numero ? `<small class="num">N° ${String(t.numero).padStart(6, '0')}</small>` : ''}${t.no_leidos ? '<i class="dot"></i>' : ''}</span></span>
    </button>`).join('') : '<div class="empty">Aquí llegan los pedidos de la web, WhatsApp y correo</div>';
}

async function abrir(id) {
  sel = id; det = null; paintLista(); paintTabs(0); paintDet();
  history.replaceState(null, '', `#trabajos=${encodeURIComponent(id)}`);
  cargarDet(id);
}
async function cargarDet(id, silent = false) {
  const r0 = ++reqD;
  try { const r = await api(`/api/inbox/${encodeURIComponent(id)}`); if (r0 !== reqD || sel !== id) return; det = r; paintDet(); const h = hilos.find(x => x.id === id); if (h && h.no_leidos) { h.no_leidos = 0; paintLista(); } }
  catch (e) { if (!silent) toast(e.message, true); sel = null; paintTabs(0); paintDet(); }
}

function paintDet() {
  const box = root.querySelector('[data-idet]');
  if (!sel) { box.innerHTML = '<div class="card empty-det"><div class="empty">Elige un pedido para verlo</div></div>'; return; }
  if (!det) { box.innerHTML = '<div class="card"><div class="empty">Cargando…</div></div>'; return; }
  const t = det.thread, puede = t.canal === 'whatsapp' || t.canal === 'correo';
  const msgs = det.msgs.map(m => {
    const media = m.media && m.media.tipo && m.media.id ? `<a class="adj" href="/api/wa-media/${esc(m.media.id)}" target="_blank" rel="noopener">${ICON.down}${esc(m.media.nombre || ({ image: 'Imagen', document: 'Documento', video: 'Video', audio: 'Audio', sticker: 'Sticker' })[m.media.tipo] || 'Archivo')}</a>` : '';
    const autor = m.dir === 'out' ? (m.autor === 'ia' ? 'IA' : 'Operador') : '';
    return `<div class="msg ${m.dir}${m.autor === 'ia' ? ' ia' : ''}">${autor ? `<small class="who">${autor}</small>` : ''}${m.texto ? `<div class="tx">${esc(m.texto)}</div>` : ''}${media}
      <small class="ts">${horaTxt(m.ts)}${m.media?.noEnviado ? ' · no enviado' : ''}</small></div>`;
  }).join('');
  const files = det.files.length ? `<div class="ifiles">${det.files.map(f => `<a class="adj" href="/api/files/${esc(f.id)}" target="_blank" rel="noopener">${ICON.down}${esc(f.nombre)}<small>${(f.size / 1048576).toFixed(1)} MB</small></a>`).join('')}</div>` : '';
  const orden = t.sale_id
    ? `<button class="btn block" data-verorden="${esc(t.sale_id)}">Ver orden N° ${String(t.numero || 0).padStart(6, '0')}</button>`
    : `<button class="btn block" data-crear>${ICON.plus}${t.propuesta?.length ? 'Crear orden con este pedido' : 'Crear orden'}</button>`;
  box.innerHTML = `<div class="card idcard">
    <div class="idh">
      <button class="back" data-cerrar-det>${ICON.left}</button>
      <div class="idn"><b>${esc(t.nombre || t.contacto)}</b><small>${CANAL[t.canal] || t.canal} · ${esc(t.contacto)}</small></div>
      ${chip(t.estado)}
    </div>
    ${t.propuesta?.length && !t.sale_id ? `<div class="iprop"><div class="label">Pedido</div>${t.propuesta.map(l => `<div>${esc(String(l.cant))} × ${esc(l.nombre || nombreDe(l))}${l.paginas ? ` · ${esc(String(l.paginas))} págs` : ''}${l.detalle ? ` <small>(${esc(l.detalle)})</small>` : ''}</div>`).join('')}</div>` : ''}
    <div class="iacts">${orden}
      <div class="grid2">
        ${t.estado === 'operador' ? (puede ? '<button class="btn line" data-est="ia">Devolver a la IA</button>' : '<span></span>') : t.estado !== 'cerrado' ? '<button class="btn line" data-est="operador">Atender yo</button>' : '<span></span>'}
        ${t.estado === 'cerrado' ? '<button class="btn line" data-est="nuevo">Reabrir</button>' : '<button class="btn line" data-est="cerrado">Cerrar</button>'}
      </div>
    </div>
    ${files}
    <div class="msgs" data-msgs>${msgs || '<div class="empty sm">Sin mensajes</div>'}</div>
    ${puede ? `<form class="reply" data-reply><textarea class="input ta" rows="1" maxlength="3000" placeholder="Escribe la respuesta"></textarea><button class="btn" type="submit">Enviar</button></form>` : ''}
  </div>`;
  const ms = box.querySelector('[data-msgs]'); ms.scrollTop = ms.scrollHeight;
  const f = box.querySelector('[data-reply]');
  if (f) {
    const ta = f.querySelector('textarea');
    ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(160, ta.scrollHeight + 2) + 'px'; });
    f.addEventListener('submit', async e => {
      e.preventDefault(); const texto = ta.value.trim(); if (!texto) return;
      const b = f.querySelector('button'); b.disabled = true;
      try { await api(`/api/inbox/${encodeURIComponent(t.id)}/reply`, { method: 'POST', body: { texto } }); ta.value = ''; await cargarDet(t.id); syncNow(); }
      catch (err) { toast(err.message, true); }
      b.disabled = false;
    });
  }
}

const nombreDe = l => { const s = S.settings.catalogo.find(x => x.id === l.serv), t = s?.tams.find(x => x.id === l.tam); return s ? `${s.nombre}${t ? ` · ${t.nombre}` : ''}` : l.serv; };

async function onDet(e) {
  if (!det) return;
  const t = det.thread;
  if (e.target.closest('[data-cerrar-det]')) { sel = null; det = null; history.replaceState(null, '', '#trabajos'); paintLista(); paintTabs(0); paintDet(); return; }
  const v = e.target.closest('[data-verorden]'); if (v) { location.hash = `#orden=${v.dataset.verorden}`; return; }
  if (e.target.closest('[data-crear]')) { desdeSolicitud(t); location.hash = '#caja'; return; }
  const est = e.target.closest('[data-est]');
  if (est) {
    try { await api(`/api/inbox/${encodeURIComponent(t.id)}/estado`, { method: 'POST', body: { estado: est.dataset.est } }); toast(est.dataset.est === 'cerrado' ? 'Pedido cerrado' : est.dataset.est === 'ia' ? 'La IA vuelve a contestar' : 'Listo'); syncNow(); load(true); }
    catch (err) { toast(err.message, true); }
  }
}
