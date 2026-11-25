import { Router } from 'express';
import { isSupabaseConfigured } from '../config/env.js';
import { getSupabaseClient } from '../config/supabase.js';
import {
  getIstClock,
  getTicketStatus,
  mapQueueRpcError,
} from '../services/queueService.js';
import { broadcastQueueChanged } from '../services/realtime.js';
import {
  isValidUuid,
  validateExplicitConfirmation,
  validateJoinQueueBody,
} from '../utils/validation.js';

export function createQueueRouter({
  getSupabase = getSupabaseClient,
  isConfigured = isSupabaseConfigured,
  broadcast = broadcastQueueChanged,
} = {}) {
  const router = Router();

  /**
   * POST /api/queue/join
   * Registers an online customer via the authoritative join_queue() database RPC.
   */
  router.post('/join', async (req, res) => {
    if (!isConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Database service is not configured.',
      });
    }

    const parsed = validateJoinQueueBody(req.body);
    if (!parsed.ok) {
      return res.status(400).json({
        success: false,
        error: parsed.error,
      });
    }

    const { name, phone, serviceIds, selectionMode, preferredStaffId } = parsed.value;
    const supabase = getSupabase();

    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('join_queue', {
        p_name: name,
        p_phone: phone,
        p_service_ids: serviceIds,
        p_selection_mode: selectionMode,
        p_preferred_staff_id: preferredStaffId,
        p_source: 'online',
        p_is_demo: false,
      });

      if (rpcErr || !rpcRes?.success || !rpcRes?.data?.entry_id) {
        if (rpcErr) {
          const mapped = mapQueueRpcError(rpcErr);
          if (mapped.status >= 500) {
            console.error('[CELESTE queue] join_queue RPC failed:', rpcErr.message);
          }
          return res.status(mapped.status).json({
            success: false,
            code: mapped.code,
            error: mapped.message,
          });
        }

        console.error('[CELESTE queue] Malformed join_queue RPC response');
        return res.status(503).json({
          success: false,
          error: 'Queue service returned an unexpected response.',
        });
      }

      await broadcast(
        {
          queue_date: rpcRes.data.queue_date || getIstClock().date,
          staff_id: rpcRes.data.assigned_staff_id || null,
          action: 'queue_joined',
        },
        { supabaseClient: supabase }
      );

      return res.status(201).json({
        success: true,
        data: {
          entry_id: rpcRes.data.entry_id,
          queue_date: rpcRes.data.queue_date,
          token_number: rpcRes.data.token_number,
          token_display: rpcRes.data.token_display,
          assigned_staff_id: rpcRes.data.assigned_staff_id,
          status: rpcRes.data.status,
          selection_mode: rpcRes.data.selection_mode,
          joined_at: rpcRes.data.joined_at,
          total_duration_minutes: rpcRes.data.total_duration_minutes,
          total_price_inr: rpcRes.data.total_price_inr,
        },
        message: rpcRes.message || 'Joined the queue.',
      });
    } catch (err) {
      console.error('[CELESTE queue] POST /api/queue/join exception:', err?.message || 'Unknown error');
      return res.status(503).json({
        success: false,
        error: 'Unable to join the queue right now. Please try again.',
      });
    }
  });

  /**
   * GET /api/queue/status/:id
   * Returns customer-safe live ticket status (never exposes phone number).
   */
  router.get('/status/:id', async (req, res) => {
    const entryId = req.params?.id;
    if (!isValidUuid(entryId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid queue ticket identifier.',
      });
    }

    if (!isConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Database service is not configured.',
      });
    }

    try {
      const statusData = await getTicketStatus(getSupabase(), entryId.trim().toLowerCase());
      if (!statusData) {
        return res.status(404).json({
          success: false,
          error: 'Queue ticket not found.',
        });
      }

      return res.status(200).json({
        success: true,
        data: statusData,
      });
    } catch (err) {
      console.error('[CELESTE queue] GET /api/queue/status/:id failed:', err?.message || 'Unknown error');
      return res.status(503).json({
        success: false,
        error: 'Unable to load queue status right now.',
      });
    }
  });

  /**
   * POST /api/queue/:id/start-coming
   * Records position-2 arrival acknowledgement via acknowledge_start_coming().
   */
  router.post('/:id/start-coming', async (req, res) => {
    const entryId = req.params?.id;
    if (!isValidUuid(entryId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid queue ticket identifier.',
      });
    }

    if (!isConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Database service is not configured.',
      });
    }

    const normalizedId = entryId.trim().toLowerCase();
    const supabase = getSupabase();

    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('acknowledge_start_coming', {
        p_entry_id: normalizedId,
      });

      if (rpcErr || !rpcRes?.success || !rpcRes?.data?.entry_id) {
        if (rpcErr) {
          const mapped = mapQueueRpcError(rpcErr);
          if (mapped.status >= 500) {
            console.error('[CELESTE queue] acknowledge_start_coming RPC failed:', rpcErr.message);
          }
          return res.status(mapped.status).json({
            success: false,
            code: mapped.code,
            error: mapped.message,
          });
        }

        console.error('[CELESTE queue] Malformed acknowledge_start_coming RPC response');
        return res.status(503).json({
          success: false,
          error: 'Queue service returned an unexpected response.',
        });
      }

      await broadcast(
        {
          queue_date: getIstClock().date,
          staff_id: rpcRes.data.assigned_staff_id || null,
          action: 'start_coming_acknowledged',
        },
        { supabaseClient: supabase }
      );

      return res.status(200).json({
        success: true,
        data: rpcRes.data,
        message: rpcRes.message || 'Customer on the way acknowledgement recorded.',
      });
    } catch (err) {
      console.error('[CELESTE queue] POST /api/queue/:id/start-coming exception:', err?.message || 'Unknown error');
      return res.status(503).json({
        success: false,
        error: 'Unable to record acknowledgement right now.',
      });
    }
  });

  /**
   * POST /api/queue/:id/cancel
   * Cancels a customer Waiting entry using actor role 'customer' after explicit confirmation.
   */
  router.post('/:id/cancel', async (req, res) => {
    const entryId = req.params?.id;
    if (!isValidUuid(entryId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid queue ticket identifier.',
      });
    }

    const confirmation = validateExplicitConfirmation(req.body);
    if (!confirmation.ok) {
      return res.status(400).json({
        success: false,
        error: confirmation.error,
      });
    }

    if (!isConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Database service is not configured.',
      });
    }

    const normalizedId = entryId.trim().toLowerCase();
    const supabase = getSupabase();

    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('cancel_queue_entry', {
        p_entry_id: normalizedId,
        p_actor_role: 'customer',
      });

      if (rpcErr || !rpcRes?.success || !rpcRes?.data?.entry_id) {
        if (rpcErr) {
          const mapped = mapQueueRpcError(rpcErr);
          if (mapped.status >= 500) {
            console.error('[CELESTE queue] cancel_queue_entry RPC failed:', rpcErr.message);
          }
          return res.status(mapped.status).json({
            success: false,
            code: mapped.code,
            error: mapped.message,
          });
        }

        console.error('[CELESTE queue] Malformed cancel_queue_entry RPC response');
        return res.status(503).json({
          success: false,
          error: 'Queue service returned an unexpected response.',
        });
      }

      let queueDate = getIstClock().date;
      const { data: entryRow } = await supabase
        .from('queue_entries')
        .select('queue_date')
        .eq('id', normalizedId)
        .maybeSingle();

      if (entryRow?.queue_date) {
        queueDate = entryRow.queue_date;
      }

      await broadcast(
        {
          queue_date: queueDate,
          staff_id: rpcRes.data.assigned_staff_id || null,
          action: 'queue_cancelled',
        },
        { supabaseClient: supabase }
      );

      return res.status(200).json({
        success: true,
        data: rpcRes.data,
        message: rpcRes.message || 'Queue entry cancelled.',
      });
    } catch (err) {
      console.error('[CELESTE queue] POST /api/queue/:id/cancel exception:', err?.message || 'Unknown error');
      return res.status(503).json({
        success: false,
        error: 'Unable to cancel queue entry right now.',
      });
    }
  });

  return router;
}

export default createQueueRouter();
