-- ============================================================================
-- CELESTE — Salon Queue Management System
-- Read-Only Default Privilege Verification Script (Migration 001c)
--
-- SAFETY: Strictly READ-ONLY SELECT queries against pg_catalog.
--         Do not execute any DDL/DML/DCL statements here.
-- ============================================================================

-- ============================================================================
-- QUERY 1: Enforceable Default Privilege Verification for `postgres`
-- Checks schema-specific (`public`) defaults and global (`<ALL_SCHEMAS>`)
-- function EXECUTE defaults for `postgres`. Confirms PUBLIC, anon, and
-- authenticated have no defaults, global PUBLIC EXECUTE is explicitly revoked,
-- and service_role defaults remain intact.
-- ============================================================================
WITH expected_targets AS (
  SELECT * FROM (VALUES
    ('postgres', 'SCHEMA', 'public',        'r'::"char", 'tables_and_views'),
    ('postgres', 'SCHEMA', 'public',        'S'::"char", 'sequences'),
    ('postgres', 'SCHEMA', 'public',        'f'::"char", 'functions_and_procedures'),
    ('postgres', 'GLOBAL', '<ALL_SCHEMAS>', 'f'::"char", 'functions_and_procedures')
  ) AS t(defacl_owner, scope, schema_name, defaclobjtype, object_type_label)
),
postgres_defacl AS (
  SELECT
    pg_catalog.pg_get_userbyid(d.defaclrole) AS defacl_owner,
    CASE WHEN d.defaclnamespace = 0 THEN 'GLOBAL' ELSE 'SCHEMA' END AS scope,
    COALESCE(ns.nspname, '<ALL_SCHEMAS>') AS schema_name,
    d.defaclobjtype,
    MAX(d.defaclacl::TEXT) AS raw_default_acl,
    pg_catalog.string_agg(acl.privilege_type, ', ' ORDER BY acl.privilege_type)
      FILTER (WHERE acl.grantee = 0) AS public_default_privileges,
    pg_catalog.string_agg(acl.privilege_type, ', ' ORDER BY acl.privilege_type)
      FILTER (WHERE CASE WHEN acl.grantee <> 0 THEN acl.grantee::regrole::TEXT END = 'anon') AS anon_default_privileges,
    pg_catalog.string_agg(acl.privilege_type, ', ' ORDER BY acl.privilege_type)
      FILTER (WHERE CASE WHEN acl.grantee <> 0 THEN acl.grantee::regrole::TEXT END = 'authenticated') AS authenticated_default_privileges,
    pg_catalog.string_agg(acl.privilege_type, ', ' ORDER BY acl.privilege_type)
      FILTER (WHERE CASE WHEN acl.grantee <> 0 THEN acl.grantee::regrole::TEXT END = 'service_role') AS service_role_default_privileges
  FROM pg_catalog.pg_default_acl AS d
  LEFT JOIN pg_catalog.pg_namespace AS ns
    ON ns.oid = d.defaclnamespace
  LEFT JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) AS acl
    ON true
  WHERE pg_catalog.pg_get_userbyid(d.defaclrole) = 'postgres'
    AND (ns.nspname = 'public' OR d.defaclnamespace = 0)
    AND d.defaclobjtype IN ('r', 'S', 'f')
  GROUP BY d.defaclrole, d.defaclnamespace, ns.nspname, d.defaclobjtype
),
global_func_status AS (
  SELECT
    e.defacl_owner,
    (a.defacl_owner IS NOT NULL AND a.public_default_privileges IS NULL) AS global_public_execute_revoked
  FROM expected_targets AS e
  LEFT JOIN postgres_defacl AS a
    ON a.defacl_owner = e.defacl_owner
   AND a.scope = 'GLOBAL'
   AND a.defaclobjtype = 'f'
  WHERE e.scope = 'GLOBAL'
    AND e.defaclobjtype = 'f'
)
SELECT
  e.defacl_owner,
  e.scope,
  e.schema_name,
  e.object_type_label AS object_type,
  (p.defacl_owner IS NOT NULL) AS defacl_row_present,
  p.public_default_privileges,
  p.anon_default_privileges,
  p.authenticated_default_privileges,
  p.service_role_default_privileges,
  g.global_public_execute_revoked,
  p.raw_default_acl,
  CASE
    WHEN p.public_default_privileges IS NOT NULL
      OR p.anon_default_privileges IS NOT NULL
      OR p.authenticated_default_privileges IS NOT NULL
    THEN 'FAIL_EXCESSIVE_DEFAULT_PRIVILEGE'
    WHEN e.defaclobjtype = 'f'
     AND NOT COALESCE(g.global_public_execute_revoked, false)
    THEN 'FAIL_GLOBAL_PUBLIC_EXECUTE_ACTIVE'
    WHEN e.scope = 'GLOBAL' AND e.defaclobjtype = 'f'
     AND COALESCE(g.global_public_execute_revoked, false)
    THEN 'PASS'
    WHEN e.scope = 'SCHEMA' AND e.defaclobjtype = 'r'
     AND p.service_role_default_privileges ~ 'DELETE'
     AND p.service_role_default_privileges ~ 'INSERT'
     AND p.service_role_default_privileges ~ 'SELECT'
     AND p.service_role_default_privileges ~ 'UPDATE'
    THEN 'PASS'
    WHEN e.scope = 'SCHEMA' AND e.defaclobjtype = 'S'
     AND p.service_role_default_privileges ~ 'SELECT'
     AND p.service_role_default_privileges ~ 'UPDATE'
     AND p.service_role_default_privileges ~ 'USAGE'
    THEN 'PASS'
    WHEN e.scope = 'SCHEMA' AND e.defaclobjtype = 'f'
     AND p.service_role_default_privileges ~ 'EXECUTE'
     AND COALESCE(g.global_public_execute_revoked, false)
    THEN 'PASS'
    WHEN p.service_role_default_privileges IS NULL
    THEN 'REVIEW_SERVICE_ROLE_DEFAULT_ABSENT'
    ELSE 'REVIEW_REQUIRED'
  END AS verification_status
