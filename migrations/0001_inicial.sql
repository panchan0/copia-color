-- Cuentas (una por negocio)
CREATE TABLE accounts (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  business    TEXT NOT NULL,
  pass_hash   TEXT NOT NULL,
  pass_salt   TEXT NOT NULL,
  pass_iter   INTEGER NOT NULL,
  rev         INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash  TEXT PRIMARY KEY,
  account_id  TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  user_agent  TEXT
);
CREATE INDEX idx_sessions_account ON sessions(account_id);

CREATE TABLE login_attempts (
  key          TEXT PRIMARY KEY,
  count        INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);

CREATE TABLE settings (
  account_id  TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  data        TEXT NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE clients (
  id          TEXT PRIMARY KEY,
  account_id  TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  phone       TEXT,
  ruc         TEXT,
  archived    INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_clients_account ON clients(account_id, archived);

-- Montos en centavos para evitar errores de redondeo
CREATE TABLE sales (
  id           TEXT PRIMARY KEY,
  account_id   TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  fecha        TEXT NOT NULL,          -- YYYY-MM-DD en la zona horaria del negocio
  hora         TEXT NOT NULL,          -- HH:MM
  ts           INTEGER NOT NULL,
  client_id    TEXT,
  client_name  TEXT,
  metodo       TEXT NOT NULL CHECK (metodo IN ('efectivo','tarjeta','yappy')),
  total_cents  INTEGER NOT NULL,
  paginas      INTEGER NOT NULL,
  anulada      INTEGER NOT NULL DEFAULT 0,
  anulada_ts   INTEGER
);
CREATE INDEX idx_sales_account_fecha ON sales(account_id, fecha);

CREATE TABLE sale_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id       TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  tipo          TEXT NOT NULL CHECK (tipo IN ('imp','cop')),
  tam           TEXT NOT NULL,
  nombre        TEXT NOT NULL,
  cant          INTEGER NOT NULL,
  precio_cents  INTEGER NOT NULL,
  sub_cents     INTEGER NOT NULL
);
CREATE INDEX idx_items_sale ON sale_items(sale_id);

-- Cierre del día: contador de la máquina, Fiery y efectivo contado
CREATE TABLE closings (
  account_id      TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  fecha           TEXT NOT NULL,
  inicio          INTEGER,
  fin             INTEGER,
  fiery           INTEGER,
  efectivo_cents  INTEGER,
  nota            TEXT,
  updated_at      INTEGER NOT NULL,
  PRIMARY KEY (account_id, fecha)
);
