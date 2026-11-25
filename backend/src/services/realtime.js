import { isSupabaseConfigured } from '../config/env.js';
import { getSupabaseClient } from '../config/supabase.js';
import { validateRealtimeBroadcastPayload } from '../utils/validation.js';

export const REALTIME_TOPIC = 'celeste:live';
export const REALTIME_EVENT = 'queue_changed';

/**
 * Broadcasts a zero-PII queue change notification over Supabase Realtime REST API
 * using channel.httpSend(). Validates payload keys strictly to prevent PII leakage
 * and never throws so committed database mutations are never rolled back.
 */
export async function broadcastQueueChanged(payload, { supabaseClient = null, logger = console } = {}) {
  const sanitizedPayload = validateRealtimeBroadcastPayload(payload);

  if (!supabaseClient && !isSupabaseConfigured()) {
    logger?.warn?.('[CELESTE realtime] Skipping broadcast because Supabase is not configured.');
    return { ok: false, reason: 'supabase_unconfigured' };
  }

  const client = supabaseClient || getSupabaseClient();
  const channel = client.channel(REALTIME_TOPIC);

  try {
    const result = await channel.httpSend(REALTIME_EVENT, sanitizedPayload);

    if (!result?.success) {
      logger?.error?.('[CELESTE realtime] Broadcast returned failure status.', {
        topic: REALTIME_TOPIC,
        event: REALTIME_EVENT,
        action: sanitizedPayload.action,
        queue_date: sanitizedPayload.queue_date,
        status: result?.status ?? null,
        error: result?.error ?? 'Unknown httpSend error',
      });
      return {
        ok: false,
        reason: 'http_send_failed',
        status: result?.status ?? null,
      };
    }

    return { ok: true };
  } catch (err) {
    logger?.error?.('[CELESTE realtime] Broadcast threw an unexpected error.', {
      topic: REALTIME_TOPIC,
      event: REALTIME_EVENT,
      action: sanitizedPayload.action,
      queue_date: sanitizedPayload.queue_date,
      error: err?.message || 'Unknown error',
    });
    return {
      ok: false,
      reason: 'exception',
    };
  } finally {
    try {
      await client.removeChannel(channel);
    } catch {
      // Ignore cleanup errors on stateless REST channel teardown.
    }
  }
}
