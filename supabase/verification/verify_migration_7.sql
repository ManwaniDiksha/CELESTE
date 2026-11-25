-- ============================================================================
-- CELESTE — Salon Queue Management System
-- Read-Only Verification Script for Migration 007
--
-- SAFETY: Strictly READ-ONLY SELECT queries against pg_catalog.
--         Do not execute any DDL/DML/DCL statements here.
-- ============================================================================

-- QUERY 1: Functions, Signatures, Return Types, Ownership, SECURITY DEFINER & search_path
WITH expected_functions AS (
  SELECT * FROM (VALUES
    ('correct_queue_entry',         'p_entry_id uuid, p_customer_name text, p_service_ids uuid[]', 'jsonb', 'postgres'),
    ('start_service_with_actor',    'p_staff_id uuid, p_entry_id uuid, p_actor_role text',         'jsonb', 'postgres'),
    ('complete_service_with_actor', 'p_staff_id uuid, p_entry_id uuid, p_actor_role text',         'jsonb', 'postgres')
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
      'correct_queue_entry',
      'start_service_with_actor',
      'complete_service_with_actor'
    )
)
SELECT
  COALESCE(e.routine_name, a.routine_name) AS routine_name,
  a.owner_role,
  a.actual_identity_args,
  a.actual_return_type,
  a.is_security_definer,
  a.has_empty_search_path,
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

-- QUERY 2: Effective Function EXECUTE Privileges (strictly owner + service_role)
WITH expected_functions AS (
  SELECT * FROM (VALUES
    ('correct_queue_entry',         'p_entry_id uuid, p_customer_name text, p_service_ids uuid[]'),
    ('start_service_with_actor',    'p_staff_id uuid, p_entry_id uuid, p_actor_role text'),
    ('complete_service_with_actor', 'p_staff_id uuid, p_entry_id uuid, p_actor_role text')
  ) AS t(routine_name, expected_identity_args)
),
func_acl AS (
  SELECT
    p.oid AS func_oid,
    p.proowner AS owner_oid,
    p.proname AS routine_name,
    pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_args,
    BOOL_OR(acl.grantee = p.proowner AND acl.privilege_type = 'EXECUTE') AS owner_has_execute_acl,
    BOOL_OR(gr.rolname = 'service_role' AND acl.privilege_type = 'EXECUTE') AS service_role_has_execute_acl,
    pg_catalog.string_agg(acl.privilege_type, ', ' ORDER BY acl.privilege_type)
      FILTER (WHERE acl.grantee = 0) AS public_acl_privileges,
    pg_catalog.string_agg(
      COALESCE(gr.rolname, acl.grantee::TEXT) || ':' || acl.privilege_type,
      ', ' ORDER BY acl.grantee, acl.privilege_type
    ) FILTER (
      WHERE acl.privilege_type IS NOT NULL
        AND (acl.grantee = 0 OR (acl.grantee <> p.proowner AND COALESCE(gr.rolname, '') <> 'service_role'))
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
      'correct_queue_entry',
      'start_service_with_actor',
      'complete_service_with_actor'
    )
  GROUP BY p.oid, p.proowner, p.proname
),
role_execute_audit AS (
  SELECT
    f.func_oid,
    pg_catalog.string_agg(r.rolname, ', ' ORDER BY r.rolname)
      FILTER (
        WHERE r.oid <> f.owner_oid
          AND r.rolname <> 'service_role'
          AND NOT r.rolsuper
          AND pg_catalog.has_function_privilege(r.rolname, f.func_oid, 'EXECUTE')
      ) AS unexpected_effective_execute_roles,
    pg_catalog.string_agg(r.rolname, ', ' ORDER BY r.rolname)
      FILTER (
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
  f.unexpected_acl_grants,
  f.public_acl_privileges,
  ra.unexpected_effective_execute_roles,
  ra.superuser_effective_execute_roles,
  CASE
    WHEN e.routine_name IS NULL THEN 'FAIL_UNEXPECTED_OVERLOAD'
    WHEN f.func_oid IS NULL THEN 'FAIL_MISSING_FUNCTION'
    WHEN f.unexpected_acl_grants IS NOT NULL
      OR f.public_acl_privileges IS NOT NULL
      OR pg_catalog.has_function_privilege('anon', f.func_oid, 'EXECUTE')
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
