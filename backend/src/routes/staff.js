import { Router } from 'express';
import { isSupabaseConfigured } from '../config/env.js';
import { getSupabaseClient } from '../config/supabase.js';
import { requireStaffAuth } from '../middleware/auth.js';
import {
  getIstClock,
  getStaffDashboardData,
  mapQueueRpcError,
} from '../services/queueService.js';
import { broadcastQueueChanged } from '../services/realtime.js';
import { isValidUuid, validateStaffAvailabilityBody } from '../utils/validation.js';

export function createStaffRouter({
  getSupabase = getSupabaseClient,
  isConfigured = isSupabaseConfigured,
  broadcast = broadcastQueueChanged,
  requireAuth = requireStaffAuth,
} = {}) {
  const router = Router();

  router.get('/:slug/dashboard', requireAuth, async (req, res) => {
    if (!isConfigured()) {
      return res.status(503).json({ success: false, error: 'Database service is not configured.' });
    }

    try {
      const data = await getStaffDashboardData(getSupabase(), req.staffMember);
      return res.status(200).json({ success: true, data });
    } catch (err) {
      console.error('[CELESTE staff] GET /:slug/dashboard failed:', err?.message || 'Unknown error');
      return res.status(503).json({ success: false, error: 'Unable to load staff dashboard right now.' });
    }
  });

  router.post('/:slug/call-next', requireAuth, async (req, res) => {
    if (!isConfigured()) {
      return res.status(503).json({ success: false, error: 'Database service is not configured.' });
    }

    const staffId = req.staffMember.id;
    const supabase = getSupabase();

    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('call_next_customer', {
        p_staff_id: staffId,
      });

      if (rpcErr || !rpcRes?.success || !rpcRes?.data?.entry_id) {
        if (rpcErr) {
          const mapped = mapQueueRpcError(rpcErr);
          return res.status(mapped.status).json({ success: false, code: mapped.code, error: mapped.message });
        }
        return res.status(503).json({ success: false, error: 'Queue service returned an unexpected response.' });
      }

      await broadcast(
        {
          queue_date: getIstClock().date,
          staff_id: staffId,
          action: 'customer_called',
        },
        { supabaseClient: supabase }
      );

      return res.status(200).json({
        success: true,
        data: rpcRes.data,
        message: rpcRes.message || 'Next customer called.',
      });
    } catch (err) {
      console.error('[CELESTE staff] POST /:slug/call-next failed:', err?.message || 'Unknown error');
      return res.status(503).json({ success: false, error: 'Unable to call next customer right now.' });
    }
  });

  router.post('/:slug/entries/:id/start', requireAuth, async (req, res) => {
    const entryId = req.params?.id;
    if (!isValidUuid(entryId)) {
      return res.status(400).json({ success: false, error: 'Invalid queue entry identifier.' });
    }
    if (!isConfigured()) {
      return res.status(503).json({ success: false, error: 'Database service is not configured.' });
    }

    const staffId = req.staffMember.id;
    const normalizedId = entryId.trim().toLowerCase();
    const supabase = getSupabase();

    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('start_service', {
        p_staff_id: staffId,
        p_entry_id: normalizedId,
      });

      if (rpcErr || !rpcRes?.success || !rpcRes?.data?.entry_id) {
        if (rpcErr) {
          const mapped = mapQueueRpcError(rpcErr);
          return res.status(mapped.status).json({ success: false, code: mapped.code, error: mapped.message });
        }
        return res.status(503).json({ success: false, error: 'Queue service returned an unexpected response.' });
      }

      await broadcast(
        {
          queue_date: getIstClock().date,
          staff_id: staffId,
          action: 'service_started',
        },
        { supabaseClient: supabase }
      );

      return res.status(200).json({
        success: true,
        data: rpcRes.data,
        message: rpcRes.message || 'Service started.',
      });
    } catch (err) {
      console.error('[CELESTE staff] POST /:slug/entries/:id/start failed:', err?.message || 'Unknown error');
      return res.status(503).json({ success: false, error: 'Unable to start service right now.' });
    }
  });

  router.post('/:slug/entries/:id/complete', requireAuth, async (req, res) => {
    const entryId = req.params?.id;
    if (!isValidUuid(entryId)) {
      return res.status(400).json({ success: false, error: 'Invalid queue entry identifier.' });
    }
    if (!isConfigured()) {
      return res.status(503).json({ success: false, error: 'Database service is not configured.' });
    }

    const staffId = req.staffMember.id;
    const normalizedId = entryId.trim().toLowerCase();
    const supabase = getSupabase();

    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('complete_service', {
        p_staff_id: staffId,
        p_entry_id: normalizedId,
      });

      if (rpcErr || !rpcRes?.success || !rpcRes?.data?.entry_id) {
        if (rpcErr) {
          const mapped = mapQueueRpcError(rpcErr);
          return res.status(mapped.status).json({ success: false, code: mapped.code, error: mapped.message });
        }
        return res.status(503).json({ success: false, error: 'Queue service returned an unexpected response.' });
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
          staff_id: staffId,
          action: 'service_completed',
        },
        { supabaseClient: supabase }
      );

      return res.status(200).json({
        success: true,
        data: rpcRes.data,
        message: rpcRes.message || 'Service completed.',
      });
    } catch (err) {
      console.error('[CELESTE staff] POST /:slug/entries/:id/complete failed:', err?.message || 'Unknown error');
      return res.status(503).json({ success: false, error: 'Unable to complete service right now.' });
    }
  });

  router.post('/:slug/entries/:id/no-show', requireAuth, async (req, res) => {
    const entryId = req.params?.id;
    if (!isValidUuid(entryId)) {
      return res.status(400).json({ success: false, error: 'Invalid queue entry identifier.' });
    }
    if (!isConfigured()) {
      return res.status(503).json({ success: false, error: 'Database service is not configured.' });
    }

    const staffId = req.staffMember.id;
    const normalizedId = entryId.trim().toLowerCase();
    const supabase = getSupabase();

    try {
      // Verify the ticket belongs strictly to the authenticated stylist before invoking mark_no_show
      const { data: entry, error: lookupErr } = await supabase
        .from('queue_entries')
        .select('id, queue_date, assigned_staff_id')
        .eq('id', normalizedId)
        .maybeSingle();

      if (lookupErr) {
        return res.status(503).json({ success: false, error: 'Unable to verify queue entry right now.' });
      }
      if (!entry) {
        return res.status(404).json({ success: false, error: 'Queue entry not found.' });
      }
      if (entry.assigned_staff_id !== staffId) {
        return res.status(403).json({ success: false, error: 'Queue entry is not assigned to this staff member.' });
      }

      const { data: rpcRes, error: rpcErr } = await supabase.rpc('mark_no_show', {
        p_entry_id: normalizedId,
      });

      if (rpcErr || !rpcRes?.success || !rpcRes?.data?.entry_id) {
        if (rpcErr) {
          const mapped = mapQueueRpcError(rpcErr);
          return res.status(mapped.status).json({ success: false, code: mapped.code, error: mapped.message });
        }
        return res.status(503).json({ success: false, error: 'Queue service returned an unexpected response.' });
      }

      await broadcast(
        {
          queue_date: entry.queue_date || getIstClock().date,
          staff_id: staffId,
          action: 'marked_no_show',
        },
        { supabaseClient: supabase }
      );

      return res.status(200).json({
        success: true,
        data: rpcRes.data,
        message: rpcRes.message || 'Queue entry marked as No-show.',
      });
    } catch (err) {
      console.error('[CELESTE staff] POST /:slug/entries/:id/no-show failed:', err?.message || 'Unknown error');
      return res.status(503).json({ success: false, error: 'Unable to mark No-show right now.' });
    }
  });

  router.patch('/:slug/availability', requireAuth, async (req, res) => {
    const parsed = validateStaffAvailabilityBody(req.body);
    if (!parsed.ok) {
      return res.status(400).json({ success: false, error: parsed.error });
    }
    if (!isConfigured()) {
      return res.status(503).json({ success: false, error: 'Database service is not configured.' });
    }

    const staffId = req.staffMember.id;
    const supabase = getSupabase();

    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('set_staff_availability', {
        p_staff_id: staffId,
        p_status: parsed.value.status,
        p_actor_role: 'staff',
      });

      if (rpcErr || !rpcRes?.success || !rpcRes?.data?.staff_id) {
        if (rpcErr) {
          const mapped = mapQueueRpcError(rpcErr);
          return res.status(mapped.status).json({ success: false, code: mapped.code, error: mapped.message });
        }
        return res.status(503).json({ success: false, error: 'Queue service returned an unexpected response.' });
      }

      await broadcast(
        {
          queue_date: getIstClock().date,
          staff_id: staffId,
          action: 'staff_availability_updated',
        },
        { supabaseClient: supabase }
      );

      return res.status(200).json({
        success: true,
        data: rpcRes.data,
        message: rpcRes.message || 'Staff availability updated.',
      });
    } catch (err) {
      console.error('[CELESTE staff] PATCH /:slug/availability failed:', err?.message || 'Unknown error');
      return res.status(503).json({ success: false, error: 'Unable to update availability right now.' });
    }
  });

  return router;
}

export default createStaffRouter();
