/* Seguridad de la cuenta: correo de recuperación, verificación en dos pasos (TOTP) e imágenes de documentos. */
import type { Env, Ctx } from './types';
import { HttpError, json, readJson, str } from './http';
import { hashPassword, safeEqual, createSession, sessionCookie, iterations, rateLimit, clearRateLimit } from './auth';

const enc = new TextEncoder();
const b64url = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function sha(s: string) { return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)))); }

/* ---------- TOTP (aplicaciones de autenticación) ---------- */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32enc(u: Uint8Array) { let bits = 0, v = 0, out = ''; for (const x of u) { v = (v << 8) | x; bits += 8; while (bits >= 5) { out += B32[(v >>> (bits - 5)) & 31]; bits -= 5; } } if (bits) out += B32[(v << (5 - bits)) & 31]; return out; }
function b32dec(s: string) { const out: number[] = []; let bits = 0, v = 0; for (const ch of s.replace(/=+$/, '')) { const i = B32.indexOf(ch); if (i < 0) continue; v = (v << 5) | i; bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } } return new Uint8Array(out); }
async function hotp(secret: string, counter: number) {
  const key = await crypto.subtle.importKey('raw', b32dec(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const msg = new ArrayBuffer(8); const dv = new DataView(msg); dv.setUint32(0, Math.floor(counter / 2 ** 32)); dv.setUint32(4, counter >>> 0);
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  const o = h[19] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, '0');
}
export async function totpOk(secret: string, code: unknown) {
  const c = String(code ?? '').replace(/\D/g, '');
  if (c.length !== 6) return false;
  const t = Math.floor(Date.now() / 30000);
  for (const d of [0, -1, 1]) if (safeEqual(await hotp(secret, t + d), c)) return true;
  return false;
}

async function checkPwd(env: Env, id: string, pwd: unknown) {
  const row = await env.DB.prepare('SELECT email, pass_hash, pass_salt, pass_iter, totp_secret FROM accounts WHERE id = ?').bind(id)
    .first<{ email: string; pass_hash: string; pass_salt: string; pass_iter: number; totp_secret: string | null }>();
  if (!row) throw new HttpError(401, 'Inicia sesión');
  const h = await hashPassword(typeof pwd === 'string' ? pwd : '', row.pass_salt, row.pass_iter);
  if (!safeEqual(h.hash, row.pass_hash)) throw new HttpError(400, 'La contraseña no es correcta');
  return row;
}

export async function totpSetup(c: Ctx) {
  const b = await readJson(c.req);
  await rateLimit(c.env, 'pwd:' + c.accountId, 8, 15 * 60_000);
  const row = await checkPwd(c.env, c.accountId, b.actual);
  const secret = b32enc(crypto.getRandomValues(new Uint8Array(20)));
  await c.env.DB.prepare('UPDATE accounts SET totp_pending = ? WHERE id = ?').bind(secret, c.accountId).run();
  const label = encodeURIComponent(`Color:${row.email}`);
  return json({ secret, uri: `otpauth://totp/${label}?secret=${secret}&issuer=Color&algorithm=SHA1&digits=6&period=30` });
}
export async function totpEnable(c: Ctx) {
  const b = await readJson(c.req);
  await rateLimit(c.env, 'totp:' + c.accountId, 8, 15 * 60_000);
  const row = await c.env.DB.prepare('SELECT totp_pending FROM accounts WHERE id = ?').bind(c.accountId).first<{ totp_pending: string | null }>();
  if (!row?.totp_pending) throw new HttpError(400, 'Empieza de nuevo la activación');
  if (!(await totpOk(row.totp_pending, b.code))) throw new HttpError(400, 'El código no es correcto. Revisa la hora del teléfono.');
  await c.env.DB.prepare('UPDATE accounts SET totp_secret = totp_pending, totp_pending = NULL WHERE id = ?').bind(c.accountId).run();
  return json({ ok: true });
}
export async function totpDisable(c: Ctx) {
  const b = await readJson(c.req);
  await rateLimit(c.env, 'pwd:' + c.accountId, 8, 15 * 60_000);
  const row = await checkPwd(c.env, c.accountId, b.actual);
  if (row.totp_secret && !(await totpOk(row.totp_secret, b.code))) throw new HttpError(400, 'El código de verificación no es correcto');
  await c.env.DB.prepare('UPDATE accounts SET totp_secret = NULL, totp_pending = NULL WHERE id = ?').bind(c.accountId).run();
  return json({ ok: true });
}

/* ---------- Recuperación por correo ---------- */
const mailOk = (env: Env) => !!(env.RESEND_API_KEY && env.MAIL_FROM);

async function sendMail(env: Env, to: string, subject: string, html: string) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, html }),
  });
  if (!r.ok) throw new HttpError(502, 'No se pudo enviar el correo. Intenta más tarde.');
}

