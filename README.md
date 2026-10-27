# Dear Results Portal (MVP)

A modern lottery-results information portal with a protected admin dashboard. This project is for publishing verified public results and schedules only. It does not sell tickets, accept wagers, process prizes, or generate winning numbers.

## Stack
- Frontend: React + Vite
- Backend: Node.js + Express
- Database: PostgreSQL
- Admin auth: bcrypt password hashes + JWT in an HTTP-only cookie
- Validation: Zod

## Features
- Responsive public homepage, latest results, result archive/search, schedule, result detail
- Virtual-points games at `/games`, user accounts at `/account`, and private entry history
- Admin login and dashboard
- Server-side game draws, duplicate-entry protection, virtual-point ledger, winners, announcements, and audit review
- CRUD for lottery categories and results
- Draft/published status
- Result source/verification notes
- Audit log for admin changes
- Server-side validation, rate-limited login, security headers, parameterized SQL
- Seed script creates an initial admin from environment variables

## Requirements
- Node.js 20+
- PostgreSQL 14+

## Setup

### 1) Database
Create a PostgreSQL database and run:

```bash
psql "$DATABASE_URL" -f database/schema.sql
```

The schema includes a demo `Drawline Pick 5` game and one upcoming draw. Gameplay is virtual-points only: points have no monetary value and there are no deposits, withdrawals, paid entries, or cash prizes.

### 2) Backend
```bash
cd backend
cp .env.example .env
# Edit .env: DATABASE_URL, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npm install
npm run seed:admin
npm run dev
```
Backend runs on `http://localhost:4000`.

### 3) Frontend
In another terminal:
```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```
Frontend runs on `http://localhost:5173`.

The Vite dev server proxies the same-origin `/api` path to the backend. Production uses
the same relative `/api` paths through the unified Vercel deployment.

Public routes include `/`, `/games`, `/games/:slug`, and `/account`. The protected administrator workspace is available at `/admin`; it includes game configuration, draw scheduling/execution, entry review, user review, announcements, and audit logs. Scheduled draws are settled server-side when due, and administrators can execute a draw manually for authorized testing.

## First admin
The seed script uses `ADMIN_EMAIL` and `ADMIN_PASSWORD` from backend `.env`. Use a strong, unique password. Do not deploy with demo credentials.

## Deploy notes

### Unified Vercel deployment

The repository root contains the Vercel configuration and the serverless API entry point:

- `frontend/dist` is built and served as the React/Vite application.
- `api/index.js` is the Vercel-discovered serverless Express function. The
  first rewrite in `vercel.json` sends every `/api/*` request to it before the
  frontend SPA fallback is considered.
- The SPA rewrite applies only to non-API paths such as `/`, `/games`, `/account`, and `/admin`.
- Vercel Cron calls `/api/cron/draws` to settle due draws without a long-running process.

The configured minutely Cron schedule requires a Vercel plan that supports more-than-daily
Cron jobs. Vercel Hobby rejects frequent schedules; use an eligible plan for scheduled
draw settlement or deliberately change the schedule before deploying.

Import the repository with the Root Directory set to the repository root. Do not set the
Root Directory to `frontend` and do not create a second Vercel project for `backend`.

Set these Vercel environment variables for Production and Preview as appropriate:

```text
NODE_ENV=production
DATABASE_URL=postgresql://...              # hosted PostgreSQL connection string
JWT_SECRET=...                              # random secret, at least 32 characters
FRONTEND_ORIGIN=https://your-app.vercel.app
COOKIE_SECURE=true
COOKIE_SAME_SITE=lax
CRON_SECRET=...                             # random secret used by Vercel Cron
ADMIN_EMAIL=...
ADMIN_PASSWORD=...
```

Run `database/schema.sql` against the hosted PostgreSQL database, then run the existing
`npm run seed:admin` command from `backend/` once with the production environment loaded.
Never commit `.env` files or database credentials. For the unified deployment, frontend
API requests remain relative (`/api/...`) and no `VITE_API_BASE_URL` is required.

The deployment build command is defined in `vercel.json`:

```text
npm --prefix frontend run build
```

The install command installs both frontend and backend dependencies. The regular local
backend listener and one-minute scheduler remain available when `npm run dev` or
`npm start` is used outside Vercel; inside Vercel, only the exported Express handler is
loaded and scheduled draws are handled by the protected Cron endpoint.

## Important launch checklist
- Verify that the client is legally permitted to publish the relevant lottery information in each target jurisdiction.
- Use official/authorized sources and keep evidence/source URLs for published results.
- Never fabricate results. Mark results as draft until checked by an authorized person.
- Have local counsel review applicable Indian and state lottery rules, disclaimers, privacy policy, and data-retention requirements.
- This MVP intentionally excludes ticket sales, betting, deposits, withdrawals, prize claims, and payment integrations.
