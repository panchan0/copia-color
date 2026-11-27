/* Notificaciones push (Web Push con VAPID). El aviso va sin contenido: el teléfono lo pide al abrirlo. */
import type { Ctx, Env } from './types';
import { HttpError, json, readJson, str } from './http';

const b64u = (buf: ArrayBuffer | Uint8Array) => {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = ''; for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const txt = (o: unknown) => b64u(new TextEncoder().encode(JSON.stringify(o)));

interface Vapid { pub: string; jwk: JsonWebKey }
let cache: Vapid | null = null;

/** Llaves VAPID: se crean una sola vez y se guardan en la base de datos. */
export async function vapid(env: Env): Promise<Vapid> {
  if (cache) return cache;
  const row = await env.DB.prepare("SELECT v FROM kv WHERE k = 'vapid'").first<{ v: string }>();
  if (row) return (cache = JSON.parse(row.v));
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
  const raw = await crypto.subtle.exportKey('raw', kp.publicKey) as ArrayBuffer;
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey) as JsonWebKey;
  const v = { pub: b64u(raw), jwk };
  await env.DB.prepare("INSERT OR IGNORE INTO kv (k, v) VALUES ('vapid', ?)").bind(JSON.stringify(v)).run();
  const again = await env.DB.prepare("SELECT v FROM kv WHERE k = 'vapid'").first<{ v: string }>();
  return (cache = again ? JSON.parse(again.v) : v);
}

async function jwt(v: Vapid, aud: string) {
  const key = await crypto.subtle.importKey('jwk', v.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const unsigned = `${txt({ typ: 'JWT', alg: 'ES256' })}.${txt({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'mailto:avisos@copiasrapidas.com' })}`;
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${b64u(sig)}`;
}

/** Avisa a todos los teléfonos y computadoras suscritos de la cuenta. */
export async function avisar(env: Env, accountId: string) {
  const { results } = await env.DB.prepare('SELECT endpoint FROM push_subs WHERE account_id = ?').bind(accountId).all<{ endpoint: string }>();
  if (!results.length) return;
  const v = await vapid(env);
  await Promise.all(results.map(async ({ endpoint }) => {
    try {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { TTL: '86400', Urgency: 'high', Authorization: `vapid t=${await jwt(v, new URL(endpoint).origin)}, k=${v.pub}`, 'Content-Length': '0' },
      });
      if (r.status === 404 || r.status === 410) await env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(endpoint).run();
    } catch (e) { console.error('push', e); }
  }));
}

export async function pushKey(c: Ctx) { return json({ key: (await vapid(c.env)).pub }); }

const PUSH_HOSTS = /^https:\/\/([a-z0-9-]+\.)*(googleapis\.com|push\.apple\.com|mozilla\.com|mozaws\.net|windows\.com|notify\.windows\.com)\//;
export async function pushSub(c: Ctx) {
  const b = await readJson(c.req);
  const ep = str(b.endpoint, 800);
  if (!PUSH_HOSTS.test(ep)) throw new HttpError(400, 'Suscripción inválida');
  if (b.quitar) await c.env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ? AND account_id = ?').bind(ep, c.accountId).run();
  else await c.env.DB.prepare('INSERT OR REPLACE INTO push_subs (endpoint, account_id, created_at) VALUES (?,?,?)').bind(ep, c.accountId, Date.now()).run();
  return json({ ok: true });
}

/** Lo que muestra la notificación: el último trabajo sin leer. */
export async function ultimoAviso(c: Ctx) {
  const t = await c.env.DB.prepare(`SELECT t.id, t.canal, t.nombre, t.contacto, t.estado, t.resumen,
      (SELECT texto FROM inbox_msgs m WHERE m.thread_id = t.id AND m.dir = 'in' ORDER BY m.ts DESC LIMIT 1) AS texto,
      (SELECT numero FROM sales s WHERE s.id = t.sale_id) AS numero
    FROM inbox_threads t WHERE t.account_id = ? AND t.no_leidos > 0 ORDER BY t.updated_at DESC LIMIT 1`).bind(c.accountId).first<any>();
  if (!t) return json({ aviso: null });
  const canal = { web: 'la web', whatsapp: 'WhatsApp', correo: 'correo' }[t.canal as string] || t.canal;
  const quien = t.nombre || t.contacto;
  const titulo = t.numero ? `Orden N° ${String(t.numero).padStart(6, '0')} · ${quien}` : t.estado === 'operador' ? `${quien} necesita un operador` : `Mensaje de ${quien}`;
  return json({ aviso: { titulo, cuerpo: `${(t.resumen || t.texto || '').slice(0, 140)}${t.resumen || t.texto ? ' · ' : ''}por ${canal}`, url: `/#trabajos=${t.id}` } });
}
