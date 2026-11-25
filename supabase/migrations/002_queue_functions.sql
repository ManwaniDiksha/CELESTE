-- ============================================================================
-- CELESTE — Salon Queue Management System
-- Migration 002: Triggers, Helper Functions, and Atomic Queue RPCs
-- Source of Truth: docs/04-database-design.md & approved Phase 2 decisions
--
-- Security & Concurrency Model:
--   - Every function uses explicit schema qualification and SET search_path = ''.
--   - All 14 backend RPCs are SECURITY DEFINER, revoked from PUBLIC, anon, and
--     authenticated, and granted EXECUTE strictly to service_role.
--   - Trigger-only functions are revoked from PUBLIC, anon, authenticated, and
--     service_role so they cannot be invoked as RPCs.
--   - Lock ordering is top-down: salon_settings (id = 1) -> staff -> queue_entries.
--   - No manual BEGIN/COMMIT inside functions; runs in caller's transaction.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Trigger Functions (Internal Only — Not Exposed as RPCs)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_queue_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_no_show_window_minutes INTEGER;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'Waiting' AND NEW.status IN ('Called', 'Cancelled') THEN
    RETURN NEW;
  ELSIF OLD.status = 'Called' AND NEW.status IN ('In Chair', 'No-show', 'Cancelled') THEN
    IF NEW.status = 'No-show' THEN
      SELECT s.no_show_window_minutes
      INTO v_no_show_window_minutes
      FROM public.salon_settings AS s
      WHERE s.id = 1;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'SALON_SETTINGS_MISSING: Singleton row id=1 in public.salon_settings is missing.'
          USING ERRCODE = 'P0001';
      END IF;

      IF NEW.called_at IS NULL
         OR NEW.no_show_at IS NULL
         OR NEW.no_show_at < NEW.called_at + pg_catalog.make_interval(mins => v_no_show_window_minutes) THEN
        RAISE EXCEPTION 'NO_SHOW_WINDOW_NOT_ELAPSED: No-show is permitted only % minutes after Called.', v_no_show_window_minutes
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
    RETURN NEW;
  ELSIF OLD.status = 'In Chair' AND NEW.status = 'Done' THEN
    RETURN NEW;
  ELSIF OLD.status IN ('Done', 'Cancelled', 'No-show') THEN
    RAISE EXCEPTION 'TERMINAL_STATUS_IMMUTABLE: Cannot transition queue entry out of terminal status %.', OLD.status
      USING ERRCODE = 'P0001';
  ELSE
    RAISE EXCEPTION 'INVALID_STATUS_TRANSITION: Transition from % to % is not permitted.', OLD.status, NEW.status
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_queue_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_role TEXT;
  v_actor_ref  TEXT;
  v_note       TEXT;
BEGIN
  v_actor_role := COALESCE(
    NULLIF(pg_catalog.btrim(pg_catalog.current_setting('app.actor_role', true)), ''),
    'system'
  );
  IF v_actor_role NOT IN ('customer', 'reception', 'staff', 'owner', 'system') THEN
    v_actor_role := 'system';
  END IF;

  v_actor_ref := NULLIF(pg_catalog.btrim(pg_catalog.current_setting('app.actor_ref', true)), '');
  v_note := NULLIF(pg_catalog.btrim(pg_catalog.current_setting('app.transition_note', true)), '');

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.queue_status_history (
      queue_entry_id,
      from_status,
      to_status,
      changed_by_role,
      changed_by_ref,
      note,
      changed_at
    ) VALUES (
      NEW.id,
      NULL,
      NEW.status,
      v_actor_role,
      v_actor_ref,
      v_note,
      pg_catalog.now()
    );
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.queue_status_history (
      queue_entry_id,
      from_status,
      to_status,
      changed_by_role,
      changed_by_ref,
      note,
      changed_at
    ) VALUES (
      NEW.id,
      OLD.status,
      NEW.status,
      v_actor_role,
      v_actor_ref,
      v_note,
      pg_catalog.now()
    );
  END IF;

  RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Attach Triggers to Approved Tables
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_services_set_updated_at ON public.services;
CREATE TRIGGER trg_services_set_updated_at
  BEFORE UPDATE ON public.services
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_staff_set_updated_at ON public.staff;
CREATE TRIGGER trg_staff_set_updated_at
  BEFORE UPDATE ON public.staff
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_customers_set_updated_at ON public.customers;
CREATE TRIGGER trg_customers_set_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_queue_entries_set_updated_at ON public.queue_entries;
CREATE TRIGGER trg_queue_entries_set_updated_at
  BEFORE UPDATE ON public.queue_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_salon_settings_set_updated_at ON public.salon_settings;
CREATE TRIGGER trg_salon_settings_set_updated_at
  BEFORE UPDATE ON public.salon_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_pin_auth_attempts_set_updated_at ON public.pin_auth_attempts;
CREATE TRIGGER trg_pin_auth_attempts_set_updated_at
  BEFORE UPDATE ON public.pin_auth_attempts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_queue_entries_enforce_transition ON public.queue_entries;
CREATE TRIGGER trg_queue_entries_enforce_transition
  BEFORE UPDATE OF status ON public.queue_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_queue_status_transition();

DROP TRIGGER IF EXISTS trg_queue_entries_log_status_change ON public.queue_entries;
CREATE TRIGGER trg_queue_entries_log_status_change
  AFTER INSERT OR UPDATE OF status ON public.queue_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.log_queue_status_change();

-- ---------------------------------------------------------------------------
-- 3. IST Date & Business-Day Operating Hours Functions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_ist_date()
RETURNS DATE
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (pg_catalog.now() AT TIME ZONE 'Asia/Kolkata')::DATE;
$$;

