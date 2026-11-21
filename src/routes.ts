import type { Ctx, Env } from './types';
import { HttpError, json, readJson, isDate, str, intOrNull, uuid } from './http';
import { hashPassword, safeEqual, iterations, createSession, sessionCookie, clearCookie, destroySession, rateLimit, clearRateLimit } from './auth';
import { getSettings, validateSettings, bumpRev, defaults } from './settings';
import { findItem, precioTramo } from './catalog';
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
    env.DB.prepare('INSERT INTO settings (account_id, data, updated_at) VALUES (?,?,?)').bind(id, JSON.stringify(defaults()), now),
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
  const r = await c.env.DB.prepare('SELECT id, name, phone, ruc, email, dm FROM clients WHERE account_id = ? AND archived = 0 ORDER BY name COLLATE NOCASE').bind(c.accountId).all();
  return json({ clients: r.results });
}

function clientBody(b: any) {
  const name = str(b.name, 80);
  if (!name) throw new HttpError(400, 'Escribe el nombre del cliente o empresa');
  const email = str(b.email, 120);
  if (email && !EMAIL_RE.test(email)) throw new HttpError(400, 'Correo del cliente inválido');
  return { name, phone: str(b.phone, 30) || null, ruc: str(b.ruc, 40) || null, email: email || null, dm: str(b.dm, 60) || null };
}

export async function createClient(c: Ctx) {
  const d = clientBody(await readJson(c.req));
  const dup = await c.env.DB.prepare('SELECT id, archived FROM clients WHERE account_id = ? AND name = ? COLLATE NOCASE').bind(c.accountId, d.name).first<{ id: string; archived: number }>();
  if (dup && !dup.archived) throw new HttpError(409, 'Ese cliente ya existe');
  const id = dup ? dup.id : uuid();
  const stmt = dup
    ? c.env.DB.prepare('UPDATE clients SET archived = 0, name = ?, phone = ?, ruc = ?, email = ?, dm = ? WHERE id = ?').bind(d.name, d.phone, d.ruc, d.email, d.dm, id)
    : c.env.DB.prepare('INSERT INTO clients (id, account_id, name, phone, ruc, email, dm, created_at) VALUES (?,?,?,?,?,?,?,?)').bind(id, c.accountId, d.name, d.phone, d.ruc, d.email, d.dm, Date.now());
  await c.env.DB.batch([stmt, await bumpRev(c.env, c.accountId)]);
  return json({ client: { id, ...d } }, 201);
}

