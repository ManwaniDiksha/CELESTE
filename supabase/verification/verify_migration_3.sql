-- ============================================================================
-- CELESTE — Salon Queue Management System
-- Read-Only Verification Script for Migration 003 (Security, RLS & Realtime)
--
-- SAFETY: Strictly READ-ONLY SELECT queries against pg_catalog.
--         Do not execute any DDL/DML/DCL statements here.
-- ============================================================================

-- ============================================================================
-- QUERY 1: RLS Status & Policy Verification for All 9 Application Tables
--   - Private tables: RLS enabled + 0 permissive policies for PUBLIC/anon/authenticated.
--   - Public zero-PII tables: RLS enabled + SELECT-only permissive policy for
--     anon and authenticated, and 0 write/ALL policies for PUBLIC/anon/authenticated.
-- ============================================================================
WITH expected_tables AS (
  SELECT * FROM (VALUES
    ('customers',            'PRIVATE'),
    ('queue_entries',        'PRIVATE'),
    ('queue_entry_services', 'PRIVATE'),
    ('queue_status_history', 'PRIVATE'),
    ('pin_auth_attempts',    'PRIVATE'),
    ('services',             'PUBLIC_READ_ONLY'),
    ('staff',                'PUBLIC_READ_ONLY'),
    ('staff_services',       'PUBLIC_READ_ONLY'),
    ('salon_settings',       'PUBLIC_READ_ONLY')
  ) AS t(table_name, security_tier)
),
browser_roles AS (
  SELECT r.oid, r.rolname
  FROM pg_catalog.pg_roles AS r
  WHERE r.rolname IN ('anon', 'authenticated')
),
table_rls AS (
  SELECT
    cls.oid AS rel_oid,
    cls.relname AS table_name,
    cls.relrowsecurity AS rls_enabled,
    cls.relforcerowsecurity AS force_rls
  FROM pg_catalog.pg_class AS cls
  JOIN pg_catalog.pg_namespace AS ns
    ON ns.oid = cls.relnamespace
  WHERE ns.nspname = 'public'
    AND cls.relkind = 'r'
    AND cls.relname IN (
      'customers', 'queue_entries', 'queue_entry_services',
      'queue_status_history', 'pin_auth_attempts',
      'services', 'staff', 'staff_services', 'salon_settings'
    )
),
policy_summary AS (
  SELECT
    tr.table_name,
    pg_catalog.string_agg(
      pol.polname || ' (' ||
      CASE pol.polcmd
        WHEN 'r' THEN 'SELECT'
        WHEN 'a' THEN 'INSERT'
        WHEN 'w' THEN 'UPDATE'
        WHEN 'd' THEN 'DELETE'
        WHEN '*' THEN 'ALL'
        ELSE pol.polcmd::TEXT
      END || ', ' ||
      CASE WHEN pol.polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END || ')',
      '; ' ORDER BY pol.polname
    ) AS policies_found,
    COUNT(*) FILTER (
      WHERE pol.polpermissive
        AND (
          0::OID = ANY(pol.polroles)
          OR EXISTS (
            SELECT 1
            FROM browser_roles AS br
            WHERE br.oid = ANY(pol.polroles)
          )
        )
    )::INTEGER AS browser_permissive_total,
    COUNT(*) FILTER (
      WHERE pol.polpermissive
        AND pol.polcmd = 'r'
        AND (
          0::OID = ANY(pol.polroles)
          OR EXISTS (
            SELECT 1 FROM browser_roles AS br
            WHERE br.rolname = 'anon' AND br.oid = ANY(pol.polroles)
          )
        )
    )::INTEGER AS anon_select_policy_count,
    COUNT(*) FILTER (
      WHERE pol.polpermissive
        AND pol.polcmd = 'r'
        AND (
          0::OID = ANY(pol.polroles)
          OR EXISTS (
            SELECT 1 FROM browser_roles AS br
            WHERE br.rolname = 'authenticated' AND br.oid = ANY(pol.polroles)
          )
        )
    )::INTEGER AS authenticated_select_policy_count,
    COUNT(*) FILTER (
      WHERE pol.polpermissive
        AND pol.polcmd <> 'r'
        AND (
          0::OID = ANY(pol.polroles)
          OR EXISTS (
            SELECT 1
            FROM browser_roles AS br
            WHERE br.oid = ANY(pol.polroles)
          )
        )
    )::INTEGER AS browser_write_or_all_policy_count
  FROM table_rls AS tr
  LEFT JOIN pg_catalog.pg_policy AS pol
    ON pol.polrelid = tr.rel_oid
  GROUP BY tr.table_name
)
SELECT
  et.table_name,
  et.security_tier,
  tr.rls_enabled,
  tr.force_rls,
  ps.browser_permissive_total,
  ps.anon_select_policy_count,
  ps.authenticated_select_policy_count,
  ps.browser_write_or_all_policy_count,
  ps.policies_found,
  CASE
    WHEN tr.table_name IS NULL THEN 'FAIL_MISSING_TABLE'
    WHEN NOT tr.rls_enabled THEN 'FAIL_RLS_DISABLED'
    WHEN et.security_tier = 'PRIVATE'
     AND ps.browser_permissive_total = 0
      THEN 'PASS'
    WHEN et.security_tier = 'PRIVATE'
      THEN 'FAIL_PRIVATE_TABLE_HAS_BROWSER_POLICY'
    WHEN et.security_tier = 'PUBLIC_READ_ONLY'
     AND ps.anon_select_policy_count >= 1
     AND ps.authenticated_select_policy_count >= 1
     AND ps.browser_write_or_all_policy_count = 0
      THEN 'PASS'
    ELSE 'FAIL_PUBLIC_POLICY_MISMATCH'
  END AS verification_status
