-- ============================================================================
-- CELESTE — Salon Queue Management System
-- Migration 001c: Default Privilege Hardening for Role `postgres`
--
-- Scope & Behaviour:
--   - Applies ONLY to FUTURE objects (tables, views, sequences, functions,
--     and procedures) created by role `postgres`.
--   - Includes schema-specific (`public`) revocations plus a global
--     (`defaclnamespace = 0`) function EXECUTE revocation from PUBLIC, because
--     schema-specific REVOKEs cannot override PostgreSQL's global function
--     PUBLIC EXECUTE default.
--   - Does NOT modify `supabase_admin` default privileges (Supabase restricts
--     project role `postgres` from altering `supabase_admin` defaults).
--   - Does NOT modify existing objects (already hardened by Migration 001b).
--   - Does NOT modify `service_role` default privileges.
--   - Does NOT modify Migration 1 (001_schema_and_indexes.sql) or 001b.
--   - Does NOT create or alter RLS policies (planned for Migration 3).
--   - Idempotent: safe to run repeatedly.
-- ============================================================================

-- 1. Future TABLES and VIEWS created by `postgres` in schema `public`
--    (PostgreSQL `ON TABLES` covers both tables and views.)
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC, anon, authenticated;

-- 2. Future SEQUENCES created by `postgres` in schema `public`
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC, anon, authenticated;

-- 3. Future FUNCTIONS and PROCEDURES created by `postgres` in schema `public`
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- 4. Global function defaults (`defaclnamespace = 0`) for `postgres`
--    (Revokes PostgreSQL's built-in global PUBLIC EXECUTE default.)
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
