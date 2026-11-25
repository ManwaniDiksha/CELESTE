-- ============================================================================
-- CELESTE — Salon Queue Management System
-- Migration 009: Future Appointments, Appointment Services, Security & RPCs
-- Additive Only: Preserves Migrations 001-008 and existing queue behavior.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. public.appointments (Private PII via customer_id FK)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.appointments (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  reference_code TEXT NOT NULL
    CONSTRAINT uq_appointments_reference_code UNIQUE
    CONSTRAINT chk_appointments_reference_format CHECK (reference_code ~ '^APT-[A-Z0-9-]+$'),
  appointment_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL
    CONSTRAINT chk_appointments_time_order CHECK (end_time > start_time),
  customer_id UUID NOT NULL
    CONSTRAINT fk_appointments_customer
    REFERENCES public.customers (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  selection_mode TEXT NOT NULL
    CONSTRAINT chk_appointments_selection_mode CHECK (selection_mode IN ('specific', 'any_available')),
  assigned_staff_id UUID NOT NULL
    CONSTRAINT fk_appointments_staff
    REFERENCES public.staff (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  status TEXT NOT NULL DEFAULT 'Booked'
    CONSTRAINT chk_appointments_status CHECK (
      status IN ('Booked', 'Confirmed', 'Checked In', 'Cancelled', 'No Show', 'Completed')
    ),
  total_duration_minutes INTEGER NOT NULL
    CONSTRAINT chk_appointments_duration_positive CHECK (total_duration_minutes > 0),
  total_price_inr INTEGER NOT NULL
    CONSTRAINT chk_appointments_price_nonnegative CHECK (total_price_inr >= 0),
  queue_entry_id UUID NULL
    CONSTRAINT fk_appointments_queue_entry
    REFERENCES public.queue_entries (id) ON DELETE SET NULL ON UPDATE CASCADE,
  cancelled_by TEXT NULL
    CONSTRAINT chk_appointments_cancelled_by CHECK (
      cancelled_by IN ('customer', 'reception', 'owner', 'system')
    ),
  checked_in_at TIMESTAMPTZ NULL,
  cancelled_at TIMESTAMPTZ NULL,
  no_show_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

CREATE INDEX IF NOT EXISTS idx_appointments_date_status
  ON public.appointments (appointment_date, status, start_time);

CREATE INDEX IF NOT EXISTS idx_appointments_staff_date
  ON public.appointments (appointment_date, assigned_staff_id, status, start_time);

CREATE INDEX IF NOT EXISTS idx_appointments_customer_date
  ON public.appointments (customer_id, appointment_date);

CREATE UNIQUE INDEX IF NOT EXISTS uq_appointments_queue_entry_id
  ON public.appointments (queue_entry_id)
  WHERE queue_entry_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_demo_date
  ON public.appointments (appointment_date)
  WHERE is_demo = TRUE;

-- ---------------------------------------------------------------------------
-- 2. public.appointment_services
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.appointment_services (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  appointment_id UUID NOT NULL
    CONSTRAINT fk_as_appointment
    REFERENCES public.appointments (id) ON DELETE CASCADE ON UPDATE CASCADE,
  service_id UUID NOT NULL
    CONSTRAINT fk_as_service
    REFERENCES public.services (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  position SMALLINT NOT NULL
    CONSTRAINT chk_as_position_range CHECK (position BETWEEN 1 AND 3),
  service_name_en_snapshot TEXT NOT NULL,
  service_name_gu_snapshot TEXT NOT NULL,
  duration_minutes_snapshot INTEGER NOT NULL
    CONSTRAINT chk_as_duration_positive CHECK (duration_minutes_snapshot > 0),
  price_inr_snapshot INTEGER NOT NULL
    CONSTRAINT chk_as_price_nonnegative CHECK (price_inr_snapshot >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),

  CONSTRAINT uq_as_appointment_position UNIQUE (appointment_id, position),
  CONSTRAINT uq_as_appointment_service UNIQUE (appointment_id, service_id)
);

CREATE INDEX IF NOT EXISTS idx_as_service_id
  ON public.appointment_services (service_id);

-- ---------------------------------------------------------------------------
-- 3. Updated-at & Queue-Completion Sync Triggers
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_appointments_set_updated_at ON public.appointments;
CREATE TRIGGER trg_appointments_set_updated_at
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.sync_appointment_on_queue_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'Done' AND OLD.status IS DISTINCT FROM 'Done' THEN
    UPDATE public.appointments
    SET status = 'Completed',
        completed_at = COALESCE(completed_at, NEW.completed_at, pg_catalog.now())
    WHERE queue_entry_id = NEW.id
      AND status = 'Checked In';
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_queue_entries_sync_appointment ON public.queue_entries;
CREATE TRIGGER trg_queue_entries_sync_appointment
  AFTER UPDATE OF status ON public.queue_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_appointment_on_queue_complete();

-- ---------------------------------------------------------------------------
-- 4. RLS & Privilege Hardening (Private Tables: Deny-All for anon/authenticated)
-- ---------------------------------------------------------------------------
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_services ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.appointments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.appointment_services FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.appointments TO service_role;
GRANT ALL ON TABLE public.appointment_services TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Atomic RPC: public.book_appointment
--    Books a future (or later-today) appointment even when salon is currently
--    closed, enforcing operating hours for the target date, qualifications,
--    overlap prevention, and duplicate customer slot protection.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.book_appointment(
  p_name               TEXT,
  p_phone              TEXT,
  p_appointment_date   DATE,
  p_start_time         TIME,
  p_service_ids        UUID[],
  p_selection_mode     TEXT DEFAULT 'any_available',
  p_preferred_staff_id UUID DEFAULT NULL,
  p_is_demo            BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_name             TEXT := pg_catalog.btrim(COALESCE(p_name, ''));
  v_phone            TEXT := pg_catalog.btrim(COALESCE(p_phone, ''));
  v_today_ist        DATE;
  v_now_time_ist     TIME;
  v_day_key          TEXT;
  v_settings         public.salon_settings%ROWTYPE;
  v_day_hours        JSONB;
  v_open_time        TIME;
  v_close_time       TIME;
  v_service_ids      UUID[];
  v_service_count    INTEGER;
  v_active_count     INTEGER;
  v_total_duration   INTEGER := 0;
  v_total_price      INTEGER := 0;
  v_end_time         TIME;
  v_staff_id         UUID;
  v_customer_id      UUID;
  v_ref_code         TEXT;
  v_appt             public.appointments%ROWTYPE;
  v_svc              RECORD;
  v_pos              SMALLINT := 1;
BEGIN
  IF pg_catalog.char_length(v_name) = 0 OR pg_catalog.char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'INVALID_CUSTOMER_NAME: Customer name must be between 1 and 120 characters.'
      USING ERRCODE = '22023';
  END IF;

  IF v_phone !~ '^[0-9]{10}$' THEN
    RAISE EXCEPTION 'INVALID_PHONE_NUMBER: Phone number must contain exactly 10 digits.'
      USING ERRCODE = '22023';
  END IF;

  IF p_appointment_date IS NULL OR p_start_time IS NULL THEN
    RAISE EXCEPTION 'INVALID_APPOINTMENT_SLOT: Appointment date and start time are required.'
      USING ERRCODE = '22023';
  END IF;

  IF p_selection_mode NOT IN ('specific', 'any_available') THEN
    RAISE EXCEPTION 'INVALID_SELECTION_MODE: selection_mode must be specific or any_available.'
      USING ERRCODE = '22023';
  END IF;

  IF p_selection_mode = 'specific' AND p_preferred_staff_id IS NULL THEN
    RAISE EXCEPTION 'PREFERRED_STAFF_REQUIRED: Please select a preferred stylist.'
      USING ERRCODE = '22023';
  END IF;

  IF p_service_ids IS NULL OR pg_catalog.cardinality(p_service_ids) < 1 OR pg_catalog.cardinality(p_service_ids) > 3 THEN
    RAISE EXCEPTION 'INVALID_SERVICE_COUNT: Select between 1 and 3 services.'
      USING ERRCODE = '22023';
  END IF;

  SELECT pg_catalog.array_agg(DISTINCT u.id)
  INTO v_service_ids
  FROM pg_catalog.unnest(p_service_ids) AS u(id);

  IF pg_catalog.cardinality(v_service_ids) <> pg_catalog.cardinality(p_service_ids) THEN
    RAISE EXCEPTION 'DUPLICATE_SERVICES_NOT_ALLOWED: Duplicate services cannot be selected.'
      USING ERRCODE = '22023';
  END IF;

  v_service_count := pg_catalog.cardinality(v_service_ids);

  -- Lock singleton settings row to serialize slot allocation cleanly
  SELECT *
  INTO v_settings
  FROM public.salon_settings AS s
  WHERE s.id = 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SETTINGS_MISSING: Salon settings record is missing.'
      USING ERRCODE = 'P0002';
  END IF;

  v_today_ist := (pg_catalog.now() AT TIME ZONE 'Asia/Kolkata')::DATE;
  v_now_time_ist := (pg_catalog.now() AT TIME ZONE 'Asia/Kolkata')::TIME;

  IF p_appointment_date < v_today_ist THEN
    RAISE EXCEPTION 'PAST_APPOINTMENT_DATE: Cannot book an appointment in the past.'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_appointment_date = v_today_ist AND p_start_time <= v_now_time_ist THEN
    RAISE EXCEPTION 'PAST_APPOINTMENT_TIME: Selected time slot has already passed.'
      USING ERRCODE = 'P0001';
  END IF;

  v_day_key := CASE EXTRACT(ISODOW FROM p_appointment_date)::INTEGER
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
    RAISE EXCEPTION 'APPOINTMENT_DAY_CLOSED: The salon is closed on the selected date.'
      USING ERRCODE = 'P0001';
  END IF;

  v_open_time := (v_day_hours ->> 'open')::TIME;
  v_close_time := (v_day_hours ->> 'close')::TIME;

  SELECT COUNT(*)::INTEGER, COALESCE(SUM(sv.duration_minutes), 0)::INTEGER, COALESCE(SUM(sv.price_inr), 0)::INTEGER
  INTO v_active_count, v_total_duration, v_total_price
  FROM public.services AS sv
  WHERE sv.id = ANY(v_service_ids)
    AND sv.is_active = TRUE;

  IF v_active_count <> v_service_count THEN
    RAISE EXCEPTION 'INACTIVE_OR_UNKNOWN_SERVICE: One or more selected services are inactive or unavailable.'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_start_time < v_open_time OR (p_start_time + pg_catalog.make_interval(mins => v_total_duration)) > v_close_time THEN
    RAISE EXCEPTION 'OUTSIDE_OPERATING_HOURS: Selected slot and service duration exceed salon operating hours.'
      USING ERRCODE = 'P0001';
  END IF;

  v_end_time := p_start_time + pg_catalog.make_interval(mins => v_total_duration);

  -- Acquire transaction-scoped advisory lock per appointment date
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('celeste_appt_' || p_appointment_date::TEXT));

  -- Check customer duplicate / overlapping booking on the same date
  SELECT c.id INTO v_customer_id
  FROM public.customers AS c
  WHERE c.phone = v_phone;

  IF v_customer_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.appointments AS a
      WHERE a.customer_id = v_customer_id
        AND a.appointment_date = p_appointment_date
        AND a.status IN ('Booked', 'Confirmed', 'Checked In')
        AND a.start_time < v_end_time
        AND a.end_time > p_start_time
    ) THEN
      RAISE EXCEPTION 'DUPLICATE_CUSTOMER_APPOINTMENT: You already have an overlapping appointment on this date.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF p_selection_mode = 'specific' THEN
    IF NOT EXISTS (SELECT 1 FROM public.staff AS st WHERE st.id = p_preferred_staff_id) THEN
      RAISE EXCEPTION 'STAFF_NOT_FOUND: Selected stylist was not found.'
        USING ERRCODE = 'P0002';
    END IF;

    IF (
      SELECT COUNT(DISTINCT ss.service_id)::INTEGER
      FROM public.staff_services AS ss
      WHERE ss.staff_id = p_preferred_staff_id
        AND ss.service_id = ANY(v_service_ids)
    ) <> v_service_count THEN
      RAISE EXCEPTION 'STYLIST_NOT_QUALIFIED: Selected stylist is not qualified for all selected services.'
        USING ERRCODE = 'P0001';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.appointments AS a
      WHERE a.appointment_date = p_appointment_date
        AND a.assigned_staff_id = p_preferred_staff_id
        AND a.status IN ('Booked', 'Confirmed', 'Checked In')
        AND a.start_time < v_end_time
        AND a.end_time > p_start_time
    ) THEN
      RAISE EXCEPTION 'SLOT_UNAVAILABLE: Selected stylist already has an appointment during this time slot.'
        USING ERRCODE = 'P0001';
    END IF;

    v_staff_id := p_preferred_staff_id;
  ELSE
    SELECT st.id
    INTO v_staff_id
    FROM public.staff AS st
    WHERE (
      SELECT COUNT(DISTINCT ss.service_id)::INTEGER
      FROM public.staff_services AS ss
      WHERE ss.staff_id = st.id
        AND ss.service_id = ANY(v_service_ids)
    ) = v_service_count
      AND NOT EXISTS (
        SELECT 1
        FROM public.appointments AS a
        WHERE a.appointment_date = p_appointment_date
          AND a.assigned_staff_id = st.id
          AND a.status IN ('Booked', 'Confirmed', 'Checked In')
          AND a.start_time < v_end_time
          AND a.end_time > p_start_time
      )
    ORDER BY (
      SELECT COUNT(*)
      FROM public.appointments AS a2
      WHERE a2.appointment_date = p_appointment_date
        AND a2.assigned_staff_id = st.id
        AND a2.status IN ('Booked', 'Confirmed', 'Checked In')
    ) ASC, st.display_order ASC
    LIMIT 1;

    IF v_staff_id IS NULL THEN
      RAISE EXCEPTION 'SLOT_UNAVAILABLE: No qualified stylist is available for this time slot.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  INSERT INTO public.customers (name, phone, is_demo)
  VALUES (v_name, v_phone, COALESCE(p_is_demo, FALSE))
  ON CONFLICT (phone) DO UPDATE
    SET name = EXCLUDED.name,
        updated_at = pg_catalog.now()
  RETURNING id INTO v_customer_id;

  v_ref_code := 'APT-' || pg_catalog.to_char(p_appointment_date, 'YYMMDD') || '-' ||
                pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::TEXT, '-', ''), 1, 4));

  INSERT INTO public.appointments (
    reference_code,
    appointment_date,
    start_time,
    end_time,
    customer_id,
    selection_mode,
    assigned_staff_id,
    status,
    total_duration_minutes,
    total_price_inr,
    is_demo
  )
  VALUES (
    v_ref_code,
    p_appointment_date,
    p_start_time,
    v_end_time,
    v_customer_id,
    p_selection_mode,
    v_staff_id,
    'Booked',
    v_total_duration,
    v_total_price,
    COALESCE(p_is_demo, FALSE)
  )
  RETURNING * INTO v_appt;

  FOR v_svc IN
    SELECT sv.id, sv.name_en, sv.name_gu, sv.duration_minutes, sv.price_inr
    FROM pg_catalog.unnest(p_service_ids) WITH ORDINALITY AS u(sid, ord)
    JOIN public.services AS sv ON sv.id = u.sid
    ORDER BY u.ord ASC
  LOOP
    INSERT INTO public.appointment_services (
      appointment_id,
      service_id,
      position,
      service_name_en_snapshot,
      service_name_gu_snapshot,
      duration_minutes_snapshot,
      price_inr_snapshot
    )
    VALUES (
      v_appt.id,
      v_svc.id,
      v_pos,
      v_svc.name_en,
      v_svc.name_gu,
      v_svc.duration_minutes,
      v_svc.price_inr
    );
    v_pos := v_pos + 1;
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'success', TRUE,
    'data', pg_catalog.jsonb_build_object(
      'appointment_id', v_appt.id,
      'reference_code', v_appt.reference_code,
      'appointment_date', v_appt.appointment_date,
      'start_time', pg_catalog.to_char(v_appt.start_time, 'HH24:MI'),
      'end_time', pg_catalog.to_char(v_appt.end_time, 'HH24:MI'),
      'assigned_staff_id', v_appt.assigned_staff_id,
      'status', v_appt.status,
      'total_duration_minutes', v_appt.total_duration_minutes,
      'total_price_inr', v_appt.total_price_inr
    ),
    'message', 'Appointment booked successfully.'
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Atomic RPC: public.cancel_appointment
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_appointment(
  p_appointment_id UUID,
  p_actor_role     TEXT DEFAULT 'customer'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_appt public.appointments%ROWTYPE;
BEGIN
  IF p_appointment_id IS NULL THEN
    RAISE EXCEPTION 'APPOINTMENT_ID_REQUIRED: Appointment ID is required.'
      USING ERRCODE = '22023';
  END IF;

  IF p_actor_role NOT IN ('customer', 'reception', 'owner', 'system') THEN
    RAISE EXCEPTION 'INVALID_ACTOR_ROLE: Invalid actor role.'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_appt
  FROM public.appointments AS a
  WHERE a.id = p_appointment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'APPOINTMENT_NOT_FOUND: Appointment not found.'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_appt.status NOT IN ('Booked', 'Confirmed') THEN
    RAISE EXCEPTION 'APPOINTMENT_CANCEL_NOT_ALLOWED: Only Booked or Confirmed appointments can be cancelled.'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.appointments
  SET status = 'Cancelled',
      cancelled_at = pg_catalog.now(),
      cancelled_by = p_actor_role
  WHERE id = v_appt.id
  RETURNING * INTO v_appt;

  RETURN pg_catalog.jsonb_build_object(
    'success', TRUE,
    'data', pg_catalog.jsonb_build_object(
      'appointment_id', v_appt.id,
      'reference_code', v_appt.reference_code,
      'appointment_date', v_appt.appointment_date,
      'assigned_staff_id', v_appt.assigned_staff_id,
      'status', v_appt.status
    ),
    'message', 'Appointment cancelled.'
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Atomic RPC: public.check_in_appointment
--    Converts a today's Booked/Confirmed appointment into a live queue entry
--    under the assigned stylist, preventing duplicate check-ins.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_in_appointment(
  p_appointment_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_appt           public.appointments%ROWTYPE;
  v_today_ist      DATE;
  v_staff          public.staff%ROWTYPE;
  v_next_token     INTEGER;
  v_entry          public.queue_entries%ROWTYPE;
  v_svc            RECORD;
BEGIN
  IF p_appointment_id IS NULL THEN
    RAISE EXCEPTION 'APPOINTMENT_ID_REQUIRED: Appointment ID is required.'
      USING ERRCODE = '22023';
  END IF;

  v_today_ist := (pg_catalog.now() AT TIME ZONE 'Asia/Kolkata')::DATE;

  SELECT * INTO v_appt
  FROM public.appointments AS a
  WHERE a.id = p_appointment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'APPOINTMENT_NOT_FOUND: Appointment not found.'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_appt.queue_entry_id IS NOT NULL OR v_appt.status = 'Checked In' THEN
    RAISE EXCEPTION 'APPOINTMENT_ALREADY_CHECKED_IN: This appointment has already been checked in.'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_appt.status NOT IN ('Booked', 'Confirmed') THEN
    RAISE EXCEPTION 'APPOINTMENT_CHECKIN_NOT_ALLOWED: Only Booked or Confirmed appointments can be checked in.'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_appt.appointment_date <> v_today_ist THEN
    RAISE EXCEPTION 'APPOINTMENT_NOT_TODAY: Only appointments scheduled for today can be checked into the live queue.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_staff
  FROM public.staff AS st
  WHERE st.id = v_appt.assigned_staff_id
  FOR UPDATE;

  IF NOT FOUND OR NOT v_staff.is_on_duty THEN
    RAISE EXCEPTION 'STYLIST_OFF_DUTY: Assigned stylist is currently off duty.'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.queue_entries AS qe
    WHERE qe.queue_date = v_today_ist
      AND qe.customer_id = v_appt.customer_id
      AND qe.status IN ('Waiting', 'Called', 'In Chair')
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_ACTIVE_ENTRY: Customer already has an active entry in today''s queue.'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('celeste_queue_' || v_today_ist::TEXT));

  SELECT COALESCE(MAX(qe.token_number), 0) + 1
  INTO v_next_token
  FROM public.queue_entries AS qe
  WHERE qe.queue_date = v_today_ist;

  PERFORM pg_catalog.set_config('app.actor_role', 'reception', TRUE);
  PERFORM pg_catalog.set_config('app.transition_note', 'Checked in from appointment ' || v_appt.reference_code, TRUE);

  INSERT INTO public.queue_entries (
    queue_date,
    token_number,
    customer_id,
    source,
    selection_mode,
    assigned_staff_id,
    status,
    is_demo
  )
  VALUES (
    v_today_ist,
    v_next_token,
    v_appt.customer_id,
    'online',
    v_appt.selection_mode,
    v_appt.assigned_staff_id,
    'Waiting',
    v_appt.is_demo
  )
  RETURNING * INTO v_entry;

  FOR v_svc IN
    SELECT s.service_id, s.position, s.service_name_en_snapshot, s.service_name_gu_snapshot,
           s.duration_minutes_snapshot, s.price_inr_snapshot
    FROM public.appointment_services AS s
    WHERE s.appointment_id = v_appt.id
    ORDER BY s.position ASC
  LOOP
    INSERT INTO public.queue_entry_services (
      queue_entry_id,
      service_id,
      position,
      service_name_en_snapshot,
      service_name_gu_snapshot,
      duration_minutes_snapshot,
      price_inr_snapshot
    )
    VALUES (
      v_entry.id,
      v_svc.service_id,
      v_svc.position,
      v_svc.service_name_en_snapshot,
      v_svc.service_name_gu_snapshot,
      v_svc.duration_minutes_snapshot,
      v_svc.price_inr_snapshot
    );
  END LOOP;

  UPDATE public.appointments
  SET status = 'Checked In',
      checked_in_at = pg_catalog.now(),
      queue_entry_id = v_entry.id
  WHERE id = v_appt.id;

  RETURN pg_catalog.jsonb_build_object(
    'success', TRUE,
    'data', pg_catalog.jsonb_build_object(
      'appointment_id', v_appt.id,
      'reference_code', v_appt.reference_code,
      'entry_id', v_entry.id,
      'token_number', v_entry.token_number,
      'token_display', v_entry.token_display,
      'assigned_staff_id', v_entry.assigned_staff_id,
      'queue_date', v_entry.queue_date
    ),
    'message', pg_catalog.format('Checked in appointment %s as token %s.', v_appt.reference_code, v_entry.token_display)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Atomic RPC: public.mark_appointment_no_show
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_appointment_no_show(
  p_appointment_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_appt public.appointments%ROWTYPE;
BEGIN
  IF p_appointment_id IS NULL THEN
    RAISE EXCEPTION 'APPOINTMENT_ID_REQUIRED: Appointment ID is required.'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_appt
  FROM public.appointments AS a
  WHERE a.id = p_appointment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'APPOINTMENT_NOT_FOUND: Appointment not found.'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_appt.status NOT IN ('Booked', 'Confirmed') THEN
    RAISE EXCEPTION 'APPOINTMENT_NOSHOW_NOT_ALLOWED: Only Booked or Confirmed appointments can be marked No Show.'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.appointments
  SET status = 'No Show',
      no_show_at = pg_catalog.now()
  WHERE id = v_appt.id
  RETURNING * INTO v_appt;

  RETURN pg_catalog.jsonb_build_object(
    'success', TRUE,
    'data', pg_catalog.jsonb_build_object(
      'appointment_id', v_appt.id,
      'reference_code', v_appt.reference_code,
      'appointment_date', v_appt.appointment_date,
      'assigned_staff_id', v_appt.assigned_staff_id,
      'status', v_appt.status
    ),
    'message', 'Appointment marked as No Show.'
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. Restrict RPC Execution Strictly to service_role
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.sync_appointment_on_queue_complete() FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.book_appointment(TEXT, TEXT, DATE, TIME, UUID[], TEXT, UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.book_appointment(TEXT, TEXT, DATE, TIME, UUID[], TEXT, UUID, BOOLEAN) TO service_role;

REVOKE ALL ON FUNCTION public.cancel_appointment(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_appointment(UUID, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.check_in_appointment(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_in_appointment(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.mark_appointment_no_show(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_appointment_no_show(UUID) TO service_role;
