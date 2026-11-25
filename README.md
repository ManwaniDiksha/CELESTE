# CELESTE — Salon Queue Management System

CELESTE is a full-stack Salon Queue Management System built as an MSc IT (Intro to Programming) academic project. It enables customers to join a salon queue online, book future appointments, select up to three services, choose a preferred stylist or **Any Available Stylist**, and track their live turn in **English** and **Gujarati**, while providing dedicated operational interfaces for Reception, Stylists, a Waiting Area TV Display, and the Salon Owner.

### Problem Statement

Traditional salon queue management relies on manual registers, verbal communication, uncertain waiting times, and ad-hoc staff coordination. CELESTE replaces this with a centralized, persistent, real-time queue and appointment system that enforces service eligibility, workload balancing, and transparent waiting-time estimates.

### Project Objectives

1. Provide a digital self-service queue joining and live status tracking experience for customers.
2. Support future appointment scheduling even when the salon is currently closed.
3. Enforce strict FCFS ordering, cross-trained stylist eligibility, one-stylist-per-customer assignment, and workload-based **Any Available Stylist** routing.
4. Provide role-separated operational interfaces for Reception, all 5 Stylists, the Waiting Area TV Display, and the Salon Owner with zero-PII live synchronisation.
5. Deliver full bilingual support (**English** and **Gujarati**) across all screens.

---

## Table of Contents