FROM expected_tables AS et
LEFT JOIN table_rls AS tr
  ON tr.table_name = et.table_name
LEFT JOIN policy_summary AS ps
  ON ps.table_name = et.table_name
ORDER BY et.security_tier, et.table_name;

-- ============================================================================
-- QUERY 2: Realtime Publication Membership (supabase_realtime)
--   - Verifies supabase_realtime exists and is NOT FOR ALL TABLES.
--   - Verifies only the 4 public zero-PII tables are members among CELESTE tables.
--   - Verifies none of the 5 private tables are published.
-- ============================================================================
WITH expected_realtime AS (
  SELECT * FROM (VALUES
    ('services',             true,  'PUBLIC_ZERO_PII'),
    ('staff',                true,  'PUBLIC_ZERO_PII'),
    ('staff_services',       true,  'PUBLIC_ZERO_PII'),
    ('salon_settings',       true,  'PUBLIC_ZERO_PII'),
    ('customers',            false, 'PRIVATE_PII'),
    ('queue_entries',        false, 'PRIVATE'),
    ('queue_entry_services', false, 'PRIVATE'),
    ('queue_status_history', false, 'PRIVATE'),
    ('pin_auth_attempts',    false, 'PRIVATE')
  ) AS t(table_name, expected_in_realtime, category)
),
pub_info AS (
  SELECT
    pub.pubname,
    pub.puballtables
  FROM pg_catalog.pg_publication AS pub
  WHERE pub.pubname = 'supabase_realtime'
),
actual_pub_tables AS (
  SELECT
    pt.schemaname,
    pt.tablename AS table_name
  FROM pg_catalog.pg_publication_tables AS pt
  WHERE pt.pubname = 'supabase_realtime'
    AND pt.schemaname = 'public'
)
SELECT
  '__publication__' AS table_name,
  'PUBLICATION_CONFIG' AS category,
  false AS expected_in_realtime,
  (pi.pubname IS NOT NULL) AS actual_in_realtime,
  pi.puballtables AS publication_all_tables,
  CASE
    WHEN pi.pubname IS NULL THEN 'FAIL_PUBLICATION_MISSING'
    WHEN pi.puballtables THEN 'FAIL_PUBLICATION_IS_FOR_ALL_TABLES'
    ELSE 'PASS'
  END AS verification_status
