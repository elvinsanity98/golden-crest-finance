// Express app factory — exported as a module so both `server.js` (local dev)
// and `api/index.js` (Vercel serverless) can use it.

const path = require('path');
const express = require('express');
const cookieSession = require('cookie-session');
const expressLayouts = require('express-ejs-layouts');
const methodOverride = require('method-override');

const db = require('./db/database');
const seed = require('./db/seed');

const { requireAuth, injectUser } = require('./middleware/auth');
const format = require('./helpers/format');

const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const borrowersRoutes = require('./routes/borrowers');
const loansRoutes = require('./routes/loans');
const paymentsRoutes = require('./routes/payments');
const calculatorRoutes = require('./routes/calculator');
const reportsRoutes = require('./routes/reports');
const printRoutes = require('./routes/print');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');

app.set('trust proxy', 1);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));

// Cookie-based session — stateless, survives serverless cold starts.
// Cookies are signed (HMAC) so they can't be tampered with client-side.
app.use(cookieSession({
  name: 'gcfin',
  keys: [process.env.SESSION_SECRET || 'gc-finance-dev-secret-change-me'],
  maxAge: 1000 * 60 * 60 * 24 * 7,
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax'
}));

// Lazy init: schema + seed run once per cold start, then cached.
// Vercel functions reuse warm containers, so repeat requests skip this.
let initPromise = null;
function ensureInit() {
  if (!initPromise) {
    initPromise = (async () => {
      await db.init();
      await seed();
    })().catch(err => {
      initPromise = null; // allow retry on next request if it failed
      throw err;
    });
  }
  return initPromise;
}

app.use(async (req, res, next) => {
  try { await ensureInit(); next(); }
  catch (err) { next(err); }
});

app.use((req, res, next) => {
  res.locals.fmt = format;
  res.locals.brand = {
    name: 'Golden Crest Finance',
    tagline: 'Lending made simple.',
    owner: 'Marvin Trinidad',
    devCredit: "Marvin's Friend",
    devUrl: 'https://www.facebook.com/elvinsanity98/',
    year: new Date().getFullYear()
  };
  res.locals.title = '';
  res.locals.path = req.path;
  next();
});

app.use(injectUser);

app.get('/healthz', (req, res) => res.json({ ok: true }));

app.use('/', authRoutes);
app.use('/calculator', calculatorRoutes);

app.use('/', requireAuth, dashboardRoutes);
app.use('/borrowers', requireAuth, borrowersRoutes);
app.use('/loans', requireAuth, loansRoutes);
app.use('/payments', requireAuth, paymentsRoutes);
app.use('/reports', requireAuth, reportsRoutes);
app.use('/print', requireAuth, printRoutes);

app.use((req, res) => {
  res.status(404).render('404', { title: 'Not Found' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { title: 'Server Error', message: err.message });
});

module.exports = app;
