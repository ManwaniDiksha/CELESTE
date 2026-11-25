-- ============================================================================
-- CELESTE — Salon Queue Management System
-- Migration 006: Private Table Privilege Hardening
-- Source of Truth:
--   - supabase/migrations/001_schema_and_indexes.sql
--   - supabase/migrations/001b_permission_hardening.sql
--   - docs/04-database-design.md (Section 6.1)
--
-- Scope & Behaviour:
--   - Target tables (all 5 private Deny-All tables):
--       1. public.customers
--       2. public.queue_entries
--       3. public.queue_entry_services
--       4. public.queue_status_history
--       5. public.pin_auth_attempts
--   - Revokes ONLY the 4 excessive table privileges (MAINTAIN, REFERENCES,
--     TRIGGER, TRUNCATE) inherited from Supabase's default ACL on service_role.
--   - Preserves existing SELECT, INSERT, UPDATE, and DELETE grants on
--     service_role.
--   - Does NOT touch schemas, columns, constraints, indexes, triggers, data,
--     RLS enablement/policies, functions, other roles, default privileges, or
--     any other database objects.
-- ============================================================================

BEGIN;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE
  ON TABLE public.customers
  FROM service_role;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE
  ON TABLE public.queue_entries
  FROM service_role;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE
  ON TABLE public.queue_entry_services
  FROM service_role;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE
  ON TABLE public.queue_status_history
  FROM service_role;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE
  ON TABLE public.pin_auth_attempts
  FROM service_role;

COMMIT;
