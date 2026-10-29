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
the same relative `/api` paths through the unified Netlify deployment.

Public routes include `/`, `/games`, `/games/:slug`, and `/account`. The protected administrator workspace is available at `/admin`; it includes game configuration, draw scheduling/execution, entry review, user review, announcements, and audit logs. Scheduled draws are settled server-side when due, and administrators can execute a draw manually for authorized testing.

## First admin
The seed script uses `ADMIN_EMAIL` and `ADMIN_PASSWORD` from backend `.env`. Use a strong, unique password. Do not deploy with demo credentials.

## Deploy notes

### Unified Netlify deployment

Import the repository root (`dear-results-portal`) into Netlify using branch `main`.
`netlify.toml` defines the build and publish settings:

- `frontend/dist` is the published React/Vite application.
- `backend/netlify/functions/api.js` is the serverless Express entry point.
- The `/api/*` rewrite runs before the `/* -> /index.html` SPA fallback and preserves the `/api` prefix.
- `backend/netlify/functions/cron-draws.js` is a Netlify Scheduled Function that processes due draws every minute in UTC.
- The regular Express listener and local draw scheduler still run with `npm run dev` or `npm start` from `backend/`.

Set these Netlify environment variables in the Functions scope for Production (and safe,
separate values for Deploy Previews when needed):

```text
NODE_ENV=production
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require
JWT_SECRET=<random-secret-at-least-32-characters>
FRONTEND_ORIGIN=https://your-site.netlify.app
COOKIE_SECURE=true
COOKIE_SAME_SITE=lax
CRON_SECRET=<random-cron-secret>
ADMIN_EMAIL=<administrator-email>
ADMIN_PASSWORD=<strong-unique-password>
```

`PORT` is optional on Netlify and defaults to `4000`; it is only needed for the local
Express listener. `DATABASE_URL`, `JWT_SECRET`, `COOKIE_SECURE`, `COOKIE_SAME_SITE`, and
`FRONTEND_ORIGIN` are used by the running API. Netlify’s runtime site/deploy URL is
also accepted as a CORS origin, but set `FRONTEND_ORIGIN` explicitly for a custom domain.
`CRON_SECRET` protects the public
`/api/cron/draws` fallback endpoint. `ADMIN_EMAIL` and `ADMIN_PASSWORD` are read by the
one-time admin seed script, not by normal request handling. `NODE_ENV` controls runtime
behavior and is recommended in production.

Apply the schema to the hosted Neon database before the first deploy, then seed the admin
once from a secure shell with the production environment loaded:

```bash
psql "$DATABASE_URL" -f database/schema.sql
cd backend && npm run seed:admin
```

Never commit `.env` files or database credentials. The frontend uses relative `/api/...`
requests, so no `VITE_API_BASE_URL` is required and `DATABASE_URL` is never exposed to
the browser.

### Netlify secret scanning

Only `DATABASE_URL`, `JWT_SECRET`, `ADMIN_PASSWORD`, and `CRON_SECRET` should be marked
`Contains secret values` in Netlify. `NODE_ENV`, `PORT`, `FRONTEND_ORIGIN`,
`COOKIE_SECURE`, and `COOKIE_SAME_SITE` are configuration values, not credentials. The
repository also sets the narrow `SECRETS_SCAN_SMART_DETECTION_OMIT_VALUES` exception for
the known local literals used by the examples and Vite proxy. Do not set
`SECRETS_SCAN_ENABLED=false`.

## Important launch checklist
- Verify that the client is legally permitted to publish the relevant lottery information in each target jurisdiction.
- Use official/authorized sources and keep evidence/source URLs for published results.
- Never fabricate results. Mark results as draft until checked by an authorized person.
- Have local counsel review applicable Indian and state lottery rules, disclaimers, privacy policy, and data-retention requirements.
- This MVP intentionally excludes ticket sales, betting, deposits, withdrawals, prize claims, and payment integrations.
