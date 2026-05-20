// Local-dev entry. On Vercel, `api/index.js` is used instead.
const app = require('./app');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  Golden Crest Finance running at http://localhost:${PORT}`);
  if (!process.env.DATABASE_URL) console.log(`  Using local SQLite file at ./data/gcfinance.sqlite`);
  else console.log(`  Connected to libSQL @ ${process.env.DATABASE_URL.replace(/\?.*$/, '')}`);
  console.log(`  Default login: admin / ${process.env.ADMIN_PASSWORD || 'admin123'}\n`);
});
