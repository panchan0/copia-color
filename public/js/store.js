import { api } from './api.js';
import { todayIn } from './util.js';

export const S = { account: null, settings: null, clients: [], rev: 0 };
const subs = new Set();
export const on = f => (subs.add(f), () => subs.delete(f));
export const emit = what => subs.forEach(f => { try { f(what); } catch (e) { console.error(e); } });

export const today = () => todayIn(S.settings?.tz || 'America/Panama');

export async function loadMe() {
  const d = await api('/api/me');
  S.account = d.account; S.settings = d.settings; S.rev = d.account.rev;
}
export async function loadClients() { S.clients = (await api('/api/clients')).clients; }

/* Sincronización entre dispositivos: se consulta un contador de cambios cada 15 s */
let timer = null, checking = false;
/* Aviso de versión nueva: si se publicó una actualización, se ofrece recargar */
let version = null;
async function checkVersion() {
  try {
    const r = await fetch('/api/config', { cache: 'no-store', headers: { 'x-requested-with': 'copias-color' } });
    const { version: v } = await r.json();
    if (!version) version = v;
    else if (v && v !== version) document.getElementById('upd')?.classList.remove('hide');
  } catch { /* sin conexión */ }
}
let lastV = 0;
async function check() {
  if (Date.now() - lastV > 60000) { lastV = Date.now(); checkVersion(); }
  if (checking || !S.account) return;
  checking = true;
  try {
    const { rev, entrantes, ultimo } = await api('/api/rev');
    emit({ entrantes, ultimo });
    if (rev !== S.rev) {
      S.rev = rev;
      await Promise.all([loadMe(), loadClients()]);
      emit('remote');
    }
  } catch { /* se reintenta en el próximo ciclo */ }
  checking = false;
}
export function startSync() {
  stopSync();
  checkVersion();
  timer = setInterval(check, 15000);
  document.addEventListener('visibilitychange', check);
  window.addEventListener('focus', check);
}
export function stopSync() {
  clearInterval(timer);
  document.removeEventListener('visibilitychange', check);
  window.removeEventListener('focus', check);
}
export const syncNow = () => setTimeout(check, 300);