export async function updateClient(c: Ctx) {
  const d = clientBody(await readJson(c.req));
  const dup = await c.env.DB.prepare('SELECT id FROM clients WHERE account_id = ? AND name = ? COLLATE NOCASE AND id != ? AND archived = 0').bind(c.accountId, d.name, c.params.id).first();
  if (dup) throw new HttpError(409, 'Ya hay otro cliente con ese nombre');
  const r = await c.env.DB.prepare('UPDATE clients SET name = ?, phone = ?, ruc = ?, email = ?, dm = ? WHERE id = ? AND account_id = ?').bind(d.name, d.phone, d.ruc, d.email, d.dm, c.params.id, c.accountId).run();
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

const SALE_COLS = `s.id, s.numero, s.numero_anulado, s.fecha, s.hora, s.ts, s.client_id, s.client_name,
  COALESCE(s.contacto_tel, c.phone) AS tel, COALESCE(s.contacto_dm, c.dm) AS dm, COALESCE(s.contacto_email, c.email) AS email, c.ruc AS ruc,
  s.operador, s.nota, s.origen, s.estado, s.metodo, s.pagada_ts, s.pagada_fecha, s.pagada_hora,
  s.subtotal_cents, s.itbms_cents, s.total_cents, s.paginas, s.anulada, s.anulada_ts`;
const ITEM_COLS = 'i.sale_id, i.cat, i.tipo, i.tam, i.nombre, i.color, i.unidad, i.extra, i.cant, i.precio_cents, i.sub_cents';

function shapeSales(rows: any[], items: any[]) {
  const byId = new Map<string, any>();
  const sales = rows.map(x => {
    const o = { ...x, anulada: !!x.anulada, subtotal_cents: x.subtotal_cents ?? x.total_cents, itbms_cents: x.itbms_cents ?? 0, items: [] as any[] };
    byId.set(x.id, o); return o;
  });
  for (const it of items) byId.get(it.sale_id)?.items.push({
    cat: it.cat, tipo: it.tipo, tam: it.tam, nombre: it.nombre, color: !!it.color, unidad: it.unidad, extra: it.extra,
    cant: it.cant, precio_cents: it.precio_cents, sub_cents: it.sub_cents,
  });
  return sales;
}

async function querySales(env: Env, where: string, binds: unknown[], order = 's.ts', limit = 3000) {
  const [s, i] = await env.DB.batch([
    env.DB.prepare(`SELECT ${SALE_COLS} FROM sales s LEFT JOIN clients c ON c.id = s.client_id WHERE ${where} ORDER BY ${order} LIMIT ${limit}`).bind(...binds),
    env.DB.prepare(`SELECT ${ITEM_COLS} FROM sale_items i JOIN sales s ON s.id = i.sale_id WHERE ${where} ORDER BY i.id`).bind(...binds),
  ]);
  return shapeSales(s.results as any[], i.results as any[]);
}

/** Ventas creadas en el rango (by=creada) o cobradas en el rango (by=pago). */
export async function listSales(c: Ctx) {
  const { from, to } = range(c.url);
  const col = c.url.searchParams.get('by') === 'pago' ? 's.pagada_fecha' : 's.fecha';
  return json({ sales: await querySales(c.env, `s.account_id = ? AND ${col} BETWEEN ? AND ?`, [c.accountId, from, to]) });
}

/** Lista de órdenes: pendientes (todas) o por estado en un rango. */
export async function listOrders(c: Ctx) {
  const estado = c.url.searchParams.get('estado') || 'pendiente';
  if (estado === 'pendiente') return json({ sales: await querySales(c.env, "s.account_id = ? AND s.estado = 'pendiente'", [c.accountId], 's.ts DESC', 1000) });
  if (estado === 'pordefinir') return json({ sales: await querySales(c.env, "s.account_id = ? AND s.estado = 'pagada' AND s.metodo = 'pordefinir'", [c.accountId], 's.ts DESC', 1000) });
  const { from, to } = range(c.url);
  const est = ['pagada', 'anulada'].includes(estado) ? ` AND s.estado = '${estado}'` : '';
  return json({ sales: await querySales(c.env, `s.account_id = ? AND s.fecha BETWEEN ? AND ?${est}`, [c.accountId, from, to], 's.ts DESC', 3000) });
}

async function getSale(env: Env, accountId: string, id: string) {
  return (await querySales(env, 's.account_id = ? AND s.id = ?', [accountId, id]))[0] || null;
}

export async function saleById(c: Ctx) {
  const sale = await getSale(c.env, c.accountId, c.params.id);
  if (!sale) throw new HttpError(404, 'Orden no encontrada');
  return json({ sale });
}

const METODOS = new Set(['efectivo', 'tarjeta', 'yappy', 'pordefinir']);
const EMAIL_OK = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

export async function createSale(c: Ctx) {
  const b = await readJson(c.req);
  const id = str(b.id, 64);
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(400, 'Id de orden inválido');
  const pagar = b.metodo != null && b.metodo !== '';
  if (pagar && !METODOS.has(b.metodo)) throw new HttpError(400, 'Método de pago inválido');
  if (!Array.isArray(b.items) || b.items.length < 1 || b.items.length > 50) throw new HttpError(400, 'La orden no tiene líneas');

  // Órdenes creadas desde el registro de una máquina: fecha original y sin duplicar
  let origen: string | null = null, tsOrigen: number | null = null;
  if (b.origen != null) {
    origen = str(b.origen, 80);
    if (!/^joblog:[0-9a-f]{16,64}$/.test(origen)) throw new HttpError(400, 'Origen inválido');
    tsOrigen = Math.round(Number(b.ts));
    if (!Number.isFinite(tsOrigen) || tsOrigen > Date.now() + 60000 || tsOrigen < Date.now() - 400 * 86400000) throw new HttpError(400, 'Fecha del trabajo inválida');
  }
  const prev = await c.env.DB.prepare('SELECT id FROM sales WHERE account_id = ? AND (id = ? OR (origen IS NOT NULL AND origen = ?))').bind(c.accountId, id, origen).first<{ id: string }>();
  if (prev) return json({ ok: true, duplicate: true, sale: await getSale(c.env, c.accountId, prev.id) });

  const st = await getSettings(c.env, c.accountId);
  const items = b.items.map((it: any) => {
    const f = findItem(st.catalogo, str(it?.serv, 40), str(it?.tam, 40));
    if (!f) throw new HttpError(400, 'Producto o tamaño no encontrado. Recarga la página.');
    const { s, t } = f;
    const decimal = s.unidad === 'pie lineal';
    let cant = Number(it.cant);
    cant = decimal ? Math.round(cant * 100) / 100 : Math.round(cant);
    if (!Number.isFinite(cant) || cant <= 0 || cant > 100000) throw new HttpError(400, 'Cantidad inválida');
    let precio = t.precio, extra: string | null = null;
    if (t.tramos) {
      const pags = Math.round(Number(it.paginas));
      if (!(pags >= 1)) throw new HttpError(400, 'Escribe la cantidad de páginas del encuadernado');
      const tr = precioTramo(t, pags);
      if (!tr) throw new HttpError(400, `Más de ${t.tramos[t.tramos.length - 1].hasta} páginas: usa "Otro producto" con precio libre`);
      precio = tr.precio; extra = `${pags} págs (tarifa ${tr.desde} a ${tr.hasta})`;
    }
    if (!precio) {
      precio = Math.round(Number(it.precio_cents));
      if (!Number.isFinite(precio) || precio < 1 || precio > 1000000) throw new HttpError(400, `Escribe el precio de ${s.nombre} ${t.nombre}`);
    }
    let nombre = s.nombre, color = s.color, tam = t.nombre;
    if (s.libre) {
      nombre = str(it.nombre, 80) || 'Otro';
      color = !!it.color;
      tam = str(it.tamano, 40) || '—';
    }
    const nota = str(it.extra, 80);
    if (nota) extra = extra ? `${extra} · ${nota}` : nota;
    return { cat: s.cat, tipo: s.id, tam, nombre, color: color ? 1 : 0, unidad: s.unidad, extra, cant, precio, sub: Math.round(precio * cant) };
  });
  const bruto = items.reduce((a: number, x: any) => a + x.sub, 0);
  const tasa = st.itbms.tasa / 100;
  // El ITBMS siempre se suma al precio
  const subtotal = bruto, itbms = Math.round(bruto * tasa);
  const total = subtotal + itbms;
  const paginas = items.reduce((a: number, x: any) => a + x.cant, 0);

  let clientId: string | null = null, clientName: string | null = null;
  if (b.client_id) {
    const cl = await c.env.DB.prepare('SELECT id, name FROM clients WHERE id = ? AND account_id = ?').bind(str(b.client_id, 64), c.accountId).first<{ id: string; name: string }>();
    if (!cl) throw new HttpError(400, 'Cliente no encontrado');
    clientId = cl.id; clientName = cl.name;
  }
  const email = str(b.contacto_email, 120);
  if (email && !EMAIL_OK.test(email)) throw new HttpError(400, 'Correo de contacto inválido');

  const ts = tsOrigen ?? Date.now();
  const { fecha, hora } = localParts(ts, st.tz);
  const stmts = [
    c.env.DB.prepare(`INSERT INTO sales (id, account_id, numero, fecha, hora, ts, client_id, client_name, contacto_tel, contacto_dm, contacto_email,
                        operador, nota, origen, estado, metodo, pagada_ts, pagada_fecha, pagada_hora, subtotal_cents, itbms_cents, total_cents, paginas)
                      VALUES (?, ?, (SELECT COALESCE(MAX(numero), 0) + 1 FROM sales WHERE account_id = ? AND anulada = 0),
                        ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id, c.accountId, c.accountId, fecha, hora, ts, clientId, clientName,
        str(b.contacto_tel, 30) || null, str(b.contacto_dm, 60) || null, email || null,
        str(b.operador, 60) || null, str(b.nota, 300) || null, origen,
        pagar ? 'pagada' : 'pendiente', pagar ? b.metodo : null,
        pagar ? ts : null, pagar ? fecha : null, pagar ? hora : null,
        subtotal, itbms, total, paginas),
    ...items.map((x: any) => c.env.DB.prepare(`INSERT INTO sale_items (sale_id, cat, tipo, tam, nombre, color, unidad, extra, cant, precio_cents, sub_cents)
                                                VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id, x.cat, x.tipo, x.tam, x.nombre, x.color, x.unidad, x.extra, x.cant, x.precio, x.sub)),
    await bumpRev(c.env, c.accountId),
  ];
  await c.env.DB.batch(stmts);
  return json({ ok: true, sale: await getSale(c.env, c.accountId, id) }, 201);
}

