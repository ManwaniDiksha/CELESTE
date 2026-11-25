# CELESTE — Local Setup & Verification Guide

## 1. Prerequisites
- **Node.js** 18+ and **npm**
- A **Supabase** project with PostgreSQL, Auth, and Realtime enabled

## 2. Install Dependencies
```bash
npm run install:all
```

## 3. Configure Environment Variables
1. Copy `.env.example` to `.env` in the project root and fill in:
   - `SUPABASE_URL`, `SUPABASE_SECRET_KEY`
   - `RECEPTION_STAFF_PIN_HASH` (generate with `node backend/scripts/hash-pin.js`)
   - `PIN_SESSION_SECRET` and `CRON_SECRET` (64-char hex via `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`)
   - Optional local evaluation prefill: `DEMO_ACCESS_ENABLED=true`, `DEMO_RECEPTION_STAFF_PIN`, `DEMO_RECEPTION_STAFF_PIN_HASH`, `DEMO_OWNER_EMAIL`, `DEMO_OWNER_PASSWORD`
2. Copy `frontend/.env.example` to `frontend/.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (leave `VITE_API_BASE_URL` blank for same-origin `/api` proxy).

## 4. Apply Database Migrations
Run the SQL files in `supabase/migrations/` in exact order in the Supabase SQL Editor:
`001` → `001b` → `001c` → `002` → `003` → `004` → `005` → `006` → `007` → `008` → `009`.

Provision the Owner account (`app_metadata.role = 'owner'`):
```bash
node backend/scripts/provision-owner.js
```

## 5. Run, Build & Test
```bash
# Start backend (port 5187) and frontend (port 5173)
npm run dev

# Production frontend build
npm run build

# Automated test suite (26 tests across 5 files)
node --test --test-timeout=5000 frontend/tests/frontend.test.js backend/tests/milestone1.test.js backend/tests/milestone2.test.js backend/tests/owner.test.js backend/tests/appointments_demo.test.js
```
