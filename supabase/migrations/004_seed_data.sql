-- ============================================================================
-- CELESTE — Salon Queue Management System
-- Migration 004: Initial Master Data & Demo Queue Seed Data
-- Source of Truth:
--   - supabase/migrations/001_schema_and_indexes.sql
--   - supabase/migrations/002_queue_functions.sql
--   - supabase/migrations/003_security_rls_and_realtime.sql
--   - docs/01-brief.md, docs/03-flows-rules.md, docs/04-database-design.md
--
-- Rerun Safety & Data Preservation:
--   - Wrapped in BEGIN / COMMIT so all initial seed steps succeed atomically.
--   - Uses ON CONFLICT DO NOTHING and non-destructive guards so existing real
--     salon settings, edited services/staff, genuine customers, and genuine
--     queue entries are NEVER deleted, truncated, or overwritten.
--   - Demo customers and demo queue entries are marked is_demo = TRUE.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Singleton Salon Settings (public.salon_settings, id = 1)
--    Sets last_staff_init_date to current IST date on initial creation so the
--    initial demo staff availability states (Available / Busy / On Break) are
--    preserved for today while still auto-initializing on future IST dates.
-- ---------------------------------------------------------------------------

INSERT INTO public.salon_settings (
  id,
  salon_name,
  timezone,
  operating_hours,
  is_online_queue_open,
  daily_online_capacity,
  online_cutoff_minutes,
  no_show_window_minutes,
  max_services_per_entry,
  last_cleanup_date,
  last_staff_init_date
)
VALUES (
  1,
  'CELESTE',
  'Asia/Kolkata',
  '{
    "mon": {"open": "10:00", "close": "21:00"},
    "tue": {"open": "10:00", "close": "21:00"},
    "wed": {"open": "10:00", "close": "21:00"},
    "thu": {"open": "10:00", "close": "21:00"},
    "fri": {"open": "10:00", "close": "21:00"},
    "sat": {"open": "09:00", "close": "22:00"},
    "sun": {"open": "10:00", "close": "20:00"}
  }'::JSONB,
  TRUE,
  30,
  30,
  10,
  3,
  NULL,
  public.get_ist_date()
)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Initial 33 Salon Services (English + Gujarati)
--    ON CONFLICT (service_key) DO NOTHING preserves owner updates on reruns.
-- ---------------------------------------------------------------------------

