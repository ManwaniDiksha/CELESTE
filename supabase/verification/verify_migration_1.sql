-- ============================================================================
-- CELESTE — Salon Queue Management System
-- Post-Execution Read-Only Catalog Verification for Migration 1
-- Target Migration: supabase/migrations/001_schema_and_indexes.sql
-- Approved Design:  docs/04-database-design.md
--
-- SAFETY: Strictly READ-ONLY SELECT queries against pg_catalog and
--         information_schema. Do not run any DDL/DML/DCL statements here.
-- ============================================================================

-- ============================================================================
-- SECTION 1A: UNIQUE Constraints (Expected: 6 across the 9 tables)
-- Compares constraint names AND actual ordered constrained columns.
-- ============================================================================
WITH expected_unique AS (
  SELECT * FROM (VALUES
    ('services',             'uq_services_service_key',     'service_key'),
    ('staff',                'uq_staff_slug',               'slug'),
    ('customers',            'uq_customers_phone',          'phone'),
    ('queue_entries',        'uq_queue_entries_date_token', 'queue_date, token_number'),
    ('queue_entry_services', 'uq_qes_entry_position',       'queue_entry_id, position'),
    ('queue_entry_services', 'uq_qes_entry_service',        'queue_entry_id, service_id')
  ) AS t(table_name, constraint_name, expected_columns)
),
actual_unique AS (
  SELECT
    cls.relname AS table_name,
    con.conname AS constraint_name,
    pg_catalog.string_agg(att.attname, ', ' ORDER BY k.ord) AS actual_columns,
    pg_catalog.pg_get_constraintdef(con.oid, true) AS actual_definition
  FROM pg_catalog.pg_constraint AS con
  JOIN pg_catalog.pg_class AS cls
    ON cls.oid = con.conrelid
  JOIN pg_catalog.pg_namespace AS ns
    ON ns.oid = cls.relnamespace
  CROSS JOIN LATERAL pg_catalog.unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
  JOIN pg_catalog.pg_attribute AS att
    ON att.attrelid = con.conrelid
   AND att.attnum = k.attnum
  WHERE ns.nspname = 'public'
    AND con.contype = 'u'
    AND cls.relname IN (
      'services', 'staff', 'staff_services', 'customers',
      'queue_entries', 'queue_entry_services', 'queue_status_history',
      'salon_settings', 'pin_auth_attempts'
    )
  GROUP BY cls.relname, con.conname, con.oid
)
SELECT
  COALESCE(e.table_name, a.table_name) AS table_name,
  COALESCE(e.constraint_name, a.constraint_name) AS constraint_name,
  e.expected_columns,
  a.actual_columns,
  a.actual_definition,
  CASE
    WHEN e.constraint_name IS NULL THEN 'UNEXPECTED'
    WHEN a.constraint_name IS NULL THEN 'MISSING'
    WHEN a.actual_columns = e.expected_columns THEN 'PASS'
    ELSE 'MISMATCH'
  END AS verification_status
FROM expected_unique AS e
FULL OUTER JOIN actual_unique AS a
  ON a.table_name = e.table_name
 AND a.constraint_name = e.constraint_name
ORDER BY table_name, constraint_name;

