-- ============================================================================
-- CELESTE — Salon Queue Management System
-- Read-Only Permission & Default-Privilege Verification Script
--
-- SAFETY: Strictly READ-ONLY SELECT queries against pg_catalog.
--         Do not execute any DDL/DML/DCL statements here.
-- ============================================================================

-- ============================================================================
-- QUERY 1: Effective Privileges (anon, authenticated, service_role) + PUBLIC ACL Check
-- Uses pg_catalog.aclexplode() with grantee = 0 to detect direct PUBLIC grants
-- (PUBLIC is a pseudo-role and is not passed to has_table_privilege()).
-- ============================================================================
WITH target_objects AS (
  SELECT * FROM (VALUES
    ('customers',              'PRIVATE'),
    ('queue_entries',          'PRIVATE'),
    ('queue_entry_services',   'PRIVATE'),
    ('queue_status_history',   'PRIVATE'),
    ('pin_auth_attempts',      'PRIVATE'),
    ('daily_queue_statistics', 'PRIVATE_VIEW'),
    ('services',               'PUBLIC_READ_ONLY'),
    ('staff',                  'PUBLIC_READ_ONLY'),
    ('staff_services',         'PUBLIC_READ_ONLY'),
    ('salon_settings',         'PUBLIC_READ_ONLY')
  ) AS t(object_name, security_tier)
),
acl_summary AS (
  SELECT
    cls.relname AS object_name,
    pg_catalog.string_agg(acl.privilege_type, ', ' ORDER BY acl.privilege_type)
      FILTER (WHERE acl.grantee = 0) AS public_acl_privileges,
    pg_catalog.string_agg(acl.privilege_type, ', ' ORDER BY acl.privilege_type)
      FILTER (WHERE CASE WHEN acl.grantee <> 0 THEN acl.grantee::regrole::TEXT END = 'anon') AS anon_acl_privileges,
    pg_catalog.string_agg(acl.privilege_type, ', ' ORDER BY acl.privilege_type)
      FILTER (WHERE CASE WHEN acl.grantee <> 0 THEN acl.grantee::regrole::TEXT END = 'authenticated') AS authenticated_acl_privileges,
    pg_catalog.string_agg(acl.privilege_type, ', ' ORDER BY acl.privilege_type)
      FILTER (WHERE CASE WHEN acl.grantee <> 0 THEN acl.grantee::regrole::TEXT END = 'service_role') AS service_role_acl_privileges
  FROM pg_catalog.pg_class AS cls
  JOIN pg_catalog.pg_namespace AS ns
    ON ns.oid = cls.relnamespace
  LEFT JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(cls.relacl, pg_catalog.acldefault('r'::"char", cls.relowner))
  ) AS acl
    ON true
  WHERE ns.nspname = 'public'
    AND cls.relkind IN ('r', 'v')
    AND cls.relname IN (
      'customers', 'queue_entries', 'queue_entry_services',
      'queue_status_history', 'pin_auth_attempts', 'daily_queue_statistics',
      'services', 'staff', 'staff_services', 'salon_settings'
    )
  GROUP BY cls.relname
)
SELECT
  t.object_name,
  t.security_tier,
  a.public_acl_privileges,
  a.anon_acl_privileges,
  a.authenticated_acl_privileges,
  a.service_role_acl_privileges,
  pg_catalog.has_table_privilege('anon',          'public.' || t.object_name, 'SELECT')     AS anon_select,
  pg_catalog.has_table_privilege('anon',          'public.' || t.object_name, 'INSERT')     AS anon_insert,
  pg_catalog.has_table_privilege('anon',          'public.' || t.object_name, 'UPDATE')     AS anon_update,
  pg_catalog.has_table_privilege('anon',          'public.' || t.object_name, 'DELETE')     AS anon_delete,
  pg_catalog.has_table_privilege('anon',          'public.' || t.object_name, 'TRUNCATE')   AS anon_truncate,
  pg_catalog.has_table_privilege('anon',          'public.' || t.object_name, 'REFERENCES') AS anon_references,
  pg_catalog.has_table_privilege('anon',          'public.' || t.object_name, 'TRIGGER')    AS anon_trigger,
  pg_catalog.has_table_privilege('authenticated', 'public.' || t.object_name, 'SELECT')     AS auth_select,
  pg_catalog.has_table_privilege('authenticated', 'public.' || t.object_name, 'INSERT')     AS auth_insert,
  pg_catalog.has_table_privilege('authenticated', 'public.' || t.object_name, 'UPDATE')     AS auth_update,
  pg_catalog.has_table_privilege('authenticated', 'public.' || t.object_name, 'DELETE')     AS auth_delete,
  pg_catalog.has_table_privilege('authenticated', 'public.' || t.object_name, 'TRUNCATE')   AS auth_truncate,
  pg_catalog.has_table_privilege('authenticated', 'public.' || t.object_name, 'REFERENCES') AS auth_references,
  pg_catalog.has_table_privilege('authenticated', 'public.' || t.object_name, 'TRIGGER')    AS auth_trigger,
  pg_catalog.has_table_privilege('service_role',  'public.' || t.object_name, 'SELECT')     AS service_select,
  pg_catalog.has_table_privilege('service_role',  'public.' || t.object_name, 'INSERT')     AS service_insert,
  pg_catalog.has_table_privilege('service_role',  'public.' || t.object_name, 'UPDATE')     AS service_update,
  pg_catalog.has_table_privilege('service_role',  'public.' || t.object_name, 'DELETE')     AS service_delete,
  CASE
    WHEN a.object_name IS NULL THEN 'FAIL_MISSING_OBJECT'
    WHEN a.public_acl_privileges IS NOT NULL THEN 'FAIL_PUBLIC_ACL_PRESENT'
    WHEN t.security_tier IN ('PRIVATE', 'PRIVATE_VIEW')
     AND a.anon_acl_privileges IS NULL
     AND a.authenticated_acl_privileges IS NULL
     AND NOT pg_catalog.has_table_privilege('anon',          'public.' || t.object_name, 'SELECT')
     AND NOT pg_catalog.has_table_privilege('anon',          'public.' || t.object_name, 'INSERT')
     AND NOT pg_catalog.has_table_privilege('anon',          'public.' || t.object_name, 'UPDATE')
     AND NOT pg_catalog.has_table_privilege('anon',          'public.' || t.object_name, 'DELETE')
     AND NOT pg_catalog.has_table_privilege('anon',          'public.' || t.object_name, 'TRUNCATE')
     AND NOT pg_catalog.has_table_privilege('anon',          'public.' || t.object_name, 'REFERENCES')
     AND NOT pg_catalog.has_table_privilege('anon',          'public.' || t.object_name, 'TRIGGER')
     AND NOT pg_catalog.has_table_privilege('authenticated', 'public.' || t.object_name, 'SELECT')
     AND NOT pg_catalog.has_table_privilege('authenticated', 'public.' || t.object_name, 'INSERT')
     AND NOT pg_catalog.has_table_privilege('authenticated', 'public.' || t.object_name, 'UPDATE')
     AND NOT pg_catalog.has_table_privilege('authenticated', 'public.' || t.object_name, 'DELETE')
     AND NOT pg_catalog.has_table_privilege('authenticated', 'public.' || t.object_name, 'TRUNCATE')
     AND NOT pg_catalog.has_table_privilege('authenticated', 'public.' || t.object_name, 'REFERENCES')
     AND NOT pg_catalog.has_table_privilege('authenticated', 'public.' || t.object_name, 'TRIGGER')
     AND pg_catalog.has_table_privilege('service_role',      'public.' || t.object_name, 'SELECT')
     AND (
       t.security_tier = 'PRIVATE_VIEW'
       OR (
         pg_catalog.has_table_privilege('service_role', 'public.' || t.object_name, 'INSERT')
         AND pg_catalog.has_table_privilege('service_role', 'public.' || t.object_name, 'UPDATE')
         AND pg_catalog.has_table_privilege('service_role', 'public.' || t.object_name, 'DELETE')
       )
     )
    THEN 'PASS'
    WHEN t.security_tier = 'PUBLIC_READ_ONLY'
     AND a.anon_acl_privileges = 'SELECT'
     AND a.authenticated_acl_privileges = 'SELECT'
     AND pg_catalog.has_table_privilege('anon',              'public.' || t.object_name, 'SELECT')
     AND NOT pg_catalog.has_table_privilege('anon',          'public.' || t.object_name, 'INSERT')
     AND NOT pg_catalog.has_table_privilege('anon',          'public.' || t.object_name, 'UPDATE')
     AND NOT pg_catalog.has_table_privilege('anon',          'public.' || t.object_name, 'DELETE')
     AND NOT pg_catalog.has_table_privilege('anon',          'public.' || t.object_name, 'TRUNCATE')
     AND NOT pg_catalog.has_table_privilege('anon',          'public.' || t.object_name, 'REFERENCES')
     AND NOT pg_catalog.has_table_privilege('anon',          'public.' || t.object_name, 'TRIGGER')
     AND pg_catalog.has_table_privilege('authenticated',     'public.' || t.object_name, 'SELECT')
     AND NOT pg_catalog.has_table_privilege('authenticated', 'public.' || t.object_name, 'INSERT')
     AND NOT pg_catalog.has_table_privilege('authenticated', 'public.' || t.object_name, 'UPDATE')
     AND NOT pg_catalog.has_table_privilege('authenticated', 'public.' || t.object_name, 'DELETE')
     AND NOT pg_catalog.has_table_privilege('authenticated', 'public.' || t.object_name, 'TRUNCATE')
     AND NOT pg_catalog.has_table_privilege('authenticated', 'public.' || t.object_name, 'REFERENCES')
     AND NOT pg_catalog.has_table_privilege('authenticated', 'public.' || t.object_name, 'TRIGGER')
     AND pg_catalog.has_table_privilege('service_role',      'public.' || t.object_name, 'SELECT')
     AND pg_catalog.has_table_privilege('service_role',      'public.' || t.object_name, 'INSERT')
     AND pg_catalog.has_table_privilege('service_role',      'public.' || t.object_name, 'UPDATE')
     AND pg_catalog.has_table_privilege('service_role',      'public.' || t.object_name, 'DELETE')
    THEN 'PASS'
    ELSE 'FAIL'
  END AS verification_status