/** Cobrar una orden pendiente. */
export async function paySale(c: Ctx) {
  const b = await readJson(c.req);
  if (!METODOS.has(b.metodo)) throw new HttpError(400, 'Elige el método de pago');
  const st = await getSettings(c.env, c.accountId);
  const ts = Date.now();
  const { fecha, hora } = localParts(ts, st.tz);
  // Las órdenes importadas del registro se dan por cobradas el día del trabajo
  const r = await c.env.DB.prepare(`UPDATE sales SET estado = 'pagada', metodo = ?,
                                      pagada_ts = CASE WHEN origen IS NOT NULL THEN ts ELSE ? END,
                                      pagada_fecha = CASE WHEN origen IS NOT NULL THEN fecha ELSE ? END,
                                      pagada_hora = CASE WHEN origen IS NOT NULL THEN hora ELSE ? END
                                    WHERE id = ? AND account_id = ? AND estado = 'pendiente'`)
    .bind(b.metodo, ts, fecha, hora, c.params.id, c.accountId).run();
  if (!r.meta.changes) throw new HttpError(409, 'La orden ya no está pendiente');
  await (await bumpRev(c.env, c.accountId)).run();
  return json({ ok: true, sale: await getSale(c.env, c.accountId, c.params.id) });
}

/** Cambiar el método de una orden cobrada (por ejemplo, de "Por definir" a Yappy). Mantiene la fecha de cobro. */
export async function setMetodo(c: Ctx) {
  const b = await readJson(c.req);
  if (!METODOS.has(b.metodo)) throw new HttpError(400, 'Método de pago inválido');
  const r = await c.env.DB.prepare(`UPDATE sales SET metodo = ? WHERE id = ? AND account_id = ? AND estado = 'pagada'`).bind(b.metodo, c.params.id, c.accountId).run();
  if (!r.meta.changes) throw new HttpError(409, 'La orden no está cobrada');
  await (await bumpRev(c.env, c.accountId)).run();
  return json({ ok: true, sale: await getSale(c.env, c.accountId, c.params.id) });
}