-- ============================================================================
-- SECTION 1B: CHECK Constraints (Expected: 40 domain & lifecycle checks)
-- Compares both constraint names AND normalized actual CHECK expressions.
-- ============================================================================
WITH expected_checks AS (
  SELECT * FROM (VALUES
    ('services',             'chk_services_service_key_format',         'service_key ~ ''^[a-z0-9-]+$''',                                                   '^CHECK service_key ~ ''\^\[a-z0-9-\]\+\$''$'),
    ('services',             'chk_services_category',                   'category IN (''Hair'', ''Beard & Grooming'', ''Skin'', ''Hands & Feet'')',          '^CHECK category (= ANY ARRAY\[|IN )''Hair'', ''Beard & Grooming'', ''Skin'', ''Hands & Feet''\]?$'),
    ('services',             'chk_services_name_en_nonempty',           'char_length(btrim(name_en)) > 0',                                                  '^CHECK char_length btrim name_en > 0$'),
    ('services',             'chk_services_name_gu_nonempty',           'char_length(btrim(name_gu)) > 0',                                                  '^CHECK char_length btrim name_gu > 0$'),
    ('services',             'chk_services_duration_positive',          'duration_minutes > 0',                                                             '^CHECK duration_minutes > 0$'),
    ('services',             'chk_services_price_nonnegative',          'price_inr >= 0',                                                                   '^CHECK price_inr >= 0$'),
    ('staff',                'chk_staff_slug_format',                   'slug ~ ''^[a-z0-9-]+$''',                                                          '^CHECK slug ~ ''\^\[a-z0-9-\]\+\$''$'),
    ('staff',                'chk_staff_name_en_nonempty',              'char_length(btrim(name_en)) > 0',                                                  '^CHECK char_length btrim name_en > 0$'),
    ('staff',                'chk_staff_name_gu_nonempty',              'char_length(btrim(name_gu)) > 0',                                                  '^CHECK char_length btrim name_gu > 0$'),
    ('staff',                'chk_staff_role_en_nonempty',              'char_length(btrim(role_en)) > 0',                                                  '^CHECK char_length btrim role_en > 0$'),
    ('staff',                'chk_staff_role_gu_nonempty',              'char_length(btrim(role_gu)) > 0',                                                  '^CHECK char_length btrim role_gu > 0$'),
    ('staff',                'chk_staff_speciality_en_nonempty',        'char_length(btrim(speciality_en)) > 0',                                            '^CHECK char_length btrim speciality_en > 0$'),
    ('staff',                'chk_staff_speciality_gu_nonempty',        'char_length(btrim(speciality_gu)) > 0',                                            '^CHECK char_length btrim speciality_gu > 0$'),
    ('staff',                'chk_staff_availability_status',           'availability_status IN (''Available'', ''Busy'', ''On Break'')',                   '^CHECK availability_status (= ANY ARRAY\[|IN )''Available'', ''Busy'', ''On Break''\]?$'),
    ('customers',            'chk_customers_name_nonempty',             'char_length(btrim(name)) > 0',                                                     '^CHECK char_length btrim name > 0$'),
    ('customers',            'chk_customers_phone_digits',              'phone ~ ''^[0-9]{10}$''',                                                          '^CHECK phone ~ ''\^\[0-9\]\{10\}\$''$'),
    ('queue_entries',        'chk_queue_entries_token_positive',        'token_number > 0',                                                                 '^CHECK token_number > 0$'),
    ('queue_entries',        'chk_queue_entries_source',                'source IN (''online'', ''walk_in'')',                                              '^CHECK source (= ANY ARRAY\[|IN )''online'', ''walk_in''\]?$'),
    ('queue_entries',        'chk_queue_entries_selection_mode',        'selection_mode IN (''specific'', ''any_available'')',                              '^CHECK selection_mode (= ANY ARRAY\[|IN )''specific'', ''any_available''\]?$'),
    ('queue_entries',        'chk_queue_entries_status',                'status IN (''Waiting'', ''Called'', ''In Chair'', ''Done'', ''Cancelled'', ''No-show'')', '^CHECK status (= ANY ARRAY\[|IN )''Waiting'', ''Called'', ''In Chair'', ''Done'', ''Cancelled'', ''No-show''\]?$'),
    ('queue_entries',        'chk_queue_entries_cancelled_by',          'cancelled_by IN (''customer'', ''reception'', ''system'')',                          '^CHECK cancelled_by (= ANY ARRAY\[|IN )''customer'', ''reception'', ''system''\]?$'),
    ('queue_entries',        'chk_qe_waiting',                          'status <> ''Waiting'' OR (called_at, started_at, completed_at, cancelled_at, cancelled_by, no_show_at IS NULL)', '^CHECK status <> ''Waiting'' OR called_at IS NULL AND started_at IS NULL AND completed_at IS NULL AND cancelled_at IS NULL AND cancelled_by IS NULL AND no_show_at IS NULL$'),
    ('queue_entries',        'chk_qe_called',                           'status <> ''Called'' OR (called_at NOT NULL AND started_at, completed_at, cancelled_at, cancelled_by, no_show_at IS NULL)', '^CHECK status <> ''Called'' OR called_at IS NOT NULL AND started_at IS NULL AND completed_at IS NULL AND cancelled_at IS NULL AND cancelled_by IS NULL AND no_show_at IS NULL$'),
    ('queue_entries',        'chk_qe_in_chair',                         'status <> ''In Chair'' OR (called_at, started_at NOT NULL AND completed_at, cancelled_at, cancelled_by, no_show_at IS NULL)', '^CHECK status <> ''In Chair'' OR called_at IS NOT NULL AND started_at IS NOT NULL AND completed_at IS NULL AND cancelled_at IS NULL AND cancelled_by IS NULL AND no_show_at IS NULL$'),
    ('queue_entries',        'chk_qe_done',                             'status <> ''Done'' OR (called_at, started_at, completed_at NOT NULL AND completed_at >= started_at AND cancelled_at, cancelled_by, no_show_at IS NULL)', '^CHECK status <> ''Done'' OR called_at IS NOT NULL AND started_at IS NOT NULL AND completed_at IS NOT NULL AND completed_at >= started_at AND cancelled_at IS NULL AND cancelled_by IS NULL AND no_show_at IS NULL$'),
    ('queue_entries',        'chk_qe_cancelled',                        'status <> ''Cancelled'' OR (cancelled_at, cancelled_by NOT NULL AND started_at, completed_at, no_show_at IS NULL)', '^CHECK status <> ''Cancelled'' OR cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL AND started_at IS NULL AND completed_at IS NULL AND no_show_at IS NULL$'),
    ('queue_entries',        'chk_qe_no_show',                          'status <> ''No-show'' OR (called_at, no_show_at NOT NULL AND no_show_at >= called_at + INTERVAL ''10 minutes'' AND started_at, completed_at, cancelled_at, cancelled_by IS NULL)', '^CHECK status <> ''No-show'' OR called_at IS NOT NULL AND no_show_at IS NOT NULL AND no_show_at >= called_at \+ ''(00:10:00|10 mins|10 minutes)'' AND started_at IS NULL AND completed_at IS NULL AND cancelled_at IS NULL AND cancelled_by IS NULL$'),
    ('queue_entry_services', 'chk_qes_position_range',                  'position BETWEEN 1 AND 3',                                                         '^CHECK (position >= 1 AND position <= 3|position BETWEEN 1 AND 3)$'),
    ('queue_entry_services', 'chk_qes_duration_positive',               'duration_minutes_snapshot > 0',                                                    '^CHECK duration_minutes_snapshot > 0$'),
    ('queue_entry_services', 'chk_qes_price_nonnegative',               'price_inr_snapshot >= 0',                                                          '^CHECK price_inr_snapshot >= 0$'),
    ('queue_status_history', 'chk_qsh_from_status',                     'from_status IN (''Waiting'', ''Called'', ''In Chair'', ''Done'', ''Cancelled'', ''No-show'')', '^CHECK from_status (= ANY ARRAY\[|IN )''Waiting'', ''Called'', ''In Chair'', ''Done'', ''Cancelled'', ''No-show''\]?$'),
    ('queue_status_history', 'chk_qsh_to_status',                       'to_status IN (''Waiting'', ''Called'', ''In Chair'', ''Done'', ''Cancelled'', ''No-show'')', '^CHECK to_status (= ANY ARRAY\[|IN )''Waiting'', ''Called'', ''In Chair'', ''Done'', ''Cancelled'', ''No-show''\]?$'),
    ('queue_status_history', 'chk_qsh_changed_by_role',                 'changed_by_role IN (''customer'', ''reception'', ''staff'', ''owner'', ''system'')', '^CHECK changed_by_role (= ANY ARRAY\[|IN )''customer'', ''reception'', ''staff'', ''owner'', ''system''\]?$'),
    ('salon_settings',       'chk_salon_settings_singleton',            'id = 1',                                                                           '^CHECK id = 1$'),
    ('salon_settings',       'chk_salon_settings_operating_hours_object', 'jsonb_typeof(operating_hours) = ''object''',                                     '^CHECK jsonb_typeof operating_hours = ''object''$'),
    ('salon_settings',       'chk_salon_settings_daily_capacity',       'daily_online_capacity >= 0',                                                       '^CHECK daily_online_capacity >= 0$'),
    ('salon_settings',       'chk_salon_settings_online_cutoff',        'online_cutoff_minutes >= 0',                                                       '^CHECK online_cutoff_minutes >= 0$'),
    ('salon_settings',       'chk_salon_settings_no_show_window',       'no_show_window_minutes = 10',                                                      '^CHECK no_show_window_minutes = 10$'),
    ('salon_settings',       'chk_salon_settings_max_services',         'max_services_per_entry = 3',                                                       '^CHECK max_services_per_entry = 3$'),
    ('pin_auth_attempts',    'chk_pin_auth_failed_count',               'failed_count >= 0',                                                                '^CHECK failed_count >= 0$')
  ) AS t(table_name, constraint_name, expected_definition, expected_pattern)
),
actual_checks AS (
  SELECT
    cls.relname AS table_name,
    con.conname AS constraint_name,
    pg_catalog.pg_get_constraintdef(con.oid, true) AS actual_definition,
    pg_catalog.btrim(
      pg_catalog.regexp_replace(
        pg_catalog.regexp_replace(
          pg_catalog.pg_get_constraintdef(con.oid, true),
          '::[a-z_ ]+|pg_catalog\.',
          '',
          'gi'
        ),
        '[()\s]+',
        ' ',
        'g'
      )
    ) AS actual_def_normalized
  FROM pg_catalog.pg_constraint AS con
  JOIN pg_catalog.pg_class AS cls
    ON cls.oid = con.conrelid
  JOIN pg_catalog.pg_namespace AS ns
    ON ns.oid = cls.relnamespace
  WHERE ns.nspname = 'public'
    AND con.contype = 'c'
    AND cls.relname IN (
      'services', 'staff', 'staff_services', 'customers',
      'queue_entries', 'queue_entry_services', 'queue_status_history',
      'salon_settings', 'pin_auth_attempts'
    )
)
SELECT
  COALESCE(e.table_name, a.table_name) AS table_name,
  COALESCE(e.constraint_name, a.constraint_name) AS constraint_name,
  e.expected_definition,
  a.actual_definition,
  CASE
    WHEN e.constraint_name IS NULL THEN 'UNEXPECTED'
    WHEN a.constraint_name IS NULL THEN 'MISSING'
    WHEN a.actual_def_normalized ~ e.expected_pattern THEN 'PASS'
    ELSE 'MISMATCH'
  END AS verification_status
