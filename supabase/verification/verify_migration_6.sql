-- ============================================================================
-- CELESTE — Salon Queue Management System
-- Read-Only Verification Script for Migration 006 (Private Table Privileges)
--
-- SAFETY: Strictly READ-ONLY SELECT queries against pg_catalog.
--         Do not execute any DDL/DML/DCL statements here.
-- ============================================================================

-- ============================================================================
-- QUERY A: Exact Direct ACL Verification (pg_catalog.aclexplode)
--   Confirms that on all 5 private tables:
--     - service_role holds ONLY direct privileges: DELETE, INSERT, SELECT, UPDATE.
--     - service_role has NO grant options (is_grantable = false).
--     - PUBLIC, anon, authenticated, and any other non-owner role have NO
--       direct grants.
-- ============================================================================
WITH expected_tables AS (
  SELECT * FROM (VALUES
    ('customers'),
    ('queue_entries'),
    ('queue_entry_services'),
    ('queue_status_history'),
    ('pin_auth_attempts')
  ) AS t(table_name)
),
direct_acl_summary AS (
  SELECT
    et.table_name,
    cls.oid AS rel_oid,
    pg_catalog.pg_get_userbyid(cls.relowner) AS owner_role,
    MAX(cls.relacl::TEXT) AS raw_relacl_text,
    pg_catalog.string_agg(acl.privilege_type, ', ' ORDER BY acl.privilege_type)
      FILTER (WHERE gr.rolname = 'service_role') AS service_role_direct_privileges,
    pg_catalog.string_agg(acl.privilege_type, ', ' ORDER BY acl.privilege_type)
      FILTER (WHERE gr.rolname = 'service_role' AND acl.is_grantable) AS service_role_grant_options,
    pg_catalog.string_agg(acl.privilege_type, ', ' ORDER BY acl.privilege_type)
      FILTER (WHERE acl.grantee = 0) AS public_direct_privileges,
    pg_catalog.string_agg(acl.privilege_type, ', ' ORDER BY acl.privilege_type)
      FILTER (WHERE gr.rolname = 'anon') AS anon_direct_privileges,
    pg_catalog.string_agg(acl.privilege_type, ', ' ORDER BY acl.privilege_type)
      FILTER (WHERE gr.rolname = 'authenticated') AS authenticated_direct_privileges,
    pg_catalog.string_agg(
      CASE
        WHEN acl.grantee = 0 THEN 'PUBLIC:' || acl.privilege_type
        ELSE COALESCE(gr.rolname, acl.grantee::TEXT) || ':' || acl.privilege_type
      END,
      ', ' ORDER BY acl.grantee, acl.privilege_type
    ) FILTER (
      WHERE acl.privilege_type IS NOT NULL
        AND (
          acl.grantee = 0
          OR (
            acl.grantee <> cls.relowner
            AND COALESCE(gr.rolname, '') <> 'service_role'
          )
        )
    ) AS unexpected_direct_grants,
    pg_catalog.string_agg(
      COALESCE(gr.rolname, acl.grantee::TEXT) || ':' || acl.privilege_type,
      ', ' ORDER BY acl.grantee, acl.privilege_type
    ) FILTER (
      WHERE acl.privilege_type IS NOT NULL
        AND acl.grantee <> 0
        AND acl.grantee <> cls.relowner
        AND acl.is_grantable
    ) AS unexpected_grant_options
  FROM expected_tables AS et
  LEFT JOIN pg_catalog.pg_namespace AS ns
    ON ns.nspname = 'public'
  LEFT JOIN pg_catalog.pg_class AS cls
    ON cls.relnamespace = ns.oid
   AND cls.relkind = 'r'
   AND cls.relname = et.table_name
  LEFT JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(cls.relacl, pg_catalog.acldefault('r'::"char", cls.relowner))
  ) AS acl
    ON cls.oid IS NOT NULL
  LEFT JOIN pg_catalog.pg_roles AS gr
    ON gr.oid = acl.grantee
  GROUP BY et.table_name, cls.oid, cls.relowner
)
SELECT
  table_name,
  (rel_oid IS NOT NULL) AS table_exists,
  owner_role,
  service_role_direct_privileges,
  service_role_grant_options,
  public_direct_privileges,
  anon_direct_privileges,
  authenticated_direct_privileges,
  unexpected_direct_grants,
  unexpected_grant_options,
  raw_relacl_text,
  CASE
    WHEN rel_oid IS NULL
      THEN 'FAIL_MISSING_TABLE'
    WHEN public_direct_privileges IS NOT NULL
      THEN 'FAIL_PUBLIC_DIRECT_GRANT'
    WHEN anon_direct_privileges IS NOT NULL
      OR authenticated_direct_privileges IS NOT NULL
      OR unexpected_direct_grants IS NOT NULL
      THEN 'FAIL_UNEXPECTED_DIRECT_GRANT'
    WHEN service_role_grant_options IS NOT NULL
      OR unexpected_grant_options IS NOT NULL
      THEN 'FAIL_GRANT_OPTION_PRESENT'
    WHEN service_role_direct_privileges IS DISTINCT FROM 'DELETE, INSERT, SELECT, UPDATE'
      THEN 'FAIL_SERVICE_ROLE_ACL_MISMATCH'
    ELSE 'PASS'
  END AS verification_status
