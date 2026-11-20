/** Crea y actualiza las tablas al arrancar (una vez por instancia del Worker). */
import type { Env } from './types';

const SALES_V2 = `CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  numero INTEGER, numero_anulado INTEGER,
  fecha TEXT NOT NULL, hora TEXT NOT NULL, ts INTEGER NOT NULL,
  client_id TEXT, client_name TEXT,
  contacto_tel TEXT, contacto_dm TEXT, contacto_email TEXT,
  operador TEXT, nota TEXT,
  estado TEXT NOT NULL DEFAULT 'pagada',
  metodo TEXT,
  pagada_ts INTEGER, pagada_fecha TEXT, pagada_hora TEXT,
  subtotal_cents INTEGER, itbms_cents INTEGER NOT NULL DEFAULT 0, total_cents INTEGER NOT NULL,
  paginas REAL NOT NULL DEFAULT 0,
  anulada INTEGER NOT NULL DEFAULT 0, anulada_ts INTEGER
)`;

const ITEMS_V2 = `CREATE TABLE IF NOT EXISTS sale_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id TEXT NOT NULL,
  cat TEXT, tipo TEXT NOT NULL, tam TEXT NOT NULL, nombre TEXT NOT NULL,
  color INTEGER NOT NULL DEFAULT 0, unidad TEXT, extra TEXT,
  cant REAL NOT NULL, precio_cents INTEGER NOT NULL, sub_cents INTEGER NOT NULL
)`;

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS accounts ( id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, business TEXT NOT NULL, pass_hash TEXT NOT NULL, pass_salt TEXT NOT NULL, pass_iter INTEGER NOT NULL, rev INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL )',
  'CREATE TABLE IF NOT EXISTS sessions ( token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, user_agent TEXT )',
  'CREATE INDEX IF NOT EXISTS idx_sessions_account ON sessions(account_id)',
  'CREATE TABLE IF NOT EXISTS login_attempts ( key TEXT PRIMARY KEY, count INTEGER NOT NULL, window_start INTEGER NOT NULL )',
  'CREATE TABLE IF NOT EXISTS settings ( account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE, data TEXT NOT NULL, updated_at INTEGER NOT NULL )',
  'CREATE TABLE IF NOT EXISTS clients ( id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, name TEXT NOT NULL, phone TEXT, ruc TEXT, archived INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL )',
  'CREATE INDEX IF NOT EXISTS idx_clients_account ON clients(account_id, archived)',
  SALES_V2,
  ITEMS_V2,
  'CREATE TABLE IF NOT EXISTS closings ( account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, fecha TEXT NOT NULL, inicio INTEGER, fin INTEGER, fiery INTEGER, efectivo_cents INTEGER, nota TEXT, updated_at INTEGER NOT NULL, PRIMARY KEY (account_id, fecha) )',
  'CREATE TABLE IF NOT EXISTS machine_jobs ( account_id TEXT NOT NULL, maquina TEXT NOT NULL, hash TEXT NOT NULL, fecha TEXT NOT NULL, color INTEGER NOT NULL DEFAULT 0, bn INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, PRIMARY KEY (account_id, maquina, hash) )',
  'CREATE INDEX IF NOT EXISTS idx_mjobs_fecha ON machine_jobs(account_id, fecha)',
];

const INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_sales_account_fecha ON sales(account_id, fecha)',
  'CREATE INDEX IF NOT EXISTS idx_sales_account_pago ON sales(account_id, pagada_fecha)',
  'CREATE INDEX IF NOT EXISTS idx_sales_account_estado ON sales(account_id, estado)',
  'CREATE INDEX IF NOT EXISTS idx_sales_account_numero ON sales(account_id, numero)',
  'CREATE INDEX IF NOT EXISTS idx_items_sale ON sale_items(sale_id)',
];

async function columns(env: Env, table: string) {
  const r = await env.DB.prepare(`SELECT name FROM pragma_table_info('${table}')`).all<{ name: string }>();
  return new Set(r.results.map(x => x.name));
}

/** Pasa las tablas de ventas de la versión 1 (con restricciones fijas) a la versión 2. */
async function upgradeSales(env: Env) {
  const row = await env.DB.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'sales'").first<{ sql: string }>();
  if (!row || row.sql.includes('estado')) return;
  const sc = await columns(env, 'sales');
  const has = (c: string) => sc.has(c);
  const numero = has('numero') ? 'numero' : 'NULL';
  const sub = has('subtotal_cents') ? 'COALESCE(subtotal_cents, total_cents)' : 'total_cents';
  const itb = has('itbms_cents') ? 'COALESCE(itbms_cents, 0)' : '0';
  await env.DB.batch([
    env.DB.prepare(SALES_V2.replace('sales (', 'sales_v2 (')),
    env.DB.prepare(`INSERT INTO sales_v2 (id, account_id, numero, numero_anulado, fecha, hora, ts, client_id, client_name, estado, metodo,
                      pagada_ts, pagada_fecha, pagada_hora, subtotal_cents, itbms_cents, total_cents, paginas, anulada, anulada_ts)
                    SELECT id, account_id,
                      CASE WHEN anulada = 1 THEN NULL ELSE ${numero} END,
                      CASE WHEN anulada = 1 THEN ${numero} ELSE NULL END,
                      fecha, hora, ts, client_id, client_name,
                      CASE WHEN anulada = 1 THEN 'anulada' ELSE 'pagada' END, metodo,
                      ts, fecha, hora, ${sub}, ${itb}, total_cents, paginas, anulada, anulada_ts
                    FROM sales`),
    env.DB.prepare(ITEMS_V2.replace('sale_items (', 'sale_items_v2 (')),
    env.DB.prepare(`INSERT INTO sale_items_v2 (id, sale_id, cat, tipo, tam, nombre, color, unidad, extra, cant, precio_cents, sub_cents)
                    SELECT id, sale_id, 'color',
                      CASE tipo WHEN 'imp' THEN 'col_imp' WHEN 'cop' THEN 'col_cop' ELSE tipo END,
                      CASE tam WHEN 'carta' THEN 'Carta 8.5 x 11' WHEN 'legal' THEN 'Legal 8.5 x 14' ELSE nombre END,
                      CASE tipo WHEN 'imp' THEN 'Impresión a color' ELSE 'Copia a color' END,
                      1, 'pág', NULL, cant, precio_cents, sub_cents
                    FROM sale_items`),
    env.DB.prepare('DROP TABLE sale_items'),
    env.DB.prepare('DROP TABLE sales'),
    env.DB.prepare('ALTER TABLE sales_v2 RENAME TO sales'),
    env.DB.prepare('ALTER TABLE sale_items_v2 RENAME TO sale_items'),
  ]);
}

async function migrate(env: Env) {
  await env.DB.batch(SCHEMA.map(s => env.DB.prepare(s)));
  await upgradeSales(env);
  const cc = await columns(env, 'clients');
  const add = [];
  if (!cc.has('email')) add.push(env.DB.prepare('ALTER TABLE clients ADD COLUMN email TEXT'));
  if (!cc.has('dm')) add.push(env.DB.prepare('ALTER TABLE clients ADD COLUMN dm TEXT'));
  if (add.length) await env.DB.batch(add);
  await env.DB.batch(INDEXES.map(s => env.DB.prepare(s)));
}

let ready: Promise<void> | null = null;
export function ensureSchema(env: Env): Promise<void> {
  if (!ready) ready = migrate(env).catch(e => { ready = null; throw e; });
  return ready;
}
