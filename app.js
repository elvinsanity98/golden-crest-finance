// Express app factory — exported as a module so both `server.js` (local dev)
// and `api/index.js` (Vercel serverless) can use it.

const path = require('path');
const express = require('express');
const cookieSession = require('cookie-session');
const expressLayouts = require('express-ejs-layouts');
const methodOverride = require('method-override');

const db = require('./db/database');
const seed = require('./db/seed');
const demo = require('./db/demo');

const { requireAuth, injectUser } = require('./middleware/auth');
const format = require('./helpers/format');

const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const borrowersRoutes = require('./routes/borrowers');
const loansRoutes = require('./routes/loans');
const paymentsRoutes = require('./routes/payments');
const calculatorRoutes = require('./routes/calculator');
const reportsRoutes = require('./routes/reports');
const incomeRoutes = require('./routes/income');
const printRoutes = require('./routes/print');
const aboutRoutes = require('./routes/about');
const demoRoutes = require('./routes/demo');

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
  res.locals.demoEnabled = demo.enabled();
  res.locals.title = '';
  res.locals.path = req.path;
  next();
});

app.use(injectUser);

// Demo sandbox: bind each request to its data scope before any route runs.
// Demo sessions get { demo: true }, which makes the DB layer read and write
// the demo_* tables only (see db/database.js); everyone else gets the real
// tables. Every request is given an explicit scope so none is inherited.
app.use(async (req, res, next) => {
  const isDemo = demo.isDemoSession(req.session);
  res.locals.isDemo = isDemo;
  if (!isDemo) return db.scope.run({ demo: false }, () => next());
  if (!demo.enabled()) { req.session = null; return res.redirect('/login'); }
  try { await demo.ensureFresh(); } catch (err) { return next(err); }
  db.scope.run({ demo: true }, () => next());
});

app.get('/healthz', (req, res) => res.json({ ok: true }));

app.use('/', authRoutes);
app.use('/calculator', calculatorRoutes); // public
app.use('/about', aboutRoutes); // public
app.use('/demo', demoRoutes); // public entry to the demo sandbox

app.use('/', requireAuth, dashboardRoutes);
app.use('/borrowers', requireAuth, borrowersRoutes);
app.use('/loans', requireAuth, loansRoutes);
app.use('/payments', requireAuth, paymentsRoutes);
app.use('/reports', requireAuth, reportsRoutes);
app.use('/income', requireAuth, incomeRoutes);
app.use('/print', requireAuth, printRoutes);

app.use((req, res) => {
  res.status(404).render('404', { title: 'Not Found' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { title: 'Server Error', message: err.message });
});

module.exports = app;
