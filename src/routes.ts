import type { Ctx, Env } from './types';
import { DEFAULT_SETTINGS } from './types';
import { HttpError, json, readJson, isDate, str, intOrNull, uuid } from './http';
import { hashPassword, safeEqual, iterations, createSession, sessionCookie, clearCookie, destroySession, rateLimit, clearRateLimit } from './auth';
import { getSettings, validateSettings, bumpRev } from './settings';
import { localParts, daysBetween } from './time';

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

/* ---------------- Cuenta ---------------- */

export async function register(env: Env, req: Request, url: URL): Promise<Response> {
  if ((env.ALLOW_SIGNUP || 'true') !== 'true') throw new HttpError(403, 'El registro de cuentas nuevas está cerrado');
  const b = await readJson(req);
  const email = str(b.email, 254).toLowerCase();
  const business = str(b.business, 80);
  const password = typeof b.password === 'string' ? b.password : '';
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Correo inválido');
  if (!business) throw new HttpError(400, 'Escribe el nombre del negocio');
  if (password.length < 8 || password.length > 200) throw new HttpError(400, 'La contraseña debe tener al menos 8 caracteres');
  const ip = req.headers.get('cf-connecting-ip') || 'local';
  await rateLimit(env, 'reg:' + ip, 10, 3600_000);
  const exists = await env.DB.prepare('SELECT 1 FROM accounts WHERE email = ?').bind(email).first();
  if (exists) throw new HttpError(409, 'Ya existe una cuenta con ese correo');
  const h = await hashPassword(password, null, iterations(env));
  const id = uuid(); const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO accounts (id, email, business, pass_hash, pass_salt, pass_iter, created_at) VALUES (?,?,?,?,?,?,?)')
      .bind(id, email, business, h.hash, h.salt, h.iterations, now),
    env.DB.prepare('INSERT INTO settings (account_id, data, updated_at) VALUES (?,?,?)').bind(id, JSON.stringify(DEFAULT_SETTINGS), now),
  ]);
  const token = await createSession(env, id, req);
  return json({ ok: true }, 201, { 'set-cookie': sessionCookie(token, url) });
}

export async function login(env: Env, req: Request, url: URL): Promise<Response> {
  const b = await readJson(req);
  const email = str(b.email, 254).toLowerCase();
  const password = typeof b.password === 'string' ? b.password : '';
  const ip = req.headers.get('cf-connecting-ip') || 'local';
  await rateLimit(env, 'login:' + email, 8, 15 * 60_000);
  await rateLimit(env, 'ip:' + ip, 40, 15 * 60_000);
  const row = await env.DB.prepare('SELECT id, pass_hash, pass_salt, pass_iter FROM accounts WHERE email = ?').bind(email)
    .first<{ id: string; pass_hash: string; pass_salt: string; pass_iter: number }>();
  if (!row) throw new HttpError(401, 'Correo o contraseña incorrectos');
  const h = await hashPassword(password, row.pass_salt, row.pass_iter);
  if (!safeEqual(h.hash, row.pass_hash)) throw new HttpError(401, 'Correo o contraseña incorrectos');
  await clearRateLimit(env, 'login:' + email);
  const token = await createSession(env, row.id, req);
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie(token, url) });
}

export async function logout(env: Env, req: Request, url: URL): Promise<Response> {
  await destroySession(env, req);
  return json({ ok: true }, 200, { 'set-cookie': clearCookie(url) });
}

export async function me(c: Ctx) {
  const a = await c.env.DB.prepare('SELECT email, business, rev FROM accounts WHERE id = ?').bind(c.accountId).first();
  if (!a) throw new HttpError(401, 'Inicia sesión');
  return json({ account: a, settings: await getSettings(c.env, c.accountId) });
}

export async function rev(c: Ctx) {
  const a = await c.env.DB.prepare('SELECT rev FROM accounts WHERE id = ?').bind(c.accountId).first<{ rev: number }>();
  return json({ rev: a?.rev ?? 0 });
}

export async function updateAccount(c: Ctx) {
  const b = await readJson(c.req);
  const business = str(b.business, 80);
  if (!business) throw new HttpError(400, 'Escribe el nombre del negocio');
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE accounts SET business = ? WHERE id = ?').bind(business, c.accountId),
    await bumpRev(c.env, c.accountId),
  ]);
  return json({ ok: true });
}