export async function forgot(env: Env, req: Request, url: URL): Promise<Response> {
  const b = await readJson(req);
  const email = str(b.email, 254).toLowerCase();
  const ip = req.headers.get('cf-connecting-ip') || 'local';
  if (!mailOk(env)) throw new HttpError(503, 'El envío de correos todavía no está configurado. Usa tu código de recuperación.');
  await rateLimit(env, 'forgot:' + email, 3, 60 * 60_000);
  await rateLimit(env, 'ip:' + ip, 40, 15 * 60_000);
  const row = await env.DB.prepare('SELECT id FROM accounts WHERE email = ?').bind(email).first<{ id: string }>();
  if (row) {
    const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
    await env.DB.batch([
      env.DB.prepare('DELETE FROM password_resets WHERE account_id = ? OR expires < ?').bind(row.id, Date.now()),
      env.DB.prepare('INSERT INTO password_resets (token_hash, account_id, expires) VALUES (?, ?, ?)').bind(await sha(token), row.id, Date.now() + 30 * 60_000),
    ]);
    const link = `${url.origin}/#reset=${token}`;
    await sendMail(env, email, 'Restablecer tu contraseña', `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;color:#1f2328">
        <h2 style="margin:0 0 12px">Restablecer contraseña</h2>
        <p>Recibimos una solicitud para cambiar la contraseña de tu cuenta. El enlace vale 30 minutos y sirve una sola vez.</p>
        <p style="margin:24px 0"><a href="${link}" style="background:#0a8fd6;color:#fff;padding:12px 20px;border-radius:9px;text-decoration:none;font-weight:bold">Cambiar contraseña</a></p>
        <p style="color:#5f6670;font-size:13px">Si no fuiste tú, ignora este correo: tu contraseña no cambia.</p>
      </div>`);
  }
  // misma respuesta exista o no la cuenta
  return json({ ok: true });
}

export async function resetPassword(env: Env, req: Request, url: URL): Promise<Response> {
  const b = await readJson(req);
  const token = str(b.token, 100);
  const nueva = typeof b.nueva === 'string' ? b.nueva : '';
  const ip = req.headers.get('cf-connecting-ip') || 'local';
  await rateLimit(env, 'ip:' + ip, 40, 15 * 60_000);
  if (nueva.length < 8 || nueva.length > 200) throw new HttpError(400, 'La contraseña nueva debe tener al menos 8 caracteres');
  const th = await sha(token);
  const r = await env.DB.prepare('SELECT r.account_id, a.totp_secret FROM password_resets r JOIN accounts a ON a.id = r.account_id WHERE r.token_hash = ? AND r.expires > ?')
    .bind(th, Date.now()).first<{ account_id: string; totp_secret: string | null }>();
  if (!r) throw new HttpError(400, 'El enlace venció o ya se usó. Pide uno nuevo.');
  if (r.totp_secret) {
    if (!b.code) return json({ need2fa: true });
    await rateLimit(env, 'totp:' + r.account_id, 8, 15 * 60_000);
    if (!(await totpOk(r.totp_secret, b.code))) throw new HttpError(400, 'El código de verificación no es correcto');
  }
  const n = await hashPassword(nueva, null, iterations(env));
  await env.DB.batch([
    env.DB.prepare('UPDATE accounts SET pass_hash = ?, pass_salt = ?, pass_iter = ? WHERE id = ?').bind(n.hash, n.salt, n.iterations, r.account_id),
    env.DB.prepare('DELETE FROM sessions WHERE account_id = ?').bind(r.account_id),
    env.DB.prepare('DELETE FROM password_resets WHERE account_id = ?').bind(r.account_id),
  ]);
  const t = await createSession(env, r.account_id, req);
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie(t, url) });
}

/* ---------- Imágenes de documentos: logo de órdenes/reportes y sellos ---------- */
const ASSET_KEYS = new Set(['logo_doc', 'sello_pagado', 'sello_pendiente']);
export async function getAssets(c: Ctx) {
  const { results } = await c.env.DB.prepare('SELECT k, data FROM assets WHERE account_id = ?').bind(c.accountId).all<{ k: string; data: string }>();
  const out: Record<string, string> = {};
  for (const r of results) out[r.k] = r.data;
  return json({ assets: out });
}
export async function putAsset(c: Ctx) {
  const k = c.params.k;
  if (!ASSET_KEYS.has(k)) throw new HttpError(404, 'No encontrado');
  const b = await readJson(c.req, 420_000);
  const data = typeof b.data === 'string' ? b.data : '';
  if (!data) { await c.env.DB.prepare('DELETE FROM assets WHERE account_id = ? AND k = ?').bind(c.accountId, k).run(); return json({ ok: true }); }
  if (data.length > 400_000 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(data)) throw new HttpError(400, 'Imagen no válida o muy grande');
  await c.env.DB.prepare('INSERT INTO assets (account_id, k, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(account_id, k) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at')
    .bind(c.accountId, k, data, Date.now()).run();
  return json({ ok: true });
}
export { mailOk };
void clearRateLimit;