FROM expected_targets AS e
LEFT JOIN postgres_defacl AS p
  ON p.defacl_owner = e.defacl_owner
 AND p.scope = e.scope
 AND p.schema_name = e.schema_name
 AND p.defaclobjtype = e.defaclobjtype
LEFT JOIN global_func_status AS g
  ON g.defacl_owner = e.defacl_owner
ORDER BY e.scope, e.object_type_label;

-- ============================================================================
-- QUERY 2: Complete pg_default_acl Audit Across All Owners (Global & `public`)
-- Shows `postgres` (project-enforced) and `supabase_admin` (informational /
-- uncontrollable by project role `postgres`) separately without flagging
-- `supabase_admin` as a failure.
-- ============================================================================
SELECT
  pg_catalog.pg_get_userbyid(d.defaclrole) AS defacl_owner,
  CASE
    WHEN pg_catalog.pg_get_userbyid(d.defaclrole) = 'postgres'
      THEN 'PROJECT_ENFORCED'
    WHEN pg_catalog.pg_get_userbyid(d.defaclrole) = 'supabase_admin'
      THEN 'INFORMATIONAL_PLATFORM_UNCONTROLLABLE'
    ELSE 'INFORMATIONAL_OTHER_OWNER'
  END AS control_scope,
  CASE WHEN d.defaclnamespace = 0 THEN 'GLOBAL' ELSE 'SCHEMA' END AS scope,
  COALESCE(ns.nspname, '<ALL_SCHEMAS>') AS schema_name,
  CASE d.defaclobjtype
    WHEN 'r' THEN 'tables_and_views'
    WHEN 'f' THEN 'functions_and_procedures'
    WHEN 'S' THEN 'sequences'
    WHEN 'T' THEN 'types'
    WHEN 'n' THEN 'schemas'
    ELSE d.defaclobjtype::TEXT
  END AS object_type,
  CASE
    WHEN acl.grantee IS NULL THEN '<NONE>'
    WHEN acl.grantee = 0 THEN 'PUBLIC'
    ELSE acl.grantee::regrole::TEXT
  END AS grantee,
  pg_catalog.string_agg(acl.privilege_type, ', ' ORDER BY acl.privilege_type) AS default_privileges,
  MAX(d.defaclacl::TEXT) AS raw_default_acl
FROM pg_catalog.pg_default_acl AS d
LEFT JOIN pg_catalog.pg_namespace AS ns
  ON ns.oid = d.defaclnamespace
LEFT JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) AS acl
  ON true
WHERE ns.nspname = 'public'
   OR d.defaclnamespace = 0
GROUP BY 1, 2, 3, 4, 5, 6
ORDER BY defacl_owner, scope, schema_name, object_type, grantee;