FROM direct_acl_summary
ORDER BY table_name;

-- ============================================================================
-- QUERY B: Effective Table Permissions Verification (has_table_privilege)
--   Confirms on all 5 private tables across all 8 PostgreSQL 17 privileges:
--     - service_role CAN SELECT, INSERT, UPDATE, DELETE.
--     - service_role CANNOT TRUNCATE, REFERENCES, TRIGGER, or MAINTAIN.
--     - anon and authenticated have ZERO effective privileges across all 8.
-- ============================================================================
WITH expected_tables AS (
  SELECT * FROM (VALUES
    ('customers'),
    ('queue_entries'),
    ('queue_entry_services'),
    ('queue_status_history'),
    ('pin_auth_attempts')
  ) AS t(table_name)
),
target_tables AS (
  SELECT
    et.table_name,
    cls.oid AS rel_oid
  FROM expected_tables AS et
  LEFT JOIN pg_catalog.pg_namespace AS ns
    ON ns.nspname = 'public'
  LEFT JOIN pg_catalog.pg_class AS cls
    ON cls.relnamespace = ns.oid
   AND cls.relkind = 'r'
   AND cls.relname = et.table_name
),
effective_flags AS (
  SELECT
    tt.table_name,
    tt.rel_oid,
    CASE WHEN tt.rel_oid IS NOT NULL THEN pg_catalog.has_table_privilege('service_role',  tt.rel_oid, 'SELECT')     END AS sr_select,
    CASE WHEN tt.rel_oid IS NOT NULL THEN pg_catalog.has_table_privilege('service_role',  tt.rel_oid, 'INSERT')     END AS sr_insert,
    CASE WHEN tt.rel_oid IS NOT NULL THEN pg_catalog.has_table_privilege('service_role',  tt.rel_oid, 'UPDATE')     END AS sr_update,
    CASE WHEN tt.rel_oid IS NOT NULL THEN pg_catalog.has_table_privilege('service_role',  tt.rel_oid, 'DELETE')     END AS sr_delete,
    CASE WHEN tt.rel_oid IS NOT NULL THEN pg_catalog.has_table_privilege('service_role',  tt.rel_oid, 'TRUNCATE')   END AS sr_truncate,
    CASE WHEN tt.rel_oid IS NOT NULL THEN pg_catalog.has_table_privilege('service_role',  tt.rel_oid, 'REFERENCES') END AS sr_references,
    CASE WHEN tt.rel_oid IS NOT NULL THEN pg_catalog.has_table_privilege('service_role',  tt.rel_oid, 'TRIGGER')    END AS sr_trigger,
    CASE WHEN tt.rel_oid IS NOT NULL THEN pg_catalog.has_table_privilege('service_role',  tt.rel_oid, 'MAINTAIN')   END AS sr_maintain,
    CASE WHEN tt.rel_oid IS NOT NULL THEN pg_catalog.has_table_privilege('anon',          tt.rel_oid, 'SELECT')     END AS anon_select,
    CASE WHEN tt.rel_oid IS NOT NULL THEN pg_catalog.has_table_privilege('anon',          tt.rel_oid, 'INSERT')     END AS anon_insert,
    CASE WHEN tt.rel_oid IS NOT NULL THEN pg_catalog.has_table_privilege('anon',          tt.rel_oid, 'UPDATE')     END AS anon_update,
    CASE WHEN tt.rel_oid IS NOT NULL THEN pg_catalog.has_table_privilege('anon',          tt.rel_oid, 'DELETE')     END AS anon_delete,
    CASE WHEN tt.rel_oid IS NOT NULL THEN pg_catalog.has_table_privilege('anon',          tt.rel_oid, 'TRUNCATE')   END AS anon_truncate,
    CASE WHEN tt.rel_oid IS NOT NULL THEN pg_catalog.has_table_privilege('anon',          tt.rel_oid, 'REFERENCES') END AS anon_references,
    CASE WHEN tt.rel_oid IS NOT NULL THEN pg_catalog.has_table_privilege('anon',          tt.rel_oid, 'TRIGGER')    END AS anon_trigger,
    CASE WHEN tt.rel_oid IS NOT NULL THEN pg_catalog.has_table_privilege('anon',          tt.rel_oid, 'MAINTAIN')   END AS anon_maintain,
    CASE WHEN tt.rel_oid IS NOT NULL THEN pg_catalog.has_table_privilege('authenticated', tt.rel_oid, 'SELECT')     END AS auth_select,
    CASE WHEN tt.rel_oid IS NOT NULL THEN pg_catalog.has_table_privilege('authenticated', tt.rel_oid, 'INSERT')     END AS auth_insert,
    CASE WHEN tt.rel_oid IS NOT NULL THEN pg_catalog.has_table_privilege('authenticated', tt.rel_oid, 'UPDATE')     END AS auth_update,
    CASE WHEN tt.rel_oid IS NOT NULL THEN pg_catalog.has_table_privilege('authenticated', tt.rel_oid, 'DELETE')     END AS auth_delete,
    CASE WHEN tt.rel_oid IS NOT NULL THEN pg_catalog.has_table_privilege('authenticated', tt.rel_oid, 'TRUNCATE')   END AS auth_truncate,
    CASE WHEN tt.rel_oid IS NOT NULL THEN pg_catalog.has_table_privilege('authenticated', tt.rel_oid, 'REFERENCES') END AS auth_references,
    CASE WHEN tt.rel_oid IS NOT NULL THEN pg_catalog.has_table_privilege('authenticated', tt.rel_oid, 'TRIGGER')    END AS auth_trigger,
    CASE WHEN tt.rel_oid IS NOT NULL THEN pg_catalog.has_table_privilege('authenticated', tt.rel_oid, 'MAINTAIN')   END AS auth_maintain
  FROM target_tables AS tt
)
SELECT
  table_name,
  (rel_oid IS NOT NULL) AS table_exists,
  sr_select,
  sr_insert,
  sr_update,
  sr_delete,
  sr_truncate,
  sr_references,
  sr_trigger,
  sr_maintain,
  (anon_select OR anon_insert OR anon_update OR anon_delete OR anon_truncate OR anon_references OR anon_trigger OR anon_maintain) AS anon_any_privilege,
  (auth_select OR auth_insert OR auth_update OR auth_delete OR auth_truncate OR auth_references OR auth_trigger OR auth_maintain) AS auth_any_privilege,
  CASE
    WHEN rel_oid IS NULL
      THEN 'FAIL_MISSING_TABLE'
    WHEN anon_select OR anon_insert OR anon_update OR anon_delete OR anon_truncate OR anon_references OR anon_trigger OR anon_maintain
      OR auth_select OR auth_insert OR auth_update OR auth_delete OR auth_truncate OR auth_references OR auth_trigger OR auth_maintain
      THEN 'FAIL_BROWSER_ROLE_EFFECTIVE_PRIVILEGE'
    WHEN NOT (sr_select AND sr_insert AND sr_update AND sr_delete)
      THEN 'FAIL_SERVICE_ROLE_MISSING_DML'
    WHEN sr_truncate OR sr_references OR sr_trigger OR sr_maintain
      THEN 'FAIL_SERVICE_ROLE_EXCESSIVE_EFFECTIVE_PRIVILEGE'
    ELSE 'PASS'
  END AS verification_status
