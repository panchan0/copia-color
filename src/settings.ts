import { DEFAULT_SETTINGS, type Env, type Settings } from './types';
import { HttpError } from './http';
import { validTz } from './time';

export async function getSettings(env: Env, accountId: string): Promise<Settings> {
  const row = await env.DB.prepare('SELECT data FROM settings WHERE account_id = ?').bind(accountId).first<{ data: string }>();
  if (!row) return structuredClone(DEFAULT_SETTINGS);
  try { return normalize(JSON.parse(row.data)); } catch { return structuredClone(DEFAULT_SETTINGS); }
}

const cents = (v: unknown, def: number, max = 100_000_000) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 && n <= max ? n : def;
};

export function normalize(d: any): Settings {
  const s = structuredClone(DEFAULT_SETTINGS);
  const p = d?.precios || {};
  for (const t of ['imp', 'cop'] as const) for (const k of ['carta', 'legal'] as const) s.precios[t][k] = cents(p?.[t]?.[k], s.precios[t][k], 100000);
  s.meta = cents(d?.meta, s.meta);
  const dias = Math.round(Number(d?.dias)); if (dias >= 1 && dias <= 31) s.dias = dias;
  const ds = Math.round(Number(d?.diasSemana)); if (ds >= 1 && ds <= 7) s.diasSemana = ds;
  if (typeof d?.tz === 'string' && validTz(d.tz)) s.tz = d.tz;
  if (['incluido', 'aparte', 'no'].includes(d?.itbms?.modo)) s.itbms.modo = d.itbms.modo;
  const tasa = Number(d?.itbms?.tasa); if (Number.isFinite(tasa) && tasa >= 0 && tasa <= 30) s.itbms.tasa = Math.round(tasa * 100) / 100;
  return s;
}

export function validateSettings(d: any): Settings {
  const p = d?.precios;
  for (const t of ['imp', 'cop']) for (const k of ['carta', 'legal']) {
    const v = Number(p?.[t]?.[k]);
    if (!Number.isInteger(v) || v <= 0 || v > 100000) throw new HttpError(400, 'Revisa los precios');
  }
  const meta = Number(d?.meta);
  if (!Number.isInteger(meta) || meta <= 0) throw new HttpError(400, 'Revisa la meta mensual');
  if (!(Number(d?.dias) >= 1 && Number(d?.dias) <= 31)) throw new HttpError(400, 'Días laborables por mes: 1 a 31');
  if (!(Number(d?.diasSemana) >= 1 && Number(d?.diasSemana) <= 7)) throw new HttpError(400, 'Días laborables por semana: 1 a 7');
  if (typeof d?.tz !== 'string' || !validTz(d.tz)) throw new HttpError(400, 'Zona horaria inválida');
  if (!['incluido', 'aparte', 'no'].includes(d?.itbms?.modo)) throw new HttpError(400, 'Revisa el ITBMS');
  if (!(Number(d?.itbms?.tasa) >= 0 && Number(d?.itbms?.tasa) <= 30)) throw new HttpError(400, 'Tasa de ITBMS: 0 a 30');
  return normalize(d);
}

export async function bumpRev(env: Env, accountId: string) {
  return env.DB.prepare('UPDATE accounts SET rev = rev + 1 WHERE id = ?').bind(accountId);
}
