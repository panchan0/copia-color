/** Crea las tablas si no existen (se ejecuta una vez por instancia del Worker). */
import type { Env } from './types';

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS accounts ( id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, business TEXT NOT NULL, pass_hash TEXT NOT NULL, pass_salt TEXT NOT NULL, pass_iter INTEGER NOT NULL, rev INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL )',
  'CREATE TABLE IF NOT EXISTS sessions ( token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, user_agent TEXT )',
  'CREATE INDEX IF NOT EXISTS idx_sessions_account ON sessions(account_id)',
  'CREATE TABLE IF NOT EXISTS login_attempts ( key TEXT PRIMARY KEY, count INTEGER NOT NULL, window_start INTEGER NOT NULL )',
  'CREATE TABLE IF NOT EXISTS settings ( account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE, data TEXT NOT NULL, updated_at INTEGER NOT NULL )',
  'CREATE TABLE IF NOT EXISTS clients ( id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, name TEXT NOT NULL, phone TEXT, ruc TEXT, archived INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL )',
  'CREATE INDEX IF NOT EXISTS idx_clients_account ON clients(account_id, archived)',
  "CREATE TABLE IF NOT EXISTS sales ( id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, fecha TEXT NOT NULL, hora TEXT NOT NULL, ts INTEGER NOT NULL, client_id TEXT, client_name TEXT, metodo TEXT NOT NULL CHECK (metodo IN ('efectivo','tarjeta','yappy')), total_cents INTEGER NOT NULL, paginas INTEGER NOT NULL, anulada INTEGER NOT NULL DEFAULT 0, anulada_ts INTEGER )",
  'CREATE INDEX IF NOT EXISTS idx_sales_account_fecha ON sales(account_id, fecha)',
  "CREATE TABLE IF NOT EXISTS sale_items ( id INTEGER PRIMARY KEY AUTOINCREMENT, sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE, tipo TEXT NOT NULL CHECK (tipo IN ('imp','cop')), tam TEXT NOT NULL, nombre TEXT NOT NULL, cant INTEGER NOT NULL, precio_cents INTEGER NOT NULL, sub_cents INTEGER NOT NULL )",
  'CREATE INDEX IF NOT EXISTS idx_items_sale ON sale_items(sale_id)',
  'CREATE TABLE IF NOT EXISTS closings ( account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, fecha TEXT NOT NULL, inicio INTEGER, fin INTEGER, fiery INTEGER, efectivo_cents INTEGER, nota TEXT, updated_at INTEGER NOT NULL, PRIMARY KEY (account_id, fecha) )',
];

let ready: Promise<void> | null = null;

export function ensureSchema(env: Env): Promise<void> {
  if (!ready) {
    ready = env.DB.batch(SCHEMA.map(s => env.DB.prepare(s))).then(() => undefined).catch(e => { ready = null; throw e; });
  }
  return ready;
}