FROM effective_flags
ORDER BY table_name;

-- ============================================================================
-- QUERY C: RLS & Policy Preservation Verification
--   Confirms RLS remains enabled and policy_count = 0 on all 5 private tables.
-- ============================================================================
WITH expected_tables AS (
  SELECT * FROM (VALUES
    ('customers'),
    ('queue_entries'),
    ('queue_entry_services'),
    ('queue_status_history'),
    ('pin_auth_attempts')
  ) AS t(table_name)
),
rls_summary AS (
  SELECT
    et.table_name,
    cls.oid AS rel_oid,
    cls.relrowsecurity AS rls_enabled,
    COUNT(pol.oid)::INTEGER AS policy_count
  FROM expected_tables AS et
  LEFT JOIN pg_catalog.pg_namespace AS ns
    ON ns.nspname = 'public'
  LEFT JOIN pg_catalog.pg_class AS cls
    ON cls.relnamespace = ns.oid
   AND cls.relkind = 'r'
   AND cls.relname = et.table_name
  LEFT JOIN pg_catalog.pg_policy AS pol
    ON pol.polrelid = cls.oid
  GROUP BY et.table_name, cls.oid, cls.relrowsecurity
)
SELECT
  table_name,
  (rel_oid IS NOT NULL) AS table_exists,
  rls_enabled,
  policy_count,
  CASE
    WHEN rel_oid IS NULL THEN 'FAIL_MISSING_TABLE'
    WHEN rls_enabled IS DISTINCT FROM true THEN 'FAIL_RLS_DISABLED'
    WHEN policy_count <> 0 THEN 'FAIL_UNEXPECTED_RLS_POLICY'
    ELSE 'PASS'
  END AS verification_status