/** Cobrar varias órdenes pendientes de una vez. */
export async function payMany(c: Ctx) {
  const b = await readJson(c.req);
  if (!METODOS.has(b.metodo)) throw new HttpError(400, 'Método de pago inválido');
  if (!Array.isArray(b.ids) || !b.ids.length || b.ids.length > 500) throw new HttpError(400, 'Sin órdenes');
  const st = await getSettings(c.env, c.accountId);
  const ts = Date.now();
  const { fecha, hora } = localParts(ts, st.tz);
  let n = 0;
  for (let i = 0; i < b.ids.length; i += 90) {
    const res = await c.env.DB.batch(b.ids.slice(i, i + 90).map((id: unknown) => c.env.DB.prepare(`UPDATE sales SET estado = 'pagada', metodo = ?,
        pagada_ts = CASE WHEN origen IS NOT NULL THEN ts ELSE ? END,
        pagada_fecha = CASE WHEN origen IS NOT NULL THEN fecha ELSE ? END,
        pagada_hora = CASE WHEN origen IS NOT NULL THEN hora ELSE ? END
      WHERE id = ? AND account_id = ? AND estado = 'pendiente'`).bind(b.metodo, ts, fecha, hora, str(id, 64), c.accountId)));
    n += res.reduce((a, x) => a + (x.meta.changes || 0), 0);
  }
  if (n) await (await bumpRev(c.env, c.accountId)).run();
  return json({ ok: true, cobradas: n });
}

