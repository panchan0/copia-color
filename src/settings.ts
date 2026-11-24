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
  if (Array.isArray(d?.operadores)) s.operadores = normOps(d.operadores);
  if (Array.isArray(d?.maquinas)) {
    const lista: Maquina[] = [];
    for (const sv of d.maquinas.slice(0, 12)) {
      const id = str(sv?.id, 20);
      if (!/^[a-z0-9_]{2,20}$/.test(id) || lista.some(m => m.id === id)) continue;
      lista.push({ id, nombre: str(sv.nombre, 60) || 'Máquina', map: sv.map && typeof sv.map === 'object' && JSON.stringify(sv.map).length < 4000 ? sv.map : null });
    }
    if (lista.length) s.maquinas = lista;
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

/** Operadores con un número de dos dígitos que los identifica (se muestra la inicial + número). */
function normOps(lista: unknown[]): { n: string; c: string }[] {
  const out: { n: string; c: string }[] = [], usados = new Set<string>(), vistos = new Set<string>();
  const pend: string[] = [];
  for (const x of lista.slice(0, 60)) {
    const n = str(typeof x === 'string' ? x : (x as any)?.n, 60);
    if (!n || vistos.has(n.toLowerCase())) continue;
    vistos.add(n.toLowerCase());
    const c = typeof x === 'object' && x && /^\d{2}$/.test(String((x as any).c)) ? String((x as any).c) : '';
    if (c && !usados.has(c)) { usados.add(c); out.push({ n, c }); } else { out.push({ n, c: '' }); pend.push(n); }
  }
  for (const o of out) {
    if (o.c) continue;
    // número estable a partir del nombre, sin repetir
    let h = 0; for (const ch of o.n) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    let k = (h % 99) + 1;
    for (let i = 0; i < 99 && usados.has(String(k).padStart(2, '0')); i++) k = (k % 99) + 1;
    o.c = String(k).padStart(2, '0'); usados.add(o.c);
  }
  return out.slice(0, 50);
}
