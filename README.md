# Golden Crest Finance

> A modern lending management web app for small Filipino lenders — **10% monthly interest, daily collection**, mobile-first, with printable payment cards.

[![Live · Vercel](https://img.shields.io/badge/Live-Vercel-black?logo=vercel)](https://golden-crest-finance.vercel.app)
[![Live · Render](https://img.shields.io/badge/Live-Render-blueviolet?logo=render)](https://golden-crest-finance.onrender.com)
[![Database · Turso](https://img.shields.io/badge/DB-Turso%20(libSQL)-4ff8d2)](https://turso.tech)

**Owned by:** Marvin Trinidad
**Developed by:** [Marvin's Friend](https://www.facebook.com/elvinsanity98/)

---

## Features

### Lending core
- **Dashboard** — today's collections, expected vs collected, outstanding portfolio, arrears, quick-pay widget for any active loan.
- **Borrowers** — searchable directory, full contact/ID info, per-borrower loan history.
- **Loans** — 10% monthly interest, daily collection, auto-computed term schedule, live preview when creating.
- **Daily Collections** — record payments by cash, GCash, Maya, or bank transfer; view all payments for any date.
- **Reports** — date-ranged collection summaries, active portfolio overview, arrears tracker.

### Schedule intelligence
- **Day 1 = First Payment Date** — the day the loan is disbursed *is* the day of the first payment (matches Filipino daily-collection convention).
- **Visual ledger grid** — every day of the loan term colored 🟢 Paid / 🟡 Partial / 🔴 Missed / 🟧 Today / ⬜ Future.
- **Advance payment support** — if a client pays 2× or 5× or even the whole loan on Day 1, the grid intelligently rolls forward the surplus (cumulative coverage logic). Any amount works — multiples, odd amounts, even just ₱1 surplus.
- **Scheduled loans** — if you create a loan with a future start date, the system marks it 🔵 Scheduled and *blocks payments* until the actual first-payment date.
- **Auto-close** — loans flip to "Paid" the moment total payments ≥ total payable, even from one big payment.

### Helpers
- **Loan calculator** — public, no login required. Borrowers can estimate daily payments themselves at [`/calculator`](https://golden-crest-finance.vercel.app/calculator).
- **Printable payment cards** — generate physical ledger cards (1–5 per Letter bond paper) for clients to keep their own payment record on. Auto-fills name, address, daily amount, due date, card #, today's date. Blank cards available too.

### Platform niceties
- **Mobile-first** — sticky top bar, slide-out sidebar drawer, bottom tab nav, all forms touch-sized.
- **Asia/Manila timezone** throughout (no UTC mix-ups around midnight).
- **Auth** — bcrypt-hashed passwords, signed cookie sessions (stateless, works on serverless cold starts).
- **Currency** — ₱ Peso formatted with `en-PH` locale.

---

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Runtime | **Node.js 20+** + **Express 4** | Familiar, mature, easy hire-anyone |
| Templating | **EJS** + **express-ejs-layouts** | Server-rendered, fast, no SPA churn |
| Styling | **Tailwind CSS** (Play CDN) | Zero-build, mobile-first utilities |
| Database | **Turso** (libSQL — SQLite-compatible cloud) | Free tier (9 GB storage), durable, swap to local file with one env var |
| Sessions | **cookie-session** (signed, stateless) | Survives serverless cold starts |
| Auth | **bcryptjs** | Pure JS, no native compile on Windows/Vercel |
| Hosting | **Vercel** + **Render** | Both free tiers, deployed via `vercel.json` and `render.yaml` |

---

## Local Quick Start

```bash
npm install
npm start
```

Runs at <http://localhost:3000>. Default login: `admin` / `admin123`.

Without `DATABASE_URL` set, the app falls back to a local SQLite file at `./data/gcfinance.sqlite` — perfect for development.

---

## Free Deployment

This app is deployed live on **both Vercel and Render**, both pointing at the same **Turso** database so the data stays in sync across them.

### Step 1 — Free Turso database

```bash
turso auth login
turso db create golden-crest
turso db show golden-crest --url        # → libsql://golden-crest-<you>.turso.io
turso db tokens create golden-crest     # → long auth token; copy it
```

Free tier gives you **9 GB storage** and **1B row reads/month** — way more than this app will ever use.

### Step 2 — Deploy to Vercel

1. Sign in at [vercel.com](https://vercel.com), Import the GitHub repo.
2. Vercel auto-detects `vercel.json` and bundles the Express app via `api/index.js`.
3. Add three Environment Variables (Settings → Environment Variables):
   - `DATABASE_URL` — `libsql://golden-crest-<you>.turso.io`
   - `DATABASE_AUTH_TOKEN` — Turso token
   - `SESSION_SECRET` — long random string (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`)
4. Redeploy. Lives at `https://<project>.vercel.app`.

### Step 3 — Deploy to Render (optional, second URL)

1. Sign in at [render.com](https://render.com), New → Blueprint → pick the repo.
2. Render reads `render.yaml`. Fill in the same `DATABASE_URL`, `DATABASE_AUTH_TOKEN`, and `ADMIN_PASSWORD` env vars when prompted.
3. Apply. Lives at `https://<service>.onrender.com`. (Free tier sleeps after 15 min idle; cold-wake adds ~30s.)

### Step 4 — Done

Both URLs read/write to the same Turso DB. Changes in one show up immediately on the other.

---

## Loan Math

For every loan:

```
interest      = principal × monthly_rate × (term_days / 30)
total_payable = principal + interest
daily_payment = total_payable / term_days
end_date      = start_date + term_days − 1     # inclusive, Day 1 = start_date
```

**Example** — ₱10,000 over 60 days at 10% / month:
- Interest = 10,000 × 0.10 × (60/30) = ₱2,000
- Total payable = ₱12,000
- Daily payment = ₱200/day
- Term: Day 1 (start_date) → Day 60 (start_date + 59 days)

---

## Environment Variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | prod only | `libsql://…` — leave empty for local dev fallback |
| `DATABASE_AUTH_TOKEN` | prod only | from `turso db tokens create` |
| `SESSION_SECRET` | yes (any env) | long random hex string; sign cookies |
| `ADMIN_PASSWORD` | first boot only | initial admin password when DB is seeded |
| `NODE_ENV` | prod | set to `production` to enable HTTPS-only cookies |
| `PORT` | optional | host sets this automatically; defaults to 3000 |

---

## Project Structure

```
server.js              Local-dev entrypoint (just calls app.listen)
app.js                 Express app — also imported by api/index.js for Vercel
api/index.js           Vercel serverless entry (re-exports app.js)
vercel.json            Vercel rewrites + function bundle config
render.yaml            Render Blueprint config

db/database.js         libSQL client + schema init + sync wrapper helpers
db/seed.js             Idempotent admin user seeding

helpers/calc.js        Loan math + day-progress logic
helpers/format.js      ₱, dates, Manila timezone

middleware/auth.js     Login guard, flash messages

routes/auth.js         Login / logout
routes/dashboard.js    Home dashboard
routes/borrowers.js    Borrower CRUD
routes/loans.js        Loan CRUD + show with daily schedule grid
routes/payments.js     Record / delete payments
routes/calculator.js   Public loan calculator
routes/reports.js      Date-ranged reports
routes/print.js        Printable payment cards (1–5 per Letter page)

views/                 EJS templates (login, dashboard, CRUD pages, print sheet)
public/                CSS + JS for the browser
```

---

## Common Operations

**Change the admin password:**

```bash
# 1. Generate a bcrypt hash
node -e "console.log(require('bcryptjs').hashSync('YourNewPassword', 10))"

# 2. Connect to Turso shell and update
turso db shell golden-crest
> UPDATE users SET password_hash = '<the-hash>' WHERE username = 'admin';
> .quit
```

The change takes effect on the next login attempt — no redeploy needed.

**Back up the database:**

```bash
turso db shell golden-crest .dump > backup-$(date +%Y-%m-%d).sql
```

**Wipe local dev data:** delete the `./data/` folder.

---

## Security Notes

- Rotate Turso tokens if they ever leak: `turso db tokens invalidate <name> && turso db tokens create <name>`
- The `admin/admin123` default exists *only on first DB seed*. Always set `ADMIN_PASSWORD` env var before first boot in production, or change the password immediately after.
- Sessions are cookie-based and signed with `SESSION_SECRET` — never commit that secret.
- Tailwind via CDN is fine for now; for production-grade, swap to a built `tailwind.css`.

---

&copy; Golden Crest Finance · Owned by Marvin Trinidad · Built with care by [Marvin's Friend](https://www.facebook.com/elvinsanity98/) ❤️