1. [Key Features](#key-features)
2. [Technology Stack & Architecture](#technology-stack--architecture)
3. [Project Structure](#project-structure)
4. [Prerequisites & Installation](#prerequisites--installation)
5. [Environment Variables](#environment-variables)
6. [Supabase & Database Setup](#supabase--database-setup)
7. [Running Locally](#running-locally)
8. [The Seven Application Screens](#the-seven-application-screens)
9. [User Roles & Authentication](#user-roles--authentication)
10. [API Overview](#api-overview)
11. [English & Gujarati Support](#english--gujarati-support)
12. [Deploying to Vercel](#deploying-to-vercel)
13. [Known Limitations](#known-limitations)
14. [Academic Demonstration Guide](#academic-demonstration-guide)

---

## Key Features

- **Seven Connected Screens:** Home (`/`), Join Queue (`/join`), My Status (`/status/:id`), Reception Dashboard (`/reception`), Staff/Barber View (`/barber/:name`), Waiting Area TV Display (`/display`), and Owner Settings (`/admin`).
- **Strict Queue & Assignment Rules:**
  - Maximum of **3 services** per queue entry across 4 categories (`Hair`, `Beard & Grooming`, `Skin`, `Hands & Feet`).
  - **One stylist per customer** across all selected services; stylists are only eligible if qualified for *every* selected service.
  - **Any Available Stylist** assigns the eligible on-duty stylist (not on break) with the lowest projected workload in minutes (tie-broken by `available_since`).
  - **Strict FCFS ordering** within each stylist's queue (`joined_at ASC, token_number ASC`) with sequential daily tokens (`S-01`, `S-02`, ...). Cancelled and No-show tokens are never reused.
  - Duplicate active queue entries for the same 10-digit phone number on the same IST day are prevented atomically.
  - **10-minute arrival window** after `Called`, live service timers while `In Chair`, and `Start Coming` acknowledgement at queue position 2.
- **Zero-PII Live Synchronisation:** Supabase Realtime broadcasts (`celeste:live`) and public-table subscriptions update all connected screens automatically, degrading gracefully with a visible banner and 15-second fallback polling if connectivity drops.
- **Bilingual English & Gujarati UI:** Instant language switching (`English` / `ગુજરાતી` with `Noto Sans Gujarati`) across all seven screens, service names, staff profiles, statuses, and validation messages.

---

## Technology Stack & Architecture

- **Frontend:** React 19, Vite 7, React Router v7, Tailwind CSS v4, Lucide icons (`frontend/`).
- **Backend:** Node.js + Express 4 (`backend/`), exported for Vercel serverless functions (`api/index.js`) and runnable locally via `backend/server.js`.
- **Database, Auth & Realtime:** Supabase PostgreSQL (atomic `SECURITY DEFINER` RPCs, RLS, `daily_queue_statistics` view), Supabase Auth (Owner), and `@supabase/supabase-js` Realtime.
- **Deployment Target:** Vercel (`vercel.json` builds `frontend/dist` and rewrites `/api/*` to `/api/index.js`, with SPA fallback to `/index.html`).

All frontend API calls use relative `/api/*` paths with `credentials: 'include'`. Locally, Vite's dev proxy forwards `/api` to `http://localhost:5187`; in production on Vercel, `vercel.json` routes `/api/*` to the serverless Express app on the same origin.

---

## Project Structure

```text
CELESTE/
├── api/
│   └── index.js                          # Vercel serverless entry (exports Express app)
├── backend/
│   ├── scripts/
│   │   ├── hash-pin.js                   # Generates salted scrypt PIN hashes
│   │   └── provision-owner.js            # Provisions Supabase Owner user (app_metadata.role='owner')
│   ├── src/
│   │   ├── config/
│   │   │   ├── env.js                    # Environment parsing & startup validation
│   │   │   └── supabase.js               # Server-only Supabase client
│   │   ├── middleware/
│   │   │   ├── auth.js                   # Owner JWT, Reception PIN, Staff PIN & Cron auth
│   │   │   └── security.js               # CORS allowlist & HTTP security headers
│   │   ├── routes/
│   │   │   ├── auth.js                   # /api/auth/*
│   │   │   ├── health.js                 # GET /api/health
│   │   │   ├── owner.js                  # /api/owner/*
│   │   │   ├── public.js                 # /api/public/*
│   │   │   ├── queue.js                  # /api/queue/*
│   │   │   ├── reception.js              # /api/reception/*
│   │   │   └── staff.js                  # /api/staff/:slug/*
│   │   ├── services/
│   │   │   ├── ownerService.js           # Owner dashboard, reports & RPC orchestration
│   │   │   ├── queueService.js           # Queue snapshots, ETAs & RPC error mapping
│   │   │   └── realtime.js               # Zero-PII celeste:live broadcast helper
│   │   ├── utils/
│   │   │   ├── cookies.js                # HMAC-SHA256 signed HttpOnly PIN session cookies
│   │   │   ├── pinCrypto.js              # scrypt PIN hashing & constant-time verification
│   │   │   └── validation.js             # Input validation, IP HMAC keys & payload checks
│   │   └── app.js                        # Express app setup & global error handler
│   ├── tests/                            # Automated backend tests (milestone1, milestone2, owner)
│   └── server.js                         # Local Express server entry (port 5187)
├── frontend/
│   ├── src/
│   │   ├── components/                   # AppHeader, BohoAccents, ConfirmModal, FeedbackStates,
│   │   │                                 # OwnerModals, PinGateCard, RealtimeBanner,
│   │   │                                 # ReceptionModals, StatusBadges
│   │   ├── context/                      # AuthContext.jsx, LanguageContext.jsx
│   │   ├── hooks/                        # useQueueRealtime.js
│   │   ├── i18n/                         # translations.js (EN/GU dictionaries & helpers)
│   │   ├── pages/                        # HomePage, JoinQueuePage, MyStatusPage,
│   │   │                                 # ReceptionDashboardPage, StaffViewPage,
│   │   │                                 # WaitingAreaDisplayPage, OwnerSettingsPage
│   │   ├── services/                     # api.js, supabase.js
│   │   ├── utils/                        # formatters.js
│   │   ├── App.jsx                       # React Router routes for all 7 screens
│   │   └── index.css                     # Tailwind CSS v4 + CELESTE theme tokens
│   ├── tests/                            # Automated frontend utility & translation tests
│   ├── .env.example
│   ├── index.html                        # Loads Cormorant Garamond, Plus Jakarta Sans & Noto Sans Gujarati
│   ├── package.json
│   └── vite.config.js                    # Vite dev server + /api proxy to localhost:5187
├── docs/                                 # Approved project specification & database design
├── supabase/
│   ├── migrations/                       # SQL migrations 001 through 008
│   └── verification/                     # Read-only PostgreSQL catalog verification scripts
├── .env.example
├── .gitignore
├── package.json
├── vercel.json
├── prompts.md                            # Chronological AI development prompt log
└── README.md
```

---

## Prerequisites & Installation

- **Node.js** v18+ and **npm**
- A **Supabase** project (PostgreSQL, Auth, and Realtime enabled)

Install dependencies for both root/backend and frontend:

```bash
npm run install:all
```

---

## Environment Variables

### 1. Backend (`.env` in project root — copy from `.env.example`)

| Variable | Purpose |
| :--- | :--- |
| `PORT` | Local Express port (default `5187`; ignored on Vercel) |
| `CORS_ORIGIN` | Comma-separated allowed frontend origins (e.g. `http://localhost:5173`) |
| `SUPABASE_URL` | Base Supabase project URL (`https://<project-ref>.supabase.co`) |
| `SUPABASE_SECRET_KEY` | **Server-only** Supabase service-role/secret key (never expose in `VITE_*`) |
| `RECEPTION_STAFF_PIN_HASH` | Salted scrypt hash generated via `node backend/scripts/hash-pin.js` |
| `PIN_SESSION_SECRET` | Random server-only HMAC signing secret (32+ chars; 64 hex chars recommended) |
| `CRON_SECRET` | Bearer token protecting scheduled cron endpoints |

Helper commands:
```bash
# Generate RECEPTION_STAFF_PIN_HASH safely (does not store plaintext PINs)
node backend/scripts/hash-pin.js

# Generate a 64-character hex secret for PIN_SESSION_SECRET or CRON_SECRET
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

### 2. Frontend (`frontend/.env` — copy from `frontend/.env.example`)

| Variable | Purpose |
| :--- | :--- |
| `VITE_API_BASE_URL` | Leave empty to use same-origin `/api` (Vite proxy locally, Vercel rewrites in production) |
| `VITE_SUPABASE_URL` | Base Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Public browser-safe Supabase anon/publishable key |

> Never commit `.env` or `frontend/.env` to version control. Both are excluded in `.gitignore`.

---

## Supabase & Database Setup

Apply the SQL migrations in `supabase/migrations/` in exact order using the Supabase SQL Editor:

1. `001_schema_and_indexes.sql` — 9 tables, constraints, `token_display` generated column, 11 explicit indexes, and `daily_queue_statistics` view.
2. `001b_permission_hardening.sql` — Column/table privilege hardening.
3. `001c_default_privilege_hardening.sql` — Default privilege hardening.
4. `002_queue_functions.sql` — Atomic `SECURITY DEFINER` RPCs for queue join, assignment, FCFS transitions, cleanup, and new-day staff initialization.
5. `003_security_rls_and_realtime.sql` — Row Level Security policies and zero-PII Realtime publication.
6. `004_seed_data.sql` — Seeded 33 salon services, 5 stylists (`aarav`, `meera`, `kabir`, `riya`, `ananya`), 140 qualification mappings, and salon settings.
7. `005_pin_auth_functions.sql` — Atomic PIN lockout and rate-limiting RPCs (`pin_auth_attempts`).
8. `006_private_table_privilege_hardening.sql` — Locks down `customers`, `queue_status_history`, and `pin_auth_attempts` from public roles.
9. `007_queue_correction_and_actor_attribution.sql` — Queue entry correction & actor attribution RPCs.
10. `008_owner_management_functions.sql` — Owner CRUD RPCs enforcing the active-service qualification invariant.
11. `009_appointments.sql` — Future appointments (`appointments`, `appointment_services`), RLS/privileges, and atomic `book_appointment`, `cancel_appointment`, `check_in_appointment`, `mark_appointment_no_show` RPCs.

Read-only verification scripts for each migration live in `supabase/verification/`.

### Provisioning the Salon Owner Account

Create or promote the Owner account in Supabase Auth with `app_metadata.role = 'owner'` using:

```bash
node backend/scripts/provision-owner.js
```

---

## Running Locally

Start both the Express API (`http://localhost:5187`) and Vite dev server (`http://localhost:5173`):

```bash
npm run dev
```

Or run them in separate terminals:
```bash
npm run dev:backend
npm run dev:frontend
```

Build the production frontend bundle into `frontend/dist/`:
```bash
npm run build
```

Run the automated test suite (26 tests across 5 files):
```bash
node --test --test-timeout=5000 frontend/tests/frontend.test.js backend/tests/milestone1.test.js backend/tests/milestone2.test.js backend/tests/owner.test.js backend/tests/appointments_demo.test.js
```

---

## The Seven Application Screens

1. **Home (`/`)** — Live salon status, open/closed & online queue indicators, queue snapshot, stylist availability cards, service menu preview, weekly hours, and ticket lookup.
2. **Join Queue (`/join`)** — Customer registration form (name, 10-digit phone), 1–3 service selection, qualification-filtered stylist selection or **Any Available Stylist** ETA preview, and capacity/cutoff enforcement.
3. **My Status (`/status/:id`)** — Customer ticket tracker via unguessable UUID link: live FCFS position, estimated wait, `Start Coming` at position 2, 10-minute arrival countdown when `Called`, live service timer when `In Chair`, and explicit-confirmation cancellation.
4. **Reception Dashboard (`/reception`)** — PIN-protected operations console with 5 KPI cards, stylist station cards, walk-in registration, FCFS queue table with `>60 min` highlight, entry correction (Waiting only), Call Next, Start, Complete, No-show, Cancel, and Break toggles (displays customer phone numbers for reception follow-up).
5. **Staff / Barber View (`/barber/:name`)** — PIN-protected stylist workspace (`aarav`, `meera`, `kabir`, `riya`, `ananya`) with current customer card, 3-part live service timer, Call Next, Start, Mark Done, 10-minute No-show, and Break toggle. **Never exposes customer phone numbers.**
6. **Waiting Area TV Display (`/display`)** — High-contrast landscape display showing `Now Calling` tokens with optional Web Audio chime, stylist stations, next 5 waiting tokens, live IST clock, fullscreen toggle, and zero customer PII.
7. **Owner Settings (`/admin`)** — Supabase Auth Owner console for online queue toggle/limits, weekly operating hours, service CRUD (with active-service qualification invariant), staff profile/duty/availability/qualification management, zero-PII daily & historical reports, and typed-confirmation demo queue reset (`is_demo = TRUE`).

---

## User Roles & Authentication

- **Customers:** No login required; `/status/:id` uses an unguessable UUID ticket link and never exposes phone numbers.
- **Reception & Staff:** Shared PIN verified on the backend via `scrypt` + `timingSafeEqual` with PostgreSQL IP-HMAC rate limiting (lockout after repeated failures). Issues an `HttpOnly`, `SameSite=Lax`, HMAC-SHA256 signed `celeste_staff_session` cookie (12-hour TTL, `Secure` on HTTPS/Vercel) bound to `scope` (`reception` or `staff`) and `staffSlug`.
- **Salon Owner:** Supabase Auth Email + Password. Express middleware (`requireOwnerAuth`) validates the Bearer JWT via `supabaseAdmin.auth.getUser(token)` and requires trusted `user.app_metadata.role === 'owner'`.

---

## API Overview

- `GET /api/health` — Backend reachability check.
- `GET /api/public/home`, `/api/public/join-options`, `/api/public/display` — Zero-PII public salon, catalog, and display payloads.
- `POST /api/queue/join`, `GET /api/queue/status/:id`, `POST /api/queue/:id/start-coming`, `POST /api/queue/:id/cancel` — Customer queue operations.
- `POST /api/auth/pin/login`, `POST /api/auth/pin/logout`, `GET /api/auth/pin/session`, `GET /api/auth/owner/session` — Authentication & session verification.
- `GET /api/reception/dashboard`, `/entries/:id`, `POST /walk-in`, `/call-next`, `/entries/:id/{start,complete,no-show,cancel}`, `PATCH /entries/:id`, `PATCH /staff/:id/availability` — Reception-authenticated operations.
- `GET /api/staff/:slug/dashboard`, `POST /call-next`, `/entries/:id/{start,complete,no-show}`, `PATCH /availability` — Staff-authenticated, slug-bound operations.
- `GET /api/owner/{dashboard,reports}`, `POST /api/owner/services`, `PATCH /services/:id`, `PATCH /staff/:id/{profile,duty,availability}`, `PUT /staff/:id/qualifications`, `POST /qualifications/toggle`, `PATCH /settings`, `POST /demo-reset` — Owner-authenticated operations.

---

## English & Gujarati Support

All UI text is managed via `frontend/src/i18n/translations.js` and `LanguageContext.jsx`, with instant switching persisted in `localStorage` (`celeste_lang`). Gujarati text renders with `Noto Sans Gujarati` alongside `Cormorant Garamond` headings and `Plus Jakarta Sans` UI copy.

---

## Deploying to Vercel

1. Push the repository to GitHub and import it into Vercel.
2. Keep the default settings from `vercel.json`:
   - **Build Command:** `npm --prefix frontend install && npm --prefix frontend run build`
   - **Output Directory:** `frontend/dist`
3. Add all backend and `VITE_*` frontend environment variables in Vercel Project Settings (leaving `VITE_API_BASE_URL` unset for same-origin `/api/*` routing).
4. Ensure your Supabase project has migrations `001`–`009` applied and the Owner account provisioned.

---

## Known Limitations

- Reception and Staff share a single salon operational PIN (`RECEPTION_STAFF_PIN_HASH`); individual staff accounts/passwords are intentionally out of scope per the approved design.
- End-of-day cleanup runs lazily on queue/dashboard reads once closing time passes (and when invoked via `CRON_SECRET`-protected scheduled runs if configured).
- Payment gateways, loyalty programs, inventory management, and customer review systems are intentionally excluded per project scope.

---

## Academic Demonstration Guide (Professor Demo Guide)

1. **Open the Application:** Start locally with `npm run dev` and open `http://localhost:5173`.
2. **Prefilled Evaluation Login Forms:** When `DEMO_ACCESS_ENABLED=true` is configured in local `.env` (non-production loopback only), the **original login forms** on `/reception`, `/barber/:name` (`aarav`, `meera`, `kabir`, `riya`, `ananya`), and `/admin` automatically prefill the configured evaluation credentials in memory so a professor can click **Unlock Workspace** or **Sign in as Owner** directly without referring to external notes.
3. **Book a Future Appointment:** Click **Book an Appointment** (`/appointments`), select 1–3 services, choose a future operating date and available 30-minute time slot (works even when the salon is currently closed), and confirm to receive an `APT-...` reference code. Use **Find / Manage Appointment** to look up or cancel with reference + 10-digit phone.
4. **Check In an Appointment:** On `/reception`, view **Scheduled Appointments** (`Today` / `Upcoming`), search by `APT-...` reference or phone, and click **Check In to Queue** for today's appointments to generate a live queue token (`S-XX`) under the assigned stylist.
5. **Demonstrate the Live Queue:** Use `/join`, `/status/:id`, `/reception`, `/barber/aarav`, and `/display` to demonstrate FCFS ordering, `Start Coming`, 10-minute No-show, live service timers, and zero-PII Realtime updates.
6. **Required Environment Variables for Local Demo Prefill:** Set `DEMO_ACCESS_ENABLED=true`, `DEMO_RECEPTION_STAFF_PIN`, `DEMO_RECEPTION_STAFF_PIN_HASH` (generated via `node backend/scripts/hash-pin.js`), `DEMO_OWNER_EMAIL`, and `DEMO_OWNER_PASSWORD` in root `.env` (leave `DEMO_ACCESS_ENABLED=false` in production; `GET /api/auth/demo-prefill` returns `403` in production or from non-loopback addresses).
