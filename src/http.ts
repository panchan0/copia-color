export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

export async function readJson<T = any>(req: Request): Promise<T> {
  const ct = req.headers.get('content-type') || '';
  if (!ct.includes('application/json')) throw new HttpError(415, 'Se esperaba JSON');
  const text = await req.text();
  if (text.length > 200_000) throw new HttpError(413, 'Solicitud demasiado grande');
  try { return JSON.parse(text || '{}'); } catch { throw new HttpError(400, 'JSON inválido'); }
}

export const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z'));

export function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export function intOrNull(v: unknown, min = 0, max = 2_000_000_000): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new HttpError(400, 'Número inválido');
  const r = Math.round(n);
  if (r < min || r > max) throw new HttpError(400, 'Número fuera de rango');
  return r;
}

export function uuid(): string { return crypto.randomUUID(); }
