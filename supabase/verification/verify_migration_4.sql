-- ============================================================================
-- CELESTE — Salon Queue Management System
-- Read-Only Verification Script for Migration 004 (Initial & Demo Seed Data)
--
-- SAFETY: Strictly READ-ONLY SELECT queries against public tables & pg_catalog.
--         Do not execute any DDL/DML/DCL statements here.
-- ============================================================================

-- ============================================================================
-- QUERY 1: Singleton public.salon_settings (id = 1) Verification
-- ============================================================================
WITH settings_summary AS (
  SELECT
    COUNT(*)::INTEGER AS total_rows,
    COUNT(*) FILTER (WHERE s.id = 1)::INTEGER AS id_1_rows
  FROM public.salon_settings AS s
)
SELECT
  ss.total_rows,
  ss.id_1_rows,
  s.id,
  s.salon_name,
  s.timezone,
  s.is_online_queue_open,
  s.daily_online_capacity,
  s.online_cutoff_minutes,
  s.no_show_window_minutes,
  s.max_services_per_entry,
  s.last_staff_init_date,
  (
    s.operating_hours ?& ARRAY['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
    AND (s.operating_hours -> 'mon' ->> 'open')  = '10:00'
    AND (s.operating_hours -> 'mon' ->> 'close') = '21:00'
    AND (s.operating_hours -> 'sat' ->> 'open')  = '09:00'
    AND (s.operating_hours -> 'sat' ->> 'close') = '22:00'
    AND (s.operating_hours -> 'sun' ->> 'open')  = '10:00'
    AND (s.operating_hours -> 'sun' ->> 'close') = '20:00'
  ) AS has_expected_hours,
  CASE
    WHEN ss.total_rows = 1
     AND ss.id_1_rows = 1
     AND s.salon_name = 'CELESTE'
     AND s.timezone = 'Asia/Kolkata'
     AND s.no_show_window_minutes = 10
     AND s.max_services_per_entry = 3
     AND s.operating_hours ?& ARRAY['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
      THEN 'PASS'
    ELSE 'FAIL_SALON_SETTINGS'
  END AS verification_status
FROM settings_summary AS ss
LEFT JOIN public.salon_settings AS s
  ON s.id = 1;

-- ============================================================================
-- QUERY 2: All 33 Expected Services & Gujarati Translations Verification
-- ============================================================================
WITH expected_services AS (
  SELECT * FROM (VALUES
    ('haircut',               'Hair',             'Haircut',                  30,  250),
    ('hair-trim',             'Hair',             'Hair Trim',                20,  180),
    ('hair-wash',             'Hair',             'Hair Wash',                15,  120),
    ('blow-dry',              'Hair',             'Blow Dry',                 30,  250),
    ('hair-styling',          'Hair',             'Hair Styling',             40,  350),
    ('hair-spa',              'Hair',             'Hair Spa',                 45,  650),
    ('deep-conditioning',     'Hair',             'Deep Conditioning',        30,  450),
    ('hair-colour',           'Hair',             'Hair Colour',              90,  1500),
    ('root-touch-up',         'Hair',             'Root Touch-up',            60,  900),
    ('highlights',            'Hair',             'Highlights',               120, 2500),
    ('keratin-treatment',     'Hair',             'Keratin Treatment',        150, 3000),
    ('smoothening',           'Hair',             'Smoothening',              180, 3500),
    ('beard-trim',            'Beard & Grooming', 'Beard Trim',               15,  120),
    ('beard-styling',         'Beard & Grooming', 'Beard Styling',            25,  200),
    ('clean-shave',           'Beard & Grooming', 'Clean Shave',              20,  150),
    ('hairline-neck-cleanup', 'Beard & Grooming', 'Hairline & Neck Cleanup',  10,  80),
    ('head-shave',            'Beard & Grooming', 'Head Shave',               30,  250),
    ('grooming-package',      'Beard & Grooming', 'Grooming Package',         45,  450),
    ('basic-clean-up',        'Skin',             'Basic Clean-up',           30,  450),
    ('classic-facial',        'Skin',             'Classic Facial',           45,  700),
    ('premium-facial',        'Skin',             'Premium Facial',           60,  1200),
    ('de-tan-treatment',      'Skin',             'De-tan Treatment',         30,  500),
    ('face-bleach',           'Skin',             'Face Bleach',              20,  300),
    ('eyebrow-threading',     'Skin',             'Eyebrow Threading',        10,  80),
    ('upper-lip-threading',   'Skin',             'Upper Lip Threading',      5,   50),
    ('face-waxing',           'Skin',             'Face Waxing',              20,  250),
    ('basic-manicure',        'Hands & Feet',     'Basic Manicure',           30,  350),
    ('spa-manicure',          'Hands & Feet',     'Spa Manicure',             45,  600),
    ('basic-pedicure',        'Hands & Feet',     'Basic Pedicure',           40,  450),
    ('spa-pedicure',          'Hands & Feet',     'Spa Pedicure',             60,  800),
    ('nail-polish',           'Hands & Feet',     'Nail Polish',              15,  150),
    ('gel-polish',            'Hands & Feet',     'Gel Polish',               30,  450),
    ('nail-art',              'Hands & Feet',     'Nail Art',                 30,  500)
  ) AS t(service_key, category, name_en, duration_minutes, price_inr)
),
actual_services AS (
  SELECT
    sv.id,
    sv.service_key,
    sv.category,
    sv.name_en,
    sv.name_gu,
    sv.duration_minutes,
    sv.price_inr,
    sv.is_active,
    sv.display_order
  FROM public.services AS sv
)
SELECT
  COALESCE(e.service_key, a.service_key) AS service_key,
  COALESCE(e.category, a.category) AS category,
  COALESCE(e.name_en, a.name_en) AS name_en,
  a.name_gu,
  a.duration_minutes,
  a.price_inr,
  a.is_active,
  CASE
    WHEN e.service_key IS NULL THEN 'INFO_ADDITIONAL_OWNER_SERVICE'
    WHEN a.id IS NULL THEN 'FAIL_MISSING_SERVICE'
    WHEN a.category = e.category
     AND a.name_en = e.name_en
     AND pg_catalog.char_length(pg_catalog.btrim(a.name_gu)) > 0
     AND a.duration_minutes > 0
     AND a.price_inr >= 0
      THEN 'PASS'
    ELSE 'FAIL_SERVICE_MISMATCH'
  END AS verification_status
FROM expected_services AS e
FULL OUTER JOIN actual_services AS a
  ON a.service_key = e.service_key
ORDER BY COALESCE(a.display_order, 999), service_key;

-- ============================================================================
-- QUERY 3: All 5 Expected Staff Profiles & EN/GU Fields Verification
-- ============================================================================
WITH expected_staff AS (
  SELECT * FROM (VALUES
    ('aarav',  'Aarav',  'Senior Hair Stylist'),
    ('meera',  'Meera',  'Hair & Colour Specialist'),
    ('kabir',  'Kabir',  'Barber & Grooming Specialist'),
    ('riya',   'Riya',   'Skin & Beauty Specialist'),
    ('ananya', 'Ananya', 'Nail & Beauty Specialist')
  ) AS t(slug, name_en, role_en)
)
SELECT
  COALESCE(e.slug, st.slug) AS slug,
  st.name_en,
  st.name_gu,
  st.role_en,
  st.role_gu,
  st.speciality_en,
  st.speciality_gu,
  st.is_on_duty,
  st.availability_status,
  CASE
    WHEN e.slug IS NULL THEN 'INFO_ADDITIONAL_STAFF'
    WHEN st.id IS NULL THEN 'FAIL_MISSING_STAFF'
    WHEN st.name_en = e.name_en
     AND st.role_en = e.role_en
     AND pg_catalog.char_length(pg_catalog.btrim(st.name_gu)) > 0
     AND pg_catalog.char_length(pg_catalog.btrim(st.role_gu)) > 0
     AND pg_catalog.char_length(pg_catalog.btrim(st.speciality_gu)) > 0
      THEN 'PASS'
    ELSE 'FAIL_STAFF_MISMATCH'
  END AS verification_status
FROM expected_staff AS e
FULL OUTER JOIN public.staff AS st
  ON st.slug = e.slug
ORDER BY COALESCE(st.display_order, 999), slug;

-- ============================================================================
-- QUERY 4: All 140 Expected Staff-Service Eligibility Assignments Verification
-- ============================================================================
WITH matrix (service_key, staff_slugs) AS (
  VALUES
    ('haircut',               ARRAY['aarav', 'meera', 'kabir', 'riya', 'ananya']),
    ('hair-trim',             ARRAY['aarav', 'meera', 'kabir', 'riya', 'ananya']),
    ('hair-wash',             ARRAY['aarav', 'meera', 'kabir', 'riya', 'ananya']),
    ('blow-dry',              ARRAY['aarav', 'meera', 'kabir', 'riya', 'ananya']),
    ('hair-styling',          ARRAY['aarav', 'meera', 'kabir', 'riya', 'ananya']),
    ('hair-spa',              ARRAY['aarav', 'meera', 'kabir', 'riya', 'ananya']),
    ('deep-conditioning',     ARRAY['aarav', 'meera', 'kabir', 'riya', 'ananya']),
    ('hair-colour',           ARRAY['aarav', 'meera', 'kabir']),
    ('root-touch-up',         ARRAY['aarav', 'meera']),
    ('highlights',            ARRAY['aarav', 'meera']),
    ('keratin-treatment',     ARRAY['aarav', 'meera']),
    ('smoothening',           ARRAY['aarav', 'meera']),
    ('beard-trim',            ARRAY['aarav', 'meera', 'kabir', 'riya', 'ananya']),
    ('beard-styling',         ARRAY['aarav', 'meera', 'kabir', 'riya', 'ananya']),
    ('clean-shave',           ARRAY['aarav', 'meera', 'kabir', 'riya', 'ananya']),
    ('hairline-neck-cleanup', ARRAY['aarav', 'meera', 'kabir', 'riya', 'ananya']),
    ('head-shave',            ARRAY['aarav', 'meera', 'kabir', 'riya', 'ananya']),
    ('grooming-package',      ARRAY['aarav', 'meera', 'kabir']),
    ('basic-clean-up',        ARRAY['aarav', 'meera', 'kabir', 'riya', 'ananya']),
    ('classic-facial',        ARRAY['aarav', 'meera', 'kabir', 'riya', 'ananya']),
    ('premium-facial',        ARRAY['riya',  'ananya']),
    ('de-tan-treatment',      ARRAY['aarav', 'meera', 'kabir', 'riya', 'ananya']),
    ('face-bleach',           ARRAY['aarav', 'meera', 'kabir', 'riya', 'ananya']),
    ('eyebrow-threading',     ARRAY['aarav', 'meera', 'kabir', 'riya', 'ananya']),
    ('upper-lip-threading',   ARRAY['aarav', 'meera', 'kabir', 'riya', 'ananya']),
    ('face-waxing',           ARRAY['aarav', 'meera', 'kabir', 'riya', 'ananya']),
    ('basic-manicure',        ARRAY['aarav', 'meera', 'kabir', 'riya', 'ananya']),
    ('spa-manicure',          ARRAY['aarav', 'meera', 'kabir', 'riya', 'ananya']),
    ('basic-pedicure',        ARRAY['aarav', 'meera', 'kabir', 'riya', 'ananya']),
    ('spa-pedicure',          ARRAY['aarav', 'meera', 'kabir', 'riya', 'ananya']),
    ('nail-polish',           ARRAY['aarav', 'meera', 'kabir', 'riya', 'ananya']),
    ('gel-polish',            ARRAY['riya',  'ananya']),
    ('nail-art',              ARRAY['riya',  'ananya'])
),
expected_pairs AS (
  SELECT
    u.staff_slug,
    m.service_key
  FROM matrix AS m
  CROSS JOIN LATERAL pg_catalog.unnest(m.staff_slugs) AS u(staff_slug)
),
actual_pairs AS (
  SELECT
    st.slug AS staff_slug,
    sv.service_key
  FROM public.staff_services AS ss
  JOIN public.staff AS st
    ON st.id = ss.staff_id
  JOIN public.services AS sv
    ON sv.id = ss.service_id
),
orphan_checks AS (
  SELECT
    COUNT(*) FILTER (
      WHERE NOT EXISTS (SELECT 1 FROM public.staff st WHERE st.id = ss.staff_id)
         OR NOT EXISTS (SELECT 1 FROM public.services sv WHERE sv.id = ss.service_id)
    )::INTEGER AS orphan_fk_count,
    (
      SELECT COUNT(*)::INTEGER
      FROM public.services AS sv
      WHERE sv.is_active = TRUE
        AND NOT EXISTS (
          SELECT 1 FROM public.staff_services AS ss WHERE ss.service_id = sv.id
        )
    ) AS active_services_without_staff
  FROM public.staff_services AS ss
)
SELECT
  COUNT(*)::INTEGER AS total_expected_pairs,
  COUNT(ap.service_key)::INTEGER AS matched_expected_pairs,
  (SELECT COUNT(*)::INTEGER FROM actual_pairs) AS total_actual_pairs,
  oc.orphan_fk_count,
  oc.active_services_without_staff,
  CASE
    WHEN COUNT(*) = 140
     AND COUNT(ap.service_key) = 140
     AND (SELECT COUNT(*) FROM actual_pairs) >= 140
     AND oc.orphan_fk_count = 0
     AND oc.active_services_without_staff = 0
      THEN 'PASS'
    ELSE 'FAIL_STAFF_SERVICES_MISMATCH'
  END AS verification_status
FROM expected_pairs AS ep
LEFT JOIN actual_pairs AS ap
  ON ap.staff_slug = ep.staff_slug
 AND ap.service_key = ep.service_key
CROSS JOIN orphan_checks AS oc
GROUP BY oc.orphan_fk_count, oc.active_services_without_staff;

-- ============================================================================
-- QUERY 5: Demo Customers, Demo Queue Entries, Snapshots, History & Integrity
-- ============================================================================
WITH demo_customers AS (
  SELECT
    COUNT(*) FILTER (WHERE c.is_demo = TRUE)::INTEGER AS demo_customer_count
  FROM public.customers AS c
),
demo_entries AS (
  SELECT
    COUNT(*) FILTER (WHERE qe.is_demo = TRUE)::INTEGER AS demo_entry_count,
    COUNT(DISTINCT qe.status) FILTER (WHERE qe.is_demo = TRUE)::INTEGER AS distinct_demo_statuses,
    COUNT(*) FILTER (
      WHERE qe.is_demo = TRUE
        AND NOT EXISTS (
          SELECT 1 FROM public.customers AS c WHERE c.id = qe.customer_id
        )
    )::INTEGER AS entries_missing_customer_fk,
    COUNT(*) FILTER (
      WHERE qe.is_demo = TRUE
        AND NOT EXISTS (
          SELECT 1 FROM public.staff AS st WHERE st.id = qe.assigned_staff_id
        )
    )::INTEGER AS entries_missing_staff_fk,
    COUNT(*) FILTER (
      WHERE qe.is_demo = TRUE
        AND (
          SELECT COUNT(*)
          FROM public.queue_entry_services AS qes
          WHERE qes.queue_entry_id = qe.id
        ) NOT BETWEEN 1 AND 3
    )::INTEGER AS entries_invalid_service_count,
    COUNT(*) FILTER (
      WHERE qe.is_demo = TRUE
        AND NOT EXISTS (
          SELECT 1
          FROM public.queue_status_history AS qsh
          WHERE qsh.queue_entry_id = qe.id
        )
    )::INTEGER AS entries_missing_history,
    COUNT(*) FILTER (
      WHERE qe.is_demo = TRUE
        AND qe.status = 'In Chair'
        AND EXISTS (
          SELECT 1
          FROM public.staff AS st
          WHERE st.id = qe.assigned_staff_id
            AND st.availability_status <> 'Busy'
        )
    )::INTEGER AS in_chair_staff_not_busy
  FROM public.queue_entries AS qe
)
SELECT
  dc.demo_customer_count,
  de.demo_entry_count,
  de.distinct_demo_statuses,
  de.entries_missing_customer_fk,
  de.entries_missing_staff_fk,
  de.entries_invalid_service_count,
  de.entries_missing_history,
  de.in_chair_staff_not_busy,
  CASE
    WHEN dc.demo_customer_count >= 8
     AND de.demo_entry_count >= 8
     AND de.distinct_demo_statuses = 6
     AND de.entries_missing_customer_fk = 0
     AND de.entries_missing_staff_fk = 0
     AND de.entries_invalid_service_count = 0
     AND de.entries_missing_history = 0
     AND de.in_chair_staff_not_busy = 0
      THEN 'PASS'
    ELSE 'FAIL_DEMO_DATA_INTEGRITY'
  END AS verification_status
FROM demo_customers AS dc
CROSS JOIN demo_entries AS de;

-- ============================================================================
-- QUERY 6: RLS, Realtime Publication & Privilege Integrity After Seeding
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
object_state AS (
  SELECT
    cls.relname AS object_name,
    cls.relkind,
    cls.relrowsecurity AS rls_enabled,
    pg_catalog.string_agg(acl.privilege_type, ', ' ORDER BY acl.privilege_type)
      FILTER (WHERE acl.grantee = 0) AS public_acl_privileges,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_publication_tables AS pt
      WHERE pt.pubname = 'supabase_realtime'
        AND pt.schemaname = 'public'
        AND pt.tablename = cls.relname
    ) AS in_realtime_pub
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
  GROUP BY cls.relname, cls.relkind, cls.relrowsecurity
)
SELECT
  t.object_name,
  t.security_tier,
  os.rls_enabled,
  os.in_realtime_pub,
  os.public_acl_privileges,
  pg_catalog.has_table_privilege('anon',          'public.' || t.object_name, 'SELECT') AS anon_select,
  pg_catalog.has_table_privilege('authenticated', 'public.' || t.object_name, 'SELECT') AS auth_select,
  pg_catalog.has_table_privilege('service_role',  'public.' || t.object_name, 'SELECT') AS service_select,
  CASE
    WHEN os.object_name IS NULL THEN 'FAIL_MISSING_OBJECT'
    WHEN os.public_acl_privileges IS NOT NULL THEN 'FAIL_PUBLIC_ACL_PRESENT'
    WHEN t.security_tier = 'PRIVATE_VIEW'
     AND NOT pg_catalog.has_table_privilege('anon',          'public.' || t.object_name, 'SELECT')
     AND NOT pg_catalog.has_table_privilege('authenticated', 'public.' || t.object_name, 'SELECT')
     AND pg_catalog.has_table_privilege('service_role',      'public.' || t.object_name, 'SELECT')
      THEN 'PASS'
    WHEN t.security_tier = 'PRIVATE'
     AND os.rls_enabled
     AND NOT os.in_realtime_pub
     AND NOT pg_catalog.has_table_privilege('anon',          'public.' || t.object_name, 'SELECT')
     AND NOT pg_catalog.has_table_privilege('authenticated', 'public.' || t.object_name, 'SELECT')
     AND pg_catalog.has_table_privilege('service_role',      'public.' || t.object_name, 'SELECT')
      THEN 'PASS'
    WHEN t.security_tier = 'PUBLIC_READ_ONLY'
     AND os.rls_enabled
     AND os.in_realtime_pub
     AND pg_catalog.has_table_privilege('anon',              'public.' || t.object_name, 'SELECT')
     AND NOT pg_catalog.has_table_privilege('anon',          'public.' || t.object_name, 'INSERT')
     AND pg_catalog.has_table_privilege('authenticated',     'public.' || t.object_name, 'SELECT')
     AND NOT pg_catalog.has_table_privilege('authenticated', 'public.' || t.object_name, 'INSERT')
     AND pg_catalog.has_table_privilege('service_role',      'public.' || t.object_name, 'SELECT')
      THEN 'PASS'
    ELSE 'FAIL_SECURITY_REGRESSION'
  END AS verification_status
FROM target_objects AS t
LEFT JOIN object_state AS os
  ON os.object_name = t.object_name
ORDER BY t.security_tier, t.object_name;
