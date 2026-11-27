/* Inventario (experimental): artículos, movimientos y descuento automático por lo vendido. */
import type { Ctx, Env } from './types';
import { HttpError, json, readJson, str, uuid } from './http';
import { bumpRev, getSettings } from './settings';
import { localParts } from './time';

export interface Regla { serv: string; tam: string; factor: number }

const num = (v: unknown, min: number, max: number, msg: string) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(400, msg);
  return Math.round(n * 1000) / 1000;
};

function reglas(v: unknown): Regla[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 30).map((r: any) => ({
    serv: str(r?.serv, 40), tam: str(r?.tam, 60), factor: num(r?.factor ?? 1, 0.001, 10000, 'Cantidad por unidad inválida'),
  })).filter(r => r.serv);
}

const ITEM_SQL = `SELECT i.id, i.nombre, i.unidad, i.minimo, i.costo_cents, i.reglas, i.archivado,
  COALESCE((SELECT SUM(cant) FROM inv_movs m WHERE m.item_id = i.id), 0) AS stock
  FROM inv_items i WHERE i.account_id = ?`;
const shape = (r: any) => ({ ...r, archivado: !!r.archivado, reglas: (() => { try { return JSON.parse(r.reglas || '[]'); } catch { return []; } })() });

export async function listItems(c: Ctx) {
  const { results } = await c.env.DB.prepare(`${ITEM_SQL} AND i.archivado = 0 ORDER BY i.nombre COLLATE NOCASE`).bind(c.accountId).all();
  return json({ items: results.map(shape) });
}

function leerItem(b: any) {
  const nombre = str(b.nombre, 80);
  if (!nombre) throw new HttpError(400, 'Escribe el nombre del artículo');
  return {
    nombre, unidad: str(b.unidad, 20) || 'unidad',
    minimo: num(b.minimo ?? 0, 0, 1e9, 'Mínimo inválido'),
    costo: Math.round(num(b.costo_cents ?? 0, 0, 1e9, 'Costo inválido')),
    reglas: JSON.stringify(reglas(b.reglas)),
  };
}

export async function createItem(c: Ctx) {
  const b = await readJson(c.req);
  const d = leerItem(b), id = uuid(), now = Date.now();
  const inicial = b.stock != null && b.stock !== '' ? num(b.stock, 0, 1e9, 'Existencia inválida') : 0;
  const st = await getSettings(c.env, c.accountId);
  const { fecha } = localParts(now, st.tz);
  const stmts = [c.env.DB.prepare('INSERT INTO inv_items (id, account_id, nombre, unidad, minimo, costo_cents, reglas, archivado, created_at) VALUES (?,?,?,?,?,?,?,0,?)')
    .bind(id, c.accountId, d.nombre, d.unidad, d.minimo, d.costo, d.reglas, now)];
  if (inicial) stmts.push(c.env.DB.prepare('INSERT INTO inv_movs (account_id, item_id, ts, fecha, tipo, cant, nota) VALUES (?,?,?,?,?,?,?)')
    .bind(c.accountId, id, now, fecha, 'ajuste', inicial, 'Existencia inicial'));
  stmts.push(await bumpRev(c.env, c.accountId));
  await c.env.DB.batch(stmts);
  return json({ ok: true, id }, 201);
}

export async function updateItem(c: Ctx) {
  const b = await readJson(c.req);
  if (b.archivado === true) {
    await c.env.DB.batch([c.env.DB.prepare('UPDATE inv_items SET archivado = 1 WHERE id = ? AND account_id = ?').bind(c.params.id, c.accountId), await bumpRev(c.env, c.accountId)]);
    return json({ ok: true });
  }
  const d = leerItem(b);
  const r = await c.env.DB.prepare('UPDATE inv_items SET nombre = ?, unidad = ?, minimo = ?, costo_cents = ?, reglas = ? WHERE id = ? AND account_id = ?')
    .bind(d.nombre, d.unidad, d.minimo, d.costo, d.reglas, c.params.id, c.accountId).run();
  if (!r.meta.changes) throw new HttpError(404, 'Artículo no encontrado');
  await (await bumpRev(c.env, c.accountId)).run();
  return json({ ok: true });
}