export async function changePassword(c: Ctx) {
  const b = await readJson(c.req);
  const actual = typeof b.actual === 'string' ? b.actual : '';
  const nueva = typeof b.nueva === 'string' ? b.nueva : '';
  if (nueva.length < 8 || nueva.length > 200) throw new HttpError(400, 'La contraseña nueva debe tener al menos 8 caracteres');
  await rateLimit(c.env, 'pwd:' + c.accountId, 8, 15 * 60_000);
  const row = await c.env.DB.prepare('SELECT pass_hash, pass_salt, pass_iter FROM accounts WHERE id = ?').bind(c.accountId)
    .first<{ pass_hash: string; pass_salt: string; pass_iter: number }>();
  if (!row) throw new HttpError(401, 'Inicia sesión');
  const h = await hashPassword(actual, row.pass_salt, row.pass_iter);
  if (!safeEqual(h.hash, row.pass_hash)) throw new HttpError(400, 'La contraseña actual no es correcta');
  const n = await hashPassword(nueva, null, iterations(c.env));
  await c.env.DB.prepare('UPDATE accounts SET pass_hash = ?, pass_salt = ?, pass_iter = ? WHERE id = ?').bind(n.hash, n.salt, n.iterations, c.accountId).run();
  return json({ ok: true });
}

export async function logoutAll(c: Ctx) {
  await c.env.DB.prepare('DELETE FROM sessions WHERE account_id = ?').bind(c.accountId).run();
  return json({ ok: true }, 200, { 'set-cookie': clearCookie(c.url) });
}

/* ---------------- Ajustes ---------------- */

export async function putSettings(c: Ctx) {
  const s = validateSettings(await readJson(c.req));
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO settings (account_id, data, updated_at) VALUES (?,?,?) ON CONFLICT(account_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at')
      .bind(c.accountId, JSON.stringify(s), Date.now()),
    await bumpRev(c.env, c.accountId),
  ]);
  return json({ settings: s });
}

/* ---------------- Clientes ---------------- */

export async function listClients(c: Ctx) {
  const r = await c.env.DB.prepare('SELECT id, name, phone, ruc FROM clients WHERE account_id = ? AND archived = 0 ORDER BY name COLLATE NOCASE').bind(c.accountId).all();
  return json({ clients: r.results });
}

function clientBody(b: any) {
  const name = str(b.name, 80);
  if (!name) throw new HttpError(400, 'Escribe el nombre del cliente o empresa');
  return { name, phone: str(b.phone, 30) || null, ruc: str(b.ruc, 40) || null };
}

export async function createClient(c: Ctx) {
  const d = clientBody(await readJson(c.req));
  const dup = await c.env.DB.prepare('SELECT id, archived FROM clients WHERE account_id = ? AND name = ? COLLATE NOCASE').bind(c.accountId, d.name).first<{ id: string; archived: number }>();
  if (dup && !dup.archived) throw new HttpError(409, 'Ese cliente ya existe');
  const id = dup ? dup.id : uuid();
  const stmt = dup
    ? c.env.DB.prepare('UPDATE clients SET archived = 0, name = ?, phone = ?, ruc = ? WHERE id = ?').bind(d.name, d.phone, d.ruc, id)
    : c.env.DB.prepare('INSERT INTO clients (id, account_id, name, phone, ruc, created_at) VALUES (?,?,?,?,?,?)').bind(id, c.accountId, d.name, d.phone, d.ruc, Date.now());
  await c.env.DB.batch([stmt, await bumpRev(c.env, c.accountId)]);
  return json({ client: { id, ...d } }, 201);
}

export async function updateClient(c: Ctx) {
  const d = clientBody(await readJson(c.req));
  const dup = await c.env.DB.prepare('SELECT id FROM clients WHERE account_id = ? AND name = ? COLLATE NOCASE AND id != ? AND archived = 0').bind(c.accountId, d.name, c.params.id).first();
  if (dup) throw new HttpError(409, 'Ya hay otro cliente con ese nombre');
  const r = await c.env.DB.prepare('UPDATE clients SET name = ?, phone = ?, ruc = ? WHERE id = ? AND account_id = ?').bind(d.name, d.phone, d.ruc, c.params.id, c.accountId).run();
  if (!r.meta.changes) throw new HttpError(404, 'Cliente no encontrado');
  await (await bumpRev(c.env, c.accountId)).run();
  return json({ client: { id: c.params.id, ...d } });
}

export async function deleteClient(c: Ctx) {
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE clients SET archived = 1 WHERE id = ? AND account_id = ?').bind(c.params.id, c.accountId),
    await bumpRev(c.env, c.accountId),
  ]);
  return json({ ok: true });
}

/* ---------------- Ventas ---------------- */