INSERT INTO public.services (
  service_key,
  category,
  name_en,
  name_gu,
  duration_minutes,
  price_inr,
  is_active,
  display_order
)
VALUES
  -- Hair (12)
  ('haircut',               'Hair',             'Haircut',                  'હેરકટ',                       30,  250,  TRUE, 1),
  ('hair-trim',             'Hair',             'Hair Trim',                'હેર ટ્રિમ',                    20,  180,  TRUE, 2),
  ('hair-wash',             'Hair',             'Hair Wash',                'હેર વોશ',                     15,  120,  TRUE, 3),
  ('blow-dry',              'Hair',             'Blow Dry',                 'બ્લો ડ્રાય',                   30,  250,  TRUE, 4),
  ('hair-styling',          'Hair',             'Hair Styling',             'હેર સ્ટાઇલિંગ',               40,  350,  TRUE, 5),
  ('hair-spa',              'Hair',             'Hair Spa',                 'હેર સ્પા',                    45,  650,  TRUE, 6),
  ('deep-conditioning',     'Hair',             'Deep Conditioning',        'ડીપ કન્ડિશનિંગ',               30,  450,  TRUE, 7),
  ('hair-colour',           'Hair',             'Hair Colour',              'હેર કલર',                     90,  1500, TRUE, 8),
  ('root-touch-up',         'Hair',             'Root Touch-up',            'રૂટ ટચ-અપ',                   60,  900,  TRUE, 9),
  ('highlights',            'Hair',             'Highlights',               'હાઇલાઇટ્સ',                   120, 2500, TRUE, 10),
  ('keratin-treatment',     'Hair',             'Keratin Treatment',        'કેરાટિન ટ્રીટમેન્ટ',            150, 3000, TRUE, 11),
  ('smoothening',           'Hair',             'Smoothening',              'સ્મૂધનિંગ',                    180, 3500, TRUE, 12),

  -- Beard & Grooming (6)
  ('beard-trim',            'Beard & Grooming', 'Beard Trim',               'દાઢી ટ્રિમ',                   15,  120,  TRUE, 13),
  ('beard-styling',         'Beard & Grooming', 'Beard Styling',            'દાઢી સ્ટાઇલિંગ',               25,  200,  TRUE, 14),
  ('clean-shave',           'Beard & Grooming', 'Clean Shave',              'ક્લીન શેવ',                   20,  150,  TRUE, 15),
  ('hairline-neck-cleanup', 'Beard & Grooming', 'Hairline & Neck Cleanup',  'હેરલાઇન અને ગરદન ક્લીનઅપ',     10,  80,   TRUE, 16),
  ('head-shave',            'Beard & Grooming', 'Head Shave',               'હેડ શેવ',                    30,  250,  TRUE, 17),
  ('grooming-package',      'Beard & Grooming', 'Grooming Package',         'ગ્રૂમિંગ પેકેજ',               45,  450,  TRUE, 18),

  -- Skin (8)
  ('basic-clean-up',        'Skin',             'Basic Clean-up',           'બેઝિક ક્લીન-અપ',               30,  450,  TRUE, 19),
  ('classic-facial',        'Skin',             'Classic Facial',           'ક્લાસિક ફેશિયલ',               45,  700,  TRUE, 20),
  ('premium-facial',        'Skin',             'Premium Facial',           'પ્રીમિયમ ફેશિયલ',              60,  1200, TRUE, 21),
  ('de-tan-treatment',      'Skin',             'De-tan Treatment',         'ડી-ટેન ટ્રીટમેન્ટ',             30,  500,  TRUE, 22),
  ('face-bleach',           'Skin',             'Face Bleach',              'ફેસ બ્લીચ',                   20,  300,  TRUE, 23),
  ('eyebrow-threading',     'Skin',             'Eyebrow Threading',        'આઇબ્રો થ્રેડિંગ',               10,  80,   TRUE, 24),
  ('upper-lip-threading',   'Skin',             'Upper Lip Threading',      'અપર લિપ થ્રેડિંગ',              5,   50,   TRUE, 25),
  ('face-waxing',           'Skin',             'Face Waxing',              'ફેસ વેક્સિંગ',                  20,  250,  TRUE, 26),

  -- Hands & Feet (7)
  ('basic-manicure',        'Hands & Feet',     'Basic Manicure',           'બેઝિક મેનીક્યોર',               30,  350,  TRUE, 27),
  ('spa-manicure',          'Hands & Feet',     'Spa Manicure',             'સ્પા મેનીક્યોર',                45,  600,  TRUE, 28),
  ('basic-pedicure',        'Hands & Feet',     'Basic Pedicure',           'બેઝિક પેડિક્યોર',               40,  450,  TRUE, 29),
  ('spa-pedicure',          'Hands & Feet',     'Spa Pedicure',             'સ્પા પેડિક્યોર',                60,  800,  TRUE, 30),
  ('nail-polish',           'Hands & Feet',     'Nail Polish',              'નેઇલ પોલિશ',                  15,  150,  TRUE, 31),
  ('gel-polish',            'Hands & Feet',     'Gel Polish',               'જેલ પોલિશ',                   30,  450,  TRUE, 32),
  ('nail-art',              'Hands & Feet',     'Nail Art',                 'નેઇલ આર્ટ',                   30,  500,  TRUE, 33)
