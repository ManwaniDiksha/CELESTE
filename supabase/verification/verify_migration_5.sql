-- ============================================================================
-- CELESTE — Salon Queue Management System
-- Read-Only Verification Script for Migration 005 (PIN Auth RPC Functions)
--
-- SAFETY: Strictly READ-ONLY SELECT queries against pg_catalog.
--         Do not execute any DDL/DML/DCL statements here.
-- ============================================================================

-- ============================================================================
-- QUERY 1: Functions, Ownership, Signatures, Return Types, SECURITY DEFINER & search_path
-- ============================================================================
WITH expected_functions AS (
  SELECT * FROM (VALUES
    ('check_pin_auth_lockout',  'p_ip_key text', 'jsonb', 'postgres'),
    ('record_pin_auth_failure', 'p_ip_key text', 'jsonb', 'postgres'),
    ('reset_pin_auth_attempts', 'p_ip_key text', 'jsonb', 'postgres')
  ) AS t(routine_name, expected_identity_args, expected_return_type, expected_owner)
),
actual_functions AS (
  SELECT
    p.oid AS func_oid,
    p.proname AS routine_name,
    pg_catalog.pg_get_userbyid(p.proowner) AS owner_role,
    pg_catalog.pg_get_function_identity_arguments(p.oid) AS actual_identity_args,
    pg_catalog.pg_get_function_result(p.oid) AS actual_return_type,
    p.prosecdef AS is_security_definer,
    p.proconfig AS function_config,
    COALESCE(
      'search_path=""' = ANY(p.proconfig) OR 'search_path=' = ANY(p.proconfig),
      false
    ) AS has_empty_search_path
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS ns
    ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public'
    AND p.prokind = 'f'
    AND p.proname IN (
      'check_pin_auth_lockout',
      'record_pin_auth_failure',
      'reset_pin_auth_attempts'
    )
)
SELECT
  COALESCE(e.routine_name, a.routine_name) AS routine_name,
  e.expected_owner,
  a.owner_role AS actual_owner,
  e.expected_identity_args,
  a.actual_identity_args,
  e.expected_return_type,
  a.actual_return_type,
  a.is_security_definer,
  a.has_empty_search_path,
  a.function_config,
  CASE
    WHEN e.routine_name IS NULL THEN 'FAIL_UNEXPECTED_OVERLOAD'
    WHEN a.func_oid IS NULL THEN 'FAIL_MISSING_FUNCTION'
    WHEN a.owner_role = e.expected_owner
     AND a.actual_identity_args = e.expected_identity_args
     AND a.actual_return_type = e.expected_return_type
     AND a.is_security_definer = true
     AND a.has_empty_search_path = true
      THEN 'PASS'
    ELSE 'FAIL_MISMATCH'
  END AS verification_status
FROM expected_functions AS e
FULL OUTER JOIN actual_functions AS a
  ON a.routine_name = e.routine_name
 AND a.actual_identity_args = e.expected_identity_args
ORDER BY routine_name;