FROM rls_summary
ORDER BY table_name;

-- ============================================================================
-- QUERY D: Structural Preservation (Existence Check Without Invented Schemas)
--   Confirms all 5 private tables still exist as ordinary tables in public.
-- ============================================================================
WITH expected_tables AS (
  SELECT * FROM (VALUES
    ('customers'),
    ('queue_entries'),
    ('queue_entry_services'),
    ('queue_status_history'),
    ('pin_auth_attempts')
  ) AS t(table_name)
)
SELECT
  et.table_name,
  (cls.oid IS NOT NULL) AS table_exists,
  cls.relkind::TEXT AS relkind,
  pg_catalog.pg_get_userbyid(cls.relowner) AS owner_role,
  CASE
    WHEN cls.oid IS NOT NULL THEN (
      SELECT COUNT(*)::INTEGER
      FROM pg_catalog.pg_attribute AS a
      WHERE a.attrelid = cls.oid
        AND a.attnum > 0
        AND NOT a.attisdropped
    )
  END AS live_column_count,
  CASE
    WHEN cls.oid IS NULL THEN 'FAIL_MISSING_TABLE'
    ELSE 'PASS'
  END AS verification_status
FROM expected_tables AS et
LEFT JOIN pg_catalog.pg_namespace AS ns
  ON ns.nspname = 'public'
LEFT JOIN pg_catalog.pg_class AS cls
  ON cls.relnamespace = ns.oid
 AND cls.relkind = 'r'
 AND cls.relname = et.table_name
ORDER BY et.table_name;