ON CONFLICT (service_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Initial 5 Salon Staff Profiles (English + Gujarati)
--    ON CONFLICT (slug) DO NOTHING preserves live duty/availability on reruns.
--    Note: Kabir starts as 'On Break' so initial launch shows diverse states;
--    Aarav is updated to 'Busy' below only when his demo In Chair entry is added.
-- ---------------------------------------------------------------------------

INSERT INTO public.staff (
  slug,
  name_en,
  name_gu,
  role_en,
  role_gu,
  speciality_en,
  speciality_gu,
  avatar_url,
  is_on_duty,
  availability_status,
  available_since,
  display_order
)
VALUES
  (
    'aarav',
    'Aarav',
    'આરવ',
    'Senior Hair Stylist',
    'સિનિયર હેર સ્ટાઇલિસ્ટ',
    'Haircuts, styling and hair treatments',
    'હેરકટ, સ્ટાઇલિંગ અને હેર ટ્રીટમેન્ટ્સ',
    NULL,
    TRUE,
    'Available',
    pg_catalog.now() - INTERVAL '120 minutes',
    1
  ),
  (
    'meera',
    'Meera',
    'મીરા',
    'Hair & Colour Specialist',
    'હેર અને કલર સ્પેશિયાલિસ્ટ',
    'Hair colouring, highlights and smoothening',
    'હેર કલરિંગ, હાઇલાઇટ્સ અને સ્મૂધનિંગ',
    NULL,
    TRUE,
    'Available',
    pg_catalog.now() - INTERVAL '110 minutes',
    2
  ),
  (
    'kabir',
    'Kabir',
    'કબીર',
    'Barber & Grooming Specialist',
    'બાર્બર અને ગ્રૂમિંગ સ્પેશિયાલિસ્ટ',
    'Beard, shaving and grooming',
    'દાઢી, શેવિંગ અને ગ્રૂમિંગ',
    NULL,
    TRUE,
    'On Break',
    pg_catalog.now() - INTERVAL '100 minutes',
    3
  ),
  (
    'riya',
    'Riya',
    'રિયા',
    'Skin & Beauty Specialist',
    'સ્કિન અને બ્યુટી સ્પેશિયાલિસ્ટ',
    'Facials, clean-ups and threading',
    'ફેશિયલ, ક્લીન-અપ અને થ્રેડિંગ',
    NULL,
    TRUE,
    'Available',
    pg_catalog.now() - INTERVAL '90 minutes',
    4
  ),
  (
    'ananya',
    'Ananya',
    'અનન્યા',
    'Nail & Beauty Specialist',
    'નેઇલ અને બ્યુટી સ્પેશિયાલિસ્ટ',
    'Manicure, pedicure and nail art',
    'મેનીક્યોર, પેડિક્યોર અને નેઇલ આર્ટ',
    NULL,
    TRUE,
    'Available',
    pg_catalog.now() - INTERVAL '80 minutes',
    5
  )
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Initial 140 Cross-Trained Staff-Service Eligibility Mappings
--    Matches docs/03-flows-rules.md Section 5 (46 Hair + 28 Beard + 37 Skin +
--    29 Hands & Feet = 140 rows). ON CONFLICT DO NOTHING protects owner edits.
-- ---------------------------------------------------------------------------

WITH matrix (service_key, staff_slugs) AS (
  VALUES
    -- Hair (46 assignments)
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

    -- Beard & Grooming (28 assignments)
    ('beard-trim',            ARRAY['aarav', 'meera', 'kabir', 'riya', 'ananya']),
    ('beard-styling',         ARRAY['aarav', 'meera', 'kabir', 'riya', 'ananya']),
    ('clean-shave',           ARRAY['aarav', 'meera', 'kabir', 'riya', 'ananya']),
    ('hairline-neck-cleanup', ARRAY['aarav', 'meera', 'kabir', 'riya', 'ananya']),
    ('head-shave',            ARRAY['aarav', 'meera', 'kabir', 'riya', 'ananya']),
    ('grooming-package',      ARRAY['aarav', 'meera', 'kabir']),

    -- Skin (37 assignments)
    ('basic-clean-up',        ARRAY['aarav', 'meera', 'kabir', 'riya', 'ananya']),
    ('classic-facial',        ARRAY['aarav', 'meera', 'kabir', 'riya', 'ananya']),
    ('premium-facial',        ARRAY['riya',  'ananya']),
    ('de-tan-treatment',      ARRAY['aarav', 'meera', 'kabir', 'riya', 'ananya']),
    ('face-bleach',           ARRAY['aarav', 'meera', 'kabir', 'riya', 'ananya']),
    ('eyebrow-threading',     ARRAY['aarav', 'meera', 'kabir', 'riya', 'ananya']),
    ('upper-lip-threading',   ARRAY['aarav', 'meera', 'kabir', 'riya', 'ananya']),
    ('face-waxing',           ARRAY['aarav', 'meera', 'kabir', 'riya', 'ananya']),

    -- Hands & Feet (29 assignments)
    ('basic-manicure',        ARRAY['aarav', 'meera', 'kabir', 'riya', 'ananya']),
    ('spa-manicure',          ARRAY['aarav', 'meera', 'kabir', 'riya', 'ananya']),
    ('basic-pedicure',        ARRAY['aarav', 'meera', 'kabir', 'riya', 'ananya']),
    ('spa-pedicure',          ARRAY['aarav', 'meera', 'kabir', 'riya', 'ananya']),
    ('nail-polish',           ARRAY['aarav', 'meera', 'kabir', 'riya', 'ananya']),
    ('gel-polish',            ARRAY['riya',  'ananya']),
    ('nail-art',              ARRAY['riya',  'ananya'])
),
resolved_pairs AS (
  SELECT
    st.id AS staff_id,
    sv.id AS service_id
  FROM matrix AS m
  CROSS JOIN LATERAL pg_catalog.unnest(m.staff_slugs) AS u(staff_slug)
  JOIN public.staff AS st
    ON st.slug = u.staff_slug
  JOIN public.services AS sv
    ON sv.service_key = m.service_key
)
INSERT INTO public.staff_services (staff_id, service_id)
SELECT rp.staff_id, rp.service_id
FROM resolved_pairs AS rp
ON CONFLICT (staff_id, service_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. Initial Demo Customers (is_demo = TRUE)
--    Uses reserved synthetic 90000xxxxx numbers; ON CONFLICT (phone) DO NOTHING
--    ensures genuine customer records are never modified on rerun.
-- ---------------------------------------------------------------------------

INSERT INTO public.customers (name, phone, is_demo)
VALUES
  ('Devanshi Shah',   '9000000101', TRUE),
  ('Rohan Desai',     '9000000102', TRUE),
  ('Karan Mehta',     '9000000103', TRUE),
  ('Neha Joshi',      '9000000104', TRUE),
  ('Priya Patel',     '9000000105', TRUE),
  ('Arjun Trivedi',   '9000000106', TRUE),
  ('Komal Bhatt',     '9000000107', TRUE),
  ('Siddharth Verma', '9000000108', TRUE)
ON CONFLICT (phone) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6. Initial Demo Queue Entries & Service Snapshots (is_demo = TRUE)
--    Covers all 6 statuses: Done, No-show, Cancelled, In Chair, Called, Waiting
--    (including >60-minute amber highlight, position-2 Start Coming scenario,
--    online + walk_in sources, specific + any_available modes, and 1..3 services).
--    Seeds only when no queue entries exist yet for today's IST date so reruns
--    never interfere with active queues or re-create deleted/reset entries if
--    live data is already running today.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_today_ist       DATE := public.get_ist_date();
  v_now             TIMESTAMPTZ := pg_catalog.now();
  v_has_today_queue BOOLEAN;
  v_staff_aarav     UUID;
  v_staff_meera     UUID;
  v_staff_riya      UUID;
  v_staff_ananya    UUID;
  v_cust_1          UUID;
  v_cust_2          UUID;
  v_cust_3          UUID;
  v_cust_4          UUID;
  v_cust_5          UUID;
  v_cust_6          UUID;
  v_cust_7          UUID;
  v_cust_8          UUID;
  v_entry_id        UUID;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.queue_entries AS qe
    WHERE qe.queue_date = v_today_ist
  )
  INTO v_has_today_queue;

  IF v_has_today_queue THEN
    RETURN;
  END IF;

  SELECT st.id INTO v_staff_aarav  FROM public.staff AS st WHERE st.slug = 'aarav';
  SELECT st.id INTO v_staff_meera  FROM public.staff AS st WHERE st.slug = 'meera';
  SELECT st.id INTO v_staff_riya   FROM public.staff AS st WHERE st.slug = 'riya';
  SELECT st.id INTO v_staff_ananya FROM public.staff AS st WHERE st.slug = 'ananya';

  SELECT c.id INTO v_cust_1 FROM public.customers AS c WHERE c.phone = '9000000101' AND c.is_demo = TRUE;
  SELECT c.id INTO v_cust_2 FROM public.customers AS c WHERE c.phone = '9000000102' AND c.is_demo = TRUE;
  SELECT c.id INTO v_cust_3 FROM public.customers AS c WHERE c.phone = '9000000103' AND c.is_demo = TRUE;
  SELECT c.id INTO v_cust_4 FROM public.customers AS c WHERE c.phone = '9000000104' AND c.is_demo = TRUE;
  SELECT c.id INTO v_cust_5 FROM public.customers AS c WHERE c.phone = '9000000105' AND c.is_demo = TRUE;
  SELECT c.id INTO v_cust_6 FROM public.customers AS c WHERE c.phone = '9000000106' AND c.is_demo = TRUE;
  SELECT c.id INTO v_cust_7 FROM public.customers AS c WHERE c.phone = '9000000107' AND c.is_demo = TRUE;
  SELECT c.id INTO v_cust_8 FROM public.customers AS c WHERE c.phone = '9000000108' AND c.is_demo = TRUE;

  IF v_staff_aarav IS NULL OR v_staff_meera IS NULL OR v_staff_riya IS NULL OR v_staff_ananya IS NULL
     OR v_cust_1 IS NULL OR v_cust_2 IS NULL OR v_cust_3 IS NULL OR v_cust_4 IS NULL
     OR v_cust_5 IS NULL OR v_cust_6 IS NULL OR v_cust_7 IS NULL OR v_cust_8 IS NULL THEN
    RETURN;
  END IF;

  -- 002_queue_functions.sql defines trg_queue_entries_log_status_change as
  -- AFTER INSERT OR UPDATE OF status, so each direct INSERT below fires the
  -- trigger (TG_OP = 'INSERT') and logs (from_status = NULL, to_status = NEW.status)
  -- into public.queue_status_history using these session settings.
  PERFORM pg_catalog.set_config('app.actor_role', 'system', true);
  PERFORM pg_catalog.set_config('app.actor_ref', '004_seed_data', true);
  PERFORM pg_catalog.set_config('app.transition_note', 'Initial demo seed data', true);

  -- S-01: Done (Ananya, 2 services)
  INSERT INTO public.queue_entries (
    queue_date, token_number, customer_id, source, selection_mode, assigned_staff_id,
    status, joined_at, called_at, started_at, completed_at, is_demo
  ) VALUES (
    v_today_ist, 1, v_cust_1, 'online', 'specific', v_staff_ananya,
    'Done', v_now - INTERVAL '95 minutes', v_now - INTERVAL '85 minutes',
    v_now - INTERVAL '82 minutes', v_now - INTERVAL '52 minutes', TRUE
  )
  RETURNING id INTO v_entry_id;

  INSERT INTO public.queue_entry_services (
    queue_entry_id, service_id, position,
    service_name_en_snapshot, service_name_gu_snapshot, duration_minutes_snapshot, price_inr_snapshot
  )
  SELECT v_entry_id, sv.id, u.pos::SMALLINT, sv.name_en, sv.name_gu, sv.duration_minutes, sv.price_inr
  FROM pg_catalog.unnest(ARRAY['spa-manicure', 'gel-polish']) WITH ORDINALITY AS u(service_key, pos)
  JOIN public.services AS sv ON sv.service_key = u.service_key;

  -- S-02: No-show (Riya, 1 service, no_show_at >= called_at + 10 minutes)
  INSERT INTO public.queue_entries (
    queue_date, token_number, customer_id, source, selection_mode, assigned_staff_id,
    status, joined_at, called_at, no_show_at, is_demo
  ) VALUES (
    v_today_ist, 2, v_cust_2, 'online', 'any_available', v_staff_riya,
    'No-show', v_now - INTERVAL '80 minutes', v_now - INTERVAL '68 minutes',
    v_now - INTERVAL '55 minutes', TRUE
  )
  RETURNING id INTO v_entry_id;

  INSERT INTO public.queue_entry_services (
    queue_entry_id, service_id, position,
    service_name_en_snapshot, service_name_gu_snapshot, duration_minutes_snapshot, price_inr_snapshot
  )
  SELECT v_entry_id, sv.id, 1::SMALLINT, sv.name_en, sv.name_gu, sv.duration_minutes, sv.price_inr
  FROM public.services AS sv WHERE sv.service_key = 'premium-facial';

  -- S-03: Cancelled (Aarav, cancelled by customer, 2 services)
  INSERT INTO public.queue_entries (
    queue_date, token_number, customer_id, source, selection_mode, assigned_staff_id,
    status, joined_at, cancelled_at, cancelled_by, is_demo
  ) VALUES (
    v_today_ist, 3, v_cust_3, 'online', 'specific', v_staff_aarav,
    'Cancelled', v_now - INTERVAL '75 minutes', v_now - INTERVAL '60 minutes', 'customer', TRUE
  )
  RETURNING id INTO v_entry_id;

  INSERT INTO public.queue_entry_services (
    queue_entry_id, service_id, position,
    service_name_en_snapshot, service_name_gu_snapshot, duration_minutes_snapshot, price_inr_snapshot
  )
  SELECT v_entry_id, sv.id, u.pos::SMALLINT, sv.name_en, sv.name_gu, sv.duration_minutes, sv.price_inr
  FROM pg_catalog.unnest(ARRAY['haircut', 'beard-trim']) WITH ORDINALITY AS u(service_key, pos)
  JOIN public.services AS sv ON sv.service_key = u.service_key;

  -- S-04: In Chair (Aarav -> Busy, walk-in, 2 services)
  INSERT INTO public.queue_entries (
    queue_date, token_number, customer_id, source, selection_mode, assigned_staff_id,
    status, joined_at, called_at, started_at, is_demo
  ) VALUES (
    v_today_ist, 4, v_cust_4, 'walk_in', 'specific', v_staff_aarav,
    'In Chair', v_now - INTERVAL '40 minutes', v_now - INTERVAL '25 minutes',
    v_now - INTERVAL '15 minutes', TRUE
  )
  RETURNING id INTO v_entry_id;

  INSERT INTO public.queue_entry_services (
    queue_entry_id, service_id, position,
    service_name_en_snapshot, service_name_gu_snapshot, duration_minutes_snapshot, price_inr_snapshot
  )
  SELECT v_entry_id, sv.id, u.pos::SMALLINT, sv.name_en, sv.name_gu, sv.duration_minutes, sv.price_inr
  FROM pg_catalog.unnest(ARRAY['haircut', 'beard-styling']) WITH ORDINALITY AS u(service_key, pos)
  JOIN public.services AS sv ON sv.service_key = u.service_key;

  UPDATE public.staff AS st
  SET availability_status = 'Busy'
  WHERE st.id = v_staff_aarav;

  -- S-05: Called (Meera -> Available while waiting in 10-min arrival window, 2 services)
  INSERT INTO public.queue_entries (
    queue_date, token_number, customer_id, source, selection_mode, assigned_staff_id,
    status, joined_at, called_at, is_demo
  ) VALUES (
    v_today_ist, 5, v_cust_5, 'online', 'specific', v_staff_meera,
    'Called', v_now - INTERVAL '30 minutes', v_now - INTERVAL '3 minutes', TRUE
  )
  RETURNING id INTO v_entry_id;

  INSERT INTO public.queue_entry_services (
    queue_entry_id, service_id, position,
    service_name_en_snapshot, service_name_gu_snapshot, duration_minutes_snapshot, price_inr_snapshot
  )
  SELECT v_entry_id, sv.id, u.pos::SMALLINT, sv.name_en, sv.name_gu, sv.duration_minutes, sv.price_inr
  FROM pg_catalog.unnest(ARRAY['hair-colour', 'blow-dry']) WITH ORDINALITY AS u(service_key, pos)
  JOIN public.services AS sv ON sv.service_key = u.service_key;

  -- S-06: Waiting position 1 for Aarav (>60 min wait to demonstrate amber highlight)
  INSERT INTO public.queue_entries (
    queue_date, token_number, customer_id, source, selection_mode, assigned_staff_id,
    status, joined_at, is_demo
  ) VALUES (
    v_today_ist, 6, v_cust_6, 'online', 'specific', v_staff_aarav,
    'Waiting', v_now - INTERVAL '65 minutes', TRUE
  )
  RETURNING id INTO v_entry_id;

  INSERT INTO public.queue_entry_services (
    queue_entry_id, service_id, position,
    service_name_en_snapshot, service_name_gu_snapshot, duration_minutes_snapshot, price_inr_snapshot
  )
  SELECT v_entry_id, sv.id, 1::SMALLINT, sv.name_en, sv.name_gu, sv.duration_minutes, sv.price_inr
  FROM public.services AS sv WHERE sv.service_key = 'hair-spa';

  -- S-07: Waiting position 2 for Aarav (any_available, 3 services — eligible for Start Coming)
  INSERT INTO public.queue_entries (
    queue_date, token_number, customer_id, source, selection_mode, assigned_staff_id,
    status, joined_at, is_demo
  ) VALUES (
    v_today_ist, 7, v_cust_7, 'online', 'any_available', v_staff_aarav,
    'Waiting', v_now - INTERVAL '20 minutes', TRUE
  )
  RETURNING id INTO v_entry_id;

  INSERT INTO public.queue_entry_services (
    queue_entry_id, service_id, position,
    service_name_en_snapshot, service_name_gu_snapshot, duration_minutes_snapshot, price_inr_snapshot
  )
  SELECT v_entry_id, sv.id, u.pos::SMALLINT, sv.name_en, sv.name_gu, sv.duration_minutes, sv.price_inr
  FROM pg_catalog.unnest(ARRAY['haircut', 'hair-wash', 'blow-dry']) WITH ORDINALITY AS u(service_key, pos)
  JOIN public.services AS sv ON sv.service_key = u.service_key;

  -- S-08: Waiting position 1 for Riya (walk_in, 2 services)
  INSERT INTO public.queue_entries (
    queue_date, token_number, customer_id, source, selection_mode, assigned_staff_id,
    status, joined_at, is_demo
  ) VALUES (
    v_today_ist, 8, v_cust_8, 'walk_in', 'specific', v_staff_riya,
    'Waiting', v_now - INTERVAL '10 minutes', TRUE
  )
  RETURNING id INTO v_entry_id;

  INSERT INTO public.queue_entry_services (
    queue_entry_id, service_id, position,
    service_name_en_snapshot, service_name_gu_snapshot, duration_minutes_snapshot, price_inr_snapshot
  )
  SELECT v_entry_id, sv.id, u.pos::SMALLINT, sv.name_en, sv.name_gu, sv.duration_minutes, sv.price_inr
  FROM pg_catalog.unnest(ARRAY['classic-facial', 'eyebrow-threading']) WITH ORDINALITY AS u(service_key, pos)
  JOIN public.services AS sv ON sv.service_key = u.service_key;
END;
$$;

COMMIT;
