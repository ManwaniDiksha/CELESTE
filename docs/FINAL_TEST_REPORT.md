# CELESTE — Final Acceptance Test & Validation Report

**Date:** 2026-11-25 (IST)  
**Project:** CELESTE — Salon Queue Management System  
**Environment:** Local Vite (`http://localhost:5173`) + Express API (`http://localhost:5187`) + Cloud Supabase (Migrations `001`–`008` applied)

---

## 1. Executive Summary & Test Statistics

This report documents the end-to-end acceptance testing, security audit, and submission validation for CELESTE. Testing combined:
- **Automated Unit & Integration Tests:** `23/23` passed (`frontend/tests/frontend.test.js`, `backend/tests/milestone1.test.js`, `backend/tests/milestone2.test.js`, `backend/tests/owner.test.js`).
- **Live HTTP API & Security Probes:** `22/22` passed against `http://localhost:5187`.
- **Live Browser Acceptance & Responsive Tests:** `16/16` executed checks passed (after fixing 2 discovered UI/accessibility issues and re-verifying in browser).
- **Build, Translation & Secret Scans:** `4/4` passed (`vite build`, `node --check`, `291/291` EN/GU translation parity, zero-secret scan).
- **Environment-Blocked Live Scenarios:** `8` live authenticated/open-hours E2E browser/DB mutation scenarios were marked **BLOCKED** because (a) local IST time during testing (`23:43–23:51 IST`) is outside salon operating hours (`SALON_CLOSED`), and (b) security rules prohibit reading, printing, or requesting plaintext PINs, Owner passwords, or modifying/deleting existing queue/settings records without credentials. Note that the underlying backend routes, RPCs, RBAC, and business rules for all 8 blocked live scenarios are covered by passing automated integration tests (`milestone1`, `milestone2`, `owner`).

| Category | Total | Passed | Failed | Blocked | Not Run |
|---|---:|---:|---:|---:|---:|
| Automated Unit & Integration Tests | 23 | 23 | 0 | 0 | 0 |
| Live API & Security Probes | 22 | 22 | 0 | 0 | 0 |
| Live Browser & Responsive Checks | 16 | 16 | 0 | 0 | 0 |
| Build, Syntax, i18n & Secret Scans | 4 | 4 | 0 | 0 | 0 |
| Live Authenticated / Open-Hours E2E Mutations | 8 | 0 | 0 | 8 | 0 |
| **Total** | **73** | **65** | **0** | **8** | **0** |

*Executed Pass Rate (excluding blocked):* **65 / 65 = 100%** (0 failures).

---

## 2. Original Handout Requirement Traceability Matrix

