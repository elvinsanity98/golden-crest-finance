const path = require('path');
const fs = require('fs');
const { createClient } = require('@libsql/client');
const { AsyncLocalStorage } = require('async_hooks');

// In production set DATABASE_URL=libsql://<your-db>.turso.io and DATABASE_AUTH_TOKEN=<token>
// Locally we fall back to a SQLite file under ./data/.
const url = process.env.DATABASE_URL || `file:${path.join(__dirname, '..', 'data', 'gcfinance.sqlite').replace(/\\/g, '/')}`;
const authToken = process.env.DATABASE_AUTH_TOKEN || undefined;

if (url.startsWith('file:')) {
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

const client = createClient({ url, authToken });

async function init() {
  // libSQL/SQLite-compatible schema. Identical to what we had before.
  const stmts = [
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS borrowers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      address TEXT,
      id_number TEXT,
      occupation TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS loans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      borrower_id INTEGER NOT NULL,
      principal REAL NOT NULL,
      monthly_interest_rate REAL NOT NULL DEFAULT 10.0,
      term_days INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      total_interest REAL NOT NULL,
      total_payable REAL NOT NULL,
      daily_payment REAL NOT NULL,
      payment_frequency TEXT NOT NULL DEFAULT 'daily',
      status TEXT NOT NULL DEFAULT 'active',
      purpose TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      closed_at TEXT,
      FOREIGN KEY (borrower_id) REFERENCES borrowers(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      loan_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      payment_date TEXT NOT NULL,
      method TEXT NOT NULL DEFAULT 'cash',
      collected_by TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_loans_borrower ON loans(borrower_id)`,
    `CREATE INDEX IF NOT EXISTS idx_loans_status ON loans(status)`,
    `CREATE INDEX IF NOT EXISTS idx_payments_loan ON payments(loan_id)`,
    `CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date)`
  ];
  for (const sql of stmts) {
    await client.execute(sql);
  }

  // Migrations for existing databases (additive only — no data changes).
  // payment_frequency: 'daily' | 'weekly' | 'monthly'; existing loans stay daily.
  try {
    await client.execute(`ALTER TABLE loans ADD COLUMN payment_frequency TEXT NOT NULL DEFAULT 'daily'`);
  } catch (err) {
    if (!/duplicate column/i.test(String(err.message || err))) throw err;
  }
}

// --- Demo sandbox -----------------------------------------------------------
// A request running inside scope.run({ demo: true }, ...) has every query sent
// through get/all/run transparently redirected to the demo_* copies of the
// business tables. This is the single choke point that keeps demo sessions
// away from real borrower data — route code never has to think about it.
const scope = new AsyncLocalStorage();
const DEMO_PREFIX = 'demo_';
const BUSINESS_TABLES = /\b(borrowers|loans|payments)\b/g;

function inDemo() {
  const store = scope.getStore();
  return !!(store && store.demo);
}

// \b never matches inside identifiers like loan_id, payment_date or
// demo_loans (underscore is a word character), so only bare table names move.
function scoped(sql) {
  return inDemo() ? sql.replace(BUSINESS_TABLES, DEMO_PREFIX + '$1') : sql;
}

// Thin compatibility helpers so route code stays compact.
async function get(sql, args = []) {
  const r = await client.execute({ sql: scoped(sql), args });
  return r.rows[0] || null;
}

async function all(sql, args = []) {
  const r = await client.execute({ sql: scoped(sql), args });
  return r.rows;
}

async function run(sql, args = []) {
  const r = await client.execute({ sql: scoped(sql), args });
  return {
    lastInsertRowid: r.lastInsertRowid != null ? Number(r.lastInsertRowid) : null,
    changes: Number(r.rowsAffected || 0)
  };
}

module.exports = { client, init, get, all, run, scope, scoped, inDemo, DEMO_PREFIX };
