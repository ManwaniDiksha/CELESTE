-- ============================================================================
-- CELESTE — Salon Queue Management System
-- Read-Only Verification Script for Migration 002 (Functions & Triggers)
--
-- SAFETY: Strictly READ-ONLY SELECT queries against pg_catalog.
--         Do not execute any DDL/DML/DCL statements here.
-- ============================================================================

-- ============================================================================
-- QUERY 1: Functions, Signatures, Return Types, SECURITY DEFINER & search_path
-- Checks all 14 backend RPCs + 3 trigger-only functions.
-- ============================================================================
WITH expected_functions AS (
  SELECT * FROM (VALUES
    ('set_updated_at',                        '',                                                                                      'trigger', true),
    ('enforce_queue_status_transition',       '',                                                                                      'trigger', true),
    ('log_queue_status_change',               '',                                                                                      'trigger', true),
    ('get_ist_date',                          '',                                                                                      'date',    false),
    ('is_business_day_closed',                'p_date date',                                                                           'boolean', false),
    ('run_end_of_day_cleanup',                '',                                                                                      'jsonb',   false),
    ('initialize_new_day_staff_availability', '',                                                                                      'jsonb',   false),
    ('set_staff_availability',                'p_staff_id uuid, p_status text, p_actor_role text',                                     'jsonb',   false),
    ('set_staff_duty',                        'p_staff_id uuid, p_is_on_duty boolean',                                                 'jsonb',   false),
    ('join_queue',                            'p_name text, p_phone text, p_service_ids uuid[], p_selection_mode text, p_preferred_staff_id uuid, p_source text, p_is_demo boolean', 'jsonb', false),
    ('acknowledge_start_coming',              'p_entry_id uuid',                                                                       'jsonb',   false),
    ('call_next_customer',                    'p_staff_id uuid',                                                                       'jsonb',   false),
    ('start_service',                         'p_staff_id uuid, p_entry_id uuid',                                                      'jsonb',   false),
    ('complete_service',                      'p_staff_id uuid, p_entry_id uuid',                                                      'jsonb',   false),
    ('mark_no_show',                          'p_entry_id uuid',                                                                       'jsonb',   false),
    ('cancel_queue_entry',                    'p_entry_id uuid, p_actor_role text',                                                    'jsonb',   false),
    ('reset_demo_data',                       '',                                                                                      'jsonb',   false)
  ) AS t(routine_name, expected_identity_args, expected_return_type, is_trigger_only)
),
actual_functions AS (
  SELECT
    p.oid AS func_oid,
    p.proname AS routine_name,
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
)
SELECT
  COALESCE(e.routine_name, a.routine_name) AS routine_name,
  e.is_trigger_only,
  e.expected_identity_args,
  a.actual_identity_args,
  e.expected_return_type,
  a.actual_return_type,
  a.is_security_definer,
  a.has_empty_search_path,
  a.function_config,
  CASE
    WHEN e.routine_name IS NULL AND a.routine_name = 'rls_auto_enable'
      THEN 'PLATFORM_DEFAULT_INFO'
    WHEN e.routine_name IS NULL
      THEN 'UNEXPECTED_FUNCTION'
    WHEN a.func_oid IS NULL
      THEN 'MISSING'
    WHEN a.actual_identity_args = e.expected_identity_args
     AND a.actual_return_type = e.expected_return_type
     AND a.is_security_definer = true
     AND a.has_empty_search_path = true
    THEN 'PASS'
    ELSE 'MISMATCH'
  END AS verification_status
FROM expected_functions AS e
FULL OUTER JOIN actual_functions AS a
  ON a.routine_name = e.routine_name
 AND a.actual_identity_args = e.expected_identity_args
ORDER BY COALESCE(e.is_trigger_only, false) DESC, routine_name;