/** Anular: la orden pierde su número para que el siguiente lo reutilice si era el último. */
export async function voidSale(c: Ctx) {
  const r = await c.env.DB.prepare(`UPDATE sales SET anulada = 1, anulada_ts = ?, estado = 'anulada', numero_anulado = numero, numero = NULL
                                    WHERE id = ? AND account_id = ? AND anulada = 0`)
    .bind(Date.now(), c.params.id, c.accountId).run();
  if (!r.meta.changes) throw new HttpError(404, 'Orden no encontrada o ya anulada');
  await (await bumpRev(c.env, c.accountId)).run();
  return json({ ok: true });
}

/* ---------------- Resumen por día ---------------- */

export async function summary(c: Ctx) {
  const { from, to } = range(c.url, 800);
  const [cr, pg, it, pend, cl, mq] = await c.env.DB.batch([
    // órdenes creadas (no anuladas)
    c.env.DB.prepare(`SELECT fecha, COUNT(*) AS n, SUM(total_cents) AS t, SUM(COALESCE(subtotal_cents, total_cents)) AS sb, SUM(itbms_cents) AS it
                      FROM sales WHERE account_id = ? AND fecha BETWEEN ? AND ? AND anulada = 0 GROUP BY fecha`).bind(c.accountId, from, to),
    // cobros recibidos por día y método
    c.env.DB.prepare(`SELECT pagada_fecha AS fecha, metodo, COUNT(*) AS n, SUM(total_cents) AS t FROM sales
                      WHERE account_id = ? AND pagada_fecha BETWEEN ? AND ? AND estado = 'pagada' GROUP BY pagada_fecha, metodo`).bind(c.accountId, from, to),
    // productos y servicios por día
    c.env.DB.prepare(`SELECT s.fecha, i.cat, i.tipo, i.nombre, i.tam, i.color, i.unidad, SUM(i.cant) AS cant, SUM(i.sub_cents) AS monto
                      FROM sale_items i JOIN sales s ON s.id = i.sale_id
                      WHERE s.account_id = ? AND s.fecha BETWEEN ? AND ? AND s.anulada = 0
                      GROUP BY s.fecha, i.cat, i.tipo, i.nombre, i.tam, i.color, i.unidad`).bind(c.accountId, from, to),
    // pendientes creadas en el rango
    c.env.DB.prepare(`SELECT fecha, COUNT(*) AS n, SUM(total_cents) AS t FROM sales WHERE account_id = ? AND fecha BETWEEN ? AND ? AND estado = 'pendiente' GROUP BY fecha`).bind(c.accountId, from, to),
    c.env.DB.prepare('SELECT fecha, inicio, fin, fiery, efectivo_cents, nota FROM closings WHERE account_id = ? AND fecha BETWEEN ? AND ?').bind(c.accountId, from, to),
    c.env.DB.prepare('SELECT fecha, maquina, SUM(color) AS color, SUM(bn) AS bn, COUNT(*) AS trabajos FROM machine_jobs WHERE account_id = ? AND fecha BETWEEN ? AND ? GROUP BY fecha, maquina').bind(c.accountId, from, to),
  ]);
  const days: Record<string, any> = {};
  const day = (f: string) => days[f] ??= {
    n: 0, total: 0, sub: 0, itbms: 0, cobrado: 0, pendN: 0, pendT: 0,
    met: { efectivo: { n: 0, t: 0 }, tarjeta: { n: 0, t: 0 }, yappy: { n: 0, t: 0 }, pordefinir: { n: 0, t: 0 } }, items: [] as any[], maq: {} as Record<string, any>,
  };
  for (const r of cr.results as any[]) Object.assign(day(r.fecha), { n: r.n, total: r.t || 0, sub: r.sb || 0, itbms: r.it || 0 });
  for (const r of pg.results as any[]) { const d = day(r.fecha); if (d.met[r.metodo]) d.met[r.metodo] = { n: r.n, t: r.t }; d.cobrado += r.t || 0; }
  for (const r of it.results as any[]) day(r.fecha).items.push({ cat: r.cat, tipo: r.tipo, nombre: r.nombre, tam: r.tam, color: !!r.color, unidad: r.unidad, cant: r.cant, monto: r.monto });
  for (const r of pend.results as any[]) Object.assign(day(r.fecha), { pendN: r.n, pendT: r.t || 0 });
  for (const r of mq.results as any[]) day(r.fecha).maq[r.maquina] = { color: r.color, bn: r.bn, trabajos: r.trabajos };
  const closings: Record<string, any> = {};
  for (const r of cl.results as any[]) closings[r.fecha] = r;
  return json({ days, closings });
}

