/*
 * Trabajos: la cola de producción y los pedidos que llegan solos
 * (enlace web, WhatsApp y correo), con la IA que contesta y registra las órdenes.
 */
import PostalMime from 'postal-mime';
import type { Ctx, Env, Settings } from './types';
import { HttpError, json, readJson, str, uuid } from './http';
import { bumpRev, getSettings } from './settings';
import { rateLimit } from './auth';
import { getSale, querySales, insertarOrden } from './routes';
import { pensar, iaDisponible, type Msg } from './ia';
import { avisar } from './push';

const WA_VER = (env: Env) => env.WA_API_VERSION || 'v26.0';
export const waListo = (env: Env) => !!(env.WA_TOKEN && env.WA_PHONE_ID);
const mailListo = (env: Env) => !!(env.RESEND_API_KEY && env.MAIL_FROM);
const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const num6 = (n: number | null) => String(n ?? 0).padStart(6, '0');
const randHex = (n: number) => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, '0')).join('');

/* ---------------- Avisos ---------------- */

/** Actualiza las pantallas abiertas y manda la notificación a los teléfonos. */
export async function notificar(env: Env, accountId: string) {
  await (await bumpRev(env, accountId)).run();
  await avisar(env, accountId);
}
const enFondo = (c: { exec?: ExecutionContext }, p: Promise<unknown>) => { if (c.exec) c.exec.waitUntil(p.catch(e => console.error(e))); else return p; };

/* ---------------- Cola de producción ---------------- */

export async function cola(c: Ctx) {
  const sales = await querySales(c.env, "s.account_id = ? AND s.anulada = 0 AND s.prod IN ('cola', 'proceso', 'listo')", [c.accountId], "COALESCE(s.entrega, '9999'), s.ts", 300);
  return json({ sales });
}

export async function setProd(c: Ctx) {
  const b = await readJson(c.req);
  const prod = str(b.prod, 12);
  if (!['cola', 'proceso', 'listo', 'entregado'].includes(prod)) throw new HttpError(400, 'Estado inválido');
  const r = await c.env.DB.prepare('UPDATE sales SET prod = ?, prod_ts = ? WHERE id = ? AND account_id = ? AND anulada = 0').bind(prod, Date.now(), c.params.id, c.accountId).run();
  if (!r.meta.changes) throw new HttpError(404, 'Orden no encontrada');
  await (await bumpRev(c.env, c.accountId)).run();
  const sale = await getSale(c.env, c.accountId, c.params.id);
  let avisado = false;
  if (prod === 'listo' && sale) {
    const st = await getSettings(c.env, c.accountId);
    if (st.canales.avisoListo) avisado = await avisarListo(c, sale);
  }
  return json({ ok: true, sale, avisado });
}

/** Le avisa al cliente por WhatsApp o correo que su trabajo está listo (por donde escribió). */
async function avisarListo(c: Ctx, sale: any) {
  const t = await c.env.DB.prepare("SELECT id, canal, contacto FROM inbox_threads WHERE account_id = ? AND sale_id = ? ORDER BY updated_at DESC LIMIT 1").bind(c.accountId, sale.id).first<any>();
  const texto = `Hola${sale.client_name ? ` ${sale.client_name}` : ''}, tu orden N° ${num6(sale.numero)} ya está lista para retirar. Total: ${money(sale.total_cents)}.`;
  try {
    if (t && (t.canal === 'whatsapp' || t.canal === 'correo')) return await responder(c.env, c.accountId, t, texto, 'operador');
    const tel = soloDigitos(sale.tel);
    if (waListo(c.env) && tel) { await waEnviar(c.env, telPais(tel), texto); return true; }
  } catch (e) { console.error('aviso listo', e); }
  return false;
}

/* ---------------- Bandeja ---------------- */

const THREAD_COLS = `t.id, t.canal, t.contacto, t.nombre, t.estado, t.resumen, t.propuesta, t.sale_id, t.no_leidos, t.created_at, t.updated_at,
  (SELECT texto FROM inbox_msgs m WHERE m.thread_id = t.id ORDER BY m.ts DESC, m.id DESC LIMIT 1) AS ultimo,
  (SELECT numero FROM sales s WHERE s.id = t.sale_id) AS numero`;
