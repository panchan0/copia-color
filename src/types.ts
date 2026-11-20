export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ALLOW_SIGNUP?: string;
  PBKDF2_ITERATIONS?: string;
}

export interface Ctx {
  env: Env;
  req: Request;
  url: URL;
  accountId: string;
  params: Record<string, string>;
}

export interface Settings {
  precios: { imp: { carta: number; legal: number }; cop: { carta: number; legal: number } }; // centavos
  meta: number;        // centavos por mes
  dias: number;        // días laborables por mes
  diasSemana: number;  // días laborables por semana
  tz: string;          // zona horaria IANA
  itbms: { modo: 'incluido' | 'aparte' | 'no'; tasa: number }; // tasa en %
}

export const DEFAULT_SETTINGS: Settings = {
  precios: { imp: { carta: 90, legal: 110 }, cop: { carta: 60, legal: 90 } },
  meta: 2000000,
  dias: 26,
  diasSemana: 6,
  tz: 'America/Panama',
  itbms: { modo: 'incluido', tasa: 7 },
};
