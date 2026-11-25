-- ============================================================================
-- CELESTE — Salon Queue Management System
-- Migration 001b: Table & View Permission Hardening
-- Aligns database privileges with docs/04-database-design.md Section 6.1
--
-- Notes:
--   - Does not modify Migration 1 (001_schema_and_indexes.sql).
--   - Idempotent: safe to run repeatedly.
--   - Does not alter RLS policies (planned for Migration 3), sequences,
--     functions, or schema-wide ALTER DEFAULT PRIVILEGES.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. PRIVATE OBJECTS: Zero privileges for PUBLIC, anon, and authenticated
--    Preserve required backend DML/read privileges for service_role.
-- ---------------------------------------------------------------------------
REVOKE ALL PRIVILEGES ON TABLE
  public.customers,
  public.queue_entries,
  public.queue_entry_services,
  public.queue_status_history,
  public.pin_auth_attempts,
  public.daily_queue_statistics
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.customers,
  public.queue_entries,
  public.queue_entry_services,
  public.queue_status_history,
  public.pin_auth_attempts
TO service_role;

GRANT SELECT ON TABLE
  public.daily_queue_statistics
TO service_role;

-- ---------------------------------------------------------------------------
-- 2. PUBLIC READ-ONLY TABLES: Revoke all excessive privileges first,
--    then grant SELECT-only to anon and authenticated.
--    Preserve required backend DML privileges for service_role.
-- ---------------------------------------------------------------------------
REVOKE ALL PRIVILEGES ON TABLE
  public.services,
  public.staff,
  public.staff_services,
  public.salon_settings
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE
  public.services,
  public.staff,
  public.staff_services,
  public.salon_settings
TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.services,
  public.staff,
  public.staff_services,
  public.salon_settings
TO service_role;