FROM expected_checks AS e
FULL OUTER JOIN actual_checks AS a
  ON a.table_name = e.table_name
 AND a.constraint_name = e.constraint_name
ORDER BY table_name, constraint_name;

-- ============================================================================
-- SECTION 2A: Generated Column (queue_entries.token_display) Catalog Check
-- Always returns 1 row (FAIL_MISSING_COLUMN if absent). Verifies stored
-- generation, TEXT type, and exact branch structure of the catalog expression.
-- ============================================================================
WITH expected_col AS (
  SELECT 'queue_entries'::TEXT AS table_name, 'token_display'::TEXT AS column_name
),
token_col AS (
  SELECT
    cls.relname AS table_name,
    att.attname AS column_name,
    pg_catalog.format_type(att.atttypid, att.atttypmod) AS data_type,
    att.attnotnull AS is_not_null,
    att.attgenerated AS pg_attgenerated_code,
    isc.is_generated AS info_schema_is_generated,
    pg_catalog.pg_get_expr(ad.adbin, ad.adrelid) AS actual_generation_expression,
    pg_catalog.btrim(
      pg_catalog.regexp_replace(
        pg_catalog.regexp_replace(
          COALESCE(pg_catalog.pg_get_expr(ad.adbin, ad.adrelid), ''),
          '::[a-z_ ]+|pg_catalog\.',
          '',
          'gi'
        ),
        '[()\s]+',
        ' ',
        'g'
      )
    ) AS expr_normalized
  FROM pg_catalog.pg_attribute AS att
  JOIN pg_catalog.pg_class AS cls
    ON cls.oid = att.attrelid
  JOIN pg_catalog.pg_namespace AS ns
    ON ns.oid = cls.relnamespace
  LEFT JOIN pg_catalog.pg_attrdef AS ad
    ON ad.adrelid = att.attrelid
   AND ad.adnum = att.attnum
  LEFT JOIN information_schema.columns AS isc
    ON isc.table_schema = ns.nspname
   AND isc.table_name = cls.relname
   AND isc.column_name = att.attname
  WHERE ns.nspname = 'public'
    AND cls.relname = 'queue_entries'
    AND att.attname = 'token_display'
    AND NOT att.attisdropped
)
SELECT
  e.table_name,
  e.column_name,
  (t.column_name IS NOT NULL) AS column_exists,
  t.data_type,
  t.is_not_null,
  t.pg_attgenerated_code,
  t.info_schema_is_generated,
  t.actual_generation_expression,
  COALESCE(t.actual_generation_expression ~* '''S-''(::text)?\s*\|\|', false) AS has_s_dash_prefix,
  COALESCE(t.actual_generation_expression ~* 'WHEN\s+\(?token_number\s*<\s*100\)?', false) AS has_lt_100_condition,
  COALESCE(t.actual_generation_expression ~* 'THEN\s+(pg_catalog\.)?lpad\(\(?token_number\)?::text,\s*2,\s*''0''(::text)?\)', false) AS has_lpad_then_branch,
  COALESCE(t.actual_generation_expression ~* 'ELSE\s+\(?token_number\)?::text\s+END', false) AS has_text_else_branch,
  CASE
    WHEN t.column_name IS NULL THEN 'FAIL_MISSING_COLUMN'
    WHEN t.pg_attgenerated_code <> 's' OR t.data_type <> 'text' OR t.actual_generation_expression IS NULL THEN 'FAIL'
    WHEN (t.actual_generation_expression ~* '''S-''(::text)?\s*\|\|')
     AND (t.actual_generation_expression ~* 'WHEN\s+\(?token_number\s*<\s*100\)?')
     AND (t.actual_generation_expression ~* 'THEN\s+(pg_catalog\.)?lpad\(\(?token_number\)?::text,\s*2,\s*''0''(::text)?\)')
     AND (t.actual_generation_expression ~* 'ELSE\s+\(?token_number\)?::text\s+END')
     AND (t.expr_normalized ~* '^''S-'' \|\| CASE WHEN token_number < 100 THEN lpad token_number, 2, ''0'' ELSE token_number END$')
    THEN 'PASS'
    ELSE 'REVIEW_REQUIRED'
  END AS verification_status
FROM expected_col AS e
LEFT JOIN token_col AS t
  ON t.table_name = e.table_name
 AND t.column_name = e.column_name;

-- ============================================================================
-- SECTION 2B: Token Formatting Boundary Check (Independent Simulation Only)
-- Illustrates expected CASE + LPAD boundary behavior across 1..1000.
-- Does NOT inspect the database catalog (see Section 2A for catalog proof).
-- ============================================================================
SELECT
  v.token_number,
  'S-' || CASE
    WHEN v.token_number < 100 THEN pg_catalog.lpad(v.token_number::TEXT, 2, '0')
    ELSE v.token_number::TEXT
  END AS actual_output,
  v.expected_output,
  CASE
    WHEN (
      'S-' || CASE
        WHEN v.token_number < 100 THEN pg_catalog.lpad(v.token_number::TEXT, 2, '0')
        ELSE v.token_number::TEXT
      END
    ) = v.expected_output
    THEN 'PASS'
    ELSE 'FAIL'
  END AS verification_status
FROM (VALUES
  (1,    'S-01'),
  (9,    'S-09'),
  (10,   'S-10'),
  (99,   'S-99'),
  (100,  'S-100'),
  (105,  'S-105'),
  (1000, 'S-1000')
) AS v(token_number, expected_output);

-- ============================================================================
-- SECTION 3: Foreign Keys and ON DELETE / ON UPDATE Actions (Expected: 7)
-- ============================================================================
WITH expected_fks AS (
  SELECT * FROM (VALUES
    ('staff_services',       'fk_staff_services_staff',   'staff_id',          'staff',         'id', 'CASCADE',  'CASCADE'),
    ('staff_services',       'fk_staff_services_service', 'service_id',        'services',      'id', 'CASCADE',  'CASCADE'),
    ('queue_entries',        'fk_queue_entries_customer', 'customer_id',       'customers',     'id', 'RESTRICT', 'CASCADE'),
    ('queue_entries',        'fk_queue_entries_staff',    'assigned_staff_id', 'staff',         'id', 'RESTRICT', 'CASCADE'),
    ('queue_entry_services', 'fk_qes_queue_entry',        'queue_entry_id',    'queue_entries', 'id', 'CASCADE',  'CASCADE'),
    ('queue_entry_services', 'fk_qes_service',            'service_id',        'services',      'id', 'RESTRICT', 'CASCADE'),
    ('queue_status_history', 'fk_qsh_queue_entry',        'queue_entry_id',    'queue_entries', 'id', 'CASCADE',  'CASCADE')
  ) AS t(table_name, constraint_name, source_col, ref_table, ref_col, expected_on_delete, expected_on_update)
),
actual_fks AS (
  SELECT
    src_cls.relname AS table_name,
    con.conname AS constraint_name,
    pg_catalog.string_agg(src_att.attname, ', ' ORDER BY u.ord) AS source_col,
    ref_cls.relname AS ref_table,
    pg_catalog.string_agg(ref_att.attname, ', ' ORDER BY u.ord) AS ref_col,
    CASE con.confdeltype
      WHEN 'a' THEN 'NO ACTION'
      WHEN 'r' THEN 'RESTRICT'
      WHEN 'c' THEN 'CASCADE'
      WHEN 'n' THEN 'SET NULL'
      WHEN 'd' THEN 'SET DEFAULT'
      ELSE con.confdeltype::TEXT
    END AS actual_on_delete,
    CASE con.confupdtype
      WHEN 'a' THEN 'NO ACTION'
      WHEN 'r' THEN 'RESTRICT'
      WHEN 'c' THEN 'CASCADE'
      WHEN 'n' THEN 'SET NULL'
      WHEN 'd' THEN 'SET DEFAULT'
      ELSE con.confupdtype::TEXT
    END AS actual_on_update,
    pg_catalog.pg_get_constraintdef(con.oid, true) AS actual_definition
  FROM pg_catalog.pg_constraint AS con
  JOIN pg_catalog.pg_class AS src_cls
    ON src_cls.oid = con.conrelid
  JOIN pg_catalog.pg_namespace AS src_ns
    ON src_ns.oid = src_cls.relnamespace
  JOIN pg_catalog.pg_class AS ref_cls
    ON ref_cls.oid = con.confrelid
  CROSS JOIN LATERAL (
    SELECT
      con.conkey[s.ord] AS src_attnum,
      con.confkey[s.ord] AS ref_attnum,
      s.ord
    FROM pg_catalog.generate_subscripts(con.conkey, 1) AS s(ord)
  ) AS u
  JOIN pg_catalog.pg_attribute AS src_att
    ON src_att.attrelid = con.conrelid
   AND src_att.attnum = u.src_attnum
  JOIN pg_catalog.pg_attribute AS ref_att
    ON ref_att.attrelid = con.confrelid
   AND ref_att.attnum = u.ref_attnum
  WHERE src_ns.nspname = 'public'
    AND con.contype = 'f'
    AND src_cls.relname IN (
      'services', 'staff', 'staff_services', 'customers',
      'queue_entries', 'queue_entry_services', 'queue_status_history',
      'salon_settings', 'pin_auth_attempts'
    )
  GROUP BY src_cls.relname, con.conname, ref_cls.relname, con.confdeltype, con.confupdtype, con.oid
)
SELECT
  COALESCE(e.table_name, a.table_name) AS table_name,
  COALESCE(e.constraint_name, a.constraint_name) AS constraint_name,
  a.source_col,
  a.ref_table,
  a.ref_col,
  e.expected_on_delete,
  a.actual_on_delete,
  e.expected_on_update,
  a.actual_on_update,
  a.actual_definition,
  CASE
    WHEN e.constraint_name IS NULL THEN 'UNEXPECTED'
    WHEN a.constraint_name IS NULL THEN 'MISSING'
    WHEN a.source_col = e.source_col
     AND a.ref_table = e.ref_table
     AND a.ref_col = e.ref_col
     AND a.actual_on_delete = e.expected_on_delete
     AND a.actual_on_update = e.expected_on_update
    THEN 'PASS'
    ELSE 'MISMATCH'
  END AS verification_status
FROM expected_fks AS e
FULL OUTER JOIN actual_fks AS a
  ON a.table_name = e.table_name
 AND a.constraint_name = e.constraint_name
ORDER BY table_name, constraint_name;

-- ============================================================================
-- SECTION 4A: Explicitly Created Indexes (Expected: 11 = 2 partial unique + 9 lookup)
-- Excludes indexes automatically created by PRIMARY KEY and UNIQUE constraints.
-- Compares ordered indexed columns (incl. DESC), uniqueness, and predicates.
-- ============================================================================
WITH expected_explicit_indexes AS (
  SELECT * FROM (VALUES
    ('services',             'idx_services_active_order',            false, 'is_active, category, display_order',                          NULL,                                                                              NULL),
    ('staff',                'idx_staff_duty_avail',                 false, 'is_on_duty, availability_status, available_since',            NULL,                                                                              NULL),
    ('staff_services',       'idx_staff_services_service',           false, 'service_id, staff_id',                                        NULL,                                                                              NULL),
    ('queue_entries',        'uq_one_active_entry_per_customer_day', true,  'queue_date, customer_id',                                     'status IN (''Waiting'', ''Called'', ''In Chair'')',                               '^status (= ANY ARRAY\[|IN )''Waiting'', ''Called'', ''In Chair''\]?$'),
    ('queue_entries',        'uq_one_active_chair_per_staff_day',    true,  'queue_date, assigned_staff_id',                               'status IN (''Called'', ''In Chair'')',                                            '^status (= ANY ARRAY\[|IN )''Called'', ''In Chair''\]?$'),
    ('queue_entries',        'idx_queue_staff_fcfs',                 false, 'queue_date, assigned_staff_id, status, joined_at, token_number', NULL,                                                                              NULL),
    ('queue_entries',        'idx_queue_date_status_joined',         false, 'queue_date, status, joined_at',                               NULL,                                                                              NULL),
    ('queue_entries',        'idx_queue_online_capacity',            false, 'queue_date, source',                                          'status <> ''Cancelled''',                                                         '^status <> ''Cancelled''$'),
    ('queue_entries',        'idx_queue_demo_date',                  false, 'queue_date',                                                  'is_demo = TRUE',                                                                  '^(is_demo|is_demo = true)$'),
    ('queue_entry_services', 'idx_qes_service_id',                   false, 'service_id',                                                  NULL,                                                                              NULL),
    ('queue_status_history', 'idx_qsh_entry_time',                   false, 'queue_entry_id, changed_at DESC',                             NULL,                                                                              NULL)
  ) AS t(table_name, index_name, expected_is_unique, expected_columns, expected_predicate, expected_predicate_pattern)
),
actual_explicit_indexes AS (
  SELECT
    tbl.relname AS table_name,
    idx.relname AS index_name,
    am.amname AS access_method,
    ix.indisunique AS actual_is_unique,
    ix.indisvalid AS is_valid,
    ix.indnkeyatts,
    ix.indnatts,
    pg_catalog.string_agg(
      pg_catalog.pg_get_indexdef(idx.oid, k.pos, true),
      ', ' ORDER BY k.pos
    ) AS actual_columns,
    pg_catalog.string_agg(
      (ix.indoption[k.pos - 1])::TEXT,
      ',' ORDER BY k.pos
    ) AS indoption_flags,
    pg_catalog.pg_get_expr(ix.indpred, ix.indrelid) AS actual_partial_predicate,
    pg_catalog.btrim(
      pg_catalog.regexp_replace(
        pg_catalog.regexp_replace(
          COALESCE(pg_catalog.pg_get_expr(ix.indpred, ix.indrelid), ''),
          '::[a-z_ ]+|pg_catalog\.',
          '',
          'gi'
        ),
        '[()\s]+',
        ' ',
        'g'
      )
    ) AS actual_pred_normalized,
    pg_catalog.pg_get_indexdef(idx.oid) AS actual_indexdef
  FROM pg_catalog.pg_index AS ix
  JOIN pg_catalog.pg_class AS tbl
    ON tbl.oid = ix.indrelid
  JOIN pg_catalog.pg_class AS idx
    ON idx.oid = ix.indexrelid
  JOIN pg_catalog.pg_am AS am
    ON am.oid = idx.relam
  JOIN pg_catalog.pg_namespace AS ns
    ON ns.oid = tbl.relnamespace
  CROSS JOIN LATERAL pg_catalog.generate_series(1, ix.indnkeyatts) AS k(pos)
  WHERE ns.nspname = 'public'
    AND tbl.relname IN (
      'services', 'staff', 'staff_services', 'customers',
      'queue_entries', 'queue_entry_services', 'queue_status_history',
      'salon_settings', 'pin_auth_attempts'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint AS con
      WHERE con.conindid = ix.indexrelid
    )
  GROUP BY tbl.relname, idx.relname, idx.oid, am.amname, ix.indisunique, ix.indisvalid, ix.indnkeyatts, ix.indnatts, ix.indpred, ix.indrelid
)
SELECT
  COALESCE(e.table_name, a.table_name) AS table_name,
  COALESCE(e.index_name, a.index_name) AS index_name,
  e.expected_is_unique,
  a.actual_is_unique,
  e.expected_columns,
  a.actual_columns,
  a.indoption_flags,
  e.expected_predicate,
  a.actual_partial_predicate,
  a.access_method,
  a.is_valid,
  a.actual_indexdef,
  CASE
    WHEN e.index_name IS NULL THEN 'UNEXPECTED'
    WHEN a.index_name IS NULL THEN 'MISSING'
    WHEN a.is_valid = true
     AND a.access_method = 'btree'
     AND a.indnatts = a.indnkeyatts
     AND a.actual_is_unique = e.expected_is_unique
     AND a.actual_columns = e.expected_columns
     AND (
       (e.expected_predicate_pattern IS NULL AND a.actual_partial_predicate IS NULL)
       OR (
         e.expected_predicate_pattern IS NOT NULL
         AND a.actual_partial_predicate IS NOT NULL
         AND a.actual_pred_normalized ~* e.expected_predicate_pattern
       )
     )
    THEN 'PASS'
    ELSE 'MISMATCH'
  END AS verification_status
FROM expected_explicit_indexes AS e
FULL OUTER JOIN actual_explicit_indexes AS a
  ON a.table_name = e.table_name
 AND a.index_name = e.index_name
ORDER BY table_name, index_name;

-- ============================================================================
-- SECTION 4B: Complete Index Classification & Count Verification
-- Expected totals: 11 explicit (2 partial unique + 9 lookup), 9 PK, 6 UNIQUE = 26 total
-- ============================================================================
WITH classified_indexes AS (
  SELECT
    CASE
      WHEN con.contype = 'p' THEN 'PRIMARY_KEY_CONSTRAINT'
      WHEN con.contype = 'u' THEN 'UNIQUE_CONSTRAINT'
      WHEN ix.indisunique AND ix.indpred IS NOT NULL THEN 'EXPLICIT_PARTIAL_UNIQUE_INDEX'
      WHEN ix.indisunique THEN 'EXPLICIT_UNIQUE_INDEX'
      ELSE 'EXPLICIT_LOOKUP_INDEX'
    END AS index_category,
    tbl.relname || '.' || idx.relname AS qualified_index
  FROM pg_catalog.pg_index AS ix
  JOIN pg_catalog.pg_class AS tbl
    ON tbl.oid = ix.indrelid
  JOIN pg_catalog.pg_class AS idx
    ON idx.oid = ix.indexrelid
  JOIN pg_catalog.pg_namespace AS ns
    ON ns.oid = tbl.relnamespace
  LEFT JOIN pg_catalog.pg_constraint AS con
    ON con.conindid = ix.indexrelid
  WHERE ns.nspname = 'public'
    AND tbl.relname IN (
      'services', 'staff', 'staff_services', 'customers',
      'queue_entries', 'queue_entry_services', 'queue_status_history',
      'salon_settings', 'pin_auth_attempts'
    )
),
expected_counts AS (
  SELECT * FROM (VALUES
    ('EXPLICIT_PARTIAL_UNIQUE_INDEX', 2),
    ('EXPLICIT_LOOKUP_INDEX',         9),
    ('PRIMARY_KEY_CONSTRAINT',        9),
    ('UNIQUE_CONSTRAINT',             6)
  ) AS t(index_category, expected_count)
),
actual_by_category AS (
  SELECT
    index_category,
    COUNT(*)::INTEGER AS actual_count,
    pg_catalog.string_agg(qualified_index, ', ' ORDER BY qualified_index) AS indexes
  FROM classified_indexes
  GROUP BY index_category
),
category_rows AS (
  SELECT
    1 AS sort_group,
    COALESCE(e.index_category, a.index_category) AS index_category,
    COALESCE(e.expected_count, 0) AS expected_count,
    COALESCE(a.actual_count, 0) AS actual_count,
    a.indexes,
    CASE
      WHEN e.index_category IS NULL THEN 'UNEXPECTED_CATEGORY'
      WHEN COALESCE(a.actual_count, 0) = e.expected_count THEN 'PASS'
      ELSE 'MISMATCH'
    END AS verification_status
  FROM expected_counts AS e
  FULL OUTER JOIN actual_by_category AS a
    ON a.index_category = e.index_category
),
summary_rows AS (
  SELECT
    2 AS sort_group,
    'TOTAL_EXPLICIT_INDEXES' AS index_category,
    11 AS expected_count,
    COUNT(*) FILTER (
      WHERE index_category IN ('EXPLICIT_PARTIAL_UNIQUE_INDEX', 'EXPLICIT_UNIQUE_INDEX', 'EXPLICIT_LOOKUP_INDEX')
    )::INTEGER AS actual_count,
    NULL::TEXT AS indexes,
    CASE
      WHEN COUNT(*) FILTER (
        WHERE index_category IN ('EXPLICIT_PARTIAL_UNIQUE_INDEX', 'EXPLICIT_UNIQUE_INDEX', 'EXPLICIT_LOOKUP_INDEX')
      ) = 11 THEN 'PASS'
      ELSE 'MISMATCH'
    END AS verification_status
  FROM classified_indexes
  UNION ALL
  SELECT
    3 AS sort_group,
    'TOTAL_ALL_INDEXES' AS index_category,
    26 AS expected_count,
    COUNT(*)::INTEGER AS actual_count,
    NULL::TEXT AS indexes,
    CASE
      WHEN COUNT(*) = 26 THEN 'PASS'
      ELSE 'MISMATCH'
    END AS verification_status
  FROM classified_indexes
)
SELECT
  index_category,
  expected_count,
  actual_count,
  verification_status,
  indexes
FROM (
  SELECT * FROM category_rows
  UNION ALL
  SELECT * FROM summary_rows
) AS combined
ORDER BY sort_group, index_category;

-- ============================================================================
-- SECTION 5A: View Definition (public.daily_queue_statistics)
-- Always returns 1 row (FAIL_MISSING_VIEW if absent). Displays complete actual
-- view definition, verifies underlying table dependencies via pg_depend, and
-- exposes structural indicators for service pre-aggregation and Done-only
-- filtering. Returns REVIEW_REQUIRED for manual inspection of the SQL body.
-- ============================================================================
WITH expected_view AS (
  SELECT 'public'::TEXT AS schema_name, 'daily_queue_statistics'::TEXT AS view_name
),
view_info AS (
  SELECT
    cls.oid AS view_oid,
    ns.nspname AS schema_name,
    cls.relname AS view_name,
    pg_catalog.pg_get_userbyid(cls.relowner) AS view_owner,
    cls.reloptions AS view_options,
    pg_catalog.pg_get_viewdef(cls.oid, true) AS actual_view_definition
  FROM pg_catalog.pg_class AS cls
  JOIN pg_catalog.pg_namespace AS ns
    ON ns.oid = cls.relnamespace
  WHERE ns.nspname = 'public'
    AND cls.relname = 'daily_queue_statistics'
    AND cls.relkind = 'v'
),
view_table_deps AS (
  SELECT DISTINCT
    rw.ev_class AS view_oid,
    ref_cls.relname AS referenced_table
  FROM pg_catalog.pg_rewrite AS rw
  JOIN pg_catalog.pg_depend AS dep
    ON dep.objid = rw.oid
   AND dep.classid = 'pg_catalog.pg_rewrite'::regclass
  JOIN pg_catalog.pg_class AS ref_cls
    ON ref_cls.oid = dep.refobjid
  JOIN pg_catalog.pg_namespace AS ref_ns
    ON ref_ns.oid = ref_cls.relnamespace
  WHERE ref_ns.nspname = 'public'
    AND ref_cls.relkind = 'r'
    AND ref_cls.relname <> 'daily_queue_statistics'
)
SELECT
  e.schema_name,
  e.view_name,
  (v.view_oid IS NOT NULL) AS view_exists,
  v.view_owner,
  v.view_options,
  pg_catalog.string_agg(DISTINCT d.referenced_table, ', ' ORDER BY d.referenced_table) AS referenced_tables,
  (COALESCE(pg_catalog.bool_or(d.referenced_table = 'queue_entries'), false)
   AND COALESCE(pg_catalog.bool_or(d.referenced_table = 'queue_entry_services'), false)) AS has_expected_base_tables,
  COALESCE(v.actual_view_definition ~* 'group by[^;]*queue_entry_id', false) AS indicator_preaggregated_by_queue_entry_id,
  COALESCE(v.actual_view_definition ~* 'left join', false) AS indicator_left_join_from_queue_entries,
  COALESCE(v.actual_view_definition ~* 'sum\([^)]*service_count\)\s*filter\s*\(\s*where\s*\(?[a-z_]+\.status\s*=\s*''Done''(::text)?\)?\s*\)', false) AS indicator_done_filter_on_completed_services,
  COALESCE(v.actual_view_definition ~* 'sum\([^)]*total_price_inr\)\s*filter\s*\(\s*where\s*\(?[a-z_]+\.status\s*=\s*''Done''(::text)?\)?\s*\)', false) AS indicator_done_filter_on_revenue,
  v.actual_view_definition,
  CASE
    WHEN v.view_oid IS NULL THEN 'FAIL_MISSING_VIEW'
    WHEN NOT (COALESCE(pg_catalog.bool_or(d.referenced_table = 'queue_entries'), false)
          AND COALESCE(pg_catalog.bool_or(d.referenced_table = 'queue_entry_services'), false))
    THEN 'FAIL_MISSING_BASE_TABLES'
    ELSE 'REVIEW_REQUIRED'
  END AS verification_status
FROM expected_view AS e
LEFT JOIN view_info AS v
  ON v.schema_name = e.schema_name
 AND v.view_name = e.view_name
LEFT JOIN view_table_deps AS d
  ON d.view_oid = v.view_oid
GROUP BY e.schema_name, e.view_name, v.view_oid, v.view_owner, v.view_options, v.actual_view_definition;

-- ============================================================================
-- SECTION 5B: View Output Columns (Expected: 10 columns)
-- ============================================================================
WITH expected_view_cols AS (
  SELECT * FROM (VALUES
    (1,  'queue_date',               'date'),
    (2,  'total_entries',            'bigint'),
    (3,  'waiting_count',            'bigint'),
    (4,  'called_count',             'bigint'),
    (5,  'in_chair_count',           'bigint'),
    (6,  'served_count',             'bigint'),
    (7,  'cancelled_count',          'bigint'),
    (8,  'no_show_count',            'bigint'),
    (9,  'completed_services_count', 'numeric'),
    (10, 'daily_revenue_inr',        'numeric')
  ) AS t(ordinal_position, column_name, expected_data_type)
),
actual_view_cols AS (
  SELECT
    ordinal_position,
    column_name,
    data_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'daily_queue_statistics'
)
SELECT
  COALESCE(e.ordinal_position, a.ordinal_position) AS ordinal_position,
  COALESCE(e.column_name, a.column_name) AS column_name,
  e.expected_data_type,
  a.data_type AS actual_data_type,
  CASE
    WHEN e.column_name IS NULL THEN 'UNEXPECTED'
    WHEN a.column_name IS NULL THEN 'MISSING'
    WHEN a.ordinal_position = e.ordinal_position AND a.data_type = e.expected_data_type THEN 'PASS'
    ELSE 'MISMATCH'
  END AS verification_status
FROM expected_view_cols AS e
FULL OUTER JOIN actual_view_cols AS a
  ON a.column_name = e.column_name
ORDER BY ordinal_position;

-- ============================================================================
-- SECTION 6A: Non-System Triggers on the 9 Tables (Expected: 0 rows in Migration 1)
-- ============================================================================
SELECT
  cls.relname AS table_name,
  trg.tgname AS trigger_name,
  pg_catalog.pg_get_triggerdef(trg.oid, true) AS trigger_definition,
  'UNEXPECTED_TRIGGER' AS verification_status
FROM pg_catalog.pg_trigger AS trg
JOIN pg_catalog.pg_class AS cls
  ON cls.oid = trg.tgrelid
JOIN pg_catalog.pg_namespace AS ns
  ON ns.oid = cls.relnamespace
WHERE ns.nspname = 'public'
  AND NOT trg.tgisinternal
  AND cls.relname IN (
    'services', 'staff', 'staff_services', 'customers',
    'queue_entries', 'queue_entry_services', 'queue_status_history',
    'salon_settings', 'pin_auth_attempts'
  )
ORDER BY table_name, trigger_name;

-- ============================================================================
-- SECTION 6B: Functions / Procedures in public Schema (Expected: 0 created by Migration 1)
-- Uses catalog evidence (pg_depend/pg_extension, pg_event_trigger, proowner)
-- to separate Migration 1 dependencies, extension/platform routines, and
-- routines requiring manual review rather than assuming origin by name alone.
-- ============================================================================
SELECT
  ns.nspname AS schema_name,
  p.proname AS routine_name,
  CASE p.prokind
    WHEN 'f' THEN 'function'
    WHEN 'p' THEN 'procedure'
    WHEN 'a' THEN 'aggregate'
    WHEN 'w' THEN 'window'
    ELSE p.prokind::TEXT
  END AS routine_kind,
  pg_catalog.pg_get_function_identity_arguments(p.oid) AS arguments,
  pg_catalog.pg_get_userbyid(p.proowner) AS owner_role,
  p.prosecdef AS is_security_definer,
  ext.extname AS owning_extension,
  evt.evtname AS event_trigger_name,
  EXISTS (
    SELECT 1
    FROM pg_catalog.pg_depend AS dep
    JOIN pg_catalog.pg_class AS m1_cls
      ON m1_cls.oid = dep.objid
    JOIN pg_catalog.pg_namespace AS m1_ns
      ON m1_ns.oid = m1_cls.relnamespace
    WHERE dep.refobjid = p.oid
      AND m1_ns.nspname = 'public'
      AND m1_cls.relname IN (
        'services', 'staff', 'staff_services', 'customers',
        'queue_entries', 'queue_entry_services', 'queue_status_history',
        'salon_settings', 'pin_auth_attempts', 'daily_queue_statistics'
      )
  ) AS referenced_by_migration_1_object,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM pg_catalog.pg_depend AS dep
      JOIN pg_catalog.pg_class AS m1_cls
        ON m1_cls.oid = dep.objid
      JOIN pg_catalog.pg_namespace AS m1_ns
        ON m1_ns.oid = m1_cls.relnamespace
      WHERE dep.refobjid = p.oid
        AND m1_ns.nspname = 'public'
        AND m1_cls.relname IN (
          'services', 'staff', 'staff_services', 'customers',
          'queue_entries', 'queue_entry_services', 'queue_status_history',
          'salon_settings', 'pin_auth_attempts', 'daily_queue_statistics'
        )
    ) THEN 'UNEXPECTED_MIGRATION_1_DEPENDENCY'
    WHEN ext.extname IS NOT NULL THEN 'EXTENSION_MANAGED (' || ext.extname || ')'
    WHEN evt.evtname IS NOT NULL
     AND p.proname = 'rls_auto_enable'
     AND pg_catalog.pg_get_userbyid(p.proowner) IN ('supabase_admin', 'postgres')
    THEN 'KNOWN_SUPABASE_MANAGED (event trigger: ' || evt.evtname || ')'
    ELSE 'MANUAL_REVIEW_REQUIRED (not linked to Migration 1 or extensions)'
  END AS classification
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_namespace AS ns
  ON ns.oid = p.pronamespace
