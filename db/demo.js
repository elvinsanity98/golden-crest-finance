// Demo sandbox: its own demo_* tables, fictional sample data, daily reset.
// Demo sessions are routed to these tables by the scope in ./database.js,
// so nothing here (or anything a demo visitor does) can touch real records.
const db = require('./database');
const { computeLoan, addDays, manilaToday } = require('../helpers/calc');

const P = db.DEMO_PREFIX;

// Public demo is on unless DEMO_MODE=off.
function enabled() {
  return String(process.env.DEMO_MODE || 'on').toLowerCase() !== 'off';
}

const SESSION_USER = { id: 0, username: 'demo', fullName: 'Demo User', role: 'demo' };

function isDemoSession(session) {
  return !!(session && (session.demo || session.userId === 'demo' || (session.user && session.user.role === 'demo')));
}

// ---------------------------------------------------------------------------
// Schema — mirrors the real business tables.
// ---------------------------------------------------------------------------
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS ${P}borrowers (
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
  `CREATE TABLE IF NOT EXISTS ${P}loans (
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
    FOREIGN KEY (borrower_id) REFERENCES ${P}borrowers(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS ${P}payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    loan_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    payment_date TEXT NOT NULL,
    method TEXT NOT NULL DEFAULT 'cash',
    collected_by TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (loan_id) REFERENCES ${P}loans(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS ${P}meta (key TEXT PRIMARY KEY, value TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_${P}loans_borrower ON ${P}loans(borrower_id)`,
  `CREATE INDEX IF NOT EXISTS idx_${P}loans_status ON ${P}loans(status)`,
  `CREATE INDEX IF NOT EXISTS idx_${P}payments_loan ON ${P}payments(loan_id)`,
  `CREATE INDEX IF NOT EXISTS idx_${P}payments_date ON ${P}payments(payment_date)`
];

let schemaPromise = null;
function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = db.client.batch(SCHEMA, 'write').catch(err => {
      schemaPromise = null;
      throw err;
    });
  }
  return schemaPromise;
}

// ---------------------------------------------------------------------------
// Sample data. Every date is relative to "today" so the demo always looks
// live: someone on track, someone behind, an overdue loan, weekly and monthly
// payers, a scheduled loan, a finished loan and a written-off one.
// ---------------------------------------------------------------------------
const BORROWERS = [
  [1, 'Juan Dela Cruz', '0917-000-0101', 'juan@example.com', '12 Mabini St., Sample City', 'DEMO-0001', 'Sari-sari store owner', 'Reliable payer. Second loan with us.'],
  [2, 'Maria Clara Santos', '0917-000-0102', null, '45 Rizal Ave., Sample City', 'DEMO-0002', 'Market vendor', null],
  [3, 'Jose Reyes', '0917-000-0103', null, '8 Bonifacio Rd., Sample City', 'DEMO-0003', 'Tricycle driver', 'Term ended with a balance. Follow up weekly.'],
  [4, 'Ana Lim', '0917-000-0104', 'ana@example.com', '77 Luna St., Sample City', 'DEMO-0004', 'Online seller', 'Prefers weekly payments.'],
  [5, 'Carlo Mendoza', '0917-000-0105', null, '3 Quezon Blvd., Sample City', 'DEMO-0005', 'Government employee', 'Pays monthly on payday.'],
  [6, 'Liza Bautista', '0917-000-0106', null, '19 Aguinaldo St., Sample City', 'DEMO-0006', 'Teacher', null],
  [7, 'Ramon Garcia', '0917-000-0107', null, '60 Del Pilar St., Sample City', 'DEMO-0007', 'Carpenter', 'Finished loan on time.'],
  [8, 'Nena Villanueva', '0917-000-0108', null, '5 Jacinto St., Sample City', 'DEMO-0008', 'Eatery owner', 'Loan releases next week.'],
  [9, 'Tony Aquino', '0917-000-0109', null, '31 Burgos St., Sample City', 'DEMO-0009', 'Vendor', 'Stopped paying. Written off.'],
  [10, 'Grace Navarro', '0917-000-0110', 'grace@example.com', '22 Osmena St., Sample City', 'DEMO-0010', 'Nurse', 'New applicant, no loan yet.']
];