| Req ID | Original Handout Requirement | Implementation | Test IDs | Expected Behavior | Actual Result | Status |
|---|---|---|---|---|---|---|
| REQ-01 | Home Screen (`/`) with salon status, hours, staff & services | `HomePage.jsx`, `GET /api/public/home` | BRW-01, API-PUB-01 | Displays open/closed, queue snapshot, 5 staff, 33 services, weekly hours | Verified live in EN & GU (`Closed`, `28/30`, 5 staff, 4 categories) | PASS |
| REQ-02 | Join Queue Screen (`/join`) with 1–3 services & stylist preference | `JoinQueuePage.jsx`, `POST /api/queue/join` | BRW-02, API-JOIN-01..06, M1-T3 | Validates inputs, max 3 services, qualification filtering, closed-salon block | Validation (`400`) & `SALON_CLOSED` (`409`) verified live; open-hours join covered by `M1-T3` | PASS |
| REQ-03 | My Status Screen (`/status/:id`) with live position, Start Coming & Cancel | `MyStatusPage.jsx`, `GET /api/queue/status/:id` | BRW-03, API-STAT-01..02, API-CANC-01, M1-T4..05 | Handles valid/invalid/unknown UUIDs, timers, Start Coming, Cancel confirmation | Invalid/unknown UUID UI verified live; active-ticket lifecycle covered by `M1-T4..05` | PASS |
| REQ-04 | Reception Dashboard (`/reception`) with KPIs, Walk-in, Call, Start, Complete, No-show, Cancel, >60m highlight | `ReceptionDashboardPage.jsx`, `backend/src/routes/reception.js` | BRW-05, API-AUTH-01..02, M2-T1..06 | PIN-gated; exposes phone PII to Reception only; enforces FCFS & transitions | Gate verified live; unauth denied (`401`); full workflow covered by `M2-T1..06` (live auth E2E `BLOCKED`) | PASS (Unit/API) / BLOCKED (Live Auth) |
| REQ-05 | Staff/Barber View (`/barber/:name`) for all 5 stylists, 3-part timer, no phone PII | `StaffViewPage.jsx`, `backend/src/routes/staff.js` | BRW-06, API-AUTH-03..04, M2-T3..06 | All 5 slugs (`aarav`, `meera`, `kabir`, `riya`, `ananya`), slug-bound PIN, zero phone PII | All 5 slug gates + unknown-slug selector verified live; transitions & zero-PII verified in `M2-T3..06` | PASS (Unit/API) / BLOCKED (Live Auth) |
| REQ-06 | Waiting Area TV Display (`/display`) with Called highlight, chime, Next 5, zero PII | `WaitingAreaDisplayPage.jsx`, `GET /api/public/display` | BRW-04, API-PUB-03, M1-T1 | Landscape TV view at `1920x1080`, IST clock, sound toggle, zero phone numbers | Verified live at `1920x1080` in EN & GU (`S-04 In Chair`, 5 stations, zero PII) | PASS |
| REQ-07 | Owner Settings (`/admin`) with services, staff, hours, online queue, reports, safe demo reset | `OwnerSettingsPage.jsx`, `backend/src/routes/owner.js` | BRW-07, API-AUTH-05..07, OWN-T1..03 | Supabase Auth `app_metadata.role='owner'`, CRUD, active-service invariant, zero-PII reports | Login gate verified live; unauth `401`; RBAC, invariant & CRUD verified in `OWN-T1..03` | PASS (Unit/API) / BLOCKED (Live Auth) |
| REQ-08 | FCFS ordering, Any Available workload assignment, 10-min No-show, duplicate phone block | `002_queue_functions.sql`, `queueService.js` | M1-T1..05, M2-T1..06 | Strict FCFS, lowest-workload assignment, 10-min No-show, 1 active entry per phone | Verified in automated unit/integration suites; live open-hours DB mutation `BLOCKED` | PASS (Unit/API) / BLOCKED (Live Open) |
| REQ-09 | English & Gujarati bilingual support across all 7 screens | `translations.js`, `LanguageContext.jsx` | I18N-01, BRW-01..07 | `291/291` keys in EN & GU; instant switching; `Noto Sans Gujarati` rendering | `291/291` parity passed; live EN/GU switching verified on all 7 screens | PASS |
| REQ-10 | Responsive layout (Mobile, Tablet, Desktop, TV) & Accessibility | `AppHeader.jsx`, `FeedbackStates.jsx`, all pages | BRW-08 | Zero horizontal overflow, `<main>` landmarks, readable contrast & focus | Fixed `BUG-01` (375px header overflow) & `BUG-02` (`<main>` landmark); re-verified PASS | PASS |
| REQ-11 | Supabase Realtime zero-PII live updates (`celeste:live`) | `useQueueRealtime.js`, `realtime.js` | M1-T3, M2-T2 | Broadcasts `{queue_date, staff_id, action}` only; no PII; reconnects cleanly | Zero-PII broadcast verified in `M1-T3`/`M2-T2`; live multi-client propagation `BLOCKED` (salon closed) | PASS (Unit/API) / BLOCKED (Live Multi-Client) |

---

## 3. Test Case Register (Executed & Blocked)

### A. Live API & Security Probes (`http://localhost:5187`)
| Test ID | Target | Expected | Actual | Status |
|---|---|---|---|---|
| `API-PUB-01` | `GET /api/public/home` | 200, zero PII, 5 staff | 200, `hasPhone: false`, 5 staff | PASS |
| `API-PUB-02` | `GET /api/public/join-options` | 200, 33 services, 5 staff | 200, 33 services, 5 staff | PASS |
| `API-PUB-03` | `GET /api/public/display` | 200, zero PII | 200, `hasPhone: false` | PASS |
| `API-JOIN-01..05` | `POST /api/queue/join` (empty, bad phone, 4 services, duplicate service, bad UUID) | 400 validation error | 400 on all 5 cases | PASS |
| `API-JOIN-06` | `POST /api/queue/join` (valid payload while closed) | 409 `SALON_CLOSED` | 409 `SALON_CLOSED` | PASS |
| `API-CONC-01` | 2× concurrent `POST /api/queue/join` while closed | Both 409 | `409`, `409` | PASS |
| `API-STAT-01..02` | `GET /api/queue/status/{invalid, unknown}` | 400 / 404 | 400 / 404 | PASS |
| `API-CANC-01` | `POST /api/queue/:id/cancel` without `confirmed: true` | 400 | 400 | PASS |
| `API-AUTH-01..07` | Unauthenticated `/api/reception/*`, `/api/staff/*`, `/api/owner/*`, spoofed Bearer | 401 | 401 on all 7 | PASS |
| `API-AUTH-08` | `POST /api/auth/pin/login` invalid scope | 400 | 400 | PASS |
| `API-CORS-01..02` | `Origin: http://localhost:5173` vs `https://evil.example.com` | 200 (ACAO) / 403 | 200 (ACAO) / 403 | PASS |
| `API-HDR-01` | Security headers on all API responses | `nosniff`, `DENY`, `no-store` | Present on all 22 responses | PASS |