-- ============================================================================
-- QUERY 2: Function EXECUTE Privileges (PUBLIC, anon, authenticated, service_role)
-- Checks PUBLIC via pg_catalog.aclexplode() (grantee = 0) and checks anon,
-- authenticated, and service_role via pg_catalog.has_function_privilege().
-- Trigger-only functions must NOT grant EXECUTE to service_role, anon,
-- authenticated, or PUBLIC.
-- ============================================================================
WITH expected_functions AS (
  SELECT * FROM (VALUES
    ('set_updated_at',                        '',                                                                                      true),
    ('enforce_queue_status_transition',       '',                                                                                      true),
    ('log_queue_status_change',               '',                                                                                      true),
    ('get_ist_date',                          '',                                                                                      false),
    ('is_business_day_closed',                'p_date date',                                                                           false),
    ('run_end_of_day_cleanup',                '',                                                                                      false),
    ('initialize_new_day_staff_availability', '',                                                                                      false),
    ('set_staff_availability',                'p_staff_id uuid, p_status text, p_actor_role text',                                     false),
    ('set_staff_duty',                        'p_staff_id uuid, p_is_on_duty boolean',                                                 false),
    ('join_queue',                            'p_name text, p_phone text, p_service_ids uuid[], p_selection_mode text, p_preferred_staff_id uuid, p_source text, p_is_demo boolean', false),
    ('acknowledge_start_coming',              'p_entry_id uuid',                                                                       false),
    ('call_next_customer',                    'p_staff_id uuid',                                                                       false),
    ('start_service',                         'p_staff_id uuid, p_entry_id uuid',                                                      false),
    ('complete_service',                      'p_staff_id uuid, p_entry_id uuid',                                                      false),
    ('mark_no_show',                          'p_entry_id uuid',                                                                       false),
    ('cancel_queue_entry',                    'p_entry_id uuid, p_actor_role text',                                                    false),
    ('reset_demo_data',                       '',                                                                                      false)
  ) AS t(routine_name, expected_identity_args, is_trigger_only)
),
func_acl AS (
  SELECT
    p.oid AS func_oid,
    p.proname AS routine_name,
    pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_args,
    pg_catalog.string_agg(acl.privilege_type, ', ' ORDER BY acl.privilege_type)
      FILTER (WHERE acl.grantee = 0) AS public_acl_privileges
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS ns
    ON ns.oid = p.pronamespace
  LEFT JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(p.proacl, pg_catalog.acldefault('f'::"char", p.proowner))
  ) AS acl
    ON true
  WHERE ns.nspname = 'public'
    AND p.prokind = 'f'
  GROUP BY p.oid, p.proname
)
SELECT
  COALESCE(e.routine_name, f.routine_name) AS routine_name,
  COALESCE(e.is_trigger_only, false) AS is_trigger_only,
  f.public_acl_privileges,
  CASE WHEN f.func_oid IS NOT NULL THEN pg_catalog.has_function_privilege('anon',          f.func_oid, 'EXECUTE') END AS anon_execute,
  CASE WHEN f.func_oid IS NOT NULL THEN pg_catalog.has_function_privilege('authenticated', f.func_oid, 'EXECUTE') END AS auth_execute,
  CASE WHEN f.func_oid IS NOT NULL THEN pg_catalog.has_function_privilege('service_role',  f.func_oid, 'EXECUTE') END AS service_role_execute,
  CASE
    WHEN e.routine_name IS NULL AND f.routine_name = 'rls_auto_enable'
      THEN 'PLATFORM_DEFAULT_INFO'
    WHEN e.routine_name IS NULL AND (
      f.public_acl_privileges IS NOT NULL
      OR pg_catalog.has_function_privilege('anon',          f.func_oid, 'EXECUTE')
      OR pg_catalog.has_function_privilege('authenticated', f.func_oid, 'EXECUTE')
    )
      THEN 'FAIL_UNEXPECTED_PUBLIC_FUNCTION_GRANT'
    WHEN e.routine_name IS NULL
      THEN 'UNEXPECTED_FUNCTION'
    WHEN f.func_oid IS NULL
      THEN 'MISSING'
    WHEN f.public_acl_privileges IS NOT NULL
      OR pg_catalog.has_function_privilege('anon',          f.func_oid, 'EXECUTE')
      OR pg_catalog.has_function_privilege('authenticated', f.func_oid, 'EXECUTE')
      THEN 'FAIL_PUBLIC_OR_BROWSER_EXECUTE'
    WHEN e.is_trigger_only
     AND NOT pg_catalog.has_function_privilege('service_role', f.func_oid, 'EXECUTE')
      THEN 'PASS'
    WHEN NOT e.is_trigger_only
     AND pg_catalog.has_function_privilege('service_role', f.func_oid, 'EXECUTE')
      THEN 'PASS'
    ELSE 'FAIL_PRIVILEGE_MISMATCH'
  END AS verification_status
