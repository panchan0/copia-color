import type { Servicio } from './catalog';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ALLOW_SIGNUP?: string;
  PBKDF2_ITERATIONS?: string;
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
  CF_VERSION_METADATA?: { id: string; tag?: string; timestamp?: string };
}

export interface Ctx {
  env: Env;
  req: Request;
  url: URL;
  accountId: string;
  params: Record<string, string>;
}

export interface Maquina { id: string; nombre: string; map?: Record<string, unknown> | null }

export interface Settings {
  ver: number;
  catalogo: Servicio[];
  meta: number;        // centavos por mes
  dias: number;        // días laborables por mes
  diasSemana: number;  // días laborables por semana
  tz: string;
  itbms: { modo: 'incluido' | 'aparte' | 'no'; tasa: number };
  empresa: { telefono: string; correo: string; direccion: string; ruc: string; logo?: string };
  operadores: { n: string; c: string }[];
  maquinas: Maquina[];
}
