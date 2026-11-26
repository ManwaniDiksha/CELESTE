# CELESTE — Curated Development Prompts Log

A concise, chronological record of the key prompts, architectural decisions, significant revisions, bug fixes, and deployment milestones that shaped the **CELESTE Salon Queue Management System**.

> **Legend:** Entries marked **Original Prompt** preserve the original prompt wording (with minor repetitive checklists trimmed as `[...]`). Entries marked **Existing Summary** preserve the prompt summaries previously recorded in `prompts.md`. Entries marked **Reconstructed Summary** are evidence-based summaries reconstructed from repository artifacts where the exact original prompt text is unavailable.

## Table of Contents

1. [Initial Project Inspection & Documentation Setup](#1-initial-project-inspection--documentation-setup)
2. [Documentation Clarifications (Queue Rules & Service Timer)](#2-documentation-clarifications-queue-rules--service-timer)
3. [Phase 1: Project Setup & Vercel/CORS Corrections](#3-phase-1-project-setup--vercelcors-corrections)
4. [Database Architecture, Security Review & Design Revisions](#4-database-architecture-security-review--design-revisions)
5. [Migration 1, Live Permission Hardening (`001b`/`001c`) & Supabase Role Constraint](#5-migration-1-live-permission-hardening-001b001c--supabase-role-constraint)
6. [Migrations `002`–`006`: Queue RPCs, RLS, Seed Data & PIN Rate-Limiting](#6-migrations-002006-queue-rpcs-rls-seed-data--pin-rate-limiting)
7. [Backend Foundation, Public/Customer APIs & Reception/Staff APIs (`007`)](#7-backend-foundation-publiccustomer-apis--receptionstaff-apis-007)
8. [Master 7-Screen Frontend Implementation & Visual Direction (with Reverted Photography Pass)](#8-master-7-screen-frontend-implementation--visual-direction-with-reverted-photography-pass)
9. [Critical Bug Fixes: Reception KPI Accessibility & Staff PIN Login Persistence](#9-critical-bug-fixes-reception-kpi-accessibility--staff-pin-login-persistence)
10. [Owner Management Module (`008`) & Full Application Integration](#10-owner-management-module-008--full-application-integration)
11. [Production Readiness & E2E Acceptance Testing (Including Blocked Live E2E Follow-Up)](#11-production-readiness--e2e-acceptance-testing-including-blocked-live-e2e-follow-up)
12. [Future Appointments (`009`) & Professor Demo Access Revisions](#12-future-appointments-009--professor-demo-access-revisions)
13. [Final QA, GitHub Submission, Vercel Deployment & Documentation Finalization](#13-final-qa-github-submission-vercel-deployment--documentation-finalization)

---

## 1. Initial Project Inspection & Documentation Setup

**Date:** `2026-11-25 ~01:25 IST` *(Approximate)* · **Type:** Reconstructed Summary *(exact prompt unavailable)*

- **Summary:** Initial project inspection and documentation setup establishing CELESTE's academic scope, Fresh Modern Luxury brand identity, 7-screen specification, and AI collaboration rules across `AGENTS.md`, `docs/01-brief.md`, `docs/02-screens.md`, and `docs/03-flows-rules.md`.
- **Evidence:** The `01:31 IST` entry opens with *"We have reviewed your inspection report and approved the following clarifications for CELESTE"*, referencing those pre-existing specification documents.

---

## 2. Documentation Clarifications (Queue Rules & Service Timer)

**Date:** `2026-11-25 01:31 IST` · **Type:** Original Prompt

```text
We have reviewed your inspection report and approved the following clarifications for CELESTE.
Please update the existing documentation to reflect these decisions consistently.

1. Any Available Stylist — Immediate Assignment
- Assign a specific eligible staff member immediately when the customer joins the queue.
- Exclude staff who are off duty or on break.
- Select the eligible staff member with the lightest workload.
- If workloads are tied, select the staff member who has been available longest.
- The assignment remains unchanged if that staff member subsequently goes on break.
- Never silently reassign the customer.
Remove or correct wording suggesting that these customers remain unassigned until Call Next.

2. No-show Rule
- A customer can only be marked No-show after being Called.
- The customer has 10 minutes to arrive.
- Reception can mark No-show only after the 10-minute window expires.
- Waiting customers must not have a No-show action.

3. Start Coming Acknowledgement
When a customer reaches position 2 in their assigned queue:
- Show the Start Coming button.
- When clicked, record the acknowledgement.
- Show Customer on the way on the Reception Dashboard.
- Do not change queue position or FCFS priority.
- Do not automatically mark the customer as arrived.

4. Staff Service Timer
The Staff View must display:
- Total service duration.
- Elapsed service time.
- Estimated remaining service time.
```

- **Outcome:** Updated `docs/02-screens.md` and `docs/03-flows-rules.md` without writing application code.

---

## 3. Phase 1: Project Setup & Vercel/CORS Corrections

**Date:** `2026-11-25 01:38–02:19 IST` · **Type:** Original Prompts *(Combined)*

```text
We are beginning PHASE 1: PROJECT SETUP for the CELESTE Salon Queue Management System.
[...]
OBJECTIVE: Set up the initial application foundation only.
TECHNOLOGY STACK:
- Frontend: React + Vite, JavaScript (JSX, not TypeScript), Tailwind CSS
- Backend: Node.js + Express (Vercel serverless compatibility)
- Database: Supabase PostgreSQL (Phase 2) · Live updates: Supabase Realtime (later phase)
- Deployment: Vercel · Version control: Git + GitHub
TASKS:
1. Create the approved project folder structure.
2. Configure React, Vite, and Tailwind CSS.
3. Set up the Express backend with Vercel serverless compatibility.
4. Add a basic frontend landing page and backend health-check endpoint.
5. Configure the frontend to communicate with the backend using a configurable API base URL.
6. Create a README.md with installation and local development instructions.
```

**Follow-up Correction (`01:49 IST`):**

```text
We are making two small corrections to Phase 1 before approval.
FIX 1 — VERCEL API ROUTING: Ensure that both /api and /api/* requests are routed to the Express serverless entry point. Neither should accidentally fall through to the frontend SPA fallback.
FIX 2 — CORS CONFIGURATION: Configure CORS safely for local frontend development, same-origin requests from the deployed Vercel application, and explicitly configured CORS_ORIGIN. Disallowed cross-origin requests should receive an appropriate 403 response, not a generic 500.
```

- **Outcome:** Scaffolded `frontend/`, `backend/`, `api/index.js`, `vercel.json`, installed `@supabase/supabase-js` (`02:19 IST`), and configured `.env.example` / `frontend/.env.example` without secrets.

---

## 4. Database Architecture, Security Review & Design Revisions

**Date:** `2026-11-25 02:34–03:00 IST` · **Type:** Original Prompts *(Combined)*

```text
We are beginning Phase 2: Database Design for CELESTE.
Act as a senior database architect. Design a complete PostgreSQL database schema for our Salon Queue Management System using Supabase.
**Your task is DESIGN ONLY. Do not execute SQL, create tables, modify the Supabase database, install packages, or change application code.**
```

**Key Design Revisions (`02:41–03:00 IST`):**

```text
Revise your previously proposed CELESTE database design using all the decisions below:
- SPECIFIC STYLIST ON BREAK: Block queue confirmation if the selected stylist is on break or off duty; never silently reassign.
- OWNER AUTHENTICATION: Use Supabase Auth (Email + Password) with server-assigned app_metadata.role = 'owner'.
- RECEPTION & STAFF AUTHENTICATION: Shared PIN verified on the backend with secure password hashing and rate limiting.
- END-OF-DAY QUEUE CLEANUP: Automatically mark unfinished Waiting/Called entries as Cancelled (actor = 'system') in Asia/Kolkata without modifying staff availability.
- RESET DEMO DATA: Delete only today's queue entries where is_demo = TRUE; preserve genuine and historical records.
- CUSTOMER PRIVACY: Keep customer names and phone numbers in the private customers table; never expose PII through public Realtime subscriptions.
- SECURITY DEFINER FUNCTIONS: Restrict search_path, grant EXECUTE to service_role only, and revoke from PUBLIC, anon, and authenticated.
- NEW-DAY STAFF INIT & MY STATUS: Guarantee atomic, idempotent initialize_new_day_staff_availability() per IST day; access /status/:id via unguessable UUID without phone verification.
```

- **Outcome:** Consolidated the approved 9-table + `daily_queue_statistics` view architecture into `docs/04-database-design.md` and aligned `docs/03-flows-rules.md`.

---

## 5. Migration 1, Live Permission Hardening (`001b`/`001c`) & Supabase Role Constraint

**Date:** `2026-11-25 03:06–14:55 IST` · **Type:** Original Prompts *(Combined, including significant revision)*

```text
We are beginning CELESTE Database Phase 1 — Migration 1.
Create the first Supabase PostgreSQL migration file (001_schema_and_indexes.sql) with all 9 tables, constraints, indexes, generated token_display, and daily_queue_statistics view.
```

**Significant Corrections & Unsuccessful Attempt (`13:31–14:55 IST`):**
- Fixed `token_display` truncation for `token_number >= 100` (`CASE` + `LPAD`) and reconciled the explicit index count (`11` explicit + `15` constraint-backed).
- Fixed `/rest/v1` path suffix in local `.env` `SUPABASE_URL` / `VITE_SUPABASE_URL` after live PostgREST verification returned `404 PGRST125`.
- Live database inspection revealed Supabase's default ACLs granted `anon` and `authenticated` `ALL` privileges on all 9 tables and `daily_queue_statistics`, prompting `001b_permission_hardening.sql`.
- **Unsuccessful Attempt → Revision (`001c_default_privilege_hardening.sql`):** Initial `001c` drafts included `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin` (plus a `GROUP BY d.defaclacl` error in `verify_default_privileges.sql`). Managed Supabase rejected altering `supabase_admin` defaults, leading to the final correction:

```text
Correct Migration 001c and its verification script based on Supabase's documented restriction on modifying supabase_admin default privileges.
Keep ONLY these four statements:
- postgres schema-specific TABLES revocation in public
- postgres schema-specific SEQUENCES revocation in public
- postgres schema-specific FUNCTIONS EXECUTE revocation in public
- postgres GLOBAL FUNCTIONS EXECUTE revocation from PUBLIC
Remove all ALTER DEFAULT PRIVILEGES statements targeting supabase_admin.
```

- **Outcome:** Created and statically verified `001_schema_and_indexes.sql`, `001b_permission_hardening.sql`, `001c_default_privilege_hardening.sql`, and their read-only `supabase/verification/` scripts.

---

## 6. Migrations `002`–`006`: Queue RPCs, RLS, Seed Data & PIN Rate-Limiting

**Date:** `2026-11-25 15:06–17:45 IST` · **Type:** Original Prompt (`002`) + Reconstructed Summaries (`003`–`006`)

```text
We are beginning CELESTE Migration 2 — Database Functions, Procedures and Triggers.
[...]
Before writing SQL: Check every referenced table, column, constraint, and signature against Migration 001. Do not invent missing function signatures, columns, return types, or business rules. If a necessary detail is genuinely missing, stop and report that specific issue before implementing.
```

- **Pre-Implementation Stop (`15:07 IST`) → Approved Implementation (`15:11 IST`):** Stopped to obtain approval for RPC return contracts (`JSONB {success, data, message}`), `operating_hours` JSONB format, `set_staff_duty` rules, and singleton-first lock ordering, then created `002_queue_functions.sql` (3 trigger functions, 8 triggers, 14 `SECURITY DEFINER` RPCs) and `verify_migration_2.sql`.
- **Migrations `003`–`006` *(Reconstructed Summaries — exact prompts unavailable)*:**
  - `003_security_rls_and_realtime.sql`: Enabled RLS on all 9 tables (Deny-All on 5 private tables; `SELECT`-only on 4 public zero-PII tables) and added only the 4 public tables to `supabase_realtime`.
  - `004_seed_data.sql`: Seeded `salon_settings`, 33 bilingual services, 5 stylists (`aarav`, `meera`, `kabir`, `riya`, `ananya`), 140 qualifications, and `is_demo = TRUE` queue fixtures.
  - `005_pin_auth_functions.sql`: Added atomic `SECURITY DEFINER` PIN lockout and rate-limiting RPCs (`check_pin_auth_lockout`, `record_pin_auth_failure`, `reset_pin_auth_attempts`).
  - `006_private_table_privilege_hardening.sql`: Revoked excess `MAINTAIN`, `REFERENCES`, `TRIGGER`, and `TRUNCATE` privileges from `service_role` on the 5 private tables.

---

## 7. Backend Foundation, Public/Customer APIs & Reception/Staff APIs (`007`)

**Date:** `2026-11-25 17:46–20:04 IST` · **Type:** Existing Summaries *(Combined)*

```text
Stage 1 — Backend Foundation (17:46 IST):
Implement the previously reviewed and approved Stage 1: Backend Foundation in the existing repository (local port 5187, env validation, scrypt PIN hashing, signed HttpOnly celeste_staff_session cookies, IP HMAC rate-limit keys, CORS & security headers, auth middleware, /api/auth routes using Migration 005 RPCs, and zero-PII celeste:live Realtime helper).

Stage 2, Milestone 1 (19:39 IST):
Implement shared queue calculation service (Asia/Kolkata operating status, FCFS ordering, dynamic ETA, Any Available preview), public endpoints (/api/public/*), and customer queue endpoints (/api/queue/*).

Stage 2, Milestone 2 & Additive Migration 007 (19:59–20:04 IST):
Implement /api/reception/* and /api/staff/:slug/* APIs with mocked unit/route tests. Prepare additive Migration 007 (007_queue_correction_and_actor_attribution.sql) for atomic correct_queue_entry (Waiting only) and Reception vs Staff audit actor attribution.
```

- **Outcome:** Built the Express backend (`backend/src/`), `007_queue_correction_and_actor_attribution.sql`, and mocked test suites (`milestone1.test.js`, `milestone2.test.js`). *(Note: an unlogged Stage 1 backend planning/review prompt preceded `17:46 IST`.)*

---

## 8. Master 7-Screen Frontend Implementation & Visual Direction (with Reverted Photography Pass)

**Date:** `2026-11-25 20:15–21:16 IST` · **Type:** Existing Summaries *(Combined, including reverted attempt)*

```text
Master Frontend Implementation (20:15 IST):
Complete the entire CELESTE frontend across all 7 screens (/, /join, /status/:id, /reception, /barber/:name, /display, /admin) following the Fresh Modern Luxury visual identity, natural EN & GU copy, Lucide icons, and celeste:live Realtime integration.

Boutique Editorial & Visual Iterations (20:30–21:16 IST):
1. Added warm terracotta, muted rose, dusty blue, and warm sand accents across all 7 screens.
2. [Unsuccessful / Reverted Attempt — 20:44–20:55 IST]: Elevated customer screens with 5 local Unsplash photographs in frontend/public/images/, then reverted HomePage.jsx, JoinQueuePage.jsx, and MyStatusPage.jsx and deleted all 5 JPEGs to keep the UI photo-free.
3. Refined the approved visual direction using CSS and lightweight inline SVG botanical/ornamental accents only (BohoAccents.jsx) with prefers-reduced-motion support.
```

- **Outcome:** Delivered all 7 responsive screens (`frontend/src/pages/`), bilingual `translations.js`, `useQueueRealtime.js`, and `BohoAccents.jsx` in the approved CSS/SVG bohemian luxury style.

---

## 9. Critical Bug Fixes: Reception KPI Accessibility & Staff PIN Login Persistence

**Date:** `2026-11-25 21:40 IST` · **Type:** Existing Summary

```text
Treat this as a targeted bug-fixing and usability task. Do not redesign the application.
ISSUE 1: Reception Dashboard KPI Cards Are Unclear and Difficult to Read
ISSUE 2: Staff/Stylist View Immediately Logs Me Out After PIN Login
```

- **Outcome:** Removed oversized/overlapping `BohoCornerFlourish` SVGs from KPI cards, restored high-contrast Deep Sage styling on Daily Revenue, switched local API calls to the same-origin `/api` proxy (fixing `SameSite=Lax` cookie drops), normalized staff slug casing, and added session-persistence tests.

---

## 10. Owner Management Module (`008`) & Full Application Integration

**Date:** `2026-11-25 22:15–23:32 IST` · **Type:** Existing Summaries *(Combined)*

```text
Master Task 1 — Complete Owner Management (22:15 IST):
Complete the Owner Management module end-to-end: database RPCs (008_owner_management_functions.sql enforcing the active-service >= 1 qualified stylist invariant), /api/owner/* routes, Owner provisioning script, /admin CRUD & zero-PII reporting UI, typed-confirmation demo reset, and automated tests.

Master Task 2 — Full Application Integration (23:32 IST):
Inspect and complete integration across all 7 screens, stabilize useQueueRealtime.js subscriptions (staffIdFilterRef), align client/server UUID validation, and verify EN/GU translation parity.
```

- **Outcome:** Created `008_owner_management_functions.sql`, `ownerService.js`, `routes/owner.js`, `OwnerModals.jsx`, `backend/tests/owner.test.js`, and achieved `271/271` EN/GU translation parity with `23/23` passing automated tests.

---

## 11. Production Readiness & E2E Acceptance Testing (Including Blocked Live E2E Follow-Up)

**Date:** `2026-11-25 23:39–23:56 IST` · **Type:** Existing Summaries *(Combined)*

```text
Master Task 3 & Final Master Task 4 / 4B (23:39–23:56 IST):
Prepare CELESTE for production deployment and academic submission (database-driven staff quick-switch, comprehensive README), then validate the live application across all 7 screens, viewports, EN/GU, live API/security probes, and automated regression tests, documenting results in docs/FINAL_TEST_REPORT.md.
```

- **Outcome:** Fixed `BUG-01` (`375x812` mobile header overflow) and `BUG-02` (`<main>` landmarks on `PinGateCard` and `FeedbackStates`). All `65/65` executed checks passed; **8 live authenticated/open-hours E2E scenarios (`BLK-01`–`BLK-08`)** were honestly recorded as `BLOCKED` because testing ran after closing (`23:54 IST`, `SALON_CLOSED`) without exposing plaintext credentials.

---

## 12. Future Appointments (`009`) & Professor Demo Access Revisions

**Date:** `2026-11-26 00:09–01:22 IST` · **Type:** Existing Summaries *(Combined, including UX revision)*

```text
Master Task 5 — Future Appointments & Demo Access (00:09–00:31 IST):
Add future appointment scheduling (009_appointments.sql, /appointments, Reception check-in, Owner overview) usable even when the salon is closed, plus environment-configured Professor Demo Access with strict !isProductionRuntime() guards.

UX Revisions — Unified Panel → Original Form Prefill (01:06–01:22 IST):
1. Consolidated 7 separate demo buttons into one 3-role Professor Demo Access panel.
2. [Final UX Correction]: Remove any separate "Professor Demo Access" container, panel, card, or role selector. Keep the original login forms on /reception, /barber/:name, and /admin intact and prefill their existing fields in local evaluation mode (DEMO_ACCESS_ENABLED=true) via loopback-only GET /api/auth/demo-prefill.
```

- **Outcome:** Delivered `009_appointments.sql`, `BookAppointmentPage.jsx`, `appointments_demo.test.js` (`26/26` total tests passing), removed `DemoAccessPanel.jsx`, and fixed mobile horizontal overflow in `OwnerSettingsPage.jsx`.

---

## 13. Final QA, GitHub Submission, Vercel Deployment & Documentation Finalization

**Date:** `2026-11-26 01:48–15:41 IST` · **Type:** Existing Summary + Reconstructed Summaries + Final Updates

```text
Prompt 34 — Final QA & Submission Readiness (01:48 IST — Existing Summary):
Verify Migration 009 live in Supabase, run 5-viewport browser QA (375x812 to 1920x1080) across all public and prefilled authenticated routes, assemble clean submission artifacts, and verify zero secrets in frontend bundles.
```

- **GitHub & Vercel Deployment *(Reconstructed Summary — `2026-11-26 02:03 IST` to `~15:20 IST`)*:** Initialized Git and pushed commit `182f7f85` (*"Prepare CELESTE for final submission"*), then deployed the single-origin React + Express serverless app to Vercel (`https://celeste-jet.vercel.app/`) connected to Supabase.
- **Final `README.md` & `prompts.md` Submission Updates (`2026-11-26 15:26–15:41 IST` — Original Session):** Added the **Live demo** URL and **Demo Access** table to `README.md`, audited all `README.md` and `prompts.md` artifacts, and curated `prompts.md` into this 13-entry submission record.
