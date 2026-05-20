const path = require('path');
const express = require('express');
const session = require('express-session');
const MemoryStore = require('memorystore')(session);
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

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');

app.set('trust proxy', 1); // for Render/Fly behind a proxy

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));

app.use(session({
  store: new MemoryStore({ checkPeriod: 86400000 }), // prune expired entries every 24h
  secret: process.env.SESSION_SECRET || 'gc-finance-dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));

app.use((req, res, next) => {
  res.locals.fmt = format;
  res.locals.brand = {
    name: 'Golden Crest Finance',
    tagline: 'Lending made simple.',
    owner: 'Marvin Trinidad',
    devCredit: 'TG Devworks',
    year: new Date().getFullYear()
  };
  res.locals.title = '';
  res.locals.path = req.path;
  next();
});

app.use(injectUser);

// Health check for hosting platforms
app.get('/healthz', (req, res) => res.json({ ok: true }));

app.use('/', authRoutes);
app.use('/calculator', calculatorRoutes); // public

app.use('/', requireAuth, dashboardRoutes);
app.use('/borrowers', requireAuth, borrowersRoutes);
app.use('/loans', requireAuth, loansRoutes);
app.use('/payments', requireAuth, paymentsRoutes);
app.use('/reports', requireAuth, reportsRoutes);

app.use((req, res) => {
  res.status(404).render('404', { title: 'Not Found' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { title: 'Server Error', message: err.message });
});

const PORT = process.env.PORT || 3000;

async function start() {
  await db.init();
  await seed();
  app.listen(PORT, () => {
    console.log(`\n  Golden Crest Finance running at http://localhost:${PORT}`);
    if (!process.env.DATABASE_URL) console.log(`  Using local SQLite file at ./data/gcfinance.sqlite`);
    else console.log(`  Connected to libSQL @ ${process.env.DATABASE_URL.replace(/\?.*$/, '')}`);
    console.log(`  Default login: admin / ${process.env.ADMIN_PASSWORD || 'admin123'}\n`);
  });
}

start().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