FROM (SELECT 1) AS dummy
LEFT JOIN pub_info AS pi
  ON true

UNION ALL

SELECT
  COALESCE(er.table_name, apt.table_name) AS table_name,
  COALESCE(er.category, 'OTHER_PUBLIC_TABLE') AS category,
  er.expected_in_realtime,
  (apt.table_name IS NOT NULL OR COALESCE(pi.puballtables, false)) AS actual_in_realtime,
  pi.puballtables AS publication_all_tables,
  CASE
    WHEN pi.pubname IS NULL THEN 'FAIL_PUBLICATION_MISSING'
    WHEN pi.puballtables THEN 'FAIL_PUBLICATION_IS_FOR_ALL_TABLES'
    WHEN er.table_name IS NULL THEN 'INFO_OTHER_TABLE_IN_PUBLICATION'
    WHEN er.expected_in_realtime AND apt.table_name IS NOT NULL THEN 'PASS'
    WHEN er.expected_in_realtime AND apt.table_name IS NULL THEN 'FAIL_MISSING_FROM_REALTIME'
    WHEN NOT er.expected_in_realtime AND apt.table_name IS NOT NULL THEN 'FAIL_PRIVATE_TABLE_IN_REALTIME'
    WHEN NOT er.expected_in_realtime AND apt.table_name IS NULL THEN 'PASS'
    ELSE 'FAIL'
  END AS verification_status
FROM expected_realtime AS er
FULL OUTER JOIN actual_pub_tables AS apt
  ON apt.table_name = er.table_name
LEFT JOIN pub_info AS pi
  ON true
ORDER BY category, table_name;

-- ============================================================================
-- QUERY 3: Table & View Privileges Integrity Check
--   - Confirms 0 privileges for PUBLIC, anon, and authenticated on the
--     5 private tables and on public.daily_queue_statistics.
--   - Confirms SELECT-only for anon and authenticated on the 4 public tables.
--   - Confirms existing service_role privileges remain intact on all 10 objects.
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
  pg_catalog.has_table_privilege('anon',          'public.' || t.object_name, 'SELECT') AS anon_select,
  pg_catalog.has_table_privilege('authenticated', 'public.' || t.object_name, 'SELECT') AS auth_select,
  pg_catalog.has_table_privilege('service_role',  'public.' || t.object_name, 'SELECT') AS service_select,
  pg_catalog.has_table_privilege('service_role',  'public.' || t.object_name, 'INSERT') AS service_insert,
  pg_catalog.has_table_privilege('service_role',  'public.' || t.object_name, 'UPDATE') AS service_update,
  pg_catalog.has_table_privilege('service_role',  'public.' || t.object_name, 'DELETE') AS service_delete,
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
     AND NOT pg_catalog.has_table_privilege('authenticated', 'public.' || t.object_name, 'SELECT')
     AND NOT pg_catalog.has_table_privilege('authenticated', 'public.' || t.object_name, 'INSERT')
     AND NOT pg_catalog.has_table_privilege('authenticated', 'public.' || t.object_name, 'UPDATE')
     AND NOT pg_catalog.has_table_privilege('authenticated', 'public.' || t.object_name, 'DELETE')
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
     AND pg_catalog.has_table_privilege('authenticated',     'public.' || t.object_name, 'SELECT')
     AND NOT pg_catalog.has_table_privilege('authenticated', 'public.' || t.object_name, 'INSERT')
     AND NOT pg_catalog.has_table_privilege('authenticated', 'public.' || t.object_name, 'UPDATE')
     AND NOT pg_catalog.has_table_privilege('authenticated', 'public.' || t.object_name, 'DELETE')
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