function range(url: URL, maxDays = 400) {
  const from = url.searchParams.get('from'), to = url.searchParams.get('to');
  if (!isDate(from) || !isDate(to)) throw new HttpError(400, 'Rango de fechas inválido');
  const d = daysBetween(from, to);
  if (d < 0 || d > maxDays) throw new HttpError(400, 'Rango de fechas inválido');
  return { from, to };
}

export async function listSales(c: Ctx) {
  const { from, to } = range(c.url);
  const [s, i] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT id, fecha, hora, ts, client_id, client_name, metodo, total_cents, paginas, anulada
                      FROM sales WHERE account_id = ? AND fecha BETWEEN ? AND ? ORDER BY ts`).bind(c.accountId, from, to),
    c.env.DB.prepare(`SELECT i.sale_id, i.tipo, i.tam, i.nombre, i.cant, i.precio_cents, i.sub_cents
                      FROM sale_items i JOIN sales s ON s.id = i.sale_id
                      WHERE s.account_id = ? AND s.fecha BETWEEN ? AND ? ORDER BY i.id`).bind(c.accountId, from, to),
  ]);
  const byId = new Map<string, any>();
  const sales = (s.results as any[]).map(x => { const o = { ...x, anulada: !!x.anulada, items: [] as any[] }; byId.set(x.id, o); return o; });
  for (const it of i.results as any[]) byId.get(it.sale_id)?.items.push({ tipo: it.tipo, tam: it.tam, nombre: it.nombre, cant: it.cant, precio_cents: it.precio_cents, sub_cents: it.sub_cents });
  return json({ sales });
}

const TAMS = new Set(['carta', 'legal', 'otro']);
const METODOS = new Set(['efectivo', 'tarjeta', 'yappy']);

export async function createSale(c: Ctx) {
  const b = await readJson(c.req);
  const id = str(b.id, 64);
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(400, 'Id de venta inválido');
  if (!METODOS.has(b.metodo)) throw new HttpError(400, 'Elige el método de pago');
  if (!Array.isArray(b.items) || b.items.length < 1 || b.items.length > 50) throw new HttpError(400, 'La venta no tiene líneas');

  // Reintento seguro: si ya existe, devolver lo guardado
  const prev = await c.env.DB.prepare('SELECT id FROM sales WHERE id = ? AND account_id = ?').bind(id, c.accountId).first();
  if (prev) return json({ ok: true, id, duplicate: true });

  const st = await getSettings(c.env, c.accountId);
  const items = b.items.map((it: any) => {
    if (it?.tipo !== 'imp' && it?.tipo !== 'cop') throw new HttpError(400, 'Tipo de venta inválido');
    if (!TAMS.has(it?.tam)) throw new HttpError(400, 'Tamaño inválido');
    const cant = Math.round(Number(it.cant));
    if (!Number.isFinite(cant) || cant < 1 || cant > 100000) throw new HttpError(400, 'Cantidad inválida');
    let precio: number, nombre: string;
    if (it.tam === 'otro') {
      precio = Math.round(Number(it.precio_cents));
      if (!Number.isFinite(precio) || precio < 1 || precio > 100000) throw new HttpError(400, 'Precio inválido');
      nombre = str(it.nombre, 40) || 'Otro';
    } else {
      precio = st.precios[it.tipo as 'imp' | 'cop'][it.tam as 'carta' | 'legal'];
      nombre = it.tam === 'carta' ? 'Carta' : 'Legal';
    }
    return { tipo: it.tipo, tam: it.tam, nombre, cant, precio, sub: precio * cant };
  });
  const total = items.reduce((a: number, x: any) => a + x.sub, 0);
  const paginas = items.reduce((a: number, x: any) => a + x.cant, 0);

  let clientId: string | null = null, clientName: string | null = null;
  if (b.client_id) {
    const cl = await c.env.DB.prepare('SELECT id, name FROM clients WHERE id = ? AND account_id = ?').bind(str(b.client_id, 64), c.accountId).first<{ id: string; name: string }>();
    if (!cl) throw new HttpError(400, 'Cliente no encontrado');
    clientId = cl.id; clientName = cl.name;
  }

  const ts = Date.now();
  const { fecha, hora } = localParts(ts, st.tz);
  const stmts = [
    c.env.DB.prepare(`INSERT INTO sales (id, account_id, fecha, hora, ts, client_id, client_name, metodo, total_cents, paginas)
                      VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(id, c.accountId, fecha, hora, ts, clientId, clientName, b.metodo, total, paginas),
    ...items.map((x: any) => c.env.DB.prepare('INSERT INTO sale_items (sale_id, tipo, tam, nombre, cant, precio_cents, sub_cents) VALUES (?,?,?,?,?,?,?)')
      .bind(id, x.tipo, x.tam, x.nombre, x.cant, x.precio, x.sub)),
    await bumpRev(c.env, c.accountId),
  ];
  await c.env.DB.batch(stmts);
  return json({ ok: true, id, fecha, hora, total_cents: total }, 201);
}

