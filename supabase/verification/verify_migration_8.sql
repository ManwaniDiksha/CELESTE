-- ============================================================================
-- CELESTE — Salon Queue Management System
-- Read-Only Verification Script for Migration 008
--
-- SAFETY: Strictly READ-ONLY SELECT queries against pg_catalog.
-- ============================================================================

WITH expected_functions AS (
  SELECT * FROM (VALUES
    ('owner_create_service',           'p_category text, p_name_en text, p_name_gu text, p_duration_minutes integer, p_price_inr integer, p_is_active boolean, p_staff_ids uuid[], p_service_key text', 'jsonb', 'postgres'),
    ('owner_update_service',           'p_service_id uuid, p_category text, p_name_en text, p_name_gu text, p_duration_minutes integer, p_price_inr integer, p_is_active boolean, p_staff_ids uuid[]',       'jsonb', 'postgres'),
    ('owner_update_staff_profile',     'p_staff_id uuid, p_slug text, p_name_en text, p_name_gu text, p_role_en text, p_role_gu text, p_speciality_en text, p_speciality_gu text',                               'jsonb', 'postgres'),
    ('owner_set_staff_qualifications', 'p_staff_id uuid, p_service_ids uuid[]',                                                                                                                                   'jsonb', 'postgres'),
    ('owner_toggle_qualification',     'p_staff_id uuid, p_service_id uuid, p_qualified boolean',                                                                                                                 'jsonb', 'postgres'),
    ('owner_update_salon_settings',    'p_operating_hours jsonb, p_is_online_queue_open boolean, p_daily_online_capacity integer, p_online_cutoff_minutes integer',                                               'jsonb', 'postgres')
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
      'owner_create_service',
      'owner_update_service',
      'owner_update_staff_profile',
      'owner_set_staff_qualifications',
      'owner_toggle_qualification',
      'owner_update_salon_settings'
    )
)
SELECT
  COALESCE(e.routine_name, a.routine_name) AS routine_name,
  a.owner_role,
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
ORDER BY routine_name;
