-- ============================================================================
-- CELESTE — Salon Queue Management System
-- Migration 005: Atomic PIN Authentication Rate-Limiting RPCs
-- Source of Truth:
--   - supabase/migrations/001_schema_and_indexes.sql (public.pin_auth_attempts)
--   - supabase/migrations/002_queue_functions.sql (SECURITY DEFINER pattern)
--   - docs/04-database-design.md (Section 2.9 & Section 6.3)
--
-- Scope & Security:
--   - Does NOT modify public.pin_auth_attempts or any existing table/trigger.
--   - Implements 3 SECURITY DEFINER SET search_path = '' functions using
--     PostgreSQL's transaction clock (pg_catalog.now()) and single-statement
--     INSERT ... ON CONFLICT (ip_key) DO UPDATE for concurrency safety.
--   - Restricted strictly to service_role (no PUBLIC, anon, or authenticated
--     EXECUTE privileges).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. public.check_pin_auth_lockout(p_ip_key TEXT)
--    Reads current lockout and active failure-window status using the database
--    clock without mutating rows.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_pin_auth_lockout(p_ip_key TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ip_key       TEXT;
  v_now          TIMESTAMPTZ := pg_catalog.now();
  v_row          public.pin_auth_attempts%ROWTYPE;
  v_is_locked    BOOLEAN := FALSE;
  v_failed_count INTEGER := 0;
  v_first_failed TIMESTAMPTZ := NULL;
  v_locked_until TIMESTAMPTZ := NULL;
  v_retry_secs   INTEGER := 0;
BEGIN
  v_ip_key := pg_catalog.btrim(COALESCE(p_ip_key, ''));
  IF pg_catalog.char_length(v_ip_key) = 0 THEN
    RAISE EXCEPTION 'INVALID_IP_KEY: p_ip_key must not be blank.'
      USING ERRCODE = '22023';
  END IF;

  SELECT a.*
  INTO v_row
  FROM public.pin_auth_attempts AS a
  WHERE a.ip_key = v_ip_key;

  IF FOUND THEN
    IF v_row.locked_until IS NOT NULL AND v_row.locked_until > v_now THEN
      v_is_locked := TRUE;
      v_failed_count := v_row.failed_count;
      v_first_failed := v_row.first_failed_at;
      v_locked_until := v_row.locked_until;
      v_retry_secs := GREATEST(
        1,
        CEIL(EXTRACT(EPOCH FROM (v_row.locked_until - v_now)))::INTEGER
      );
    ELSIF v_row.locked_until IS NULL
      AND v_row.first_failed_at IS NOT NULL
      AND v_now < v_row.first_failed_at + INTERVAL '15 minutes' THEN
      v_failed_count := v_row.failed_count;
      v_first_failed := v_row.first_failed_at;
    END IF;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', TRUE,
    'data', pg_catalog.jsonb_build_object(
      'ip_key', v_ip_key,
      'is_locked', v_is_locked,
      'failed_count', v_failed_count,
      'max_attempts', 5,
      'remaining_attempts', GREATEST(0, 5 - v_failed_count),
      'first_failed_at', v_first_failed,
      'locked_until', v_locked_until,
      'retry_after_seconds', v_retry_secs
    ),
    'message', CASE
      WHEN v_is_locked THEN 'PIN authentication is temporarily locked.'
      ELSE 'PIN authentication is permitted.'
    END
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. public.record_pin_auth_failure(p_ip_key TEXT)
--    Atomically records a failed PIN attempt using a single PostgreSQL
--    INSERT ... ON CONFLICT (ip_key) DO UPDATE statement and
--    pg_catalog.clock_timestamp() evaluated after conflict resolution:
--      - Active lockout (locked_until > clk.ts): preserved without extending lock.
--      - Expired lockout OR expired 15-min window: resets to failed_count = 1.
--      - Active window (< 15 min): increments failed_count atomically.
--      - 5th failure within 15 min: sets locked_until = clk.ts + 15 minutes.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_pin_auth_failure(p_ip_key TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ip_key     TEXT;
  v_now        TIMESTAMPTZ;
  v_row        public.pin_auth_attempts%ROWTYPE;
  v_is_locked  BOOLEAN := FALSE;
  v_retry_secs INTEGER := 0;
BEGIN
  v_ip_key := pg_catalog.btrim(COALESCE(p_ip_key, ''));
  IF pg_catalog.char_length(v_ip_key) = 0 THEN
    RAISE EXCEPTION 'INVALID_IP_KEY: p_ip_key must not be blank.'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.pin_auth_attempts AS a (
    ip_key,
    failed_count,
    first_failed_at,
    locked_until
  )
  VALUES (
    v_ip_key,
    1,
    pg_catalog.clock_timestamp(),
    NULL
  )
  ON CONFLICT (ip_key) DO UPDATE
  SET (failed_count, first_failed_at, locked_until) = (
    SELECT
      CASE
        WHEN a.locked_until IS NOT NULL AND a.locked_until > clk.ts
          THEN a.failed_count
        WHEN (a.locked_until IS NOT NULL AND a.locked_until <= clk.ts)
          OR a.first_failed_at IS NULL
          OR clk.ts >= a.first_failed_at + INTERVAL '15 minutes'
          THEN 1
        ELSE a.failed_count + 1
      END,
      CASE
        WHEN a.locked_until IS NOT NULL AND a.locked_until > clk.ts
          THEN a.first_failed_at
        WHEN (a.locked_until IS NOT NULL AND a.locked_until <= clk.ts)
          OR a.first_failed_at IS NULL
          OR clk.ts >= a.first_failed_at + INTERVAL '15 minutes'
          THEN clk.ts
        ELSE a.first_failed_at
      END,
      CASE
        WHEN a.locked_until IS NOT NULL AND a.locked_until > clk.ts
          THEN a.locked_until
        WHEN (a.locked_until IS NOT NULL AND a.locked_until <= clk.ts)
          OR a.first_failed_at IS NULL
          OR clk.ts >= a.first_failed_at + INTERVAL '15 minutes'
          THEN NULL
        WHEN a.failed_count + 1 >= 5
          THEN clk.ts + INTERVAL '15 minutes'
        ELSE NULL
      END
    FROM (SELECT pg_catalog.clock_timestamp() AS ts) AS clk
  )
  RETURNING * INTO v_row;

  v_now := pg_catalog.clock_timestamp();

  IF v_row.locked_until IS NOT NULL AND v_row.locked_until > v_now THEN
    v_is_locked := TRUE;
    v_retry_secs := GREATEST(
      1,
      CEIL(EXTRACT(EPOCH FROM (v_row.locked_until - v_now)))::INTEGER
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', TRUE,
    'data', pg_catalog.jsonb_build_object(
      'ip_key', v_row.ip_key,
      'is_locked', v_is_locked,
      'failed_count', v_row.failed_count,
      'max_attempts', 5,
      'remaining_attempts', CASE
        WHEN v_is_locked THEN 0
        ELSE GREATEST(0, 5 - v_row.failed_count)
      END,
      'first_failed_at', v_row.first_failed_at,
      'locked_until', v_row.locked_until,
      'retry_after_seconds', v_retry_secs
    ),
    'message', CASE
      WHEN v_is_locked THEN 'Too many failed PIN attempts. Locked for 15 minutes.'
      ELSE 'Failed PIN attempt recorded.'
    END
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. public.reset_pin_auth_attempts(p_ip_key TEXT)
--    Atomically resets or preserves lockout state using single-statement
--    INSERT ... ON CONFLICT (ip_key) DO UPDATE ... RETURNING * and
--    pg_catalog.clock_timestamp() evaluated after conflict resolution:
--      - If no row exists: inserts clean row (failed_count = 0, locked_until = NULL)
--        and returns is_locked = FALSE.
--      - If active lockout (locked_until > clk.ts): preserves all lockout fields
--        unchanged and returns is_locked = TRUE so caller refuses session cookie.
--      - If not locked (or lockout expired): clears failure fields and returns
--        is_locked = FALSE.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reset_pin_auth_attempts(p_ip_key TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ip_key     TEXT;
  v_now        TIMESTAMPTZ;
  v_row        public.pin_auth_attempts%ROWTYPE;
  v_is_locked  BOOLEAN := FALSE;
  v_retry_secs INTEGER := 0;
BEGIN
  v_ip_key := pg_catalog.btrim(COALESCE(p_ip_key, ''));
  IF pg_catalog.char_length(v_ip_key) = 0 THEN
    RAISE EXCEPTION 'INVALID_IP_KEY: p_ip_key must not be blank.'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.pin_auth_attempts AS a (ip_key)
  VALUES (v_ip_key)
  ON CONFLICT (ip_key) DO UPDATE
  SET (failed_count, first_failed_at, locked_until) = (
    SELECT
      CASE
        WHEN a.locked_until IS NOT NULL AND a.locked_until > clk.ts
          THEN a.failed_count
        ELSE 0
      END,
      CASE
        WHEN a.locked_until IS NOT NULL AND a.locked_until > clk.ts
          THEN a.first_failed_at
        ELSE NULL
      END,
      CASE
        WHEN a.locked_until IS NOT NULL AND a.locked_until > clk.ts
          THEN a.locked_until
        ELSE NULL
      END
    FROM (SELECT pg_catalog.clock_timestamp() AS ts) AS clk
  )
  RETURNING * INTO v_row;

  v_now := pg_catalog.clock_timestamp();

  IF v_row.locked_until IS NOT NULL AND v_row.locked_until > v_now THEN
    v_is_locked := TRUE;
    v_retry_secs := GREATEST(
      1,
      CEIL(EXTRACT(EPOCH FROM (v_row.locked_until - v_now)))::INTEGER
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', TRUE,
    'data', pg_catalog.jsonb_build_object(
      'ip_key', v_row.ip_key,
      'is_locked', v_is_locked,
      'failed_count', v_row.failed_count,
      'first_failed_at', v_row.first_failed_at,
      'locked_until', v_row.locked_until,
      'retry_after_seconds', v_retry_secs
    ),
    'message', CASE
      WHEN v_is_locked THEN 'PIN authentication is currently locked; failure counters were preserved.'
      ELSE 'PIN failure counters reset.'
    END
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Explicit Function Execution Privileges
--    Revoked from PUBLIC, anon, and authenticated; granted strictly to service_role.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.check_pin_auth_lockout(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_pin_auth_lockout(TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.record_pin_auth_failure(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_pin_auth_failure(TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.reset_pin_auth_attempts(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_pin_auth_attempts(TEXT) TO service_role;