export async function voidSale(c: Ctx) {
  const r = await c.env.DB.prepare('UPDATE sales SET anulada = 1, anulada_ts = ? WHERE id = ? AND account_id = ? AND anulada = 0')
    .bind(Date.now(), c.params.id, c.accountId).run();
  if (!r.meta.changes) throw new HttpError(404, 'Venta no encontrada o ya anulada');
  await (await bumpRev(c.env, c.accountId)).run();
  return json({ ok: true });
}

/* ---------------- Resumen por día ---------------- */

export async function summary(c: Ctx) {
  const { from, to } = range(c.url, 800);
  const [m, it, cl] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT fecha, metodo, COUNT(*) AS n, SUM(total_cents) AS t FROM sales
                      WHERE account_id = ? AND fecha BETWEEN ? AND ? AND anulada = 0 GROUP BY fecha, metodo`).bind(c.accountId, from, to),
    c.env.DB.prepare(`SELECT s.fecha, i.tipo, i.tam, SUM(i.cant) AS c FROM sale_items i JOIN sales s ON s.id = i.sale_id
                      WHERE s.account_id = ? AND s.fecha BETWEEN ? AND ? AND s.anulada = 0 GROUP BY s.fecha, i.tipo, i.tam`).bind(c.accountId, from, to),
    c.env.DB.prepare(`SELECT fecha, inicio, fin, fiery, efectivo_cents, nota FROM closings WHERE account_id = ? AND fecha BETWEEN ? AND ?`).bind(c.accountId, from, to),
  ]);
  const days: Record<string, any> = {};
  const day = (f: string) => days[f] ??= { n: 0, total: 0, met: { efectivo: { n: 0, t: 0 }, tarjeta: { n: 0, t: 0 }, yappy: { n: 0, t: 0 } }, pag: { imp: { carta: 0, legal: 0, otro: 0 }, cop: { carta: 0, legal: 0, otro: 0 } } };
  for (const r of m.results as any[]) { const d = day(r.fecha); d.n += r.n; d.total += r.t; if (d.met[r.metodo]) d.met[r.metodo] = { n: r.n, t: r.t }; }
  for (const r of it.results as any[]) { const d = day(r.fecha); d.pag[r.tipo][TAMS.has(r.tam) ? r.tam : 'otro'] += r.c; }
  const closings: Record<string, any> = {};
  for (const r of cl.results as any[]) closings[r.fecha] = r;
  return json({ days, closings });
}

/* ---------------- Cierre del día ---------------- */

export async function getClosing(c: Ctx) {
  if (!isDate(c.params.fecha)) throw new HttpError(400, 'Fecha inválida');
  const r = await c.env.DB.prepare('SELECT fecha, inicio, fin, fiery, efectivo_cents, nota FROM closings WHERE account_id = ? AND fecha = ?').bind(c.accountId, c.params.fecha).first();
  return json({ closing: r || null });
}

export async function putClosing(c: Ctx) {
  if (!isDate(c.params.fecha)) throw new HttpError(400, 'Fecha inválida');
  const b = await readJson(c.req);
  const d = {
    inicio: intOrNull(b.inicio, 0, 999_999_999), fin: intOrNull(b.fin, 0, 999_999_999), fiery: intOrNull(b.fiery, 0, 9_999_999),
    efectivo_cents: intOrNull(b.efectivo_cents, 0, 100_000_000), nota: str(b.nota, 300) || null,
  };
  if (d.inicio != null && d.fin != null && d.fin < d.inicio) throw new HttpError(400, 'El contador al cerrar no puede ser menor que al abrir');
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO closings (account_id, fecha, inicio, fin, fiery, efectivo_cents, nota, updated_at) VALUES (?,?,?,?,?,?,?,?)
                      ON CONFLICT(account_id, fecha) DO UPDATE SET inicio=excluded.inicio, fin=excluded.fin, fiery=excluded.fiery,
                      efectivo_cents=excluded.efectivo_cents, nota=excluded.nota, updated_at=excluded.updated_at`)
      .bind(c.accountId, c.params.fecha, d.inicio, d.fin, d.fiery, d.efectivo_cents, d.nota, Date.now()),
    await bumpRev(c.env, c.accountId),
  ]);
  return json({ closing: { fecha: c.params.fecha, ...d } });
}