/** Entrada, salida o conteo físico (ajuste a una existencia exacta). */
export async function addMov(c: Ctx) {
  const b = await readJson(c.req);
  const it = await c.env.DB.prepare(`${ITEM_SQL} AND i.id = ?`).bind(c.accountId, c.params.id).first<any>();
  if (!it) throw new HttpError(404, 'Artículo no encontrado');
  const tipo = str(b.tipo, 10);
  if (!['entrada', 'salida', 'conteo'].includes(tipo)) throw new HttpError(400, 'Movimiento inválido');
  const v = num(b.cant, 0, 1e9, 'Cantidad inválida');
  let cant = tipo === 'entrada' ? v : tipo === 'salida' ? -v : Math.round((v - it.stock) * 1000) / 1000;
  if (tipo !== 'conteo' && !v) throw new HttpError(400, 'Escribe la cantidad');
  if (!cant && tipo === 'conteo') return json({ ok: true });
  const st = await getSettings(c.env, c.accountId);
  const now = Date.now(), { fecha } = localParts(now, st.tz);
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO inv_movs (account_id, item_id, ts, fecha, tipo, cant, nota) VALUES (?,?,?,?,?,?,?)')
      .bind(c.accountId, it.id, now, fecha, tipo === 'conteo' ? 'ajuste' : tipo, cant, str(b.nota, 160) || (tipo === 'conteo' ? 'Conteo físico' : null)),
    await bumpRev(c.env, c.accountId),
  ]);
  return json({ ok: true });
}

export async function listMovs(c: Ctx) {
  const { results } = await c.env.DB.prepare(`SELECT m.id, m.ts, m.fecha, m.tipo, m.cant, m.nota, s.numero, s.numero_anulado FROM inv_movs m LEFT JOIN sales s ON s.id = m.sale_id
    WHERE m.account_id = ? AND m.item_id = ? ORDER BY m.ts DESC, m.id DESC LIMIT 200`).bind(c.accountId, c.params.id).all();
  return json({ movs: results });
}

/**
 * Sentencias para recalcular lo que una orden consumió del inventario.
 * Se borran sus movimientos y se vuelven a crear según las reglas (si la orden no está anulada).
 */
export async function consumoStmts(env: Env, accountId: string, saleId: string, items: { tipo: string; tam: string; cant: number }[] | null, ts: number, fecha: string) {
  const out: D1PreparedStatement[] = [env.DB.prepare('DELETE FROM inv_movs WHERE account_id = ? AND sale_id = ?').bind(accountId, saleId)];
  if (!items?.length) return out;
  const { results } = await env.DB.prepare("SELECT id, reglas FROM inv_items WHERE account_id = ? AND archivado = 0 AND reglas != '[]'").bind(accountId).all<{ id: string; reglas: string }>();
  for (const r of results) {
    let rs: Regla[] = [];
    try { rs = JSON.parse(r.reglas); } catch { continue; }
    let total = 0;
    for (const it of items) for (const g of rs) if (g.serv === it.tipo && (!g.tam || g.tam === it.tam)) total += it.cant * g.factor;
    total = Math.round(total * 1000) / 1000;
    if (total > 0) out.push(env.DB.prepare('INSERT INTO inv_movs (account_id, item_id, ts, fecha, tipo, cant, nota, sale_id) VALUES (?,?,?,?,?,?,?,?)')
      .bind(accountId, r.id, ts, fecha, 'venta', -total, null, saleId));
  }
  return out;
}

/** Recalcula el consumo de una orden ya guardada (después de editarla o unificarla). */
export async function recalcularConsumo(env: Env, accountId: string, saleId: string) {
  const s = await env.DB.prepare('SELECT ts, fecha, anulada FROM sales WHERE id = ? AND account_id = ?').bind(saleId, accountId).first<{ ts: number; fecha: string; anulada: number }>();
  if (!s) return;
  const items = s.anulada ? [] : (await env.DB.prepare('SELECT tipo, tam, cant FROM sale_items WHERE sale_id = ?').bind(saleId).all<{ tipo: string; tam: string; cant: number }>()).results;
  await env.DB.batch(await consumoStmts(env, accountId, saleId, items, s.ts, s.fecha));
}