-- ============================================================================
-- QUERY 2: Complete Effective Function ACL & All-Role Privilege Verification
--   1. Inspects the direct ACL using pg_catalog.aclexplode():
--      - Owner retains inherent EXECUTE privilege.
--      - service_role holds EXECUTE.
--      - PUBLIC, anon, authenticated, and any OTHER role have NO direct grants.
--      - No unexpected overloads exist.
--   2. Inspects EVERY existing database role in pg_catalog.pg_roles using
--      pg_catalog.has_function_privilege(r.rolname, f.func_oid, 'EXECUTE'):
--      - Catches effective EXECUTE including permissions inherited through
--        role membership.
--      - Fails if any non-owner, non-service_role, non-superuser role has
--        effective EXECUTE.
--      - Returns plain PASS only when ONLY the function owner and service_role
--        have effective EXECUTE.
--      - Returns PASS_WITH_SUPERUSER_EXCEPTION (and lists those roles in
--        superuser_effective_execute_roles) if another superuser (e.g.
--        platform supabase_admin) holds effective EXECUTE via superuser bypass.
-- ============================================================================
WITH expected_functions AS (
  SELECT * FROM (VALUES
    ('check_pin_auth_lockout',  'p_ip_key text'),
    ('record_pin_auth_failure', 'p_ip_key text'),
    ('reset_pin_auth_attempts', 'p_ip_key text')
  ) AS t(routine_name, expected_identity_args)
),
func_acl AS (
  SELECT
    p.oid AS func_oid,
    p.proowner AS owner_oid,
    p.proname AS routine_name,
    pg_catalog.pg_get_userbyid(p.proowner) AS owner_role,
    pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_args,
    p.proacl AS raw_proacl,
    pg_catalog.string_agg(
      CASE
        WHEN acl.grantee = 0 THEN 'PUBLIC:' || acl.privilege_type
        ELSE COALESCE(gr.rolname, acl.grantee::TEXT) || ':' || acl.privilege_type
      END,
      ', ' ORDER BY acl.grantee, acl.privilege_type
    ) AS effective_acl_entries,
    BOOL_OR(acl.grantee = p.proowner AND acl.privilege_type = 'EXECUTE') AS owner_has_execute_acl,
    BOOL_OR(gr.rolname = 'service_role' AND acl.privilege_type = 'EXECUTE') AS service_role_has_execute_acl,
    pg_catalog.string_agg(acl.privilege_type, ', ' ORDER BY acl.privilege_type)
      FILTER (WHERE acl.grantee = 0) AS public_acl_privileges,
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
            acl.grantee <> p.proowner
            AND COALESCE(gr.rolname, '') <> 'service_role'
          )
        )
    ) AS unexpected_acl_grants
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS ns
    ON ns.oid = p.pronamespace
  LEFT JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(p.proacl, pg_catalog.acldefault('f'::"char", p.proowner))
  ) AS acl
    ON true
  LEFT JOIN pg_catalog.pg_roles AS gr
    ON gr.oid = acl.grantee
  WHERE ns.nspname = 'public'
    AND p.prokind = 'f'
    AND p.proname IN (
      'check_pin_auth_lockout',
      'record_pin_auth_failure',
      'reset_pin_auth_attempts'
    )
  GROUP BY p.oid, p.proowner, p.proname, p.proacl
),
role_execute_audit AS (
  SELECT
    f.func_oid,
    pg_catalog.string_agg(
      r.rolname || CASE WHEN r.rolsuper THEN ' (superuser)' ELSE '' END,
      ', ' ORDER BY r.rolname
    ) FILTER (
      WHERE pg_catalog.has_function_privilege(r.rolname, f.func_oid, 'EXECUTE')
    ) AS all_roles_with_effective_execute,
    pg_catalog.string_agg(
      r.rolname,
      ', ' ORDER BY r.rolname
    ) FILTER (
      WHERE r.oid <> f.owner_oid
        AND r.rolname <> 'service_role'
        AND NOT r.rolsuper
        AND pg_catalog.has_function_privilege(r.rolname, f.func_oid, 'EXECUTE')
    ) AS unexpected_effective_execute_roles,
    pg_catalog.string_agg(
      r.rolname,
      ', ' ORDER BY r.rolname
    ) FILTER (
      WHERE r.oid <> f.owner_oid
        AND r.rolname <> 'service_role'
        AND r.rolsuper
        AND pg_catalog.has_function_privilege(r.rolname, f.func_oid, 'EXECUTE')
    ) AS superuser_effective_execute_roles
  FROM func_acl AS f
  CROSS JOIN pg_catalog.pg_roles AS r
  GROUP BY f.func_oid
)
SELECT
  COALESCE(e.routine_name, f.routine_name) AS routine_name,
  f.owner_role,
  f.effective_acl_entries,
  f.unexpected_acl_grants,
  f.public_acl_privileges,
  ra.all_roles_with_effective_execute,
  ra.unexpected_effective_execute_roles,
  ra.superuser_effective_execute_roles,
  CASE WHEN f.func_oid IS NOT NULL THEN pg_catalog.has_function_privilege(f.owner_oid, f.func_oid, 'EXECUTE') END AS owner_execute,
  CASE WHEN f.func_oid IS NOT NULL THEN pg_catalog.has_function_privilege('anon',          f.func_oid, 'EXECUTE') END AS anon_execute,
  CASE WHEN f.func_oid IS NOT NULL THEN pg_catalog.has_function_privilege('authenticated', f.func_oid, 'EXECUTE') END AS auth_execute,
  CASE WHEN f.func_oid IS NOT NULL THEN pg_catalog.has_function_privilege('service_role',  f.func_oid, 'EXECUTE') END AS service_role_execute,
  CASE
    WHEN e.routine_name IS NULL THEN 'FAIL_UNEXPECTED_OVERLOAD'
    WHEN f.func_oid IS NULL THEN 'FAIL_MISSING_FUNCTION'
    WHEN f.unexpected_acl_grants IS NOT NULL
      OR f.public_acl_privileges IS NOT NULL
      OR pg_catalog.has_function_privilege('anon',          f.func_oid, 'EXECUTE')
      OR pg_catalog.has_function_privilege('authenticated', f.func_oid, 'EXECUTE')
      THEN 'FAIL_UNEXPECTED_OR_PUBLIC_EXECUTE'
    WHEN ra.unexpected_effective_execute_roles IS NOT NULL
      THEN 'FAIL_UNEXPECTED_EFFECTIVE_EXECUTE'
    WHEN COALESCE(f.owner_has_execute_acl, false)
     AND pg_catalog.has_function_privilege(f.owner_oid, f.func_oid, 'EXECUTE')
     AND COALESCE(f.service_role_has_execute_acl, false)
     AND pg_catalog.has_function_privilege('service_role', f.func_oid, 'EXECUTE')
     AND ra.superuser_effective_execute_roles IS NOT NULL
      THEN 'PASS_WITH_SUPERUSER_EXCEPTION'
    WHEN COALESCE(f.owner_has_execute_acl, false)
     AND pg_catalog.has_function_privilege(f.owner_oid, f.func_oid, 'EXECUTE')
     AND COALESCE(f.service_role_has_execute_acl, false)
     AND pg_catalog.has_function_privilege('service_role', f.func_oid, 'EXECUTE')
      THEN 'PASS'
    ELSE 'FAIL_OWNER_OR_SERVICE_ROLE_PRIVILEGE'
  END AS verification_status