const shapeT = (t: any) => ({ ...t, propuesta: (() => { try { return t.propuesta ? JSON.parse(t.propuesta) : null; } catch { return null; } })() });

export async function listInbox(c: Ctx) {
  const todos = c.url.searchParams.get('todos') === '1';
  const { results } = await c.env.DB.prepare(`SELECT ${THREAD_COLS} FROM inbox_threads t WHERE t.account_id = ?${todos ? '' : " AND t.estado != 'cerrado'"} ORDER BY t.updated_at DESC LIMIT 150`).bind(c.accountId).all();
  return json({ threads: results.map(shapeT) });
}

export async function getThread(c: Ctx) {
  const t = await c.env.DB.prepare(`SELECT ${THREAD_COLS} FROM inbox_threads t WHERE t.account_id = ? AND t.id = ?`).bind(c.accountId, c.params.id).first();
  if (!t) throw new HttpError(404, 'Conversación no encontrada');
  const [m, f] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT id, dir, autor, texto, media, ts FROM inbox_msgs WHERE thread_id = ? AND account_id = ? ORDER BY ts, id').bind(c.params.id, c.accountId),
    c.env.DB.prepare('SELECT id, nombre, tipo, size FROM inbox_files WHERE thread_id = ? AND account_id = ? AND part = 0 ORDER BY created_at').bind(c.params.id, c.accountId),
  ]);
  if ((t as any).no_leidos) {
    await c.env.DB.prepare('UPDATE inbox_threads SET no_leidos = 0 WHERE id = ?').bind(c.params.id).run();
    await (await bumpRev(c.env, c.accountId)).run();
  }
  const msgs = (m.results as any[]).map(x => ({ ...x, media: x.media ? JSON.parse(x.media) : null }));
  return json({ thread: shapeT(t), msgs, files: f.results });
}

export async function replyThread(c: Ctx) {
  const b = await readJson(c.req);
  const texto = str(b.texto, 3000);
  if (!texto) throw new HttpError(400, 'Escribe el mensaje');
  const t = await c.env.DB.prepare('SELECT id, canal, contacto FROM inbox_threads WHERE id = ? AND account_id = ?').bind(c.params.id, c.accountId).first<any>();
  if (!t) throw new HttpError(404, 'Conversación no encontrada');
  if (t.canal === 'web') throw new HttpError(400, 'Este pedido llegó por la web: contesta por teléfono o correo');
  await responder(c.env, c.accountId, t, texto, 'operador');
  await c.env.DB.prepare("UPDATE inbox_threads SET estado = CASE WHEN estado IN ('nuevo', 'ia') THEN 'operador' ELSE estado END, updated_at = ? WHERE id = ?").bind(Date.now(), t.id).run();
  await (await bumpRev(c.env, c.accountId)).run();
  return json({ ok: true });
}

export async function setThreadEstado(c: Ctx) {
  const b = await readJson(c.req);
  const e = str(b.estado, 12);
  if (!['operador', 'ia', 'cerrado', 'nuevo'].includes(e)) throw new HttpError(400, 'Estado inválido');
  await c.env.DB.prepare('UPDATE inbox_threads SET estado = ?, no_leidos = 0, updated_at = ? WHERE id = ? AND account_id = ?').bind(e, Date.now(), c.params.id, c.accountId).run();
  await (await bumpRev(c.env, c.accountId)).run();
  return json({ ok: true });
}

