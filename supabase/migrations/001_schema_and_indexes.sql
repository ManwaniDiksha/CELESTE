-- CELESTE — Salon Queue Management System
-- Migration 001: Core Schema, Constraints, Indexes, and Daily Statistics View
-- Source of Truth: docs/04-database-design.md

-- ---------------------------------------------------------------------------
-- 1. public.services
-- ---------------------------------------------------------------------------
CREATE TABLE public.services (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  service_key TEXT NOT NULL
    CONSTRAINT uq_services_service_key UNIQUE
    CONSTRAINT chk_services_service_key_format CHECK (service_key ~ '^[a-z0-9-]+$'),
  category TEXT NOT NULL
    CONSTRAINT chk_services_category CHECK (
      category IN ('Hair', 'Beard & Grooming', 'Skin', 'Hands & Feet')
    ),
  name_en TEXT NOT NULL
    CONSTRAINT chk_services_name_en_nonempty CHECK (pg_catalog.char_length(pg_catalog.btrim(name_en)) > 0),
  name_gu TEXT NOT NULL
    CONSTRAINT chk_services_name_gu_nonempty CHECK (pg_catalog.char_length(pg_catalog.btrim(name_gu)) > 0),
  duration_minutes INTEGER NOT NULL
    CONSTRAINT chk_services_duration_positive CHECK (duration_minutes > 0),
  price_inr INTEGER NOT NULL
    CONSTRAINT chk_services_price_nonnegative CHECK (price_inr >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

CREATE INDEX idx_services_active_order
  ON public.services (is_active, category, display_order);

-- ---------------------------------------------------------------------------
-- 2. public.staff
-- ---------------------------------------------------------------------------
CREATE TABLE public.staff (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  slug TEXT NOT NULL
    CONSTRAINT uq_staff_slug UNIQUE
    CONSTRAINT chk_staff_slug_format CHECK (slug ~ '^[a-z0-9-]+$'),
  name_en TEXT NOT NULL
    CONSTRAINT chk_staff_name_en_nonempty CHECK (pg_catalog.char_length(pg_catalog.btrim(name_en)) > 0),
  name_gu TEXT NOT NULL
    CONSTRAINT chk_staff_name_gu_nonempty CHECK (pg_catalog.char_length(pg_catalog.btrim(name_gu)) > 0),
  role_en TEXT NOT NULL
    CONSTRAINT chk_staff_role_en_nonempty CHECK (pg_catalog.char_length(pg_catalog.btrim(role_en)) > 0),
  role_gu TEXT NOT NULL
    CONSTRAINT chk_staff_role_gu_nonempty CHECK (pg_catalog.char_length(pg_catalog.btrim(role_gu)) > 0),
  speciality_en TEXT NOT NULL
    CONSTRAINT chk_staff_speciality_en_nonempty CHECK (pg_catalog.char_length(pg_catalog.btrim(speciality_en)) > 0),
  speciality_gu TEXT NOT NULL
    CONSTRAINT chk_staff_speciality_gu_nonempty CHECK (pg_catalog.char_length(pg_catalog.btrim(speciality_gu)) > 0),
  avatar_url TEXT NULL,
  is_on_duty BOOLEAN NOT NULL DEFAULT TRUE,
  availability_status TEXT NOT NULL DEFAULT 'Available'
    CONSTRAINT chk_staff_availability_status CHECK (
      availability_status IN ('Available', 'Busy', 'On Break')
    ),
  available_since TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

CREATE INDEX idx_staff_duty_avail
  ON public.staff (is_on_duty, availability_status, available_since);

-- ---------------------------------------------------------------------------
-- 3. public.staff_services
-- ---------------------------------------------------------------------------
CREATE TABLE public.staff_services (
  staff_id UUID NOT NULL
    CONSTRAINT fk_staff_services_staff
    REFERENCES public.staff (id) ON DELETE CASCADE ON UPDATE CASCADE,
  service_id UUID NOT NULL
    CONSTRAINT fk_staff_services_service
    REFERENCES public.services (id) ON DELETE CASCADE ON UPDATE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT pk_staff_services PRIMARY KEY (staff_id, service_id)
);

CREATE INDEX idx_staff_services_service
  ON public.staff_services (service_id, staff_id);

-- ---------------------------------------------------------------------------
-- 4. public.customers (Private PII)
-- ---------------------------------------------------------------------------
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  name TEXT NOT NULL
    CONSTRAINT chk_customers_name_nonempty CHECK (pg_catalog.char_length(pg_catalog.btrim(name)) > 0),
  phone TEXT NOT NULL
    CONSTRAINT uq_customers_phone UNIQUE
    CONSTRAINT chk_customers_phone_digits CHECK (phone ~ '^[0-9]{10}$'),
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

-- ---------------------------------------------------------------------------
-- 5. public.queue_entries
-- ---------------------------------------------------------------------------
CREATE TABLE public.queue_entries (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  queue_date DATE NOT NULL,
  token_number INTEGER NOT NULL
    CONSTRAINT chk_queue_entries_token_positive CHECK (token_number > 0),
  token_display TEXT GENERATED ALWAYS AS (
    'S-' || CASE
      WHEN token_number < 100 THEN pg_catalog.lpad(token_number::TEXT, 2, '0')
      ELSE token_number::TEXT
    END
  ) STORED,
  customer_id UUID NOT NULL
    CONSTRAINT fk_queue_entries_customer
    REFERENCES public.customers (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  source TEXT NOT NULL
    CONSTRAINT chk_queue_entries_source CHECK (source IN ('online', 'walk_in')),
  selection_mode TEXT NOT NULL
    CONSTRAINT chk_queue_entries_selection_mode CHECK (selection_mode IN ('specific', 'any_available')),
  assigned_staff_id UUID NOT NULL
    CONSTRAINT fk_queue_entries_staff
    REFERENCES public.staff (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  status TEXT NOT NULL DEFAULT 'Waiting'
    CONSTRAINT chk_queue_entries_status CHECK (
      status IN ('Waiting', 'Called', 'In Chair', 'Done', 'Cancelled', 'No-show')
    ),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  start_coming_at TIMESTAMPTZ NULL,
  called_at TIMESTAMPTZ NULL,
  started_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  cancelled_at TIMESTAMPTZ NULL,
  cancelled_by TEXT NULL
    CONSTRAINT chk_queue_entries_cancelled_by CHECK (
      cancelled_by IN ('customer', 'reception', 'system')
    ),
  no_show_at TIMESTAMPTZ NULL,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),

  CONSTRAINT uq_queue_entries_date_token UNIQUE (queue_date, token_number),
  CONSTRAINT chk_qe_waiting CHECK (
    status <> 'Waiting' OR (
      called_at IS NULL
      AND started_at IS NULL
      AND completed_at IS NULL
      AND cancelled_at IS NULL
      AND cancelled_by IS NULL
      AND no_show_at IS NULL
    )
  ),
  CONSTRAINT chk_qe_called CHECK (
    status <> 'Called' OR (
      called_at IS NOT NULL
      AND started_at IS NULL
      AND completed_at IS NULL
      AND cancelled_at IS NULL
      AND cancelled_by IS NULL
      AND no_show_at IS NULL
    )
  ),
  CONSTRAINT chk_qe_in_chair CHECK (
    status <> 'In Chair' OR (
      called_at IS NOT NULL
      AND started_at IS NOT NULL
      AND completed_at IS NULL
      AND cancelled_at IS NULL
      AND cancelled_by IS NULL
      AND no_show_at IS NULL
    )
  ),
  CONSTRAINT chk_qe_done CHECK (
    status <> 'Done' OR (
      called_at IS NOT NULL
      AND started_at IS NOT NULL
      AND completed_at IS NOT NULL
      AND completed_at >= started_at
      AND cancelled_at IS NULL
      AND cancelled_by IS NULL
      AND no_show_at IS NULL
    )
  ),
  CONSTRAINT chk_qe_cancelled CHECK (
    status <> 'Cancelled' OR (
      cancelled_at IS NOT NULL
      AND cancelled_by IS NOT NULL
      AND started_at IS NULL
      AND completed_at IS NULL
      AND no_show_at IS NULL
    )
  ),
  CONSTRAINT chk_qe_no_show CHECK (
    status <> 'No-show' OR (
      called_at IS NOT NULL
      AND no_show_at IS NOT NULL
      AND no_show_at >= called_at + INTERVAL '10 minutes'
      AND started_at IS NULL
      AND completed_at IS NULL
      AND cancelled_at IS NULL
      AND cancelled_by IS NULL
    )
  )
);

CREATE UNIQUE INDEX uq_one_active_entry_per_customer_day
  ON public.queue_entries (queue_date, customer_id)
  WHERE status IN ('Waiting', 'Called', 'In Chair');

CREATE UNIQUE INDEX uq_one_active_chair_per_staff_day
  ON public.queue_entries (queue_date, assigned_staff_id)
  WHERE status IN ('Called', 'In Chair');

CREATE INDEX idx_queue_staff_fcfs
  ON public.queue_entries (queue_date, assigned_staff_id, status, joined_at, token_number);

CREATE INDEX idx_queue_date_status_joined
  ON public.queue_entries (queue_date, status, joined_at);

CREATE INDEX idx_queue_online_capacity
  ON public.queue_entries (queue_date, source)
  WHERE status <> 'Cancelled';

CREATE INDEX idx_queue_demo_date
  ON public.queue_entries (queue_date)
  WHERE is_demo = TRUE;

-- ---------------------------------------------------------------------------
-- 6. public.queue_entry_services
-- ---------------------------------------------------------------------------
CREATE TABLE public.queue_entry_services (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  queue_entry_id UUID NOT NULL
    CONSTRAINT fk_qes_queue_entry
    REFERENCES public.queue_entries (id) ON DELETE CASCADE ON UPDATE CASCADE,
  service_id UUID NOT NULL
    CONSTRAINT fk_qes_service
    REFERENCES public.services (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  position SMALLINT NOT NULL
    CONSTRAINT chk_qes_position_range CHECK (position BETWEEN 1 AND 3),
  service_name_en_snapshot TEXT NOT NULL,
  service_name_gu_snapshot TEXT NOT NULL,
  duration_minutes_snapshot INTEGER NOT NULL
    CONSTRAINT chk_qes_duration_positive CHECK (duration_minutes_snapshot > 0),
  price_inr_snapshot INTEGER NOT NULL
    CONSTRAINT chk_qes_price_nonnegative CHECK (price_inr_snapshot >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),

  CONSTRAINT uq_qes_entry_position UNIQUE (queue_entry_id, position),
  CONSTRAINT uq_qes_entry_service UNIQUE (queue_entry_id, service_id)
);

CREATE INDEX idx_qes_service_id
  ON public.queue_entry_services (service_id);

-- ---------------------------------------------------------------------------
-- 7. public.queue_status_history (Private Audit Trail)
-- ---------------------------------------------------------------------------
CREATE TABLE public.queue_status_history (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  queue_entry_id UUID NOT NULL
    CONSTRAINT fk_qsh_queue_entry
    REFERENCES public.queue_entries (id) ON DELETE CASCADE ON UPDATE CASCADE,
  from_status TEXT NULL
    CONSTRAINT chk_qsh_from_status CHECK (
      from_status IN ('Waiting', 'Called', 'In Chair', 'Done', 'Cancelled', 'No-show')
    ),
  to_status TEXT NOT NULL
    CONSTRAINT chk_qsh_to_status CHECK (
      to_status IN ('Waiting', 'Called', 'In Chair', 'Done', 'Cancelled', 'No-show')
    ),
  changed_by_role TEXT NOT NULL
    CONSTRAINT chk_qsh_changed_by_role CHECK (
      changed_by_role IN ('customer', 'reception', 'staff', 'owner', 'system')
    ),
  changed_by_ref TEXT NULL,
  note TEXT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

CREATE INDEX idx_qsh_entry_time
  ON public.queue_status_history (queue_entry_id, changed_at DESC);

-- ---------------------------------------------------------------------------
-- 8. public.salon_settings (Singleton)
-- ---------------------------------------------------------------------------
CREATE TABLE public.salon_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1
    CONSTRAINT chk_salon_settings_singleton CHECK (id = 1),
  salon_name TEXT NOT NULL DEFAULT 'CELESTE',
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  operating_hours JSONB NOT NULL
    CONSTRAINT chk_salon_settings_operating_hours_object CHECK (
      pg_catalog.jsonb_typeof(operating_hours) = 'object'
    ),
  is_online_queue_open BOOLEAN NOT NULL DEFAULT TRUE,
  daily_online_capacity INTEGER NOT NULL DEFAULT 30
    CONSTRAINT chk_salon_settings_daily_capacity CHECK (daily_online_capacity >= 0),
  online_cutoff_minutes INTEGER NOT NULL DEFAULT 30
    CONSTRAINT chk_salon_settings_online_cutoff CHECK (online_cutoff_minutes >= 0),
  no_show_window_minutes INTEGER NOT NULL DEFAULT 10
    CONSTRAINT chk_salon_settings_no_show_window CHECK (no_show_window_minutes = 10),
  max_services_per_entry SMALLINT NOT NULL DEFAULT 3
    CONSTRAINT chk_salon_settings_max_services CHECK (max_services_per_entry = 3),
  last_cleanup_date DATE NULL,
  last_staff_init_date DATE NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

-- ---------------------------------------------------------------------------
-- 9. public.pin_auth_attempts (Private Brute-Force Protection)
-- ---------------------------------------------------------------------------
CREATE TABLE public.pin_auth_attempts (
  ip_key TEXT PRIMARY KEY,
  failed_count INTEGER NOT NULL DEFAULT 0
    CONSTRAINT chk_pin_auth_failed_count CHECK (failed_count >= 0),
  first_failed_at TIMESTAMPTZ NULL,
  locked_until TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

-- ---------------------------------------------------------------------------
-- 10. public.daily_queue_statistics (Read-Only View)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.daily_queue_statistics AS
WITH entry_service_totals AS (
  SELECT
    qes.queue_entry_id,
    COUNT(*) AS service_count,
    COALESCE(SUM(qes.price_inr_snapshot), 0) AS total_price_inr
  FROM public.queue_entry_services AS qes
  GROUP BY qes.queue_entry_id
)
SELECT
  qe.queue_date,
  COUNT(*) AS total_entries,
  COUNT(*) FILTER (WHERE qe.status = 'Waiting') AS waiting_count,
  COUNT(*) FILTER (WHERE qe.status = 'Called') AS called_count,
  COUNT(*) FILTER (WHERE qe.status = 'In Chair') AS in_chair_count,
  COUNT(*) FILTER (WHERE qe.status = 'Done') AS served_count,
  COUNT(*) FILTER (WHERE qe.status = 'Cancelled') AS cancelled_count,
  COUNT(*) FILTER (WHERE qe.status = 'No-show') AS no_show_count,
  COALESCE(SUM(est.service_count) FILTER (WHERE qe.status = 'Done'), 0) AS completed_services_count,
  COALESCE(SUM(est.total_price_inr) FILTER (WHERE qe.status = 'Done'), 0) AS daily_revenue_inr
FROM public.queue_entries AS qe
LEFT JOIN entry_service_totals AS est
  ON est.queue_entry_id = qe.id
GROUP BY qe.queue_date;