CREATE OR REPLACE FUNCTION public.is_business_day_closed(p_date DATE)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_operating_hours JSONB;
  v_now_ist         TIMESTAMP;
  v_today_ist       DATE;
  v_time_ist        TIME;
  v_day_key         TEXT;
  v_day_hours       JSONB;
  v_open_str        TEXT;
  v_close_str       TEXT;
  v_open_time       TIME;
  v_close_time      TIME;
BEGIN
  IF p_date IS NULL THEN
    RAISE EXCEPTION 'INVALID_DATE: p_date must not be null.'
      USING ERRCODE = '22023';
  END IF;

  SELECT s.operating_hours
  INTO v_operating_hours
  FROM public.salon_settings AS s
  WHERE s.id = 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SALON_SETTINGS_MISSING: Singleton row id=1 in public.salon_settings is missing.'
      USING ERRCODE = 'P0001';
  END IF;

  v_day_key := CASE EXTRACT(ISODOW FROM p_date)::INTEGER
    WHEN 1 THEN 'mon'
    WHEN 2 THEN 'tue'
    WHEN 3 THEN 'wed'
    WHEN 4 THEN 'thu'
    WHEN 5 THEN 'fri'
    WHEN 6 THEN 'sat'
    WHEN 7 THEN 'sun'
  END;

  v_day_hours := v_operating_hours -> v_day_key;
  IF v_day_hours IS NULL OR pg_catalog.jsonb_typeof(v_day_hours) <> 'object' THEN
    RETURN TRUE;
  END IF;

  v_open_str := NULLIF(pg_catalog.btrim(v_day_hours ->> 'open'), '');
  v_close_str := NULLIF(pg_catalog.btrim(v_day_hours ->> 'close'), '');

  IF v_open_str IS NULL OR v_close_str IS NULL THEN
    RETURN TRUE;
  END IF;

  IF v_open_str !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
     OR v_close_str !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
    RAISE EXCEPTION 'INVALID_OPERATING_HOURS: Invalid HH:MM time format for %.', v_day_key
      USING ERRCODE = '22023';
  END IF;

  v_open_time := v_open_str::TIME;
  v_close_time := v_close_str::TIME;

  IF v_open_time >= v_close_time THEN
    RETURN TRUE;
  END IF;

  v_now_ist := pg_catalog.now() AT TIME ZONE 'Asia/Kolkata';
  v_today_ist := v_now_ist::DATE;
  v_time_ist := v_now_ist::TIME;

  IF p_date < v_today_ist THEN
    RETURN TRUE;
  ELSIF p_date > v_today_ist THEN
    RETURN FALSE;
  ELSE
    -- Closing time is exclusive: once IST time reaches close, the business day has ended.
    RETURN (v_time_ist >= v_close_time);
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. End-of-Day Cleanup & New-Day Staff Initialization (Strictly Separate)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.run_end_of_day_cleanup()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_today_ist       DATE;
  v_settings_exists BOOLEAN;
  v_cancelled_count INTEGER := 0;