FROM target_objects AS t
LEFT JOIN acl_summary AS a
  ON a.object_name = t.object_name
ORDER BY t.security_tier, t.object_name;

-- ============================================================================
-- QUERY 2: Raw Object ACL Inspection on pg_class.relacl
-- ============================================================================
SELECT
  cls.relname AS object_name,
  CASE cls.relkind WHEN 'v' THEN 'view' ELSE 'table' END AS object_type,
  pg_catalog.pg_get_userbyid(cls.relowner) AS owner_role,
  cls.relacl AS raw_acl
FROM pg_catalog.pg_class AS cls
JOIN pg_catalog.pg_namespace AS ns
  ON ns.oid = cls.relnamespace
WHERE ns.nspname = 'public'
  AND cls.relkind IN ('r', 'v')
  AND cls.relname IN (
    'customers', 'queue_entries', 'queue_entry_services',
    'queue_status_history', 'pin_auth_attempts', 'daily_queue_statistics',
    'services', 'staff', 'staff_services', 'salon_settings'
  )
ORDER BY object_name;

-- ============================================================================
-- QUERY 3: Default Privileges Audit
-- Read-only: identifies owner-specific and global default privileges.
-- ============================================================================

SELECT
  pg_catalog.pg_get_userbyid(d.defaclrole) AS defacl_owner,
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
  pg_catalog.string_agg(
    acl.privilege_type,
    ', ' ORDER BY acl.privilege_type
  ) AS default_privileges
FROM pg_catalog.pg_default_acl AS d
LEFT JOIN pg_catalog.pg_namespace AS ns
  ON ns.oid = d.defaclnamespace
LEFT JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) AS acl
  ON true
WHERE ns.nspname = 'public'
   OR d.defaclnamespace = 0
GROUP BY
  d.defaclrole,
  COALESCE(ns.nspname, '<ALL_SCHEMAS>'),
  d.defaclobjtype,
  acl.grantee
ORDER BY
  defacl_owner,
  schema_name,
  object_type,
  grantee;