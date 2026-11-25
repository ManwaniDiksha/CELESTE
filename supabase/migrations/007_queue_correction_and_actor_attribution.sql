-- ============================================================================
-- CELESTE — Salon Queue Management System
-- Migration 007: Atomic Queue Entry Correction & Actor Attribution RPCs
-- Source of Truth:
--   - supabase/migrations/001_schema_and_indexes.sql
--   - supabase/migrations/002_queue_functions.sql
--   - docs/03-flows-rules.md (Sections 7 & 16)
--   - docs/04-database-design.md (Sections 4, 6 & 9)
--
-- Scope & Security:
--   - Additive only: does NOT modify migrations 001–006 or existing functions.
--   - Adds:
--       1. public.correct_queue_entry(UUID, TEXT, UUID[])
--       2. public.start_service_with_actor(UUID, UUID, TEXT)
--       3. public.complete_service_with_actor(UUID, UUID, TEXT)
--   - All functions use SECURITY DEFINER SET search_path = '' and fully
--     qualified schema references, with EXECUTE granted strictly to service_role.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. public.correct_queue_entry(p_entry_id, p_customer_name, p_service_ids)
--    Atomically corrects customer name and/or selected services ONLY while
--    queue_entries.status = 'Waiting'. Preserves token_number, token_display,
--    joined_at, queue_date, and assigned_staff_id.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.correct_queue_entry(
  p_entry_id      UUID,
  p_customer_name TEXT DEFAULT NULL,
  p_service_ids   UUID[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_settings         public.salon_settings%ROWTYPE;
  v_entry            public.queue_entries%ROWTYPE;
  v_customer_name    TEXT;
  v_service_count    INTEGER;
  v_distinct_count   INTEGER;
  v_active_svc_count INTEGER;
  v_qual_count       INTEGER;
  v_total_duration   INTEGER := 0;
  v_total_price      INTEGER := 0;
BEGIN
  IF p_entry_id IS NULL THEN
    RAISE EXCEPTION 'ENTRY_ID_REQUIRED: p_entry_id must not be null.'
      USING ERRCODE = '22023';
  END IF;

  IF p_customer_name IS NULL AND p_service_ids IS NULL THEN
    RAISE EXCEPTION 'CORRECTION_FIELDS_REQUIRED: Provide p_customer_name and/or p_service_ids.'
      USING ERRCODE = '22023';
  END IF;

  -- Consistent top-down lock ordering: salon_settings -> queue_entries -> customers / queue_entry_services
  SELECT *
  INTO v_settings
  FROM public.salon_settings AS s
  WHERE s.id = 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SALON_SETTINGS_MISSING: Singleton row id=1 in public.salon_settings is missing.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT *
  INTO v_entry
  FROM public.queue_entries AS qe
  WHERE qe.id = p_entry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ENTRY_NOT_FOUND: Queue entry % does not exist.', p_entry_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_entry.status <> 'Waiting' THEN
    RAISE EXCEPTION 'CORRECTION_ONLY_WAITING: Queue entry can only be corrected while Waiting (current: %).', v_entry.status
      USING ERRCODE = 'P0001';
  END IF;

  IF p_customer_name IS NOT NULL THEN
    v_customer_name := pg_catalog.btrim(p_customer_name);
    IF pg_catalog.char_length(v_customer_name) = 0 THEN
      RAISE EXCEPTION 'INVALID_CUSTOMER_NAME: Customer name must not be empty.'
        USING ERRCODE = '22023';
    END IF;

    UPDATE public.customers AS c
    SET name = v_customer_name
    WHERE c.id = v_entry.customer_id
    RETURNING c.name INTO v_customer_name;
  ELSE
    SELECT c.name
    INTO v_customer_name
    FROM public.customers AS c
    WHERE c.id = v_entry.customer_id;
  END IF;

  IF p_service_ids IS NOT NULL THEN
    IF pg_catalog.array_ndims(p_service_ids) IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'INVALID_SERVICES: Between 1 and % services must be selected.', v_settings.max_services_per_entry
        USING ERRCODE = '22023';
    END IF;

    v_service_count := pg_catalog.cardinality(p_service_ids);
    IF v_service_count < 1 OR v_service_count > v_settings.max_services_per_entry THEN
      RAISE EXCEPTION 'INVALID_SERVICE_COUNT: You can select between 1 and % services.', v_settings.max_services_per_entry
        USING ERRCODE = '22023';
    END IF;

    SELECT COUNT(DISTINCT u.service_id)::INTEGER
    INTO v_distinct_count
    FROM pg_catalog.unnest(p_service_ids) AS u(service_id)
    WHERE u.service_id IS NOT NULL;

    IF v_distinct_count <> v_service_count THEN
      RAISE EXCEPTION 'DUPLICATE_SERVICES_NOT_ALLOWED: Selected services must be distinct and non-null.'
        USING ERRCODE = '22023';
    END IF;

    SELECT
      COUNT(*)::INTEGER,
      COALESCE(SUM(sv.duration_minutes), 0)::INTEGER,
      COALESCE(SUM(sv.price_inr), 0)::INTEGER
    INTO v_active_svc_count, v_total_duration, v_total_price
    FROM public.services AS sv
    WHERE sv.id = ANY(p_service_ids)
      AND sv.is_active = TRUE;

    IF v_active_svc_count <> v_service_count THEN
      RAISE EXCEPTION 'INACTIVE_OR_UNKNOWN_SERVICE: One or more selected services are unavailable or do not exist.'
        USING ERRCODE = 'P0001';
    END IF;

    SELECT COUNT(*)::INTEGER
    INTO v_qual_count
    FROM public.staff_services AS ss
    WHERE ss.staff_id = v_entry.assigned_staff_id
      AND ss.service_id = ANY(p_service_ids);

    IF v_qual_count <> v_service_count THEN
      RAISE EXCEPTION 'STYLIST_NOT_QUALIFIED: Assigned stylist is not qualified for all selected services.'
        USING ERRCODE = 'P0001';
    END IF;

    DELETE FROM public.queue_entry_services AS qes
    WHERE qes.queue_entry_id = p_entry_id;

    INSERT INTO public.queue_entry_services (
      queue_entry_id,
      service_id,
      position,
      service_name_en_snapshot,
      service_name_gu_snapshot,
      duration_minutes_snapshot,
      price_inr_snapshot
    )
    SELECT
      v_entry.id,
      sv.id,
      u.pos::SMALLINT,
      sv.name_en,
      sv.name_gu,
      sv.duration_minutes,
      sv.price_inr
    FROM pg_catalog.unnest(p_service_ids) WITH ORDINALITY AS u(service_id, pos)
    JOIN public.services AS sv
      ON sv.id = u.service_id
    ORDER BY u.pos;
  ELSE
    SELECT
      COALESCE(SUM(qes.duration_minutes_snapshot), 0)::INTEGER,
      COALESCE(SUM(qes.price_inr_snapshot), 0)::INTEGER
    INTO v_total_duration, v_total_price
    FROM public.queue_entry_services AS qes
    WHERE qes.queue_entry_id = p_entry_id;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', TRUE,
    'data', pg_catalog.jsonb_build_object(
      'entry_id', v_entry.id,
      'queue_date', v_entry.queue_date,
      'token_number', v_entry.token_number,
      'token_display', v_entry.token_display,
      'assigned_staff_id', v_entry.assigned_staff_id,
      'status', v_entry.status,
      'joined_at', v_entry.joined_at,
      'customer_name', v_customer_name,
      'total_duration_minutes', v_total_duration,
      'total_price_inr', v_total_price
    ),
    'message', pg_catalog.format('Queue entry %s updated.', v_entry.token_display)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. public.start_service_with_actor(p_staff_id, p_entry_id, p_actor_role)
--    Preserves all rules from start_service() while recording exact acting role
--    ('reception' or 'staff') in queue_status_history.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.start_service_with_actor(
  p_staff_id   UUID,
  p_entry_id   UUID,
  p_actor_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_today_ist      DATE;
  v_staff          public.staff%ROWTYPE;
  v_entry          public.queue_entries%ROWTYPE;
  v_total_duration INTEGER := 0;
BEGIN
  IF p_staff_id IS NULL OR p_entry_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENTS: p_staff_id and p_entry_id are required.'
      USING ERRCODE = '22023';
  END IF;

  IF p_actor_role IS NULL OR p_actor_role NOT IN ('staff', 'reception') THEN
    RAISE EXCEPTION 'INVALID_ACTOR_ROLE: Actor role must be staff or reception.'
      USING ERRCODE = '22023';
  END IF;

  PERFORM public.initialize_new_day_staff_availability();
  v_today_ist := public.get_ist_date();

  SELECT *
  INTO v_staff
  FROM public.staff AS st
  WHERE st.id = p_staff_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'STAFF_NOT_FOUND: Staff member % does not exist.', p_staff_id
      USING ERRCODE = 'P0002';
  END IF;

  SELECT *
  INTO v_entry
  FROM public.queue_entries AS qe
  WHERE qe.id = p_entry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ENTRY_NOT_FOUND: Queue entry % does not exist.', p_entry_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_entry.assigned_staff_id <> p_staff_id THEN
    RAISE EXCEPTION 'ENTRY_NOT_ASSIGNED_TO_STAFF: Queue entry % is not assigned to stylist %.', p_entry_id, p_staff_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_entry.queue_date <> v_today_ist THEN
    RAISE EXCEPTION 'ENTRY_NOT_FOR_TODAY: Cannot start a queue entry from a previous date.'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_entry.status <> 'Called' THEN
    RAISE EXCEPTION 'ENTRY_MUST_BE_CALLED: Service can only start when entry status is Called (current: %).', v_entry.status
      USING ERRCODE = 'P0001';
  END IF;

  IF v_staff.availability_status = 'Busy' THEN
    RAISE EXCEPTION 'STAFF_ALREADY_BUSY: Stylist is already serving another customer.'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_catalog.set_config('app.actor_role', p_actor_role, true);
  PERFORM pg_catalog.set_config(
    'app.actor_ref',
    CASE
      WHEN p_actor_role = 'reception' THEN 'reception:' || p_staff_id::TEXT
      ELSE p_staff_id::TEXT
    END,
    true
  );
  PERFORM pg_catalog.set_config(
    'app.transition_note',
    'Service started in chair by ' || p_actor_role,
    true
  );

  UPDATE public.queue_entries AS qe
  SET
    status = 'In Chair',
    started_at = pg_catalog.now()
  WHERE qe.id = p_entry_id
  RETURNING * INTO v_entry;

  UPDATE public.staff AS st
  SET availability_status = 'Busy'
  WHERE st.id = p_staff_id;

  SELECT COALESCE(SUM(qes.duration_minutes_snapshot), 0)::INTEGER
  INTO v_total_duration
  FROM public.queue_entry_services AS qes
  WHERE qes.queue_entry_id = p_entry_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', TRUE,
    'data', pg_catalog.jsonb_build_object(
      'entry_id', v_entry.id,
      'token_display', v_entry.token_display,
      'assigned_staff_id', v_entry.assigned_staff_id,
      'status', v_entry.status,
      'started_at', v_entry.started_at,
      'total_duration_minutes', v_total_duration,
      'actor_role', p_actor_role
    ),
    'message', pg_catalog.format('Started service for token %s.', v_entry.token_display)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. public.complete_service_with_actor(p_staff_id, p_entry_id, p_actor_role)
--    Preserves all rules from complete_service() while recording exact acting role
--    ('reception' or 'staff') in queue_status_history.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.complete_service_with_actor(
  p_staff_id   UUID,
  p_entry_id   UUID,
  p_actor_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_today_ist    DATE;
  v_staff        public.staff%ROWTYPE;
  v_entry        public.queue_entries%ROWTYPE;
  v_completed_at TIMESTAMPTZ;
BEGIN
  IF p_staff_id IS NULL OR p_entry_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENTS: p_staff_id and p_entry_id are required.'
      USING ERRCODE = '22023';
  END IF;

  IF p_actor_role IS NULL OR p_actor_role NOT IN ('staff', 'reception') THEN
    RAISE EXCEPTION 'INVALID_ACTOR_ROLE: Actor role must be staff or reception.'
      USING ERRCODE = '22023';
  END IF;

  PERFORM public.initialize_new_day_staff_availability();
  v_today_ist := public.get_ist_date();

  SELECT *
  INTO v_staff
  FROM public.staff AS st
  WHERE st.id = p_staff_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'STAFF_NOT_FOUND: Staff member % does not exist.', p_staff_id
      USING ERRCODE = 'P0002';
  END IF;

  SELECT *
  INTO v_entry
  FROM public.queue_entries AS qe
  WHERE qe.id = p_entry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ENTRY_NOT_FOUND: Queue entry % does not exist.', p_entry_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_entry.assigned_staff_id <> p_staff_id THEN
    RAISE EXCEPTION 'ENTRY_NOT_ASSIGNED_TO_STAFF: Queue entry % is not assigned to stylist %.', p_entry_id, p_staff_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_entry.status <> 'In Chair' THEN
    RAISE EXCEPTION 'ENTRY_MUST_BE_IN_CHAIR: Service can only be completed when status is In Chair (current: %).', v_entry.status
      USING ERRCODE = 'P0001';
  END IF;

  v_completed_at := GREATEST(pg_catalog.now(), v_entry.started_at);

  PERFORM pg_catalog.set_config('app.actor_role', p_actor_role, true);
  PERFORM pg_catalog.set_config(
    'app.actor_ref',
    CASE
      WHEN p_actor_role = 'reception' THEN 'reception:' || p_staff_id::TEXT
      ELSE p_staff_id::TEXT
    END,
    true
  );
  PERFORM pg_catalog.set_config(
    'app.transition_note',
    'Service completed by ' || p_actor_role,
    true
  );

  UPDATE public.queue_entries AS qe
  SET
    status = 'Done',
    completed_at = v_completed_at
  WHERE qe.id = p_entry_id
  RETURNING * INTO v_entry;

  IF v_entry.queue_date = v_today_ist THEN
    UPDATE public.staff AS st
    SET
      availability_status = CASE
        WHEN st.is_on_duty AND st.availability_status <> 'On Break' THEN 'Available'
        ELSE st.availability_status
      END,
      available_since = CASE
        WHEN st.is_on_duty AND st.availability_status <> 'On Break' THEN pg_catalog.now()
        ELSE st.available_since
      END
    WHERE st.id = p_staff_id
    RETURNING * INTO v_staff;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', TRUE,
    'data', pg_catalog.jsonb_build_object(
      'entry_id', v_entry.id,
      'token_display', v_entry.token_display,
      'assigned_staff_id', v_entry.assigned_staff_id,
      'status', v_entry.status,
      'started_at', v_entry.started_at,
      'completed_at', v_entry.completed_at,
      'staff_availability_status', v_staff.availability_status,
      'actor_role', p_actor_role
    ),
    'message', pg_catalog.format('Completed service for token %s.', v_entry.token_display)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Explicit Function Execution Privileges
--    Revoked from PUBLIC, anon, authenticated; granted strictly to service_role.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.correct_queue_entry(UUID, TEXT, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.correct_queue_entry(UUID, TEXT, UUID[]) TO service_role;

REVOKE ALL ON FUNCTION public.start_service_with_actor(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_service_with_actor(UUID, UUID, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.complete_service_with_actor(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_service_with_actor(UUID, UUID, TEXT) TO service_role;