### B. Live Browser Acceptance Tests (`http://localhost:5173`)
| Test ID | Screen / Scope | Expected | Actual | Status |
|---|---|---|---|---|
| `BRW-01` | `/` Home (EN & GU, ticket validation) | Loads live data, switches EN/GU cleanly, rejects `abc` | Verified (`Closed`, 5 staff, 4 categories, EN/GU clean) | PASS |
| `BRW-02` | `/join` Join Queue (EN & GU) | Shows closed notice, 33 services, 5 stylists, EN/GU clean | Verified | PASS |
| `BRW-03` | `/status/:id` (unknown UUID & `bad-id`) | Clean error state, `<main>` landmark, retry/home link | Fixed `BUG-02`; re-verified `<main>` + Home link | PASS |
| `BRW-04` | `/display` at `1920x1080` (EN & GU) | TV header, IST clock, sound/fullscreen, 5 stations, zero PII | Verified (`S-04 In Chair`, zero phones) | PASS |
| `BRW-05` | `/reception` PIN gate (EN & GU) | PIN gate renders cleanly in EN/GU | Verified (after signing out prior session) | PASS |
| `BRW-06` | `/barber/{aarav,meera,kabir,riya,ananya,unknown}` | 5 slug gates + quick-switch pills + unknown selector | Verified all 6 routes | PASS |
| `BRW-07` | `/admin` Owner login gate (EN & GU) | Owner sign-in gate renders cleanly | Verified | PASS |
| `BRW-08` | Responsive (`375x812`, `768x1024`, `1440x900`) | Zero horizontal overflow on all viewports | Fixed `BUG-01` (`375px` header overflow); re-verified `0px` overflow | PASS |

### C. Blocked Live Scenarios (Environment / Security Constraints)
| Test ID | Scenario | Reason Blocked | Existing Mitigating Coverage |
|---|---|---|---|
| `BLK-01..03` | Live open-hours customer join, Start Coming, FCFS, No-show, Cancel | Local IST time (`23:43+`) is after closing (`SALON_CLOSED`), and modifying live `salon_settings` requires Owner credentials | `backend/tests/milestone1.test.js` (5/5 pass) |
| `BLK-04..05` | Live authenticated Reception & Staff browser workflows & PII inspection | Plaintext PIN is not exposed/requested per security rules | `backend/tests/milestone2.test.js` (6/6 pass) |
| `BLK-06` | Live authenticated Owner CRUD, qualification invariant & report verification | Owner password is not exposed/requested per security rules | `backend/tests/owner.test.js` (3/3 pass) |
| `BLK-07..08` | Live multi-client Realtime propagation & live open-hours concurrency races | Requires open salon hours + authenticated Reception/Staff/Owner sessions | Broadcast & concurrency logic verified in `milestone1`, `milestone2`, `owner` tests |

---

## 4. Bugs Discovered & Fixed During Testing

| Bug ID | Severity | Description & Root Cause | Fix & Files Changed | Regression Result |
|---|---|---|---|---|
| `BUG-01` | Medium | Mobile (`375x812`) header overflowed horizontally by `~13px` when vertical scrollbar narrowed `html` to `360.35px`, clipping the hamburger button edge | Tightened mobile padding, gaps, logo size, and compact `LanguageSwitcher` padding in `frontend/src/components/AppHeader.jsx` | Re-built and re-verified at `375x812`: `0px` horizontal overflow, hamburger right edge `348.35px` inside `360.35px` |
| `BUG-02` | Low | Unauthenticated `PinGateCard` and `PageLoading`/`PageError` (e.g., `/status/bad-id`, `/barber/*`) used `<div>` instead of `<main>`, and `PageError` lacked a Home link when `onRetry` was omitted | Replaced root `<div>` with `<main>` in `PinGateCard.jsx` and `FeedbackStates.jsx`; added Home `<Link>` fallback in `PageError` | Re-built and re-verified `/status/bad-id`: `<main>` landmark present (`mainCount: 1`) with `← Home` link |