// start: days from today. pay(calc) returns [[dayOffsetFromStart, amount, note?], ...]
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const LOANS = [
  // Paid every day through today: on track.
  { id: 1, b: 1, principal: 10000, days: 60, freq: 'daily', start: -20, purpose: 'Store restocking',
    pay: l => range(0, 20).map(d => [d, l.installment]) },
  // Missed the last five days: arrears.
  { id: 2, b: 2, principal: 5000, days: 30, freq: 'daily', start: -12, purpose: 'Market stall goods',
    pay: l => range(0, 7).map(d => [d, l.installment]) },
  // Term is over with a balance left: overdue.
  { id: 3, b: 3, principal: 8000, days: 60, freq: 'daily', start: -70, purpose: 'Tricycle repair',
    pay: l => range(0, 44).map(d => [d, l.installment]).concat([[70, 300, 'Catch-up payment']]) },
  // Three of three weekly installments paid: on track.
  { id: 4, b: 4, principal: 12000, days: 56, freq: 'weekly', start: -21, purpose: 'Online shop inventory',
    pay: l => [6, 13, 20].map(d => [d, l.installment]) },
  // First monthly installment paid.
  { id: 5, b: 5, principal: 20000, days: 90, freq: 'monthly', start: -35, purpose: 'Home renovation',
    pay: l => [[29, l.installment]] },
  // Short on the first month: arrears.
  { id: 6, b: 6, principal: 15000, days: 60, freq: 'monthly', start: -40, purpose: 'Tuition fees',
    pay: () => [[30, 4000, 'Partial, balance to follow']] },
  // Fully paid on time.
  { id: 7, b: 7, principal: 6000, days: 30, freq: 'daily', start: -45, purpose: 'Carpentry tools', status: 'completed', settle: true,
    pay: l => range(0, 29).map(d => [d, l.installment]) },
  // First payment date is in the future: scheduled.
  { id: 8, b: 8, principal: 10000, days: 60, freq: 'daily', start: 5, purpose: 'Eatery expansion',
    pay: () => [] },
  // Written off: shows up as capital lost on the Income page.
  { id: 9, b: 9, principal: 7000, days: 30, freq: 'daily', start: -75, purpose: 'Vending cart', status: 'defaulted', closedOffset: -40,
    pay: l => range(0, 11).map(d => [d, l.installment]) },
  // An older, finished loan for the repeat borrower.
  { id: 10, b: 1, principal: 5000, days: 30, freq: 'daily', start: -100, purpose: 'Store capital (first loan)', status: 'completed', settle: true,
    pay: l => range(0, 29).map(d => [d, l.installment]) }
];

const METHODS = ['cash', 'cash', 'cash', 'gcash', 'cash', 'cash', 'maya'];

