-- ============================================================================
-- Read-Only Verification Script for Migration 009 (Appointments)
-- ============================================================================

-- 1. Verify tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('appointments', 'appointment_services')
ORDER BY table_name;

-- 2. Verify RLS is enabled and 0 permissive policies exist for anon/authenticated
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('appointments', 'appointment_services');

SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('appointments', 'appointment_services');

-- 3. Verify RPCs exist with SECURITY DEFINER and restricted search_path
SELECT p.proname, p.prosecdef, p.proconfig
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'book_appointment',
    'cancel_appointment',
    'check_in_appointment',
    'mark_appointment_no_show',
    'sync_appointment_on_queue_complete'
  )
ORDER BY p.proname;
