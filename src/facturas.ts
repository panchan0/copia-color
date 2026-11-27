/*
 * Facturas: se generan desde una o varias órdenes con los datos fiscales del cliente.
 * Numeración propia y campo CUFE listo para cuando se conecte la facturación electrónica de la DGI.
 */
import type { Ctx } from './types';
import { HttpError, json, readJson, str, uuid, isDate } from './http';
import { bumpRev, getSettings } from './settings';
import { localParts } from './time';
import { querySales } from './routes';

const shape = (r: any) => ({ ...r, receptor: JSON.parse(r.receptor), items: JSON.parse(r.items), sale_ids: JSON.parse(r.sale_ids) });

export async function listInvoices(c: Ctx) {
  const from = c.url.searchParams.get('from'), to = c.url.searchParams.get('to');
  const rango = isDate(from) && isDate(to);
  const { results } = await c.env.DB.prepare(`SELECT * FROM invoices WHERE account_id = ?${rango ? ' AND fecha BETWEEN ? AND ?' : ''} ORDER BY numero DESC LIMIT 500`)
    .bind(...(rango ? [c.accountId, from, to] : [c.accountId])).all();
  return json({ invoices: results.map(shape) });
}

export async function getInvoice(c: Ctx) {
  const r = await c.env.DB.prepare('SELECT * FROM invoices WHERE id = ? AND account_id = ?').bind(c.params.id, c.accountId).first();
  if (!r) throw new HttpError(404, 'Factura no encontrada');
  return json({ invoice: shape(r) });
}

export async function createInvoice(c: Ctx) {
  const b = await readJson(c.req);
  const ids = Array.isArray(b.sale_ids) ? [...new Set(b.sale_ids.map((x: unknown) => str(x, 64)))].filter(Boolean) as string[] : [];
  if (!ids.length || ids.length > 100) throw new HttpError(400, 'Elige las órdenes a facturar');
  const ph = ids.map(() => '?').join(',');
  const sales = await querySales(c.env, `s.account_id = ? AND s.id IN (${ph})`, [c.accountId, ...ids], 's.numero');
  if (sales.length !== ids.length) throw new HttpError(400, 'Alguna orden ya no existe');
  if (sales.some((s: any) => s.anulada)) throw new HttpError(400, 'No se puede facturar una orden anulada');
  const ya = sales.find((s: any) => s.factura_id);
  if (ya) throw new HttpError(409, `La orden N° ${String(ya.numero).padStart(6, '0')} ya está facturada`);
  const r = b.receptor || {};
  const receptor = {
    nombre: str(r.nombre, 120), ruc: str(r.ruc, 40), dv: str(r.dv, 4), direccion: str(r.direccion, 200), correo: str(r.correo, 120),
    tipo: ['contribuyente', 'consumidor', 'gobierno', 'extranjero'].includes(r.tipo) ? r.tipo : (str(r.ruc, 40) ? 'contribuyente' : 'consumidor'),
  };
  if (!receptor.nombre) throw new HttpError(400, 'Escribe el nombre o razón social del cliente');
  if (receptor.tipo === 'contribuyente' && !receptor.ruc) throw new HttpError(400, 'Escribe el RUC del cliente');
  const items = sales.flatMap((s: any) => s.items.map((it: any) => ({
    orden: s.numero, nombre: it.nombre, tam: it.tam, color: it.color, extra: it.extra, unidad: it.unidad, cant: it.cant, precio_cents: it.precio_cents, sub_cents: it.sub_cents,
  })));
  const subtotal = sales.reduce((a: number, s: any) => a + s.subtotal_cents, 0);
  const itbms = sales.reduce((a: number, s: any) => a + s.itbms_cents, 0);
  const total = sales.reduce((a: number, s: any) => a + s.total_cents, 0);
  const st = await getSettings(c.env, c.accountId);
  const id = uuid(), ts = Date.now(), { fecha, hora } = localParts(ts, st.tz);
  const clientIds = new Set(sales.map((s: any) => s.client_id).filter(Boolean));
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO invoices (id, account_id, numero, fecha, hora, ts, client_id, receptor, items, sale_ids, subtotal_cents, itbms_cents, total_cents, nota)
      VALUES (?, ?, (SELECT COALESCE(MAX(numero), 0) + 1 FROM invoices WHERE account_id = ?), ?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id, c.accountId, c.accountId, fecha, hora, ts, clientIds.size === 1 ? [...clientIds][0] : null, JSON.stringify(receptor), JSON.stringify(items),
        JSON.stringify(ids), subtotal, itbms, total, str(b.nota, 400) || null),
    c.env.DB.prepare(`UPDATE sales SET factura_id = ? WHERE account_id = ? AND id IN (${ph})`).bind(id, c.accountId, ...ids),
    // los datos fiscales quedan guardados en el cliente para la próxima vez
    ...(clientIds.size === 1 ? [c.env.DB.prepare('UPDATE clients SET ruc = COALESCE(NULLIF(?, \'\'), ruc), dv = COALESCE(NULLIF(?, \'\'), dv), direccion = COALESCE(NULLIF(?, \'\'), direccion) WHERE id = ? AND account_id = ?')
      .bind(receptor.ruc, receptor.dv, receptor.direccion, [...clientIds][0], c.accountId)] : []),
    await bumpRev(c.env, c.accountId),
  ]);
  const inv = await c.env.DB.prepare('SELECT * FROM invoices WHERE id = ?').bind(id).first();
  return json({ ok: true, invoice: shape(inv) }, 201);
}

export async function voidInvoice(c: Ctx) {
  const inv = await c.env.DB.prepare("SELECT sale_ids FROM invoices WHERE id = ? AND account_id = ? AND estado = 'emitida'").bind(c.params.id, c.accountId).first<{ sale_ids: string }>();
  if (!inv) throw new HttpError(404, 'Factura no encontrada o ya anulada');
  const ids: string[] = JSON.parse(inv.sale_ids);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE invoices SET estado = 'anulada', anulada_ts = ? WHERE id = ? AND account_id = ?").bind(Date.now(), c.params.id, c.accountId),
    ...(ids.length ? [c.env.DB.prepare(`UPDATE sales SET factura_id = NULL WHERE account_id = ? AND factura_id = ?`).bind(c.accountId, c.params.id)] : []),
    await bumpRev(c.env, c.accountId),
  ]);
  return json({ ok: true });
}