LEFT JOIN pg_catalog.pg_depend AS ext_dep
  ON ext_dep.objid = p.oid
 AND ext_dep.deptype = 'e'
LEFT JOIN pg_catalog.pg_extension AS ext
  ON ext.oid = ext_dep.refobjid
LEFT JOIN pg_catalog.pg_event_trigger AS evt
  ON evt.evtfoid = p.oid
WHERE ns.nspname = 'public'
ORDER BY routine_name;

-- ============================================================================
-- SECTION 6C: Event Triggers (To verify whether rls_auto_enable is platform-managed)
-- ============================================================================
SELECT
  evt.evtname AS event_trigger_name,
  evt.evtevent AS trigger_event,
  evt.evtenabled AS enabled_mode,
  p.proname AS function_name,
  ns.nspname AS function_schema
FROM pg_catalog.pg_event_trigger AS evt
JOIN pg_catalog.pg_proc AS p
  ON p.oid = evt.evtfoid
JOIN pg_catalog.pg_namespace AS ns
  ON ns.oid = p.pronamespace
ORDER BY event_trigger_name;

-- ============================================================================
-- SECTION 7A: Row Level Security (RLS) Status & Policy Count on 9 Tables
-- Migration 1 includes no RLS statements; note that Supabase's rls_auto_enable
-- event trigger may enable RLS automatically on new public tables with 0 policies.
-- ============================================================================
SELECT
  cls.relname AS table_name,
  cls.relrowsecurity AS rls_enabled,
  cls.relforcerowsecurity AS rls_forced,
  COUNT(pol.policyname) AS policy_count
