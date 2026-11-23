import type { Env, Settings, Maquina } from './types';
import { HttpError } from './http';
import { validTz } from './time';
import { mergeCatalogo } from './catalog';

export const SETTINGS_VER = 2;

const DEF_MAQUINAS: Maquina[] = [
  { id: 'versant', nombre: 'Versant 180 (Fiery)', map: null },
  { id: 'wc7845', nombre: 'WorkCentre 7845i', map: null },
];

export function defaults(): Settings {
  return {
    ver: SETTINGS_VER,
    catalogo: mergeCatalogo(null),
    meta: 2000000, dias: 26, diasSemana: 6, tz: 'America/Panama',
    itbms: { modo: 'aparte', tasa: 7 },
    empresa: { telefono: '6883-2728', correo: 'ventas@copiasrapidas.com', direccion: '', ruc: '' },
    operadores: [],
    maquinas: structuredClone(DEF_MAQUINAS),
  };
}

export async function getSettings(env: Env, accountId: string): Promise<Settings> {
  const row = await env.DB.prepare('SELECT data FROM settings WHERE account_id = ?').bind(accountId).first<{ data: string }>();
  if (!row) return defaults();
  try { return normalize(JSON.parse(row.data)); } catch { return defaults(); }
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function normalize(d: any): Settings {
  const s = defaults();
  const actual = d?.ver === SETTINGS_VER;
  // Versiones anteriores: se adoptan los precios nuevos y el ITBMS aparte
  if (actual) s.catalogo = mergeCatalogo(d?.catalogo);
  const meta = Math.round(Number(d?.meta)); if (meta > 0 && meta <= 1e10) s.meta = meta;
  const dias = Math.round(Number(d?.dias)); if (dias >= 1 && dias <= 31) s.dias = dias;
  const ds = Math.round(Number(d?.diasSemana)); if (ds >= 1 && ds <= 7) s.diasSemana = ds;
  if (typeof d?.tz === 'string' && validTz(d.tz)) s.tz = d.tz;
  const tasa = Number(d?.itbms?.tasa); if (Number.isFinite(tasa) && tasa > 0 && tasa <= 30) s.itbms.tasa = Math.round(tasa * 100) / 100;
  if (d?.empresa && typeof d.empresa === 'object') {
    for (const k of ['telefono', 'correo', 'direccion', 'ruc'] as const) if (typeof d.empresa[k] === 'string') s.empresa[k] = str(d.empresa[k], 120);
    const logo = d.empresa.logo;
    if (typeof logo === 'string' && logo.length <= 80_000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(logo)) s.empresa.logo = logo;
  }
  if (Array.isArray(d?.operadores)) s.operadores = [...new Set(d.operadores.map((x: unknown) => str(x, 60)).filter(Boolean))].slice(0, 50) as string[];
  if (Array.isArray(d?.maquinas)) {
    for (const m of s.maquinas) {
      const sv = d.maquinas.find((x: any) => x?.id === m.id);
      if (sv) { if (str(sv.nombre, 60)) m.nombre = str(sv.nombre, 60); if (sv.map && typeof sv.map === 'object' && JSON.stringify(sv.map).length < 4000) m.map = sv.map; }
    }
  }
  return s;
}

export function validateSettings(d: any): Settings {
  const meta = Number(d?.meta);
  if (!Number.isInteger(meta) || meta <= 0) throw new HttpError(400, 'Revisa la meta mensual');
  if (!(Number(d?.dias) >= 1 && Number(d?.dias) <= 31)) throw new HttpError(400, 'Días laborables por mes: 1 a 31');
  if (!(Number(d?.diasSemana) >= 1 && Number(d?.diasSemana) <= 7)) throw new HttpError(400, 'Días laborables por semana: 1 a 7');
  if (typeof d?.tz !== 'string' || !validTz(d.tz)) throw new HttpError(400, 'Zona horaria inválida');
  if (!(Number(d?.itbms?.tasa) > 0 && Number(d?.itbms?.tasa) <= 30)) throw new HttpError(400, 'Tasa de ITBMS: mayor que 0 y hasta 30');
  if (!Array.isArray(d?.catalogo)) throw new HttpError(400, 'Catálogo inválido');
  return normalize({ ...d, ver: SETTINGS_VER });
}

export async function bumpRev(env: Env, accountId: string) {
  return env.DB.prepare('UPDATE accounts SET rev = rev + 1 WHERE id = ?').bind(accountId);
}