FROM expected_functions AS e
FULL OUTER JOIN func_acl AS f
  ON f.routine_name = e.routine_name
 AND f.identity_args = e.expected_identity_args
LEFT JOIN role_execute_audit AS ra
  ON ra.func_oid = f.func_oid
ORDER BY routine_name;

-- ============================================================================
-- QUERY 3: Unchanged public.pin_auth_attempts Columns & Default Expressions
--   Never returns an empty set if public.pin_auth_attempts is missing.
-- ============================================================================
WITH expected_columns AS (
  SELECT * FROM (VALUES
    (1, 'ip_key',          'text',                     true,  false, NULL::TEXT),
    (2, 'failed_count',    'integer',                  true,  true,  '^0(::integer)?$'),
    (3, 'first_failed_at', 'timestamp with time zone', false, false, NULL::TEXT),
    (4, 'locked_until',    'timestamp with time zone', false, false, NULL::TEXT),
    (5, 'updated_at',      'timestamp with time zone', true,  true,  '^(pg_catalog\.)?now\(\)$')
  ) AS t(attnum, column_name, expected_type, expected_not_null, expected_has_default, expected_default_regex)
),
target_table AS (
  SELECT cls.oid AS rel_oid
  FROM pg_catalog.pg_class AS cls
  JOIN pg_catalog.pg_namespace AS ns
    ON ns.oid = cls.relnamespace
  WHERE ns.nspname = 'public'
    AND cls.relkind = 'r'
    AND cls.relname = 'pin_auth_attempts'
),
actual_columns AS (
  SELECT
    a.attnum::INTEGER AS attnum,
    a.attname AS column_name,
    pg_catalog.format_type(a.atttypid, a.atttypmod) AS actual_type,
    a.attnotnull AS actual_not_null,
    a.atthasdef AS actual_has_default,
    pg_catalog.pg_get_expr(ad.adbin, ad.adrelid) AS actual_default_expr
  FROM target_table AS tt
  JOIN pg_catalog.pg_attribute AS a
    ON a.attrelid = tt.rel_oid
  LEFT JOIN pg_catalog.pg_attrdef AS ad
    ON ad.adrelid = a.attrelid
   AND ad.adnum = a.attnum
  WHERE a.attnum > 0
    AND NOT a.attisdropped
)
SELECT
  COALESCE(ec.column_name, ac.column_name) AS column_name,
  (EXISTS (SELECT 1 FROM target_table)) AS table_exists,
  ec.expected_type,
  ac.actual_type,
  ec.expected_not_null,
  ac.actual_not_null,
  ec.expected_has_default,
  ac.actual_has_default,
  ac.actual_default_expr,
  CASE
    WHEN NOT EXISTS (SELECT 1 FROM target_table) THEN 'FAIL_MISSING_TABLE'
    WHEN ec.column_name IS NULL THEN 'FAIL_UNEXPECTED_COLUMN'
    WHEN ac.column_name IS NULL THEN 'FAIL_MISSING_COLUMN'
    WHEN ac.actual_type = ec.expected_type
     AND ac.actual_not_null = ec.expected_not_null
     AND ac.actual_has_default = ec.expected_has_default
     AND (
       (NOT ec.expected_has_default AND ac.actual_default_expr IS NULL)
       OR (ec.expected_has_default AND ac.actual_default_expr ~* ec.expected_default_regex)
     )
      THEN 'PASS'
    ELSE 'FAIL_COLUMN_OR_DEFAULT_MISMATCH'
  END AS verification_status
