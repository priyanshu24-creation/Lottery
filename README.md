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

The Vite dev server proxies `/api` to the backend. For production, set `VITE_API_BASE_URL` if the API is hosted on a different origin, configure CORS and cookie settings for your domains, and use HTTPS.

Public routes include `/`, `/games`, `/games/:slug`, and `/account`. The protected administrator workspace is available at `/admin`; it includes game configuration, draw scheduling/execution, entry review, user review, announcements, and audit logs. Scheduled draws are settled server-side when due, and administrators can execute a draw manually for authorized testing.

## First admin
The seed script uses `ADMIN_EMAIL` and `ADMIN_PASSWORD` from backend `.env`. Use a strong, unique password. Do not deploy with demo credentials.

## Deploy notes

### Vercel frontend

The repository includes a root `vercel.json` for this monorepo. It installs and builds
`frontend`, publishes `frontend/dist`, and rewrites client-side routes such as `/games`,
`/account`, and `/admin` to the Vite entry point. Import the repository into Vercel
without changing the Root Directory, or deploy from `dear-results-portal` with the Vercel
CLI.

Set this Vercel environment variable before deploying:

```text
VITE_API_BASE_URL=https://your-api-host.example.com
```

The API origin must not have a trailing slash. Vercel hosts the frontend only; the
Express backend must run separately on a long-running Node host because it maintains the
PostgreSQL pool and server-side scheduled draw worker. The Vercel SPA rewrite does not
replace the backend API.

### Backend and database

- Deploy the Express backend to a Node host that supports long-running web services.
- Use managed PostgreSQL.
- Set all environment variables in the hosting dashboard; never commit `.env`.
- For cross-site frontend/backend deployments, set `COOKIE_SAME_SITE=none`, `COOKIE_SECURE=true`, and configure `FRONTEND_ORIGIN` to the exact frontend origin. HTTPS is required for cross-site cookies.
- Run `database/schema.sql` against production DB before starting the backend.
- Run `npm run seed:admin` once to create the first admin, then remove/rotate bootstrap credentials.
- Configure database backups, monitoring, and an SMTP/service contact before launch.

## Important launch checklist
- Verify that the client is legally permitted to publish the relevant lottery information in each target jurisdiction.
- Use official/authorized sources and keep evidence/source URLs for published results.
- Never fabricate results. Mark results as draft until checked by an authorized person.
- Have local counsel review applicable Indian and state lottery rules, disclaimers, privacy policy, and data-retention requirements.
- This MVP intentionally excludes ticket sales, betting, deposits, withdrawals, prize claims, and payment integrations.