/* ---------------- Registros de máquinas ---------------- */

export async function importJobs(c: Ctx) {
  const b = await readJson(c.req);
  const st = await getSettings(c.env, c.accountId);
  const maquina = str(b.maquina, 20);
  if (!st.maquinas.some(m => m.id === maquina)) throw new HttpError(400, 'Máquina desconocida');
  if (!Array.isArray(b.rows) || b.rows.length > 600) throw new HttpError(400, 'Envía hasta 600 filas por vez');
  const now = Date.now();
  const stmts = b.rows.map((r: any) => {
    if (typeof r?.h !== 'string' || !/^[0-9a-f]{16,64}$/.test(r.h) || !isDate(r.fecha)) throw new HttpError(400, 'Fila inválida');
    const color = Math.max(0, Math.min(1e6, Math.round(Number(r.color) || 0)));
    const bn = Math.max(0, Math.min(1e6, Math.round(Number(r.bn) || 0)));
    return c.env.DB.prepare('INSERT OR IGNORE INTO machine_jobs (account_id, maquina, hash, fecha, color, bn, created_at) VALUES (?,?,?,?,?,?,?)')
      .bind(c.accountId, maquina, r.h, r.fecha, color, bn, now);
  });
  let nuevos = 0;
  for (let i = 0; i < stmts.length; i += 100) {
    const res = await c.env.DB.batch(stmts.slice(i, i + 100));
    nuevos += res.reduce((a, x) => a + (x.meta.changes || 0), 0);
  }
  if (Array.isArray(b.map) || (b.map && typeof b.map === 'object')) {
    const m = st.maquinas.find(x => x.id === maquina)!; m.map = b.map;
    await c.env.DB.prepare('UPDATE settings SET data = ?, updated_at = ? WHERE account_id = ?').bind(JSON.stringify(st), now, c.accountId).run();
  }
  if (nuevos) await (await bumpRev(c.env, c.accountId)).run();
  return json({ ok: true, nuevos, repetidos: stmts.length - nuevos });
}

export async function deleteJobsDay(c: Ctx) {
  const maquina = str(c.url.searchParams.get('maquina'), 20), fecha = c.url.searchParams.get('fecha');
  if (!isDate(fecha)) throw new HttpError(400, 'Fecha inválida');
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM machine_jobs WHERE account_id = ? AND maquina = ? AND fecha = ?').bind(c.accountId, maquina, fecha),
    await bumpRev(c.env, c.accountId),
  ]);
  return json({ ok: true });
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