---

## 5. Final Verdict

**READY WITH DOCUMENTED NON-BLOCKING LIMITATIONS**

All 65 executed automated, live API, security, build, i18n, and browser checks passed with 0 failures after fixing `BUG-01` and `BUG-02`. The 8 live authenticated/open-hours E2E mutation tests could not be executed in this session due to after-hours salon closing (`SALON_CLOSED` at 23:43 IST) and secret-protection rules, while their underlying backend routes, RPCs, and security boundaries are verified by the passing 23-test automated suite.

---

## 6. Master Task 4B — Blocked Live E2E Scenario Follow-Up

**Execution Timestamp:** 2026-11-25 23:54 IST  
**Environment Checked:** `http://localhost:5187/api/public/home` (`queue_date: "2026-11-25"`, `current_time_ist: "23:54"`, `is_salon_open: false`, `online_blocked_reason: "SALON_CLOSED"`, `today_open: "10:00"`, `today_close: "21:00"`, `active_count: 1`, `in_chair_count: 1`).  
**Test-Created Records:** None (`0` created; `0` cleanup required). Pre-existing `In Chair` entry preserved untouched.

| Test ID | Scenario | Expected Result | Actual Result & Exact Blocker | Status |
|---|---|---|---|---|
| `BLK-01` | Live Customer Journey (`/` → `/join` → `/status/:id`) during open hours | Customer joins queue, receives token, and tracks ticket on `/status/:id` | Checked live `/api/public/home` at `23:54 IST`: `is_salon_open: false` (`SALON_CLOSED`, hours `10:00–21:00`). Changing salon hours to bypass closure is prohibited, and no isolated open test environment is configured. | BLOCKED |
| `BLK-02` | Live Customer Lifecycle (transitions, countdown/ETA, Start Coming, Cancel) | Live `Waiting` → `Called` → `In Chair` → `Done`/Cancel updates and timers | Blocked by `SALON_CLOSED` (`23:54 IST`) and absence of authenticated Reception/Staff session to advance entries. | BLOCKED |
| `BLK-03` | Live Open-Hours FCFS, Qualification & Duplicate Prevention | Real DB enforces FCFS, workload assignment, and duplicate phone rejection | Blocked by `SALON_CLOSED` (`23:54 IST`) and no separate isolated test database. (Closed-salon `409` & validation `400` already verified live; open-hours RPCs verified in `milestone1.test.js`.) | BLOCKED |
| `BLK-04` | Live Reception Authentication & Workflow (`/reception`) | Sign in with Reception PIN, call/start/complete/no-show/cancel/walk-in/correct | No pre-authenticated Reception browser session is present, and plaintext PIN is unavailable/prohibited from being exposed or requested. (Covered by `milestone2.test.js`.) | BLOCKED |
| `BLK-05` | Live Staff Authentication & Workflow (`/barber/:name`) | Sign in on stylist route, verify zero-PII and permitted transitions | No pre-authenticated Staff browser session is present, and plaintext PIN is unavailable/prohibited from being exposed or requested. (Covered by `milestone2.test.js`.) | BLOCKED |
| `BLK-06` | Live Owner Authentication, Management & Active-Service Invariant (`/admin`) | Sign in as Owner, edit service/staff/settings, verify invariant rollback | No pre-authenticated Owner browser session is present, and Owner password is unavailable/prohibited from being exposed or requested. (Covered by `owner.test.js`.) | BLOCKED |
| `BLK-07` | Live Multi-Client Realtime Propagation (`celeste:live`) | Queue/staff mutations in one browser client propagate live to a second client without PII | Requires open salon hours (`10:00–21:00 IST`) and/or authenticated Reception/Staff/Owner sessions to trigger permitted mutations. | BLOCKED |
| `BLK-08` | Live Open-Hours Concurrency & Race Conditions | Simultaneous open-hours joins/mutations enforce uniqueness and capacity | Requires open salon hours (`10:00–21:00 IST`) and an isolated test environment. (Closed-salon concurrent joins verified `409`/`409`.) | BLOCKED |

### Task 4B Final Acceptance Verdict

**READY WITH DOCUMENTED LIMITATIONS**

All 8 previously blocked live E2E scenarios (`BLK-01`–`BLK-08`) remain **BLOCKED** for genuine environmental and credential-protection reasons (live salon closed at `23:54 IST`, no separate isolated test environment, and no plaintext PIN/Owner password available without violating secret-protection rules). All 65 executed checks (23 automated tests, 22 live API/security probes, 16 browser/responsive checks, 4 build/syntax/i18n/secret checks) passed with 0 failures and 0 unresolved Critical or High defects.

