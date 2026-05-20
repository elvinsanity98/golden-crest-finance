# Golden Crest Finance

A modern lending management web app — track borrowers, originate loans, and record daily collections.

**Owned by:** Marvin Trinidad
**Developed by:** TG Devworks

---

## Features

- **Dashboard** — today's collections, expected vs collected, outstanding balance, arrears.
- **Borrowers** — full directory with search and per-borrower loan history.
- **Loans** — originate with **10% monthly interest** and **daily collection** schedule auto-computed.
- **Daily Collections** — quick payment recording with payment method (cash, GCash, Maya, bank).
- **Visual Schedule** — day-by-day grid showing paid / partial / missed / today / future.
- **Reports** — date-ranged collection summaries, active portfolio view, arrears tracking.
- **Loan Calculator** — free public tool. Borrowers can estimate daily payments without login.
- **Mobile-first** — bottom nav, responsive cards, touch-friendly.
- **Auto-close** — loans flip to "Paid" automatically when paid off.

## Tech Stack

- **Node.js** + **Express**
- **EJS** + **Tailwind CSS** (mobile-friendly)
- **libSQL / Turso** (cloud-managed SQLite) in production, local SQLite file in dev
- **express-session** + **bcryptjs**

## Local Quick Start

```bash
npm install
npm start
```

Runs at <http://localhost:3000>. Default login: `admin` / `admin123`.

A local SQLite file is created at `./data/gcfinance.sqlite` automatically.

---

## Free Deployment — Turso + Render

This app deploys to free tiers in about 10 minutes.

### Step 1 — Push your code to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
gh repo create golden-crest-finance --public --source=. --push
```

(If you don't use the `gh` CLI, just create an empty repo on github.com and `git remote add origin ... && git push -u origin main`.)

### Step 2 — Create a free Turso database

1. Sign up at <https://turso.tech> (GitHub login works).
2. Install the Turso CLI: <https://docs.turso.tech/cli/installation>
3. From any terminal:
   ```bash
   turso auth login
   turso db create golden-crest
   turso db show golden-crest --url       # → libsql://golden-crest-<you>.turso.io
   turso db tokens create golden-crest    # → long auth token; copy it
   ```
   Free tier gives you **9 GB storage** and **1 billion row reads/month** — far beyond what this app needs.

### Step 3 — Deploy to Render

1. Sign up at <https://render.com> (GitHub login works).
2. Click **New → Blueprint**, point it at your GitHub repo. Render reads `render.yaml` and proposes a service.
3. When prompted for env vars, fill in:
   - `DATABASE_URL` = `libsql://golden-crest-<you>.turso.io` (from Step 2)
   - `DATABASE_AUTH_TOKEN` = `<the token from Step 2>`
   - `ADMIN_PASSWORD` = your chosen admin password
   (`SESSION_SECRET` is auto-generated, `NODE_ENV` is auto-set.)
4. Click **Apply**. First build takes ~2 min. Render gives you a `https://golden-crest-finance.onrender.com` URL.
5. Open the URL and log in as `admin` with your `ADMIN_PASSWORD`.

**Note:** Render's free Web Service sleeps after 15 min of inactivity. The first request after waking takes ~30s — fine for an internal tool, not a high-traffic site. Upgrade to the $7/mo Starter plan to keep it warm.

### Don't want to use the Blueprint?

You can also create the service manually on Render:
- **Build command:** `npm install`
- **Start command:** `npm start`
- **Environment:** add the four env vars above, plus `NODE_ENV=production`.

---

## Loan Math

For each loan:

- **Interest** = Principal × monthly rate × (term days / 30)
- **Total Payable** = Principal + Interest
- **Daily Payment** = Total Payable ÷ term days

Example: ₱10,000 for 30 days @ 10% / month → ₱1,000 interest → ₱11,000 total → **₱366.67/day**.

## Project Structure

```
server.js              Express entrypoint
db/database.js         libSQL client + schema + async helpers
db/seed.js             Creates default admin on first boot
helpers/calc.js        Loan math
helpers/format.js      Currency & date formatting
middleware/auth.js     Login guard
routes/*               All HTTP routes
views/*                EJS templates
public/*               CSS + JS
render.yaml            Render Blueprint config
.env.example           Env var template
```

## Environment Variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | prod | `libsql://<your-db>.turso.io` — leave empty for local file |
| `DATABASE_AUTH_TOKEN` | prod | from `turso db tokens create` |
| `SESSION_SECRET` | yes | long random string; Render generates one |
| `ADMIN_PASSWORD` | first boot | initial admin password (only used when seeding) |
| `NODE_ENV` | prod | set to `production` for secure cookies |
| `PORT` | no | host sets this automatically; defaults to 3000 |

## Common Operations

- **Change the admin password:** log into the host (or connect to Turso with `turso db shell golden-crest`) and update `users.password_hash`. Or delete the row and restart — it will re-seed using `ADMIN_PASSWORD`.
- **Back up the database:** `turso db shell golden-crest .dump > backup.sql`
- **Reset locally:** delete the `./data/` folder.

---

&copy; Golden Crest Finance · Built with care by **TG Devworks**.
