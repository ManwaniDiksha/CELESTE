import { Router } from 'express';
import { isSupabaseConfigured } from '../config/env.js';
import { getSupabaseClient } from '../config/supabase.js';
import { requireReceptionAuth } from '../middleware/auth.js';
import { listAppointmentsData } from '../services/appointmentService.js';
import {
  getIstClock,
  getReceptionDashboardData,
  getReceptionEntryDetails,
  mapQueueRpcError,
} from '../services/queueService.js';
import { broadcastQueueChanged } from '../services/realtime.js';
import {
  isValidUuid,
  validateCorrectQueueEntryBody,
  validateExplicitConfirmation,
  validateJoinQueueBody,
  validateStaffAvailabilityBody,
  validateStaffIdBody,
} from '../utils/validation.js';

export function createReceptionRouter({
  getSupabase = getSupabaseClient,
  isConfigured = isSupabaseConfigured,
  broadcast = broadcastQueueChanged,
  requireAuth = requireReceptionAuth,
} = {}) {
  const router = Router();
  router.use(requireAuth);

  router.get('/dashboard', async (_req, res) => {
    if (!isConfigured()) {
      return res.status(503).json({ success: false, error: 'Database service is not configured.' });
    }

    try {
      const data = await getReceptionDashboardData(getSupabase());
      return res.status(200).json({ success: true, data });
    } catch (err) {
      console.error('[CELESTE reception] GET /dashboard failed:', err?.message || 'Unknown error');
      return res.status(503).json({ success: false, error: 'Unable to load reception dashboard right now.' });
    }
  });

  router.get('/entries/:id', async (req, res) => {
    const entryId = req.params?.id;
    if (!isValidUuid(entryId)) {
      return res.status(400).json({ success: false, error: 'Invalid queue entry identifier.' });
    }
    if (!isConfigured()) {
      return res.status(503).json({ success: false, error: 'Database service is not configured.' });
    }

    try {
      const entry = await getReceptionEntryDetails(getSupabase(), entryId.trim().toLowerCase());
      if (!entry) {
        return res.status(404).json({ success: false, error: 'Queue entry not found.' });
      }
      return res.status(200).json({ success: true, data: entry });
    } catch (err) {
      console.error('[CELESTE reception] GET /entries/:id failed:', err?.message || 'Unknown error');
      return res.status(503).json({ success: false, error: 'Unable to load queue entry details right now.' });
    }
  });

  router.post('/walk-in', async (req, res) => {
    if (!isConfigured()) {
      return res.status(503).json({ success: false, error: 'Database service is not configured.' });
    }

    const parsed = validateJoinQueueBody(req.body);
    if (!parsed.ok) {
      return res.status(400).json({ success: false, error: parsed.error });
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
        p_source: 'walk_in',
        p_is_demo: false,
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
          queue_date: rpcRes.data.queue_date || getIstClock().date,
          staff_id: rpcRes.data.assigned_staff_id || null,
          action: 'walk_in_joined',
        },
        { supabaseClient: supabase }
      );

      return res.status(201).json({
        success: true,
        data: rpcRes.data,
        message: rpcRes.message || 'Walk-in added to queue.',
      });
    } catch (err) {
      console.error('[CELESTE reception] POST /walk-in failed:', err?.message || 'Unknown error');
      return res.status(503).json({ success: false, error: 'Unable to register walk-in right now.' });
    }
  });

  router.post('/call-next', async (req, res) => {
    if (!isConfigured()) {
      return res.status(503).json({ success: false, error: 'Database service is not configured.' });
    }

    const parsed = validateStaffIdBody(req.body);
    if (!parsed.ok) {
      return res.status(400).json({ success: false, error: parsed.error });
    }

    const { staffId } = parsed.value;
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
          staff_id: rpcRes.data.assigned_staff_id || staffId,
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
      console.error('[CELESTE reception] POST /call-next failed:', err?.message || 'Unknown error');
      return res.status(503).json({ success: false, error: 'Unable to call next customer right now.' });
    }
  });

  router.post('/entries/:id/start', async (req, res) => {
    const entryId = req.params?.id;
    if (!isValidUuid(entryId)) {
      return res.status(400).json({ success: false, error: 'Invalid queue entry identifier.' });
    }
    if (!isConfigured()) {
      return res.status(503).json({ success: false, error: 'Database service is not configured.' });
    }

    const normalizedId = entryId.trim().toLowerCase();
    const supabase = getSupabase();

    try {
      const { data: entry, error: lookupErr } = await supabase
        .from('queue_entries')
        .select('id, queue_date, assigned_staff_id')
        .eq('id', normalizedId)
        .maybeSingle();

      if (lookupErr) {
        return res.status(503).json({ success: false, error: 'Unable to load queue entry right now.' });
      }
      if (!entry) {
        return res.status(404).json({ success: false, error: 'Queue entry not found.' });
      }

      const { data: rpcRes, error: rpcErr } = await supabase.rpc('start_service_with_actor', {
        p_staff_id: entry.assigned_staff_id,
        p_entry_id: normalizedId,
        p_actor_role: 'reception',
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
          staff_id: rpcRes.data.assigned_staff_id || entry.assigned_staff_id,
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
      console.error('[CELESTE reception] POST /entries/:id/start failed:', err?.message || 'Unknown error');
      return res.status(503).json({ success: false, error: 'Unable to start service right now.' });
    }
  });

  router.post('/entries/:id/complete', async (req, res) => {
    const entryId = req.params?.id;
    if (!isValidUuid(entryId)) {
      return res.status(400).json({ success: false, error: 'Invalid queue entry identifier.' });
    }
    if (!isConfigured()) {
      return res.status(503).json({ success: false, error: 'Database service is not configured.' });
    }

    const normalizedId = entryId.trim().toLowerCase();
    const supabase = getSupabase();

    try {
      const { data: entry, error: lookupErr } = await supabase
        .from('queue_entries')
        .select('id, queue_date, assigned_staff_id')
        .eq('id', normalizedId)
        .maybeSingle();

      if (lookupErr) {
        return res.status(503).json({ success: false, error: 'Unable to load queue entry right now.' });
      }
      if (!entry) {
        return res.status(404).json({ success: false, error: 'Queue entry not found.' });
      }

      const { data: rpcRes, error: rpcErr } = await supabase.rpc('complete_service_with_actor', {
        p_staff_id: entry.assigned_staff_id,
        p_entry_id: normalizedId,
        p_actor_role: 'reception',
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
          staff_id: rpcRes.data.assigned_staff_id || entry.assigned_staff_id,
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
      console.error('[CELESTE reception] POST /entries/:id/complete failed:', err?.message || 'Unknown error');
      return res.status(503).json({ success: false, error: 'Unable to complete service right now.' });
    }
  });

  router.post('/entries/:id/no-show', async (req, res) => {
    const entryId = req.params?.id;
    if (!isValidUuid(entryId)) {
      return res.status(400).json({ success: false, error: 'Invalid queue entry identifier.' });
    }
    if (!isConfigured()) {
      return res.status(503).json({ success: false, error: 'Database service is not configured.' });
    }

    const normalizedId = entryId.trim().toLowerCase();
    const supabase = getSupabase();

    try {
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
      console.error('[CELESTE reception] POST /entries/:id/no-show failed:', err?.message || 'Unknown error');
      return res.status(503).json({ success: false, error: 'Unable to mark No-show right now.' });
    }
  });

  router.post('/entries/:id/cancel', async (req, res) => {
    const entryId = req.params?.id;
    if (!isValidUuid(entryId)) {
      return res.status(400).json({ success: false, error: 'Invalid queue entry identifier.' });
    }

    const confirmation = validateExplicitConfirmation(req.body);
    if (!confirmation.ok) {
      return res.status(400).json({ success: false, error: confirmation.error });
    }

    if (!isConfigured()) {
      return res.status(503).json({ success: false, error: 'Database service is not configured.' });
    }

    const normalizedId = entryId.trim().toLowerCase();
    const supabase = getSupabase();

    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('cancel_queue_entry', {
        p_entry_id: normalizedId,
        p_actor_role: 'reception',
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
      console.error('[CELESTE reception] POST /entries/:id/cancel failed:', err?.message || 'Unknown error');
      return res.status(503).json({ success: false, error: 'Unable to cancel queue entry right now.' });
    }
  });

  router.patch('/staff/:staffId/availability', async (req, res) => {
    const staffId = req.params?.staffId;
    if (!isValidUuid(staffId)) {
      return res.status(400).json({ success: false, error: 'Invalid staff identifier.' });
    }

    const parsed = validateStaffAvailabilityBody(req.body);
    if (!parsed.ok) {
      return res.status(400).json({ success: false, error: parsed.error });
    }

    if (!isConfigured()) {
      return res.status(503).json({ success: false, error: 'Database service is not configured.' });
    }

    const normalizedStaffId = staffId.trim().toLowerCase();
    const supabase = getSupabase();

    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('set_staff_availability', {
        p_staff_id: normalizedStaffId,
        p_status: parsed.value.status,
        p_actor_role: 'reception',
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
          staff_id: normalizedStaffId,
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
      console.error('[CELESTE reception] PATCH /staff/:staffId/availability failed:', err?.message || 'Unknown error');
      return res.status(503).json({ success: false, error: 'Unable to update staff availability right now.' });
    }
  });

  router.patch('/entries/:id', async (req, res) => {
    const entryId = req.params?.id;
    if (!isValidUuid(entryId)) {
      return res.status(400).json({ success: false, error: 'Invalid queue entry identifier.' });
    }

    const parsed = validateCorrectQueueEntryBody(req.body);
    if (!parsed.ok) {
      return res.status(400).json({ success: false, error: parsed.error });
    }

    if (!isConfigured()) {
      return res.status(503).json({ success: false, error: 'Database service is not configured.' });
    }

    const normalizedId = entryId.trim().toLowerCase();
    const supabase = getSupabase();

    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('correct_queue_entry', {
        p_entry_id: normalizedId,
        p_customer_name: parsed.value.name,
        p_service_ids: parsed.value.serviceIds,
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
          queue_date: rpcRes.data.queue_date || getIstClock().date,
          staff_id: rpcRes.data.assigned_staff_id || null,
          action: 'queue_entry_corrected',
        },
        { supabaseClient: supabase }
      );

      return res.status(200).json({
        success: true,
        data: rpcRes.data,
        message: rpcRes.message || 'Queue entry updated successfully.',
      });
    } catch (err) {
      console.error('[CELESTE reception] PATCH /entries/:id failed:', err?.message || 'Unknown error');
      return res.status(503).json({ success: false, error: 'Unable to update queue entry right now.' });
    }
  });

  router.get('/appointments', requireAuth, async (_req, res) => {
    if (!isConfigured()) {
      return res.status(503).json({ success: false, error: 'Database service is not configured.' });
    }
    try {
      const data = await listAppointmentsData(getSupabase(), { includePii: true });
      return res.status(200).json({ success: true, data });
    } catch (err) {
      console.error('[CELESTE reception] GET /appointments failed:', err?.message || 'Unknown error');
      return res.status(503).json({ success: false, error: 'Unable to load appointments right now.' });
    }
  });

  router.post('/appointments/:id/check-in', requireAuth, async (req, res) => {
    const apptId = req.params?.id;
    if (!isValidUuid(apptId)) {
      return res.status(400).json({ success: false, error: 'Invalid appointment identifier.' });
    }
    if (!isConfigured()) {
      return res.status(503).json({ success: false, error: 'Database service is not configured.' });
    }

    const supabase = getSupabase();
    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('check_in_appointment', {
        p_appointment_id: apptId.trim().toLowerCase(),
      });
      if (rpcErr || !rpcRes?.success || !rpcRes?.data?.entry_id) {
        if (rpcErr) {
          const mapped = mapQueueRpcError(rpcErr);
          return res.status(mapped.status).json({ success: false, code: mapped.code, error: mapped.message });
        }
        return res.status(503).json({ success: false, error: 'Unable to check in appointment.' });
      }

      await broadcast(
        {
          queue_date: rpcRes.data.queue_date || getIstClock().date,
          staff_id: rpcRes.data.assigned_staff_id || null,
          action: 'appointment_checked_in',
        },
        { supabaseClient: supabase }
      );

      return res.status(200).json({
        success: true,
        data: rpcRes.data,
        message: rpcRes.message || 'Appointment checked in.',
      });
    } catch (err) {
      console.error('[CELESTE reception] POST /appointments/:id/check-in failed:', err?.message || 'Unknown error');
      return res.status(503).json({ success: false, error: 'Unable to check in appointment right now.' });
    }
  });

  router.post('/appointments/:id/cancel', requireAuth, async (req, res) => {
    const apptId = req.params?.id;
    if (!isValidUuid(apptId)) {
      return res.status(400).json({ success: false, error: 'Invalid appointment identifier.' });
    }
    const confirmation = validateExplicitConfirmation(req.body);
    if (!confirmation.ok) {
      return res.status(400).json({ success: false, error: confirmation.error });
    }
    if (!isConfigured()) {
      return res.status(503).json({ success: false, error: 'Database service is not configured.' });
    }

    const supabase = getSupabase();
    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('cancel_appointment', {
        p_appointment_id: apptId.trim().toLowerCase(),
        p_actor_role: 'reception',
      });
      if (rpcErr || !rpcRes?.success) {
        if (rpcErr) {
          const mapped = mapQueueRpcError(rpcErr);
          return res.status(mapped.status).json({ success: false, code: mapped.code, error: mapped.message });
        }
        return res.status(503).json({ success: false, error: 'Unable to cancel appointment.' });
      }

      await broadcast(
        {
          queue_date: rpcRes.data.appointment_date || getIstClock().date,
          staff_id: rpcRes.data.assigned_staff_id || null,
          action: 'appointment_cancelled',
        },
        { supabaseClient: supabase }
      );

      return res.status(200).json({
        success: true,
        data: rpcRes.data,
        message: rpcRes.message || 'Appointment cancelled.',
      });
    } catch (err) {
      console.error('[CELESTE reception] POST /appointments/:id/cancel failed:', err?.message || 'Unknown error');
      return res.status(503).json({ success: false, error: 'Unable to cancel appointment right now.' });
    }
  });

  router.post('/appointments/:id/no-show', requireAuth, async (req, res) => {
    const apptId = req.params?.id;
    if (!isValidUuid(apptId)) {
      return res.status(400).json({ success: false, error: 'Invalid appointment identifier.' });
    }
    if (!isConfigured()) {
      return res.status(503).json({ success: false, error: 'Database service is not configured.' });
    }

    const supabase = getSupabase();
    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('mark_appointment_no_show', {
        p_appointment_id: apptId.trim().toLowerCase(),
      });
      if (rpcErr || !rpcRes?.success) {
        if (rpcErr) {
          const mapped = mapQueueRpcError(rpcErr);
          return res.status(mapped.status).json({ success: false, code: mapped.code, error: mapped.message });
        }
        return res.status(503).json({ success: false, error: 'Unable to mark appointment No Show.' });
      }

      await broadcast(
        {
          queue_date: rpcRes.data.appointment_date || getIstClock().date,
          staff_id: rpcRes.data.assigned_staff_id || null,
          action: 'appointment_no_show',
        },
        { supabaseClient: supabase }
      );

      return res.status(200).json({
        success: true,
        data: rpcRes.data,
        message: rpcRes.message || 'Appointment marked as No Show.',
      });
    } catch (err) {
      console.error('[CELESTE reception] POST /appointments/:id/no-show failed:', err?.message || 'Unknown error');
      return res.status(503).json({ success: false, error: 'Unable to mark appointment No Show right now.' });
    }
  });

  return router;
}

export default createReceptionRouter();