---

## 7. Master Task 5 — Future Appointments & Professor Demo Access Verification

**Execution Timestamp:** 2026-11-26 00:11 IST

- **Automated Tests (`backend/tests/appointments_demo.test.js` + existing 4 suites):** `26/26` passed (`0` failed), covering future slot calculation, closed-day handling, past-date rejection, overlap prevention, lookup/cancel, Reception check-in, duplicate check-in block, Owner zero-PII appointments, and `DEMO_ACCESS_ENABLED=false` (403) vs `DEMO_ACCESS_ENABLED=true` (signed cookie, zero secrets).
- **Production Build & Quality Checks:** `npm --prefix frontend run build` passed (`2240` modules), `331/331` EN/GU translation parity passed, zero-secret scan passed across `frontend/src` and `frontend/dist`.
- **Browser Verification (`http://localhost:5173/` and `/appointments`):** Passed at `375x812` and `1440x900` in English and Gujarati (`0px` horizontal overflow, `0` console errors). `GET /api/appointments/slots` returned `503` in the live environment because `009_appointments.sql` has not yet been applied in Supabase SQL Editor and the local backend process has not yet been restarted; UI handled the `503` gracefully.

---

## 8. Task 5 Finalization — Activation & Verification Status

**Execution Timestamp:** 2026-11-26 00:14 IST

- **Migration 009 Status:** **PENDING MANUAL EXECUTION** — Live read-only check confirmed `public.appointments` (`PGRST205`) and `book_appointment` (`PGRST202`) are not yet applied in Supabase. `supabase/migrations/009_appointments.sql` and `supabase/verification/verify_migration_9.sql` are ready for execution in Supabase SQL Editor.
- **Demo Configuration Status:** Live `GET /api/auth/demo-config` returned `{"enabled":false,"hasPinDemo":false,"hasOwnerDemo":false}`. Live `POST /api/auth/demo/pin-login` and `POST /api/auth/demo/owner-login` both returned `403` (fail-closed when disabled).
- **Appointment Auth Boundaries (Live):** `GET /api/reception/appointments`, `POST /api/reception/appointments/:id/check-in`, `GET /api/owner/appointments`, and `POST /api/owner/appointments/:id/cancel` all returned `401` when unauthenticated.
- **Live Appointment Acceptance & 7-Role Demo Walkthrough:** **BLOCKED** pending manual execution of `009_appointments.sql` in Supabase SQL Editor and configuration of `DEMO_ACCESS_ENABLED=true` + dedicated demo credentials in local `.env`.
- **Final Verdict:** **READY WITH DOCUMENTED LIMITATIONS** (`26/26` automated tests pass, `331/331` EN/GU parity passes, production build passes, `0` secrets in frontend/bundle, fail-closed security verified live).


---

## 9. Final Comprehensive QA & Submission Readiness Pass

**Execution Timestamp:** 2026-11-26 01:47 IST  
**Live Environment:** `http://localhost:5173` (Vite) + `http://localhost:5187` (Express) + Cloud Supabase (Migrations `001`–`009` active)

- **Migration 009 Confirmed Active:** Live read-only Supabase checks verified `public.appointments` exists and `public.book_appointment` RPC is live (`22023` parameter validation response).
- **Live Browser & Responsive Audit (`375x812`, `390x844`, `768x1024`, `1440x900`, `1920x1080`):**
  - Public routes `/`, `/join`, `/appointments` (live `GET /api/appointments/slots` HTTP 200), `/status/bad-id`, and `/display` passed with `0px` horizontal overflow, zero console/page errors, zero HTTP 4xx/5xx responses, and verified EN/GU switching.
  - Authenticated routes `/reception`, `/barber/aarav`, `/barber/meera` (plus PIN gates on `kabir`, `riya`, `ananya`), and `/admin` passed using the prefilled original login forms, verified zero phone PII in Stylist view, and signed out cleanly.
- **Automated Tests & Build:** `26/26` automated tests passed across all 5 test files, `npm --prefix frontend run build` passed, backend `node --check` passed, and secret scans found `0` exposed credentials in `frontend/src`, `frontend/dist`, and `submission/`.
- **Submission Package:** Assembled clean `submission/` package containing `README.md`, `docs/`, `supabase/`, `screenshots/` (7 verified live screenshots), and `src/` (excluding `node_modules`, `dist`, and `.env`).