// Pure builder (no I/O) so it can be unit-tested.
function buildSeed(today) {
  const borrowers = BORROWERS.map((b, i) => {
    const created = addDays(today, -110 + i * 9) + ' 01:00:00';
    return [...b, created, created];
  });

  const loans = [];
  const payments = [];
  LOANS.forEach(spec => {
    const calc = computeLoan({ principal: spec.principal, termDays: spec.days, monthlyRate: 10, frequency: spec.freq });
    const start = addDays(today, spec.start);
    const end = addDays(start, calc.termDays - 1);

    let rows = spec.pay(calc).map(([offset, amount, note]) => ({
      date: addDays(start, offset),
      amount: +Number(amount).toFixed(2),
      note: note || null
    }));
    rows = rows.filter(r => r.date <= today);
    if (spec.settle && rows.length) {
      // Final payment absorbs centavo rounding so the loan is exactly paid off.
      const before = rows.slice(0, -1).reduce((s, r) => s + r.amount, 0);
      rows[rows.length - 1].amount = +(calc.totalPayable - before).toFixed(2);
    }
    rows.forEach((r, i) => {
      payments.push([spec.id, r.amount, r.date, METHODS[(spec.id + i) % METHODS.length], SESSION_USER.fullName, r.note, r.date + ' 02:00:00']);
    });

    const status = spec.status || 'active';
    let closedAt = null;
    if (status === 'completed' && rows.length) closedAt = rows[rows.length - 1].date + ' 03:00:00';
    if (status === 'defaulted') closedAt = addDays(today, spec.closedOffset || 0) + ' 03:00:00';
    const createdDate = start <= today ? start : addDays(today, -1);

    loans.push([
      spec.id, spec.b, calc.principal, 10, calc.termDays, start, end,
      calc.totalInterest, calc.totalPayable, calc.installment, spec.freq,
      status, spec.purpose, null, createdDate + ' 01:00:00', closedAt
    ]);
  });

  return { borrowers, loans, payments };
}

function multiInsert(table, cols, rows) {
  const one = '(' + cols.map(() => '?').join(',') + ')';
  return { sql: `INSERT INTO ${table} (${cols.join(',')}) VALUES ${rows.map(() => one).join(',')}`, args: rows.flat() };
}

// Reseed when the sandbox was last loaded on an earlier day, so dates stay
// relative to today and edits from earlier visitors are cleared. Cached per
// process: at most one cheap lookup per day per server instance.
let checkedDay = null;

// Wipe and reload the sandbox in one transaction.
async function reseed() {
  await ensureSchema();
  const today = manilaToday();
  const seed = buildSeed(today);
  await db.client.batch([
    `DELETE FROM ${P}payments`,
    `DELETE FROM ${P}loans`,
    `DELETE FROM ${P}borrowers`,
    { sql: 'DELETE FROM sqlite_sequence WHERE name IN (?, ?, ?)', args: [`${P}borrowers`, `${P}loans`, `${P}payments`] },
    multiInsert(`${P}borrowers`,
      ['id', 'full_name', 'phone', 'email', 'address', 'id_number', 'occupation', 'notes', 'created_at', 'updated_at'], seed.borrowers),
    multiInsert(`${P}loans`,
      ['id', 'borrower_id', 'principal', 'monthly_interest_rate', 'term_days', 'start_date', 'end_date', 'total_interest',
        'total_payable', 'daily_payment', 'payment_frequency', 'status', 'purpose', 'notes', 'created_at', 'closed_at'], seed.loans),
    multiInsert(`${P}payments`,
      ['loan_id', 'amount', 'payment_date', 'method', 'collected_by', 'notes', 'created_at'], seed.payments),
    { sql: `INSERT INTO ${P}meta (key, value) VALUES ('seeded_on', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, args: [today] }
  ], 'write');
  checkedDay = today;
  return { borrowers: seed.borrowers.length, loans: seed.loans.length, payments: seed.payments.length };
}

async function ensureFresh() {
  const today = manilaToday();
  if (checkedDay === today) return;
  await ensureSchema();
  const r = await db.client.execute(`SELECT value FROM ${P}meta WHERE key = 'seeded_on'`);
  if (!r.rows[0] || r.rows[0].value !== today) await reseed();
  checkedDay = today;
}

// Turn the current session into a demo session.
async function start(req) {
  await ensureFresh();
  req.session.userId = 'demo';
  req.session.user = SESSION_USER;
  req.session.demo = true;
  req.session.flash = { type: 'success', message: 'Welcome to the demo! Everything here is sample data. Add, edit and delete freely.' };
}

module.exports = { enabled, isDemoSession, ensureFresh, reseed, start, buildSeed, SESSION_USER };
