-- ============================================================================
-- CELESTE — Salon Queue Management System
-- Migration 008: Owner Management Atomic RPC Functions
-- Additive Only: Preserves Migrations 001-007 and existing security hardening.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. public.owner_create_service
--    Atomically creates a service and assigns qualified staff, enforcing that
--    every active service has at least one qualified staff member.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.owner_create_service(
  p_category         TEXT,
  p_name_en          TEXT,
  p_name_gu          TEXT,
  p_duration_minutes INTEGER,
  p_price_inr        INTEGER,
  p_is_active        BOOLEAN DEFAULT TRUE,
  p_staff_ids        UUID[]  DEFAULT '{}'::UUID[],
  p_service_key      TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_category       TEXT := pg_catalog.btrim(COALESCE(p_category, ''));
  v_name_en        TEXT := pg_catalog.btrim(COALESCE(p_name_en, ''));
  v_name_gu        TEXT := pg_catalog.btrim(COALESCE(p_name_gu, ''));
  v_is_active      BOOLEAN := COALESCE(p_is_active, TRUE);
  v_service_key    TEXT;
  v_staff_ids      UUID[];
  v_missing_staff  INTEGER := 0;
  v_next_order     INTEGER := 1;
  v_service        public.services%ROWTYPE;
BEGIN
  IF v_category NOT IN ('Hair', 'Beard & Grooming', 'Skin', 'Hands & Feet') THEN
    RAISE EXCEPTION 'INVALID_SERVICE_CATEGORY: Category must be Hair, Beard & Grooming, Skin, or Hands & Feet.'
      USING ERRCODE = '22023';
  END IF;

  IF pg_catalog.char_length(v_name_en) = 0 OR pg_catalog.char_length(v_name_en) > 120 THEN
    RAISE EXCEPTION 'INVALID_SERVICE_NAME: English service name must be between 1 and 120 characters.'
      USING ERRCODE = '22023';
  END IF;

  IF pg_catalog.char_length(v_name_gu) = 0 OR pg_catalog.char_length(v_name_gu) > 120 THEN
    RAISE EXCEPTION 'INVALID_SERVICE_NAME: Gujarati service name must be between 1 and 120 characters.'
      USING ERRCODE = '22023';
  END IF;

  IF p_duration_minutes IS NULL OR p_duration_minutes <= 0 OR p_duration_minutes > 600 THEN
    RAISE EXCEPTION 'INVALID_SERVICE_DURATION: Duration must be between 1 and 600 minutes.'
      USING ERRCODE = '22023';
  END IF;

  IF p_price_inr IS NULL OR p_price_inr < 0 OR p_price_inr > 500000 THEN
    RAISE EXCEPTION 'INVALID_SERVICE_PRICE: Price must be a non-negative integer.'
      USING ERRCODE = '22023';
  END IF;

  IF p_service_key IS NOT NULL AND pg_catalog.char_length(pg_catalog.btrim(p_service_key)) > 0 THEN
    v_service_key := pg_catalog.lower(pg_catalog.btrim(p_service_key));
  ELSE
    v_service_key := pg_catalog.btrim(
      pg_catalog.regexp_replace(pg_catalog.lower(v_name_en), '[^a-z0-9]+', '-', 'g'),
      '-'
    );
  END IF;

  IF v_service_key IS NULL OR v_service_key !~ '^[a-z0-9-]+$' THEN
    RAISE EXCEPTION 'INVALID_SERVICE_KEY: Service key must contain lowercase letters, numbers, or hyphens.'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.services AS s
    WHERE s.service_key = v_service_key
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_SERVICE_KEY: A service with key "%" already exists.', v_service_key
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.services AS s
    WHERE pg_catalog.lower(pg_catalog.btrim(s.name_en)) = pg_catalog.lower(v_name_en)
       OR pg_catalog.lower(pg_catalog.btrim(s.name_gu)) = pg_catalog.lower(v_name_gu)
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_SERVICE_NAME: A service with this English or Gujarati name already exists.'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_staff_ids IS NOT NULL AND EXISTS (
    SELECT 1 FROM pg_catalog.unnest(p_staff_ids) AS u(id) WHERE u.id IS NULL
  ) THEN
    RAISE EXCEPTION 'INVALID_STAFF_IDS: Staff IDs must not contain null values.'
      USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(pg_catalog.array_agg(DISTINCT u.id), '{}'::UUID[])
  INTO v_staff_ids
  FROM pg_catalog.unnest(COALESCE(p_staff_ids, '{}'::UUID[])) AS u(id);

  IF pg_catalog.cardinality(v_staff_ids) > 0 THEN
    SELECT COUNT(*)::INTEGER
    INTO v_missing_staff
    FROM pg_catalog.unnest(v_staff_ids) AS req(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.staff AS st WHERE st.id = req.id
    );

    IF v_missing_staff > 0 THEN
      RAISE EXCEPTION 'STAFF_NOT_FOUND: One or more selected staff members do not exist.'
        USING ERRCODE = 'P0002';
    END IF;
  END IF;

  IF v_is_active AND COALESCE(pg_catalog.cardinality(v_staff_ids), 0) < 1 THEN
    RAISE EXCEPTION 'ACTIVE_SERVICE_REQUIRES_QUALIFIED_STAFF: An active service must have at least one qualified stylist assigned.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(MAX(s.display_order), 0) + 1
  INTO v_next_order
  FROM public.services AS s;

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
  VALUES (
    v_service_key,
    v_category,
    v_name_en,
    v_name_gu,
    p_duration_minutes,
    p_price_inr,
    v_is_active,
    v_next_order
  )
  RETURNING * INTO v_service;

  IF pg_catalog.cardinality(v_staff_ids) > 0 THEN
    INSERT INTO public.staff_services (staff_id, service_id)
    SELECT st.id, v_service.id
    FROM public.staff AS st
    WHERE st.id = ANY(v_staff_ids)
    ON CONFLICT (staff_id, service_id) DO NOTHING;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', TRUE,
    'data', pg_catalog.jsonb_build_object(
      'service', pg_catalog.to_jsonb(v_service),
      'qualified_staff_ids', v_staff_ids
    ),
    'message', pg_catalog.format('Service "%s" created.', v_service.name_en)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. public.owner_update_service
