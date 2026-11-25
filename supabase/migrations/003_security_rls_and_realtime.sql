-- ============================================================================
-- CELESTE — Salon Queue Management System
-- Migration 003: Row Level Security (RLS), Access Policies, and Realtime
-- Source of Truth: docs/04-database-design.md (Sections 6, 7, and 13)
--
-- Security & Realtime Model:
--   - Enables RLS on all 9 application tables.
--   - 5 private tables (customers, queue_entries, queue_entry_services,
--     queue_status_history, pin_auth_attempts): 0 permissive policies for anon
--     or authenticated (Deny-All; accessed strictly via Express service_role).
--   - 4 public zero-PII tables (services, staff, staff_services, salon_settings):
--     SELECT-only policies for anon and authenticated; writes stay service_role only.
--   - Adds strictly those 4 public zero-PII tables to supabase_realtime safely
--     for reruns; never publishes private or PII tables.
--   - Preserves existing 001b grants on all tables and daily_queue_statistics.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Enable Row Level Security (RLS) on All 9 Application Tables
-- ---------------------------------------------------------------------------

-- 1A. Private tables (Deny-All for anon and authenticated: no policies created)
ALTER TABLE public.customers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_entries        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_entry_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pin_auth_attempts    ENABLE ROW LEVEL SECURITY;

-- 1B. Public zero-PII tables
ALTER TABLE public.services             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_services       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salon_settings       ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. SELECT-Only RLS Policies on the 4 Public Zero-PII Tables
--    Drop/recreate pattern keeps this migration safe to rerun.
--    No INSERT/UPDATE/DELETE policies are created for anon or authenticated.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS services_public_read ON public.services;
CREATE POLICY services_public_read
  ON public.services
  AS PERMISSIVE
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS staff_public_read ON public.staff;
CREATE POLICY staff_public_read
  ON public.staff
  AS PERMISSIVE
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS staff_services_public_read ON public.staff_services;
CREATE POLICY staff_services_public_read
  ON public.staff_services
  AS PERMISSIVE
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS salon_settings_public_read ON public.salon_settings;
CREATE POLICY salon_settings_public_read
  ON public.salon_settings
  AS PERMISSIVE
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- 3. Configure supabase_realtime Publication Safely for Reruns
--    Publishes ONLY the 4 public zero-PII tables; ensures the 5 private tables
--    are never present in supabase_realtime.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_pub_all_tables  BOOLEAN;
  v_public_tables   TEXT[] := ARRAY['services', 'staff', 'staff_services', 'salon_settings'];
  v_private_tables  TEXT[] := ARRAY[
    'customers',
    'queue_entries',
    'queue_entry_services',
    'queue_status_history',
    'pin_auth_attempts'
  ];
  v_table_name      TEXT;
BEGIN
  SELECT pub.puballtables
  INTO v_pub_all_tables
  FROM pg_catalog.pg_publication AS pub
  WHERE pub.pubname = 'supabase_realtime';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PUBLICATION_MISSING: Expected supabase_realtime publication does not exist.'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_pub_all_tables THEN
    RAISE EXCEPTION 'PUBLICATION_FOR_ALL_TABLES: supabase_realtime must not be FOR ALL TABLES because private tables cannot be published.'
      USING ERRCODE = 'P0001';
  END IF;

  FOREACH v_table_name IN ARRAY v_public_tables LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_publication_tables AS pt
      WHERE pt.pubname = 'supabase_realtime'
        AND pt.schemaname = 'public'
        AND pt.tablename = v_table_name
    ) THEN
      EXECUTE pg_catalog.format(
        'ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',
        v_table_name
      );
    END IF;
  END LOOP;

  FOREACH v_table_name IN ARRAY v_private_tables LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_catalog.pg_publication_tables AS pt
      WHERE pt.pubname = 'supabase_realtime'
        AND pt.schemaname = 'public'
        AND pt.tablename = v_table_name
    ) THEN
      EXECUTE pg_catalog.format(
        'ALTER PUBLICATION supabase_realtime DROP TABLE public.%I',
        v_table_name
      );
    END IF;
  END LOOP;
END;
$$;
