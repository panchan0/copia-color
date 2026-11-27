/* Avisos de trabajos nuevos: sonido, notificación del sistema, número en el menú y notificaciones push. */
import { api } from './api.js';
import { on, syncNow } from './store.js';
import { prefs } from './tema.js';

let ctx = null, visto = null, iniciado = false;

/** "Plim": dos tonos cortos generados en el momento. */
export function plim() {
  if (prefs().sonido === false) return;
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const t0 = ctx.currentTime;
    [[1318.5, 0], [1760, 0.13]].forEach(([f, d]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + d);
      g.gain.exponentialRampToValueAtTime(0.35, t0 + d + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.55);
      o.connect(g).connect(ctx.destination);
      o.start(t0 + d); o.stop(t0 + d + 0.6);
    });
  } catch { /* sin audio */ }
}

function badge(n) {
  document.querySelectorAll('[data-nbadge]').forEach(b => { b.textContent = n > 9 ? '9+' : String(n); b.classList.toggle('hide', !n); });
  if ('setAppBadge' in navigator) { try { n ? navigator.setAppBadge(n) : navigator.clearAppBadge(); } catch { /* */ } }
}

async function notificar() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (!document.hidden && location.hash.startsWith('#trabajos')) return;
  // si el teléfono ya recibe push, el aviso lo muestra el service worker
  if (await suscrito()) return;
  try {
    const { aviso } = await api('/api/avisos');
    if (!aviso) return;
    const n = new Notification(aviso.titulo, { body: aviso.cuerpo, icon: '/icon-192.png', tag: 'trabajos' });
    n.onclick = () => { window.focus(); location.hash = aviso.url.replace(/^\/?#?/, '#').replace('##', '#'); n.close(); };
  } catch { /* */ }
}

export function iniciarAvisos() {
  if (iniciado) return; iniciado = true;
  // el audio solo se puede activar después de un toque
  const desbloquear = () => { try { ctx ||= new (window.AudioContext || window.webkitAudioContext)(); ctx.resume(); } catch { /* */ } };
  document.addEventListener('pointerdown', desbloquear, { once: true });
  on(x => {
    if (!x || typeof x !== 'object' || !('entrantes' in x)) return;
    badge(x.entrantes);
    if (visto !== null && x.ultimo > visto && x.entrantes > 0) { plim(); notificar(); document.dispatchEvent(new Event('trabajo-nuevo')); }
    visto = Math.max(visto ?? 0, x.ultimo || 0);
  });
  registrarSw();
  syncNow();
}

/* ---------- Notificaciones push (con la app cerrada) ---------- */

async function registrarSw() {
  if (!('serviceWorker' in navigator)) return null;
  try { return await navigator.serviceWorker.register('/sw.js'); } catch { return null; }
}

export const pushSoportado = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export async function suscrito() {
  if (!pushSoportado()) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  return !!(await reg?.pushManager.getSubscription());
}

const b64 = s => { const p = '='.repeat((4 - s.length % 4) % 4), r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(r, c => c.charCodeAt(0)); };

/** Activa las notificaciones en este dispositivo (pide permiso). */
export async function activarPush() {
  if (!pushSoportado()) throw new Error(/iPhone|iPad/.test(navigator.userAgent) ? 'En iPhone primero instala la app: Compartir → Agregar a inicio, y ábrela desde ahí.' : 'Este navegador no permite notificaciones.');
  const p = await Notification.requestPermission();
  if (p !== 'granted') throw new Error('Permite las notificaciones para este sitio en los ajustes del navegador.');
  const reg = (await registrarSw()) || await navigator.serviceWorker.ready;
  await navigator.serviceWorker.ready;
  const { key } = await api('/api/push/key');
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) });
  await api('/api/push/sub', { method: 'POST', body: { endpoint: sub.endpoint } });
}

export async function desactivarPush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  try { await api('/api/push/sub', { method: 'POST', body: { endpoint: sub.endpoint, quitar: true } }); } catch { /* */ }
  await sub.unsubscribe();
}