FROM expected_columns AS ec
FULL OUTER JOIN actual_columns AS ac
  ON ac.column_name = ec.column_name
ORDER BY COALESCE(ec.attnum, ac.attnum);

-- ============================================================================
-- QUERY 4: Unchanged Table Constraints, PK/Indexes, Trigger, RLS, Policies & Grants
--   Always produces 5 explicit verification rows even if table is missing.
-- ============================================================================
WITH target_table AS (
  SELECT
    cls.oid AS rel_oid,
    cls.relrowsecurity AS rls_enabled,
    cls.relacl,
    cls.relowner
  FROM pg_catalog.pg_class AS cls
  JOIN pg_catalog.pg_namespace AS ns
    ON ns.oid = cls.relnamespace
  WHERE ns.nspname = 'public'
    AND cls.relkind = 'r'
    AND cls.relname = 'pin_auth_attempts'
),
table_facts AS (
  SELECT
    (tt.rel_oid IS NOT NULL) AS table_exists,
    tt.rls_enabled,
    (
      SELECT COUNT(*)::INTEGER
      FROM pg_catalog.pg_constraint AS con
      WHERE con.conrelid = tt.rel_oid
        AND con.contype = 'p'
        AND con.conname = 'pin_auth_attempts_pkey'
        AND pg_catalog.pg_get_constraintdef(con.oid) = 'PRIMARY KEY (ip_key)'
    ) AS pk_match_count,
    (
      SELECT COUNT(*)::INTEGER
      FROM pg_catalog.pg_constraint AS con
      WHERE con.conrelid = tt.rel_oid
        AND con.contype = 'c'
        AND con.conname = 'chk_pin_auth_failed_count'
        AND pg_catalog.pg_get_constraintdef(con.oid) = 'CHECK ((failed_count >= 0))'
    ) AS check_match_count,
    (
      SELECT COUNT(*)::INTEGER
      FROM pg_catalog.pg_index AS idx
      JOIN pg_catalog.pg_class AS icls
        ON icls.oid = idx.indexrelid
      WHERE idx.indrelid = tt.rel_oid
        AND icls.relname = 'pin_auth_attempts_pkey'
        AND idx.indisprimary
        AND idx.indisunique
        AND idx.indisvalid
        AND idx.indisready
        AND pg_catalog.pg_get_indexdef(idx.indexrelid) ~* '^CREATE UNIQUE INDEX pin_auth_attempts_pkey ON (public\.)?pin_auth_attempts USING btree \(ip_key\)$'
    ) AS pk_index_match_count,
    (
      SELECT MAX(pg_catalog.pg_get_indexdef(idx.indexrelid))
      FROM pg_catalog.pg_index AS idx
      WHERE idx.indrelid = tt.rel_oid
        AND idx.indisprimary
    ) AS pk_index_def,
    (
      SELECT COUNT(*)::INTEGER
      FROM pg_catalog.pg_index AS idx
      WHERE idx.indrelid = tt.rel_oid
    ) AS total_index_count,
    (
      SELECT COUNT(*)::INTEGER
      FROM pg_catalog.pg_trigger AS trg
      JOIN pg_catalog.pg_proc AS p
        ON p.oid = trg.tgfoid
      JOIN pg_catalog.pg_namespace AS pns
        ON pns.oid = p.pronamespace
      WHERE trg.tgrelid = tt.rel_oid
        AND NOT trg.tgisinternal
        AND trg.tgname = 'trg_pin_auth_attempts_set_updated_at'
        AND trg.tgenabled = 'O'
        AND pns.nspname = 'public'
        AND p.proname = 'set_updated_at'
        AND pg_catalog.pg_get_triggerdef(trg.oid, true) ~* 'BEFORE UPDATE ON (public\.)?pin_auth_attempts FOR EACH ROW EXECUTE (FUNCTION|PROCEDURE) (public\.)?set_updated_at\(\)'
    ) AS trigger_match_count,
    (
      SELECT COUNT(*)::INTEGER
      FROM pg_catalog.pg_policy AS pol
      WHERE pol.polrelid = tt.rel_oid
    ) AS policy_count,
    (
      SELECT pg_catalog.string_agg(acl.privilege_type, ', ' ORDER BY acl.privilege_type)
      FROM pg_catalog.aclexplode(
        COALESCE(tt.relacl, pg_catalog.acldefault('r'::"char", tt.relowner))
      ) AS acl
      WHERE tt.rel_oid IS NOT NULL
        AND acl.grantee = 0
    ) AS public_acl_privileges,
    (
      SELECT pg_catalog.string_agg(acl.privilege_type, ', ' ORDER BY acl.privilege_type)
      FROM pg_catalog.aclexplode(
        COALESCE(tt.relacl, pg_catalog.acldefault('r'::"char", tt.relowner))
      ) AS acl
      WHERE tt.rel_oid IS NOT NULL
        AND acl.grantee <> 0
        AND acl.grantee::regrole::TEXT = 'anon'
    ) AS anon_acl_privileges,
    (
      SELECT pg_catalog.string_agg(acl.privilege_type, ', ' ORDER BY acl.privilege_type)
      FROM pg_catalog.aclexplode(
        COALESCE(tt.relacl, pg_catalog.acldefault('r'::"char", tt.relowner))
      ) AS acl
      WHERE tt.rel_oid IS NOT NULL
        AND acl.grantee <> 0
        AND acl.grantee::regrole::TEXT = 'authenticated'
    ) AS authenticated_acl_privileges,
    (
      SELECT pg_catalog.string_agg(acl.privilege_type, ', ' ORDER BY acl.privilege_type)
      FROM pg_catalog.aclexplode(
        COALESCE(tt.relacl, pg_catalog.acldefault('r'::"char", tt.relowner))
      ) AS acl
      WHERE tt.rel_oid IS NOT NULL
        AND acl.grantee <> 0
        AND acl.grantee::regrole::TEXT = 'service_role'
    ) AS service_role_acl_privileges,
    CASE WHEN tt.rel_oid IS NOT NULL THEN pg_catalog.has_table_privilege('anon',          'public.pin_auth_attempts', 'SELECT')     END AS anon_select,
    CASE WHEN tt.rel_oid IS NOT NULL THEN pg_catalog.has_table_privilege('anon',          'public.pin_auth_attempts', 'INSERT')     END AS anon_insert,
    CASE WHEN tt.rel_oid IS NOT NULL THEN pg_catalog.has_table_privilege('anon',          'public.pin_auth_attempts', 'UPDATE')     END AS anon_update,
    CASE WHEN tt.rel_oid IS NOT NULL THEN pg_catalog.has_table_privilege('anon',          'public.pin_auth_attempts', 'DELETE')     END AS anon_delete,
    CASE WHEN tt.rel_oid IS NOT NULL THEN pg_catalog.has_table_privilege('anon',          'public.pin_auth_attempts', 'TRUNCATE')   END AS anon_truncate,
    CASE WHEN tt.rel_oid IS NOT NULL THEN pg_catalog.has_table_privilege('anon',          'public.pin_auth_attempts', 'REFERENCES') END AS anon_references,
    CASE WHEN tt.rel_oid IS NOT NULL THEN pg_catalog.has_table_privilege('anon',          'public.pin_auth_attempts', 'TRIGGER')    END AS anon_trigger,
    CASE WHEN tt.rel_oid IS NOT NULL THEN pg_catalog.has_table_privilege('authenticated', 'public.pin_auth_attempts', 'SELECT')     END AS auth_select,
    CASE WHEN tt.rel_oid IS NOT NULL THEN pg_catalog.has_table_privilege('authenticated', 'public.pin_auth_attempts', 'INSERT')     END AS auth_insert,
    CASE WHEN tt.rel_oid IS NOT NULL THEN pg_catalog.has_table_privilege('authenticated', 'public.pin_auth_attempts', 'UPDATE')     END AS auth_update,
    CASE WHEN tt.rel_oid IS NOT NULL THEN pg_catalog.has_table_privilege('authenticated', 'public.pin_auth_attempts', 'DELETE')     END AS auth_delete,
    CASE WHEN tt.rel_oid IS NOT NULL THEN pg_catalog.has_table_privilege('authenticated', 'public.pin_auth_attempts', 'TRUNCATE')   END AS auth_truncate,
    CASE WHEN tt.rel_oid IS NOT NULL THEN pg_catalog.has_table_privilege('authenticated', 'public.pin_auth_attempts', 'REFERENCES') END AS auth_references,
    CASE WHEN tt.rel_oid IS NOT NULL THEN pg_catalog.has_table_privilege('authenticated', 'public.pin_auth_attempts', 'TRIGGER')    END AS auth_trigger
  FROM (SELECT 1) AS anchor
  LEFT JOIN target_table AS tt
    ON true
)
SELECT
  v.check_name,
  tf.table_exists,
  v.details,
  v.verification_status