BEGIN
  SELECT TRUE
  INTO v_settings_exists
  FROM public.salon_settings AS s
  WHERE s.id = 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SALON_SETTINGS_MISSING: Singleton row id=1 in public.salon_settings is missing.'
      USING ERRCODE = 'P0001';
  END IF;

  v_today_ist := public.get_ist_date();

  PERFORM pg_catalog.set_config('app.actor_role', 'system', true);
  PERFORM pg_catalog.set_config('app.actor_ref', 'run_end_of_day_cleanup', true);
  PERFORM pg_catalog.set_config('app.transition_note', 'End-of-day automatic cleanup', true);

  WITH cleaned AS (
    UPDATE public.queue_entries AS qe
    SET
      status = 'Cancelled',
      cancelled_at = pg_catalog.now(),
      cancelled_by = 'system'
    WHERE qe.status IN ('Waiting', 'Called')
      AND (
        qe.queue_date < v_today_ist
        OR public.is_business_day_closed(qe.queue_date)
      )
    RETURNING qe.id
  )
  SELECT COUNT(*)::INTEGER INTO v_cancelled_count FROM cleaned;

  UPDATE public.salon_settings
  SET last_cleanup_date = v_today_ist
  WHERE id = 1;

  RETURN pg_catalog.jsonb_build_object(
    'success', TRUE,
    'data', pg_catalog.jsonb_build_object(
      'cleanup_date', v_today_ist,
      'cancelled_count', v_cancelled_count
    ),
    'message', pg_catalog.format('End-of-day cleanup completed (%s entries cancelled).', v_cancelled_count)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.initialize_new_day_staff_availability()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_today_ist          DATE;
  v_last_staff_init    DATE;
  v_initialized_count  INTEGER := 0;
BEGIN
  SELECT s.last_staff_init_date
  INTO v_last_staff_init
  FROM public.salon_settings AS s
  WHERE s.id = 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SALON_SETTINGS_MISSING: Singleton row id=1 in public.salon_settings is missing.'
      USING ERRCODE = 'P0001';
  END IF;

  v_today_ist := public.get_ist_date();

  IF v_last_staff_init IS NOT DISTINCT FROM v_today_ist THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', TRUE,
      'data', pg_catalog.jsonb_build_object(
        'init_date', v_today_ist,
        'already_initialized', TRUE,
        'initialized_staff_count', 0
      ),
      'message', 'Staff availability already initialized for today.'
    );
  END IF;

  WITH locked_staff AS (
    SELECT st.id
    FROM public.staff AS st
    WHERE st.is_on_duty = TRUE
      AND NOT EXISTS (
        SELECT 1
        FROM public.queue_entries AS qe
        WHERE qe.queue_date = v_today_ist
          AND qe.assigned_staff_id = st.id
          AND qe.status IN ('Called', 'In Chair')
      )
    ORDER BY st.id ASC
    FOR UPDATE
  ),
  updated_staff AS (
    UPDATE public.staff AS st
    SET
      availability_status = 'Available',
      available_since = pg_catalog.now()
    FROM locked_staff AS ls
    WHERE st.id = ls.id
    RETURNING st.id
  )
  SELECT COUNT(*)::INTEGER INTO v_initialized_count FROM updated_staff;

  UPDATE public.salon_settings
  SET last_staff_init_date = v_today_ist
  WHERE id = 1;

  RETURN pg_catalog.jsonb_build_object(
    'success', TRUE,
    'data', pg_catalog.jsonb_build_object(
      'init_date', v_today_ist,
      'already_initialized', FALSE,
      'initialized_staff_count', v_initialized_count
    ),
    'message', pg_catalog.format('Initialized staff availability for %s.', v_today_ist)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Staff Availability & Duty Management RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_staff_availability(
  p_staff_id   UUID,
  p_status     TEXT,
  p_actor_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_today_ist        DATE;
  v_staff            public.staff%ROWTYPE;
  v_has_active_chair BOOLEAN;
BEGIN
  IF p_staff_id IS NULL THEN
    RAISE EXCEPTION 'STAFF_ID_REQUIRED: p_staff_id must not be null.'
      USING ERRCODE = '22023';
  END IF;

  IF p_actor_role IS NULL OR p_actor_role NOT IN ('staff', 'reception', 'owner') THEN
    RAISE EXCEPTION 'INVALID_ACTOR_ROLE: Actor role must be staff, reception, or owner.'
      USING ERRCODE = '22023';
  END IF;

  IF p_status IS NULL OR p_status NOT IN ('Available', 'On Break') THEN
    RAISE EXCEPTION 'INVALID_AVAILABILITY_STATUS: Status must be Available or On Break.'
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

  SELECT EXISTS (
    SELECT 1
    FROM public.queue_entries AS qe
    WHERE qe.queue_date = v_today_ist
      AND qe.assigned_staff_id = p_staff_id
      AND qe.status IN ('Called', 'In Chair')
  ) INTO v_has_active_chair;

  IF v_staff.availability_status = 'Busy' OR v_has_active_chair THEN
    IF p_status = 'On Break' THEN
      RAISE EXCEPTION 'STAFF_BUSY_CANNOT_TAKE_BREAK: Staff member cannot go on break while serving or holding a called customer.'
        USING ERRCODE = 'P0001';
    ELSE
      RAISE EXCEPTION 'STAFF_BUSY_CANNOT_BECOME_AVAILABLE: Staff member cannot become Available while serving or holding a called customer.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF p_status = 'Available' AND NOT v_staff.is_on_duty THEN
    RAISE EXCEPTION 'STAFF_OFF_DUTY: Off-duty staff member cannot become Available.'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.staff AS st
  SET
    availability_status = p_status,
    available_since = CASE
      WHEN p_status = 'Available' AND st.availability_status IS DISTINCT FROM 'Available'
        THEN pg_catalog.now()
      ELSE st.available_since
    END
  WHERE st.id = p_staff_id
  RETURNING * INTO v_staff;

  RETURN pg_catalog.jsonb_build_object(
    'success', TRUE,
    'data', pg_catalog.jsonb_build_object(
      'staff_id', v_staff.id,
      'slug', v_staff.slug,
      'is_on_duty', v_staff.is_on_duty,
      'availability_status', v_staff.availability_status,
      'available_since', v_staff.available_since,
      'updated_by', p_actor_role
    ),
    'message', pg_catalog.format('Staff availability updated to %s.', v_staff.availability_status)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_staff_duty(
  p_staff_id   UUID,
  p_is_on_duty BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_today_ist        DATE;
  v_staff            public.staff%ROWTYPE;
  v_has_active_chair BOOLEAN;
BEGIN
  IF p_staff_id IS NULL OR p_is_on_duty IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENTS: p_staff_id and p_is_on_duty are required.'
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

  SELECT EXISTS (
    SELECT 1
    FROM public.queue_entries AS qe
    WHERE qe.queue_date = v_today_ist
      AND qe.assigned_staff_id = p_staff_id
      AND qe.status IN ('Called', 'In Chair')
  ) INTO v_has_active_chair;

  IF NOT p_is_on_duty THEN
    IF v_staff.availability_status = 'Busy' OR v_has_active_chair THEN
      RAISE EXCEPTION 'STAFF_ACTIVE_CANNOT_GO_OFF_DUTY: Cannot mark staff off duty while Busy or holding an active Called/In Chair entry.'
        USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.staff AS st
    SET is_on_duty = FALSE
    WHERE st.id = p_staff_id
    RETURNING * INTO v_staff;
  ELSE
    UPDATE public.staff AS st
    SET
      is_on_duty = TRUE,
      availability_status = CASE
        WHEN v_has_active_chair THEN 'Busy'
        ELSE 'Available'
      END,
      available_since = CASE
        WHEN v_has_active_chair THEN st.available_since
        ELSE pg_catalog.now()
      END
    WHERE st.id = p_staff_id
    RETURNING * INTO v_staff;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', TRUE,
    'data', pg_catalog.jsonb_build_object(
      'staff_id', v_staff.id,
      'slug', v_staff.slug,
      'is_on_duty', v_staff.is_on_duty,
      'availability_status', v_staff.availability_status,
      'available_since', v_staff.available_since
    ),
    'message', CASE
      WHEN v_staff.is_on_duty THEN 'Staff marked on duty.'
      ELSE 'Staff marked off duty.'
    END
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Queue Join & Customer/Reception/Staff Workflow RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.join_queue(
  p_name               TEXT,
  p_phone              TEXT,
  p_service_ids        UUID[],
  p_selection_mode     TEXT,
  p_preferred_staff_id UUID DEFAULT NULL,
  p_source             TEXT DEFAULT 'online',
  p_is_demo            BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_name              TEXT;
  v_phone             TEXT;
  v_service_count     INTEGER;
  v_distinct_count    INTEGER;
  v_active_svc_count  INTEGER;
  v_settings          public.salon_settings%ROWTYPE;
  v_now_ist           TIMESTAMP;
  v_today_ist         DATE;
  v_time_ist          TIME;
  v_day_key           TEXT;
  v_day_hours         JSONB;
  v_open_str          TEXT;
  v_close_str         TEXT;
  v_open_time         TIME;
  v_close_time        TIME;
  v_cutoff_time       TIME;
  v_online_count      INTEGER;
  v_customer_id       UUID;
  v_assigned_staff_id UUID;
  v_staff             public.staff%ROWTYPE;
  v_qual_count        INTEGER;
  v_next_token        INTEGER;
  v_entry             public.queue_entries%ROWTYPE;
  v_total_duration    INTEGER := 0;
  v_total_price       INTEGER := 0;
  v_actor_role        TEXT;
BEGIN
  v_name := pg_catalog.btrim(COALESCE(p_name, ''));
  IF pg_catalog.char_length(v_name) = 0 THEN
    RAISE EXCEPTION 'INVALID_CUSTOMER_NAME: Customer name is required.'
      USING ERRCODE = '22023';
  END IF;

  v_phone := pg_catalog.btrim(COALESCE(p_phone, ''));
  IF v_phone !~ '^[0-9]{10}$' THEN
    RAISE EXCEPTION 'INVALID_PHONE_NUMBER: Phone number must contain exactly 10 digits.'
      USING ERRCODE = '22023';
  END IF;

  IF p_source IS NULL OR p_source NOT IN ('online', 'walk_in') THEN
    RAISE EXCEPTION 'INVALID_SOURCE: Source must be online or walk_in.'
      USING ERRCODE = '22023';
  END IF;

  IF p_selection_mode IS NULL OR p_selection_mode NOT IN ('specific', 'any_available') THEN
    RAISE EXCEPTION 'INVALID_SELECTION_MODE: Selection mode must be specific or any_available.'
      USING ERRCODE = '22023';
  END IF;

  IF p_selection_mode = 'specific' AND p_preferred_staff_id IS NULL THEN
    RAISE EXCEPTION 'PREFERRED_STAFF_REQUIRED: p_preferred_staff_id is required when selection_mode is specific.'
      USING ERRCODE = '22023';
  END IF;

  IF p_service_ids IS NULL OR pg_catalog.array_ndims(p_service_ids) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'INVALID_SERVICES: Between 1 and 3 services must be selected.'
      USING ERRCODE = '22023';
  END IF;

  v_service_count := pg_catalog.cardinality(p_service_ids);

  -- Acquire salon_settings singleton lock via cleanup & daily staff init first (consistent lock order).
  PERFORM public.run_end_of_day_cleanup();
  PERFORM public.initialize_new_day_staff_availability();

  SELECT *
  INTO v_settings
  FROM public.salon_settings AS s
  WHERE s.id = 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SALON_SETTINGS_MISSING: Singleton row id=1 in public.salon_settings is missing.'
      USING ERRCODE = 'P0001';
  END IF;

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

  -- Operating-hours & online capacity check in Asia/Kolkata
  v_now_ist := pg_catalog.now() AT TIME ZONE 'Asia/Kolkata';
  v_today_ist := v_now_ist::DATE;
  v_time_ist := v_now_ist::TIME;

  v_day_key := CASE EXTRACT(ISODOW FROM v_today_ist)::INTEGER
    WHEN 1 THEN 'mon'
    WHEN 2 THEN 'tue'
    WHEN 3 THEN 'wed'
    WHEN 4 THEN 'thu'
    WHEN 5 THEN 'fri'
    WHEN 6 THEN 'sat'
    WHEN 7 THEN 'sun'
  END;

  v_day_hours := v_settings.operating_hours -> v_day_key;
  IF v_day_hours IS NULL OR pg_catalog.jsonb_typeof(v_day_hours) <> 'object' THEN
    RAISE EXCEPTION 'SALON_CLOSED: Salon is closed today.'
      USING ERRCODE = 'P0001';
  END IF;

  v_open_str := NULLIF(pg_catalog.btrim(v_day_hours ->> 'open'), '');
  v_close_str := NULLIF(pg_catalog.btrim(v_day_hours ->> 'close'), '');

  IF v_open_str IS NULL OR v_close_str IS NULL THEN
    RAISE EXCEPTION 'SALON_CLOSED: Salon is closed today.'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_open_str !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
     OR v_close_str !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
    RAISE EXCEPTION 'INVALID_OPERATING_HOURS: Invalid HH:MM time format for %.', v_day_key
      USING ERRCODE = '22023';
  END IF;

  v_open_time := v_open_str::TIME;
  v_close_time := v_close_str::TIME;

  -- Opening time is inclusive; closing time is exclusive.
  IF v_open_time >= v_close_time OR v_time_ist < v_open_time OR v_time_ist >= v_close_time THEN
    RAISE EXCEPTION 'SALON_CLOSED: Salon is currently closed.'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_source = 'online' THEN
    IF NOT v_settings.is_online_queue_open THEN
      RAISE EXCEPTION 'ONLINE_QUEUE_CLOSED: Online queue registration is currently closed.'
        USING ERRCODE = 'P0001';
    END IF;

    v_cutoff_time := v_close_time - pg_catalog.make_interval(mins => v_settings.online_cutoff_minutes);
    IF v_time_ist >= v_cutoff_time THEN
      RAISE EXCEPTION 'ONLINE_CUTOFF_PASSED: Online queue registration closes % minutes before closing time.', v_settings.online_cutoff_minutes
        USING ERRCODE = 'P0001';
    END IF;

    SELECT COUNT(*)::INTEGER
    INTO v_online_count
    FROM public.queue_entries AS qe
    WHERE qe.queue_date = v_today_ist
      AND qe.source = 'online'
      AND qe.status <> 'Cancelled';

    IF v_online_count >= v_settings.daily_online_capacity THEN
      RAISE EXCEPTION 'ONLINE_CAPACITY_FULL: Daily online registration capacity (%) has been reached.', v_settings.daily_online_capacity
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Validate every selected service exists and is active
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

  -- Upsert customer by 10-digit phone (never convert a genuine customer into demo)
  INSERT INTO public.customers AS c (name, phone, is_demo)
  VALUES (v_name, v_phone, COALESCE(p_is_demo, FALSE))
  ON CONFLICT (phone) DO UPDATE
  SET
    name = EXCLUDED.name,
    is_demo = (c.is_demo AND EXCLUDED.is_demo)
  RETURNING id INTO v_customer_id;

  IF EXISTS (
    SELECT 1
    FROM public.queue_entries AS qe
    WHERE qe.queue_date = v_today_ist
      AND qe.customer_id = v_customer_id
      AND qe.status IN ('Waiting', 'Called', 'In Chair')
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_ACTIVE_ENTRY: This phone number already has an active queue entry today.'
      USING ERRCODE = '23505';
  END IF;

  -- Staff eligibility & assignment
  IF p_selection_mode = 'specific' THEN
    SELECT *
    INTO v_staff
    FROM public.staff AS st
    WHERE st.id = p_preferred_staff_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'STAFF_NOT_FOUND: Selected stylist does not exist.'
        USING ERRCODE = 'P0002';
    END IF;

    IF NOT v_staff.is_on_duty THEN
      RAISE EXCEPTION 'STYLIST_OFF_DUTY: Selected stylist is currently off duty.'
        USING ERRCODE = 'P0001';
    END IF;

    IF v_staff.availability_status = 'On Break' THEN
      RAISE EXCEPTION 'STYLIST_ON_BREAK: Selected stylist is currently on break.'
        USING ERRCODE = 'P0001';
    END IF;

    SELECT COUNT(*)::INTEGER
    INTO v_qual_count
    FROM public.staff_services AS ss
    WHERE ss.staff_id = p_preferred_staff_id
      AND ss.service_id = ANY(p_service_ids);

    IF v_qual_count <> v_service_count THEN
      RAISE EXCEPTION 'STYLIST_NOT_QUALIFIED: Selected stylist is not qualified for all selected services.'
        USING ERRCODE = 'P0001';
    END IF;

    v_assigned_staff_id := p_preferred_staff_id;
  ELSE
    -- Lock eligible qualified on-duty staff in deterministic ID order, then pick lightest workload.
    WITH eligible_staff AS (
      SELECT st.id, st.available_since
      FROM public.staff AS st
      WHERE st.is_on_duty = TRUE
        AND st.availability_status <> 'On Break'
        AND (
          SELECT COUNT(*)::INTEGER
          FROM public.staff_services AS ss
          WHERE ss.staff_id = st.id
            AND ss.service_id = ANY(p_service_ids)
        ) = v_service_count
      ORDER BY st.id ASC
      FOR UPDATE
    ),
    staff_workloads AS (
      SELECT
        es.id AS staff_id,
        es.available_since,
        (
          -- Remaining time of current In Chair customer
          COALESCE((
            SELECT SUM(
              GREATEST(
                0::NUMERIC,
                COALESCE((
                  SELECT SUM(qes.duration_minutes_snapshot)
                  FROM public.queue_entry_services AS qes
                  WHERE qes.queue_entry_id = qe.id
                ), 0)::NUMERIC
                - (EXTRACT(EPOCH FROM (pg_catalog.now() - qe.started_at)) / 60.0)
              )
            )
            FROM public.queue_entries AS qe
            WHERE qe.queue_date = v_today_ist
              AND qe.assigned_staff_id = es.id
              AND qe.status = 'In Chair'
          ), 0::NUMERIC)
          +
          -- Full durations of Called and Waiting customers in this stylist's queue
          COALESCE((
            SELECT SUM(qes.duration_minutes_snapshot)::NUMERIC
            FROM public.queue_entries AS qe
            JOIN public.queue_entry_services AS qes
              ON qes.queue_entry_id = qe.id
            WHERE qe.queue_date = v_today_ist
              AND qe.assigned_staff_id = es.id
              AND qe.status IN ('Called', 'Waiting')
          ), 0::NUMERIC)
        ) AS workload_minutes
      FROM eligible_staff AS es
    )
    SELECT sw.staff_id
    INTO v_assigned_staff_id
    FROM staff_workloads AS sw
    ORDER BY sw.workload_minutes ASC, sw.available_since ASC, sw.staff_id ASC
    LIMIT 1;

    IF v_assigned_staff_id IS NULL THEN
      RAISE EXCEPTION 'NO_ELIGIBLE_STYLIST_AVAILABLE: No on-duty qualified stylist is currently available.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Generate next sequential daily token (never reuses Cancelled or No-show tokens)
  SELECT COALESCE(MAX(qe.token_number), 0) + 1
  INTO v_next_token
  FROM public.queue_entries AS qe
  WHERE qe.queue_date = v_today_ist;

  v_actor_role := CASE WHEN p_source = 'walk_in' THEN 'reception' ELSE 'customer' END;
  PERFORM pg_catalog.set_config('app.actor_role', v_actor_role, true);
  PERFORM pg_catalog.set_config('app.actor_ref', v_customer_id::TEXT, true);
  PERFORM pg_catalog.set_config(
    'app.transition_note',
    CASE WHEN p_source = 'walk_in' THEN 'Walk-in joined queue' ELSE 'Customer joined queue online' END,
    true
  );

  INSERT INTO public.queue_entries (
    queue_date,
    token_number,
    customer_id,
    source,
    selection_mode,
    assigned_staff_id,
    status,
    is_demo
  ) VALUES (
    v_today_ist,
    v_next_token,
    v_customer_id,
    p_source,
    p_selection_mode,
    v_assigned_staff_id,
    'Waiting',
    COALESCE(p_is_demo, FALSE)
  )
  RETURNING * INTO v_entry;

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

  RETURN pg_catalog.jsonb_build_object(
    'success', TRUE,
    'data', pg_catalog.jsonb_build_object(
      'entry_id', v_entry.id,
      'queue_date', v_entry.queue_date,
      'token_number', v_entry.token_number,
      'token_display', v_entry.token_display,
      'assigned_staff_id', v_entry.assigned_staff_id,
      'status', v_entry.status,
      'source', v_entry.source,
      'selection_mode', v_entry.selection_mode,
      'joined_at', v_entry.joined_at,
      'total_duration_minutes', v_total_duration,
      'total_price_inr', v_total_price
    ),
    'message', pg_catalog.format('Joined the queue with token %s.', v_entry.token_display)
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'DUPLICATE_ACTIVE_ENTRY: This phone number already has an active queue entry or token conflict occurred.'
      USING ERRCODE = '23505';
END;
$$;

CREATE OR REPLACE FUNCTION public.acknowledge_start_coming(p_entry_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_today_ist DATE;
  v_entry     public.queue_entries%ROWTYPE;
  v_position  INTEGER;
BEGIN
  IF p_entry_id IS NULL THEN
    RAISE EXCEPTION 'ENTRY_ID_REQUIRED: p_entry_id must not be null.'
      USING ERRCODE = '22023';
  END IF;

  PERFORM public.initialize_new_day_staff_availability();
  v_today_ist := public.get_ist_date();

  SELECT *
  INTO v_entry
  FROM public.queue_entries AS qe
  WHERE qe.id = p_entry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ENTRY_NOT_FOUND: Queue entry % does not exist.', p_entry_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_entry.queue_date <> v_today_ist OR v_entry.status <> 'Waiting' THEN
    RAISE EXCEPTION 'START_COMING_NOT_ALLOWED: Start Coming is only available for today''s Waiting entries.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO v_position
  FROM public.queue_entries AS qe
  WHERE qe.queue_date = v_today_ist
    AND qe.assigned_staff_id = v_entry.assigned_staff_id
    AND qe.status = 'Waiting'
    AND (
      qe.joined_at < v_entry.joined_at
      OR (qe.joined_at = v_entry.joined_at AND qe.token_number <= v_entry.token_number)
    );

  IF v_position <> 2 THEN
    RAISE EXCEPTION 'START_COMING_POSITION_INVALID: Start Coming is only permitted at position 2 (current position: %).', v_position
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.queue_entries AS qe
  SET start_coming_at = COALESCE(qe.start_coming_at, pg_catalog.now())
  WHERE qe.id = p_entry_id
  RETURNING * INTO v_entry;

  RETURN pg_catalog.jsonb_build_object(
    'success', TRUE,
    'data', pg_catalog.jsonb_build_object(
      'entry_id', v_entry.id,
      'token_display', v_entry.token_display,
      'assigned_staff_id', v_entry.assigned_staff_id,
      'status', v_entry.status,
      'queue_position', v_position,
      'start_coming_at', v_entry.start_coming_at
    ),
    'message', 'Customer on the way acknowledgement recorded.'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.call_next_customer(p_staff_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_today_ist          DATE;
  v_staff              public.staff%ROWTYPE;
  v_entry              public.queue_entries%ROWTYPE;
  v_required_services  INTEGER;
  v_qualified_services INTEGER;
BEGIN
  IF p_staff_id IS NULL THEN
    RAISE EXCEPTION 'STAFF_ID_REQUIRED: p_staff_id must not be null.'
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

  IF NOT v_staff.is_on_duty THEN
    RAISE EXCEPTION 'STAFF_OFF_DUTY: Off-duty staff cannot call customers.'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_staff.availability_status <> 'Available' THEN
    RAISE EXCEPTION 'STAFF_NOT_AVAILABLE: Staff must be Available to call the next customer (current: %).', v_staff.availability_status
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.queue_entries AS qe
    WHERE qe.queue_date = v_today_ist
      AND qe.assigned_staff_id = p_staff_id
      AND qe.status IN ('Called', 'In Chair')
  ) THEN
    RAISE EXCEPTION 'STAFF_ALREADY_HAS_ACTIVE_ENTRY: Staff already has a Called or In Chair customer today.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT *
  INTO v_entry
  FROM public.queue_entries AS qe
  WHERE qe.queue_date = v_today_ist
    AND qe.assigned_staff_id = p_staff_id
    AND qe.status = 'Waiting'
  ORDER BY qe.joined_at ASC, qe.token_number ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_WAITING_CUSTOMERS: No waiting customers assigned to this stylist.'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT
    COUNT(*)::INTEGER,
    COUNT(ss.service_id)::INTEGER
  INTO v_required_services, v_qualified_services
  FROM public.queue_entry_services AS qes
  LEFT JOIN public.staff_services AS ss
    ON ss.staff_id = p_staff_id
   AND ss.service_id = qes.service_id
  WHERE qes.queue_entry_id = v_entry.id;

  IF v_required_services = 0 OR v_qualified_services <> v_required_services THEN
    RAISE EXCEPTION 'STAFF_NOT_QUALIFIED_FOR_ENTRY: Staff is not qualified for all services on token %.', v_entry.token_display
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_catalog.set_config('app.actor_role', 'reception', true);
  PERFORM pg_catalog.set_config('app.actor_ref', p_staff_id::TEXT, true);
  PERFORM pg_catalog.set_config('app.transition_note', 'Called next customer for stylist', true);

  UPDATE public.queue_entries AS qe
  SET
    status = 'Called',
    called_at = pg_catalog.now()
  WHERE qe.id = v_entry.id
  RETURNING * INTO v_entry;

  RETURN pg_catalog.jsonb_build_object(
    'success', TRUE,
    'data', pg_catalog.jsonb_build_object(
      'entry_id', v_entry.id,
      'token_number', v_entry.token_number,
      'token_display', v_entry.token_display,
      'assigned_staff_id', v_entry.assigned_staff_id,
      'status', v_entry.status,
      'called_at', v_entry.called_at
    ),
    'message', pg_catalog.format('Called token %s.', v_entry.token_display)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.start_service(
  p_staff_id UUID,
  p_entry_id UUID
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

  PERFORM pg_catalog.set_config('app.actor_role', 'staff', true);
  PERFORM pg_catalog.set_config('app.actor_ref', p_staff_id::TEXT, true);
  PERFORM pg_catalog.set_config('app.transition_note', 'Service started in chair', true);

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
      'total_duration_minutes', v_total_duration
    ),
    'message', pg_catalog.format('Started service for token %s.', v_entry.token_display)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_service(
  p_staff_id UUID,
  p_entry_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_today_ist       DATE;
  v_staff           public.staff%ROWTYPE;
  v_entry           public.queue_entries%ROWTYPE;
  v_completed_at    TIMESTAMPTZ;
BEGIN
  IF p_staff_id IS NULL OR p_entry_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENTS: p_staff_id and p_entry_id are required.'
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

  PERFORM pg_catalog.set_config('app.actor_role', 'staff', true);
  PERFORM pg_catalog.set_config('app.actor_ref', p_staff_id::TEXT, true);
  PERFORM pg_catalog.set_config('app.transition_note', 'Service completed', true);

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
      'staff_availability_status', v_staff.availability_status
    ),
    'message', pg_catalog.format('Completed service for token %s.', v_entry.token_display)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_no_show(p_entry_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_settings public.salon_settings%ROWTYPE;
  v_entry    public.queue_entries%ROWTYPE;
BEGIN
  IF p_entry_id IS NULL THEN
    RAISE EXCEPTION 'ENTRY_ID_REQUIRED: p_entry_id must not be null.'
      USING ERRCODE = '22023';
  END IF;

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

  IF v_entry.status <> 'Called' THEN
    RAISE EXCEPTION 'NO_SHOW_ONLY_FROM_CALLED: Only Called entries can be marked No-show (current: %).', v_entry.status
      USING ERRCODE = 'P0001';
  END IF;

  IF pg_catalog.now() < v_entry.called_at + pg_catalog.make_interval(mins => v_settings.no_show_window_minutes) THEN
    RAISE EXCEPTION 'NO_SHOW_WINDOW_NOT_EXPIRED: Cannot mark No-show before the %-minute arrival window expires.', v_settings.no_show_window_minutes
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_catalog.set_config('app.actor_role', 'reception', true);
  PERFORM pg_catalog.set_config('app.actor_ref', 'mark_no_show', true);
  PERFORM pg_catalog.set_config(
    'app.transition_note',
    pg_catalog.format('Marked No-show after %s-minute arrival window', v_settings.no_show_window_minutes),
    true
  );

  UPDATE public.queue_entries AS qe
  SET
    status = 'No-show',
    no_show_at = pg_catalog.now()
  WHERE qe.id = p_entry_id
  RETURNING * INTO v_entry;

  RETURN pg_catalog.jsonb_build_object(
    'success', TRUE,
    'data', pg_catalog.jsonb_build_object(
      'entry_id', v_entry.id,
      'token_display', v_entry.token_display,
      'assigned_staff_id', v_entry.assigned_staff_id,
      'status', v_entry.status,
      'called_at', v_entry.called_at,
      'no_show_at', v_entry.no_show_at
    ),
    'message', pg_catalog.format('Token %s marked as No-show.', v_entry.token_display)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_queue_entry(
  p_entry_id   UUID,
  p_actor_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_settings_exists BOOLEAN;
  v_entry           public.queue_entries%ROWTYPE;
BEGIN
  IF p_entry_id IS NULL THEN
    RAISE EXCEPTION 'ENTRY_ID_REQUIRED: p_entry_id must not be null.'
      USING ERRCODE = '22023';
  END IF;

  IF p_actor_role IS NULL OR p_actor_role NOT IN ('customer', 'reception') THEN
    RAISE EXCEPTION 'INVALID_CANCEL_ACTOR: Cancellation actor must be customer or reception.'
      USING ERRCODE = '22023';
  END IF;

  SELECT TRUE
  INTO v_settings_exists
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

  IF p_actor_role = 'customer' AND v_entry.status <> 'Waiting' THEN
    RAISE EXCEPTION 'CUSTOMER_CANCEL_ONLY_WAITING: Customers can cancel only while Waiting (current: %).', v_entry.status
      USING ERRCODE = 'P0001';
  ELSIF p_actor_role = 'reception' AND v_entry.status NOT IN ('Waiting', 'Called') THEN
    RAISE EXCEPTION 'RECEPTION_CANCEL_NOT_ALLOWED: Reception can cancel only Waiting or Called entries (current: %).', v_entry.status
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_catalog.set_config('app.actor_role', p_actor_role, true);
  PERFORM pg_catalog.set_config('app.actor_ref', p_actor_role, true);
  PERFORM pg_catalog.set_config('app.transition_note', 'Cancelled by ' || p_actor_role, true);

  UPDATE public.queue_entries AS qe
  SET
    status = 'Cancelled',
    cancelled_at = pg_catalog.now(),
    cancelled_by = p_actor_role
  WHERE qe.id = p_entry_id
  RETURNING * INTO v_entry;

  RETURN pg_catalog.jsonb_build_object(
    'success', TRUE,
    'data', pg_catalog.jsonb_build_object(
      'entry_id', v_entry.id,
      'token_display', v_entry.token_display,
      'assigned_staff_id', v_entry.assigned_staff_id,
      'status', v_entry.status,
      'cancelled_at', v_entry.cancelled_at,
      'cancelled_by', v_entry.cancelled_by
    ),
    'message', pg_catalog.format('Token %s cancelled.', v_entry.token_display)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_demo_data()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_today_ist             DATE;
  v_deleted_entries       INTEGER := 0;
  v_deleted_customers     INTEGER := 0;
  v_released_busy_staff   INTEGER := 0;
BEGIN
  -- Acquires salon_settings singleton lock and ensures daily staff initialization ran.
  PERFORM public.initialize_new_day_staff_availability();
  v_today_ist := public.get_ist_date();

  -- Lock staff in deterministic order to avoid race conditions if a demo In Chair entry is removed.
  PERFORM st.id
  FROM public.staff AS st
  ORDER BY st.id ASC
  FOR UPDATE;

  -- Delete ONLY today's demo queue entries (preserves genuine entries and all historical records).
  WITH deleted_entries AS (
    DELETE FROM public.queue_entries AS qe
    WHERE qe.queue_date = v_today_ist
      AND qe.is_demo = TRUE
    RETURNING qe.id
  )
  SELECT COUNT(*)::INTEGER INTO v_deleted_entries FROM deleted_entries;

  -- Delete ONLY unreferenced demo customers (preserves genuine customers and any customer with surviving entries).
  WITH deleted_customers AS (
    DELETE FROM public.customers AS c
    WHERE c.is_demo = TRUE
      AND NOT EXISTS (
        SELECT 1
        FROM public.queue_entries AS qe
        WHERE qe.customer_id = c.id
      )
    RETURNING c.id
  )
  SELECT COUNT(*)::INTEGER INTO v_deleted_customers FROM deleted_customers;

  -- If any stylist was Busy solely due to a deleted today demo In Chair entry, return them to Available
  -- without altering master profiles, duty flags, or genuine In Chair staff.
  WITH released_staff AS (
    UPDATE public.staff AS st
    SET
      availability_status = 'Available',
      available_since = pg_catalog.now()
    WHERE st.availability_status = 'Busy'
      AND st.is_on_duty = TRUE
      AND NOT EXISTS (
        SELECT 1
        FROM public.queue_entries AS qe
        WHERE qe.queue_date = v_today_ist
          AND qe.assigned_staff_id = st.id
          AND qe.status IN ('Called', 'In Chair')
      )
    RETURNING st.id
  )
  SELECT COUNT(*)::INTEGER INTO v_released_busy_staff FROM released_staff;

  RETURN pg_catalog.jsonb_build_object(
    'success', TRUE,
    'data', pg_catalog.jsonb_build_object(
      'reset_date', v_today_ist,
      'deleted_demo_entries', v_deleted_entries,
      'deleted_demo_customers', v_deleted_customers,
      'released_demo_busy_staff', v_released_busy_staff,
      'created_demo_entries', 0
    ),
    'message', pg_catalog.format(
      'Demo queue data reset for %s (%s demo entries and %s unreferenced demo customers removed).',
      v_today_ist,
      v_deleted_entries,
      v_deleted_customers
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Explicit Function Execution Privileges
--    Trigger-only functions: no PUBLIC, anon, authenticated, or service_role EXECUTE.
--    Backend RPCs: revoked from PUBLIC, anon, authenticated; granted to service_role.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.enforce_queue_status_transition() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.log_queue_status_change() FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_ist_date() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_ist_date() TO service_role;

REVOKE ALL ON FUNCTION public.is_business_day_closed(DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_business_day_closed(DATE) TO service_role;

REVOKE ALL ON FUNCTION public.run_end_of_day_cleanup() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_end_of_day_cleanup() TO service_role;

REVOKE ALL ON FUNCTION public.initialize_new_day_staff_availability() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.initialize_new_day_staff_availability() TO service_role;

REVOKE ALL ON FUNCTION public.set_staff_availability(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_staff_availability(UUID, TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.set_staff_duty(UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_staff_duty(UUID, BOOLEAN) TO service_role;

REVOKE ALL ON FUNCTION public.join_queue(TEXT, TEXT, UUID[], TEXT, UUID, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_queue(TEXT, TEXT, UUID[], TEXT, UUID, TEXT, BOOLEAN) TO service_role;

REVOKE ALL ON FUNCTION public.acknowledge_start_coming(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acknowledge_start_coming(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.call_next_customer(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.call_next_customer(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.start_service(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_service(UUID, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.complete_service(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_service(UUID, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.mark_no_show(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_no_show(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.cancel_queue_entry(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_queue_entry(UUID, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.reset_demo_data() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_demo_data() TO service_role;