FROM pg_catalog.pg_class AS cls
JOIN pg_catalog.pg_namespace AS ns
  ON ns.oid = cls.relnamespace
LEFT JOIN pg_catalog.pg_policies AS pol
  ON pol.schemaname = ns.nspname
 AND pol.tablename = cls.relname
WHERE ns.nspname = 'public'
  AND cls.relkind = 'r'
  AND cls.relname IN (
    'services', 'staff', 'staff_services', 'customers',
    'queue_entries', 'queue_entry_services', 'queue_status_history',
    'salon_settings', 'pin_auth_attempts'
  )
GROUP BY cls.relname, cls.relrowsecurity, cls.relforcerowsecurity
ORDER BY cls.relname;

-- ============================================================================
-- SECTION 7B: RLS Policies on 9 Tables (Expected: 0 rows in Migration 1)
-- ============================================================================
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check,
  'UNEXPECTED_POLICY' AS verification_status
FROM pg_catalog.pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'services', 'staff', 'staff_services', 'customers',
    'queue_entries', 'queue_entry_services', 'queue_status_history',
    'salon_settings', 'pin_auth_attempts'
  )
ORDER BY tablename, policyname;

-- ============================================================================
-- SECTION 7C: Table & View Privileges for anon, authenticated, service_role, PUBLIC
-- Migration 1 includes no explicit GRANT/REVOKE statements; any privileges shown
-- here reflect Supabase schema default privileges prior to Migration 3 hardening.
-- ============================================================================
SELECT
  cls.relname AS object_name,
  CASE cls.relkind
    WHEN 'r' THEN 'table'
    WHEN 'v' THEN 'view'
    ELSE cls.relkind::TEXT
  END AS object_type,
  CASE
    WHEN acl.grantee = 0 THEN 'PUBLIC'
    ELSE acl.grantee::regrole::TEXT
  END AS grantee,
  pg_catalog.string_agg(acl.privilege_type, ', ' ORDER BY acl.privilege_type) AS privileges,
  pg_catalog.bool_or(acl.is_grantable) AS any_with_grant_option
FROM pg_catalog.pg_class AS cls
JOIN pg_catalog.pg_namespace AS ns
  ON ns.oid = cls.relnamespace
CROSS JOIN LATERAL pg_catalog.aclexplode(
  COALESCE(cls.relacl, pg_catalog.acldefault('r'::"char", cls.relowner))
) AS acl
WHERE ns.nspname = 'public'
  AND cls.relname IN (
    'services', 'staff', 'staff_services', 'customers',
    'queue_entries', 'queue_entry_services', 'queue_status_history',
    'salon_settings', 'pin_auth_attempts', 'daily_queue_statistics'
  )
  AND (
    acl.grantee = 0
    OR acl.grantee::regrole::TEXT IN ('anon', 'authenticated', 'service_role')
  )
GROUP BY 1, 2, 3
ORDER BY object_name, grantee;