/** Archivo recibido por la web o el correo (guardado en partes). */
export async function getFile(c: Ctx) {
  const { results } = await c.env.DB.prepare('SELECT part, nombre, tipo, data FROM inbox_files WHERE id = ? AND account_id = ? ORDER BY part').bind(c.params.id, c.accountId).all<any>();
  if (!results.length) throw new HttpError(404, 'Archivo no encontrado');
  const parts = results.map(r => Uint8Array.from(atob(r.data), ch => ch.charCodeAt(0)));
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  const nombre = (results[0].nombre || 'archivo').replace(/[^\w.\- ]/g, '_');
  const tipo = String(results[0].tipo || ''), ver = /^image\/(png|jpe?g|gif|webp)$|^application\/pdf$/.test(tipo);
  return new Response(out, { headers: { 'content-type': ver ? tipo : 'application/octet-stream', 'content-disposition': `${ver ? 'inline' : 'attachment'}; filename="${nombre}"`, 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox" } });
}

/** Imagen o documento recibido por WhatsApp: se pide a Meta en el momento. */
export async function getWaMedia(c: Ctx) {
  if (!waListo(c.env)) throw new HttpError(404, 'WhatsApp no está conectado');
  const id = c.params.id;
  if (!/^\d{5,30}$/.test(id)) throw new HttpError(400, 'Archivo inválido');
  const ok = await c.env.DB.prepare("SELECT 1 FROM inbox_msgs WHERE account_id = ? AND media LIKE ?").bind(c.accountId, `%"id":"${id}"%`).first();
  if (!ok) throw new HttpError(404, 'Archivo no encontrado');
  const auth = { authorization: `Bearer ${c.env.WA_TOKEN}` };
  const meta = await fetch(`https://graph.facebook.com/${WA_VER(c.env)}/${id}`, { headers: auth });
  if (!meta.ok) throw new HttpError(404, 'WhatsApp ya no tiene este archivo');
  const { url, mime_type } = await meta.json<any>();
  const f = await fetch(url, { headers: auth });
  if (!f.ok || !f.body) throw new HttpError(502, 'No se pudo descargar el archivo');
  const ver = /^image\/(png|jpe?g|gif|webp)$|^application\/pdf$/.test(String(mime_type || ''));
  return new Response(f.body, { headers: { 'content-type': ver ? mime_type : 'application/octet-stream', 'content-disposition': ver ? 'inline' : 'attachment', 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox" } });
}

/* ---------------- Canales (configuración) ---------------- */

async function tokenDe(env: Env, accountId: string, nuevo = false) {
  const st = await getSettings(env, accountId);
  if (st.canales.token && !nuevo) return st.canales.token;
  st.canales.token = randHex(12);
  await env.DB.prepare('UPDATE settings SET data = ?, updated_at = ? WHERE account_id = ?').bind(JSON.stringify(st), Date.now(), accountId).run();
  return st.canales.token;
}

export async function canales(c: Ctx) {
  const token = await tokenDe(c.env, c.accountId, c.req.method === 'POST');
  if (c.req.method === 'POST') await (await bumpRev(c.env, c.accountId)).run();
  return json({
    token,
    whatsapp: { listo: waListo(c.env), verificacion: !!c.env.WA_VERIFY_TOKEN, firma: !!c.env.WA_APP_SECRET },
    correo: { respuestas: mailListo(c.env) },
    ia: { disponible: iaDisponible(c.env), modelo: c.env.ANTHROPIC_API_KEY ? 'Claude' : c.env.AI ? 'Workers AI' : null },
  });
}

/* ---------------- Mensajes entrantes ---------------- */

const soloDigitos = (s: unknown) => String(s || '').replace(/\D/g, '');
/** Números de Panamá de 7 u 8 dígitos se envían con el 507. */
const telPais = (d: string) => (d.length === 7 || d.length === 8 ? '507' + d : d);

async function cuentaCanal(env: Env) {
  const r = env.CANAL_CUENTA
    ? await env.DB.prepare('SELECT id FROM accounts WHERE email = ?').bind(env.CANAL_CUENTA.toLowerCase()).first<{ id: string }>()
    : await env.DB.prepare('SELECT id FROM accounts ORDER BY created_at LIMIT 1').first<{ id: string }>();
  return r?.id || null;
}

/** Conversación abierta del contacto (de los últimos 3 días) o una nueva. */
async function hilo(env: Env, accountId: string, canal: string, contacto: string, nombre: string | null) {
  const t = await env.DB.prepare(`SELECT id, canal, contacto, estado FROM inbox_threads WHERE account_id = ? AND canal = ? AND contacto = ? AND estado != 'cerrado' AND updated_at > ?
    ORDER BY updated_at DESC LIMIT 1`).bind(accountId, canal, contacto, Date.now() - 3 * 86400000).first<any>();
  if (t) {
    if (nombre) await env.DB.prepare('UPDATE inbox_threads SET nombre = COALESCE(nombre, ?) WHERE id = ?').bind(nombre, t.id).run();
    return t;
  }
  const id = uuid(), now = Date.now();
  await env.DB.prepare('INSERT INTO inbox_threads (id, account_id, canal, contacto, nombre, estado, no_leidos, created_at, updated_at) VALUES (?,?,?,?,?,?,0,?,?)')
    .bind(id, accountId, canal, contacto, nombre, 'nuevo', now, now).run();
  return { id, canal, contacto, estado: 'nuevo' };
}

async function guardarEntrante(env: Env, accountId: string, threadId: string, texto: string, media: unknown, extId: string | null) {
  const now = Date.now();
  try {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO inbox_msgs (thread_id, account_id, dir, autor, texto, media, ts, ext_id) VALUES (?,?,?,?,?,?,?,?)')
        .bind(threadId, accountId, 'in', 'cliente', texto.slice(0, 4000), media ? JSON.stringify(media) : null, now, extId),
      env.DB.prepare('UPDATE inbox_threads SET no_leidos = no_leidos + 1, updated_at = ? WHERE id = ?').bind(now, threadId),
    ]);
    return true;
  } catch (e) {
    if (String(e).includes('UNIQUE')) return false; // mensaje repetido (Meta reintenta)
    throw e;
  }
}

/** Envía la respuesta por el mismo canal y la guarda en la conversación. */
async function responder(env: Env, accountId: string, t: { id: string; canal: string; contacto: string }, texto: string, autor: 'ia' | 'operador') {
  let enviado = false;
  if (t.canal === 'whatsapp' && waListo(env)) { await waEnviar(env, t.contacto, texto); enviado = true; }
  else if (t.canal === 'correo' && mailListo(env)) {
    const asunto = await env.DB.prepare("SELECT media FROM inbox_msgs WHERE thread_id = ? AND dir = 'in' AND media LIKE '%asunto%' ORDER BY ts DESC LIMIT 1").bind(t.id).first<{ media: string }>();
    let s = 'Tu pedido'; try { s = JSON.parse(asunto?.media || '{}').asunto || s; } catch { /* */ }
    await correoEnviar(env, t.contacto, /^re:/i.test(s) ? s : `Re: ${s}`, texto); enviado = true;
  }
  await env.DB.batch([
    env.DB.prepare('INSERT INTO inbox_msgs (thread_id, account_id, dir, autor, texto, media, ts) VALUES (?,?,?,?,?,?,?)')
      .bind(t.id, accountId, 'out', autor, texto, enviado ? null : JSON.stringify({ noEnviado: true }), Date.now()),
    env.DB.prepare('UPDATE inbox_threads SET updated_at = ? WHERE id = ?').bind(Date.now(), t.id),
  ]);
  return enviado;
}

async function waEnviar(env: Env, to: string, body: string) {
  const r = await fetch(`https://graph.facebook.com/${WA_VER(env)}/${env.WA_PHONE_ID}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.WA_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { body: body.slice(0, 4096) } }),
  });
  if (!r.ok) throw new HttpError(502, `WhatsApp no aceptó el mensaje (${r.status}): ${(await r.text()).slice(0, 160)}`);
}

async function correoEnviar(env: Env, to: string, subject: string, text: string) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject: subject.slice(0, 200), text }),
  });
  if (!r.ok) throw new HttpError(502, `No se pudo enviar el correo (${r.status})`);
}

/**
 * La IA lee la conversación y decide: contestar, registrar la orden o pasarla a un operador.
 * Sin IA (o si falla), la conversación queda para un operador.
 */
export async function procesar(env: Env, accountId: string, threadId: string) {
  const st = await getSettings(env, accountId);
  const t = await env.DB.prepare('SELECT id, canal, contacto, nombre, estado, sale_id FROM inbox_threads WHERE id = ? AND account_id = ?').bind(threadId, accountId).first<any>();
  if (!t) return;
  const puedeIa = st.canales.ia && iaDisponible(env) && t.estado !== 'operador' && t.estado !== 'cerrado' && (t.canal === 'whatsapp' || t.canal === 'correo');
  if (!puedeIa) { await notificar(env, accountId); return; }
  const { results } = await env.DB.prepare('SELECT autor, texto, media FROM inbox_msgs WHERE thread_id = ? ORDER BY ts DESC, id DESC LIMIT 16').bind(threadId).all<any>();
  const hist: Msg[] = results.reverse().map(m => {
    let texto = m.texto || '';
    try { const md = m.media ? JSON.parse(m.media) : null; if (md?.tipo) texto = `${texto}${texto ? ' ' : ''}[Envió un archivo: ${md.nombre || md.tipo}]`; } catch { /* */ }
    if (m.media && m.media.includes('"adjuntos"')) texto += ' [Adjuntó archivos al correo]';
    return { autor: m.autor, texto };
  });
  const acc = await env.DB.prepare('SELECT business FROM accounts WHERE id = ?').bind(accountId).first<{ business: string }>();
  let extra = '';
  if (t.sale_id) {
    const s = await getSale(env, accountId, t.sale_id);
    if (s) extra = `\nEste cliente ya tiene la orden N° ${num6(s.numero)} (total ${money(s.total_cents)}), estado de producción: ${({ cola: 'en cola', proceso: 'en proceso', listo: 'lista para retirar', entregado: 'entregada' } as any)[s.prod] || 'en cola'}. Si pregunta por ella, dile el estado. Si quiere otro pedido, usa crear_orden con lo nuevo.`;
  }
  const d = await pensar(env, st, acc?.business || 'la imprenta', hist, extra);
  if (!d) {
    await env.DB.prepare("UPDATE inbox_threads SET estado = 'operador', updated_at = ? WHERE id = ?").bind(Date.now(), threadId).run();
    await notificar(env, accountId);
    return;
  }
  let texto = d.respuesta, estado = d.accion === 'operador' ? 'operador' : 'ia', saleId: string | null = null;
  const propuesta = d.items.length ? JSON.stringify(d.items) : null;
  if (d.accion === 'crear_orden' && d.items.length) {
    if (st.canales.autoOrden) {
      try {
        const sale = await crearDesdeIa(env, accountId, st, t, d.items, d.resumen || '', d.nombre || t.nombre);
        saleId = sale.id; estado = 'orden';
        texto += `\n\nOrden N° ${num6(sale.numero)} registrada. Total: ${money(sale.total_cents)} (incluye ITBMS ${st.itbms.tasa}%). Te avisamos cuando esté lista.`;
      } catch (e) {
        console.error('orden ia', e);
        estado = 'operador';
        texto = `${d.respuesta}\n\nUn operador revisa tu pedido y te confirma en breve.`;
      }
    } else {
      estado = 'operador';
      texto = `${d.respuesta}\n\nUn operador revisa tu pedido y te confirma el total en breve.`;
    }
  }
  await env.DB.prepare(`UPDATE inbox_threads SET estado = ?, resumen = COALESCE(?, resumen), propuesta = COALESCE(?, propuesta), nombre = COALESCE(nombre, ?),
    sale_id = COALESCE(?, sale_id), updated_at = ? WHERE id = ?`).bind(estado, d.resumen || null, propuesta, d.nombre || null, saleId, Date.now(), threadId).run();
  try { await responder(env, accountId, t, texto, 'ia'); }
  catch (e) { console.error('responder', e); await env.DB.prepare("UPDATE inbox_threads SET estado = 'operador' WHERE id = ?").bind(threadId).run(); }
  await notificar(env, accountId);
}

async function crearDesdeIa(env: Env, accountId: string, st: Settings, t: any, items: any[], resumen: string, nombre: string | null) {
  // Solo productos con precio del catálogo; lo demás lo ve un operador
  for (const it of items) {
    const s = st.catalogo.find(x => x.id === it.serv), tm = s?.tams.find(x => x.id === it.tam);
    if (!s || !tm || s.libre || (!tm.precio && !tm.tramos)) throw new Error('Producto sin precio en el catálogo');
  }
  const id = uuid();
  const canal = t.canal === 'whatsapp' ? 'WhatsApp' : 'correo';
  return insertarOrden(env, accountId, {
    client_id: await clienteDe(env, accountId, t.canal === 'whatsapp' ? t.contacto : '', t.canal === 'correo' ? t.contacto : ''),
    items: items.map(x => ({ serv: x.serv, tam: x.tam, cant: x.cant, paginas: x.paginas, extra: x.detalle })),
    contacto_tel: t.canal === 'whatsapp' ? t.contacto : '', contacto_email: t.canal === 'correo' ? t.contacto : '',
    operador: 'IA', nota: [`Pedido por ${canal}${nombre ? ` · ${nombre}` : ''}`, resumen].filter(Boolean).join('\n'),
  }, { id, origen: `ia:${id}`, prod: 'cola', inbox: t.id, nombre });
}

/** Cliente guardado con el mismo celular (últimos 8 dígitos) o correo. */
async function clienteDe(env: Env, accountId: string, tel: string, correo: string) {
  const { results } = await env.DB.prepare('SELECT id, phone, email FROM clients WHERE account_id = ? AND archived = 0').bind(accountId).all<{ id: string; phone: string | null; email: string | null }>();
  const t8 = soloDigitos(tel).slice(-8);
  const c = results.find(x => (t8.length >= 7 && soloDigitos(x.phone).slice(-8) === t8) || (correo && (x.email || '').toLowerCase() === correo.toLowerCase()));
  return c?.id || null;
}

/* ---------------- WhatsApp (webhook de Meta) ---------------- */

export async function waWebhook(req: Request, env: Env, exec: ExecutionContext): Promise<Response> {
  const url = new URL(req.url);
  if (req.method === 'GET') {
    const ok = url.searchParams.get('hub.mode') === 'subscribe' && env.WA_VERIFY_TOKEN && url.searchParams.get('hub.verify_token') === env.WA_VERIFY_TOKEN;
    return ok ? new Response(url.searchParams.get('hub.challenge') || '', { status: 200 }) : new Response('Prohibido', { status: 403 });
  }
  if (req.method !== 'POST') return new Response('Método no permitido', { status: 405 });
  const raw = await req.text();
  if (raw.length > 1_000_000) return new Response('Muy grande', { status: 413 });
  if (env.WA_APP_SECRET) {
    const sig = req.headers.get('x-hub-signature-256') || '';
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.WA_APP_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mac = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)))].map(b => b.toString(16).padStart(2, '0')).join('');
    if (sig !== `sha256=${mac}`) return new Response('Firma inválida', { status: 401 });
  }
  let body: any; try { body = JSON.parse(raw); } catch { return new Response('JSON inválido', { status: 400 }); }
  const accountId = await cuentaCanal(env);
  if (!accountId) return new Response('ok');
  const hilos = new Set<string>();
  for (const e of body?.entry || []) for (const ch of e?.changes || []) {
    const v = ch?.value; if (!v?.messages) continue;
    const nombres = new Map<string, string>((v.contacts || []).map((x: any) => [x.wa_id, x.profile?.name || '']));
    for (const m of v.messages) {
      const from = soloDigitos(m.from); if (!from) continue;
      let texto = '', media: any = null;
      if (m.type === 'text') texto = m.text?.body || '';
      else if (['image', 'document', 'video', 'audio', 'sticker'].includes(m.type)) {
        const x = m[m.type] || {};
        texto = x.caption || '';
        media = { tipo: m.type, id: String(x.id || ''), nombre: x.filename || '', mime: x.mime_type || '' };
      } else if (m.type === 'interactive') texto = m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || '';
      else if (m.type === 'button') texto = m.button?.text || '';
      else texto = `[Mensaje de tipo ${m.type}]`;
      const t = await hilo(env, accountId, 'whatsapp', from, nombres.get(m.from) || null);
      if (await guardarEntrante(env, accountId, t.id, texto, media, `wa:${m.id}`)) hilos.add(t.id);
    }
  }
  // Se contesta enseguida a Meta; la IA trabaja después
  for (const id of hilos) exec.waitUntil(procesar(env, accountId, id).catch(e => console.error('procesar', e)));
  return new Response('ok');
}

/* ---------------- Correo entrante (Cloudflare Email Routing) ---------------- */

const PARTE = 1_400_000; // bytes por parte guardada

async function guardarArchivo(env: Env, accountId: string, threadId: string, nombre: string, tipo: string, buf: ArrayBuffer) {
  const id = uuid(), u8 = new Uint8Array(buf), now = Date.now();
  const stmts: D1PreparedStatement[] = [];
  for (let p = 0, i = 0; i < u8.length || p === 0; p++, i += PARTE) {
    const slice = u8.subarray(i, i + PARTE);
    let s = ''; for (let k = 0; k < slice.length; k += 0x8000) s += String.fromCharCode(...slice.subarray(k, k + 0x8000));
    stmts.push(env.DB.prepare('INSERT INTO inbox_files (id, part, account_id, thread_id, nombre, tipo, size, data, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(id, p, accountId, threadId, nombre.slice(0, 120), tipo.slice(0, 100), u8.length, btoa(s), now));
    if (i + PARTE >= u8.length) break;
  }
  await env.DB.batch(stmts);
  return id;
}

/** Quita la parte citada de una respuesta ("El lunes ... escribió:" y líneas con ">"). */
function limpiarRespuesta(t: string) {
  const lineas = t.replace(/\r/g, '').split('\n'), out: string[] = [];
  for (const l of lineas) {
    if (/^(El|On) .+(escribió|wrote):?\s*$/i.test(l.trim()) || /^-{2,}\s*(Original|Mensaje original)/i.test(l.trim())) break;
    if (l.startsWith('>')) continue;
    out.push(l);
  }
  return out.join('\n').trim();
}

export async function correoEntrante(message: ForwardableEmailMessage, env: Env, exec: ExecutionContext) {
  const accountId = await cuentaCanal(env);
  if (!accountId) return;
  const raw = await new Response(message.raw).arrayBuffer();
  if (raw.byteLength > 30_000_000) { message.setReject('Mensaje demasiado grande'); return; }
  const mail = await PostalMime.parse(raw);
  const from = (mail.from?.address || message.from || '').toLowerCase();
  if (!from || /no-?reply|mailer-daemon|postmaster/i.test(from)) return;
  const texto = limpiarRespuesta(mail.text || (mail.html || '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).slice(0, 4000);
  const t = await hilo(env, accountId, 'correo', from, mail.from?.name || null);
  const adj: string[] = [];
  for (const a of (mail.attachments || []).slice(0, 5)) {
    const buf = (typeof a.content === 'string' ? new TextEncoder().encode(a.content).buffer : a.content) as ArrayBuffer;
    if (!buf || buf.byteLength > 15_000_000 || a.disposition === 'inline' && !a.filename) continue;
    adj.push(await guardarArchivo(env, accountId, t.id, a.filename || 'adjunto', a.mimeType || 'application/octet-stream', buf));
  }
  const ok = await guardarEntrante(env, accountId, t.id, texto || (adj.length ? '' : '(sin texto)'), { asunto: mail.subject || '', adjuntos: adj.length }, mail.messageId ? `mail:${mail.messageId.slice(0, 200)}` : null);
  if (ok) exec.waitUntil(procesar(env, accountId, t.id).catch(e => console.error('procesar', e)));
}

/* ---------------- Enlace público para enviar trabajos ---------------- */

async function cuentaPorToken(env: Env, t: unknown) {
  const tok = str(t, 40);
  if (!/^[0-9a-f]{24}$/.test(tok)) throw new HttpError(404, 'Enlace inválido');
  const r = await env.DB.prepare('SELECT account_id, data FROM settings WHERE data LIKE ?').bind(`%"token":"${tok}"%`).first<{ account_id: string; data: string }>();
  if (!r) throw new HttpError(404, 'Este enlace ya no está activo');
  return r.account_id;
}

export async function publicNegocio(env: Env, url: URL) {
  const accountId = await cuentaPorToken(env, url.searchParams.get('t'));
  const [st, a, logo] = await Promise.all([
    getSettings(env, accountId),
    env.DB.prepare('SELECT business FROM accounts WHERE id = ?').bind(accountId).first<{ business: string }>(),
    env.DB.prepare("SELECT data FROM assets WHERE account_id = ? AND k = 'logo_doc'").bind(accountId).first<{ data: string }>(),
  ]);
  const catalogo = st.catalogo.filter((s: any) => !s.oculto).map((s: any) => ({
    id: s.id, cat: s.cat, nombre: s.nombre, color: s.color, unidad: s.unidad, libre: !!s.libre,
    tams: s.tams.filter((t: any) => !t.oculto).map((t: any) => ({ id: t.id, nombre: t.nombre, precio: t.precio, tramos: t.tramos || undefined })),
  }));
  return json({ negocio: a?.business || '', telefono: st.empresa.telefono, correo: st.empresa.correo, logo: logo?.data || st.empresa.logo || '', itbms: st.itbms.tasa, catalogo });
}

export async function publicPedido(env: Env, req: Request) {
  const ip = req.headers.get('cf-connecting-ip') || 'local';
  await rateLimit(env, 'pedido:' + ip, 12, 3600_000);
  const ct = req.headers.get('content-type') || '';
  if (!ct.includes('multipart/form-data')) throw new HttpError(415, 'Formulario inválido');
  const len = Number(req.headers.get('content-length') || 0);
  if (len > 50_000_000) throw new HttpError(413, 'Los archivos pesan demasiado (máximo 45 MB en total)');
  const f = await req.formData();
  const accountId = await cuentaPorToken(env, f.get('t'));
  const nombre = str(f.get('nombre'), 80), tel = soloDigitos(f.get('tel')).slice(0, 15), correo = str(f.get('correo'), 120).toLowerCase();
  const nota = str(f.get('nota'), 1500), entrega = str(f.get('entrega'), 16);
  if (!nombre) throw new HttpError(400, 'Escribe tu nombre');
  if (tel.length < 7 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) throw new HttpError(400, 'Escribe tu celular o tu correo para avisarte');
  let lineas: any[] = [];
  try { lineas = JSON.parse(String(f.get('items') || '[]')); } catch { /* */ }
  if (!Array.isArray(lineas)) lineas = [];
  lineas = lineas.slice(0, 30);
  const archivos = f.getAll('archivo').filter((x): x is File => typeof x === 'object' && x !== null && 'arrayBuffer' in x).slice(0, 5);
  if (!lineas.length && !nota && !archivos.length) throw new HttpError(400, 'Cuéntanos qué necesitas');
  for (const a of archivos) if (a.size > 15_000_000) throw new HttpError(413, `"${a.name}" pesa más de 15 MB. Envíalo por WhatsApp o correo.`);

  const st = await getSettings(env, accountId);
  const contacto = tel || correo;
  const id = uuid(), now = Date.now();
  await env.DB.prepare('INSERT INTO inbox_threads (id, account_id, canal, contacto, nombre, estado, propuesta, no_leidos, created_at, updated_at) VALUES (?,?,?,?,?,?,?,1,?,?)')
    .bind(id, accountId, 'web', contacto, nombre, 'nuevo', lineas.length ? JSON.stringify(lineas) : null, now, now).run();
  for (const a of archivos) await guardarArchivo(env, accountId, id, a.name || 'archivo', a.type || 'application/octet-stream', await a.arrayBuffer());
  const detalle = [
    ...lineas.map(l => `• ${l.cant} × ${l.nombre || l.serv}${l.tamano ? ` · ${l.tamano}` : ''}${l.paginas ? ` · ${l.paginas} págs` : ''}${l.detalle ? ` (${l.detalle})` : ''}`),
    nota, [tel && `Cel. ${tel}`, correo].filter(Boolean).join(' · '), entrega ? `Para: ${entrega.replace('T', ' ')}` : '',
    archivos.length ? `${archivos.length} archivo${archivos.length === 1 ? '' : 's'} adjunto${archivos.length === 1 ? '' : 's'}` : '',
  ].filter(Boolean).join('\n');
  await env.DB.prepare('INSERT INTO inbox_msgs (thread_id, account_id, dir, autor, texto, ts) VALUES (?,?,?,?,?,?)').bind(id, accountId, 'in', 'cliente', detalle, now).run();

  let orden: any = null;
  if (st.canales.autoOrden && lineas.length) {
    try {
      const sid = uuid();
      orden = await insertarOrden(env, accountId, {
        client_id: await clienteDe(env, accountId, tel, correo),
        items: lineas.map(l => ({ serv: str(l.serv, 40), tam: str(l.tam, 40), cant: Number(l.cant), paginas: Number(l.paginas) || undefined, extra: str(l.detalle, 200) })),
        contacto_tel: tel, contacto_email: correo, operador: 'Web', entrega: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(entrega) ? entrega : null,
        nota: [`Pedido por la web · ${nombre}`, nota, archivos.length ? `${archivos.length} archivo(s) en Trabajos` : ''].filter(Boolean).join('\n'),
      }, { id: sid, origen: `web:${sid}`, prod: 'cola', inbox: id, nombre });
    } catch (e) { console.error('pedido web', e); orden = null; }
  }
  await notificar(env, accountId);
  return json({ ok: true, orden: orden ? { numero: num6(orden.numero), total: orden.total_cents, itbms: st.itbms.tasa } : null }, 201);
}