FROM expected_functions AS e
FULL OUTER JOIN func_acl AS f
  ON f.routine_name = e.routine_name
 AND f.identity_args = e.expected_identity_args
ORDER BY is_trigger_only DESC, routine_name;

-- ============================================================================
-- QUERY 3: Triggers Attached to CELESTE Tables (Expected: 8 triggers)
-- ============================================================================
WITH expected_triggers AS (
  SELECT * FROM (VALUES
    ('services',             'trg_services_set_updated_at',          'set_updated_at',                  'BEFORE UPDATE'),
    ('staff',                'trg_staff_set_updated_at',             'set_updated_at',                  'BEFORE UPDATE'),
    ('customers',            'trg_customers_set_updated_at',         'set_updated_at',                  'BEFORE UPDATE'),
    ('queue_entries',        'trg_queue_entries_set_updated_at',     'set_updated_at',                  'BEFORE UPDATE'),
    ('salon_settings',       'trg_salon_settings_set_updated_at',    'set_updated_at',                  'BEFORE UPDATE'),
    ('pin_auth_attempts',    'trg_pin_auth_attempts_set_updated_at', 'set_updated_at',                  'BEFORE UPDATE'),
    ('queue_entries',        'trg_queue_entries_enforce_transition', 'enforce_queue_status_transition', 'BEFORE UPDATE OF status'),
    ('queue_entries',        'trg_queue_entries_log_status_change',  'log_queue_status_change',         'AFTER INSERT OR UPDATE OF status')
  ) AS t(table_name, trigger_name, expected_function_name, expected_timing_event)
),
actual_triggers AS (
  SELECT
    cls.relname AS table_name,
    trg.tgname AS trigger_name,
    p.proname AS actual_function_name,
    pns.nspname AS actual_function_schema,
    trg.tgenabled AS enabled_state,
    pg_catalog.pg_get_triggerdef(trg.oid, true) AS actual_triggerdef
  FROM pg_catalog.pg_trigger AS trg
  JOIN pg_catalog.pg_class AS cls
    ON cls.oid = trg.tgrelid
  JOIN pg_catalog.pg_namespace AS ns
    ON ns.oid = cls.relnamespace
  JOIN pg_catalog.pg_proc AS p
    ON p.oid = trg.tgfoid
  JOIN pg_catalog.pg_namespace AS pns
    ON pns.oid = p.pronamespace
  WHERE ns.nspname = 'public'
    AND NOT trg.tgisinternal
    AND cls.relname IN (
      'services', 'staff', 'staff_services', 'customers',
      'queue_entries', 'queue_entry_services', 'queue_status_history',
      'salon_settings', 'pin_auth_attempts'
    )
)
SELECT
  COALESCE(e.table_name, a.table_name) AS table_name,
  COALESCE(e.trigger_name, a.trigger_name) AS trigger_name,
  e.expected_function_name,
  a.actual_function_name,
  a.actual_function_schema,
  e.expected_timing_event,
  a.enabled_state,
  a.actual_triggerdef,
  CASE
    WHEN e.trigger_name IS NULL THEN 'UNEXPECTED_TRIGGER'
    WHEN a.trigger_name IS NULL THEN 'MISSING'
    WHEN a.actual_function_name = e.expected_function_name
     AND a.actual_function_schema = 'public'
     AND a.enabled_state = 'O'
     AND a.actual_triggerdef ~* e.expected_timing_event
    THEN 'PASS'
    ELSE 'MISMATCH'
  END AS verification_status
FROM expected_triggers AS e
FULL OUTER JOIN actual_triggers AS a
  ON a.table_name = e.table_name
 AND a.trigger_name = e.trigger_name
ORDER BY table_name, trigger_name;