FROM table_facts AS tf
CROSS JOIN LATERAL (
  VALUES
    (
      '1_table_exists',
      'public.pin_auth_attempts present',
      CASE WHEN tf.table_exists THEN 'PASS' ELSE 'FAIL_MISSING_TABLE' END
    ),
    (
      '2_primary_key_and_index',
      'pk=' || COALESCE(tf.pk_match_count, 0) || ', chk=' || COALESCE(tf.check_match_count, 0) || ', pk_idx=' || COALESCE(tf.pk_index_match_count, 0) || ', total_idx=' || COALESCE(tf.total_index_count, 0) || ', def=' || COALESCE(tf.pk_index_def, 'NONE'),
      CASE
        WHEN NOT tf.table_exists THEN 'FAIL_MISSING_TABLE'
        WHEN tf.pk_match_count = 1 AND tf.check_match_count = 1 AND tf.pk_index_match_count = 1 AND tf.total_index_count = 1 THEN 'PASS'
        ELSE 'FAIL_PK_OR_INDEX_MISMATCH'
      END
    ),
    (
      '3_updated_at_trigger',
      'trg_pin_auth_attempts_set_updated_at matches=' || COALESCE(tf.trigger_match_count, 0),
      CASE
        WHEN NOT tf.table_exists THEN 'FAIL_MISSING_TABLE'
        WHEN tf.trigger_match_count = 1 THEN 'PASS'
        ELSE 'FAIL_TRIGGER_MISMATCH'
      END
    ),
    (
      '4_rls_and_policies',
      'rls=' || COALESCE(tf.rls_enabled::TEXT, 'null') || ', policies=' || COALESCE(tf.policy_count, -1),
      CASE
        WHEN NOT tf.table_exists THEN 'FAIL_MISSING_TABLE'
        WHEN tf.rls_enabled = true AND tf.policy_count = 0 THEN 'PASS'
        ELSE 'FAIL_RLS_OR_POLICY_MISMATCH'
      END
    ),
    (
      '5_table_privileges',
      'public=' || COALESCE(tf.public_acl_privileges, 'NONE') || ', anon=' || COALESCE(tf.anon_acl_privileges, 'NONE') || ', auth=' || COALESCE(tf.authenticated_acl_privileges, 'NONE') || ', service_role=' || COALESCE(tf.service_role_acl_privileges, 'NONE'),
      CASE
        WHEN NOT tf.table_exists THEN 'FAIL_MISSING_TABLE'
        WHEN tf.public_acl_privileges IS NULL
         AND tf.anon_acl_privileges IS NULL
         AND tf.authenticated_acl_privileges IS NULL
         AND NOT tf.anon_select AND NOT tf.anon_insert AND NOT tf.anon_update AND NOT tf.anon_delete AND NOT tf.anon_truncate AND NOT tf.anon_references AND NOT tf.anon_trigger
         AND NOT tf.auth_select AND NOT tf.auth_insert AND NOT tf.auth_update AND NOT tf.auth_delete AND NOT tf.auth_truncate AND NOT tf.auth_references AND NOT tf.auth_trigger
         AND tf.service_role_acl_privileges = 'DELETE, INSERT, SELECT, UPDATE'
          THEN 'PASS'
        ELSE 'FAIL_PRIVILEGE_MISMATCH'
      END
    )
) AS v(check_name, details, verification_status)
ORDER BY v.check_name;
