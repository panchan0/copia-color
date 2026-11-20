import type { Env } from './types';
import { HttpError } from './http';

const enc = new TextEncoder();
const SESSION_DAYS = 30;
/** En https se usa el prefijo __Host- (solo este dominio, siempre Secure). */
const cookieName = (url: URL) => (url.protocol === 'https:' ? '__Host-cc_sid' : 'cc_sid');

const b64 = (buf: ArrayBuffer | Uint8Array) => {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = ''; for (const x of u) s += String.fromCharCode(x);
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

export async function hashPassword(password: string, saltB64: string | null, iterations: number) {
  const salt = saltB64 ? unb64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return { hash: b64(bits), salt: b64(salt), iterations };
}

/** Comparación en tiempo constante */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function iterations(env: Env): number {
  const n = Number(env.PBKDF2_ITERATIONS || 60000);
  return Number.isFinite(n) ? Math.min(100000, Math.max(10000, Math.round(n))) : 60000;
}

async function sha256(s: string) { return hex(await crypto.subtle.digest('SHA-256', enc.encode(s))); }

export async function createSession(env: Env, accountId: string, req: Request): Promise<string> {
  const raw = b64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g, c => ({ '+': '-', '/': '_', '=': '' }[c]!));
  const now = Date.now();
  await env.DB.prepare('INSERT INTO sessions (token_hash, account_id, created_at, expires_at, user_agent) VALUES (?,?,?,?,?)')
    .bind(await sha256(raw), accountId, now, now + SESSION_DAYS * 86400000, (req.headers.get('user-agent') || '').slice(0, 200)).run();
  return raw;
}

export function sessionCookie(token: string, url: URL): string {
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return `${cookieName(url)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}${secure}`;
}
export function clearCookie(url: URL): string {
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return `${cookieName(url)}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

function readCookie(req: Request): string | null {
  const name = cookieName(new URL(req.url));
  const c = req.headers.get('cookie') || '';
  for (const part of c.split(/;\s*/)) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i) === name) return part.slice(i + 1) || null;
  }
  return null;
}

/** Devuelve el id de la cuenta de la sesión, o lanza 401. Extiende la sesión si está por vencer. */
export async function requireAccount(env: Env, req: Request): Promise<string> {
  const token = readCookie(req);
  if (!token) throw new HttpError(401, 'Inicia sesión');
  const th = await sha256(token);
  const row = await env.DB.prepare('SELECT account_id, expires_at FROM sessions WHERE token_hash = ?').bind(th).first<{ account_id: string; expires_at: number }>();
  const now = Date.now();
  if (!row || row.expires_at < now) {
    if (row) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(th).run();
    throw new HttpError(401, 'Tu sesión venció. Inicia sesión de nuevo.');
  }
  if (row.expires_at - now < 15 * 86400000) {
    await env.DB.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').bind(now + SESSION_DAYS * 86400000, th).run();
  }
  return row.account_id;
}

export async function destroySession(env: Env, req: Request) {
  const token = readCookie(req);
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
}

/** Límite de intentos: máx. `max` en `windowMs` por clave. */
export async function rateLimit(env: Env, key: string, max: number, windowMs: number) {
  const now = Date.now();
  const row = await env.DB.prepare('SELECT count, window_start FROM login_attempts WHERE key = ?').bind(key).first<{ count: number; window_start: number }>();
  if (row && now - row.window_start < windowMs) {
    if (row.count >= max) throw new HttpError(429, 'Demasiados intentos. Espera unos minutos.');
    await env.DB.prepare('UPDATE login_attempts SET count = count + 1 WHERE key = ?').bind(key).run();
  } else {
    await env.DB.prepare('INSERT OR REPLACE INTO login_attempts (key, count, window_start) VALUES (?,1,?)').bind(key, now).run();
  }
}
export async function clearRateLimit(env: Env, key: string) {
  await env.DB.prepare('DELETE FROM login_attempts WHERE key = ?').bind(key).run();
}