--    Atomically updates a service and optionally replaces its qualified staff,
--    enforcing that active services always retain >= 1 qualified staff member.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.owner_update_service(
  p_service_id       UUID,
  p_category         TEXT    DEFAULT NULL,
  p_name_en          TEXT    DEFAULT NULL,
  p_name_gu          TEXT    DEFAULT NULL,
  p_duration_minutes INTEGER DEFAULT NULL,
  p_price_inr        INTEGER DEFAULT NULL,
  p_is_active        BOOLEAN DEFAULT NULL,
  p_staff_ids        UUID[]  DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_service          public.services%ROWTYPE;
  v_category         TEXT;
  v_name_en          TEXT;
  v_name_gu          TEXT;
  v_duration         INTEGER;
  v_price            INTEGER;
  v_is_active        BOOLEAN;
  v_staff_ids        UUID[];
  v_missing_staff    INTEGER := 0;
  v_qualified_ids    UUID[];
BEGIN
  IF p_service_id IS NULL THEN
    RAISE EXCEPTION 'SERVICE_ID_REQUIRED: p_service_id is required.'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_service
  FROM public.services AS s
  WHERE s.id = p_service_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SERVICE_NOT_FOUND: Service % does not exist.', p_service_id
      USING ERRCODE = 'P0002';
  END IF;

  v_category := COALESCE(pg_catalog.btrim(p_category), v_service.category);
  v_name_en := COALESCE(pg_catalog.btrim(p_name_en), v_service.name_en);
  v_name_gu := COALESCE(pg_catalog.btrim(p_name_gu), v_service.name_gu);
  v_duration := COALESCE(p_duration_minutes, v_service.duration_minutes);
  v_price := COALESCE(p_price_inr, v_service.price_inr);
  v_is_active := COALESCE(p_is_active, v_service.is_active);

  IF v_category NOT IN ('Hair', 'Beard & Grooming', 'Skin', 'Hands & Feet') THEN
    RAISE EXCEPTION 'INVALID_SERVICE_CATEGORY: Category must be Hair, Beard & Grooming, Skin, or Hands & Feet.'
      USING ERRCODE = '22023';
  END IF;

  IF pg_catalog.char_length(v_name_en) = 0 OR pg_catalog.char_length(v_name_en) > 120 THEN
    RAISE EXCEPTION 'INVALID_SERVICE_NAME: English service name must be between 1 and 120 characters.'
      USING ERRCODE = '22023';
  END IF;

  IF pg_catalog.char_length(v_name_gu) = 0 OR pg_catalog.char_length(v_name_gu) > 120 THEN
    RAISE EXCEPTION 'INVALID_SERVICE_NAME: Gujarati service name must be between 1 and 120 characters.'
      USING ERRCODE = '22023';
  END IF;

  IF v_duration <= 0 OR v_duration > 600 THEN
    RAISE EXCEPTION 'INVALID_SERVICE_DURATION: Duration must be between 1 and 600 minutes.'
      USING ERRCODE = '22023';
  END IF;

  IF v_price < 0 OR v_price > 500000 THEN
    RAISE EXCEPTION 'INVALID_SERVICE_PRICE: Price must be a non-negative integer.'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.services AS s
    WHERE s.id <> p_service_id
      AND (
        pg_catalog.lower(pg_catalog.btrim(s.name_en)) = pg_catalog.lower(v_name_en)
        OR pg_catalog.lower(pg_catalog.btrim(s.name_gu)) = pg_catalog.lower(v_name_gu)
      )
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_SERVICE_NAME: Another service already uses this English or Gujarati name.'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_staff_ids IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_catalog.unnest(p_staff_ids) AS u(id) WHERE u.id IS NULL) THEN
      RAISE EXCEPTION 'INVALID_STAFF_IDS: Staff IDs must not contain null values.'
        USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(pg_catalog.array_agg(DISTINCT u.id), '{}'::UUID[])
    INTO v_staff_ids
    FROM pg_catalog.unnest(p_staff_ids) AS u(id);

    IF pg_catalog.cardinality(v_staff_ids) > 0 THEN
      SELECT COUNT(*)::INTEGER
      INTO v_missing_staff
      FROM pg_catalog.unnest(v_staff_ids) AS req(id)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.staff AS st WHERE st.id = req.id
      );

      IF v_missing_staff > 0 THEN
        RAISE EXCEPTION 'STAFF_NOT_FOUND: One or more selected staff members do not exist.'
          USING ERRCODE = 'P0002';
      END IF;
    END IF;

    DELETE FROM public.staff_services AS ss
    WHERE ss.service_id = p_service_id;

    IF pg_catalog.cardinality(v_staff_ids) > 0 THEN
      INSERT INTO public.staff_services (staff_id, service_id)
      SELECT st.id, p_service_id
      FROM public.staff AS st
      WHERE st.id = ANY(v_staff_ids)
      ON CONFLICT (staff_id, service_id) DO NOTHING;
    END IF;
  END IF;

  SELECT COALESCE(pg_catalog.array_agg(ss.staff_id ORDER BY ss.staff_id), '{}'::UUID[])
  INTO v_qualified_ids
  FROM public.staff_services AS ss
  WHERE ss.service_id = p_service_id;

  IF v_is_active AND COALESCE(pg_catalog.cardinality(v_qualified_ids), 0) < 1 THEN
    RAISE EXCEPTION 'ACTIVE_SERVICE_REQUIRES_QUALIFIED_STAFF: Service "%" cannot be active without at least one qualified stylist.', v_name_en
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.services AS s
  SET
    category = v_category,
    name_en = v_name_en,
    name_gu = v_name_gu,
    duration_minutes = v_duration,
    price_inr = v_price,
    is_active = v_is_active
  WHERE s.id = p_service_id
  RETURNING * INTO v_service;

  RETURN pg_catalog.jsonb_build_object(
    'success', TRUE,
    'data', pg_catalog.jsonb_build_object(
      'service', pg_catalog.to_jsonb(v_service),
      'qualified_staff_ids', v_qualified_ids
    ),
    'message', pg_catalog.format('Service "%s" updated.', v_service.name_en)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. public.owner_update_staff_profile
--    Updates supported bilingual profile fields and slug on public.staff.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.owner_update_staff_profile(
  p_staff_id      UUID,
  p_slug          TEXT DEFAULT NULL,
  p_name_en       TEXT DEFAULT NULL,
  p_name_gu       TEXT DEFAULT NULL,
  p_role_en       TEXT DEFAULT NULL,
  p_role_gu       TEXT DEFAULT NULL,
  p_speciality_en TEXT DEFAULT NULL,
  p_speciality_gu TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_staff         public.staff%ROWTYPE;
  v_slug          TEXT;
  v_name_en       TEXT;
  v_name_gu       TEXT;
  v_role_en       TEXT;
  v_role_gu       TEXT;
  v_speciality_en TEXT;
  v_speciality_gu TEXT;
BEGIN
  IF p_staff_id IS NULL THEN
    RAISE EXCEPTION 'STAFF_ID_REQUIRED: p_staff_id is required.'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_staff
  FROM public.staff AS st
  WHERE st.id = p_staff_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'STAFF_NOT_FOUND: Staff member % does not exist.', p_staff_id
      USING ERRCODE = 'P0002';
  END IF;

  v_slug := COALESCE(pg_catalog.lower(pg_catalog.btrim(p_slug)), v_staff.slug);
  v_name_en := COALESCE(pg_catalog.btrim(p_name_en), v_staff.name_en);
  v_name_gu := COALESCE(pg_catalog.btrim(p_name_gu), v_staff.name_gu);
  v_role_en := COALESCE(pg_catalog.btrim(p_role_en), v_staff.role_en);
  v_role_gu := COALESCE(pg_catalog.btrim(p_role_gu), v_staff.role_gu);
  v_speciality_en := COALESCE(pg_catalog.btrim(p_speciality_en), v_staff.speciality_en);
  v_speciality_gu := COALESCE(pg_catalog.btrim(p_speciality_gu), v_staff.speciality_gu);

  IF v_slug !~ '^[a-z0-9-]+$' OR pg_catalog.char_length(v_slug) > 64 THEN
    RAISE EXCEPTION 'INVALID_STAFF_SLUG: Slug must contain lowercase letters, numbers, or hyphens.'
      USING ERRCODE = '22023';
  END IF;

  IF pg_catalog.char_length(v_name_en) = 0 OR pg_catalog.char_length(v_name_gu) = 0
     OR pg_catalog.char_length(v_role_en) = 0 OR pg_catalog.char_length(v_role_gu) = 0
     OR pg_catalog.char_length(v_speciality_en) = 0 OR pg_catalog.char_length(v_speciality_gu) = 0 THEN
    RAISE EXCEPTION 'INVALID_STAFF_PROFILE: Name, role, and speciality are required in both English and Gujarati.'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.staff AS st
    WHERE st.id <> p_staff_id
      AND st.slug = v_slug
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_STAFF_SLUG: Slug "%" is already assigned to another staff member.', v_slug
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.staff AS st
  SET
    slug = v_slug,
    name_en = v_name_en,
    name_gu = v_name_gu,
    role_en = v_role_en,
    role_gu = v_role_gu,
    speciality_en = v_speciality_en,
    speciality_gu = v_speciality_gu
  WHERE st.id = p_staff_id
  RETURNING * INTO v_staff;

  RETURN pg_catalog.jsonb_build_object(
    'success', TRUE,
    'data', pg_catalog.jsonb_build_object(
      'staff', pg_catalog.to_jsonb(v_staff)
    ),
    'message', pg_catalog.format('Staff profile "%s" updated.', v_staff.name_en)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. public.owner_set_staff_qualifications
--    Atomically replaces a staff member's qualified services and rejects
--    removing coverage from any active service.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.owner_set_staff_qualifications(
  p_staff_id    UUID,
  p_service_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_staff            public.staff%ROWTYPE;
  v_service_ids      UUID[];
  v_missing_services INTEGER := 0;
  v_uncovered_name   TEXT;
BEGIN
  IF p_staff_id IS NULL THEN
    RAISE EXCEPTION 'STAFF_ID_REQUIRED: p_staff_id is required.'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_staff
  FROM public.staff AS st
  WHERE st.id = p_staff_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'STAFF_NOT_FOUND: Staff member % does not exist.', p_staff_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Lock services deterministically to prevent concurrent coverage races.
  PERFORM s.id
  FROM public.services AS s
  ORDER BY s.id ASC
  FOR UPDATE;

  IF p_service_ids IS NOT NULL AND EXISTS (
    SELECT 1 FROM pg_catalog.unnest(p_service_ids) AS u(id) WHERE u.id IS NULL
  ) THEN
    RAISE EXCEPTION 'INVALID_SERVICE_IDS: Service IDs must not contain null values.'
      USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(pg_catalog.array_agg(DISTINCT u.id), '{}'::UUID[])
  INTO v_service_ids
  FROM pg_catalog.unnest(COALESCE(p_service_ids, '{}'::UUID[])) AS u(id);

  IF pg_catalog.cardinality(v_service_ids) > 0 THEN
    SELECT COUNT(*)::INTEGER
    INTO v_missing_services
    FROM pg_catalog.unnest(v_service_ids) AS req(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.services AS s WHERE s.id = req.id
    );

    IF v_missing_services > 0 THEN
      RAISE EXCEPTION 'SERVICE_NOT_FOUND: One or more selected services do not exist.'
        USING ERRCODE = 'P0002';
    END IF;
  END IF;

  DELETE FROM public.staff_services AS ss
  WHERE ss.staff_id = p_staff_id;

  IF pg_catalog.cardinality(v_service_ids) > 0 THEN
    INSERT INTO public.staff_services (staff_id, service_id)
    SELECT p_staff_id, s.id
    FROM public.services AS s
    WHERE s.id = ANY(v_service_ids)
    ON CONFLICT (staff_id, service_id) DO NOTHING;
  END IF;

  SELECT s.name_en
  INTO v_uncovered_name
  FROM public.services AS s
  WHERE s.is_active = TRUE
    AND NOT EXISTS (
      SELECT 1
      FROM public.staff_services AS ss
      WHERE ss.service_id = s.id
    )
  ORDER BY s.display_order ASC, s.name_en ASC
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'ACTIVE_SERVICE_REQUIRES_QUALIFIED_STAFF: Active service "%" requires at least one qualified stylist.', v_uncovered_name
      USING ERRCODE = 'P0001';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', TRUE,
    'data', pg_catalog.jsonb_build_object(
      'staff_id', p_staff_id,
      'service_ids', v_service_ids
    ),
    'message', pg_catalog.format('Qualifications updated for %s.', v_staff.name_en)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. public.owner_toggle_qualification
--    Adds or removes a single staff-service qualification safely.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.owner_toggle_qualification(
  p_staff_id   UUID,
  p_service_id UUID,
  p_qualified  BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_staff     public.staff%ROWTYPE;
  v_service   public.services%ROWTYPE;
  v_remaining INTEGER := 0;
BEGIN
  IF p_staff_id IS NULL OR p_service_id IS NULL OR p_qualified IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENTS: p_staff_id, p_service_id, and p_qualified are required.'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_staff FROM public.staff AS st WHERE st.id = p_staff_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'STAFF_NOT_FOUND: Staff member % does not exist.', p_staff_id
      USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_service FROM public.services AS s WHERE s.id = p_service_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SERVICE_NOT_FOUND: Service % does not exist.', p_service_id
      USING ERRCODE = 'P0002';
  END IF;

  IF p_qualified THEN
    INSERT INTO public.staff_services (staff_id, service_id)
    VALUES (p_staff_id, p_service_id)
    ON CONFLICT (staff_id, service_id) DO NOTHING;
  ELSE
    SELECT COUNT(*)::INTEGER
    INTO v_remaining
    FROM public.staff_services AS ss
    WHERE ss.service_id = p_service_id
      AND ss.staff_id <> p_staff_id;

    IF v_service.is_active AND v_remaining < 1 THEN
      RAISE EXCEPTION 'ACTIVE_SERVICE_REQUIRES_QUALIFIED_STAFF: Active service "%" requires at least one qualified stylist.', v_service.name_en
        USING ERRCODE = 'P0001';
    END IF;

    DELETE FROM public.staff_services AS ss
    WHERE ss.staff_id = p_staff_id
      AND ss.service_id = p_service_id;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', TRUE,
    'data', pg_catalog.jsonb_build_object(
      'staff_id', p_staff_id,
      'service_id', p_service_id,
      'qualified', p_qualified
    ),
    'message', CASE
      WHEN p_qualified THEN pg_catalog.format('%s is now qualified for %s.', v_staff.name_en, v_service.name_en)
      ELSE pg_catalog.format('Removed %s qualification for %s.', v_service.name_en, v_staff.name_en)
    END
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. public.owner_update_salon_settings
--    Validates and updates singleton salon_settings (operating hours & queue).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.owner_update_salon_settings(
  p_operating_hours       JSONB   DEFAULT NULL,
  p_is_online_queue_open  BOOLEAN DEFAULT NULL,
  p_daily_online_capacity INTEGER DEFAULT NULL,
  p_online_cutoff_minutes INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_settings      public.salon_settings%ROWTYPE;
  v_hours         JSONB;
  v_online_open   BOOLEAN;
  v_capacity      INTEGER;
  v_cutoff        INTEGER;
  v_days          TEXT[] := ARRAY['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  v_day           TEXT;
  v_day_val       JSONB;
  v_open          TEXT;
  v_close         TEXT;
BEGIN
  SELECT *
  INTO v_settings
  FROM public.salon_settings AS ss
  WHERE ss.id = 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SETTINGS_MISSING: Salon settings row (id=1) does not exist.'
      USING ERRCODE = 'P0002';
  END IF;

  v_hours := COALESCE(p_operating_hours, v_settings.operating_hours);
  v_online_open := COALESCE(p_is_online_queue_open, v_settings.is_online_queue_open);
  v_capacity := COALESCE(p_daily_online_capacity, v_settings.daily_online_capacity);
  v_cutoff := COALESCE(p_online_cutoff_minutes, v_settings.online_cutoff_minutes);

  IF p_operating_hours IS NOT NULL THEN
    IF pg_catalog.jsonb_typeof(v_hours) <> 'object' THEN
      RAISE EXCEPTION 'INVALID_OPERATING_HOURS: operating_hours must be a JSON object.'
        USING ERRCODE = '22023';
    END IF;

    FOREACH v_day IN ARRAY v_days LOOP
      IF NOT (v_hours ? v_day) THEN
        RAISE EXCEPTION 'INVALID_OPERATING_HOURS: Missing weekday key "%" in operating_hours.', v_day
          USING ERRCODE = '22023';
      END IF;

      v_day_val := v_hours -> v_day;
      IF pg_catalog.jsonb_typeof(v_day_val) = 'null' THEN
        CONTINUE;
      END IF;

      IF pg_catalog.jsonb_typeof(v_day_val) <> 'object' THEN
        RAISE EXCEPTION 'INVALID_OPERATING_HOURS: Schedule for "%" must be null or an object with open and close.', v_day
          USING ERRCODE = '22023';
      END IF;

      v_open := pg_catalog.btrim(COALESCE(v_day_val ->> 'open', ''));
      v_close := pg_catalog.btrim(COALESCE(v_day_val ->> 'close', ''));

      IF v_open !~ '^([01][0-9]|2[0-3]):([0-5][0-9])$'
         OR v_close !~ '^([01][0-9]|2[0-3]):([0-5][0-9])$' THEN
        RAISE EXCEPTION 'INVALID_OPERATING_HOURS: Times for "%" must use HH:MM 24-hour format.', v_day
          USING ERRCODE = '22023';
      END IF;

      IF v_open >= v_close THEN
        RAISE EXCEPTION 'INVALID_OPERATING_HOURS: Closing time must be later than opening time for "%".', v_day
          USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END IF;

  IF v_capacity < 0 OR v_capacity > 500 THEN
    RAISE EXCEPTION 'INVALID_DAILY_CAPACITY: Daily online capacity must be between 0 and 500.'
      USING ERRCODE = '22023';
  END IF;

  IF v_cutoff < 0 OR v_cutoff > 360 THEN
    RAISE EXCEPTION 'INVALID_ONLINE_CUTOFF: Online cutoff must be between 0 and 360 minutes.'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.salon_settings AS ss
  SET
    operating_hours = v_hours,
    is_online_queue_open = v_online_open,
    daily_online_capacity = v_capacity,
    online_cutoff_minutes = v_cutoff
  WHERE ss.id = 1
  RETURNING * INTO v_settings;

  RETURN pg_catalog.jsonb_build_object(
    'success', TRUE,
    'data', pg_catalog.to_jsonb(v_settings),
    'message', 'Salon settings updated.'
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Explicit Privilege Restrictions (service_role only)
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.owner_create_service(TEXT, TEXT, TEXT, INTEGER, INTEGER, BOOLEAN, UUID[], TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owner_create_service(TEXT, TEXT, TEXT, INTEGER, INTEGER, BOOLEAN, UUID[], TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.owner_update_service(UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, BOOLEAN, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owner_update_service(UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, BOOLEAN, UUID[]) TO service_role;

REVOKE ALL ON FUNCTION public.owner_update_staff_profile(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owner_update_staff_profile(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.owner_set_staff_qualifications(UUID, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owner_set_staff_qualifications(UUID, UUID[]) TO service_role;

REVOKE ALL ON FUNCTION public.owner_toggle_qualification(UUID, UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owner_toggle_qualification(UUID, UUID, BOOLEAN) TO service_role;

REVOKE ALL ON FUNCTION public.owner_update_salon_settings(JSONB, BOOLEAN, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owner_update_salon_settings(JSONB, BOOLEAN, INTEGER, INTEGER) TO service_role;
