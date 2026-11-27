import type { Servicio } from './catalog';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ALLOW_SIGNUP?: string;
  PBKDF2_ITERATIONS?: string;
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
  PRUEBA_HASTA?: string;
  // Inteligencia artificial: Workers AI (binding) o Claude (clave de API)
  AI?: Ai;
  ANTHROPIC_API_KEY?: string;
  // WhatsApp Cloud API (Meta)
  WA_TOKEN?: string;
  WA_PHONE_ID?: string;
  WA_VERIFY_TOKEN?: string;
  WA_APP_SECRET?: string;
  WA_API_VERSION?: string;
  // Cuenta que recibe los mensajes de WhatsApp y correo (si hay más de una)
  CANAL_CUENTA?: string;
  CF_VERSION_METADATA?: { id: string; tag?: string; timestamp?: string };
}

export interface Ctx {
  env: Env;
  req: Request;
  url: URL;
  accountId: string;
  params: Record<string, string>;
  exec?: ExecutionContext;
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
  empresa: { telefono: string; correo: string; direccion: string; ruc: string; dv: string; logo?: string };
  operadores: { n: string; c: string }[];
  maquinas: Maquina[];
  canales: Canales;
}

export interface Canales {
  token: string;        // enlace público para enviar trabajos
  ia: boolean;          // la IA responde los mensajes
  autoOrden: boolean;   // crear la orden sola cuando el pedido está claro
  avisoListo: boolean;  // avisar al cliente cuando su trabajo está listo
}
